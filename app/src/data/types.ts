// What the screens render. Shaped after the contract reads (fathom-auction, fathom-oracle,
// demo pools) so the testnet source in phase 5 fills the same fields. Amounts are whole
// tokens and prices are dollars (the source converts from 7-decimal fixed point).

export type Side = "buy" | "sell";
export type LiquidityStatus = "Ok" | "LowLiquidity" | "NoPrice";
export type RejectReason = "NoPrice" | "DepthTooLow" | "InsufficientCollateral" | "PoolEmpty" | "BadAmount";

export interface SealedOrderRow {
  id: string;
  /** Commitment hash, shown shortened. */
  fingerprint: string;
  placedAt: number; // ms since epoch
  side: Side; // visible on-chain (deposit token)
  deposit: number; // visible on-chain (one of the fixed sizes)
}

export interface AuctionView {
  id: number;
  base: string;
  quote: string;
  /** End of the commit window, ms since epoch. */
  closesAt: number;
  lastClearing: number | null;
  haircutPct: number | null;
  depth: number;
  nav: number;
  sealedCount: number;
  /** Newest first. */
  sealed: SealedOrderRow[];
  depositSizes: number[];
  standingDays: number;
}

export interface BookOrder {
  side: Side;
  limit: number;
  qty: number;
}

export interface FillRow {
  who: string;
  side: Side;
  qty: number;
  limit: number;
  filled: number;
  standing: boolean;
}

export interface CloseView {
  auction: number;
  closedAt: number;
  price: number;
  matched: number;
  orderCount: number;
  nav: number;
  haircutPct: number;
  medianWindow: number;
  /** Revealed orders and their fills, in reveal order. */
  fills: FillRow[];
}

export interface HistoryPoint {
  auction: number;
  price: number;
  depth: number;
}

export interface OtherAsset {
  name: string;
  color: string;
  status: string;
  price: string;
  depth: string;
}

export interface LiquidityView {
  asset: string;
  assetName: string;
  status: LiquidityStatus;
  price: number;
  nav: number;
  haircutPct: number;
  depth: number;
  minDepthWindow: number;
  depthWindowLabel: string;
  depthFloorPct: number;
  standingOrders: number;
  medianWindow: number;
  /** Oldest first. */
  history: HistoryPoint[];
  poolB: { cap: number; used: number; capSharePct: number };
  /** Not on-chain: always shown as "Simulated testnet data". */
  simulatedAssets: OtherAsset[];
}

export interface Assessment {
  reasons: RejectReason[];
  fathomPrice: number;
  collateral: number;
  collateralValue: number;
  maxLoan: number;
  requested: number;
  cap: number;
  collateralAfter: number;
  minDepthWindow: number;
}

export interface ReplayView {
  dexStart: number;
  pumpPrice: number;
  fathomPrice: number;
  depth: number;
  poolTvl: number;
  collateral: number;
  borrow: number;
  ltvPct: number;
  assessment: Assessment;
  /** stellar.expert links for each step once the replay has run on testnet. */
  txs: { pump?: string; poolA?: string; poolB?: string };
}

export interface FathomData {
  /** "mock" until phase 5 wires testnet reads. Shown in the header badge. */
  source: "mock" | "testnet";
  auction: AuctionView;
  close: CloseView;
  liquidity: LiquidityView;
  replay: ReplayView;
}
