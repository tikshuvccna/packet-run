"""Composed street preview at racing scale: chase cam behind the van on a textured road between district buildings."""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from prlib import *
reset()
G = lambda n, loc, rz=0.0: import_glb(os.path.join(MODELS, n + '.glb'), loc=loc, rotz=rz)
# road strip along +Y (front of cars = +Y), 10 m wide, uv v along
M('_road', '#ffffff', image=os.path.join(TEX, 'road_lines.png'))
M('_grass', '#ffffff', image=os.path.join(TEX, 'ground_grass.png'))
M('_walk', '#ffffff', image=os.path.join(TEX, 'road_sidewalk.png'))
b = B()
L = 220
b.raw([(-5, -20, 0), (5, -20, 0), (5, L, 0), (-5, L, 0)], [(0, 1, 2, 3)], '_road', uvs=[(0, 0), (1, 0), (1, (L + 20) / 8), (0, (L + 20) / 8)])
for s in (-1, 1):
    x0, x1 = (5, 8) if s > 0 else (-8, -5)
    b.raw([(x0, -20, 0.12), (x1, -20, 0.12), (x1, L, 0.12), (x0, L, 0.12)], [(0, 1, 2, 3)], '_walk', uvs=[(0, 0), (1, 0), (1, (L + 20) / 3), (0, (L + 20) / 3)])
    x0, x1 = (8, 120) if s > 0 else (-120, -8)
    b.raw([(x0, -20, 0.05), (x1, -20, 0.05), (x1, L, 0.05), (x0, L, 0.05)], [(0, 1, 2, 3)], '_grass', uvs=[(0, 0), (28, 0), (28, 60), (0, 60)])
b.obj('_ground')
G('car_van', (1.6, 0, 0))
G('car_sport', (-2.0, 14, 0))
G('item_box', (1.5, 26, 1.2)); G('item_box', (-1.5, 26, 1.2))
G('checkpoint_gate', (0, 40, 0))
left = ['bld_d7_a', 'bld_d5_a', 'bld_d2_a', 'bld_d4_a', 'bld_d7_b', 'bld_d2_c']
right = ['bld_d4_b', 'bld_garage_main', 'bld_d5_d', 'bld_d7_d', 'bld_d3_b', 'bld_shop']
y = 14
for n in left:
    G(n, (-17, y, 0), -math.pi / 2); y += 19
y = 10
for n in right:
    G(n, (18, y, 0), math.pi / 2); y += 20
for k in range(10):
    G('lamp_post', (-6.5, 6 + k * 18, 0.12), -math.pi / 2)
    G('tree_a' if k % 2 else 'tree_b', (7.0, 16 + k * 18, 0.12))
G('landmark_tower', (30, 200, 0))
G('sky_dome', (0, 0, 0))
G('cloud_a', (-60, 300, 70)); G('cloud_c', (80, 260, 90))
for o in bpy.context.scene.objects:
    if o.name.startswith(('NitroFlame', 'Spoiler', 'Vinyl')):
        o.hide_render = True
sky = [o for o in bpy.context.scene.objects if o.name.startswith('sky_dome')]
toonify(0.03, skip=tuple(o.name for o in bpy.context.scene.objects if o.name.startswith(('sky_dome', '_ground', 'Vinyl'))))
for o in sky:
    for sl in o.material_slots:
        m = sl.material
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = bpy.data.images.load(os.path.join(TEX, 'sky_gradient.png'))
        nt.links.new(tn.outputs[0], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
preview_scene(sky='#a9d2ec')
camera((1.6, -6.8, 2.5), (1.6, 6, 1.0), lens=28, res=(960, 540))
render(os.path.join(ROOT, 'art', 'preview_street.png'))
camera((-30, -30, 40), (0, 60, 0), lens=30, res=(960, 540))
render(os.path.join(ROOT, 'art', 'preview_street_high.png'))
