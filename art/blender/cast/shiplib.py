"""Shared helpers for "Message Ship" art (on top of v2lib): item render loop, meta, small builders.

Projection (01_CONTRACT.md): ortho, 35 deg down, 56 px/unit. x = bow (+x, screen right), y = away from the camera
(screen up), z = up. Deck at z = 0. Every sprite is built around its own ground point (origin) and the camera puts the
origin on the cell's `anchor` pixel, so the engine places a frame with setOrigin(anchor) at the projected station point.
"""
import json
import math
import os
import random
import sys

import bpy
from mathutils import Vector, Euler, Matrix

import v2lib
from v2lib import *
from v2lib import _catmull

SIN35 = math.sin(math.radians(35))
COS35 = math.cos(math.radians(35))


def proj(x, y, z):
    """World -> screen px offset from the origin (+y down)."""
    return (x * 56.0, -y * 56.0 * SIN35 - z * 56.0 * COS35)


class Job:
    """Collects raw renders + their meta for one atlas."""

    def __init__(self, rawdir, group):
        self.dir = os.path.join(rawdir, group)
        os.makedirs(self.dir, exist_ok=True)
        self.meta_path = os.path.join(self.dir, "meta.json")
        self.meta = {}
        if os.path.exists(self.meta_path):
            self.meta = json.load(open(self.meta_path))

    def scene(self, mood='day', samples=24):
        reset()
        STATE['truth'] = False
        STATE['line_t'] = 0.014
        STATE['lines'] = True
        render_setup(samples=samples)
        world_and_lights(mood)

    def shoot(self, name, cell, anchor, ssaa=4, extra=None, lines=True, line_t=None, shadow=None):
        """Render the current scene to <name>.png. anchor = ground pixel (1x)."""
        if lines:
            add_lines(t=line_t)
        sprite_camera(cell[0], cell[1], anchor, ssaa=ssaa)
        render_to(os.path.join(self.dir, name + ".png"))
        rec = dict(cell=list(cell), anchor=list(anchor), ssaa=ssaa)
        if extra:
            rec.update(extra)
        if shadow:
            rec['shadow'] = shadow
        self.meta[name] = rec
        self.save()
        print("SHOT", name)

    def save(self):
        with open(self.meta_path, "w") as f:
            json.dump(self.meta, f, indent=1)


# ------------------------------------------------------------------ materials (named)
def M(color, **kw):
    return mat(color, **kw)


def wood(color="#a8693a", seam="#5a3520", axis='z', along='x', fv=5.0, fu=0.4, var=0.32, bump=0.5, **kw):
    return mat(color, pat='planks', color2=seam, var=var, bump=bump,
               P=dict(axis=axis, along=along, fv=fv, fu=fu, **kw.pop('P', {})), **kw)


def brass():
    return mat("#e2a844", metal=True, rim=0.7)


def iron():
    return mat("#4a4656", kind='cloth', rim=0.4, pat='noise', P=dict(scale=40), var=0.12, bump=0.2)


def rope_mat():
    return mat("#d9b878", pat='spiral', color2="#b89050", P=dict(nu=10, fv=60), var=0.25, bump=0.6)


# ------------------------------------------------------------------ helpers
def fix_normals_out(o, outward):
    """Flip all faces if the average normal points against `outward(center)`."""
    me = o.data
    tot = 0.0
    for p in me.polygons:
        tot += p.normal.dot(Vector(outward(p.center)))
    if tot < 0:
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
        me.update()


def grid_mesh(name, P, material, parent=None, wrap=False, line=None, outward=None, smooth=True):
    """P = rows x cols list of Vector. Quads between neighbours."""
    rows, cols = len(P), len(P[0])
    verts = [v for row in P for v in row]
    faces = []
    cc = cols if wrap else cols - 1
    for r in range(rows - 1):
        for i in range(cc):
            j = (i + 1) % cols
            faces.append((r * cols + i, r * cols + j, (r + 1) * cols + j, (r + 1) * cols + i))
    o = mesh_obj(name, verts, faces, material, parent, smooth=smooth, recalc=False, line=line)
    if outward:
        fix_normals_out(o, outward)
    return o


def apply_modifiers(o):
    dg = bpy.context.evaluated_depsgraph_get()
    oe = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(oe)
    o.modifiers.clear()
    old = o.data
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def solidify(o, t, offset=-1.0, mat_offset=0, rim_offset=0):
    md = o.modifiers.new("solid", 'SOLIDIFY')
    md.thickness = t
    md.offset = offset
    md.use_even_offset = True
    md.material_offset = mat_offset
    md.material_offset_rim = rim_offset
    apply_modifiers(o)


def ring_tube(name, center, radius, r, material, parent=None, axis='y', seg=28, tseg=8, line=None):
    c = Vector(center)
    pts = []
    for i in range(seg + 1):
        a = TAU * i / seg
        if axis == 'y':
            p = c + Vector((radius * math.cos(a), 0, radius * math.sin(a)))
        elif axis == 'z':
            p = c + Vector((radius * math.cos(a), radius * math.sin(a), 0))
        else:
            p = c + Vector((0, radius * math.cos(a), radius * math.sin(a)))
        pts.append(p)
    return tube(name, pts, [r], material, parent, seg=tseg, sub=1, caps=False, line=line)


def lantern(name, loc, parent=None, scale=1.0, glow_col="#ffd27a", body="#e2a844", halo=False):
    """Little brass lantern with a glowing glass body. loc = base centre."""
    root = pivot(name, loc, parent)
    s = scale
    bm = mat(body, metal=True, rim=0.7)
    cyl(name + "_base", 0.13 * s, 0.11 * s, 0.05 * s, bm, root, seg=16)
    glass = glow(glow_col, strength=2.6)
    cyl(name + "_glass", 0.09 * s, 0.09 * s, 0.22 * s, glass, root, loc=(0, 0, 0.05 * s), seg=16, line=False)
    for k in range(4):
        a = TAU * k / 4 + 0.4
        tube(name + f"_bar{k}", [Vector((0.1 * s * math.cos(a), 0.1 * s * math.sin(a), 0.05 * s)),
                                 Vector((0.1 * s * math.cos(a), 0.1 * s * math.sin(a), 0.27 * s))],
             [0.012 * s], bm, root, seg=5, sub=1, line=False)
    cyl(name + "_cap", 0.13 * s, 0.03 * s, 0.12 * s, bm, root, loc=(0, 0, 0.27 * s), seg=16)
    ring_tube(name + "_hook", (0, 0, 0.43 * s), 0.035 * s, 0.01 * s, bm, root, axis='y', seg=12, tseg=5, line=False)
    if halo:
        ellipsoid(name + "_halo", 0.34 * s, glow(glow_col, strength=1.2, alpha=0.35, soft=True), root,
                  loc=(0, 0, 0.16 * s), line=False)
    return root


def spiral_coil(name, center, r0, r1, turns, rr, material, parent=None, z_step=0.0):
    pts = []
    n = int(turns * 24)
    c = Vector(center)
    for i in range(n + 1):
        t = i / n
        a = TAU * turns * t
        r = r0 + (r1 - r0) * t
        pts.append(c + Vector((r * math.cos(a), r * math.sin(a), rr + z_step * t)))
    return tube(name, pts, [rr], material, parent, seg=8, sub=1)
