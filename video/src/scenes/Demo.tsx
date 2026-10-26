// 1:00–2:15. The recorded clips, waiting cut out: each segment is a slice of a clip (from its marks)
// with a short caption, and optionally a highlight box (spring-scaled, with a gentle zoom) over a key
// number at the position the recorder measured. Every caption number comes from clips.json values.
import { AbsoluteFill, interpolate, OffthreadVideo, Series, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import clips from "../../public/clips/clips.json";
import { C, fontFamily, s } from "../theme";

type Clip = { marks: Record<string, number>; boxes: Record<string, { x: number; y: number; width: number; height: number }>; values: Record<string, string> };
const CL = clips as unknown as Record<string, Clip>;
const mark = (c: string, k: string) => {
  const t = CL[c]?.marks[k];
  if (t === undefined) throw new Error(`clips.json: clip ${c} has no mark "${k}"`);
  return t;
};
/** A number shown in a caption, taken from what the recorder read on the page; never typed here. */
const need = (c: string, k: string, re: RegExp, group = 0) => {
  const m = (CL[c]?.values[k] ?? "").match(re);
  if (!m) throw new Error(`clips.json: clip ${c} value "${k}" has no match for ${re}`);
  return m[group];
};

export interface Segment {
  clip: string;
  /** seconds into the clip */
  from: number;
  /** seconds on screen */
  dur: number;
  caption: string;
  box?: { key: string; label: string; tone?: "pink" | "green" | "red" };
}

/** The cut: real moments only, waits removed. */
export const SEGMENTS: Segment[] = [
  // (a) Trade
  { clip: "a", from: mark("a", "ready") - 0.3, dur: 4.6, caption: `Trade: buy ${Number(need("a", "qty", /[\d,]+/).replace(/,/g, "")).toLocaleString("en-US")} USTRY at most $${need("a", "limit", /[\d.]+/)}` },
  { clip: "a", from: mark("a", "sealClicked") - 0.4, dur: 4, caption: "Sealed in the browser, proved in zero knowledge" },
  { clip: "a", from: mark("a", "keys") + 0.2, dur: 3.4, caption: "One signature creates your confidential keys" },
  { clip: "a", from: mark("a", "register"), dur: 3, caption: "One-time registration for confidential tokens" },
  { clip: "a", from: mark("a", "wrap"), dur: 3.4, caption: "USDC wrapped into a confidential token" },
  { clip: "a", from: mark("a", "prove"), dur: 3.4, caption: "The deposit is proved; its amount stays hidden" },
  { clip: "a", from: mark("a", "locked") - 0.2, dur: 4, caption: `Sealed order locked in auction #${need("a", "auction", /\d+/)}`, box: { key: "lockLine", label: "sealed order", tone: "pink" } },
  // (b) Auction
  { clip: "b", from: mark("b", "ready") - 0.5, dur: 5, caption: `Auction #${need("b", "auction", /\d+/)}: ${need("b", "sealedCount", /\d+/)} sealed orders, no prices shown`, box: { key: "sealedRow", label: "your sealed order" } },
  { clip: "b", from: mark("b", "ready") + 3, dur: 3.4, caption: `Depth: ${need("b", "depth", /[\d.,]+K?/)} USTRY of locked buy orders near NAV`, box: { key: "depth", label: "depth" } },
  // (c) Next auction → Results
  { clip: "c", from: mark("c", "nextClicked") - 1.5, dur: 3.2, caption: "Presenter: end the auction now" },
  { clip: "c", from: mark("c", "banner") - 0.3, dur: 2.6, caption: `Auction #${need("c", "auction", /\d+/)} closed` },
  // The recorder measured the headline, then scrolled: the box segment ends before the scroll.
  { clip: "c", from: mark("c", "results") - 2.4, dur: 2.6, caption: `Results: everyone trades at ${need("c", "clearing", /\$[\d.]+/)}`, box: { key: "clearing", label: "clearing price" } },
  { clip: "c", from: mark("c", "results") + 0.7, dur: 2.6, caption: "Every revealed order, filled at one price" },
  // (d) Price & depth
  { clip: "d", from: mark("d", "ready") - 0.3, dur: 3.8, caption: `Fathom price: ${need("d", "price", /\$[\d.]+/)}, median of the last ${need("d", "price", /last (\d+) auctions/, 1)} auctions`, box: { key: "price", label: "price" } },
  { clip: "d", from: mark("d", "ready") + 1.6, dur: 3.4, caption: `${need("d", "depth", /[\d,]+(?=\s*USTRY)/)} USTRY can be sold near NAV`, box: { key: "depth", label: "depth" } },
  { clip: "d", from: mark("d", "ready") + 3.2, dur: 3.8, caption: `Pool B can take ${need("d", "cap", /[\d,]+(?=\s*USTRY)/)} more USTRY`, box: { key: "cap", label: "Pool B cap", tone: "green" } },
  { clip: "d", from: mark("d", "cardsDone") + 0.6, dur: 3, caption: "Pool B's cap: a share of the lowest depth over a window", box: { key: "meter", label: "depth → cap" } },
  // (e) Attack demo
  { clip: "e", from: mark("e", "ready") - 0.3, dur: 3, caption: "The February 2026 attack, replayed on testnet" },
  { clip: "e", from: mark("e", "step2"), dur: 3.4, caption: `One trade pumps the DEX to ${need("e", "step2", /\$\d+(?!\.)/)}` },
  { clip: "e", from: mark("e", "step3"), dur: 3, caption: `The attacker asks both pools for ${need("e", "step3", /\$[\d,]{7,}/)}` },
  { clip: "e", from: mark("e", "step4") + 0.6, dur: 4.2, caption: "Pool A trusts the DEX price: drained", box: { key: "poolA", label: "Pool A", tone: "red" } },
  { clip: "e", from: mark("e", "step5") + 0.6, dur: 4.6, caption: `Pool B uses Fathom: borrow rejected (cap ${need("e", "step5", /cap ([\d,]+)/, 1)} USTRY)`, box: { key: "rejected", label: "Borrow rejected", tone: "green" } },
  { clip: "e", from: mark("e", "step6") + 0.4, dur: 4, caption: `Pool A: ${need("e", "poolA", /Money left in the pool\s*(\$[\dKM.]+)/, 1)} left · Pool B: ${need("e", "poolB", /Money left in the pool\s*(\$[\dKM.]+)/, 1)} left` },
];

/** 75 s exactly (2:30 overall): segment lengths are scaled to fit, rounding absorbed by the last one. */
export const demoFrames = s(75);
const raw = SEGMENTS.map((g) => s(g.dur));
const k = demoFrames / raw.reduce((a, b) => a + b, 0);
const FRAMES = raw.map((f) => Math.round(f * k));
FRAMES[FRAMES.length - 1] += demoFrames - FRAMES.reduce((a, b) => a + b, 0);

const TONE = { pink: C.pink, green: C.green, red: C.red };

function Piece({ g }: { g: Segment }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = g.box ? CL[g.clip]?.boxes[g.box.key] : undefined;
  const pop = spring({ frame: f - 8, fps, config: { damping: 12, stiffness: 140 } });
  // gentle zoom toward the highlighted number
  const zoom = b ? interpolate(pop, [0, 1], [1, 1.12]) : 1;
  const origin = b ? `${b.x + b.width / 2}px ${b.y + b.height / 2}px` : "50% 50%";
  const cap = spring({ frame: f, fps, config: { damping: 16 } });
  const col = TONE[g.box?.tone ?? "pink"];
  return (
    <AbsoluteFill style={{ background: "#fff", fontFamily }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: origin }}>
        <OffthreadVideo src={staticFile(`clips/${g.clip}.mp4`)} startFrom={Math.max(0, Math.round(g.from * fps))} muted />
        {b && (
          <div style={{ position: "absolute", left: b.x - 14, top: b.y - 14, width: b.width + 28, height: b.height + 28, border: `6px solid ${col}`, borderRadius: 22, boxShadow: `0 0 0 9999px rgba(19,19,19,${0.28 * pop})`, transform: `scale(${0.85 + 0.15 * pop})`, opacity: pop }}>
            <span style={{ position: "absolute", top: -54, left: 0, background: col, color: "#fff", fontSize: 30, fontWeight: 700, padding: "6px 18px", borderRadius: 999, whiteSpace: "nowrap" }}>{g.box!.label}</span>
          </div>
        )}
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, display: "flex", justifyContent: "center", transform: `translateY(${(1 - cap) * 40}px)`, opacity: cap }}>
        <span style={{ background: "rgba(19,19,19,.88)", color: "#fff", fontSize: 54, fontWeight: 700, padding: "20px 44px", borderRadius: 28, maxWidth: 1700, textAlign: "center" }}>{g.caption}</span>
      </div>
    </AbsoluteFill>
  );
}

export function Demo() {
  return (
    <Series>
      {SEGMENTS.map((g, i) => (
        <Series.Sequence key={i} durationInFrames={FRAMES[i]}>
          <Piece g={g} />
        </Series.Sequence>
      ))}
    </Series>
  );
}
