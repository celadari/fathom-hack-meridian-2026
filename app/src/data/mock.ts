// Mock data: the worked example and the numbers the designs show. Used only with
// ?mock (the screenshot comparison against designs/); the header then says "Mock data".
import type { AuctionView, CloseView, LiquidityView, ReplayView } from "./types";

const now = Date.now();
const min = 60_000;

export const MOCK: { auction: AuctionView; close: CloseView; liquidity: LiquidityView; replay: ReplayView } = {
  auction: {
    id: 142,
    base: "USTRY",
    quote: "USDC",
    closesAt: now + (2 * 60 + 14) * min + 37_000,
    lastClearing: 1.04,
    haircutPct: 1.9,
    depth: 24_800,
    nav: 1.06,
    sealedCount: 12,
    sealed: [
      { id: "12", fingerprint: "0x7c1e…09ab", placedAt: now - 9 * min, side: "buy", deposit: 50_000 },
      { id: "11", fingerprint: "0x2b44…e1f0", placedAt: now - 35 * min, side: "sell", deposit: 50_000 },
      { id: "10", fingerprint: "0x90d3…4c12", placedAt: now - 81 * min, side: "buy", deposit: 10_000 },
      { id: "9", fingerprint: "0x5ae7…b3d9", placedAt: now - 132 * min, side: "buy", deposit: 250_000 },
      { id: "8", fingerprint: "0xc0f2…7781", placedAt: now - 148 * min, side: "sell", deposit: 50_000 },
    ],
    depositSizes: [10_000, 50_000, 250_000],
    standingDays: 7,
    closing: { id: 142, commitEnd: now + (2 * 60 + 14) * min + 37_000, revealEnd: now + (2 * 60 + 15) * min + 37_000 },
    revealSecs: 60,
    penaltyPct: 1,
    grid: { min: 0.9, tick: 0.01, ticks: 31 },
    lastClosed: 141,
  },

  close: {
    auction: 141,
    cleared: true,
    closedAt: Date.UTC(2026, 9, 25, 16, 0),
    price: 1.04,
    matched: 30_000,
    orderCount: 4,
    nav: 1.06,
    haircutPct: 1.9,
    medianWindow: 7,
    fills: [
      { who: "Alice (fund)", side: "buy", qty: 30_000, limit: 1.04, filled: 30_000, standing: true },
      { who: "Dan", side: "buy", qty: 10_000, limit: 1.03, filled: 0, standing: false },
      { who: "Bob (holder)", side: "sell", qty: 20_000, limit: 1.02, filled: 20_000, standing: false },
      { who: "Carol (market maker)", side: "sell", qty: 15_000, limit: 1.04, filled: 10_000, standing: false },
    ],
  },

  liquidity: {
    asset: "USTRY",
    assetName: "Etherfuse US Treasury token",
    status: "Ok",
    price: 1.04,
    nav: 1.06,
    haircutPct: 1.9,
    depth: 24_800,
    minDepthWindow: 24_800,
    depthWindowLabel: "30 min",
    depthFloorPct: 5,
    standingOrders: 9,
    medianWindow: 7,
    history: [
      { auction: 135, price: 1.04, depth: 26_300 },
      { auction: 136, price: 1.045, depth: 28_600 },
      { auction: 137, price: 1.05, depth: 31_000 },
      { auction: 138, price: 1.035, depth: 24_800 },
      { auction: 139, price: 1.04, depth: 27_500 },
      { auction: 140, price: 1.045, depth: 29_800 },
      { auction: 141, price: 1.04, depth: 25_100 },
    ],
    poolB: { cap: 12_400, used: 12_400, capSharePct: 50 },
    simulatedAssets: [
      { name: "CETES", color: "#40B66B", status: "Healthy", price: "$0.0571 · 0.8% cut", depth: "410,000" },
      { name: "Gold token", color: "#B7791F", status: "Thin · few orders", price: "$2,310 · 3.4% cut", depth: "6.2" },
      { name: "Invoice pool", color: "#E5484D", status: "Below minimum", price: "No price published", depth: "< $10k" },
    ],
  },

  replay: {
    dexStart: 1.04,
    pumpPrice: 106,
    fathomPrice: 1.04,
    depth: 24_800,
    poolTvl: 1_000_000,
    poolATvl: 1_000_000,
    collateral: 13_000,
    borrow: 1_000_000,
    ltvPct: 75,
    capSharePct: 50,
    assessment: {
      reasons: ["DepthTooLow", "InsufficientCollateral"],
      fathomPrice: 1.04,
      collateral: 13_000,
      collateralValue: 13_520,
      maxLoan: 10_140,
      requested: 1_000_000,
      cap: 12_400,
      collateralAfter: 13_000,
      minDepthWindow: 24_800,
    },
    txs: {},
    values: "scenario",
  },
};
