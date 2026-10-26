// Demo operations shared by the CLI scripts and the demo server: bot accounts,
// seeding sealed orders, revealing them, advancing and closing auctions, the
// attack replay and a token faucet. Keys come from the Stellar CLI keystore.
// Bot openings (the secrets needed to reveal) are kept in scripts/.state/, gitignored.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Asset, Keypair } from "@stellar/stellar-sdk";
import { CONFIDENTIAL, CONFIG, UNIT } from "../config.js";
import { depositTransfer, ensureRegistered, ensureSpendable, payoutTransfer, toBytes32 } from "./confidential.js";
import { auction, client, newSalt, read, Side, txLink, write } from "./fathom.js";
import { accountExists, ensureIdentity, ensureTrustlines, readDeployment, ROOT, server, topUp, topUpMany, trustBalance } from "./stellar.js";

export const BOTS = ["alice", "bob", "carol", "dan", "eve", "frank", "grace", "heidi"] as const;
const BOT_FUNDS = 400_000;
const DEPTH_TARGET = 24_800n;
// Bot openings and the last replay. On the hosted server this points at a persistent volume.
const STATE_DIR = process.env.FATHOM_STATE_DIR ?? resolve(ROOT, "scripts/.state");
const OPENINGS = resolve(STATE_DIR, "openings.json");
const LAST_REPLAY = resolve(STATE_DIR, "last-replay.json");
/** CONFIDENTIAL: closed auctions whose confidential payouts are not all sent yet (settlement resumes). */
const PENDING_SETTLE = resolve(STATE_DIR, "pending-settle.json");
/** CONFIDENTIAL: public units each bot wraps into a confidential token when its balance runs low. */
const CONF_WRAP = 200_000n * UNIT;

type Opening = {
  bot: string; auction: string; side: Side; price_tick: number; qty: string; salt: string; revealed?: boolean;
  /** CONFIDENTIAL: the deposit's opening (amount, blinding hex), disclosed at reveal. */
  amount?: string; blinding?: string;
};
type Openings = Record<string, Opening>; // by order id

export type Step = { label: string; hash?: string; link?: string };
const step = (label: string, hash?: string): Step => ({ label, hash, link: hash ? txLink(hash) || undefined : undefined });

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
/**
 * Source account for permissionless calls (close, settle, payouts). With CONFIDENTIAL its own
 * account, so a confidential stack and the fixed-size one never collide on a sequence number.
 */
const operator = () => (CONFIDENTIAL ? ensureIdentity("fathom-settler") : admin());

export function botKey(name: string): Keypair {
  return ensureIdentity(CONFIDENTIAL ? `fathom-cbot-${name}` : `fathom-bot-${name}`);
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
  return BigInt((await server.getLatestLedger()).closeTime);
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
  // Confidential deposits need a proof each, made one at a time: seal sequentially.
  const each = async <T,>(xs: T[], f: (x: T) => Promise<void>) => (CONFIDENTIAL ? xs.reduce((a, x) => a.then(() => f(x)), Promise.resolve()) : Promise.all(xs.map(f)).then(() => undefined));
  await each(
    plan.filter((p) => p.qty > 0), async (p) => {
      const kp = botKey(p.bot);
      const c = await auction(kp);
      let hash = "";
      const qty = BigInt(p.qty) * UNIT;
      const price_tick = tickOf(p.usd);
      const salt = newSalt();
      const opening = { owner: kp.publicKey(), side: p.side, price_tick, qty, salt };
      const commitment = await read<Buffer>(c, "commitment_of", opening);
      const key = `pending:${Buffer.from(commitment).toString("hex")}`;
      let id: bigint;
      let conf: { amount?: string; blinding?: string } = {};
      if (CONFIDENTIAL) {
        // Any amount: exactly what the order needs. Payouts in both tokens need both registrations.
        const ctoken = p.side === Side.Buy ? d().conf_usdc : d().conf_ustry;
        const grid = CONFIG.auction.grid;
        const amount = p.side === Side.Buy ? (qty * (grid.min + BigInt(price_tick) * grid.tick) + UNIT - 1n) / UNIT : qty;
        for (const t of [d().conf_usdc, d().conf_ustry]) if (await ensureRegistered(kp, t)) log(`${p.bot} registered on ${t.slice(0, 6)}…`);
        await ensureSpendable(kp, ctoken, amount, CONF_WRAP);
        const { data, opening, ms } = await depositTransfer(kp, ctoken, d().auction, amount);
        conf = { amount: opening.amount.toString(), blinding: opening.blinding.toString(16) };
        openings[key] = { bot: p.bot, auction: "", side: p.side, price_tick, qty: qty.toString(), salt: salt.toString("hex"), ...conf };
        save(OPENINGS, openings);
        log(`${p.bot} proved its confidential deposit in ${(ms / 1000).toFixed(1)}s`);
        ({ value: id } = await write<bigint>(c, "place_order_confidential", {
          owner: kp.publicKey(), commitment, side: p.side, standing: p.standing, data,
        }, { writeSlack: 512 }).then((r) => ((hash = r.hash), r)));
      } else {
        const token = p.side === Side.Buy ? d().usdc_sac : d().ustry_sac;
        const deposit_amount = depositFor(p.side, price_tick, qty);
        // Save the opening before sending: without it the order can never be revealed (1% penalty).
        openings[key] = { bot: p.bot, auction: "", side: p.side, price_tick, qty: qty.toString(), salt: salt.toString("hex") };
        save(OPENINGS, openings);
        ({ value: id } = await write<bigint>(c, "place_order", {
          owner: kp.publicKey(), commitment, deposit_token: token, deposit_amount, standing: p.standing,
        }, { writeSlack: 512 }).then((r) => ((hash = r.hash), r)));
      }
      const o = await read<{ auction: bigint }>(c, "order", { id });
      delete openings[key];
      openings[id.toString()] = { bot: p.bot, auction: o.auction.toString(), side: p.side, price_tick, qty: qty.toString(), salt: salt.toString("hex"), ...conf };
      save(OPENINGS, openings);
      const label = `${p.bot} sealed order #${id}${p.standing ? " (standing)" : ""}`;
      log(label);
      steps.push(step(label, hash));
    },
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
  // Parallel across bots, sequential per bot: two transactions from the same account at once
  // collide on its sequence number (TRY_AGAIN_LATER, or stuck pending). One failure must not stop the others.
  const byBot = new Map<string, [string, Opening][]>();
  for (const e of pending) byBot.set(e[1].bot, [...(byBot.get(e[1].bot) ?? []), e]);
  const revealOne = async ([id, o]: [string, Opening]) => {
      const kp = botKey(o.bot);
      const c = await auction(kp);
      const order = await read<{ status: number }>(c, "order", { id: BigInt(id) });
      if (order.status !== 0) {
        o.revealed = true;
        return;
      }
      const args = { owner: kp.publicKey(), order_id: BigInt(id), side: o.side, price_tick: o.price_tick, qty: BigInt(o.qty), salt: Buffer.from(o.salt, "hex") };
      const { hash } = o.amount !== undefined
        ? await write(c, "reveal_confidential", { ...args, amount: BigInt(o.amount), blinding: toBytes32(BigInt(`0x${o.blinding}`)) })
        : await write(c, "reveal", args);
      o.revealed = true;
      log(`${o.bot} revealed #${id}`);
      steps.push(step(`${o.bot} revealed order #${id}`, hash));
  };
  await Promise.all(
    [...byBot.values()].map(async (orders) => {
      for (const e of orders) {
        await revealOne(e).catch((err) => log(`reveal of #${e[0]} failed: ${String(err?.message ?? err).slice(0, 160)}`));
      }
    }),
  );
  save(OPENINGS, openings);
  return steps;
}

/** Demo: end the commit window of the auction about to close (if still open), then reveal the bots. */
export async function endCommits(log: (s: string) => void = () => {}): Promise<{ auction: string; revealEnd: string; steps: Step[] }> {
  const c = await auction(operator());
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
    const { hash } = await write(await auction(admin()), "fast_forward");
    steps.push(step(`ended commits for auction #${a.id}`, hash));
    a = await read<AuctionInfo>(c, "closing_auction");
  }
  steps.push(...(await revealBots(a.id, log)));
  return { auction: a.id.toString(), revealEnd: a.reveal_end.toString(), steps };
}

/** Demo: end the reveal window (if still open), close the auction and settle every payout. */
export async function closeAndSettle(log: (s: string) => void = () => {}): Promise<{ auction: string; steps: Step[]; result: Record<string, string> }> {
  const c = await auction(operator());
  const steps: Step[] = [];
  const a = await read<AuctionInfo>(c, "closing_auction");
  const now = await nowSecs();
  if (now < a.commit_end) throw new Error(`auction #${a.id} is still taking orders; end commits first`);
  if (now < a.reveal_end) {
    const { hash } = await write(await auction(admin()), "fast_forward");
    steps.push(step(`ended reveals for auction #${a.id}`, hash));
  }
  const { value: r, hash } = await write<Record<string, bigint | boolean>>(c, "close_auction");
  steps.push(step(`closed auction #${r.auction}`, hash));
  log(`closed auction #${r.auction}`);
  const info = await read<{ to_settle: bigint[] }>(c, "auction", { id: r.auction });
  if (CONFIDENTIAL) {
    const pending = load<string[]>(PENDING_SETTLE, []);
    save(PENDING_SETTLE, [...new Set([...pending, String(r.auction)])]);
    steps.push(...(await settleConfidential(log)));
  }
  for (let i = 0; i < info.to_settle.length; i += 8) {
    const { hash: h } = await write(c, "settle", { order_ids: info.to_settle.slice(i, i + 8) });
    steps.push(step(`settled ${Math.min(8, info.to_settle.length - i)} orders`, h));
  }
  return { auction: String(r.auction), steps, result: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])) };
}

/**
 * CONFIDENTIAL: pay every recorded amount of the closed auctions still pending, one proof at a time.
 * Unrevealed bot deposits are opened first (their openings are on disk). Safe to rerun: paid
 * amounts are zero on-chain and skipped, so if the server stops, the next run resumes.
 */
export async function settleConfidential(log: (s: string) => void = () => {}): Promise<Step[]> {
  const pending = load<string[]>(PENDING_SETTLE, []);
  if (!pending.length) return [];
  const c = await auction(operator());
  const steps: Step[] = [];
  const openings = load<Openings>(OPENINGS, {});
  // Sent even when simulation sees nothing to merge (it then reads as a read-only call).
  const { hash: mh } = await write(c, "merge_confidential", {}, { force: true });
  steps.push(step("auction merged its received deposits", mh));
  type Ord = { id: bigint; owner: string; status: number; owed_base: bigint; owed_quote: bigint };
  for (const auctionId of [...pending]) {
    const a = await read<{ orders: bigint[]; to_settle: bigint[] }>(c, "auction", { id: BigInt(auctionId) });
    let left = 0;
    for (const id of [...new Set([...a.orders, ...a.to_settle].map(String))].map(BigInt)) {
      const dep = await read<{ opened: boolean } | undefined>(c, "conf_deposit", { order_id: id });
      if (!dep) continue;
      let o = await read<Ord>(c, "order", { id });
      if (!dep.opened && o.status === 2) {
        const op = openings[id.toString()];
        if (op?.amount === undefined) {
          log(`order #${id}: unrevealed user deposit, opening not known here yet`);
          left++;
          continue;
        }
        const { hash } = await write(c, "open_deposit", { order_id: id, amount: BigInt(op.amount), blinding: toBytes32(BigInt(`0x${op.blinding}`)) });
        steps.push(step(`opened unrevealed deposit #${id} (1% penalty)`, hash));
        o = await read<Ord>(c, "order", { id });
      }
      for (const [base, amount] of [[true, o.owed_base], [false, o.owed_quote]] as const) {
        if (amount <= 0n) continue;
        try {
          const token = base ? d().conf_ustry : d().conf_usdc;
          const { data, opening, ms } = await payoutTransfer(token, d().auction, o.owner, amount);
          const { hash } = await write(c, "pay_confidential", { order_id: id, base, amount, blinding: toBytes32(opening.blinding), data });
          const label = `paid order #${id} its ${base ? "USTRY" : "USDC"} (proof ${(ms / 1000).toFixed(1)}s)`;
          log(label);
          steps.push(step(label, hash));
        } catch (e) {
          left++;
          log(`payout of #${id} failed, will retry: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
        }
      }
    }
    if (left === 0) save(PENDING_SETTLE, load<string[]>(PENDING_SETTLE, []).filter((x) => x !== auctionId));
  }
  return steps;
}

/**
 * One tick of the automatic loop (non-demo timing): reveal bots during reveal windows,
 * close auctions whose reveal ended, and seed when the open auction has no bot orders.
 */
export async function loopTick(log: (s: string) => void = console.log) {
  const c = await auction(operator());
  const [closing, current] = await Promise.all([read<AuctionInfo>(c, "closing_auction"), read<AuctionInfo>(c, "current_auction")]);
  const now = await nowSecs();
  if (now >= closing.commit_end && now < closing.reveal_end) await revealBots(closing.id, log);
  if (now >= closing.reveal_end) await closeAndSettle(log);
  else if (CONFIDENTIAL) await settleConfidential(log); // resume payouts left by a restart or a failure
  const openings = load<Openings>(OPENINGS, {});
  if (!Object.values(openings).some((o) => o.auction === current.id.toString())) await seed(log);
}

// ------------------------------------------------------------------ replay

const { collateral: COLLATERAL, borrow: BORROW, pump: PUMP } = CONFIG.replay;

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
  if (!(await accountExists(address))) throw new Error("account not found on the network: fund it with Friendbot first");
  if ((await trustBalance(address, ustry)) === null || (await trustBalance(address, usdc)) === null) throw new Error("add the USTRY and USDC trustlines first");
  await topUp(issuer, address, ustry, amount);
  await topUp(issuer, address, usdc, amount);
  return [step(`sent up to ${amount.toLocaleString("en-US")} USTRY and USDC`)];
}
