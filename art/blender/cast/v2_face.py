"""Heads, faces and expressions for v2 characters.

A head is a sculpted sphere mesh (jaw, cheeks, nose, brow) in head-local space (R = radius).
Facial features are thin meshes projected onto the head surface (FaceProj), so every
expression is a parameter set and can be rebuilt in a few ms (portraits, blinks).
Face coordinates are (x, z) in units of R, viewer's right = +x, facing -Y.
"""
import math

import bpy
from mathutils import Vector

from v2lib import *
from v2lib import _MAT, _col4

EXPR = {
    #          brows: (raise, inner, arch) eyes: open, tilt, squint, look(x,z), pupil   mouth
    'neutral': dict(br=(0.0, 0.0, 0.03), op=1.0, tilt=0.0, sq=0.08, look=(0.0, 0.0), pu=1.0, mouth=('line', 0.05)),
    'happy': dict(br=(0.05, -0.01, 0.06), op=0.85, tilt=0.03, sq=0.38, look=(0.0, 0.05), pu=1.05, mouth=('open', 0.16, 0.13)),
    'worried': dict(br=(0.04, 0.10, -0.02), op=1.0, tilt=-0.06, sq=0.05, look=(0.35, -0.1), pu=0.85, mouth=('wavy', -0.03)),
    'surprised': dict(br=(0.13, 0.03, 0.08), op=1.22, tilt=0.0, sq=0.0, look=(0.0, 0.0), pu=0.72, mouth=('o', 0.085, 0.10)),
    'sad': dict(br=(0.0, 0.12, -0.04), op=0.72, tilt=-0.09, sq=0.12, look=(-0.1, -0.45), pu=1.0, mouth=('line', -0.07)),
    'truth': dict(br=(-0.02, 0.0, 0.0), op=0.92, tilt=0.0, sq=0.0, look=(0.0, 0.0), pu=0.0, mouth=('line', 0.0)),
    'cheeky': dict(br=(0.03, -0.04, 0.05), op=0.9, tilt=0.03, sq=0.28, look=(0.25, 0.05), pu=1.05, mouth=('smirk', 0.14)),
    'blink': dict(br=(0.0, 0.0, 0.03), op=0.0, tilt=0.0, sq=0.0, look=(0, 0), pu=1.0, mouth=('line', 0.05)),
}


def head_mesh(name, R, parent, loc, prm, material):
    """prm: jaw, cheek, nose, chin, brow, flat."""
    jaw, cheek, nose, chin = prm.get('jaw', 0.3), prm.get('cheek', 0.05), prm.get('nose', 0.10), prm.get('chin', 0.05)
    nose_w = prm.get('nose_w', 0.11)
    nose_z = prm.get('nose_z', -0.16)
    flat = prm.get('flat', 0.93)

    def deform(p):
        x, y, z = p.x, p.y, p.z
        if z < 0:
            k = 1 - jaw * (-z) ** 1.7
            x *= k
            y *= 1 - jaw * 0.45 * (-z) ** 1.7
        if y < 0:
            y *= flat
        out = Vector((x, y, z))
        # cheeks (soft puff below the eyes)
        for s in (-1, 1):
            d2 = (x - s * 0.5) ** 2 + (y + 0.78) ** 2 + (z + 0.28) ** 2
            out += p * (cheek * math.exp(-d2 / 0.07))
        # chin forward/down
        d2 = x * x * 3 + (z + 0.85) ** 2 * 2.5
        if y < 0:
            out.y -= chin * math.exp(-d2 / 0.08)
            out.z -= chin * 0.4 * math.exp(-d2 / 0.08)
        # nose
        if y < -0.3:
            g = math.exp(-(x * x) / (nose_w ** 2) - (z - nose_z) ** 2 / (0.15 ** 2))
            out.y -= nose * g
        # brow ridge
        if y < -0.2:
            out.y -= prm.get('brow', 0.025) * math.exp(-((z - 0.30) ** 2) / 0.012) * (1 - 0.5 * x * x)
        # back of head slightly fuller
        if y > 0.2:
            out.y *= prm.get('back', 1.03)
        return out
    h = blob(name, R, material, parent, loc, scale=(1.0, prm.get('depth', 0.96), prm.get('tall', 1.02)),
             deform=deform, seg=56, rings=40)
    h["line_k"] = 0.8
    return h


def skin_mat(skin, blush="#e8807a", blush_amt=0.4, R=0.26, freckles=False, pale=False, age=0.0):
    """Skin with baked cheek blush (object-space spheres) + optional freckles. Head-local coords."""
    key = ("skin", skin, blush, blush_amt, round(R, 3), freckles, pale, STATE['truth'], age)
    if key in _MAT:
        return _MAT[key]
    truth = STATE['truth'] or pale
    base = truthify(skin, 0.55) if truth else skin
    if truth:
        base = lin2hex(tuple(min(1, c * 1.06 + 0.02) for c in hexlin(base)))
    m = mat(base, pat='skin', kind='skin', var=0.05, bump=0.05, rim=0.45, name="skin")
    if truth or blush_amt <= 0:
        m = m.copy()
        _MAT[key] = m
        m["base"] = base
        return m
    m = m.copy()
    m["base"] = base
    nt = m.node_tree
    nb = NB(nt)
    # find albedo -> first MIX (MULTIPLY) node whose A is the skin colour: easiest is to rebuild albedo here
    tc = nb.n("ShaderNodeTexCoord")
    fac_total = None
    for s in (-1, 1):
        c = (s * 0.52 * R, -0.8 * R, -0.25 * R)
        vm = nb.n("ShaderNodeVectorMath", _operation='DISTANCE')
        nb.link(tc.outputs['Object'], vm.inputs[0])
        vm.inputs[1].default_value = c
        f = nb.m('SUBTRACT', 1.0, nb.m('DIVIDE', vm.outputs['Value'], 0.30 * R), clamp=True)
        f = nb.m('POWER', f, 1.6)
        fac_total = f if fac_total is None else nb.m('MAXIMUM', fac_total, f)
    fac_total = nb.m('MULTIPLY', fac_total, blush_amt)
    if freckles:
        vor = nb.n("ShaderNodeTexVoronoi", Scale=34.0 / (R / 0.26))
        nb.link(tc.outputs['Object'], vor.inputs['Vector'])
        dots = nb.m('LESS_THAN', vor.outputs['Distance'], 0.16)
        area = nb.m('GREATER_THAN', fac_total, 0.12 * blush_amt)
        fr = nb.m('MULTIPLY', nb.m('MULTIPLY', dots, area), 0.55)
    # locate the emission colour input chain: insert a mix before the shading multiply
    # albedo is the A input of the first MULTIPLY mix whose B is the ramp; simplest: mix the final colour
    em = [n for n in nt.nodes if n.type == 'EMISSION'][0]
    src = em.inputs['Color'].links[0].from_socket
    col = nb.mix(fac_total, src, _col4(blush), 'MULTIPLY')
    col = nb.mix(fac_total, src, col)
    if freckles:
        col = nb.mix(fr, col, _col4("#9a5a3a"), 'MULTIPLY')
    nb.link(col, em.inputs['Color'])
    _MAT[key] = m
    return m


class Face:
    """Builds all features for one expression on a head."""

    def __init__(self, head, R, spec):
        self.fp = FaceProj(head, R)
        self.R = R
        self.sp = spec

    def clear(self):
        self.fp.clear()

    def build(self, expr='neutral', closed=False):
        sp = self.sp
        if sp.get('noface'):
            return
        E = dict(EXPR[expr])
        E.update(sp.get('expr_over', {}).get(expr, {}))
        truth = expr == 'truth'
        fp = self.fp
        dark = sp.get('line', "#2b1a26")
        ink = mat(dark, kind='flat', rim=0, ao=0, line=False)
        browm = mat(sp.get('brow_col', "#4a2e26"), kind='flat', rim=0, ao=0, line=False)
        white = mat("#fbf4ea" if not truth else "#28323a", kind='soft', rim=0, ao=0, line=False)
        iris_c = sp.get('iris', "#6a4a2e")
        irism = mat(iris_c, kind='soft', rim=0, ao=0, line=False)
        irisd = mat(lin2hex(tuple(c * 0.45 for c in hexlin(iris_c))), kind='soft', rim=0, ao=0, line=False)
        pupm = mat("#1a1016", kind='flat', rim=0, ao=0, line=False)
        hl = glow("#ffffff", 1.0)
        skin = sp['skin']
        skin_d = lin2hex(tuple(c * 0.55 for c in hexlin(truthify(skin, 0.55) if truth else skin)))
        skind = mat(skin_d, kind='soft', rim=0, ao=0, line=False)
        ex, ez = sp.get('eye_x', 0.36), sp.get('eye_z', -0.02)
        ew, eh = sp.get('eye_w', 0.125), sp.get('eye_h', 0.15)
        op = 0.0 if closed else E['op']
        for s in (-1, 1):
            cx = s * ex
            tilt = E['tilt']
            # (x) -> lid heights; inner corner at cx - s*ew
            def X(t):
                return cx + s * ew * (2 * t - 1)

            def corner(t):
                return ez + tilt * (2 * t - 1) * 0.9 + 0.012 * (2 * t - 1)

            def up(t, o=op):
                return corner(t) + eh * o * (math.sin(math.pi * min(1, max(0, t))) ** 0.75) * (1.0 + 0.12 * (t - 0.5))

            def lo(t):
                return corner(t) - eh * 0.82 * (1 - E['sq']) * (math.sin(math.pi * min(1, max(0, t))) ** 0.9)
            N = 14
            if op > 0.05:
                upper = [(X(i / N), up(i / N)) for i in range(N + 1)]
                lower = [(X(1 - i / N), lo(1 - i / N)) for i in range(1, N)]
                fp.poly("sclera", upper + lower, white, off=0.006)
                # iris clamped between the lids
                lx, lz = E['look']
                icx = cx + lx * ew * 0.42 * (1 if s > 0 else 1)
                icz = ez + lz * eh * 0.35 + eh * 0.06
                ri = ew * sp.get('iris_r', 0.70)

                def clamp_pts(pts, shrink=0.0):
                    out = []
                    for (x, z) in pts:
                        t = ((x - cx) * s / ew + 1) / 2
                        t = min(0.985, max(0.015, t))
                        x = X(t)
                        z = min(up(t) - shrink, max(lo(t) + shrink, z))
                        out.append((x, z))
                    return out
                if truth:
                    fp.poly("iris", clamp_pts(ellipse_pts(icx, icz, ri * 0.55, ri * 0.55, 20)),
                            glow("#45e0c8", 1.4), off=0.009)
                    fp.poly("irisglow", clamp_pts(ellipse_pts(icx, icz, ri * 0.25, ri * 0.25, 14)),
                            glow("#c8fff4", 1.6), off=0.011)
                else:
                    fp.poly("iris", clamp_pts(ellipse_pts(icx, icz, ri, ri * 1.05, 24)), irisd, off=0.009)
                    fp.poly("iris2", clamp_pts(ellipse_pts(icx, icz - ri * 0.08, ri * 0.8, ri * 0.85, 24)), irism, off=0.011)
                    pr = ri * 0.48 * E['pu']
                    fp.poly("pupil", clamp_pts(ellipse_pts(icx, icz, pr, pr * 1.05, 18)), pupm, off=0.013)
                    # highlights (viewer upper-left = key light side)
                    hx, hz = icx - ri * 0.36, icz + ri * 0.36
                    if lo(0.5) < hz < up(((hx - cx) * s / ew + 1) / 2) - 0.01:
                        fp.poly("hl", ellipse_pts(hx, hz, ri * 0.30, ri * 0.30, 14), hl, off=0.016)
                    fp.poly("hl2", clamp_pts(ellipse_pts(icx + ri * 0.38, icz - ri * 0.4, ri * 0.13, ri * 0.13, 10)),
                            hl, off=0.016)
                # upper lash line (thicker to the outer corner, small flick)
                lash = [(X(-0.04), up(0.0) - 0.01)] + [(X(i / 6), up(i / 6) + 0.004) for i in range(1, 6)] + \
                       [(X(1.0) + s * 0.03, up(1.0) + 0.035 * sp.get('flick', 1.0))]
                w = sp.get('lash_w', 0.05)
                fp.ribbon("lash", lash, [w * 0.35, w * 0.8, w, w * 1.1, w * 1.05, w * 0.9, w * 0.3], ink, off=0.018)
                lower_l = [(X(0.35), lo(0.35)), (X(0.65), lo(0.65) - 0.004), (X(0.95), lo(0.95))]
                fp.ribbon("lash_lo", lower_l, [0.006, 0.016, 0.01], skind, off=0.015)
                if sp.get('crease', True):
                    cr = [(X(0.12), up(0.12) + 0.05), (X(0.5), up(0.5) + 0.05), (X(0.92), up(0.92) + 0.035)]
                    fp.ribbon("crease", cr, [0.004, 0.012, 0.004], skind, off=0.012)
            else:
                # closed: happy = arch, blink = soft downward curve
                if expr == 'happy' or expr == 'cheeky':
                    pts = [(X(0.0), ez - 0.01), (X(0.5), ez + eh * 0.45), (X(1.0), ez - 0.01)]
                else:
                    pts = [(X(0.0), ez + 0.01), (X(0.5), ez - eh * 0.22), (X(1.0), ez + 0.02)]
                w = sp.get('lash_w', 0.05)
                fp.ribbon("lid", pts, [w * 0.4, w * 1.0, w * 0.6], ink, off=0.012)
            if sp.get('wrinkles') or truth:
                wc = skind if not truth else mat("#5a6670", kind='flat', rim=0, ao=0, line=False)
                # under-eye bag + crow's feet
                fp.ribbon("bag", [(X(0.25), lo(0.3) - 0.06), (X(0.6), lo(0.6) - 0.075), (X(0.9), lo(0.9) - 0.05)],
                          [0.004, 0.014 if truth else 0.01, 0.004], wc, off=0.012)
                if sp.get('wrinkles'):
                    for k in (-1, 0, 1):
                        fp.ribbon("crow", [(X(1.05) + s * 0.01, ez + 0.03 * k), (X(1.05) + s * 0.08, ez + 0.06 * k - 0.01)],
                                  [0.008, 0.003], skind, off=0.01)
            # brows
            rz, inner, arch = E['br']
            bz = sp.get('brow_z', 0.27) + rz
            bw = sp.get('brow_w', 0.055)
            bl = sp.get('brow_len', 1.0)
            bpts = [(cx - s * 0.12 * bl, bz + inner - 0.01), (cx + s * 0.01, bz + arch + 0.02 - inner * 0.2),
                    (cx + s * 0.15 * bl, bz - 0.02 + arch * 0.3 - inner * 0.55)]
            fp.ribbon("brow", bpts, [bw * 1.0, bw * 0.9, bw * 0.4], browm, off=0.012)
            if sp.get('bushy'):
                for k in range(3):
                    o = 0.02 * (k - 1)
                    fp.ribbon("brow_b", [(p[0] + s * 0.01 * k, p[1] + o) for p in bpts], [bw * 0.6, bw * 0.7, bw * 0.3],
                              browm, off=0.013)
        # nose underside
        nz = sp.get('nose_z', -0.16)
        fp.ribbon("nostril", [(-0.06, nz - 0.07), (0.0, nz - 0.095), (0.06, nz - 0.07)], [0.012, 0.025, 0.012],
                  skind, off=0.01)
        self.mouth(E['mouth'], truth, ink)
        if truth:
            # thread shimmer: a few thin teal threads drawn on the face like puppet strings
            th = glow("#7ff3e0", 1.3)
            for k, (x0, x1) in enumerate(((-0.55, -0.42), (0.47, 0.6), (-0.1, -0.04))):
                fp.ribbon("thread", [(x0, 0.9), ((x0 + x1) / 2 + 0.03, 0.2), (x1, -0.6)], [0.008, 0.01, 0.004], th,
                          off=0.02)

    def mouth(self, M, truth, ink):
        sp = self.sp
        fp = self.fp
        mz = sp.get('mouth_z', -0.40)
        mw = sp.get('mouth_w', 0.17)
        lipc = sp.get('lip', "#a24a4c") if not truth else "#56606a"
        lipm = mat(lipc, kind='soft', rim=0, ao=0, line=False)
        inside = mat("#5a1c28" if not truth else "#1e2428", kind='flat', rim=0, ao=0, line=False)
        kind = M[0]
        if kind in ('line', 'wavy', 'smirk'):
            L = M[1]
            pts = []
            for i in range(9):
                u = -1 + 2 * i / 8
                z = mz + L * u * u
                if kind == 'wavy':
                    z += 0.018 * math.sin(u * math.pi * 1.5)
                if kind == 'smirk':
                    z = mz + L * (0.5 * (u + 1)) ** 2 - 0.02
                pts.append((u * mw, z))
            fp.ribbon("mouth", pts, [0.012, 0.026, 0.03, 0.026, 0.012], lipm if truth else ink, off=0.01)
            if not truth and kind != 'smirk':
                # soft lower-lip shadow
                fp.ribbon("lowlip", [(-mw * 0.45, mz - 0.06 + L * 0.2), (0, mz - 0.075), (mw * 0.45, mz - 0.06 + L * 0.2)],
                          [0.006, 0.022, 0.006], lipm, off=0.009)
            if kind == 'smirk' or (L > 0.08):
                fp.ribbon("dimple", [(mw * 1.02, mz + L + 0.02 - (0.02 if kind == 'smirk' else 0)), (mw * 1.12, mz + L - 0.02)],
                          [0.012, 0.004], ink, off=0.011)
        elif kind == 'open':
            L, D = M[1], M[2]
            up_pts = [(u * mw * 1.1, mz + 0.03 + L * u * u * 0.7) for u in [-1 + 2 * i / 10 for i in range(11)]]
            lo_pts = [(u * mw * 1.1, mz + 0.03 - D * (1 - u * u) ** 0.8 + L * u * u * 0.7)
                      for u in [1 - 2 * i / 10 for i in range(1, 10)]]
            fp.poly("mouth_in", up_pts + lo_pts, inside, off=0.008)
            # teeth (top) and tongue (bottom), kept inside the mouth shape
            tz0 = mz + 0.03
            teeth = [(u * mw * 0.82, tz0 + L * u * u * 0.7 - 0.004) for u in [-1 + 2 * i / 8 for i in range(9)]] + \
                    [(u * mw * 0.75, tz0 + L * u * u * 0.6 - 0.045) for u in [1 - 2 * i / 8 for i in range(1, 8)]]
            fp.poly("teeth", teeth, mat("#fff8ee", kind='soft', rim=0, ao=0, line=False), off=0.010)
            fp.poly("tongue", ellipse_pts(0, mz + 0.03 - D * 0.75, mw * 0.5, D * 0.3, 16),
                    mat("#d8707a", kind='soft', rim=0, ao=0, line=False), off=0.010)
            fp.ribbon("lip_up", up_pts, [0.01, 0.02, 0.024, 0.02, 0.01], ink, off=0.012)
            fp.ribbon("lip_lo", [lo_pts[i] for i in (1, 4, 7)], [0.006, 0.018, 0.006], lipm, off=0.011)
        elif kind == 'o':
            rx, rz = M[1], M[2]
            pts = ellipse_pts(0, mz - 0.01, rx, rz, 20)
            fp.poly("mouth_in", pts, inside, off=0.008)
            fp.poly("tongue", ellipse_pts(0, mz - 0.01 - rz * 0.6, rx * 0.6, rz * 0.32, 14),
                    mat("#d8707a", kind='soft', rim=0, ao=0, line=False), off=0.010)
            ring = ellipse_pts(0, mz - 0.01, rx * 1.02, rz * 1.02, 20)
            fp.ribbon("lip", ring + [ring[0], ring[1]], [0.02], ink, off=0.012, sub=2)
