// The whole video, around one question: "Can a lending pool trust this price?"
// Logo and tagline 0:00–0:02.5 · Problem –0:30 · Idea 0:30–0:50 · Live 0:50–2:15 · Recap 2:15–2:30, joined by a dip to white
// (no text from one scene is visible in the next), with a chapter progress bar on top.
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, Audio, getStaticFiles, staticFile } from "remotion";
import { Progress } from "./Progress";
import { Idea } from "./scenes/Idea";
import { Intro } from "./scenes/Intro";
import { Live } from "./scenes/Live";
import { Problem } from "./scenes/Problem";
import { Recap } from "./scenes/Recap";
import { s } from "./theme";
import { dip } from "./transitions";

export const T = 24; // dip to white, frames (centered on each boundary)
const BOUNDS = [0, s(2.5), s(30), s(50), s(135), s(150)];
const slot = (i: number) => BOUNDS[i + 1] - BOUNDS[i];
// Each scene runs half a transition past its slot on each inner edge.
const len = (i: number) => slot(i) + (i > 0 ? T / 2 : 0) + (i < BOUNDS.length - 2 ? T / 2 : 0);
const LIVE = len(3);

export const SCENES = [
  { id: "Intro", frames: len(0), C: Intro },
  { id: "Problem", frames: len(1), C: Problem },
  { id: "Idea", frames: len(2), C: Idea },
  { id: "Live", frames: LIVE, C: () => <Live frames={LIVE} /> },
  { id: "Recap", frames: len(4), C: Recap },
];
export const TOTAL = BOUNDS[5];
// The bar appears with the problem; the logo frame stays clean.
const CHAPTERS = ["Problem", "Idea", "Live", "Recap"].map((label, i) => ({ label, from: BOUNDS[i + 1], to: BOUNDS[i + 2] }));

const has = (name: string) => getStaticFiles().some((f) => f.name === name);

export function Main() {
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <TransitionSeries>
        {SCENES.flatMap(({ id, frames, C }, i) => [
          ...(i > 0 ? [<TransitionSeries.Transition key={`t${id}`} presentation={dip()} timing={linearTiming({ durationInFrames: T })} />] : []),
          <TransitionSeries.Sequence key={id} durationInFrames={frames}><C /></TransitionSeries.Sequence>,
        ])}
      </TransitionSeries>
      <Progress chapters={CHAPTERS} />
      {/* Voiceover: your recording of SCRIPT.md. Music: only a track licensed for reuse, quietly. */}
      {has("voiceover.mp3") && <Audio src={staticFile("voiceover.mp3")} />}
      {has("music.mp3") && <Audio src={staticFile("music.mp3")} volume={0.12} />}
    </AbsoluteFill>
  );
}
