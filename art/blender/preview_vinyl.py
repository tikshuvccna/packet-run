"""Preview: the five cars side by side, each with a vinyl applied (+ spoiler), toon look."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from prlib import *
reset()
cars = [('car_van', 'flames', '#ffd166'), ('car_hatch', 'checker', '#2b2d36'), ('car_sport', 'stripes', '#ffffff'),
        ('car_jeep', 'stars', '#ffffff'), ('car_super', 'net', '#7ff0e4')]
for i, (c, v, col) in enumerate(cars):
    objs = import_glb(os.path.join(MODELS, c + '.glb'), loc=(i * 3.2 - 6.4, 0, 0))
    for o in objs:
        if o.name.startswith('NitroFlame'):
            o.hide_render = True
        for sl in getattr(o, 'material_slots', []):
            m = sl.material
            if m and m.name.startswith('VinylMat'):
                nm = 'VinylMat_' + c
                m.name = nm
                m['img'] = os.path.join(TEX, 'vinyl_%s.png' % v)
                m['hex'] = col
                m['emit'] = 0.0
toonify(0.018, skip=tuple(o.name for o in bpy.context.scene.objects if o.name.startswith('Vinyl')))
preview_scene(ground_size=30)
camera((11, 12, 6.5), (0, 0, 0.6), lens=40, res=(1400, 700))
render(os.path.join(ROOT, 'art', 'preview_cars.png'))
camera((-11, -12, 5.0), (0, 0, 0.6), lens=40, res=(1400, 700))
render(os.path.join(ROOT, 'art', 'preview_cars_rear.png'))
