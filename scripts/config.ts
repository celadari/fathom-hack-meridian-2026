// Every Fathom parameter in one place. These are our own reasonable choices for
// the hackathon, not sourced values. Demo timers are short; production would run
// one auction per day and use a depth window of several weeks.
//
// All prices and amounts are 7-decimal fixed point ($1.06 = 10_600_000n).

export const UNIT = 10_000_000n;

/**
 * CONFIDENTIAL_DEPOSITS=true: deposits go through OpenZeppelin confidential tokens (any amount,
 * hidden in Pedersen commitments) instead of fixed-size escrow. Off by default. The settlement
 * server proves every payout (~20 s per proof on the e2-micro, one transaction per ledger), so
 * auctions run 8 minutes instead of 3. Uses its own deployment (deployments/testnet-confidential.json).
 */
export const CONFIDENTIAL = process.env.CONFIDENTIAL_DEPOSITS === "true";
const usd = (n: number) => BigInt(Math.round(n * 100)) * (UNIT / 100n);

export const CONFIG = {
  ustry: {
    nav: usd(1.06), // mock NAV feed
    dexStart: usd(1.04), // mock thin-DEX last trade price
  },

  // Treasury the admin account holds for seeding bots and pools.
  treasury: { USTRY: 10_000_000, USDC: 50_000_000 },

  auction: {
    grid: { min: usd(0.9), max: usd(1.2), tick: usd(0.01) },
    params: {
      period_secs: CONFIDENTIAL ? 480 : 180,
      reveal_secs: CONFIDENTIAL ? 120 : 60,
      standing_secs: 7 * 86_400, // standing buy orders last 7 days, no cancel
      depth_floor_bps: 500, // depth counts standing bids at most 5% below NAV
      penalty_bps: 100, // unrevealed orders lose 1% of their deposit
      deposit_sizes: [10_000n, 50_000n, 250_000n].map((n) => n * UNIT), // fixed sizes hide exact amounts
      demo: true, // enables fast_forward ("Next auction" button)
    },
  },

  oracle: {
    resolution: CONFIDENTIAL ? 480 : 180, // = auction period
    median_window: 7, // median of the last 7 clearing prices
    min_notional: 10_000n * UNIT, // no price below $10k notional...
    min_orders: 5, // ...or fewer than 5 orders
    depth_window_secs: 30 * 60, // pools use the lowest depth over this window (production: weeks)
    history_cap: 64,
  },

  // The attack replay's inputs (scenario we chose, not measurements).
  replay: {
    collateral: 13_000n * UNIT, // USTRY the attacker posts
    borrow: 1_000_000n * UNIT, // USDC asked from each pool
    pump: 106n * UNIT, // DEX price after one trade (×100 the $1.06 NAV)
  },

  pools: {
    ltv_bps: 7_500, // each pool's own choice
    cap_share_bps: 5_000, // Pool B caps total USTRY collateral at 50% of min depth
    tvl: 1_000_000n * UNIT, // USDC each demo pool starts with
  },
};
