// 2:15–2:30. Three lines, then the live link and the repo.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, page, s } from "../theme";
import { SonarLogo } from "./Logo";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function Recap() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = ["A price one trade can’t move", "Depth that can’t be faked", "Privacy by sealed orders and confidential tokens"];
  const linksIn = spring({ frame: f - s(7.2), fps, config: { damping: 16 } });
  const linesOut = interpolate(f, [s(6.6), s(7.1)], [1, 0], clamp);
  return (
    <AbsoluteFill style={page}>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 220px", gap: 46, opacity: linesOut }}>
        {lines.map((t, i) => {
          const a = spring({ frame: f - s(0.3 + i * 1.3), fps, config: { damping: 14 } });
          return (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 34, opacity: a, transform: `translateX(${(1 - a) * -50}px)` }}>
              <span style={{ width: 64, height: 64, borderRadius: 32, background: C.greenSoft, color: C.green, fontSize: 42, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
              <span style={{ fontSize: 70, fontWeight: 800 }}>{t}</span>
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, opacity: linksIn }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, transform: `scale(${0.9 + 0.1 * linksIn})` }}>
          <SonarLogo size={140} />
          <span style={{ fontSize: 120, fontWeight: 800, color: C.pink }}>Fathom</span>
        </div>
        <div style={{ fontSize: 58 }}>Live: <b style={{ color: C.pink }}>fathom-b3t.pages.dev</b></div>
        <div style={{ fontSize: 46 }}>Code: <b>github.com/celadari/fathom-hack-meridian-2026</b></div>
        <div style={{ fontSize: 36, color: C.grey, marginTop: 16 }}>Soroban · Noir · OpenZeppelin Confidential Tokens · SEP-40 · HackMeridian 2026 · Genesis track</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
