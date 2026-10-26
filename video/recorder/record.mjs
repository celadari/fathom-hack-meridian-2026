// Records the demo footage on the live site (presenter mode) as separate 1920×1080 clips, and logs
// for each clip the moments worth keeping (marks) and where the key numbers are on screen (boxes),
// so the video can cut the waiting and highlight real numbers.
//   node recorder/record.mjs prep          one-off: fresh demo wallet, funded (not recorded)
//   node recorder/record.mjs a b c d e     record clips (a trade, b auction, c next auction + results, d price & depth, e attack)
// The presenter token is read from ~/.fathom-hosted-demo-token and never printed.
import { chromium } from "../../app/node_modules/playwright/index.mjs";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CLIPS = join(ROOT, "public/clips");
const STATE = join(ROOT, "recorder/.wallet-state.json"); // gitignored: the demo burner key
const MARKS = join(CLIPS, "clips.json");
const SITE = process.env.SITE ?? "https://fathom-b3t.pages.dev";
const TOKEN = readFileSync(join(homedir(), ".fathom-hosted-demo-token"), "utf8").trim();
const url = (path) => `${SITE}${path}${path.includes("?") ? "&" : "?"}demo=${TOKEN}`;
const SIZE = { width: 1920, height: 1080 };
mkdirSync(CLIPS, { recursive: true });

// A visible cursor (Playwright videos do not show the mouse) that glides and pulses on click.
const CURSOR = () => {
  const add = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:28px;height:28px;margin:-4px 0 0 -4px;z-index:2147483647;pointer-events:none;transition:transform .05s linear";
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 16.5 L13 25 L16.5 23.5 L13 15 L21 15 Z" fill="#131313" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const ring = document.createElement("div");
    ring.style.cssText = "position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #FC72FF;z-index:2147483646;pointer-events:none;opacity:0";
    document.documentElement.appendChild(ring);
    addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, true);
    addEventListener("mousedown", (e) => {
      ring.style.left = `${e.clientX}px`; ring.style.top = `${e.clientY}px`;
      ring.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.4)" }], { duration: 500 });
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
};

const marks = existsSync(MARKS) ? JSON.parse(readFileSync(MARKS, "utf8")) : {};
const save = () => writeFileSync(MARKS, JSON.stringify(marks, null, 2));

async function clip(name, run) {
  const dir = join(CLIPS, `.tmp-${name}`);
  rmSync(dir, { recursive: true, force: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE }, storageState: existsSync(STATE) ? STATE : undefined });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const m = { marks: {}, boxes: {}, values: {} };
  const at = (k) => { m.marks[k] = (Date.now() - t0) / 1000; console.log(`  [${name}] ${k} @ ${m.marks[k].toFixed(1)}s`); };
  const box = async (k, locator) => {
    const b = await locator.first().boundingBox().catch(() => null);
    if (b) m.boxes[k] = { ...b, t: (Date.now() - t0) / 1000 };
  };
  const value = async (k, locator) => { m.values[k] = (await locator.first().innerText().catch(() => "")).trim(); };
  let cursor = { x: 960, y: 540 };
  const glide = async (locator, click = true) => {
    const b = await locator.first().boundingBox();
    const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const steps = Math.max(18, Math.round(Math.hypot(to.x - cursor.x, to.y - cursor.y) / 14));
    await page.mouse.move(to.x, to.y, { steps });
    cursor = to;
    await page.waitForTimeout(250);
    if (click) await page.mouse.click(to.x, to.y);
  };
  try {
    await run({ page, at, box, value, glide, m });
  } finally {
    marks[name] = m;
    save();
    // Carry the wallet and the order's opening (salt) to the next clip, so it can be revealed.
    await ctx.storageState({ path: STATE }).catch(() => {});
    await ctx.close();
    await browser.close();
    const webm = readdirSync(dir).find((f) => f.endsWith(".webm"));
    renameSync(join(dir, webm), join(CLIPS, `${name}.webm`));
    rmSync(dir, { recursive: true, force: true });
  }
}

const waitText = (page, re, timeout = 600_000) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout });

const CLIP = {
  // (a) Trade: fill an order and seal it; the modal's steps play.
  async a({ page, at, box, value, glide, m }) {
    await page.goto(url("/"), { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Lock & seal order" }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    at("ready");
    await glide(page.locator("#qty"));
    await page.keyboard.press("Control+A");
    await page.keyboard.type("20000", { delay: 120 });
    await glide(page.locator("#limit"), false);
    await page.waitForTimeout(600);
    at("filled");
    m.values.auction = (await page.getByText(/Auction #\d+ ·/).first().innerText()).match(/#(\d+)/)[1];
    await value("qty", page.locator("#qty"));
    m.values.qty = await page.locator("#qty").inputValue();
    m.values.limit = await page.locator("#limit").inputValue();
    await glide(page.getByRole("button", { name: "Lock & seal order" }));
    at("sealClicked");
    // Log each stage of the modal as it starts (its text), to cut the waiting between them.
    const seen = new Set();
    for (;;) {
      const txt = await page.locator('[role="dialog"]').innerText().catch(() => "");
      for (const [k, re] of [["sealed", /Sealed in your browser · fingerprint/], ["proved", /Zero-knowledge proof made/], ["keys", /One-time setup/], ["register", /Registering for confidential USTRY/], ["wrap", /Wrapping tokens/], ["prove", /Proving the confidential deposit/], ["locking", /locking on Stellar/], ["locked", /deposit locked/]]) {
        if (!seen.has(k) && re.test(txt)) { seen.add(k); at(k); }
      }
      if (seen.has("locked") || /Order not placed/.test(txt)) break;
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1200);
    await box("modal", page.locator('[role="dialog"] > div'));
    await box("lockLine", page.getByText(/deposit locked/));
    await value("lockLine", page.getByText(/deposit locked/));
    at("end");
  },
  // (b) The live auction.
  async b({ page, at, box, value, glide, m }) {
    await page.goto(url("/auction"), { waitUntil: "networkidle" });
    await page.getByText(/Live auction/).waitFor();
    await page.waitForTimeout(2500);
    at("ready");
    await box("sealedRow", page.getByText("Your sealed order"));
    await box("depth", page.getByText("Depth", { exact: true }).locator(".."));
    await value("depth", page.getByText("Depth", { exact: true }).locator(".."));
    await value("sealedCount", page.getByText("Sealed orders", { exact: true }).locator(".."));
    m.values.auction = (await page.getByText(/Auction #\d+ is collecting/).first().innerText()).match(/#(\d+)/)[1];
    await glide(page.getByText("Your sealed order").or(page.getByText("Sealed order")).first(), false);
    await page.waitForTimeout(3500);
    at("end");
  },
  // (c) Next auction (presenter bar), then Results from the close banner.
  async c({ page, at, box, value, glide, m }) {
    await page.goto(url("/auction"), { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Next auction" }).waitFor();
    await page.waitForTimeout(1500);
    at("ready");
    // The auction on screen (it holds our sealed order); wait for ITS close banner, not an earlier one.
    const id = (await page.getByText(/Auction #\d+ is collecting/).first().innerText()).match(/#(\d+)/)[1];
    m.values.auction = id;
    await page.evaluate(() => document.querySelector('[role="status"] button[aria-label="Dismiss"]')?.click());
    await glide(page.getByRole("button", { name: "Next auction" }));
    at("nextClicked");
    await page.getByText(new RegExp(`Auction #${id} closed`)).waitFor({ timeout: 1_200_000 });
    at("banner");
    await page.waitForTimeout(1500);
    await glide(page.getByText("See results"));
    await page.getByText(/Everyone trades at|No trade/).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    at("results");
    await box("clearing", page.locator("h2").first());
    await value("clearing", page.locator("h2").first());
    m.values.resultsAuction = (await page.evaluate(() => document.body.innerText)).match(/AUCTION #(\d+) · USTRY/i)?.[1] ?? "";
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(2500);
    at("end");
  },
  // (d) Price & depth.
  async d({ page, at, box, value, glide, m }) {
    await page.goto(url("/liquidity"), { waitUntil: "networkidle" });
    await page.getByText("How much more can Pool B take?").waitFor();
    await page.waitForTimeout(3000);
    at("ready");
    const card = (q) => page.getByText(q).locator("xpath=ancestor::div[contains(@class,'fade')][1]");
    await box("price", card("What is USTRY worth?"));
    await box("depth", card("How much can be sold near NAV?"));
    await box("cap", card("How much more can Pool B take?"));
    for (const [k, q] of [["price", "What is USTRY worth?"], ["depth", "How much can be sold near NAV?"], ["cap", "How much more can Pool B take?"]]) await value(k, card(q));
    await glide(card("What is USTRY worth?"), false);
    await page.waitForTimeout(1200);
    await glide(card("How much can be sold near NAV?"), false);
    await page.waitForTimeout(1200);
    await glide(card("How much more can Pool B take?"), false);
    await page.waitForTimeout(1500);
    at("cardsDone");
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(3000);
    await box("meter", page.locator('section[aria-label="Depth meter"]'));
    at("end");
  },
  // (e) Attack demo, run live from the presenter bar, to Pool A drained and Pool B rejected.
  async e({ page, at, box, value, glide, m }) {
    await page.goto(url("/"), { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Run attack replay" }).waitFor();
    await page.waitForTimeout(1200);
    await glide(page.getByRole("button", { name: "Run attack replay" }));
    await page.getByText("The February attack, step by step").waitFor();
    at("ready");
    for (let k = 2; k <= 6; k++) {
      await page.getByText(`Step ${k} of 6`).waitFor({ timeout: 600_000 });
      at(`step${k}`);
      await page.waitForTimeout(1800);
      const stepPanel = page.locator('section[aria-label="The attack, step by step"] > div.fade');
      await value(`step${k}`, stepPanel);
      if (k === 4) { await box("poolA", stepPanel.locator("svg")); }
      if (k === 5) {
        await box("rejected", stepPanel.locator("svg"));
        m.values.poolBLink = (await stepPanel.locator('a[href*="stellar.expert"]').first().getAttribute("href").catch(() => "")) ?? "";
      }
    }
    await page.waitForTimeout(3000);
    await box("outcome", page.locator('section[aria-label="Pool A"]').locator("xpath=.."));
    await value("poolA", page.locator('section[aria-label="Pool A"]'));
    await value("poolB", page.locator('section[aria-label="Pool B"]'));
    at("end");
  },
};

async function prep() {
  // A fresh demo burner wallet, funded, saved for the clips (not recorded).
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: SIZE });
  const page = await ctx.newPage();
  await page.goto(url("/"), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("menuitem", { name: /Demo wallet/ }).click();
  for (const name of ["Fund with Friendbot", "Add trustlines", "Get demo tokens"]) {
    const btn = page.getByRole("button", { name });
    await btn.waitFor({ timeout: 60_000 });
    await btn.click();
    await page.waitForFunction((n) => ![...document.querySelectorAll("button")].some((b) => b.textContent === n), name, { timeout: 120_000 });
    console.log(`  prep: ${name}`);
    await page.waitForTimeout(1500);
  }
  await page.getByRole("button", { name: "Lock & seal order" }).waitFor({ timeout: 60_000 });
  await ctx.storageState({ path: STATE });
  console.log("  prep: wallet funded and saved");
  await browser.close();
}

for (const name of process.argv.slice(2)) {
  console.log(`clip ${name}`);
  if (name === "prep") await prep();
  else await clip(name, CLIP[name]);
}
