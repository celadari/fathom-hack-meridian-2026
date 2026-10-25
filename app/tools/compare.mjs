// Screenshot each screen next to its design and diff them.
//
//   npm run dev &           # app on :5173
//   node tools/compare.mjs  # writes .compare/<case>-<width>.{design,app,diff,side}.png + report.json
//
// The designs need the design tool's support.js, which we don't have. This renders them
// statically instead: it runs each design's own Component.renderVals() (with a given
// state), expands <sc-for> lists and {{placeholders}}, and drops the tool's wrappers.
// Screens are captured with reduced motion so both sides show their settled frame.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESIGNS = resolve(ROOT, "../designs");
const OUT = resolve(ROOT, ".compare");
const APP = process.env.APP_URL ?? "http://localhost:5173";
const WIDTHS = [1440, 390];

const CASES = [
  { name: "auction", design: "Main", route: "/" },
  { name: "auction-sealed", design: "Main", state: { sealed: true }, route: "/", act: (p) => p.getByRole("button", { name: "Lock & seal order" }).click() },
  { name: "close", design: "Close", route: "/close" },
  { name: "liquidity", design: "Dashboard", route: "/liquidity" },
  { name: "replay", design: "Replay", route: "/replay" },
  {
    name: "replay-step3", design: "Replay", state: { step: 3 }, route: "/replay",
    act: async (p) => {
      await p.getByRole("button", { name: "Replay the February attack" }).click();
      await p.getByRole("button", { name: "Next step" }).click();
      await p.getByRole("button", { name: "Next step" }).click();
    },
  },
  { name: "how-it-works", design: "Explainer", route: "/how-it-works" },
];

function renderDesign(file, state = {}) {
  const html = readFileSync(resolve(DESIGNS, `${file}.html`), "utf8");
  const script = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  class DCLogic {
    constructor(props) { this.props = props; this.state = {}; }
    setState(s) { Object.assign(this.state, s); }
  }
  const Component = new Function("DCLogic", `${script}; return Component;`)(DCLogic);
  const c = new Component({});
  Object.assign(c.state, state);
  const vals = c.renderVals();
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const fill = (s, scope) =>
    s.replace(/\{\{([\w.]+)\}\}/g, (_, p) => {
      const v = get(scope, p);
      return typeof v === "function" || v == null ? "" : String(v);
    });

  let body = html
    .replace(/<script src="\.\/support\.js"><\/script>/, "")
    .replace(/<script type="text\/x-dc"[\s\S]*?<\/script>/, "")
    .replace(/ onClick="\{\{\w+\}\}"/g, "")
    .replace(/<\/?helmet>/g, "")
    .replace(/<x-dc>/g, "<div>")
    .replace(/<\/x-dc>/g, "</div>");
  body = body.replace(/<sc-for list="\{\{([\w.]+)\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g, (_, list, as, inner) =>
    (get(vals, list) ?? []).map((item) => fill(inner, { ...vals, [as]: item })).join(""),
  );
  return fill(body, vals);
}

const readPng = (buf) => PNG.sync.read(buf);

/** Pad to a common size (white), then diff and build a side-by-side image. */
function compare(a, b) {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const pad = (img) => {
    const out = new PNG({ width: w, height: h });
    out.data.fill(255);
    PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
    return out;
  };
  const A = pad(a);
  const B = pad(b);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(A.data, B.data, diff.data, w, h, { threshold: 0.12 });
  const gap = 24;
  const side = new PNG({ width: w * 2 + gap, height: h });
  side.data.fill(255);
  PNG.bitblt(A, side, 0, 0, w, h, 0, 0);
  PNG.bitblt(B, side, 0, 0, w, h, w + gap, 0);
  return { mismatch: n / (w * h), diff, side, heights: [a.height, b.height] };
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];
const only = process.argv[2];
for (const c of CASES.filter((x) => !only || x.name.startsWith(only))) {
  const designHtml = resolve(OUT, `${c.name}.design.html`);
  writeFileSync(designHtml, renderDesign(c.design, c.state));
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 980 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const shot = async (url, act) => {
      await page.goto(url, { waitUntil: "networkidle" });
      if (act) await act(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      return page.screenshot({ fullPage: true });
    };
    const d = await shot(`file://${designHtml}`);
    const a = await shot(`${APP}${c.route}`, c.act);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const r = compare(readPng(d), readPng(a));
    const base = resolve(OUT, `${c.name}-${width}`);
    writeFileSync(`${base}.design.png`, d);
    writeFileSync(`${base}.app.png`, a);
    writeFileSync(`${base}.diff.png`, PNG.sync.write(r.diff));
    writeFileSync(`${base}.side.png`, PNG.sync.write(r.side));
    report.push({ case: c.name, width, mismatchPct: +(r.mismatch * 100).toFixed(2), designHeight: r.heights[0], appHeight: r.heights[1], appHorizontalOverflow: overflow });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
console.table(report);
