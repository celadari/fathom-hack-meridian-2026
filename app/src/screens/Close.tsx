// Port of designs/Close.html (the close). Curves are computed from the revealed orders
// so the same component draws any auction, not just the worked example.
import { Link } from "react-router";
import { Header, Page } from "../components/Header";
import { NAV_TITLE, SetByUs } from "../components/SetByUs";
import { Slice } from "../components/State";
import type { CloseView as CloseViewData, FillRow } from "../data/types";
import { useFathom } from "../data/useFathom";
import { fmtInt, fmtUsd, fmtUtc } from "../lib/format";

const X0 = 80;
const X1 = 530;
const Y_ZERO = 280;
const Y_TOP = 40;

/** Demand/supply step curves on the price levels around the book, in the design's coordinates. */
function curves(fills: FillRow[], price: number, matched: number, TICK: number) {
  const limits = fills.map((f) => f.limit);
  const lo = Math.round(Math.min(...limits) / TICK);
  const hi = Math.round(Math.max(...limits) / TICK) + 1;
  const levels = Array.from({ length: hi - lo + 1 }, (_, i) => (lo + i) * TICK);
  const demand = levels.map((p) => fills.filter((f) => f.side === "buy" && f.limit >= p - 1e-9).reduce((s, f) => s + f.qty, 0));
  const supply = levels.map((p) => fills.filter((f) => f.side === "sell" && f.limit <= p + 1e-9).reduce((s, f) => s + f.qty, 0));
  const top = Math.max(...demand, ...supply);
  const yMax = Math.ceil(top / 20_000) * 20_000 || 20_000;
  const x = (i: number) => X0 + (i * (X1 - X0)) / Math.max(1, levels.length - 1);
  const y = (q: number) => Y_ZERO - (q / yMax) * (Y_ZERO - Y_TOP);
  const step = (vals: number[]) => {
    let d = `M${x(0)} ${y(vals[0])}`;
    let atX = x(0);
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] !== vals[i - 1]) {
        d += ` H${x(i)} V${y(vals[i])}`;
        atX = x(i);
      }
    }
    if (atX !== x(vals.length - 1)) d += ` H${x(vals.length - 1)}`;
    return d;
  };
  const ci = levels.findIndex((p) => Math.abs(p - price) < 1e-9);
  return { levels, x, y, yMax, demand: step(demand), supply: step(supply), cross: { x: x(Math.max(ci, 0)), y: y(matched) } };
}

function outcome(f: FillRow, price: number, base: string) {
  const p = fmtUsd(price);
  if (f.side === "buy") {
    if (f.filled === f.qty) return "Bought in full";
    if (f.standing && f.filled === 0) return "Stays in the book as a standing order (counts as depth)";
    if (f.filled === 0) return f.limit < price ? `Refunded (limit below ${p})` : "Refunded";
    return f.standing ? `Bought ${fmtInt(f.filled)}; ${fmtInt(f.qty - f.filled)} stays as a standing order` : `Bought ${fmtInt(f.filled)}, rest refunded`;
  }
  if (f.filled === f.qty) return "Sold in full";
  if (f.filled === 0) return f.limit > price ? `Returned (limit above ${p})` : "Returned";
  return `${fmtInt(f.qty - f.filled)} ${base} returned`;
}

export function Close() {
  const { close } = useFathom();
  return (
    <Page minHeight={980}>
      <Header />
      <Slice of={close} label="the last close" minHeight={400}>{(c) => <CloseView key={c.auction} c={c} />}</Slice>
    </Page>
  );
}

function CloseView({ c }: { c: CloseViewData }) {
  const { names } = useFathom();
  const base = "USTRY";
  const quote = "USDC";
  if (!c.fills.length) {
    return (
      <main style={{ maxWidth: "1360px", margin: "0 auto", padding: "32px" }}>
        <div style={{ background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "24px", color: "#7D7D7D" }}>
          Auction #{c.auction} closed at {fmtUtc(c.closedAt)} with no revealed orders, so there was nothing to clear.
        </div>
      </main>
    );
  }
  const k = curves(c.fills, c.cleared ? c.price : c.fills[0].limit, c.matched, c.tick);
  const price = c.cleared ? fmtUsd(c.price) : "no price";

  return (
      <main style={{ maxWidth: "1360px", margin: "0 auto", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <section style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#7D7D7D", letterSpacing: "0.08em", textTransform: "uppercase" }}>Auction #{c.auction} · {base} / {quote} · closed {fmtUtc(c.closedAt)}</span>
            <h1 style={{ margin: 0, fontSize: "34px", fontWeight: 600 }}>{c.cleared ? <>Orders revealed. Everyone trades at <span style={{ color: "#FC72FF" }}>{price}</span></> : "Orders revealed. Buyers and sellers did not cross"}</h1>
          </div>
          <Link to="/liquidity" style={{ background: "#FC72FF", color: "#FFFFFF", textDecoration: "none", borderRadius: "10px", padding: "14px 18px", fontWeight: 600, minHeight: "48px", boxSizing: "border-box", display: "inline-flex", alignItems: "center" }}>See published liquidity</Link>
        </section>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "stretch" }}>
          <section aria-label="Supply and demand" style={{ flex: "999 1 620px", minWidth: 0, background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Demand meets supply at one price</h2>
            <p style={{ margin: 0, fontSize: "14px", color: "#7D7D7D" }}>The clearing price is where the most {base} can change hands.</p>
            <svg viewBox="0 0 640 340" role="img" aria-label={`Demand and supply cross at ${price} with ${fmtInt(c.matched)} ${base} matched`} style={{ width: "100%", height: "auto" }}>
              <g stroke="#F0F0F0" strokeWidth="1">
                <line x1="60" y1="280" x2="600" y2="280" />
                <line x1="60" y1="40" x2="60" y2="280" />
                <line x1="60" y1="160" x2="600" y2="160" strokeDasharray="2 6" />
                <line x1="60" y1="40" x2="600" y2="40" strokeDasharray="2 6" />
              </g>
              <g fontFamily="Inter, sans-serif" fontSize="12" fill="#7D7D7D">
                {k.levels.map((p, i) => <text key={p} x={k.x(i)} y="302" textAnchor="middle">{fmtUsd(p)}</text>)}
                <text x="50" y="284" textAnchor="end">0</text>
                <text x="50" y="164" textAnchor="end">{k.yMax / 2000}k</text>
                <text x="50" y="44" textAnchor="end">{k.yMax / 1000}k</text>
              </g>
              <path className="draw" style={{ "--len": 700 } as React.CSSProperties} d={k.demand} fill="none" stroke="#FC72FF" strokeWidth="3" />
              <path className="draw" style={{ "--len": 560, animationDelay: ".5s" } as React.CSSProperties} d={k.supply} fill="none" stroke="#B7791F" strokeWidth="3" />
              {c.cleared && <>
              <line className="fade" style={{ animationDelay: "2s" }} x1={k.cross.x} y1="40" x2={k.cross.x} y2="280" stroke="#FC72FF" strokeWidth="1" strokeDasharray="4 4" />
              <circle className="ring" cx={k.cross.x} cy={k.cross.y} r="7" fill="none" stroke="#FC72FF" strokeWidth="2" />
              <circle className="pop" style={{ animationDelay: "2s" }} cx={k.cross.x} cy={k.cross.y} r="7" fill="#FC72FF" />
              <text className="fade" style={{ animationDelay: "2.2s" }} x={k.cross.x + 14} y={k.cross.y + 26} fontFamily="Inter, sans-serif" fontSize="14" fill="#FC72FF" fontWeight="600">{price} · {fmtInt(c.matched)} matched</text>
              </>}
              <g fontFamily="Inter, sans-serif" fontSize="13">
                <rect x="430" y="12" width="12" height="4" fill="#FC72FF" /><text x="448" y="18" fill="#535353">Buyers want</text>
                <rect x="530" y="12" width="12" height="4" fill="#B7791F" /><text x="548" y="18" fill="#535353">Sellers offer</text>
              </g>
            </svg>
          </section>

          <section className="fade" aria-label="Auction result" style={{ animationDelay: "2.3s", flex: "1 1 320px", background: "#FFEFFF", border: "1px solid #FC72FF", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Result</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#FC72FF" }}>Clearing price</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "26px" }}>{price}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#FC72FF" }}>Matched</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "26px" }}>{fmtInt(c.matched)}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#FC72FF" }}>Orders</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "26px" }}>{c.orderCount}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "12px", color: "#FC72FF" }}>Haircut vs NAV {fmtUsd(c.nav)}</span><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "26px" }}>~{Math.round(c.haircutPct)}%</span></div>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "#535353" }}>Today's raw result. Fathom publishes the median of the last {c.medianWindow} auctions.</p>
            <span style={{ fontSize: "12px", color: "#535353" }}>NAV {fmtUsd(c.nav)} <SetByUs title={NAV_TITLE} /></span>
          </section>
        </div>

        <section aria-label="Revealed orders and fills" style={{ background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Revealed orders and fills</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "640px" }}>
              <thead>
                <tr style={{ color: "#7D7D7D", textAlign: "left" }}>
                  {["Participant", "Order", "Limit", `Filled at ${price}`, "Outcome"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", fontWeight: 500, borderBottom: "1px solid #F0F0F0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.fills.map((f, i) => (
                  <tr key={f.who + i} style={{ animation: "fadeUp .5s ease-out both", animationDelay: `${2.6 + i * 0.25}s` }}>
                    <td style={{ padding: "12px", borderBottom: "1px solid #F5F5F5" }}>{(f.owner && names[f.owner]) ?? f.who}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #F5F5F5" }}>{f.side === "buy" ? "Buy" : "Sell"} {fmtInt(f.qty)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #F5F5F5", fontVariantNumeric: "tabular-nums" }}>{f.side === "buy" ? "≤" : "≥"} {fmtUsd(f.limit)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #F5F5F5", fontVariantNumeric: "tabular-nums" }}>{fmtInt(f.filled)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #F5F5F5", color: "#535353" }}>{outcome(f, c.price, base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
  );
}
