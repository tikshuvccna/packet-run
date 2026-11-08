"""Pack raw portrait renders -> public/assets/portraits/<who>_<mood>.png (512) + index.json, preview art/preview_portraits.png.
python art/pack_portraits.py <ABS rawdir>      (raw from art/blender/cast/pr_render.py)
Noise gets a glitch pass (RGB split, shifted slices, flaking letters); busts get a soft bottom fade."""
import json, os, random, sys
from PIL import Image, ImageFilter, ImageDraw, ImageFont, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OD = os.path.join(ROOT, 'public', 'assets', 'portraits')
EXPRS = ['neutral', 'happy', 'worried', 'surprised']
NEW = ['dina', 'gee', 'noise', 'hero_girl', 'hero_boy']
OUTLINE = (42, 32, 54)


def finish(path, ssaa=2, outline_px=1.5, thr=24):
    im = Image.open(path).convert('RGBA')
    a = im.getchannel('A')
    r = int(round(outline_px * ssaa))
    dil = a.point(lambda v: 255 if v > thr else 0).filter(ImageFilter.MaxFilter(2 * r + 1))
    ol = Image.new('RGBA', im.size, OUTLINE + (0,))
    ol.putalpha(dil)
    im = Image.alpha_composite(ol, im)
    w, h = im.size
    return im.convert('RGBa').resize((w // ssaa, h // ssaa), Image.LANCZOS).convert('RGBA')


def fade(im):
    a = im.getchannel('A')
    g = Image.linear_gradient('L').resize(im.size).point(lambda v: 255 if v < 215 else int(255 * (255 - v) / 40))
    im.putalpha(Image.composite(a, Image.new('L', a.size, 0), g))
    return im


def glitch(im, seed):
    rnd = random.Random(seed)
    r, g, b, a = im.split()
    r = ImageChops.offset(r, -4, 0)
    b = ImageChops.offset(b, 4, 0)
    im = Image.merge('RGBA', (r, g, b, a))
    out = im.copy()
    for _ in range(6):
        y = rnd.randrange(60, 470)
        hh = rnd.randrange(4, 14)
        dx = rnd.choice([-1, 1]) * rnd.randrange(6, 18)
        sl = im.crop((0, y, 512, y + hh))
        out.paste(Image.new('RGBA', (512, hh), (0, 0, 0, 0)), (0, y))
        out.alpha_composite(sl, (dx if dx > 0 else 0, y), (0 if dx > 0 else -dx, 0))
    try:
        f = ImageFont.truetype(r'C:\Windows\Fonts\consolab.ttf', 30)
    except Exception:
        f = ImageFont.load_default()
    d = ImageDraw.Draw(out)
    for _ in range(10):
        ch = rnd.choice('#%&?!01AXRZ@$')
        x, y = rnd.randrange(330, 490), rnd.randrange(40, 330)
        col = rnd.choice([(162, 75, 255, 220), (255, 106, 42, 210), (120, 220, 255, 190)])
        d.text((x, y), ch, font=f, fill=col)
    return out


def main(raw):
    os.makedirs(OD, exist_ok=True)
    for who in NEW:
        for i, e in enumerate(EXPRS):
            im = finish(os.path.join(raw, 'portraits', f'{who}_{e}.png'))
            if who != 'gee':
                im = fade(im)
            if who == 'noise':
                im = glitch(im, i * 7 + 3)
            im.save(os.path.join(OD, f'{who}_{e}.png'), optimize=True)
    whos = sorted({f.rsplit('_', 1)[0] for f in os.listdir(OD) if f.endswith('.png')})
    idx = {"moods": EXPRS, "who": {w: [e for e in EXPRS if os.path.exists(os.path.join(OD, f'{w}_{e}.png'))] for w in whos},
           "note": "512x512 transparent busts, turned ~20 deg to the viewer's left (flipX to face right)"}
    json.dump(idx, open(os.path.join(OD, 'index.json'), 'w'), indent=1)
    sheet = Image.new('RGBA', (4 * 200, len(whos) * 200), (236, 226, 204, 255))
    for r, w in enumerate(whos):
        for c, e in enumerate(EXPRS):
            p = os.path.join(OD, f'{w}_{e}.png')
            if os.path.exists(p):
                sheet.alpha_composite(Image.open(p).convert('RGBA').resize((200, 200), Image.LANCZOS), (c * 200, r * 200))
    sheet.save(os.path.join(ROOT, 'art', 'preview_portraits.png'))
    print('portraits', whos)


main(sys.argv[1])
