"""Gắn xương cho các model Hunyuan3D (không có skeleton) rồi xuất GLB có skin.

blender -b -P blender_rig.py -- <glb_dir> <rig.json> <out_dir>

Model Hunyuan là một khối liền: tay dính vào hông, bàn tay dính vào đầu gối. Nếu chỉ dùng
Automatic Weights thì giơ tay sẽ kéo giãn cả mảng thân/đùi. Vì vậy:
 1. Phân vùng đỉnh: tay trái / tay phải / thân, bằng khoảng cách chuẩn hoá tới các "con nhộng"
    (vai-khuỷu-cổ tay-bàn tay) so với thân (elip), đùi, đầu.
 2. Cắt các mặt "cầu nối" giữa tay và thân (trừ vùng vai), vá lỗ, tô UV vá theo đỉnh lân cận.
 3. Thân: trọng số Automatic Weights (bỏ nhóm xương tay). Tay: trọng số tự tính dọc theo xích
    upperArm -> lowerArm -> hand, hoà dần vào spine ở vai.
Toạ độ trong rig.json là glTF gốc (Y lên, nhìn về +Z).
"""
import json, math, os, sys
import bpy, bmesh
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb_dir, rig_path, out_dir = argv
os.makedirs(out_dir, exist_ok=True)
RIGS = json.load(open(rig_path, encoding="utf-8"))

def B(p):  # glTF (x, y, z) -> Blender (x, -z, y)
    return Vector((p[0], -p[2], p[1]))

BONES = [  # name, head, tail, parent, connect
    ("root", "_root", "pelvis", None, False),
    ("spine", "pelvis", "neck", "root", False),
    ("head", "neck", "head", "spine", True),
    ("upperArm.L", "shoulderL", "elbowL", "spine", False),
    ("lowerArm.L", "elbowL", "wristL", "upperArm.L", True),
    ("hand.L", "wristL", "handL", "lowerArm.L", True),
    ("upperArm.R", "shoulderR", "elbowR", "spine", False),
    ("lowerArm.R", "elbowR", "wristR", "upperArm.R", True),
    ("hand.R", "wristR", "handR", "lowerArm.R", True),
    ("thigh.L", "hipL", "kneeL", "root", False),
    ("shin.L", "kneeL", "ankleL", "thigh.L", True),
    ("thigh.R", "hipR", "kneeR", "root", False),
    ("shin.R", "kneeR", "ankleR", "thigh.R", True),
]
ARM_GROUPS = {s: [f"upperArm.{s}", f"lowerArm.{s}", f"hand.{s}"] for s in "LR"}

def seg(P, a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    ab = b - a
    t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    C = a + t[:, None] * ab
    return np.linalg.norm(P - C, axis=1), t, C

def smoothstep(e0, e1, x):
    k = np.clip((x - e0) / (e1 - e0), 0, 1)
    return k * k * (3 - 2 * k)

def label_vertices(G, J, prm):
    """0 = thân, 1 = tay trái, 2 = tay phải. Trả về nhãn + dữ liệu xích tay để tính trọng số."""
    ra = prm["arm"]
    rx, rz = prm["torso"]
    rt = prm["thigh"]
    # thân: elip quanh đoạn pelvis-neck
    _, _, C = seg(G, J["pelvis"], J["neck"])
    d = G - C
    body = np.sqrt((d[:, 0] / rx) ** 2 + (d[:, 2] / rz) ** 2 + (d[:, 1] / rx) ** 2)
    for s in "LR":
        for a, b in ((f"hip{s}", f"knee{s}"), (f"knee{s}", f"ankle{s}")):
            body = np.minimum(body, seg(G, J[a], J[b])[0] / rt)
    body = np.minimum(body, seg(G, J["neck"], J["head"])[0] / prm.get("headR", 0.34))

    lab = np.zeros(len(G), int)
    chain = {}
    best = np.full(len(G), np.inf)
    for k, s in enumerate("LR", start=1):
        segs = [(f"shoulder{s}", f"elbow{s}", ra), (f"elbow{s}", f"wrist{s}", ra * 0.95), (f"wrist{s}", f"hand{s}", ra * prm.get("handK", 1.3))]
        dn = np.full(len(G), np.inf); si = np.zeros(len(G), int); ti = np.zeros(len(G))
        for i, (a, b, r) in enumerate(segs):
            dd, t, _ = seg(G, J[a], J[b])
            better = dd / r < dn
            dn[better], si[better], ti[better] = (dd / r)[better], i, t[better]
        arm = (dn < body * prm.get("bias", 1.0)) & (dn < 1.7) & (dn < best)
        lab[arm] = k
        best = np.where(arm, dn, best)
        chain[s] = (si, ti, np.linalg.norm(G - np.asarray(J[f"shoulder{s}"]), axis=1))
    return lab, chain

def largest_component(bm, lay, k):
    """Giữ thành phần liên thông lớn nhất của nhãn k (bỏ các mảnh lẻ bị gán nhầm)."""
    seen, comps = set(), []
    for v in bm.verts:
        if v[lay] != k or v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            u = stack.pop(); comp.append(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w[lay] == k and w.index not in seen:
                    seen.add(w.index); stack.append(w)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    for comp in comps[1:]:
        for v in comp:
            v[lay] = 0
    return len(comps[0]) if comps else 0

report = {}
for name, rig in RIGS.items():
    J = {k: list(v) for k, v in rig["joints"].items()}
    J["_root"] = [J["pelvis"][0], J["pelvis"][1] - 0.35, J["pelvis"][2]]
    prm = rig.get("params", {})
    prm.setdefault("arm", 0.1); prm.setdefault("torso", [0.28, 0.24]); prm.setdefault("thigh", 0.13)
    ra = prm["arm"]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(glb_dir, name + ".glb"))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in bpy.context.scene.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # ---------- 1. gộp đỉnh trùng + phân vùng
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.verts.ensure_lookup_table(); bm.verts.index_update()
    co = np.array([v.co[:] for v in bm.verts])
    G = np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)
    lab, _ = label_vertices(G, J, prm)
    lay = bm.verts.layers.int.new("lab")
    for v in bm.verts:
        v[lay] = int(lab[v.index])
    sizes = {k: largest_component(bm, lay, k) for k in (1, 2)}
    # mảnh "thân" lẻ nằm kẹp trong tay (đầu ngón, cổ tay áo) -> theo tay kề bên
    seen = set()
    for v in bm.verts:
        if v[lay] != 0 or v.index in seen:
            continue
        stack, comp, nb = [v], [], {}
        seen.add(v.index)
        while stack:
            u = stack.pop(); comp.append(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w[lay] == 0:
                    if w.index not in seen:
                        seen.add(w.index); stack.append(w)
                else:
                    nb[w[lay]] = nb.get(w[lay], 0) + 1
        if len(comp) < 400 and nb:
            k = max(nb, key=nb.get)
            for u in comp:
                u[lay] = k

    # ---------- 2. cắt cầu nối tay-thân (trừ vùng vai), vá lỗ
    sh = {1: np.asarray(J["shoulderL"]), 2: np.asarray(J["shoulderR"])}
    def near_shoulder(v):
        g = np.array([v.co.x, v.co.z, -v.co.y])
        return min(np.linalg.norm(g - sh[1]), np.linalg.norm(g - sh[2])) < 1.9 * ra
    bridge = []
    for f in bm.faces:
        ls = {v[lay] for v in f.verts}
        if len(ls) > 1 and not all(near_shoulder(v) for v in f.verts):
            bridge.append(f)
    rim = {v for f in bridge for v in f.verts}
    bmesh.ops.delete(bm, geom=bridge, context="FACES")
    uv = bm.loops.layers.uv.active
    bnd = [e for e in bm.edges if e.is_boundary and e.verts[0] in rim and e.verts[1] in rim]
    filled = bmesh.ops.holes_fill(bm, edges=bnd, sides=0)["faces"]
    # lỗ chạy vòng qua cả mép tay lẫn mép thân thì không vá (sẽ thành màng nối tay với hông)
    mixed = [f for f in filled if len({v[lay] for v in f.verts}) > 1]
    bmesh.ops.delete(bm, geom=mixed, context="FACES_ONLY")
    filled = [f for f in filled if f.is_valid]
    # các lỗ đó: tách mép theo nhãn thành từng đoạn hở, mỗi đoạn tự khép lại bằng một nắp riêng
    # (vd. chỗ bàn tay đặt trên đùi -> đùi có nắp, bàn tay có nắp, không có màng nối)
    for k in sorted({v[lay] for v in rim if v.is_valid}):
        E = [e for e in bm.edges if e.is_boundary and all(v in rim and v[lay] == k for v in e.verts)]
        adj = {}
        for e in E:
            for v in e.verts:
                adj.setdefault(v, []).append(e)
        seen = set()
        for e0 in E:
            if e0 in seen:
                continue
            comp, stack = set(), [e0]
            while stack:
                e = stack.pop()
                if e in comp:
                    continue
                comp.add(e)
                for v in e.verts:
                    stack.extend(adj[v])
            seen |= comp
            vs = {v for e in comp for v in e.verts}
            ends = [v for v in vs if len(adj[v]) == 1]
            if len(ends) != 2 or any(len(adj[v]) > 2 for v in vs) or len(vs) < 3:
                continue
            order, prev = [ends[0]], None
            while len(order) < len(vs):
                nxt = next((x.other_vert(order[-1]) for x in adj[order[-1]] if x.other_vert(order[-1]) is not prev), None)
                if nxt is None:
                    break
                prev = order[-1]; order.append(nxt)
            # "khoá kéo": chia đoạn hở làm hai nửa theo chiều dài, nối hai mép đối diện bằng dải tam giác
            # (một ngon to sẽ thành màng căng từ nách xuống tận đùi)
            L = [0.0]
            for u, w in zip(order, order[1:]):
                L.append(L[-1] + (u.co - w.co).length)
            mid = min(range(len(order)), key=lambda q: abs(L[q] - L[-1] / 2))
            A, Bv = order[:mid + 1], order[mid:][::-1]
            ia = ib = 0
            while ia < len(A) - 1 or ib < len(Bv) - 1:
                if ib >= len(Bv) - 1 or (ia < len(A) - 1 and (A[ia + 1].co - Bv[ib].co).length < (A[ia].co - Bv[ib + 1].co).length):
                    tri = (A[ia], A[ia + 1], Bv[ib]); ia += 1
                else:
                    tri = (A[ia], Bv[ib + 1], Bv[ib]); ib += 1
                if len(set(tri)) == 3:
                    try:
                        filled.append(bm.faces.new(tri))
                    except ValueError:
                        pass
    fset = set(filled)
    for f in filled:
        # mỗi góc lấy UV của chính đỉnh đó (ở mặt gốc) -> texture nội suy mượt giữa hai mép
        # texture Hunyuan bị chia nhiều mảnh: chỉ nội suy khi 3 góc cùng một mảnh (UV gần nhau), không thì tô một màu
        own = [next((k for k in l.vert.link_loops if k.face not in fset), None) for l in f.loops]
        src = next((k for k in own if k is not None), None)
        if src is None:
            continue
        def inner(k):  # UV ở mép mảng texture hay dính viền đen của atlas -> kéo vào giữa mặt gốc
            c = sum((q[uv].uv for q in k.face.loops), Vector((0.0, 0.0))) / len(k.face.loops)
            return k[uv].uv.lerp(c, 0.6)
        uvs = [inner(k or src) for k in own]
        span = max((p - q).length for p in uvs for q in uvs)
        flat = inner(src)
        for l, u in zip(f.loops, uvs):
            l[uv].uv = u if span < 0.02 else flat
        f.material_index = src.face.material_index
    bmesh.ops.triangulate(bm, faces=filled)
    open_edges = sum(1 for e in bm.edges if e.is_boundary)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh.data); bm.free()
    mesh.data.update()
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(60))

    # nhãn sau khi cắt (đọc lại từ thuộc tính)
    labs = np.array([a.value for a in mesh.data.attributes["lab"].data])
    co = np.array([v.co[:] for v in mesh.data.vertices])
    G = np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)

    # ---------- 3. armature + trọng số
    arm_data = bpy.data.armatures.new(name + "_rig")
    arm = bpy.data.objects.new(name + "_rig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for bn, h, t, parent, connect in BONES:
        b = arm_data.edit_bones.new(bn)
        b.head, b.tail = B(J[h]), B(J[t])
        if parent:
            b.parent = eb[parent]; b.use_connect = connect
        eb[bn] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.context.scene.objects:
        o.select_set(o in (mesh, arm))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    VG = {g.name: g for g in mesh.vertex_groups}
    for n, *_ in BONES:
        if n not in VG:
            VG[n] = mesh.vertex_groups.new(name=n)
    idx2name = {g.index: g.name for g in mesh.vertex_groups}

    # thân: bỏ ảnh hưởng của xương tay (trừ vùng vai), đỉnh trống -> root
    for s, k in (("L", 1), ("R", 2)):
        dsh = np.linalg.norm(G - np.asarray(J[f"shoulder{s}"]), axis=1)
        body_ids = np.where((labs != k) & (dsh > 1.2 * ra))[0].tolist()
        for gname in ARM_GROUPS[s]:
            VG[gname].remove(body_ids)
    for v in mesh.data.vertices:
        if sum(g.weight for g in v.groups) < 1e-4:
            VG["root"].add([v.index], 1.0, "REPLACE")

    # tay: trọng số dọc xích, hoà vào spine ở vai
    for s, k in (("L", 1), ("R", 2)):
        ids = np.where(labs == k)[0]
        if not len(ids):
            continue
        P = G[ids]
        segs = [(f"shoulder{s}", f"elbow{s}"), (f"elbow{s}", f"wrist{s}"), (f"wrist{s}", f"hand{s}")]
        D = []; T = []
        for a, b in segs:
            dd, t, _ = seg(P, J[a], J[b]); D.append(dd); T.append(t)
        D = np.array(D); T = np.array(T)
        si = D.argmin(0); t = T[si, np.arange(len(ids))]
        w = np.zeros((len(ids), 4))  # spine, upper, lower, hand
        up = si == 0; lo = si == 1; ha = si == 2
        b1 = smoothstep(0.75, 1.0, t)
        w[up, 1] = 1 - 0.5 * b1[up]; w[up, 2] = 0.5 * b1[up]
        b0 = 1 - smoothstep(0.0, 0.25, t); b2 = smoothstep(0.75, 1.0, t)
        w[lo, 1] = 0.5 * b0[lo]; w[lo, 3] = 0.5 * b2[lo]; w[lo, 2] = 1 - w[lo, 1] - w[lo, 3]
        b3 = 1 - smoothstep(0.0, 0.3, t)
        w[ha, 2] = 0.5 * b3[ha]; w[ha, 3] = 1 - w[ha, 2]
        dsh = np.linalg.norm(P - np.asarray(J[f"shoulder{s}"]), axis=1)
        sp = 1 - smoothstep(0.3 * ra, 1.6 * ra, dsh)
        w[:, 1:] *= (1 - sp)[:, None]; w[:, 0] = sp
        names = ["spine"] + ARM_GROUPS[s]
        for gname in list(VG):
            VG[gname].remove(ids.tolist())
        for j, gname in enumerate(names):
            for vid, ww in zip(ids, w[:, j]):
                if ww > 1e-3:
                    VG[gname].add([int(vid)], float(ww), "REPLACE")

    bpy.context.view_layer.objects.active = mesh
    for o in bpy.context.scene.objects:
        o.select_set(o is mesh)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    if "lab" in mesh.data.attributes:
        mesh.data.attributes.remove(mesh.data.attributes["lab"])

    report[name] = {"verts": len(mesh.data.vertices), "armL": int((labs == 1).sum()), "armR": int((labs == 2).sum()),
                    "bridgeFaces": len(bridge), "filled": len(filled), "openEdges": open_edges, "components": sizes}
    for o in bpy.context.scene.objects:
        o.select_set(o in (mesh, arm))
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out_dir, name + ".glb"), export_format="GLB",
        use_selection=True, export_skins=True, export_animations=False,
        export_yup=True, export_image_format="AUTO", export_attributes=False,
    )

print("RIG_REPORT " + json.dumps(report))
