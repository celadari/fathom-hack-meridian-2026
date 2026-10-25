// Full demo run on testnet, driven through the browser like a presenter would:
// demo wallet → fund → seed bots → seal an order → Next auction (auto-reveal) →
// close banner → results → dashboard → attack replay. Logs every stellar.expert link.
//
//   (app dev server and scripts demo server running)
//   node tools/e2e.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const OUT = new URL("../.compare/", import.meta.url).pathname;
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}`);
const links = new Map();
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 300)}`));

async function collect(label) {
  const hrefs = await page.$$eval('a[href*="stellar.expert/explorer/testnet/tx/"]', (as) => as.map((a) => [a.href, (a.closest("li,div,span")?.textContent ?? a.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 110)]));
  for (const [h, t] of hrefs) if (!links.has(h)) links.set(h, `${label}: ${t}`);
}
const shot = (name) => page.screenshot({ path: `${OUT}e2e-${name}.png`, fullPage: true });
const demoIdle = (timeout) => page.waitForFunction(() => {
  const bar = document.querySelector('aside[aria-label="Demo controls"]');
  return bar && ![...bar.querySelectorAll("button")].some((b) => b.disabled);
}, null, { timeout });
const demoError = () => page.locator('aside[aria-label="Demo controls"] [role="alert"]').allInnerTexts();
const openLog = async () => {
  const b = page.locator('aside[aria-label="Demo controls"] button', { hasText: "Log (" });
  if ((await b.count()) && (await b.getAttribute("aria-expanded")) !== "true") await b.click();
};

try {
  log("open the auction room with ?demo");
  await page.goto(`${APP}/?demo`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30_000 });

  log("connect the demo wallet");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("menuitem", { name: /Demo wallet/ }).click();
  await page.waitForFunction(() => /G[A-Z2-7]{3}…/.test(document.querySelector("header")?.textContent ?? ""), null, { timeout: 10_000 });

  // Wait until the account check settles: either a funding step or the seal button.
  const ready = () => page.waitForFunction(() => (/Fund with Friendbot|Add trustlines|Get demo tokens/.test(document.body.innerText) || !/Reading your account|Checking your balance/.test(document.body.innerText)) && /G[A-Z2-7]{3}…/.test(document.querySelector("header")?.textContent ?? ""), null, { timeout: 60_000 });
  for (let i = 0; i < 4; i++) {
    await ready();
    const step = page.getByRole("button", { name: /Fund with Friendbot|Add trustlines|Get demo tokens/ });
    if (!(await step.count())) break;
    const name = await step.innerText();
    log(`funding: ${name}`);
    await step.click();
    await page.waitForFunction((n) => ![...document.querySelectorAll("button")].some((b) => b.textContent === n) || document.querySelector('[role="alert"]'), name, { timeout: 90_000 });
    await page.waitForTimeout(1500);
    await collect("funding");
  }

  log("seed bot orders");
  await page.getByRole("button", { name: "Seed bot orders" }).click();
  await demoIdle(240_000);
  if ((await demoError()).length) throw new Error(`seed: ${await demoError()}`);
  await openLog();
  await collect("seed");

  await ready();
  log("seal a standing buy: 30,000 USTRY at ≤ $1.04");
  await page.locator("#qty").fill("30,000");
  await page.locator("#limit").fill("1.040");
  await page.getByRole("button", { name: "Lock & seal order" }).click();
  await page.waitForFunction(() => /USDC locked/.test(document.body.innerText) || /Not placed|failed/.test(document.body.innerText), null, { timeout: 120_000 });
  const proofLine = await page.locator("li", { hasText: "Zero-knowledge proof" }).first().innerText().catch(() => "");
  log(`proof: ${proofLine.replace(/\s+/g, " ").slice(0, 120)}`);
  await page.waitForTimeout(3000); // let the placed event slide the row in
  await shot("1-sealed");
  await collect("seal");

  log("next auction: end commits → auto-reveal → close");
  await page.getByRole("button", { name: "Next auction" }).click();
  await demoIdle(300_000);
  if ((await demoError()).length) throw new Error(`next auction: ${await demoError()}`);
  await openLog();
  await collect("next auction");
  await page.waitForSelector("text=See results", { timeout: 60_000 });
  await shot("2-banner");
  const myOrders = await page.locator('[aria-label="Your orders"]').innerText().catch(() => "");
  log(`your orders: ${myOrders.replace(/\s+/g, " ").slice(0, 200)}`);

  log("open results from the banner");
  await page.getByRole("link", { name: "See results" }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30_000 });
  await page.waitForTimeout(4000);
  await shot("3-close");

  log("dashboard");
  await page.getByRole("link", { name: "Liquidity", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30_000 });
  await page.waitForTimeout(3000);
  await shot("4-liquidity");

  log("attack replay");
  await page.getByRole("button", { name: "Run attack replay" }).click();
  await page.waitForSelector("text=Rejection recorded on stellar.expert", { timeout: 300_000 });
  await page.waitForTimeout(2000);
  await shot("5-replay");
  await collect("replay");

  log("verifier demo (dummy order, on-chain)");
  await page.getByRole("link", { name: "How it works" }).click();
  await page.getByRole("button", { name: /Prove the dummy order and verify on Stellar/ }).click();
  await page.waitForFunction(() => /Verified by the Soroban contract/.test(document.querySelector('[aria-label="Verifier demo"]')?.textContent ?? "") || document.querySelector('[aria-label="Verifier demo"] [role="alert"]'), null, { timeout: 180_000 });
  const v = await page.locator('[aria-label="Verifier demo"]').innerText();
  log(`verifier: ${v.split("\n").slice(-1)[0]}`);
  await page.locator('[aria-label="Verifier demo"]').screenshot({ path: `${OUT}e2e-6-verifier.png` });
  await collect("verifier demo");
} catch (e) {
  errors.push(`run stopped: ${e.message}`);
  await shot("error").catch(() => {});
} finally {
  await browser.close();
  const lines = [...links].map(([h, t]) => `${t}\n    ${h}`);
  writeFileSync(`${OUT}e2e-links.txt`, lines.join("\n") + "\n");
  console.log(`\n${links.size} stellar.expert links:\n${lines.join("\n")}`);
  console.log(errors.length ? `\nErrors:\n${errors.join("\n")}` : "\nNo errors");
}
