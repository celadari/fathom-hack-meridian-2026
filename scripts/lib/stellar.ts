// Shared network helpers. Keys live in the Stellar CLI keystore (~/.config/stellar) or, on a
// host, in FATHOM_KEY_* environment variables; never in this repo.
//
// FATHOM_NETWORK=testnet (default) or local (stellar/quickstart, docker compose --profile local).
// FATHOM_RPC_URL / FATHOM_HORIZON_URL / FATHOM_FRIENDBOT_URL override the URLs (e.g. inside compose).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const NETWORK = process.env.FATHOM_NETWORK === "local" ? "local" : "testnet";
const LOCAL = NETWORK === "local";
export const PASSPHRASE = LOCAL ? Networks.STANDALONE : Networks.TESTNET;
export const HORIZON_URL = process.env.FATHOM_HORIZON_URL ?? (LOCAL ? "http://localhost:8000" : "https://horizon-testnet.stellar.org");
export const RPC_URL = process.env.FATHOM_RPC_URL ?? (LOCAL ? "http://localhost:8000/rpc" : "https://soroban-testnet.stellar.org");
export const FRIENDBOT_URL = process.env.FATHOM_FRIENDBOT_URL ?? (LOCAL ? "http://localhost:8000/friendbot" : "https://friendbot.stellar.org");
/** Plain-HTTP endpoints (local quickstart) must be allowed explicitly. */
export const ALLOW_HTTP = RPC_URL.startsWith("http://") || HORIZON_URL.startsWith("http://");
export const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: ALLOW_HTTP });

const DEPLOYMENTS = resolve(ROOT, `deployments/${NETWORK}.json`);

export type Deployment = Record<string, string>;

export function readDeployment(): Deployment {
  return existsSync(DEPLOYMENTS) ? JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) : {};
}

export function writeDeployment(d: Deployment) {
  mkdirSync(dirname(DEPLOYMENTS), { recursive: true });
  writeFileSync(DEPLOYMENTS, JSON.stringify(d, null, 2) + "\n");
}

/** Run the stellar CLI and return trimmed stdout. */
export function stellar(...args: string[]): string {
  return execFileSync("stellar", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

/** Env var holding an identity's secret on a host without the Stellar CLI: fathom-bot-alice → FATHOM_KEY_BOT_ALICE. */
export const keyEnvName = (name: string) => `FATHOM_KEY_${name.replace(/^fathom-/, "").replace(/-/g, "_").toUpperCase()}`;
const cache = new Map<string, Keypair>();

/**
 * The keypair for a demo identity: from FATHOM_KEY_* (hosted demo server) or the Stellar CLI
 * keystore, creating and funding it with the CLI if it does not exist yet (local only).
 */
export function ensureIdentity(name: string): Keypair {
  if (cache.has(name)) return cache.get(name)!;
  const fromEnv = process.env[keyEnvName(name)];
  if (fromEnv) {
    cache.set(name, Keypair.fromSecret(fromEnv));
    return cache.get(name)!;
  }
  if (process.env.FATHOM_KEYS_FROM_ENV_ONLY) throw new Error(`missing secret ${keyEnvName(name)}`);
  const known = stellar("keys", "ls").split("\n").map((s) => s.trim());
  if (!known.includes(name)) {
    console.log(`  creating identity ${name}`);
    stellar("keys", "generate", name, "--network", NETWORK, "--fund");
  }
  cache.set(name, Keypair.fromSecret(stellar("keys", "secret", name)));
  return cache.get(name)!;
}

async function submit(source: Keypair, ops: xdr.Operation[]) {
  const account = await loadOrFund(source.publicKey());
  const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).setTimeout(60);
  ops.forEach((op) => builder.addOperation(op));
  const tx = builder.build();
  tx.sign(source);
  return horizon.submitTransaction(tx);
}

/** Load an account; on a fresh network (local quickstart, testnet reset) create it with Friendbot first. */
export async function loadOrFund(address: string) {
  try {
    return await horizon.loadAccount(address);
  } catch (e) {
    if ((e as { response?: { status?: number } })?.response?.status !== 404) throw e;
    await fetch(`${FRIENDBOT_URL}?addr=${address}`);
    return horizon.loadAccount(address);
  }
}

/** Add trustlines for `assets` on `holder`, skipping ones that already exist. */
export async function ensureTrustlines(holder: Keypair, assets: Asset[]) {
  const account = await loadOrFund(holder.publicKey());
  const missing = assets.filter(
    (a) => !account.balances.some((b) => "asset_code" in b && b.asset_code === a.code && b.asset_issuer === a.issuer),
  );
  if (missing.length) await submit(holder, missing.map((asset) => Operation.changeTrust({ asset })));
}

/** Top up `to` so it holds at least `amount` (decimal string) of `asset`, paid by `from`. */
export async function topUp(from: Keypair, to: string, asset: Asset, amount: number) {
  const account = await horizon.loadAccount(to);
  const line = account.balances.find((b) => "asset_code" in b && b.asset_code === asset.code && b.asset_issuer === asset.issuer);
  const have = line ? Number(line.balance) : 0;
  if (have >= amount) return;
  await submit(from, [Operation.payment({ destination: to, asset, amount: (amount - have).toFixed(7) })]);
}

/** Top several accounts up to `amount` of each asset in one transaction from `from` (one sequence number). */
export async function topUpMany(from: Keypair, targets: { to: string; asset: Asset; amount: number }[]) {
  const ops: xdr.Operation[] = [];
  for (const t of targets) {
    const account = await horizon.loadAccount(t.to);
    const line = account.balances.find((b) => "asset_code" in b && b.asset_code === t.asset.code && b.asset_issuer === t.asset.issuer);
    const have = line ? Number(line.balance) : 0;
    if (have < t.amount) ops.push(Operation.payment({ destination: t.to, asset: t.asset, amount: (t.amount - have).toFixed(7) }));
  }
  for (let i = 0; i < ops.length; i += 100) await submit(from, ops.slice(i, i + 100));
  return ops.length;
}
