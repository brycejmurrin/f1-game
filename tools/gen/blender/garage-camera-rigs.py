#!/usr/bin/env python3
# @doc Blender-authors moving garage camera rigs (crane, orbit, dolly, rear track) into js/garage/arrival.js.
"""Garage camera rigs, authored as animated Blender cameras and exported as sampled tables.

  python -m venv bpyenv && bpyenv/bin/pip install bpy==5.2.3      (or: blender -b --python ...)
  bpyenv/bin/python tools/gen/blender/garage-camera-rigs.py -- --output-dir artifacts/garage-camera-rigs --write-runtime

Each rig, for each garage sequence ("in" = pit stop, "out" = race start, "home"
= after the race), is a Blender camera (the EYE) with a Track To constraint on
an Empty (the AIM). The eye's location and the lens are keyframed by hand below
on the sequence's own beats (shutter open, car stopped in the lane, back-in
start, parked; or roll, doorway, gone); the ORBIT eye rides a keyed pivot's
rotation so it really circles the bay. The aim Empty is keyed every AIM_STEP s
on the real car path, sampled from js/garage/arrival.js through
tools/garage/arrival-poses.mjs (angle "left" = lane side +1), so the rigs frame
the motion the game plays. Every key is BEZIER / AUTO_CLAMPED (flat at holds,
an ease in and out of every move). The evaluated scene is sampled at N points of
sequence progress u = t / duration and written as integer centimetres (eye,
aim) and tenths of a degree (vertical fov) into the `@blender-rigs` block of
js/garage/arrival.js, whose rigSample() interpolates between them (Catmull-Rom)
and mirrors x for side -1.

Original project-authored camera work. Blender XYZ = game X, -Z, Y. Bay: metres,
+Y up, car parked at the origin nose to +Z, door plane z = +6.4; every eye stays
in x (-5.2, 5.2), y [0.3, 3.6], z (-6.2, 6.1) (scene.js culls a wall's props by
the eye's side; the overhead rig hangs from ~4 m).
"""
import bpy, math, json, argparse, sys, hashlib, subprocess
from pathlib import Path

args = argparse.ArgumentParser()
args.add_argument('--output-dir', required=True)
args.add_argument('--poses', help='arrival-poses.mjs JSON (--dir all --angle left); default: run it with node')
args.add_argument('--samples', type=int, default=49)   # 65 put the eager shell over its byte budget
args.add_argument('--write-runtime', action='store_true')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
root = Path(__file__).resolve().parents[3]
out = Path(opts.output_dir).resolve(); out.mkdir(parents=True, exist_ok=True)
FPS = 24
AIM_STEP = 0.25
N = opts.samples
BOUNDS = dict(x=(-5.2, 5.2), y=(0.3, 3.6), z=(-6.2, 6.1))

# ── the real car motion ──────────────────────────────────────────────────────
poses_path = Path(opts.poses).resolve() if opts.poses else out / 'poses.json'
if not opts.poses:
    subprocess.run(['node', str(root / 'tools/garage/arrival-poses.mjs'), '--dir', 'all', '--angle', 'left',
                    '--fps', str(FPS), '--out', str(poses_path)], check=True, cwd=root, stdout=subprocess.DEVNULL)
POSES = {c['dir']: c for c in json.loads(poses_path.read_text())['clips']}

def car_at(clip, t):
    f = clip['frames']; i = max(0, min(len(f) - 2, int(t * FPS)))
    a, b = f[i], f[i + 1]; k = 0 if b['t'] == a['t'] else max(0, min(1, (t - a['t']) / (b['t'] - a['t'])))
    return tuple(a[c] + (b[c] - a[c]) * k for c in ('x', 'z', 'yaw'))

def beats(clip):
    """The sequence's beats in seconds, read off the sampled poses."""
    f, L = clip['frames'], clip['length']
    first = lambda pred, dflt: next((x['t'] for x in f if pred(x)), dflt)
    door = first(lambda x: x['label'] != 'OPENING GARAGE', 1.8)
    if clip['dir'] == 'out':
        go = first(lambda x: x['z'] > 0.01, door + 1.1)
        at_door = first(lambda x: x['z'] > 6, go + 2.5)
        gone = first(lambda x: x['x'] >= 13.49, L - 0.3)
        return dict(door=door, go=go, atDoor=at_door, gone=gone, end=L)
    stop = first(lambda x: x['t'] > door and x['x'] >= 4.999, door + 2.6)
    back = first(lambda x: x['t'] > stop and x['x'] < 4.999, stop + 0.4)
    park = first(lambda x: x['t'] > back and abs(x['z']) < 0.001, L - 0.3)
    return dict(door=door, stop=stop, back=back, park=park, end=L)

smooth = lambda x: (lambda c: c * c * (3 - 2 * c))(max(0.0, min(1.0, x)))
def follow_aim(clip, t, b, h, kx=0.85, kz=0.85):
    """Where a rig looks: the shutter while it lifts, blending onto the car."""
    x, z, _ = car_at(clip, t)
    car = (max(-4.2, min(4.2, x * kx)), h, max(-2.0, min(9.0, z * kz)))
    w = smooth((t - (b["door"] - 0.9)) / 1.8)
    shutter = (0.0, 1.1, 6.2)
    return tuple(shutter[i] + (car[i] - shutter[i]) * w for i in range(3))

# ── THE RIGS (lane side +1) ──────────────────────────────────────────────────
# Eye keys: (beat expression -> seconds, (x, y, z), fov°). An ORBIT key is
# (seconds, (angle°, height, radius), fov°) about PIVOT, angle from +Z toward +X.
def rig_crane(d, b):
    if d == 'out':
        return [(0, (2.1, 3.3, 0.9), 50), (b['go'], (2.1, 3.3, 0.7), 50),
                (b['atDoor'] + 0.4, (1.5, 0.45, 4.7), 60), (b['end'], (1.8, 0.5, 5.1), 60)]
    # x >= 2.4: at x 1.6 the RECOVERY crew's pushers (1.65 m off the car's
    # centreline) walked under the low lens and whipped the crew-aware lift.
    return [(0, (2.6, 0.45, 3.4), 60), (b['back'], (2.7, 0.5, 3.1), 60),
            (b['park'] + 0.4, (2.5, 3.35, 1.2), 48), (b['end'], (2.4, 3.4, 0.8), 48)]

def rig_orbit(d, b):
    if d == 'out':
        return [(0, (125, 1.9, 4.4), 52), (b['go'], (125, 1.9, 4.4), 52),
                (b['atDoor'] + 0.5, (35, 1.4, 4.4), 56), (b['end'], (32, 1.4, 4.4), 56)]
    return [(0, (35, 1.4, 4.4), 56), (b['back'], (35, 1.4, 4.4), 56),
            (b['park'] + 0.3, (125, 1.9, 4.4), 52), (b['end'], (128, 1.95, 4.4), 52)]

def rig_dolly(d, b):
    if d == 'out':
        return [(0, (2.9, 1.2, -1.2), 54), (b['go'], (2.9, 1.2, -1.0), 54),
                (b['atDoor'] + 0.6, (2.9, 1.25, 5.6), 58), (b['end'], (2.8, 1.25, 5.7), 58)]
    # Inside the aperture (half-width 2.7): at x 3.0 the jamb covered half the
    # frame while a pushed retirement crept along the lane (2026-10-30 capture).
    return [(0, (1.7, 1.25, 5.3), 58), (b['back'], (2.0, 1.25, 4.9), 58),
            (b['park'], (2.9, 1.2, 0.4), 54), (b['end'], (2.9, 1.2, 0.1), 54)]

def rig_rear(d, b):
    if d == 'out':
        return [(0, (-0.8, 1.8, -5.6), 46), (b['go'], (-0.8, 1.8, -5.5), 46),
                (b['atDoor'] + 0.5, (-0.3, 1.0, 1.6), 56), (b['end'], (-0.2, 1.1, 2.4), 56)]
    return [(0, (-0.6, 1.3, -4.6), 52), (b['back'], (-0.6, 1.3, -4.6), 52),
            (b['park'], (-0.9, 1.9, -5.7), 44), (b['end'], (-0.9, 1.95, -5.75), 44)]

PIVOT = (0.0, 0.5)   # game x, z the ORBIT circles
RIGS = {
    'crane': dict(label='CRANE', keys=rig_crane, aimY=0.35),
    'orbit': dict(label='ORBIT', keys=rig_orbit, aimY=0.6, orbit=True),
    'dolly': dict(label='DOLLY', keys=rig_dolly, aimY=0.7),
    'rear': dict(label='REAR TRACK', keys=rig_rear, aimY=0.75),
}

# ── Blender scene ────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
prefs = bpy.context.preferences.edit
prefs.keyframe_new_interpolation_type = 'BEZIER'; prefs.keyframe_new_handle_type = 'AUTO_CLAMPED'
scene = bpy.context.scene; scene.render.fps = FPS
B = lambda x, y, z: (x, -z, y)        # game -> Blender
G = lambda v: (v[0], v[2], -v[1])     # Blender -> game
frame = lambda t: 1 + t * FPS
lens_for = lambda fov: 12 / math.tan(math.radians(fov) / 2)   # sensor 24 mm, fit VERTICAL
fov_for = lambda lens: math.degrees(2 * math.atan(12 / lens))

def empty(name):
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e); return e

objs = {}
for rid, rig in RIGS.items():
    for d, clip in POSES.items():
        b = beats(clip); name = '%s.%s' % (rid, d)
        aim = empty(name + '.aim')
        cam = bpy.data.objects.new(name + '.eye', bpy.data.cameras.new(name)); scene.collection.objects.link(cam)
        cam.data.sensor_fit = 'VERTICAL'; cam.data.sensor_height = 24
        con = cam.constraints.new('TRACK_TO'); con.target = aim; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
        pivot = None
        if rig.get('orbit'):
            pivot = empty(name + '.pivot'); pivot.location = B(PIVOT[0], 0, PIVOT[1]); cam.parent = pivot
        for t, v, fov in rig['keys'](d, b):
            t = min(t, clip['length'])   # a beat + lead past the end lands on the last frame
            if pivot:
                ang, h, rad = v
                pivot.rotation_euler = (0, 0, math.radians(ang)); pivot.keyframe_insert('rotation_euler', index=2, frame=frame(t))
                cam.location = (0, -rad, h)
            else:
                cam.location = B(*v)
            cam.keyframe_insert('location', frame=frame(t))
            cam.data.lens = lens_for(fov); cam.data.keyframe_insert('lens', frame=frame(t))
        t = 0.0
        while True:
            aim.location = B(*follow_aim(clip, t, b, rig['aimY'])); aim.keyframe_insert('location', frame=frame(t))
            if t >= clip['length']: break
            t = min(clip['length'], t + AIM_STEP)
        objs[(rid, d)] = (cam, aim)

# ── sample and validate ──────────────────────────────────────────────────────
r = lambda v: int(round(v * 100))
data, worst = {}, dict(step=0.0, where='')
for rid, rig in RIGS.items():
    entry = dict(label=rig['label'], n=N)
    for d, clip in POSES.items():
        cam, aim = objs[(rid, d)]; L = clip['length']; seq = []; prev = None
        for i in range(N):
            t = L * i / (N - 1); f = frame(t)
            scene.frame_set(int(math.floor(f)), subframe=f % 1)
            eye = G(cam.matrix_world.translation); at = G(aim.matrix_world.translation)
            for k, c in enumerate('xyz'):
                lo, hi = BOUNDS[c]
                assert lo < eye[k] < hi, '%s.%s eye %s=%.3f out of the bay at t=%.2f' % (rid, d, c, eye[k], t)
            if prev:
                step = math.dist(eye, prev)
                if step > worst['step']: worst = dict(step=round(step, 3), where='%s.%s t=%.2f' % (rid, d, t))
            prev = eye
            seq += [r(eye[0]), r(eye[1]), r(eye[2]), r(at[0]), r(at[1]), r(at[2]), int(round(fov_for(cam.data.lens) * 10))]
        entry[d] = seq
    data[rid] = entry
assert worst['step'] < 1.0, 'an eye jumps %.2f m between samples at %s' % (worst['step'], worst['where'])

source_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
authoring = 'Blender ' + bpy.app.version_string + (' (bpy module)' if bpy.app.background and not bpy.app.binary_path else '')
blend = out / 'garage-camera-rigs.blend'; scene.frame_set(1); bpy.ops.wm.save_as_mainfile(filepath=str(blend))
meta = dict(authoring=authoring, sourceSHA256=source_hash, samples=N, maxEyeStep=worst,
            lengths={d: c['length'] for d, c in POSES.items()},
            beats={d: {k: round(v, 3) for k, v in beats(c).items()} for d, c in POSES.items()})
(out / 'garage-camera-rigs.json').write_text(json.dumps(dict(meta, data=data), indent=1) + '\n')

# Packed for the runtime: each integer as two base64url characters, offset 2048 (a JSON
# number list put the eager shell over its byte budget; arrival.js unpacks it at load).
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
def pack(seq):
    assert all(-2048 <= v < 2048 for v in seq), 'a rig value outside the packed range'
    return ''.join(B64[(v + 2048) >> 6] + B64[(v + 2048) & 63] for v in seq)
packed = {rid: {k: pack(v) if isinstance(v, list) else v for k, v in e.items()} for rid, e in data.items()}

if opts.write_runtime:
    p = root / 'js/garage/arrival.js'; text = p.read_text()
    start = text.index('  // @blender-rigs:start'); end = text.index('  // @blender-rigs:end', start)
    block = ('  // @blender-rigs:start\n  // ' + authoring + '; tools/gen/blender/garage-camera-rigs.py; ' + str(N) +
             ' samples over u: eye, aim (cm), fov (0.1 deg), two base64url chars each (+2048).\n  // Source SHA256: ' + source_hash +
             '\n  const RIGS = ' + json.dumps(packed, separators=(',', ':')) + ';\n')
    p.write_text(text[:start] + block + text[end:])
print(json.dumps(dict(blend=str(blend), authoring=authoring, samples=N, maxEyeStep=worst, beats=meta['beats'])))
