// Local demo server: lets the app's ?demo controls run admin, bot and attacker
// actions without the browser ever holding those keys. Listens on 127.0.0.1 only;
// the Vite dev server proxies /demo to it.
//
//   npm run demo-server            # on-demand only
//   npm run demo-server -- --loop  # also run the auction loop (reveal bots, close, seed)
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { botAddresses, closeAndSettle, endCommits, faucet, lastReplay, loopTick, replayStep, seed } from "./lib/demo.js";

const PORT = Number(process.env.DEMO_PORT ?? 8787);
const LOOP = process.argv.includes("--loop");

// One operation at a time: admin and bot transactions must not race on sequence numbers.
let queue: Promise<unknown> = Promise.resolve();
let busy: string | null = null;
function serial<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    busy = label;
    try {
      return await fn();
    } finally {
      busy = null;
    }
  });
  queue = run.catch(() => {});
  return run;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
};
const body = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((ok) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => ok(s ? JSON.parse(s) : {}));
  });
const log = (s: string) => console.log(`[demo] ${s}`);

const routes: Record<string, (req: IncomingMessage) => Promise<unknown>> = {
  "GET /demo/status": async () => ({ busy, loop: LOOP, bots: botAddresses(), replay: lastReplay() }),
  "POST /demo/seed": () => serial("Seeding bot orders", async () => ({ steps: await seed(log) })),
  "POST /demo/end-commit": () => serial("Ending the commit window", () => endCommits(log)),
  "POST /demo/close": () => serial("Closing the auction", () => closeAndSettle(log)),
  "POST /demo/faucet": async (req) => {
    const { address } = await body(req);
    if (typeof address !== "string" || !/^G[A-Z2-7]{55}$/.test(address)) throw new Error("bad address");
    return serial("Sending demo tokens", async () => ({ steps: await faucet(address) }));
  },
};
for (const n of [0, 1, 2, 3] as const) routes[`POST /demo/replay/${n}`] = () => serial(`Replay step ${n}`, () => replayStep(n));

createServer(async (req, res) => {
  const key = `${req.method} ${(req.url ?? "").split("?")[0]}`;
  const handler = routes[key];
  if (!handler) return json(res, 404, { error: `no route ${key}` });
  try {
    json(res, 200, await handler(req));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`${key} failed: ${message}`);
    json(res, 500, { error: message });
  }
}).listen(PORT, "127.0.0.1", () => log(`listening on http://127.0.0.1:${PORT}${LOOP ? " with the auction loop" : ""}`));

if (LOOP) {
  setInterval(() => {
    if (!busy) serial("Auction loop", () => loopTick(log)).catch((e) => log(`loop: ${e.message ?? e}`));
  }, 15_000);
}
