"""Packet Run 2D textures (Pillow): vinyls, road, ground, sky gradient.
python art/tex_pil.py [vinyl|road|ground|sky ...]
Vinyl UV convention: u = 0 car FRONT -> 1 rear (image left -> right), v = 0 bottom of the side panel (image bottom).
On hood/roof panels v runs across the car, so horizontal bands in the image become stripes along the car.
Vinyls are WHITE on transparent: the engine tints them (material color = vinylColor).
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'public', 'assets', 'tex')
S = 4  # supersampling


def canvas(n=512):
    return Image.new('RGBA', (n * S, n * S), (255, 255, 255, 0))


def save(img, name, n=512):
    os.makedirs(TEX, exist_ok=True)
    img = img.resize((n, n), Image.LANCZOS)
    img.save(os.path.join(TEX, name))
    print('TEX', name)


W = (255, 255, 255, 255)
SQ = 0.5   # side panels stretch u about 3-6x: round shapes are pre-squashed in u


def vinyl_stripes():
    im = canvas()
    d = ImageDraw.Draw(im)
    N = 512 * S
    for (a, b) in ((0.33, 0.45), (0.55, 0.67)):
        d.rectangle([0, int(N * (1 - b)), N, int(N * (1 - a))], fill=W)
    # thin pinstripes
    for v in (0.29, 0.71):
        d.rectangle([0, int(N * (1 - v)) - 2 * S, N, int(N * (1 - v)) + 2 * S], fill=W)
    save(im, 'vinyl_stripes.png')


def vinyl_flames():
    im = canvas()
    d = ImageDraw.Draw(im)
    N = 512 * S
    rnd = random.Random(7)
    # flames: tongues starting at the front (left) and licking back (right), filling the lower 2/3
    base_top, base_bot = 0.15, 0.78
    for k in range(9):
        v0 = base_top + (base_bot - base_top) * (k + 0.5) / 9
        L = 0.45 + 0.4 * rnd.random() * (1 - abs(k - 4) / 6)
        th = 0.07
        pts = []
        steps = 30
        for i in range(steps + 1):
            t = i / steps
            u = t * L
            w = th * (1 - t) ** 0.8 * (1 + 0.25 * math.sin(t * 9 + k))
            vc = v0 + 0.06 * math.sin(t * 5 + k * 1.3) * t
            pts.append((u * N, (1 - (vc + w)) * N))
        for i in range(steps, -1, -1):
            t = i / steps
            u = t * L
            w = th * (1 - t) ** 0.8 * (1 + 0.25 * math.sin(t * 9 + k))
            vc = v0 + 0.06 * math.sin(t * 5 + k * 1.3) * t
            pts.append((u * N, (1 - (vc - w)) * N))
        d.polygon(pts, fill=W)
    d.rectangle([0, int(N * (1 - base_bot - 0.05)), int(N * 0.08), int(N * (1 - base_top + 0.05))], fill=W)
    save(im, 'vinyl_flames.png')


def star(d, cx, cy, r, rot=0.0):
    pts = []
    for i in range(10):
        a = rot + math.pi * i / 5 - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a) * SQ, cy + rr * math.sin(a)))
    d.polygon(pts, fill=W)


def vinyl_stars():
    im = canvas()
    d = ImageDraw.Draw(im)
    N = 512 * S
    rnd = random.Random(3)
    placed = []
    for _ in range(400):
        u = rnd.random() ** 0.7
        v = 0.12 + 0.76 * rnd.random()
        r = (0.04 + 0.08 * u * rnd.random()) * N
        x, y = u * N, (1 - v) * N
        if any(math.hypot((x - a) / SQ, y - b) < r + rr + 6 * S for a, b, rr in placed):
            continue
        placed.append((x, y, r))
        star(d, x, y, r, rnd.random())
        if len(placed) > 28:
            break
    save(im, 'vinyl_stars.png')


def vinyl_checker():
    im = canvas()
    d = ImageDraw.Draw(im)
    N = 512 * S
    c = N // 16
    for row in range(5):
        for col in range(16):
            # fades toward the front: fewer squares at the left
            u = (col + 0.5) / 16
            if (row + col) % 2 == 0 and (u > 0.35 or (u > 0.12 and row in (1, 2, 3))):
                y0 = int(N * 0.5 - 2.5 * c + row * c)
                d.rectangle([col * c, y0, col * c + c - 1, y0 + c - 1], fill=W)
    d.rectangle([0, int(N * 0.5 - 2.5 * c) - 3 * S, N, int(N * 0.5 - 2.5 * c)], fill=W)
    d.rectangle([0, int(N * 0.5 + 2.5 * c), N, int(N * 0.5 + 2.5 * c) + 3 * S], fill=W)
    save(im, 'vinyl_checker.png')


def vinyl_net():
    """Network logo: nodes and links, a big hub node, packets on the links."""
    im = canvas()
    d = ImageDraw.Draw(im)
    N = 512 * S
    nodes = [(0.12, 0.5, 0.075), (0.3, 0.75, 0.045), (0.32, 0.27, 0.05), (0.52, 0.55, 0.06), (0.68, 0.8, 0.04),
             (0.72, 0.3, 0.05), (0.88, 0.58, 0.045), (0.95, 0.2, 0.03), (0.5, 0.12, 0.03)]
    links = [(0, 1), (0, 2), (0, 3), (1, 3), (2, 3), (2, 8), (3, 4), (3, 5), (4, 6), (5, 6), (5, 7), (8, 5)]
    P = lambda i: (nodes[i][0] * N, (1 - nodes[i][1]) * N)
    for a, b in links:
        d.line([P(a), P(b)], fill=W, width=7 * S)
    for i, (u, v, r) in enumerate(nodes):
        x, y = P(i)
        R = r * N
        for k, f in ((1.0, W), (0.55, (255, 255, 255, 0)), (0.3, W)):
            d.ellipse([x - R * k * SQ, y - R * k, x + R * k * SQ, y + R * k], fill=f)
    for a, b, t in ((0, 3, 0.5), (3, 5, 0.45), (5, 6, 0.5)):
        (x0, y0), (x1, y1) = P(a), P(b)
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        s = 11 * S
        d.rectangle([x - s, y - s * 0.75, x + s, y + s * 0.75], fill=W)
    save(im, 'vinyl_net.png')


def vinyl():
    vinyl_stripes()
    vinyl_flames()
    vinyl_stars()
    vinyl_checker()
    vinyl_net()




# ===================================================================== road / ground / sky / water
import numpy as np


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def seamless_noise(n, blur, seed):
    rng = np.random.default_rng(seed)
    a = rng.random((n, n)).astype(np.float32)
    big = Image.fromarray((np.tile(a, (3, 3)) * 255).astype(np.uint8))
    big = big.filter(ImageFilter.GaussianBlur(blur))
    c = np.asarray(big, dtype=np.float32)[n:2 * n, n:2 * n] / 255.0
    c = (c - c.min()) / max(1e-6, c.max() - c.min())
    return c


def base_tex(n, c1, c2, blur=3, seed=1, speck=0.0, speck_col=None, steps=0):
    t = seamless_noise(n, blur, seed)
    if steps:
        t = np.floor(t * steps) / steps
    a, b = hexrgb(c1), hexrgb(c2)
    img = a[None, None, :] * (1 - t[..., None]) + b[None, None, :] * t[..., None]
    if speck:
        rng = np.random.default_rng(seed + 9)
        m = rng.random((n, n)) < speck
        img[m] = hexrgb(speck_col)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')


def save_rgb(img, name):
    os.makedirs(TEX, exist_ok=True)
    img.save(os.path.join(TEX, name))
    print('TEX', name)


def asphalt(n=512):
    return base_tex(n, '#5b5d68', '#6b6d78', blur=2, seed=4, speck=0.012, speck_col='#7c7e8a', steps=4)


def road():
    """Road tiles: u across the road (0 = left edge, 1 = right edge), v along the road; one tile = 8 m of a 2-lane road."""
    n = 512
    save_rgb(asphalt(n), 'road_asphalt.png')
    im = asphalt(n)
    d = ImageDraw.Draw(im)
    for x in (int(n * 0.04), int(n * 0.96)):
        d.rectangle([x - 6, 0, x + 6, n], fill=(240, 236, 226))
    for k in range(2):
        y0 = k * n // 2 + n // 8
        d.rectangle([n // 2 - 7, y0, n // 2 + 7, y0 + n // 4], fill=(255, 205, 64))
    save_rgb(im, 'road_lines.png')
    im = asphalt(n)
    d = ImageDraw.Draw(im)
    for k in range(7):
        x0 = int(n * (0.08 + k * 0.125))
        d.rectangle([x0, int(n * 0.2), x0 + int(n * 0.07), int(n * 0.8)], fill=(244, 240, 230))
    save_rgb(im, 'road_crosswalk.png')
    im = Image.new('RGB', (n, n))
    d = ImageDraw.Draw(im)
    for k in range(8):
        d.rectangle([0, k * n // 8, n, (k + 1) * n // 8], fill=(229, 74, 62) if k % 2 == 0 else (246, 242, 234))
    save_rgb(im, 'road_curb.png')
    im = base_tex(n, '#c9c3b8', '#d8d2c6', blur=2, seed=7, steps=3)
    d = ImageDraw.Draw(im)
    for k in range(4):
        d.line([(0, k * n // 4), (n, k * n // 4)], fill=(170, 164, 152), width=4)
        d.line([(k * n // 4, 0), (k * n // 4, n)], fill=(170, 164, 152), width=4)
    save_rgb(im, 'road_sidewalk.png')


def ground():
    n = 512
    im = base_tex(n, '#7fae6a', '#93c27a', blur=6, seed=2, steps=3)
    d = ImageDraw.Draw(im)
    rnd = random.Random(5)
    for _ in range(140):
        x, y = rnd.randrange(n), rnd.randrange(n)
        for dx in (-n, 0, n):
            for dy in (-n, 0, n):
                d.line([(x + dx, y + dy), (x + dx + rnd.randint(-3, 3), y + dy - 7)], fill=(104, 150, 86), width=2)
    save_rgb(im, 'ground_grass.png')
    save_rgb(base_tex(n, '#e8d4a2', '#f2e2b8', blur=5, seed=3, steps=3, speck=0.006, speck_col='#c9b07c'), 'ground_sand.png')
    save_rgb(base_tex(n, '#a88a64', '#b99c74', blur=4, seed=6, steps=3, speck=0.01, speck_col='#8a6e4c'), 'ground_dirt.png')
    im = base_tex(n, '#b9b3a8', '#c8c2b6', blur=2, seed=8, steps=3)
    d = ImageDraw.Draw(im)
    for r in range(8):
        y = r * n // 8
        d.line([(0, y), (n, y)], fill=(150, 144, 134), width=3)
        off = (n // 16) if r % 2 else 0
        for c in range(9):
            x = c * n // 8 + off
            d.line([(x, y), (x, y + n // 8)], fill=(150, 144, 134), width=3)
    save_rgb(im, 'ground_pavement.png')


def sky():
    """sky_gradient.png: v (image bottom -> top) = sky_dome UV v (below horizon -> zenith). Horizon at v ~ 0.14."""
    n = 256
    stops = [(0.0, '#dfeef6'), (0.13, '#f4f1e6'), (0.2, '#cfe7f5'), (0.5, '#93c8ec'), (1.0, '#5a9fdc')]
    col = np.zeros((n, 3), np.float32)
    for i in range(n):
        v = i / (n - 1)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= v <= b:
                t = (v - a) / (b - a)
                col[i] = hexrgb(ca) * (1 - t) + hexrgb(cb) * t
    img = np.repeat(col[::-1][:, None, :], 16, axis=1)
    save_rgb(Image.fromarray(img.astype(np.uint8), 'RGB'), 'sky_gradient.png')
    # sun sprite (additive)
    s = 256
    yy, xx = np.mgrid[0:s, 0:s]
    r = np.hypot(xx - s / 2, yy - s / 2) / (s / 2)
    a = np.clip(1.0 - r, 0, 1) ** 2.2 * 0.75
    a[r < 0.32] = 1.0
    rgba = np.zeros((s, s, 4), np.float32)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 255, 244, 205
    rgba[..., 3] = a * 255
    Image.fromarray(rgba.astype(np.uint8), 'RGBA').save(os.path.join(TEX, 'sun.png'))
    print('TEX sun.png')


def water():
    n = 256
    t = seamless_noise(n, 10, 11)
    t2 = seamless_noise(n, 3, 12)
    band = np.floor(t * 3) / 3
    img = hexrgb('#3f9fd0')[None, None, :] * (1 - band[..., None]) + hexrgb('#62c3e6')[None, None, :] * band[..., None]
    crest = (np.abs(t - 0.62) < 0.012) | (np.abs(t2 - 0.8) < 0.01)
    img[crest] = hexrgb('#d8f3fb')
    save_rgb(Image.fromarray(img.astype(np.uint8), 'RGB'), 'water.png')


def fx():
    """skid.png (tyre mark strip, tile along v), speedlines.png (radial streaks, additive overlay), boost_ring.png,
    coin_icon.png (HUD), item icons are not needed (3D)."""
    # skid: two dark rubber tracks with tread chevrons, alpha, 128 x 512, u across, v along (seamless in v)
    w, h = 128, 512
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for k in range(16):
        y = k * h * S // 16
        d.polygon([(8 * S, y), (w * S // 2 - 8 * S, y + 8 * S), (w * S - 8 * S, y), (w * S - 8 * S, y + 22 * S),
                   (w * S // 2 - 8 * S, y + 30 * S), (8 * S, y + 22 * S)], fill=(30, 26, 34, 150))
    im = im.resize((w, h), Image.LANCZOS)
    a = im.getchannel('A').filter(ImageFilter.GaussianBlur(1.2))
    im.putalpha(a)
    im.save(os.path.join(TEX, 'skid.png'))
    print('TEX skid.png')
    # speed lines: white streaks from the edges toward the centre, transparent middle, 512
    n = 512
    im = Image.new('RGBA', (n * 2, n * 2), (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(21)
    c = n
    for _ in range(70):
        a = rnd.random() * math.tau
        r0 = n * (0.55 + 0.3 * rnd.random())
        r1 = n * 1.5
        wdt = rnd.uniform(0.004, 0.012)
        pts = [(c + r0 * math.cos(a), c + r0 * math.sin(a)), (c + r1 * math.cos(a - wdt), c + r1 * math.sin(a - wdt)),
               (c + r1 * math.cos(a + wdt), c + r1 * math.sin(a + wdt))]
        d.polygon(pts, fill=(255, 255, 255, rnd.randrange(110, 210)))
    im = im.resize((n, n), Image.LANCZOS)
    im.save(os.path.join(TEX, 'speedlines.png'))
    print('TEX speedlines.png')
    # boost ring: glowing cyan shock ring (additive sprite), 256
    s2 = 256
    yy, xx = np.mgrid[0:s2, 0:s2]
    r = np.hypot(xx - s2 / 2, yy - s2 / 2) / (s2 / 2)
    a = np.exp(-((r - 0.75) / 0.09) ** 2) + 0.5 * np.exp(-((r - 0.55) / 0.05) ** 2)
    rgba = np.zeros((s2, s2, 4), np.float32)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 120 + 135 * np.clip(a, 0, 1), 230, 255
    rgba[..., 3] = np.clip(a, 0, 1) * 255
    Image.fromarray(rgba.astype(np.uint8), 'RGBA').save(os.path.join(TEX, 'boost_ring.png'))
    print('TEX boost_ring.png')
    # HUD coin icon 128: gold coin with rim, envelope emblem, outline
    m = 128
    im = Image.new('RGBA', (m * S, m * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    M_ = m * S
    d.ellipse([3 * S, 3 * S, M_ - 3 * S, M_ - 3 * S], fill=(42, 32, 54, 255))
    d.ellipse([7 * S, 7 * S, M_ - 7 * S, M_ - 7 * S], fill=(240, 160, 32, 255))
    d.ellipse([16 * S, 14 * S, M_ - 16 * S, M_ - 18 * S], fill=(255, 207, 58, 255))
    d.ellipse([24 * S, 20 * S, 52 * S, 34 * S], fill=(255, 238, 160, 255))
    x0, y0, x1, y1 = 38 * S, 48 * S, 90 * S, 82 * S
    d.rectangle([x0, y0, x1, y1], fill=(240, 160, 32, 255))
    d.line([(x0, y0), ((x0 + x1) // 2, (y0 + y1) // 2 + 2 * S), (x1, y0)], fill=(255, 238, 160, 255), width=4 * S)
    im.resize((m, m), Image.LANCZOS).save(os.path.join(TEX, 'coin_icon.png'))
    print('TEX coin_icon.png')


if __name__ == '__main__':
    groups = sys.argv[1:] or ['vinyl', 'road', 'ground', 'sky', 'water', 'fx']
    for g in groups:
        globals()[g]()
