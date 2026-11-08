"""District buildings 1-7 (beyond the first two), lesson garages, shop, fuel, landmark tower."""
import math

from mathutils import Matrix, Vector

from prlib import *
from kit import *

REG = {}


def model(fn):
    REG[fn.__name__] = fn
    return fn


ROTX90 = Matrix.Rotation(math.radians(90), 4, 'X')
ROTY90 = Matrix.Rotation(math.radians(90), 4, 'Y')
SEG = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc',
       '8': 'abcdefg', '9': 'abcdfg'}


def number(b, side, W, D, x, z, text, h=0.8, mat='Accent', out=0.12, t=None):
    """7-segment digits on a wall (no fonts needed)."""
    w = h * 0.55
    t = t or h * 0.14
    n = len(text)
    for i, ch in enumerate(text):
        cx = x - (i - (n - 1) / 2) * w * 1.55     # +x local is the viewer's LEFT on a front face
        pos = dict(a=(0, h / 2, 1), g=(0, 0, 1), d=(0, -h / 2, 1), f=(-w / 2, h / 4, 0), b=(w / 2, h / 4, 0),
                   e=(-w / 2, -h / 4, 0), c=(w / 2, -h / 4, 0))
        for s in SEG[ch]:
            dx, dz, horiz = pos[s]
            size = (w, 0.08, t) if horiz else (t, 0.08, h / 2)
            on_face(b, side, W, D, cx - dx, z + dz, size, mat, out=out)


def container(b, loc, L=6.0, Wd=2.4, H=2.6, mat='Accent', rotz=0.0, rib='Trim'):
    m = Matrix.Translation(loc) @ Matrix.Rotation(rotz, 4, 'Z')
    b.box((L, Wd, H), mat=mat, matrix=m @ Matrix.Translation((0, 0, H / 2)), bevel=0.04)
    for k in range(5):
        x = -L / 2 + L * (k + 0.5) / 5
        for s in (-1, 1):
            b.box((0.12, 0.08, H - 0.2), mat=mat, matrix=m @ Matrix.Translation((x, s * (Wd / 2 + 0.03), H / 2)))
    b.box((0.08, Wd - 0.2, H - 0.2), mat=rib, matrix=m @ Matrix.Translation((L / 2 + 0.03, 0, H / 2)))
    for s in (-1, 1):
        b.box((0.1, 0.06, H - 0.4), mat='Metal', matrix=m @ Matrix.Translation((L / 2 + 0.08, s * 0.4, H / 2)))


def speech_bubble(b, loc, r=1.2, mat='Accent', tail=(-0.6, -0.9), dots='Wall2', rot=0.0):
    m = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
    b.sphere(r, mat=mat, matrix=m @ Matrix.Diagonal((1.35, 0.55, 1.0, 1)), seg=16, rings=10)
    b.cyl(r * 0.35, r * 0.9, mat=mat, r2=0.02, seg=8,
          matrix=m @ Matrix.Translation((tail[0] * r, 0, tail[1] * r)) @ Matrix.Rotation(math.radians(200), 4, 'Y'))
    if dots:
        for k in (-1, 0, 1):
            b.sphere(r * 0.16, mat=dots, matrix=m @ Matrix.Translation((k * r * 0.45, -r * 0.5, 0)), seg=8, rings=6)


def padlock(b, loc, s=1.0, body='Accent', shackle='Metal', hole='Door', rot=0.0):
    m = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((s, s, s, 1))
    b.box((2.0, 0.9, 1.7), mat=body, matrix=m @ Matrix.Translation((0, 0, 0.85)), bevel=0.25, seg=2)
    pts = [(-0.62, 0, 1.6)] + [(-0.62 * math.cos(math.pi * k / 10), 0, 2.2 + 0.62 * math.sin(math.pi * k / 10)) for k in
                               range(11)] + [(0.62, 0, 1.6)]
    pts = [tuple((m @ Vector(p))) for p in pts]
    b.tube(pts, 0.17 * s, shackle, seg=8)
    b.cyl(0.2, 0.2, mat=hole, matrix=m @ Matrix.Translation((0, -0.42, 1.0)) @ ROTX90, seg=12)
    b.box((0.14, 0.2, 0.45), mat=hole, matrix=m @ Matrix.Translation((0, -0.42, 0.72)))


def router_badge(b, loc, s=1.0, mat='Accent', box='Wall2'):
    """Router symbol: round puck with 4 arrows (2 in, 2 out)."""
    m = Matrix.Translation(loc) @ Matrix.Diagonal((s, s, s, 1))
    b.cyl(1.0, 0.45, mat=box, matrix=m, seg=20)
    arrow = [(-0.12, -0.35), (0.12, -0.35), (0.12, 0.05), (0.3, 0.05), (0.0, 0.4), (-0.3, 0.05), (-0.12, 0.05)]
    for k in range(4):
        a = math.pi / 2 * k + math.pi / 4
        flip = math.pi if k % 2 else 0.0
        mm = m @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 0.5, 0.26)) @ Matrix.Rotation(flip, 4, 'Z')
        b.prism(arrow, 0.08, mat=mat, matrix=mm)


def antenna(b, x, y, z, h=2.0, mat='Metal', tip='Light_tail'):
    b.cyl(0.06, h, loc=(x, y, z + h / 2), mat=mat, seg=6)
    b.sphere(0.14, loc=(x, y, z + h), mat=tip, seg=8, rings=5)


def mound(b, r, h, mat='Grass', seg=24):
    b.sphere(1.0, mat=mat, matrix=Matrix.Diagonal((r, r, h, 1)), seg=seg, rings=8, cut=0.0)


def fence_line(b, p0, p1, n, mat='Wood', h=0.9):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    ang = math.atan2(d.y, d.x)
    for k in range(n + 1):
        p = p0 + d * (k / n)
        b.box((0.12, 0.12, h), loc=(p.x, p.y, p.z + h / 2), mat=mat)
    for z in (0.35, 0.75):
        c = (p0 + p1) / 2
        b.box((d.length, 0.06, 0.1), loc=(c.x, c.y, c.z + z * h / 0.9), rot=(0, 0, ang), mat=mat)


# ===================================================================== D1 cable docks
D1 = ('#c9a66b', '#5b6b7a', '#e55a4e')


@model
def bld_d1_b():
    """Gantry crane over a quay (red lattice legs, beam, cab, hook)."""
    bld_mats(*D1, trim='#8a7354')
    M('Crane', '#e55a4e')
    M('Stripe', '#f2c94c')
    b = B()
    Hh, span, L = 14.0, 10.0, 6.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((0.7, 0.7, Hh), loc=(sx * span / 2, sy * L / 2, Hh / 2), mat='Crane', bevel=0.06)
            b.box((1.6, 1.2, 0.6), loc=(sx * span / 2, sy * L / 2, 0.3), mat='Metal', bevel=0.06)
        for k in range(4):   # lattice X braces on each side frame
            z = 1.5 + k * 3.0
            ln = math.hypot(L, 3.0)
            for d in (-1, 1):
                b.box((0.18, ln, 0.18), loc=(sx * span / 2, 0, z + 1.5), rot=(d * math.atan2(3.0, L), 0, 0), mat='Crane')
        b.box((0.4, L, 0.5), loc=(sx * span / 2, 0, Hh - 0.5), mat='Crane')
    for sy in (-1, 1):
        b.box((span + 6, 0.9, 1.2), loc=(2, sy * 1.2, Hh + 0.6), mat='Crane', bevel=0.08)
        b.box((span + 6, 0.92, 0.18), loc=(2, sy * 1.2, Hh + 0.1), mat='Stripe')
    b.box((3.0, 3.4, 2.4), loc=(-span / 2 - 1.5, 0, Hh - 0.6), mat='Wall2', bevel=0.12)       # operator cab
    b.box((3.05, 3.0, 1.0), loc=(-span / 2 - 1.5, 0, Hh - 0.2), mat='Glass')
    b.box((2.0, 2.6, 1.4), loc=(1.5, 0, Hh + 1.9), mat='Wall', bevel=0.1)                       # trolley
    b.cyl(0.05, 6.0, loc=(1.2, 0, Hh - 1.8), mat='Metal', seg=6)
    b.cyl(0.05, 6.0, loc=(1.8, 0, Hh - 1.8), mat='Metal', seg=6)
    b.box((1.2, 0.8, 0.5), loc=(1.5, 0, Hh - 5.0), mat='Stripe', bevel=0.08)
    b.tube([(1.5, 0, Hh - 5.2), (1.5, 0, Hh - 5.8), (1.9, 0, Hh - 6.1), (2.1, 0, Hh - 5.7)], 0.12, 'Metal')
    container(b, (1.5, 0, 0), mat='Accent', rotz=math.pi / 2)
    b.obj('bld_d1_b')


@model
def bld_d1_c():
    """Stacked shipping containers yard (3 x 2 x 2)."""
    bld_mats(*D1, trim='#8a7354')
    cols = ['#e55a4e', '#3f8fd2', '#f2c94c', '#4fb07a', '#e88a3a', '#8e6bd6']
    for i, c in enumerate(cols):
        M('Box%d' % i, c)
    b = B()
    k = 0
    for row in range(3):
        for lvl in range(2 if row != 1 else 3):
            for col in range(2):
                if lvl == 2 and col == 1:
                    continue
                container(b, (col * 6.4 - 3.2, row * 2.55 - 2.55, lvl * 2.62), mat='Box%d' % (k % 6), rib='Trim')
                k += 1
    b.obj('bld_d1_c')


@model
def bld_d1_d():
    """Giant cable spool with a small office and a plug sculpture."""
    bld_mats(*D1, trim='#8a7354')
    M('Cable', '#3f8fd2')
    M('Cable2', '#f2c94c')
    b = B()
    R, Wd = 5.0, 7.0
    m = Matrix.Translation((0, 0, R + 0.4)) @ ROTY90
    for s in (-1, 1):
        b.cyl(R, 0.6, mat='Wood', matrix=Matrix.Translation((s * Wd / 2, 0, R + 0.4)) @ ROTY90, seg=28)
        b.cyl(1.0, 0.8, mat='Metal', matrix=Matrix.Translation((s * (Wd / 2 + 0.2), 0, R + 0.4)) @ ROTY90, seg=12)
    for k in range(7):
        b.cyl(R - 0.9 + 0.02 * (k % 2), Wd / 7 - 0.04, mat='Cable' if k % 2 else 'Cable2', seg=28,
              matrix=Matrix.Translation((-Wd / 2 + Wd * (k + 0.5) / 7, 0, R + 0.4)) @ ROTY90)
    # cable running off the spool to a plug on the ground
    b.tube([(2.0, -R + 1.0, R * 0.4), (2.4, -R - 1.5, 0.6), (3.5, -R - 4.0, 0.4), (6.0, -R - 5.0, 0.4)], 0.35, 'Cable')
    b.box((1.2, 1.6, 1.2), loc=(6.6, -R - 5.0, 0.6), mat='Accent', bevel=0.2)
    for z in (0.35, 0.85):
        b.box((0.9, 0.12, 0.12), loc=(7.6, -R - 5.0, z), mat='Metal')
    b.box((4.0, 3.0, 0.8), loc=(0, 0, 0.4), mat='Stone', bevel=0.06)        # cradle
    # little dock office
    W2, D2 = 4.0, 3.5
    b.box((W2, D2, 3.0), loc=(-6.5, 2.5, 1.5), mat='Wall', bevel=0.08)
    b.box((W2 + 0.6, D2 + 0.6, 0.3), loc=(-6.5, 2.5, 3.1), mat='Roof', bevel=0.06)
    b.box((1.0, 0.1, 2.1), loc=(-7.2, 2.5 + D2 / 2 + 0.03, 1.05), mat='Door')
    b.box((1.4, 0.1, 1.0), loc=(-5.6, 2.5 + D2 / 2 + 0.03, 1.8), mat='Glass')
    b.obj('bld_d1_d')


# ===================================================================== D2 frames district
D2 = ('#e8b64a', '#b4553a', '#35d3b0')


def framed_window(b, side, W, D, x, z, ww, wh, col, glass='Glass'):
    on_face(b, side, W, D, x, z, (ww + 0.7, 0.3, wh + 0.7), col, out=0.12, bevel=0.08)
    on_face(b, side, W, D, x, z, (ww, 0.3, wh), glass, out=0.18)
    on_face(b, side, W, D, x, z, (0.12, 0.3, wh), col, out=0.22)


@model
def bld_d2_a():
    """Frame tower: header band, payload of giant colour-framed windows, trailer band."""
    bld_mats(*D2, trim='#fff3d6')
    for i, c in enumerate(['#35d3b0', '#ff7f6e', '#4d96ff', '#b388ff']):
        M('F%d' % i, c)
    b = B()
    W, D, H = 10.0, 10.0, 16.0
    walls(b, W, D, H)
    b.box((W + 0.4, D + 0.4, 2.0), loc=(0, 0, H - 1.0), mat='F0', bevel=0.1)     # header
    b.box((W + 0.4, D + 0.4, 1.2), loc=(0, 0, 1.2), mat='F1', bevel=0.1)         # trailer
    flat_roof(b, W, D, H, mat='Roof', parapet='Trim')
    for side in 'FLRB':
        for r, z in enumerate((4.5, 8.2, 11.9)):
            for c, x in enumerate((-2.4, 2.4)):
                framed_window(b, side, W, D, x, z, 2.4, 2.4, 'F%d' % ((r + c + 'FLRB'.index(side)) % 4))
    door(b, 'F', W, D, 0, w=1.8, h=2.4, step=None)
    b.obj('bld_d2_a')


@model
def bld_d2_b():
    """Row house block with three bays, each a different picture-frame colour, gable fronts."""
    bld_mats(*D2, trim='#fff3d6')
    for i, c in enumerate(['#35d3b0', '#ff7f6e', '#4d96ff']):
        M('F%d' % i, c)
    b = B()
    W, D, H = 14.0, 9.0, 7.0
    walls(b, W, D, H)
    gable_roof(b, W, D, H, 3.0, mat='Roof', wall='Wall', along='y')
    for i, x in enumerate((-4.6, 0, 4.6)):
        framed_window(b, 'F', W, D, x, 4.9, 2.6, 1.8, 'F%d' % i)
        door(b, 'F', W, D, x - 0.8, w=1.1, h=2.2, step='Trim')
        window(b, 'F', W, D, x + 1.0, 1.6, 0.9, 1.2, cross=False)
        on_face(b, 'F', W, D, x + 2.25, H / 2, (0.25, 0.15, H), 'Trim', out=0.05)
    window_rows(b, 'B', W, D, [2.0, 5.0], 3, 1.6, 1.3, cross=False)
    for side in 'LR':
        framed_window(b, side, W, D, 0, 4.5, 2.4, 2.4, 'F1')
    chimney(b, -4.0, -1.5, H + 1.0, h=3.0)
    b.obj('bld_d2_b')


@model
def bld_d2_c():
    """Envelope house: facade split into coloured header | payload | trailer frames (data frame look)."""
    bld_mats(*D2, trim='#fff3d6')
    M('Hdr', '#4d96ff')
    M('Trl', '#ff7f6e')
    b = B()
    W, D, H = 16.0, 9.0, 9.0
    walls(b, W, D, H, mat='Wall2')
    flat_roof(b, W, D, H, mat='Roof', parapet='Accent', ph=0.7)
    on_face(b, 'F', W, D, -W / 2 + 1.8, H / 2, (3.4, 0.4, H - 0.6), 'Hdr', out=0.15, bevel=0.1)
    on_face(b, 'F', W, D, W / 2 - 1.4, H / 2, (2.6, 0.4, H - 0.6), 'Trl', out=0.15, bevel=0.1)
    for x in (-3.5, 0.0, 3.5):
        window(b, 'F', W, D, x, 6.2, 2.2, 2.0, frame='Accent', sill='Trim')
    window(b, 'F', W, D, -3.5, 2.4, 2.2, 2.0, frame='Accent', sill='Trim')
    window(b, 'F', W, D, 3.5, 2.4, 2.2, 2.0, frame='Accent', sill='Trim')
    door(b, 'F', W, D, 0, w=1.8, h=2.6)
    for z in (2.0, 4.5, 7.0):
        on_face(b, 'F', W, D, -W / 2 + 1.8, z, (1.6, 0.2, 0.5), 'Glass', out=0.4)
        on_face(b, 'F', W, D, W / 2 - 1.4, z, (0.6, 0.2, 0.6), 'Wall2', out=0.4, bevel=0.1)
    window_rows(b, 'B', W, D, [2.4, 6.2], 4, 1.6, 1.6, cross=False)
    window_rows(b, 'L', W, D, [6.2], 2, 1.4, 1.6, cross=False)
    window_rows(b, 'R', W, D, [6.2], 2, 1.4, 1.6, cross=False)
    b.obj('bld_d2_c')


@model
def bld_d2_d():
    """Stacked frame rings tower (four offset coloured frames)."""
    bld_mats(*D2, trim='#fff3d6')
    for i, c in enumerate(['#35d3b0', '#ff7f6e', '#4d96ff', '#e8b64a']):
        M('F%d' % i, c)
    b = B()
    core = 6.0
    b.box((core, core, 20.0), loc=(0, 0, 10.0), mat='Glass', bevel=0.1)
    for k in range(4):
        z = 1.0 + k * 5.0
        rot = k * 0.18
        s = 9.0 - k * 0.6
        m = Matrix.Translation((0, 0, z + 2.0)) @ Matrix.Rotation(rot, 4, 'Z')
        for side in range(4):
            mm = m @ Matrix.Rotation(math.pi / 2 * side, 4, 'Z')
            b.box((s, 0.8, 0.8), mat='F%d' % k, matrix=mm @ Matrix.Translation((0, s / 2, 2.0)), bevel=0.08)
            b.box((s, 0.8, 0.8), mat='F%d' % k, matrix=mm @ Matrix.Translation((0, s / 2, -2.0)), bevel=0.08)
            b.box((0.8, 0.8, 4.8), mat='F%d' % k, matrix=mm @ Matrix.Translation((s / 2, s / 2, 0)), bevel=0.08)
    b.box((core + 1, core + 1, 0.6), loc=(0, 0, 20.3), mat='Roof', bevel=0.1)
    b.box((2.0, 0.3, 2.4), loc=(0, core / 2 + 0.1, 1.2), mat='Door')
    antenna(b, 0, 0, 20.6, h=3.0)
    b.obj('bld_d2_d')


# ===================================================================== D3 routing hills
D3 = ('#f0d189', '#3f8f93', '#ff7f6e')


def hill_house(b, x, y, z, W, D, H, rise, rot=0.0):
    m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z')
    t = B()
    walls(t, W, D, H, plinth='Stone')
    gable_roof(t, W, D, H, rise, mat='Roof', wall='Wall')
    door(t, 'F', W, D, -W * 0.2, w=1.1, h=2.2)
    window(t, 'F', W, D, W * 0.22, 1.7, 1.2, 1.2, shutters='Accent')
    window(t, 'L', W, D, 0, 1.7, 1.2, 1.2, shutters='Accent')
    window(t, 'R', W, D, 0, 1.7, 1.2, 1.2, shutters='Accent')
    window(t, 'B', W, D, 0, 1.7, 1.2, 1.2, cross=False)
    return t, m


def merge_b(dst, src, m):
    bmesh_ = src.bm
    import bmesh as _bm
    _bm.ops.transform(bmesh_, matrix=m, verts=bmesh_.verts)
    me = bpy.data.meshes.new('_m')
    bmesh_.to_mesh(me)
    bmesh_.free()
    remap = [dst.mi(mm) for mm in src.mats]
    t = _bm.new()
    t.from_mesh(me)
    for f in t.faces:
        f.material_index = remap[f.material_index]
    bpy.data.meshes.remove(me)
    dst.merge(t, None)


@model
def bld_d3_a():
    """Cottage on a grassy hill with a winding path and a router mailbox."""
    bld_mats(*D3, trim='#fff3d6')
    M('Grass', '#7fae6a')
    M('Path', '#e2c99a')
    b = B()
    mound(b, 9.0, 2.2)
    t, m = hill_house(b, 0, 0, 2.15, 7.0, 6.0, 3.6, 2.6, 0.1)
    merge_b(b, t, m)
    chimney(b, -1.5, -0.8, 2.15 + 3.6 + 0.8, h=2.2)
    for k in range(6):
        a = -0.4 + k * 0.25
        b.cyl(0.55, 0.12, loc=(math.sin(a) * (3.5 + k * 0.9), 3.4 + k * 0.9, 2.2 - k * 0.38), mat='Path', seg=10)
    b.cyl(0.08, 1.2, loc=(3.0, 7.6, 0.6), mat='Wood', seg=6)
    router_badge(b, (3.0, 7.6, 1.3), s=0.45, mat='Accent', box='Wall2')
    plant_pot(b, -3.0, 3.6, z=2.0, pot='Accent')
    b.obj('bld_d3_a')


@model
def bld_d3_b():
    """Two-storey hill house with a rooftop router (antennas + arrows badge)."""
    bld_mats(*D3, trim='#fff3d6')
    M('Grass', '#7fae6a')
    M('Light_tail', '#ff5a4e', emit=1.0)
    b = B()
    mound(b, 8.0, 1.4)
    W, D, H = 8.0, 7.0, 6.4
    t = B()
    walls(t, W, D, H, plinth='Stone')
    cornice(t, W, D, 3.2, mat='Trim', h=0.25, o=0.1)
    flat_roof(t, W, D, H, mat='Roof', parapet='Trim')
    door(t, 'F', W, D, 0, w=1.3, h=2.3)
    window_rows(t, 'F', W, D, [4.8], 3, 1.2, 1.3, span=6.0, shutters='Accent')
    for x in (-2.6, 2.6):
        window(t, 'F', W, D, x, 1.6, 1.2, 1.2, shutters='Accent')
    window_rows(t, 'L', W, D, [1.6, 4.8], 2, 1.2, 1.3, cross=False)
    window_rows(t, 'R', W, D, [1.6, 4.8], 2, 1.2, 1.3, cross=False)
    window_rows(t, 'B', W, D, [4.8], 2, 1.2, 1.3, cross=False)
    router_badge(t, (0, 0, H + 0.4), s=1.6, mat='Accent', box='Wall2')
    for x in (-1.0, 1.0):
        antenna(t, x, 0, H + 0.85, h=2.2)
    merge_b(b, t, Matrix.Translation((0, 0, 1.35)))
    b.obj('bld_d3_b')


@model
def bld_d3_c():
    """Signal mast on a rock with four arrow signs (routing landmark)."""
    bld_mats(*D3, trim='#fff3d6')
    M('Grass', '#7fae6a')
    M('Light_tail', '#ff5a4e', emit=1.0)
    b = B()
    mound(b, 5.0, 1.6, mat='Stone', seg=12)
    b.cyl(0.5, 16.0, loc=(0, 0, 8.0), r2=0.25, mat='Wall2', seg=10)
    for k in range(4):
        b.box((0.1, 0.1, 15.0), loc=(0, 0, 8.0), mat='Metal')
    for z in (4.0, 8.0, 12.0):
        b.box((1.6, 1.6, 0.2), loc=(0, 0, z), mat='Accent', bevel=0.05)
    arrow = [(-3.0, -0.5), (1.6, -0.5), (1.6, -1.1), (3.2, 0.0), (1.6, 1.1), (1.6, 0.5), (-3.0, 0.5)]
    for k, (z, a) in enumerate(((13.5, 0.3), (12.2, 1.9), (10.9, 3.5), (9.6, 5.0))):
        m = Matrix.Translation((0, 0, z)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((2.4, 0, 0)) @ ROTX90
        b.prism(arrow, 0.2, mat='Accent' if k % 2 else 'Roof', matrix=m)
    router_badge(b, (0, 0, 16.0), s=1.3, mat='Accent', box='Wall2')
    antenna(b, 0, 0, 16.4, h=2.0)
    b.obj('bld_d3_c')


@model
def bld_d3_d():
    """House on a stone arch bridge (spans a road between hills)."""
    bld_mats(*D3, trim='#fff3d6')
    b = B()
    L, Wd = 16.0, 7.0
    for s in (-1, 1):
        b.box((3.0, Wd, 7.0), loc=(s * (L / 2 - 1.5), 0, 3.5), mat='Stone', bevel=0.1)
    arc = [(-(L / 2 - 3.0) * math.cos(math.pi * k / 12), 5.0 + 1.6 * math.sin(math.pi * k / 12)) for k in range(13)]
    top = [(L / 2 - 3.0, 7.0), (-(L / 2 - 3.0), 7.0)]
    m = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    b.prism(arc + top, Wd, mat='Stone', matrix=m)
    b.box((L + 0.4, Wd + 0.6, 0.4), loc=(0, 0, 7.2), mat='Trim', bevel=0.06)
    W, D, H = 9.0, 6.0, 3.6
    t = B()
    walls(t, W, D, H, plinth=None)
    gable_roof(t, W, D, H, 2.4, mat='Roof', wall='Wall')
    window_rows(t, 'F', W, D, [1.8], 3, 1.2, 1.2, shutters='Accent')
    window_rows(t, 'B', W, D, [1.8], 3, 1.2, 1.2, cross=False)
    door(t, 'L', W, D, 0, w=1.0, h=2.1, step=None)
    merge_b(b, t, Matrix.Translation((0, 0, 7.4)))
    b.obj('bld_d3_d')


# ===================================================================== D4 ports square
D4 = ('#d98c5f', '#6a3f73', '#58c46a')


def port_door(b, side, W, D, x, num, w=1.6, h=2.6, col='Accent', z0=0.0):
    on_face(b, side, W, D, x, z0 + h / 2, (w + 0.4, 0.12, h + 0.2), 'Frame', out=0.04)
    on_face(b, side, W, D, x, z0 + h / 2, (w, 0.12, h), col, out=0.08)
    on_face(b, side, W, D, x, z0 + h + 0.75, (w + 0.3, 0.12, 0.95), 'Wall2', out=0.06, bevel=0.04)
    number(b, side, W, D, x, z0 + h + 0.75, num, h=0.6, mat='Roof', out=0.15)


@model
def bld_d4_a():
    """Port row: four numbered doors (21 22 25 53), each a different colour."""
    bld_mats(*D4, trim='#f3e2c8')
    cols = ['#58c46a', '#4d96ff', '#ffb84a', '#ff6b6b']
    for i, c in enumerate(cols):
        M('P%d' % i, c)
    b = B()
    W, D, H = 16.0, 9.0, 8.0
    walls(b, W, D, H)
    cornice(b, W, D, H, mat='Roof', h=0.45, o=0.25)
    flat_roof(b, W, D, H + 0.2, mat='Roof', parapet='Trim', ph=0.6)
    for i, (x, n) in enumerate(zip((-6, -2, 2, 6), ('21', '22', '25', '53'))):
        port_door(b, 'F', W, D, x, n, col='P%d' % i)
        window(b, 'F', W, D, x, 6.3, 1.3, 1.3, frame='Frame', shutters='P%d' % i)
    window_rows(b, 'B', W, D, [2.5, 6.0], 4, 1.4, 1.4, cross=False)
    window_rows(b, 'L', W, D, [6.0], 2, 1.3, 1.3, cross=False)
    window_rows(b, 'R', W, D, [6.0], 2, 1.3, 1.3, cross=False)
    b.obj('bld_d4_a')


@model
def bld_d4_b():
    """Big gate hall with two huge numbered doors: 80 and 443."""
    bld_mats(*D4, trim='#f3e2c8')
    M('P0', '#4d96ff')
    M('P1', '#58c46a')
    M('Lock', '#ffb84a')
    b = B()
    W, D, H = 15.0, 11.0, 11.0
    walls(b, W, D, H)
    gable_roof(b, W, D, H, 3.6, mat='Roof', wall='Wall', along='y')
    port_door(b, 'F', W, D, -3.6, '80', w=4.2, h=5.2, col='P0')
    port_door(b, 'F', W, D, 3.6, '443', w=4.2, h=5.2, col='P1')
    padlock(b, Vector((3.6, D / 2 + 0.35, 2.0)), s=0.45, body='Lock', hole='Door')
    window(b, 'F', W, D, 0, 9.6, 2.0, 1.4, frame='Frame')
    window_rows(b, 'L', W, D, [3.0, 7.5], 3, 1.4, 1.6, cross=False)
    window_rows(b, 'R', W, D, [3.0, 7.5], 3, 1.4, 1.6, cross=False)
    b.obj('bld_d4_b')


@model
def bld_d4_c():
    """Port tower: a tall block covered in small numbered doors with balconies."""
    bld_mats(*D4, trim='#f3e2c8')
    cols = ['#58c46a', '#4d96ff', '#ffb84a', '#ff6b6b', '#b388ff']
    for i, c in enumerate(cols):
        M('P%d' % i, c)
    b = B()
    W, D, H = 9.0, 9.0, 18.0
    walls(b, W, D, H)
    flat_roof(b, W, D, H, mat='Roof', parapet='Trim')
    nums = ['20', '23', '67', '68', '69', '110', '143', '161', '389', '3389']
    k = 0
    for fl in range(4):
        z = 4.5 + fl * 3.4
        for x in (-2.2, 2.2):
            port_door(b, 'F', W, D, x, nums[k % len(nums)], w=1.2, h=1.7, col='P%d' % (k % 5), z0=z - 1.5)
            on_face(b, 'F', W, D, x, z - 1.6, (2.4, 1.2, 0.2), 'Trim', out=0.6)
            k += 1
    port_door(b, 'F', W, D, 0, '1', w=1.8, h=2.6, col='P0')
    for side in 'LRB':
        window_rows(b, side, W, D, [4.5, 8.0, 11.5, 15.0], 2, 1.2, 1.5, cross=False, sill=None)
    b.obj('bld_d4_c')


@model
def bld_d4_d():
    """Roundabout gatehouse: an arch with four numbered gates (place at the port-square roundabout)."""
    bld_mats(*D4, trim='#f3e2c8')
    cols = ['#58c46a', '#4d96ff', '#ffb84a', '#ff6b6b']
    for i, c in enumerate(cols):
        M('P%d' % i, c)
    b = B()
    R = 3.0
    rz = (0, 0, math.pi / 8)
    b.cyl(R, 7.0, loc=(0, 0, 3.5), rot=rz, mat='Wall', seg=8)
    b.cyl(R + 0.4, 0.6, loc=(0, 0, 7.2), rot=rz, mat='Roof', seg=8)
    b.cyl(R * 0.75, 2.4, loc=(0, 0, 8.6), rot=rz, r2=0.3, mat='Roof', seg=8)
    for k, n in enumerate(('80', '25', '53', '22')):
        a = math.pi / 2 * k
        m = Matrix.Rotation(a, 4, 'Z')
        b.box((1.8, 0.2, 3.0), mat='P%d' % k, matrix=m @ Matrix.Translation((0, R * 0.924 + 0.05, 1.5)), bevel=0.05)
        b.box((2.0, 0.2, 0.9), mat='Wall2', matrix=m @ Matrix.Translation((0, R * 0.93 + 0.05, 4.0)), bevel=0.05)
        t = B()
        number(t, 'F', 0.0, 0.0, 0, 0, n, h=0.55, mat='Roof', out=0.0)
        merge_b(b, t, m @ Matrix.Translation((0, R * 0.93 + 0.2, 4.0)))
    b.sphere(0.5, loc=(0, 0, 10.0), mat='Accent', seg=10, rings=6)
    b.obj('bld_d4_d')


# ===================================================================== D5 conversation square
D5 = ('#9ecbd9', '#3e4486', '#e8cf3a')


@model
def bld_d5_a():
    """Cafe with striped awning, outdoor tables and a speech-bubble sign."""
    bld_mats(*D5, trim='#fdf6e3', door='#3e4486')
    M('Bubble', '#ffffff')
    M('Cloth', '#ff7f6e')
    b = B()
    W, D, H = 12.0, 9.0, 6.5
    walls(b, W, D, H)
    gable_roof(b, W, D, H, 2.2, mat='Roof', wall='Wall')
    on_face(b, 'F', W, D, -1.3, 1.6, (6.6, 0.12, 2.4), 'Frame', out=0.03)
    on_face(b, 'F', W, D, -1.3, 1.6, (6.2, 0.12, 2.1), 'Glass', out=0.06)
    door(b, 'F', W, D, 3.8, w=1.4, h=2.4)
    awning(b, 'F', W, D, 0, 3.2, 11.0, depth=1.8, a='Accent', c='Bubble', n=10)
    window_rows(b, 'F', W, D, [5.0], 3, 1.3, 1.1, span=9.0, shutters='Accent')
    speech_bubble(b, (0, D / 2 + 0.6, H + 1.6), r=1.1, mat='Bubble', dots='Roof')
    for x in (-4.0, -1.0, 2.0):
        y = D / 2 + 3.0
        b.cyl(0.55, 0.06, loc=(x, y, 0.8), mat='Cloth', seg=12)
        b.cyl(0.06, 0.8, loc=(x, y, 0.4), mat='Metal', seg=6)
        b.cyl(0.08, 2.4, loc=(x, y, 1.2), mat='Wall2', seg=6)
        b.cyl(1.4, 0.5, loc=(x, y, 2.5), r2=0.1, mat='Accent' if x != -1.0 else 'Cloth', seg=8)
        for s in (-1, 1):
            b.box((0.45, 0.45, 0.06), loc=(x + s * 0.8, y, 0.45), mat='Wood')
            b.box((0.06, 0.45, 0.5), loc=(x + s * 1.02, y, 0.7), mat='Wood')
    b.obj('bld_d5_a')


@model
def bld_d5_b():
    """Two houses joined by a bridge with a phone-cord cable (a 'session' between them)."""
    bld_mats(*D5, trim='#fdf6e3', door='#3e4486')
    M('Cord', '#e8cf3a')
    b = B()
    for s, col in ((-1, 'Wall'), (1, 'Wall2')):
        t = B()
        W, D, H = 6.0, 7.0, 9.0
        walls(t, W, D, H, mat=col)
        gable_roof(t, W, D, H, 2.4, mat='Roof', wall=col, along='y')
        door(t, 'F', W, D, 0, w=1.2, h=2.3)
        window_rows(t, 'F', W, D, [4.2, 7.2], 2, 1.1, 1.3, span=4.0, shutters='Accent')
        window_rows(t, 'B', W, D, [4.2, 7.2], 2, 1.1, 1.3, span=4.0, cross=False)
        window(t, 'L' if s > 0 else 'R', W, D, 0, 2.0, 1.2, 1.2)
        merge_b(b, t, Matrix.Translation((s * 5.0, 0, 0)))
    b.box((4.4, 3.0, 2.4), loc=(0, 0, 5.4), mat='Accent', bevel=0.1)
    b.box((4.45, 2.0, 1.0), loc=(0, 0, 5.6), mat='Glass')
    b.box((4.6, 3.3, 0.3), loc=(0, 0, 6.7), mat='Roof', bevel=0.05)
    pts = []
    for k in range(41):
        t = k / 40
        x = -2.0 + 4.0 * t
        pts.append((x, 1.9 + 0.25 * math.cos(t * 40), 3.6 - 0.6 * math.sin(math.pi * t) + 0.25 * math.sin(t * 40)))
    b.tube(pts, 0.1, 'Cord', seg=6, caps=True)
    b.obj('bld_d5_b')


@model
def bld_d5_c():
    """Round plaza kiosk with a giant speech-bubble sculpture on top."""
    bld_mats(*D5, trim='#fdf6e3', door='#3e4486')
    M('Bubble', '#ffffff')
    M('Bubble2', '#ff9fb2')
    b = B()
    b.cyl(3.5, 4.0, loc=(0, 0, 2.0), mat='Wall', seg=16)
    b.cyl(4.2, 0.4, loc=(0, 0, 4.2), mat='Roof', seg=16)
    for k in range(8):
        a = math.tau * k / 8
        b.box((1.4, 0.15, 1.6), mat='Glass', matrix=Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 3.45, 2.3)))
    b.box((1.3, 0.2, 2.3), loc=(0, 3.45, 1.15), mat='Door')
    speech_bubble(b, (-0.8, 0, 7.2), r=2.2, mat='Bubble', dots='Roof')
    speech_bubble(b, (1.6, 0.3, 10.0), r=1.4, mat='Bubble2', dots='Wall2', tail=(0.6, -0.9), rot=0.2)
    b.cyl(0.3, 2.6, loc=(-0.8, 0, 5.2), mat='Metal', seg=8)
    b.obj('bld_d5_c')


@model
def bld_d5_d():
    """Corner apartment with balconies, flower boxes and a rooftop bubble."""
    bld_mats(*D5, trim='#fdf6e3', door='#3e4486')
    M('Leaf', '#5fae4e')
    M('Flower', '#ff6b9a')
    b = B()
    W, D, H = 11.0, 10.0, 12.0
    walls(b, W, D, H)
    cornice(b, W, D, 3.6, mat='Accent', h=0.3, o=0.1)
    flat_roof(b, W, D, H, mat='Roof', parapet='Trim')
    door(b, 'F', W, D, 0, w=1.6, h=2.6)
    for x in (-3.4, 3.4):
        window(b, 'F', W, D, x, 1.8, 1.6, 1.6)
    for z in (5.2, 8.6):
        for x in (-3.0, 3.0):
            window(b, 'F', W, D, x, z, 1.4, 1.8, sill=None)
            on_face(b, 'F', W, D, x, z - 1.15, (2.6, 1.1, 0.2), 'Trim', out=0.55)
            on_face(b, 'F', W, D, x, z - 0.7, (2.6, 0.08, 0.7), 'Accent', out=1.05)
            on_face(b, 'F', W, D, x, z - 0.95, (1.8, 0.4, 0.3), 'Leaf', out=0.4)
            for dx in (-0.6, 0, 0.6):
                on_face(b, 'F', W, D, x + dx, z - 0.72, (0.22, 0.22, 0.22), 'Flower', out=0.45)
        window(b, 'F', W, D, 0, z, 1.0, 1.4, cross=False)
    for side in 'LRB':
        window_rows(b, side, W, D, [5.2, 8.6], 3, 1.3, 1.6, cross=False, sill=None)
    speech_bubble(b, (2.5, 0, H + 1.8), r=1.0, mat='Accent', dots='Roof')
    b.obj('bld_d5_d')


# ===================================================================== D6 cipher gardens
D6 = ('#b79ae0', '#2f7d6f', '#ffb84a')


@model
def bld_d6_a():
    """Giant padlock pavilion on a hedge-ringed lawn."""
    bld_mats(*D6, trim='#f6efff')
    M('Hedge', '#3f8f5a')
    M('Grass', '#78a889')
    b = B()
    b.cyl(8.0, 0.3, loc=(0, 0, 0.15), mat='Grass', seg=24)
    for k in range(20):
        a = math.tau * k / 20
        if k in (0, 19, 1):
            continue
        b.box((2.4, 1.0, 1.4), mat='Hedge', bevel=0.3, seg=1,
              matrix=Matrix.Rotation(a + math.pi / 2, 4, 'Z') @ Matrix.Translation((0, 7.2, 0.9)))
    padlock(b, Vector((0, 0, 0.3)), s=2.6, body='Accent', shackle='Metal', hole='Roof')
    b.obj('bld_d6_a')


@model
def bld_d6_b():
    """Glass greenhouse on a small hedge maze."""
    bld_mats(*D6, trim='#f6efff')
    M('Hedge', '#3f8f5a')
    M('Leaf', '#6cc070')
    b = B()
    W, D, H = 10.0, 7.0, 3.5
    b.box((W, D, 0.5), loc=(0, 0, 0.25), mat='Stone', bevel=0.05)
    b.box((W - 0.2, D - 0.2, H), loc=(0, 0, 0.5 + H / 2), mat='Glass')
    for x in [-W / 2 + W * k / 5 for k in range(6)]:
        b.box((0.15, D + 0.05, 0.15), loc=(x, 0, 0.5 + H), mat='Trim')
        for s in (-1, 1):
            b.box((0.15, 0.15, H), loc=(x, s * D / 2, 0.5 + H / 2), mat='Trim')
    gable_roof(b, W, D, 0.5 + H, 2.2, mat='Glass', wall='Glass', o=0.15, t=0.12, ridge='Trim')
    b.box((1.4, 0.2, 2.4), loc=(0, D / 2 + 0.05, 1.7), mat='Accent')
    for x in (-3, 0, 3):
        b.sphere(0.9, loc=(x, 0, 1.6), mat='Leaf', seg=10, rings=6)
    # maze hedges in front
    for (x, y, w, d) in ((-6.5, 6.5, 4.0, 0.9), (6.5, 6.5, 4.0, 0.9), (-8.0, 3.5, 0.9, 6.0), (8.0, 3.5, 0.9, 6.0),
                         (-3.0, 9.0, 0.9, 4.0), (3.0, 9.0, 0.9, 4.0), (0, 11.0, 5.0, 0.9)):
        b.box((w, d, 1.4), loc=(x, y, 0.7), mat='Hedge', bevel=0.25)
    b.obj('bld_d6_b')


@model
def bld_d6_c():
    """Keyhole tower with a giant key as a bridge-sign."""
    bld_mats(*D6, trim='#f6efff')
    M('Gold', '#ffcf5a', metal=0.6, rough=0.3)
    b = B()
    b.cyl(3.6, 13.0, loc=(0, 0, 6.5), mat='Wall', seg=14)
    b.cyl(4.0, 0.5, loc=(0, 0, 13.2), mat='Trim', seg=14)
    b.cyl(4.2, 3.4, loc=(0, 0, 15.1), r2=0.4, mat='Roof', seg=14)
    for k in range(14):
        a = math.tau * k / 14
        b.box((1.0, 0.7, 0.8), mat='Trim', matrix=Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 3.9, 13.7)))
    # keyhole door
    b.cyl(1.2, 0.3, loc=(0, 3.5, 4.2), rot=(math.radians(90), 0, 0), mat='Roof', seg=16)
    b.box((1.4, 0.3, 3.2), loc=(0, 3.5, 1.9), mat='Roof', taper=(0.6, 1.0))
    for z in (7.5, 10.5):
        for a in (0.6, -0.6, math.pi):
            b.box((1.0, 0.2, 1.6), mat='Glass', matrix=Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 3.55, z)))
    # giant key leaning on the tower
    m = Matrix.Translation((3.8, 3.3, 0.0)) @ Matrix.Rotation(-0.25, 4, 'Y')
    b.cyl(1.0, 0.4, mat='Gold', matrix=m @ Matrix.Translation((0, 0, 7.0)) @ ROTX90, seg=16)
    b.cyl(0.5, 0.5, mat='Wall', matrix=m @ Matrix.Translation((0, 0, 7.0)) @ ROTX90, seg=12)
    b.box((0.35, 0.35, 6.0), mat='Gold', matrix=m @ Matrix.Translation((0, 0, 3.0)))
    for z, w in ((0.6, 1.0), (1.4, 0.7)):
        b.box((w, 0.3, 0.45), mat='Gold', matrix=m @ Matrix.Translation((w / 2 + 0.15, 0, z)))
    b.obj('bld_d6_c')


@model
def bld_d6_d():
    """Garden pavilion with a cipher wheel (two coloured letter-rings) and topiary."""
    bld_mats(*D6, trim='#f6efff')
    M('Hedge', '#3f8f5a')
    M('Ring2', '#4d96ff')
    b = B()
    b.cyl(5.0, 0.5, loc=(0, 0, 0.25), mat='Stone', seg=16)
    for k in range(8):
        a = math.tau * k / 8
        b.cyl(0.25, 4.0, mat='Trim', seg=8, matrix=Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 4.2, 2.5)))
    b.cyl(5.2, 0.5, loc=(0, 0, 4.7), mat='Trim', seg=16)
    b.cyl(5.4, 2.6, loc=(0, 0, 6.2), r2=0.6, mat='Roof', seg=16)
    m = Matrix.Translation((0, 0, 2.4)) @ ROTX90
    b.cyl(1.9, 0.3, mat='Accent', matrix=m, seg=26)
    b.cyl(1.3, 0.4, mat='Ring2', matrix=m, seg=26)
    b.cyl(0.5, 0.5, mat='Trim', matrix=m, seg=12)
    for k in range(13):
        a = math.tau * k / 13
        for r, mt in ((1.65, 'Trim'), (1.05, 'Trim')):
            b.box((0.16, 0.6, 0.16), loc=(r * math.cos(a), 0, 2.4 + r * math.sin(a)), mat=mt)
    for (x, y) in ((-6.5, 3), (6.5, 3), (-6.5, -3), (6.5, -3)):
        b.cyl(0.6, 0.8, loc=(x, y, 0.4), mat='Stone', seg=8)
        b.sphere(1.0, loc=(x, y, 1.6), mat='Hedge', seg=10, rings=6)
        b.sphere(0.6, loc=(x, y, 2.8), mat='Hedge', seg=8, rings=5)
    b.obj('bld_d6_d')


# ===================================================================== D7 app boulevard
D7 = ('#f3e4c4', '#a94a62', '#4ad6c8')


def icon_grid(b, cx, y, cz, cols, rows, cell=1.2, mats=None):
    for r in range(rows):
        for c in range(cols):
            k = (r * cols + c) % len(mats)
            b.box((cell * 0.8, 0.2, cell * 0.8), loc=(cx + (c - (cols - 1) / 2) * cell, y, cz + ((rows - 1) / 2 - r) * cell),
                  mat=mats[k], bevel=cell * 0.15, seg=2)


def icon_mats():
    out = []
    for i, c in enumerate(['#ff6b6b', '#ffd166', '#06d6a0', '#4d96ff', '#b388ff', '#ff9f43']):
        M('Icon%d' % i, c, emit=0.6)
        out.append('Icon%d' % i)
    return out


@model
def bld_d7_b():
    """Office tower with a giant phone-shaped screen on the front."""
    bld_mats(*D7, trim='#d8c7a6', door='#3e7f8f')
    M('Screen', '#20334a', rough=0.2)
    im = icon_mats()
    b = B()
    W, D, H = 12.0, 10.0, 22.0
    walls(b, W, D, H, mat='Wall')
    for z in [3.0 + 3.0 * k for k in range(7)]:
        b.box((W + 0.1, D + 0.1, 0.25), loc=(0, 0, z), mat='Trim')
    flat_roof(b, W, D, H, mat='Roof', parapet='Trim')
    for side in 'LRB':
        window_rows(b, side, W, D, [4.5, 7.5, 10.5, 13.5, 16.5], 2 if side != 'B' else 3, 1.6, 1.8, cross=False, sill=None)
    on_face(b, 'F', W, D, 0, 12.5, (7.0, 0.5, 13.0), 'Accent', out=0.25, bevel=0.6, seg=2)
    on_face(b, 'F', W, D, 0, 12.5, (6.2, 0.5, 11.4), 'Screen', out=0.35, bevel=0.2)
    icon_grid(b, 0, D / 2 + 0.7, 13.5, 3, 4, cell=1.7, mats=im)
    on_face(b, 'F', W, D, 0, 7.4, (1.2, 0.5, 1.2), 'Wall2', out=0.6, bevel=0.5)
    door(b, 'F', W, D, 0, w=2.6, h=2.8)
    window(b, 'F', W, D, -4.2, 2.0, 2.0, 2.2, cross=False)
    window(b, 'F', W, D, 4.2, 2.0, 2.0, 2.2, cross=False)
    antenna(b, 3.5, -2.0, H + 0.2, h=3.0)
    b.obj('bld_d7_b')


@model
def bld_d7_c():
    """Demo centre: glass dome with orbiting app icons on a round base."""
    bld_mats(*D7, trim='#d8c7a6', door='#3e7f8f')
    im = icon_mats()
    b = B()
    b.cyl(9.0, 3.0, loc=(0, 0, 1.5), mat='Wall', seg=24)
    b.cyl(9.4, 0.4, loc=(0, 0, 3.2), mat='Roof', seg=24)
    for k in range(16):
        a = math.tau * k / 16
        if k in (3, 4, 5):
            continue
        b.box((2.4, 0.2, 1.8), mat='Glass', matrix=Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 8.95, 1.5)))
    M('Dome', '#9fd8ef', rough=0.1)
    b.sphere(7.5, loc=(0, 0, 3.4), mat='Dome', seg=20, rings=10, cut=0.0)
    for k in range(6):
        a = math.tau * k / 6 + 0.3
        r = 8.6
        b.box((1.4, 0.3, 1.4), loc=(r * math.cos(a), r * math.sin(a), 8.0 + 1.0 * math.sin(a * 2)),
              rot=(0, 0, a + math.pi / 2), mat=im[k], bevel=0.3, seg=2)
    b.box((4.0, 2.0, 2.8), loc=(0, 9.0, 1.4), mat='Accent', bevel=0.2)
    b.box((2.4, 0.2, 2.2), loc=(0, 10.0, 1.1), mat='Door')
    b.sphere(0.9, loc=(0, 0, 10.9), mat='Accent', seg=12, rings=6)
    b.obj('bld_d7_c')


@model
def bld_d7_d():
    """Billboard mall: low wide building with a row of glowing app signs and a rooftop billboard frame."""
    bld_mats(*D7, trim='#d8c7a6', door='#3e7f8f')
    M('Screen', '#20334a', rough=0.2)
    im = icon_mats()
    b = B()
    W, D, H = 18.0, 10.0, 6.0
    walls(b, W, D, H)
    cornice(b, W, D, H, mat='Roof', h=0.5, o=0.3)
    flat_roof(b, W, D, H + 0.25, mat='Roof', parapet=None)
    for i, x in enumerate((-6.0, 0.0, 6.0)):
        on_face(b, 'F', W, D, x, 1.6, (4.6, 0.12, 2.6), 'Frame', out=0.03)
        on_face(b, 'F', W, D, x, 1.6, (4.2, 0.12, 2.3), 'Glass', out=0.06)
        on_face(b, 'F', W, D, x, 4.4, (4.4, 0.4, 1.4), 'Screen', out=0.2, bevel=0.2)
        on_face(b, 'F', W, D, x - 1.4, 4.4, (1.0, 0.4, 1.0), im[i], out=0.35, bevel=0.2)
        on_face(b, 'F', W, D, x + 0.6, 4.4, (2.4, 0.4, 0.3), im[i + 3], out=0.35)
    for x in (-3.0, 3.0):
        door(b, 'F', W, D, x, w=1.2, h=2.4, step=None)
    b.box((12.0, 0.6, 5.0), loc=(0, -1.0, H + 3.4), mat='Accent', bevel=0.2)
    b.box((11.2, 0.6, 4.2), loc=(0, -0.9, H + 3.4), mat='Screen')
    icon_grid(b, 0, -0.5, H + 3.4, 5, 2, cell=1.8, mats=im)
    for x in (-4.0, 4.0):
        b.box((0.4, 0.4, 1.4), loc=(x, -1.0, H + 0.7), mat='Metal')
    b.obj('bld_d7_d')


# ===================================================================== lesson garages, Dina's garage, shop, fuel, tower
@model
def bld_garage_main():
    """Dina's garage 'Rules': two bays, wrench sign, tyre stack, oil drums."""
    bld_mats('#f2e2c2', '#c0503a', '#4fb7a0', trim='#5a4a42', door='#7d8a99')
    M('Rubber', '#2e2b33')
    M('Stripe', '#f2c94c')
    b = B()
    W, D, H = 16.0, 12.0, 6.0
    walls(b, W, D, H)
    gable_roof(b, W, D, H, 2.6, mat='Roof', wall='Wall')
    for x in (-3.8, 3.8):
        on_face(b, 'F', W, D, x, 2.2, (5.0, 0.12, 4.6), 'Stripe', out=0.03)
        on_face(b, 'F', W, D, x, 2.1, (4.4, 0.12, 4.2), 'Door', out=0.07)
        for k in range(8):
            on_face(b, 'F', W, D, x, 0.4 + k * 0.5, (4.4, 0.06, 0.06), 'Trim', out=0.13)
    # big round sign with a wrench
    m = face_m('F', W, D, 0, H + 1.0, 0.4, ROTX90)
    b.cyl(1.7, 0.3, mat='Accent', matrix=m, seg=24)
    b.cyl(1.4, 0.36, mat='Wall2', matrix=m, seg=24)
    wm = face_m('F', W, D, 0, H + 1.0, 0.65, Matrix.Rotation(0.7, 4, 'Y'))
    b.box((0.3, 0.12, 1.9), mat='Trim', matrix=wm)
    for s in (-1, 1):
        b.box((0.75, 0.12, 0.35), mat='Trim', matrix=wm @ Matrix.Translation((0, 0, s * 1.0)))
        b.box((0.2, 0.12, 0.35), mat='Trim', matrix=wm @ Matrix.Translation((s * 0.28, 0, s * 1.25)))
    # tyre stack, drums, toolbox
    for k in range(4):
        b.lathe([(0.25, -0.15), (0.45, -0.15), (0.48, 0), (0.45, 0.15), (0.25, 0.15)], loc=(-W / 2 - 1.0, D / 2 - 1.0,
                0.16 + k * 0.31), mat='Rubber', seg=14, cap0=False)
    for (x, c) in ((W / 2 + 0.9, 'Accent'), (W / 2 + 0.9, 'Roof')):
        pass
    b.cyl(0.4, 1.0, loc=(W / 2 + 0.9, D / 2 - 1.2, 0.5), mat='Accent', seg=12)
    b.cyl(0.4, 1.0, loc=(W / 2 + 0.9, D / 2 - 2.2, 0.5), mat='Roof', seg=12)
    window_rows(b, 'L', W, D, [3.0], 3, 1.4, 1.2, shutters='Accent')
    window_rows(b, 'R', W, D, [3.0], 3, 1.4, 1.2, shutters='Accent')
    window_rows(b, 'B', W, D, [3.0], 4, 1.2, 1.2, cross=False)
    on_face(b, 'F', W, D, 0, H - 0.3, (W, 0.15, 0.4), 'Accent', out=0.04)
    b.obj('bld_garage_main')


@model
def bld_garage_lesson06():
    """Garage of Rules (lesson 06): workshop with five glowing rule-symbol badges over the bay."""
    bld_mats('#f6e7c8', '#2f6f8f', '#ffb84a', trim='#3d4a5c', door='#9aa7b8')
    rules = ['#ff6b6b', '#ffd166', '#06d6a0', '#4d96ff', '#b388ff']
    for i, c in enumerate(rules):
        M('Rule%d' % i, c, emit=0.5)
    M('Stripe', '#f2c94c')
    b = B()
    W, D, H = 14.0, 11.0, 7.0
    walls(b, W, D, H)
    flat_roof(b, W, D, H, mat='Roof', parapet='Trim', ph=0.8)
    on_face(b, 'F', W, D, 0, 2.4, (7.4, 0.12, 5.0), 'Stripe', out=0.03)
    on_face(b, 'F', W, D, 0, 2.3, (6.8, 0.12, 4.6), 'Door', out=0.07)
    for k in range(9):
        on_face(b, 'F', W, D, 0, 0.4 + k * 0.5, (6.8, 0.06, 0.06), 'Trim', out=0.13)
    # sign board with five rule badges (circle, square, triangle, diamond, star-ish)
    b.box((W - 1.0, 0.5, 2.0), loc=(0, D / 2 + 0.3, H + 1.6), mat='Trim', bevel=0.15)
    shapes = [None, [(-1, -1), (1, -1), (1, 1), (-1, 1)], [(-1.1, -0.9), (1.1, -0.9), (0, 1.1)],
              [(0, -1.2), (1.2, 0), (0, 1.2), (-1.2, 0)], [(-1, -1), (1, -1), (1, 0.2), (0, 1.2), (-1, 0.2)]]
    for i, sh in enumerate(shapes):
        x = (i - 2) * 2.4
        m = Matrix.Translation((x, D / 2 + 0.65, H + 1.6))
        if sh is None:
            b.cyl(0.7, 0.2, mat='Rule%d' % i, matrix=m @ ROTX90, seg=16)
        else:
            b.prism([(p[0] * 0.62, p[1] * 0.62) for p in sh], 0.2, mat='Rule%d' % i, matrix=m @ ROTX90)
    window_rows(b, 'L', W, D, [3.5], 2, 2.0, 1.6)
    window_rows(b, 'R', W, D, [3.5], 2, 2.0, 1.6)
    door(b, 'R', W, D, 3.5, w=1.2, h=2.3)
    b.obj('bld_garage_lesson06')


@model
def bld_garage_lesson07():
    """Academy Tower (lesson 07): seven stacked floors in the seven layer colours, garage bay at the base."""
    bld_mats('#f3ead6', '#3e4486', '#ffffff', trim='#e9dcc4', door='#9aa7b8')
    layers = ['#e55a4e', '#ff9f43', '#ffd166', '#58c46a', '#4ad6c8', '#4d96ff', '#9b6bd6']
    for i, c in enumerate(layers):
        M('L%d' % (i + 1), c)
    M('Stripe', '#f2c94c')
    b = B()
    W, D = 10.0, 10.0
    z = 0.0
    for i in range(7):
        h = 3.6 if i == 0 else 2.8
        w = W - i * 0.35
        b.box((w, w, h), loc=(0, 0, z + h / 2), mat='L%d' % (i + 1), bevel=0.1)
        b.box((w + 0.4, w + 0.4, 0.3), loc=(0, 0, z + h), mat='Trim', bevel=0.05)
        if i > 0:
            for side in 'FLRB':
                for x in (-w / 4, w / 4):
                    on_face(b, side, w, w, x, z + h / 2, (1.4, 0.1, 1.4), 'Glass', out=0.04)
                    on_face(b, side, w, w, x, z + h / 2, (1.7, 0.08, 1.7), 'Wall2', out=0.02)
        z += h
    b.cyl(2.2, 3.0, loc=(0, 0, z + 1.5), r2=0.2, mat='Roof', seg=12)
    b.sphere(0.5, loc=(0, 0, z + 3.3), mat='Accent', seg=10, rings=6)
    on_face(b, 'F', W, W, 0, 1.6, (5.0, 0.12, 3.2), 'Stripe', out=0.03)
    on_face(b, 'F', W, W, 0, 1.5, (4.4, 0.12, 2.9), 'Door', out=0.07)
    b.obj('bld_garage_lesson07')


@model
def bld_garage_lesson08():
    """Container Depot (lesson 08): warehouse with nested containers (big > medium > small) as a sign."""
    bld_mats('#c9d3dc', '#3f6f9a', '#ffb84a', trim='#4a5560', door='#d8d2c4')
    M('Box0', '#4d96ff')
    M('Box1', '#58c46a')
    M('Box2', '#ff6b6b')
    M('Stripe', '#f2c94c')
    b = B()
    W, D, H = 18.0, 12.0, 7.0
    walls(b, W, D, H)
    gable_roof(b, W, D, H, 2.0, mat='Roof', wall='Wall', along='y')
    on_face(b, 'F', W, D, 0, 2.6, (8.0, 0.12, 5.2), 'Stripe', out=0.03)
    on_face(b, 'F', W, D, 0, 2.5, (7.4, 0.12, 4.8), 'Door', out=0.07)
    for k in range(9):
        on_face(b, 'F', W, D, 0, 0.4 + k * 0.52, (7.4, 0.06, 0.06), 'Trim', out=0.13)
    # nested containers sign on the roof ridge front
    for i, (s, mt) in enumerate(((1.0, 'Box0'), (0.66, 'Box1'), (0.38, 'Box2'))):
        b.box((4.6 * s, 0.4 + i * 0.15, 2.6 * s), loc=(0, D / 2 + 0.4 + i * 0.15, H + 1.6), mat=mt, bevel=0.08)
    container(b, (-W / 2 - 2.0, 1.0, 0), mat='Box0', rotz=math.pi / 2)
    container(b, (-W / 2 - 2.0, 1.0, 2.62), L=4.0, mat='Box1', rotz=math.pi / 2)
    container(b, (W / 2 + 2.0, 0.0, 0), L=4.0, mat='Box2', rotz=math.pi / 2)
    window_rows(b, 'B', W, D, [4.0], 4, 1.6, 1.2, cross=False)
    b.obj('bld_garage_lesson08')


@model
def bld_shop():
    """Paint & vinyl shop: spray-can sign, rim display, big window."""
    bld_mats('#fff1e0', '#e85d75', '#4d96ff', trim='#2f3640', door='#4d96ff')
    M('Can', '#ffd166')
    M('Rubber', '#2e2b33')
    M('Rim', '#d4d9e2', metal=0.6)
    b = B()
    W, D, H = 12.0, 9.0, 6.0
    walls(b, W, D, H)
    flat_roof(b, W, D, H, mat='Roof', parapet='Accent', ph=0.7)
    on_face(b, 'F', W, D, -1.5, 1.8, (7.0, 0.12, 2.8), 'Trim', out=0.03)
    on_face(b, 'F', W, D, -1.5, 1.8, (6.6, 0.12, 2.5), 'Glass', out=0.06)
    door(b, 'F', W, D, 4.0, w=1.4, h=2.5)
    awning(b, 'F', W, D, -1.5, 3.6, 7.4, depth=1.3, a='Roof', c='Wall2', n=8)
    for k, c in enumerate(('Roof', 'Accent', 'Can')):   # paint stripes on the side
        on_face(b, 'L', W, D, 0, 1.2 + k * 1.2, (D - 1.0, 0.1, 0.8), c, out=0.03)
    # spray can on the roof
    b.cyl(1.0, 3.4, loc=(-3.0, 0, H + 1.9), mat='Can', seg=16)
    b.cyl(0.7, 0.6, loc=(-3.0, 0, H + 3.9), r2=0.4, mat='Trim', seg=12)
    b.box((0.4, 0.5, 0.4), loc=(-3.0, 0.4, H + 4.3), mat='Roof')
    b.cyl(1.02, 0.6, loc=(-3.0, 0, H + 2.0), mat='Roof', seg=16)
    # rim display wheel
    m = face_m('F', W, D, 3.4, H + 1.6, 0.0, ROTX90)
    b.lathe([(0.9, -0.3), (1.4, -0.3), (1.5, 0), (1.4, 0.3), (0.9, 0.3)], mat='Rubber', seg=20, matrix=m)
    b.cyl(0.95, 0.4, mat='Rim', matrix=m, seg=16)
    b.cyl(0.3, 0.5, mat='Accent', matrix=m, seg=10)
    b.obj('bld_shop')


@model
def bld_fuel():
    """Fuel station: canopy over two pumps (drive through along X), kiosk behind."""
    bld_mats('#ffffff', '#4ad6c8', '#ff6b6b', trim='#2f3640', door='#4ad6c8')
    M('Light_head', '#fff2c4', emit=1.2)
    M('Screen', '#20334a')
    b = B()
    # canopy 14 x 9 at 5.2 m
    b.box((14.0, 9.0, 0.9), loc=(0, 3.0, 5.6), mat='Accent', bevel=0.12)
    b.box((14.2, 9.2, 0.25), loc=(0, 3.0, 5.1), mat='Wall2')
    for x in (-4.5, 4.5):
        b.box((0.6, 0.6, 5.0), loc=(x, 3.0, 2.5), mat='Wall2', bevel=0.06)
        b.box((1.6, 1.0, 0.25), loc=(x, 3.0, 0.12), mat='Stone')
    for x in (-4.5, 4.5):
        for s in (-1, 1):
            b.box((0.9, 0.6, 1.8), loc=(x, 3.0 + s * 1.2, 0.9 + 0.25), mat='Roof', bevel=0.1)
            b.box((0.6, 0.62, 0.45), loc=(x, 3.0 + s * 1.2, 1.5), mat='Screen')
            b.tube([(x + 0.45, 3.0 + s * 1.2, 1.4), (x + 0.75, 3.0 + s * 1.5, 0.9), (x + 0.55, 3.0 + s * 1.5, 0.5)],
                   0.05, 'Trim', seg=6)
    for k in range(6):
        b.box((1.6, 0.6, 0.06), loc=(-5 + k * 2.0, 3.0, 5.0), mat='Light_head')
    # kiosk
    W, D, H = 9.0, 5.0, 3.6
    t = B()
    walls(t, W, D, H)
    flat_roof(t, W, D, H, mat='Roof', parapet='Accent')
    on_face(t, 'F', W, D, -1.2, 1.5, (5.0, 0.12, 2.2), 'Glass', out=0.05)
    door(t, 'F', W, D, 2.8, w=1.3, h=2.3)
    merge_b(b, t, Matrix.Translation((0, -6.5, 0)))
    b.box((0.5, 0.5, 6.0), loc=(8.0, 6.0, 3.0), mat='Trim')
    b.box((2.2, 0.6, 2.4), loc=(8.0, 6.0, 6.8), mat='Accent', bevel=0.2)
    b.cyl(0.7, 0.7, loc=(8.0, 6.0, 6.8), rot=(math.radians(90), 0, 0), mat='Wall2', seg=14)
    b.obj('bld_fuel')


@model
def landmark_tower():
    """Central tower: seven glowing floors in layer colours, antenna and beacon. ~46 m."""
    M('Wall', '#f3ead6')
    M('Trim', '#3e4486')
    M('Glass', '#4f74a8')
    M('Metal', '#a9b3bf')
    M('Beacon', '#ffffff', emit=2.0)
    layers = ['#e55a4e', '#ff9f43', '#ffd166', '#58c46a', '#4ad6c8', '#4d96ff', '#9b6bd6']
    for i, c in enumerate(layers):
        M('Glow%d' % (i + 1), c, emit=1.2)
    b = B()
    b.cyl(9.0, 1.2, loc=(0, 0, 0.6), mat='Trim', seg=8)
    b.cyl(7.0, 4.0, loc=(0, 0, 3.2), mat='Wall', seg=8)
    for k in range(8):
        a = math.tau * k / 8 + math.pi / 8
        b.box((3.4, 0.2, 2.6), mat='Glass', matrix=Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 6.5, 3.0)))
    z = 5.2
    for i in range(7):
        r = 5.6 - i * 0.38
        b.cyl(r, 3.6, loc=(0, 0, z + 1.8), mat='Wall', seg=8)
        b.cyl(r + 0.18, 1.3, loc=(0, 0, z + 2.0), mat='Glow%d' % (i + 1), seg=8)
        b.cyl(r + 0.5, 0.35, loc=(0, 0, z + 3.75), mat='Trim', seg=8)
        z += 3.95
    b.cyl(2.4, 2.6, loc=(0, 0, z + 1.3), r2=0.8, mat='Trim', seg=8)
    b.cyl(0.25, 9.0, loc=(0, 0, z + 7.0), mat='Metal', seg=6)
    b.sphere(0.9, loc=(0, 0, z + 11.8), mat='Beacon', seg=10, rings=6)
    for h in (z + 4.0, z + 7.0):
        b.cyl(1.0, 0.2, loc=(0, 0, h), mat='Trim', seg=8)
    b.obj('landmark_tower')
