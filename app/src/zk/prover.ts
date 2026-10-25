// Main-thread handle on the prover worker.
import type { OrderInputs, OrderProof, ProofMode } from "./proveOrder";

let worker: Worker | null = null;
let next = 0;
const pending = new Map<number, { ok: (p: OrderProof) => void; fail: (e: Error) => void }>();

function get(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./prover.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; error?: string } & OrderProof>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.ok(e.data);
      else p.fail(new Error(cleanNoirError(e.data.error ?? "proof failed")));
    };
  }
  return worker;
}

/** Noir reports failed asserts as "Circuit execution failed: <message>". */
function cleanNoirError(m: string) {
  const hit = /(deposit does not cover the (buy|sell)|price off the grid|commitment does not match the order|empty order)/.exec(m);
  return hit ? `The proof refuses this order: ${hit[1]}` : m;
}

export function prove(inputs: OrderInputs, mode: ProofMode): Promise<OrderProof> {
  const id = ++next;
  return new Promise((ok, fail) => {
    pending.set(id, { ok, fail });
    get().postMessage({ id, inputs, mode });
  });
}
