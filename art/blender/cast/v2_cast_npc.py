"""Villagers (portrait cast + NPC types) and the Warden. See v2_cast.py for the heroes."""
import math

import bpy
from mathutils import Vector

from v2lib import *
from v2lib import _MAT, _col4
from v2_parts import Human, darker, lighter
from v2_cast import SKIN

CREAM = "#f3e4c4"


# ---------------------------------------------------------------- extra parts
def beard(h, color, length=0.55, width=0.7, mustache=True, full=True, mk=1.0, mz=0.0):
    R = h.R
    hm = mat(color, pat='hair', kind='hair', P=dict(nu=60, wave=1.5), var=0.3, bump=0.5)
    hp = h.P['head']
    if full:
        blob("beard", R, hm, hp, loc=(0, -R * 0.4, -R * 0.86), scale=(width, 0.6, length * 0.8),
             deform=lambda p: Vector((p.x, p.y, p.z - 0.25 * max(0, -p.z) ** 2 * (1 - abs(p.x)))), seg=32, rings=20)
    if mustache:
        for s in (-1, 1):
            tube("must", [Vector((s * 0.02 * R, -R * 1.0, -R * (0.27 + mz))), Vector((s * 0.16 * R * mk, -R * 0.98, -R * (0.3 + mz))),
                          Vector((s * 0.3 * R * mk, -R * 0.9, -R * (0.36 + mz)))], [R * 0.06 * mk, R * 0.055 * mk, R * 0.025], hm, hp,
                 seg=10, flat=0.7)


def bucket_hat(h, color, z=0.5, brim=1.35, tilt=-0.05):
    """'Kova tembel' style soft bucket hat."""
    R = h.R
    m = mat(color, pat='weave', P=dict(nu=60, fv=110), var=0.12)
    hat = pivot("hat", (0, 0, z * R), h.P['head'], rot=(tilt, 0, 0))
    loft("bucket", [(-0.25 * R, brim * R, brim * R), (-0.12 * R, 1.12 * R, 1.12 * R), (0.0, 1.04 * R, 1.04 * R),
                    (0.45 * R, 0.8 * R, 0.8 * R), (0.62 * R, 0.25 * R, 0.25 * R)], m, hat, seg=56, cap_top=True,
         folds=lambda a, t: 1 + 0.05 * (1 - t) * math.sin(4 * a + 0.5))
    stitches("bst", 1.12 * R, -0.11 * R, 40, mat(darker(color, 0.6), kind='flat', rim=0, ao=0), hat, size=0.008)
    h.P['hat'] = hat
    return hat


def soft_cap(h, color, z=0.55, puff=1.25, tilt=-0.15, side=0.15, band=None, pat='weave'):
    """Beret / baker's soft cap."""
    R = h.R
    m = mat(color, pat=pat, P=dict(nu=40, fv=60), var=0.15)
    hat = pivot("hat", (0, 0, z * R), h.P['head'], rot=(tilt, side, 0))
    blob("beret", R * puff, m, hat, loc=(0, 0, 0.12 * R), scale=(1, 1, 0.45),
         deform=lambda p: Vector((p.x, p.y, p.z if p.z > 0 else p.z * 0.4)), seg=40, rings=20)
    loft("capband", [(-0.12 * R, R * 0.98, R * 0.98), (0.06 * R, R * 1.02, R * 1.02)], mat(band or darker(color, 0.85), pat='weave'),
         hat, seg=40)
    h.P['hat'] = hat
    return hat


def brim_hat(h, color, band, brim=1.6, crown=0.7, z=0.5, tilt=-0.1, pat='leather', P=None):
    return h.wide_hat(color, band, crown_h=crown, brim=brim, tilt=tilt, pat=pat, P=P or dict(scale=26), bow=False,
                      droop=0.04, wav=0.01, z=z)


def lantern(h, hand, light=True, color="#ffc66a"):
    lp = pivot("lantern", (0, -0.01, -0.06), hand)
    fm = mat("#3a3040", metal=True)
    tube("handle", [Vector((-0.03, 0, 0.0)), Vector((0, 0, 0.04)), Vector((0.03, 0, 0.0))], [0.006], fm, lp, seg=5, sub=3)
    cyl("ltop", 0.05, 0.02, 0.045, fm, lp, loc=(0, 0, -0.05))
    cyl("lglass", 0.045, 0.045, 0.1, glow(color, 3.5), lp, loc=(0, 0, -0.15), caps=True)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        tube("bar", [Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.15)), Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.05))],
             [0.006], fm, lp, seg=4, sub=1, line=False)
    cyl("lbase", 0.055, 0.055, 0.02, fm, lp, loc=(0, 0, -0.17))
    ellipsoid("lhalo", 0.14, glow(color, 1.6, alpha=0.5, soft=True), lp, loc=(0, 0, -0.1), seg=14, rings=10)
    if light:
        h.glow_light(lp, (0, -0.1, -0.1), color, 8, 0.05)
    return lp


def sack(h, parent, loc, color="#d8c8a0", size=0.16, rot=(0, 0, 0)):
    m = mat(color, pat='weave', P=dict(nu=30, fv=50), var=0.2, bump=0.6)
    s = blob("sack", size, m, parent, loc=loc, rot=rot, scale=(1.0, 0.8, 1.15),
             deform=lambda p: Vector((p.x * (1 + 0.15 * p.z), p.y, p.z)), seg=24, rings=16)
    tube("sacktie", [Vector((loc[0] - 0.03, loc[1], loc[2] + size * 1.1)), Vector((loc[0] + 0.03, loc[1], loc[2] + size * 1.15))],
         [0.012], mat("#8a5a36", pat='leather'), parent, seg=6, sub=1)
    return s


def basket(h, parent, loc, color="#b98a4a", r=0.12, depth=0.1, contents=None, rot=(0, 0, 0)):
    m = mat(color, pat='weave', P=dict(nu=36, fv=90), var=0.35, bump=0.8)
    b = pivot("basket", loc, parent, rot=rot)
    loft("bask", [(0, r * 0.8, r * 0.8), (depth * 0.5, r * 0.95, r * 0.95), (depth, r, r)], m, b, seg=28, cap_bot=True)
    tube("basrim", [Vector((r * math.cos(TAU * i / 24), r * math.sin(TAU * i / 24), depth)) for i in range(25)], [0.012], m, b,
         seg=6, sub=1)
    if contents:
        contents(b, r, depth)
    return b


def spools(parent, r, depth, colors=("#35d3b0", "#e8b04a", "#c44b3f", "#6a8ad6", "#f3e4c4")):
    k = 0
    for i, c in enumerate(colors):
        a = TAU * i / len(colors)
        sp = pivot("spool", (math.cos(a) * r * 0.5, math.sin(a) * r * 0.5, depth * 0.95), parent, rot=(0.3 * math.sin(a), 0.4, a))
        cyl("thr", 0.032, 0.032, 0.06, mat(c, pat='spiral', color2=darker(c, 0.75), P=dict(nu=10, fv=200)), sp, loc=(0, 0, -0.03))
        for z in (-0.035, 0.03):
            cyl("flange", 0.04, 0.04, 0.008, mat("#a06a3e", pat='wood'), sp, loc=(0, 0, z))


def bread(parent, loc, rot=(0, 0, 0)):
    m = mat("#c9883e", pat='noise', P=dict(scale=20), var=0.2, bump=0.5)
    b = blob("loaf", 0.09, m, parent, loc=loc, rot=rot, scale=(1.6, 0.9, 0.75), seg=24, rings=14)
    for k in range(3):
        tube("score", [Vector((loc[0] - 0.1 + 0.08 * k, loc[1] - 0.03, loc[2] + 0.06)),
                       Vector((loc[0] - 0.06 + 0.08 * k, loc[1] - 0.03, loc[2] + 0.068))], [0.008],
             mat("#f0d090", kind='soft', rim=0), parent, seg=5, sub=1, line=False)
    return b


def ear_horn(h, hand):
    """Brass ear trumpet."""
    m = mat("#d8a840", metal=True)
    ep = pivot("horn", (0, -0.02, -0.03), hand, rot=(0, 0, 0))
    loft("bell", [(0.0, 0.025, 0.025), (0.12, 0.035, 0.035), (0.2, 0.06, 0.06), (0.25, 0.1, 0.1), (0.26, 0.105, 0.105)],
         m, ep, seg=28, rot=(0, math.radians(-100), 0), loc=(0.0, 0, 0.0))
    tube("hornpipe", [Vector((0, 0, 0)), Vector((0.03, 0, 0.1)), Vector((0.07, 0.01, 0.17))], [0.02, 0.018, 0.015], m, ep, seg=10)
    return ep


def knitting(h, hand, color="#4a78c8"):
    m = mat(color, pat='knit', P=dict(nu=12, fv=110), var=0.25, bump=0.6)
    kp = pivot("knit", (0.05, -0.08, -0.02), hand)
    blob("scarfpiece", 0.08, m, kp, scale=(1.4, 0.35, 1.0), seg=20, rings=12)
    nm = mat("#e8d6b0", metal=True)
    for s in (-1, 1):
        tube("kneedle", [Vector((s * 0.05, -0.02, 0.06)), Vector((s * 0.12, -0.03, 0.2))], [0.007], nm, kp, seg=5, sub=1)
    tube("yarn", [Vector((0.08, 0, -0.06)), Vector((0.1, 0.05, -0.2)), Vector((0.05, 0.1, -0.3))], [0.008], m, kp, seg=5, sub=3)


def herbs(parent, loc):
    st = mat("#5a8a3a", kind='soft')
    hp = pivot("herbs", loc, parent)
    for k in range(6):
        a = k * 0.5 - 1.2
        tube("stem", [Vector((0, 0, 0)), Vector((math.sin(a) * 0.04, -0.01, 0.12)), Vector((math.sin(a) * 0.08, -0.02, 0.2))],
             [0.006], st, hp, seg=4, sub=2, line=False)
        ellipsoid("leaf", 0.025, mat(["#6cb257", "#4f9a4f", "#9a7ad0"][k % 3], kind='soft'), hp,
                  loc=(math.sin(a) * 0.08, -0.02, 0.21), scale=(1, 0.5, 1.6), seg=8, rings=6)
    tube("tie", [Vector((-0.02, 0, 0.05)), Vector((0.02, 0, 0.05))], [0.012], mat("#c44b3f", pat='weave'), hp, seg=6, sub=1)


def crook(h, hand, length=1.3):
    m = mat("#8a5a36", pat='wood', P=dict(nu=6), var=0.25)
    cp = pivot("crook", (0, -0.02, -0.03), hand)
    pts = [Vector((0, 0, -0.55)), Vector((0, 0, 0.2)), Vector((0, 0, 0.6)), Vector((0.0, -0.04, 0.7)),
           Vector((0.0, -0.13, 0.72)), Vector((0.0, -0.17, 0.64))]
    tube("staff", pts, [0.018, 0.018, 0.018, 0.017, 0.016, 0.015], m, cp, seg=8, sub=4)
    return cp


def rod(h, hand):
    m = mat("#a06a3e", pat='wood', var=0.2)
    rp = pivot("rod", (0, -0.02, -0.03), hand, rot=(-0.35, 0, 0))
    tube("rod", [Vector((0, 0, -0.2)), Vector((0, -0.05, 0.5)), Vector((0, -0.14, 1.0))], [0.015, 0.011, 0.005], m, rp, seg=6, sub=3)
    tube("line", [Vector((0, -0.14, 1.0)), Vector((0, -0.3, 0.7)), Vector((0, -0.33, 0.4))], [0.003], glow("#e8f0ff", 1.0), rp,
         seg=4, sub=3)
    ellipsoid("float", 0.025, mat("#c44b3f", kind='soft'), rp, loc=(0, -0.33, 0.38), seg=8, rings=6)


def hand_bell(h, hand):
    m = mat("#e0b040", metal=True)
    bp = pivot("bell", (0, -0.02, -0.06), hand)
    tube("bhandle", [Vector((0, 0, 0.04)), Vector((0, 0, -0.04))], [0.016], mat("#6b4326", pat='wood'), bp, seg=8, sub=1)
    loft("bellbody", [(-0.04, 0.02, 0.02), (-0.08, 0.045, 0.045), (-0.14, 0.06, 0.06), (-0.16, 0.075, 0.075), (-0.165, 0.07, 0.07)],
         m, bp, seg=28)
    ellipsoid("clapper", 0.018, m, bp, loc=(0, 0, -0.165), seg=8, rings=6)


def mug_tray(h, hand):
    tp = pivot("tray", (0, -0.12, 0.0), hand)
    cyl("trayb", 0.15, 0.15, 0.015, mat("#8a5a36", pat='wood'), tp, loc=(0, 0, 0.0))
    for k, (x, y) in enumerate(((-0.06, 0.02), (0.06, -0.02), (0.0, 0.07))):
        cyl("mug", 0.035, 0.032, 0.08, mat("#b8a090", pat='noise', P=dict(scale=30), var=0.1), tp, loc=(x, y, 0.015))
        cyl("foam", 0.034, 0.034, 0.012, mat("#fff4dc", kind='soft'), tp, loc=(x, y, 0.09))


def lute(h, parent, loc, rot):
    wm = mat("#b87a3e", pat='wood', P=dict(nu=8), var=0.25)
    dm = mat("#6b4326", pat='wood', var=0.2)
    lp = pivot("lute", loc, parent, rot=rot)
    blob("lbody", 0.15, wm, lp, scale=(1.0, 0.45, 1.25),
         deform=lambda p: Vector((p.x * (1 - 0.35 * max(0, p.z)), p.y if p.y > 0 else p.y * 0.25, p.z)), seg=32, rings=20)
    cyl("hole", 0.04, 0.04, 0.004, mat("#2a1a14", kind='flat'), lp, loc=(0, -0.03, 0.02), rot=(math.pi / 2, 0, 0))
    box("neck", (0.05, 0.03, 0.32), dm, lp, loc=(0, -0.01, 0.33), bevel=0.008)
    box("peg", (0.07, 0.04, 0.09), dm, lp, loc=(0, 0.02, 0.52), rot=(0.6, 0, 0), bevel=0.01)
    for k in range(4):
        x = -0.015 + 0.01 * k
        tube("str", [Vector((x, -0.042, -0.08)), Vector((x, -0.03, 0.48))], [0.0025], glow("#fff0c8", 1.2), lp, seg=4, sub=1,
             line=False)
    return lp


def backpack(h, color="#8a5a36"):
    up = h.P['upper']
    th = h.torso_h
    m = mat(color, pat='leather', var=0.2, bump=0.6)
    bp = pivot("pack", (0, 0.2 * h.W + 0.12, th * 0.5), up)
    box("packbody", (0.38, 0.24, 0.5), m, bp, bevel=0.05)
    box("packflap", (0.4, 0.26, 0.16), mat(darker(color, 0.7), pat='leather', var=0.2), bp, loc=(0, 0, 0.2), bevel=0.04)
    sack(h, bp, (0.0, 0.0, 0.38), color="#c9b48a", size=0.14)
    # bedroll + pots + spools hanging
    cyl("roll", 0.07, 0.07, 0.46, mat("#6a3f73", pat='plaid', color2="#e8b04a", P=dict(nu=10, fv=20)), bp, loc=(-0.23, 0.0, -0.28),
        rot=(0, math.pi / 2, 0))
    cyl("pot", 0.08, 0.07, 0.1, mat("#7a7a8a", metal=True), bp, loc=(0.24, 0.02, 0.05), rot=(0, math.pi / 2, 0))
    for k, c in enumerate(("#35d3b0", "#c44b3f", "#e8b04a")):
        cyl("spl", 0.03, 0.03, 0.05, mat(c, pat='spiral', color2=darker(c), P=dict(nu=8, fv=200)), bp,
            loc=(-0.12 + 0.12 * k, 0.13, -0.15), rot=(math.pi / 2, 0, 0))
    ellipsoid("buckle", 0.025, mat("#e8b04a", metal=True), bp, loc=(0, 0.13, 0.13), seg=8, rings=6)
    for s in (-1, 1):
        tube("pstrap", [Vector((s * 0.12, 0.2 * h.W, th * 0.95)), Vector((s * 0.13, -0.17 * h.W, th * 0.85)),
                        Vector((s * 0.15, -0.17 * h.W, th * 0.3)), Vector((s * 0.14, 0.16 * h.W, th * 0.15))], [0.014], m, up,
             seg=6, sub=3, flat=0.4)
    return bp


def suspenders(h, color):
    up = h.P['upper']
    th = h.torso_h
    m = mat(color, pat='weave', var=0.1)
    W = h.W
    for s in (-1, 1):
        tube("susp", [Vector((s * 0.09 * W, -0.165 * W, 0.0)), Vector((s * 0.1 * W, -0.168 * W, th * 0.6)),
                      Vector((s * 0.1 * W, -0.1 * W, th * 0.93)), Vector((s * 0.06 * W, 0.12 * W, th * 0.9)),
                      Vector((s * 0.08 * W, 0.168 * W, 0.0))], [0.013], m, up, seg=6, sub=3, flat=0.4)
        ellipsoid("sbtn", 0.014, mat("#e8b04a", metal=True), up, loc=(s * 0.09 * W, -0.17 * W, 0.02), scale=(1, 0.5, 1))


def scarf_neck(h, color, pat='knit', color2=None, tail=True):
    up = h.P['upper']
    th = h.torso_h
    m = mat(color, pat=pat, color2=color2, P=dict(nu=30, fv=90, stripe=12), var=0.25, bump=0.6)
    loft("nscarf", [(th * 0.88, 0.12, 0.11), (th * 0.98, 0.115, 0.105), (th * 1.08, 0.095, 0.09), (th * 1.13, 0.085, 0.08)], m, up,
         seg=32, folds=lambda a, t: 1 + 0.06 * math.sin(6 * a + t * 3))
    if tail:
        tube("stail", [Vector((0.06, -0.11, th * 0.93)), Vector((0.08, -0.17, th * 0.6)), Vector((0.07, -0.18, th * 0.25))],
             [0.045, 0.045, 0.042], m, up, seg=10, flat=0.35)


def flour_spots(h, e):
    """Baker: flour smudge on the cheek (portrait face hook)."""
    m = mat("#fbf3e4", kind='soft', rim=0, ao=0, line=False)
    h.face.fp.poly("flour", ellipse_pts(-0.45, -0.25, 0.09, 0.06, 14), m, off=0.012)
    h.face.fp.poly("flour2", ellipse_pts(-0.33, -0.33, 0.04, 0.03, 10), m, off=0.012)


# ---------------------------------------------------------------- portrait cast
def shoshana():
    sp = dict(skin=SKIN['e'], R=0.25, iris="#6a4a2e", brow_col="#8a7a78", lip="#b05a5a", blush_amt=0.65, H=0.9, W=1.25,
              head=dict(jaw=0.24, cheek=0.12, nose=0.1, chin=0.03), eye_h=0.12, wrinkles=True, lash_w=0.04, flick=0.2,
              expr_over=dict(neutral=dict(mouth=('line', 0.09), sq=0.22)))
    h = Human(sp)
    h.feet_only(shoe="#4a2e20")
    h.skirt("#2f6b5a", pat='plaid', color2="#244f44", P=dict(nu=24, fv=18, thr=0.8), hem="#e8b04a", flare=1.0, folds=9)
    h.apron("#f6efe0", pat='flowers', color2="#e8a0a0", P=dict(nu=18, fv=22, rad=0.28), length=0.42, width=0.85, pocket="#e8a0a0")
    h.torso("#d8a03a", pat='knit', P=dict(nu=36, fv=55), collar=CREAM, buttons=("#8a5a36", 4), belly=0.03)
    h.arms("#d8a03a", cuff="#b8862a", pat='knit', P=dict(nu=14, fv=55))
    knitting(h, h.P['handR'])
    h.head()
    h.headscarf("#c44b3f", color2="#f3e4c4", pat='dots', P=dict(nu=24, fv=30, rad=0.16), z_front=0.5)
    h.flags = dict(kind='dress', stride=0.6, elder=True, hold='R')
    h.portrait = dict(yaw=-24)
    return h


def miriam():
    sp = dict(skin=SKIN['d'], R=0.245, iris="#3a2a1e", brow_col="#2a1a14", lip="#9a4a48", blush_amt=0.3,
              head=dict(jaw=0.34, cheek=0.05, nose=0.11, chin=0.05), eye_h=0.14, flick=0.8, H=1.02, W=0.95)
    h = Human(sp)
    h.feet_only(shoe="#3a2418")
    h.skirt("#5a6a8a", pat='weave', P=dict(nu=60, fv=70), hem="#3f4a66", flare=0.85, folds=12)
    h.apron("#f6f2ea", pat='weave', P=dict(nu=40, fv=80), length=0.46, width=0.7, pocket="#e0e8d8")
    h.torso("#5a6a8a", P=dict(nu=40, fv=70), collar="#f6f2ea", belt="#8a5a36")
    h.arms("#5a6a8a", cuff="#f6f2ea")
    h.satchel(color="#6b4326", side=-1)
    herbs(h.P['handL'], (0, -0.04, -0.02))
    h.head()
    h.headscarf("#7f9a6a", color2="#a8c08a", pat='vstripes', P=dict(nu=40, fv=30, thr=0.85), z_front=0.52, band="#5f7a4a")
    h.flags = dict(kind='dress', stride=0.9, hold='L')
    h.portrait = dict(yaw=-24)
    return h


def hillel():
    sp = dict(skin=SKIN['g'], R=0.26, iris="#4a3a2a", brow_col="#4a2e20", lip="#b05a50", blush_amt=0.6, H=0.98, W=1.4,
              head=dict(jaw=0.18, cheek=0.12, nose=0.14, chin=0.02), eye_h=0.12, lash_w=0.045, flick=0.2,
              mouth_z=-0.46, expr_over=dict(neutral=dict(mouth=('line', 0.1), sq=0.2)))
    h = Human(sp)
    h.legs("#5a4a3a", shoe="#3a2418", P=dict(nu=24, fv=70), r=0.1)
    h.coat_skirt("#e8dcc4", length=0.16, flare=0.5)
    h.torso("#e8dcc4", P=dict(nu=40, fv=70), collar="#f6f2ea", belly=0.06, buttons=("#c9a040", 3))
    h.apron("#f8f4ec", pat='flour', color2="#ffffff", P=dict(scale=6, thr=0.55), length=0.36, width=0.95,
            parent=h.P['upper'], top_z=0.05, bib=True)
    h.arms("#e8dcc4", cuff="#c9b490")
    bread(h.P['handL'], (0, -0.06, -0.03), rot=(0, 0, 0.6))
    h.head()
    h.hair_cap("#4a2e20", hairline=0.2, back_len=-0.5, sides=-0.2, fringe=None)
    beard(h, "#4a2e20", full=False, mustache=True)
    soft_cap(h, "#fbf6ec", z=0.5, puff=1.3, tilt=-0.1, side=0.12, band="#e8dcc4")
    h.flags = dict(kind='legs', stride=0.85, hold='L')
    h.portrait = dict(yaw=-22, face_fn=flour_spots, scale=1.25)
    return h


def miller():
    sp = dict(skin=SKIN['e'], R=0.24, iris="#5a6a6a", brow_col="#5a4a3a", lip="#9a5a50", blush_amt=0.25, H=1.15, W=0.92,
              head=dict(jaw=0.36, cheek=0.03, nose=0.15, chin=0.07, tall=1.08), eye_h=0.11, lash_w=0.042, flick=0.1,
              brow_w=0.06, expr_over=dict(neutral=dict(op=0.78, br=(-0.02, 0.03, 0.0))))
    h = Human(sp)
    h.legs("#4a4440", shoe="#3a2418", P=dict(nu=24, fv=60), boots=True, r=0.08)
    h.coat_skirt("#7a7468", length=0.42, flare=0.6, pat='weave', P=dict(nu=50, fv=60))
    h.torso("#7a7468", P=dict(nu=40, fv=60), collar="#d8d0c0", buttons=("#3a3030", 4))
    h.arms("#7a7468", cuff="#5a544a")
    scarf_neck(h, "#a94a3a", pat='knit', tail=True)
    h.head()
    h.hair_cap("#6a5a4a", hairline=0.3, back_len=-0.45, sides=-0.2, fringe=None)
    beard(h, "#8a7a68", length=0.42, width=0.72, mustache=True)
    brim_hat(h, "#5a4a3e", "#2a2420", brim=1.5, crown=0.75, z=0.66, tilt=-0.3)
    h.flags = dict(kind='legs', stride=0.9)
    h.portrait = dict(yaw=-22, scale=1.25, dz=-0.04)
    return h


def asaf():
    sp = dict(skin=SKIN['c'], R=0.245, iris="#4a3020", brow_col="#5a3020", lip="#b05a50", blush_amt=0.55, freckles=True,
              H=0.72, W=0.82, head=dict(jaw=0.24, cheek=0.06, nose=0.06, chin=0.03), eye_h=0.16, eye_w=0.13, flick=0.4,
              expr_over=dict(neutral=dict(mouth=('smirk', 0.12), br=(0.02, -0.03, 0.05))))
    h = Human(sp)
    h.legs("#4a5a7a", shoe="#5e3a22", P=dict(nu=24, fv=70), patch="#c98a4a", r=0.09)
    h.torso("#e8d6a8", pat='vstripes', color2="#c9a070", P=dict(nu=28, fv=60, thr=0.8), collar="#f6f0e0")
    suspenders(h, "#a94a3a")
    h.arms("#e8d6a8", pat='vstripes', color2="#c9a070", P=dict(nu=8, fv=60, thr=0.8), cuff="#f6f0e0")
    h.head()
    h.hair_cap("#6a3a20", hairline=0.55, back_len=-0.5, sides=-0.1, fringe=(9, 0.3), part=0.2)
    h.flat_cap("#4a6a8a", color2="#3a5068", tilt=-0.25, z=0.5)
    h.P['hat'].rotation_euler = (-0.25, 0.18, 0.3)
    h.flags = dict(kind='legs', stride=1.1)
    h.portrait = dict(yaw=-24, scale=1.0, dz=-0.05)
    h.sprite_expr = 'cheeky'
    return h


def hed():
    sp = dict(skin=SKIN['d'], R=0.25, iris="#4a3a2a", brow_col="#f0ece8", lip="#9a5048", blush_amt=0.5, H=0.9, W=1.15,
              head=dict(jaw=0.22, cheek=0.1, nose=0.17, chin=0.02, nose_w=0.13), eye_h=0.11, wrinkles=True, bushy=True,
              brow_w=0.07, brow_len=1.25, lash_w=0.04, flick=0.1, mouth_z=-0.47, eye_z=0.02,
              expr_over=dict(neutral=dict(mouth=('open', 0.1, 0.06), sq=0.3)))
    h = Human(sp)
    h.legs("#6a5a48", shoe="#3a2418", P=dict(nu=24, fv=60), r=0.09)
    h.coat_skirt("#c9b48a", length=0.14, flare=0.5)
    h.torso("#c9b48a", P=dict(nu=40, fv=60), collar="#f3e4c4", vest="#6a3f73", vest_pat='plaid', vest2="#8a5a8a", belly=0.04,
            buttons=("#e8b04a", 3))
    h.arms("#c9b48a", cuff="#a8946a")
    ear_horn(h, h.P['handL'])
    h.head(ears=2.1, ear_tint="#d8806a")
    h.hair_cap("#f0ece8", hairline=0.95, back_len=-0.35, sides=-0.05, fringe=None)
    beard(h, "#f4f0ec", length=0.38, width=0.72, mustache=True, mk=0.75, mz=-0.02)
    bucket_hat(h, "#b8a46a", z=0.68, brim=1.25, tilt=-0.18)
    h.flags = dict(kind='legs', stride=0.6, elder=True, hold='L')
    h.portrait = dict(yaw=-26, scale=1.4, dz=-0.02)
    return h


def noam():
    sp = dict(skin=SKIN['a'], R=0.245, iris="#3a5a6a", brow_col="#2a1a14", lip="#a05a54", blush_amt=0.35,
              head=dict(jaw=0.34, cheek=0.03, nose=0.1, chin=0.06), eye_h=0.14, lash_w=0.045, flick=0.3, H=1.05)
    h = Human(sp)
    h.legs("#3e4466", shoe="#4a2e20", P=dict(nu=24, fv=70), boots=True)
    h.coat_skirt("#5a3a2a", length=0.32, flare=0.55, pat='leather', P=dict(scale=20))
    h.torso("#5a3a2a", pat='leather', P=dict(scale=20), collar="#e8dcc4", buttons=("#c9a040", 4))
    h.arms("#5a3a2a", pat='leather', P=dict(scale=20), cuff="#3a2418")
    scarf_neck(h, "#4a78c8", pat='knit', tail=True)
    h.head()
    h.hair_cap("#2a1a14", hairline=0.55, back_len=-0.55, sides=-0.25, fringe=(6, 0.34), part=-0.3)
    h.flat_cap("#3e4466", color2="#2a2e48", tilt=-0.05, z=0.5)
    h.needle(h.P['handR'])
    h.flags = dict(kind='legs', stride=1.0)
    h.portrait = dict(yaw=-20, exprs=['neutral', 'happy', 'worried', 'surprised', 'sad', 'blink'])
    return h


# ---------------------------------------------------------------- NPC-only types
def child_girl():
    sp = dict(skin=SKIN['f'], R=0.24, iris="#3a2418", brow_col="#2a1810", lip="#a0504c", blush_amt=0.4, H=0.68, W=0.8,
              head=dict(jaw=0.24, cheek=0.06, nose=0.05), eye_h=0.17, eye_w=0.135, flick=0.9)
    h = Human(sp)
    h.feet_only(shoe="#a94a62")
    h.skirt("#e8b04a", pat='flowers', color2="#c44b3f", P=dict(nu=20, fv=40, rad=0.25), hem="#c44b3f", flare=1.1, folds=8)
    h.torso("#e8b04a", P=dict(nu=30, fv=70), collar="#fff8ec")
    h.arms("#fff8ec", cuff="#c44b3f")
    h.head()
    h.headscarf("#c44b3f", color2="#f8e0a0", pat='dots', P=dict(nu=18, fv=28, rad=0.16), z_front=0.56, tails=True)
    for s in (-1, 1):
        h.braid([(s * 0.75, 0.3, -0.5), (s * 0.85, 0.15, -0.9), (s * 0.85, 0.05, -1.25)], 0.2, "#2a1810", tie="#e8b04a")
    ellipsoid("flowerheld", 0.05, mat("#f6f0e6", kind='soft'), h.P['handR'], loc=(0, -0.04, 0.05), seg=10, rings=8)
    h.flags = dict(kind='dress', stride=1.1, hold='R')
    return h


def shepherd():
    sp = dict(skin=SKIN['b'], R=0.24, iris="#3a2a1a", brow_col="#2a1a10", lip="#9a4a40", blush_amt=0.35, H=1.05, W=0.95,
              head=dict(jaw=0.32, nose=0.1, chin=0.06), eye_h=0.13, flick=0.2)
    h = Human(sp)
    h.legs("#6a5a40", shoe="#4a2e1a", boots=True, P=dict(nu=24, fv=60))
    h.coat_skirt("#f0e6d0", length=0.28, flare=0.7, pat='wool', P=dict(scale=40))
    h.torso("#8a6a40", P=dict(nu=40, fv=60), vest="#f0e6d0", vest_pat='wool', collar="#e8dcc4", belt="#5e3a22")
    h.arms("#8a6a40", cuff="#6a5030")
    crook(h, h.P['handR'])
    h.head()
    h.hair_cap("#2a1a10", hairline=0.4, sides=-0.2, fringe=(5, 0.15))
    brim_hat(h, "#c9a860", "#6a4a2a", brim=1.9, crown=0.55, pat='straw', P=dict(radial=True, fv=80, nu=120), z=0.5)
    h.flags = dict(kind='legs', stride=0.9, hold='R')
    return h


def fisherman():
    sp = dict(skin=SKIN['e'], R=0.25, iris="#4a6a7a", brow_col="#c8c0b8", lip="#9a5048", blush_amt=0.55, H=0.98, W=1.15,
              head=dict(jaw=0.28, cheek=0.08, nose=0.15, chin=0.03), eye_h=0.11, wrinkles=True, lash_w=0.04, flick=0.1)
    h = Human(sp)
    h.legs("#3e5a66", shoe="#2a2a2a", boots=True, P=dict(nu=24, fv=60))
    h.torso("#2f5a7a", pat='knit', P=dict(nu=40, fv=50), collar="#2f5a7a", belly=0.03)
    h.arms("#2f5a7a", pat='knit', P=dict(nu=14, fv=50))
    rod(h, h.P['handR'])
    basket(h, h.P['upper'], (0.24, 0.05, -0.05), r=0.1, depth=0.1)
    h.head()
    beard(h, "#d8d2ca", length=0.5, width=0.78)
    # sou'wester rain hat
    R = h.R
    hm = mat("#e8b830", pat='leather', P=dict(scale=12), var=0.1)
    hat = pivot("hat", (0, 0.04 * R, 0.5 * R), h.P['head'], rot=(-0.2, 0, 0))
    loft("swbrim", [(0.0, R * 1.05, R * 1.05, 0, 0.0), (-0.12 * R, R * 1.4, R * 1.3, 0, 0.15 * R), (-0.3 * R, R * 1.6, R * 1.5, 0, 0.3 * R),
                    (-0.32 * R, R * 1.58, R * 1.48, 0, 0.3 * R)], hm, hat, seg=48)
    blob("swcrown", R * 1.05, hm, hat, loc=(0, 0, 0.0), scale=(1, 1, 0.7), deform=lambda p: Vector((p.x, p.y, max(p.z, 0.0))), seg=32, rings=20)
    h.flags = dict(kind='legs', stride=0.75, hold='R')
    return h


def bell_ringer():
    sp = dict(skin=SKIN['g'], R=0.235, iris="#5a4a6a", brow_col="#6a5a5a", lip="#a05a5a", blush_amt=0.4, H=1.1, W=0.82,
              head=dict(jaw=0.36, nose=0.12, chin=0.05, tall=1.06), eye_h=0.12, wrinkles=True, lash_w=0.042, flick=0.4)
    h = Human(sp)
    h.feet_only(shoe="#2a1a14")
    h.skirt("#3e3466", pat='weave', P=dict(nu=60, fv=70), hem="#e0b040", flare=0.7, folds=14)
    h.torso("#3e3466", collar=CREAM, belt="#e0b040")
    h.arms("#3e3466", cuff=CREAM)
    hand_bell(h, h.P['handR'])
    rope = mat("#c9a870", pat='spiral', color2="#a8885a", P=dict(nu=4, fv=120))
    tube("ropecoil", [Vector((0.2 * math.cos(TAU * i / 12), -0.03 + 0.2 * math.sin(TAU * i / 12) * 0.3, 0.05 + 0.006 * i))
                      for i in range(13)], [0.015], rope, h.P['upper'], seg=6, sub=2)
    h.head()
    h.headscarf("#e8dcc4", color2="#c9b48a", pat='vstripes', P=dict(nu=30, fv=30, thr=0.8), z_front=0.55)
    h.wide_hat("#3e3466", "#e0b040", crown_h=0.7, brim=1.45, tilt=-0.1, pat='leather', P=dict(scale=20), bow=False, droop=0.03,
               z=0.62, crown_r=1.12)
    h.flags = dict(kind='dress', stride=0.8, hold='R')
    return h


def spool_gatherer():
    sp = dict(skin=SKIN['f'], R=0.245, iris="#2a1a10", brow_col="#1a1010", lip="#8a4040", blush_amt=0.35, H=1.0, W=1.05,
              head=dict(jaw=0.3, cheek=0.06, nose=0.09), eye_h=0.14, flick=0.8)
    h = Human(sp)
    h.feet_only(shoe="#5e3a22")
    h.skirt("#4f9a4f", pat='stripes', color2="#2f6b48", P=dict(nu=40, fv=12, thr=0.82), hem="#e8b04a", flare=0.95, folds=10)
    h.apron("#e8c070", pat='weave', length=0.4, width=0.8)
    h.torso("#c98a4a", P=dict(nu=40, fv=60), collar=CREAM)
    h.arms("#c98a4a", cuff=CREAM)
    basket(h, h.P['handL'], (0.08, -0.1, -0.06), r=0.13, depth=0.11, contents=spools)
    h.head()
    h.headscarf("#e8b04a", color2="#c44b3f", pat='flowers', P=dict(nu=20, fv=26, rad=0.3), z_front=0.5)
    h.flags = dict(kind='dress', stride=0.95, hold='L')
    return h


def innkeeper():
    sp = dict(skin=SKIN['d'], R=0.255, iris="#3a2a1a", brow_col="#2a1a10", lip="#9a4a40", blush_amt=0.5, H=1.0, W=1.35,
              head=dict(jaw=0.2, cheek=0.1, nose=0.13), eye_h=0.12, lash_w=0.045, flick=0.1, mouth_z=-0.46)
    h = Human(sp)
    h.legs("#3a3040", shoe="#2a1a14", P=dict(nu=24, fv=60), r=0.1)
    h.torso("#f0e6d0", P=dict(nu=40, fv=60), vest="#a94a3a", vest_pat='weave', collar="#f0e6d0", belly=0.07,
            buttons=("#e8b04a", 3))
    h.apron("#d8c8a8", parent=h.P['upper'], top_z=0.05, length=0.42, width=0.9)
    h.arms("#f0e6d0", cuff="#d8c8a8")
    mug_tray(h, h.P['handL'])
    h.head()
    h.hair_cap("#1a1010", hairline=0.35, back_len=-0.45, sides=-0.2, fringe=None)
    beard(h, "#1a1010", length=0.48, width=0.82)
    soft_cap(h, "#3a3040", z=0.6, puff=1.1, tilt=-0.08, side=0.0)
    h.flags = dict(kind='legs', stride=0.7, hold='L')
    return h


def merchant():
    sp = dict(skin=SKIN['c'], R=0.245, iris="#4a5a3a", brow_col="#8a7060", lip="#9a5048", blush_amt=0.45, H=1.02, W=1.05,
              head=dict(jaw=0.3, cheek=0.07, nose=0.16, chin=0.05), eye_h=0.12, wrinkles=True, lash_w=0.04, flick=0.1)
    h = Human(sp)
    h.legs("#6a4a3a", shoe="#3a2418", boots=True, P=dict(nu=24, fv=60))
    h.coat_skirt("#2f7d6f", length=0.36, flare=0.7, pat='plaid', color2="#e8b04a", P=dict(nu=16, fv=16, thr=0.85))
    h.torso("#2f7d6f", pat='plaid', color2="#e8b04a", P=dict(nu=16, fv=16, thr=0.85), collar=CREAM, belt="#5e3a22")
    h.arms("#2f7d6f", pat='plaid', color2="#e8b04a", P=dict(nu=6, fv=16, thr=0.85), cuff="#5e3a22")
    backpack(h)
    h.head()
    beard(h, "#9a8070", length=0.36, width=0.7, mustache=True)
    h.wide_hat("#8a3f55", "#e8b04a", crown_h=0.62, brim=1.9, tilt=-0.08, pat='leather', P=dict(scale=18), bow=False, droop=0.12,
               wav=0.04, z=0.5, flower=["#e8b04a"])
    h.flags = dict(kind='legs', stride=0.8, stoop=0.1)
    return h


def bard():
    sp = dict(skin=SKIN['b'], R=0.24, iris="#2a4a3a", brow_col="#3a2018", lip="#b05058", blush_amt=0.45, H=1.0, W=0.9,
              head=dict(jaw=0.32, cheek=0.05, nose=0.08), eye_h=0.15, flick=1.1)
    h = Human(sp)
    h.feet_only(shoe="#5e3a22")
    h.skirt("#3e7d8a", pat='weave', P=dict(nu=60, fv=70), hem="#e8b04a", hem2="#a94a62", flare=1.0, folds=12)
    h.torso("#a94a62", P=dict(nu=40, fv=70), collar=CREAM, belt="#e8b04a")
    h.arms("#a94a62", cuff="#e8b04a")
    lute(h, h.P['upper'], (0.02, -0.24, 0.05), (0.15, 0.9, 0.2))
    h.head()
    h.headscarf("#2f4a6a", color2="#e8b04a", pat='dots', P=dict(nu=20, fv=26, rad=0.12), z_front=0.5)
    soft_cap(h, "#6a3f73", z=0.7, puff=1.2, tilt=-0.1, side=0.25)
    ellipsoid("feather", 0.05, mat("#e8b04a", kind='soft'), h.P['hat'], loc=(0.28, 0.1, 0.25), scale=(0.5, 0.4, 2.4),
              rot=(0.3, 0.5, 0))

    def pf(h, anim, i, n):
        P = h.P
        P['armR'].rotation_euler = (-0.5, 0, -0.25)
        P['elbowR'].rotation_euler = (-1.3, 0, 0.3)
        P['armL'].rotation_euler = (-0.6, 0, 0.3)
        P['elbowL'].rotation_euler = (-1.0 - 0.06 * math.sin(TAU * i / n), 0, -0.4)
    h.flags = dict(kind='dress', stride=0.9, pose_fn=pf)
    return h


def warden():
    sp = dict(skin="#1a1420", R=0.25, noface=True, H=1.25, W=1.0, head=dict(jaw=0.3, nose=0.05))
    h = Human(sp)
    h.legs("#1e1a26", shoe="#141018", boots=True)
    h.torso("#2a2436", P=dict(nu=40, fv=50))
    cm = h.hood_cloak("#2e2a40", length=1.0, pat='weave', P=dict(nu=50, fv=50))
    h.arms("#2e2a40", cuff="#1e1a26", r=0.07)
    lantern(h, h.P['handR'], color="#9ff0e0")
    h.head(ears=0)
    R = h.R
    # deep hood: shell around the head, open at the front, black inside
    hood = blob("hood", R * 1.32, cm, h.P['head'], loc=(0, R * 0.12, R * 0.05), scale=(1.0, 1.05, 1.1),
                deform=lambda p: Vector((p.x, p.y if p.y > -0.55 else -0.55 - (p.y + 0.55) * 0.3, p.z)), seg=40, rings=28)
    ellipsoid("void", R * 1.05, mat("#08060c", kind='flat', rim=0, ao=0, line=False), h.P['head'], loc=(0, -R * 0.08, 0),
              scale=(0.92, 0.9, 1.0), seg=24, rings=16)
    for s in (-1, 1):   # two faint glints in the dark (no expression)
        ellipsoid("glint", R * 0.045, glow("#7fe0d0", 1.2), h.P['head'], loc=(s * R * 0.3, -R * 0.92, R * 0.0), seg=8, rings=6)
    h.wide_hat("#1e1a2a", "#3a3450", crown_h=0.6, brim=2.25, tilt=-0.05, pat='leather', P=dict(scale=18), bow=False,
               droop=0.14, wav=0.03, z=0.75, crown_r=1.2)
    h.flags = dict(kind='legs', stride=0.7, hold='R')
    return h


CAST = dict(shoshana=shoshana, miriam=miriam, hillel=hillel, miller=miller, asaf=asaf, hed=hed, noam=noam,
            child_girl=child_girl, shepherd=shepherd, fisherman=fisherman, bell_ringer=bell_ringer,
            spool_gatherer=spool_gatherer, innkeeper=innkeeper, merchant=merchant, bard=bard, warden=warden)
