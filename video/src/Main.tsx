// The whole video: five scenes joined by TransitionSeries fades. Durations add up to 2:30 at 30 fps
// (each transition overlaps its two scenes, so the scenes are a little longer than their slots).
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Audio, getStaticFiles, staticFile } from "remotion";
import { Close } from "./scenes/Close";
import { Demo, demoFrames } from "./scenes/Demo";
import { Hook } from "./scenes/Hook";
import { Problem } from "./scenes/Problem";
import { Solution } from "./scenes/Solution";
import { s } from "./theme";

export const T = 20; // transition, frames
export const SCENES = [
  { id: "Hook", frames: s(10) + T, C: Hook },
  { id: "Problem", frames: s(25) + T, C: Problem },
  { id: "Solution", frames: s(25) + T, C: Solution },
  { id: "Demo", frames: demoFrames, C: Demo },
  { id: "Close", frames: s(15) + T, C: Close },
];
export const TOTAL = SCENES.reduce((n, x) => n + x.frames, 0) - T * (SCENES.length - 1);

// Optional audio: drop video/public/voiceover.mp3 (your recording of SCRIPT.md) and, only if it is
// licensed for reuse, video/public/music.mp3 (played quietly under the voice).
const has = (name: string) => getStaticFiles().some((f) => f.name === name);

export function Main() {
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <TransitionSeries>
        {SCENES.flatMap(({ id, frames, C }, i) => [
          ...(i > 0 ? [<TransitionSeries.Transition key={`t${id}`} presentation={fade()} timing={linearTiming({ durationInFrames: T })} />] : []),
          <TransitionSeries.Sequence key={id} durationInFrames={frames}><C /></TransitionSeries.Sequence>,
        ])}
      </TransitionSeries>
      {has("voiceover.mp3") && <Audio src={staticFile("voiceover.mp3")} />}
      {has("music.mp3") && <Audio src={staticFile("music.mp3")} volume={0.12} />}
    </AbsoluteFill>
  );
}
