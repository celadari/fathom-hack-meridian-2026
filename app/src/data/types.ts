// What the screens render. Shaped after the contract reads (fathom-auction, fathom-oracle,
// demo pools) so the testnet source in phase 5 fills the same fields. Amounts are whole
// tokens and prices are dollars (the source converts from 7-decimal fixed point).

export type Side = "buy" | "sell";
export type LiquidityStatus = "Ok" | "LowLiquidity" | "NoPrice";
export type RejectReason = "NoPrice" | "DepthTooLow" | "InsufficientCollateral" | "PoolEmpty" | "BadAmount";

export interface SealedOrderRow {
  id: string;
  owner?: string;
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
  /** Fathom's published price (oracle), the hero's "surface". Null while not published. */
  publishedPrice: number | null;
  haircutPct: number | null;
  depth: number;
  nav: number;
  sealedCount: number;
  /** Newest first. */
  sealed: SealedOrderRow[];
  depositSizes: number[];
  standingDays: number;
  /** Oldest auction not closed yet: in its commit window, or revealing. */
  closing: { id: number; commitEnd: number; revealEnd: number };
  revealSecs: number;
  penaltyPct: number;
  grid: { min: number; tick: number; ticks: number };
  /** Id of the last closed auction, if any. */
  lastClosed: number | null;
}

export interface BookOrder {
  side: Side;
  limit: number;
  qty: number;
}

export interface FillRow {
  who: string;
  /** On-chain owner; the screen names it (bot name, "You") at render time. */
  owner?: string;
  side: Side;
  qty: number;
  limit: number;
  filled: number;
  standing: boolean;
}

export interface CloseView {
  auction: number;
  cleared: boolean;
  closedAt: number;
  price: number;
  matched: number;
  orderCount: number;
  nav: number;
  haircutPct: number;
  medianWindow: number;
  /** Price grid step (auction config). */
  tick: number;
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
  standingDays: number;
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
  /** Pool B TVL (and Pool A's, before or after the attack). */
  poolTvl: number;
  poolATvl: number;
  collateral: number;
  borrow: number;
  ltvPct: number;
  capSharePct: number;
  assessment: Assessment;
  /** stellar.expert links for each step once the replay has run on testnet. */
  txs: { pump?: string; poolA?: string; poolB?: string };
  /** "live": values read from testnet; "scenario": replay numbers not read from a contract (labelled simulated). */
  values: "live" | "scenario";
}

export type Loadable<T> =
  | { status: "loading" }
  | { status: "empty"; reason: string }
  | { status: "error"; error: string }
  | { status: "ready"; data: T };

export interface FathomData {
  /** "mock" only with ?mock (design comparison). Shown in the header badge. */
  source: "mock" | "testnet";
  auction: Loadable<AuctionView>;
  close: Loadable<CloseView>;
  liquidity: Loadable<LiquidityView>;
  replay: Loadable<ReplayView>;
  /** Known participant names by address (bots, "You"). */
  names: Record<string, string>;
  /** Shown after a close event: "Auction #N closed · $price · See results". */
  banner: { auction: number; price: number | null } | null;
  dismissBanner: () => void;
  /** Order ids that arrived by event since load: they slide in highlighted. */
  freshOrders: ReadonlySet<string>;
  refresh: () => void;
}
