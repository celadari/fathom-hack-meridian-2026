// Fill the README's contract-id table from deployments/testnet.json.
//   npx tsx write-readme-ids.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readDeployment, ROOT } from "./lib/stellar.js";

const d = readDeployment();
const link = (id: string) => `[\`${id}\`](https://stellar.expert/explorer/testnet/${id.startsWith("G") ? "account" : "contract"}/${id})`;
const rows = [
  ["fathom-auction", d.auction, "sealed orders, reveal, clearing, settlement"],
  ["fathom-oracle", d.oracle, "SEP-40 price + depth"],
  ["demo-pool-a", d.pool_a, "naive lender (DEX price)"],
  ["demo-pool-b", d.pool_b, "Fathom lender (price + depth cap)"],
  ["mock-nav", d.mock_nav, "USTRY NAV, demo feed set by us"],
  ["mock-dex-price", d.mock_dex_price, "thin DEX last price, demo feed"],
  ["USTRY (SAC)", d.ustry_sac, "demo token"],
  ["USDC (SAC)", d.usdc_sac, "demo token"],
  ["order verifier", d.order_verifier, "rs-soroban-ultrahonk with circuits/order's vk (verifier demo)"],
  ["issuer", d.issuer, "issues the demo tokens"],
];
const table = ["| Contract | ID | Role |", "|---|---|---|", ...rows.map(([n, id, r]) => `| ${n} | ${link(id)} | ${r} |`)].join("\n");
const p = resolve(ROOT, "README.md");
const s = readFileSync(p, "utf8").replace(/<!-- contract-ids:start -->[\s\S]*<!-- contract-ids:end -->/, `<!-- contract-ids:start -->\n${table}\n<!-- contract-ids:end -->`);
writeFileSync(p, s);
console.log(table);
