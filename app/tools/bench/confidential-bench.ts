// Dev-only: times register + 3 transfer proofs in the confidential worker (browser).
// Open /tools/bench/confidential.html on the Vite dev server; results land in window.__bench.
import { addressToField, buildRegisterWitness, buildTransferWitness, deriveKeys, G, randomScalar, scalarMul } from "stellar-confidential-token-sdk";
import type { ConfidentialCircuit } from "../../src/zk/confidential.worker";

const worker = new Worker(new URL("../../src/zk/confidential.worker.ts", import.meta.url), { type: "module" });
let next = 0;
const prove = (circuit: ConfidentialCircuit, inputs: object) =>
  new Promise<{ ms: number; bytes: number }>((res, rej) => {
    const id = next++;
    const on = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      worker.removeEventListener("message", on);
      e.data.ok ? res({ ms: e.data.ms, bytes: e.data.proof.length }) : rej(new Error(e.data.error));
    };
    worker.addEventListener("message", on);
    worker.postMessage({ id, circuit, inputs });
  });

const out = document.getElementById("out")!;
const log: string[] = [];
const say = (s: string) => { log.push(s); out.textContent = log.join("\n"); };
try {
  const addrF = addressToField("CCREDIB3DG3IBVUKBL7QMEK4MTPSTODR7MQ34QY4SQ5LZ5L4WFWNVNXG");
  const aud = () => scalarMul(randomScalar(), G);
  const r = await prove("register", buildRegisterWitness(deriveKeys(randomScalar(), addrF), "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN").inputs);
  say(`register ${r.ms}ms ${r.bytes}B`);
  const sender = deriveKeys(randomScalar(), addrF);
  const ts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = await prove("transfer", buildTransferWitness({ keys: sender, v: 1_000_000n, r: 0n, amount: 250n, pvkB: deriveKeys(randomScalar(), addrF).PVK, kAudR: aud(), kAudS: aud() }).inputs);
    ts.push(t.ms);
    say(`transfer#${i + 1} ${t.ms}ms ${t.bytes}B`);
  }
  (window as unknown as { __bench: object }).__bench = { register: r.ms, transfers: ts, cores: navigator.hardwareConcurrency };
} catch (e) {
  say("error: " + (e as Error).message);
  (window as unknown as { __bench: object }).__bench = { error: (e as Error).message };
}
