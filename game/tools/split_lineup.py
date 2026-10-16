"""Tách ảnh dàn nhân vật (newMan.png) thành từng ảnh vuông nền xám cho Hunyuan3D.

py -3 split_lineup.py <lineup.png> <out_dir>
- Nền xanh ngọc: loại theo màu ở mọi nơi (không có quần áo màu này).
- Sàn gỗ: loại phần nối với mép ảnh (nét viền đen chặn flood-fill, nên giày/da không bị ăn).
- Mỗi nhân vật = thành phần liên thông chứa điểm giữa thân, cắt trong cột riêng của nó.
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(int)
H, W = a.shape[:2]
r, g, b = a[..., 0], a[..., 1], a[..., 2]

teal = (g - r > 30) & (b - g > -22) & (b - g < 10) & (g > 120)
floor = (r > 185) & (r - b > 55) & (g > 0.72 * r) & (g < 0.92 * r)
cand = teal | floor

# sàn nối với mép -> nền
m = Image.fromarray(np.where(cand, 255, 0).astype(np.uint8)).copy()
for x in range(0, W, 3):
    for y in (0, H - 1):
        if m.getpixel((x, y)) == 255:
            ImageDraw.floodfill(m, (x, y), 128)
for y in range(0, H, 3):
    for x in (0, W - 1):
        if m.getpixel((x, y)) == 255:
            ImageDraw.floodfill(m, (x, y), 128)
bg = (np.asarray(m) == 128) | teal
fig = ~bg

# (tâm thân, cột trái, cột phải)
SEEDS = [((190, 420), 40, 330), ((500, 420), 340, 598), ((740, 420), 598, 885), ((1010, 420), 885, 1145), ((1260, 420), 1145, 1400)]
for i, ((sx, sy), x0, x1) in enumerate(SEEDS, 1):
    col = np.zeros_like(fig); col[:, x0:x1] = True
    f = Image.fromarray(np.where(fig & col, 255, 0).astype(np.uint8)).copy()
    ImageDraw.floodfill(f, (sx, sy), 128)
    mask = np.asarray(f) == 128
    # lấp lỗ nhỏ trong thân (cúc áo, khe sáng) nhưng giữ khe tay-thân là nền
    mk = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    mask = (np.asarray(mk) > 127) & ~teal
    ys, xs = np.where(mask)
    y0, y1 = ys.min(), ys.max()
    # vệt kẻ sàn dính vào giày: mở hình thái ở phần chân rồi giữ lại khối chứa thân
    lo = int(y0 + 0.78 * (y1 - y0))
    op = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    mask[lo:] = (np.asarray(op) > 127)[lo:]
    f = Image.fromarray((mask * 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(f, (sx, sy), 128)
    mask = np.asarray(f) == 128
    # ông thứ 5 có ngôi sao lấp lánh vẽ đè lên ống quần: "clone stamp" từ đoạn ống quần ngay phía trên
    px = np.asarray(im).astype(float)
    if i == 5:
        y_a, y_b, x_a, x_b, up = 612, 680, 1258, 1318, 64
        px[y_a:y_b, x_a:x_b] = px[y_a - up:y_b - up, x_a:x_b]
        mask[y_a:y_b, x_a:x_b] = mask[y_a - up:y_b - up, x_a:x_b]
    # sàn gỗ lọt giữa hai ống quần (vùng kín, flood-fill từ mép không tới)
    lo = int(y0 + 0.8 * (y1 - y0))
    if i == 5:  # quần kaki của ông 3 trùng màu sàn nên chỉ áp cho ông 5
        mask[lo:] &= ~floor[lo:]
    f = Image.fromarray((mask * 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(f, (sx, sy), 128)
    mask = np.asarray(f) == 128
    src_im = Image.fromarray(px.clip(0, 255).astype(np.uint8))
    ys, xs = np.where(mask)
    y0, y1, xa, xb = ys.min(), ys.max(), xs.min(), xs.max()
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    rgba = src_im.copy(); rgba.putalpha(alpha)
    crop = rgba.crop((xa, y0, xb + 1, y1 + 1))
    S = 1024
    sc = 0.86 * S / max(crop.size)
    crop = crop.resize((round(crop.size[0] * sc), round(crop.size[1] * sc)), Image.LANCZOS)
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.paste(crop, ((S - crop.size[0]) // 2, (S - crop.size[1]) // 2), crop)
    canvas.save(os.path.join(out, f"newMan{i}.png"))
    gray = Image.new("RGB", (S, S), (128, 128, 128)); gray.paste(canvas, (0, 0), canvas)
    gray.save(os.path.join(out, f"newMan{i}_gray.png"))
    print(i, "bbox", (xa, y0, xb, y1), "px", int(mask.sum()))
