//! Events for every step; the frontend animates from these.
//! The close emits a single event (testnet caps events at 16 KB per transaction);
//! per-order fills are read from `fills(auction)` and payouts appear as `settled`.
use crate::types::{AuctionResult, Side};
use soroban_sdk::{contractevent, Address, BytesN};

#[contractevent(topics = ["placed"])]
pub struct OrderPlaced {
    #[topic]
    pub auction: u64,
    pub order_id: u64,
    pub owner: Address,
    pub commitment: BytesN<32>,
    pub side: Side,
    pub standing: bool,
    pub deposit: i128,
}

#[contractevent(topics = ["revealed"])]
pub struct OrderRevealed {
    #[topic]
    pub auction: u64,
    pub order_id: u64,
    pub owner: Address,
    pub side: Side,
    pub price_tick: u32,
    pub qty: i128,
}

/// Payout of an order's fill and/or leftover escrow, emitted by `settle`.
#[contractevent(topics = ["settled"])]
pub struct OrderSettled {
    #[topic]
    pub order_id: u64,
    pub owner: Address,
    pub base: i128,
    pub quote: i128,
}

#[contractevent(topics = ["closed"], data_format = "single-value")]
pub struct AuctionClosed {
    #[topic]
    pub auction: u64,
    pub result: AuctionResult,
}

#[contractevent(topics = ["advanced"])]
pub struct AuctionAdvanced {
    #[topic]
    pub auction: u64,
    pub commit_end: u64,
    pub reveal_end: u64,
}
