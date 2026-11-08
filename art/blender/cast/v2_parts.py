"""Body, clothing, headwear and prop parts for v2 humans.

Skeleton (pivot empties, no armature):  root (direction) > body (bob) >
  legL/legR (hip) > kneeL/kneeR > foot ; skirt (waist) ;
  upper (waist, lean) > armL/armR (shoulder) > elbow > hand ; neck > head
All humans obey the modesty rules: long sleeves, high necklines, ankle-length skirts or long
trousers, head covering or hat for women and girls.
"""
import math

import bpy
from mathutils import Vector

from v2lib import *
from v2lib import _MAT, _col4
from v2_face import head_mesh, skin_mat, Face


def _smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def hair_deform(hairline, back_len, sides, fringe, part, shrink=0.3):
    """Sphere -> hair shell: everything below the (scalloped) hairline is pulled inside the skull,
    which gives a smooth natural hairline and pointed fringe clumps."""
    def f(p):
        x, y, z = p.x, p.y, p.z
        if fringe:
            n, depth = fringe
            zl = hairline - depth * (0.5 + 0.5 * math.cos(n * math.pi * (x + part) / 1.6)) ** 2 - 0.3 * x * x
        else:
            zl = hairline - 0.4 * x * x
        front = _smooth(-0.1, -0.5, y)
        back = _smooth(0.0, 0.4, y)
        zcut = zl * front + sides * (1 - front)
        zcut = zcut * (1 - back) + back_len * back
        k = _smooth(-0.015, 0.05, zcut - z)
        return p * (1 - shrink * k)
    return f


def _catmull_pts(pts, sub):
    from v2lib import _catmull
    return _catmull(pts, sub)


def darker(h, k=0.7):
    return lin2hex(tuple(c * k for c in hexlin(h)))


def lighter(h, k=0.25):
    return lin2hex(tuple(c + (1 - c) * k for c in hexlin(h)))


class Human:
    def __init__(self, sp):
        self.sp = sp
        H, W = sp.get('H', 1.0), sp.get('W', 1.0)
        self.H, self.W = H, W
        self.R = sp.get('R', 0.25)
        self.P = {}
        P = self.P
        P['root'] = pivot("root")
        P['body'] = pivot("body", parent=P['root'])
        self.hip_z = 0.50 * H
        self.waist_z = 0.60 * H
        self.thigh = 0.25 * H
        self.shin = 0.22 * H
        self.torso_h = 0.34 * H * sp.get('torso_k', 1.0)
        self.shoulder_w = 0.2 * W * sp.get('shoulder_k', 1.0)
        P['upper'] = pivot("upper", (0, 0, self.waist_z), P['body'])
        self.glows = []
        self.lights = []

    # ------------------------------------------------------------ legs
    def legs(self, trouser, shoe="#5e3a22", trouser2=None, cuff=None, pat='weave', P=None, boots=False, r=0.085,
             patch=None):
        H, W = self.H, self.W
        tm = mat(trouser, pat=pat, color2=trouser2, P=P or dict(nu=30, fv=60), var=0.12)
        sm = mat(shoe, pat='leather', kind='cloth', var=0.12, bump=0.4)
        for nm, sx in (("L", 1), ("R", -1)):
            hip = pivot("leg" + nm, (sx * 0.095 * W, 0, self.hip_z), self.P['body'])
            loft("thigh", [(0.05, r * W * 1.05, r * W), (0, r * W, r * W * 0.95), (-self.thigh, r * W * 0.82, r * W * 0.8)],
                 tm, hip, seg=18, cap_top=True)
            knee = pivot("knee" + nm, (0, 0, -self.thigh), hip)
            ellipsoid("kneecap", r * W * 0.84, tm, knee, seg=16, rings=10)
            loft("shin", [(0, r * W * 0.8, r * W * 0.78), (-self.shin + 0.05, r * W * 0.72, r * W * 0.7),
                          (-self.shin + 0.03, r * W * 0.78, r * W * 0.76)], tm, knee, seg=18)
            if patch and nm == "L":
                ellipsoid("patch", r * W * 0.5, mat(patch, pat='plaid', color2=darker(patch, 0.7), P=dict(nu=8, fv=60)),
                          knee, loc=(0, -r * W * 0.7, -0.02), scale=(0.9, 0.35, 0.9), seg=14, rings=8)
                stitches("pst", r * W * 0.47, 0.0, 10, mat("#f3e4c4", kind='soft', rim=0, ao=0), knee, size=0.008,
                         ry=r * W * 0.47).location = (0, -r * W * 0.78, -0.02)
            if cuff:
                loft("cuff", [(-self.shin + 0.06, r * W * 0.8, r * W * 0.78), (-self.shin + 0.02, r * W * 0.82, r * W * 0.8)],
                     mat(cuff), knee, seg=18)
            foot = pivot("foot" + nm, (0, 0, -self.shin), knee)
            self.shoe(foot, sm, boots)
            self.P['leg' + nm], self.P['knee' + nm], self.P['foot' + nm] = hip, knee, foot

    def shoe(self, foot, sm, boots=False):
        W = self.W
        blob("shoe", 0.075 * W, sm, foot, loc=(0, -0.035, -0.0),
             scale=(0.95, 1.55, 0.62), deform=lambda p: Vector((p.x, p.y, p.z if p.z > -0.2 else -0.2 - (p.z + 0.2) * 0.2)),
             seg=24, rings=14)
        loft("sole", [(-0.045, 0.072 * W, 0.11 * W, 0, -0.035), (-0.03, 0.074 * W, 0.115 * W, 0, -0.035)],
             mat("#3a2418", kind='cloth'), foot, seg=20, cap_bot=True)
        if boots:
            loft("boot", [(-0.03, 0.07 * W, 0.068 * W), (0.12, 0.072 * W, 0.07 * W), (0.14, 0.078 * W, 0.076 * W)],
                 sm, foot, seg=18)

    def feet_only(self, shoe="#5e3a22", hidden_leg="#4a3a40"):
        """Dress wearers: legs (thin dark stockings) whose shoes peek out under the hem."""
        H, W = self.H, self.W
        sm = mat(shoe, pat='leather', var=0.12, bump=0.4)
        lm = mat(hidden_leg, pat='knit', P=dict(nu=20, fv=80), var=0.1)
        for nm, sx in (("L", 1), ("R", -1)):
            hip = pivot("leg" + nm, (sx * 0.085 * W, 0, self.hip_z), self.P['body'])
            loft("thigh", [(0, 0.07, 0.07), (-self.thigh, 0.055, 0.055)], lm, hip, seg=12, line=False)
            knee = pivot("knee" + nm, (0, 0, -self.thigh), hip)
            loft("shin", [(0, 0.055, 0.055), (-self.shin + 0.03, 0.048, 0.048)], lm, knee, seg=12, line=False)
            foot = pivot("foot" + nm, (0, 0, -self.shin), knee)
            self.shoe(foot, sm)
            self.P['leg' + nm], self.P['knee' + nm], self.P['foot' + nm] = hip, knee, foot

    # ------------------------------------------------------------ lower garments
    def skirt(self, color, pat='weave', color2=None, P=None, hem=None, hem2=None, flare=1.0, folds=10, length=None,
              stitch=True, name="skirt"):
        H, W = self.H, self.W
        L = length if length is not None else self.waist_z - 0.035 * H
        sk = pivot(name, (0, 0, self.waist_z), self.P['body'])
        m = mat(color, pat=pat, color2=color2, P=P or dict(nu=48, fv=70), var=0.12)
        rw = 0.185 * W
        rings = []
        N = 9
        for k in range(N + 1):
            t = k / N
            r = rw + (0.17 * flare * W) * (t ** 0.9)
            rings.append((-L * t, r, r * 0.86))
        self.skirt_phase = 0.0

        def fold(a, t):
            return 1 + 0.055 * (t ** 1.3) * math.sin(folds * a + 0.6) + 0.02 * t * math.sin(3 * a + 1.3)
        loft("dress", rings, m, sk, seg=72, folds=fold)
        rh = rings[-1][1]
        if hem:
            loft("hem", [(-L + 0.075 * H, rh * 0.985, rh * 0.86 * 0.985), (-L - 0.005, rh * 1.012, rh * 0.86 * 1.012)],
                 mat(hem, pat=('stripes' if hem2 else 'weave'), color2=hem2, P=dict(nu=48, fv=120, thr=0.6)),
                 sk, seg=72, folds=lambda a, t: fold(a, 1.0))
            if stitch:
                stitches("hst", rh * 1.035, -L + 0.085 * H, 64, mat("#f6e7c8", kind='soft', rim=0, ao=0), sk,
                         ry=rh * 0.86 * 1.035, size=0.011)
        self.P['skirt'] = sk
        self.skirt_r = rh
        return sk

    def coat_skirt(self, color, length, pat='weave', P=None, color2=None, flare=0.5, buttons=None):
        H, W = self.H, self.W
        sk = pivot("coat", (0, 0, self.waist_z + 0.02), self.P['body'])
        m = mat(color, pat=pat, color2=color2, P=P or dict(nu=40, fv=60), var=0.12)
        rings = []
        for k in range(7):
            t = k / 6
            r = 0.19 * W + 0.09 * flare * W * t
            rings.append((-length * t, r, r * 0.85))
        loft("coatsk", rings, m, sk, seg=56, folds=lambda a, t: 1 + 0.04 * t * math.sin(7 * a + 0.5))
        # front opening line
        loft("opening", [(0, 0.012, 0.012, 0, -0.185 * W * 0.86), (-length, 0.012, 0.012, 0, -(0.19 + 0.09 * flare) * W * 0.85)],
             mat(darker(color, 0.5), kind='flat'), sk, seg=6, line=False)
        self.P['skirt'] = sk
        return sk

    def apron(self, color, top_z=0.0, length=None, pat='weave', color2=None, P=None, width=0.95, pocket=None,
              parent=None, bib=False):
        H, W = self.H, self.W
        L = length if length is not None else self.waist_z - 0.12 * H
        par = parent or self.P.get('skirt') or self.P['upper']
        m = mat(color, pat=pat, color2=color2, P=P or dict(nu=30, fv=70), var=0.1)
        rings = []
        for k in range(7):
            t = k / 6
            r = (0.195 + 0.16 * t) * W * 1.04
            rings.append((top_z - L * t, r, r * 0.88))
        loft("apron", rings, m, par, seg=24, arc=(-math.pi / 2 - width, -math.pi / 2 + width),
             folds=lambda a, t: 1.02 + 0.03 * t * math.sin(5 * a))
        if pocket:
            p = ellipsoid("pocket", 0.07 * W, mat(pocket, pat='weave', P=dict(nu=10, fv=90)), par,
                          loc=(0.1 * W, -0.25 * W, top_z - L * 0.45), scale=(1.0, 0.28, 0.8), seg=16, rings=8)
        if bib:
            loft("bib", [(0.02, 0.2 * W * 1.04, 0.15 * W * 1.06), (0.22 * H, 0.19 * W * 1.04, 0.152 * W * 1.05)], m,
                 self.P['upper'], seg=20, arc=(-math.pi / 2 - 0.7, -math.pi / 2 + 0.7))
        # waist ties
        tie = mat(color, pat='weave', P=dict(nu=30, fv=70))
        return m

    # ------------------------------------------------------------ torso / arms
    def torso(self, color, pat='weave', color2=None, P=None, collar=None, belt=None, buttons=None, bulk=1.0,
              belly=0.0, vest=None, vest_pat=None, vest2=None):
        H, W = self.H, self.W
        up = self.P['upper']
        th = self.torso_h
        m = mat(color, pat=pat, color2=color2, P=P or dict(nu=36, fv=60), var=0.12)
        b = bulk

        def ring(t, rx, ry, dy=0.0):
            return (th * t, rx * W * b, ry * W * b, 0, dy)
        rings = [ring(-0.06, 0.185, 0.15), ring(0.15, 0.19 + belly * 0.5, 0.155 + belly, -belly * 0.4),
                 ring(0.45, 0.195 + belly * 0.4, 0.16 + belly * 0.8, -belly * 0.3), ring(0.68, 0.19, 0.15),
                 ring(0.8, 0.175, 0.135), ring(0.9, 0.14, 0.11), ring(0.97, 0.095, 0.08), ring(1.01, 0.07, 0.065)]
        loft("torso", rings, m, up, seg=40, cap_top=True)
        self.chest_r = 0.2 * W * b
        if vest:
            vm = mat(vest, pat=vest_pat or 'weave', color2=vest2, P=dict(nu=30, fv=60), var=0.14)
            vr = [(th * t, rx * W * b * 1.05, ry * W * b * 1.07, 0, dy) for (t, rx, ry, dy) in
                  [(-0.02, 0.195, 0.155, 0), (0.15, 0.2 + belly * 0.5, 0.16 + belly, -belly * 0.4),
                   (0.45, 0.205 + belly * 0.4, 0.165 + belly * 0.8, -belly * 0.3), (0.78, 0.2, 0.15, 0),
                   (0.9, 0.17, 0.125, 0)]]
            loft("vest", vr, vm, up, seg=40, arc=(-math.pi / 2 + 0.28, 3 * math.pi / 2 - 0.28))
        if collar:
            loft("collar", [(th * 0.93, 0.105 * W, 0.09 * W), (th * 1.06, 0.098 * W, 0.084 * W), (th * 1.1, 0.104 * W, 0.09 * W)],
                 mat(collar, pat='weave', P=dict(nu=24, fv=120)), up, seg=28)
        if belt:
            loft("belt", [(th * 0.0, 0.198 * W * b, 0.158 * W * b), (th * 0.13, 0.2 * W * b, 0.16 * W * b)],
                 mat(belt, pat='leather', var=0.15), up, seg=40)
        if buttons:
            for i in range(buttons[1]):
                t = 0.25 + 0.6 * i / max(1, buttons[1] - 1)
                ellipsoid("button", 0.018, mat(buttons[0], metal=True, kind='cloth', line=False), up,
                          loc=(0, -(0.16 + belly * 0.6) * W * b - 0.006, th * t), scale=(1, 0.5, 1), seg=10, rings=6)
        self.P['neck_base'] = th * 1.0

    def arms(self, sleeve, cuff=None, skin=None, pat='weave', P=None, color2=None, puff=1.0, r=0.062, glove=None):
        H, W = self.H, self.W
        up = self.P['upper']
        sm = mat(sleeve, pat=pat, color2=color2, P=P or dict(nu=16, fv=70), var=0.12)
        skin = skin or self.sp['skin']
        hm = mat(glove or skin, kind='skin' if not glove else 'cloth', pat='skin' if not glove else 'knit',
                 var=0.05, rim=0.4)
        ua, fa = 0.2 * H, 0.18 * H
        for nm, sx in (("L", 1), ("R", -1)):
            sh = pivot("arm" + nm, (sx * self.shoulder_w * 0.86, 0, self.torso_h * 0.76), up)
            ellipsoid("shoulder", r * W * 1.1 * puff, sm, sh, loc=(-sx * 0.012, 0, 0.01), scale=(1.15, 1, 0.9), seg=20, rings=12)
            loft("upperarm", [(0.0, r * W * 1.15 * puff, r * W * 1.1 * puff), (-ua * 0.5, r * W * 1.0, r * W * 0.98),
                              (-ua, r * W * 0.92, r * W * 0.9)], sm, sh, seg=18)
            el = pivot("elbow" + nm, (0, 0, -ua), sh)
            ellipsoid("elbowj", r * W * 0.9, sm, el, seg=16, rings=10)
            loft("forearm", [(0, r * W * 0.9, r * W * 0.88), (-fa + 0.03, r * W * 0.85, r * W * 0.82),
                             (-fa + 0.005, r * W * 1.0, r * W * 0.98)], sm, el, seg=18)
            if cuff:
                loft("cuff", [(-fa + 0.04, r * W * 0.98, r * W * 0.96), (-fa - 0.005, r * W * 1.04, r * W * 1.02)],
                     mat(cuff, pat='weave', P=dict(nu=16, fv=100)), el, seg=18)
            hd = pivot("hand" + nm, (0, 0, -fa - 0.01), el)
            blob("palm", 0.05 * W, hm, hd, loc=(0, 0, -0.03), scale=(0.85, 0.62, 1.0), seg=20, rings=12)
            ellipsoid("thumb", 0.022 * W, hm, hd, loc=(-sx * 0.0, -0.035, -0.015), scale=(1, 1, 1.4), seg=10, rings=8)
            self.P['arm' + nm], self.P['elbow' + nm], self.P['hand' + nm] = sh, el, hd

    # ------------------------------------------------------------ head
    def head(self, prm=None, ears=1.0, ear_tint=None, neck=True):
        sp = self.sp
        R = self.R
        up = self.P['upper']
        if neck:
            loft("neck", [(self.torso_h * 0.9, 0.062, 0.058), (self.torso_h * 1.0 + 0.12, 0.056, 0.054)],
                 mat(sp['skin'], kind='skin', rim=0.2), up, seg=16, line=False)
        hz = self.torso_h * 1.0 + 0.06 + R * 0.8
        hp = pivot("head", (0, -0.01, hz), up)
        sm = skin_mat(sp['skin'], sp.get('blush', "#e6827a"), sp.get('blush_amt', 0.45), R,
                      freckles=sp.get('freckles', False))
        h = head_mesh("skull", R, hp, (0, 0, 0), prm or sp.get('head', {}), sm)
        self.skin_m = sm
        if ears > 0:
            em = mat(ear_tint or sp['skin'], kind='skin', rim=0.4, var=0.04)
            for s in (-1, 1):
                e = blob("ear", R * 0.2 * ears, em, hp, loc=(s * R * 0.96, R * 0.04, -R * 0.06),
                         scale=(0.42, 0.75, 1.0), rot=(0, s * 0.15, s * -0.25), seg=20, rings=14)
                ellipsoid("earin", R * 0.11 * ears, mat(darker(sp['skin'], 0.62), kind='skin', rim=0, line=False), hp,
                          loc=(s * R * (0.99 + 0.06 * (ears - 1)), R * 0.0, -R * 0.06), scale=(0.25, 0.6, 0.95),
                          rot=(0, s * 0.15, s * -0.25), seg=14, rings=10)
        self.P['head'] = hp
        self.head_obj = h
        self.face = Face(h, R, sp)
        return hp

    # ------------------------------------------------------------ hair
    def hair_cap(self, color, hairline=0.42, back_len=-0.35, sides=-0.05, scale=1.05, pat='hair', P=None, part=0.0,
                 fringe=(7, 0.16)):
        R = self.R
        hm = mat(color, pat=pat, P=P or dict(nu=90, wave=1.0), kind='hair', var=0.32, bump=0.5)

        o = blob("hair", R * scale, hm, self.P['head'], loc=(0, R * 0.02, R * 0.02), seg=112, rings=72,
                 deform=hair_deform(hairline, back_len, sides, fringe, part))
        o["line_k"] = 0.9
        return o

    def lock(self, pts, r0, r1, color, flat=0.55, P=None, name="lock"):
        hm = mat(color, pat='strands_z', P=P or dict(nu=10, fv=10), kind='hair', var=0.3, bump=0.4)
        R = self.R
        return tube(name, [Vector(p) * R for p in pts], [r0 * R, r1 * R * 1.2, r1 * R * 0.5], hm, self.P['head'],
                    seg=10, sub=5, flat=flat)

    def braid(self, pts, r, color, tie=None):
        """Segmented braid: overlapping tilted lobes along a path (head-local, units of R)."""
        R = self.R
        hm = mat(color, pat='hair', kind='hair', P=dict(nu=30), var=0.3, bump=0.5)
        C = _catmull_pts([Vector(p) * R for p in pts], 4)
        L = sum((C[i + 1] - C[i]).length for i in range(len(C) - 1))
        n = max(3, int(L / (r * R * 1.1)))
        acc, k = 0.0, 0
        for i in range(n):
            t = i / (n - 1)
            pos = C[min(len(C) - 1, int(t * (len(C) - 1)))]
            rr = r * R * (1 - 0.35 * t)
            o = ellipsoid("braid", rr, hm, self.P['head'], loc=pos, scale=(1.0, 0.8, 1.25),
                          rot=(0, 0.45 * (1 if i % 2 else -1), 0), seg=14, rings=10)
        if tie:
            ellipsoid("tie", r * R * 0.55, mat(tie, pat='weave'), self.P['head'], loc=C[-1] + Vector((0, 0, -0.01)),
                      scale=(1.3, 1.3, 0.6), seg=12, rings=8)
            for s_ in (-1, 1):
                tube("tietail", [C[-1], C[-1] + Vector((s_ * 0.03, -0.01, -0.05))], [0.012, 0.008],
                     mat(tie, pat='weave'), self.P['head'], seg=6, sub=1, flat=0.4)

    def fringe(self, color, n=7, z=0.52, spread=0.8, length=0.3, curl=0.1, y=-0.9, flat=0.5, r=0.13):
        for i in range(n):
            u = -spread + 2 * spread * i / max(1, n - 1)
            x = u * 0.85
            yy = y * math.cos(u * 0.9)
            p0 = (x, yy + 0.05, z + 0.1)
            p1 = (x * 1.05 + curl * 0.3, yy - 0.04, z - length * 0.5)
            p2 = (x * 1.1 + curl, yy + 0.02 - 0.05 * abs(u), z - length)
            self.lock([p0, p1, p2], r, r * 0.7, color, flat=flat)

    # ------------------------------------------------------------ headwear
    def wide_hat(self, color, band, crown_h=0.55, brim=1.95, tilt=-0.12, pat='straw', flower=None, bow=True,
                 band2=None, droop=0.08, color2=None, crown_r=1.06, wav=0.025, P=None, z=0.55, yoff=0.0):
        R = self.R
        hat = pivot("hat", (0, yoff * R, z * R), self.P['head'], rot=(tilt, 0, 0))
        hm = mat(color, pat=pat, color2=color2, P=P or dict(radial=True, fv=95, nu=120), var=0.3, bump=0.6)
        cr = crown_r * R
        br = brim * R
        prof = [(0.0, cr * 0.98), (-0.02 * R, cr * 1.15), (-0.05 * R - droop * R * 0.3, br * 0.7),
                (-0.07 * R - droop * R, br * 0.97), (-0.095 * R - droop * R, br),
                (-0.11 * R - droop * R, br * 0.96), (-0.1 * R - droop * R * 0.6, br * 0.7), (-0.07 * R, cr * 1.05)]
        loft("brim", [(z, r, r) for (z, r) in prof], hm, hat, seg=72,
             folds=lambda a, t: 1 + wav * math.sin(2 * a + 0.4) * min(1, t * 3) + 0.012 * math.sin(5 * a))
        ch = crown_h * R
        loft("crown", [(-0.02 * R, cr, cr * 0.97), (ch * 0.5, cr * 0.97, cr * 0.94), (ch * 0.85, cr * 0.86, cr * 0.83),
                       (ch, cr * 0.6, cr * 0.58), (ch * 1.05, cr * 0.2, cr * 0.2)], hm, hat, seg=56, cap_top=True,
             folds=lambda a, t: 1 - 0.05 * t * max(0, math.cos(a - math.pi / 2)) ** 8)  # pinch at the back
        bm = mat(band, pat='stripes' if band2 else 'weave', color2=band2, P=dict(nu=40, fv=160, thr=0.7), var=0.1)
        loft("band", [(0.0, cr * 1.015, cr * 0.985), (ch * 0.36, cr * 1.0, cr * 0.97)], bm, hat, seg=56)
        if bow:
            a = math.radians(-35)
            bx, by = math.cos(a) * cr * 1.02, math.sin(a) * cr * 1.0
            ellipsoid("bowknot", R * 0.08, bm, hat, loc=(bx, by, ch * 0.18), scale=(0.7, 0.7, 1), seg=12, rings=8)
            for s in (-1, 1):
                ellipsoid("bowloop", R * 0.11, bm, hat, loc=(bx + s * R * 0.08 * 0.6, by - s * R * 0.08 * 0.8, ch * 0.2),
                          scale=(1.0, 0.35, 0.6), rot=(0, 0, a + math.pi / 2), seg=14, rings=8)
            tube("bowtail", [Vector((bx, by, ch * 0.12)), Vector((bx + 0.02 * R, by - 0.05 * R, -0.1 * R)),
                             Vector((bx + 0.06 * R, by - 0.02 * R, -0.3 * R))], [R * 0.05, R * 0.045, R * 0.03], bm, hat,
                 seg=8, flat=0.25)
        if flower:
            a0 = math.radians(-60)
            for k, c in enumerate(flower):
                a = a0 + k * 0.32
                fx, fy = math.cos(a) * cr * 1.04, math.sin(a) * cr * 1.02
                fm = mat(c, kind='soft', rim=0.3)
                for pk in range(5):
                    pa = pk * TAU / 5
                    ellipsoid("petal", R * 0.06, fm, hat, loc=(fx + math.cos(pa) * R * 0.05 * -math.sin(a),
                                                               fy + math.cos(pa) * R * 0.05 * math.cos(a),
                                                               ch * 0.25 + math.sin(pa) * R * 0.05),
                              scale=(0.8, 0.8, 0.8), seg=10, rings=6)
                ellipsoid("fc", R * 0.04, mat("#ffd25a", kind='soft'), hat, loc=(fx * 1.03, fy * 1.03, ch * 0.25),
                          seg=8, rings=6)
        self.P['hat'] = hat
        return hat

    def flat_cap(self, color, color2=None, tilt=-0.08, visor=1.0, button=True, pat='plaid', z=0.42):
        R = self.R
        cap = pivot("cap", (0, -0.02 * R, z * R), self.P['head'], rot=(tilt, 0, 0))
        cm = mat(color, pat=pat, color2=color2 or darker(color, 0.75), P=dict(nu=36, fv=55, thr=0.8), var=0.18, bump=0.4)

        def deform(p):
            q = Vector(p)
            if q.y < 0:
                q.y *= 1.18
            if q.z < 0:
                q.z *= 0.2
            return q
        blob("capdome", R * 1.12, cm, cap, loc=(0, -0.04 * R, 0.08 * R), scale=(1.0, 1.0, 0.5), deform=deform, seg=48, rings=24)
        loft("capband", [(-0.04 * R, R * 1.06, R * 1.08, 0, -0.03 * R), (0.1 * R, R * 1.1, R * 1.13, 0, -0.04 * R)],
             cm, cap, seg=48)
        # panel seams
        sm = mat(darker(color, 0.55), kind='flat', rim=0, ao=0)
        for k in range(6):
            a = k * TAU / 6 + 0.3
            pts = [Vector((math.cos(a) * R * 1.1 * u, math.sin(a) * R * 1.12 * u * (1.18 if math.sin(a) < 0 else 1) - 0.04 * R,
                           0.08 * R + R * 0.52 * math.sqrt(max(0, 1 - u * u)) + 0.006)) for u in (0.0, 0.35, 0.7, 0.98)]
            tube("seam", pts, [0.006 * R / 0.25], sm, cap, seg=5, sub=3, line=False)
        # visor
        vm = mat(darker(color, 0.85), pat='weave', P=dict(nu=30, fv=60), var=0.1)
        vis = blob("visor", R, vm, cap, loc=(0, -R * 0.92, -0.02 * R), scale=(0.72 * visor, 0.5 * visor, 0.07),
                   deform=lambda p: Vector((p.x, min(p.y, 0.25), p.z)), rot=(-0.12, 0, 0), seg=32, rings=12)
        if button:
            ellipsoid("capbtn", R * 0.09, cm, cap, loc=(0, -0.04 * R, 0.6 * R), scale=(1, 1, 0.5), seg=12, rings=8)
        self.P['hat'] = cap
        return cap

    def headscarf(self, color, color2=None, pat='flowers', P=None, knot=True, tails=True, z_front=0.52,
                  band=None, scale=1.15):
        R = self.R
        hp = self.P['head']
        sm = mat(color, pat=pat, color2=color2, P=P or dict(nu=26, fv=34, rad=0.32), var=0.12, bump=0.35)
        def deform(p):
            x, y, z = p.x, p.y, p.z
            front = _smooth(-0.05, -0.45, y)
            zcut = (z_front - 0.35 * x * x) * front + (-0.62) * (1 - front)
            k = _smooth(-0.015, 0.05, zcut - z)
            q = p * (1 - 0.35 * k)
            a = math.atan2(y, x)
            q *= 1 + 0.035 * math.sin(7 * a + 2 * z) * (1 - k) * max(0.0, 0.6 - z)
            q.x *= 1 + 0.1 * max(0.0, -z)
            if y > 0.0:
                q.y += 0.16 * y * max(0.0, z + 0.6)
            if z > 0.4:
                q.z += 0.05 * (z - 0.4)
            return q
        o = blob("scarf", R * scale, sm, hp, loc=(0, R * 0.06, R * 0.04), scale=(1.0, 1.02, 1.0), seg=112, rings=72,
                 deform=deform)
        # rolled front band following the cut edge
        bmat = mat(band or darker(color, 0.85), pat=pat if not band else 'weave', color2=color2, P=P or dict(nu=26, fv=34, rad=0.32))
        pts = []
        for i in range(17):
            x = -0.95 + 1.9 * i / 16
            z = z_front - 0.35 * x * x - 0.02
            y = -math.sqrt(max(0.0, 1 - x * x - z * z)) * 1.02
            pts.append(Vector((x * R * scale, y * R * scale + R * 0.06 + 0.02 * R, (z + 0.03) * R * scale + R * 0.04)))
        tube("scarfband", pts, [R * 0.07], bmat, hp, seg=10, sub=2)
        if knot:
            kx = R * 0.55
            ellipsoid("knot", R * 0.2, sm, hp, loc=(kx, R * 1.0, -R * 0.4), scale=(1.0, 0.85, 0.8), seg=16, rings=10)
            for k in (-1, 1):
                ellipsoid("knotloop", R * 0.17, sm, hp, loc=(kx + k * R * 0.17, R * 1.02, -R * 0.33), scale=(1.1, 0.5, 0.6),
                          rot=(0, k * 0.5, 0), seg=14, rings=8)
            if tails:
                for k in (-1, 1):
                    tube("tail", [Vector((kx + k * R * 0.05, R * 1.0, -R * 0.45)), Vector((kx + R * 0.12 + k * R * 0.1, R * 0.85, -R * 0.85)),
                                  Vector((kx + R * 0.2 + k * R * 0.12, R * 0.6, -R * 1.3))], [R * 0.13, R * 0.12, R * 0.09], sm, hp,
                         seg=10, flat=0.3)
        self.P['hat'] = o
        return o

    def hood_cloak(self, color, length, pat='weave', P=None, color2=None, hood=True):
        """Long cloak with a deep hood (the Warden)."""
        H, W, R = self.H, self.W, self.R
        cm = mat(color, pat=pat, color2=color2, P=P or dict(nu=40, fv=50), var=0.14)
        ck = pivot("cloak", (0, 0, self.waist_z + self.torso_h * 0.95), self.P['body'])
        rings = []
        for k in range(10):
            t = k / 9
            r = 0.17 * W + 0.26 * W * t ** 0.8
            rings.append((-length * t, r, r * 0.9, 0, 0.02 * t))
        loft("cloak", rings, cm, ck, seg=72, folds=lambda a, t: 1 + 0.07 * t * math.sin(9 * a + 0.3))
        loft("mantle", [(0.04, 0.12 * W, 0.1 * W), (-0.02, 0.24 * W, 0.2 * W), (-0.2, 0.28 * W, 0.24 * W)], cm, ck, seg=56,
             folds=lambda a, t: 1 + 0.05 * t * math.sin(7 * a))
        self.P['skirt'] = ck
        return cm

    # ------------------------------------------------------------ props / light
    def glow_light(self, parent, loc, color, energy=10, r=0.1):
        ld = bpy.data.lights.new("pl", 'POINT')
        ld.color = hexlin(color)
        ld.energy = energy
        ld.shadow_soft_size = r
        lo = bpy.data.objects.new("pl", ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.parent = parent
        lo.location = loc
        self.lights.append(ld)
        return ld

    def needle(self, hand):
        n = pivot("needle", (0, -0.03, -0.04), hand, rot=(math.radians(-60), 0, 0))
        tube("shaft", [Vector((0, 0, -0.06)), Vector((0, 0, 0.12)), Vector((0, 0, 0.3))], [0.012, 0.011, 0.004],
             mat("#f2e6c4", metal=True), n, seg=8, sub=2)
        ellipsoid("eye", 0.016, glow("#35d3b0", 4), n, loc=(0, 0, -0.065), scale=(1, 0.5, 1.6), seg=8, rings=6)
        ellipsoid("tip", 0.028, glow("#9ffff0", 6), n, loc=(0, 0, 0.3), seg=10, rings=8)
        halo = ellipsoid("halo", 0.09, glow("#35d3b0", 2.5, alpha=0.8, soft=True), n, loc=(0, 0, 0.3), seg=14, rings=10)
        # trailing thread
        tube("thread", [Vector((0, 0, -0.065)), Vector((0.04, 0.02, -0.14)), Vector((0.02, 0.06, -0.24)),
                        Vector((0.07, 0.05, -0.32))], [0.006], glow("#35d3b0", 2.0), n, seg=5, sub=4)
        self.glow_light(n, (0, -0.08, 0.3), "#35d3b0", 6)
        return n

    def satchel(self, color="#8a5a36", side=1, strap="#5e3a22", z=0.1):
        H, W = self.H, self.W
        up = self.P['upper']
        lm = mat(color, pat='leather', var=0.18, bump=0.5)
        x = side * 0.22 * W
        bag = pivot("bag", (x, 0.0, z * H - 0.05), up, rot=(0, 0, side * 0.25))
        box("bagbody", (0.07, 0.19, 0.16), lm, bag, bevel=0.025)
        box("flap", (0.075, 0.195, 0.07), mat(strap, pat='leather', var=0.18), bag, loc=(0.005 * side, 0, 0.05), bevel=0.02)
        ellipsoid("buckle", 0.018, mat("#e8b04a", metal=True), bag, loc=(side * 0.042, 0, 0.03), scale=(0.5, 1, 1), seg=8, rings=6)
        stitches("bst", 0.0, 0.0, 1, mat("#f3e4c4", kind='soft', rim=0, ao=0), bag, size=0.001)
        sm = mat(strap, pat='leather', var=0.15)
        th = self.torso_h
        pts = [Vector((x, -0.02, z * H + 0.02)), Vector((-side * 0.05 * W, -0.165 * W - 0.012, th * 0.55)),
               Vector((-side * 0.14 * W, -0.11 * W, th * 0.92)), Vector((-side * 0.16 * W, 0.04, th * 0.98)),
               Vector((-side * 0.04 * W, 0.16 * W + 0.01, th * 0.6)), Vector((x * 0.9, 0.06, z * H + 0.03))]
        tube("strap", pts, [0.009], sm, up, seg=6, sub=4, flat=0.4)
        return bag
