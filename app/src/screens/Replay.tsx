// Port of designs/Replay.html (attack replay), driven by the same three steps.
// Differences from the design: TVL is the testnet pools' real $1M (the footnote keeps the
// real event's $10.2M), and step 3 lists every reason Pool B gave, with its numbers.
import { useState, type CSSProperties } from "react";
import { Header, Page } from "../components/Header";
import { useFathom } from "../data/useFathom";
import { fmtInt, fmtK, fmtUsd } from "../lib/format";

const pill = (c: string, bg: string, b: string): CSSProperties => ({ marginLeft: "auto", fontSize: "12px", color: c, border: `1px solid ${b}`, background: bg, borderRadius: "999px", padding: "4px 10px" });
const green = pill("#40B66B", "#EEF9F1", "#BFE5CF");
const red = pill("#D93A3A", "#FDECEC", "#F5C2C2");
const amber = pill("#B7791F", "#FFF6E0", "#F0D9A8");
const box = (border: string, anim?: string): CSSProperties => ({ animation: anim ?? "none", flex: "1 1 480px", minWidth: 0, background: "#F9F9F9", border: `1px solid ${border}`, borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "18px" });
const txLink: CSSProperties = { fontSize: "12px", color: "#FC72FF" };

export function Replay() {
  const { replay: r, liquidity } = useFathom();
  const [s, setS] = useState(0);
  const base = liquidity.asset;
  const pump = fmtUsd(r.pumpPrice);
  const tvl = `$${fmtK(r.poolTvl)}`;
  const a = r.assessment;
  const dexValue = r.collateral * r.pumpPrice;
  // $1.04 → $106 is ~102×; say "100×" like the design (two significant figures).
  const factor = Number((r.pumpPrice / r.dexStart).toPrecision(2));

  const texts = [
    `Attacker buys ${base} on a DEX with under $1 of hourly volume. Price jumps ${factor}×.`,
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
    "Price is the 7-auction median, capped at NAV. Depth comes from locked buy orders.",
    `DEX trade ignored. Fathom still says ${fmtUsd(r.fathomPrice)} with ${fmtInt(r.depth)} ${base} of depth.`,
    `Loan sized on ${fmtUsd(r.fathomPrice)} and capped by depth. Request too large.`,
    "Depth too low · borrow rejected. Pool keeps its funds.",
  ];
  const reasons = [
    a.reasons.includes("InsufficientCollateral") &&
      `${fmtInt(a.collateral)} ${base} is worth ${fmtUsd(a.collateralValue, 0)} at the Fathom price, not ${fmtUsd(dexValue, 0)} at the DEX price. Max loan ${fmtUsd(a.maxLoan, 0)} vs ${fmtUsd(a.requested, 0)} asked.`,
    a.reasons.includes("DepthTooLow") &&
      `Depth cap ${fmtInt(a.cap)} ${base} (${liquidity.poolB.capSharePct}% of lowest depth ${fmtInt(a.minDepthWindow)}) vs ${fmtInt(a.collateralAfter)} requested.`,
  ].filter(Boolean) as string[];

  return (
    <Page minHeight={980}>
      <Header variant="pill" badgeSuffix=" · replay" />
      <main style={{ maxWidth: "1360px", margin: "0 auto", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <section style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "760px" }}>
            <span style={{ fontSize: "13px", color: "#7D7D7D", letterSpacing: "0.08em", textTransform: "uppercase" }}>February 2026 · YieldBlox pattern</span>
            <h1 style={{ margin: 0, fontSize: "34px", fontWeight: 600 }}>One trade pumped {base} {factor}×. Two pools, two oracles.</h1>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setS(Math.min(s + 1, 3))} style={{ background: "#FC72FF", color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "14px 20px", fontSize: "15px", fontWeight: 600, minHeight: "48px", fontFamily: "inherit", cursor: "pointer" }}>
              {s === 0 ? "Replay the February attack" : s < 3 ? "Next step" : "Replay finished"}
            </button>
            <button type="button" onClick={() => setS(0)} style={{ background: "#FFFFFF", color: "#535353", border: "1px solid #F0F0F0", borderRadius: "10px", padding: "14px 18px", fontSize: "15px", minHeight: "48px", fontFamily: "inherit", cursor: "pointer" }}>Reset</button>
          </div>
        </section>

        <ol aria-label="Replay steps" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {texts.map((t, i) => (
            <li key={i} style={stepStyle(i)}><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "12px", color: "#7D7D7D" }}>Step {i + 1}</span><span>{t}</span></li>
          ))}
        </ol>

        {s >= 1 && (
          <div style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "12px 16px", animation: "fadeUp .4s ease-out both" }}>
            <svg viewBox="0 0 1240 140" role="img" aria-label={`${base} DEX price jumps from ${fmtUsd(r.dexStart)} to ${fmtUsd(r.pumpPrice, 0)} on one trade`} style={{ width: "100%", height: "auto" }}>
              <line x1="40" y1="120" x2="1200" y2="120" stroke="#F0F0F0" />
              <path className="draw" style={{ "--len": 1400 } as CSSProperties} d="M40 116 L300 117 L520 115 L700 116 L720 14 L1200 14" fill="none" stroke="#E5484D" strokeWidth="3" />
              <circle className="pop" style={{ animationDelay: "1.2s" }} cx="720" cy="14" r="7" fill="#E5484D" />
              <circle className="ring" cx="720" cy="14" r="7" fill="none" stroke="#E5484D" strokeWidth="2" />
              <text x="40" y="104" fontSize="13" fill="#7D7D7D">DEX price · {fmtUsd(r.dexStart)}</text>
              <text className="fade" style={{ animationDelay: "1.3s" }} x="736" y="40" fontSize="15" fontWeight="600" fill="#D93A3A">{fmtUsd(r.pumpPrice, 0)} after one trade (under $1 of hourly volume)</text>
            </svg>
            {r.txs.pump && <a href={r.txs.pump} target="_blank" rel="noreferrer" style={txLink}>Pump transaction on stellar.expert</a>}
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
                <span style={{ display: "inline-block", transformOrigin: "left center", fontVariantNumeric: "tabular-nums", fontSize: "28px", color: s === 0 ? "#131313" : "#D93A3A", ...(s >= 1 ? { animation: "spike .6s ease-out" } : {}) }}>{s === 0 ? fmtUsd(r.dexStart) : pump}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#7D7D7D" }}>Pool funds (TVL)</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "28px" }}>{s === 3 ? "$0" : tvl}</span></div>
            </div>
            <div style={{ height: "10px", borderRadius: "5px", background: "#F0F0F0", overflow: "hidden" }}><div style={{ height: "100%", transition: "width 1.8s ease-in, background .4s", background: s === 3 ? "#E5484D" : "#40B66B", width: s === 3 ? "0%" : "100%" }} /></div>
            <p style={{ margin: 0, fontSize: "14px", color: "#535353", minHeight: "44px" }}>{aNotes[s]}</p>
            {s === 3 && r.txs.poolA && <a href={r.txs.poolA} target="_blank" rel="noreferrer" style={txLink}>Loan transaction on stellar.expert</a>}
          </section>

          <section aria-label="Pool B" style={box(s === 3 ? "#40B66B" : "#F0F0F0", s === 3 ? "shield 1.2s ease-out 3" : undefined)}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Pool B</h2>
              <span style={{ fontSize: "13px", color: "#7D7D7D" }}>reads Fathom</span>
              <span style={s === 3 ? { ...amber, animation: "popIn .5s ease-out" } : green}>{s === 3 ? "Borrow rejected" : "Normal"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#7D7D7D" }}>{base} price it sees</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "28px" }}>{fmtUsd(r.fathomPrice)}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#7D7D7D" }}>Pool funds (TVL)</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "28px" }}>{tvl}</span></div>
            </div>
            <div style={{ height: "10px", borderRadius: "5px", background: "#F0F0F0", overflow: "hidden" }}><div style={{ height: "100%", width: "100%", background: "#40B66B" }} /></div>
            <p style={{ margin: 0, fontSize: "14px", color: "#535353", minHeight: "44px" }}>{bNotes[s]}</p>
            {s === 3 && (
              <ul className="fade" style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#535353" }}>
                {reasons.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
            {s === 3 && r.txs.poolB && <a href={r.txs.poolB} target="_blank" rel="noreferrer" style={txLink}>Rejection recorded on stellar.expert</a>}
          </section>
        </div>

        <p style={{ margin: 0, fontSize: "13px", color: "#7D7D7D" }}>Replay of the attack pattern with testnet contracts. Real event: about $10.2M drained from a Blend pool, about $7M later frozen by validators.</p>
      </main>
    </Page>
  );
}
