// Proves OpenZeppelin confidential-token circuits (register, transfer) off the main thread.
// Separate from prover.worker.ts: these circuits are compiled with nargo 1.0.0-beta.11 and
// run on the SDK's own noir_js beta.11; our order circuit stays on beta.9.
// Proofs use the non-ZK keccak flavour, the only one Soroban's verifier accepts today.
import { CircuitProver } from "stellar-confidential-token-sdk";
import register from "stellar-confidential-token-sdk/circuits/register.json";
import transfer from "stellar-confidential-token-sdk/circuits/transfer.json";

export type ConfidentialCircuit = "register" | "transfer";
export interface ConfidentialRequest { id: number; circuit: ConfidentialCircuit; inputs: Record<string, unknown> }

const circuits = { register, transfer } as const;
const provers = new Map<ConfidentialCircuit, CircuitProver>();

function prover(name: ConfidentialCircuit): CircuitProver {
  let p = provers.get(name);
  if (!p) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p = new CircuitProver(circuits[name] as any);
    provers.set(name, p);
  }
  return p;
}

self.onmessage = async (e: MessageEvent<ConfidentialRequest>) => {
  const { id, circuit, inputs } = e.data;
  try {
    const t0 = performance.now();
    const { proof, publicInputs } = await prover(circuit).prove(inputs as never);
    self.postMessage({ id, ok: true, proof, publicInputs, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
