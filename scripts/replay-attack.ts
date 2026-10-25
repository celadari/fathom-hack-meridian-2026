// Replay the Feb 2026 YieldBlox pattern on testnet demo contracts:
//   1. pump the thin DEX price ×100 with one trade
//   2. borrow against pumped USTRY from Pool A (prices at the DEX)    → drained
//   3. try the same against Pool B (prices at Fathom, capped by depth) → rejected
//
//   npm run replay              # prints tx hashes; Pool B's rejection comes from simulation
//
// Each run first resets the DEX price and refills both pools, so it can be repeated.
import { Asset, Keypair } from "@stellar/stellar-sdk";
import { CONFIG, UNIT } from "./config.js";
import { client, Dyn, fmt, read, txLink, write } from "./lib/fathom.js";
import { ensureIdentity, ensureTrustlines, readDeployment, topUp } from "./lib/stellar.js";

const COLLATERAL = 13_000n * UNIT; // USTRY the attacker posts (~$13.5k at fair value)
const BORROW = 1_000_000n * UNIT; // USDC the attacker asks for
const PUMP = 106n * UNIT; // $1.04 → $106

const POOL_ERRORS: Record<number, string> = {
  1: "No Fathom price · borrow rejected",
  2: "Depth too low · borrow rejected",
  3: "Not enough collateral · borrow rejected",
  4: "Pool empty",
  5: "Bad amount",
};

async function main() {
  const d = readDeployment();
  const admin = ensureIdentity("fathom-admin");
  const issuer = ensureIdentity("fathom-issuer");
  const attacker = ensureIdentity("fathom-attacker");
  await ensureTrustlines(attacker, [new Asset("USTRY", d.issuer), new Asset("USDC", d.issuer)]);
  await topUp(issuer, attacker.publicKey(), new Asset("USTRY", d.issuer), Number(COLLATERAL / UNIT));

  console.log("0. reset: DEX back to $1.04, pools refilled to $1M");
  const dexAdmin = await client(d.mock_dex_price, admin);
  await write(dexAdmin, "trade", { trader: admin.publicKey(), price: CONFIG.ustry.dexStart });
  const usdc = await client(d.usdc_sac, admin);
  for (const pool of [d.pool_a, d.pool_b]) {
    const have = await read<bigint>(usdc, "balance", { id: pool });
    if (have < CONFIG.pools.tvl) await write(usdc, "transfer", { from: admin.publicKey(), to: pool, amount: CONFIG.pools.tvl - have });
  }

  const poolA = await client(d.pool_a, attacker);
  const poolB = await client(d.pool_b, attacker);
  const oracle = await client(d.oracle, attacker);
  const ustry = { tag: "Stellar", values: [d.ustry_sac] };
  const tvl = async (p: Dyn) => fmt(await read<bigint>(p, "tvl"), 0);

  const fathom = await read<{ price: bigint; timestamp: bigint } | undefined>(oracle, "lastprice", { asset: ustry });
  console.log(`   DEX $${fmt(await read<bigint>(dexAdmin, "price"))} · Fathom $${fathom ? fmt(fathom.price) : "none"} · Pool A $${await tvl(poolA)} · Pool B $${await tvl(poolB)}`);

  console.log("\n1. attacker pumps the DEX with one trade");
  const pump = await write(await client(d.mock_dex_price, attacker), "trade", { trader: attacker.publicKey(), price: PUMP });
  const after = await read<{ price: bigint }>(oracle, "lastprice", { asset: ustry });
  console.log(`   DEX $${fmt(PUMP)} · Fathom still $${fmt(after.price)}  ${txLink(pump.hash)}`);

  console.log(`\n2. Pool A: post ${fmt(COLLATERAL, 0)} USTRY, borrow $${fmt(BORROW, 0)}`);
  const drain = await write(poolA, "borrow", { user: attacker.publicKey(), collateral_qty: COLLATERAL, borrow_amount: BORROW });
  console.log(`   approved: Pool A TVL now $${await tvl(poolA)}  ${txLink(drain.hash)}`);

  console.log(`\n3. Pool B: same request`);
  const cap = await read<Record<string, bigint>>(poolB, "cap_status");
  console.log(`   Fathom min depth ${fmt(cap.min_depth_window, 0)} → cap ${fmt(cap.cap, 0)} USTRY (50%), already used ${fmt(cap.used, 0)}`);
  const tx = await poolB.borrow({ user: attacker.publicKey(), collateral_qty: COLLATERAL, borrow_amount: BORROW });
  const code = errorCode(tx.result) ?? errorCode(tx.simulation);
  if (code === undefined) throw new Error(`expected Pool B to reject, got ${JSON.stringify(tx.result)}`);
  console.log(`   rejected with Error #${code}: ${POOL_ERRORS[code]} (simulated on testnet RPC; no funds moved)`);
  console.log(`   Pool B TVL still $${await tvl(poolB)}`);
}

/** Extract a contract error code from a client result or failed simulation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorCode(x: any): number | undefined {
  const text = typeof x === "object" && x !== null ? (x.error?.message ?? x.error ?? JSON.stringify(x)) : String(x);
  const m = /Error\(Contract, #(\d+)\)/.exec(String(text));
  if (m) return Number(m[1]);
  if (typeof x?.error?.code === "number") return x.error.code;
  return undefined;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
