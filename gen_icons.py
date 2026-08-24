from PIL import Image, ImageDraw, ImageFont
import os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "icons")

BG = (15, 76, 61)       # verde oscuro
ACCENT = (212, 175, 55) # dorado

def make_icon(size, path, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(size * 0.08) if maskable else 0
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.22), fill=BG)

    # simple donut-chart glyph
    cx, cy = size / 2, size / 2
    r_out = size * 0.30
    r_in = size * 0.16
    d.pieslice([cx - r_out, cy - r_out, cx + r_out, cy + r_out], 0, 250, fill=ACCENT)
    d.pieslice([cx - r_out, cy - r_out, cx + r_out, cy + r_out], 250, 360, fill=(230, 230, 230))
    d.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=BG)

    img.save(path)

make_icon(192, os.path.join(OUT, "icon-192.png"))
make_icon(512, os.path.join(OUT, "icon-512.png"))
make_icon(512, os.path.join(OUT, "icon-512-maskable.png"), maskable=True)
print("ok")
