// After recording: convert the clips to H.264 MP4 (what OffthreadVideo plays most reliably).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
const CLIPS = resolve(new URL("../public/clips", import.meta.url).pathname);
for (const f of readdirSync(CLIPS).filter((x) => x.endsWith(".webm"))) {
  const out = join(CLIPS, f.replace(/\.webm$/, ".mp4"));
  execFileSync("npx", ["remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", join(CLIPS, f), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-an", out], { stdio: "inherit" });
  console.log(`  ${f} → ${out.split("/").pop()}`);
}
