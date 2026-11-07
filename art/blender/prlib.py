"""prlib: Blender 5.2 helpers for Packet Run GLB models (storybook toon, base colours only).

Units: 1 = 1 m. Blender Z up, model front = Blender +Y  ->  glTF/Three: Y up, front = -Z.
Materials carry a flat base colour only (no baked light); the engine converts them to toon by NAME.
Geometry is merged per node with a temp-bmesh builder (B). Preview renders use a toon look made here
(Shader-to-RGB ramp + inverted-hull outline) that approximates the engine.
"""
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'assets', 'models')
TEX = os.path.join(ROOT, 'public', 'assets', 'tex')
RAW = os.path.join(ROOT, 'art', '_raw')
PREV = os.path.join(RAW, 'previews')
TAU = 2 * math.pi


def args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def hexlin(h):
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras,
                 bpy.data.images, bpy.data.worlds):
        for b in list(coll):
            coll.remove(b)


# ===================================================================== materials
def M(name, hexc='#ffffff', emit=0.0, rough=0.7, metal=0.0, image=None, alpha=None):
    """Get or create a flat material. The first definition in a model wins (names are roles)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    c = (*hexlin(hexc), 1.0)
    bsdf.inputs['Base Color'].default_value = c
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = c
        bsdf.inputs['Emission Strength'].default_value = emit
    if image:
        img = bpy.data.images.load(image)
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = img
        nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
        nt.links.new(tn.outputs['Alpha'], bsdf.inputs['Alpha'])
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
    m.diffuse_color = c
    m['hex'] = hexc
    m['emit'] = float(emit)
    m['img'] = image or ''
    return m


# ===================================================================== mesh builder
def _mtx(loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    q = Euler(rot).to_quaternion()
    return Matrix.LocRotScale(Vector(loc), q, Vector(scale) if scale else None)


def align_mtx(loc, normal, up=(0, 0, 1), spin=0.0):
    """Matrix whose local +Z points along `normal`, located at loc."""
    n = Vector(normal).normalized()
    q = n.to_track_quat('Z', 'Y' if abs(n.z) > 0.9 else 'Z')
    m = q.to_matrix().to_4x4()
    if spin:
        m = m @ Matrix.Rotation(spin, 4, 'Z')
    m.translation = Vector(loc)
    return m


class B:
    """Accumulates primitives (each built in a temp bmesh) into one mesh with material slots."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def mi(self, mat):
        if isinstance(mat, str):
            mat = bpy.data.materials[mat]
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def merge(self, tbm, mat=None, smooth=False, matrix=None, keep=False):
        if mat is not None:
            i = self.mi(mat)
            for f in tbm.faces:
                f.material_index = i
                f.smooth = smooth
        if matrix is not None:
            bmesh.ops.transform(tbm, matrix=matrix, verts=tbm.verts)
        me = bpy.data.meshes.new('_tmp')
        tbm.to_mesh(me)
        if not keep:
            tbm.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    # ---- primitives (all return self for chaining) ----
    def box(self, size, loc=(0, 0, 0), mat='Trim', rot=(0, 0, 0), bevel=0.0, seg=1, taper=None, matrix=None,
            smooth=False):
        t = bmesh.new()
        bmesh.ops.create_cube(t, size=1.0)
        bmesh.ops.scale(t, vec=Vector(size), verts=t.verts)
        if taper:
            for v in t.verts:
                if v.co.z > 0:
                    v.co.x *= taper[0]
                    v.co.y *= taper[1]
                    if len(taper) > 2:
                        v.co.y += taper[2]
        if bevel:
            bmesh.ops.bevel(t, geom=list(t.edges), offset=bevel, segments=seg, affect='EDGES', profile=0.5,
                            clamp_overlap=True)
        self.merge(t, mat, smooth, matrix if matrix is not None else _mtx(loc, rot))
        return self

    def cyl(self, r1, h, loc=(0, 0, 0), mat='Trim', rot=(0, 0, 0), r2=None, seg=16, smooth=True, caps=True,
            matrix=None, scale=None):
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1,
                              radius2=r1 if r2 is None else r2, depth=h)
        if scale:
            bmesh.ops.scale(t, vec=Vector(scale), verts=t.verts)
        t.normal_update()
        i = self.mi(mat)
        for f in t.faces:
            f.material_index = i
            f.smooth = smooth and abs(f.normal.z) < 0.7
        self.merge(t, None, matrix=matrix if matrix is not None else _mtx(loc, rot))
        return self

    def sphere(self, r, loc=(0, 0, 0), mat='Trim', scale=(1, 1, 1), rot=(0, 0, 0), seg=12, rings=8, matrix=None,
               cut=None):
        t = bmesh.new()
        bmesh.ops.create_uvsphere(t, u_segments=seg, v_segments=rings, radius=r)
        if cut is not None:   # keep the part with z >= cut*r (dome)
            bmesh.ops.bisect_plane(t, geom=list(t.verts) + list(t.edges) + list(t.faces), plane_co=(0, 0, cut * r),
                                   plane_no=(0, 0, 1), clear_inner=True)
            edges = [e for e in t.edges if e.is_boundary]
            if edges:
                bmesh.ops.holes_fill(t, edges=edges, sides=0)
        bmesh.ops.scale(t, vec=Vector(scale), verts=t.verts)
        i = self.mi(mat)
        for f in t.faces:
            f.material_index = i
            f.smooth = True
        self.merge(t, None, matrix=matrix if matrix is not None else _mtx(loc, rot))
        return self

    def lathe(self, prof, loc=(0, 0, 0), mat='Trim', rot=(0, 0, 0), seg=16, smooth=True, matrix=None,
              mats=None, cap0=False, cap1=False):
        """Revolve profile [(r, z), ...] around Z. mats: optional per-segment-of-profile material list."""
        t = bmesh.new()
        rings = []
        for (r, z) in prof:
            ring = []
            for k in range(seg):
                a = TAU * k / seg
                ring.append(t.verts.new((r * math.cos(a), r * math.sin(a), z)))
            rings.append(ring)
        idx = [self.mi(m) for m in (mats or [mat] * (len(prof) - 1))]
        for i in range(len(rings) - 1):
            for k in range(seg):
                a, b = rings[i][k], rings[i][(k + 1) % seg]
                c, d = rings[i + 1][(k + 1) % seg], rings[i + 1][k]
                if prof[i][0] < 1e-6:
                    f = t.faces.new((a, c, d)) if a != c else None
                else:
                    try:
                        f = t.faces.new((a, b, c, d))
                    except ValueError:
                        f = None
                if f:
                    f.material_index = idx[i]
                    f.smooth = smooth
        if cap0:
            f = t.faces.new(list(reversed(rings[0])))
            f.material_index = idx[0]
        if cap1:
            f = t.faces.new(rings[-1])
            f.material_index = idx[-1]
        bmesh.ops.remove_doubles(t, verts=t.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        self.merge(t, None, matrix=matrix if matrix is not None else _mtx(loc, rot))
        return self

    def prism(self, pts2d, depth, loc=(0, 0, 0), mat='Trim', rot=(0, 0, 0), matrix=None, bevel=0.0):
        """Extrude a 2D polygon (XY, CCW) along +Z by depth (centered)."""
        t = bmesh.new()
        vs = [t.verts.new((x, y, -depth / 2)) for x, y in pts2d]
        f = t.faces.new(vs)
        r = bmesh.ops.extrude_face_region(t, geom=[f])
        nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(t, vec=(0, 0, depth), verts=nv)
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        if bevel:
            bmesh.ops.bevel(t, geom=list(t.edges), offset=bevel, segments=1, affect='EDGES', clamp_overlap=True)
        self.merge(t, mat, False, matrix if matrix is not None else _mtx(loc, rot))
        return self

    def tube(self, pts, r, mat='Trim', seg=8, caps=True):
        """Bent pipe through 3D points (constant radius)."""
        t = bmesh.new()
        pts = [Vector(p) for p in pts]
        rings = []
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            q = d.to_track_quat('Z', 'Y' if abs(d.z) < 0.9 else 'X')
            mm = q.to_matrix()
            rings.append([t.verts.new(p + mm @ Vector((r * math.cos(TAU * k / seg), r * math.sin(TAU * k / seg), 0)))
                          for k in range(seg)])
        for i in range(len(rings) - 1):
            for k in range(seg):
                t.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
        if caps:
            t.faces.new(list(reversed(rings[0])))
            t.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        i = self.mi(mat)
        for f in t.faces:
            f.material_index = i
            f.smooth = True
        self.merge(t, None)
        return self

    def raw(self, verts, faces, mat='Trim', smooth=False, matrix=None, uvs=None):
        t = bmesh.new()
        vs = [t.verts.new(v) for v in verts]
        uvl = t.loops.layers.uv.new('UVMap') if uvs else None
        for fi, f in enumerate(faces):
            face = t.faces.new([vs[i] for i in f])
            if uvl:
                for loop, vi in zip(face.loops, f):
                    loop[uvl].uv = uvs[vi]
        i = self.mi(mat)
        for f in t.faces:
            f.material_index = i
            f.smooth = smooth
        self.merge(t, None, matrix=matrix)
        return self

    def loft(self, rings, mat_fn, smooth=True, caps=(True, True)):
        """rings: list of closed loops (same vertex count). mat_fn(center, normal, i, j) -> material."""
        t = bmesh.new()
        n = len(rings[0])
        V = [[t.verts.new(p) for p in ring] for ring in rings]
        ij = {}
        for i in range(len(V) - 1):
            for j in range(n):
                f = t.faces.new((V[i][j], V[i][(j + 1) % n], V[i + 1][(j + 1) % n], V[i + 1][j]))
                ij[f] = (i, j)
        for end, on in ((0, caps[0]), (len(V) - 1, caps[1])):
            if not on:
                continue
            c = sum((v.co for v in V[end]), Vector()) / n
            cv = t.verts.new(c)
            for j in range(n):
                f = t.faces.new((V[end][j], V[end][(j + 1) % n], cv))
                ij[f] = (end, -1)
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        t.normal_update()
        for f in t.faces:
            i, j = ij.get(f, (0, -1))
            f.material_index = self.mi(mat_fn(f.calc_center_median(), f.normal, i, j))
            f.smooth = smooth
        self.merge(t, None)
        return self

    def bvh(self):
        return BVHTree.FromBMesh(self.bm)

    def obj(self, name, parent=None, loc=(0, 0, 0), sharp=38.0):
        bm = self.bm
        bm.normal_update()
        lim = math.radians(sharp)
        for e in bm.edges:
            if len(e.link_faces) == 2:
                f0, f1 = e.link_faces
                if (not f0.smooth or not f1.smooth) or e.calc_face_angle(0.0) > lim \
                        or f0.material_index != f1.material_index:
                    e.smooth = False
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        if parent:
            o.parent = parent
        o.location = loc
        return o


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    o.location = loc
    return o


def ray(bvh, origin, direction):
    loc, nor, idx, d = bvh.ray_cast(Vector(origin), Vector(direction).normalized())
    return loc, nor


# ===================================================================== export + stats
def export(name, sub=''):
    os.makedirs(MODELS, exist_ok=True)
    path = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=True, export_cameras=False,
              export_lights=False, use_selection=False)
    try:
        bpy.ops.export_scene.gltf(**kw, export_image_format='AUTO')
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    return path


def tri_count(objs=None):
    n = 0
    for o in (objs or bpy.context.scene.objects):
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n


def bbox():
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def record(name, extra=None):
    """Append model info to art/_raw/manifest_<name>.json (merged into models/index.json by build_all)."""
    bpy.context.view_layer.update()
    lo, hi = bbox()
    info = dict(tris=tri_count(),
                # glTF axes: x, y(up)=blender z, z = -blender y
                size=[round(hi.x - lo.x, 2), round(hi.z - lo.z, 2), round(hi.y - lo.y, 2)],
                min=[round(lo.x, 2), round(lo.z, 2), round(-hi.y, 2)],
                max=[round(hi.x, 2), round(hi.z, 2), round(-lo.y, 2)])
    if extra:
        info.update(extra)
    d = os.path.join(RAW, 'manifest')
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name + '.json'), 'w') as f:
        json.dump(info, f)
    print("MODEL", name, info)
    return info


# ===================================================================== toon preview
def _toon_mat(m, ramp=(0.5, 0.78, 1.0)):
    hexc = m.get('hex', '#ffffff')
    emit = m.get('emit', 0.0)
    nt = m.node_tree
    img = m.get('img', '')
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    base = (*hexlin(hexc), 1)
    if emit:
        em.inputs['Color'].default_value = base
        em.inputs['Strength'].default_value = 1.6
        return
    dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(dif.outputs[0], s2r.inputs[0])
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(s2r.outputs['Color'], bw.inputs[0])
    cr = nt.nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.interpolation = 'CONSTANT'
    els = cr.color_ramp.elements
    els[0].position, els[0].color = 0.0, (ramp[0] * 0.92, ramp[0] * 0.88, ramp[0] * 1.12, 1)
    els[1].position, els[1].color = 0.10, (ramp[1], ramp[1] * 0.97, ramp[1] * 1.04, 1)
    e3 = els.new(0.42)
    e3.color = (ramp[2] * 1.04, ramp[2], ramp[2] * 0.94, 1)
    nt.links.new(bw.outputs[0], cr.inputs[0])
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    if img:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = bpy.data.images.load(img, check_existing=True)
        nt.links.new(tn.outputs['Color'], mul.inputs[6])
        mx = nt.nodes.new('ShaderNodeMixShader')
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        nt.links.new(tn.outputs['Alpha'], mx.inputs[0])
        nt.links.new(tr.outputs[0], mx.inputs[1])
        nt.links.new(em.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    else:
        mul.inputs[6].default_value = base
    nt.links.new(cr.outputs[0], mul.inputs[7])
    nt.links.new(mul.outputs[2], em.inputs['Color'])


def toonify(outline=0.02, skip=()):
    ol = bpy.data.materials.new('_outline')
    try:
        ol.use_nodes = True
    except Exception:
        pass
    nt = ol.node_tree
    nt.nodes.clear()
    o_ = nt.nodes.new('ShaderNodeOutputMaterial')
    e_ = nt.nodes.new('ShaderNodeEmission')
    e_.inputs['Color'].default_value = (*hexlin('#2a2036'), 1)
    nt.links.new(e_.outputs[0], o_.inputs[0])
    ol.use_backface_culling = True
    for m in list(bpy.data.materials):
        if m.name.startswith('_'):
            continue
        _toon_mat(m)
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or o.name in skip or not outline:
            continue
        n = len(o.data.materials)
        o.data.materials.append(ol)
        mod = o.modifiers.new('ol', 'SOLIDIFY')
        mod.thickness = outline
        mod.offset = 1.0
        mod.use_flip_normals = True
        mod.use_rim = False
        mod.material_offset = n
        mod.use_even_offset = False


def preview_scene(sky='#bfe3f5', ground='#9bbf83', ground_size=0.0, sun_dir=(-0.6, 0.9, 1.1), energy=3.2):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.view_settings.view_transform = 'Standard'
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    try:
        sc.eevee.taa_render_samples = 16
        sc.eevee.use_shadows = True
    except Exception:
        pass
    w = bpy.data.worlds.new('w')
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (*hexlin(sky), 1)
    bg.inputs['Strength'].default_value = 1.0
    sc.world = w
    ld = bpy.data.lights.new('sun', 'SUN')
    ld.energy = energy
    ld.angle = 0.08
    lo = bpy.data.objects.new('sun', ld)
    sc.collection.objects.link(lo)
    lo.rotation_mode = 'QUATERNION'
    lo.rotation_quaternion = (-Vector(sun_dir)).to_track_quat('-Z', 'Y')
    if ground_size:
        g = B()
        M('_ground', ground)
        g.box((ground_size, ground_size, 0.02), (0, 0, -0.012), '_ground')
        go = g.obj('_groundplane')
        _toon_mat(bpy.data.materials['_ground'])
        return go


def camera(loc, target, lens=50, res=(800, 600), ortho=None):
    sc = bpy.context.scene
    cd = bpy.data.cameras.new('cam')
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    else:
        cd.lens = lens
    cd.clip_start, cd.clip_end = 0.1, 2000
    cam = bpy.data.objects.new('cam', cd)
    sc.collection.objects.link(cam)
    cam.location = Vector(loc)
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y')
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    return cam


def frame_cam(res=(640, 480), yaw=35.0, elev=22.0, margin=1.15, lens=50):
    """Camera at yaw (deg, 0 = looking at the model's front) that frames the scene bbox."""
    bpy.context.view_layer.update()
    lo, hi = bbox()
    c = (lo + hi) / 2
    rad = (hi - lo).length / 2 * margin
    fov = 2 * math.atan(18 / lens)
    aspect = res[0] / res[1]
    d = rad / math.sin(fov / 2 * min(1.0, aspect))
    y, e = math.radians(yaw), math.radians(elev)
    loc = c + Vector((math.sin(y) * math.cos(e), math.cos(y) * math.cos(e), math.sin(e))) * d
    return camera(loc, c, lens=lens, res=res)


def render(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def import_glb(path, loc=(0, 0, 0), rotz=0.0):
    """Import a GLB we exported (for composed previews). Returns new top-level objects."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.context.scene.objects if o not in before]
    tops = [o for o in new if o.parent is None or o.parent not in new]
    for o in tops:
        o.location = Vector(o.location) + Vector(loc)
        o.rotation_euler.z += rotz
    for o in new:
        for slot in getattr(o, 'material_slots', []):
            m = slot.material
            if m and 'hex' not in m:
                bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bs:
                    c = bs.inputs['Base Color'].default_value
                    from_lin = []
                    for v in c[:3]:
                        v = max(0.0, min(1.0, v))
                        s = v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
                        from_lin.append(int(round(s * 255)))
                    m['hex'] = '#%02x%02x%02x' % tuple(from_lin)
                    es = bs.inputs['Emission Strength'].default_value
                    m['emit'] = float(es) if es > 0.01 and sum(bs.inputs['Emission Color'].default_value[:3]) > 0.01 else 0.0
                    tn = next((n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
                    m['img'] = bpy.path.abspath(tn.image.filepath) if (tn and tn.image and tn.image.filepath) else ''
    return new
