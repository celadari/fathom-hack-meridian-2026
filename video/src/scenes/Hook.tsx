// 0:00–0:10. Logo pulsing, the name, the line.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, page } from "../theme";
import { SonarLogo } from "./Logo";

export function Hook() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f, fps, config: { damping: 14 } });
  const title = spring({ frame: f - 18, fps, config: { damping: 16 } });
  const line = interpolate(f, [50, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ ...page, alignItems: "center", justifyContent: "center", gap: 28 }}>
      <div style={{ transform: `scale(${logo})` }}><SonarLogo size={260} /></div>
      <div style={{ fontSize: 150, fontWeight: 800, color: C.pink, letterSpacing: -3, transform: `translateY(${(1 - title) * 40}px)`, opacity: title }}>Fathom</div>
      <div style={{ fontSize: 50, fontWeight: 500, color: C.ink, opacity: line, transform: `translateY(${(1 - line) * 20}px)`, textAlign: "center", maxWidth: 1500 }}>
        A price you can lend against, and the depth to prove it.
      </div>
    </AbsoluteFill>
  );
}
