"""Vẽ lưới toạ độ glTF lên ảnh render (và khớp xương nếu có rig json).

py -3 grid_overlay.py <views_dir> [rig.json]
"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

RES, ORTHO = 900, 2.4
views_dir = sys.argv[1]
rig = json.load(open(sys.argv[2], encoding="utf-8")) if len(sys.argv) > 2 and sys.argv[2] != '-' else {}
PREFIX = sys.argv[3] if len(sys.argv) > 3 else "oldMan"
font = ImageFont.load_default()

def to_px(u, v):  # u: trục ngang màn hình, v: trục dọc (glTF Y)
    return ((u + ORTHO / 2) / ORTHO * RES, (ORTHO / 2 - v) / ORTHO * RES)

BONES = [("pelvis", "neck"), ("neck", "head"),
         ("shoulderL", "elbowL"), ("elbowL", "wristL"), ("wristL", "handL"),
         ("shoulderR", "elbowR"), ("elbowR", "wristR"), ("wristR", "handR"),
         ("neck", "shoulderL"), ("neck", "shoulderR")]

for i in range(1, 6):
    name = f"{PREFIX}{i}"
    tiles = []
    for view in ("front", "side"):
        im = Image.open(os.path.join(views_dir, f"{name}_{view}.png")).convert("RGB")
        d = ImageDraw.Draw(im)
        for k in range(-12, 13):
            val = k / 10
            col = (255, 230, 0) if k % 5 == 0 else (120, 120, 120)
            x, _ = to_px(val, 0); _, y = to_px(0, val)
            d.line([(x, 0), (x, RES)], fill=col, width=1)
            d.line([(0, y), (RES, y)], fill=col, width=1)
            d.text((x + 2, RES - 12), f"{val:.1f}", fill=(255, 255, 0), font=font)
            d.text((2, y - 11), f"{val:.1f}", fill=(255, 255, 0), font=font)
        j = rig.get(name, {}).get("joints")
        if j:
            # front: u = x ; side: u = -z
            P = (lambda p: to_px(p[0], p[1])) if view == "front" else (lambda p: to_px(-p[2], p[1]))
            for a, b in BONES:
                if a in j and b in j:
                    d.line([P(j[a]), P(j[b])], fill=(0, 255, 120), width=3)
            for n, p in j.items():
                x, y = P(p)
                c = (60, 200, 255) if n.endswith("L") else (255, 90, 60) if n.endswith("R") else (255, 255, 255)
                d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=c)
                d.text((x + 7, y - 5), n, fill=c, font=font)
        d.text((8, 8), f"{name} {view}  ({'u=+X: tay TRAI' if view == 'front' else 'u=-Z: trai = phia truoc'})", fill=(255, 255, 255), font=font)
        tiles.append(im)
    out = Image.new("RGB", (RES * 2, RES))
    out.paste(tiles[0], (0, 0)); out.paste(tiles[1], (RES, 0))
    out.save(os.path.join(views_dir, f"{name}_grid.png"))
print("ok")
