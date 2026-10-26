// Deploy Fathom's testnet demo environment.
//
//   npm run deploy    # idempotent
//
// Each contract is redeployed only when its fingerprint (WASM hash + constructor
// args) changes. Constructor args include dependency ids, so redeploying the oracle
// also redeploys Pool B. Wiring (oracle registry, auction → oracle) and pool funding
// are re-applied every run.
//
// Writes contract ids to deployments/testnet.json and app/.env.production (public, committed)
// and app/.env (local).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Asset } from "@stellar/stellar-sdk";
import { CIRCUIT_TYPE, H, pointToBytes, randomScalar, scalarMul, toHex32 } from "stellar-confidential-token-sdk";
import { CONFIDENTIAL, CONFIG } from "./config.js";
import { AUDITOR_ID, OZ_WASM, registerAuctionData, vk } from "./lib/confidential.js";
import {
  FRIENDBOT_URL, NETWORK, PASSPHRASE, ROOT, RPC_URL, HORIZON_URL,
  Deployment, ensureIdentity, ensureTrustlines, loadOrFund, readDeployment, server, stellar, topUp, writeDeployment,
} from "./lib/stellar.js";

const wasm = (name: string) => resolve(ROOT, `target/wasm32v1-none/release/${name}.wasm`);
const net = ["--network", NETWORK];
const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
/** CLI flags: scalars bare, structs/enums as JSON (i128 inside JSON as strings). */
const flags = (args: Record<string, unknown>) =>
  Object.entries(args).flatMap(([k, v]) => [`--${k}`, typeof v === "object" ? json(v) : String(v)]);

/** Deploy `file` under `key` unless the same code was already deployed with the same args. */
function ensureContract(d: Deployment, key: string, file: string, args: Record<string, unknown>) {
  const ctor = flags(args);
  const path = file.endsWith(".wasm") ? file : wasm(file);
  const wasmHash = createHash("sha256").update(readFileSync(path)).digest("hex");
  const fingerprint = createHash("sha256").update(wasmHash + json(ctor)).digest("hex").slice(0, 16);
  if (d[key] && d[`${key}_fp`] === fingerprint) {
    console.log(`  ${key} unchanged`);
    return;
  }
  console.log(`  deploying ${key}`);
  const out = stellar("contract", "deploy", "--wasm", path, "--source", "fathom-admin", ...net, "--alias", key, "--", ...ctor);
  d[key] = out.split("\n").pop()!;
  d[`${key}_fp`] = fingerprint;
}

function invoke(id: string, fn: string, args: Record<string, unknown> = {}, send = true): string {
  return stellar("contract", "invoke", "--id", id, "--source", "fathom-admin", ...net, "--send", send ? "yes" : "no", "--", fn, ...flags(args));
}

/** Wrap a classic asset in its Stellar Asset Contract; the id is deterministic, so this is idempotent. */
function deploySac(asset: Asset): string {
  const id = `${asset.code}:${asset.issuer}`;
  try {
    execFileSync("stellar", ["contract", "asset", "deploy", "--asset", id, "--source", "fathom-admin", ...net], { cwd: ROOT, stdio: "pipe" });
    console.log(`  wrapped ${asset.code} in a SAC`);
  } catch {
    console.log(`  SAC for ${asset.code} already exists`);
  }
  return stellar("contract", "id", "asset", "--asset", id, ...net);
}

/** Top a contract's balance of `sac` up to `target` from the admin treasury. */
function fundContract(sac: string, contract: string, admin: string, target: bigint) {
  const have = BigInt(JSON.parse(invoke(sac, "balance", { id: contract }, false)));
  if (have >= target) return;
  invoke(sac, "transfer", { from: admin, to: contract, amount: (target - have).toString() });
  console.log(`  funded ${contract.slice(0, 6)}… with ${(target - have) / 10_000_000n} USDC`);
}

async function main() {
  const d = readDeployment();

  console.log("1. identities (Stellar CLI keystore)");
  const admin = ensureIdentity("fathom-admin");
  const issuer = ensureIdentity("fathom-issuer");
  d.admin = admin.publicKey();
  d.issuer = issuer.publicKey();
  await Promise.all([loadOrFund(d.admin), loadOrFund(d.issuer)]); // fresh network: create both first

  console.log("2. demo tokens (classic assets from the test issuer, labelled testnet demo)");
  const ustry = new Asset("USTRY", issuer.publicKey());
  const usdc = new Asset("USDC", issuer.publicKey());
  await ensureTrustlines(admin, [ustry, usdc]);
  await topUp(issuer, admin.publicKey(), ustry, CONFIG.treasury.USTRY);
  await topUp(issuer, admin.publicKey(), usdc, CONFIG.treasury.USDC);
  d.ustry_sac = deploySac(ustry);
  d.usdc_sac = deploySac(usdc);
  const ustryAsset = { Stellar: d.ustry_sac };

  console.log("3. build contracts");
  execFileSync("stellar", ["contract", "build"], { cwd: ROOT, stdio: "inherit" });

  console.log("4. contracts");
  ensureContract(d, "mock_nav", "mock_nav", { admin: d.admin, nav: CONFIG.ustry.nav });
  ensureContract(d, "mock_dex_price", "mock_dex_price", { price: CONFIG.ustry.dexStart });
  const { grid, params } = CONFIG.auction;
  ensureContract(d, "auction", "fathom_auction", {
    admin: d.admin, base_token: d.ustry_sac, quote_token: d.usdc_sac, nav_feed: d.mock_nav,
    grid_min: grid.min, grid_max: grid.max, tick: grid.tick, params,
  });
  ensureContract(d, "oracle", "fathom_oracle", { admin: d.admin, base: { Stellar: d.usdc_sac }, params: CONFIG.oracle });
  const { ltv_bps, cap_share_bps, tvl } = CONFIG.pools;
  ensureContract(d, "pool_a", "demo_pool_a", {
    collateral_token: d.ustry_sac, debt_token: d.usdc_sac, price_feed: d.mock_dex_price, ltv_bps,
  });
  ensureContract(d, "pool_b", "demo_pool_b", {
    collateral_token: d.ustry_sac, debt_token: d.usdc_sac, oracle: d.oracle, asset: ustryAsset, ltv_bps, cap_share_bps,
  });
  writeDeployment(d);

  console.log("5. wiring");
  const reg = JSON.parse(invoke(d.oracle, "asset_config", { asset: ustryAsset }, false) || "null");
  if (reg?.auction !== d.auction || reg?.nav_feed !== d.mock_nav) {
    invoke(d.oracle, "register_asset", { asset: ustryAsset, auction: d.auction, nav_feed: JSON.stringify(d.mock_nav) }); // Option<Address>
    console.log("  oracle: registered USTRY → auction");
  }
  const cfg = JSON.parse(invoke(d.auction, "config", {}, false));
  if (cfg.oracle !== d.oracle) {
    invoke(d.auction, "set_oracle", { oracle: d.oracle });
    console.log("  auction: pushes to oracle");
  }
  fundContract(d.usdc_sac, d.pool_a, d.admin, tvl);
  fundContract(d.usdc_sac, d.pool_b, d.admin, tvl);
  if (CONFIDENTIAL) await setupConfidential(d);

  // Public values only (contract ids, network, scenario). app/.env is local; app/.env.production
  // is committed so a hosted build (Vercel) needs no extra setup.
  const env = (extra: string[]) =>
    [
      "# Generated by scripts/deploy.ts. Testnet demo only. Public values, no secrets.",
      `VITE_NETWORK=${NETWORK}`,
      `VITE_NETWORK_PASSPHRASE=${PASSPHRASE}`,
      `VITE_FRIENDBOT_URL=${FRIENDBOT_URL}`,
      `VITE_RPC_URL=${RPC_URL}`,
      `VITE_HORIZON_URL=${HORIZON_URL}`,
      `VITE_USTRY_SAC=${d.ustry_sac}`,
      `VITE_USDC_SAC=${d.usdc_sac}`,
      `VITE_MOCK_NAV=${d.mock_nav}`,
      `VITE_MOCK_DEX_PRICE=${d.mock_dex_price}`,
      `VITE_ISSUER=${d.issuer}`,
      `VITE_AUCTION=${d.auction}`,
      `VITE_ORACLE=${d.oracle}`,
      `VITE_POOL_A=${d.pool_a}`,
      `VITE_POOL_B=${d.pool_b}`,
      `VITE_ORDER_VERIFIER=${d.order_verifier ?? ""}`,
      "# Set by us in scripts/config.ts (shown in the app as demo feed / attack scenario).",
      `VITE_DEX_START=${CONFIG.ustry.dexStart}`,
      `VITE_ATTACK_COLLATERAL=${CONFIG.replay.collateral}`,
      `VITE_ATTACK_BORROW=${CONFIG.replay.borrow}`,
      `VITE_ATTACK_PUMP=${CONFIG.replay.pump}`,
      ...extra,
      "",
    ].join("\n");
  if (CONFIDENTIAL) {
    // Its own Vite mode (vite --mode confidential): the default app env files keep the fixed-size stack.
    writeFileSync(resolve(ROOT, "app/.env.confidential"), env([
      "# CONFIDENTIAL_DEPOSITS stack (OpenZeppelin confidential tokens).",
      "VITE_CONFIDENTIAL_DEPOSITS=true",
      `VITE_CONF_USDC=${d.conf_usdc}`,
      `VITE_CONF_USTRY=${d.conf_ustry}`,
      `VITE_CONF_VERIFIER=${d.conf_verifier}`,
      `VITE_CONF_AUDITOR=${d.conf_auditor}`,
      `VITE_CONF_FROM_LEDGER=${d.conf_from_ledger}`,
    ]));
  } else {
    writeFileSync(resolve(ROOT, "app/.env"), env([]));
    // Hosted builds are testnet only; infra/scripts/deploy-frontend.sh sets VITE_DEMO_API for Cloudflare Pages.
    if (NETWORK === "testnet") writeFileSync(resolve(ROOT, "app/.env.production"), env([]));
  }

  console.log("\nDeployed:");
  console.table(Object.fromEntries(Object.entries(d).filter(([k]) => !k.endsWith("_fp"))));
}

/**
 * CONFIDENTIAL_DEPOSITS: OpenZeppelin verifier (+ the six circuit VKs), auditor (+ key 0), one
 * confidential token per demo asset, then the auction: flag on, registered as a confidential
 * account on both tokens with its spending key (FATHOM_CONF_AUCTION_SK, created here if missing).
 */
async function setupConfidential(d: Deployment) {
  console.log("6. confidential tokens (OpenZeppelin stellar-confidential 0.8.0)");
  if (!process.env.FATHOM_CONF_AUCTION_SK) {
    const sk = toHex32(randomScalar()).replace(/^0x/, "");
    appendFileSync(resolve(ROOT, ".env.local"), `\n# Auction's confidential spending key (settlement server only)\nFATHOM_CONF_AUCTION_SK=${sk}\n`);
    process.env.FATHOM_CONF_AUCTION_SK = sk;
    console.log("  new auction spending key → .env.local (add it to Secret Manager for the VM)");
  }
  const before = d.conf_verifier;
  ensureContract(d, "conf_verifier", OZ_WASM.verifier, { admin: d.admin, manager: d.admin });
  if (d.conf_verifier !== before || !d.conf_vks) {
    for (const [name, type] of Object.entries(CIRCUIT_TYPE)) {
      const file = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
      invoke(d.conf_verifier, "register_verification_key", { circuit_type: type, verification_key: vk(file).toString("hex"), operator: d.admin });
      console.log(`  verifier: VK ${file}`);
    }
    d.conf_vks = "registered";
  }
  const auditorBefore = d.conf_auditor;
  ensureContract(d, "conf_auditor", OZ_WASM.auditor, { admin: d.admin, manager: d.admin });
  if (d.conf_auditor !== auditorBefore || !d.conf_auditor_key) {
    // The auditor key decrypts every amount; for this demo nobody keeps its secret.
    const point = Buffer.from(pointToBytes(scalarMul(randomScalar(), H))).toString("hex");
    invoke(d.conf_auditor, "register_key", { auditor_id: AUDITOR_ID, point, operator: d.admin });
    d.conf_auditor_key = point;
  }
  if (!d.conf_from_ledger) d.conf_from_ledger = String((await server.getLatestLedger()).sequence - 1);
  ensureContract(d, "conf_usdc", OZ_WASM.token, { underlying_asset: d.usdc_sac, verifier: d.conf_verifier, auditor: d.conf_auditor });
  ensureContract(d, "conf_ustry", OZ_WASM.token, { underlying_asset: d.ustry_sac, verifier: d.conf_verifier, auditor: d.conf_auditor });
  writeDeployment(d);
  invoke(d.auction, "set_confidential", { base: d.conf_ustry, quote: d.conf_usdc });
  for (const token of [d.conf_usdc, d.conf_ustry]) {
    const data = await registerAuctionData(token, d.auction);
    if (data) {
      invoke(d.auction, "register_confidential", { ctoken: token, auditor_id: AUDITOR_ID, data: data.toString("hex") });
      console.log(`  auction registered on ${token.slice(0, 6)}…`);
    }
  }
  writeDeployment(d);
}

main().catch((e) => {
  console.error(e?.response?.data?.extras?.result_codes ?? e);
  process.exit(1);
});
