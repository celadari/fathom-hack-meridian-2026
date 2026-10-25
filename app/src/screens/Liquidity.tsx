// Port of designs/Dashboard.html (published liquidity).
// "Lowest depth, 4 weeks" reads the oracle's actual depth window (30 min in the demo).
import type { CSSProperties } from "react";
import { Header, Page } from "../components/Header";
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
const GAUGE = 591; // circumference of r=94

const stat = (label: string, value: string) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
    <span style={{ fontSize: "12px", color: "#7D7D7D" }}>{label}</span>
    <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "24px" }}>{value}</span>
  </div>
);

export function Liquidity() {
  const { liquidity } = useFathom();
  return (
    <Page minHeight={1080}>
      <Header />
      <Slice of={liquidity} label="published liquidity" minHeight={400}>{(l) => <LiquidityView key={l.history.at(-1)?.auction ?? 0} l={l} />}</Slice>
    </Page>
  );
}

function LiquidityView({ l }: { l: LiquidityData }) {
  const maxDepth = Math.max(...l.history.map((h) => h.depth), l.depth, 1);
  const gaugeLen = Math.min(1, l.depth / (maxDepth * 1.11)) * GAUGE;
  const capFull = l.poolB.used >= l.poolB.cap;
  const capPct = l.poolB.cap > 0 ? Math.min(100, (l.poolB.used / l.poolB.cap) * 100) : 100;

  const n = l.history.length;
  const hx = (i: number) => 120 + i * (n > 1 ? 1020 / (n - 1) : 0);
  const py = (p: number) => 40 + (l.nav - p) * 1600;
  const bh = (d: number) => (d / maxDepth) * 106;
  const prices = l.history.length ? l.history.map((h) => h.price) : [l.price];
  const depths = l.history.length ? l.history.map((h) => h.depth) : [l.depth];

  return (
      <main style={{ maxWidth: "1360px", margin: "0 auto", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <section style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "13px", color: "#7D7D7D", letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "8px" }}><span className="live" aria-hidden="true" />Published on-chain · SEP-40 feed · live</span>
          <h1 style={{ margin: 0, fontSize: "34px", fontWeight: 600 }}>How much can really be sold, and at what price</h1>
        </section>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "stretch" }}>
          <section aria-label={`${l.asset} liquidity`} style={{ flex: "999 1 620px", minWidth: 0, background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "24px", display: "flex", flexWrap: "wrap", gap: "32px", alignItems: "center" }}>
            <svg viewBox="0 0 240 240" role="img" aria-label={`Depth gauge: ${fmtInt(l.depth)} ${l.asset} of buy orders within ${l.depthFloorPct}% of NAV`} style={{ width: "240px", maxWidth: "100%", height: "auto", flex: "0 0 auto" }}>
              <circle cx="120" cy="120" r="108" fill="none" stroke="#F5F5F5" strokeWidth="1" />
              <circle cx="120" cy="120" r="78" fill="none" stroke="#F5F5F5" strokeWidth="1" />
              <circle cx="120" cy="120" r="48" fill="none" stroke="#F5F5F5" strokeWidth="1" />
              <circle cx="120" cy="120" r="94" fill="none" stroke="#F0F0F0" strokeWidth="14" />
              <circle cx="120" cy="120" r="94" fill="none" stroke="#FC72FF" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${gaugeLen.toFixed(0)} ${GAUGE}`} transform="rotate(-90 120 120)" style={{ animation: "gauge 1.8s ease-out both" }} />
              <circle className="ring" cx="120" cy="120" r="48" fill="none" stroke="#FC72FF" strokeWidth="1.5" />
              <text x="120" y="114" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="30" fill="#FC72FF">{fmtInt(l.depth)}</text>
              <text x="120" y="140" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="13" fill="#7D7D7D">{l.asset} depth</text>
            </svg>
            <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "22px", fontWeight: 600 }}>{l.asset}</span>
                <span style={{ fontSize: "13px", color: "#7D7D7D" }}>{l.assetName}</span>
                <span style={l.status === "Ok" && l.depth === 0 ? STATUS.LowLiquidity.style : STATUS[l.status].style}>{l.status === "Ok" && l.depth === 0 ? "Price published · no depth" : STATUS[l.status].label}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                {stat(`Price (${l.medianWindow}-auction median)`, l.status === "Ok" ? fmtUsd(l.price) : "Not published")}
                {stat(`Haircut vs NAV ${fmtUsd(l.nav)}`, fmtPct(l.haircutPct))}
                {stat("Standing buy orders", fmtInt(l.standingOrders))}
                {stat(`Lowest depth, ${l.depthWindowLabel}`, fmtInt(l.minDepthWindow))}
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#7D7D7D" }}>Depth counts locked 7-day buy orders priced at most {l.depthFloorPct}% below NAV. Selling to yourself uses them up, so it can only lower this number.</p>
            </div>
          </section>

          <section aria-label="Who reads Fathom" style={{ flex: "1 1 340px", background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Who reads Fathom</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}><span>Pool B · {l.asset} borrow cap</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtInt(l.poolB.used)} / {fmtInt(l.poolB.cap)}</span></div>
              <div style={{ height: "8px", borderRadius: "4px", background: "#F0F0F0", overflow: "hidden" }}><div style={{ height: "100%", width: `${capPct}%`, background: capFull ? "#B7791F" : "#40B66B", animation: "growX 1.4s ease-out .4s both" }} /></div>
              <span style={{ fontSize: "12px", color: "#7D7D7D" }}>
                Cap = {l.poolB.capSharePct}% of lowest depth. {l.poolB.cap === 0 ? `No depth yet: Pool B lends nothing new against ${l.asset}.` : capFull ? `Full: new ${l.asset} loans wait for more depth.` : `${fmtInt(l.poolB.cap - l.poolB.used)} ${l.asset} of room left.`}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid #F0F0F0", paddingTop: "16px" }}>
              <span style={{ fontSize: "14px" }}>New Blend pool</span>
              <code style={{ fontVariantNumeric: "tabular-nums", fontSize: "13px", color: "#FC72FF", background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "8px", padding: "10px 12px" }}>lastprice({l.asset}) → {l.status === "Ok" ? fmtUsd(l.price) : "None"}</code>
              <span style={{ fontSize: "12px", color: "#7D7D7D" }}>Standard SEP-40 call. No code change in the pool.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid #F0F0F0", paddingTop: "16px" }}>
              <span style={{ fontSize: "14px" }}>DEX router</span>
              <span style={{ fontSize: "12px", color: "#7D7D7D" }}>Flags trades priced far from the Fathom median.</span>
            </div>
          </section>
        </div>

        <section aria-label="Seven-day history" style={{ background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>{n === 1 ? "Last auction" : `Last ${n} auctions`}</h2>
            <span style={{ fontSize: "13px", color: "#7D7D7D" }}>Clearing price stays under NAV; depth bars from standing orders</span>
          </div>
          <svg viewBox="0 0 1240 220" role="img" aria-label={`${n} auctions: clearing price between ${fmtUsd(Math.min(...prices))} and ${fmtUsd(Math.max(...prices))} under a NAV line at ${fmtUsd(l.nav)}; depth between ${fmtInt(Math.min(...depths))} and ${fmtInt(Math.max(...depths))} ${l.asset}`} style={{ width: "100%", height: "auto" }}>
            <line x1="40" y1="40" x2="1220" y2="40" stroke="#7D7D7D" strokeDasharray="6 6" />
            <text x="1220" y="30" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="12" fill="#7D7D7D">NAV {fmtUsd(l.nav)}</text>
            <g className="bars" fill="#FFD6FF">
              {l.history.map((h, i) => <rect key={h.auction} x={hx(i) - 30} y={210 - bh(h.depth)} width="60" height={bh(h.depth)} />)}
            </g>
            <polyline className="draw" style={{ "--len": 1100, animationDelay: ".7s" } as CSSProperties} points={l.history.map((h, i) => `${hx(i)},${py(h.price)}`).join(" ")} fill="none" stroke="#FC72FF" strokeWidth="3" />
            <g fill="#FC72FF">
              {l.history.map((h, i) => <circle key={h.auction} cx={hx(i)} cy={py(h.price)} r={i === n - 1 ? 5 : 4} />)}
            </g>
            <g fontFamily="Inter, sans-serif" fontSize="12" fill="#7D7D7D" textAnchor="middle">
              {l.history.map((h, i) => <text key={h.auction} x={hx(i)} y="216">#{h.auction}</text>)}
            </g>
          </svg>
        </section>

        <section aria-label="Other assets" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "12px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Other assets</h2>
            <span style={{ fontSize: "12px", color: "#B7791F" }}>Simulated testnet data</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            {l.simulatedAssets.map((a) => (
              <div key={a.name} style={{ flex: "1 1 260px", background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", background: a.color }} /><span style={{ fontWeight: 600 }}>{a.name}</span><span style={{ marginLeft: "auto", fontSize: "12px", color: "#7D7D7D" }}>{a.status}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontVariantNumeric: "tabular-nums", fontSize: "14px" }}><span>{a.price}</span><span>depth {a.depth}</span></div>
              </div>
            ))}
          </div>
        </section>
      </main>
  );
}
