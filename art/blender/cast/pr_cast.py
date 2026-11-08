"""Packet Run cast: Dina the mechanic (Human), Gee the GPS buddy, the Noise driver (helmet, hidden face).

Modesty: long sleeves, covered head, no weapons. Copied pipeline: v2lib / v2_parts / v2_face (from message-ship).
"""
import math

import bpy
from mathutils import Vector

from v2lib import *
from v2_parts import Human, darker, lighter
from v2_cast import SKIN
from v2_cast_npc import scarf_neck

DENIM = "#3d6a9a"


def ring_pts(cx, cz, y, r, n=20, rz=None):
    rz = rz or r
    return [Vector((cx + r * math.cos(TAU * i / n), y, cz + rz * math.sin(TAU * i / n))) for i in range(n + 1)]


# ====================================================================== Dina
def dina():
    """Elderly mechanic: red flowered headscarf with goggles, plaid shirt, denim overalls, yellow work gloves."""
    sp = dict(skin=SKIN['g'], R=0.25, iris="#4a3a2a", brow_col="#d2cbc6", lip="#a85a56", blush_amt=0.65,
              head=dict(jaw=0.36, cheek=0.13, nose=0.13, chin=0.04), eye_h=0.12, eye_w=0.12, wrinkles=True,
              lash_w=0.04, flick=0.2, brow_w=0.06, expr_over=dict(neutral=dict(mouth=('smirk', 0.15), sq=0.2)))
    h = Human(dict(sp, H=0.95, W=1.22, torso_k=0.97))
    h.legs(DENIM, shoe="#3a2a20", boots=True, P=dict(nu=24, fv=60), r=0.1)
    h.torso("#d9483a", pat='plaid', color2="#f3e4c4", P=dict(nu=24, fv=30, thr=0.8), collar="#d9483a", vest=DENIM,
            vest_pat='weave', vest2="#e8b04a", bulk=1.12, belly=0.05)
    h.arms("#d9483a", pat='plaid', color2="#f3e4c4", P=dict(nu=10, fv=30, thr=0.8), cuff=DENIM, glove="#f2c84a", r=0.068)
    h.head()
    h.hair_cap("#dedad8", hairline=0.6, back_len=-0.45, sides=-0.05, fringe=(3, 0.1), P=dict(nu=70, wave=0.6))
    h.headscarf("#d9483a", color2="#f6efe0", pat='flowers', z_front=0.5)
    R = h.R
    hp = h.P['head']
    # goggles pushed up on the scarf
    brass = mat("#c99a3a", metal=True)
    lens = mat("#9fe0f0", kind='soft', rim=0.8)
    for s in (-1, 1):
        cx, cz = s * 0.3 * R, 0.62 * R
        y = -math.sqrt(max(0.0, 1.0 - 0.3 ** 2 - 0.62 ** 2)) * R * 1.16 - 0.01
        tube("gog_rim", ring_pts(cx, cz, y, 0.2 * R), [0.035 * R], brass, hp, seg=6, sub=1)
        ellipsoid("gog_lens", 0.19 * R, lens, hp, loc=(cx, y + 0.01, cz), scale=(1, 0.35, 1))
    strap = [Vector((1.13 * R * math.cos(a), 1.13 * R * math.sin(a) * 1.02, 0.6 * R)) for a in
             [math.pi * (1.5 + 0.28) + k * (math.pi * 2 - 0.56 * math.pi) / 12 for k in range(13)]]
    tube("gog_strap", strap, [0.05 * R], mat("#5a3a2a", pat='leather', P=dict(scale=30)), hp, seg=6, sub=2)
    # grease smudge on the cheek (funny), wrench in the bib pocket
    ellipsoid("smudge", 0.1 * R, mat("#5a4a4a", kind='flat', rim=0, line=False), hp, loc=(-0.48 * R, -0.86 * R, -0.28 * R),
              scale=(1.2, 0.25, 0.6), rot=(0, 0.3, 0.5), line=False)
    up = h.P['upper']
    th = h.torso_h
    W = h.W
    box("pocket", (0.11 * W, 0.02, 0.09), mat(darker(DENIM, 0.85), pat='weave'), up, loc=(0.07 * W, -0.19 * W, th * 0.7))
    steel = mat("#b8c2cc", metal=True)
    box("wr_handle", (0.022, 0.015, 0.14), steel, up, loc=(0.09 * W, -0.2 * W, th * 0.8), rot=(0, 0.25, 0))
    ellipsoid("wr_head", 0.03, steel, up, loc=(0.105 * W, -0.2 * W, th * 0.88), scale=(1.2, 0.5, 1.0))
    h.flags = dict(kind='legs', stride=0.7, elder=True)
    h.portrait = dict(yaw=-24, scale=1.16, dz=-0.1, elev=5)
    return h


# ====================================================================== Noise driver
def noise():
    """Driver in shadow: black racing suit with jagged violet glitch stripes, helmet with a dark visor (face hidden)."""
    sp = dict(skin=SKIN['c'], R=0.25, iris="#2a1a10", brow_col="#1a1010", lip="#8a4038", blush_amt=0.0,
              head=dict(jaw=0.3, cheek=0.05, nose=0.1, chin=0.06), eye_h=0.13, flick=0.1)
    h = Human(dict(sp, H=1.02, W=1.1))
    h.legs("#1e1b26", shoe="#121018", boots=True, P=dict(nu=24, fv=60))
    h.torso("#211d2b", pat='weave', P=dict(nu=40, fv=70), collar="#2e2840", bulk=1.05)
    h.arms("#211d2b", pat='weave', P=dict(nu=16, fv=70), cuff="#3a2e52", glove="#15121c")
    h.head()
    R = h.R
    hp = h.P['head']
    up = h.P['upper']
    th = h.torso_h
    W = h.W
    shell = mat("#34304a", kind='soft', rim=0.3)
    ellipsoid("helmet", R * 1.24, shell, hp, loc=(0, R * 0.04, R * 0.06), scale=(1.0, 1.05, 1.06), seg=40, rings=24)
    visor = mat("#120c1c", kind='soft', rim=0.2)
    ellipsoid("visor", R * 1.0, visor, hp, loc=(0, -R * 0.5, R * 0.04), scale=(1.08, 0.82, 0.6), seg=36, rings=20)
    ellipsoid("visor_hl", R * 0.2, glow("#b9a6ff", 1.2), hp, loc=(-R * 0.55, -R * 1.22, R * 0.3), scale=(1.4, 0.15, 0.35), rot=(0, 0.5, 0), line=False)
    vio = glow("#a24bff", 2.2)
    # jagged glitch stripes on the helmet and the chest
    for dx in (-0.12, 0.12):   # twin violet racing stripes over the helmet
        pts = [Vector((dx * R, -1.31 * R * math.cos(a) + R * 0.04, 1.33 * R * math.sin(a) + R * 0.06)) for a in
               [math.radians(d) for d in range(40, 181, 14)]]
        tube("hstripe", pts, [0.045 * R], vio, hp, seg=6, sub=2, line=False)
    for k in range(2):
        pts = [Vector(((-0.17 + 0.07 * i) * W, -0.19 * W, th * (0.55 + 0.12 * k + 0.05 * ((i % 2) * 2 - 1)))) for i in range(6)]
        tube("cstripe", pts, [0.012], vio, up, seg=5, sub=1, line=False)
    h.flags = dict(kind='legs', stride=1.0)
    h.portrait = dict(yaw=-18, scale=1.32, dz=-0.02, elev=6)
    h.noise = True
    return h


NOISE_EYES = {
    'neutral': [(-1, 0.0, 0.25, 0.07), (1, 0.0, 0.25, 0.07)],          # (side, tilt, w, h)
    'happy': [(-1, 0.0, 0.22, 0.05), (1, 0.0, 0.22, 0.05)],
    'worried': [(-1, 0.35, 0.22, 0.07), (1, -0.35, 0.22, 0.07)],
    'surprised': [(-1, 0.0, 0.16, 0.16), (1, 0.0, 0.16, 0.16)],
}


def noise_eyes(h, expr):
    R = h.R
    hp = h.P['head']
    out = []
    em = glow("#ff6a2a", 3.0)
    for s, tilt, w, hh in NOISE_EYES[expr]:
        y = -R * 1.33
        if expr == 'happy':      # arched slits
            pts = [Vector((s * 0.36 * R + dx * R, y, 0.08 * R + 0.06 * R * (1 - (dx / 0.13) ** 2))) for dx in (-0.13, 0, 0.13)]
            out.append(tube("neye", pts, [0.03 * R], em, hp, seg=6, sub=3, line=False))
        else:
            out.append(ellipsoid("neye", R, em, hp, loc=(s * 0.36 * R, y, 0.08 * R), scale=(w, 0.05, hh),
                                 rot=(0, s * tilt, 0), line=False))
    return out


# ====================================================================== Gee: GPS buddy
GEE_EXPR = {
    'neutral': dict(eye=(1.0, 1.0), mouth='smile', brow=(0.0, 0.0)),
    'happy': dict(eye=(1.0, 0.0), mouth='open', brow=(0.015, 0.0)),
    'worried': dict(eye=(0.9, 0.95), mouth='wavy', brow=(0.035, -0.015)),
    'surprised': dict(eye=(1.25, 1.35), mouth='o', brow=(0.04, 0.04)),
}


def gee(expr='neutral'):
    """GPS device ~0.62 x 0.44 with a face on the screen, little antenna, suction-cup mount. Origin = screen centre."""
    E = GEE_EXPR[expr]
    root = pivot("gee")
    case = mat("#3f8fd2", kind='soft', rim=0.7)
    case2 = mat("#2a5f9a", kind='soft', rim=0.5)
    box("case", (0.66, 0.16, 0.48), case, root, loc=(0, 0.04, 0), bevel=0.07)
    box("bezel", (0.58, 0.04, 0.4), case2, root, loc=(0, -0.045, 0), bevel=0.04)
    scr = glow("#d9f7ff", 1.25)
    box("screen", (0.52, 0.02, 0.34), scr, root, loc=(0, -0.066, 0), bevel=0.02, line=False)
    # faint map on the screen: roads + destination pin
    road = mat("#a8dcef", kind='flat', rim=0, ao=0, line=False)
    y0 = -0.078
    for pts in (((-0.25, -0.12), (-0.05, -0.05), (0.1, -0.13), (0.25, -0.08)), ((-0.22, 0.14), (-0.1, 0.05), (0.05, 0.12), (0.24, 0.13))):
        tube("road", [Vector((x, y0, z)) for x, z in pts], [0.008], road, root, seg=4, sub=3, line=False)
    pin = mat("#ff7f6e", kind='flat', rim=0, ao=0, line=False)
    ellipsoid("pin", 0.022, pin, root, loc=(0.2, y0 - 0.002, -0.06), scale=(1, 0.3, 1))
    # face
    ink = mat("#1f2f4a", kind='flat', rim=0, ao=0, line=False)
    ex, ez = E['eye']
    yf = y0 - 0.006
    for s in (-1, 1):
        if ez < 0.05:
            pts = [Vector((s * 0.1 - 0.045, yf, 0.03)), Vector((s * 0.1, yf, 0.075)), Vector((s * 0.1 + 0.045, yf, 0.03))]
            tube("eyeA", pts, [0.013], ink, root, seg=5, sub=3, line=False)
        else:
            ellipsoid("eye", 0.036, ink, root, loc=(s * 0.1, yf, 0.04), scale=(ex, 0.25, 1.3 * ez), line=False)
            ellipsoid("eyehl", 0.012, glow("#ffffff", 1.4), root, loc=(s * 0.1 - 0.012, yf - 0.006, 0.065), line=False)
        bw = E['brow']
        tube("brow", [Vector((s * 0.06, yf, 0.12 + bw[0])), Vector((s * 0.135, yf, 0.12 + bw[1]))], [0.009], ink, root, seg=4,
             sub=1, line=False)
        ellipsoid("blush", 0.032, mat("#ff9a8a", kind='flat', rim=0, ao=0, line=False), root, loc=(s * 0.175, yf + 0.002, -0.025),
                  scale=(1, 0.2, 0.6), line=False)
    m = E['mouth']
    if m == 'smile':
        tube("m", [Vector((-0.05, yf, -0.035)), Vector((0, yf, -0.065)), Vector((0.05, yf, -0.035))], [0.011], ink, root, seg=5,
             sub=3, line=False)
    elif m == 'open':
        ellipsoid("m", 0.055, mat("#3a2a4a", kind='flat', rim=0, ao=0, line=False), root, loc=(0, yf, -0.05),
                  scale=(1.0, 0.2, 0.7), line=False)
        ellipsoid("tg", 0.028, mat("#ff8a9a", kind='flat', rim=0, ao=0, line=False), root, loc=(0, yf - 0.004, -0.072),
                  scale=(1.0, 0.2, 0.55), line=False)
    elif m == 'wavy':
        tube("m", [Vector((-0.05, yf, -0.05)), Vector((-0.017, yf, -0.038)), Vector((0.017, yf, -0.058)), Vector((0.05, yf, -0.045))],
             [0.01], ink, root, seg=5, sub=3, line=False)
    else:
        ellipsoid("m", 0.034, mat("#3a2a4a", kind='flat', rim=0, ao=0, line=False), root, loc=(0, yf, -0.055),
                  scale=(0.8, 0.2, 1.0), line=False)
    # antenna with a ball, side buttons, mount arm + suction cup
    tube("ant", [Vector((0.22, 0.05, 0.22)), Vector((0.25, 0.05, 0.33)), Vector((0.27, 0.05, 0.4))], [0.014], case2, root, seg=6, sub=2)
    ellipsoid("antball", 0.035, mat("#ff7f6e", kind='soft'), root, loc=(0.27, 0.05, 0.42))
    for z in (0.08, -0.06):
        ellipsoid("btn", 0.03, mat("#ffd166", kind='soft'), root, loc=(0.335, 0.03, z), scale=(0.6, 1, 1))
    grey = mat("#5d6875", kind='soft')
    tube("arm", [Vector((0, 0.12, -0.12)), Vector((0, 0.2, -0.24)), Vector((0, 0.18, -0.38))], [0.03], grey, root, seg=8, sub=3)
    ellipsoid("joint", 0.045, grey, root, loc=(0, 0.12, -0.12))
    loft("cup", [(0.0, 0.03, 0.03), (-0.04, 0.09, 0.09), (-0.05, 0.1, 0.1)], mat("#9fe0f0", kind='soft'), root,
         loc=(0, 0.18, -0.38), seg=20, cap_bot=True)
    return root


# ====================================================================== courier heroes (driver look)
def racing_stripes(h, color="#ffffff"):
    up = h.P['upper']
    th = h.torso_h
    W = h.W
    m = mat(color, kind='soft')
    for s in (-1, 1):
        tube("rstripe", [Vector((s * 0.06 * W, -0.2 * W, th * 0.15)), Vector((s * 0.06 * W, -0.205 * W, th * 0.5)),
                         Vector((s * 0.07 * W, -0.17 * W, th * 0.9))], [0.016], m, up, seg=6, sub=2, flat=0.5)
    ellipsoid("badge", 0.03, mat("#ffd166", kind='soft'), up, loc=(-0.1 * W, -0.19 * W, th * 0.72), scale=(1, 0.4, 1))


def hero_girl():
    sp = dict(skin=SKIN['a'], R=0.25, iris="#4a6a8a", brow_col="#2a1a14", lip="#c0565a", blush_amt=0.5,
              head=dict(jaw=0.3, cheek=0.05, nose=0.07, chin=0.05), eye_h=0.16, flick=1.2)
    h = Human(sp)
    h.feet_only(shoe="#3a2a2a")
    h.skirt("#2f3a5a", pat='weave', P=dict(nu=60, fv=80), hem="#4ad6c8", flare=1.0, folds=11)
    h.torso("#e8443a", pat='weave', P=dict(nu=40, fv=80), collar="#2b2d36", belt="#2b2d36", buttons=("#f6f4ee", 3))
    racing_stripes(h)
    h.arms("#e8443a", cuff="#2b2d36", P=dict(nu=18, fv=90), glove="#2b2d36")
    h.head()
    h.hair_cap("#1e1a1a", hairline=0.5, back_len=-0.6, sides=-0.3, fringe=(4, 0.2))
    h.headscarf("#4ad6c8", color2="#f2f6fa", pat='vstripes', P=dict(nu=36, fv=30, thr=0.78), z_front=0.5)
    h.flags = dict(kind='dress', stride=1.0)
    h.portrait = dict(yaw=-24)
    return h


def hero_boy():
    sp = dict(skin=SKIN['b'], R=0.25, iris="#4a2e1e", brow_col="#1a1010", lip="#9a4a44", blush_amt=0.35,
              head=dict(jaw=0.3, cheek=0.04, nose=0.09, chin=0.07), eye_h=0.14, lash_w=0.045, flick=0.3)
    h = Human(sp)
    h.legs("#2f3a5a", shoe="#2a2020", cuff="#2b2d36", pat='weave', P=dict(nu=24, fv=70), boots=True)
    h.torso("#3f8fd2", pat='weave', P=dict(nu=40, fv=80), collar="#2b2d36", belt="#2b2d36", buttons=("#f6f4ee", 3))
    racing_stripes(h)
    h.arms("#3f8fd2", cuff="#2b2d36", P=dict(nu=18, fv=90), glove="#2b2d36")
    h.head(ears=1.0)
    h.hair_cap("#1e1414", hairline=0.56, back_len=-0.5, sides=-0.1, fringe=(7, 0.22), part=0.1)
    h.flat_cap("#ffb020", color2="#2b2d36", tilt=-0.1, z=0.46, pat='weave')
    h.flags = dict(kind='legs', stride=1.0)
    h.portrait = dict(yaw=-24)
    return h


CAST = dict(dina=dina, noise=noise, hero_girl=hero_girl, hero_boy=hero_boy)
