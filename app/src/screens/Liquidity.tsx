// Price & depth: what Fathom publishes for lenders, answer first (price, depth, what a lender may
// still take), then how lenders use it, the history, and the developer calls.
// "Lowest depth, 4 weeks" reads the oracle's actual depth window (30 min in the demo).
import type { CSSProperties, ReactNode } from "react";
import { NAV_TITLE, SetByUs } from "../components/SetByUs";
import { Header, Page } from "../components/Header";
import { PageIntro } from "../components/PageIntro";
import { Slice } from "../components/State";
import type { LiquidityStatus, LiquidityView as LiquidityData } from "../data/types";
import { useFathom } from "../data/useFathom";
import { fmtInt, fmtPct, fmtUsd } from "../lib/format";

const pill = (c: string, bg: string, b: string): CSSProperties => ({ marginLeft: "auto", fontSize: "12px", color: c, border: `1px solid ${b}`, background: bg, borderRadius: "999px", padding: "4px 10px" });
const STATUS: Record<LiquidityStatus, { label: string; style: CSSProperties }> = {
  Ok: { label: "Healthy", style: pill("#40B66B", "#EEF9F1", "#BFE5CF") },
  LowLiquidity: { label: "Thin · no price published", style: pill("#B7791F", "#FFF6E0", "#F0D9A8") },
  NoPrice: { label: "No price yet", style: pill("#D93A3A", "#FDECEC", "#F5C2C2") },
};

const card: CSSProperties = { background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "20px" };
const h2: CSSProperties = { margin: 0, fontSize: "18px", fontWeight: 600 };
const muted: CSSProperties = { fontSize: "13px", color: "#7D7D7D" };

/** One answer: a question in plain words, the number, and what it means. */
function Answer({ icon, q, value, unit, means, note, delay }: { icon: ReactNode; q: string; value: string; unit?: string; means: ReactNode; note?: ReactNode; delay: number }) {
  return (
    <div className="fade" style={{ ...card, flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px", animationDelay: `${delay}s` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ width: "36px", height: "36px", borderRadius: "12px", background: "#FFEFFF", color: "#FC72FF", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
        <span style={{ fontSize: "14px", color: "#7D7D7D" }}>{q}</span>
      </div>
      <div style={{ fontSize: "34px", fontWeight: 535, fontVariantNumeric: "tabular-nums" }}>{value}{unit && <span style={{ fontSize: "16px", color: "#7D7D7D", marginLeft: "6px" }}>{unit}</span>}</div>
      <div style={{ fontSize: "13px", color: "#131313" }}>{means}</div>
      {note}
    </div>
  );
}

const ico = (d: ReactNode) => <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const I_PRICE = ico(<><path d="M2.5 12 L6 8 L8.5 10 L13.5 4" /><path d="M10.5 4 H13.5 V7" /></>);
const I_DEPTH = ico(<><path d="M2 5 q3 -2 6 0 t6 0" /><path d="M2 9 q3 -2 6 0 t6 0" /><path d="M2 13 q3 -2 6 0 t6 0" /></>);
const I_CAP = ico(<><path d="M8 2 L13 4 V8 C13 11 10.8 13.2 8 14 C5.2 13.2 3 11 3 8 V4 Z" /><path d="M5.5 8.5 H10.5" /></>);

export function Liquidity() {
  const { liquidity } = useFathom();
  return (
    <Page minHeight={1080}>
      <Header />
      <PageIntro width={1360} pad={32} title="Price & depth" what="What Fathom publishes for lenders: a robust USTRY price and how much can really be sold near NAV." why="Lenders cap how much USTRY they accept by this depth, so a thin market cannot be used to borrow too much." />
      <Slice of={liquidity} label="published liquidity" minHeight={400}>{(l) => <LiquidityView key={l.history.at(-1)?.auction ?? 0} l={l} />}</Slice>
    </Page>
  );
}

function LiquidityView({ l }: { l: LiquidityData }) {
  const priced = l.status === "Ok";
  const left = Math.max(0, l.poolB.cap - l.poolB.used);
  const status = priced && l.depth === 0 ? { label: "Price published · no depth", style: STATUS.LowLiquidity.style } : STATUS[l.status];

  // Depth meter: today's depth, the lowest over the window, and Pool B's cap (a share of that lowest).
  const meterMax = Math.max(l.depth, l.minDepthWindow, 1) * 1.08;
  const pct = (v: number) => `${Math.min(100, (v / meterMax) * 100).toFixed(2)}%`;

  const n = l.history.length;
  // Price in the upper band, depth bars in the lower band: they never overlap.
  const W = 1240, H = 260, L = 70, R = 1200, TOP = 24, PBOT = 96, BASE = 220;
  const hx = (i: number) => L + 40 + i * (n > 1 ? (R - L - 80) / (n - 1) : 0);
  const prices = n ? l.history.map((h) => h.price) : [l.price];
  const depths = n ? l.history.map((h) => h.depth) : [l.depth];
  const pMin = Math.min(...prices, l.nav) - 0.02, pMax = Math.max(...prices, l.nav) + 0.01;
  const py = (p: number) => TOP + ((pMax - p) / (pMax - pMin)) * (PBOT - TOP);
  const dMax = Math.max(...depths, 1);
  const bh = (d: number) => (d / dMax) * 84;

  return (
    <main style={{ maxWidth: "1360px", margin: "0 auto", padding: "24px 32px 48px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "20px", fontWeight: 600 }}>{l.asset}</span>
        <span style={muted}>{l.assetName}</span>
        <span style={{ ...status.style, marginLeft: "8px" }}>{status.label}</span>
        <span style={{ ...muted, marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}><span className="live" aria-hidden="true" />Published on-chain after every auction · SEP-40</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        <Answer delay={0} icon={I_PRICE} q="What is USTRY worth?" value={priced ? fmtUsd(l.price) : "Not published"}
          means={priced ? <>Median of the last {l.medianWindow} auctions · {fmtPct(l.haircutPct)} under NAV {fmtUsd(l.nav)} <SetByUs title={NAV_TITLE} /></> : "Too few orders in recent auctions to publish a price."} />
        <Answer delay={0.1} icon={I_DEPTH} q="How much can be sold near NAV?" value={fmtInt(l.depth)} unit={l.asset}
          means={<>{fmtInt(l.standingOrders)} standing buy orders, locked {l.standingDays} days, priced within {l.depthFloorPct}% of NAV.</>} />
        <Answer delay={0.2} icon={I_CAP} q={`How much more can Pool B take?`} value={fmtInt(left)} unit={l.asset}
          means={l.poolB.cap === 0 ? `No depth yet, so Pool B accepts no new ${l.asset}.` : <>Cap {fmtInt(l.poolB.cap)} = {l.poolB.capSharePct}% of the lowest depth (last {l.depthWindowLabel}) · {fmtInt(l.poolB.used)} used.</>} />
      </div>

      <section aria-label="Depth meter" style={{ ...card, display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "12px" }}>
          <h2 style={h2}>From depth to a lending cap</h2>
          <span style={muted}>Pool B uses the lowest depth of the last {l.depthWindowLabel}, so a burst of orders cannot inflate it.</span>
        </div>
        <div style={{ position: "relative", height: "64px", margin: "8px 0 28px" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: "20px", height: "24px", borderRadius: "12px", background: "#F0F0F0" }} />
          <div style={{ position: "absolute", left: 0, top: "20px", height: "24px", width: pct(l.depth), borderRadius: "12px", background: "linear-gradient(90deg, #FFD6FF, #FC72FF)", animation: "growX 1.4s ease-out both" }} />
          <div style={{ position: "absolute", left: 0, top: "20px", height: "24px", width: pct(l.poolB.cap), borderRadius: "12px", background: "#40B66B", opacity: .85, animation: "growX 1.4s ease-out .5s both" }} />
          {[
            { v: l.depth, label: `Depth now ${fmtInt(l.depth)}`, c: "#FC72FF", top: true },
            { v: l.minDepthWindow, label: `Lowest, last ${l.depthWindowLabel}: ${fmtInt(l.minDepthWindow)}`, c: "#131313", top: false },
            { v: l.poolB.cap, label: `Pool B cap ${fmtInt(l.poolB.cap)}`, c: "#40B66B", top: true },
          ].map((m) => (
            // Positioned on the outside, faded on the inside (the fade animation resets transform).
            <div key={m.label} style={{ position: "absolute", left: pct(m.v), top: m.top ? 0 : "44px", transform: "translateX(-50%)" }}>
              <div className="fade" style={{ display: "flex", flexDirection: "column", alignItems: "center", animationDelay: ".8s" }}>
                {!m.top && <span style={{ width: "2px", height: "8px", background: m.c }} />}
                <span style={{ fontSize: "12px", color: m.c, whiteSpace: "nowrap", fontWeight: 535 }}>{m.label}</span>
                {m.top && <span style={{ width: "2px", height: "6px", background: m.c }} />}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="How lenders use it" style={{ ...card, display: "flex", flexDirection: "column", gap: "12px" }}>
        <h2 style={h2}>How lenders use it</h2>
        <svg viewBox="0 0 1240 150" role="img" aria-label="Auctions feed the Fathom oracle, which lenders read for price and depth" style={{ width: "100%", height: "auto" }}>
          {[
            { x: 130, t: "Sealed auctions", s: "every few minutes" },
            { x: 620, t: "Fathom oracle", s: priced ? `${fmtUsd(l.price)} · depth ${fmtInt(l.depth)}` : `depth ${fmtInt(l.depth)}` },
          ].map((b) => (
            <g key={b.t} transform={`translate(${b.x} 75)`}>
              <rect x="-110" y="-38" width="220" height="76" rx="18" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
              <text y="-4" textAnchor="middle" fontSize="18" fontWeight="600" fill="#131313">{b.t}</text>
              <text y="20" textAnchor="middle" fontSize="13" fill="#7D7D7D">{b.s}</text>
            </g>
          ))}
          {[
            { y: 25, t: "Pool B", s: `caps ${l.asset} at ${fmtInt(l.poolB.cap)}`, live: true },
            { y: 75, t: "A Blend pool", s: "lastprice() · example", live: false },
            { y: 125, t: "A DEX router", s: "flags off-price trades · example", live: false },
          ].map((b) => (
            <g key={b.t} transform={`translate(1090 ${b.y})`}>
              <rect x="-120" y="-22" width="240" height="44" rx="12" fill={b.live ? "#EEF9F1" : "#FFFFFF"} stroke={b.live ? "#40B66B" : "#E5E5E5"} />
              <text x="-106" y="-3" fontSize="14" fontWeight="600" fill="#131313">{b.t}</text>
              <text x="-106" y="14" fontSize="11" fill="#7D7D7D">{b.s}</text>
            </g>
          ))}
          <path d="M240 75 H510" stroke="#FFD6FF" strokeWidth="4" />
          <path d="M240 75 H510" stroke="#FC72FF" strokeWidth="4" strokeDasharray="10 14" style={{ animation: "flowDash 1.2s linear infinite" }} />
          {[25, 75, 125].map((y) => (
            <g key={y}>
              <path d={`M730 75 C 830 75, 850 ${y}, 970 ${y}`} fill="none" stroke="#FFD6FF" strokeWidth="3" />
              <path d={`M730 75 C 830 75, 850 ${y}, 970 ${y}`} fill="none" stroke="#FC72FF" strokeWidth="3" strokeDasharray="8 12" style={{ animation: "flowDash 1.2s linear infinite" }} />
            </g>
          ))}
          <text x="375" y="62" textAnchor="middle" fontSize="12" fill="#7D7D7D">clearing price + depth</text>
        </svg>
      </section>

      <section aria-label="History" style={{ ...card, display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
          <h2 style={h2}>{n === 1 ? "Last auction" : `Last ${n} auctions`}</h2>
          <span style={{ ...muted, display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <span><span style={{ display: "inline-block", width: "14px", height: "3px", background: "#FC72FF", verticalAlign: "middle", marginRight: "6px" }} />clearing price</span>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#FFD6FF", verticalAlign: "middle", marginRight: "6px" }} />depth</span>
            <span><span style={{ display: "inline-block", width: "14px", borderTop: "2px dashed #7D7D7D", verticalAlign: "middle", marginRight: "6px" }} />NAV {fmtUsd(l.nav)} <SetByUs title={NAV_TITLE} /></span>
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${n} auctions: clearing price between ${fmtUsd(Math.min(...prices))} and ${fmtUsd(Math.max(...prices))}, NAV ${fmtUsd(l.nav)}; depth between ${fmtInt(Math.min(...depths))} and ${fmtInt(Math.max(...depths))}`} style={{ width: "100%", height: "auto" }}>
          <line x1={L} y1={py(l.nav)} x2={R} y2={py(l.nav)} stroke="#7D7D7D" strokeDasharray="6 6" />
          <g fontSize="12" fill="#7D7D7D" textAnchor="end">
            {[pMax, (pMax + pMin) / 2, pMin].map((v) => <text key={v} x={L - 10} y={py(v) + 4}>{fmtUsd(v)}</text>)}
          </g>
          <g className="bars" fill="#FFD6FF">
            {l.history.map((h, i) => <rect key={h.auction} x={hx(i) - 26} y={BASE - bh(h.depth)} width="52" height={bh(h.depth)} rx="6"><title>{`#${h.auction}: depth ${fmtInt(h.depth)}`}</title></rect>)}
          </g>
          <g fontSize="11" fill="#B5B5B5" textAnchor="middle">
            {l.history.map((h, i) => <text key={h.auction} x={hx(i)} y={BASE - bh(h.depth) - 6}>{fmtInt(h.depth)}</text>)}
          </g>
          <polyline className="draw" style={{ "--len": 1300, animationDelay: ".6s" } as CSSProperties} points={l.history.map((h, i) => `${hx(i)},${py(h.price)}`).join(" ")} fill="none" stroke="#FC72FF" strokeWidth="3" />
          <g fill="#FC72FF">
            {l.history.map((h, i) => <circle key={h.auction} cx={hx(i)} cy={py(h.price)} r={i === n - 1 ? 6 : 4}><title>{`#${h.auction}: ${fmtUsd(h.price)}`}</title></circle>)}
          </g>
          <g fontSize="12" fill="#7D7D7D" textAnchor="middle">
            {l.history.map((h, i) => <text key={h.auction} x={hx(i)} y={BASE + 22}>#{h.auction}</text>)}
          </g>
          <text x={(L + R) / 2} y={H - 4} textAnchor="middle" fontSize="12" fill="#B5B5B5">auction</text>
        </svg>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        <section aria-label="For developers" style={{ ...card, flex: "1 1 420px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <h2 style={h2}>For developers</h2>
          <span style={muted}>Standard SEP-40 reads on the Fathom oracle, plus depth:</span>
          <code style={{ fontSize: "13px", color: "#FC72FF", background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "10px", padding: "12px 14px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {`lastprice(${l.asset}) → ${priced ? fmtUsd(l.price) : "None"}\ndepth(${l.asset})     → ${fmtInt(l.depth)}\nliquidity(${l.asset}) → price, depth, lowest depth (${l.depthWindowLabel})`}
          </code>
        </section>
        <section aria-label="Other assets" style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <h2 style={h2}>Other assets</h2>
            <span style={{ fontSize: "12px", color: "#B7791F" }}>Simulated testnet data</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            {l.simulatedAssets.map((a) => (
              <div key={a.name} style={{ ...card, flex: "1 1 200px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", background: a.color }} /><span style={{ fontWeight: 600 }}>{a.name}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontVariantNumeric: "tabular-nums", fontSize: "14px" }}><span>{a.price}</span><span>depth {a.depth}</span></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
