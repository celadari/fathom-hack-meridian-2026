use soroban_sdk::{contracterror, contracttype, Address, BytesN, Vec};

pub use fathom_common::{BPS, PRICE_SCALE};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    BadConfig = 1,
    BadDepositToken = 2,
    BadDepositSize = 3,
    StandingMustBeBuy = 4,
    OrderNotFound = 5,
    NotOwner = 6,
    AlreadyRevealed = 7,
    NotRevealWindow = 8,
    CommitmentMismatch = 9,
    SideMismatch = 10,
    PriceOffGrid = 11,
    BadQuantity = 12,
    Underfunded = 13,
    NotReadyToClose = 14,
    NotDemo = 15,
    SaltOutOfField = 16,
    NotClosed = 17,
    CommitmentExists = 18,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Side {
    Buy = 0,
    Sell = 1,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OrderStatus {
    /// Committed; price and quantity still hidden.
    Sealed = 0,
    /// Revealed and in the book (a standing order stays Live across auctions).
    Live = 1,
    /// Out of the book: filled, refunded, expired or penalized. Any payout is in owed_*.
    Done = 2,
}

/// Auction parameters. Our own choices; the oracle and pools hold the others
/// (median window, minimum liquidity, cap share). scripts/deploy.ts sets them all.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Params {
    pub period_secs: u64,
    pub reveal_secs: u64,
    pub standing_secs: u64,
    pub depth_floor_bps: u32,
    pub penalty_bps: u32,
    /// Allowed deposit amounts (base units), so escrow does not leak exact size.
    pub deposit_sizes: Vec<i128>,
    /// Enables `fast_forward` for the live demo.
    pub demo: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub base_token: Address,
    pub quote_token: Address,
    pub nav_feed: Address,
    /// Fathom oracle to push each result to (set after the oracle registers this auction).
    pub oracle: Option<Address>,
    pub grid_min: i128,
    pub grid_max: i128,
    pub tick: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Auction {
    pub id: u64,
    pub commit_end: u64,
    pub reveal_end: u64,
    /// Orders committed into this auction.
    pub orders: Vec<u64>,
    pub closed: bool,
    /// Set at the close: orders with a payout to settle.
    pub to_settle: Vec<u64>,
}

/// One row of the revealed-orders table for a closed auction.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Fill {
    pub order_id: u64,
    pub owner: Address,
    pub side: Side,
    pub standing: bool,
    pub price_tick: u32,
    /// Quantity in the book when the auction closed.
    pub qty: i128,
    pub filled: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub id: u64,
    pub owner: Address,
    pub auction: u64,
    pub commitment: BytesN<32>,
    /// Implied by the deposit token (quote = buy), so visible from the start.
    pub side: Side,
    pub standing: bool,
    pub status: OrderStatus,
    /// Remaining escrow, in the deposit token.
    pub deposit: i128,
    /// Limit price tick; 0 until revealed.
    pub price_tick: u32,
    /// Remaining (unfilled) quantity of base token; 0 until revealed.
    pub qty: i128,
    pub filled: i128,
    /// Payouts recorded at the close, paid out by `settle`.
    pub owed_base: i128,
    pub owed_quote: i128,
    pub placed_at: u64,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionResult {
    pub auction: u64,
    pub closed_at: u64,
    pub cleared: bool,
    pub clearing_tick: u32,
    /// Clearing price (7 decimals); 0 if the auction did not clear.
    pub price: i128,
    pub matched: i128,
    /// matched × price, in quote units.
    pub notional: i128,
    /// Revealed orders that took part, including carried standing orders.
    pub order_count: u32,
    /// Open standing-buy quantity priced within the depth floor of NAV, after settlement.
    pub depth: i128,
    pub nav: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Config,
    Params,
    /// Auction currently accepting commitments.
    Current,
    /// Oldest auction not closed yet.
    NextToClose,
    Auction(u64),
    Order(u64),
    OwnerOrders(Address),
    /// Live standing orders carried from auction to auction.
    Standing,
    Result(u64),
    /// Revealed orders and their fills, per closed auction.
    Fills(u64),
    LastResult,
    /// Penalties collected from unrevealed orders: (base, quote).
    Fees,
    /// Tick of the most recent auction that cleared (tie-break anchor).
    LastClearTick,
}
