"""Check GLBs: parse the JSON chunk, list nodes/materials, count triangles, assert contract names.
python art/check_glb.py [name ...]   (default: every public/assets/models/*.glb)"""
import json, os, struct, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, 'public', 'assets', 'models')
CAR_NODES = {'Body', 'WheelFL', 'WheelFR', 'WheelRL', 'WheelRR', 'Spoiler', 'Vinyl', 'NitroFlame'}
CAR_MATS = {'Paint', 'Trim', 'Glass', 'Chrome', 'Rubber', 'Light_head', 'Light_tail', 'Emissive', 'Rim', 'VinylMat'}
LIMIT = lambda n: 12000 if n.startswith('car_') else 1500 if n.startswith('wheel_') else 3000 if (n.startswith('bld_') or n.startswith('landmark')) else 800 if not n.startswith(('sky', 'sea', 'cloud')) else 99999

def load(path):
    b = open(path, 'rb').read()
    magic, ver, ln = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF', path
    cl, ct = struct.unpack('<I4s', b[12:20])
    return json.loads(b[20:20 + cl])

def tris(g):
    n = 0
    for m in g.get('meshes', []):
        for p in m['primitives']:
            if 'indices' in p:
                n += g['accessors'][p['indices']]['count'] // 3
            else:
                n += g['accessors'][p['attributes']['POSITION']]['count'] // 3
    return n

def main():
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(MD) if f.endswith('.glb'))
    bad = 0
    for n in names:
        g = load(os.path.join(MD, n + '.glb'))
        nodes = [x.get('name') for x in g.get('nodes', [])]
        mats = [x.get('name') for x in g.get('materials', [])]
        t = tris(g)
        errs = []
        if t > LIMIT(n):
            errs.append('tris %d > %d' % (t, LIMIT(n)))
        if n.startswith('car_'):
            miss = CAR_NODES - set(nodes)
            if miss: errs.append('missing nodes %s' % miss)
            extra = set(mats) - CAR_MATS - {'Cargo', 'Tape'}
            if 'Paint' not in mats: errs.append('no Paint')
            if 'VinylMat' not in mats: errs.append('no VinylMat')
            byname = {x.get('name'): x for x in g['nodes']}
            body = byname['Body']
            kids = {g['nodes'][i]['name'] for i in body.get('children', [])}
            if not {'Spoiler', 'Vinyl', 'NitroFlame'} <= kids: errs.append('Body children %s' % kids)
            vm = [m for m in g['meshes'] if m['name'] == byname['Vinyl'].get('mesh') or True]
            vmesh = g['meshes'][byname['Vinyl']['mesh']]
            if 'TEXCOORD_0' not in vmesh['primitives'][0]['attributes']: errs.append('Vinyl has no UV')
        if n.startswith('wheel_') and 'Rim' not in mats: errs.append('no Rim')
        bad += bool(errs)
        print('%-22s %6d tris  nodes=%s  mats=%s %s' % (n, t, nodes if len(nodes) < 12 else len(nodes), mats,
                                                       ('  ERR ' + '; '.join(errs)) if errs else 'OK'))
    sys.exit(1 if bad else 0)

main()
