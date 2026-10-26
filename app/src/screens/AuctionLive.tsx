// Auction: the live view of the auction taking orders (sealed envelopes, depth, last clearing).
// Ordering is on the Trade page; this page only watches.
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { Header, Page } from "../components/Header";
import { PageIntro } from "../components/PageIntro";
import { Slice } from "../components/State";
import type { AuctionView } from "../data/types";
import { useFathom } from "../data/useFathom";
import { fmtCountdown, fmtK, fmtPct, fmtTime, fmtUsd } from "../lib/format";
import { ledgerNow } from "../stellar/events";
import { useWallet } from "../stellar/wallet";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(ledgerNow());
  useEffect(() => {
    const id = setInterval(() => setNow(ledgerNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const cta: CSSProperties = { background: "#FC72FF", color: "#FFFFFF", borderRadius: "16px", padding: "12px 18px", fontSize: "16px", fontWeight: 535, textDecoration: "none", whiteSpace: "nowrap" };

export function AuctionLive() {
  const { auction } = useFathom();
  return (
    <Page minHeight={980}>
      <Header />
      <Slice of={auction} label="the auction" minHeight={400}>{(a) => <Live a={a} />}</Slice>
    </Page>
  );
}

function Live({ a }: { a: AuctionView }) {
  const { freshOrders } = useFathom();
  const wallet = useWallet();
  const now = useNow();
  const closing = a.closesAt - now;
  const rows = a.sealed.map((o, i) => ({
    key: o.id,
    mine: o.owner === wallet.address,
    time: fmtTime(o.placedAt),
    style: freshOrders.has(o.id) ? { animation: "rowIn 1.6s ease-out both" } : { animation: "fadeUp .4s ease-out both", animationDelay: `${i * 0.08}s` },
  }));
  // Depth ruler: 30K at the bottom tick unless depth is larger.
  const rulerMax = Math.max(30_000, Math.ceil((a.depth * 1.1) / 3_000) * 3_000);
  const depthY = Math.min(250, 50 + (a.depth / rulerMax) * 180);
  const ticks = [1, 2, 3].map((k) => ({ y: 50 + (k / 3) * 180, label: fmtK((rulerMax * k) / 3) }));
  return (
    <>
      <PageIntro
        title="Live auction"
        what={<>Auction #{a.id} is collecting sealed orders · {closing > 0 ? `closes in ${fmtCountdown(closing)}` : "closing now"}.</>}
        why="When it closes, every order fills at one price, and Fathom publishes that price and the market's depth for lenders."
      >
        <Link to="/" style={cta}>Place an order</Link>
      </PageIntro>
      <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "24px 24px 48px", display: "flex", justifyContent: "center" }}>
      <section aria-label="Live auction" style={{ width: "100%", maxWidth: "860px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ position: "relative", borderRadius: "24px", overflow: "hidden", background: "linear-gradient(180deg, #FFF7FF 0%, #FFE3FF 45%, #F7C4FA 100%)", border: "1px solid #F0F0F0" }}>
          <svg viewBox="0 0 640 260" role="img" aria-label={`Sonar measuring the market: sealed orders sit at different depths below the price line; depth today ${fmtK(a.depth)} ${a.base}`} style={{ display: "block", width: "100%", height: "auto" }}>
            <defs><linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FC72FF" stopOpacity=".35" /><stop offset="1" stopColor="#FC72FF" stopOpacity="0" /></linearGradient></defs>
            <path d="M0 58 Q 40 50 80 58 T 160 58 T 240 58 T 320 58 T 400 58 T 480 58 T 560 58 T 640 58 V0 H0 Z" fill="#FFFFFF" opacity=".85" style={{ animation: "wave 6s ease-in-out infinite alternate" }} />
            <g transform="translate(320 40)">
              <path d="M-14 0 h28 l-6 14 h-16 z" fill="#131313" />
              <rect x="-3" y="-14" width="6" height="14" rx="2" fill="#131313" />
            </g>
            <path d="M320 56 L200 260 L440 260 Z" fill="url(#beam)" style={{ transformOrigin: "320px 56px", animation: "sweep 5s ease-in-out infinite alternate" }} />
            <g fill="none" stroke="#FC72FF" strokeWidth="2">
              <circle className="sonar" cx="320" cy="56" r="20" />
              <circle className="sonar" style={{ animationDelay: "1s" }} cx="320" cy="56" r="20" />
              <circle className="sonar" style={{ animationDelay: "2s" }} cx="320" cy="56" r="20" />
            </g>
            {/* One envelope per sealed order in this auction (up to 5). Positions are decorative: price and quantity are hidden. */}
            {[[150, 118, 0], [250, 160, 0.7], [372, 132, 1.4], [470, 190, 2.1], [90, 200, 1]].slice(0, Math.min(5, a.sealedCount)).map(([x, y, d]) => (
              <g key={`${x}`} className="bob" style={{ animationDelay: `${d}s` }}><g transform={`translate(${x} ${y})`}><rect width="34" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="1.5" /><path d="M0 0 L17 12 L34 0" fill="none" stroke="#FC72FF" strokeWidth="1.5" /></g></g>
            ))}
            <g fontSize="11" fill="#7D7D7D">
              <line x1="600" y1="70" x2="600" y2="250" stroke="#131313" strokeOpacity=".25" />
              <text x="612" y="259" textAnchor="end" fontSize="10">USTRY depth</text>
              {ticks.map((t) => (
                <g key={t.y}><line x1="594" y1={t.y} x2="606" y2={t.y} stroke="#131313" strokeOpacity=".25" /><text x="590" y={t.y + 4} textAnchor="end">{t.label}</text></g>
              ))}
            </g>
            <g key={a.depth} style={{ animation: "fadeUp .8s ease-out .6s both" }}>
              <line x1="560" y1={depthY} x2="612" y2={depthY} stroke="#FC72FF" strokeWidth="3" />
              <circle className="pop" style={{ animationDelay: "1s" }} cx="600" cy={depthY} r="5" fill="#FC72FF" />
              <text x="556" y={depthY + 4} textAnchor="end" fontSize="13" fontWeight="600" fill="#131313">{fmtK(a.depth)} deep</text>
            </g>
            <text x="24" y="34" fontSize="13" fill="#131313" fontWeight="535">Surface price {a.publishedPrice ? fmtUsd(a.publishedPrice) : "not published"}</text>
            <text x="24" y="250" fontSize="12" fill="#7D7D7D">
              {a.sealedCount === 0 ? `No sealed orders in auction #${a.id} yet` : `${a.sealedCount} sealed, funded order${a.sealedCount > 1 ? "s" : ""} in auction #${a.id}${a.sealedCount > 5 ? " (5 shown)" : ""} · positions are decorative`}
            </text>
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ color: "#7D7D7D", fontSize: "14px" }}>Auction #{a.id} · {a.base} / {a.quote}</span>
          <span style={{ fontSize: "36px", fontWeight: 485 }}>{a.lastClearing ? fmtUsd(a.lastClearing) : "—"} <span style={{ fontSize: "16px", color: "#7D7D7D" }}>last clearing</span></span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
          <div style={{ background: "#F9F9F9", borderRadius: "16px", padding: "14px" }}><div style={{ color: "#7D7D7D", fontSize: "13px" }}>Haircut vs NAV</div><div style={{ fontSize: "20px", fontWeight: 535 }}>{a.haircutPct === null ? "—" : fmtPct(a.haircutPct)}</div></div>
          <div style={{ background: "#F9F9F9", borderRadius: "16px", padding: "14px" }}><div style={{ color: "#7D7D7D", fontSize: "13px" }}>Depth</div><div style={{ fontSize: "20px", fontWeight: 535 }}>{fmtK(a.depth)}</div></div>
          <div style={{ background: "#F9F9F9", borderRadius: "16px", padding: "14px" }}><div style={{ color: "#7D7D7D", fontSize: "13px" }}>Sealed orders</div><div style={{ fontSize: "20px", fontWeight: 535 }}>{a.sealedCount}</div></div>
        </div>
        {a.lastClosed !== null && <Link to="/close" style={{ color: "#FC72FF", fontSize: "14px", textDecoration: "none", alignSelf: "flex-start" }}>See results · auction #{a.lastClosed} →</Link>}
        <div style={{ border: "1px solid #F0F0F0", borderRadius: "20px", overflow: "hidden" }}>
          {rows.length === 0 && <div style={{ padding: "18px 16px", color: "#7D7D7D", fontSize: "14px" }}>No sealed orders in auction #{a.id} yet.</div>}
          {rows.map((o) => (
            <div key={o.key} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: "1px solid #F0F0F0", ...o.style }}>
              <span style={{ width: "32px", height: "32px", flex: "0 0 32px", borderRadius: "50%", background: "linear-gradient(135deg, #FFD6FF, #FC72FF)" }} />
              <span style={{ fontWeight: 535 }}>{o.mine ? "Your sealed order" : "Sealed order"}</span>
              <span style={{ flex: "1", height: "10px", borderRadius: "5px", background: "repeating-linear-gradient(90deg, #EFEFEF 0 14px, #F7F7F7 14px 20px)" }} />
              <span style={{ color: "#7D7D7D", fontSize: "14px" }}>{o.time}</span>
              <span style={{ color: "#40B66B", fontSize: "13px", background: "#EEF9F1", borderRadius: "12px", padding: "4px 8px" }}>funded ✓</span>
            </div>
          ))}
        </div>
      </section>
      </main>
    </>
  );
}
