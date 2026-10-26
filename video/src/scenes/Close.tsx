// 2:15–2:30. Built with, live link, code, event.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, page } from "../theme";
import { SonarLogo } from "./Logo";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function Close() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 14 } });
  const line = (i: number) => interpolate(f, [15 + i * 12, 30 + i * 12], [0, 1], clamp);
  const row = (i: number, children: React.ReactNode, style: React.CSSProperties = {}) => (
    <div style={{ opacity: line(i), transform: `translateY(${(1 - line(i)) * 16}px)`, ...style }}>{children}</div>
  );
  return (
    <AbsoluteFill style={{ ...page, alignItems: "center", justifyContent: "center", gap: 26, textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, transform: `scale(${a})` }}>
        <SonarLogo size={130} />
        <span style={{ fontSize: 110, fontWeight: 800, color: C.pink }}>Fathom</span>
      </div>
      {row(0, <>Built with <b>Soroban</b> · <b>Noir</b> · <b>OpenZeppelin Confidential Tokens</b> · <b>SEP-40</b></>, { fontSize: 44 })}
      {row(1, <>Live: <span style={{ color: C.pink, fontWeight: 700 }}>fathom-b3t.pages.dev</span></>, { fontSize: 54 })}
      {row(2, <>Code: <span style={{ fontWeight: 600 }}>github.com/celadari/fathom-hack-meridian-2026</span></>, { fontSize: 44 })}
      {row(3, <>HackMeridian 2026 · Genesis track</>, { fontSize: 40, color: C.grey, marginTop: 20 })}
    </AbsoluteFill>
  );
}
