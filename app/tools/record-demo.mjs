// Record the backup demo video: a scripted ~3-minute run of the real app on testnet with
// on-screen captions. Seal → close → dashboard → attack replay.
//
//   (app dev server + demo server running)
//   node tools/record-demo.mjs            → .compare/video/fathom-demo.webm
//
// A warm-up pass (not recorded) funds a demo wallet and seeds bot orders, so the recording
// spends its three minutes on the story, not on Friendbot.
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const OUT = new URL("../.compare/video/", import.meta.url).pathname;
const VIEW = { width: 1440, height: 900 };
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}`);
const pause = (p, ms) => p.waitForTimeout(ms);

// Caption overlay, injected into every page.
const CAPTIONS = () => {
  window.__caption = (title, sub = "") => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText = "position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:99;max-width:900px;background:rgba(19,19,19,.88);color:#fff;border-radius:16px;padding:14px 22px;font:535 20px Inter,system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.2);transition:opacity .3s";
      document.body.appendChild(el);
    }
    el.innerHTML = `${title}${sub ? `<div style="font-weight:400;font-size:15px;opacity:.8;margin-top:4px">${sub}</div>` : ""}`;
    el.style.opacity = title ? "1" : "0";
  };
};
const caption = (p, title, sub) => p.evaluate(([a, b]) => window.__caption?.(a, b), [title, sub]);
const idle = (p, timeout) => p.waitForFunction(() => {
  const bar = document.querySelector('aside[aria-label="Demo controls"]');
  return bar && ![...bar.querySelectorAll("button")].some((b) => b.disabled);
}, null, { timeout });
const loaded = (p) => p.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30_000 });

const browser = await chromium.launch();

// ---- warm-up (not recorded): fund the demo wallet, seed bots, leave a fresh auction open
log("warm-up");
const warm = await browser.newContext({ viewport: VIEW });
const w = await warm.newPage();
await w.goto(`${APP}/?demo`, { waitUntil: "networkidle" });
await loaded(w);
await w.getByRole("button", { name: "Connect", exact: true }).click();
await w.getByRole("menuitem", { name: /Demo wallet/ }).click();
for (let i = 0; i < 4; i++) {
  await w.waitForFunction(() => /Fund with Friendbot|Add trustlines|Get demo tokens|Lock & seal order/.test(document.body.innerText), null, { timeout: 60_000 });
  const step = w.getByRole("button", { name: /Fund with Friendbot|Add trustlines|Get demo tokens/ });
  if (!(await step.count())) break;
  const name = await step.innerText();
  log(`  ${name}`);
  await step.click();
  await w.waitForFunction((n) => ![...document.querySelectorAll("button")].some((b) => b.textContent === n), name, { timeout: 90_000 });
}
log("  close any open auction so the recording starts on a fresh one");
await w.getByRole("button", { name: "Next auction" }).click();
await idle(w, 300_000);
log("  seed bot orders");
await w.getByRole("button", { name: "Seed bot orders" }).click();
await idle(w, 240_000);
const state = await warm.storageState();
await warm.close();

// ---- recording
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const ctx = await browser.newContext({ viewport: VIEW, storageState: state, recordVideo: { dir: OUT, size: VIEW } });
await ctx.addInitScript(CAPTIONS);
const p = await ctx.newPage();
log("recording");

await p.goto(`${APP}/?demo`, { waitUntil: "networkidle" });
await loaded(p);
await caption(p, "Fathom: sealed auctions that measure real liquidity", "Stellar testnet · every number is a contract read or labelled");
await pause(p, 6000);
await caption(p, "The February 2026 YieldBlox exploit", "One trade on a market with under $1 of hourly volume pushed USTRY ×100; a lending pool lost ~$10.2M");
await pause(p, 7000);
await caption(p, "Bots and users place sealed orders", "Only a fingerprint and a fixed-size deposit go on-chain. Price and quantity stay hidden until the close.");
await pause(p, 7000);

await caption(p, "Seal a standing bid: 30,000 USTRY at ≤ $1.04", "Commitment computed in the browser · opening saved locally before sending");
await p.locator("#qty").fill("30,000");
await p.locator("#limit").fill("1.040");
await pause(p, 1500);
await p.getByRole("button", { name: "Lock & seal order" }).click();
await p.waitForFunction(() => /USDC locked/.test(document.body.innerText), null, { timeout: 120_000 });
await caption(p, "Sealed and funded on Stellar", "The order slides into the list from the contract event");
await pause(p, 6000);

await caption(p, "The close: end commits, reveal, one clearing price", "This tab reveals its order automatically; bots reveal theirs");
await p.getByRole("button", { name: "Next auction" }).click();
await idle(p, 300_000);
await p.waitForSelector("text=See results", { timeout: 60_000 });
await caption(p, "Auction closed", "The pink banner comes from the contract's close event");
await pause(p, 3500);
await p.getByRole("link", { name: "See results" }).click();
await loaded(p);
await caption(p, "Everyone trades at one uniform price", "Where the most USTRY changes hands; marginal orders are filled pro rata");
await pause(p, 9000);
await p.mouse.wheel(0, 700);
await caption(p, "Standing bids that did not fill stay in the book", "Locked 7 days, cannot be cancelled: that is the depth");
await pause(p, 6000);

await p.getByRole("link", { name: "Liquidity", exact: true }).click();
await loaded(p);
await caption(p, "Published on-chain as a SEP-40 oracle", "Price = median of the last 7 clearings, capped at NAV · depth = locked standing bids near NAV");
await pause(p, 9000);
await caption(p, "Pools cap borrowing at 50% of the lowest depth over the window", "Depth added just now does not count yet: bait-and-switch protection");
await pause(p, 7000);

await caption(p, "Replay the attack on testnet", "Same request to a pool that trusts the DEX and a pool that reads Fathom");
await p.getByRole("button", { name: "Run attack replay" }).click();
await p.waitForSelector("text=Pump transaction on stellar.expert", { timeout: 180_000 });
await caption(p, "One trade pumps the DEX price to $106", "Fathom's price does not move: it comes from sealed auctions, not the last trade");
await p.waitForSelector("text=Rejection recorded on stellar.expert", { timeout: 240_000 });
await caption(p, "Pool A is drained. Pool B rejects the loan.", "Collateral valued at the Fathom price, borrowing capped by measured depth");
await pause(p, 10_000);
await caption(p, "Fathom: a price and a depth that cannot be faked by trading with yourself", "Open source · Stellar testnet · links to every transaction in the app");
await pause(p, 6000);

await ctx.close();
await browser.close();
const file = readdirSync(OUT).find((f) => f.endsWith(".webm"));
renameSync(`${OUT}${file}`, `${OUT}fathom-demo.webm`);
log(`saved ${OUT}fathom-demo.webm`);
