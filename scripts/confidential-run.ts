// One full auction on the CONFIDENTIAL_DEPOSITS stack, driven from here (no waiting for timers):
// bots seal confidential deposits, commits end, bots reveal (openings checked on-chain), the
// auction closes, and every recorded amount is paid by a proved confidential transfer.
//   set -a; . ../.env.local; set +a; CONFIDENTIAL_DEPOSITS=true npx tsx confidential-run.ts
import { CONFIDENTIAL } from "./config.js";
import { closeAndSettle, endCommits, seed, type Step } from "./lib/demo.js";

if (!CONFIDENTIAL) throw new Error("run with CONFIDENTIAL_DEPOSITS=true");
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const show = (steps: Step[]) => steps.forEach((s) => console.log(`  ${s.label}${s.link ? `  ${s.link}` : ""}`));

log("seal");
show(await seed(log));
log("end commits + reveal");
const e = await endCommits(log);
show(e.steps);
log("close + settle");
const r = await closeAndSettle(log);
show(r.steps);
console.log(JSON.stringify(r.result));
log("done");
process.exit(0);
