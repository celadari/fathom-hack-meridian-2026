// Order progress in a dialog (like a swap confirmation): the animation for the current step,
// the stations for confidential deposits, and the step list. Closing it never cancels the order;
// the Trade widget shows a chip to reopen it while sealing continues.
import { useEffect, type ReactNode } from "react";
import { CONFIDENTIAL } from "../config";
import type { SealProgress } from "../stellar/myOrders";
import { ConfidentialScene, StageHero } from "./ConfidentialScene";

export interface SealState {
  text: string;
  lock: string;
  p: SealProgress;
  stages: string[];
}

export function SealModal({ state, token, onClose }: { state: SealState; token: string; onClose: () => void }) {
  const { p } = state;
  const fingerprint = "fingerprint" in p ? p.fingerprint : null;
  const proofMs = "proofMs" in p ? p.proofMs : null;
  const locked = p.step === "locked";
  const failed = p.step === "error";
  const confidential = CONFIDENTIAL && state.stages.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = locked ? "Order sealed" : failed ? "Order not placed" : "Sealing your order";
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(19,19,19,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} className="fade" style={{ width: "100%", maxWidth: "460px", maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "#FFFFFF", borderRadius: "24px", padding: "20px", boxShadow: "0 16px 48px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: "18px", fontWeight: 600 }}>{title}</span>
          <span style={{ marginLeft: "8px", color: "#7D7D7D", fontSize: "14px" }}>{state.text}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "#F9F9F9", borderRadius: "12px", width: "32px", height: "32px", fontSize: "18px", cursor: "pointer" }}>×</button>
        </div>

        {confidential && !locked && !failed ? (
          <StageHero stages={state.stages} token={token} />
        ) : (
          <Envelope text={state.text} locked={locked} proved={proofMs !== null} />
        )}
        {confidential && <ConfidentialScene stages={state.stages} locked={locked} failed={failed} token={token} />}

        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
          <Step done={!!fingerprint} current={!fingerprint && !failed}>{fingerprint ? `Sealed in your browser · fingerprint ${fingerprint}` : "Sealing in your browser"}</Step>
          <Step done={proofMs !== null} current={!!fingerprint && proofMs === null && !failed} hint="A zero-knowledge proof that the order is on the price grid and paid for, checked in your browser. Not posted on-chain (Soroban's verifier only takes non-ZK proofs today); the contract also checks funding at reveal.">
            {proofMs !== null ? `Zero-knowledge proof made and checked in your browser (${(proofMs / 1000).toFixed(1)} s)` : "Proving the order is valid and paid for"}
          </Step>
          {state.stages.map((st, i) => {
            const current = i === state.stages.length - 1 && !locked;
            return <Step key={st} done={!current} current={current && !failed} failed={current && failed}>{current && !failed ? st : st.replace(/…$/, "")}</Step>;
          })}
          <Step done={locked} current={false}>
            {locked ? state.lock : "Funds not locked yet"}
            {p.step === "locked" && <> · <a href={p.link} target="_blank" rel="noreferrer" style={{ color: "#FC72FF" }}>stellar.expert</a></>}
          </Step>
        </ol>
        {failed && <span role="alert" style={{ fontSize: "13px", color: "#D93A3A" }}>{p.error}</span>}
        {(locked || failed) && (
          <button type="button" onClick={onClose} style={{ border: "none", background: locked ? "#FC72FF" : "#F9F9F9", color: locked ? "#FFFFFF" : "#131313", borderRadius: "16px", padding: "14px", fontSize: "16px", fontWeight: 535, fontFamily: "inherit", cursor: "pointer" }}>
            {locked ? "Done" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}

function Step({ done, current, failed, hint, children }: { done: boolean; current: boolean; failed?: boolean; hint?: string; children: ReactNode }) {
  return (
    <li className="fade" style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
      {failed ? <span style={{ color: "#D93A3A" }}>✕</span>
        : current ? <span className="live" aria-hidden="true" style={{ flex: "none", marginTop: "4px" }} />
        : <span className={done ? "pop" : undefined} style={{ color: done ? "#40B66B" : "#B5B5B5" }}>{done ? "✓" : "…"}</span>}
      <span style={{ color: current ? "#131313" : done ? "#7D7D7D" : "#B5B5B5" }}>
        {children}
        {hint && <span title={hint} aria-label={hint} style={{ marginLeft: "6px", cursor: "help", color: "#B5B5B5" }}>ⓘ</span>}
      </span>
    </li>
  );
}

function Envelope({ text, locked, proved }: { text: string; locked: boolean; proved: boolean }) {
  return (
    <svg viewBox="0 0 440 120" role="img" aria-label="Order sealed into an envelope and locked" style={{ width: "100%", height: "auto" }}>
      <g style={{ animation: "slideInto .9s ease-in .1s both" }}><rect x="20" y="35" width="110" height="50" rx="12" fill="#FFFFFF" stroke="#F0F0F0" /><text x="75" y="66" textAnchor="middle" fontSize="14" fontWeight="600" fill="#131313">{text}</text></g>
      <g transform="translate(170 18)">
        <rect x="0" y="14" width="100" height="66" rx="8" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
        <path d="M0 14 L50 50 L100 14" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" style={{ transformOrigin: "50% 0%", animation: "flapClose .4s ease-out 1s both" }} />
        {locked && <g className="pop"><rect x="40" y="50" width="20" height="16" rx="3" fill="#FC72FF" /><path d="M44 50 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke="#FC72FF" strokeWidth="2.5" /></g>}
      </g>
      {proved ? (
        // CSS animations replace the transform attribute: position outside, pop inside.
        <g transform="translate(330 22)"><g className="pop" style={{ transformBox: "fill-box" }}><circle cx="40" cy="40" r="34" fill="#EEF9F1" /><path d="M24 41 l10 10 l22 -22" fill="none" stroke="#40B66B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></g></g>
      ) : (
        <g transform="translate(330 22)"><circle cx="40" cy="40" r="34" fill="none" stroke="#D9D9D9" strokeWidth="2" strokeDasharray="4 6" /><text x="40" y="45" textAnchor="middle" fontSize="13" fill="#B5B5B5">ZK</text></g>
      )}
    </svg>
  );
}
