// Trade: the order widget only (swap-style), its progress in a dialog, and your orders.
// The live auction (sonar, sealed orders, stats) is on /auction.
// Copy rules from the privacy model (docs/design-diff.md) still apply: say exactly what is hidden.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { FundingPanel, useAccount } from "../components/Funding";
import { Header, Page } from "../components/Header";
import { MyOrdersPanel } from "../components/MyOrdersPanel";
import { PageIntro } from "../components/PageIntro";
import { SealModal, type SealState } from "../components/SealModal";
import { TradeBackdrop } from "../components/TradeBackdrop";
import { NAV_TITLE, SetByUs } from "../components/SetByUs";
import { Slice } from "../components/State";
import { CONFIDENTIAL, UNIT } from "../config";
import { usePresenter } from "../demo/api";
import type { AuctionView } from "../data/types";
import { useFathom } from "../data/useFathom";
import { fmtCountdown, fmtInt, fmtUsd } from "../lib/format";
import { ledgerNow } from "../stellar/events";
import { useMyOrders } from "../stellar/myOrders";
import { useWallet } from "../stellar/wallet";

const box: CSSProperties = { background: "#F9F9F9", borderRadius: "20px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px" };
const label: CSSProperties = { color: "#7D7D7D", fontSize: "14px" };
const bigInput: CSSProperties = { fontSize: "34px", fontWeight: 485, flex: "1", minWidth: 0, border: "none", background: "transparent", padding: 0, fontFamily: "inherit", color: "#131313", outline: "none" };
const pill: CSSProperties = { background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "6px 12px", fontWeight: 535, whiteSpace: "nowrap" };
const chip: CSSProperties = { border: "1px solid #F0F0F0", background: "#FFFFFF", borderRadius: "12px", padding: "3px 8px", fontSize: "12px", color: "#7D7D7D", fontFamily: "inherit", cursor: "pointer" };
const tab = (on: boolean): CSSProperties => ({ background: on ? "#F9F9F9" : "transparent", color: on ? "#131313" : "#7D7D7D", border: "none", borderRadius: "16px", padding: "8px 14px", fontSize: "16px", fontWeight: on ? 535 : 485, fontFamily: "inherit", cursor: "pointer" });
const cta: CSSProperties = { background: "#FC72FF", color: "#FFFFFF", border: "none", borderRadius: "20px", padding: "16px", fontSize: "18px", fontWeight: 535, minHeight: "56px", fontFamily: "inherit", cursor: "pointer" };

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(ledgerNow());
  useEffect(() => {
    const id = setInterval(() => setNow(ledgerNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Trade() {
  const { auction } = useFathom();
  return (
    <Page minHeight={980}>
      <Header />
      {/* The backdrop fills at least the window below the header, even when the content is short. */}
      <div style={{ position: "relative", minHeight: "calc(100vh - 80px)" }}>
      <TradeBackdrop />
      <div style={{ position: "relative", zIndex: 1 }}>
      <PageIntro
        center
        title="Trade"
        what="Place a sealed buy or sell order for USTRY."
        why="Your price and size stay hidden while orders are being placed, so nobody can trade against you; then everyone fills at one price."
      />
      <Slice of={auction} label="the auction" minHeight={400}>{(a) => <TradeWidget a={a} />}</Slice>
      </div>
      </div>
    </Page>
  );
}

function TradeWidget({ a }: { a: AuctionView }) {
  const { source } = useFathom();
  const wallet = useWallet();
  const presenter = usePresenter();
  const account = useAccount();
  const { seal } = useMyOrders();
  const now = useNow();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qtyText, setQtyText] = useState("30,000");
  const fromOracle = (p: number | null) => (p ? p.toFixed(3) : "");
  const [priceText, setPriceText] = useState({ buy: fromOracle(a.publishedPrice), sell: fromOracle(a.publishedPrice ? a.publishedPrice - a.grid.tick : null) });
  const [standing, setStanding] = useState(true);
  const [details, setDetails] = useState(false);
  const [progress, setProgress] = useState<SealState | null>(null);
  const [open, setOpen] = useState(false);

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
  const closing = a.closesAt - now;

  let block: string | null = null;
  if (source === "mock") block = null;
  else if (!wallet.address) block = null;
  else if (wallet.wrongNetwork) block = "Switch Freighter to testnet";
  else if (!qty) block = "Enter a quantity";
  else if (!priceText[side].trim()) block = "Enter a limit price";
  else if (!onGrid) block = `Price must be on the $${a.grid.tick.toFixed(2)} grid`;
  else if (!deposit) block = `Above the largest deposit (${fmtInt(a.depositSizes[a.depositSizes.length - 1])})`;
  else if (!account.status) block = account.error ? "Could not read your balance" : "Checking your balance…";
  else if (!CONFIDENTIAL && balance < deposit) block = `Not enough ${lockTok} (you have ${fmtInt(balance)})`;

  const onSeal = () => {
    const text = `${buy ? "Buy" : "Sell"} ${fmtInt(qty)}`;
    if (source === "mock") {
      setProgress({ text, lock: `${fmtInt(deposit ?? 0)} ${lockTok} locked · price and quantity hidden`, p: { step: "locked", fingerprint: "0x1f9a…c3e2", link: "#", orderId: "mock", proofMs: 1800 }, stages: [] });
      return setOpen(true);
    }
    if (!wallet.address) return void wallet.connect(presenter && wallet.freighterInstalled === false ? "burner" : "freighter");
    if (busy) return setOpen(true);
    if (block || !deposit) return;
    const lock = CONFIDENTIAL
      ? `Confidential ${lockTok} deposit locked${isStanding ? ` for ${a.standingDays} days` : ""} · price and quantity hidden`
      : `${fmtInt(deposit)} ${lockTok} locked${isStanding ? ` for ${a.standingDays} days` : ""} · price and quantity hidden`;
    setProgress({ text, lock, p: { step: "sealing" }, stages: [] });
    setOpen(true);
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

  const label_ = !wallet.address && source !== "mock" ? "Connect wallet" : busy ? "Sealing…" : block ?? "Lock & seal order";
  const disabled = !!wallet.address && !busy && !!block;
  const setPrice = (v: number | null) => v && setPriceText({ ...priceText, [side]: v.toFixed(3) });

  return (
    <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "24px 24px 48px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
      <section aria-label="Place a sealed order" style={{ width: "100%", maxWidth: "480px", background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "28px", padding: "8px", boxShadow: "0 4px 24px rgba(252,114,255,.08)", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 4px 6px" }}>
          <button type="button" onClick={() => setSide("buy")} style={tab(buy)}>Buy</button>
          <button type="button" onClick={() => setSide("sell")} style={tab(!buy)}>Sell</button>
          <Link to="/auction" title="See the live auction" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", color: "#7D7D7D", fontSize: "13px", textDecoration: "none", background: "#F9F9F9", borderRadius: "12px", padding: "6px 10px" }}>
            <span className="live" aria-hidden="true" style={{ width: "6px", height: "6px" }} />
            Auction #{a.id} · {closing > 0 ? fmtCountdown(closing) : "closing…"}
          </Link>
        </div>

        <div style={box}>
          <label htmlFor="qty" style={label}>{buy ? "You buy" : "You sell"}</label>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input id="qty" inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value)} onBlur={() => setQtyText(qty ? fmtInt(qty) : "")} style={bigInput} />
            <span style={pill}>{a.base}</span>
          </div>
          {!buy && account.status && <span style={{ ...label, fontSize: "12px" }}>Balance {fmtInt(account.status.balances.USTRY)} {a.base}</span>}
        </div>

        <div style={box}>
          <label htmlFor="limit" style={label}>{buy ? "Pay at most" : "Receive at least"} · per {a.base}</label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "24px", color: "#7D7D7D" }}>$</span>
            <input id="limit" inputMode="decimal" value={priceText[side]} placeholder="0.000" onChange={(e) => setPriceText({ ...priceText, [side]: e.target.value })} style={{ ...bigInput, fontSize: "24px" }} />
            <span style={pill}>{a.quote}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            {a.publishedPrice && <button type="button" style={chip} onClick={() => setPrice(buy ? a.publishedPrice : a.publishedPrice! - a.grid.tick)}>Fathom {fmtUsd(a.publishedPrice)}</button>}
            {a.nav && <button type="button" style={chip} onClick={() => setPrice(a.nav)}>NAV {fmtUsd(a.nav)}</button>}
            <SetByUs title={NAV_TITLE} />
          </div>
        </div>

        <div style={{ alignSelf: "center", margin: "-12px 0", zIndex: 1, width: "36px", height: "36px", borderRadius: "12px", background: "#F9F9F9", border: "4px solid #FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">↓</div>

        <div style={{ ...box, background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
          <span style={label}>You lock{CONFIDENTIAL ? " (confidential)" : ""}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "34px", fontWeight: 485, flex: "1" }}>{deposit ? fmtInt(deposit) : "—"}</span>
            <span style={pill}>{CONFIDENTIAL ? `c${lockTok}` : lockTok}</span>
          </div>
          {account.status && <span style={{ ...label, fontSize: "12px" }}>Balance {fmtInt(balance)} {lockTok}</span>}
        </div>

        <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} style={{ display: "flex", alignItems: "center", gap: "8px", border: "none", background: "none", padding: "10px 12px", fontFamily: "inherit", fontSize: "14px", color: "#131313", cursor: "pointer", textAlign: "left" }}>
          <span>{limit ? `1 ${a.base} ${buy ? "≤" : "≥"} ${fmtUsd(limit)}` : "Order details"}</span>
          <span style={{ color: "#7D7D7D" }}>· {isStanding ? `standing ${a.standingDays}d` : "one auction"} · hidden</span>
          <span style={{ marginLeft: "auto", color: "#7D7D7D" }}>{details ? "▴" : "▾"}</span>
        </button>
        {details && (
          <div className="fade" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 12px 10px", fontSize: "13px" }}>
            <Row k="Lasts">
              {buy ? (
                <button type="button" onClick={() => setStanding(!standing)} aria-pressed={standing} style={{ ...chip, color: "#131313" }}>
                  {standing ? `Standing · ${a.standingDays} days` : "One auction"} ⇄
                </button>
              ) : "One auction"}
            </Row>
            <Row k="Hidden until your reveal">Price, quantity{CONFIDENTIAL ? ", deposit amount" : ""} (orders for this auction are closed by then)</Row>
            <Row k="Public">{CONFIDENTIAL ? "Side (buy or sell)" : "Side and deposit size"}</Row>
            {CONFIDENTIAL && <Row k="Deposit">Confidential token. The demo settlement server can see amounts; proofs aren't zero-knowledge until Soroban's verifier supports it.</Row>}
            <Row k="If not revealed">{a.penaltyPct}% of the deposit is kept; your tab reveals automatically</Row>
          </div>
        )}

        <button type="button" onClick={onSeal} disabled={disabled} style={{ ...cta, opacity: disabled ? 0.5 : 1 }}>{label_}</button>
        {progress && !open && (
          <button type="button" onClick={() => setOpen(true)} style={{ ...chip, alignSelf: "center", margin: "4px 0", fontSize: "13px", color: "#131313" }}>
            {busy ? <><span className="live" aria-hidden="true" style={{ width: "6px", height: "6px", marginRight: "6px" }} />Sealing… view progress</> : progress.p.step === "locked" ? "✓ Order sealed · view details" : "View last attempt"}
          </button>
        )}
      </section>

      <div style={{ width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <FundingPanel account={account} minDeposit={a.depositSizes[0] ?? 0} />
        <MyOrdersPanel grid={a.grid} penaltyPct={a.penaltyPct} />
      </div>

      {progress && open && <SealModal state={progress} token={lockTok} onClose={() => setOpen(false)} />}
    </main>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "baseline" }}>
      <span style={{ color: "#7D7D7D", flex: "0 0 140px" }}>{k}</span>
      <span style={{ color: "#131313" }}>{children}</span>
    </div>
  );
}
