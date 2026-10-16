"""Render nhanh mọi *.glb trong thư mục: chính diện / 3-4 / nghiêng / sau (Workbench, màu texture).

blender -b -P blender_turntable.py -- <glb_dir> <out_dir>
"""
import sys, os, math, glob
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
os.makedirs(out, exist_ok=True)

for path in sorted(glob.glob(os.path.join(src, "*.glb"))):
    name = os.path.splitext(os.path.basename(path))[0]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    scn = bpy.context.scene
    pts = [o.matrix_world @ Vector(c) for o in scn.objects if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    print("BBOX", name, tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi))
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "TEXTURE"
    scn.render.resolution_x = scn.render.resolution_y = 600
    scn.world = bpy.data.worlds.new("w")
    cd = bpy.data.cameras.new("cam"); cd.type = "ORTHO"; cd.ortho_scale = max(hi - lo) * 1.1
    cam = bpy.data.objects.new("cam", cd); scn.collection.objects.link(cam); scn.camera = cam
    # glTF +Z (phía trước) = Blender -Y
    for view, ang in (("front", 0), ("q34", 45), ("side", 90), ("back", 180)):
        a = math.radians(ang)
        cam.location = c + Vector((math.sin(a) * 6, -math.cos(a) * 6, 0))
        cam.rotation_euler = (math.radians(90), 0, a)
        scn.render.filepath = os.path.join(out, f"{name}_{view}.png")
        bpy.ops.render.render(write_still=True)
