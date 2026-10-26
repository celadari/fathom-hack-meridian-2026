# One frame every 10 s of out/fathom-demo.mp4, labelled with its time, as out/frame-grid.jpg.
#   python3 recorder/grid.py
import subprocess, os
from PIL import Image, ImageDraw, ImageFont
out = os.path.join(os.path.dirname(__file__), "..", "out")
video = os.path.join(out, "fathom-demo.mp4")
frames = []
for t in range(0, 150, 10):
    p = os.path.join(out, f".grid-{t:03d}.jpg")
    subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(t + 0.5), "-i", video, "-frames:v", "1", "-vf", "scale=640:-1", p], check=True)
    frames.append((t + 0.5, Image.open(p).convert("RGB")))
w, h = frames[0][1].size
cols = 4
rows = (len(frames) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w + (cols + 1) * 8, rows * h + (rows + 1) * 8), "white")
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
for i, (t, im) in enumerate(frames):
    x = 8 + (i % cols) * (w + 8); y = 8 + (i // cols) * (h + 8)
    sheet.paste(im, (x, y))
    d = ImageDraw.Draw(sheet)
    label = f"{int(t // 60)}:{int(t % 60):02d}"
    d.rectangle((x, y, x + 78, y + 32), fill="black")
    d.text((x + 8, y + 4), label, fill="white", font=font)
for f in os.listdir(out):
    if f.startswith(".grid-"): os.remove(os.path.join(out, f))
dst = os.path.join(out, "frame-grid.jpg")
sheet.save(dst, quality=88)
print(os.path.abspath(dst))
