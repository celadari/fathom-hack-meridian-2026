// Proves orders off the main thread so the UI keeps animating.
import { proveOrder, type OrderInputs, type ProofMode } from "./proveOrder";

self.onmessage = async (e: MessageEvent<{ id: number; inputs: OrderInputs; mode: ProofMode }>) => {
  const { id, inputs, mode } = e.data;
  try {
    const r = await proveOrder(inputs, mode);
    self.postMessage({ id, ok: true, ...r });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
