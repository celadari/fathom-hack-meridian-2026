// "Verifier demo": proves a DUMMY order with the non-ZK proof flavour that Soroban's UltraHonk
// verifier accepts, and verifies it on Stellar. Real orders never do this: a non-ZK proof can
// leak the order's price and quantity.
import { useState, type CSSProperties } from "react";
import { expertContract, expertTx, IDS } from "../config";
import { read, send } from "../stellar/client";
import { useWallet } from "../stellar/wallet";
import { publicInputBytes } from "./proveOrder";
import { prove } from "./prover";

/** circuits/order/Prover.toml: buy 30,000 at $1.04 with a 50,000 deposit, owner = the demo token issuer. */
const DUMMY = {
  side: "0", price_tick: "14", qty: "300000000000", salt: "0xabc12",
  commitment: "0x007fd2f828bced449d3e7098d0b2a7184b3acf37d23f14f8b03dde97fe487eb2",
  owner: "0x004d8f922844b477553b74f5730fe352fe7a09758e7e498e8a3570c237d55256",
  deposit: "500000000000", grid_min: "9000000", tick_size: "100000", n_ticks: "31",
};

type State =
  | { s: "idle" }
  | { s: "proving" }
  | { s: "verifying"; ms: number; size: number }
  | { s: "done"; ms: number; size: number; link?: string }
  | { s: "error"; error: string };

const btn: CSSProperties = { background: "#131313", color: "#FFFFFF", border: "none", borderRadius: "12px", padding: "10px 14px", fontSize: "14px", fontWeight: 535, fontFamily: "inherit", cursor: "pointer" };

export function VerifierDemo() {
  const { signer } = useWallet();
  const [st, setSt] = useState<State>({ s: "idle" });
  const run = async () => {
    try {
      setSt({ s: "proving" });
      const p = await prove(DUMMY, "onchain");
      const args = { public_inputs: publicInputBytes(p.publicInputs), proof_bytes: p.proof };
      setSt({ s: "verifying", ms: p.ms, size: p.proof.length });
      if (signer) {
        const { hash } = await send(IDS.orderVerifier, "verify_proof", args, signer, { force: true });
        setSt({ s: "done", ms: p.ms, size: p.proof.length, link: expertTx(hash) });
      } else {
        await read(IDS.orderVerifier, "verify_proof", args); // throws if the contract rejects it
        setSt({ s: "done", ms: p.ms, size: p.proof.length });
      }
    } catch (e) {
      setSt({ s: "error", error: e instanceof Error ? e.message.slice(0, 240) : String(e) });
    }
  };
  if (!IDS.orderVerifier) return null;
  return (
    <section aria-label="Verifier demo" style={{ background: "#FFFFFF", border: "1px dashed #B7791F", borderRadius: "24px", padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: "17px" }}>Verifier demo</span>
        <span style={{ fontSize: "12px", color: "#B7791F", border: "1px solid #F0D9A8", background: "#FFF6E0", borderRadius: "999px", padding: "2px 8px" }}>dummy order only</span>
      </div>
      <p style={{ margin: 0, fontSize: "14px", color: "#535353" }}>
        Proves a fixed example order (buy 30,000 USTRY at $1.04 against a 50,000 USDC deposit) in your browser and verifies the proof on Stellar with{" "}
        <a href={expertContract(IDS.orderVerifier)} target="_blank" rel="noreferrer" style={{ color: "#FC72FF" }}>NethermindEth/rs-soroban-ultrahonk</a>, deployed with this circuit's verification key.
      </p>
      <p style={{ margin: 0, fontSize: "13px", color: "#8A5A12", background: "#FFF6E0", borderRadius: "12px", padding: "10px 12px" }}>
        Why only a dummy order: this verifier accepts non-zero-knowledge UltraHonk proofs, which can reveal the private inputs. Real orders get a zero-knowledge proof checked in the browser and never post it; the contract checks funding at reveal.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", fontSize: "13px" }}>
        <button type="button" onClick={() => void run()} disabled={st.s === "proving" || st.s === "verifying"} style={{ ...btn, opacity: st.s === "proving" || st.s === "verifying" ? 0.6 : 1 }}>
          {signer ? "Prove the dummy order and verify on Stellar" : "Prove the dummy order and verify (simulation)"}
        </button>
        {st.s === "proving" && <span aria-live="polite" style={{ color: "#7D7D7D" }}>Proving in your browser…</span>}
        {st.s === "verifying" && <span aria-live="polite" style={{ color: "#7D7D7D" }}>Proof ready ({(st.ms / 1000).toFixed(1)} s, {st.size.toLocaleString("en-US")} bytes). Verifying on Stellar…</span>}
        {st.s === "done" && (
          <span aria-live="polite" style={{ color: "#40B66B" }}>
            ✓ Verified by the Soroban contract {st.link ? <>· <a href={st.link} target="_blank" rel="noreferrer" style={{ color: "#FC72FF" }}>stellar.expert</a></> : "(simulation; connect a wallet to record it)"} · proof {(st.ms / 1000).toFixed(1)} s, {st.size.toLocaleString("en-US")} bytes
          </span>
        )}
        {st.s === "error" && <span role="alert" style={{ color: "#D93A3A" }}>{st.error}</span>}
      </div>
    </section>
  );
}
