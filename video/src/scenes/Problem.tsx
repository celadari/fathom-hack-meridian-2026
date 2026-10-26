// 0:10–0:35. One trade on a thin DEX: $1.04 → $106; then what it cost in February 2026.
// Figures: $1.04 is the app's demo DEX start, $106 the replay's pump; "$10–11M", "Feb 2026" and
// "under $1 of hourly volume" from Halborn, Protos and Rekt (see the README).
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, page, s } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function Problem() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // chart: flat line draws in, then one trade spikes it
  const draw = interpolate(f, [s(0.5), s(4)], [0, 1], clamp);
  const spike = spring({ frame: f - s(4.5), fps, config: { damping: 9, stiffness: 120 } });
  const spikeY = interpolate(spike, [0, 1], [560, 150]);
  const priceLabel = spike > 0.5 ? "$106" : "$1.04";
  const vol = interpolate(f, [s(6), s(7)], [0, 1], clamp);
  // counter
  const chartOut = interpolate(f, [s(11), s(12)], [1, 0], clamp);
  const counterIn = interpolate(f, [s(12), s(12.8)], [0, 1], clamp);
  const n = interpolate(f, [s(12.8), s(17)], [0, 10], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const settled = f > s(17);
  const caption = interpolate(f, [s(17), s(18)], [0, 1], clamp);
  const sources = interpolate(f, [s(18.5), s(19.5)], [0, 1], clamp);
  const pathLen = 1200;
  return (
    <AbsoluteFill style={page}>
      <AbsoluteFill style={{ opacity: chartOut, padding: "90px 140px", gap: 20 }}>
        <div style={{ fontSize: 44, fontWeight: 700 }}>A lending pool prices USTRY from a thin DEX</div>
        <svg viewBox="0 0 1640 700" style={{ width: "100%", flex: 1 }}>
          <line x1={60} y1={600} x2={1600} y2={600} stroke={C.line} strokeWidth={3} />
          <path d={`M60 560 L500 562 L820 558 L1040 560`} fill="none" stroke={C.red} strokeWidth={8} strokeLinecap="round" strokeDasharray={pathLen} strokeDashoffset={pathLen * (1 - draw)} />
          {spike > 0.01 && <path d={`M1040 560 L1080 ${spikeY} L1600 ${spikeY}`} fill="none" stroke={C.red} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />}
          <circle cx={spike > 0.01 ? 1080 : 1040} cy={spike > 0.01 ? spikeY : 560} r={16} fill={C.red} opacity={draw} />
          <text x={spike > 0.01 ? 1110 : 1070} y={spike > 0.01 ? spikeY - 30 : 520} fontSize={90} fontWeight={800} fill={C.red} opacity={draw}>{priceLabel}</text>
          {spike > 0.3 && <text x={1110} y={spikeY + 50} fontSize={40} fill={C.grey}>after one trade</text>}
          <text x={60} y={540} fontSize={40} fill={C.grey} opacity={draw}>$1.04</text>
        </svg>
        <div style={{ alignSelf: "flex-start", fontSize: 46, fontWeight: 700, color: C.red, background: C.redSoft, border: `3px solid ${C.red}`, borderRadius: 999, padding: "12px 34px", opacity: vol, transform: `scale(${0.8 + vol * 0.2})` }}>
          under $1 of hourly volume
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: counterIn, alignItems: "center", justifyContent: "center", gap: 30 }}>
        <div style={{ fontSize: 250, fontWeight: 800, color: C.red, letterSpacing: -6, fontVariantNumeric: "tabular-nums" }}>
          {settled ? "$10–11M" : `$${n.toFixed(1)}M`}
        </div>
        <div style={{ fontSize: 58, fontWeight: 600, opacity: caption }}>drained from a Stellar lending pool · Feb 2026</div>
        <div style={{ fontSize: 30, color: C.grey, opacity: sources, marginTop: 30 }}>Sources: Halborn, Protos, Rekt</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
