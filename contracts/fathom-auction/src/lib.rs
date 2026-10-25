//! Fathom sealed periodic auction for USTRY/USDC (testnet demo).
//!
//! Lifecycle of auction k:
//!   commit window  [.., commit_end)       place_order: commitment + fixed-size deposit
//!   reveal window  [commit_end, reveal_end)  reveal: opening checked against commitment, funding checked
//!   close          now >= reveal_end      close_auction: one uniform price, record payouts, carry standing
//!   settle         any time after         settle: pay out recorded fills and refunds, in batches
//!
//! While auction k reveals, auction k+1 already accepts commitments.
//! What is hidden until the close: price and quantity. Side (deposit token)
//! and deposit size (one of a few fixed sizes) are visible.
#![no_std]
extern crate alloc;

mod clearing;
pub mod commitment;
mod events;
pub mod types;

#[cfg(test)]
mod test;

use alloc::vec::Vec as AVec;
use clearing::{clear, Entry};
use events::*;
use fathom_common::{Asset, AuctionReport, NavClient, OracleClient};
use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, Vec};
pub use types::*;

const DAY_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_LEDGERS;
const TTL_EXTEND: u32 = 30 * DAY_LEDGERS;

#[contract]
pub struct FathomAuction;

#[contractimpl]
impl FathomAuction {
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        admin: Address,
        base_token: Address,
        quote_token: Address,
        nav_feed: Address,
        grid_min: i128,
        grid_max: i128,
        tick: i128,
        params: Params,
    ) -> Result<(), Error> {
        if tick <= 0
            || grid_min <= 0
            || grid_max <= grid_min
            || (grid_max - grid_min) % tick != 0
            || base_token == quote_token
        {
            return Err(Error::BadConfig);
        }
        check_params(&params)?;
        let cfg = Config { admin, base_token, quote_token, nav_feed, oracle: None, grid_min, grid_max, tick };
        let now = env.ledger().timestamp();
        let first = Auction {
            id: 1,
            commit_end: now + params.period_secs,
            reveal_end: now + params.period_secs + params.reveal_secs,
            orders: Vec::new(&env),
            closed: false,
            to_settle: Vec::new(&env),
        };
        let st = env.storage().instance();
        st.set(&DataKey::Config, &cfg);
        st.set(&DataKey::Params, &params);
        st.set(&DataKey::NextOrderId, &1u64);
        st.set(&DataKey::Current, &1u64);
        st.set(&DataKey::NextToClose, &1u64);
        put(&env, &DataKey::Standing, &Vec::<u64>::new(&env));
        put(&env, &DataKey::Auction(1), &first);
        Ok(())
    }

    // ---------------------------------------------------------------- writes

    /// Seal an order: store its commitment and pull a fixed-size deposit into escrow.
    /// Depositing the quote token (USDC) makes it a buy; the base token (USTRY) a sell.
    pub fn place_order(
        env: Env,
        owner: Address,
        commitment: BytesN<32>,
        deposit_token: Address,
        deposit_amount: i128,
        standing: bool,
    ) -> Result<u64, Error> {
        owner.require_auth();
        let cfg = config(&env);
        let p = params(&env);
        let side = if deposit_token == cfg.quote_token {
            Side::Buy
        } else if deposit_token == cfg.base_token {
            Side::Sell
        } else {
            return Err(Error::BadDepositToken);
        };
        if !p.deposit_sizes.contains(deposit_amount) {
            return Err(Error::BadDepositSize);
        }
        if standing && side != Side::Buy {
            return Err(Error::StandingMustBeBuy);
        }

        let now = env.ledger().timestamp();
        let mut auction = roll(&env, now);
        token::TokenClient::new(&env, &deposit_token).transfer(&owner, env.current_contract_address(), &deposit_amount);

        let id: u64 = env.storage().instance().get(&DataKey::NextOrderId).unwrap();
        env.storage().instance().set(&DataKey::NextOrderId, &(id + 1));
        let order = Order {
            id,
            owner: owner.clone(),
            auction: auction.id,
            commitment: commitment.clone(),
            side,
            standing,
            status: OrderStatus::Sealed,
            deposit: deposit_amount,
            price_tick: 0,
            qty: 0,
            filled: 0,
            owed_base: 0,
            owed_quote: 0,
            placed_at: now,
            expires_at: if standing { now + p.standing_secs } else { auction.reveal_end },
        };
        put(&env, &DataKey::Order(id), &order);
        auction.orders.push_back(id);
        put(&env, &DataKey::Auction(auction.id), &auction);
        let key = DataKey::OwnerOrders(owner.clone());
        let mut mine: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(&env));
        mine.push_back(id);
        put(&env, &key, &mine);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);

        OrderPlaced { auction: auction.id, order_id: id, owner, commitment, side, standing, deposit: deposit_amount }
            .publish(&env);
        Ok(id)
    }

    /// Open a sealed order during its auction's reveal window.
    pub fn reveal(
        env: Env,
        owner: Address,
        order_id: u64,
        side: Side,
        price_tick: u32,
        qty: i128,
        salt: BytesN<32>,
    ) -> Result<(), Error> {
        owner.require_auth();
        let cfg = config(&env);
        let mut o: Order = env.storage().persistent().get(&DataKey::Order(order_id)).ok_or(Error::OrderNotFound)?;
        if o.owner != owner {
            return Err(Error::NotOwner);
        }
        if o.status != OrderStatus::Sealed {
            return Err(Error::AlreadyRevealed);
        }
        let a = auction(&env, o.auction);
        let now = env.ledger().timestamp();
        if now < a.commit_end || now >= a.reveal_end {
            return Err(Error::NotRevealWindow);
        }
        if side != o.side {
            return Err(Error::SideMismatch);
        }
        if price_tick >= n_ticks(&cfg) {
            return Err(Error::PriceOffGrid);
        }
        if commitment::commitment(&env, side, price_tick, qty, &salt, &owner)? != o.commitment {
            return Err(Error::CommitmentMismatch);
        }
        let needed = match side {
            Side::Buy => mul_price_ceil(qty, price_of(&cfg, price_tick)),
            Side::Sell => qty,
        };
        if needed > o.deposit {
            return Err(Error::Underfunded);
        }
        o.price_tick = price_tick;
        o.qty = qty;
        o.status = OrderStatus::Live;
        put(&env, &DataKey::Order(order_id), &o);
        OrderRevealed { auction: o.auction, order_id, owner, side, price_tick, qty }.publish(&env);
        Ok(())
    }

    /// Close the oldest open auction once its reveal window is over. Anyone can call.
    ///
    /// Computes the clearing price and records every payout on the orders, but
    /// moves no tokens: `settle` pays out in batches, which keeps each
    /// transaction under testnet's event and resource limits.
    pub fn close_auction(env: Env) -> Result<AuctionResult, Error> {
        let now = env.ledger().timestamp();
        roll(&env, now);
        let id: u64 = env.storage().instance().get(&DataKey::NextToClose).unwrap();
        let mut a = auction(&env, id);
        if now < a.reveal_end {
            return Err(Error::NotReadyToClose);
        }
        let cfg = config(&env);
        let p = params(&env);
        let nav = NavClient::new(&env, &cfg.nav_feed).nav();
        let mut to_settle: Vec<u64> = Vec::new(&env);

        // 1. Gather participants: this auction's revealed orders plus carried standing orders.
        //    Unrevealed orders are refunded minus the penalty; expired standing orders are refunded.
        let mut book: AVec<Order> = AVec::new();
        let (mut fee_base, mut fee_quote): (i128, i128) = env.storage().instance().get(&DataKey::Fees).unwrap_or((0, 0));
        for oid in a.orders.iter() {
            let mut o = order(&env, oid);
            match o.status {
                OrderStatus::Live => book.push(o),
                OrderStatus::Sealed => {
                    let penalty = o.deposit * p.penalty_bps as i128 / BPS;
                    if o.side == Side::Buy { fee_quote += penalty } else { fee_base += penalty }
                    o.deposit -= penalty;
                    release(&env, &mut o, &mut to_settle);
                }
                OrderStatus::Done => {}
            }
        }
        env.storage().instance().set(&DataKey::Fees, &(fee_base, fee_quote));
        let carried: Vec<u64> = env.storage().persistent().get(&DataKey::Standing).unwrap();
        for oid in carried.iter() {
            let mut o = order(&env, oid);
            if o.status != OrderStatus::Live {
                continue;
            }
            if o.expires_at <= now {
                release(&env, &mut o, &mut to_settle);
            } else {
                book.push(o);
            }
        }

        // 2. One uniform price on the grid.
        let ticks = n_ticks(&cfg);
        let anchor: u32 = env
            .storage()
            .instance()
            .get(&DataKey::LastClearTick)
            .unwrap_or_else(|| nearest_tick(&cfg, nav));
        let mut buys = AVec::new();
        let mut sells = AVec::new();
        for o in book.iter() {
            let e = Entry { tick: o.price_tick, qty: o.qty };
            if o.side == Side::Buy { buys.push(e) } else { sells.push(e) }
        }
        let result = clear(&buys, &sells, ticks, anchor);
        let (tick, matched, price) = match &result {
            Some(c) => (c.tick, c.matched, price_of(&cfg, c.tick)),
            None => (0, 0, 0),
        };

        // 3. Apply fills at that price; one-day leftovers are released, standing orders carried.
        let (mut bi, mut si) = (0usize, 0usize);
        let mut still_standing: Vec<u64> = Vec::new(&env);
        let mut fills: Vec<Fill> = Vec::new(&env);
        let mut depth: i128 = 0;
        let floor_price = nav * (BPS - p.depth_floor_bps as i128) / BPS;
        let order_count = book.len() as u32;
        for mut o in book.into_iter() {
            let fill = match (&result, o.side) {
                (Some(c), Side::Buy) => c.buy_fills[bi],
                (Some(c), Side::Sell) => c.sell_fills[si],
                (None, _) => 0,
            };
            fills.push_back(Fill {
                order_id: o.id,
                owner: o.owner.clone(),
                side: o.side,
                standing: o.standing,
                price_tick: o.price_tick,
                qty: o.qty,
                filled: fill,
            });
            o.qty -= fill;
            o.filled += fill;
            match o.side {
                Side::Buy => {
                    bi += 1;
                    o.deposit -= mul_price_ceil(fill, price).min(o.deposit);
                    o.owed_base += fill;
                }
                Side::Sell => {
                    si += 1;
                    o.deposit -= fill;
                    o.owed_quote += fill * price / PRICE_SCALE;
                }
            }
            if o.standing && o.qty > 0 {
                still_standing.push_back(o.id);
                if price_of(&cfg, o.price_tick) >= floor_price {
                    depth += o.qty;
                }
                if fill > 0 {
                    to_settle.push_back(o.id);
                }
                put(&env, &DataKey::Order(o.id), &o);
            } else {
                release(&env, &mut o, &mut to_settle);
            }
        }

        // 4. Record the result.
        let res = AuctionResult {
            auction: id,
            closed_at: now,
            cleared: result.is_some(),
            clearing_tick: tick,
            price,
            matched,
            notional: matched * price / PRICE_SCALE,
            order_count,
            depth,
            nav,
        };
        a.closed = true;
        a.to_settle = to_settle;
        put(&env, &DataKey::Auction(id), &a);
        put(&env, &DataKey::Standing, &still_standing);
        put(&env, &DataKey::Fills(id), &fills);
        put(&env, &DataKey::Result(id), &res);
        let st = env.storage().instance();
        st.set(&DataKey::LastResult, &res);
        st.set(&DataKey::NextToClose, &(id + 1));
        if res.cleared {
            st.set(&DataKey::LastClearTick, &tick);
        }
        st.extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        AuctionClosed { auction: id, result: res.clone() }.publish(&env);

        // 5. Push to the oracle; its reads stay local.
        if let Some(oracle) = &cfg.oracle {
            let report = AuctionReport {
                auction: id,
                timestamp: now,
                cleared: res.cleared,
                price,
                matched,
                notional: res.notional,
                order_count,
                depth,
            };
            OracleClient::new(&env, oracle).record(&Asset::Stellar(cfg.base_token.clone()), &report);
        }
        Ok(res)
    }

    /// Pay out what the close recorded for these orders. Anyone can call;
    /// funds only ever go to each order's owner. Already-settled ids are skipped.
    pub fn settle(env: Env, order_ids: Vec<u64>) -> Result<u32, Error> {
        let cfg = config(&env);
        let this = env.current_contract_address();
        let base = token::TokenClient::new(&env, &cfg.base_token);
        let quote = token::TokenClient::new(&env, &cfg.quote_token);
        let mut paid = 0u32;
        for id in order_ids.iter() {
            let mut o: Order = env.storage().persistent().get(&DataKey::Order(id)).ok_or(Error::OrderNotFound)?;
            if o.owed_base == 0 && o.owed_quote == 0 {
                continue;
            }
            if o.owed_base > 0 {
                base.transfer(&this, &o.owner, &o.owed_base);
            }
            if o.owed_quote > 0 {
                quote.transfer(&this, &o.owner, &o.owed_quote);
            }
            OrderSettled { order_id: id, owner: o.owner.clone(), base: o.owed_base, quote: o.owed_quote }.publish(&env);
            o.owed_base = 0;
            o.owed_quote = 0;
            put(&env, &DataKey::Order(id), &o);
            paid += 1;
        }
        Ok(paid)
    }

    /// Send collected penalties to the admin.
    pub fn withdraw_fees(env: Env) -> (i128, i128) {
        let cfg = config(&env);
        cfg.admin.require_auth();
        let (b, q): (i128, i128) = env.storage().instance().get(&DataKey::Fees).unwrap_or((0, 0));
        let this = env.current_contract_address();
        if b > 0 {
            token::TokenClient::new(&env, &cfg.base_token).transfer(&this, &cfg.admin, &b);
        }
        if q > 0 {
            token::TokenClient::new(&env, &cfg.quote_token).transfer(&this, &cfg.admin, &q);
        }
        env.storage().instance().set(&DataKey::Fees, &(0i128, 0i128));
        (b, q)
    }

    /// Demo only: end the oldest open auction's commit window now, or if that
    /// is already over, end its reveal window now.
    pub fn fast_forward(env: Env) -> Result<Auction, Error> {
        let cfg = config(&env);
        cfg.admin.require_auth();
        let p = params(&env);
        if !p.demo {
            return Err(Error::NotDemo);
        }
        let now = env.ledger().timestamp();
        let id: u64 = env.storage().instance().get(&DataKey::NextToClose).unwrap();
        let mut a = auction(&env, id);
        if now < a.commit_end {
            a.commit_end = now;
            a.reveal_end = now + p.reveal_secs;
        } else if now < a.reveal_end {
            a.reveal_end = now;
        }
        put(&env, &DataKey::Auction(id), &a);
        AuctionAdvanced { auction: id, commit_end: a.commit_end, reveal_end: a.reveal_end }.publish(&env);
        Ok(a)
    }

    /// Point closes at the Fathom oracle (it must have registered this contract for the base token).
    pub fn set_oracle(env: Env, oracle: Address) {
        let mut cfg = config(&env);
        cfg.admin.require_auth();
        cfg.oracle = Some(oracle);
        env.storage().instance().set(&DataKey::Config, &cfg);
    }

    pub fn set_params(env: Env, params: Params) -> Result<(), Error> {
        config(&env).admin.require_auth();
        check_params(&params)?;
        env.storage().instance().set(&DataKey::Params, &params);
        Ok(())
    }

    // ---------------------------------------------------------------- views

    pub fn config(env: Env) -> Config {
        config(&env)
    }

    pub fn params(env: Env) -> Params {
        params(&env)
    }

    /// The auction accepting commitments right now.
    pub fn current_auction(env: Env) -> Auction {
        let now = env.ledger().timestamp();
        let cur = auction(&env, current_id(&env));
        if now < cur.commit_end {
            cur
        } else {
            next_after(&env, &cur, now)
        }
    }

    /// The oldest auction not closed yet (the one revealing or about to close).
    pub fn closing_auction(env: Env) -> Auction {
        auction(&env, env.storage().instance().get(&DataKey::NextToClose).unwrap())
    }

    pub fn auction(env: Env, id: u64) -> Option<Auction> {
        env.storage().persistent().get(&DataKey::Auction(id))
    }

    /// Number of still-sealed orders in the auction accepting commitments.
    pub fn sealed_count(env: Env) -> u32 {
        let a = Self::current_auction(env.clone());
        a.orders.iter().filter(|id| order(&env, *id).status == OrderStatus::Sealed).count() as u32
    }

    pub fn order(env: Env, id: u64) -> Option<Order> {
        env.storage().persistent().get(&DataKey::Order(id))
    }

    pub fn orders_of(env: Env, owner: Address) -> Vec<Order> {
        let ids: Vec<u64> = env.storage().persistent().get(&DataKey::OwnerOrders(owner)).unwrap_or(Vec::new(&env));
        let mut out = Vec::new(&env);
        for id in ids.iter() {
            out.push_back(order(&env, id));
        }
        out
    }

    /// Live standing buy orders carried between auctions (already revealed, so public).
    pub fn standing_book(env: Env) -> Vec<Order> {
        let ids: Vec<u64> = env.storage().persistent().get(&DataKey::Standing).unwrap();
        let mut out = Vec::new(&env);
        for id in ids.iter() {
            out.push_back(order(&env, id));
        }
        out
    }

    /// Revealed orders of a closed auction with their fills (the close screen's table).
    pub fn fills(env: Env, auction: u64) -> Vec<Fill> {
        env.storage().persistent().get(&DataKey::Fills(auction)).unwrap_or(Vec::new(&env))
    }

    pub fn fees(env: Env) -> (i128, i128) {
        env.storage().instance().get(&DataKey::Fees).unwrap_or((0, 0))
    }

    pub fn last_result(env: Env) -> Option<AuctionResult> {
        env.storage().instance().get(&DataKey::LastResult)
    }

    pub fn result(env: Env, auction: u64) -> Option<AuctionResult> {
        env.storage().persistent().get(&DataKey::Result(auction))
    }

    /// The commitment for an order opening. Read-only helper for scripts and for
    /// cross-checking the browser's Poseidon2 implementation; never send a real
    /// opening to a public RPC before the reveal window.
    pub fn commitment_of(env: Env, owner: Address, side: Side, price_tick: u32, qty: i128, salt: BytesN<32>) -> Result<BytesN<32>, Error> {
        commitment::commitment(&env, side, price_tick, qty, &salt, &owner)
    }

    pub fn price_of(env: Env, tick: u32) -> i128 {
        price_of(&config(&env), tick)
    }

    pub fn n_ticks(env: Env) -> u32 {
        n_ticks(&config(&env))
    }
}

// -------------------------------------------------------------------- helpers

fn check_params(p: &Params) -> Result<(), Error> {
    let sizes_ok = !p.deposit_sizes.is_empty() && p.deposit_sizes.iter().all(|s| s > 0);
    if p.period_secs == 0 || p.depth_floor_bps > 10_000 || p.penalty_bps > 10_000 || !sizes_ok {
        return Err(Error::BadConfig);
    }
    Ok(())
}

fn config(env: &Env) -> Config {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

fn params(env: &Env) -> Params {
    env.storage().instance().get(&DataKey::Params).unwrap()
}

fn current_id(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::Current).unwrap()
}

fn auction(env: &Env, id: u64) -> Auction {
    env.storage().persistent().get(&DataKey::Auction(id)).unwrap()
}

fn order(env: &Env, id: u64) -> Order {
    env.storage().persistent().get(&DataKey::Order(id)).unwrap()
}

fn put<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, value: &V) {
    env.storage().persistent().set(key, value);
    env.storage().persistent().extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND);
}

/// The auction after `cur`, skipping whole idle periods so its window contains `now`.
fn next_after(env: &Env, cur: &Auction, now: u64) -> Auction {
    let p = params(env);
    let periods = (now - cur.commit_end) / p.period_secs + 1;
    let commit_end = cur.commit_end + periods * p.period_secs;
    Auction { id: cur.id + 1, commit_end, reveal_end: commit_end + p.reveal_secs, orders: Vec::new(env), closed: false, to_settle: Vec::new(env) }
}

/// Return the auction accepting commitments, creating the next one if the current window ended.
fn roll(env: &Env, now: u64) -> Auction {
    let cur = auction(env, current_id(env));
    if now < cur.commit_end {
        return cur;
    }
    let next = next_after(env, &cur, now);
    put(env, &DataKey::Auction(next.id), &next);
    env.storage().instance().set(&DataKey::Current, &next.id);
    next
}

/// Take an order out of the book: its remaining escrow becomes owed back to the owner.
fn release(env: &Env, o: &mut Order, to_settle: &mut Vec<u64>) {
    match o.side {
        Side::Buy => o.owed_quote += o.deposit,
        Side::Sell => o.owed_base += o.deposit,
    }
    o.deposit = 0;
    o.status = OrderStatus::Done;
    put(env, &DataKey::Order(o.id), o);
    if o.owed_base > 0 || o.owed_quote > 0 {
        to_settle.push_back(o.id);
    }
}

fn n_ticks(cfg: &Config) -> u32 {
    ((cfg.grid_max - cfg.grid_min) / cfg.tick + 1) as u32
}

fn price_of(cfg: &Config, tick: u32) -> i128 {
    cfg.grid_min + tick as i128 * cfg.tick
}

fn nearest_tick(cfg: &Config, price: i128) -> u32 {
    let t = (price - cfg.grid_min + cfg.tick / 2) / cfg.tick;
    t.clamp(0, n_ticks(cfg) as i128 - 1) as u32
}

/// qty × price in quote units, rounded up (buyers pay the rounding, so escrow never runs short).
fn mul_price_ceil(qty: i128, price: i128) -> i128 {
    (qty * price + PRICE_SCALE - 1) / PRICE_SCALE
}
