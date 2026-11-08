"""Packet Run cars and wheels -> public/assets/models/car_*.glb, wheel_*.glb

blender -b --python art/blender/cars.py -- [car_van car_hatch car_sport car_jeep car_super wheel_std wheel_sport wheel_offroad] [noprev]

Car GLB nodes: Body (origin = ground under the middle of the car), children Vinyl, Spoiler, NitroFlame;
WheelFL/FR/RL/RR top-level, origin = wheel centre, spin about local X. Left wheels have mirrored geometry so all
four spin the same way. Front = Blender +Y = glTF -Z.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

from prlib import *

WR = 0.34          # wheel radius (contract)
N_RING = 28


def crom(keys, y, idx):
    """Catmull-Rom of column idx over keys sorted by key[0]."""
    ks = keys
    if y <= ks[0][0]:
        return ks[0][idx]
    if y >= ks[-1][0]:
        return ks[-1][idx]
    for i in range(len(ks) - 1):
        if ks[i][0] <= y <= ks[i + 1][0]:
            break
    p0 = ks[max(i - 1, 0)][idx]
    p1 = ks[i][idx]
    p2 = ks[i + 1][idx]
    p3 = ks[min(i + 2, len(ks) - 1)][idx]
    t = (y - ks[i][0]) / (ks[i + 1][0] - ks[i][0])
    v = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
    lo, hi = min(p1, p2), max(p1, p2)
    return max(lo - 0.04, min(hi + 0.04, v))


class Shape:
    """Lofted superellipse body. keys: (y, halfwidth, z0, z1) sorted by y."""

    def __init__(self, keys, n=4.0, tb=0.1, axles=(), arch=0.43, archclear=0.1):
        self.keys = sorted(keys)
        self.n, self.tb = n, tb
        self.axles = axles
        self.arch = arch
        self.archclear = archclear
        self.y0, self.y1 = self.keys[0][0], self.keys[-1][0]

    def raw(self, y):
        return crom(self.keys, y, 1), crom(self.keys, y, 2), crom(self.keys, y, 3)

    def floor(self, y):
        """Underside height incl. the wheel-arch tunnels."""
        w, z0, z1 = self.raw(y)
        for ya in self.axles:
            d = abs(y - ya)
            if d < self.arch:
                za = WR + math.sqrt(self.arch ** 2 - d * d)
                z0 = max(z0, min(za, z1 - self.archclear))
        return z0

    def at(self, y):
        w, z0, z1 = self.raw(y)
        return w, self.floor(y), z1

    def ring(self, y, N=N_RING):
        w, z0, z1 = self.raw(y)
        fl = self.floor(y)
        zc, h = (z0 + z1) / 2, (z1 - z0) / 2
        pts = []
        for k in range(N):
            t = TAU * k / N
            c, s = math.cos(t), math.sin(t)
            x = w * math.copysign(abs(c) ** (2 / self.n), c)
            z = zc + h * math.copysign(abs(s) ** (2 / self.n), s)
            zf = (z - z0) / max(1e-6, z1 - z0)
            x *= 1 - self.tb * max(0.0, zf - 0.5) * 2
            pts.append(Vector((x, y, max(z, fl))))
        return pts

    def stations(self, S=60):
        ys = [self.y0 + (self.y1 - self.y0) * (1 - math.cos(math.pi * i / (S - 1))) / 2 for i in range(S)]
        for ya in self.axles:      # densify around arches
            for k in range(-6, 7):
                ys.append(ya + k * self.arch / 6 * 1.02)
        ys = sorted(y for y in ys if self.y0 <= y <= self.y1)
        out = [ys[0]]
        for y in ys[1:]:
            if y - out[-1] > 0.025:
                out.append(y)
        if out[-1] != ys[-1]:
            out[-1] = ys[-1]
        return out

    def rings(self, S=60):
        return [self.ring(y) for y in self.stations(S)]

    def x_at(self, y, z):
        w, z0, z1 = self.raw(y)
        zc, h = (z0 + z1) / 2, (z1 - z0) / 2
        zn = max(-1.0, min(1.0, (z - zc) / h))
        x = w * max(0.0, 1 - abs(zn) ** self.n) ** (1 / self.n)
        zf = (z - z0) / max(1e-6, z1 - z0)
        return x * (1 - self.tb * max(0.0, zf - 0.5) * 2)

    def z_at(self, y, x):
        w, z0, z1 = self.raw(y)
        zc, h = (z0 + z1) / 2, (z1 - z0) / 2
        z = z1
        for _ in range(4):
            zf = (z - z0) / max(1e-6, z1 - z0)
            s = w * (1 - self.tb * max(0.0, zf - 0.5) * 2)
            xn = min(1.0, abs(x) / s)
            z = zc + h * max(0.0, 1 - xn ** self.n) ** (1 / self.n)
        return z


# ===================================================================== vinyl panels
def vinyl_side(V, sh, yf, yr, za, zb, off=0.016, nu=18, nv=5):
    for side in (1, -1):
        verts, uvs, faces = [], [], []
        for i in range(nu + 1):
            u = i / nu
            y = yf + (yr - yf) * u
            w, z0, z1 = sh.at(y)
            lo = max(za, z0 + 0.05)
            hi = min(zb, z1 - 0.04)
            if hi < lo:
                hi = lo
            for j in range(nv + 1):
                z = lo + (hi - lo) * j / nv
                x = sh.x_at(y, z) + off
                verts.append((side * x, y, z))
                uvs.append((u, (z - za) / (zb - za)))
        for i in range(nu):
            for j in range(nv):
                a = i * (nv + 1) + j
                q = (a, a + 1, a + nv + 2, a + nv + 1)
                faces.append(q if side < 0 else tuple(reversed(q)))
        V.raw(verts, faces, 'VinylMat', smooth=True, uvs=uvs)


def vinyl_top(V, sh, yf, yr, xa, off=0.016, nu=12, nv=6):
    verts, uvs, faces = [], [], []
    for i in range(nu + 1):
        u = i / nu
        y = yf + (yr - yf) * u
        for j in range(nv + 1):
            v = j / nv
            x = -xa + 2 * xa * v
            verts.append((x, y, sh.z_at(y, x) + off))
            uvs.append((u, v))
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j
            faces.append((a, a + nv + 1, a + nv + 2, a + 1))
    V.raw(verts, faces, 'VinylMat', smooth=True, uvs=uvs)


# ===================================================================== wheels
def wheel_geo(kind):
    """Right-side wheel (outer face +X) at origin as a B builder."""
    b = B()
    rot = (0, math.radians(90), 0)   # lathe Z -> X
    if kind == 'offroad':
        W, rr = 0.30, 0.19
        R0 = 0.305
    elif kind == 'sport':
        W, rr = 0.25, 0.255
        R0 = WR
    else:
        W, rr = 0.24, 0.215
        R0 = WR
    h = W / 2
    bul = 0.012
    prof = [(rr + 0.005, -h + 0.03), (rr + 0.03, -h + 0.005), (R0 - 0.04, -h - bul), (R0 - 0.008, -h + 0.02),
            (R0, -h * 0.4), (R0 + 0.003, 0), (R0, h * 0.4), (R0 - 0.008, h - 0.02), (R0 - 0.04, h + bul),
            (rr + 0.03, h - 0.005), (rr + 0.005, h - 0.03)]
    b.lathe(prof, mat='Rubber', rot=rot, seg=20 if kind != 'offroad' else 16)
    if kind == 'offroad':
        nb = 12
        for k in range(nb):
            a = TAU * k / nb
            for s in (-1, 1):
                off = 0.07 * s + (0.025 if k % 2 else -0.025)
                m = Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((off, 0, R0 + 0.012))
                b.box((0.12, 0.085, 0.07), mat='Rubber', matrix=m)
    # rim: face toward +X(=lathe +z)
    face_z = h - 0.035
    if kind == 'std':
        b.lathe([(rr, -h + 0.03), (rr, face_z + 0.012), (rr - 0.02, face_z + 0.02), (rr - 0.03, face_z),
                 (0.09, face_z - 0.01), (0.07, face_z + 0.012)], mat='Rim', rot=rot, seg=22)
        b.sphere(0.075, loc=(face_z + 0.005, 0, 0), scale=(0.55, 1, 1), mat='Chrome', seg=14, rings=6)
        for k in range(5):
            a = TAU * k / 5 + 0.3
            b.cyl(0.026, 0.02, mat='Rubber', seg=8, matrix=Matrix.Rotation(a, 4, 'X') @ Matrix.Translation(
                (face_z - 0.003, 0, 0.135)) @ Matrix.Rotation(math.radians(90), 4, 'Y'), smooth=False)
        b.lathe([(rr - 0.004, -h + 0.03), (0.0, -h + 0.03)], mat='Rim', rot=rot, seg=22)
    elif kind == 'sport':
        # dark barrel, brake disc, 5 split spokes, chrome lip
        b.lathe([(rr, -h + 0.03), (rr, face_z + 0.015), (rr - 0.012, face_z + 0.02), (rr - 0.02, face_z - 0.02),
                 (rr - 0.02, -h + 0.04), (0.0, -h + 0.04)], mats=['Rim', 'Chrome', 'Rubber', 'Rubber', 'Rubber'],
                rot=rot, seg=20)
        b.cyl(0.19, 0.025, loc=(-0.02, 0, 0), rot=rot, mat='Chrome', seg=20)
        b.box((0.03, 0.09, 0.07), loc=(-0.02, 0, 0.17), mat='Light_tail')     # caliper
        for k in range(5):
            a = TAU * k / 5
            for d in (-1, 1):
                m = Matrix.Rotation(a + d * 0.11, 4, 'X') @ Matrix.Translation((face_z - 0.012, 0, 0.14))
                b.box((0.035, 0.026, 0.2), mat='Rim', matrix=m)
        b.cyl(0.07, 0.05, loc=(face_z - 0.01, 0, 0), rot=rot, mat='Rim', seg=16)
        b.cyl(0.035, 0.03, loc=(face_z + 0.02, 0, 0), rot=rot, mat='Chrome', seg=12)
    else:  # offroad beadlock
        b.lathe([(rr + 0.012, -h + 0.04), (rr + 0.012, face_z + 0.01), (rr - 0.03, face_z + 0.012),
                 (rr - 0.04, face_z - 0.02), (0.08, face_z - 0.02), (0.07, face_z + 0.01), (0.0, face_z + 0.01)],
                mats=['Rim', 'Chrome', 'Rim', 'Rim', 'Rim', 'Chrome'], rot=rot, seg=18)
        for k in range(8):
            a = TAU * k / 8
            m = Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((face_z + 0.012, 0, rr - 0.012)) @ \
                Matrix.Rotation(math.radians(90), 4, 'Y')
            b.cyl(0.013, 0.02, mat='Chrome', matrix=m, seg=6, smooth=False)
        for k in range(6):
            a = TAU * k / 6
            m = Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((face_z - 0.01, 0, 0.11))
            b.box((0.02, 0.05, 0.05), mat='Rubber', matrix=m)
        b.lathe([(rr - 0.004, -h + 0.04), (0.0, -h + 0.04)], mat='Rim', rot=rot, seg=18)
    return b


def wheel_mats():
    M('Rubber', '#2e2b33', rough=0.9)
    M('Rim', '#d4d9e2', rough=0.35, metal=0.6)
    M('Chrome', '#eef2f7', rough=0.2, metal=1.0)
    M('Light_tail', '#ff3b4a', emit=0.0)


def mirror_bm(b):
    bmesh.ops.scale(b.bm, vec=(-1, 1, 1), verts=b.bm.verts)
    bmesh.ops.reverse_faces(b.bm, faces=b.bm.faces)


def build_wheel_model(kind):
    reset()
    wheel_mats()
    b = wheel_geo(kind)
    b.obj('Wheel')
    export('wheel_' + kind)
    record('wheel_' + kind, dict(radius=WR, note='right-side wheel, rim faces +X; left wheels: scale.x = -1'))


# ===================================================================== common car parts
def car_mats(paint, trim, glass='#22304b'):
    M('Paint', paint, rough=0.45)
    M('Trim', trim, rough=0.6)
    M('Glass', glass, rough=0.1)
    M('Chrome', '#eef2f7', rough=0.2, metal=1.0)
    M('Rubber', '#2e2b33', rough=0.9)
    M('Light_head', '#fff2c4', emit=1.2)
    M('Light_tail', '#ff3b4a', emit=0.9)
    M('Emissive', '#5fdcff', emit=2.5)
    M('Rim', '#d4d9e2', rough=0.35, metal=0.6)
    M('VinylMat', '#ffffff', rough=0.45)


def lamp(b, bvh, x, z, front, r, mat, sx=1.0, sz=1.0, ring='Chrome', depth=0.05, ringw=0.03, dy=0.0):
    d = -1 if front else 1
    o = Vector((x, d * -10 + dy, z))
    loc, nor = ray(bvh, o, (0, d, 0))
    if loc is None:
        print("LAMP MISS", x, z, front)
        return
    nor = Vector(nor)
    m = align_mtx(loc + nor * 0.005, nor)
    if ring:
        b.cyl(r + ringw, depth, mat=ring, matrix=m @ Matrix.Diagonal((sx, sz, 1, 1)), seg=18)
    b.sphere(r, mat=mat, matrix=m @ Matrix.Translation((0, 0, depth * 0.5)) @ Matrix.Diagonal((sx, sz, 0.45, 1)),
             seg=16, rings=6, cut=0.0)


def decal(b, bvh, front, cx, cz, hx, hz, mat='Glass', corner=0.35, nu=12, nv=6, off=0.012, topk=0.0):
    """Rounded-rect panel projected along Y onto the surface (front=True: from +Y). topk narrows the top edge."""
    d = -1 if front else 1
    verts, faces = [], []
    for j in range(nv + 1):
        v = -1 + 2 * j / nv
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            k = 1 - topk * (v + 1) / 2
            ex = max(0.0, abs(v) - (1 - corner)) / corner if corner else 0
            uu = u * (1 - (1 - math.sqrt(max(0.0, 1 - ex * ex))) * corner)
            x, z = cx + uu * hx * k, cz + v * hz
            loc, nor = ray(bvh, (x, -d * 10, z), (0, d, 0))
            if loc is None:
                loc, nor = Vector((x, -d * 2.3, z)), Vector((0, -d, 0))
            verts.append(tuple(Vector(loc) + Vector(nor) * off))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            q = (a, a + 1, a + nu + 2, a + nu + 1)
            faces.append(q if front else tuple(reversed(q)))
    b.raw(verts, faces, mat, smooth=True)


def on_surface(bvh, origin, direction):
    loc, nor = ray(bvh, origin, direction)
    return (Vector(loc), Vector(nor)) if loc is not None else (None, None)


def mirrors(b, bvh, y, z, sh, cap='Paint', arm='Rubber'):
    for s in (1, -1):
        x = sh.x_at(y, z) if sh else 0.9
        b.box((0.08, 0.05, 0.05), loc=(s * (x + 0.04), y, z), mat=arm)
        b.box((0.1, 0.13, 0.12), loc=(s * (x + 0.12), y - 0.02, z + 0.06), mat=cap, bevel=0.035, seg=1)
        b.box((0.012, 0.1, 0.09), loc=(s * (x + 0.125), y - 0.09, z + 0.06), mat='Chrome')


def handles(b, sh, ys, z):
    for s in (1, -1):
        for y in ys:
            x = sh.x_at(y, z)
            b.box((0.03, 0.16, 0.035), loc=(s * (x + 0.01), y, z), mat='Chrome', bevel=0.012)


def nitro_flame(body, pts):
    """Cone(s) pointing backward (-Y) from exhaust tips. Hidden by the engine until nitro."""
    f = B()
    for p in pts:
        f.cyl(0.075, 0.55, mat='Emissive', r2=0.0, matrix=Matrix.Translation(Vector(p) + Vector((0, -0.28, 0))) @
              Matrix.Rotation(math.radians(90), 4, 'X'), seg=10)
        f.cyl(0.11, 0.3, mat='Light_head', r2=0.0, matrix=Matrix.Translation(Vector(p) + Vector((0, -0.13, 0))) @
              Matrix.Rotation(math.radians(90), 4, 'X'), seg=10)
    return f.obj('NitroFlame', parent=body)


def exhaust(b, x, y, z, r=0.05, L=0.22):
    b.cyl(r, L, mat='Chrome', matrix=Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(90), 4, 'X'), seg=12)
    b.cyl(r * 0.7, 0.02, mat='Rubber', matrix=Matrix.Translation((x, y - L / 2 - 0.005, z)) @
          Matrix.Rotation(math.radians(90), 4, 'X'), seg=12, smooth=False)


def wing(parent, y, z, w, chord, h, mat='Trim', strut='Rubber', tilt=-0.12, plates=True):
    s = B()
    m = Matrix.Translation((0, y, z + h)) @ Matrix.Rotation(tilt, 4, 'X')
    s.box((w, chord, 0.05), mat=mat, matrix=m, bevel=0.02, seg=2)
    for sx in (-1, 1):
        s.box((0.05, 0.12, h + 0.02), loc=(sx * w * 0.32, y + 0.02, z + h / 2), mat=strut, bevel=0.01)
        if plates:
            s.box((0.035, chord + 0.08, 0.2), loc=(sx * (w / 2 + 0.015), y, z + h - 0.02), mat=mat, bevel=0.015)
    return s.obj('Spoiler', parent=parent)


def place_wheels(kind, xs, yf, yr):
    out = []
    for nm, x, y in (('WheelFL', -xs, yf), ('WheelFR', xs, yf), ('WheelRL', -xs, yr), ('WheelRR', xs, yr)):
        b = wheel_geo(kind)
        if x < 0:
            mirror_bm(b)
        out.append(b.obj(nm, loc=(x, y, WR)))
    return out


def bumper(b, y, z, w, d=0.2, h=0.16, mat='Chrome', curve=0.0):
    b.box((w, d, h), loc=(0, y, z), mat=mat, bevel=0.05, seg=2, taper=(1, 1))


# ===================================================================== cars
def cabin_mat_fn(roof_y, pillars, sill=0.16, roofmat='Paint', corner=True, sh=None, rearpaint=False):
    def fn(c, nrm, i, j):
        w, z0, z1 = sh.at(c.y)
        zf = (c.z - z0) / max(1e-6, z1 - z0)
        inroof = roof_y[0] <= c.y <= roof_y[1]
        if nrm.z > 0.72 or (rearpaint and c.y < roof_y[0] and nrm.y < -0.3):
            if rearpaint and c.y < roof_y[0]:
                return roofmat
            return roofmat if inroof else 'Glass'
        if j == -1:
            return 'Glass' if zf > sill else 'Paint'
        if zf < sill:
            return 'Paint'
        if corner and nrm.z > 0.38:
            return roofmat if inroof else 'Paint'
        for a, bb in pillars:
            if a <= c.y <= bb:
                return 'Paint'
        return 'Glass'
    return fn


def body_mat_fn(rocker=0.36, sh=None):
    def fn(c, nrm, i, j):
        if nrm.z < -0.55:
            return 'Rubber'
        if c.z < rocker and abs(nrm.x) > 0.3:
            return 'Rubber'
        return 'Paint'
    return fn


def car_van():
    car_mats('#4fb7a0', '#f6ead0')
    M('Cargo', '#d9a35e', rough=0.8)
    M('Tape', '#f2d16b', rough=0.6)
    yf, yr, tx = 1.48, -1.42, 0.78
    sh = Shape([(-2.32, 0.80, 0.44, 1.84), (-2.25, 0.90, 0.33, 1.95), (-1.95, 0.93, 0.30, 2.0),
                (1.55, 0.93, 0.30, 2.0), (2.0, 0.92, 0.30, 1.94), (2.22, 0.88, 0.33, 1.76), (2.32, 0.76, 0.44, 1.52)],
               n=5.0, tb=0.12, axles=(yf, yr), arch=0.44, archclear=0.25)
    belt = 1.2

    def fn(c, nrm, i, j):
        if nrm.z < -0.55 or (c.z < 0.4 and abs(nrm.x) > 0.3):
            return 'Rubber'
        if c.z < belt:
            return 'Paint'
        if nrm.z > 0.6:
            return 'Trim'
        if c.y > 2.1 or c.y < -2.16:           # windshield / rear window are decals
            return 'Trim'
        if c.z > 1.8 or c.z < belt + 0.07:
            return 'Trim'
        for a, bb in ((1.98, 9), (1.45, 1.6), (0.12, 0.26), (-1.2, -1.06), (-9, -2.08)):
            if a <= c.y <= bb:
                return 'Trim'
        return 'Glass'
    body = B()
    body.loft(sh.rings(54), fn)
    bvh = body.bvh()
    decal(body, bvh, True, 0, 1.52, 0.72, 0.21, corner=0.4, topk=0.06)
    decal(body, bvh, False, 0, 1.55, 0.6, 0.2, corner=0.45)
    # belt chrome strip
    for s in (1, -1):
        pts = [(s * (sh.x_at(y, belt) + 0.006), y, belt) for y in [2.1 - 0.2 * k for k in range(22)]]
        body.tube(pts, 0.02, 'Chrome', seg=6)
    # V-shaped two-tone nose (classic bus look) + round friendly headlights
    for s in (1, -1):
        lamp(body, bvh, s * 0.56, 0.86, True, 0.15, 'Light_head', ringw=0.035)
        lamp(body, bvh, s * 0.75, 0.62, True, 0.05, 'Light_head', ring='Chrome', ringw=0.015, sx=1.4)  # indicators
        lamp(body, bvh, s * 0.74, 1.0, False, 0.09, 'Light_tail', sz=1.7, ring='Chrome', ringw=0.02)
    # emblem disc + smile grille
    loc, nor = on_surface(bvh, (0, 10, 1.05), (0, -1, 0))
    body.cyl(0.13, 0.04, mat='Chrome', matrix=align_mtx(loc, nor))
    body.cyl(0.095, 0.05, mat='Trim', matrix=align_mtx(loc + nor * 0.01, nor))
    for k in range(-3, 4):
        x = k * 0.1
        zz = 0.62 + 0.0035 * k * k * 2
        loc, nor = on_surface(bvh, (x, 10, zz), (0, -1, 0))
        body.box((0.05, 0.05, 0.03), mat='Rubber', matrix=align_mtx(loc, nor))
    bumper(body, 2.36, 0.42, 1.86, mat='Chrome')
    bumper(body, -2.36, 0.42, 1.86, mat='Chrome')
    body.box((0.36, 0.04, 0.14), loc=(0, -2.37, 0.62), mat='Trim', bevel=0.02)       # plate (blank)
    mirrors(body, bvh, 1.92, 1.25, sh, cap='Trim', arm='Chrome')
    handles(body, sh, (1.25, -0.15), 1.08)
    # roof rack + parcels
    for s in (1, -1):
        body.tube([(s * 0.66, 1.5, 2.0), (s * 0.66, 1.4, 2.12), (s * 0.66, -1.6, 2.12), (s * 0.66, -1.7, 2.0)],
                  0.025, 'Chrome', seg=6)
    for y in (1.0, 0.0, -1.0):
        body.box((1.36, 0.05, 0.04), loc=(0, y, 2.12), mat='Chrome')
    body.box((0.6, 0.7, 0.4), loc=(-0.25, 0.5, 2.34), mat='Cargo', bevel=0.03, rot=(0, 0, 0.12))
    body.box((0.62, 0.05, 0.42), loc=(-0.25 + 0.05 * 0.12, 0.5, 2.345), mat='Tape', rot=(0, 0, 0.12))
    body.box((0.5, 0.5, 0.3), loc=(0.32, -0.55, 2.29), mat='Cargo', bevel=0.03, rot=(0, 0, -0.2))
    body.box((0.52, 0.05, 0.31), loc=(0.32, -0.55, 2.295), mat='Tape', rot=(0, 0, -0.2))
    exhaust(body, 0.48, -2.3, 0.3)
    B_ = body.obj('Body')
    V = B()
    vinyl_side(V, sh, 1.95, -2.0, 0.5, belt - 0.05)
    vinyl_top(V, sh, 1.6, -1.95, 0.5, off=0.02)
    V.obj('Vinyl', parent=B_)
    wing(B_, -1.95, 2.0, 1.5, 0.32, 0.18)
    nitro_flame(B_, [(0.48, -2.42, 0.3)])
    place_wheels('std', tx, yf, yr)


def car_hatch():
    car_mats('#ffc93c', '#f7f4ee')
    yf, yr, tx = 1.3, -1.3, 0.72
    sh = Shape([(-2.02, 0.72, 0.4, 0.86), (-1.95, 0.84, 0.3, 0.98), (-1.6, 0.87, 0.28, 1.02), (1.1, 0.87, 0.28, 0.99),
                (1.72, 0.84, 0.30, 0.9), (1.96, 0.76, 0.36, 0.78), (2.03, 0.6, 0.45, 0.66)],
               n=3.6, tb=0.1, axles=(yf, yr), arch=0.43, archclear=0.18)
    cab = Shape([(-1.9, 0.66, 0.86, 1.4), (-1.82, 0.76, 0.86, 1.56), (-1.45, 0.8, 0.86, 1.64), (-0.2, 0.8, 0.86, 1.66),
                 (0.4, 0.78, 0.86, 1.5), (0.95, 0.76, 0.86, 1.08), (1.08, 0.7, 0.86, 0.94)], n=4.5, tb=0.2)
    body = B()
    body.loft(sh.rings(50), body_mat_fn(0.38, sh))
    body.loft(cab.rings(30), cabin_mat_fn((-1.7, 0.1), [(-0.5, -0.36)], sill=0.2, roofmat='Trim', corner=False,
                                          sh=cab, rearpaint=True))
    bvh = body.bvh()
    decal(body, bvh, False, 0, 1.33, 0.54, 0.17, corner=0.45, topk=0.1)
    for s in (1, -1):   # big cute round headlights (frog eyes)
        lamp(body, bvh, s * 0.55, 0.74, True, 0.16, 'Light_head', ringw=0.035)
        lamp(body, bvh, s * 0.62, 0.84, False, 0.1, 'Light_tail', ring='Chrome', ringw=0.025)
    loc, nor = on_surface(bvh, (0, 10, 0.55), (0, -1, 0))
    body.box((0.5, 0.1, 0.06), mat='Rubber', matrix=align_mtx(loc, nor), bevel=0.03)   # grille mouth
    body.cyl(0.07, 0.04, mat='Chrome', matrix=align_mtx(loc + nor * 0.02 + Vector((0, 0, 0.13)), nor))
    bumper(body, 2.02, 0.38, 1.6, mat='Chrome', d=0.16, h=0.14)
    bumper(body, -2.02, 0.38, 1.6, mat='Chrome', d=0.16, h=0.14)
    body.box((0.32, 0.04, 0.12), loc=(0, -2.02, 0.62), mat='Trim', bevel=0.015)
    mirrors(body, bvh, 0.8, 1.02, cab, cap='Trim')
    handles(body, sh, (0.15,), 0.9)
    # roof rails
    exhaust(body, -0.48, -1.98, 0.3, r=0.04)
    B_ = body.obj('Body')
    V = B()
    vinyl_side(V, sh, 1.75, -1.85, 0.48, 0.9)
    vinyl_top(V, sh, 1.85, 1.08, 0.45)
    vinyl_top(V, cab, 0.05, -1.6, 0.5, off=0.02)
    V.obj('Vinyl', parent=B_)
    wing(B_, -1.78, 1.6, 1.3, 0.26, 0.04, plates=False, tilt=-0.25)
    nitro_flame(B_, [(-0.48, -2.08, 0.3)])
    place_wheels('std', tx, yf, yr)


def fender_pods(b, xs, y, z, rx, ry, rz, mat='Paint'):
    for s in (1, -1):
        b.sphere(1.0, loc=(s * xs, y, z), scale=(rx, ry, rz), mat=mat, seg=18, rings=8, cut=0.0)


def car_sport():
    car_mats('#e8443a', '#2b2d36')
    yf, yr, tx = 1.42, -1.38, 0.8
    sh = Shape([(-2.24, 0.78, 0.36, 0.74), (-2.16, 0.92, 0.28, 0.84), (-1.6, 0.96, 0.26, 0.9), (-0.6, 0.95, 0.26, 0.86),
                (0.8, 0.93, 0.26, 0.8), (1.8, 0.9, 0.26, 0.7), (2.16, 0.82, 0.28, 0.56), (2.25, 0.66, 0.32, 0.46)],
               n=3.2, tb=0.12, axles=(yf, yr), arch=0.43, archclear=0.12)
    cab = Shape([(-1.8, 0.54, 0.78, 0.84), (-1.2, 0.7, 0.78, 1.12), (-0.6, 0.73, 0.78, 1.23), (-0.1, 0.73, 0.78, 1.25),
                 (0.45, 0.7, 0.78, 1.1), (1.05, 0.62, 0.74, 0.8)], n=3.2, tb=0.3)
    body = B()
    body.loft(sh.rings(50), body_mat_fn(0.34, sh))
    fender_pods(body, 0.74, yf, 0.6, 0.24, 0.56, 0.3)
    fender_pods(body, 0.75, yr, 0.62, 0.25, 0.6, 0.34)
    body.loft(cab.rings(30), cabin_mat_fn((-0.85, 0.08), [], sill=0.12, roofmat='Paint', sh=cab))
    bvh = body.bvh()
    for s in (1, -1):   # slim slanted headlights
        loc, nor = on_surface(bvh, (s * 0.6, 10, 0.5), (0, -1, 0))
        body.box((0.36, 0.08, 0.06), mat='Light_head', matrix=align_mtx(loc, nor) @ Matrix.Rotation(s * 0.18, 4, 'Z'),
                 bevel=0.025)
        loc, nor = on_surface(bvh, (s * 0.88, -10, 0.68), (0, 1, 0))
        body.box((0.12, 0.38, 0.05), loc=(s * 0.82, -1.95, 0.75), mat='Light_tail', bevel=0.02, rot=(0, 0, -s * 0.5))
        # side intake
        x = sh.x_at(-0.85, 0.55)
        body.box((0.05, 0.5, 0.16), loc=(s * x, -0.85, 0.55), mat='Rubber', bevel=0.03, taper=(1, 0.6, -0.08))
    body.box((1.25, 0.06, 0.06), loc=(0, -2.2, 0.66), mat='Light_tail', bevel=0.02)    # light bar
    loc, nor = on_surface(bvh, (0, 10, 0.38), (0, -1, 0))
    body.box((0.9, 0.14, 0.08), mat='Rubber', matrix=align_mtx(loc, nor), bevel=0.04)   # grille
    body.box((1.7, 0.3, 0.04), loc=(0, 2.12, 0.27), mat='Trim', bevel=0.015)           # splitter
    body.box((1.4, 0.32, 0.12), loc=(0, -2.12, 0.3), mat='Rubber', bevel=0.03)         # diffuser
    # hood vents
    for s in (1, -1):
        z = sh.z_at(1.2, s * 0.3)
        body.box((0.22, 0.4, 0.04), loc=(s * 0.3, 1.2, z), mat='Rubber', bevel=0.015)
    mirrors(body, bvh, 0.62, 0.86, cab, cap='Paint', arm='Trim')
    for x in (-0.18, 0.18):
        exhaust(body, x, -2.18, 0.33, r=0.055)
    B_ = body.obj('Body')
    V = B()
    vinyl_side(V, sh, 1.15, -1.0, 0.42, 0.8)
    vinyl_top(V, sh, 2.0, 1.02, 0.42)
    vinyl_top(V, cab, 0.05, -0.8, 0.45, off=0.02)
    V.obj('Vinyl', parent=B_)
    wing(B_, -1.95, 0.84, 1.6, 0.34, 0.24)
    nitro_flame(B_, [(-0.18, -2.3, 0.33), (0.18, -2.3, 0.33)])
    place_wheels('sport', tx, yf, yr)


def car_jeep():
    car_mats('#f08a2c', '#3d4048')
    yf, yr, tx = 1.35, -1.3, 0.8
    sh = Shape([(-2.12, 0.92, 0.5, 1.16), (-2.07, 0.97, 0.46, 1.22), (1.85, 0.97, 0.46, 1.22), (2.06, 0.95, 0.48, 1.16),
                (2.15, 0.86, 0.52, 1.08)], n=8.0, tb=0.04, axles=(yf, yr), arch=0.45, archclear=0.22)
    cab = Shape([(-2.04, 0.88, 1.1, 1.82), (-1.98, 0.93, 1.1, 1.9), (0.5, 0.93, 1.1, 1.9), (0.72, 0.92, 1.1, 1.55),
                 (0.86, 0.9, 1.1, 1.18)], n=9.0, tb=0.06)
    body = B()
    body.loft(sh.rings(26), body_mat_fn(0.5, sh))
    body.loft(cab.rings(18), cabin_mat_fn((-1.95, 0.5), [(-0.62, -0.48), (-1.95, -1.6)], sill=0.1, roofmat='Trim',
                                           sh=cab))
    bvh = body.bvh()
    # fender flares (Trim)
    for ya in (yf, yr):
        for s in (1, -1):
            pts = []
            for k in range(9):
                a = math.pi * k / 8
                pts.append((s * 0.98, ya + 0.47 * math.cos(a), WR + 0.47 * math.sin(a) * 0.95))
            body.tube(pts, 0.07, 'Trim', seg=6)
    # 7-slot grille + round headlights
    for k in range(-3, 4):
        loc, nor = on_surface(bvh, (k * 0.1, 10, 0.86), (0, -1, 0))
        body.box((0.055, 0.3, 0.04), mat='Rubber', matrix=align_mtx(loc, nor), bevel=0.02)
    for s in (1, -1):
        lamp(body, bvh, s * 0.64, 0.92, True, 0.14, 'Light_head', ringw=0.04)
        lamp(body, bvh, s * 0.82, 0.92, False, 0.08, 'Light_tail', sz=1.5, ring='Trim', ringw=0.02)
    body.box((2.06, 0.26, 0.22), loc=(0, 2.2, 0.5), mat='Trim', bevel=0.04)
    body.box((2.06, 0.22, 0.2), loc=(0, -2.18, 0.5), mat='Trim', bevel=0.04)
    for s in (1, -1):
        body.box((0.08, 0.06, 0.16), loc=(s * 0.55, 2.36, 0.52), mat='Chrome', bevel=0.02)   # tow hooks
        body.box((0.2, 1.7, 0.06), loc=(s * 1.0, 0.0, 0.48), mat='Trim', bevel=0.02)       # side steps
    # spare tyre on the back
    sp = wheel_geo('std')
    bmesh.ops.transform(sp.bm, matrix=Matrix.Translation((0, -2.27, 1.0)) @ Matrix.Rotation(math.radians(-90), 4, 'Z')
                        @ Matrix.Diagonal((0.9, 0.9, 0.9, 1)), verts=sp.bm.verts)
    me = bpy.data.meshes.new('_sp')
    sp.bm.to_mesh(me)
    sp.bm.free()
    remap = [body.mi(m) for m in sp.mats]
    t = bmesh.new()
    t.from_mesh(me)
    for f in t.faces:
        f.material_index = remap[f.material_index]
    bpy.data.meshes.remove(me)
    body.merge(t, None)
    # roof bars + light bar + snorkel
    for y in (0.2, -1.5):
        body.box((1.7, 0.06, 0.06), loc=(0, y, 1.97), mat='Rubber')
    for s in (1, -1):
        body.box((0.06, 1.85, 0.06), loc=(s * 0.82, -0.65, 1.97), mat='Rubber')
    body.box((1.2, 0.12, 0.12), loc=(0, 0.22, 2.06), mat='Rubber', bevel=0.03)
    for k in range(-2, 3):
        body.cyl(0.045, 0.03, loc=(k * 0.22, 0.29, 2.06), rot=(math.radians(90), 0, 0), mat='Light_head', seg=6)
    x = sh.x_at(1.55, 1.0)
    body.tube([(x + 0.05, 1.55, 0.9), (x + 0.07, 1.4, 1.2), (x + 0.04, 0.8, 1.35), (x - 0.02, 0.7, 1.85),
               (x - 0.02, 0.7, 2.0)], 0.06, 'Rubber', seg=8)
    body.box((0.16, 0.2, 0.12), loc=(x - 0.02, 0.76, 2.04), mat='Rubber', bevel=0.04)
    mirrors(body, bvh, 0.6, 1.3, sh, cap='Trim', arm='Trim')
    handles(body, sh, (0.1, -1.1), 1.08)
    exhaust(body, -0.6, -2.2, 0.42)
    B_ = body.obj('Body')
    V = B()
    vinyl_side(V, sh, 1.9, -2.0, 0.6, 1.18)
    vinyl_top(V, sh, 2.05, 0.95, 0.5)
    V.obj('Vinyl', parent=B_)
    wing(B_, -1.92, 1.88, 1.6, 0.26, 0.12, tilt=-0.08)
    nitro_flame(B_, [(-0.6, -2.32, 0.42)])
    place_wheels('offroad', tx, yf, yr)


def car_super():
    car_mats('#7b4bd6', '#24252d')
    yf, yr, tx = 1.5, -1.45, 0.84
    sh = Shape([(-2.36, 0.86, 0.34, 0.78), (-2.27, 1.0, 0.26, 0.86), (-1.7, 1.04, 0.24, 0.88), (-0.7, 0.99, 0.24, 0.78),
                (0.6, 0.96, 0.24, 0.66), (1.6, 0.97, 0.24, 0.62), (2.2, 0.9, 0.24, 0.46), (2.36, 0.74, 0.26, 0.34)],
               n=2.8, tb=0.1, axles=(yf, yr), arch=0.43, archclear=0.1)
    cab = Shape([(-1.6, 0.5, 0.7, 0.76), (-1.0, 0.72, 0.7, 1.04), (-0.3, 0.76, 0.7, 1.12), (0.3, 0.74, 0.7, 1.08),
                 (0.95, 0.62, 0.66, 0.72)], n=3.0, tb=0.35)
    body = B()
    body.loft(sh.rings(50), body_mat_fn(0.32, sh))
    fender_pods(body, 0.78, yf, 0.5, 0.21, 0.52, 0.3)
    fender_pods(body, 0.82, yr, 0.52, 0.27, 0.7, 0.42)
    body.loft(cab.rings(30), cabin_mat_fn((-0.75, -0.05), [], sill=0.1, roofmat='Trim', sh=cab))
    bvh = body.bvh()
    for s in (1, -1):
        # arrow headlights (two stacked slivers)
        loc, nor = on_surface(bvh, (s * 0.58, 10, 0.44), (0, -1, 0))
        if loc is not None:
            body.box((0.4, 0.07, 0.05), mat='Light_head', matrix=align_mtx(loc, nor) @ Matrix.Rotation(-s * 0.2, 4, 'Z'),
                     bevel=0.02)
        # big side intakes
        x = sh.x_at(-0.75, 0.48)
        body.box((0.06, 0.7, 0.24), loc=(s * x, -0.75, 0.48), mat='Rubber', bevel=0.04, taper=(1, 0.5, -0.15))
        # quad taillights
        for dx in (0.55, 0.78):
            loc, nor = on_surface(bvh, (s * dx, -10, 0.66), (0, 1, 0))
            if loc is not None:
                body.cyl(0.075, 0.04, mat='Light_tail', matrix=align_mtx(loc, nor), seg=14)
    # engine cover slats
    for k in range(5):
        y = -1.15 - k * 0.17
        z = sh.z_at(y, 0)
        body.box((0.7, 0.07, 0.04), loc=(0, y, z), mat='Rubber', bevel=0.012)
    loc, nor = on_surface(bvh, (0, 10, 0.32), (0, -1, 0))
    body.box((1.0, 0.1, 0.08), mat='Rubber', matrix=align_mtx(loc, nor), bevel=0.03)
    body.box((1.9, 0.34, 0.04), loc=(0, 2.2, 0.25), mat='Trim', bevel=0.015)
    body.box((1.6, 0.4, 0.14), loc=(0, -2.24, 0.3), mat='Trim', bevel=0.03)
    for k in range(-2, 3):
        body.box((0.03, 0.36, 0.16), loc=(k * 0.3, -2.26, 0.3), mat='Rubber')
    mirrors(body, bvh, 0.62, 0.78, cab, cap='Trim', arm='Trim')
    exhaust(body, 0, -2.3, 0.46, r=0.07)
    B_ = body.obj('Body')
    V = B()
    vinyl_side(V, sh, 1.0, -0.4, 0.4, 0.72)
    vinyl_top(V, sh, 2.15, 1.0, 0.4)
    vinyl_top(V, cab, -0.1, -0.7, 0.42, off=0.02)
    V.obj('Vinyl', parent=B_)
    wing(B_, -2.05, 0.8, 1.9, 0.42, 0.34, tilt=-0.15)
    nitro_flame(B_, [(0, -2.42, 0.46)])
    place_wheels('sport', tx, yf, yr)


CARS = dict(car_van=car_van, car_hatch=car_hatch, car_sport=car_sport, car_jeep=car_jeep, car_super=car_super)


def preview_car(name):
    vt = os.path.join(TEX, 'vinyl_stripes.png')
    for o in bpy.context.scene.objects:
        if o.name == 'Vinyl':
            o.hide_render = True
    toonify(0.018, skip=('Vinyl',))
    preview_scene(ground_size=14)
    for o in bpy.context.scene.objects:
        if o.name in ('Spoiler', 'NitroFlame'):
            o.hide_render = True
    frame_cam(res=(720, 480), yaw=38, elev=18, margin=1.0, lens=60)
    render(os.path.join(PREV, name + '_a.png'))
    for o in bpy.context.scene.objects:
        if o.name in ('Spoiler', 'NitroFlame'):
            o.hide_render = False
    frame_cam(res=(720, 480), yaw=215, elev=22, margin=1.0, lens=60)
    render(os.path.join(PREV, name + '_b.png'))
    frame_cam(res=(720, 480), yaw=90, elev=4, margin=0.95, lens=80)
    render(os.path.join(PREV, name + '_c.png'))
    # racing scale: chase cam 6.5 m behind, 2.3 m up, 360p
    camera((0, -7.0, 2.4), (0, 3.0, 0.8), lens=32, res=(640, 360))
    render(os.path.join(PREV, name + '_chase.png'))


def preview_wheel(name):
    toonify(0.006)
    preview_scene()
    frame_cam(res=(400, 400), yaw=60, elev=10, margin=1.0, lens=60)
    render(os.path.join(PREV, name + '.png'))


def main():
    a = args()
    noprev = 'noprev' in a
    names = [x for x in a if x != 'noprev'] or list(CARS) + ['wheel_std', 'wheel_sport', 'wheel_offroad']
    for nm in names:
        if nm.startswith('wheel_'):
            build_wheel_model(nm[6:])
            if not noprev:
                preview_wheel(nm)
            continue
        reset()
        CARS[nm]()
        export(nm)
        info = {o.name: [round(o.location.x, 3), round(o.location.z, 3), round(-o.location.y, 3)]
                for o in bpy.context.scene.objects if o.name.startswith('Wheel')}
        record(nm, dict(wheels=info))
        if not noprev:
            preview_car(nm)


main()
