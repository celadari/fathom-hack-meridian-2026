// Contract reads → view types. Every number here comes from a contract read,
// except the replay scenario's attack size, which is labelled.
import { IDS, num } from "../config";
import { read } from "../stellar/client";
import type { AuctionView, CloseView, FillRow, HistoryPoint, LiquidityStatus, LiquidityView, RejectReason, ReplayView, SealedOrderRow } from "./types";

const ASSET = () => ({ tag: "Stellar", values: [IDS.ustry] });
const STATUS: LiquidityStatus[] = ["NoPrice", "LowLiquidity", "Ok"];
const REASONS: RejectReason[] = ["NoPrice", "NoPrice", "DepthTooLow", "InsufficientCollateral", "PoolEmpty", "BadAmount"];
/** The replay's attack size (inputs, not measurements). */
export const ATTACK = { collateral: 13_000, borrow: 1_000_000, pump: 106 };

type B = bigint;
interface RawAuction { id: B; commit_end: B; reveal_end: B; orders: B[]; closed: boolean }
interface RawOrder { id: B; owner: string; auction: B; commitment: Uint8Array; side: number; standing: boolean; status: number; deposit: B; price_tick: number; qty: B; filled: B; placed_at: B }
interface RawResult { auction: B; closed_at: B; cleared: boolean; clearing_tick: number; price: B; matched: B; notional: B; order_count: number; depth: B; nav: B }
interface RawLiquidity { price: B; nav: B; haircut_bps: B; depth: B; min_depth_window: B; order_count: number; notional: B; status: number; auction: B; timestamp: B }
interface RawFill { order_id: B; owner: string; side: number; standing: boolean; price_tick: number; qty: B; filled: B }
interface RawConfig { grid_min: B; grid_max: B; tick: B }
interface RawParams { reveal_secs: B; standing_secs: B; depth_floor_bps: number; penalty_bps: number; deposit_sizes: B[] }

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const ms = (secs: B) => Number(secs) * 1000;

let staticCache: Promise<{ cfg: RawConfig; params: RawParams; oracle: { median_window: number; depth_window_secs: B } }> | null = null;
function statics() {
  staticCache ??= Promise.all([
    read<RawConfig>(IDS.auction, "config"),
    read<RawParams>(IDS.auction, "params"),
    read<{ median_window: number; depth_window_secs: B }>(IDS.oracle, "params"),
  ]).then(([cfg, params, oracle]) => ({ cfg, params, oracle }));
  staticCache.catch(() => (staticCache = null));
  return staticCache;
}

const priceOf = (cfg: RawConfig, tick: number) => num(cfg.grid_min + BigInt(tick) * cfg.tick);

export async function loadAuction(): Promise<AuctionView> {
  const [{ cfg, params }, current, closing, last, liq] = await Promise.all([
    statics(),
    read<RawAuction>(IDS.auction, "current_auction"),
    read<RawAuction>(IDS.auction, "closing_auction"),
    read<RawResult | undefined>(IDS.auction, "last_result"),
    read<RawLiquidity | undefined>(IDS.oracle, "liquidity", { asset: ASSET() }),
  ]);
  const orders = await read<RawOrder[]>(IDS.auction, "orders_in", { auction: current.id });
  const sealed: SealedOrderRow[] = orders
    .map((o) => ({
      id: o.id.toString(),
      owner: o.owner,
      fingerprint: `0x${hex(o.commitment).slice(0, 4)}…${hex(o.commitment).slice(-4)}`,
      placedAt: ms(o.placed_at),
      side: o.side === 0 ? ("buy" as const) : ("sell" as const),
      deposit: num(o.deposit),
    }))
    .reverse();
  return {
    id: Number(current.id),
    base: "USTRY",
    quote: "USDC",
    closesAt: ms(current.commit_end),
    lastClearing: last?.cleared ? num(last.price) : null,
    haircutPct: liq && liq.status !== 0 ? Number(liq.haircut_bps) / 100 : null,
    depth: liq ? num(liq.depth) : 0,
    nav: liq ? num(liq.nav) : 0,
    sealedCount: orders.filter((o) => o.status === 0).length,
    sealed,
    depositSizes: params.deposit_sizes.map(num),
    standingDays: Number(params.standing_secs) / 86_400,
    closing: { id: Number(closing.id), commitEnd: ms(closing.commit_end), revealEnd: ms(closing.reveal_end) },
    revealSecs: Number(params.reveal_secs),
    penaltyPct: params.penalty_bps / 100,
    grid: { min: num(cfg.grid_min), tick: num(cfg.tick), ticks: Number((cfg.grid_max - cfg.grid_min) / cfg.tick) + 1 },
    lastClosed: last ? Number(last.auction) : null,
  };
}

export async function loadClose(): Promise<CloseView | null> {
  const last = await read<RawResult | undefined>(IDS.auction, "last_result");
  if (!last) return null;
  const [{ cfg, oracle }, fills] = await Promise.all([statics(), read<RawFill[]>(IDS.auction, "fills", { auction: last.auction })]);
  const nav = num(last.nav);
  const price = num(last.price);
  return {
    auction: Number(last.auction),
    cleared: last.cleared,
    closedAt: ms(last.closed_at),
    price,
    matched: num(last.matched),
    orderCount: last.order_count,
    nav,
    haircutPct: nav > 0 && last.cleared ? ((nav - price) / nav) * 100 : 0,
    medianWindow: oracle.median_window,
    fills: fills.map<FillRow>((f) => ({
      who: `${f.owner.slice(0, 4)}…${f.owner.slice(-4)}`,
      owner: f.owner,
      side: f.side === 0 ? "buy" : "sell",
      qty: num(f.qty),
      limit: priceOf(cfg, f.price_tick),
      filled: num(f.filled),
      standing: f.standing,
    })),
  };
}

export async function loadLiquidity(): Promise<LiquidityView | null> {
  const [{ params, oracle }, liq, book, cap, last] = await Promise.all([
    statics(),
    read<RawLiquidity | undefined>(IDS.oracle, "liquidity", { asset: ASSET() }),
    read<RawOrder[]>(IDS.auction, "standing_book"),
    read<{ cap: B; used: B }>(IDS.poolB, "cap_status"),
    read<RawResult | undefined>(IDS.auction, "last_result"),
  ]);
  if (!liq) return null;
  const pool = await poolConfig();
  const ids = last ? Array.from({ length: Math.min(7, Number(last.auction)) }, (_, i) => last.auction - BigInt(i)).reverse() : [];
  const results = await Promise.all(ids.map((id) => read<RawResult | undefined>(IDS.auction, "result", { auction: id })));
  const history: HistoryPoint[] = results.filter((r): r is RawResult => !!r && r.cleared).map((r) => ({ auction: Number(r.auction), price: num(r.price), depth: num(r.depth) }));
  const windowSecs = Number(oracle.depth_window_secs);
  return {
    asset: "USTRY",
    assetName: "Etherfuse US Treasury token (testnet demo)",
    status: STATUS[liq.status] ?? "NoPrice",
    price: num(liq.price),
    nav: num(liq.nav),
    haircutPct: Number(liq.haircut_bps) / 100,
    depth: num(liq.depth),
    minDepthWindow: num(liq.min_depth_window),
    depthWindowLabel: windowSecs >= 86_400 ? `${Math.round(windowSecs / 86_400)} days` : windowSecs >= 3600 ? `${Math.round(windowSecs / 3600)} h` : `${Math.round(windowSecs / 60)} min`,
    depthFloorPct: params.depth_floor_bps / 100,
    standingOrders: book.length,
    medianWindow: oracle.median_window,
    history,
    poolB: { cap: num(cap.cap), used: num(cap.used), capSharePct: pool.cap_share_bps / 100 },
    simulatedAssets: SIMULATED_ASSETS,
  };
}

/** Not on-chain. The UI labels this block "Simulated testnet data". */
const SIMULATED_ASSETS = [
  { name: "CETES", color: "#40B66B", status: "Healthy", price: "$0.0571 · 0.8% cut", depth: "410,000" },
  { name: "Gold token", color: "#B7791F", status: "Thin · few orders", price: "$2,310 · 3.4% cut", depth: "6.2" },
  { name: "Invoice pool", color: "#E5484D", status: "Below minimum", price: "No price published", depth: "< $10k" },
];

let poolCache: Promise<{ ltv_bps: number; cap_share_bps: number }> | null = null;
function poolConfig() {
  poolCache ??= read<{ ltv_bps: number; cap_share_bps: number }>(IDS.poolB, "config");
  poolCache.catch(() => (poolCache = null));
  return poolCache;
}

export async function loadReplay(txs: ReplayView["txs"]): Promise<ReplayView> {
  const U = 10_000_000n;
  const [pool, dex, tvlA, tvlB, last, liq, a] = await Promise.all([
    poolConfig(),
    read<B>(IDS.dex, "price"),
    read<B>(IDS.poolA, "tvl"),
    read<B>(IDS.poolB, "tvl"),
    read<{ price: B } | undefined>(IDS.oracle, "lastprice", { asset: ASSET() }),
    read<RawLiquidity | undefined>(IDS.oracle, "liquidity", { asset: ASSET() }),
    // Pool B's verdict on the attack for a fresh account, read without sending anything.
    read<{ reasons: number[]; price: B; collateral: B; collateral_value: B; max_loan: B; requested: B; cap: B; collateral_after: B; min_depth_window: B }>(
      IDS.poolB, "assess", { user: IDS.issuer, collateral_qty: BigInt(ATTACK.collateral) * U, borrow_amount: BigInt(ATTACK.borrow) * U },
    ),
  ]);
  return {
    dexStart: num(dex),
    pumpPrice: ATTACK.pump,
    fathomPrice: last ? num(last.price) : 0,
    depth: liq ? num(liq.depth) : 0,
    poolTvl: num(tvlB),
    poolATvl: num(tvlA),
    collateral: ATTACK.collateral,
    borrow: ATTACK.borrow,
    ltvPct: pool.ltv_bps / 100,
    capSharePct: pool.cap_share_bps / 100,
    assessment: {
      reasons: a.reasons.map((r) => REASONS[Number(r)] ?? "BadAmount"),
      fathomPrice: num(a.price),
      collateral: num(a.collateral),
      collateralValue: num(a.collateral_value),
      maxLoan: num(a.max_loan),
      requested: num(a.requested),
      cap: num(a.cap),
      collateralAfter: num(a.collateral_after),
      minDepthWindow: num(a.min_depth_window),
    },
    txs,
    values: "live",
  };
}
