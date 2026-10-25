// Load every screen against testnet, wait for data, screenshot, report console errors.
//   node tools/smoke.mjs [query]   e.g. "?demo"
import { chromium } from "playwright";
const APP = process.env.APP_URL ?? "http://localhost:5173";
const q = process.argv[2] ?? "";
const OUT = new URL("../.compare/", import.meta.url).pathname;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 980 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
p.on("console", (m) => m.type() === "error" && errors.push(`console ${m.text().slice(0, 300)}`));
for (const [name, route] of [["auction", "/"], ["close", "/close"], ["liquidity", "/liquidity"], ["replay", "/replay"], ["how", "/how-it-works"]]) {
  await p.goto(APP + route + q, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30_000 }).catch(() => errors.push(`${name}: still loading after 30s`));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}live-${name}.png`, fullPage: true });
  const alerts = await p.locator('[role="alert"]').allInnerTexts();
  if (alerts.length) errors.push(`${name} alerts: ${alerts.join(" | ").slice(0, 300)}`);
}
await b.close();
console.log(errors.length ? errors.join("\n") : "no errors");
