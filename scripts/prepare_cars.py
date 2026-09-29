"""Turn the five Collect Car models into game-ready derby cars.

Reads ~/Collect Car/export/<car>.glb (the same files Patrick shared as URLs) and writes, per car:
  game/public/models/cars/<id>.glb   - the game asset, following ASSETS.md
  blend/car-<id>.blend               - the processed Blender file
and game/public/models/cars/cars.json (measured sizes).

What it does to each car:
  * merges the parts of every wheel into one object (origin at the wheel centre, axle along X);
  * splits glass, headlights, tail lights and glowing accents into their own objects;
  * picks a few parts that can be torn off in a crash (wings, splitters, mirrors, skid plates...);
  * joins the rest into Body, decimates everything to a game budget, then splits long edges so the
    body has vertices every ~15 cm to dent;
  * renames materials to the game's names and re-centres the car between its axles.

Run:  scripts/blender.sh -b --python scripts/prepare_cars.py -- [car ...]
"""

import bpy
import bmesh
import json
import math
import os
import re
import sys
from mathutils import Matrix, Vector

HOME = os.path.expanduser('~')
SRC = os.path.join(HOME, 'Collect Car', 'export')
ROOT = os.path.join(HOME, 'Demolition Derby')
OUT = os.path.join(ROOT, 'game', 'public', 'models', 'cars')
BLEND = os.path.join(ROOT, 'blend')

# Car order is the garage order.
CARS = ['hypercar', 'wedge', 'rally', 'endurance', 'streamliner']

# Parts that come loose in a crash, by source object name (regex) -> loose part name.
LOOSE = {
    'hypercar': [(r'Hypercar_(Wing|WingTip_[LR]|Pylon)$', 'Loose_Wing'),
                 (r'Hypercar_(Diffuser|Strake_\d)$', 'Loose_Diffuser'),
                 (r'Hypercar_Intake$', 'Loose_Intake')],
    'wedge': [(r'Wedge_(Chin|Fang_[LR])$', 'Loose_Chin'),
              (r'Wedge_Fin_L', 'Loose_FinL'),
              (r'Wedge_Fin_R', 'Loose_FinR'),
              (r'Wedge_Louvre_\d$', 'Loose_Louvres'),
              (r'Wedge_(Mirror|MirrorGlass|MirrorStalk)_L$', 'Loose_MirrorL'),
              (r'Wedge_(Mirror|MirrorGlass|MirrorStalk)_R$', 'Loose_MirrorR')],
    'rally': [(r'Rally_(Mirror|MirrorArm|MirrorGlass)_L$', 'Loose_MirrorL'),
              (r'Rally_(Mirror|MirrorArm|MirrorGlass)_R$', 'Loose_MirrorR'),
              (r'Rally_SkidPlate_F$', 'Loose_SkidPlateF'),
              (r'Rally_SkidPlate_R$', 'Loose_SkidPlateR'),
              (r'Rally_RoofScoop$', 'Loose_RoofScoop')],
    'endurance': [(r'Endurance_Fin$', 'Loose_Fin'),
                  (r'Endurance_(Splitter|Vane_.*)$', 'Loose_Splitter'),
                  (r'Endurance_(DiffuserBeam|Endplate_[LR]|Strake_.*)$', 'Loose_Diffuser')],
    'streamliner': [],
}

# Source material -> game material
MAT_MAP = [
    (r'^Paint|_Paint$|LiquidGraphite', 'Paint'),
    (r'^Trim_Black', 'Trim'),
    (r'^Carbon', 'Carbon'),
    (r'Glass', 'Glass'),
    (r'^Light_Red', 'Taillight'),
    (r'^Light_White|BrightRing', 'Glow'),
    (r'Wheel_Disc|DiscDark', 'Rim'),
    (r'Metal_Brushed', 'Metal'),
    (r'Tyre_Rubber', 'Tire'),
    (r'IntakeBlack|Void', 'Void'),
]

PREVIEW = {  # Blender preview colours only; the game repaints everything
    'Paint': (0.55, 0.05, 0.03, 1), 'Trim': (0.02, 0.02, 0.02, 1), 'Carbon': (0.03, 0.03, 0.035, 1),
    'Glass': (0.02, 0.03, 0.035, 1), 'Headlight': (1, 0.97, 0.9, 1), 'Taillight': (0.9, 0.05, 0.03, 1),
    'Glow': (0.6, 0.9, 1, 1), 'Rim': (0.5, 0.5, 0.52, 1), 'Metal': (0.6, 0.6, 0.6, 1), 'Tire': (0.02, 0.02, 0.02, 1),
    'Void': (0, 0, 0, 1),
}

BUDGET = {'Body': 15000, 'glass': 2600, 'light': 1400, 'glow': 1800, 'loose': 2200, 'wheel': 2600}
MAX_EDGE = 0.2  # body edge length after densifying (m)


def log(*a):
    print('[prepare]', *a, flush=True)


def game_mat(src_name):
    for pat, name in MAT_MAP:
        if re.search(pat, src_name):
            return name
    return 'Trim'


def get_mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        c = PREVIEW.get(name, (0.5, 0.5, 0.5, 1))
        if bsdf:
            bsdf.inputs['Base Color'].default_value = c
            if name in ('Headlight', 'Taillight', 'Glow'):
                bsdf.inputs['Emission Color'].default_value = c
                bsdf.inputs['Emission Strength'].default_value = 4.0
            if name in ('Metal', 'Rim'):
                bsdf.inputs['Metallic'].default_value = 1.0
    return m


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def world_bbox(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    return mn, mx


def bake(obj):
    """Apply the object's transform to its mesh (world-space data, identity transform)."""
    obj.data.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world.identity()


def merge(objs, name):
    """Join meshes (already baked) into a new object with a combined material list."""
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data
        remap = []
        for slot in o.material_slots:
            m = slot.material
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        n0 = len(bm.faces)
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[n0:]:
            f.material_index = remap[f.material_index] if remap else 0
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    return ob


def split_faces(obj, keep_mat_names, name):
    """Move faces whose material is in keep_mat_names into a new object. Returns it (or None)."""
    idx = {i for i, s in enumerate(obj.material_slots) if s.material and s.material.name in keep_mat_names}
    if not idx:
        return None
    new = obj.copy()
    new.data = obj.data.copy()
    new.name = name
    bpy.context.scene.collection.objects.link(new)
    for ob, keep in ((new, True), (obj, False)):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        dead = [f for f in bm.faces if (f.material_index in idx) != keep]
        bmesh.ops.delete(bm, geom=dead, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(ob.data)
        bm.free()
    if not new.data.polygons:
        bpy.data.objects.remove(new, do_unlink=True)
        return None
    return new


def islands(obj, min_faces=4):
    """Split an object into its connected pieces. Returns the new objects (obj is removed)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    seen = set()
    groups = []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack = [f]
        seen.add(f.index)
        comp = []
        while stack:
            g = stack.pop()
            comp.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        groups.append(comp)
    bm.free()
    out = []
    for gi, comp in enumerate(groups):
        if len(comp) < min_faces:
            continue
        keep = set(comp)
        ob = obj.copy()
        ob.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(ob)
        b2 = bmesh.new()
        b2.from_mesh(ob.data)
        b2.faces.ensure_lookup_table()
        bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index not in keep], context='FACES')
        bmesh.ops.delete(b2, geom=[v for v in b2.verts if not v.link_faces], context='VERTS')
        b2.to_mesh(ob.data)
        b2.free()
        out.append(ob)
    bpy.data.objects.remove(obj, do_unlink=True)
    return out


def decimate(obj, target, sym=False):
    t = tris(obj)
    if t <= target:
        return
    mod = obj.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(0.01, target / t)
    mod.use_symmetry = sym
    mod.symmetry_axis = 'X'
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    me.name = old.name
    bpy.data.meshes.remove(old)


def densify(obj, max_edge):
    """Split edges longer than max_edge so dents have vertices to move."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for _ in range(6):
        long_edges = [e for e in bm.edges if e.calc_length() > max_edge]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(obj.data)
    bm.free()


def smooth(obj, angle=40):
    me = obj.data
    me.shade_smooth()
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except Exception as e:  # older API
        log('sharp-from-angle unavailable:', e)


def remap_materials(obj, light_role=None):
    """Swap source materials for game-named ones. light_role: 'Headlight' turns Light_White into Headlight."""
    for slot in obj.material_slots:
        src = slot.material.name if slot.material else 'Trim'
        name = game_mat(src)
        if name == 'Glow' and light_role == 'Headlight' and 'Light_White' in src:
            name = 'Headlight'
        slot.material = get_mat(name)


def process(car):
    src = os.path.join(SRC, f'{car}.glb')
    log('====', car, src)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    empties = [o for o in bpy.context.scene.objects if o.type == 'EMPTY']
    for o in meshes:
        o.data = o.data.copy()  # instanced meshes (strakes, fins) must not share data after baking
        bake(o)
    for e in empties:
        bpy.data.objects.remove(e, do_unlink=True)
    src_tris = sum(tris(o) for o in meshes)

    # ---------------- wheels ----------------
    wheel_groups = {}
    for o in list(meshes):
        m = re.search(r'_Wheel_(FL|FR|RL|RR)_', o.name)
        if m:
            wheel_groups.setdefault(m.group(1), []).append(o)
            meshes.remove(o)
    wheels = []
    for key, parts in wheel_groups.items():
        mn, mx = world_bbox(parts)
        c = (mn + mx) / 2
        for p in parts:
            remap_materials(p)
        w = merge(parts, f'tmp_wheel_{key}')
        decimate(w, BUDGET['wheel'])
        w.data.transform(Matrix.Translation(-c))
        w.location = c
        smooth(w, 50)
        wheels.append(w)
    # name by geometry: front = -Y in Blender, left = +X
    for w in wheels:
        front = w.location.y < 0
        left = w.location.x > 0
        w.name = f"Wheel_{'F' if front else 'R'}{'L' if left else 'R'}"
        w.data.name = w.name

    # ---------------- loose parts ----------------
    loose = {}
    for pat, name in LOOSE.get(car, []):
        for o in list(meshes):
            if re.search(pat, o.name):
                loose.setdefault(name, []).append(o)
                meshes.remove(o)
    loose_objs = []
    for name, parts in loose.items():
        for p in parts:
            remap_materials(p)
        ob = merge(parts, name)
        decimate(ob, BUDGET['loose'])
        smooth(ob)
        loose_objs.append(ob)

    # ---------------- glass ----------------
    glass_mats = {m.name for m in bpy.data.materials if re.search('Glass', m.name)}
    glass_pieces = []
    for o in list(meshes):
        names = {s.material.name for s in o.material_slots if s.material}
        if names and names <= glass_mats:
            glass_pieces.append(o)
            meshes.remove(o)
        elif names & glass_mats:
            g = split_faces(o, glass_mats, o.name + '_glass')
            if g:
                glass_pieces.append(g)
    glass = []
    for g in glass_pieces:
        remap_materials(g)
        big = tris(g)
        parts = islands(g, min_faces=2) if big < 60000 else [g]
        glass.extend(parts)
    glass = [g for g in glass if tris(g) >= 2]

    # ---------------- lights & glow ----------------
    mn, mx = world_bbox(meshes)
    L = mx.y - mn.y
    heads, tails, glows = [], [], []
    for o in list(meshes):
        names = [s.material.name for s in o.material_slots if s.material]
        if names and all('Light_Red' in n for n in names):
            tails.append(o)
            meshes.remove(o)
        elif names and all(('Light_White' in n or 'BrightRing' in n) for n in names):
            omn, omx = world_bbox([o])
            cy = (omn.y + omx.y) / 2
            (heads if cy < mn.y + L * 0.3 else glows).append(o)
            meshes.remove(o)
    lights = []
    for i, o in enumerate(sorted(heads, key=lambda o: world_bbox([o])[0].x)):
        remap_materials(o, 'Headlight')
        o.name = f'Light_F{i + 1}'
        decimate(o, BUDGET['light'])
        lights.append(o)
    for i, o in enumerate(tails):
        remap_materials(o)
        o.name = f'Light_R{i + 1}'
        decimate(o, BUDGET['light'])
        lights.append(o)
    glow_objs = []
    for i, o in enumerate(glows):
        remap_materials(o)
        o.name = f'Glow_{i + 1}'
        decimate(o, BUDGET['glow'])
        glow_objs.append(o)
    for o in lights + glow_objs:
        smooth(o)

    # ---------------- body ----------------
    for o in meshes:
        remap_materials(o)
    body = merge(meshes, 'Body')
    t0 = tris(body)
    decimate(body, BUDGET['Body'], sym=True)
    t1 = tris(body)
    densify(body, MAX_EDGE)
    smooth(body)
    log(f'body {t0} -> {t1} -> {tris(body)} tris after densify')

    # glass: decimate, name by position
    gl = []
    for g in glass:
        decimate(g, BUDGET['glass'])
        smooth(g, 60)
        gmn, gmx = world_bbox([g])
        gl.append((g, (gmn + gmx) / 2, gmx - gmn))
    def avg_normal(o):
        n = Vector((0, 0, 0))
        for p in o.data.polygons:
            n += p.normal * p.area
        return n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))

    gl.sort(key=lambda t: -(t[2].x * t[2].y + t[2].y * t[2].z + t[2].x * t[2].z))
    used = set()
    glass_named = []

    def unique(base):
        if base not in used:
            used.add(base)
            return base
        k = 2
        while f'{base}{k}' in used:
            k += 1
        used.add(f'{base}{k}')
        return f'{base}{k}'

    for g, c, s in gl:
        area = sum(p.area for p in g.data.polygons)
        if area < 0.03:  # mirror glass and slivers: keep as body detail
            g.name = f'Detail_Glass{len(glass_named)}'
            glass_named.append(g)
            continue
        gmn, gmx = world_bbox([g])
        spans = gmn.x < -0.15 and gmx.x > 0.15
        n = avg_normal(g)
        if not spans:
            name = unique('Glass_L' if c.x > 0 else 'Glass_R')
        elif n.y > 0.35 and c.y > 0:  # faces backwards (Blender +Y is the rear)
            name = unique('Glass_Rear')
        else:
            name = unique('Glass_Front')  # windscreens and roof bubbles
        g.name = name
        glass_named.append(g)

    # ---------------- recentre between the axles, wheels on the ground ----------------
    fy = [w.location.y for w in wheels if w.name.startswith('Wheel_F')]
    ry = [w.location.y for w in wheels if w.name.startswith('Wheel_R')]
    mid_y = (sum(fy) / len(fy) + sum(ry) / len(ry)) / 2
    everything = [body] + wheels + loose_objs + glass_named + lights + glow_objs
    lowest = min(w.location.z - (world_bbox([w])[1].z - world_bbox([w])[0].z) / 2 for w in wheels)
    shift = Vector((0, -mid_y, -lowest))
    for o in everything:
        if o.name.startswith('Wheel_'):
            o.location += shift
        else:
            o.data.transform(Matrix.Translation(shift))

    root = bpy.data.objects.new(f'Car_{car}', None)
    bpy.context.scene.collection.objects.link(root)
    for o in everything:
        o.parent = root

    # ---------------- report & export ----------------
    total = sum(tris(o) for o in everything)
    log(f'{car}: {src_tris} -> {total} tris; parts:', ', '.join(f'{o.name}({tris(o)})' for o in everything))
    bmn, bmx = world_bbox([body])
    wf = [w for w in wheels if w.name.startswith('Wheel_F')]
    wr = [w for w in wheels if w.name.startswith('Wheel_R')]
    rad = lambda w: (world_bbox([w])[1].z - world_bbox([w])[0].z) / 2
    info = {
        'id': car,
        'file': f'{car}.glb',
        'length': round(bmx.y - bmn.y, 3),
        'width': round(bmx.x - bmn.x, 3),
        'height': round(max(world_bbox(everything)[1].z, bmx.z), 3),
        'wheelbase': round(abs(sum(w.location.y for w in wf) / len(wf) - sum(w.location.y for w in wr) / len(wr)), 3),
        'trackFront': round(abs(wf[0].location.x) * 2, 3),
        'trackRear': round(abs(wr[0].location.x) * 2, 3),
        'wheelRadiusFront': round(rad(wf[0]), 3),
        'wheelRadiusRear': round(rad(wr[0]), 3),
        'triangles': total,
        'parts': sorted(o.name for o in everything),
    }
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(BLEND, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in everything:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f'{car}.glb'),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_materials='EXPORT',
    )
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND, f'car-{car}.blend'))
    return info


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    cars = argv or CARS
    manifest_path = os.path.join(OUT, 'cars.json')
    manifest = []
    if os.path.exists(manifest_path):
        try:
            manifest = json.load(open(manifest_path))
        except Exception:
            manifest = []
    by_id = {m['id']: m for m in manifest}
    for car in cars:
        by_id[car] = process(car)
    ordered = [by_id[c] for c in CARS if c in by_id]
    json.dump(ordered, open(manifest_path, 'w'), indent=1)
    log('wrote', manifest_path)


main()
