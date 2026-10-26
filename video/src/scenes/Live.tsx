// 0:50–2:15. "See it live": four chapters, each opened by a 2-second card. Every shot is cropped and
// zoomed (1.6–2×) on the region that matters, panning with a spring between regions; captions are two
// lines (what you see / why it matters), with numbers only from clips.json.
import { AbsoluteFill, interpolate, OffthreadVideo, Series, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { box, mark, need, rect, REGION, type Rect, V } from "../data";
import { C, fontFamily, s } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CAPTION_H = 250; // bottom band kept for the caption
const VIEW = { w: 1920, h: 1080 - CAPTION_H };

type Tone = "pink" | "green" | "red";
interface Shot {
  clip: string;
  from: number; // seconds into the clip
  dur: number; // seconds on screen (scaled to fit the chapter)
  frame: Rect[]; // regions to frame; more than one: spring pan from one to the next
  line1: string;
  line2: string;
  hl?: { r: Rect; label: string; tone?: Tone };
  rate?: number;
}
interface Chapter { letter: string; title: string; shots: Shot[] }

const shortTx = (u: string) => u.replace(/^https:\/\//, "").replace(/(tx\/[0-9a-f]{8})[0-9a-f]+$/, "$1…");

export const CHAPTERS: Chapter[] = [
  {
    letter: "A", title: "A buyer places a sealed bid",
    shots: [
      { clip: "a", from: mark("a", "ready") - 0.2, dur: 4.6, frame: [REGION.widget],
        line1: `Buy ${Number(need("a", "qty", /\d+/)).toLocaleString("en-US")} USTRY at most $${need("a", "limit", /[\d.]+/)}`,
        line2: "Price and size stay sealed while bids come in" },
      { clip: "a", from: mark("a", "sealClicked") - 0.3, dur: 4.2, frame: [rect(710, 158, 500, 470)],
        line1: "Sealed in the browser, with a zero-knowledge proof", line2: "Only a fingerprint goes on-chain" },
      { clip: "a", from: mark("a", "keys") + 0.2, dur: 3.6, frame: [rect(710, 158, 500, 470)],
        line1: "One wallet signature creates confidential keys", line2: "So the deposit amount can be hidden too" },
      { clip: "a", from: mark("a", "wrap"), dur: 3.6, frame: [rect(710, 158, 500, 470)],
        line1: "USDC is wrapped into a confidential token", line2: "Balances become commitments, not public numbers" },
      { clip: "a", from: mark("a", "prove"), dur: 3.4, frame: [rect(710, 158, 500, 470)],
        line1: "The deposit is proved, never shown", line2: "The token checks the proof, not the amount" },
      { clip: "a", from: mark("a", "locked") - 0.2, dur: 4.2, frame: [rect(710, 158, 500, 470), rect(710, 600, 500, 300)],
        line1: `Sealed bid locked in auction #${need("a", "auction", /\d+/)}`, line2: "Funds committed, bid still secret",
        hl: { r: box("a", "lockLine"), label: "sealed bid" } },
    ],
  },
  {
    letter: "B", title: "The auction closes: one price for everyone",
    shots: [
      { clip: "c", from: mark("c", "banner") - 0.2, dur: 3, frame: [rect(370, 40, 820, 160)],
        line1: `Auction #${need("c", "auction", /\d+/)} closes`, line2: "Every sealed bid is revealed and checked" },
      // the Results page is unscrolled only for ~2.5 s before the recorder scrolls: play it at half speed
      { clip: "c", from: mark("c", "results") - 2.4, dur: 4.4, rate: 0.5, frame: [rect(280, 200, 900, 110), REGION.chart],
        line1: `Everyone trades at ${need("c", "clearing", /\$[\d.]+/)}`, line2: "Buy and sell curves cross at one clearing price",
        hl: { r: box("c", "clearing"), label: "clearing price" } },
      { clip: "c", from: mark("c", "results") + 0.7, dur: 3.4, frame: [REGION.table],
        line1: "Every revealed bid, filled at the same price", line2: "Anyone can check the result on Stellar" },
    ],
  },
  {
    letter: "C", title: "Fathom publishes price and depth",
    shots: [
      { clip: "d", from: mark("d", "ready") - 0.2, dur: 3.8, frame: [box("d", "price")],
        line1: `Price: ${need("d", "price", /\$[\d.]+/)}, median of the last ${need("d", "price", /last (\d+) auctions/, 1)} auctions`,
        line2: "One trade cannot move a median of auctions", hl: { r: box("d", "price"), label: "price" } },
      { clip: "d", from: mark("d", "ready") + 1.4, dur: 3.8, frame: [box("d", "depth")],
        line1: `${need("d", "depth", /[\d,]+(?=\s*USTRY)/)} USTRY could really be sold near NAV`,
        line2: `Buy orders left unfilled, locked ${V.standingDays} days. Self-trading can only lower it.`, hl: { r: box("d", "depth"), label: "depth" } },
      { clip: "d", from: mark("d", "ready") + 3, dur: 3.8, frame: [box("d", "cap")],
        line1: `Pool B can still accept ${need("d", "cap", /[\d,]+(?=\s*USTRY)/)} USTRY`,
        line2: "Its limit follows real depth, not a DEX print", hl: { r: box("d", "cap"), label: "Pool B cap", tone: "green" } },
      { clip: "d", from: mark("d", "cardsDone") + 0.8, dur: 4.2, frame: [box("d", "meter")],
        line1: `Pool B accepts at most ${need("d", "cap", /(\d+)% of the lowest depth/, 1)}% of the lowest recent depth`,
        line2: "A burst of new bids cannot inflate it" },
    ],
  },
  {
    letter: "D", title: "The February attack, replayed",
    shots: [
      { clip: "e", from: mark("e", "step2") + 0.3, dur: 3.8, frame: [box("e", "poolA")],
        line1: `One trade pumps the DEX to ${V.pump}`, line2: "Like February: under $1 of hourly volume" },
      { clip: "e", from: mark("e", "step3") + 0.2, dur: 3.4, frame: [box("e", "poolA")],
        line1: `The attacker asks both pools for ${V.lent}`, line2: `Posting ${V.collateral} USTRY as collateral` },
      { clip: "e", from: mark("e", "step4") + 0.6, dur: 4.2, frame: [box("e", "poolA")],
        line1: `Pool A: ${V.collateral} × ${V.pump} = ${V.inflated}`, line2: `It lends ${V.lent} and is drained`,
        hl: { r: box("e", "poolA"), label: "Pool A · DEX price", tone: "red" } },
      { clip: "e", from: mark("e", "step5") + 0.6, dur: 4.4, frame: [box("e", "rejected")],
        line1: `Pool B: ${V.collateral} × ${need("e", "step5", /× (\$[\d.]+)/, 1)} = ${need("e", "step5", /= (\$[\d,]+) collateral/, 1)}`,
        line2: `Borrow rejected · depth cap ${need("e", "step5", /cap ([\d,]+)/, 1)} USTRY`,
        hl: { r: box("e", "rejected"), label: "Pool B · Fathom", tone: "green" } },
      { clip: "e", from: mark("e", "step5") + 2.4, dur: 3.4, frame: [rect(1060, 360, 600, 320)],
        line1: "Pool B's rejection is recorded on Stellar", line2: shortTx(need("e", "poolBLink", /https:\/\/stellar\.expert\S+/)) },
      { clip: "e", from: mark("e", "step6") + 0.4, dur: 4.6, frame: [rect(280, 372, 1360, 480)],
        line1: `Pool A: ${V.poolALeft} left · Pool B: ${V.poolBLeft} left`, line2: "Same attack. Only the price source differs." },
    ],
  },
];

const CARD = s(2);
/** Shot lengths scaled so the chapters fill `total` frames exactly. */
export function layout(total: number) {
  const shotFrames = total - CARD * CHAPTERS.length;
  const raw = CHAPTERS.flatMap((c) => c.shots.map((x) => s(x.dur)));
  const k = shotFrames / raw.reduce((a, b) => a + b, 0);
  const frames = raw.map((f) => Math.round(f * k));
  frames[frames.length - 1] += shotFrames - frames.reduce((a, b) => a + b, 0);
  return frames;
}

/** Scale and offset that put region r in the view, zoomed 1.6–2×. */
function fit(r: Rect) {
  const scale = Math.max(1.6, Math.min(2, Math.min(VIEW.w / r.width, VIEW.h / r.height) * 0.92));
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  return { scale, tx: VIEW.w / 2 - scale * cx, ty: 44 + (VIEW.h - 44) / 2 - scale * cy };
}

const TONE: Record<Tone, string> = { pink: C.pink, green: C.green, red: C.red };

function ShotView({ shot }: { shot: Shot }) {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const a = fit(shot.frame[0]);
  const b = fit(shot.frame[shot.frame.length - 1]);
  const pan = shot.frame.length > 1 ? spring({ frame: f - Math.round(durationInFrames * 0.45), fps, config: { damping: 20, mass: 1.2 } }) : 0;
  const settle = spring({ frame: f, fps, config: { damping: 18 } }); // ease into the zoom
  const scale = interpolate(pan, [0, 1], [a.scale, b.scale]) * interpolate(settle, [0, 1], [0.94, 1]);
  const tx = interpolate(pan, [0, 1], [a.tx, b.tx]) + (1 - settle) * 20;
  const ty = interpolate(pan, [0, 1], [a.ty, b.ty]);
  const hl = shot.hl;
  const pop = spring({ frame: f - 10, fps, config: { damping: 12 } });
  const cap = spring({ frame: f, fps, config: { damping: 16 } });
  const col = TONE[hl?.tone ?? "pink"];
  return (
    <AbsoluteFill style={{ background: "#fff", fontFamily, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <OffthreadVideo src={staticFile(`clips/${shot.clip}.mp4`)} startFrom={Math.max(0, Math.round(shot.from * fps))} playbackRate={shot.rate ?? 1} muted style={{ width: 1920, height: 1080 }} />
        {hl && (
          <div style={{ position: "absolute", left: hl.r.x - 10, top: hl.r.y - 10, width: hl.r.width + 20, height: hl.r.height + 20, border: `${4 / scale + 1}px solid ${col}`, borderRadius: 14, opacity: pop, transform: `scale(${0.9 + 0.1 * pop})` }}>
            <span style={{ position: "absolute", top: -30, left: 0, background: col, color: "#fff", fontSize: 16, fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{hl.label}</span>
          </div>
        )}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CAPTION_H, background: "#fff", borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
        {/* the band is always opaque, so no clip text shows through; only the caption animates */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: cap, transform: `translateY(${(1 - cap) * 20}px)` }}>
        <div style={{ fontSize: 58, fontWeight: 800, color: C.ink, textAlign: "center" }}>{shot.line1}</div>
        <div style={{ fontSize: 40, fontWeight: 500, color: C.grey, textAlign: "center" }}>{shot.line2}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ChapterCard({ letter, title }: { letter: string; title: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 15 } });
  const out = interpolate(f, [CARD - 8, CARD], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(1400px 800px at 50% -10%, #FFEFFF 0%, #FFFFFF 70%)", fontFamily, alignItems: "center", justifyContent: "center", gap: 28, opacity: out }}>
      <div style={{ fontSize: 30, letterSpacing: 6, color: C.grey, fontWeight: 600 }}>SEE IT LIVE · TESTNET</div>
      <div style={{ display: "flex", alignItems: "center", gap: 36, transform: `scale(${0.9 + 0.1 * a})`, opacity: a }}>
        <span style={{ width: 130, height: 130, borderRadius: 65, background: C.pink, color: "#fff", fontSize: 76, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{letter}</span>
        <span style={{ fontSize: 84, fontWeight: 800, color: C.ink, maxWidth: 1400 }}>{title}</span>
      </div>
    </AbsoluteFill>
  );
}

export function Live({ frames }: { frames: number }) {
  const lengths = layout(frames);
  let i = 0;
  return (
    <Series>
      {CHAPTERS.flatMap((c) => [
        <Series.Sequence key={`card-${c.letter}`} durationInFrames={CARD}><ChapterCard letter={c.letter} title={c.title} /></Series.Sequence>,
        ...c.shots.map((shot) => {
          const d = lengths[i++];
          return <Series.Sequence key={`${c.letter}-${i}`} durationInFrames={d}><ShotView shot={shot} /></Series.Sequence>;
        }),
      ])}
    </Series>
  );
}
