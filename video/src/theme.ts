// The app's look: Inter, white with a soft pink glow, pink and ink; green / red for Pool B / Pool A.
import type { CSSProperties } from "react";
import { loadFont } from "@remotion/google-fonts/Inter";

export const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });

export const C = {
  pink: "#FC72FF",
  pinkSoft: "#FFEFFF",
  pinkMid: "#FFD6FF",
  ink: "#131313",
  grey: "#7D7D7D",
  line: "#F0F0F0",
  green: "#40B66B",
  greenSoft: "#EEF9F1",
  red: "#E5484D",
  redSoft: "#FDECEC",
};

export const FPS = 30;
export const s = (seconds: number) => Math.round(seconds * FPS);

export const page: CSSProperties = {
  background: "radial-gradient(1400px 800px at 50% -10%, #FFEFFF 0%, #FFFFFF 70%)",
  fontFamily,
  color: C.ink,
};
