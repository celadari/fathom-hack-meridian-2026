// Run the worked example as a real auction on testnet:
//   Alice buys 30,000 at <= $1.04 (standing)   Bob sells 20,000 at >= $1.02
//   Dan   buys 10,000 at <= $1.03              Carol sells 15,000 at >= $1.04
// Expected: clearing $1.04, 30,000 matched, Carol sells 10,000 of 15,000, Dan refunded.
//
//   npm run worked-example
import { Asset, Keypair } from "@stellar/stellar-sdk";
import { auction, client, Dyn, fmt, newSalt, read, Side, txLink, UNIT, write } from "./lib/fathom.js";
import { ensureIdentity, ensureTrustlines, readDeployment, topUp } from "./lib/stellar.js";

const BOT_FUNDS = 250_000;
const DEPOSIT = 50_000n * UNIT;

type Plan = { name: string; side: Side; price: bigint; qty: bigint; standing: boolean };
const PLAN: Plan[] = [
  { name: "alice", side: Side.Buy, price: 10_400_000n, qty: 30_000n, standing: true },
  { name: "dan", side: Side.Buy, price: 10_300_000n, qty: 10_000n, standing: false },
  { name: "bob", side: Side.Sell, price: 10_200_000n, qty: 20_000n, standing: false },
  { name: "carol", side: Side.Sell, price: 10_400_000n, qty: 15_000n, standing: false },
];

async function main() {
  const d = readDeployment();
  const issuer = ensureIdentity("fathom-issuer");
  const admin = ensureIdentity("fathom-admin");
  const ustry = new Asset("USTRY", d.issuer);
  const usdc = new Asset("USDC", d.issuer);
  const adminAuction = await auction(admin);

  console.log("1. bots: friendbot, trustlines, demo tokens");
  const bots: Record<string, Keypair> = {};
  for (const p of PLAN) {
    const kp = ensureIdentity(`fathom-bot-${p.name}`);
    await ensureTrustlines(kp, [ustry, usdc]);
    await topUp(issuer, kp.publicKey(), ustry, BOT_FUNDS);
    await topUp(issuer, kp.publicKey(), usdc, BOT_FUNDS);
    bots[p.name] = kp;
  }

  console.log("2. close any auctions left over from earlier runs");
  await closeBacklog(adminAuction);

  const grid = await read<Record<string, bigint>>(adminAuction, "config");
  const tickOf = (price: bigint) => Number((price - grid.grid_min) / grid.tick);
  type Bal = Record<string, { ustry: bigint; usdc: bigint }>;
  const balances = async (): Promise<Bal> =>
    Object.fromEntries(
      await Promise.all(
        PLAN.map(async (p) => {
          const kp = bots[p.name];
          const [b, q] = await Promise.all([
            read<bigint>(await client(d.ustry_sac, kp), "balance", { id: kp.publicKey() }),
            read<bigint>(await client(d.usdc_sac, kp), "balance", { id: kp.publicKey() }),
          ]);
          return [p.name, { ustry: b, usdc: q }] as const;
        }),
      ),
    );
  const before = await balances();

  console.log("3. seal orders (only commitment + fixed-size deposit go on-chain)");
  const sealed = [];
  for (const p of PLAN) {
    const kp = bots[p.name];
    const c = await auction(kp);
    const salt = newSalt();
    const opening = { owner: kp.publicKey(), side: p.side, price_tick: tickOf(p.price), qty: p.qty * UNIT, salt };
    const commitment = await read<Buffer>(c, "commitment_of", opening);
    const token = p.side === Side.Buy ? d.usdc_sac : d.ustry_sac;
    const { value: id, hash } = await write<bigint>(c, "place_order", {
      owner: kp.publicKey(), commitment, deposit_token: token, deposit_amount: DEPOSIT, standing: p.standing,
    });
    console.log(`  ${p.name.padEnd(5)} order #${id} sealed ${Buffer.from(commitment).toString("hex").slice(0, 12)}…  ${txLink(hash)}`);
    sealed.push({ p, c, id, opening });
  }

  console.log("4. end the commit window (demo fast-forward), reveal");
  await write(adminAuction, "fast_forward");
  for (const s of sealed) {
    const { hash } = await write(s.c, "reveal", { ...s.opening, order_id: s.id });
    console.log(`  ${s.p.name.padEnd(5)} revealed  ${txLink(hash)}`);
  }

  console.log("5. end the reveal window, close, settle");
  await write(adminAuction, "fast_forward");
  const { value: r, hash } = await write<Record<string, bigint>>(adminAuction, "close_auction");
  console.log(`  closed auction #${r.auction}  ${txLink(hash)}`);
  const a = await read<{ to_settle: bigint[] }>(adminAuction, "auction", { id: r.auction });
  const settled = await write(adminAuction, "settle", { order_ids: a.to_settle });
  console.log(`  settled ${a.to_settle.length} orders  ${txLink(settled.hash)}`);

  console.log(`\nClearing price $${fmt(r.price)} · matched ${fmt(r.matched)} USTRY · notional $${fmt(r.notional)} · ${r.order_count} orders · depth ${fmt(r.depth)}`);
  const fills = await read<Array<Record<string, bigint>>>(adminAuction, "fills", { auction: r.auction });
  const after = await balances();
  for (const p of PLAN) {
    const f = fills.find((x) => String(x.owner) === bots[p.name].publicKey())!;
    const dU = after[p.name].ustry - before[p.name].ustry;
    const dQ = after[p.name].usdc - before[p.name].usdc;
    console.log(`  ${p.name.padEnd(5)} filled ${fmt(f.filled).padStart(6)}   ΔUSTRY ${fmt(dU).padStart(7)}   ΔUSDC ${fmt(dQ).padStart(8)}`);
  }
}

/** Close every auction older than the one taking commitments, so ours is next to close. */
async function closeBacklog(c: Dyn) {
  for (;;) {
    const [closing, current] = await Promise.all([read<{ id: bigint }>(c, "closing_auction"), read<{ id: bigint }>(c, "current_auction")]);
    if (closing.id === current.id) return;
    await write(c, "fast_forward").catch(() => {});
    await write(c, "fast_forward").catch(() => {});
    const { value } = await write<{ auction: bigint }>(c, "close_auction");
    const a = await read<{ to_settle: bigint[] }>(c, "auction", { id: value.auction });
    if (a.to_settle.length) await write(c, "settle", { order_ids: a.to_settle });
    console.log(`  closed stale auction #${value.auction}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
