extern crate std;

use crate::{commitment, FathomAuction, FathomAuctionClient};
use crate::types::*;
use soroban_poseidon::poseidon2_hash;
use soroban_sdk::{
    crypto::bn254::Bn254Fr,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, U256,
};

const U: i128 = 10_000_000; // one whole token / one dollar, 7 decimals
const PERIOD: u64 = 300;
const REVEAL: u64 = 120;

struct T<'a> {
    env: Env,
    admin: Address,
    auction: FathomAuctionClient<'a>,
    base: TokenClient<'a>,
    quote: TokenClient<'a>,
}

fn params(env: &Env) -> Params {
    Params {
        period_secs: PERIOD,
        reveal_secs: REVEAL,
        standing_secs: 7 * 86_400,
        depth_floor_bps: 500,
        penalty_bps: 100,
        deposit_sizes: vec![env, 10_000 * U, 50_000 * U, 250_000 * U],
        demo: true,
    }
}

fn setup<'a>() -> T<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let base = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let quote = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let nav = env.register(mock_nav::MockNav, (&admin, 106 * U / 100));
    // Grid $1.00 .. $1.10 in $0.01 ticks: tick 4 = $1.04.
    let id = env.register(
        FathomAuction,
        (&admin, &base, &quote, &nav, U, 110 * U / 100, U / 100, params(&env)),
    );
    T {
        auction: FathomAuctionClient::new(&env, &id),
        base: TokenClient::new(&env, &base),
        quote: TokenClient::new(&env, &quote),
        admin,
        env,
    }
}

struct Sealed {
    id: u64,
    owner: Address,
    side: Side,
    tick: u32,
    qty: i128,
    salt: BytesN<32>,
}

impl<'a> T<'a> {
    fn user(&self) -> Address {
        Address::generate(&self.env)
    }

    fn fund(&self, who: &Address, side: Side, amount: i128) {
        let tok = if side == Side::Buy { &self.quote } else { &self.base };
        StellarAssetClient::new(&self.env, &tok.address).mint(who, &amount);
    }

    #[allow(clippy::too_many_arguments)]
    fn seal(&self, owner: &Address, side: Side, tick: u32, qty: i128, deposit: i128, standing: bool) -> Sealed {
        self.fund(owner, side, deposit);
        let mut s = [0u8; 32];
        s[31] = (self.env.ledger().sequence() as u8).wrapping_add(tick as u8).wrapping_mul(7);
        s[30] = (qty % 251) as u8;
        let salt = BytesN::from_array(&self.env, &s);
        let c = self
            .env
            .as_contract(&self.auction.address, || commitment::commitment(&self.env, side, tick, qty, &salt, owner))
            .unwrap();
        let tok = if side == Side::Buy { &self.quote.address } else { &self.base.address };
        let id = self.auction.place_order(owner, &c, tok, &deposit, &standing);
        Sealed { id, owner: owner.clone(), side, tick, qty, salt }
    }

    fn reveal(&self, o: &Sealed) {
        self.auction.reveal(&o.owner, &o.id, &o.side, &o.tick, &o.qty, &o.salt);
    }

    fn at(&self, t: u64) {
        self.env.ledger().set_timestamp(t);
    }

    /// Move to the reveal window of the oldest open auction.
    fn to_reveal(&self) {
        self.at(self.auction.closing_auction().commit_end);
    }

    /// Close the oldest auction, then settle its payouts in batches like the auction loop does.
    fn close(&self) -> AuctionResult {
        let r = self.auction.close_auction();
        let pending = self.auction.auction(&r.auction).unwrap().to_settle;
        let mut i = 0;
        while i < pending.len() {
            self.auction.settle(&pending.slice(i..(i + 8).min(pending.len())));
            i += 8;
        }
        r
    }

    fn to_close(&self) {
        self.at(self.auction.closing_auction().reveal_end);
    }
}

#[test]
fn poseidon2_matches_noir() {
    // Poseidon2::hash([1, 2, 3, 4, 5], 5) computed with nargo 1.0.0-beta.9.
    let env = Env::default();
    let inputs = vec![
        &env,
        U256::from_u32(&env, 1),
        U256::from_u32(&env, 2),
        U256::from_u32(&env, 3),
        U256::from_u32(&env, 4),
        U256::from_u32(&env, 5),
    ];
    let h = commitment::to_bytes32(&env, &poseidon2_hash::<4, Bn254Fr>(&env, &inputs));
    let mut expected = [0u8; 32];
    let hex = "2247be7014a54d17342a7ef677f58d28877780d203860396967f5d0a18d259db";
    for i in 0..32 {
        expected[i] = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).unwrap();
    }
    assert_eq!(h.to_array(), expected);
}

#[test]
fn worked_example() {
    let t = setup();
    let (alice, dan, bob, carol) = (t.user(), t.user(), t.user(), t.user());
    let deposit = 50_000 * U;
    let orders = [
        t.seal(&alice, Side::Buy, 4, 30_000 * U, deposit, true), // buys 30,000 at <= $1.04, standing
        t.seal(&dan, Side::Buy, 3, 10_000 * U, deposit, false),  // buys 10,000 at <= $1.03
        t.seal(&bob, Side::Sell, 2, 20_000 * U, deposit, false), // sells 20,000 at >= $1.02
        t.seal(&carol, Side::Sell, 4, 15_000 * U, deposit, false), // sells 15,000 at >= $1.04
    ];
    assert_eq!(t.auction.sealed_count(), 4);
    let listed = t.auction.orders_in(&1);
    assert_eq!(listed.len(), 4);
    assert_eq!(listed.get(2).unwrap().side, Side::Sell);
    assert_eq!(t.auction.orders_in(&99).len(), 0);

    t.to_reveal();
    orders.iter().for_each(|o| t.reveal(o));
    t.to_close();
    let r = t.close();

    assert!(r.cleared);
    assert_eq!(r.price, 104 * U / 100);
    assert_eq!(r.matched, 30_000 * U);
    assert_eq!(r.notional, 31_200 * U);
    assert_eq!(r.order_count, 4);

    // Alice: 30,000 USTRY for 31,200 USDC; her standing order is fully filled, so the rest comes back.
    assert_eq!(t.base.balance(&alice), 30_000 * U);
    assert_eq!(t.quote.balance(&alice), deposit - 31_200 * U);
    // Dan: limit below the clearing price, refunded in full.
    assert_eq!(t.quote.balance(&dan), deposit);
    assert_eq!(t.base.balance(&dan), 0);
    // Bob sold 20,000; Carol sold 10,000 of 15,000 (5,000 returned with the rest of her deposit).
    assert_eq!(t.quote.balance(&bob), 20_800 * U);
    assert_eq!(t.base.balance(&bob), deposit - 20_000 * U);
    assert_eq!(t.quote.balance(&carol), 10_400 * U);
    assert_eq!(t.base.balance(&carol), deposit - 10_000 * U);
    // Escrow is empty: nothing stuck, nothing short.
    assert_eq!(t.base.balance(&t.auction.address), 0);
    assert_eq!(t.quote.balance(&t.auction.address), 0);
    assert_eq!(r.depth, 0);
}

#[test]
fn standing_order_carries_and_counts_as_depth() {
    let t = setup();
    let alice = t.user();
    let a = t.seal(&alice, Side::Buy, 4, 20_000 * U, 50_000 * U, true);
    let low = t.seal(&t.user(), Side::Buy, 0, 30_000 * U, 50_000 * U, true); // $1.00 < 95% of NAV
    t.to_reveal();
    t.reveal(&a);
    t.reveal(&low);
    t.to_close();
    let r = t.close();
    assert!(!r.cleared);
    // Only orders priced within 5% of NAV ($1.007) count.
    assert_eq!(r.depth, 20_000 * U);
    assert_eq!(t.auction.standing_book().len(), 2);
    assert_eq!(t.auction.order(&a.id).unwrap().status, OrderStatus::Live);

    // Next auction: still there, without being revealed again.
    t.to_reveal();
    t.to_close();
    assert_eq!(t.close().depth, 20_000 * U);
}

#[test]
fn self_trade_only_reduces_depth() {
    let t = setup();
    let alice = t.user();
    let bid = t.seal(&alice, Side::Buy, 4, 20_000 * U, 50_000 * U, true);
    t.to_reveal();
    t.reveal(&bid);
    t.to_close();
    let before = t.close().depth;
    assert_eq!(before, 20_000 * U);

    // Alice sells into her own standing bid to "show volume".
    let ask = t.seal(&alice, Side::Sell, 0, 20_000 * U, 50_000 * U, false);
    t.to_reveal();
    t.reveal(&ask);
    t.to_close();
    let r = t.close();
    assert!(r.cleared);
    assert_eq!(r.matched, 20_000 * U);
    assert_eq!(r.depth, 0);
    assert!(r.depth < before);
    assert_eq!(t.auction.standing_book().len(), 0);
}

#[test]
fn partial_fill_keeps_standing_remainder() {
    let t = setup();
    let bid = t.seal(&t.user(), Side::Buy, 4, 30_000 * U, 50_000 * U, true);
    let ask = t.seal(&t.user(), Side::Sell, 4, 10_000 * U, 10_000 * U, false);
    t.to_reveal();
    t.reveal(&bid);
    t.reveal(&ask);
    t.to_close();
    let r = t.close();
    assert_eq!(r.matched, 10_000 * U);
    assert_eq!(r.depth, 20_000 * U);
    let o = t.auction.order(&bid.id).unwrap();
    assert_eq!((o.qty, o.filled, o.deposit), (20_000 * U, 10_000 * U, 50_000 * U - 10_400 * U));
}

#[test]
fn standing_order_expires_after_seven_days() {
    let t = setup();
    let alice = t.user();
    let bid = t.seal(&alice, Side::Buy, 4, 20_000 * U, 50_000 * U, true);
    t.to_reveal();
    t.reveal(&bid);
    t.to_close();
    t.close();

    // Nobody closes auction 2 until day 8; by then the standing order has expired.
    t.at(8 * 86_400);
    let r = t.close();
    assert_eq!(r.depth, 0);
    assert_eq!(t.auction.order(&bid.id).unwrap().status, OrderStatus::Done);
    assert_eq!(t.quote.balance(&alice), 50_000 * U);
}

#[test]
fn unrevealed_order_is_refunded_minus_penalty() {
    let t = setup();
    let lazy = t.user();
    t.seal(&lazy, Side::Sell, 4, 10_000 * U, 10_000 * U, false);
    t.to_reveal();
    t.to_close();
    t.close();
    assert_eq!(t.base.balance(&lazy), 9_900 * U);
    assert_eq!(t.auction.fees(), (100 * U, 0));
    t.auction.withdraw_fees();
    assert_eq!(t.base.balance(&t.admin), 100 * U);
    assert_eq!(t.base.balance(&t.auction.address), 0);
}

#[test]
fn reveal_checks() {
    let t = setup();
    let alice = t.user();
    let o = t.seal(&alice, Side::Buy, 4, 30_000 * U, 50_000 * U, false);
    let greedy = t.seal(&alice, Side::Buy, 4, 50_000 * U, 50_000 * U, false); // needs 52,000 USDC

    // Too early: still in the commit window.
    let early = t.auction.try_reveal(&alice, &o.id, &o.side, &o.tick, &o.qty, &o.salt);
    assert_eq!(early, Err(Ok(Error::NotRevealWindow)));

    t.to_reveal();
    let wrong_price = t.auction.try_reveal(&alice, &o.id, &o.side, &3, &o.qty, &o.salt);
    assert_eq!(wrong_price, Err(Ok(Error::CommitmentMismatch)));
    let wrong_side = t.auction.try_reveal(&alice, &o.id, &Side::Sell, &o.tick, &o.qty, &o.salt);
    assert_eq!(wrong_side, Err(Ok(Error::SideMismatch)));
    let thief = t.user();
    let stolen = t.auction.try_reveal(&thief, &o.id, &o.side, &o.tick, &o.qty, &o.salt);
    assert_eq!(stolen, Err(Ok(Error::NotOwner)));
    let underfunded = t.auction.try_reveal(&alice, &greedy.id, &greedy.side, &greedy.tick, &greedy.qty, &greedy.salt);
    assert_eq!(underfunded, Err(Ok(Error::Underfunded)));

    t.reveal(&o);
    let again = t.auction.try_reveal(&alice, &o.id, &o.side, &o.tick, &o.qty, &o.salt);
    assert_eq!(again, Err(Ok(Error::AlreadyRevealed)));

    t.to_close();
    let late = t.auction.try_reveal(&alice, &greedy.id, &greedy.side, &greedy.tick, &greedy.qty, &greedy.salt);
    assert_eq!(late, Err(Ok(Error::NotRevealWindow)));
}

#[test]
fn the_same_commitment_cannot_be_placed_twice() {
    let t = setup();
    let alice = t.user();
    let o = t.seal(&alice, Side::Buy, 4, 1_000 * U, 10_000 * U, false);
    let c = t.auction.order(&o.id).unwrap().commitment;
    t.fund(&alice, Side::Buy, 10_000 * U);
    let again = t.auction.try_place_order(&alice, &c, &t.quote.address, &(10_000 * U), &false);
    assert_eq!(again, Err(Ok(Error::CommitmentExists)));
}

#[test]
fn deposits_come_in_fixed_sizes() {
    let t = setup();
    let alice = t.user();
    t.fund(&alice, Side::Buy, 100_000 * U);
    t.fund(&alice, Side::Sell, 100_000 * U);
    let c = BytesN::from_array(&t.env, &[1; 32]);
    let odd = t.auction.try_place_order(&alice, &c, &t.quote.address, &(12_345 * U), &false);
    assert_eq!(odd, Err(Ok(Error::BadDepositSize)));
    let standing_sell = t.auction.try_place_order(&alice, &c, &t.base.address, &(10_000 * U), &true);
    assert_eq!(standing_sell, Err(Ok(Error::StandingMustBeBuy)));
    let other = Address::generate(&t.env);
    let bad_token = t.auction.try_place_order(&alice, &c, &other, &(10_000 * U), &false);
    assert_eq!(bad_token, Err(Ok(Error::BadDepositToken)));
}

#[test]
fn auctions_roll_and_close_in_order() {
    let t = setup();
    assert_eq!(t.auction.try_close_auction(), Err(Ok(Error::NotReadyToClose)));

    // An order placed during auction 1's reveal window goes into auction 2.
    t.to_reveal();
    let o = t.seal(&t.user(), Side::Buy, 4, 1_000 * U, 10_000 * U, false);
    assert_eq!(t.auction.order(&o.id).unwrap().auction, 2);
    assert_eq!(t.auction.current_auction().id, 2);

    t.to_close();
    assert_eq!(t.close().auction, 1);
    assert_eq!(t.auction.closing_auction().id, 2);
}

#[test]
fn fast_forward_for_demo() {
    let t = setup();
    let o = t.seal(&t.user(), Side::Buy, 4, 1_000 * U, 10_000 * U, false);
    t.at(10);
    let a = t.auction.fast_forward(); // ends commits now
    assert_eq!((a.commit_end, a.reveal_end), (10, 10 + REVEAL));
    t.reveal(&o);
    let a = t.auction.fast_forward(); // ends reveals now
    assert_eq!(a.reveal_end, 10);
    assert_eq!(t.close().auction, 1);
    // The next auction opened when commits ended.
    assert_eq!(t.auction.current_auction().commit_end, 10 + PERIOD);
}

#[test]
fn close_with_a_busy_book_fits_testnet_limits() {
    // 24 orders (the demo has ~10). The invocation-limit checks in the test host (events <= 16 KB etc.)
    // fail the call if a limit is exceeded, so passing means it fits.
    let t = setup();
    let mut orders = std::vec::Vec::new();
    for i in 0..12u32 {
        orders.push(t.seal(&t.user(), Side::Buy, 2 + i % 5, (1_000 + i as i128 * 300) * U, 10_000 * U, i % 2 == 0));
        orders.push(t.seal(&t.user(), Side::Sell, i % 6, (1_200 + i as i128 * 250) * U, 10_000 * U, false));
    }
    t.to_reveal();
    orders.iter().for_each(|o| t.reveal(o));
    t.to_close();
    let mut budget = t.env.cost_estimate().budget();
    budget.reset_unlimited();
    let r = t.auction.close_auction();
    std::println!("close_auction, 24 orders: cpu={} mem={}", budget.cpu_instruction_cost(), budget.memory_bytes_cost());
    assert!(r.cleared);
    assert!(budget.cpu_instruction_cost() < 200_000_000);

    let pending = t.auction.auction(&r.auction).unwrap().to_settle;
    assert!(pending.len() >= 8); // unfilled standing buys stay in the book and are owed nothing
    budget.reset_unlimited();
    assert_eq!(t.auction.settle(&pending.slice(0..8)), 8);
    std::println!("settle, 8 orders: cpu={} mem={}", budget.cpu_instruction_cost(), budget.memory_bytes_cost());
    assert_eq!(t.auction.settle(&pending.slice(0..8)), 0); // idempotent
}

#[test]
fn close_pushes_price_and_depth_to_the_oracle() {
    use fathom_common::{Asset, LiquidityStatus};
    use fathom_oracle::{FathomOracle, FathomOracleClient, OracleParams};

    let t = setup();
    let cfg = t.auction.config();
    let oracle_params = OracleParams {
        resolution: PERIOD as u32,
        median_window: 7,
        min_notional: 10_000 * U,
        min_orders: 5,
        depth_window_secs: 3_600,
        history_cap: 64,
    };
    let oracle_id = t.env.register(FathomOracle, (&t.admin, &Asset::Stellar(cfg.quote_token.clone()), &oracle_params));
    let oracle = FathomOracleClient::new(&t.env, &oracle_id);
    let ustry = Asset::Stellar(cfg.base_token.clone());
    oracle.register_asset(&ustry, &t.auction.address, &Some(cfg.nav_feed.clone()));
    t.auction.set_oracle(&oracle_id);

    // The worked example, plus Eve's standing bid at $1.03 (below the clearing price, so it stays open).
    let d = 50_000 * U;
    let orders = [
        t.seal(&t.user(), Side::Buy, 4, 30_000 * U, d, true),
        t.seal(&t.user(), Side::Buy, 3, 10_000 * U, d, false),
        t.seal(&t.user(), Side::Sell, 2, 20_000 * U, d, false),
        t.seal(&t.user(), Side::Sell, 4, 15_000 * U, d, false),
        t.seal(&t.user(), Side::Buy, 3, 25_000 * U, d, true),
    ];
    t.to_reveal();
    orders.iter().for_each(|o| t.reveal(o));
    t.to_close();
    t.close();

    let l = oracle.liquidity(&ustry).unwrap();
    assert_eq!(l.status, LiquidityStatus::Ok);
    assert_eq!((l.price, l.nav), (104 * U / 100, 106 * U / 100));
    assert_eq!(l.haircut_bps, 188); // (1.06 − 1.04) / 1.06
    assert_eq!((l.depth, l.order_count), (25_000 * U, 5));
    assert_eq!(oracle.lastprice(&ustry).unwrap().price, 104 * U / 100);
}
