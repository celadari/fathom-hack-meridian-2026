// A thin chapter progress bar at the top: Problem · Idea · Live · Recap.
import { useCurrentFrame } from "remotion";
import { C, fontFamily } from "./theme";

export function Progress({ chapters }: { chapters: { label: string; from: number; to: number }[] }) {
  const f = useCurrentFrame();
  if (f < chapters[0].from) return null;
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, display: "flex", gap: 8, padding: "12px 40px 0", background: "#fff", fontFamily, zIndex: 10 }}>
      {chapters.map((c) => {
        const p = Math.max(0, Math.min(1, (f - c.from) / (c.to - c.from)));
        const on = f >= c.from && f < c.to;
        return (
          <div key={c.label} style={{ flex: c.to - c.from, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(19,19,19,.1)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p * 100}%`, background: C.pink }} />
            </div>
            <span style={{ fontSize: 18, fontWeight: on ? 700 : 500, color: on ? C.ink : C.grey, letterSpacing: 0.5 }}>{c.label}</span>
          </div>
        );
      })}
    </div>
  );
}
