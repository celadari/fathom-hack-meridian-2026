//! Types and client interfaces shared by the Fathom contracts.
#![no_std]

use soroban_sdk::{contractclient, contracttype, Address, Env, Symbol, Vec};

/// Fixed-point scale for prices: 7 decimals, like Stellar token amounts.
pub const PRICE_SCALE: i128 = 10_000_000;
pub const BPS: i128 = 10_000;

/// SEP-40 asset.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

/// SEP-40 price record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

/// What an auction contract pushes to the oracle after each close.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionReport {
    pub auction: u64,
    pub timestamp: u64,
    pub cleared: bool,
    /// Clearing price (7 decimals); 0 if the auction did not clear.
    pub price: i128,
    pub matched: i128,
    pub notional: i128,
    pub order_count: u32,
    /// Open standing-buy quantity priced within the depth floor of NAV.
    pub depth: i128,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum LiquidityStatus {
    /// No auction has cleared yet.
    NoPrice = 0,
    /// Last auction below the minimum notional or order count: no price published.
    LowLiquidity = 1,
    Ok = 2,
}

/// Everything a lender needs beyond SEP-40.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Liquidity {
    /// Reference price: median of recent clearing prices, capped at NAV. 0 if none.
    pub price: i128,
    /// 0 for assets without a NAV feed.
    pub nav: i128,
    /// (NAV − price) / NAV in basis points; 0 without NAV.
    pub haircut_bps: i128,
    pub depth: i128,
    /// Lowest depth over the depth window (bait-and-switch protection).
    pub min_depth_window: i128,
    pub order_count: u32,
    pub notional: i128,
    pub status: LiquidityStatus,
    pub auction: u64,
    pub timestamp: u64,
}

#[contractclient(name = "OracleClient")]
pub trait FathomOracleInterface {
    fn record(env: Env, asset: Asset, report: AuctionReport) -> Liquidity;
    fn lastprice(env: Env, asset: Asset) -> Option<PriceData>;
    fn prices(env: Env, asset: Asset, records: u32) -> Option<Vec<PriceData>>;
    fn decimals(env: Env) -> u32;
    fn depth(env: Env, asset: Asset) -> i128;
    fn liquidity(env: Env, asset: Asset) -> Option<Liquidity>;
}

/// NAV feed (contracts/mock-nav on testnet).
#[contractclient(name = "NavClient")]
pub trait NavFeed {
    fn nav(env: Env) -> i128;
}

/// Thin-market last-trade price (contracts/mock-dex-price on testnet).
#[contractclient(name = "DexPriceClient")]
pub trait DexPrice {
    fn price(env: Env) -> i128;
}
