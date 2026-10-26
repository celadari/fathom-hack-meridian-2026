// Demo server: lets the app's ?demo controls run admin, bot and attacker actions without
// the browser ever holding those keys. Testnet only.
//
//   npm run demo-server               # local: 127.0.0.1, keys from the Stellar CLI keystore, no token
//   npm run demo-server -- --loop     # also run the auction loop (reveal bots, close, seed)
//
// Hosted (Dockerfile / fly.toml): HOST=0.0.0.0, keys from FATHOM_KEY_* secrets, state on a volume.
// Then every action needs `Authorization: Bearer $DEMO_TOKEN`; status and the faucet stay public.
// All POSTs are rate limited per IP; the faucet also per address.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { botAddresses, closeAndSettle, endCommits, faucet, lastReplay, loopTick, replayStep, seed } from "./lib/demo.js";

const PORT = Number(process.env.PORT ?? process.env.DEMO_PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const TOKEN = process.env.DEMO_TOKEN ?? "";
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const LOOP = process.argv.includes("--loop") || process.env.DEMO_LOOP === "1";
// DEMO_LOCAL_ONLY=1: inside a container whose port is published on 127.0.0.1 only.
if (HOST !== "127.0.0.1" && HOST !== "localhost" && TOKEN.length < 16 && process.env.DEMO_LOCAL_ONLY !== "1") {
  throw new Error("Refusing to listen publicly without DEMO_TOKEN (16+ characters)");
}

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

// Rate limits (in memory): per IP for every POST, per address for the faucet.
const hits = new Map<string, number[]>();
function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
}
const ipOf = (req: IncomingMessage) => (String(req.headers["fly-client-ip"] ?? req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim());

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
};
const body = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((ok, fail) => {
    let s = "";
    req.on("data", (c) => {
      s += c;
      if (s.length > 10_000) fail(new HttpError(413, "body too large"));
    });
    req.on("end", () => {
      try {
        ok(s ? JSON.parse(s) : {});
      } catch {
        fail(new HttpError(400, "bad JSON"));
      }
    });
  });
const log = (s: string) => console.log(`[demo] ${s}`);

function requireToken(req: IncomingMessage) {
  if (!TOKEN) return; // local mode
  const got = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (got !== TOKEN) throw new HttpError(401, "demo token required");
}

type Handler = (req: IncomingMessage) => Promise<unknown>;
const action = (label: string, fn: () => Promise<unknown>): Handler => async (req) => {
  requireToken(req);
  return serial(label, fn);
};

const routes: Record<string, Handler> = {
  "GET /healthz": async () => ({ ok: true }),
  "GET /demo/status": async () => ({ busy, loop: LOOP, bots: botAddresses(), replay: lastReplay(), auth: !!TOKEN }),
  "POST /demo/seed": action("Seeding bot orders", async () => ({ steps: await seed(log) })),
  "POST /demo/end-commit": action("Ending the commit window", () => endCommits(log)),
  "POST /demo/close": action("Closing the auction", () => closeAndSettle(log)),
  "POST /demo/faucet": async (req) => {
    const { address } = await body(req);
    if (typeof address !== "string" || !/^G[A-Z2-7]{55}$/.test(address)) throw new HttpError(400, "bad address");
    if (!allow(`faucet:${address}`, 1, 10 * 60_000)) throw new HttpError(429, "this address got tokens less than 10 minutes ago");
    return serial("Sending demo tokens", async () => ({ steps: await faucet(address) }));
  },
};
for (const n of [0, 1, 2, 3] as const) routes[`POST /demo/replay/${n}`] = action(`Replay step ${n}`, () => replayStep(n));

createServer(async (req, res) => {
  const origin = String(req.headers.origin ?? "");
  if (ORIGINS.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("vary", "origin");
  }
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  const key = `${req.method} ${(req.url ?? "").split("?")[0]}`;
  const handler = routes[key];
  if (!handler) return json(res, 404, { error: `no route ${key}` });
  try {
    if (req.method === "POST" && !allow(`ip:${ipOf(req)}`, 12, 60_000)) throw new HttpError(429, "too many requests, try again in a minute");
    json(res, 200, await handler(req));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    log(`${key} ${status}: ${message}`);
    json(res, status, { error: message });
  }
}).listen(PORT, HOST, () => log(`listening on http://${HOST}:${PORT}${LOOP ? " with the auction loop" : ""}${TOKEN ? " (token required)" : ""}`));

if (LOOP) {
  setInterval(() => {
    if (!busy) serial("Auction loop", () => loopTick(log)).catch((e) => log(`loop: ${e.message ?? e}`));
  }, 15_000);
}
