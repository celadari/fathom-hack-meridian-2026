// Prove a Fathom order with the circuit in circuits/order (Noir 1.0.0-beta.9, bb.js 0.87.0).
// Runs in the prover Web Worker; also importable from Node for tests.
//
//   mode "private": UltraHonk with a zero-knowledge transcript (keccakZK). Real orders. Checked here,
//                   never posted: Soroban's verifier does not accept ZK proofs yet.
//   mode "onchain": non-ZK UltraHonk (keccak), the only flavour the Soroban verifier accepts.
//                   It can leak the private inputs, so only the dummy order of the verifier demo uses it.
import { UltraHonkBackend } from "@aztec/bb.js";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import circuit from "./fathom_order.json";

export type ProofMode = "private" | "onchain";

/** Circuit inputs, as decimal or 0x-hex strings. */
export interface OrderInputs {
  side: string;
  price_tick: string;
  qty: string;
  salt: string;
  commitment: string;
  owner: string;
  deposit: string;
  grid_min: string;
  tick_size: string;
  n_ticks: string;
}

export interface OrderProof {
  proof: Uint8Array;
  /** 32-byte big-endian public inputs, in circuit order. */
  publicInputs: string[];
  verified: boolean;
  ms: number;
}

let backend: UltraHonkBackend | null = null;

export async function proveOrder(inputs: OrderInputs, mode: ProofMode): Promise<OrderProof> {
  const t0 = performance.now();
  const { witness } = await new Noir(circuit as CompiledCircuit).execute(inputs as unknown as Record<string, string>);
  backend ??= new UltraHonkBackend((circuit as CompiledCircuit).bytecode, { threads: 1 });
  const opts = mode === "onchain" ? { keccak: true } : { keccakZK: true };
  const p = await backend.generateProof(witness, opts);
  const verified = await backend.verifyProof(p, opts);
  return { proof: p.proof, publicInputs: p.publicInputs, verified, ms: performance.now() - t0 };
}

/** Public inputs as the bytes the Soroban verifier expects: 32 bytes each, concatenated. */
export function publicInputBytes(publicInputs: string[]): Uint8Array {
  const out = new Uint8Array(publicInputs.length * 32);
  publicInputs.forEach((h, i) => {
    const hex = h.replace(/^0x/, "").padStart(64, "0");
    for (let j = 0; j < 32; j++) out[i * 32 + j] = parseInt(hex.slice(j * 2, j * 2 + 2), 16);
  });
  return out;
}
