// "Dip to white": the outgoing scene fades out completely before the next fades in, so no text
// from one scene is ever visible in the next.
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function Dip({ children, presentationDirection, presentationProgress }: TransitionPresentationComponentProps<Record<string, never>>) {
  const opacity = presentationDirection === "exiting"
    ? interpolate(presentationProgress, [0, 0.5], [1, 0], clamp)
    : interpolate(presentationProgress, [0.5, 1], [0, 1], clamp);
  return <AbsoluteFill style={{ opacity, background: "#fff" }}>{children}</AbsoluteFill>;
}

export const dip = (): TransitionPresentation<Record<string, never>> => ({ component: Dip, props: {} });
