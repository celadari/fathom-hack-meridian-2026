// What the recorder saw: marks (seconds into each clip), boxes and values read on the page
// (clips.json), and layout regions (regions.json). Numbers on screen come only from here.
import clips from "../public/clips/clips.json";
import regions from "../public/clips/regions.json";

export type Rect = { x: number; y: number; width: number; height: number };
type Clip = { marks: Record<string, number>; boxes: Record<string, Rect>; values: Record<string, string> };
const CL = clips as unknown as Record<string, Clip>;
export const REGION = regions as unknown as Record<string, Rect>;

export const mark = (c: string, k: string) => {
  const t = CL[c]?.marks[k];
  if (t === undefined) throw new Error(`clips.json: clip ${c} has no mark "${k}"`);
  return t;
};
export const box = (c: string, k: string): Rect => {
  const b = CL[c]?.boxes[k];
  if (!b) throw new Error(`clips.json: clip ${c} has no box "${k}"`);
  return b;
};
/** A number shown on screen, taken from what the recorder read on the page; never typed here. */
export const need = (c: string, k: string, re: RegExp, group = 0) => {
  const m = (CL[c]?.values[k] ?? "").match(re);
  if (!m) throw new Error(`clips.json: clip ${c} value "${k}" has no match for ${re}`);
  return m[group];
};
export const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

// Values used across scenes (attack clip e, price & depth clip d).
export const V = {
  dexStart: need("e", "step2", /\$\d+\.\d+/),
  pump: need("e", "step2", /\$\d+(?![.\d])/),
  collateral: need("e", "step4", /([\d,]+) ×/, 1),
  inflated: need("e", "step4", /= (\$[\d,]+) collateral/, 1),
  lent: need("e", "step4", /Lends (\$[\d,]+)/, 1),
  poolALeft: need("e", "poolA", /Money left in the pool\s*(\$[\dKM.]+)/, 1),
  poolBLeft: need("e", "poolB", /Money left in the pool\s*(\$[\dKM.]+)/, 1),
  standingDays: need("d", "depth", /locked (\d+) days/, 1),
};
