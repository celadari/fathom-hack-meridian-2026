// Port of designs/Main.html (auction room), wired to testnet.
// Copy changes from the design, required by the privacy model (see docs/design-diff.md):
//   "Hidden amount" / "amount hidden" / "cUSDC"  → fixed deposit size, price and quantity hidden until the close
//   "Proof verified on Stellar"                  → proof step arrives with the in-browser proof (phase 6)
//   row pill "proof ✓"                           → "funded ✓" (others' proofs are not checked on-chain; their deposits are)
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { FundingPanel, useAccount } from "../components/Funding";
import { Header, Page } from "../components/Header";
import { ConfidentialScene, StageHero } from "../components/ConfidentialScene";
import { MyOrdersPanel } from "../components/MyOrdersPanel";
import { NAV_TITLE, SetByUs } from "../components/SetByUs";
import { Slice } from "../components/State";
import { DEMO, UNIT, CONFIDENTIAL } from "../config";
import type { AuctionView } from "../data/types";
import { useFathom } from "../data/useFathom";
import { fmtCountdown, fmtInt, fmtK, fmtPct, fmtTime, fmtUsd } from "../lib/format";
import { ledgerNow } from "../stellar/events";
import { useMyOrders, type SealProgress } from "../stellar/myOrders";
import { useWallet } from "../stellar/wallet";

const tabOn: CSSProperties = { background: "#F9F9F9", color: "#131313", border: "none", borderRadius: "20px", padding: "8px 14px", fontSize: "16px", fontWeight: 535, minHeight: "40px", fontFamily: "inherit", cursor: "pointer" };
const tabOff: CSSProperties = { background: "transparent", color: "#7D7D7D", border: "none", borderRadius: "20px", padding: "8px 14px", fontSize: "16px", fontWeight: 485, minHeight: "40px", fontFamily: "inherit", cursor: "pointer" };
const bigInput: CSSProperties = { fontSize: "36px", fontWeight: 485, flex: "1", minWidth: 0, border: "none", background: "transparent", padding: 0, fontFamily: "inherit", color: "#131313", outline: "none" };
const priceInput: CSSProperties = { width: "5ch", fontVariantNumeric: "tabular-nums", border: "none", borderBottom: "1px dashed #D9D9D9", background: "transparent", padding: 0, font: "inherit", color: "inherit", outline: "none" };
const sealBtn: CSSProperties = { marginTop: "4px", background: "#FC72FF", color: "#FFFFFF", border: "none", borderRadius: "20px", padding: "18px", fontSize: "18px", fontWeight: 535, minHeight: "56px", fontFamily: "inherit", cursor: "pointer" };

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(ledgerNow());
  useEffect(() => {
    const id = setInterval(() => setNow(ledgerNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Auction() {
  const { auction } = useFathom();
  return (
    <Page minHeight={980}>
      <Header />
      <Slice of={auction} label="the auction" minHeight={400}>{(a) => <AuctionRoom a={a} />}</Slice>
    </Page>
  );
}

function AuctionRoom({ a }: { a: AuctionView }) {
  const { freshOrders, source } = useFathom();
  const wallet = useWallet();
  const account = useAccount();
  const { seal } = useMyOrders();
  const now = useNow();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qtyText, setQtyText] = useState("30,000");
  // Limit prices start from Fathom's published price (sell one grid step below); empty if none.
  const fromOracle = (p: number | null) => (p ? p.toFixed(3) : "");
  const [priceText, setPriceText] = useState({ buy: fromOracle(a.publishedPrice), sell: fromOracle(a.publishedPrice ? a.publishedPrice - a.grid.tick : null) });
  const [priceEdited, setPriceEdited] = useState({ buy: false, sell: false });
  const [qtyEdited, setQtyEdited] = useState(false);
  const [standing, setStanding] = useState(true);
  // `stages`: confidential-deposit steps seen so far (setup, wrap, proof, …), kept as a list.
  const [progress, setProgress] = useState<null | { text: string; lock: string; p: SealProgress; stages: string[] }>(null);

  const buy = side === "buy";
  const qty = Number(qtyText.replace(/,/g, "")) || 0;
  const limit = Number(priceText[side]) || 0;
  const tick = Math.round((limit - a.grid.min) / a.grid.tick);
  const onGrid = tick >= 0 && tick < a.grid.ticks && Math.abs(a.grid.min + tick * a.grid.tick - limit) < 1e-9;
  const needed = buy ? qty * limit : qty;
  // Confidential deposits take any amount (exactly what the order needs); otherwise a fixed size.
  const deposit = CONFIDENTIAL ? (needed > 0 ? Math.ceil(needed) : undefined) : a.depositSizes.find((s) => s >= needed);
  const lockTok = buy ? a.quote : a.base;
  const isStanding = buy && standing;
  const balance = account.status?.balances[buy ? "USDC" : "USTRY"] ?? 0;
  const busy = progress?.p.step === "sealing" || progress?.p.step === "sealed" || progress?.p.step === "proved";

  // What blocks sealing, in the order the user can fix it.
  let block: string | null = null;
  if (source === "mock") block = null; // mock: the button only plays the panel (design comparison)
  else if (!wallet.address) block = null; // the button connects
  else if (wallet.wrongNetwork) block = "Switch Freighter to testnet";
  else if (!qty) block = "Enter a quantity";
  else if (!priceText[side].trim()) block = "Enter a limit price";
  else if (!onGrid) block = `Price must be on the $${a.grid.tick.toFixed(2)} grid`;
  else if (!deposit) block = `Above the largest deposit (${fmtInt(a.depositSizes[a.depositSizes.length - 1])})`;
  else if (!account.status) block = account.error ? "Could not read your balance" : "Checking your balance…";
  else if (!CONFIDENTIAL && balance < deposit) block = `Not enough ${lockTok} (you have ${fmtInt(balance)})`; // confidential: checked against the confidential balance while sealing

  const onSeal = () => {
    if (source === "mock") {
      if (progress) return setProgress(null);
      const text = `${buy ? "Buy" : "Sell"} ${fmtInt(qty)}`;
      return setProgress({ text, lock: `${fmtInt(deposit ?? 0)} ${lockTok} locked${isStanding ? ` for ${a.standingDays} days` : ""} · price and quantity hidden`, p: { step: "locked", fingerprint: "0x1f9a…c3e2", link: "#", orderId: "mock", proofMs: 1800 }, stages: [] });
    }
    if (!wallet.address) return void wallet.connect(DEMO && wallet.freighterInstalled === false ? "burner" : "freighter");
    if (progress && !busy) return setProgress(null);
    if (block || !deposit) return;
    const text = `${buy ? "Buy" : "Sell"} ${fmtInt(qty)}`;
    const lock = CONFIDENTIAL
      ? `Confidential ${lockTok} deposit locked${isStanding ? ` for ${a.standingDays} days` : ""} · price and quantity hidden`
      : `${fmtInt(deposit)} ${lockTok} locked${isStanding ? ` for ${a.standingDays} days` : ""} · price and quantity hidden`;
    setProgress({ text, lock, p: { step: "sealing" }, stages: [] });
    void seal(
      {
        side: buy ? 0 : 1, priceTick: tick, qty: BigInt(Math.round(qty)) * UNIT, deposit: BigInt(deposit) * UNIT, standing: isStanding,
        grid: { min: BigInt(Math.round(a.grid.min * 1e7)), tick: BigInt(Math.round(a.grid.tick * 1e7)), ticks: a.grid.ticks },
      },
      (p) => setProgress((prev) => {
        const stages = prev?.stages ?? [];
        const add = p.step === "proved" && p.detail && stages[stages.length - 1] !== p.detail;
        return { text, lock, p, stages: add ? [...stages, p.detail!] : stages };
      }),
    );
  };

  const label = !wallet.address && source !== "mock" ? "Connect wallet" : busy ? "Sealing…" : progress ? "Seal another order" : block ?? "Lock & seal order";
  const p = progress?.p;
  const fingerprint = p && "fingerprint" in p ? p.fingerprint : null;
  const locked = p?.step === "locked";
  const proofMs = p && "proofMs" in p ? p.proofMs : null;

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
  const closing = a.closesAt - now;

  return (
    <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "40px 24px", display: "flex", flexWrap: "wrap", gap: "40px", justifyContent: "center", alignItems: "flex-start" }}>
      <section aria-label="Place a sealed order" style={{ flex: "0 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", gap: "4px", padding: "0 4px 8px" }}>
          <button type="button" onClick={() => setSide("buy")} style={buy ? tabOn : tabOff}>Buy</button>
          <button type="button" onClick={() => setSide("sell")} style={buy ? tabOff : tabOn}>Sell</button>
          <span style={{ marginLeft: "auto", color: "#7D7D7D", padding: "8px 4px", fontSize: "14px" }}>
            {closing > 0 ? `Closes in ${fmtCountdown(closing)}` : `Auction #${a.id} closing…`}
          </span>
        </div>
        <div style={{ background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <label htmlFor="qty" style={{ color: "#7D7D7D", fontSize: "14px" }}>{buy ? "You buy" : "You sell"}{!qtyEdited && <span style={{ fontSize: "12px" }}> · example quantity, edit it</span>}</label>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input id="qty" inputMode="numeric" value={qtyText} onChange={(e) => { setQtyText(e.target.value); setQtyEdited(true); }} onBlur={() => setQtyText(qty ? fmtInt(qty) : "")} style={bigInput} />
            <span style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "6px 12px", fontWeight: 535 }}>{a.base}</span>
          </div>
          <span style={{ color: "#7D7D7D", fontSize: "14px" }}>
            <label htmlFor="limit">{buy ? "Max price" : "Min price"}</label> $
            <input id="limit" inputMode="decimal" value={priceText[side]} placeholder="enter" onChange={(e) => { setPriceText({ ...priceText, [side]: e.target.value }); setPriceEdited({ ...priceEdited, [side]: true }); }} style={priceInput} />
            {!priceEdited[side] && priceText[side] && <span style={{ fontSize: "12px" }}> (from Fathom price{side === "sell" ? " − 1 tick" : ""})</span>}
            {" "}· NAV {a.nav ? fmtUsd(a.nav) : "—"} <SetByUs title={NAV_TITLE} />
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
            {CONFIDENTIAL && <span style={{ display: "block", marginBottom: "4px" }}>Deposit amount: confidential token. The demo settlement server can see amounts. Proofs aren't zero-knowledge until Soroban's verifier supports it.</span>}
            {deposit ? "Price and quantity hidden until the close · " : CONFIDENTIAL ? "Enter a quantity and price · " : `Above the largest deposit (${fmtInt(a.depositSizes[a.depositSizes.length - 1])}) · `}
            {buy ? (
              <button type="button" onClick={() => setStanding(!standing)} aria-pressed={standing} style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "inherit", textDecoration: "underline dotted", cursor: "pointer" }}>
                {standing ? `standing ${a.standingDays} days` : "one auction"}
              </button>
            ) : "one auction"}
          </span>
        </div>
        <button type="button" onClick={onSeal} disabled={busy || (!!wallet.address && !progress && !!block)} style={{ ...sealBtn, opacity: busy || (wallet.address && !progress && block) ? 0.5 : 1 }}>{label}</button>
        {!progress && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "#7D7D7D", fontSize: "14px", padding: "8px 4px" }}>
            <span>Sealed in your browser</span>
            <span>{CONFIDENTIAL ? "Side is public" : "Side and deposit size are public"}</span>
          </div>
        )}
        {progress && (
          <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#F9F9F9", borderRadius: "20px", padding: "16px", marginTop: "4px" }}>
            {CONFIDENTIAL && progress.stages.length > 0 && !locked && p?.step !== "error" ? (
              // While a confidential step runs, its own animation replaces the envelope.
              <StageHero stages={progress.stages} token={lockTok} />
            ) : (
            <svg viewBox="0 0 440 120" role="img" aria-label="Order sealed into an envelope and locked" style={{ width: "100%", height: "auto" }}>
                <g style={{ animation: "slideInto .9s ease-in .1s both" }}><rect x="20" y="35" width="110" height="50" rx="12" fill="#FFFFFF" stroke="#F0F0F0" /><text x="75" y="66" textAnchor="middle" fontSize="14" fontWeight="600" fill="#131313">{progress.text}</text></g>
                <g transform="translate(170 18)">
                  <rect x="0" y="14" width="100" height="66" rx="8" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
                  <path d="M0 14 L50 50 L100 14" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" style={{ transformOrigin: "50% 0%", animation: "flapClose .4s ease-out 1s both" }} />
                  {locked && <g className="pop"><rect x="40" y="50" width="20" height="16" rx="3" fill="#FC72FF" /><path d="M44 50 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke="#FC72FF" strokeWidth="2.5" /></g>}
                </g>
                {proofMs !== null ? (
                  <g className="pop" transform="translate(330 22)"><circle cx="40" cy="40" r="34" fill="#EEF9F1" /><path d="M24 41 l10 10 l22 -22" fill="none" stroke="#40B66B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></g>
                ) : (
                  <g transform="translate(330 22)"><circle cx="40" cy="40" r="34" fill="none" stroke="#D9D9D9" strokeWidth="2" strokeDasharray="4 6" /><text x="40" y="45" textAnchor="middle" fontSize="13" fill="#B5B5B5">ZK</text></g>
                )}
              </svg>
            )}
            {CONFIDENTIAL && progress.stages.length > 0 && (
              <ConfidentialScene stages={progress.stages} locked={locked} failed={p?.step === "error"} token={lockTok} />
            )}
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
              <li className="fade" style={{ display: "flex", gap: "8px" }}>
                <span style={{ color: fingerprint ? "#40B66B" : "#B5B5B5" }}>{fingerprint ? "✓" : "…"}</span>
                {fingerprint ? `Sealed in your browser · fingerprint ${fingerprint}` : "Sealing in your browser…"}
              </li>
              <li className="fade" style={{ display: "flex", gap: "8px" }}>
                <span style={{ color: proofMs !== null ? "#40B66B" : "#B5B5B5" }}>{proofMs !== null ? "✓" : "…"}</span>
                <span>
                  {proofMs !== null
                    ? `Zero-knowledge proof made and checked in your browser (${(proofMs / 1000).toFixed(1)} s): on the grid and paid for. Not posted on-chain: Soroban's verifier only takes non-ZK proofs today, so the contract also checks funding at reveal.`
                    : fingerprint && p?.step !== "error" ? "Proving in your browser that the order is valid and paid for…" : "Not proven"}
                </span>
              </li>
              {progress.stages.map((st, i) => {
                // Each confidential step stays listed: done ones get a check, the current one pulses.
                const current = i === progress.stages.length - 1 && !locked;
                const failed = current && p?.step === "error";
                return (
                  <li key={st} className="fade" style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                    {current && !failed
                      ? <span className="live" aria-hidden="true" style={{ flex: "none", marginTop: "4px" }} />
                      : <span className={failed ? undefined : "pop"} style={{ color: failed ? "#D93A3A" : "#40B66B" }}>{failed ? "✕" : "✓"}</span>}
                    <span style={{ color: current ? "#131313" : "#7D7D7D" }}>{current && !failed ? st : st.replace(/…$/, "")}</span>
                  </li>
                );
              })}
              <li className="fade" style={{ display: "flex", gap: "8px" }}>
                <span className={locked ? "pop" : undefined} style={{ color: locked ? "#40B66B" : "#B5B5B5" }}>{locked ? "✓" : "…"}</span>
                <span>
                  {locked ? progress.lock : proofMs !== null && p?.step !== "error" && !progress.stages.length ? "Locking funds on Stellar…" : "Funds not locked yet"}
                  {p?.step === "locked" && <> · <a href={p.link} target="_blank" rel="noreferrer" style={{ color: "#FC72FF" }}>stellar.expert</a></>}
                </span>
              </li>
            </ol>
            {p?.step === "error" && <span role="alert" style={{ fontSize: "13px", color: "#D93A3A" }}>{p.error}</span>}
          </div>
        )}
        <FundingPanel account={account} minDeposit={a.depositSizes[0] ?? 0} />
        <MyOrdersPanel grid={a.grid} penaltyPct={a.penaltyPct} />
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
        {a.lastClosed !== null && <Link to="/close" style={{ color: "#FC72FF", fontSize: "14px", textDecoration: "none", alignSelf: "flex-start" }}>See last close · auction #{a.lastClosed} →</Link>}
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
  );
}
