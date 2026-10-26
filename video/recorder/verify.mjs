// Checks the recorded clips before rendering: the same auction from Trade to Results, the attack's
// end state (Pool A at $0, Pool B rejected with a cap above 0 and its stellar.expert link). Exits 1 if not.
import { readFileSync } from "node:fs";
const C = JSON.parse(readFileSync(new URL("../public/clips/clips.json", import.meta.url), "utf8"));
const v = (c, k) => C[c]?.values?.[k] ?? "";
const checks = [
  ["Trade order sealed", /deposit locked/.test(v("a", "lockLine"))],
  ["Auction page shows the order's auction", v("a", "auction") !== "" && v("a", "auction") === v("b", "auction")],
  ["Results show the order's auction", v("a", "auction") !== "" && v("a", "auction") === v("c", "resultsAuction") && v("c", "auction") === v("a", "auction")],
  ["Results have a clearing price", /\$[\d.]+/.test(v("c", "clearing"))],
  ["Pool A ends at $0", /Money left in the pool\s*\$0\b/.test(v("e", "poolA"))],
  ["Pool B keeps its funds", /Money left in the pool\s*\$1M/.test(v("e", "poolB"))],
  ["Pool B: Borrow rejected", /Borrow rejected/.test(v("e", "step5")) || /Rejected/.test(v("e", "step5"))],
  ["Pool B cap above 0", Number((v("e", "step5").match(/cap ([\d,]+)/) ?? [])[1]?.replace(/,/g, "") ?? 0) > 0],
  ["Pool B rejection linked on stellar.expert", /stellar\.expert\/explorer\/testnet\/tx\/[0-9a-f]{64}/.test(v("e", "poolBLink"))],
];
let ok = true;
for (const [name, pass] of checks) { console.log(`${pass ? "✓" : "✗"} ${name}`); ok &&= pass; }
console.log(`auctions: trade #${v("a", "auction")}, auction page #${v("b", "auction")}, results #${v("c", "resultsAuction")}`);
process.exit(ok ? 0 : 1);
