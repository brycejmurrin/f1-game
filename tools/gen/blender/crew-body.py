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
overalls with shoulder epaulettes; gauntlet gloves; low pit shoes.

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
    # One-piece overall from the crotch to the collar: hips over the buttocks,
    # an elastic waist panel (trim), chest, the shoulder yoke, a trim collar.
    'torso': dict(axis='y', sides=14, p=2.3, rings=[
        [0.83, 0, 0, 0, -0.01, 0], [0.86, 0.15, 0.11, 0, -0.012, 0], [0.92, 0.185, 0.135, 0, -0.012, 0],
        [0.985, 0.178, 0.128, 0, -0.006, 2], [1.035, 0.17, 0.122, 0, 0, 0], [1.17, 0.172, 0.128, 0, 0.012, 0],
        [1.30, 0.178, 0.135, 0, 0.016, 0], [1.375, 0.19, 0.12, 0, 0.006, 0], [1.435, 0.155, 0.098, 0, -0.004, 0],
        [1.47, 0.078, 0.072, 0, 0.004, 2], [1.515, 0.068, 0.064, 0, 0.008, 2], [1.525, 0, 0, 0, 0.008, 2]],
        panels=[[1, 4, 7, 340, 20], [1, 4, 7, 160, 200],            # side stripes
                [1, 7, 8, 330, 30], [1, 7, 8, 150, 210],            # epaulettes
                [1, 5, 6, 62, 118]]),                              # chest patch
    # Full-face shell: crown, eyeport, visor band, chin bar, trim neck roll.
    'head': dict(axis='y', sides=16, p=2.1, rings=[
        [0.168, 0, 0, 0, -0.012, 0], [0.158, 0.07, 0.085, 0, -0.012, 0], [0.132, 0.11, 0.13, 0, -0.008, 0],
        [0.09, 0.13, 0.152, 0, -0.004, 0], [0.038, 0.136, 0.158, 0, 0, 0], [-0.004, 0.134, 0.158, 0, 0.006, 0],
        [-0.042, 0.128, 0.155, 0, 0.012, 0], [-0.085, 0.118, 0.146, 0, 0.026, 0], [-0.125, 0.102, 0.128, 0, 0.03, 0],
        [-0.148, 0.084, 0.104, 0, 0.012, 2], [-0.152, 0, 0, 0, 0.012, 2]],
        panels=[[4, 4, 6, 48, 132],                                 # visor
                [1, 1, 4, 70, 110], [1, 1, 4, 250, 290]]),          # crown stripe, front and back
    # Shoulder to elbow: deltoid cap in the accent (the epaulette), biceps forward.
    'upper': dict(axis='y', sides=10, p=2, rings=[
        [-0.035, 0, 0, 0, 0, 0], [-0.02, 0.05, 0.05, 0, 0, 1], [0.02, 0.064, 0.062, 0, 0, 0],
        [0.10, 0.060, 0.058, 0, -0.004, 0], [0.19, 0.054, 0.056, 0, -0.006, 0], [0.28, 0.046, 0.046, 0, 0, 0],
        [0.315, 0.04, 0.04, 0, 0, 0], [0.33, 0, 0, 0, 0, 0]]),
    # Elbow to wrist (0.30, the rig's hand target), a trim cuff, then the
    # gauntlet glove and a gripping fist 0.11 m past the wrist, broad front-back.
    'fore': dict(axis='y', sides=10, p=2, rings=[
        [-0.03, 0, 0, 0, 0, 0], [-0.015, 0.042, 0.042, 0, 0, 0], [0.04, 0.052, 0.05, 0, 0, 0],
        [0.17, 0.043, 0.04, 0, 0, 0], [0.245, 0.036, 0.034, 0, 0, 2], [0.262, 0.037, 0.035, 0, 0, 5],
        [0.29, 0.034, 0.032, 0, 0, 5], [0.315, 0.028, 0.046, 0, -0.004, 5], [0.355, 0.031, 0.05, 0, -0.006, 5],
        [0.39, 0.03, 0.044, 0, -0.004, 5], [0.405, 0.022, 0.03, 0, 0, 5], [0.412, 0, 0, 0, 0, 5]]),
    # Hip to knee, a trim knee pad on the front (the gunners kneel).
    'thigh': dict(axis='y', sides=10, p=2, rings=[
        [-0.06, 0, 0, 0, 0, 0], [-0.045, 0.07, 0.075, 0, 0, 0], [0, 0.094, 0.098, 0, 0.004, 0],
        [0.09, 0.096, 0.098, 0, 0.002, 0], [0.24, 0.082, 0.084, 0, -0.002, 0], [0.36, 0.066, 0.068, 0, -0.004, 0],
        [0.43, 0.06, 0.064, 0, -0.008, 0], [0.465, 0.04, 0.045, 0, -0.006, 0], [0.475, 0, 0, 0, -0.006, 0]],
        panels=[[2, 5, 7, 225, 315]]),
    # Knee to ankle, the calf behind (+z on a limb), in the lower-leg slot.
    'shin': dict(axis='y', sides=10, p=2, rings=[
        [-0.035, 0, 0, 0, 0, 3], [-0.02, 0.05, 0.052, 0, 0, 3], [0.03, 0.062, 0.064, 0, 0.004, 3],
        [0.12, 0.064, 0.068, 0, 0.01, 3], [0.26, 0.052, 0.054, 0, 0.006, 3], [0.38, 0.044, 0.044, 0, 0, 3],
        [0.44, 0.042, 0.042, 0, 0, 3], [0.46, 0, 0, 0, 0, 3]]),
    # Low pit shoe along +z (heel behind the ankle), a flat sole 0.08 m below
    # the foot target on every ring (cy - ry = -0.08), an accent side flash.
    'boot': dict(axis='z', sides=12, p=3, rings=[
        [-0.078, 0, 0, 0, -0.035, 2], [-0.072, 0.042, 0.045, 0, -0.035, 2], [-0.05, 0.052, 0.06, 0, -0.02, 2],
        [0, 0.056, 0.065, 0, -0.015, 2], [0.06, 0.058, 0.05, 0, -0.03, 2], [0.13, 0.058, 0.035, 0, -0.045, 2],
        [0.18, 0.048, 0.025, 0, -0.055, 2], [0.198, 0.03, 0.018, 0, -0.062, 2], [0.204, 0, 0, 0, -0.07, 2]],
        panels=[[6, 0, 8, 215, 325], [1, 3, 5, 345, 15], [1, 3, 5, 165, 195]]),
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
bad = [c for c in checks if not c['ok']]
assert not bad, 'out of range: ' + json.dumps(bad)
tris = {k: sum(2 * v['sides'] - (v['sides'] if v['rings'][i][1] == 0 else 0) - (v['sides'] if v['rings'][i + 1][1] == 0 else 0)
               for i in range(len(v['rings']) - 1)) for k, v in PARTS.items()}

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
              trianglesPerFigure=tris['torso'] + tris['head'] + 2 * sum(tris[k] for k in ('upper', 'fore', 'thigh', 'shin', 'boot')),
              checks=checks)

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
             '  // Source SHA256: ' + source_hash + '\n  const PARTS = ' + json.dumps(PARTS, separators=(',', ':')) + ';\n')
    p.write_text(text[:start] + block + text[end:])
(out / 'crew-body.json').write_text(json.dumps(report, indent=1) + '\n')
print(json.dumps(dict(blend=report['blend'], trianglesPerFigure=report['trianglesPerFigure'], sheet=report.get('sheet'),
                      checks=[(c['check'], c['value']) for c in checks])))
