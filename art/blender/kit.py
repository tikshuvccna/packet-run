"""Building/prop kit helpers for Packet Run (Blender coords: front = +Y = glTF -Z, origin = ground centre)."""
import math

from mathutils import Matrix, Vector

from prlib import *

ANG = {'F': 0.0, 'R': -math.pi / 2, 'B': math.pi, 'L': math.pi / 2}


def face_m(side, W, D, x, z, out=0.0, extra=None):
    half = D / 2 if side in 'FB' else W / 2
    m = Matrix.Rotation(ANG[side], 4, 'Z') @ Matrix.Translation((x, half + out, z))
    return m @ extra if extra is not None else m


def on_face(b, side, W, D, x, z, size, mat, out=0.0, bevel=0.0, seg=1, taper=None):
    """Box on a wall: size = (along face, outward depth, height), centred `out` metres in front of the wall."""
    b.box(size, mat=mat, matrix=face_m(side, W, D, x, z, out), bevel=bevel, seg=seg, taper=taper)


def window(b, side, W, D, x, z, ww, wh, glass='Glass', frame='Frame', sill='Trim', cross=True, shutters=None):
    on_face(b, side, W, D, x, z, (ww + 0.24, 0.1, wh + 0.24), frame, out=0.03)
    on_face(b, side, W, D, x, z, (ww, 0.1, wh), glass, out=0.05)
    if cross:
        on_face(b, side, W, D, x, z, (0.07, 0.1, wh), frame, out=0.07)
        on_face(b, side, W, D, x, z + wh * 0.12, (ww, 0.1, 0.07), frame, out=0.07)
    if sill:
        on_face(b, side, W, D, x, z - wh / 2 - 0.16, (ww + 0.4, 0.22, 0.1), sill, out=0.1)
    if shutters:
        for s in (-1, 1):
            on_face(b, side, W, D, x + s * (ww / 2 + 0.3), z, (0.36, 0.06, wh + 0.1), shutters, out=0.06)


def window_rows(b, side, W, D, zs, n, ww, wh, span=None, **kw):
    span = span if span is not None else ((W if side in 'FB' else D) - 2.0)
    for z in zs:
        for i in range(n):
            x = -span / 2 + span * (i + 0.5) / n
            window(b, side, W, D, x, z, ww, wh, **kw)


def door(b, side, W, D, x, w=1.3, h=2.3, mat='Door', frame='Frame', step='Trim', knob='Metal'):
    on_face(b, side, W, D, x, h / 2, (w + 0.3, 0.1, h + 0.15), frame, out=0.03)
    on_face(b, side, W, D, x, h / 2, (w, 0.1, h), mat, out=0.06)
    on_face(b, side, W, D, x + w * 0.32, h * 0.47, (0.08, 0.1, 0.08), knob, out=0.12)
    if step:
        on_face(b, side, W, D, x, 0.08, (w + 0.8, 0.6, 0.16), step, out=0.3)


def awning(b, side, W, D, x, z, w, depth=1.2, a='Accent', c='Wall2', n=6):
    """Striped sloped awning."""
    for i in range(n):
        xx = x - w / 2 + w * (i + 0.5) / n
        mat = a if i % 2 == 0 else c
        m = face_m(side, W, D, xx, z, depth / 2, Matrix.Rotation(-0.35, 4, 'X'))
        b.box((w / n + 0.002, depth, 0.08), mat=mat, matrix=m)
        b.box((w / n + 0.002, 0.05, 0.28), mat=mat, matrix=face_m(side, W, D, xx, z - 0.33, depth - 0.03))


def walls(b, W, D, H, mat='Wall', z0=0.0, bevel=0.12, plinth='Trim'):
    b.box((W, D, H), loc=(0, 0, z0 + H / 2), mat=mat, bevel=bevel)
    if plinth:
        b.box((W + 0.16, D + 0.16, 0.45), loc=(0, 0, z0 + 0.22), mat=plinth, bevel=0.05)


def cornice(b, W, D, z, mat='Trim', h=0.3, o=0.2):
    b.box((W + 2 * o, D + 2 * o, h), loc=(0, 0, z), mat=mat, bevel=0.06)


def flat_roof(b, W, D, z, mat='Roof', parapet='Trim', ph=0.5, t=0.2):
    b.box((W - 0.2, D - 0.2, t), loc=(0, 0, z + t / 2), mat=mat)
    if parapet:
        for s in (-1, 1):
            b.box((W + 0.3, 0.3, ph), loc=(0, s * (D / 2), z + ph / 2), mat=parapet, bevel=0.05)
            b.box((0.3, D + 0.3, ph), loc=(s * (W / 2), 0, z + ph / 2), mat=parapet, bevel=0.05)


def gable_roof(b, W, D, z, rise, mat='Roof', wall='Wall', o=0.45, t=0.25, ridge='Trim', along='x'):
    """Ridge along X (gables on the left/right walls) or along Y."""
    L, S = (W, D) if along == 'x' else (D, W)
    hs = S / 2 + o
    ang = math.atan2(rise, S / 2)
    sl = math.hypot(hs, rise * hs / (S / 2))
    rz = 0.0 if along == 'x' else math.pi / 2
    R = Matrix.Rotation(rz, 4, 'Z')
    for s in (-1, 1):
        m = R @ Matrix.Translation((0, s * hs / 2, z + rise / 2 - (o * rise / (S / 2)) / 2 + t / 2)) @ \
            Matrix.Rotation(s * -ang, 4, 'X')
        b.box((L + 2 * o, sl, t), mat=mat, matrix=m, bevel=0.04)
    tri = [(-S / 2, 0), (S / 2, 0), (0, rise)]
    for s in (-1, 1):
        m = R @ Matrix.Translation((s * (L / 2 - 0.05), 0, z)) @ Matrix((
            (0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        b.prism(tri, 0.1, mat=wall, matrix=m)
    if ridge:
        b.box((L + 2 * o + 0.1, 0.3, 0.3), mat=ridge, matrix=R @ Matrix.Translation((0, 0, z + rise + t * 0.8)),
              bevel=0.06)


def chimney(b, x, y, z, h=1.6, mat='Stone', cap='Trim'):
    b.box((0.7, 0.7, h), loc=(x, y, z + h / 2), mat=mat, bevel=0.04)
    b.box((0.9, 0.9, 0.2), loc=(x, y, z + h), mat=cap, bevel=0.04)


def ac_unit(b, x, y, z, mat='Metal', fan='Frame'):
    b.box((1.0, 0.8, 0.7), loc=(x, y, z + 0.35), mat=mat, bevel=0.06)
    b.cyl(0.28, 0.05, loc=(x, y, z + 0.72), mat=fan, seg=12)


def plant_pot(b, x, y, z=0.0, pot='Accent', leaf='Leaf'):
    b.cyl(0.32, 0.5, loc=(x, y, z + 0.25), r2=0.4, mat=pot, seg=10)
    b.sphere(0.5, loc=(x, y, z + 0.85), scale=(1, 1, 0.9), mat=leaf, seg=10, rings=6)


def bld_mats(wall, roof, accent, wall2='#fbf3e2', glass='#4f74a8', frame='#fbf6ec', trim=None, door='#7a4a3a'):
    M('Wall', wall, rough=0.85)
    M('Roof', roof, rough=0.8)
    M('Accent', accent, rough=0.6)
    M('Wall2', wall2, rough=0.85)
    M('Glass', glass, rough=0.1)
    M('Frame', frame, rough=0.6)
    M('Trim', trim or '#e9dcc4', rough=0.7)
    M('Door', door, rough=0.7)
    M('Metal', '#a9b3bf', rough=0.4, metal=0.5)
    M('Emissive', '#7ff0e4', emit=1.6)
    M('Light_tail', '#ff5a4e', emit=1.0)
    M('Leaf', '#5fae4e', rough=0.9)
    M('Stone', '#9d968e', rough=0.9)
    M('Wood', '#a8743f', rough=0.8)
