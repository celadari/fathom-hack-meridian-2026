// ?demo controls, so the whole demo runs from the browser: seed bots, advance to the
// next auction (end commits → your reveals → close), run the attack replay.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import { DEMO, demoToken, setDemoToken } from "../config";
import { useFathom } from "../data/useFathom";
import { useMyOrders } from "../stellar/myOrders";
import { demo, type DemoStep } from "./api";

const btn: CSSProperties = { background: "#FC72FF", color: "#FFFFFF", border: "none", borderRadius: "12px", padding: "10px 12px", fontSize: "13px", fontWeight: 535, fontFamily: "inherit", cursor: "pointer" };

export function DemoBar() {
  const navigate = useNavigate();
  const { refresh, auction } = useFathom();
  const { pendingReveals } = useMyOrders();
  const pendingRef = useRef(pendingReveals);
  pendingRef.current = pendingReveals;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<DemoStep[]>([]);
  const [open, setOpen] = useState(false);
  const [server, setServer] = useState<"unknown" | "up" | "down">("unknown");
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  useEffect(() => {
    demo.status().then((s) => { setServer("up"); setNeedsToken(s.auth && !demoToken()); }).catch(() => setServer("down"));
  }, []);
  if (!DEMO) return null;

  const add = (steps: DemoStep[]) => setLog((l) => [...steps.reverse(), ...l].slice(0, 40));
  const run = async (label: string, f: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await f();
      setServer("up");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  // Close auctions up to the one on screen (older ones may still hold orders: auctions
  // roll over on their own every few minutes), giving this tab time to reveal your
  // orders in each (auto-reveal; Freighter asks you to approve).
  const nextAuction = () => run("Ending the commit window", async () => {
    const target = auction.status === "ready" ? auction.data : null;
    const targetHasOrders = !!target && (target.sealed.length > 0 || pendingRef.current(String(target.id)).length > 0);
    for (let round = 0; round < 4; round++) {
      setBusy("Ending the commit window");
      const r = await demo.endCommit();
      add(r.steps);
      refresh();
      const deadline = Math.min(Number(r.revealEnd) * 1000 - 5_000, Date.now() + 50_000);
      while (pendingRef.current(r.auction).length && Date.now() < deadline) {
        setBusy(`Waiting for your reveal in auction #${r.auction} (${pendingRef.current(r.auction).length} left)`);
        await new Promise((ok) => setTimeout(ok, 1500));
      }
      setBusy(`Closing auction #${r.auction}`);
      const c = await demo.close();
      add(c.steps);
      if (!target || !targetHasOrders || Number(c.auction) >= target.id) break;
    }
  });

  return (
    <aside aria-label="Demo controls" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: "rgba(255,255,255,.96)", borderTop: "1px solid #F0F0F0", boxShadow: "0 -4px 20px rgba(0,0,0,.05)", padding: "8px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontFamily: "Inter, system-ui, sans-serif", fontSize: "13px" }}>
      <span style={{ fontWeight: 600, color: "#FC72FF" }}>Demo</span>
      {needsToken && (
        <form onSubmit={(e) => { e.preventDefault(); setDemoToken(tokenInput.trim()); setNeedsToken(false); }} style={{ display: "flex", gap: "6px" }}>
          <input aria-label="Demo token" type="password" placeholder="Demo token" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} style={{ border: "1px solid #F0F0F0", borderRadius: "10px", padding: "6px 10px", fontFamily: "inherit", fontSize: "13px", width: "140px" }} />
          <button type="submit" style={{ ...btn, background: "#131313" }}>Use</button>
        </form>
      )}
      <button type="button" disabled={!!busy} style={{ ...btn, opacity: busy ? 0.5 : 1 }} onClick={() => run("Seeding bot orders", async () => add((await demo.seed()).steps))}>Seed bot orders</button>
      <button type="button" disabled={!!busy} style={{ ...btn, opacity: busy ? 0.5 : 1 }} onClick={nextAuction}>Next auction</button>
      <button type="button" disabled={!!busy} style={{ ...btn, background: "#131313", opacity: busy ? 0.5 : 1 }} onClick={() => navigate("/replay?autorun=1")}>Run attack replay</button>
      <span style={{ flex: "1 1 200px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: error || server === "down" ? "#D93A3A" : "#7D7D7D" }} role={error ? "alert" : undefined} aria-live="polite">
        {busy ? `${busy}…` : error ?? (server === "down" ? "Demo server not running: cd scripts && npm run demo-server" : log[0] ? `✓ ${log[0].label}` : "testnet")}
      </span>
      {log.length > 0 && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} style={{ background: "none", border: "1px solid #F0F0F0", borderRadius: "10px", padding: "6px 10px", color: "#535353", cursor: "pointer", fontFamily: "inherit" }}>Log ({log.length})</button>
      )}
      {open && log.length > 0 && (
        <ol style={{ position: "absolute", right: "16px", bottom: "calc(100% + 8px)", margin: 0, padding: "10px 12px", listStyle: "none", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "240px", overflowY: "auto", width: "min(380px, calc(100vw - 32px))", background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "16px", boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}>
          {log.map((s, i) => (
            <li key={i} style={{ color: "#535353" }}>✓ {s.label}{s.link && <> · <a href={s.link} target="_blank" rel="noreferrer" style={{ color: "#FC72FF" }}>tx</a></>}</li>
          ))}
        </ol>
      )}
    </aside>
  );
}
