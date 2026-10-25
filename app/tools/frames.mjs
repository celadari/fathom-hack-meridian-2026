// Capture animated frames (no reduced motion) to check animations run: node tools/frames.mjs
import { chromium } from "playwright";
const APP = process.env.APP_URL ?? "http://localhost:5173";
const OUT = new URL("../.compare/", import.meta.url).pathname;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 980 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
for (const [name, route, act, waits] of [
  ["auction-seal", "/", (p) => p.getByRole("button", { name: "Lock & seal order" }).click(), [600, 1500, 3200]],
  ["close", "/close", null, [700, 1800, 3600]],
  ["liquidity", "/liquidity", null, [500, 2500]],
  ["replay", "/replay", async (p) => { for (const n of ["Replay the February attack", "Next step", "Next step"]) await p.getByRole("button", { name: n }).click(); }, [400, 2500]],
  ["how", "/how-it-works", null, [1500, 3500]],
]) {
  await p.goto(APP + route, { waitUntil: "networkidle" });
  if (act) await act(p);
  let t = 0;
  for (const w of waits) { await p.waitForTimeout(w - t); t = w; await p.screenshot({ path: `${OUT}${name}-t${w}.png` }); }
}
await b.close();
console.log(errors.length ? errors : "no console errors");
