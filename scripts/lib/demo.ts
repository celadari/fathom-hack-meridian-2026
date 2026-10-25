// Demo operations shared by the CLI scripts and the demo server: bot accounts,
// seeding sealed orders, revealing them, advancing and closing auctions, the
// attack replay and a token faucet. Keys come from the Stellar CLI keystore.
// Bot openings (the secrets needed to reveal) are kept in scripts/.state/, gitignored.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Asset, Horizon, Keypair } from "@stellar/stellar-sdk";
import { CONFIG, UNIT } from "../config.js";
import { auction, client, newSalt, read, Side, txLink, write } from "./fathom.js";
import { ensureIdentity, ensureTrustlines, horizon, readDeployment, ROOT, topUp, topUpMany } from "./stellar.js";

export const BOTS = ["alice", "bob", "carol", "dan", "eve", "frank", "grace", "heidi"] as const;
const BOT_FUNDS = 400_000;
const DEPTH_TARGET = 24_800n;
const STATE_DIR = resolve(ROOT, "scripts/.state");
const OPENINGS = resolve(STATE_DIR, "openings.json");
const LAST_REPLAY = resolve(STATE_DIR, "last-replay.json");

type Opening = { bot: string; auction: string; side: Side; price_tick: number; qty: string; salt: string; revealed?: boolean };
type Openings = Record<string, Opening>; // by order id

export type Step = { label: string; hash?: string; link?: string };
const step = (label: string, hash?: string): Step => ({ label, hash, link: hash ? txLink(hash) : undefined });

function load<T>(file: string, empty: T): T {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : empty;
}
function save(file: string, v: unknown) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(v, null, 2));
}

const d = () => readDeployment();
const assets = () => ({ ustry: new Asset("USTRY", d().issuer), usdc: new Asset("USDC", d().issuer) });
const admin = () => ensureIdentity("fathom-admin");

export function botKey(name: string): Keypair {
  return ensureIdentity(`fathom-bot-${name}`);
}

/** Public addresses of the bots, for naming participants in the UI. */
export function botAddresses(): Record<string, string> {
  return Object.fromEntries(BOTS.map((b) => [botKey(b).publicKey(), b[0].toUpperCase() + b.slice(1)]));
}

/** Friendbot + trustlines + demo tokens for every bot. Idempotent. */
export async function ensureBots(log: (s: string) => void = () => {}) {
  const issuer = ensureIdentity("fathom-issuer");
  const { ustry, usdc } = assets();
  const keys = BOTS.map(botKey); // creates and funds missing identities (sequential CLI calls)
  await Promise.all(keys.map((kp) => ensureTrustlines(kp, [ustry, usdc]))); // each bot is its own source
  const sent = await topUpMany(issuer, keys.flatMap((kp) => [ustry, usdc].map((asset) => ({ to: kp.publicKey(), asset, amount: BOT_FUNDS }))));
  log(`bots ready (${sent} top-ups)`);
}

type AuctionInfo = { id: bigint; commit_end: bigint; reveal_end: bigint; closed: boolean; orders: bigint[] };
/** Ledger time of the latest closed ledger (what the contract sees as "now"). */
async function nowSecs(): Promise<bigint> {
  const { records } = await horizon.ledgers().order("desc").limit(1).call();
  return BigInt(Math.floor(Date.parse(records[0].closed_at) / 1000));
}

/** Choose the smallest allowed deposit that covers the order. */
function depositFor(side: Side, priceTick: number, qty: bigint): bigint {
  const { grid, params } = CONFIG.auction;
  const price = grid.min + BigInt(priceTick) * grid.tick;
  const needed = side === Side.Buy ? (qty * price + UNIT - 1n) / UNIT : qty;
  const size = params.deposit_sizes.find((s) => s >= needed);
  if (!size) throw new Error(`order too large for any deposit size: ${needed}`);
  return size;
}

const tickOf = (usd: number) => Math.round((usd * 1e7 - Number(CONFIG.auction.grid.min)) / Number(CONFIG.auction.grid.tick));
const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * Seal a realistic set of bot orders into the auction taking commitments:
 * one-day sells at $1.03–1.05, one-day buys at $1.03–1.06 (so it clears near NAV
 * with ≥ 5 orders and > $10k notional), and standing buys at $1.01–1.02 that
 * top depth back up to ~24,800 without being filled.
 */
export async function seed(log: (s: string) => void = () => {}): Promise<Step[]> {
  await ensureBots(log);
  const openings = load<Openings>(OPENINGS, {});
  // Depth as the next close will measure it: live standing bids priced within the floor of NAV.
  const c0 = await auction(admin());
  const book = await read<Array<{ qty: bigint; price_tick: number }>>(c0, "standing_book");
  const floorTick = tickOf(Number(CONFIG.ustry.nav) / 1e7 * (1 - CONFIG.auction.params.depth_floor_bps / 10_000));
  const depth = book.filter((o) => o.price_tick >= floorTick).reduce((s, o) => s + o.qty, 0n) / UNIT;

  type Plan = { bot: string; side: Side; usd: number; qty: number; standing: boolean };
  const plan: Plan[] = [
    { bot: "bob", side: Side.Sell, usd: rnd(103, 104) / 100, qty: rnd(8, 20) * 1000, standing: false },
    { bot: "carol", side: Side.Sell, usd: rnd(104, 105) / 100, qty: rnd(6, 15) * 1000, standing: false },
    { bot: "frank", side: Side.Sell, usd: rnd(103, 105) / 100, qty: rnd(4, 10) * 1000, standing: false },
    { bot: "alice", side: Side.Buy, usd: rnd(104, 106) / 100, qty: rnd(10, 25) * 1000, standing: false },
    { bot: "dan", side: Side.Buy, usd: rnd(103, 104) / 100, qty: rnd(5, 12) * 1000, standing: false },
    { bot: "grace", side: Side.Buy, usd: rnd(104, 105) / 100, qty: rnd(4, 9) * 1000, standing: false },
  ];
  if (depth < DEPTH_TARGET) {
    const missing = Number(DEPTH_TARGET - depth);
    const first = Math.round(missing * 0.6 / 100) * 100;
    plan.push({ bot: "eve", side: Side.Buy, usd: 1.02, qty: first, standing: true });
    plan.push({ bot: "heidi", side: Side.Buy, usd: 1.01, qty: missing - first, standing: true });
  }

  const steps: Step[] = [];
  await Promise.all(
    plan.filter((p) => p.qty > 0).map(async (p) => {
      const kp = botKey(p.bot);
      const c = await auction(kp);
      let hash = "";
      const qty = BigInt(p.qty) * UNIT;
      const price_tick = tickOf(p.usd);
      const salt = newSalt();
      const opening = { owner: kp.publicKey(), side: p.side, price_tick, qty, salt };
      const commitment = await read<Buffer>(c, "commitment_of", opening);
      const token = p.side === Side.Buy ? d().usdc_sac : d().ustry_sac;
      const deposit_amount = depositFor(p.side, price_tick, qty);
      // Save the opening before sending: without it the order can never be revealed (1% penalty).
      const key = `pending:${Buffer.from(commitment).toString("hex")}`;
      openings[key] = { bot: p.bot, auction: "", side: p.side, price_tick, qty: qty.toString(), salt: salt.toString("hex") };
      save(OPENINGS, openings);
      const { value: id } = await write<bigint>(c, "place_order", {
        owner: kp.publicKey(), commitment, deposit_token: token, deposit_amount, standing: p.standing,
      }, { writeSlack: 512 }).then((r) => ((hash = r.hash), r));
      const o = await read<{ auction: bigint }>(c, "order", { id });
      delete openings[key];
      openings[id.toString()] = { bot: p.bot, auction: o.auction.toString(), side: p.side, price_tick, qty: qty.toString(), salt: salt.toString("hex") };
      save(OPENINGS, openings);
      const label = `${p.bot} sealed order #${id}${p.standing ? " (standing)" : ""}`;
      log(label);
      steps.push(step(label, hash));
    }),
  );
  save(OPENINGS, openings);
  return steps;
}

/** Find the on-chain order for openings saved before a send that never confirmed. */
async function recoverPending(openings: Openings) {
  for (const [key, o] of Object.entries(openings)) {
    if (!key.startsWith("pending:")) continue;
    const kp = botKey(o.bot);
    const mine = await read<Array<{ id: bigint; auction: bigint; commitment: Buffer }>>(await auction(kp), "orders_of", { owner: kp.publicKey() });
    const hit = mine.find((m) => Buffer.from(m.commitment).toString("hex") === key.slice(8));
    if (hit) {
      openings[hit.id.toString()] = { ...o, auction: hit.auction.toString() };
      delete openings[key];
    }
  }
}

/** Reveal every bot order committed into `auctionId` that is still sealed. */
export async function revealBots(auctionId: bigint, log: (s: string) => void = () => {}): Promise<Step[]> {
  const openings = load<Openings>(OPENINGS, {});
  // Orders whose send outcome is unknown ("pending:<commitment>") are matched to their ids first.
  await recoverPending(openings);
  const pending = Object.entries(openings).filter(([, o]) => o.auction === auctionId.toString() && !o.revealed);
  const steps: Step[] = [];
  const a = await read<AuctionInfo | undefined>(await auction(admin()), "auction", { id: auctionId });
  const now = await nowSecs();
  if (!a || now < a.commit_end || now >= a.reveal_end) {
    if (pending.length) log(`auction #${auctionId} is not in its reveal window; ${pending.length} bot orders stay sealed`);
    return steps;
  }
  // One failed reveal must not stop the others.
  const results = await Promise.allSettled(
    pending.map(async ([id, o]) => {
      const kp = botKey(o.bot);
      const c = await auction(kp);
      const order = await read<{ status: number }>(c, "order", { id: BigInt(id) });
      if (order.status !== 0) {
        o.revealed = true;
        return;
      }
      const { hash } = await write(c, "reveal", {
        owner: kp.publicKey(), order_id: BigInt(id), side: o.side, price_tick: o.price_tick, qty: BigInt(o.qty), salt: Buffer.from(o.salt, "hex"),
      });
      o.revealed = true;
      log(`${o.bot} revealed #${id}`);
      steps.push(step(`${o.bot} revealed order #${id}`, hash));
    }),
  );
  results.forEach((r, i) => r.status === "rejected" && log(`reveal of #${pending[i][0]} failed: ${String(r.reason?.message ?? r.reason).slice(0, 160)}`));
  save(OPENINGS, openings);
  return steps;
}

/** Demo: end the commit window of the auction about to close (if still open), then reveal the bots. */
export async function endCommits(log: (s: string) => void = () => {}): Promise<{ auction: string; revealEnd: string; steps: Step[] }> {
  const c = await auction(admin());
  const steps: Step[] = [];
  // Close empty auctions whose window already passed, so this lands on the one with orders.
  for (;;) {
    const [closing, current] = await Promise.all([read<AuctionInfo>(c, "closing_auction"), read<AuctionInfo>(c, "current_auction")]);
    if (closing.id >= current.id || closing.orders.length > 0) break;
    steps.push(...(await closeAndSettle(log)).steps);
  }
  let a = await read<AuctionInfo>(c, "closing_auction");
  const now = await nowSecs();
  if (now < a.commit_end) {
    const { hash } = await write(c, "fast_forward");
    steps.push(step(`ended commits for auction #${a.id}`, hash));
    a = await read<AuctionInfo>(c, "closing_auction");
  }
  steps.push(...(await revealBots(a.id, log)));
  return { auction: a.id.toString(), revealEnd: a.reveal_end.toString(), steps };
}

/** Demo: end the reveal window (if still open), close the auction and settle every payout. */
export async function closeAndSettle(log: (s: string) => void = () => {}): Promise<{ auction: string; steps: Step[]; result: Record<string, string> }> {
  const c = await auction(admin());
  const steps: Step[] = [];
  const a = await read<AuctionInfo>(c, "closing_auction");
  const now = await nowSecs();
  if (now < a.commit_end) throw new Error(`auction #${a.id} is still taking orders; end commits first`);
  if (now < a.reveal_end) {
    const { hash } = await write(c, "fast_forward");
    steps.push(step(`ended reveals for auction #${a.id}`, hash));
  }
  const { value: r, hash } = await write<Record<string, bigint | boolean>>(c, "close_auction");
  steps.push(step(`closed auction #${r.auction}`, hash));
  log(`closed auction #${r.auction}`);
  const info = await read<{ to_settle: bigint[] }>(c, "auction", { id: r.auction });
  for (let i = 0; i < info.to_settle.length; i += 8) {
    const { hash: h } = await write(c, "settle", { order_ids: info.to_settle.slice(i, i + 8) });
    steps.push(step(`settled ${Math.min(8, info.to_settle.length - i)} orders`, h));
  }
  return { auction: String(r.auction), steps, result: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])) };
}

/**
 * One tick of the automatic loop (non-demo timing): reveal bots during reveal windows,
 * close auctions whose reveal ended, and seed when the open auction has no bot orders.
 */
export async function loopTick(log: (s: string) => void = console.log) {
  const c = await auction(admin());
  const [closing, current] = await Promise.all([read<AuctionInfo>(c, "closing_auction"), read<AuctionInfo>(c, "current_auction")]);
  const now = await nowSecs();
  if (now >= closing.commit_end && now < closing.reveal_end) await revealBots(closing.id, log);
  if (now >= closing.reveal_end) await closeAndSettle(log);
  const openings = load<Openings>(OPENINGS, {});
  if (!Object.values(openings).some((o) => o.auction === current.id.toString())) await seed(log);
}

// ------------------------------------------------------------------ replay

const COLLATERAL = 13_000n * UNIT;
const BORROW = 1_000_000n * UNIT;
const PUMP = 106n * UNIT;

export type ReplayRun = { at: number; steps: Partial<Record<"reset" | "pump" | "poolA" | "poolB", Step>>; assessment?: Record<string, unknown> };

export function lastReplay(): ReplayRun | null {
  return load<ReplayRun | null>(LAST_REPLAY, null);
}

/** Run one replay step on testnet: 0 reset, 1 pump, 2 Pool A borrow, 3 Pool B attempt_borrow. */
export async function replayStep(n: 0 | 1 | 2 | 3): Promise<ReplayRun> {
  const run: ReplayRun = n === 0 ? { at: Date.now(), steps: {} } : (lastReplay() ?? { at: Date.now(), steps: {} });
  const dep = d();
  const attacker = ensureIdentity("fathom-attacker");
  if (n === 0) {
    const issuer = ensureIdentity("fathom-issuer");
    await ensureTrustlines(attacker, [assets().ustry, assets().usdc]);
    await topUp(issuer, attacker.publicKey(), assets().ustry, Number(COLLATERAL / UNIT));
    const { hash } = await write(await client(dep.mock_dex_price, admin()), "trade", { trader: admin().publicKey(), price: CONFIG.ustry.dexStart });
    const usdc = await client(dep.usdc_sac, admin());
    for (const pool of [dep.pool_a, dep.pool_b]) {
      const have = await read<bigint>(usdc, "balance", { id: pool });
      if (have < CONFIG.pools.tvl) await write(usdc, "transfer", { from: admin().publicKey(), to: pool, amount: CONFIG.pools.tvl - have });
    }
    run.steps.reset = step("DEX back to $1.04, pools refilled to $1M", hash);
  } else if (n === 1) {
    const { hash } = await write(await client(dep.mock_dex_price, attacker), "trade", { trader: attacker.publicKey(), price: PUMP });
    run.steps.pump = step("Attacker pumps the DEX to $106 with one trade", hash);
  } else if (n === 2) {
    const { hash } = await write(await client(dep.pool_a, attacker), "borrow", { user: attacker.publicKey(), collateral_qty: COLLATERAL, borrow_amount: BORROW });
    run.steps.poolA = step("Pool A lends $1M against 13,000 USTRY", hash);
  } else {
    const { value, hash } = await write<Record<string, unknown>>(await client(dep.pool_b, attacker), "attempt_borrow", {
      user: attacker.publicKey(), collateral_qty: COLLATERAL, borrow_amount: BORROW,
    });
    run.steps.poolB = step("Pool B rejects the same request (recorded on-chain)", hash);
    run.assessment = JSON.parse(JSON.stringify(value, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
  }
  save(LAST_REPLAY, run);
  return run;
}

export const ATTACK = { collateral: COLLATERAL, borrow: BORROW, pump: PUMP, attacker: () => ensureIdentity("fathom-attacker").publicKey() };

// ------------------------------------------------------------------ faucet

/** Send demo USTRY and USDC to a user's account (it needs both trustlines). */
export async function faucet(address: string, amount = 250_000): Promise<Step[]> {
  const issuer = ensureIdentity("fathom-issuer");
  const { ustry, usdc } = assets();
  let account: Horizon.AccountResponse;
  try {
    account = await horizon.loadAccount(address);
  } catch {
    throw new Error("account not found on testnet: fund it with Friendbot first");
  }
  const has = (a: Asset) => account.balances.some((b) => "asset_code" in b && b.asset_code === a.code && b.asset_issuer === a.issuer);
  if (!has(ustry) || !has(usdc)) throw new Error("add the USTRY and USDC trustlines first");
  await topUp(issuer, address, ustry, amount);
  await topUp(issuer, address, usdc, amount);
  return [step(`sent up to ${amount.toLocaleString("en-US")} USTRY and USDC`)];
}
