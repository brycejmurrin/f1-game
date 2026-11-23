#!/usr/bin/env python3
# @doc Blender-authors the garage LIGHT CUES (lights up, flashes, beacon, pulse, lights out, spot) into js/garage/scene.js.
"""Garage light cues, authored as Blender actions and exported as eased key tables.

  blender -b --python tools/gen/blender/garage-light-cues.py -- --output-dir artifacts/light-cues --write-runtime
  <venv with bpy>/bin/python tools/gen/blender/garage-light-cues.py -- --output-dir artifacts/light-cues --write-runtime

Every cue is one Empty ("<id> cue") whose custom properties are the light
channels GarageScene.live() applies (via cueSample) on top of the lighting mood:

  key, fill, wash   gains on the three FIXTURES banks (key 0-1, fill 2-5, wash 6-9)
  up, gantry        gains on the team-colour dado uplights and the night gantry
  tr, tg, tb        a tint multiplied onto every ceiling fixture (1 = none)
  flash             0..1, the press photographers' strobe (white, from the door)
  beacon, angle     0..1 gain and heading (radians) of the amber rotating beacon
  spot, spotx       0..1 gain of the white ceiling follow-spot; it aims at the
                    floor point (spotx m, 0, 4.4 * tan(angle) m) from above the car

Each property is keyframed with SINE / EASE_IN_OUT interpolation, except
`angle` and `spotx` (LINEAR: a beacon turns at a constant rate, a follow-spot
operator pans at one). The runtime
(GarageScene.cueSample, js/garage/scene.js) applies the same ease between the same keys, so the
exported keys ARE the curves; before writing, every channel is evaluated in
Blender at 240 Hz and checked against that runtime ease (max error printed).
Time is cue seconds from frame 1 at 24 fps. A `loop` cue repeats every `len`
seconds; a one-shot cue holds its last key, which is the identity (gain 1).

Original project-authored timing; references in the note.
"""
import bpy, math, json, argparse, sys, hashlib
from pathlib import Path

args = argparse.ArgumentParser()
args.add_argument('--output-dir', required=True)
args.add_argument('--write-runtime', action='store_true')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
root = Path(__file__).resolve().parents[3]
out = Path(opts.output_dir).resolve(); out.mkdir(parents=True, exist_ok=True)
FPS = 24
TAU = 2 * math.pi
CH = ['key', 'fill', 'wash', 'up', 'gantry', 'tr', 'tg', 'tb', 'flash', 'beacon', 'angle', 'spot', 'spotx']
DEF = dict(key=1, fill=1, wash=1, up=1, gantry=1, tr=1, tg=1, tb=1, flash=0, beacon=0, angle=0, spot=0, spotx=0)
LINEAR = {'angle', 'spotx'}

# ── the cues: { channel: [(t, v), …] } — unkeyed channels stay at DEF ────────
def strike(t0, low=0.04):
    """A bank of LED high-bays switching on: dark, a contactor click, one
    half-power stutter as the drivers settle, then full."""
    return [(0, low), (t0, low), (t0 + .06, .75), (t0 + .12, .35), (t0 + .22, 1.0)]

def pops(times, peak=1.0):
    """Press strobes: ~20 ms rise, ~110 ms tail, zero between. Speedlight
    flash durations are 1/1000 s or shorter, but a 60 Hz frame needs the tail
    to be seen; the irregular spacing is several photographers, not one."""
    keys = [(0, 0)]
    for j, (t, p) in enumerate(times):
        nxt = times[j + 1][0] if j + 1 < len(times) else 1e9
        keys += [(t - .001, 0), (t + .02, peak * p), (min(t + .13, nxt - .005), 0)]
    return keys

BEAT = lambda b: .9 * b + .1   # the five red beats, 1.0 … 4.6 s
FLASH_T = [(.18, 1.0), (.52, .7), (.61, .9), (1.24, 1.0), (1.71, .55), (1.80, .8), (2.46, 1.0),
           (2.98, .65), (3.07, .9), (3.15, .5), (3.62, 1.0)]

CUES = {
    # Bay fixtures switch on bank by bank as the shutter lifts (DOOR_S = 1.8 s
    # in js/garage/arrival.js): door-end washers first, then the fills, then
    # the keys over the car; the team uplights glow from the start.
    'lightsup': dict(label='LIGHTS UP', len=2.4, loop=False, ch=dict(
        wash=strike(.30), fill=strike(.85), key=strike(1.45, .02) + [(2.4, 1.0)],
        up=[(0, .6), (1.45, .6), (2.4, 1.0)])),
    # A race win back in the garage: the photographers' pool at the door.
    'flashes': dict(label='PHOTO FLASHES', len=4.0, loop=True, ch=dict(
        flash=pops(FLASH_T) + [(4.0, 0)], key=[(0, 1.1), (4.0, 1.1)], up=[(0, 1.6), (4.0, 1.6)])),
    # A retired car pushed back in: the bay drops to a working dim, warm, and
    # an amber recovery beacon turns over the door (~50 rev/min).
    'beacon': dict(label='AMBER BEACON', len=1.2, loop=True, ch=dict(
        key=[(0, .55), (1.2, .55)], fill=[(0, .5), (1.2, .5)], wash=[(0, .45), (1.2, .45)],
        up=[(0, .35), (1.2, .35)], tr=[(0, 1.06), (1.2, 1.06)], tg=[(0, .94), (1.2, .94)], tb=[(0, .80), (1.2, .80)],
        beacon=[(0, 1.0), (1.2, 1.0)], angle=[(0, 0), (1.2, TAU)])),
    # Team-colour breathing: the uplights swell while the keys ease back a
    # touch, one breath every 3.2 s.
    'pulse': dict(label='PULSE', len=3.2, loop=True, ch=dict(
        up=[(0, 1.0), (1.6, 2.6), (3.2, 1.0)], key=[(0, 1.0), (1.6, .86), (3.2, 1.0)],
        fill=[(0, 1.0), (1.6, .9), (3.2, 1.0)])),
    # LIGHTS OUT before the RACE! drive-out: five red beats (one per start
    # light, 0.9 s apart) deepen the ceiling to red while the room dims, a
    # 0.2 s blackout, then everything slams back on — away we go.
    'lightsout': dict(label='LIGHTS OUT', len=6.0, loop=False, ch=dict(
        tr=[(0, 1)] + [(BEAT(b), 1 + .08 * b) for b in range(1, 6)] + [(5.25, 1.4), (5.33, 1.0)],
        tg=[(0, 1)] + [(BEAT(b), 1 - .13 * b) for b in range(1, 6)] + [(5.25, .35), (5.33, 1.0)],
        tb=[(0, 1)] + [(BEAT(b), 1 - .13 * b) for b in range(1, 6)] + [(5.25, .35), (5.33, 1.0)],
        key=[(0, 1)] + [(BEAT(b), 1 - .1 * b) for b in range(1, 6)] + [(4.95, .5), (5.05, .03), (5.25, .03), (5.33, 1.25), (6.0, 1.0)],
        fill=[(0, 1)] + [(BEAT(b), 1 - .14 * b) for b in range(1, 6)] + [(4.95, .3), (5.05, .02), (5.25, .02), (5.33, 1.2), (6.0, 1.0)],
        wash=[(0, 1)] + [(BEAT(b), 1 - .15 * b) for b in range(1, 6)] + [(4.95, .25), (5.05, .02), (5.25, .02), (5.33, 1.2), (6.0, 1.0)],
        up=[(0, 1), (4.95, 1.4), (5.05, 0), (5.25, 0), (5.33, 2.4), (6.0, 1.0)])),
    # SPOTLIGHT reveal: the bay drops to a quarter while a hard white
    # follow-spot picks up the floor by the door, sweeps across the bay, back,
    # and settles straight down on the car; the room comes back to 0.6 under
    # it for the last second. It holds that look (spot on) after 4 s.
    'spotsweep': dict(label='SPOTLIGHT', len=4.0, loop=False, ch=dict(
        key=[(0, 1), (.4, .25), (3.0, .25), (4.0, .6)], fill=[(0, 1), (.4, .25), (3.0, .25), (4.0, .6)],
        wash=[(0, 1), (.4, .25), (3.0, .25), (4.0, .6)], up=[(0, 1), (.4, .4), (3.0, .4), (4.0, 1.0)],
        spot=[(0, 0), (.25, 1.0), (4.0, 1.0)],
        angle=[(0, .85), (1.2, .5), (2.4, .12), (3.0, 0)], spotx=[(0, -3.0), (1.2, 2.2), (2.4, -.6), (3.0, 0)])),
}

# ── BLENDER: one Empty per cue, custom properties keyframed ─────────────────
scene = bpy.context.scene
scene.render.fps = FPS
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
objs = {}
for cid, c in CUES.items():
    e = bpy.data.objects.new('%s cue' % cid, None); scene.collection.objects.link(e)
    e.empty_display_type = 'PLAIN_AXES'
    for k, keys in c['ch'].items():
        assert k in CH, k
        for t, v in keys:
            e[k] = float(v); e.keyframe_insert(data_path='["%s"]' % k, frame=1 + t * FPS)
    objs[cid] = e
    scene.frame_end = max(scene.frame_end, int(1 + c['len'] * FPS))

def fcurves(e):
    """The Empty's F-curves: Blender 4.x action.fcurves, or 5.x's layered
    action (layers → strips → channelbag)."""
    act = e.animation_data.action
    if hasattr(act, 'fcurves') and len(act.fcurves): return list(act.fcurves)
    res = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags: res += list(bag.fcurves)
    return res

for cid, e in objs.items():   # every key's interpolation, through either action layout
    for fc in fcurves(e):
        k = fc.data_path[2:-2]
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR' if k in LINEAR else 'SINE'; kp.easing = 'EASE_IN_OUT'
        fc.update()

# ── EXPORT ───────────────────────────────────────────────────────────────────
def r(v, n=4): return round(float(v), n)
def value(k, t, lin):   # the runtime's cueValue(), ported 1:1 (js/garage/scene.js)
    n = len(k)
    if not t > k[0]: return k[1]
    if t >= k[n - 2]: return k[n - 1]
    i = 2
    while k[i] < t: i += 2
    f = (t - k[i - 2]) / (k[i] - k[i - 2]); ez = f if lin else (1 - math.cos(math.pi * f)) / 2
    return k[i - 1] + (k[i + 1] - k[i - 1]) * ez

cues_out = {}; worst = (0.0, '')
for cid, c in CUES.items():
    e = objs[cid]; ch = {}
    for fc in sorted(fcurves(e), key=lambda f: CH.index(f.data_path[2:-2])):
        k = fc.data_path[2:-2]; seq = []
        for kp in fc.keyframe_points: seq += [r((kp.co.x - 1) / FPS), r(kp.co.y)]
        ch[k] = seq
        # Blender's own evaluation of the curve against the runtime ease.
        for i in range(int(c['len'] * 240) + 1):
            t = i / 240; b = fc.evaluate(1 + t * FPS); d = abs(b - value(seq, t, k in LINEAR))
            if d > worst[0]: worst = (d, '%s.%s t=%.3f blender %.4f runtime %.4f' % (cid, k, t, b, value(seq, t, k in LINEAR)))
    cues_out[cid] = dict(label=c['label'], len=c['len'], loop=c['loop'], lin=sorted(LINEAR & set(ch)), ch=ch)
assert worst[0] < 2e-3, 'runtime ease diverges from Blender: %.5f at %s' % worst

source_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
blend = out / 'garage-light-cues.blend'; scene.frame_set(1); bpy.ops.wm.save_as_mainfile(filepath=str(blend))
meta = dict(authoring='Blender ' + bpy.app.version_string, sourceSHA256=source_hash, maxEaseError=r(worst[0], 6),
            cues={k: dict(len=v['len'], loop=v['loop'], channels=sorted(v['ch'])) for k, v in cues_out.items()})
(out / 'garage-light-cues.json').write_text(json.dumps(dict(meta, data=cues_out), indent=1) + '\n')

if opts.write_runtime:   # js/garage/scene.js owns the cues (the eager shell has no room for a module)
    p = root / 'js/garage/scene.js'; text = p.read_text()
    start = text.index('// @blender-cues:start'); end = text.index('// @blender-cues:end', start)
    block = ('// @blender-cues:start\n// ' + meta['authoring'] + '; tools/gen/blender/garage-light-cues.py; SINE ease-in-out keys (angle, spotx LINEAR).\n'
             'const CUE_SHA256 = "' + source_hash + '";\nconst CUE_DATA = ' + json.dumps(cues_out, separators=(',', ':')) + ';\n')
    p.write_text(text[:start] + block + text[end:])
print(json.dumps(dict(blend=str(blend), cues=meta['cues'], maxEaseError=meta['maxEaseError'], authoring=meta['authoring'])))
