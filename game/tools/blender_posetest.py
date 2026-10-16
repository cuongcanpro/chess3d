"""Kiểm tra rig: tạo tư thế 'chỉ tay' (Damped Track tới điểm phía trước) rồi render chính diện + nghiêng.

blender -b -P blender_posetest.py -- <rigged_dir> <out_dir> [mode]
mode: point (mặc định) | weights (tô màu theo xương chi phối)
"""
import sys, os, math, colorsys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
mode = argv[2] if len(argv) > 2 else "point"
PREFIX = argv[3] if len(argv) > 3 else "oldMan"
os.makedirs(out, exist_ok=True)

for i in range(1, 6):
    name = f"{PREFIX}{i}"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, name + ".glb"))
    scn = bpy.context.scene
    arm = next(o for o in scn.objects if o.type == "ARMATURE")
    mesh = next(o for o in scn.objects if o.type == "MESH")

    if mode == "weights":
        # đỏ = xích tay trái, xanh = xích tay phải, vàng = spine; còn lại xám
        gname = {g.index: g.name for g in mesh.vertex_groups}
        attr = mesh.data.color_attributes.new("dom", "FLOAT_COLOR", "POINT")
        for v in mesh.data.vertices:
            wl = sum(g.weight for g in v.groups if gname[g.group].endswith(".L") and not gname[g.group].startswith(("thigh", "shin")))
            wr = sum(g.weight for g in v.groups if gname[g.group].endswith(".R") and not gname[g.group].startswith(("thigh", "shin")))
            ws = sum(g.weight for g in v.groups if gname[g.group] == "spine")
            base = 0.35 * (1 - wl - wr)
            attr.data[v.index].color = (base + wl + ws * 0.5, base + ws * 0.45, base + wr, 1)
        mesh.data.color_attributes.active_color = attr
    else:
        def track(bone, target):
            e = bpy.data.objects.new("t_" + bone, None)
            e.location = target
            scn.collection.objects.link(e)
            c = arm.pose.bones[bone].constraints.new("DAMPED_TRACK")
            c.target = e
        # glTF -> Blender: (x, y, z) -> (x, -z, y). Mục tiêu: phía trước (+Z glTF = -Y Blender), ngang ngực
        track("upperArm.L", Vector((0.55, -1.6, 0.6)))
        track("lowerArm.L", Vector((0.55, -1.6, 0.6)))
        track("upperArm.R", Vector((-0.6, -0.3, 1.6)))   # tay phải giơ lên cao
        track("lowerArm.R", Vector((-0.7, -0.3, 2.4)))
        pb = arm.pose.bones["spine"]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (math.radians(12), 0, 0)
        bpy.context.view_layer.update()

    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "VERTEX" if mode == "weights" else "TEXTURE"
    scn.render.resolution_x = scn.render.resolution_y = 700
    scn.world = bpy.data.worlds.new("w")
    cd = bpy.data.cameras.new("cam"); cd.type = "ORTHO"; cd.ortho_scale = 2.6
    cam = bpy.data.objects.new("cam", cd); scn.collection.objects.link(cam); scn.camera = cam
    for view, loc, rot in [("front", (0, -6, 0.1), (math.radians(90), 0, 0)),
                           ("side", (6, 0, 0.1), (math.radians(90), 0, math.radians(90))),
                           ("q34", (4.2, -4.2, 1.6), (math.radians(75), 0, math.radians(45))),
                           ("back", (0, 6, 0.1), (math.radians(90), 0, math.radians(180)))]:
        cam.location = loc; cam.rotation_euler = rot
        scn.render.filepath = os.path.join(out, f"{name}_{mode}_{view}.png")
        bpy.ops.render.render(write_still=True)
