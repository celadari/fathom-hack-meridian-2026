//! Fathom oracle: SEP-40 price feed plus depth, for any number of assets.
//!
//! Each asset's registered auction contract pushes one report per auction
//! (`record`). Everything a reader needs is computed then and stored per asset,
//! so reads are local: no calls back to the auction or NAV feed.
//!
//!   price  = median of the last `median_window` clearing prices, capped at NAV
//!            (assets without a NAV feed use the median itself)
//!   depth  = open standing-buy quantity within the depth floor of NAV, as reported
//!   status = no price published if the last auction's notional or order count
//!            is below the minimum
#![no_std]

use fathom_common::{Asset, AuctionReport, Liquidity, LiquidityStatus, NavClient, PriceData, BPS};
use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, Vec};

const DAY_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_LEDGERS;
const TTL_EXTEND: u32 = 30 * DAY_LEDGERS;
const DECIMALS: u32 = 7;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotRegistered = 1,
    BadParams = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleParams {
    /// SEP-40 resolution: seconds between auctions.
    pub resolution: u32,
    pub median_window: u32,
    /// Minimum notional (quote units) and order count for a price to be published.
    pub min_notional: i128,
    pub min_orders: u32,
    /// Window for the lowest-depth reading pools use.
    pub depth_window_secs: u64,
    /// Published prices kept for `price` / `prices`.
    pub history_cap: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetConfig {
    /// The only contract allowed to `record` for this asset.
    pub auction: Address,
    pub nav_feed: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DepthPoint {
    pub timestamp: u64,
    pub depth: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetState {
    /// Last `median_window` clearing prices, oldest first.
    pub clearing: Vec<i128>,
    /// Depth readings inside the depth window, oldest first.
    pub depth_history: Vec<DepthPoint>,
    pub liquidity: Liquidity,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Base,
    Params,
    Assets,
    Config(Asset),
    State(Asset),
    /// Published prices, oldest first.
    History(Asset),
}

#[contractevent(topics = ["recorded"])]
pub struct Recorded {
    pub asset: Asset,
    pub liquidity: Liquidity,
}

#[contractevent(topics = ["registered"])]
pub struct Registered {
    pub asset: Asset,
    pub auction: Address,
    pub nav_feed: Option<Address>,
}

#[contract]
pub struct FathomOracle;

#[contractimpl]
impl FathomOracle {
    pub fn __constructor(env: Env, admin: Address, base: Asset, params: OracleParams) -> Result<(), Error> {
        check(&params)?;
        let st = env.storage().instance();
        st.set(&DataKey::Admin, &admin);
        st.set(&DataKey::Base, &base);
        st.set(&DataKey::Params, &params);
        st.set(&DataKey::Assets, &Vec::<Asset>::new(&env));
        Ok(())
    }

    // ---------------------------------------------------------------- admin

    /// Add an asset, or repoint an existing one (its history is kept).
    pub fn register_asset(env: Env, asset: Asset, auction: Address, nav_feed: Option<Address>) {
        admin(&env).require_auth();
        let mut assets: Vec<Asset> = env.storage().instance().get(&DataKey::Assets).unwrap();
        if !assets.contains(&asset) {
            assets.push_back(asset.clone());
            env.storage().instance().set(&DataKey::Assets, &assets);
        }
        let cfg = AssetConfig { auction: auction.clone(), nav_feed: nav_feed.clone() };
        put(&env, &DataKey::Config(asset.clone()), &cfg);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Registered { asset, auction, nav_feed }.publish(&env);
    }

    pub fn set_params(env: Env, params: OracleParams) -> Result<(), Error> {
        admin(&env).require_auth();
        check(&params)?;
        env.storage().instance().set(&DataKey::Params, &params);
        Ok(())
    }

    // ---------------------------------------------------------------- push

    /// Called by the asset's auction contract after each close.
    pub fn record(env: Env, asset: Asset, report: AuctionReport) -> Result<Liquidity, Error> {
        let cfg: AssetConfig = env.storage().persistent().get(&DataKey::Config(asset.clone())).ok_or(Error::NotRegistered)?;
        cfg.auction.require_auth();
        let p = params(&env);
        let now = env.ledger().timestamp();
        let state_key = DataKey::State(asset.clone());
        let prev: Option<AssetState> = env.storage().persistent().get(&state_key);
        let (mut clearing, mut depth_history) = match prev {
            Some(s) => (s.clearing, s.depth_history),
            None => (Vec::new(&env), Vec::new(&env)),
        };

        if report.cleared {
            clearing.push_back(report.price);
            while clearing.len() > p.median_window {
                clearing.pop_front();
            }
        }
        let nav = cfg.nav_feed.map(|f| NavClient::new(&env, &f).nav()).unwrap_or(0);
        let price = match median(&clearing) {
            Some(m) if nav > 0 => m.min(nav),
            Some(m) => m,
            None => 0,
        };
        let haircut_bps = if nav > 0 && price > 0 { (nav - price) * BPS / nav } else { 0 };

        depth_history.push_back(DepthPoint { timestamp: now, depth: report.depth });
        while depth_history.len() > 1 && depth_history.first().unwrap().timestamp + p.depth_window_secs < now {
            depth_history.pop_front();
        }
        let min_depth_window = depth_history.iter().map(|d| d.depth).min().unwrap();

        let status = if clearing.is_empty() {
            LiquidityStatus::NoPrice
        } else if report.notional < p.min_notional || report.order_count < p.min_orders {
            LiquidityStatus::LowLiquidity
        } else {
            LiquidityStatus::Ok
        };
        if status == LiquidityStatus::Ok {
            let key = DataKey::History(asset.clone());
            let mut history: Vec<PriceData> = env.storage().persistent().get(&key).unwrap_or(Vec::new(&env));
            history.push_back(PriceData { price, timestamp: now });
            while history.len() > p.history_cap {
                history.pop_front();
            }
            put(&env, &key, &history);
        }

        let liquidity = Liquidity {
            price,
            nav,
            haircut_bps,
            depth: report.depth,
            min_depth_window,
            order_count: report.order_count,
            notional: report.notional,
            status,
            auction: report.auction,
            timestamp: now,
        };
        put(&env, &state_key, &AssetState { clearing, depth_history, liquidity: liquidity.clone() });
        Recorded { asset, liquidity: liquidity.clone() }.publish(&env);
        Ok(liquidity)
    }

    // ---------------------------------------------------------------- SEP-40

    pub fn base(env: Env) -> Asset {
        env.storage().instance().get(&DataKey::Base).unwrap()
    }

    pub fn assets(env: Env) -> Vec<Asset> {
        env.storage().instance().get(&DataKey::Assets).unwrap()
    }

    pub fn decimals(_env: Env) -> u32 {
        DECIMALS
    }

    pub fn resolution(env: Env) -> u32 {
        params(&env).resolution
    }

    /// The published price, or None while the asset has no price or too little liquidity.
    pub fn lastprice(env: Env, asset: Asset) -> Option<PriceData> {
        let state: AssetState = env.storage().persistent().get(&DataKey::State(asset.clone()))?;
        if state.liquidity.status != LiquidityStatus::Ok {
            return None;
        }
        history(&env, &asset).last()
    }

    /// Timestamp of the latest published price for any asset (0 if none). Lets Blend's
    /// oracle-aggregator use Fathom as a source (its PriceFeed needs `last_timestamp`).
    pub fn last_timestamp(env: Env) -> u64 {
        Self::assets(env.clone()).iter().filter_map(|a| history(&env, &a).last()).map(|p| p.timestamp).max().unwrap_or(0)
    }

    /// The latest price published at or before `timestamp`.
    pub fn price(env: Env, asset: Asset, timestamp: u64) -> Option<PriceData> {
        history(&env, &asset).iter().rev().find(|p| p.timestamp <= timestamp)
    }

    /// Up to `records` published prices, newest first.
    pub fn prices(env: Env, asset: Asset, records: u32) -> Option<Vec<PriceData>> {
        let h = history(&env, &asset);
        if h.is_empty() {
            return None;
        }
        let mut out = Vec::new(&env);
        for p in h.iter().rev().take(records as usize) {
            out.push_back(p);
        }
        Some(out)
    }

    // ---------------------------------------------------------------- depth

    /// Current depth: open standing-buy quantity within the depth floor of NAV.
    pub fn depth(env: Env, asset: Asset) -> i128 {
        Self::liquidity(env, asset).map(|l| l.depth).unwrap_or(0)
    }

    pub fn liquidity(env: Env, asset: Asset) -> Option<Liquidity> {
        let state: Option<AssetState> = env.storage().persistent().get(&DataKey::State(asset));
        state.map(|s| s.liquidity)
    }

    /// Full per-asset state (clearing window and depth history), for the dashboard.
    pub fn state(env: Env, asset: Asset) -> Option<AssetState> {
        env.storage().persistent().get(&DataKey::State(asset))
    }

    pub fn asset_config(env: Env, asset: Asset) -> Option<AssetConfig> {
        env.storage().persistent().get(&DataKey::Config(asset))
    }

    pub fn params(env: Env) -> OracleParams {
        params(&env)
    }
}

fn check(p: &OracleParams) -> Result<(), Error> {
    if p.median_window == 0 || p.median_window > 32 || p.history_cap == 0 || p.resolution == 0 {
        return Err(Error::BadParams);
    }
    Ok(())
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn params(env: &Env) -> OracleParams {
    env.storage().instance().get(&DataKey::Params).unwrap()
}

fn history(env: &Env, asset: &Asset) -> Vec<PriceData> {
    env.storage().persistent().get(&DataKey::History(asset.clone())).unwrap_or(Vec::new(env))
}

fn put<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, value: &V) {
    env.storage().persistent().set(key, value);
    env.storage().persistent().extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND);
}

/// Median; for an even count, the lower of the two middle values (conservative for lenders).
fn median(xs: &Vec<i128>) -> Option<i128> {
    let n = xs.len() as usize;
    if n == 0 {
        return None;
    }
    let mut v = [0i128; 32];
    for (i, x) in xs.iter().take(32).enumerate() {
        v[i] = x;
    }
    let s = &mut v[..n.min(32)];
    s.sort_unstable();
    Some(s[(s.len() - 1) / 2])
}

#[cfg(test)]
mod test;
