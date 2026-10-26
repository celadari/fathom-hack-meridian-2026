# Fathom demo video (Remotion)

2:30, 1920×1080, 30 fps, H.264. Scenes in `src/scenes/` (Hook, Problem, Solution, Demo, Close), each its
own composition, joined in `src/Main.tsx` with `TransitionSeries`.

```bash
npm install
npm run record -- prep a b c d e   # record the demo clips on the live site (presenter token from ~/.fathom-hosted-demo-token)
node recorder/finish.mjs           # convert the clips to H.264 MP4
npm run verify                     # same auction from Trade to Results; Pool A $0, Pool B rejected with a cap and its tx link
npm run render                     # verify, then render out/fathom-demo.mp4
python3 recorder/grid.py           # out/frame-grid.jpg: one frame every 10 s
npm run studio                     # preview and tweak
```

Captions and highlight boxes use only what the recorder read on the page (`public/clips/clips.json`):
a missing value fails the render instead of falling back to a typed number.

Voiceover: record [SCRIPT.md](SCRIPT.md) and save it as `public/voiceover.mp3`; it is picked up on the
next render. Music: only a track licensed for reuse, as `public/music.mp3` (played quietly).
