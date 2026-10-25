// Deploy Fathom's testnet demo environment.
//
//   npm run deploy    # idempotent
//
// Each contract is redeployed only when its fingerprint (WASM hash + constructor
// args) changes. Constructor args include dependency ids, so redeploying the oracle
// also redeploys Pool B. Wiring (oracle registry, auction → oracle) and pool funding
// are re-applied every run.
//
// Writes contract ids to deployments/testnet.json (public, committed) and app/.env (gitignored).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Asset } from "@stellar/stellar-sdk";
import { CONFIG } from "./config.js";
import {
  NETWORK, PASSPHRASE, ROOT, RPC_URL, HORIZON_URL,
  Deployment, ensureIdentity, ensureTrustlines, readDeployment, stellar, topUp, writeDeployment,
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
  const wasmHash = createHash("sha256").update(readFileSync(wasm(file))).digest("hex");
  const fingerprint = createHash("sha256").update(wasmHash + json(ctor)).digest("hex").slice(0, 16);
  if (d[key] && d[`${key}_fp`] === fingerprint) {
    console.log(`  ${key} unchanged`);
    return;
  }
  console.log(`  deploying ${key}`);
  const out = stellar("contract", "deploy", "--wasm", wasm(file), "--source", "fathom-admin", ...net, "--alias", key, "--", ...ctor);
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

  writeFileSync(
    resolve(ROOT, "app/.env"),
    [
      "# Generated by scripts/deploy.ts. Testnet demo only.",
      `VITE_NETWORK_PASSPHRASE=${PASSPHRASE}`,
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
      "",
    ].join("\n"),
  );

  console.log("\nDeployed:");
  console.table(Object.fromEntries(Object.entries(d).filter(([k]) => !k.endsWith("_fp"))));
}

main().catch((e) => {
  console.error(e?.response?.data?.extras?.result_codes ?? e);
  process.exit(1);
});
