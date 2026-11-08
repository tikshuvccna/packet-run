"""Rebuild all Packet Run art.  python art/build_all.py [tex] [cars] [city] [portraits] [previews]   (default: everything)
Needs Blender 5.2 (env BLENDER overrides the path), Python 3 with Pillow + numpy. ~15 min for everything."""
import glob, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BL = os.environ.get('BLENDER', r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
RAW = os.path.join(HERE, '_raw')


def blender(script, *a):
    subprocess.run([BL, '-b', '--python', os.path.join(HERE, 'blender', script), '--', *a], check=True)


def py(script, *a):
    subprocess.run([sys.executable, os.path.join(HERE, script), *a], check=True)


def manifest():
    d = {os.path.basename(f)[:-5]: json.load(open(f)) for f in sorted(glob.glob(os.path.join(RAW, 'manifest', '*.json')))}
    json.dump(d, open(os.path.join(ROOT, 'public', 'assets', 'models', 'index.json'), 'w'), indent=1)


steps = sys.argv[1:] or ['tex', 'cars', 'city', 'portraits', 'previews']
if 'tex' in steps:
    py('tex_pil.py', 'vinyl', 'road', 'ground', 'sky', 'water', 'fx')
if 'cars' in steps:
    blender('cars.py')
if 'city' in steps:
    blender('city.py', 'all')
if 'cars' in steps or 'city' in steps:
    manifest()
    py('check_glb.py')
if 'portraits' in steps:
    blender(os.path.join('cast', 'pr_render.py'), 'all', RAW)
    blender(os.path.join('cast', 'pr_render.py'), 'hero_girl,hero_boy', RAW)
    py('pack_portraits.py', RAW)
if 'previews' in steps:
    blender('preview_vinyl.py')
    blender('preview_street.py')
