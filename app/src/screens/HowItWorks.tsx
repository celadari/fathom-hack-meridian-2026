// How it works: the order's whole life, accurately, with the rules read from the contracts.
// Timeline → six illustrated steps → what is hidden when → why depth can't be faked → what to trust.
// Illustrations use example numbers; animations live in styles/explainer.css (scoped under .fx).
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Header, Page } from "../components/Header";
import { PageIntro } from "../components/PageIntro";
import { CONFIDENTIAL, VERIFIER_DEMO } from "../config";
import { VerifierDemo } from "../zk/VerifierDemo";
import { usePresenter } from "../demo/api";
import { useFathom } from "../data/useFathom";
import { fmtK } from "../lib/format";

const cardStyle: CSSProperties = { background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "24px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" };
const art: CSSProperties = { width: "100%", height: "auto", background: "#F9F9F9", borderRadius: "16px" };
const h2: CSSProperties = { margin: 0, fontSize: "20px", fontWeight: 600 };

interface WalkStep { key: string; short: string; when: string; title: string; svg: ReactNode; body: ReactNode }

/**
 * The six steps one at a time: a clickable timeline on top, the current step's animation and text
 * below. Advances by itself every few seconds (pauses on hover, on click, or with the button).
 */
function Walkthrough({ steps }: { steps: WalkStep[] }) {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState(false);
  const DWELL = 7000;
  useEffect(() => {
    if (!playing || hover) return;
    const id = setTimeout(() => setAt((i) => (i + 1) % steps.length), DWELL);
    return () => clearTimeout(id);
  }, [at, playing, hover, steps.length]);
  const go = (i: number) => { setAt((i + steps.length) % steps.length); setPlaying(false); };
  const s = steps[at];
  const btn: CSSProperties = { border: "1px solid #F0F0F0", background: "#FFFFFF", borderRadius: "12px", width: "36px", height: "36px", fontSize: "18px", cursor: "pointer", fontFamily: "inherit" };
  return (
    <section aria-label="Step by step" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ ...cardStyle, gap: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <h2 style={h2}>One auction, step by step</h2>
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <button type="button" style={btn} onClick={() => go(at - 1)} aria-label="Previous step">‹</button>
          <button type="button" style={{ ...btn, width: "auto", padding: "0 12px", fontSize: "13px" }} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
          <button type="button" style={btn} onClick={() => go(at + 1)} aria-label="Next step">›</button>
        </span>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", position: "relative", display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: "6px" }}>
        <li aria-hidden="true" style={{ position: "absolute", left: `${50 / steps.length}%`, right: `${50 / steps.length}%`, top: "17px", height: "4px", background: "#F0F0F0", borderRadius: "2px" }} />
        <li aria-hidden="true" style={{ position: "absolute", left: `${50 / steps.length}%`, width: `${(at / (steps.length - 1)) * (100 - 100 / steps.length)}%`, top: "17px", height: "4px", background: "#FC72FF", borderRadius: "2px", transition: "width .6s ease-out" }} />
        {steps.map((st, i) => {
          const done = i < at, cur = i === at;
          return (
            <li key={st.key} style={{ position: "relative" }}>
              <button type="button" onClick={() => go(i)} aria-current={cur ? "step" : undefined} style={{ width: "100%", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", textAlign: "center" }}>
                <span style={{ width: "38px", height: "38px", borderRadius: "50%", background: cur || done ? "#FC72FF" : "#FFFFFF", border: "3px solid #FC72FF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, color: cur || done ? "#FFFFFF" : "#FC72FF", transform: cur ? "scale(1.12)" : "none", transition: "all .3s", boxShadow: cur ? "0 0 0 6px rgba(252,114,255,.18)" : "none" }}>{done ? "✓" : i + 1}</span>
                <span style={{ fontWeight: cur ? 600 : 535, color: cur ? "#131313" : "#7D7D7D" }}>{st.short}</span>
                <span style={{ fontSize: "12px", color: "#FC72FF" }}>{st.when}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {/* key: remounting restarts the step's animations each time it is shown */}
      <div key={s.key} className="fade" style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center" }}>
        <div style={{ flex: "1 1 460px", minWidth: 0 }}>{s.svg}</div>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "#FC72FF", fontWeight: 600 }}>Step {at + 1} of {steps.length} · {s.when}</span>
          <span style={{ fontSize: "22px", fontWeight: 600 }}>{s.title}</span>
          <span style={{ fontSize: "15px", color: "#4A4A4A", lineHeight: 1.55 }}>{s.body}</span>
        </div>
      </div>
      <div aria-hidden="true" style={{ height: "3px", borderRadius: "2px", background: "#F5F5F5", overflow: "hidden" }}>
        {playing && !hover && <div key={`${at}-${playing}`} style={{ height: "100%", background: "#FFD6FF", animation: `stepDwell ${DWELL}ms linear both` }} />}
      </div>
      <span style={{ fontSize: "12px", color: "#B7791F" }}>Demo timing on testnet ({CONFIDENTIAL ? "8 min of orders, 2 min to reveal" : "3 min of orders, 1 min to reveal"}). A production market would run one auction a day.</span>
    </section>
  );
}

export function HowItWorks() {
  const presenter = usePresenter();
  // Rules quoted in the copy come from the contracts (auction params, oracle params).
  const { auction, liquidity } = useFathom();
  const a = auction.status === "ready" ? auction.data : null;
  const l = liquidity.status === "ready" ? liquidity.data : null;
  const periodMin = CONFIDENTIAL ? 8 : 3; // demo timing, scripts/config.ts
  const revealMin = a ? Math.round(a.revealSecs / 60) : CONFIDENTIAL ? 2 : 1;
  const days = a?.standingDays ?? 7;
  const penalty = a?.penaltyPct ?? 1;
  const median = l?.medianWindow ?? 7;
  const floor = l?.depthFloorPct ?? 5;
  const windowLabel = l?.depthWindowLabel ?? "30 min";
  const capShare = l?.poolB.capSharePct ?? 50;
  const sizes = a ? a.depositSizes.map(fmtK).join(" / ") : "10K / 50K / 250K";

  const steps: WalkStep[] = [
    { key: "seal", short: "Seal", when: `${periodMin}-min window`, title: "You seal your order in your browser", svg: SEAL, body: (
      <>
            You choose side, quantity and a limit price. Your browser commits to them with a fingerprint
            (a Poseidon hash with a random salt) and checks a zero-knowledge proof that the order is on the price
            grid and paid for. Only the fingerprint goes on-chain; the details stay in your browser.
      </>
    ) },
    { key: "deposit", short: "Deposit", when: "same transaction", title: CONFIDENTIAL ? "You lock a confidential deposit" : "You lock a fixed-size deposit", svg: CONFIDENTIAL ? DEPOSIT_CONF : DEPOSIT_FIXED, body: (
      <>
            {CONFIDENTIAL ? (
              <>Your USDC (to buy) or USTRY (to sell) is wrapped into an OpenZeppelin confidential token, then sent to the
                auction as a confidential transfer of exactly what the order needs. The amount sits in a Pedersen commitment.
                Visible: your side, and the amount you wrap. The deposit's proof is checked on-chain; it is not
                zero-knowledge yet.</>
            ) : (
              <>Deposits come in fixed sizes ({sizes}), so escrow shows a bucket, not your order. Visible: your side and
                deposit size.</>
            )}
      </>
    ) },
    { key: "reveal", short: "Reveal", when: `${revealMin} min`, title: "Orders are revealed", svg: REVEAL, body: (
      <>
            In the {revealMin}-minute reveal window your open tab sends your price, quantity and salt
            {CONFIDENTIAL ? ", plus the deposit's amount and blinding" : ""}. The contract checks they match the
            fingerprint{CONFIDENTIAL ? " and the deposit commitment" : ""}, and that the deposit covers the order.
            An order not revealed in time keeps {100 - penalty}% of its deposit ({penalty}% penalty).
      </>
    ) },
    { key: "close", short: "Close", when: "one transaction", title: "One price for everyone", svg: CLOSE, body: (
      <>
            At the close the contract finds the single price where the most USTRY can change hands, on a $0.01 grid.
            Every filled order trades at that price, whatever its limit. Buy orders marked standing stay in the book
            for {days} days.
      </>
    ) },
    { key: "payouts", short: "Payouts", when: "after the close", title: "Payouts go only to order owners", svg: PAYOUTS, body: (
      <>
            {CONFIDENTIAL ? (
              <>Fills and refunds are paid back as confidential tokens. The auction cannot make proofs itself, so a
                settlement server holds its key and proves each payout; the contract checks every amount against what
                the close recorded and pays only the order's owner. If the server stops, payouts wait and resume.</>
            ) : (
              <>Fills and refunds are paid from escrow to each order's owner, in batches anyone can trigger.</>
            )}
      </>
    ) },
    { key: "publish", short: "Publish", when: "with the close", title: "Price and depth published as an oracle", svg: PUBLISH, body: (
      <>
            The close pushes the result to the Fathom oracle (SEP-40). Price: the median of the last {median} clearing
            prices, capped at NAV, published only when an auction has at least $10k traded and 5 orders.
            Depth: standing buy orders within {floor}% of NAV. Pool B caps USTRY collateral at {capShare}% of the lowest
            depth over the last {windowLabel}.
      </>
    ) },
  ];

  return (
    <Page minHeight={1080} className="fx">
      <Header />
      <PageIntro width={1280} title="How it works" what="What happens to an order, from sealing to the price lenders read."
        why={<>Every few minutes Fathom runs a sealed-bid auction for USTRY and publishes its result as an oracle. Illustrations use example numbers; the rules are read live from the contracts.</>} />
      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>

        <Walkthrough steps={steps} />

        <section aria-label="What is hidden when" style={cardStyle}>
          <h2 style={h2}>What is hidden, and until when</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "560px" }}>
              <thead>
                <tr style={{ color: "#7D7D7D", textAlign: "left" }}>
                  <th style={{ padding: "8px", fontWeight: 485 }} />
                  <th style={{ padding: "8px", fontWeight: 485 }}>While orders come in</th>
                  <th style={{ padding: "8px", fontWeight: 485 }}>After your reveal</th>
                  <th style={{ padding: "8px", fontWeight: 485 }}>After the close</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Price and quantity", false, true, true],
                  ["Deposit amount", !CONFIDENTIAL, true, true],
                  ["Side (buy or sell)", true, true, true],
                  ["Who you are (address)", true, true, true],
                ].map(([row, ...cells]) => (
                  <tr key={row as string} style={{ borderTop: "1px solid #F0F0F0" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 535 }}>{row as string}</td>
                    {(cells as boolean[]).map((pub, i) => (
                      <td key={i} style={{ padding: "10px 8px" }}>
                        <span style={{ borderRadius: "999px", padding: "3px 10px", fontSize: "12px", background: pub ? "#F9F9F9" : "#FFEFFF", color: pub ? "#7D7D7D" : "#FC72FF", border: `1px solid ${pub ? "#F0F0F0" : "#FFD6FF"}` }}>{pub ? "public" : "hidden"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {CONFIDENTIAL && <span style={{ fontSize: "12px", color: "#7D7D7D" }}>"Hidden" means hidden from everyone on-chain. The demo settlement server can see deposit amounts.</span>}
        </section>

        <section aria-label="Why fake depth fails" style={{ ...cardStyle, flexDirection: "row", flexWrap: "wrap", gap: "24px", alignItems: "center" }}>
          <svg viewBox="0 0 640 200" role="img" aria-label="An attacker sells into their own locked buy order; depth drops from 30,000 to 20,000" style={{ flex: '1 1 520px', minWidth: '0', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <line x1="200" y1="180" x2="440" y2="180" stroke="#F0F0F0" strokeWidth="2" />
      <rect className="depth" x="270" y="30" width="100" height="150" rx="10" fill="#FFD6FF" stroke="#FC72FF" strokeWidth="2" />
      <text className="l1" x="320" y="22" textAnchor="middle" fontSize="15" fontWeight="600" fill="#131313">Depth 30,000</text>
      <text className="l2" x="320" y="72" textAnchor="middle" fontSize="15" fontWeight="600" fill="#131313">Depth 20,000</text>
      <g className="attack"><rect x="40" y="80" width="150" height="50" rx="25" fill="#FDECEC" stroke="#E5484D" /><text x="115" y="110" textAnchor="middle" fontSize="14" fill="#D93A3A">Sells 10,000 to own order</text></g>
      <text x="470" y="90" fontSize="13" fill="#7D7D7D">Their locked buy order</text>
      <text x="470" y="110" fontSize="13" fill="#7D7D7D">gets used up.</text>
      </svg>
          <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontWeight: 600, fontSize: "17px" }}>Why depth can't be faked</span>
            <span style={{ fontSize: "14px", color: "#4A4A4A" }}>Depth only counts buy orders locked for {days} days. Selling into your own order fills it and removes it from the book, so self-trading can only make depth smaller, never bigger. And lenders use the lowest depth over a window, so a short burst of orders does not count.</span>
          </div>
        </section>

        <section aria-label="What to trust" style={{ ...cardStyle, background: "#FFFAF0", border: "1px solid #F0D9A8" }}>
          <h2 style={h2}>What you are trusting in this demo</h2>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "14px", color: "#4A4A4A", lineHeight: 1.7 }}>
            <li>Stellar testnet, demo tokens with no value. The NAV and the thin-DEX price are demo feeds we set.</li>
            {CONFIDENTIAL && <li>The settlement server sees deposit amounts and proves payouts; the contract limits where funds can go.</li>}
            <li>Order proofs are zero-knowledge and checked in your browser; {CONFIDENTIAL ? "confidential-token proofs are checked on-chain but are not zero-knowledge until Soroban's verifier supports it." : "the contract re-checks funding at reveal."}</li>
            <li>Every on-chain step links to its transaction on stellar.expert, so you can check it.</li>
          </ul>
        </section>

        {(VERIFIER_DEMO || presenter) && <VerifierDemo />}
      </main>
    </Page>
  );
}

const SEAL = (<svg viewBox="0 0 560 220" role="img" aria-label="Your order goes into a sealed envelope; a proof shows you can pay" style={{ width: '100%', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <g className="slide"><rect x="40" y="70" width="150" height="80" rx="14" fill="#FFFFFF" stroke="#F0F0F0" /><text x="58" y="102" fontSize="14" fill="#7D7D7D">Buy</text><text x="58" y="128" fontSize="18" fontWeight="600" fill="#131313">30,000 @ $1.04</text></g>
      <g transform="translate(250 60)">
      <rect x="0" y="20" width="140" height="90" rx="10" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
      <path className="flap" d="M0 20 L70 70 L140 20" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" />
      <rect x="58" y="72" width="24" height="20" rx="4" fill="#FC72FF" /><path d="M63 72 v-6 a7 7 0 0 1 14 0 v6" fill="none" stroke="#FC72FF" strokeWidth="2.5" />
      </g>
      <text className="hash" x="320" y="198" textAnchor="middle" fontSize="13" fill="#7D7D7D">fingerprint 0x1f9a…c3e2 posted on-chain</text>
      <g transform="translate(440 60)"><g className="pop" style={{ transformBox: "fill-box" }}><circle cx="45" cy="55" r="40" fill="#EEF9F1" /><path d="M27 56 l12 12 l24 -26" fill="none" stroke="#40B66B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></g></g>
      </svg>);
const CLOSE = (<svg viewBox="0 0 560 220" role="img" aria-label="At the close envelopes open; buy and sell lines cross at $1.04" style={{ width: '100%', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <g className="env"><rect x="30" y="20" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" /><rect x="76" y="20" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" /><rect x="122" y="20" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" /><rect x="168" y="20" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" /></g>
      <line x1="40" y1="200" x2="530" y2="200" stroke="#F0F0F0" />
      <path className="draw" d="M60 70 H280 V120 H420 V200" fill="none" stroke="#FC72FF" strokeWidth="4" />
      <path className="draw" d="M60 150 H280 V90 H420" fill="none" stroke="#131313" strokeWidth="4" />
      <circle className="dot" cx="280" cy="110" r="9" fill="#FC72FF" />
      <circle className="ring" cx="280" cy="110" r="9" fill="none" stroke="#FC72FF" strokeWidth="2" />
      <text className="dot" x="296" y="140" fontSize="16" fontWeight="600" fill="#131313">$1.04 · 30,000</text>
      <text x="430" y="40" fontSize="12" fill="#FC72FF">buyers</text><text x="430" y="58" fontSize="12" fill="#131313">sellers</text>
      </svg>);
const PUBLISH = (<svg viewBox="0 0 560 220" role="img" aria-label="Fathom sends price and depth to lending pools and a DEX" style={{ width: '100%', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <path id="p1" d="M150 110 C 260 110, 300 45, 410 45" fill="none" stroke="#F0F0F0" strokeWidth="3" />
      <path id="p2" d="M150 110 L410 110" fill="none" stroke="#F0F0F0" strokeWidth="3" />
      <path id="p3" d="M150 110 C 260 110, 300 175, 410 175" fill="none" stroke="#F0F0F0" strokeWidth="3" />
      <circle r="6" fill="#FC72FF"><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#p1" /></animateMotion></circle>
      <circle r="6" fill="#FC72FF"><animateMotion dur="2.4s" begin="0.8s" repeatCount="indefinite"><mpath href="#p2" /></animateMotion></circle>
      <circle r="6" fill="#FC72FF"><animateMotion dur="2.4s" begin="1.6s" repeatCount="indefinite"><mpath href="#p3" /></animateMotion></circle>
      <circle className="ring" cx="100" cy="110" r="40" fill="none" stroke="#FC72FF" strokeWidth="2" />
      <circle cx="100" cy="110" r="46" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" />
      <text x="100" y="105" textAnchor="middle" fontSize="14" fontWeight="600" fill="#131313">Fathom</text>
      <text x="100" y="124" textAnchor="middle" fontSize="11" fill="#7D7D7D">price · depth</text>
      <g fontSize="13" fill="#131313">
      <rect x="410" y="28" width="130" height="34" rx="17" fill="#FFFFFF" stroke="#F0F0F0" /><text x="475" y="50" textAnchor="middle">Blend pool</text>
      <rect x="410" y="93" width="130" height="34" rx="17" fill="#FFFFFF" stroke="#F0F0F0" /><text x="475" y="115" textAnchor="middle">Lending pool B</text>
      <rect x="410" y="158" width="130" height="34" rx="17" fill="#FFFFFF" stroke="#F0F0F0" /><text x="475" y="180" textAnchor="middle">DEX router</text>
      </g>
      </svg>);

const DEPOSIT_CONF = (
  <svg viewBox="0 0 560 220" role="img" aria-label="USDC is wrapped into a confidential token and sent to the auction; the amount is hidden" style={art}>
    <g transform="translate(90 110)">
      <circle r="30" fill="none" stroke="#F0F0F0" strokeWidth="2" strokeDasharray="4 5" />
      <g style={{ animation: "chCoinIn 3s ease-in-out infinite" }}><circle r="30" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" /><text y="7" textAnchor="middle" fontSize="20" fontWeight="700" fill="#FC72FF">$</text></g>
      <text y="56" textAnchor="middle" fontSize="12" fill="#7D7D7D">USDC (public)</text>
    </g>
    <g transform="translate(240 110)">
      <rect x="-46" y="-36" width="92" height="72" rx="18" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" style={{ animation: "chGlow 3s ease-in-out infinite" }} />
      <text y="5" textAnchor="middle" fontSize="13" fontWeight="600" fill="#FC72FF">wrap</text>
    </g>
    <g transform="translate(380 110)">
      <g style={{ animation: "chCoinOut 3s ease-in-out infinite" }}><circle r="30" fill="#FC72FF" /><text y="7" textAnchor="middle" fontSize="20" fontWeight="700" fill="#FFFFFF">c</text></g>
      <text y="56" textAnchor="middle" fontSize="12" fill="#7D7D7D">cUSDC · ••••</text>
    </g>
    <path d="M415 110 H470" stroke="#FC72FF" strokeWidth="2" strokeDasharray="5 6" />
    <g transform="translate(500 110)"><rect x="-26" y="-22" width="52" height="44" rx="10" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" /><text y="5" textAnchor="middle" fontSize="11" fill="#131313">auction</text></g>
    <text x="40" y="34" fontSize="13" fill="#7D7D7D">Amount hidden in a commitment</text>
    <text x="520" y="34" textAnchor="end" fontSize="13" fill="#40B66B">Side visible</text>
  </svg>
);

const DEPOSIT_FIXED = (
  <svg viewBox="0 0 560 220" role="img" aria-label="Coins fall into a vault; the deposit is one of a few fixed sizes" style={art}>
    <g transform="translate(280 0)">
      <circle className="coin" cx="-40" cy="90" r="16" fill="#FFD6FF" stroke="#FC72FF" strokeWidth="2" />
      <circle className="coin2" cx="0" cy="90" r="16" fill="#FFD6FF" stroke="#FC72FF" strokeWidth="2" />
      <circle className="coin3" cx="40" cy="90" r="16" fill="#FFD6FF" stroke="#FC72FF" strokeWidth="2" />
      <rect className="vault" x="-110" y="110" width="220" height="90" rx="18" fill="#FFFFFF" stroke="#F0F0F0" strokeWidth="3" />
      <text x="0" y="148" textAnchor="middle" fontSize="13" fill="#7D7D7D">Locked USDC · fixed size</text>
      <text x="0" y="178" textAnchor="middle" fontSize="24" fontWeight="600" fill="#131313" letterSpacing="1">50,000</text>
    </g>
    <text x="40" y="40" fontSize="13" fill="#7D7D7D">Price and quantity hidden</text>
    <text x="520" y="40" textAnchor="end" fontSize="13" fill="#40B66B">Side and size visible</text>
  </svg>
);

const REVEAL = (
  <svg viewBox="0 0 560 220" role="img" aria-label="The envelope opens and the order is checked against its fingerprint" style={art}>
    <g transform="translate(120 50)">
      <rect x="0" y="20" width="140" height="90" rx="10" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
      <path d="M0 20 L70 70 L140 20" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" style={{ transformOrigin: "70px 20px", animation: "flapOpen 4s ease-in-out infinite" }} />
      <g style={{ animation: "cardOut 4s ease-in-out infinite" }}>
        <rect x="20" y="30" width="100" height="44" rx="8" fill="#FFFFFF" stroke="#F0F0F0" />
        <text x="70" y="57" textAnchor="middle" fontSize="13" fontWeight="600" fill="#131313">Buy 30,000 ≤ $1.04</text>
      </g>
    </g>
    <path d="M290 110 H340" stroke="#FC72FF" strokeWidth="2" strokeDasharray="5 6" />
    <g transform="translate(360 64)">
      {["matches fingerprint", "deposit covers it", "on the price grid"].map((t, i) => (
        // Position outside, animate inside (a CSS animation replaces the transform attribute).
        <g key={t} transform={`translate(0 ${i * 34})`}>
          <g style={{ animation: `checkIn 4s ease-out ${0.4 + i * 0.3}s infinite both` }}>
            <circle cx="10" cy="10" r="10" fill="#EEF9F1" /><path d="M5 10 l3.5 3.5 l6.5 -7" fill="none" stroke="#40B66B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <text x="28" y="15" fontSize="13" fill="#131313">{t}</text>
          </g>
        </g>
      ))}
    </g>
  </svg>
);

const PAYOUTS = (
  <svg viewBox="0 0 560 220" role="img" aria-label="The auction pays fills and refunds back to each order's owner" style={art}>
    <g transform="translate(110 110)">
      <rect x="-60" y="-40" width="120" height="80" rx="16" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
      <text y="-6" textAnchor="middle" fontSize="14" fontWeight="600" fill="#131313">Auction</text>
      <text y="16" textAnchor="middle" fontSize="11" fill="#7D7D7D">checks every amount</text>
    </g>
    {[60, 110, 160].map((y, i) => (
      <g key={y}>
        <path d={`M175 110 C 260 110, 280 ${y}, 380 ${y}`} fill="none" stroke="#FFD6FF" strokeWidth="3" />
        <circle r="8" fill="#FC72FF"><animateMotion dur="2.4s" begin={`${i * 0.6}s`} repeatCount="indefinite" path={`M175 110 C 260 110, 280 ${y}, 380 ${y}`} /></circle>
        <g transform={`translate(440 ${y})`}>
          <rect x="-50" y="-17" width="100" height="34" rx="17" fill="#FFFFFF" stroke="#F0F0F0" />
          <text y="5" textAnchor="middle" fontSize="12" fill="#131313">{["buyer: USTRY", "seller: USDC", "refund"][i]}</text>
        </g>
      </g>
    ))}
  </svg>
);
