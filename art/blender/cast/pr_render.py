"""Packet Run portrait renders (Blender 5.2 headless, EEVEE).
blender -b --python art/blender/cast/pr_render.py -- <dina,gee,noise|all> <ABS rawdir>
Raw: <rawdir>/portraits/<name>_<expr>.png (1024, SSAA 2). Pack: python art/pack_portraits.py <rawdir>
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from v2lib import *
from v2_cast import pose
import pr_cast

EXPRS = ['neutral', 'happy', 'worried', 'surprised']
RES = 512
SSAA = 2


def scene(line_t=0.012):
    reset()
    STATE['truth'] = False
    STATE['line_t'] = line_t
    STATE['lines'] = True
    render_setup(samples=32)
    world_and_lights('day')


def do(name, raw):
    od = os.path.join(raw, 'portraits')
    os.makedirs(od, exist_ok=True)
    if name == 'gee':
        for e in EXPRS:
            scene(0.006)
            r = pr_cast.gee(e)
            r.rotation_euler = (0, 0, math.radians(-16))
            add_lines(t=0.006)
            portrait_camera((0, 0, -0.02), dist=8, res=RES * SSAA, elev=8, yaw=0, ortho_scale=1.08)
            bpy.context.scene.eevee.taa_render_samples = 48
            render_to(os.path.join(od, f"gee_{e}.png"))
        return
    scene()
    h = pr_cast.CAST[name]()
    h.name = name
    info = h.portrait
    pose(h, 'idle', 0, 4)
    h.P['root'].rotation_euler = (0, 0, math.radians(info.get('yaw', -24)))
    bpy.context.view_layer.update()
    hw = h.P['head'].matrix_world.translation.copy()
    add_lines(t=info.get('line', 0.0042))
    portrait_camera(hw + Vector((0, 0, info.get('dz', -0.08))), dist=8, res=RES * SSAA, elev=info.get('elev', 7), yaw=0,
                    ortho_scale=info.get('scale', 1.18))
    bpy.context.scene.eevee.taa_render_samples = 48
    extra = []
    for e in EXPRS:
        h.face.clear()
        h.face.build(e)
        for o in extra:
            bpy.data.objects.remove(o, do_unlink=True)
        extra = pr_cast.noise_eyes(h, e) if getattr(h, 'noise', False) else []
        render_to(os.path.join(od, f"{name}_{e}.png"))
        print("PORTRAIT", name, e)


a = args()
names = ['dina', 'gee', 'noise'] if a[0] == 'all' else a[0].split(',')
for n in names:
    do(n, a[1])
