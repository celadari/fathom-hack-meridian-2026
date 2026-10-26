// 0:30–0:50. Fathom: a sealed auction daily* (footnote: the testnet demo's auction length) whose result becomes the oracle.
// Three steps, each with its "why"; then the line lenders care about.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { V } from "../data";
import { C, page, s } from "../theme";

// Live testnet auction: 480 s order window + 120 s reveal (scripts/config.ts, confidential stack).
const DEMO_AUCTION_MIN = (480 + 120) / 60;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function Sealed({ p }: { p: number }) {
  const flap = interpolate(p, [0.2, 0.6], [-1, 1], clamp);
  return (
    <svg viewBox="0 0 300 200" width={300} height={200}>
      <rect x={40} y={40} width={220} height={140} rx={18} fill="#fff" stroke={C.pink} strokeWidth={6} />
      <path d="M40 40 L150 120 L260 40" fill={C.pinkSoft} stroke={C.pink} strokeWidth={6} style={{ transformOrigin: "150px 40px", transform: `scaleY(${flap})` }} />
      <g transform={`translate(150 135) scale(${interpolate(p, [0.6, 0.9], [0, 1], clamp)})`}>
        <path d="M-15 -6 v-12 a15 15 0 0 1 30 0 v12" fill="none" stroke={C.pink} strokeWidth={7} />
        <rect x={-22} y={-8} width={44} height={34} rx={7} fill={C.pink} />
      </g>
    </svg>
  );
}

function OnePrice({ p }: { p: number }) {
  const L = 700;
  const d = interpolate(p, [0, 0.7], [0, 1], clamp);
  return (
    <svg viewBox="0 0 300 200" width={300} height={200}>
      <path d="M20 30 H110 V70 H170 V110 H280" fill="none" stroke={C.pink} strokeWidth={8} strokeDasharray={L} strokeDashoffset={L * (1 - d)} />
      <path d="M20 180 H120 V150 H170 V110 H220 V50 H280" fill="none" stroke={C.ink} strokeWidth={8} strokeDasharray={L} strokeDashoffset={L * (1 - d)} />
      <circle cx={170} cy={110} r={interpolate(p, [0.7, 0.95], [0, 16], clamp)} fill={C.pink} />
    </svg>
  );
}

function Depth({ p }: { p: number }) {
  // unfilled orders stay committed; a self-trade fills one and it leaves the book: depth only goes down
  const shrink = interpolate(p, [0.6, 0.9], [1, 0], clamp);
  const bars = [90, 120, 70];
  return (
    <svg viewBox="0 0 300 200" width={300} height={200}>
      {bars.map((h, i) => {
        const hh = i === 1 ? h * shrink : h;
        return (
          <g key={i} transform={`translate(${40 + i * 80} ${180 - hh})`} opacity={interpolate(p, [i * 0.12, i * 0.12 + 0.2], [0, 1], clamp)}>
            <rect width={60} height={hh} rx={8} fill={C.pinkMid} stroke={C.pink} strokeWidth={4} />
            {hh > 30 && <text x={30} y={28} textAnchor="middle" fontSize={22}>🔒</text>}
          </g>
        );
      })}
      <text x={150} y={20} textAnchor="middle" fontSize={22} fill={C.red} fontWeight={700} opacity={interpolate(p, [0.5, 0.6], [0, 1], clamp)}>self-trade ↓</text>
    </svg>
  );
}

export function Idea() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame: f, fps, config: { damping: 16 } });
  const steps = [
    { t: "Sealed", why: "Nobody can trade against you.", C: Sealed, at: s(1.6) },
    { t: "One price", why: "Everyone fills at the same price.", C: OnePrice, at: s(5.2) },
    { t: "Depth", why: `Buy orders left unfilled, locked ${V.standingDays} days. Self-trading can only lower it.`, C: Depth, at: s(8.8) },
  ];
  const out = interpolate(f, [s(13.4), s(14)], [1, 0], clamp);
  const end = spring({ frame: f - s(14.2), fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={page}>
      <AbsoluteFill style={{ opacity: out, padding: "120px 110px 80px", gap: 50 }}>
        <div style={{ opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}>
          <div style={{ fontSize: 34, color: C.pink, fontWeight: 700, letterSpacing: 4 }}>THE IDEA</div>
          <div style={{ fontSize: 66, fontWeight: 800, marginTop: 10 }}>A sealed auction daily*; its result becomes the oracle.</div>
          <div style={{ fontSize: 30, color: C.grey, marginTop: 10 }}>*For the sake of the demo, our testnet implementation runs auctions every {DEMO_AUCTION_MIN} minutes.</div>
        </div>
        <div style={{ display: "flex", gap: 40, flex: 1 }}>
          {steps.map(({ t, why, C: Art, at }, i) => {
            const a = spring({ frame: f - at, fps, config: { damping: 15 } });
            const p = interpolate(f, [at, at + s(2.4)], [0, 1], clamp);
            return (
              <div key={t} style={{ flex: 1, background: "#fff", border: `3px solid ${a > 0.5 ? C.pink : C.line}`, borderRadius: 36, padding: "40px 36px", display: "flex", flexDirection: "column", alignItems: "center", gap: 22, opacity: a, transform: `translateY(${(1 - a) * 40}px)` }}>
                <span style={{ width: 70, height: 70, borderRadius: 35, background: C.pink, color: "#fff", fontSize: 40, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                <Art p={p} />
                <div style={{ fontSize: 56, fontWeight: 800 }}>{t}</div>
                <div style={{ fontSize: 36, color: C.grey, textAlign: "center", lineHeight: 1.3 }}>{why}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 26, opacity: end }}>
        <div style={{ fontSize: 104, fontWeight: 800, transform: `scale(${0.9 + 0.1 * end})`, textAlign: "center" }}>
          Price <span style={{ color: C.pink }}>+</span> depth,
        </div>
        <div style={{ fontSize: 64, fontWeight: 600, color: C.ink }}>read by any lender via <span style={{ color: C.pink, fontWeight: 800 }}>SEP-40</span></div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
