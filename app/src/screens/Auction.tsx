// Port of designs/Main.html (auction room).
// Copy changes from the design, required by the privacy model (see README):
//   "Hidden amount" / "amount hidden" / "cUSDC"  → fixed deposit size, price and quantity hidden until the close
//   "Proof verified on Stellar"                  → proof checked in the browser (off-chain)
//   row pill "proof ✓"                           → "funded ✓" (others' proofs are not checked on-chain; their deposits are)
import { useEffect, useState, type CSSProperties } from "react";
import { Header, Page } from "../components/Header";
import { useFathom } from "../data/useFathom";
import { fmtCountdown, fmtInt, fmtK, fmtPct, fmtTime, fmtUsd } from "../lib/format";

const tabOn: CSSProperties = { background: "#F9F9F9", color: "#131313", border: "none", borderRadius: "20px", padding: "8px 14px", fontSize: "16px", fontWeight: 535, minHeight: "40px", fontFamily: "inherit", cursor: "pointer" };
const tabOff: CSSProperties = { background: "transparent", color: "#7D7D7D", border: "none", borderRadius: "20px", padding: "8px 14px", fontSize: "16px", fontWeight: 485, minHeight: "40px", fontFamily: "inherit", cursor: "pointer" };
const bigInput: CSSProperties = { fontSize: "36px", fontWeight: 485, flex: "1", minWidth: 0, border: "none", background: "transparent", padding: 0, fontFamily: "inherit", color: "#131313", outline: "none" };
const priceInput: CSSProperties = { width: "5ch", fontVariantNumeric: "tabular-nums", border: "none", borderBottom: "1px dashed #D9D9D9", background: "transparent", padding: 0, font: "inherit", color: "inherit", outline: "none" };

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Phase 4 stand-in for the Poseidon2 commitment computed in phase 5. */
function mockFingerprint() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex.slice(0, 4)}…${hex.slice(4)}`;
}

export function Auction() {
  const { auction: a } = useFathom();
  const now = useNow();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qtyText, setQtyText] = useState("30,000");
  const [priceText, setPriceText] = useState({ buy: "1.040", sell: "1.020" });
  const [standing, setStanding] = useState(true);
  const [sealed, setSealed] = useState<null | { at: number; text: string; lock: string; fingerprint: string }>(null);

  const buy = side === "buy";
  const qty = Number(qtyText.replace(/,/g, "")) || 0;
  const limit = Number(priceText[side]) || 0;
  const needed = buy ? qty * limit : qty;
  const deposit = a.depositSizes.find((s) => s >= needed);
  const lockTok = buy ? a.quote : a.base;
  const isStanding = buy && standing;

  const seal = () => {
    if (sealed) return setSealed(null);
    setSealed({
      at: Date.now(),
      text: `${buy ? "Buy" : "Sell"} ${fmtInt(qty)}`,
      fingerprint: mockFingerprint(),
      lock: `${fmtInt(deposit ?? 0)} ${lockTok} locked${isStanding ? ` for ${a.standingDays} days` : ""} · price and quantity hidden`,
    });
  };

  const rows = [
    ...(sealed ? [{ key: "new", time: "just now", style: { animation: "rowIn 1.6s ease-out 2.2s both" } }] : []),
    ...a.sealed.map((o, i) => ({ key: o.id, time: fmtTime(o.placedAt), style: { animation: "fadeUp .4s ease-out both", animationDelay: `${(i + (sealed ? 1 : 0)) * 0.08}s` } })),
  ];

  // Depth ruler: 30K at the bottom tick unless depth is larger.
  const rulerMax = Math.max(30_000, Math.ceil((a.depth * 1.1) / 3_000) * 3_000);
  const depthY = Math.min(250, 50 + (a.depth / rulerMax) * 180);
  const ticks = [1, 2, 3].map((k) => ({ y: 50 + (k / 3) * 180, label: fmtK((rulerMax * k) / 3) }));

  return (
    <Page minHeight={980}>
      <Header
        variant="swap"
        withSearch
        right={<button type="button" style={{ background: "#FEF4FF", color: "#FC72FF", border: "none", borderRadius: "20px", padding: "10px 16px", fontSize: "16px", fontWeight: 535, minHeight: "44px", fontFamily: "inherit" }}>Connect</button>}
      />

      <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "40px 24px", display: "flex", flexWrap: "wrap", gap: "40px", justifyContent: "center", alignItems: "flex-start" }}>
        <section aria-label="Place a sealed order" style={{ flex: "0 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", gap: "4px", padding: "0 4px 8px" }}>
            <button type="button" onClick={() => setSide("buy")} style={buy ? tabOn : tabOff}>Buy</button>
            <button type="button" onClick={() => setSide("sell")} style={buy ? tabOff : tabOn}>Sell</button>
            <span style={{ marginLeft: "auto", color: "#7D7D7D", padding: "8px 4px", fontSize: "14px" }}>Closes in {fmtCountdown(a.closesAt - now)}</span>
          </div>
          <div style={{ background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <label htmlFor="qty" style={{ color: "#7D7D7D", fontSize: "14px" }}>{buy ? "You buy" : "You sell"}</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input id="qty" inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value)} onBlur={() => setQtyText(qty ? fmtInt(qty) : "")} style={bigInput} />
              <span style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "6px 12px", fontWeight: 535 }}>{a.base}</span>
            </div>
            <span style={{ color: "#7D7D7D", fontSize: "14px" }}>
              <label htmlFor="limit">{buy ? "Max price" : "Min price"}</label> $
              <input id="limit" inputMode="decimal" value={priceText[side]} onChange={(e) => setPriceText({ ...priceText, [side]: e.target.value })} style={priceInput} />
              {" "}· NAV {fmtUsd(a.nav)}
            </span>
          </div>
          <div style={{ alignSelf: "center", margin: "-14px 0", zIndex: 1, width: "40px", height: "40px", borderRadius: "12px", background: "#F9F9F9", border: "4px solid #FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#131313" }} aria-hidden="true">↓</div>
          <div style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ color: "#7D7D7D", fontSize: "14px" }}>You lock</span>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "36px", fontWeight: 485, flex: "1" }}>{deposit ? fmtInt(deposit) : "—"}</span>
              <span style={{ background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "6px 12px", fontWeight: 535 }}>{lockTok}</span>
            </div>
            <span style={{ color: "#7D7D7D", fontSize: "14px" }}>
              {deposit ? "Price and quantity hidden until the close · " : `Above the largest deposit (${fmtInt(a.depositSizes[a.depositSizes.length - 1])}) · `}
              {buy ? (
                <button type="button" onClick={() => setStanding(!standing)} aria-pressed={standing} style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "inherit", textDecoration: "underline dotted", cursor: "pointer" }}>
                  {standing ? `standing ${a.standingDays} days` : "one auction"}
                </button>
              ) : (
                "one auction"
              )}
            </span>
          </div>
          <button type="button" onClick={seal} disabled={!deposit || !qty} style={{ marginTop: "4px", background: "#FC72FF", color: "#FFFFFF", border: "none", borderRadius: "20px", padding: "18px", fontSize: "18px", fontWeight: 535, minHeight: "56px", fontFamily: "inherit", cursor: "pointer", opacity: deposit && qty ? 1 : 0.5 }}>
            {sealed ? "Seal another order" : "Lock & seal order"}
          </button>
          {!sealed && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "#7D7D7D", fontSize: "14px", padding: "8px 4px" }}>
              <span>Proof is generated in your browser</span>
              <span>Side and deposit size are public</span>
            </div>
          )}
          {sealed && (
            <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#F9F9F9", borderRadius: "20px", padding: "16px", marginTop: "4px" }}>
              <svg viewBox="0 0 440 120" role="img" aria-label="Order sealed into an envelope and proven" style={{ width: "100%", height: "auto" }}>
                <g style={{ animation: "slideInto .9s ease-in .1s both" }}><rect x="20" y="35" width="110" height="50" rx="12" fill="#FFFFFF" stroke="#F0F0F0" /><text x="75" y="66" textAnchor="middle" fontSize="14" fontWeight="600" fill="#131313">{sealed.text}</text></g>
                <g transform="translate(170 18)"><rect x="0" y="14" width="100" height="66" rx="8" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" /><path d="M0 14 L50 50 L100 14" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" style={{ transformOrigin: "50% 0%", animation: "flapClose .4s ease-out 1s both" }} /><g className="pop" style={{ animationDelay: "1.3s" }}><rect x="40" y="50" width="20" height="16" rx="3" fill="#FC72FF" /><path d="M44 50 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke="#FC72FF" strokeWidth="2.5" /></g></g>
                <g className="pop" style={{ animationDelay: "2.1s" }} transform="translate(330 22)"><circle cx="40" cy="40" r="34" fill="#EEF9F1" /><path d="M24 41 l10 10 l22 -22" fill="none" stroke="#40B66B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></g>
              </svg>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
                <li className="fade" style={{ animationDelay: ".4s", display: "flex", gap: "8px" }}><span style={{ color: "#40B66B" }}>✓</span>Sealed in your browser · fingerprint {sealed.fingerprint}</li>
                <li className="fade" style={{ animationDelay: "1.3s", display: "flex", gap: "8px" }}><span style={{ color: "#40B66B" }}>✓</span>{sealed.lock}</li>
                <li className="fade" style={{ animationDelay: "2.1s", display: "flex", gap: "8px" }}><span style={{ color: "#40B66B" }}>✓</span>Proof checked in your browser (off-chain): order is valid and paid for</li>
              </ol>
            </div>
          )}
        </section>

        <section aria-label="Auction" style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: "20px" }}>
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
              {[
                [150, 118, 0], [250, 160, 0.7], [372, 132, 1.4], [470, 190, 2.1], [90, 200, 1],
              ].map(([x, y, d]) => (
                <g key={`${x}`} className="bob" style={{ animationDelay: `${d}s` }}><g transform={`translate(${x} ${y})`}><rect width="34" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="1.5" /><path d="M0 0 L17 12 L34 0" fill="none" stroke="#FC72FF" strokeWidth="1.5" /></g></g>
              ))}
              <g fontSize="11" fill="#7D7D7D">
                <line x1="600" y1="70" x2="600" y2="250" stroke="#131313" strokeOpacity=".25" />
                {ticks.map((t) => (
                  <g key={t.y}><line x1="594" y1={t.y} x2="606" y2={t.y} stroke="#131313" strokeOpacity=".25" /><text x="590" y={t.y + 4} textAnchor="end">{t.label}</text></g>
                ))}
              </g>
              <g style={{ animation: "fadeUp .8s ease-out .6s both" }}>
                <line x1="560" y1={depthY} x2="612" y2={depthY} stroke="#FC72FF" strokeWidth="3" />
                <circle className="pop" style={{ animationDelay: "1s" }} cx="600" cy={depthY} r="5" fill="#FC72FF" />
                <text x="556" y={depthY + 4} textAnchor="end" fontSize="13" fontWeight="600" fill="#131313">{fmtK(a.depth)} deep</text>
              </g>
              <text x="24" y="34" fontSize="13" fill="#131313" fontWeight="535">Surface price {a.lastClearing ? fmtUsd(a.lastClearing) : "not published"}</text>
              <text x="24" y="250" fontSize="12" fill="#7D7D7D">Every envelope is a sealed, funded order</text>
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ color: "#7D7D7D", fontSize: "14px" }}>Auction #{a.id} · {a.base} / {a.quote}</span>
            <span style={{ fontSize: "36px", fontWeight: 485 }}>{a.lastClearing ? fmtUsd(a.lastClearing) : "—"} <span style={{ fontSize: "16px", color: "#7D7D7D" }}>last clearing</span></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
            <div style={{ background: "#F9F9F9", borderRadius: "16px", padding: "14px" }}><div style={{ color: "#7D7D7D", fontSize: "13px" }}>Haircut vs NAV</div><div style={{ fontSize: "20px", fontWeight: 535 }}>{a.haircutPct === null ? "—" : fmtPct(a.haircutPct)}</div></div>
            <div style={{ background: "#F9F9F9", borderRadius: "16px", padding: "14px" }}><div style={{ color: "#7D7D7D", fontSize: "13px" }}>Depth</div><div style={{ fontSize: "20px", fontWeight: 535 }}>{fmtK(a.depth)}</div></div>
            <div style={{ background: "#F9F9F9", borderRadius: "16px", padding: "14px" }}><div style={{ color: "#7D7D7D", fontSize: "13px" }}>Sealed orders</div><div style={{ fontSize: "20px", fontWeight: 535 }}>{a.sealedCount + (sealed ? 1 : 0)}</div></div>
          </div>
          <div style={{ border: "1px solid #F0F0F0", borderRadius: "20px", overflow: "hidden" }}>
            {rows.map((o) => (
              <div key={o.key} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: "1px solid #F0F0F0", ...o.style }}>
                <span style={{ width: "32px", height: "32px", flex: "0 0 32px", borderRadius: "50%", background: "linear-gradient(135deg, #FFD6FF, #FC72FF)" }} />
                <span style={{ fontWeight: 535 }}>Sealed order</span>
                <span style={{ flex: "1", height: "10px", borderRadius: "5px", background: "repeating-linear-gradient(90deg, #EFEFEF 0 14px, #F7F7F7 14px 20px)" }} />
                <span style={{ color: "#7D7D7D", fontSize: "14px" }}>{o.time}</span>
                <span style={{ color: "#40B66B", fontSize: "13px", background: "#EEF9F1", borderRadius: "12px", padding: "4px 8px" }}>funded ✓</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </Page>
  );
}
