// Calls to the demo server (scripts/demo-server.ts): local through the Vite proxy, or the
// hosted one (VITE_DEMO_API). It holds the admin, bot and attacker keys; the browser never does.
// Actions on the hosted server need its token (?demo=<token>); status and the faucet do not.
import { useEffect, useState } from "react";
import { DEMO, DEMO_API, demoToken } from "../config";

export interface DemoStep { label: string; hash?: string; link?: string }
export interface DemoStatus {
  busy: string | null;
  loop: boolean;
  bots: Record<string, string>;
  replay: { at: number; steps: Partial<Record<"reset" | "pump" | "poolA" | "poolB", DemoStep>> } | null;
  /** True when actions need a token (hosted server). */
  auth: boolean;
}

async function call<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  let r: Response;
  try {
    const token = demoToken();
    const headers: Record<string, string> = {};
    if (body) headers["content-type"] = "application/json";
    if (token && method === "POST") headers.authorization = `Bearer ${token}`;
    r = await fetch(`${DEMO_API}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(DEMO_API === "/demo" ? "Demo server not reachable. Start it with: cd scripts && npm run demo-server" : "Demo server not reachable");
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("This demo server needs its token: open the app with ?demo=<token> or paste it in the demo bar");
  if (!r.ok) throw new Error(data.error ?? `Demo server answered ${r.status}${r.status === 502 || r.status === 504 ? " (is it running? cd scripts && npm run demo-server)" : ""}`);
  return data as T;
}

export const demo = {
  status: () => call<DemoStatus>("GET", "status"),
  seed: () => call<{ steps: DemoStep[] }>("POST", "seed"),
  endCommit: () => call<{ auction: string; revealEnd: string; steps: DemoStep[] }>("POST", "end-commit"),
  close: () => call<{ auction: string; steps: DemoStep[]; result: Record<string, string> }>("POST", "close"),
  replay: (n: 0 | 1 | 2 | 3) => call<DemoStatus["replay"] & { assessment?: unknown }>("POST", `replay/${n}`),
  faucet: (address: string) => call<{ steps: DemoStep[] }>("POST", "faucet", { address }),
};

/**
 * Presenter mode: the ?demo controls act through the demo server with its keys, so they are
 * shown only to whoever holds the token (opened the app with ?demo=<token>), or when the
 * server needs none (a local demo server). Everyone else gets the normal app.
 */
let presenterCheck: Promise<boolean> | null = null;
export function usePresenter(): boolean {
  const [ok, setOk] = useState(DEMO && !!demoToken());
  useEffect(() => {
    if (!DEMO || demoToken()) return;
    presenterCheck ??= demo.status().then((s) => !s.auth).catch(() => false);
    void presenterCheck.then(setOk);
  }, []);
  return ok;
}
