// Replay the Feb 2026 YieldBlox pattern on testnet demo contracts:
//   0. reset: DEX back to $1.04, both pools refilled to $1M
//   1. pump the thin DEX price ×100 with one trade
//   2. borrow against pumped USTRY from Pool A (prices at the DEX)    → drained
//   3. same request to Pool B (prices at Fathom, capped by depth)     → rejected, recorded on-chain
//
//   npm run replay
import { UNIT } from "./config.js";
import { ATTACK, replayStep } from "./lib/demo.js";
import { fmt } from "./lib/fathom.js";

const REASONS: Record<number, string> = { 1: "No Fathom price", 2: "Depth too low", 3: "Not enough collateral", 4: "Pool empty", 5: "Bad amount" };

for (const n of [0, 1, 2, 3] as const) {
  const run = await replayStep(n);
  const s = Object.values(run.steps).at(-1)!;
  console.log(`${n}. ${s.label}  ${s.link ?? ""}`);
  if (n === 3 && run.assessment) {
    const a = run.assessment as Record<string, string> & { reasons: number[] };
    const big = (k: string) => BigInt(a[k]);
    for (const r of a.reasons.map(Number)) {
      if (r === 3) {
        const dexValue = (ATTACK.collateral * ATTACK.pump) / UNIT;
        console.log(`   · ${REASONS[r]}: ${fmt(big("collateral"), 0)} USTRY is worth $${fmt(big("collateral_value"), 0)} at the Fathom price, not $${fmt(dexValue, 0)} at the DEX price; max loan $${fmt(big("max_loan"), 0)} vs $${fmt(big("requested"), 0)} asked`);
      } else if (r === 2) {
        console.log(`   · ${REASONS[r]}: cap ${fmt(big("cap"), 0)} USTRY (50% of min depth ${fmt(big("min_depth_window"), 0)}) vs ${fmt(big("collateral_after"), 0)} requested`);
      } else console.log(`   · ${REASONS[r]}`);
    }
  }
}
