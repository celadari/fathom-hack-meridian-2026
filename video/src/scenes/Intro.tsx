// 0:00–0:02.5. The logo and the tagline on the very first frame, then straight into the problem.
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, page } from "../theme";
import { SonarLogo } from "./Logo";

export function Intro() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // starts most of the way in, so frame 0 (the thumbnail) already shows logo and tagline
  const a = spring({ frame: f + 8, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ ...page, alignItems: "center", justifyContent: "center", gap: 34 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 32, transform: `scale(${0.94 + 0.06 * a})` }}>
        <SonarLogo size={170} />
        <span style={{ fontSize: 150, fontWeight: 800, color: C.pink, letterSpacing: -3 }}>Fathom</span>
      </div>
      <div style={{ fontSize: 56, fontWeight: 600, color: C.ink }}>A price you can lend against, and the depth to prove it.</div>
    </AbsoluteFill>
  );
}
