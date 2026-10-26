// The Fathom sonar mark (same geometry as the app header), with rings pulsing outward.
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";

export function SonarLogo({ size }: { size: number }) {
  const f = useCurrentFrame();
  const ring = (offset: number) => {
    const t = ((f + offset) % 60) / 60;
    return { r: interpolate(t, [0, 1], [3, 14]), opacity: interpolate(t, [0, 1], [0.7, 0]) };
  };
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke={C.pink} strokeWidth={1.6}>
      {[0, 20, 40].map((o) => { const r = ring(o); return <circle key={o} cx={14} cy={14} r={r.r} opacity={r.opacity} />; })}
      <circle cx={14} cy={14} r={7.5} opacity={0.6} />
      <circle cx={14} cy={14} r={12} opacity={0.3} />
      <circle cx={14} cy={14} r={3} fill={C.pink} />
    </svg>
  );
}
