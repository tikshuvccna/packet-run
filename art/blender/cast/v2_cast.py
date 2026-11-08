"""Character definitions (v2). Each builder returns a Human with pivots in h.P and flags.

Skin tones are warm and varied; every outfit obeys the modesty rules in v2_parts.
"""
import math

from mathutils import Vector

from v2lib import *
from v2lib import _MAT, _col4
from v2_parts import Human, darker, lighter

SKIN = dict(a="#f2c6a2", b="#c68a62", c="#e7b894", d="#a8714e", e="#dca27a", f="#8c5a3c", g="#f0bf98")


# ====================================================================== heroes
def apprentice_girl(variant='hat'):
    sp = dict(skin=SKIN['a'], R=0.25, iris="#5a7a3a", brow_col="#5a3020", lip="#c0565a", blush_amt=0.5,
              head=dict(jaw=0.3, cheek=0.05, nose=0.07, chin=0.05), eye_h=0.16, flick=1.2)
    h = Human(sp)
    hair = "#6a3a24"
    h.feet_only(shoe="#5a3420")
    h.skirt("#a94a62", pat='weave', P=dict(nu=60, fv=80), hem="#e8b04a", hem2="#c98a2a", flare=1.0, folds=11)
    h.apron("#f3e4c4", pat='weave', P=dict(nu=40, fv=90), length=0.42, width=0.8, pocket="#e8d6b0")
    h.torso("#a94a62", pat='weave', P=dict(nu=40, fv=80), collar="#f3e4c4", belt="#e8b04a")
    h.arms("#f3e4c4", cuff="#e8b04a", P=dict(nu=18, fv=90))
    h.satchel(side=1)
    h.head()
    if variant == 'hat':
        h.hair_cap(hair, hairline=0.5, back_len=-0.6, sides=-0.3, fringe=(4, 0.2))
        # two braids over the shoulders
        for s in (-1, 1):
            pts = [(s * 0.78, 0.3, -0.4), (s * 0.9, 0.12, -0.8), (s * 0.92, -0.05, -1.2), (s * 0.88, -0.12, -1.5)]
            h.braid(pts, 0.2, hair, tie="#2f7d6f")
        h.wide_hat("#e1b865", "#2f7d6f", band2="#e8b04a", crown_h=0.52, brim=1.9, tilt=-0.16, flower=None, bow=True,
                   droop=0.06, z=0.52)
    else:
        h.headscarf("#3e7d8a", color2="#f2d27a", pat='flowers', P=dict(nu=22, fv=30, rad=0.3), z_front=0.5)

    h.needle(h.P['handR'])
    h.flags = dict(kind='dress', stride=1.0, hold='R')
    return h


def apprentice_boy(variant='cap'):
    sp = dict(skin=SKIN['b'], R=0.25, iris="#4a2e1e", brow_col="#2a1a14", lip="#9a4a44", blush_amt=0.35,
              head=dict(jaw=0.3, cheek=0.04, nose=0.09, chin=0.07), eye_h=0.14, lash_w=0.045, flick=0.3)
    h = Human(sp)
    hair = "#2e2020"
    h.legs("#5b4a6a", shoe="#5e3a22", cuff="#3f3350", pat='weave', P=dict(nu=24, fv=70), boots=True)
    h.coat_skirt("#2f7d6f", length=0.2, flare=0.6, P=dict(nu=40, fv=70))
    h.torso("#2f7d6f", pat='weave', P=dict(nu=40, fv=70), collar="#f3e4c4", belt="#8a5a36", buttons=("#e8b04a", 3))
    h.arms("#2f7d6f", cuff="#e8b04a", P=dict(nu=18, fv=70))
    h.satchel(side=1)
    h.head(ears=1.0)
    h.hair_cap(hair, hairline=0.56, back_len=-0.5, sides=-0.1, fringe=(7, 0.22), part=0.1)
    if variant == 'cap':
        h.flat_cap("#d68f3a", color2="#a8702c", tilt=-0.1, z=0.46)
    else:
        h.wide_hat("#6a4a3a", "#2a1e1a", crown_h=0.6, brim=1.7, tilt=-0.1, pat='leather', P=dict(scale=30),
                   bow=False, droop=0.05, wav=0.015, z=0.5)
    h.needle(h.P['handR'])
    h.flags = dict(kind='legs', stride=1.0, hold='R')
    return h


def dvora():
    sp = dict(skin=SKIN['c'], R=0.24, iris="#4a6a7a", brow_col="#b8aeb0", lip="#a05a5a", blush_amt=0.35,
              head=dict(jaw=0.32, cheek=0.08, nose=0.11, chin=0.04), eye_h=0.12, eye_w=0.12, wrinkles=True,
              lash_w=0.04, flick=0.2, brow_w=0.05)
    h = Human(dict(sp, H=0.97, W=1.05, torso_k=0.95))
    grey = "#d8d2d6"
    h.feet_only(shoe="#4a2e20")
    h.skirt("#6a3f73", pat='weave', P=dict(nu=60, fv=70), hem="#c98a4a", hem2="#f0d9a0", flare=0.95, folds=9)
    h.torso("#6a3f73", P=dict(nu=40, fv=70), collar="#f3e4c4")
    # shawl with stripes + knotted fringe
    up = h.P['upper']
    th = h.torso_h
    sm = mat("#d68f3a", pat='knit', color2="#8a3f55", P=dict(nu=40, fv=55, stripe=18), var=0.2, bump=0.5)
    loft("shawl", [(th * 1.02, 0.1, 0.09), (th * 0.92, 0.22, 0.18), (th * 0.6, 0.255, 0.21), (th * 0.28, 0.25, 0.215, 0, 0.02),
                   (th * 0.2, 0.24, 0.21, 0, 0.03)], sm, up, seg=56, folds=lambda a, t: 1 + 0.04 * t * math.sin(6 * a))
    fm = mat("#f0d9a0", pat='strands_z', kind='cloth', var=0.2, P=dict(nu=6, fv=10))
    for i in range(30):
        a = TAU * i / 30
        x, y = 0.245 * math.cos(a), 0.212 * math.sin(a) + 0.03
        tube("fr", [Vector((x, y, th * 0.22)), Vector((x * 1.02, y * 1.02, th * 0.1))], [0.01, 0.006],
             fm, up, seg=5, sub=1, line=False)
    ellipsoid("brooch", 0.028, mat("#e8b04a", metal=True), up, loc=(0, -0.215, th * 0.82), scale=(1, 0.5, 1))
    h.arms("#6a3f73", cuff="#f3e4c4", P=dict(nu=18, fv=70))
    # yarn ball in the left hand
    ym = mat("#35b39a", pat='spiral', color2="#2a8a78", P=dict(nu=8, fv=40), var=0.25, bump=0.6)
    ellipsoid("yarn", 0.08, ym, h.P['handL'], loc=(0.0, -0.06, -0.03), seg=20, rings=14)
    h.head()
    h.hair_cap(grey, hairline=0.6, back_len=-0.45, sides=-0.05, fringe=(3, 0.1), P=dict(nu=70, wave=0.6))
    R = h.R
    ellipsoid("bun", R * 0.38, mat(grey, pat='hair', kind='hair', P=dict(nu=40), var=0.3), h.P['head'],
              loc=(0, R * 0.92, -R * 0.15), seg=20, rings=14)
    # round glasses
    gm = mat("#c9a040", metal=True, kind='cloth')
    for s in (-1, 1):
        ring = [Vector((s * 0.36 * R + 0.17 * R * math.cos(TAU * i / 20), -R * 1.02,
                        -0.02 * R + 0.16 * R * math.sin(TAU * i / 20))) for i in range(21)]
        tube("lens", ring, [0.012 * R / 0.24 * 0.24], gm, h.P['head'], seg=5, sub=1, line=False)
    tube("bridge", [Vector((-0.19 * R, -R * 1.03, 0.0)), Vector((0, -R * 1.06, 0.03 * R)), Vector((0.19 * R, -R * 1.03, 0.0))],
         [0.01], gm, h.P['head'], seg=5, sub=3, line=False)
    h.wide_hat("#e1b865", "#7a4a8a", crown_h=0.55, brim=2.0, tilt=-0.2, flower=["#c44b3f", "#f6f0e6", "#e8b04a"],
               bow=False, droop=0.1, z=0.55)
    h.flags = dict(kind='dress', stride=0.62, elder=True, hold='L')
    h.sp['eye_x'] = 0.36
    return h


CAST = dict(apprentice_girl=lambda: apprentice_girl('hat'), apprentice_girl_scarf=lambda: apprentice_girl('scarf'),
            apprentice_boy=lambda: apprentice_boy('cap'), apprentice_boy_hat=lambda: apprentice_boy('hat'),
            dvora=dvora)


# ====================================================================== posing
def pose(h, anim, i, n):
    P, F = h.P, h.flags
    ph = TAU * i / n
    S = F.get('stride', 1.0)
    elder = F.get('elder', False)
    body, up, head = P['body'], P['upper'], P['head']
    stoop = F.get('stoop', 0.12 if elder else 0.0)
    for k in ('armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR'):
        if k in P:
            P[k].rotation_euler = (0, 0, 0)
    body.location = (0, 0, 0)
    body.rotation_euler = (0, 0, 0)
    up.scale = (1, 1, 1)
    hold = F.get('hold')
    arm_rest = F.get('arm_rest', {})
    if anim == 'idle':
        b = math.sin(ph)
        up.scale = (1 + 0.006 * b, 1 + 0.006 * b, 1 + 0.014 * b)
        up.rotation_euler = (stoop, 0, 0)
        head.rotation_euler = (-stoop * 0.6 + 0.03 * math.sin(ph + 0.8), 0, 0.03 * math.sin(ph))
        P['armL'].rotation_euler = (0.03 * b, 0, 0.06)
        P['armR'].rotation_euler = (0.03 * b, 0, -0.06)
        P['elbowL'].rotation_euler = (-0.15, 0, 0)
        P['elbowR'].rotation_euler = (-0.15, 0, 0)
        if 'skirt' in P:
            P['skirt'].rotation_euler = (0.01 * math.sin(ph), 0.008 * math.sin(ph + 1), 0)
    else:
        s, c = math.sin(ph), math.cos(ph)
        bob = abs(math.cos(ph)) * 0.03 * (0.6 if elder else 1.0)
        body.location = (0, 0, bob - 0.012)
        body.rotation_euler = (0, 0, 0.06 * s * S)
        up.rotation_euler = (stoop + 0.06, 0.025 * c, -0.05 * s * S)
        head.rotation_euler = (-stoop * 0.6 - 0.04, 0, 0.05 * s * S)
        P['armL'].rotation_euler = (0.55 * s * S, 0, 0.07)
        P['armR'].rotation_euler = (-0.55 * s * S, 0, -0.07)
        P['elbowL'].rotation_euler = (-0.25 - 0.2 * max(0, -s) * S, 0, 0)
        P['elbowR'].rotation_euler = (-0.25 - 0.2 * max(0, s) * S, 0, 0)
        legsw = (0.5 if F['kind'] == 'legs' else 0.42) * S
        for nm, sg in (('L', -1), ('R', 1)):
            a = sg * s * legsw
            P['leg' + nm].rotation_euler = (a, 0, 0)
            # knee bends when the leg swings back / passes under
            kb = max(0.0, -sg * c) * 0.75 * S + 0.05
            P['knee' + nm].rotation_euler = (kb, 0, 0)
            P['foot' + nm].rotation_euler = (-a - kb * 0.8, 0, 0)
        if 'skirt' in P:
            P['skirt'].rotation_euler = (-0.04 * S, 0.035 * s * S, 0.04 * s * S)
    # held items: forearm raised
    for side in ('L', 'R'):
        if hold == side or hold == 'LR':
            P['arm' + side].rotation_euler = (-0.35 + (0.08 * math.sin(ph) if anim == 'walk' else 0.02 * math.sin(ph)),
                                              0, 0.12 if side == 'L' else -0.12)
            P['elbow' + side].rotation_euler = (-0.9, 0, 0)
    hp_ = F.get('head_pitch', 0.0)
    if hp_:
        r = head.rotation_euler
        head.rotation_euler = (r[0] + hp_, r[1], r[2])
    for k, v in arm_rest.items():
        P[k].rotation_euler = v
    if 'pose_fn' in F:
        F['pose_fn'](h, anim, i, n)
