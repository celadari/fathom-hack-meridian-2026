// Loading, empty and error states for any data slice, in the designs' surface style.
import type { ReactNode } from "react";
import { useFathom } from "../data/useFathom";
import type { Loadable } from "../data/types";

const box = { background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "24px", color: "#7D7D7D", fontSize: "14px" } as const;

export function Slice<T>({ of, children, minHeight = 200, label }: { of: Loadable<T>; children: (data: T) => ReactNode; minHeight?: number; label: string }) {
  const { refresh } = useFathom();
  if (of.status === "ready") return <>{children(of.data)}</>;
  if (of.status === "loading") {
    return (
      <div aria-busy="true" aria-label={`Loading ${label}`} style={{ ...box, minHeight, display: "flex", flexDirection: "column", gap: "12px" }}>
        <span>Reading {label} from testnet…</span>
        {[70, 45, 85].map((w) => <span key={w} style={{ height: "12px", width: `${w}%`, borderRadius: "6px", background: "repeating-linear-gradient(90deg, #EFEFEF 0 14px, #F7F7F7 14px 20px)" }} />)}
      </div>
    );
  }
  if (of.status === "empty") {
    return <div style={{ ...box, minHeight, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{of.reason}</div>;
  }
  return (
    <div role="alert" style={{ ...box, minHeight, borderColor: "#F5C2C2", background: "#FDECEC", color: "#D93A3A", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
      <span>Could not read {label}: {of.error}</span>
      <button type="button" onClick={refresh} style={{ background: "#FFFFFF", color: "#D93A3A", border: "1px solid #F5C2C2", borderRadius: "10px", padding: "8px 14px", fontFamily: "inherit", cursor: "pointer" }}>Try again</button>
    </div>
  );
}

/** One line for a transaction's state: pending, success with link, or error. */
export type TxState = { status: "idle" } | { status: "pending"; label: string } | { status: "done"; label: string; link?: string } | { status: "error"; error: string };

export function TxLine({ s }: { s: TxState }) {
  if (s.status === "idle") return null;
  if (s.status === "pending") return <span aria-live="polite" style={{ fontSize: "13px", color: "#7D7D7D" }}>{s.label}…</span>;
  if (s.status === "error") return <span role="alert" style={{ fontSize: "13px", color: "#D93A3A" }}>{s.error}</span>;
  return (
    <span aria-live="polite" style={{ fontSize: "13px", color: "#40B66B" }}>
      ✓ {s.label}{s.link && <> · <a href={s.link} target="_blank" rel="noreferrer" style={{ color: "#FC72FF" }}>stellar.expert</a></>}
    </span>
  );
}
