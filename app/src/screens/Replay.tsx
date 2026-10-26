// Attack demo: the February 2026 pattern as a guided six-step story, Pool A vs Pool B.
// With ?demo each step runs on testnet through the demo server and the numbers shown are
// live reads. Without it, DEX and Pool A figures are the replay scenario (labelled simulated);
// Fathom price, depth and Pool B's verdict are always live reads (Pool B `assess`).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Header, Page } from "../components/Header";
import { PageIntro } from "../components/PageIntro";
import { Slice, TxLine, type TxState } from "../components/State";
import { SET_BY_US } from "../config";
import { DEX_TITLE, SetByUs } from "../components/SetByUs";
import { demo, usePresenter, type DemoStep } from "../demo/api";
import type { ReplayView } from "../data/types";
import { useFathom } from "../data/useFathom";
import { fmtInt, fmtK, fmtUsd } from "../lib/format";

const txLink: CSSProperties = { fontSize: "12px", color: "#FC72FF" };
const src: CSSProperties = { color: "#535353" };
/** Sources for the real-event facts (read 2026-10-26). */
const SOURCES = {
  halborn: "https://www.halborn.com/blog/post/explained-the-yieldblox-hack-february-2026",
  protos: "https://protos.com/yieldblox-lending-pool-hit-by-10m-hack-on-stellar/",
  rekt: "https://rekt.news/yieldblox-rekt",
};
const REAL_EVENT_NOTE = "YieldBlox DAO pool on Blend V2, 22 Feb 2026, 00:25 UTC: about $10–11M drained, about $7M frozen by Stellar Tier-1 validators (Halborn, Protos, Rekt).";

export function Replay() {
  const { replay } = useFathom();
  return (
    <Page minHeight={980}>
      <Header />
      <PageIntro width={1360} pad={32} title="Attack demo" what="A real-world style attack, replayed on testnet: one trade pumps a thin DEX and drains a lending pool." why="Pool A trusts the DEX price and is drained; Pool B uses Fathom’s price and depth cap and rejects the same loan." />
      <Slice of={replay} label="the replay" minHeight={400}>{(r) => <ReplayRoom r={r} />}</Slice>
    </Page>
  );
}

function ReplayRoom({ r }: { r: ReplayView }) {
  const { refresh, liquidity } = useFathom();
  const medianWindow = liquidity.status === "ready" ? liquidity.data.medianWindow : 7;
  const [params, setParams] = useSearchParams();
  const [s, setS] = useState(0); // chain state: 0 before pump, 1 pumped, 2 asked, 3 both pools answered
  const [k, setK] = useState(0); // story step shown, 0..5
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const [links, setLinks] = useState<{ pump?: DemoStep; poolA?: DemoStep; poolB?: DemoStep }>({});
  const live = usePresenter(); // live testnet run only for the presenter (demo token)
  const base = "USTRY";
  const a = r.assessment;
  const dexStart = SET_BY_US.dexStart;
  const factor = Number((r.pumpPrice / dexStart).toPrecision(2));
  const ltv = r.ltvPct / 100;
  const aValue = r.collateral * r.pumpPrice;
  const bValue = r.collateral * r.fathomPrice;
  const poolATvl = live ? r.poolATvl : s === 3 ? 0 : r.poolTvl;

  // Chain transitions (live: real testnet transactions through the demo server).
  const advance = useCallback(async (from: number) => {
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
      throw e;
    }
  }, [live, refresh]);

  // Story step k needs chain state NEED[k]; moving forward runs whatever is missing.
  const NEED = [0, 1, 2, 3, 3, 3];
  const goTo = async (next: number) => {
    next = Math.max(0, Math.min(5, next));
    try {
      for (let st = s; st < NEED[next]; st++) await advance(st);
      setK(next);
    } catch { /* error shown in the tx line */ }
  };
  const reset = async () => {
    setS(0); setK(0); setLinks({});
    if (!live) return;
    setTx({ status: "pending", label: "Resetting the DEX price and refilling the pools" });
    try { await demo.replay(0); setTx({ status: "idle" }); refresh(); }
    catch (e) { setTx({ status: "error", error: e instanceof Error ? e.message : String(e) }); }
  };

  // "Run attack replay" from the demo bar: walk the story with pauses for narration.
  const autorun = useRef(false);
  useEffect(() => {
    if (!params.has("autorun") || autorun.current) return;
    autorun.current = true;
    setParams({}, { replace: true });
    void (async () => {
      for (let n = 1; n <= 5; n++) { await goTo(n); await new Promise((ok) => setTimeout(ok, 3500)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, setParams]);

  const busy = tx.status === "pending";
  const reasons = [
    a.reasons.includes("NoPrice") && "Fathom publishes no price for USTRY right now, so Pool B lends nothing against it.",
    a.reasons.includes("InsufficientCollateral") && `Collateral worth ${fmtUsd(a.collateralValue, 0)} at the Fathom price allows ${fmtUsd(a.maxLoan, 0)}, not ${fmtUsd(a.requested, 0)}.`,
    a.reasons.includes("DepthTooLow") && `Depth cap: ${fmtInt(a.cap)} ${base} accepted in total (${r.capSharePct}% of the lowest depth, ${fmtInt(a.minDepthWindow)}), ${fmtInt(a.collateralAfter)} asked.`,
  ].filter(Boolean) as string[];

  const steps: { short: string; title: string; body: ReactNode; art: ReactNode; link?: DemoStep }[] = [
    {
      short: "Thin market", title: `${base} trades on a very thin DEX`,
      body: <>On the DEX, {base} last traded at {fmtUsd(dexStart)} <SetByUs title={DEX_TITLE} />. In the real event the pair had <b>less than $1 of trading per hour</b>, so a single trade can set any price it wants.</>,
      art: <ArtThin price={fmtUsd(dexStart)} />,
    },
    {
      short: "The pump", title: `One trade pushes the price ${factor}×`,
      body: <>The attacker makes one small trade at {fmtUsd(r.pumpPrice, 0)}. The DEX's "last price" is now {factor}× what {base} is worth. Nothing about {base} itself changed.</>,
      art: <ArtPump from={fmtUsd(dexStart)} to={fmtUsd(r.pumpPrice, 0)} />, link: links.pump,
    },
    {
      short: "The ask", title: "The attacker asks both pools for a loan",
      body: <>They post {fmtInt(r.collateral)} {base} as collateral (really worth about {fmtUsd(bValue, 0)}) and ask <b>each pool for {fmtUsd(r.borrow, 0)}</b>. Both pools lend up to {r.ltvPct}% of the collateral's value. Only the price they use differs.</>,
      art: <ArtAsk qty={fmtInt(r.collateral)} borrow={fmtUsd(r.borrow, 0)} />,
    },
    {
      short: "Pool A", title: "Pool A uses the DEX price and is drained",
      body: <>Pool A values the collateral at the last DEX trade: {fmtInt(r.collateral)} × {fmtUsd(r.pumpPrice, 0)} = <b>{fmtUsd(aValue, 0)}</b>. At {r.ltvPct}% it may lend {fmtUsd(aValue * ltv, 0)}, so the {fmtUsd(r.borrow, 0)} loan is approved. The attacker leaves with the pool's money and the collateral is worth almost nothing.</>,
      art: <ArtMath tone="bad" lines={[`${fmtInt(r.collateral)} × ${fmtUsd(r.pumpPrice, 0)}`, `= ${fmtUsd(aValue, 0)} collateral`, `× ${r.ltvPct}% = ${fmtUsd(aValue * ltv, 0)} limit`]} verdict={`Lends ${fmtUsd(r.borrow, 0)} · drained`} />, link: links.poolA,
    },
    {
      short: "Pool B", title: "Pool B uses Fathom and says no",
      body: <>Pool B values the collateral at Fathom's price, the median of the last {medianWindow} sealed auctions, which one DEX trade cannot move: {fmtInt(r.collateral)} × {fmtUsd(r.fathomPrice)} = <b>{fmtUsd(bValue, 0)}</b>, so at most {fmtUsd(bValue * ltv, 0)}. It also caps how much {base} it accepts by Fathom's depth. <b>Rejected</b>{live ? ", and the rejection is recorded on-chain." : ". When run on testnet (?demo), the rejection is recorded on-chain."}{reasons.length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: "18px" }}>{reasons.map((t) => <li key={t}>{t}</li>)}</ul>}</>,
      art: <ArtMath tone="good" lines={[`${fmtInt(r.collateral)} × ${fmtUsd(r.fathomPrice)}`, `= ${fmtUsd(bValue, 0)} collateral`, `× ${r.ltvPct}% = ${fmtUsd(bValue * ltv, 0)} max`]} verdict="Borrow rejected" />, link: links.poolB,
    },
    {
      short: "Outcome", title: "Same attack, two outcomes",
      body: <>Pool A lost {fmtUsd(r.borrow, 0)}. Pool B lost nothing. The only difference was the price source. In February 2026 this pattern drained about $10–11M from a real Stellar lending pool.<sup><a href="#sources" style={{ color: "#7D7D7D" }}>1</a></sup></>,
      art: <ArtOutcome a={poolATvl} b={r.poolTvl} max={r.poolTvl} />,
    },
  ];
  const cur = steps[k];
  const btn: CSSProperties = { border: "1px solid #F0F0F0", background: "#FFFFFF", borderRadius: "12px", padding: "10px 14px", fontSize: "14px", cursor: "pointer", fontFamily: "inherit" };

  return (
    <main style={{ maxWidth: "1360px", margin: "0 auto", padding: "24px 32px 48px", display: "flex", flexDirection: "column", gap: "20px" }}>

      <section aria-label="The attack, step by step" style={{ ...card, display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>The February attack, step by step</h2>
          <span style={{ fontSize: "12px", color: live ? "#40B66B" : "#B7791F" }}>{live ? "Live on testnet: steps 2, 4 and 5 send real transactions." : "Simulated: DEX and Pool A numbers are the scenario; Fathom and Pool B numbers are live reads."}</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
            <button type="button" style={btn} disabled={busy || k === 0} onClick={() => void goTo(k - 1)}>‹ Back</button>
            <button type="button" style={{ ...btn, background: "#FC72FF", color: "#FFFFFF", border: "none", fontWeight: 600 }} disabled={busy || k === 5} onClick={() => void goTo(k + 1)}>{busy ? "Running on testnet…" : k === 0 ? "Start the attack ›" : "Next ›"}</button>
            <button type="button" style={btn} disabled={busy} onClick={() => void reset()}>Reset</button>
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "14px", color: "#4A4A4A" }}>
          Two pools, same {fmtUsd(r.poolTvl, 0)} and same rule (lend up to {r.ltvPct}% of the collateral's value). Only the price source differs:{" "}
          <b style={{ color: "#E5484D" }}>Pool A</b> reads the last DEX trade; <b style={{ color: "#40B66B" }}>Pool B</b> reads Fathom (median of {medianWindow} sealed auctions + depth cap).
        </p>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "6px" }}>
          {steps.map((st, i) => {
            const done = i < k, on = i === k;
            const col = i === 3 && done ? "#E5484D" : i === 4 && done ? "#40B66B" : "#FC72FF";
            return (
              <li key={st.short}>
                <button type="button" disabled={busy} onClick={() => void goTo(i)} aria-current={on ? "step" : undefined} style={{ width: "100%", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                  <span style={{ height: "6px", borderRadius: "3px", background: done || on ? col : "#F0F0F0", transition: "background .4s" }} />
                  <span style={{ fontSize: "12px", color: on ? "#131313" : "#7D7D7D", fontWeight: on ? 600 : 485 }}>{i + 1}. {st.short}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <TxLine s={tx} />
        <div key={k} className="fade" style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center" }}>
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>{cur.art}</div>
          <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "#FC72FF", fontWeight: 600 }}>Step {k + 1} of 6</span>
            <span style={{ fontSize: "22px", fontWeight: 600 }}>{cur.title}</span>
            <span style={{ fontSize: "15px", color: "#4A4A4A", lineHeight: 1.55 }}>{cur.body}</span>
            {cur.link?.link && <a href={cur.link.link} target="_blank" rel="noreferrer" style={txLink}>{cur.link.label} · stellar.expert</a>}
          </div>
        </div>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        <Status name="Pool A" sees={s >= 1 ? fmtUsd(live ? r.dexStart : r.pumpPrice, 0) : fmtUsd(dexStart)} tvl={poolATvl} max={r.poolTvl} state={s === 3 ? "Drained" : s >= 1 ? "Sees a price spike" : "Normal"} tone={s === 3 ? "bad" : s >= 1 ? "warn" : "ok"} />
        <Status name="Pool B" sees={fmtUsd(r.fathomPrice)} tvl={r.poolTvl} max={r.poolTvl} state={s === 3 ? "Rejected the loan" : "Normal"} tone="ok" />
      </div>

      <p id="sources" style={{ margin: 0, fontSize: "12px", color: "#7D7D7D" }}>
        1. {REAL_EVENT_NOTE} USTRY moved from about $1.06 to about $106 on a pair with less than $1 of hourly volume. Sources:{" "}
        <a href={SOURCES.halborn} target="_blank" rel="noreferrer" style={src}>Halborn</a>, <a href={SOURCES.protos} target="_blank" rel="noreferrer" style={src}>Protos</a>, <a href={SOURCES.rekt} target="_blank" rel="noreferrer" style={src}>Rekt</a>.
        {" "}Attack inputs are ours <SetByUs what="attack scenario" />.
      </p>
    </main>
  );
}

const card: CSSProperties = { background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "24px", padding: "20px" };
const TONE = { good: ["#40B66B", "#EEF9F1"], bad: ["#E5484D", "#FDECEC"], warn: ["#B7791F", "#FFF6E0"], ok: ["#40B66B", "#EEF9F1"] } as const;

function Status({ name, sees, tvl, max, state, tone }: { name: string; sees: string; tvl: number; max: number; state: string; tone: keyof typeof TONE }) {
  const [c, bg] = TONE[tone];
  return (
    <section aria-label={name} style={{ ...card, flex: "1 1 420px", display: "flex", flexDirection: "column", gap: "10px", borderColor: tone === "bad" ? c : "#F0F0F0", animation: tone === "bad" ? "shake .5s ease-in-out" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontWeight: 600, fontSize: "18px" }}>{name}</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: c, background: bg, borderRadius: "999px", padding: "4px 10px" }}>{state}</span>
      </div>
      <div style={{ display: "flex", gap: "24px", fontVariantNumeric: "tabular-nums" }}>
        <span><span style={{ fontSize: "12px", color: "#7D7D7D", display: "block" }}>USTRY price it sees</span><span style={{ fontSize: "24px", color: tone === "ok" ? "#131313" : c }}>{sees}</span></span>
        <span><span style={{ fontSize: "12px", color: "#7D7D7D", display: "block" }}>Money left in the pool</span><span style={{ fontSize: "24px" }}>{tvl < 1 ? "$0" : `$${fmtK(tvl)}`}</span></span>
      </div>
      <div style={{ height: "10px", borderRadius: "5px", background: "#F0F0F0", overflow: "hidden" }}><div style={{ height: "100%", width: `${(tvl / max) * 100}%`, background: tone === "bad" ? "#E5484D" : "#40B66B", transition: "width 1.8s ease-in" }} /></div>
    </section>
  );
}

// ---------------------------------------------------------------- step illustrations
const ART: CSSProperties = { width: "100%", height: "auto", background: "#F9F9F9", borderRadius: "16px" };

function ArtThin({ price }: { price: string }) {
  return (
    <svg viewBox="0 0 560 220" role="img" aria-label="A thin DEX order book with almost no volume" style={ART}>
      <text x="30" y="36" fontSize="13" fill="#7D7D7D">DEX · USTRY/USDC</text>
      <g transform="translate(280 110)">
        <rect x="-90" y="-40" width="180" height="80" rx="16" fill="#FFFFFF" stroke="#F0F0F0" />
        <text y="-6" textAnchor="middle" fontSize="13" fill="#7D7D7D">last trade</text>
        <text y="22" textAnchor="middle" fontSize="26" fontWeight="600" fill="#131313">{price}</text>
      </g>
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={70 + i * 70} y={200 - (i % 3 === 0 ? 6 : 3)} width="40" height={i % 3 === 0 ? 6 : 3} rx="1.5" fill="#FFD6FF" style={{ animation: `fadeUp .6s ease-out ${i * 0.1}s both` }} />)}
      <text x="280" y="190" textAnchor="middle" fontSize="12" fill="#D93A3A">hourly volume: under $1</text>
    </svg>
  );
}

function ArtPump({ from, to }: { from: string; to: string }) {
  return (
    <svg viewBox="0 0 560 220" role="img" aria-label={`The DEX price jumps from ${from} to ${to} on one trade`} style={ART}>
      <line x1="30" y1="190" x2="530" y2="190" stroke="#E5E5E5" />
      <path className="draw" style={{ "--len": 900 } as CSSProperties} d="M30 186 L150 187 L250 185 L330 186 L345 40 L530 40" fill="none" stroke="#E5484D" strokeWidth="3" />
      <g transform="translate(345 40)"><circle r="7" fill="#E5484D" className="pop" style={{ transformBox: "fill-box", animationDelay: "1.2s" }} /></g>
      <text x="30" y="176" fontSize="13" fill="#7D7D7D">{from}</text>
      <text className="fade" style={{ animationDelay: "1.3s" }} x="360" y="70" fontSize="22" fontWeight="700" fill="#D93A3A">{to}</text>
      <text className="fade" style={{ animationDelay: "1.5s" }} x="360" y="92" fontSize="12" fill="#7D7D7D">after one trade</text>
    </svg>
  );
}

function ArtAsk({ qty, borrow }: { qty: string; borrow: string }) {
  return (
    <svg viewBox="0 0 560 220" role="img" aria-label="The attacker posts collateral and asks both pools for a loan" style={ART}>
      <g transform="translate(110 110)">
        <circle r="34" fill="#FFFFFF" stroke="#131313" strokeWidth="2" />
        <text y="6" textAnchor="middle" fontSize="13" fontWeight="600" fill="#131313">attacker</text>
        <text y="56" textAnchor="middle" fontSize="12" fill="#7D7D7D">{qty} USTRY</text>
      </g>
      {[[60, "Pool A", "#E5484D"], [160, "Pool B", "#40B66B"]].map(([y, n, c]) => (
        <g key={n as string}>
          <path d={`M150 110 C 240 110, 260 ${y}, 380 ${y}`} fill="none" stroke="#FFD6FF" strokeWidth="3" />
          <circle r="6" fill="#FC72FF"><animateMotion dur="1.8s" repeatCount="indefinite" path={`M150 110 C 240 110, 260 ${y}, 380 ${y}`} /></circle>
          <g transform={`translate(450 ${y})`}>
            <rect x="-62" y="-24" width="124" height="48" rx="14" fill="#FFFFFF" stroke={c as string} strokeWidth="2" />
            <text y="-3" textAnchor="middle" fontSize="14" fontWeight="600" fill="#131313">{n}</text>
            <text y="15" textAnchor="middle" fontSize="11" fill="#7D7D7D">asked {borrow}</text>
          </g>
        </g>
      ))}
    </svg>
  );
}

function ArtMath({ lines, verdict, tone }: { lines: string[]; verdict: string; tone: "good" | "bad" }) {
  const [c, bg] = TONE[tone];
  return (
    <svg viewBox="0 0 560 220" role="img" aria-label={`${lines.join(" ")}: ${verdict}`} style={ART}>
      <rect x="40" y="24" width="300" height="172" rx="16" fill="#FFFFFF" stroke="#F0F0F0" />
      {lines.map((t, i) => (
        <g key={t} transform={`translate(60 ${64 + i * 44})`}>
          <text className="fade" style={{ animationDelay: `${0.2 + i * 0.5}s` }} fontSize={i === 0 ? 20 : 18} fontWeight={i === 2 ? 700 : 500} fill="#131313">{t}</text>
        </g>
      ))}
      <g transform="translate(450 110)">
        <g className="pop" style={{ transformBox: "fill-box", animationDelay: "1.8s" }}>
          <circle r="62" fill={bg} stroke={c} strokeWidth="3" />
          <text y="-4" textAnchor="middle" fontSize="28" fontWeight="700" fill={c}>{tone === "good" ? "✓" : "!"}</text>
          <text y="22" textAnchor="middle" fontSize="12" fontWeight="600" fill={c}>{verdict.split(" · ")[0]}</text>
          {verdict.includes(" · ") && <text y="38" textAnchor="middle" fontSize="12" fontWeight="600" fill={c}>{verdict.split(" · ")[1]}</text>}
        </g>
      </g>
    </svg>
  );
}

function ArtOutcome({ a, b, max }: { a: number; b: number; max: number }) {
  return (
    <svg viewBox="0 0 560 220" role="img" aria-label={`Pool A has ${fmtK(a)} left, Pool B ${fmtK(b)}`} style={ART}>
      {[["Pool A", a, "#E5484D", 70], ["Pool B", b, "#40B66B", 300]].map(([n, v, c, x]) => {
        const h = Math.max(4, ((v as number) / max) * 130);
        return (
          <g key={n as string} transform={`translate(${x} 0)`}>
            <rect x="40" y="40" width="110" height="130" rx="12" fill="#FFFFFF" stroke="#F0F0F0" />
            <rect x="40" y={170 - h} width="110" height={h} rx="12" fill={c as string} opacity=".85" style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "growY 1.2s ease-out both" }} />
            <text x="95" y="196" textAnchor="middle" fontSize="14" fontWeight="600" fill="#131313">{n}</text>
            <text x="95" y="30" textAnchor="middle" fontSize="13" fill={c as string}>{(v as number) < 1 ? "$0 left" : `$${fmtK(v as number)} left`}</text>
          </g>
        );
      })}
    </svg>
  );
}
