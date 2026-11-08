"""Props, track pieces, items, sky/sea for Packet Run (registered into city.py's REG)."""
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


def pm():
    M('Leaf', '#5fae4e', rough=0.9)
    M('Leaf2', '#7cc95e', rough=0.9)
    M('Bark', '#8a5a3c', rough=0.9)
    M('Metal', '#5d6875', rough=0.4, metal=0.5)
    M('Trim', '#e9dcc4')
    M('Wood', '#b07a45')
    M('Stone', '#a59d93')


# ===================================================================== nature
@model
def tree_b():
    """Pine, 7 m."""
    pm()
    b = B()
    b.cyl(0.2, 1.6, loc=(0, 0, 0.8), mat='Bark', seg=7)
    for k, (z, r, h) in enumerate(((1.4, 1.9, 2.4), (2.9, 1.5, 2.2), (4.3, 1.1, 2.0), (5.6, 0.7, 1.6))):
        b.cyl(r, h, loc=(0, 0, z + h / 2), r2=0.05, mat='Leaf' if k % 2 == 0 else 'Leaf2', seg=9)
    b.obj('tree_b')


@model
def tree_c():
    """Palm (beach), 6.5 m."""
    pm()
    M('Coco', '#7a4a2a')
    b = B()
    pts = [(0.4 * math.sin(t / 8 * 1.4) ** 2, 0, t * 0.75) for t in range(9)]
    b.tube(pts, 0.18, 'Bark', seg=7)
    top = Vector(pts[-1])
    for k in range(7):
        a = math.tau * k / 7
        d = Vector((math.cos(a), math.sin(a), 0))
        leaf = [top, top + d * 1.2 + Vector((0, 0, 0.4)), top + d * 2.4 + Vector((0, 0, 0.0)), top + d * 3.1 + Vector((0, 0, -0.9))]
        for i in range(3):
            p0, p1 = leaf[i], leaf[i + 1]
            mid = (p0 + p1) / 2
            dd = p1 - p0
            w = 0.9 - i * 0.25
            m = Matrix.Translation(mid) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-math.atan2(dd.z, dd.xy.length), 4, 'Y')
            b.box((dd.length + 0.1, w, 0.08), mat='Leaf' if k % 2 else 'Leaf2', matrix=m)
    for k in range(3):
        a = math.tau * k / 3
        b.sphere(0.22, loc=(top.x + 0.3 * math.cos(a), 0.3 * math.sin(a), top.z - 0.3), mat='Coco', seg=8, rings=5)
    b.obj('tree_c')


@model
def bush():
    pm()
    M('Flower', '#ff8fb0')
    b = B()
    for (x, y, z, r) in ((0, 0, 0.55, 0.75), (0.6, 0.2, 0.45, 0.55), (-0.55, -0.1, 0.45, 0.6), (0.1, -0.5, 0.5, 0.5)):
        b.sphere(r, loc=(x, y, z), mat='Leaf' if r > 0.6 else 'Leaf2', seg=9, rings=6)
    for (x, y, z) in ((0.3, 0.5, 1.0), (-0.5, 0.3, 0.9), (0.7, -0.2, 0.8), (-0.1, -0.7, 0.8)):
        b.sphere(0.12, loc=(x, y, z), mat='Flower', seg=6, rings=4)
    b.obj('bush')


@model
def plant_flowers():
    """Flower bed 2 x 1 m."""
    pm()
    for i, c in enumerate(['#ff6b6b', '#ffd166', '#b388ff', '#ff9fb2']):
        M('Fl%d' % i, c)
    b = B()
    b.box((2.0, 1.0, 0.4), loc=(0, 0, 0.2), mat='Wood', bevel=0.05)
    b.box((1.85, 0.85, 0.1), loc=(0, 0, 0.4), mat='Bark')
    k = 0
    for x in (-0.7, -0.35, 0, 0.35, 0.7):
        for y in (-0.2, 0.2):
            b.cyl(0.02, 0.35, loc=(x, y, 0.55), mat='Leaf', seg=4)
            b.sphere(0.13, loc=(x, y, 0.75), mat='Fl%d' % (k % 4), seg=7, rings=4)
            k += 1
    b.obj('plant_flowers')


@model
def rock_a():
    pm()
    b = B()
    b.sphere(1.0, loc=(0, 0, 0.35), scale=(1.3, 1.0, 0.75), mat='Stone', seg=7, rings=5)
    b.sphere(0.6, loc=(0.9, 0.3, 0.2), scale=(1, 0.9, 0.7), mat='Stone', seg=6, rings=4)
    b.obj('rock_a')


@model
def rock_b():
    """Tall boulder, 2.5 m."""
    pm()
    M('Moss', '#7fae6a')
    b = B()
    b.sphere(1.0, loc=(0, 0, 1.1), scale=(1.1, 0.9, 1.4), mat='Stone', seg=7, rings=5, rot=(0.1, 0.2, 0.3))
    b.sphere(1.0, loc=(0, 0, 2.0), scale=(0.8, 0.7, 0.35), mat='Moss', seg=7, rings=4)
    b.obj('rock_b')


# ===================================================================== street furniture
@model
def traffic_light():
    """Pole with an arm over the lane (toward -X), light box faces -Z. Lamps: Light_red/Light_yellow/Light_green."""
    pm()
    M('Light_red', '#ff4b4b', emit=1.4)
    M('Light_yellow', '#ffd23f', emit=1.4)
    M('Light_green', '#3ee08f', emit=1.4)
    M('Box', '#2f3640')
    b = B()
    b.cyl(0.14, 6.0, loc=(0, 0, 3.0), mat='Metal', seg=8)
    b.cyl(0.3, 0.3, loc=(0, 0, 0.15), mat='Metal', seg=8)
    b.box((3.6, 0.14, 0.14), loc=(-1.8, 0, 5.8), mat='Metal')
    b.box((0.6, 0.5, 1.6), loc=(-3.2, 0, 5.1), mat='Box', bevel=0.08)
    for k, mt in enumerate(('Light_red', 'Light_yellow', 'Light_green')):
        z = 5.6 - k * 0.5
        b.cyl(0.18, 0.1, loc=(-3.2, 0.27, z), rot=(math.radians(90), 0, 0), mat=mt, seg=12)
        b.box((0.46, 0.25, 0.06), loc=(-3.2, 0.36, z + 0.2), mat='Box', rot=(0.4, 0, 0))
    b.box((0.4, 0.35, 0.9), loc=(0, 0.2, 2.6), mat='Box', bevel=0.05)
    b.cyl(0.1, 0.06, loc=(0, 0.38, 2.8), rot=(math.radians(90), 0, 0), mat='Light_red', seg=8)
    b.obj('traffic_light')


@model
def fence():
    """Picket fence section, 4 m along X, 1 m high."""
    pm()
    M('Paint', '#fdf6e8')
    b = B()
    for k in range(11):
        x = -1.9 + k * 0.38
        b.box((0.16, 0.06, 0.9), loc=(x, 0, 0.45), mat='Paint', taper=(0.4, 1.0))
    for z in (0.3, 0.7):
        b.box((4.0, 0.05, 0.1), loc=(0, -0.05, z), mat='Paint')
    b.obj('fence')


@model
def sign_arrow():
    """Direction sign: post + arrow board pointing +X (viewer's left when seen from -Z... rotate as needed)."""
    pm()
    M('Board', '#3e7fd6')
    M('Paint', '#ffffff')
    b = B()
    b.cyl(0.07, 2.8, loc=(0, 0, 1.4), mat='Metal', seg=6)
    arrow = [(-1.0, -0.35), (0.6, -0.35), (0.6, -0.6), (1.2, 0.0), (0.6, 0.6), (0.6, 0.35), (-1.0, 0.35)]
    b.prism(arrow, 0.08, mat='Board', matrix=Matrix.Translation((0.3, 0, 2.4)) @ ROTX90)
    inner = [(x * 0.82, y * 0.6) for x, y in arrow]
    b.prism(inner, 0.1, mat='Paint', matrix=Matrix.Translation((0.3, 0, 2.4)) @ ROTX90 @ Matrix.Diagonal((1, 1, 1, 1)))
    b.prism([(x * 0.7, y * 0.4) for x, y in arrow], 0.12, mat='Board', matrix=Matrix.Translation((0.3, 0, 2.4)) @ ROTX90)
    b.obj('sign_arrow')


@model
def bench():
    pm()
    b = B()
    for k in range(3):
        b.box((1.8, 0.14, 0.05), loc=(0, -0.2 + k * 0.17, 0.48), mat='Wood', bevel=0.015)
    for k in range(2):
        b.box((1.8, 0.05, 0.13), loc=(0, 0.3, 0.7 + k * 0.18), mat='Wood', bevel=0.015)
    for x in (-0.75, 0.75):
        b.box((0.08, 0.55, 0.08), loc=(x, 0, 0.42), mat='Metal')
        b.box((0.08, 0.08, 0.45), loc=(x, -0.2, 0.22), mat='Metal')
        b.box((0.08, 0.08, 0.95), loc=(x, 0.28, 0.47), mat='Metal')
    b.obj('bench')


@model
def crate():
    pm()
    b = B()
    b.box((1.0, 1.0, 1.0), loc=(0, 0, 0.5), mat='Wood', bevel=0.03)
    for s in (-1, 1):
        b.box((1.04, 0.1, 0.1), loc=(0, s * 0.47, 0.5), mat='Bark', rot=(0, 0.78, 0))
        b.box((0.1, 1.04, 0.1), loc=(s * 0.47, 0, 0.5), mat='Bark', rot=(0.78, 0, 0))
    b.obj('crate')


@model
def barrel():
    pm()
    M('Paint', '#3f8fd2')
    b = B()
    b.lathe([(0.0, 0.0), (0.4, 0.0), (0.46, 0.5), (0.4, 1.0), (0.0, 1.0)], mat='Paint', seg=14)
    for z in (0.15, 0.85):
        b.cyl(0.445, 0.06, loc=(0, 0, z), mat='Metal', seg=14)
    b.obj('barrel')


@model
def statue_small():
    """Small plaza statue: a packet (envelope cube) on a pedestal."""
    pm()
    M('Bronze', '#c9a24a', metal=0.6, rough=0.35)
    b = B()
    b.box((1.6, 1.6, 0.4), loc=(0, 0, 0.2), mat='Stone', bevel=0.05)
    b.box((1.1, 1.1, 1.4), loc=(0, 0, 1.1), mat='Trim', bevel=0.06)
    m = Matrix.Translation((0, 0, 2.3)) @ Matrix.Rotation(0.35, 4, 'Z')
    b.box((1.3, 0.5, 0.9), mat='Bronze', matrix=m, bevel=0.05)
    for sx in (-1, 1):   # envelope flap: a V of two bars on the front
        b.box((0.75, 0.08, 0.08), mat='Stone', matrix=m @ Matrix.Translation((sx * 0.3, 0.27, 0.2)) @ Matrix.Rotation(sx * 0.6, 4, 'Y'))
    b.sphere(0.12, mat='Stone', matrix=m @ Matrix.Translation((0, 0.27, 0.0)), seg=8, rings=5)
    b.obj('statue_small')


# ===================================================================== track pieces
@model
def ramp():
    """Jump ramp 4 m wide, 6 m long, 1.3 m high. Drive toward -Z (glTF) to climb: low end at +Z."""
    M('Paint', '#ffb020')
    M('Stripe', '#2f3640')
    M('Metal', '#8a95a3')
    b = B()
    L, Wd, H = 6.0, 4.0, 1.3
    side = [(-L / 2, 0), (L / 2, 0), (L / 2, H), (L / 2 - 0.4, H)]
    m = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    b.prism(side, Wd, mat='Metal', matrix=m)
    ang = math.atan2(H, L - 0.4)
    ln = math.hypot(L - 0.4, H)
    for k in range(6):
        t = (k + 0.5) / 6
        y = -L / 2 + (L - 0.4) * t
        z = H * t
        b.box((Wd + 0.04, ln / 6 - 0.02, 0.06), loc=(0, y, z + 0.03), rot=(ang, 0, 0), mat='Paint' if k % 2 else 'Stripe')
    for s in (-1, 1):
        b.box((0.12, L, 0.12), loc=(s * Wd / 2, 0, 0.06), mat='Stripe')
    b.obj('ramp')


@model
def bridge_piece():
    """Bridge deck segment 12 m long (along Z) x 10 m wide; origin = centre of the deck TOP surface; pier to 6 m below."""
    M('Deck', '#7d7f88')
    M('Stone', '#b9ad9c')
    M('Rail', '#e55a4e')
    M('Line', '#f5f0e0')
    b = B()
    L, Wd = 12.0, 10.0
    b.box((Wd, L, 0.8), loc=(0, 0, -0.4), mat='Stone', bevel=0.05)
    b.box((Wd - 1.2, L, 0.04), loc=(0, 0, 0.0), mat='Deck')
    b.box((0.2, L * 0.4, 0.05), loc=(0, -L * 0.2, 0.03), mat='Line')
    for s in (-1, 1):
        b.box((0.6, L, 0.35), loc=(s * (Wd / 2 - 0.3), 0, 0.15), mat='Stone')
        for k in range(5):
            b.box((0.15, 0.15, 1.0), loc=(s * (Wd / 2 - 0.3), -L / 2 + 1.2 + k * 2.4, 0.8), mat='Rail')
        b.box((0.18, L, 0.15), loc=(s * (Wd / 2 - 0.3), 0, 1.3), mat='Rail')
    b.box((3.0, 2.4, 6.0), loc=(0, 0, -3.8), mat='Stone', bevel=0.1)
    b.box((4.0, 3.0, 0.4), loc=(0, 0, -0.95), mat='Stone')
    b.obj('bridge_piece')


@model
def checkpoint_gate():
    """Race gate: two pillars 12 m apart (road passes along Z between them), checkered banner at 6 m, flags."""
    M('Paint', '#ff5a4e')
    M('White', '#ffffff')
    M('Black', '#2b2d36')
    M('Flag', '#ffd23f')
    b = B()
    span = 12.0
    for s in (-1, 1):
        b.cyl(0.5, 7.0, loc=(s * span / 2, 0, 3.5), mat='Paint', seg=8)
        b.cyl(0.75, 0.6, loc=(s * span / 2, 0, 0.3), mat='White', seg=10)
        b.cyl(0.04, 1.8, loc=(s * span / 2, 0, 7.9), mat='Black', seg=5)
        b.prism([(0, 0), (1.1, -0.35), (0, -0.7)], 0.04, mat='Flag',
                matrix=Matrix.Translation((s * span / 2, 0, 8.75)) @ ROTX90)
    b.box((span + 1.0, 0.5, 1.6), loc=(0, 0, 6.4), mat='Paint', bevel=0.1)
    n = 14
    for r in range(2):
        for c in range(n):
            x = -span / 2 + span * (c + 0.5) / n
            b.box((span / n, 0.56, 0.55), loc=(x, 0, 6.13 + r * 0.55), mat='White' if (r + c) % 2 else 'Black')
    b.obj('checkpoint_gate')


@model
def nitro_pad():
    """Boost pad on the road, 4 x 3 m, chevrons point to -Z (the driving direction)."""
    M('Base', '#2f3640')
    M('Emissive', '#4ad6ff', emit=2.0)
    M('Trim', '#ffb020')
    b = B()
    b.box((4.0, 3.0, 0.08), loc=(0, 0, 0.04), mat='Base', bevel=0.03)
    b.box((4.1, 3.1, 0.04), loc=(0, 0, 0.02), mat='Trim')
    chev = [(-1.4, -0.3), (0.0, 0.55), (1.4, -0.3), (1.4, 0.15), (0.0, 1.0), (-1.4, 0.15)]
    for k in range(3):
        b.prism(chev, 0.06, mat='Emissive', matrix=Matrix.Translation((0, -1.2 + k * 0.85, 0.1)))
    b.obj('nitro_pad')


# ===================================================================== pickups and quiz boxes
@model
def item_box():
    """Floating '?' crate, 1.2 m (origin at its centre; engine bobs/spins it)."""
    M('Box', '#ffcf3a', rough=0.4)
    M('Edge', '#ff7a2f')
    M('Emissive', '#ffffff', emit=1.6)
    b = B()
    b.box((1.0, 1.0, 1.0), mat='Box', bevel=0.08)
    for ax in range(3):
        for s1 in (-1, 1):
            for s2 in (-1, 1):
                loc = [0, 0, 0]
                loc[(ax + 1) % 3] = s1 * 0.55
                loc[(ax + 2) % 3] = s2 * 0.55
                size = [0.14, 0.14, 0.14]
                size[ax] = 1.0
                b.box(tuple(size), loc=tuple(loc), mat='Edge')
    # question-mark glyph on all four sides (arc + stem + dot) built from short bars
    arc = [(0.17 * math.cos(math.pi * 1.05 - i * math.pi * 1.45 / 6), 0.17 + 0.15 * math.sin(math.pi * 1.05 - i * math.pi * 1.45 / 6))
           for i in range(7)] + [(0.0, -0.05)]
    for k in range(4):
        R_ = Matrix.Rotation(math.pi / 2 * k, 4, 'Z') @ Matrix.Translation((0, 0.53, 0))
        for (x0, z0), (x1, z1) in zip(arc, arc[1:]):
            ln = math.hypot(x1 - x0, z1 - z0)
            m = R_ @ Matrix.Translation(((x0 + x1) / 2, 0, (z0 + z1) / 2)) @ Matrix.Rotation(-math.atan2(z1 - z0, x1 - x0), 4, 'Y')
            b.box((ln + 0.1, 0.06, 0.1), mat='Emissive', matrix=m)
        b.box((0.12, 0.06, 0.12), mat='Emissive', matrix=R_ @ Matrix.Translation((0, 0, -0.25)))
    b.obj('item_box')


@model
def answer_box():
    """Quiz answer box 2.4 x 1.6 x 1.2 m: tinted `Paint` body, white `Label` panel facing -Z for the answer text."""
    M('Paint', '#4d96ff')
    M('Label', '#ffffff')
    M('Trim', '#2f3640')
    M('Emissive', '#ffffff', emit=1.0)
    b = B()
    b.box((2.4, 1.2, 1.6), loc=(0, 0, 0.8), mat='Paint', bevel=0.12, seg=2)
    b.box((2.0, 0.08, 1.1), loc=(0, 0.62, 0.85), mat='Label', bevel=0.04)
    b.box((2.5, 1.3, 0.12), loc=(0, 0, 0.06), mat='Trim', bevel=0.03)
    for s in (-1, 1):
        b.sphere(0.12, loc=(s * 1.05, 0.62, 1.48), mat='Emissive', seg=8, rings=5)
    b.obj('answer_box')


@model
def coin():
    """Gold coin, 0.8 m, standing (face toward -Z), spin about Y."""
    M('Gold', '#ffcf3a', metal=0.7, rough=0.3)
    M('Gold2', '#f0a020', metal=0.7, rough=0.3)
    b = B()
    m = ROTX90
    b.lathe([(0.0, 0.05), (0.3, 0.05), (0.33, 0.07), (0.4, 0.05), (0.4, -0.05), (0.33, -0.07), (0.3, -0.05), (0.0, -0.05)],
            mats=['Gold', 'Gold2', 'Gold2', 'Gold', 'Gold2', 'Gold2', 'Gold'], seg=20, matrix=m)
    for s in (-1, 1):
        b.box((0.26, 0.04, 0.18), loc=(0, s * 0.06, 0), mat='Gold2', bevel=0.02)
        b.prism([(-0.13, 0.09), (0.13, 0.09), (0, -0.01)], 0.02, mat='Gold',
                matrix=Matrix.Translation((0, s * 0.085, 0)) @ ROTX90)
    b.obj('coin')


@model
def parcel():
    """Glowing delivery parcel 0.9 m with ribbon and a halo ring (origin at centre)."""
    M('Cargo', '#d9a35e')
    M('Tape', '#f2d16b')
    M('Emissive', '#7ff0e4', emit=2.0)
    b = B()
    b.box((0.9, 0.7, 0.6), mat='Cargo', bevel=0.05)
    b.box((0.92, 0.16, 0.62), mat='Tape')
    b.box((0.18, 0.72, 0.62), mat='Tape')
    b.sphere(0.12, loc=(-0.1, 0, 0.36), scale=(1.2, 0.6, 0.6), mat='Emissive', seg=8, rings=5)
    b.sphere(0.12, loc=(0.1, 0, 0.36), scale=(1.2, 0.6, 0.6), mat='Emissive', seg=8, rings=5)
    b.lathe([(0.75, -0.03), (0.82, -0.03), (0.82, 0.03), (0.75, 0.03)], loc=(0, 0, -0.45), mat='Emissive', seg=24,
            cap0=False)
    b.obj('parcel')


# ===================================================================== throwable items
@model
def item_oil():
    """Oil slick, ~2.2 m, flat on the road (0.03 m)."""
    M('Oil', '#2a2440', rough=0.05)
    M('Sheen', '#7a5fd0', rough=0.05)
    M('Sheen2', '#3fb5c8', rough=0.05)
    b = B()
    pts = [((1.0 + 0.18 * math.sin(a * 3) + 0.1 * math.cos(a * 5)) * math.cos(a) * 1.1,
            (1.0 + 0.18 * math.sin(a * 3) + 0.1 * math.cos(a * 5)) * math.sin(a) * 0.9) for a in
           [math.tau * k / 24 for k in range(24)]]
    b.prism(pts, 0.03, mat='Oil', loc=(0, 0, 0.015))
    b.prism([(x * 0.35 + 0.3, y * 0.25 + 0.2) for x, y in pts], 0.035, mat='Sheen', loc=(0, 0, 0.02))
    b.prism([(x * 0.2 - 0.4, y * 0.15 - 0.25) for x, y in pts], 0.035, mat='Sheen2', loc=(0, 0, 0.02))
    for (x, y, r) in ((1.4, 0.5, 0.18), (-1.3, -0.6, 0.14), (0.6, -1.0, 0.12)):
        b.cyl(r, 0.03, loc=(x, y, 0.015), mat='Oil', seg=10)
    b.obj('item_oil')


@model
def item_cones():
    """One traffic cone 0.75 m (the engine scatters several)."""
    M('Paint', '#ff7a1f')
    M('White', '#ffffff')
    M('Base', '#2f3640')
    b = B()
    b.box((0.55, 0.55, 0.06), loc=(0, 0, 0.03), mat='Base', bevel=0.03)
    b.lathe([(0.2, 0.06), (0.15, 0.3), (0.13, 0.36), (0.1, 0.5), (0.05, 0.72), (0.0, 0.75)],
            mats=['Paint', 'White', 'Paint', 'Paint', 'Paint'], seg=14)
    b.lathe([(0.24, 0.06), (0.2, 0.06)], mat='Paint', seg=14)
    b.obj('item_cones')


@model
def item_glue():
    """Sticky glue puddle with bubbles, ~2 m."""
    M('Glue', '#b8e04a', rough=0.15)
    M('Glue2', '#e9f78c', rough=0.15)
    b = B()
    pts = [((1.0 + 0.15 * math.sin(a * 4)) * math.cos(a), (1.0 + 0.15 * math.sin(a * 4)) * math.sin(a) * 0.85) for a in
           [math.tau * k / 20 for k in range(20)]]
    b.prism(pts, 0.05, mat='Glue', loc=(0, 0, 0.025))
    for (x, y, r) in ((0.3, 0.2, 0.22), (-0.4, -0.1, 0.16), (0.1, -0.45, 0.12), (-0.2, 0.5, 0.1), (0.6, -0.2, 0.09)):
        b.sphere(r, loc=(x, y, 0.04), mat='Glue2', seg=8, rings=5, cut=0.0)
    b.obj('item_glue')


@model
def item_boostpad():
    """Thrown mini boost pad 2 x 1.6 m, chevrons toward -Z."""
    M('Base', '#2f3640')
    M('Emissive', '#ff5fd2', emit=2.0)
    M('Trim', '#ffb020')
    b = B()
    b.box((2.0, 1.6, 0.08), loc=(0, 0, 0.04), mat='Base', bevel=0.03)
    b.box((2.06, 1.66, 0.04), loc=(0, 0, 0.02), mat='Trim')
    chev = [(-0.7, -0.15), (0.0, 0.28), (0.7, -0.15), (0.7, 0.08), (0.0, 0.5), (-0.7, 0.08)]
    for k in range(2):
        b.prism(chev, 0.06, mat='Emissive', matrix=Matrix.Translation((0, -0.55 + k * 0.55, 0.1)))
    b.obj('item_boostpad')


@model
def item_mine():
    """Magnetic bounce bubble (cute, not a bomb): soap bubble with a horseshoe magnet on top and a happy face. ~1 m."""
    M('Bubble', '#9fe7ff', rough=0.05)
    M('Shine', '#ffffff', emit=1.0)
    M('Magnet', '#ff4b6e')
    M('Tip', '#e9eef5', metal=0.6)
    M('Face', '#2b2d36')
    b = B()
    b.sphere(0.45, loc=(0, 0, 0.5), mat='Bubble', seg=16, rings=10)
    b.sphere(0.09, loc=(-0.18, 0.3, 0.75), scale=(1, 0.5, 1.4), mat='Shine', seg=8, rings=5)
    pts = [(0.17 * math.cos(math.pi * k / 8), 0, 1.02 + 0.17 * math.sin(math.pi * k / 8)) for k in range(9)]
    pts = [(-0.17, 0, 0.88)] + pts[::-1][::1] + [(0.17, 0, 0.88)]
    pts = [(0.2, 0, 1.08)] + [(0.2 * math.cos(math.pi * k / 8), 0, 1.16 + 0.2 * math.sin(math.pi * k / 8)) for k in range(9)] + [(-0.2, 0, 1.08)]
    b.tube(pts, 0.08, 'Magnet', seg=8)
    for s in (-1, 1):
        b.cyl(0.085, 0.14, loc=(s * 0.2, 0, 1.0), mat='Tip', seg=8)
        b.box((0.03, 0.03, 0.14), loc=(s * 0.38, 0, 1.12), rot=(0, s * 0.5, 0), mat='Shine')
        b.sphere(0.055, loc=(s * 0.14, 0.41, 0.56), scale=(0.8, 0.5, 1.2), mat='Face', seg=8, rings=5)
    b.tube([(-0.12, 0.42, 0.42), (-0.06, 0.44, 0.37), (0.06, 0.44, 0.37), (0.12, 0.42, 0.42)], 0.022, 'Face', seg=5)
    b.obj('item_mine')


@model
def item_smoke():
    """Smoke puff cluster ~3 m (engine fades/scales it)."""
    M('Smoke', '#c9c4d6')
    M('Smoke2', '#e8e4f0')
    b = B()
    for (x, y, z, r, m) in ((0, 0, 0.9, 1.0, 'Smoke'), (0.9, 0.3, 0.7, 0.75, 'Smoke2'), (-0.85, -0.2, 0.7, 0.8, 'Smoke2'),
                            (0.2, -0.7, 0.6, 0.65, 'Smoke'), (-0.2, 0.7, 1.4, 0.6, 'Smoke2'), (0.4, 0.1, 1.7, 0.55, 'Smoke')):
        b.sphere(r, loc=(x, y, z), mat=m, seg=10, rings=7)
    b.obj('item_smoke')


# ===================================================================== sky and sea
def cloud(name, puffs):
    M('Cloud', '#ffffff')
    M('Cloud2', '#e6eef8')
    b = B()
    for (x, y, z, r) in puffs:
        b.sphere(r, loc=(x, y, z), mat='Cloud' if z > 0.5 else 'Cloud2', scale=(1, 1, 0.8), seg=10, rings=7)
    b.box((sum(abs(p[0]) for p in puffs) / len(puffs) * 2 + 4, 4, 0.6), loc=(0, 0, -0.2), mat='Cloud2', bevel=0.3)
    b.obj(name)


@model
def cloud_a():
    """Cloud ~14 m wide (scale freely)."""
    cloud('cloud_a', [(0, 0, 1.2, 3.0), (3.2, 0.3, 0.6, 2.2), (-3.0, -0.2, 0.5, 2.4), (1.2, -1.0, 1.8, 1.8), (-5.0, 0.4, 0, 1.4),
                      (5.2, 0, 0, 1.4)])


@model
def cloud_b():
    cloud('cloud_b', [(0, 0, 0.8, 2.2), (2.4, 0.2, 0.4, 1.7), (-2.2, 0, 0.3, 1.6), (0.6, 0.6, 1.6, 1.4)])


@model
def cloud_c():
    cloud('cloud_c', [(0, 0, 0.6, 2.0), (2.6, 0, 1.0, 2.4), (5.4, 0.2, 0.5, 1.8), (-2.4, 0, 0.3, 1.5), (7.6, 0, 0, 1.2),
                      (3.6, -0.6, 2.0, 1.4)])


@model
def sea_plane():
    """Water plane 400 x 400 m at y = 0 with UV 0..40 (tile tex/water.png with RepeatWrapping)."""
    M('Water', '#4fb3d9', rough=0.1, image=os.path.join(TEX, 'water.png') if os.path.exists(os.path.join(TEX, 'water.png')) else None)
    b = B()
    S, n = 400.0, 8
    verts, uvs, faces = [], [], []
    for j in range(n + 1):
        for i in range(n + 1):
            verts.append((-S / 2 + S * i / n, -S / 2 + S * j / n, 0))
            uvs.append((40 * i / n, 40 * j / n))
    for j in range(n):
        for i in range(n):
            a = j * (n + 1) + i
            faces.append((a, a + 1, a + n + 2, a + n + 1))
    b.raw(verts, faces, 'Water', uvs=uvs)
    b.obj('sea_plane')


@model
def sky_dome():
    """Inverted sky sphere r = 900 m, UV v = elevation (0 horizon-below .. 1 zenith), material Sky uses tex/sky_gradient.png.
    Render unlit (MeshBasicMaterial, side BackSide, fog off, depthWrite off)."""
    p = os.path.join(TEX, 'sky_gradient.png')
    M('Sky', '#a9d2ec', image=p if os.path.exists(p) else None)
    b = B()
    R, nu, nv = 900.0, 24, 10
    verts, uvs, faces = [], [], []
    for j in range(nv + 1):
        el = -0.25 + (math.pi / 2 + 0.25) * j / nv
        for i in range(nu + 1):
            az = math.tau * i / nu
            verts.append((R * math.cos(el) * math.cos(az), R * math.cos(el) * math.sin(az), R * math.sin(el)))
            uvs.append((i / nu, j / nv))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + nu + 1, a + nu + 2, a + 1))   # facing inward
    b.raw(verts, faces, 'Sky', smooth=True, uvs=uvs)
    b.obj('sky_dome', sharp=180)
