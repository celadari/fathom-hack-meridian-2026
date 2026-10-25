// The account's own orders: reveal status, "Reveal now" with a countdown, the 1% warning,
// and backup / restore of the saved openings.
import { useRef, useState } from "react";
import { expertTx, num } from "../config";
import { fmtCountdown, fmtInt, fmtUsd } from "../lib/format";
import { ledgerNow } from "../stellar/events";
import { useMyOrders, type MyOrder } from "../stellar/myOrders";
import { downloadBackup, importBackup } from "../stellar/openings";
import { useWallet } from "../stellar/wallet";

const link = { color: "#FC72FF", fontSize: "13px" } as const;
const small = { background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "10px", padding: "6px 10px", fontSize: "13px", fontFamily: "inherit", cursor: "pointer", color: "#535353" } as const;

export function MyOrdersPanel({ grid, penaltyPct }: { grid: { min: number; tick: number }; penaltyPct: number }) {
  const { address } = useWallet();
  const { orders, reveal, reload } = useMyOrders();
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  if (!address || !orders.length) return null;
  const now = ledgerNow();
  const atRisk = orders.some((o) => o.phase === "sealed" || o.phase === "reveal-window");

  const describe = (o: MyOrder) => {
    const price = grid.min + o.priceTick * grid.tick;
    return `${o.side === 0 ? "Buy" : "Sell"} ${fmtInt(num(o.qty))} ${o.side === 0 ? "≤" : "≥"} ${fmtUsd(price)} · ${fmtInt(num(o.deposit))} ${o.depositToken}${o.standing ? " · standing" : ""}`;
  };
  const penalty = (o: MyOrder) => `${fmtInt((num(o.deposit) * penaltyPct) / 100)} ${o.depositToken}`;

  return (
    <div aria-label="Your orders" style={{ display: "flex", flexDirection: "column", gap: "10px", background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "16px", marginTop: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 535 }}>Your orders</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <button type="button" style={small} onClick={() => downloadBackup(address)}>Download backup</button>
          <button type="button" style={small} onClick={() => file.current?.click()}>Restore</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              setRestoreMsg(`Restored ${importBackup(address, await f.text())} openings`);
              reload();
            } catch (err) {
              setRestoreMsg(err instanceof Error ? err.message : String(err));
            }
          }} />
        </span>
      </div>
      {restoreMsg && <span style={{ fontSize: "13px", color: "#535353" }}>{restoreMsg}</span>}
      {atRisk && (
        <div role="note" style={{ background: "#FFF6E0", color: "#8A5A12", borderRadius: "12px", padding: "10px 12px", fontSize: "13px" }}>
          Keep this tab open: it reveals your orders automatically in the reveal window. An order not revealed in time loses {penaltyPct}% of its deposit. Your openings are saved in this browser; download a backup to be safe.
        </div>
      )}
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
        {orders.slice(0, 8).map((o) => (
          <li key={o.commitment} style={{ display: "flex", flexDirection: "column", gap: "6px", background: "#FFFFFF", border: `1px solid ${o.phase === "reveal-window" ? "#FC72FF" : "#F0F0F0"}`, borderRadius: "14px", padding: "10px 12px", fontSize: "14px" }}>
            <span>{describe(o)}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "13px", color: "#7D7D7D" }}>
              {o.phase === "sending" && <span>Sending…</span>}
              {o.phase === "failed" && <span style={{ color: "#D93A3A" }}>Not placed: {o.error ?? "unknown error"}</span>}
              {o.phase === "sealed" && <span>Sealed · reveal opens in {o.window ? fmtCountdown(o.window.commitEnd - now) : "…"}</span>}
              {o.phase === "reveal-window" && o.window && (
                <>
                  <span style={{ color: "#131313", fontWeight: 535 }}>Reveal window · {fmtCountdown(o.window.revealEnd - now)} left</span>
                  <button type="button" onClick={() => void reveal(o)} style={{ ...small, background: "#FC72FF", color: "#FFFFFF", border: "none" }}>Reveal now</button>
                  <span style={{ color: "#8A5A12" }}>Missing it costs {penalty(o)}</span>
                </>
              )}
              {o.phase === "revealing" && <span>Revealing… (approve in your wallet)</span>}
              {o.phase === "revealed" && <span style={{ color: "#40B66B" }}>Revealed ✓ · waits for the close</span>}
              {o.phase === "settled" && <span style={{ color: "#40B66B" }}>Closed · filled {fmtInt(num(o.filled ?? "0"))}</span>}
              {o.phase === "missed" && <span style={{ color: "#D93A3A" }}>Not revealed · {penalty(o)} penalty</span>}
              {o.error && o.phase !== "failed" && <span style={{ color: "#D93A3A" }}>{o.error}</span>}
              {o.placeTx && <a style={link} href={expertTx(o.placeTx)} target="_blank" rel="noreferrer">sealed tx</a>}
              {o.revealTx && <a style={link} href={expertTx(o.revealTx)} target="_blank" rel="noreferrer">reveal tx</a>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
