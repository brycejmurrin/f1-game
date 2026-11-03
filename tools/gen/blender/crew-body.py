#!/usr/bin/env python3
# @doc Blender-authors the pit crew body (overalls, full-face helmet, gloves, pit shoes) into js/garage/crew-draw.js.
"""Pit crew body, authored as superellipse ring lofts and checked against ANSUR II.

  blender -b --factory-startup --python tools/gen/blender/crew-body.py -- \
    --output-dir artifacts/crew-body [--render] [--write-runtime]

Each part is a list of rings [t, rx, rz, cx, cz, slot] lofted with `sides`
segments of a superellipse of exponent `p` (js/garage/crew-draw.js lofts the
same table, so the exported rings ARE the mesh). Panels [slot, r0, r1, a0, a1]
recolour the bands r0..r1-1 whose mid-angle lies in [a0, a1] degrees (angle 0 =
+x, 90 = +z, or +y on the boot's z-axis loft). Slots: 0 overall, 1 accent,
2 trim, 3 lower leg, 4 visor, 5 glove, 6 sole.

Frames match GarageCrewMotion's rigid parts (js/garage/crew-motion.js): torso
in standing metres (+z front), limbs along +y from the proximal joint over the
rig's lengths (THIGH 0.43, SHIN 0.44, ARM 0.30 + the fist past the wrist; limb
fronts are local -z), the boot about the foot target with the sole at -0.08,
the helmet about the head centre (1.62 standing).

Body VARIANTS (stock / stocky / lean) scale ring radii without changing joint
lengths; ROLES (gunner / jack / lolli / carrier) add team-paint panel overlays
so one table dresses every pit-stop job. Both export into the same
@blender-body block as PARTS — compact, eager, no new script tag.

SIZES: ANSUR II male medians (US Army 2012 survey, 4,082 measured subjects;
https://www.openlab.psu.edu/ansur2/, ANSUR_II_MALE_Public.csv) plus overall
bulk: chest breadth 0.289 / depth 0.253, waist 0.325 x 0.234, hip breadth
0.344, buttock depth 0.246, trochanterion 0.899, femoral epicondyle 0.491,
thigh circumference 0.624, calf 0.392, forearm 0.310, wrist 0.176, hand
0.193 x 0.088, foot 0.271 x 0.102, head 0.154 x 0.200, tragion-to-top 0.131.
KIT: F1 Sporting Regulations art. 34.13 (helmet to ECE 22.05 / DOT / JIS T8133
and eye protection for anyone working on a car at a stop; adopted 2013 as art.
23.11 after the Nurburgring wheel incident: https://www.fia.com/news/fia-reinforces-f1-safety),
so a road-style full-face shell with chin bar and visor; one-piece fire-resistant
overalls with shoulder epaulettes and team-colour panels; gauntlet gloves;
reinforced knee pads; low pit shoes.

Blender XYZ = game X, -Z, Y. --render writes front / side / three-quarter
Workbench stills of the rest figure in a sample livery and a sheet.
"""
import bpy, bmesh, math, json, argparse, sys, hashlib, shutil, subprocess
from pathlib import Path

args = argparse.ArgumentParser()
args.add_argument('--output-dir', required=True)
args.add_argument('--render', action='store_true')
args.add_argument('--write-runtime', action='store_true')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
root = Path(__file__).resolve().parents[3]
out = Path(opts.output_dir).resolve(); out.mkdir(parents=True, exist_ok=True)

# ── THE BODY ─────────────────────────────────────────────────────────────────
PARTS = {
    # One-piece fire suit from the crotch to the collar: hips, an elastic waist
    # panel (trim), chest with a team patch, the shoulder yoke / epaulettes, a
    # trim collar. Side stripes and a back stripe read the secondary livery.
    'torso': dict(axis='y', sides=14, p=2.3, rings=[
        [0.83, 0, 0, 0, -0.01, 0], [0.86, 0.152, 0.112, 0, -0.012, 0], [0.92, 0.188, 0.138, 0, -0.012, 0],
        [0.985, 0.180, 0.130, 0, -0.006, 2], [1.035, 0.168, 0.120, 0, 0, 0], [1.17, 0.174, 0.130, 0, 0.014, 0],
        [1.30, 0.182, 0.138, 0, 0.018, 0], [1.375, 0.196, 0.122, 0, 0.008, 0], [1.435, 0.158, 0.100, 0, -0.002, 0],
        [1.47, 0.080, 0.074, 0, 0.004, 2], [1.515, 0.070, 0.066, 0, 0.008, 2], [1.525, 0, 0, 0, 0.008, 2]],
        panels=[[1, 4, 7, 335, 25], [1, 4, 7, 155, 205],            # side stripes (wider)
                [1, 4, 7, 70, 110],                                  # chest chevron / number panel
                [1, 4, 7, 250, 290],                                 # back stripe
                [1, 7, 9, 320, 40], [1, 7, 9, 140, 220]]),           # epaulettes + shoulder yoke
    # Full-face shell: taller crown, recessed eyeport, dark visor band, forward
    # chin bar, trim neck roll. Accent crown stripe wraps front and back.
    'head': dict(axis='y', sides=16, p=2.1, rings=[
        [0.170, 0, 0, 0, -0.010, 0], [0.160, 0.072, 0.088, 0, -0.012, 0], [0.134, 0.112, 0.132, 0, -0.008, 0],
        [0.092, 0.132, 0.154, 0, -0.002, 0], [0.040, 0.134, 0.152, 0, 0.002, 0], [-0.002, 0.130, 0.148, 0, 0.010, 0],
        [-0.040, 0.126, 0.152, 0, 0.016, 0], [-0.082, 0.116, 0.150, 0, 0.034, 0], [-0.122, 0.100, 0.134, 0, 0.038, 0],
        [-0.146, 0.082, 0.108, 0, 0.016, 2], [-0.150, 0, 0, 0, 0.016, 2]],
        panels=[[4, 4, 6, 42, 138],                                 # visor (wider eyeport)
                [1, 1, 4, 65, 115], [1, 1, 4, 245, 295],            # crown stripe
                [2, 7, 9, 50, 130]]),                               # chin-bar trim lip
    # Shoulder to elbow: accent deltoid cap (epaulette), sleeve stripe.
    'upper': dict(axis='y', sides=10, p=2, rings=[
        [-0.035, 0, 0, 0, 0, 0], [-0.02, 0.052, 0.052, 0, 0, 1], [0.02, 0.066, 0.064, 0, 0, 0],
        [0.10, 0.060, 0.058, 0, -0.004, 0], [0.19, 0.054, 0.056, 0, -0.006, 0], [0.28, 0.046, 0.046, 0, 0, 0],
        [0.315, 0.040, 0.040, 0, 0, 0], [0.33, 0, 0, 0, 0, 0]],
        panels=[[1, 3, 5, 200, 340]]),                              # outer-arm sleeve stripe
    # Elbow to wrist, trim cuff, then a flared gauntlet glove and a gripping fist.
    'fore': dict(axis='y', sides=10, p=2, rings=[
        [-0.03, 0, 0, 0, 0, 0], [-0.015, 0.042, 0.042, 0, 0, 0], [0.04, 0.052, 0.05, 0, 0, 0],
        [0.17, 0.043, 0.04, 0, 0, 0], [0.245, 0.038, 0.036, 0, 0, 2], [0.262, 0.040, 0.038, 0, 0, 5],
        [0.29, 0.036, 0.034, 0, 0, 5], [0.315, 0.030, 0.048, 0, -0.004, 5], [0.355, 0.033, 0.052, 0, -0.006, 5],
        [0.39, 0.031, 0.046, 0, -0.004, 5], [0.405, 0.022, 0.030, 0, 0, 5], [0.412, 0, 0, 0, 0, 5]]),
    # Hip to knee with a bulged front knee pad (gunners kneel on it).
    'thigh': dict(axis='y', sides=10, p=2, rings=[
        [-0.06, 0, 0, 0, 0, 0], [-0.045, 0.070, 0.075, 0, 0, 0], [0, 0.094, 0.098, 0, 0.004, 0],
        [0.09, 0.096, 0.098, 0, 0.002, 0], [0.24, 0.082, 0.084, 0, -0.002, 0], [0.355, 0.070, 0.074, 0, -0.006, 0],
        [0.42, 0.066, 0.072, 0, -0.012, 0], [0.465, 0.042, 0.048, 0, -0.008, 0], [0.475, 0, 0, 0, -0.006, 0]],
        panels=[[2, 5, 7, 215, 325], [1, 5, 7, 230, 310]]),         # pad shell + accent face
    # Knee to ankle, calf behind (+z on a limb), lower-leg slot (darker suit).
    'shin': dict(axis='y', sides=10, p=2, rings=[
        [-0.035, 0, 0, 0, 0, 3], [-0.02, 0.050, 0.052, 0, 0, 3], [0.03, 0.062, 0.064, 0, 0.004, 3],
        [0.12, 0.064, 0.068, 0, 0.010, 3], [0.26, 0.052, 0.054, 0, 0.006, 3], [0.38, 0.044, 0.044, 0, 0, 3],
        [0.44, 0.042, 0.042, 0, 0, 3], [0.46, 0, 0, 0, 0, 3]]),
    # Low pit shoe along +z (heel behind the ankle), flat sole 0.08 m below the
    # foot target on every ring (cy - ry = -0.08), accent side flash, darker sole.
    'boot': dict(axis='z', sides=12, p=3, rings=[
        [-0.078, 0, 0, 0, -0.035, 2], [-0.072, 0.044, 0.048, 0, -0.032, 2], [-0.048, 0.054, 0.062, 0, -0.018, 2],
        [0, 0.058, 0.066, 0, -0.014, 2], [0.06, 0.060, 0.052, 0, -0.028, 2], [0.13, 0.058, 0.036, 0, -0.044, 2],
        [0.18, 0.048, 0.026, 0, -0.054, 2], [0.198, 0.030, 0.018, 0, -0.062, 2], [0.204, 0, 0, 0, -0.070, 2]],
        panels=[[6, 0, 8, 215, 325], [1, 2, 5, 340, 20], [1, 2, 5, 160, 200]]),
}

# Compact body builds: scale ring radii (joint lengths unchanged). stock is identity.
# Runtime (GarageCrewDraw.body.resolve) re-seats boot cy so cy−ry stays −0.08.
VARIANTS = {
    'stock':  {'rx': 1.00, 'rz': 1.00},
    'stocky': {'rx': 1.06, 'rz': 1.07},
    'lean':   {'rx': 0.94, 'rz': 0.93},
}

# Role kit = extra paint panels on top of PARTS[name].panels (slot, r0, r1, a0, a1).
# Geometry stays shared so per-frame cost is flat; only the baked mesh colours differ.
ROLES = {
    'gunner': {   # wheel-gun operator: accent knee pad + cuff stripe
        'thigh': [[1, 5, 7, 200, 340]],
        'fore':  [[1, 4, 6, 0, 360]],
        'upper': [[1, 1, 3, 180, 360]],
    },
    'jack': {     # jack man: reinforced chest + forearm cuff
        'torso': [[1, 5, 8, 35, 145]],
        'fore':  [[2, 3, 5, 0, 360]],
    },
    'lolli': {    # lollipop / light-board operator: hi-vis shoulders
        'torso': [[1, 6, 9, 300, 60], [1, 6, 9, 120, 240]],
        'upper': [[1, 0, 3, 0, 360]],
        'head':  [[1, 0, 3, 0, 360]],
    },
    'carrier': {  # tyre carrier: shoulder + thigh accent bands
        'upper': [[1, 0, 4, 180, 360]],
        'thigh': [[1, 2, 5, 0, 360]],
        'fore':  [[1, 2, 4, 0, 360]],
    },
}

# ── THE LOFT (js/garage/crew-draw.js grid/slotOf, the same arithmetic) ───────
def se(v, e): return math.copysign(abs(v) ** e, v)
def grid(spec):
    n, e, g = spec['sides'], 2 / spec['p'], []
    for r in spec['rings']:
        row = []
        for j in range(n + 1):
            a = j / n * math.pi * 2; u = r[3] + r[1] * se(math.cos(a), e); v = r[4] + r[2] * se(math.sin(a), e)
            row.append((u, v, r[0]) if spec['axis'] == 'z' else (u, r[0], v))
        g.append(row)
    return g
def slot_of(spec, i, j):
    a = (j + .5) / spec['sides'] * 360; s = spec['rings'][i][5]
    for slot, r0, r1, a0, a1 in spec.get('panels', []):
        if r0 <= i < r1 and ((a0 <= a <= a1) if a0 <= a1 else (a >= a0 or a <= a1)): s = slot
    return s

def outward(spec, g):   # > 0 when the (i,j),(i+1,j),(i+1,j+1) winding faces out (GarageCrewDraw.body build)
    tot = 0
    for i in range(len(g) - 1):
        r = spec['rings'][i]; o = (r[3], r[4], r[0]) if spec['axis'] == 'z' else (r[3], r[0], r[4])
        for j in range(spec['sides']):
            d1 = [g[i + 1][j + 1][k] - g[i][j][k] for k in range(3)]; d2 = [g[i][j + 1][k] - g[i + 1][j][k] for k in range(3)]
            c = (d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0])
            tot += sum(c[k] * (g[i + 1][j + 1][k] - o[k]) for k in range(3))
    return tot

# ── CHECKS: the figure against ANSUR II (+ overall bulk) and the rig ────────
def width(name, t):   # full breadth (x) and depth of a part's ring at t (interpolated)
    rs = PARTS[name]['rings']
    for a, b in zip(rs, rs[1:]):
        if min(a[0], b[0]) <= t <= max(a[0], b[0]):
            f = (t - a[0]) / (b[0] - a[0]) if b[0] != a[0] else 0
            return 2 * (a[1] + (b[1] - a[1]) * f), 2 * (a[2] + (b[2] - a[2]) * f)
    raise ValueError(t)
checks = []
def check(label, value, lo, hi, ref):
    checks.append(dict(check=label, value=round(value, 3), lo=lo, hi=hi, ansur=ref, ok=lo <= value <= hi))
check('chest breadth', width('torso', 1.30)[0], .30, .38, .289); check('chest depth', width('torso', 1.30)[1], .25, .31, .253)
check('waist breadth', width('torso', 1.05)[0], .32, .37, .325); check('hip breadth', width('torso', .92)[0], .34, .40, .344)
check('buttock depth', width('torso', .92)[1], .24, .30, .246)
check('thigh circumference', math.pi * sum(width('thigh', .05)) / 2, .58, .70, .624)
check('calf circumference', math.pi * sum(width('shin', .12)) / 2, .38, .46, .392)
check('forearm circumference', math.pi * sum(width('fore', .04)) / 2, .29, .36, .310)
check('wrist circumference', math.pi * sum(width('fore', .29)) / 2, .18, .23, .176)
check('fist breadth', width('fore', .355)[1], .088, .11, .088)
check('foot length', PARTS['boot']['rings'][-1][0] - PARTS['boot']['rings'][0][0], .27, .30, .271)
check('foot breadth', 2 * max(r[1] for r in PARTS['boot']['rings']), .10, .13, .102)
hb, hl = width('head', .038)
check('helmet breadth', hb, .25, .29, .154); check('helmet length', hl, .29, .34, .200)
check('helmet top (stature 1.755 + shell)', 1.62 + PARTS['head']['rings'][0][0], 1.77, 1.81, 1.755)
check('helmet gap over the collar', 1.62 + PARTS['head']['rings'][-2][0] - 1.47, 0, .03, 0)
sole = [r[4] - r[2] for r in PARTS['boot']['rings'] if r[1] > 0]
check('flat sole at -0.08', max(abs(s + .08) for s in sole), 0, 1e-9, 0)
# Variants keep joint lengths and stay within a modest bulk envelope of stock.
for vid, sc in VARIANTS.items():
    assert abs(sc['rx'] - 1) <= 0.08 and abs(sc['rz'] - 1) <= 0.08, vid
assert set(VARIANTS) >= {'stock', 'stocky', 'lean'}
assert set(ROLES) >= {'gunner', 'jack', 'lolli', 'carrier'}
for role, parts in ROLES.items():
    for pname, panels in parts.items():
        assert pname in PARTS, '%s/%s' % (role, pname)
        for panel in panels:
            assert len(panel) == 5 and panel[0] in range(7), panel
bad = [c for c in checks if not c['ok']]
assert not bad, 'out of range: ' + json.dumps(bad)
tris = {k: sum(2 * v['sides'] - (v['sides'] if v['rings'][i][1] == 0 else 0) - (v['sides'] if v['rings'][i + 1][1] == 0 else 0)
               for i in range(len(v['rings']) - 1)) for k, v in PARTS.items()}
tris_fig = tris['torso'] + tris['head'] + 2 * sum(tris[k] for k in ('upper', 'fore', 'thigh', 'shin', 'boot'))
assert tris_fig <= 2200, 'triangle budget: %d' % tris_fig

# ── BLENDER: the rest figure in a sample livery ─────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
C1, C2 = (0.80, 0.08, 0.06), (0.95, 0.85, 0.10)   # a red / yellow sample livery
PAL = [C1, C2, (.06, .06, .07), tuple(c * .72 for c in C1), (.05, .06, .08), (.07, .07, .08), (.035, .035, .04)]
mats = []
for k, c in enumerate(PAL):
    m = bpy.data.materials.new('slot%d' % k); m.diffuse_color = (*c, 1); mats.append(m)
def xyz(p): return (p[0], -p[2], p[1])
def add_part(name, place):
    spec = PARTS[name]; g = grid(spec); n = spec['sides']; flip = outward(spec, g) < 0
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [[bm.verts.new(xyz(place(p))) for p in row] for row in g]
    for i in range(len(g) - 1):
        for j in range(n):
            quad = [vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]]
            if flip: quad.reverse()
            uniq = list(dict.fromkeys(quad))
            if len(uniq) < 3: continue
            try: f = bm.faces.new(uniq)
            except ValueError: continue
            f.material_index = slot_of(spec, i, j); f.smooth = True
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); return o
up = lambda dx, dy: (lambda p: (p[0] + dx, p[1] + dy, p[2]))
down = lambda dx, dy: (lambda p: (p[0] + dx, dy - p[1], -p[2]))   # a limb hanging: local -z faces front
add_part('torso', lambda p: p); add_part('head', up(0, 1.62))
for s in (1, -1):
    add_part('upper', down(s * .22, 1.38)); add_part('fore', down(s * .22, 1.08))
    add_part('thigh', down(s * .10, .91)); add_part('shin', down(s * .10, .48)); add_part('boot', up(s * .10, .08))

source_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
blend = out / 'crew-body.blend'; bpy.ops.wm.save_as_mainfile(filepath=str(blend))
report = dict(blend=str(blend), authoring='Blender ' + bpy.app.version_string, sourceSHA256=source_hash, triangles=tris,
              trianglesPerFigure=tris_fig, variants=list(VARIANTS), roles=list(ROLES), checks=checks)

if opts.render:
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'; scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = 420, 760; scene.render.film_transparent = False
    world = bpy.data.worlds.new('w'); world.color = (.62, .64, .68); scene.world = world
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.0
    aim = bpy.data.objects.new('Aim', None); aim.location = xyz((0, .92, 0)); scene.collection.objects.link(aim)
    t = cam.constraints.new('TRACK_TO'); t.target = aim; t.track_axis = 'TRACK_NEGATIVE_Z'; t.up_axis = 'UP_Y'
    stills = []
    for label, deg in (('front', 90), ('three-quarter', 45), ('side', 0), ('back', 270)):
        a = math.radians(deg); cam.location = xyz((6 * math.cos(a), .92, 6 * math.sin(a)))
        scene.render.filepath = str(out / ('crew-body-%s.png' % label)); bpy.ops.render.render(write_still=True); stills.append(scene.render.filepath)
    ff = shutil.which('ffmpeg')
    if ff:
        sheet = out / 'crew-body-sheet.png'
        subprocess.run([ff, '-y', '-loglevel', 'error', *sum((['-i', s] for s in stills), []), '-filter_complex', 'hstack=inputs=%d' % len(stills), str(sheet)], check=True)
        report['sheet'] = str(sheet)
    report['stills'] = stills

if opts.write_runtime:
    p = root / 'js/garage/crew-draw.js'; text = p.read_text()
    start = text.index('  // @blender-body:start'); end = text.index('  // @blender-body:end', start)
    block = ('  // @blender-body:start\n  // ' + report['authoring'] + '; tools/gen/blender/crew-body.py; superellipse ring lofts.\n'
             '  // Source SHA256: ' + source_hash + '\n'
             '  const PARTS = ' + json.dumps(PARTS, separators=(',', ':')) + ';\n'
             '  const VARIANTS = ' + json.dumps(VARIANTS, separators=(',', ':')) + ';\n'
             '  const ROLES = ' + json.dumps(ROLES, separators=(',', ':')) + ';\n')
    p.write_text(text[:start] + block + text[end:])
(out / 'crew-body.json').write_text(json.dumps(report, indent=1) + '\n')
print(json.dumps(dict(blend=report['blend'], trianglesPerFigure=report['trianglesPerFigure'], sheet=report.get('sheet'),
                      variants=report['variants'], roles=report['roles'],
                      checks=[(c['check'], c['value']) for c in checks])))
