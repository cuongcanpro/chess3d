"""Render ảnh chính diện + nghiêng (orthographic) của các model để đo khớp xương.

blender -b -P blender_views.py -- <glb_dir> <out_dir>
Toạ độ trong ảnh là toạ độ glTF gốc (Y lên, nhân vật nhìn về +Z).
"""
import sys, os, math
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
glb_dir, out_dir = argv[0], argv[1]
PREFIX = argv[2] if len(argv) > 2 else "oldMan"
os.makedirs(out_dir, exist_ok=True)
RES, ORTHO = 900, 2.4

for i in range(1, 6):
    name = f"{PREFIX}{i}"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(glb_dir, name + ".glb"))
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "TEXTURE"
    scn.render.resolution_x = scn.render.resolution_y = RES
    scn.render.film_transparent = False
    scn.world = bpy.data.worlds.new("w")
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO
    cam = bpy.data.objects.new("cam", cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam
    # glTF (x, y, z) -> Blender (x, -z, y)
    for view, loc, rot in [
        ("front", (0, -6, 0), (math.radians(90), 0, 0)),          # nhìn từ glTF +Z
        ("side", (6, 0, 0), (math.radians(90), 0, math.radians(90))),  # nhìn từ glTF +X
    ]:
        cam.location = loc
        cam.rotation_euler = rot
        scn.render.filepath = os.path.join(out_dir, f"{name}_{view}.png")
        bpy.ops.render.render(write_still=True)
