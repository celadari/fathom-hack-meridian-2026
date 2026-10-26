// Screen regions the zoomed shots frame (layout geometry only, no values), measured on the live
// site at the recording size. Writes public/clips/regions.json.
import { chromium } from "../../app/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const SITE = process.env.SITE ?? "https://fathom-b3t.pages.dev";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const rect = async (loc) => { const r = await loc.first().boundingBox(); return r && { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; };
const out = {};
await p.goto(`${SITE}/`, { waitUntil: "networkidle" }); await p.waitForTimeout(3000);
out.widget = await rect(p.locator('section[aria-label="Place a sealed order"]'));
await p.goto(`${SITE}/close`, { waitUntil: "networkidle" }); await p.waitForTimeout(3500);
out.chart = await rect(p.getByText("Demand meets supply at one price").locator("xpath=ancestor::section[1]"));
await p.mouse.wheel(0, 500); await p.waitForTimeout(1200);
out.table = await rect(p.getByText("Revealed orders and fills").locator("xpath=ancestor::section[1]"));
console.log(JSON.stringify(out, null, 1));
writeFileSync(new URL("../public/clips/regions.json", import.meta.url), JSON.stringify(out, null, 2));
await b.close();
