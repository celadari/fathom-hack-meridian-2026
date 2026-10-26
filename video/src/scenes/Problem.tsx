// 0:02.5–0:30 (after the logo). "Can a lending pool trust this price?" as cause and effect: the pool asks a thin DEX,
// one trade sets the price, the pool lends against it and drains. Then what it cost in February 2026,
// and what was missing. Numbers: the attack replay's recorded values (V); "$10–11M", "Feb 2026" and
// "under $1 of hourly volume" from Halborn, Protos and Rekt.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { V } from "../data";
import { C, page, s } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], clamp);

function Arrow({ x1, y1, x2, y2, p, label, color = C.ink, below = false }: { x1: number; y1: number; x2: number; y2: number; p: number; label: string; color?: string; below?: boolean }) {
  const x = x1 + (x2 - x1) * p, y = y1 + (y2 - y1) * p;
  return (
    <g opacity={p > 0 ? 1 : 0}>
      <line x1={x1} y1={y1} x2={x} y2={y} stroke={color} strokeWidth={6} strokeLinecap="round" />
      {p > 0.95 && <path d={`M${x2} ${y2} l${x2 > x1 ? -22 : 22} -14 v28 z`} fill={color} />}
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + (below ? 52 : -24)} textAnchor="middle" fontSize={36} fontWeight={600} fill={color} opacity={p}>{label}</text>
    </g>
  );
}

export function Problem() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 0–2 s: the question, alone
  const q = spring({ frame: f, fps, config: { damping: 16 } });
  const qUp = ease(f, s(1.6), s(2.4)); // the question moves up to become the title
  // 2–7 s: pool asks the DEX; the DEX answers $1.04
  const nodes = spring({ frame: f - s(2), fps, config: { damping: 16 } });
  const ask = ease(f, s(2.6), s(3.6));
  const answer1 = ease(f, s(4.2), s(5));
  // 7–12 s: one trade sets $106
  const attacker = spring({ frame: f - s(7), fps, config: { damping: 14 } });
  const trade = ease(f, s(7.6), s(8.6));
  const pumped = f > s(8.6);
  const vol = spring({ frame: f - s(9.4), fps, config: { damping: 12 } });
  // 12–18 s: the pool believes it, lends, drains
  const answer2 = ease(f, s(12), s(12.8));
  const math = ease(f, s(13), s(14));
  const lend = ease(f, s(14.6), s(15.6));
  const drain = interpolate(f, [s(15.6), s(17.4)], [1, 0], { ...clamp, easing: (t) => t * t });
  const diagramOut = interpolate(f, [s(17.8), s(18.4)], [1, 0], clamp);
  // 18–22 s: what it cost
  const costIn = ease(f, s(18.4), s(19));
  const n = interpolate(f, [s(19), s(21.2)], [0, 10], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const costOut = interpolate(f, [s(21.6), s(22.2)], [1, 0], clamp);
  // 22–27.5 s: what was missing
  const miss = spring({ frame: f - s(22.3), fps, config: { damping: 16 } });
  const m1 = spring({ frame: f - s(23.2), fps, config: { damping: 14 } });
  const m2 = spring({ frame: f - s(24.3), fps, config: { damping: 14 } });

  const titleY = interpolate(qUp, [0, 1], [470, 80]);
  const titleSize = interpolate(qUp, [0, 1], [96, 60]);
  return (
    <AbsoluteFill style={page}>
      {/* the question, then the diagram's title */}
      <div style={{ position: "absolute", left: 0, right: 0, top: titleY, textAlign: "center", fontSize: titleSize, fontWeight: 800, opacity: q * diagramOut, transform: `scale(${0.9 + 0.1 * q})` }}>
        Can a lending pool trust this price?
      </div>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, opacity: nodes * diagramOut }}>
        {/* lending pool */}
        <g transform="translate(220 380)">
          <rect width={520} height={420} rx={36} fill="#fff" stroke={drain < 0.05 ? C.red : C.line} strokeWidth={5} />
          <text x={40} y={80} fontSize={52} fontWeight={800} fill={C.ink}>Lending pool</text>
          <text x={40} y={135} fontSize={32} fill={C.grey}>money it can lend</text>
          <rect x={40} y={170} width={440} height={56} rx={28} fill={C.line} />
          <rect x={40} y={170} width={440 * drain} height={56} rx={28} fill={drain < 0.05 ? C.red : C.green} />
          <text x={40} y={290} fontSize={64} fontWeight={800} fill={drain < 0.05 ? C.red : C.ink}>{drain < 0.05 ? V.poolALeft : V.poolBLeft}</text>
          <text x={40} y={350} fontSize={30} fill={C.grey} opacity={math}>{V.collateral} USTRY × {V.pump}</text>
          <text x={40} y={394} fontSize={34} fontWeight={700} fill={C.red} opacity={math}>= {V.inflated} collateral?</text>
        </g>
        {/* thin DEX */}
        <g transform="translate(1180 380)">
          <rect width={520} height={420} rx={36} fill="#fff" stroke={pumped ? C.red : C.line} strokeWidth={5} />
          <text x={40} y={80} fontSize={52} fontWeight={800} fill={C.ink}>Thin DEX</text>
          <text x={40} y={135} fontSize={32} fill={C.grey}>last trade price</text>
          <text x={40} y={260} fontSize={120} fontWeight={800} fill={pumped ? C.red : C.ink} opacity={answer1}>{pumped ? V.pump : V.dexStart}</text>
          <g transform={`translate(40 320) scale(${vol})`} opacity={vol}>
            <rect width={440} height={64} rx={32} fill={C.redSoft} stroke={C.red} strokeWidth={3} />
            <text x={220} y={43} textAnchor="middle" fontSize={30} fontWeight={700} fill={C.red}>under $1 of hourly volume</text>
          </g>
        </g>
        {/* attacker and the one trade */}
        <g transform={`translate(1440 250) scale(${attacker})`} opacity={attacker}>
          <circle r={68} fill="#fff" stroke={C.ink} strokeWidth={5} />
          <text y={10} textAnchor="middle" fontSize={26} fontWeight={700} fill={C.ink}>attacker</text>
        </g>
        <Arrow x1={1440} y1={320} x2={1440} y2={372} p={trade} label="" color={C.red} />
        <text x={1530} y={350} fontSize={34} fontWeight={700} fill={C.red} opacity={trade}>one trade</text>
        {/* questions and answers between pool and DEX */}
        <Arrow x1={745} y1={480} x2={1170} y2={480} p={ask} label="What is USTRY worth?" />
        <Arrow x1={1170} y1={600} x2={745} y2={600} p={answer2} label={`“${V.pump}”`} color={C.red} below />
        {/* the loan leaves the pool */}
        <g opacity={lend}>
          <path d="M480 805 C 480 920, 900 960, 1200 960" fill="none" stroke={C.red} strokeWidth={6} strokeDasharray="14 12" />
          <text x={760} y={1030} textAnchor="middle" fontSize={40} fontWeight={800} fill={C.red}>lends {V.lent} → attacker</text>
        </g>
      </svg>

      {/* the cost */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, opacity: costIn * costOut }}>
        <div style={{ fontSize: 250, fontWeight: 800, color: C.red, letterSpacing: -6, fontVariantNumeric: "tabular-nums" }}>{f > s(21.2) ? "$10–11M" : `$${n.toFixed(1)}M`}</div>
        <div style={{ fontSize: 58, fontWeight: 600 }}>drained from a Stellar lending pool · Feb 2026</div>
        <div style={{ fontSize: 28, color: C.grey, marginTop: 24 }}>Sources: Halborn, Protos, Rekt</div>
      </AbsoluteFill>

      {/* what was missing */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 44, opacity: miss }}>
        <div style={{ fontSize: 76, fontWeight: 800 }}>Two things were missing:</div>
        {[["a price one trade can’t move", m1], ["how much could really be sold", m2]].map(([t, a]) => (
          <div key={t as string} style={{ display: "flex", alignItems: "center", gap: 28, opacity: a as number, transform: `translateX(${(1 - (a as number)) * -40}px)` }}>
            <span style={{ width: 22, height: 22, borderRadius: 11, background: C.pink }} />
            <span style={{ fontSize: 64, fontWeight: 600, color: C.ink }}>{t as string}</span>
          </div>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
