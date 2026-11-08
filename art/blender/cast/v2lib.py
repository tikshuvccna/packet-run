"""v2 art library for "Too Quiet": volume toon shading, procedural textures, inner lines,
projected face features. Shared by v2_humans.py and v2_creatures.py.

Look recipe (storybook toon with volume):
- Diffuse lighting (warm soft key, cool fill, back rim sun) -> Shader-to-RGB -> luminance ->
  soft multi-stop ramp of colour MULTIPLIERS (violet shadow, warm terminator for skin, warm light).
- x ambient occlusion (AO node), + amber rim on the right/top silhouette (camera-space normal),
- albedo comes from procedural patterns (weave, knit, straw, hair strands, leather, plaid, dots...),
  which also drive a small bump so the pattern catches light.
- inverted-hull inner lines (solidify, flipped normals, back-face culling) in a darkened tint of the
  part colour, + 1 px dark violet silhouette added in the pack step.
Units: Z up, characters face -Y at rotation 0.
"""
import math
import sys

import bpy
import bmesh
from mathutils import Vector, Euler, Matrix
from mathutils.bvhtree import BVHTree

TAU = 2 * math.pi
ELEVATION_DEG = 35.0
PPU = 56.0                      # sprite pixels per world unit (same as v1)
DIRECTIONS = [("S", 0), ("SW", 315), ("W", 270), ("NW", 225),
              ("N", 180), ("NE", 135), ("E", 90), ("SE", 45)]

STATE = dict(line_t=0.012, truth=False, lines=True)
_MAT = {}


def hexlin(h):
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def lin2hex(c):
    o = []
    for v in c:
        v = max(0.0, min(1.0, v))
        s = v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        o.append(int(round(s * 255)))
    return "#%02x%02x%02x" % tuple(o)


def truthify(hexv, amt=0.62):
    """Cold, desaturated version of a colour (for the 'truth' look)."""
    r, g, b = hexlin(hexv)
    l = 0.3 * r + 0.59 * g + 0.11 * b
    cold = (l * 0.86, l * 0.95, l * 1.08)
    return lin2hex(tuple(c * (1 - amt) + k * amt for c, k in zip((r, g, b), cold)))


def reset():
    _MAT.clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.objects):
        for b in list(coll):
            coll.remove(b)


# ===================================================================== node helper
class NB:
    def __init__(self, nt):
        self.nt = nt

    def n(self, t, **kw):
        nd = self.nt.nodes.new(t)
        for k, v in kw.items():
            if k.startswith('_'):
                setattr(nd, k[1:], v)
            else:
                self.set(nd.inputs[k], v)
        return nd

    def set(self, sock, v):
        if hasattr(v, 'is_linked') or hasattr(v, 'links'):
            self.nt.links.new(v, sock)
        elif isinstance(v, bpy.types.Node):
            self.nt.links.new(v.outputs[0], sock)
        else:
            sock.default_value = v

    def m(self, op, a, b=None, c=None, clamp=False):
        nd = self.nt.nodes.new("ShaderNodeMath")
        nd.operation = op
        nd.use_clamp = bool(clamp)
        self.set(nd.inputs[0], a)
        if b is not None:
            self.set(nd.inputs[1], b)
        if c is not None:
            self.set(nd.inputs[2], c)
        return nd.outputs[0]

    def mix(self, fac, a, b, blend='MIX'):
        nd = self.nt.nodes.new("ShaderNodeMix")
        nd.data_type = 'RGBA'
        nd.blend_type = blend
        self.set(nd.inputs['Factor'], fac)
        self.set(nd.inputs[6], a)
        self.set(nd.inputs[7], b)
        return nd.outputs[2]

    def link(self, a, b):
        self.nt.links.new(a, b)


def _col4(h):
    return (*hexlin(h), 1.0)


# ===================================================================== patterns
def _pattern(nb, kind, P):
    """Returns (fac socket or None, height socket or None). P = params dict."""
    if kind in (None, 'none', 'flat'):
        return None, None
    tc = nb.n("ShaderNodeTexCoord")
    co = tc.outputs['Object']
    sep = nb.n("ShaderNodeSeparateXYZ", Vector=co)
    x, y, z = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    nu = P.get('nu', 24)            # repeats around (integer, seamless)
    fv = P.get('fv', 40)            # repeats per unit height
    ang = nb.m('ARCTAN2', y, x)
    U = nb.m('MULTIPLY', ang, nu / TAU)
    if P.get('map') == 'xz':
        U = nb.m('MULTIPLY', x, fv)
    V = nb.m('MULTIPLY', z, fv)
    if P.get('radial'):             # hat brims: rings by radius + height
        rr = nb.m('SQRT', nb.m('ADD', nb.m('MULTIPLY', x, x), nb.m('MULTIPLY', y, y)))
        V = nb.m('MULTIPLY', nb.m('ADD', rr, z), fv)

    def s(v):  # 0..1 sine of period 1
        return nb.m('MULTIPLY_ADD', nb.m('SINE', nb.m('MULTIPLY', v, TAU)), 0.5, 0.5)

    def noise(scale, detail=4.0, dist=0.0):
        nz = nb.n("ShaderNodeTexNoise", Vector=co, Scale=scale, Detail=detail, Distortion=dist)
        return nz.outputs['Fac']

    def step(v, t):
        return nb.m('GREATER_THAN', v, t)

    if kind == 'weave':          # crossing threads
        h = nb.m('MULTIPLY', nb.m('ADD', s(U), s(V)), 0.5)
        chk = nb.m('MULTIPLY', nb.m('SIGN', nb.m('MULTIPLY', nb.m('SINE', nb.m('MULTIPLY', U, math.pi)),
                                                     nb.m('SINE', nb.m('MULTIPLY', V, math.pi)))), 0.12)
        h = nb.m('ADD', h, chk)
        return None, h
    if kind == 'knit':           # V-stitch columns
        fu = nb.m('FRACT', U)
        cv = nb.m('ADD', V, nb.m('MULTIPLY', nb.m('ABSOLUTE', nb.m('SUBTRACT', fu, 0.5)), 1.4))
        h = s(cv)
        col = nb.m('POWER', nb.m('ABSOLUTE', nb.m('SINE', nb.m('MULTIPLY', U, math.pi))), 0.3)
        h = nb.m('MULTIPLY', h, col)
        fac = None
        if P.get('stripe'):
            fac = step(s(nb.m('MULTIPLY', z, P['stripe'])), 0.72)
        return fac, h
    if kind == 'straw':
        h = nb.m('MULTIPLY', s(V), 0.7)
        h = nb.m('ADD', h, nb.m('MULTIPLY', noise(60, 2), 0.3))
        braid = s(nb.m('ADD', U, nb.m('MULTIPLY', V, 0.5)))
        h = nb.m('ADD', nb.m('MULTIPLY', h, 0.75), nb.m('MULTIPLY', braid, 0.25))
        return None, h
    if kind == 'hair':           # strands running crown -> edge
        d = nb.m('MULTIPLY', noise(6, 2), P.get('wave', 1.2))
        h1 = s(nb.m('ADD', U, d))
        h2 = s(nb.m('ADD', nb.m('MULTIPLY', U, 2.7), d))
        h = nb.m('ADD', nb.m('MULTIPLY', h1, 0.6), nb.m('MULTIPLY', h2, 0.4))
        return None, nb.m('POWER', h, 1.5)
    if kind == 'strands_z':      # locks/braids: strands along local z (tubes) -> vary with angle
        d = nb.m('MULTIPLY', noise(8, 2), 0.6)
        h = s(nb.m('ADD', U, d))
        return None, h
    if kind == 'stripes':        # horizontal bands -> color2
        f = step(s(V), P.get('thr', 0.75))
        return f, nb.m('MULTIPLY', s(U), 0.15) if P.get('weave', True) else None
    if kind == 'vstripes':
        f = step(s(U), P.get('thr', 0.7))
        return f, nb.m('MULTIPLY', s(V), 0.15)
    if kind == 'plaid':
        a = step(s(U), P.get('thr', 0.72))
        b = step(s(V), P.get('thr', 0.72))
        f = nb.m('MULTIPLY', nb.m('ADD', a, b), 0.5)
        h = nb.m('MULTIPLY', nb.m('ADD', s(nb.m('MULTIPLY', U, 6)), s(nb.m('MULTIPLY', V, 6))), 0.5)
        return f, h
    if kind in ('dots', 'flowers'):
        Vo = nb.m('ADD', V, nb.m('MULTIPLY', nb.m('FLOOR', U), 0.5))
        du = nb.m('SUBTRACT', nb.m('FRACT', U), 0.5)
        dv = nb.m('SUBTRACT', nb.m('FRACT', Vo), 0.5)
        r = nb.m('SQRT', nb.m('ADD', nb.m('MULTIPLY', du, du), nb.m('MULTIPLY', dv, dv)))
        rad = P.get('rad', 0.18)
        if kind == 'flowers':
            th = nb.m('ARCTAN2', dv, du)
            rad = nb.m('MULTIPLY', nb.m('MULTIPLY_ADD', nb.m('COSINE', nb.m('MULTIPLY', th, 5)), 0.35, 0.75),
                       P.get('rad', 0.3))
        f = nb.m('LESS_THAN', r, rad)
        return f, nb.m('MULTIPLY', nb.m('ADD', s(nb.m('MULTIPLY', U, 5)), s(nb.m('MULTIPLY', V, 5))), 0.25)
    if kind == 'leather':
        h = noise(P.get('scale', 40), 6)
        return None, h
    if kind == 'fur':
        h = noise(P.get('scale', 70), 3, 1.0)
        return None, h
    if kind == 'wool':           # curly
        vor = nb.n("ShaderNodeTexVoronoi", Vector=co, Scale=P.get('scale', 28))
        h = nb.m('POWER', vor.outputs['Distance'], 0.6)
        return None, h
    if kind == 'noise':
        return None, noise(P.get('scale', 30), 3)
    if kind == 'skin':
        return None, nb.m('MULTIPLY', noise(P.get('scale', 90), 2), 0.4)
    if kind == 'flour':          # dusted patches -> color2
        nz = noise(P.get('scale', 7), 4, 0.5)
        return step(nz, P.get('thr', 0.56)), noise(40, 3)
    if kind == 'patches':        # noisy mix (stone/moss/cloud/wood)
        nz = noise(P.get('scale', 5), 5, P.get('dist', 0.3))
        f = nb.m('MAP_RANGE' if False else 'MULTIPLY', nb.m('SUBTRACT', nz, P.get('thr', 0.5)), P.get('sharp', 6.0))
        f = nb.m('ADD', f, 0.5, clamp=True)
        return f, noise(P.get('bscale', 25), 5)
    if kind == 'wood':
        d = nb.m('MULTIPLY', noise(3, 2), 2)
        h = s(nb.m('ADD', nb.m('MULTIPLY', U, 1.0), d))
        return None, h
    if kind == 'spiral':         # diagonal bands (thread wraps)
        f = step(s(nb.m('ADD', U, V)), P.get('thr', 0.6))
        return f, s(nb.m('MULTIPLY', nb.m('ADD', U, V), 4))
    if kind == 'planks':         # wooden planks: rows across `axis`, butt joints along x, per-plank tint, grain
        A = {'z': z, 'y': y, 'x': x}[P.get('axis', 'z')]
        B = {'x': x, 'y': y, 'z': z}[P.get('along', 'x')]
        Vv = nb.m('MULTIPLY', A, P.get('fv', 5.0))
        row = nb.m('FLOOR', Vv)
        frv = nb.m('FRACT', Vv)
        Uu = nb.m('ADD', nb.m('MULTIPLY', B, P.get('fu', 0.4)), nb.m('MULTIPLY', row, 0.437))
        col = nb.m('FLOOR', Uu)
        seam_w = P.get('seam', 0.07)
        seam_r = nb.m('LESS_THAN', frv, seam_w)
        seam_b = nb.m('LESS_THAN', nb.m('FRACT', Uu), seam_w * P.get('butt', 0.12))
        seam = nb.m('MAXIMUM', seam_r, seam_b)
        wn = nb.n("ShaderNodeTexWhiteNoise")
        wn.noise_dimensions = '3D'
        cv = nb.n("ShaderNodeCombineXYZ", X=row, Y=col, Z=P.get('seed', 1.7))
        nb.link(cv.outputs[0], wn.inputs['Vector'])
        tint = wn.outputs['Value']
        gv = nb.n("ShaderNodeCombineXYZ", X=nb.m('MULTIPLY', B, P.get('grain_u', 1.6)), Y=nb.m('MULTIPLY', Vv, 9.0), Z=row)
        gz = nb.n("ShaderNodeTexNoise", Scale=1.0, Detail=3.0, Distortion=0.6)
        nb.link(gv.outputs[0], gz.inputs['Vector'])
        grain = s(nb.m('MULTIPLY', nb.m('ADD', gz.outputs['Fac'], nb.m('MULTIPLY', frv, 0.0)), 7.0))
        hgt = nb.m('ADD', nb.m('MULTIPLY', tint, 0.62), nb.m('MULTIPLY', grain, 0.38))
        # seams sink (bump) and darken (fac -> color2)
        hgt = nb.m('SUBTRACT', hgt, nb.m('MULTIPLY', seam, 0.9))
        return seam, hgt
    raise ValueError(kind)


# ===================================================================== materials
RAMPS = {
    # (pos, multiplier rgb) stops
    'cloth': [(0.0, (0.42, 0.36, 0.64)), (0.2, (0.50, 0.44, 0.72)), (0.36, (0.74, 0.68, 0.86)),
              (0.52, (0.97, 0.95, 0.97)), (0.8, (1.06, 1.03, 0.98)), (1.0, (1.16, 1.1, 0.98))],
    'skin': [(0.0, (0.62, 0.42, 0.54)), (0.2, (0.70, 0.47, 0.52)), (0.34, (0.90, 0.66, 0.64)),
             (0.5, (1.0, 0.92, 0.9)), (0.8, (1.04, 1.01, 0.98)), (1.0, (1.1, 1.06, 1.0))],
    'hair': [(0.0, (0.40, 0.34, 0.60)), (0.25, (0.52, 0.45, 0.70)), (0.45, (0.95, 0.92, 0.94)),
             (0.78, (1.08, 1.04, 1.0)), (0.9, (1.3, 1.22, 1.08))],
    'soft': [(0.0, (0.66, 0.62, 0.82)), (0.3, (0.78, 0.74, 0.9)), (0.55, (1.0, 1.0, 1.0)), (1.0, (1.08, 1.06, 1.02))],
    'flat': [(0.0, (0.84, 0.82, 0.92)), (0.5, (0.96, 0.95, 0.98)), (1.0, (1.03, 1.02, 1.0))],
}
RIM_COLOR = "#ffb35c"


def mat(color, pat=None, color2=None, kind='cloth', rim=0.5, ao=0.55, bump=0.35, var=0.14,
        line=True, metal=False, P=None, name=None, emit=0.0):
    """Main toon material. pat = pattern kind, var = albedo variation from pattern height."""
    P = P or {}
    if pat == 'weave':
        var *= 0.45
        bump *= 0.35
    truth = STATE['truth']
    c1 = color if color.startswith('#') else color
    c2 = color2
    if truth:
        c1 = truthify(c1) if kind != 'glowy' else c1
        c2 = truthify(c2) if c2 else None
    key = (c1, pat, c2, kind, rim, ao, bump, var, metal, tuple(sorted(P.items())), emit, truth)
    if key in _MAT:
        return _MAT[key]
    m = bpy.data.materials.new(name or ("m_" + c1))
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    out = nb.n("ShaderNodeOutputMaterial")
    fac, h = _pattern(nb, pat, P)
    albedo = _col4(c1)
    if fac is not None and c2:
        albedo = nb.mix(fac, _col4(c1), _col4(c2))
    if h is not None and var > 0:
        mul = nb.m('MULTIPLY_ADD', h, var, 1.0 - var)
        albedo = nb.mix(1.0, albedo, nb.n("ShaderNodeCombineXYZ", X=mul, Y=mul, Z=mul).outputs[0], 'MULTIPLY')
    diff = nb.n("ShaderNodeBsdfDiffuse", Color=(1, 1, 1, 1))
    if h is not None and bump > 0:
        bp = nb.n("ShaderNodeBump", Strength=bump, Distance=0.02, Height=h)
        nb.link(bp.outputs['Normal'], diff.inputs['Normal'])
    s2r = nb.n("ShaderNodeShaderToRGB")
    nb.link(diff.outputs[0], s2r.inputs[0])
    lum = nb.n("ShaderNodeRGBToBW", Color=s2r.outputs['Color'])
    lumv = nb.m('MULTIPLY', lum.outputs[0], STATE.get('gain', 3.3))
    ramp = nb.n("ShaderNodeValToRGB", Fac=lumv)
    stops = RAMPS[kind if kind in RAMPS else 'cloth']
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
    el[1].position, el[1].color = stops[1][0], (*stops[1][1], 1)
    for p, c in stops[2:]:
        e = el.new(p)
        e.color = (*c, 1)
    shade = ramp.outputs['Color']
    if metal:   # brass/glass: bright facing core + hard highlight
        lw = nb.n("ShaderNodeLayerWeight", Blend=0.5)
        f = nb.m('POWER', lw.outputs['Facing'], 1.0)
        core = nb.m('MULTIPLY_ADD', nb.m('SUBTRACT', 1.0, f), 0.8, 0.45)
        hl = nb.m('MULTIPLY', nb.m('GREATER_THAN', lumv, 0.9), 0.6)
        v = nb.m('ADD', core, hl)
        shade = nb.mix(1.0, shade, nb.n("ShaderNodeCombineXYZ", X=v, Y=v, Z=v).outputs[0], 'MULTIPLY')
    col = nb.mix(1.0, albedo, shade, 'MULTIPLY')
    if ao > 0:
        aon = nb.n("ShaderNodeAmbientOcclusion", Distance=0.25)
        aov = nb.m('MULTIPLY_ADD', aon.outputs['AO'], ao, 1.0 - ao)
        col = nb.mix(1.0, col, nb.n("ShaderNodeCombineXYZ", X=aov, Y=aov, Z=aov).outputs[0], 'MULTIPLY')
    if rim > 0:
        geo = nb.n("ShaderNodeNewGeometry")
        vt = nb.n("ShaderNodeVectorTransform", Vector=geo.outputs['Normal'])
        vt.vector_type, vt.convert_from, vt.convert_to = 'NORMAL', 'WORLD', 'CAMERA'
        d = nb.n("ShaderNodeVectorMath", _operation='DOT_PRODUCT')
        nb.link(vt.outputs[0], d.inputs[0])
        d.inputs[1].default_value = Vector((0.82, 0.45, 0.0)).normalized()
        lw = nb.n("ShaderNodeLayerWeight", Blend=0.5)
        fr = nb.m('POWER', lw.outputs['Facing'], 1.5)
        mask = nb.m('MULTIPLY', nb.m('MAXIMUM', d.outputs['Value'], 0.0), fr)
        mask = nb.m('SMOOTH_MAX' if False else 'MULTIPLY', nb.m('GREATER_THAN', mask, P.get('rim_thr', 0.42)), 1.0)
        mask = nb.m('MULTIPLY', mask, rim * (0.55 if truth else 1.0))
        rc = RIM_COLOR if not truth else "#7fe0d0"
        col = nb.mix(mask, col, nb.mix(0.55, col, _col4(rc), 'SCREEN'))
    em = nb.n("ShaderNodeEmission", Color=col, Strength=1.0)
    nb.link(em.outputs[0], out.inputs['Surface'])
    m["line"] = line
    m["base"] = c1
    _MAT[key] = m
    return m


def glow(color, strength=3.0, alpha=1.0, soft=False, name=None):
    key = ("glow", color, strength, alpha, soft)
    if key in _MAT:
        return _MAT[key]
    m = bpy.data.materials.new(name or "glow")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    out = nb.n("ShaderNodeOutputMaterial")
    em = nb.n("ShaderNodeEmission", Color=_col4(color), Strength=strength)
    if alpha >= 0.999 and not soft:
        nb.link(em.outputs[0], out.inputs['Surface'])
    else:
        tr = nb.n("ShaderNodeBsdfTransparent")
        mx = nb.n("ShaderNodeMixShader")
        fac = alpha
        if soft:
            lw = nb.n("ShaderNodeLayerWeight", Blend=0.5)
            fac = nb.m('MULTIPLY', nb.m('POWER', nb.m('SUBTRACT', 1.0, lw.outputs['Facing']), 2.0), alpha)
        nb.set(mx.inputs['Fac'], fac)
        nb.link(tr.outputs[0], mx.inputs[1])
        nb.link(em.outputs[0], mx.inputs[2])
        nb.link(mx.outputs[0], out.inputs['Surface'])
        m.surface_render_method = 'BLENDED'
        m.use_transparent_shadow = True
    m["line"] = False
    _MAT[key] = m
    return m


def line_mat(base_hex):
    """Dark, slightly saturated tint of the part colour (coloured line art)."""
    key = ("line", base_hex)
    if key in _MAT:
        return _MAT[key]
    r, g, b = hexlin(base_hex)
    k = 0.16
    c = (r * k + 0.012, g * k * 0.8 + 0.006, b * k + 0.03)
    m = bpy.data.materials.new("line")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    out = nb.n("ShaderNodeOutputMaterial")
    em = nb.n("ShaderNodeEmission", Color=(*c, 1), Strength=1.0)
    # invisible to shadow rays so the hull never darkens the body
    lp = nb.n("ShaderNodeLightPath")
    tr = nb.n("ShaderNodeBsdfTransparent")
    mx = nb.n("ShaderNodeMixShader")
    nb.link(lp.outputs['Is Shadow Ray'], mx.inputs['Fac'])
    nb.link(em.outputs[0], mx.inputs[1])
    nb.link(tr.outputs[0], mx.inputs[2])
    nb.link(mx.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = True
    m.use_backface_culling_shadow = True
    m["line"] = False
    _MAT[key] = m
    return m


# ===================================================================== geometry
def _link(obj, parent):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def _finish_mesh(me, smooth=True, recalc=True):
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.update()


def mesh_obj(name, verts, faces, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), smooth=True,
             recalc=True, line=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    _finish_mesh(me, smooth, recalc)
    if material:
        me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    if line is not None:
        o["line"] = line
    return _link(o, parent)


def pivot(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    o.rotation_euler = rot
    return _link(o, parent)


def ellipsoid(name, r, material, parent=None, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), seg=24,
              rings=16, line=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * r * scale[0], v.co.y * r * scale[1], v.co.z * r * scale[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    _finish_mesh(me, True, False)
    if material:
        me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    if line is not None:
        o["line"] = line
    return _link(o, parent)


def blob(name, r, material, parent=None, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), deform=None,
         seg=40, rings=28, line=None):
    """Sphere deformed by deform(unit_vec) -> new local position (before scale)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        p = Vector(v.co)
        if deform:
            p = Vector(deform(p))
        v.co = Vector((p.x * r * scale[0], p.y * r * scale[1], p.z * r * scale[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    _finish_mesh(me, True, False)
    if material:
        me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    if line is not None:
        o["line"] = line
    return _link(o, parent)


def loft(name, rings, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), seg=32, folds=None,
         cap_top=False, cap_bot=False, smooth=True, line=None, arc=None):
    """Body of revolution with elliptical rings: rings = [(z, rx, ry[, dx, dy])].
    folds(angle, t) -> radial multiplier (t = 0 first ring .. 1 last) for drapery.
    arc = (a0, a1) builds an open sheet (e.g. a cape back), no wrap."""
    verts, faces = [], []
    n = len(rings)
    wrap = arc is None
    cols = seg if wrap else seg + 1
    for k, rg in enumerate(rings):
        z, rx, ry = rg[0], rg[1], rg[2]
        dx = rg[3] if len(rg) > 3 else 0.0
        dy = rg[4] if len(rg) > 4 else 0.0
        t = k / max(1, n - 1)
        for i in range(cols):
            a = (TAU * i / seg) if wrap else (arc[0] + (arc[1] - arc[0]) * i / seg)
            f = folds(a, t) if folds else 1.0
            verts.append((dx + rx * f * math.cos(a), dy + ry * f * math.sin(a), z))
    for k in range(n - 1):
        for i in range(seg):
            j = (i + 1) % cols if wrap else i + 1
            faces.append((k * cols + i, k * cols + j, (k + 1) * cols + j, (k + 1) * cols + i))
    if cap_top:
        c = len(verts)
        z, rx, ry = rings[-1][:3]
        dx = rings[-1][3] if len(rings[-1]) > 3 else 0
        dy = rings[-1][4] if len(rings[-1]) > 4 else 0
        verts.append((dx, dy, z))
        for i in range(seg):
            faces.append(((n - 1) * cols + i, (n - 1) * cols + (i + 1) % cols, c))
    if cap_bot:
        c = len(verts)
        z = rings[0][0]
        dx = rings[0][3] if len(rings[0]) > 3 else 0
        dy = rings[0][4] if len(rings[0]) > 4 else 0
        verts.append((dx, dy, z))
        for i in range(seg):
            faces.append(((i + 1) % cols, i, c))
    return mesh_obj(name, verts, faces, material, parent, loc, rot, smooth, True, line)


def _catmull(pts, sub):
    if len(pts) < 3 or sub <= 1:
        return [Vector(p) for p in pts]
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(sub):
            t = s / sub
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return out


def _interp(vals, n):
    if len(vals) == 1:
        return [vals[0]] * n
    out = []
    for i in range(n):
        t = i / max(1, n - 1) * (len(vals) - 1)
        k = min(int(t), len(vals) - 2)
        f = t - k
        out.append(vals[k] * (1 - f) + vals[k + 1] * f)
    return out


def tube(name, pts, radii, material, parent=None, loc=(0, 0, 0), seg=12, sub=4, flat=1.0, line=None,
         caps=True, rot=(0, 0, 0), twist_up=(0, 0, 1)):
    """Tapered tube through pts (smoothed). radii: list (interpolated). flat<1 squashes the
    cross-section (ribbons, locks of hair)."""
    C = _catmull(pts, sub)
    R = _interp(list(radii), len(C))
    verts, faces = [], []
    up = Vector(twist_up)
    prev_n = None
    for i, p in enumerate(C):
        if i == 0:
            t = (C[1] - C[0])
        elif i == len(C) - 1:
            t = (C[-1] - C[-2])
        else:
            t = (C[i + 1] - C[i - 1])
        t.normalize()
        if prev_n is None:
            nvec = up.cross(t)
            if nvec.length < 1e-4:
                nvec = Vector((1, 0, 0)).cross(t)
            nvec.normalize()
        else:
            nvec = (prev_n - t * prev_n.dot(t)).normalized()
        prev_n = nvec
        b = t.cross(nvec).normalized()
        for k in range(seg):
            a = TAU * k / seg
            v = p + (nvec * math.cos(a) * flat + b * math.sin(a)) * R[i]
            verts.append(v)
    n = len(C)
    for i in range(n - 1):
        for k in range(seg):
            j = (k + 1) % seg
            faces.append((i * seg + k, i * seg + j, (i + 1) * seg + j, (i + 1) * seg + k))
    if caps:
        for end, idx in ((0, 0), (n - 1, n - 1)):
            c = len(verts)
            verts.append(C[idx])
            for k in range(seg):
                j = (k + 1) % seg
                faces.append((idx * seg + k, idx * seg + j, c))
    return mesh_obj(name, verts, faces, material, parent, loc, rot, True, True, line)


def box(name, size, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, line=None):
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
         (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    o = mesh_obj(name, v, f, material, parent, loc, rot, smooth=False, line=line)
    if bevel > 0:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=3, affect='EDGES')
        bm.to_mesh(o.data)
        bm.free()
        o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))
    return o


def cyl(name, r1, r2, h, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), seg=24, caps=True, line=None):
    rings = [(0, r1, r1), (h, r2, r2)]
    return loft(name, rings, material, parent, loc, rot, seg, cap_top=caps, cap_bot=caps, line=line)


def ring_of(name, n, radius, z, make, parent, phase=0.0, ry=None):
    """Place n small objects around a circle: make(name, loc, angle, parent)."""
    ry = ry if ry is not None else radius
    out = []
    for i in range(n):
        a = phase + TAU * i / n
        out.append(make(f"{name}{i}", (radius * math.cos(a), ry * math.sin(a), z), a, parent))
    return out


def stitches(name, radius, z, n, material, parent, ry=None, size=0.012, phase=0.0, arc=None):
    """Dashed running stitch around a ring (hems, cuffs, bags)."""
    ry = ry if ry is not None else radius
    objs = []
    verts, faces = [], []
    for i in range(n):
        if arc:
            a = arc[0] + (arc[1] - arc[0]) * (i + 0.5) / n
        else:
            a = phase + TAU * (i + 0.25) / n
        c = Vector((radius * math.cos(a), ry * math.sin(a), z))
        t = Vector((-math.sin(a), math.cos(a), 0)) * size
        nrm = Vector((math.cos(a), math.sin(a), 0)) * size * 0.25
        w = Vector((0, 0, size * 0.22))
        base = len(verts)
        for dt, dw in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(c + t * dt + w * dw + nrm)
        faces.append((base, base + 1, base + 2, base + 3))
    return mesh_obj(name, verts, faces, material, parent, smooth=False, recalc=False, line=False)


# ===================================================================== inner lines
def add_lines(objs=None, t=None):
    """Inverted-hull outline on every mesh whose material allows it."""
    t = STATE['line_t'] if t is None else t
    if not STATE['lines'] or t <= 0:
        return
    for o in (objs or list(bpy.context.scene.objects)):
        if o.type != 'MESH' or len(o.data.materials) == 0:
            continue
        m0 = o.data.materials[0]
        allow = o.get("line", None)
        if allow is None:
            allow = bool(m0.get("line", True))
        if not allow:
            continue
        if any(md.type == 'SOLIDIFY' for md in o.modifiers):
            continue
        base = m0.get("base", "#606060")
        nm = len(o.data.materials)
        lm = line_mat(base)
        for _ in range(nm):      # every source material maps to the line material (multi-material meshes)
            o.data.materials.append(lm)
        md = o.modifiers.new("hull", 'SOLIDIFY')
        sc = max(o.matrix_world.to_scale())
        md.thickness = t * float(o.get("line_k", 1.0)) / max(sc, 1e-4)
        md.offset = 1.0
        md.use_flip_normals = True
        md.material_offset = nm
        md.use_rim = False


# ===================================================================== face decals
class FaceProj:
    """Projects 2D shapes (head-local x,z in units of R) onto the front of a head mesh."""

    def __init__(self, head_obj, R):
        self.head = head_obj
        self.R = R
        me = head_obj.data
        self.bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
        self.objs = []

    def proj(self, x, z, off):
        R = self.R
        o = Vector((x * R, -5.0, z * R))
        hit = self.bvh.ray_cast(o, Vector((0, 1, 0)))
        if hit[0] is None:
            loc, nrm, _, _ = self.bvh.find_nearest(Vector((x * R, -R, z * R)))
        else:
            loc, nrm = hit[0], hit[1]
        return loc + nrm.normalized() * (off * R)

    def poly(self, name, pts, material, off=0.004, rings=4):
        """Star-convex polygon (list of (x,z))."""
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        n = len(pts)
        verts = [self.proj(cx, cz, off)]
        for k in range(1, rings + 1):
            f = k / rings
            for (x, z) in pts:
                verts.append(self.proj(cx + (x - cx) * f, cz + (z - cz) * f, off))
        faces = []
        for i in range(n):
            j = (i + 1) % n
            faces.append((0, 1 + i, 1 + j))
        for k in range(rings - 1):
            a, b = 1 + k * n, 1 + (k + 1) * n
            for i in range(n):
                j = (i + 1) % n
                faces.append((a + i, b + i, b + j, a + j))
        o = mesh_obj(name, verts, faces, material, self.head, smooth=True, recalc=False, line=False)
        self._fix_normals(o)
        self.objs.append(o)
        return o

    def ribbon(self, name, pts, widths, material, off=0.006, sub=6):
        P = _catmull([Vector((p[0], p[1], 0)) for p in pts], sub)
        W = _interp(list(widths), len(P))
        verts, faces = [], []
        for i, p in enumerate(P):
            if i == 0:
                t = P[1] - P[0]
            elif i == len(P) - 1:
                t = P[-1] - P[-2]
            else:
                t = P[i + 1] - P[i - 1]
            t.normalize()
            nx, nz = -t.y, t.x
            w = W[i] / 2
            verts.append(self.proj(p.x + nx * w, p.y + nz * w, off))
            verts.append(self.proj(p.x - nx * w, p.y - nz * w, off))
        for i in range(len(P) - 1):
            faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
        o = mesh_obj(name, verts, faces, material, self.head, smooth=True, recalc=False, line=False)
        self._fix_normals(o)
        self.objs.append(o)
        return o

    def _fix_normals(self, o):
        # decals must face outward (-Y-ish): flip faces whose normal points into the head
        me = o.data
        flip = []
        for p in me.polygons:
            c = p.center
            if p.normal.dot(c - Vector((0, 0, c.z * 0.3))) < 0:
                flip.append(p.index)
        if flip:
            bm = bmesh.new()
            bm.from_mesh(me)
            bm.faces.ensure_lookup_table()
            bmesh.ops.reverse_faces(bm, faces=[bm.faces[i] for i in flip])
            bm.to_mesh(me)
            bm.free()
            me.update()

    def clear(self):
        for o in self.objs:
            bpy.data.objects.remove(o, do_unlink=True)
        self.objs = []


def ellipse_pts(cx, cz, rx, rz, n=20, a0=0.0):
    return [(cx + rx * math.cos(a0 + TAU * i / n), cz + rz * math.sin(a0 + TAU * i / n)) for i in range(n)]


# ===================================================================== scene rig
def world_and_lights(mood='day'):
    sc = bpy.context.scene
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*hexlin("#8a80b8"), 1)
    bg.inputs["Strength"].default_value = 0.16
    sc.world = w

    def sun(name, frm, color, energy, angle):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        ld.color = hexlin(color)
        ld.angle = angle
        o = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(o)
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = (-Vector(frm)).to_track_quat('-Z', 'Y')
        return o
    if mood == 'truth':
        sun("key", (-0.7, -0.9, 1.0), "#c8d6e8", 0.95, 0.35)
        sun("fill", (1.0, -0.5, 0.2), "#6fd8c8", 0.28, 0.8)
        sun("back", (0.6, 1.0, 0.6), "#9fe8ff", 0.2, 0.5)
    else:
        sun("key", (-1.0, -0.45, 0.85), "#ffd29a", 1.05, 0.3)
        sun("fill", (0.9, -0.7, 0.1), "#9bb0ff", 0.12, 0.9)
        sun("back", (0.6, 1.0, 0.6), "#ffcf9a", 0.18, 0.5)


def render_setup(samples=32):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.compression = 15
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.eevee.taa_render_samples = samples
    try:
        sc.eevee.use_shadows = True
        sc.eevee.shadow_ray_count = 2
        sc.eevee.shadow_step_count = 8
        sc.eevee.use_fast_gi = False
    except Exception:
        pass


def sprite_camera(cell_w, cell_h, anchor, ppu=PPU, ssaa=4, elev=ELEVATION_DEG):
    sc = bpy.context.scene
    e = math.radians(elev)
    cd = bpy.data.cameras.new("cam")
    cd.type = 'ORTHO'
    cd.ortho_scale = max(cell_w, cell_h) / ppu
    cd.clip_start, cd.clip_end = 0.1, 200
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    # horizontal/vertical offset so the world origin lands on pixel `anchor`
    tx = (cell_w / 2 - anchor[0]) / ppu
    off_up = (cell_h / 2 - anchor[1]) / ppu
    if cell_w >= cell_h:
        pass
    tz = -off_up / math.cos(e)
    target = Vector((tx, 0, tz))
    dist = 60
    cam.location = target + Vector((0, -dist * math.cos(e), dist * math.sin(e)))
    cam.rotation_euler = Euler((math.radians(90 - elev), 0, 0))
    sc.camera = cam
    r = sc.render
    r.resolution_x, r.resolution_y = int(cell_w * ssaa), int(cell_h * ssaa)
    r.resolution_percentage = 100
    return cam


def portrait_camera(target, dist=6.0, lens=85, res=1024, elev=6.0, yaw=0.0, ortho_scale=None):
    sc = bpy.context.scene
    cd = bpy.data.cameras.new("pcam")
    if ortho_scale:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho_scale
    else:
        cd.lens = lens
    cd.clip_start, cd.clip_end = 0.05, 100
    cam = bpy.data.objects.new("pcam", cd)
    sc.collection.objects.link(cam)
    e, y = math.radians(elev), math.radians(yaw)
    T = Vector(target)
    cam.location = T + Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e))) * dist
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (T - cam.location).to_track_quat('-Z', 'Y')
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    return cam


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
