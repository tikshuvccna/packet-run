# Packet Run art (Blender 5.2 headless -> GLB, Pillow -> textures/portraits)

Standalone: everything here is local (the portrait library under `blender/cast/` was copied from message-ship, no imports across repos).
Needs Blender 5.2 (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, env `BLENDER` overrides) and Python 3 with Pillow + numpy.

## Rebuild
```
python art/build_all.py                       # everything (~15 min)
python art/build_all.py tex cars city portraits previews   # any subset
blender -b --python art/blender/cars.py -- car_van wheel_std [noprev]
blender -b --python art/blender/city.py -- bld_d1_a tree_a ... | all [noprev]
python art/tex_pil.py vinyl road ground sky water fx
blender -b --python art/blender/cast/pr_render.py -- dina,gee,noise,hero_girl,hero_boy <ABS art/_raw>
python art/pack_portraits.py <ABS art/_raw>
python art/check_glb.py [name ...]            # GLB JSON check: contract node/material names, triangle limits
python art/sheet.py out.png cols cellw name...   # contact sheet of art/_raw/previews/<name>.png
```
Raw/intermediate output: `art/_raw/` (git-ignored): `previews/` (toon preview of every model), `manifest/` (per-model json ->
`public/assets/models/index.json`), `portraits/` (1024 raw renders), `portraits_ship/` (the original ship hero portraits).

Scripts: `blender/prlib.py` (mesh builder B, flat materials, GLB export, toon preview renderer), `blender/cars.py` (lofted superellipse
bodies, wheels, vinyl shells), `blender/kit.py` (building helpers), `blender/city.py` (driver + d1/d7 first buildings, lamp, tree_a),
`blender/bld_more.py` (all districts, garages, shop, fuel, tower), `blender/props.py` (props, track pieces, items, sky, sea),
`blender/preview_vinyl.py`, `blender/preview_street.py`, `blender/cast/` (portraits), `tex_pil.py`, `pack_portraits.py`.

## Conventions (all models)
1 unit = 1 m. glTF Y up, **front = -Z**. Base colours only, no baked light; the material NAME is the role (the engine makes toon
materials from the base colour). Origin = ground centre unless noted. Sizes/tris per model: `public/assets/models/index.json`
(`size` = [x, y(up), z] m, `min`/`max`, cars also `wheels` positions). Limits (checked): car 12k, building 3k, prop 800 tris.

## Cars `car_van|hatch|sport|jeep|super.glb` (11.0k-11.9k tris)
- Nodes: `Body` (origin on the ground under the car middle) with children `Vinyl`, `Spoiler`, `NitroFlame`; top-level `WheelFL`,
  `WheelFR`, `WheelRL`, `WheelRR` (origin = wheel centre, y = 0.34, spin about local X; left wheels have mirrored geometry).
- `Spoiler` and `NitroFlame` are visible in the file: hide them in code by default.
- Materials: `Paint` (replaced by code), `Trim` (second body colour: van cream, hatch white roof, sport/super carbon, jeep grey),
  `Glass` (dark: no driver visible), `Chrome`, `Rubber`, `Light_head`, `Light_tail`, `Emissive` (nitro flame), `Rim`, `VinylMat`;
  van also `Cargo`, `Tape` (roof parcels).
- `Vinyl`: white `VinylMat` shell 1.6 cm over the paint (sides, hood, roof) with UVs: u = 0 at the car FRONT -> 1 rear; on the sides
  v = bottom -> top, on hood/roof v runs across. Set map = `tex/vinyl_<id>.png`, color = vinylColor, transparent; no outline on it.
- Default wheels inside: van/hatch std, sport/super sport, jeep offroad (+ a spare on the back).
- Characters: van = friendly two-tone bus (round eyes, smile grille, roof rack); hatch = cute frog-eye mini; sport = long-hood GT with
  fender bulges; jeep = tall boxy 4x4 (7-slot grille, flares, light bar, snorkel); super = very low wedge, roof air-box, rear fins, canards.

## Wheels `wheel_std|sport|offroad.glb`
One node `Wheel`, a RIGHT-side wheel (rim faces +X), radius 0.34 (offroad tread to 0.35). Left side: scale.x = -1. Materials `Rubber`,
`Rim` (recolour for rim colour), `Chrome` (+ `Light_tail` brake caliper on sport).

## City (front/door/sign = -Z, face the road)
| district | models |
|---|---|
| 1 cable docks | `bld_d1_a` barrel-roof warehouse, `bld_d1_b` gantry crane, `bld_d1_c` container stack, `bld_d1_d` giant cable spool |
| 2 frames | `bld_d2_a` frame tower, `bld_d2_b` row houses, `bld_d2_c` header/payload/trailer house, `bld_d2_d` stacked frame rings |
| 3 routing hills | `bld_d3_a` cottage on a mound, `bld_d3_b` router-roof house on a mound, `bld_d3_c` arrow-sign mast, `bld_d3_d` house on an arch (road along X) |
| 4 ports | `bld_d4_a` doors 21 22 25 53, `bld_d4_b` gates 80 / 443, `bld_d4_c` port tower, `bld_d4_d` roundabout gatehouse |
| 5 conversation | `bld_d5_a` cafe + tables, `bld_d5_b` two houses + phone-cord bridge, `bld_d5_c` speech-bubble kiosk, `bld_d5_d` balcony flats |
| 6 cipher gardens | `bld_d6_a` giant padlock + hedge ring, `bld_d6_b` greenhouse + maze, `bld_d6_c` keyhole tower + key, `bld_d6_d` cipher-wheel pavilion |
| 7 apps | `bld_d7_a` app shop, `bld_d7_b` phone tower, `bld_d7_c` demo dome, `bld_d7_d` billboard mall |

Specials: `bld_garage_main` (Dina, wrench sign), `bld_garage_lesson06` (rule badges), `bld_garage_lesson07` (7 layer floors),
`bld_garage_lesson08` (nested containers), `bld_shop` (spray can + rim), `bld_fuel` (canopy, drive through along X), `landmark_tower`
(45 m, seven glowing floors, beacon). Building materials: `Wall`, `Wall2`, `Roof`, `Accent`, `Trim`, `Frame`, `Glass`, `Door`,
`Metal`, `Stone`, `Wood`, `Leaf`, `Emissive`, `Light_tail`, plus a few named colours (Icon0-5, P0-4, F0-3, Box0-5, ...).

Props: `tree_a` round, `tree_b` pine, `tree_c` palm, `tree_d` autumn, `tree_e` cypress, `tree_f` blossom, `bush`, `plant_flowers`,
`rock_a|b`, `lamp_post` (arm toward -Z), `traffic_light` (lamps `Light_red|Light_yellow|Light_green`), `fence` (4 m along X),
`sign_arrow`, `bench`, `crate`, `barrel`, `statue_small`.
Track: `ramp` (4 x 6 x 1.3 m, climb driving toward -Z), `bridge_piece` (12 m along Z, origin = deck TOP centre), `checkpoint_gate`
(12 m between pillars), `nitro_pad` (4 x 3, chevrons -> -Z).
Pickups: `item_box` (1.24 m, origin centre, '?' on 4 sides), `answer_box` (tint `Paint`, white `Label` panel on -Z for text), `coin`
(0.8 m, origin centre, spin about Y), `parcel` (origin centre, halo ring).
Throwables: `item_oil`, `item_cones` (ONE cone, scatter several), `item_glue`, `item_boostpad`, `item_mine` (magnet bubble with a face),
`item_smoke`. Sky/sea: `sky_dome` (r 900, inverted, `Sky` + tex/sky_gradient.png, render unlit/BackSide/no fog), `cloud_a|b|c`,
`sea_plane` (400 m, UV 0..40 -> tile tex/water.png).

## Textures `public/assets/tex/`
`vinyl_stripes|flames|stars|checker|net.png` (512, white on transparent), `road_asphalt|lines|crosswalk|curb|sidewalk.png` (512
seamless; road_lines: u across the road, v along, one tile = 8 m), `ground_grass|sand|dirt|pavement.png` (512 seamless), `water.png`
(256 seamless), `sky_gradient.png`, `sun.png` (additive glow), `skid.png` (128 x 512 tyre mark, u across, v along, seamless in v),
`speedlines.png` (512 radial streaks, screen overlay while boosting), `boost_ring.png` (256 additive ring), `coin_icon.png` (128 HUD).

## Portraits `public/assets/portraits/<who>_<mood>.png` (512, moods neutral/happy/worried/surprised, + index.json)
New: `dina` (elderly mechanic: red flowered headscarf with goggles, plaid shirt, denim overalls, grease smudge, wrench in pocket),
`gee` (GPS buddy, face on the screen, antenna, suction mount), `noise` (helmet with a dark visor, face hidden, glowing slit eyes,
violet glitch stripes, RGB-split + flaking letters pass). `hero_girl` / `hero_boy` re-rendered as couriers (racing jackets, headscarf /
cap). Kept from the ship: `uri`, `talia`, `barak`, `naama`, `bit` (sailor/keeper clothes).

## Previews (looked at)
`art/preview_cars.png`, `art/preview_cars_rear.png` (five cars with vinyls + spoilers), `art/preview_street.png` (chase cam at racing
scale), `art/preview_street_high.png`, `art/preview_portraits.png`; per-model toon previews in `art/_raw/previews/`.

## Known limitations
- Toon previews are an approximation; the engine's own toon + outline decides the final look.
- Vinyls stretch 3-6x along the side panels (round shapes are pre-squashed); they look narrower on the hood.
- Building windows are opaque (no interiors). Trees are faceted low-poly blobs by design.
- Sport and super share the lofted-wedge language; the super is set apart by height, wing, air-box and fins.
- Uri/Talia/Barak/Naama portraits still wear ship clothes.
