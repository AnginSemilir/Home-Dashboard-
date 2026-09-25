"""Draw a stand-in 'camera frame' for the mock camera entity (needs Pillow, which HA installs)."""

import sys

from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / H
    sky = (int(120 + 60 * (1 - t)), int(150 + 50 * (1 - t)), int(180 + 40 * (1 - t)))
    lawn = (int(70 + 30 * t), int(80 + 25 * t), int(70 + 20 * t))
    d.line([(0, y), (W, y)], fill=sky if y < H * 0.45 else lawn)
d.polygon([(0, H), (W * 0.35, H * 0.5), (W * 0.55, H * 0.5), (W, H)], fill=(95, 95, 100))
d.rectangle([W * 0.6, H * 0.25, W * 0.95, H * 0.6], fill=(150, 110, 90))
d.polygon([(W * 0.57, H * 0.27), (W * 0.775, H * 0.08), (W * 0.98, H * 0.27)], fill=(80, 60, 60))
d.rectangle([W * 0.74, H * 0.42, W * 0.8, H * 0.6], fill=(60, 45, 40))
for x0 in (0.64, 0.84):
    d.rectangle([W * x0, H * 0.32, W * (x0 + 0.07), H * 0.4], fill=(200, 220, 235))
d.rounded_rectangle([W * 0.22, H * 0.62, W * 0.46, H * 0.78], radius=30, fill=(40, 70, 120))
d.ellipse([W * 0.25, H * 0.74, W * 0.29, H * 0.81], fill=(20, 20, 20))
d.ellipse([W * 0.39, H * 0.74, W * 0.43, H * 0.81], fill=(20, 20, 20))
img = img.filter(ImageFilter.GaussianBlur(1.2))
ImageDraw.Draw(img).text((20, 20), "MOCK CAMERA FEED", fill=(255, 255, 255))
img.save(sys.argv[1] if len(sys.argv) > 1 else "camera.jpg", quality=85)
