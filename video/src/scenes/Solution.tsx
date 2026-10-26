// 0:35–1:00. The same three visuals as the How it works page: Seal, Clear, Publish; then the end card.
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, page, s } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const STEP = s(6.4);

function Frame({ n, title, caption, children }: { n: number; title: string; caption: string; children: React.ReactNode }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame: f, fps, config: { damping: 18 } });
  const out = interpolate(f, [STEP - 10, STEP], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ ...page, padding: "80px 140px", gap: 24, opacity: out }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, transform: `translateY(${(1 - inn) * 30}px)`, opacity: inn }}>
        <span style={{ width: 84, height: 84, borderRadius: 42, background: C.pink, color: "#fff", fontSize: 48, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
        <span style={{ fontSize: 76, fontWeight: 800 }}>{title}</span>
      </div>
      <div style={{ flex: 1, background: "#F9F9F9", borderRadius: 40, border: `2px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
      <div style={{ fontSize: 48, fontWeight: 600, textAlign: "center" }}>{caption}</div>
    </AbsoluteFill>
  );
}

function Seal() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = interpolate(f, [s(0.6), s(2)], [0, 1], { ...clamp, easing: (t) => t * t });
  const flap = interpolate(f, [s(2), s(2.5)], [-1, 1], clamp);
  const lock = spring({ frame: f - s(2.6), fps, config: { damping: 9 } });
  return (
    <svg viewBox="0 0 1200 520" style={{ width: "80%" }}>
      <g transform={`translate(${80 + slide * 420} 190) scale(${1 - slide * 0.5})`} opacity={1 - slide * 0.9}>
        <rect width={300} height={140} rx={28} fill="#fff" stroke={C.line} strokeWidth={3} />
        <text x={36} y={60} fontSize={34} fill={C.grey}>Buy</text>
        <text x={36} y={108} fontSize={42} fontWeight={700} fill={C.ink}>20,000 ≤ $1.04</text>
      </g>
      <g transform="translate(600 120)">
        <rect y={50} width={360} height={240} rx={24} fill="#fff" stroke={C.pink} strokeWidth={6} />
        <path d="M0 50 L180 180 L360 50" fill={C.pinkSoft} stroke={C.pink} strokeWidth={6} style={{ transformOrigin: "180px 50px", transform: `scaleY(${flap})` }} />
        <g transform={`translate(180 210) scale(${lock})`}>
          <path d="M-22 -10 v-16 a22 22 0 0 1 44 0 v16" fill="none" stroke={C.pink} strokeWidth={9} />
          <rect x={-32} y={-12} width={64} height={52} rx={10} fill={C.pink} />
        </g>
      </g>
      <text x={780} y={480} textAnchor="middle" fontSize={32} fill={C.grey} opacity={lock}>only a fingerprint goes on-chain</text>
    </svg>
  );
}

function Clear() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(f, [s(0.5), s(2.8)], [0, 1], clamp);
  const dot = spring({ frame: f - s(3), fps, config: { damping: 9 } });
  const L = 2000;
  // demand (buyers) steps down, supply (sellers) steps up; they cross at the clearing point
  const demand = "M100 80 H380 V160 H620 V250 H760 V330 H1100";
  const supply = "M100 470 H460 V400 H700 V250 H880 V150 H1100";
  return (
    <svg viewBox="0 0 1200 540" style={{ width: "82%" }}>
      <line x1={100} y1={500} x2={1100} y2={500} stroke={C.line} strokeWidth={3} />
      <path d={demand} fill="none" stroke={C.pink} strokeWidth={10} strokeDasharray={L} strokeDashoffset={L * (1 - draw)} />
      <path d={supply} fill="none" stroke={C.ink} strokeWidth={10} strokeDasharray={L} strokeDashoffset={L * (1 - draw)} />
      <text x={1110} y={340} fontSize={34} fill={C.pink} fontWeight={700}>buyers</text>
      <text x={1110} y={160} fontSize={34} fill={C.ink} fontWeight={700}>sellers</text>
      <g transform={`translate(700 250) scale(${dot})`}>
        <circle r={30} fill={C.pink} />
        <circle r={52} fill="none" stroke={C.pink} strokeWidth={5} opacity={0.4} />
      </g>
      <text x={740} y={215} fontSize={52} fontWeight={800} fill={C.ink} opacity={dot}>$1.04 · one price for everyone</text>
    </svg>
  );
}

function Publish() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame: f - s(0.3), fps, config: { damping: 14 } });
  const targets = [{ y: 110, t: "Lending pool B" }, { y: 270, t: "Blend pool" }, { y: 430, t: "DEX router" }];
  const bez = (t: number, y: number) => {
    const p0 = [370, 270], p1 = [600, 270], p2 = [620, y], p3 = [820, y];
    const u = 1 - t;
    return [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]);
  };
  return (
    <svg viewBox="0 0 1200 540" style={{ width: "82%" }}>
      {targets.map((tg) => <path key={tg.t} d={`M370 270 C 600 270, 620 ${tg.y}, 820 ${tg.y}`} fill="none" stroke={C.pinkMid} strokeWidth={6} />)}
      {targets.flatMap((tg, i) => [0, 0.33, 0.66].map((o) => {
        const t = ((f / s(1.6)) + o + i * 0.15) % 1;
        const [x, y] = bez(t, tg.y);
        return <circle key={`${i}-${o}`} cx={x} cy={y} r={14} fill={C.pink} opacity={inn} />;
      }))}
      <g transform={`translate(240 270) scale(${inn})`}>
        <circle r={150} fill={C.pinkSoft} stroke={C.pink} strokeWidth={6} opacity={0.5} />
        <circle r={115} fill="#fff" stroke={C.pink} strokeWidth={6} />
        <text y={-6} textAnchor="middle" fontSize={44} fontWeight={800} fill={C.ink}>Fathom</text>
        <text y={40} textAnchor="middle" fontSize={30} fill={C.grey}>price · depth</text>
      </g>
      {targets.map((tg) => (
        <g key={tg.t} transform={`translate(970 ${tg.y})`} opacity={inn}>
          <rect x={-150} y={-44} width={300} height={88} rx={44} fill="#fff" stroke={C.line} strokeWidth={3} />
          <text y={12} textAnchor="middle" fontSize={34} fontWeight={600} fill={C.ink}>{tg.t}</text>
        </g>
      ))}
    </svg>
  );
}

function EndCard() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ ...page, alignItems: "center", justifyContent: "center", gap: 30 }}>
      <div style={{ fontSize: 120, fontWeight: 800, transform: `scale(${0.85 + a * 0.15})`, opacity: a }}>
        Price <span style={{ color: C.pink }}>+</span> depth via <span style={{ color: C.pink }}>SEP-40</span>
      </div>
      <div style={{ fontSize: 46, color: C.grey, opacity: interpolate(f, [20, 40], [0, 1], clamp) }}>the standard Stellar oracle interface lenders already read</div>
    </AbsoluteFill>
  );
}

export function Solution() {
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={STEP}><Frame n={1} title="Seal" caption="Price and size stay hidden while orders come in"><Seal /></Frame></Sequence>
      <Sequence from={STEP} durationInFrames={STEP}><Frame n={2} title="Clear" caption="All orders fill at one uniform price"><Clear /></Frame></Sequence>
      <Sequence from={STEP * 2} durationInFrames={STEP}><Frame n={3} title="Publish" caption="The result goes on-chain: a price and the depth behind it"><Publish /></Frame></Sequence>
      <Sequence from={STEP * 3}><EndCard /></Sequence>
    </AbsoluteFill>
  );
}
