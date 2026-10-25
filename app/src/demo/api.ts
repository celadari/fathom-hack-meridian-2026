// Calls to the local demo server (scripts/demo-server.ts), proxied by Vite at /demo.
// It holds the admin, bot and attacker keys; the browser never does.

export interface DemoStep { label: string; hash?: string; link?: string }
export interface DemoStatus {
  busy: string | null;
  loop: boolean;
  bots: Record<string, string>;
  replay: { at: number; steps: Partial<Record<"reset" | "pump" | "poolA" | "poolB", DemoStep>> } | null;
}

async function call<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/demo/${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Demo server not reachable. Start it with: cd scripts && npm run demo-server");
  }
  const data = await r.json().catch(() => ({}));
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
