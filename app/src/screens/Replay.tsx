// Port of designs/Replay.html (attack replay), driven by the same three steps.
// With ?demo each step runs on testnet through the demo server and the numbers shown are
// live reads. Without it, DEX and Pool A figures are the replay scenario (labelled simulated);
// Fathom price, depth and Pool B's verdict are always live reads (Pool B `assess`).
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router";
import { Header, Page } from "../components/Header";
import { Slice, TxLine, type TxState } from "../components/State";
import { DEMO } from "../config";
import { demo, type DemoStep } from "../demo/api";
import type { ReplayView } from "../data/types";
import { useFathom } from "../data/useFathom";
import { fmtInt, fmtK, fmtUsd } from "../lib/format";

const pill = (c: string, bg: string, b: string): CSSProperties => ({ marginLeft: "auto", fontSize: "12px", color: c, border: `1px solid ${b}`, background: bg, borderRadius: "999px", padding: "4px 10px" });
const green = pill("#40B66B", "#EEF9F1", "#BFE5CF");
const red = pill("#D93A3A", "#FDECEC", "#F5C2C2");
const amber = pill("#B7791F", "#FFF6E0", "#F0D9A8");
const box = (border: string, anim?: string): CSSProperties => ({ animation: anim ?? "none", flex: "1 1 480px", minWidth: 0, background: "#F9F9F9", border: `1px solid ${border}`, borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "18px" });
const txLink: CSSProperties = { fontSize: "12px", color: "#FC72FF" };
const SCENARIO = { dex: 1.04 };

export function Replay() {
  const { replay } = useFathom();
  return (
    <Page minHeight={980}>
      <Header />
      <Slice of={replay} label="the replay" minHeight={400}>{(r) => <ReplayRoom r={r} />}</Slice>
    </Page>
  );
}

function ReplayRoom({ r }: { r: ReplayView }) {
  const { refresh, liquidity } = useFathom();
  const medianWindow = liquidity.status === "ready" ? liquidity.data.medianWindow : 7;
  const [params, setParams] = useSearchParams();
  const [s, setS] = useState(0);
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const [links, setLinks] = useState<{ pump?: DemoStep; poolA?: DemoStep; poolB?: DemoStep }>({});
  const live = DEMO;
  const base = "USTRY";
  const a = r.assessment;
  const factor = Number((r.pumpPrice / (live ? 1.04 : SCENARIO.dex)).toPrecision(2));

  // Numbers on screen: live reads in demo mode; the scenario otherwise.
  const dexShown = live ? r.dexStart : s === 0 ? SCENARIO.dex : r.pumpPrice;
  const poolATvl = live ? r.poolATvl : s === 3 ? 0 : r.poolTvl;
  const dexValue = r.collateral * r.pumpPrice;

  const step = useCallback(async (from: number) => {
    if (!live) return setS(Math.min(from + 1, 3));
    try {
      if (from === 0) {
        setTx({ status: "pending", label: "Resetting the DEX price and refilling the pools" });
        await demo.replay(0);
        setTx({ status: "pending", label: "Attacker pumps the DEX with one trade" });
        const run = await demo.replay(1);
        setLinks({ pump: run?.steps.pump });
      } else if (from === 2) {
        setTx({ status: "pending", label: "Attacker borrows from Pool A" });
        const ra = await demo.replay(2);
        setTx({ status: "pending", label: "Same request to Pool B" });
        const rb = await demo.replay(3);
        setLinks((l) => ({ ...l, poolA: ra?.steps.poolA, poolB: rb?.steps.poolB }));
      }
      setTx({ status: "idle" });
      refresh();
      setS(from + 1);
    } catch (e) {
      setTx({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }, [live, refresh]);

  const reset = async () => {
    setS(0);
    setLinks({});
    if (!live) return;
    setTx({ status: "pending", label: "Resetting the DEX price and refilling the pools" });
    try {
      await demo.replay(0);
      setTx({ status: "idle" });
      refresh();
    } catch (e) {
      setTx({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  // "Run attack replay" from the demo bar: walk all steps with pauses for narration.
  const autorun = useRef(false);
  useEffect(() => {
    if (!params.has("autorun") || autorun.current) return;
    autorun.current = true;
    setParams({}, { replace: true });
    void (async () => {
      for (const from of [0, 1, 2]) {
        await step(from);
        await new Promise((ok) => setTimeout(ok, 2500));
      }
    })();
  }, [params, setParams, step]);

  const busy = tx.status === "pending";
  const texts = [
    `Attacker buys ${base} on a DEX with under $1 of hourly volume (real event). Price jumps ${factor}×.`,
    `Attacker deposits ${base} as collateral and asks both pools for a large loan.`,
    "Pool A lends against the fake price. Pool B checks Fathom.",
  ];
  const stepStyle = (i: number): CSSProperties => {
    const done = i < s;
    return {
      ...(done ? { animation: "fadeUp .4s ease-out both" } : {}),
      flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "6px", padding: "14px 16px", borderRadius: "12px", fontSize: "14px",
      border: `1px solid ${done ? "#FC72FF" : "#F0F0F0"}`, background: done ? "#FFEFFF" : "#F9F9F9", color: done ? "#131313" : "#7D7D7D",
    };
  };
  const aNotes = [
    "Price comes from the last DEX trade.",
    `Last trade says ${base} is worth ${fmtUsd(r.pumpPrice, 0)}. Collateral looks ${factor}× bigger.`,
    "Collateral looks huge. Loan approved.",
    `Attacker walks away with the pool. ${base} was never worth ${fmtUsd(r.pumpPrice, 0)}.`,
  ];
  const bNotes = [
    `Price is the ${medianWindow}-auction median, capped at NAV. Depth comes from locked buy orders.`,
    `DEX trade ignored. Fathom still says ${fmtUsd(r.fathomPrice)} with ${fmtInt(r.depth)} ${base} of depth.`,
    `Loan sized on ${fmtUsd(r.fathomPrice)} and capped by depth. Request too large.`,
    a.reasons.includes("DepthTooLow") ? "Depth too low · borrow rejected. Pool keeps its funds." : "Borrow rejected. Pool keeps its funds.",
  ];
  const reasons = [
    a.reasons.includes("NoPrice") && "Fathom publishes no price for USTRY right now, so Pool B lends nothing against it.",
    a.reasons.includes("InsufficientCollateral") &&
      `${fmtInt(a.collateral)} ${base} is worth ${fmtUsd(a.collateralValue, 0)} at the Fathom price, not ${fmtUsd(dexValue, 0)} at the DEX price. Max loan ${fmtUsd(a.maxLoan, 0)} vs ${fmtUsd(a.requested, 0)} asked.`,
    a.reasons.includes("DepthTooLow") &&
      `Depth cap ${fmtInt(a.cap)} ${base} (${r.capSharePct}% of lowest depth ${fmtInt(a.minDepthWindow)}) vs ${fmtInt(a.collateralAfter)} requested.`,
  ].filter(Boolean) as string[];

  return (
    <main style={{ maxWidth: "1360px", margin: "0 auto", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <section style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "760px" }}>
          <span style={{ fontSize: "13px", color: "#7D7D7D", letterSpacing: "0.08em", textTransform: "uppercase" }}>February 2026 · YieldBlox pattern</span>
          <h1 style={{ margin: 0, fontSize: "34px", fontWeight: 600 }}>One trade pumped {base} {factor}×. Two pools, two oracles.</h1>
          <span style={{ fontSize: "12px", color: live ? "#40B66B" : "#B7791F" }}>
            {live ? "Live on testnet: every step is a real transaction; numbers are contract reads." : "Simulated replay: DEX and Pool A numbers are the scenario. Fathom and Pool B numbers are live reads. Open with ?demo to run it on testnet."}
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" disabled={busy || s === 3} onClick={() => void step(s)} style={{ background: "#FC72FF", color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "14px 20px", fontSize: "15px", fontWeight: 600, minHeight: "48px", fontFamily: "inherit", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Running on testnet…" : s === 0 ? "Replay the February attack" : s < 3 ? "Next step" : "Replay finished"}
          </button>
          <button type="button" disabled={busy} onClick={() => void reset()} style={{ background: "#FFFFFF", color: "#535353", border: "1px solid #F0F0F0", borderRadius: "10px", padding: "14px 18px", fontSize: "15px", minHeight: "48px", fontFamily: "inherit", cursor: "pointer" }}>Reset</button>
        </div>
      </section>
      <TxLine s={tx} />

      <ol aria-label="Replay steps" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "12px" }}>
        {texts.map((t, i) => (
          <li key={i} style={stepStyle(i)}><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "12px", color: "#7D7D7D" }}>Step {i + 1}</span><span>{t}</span></li>
        ))}
      </ol>

      {s >= 1 && (
        <div style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "12px 16px", animation: "fadeUp .4s ease-out both" }}>
          <svg viewBox="0 0 1240 140" role="img" aria-label={`${base} DEX price jumps from ${fmtUsd(SCENARIO.dex)} to ${fmtUsd(r.pumpPrice, 0)} on one trade`} style={{ width: "100%", height: "auto" }}>
            <line x1="40" y1="120" x2="1200" y2="120" stroke="#F0F0F0" />
            <path className="draw" style={{ "--len": 1400 } as CSSProperties} d="M40 116 L300 117 L520 115 L700 116 L720 14 L1200 14" fill="none" stroke="#E5484D" strokeWidth="3" />
            <circle className="pop" style={{ animationDelay: "1.2s" }} cx="720" cy="14" r="7" fill="#E5484D" />
            <circle className="ring" cx="720" cy="14" r="7" fill="none" stroke="#E5484D" strokeWidth="2" />
            <text x="40" y="104" fontSize="13" fill="#7D7D7D">DEX price · {fmtUsd(SCENARIO.dex)}</text>
            <text className="fade" style={{ animationDelay: "1.3s" }} x="736" y="40" fontSize="15" fontWeight="600" fill="#D93A3A">{fmtUsd(r.pumpPrice, 0)} after one trade (real event: under $1 of hourly volume)</text>
          </svg>
          {links.pump?.link && <a href={links.pump.link} target="_blank" rel="noreferrer" style={txLink}>Pump transaction on stellar.expert</a>}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "stretch" }}>
        <section aria-label="Pool A" style={box(s === 3 ? "#E5484D" : "#F0F0F0", s === 3 ? "shake .5s ease-in-out" : undefined)}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Pool A</h2>
            <span style={{ fontSize: "13px", color: "#7D7D7D" }}>reads last DEX trade</span>
            <span style={s === 0 ? green : s === 3 ? red : amber}>{s === 0 ? "Normal" : s === 3 ? "Drained" : "Price spike"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#7D7D7D" }}>{base} price it sees</span>
              <span style={{ display: "inline-block", transformOrigin: "left center", fontVariantNumeric: "tabular-nums", fontSize: "28px", color: s === 0 ? "#131313" : "#D93A3A", ...(s >= 1 ? { animation: "spike .6s ease-out" } : {}) }}>{fmtUsd(dexShown)}</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#7D7D7D" }}>Pool funds (TVL)</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "28px" }}>{poolATvl < 1 ? "$0" : `$${fmtK(poolATvl)}`}</span></div>
          </div>
          <div style={{ height: "10px", borderRadius: "5px", background: "#F0F0F0", overflow: "hidden" }}><div style={{ height: "100%", transition: "width 1.8s ease-in, background .4s", background: s === 3 ? "#E5484D" : "#40B66B", width: s === 3 ? "0%" : "100%" }} /></div>
          <p style={{ margin: 0, fontSize: "14px", color: "#535353", minHeight: "44px" }}>{aNotes[s]}</p>
          {s === 3 && links.poolA?.link && <a href={links.poolA.link} target="_blank" rel="noreferrer" style={txLink}>Loan transaction on stellar.expert</a>}
        </section>

        <section aria-label="Pool B" style={box(s === 3 ? "#40B66B" : "#F0F0F0", s === 3 ? "shield 1.2s ease-out 3" : undefined)}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Pool B</h2>
            <span style={{ fontSize: "13px", color: "#7D7D7D" }}>reads Fathom</span>
            <span style={s === 3 ? { ...amber, animation: "popIn .5s ease-out" } : green}>{s === 3 ? "Borrow rejected" : "Normal"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#7D7D7D" }}>{base} price it sees</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "28px" }}>{r.fathomPrice ? fmtUsd(r.fathomPrice) : "none"}</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#7D7D7D" }}>Pool funds (TVL)</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "28px" }}>${fmtK(r.poolTvl)}</span></div>
          </div>
          <div style={{ height: "10px", borderRadius: "5px", background: "#F0F0F0", overflow: "hidden" }}><div style={{ height: "100%", width: "100%", background: "#40B66B" }} /></div>
          <p style={{ margin: 0, fontSize: "14px", color: "#535353", minHeight: "44px" }}>{bNotes[s]}</p>
          {s === 3 && (
            <ul className="fade" style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#535353" }}>
              {reasons.map((t) => <li key={t}>{t}</li>)}
            </ul>
          )}
          {s === 3 && links.poolB?.link && <a href={links.poolB.link} target="_blank" rel="noreferrer" style={txLink}>Rejection recorded on stellar.expert</a>}
        </section>
      </div>

      <p style={{ margin: 0, fontSize: "13px", color: "#7D7D7D" }}>Replay of the attack pattern with testnet contracts. Real event: about $10.2M drained from a Blend pool, about $7M later frozen by validators.</p>
    </main>
  );
}
