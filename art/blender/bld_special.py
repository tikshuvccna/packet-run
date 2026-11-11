"""City landmarks: city hall, stadium, police station, taxi station, bakery, bookshop, pizzeria, tyre shop;
traffic extras: motorcycle with a rider, taxi roof sign, police light bar."""
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
T = Matrix.Translation


def front_tri(b, x, y, z, half, rise, depth, mat):
    """Triangle (pediment) facing the front: base centre at (x, y, z)."""
    b.prism([(-half, 0), (half, 0), (0, rise)], depth, mat=mat, matrix=T((x, y, z)) @ ROTX90)


def checker_strip(b, side, W, D, z, n, h=0.5, a='Trim', c='Wall2', out=0.05, span=None):
    span = span or (W if side in 'FB' else D)
    for row in range(2):
        for i in range(n):
            on_face(b, side, W, D, -span / 2 + span * (i + 0.5) / n, z + row * h / 2, (span / n, 0.08, h / 2),
                    a if (i + row) % 2 == 0 else c, out=out)


@model
def bld_cityhall():
    """City hall: wide steps, six columns, pediment, clock tower with a dome and a flag."""
    bld_mats('#f4ead6', '#3f8f93', '#e0a940', trim='#d9cdb4', door='#6a4a3a', glass='#6b9bd6')
    M('Flag', '#ff7a59')
    M('Clock', '#fffaf0')
    b = B()
    W, D, H = 24.0, 12.0, 8.0
    walls(b, W, D, H, bevel=0.1)
    cornice(b, W, D, H, h=0.5, o=0.35)
    flat_roof(b, W, D, H + 0.25, mat='Roof', parapet='Trim', ph=0.6)
    for k in range(4):   # steps
        b.box((13.0 - k * 0.6, 3.2 - k * 0.7, 0.3), loc=(0, D / 2 + 1.6 - k * 0.35, 0.15 + k * 0.3), mat='Stone')
    b.box((12.4, 2.6, 0.3), loc=(0, D / 2 + 1.3, H - 0.6), mat='Trim', bevel=0.05)   # portico slab
    for i in range(6):
        x = -5.5 + i * 2.2
        b.cyl(0.38, H - 2.0, loc=(x, D / 2 + 2.1, 1.2 + (H - 2.0) / 2), mat='Wall2', seg=10)
        b.box((1.0, 1.0, 0.25), loc=(x, D / 2 + 2.1, 1.32), mat='Trim')
        b.box((1.0, 1.0, 0.25), loc=(x, D / 2 + 2.1, H - 0.85), mat='Trim')
    front_tri(b, 0, D / 2 + 2.7, H - 0.45, 6.6, 2.4, 2.8, 'Wall')
    front_tri(b, 0, D / 2 + 2.78, H - 0.2, 5.4, 1.9, 0.1, 'Accent')
    door(b, 'F', W, D, 0, w=2.2, h=3.4)
    window_rows(b, 'F', W, D, [2.6, 5.6], 2, 1.4, 1.8, span=5.0)
    for s in (-1, 1):
        for z in (2.6, 5.6):
            for dx in (0, 2.6):
                window(b, 'F', W, D, s * (8.0 + dx), z, 1.4, 1.8)
    window_rows(b, 'L', W, D, [2.6, 5.6], 4, 1.3, 1.8)
    window_rows(b, 'R', W, D, [2.6, 5.6], 4, 1.3, 1.8)
    window_rows(b, 'B', W, D, [2.6, 5.6], 8, 1.3, 1.8, cross=False)
    # clock tower
    TW, TH = 5.0, 7.0
    b.box((TW, TW, TH), loc=(0, 0, H + TH / 2), mat='Wall', bevel=0.1)
    b.box((TW + 0.6, TW + 0.6, 0.4), loc=(0, 0, H + TH), mat='Trim', bevel=0.06)
    for side in 'FBLR':
        m = face_m(side, TW, TW, 0, H + TH - 2.4, 0.1, ROTX90)
        b.cyl(1.7, 0.2, mat='Accent', matrix=m, seg=20)
        b.cyl(1.45, 0.26, mat='Clock', matrix=m, seg=20)
        on_face(b, side, TW, TW, 0, H + TH - 1.9, (0.14, 0.1, 1.1), 'Door', out=0.26)
        on_face(b, side, TW, TW, 0.35, H + TH - 2.4, (0.8, 0.1, 0.14), 'Door', out=0.26)
    b.sphere(2.6, loc=(0, 0, H + TH + 0.2), scale=(1, 1, 0.8), mat='Roof', seg=16, rings=8)
    b.cyl(0.07, 4.0, loc=(0, 0, H + TH + 3.8), mat='Metal', seg=6)
    b.box((1.8, 0.06, 1.1), loc=(0.95, 0, H + TH + 5.1), mat='Flag')
    b.sphere(0.3, loc=(0.95, 0, H + TH + 5.1), scale=(1, 0.2, 1), mat='Accent', seg=10, rings=6)
    for s in (-1, 1):
        plant_pot(b, s * 7.6, D / 2 + 1.0)
    b.obj('bld_cityhall')


@model
def bld_stadium():
    """Stadium: oval bowl of stands around a green pitch, four floodlight masts, entrance arch with a scoreboard."""
    bld_mats('#e8e4dc', '#e55a4e', '#4a90e2', trim='#3b4252', door='#3b4252')
    M('Pitch', '#4fae4e')
    M('Line', '#f6f6f0')
    M('Seat0', '#e55a4e')
    M('Seat1', '#4a90e2')
    M('Seat2', '#ffd23f')
    M('Light_head', '#fff6d0', emit=1.4)
    M('Screen', '#1b2a3a')
    b = B()
    SX, SY = 1.35, 1.0     # oval
    S = Matrix.Diagonal((SX, SY, 1, 1))
    # outer wall + tiers (lathe profile r, z)
    b.lathe([(13.0, 0), (17.0, 0), (17.6, 9.0), (16.8, 9.0)], mat='Wall', seg=28, matrix=S, smooth=False)
    for k, mat in enumerate(('Seat0', 'Seat1', 'Seat2', 'Seat0')):
        r0 = 12.0 + k * 1.3
        b.lathe([(r0, 1.2 + k * 1.9), (r0 + 1.3, 1.2 + k * 1.9), (r0 + 1.3, 3.1 + k * 1.9), (r0, 1.3 + k * 1.9)], mat=mat,
                seg=28, matrix=S, smooth=False)
    b.lathe([(17.0, 9.0), (17.9, 9.0), (17.9, 9.7), (17.0, 9.7)], mat='Accent', seg=28, matrix=S, smooth=False)
    b.cyl(12.2, 0.3, loc=(0, 0, 0.15), mat='Pitch', seg=28, matrix=S @ T((0, 0, 0.15)))
    b.box((14.0, 0.2, 0.05), loc=(0, 0, 0.33), mat='Line')
    b.lathe([(2.4, 0.3), (2.6, 0.3), (2.6, 0.34), (2.4, 0.34)], mat='Line', seg=20)
    for s in (-1, 1):
        b.box((0.2, 16.0, 0.05), loc=(s * 14.0, 0, 0.33), mat='Line')
        b.box((0.15, 3.0, 1.6), loc=(s * 14.2, 0, 1.1), mat='Line')
    # floodlight masts
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * 21.0, sy * 14.5
            b.cyl(0.35, 16.0, loc=(x, y, 8.0), r2=0.22, mat='Metal', seg=8)
            b.box((3.4, 0.5, 2.2), loc=(x, y, 16.6), mat='Trim', rot=(0, 0, math.atan2(-y, -x) + math.pi / 2))
            b.box((3.0, 0.6, 1.8), loc=(x - sx * 0.12, y - sy * 0.1, 16.6), mat='Light_head',
                  rot=(0, 0, math.atan2(-y, -x) + math.pi / 2))
    # entrance arch + scoreboard, front (+Y)
    yf = 17.6 * SY
    for s in (-1, 1):
        b.box((1.4, 2.0, 7.0), loc=(s * 4.0, yf, 3.5), mat='Accent', bevel=0.1)
    b.box((9.6, 2.2, 1.6), loc=(0, yf, 7.6), mat='Accent', bevel=0.1)
    b.box((7.0, 0.3, 3.0), loc=(0, yf + 1.0, 10.2), mat='Trim')
    b.box((6.4, 0.3, 2.4), loc=(0, yf + 1.12, 10.2), mat='Screen')
    b.box((1.6, 0.3, 1.2), loc=(-1.6, yf + 1.22, 10.2), mat='Seat2')
    b.box((1.6, 0.3, 1.2), loc=(1.6, yf + 1.22, 10.2), mat='Line')
    b.box((6.0, 0.4, 5.0), loc=(0, yf - 0.6, 2.5), mat='Door')
    b.obj('bld_stadium')


@model
def bld_police():
    """Police station: white and blue, striped band, shield over the door, blue roof lamp, antenna, parking bay."""
    bld_mats('#f3f6fa', '#2f5fa8', '#2f5fa8', trim='#22324a', door='#2f5fa8', glass='#7fb2e6')
    M('Light_blue', '#3f8bff', emit=2.0)
    M('Star', '#ffd23f')
    b = B()
    W, D, H = 16.0, 11.0, 7.0
    walls(b, W, D, H)
    flat_roof(b, W, D, H, mat='Roof', parapet='Accent', ph=0.7)
    checker_strip(b, 'F', W, D, 3.9, 16, h=0.7, a='Accent', c='Wall2')
    checker_strip(b, 'L', W, D, 3.9, 11, h=0.7, a='Accent', c='Wall2')
    checker_strip(b, 'R', W, D, 3.9, 11, h=0.7, a='Accent', c='Wall2')
    door(b, 'F', W, D, 0, w=2.0, h=2.8)
    b.box((4.4, 2.4, 0.3), loc=(0, D / 2 + 1.2, 3.3), mat='Accent', bevel=0.06)
    for s in (-1, 1):
        b.cyl(0.18, 3.2, loc=(s * 1.9, D / 2 + 2.1, 1.6), mat='Wall2', seg=8)
        window(b, 'F', W, D, s * 4.6, 2.0, 2.2, 1.6)
        window(b, 'F', W, D, s * 4.6, 5.5, 2.2, 1.3)
    window(b, 'F', W, D, 0, 5.5, 2.2, 1.3)
    window_rows(b, 'L', W, D, [2.0, 5.5], 3, 1.4, 1.3)
    window_rows(b, 'R', W, D, [2.0, 5.5], 3, 1.4, 1.3)
    window_rows(b, 'B', W, D, [2.0, 5.5], 5, 1.3, 1.3, cross=False)
    # shield emblem with a star
    sm = face_m('F', W, D, 0, H + 1.1, 0.25, ROTX90)
    b.prism([(-1.2, 0.9), (1.2, 0.9), (1.2, -0.2), (0, -1.3), (-1.2, -0.2)], 0.3, mat='Accent', matrix=T((0, D / 2 + 0.4, H + 1.1)) @ ROTX90)
    b.cyl(0.55, 0.42, mat='Star', matrix=sm, seg=5)
    # roof lamp + antenna
    b.cyl(0.7, 0.4, loc=(-4.5, 0, H + 0.6), mat='Trim', seg=12)
    b.sphere(0.65, loc=(-4.5, 0, H + 1.1), mat='Light_blue', seg=12, rings=8)
    b.cyl(0.06, 5.0, loc=(5.0, -2.0, H + 2.7), mat='Metal', seg=6)
    b.sphere(0.16, loc=(5.0, -2.0, H + 5.2), mat='Light_tail', seg=8, rings=6)
    for k in range(3):
        b.box((1.4, 0.06, 0.06), loc=(5.0, -2.0, H + 3.2 + k * 0.6), mat='Metal')
    b.obj('bld_police')


@model
def bld_taxi():
    """Taxi station: yellow canopy with a checker band, kiosk, big checker roof sign, bench."""
    bld_mats('#fff6d8', '#ffc61a', '#ffc61a', trim='#22262e', door='#22262e', wall2='#fffdf2')
    M('Light_head', '#fff2c4', emit=1.2)
    b = B()
    # canopy (drive along X under it)
    b.box((15.0, 7.0, 0.7), loc=(0, 2.5, 4.9), mat='Accent', bevel=0.1)
    checker_strip(b, 'F', 15.0, 7.0, 4.62, 20, h=0.5, a='Trim', c='Wall2', out=0.04)
    for x in (-6.4, 6.4):
        b.box((0.5, 0.5, 4.6), loc=(x, 5.4, 2.3), mat='Trim', bevel=0.05)
    # kiosk behind
    W, D, H = 9.0, 5.0, 4.4
    k = B()
    walls(k, W, D, H)
    flat_roof(k, W, D, H, mat='Roof', parapet='Trim', ph=0.4)
    door(k, 'F', W, D, 2.6, w=1.2, h=2.3)
    on_face(k, 'F', W, D, -1.4, 2.0, (4.4, 0.12, 1.8), 'Trim', out=0.03)
    on_face(k, 'F', W, D, -1.4, 2.0, (4.0, 0.12, 1.5), 'Glass', out=0.06)
    b.merge(k.bm, matrix=T((0, -3.2, 0)))
    # roof sign: checker block with a lamp on top
    for i in range(6):
        for j in range(2):
            b.box((1.0, 0.6, 0.8), loc=(-2.5 + i, 2.5, 5.9 + j * 0.8), mat='Trim' if (i + j) % 2 == 0 else 'Accent')
    b.box((3.0, 0.9, 0.9), loc=(0, 2.5, 7.75), mat='Light_head', bevel=0.2)
    # bench
    b.box((3.0, 0.5, 0.12), loc=(-4.0, -0.2, 0.55), mat='Wood')
    for x in (-5.2, -2.8):
        b.box((0.12, 0.45, 0.55), loc=(x, -0.2, 0.27), mat='Trim')
    b.obj('bld_taxi')


def shop_base(b, W=11.0, D=8.0, H=5.2, aw_a='Accent', aw_c='Wall2'):
    walls(b, W, D, H)
    flat_roof(b, W, D, H, mat='Roof', parapet='Trim', ph=0.6)
    on_face(b, 'F', W, D, -1.4, 1.8, (6.2, 0.12, 2.6), 'Trim', out=0.03)
    on_face(b, 'F', W, D, -1.4, 1.8, (5.8, 0.12, 2.3), 'Glass', out=0.06)
    door(b, 'F', W, D, 3.6, w=1.3, h=2.4)
    awning(b, 'F', W, D, 0, 3.6, W - 0.8, depth=1.4, a=aw_a, c=aw_c, n=10)
    window_rows(b, 'L', W, D, [2.6], 2, 1.3, 1.3)
    window_rows(b, 'R', W, D, [2.6], 2, 1.3, 1.3)
    return W, D, H


@model
def bld_bakery():
    """Bakery: giant bread loaf and a pretzel ring on the roof, bread crates outside."""
    bld_mats('#ffe9c9', '#b5651d', '#e8443a', trim='#7a4a2a', door='#7a4a2a')
    M('Bread', '#d99a4e')
    M('Crust', '#a8642a')
    b = B()
    W, D, H = shop_base(b)
    b.sphere(1.5, loc=(-2.2, 0.5, H + 1.6), scale=(1.9, 1.0, 0.85), mat='Bread', seg=14, rings=8)
    for k in (-1, 0, 1):
        b.box((0.16, 1.9, 0.5), loc=(-2.2 + k * 1.2, 0.5, H + 2.55), mat='Crust', rot=(0, 0.25, 0.3))
    m = T((3.0, 1.0, H + 1.9)) @ ROTX90
    b.lathe([(1.0, -0.28), (1.45, -0.28), (1.55, 0), (1.45, 0.28), (1.0, 0.28)], mat='Crust', seg=16, matrix=m)
    b.box((0.25, 0.4, 2.0), loc=(3.0, 1.0, H + 1.9), mat='Crust', rot=(0, 0.6, 0))
    b.box((1.2, 0.8, 0.6), loc=(-4.6, D / 2 + 0.9, 0.3), mat='Wood')
    for dx in (-0.3, 0.3):
        b.sphere(0.3, loc=(-4.6 + dx, D / 2 + 0.9, 0.7), scale=(1, 1.6, 0.7), mat='Bread', seg=8, rings=5)
    b.obj('bld_bakery')


@model
def bld_bookshop():
    """Bookshop: giant open book on the roof, stacked books by the door."""
    bld_mats('#e6f0e4', '#3f7f5f', '#b85c38', trim='#2f4a3c', door='#b85c38')
    M('Page', '#fffaf0')
    M('Cover', '#b8323a')
    M('Book1', '#4a90e2')
    M('Book2', '#ffd23f')
    b = B()
    W, D, H = shop_base(b, aw_a='Roof')
    for s in (-1, 1):
        m = T((s * 1.75, 0.8, H + 1.9)) @ Matrix.Rotation(-0.5, 4, 'X') @ Matrix.Rotation(s * 0.28, 4, 'Y')
        b.box((3.5, 0.2, 4.2), mat='Cover', matrix=m @ T((0, -0.12, 0)))
        b.box((3.2, 0.3, 3.9), mat='Page', matrix=m @ T((0, 0.1, 0)))
        for k in range(5):
            b.box((2.2, 0.05, 0.1), mat='Trim', matrix=m @ T((0, 0.27, 1.2 - k * 0.6)))
    for k, (mat, w) in enumerate((('Book1', 1.3), ('Cover', 1.1), ('Book2', 1.2))):
        b.box((w, 0.9, 0.3), loc=(-4.4, D / 2 + 0.8, 0.15 + k * 0.3), mat=mat, rot=(0, 0, 0.15 * k))
    b.obj('bld_bookshop')


@model
def bld_pizza():
    """Pizzeria: giant pizza slice sign, round tables outside."""
    bld_mats('#fff3e0', '#2f8f4e', '#e8443a', trim='#5a3a2a', door='#2f8f4e')
    M('Cheese', '#ffd166')
    M('Crust', '#c98a3e')
    M('Pep', '#d13b2e')
    b = B()
    W, D, H = shop_base(b, aw_a='Roof', aw_c='Accent')
    m = T((0, 1.0, H + 0.9)) @ Matrix.Rotation(-0.35, 4, 'X') @ ROTX90
    b.prism([(-2.6, 3.6), (2.6, 3.6), (0, -0.4)], 0.35, mat='Cheese', matrix=m)
    b.box((5.6, 0.5, 0.7), mat='Crust', matrix=T((0, 1.0, H + 0.9)) @ Matrix.Rotation(-0.35, 4, 'X') @ T((0, -0.1, 3.7)), bevel=0.2)
    for (x, z) in ((-1.0, 2.8), (0.9, 2.5), (0.0, 1.5), (-0.2, 3.1)):
        b.cyl(0.42, 0.12, mat='Pep', matrix=T((0, 1.0, H + 0.9)) @ Matrix.Rotation(-0.35, 4, 'X') @ T((x, 0.2, z)) @ ROTX90, seg=10)
    for x in (-3.4, 0.2):
        b.cyl(0.7, 0.08, loc=(x, D / 2 + 1.8, 0.8), mat='Accent', seg=12)
        b.cyl(0.08, 0.8, loc=(x, D / 2 + 1.8, 0.4), mat='Metal', seg=6)
    b.obj('bld_pizza')


@model
def bld_tires():
    """Tyre and repair garage: one open bay with a car lift, a giant tyre on the roof, tyre stacks."""
    bld_mats('#dfe6ee', '#3b4252', '#ff9a3c', trim='#3b4252', door='#8a93a0')
    M('Rubber', '#2e2b33')
    M('Rim', '#d4d9e2', metal=0.6)
    M('Stripe', '#f2c94c')
    M('Dark', '#1c2028')
    b = B()
    W, D, H = 14.0, 10.0, 5.6
    walls(b, W, D, H)
    flat_roof(b, W, D, H, mat='Roof', parapet='Accent', ph=0.6)
    on_face(b, 'F', W, D, -3.0, 2.2, (5.6, 0.12, 4.6), 'Stripe', out=0.03)
    on_face(b, 'F', W, D, -3.0, 2.1, (5.0, 0.14, 4.2), 'Dark', out=0.06)
    for s in (-1, 1):   # lift posts seen in the bay
        on_face(b, 'F', W, D, -3.0 + s * 1.9, 1.6, (0.3, 0.2, 3.2), 'Accent', out=0.12)
    on_face(b, 'F', W, D, -3.0, 1.5, (4.0, 0.3, 0.25), 'Accent', out=0.16)
    door(b, 'F', W, D, 4.4, w=1.3, h=2.4)
    window(b, 'F', W, D, 2.2, 2.2, 1.6, 1.4)
    m = T((2.5, 0.5, H + 2.3)) @ ROTX90
    b.lathe([(1.2, -0.5), (2.0, -0.5), (2.2, 0), (2.0, 0.5), (1.2, 0.5)], mat='Rubber', seg=20, matrix=m)
    b.cyl(1.25, 0.7, mat='Rim', matrix=m, seg=16)
    b.cyl(0.4, 0.8, mat='Accent', matrix=m, seg=10)
    for (x, n) in ((W / 2 + 0.9, 4), (W / 2 + 1.9, 2)):
        for k in range(n):
            b.lathe([(0.25, -0.15), (0.45, -0.15), (0.48, 0), (0.45, 0.15), (0.25, 0.15)], loc=(x, D / 2 - 1.0, 0.16 + k * 0.31),
                    mat='Rubber', seg=12)
    window_rows(b, 'L', W, D, [3.0], 3, 1.3, 1.2)
    window_rows(b, 'R', W, D, [3.0], 3, 1.3, 1.2)
    b.obj('bld_tires')


@model
def moto():
    """Motorcycle with a helmeted rider (traffic). Front = +Y. 'Paint' = tank, fairing and helmet."""
    M('Paint', '#ffffff', rough=0.4)
    M('Rubber', '#2e2b33')
    M('Rim', '#c8ced8', metal=0.6)
    M('Metal', '#8a93a0', metal=0.5, rough=0.4)
    M('Seat', '#2b2d36')
    M('Jacket', '#3b4252')
    M('Glass', '#1a2330', rough=0.15)
    M('Light_head', '#fff6d0', emit=1.2)
    M('Light_tail', '#ff5a4e', emit=1.0)
    b = B()
    wr = 0.33
    for y in (0.72, -0.68):
        m = T((0, y, wr)) @ ROTY90
        b.lathe([(wr * 0.6, -0.07), (wr * 0.95, -0.08), (wr, 0), (wr * 0.95, 0.08), (wr * 0.6, 0.07)], mat='Rubber', seg=14, matrix=m)
        b.cyl(wr * 0.62, 0.08, mat='Rim', matrix=m, seg=10)
    b.tube([(0, 0.72, wr), (0, 0.5, 0.95)], 0.045, 'Metal', seg=6)                    # fork
    b.box((0.2, 0.9, 0.3), loc=(0, 0.0, 0.5), mat='Metal', bevel=0.05)               # engine
    b.sphere(0.24, loc=(0, 0.2, 0.84), scale=(0.85, 1.5, 0.8), mat='Paint', seg=10, rings=6)   # tank
    b.box((0.26, 0.7, 0.12), loc=(0, -0.38, 0.82), mat='Seat', bevel=0.04)
    b.box((0.2, 0.36, 0.16), loc=(0, -0.72, 0.8), mat='Paint', bevel=0.04, rot=(0.25, 0, 0))
    b.box((0.16, 0.05, 0.08), loc=(0, -0.92, 0.84), mat='Light_tail')
    b.box((0.3, 0.2, 0.36), loc=(0, 0.6, 0.98), mat='Paint', bevel=0.08)             # fairing
    b.sphere(0.1, loc=(0, 0.72, 0.98), scale=(1, 0.5, 1), mat='Light_head', seg=8, rings=5)
    b.box((0.26, 0.04, 0.22), loc=(0, 0.58, 1.24), mat='Glass', rot=(-0.45, 0, 0))
    b.box((0.66, 0.05, 0.05), loc=(0, 0.48, 1.12), mat='Metal')                      # bars
    b.tube([(0.1, -0.2, 0.42), (0.14, -0.9, 0.5)], 0.045, 'Metal', seg=6)             # exhaust
    # rider
    b.box((0.36, 0.26, 0.56), loc=(0, -0.2, 1.22), mat='Jacket', bevel=0.09, rot=(0.38, 0, 0))
    b.sphere(0.19, loc=(0, 0.0, 1.66), scale=(1, 1.08, 1), mat='Paint', seg=12, rings=8)
    b.box((0.3, 0.06, 0.12), loc=(0, 0.19, 1.66), mat='Glass')
    for s in (-1, 1):
        b.tube([(s * 0.2, -0.08, 1.42), (s * 0.3, 0.22, 1.24), (s * 0.3, 0.46, 1.13)], 0.06, 'Jacket', seg=6)
        b.tube([(s * 0.13, -0.32, 0.98), (s * 0.2, 0.0, 0.8), (s * 0.19, -0.05, 0.42)], 0.075, 'Seat', seg=6)
    b.obj('moto')


@model
def taxi_sign():
    """Roof sign for taxis (origin = bottom centre)."""
    M('Sign', '#ffe14a', emit=0.9)
    M('Trim', '#22262e')
    b = B()
    b.box((0.7, 0.26, 0.24), loc=(0, 0, 0.15), mat='Sign', bevel=0.06)
    b.box((0.78, 0.3, 0.05), loc=(0, 0, 0.03), mat='Trim')
    for i in range(4):
        b.box((0.09, 0.27, 0.08), loc=(-0.24 + i * 0.16, 0, 0.13), mat='Trim')
    b.obj('taxi_sign')


@model
def police_bar():
    """Roof light bar for patrol cars (origin = bottom centre)."""
    M('Light_blue', '#3f8bff', emit=2.2)
    M('Light_red', '#ff4a4a', emit=2.2)
    M('Trim', '#22262e')
    b = B()
    b.box((1.1, 0.3, 0.06), loc=(0, 0, 0.03), mat='Trim')
    b.box((0.46, 0.26, 0.16), loc=(-0.3, 0, 0.14), mat='Light_blue', bevel=0.05)
    b.box((0.46, 0.26, 0.16), loc=(0.3, 0, 0.14), mat='Light_red', bevel=0.05)
    b.box((0.12, 0.26, 0.14), loc=(0, 0, 0.13), mat='Trim')
    b.obj('police_bar')
