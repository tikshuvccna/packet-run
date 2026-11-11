"""Packet Run city kit -> public/assets/models/<name>.glb

blender -b --python art/blender/city.py -- <name ...|all> [noprev]
Buildings: origin = ground centre of the footprint, front (door/sign) = Blender +Y = glTF -Z (face the road).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector

from prlib import *
from kit import *

REG = {}


def model(fn):
    REG[fn.__name__] = fn
    return fn


# ===================================================================== district 1: cable docks
D1 = dict(wall='#c9a66b', roof='#5b6b7a', accent='#e55a4e')


@model
def bld_d1_a():
    """Dock warehouse: barrel roof, two roll-up doors, loading dock, cable-reel emblem."""
    bld_mats(D1['wall'], D1['roof'], D1['accent'], trim='#8a7354', door='#d8d2c4')
    M('Stripe', '#f2c94c')
    b = B()
    W, D, H = 16.0, 12.0, 6.0
    walls(b, W, D, H, bevel=0.1)
    # corrugated barrel roof: arc of slats along X
    n = 12
    R, Hr = D / 2 + 0.3, 2.2
    for i in range(n):
        a = math.pi * (i + 0.5) / n
        y, z = -math.cos(a) * R, H + math.sin(a) * Hr
        tx, tz = math.sin(a) * R, math.cos(a) * Hr
        seglen = math.hypot(tx, tz) * math.pi / n * 1.08
        m = Matrix.Translation((0, y, z)) @ Matrix.Rotation(math.atan2(tz, tx), 4, 'X')
        b.box((W + 0.6, seglen, 0.18), mat='Roof' if i % 2 else 'Metal', matrix=m)
    for s in (-1, 1):   # arched gable walls
        arc = [(-(D / 2) * math.cos(math.pi * k / 16), 2.2 * math.sin(math.pi * k / 16)) for k in range(17)]
        m = Matrix.Translation((s * (W / 2 - 0.08), 0, H)) @ Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        b.prism(arc, 0.16, mat='Wall', matrix=m)
        on_face(b, 'L' if s < 0 else 'R', W, D, 0, H + 1.0, (1.8, 0.1, 1.0), 'Glass', out=0.1)
    # roll-up doors with yellow/black safety frame
    for x in (-3.8, 3.8):
        on_face(b, 'F', W, D, x, 2.1, (4.6, 0.12, 4.4), 'Stripe', out=0.04)
        on_face(b, 'F', W, D, x, 2.0, (4.0, 0.12, 4.0), 'Door', out=0.08)
        for k in range(8):
            on_face(b, 'F', W, D, x, 0.3 + k * 0.5, (4.0, 0.06, 0.06), 'Metal', out=0.15)
    # loading dock + bumpers
    b.box((W - 1.0, 1.6, 0.9), loc=(0, D / 2 + 0.8, 0.45), mat='Stone', bevel=0.06)
    for x in (-5.6, -2.0, 2.0, 5.6):
        b.box((0.4, 0.3, 0.5), loc=(x, D / 2 + 1.65, 0.55), mat='Frame', bevel=0.08)
    # high windows + accent band
    on_face(b, 'F', W, D, 0, 5.0, (W + 0.02, 0.1, 0.35), 'Accent', out=0.02)
    window_rows(b, 'B', W, D, [4.2], 5, 1.6, 1.0, cross=False, sill=None)
    window_rows(b, 'L', W, D, [3.4], 3, 1.4, 1.0, cross=False)
    window_rows(b, 'R', W, D, [3.4], 3, 1.4, 1.0, cross=False)
    # emblem: cable reel disc above the doors
    m = face_m('F', W, D, 0, 6.6, 0.2, Matrix.Rotation(math.radians(90), 4, 'X'))
    b.cyl(1.1, 0.3, mat='Accent', matrix=m, seg=20)
    b.cyl(0.75, 0.36, mat='Wood', matrix=m, seg=20)
    b.cyl(0.25, 0.42, mat='Metal', matrix=m, seg=12)
    # side lamps + pipes
    for x in (-7.2, 0.0, 7.2):
        on_face(b, 'F', W, D, x, 4.6, (0.5, 0.5, 0.25), 'Metal', out=0.3, bevel=0.05)
    b.tube([(W / 2 + 0.25, -3, 0.3), (W / 2 + 0.25, -3, 5.6), (W / 2 + 0.25, -2, 6.4)], 0.12, 'Metal')
    b.obj('bld_d1_a')


# ===================================================================== district 7: app boulevard
D7 = dict(wall='#f3e4c4', roof='#a94a62', accent='#4ad6c8')


@model
def bld_d7_a():
    """App store front: big shop window, striped awning, screen sign with app-icon grid."""
    bld_mats(D7['wall'], D7['roof'], D7['accent'], wall2='#fdfaf2', trim='#d8c7a6', door='#3e7f8f')
    for i, c in enumerate(['#ff6b6b', '#ffd166', '#06d6a0', '#4d96ff', '#b388ff', '#ff9f43']):
        M('Icon%d' % i, c, emit=0.6)
    M('Screen', '#20334a', rough=0.2)
    b = B()
    W, D, H = 12.0, 10.0, 9.0
    walls(b, W, D, H)
    cornice(b, W, D, 3.6, mat='Roof', h=0.35, o=0.12)
    cornice(b, W, D, H, mat='Trim', h=0.4, o=0.25)
    flat_roof(b, W, D, H + 0.2, mat='Roof', parapet='Wall', ph=0.6)
    # ground floor: shop window + door
    on_face(b, 'F', W, D, -1.4, 1.75, (7.2, 0.12, 2.7), 'Frame', out=0.03)
    on_face(b, 'F', W, D, -1.4, 1.8, (6.8, 0.12, 2.4), 'Glass', out=0.06)
    for x in (-3.2, 0.4):
        on_face(b, 'F', W, D, x, 1.8, (0.1, 0.12, 2.4), 'Frame', out=0.09)
    door(b, 'F', W, D, 4.0, w=1.5, h=2.6)
    awning(b, 'F', W, D, -1.4, 3.3, 7.6, depth=1.4, a='Accent', c='Wall2', n=8)
    # upper floors windows
    window_rows(b, 'F', W, D, [5.2, 7.6], 3, 1.6, 1.5, span=9.6)
    window_rows(b, 'L', W, D, [5.2, 7.6], 3, 1.4, 1.5, cross=False)
    window_rows(b, 'R', W, D, [1.8, 5.2, 7.6], 3, 1.4, 1.5, cross=False)
    window_rows(b, 'B', W, D, [5.2, 7.6], 2, 1.4, 1.5, cross=False, sill=None)
    # rooftop screen sign with app icon grid (3x2)
    b.box((0.3, 0.3, 2.0), loc=(-2.5, D / 2 - 1.0, H + 1.0), mat='Metal')
    b.box((0.3, 0.3, 2.0), loc=(2.5, D / 2 - 1.0, H + 1.0), mat='Metal')
    b.box((7.0, 0.4, 3.0), loc=(0, D / 2 - 0.8, H + 2.6), mat='Accent', bevel=0.15, seg=2)
    b.box((6.4, 0.3, 2.5), loc=(0, D / 2 - 0.7, H + 2.6), mat='Screen', bevel=0.06)
    for r in range(2):
        for c in range(3):
            b.box((1.3, 0.2, 0.9), loc=(-2.0 + c * 2.0, D / 2 - 0.5, H + 3.15 - r * 1.1), mat='Icon%d' % (r * 3 + c),
                  bevel=0.18, seg=2)
    ac_unit(b, -3.5, -2.0, H + 0.2)
    ac_unit(b, 3.0, -2.5, H + 0.2)
    plant_pot(b, -5.5, D / 2 + 0.6)
    plant_pot(b, 5.4, D / 2 + 0.6)
    b.obj('bld_d7_a')


# ===================================================================== props
def prop_mats():
    M('Leaf', '#5fae4e', rough=0.9)
    M('Leaf2', '#7cc95e', rough=0.9)
    M('Bark', '#8a5a3c', rough=0.9)
    M('Metal', '#5d6875', rough=0.4, metal=0.5)
    M('Light_head', '#fff2c4', emit=1.4)
    M('Trim', '#e9dcc4')
    M('Wood', '#b07a45')
    M('Stone', '#9d968e')


@model
def tree_a():
    """Round broadleaf tree, 5.5 m."""
    prop_mats()
    b = B()
    b.cyl(0.22, 2.4, loc=(0, 0, 1.2), r2=0.16, mat='Bark', seg=8)
    b.tube([(0, 0, 1.6), (0.5, 0.1, 2.4), (0.8, 0.2, 2.9)], 0.09, 'Bark', seg=6)
    for (x, y, z, r, m) in ((0, 0, 3.6, 1.6, 'Leaf'), (0.9, 0.3, 3.0, 1.1, 'Leaf2'), (-0.8, -0.4, 3.2, 1.15, 'Leaf'),
                            (0.1, -0.7, 4.4, 1.05, 'Leaf2'), (-0.3, 0.8, 4.2, 1.0, 'Leaf')):
        b.sphere(r, loc=(x, y, z), mat=m, seg=11, rings=7)
    b.obj('tree_a')


@model
def lamp_post():
    """Street lamp, 5 m, arm over the road toward +Y (glTF -Z)."""
    prop_mats()
    b = B()
    b.cyl(0.25, 0.4, loc=(0, 0, 0.2), r2=0.18, mat='Metal', seg=10)
    b.cyl(0.09, 4.8, loc=(0, 0, 2.6), r2=0.07, mat='Metal', seg=8)
    b.tube([(0, 0, 4.9), (0, 0.4, 5.2), (0, 1.2, 5.25)], 0.06, 'Metal', seg=6)
    b.cyl(0.32, 0.25, loc=(0, 1.3, 5.15), r2=0.12, mat='Metal', seg=12)
    b.sphere(0.2, loc=(0, 1.3, 5.0), scale=(1, 1, 0.6), mat='Light_head', seg=10, rings=6)
    b.obj('lamp_post')


import bld_more
import props
import bld_special
REG.update(bld_more.REG)
REG.update(props.REG)
REG.update(bld_special.REG)


def preview_model(name):
    toonify(0.03 if name.startswith('bld') or name.startswith('landmark') else 0.012)
    preview_scene(ground_size=0)
    frame_cam(res=(640, 520), yaw=32, elev=20, margin=1.0, lens=50)
    render(os.path.join(PREV, name + '.png'))


def main():
    a = args()
    noprev = 'noprev' in a
    names = [x for x in a if x != 'noprev']
    if not names or names == ['all']:
        names = list(REG)
    for nm in names:
        reset()
        REG[nm]()
        export(nm)
        record(nm)
        if not noprev:
            preview_model(nm)


main()
