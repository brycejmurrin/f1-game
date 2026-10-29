#!/usr/bin/env python3
# @doc Blender-authors garage enter/leave crew variants and the in-race pit crew into js/garage/crew-choreo.js.
"""Crew choreography, authored as Blender actions and exported as eased key tables.

  blender -b --python tools/gen/blender/crew-choreo.py -- --output-dir artifacts/crew-choreo --write-runtime [--render]

Every crew member is an Empty whose location (bay metres), Z rotation (yaw) and
custom properties (crouch, lean, handY, reach, wave, hold) are keyframed with
SINE / EASE_IN_OUT interpolation. The runtime (js/garage/crew-choreo.js) applies
the same ease between the same keys, so the exported keys ARE the curves; no
dense sampling ships. `walk` (the gait phase GarageCrewMotion replays) is the
signed distance each body travels along its own facing, integrated here from the
evaluated world matrices. A member attached to the car (the PUSH-OUT crew) is
baked from the car proxy's animated path into linear keys at 12 Hz.

Original project-authored motion. Blender XYZ = game X, -Z, Y; game yaw = Blender
Z rotation (forward is local -Y). Garage clips are authored for the lane side +1
and mirrored at runtime; the pit clip is car-local (nose +Z), its time is the
stop's service fraction u scaled by PIT_LEN seconds.
"""
import bpy, math, json, argparse, sys, hashlib
from pathlib import Path

args = argparse.ArgumentParser()
args.add_argument('--output-dir', required=True)
args.add_argument('--write-runtime', action='store_true')
args.add_argument('--render', action='store_true', help='Cycles CPU top-down stills of each clip')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
root = Path(__file__).resolve().parents[3]
out = Path(opts.output_dir).resolve(); out.mkdir(parents=True, exist_ok=True)
FPS = 24
PI = math.pi

# ── js/garage/arrival.js timing, ported (side +1) ────────────────────────────
DOOR_S, IN_LANE, IN_LANE_M, IN_PAUSE, IN_BACK = 1.8, 2.6, 22, .4, 3.6
DURATION = DOOR_S + IN_LANE + IN_PAUSE + IN_BACK + .3
OUT_STRAIGHT, OUT_R, OUT_TURN = 8, 5, PI / 2
OUT_PATH = OUT_STRAIGHT + OUT_R * OUT_TURN
OUT_HOLD, OUT_RUN, OUT_ACCEL, OUT_EXIT_M = 1.1, 5.0, 1.2, 8.5
OUT_V = OUT_PATH / (OUT_RUN - OUT_ACCEL / 2)
OUT_EXIT = OUT_EXIT_M / OUT_V
PIT_LEN = 2.2   # PitLane BOX_S: the pit clip spans the service half of a stop
ease = lambda x: (lambda c: c * c * (3 - 2 * c))(max(0, min(1, x)))

def path_at(s):
    th = min(OUT_TURN, max(0, s - OUT_STRAIGHT) / OUT_R); past = max(0, s - OUT_PATH)
    z = (max(0, s) if s < OUT_STRAIGHT else OUT_STRAIGHT + OUT_R * math.sin(th)) + past * math.cos(th)
    return (OUT_R * (1 - math.cos(th)) + past * math.sin(th), z, th)

def out_distance(tm):
    if tm <= 0: return 0
    if tm < OUT_ACCEL: return OUT_V * tm * tm / (2 * OUT_ACCEL)
    return OUT_V * (min(tm, OUT_RUN + OUT_EXIT) - OUT_ACCEL / 2)

def car_in(t):
    u = max(0, min(1, (t - DOOR_S) / IN_LANE)); lane = IN_LANE_M * (1 - (1 - u) ** 2)
    back = ease((t - DOOR_S - IN_LANE - IN_PAUSE) / IN_BACK)
    return path_at(OUT_PATH * (1 - back)) if back > 0 else (OUT_R + lane - IN_LANE_M, OUT_STRAIGHT + OUT_R, OUT_TURN)

def car_out(t, extra):
    return path_at(out_distance(t - DOOR_S - OUT_HOLD - extra))

# ── THE CLIPS ────────────────────────────────────────────────────────────────
# K(t, channel=value…): a key on the listed channels only; a channel holds its
# last value until its next key. Defaults below. Units: metres, radians, s.
DEF = dict(x=0, z=0, yaw=0, crouch=0, lean=0, handY=.85, reach=.03, wave=0, hold=0)
def K(t, **ch): return (t, ch)
def face(x, z, tx, tz): return math.atan2(tx - x, tz - z)
# Poses as channel bundles (hand height is absolute, reach is body-forward).
STAND = dict(crouch=0, lean=0, handY=.85, reach=.03, wave=0)
UP = dict(crouch=0, lean=0, handY=1.62, reach=.25, wave=0)                # hand raised: "done" / thumbs up
CHEER = dict(crouch=0, lean=0, handY=1.88, reach=.12, wave=.6)
CLAP = dict(crouch=0, lean=0, handY=1.28, reach=.30, wave=1)
CALL = dict(crouch=0, lean=.04, handY=1.50, reach=.45, wave=1)            # "keep coming" arm calls
TYRE = dict(crouch=.40, lean=.28, handY=.46, reach=.42, wave=.3)         # crouched over a tyre
WING = dict(crouch=.34, lean=.26, handY=.50, reach=.46, wave=.2)         # crouched at a wing endplate
TABLET = dict(crouch=0, lean=.06, handY=1.12, reach=.32, wave=0, hold=1)
JACK = dict(crouch=.12, lean=.20, handY=.92, reach=.50, hold=1)
PUMP = dict(crouch=.24, lean=.32, handY=.64, reach=.60, hold=1)
GUN = dict(crouch=.45, lean=.26, handY=.42, reach=.50, hold=1)
BACK = dict(crouch=.40, lean=.04, handY=.50, reach=.22, wave=0, hold=1)  # gun clear while the wheel slides
HUB = dict(crouch=.36, lean=.26, handY=.50, reach=.55, wave=0)           # tyre man's hands on the tread

def walker(x, z, yaw, *keys, prop='none', car=False):
    return dict(prop=prop, car=car, keys=[K(0, x=x, z=z, yaw=yaw)] + list(keys))
def go(t0, t1, x0, z0, x1, z1, end_yaw=None, **ch):
    """Walk (x0,z0)→(x1,z1) between t0 and t1, facing the way of travel, then turn."""
    h = face(x0, z0, x1, z1); keys = [K(t0, x=x0, z=z0, yaw=h), K(t0 + .25, yaw=h), K(t1, x=x1, z=z1, **ch)]
    if end_yaw is not None: keys.append(K(t1 + .35, yaw=end_yaw))
    return keys
def back_off(t0, t1, x0, z0, x1, z1, **ch):
    """Step (x0,z0)→(x1,z1) backwards, keeping the current facing."""
    return [K(t0, x=x0, z=z0), K(t1, x=x1, z=z1, **ch)]

ENTER_END = DURATION
CLIPS = {}
# MARSHAL: one mechanic walks out under the lane and calls the car back; two
# meet it as it parks — one at the front wing, one at the rear tyre.
CLIPS['marshal'] = dict(dir='in', extra=1.6, label='MARSHAL CREW', actors=[
    walker(1.7, 4.6, 0, *go(1.6, 3.4, 1.7, 4.6, 3.1, 9.7, end_yaw=-1.1),
           K(3.8, **CALL), K(5.6, yaw=-.74), K(6.8, yaw=-2.4), K(7.2, **STAND),
           *go(7.4, 8.8, 3.1, 9.7, 2.2, 3.4, end_yaw=-PI / 2), K(9.3, **UP)),
    walker(-2.7, -4.4, .6, K(6.2, x=-2.7, z=-4.4), *go(6.4, 7.9, -2.7, -4.4, -2.0, 3.6, end_yaw=PI / 2),
           K(8.6, **STAND), K(9.0, **WING), K(10.0, **STAND)),
    walker(2.8, -4.6, -.5, K(8.3, x=2.8, z=-4.6), *go(8.4, 9.4, 2.8, -4.6, 1.55, -2.6, end_yaw=-PI / 2),
           K(9.8, **TYRE), K(10.3, **TYRE)),
])
# INSPECTION: four mechanics wait at the side walls, walk in once the car has
# parked, crouch over each tyre and step back; an engineer brings a tablet.
ins = []
for i, (x, z) in enumerate([(-3.3, 1.7), (3.3, 1.7), (-3.3, -1.6), (3.3, -1.6)]):
    s, t = (1 if x > 0 else -1), 8.5 + .15 * i
    ins.append(walker(x, z, -s * PI / 2, K(t, x=x, z=z), K(t + 1.2, x=s * 1.6, z=z), K(t + 1.5, **TYRE),
                      K(t + 3.0, **STAND), K(t + 3.1, x=s * 1.6, z=z), K(t + 4.0, x=s * 2.6, z=z)))
ins.append(walker(-4.2, -4.8, .5, K(8.5, x=-4.2, z=-4.8, **TABLET), *go(8.6, 10.2, -4.2, -4.8, -1.75, -.2, end_yaw=PI / 2),
                  K(10.8, lean=.22), K(12.2, lean=.06), prop='tablet'))
CLIPS['inspect'] = dict(dir='in', extra=4.2, label='INSPECTION CREW', actors=ins)
# DEBRIEF: an engineer and a mechanic lean into either side of the cockpit,
# another checks the nose, then the crew claps the driver in.
CLIPS['debrief'] = dict(dir='in', extra=3.4, label='DEBRIEF CREW', actors=[
    walker(-4.0, -3.2, .9, K(8.4, x=-4.0, z=-3.2, **TABLET), *go(8.5, 9.9, -4.0, -3.2, -1.5, .25, end_yaw=PI / 2),
           K(10.4, lean=.32, reach=.38, handY=1.15), K(11.6, lean=.06, reach=.32, handY=1.12), prop='tablet'),
    walker(3.6, 1.0, -PI / 2, K(8.5, x=3.6, z=1.0), *go(8.5, 9.6, 3.6, 1.0, 1.45, .35, end_yaw=-PI / 2),
           K(10.0, crouch=.05, lean=.38, handY=1.0, reach=.6), K(11.3, crouch=.05, lean=.38, handY=1.0, reach=.6), K(11.7, **CLAP)),
    walker(2.2, 4.6, -2.4, K(8.6, x=2.2, z=4.6), *go(8.6, 9.6, 2.2, 4.6, 0, 3.6, end_yaw=-PI),
           K(10.0, **WING), K(11.2, **WING), K(11.6, **STAND)),
    walker(-3.6, -2.0, PI / 2, K(10.9, **STAND), K(11.3, **CLAP)),
])
# SEND-OFF: six crew line the doorway, arms up as the car rolls out, then clap.
send = []
for s in (1, -1):
    for x, z in [(2.05, 5.3), (2.75, 4.5), (3.5, 3.6)]:
        send.append(walker(s * x, z, -s * (PI / 2 - .35), K(2.0 + .1 * x, **STAND), K(2.6 + .1 * x, **CHEER), K(6.6, **CHEER), K(7.1, **CLAP)))
CLIPS['sendoff'] = dict(dir='out', extra=.6, label='SEND-OFF CREW', actors=send)
# PUSH-OUT: two mechanics on the rear wing push the car off its marks, let go
# as it picks up speed and wave it away; a third points it down the lane.
CLIPS['pushout'] = dict(dir='out', extra=0, label='PUSH-OUT CREW', actors=[
    walker(s * .5, -4.6, 0, K(.3, x=s * .5, z=-4.6), K(1.6, x=s * .5, z=-3.35, crouch=.1, lean=.22, handY=.92, reach=.5),
           K(DOOR_S + OUT_HOLD + .8, car=1), K(DOOR_S + OUT_HOLD + 1.3, **STAND), K(DOOR_S + OUT_HOLD + 1.8, **dict(UP, wave=.7)),
           K(6.4, **dict(UP, wave=.7)), K(6.8, **STAND), prop='none', car=True) for s in (1, -1)] + [
    walker(2.2, 3.0, -PI / 2 + .3, K(1.8, **STAND), K(2.2, crouch=0, lean=.05, handY=1.45, reach=.6, wave=.2), K(4.0, **CHEER), K(6.5, **CHEER), K(7.0, **CLAP)),
])
# FINAL CHECK: the car is held while a mechanic checks a front and a rear tyre,
# another the front wing, the engineer the cockpit; all step back, thumbs up.
CLIPS['check'] = dict(dir='out', extra=3.0, label='FINAL CHECK CREW', actors=[
    walker(-1.6, 1.7, PI / 2, K(0, **TYRE), K(2.6, **TYRE), K(2.9, **STAND), *back_off(3.0, 4.2, -1.6, 1.7, -3.4, 1.9), K(4.6, **UP), K(6.8, **UP)),
    walker(1.6, -1.6, -PI / 2, K(0, **TYRE), K(2.9, **TYRE), K(3.2, **STAND), *back_off(3.3, 4.5, 1.6, -1.6, 3.4, -1.8), K(4.9, **UP), K(6.8, **UP)),
    walker(-1.55, .25, PI / 2, K(0, **dict(TABLET, lean=.3)), K(2.8, lean=.3), K(3.1, lean=.06), *back_off(3.2, 4.4, -1.55, .25, -3.0, .25), K(4.8, handY=1.4), prop='tablet'),
    walker(0, 3.6, PI, K(0, **WING), K(2.4, **WING), K(2.7, **STAND), *go(2.8, 4.0, 0, 3.6, 2.0, 4.4, end_yaw=-PI / 2), K(4.6, **CALL), K(5.8, **CHEER)),
])
# THE IN-RACE STOP (car-local, nose +Z; t = u * PIT_LEN). Matches PitLane
# stopAnim: jacks up u 0–.12, wheels off .15–.27, the fresh set fitted at .50,
# on .68–.80, down .88–1. Two jack men, a gunner and a tyre man per corner.
P = lambda u: u * PIT_LEN
pit = [walker(0, 4.25, PI, K(0, **JACK), K(P(.11), **PUMP), K(P(.87), **PUMP), K(P(.95), **JACK), K(P(.96), x=0, z=4.25),
              K(P(1), x=1.15, z=4.15), prop='jack'),
       walker(0, -3.95, 0, K(0, **JACK), K(P(.11), **PUMP), K(P(.87), **PUMP), K(P(.97), **JACK), prop='jack')]
for wx, wz in [(.79, 1.7), (-.79, 1.7), (.76, -1.6), (-.76, -1.6)]:
    s, f = (1 if wx > 0 else -1), (1 if wz > 0 else -1)
    pit.append(walker(s * 1.72, wz, -s * PI / 2, K(0, **GUN, wave=.25), K(P(.14), **GUN, wave=.25), K(P(.17), **BACK), K(P(.66), **BACK),
                      K(P(.70), **GUN, wave=0), K(P(.78), **GUN, wave=.25), K(P(.84), **GUN, wave=0), K(P(.92), **UP, hold=1), prop='gun'))
    ty = face(s * 1.25, wz + f * .95, wx, wz + f * .1)
    pit.append(walker(s * 1.25, wz + f * .95, ty, K(0, **HUB), K(P(.15), x=s * 1.25, z=wz + f * .95), K(P(.27), x=s * 1.80, z=wz + f * .95),
                      K(P(.46), handY=.48), K(P(.50), handY=.60), K(P(.54), handY=.48),
                      K(P(.68), x=s * 1.80, z=wz + f * .95), K(P(.80), x=s * 1.25, z=wz + f * .95),
                      K(P(.84), **STAND), K(P(1), x=s * 1.45, z=wz + f * 1.45)))
CLIPS['pit'] = dict(dir='pit', extra=0, label='PIT STOP CREW', len=PIT_LEN, actors=pit)

def clip_len(name, c):
    if 'len' in c: return c['len']
    if c['dir'] == 'in': return DURATION + c['extra']
    return DOOR_S + OUT_HOLD + c['extra'] + OUT_RUN + OUT_EXIT + .3

# ── BLENDER SCENE: empties, eased keys, a car proxy ──────────────────────────
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in (bpy.data.actions, bpy.data.meshes, bpy.data.materials): [block.remove(b) for b in list(block)]
scene = bpy.context.scene; scene.render.fps = FPS
CH = ['crouch', 'lean', 'handY', 'reach', 'wave', 'hold']
def bl(x, z, y=0.0): return (x, -z, y)
def set_ease(obj):
    ad = obj.animation_data
    if not ad or not ad.action: return
    for fc in ad.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'SINE'; kp.easing = 'EASE_IN_OUT'
def car_pose(c, t):
    return car_in(t) if c['dir'] == 'in' else car_out(t, c['extra']) if c['dir'] == 'out' else (0, 0, 0)

collections = {}
for name, c in CLIPS.items():
    col = bpy.data.collections.new('Clip ' + name); scene.collection.children.link(col); collections[name] = col
    car = bpy.data.objects.new(name + ' car', None); col.objects.link(car); car.empty_display_type = 'CUBE'
    car.scale = (.95, 2.85, .4)
    length = clip_len(name, c); step = max(1, FPS // 12)
    for f in range(0, int(length * FPS) + 2, step):
        x, z, yaw = car_pose(c, f / FPS); car.location = bl(x, z, .4); car.rotation_euler = (0, 0, yaw)
        car.keyframe_insert('location', frame=f + 1); car.keyframe_insert('rotation_euler', frame=f + 1)
    c['_car'] = car
    for i, a in enumerate(c['actors']):
        e = bpy.data.objects.new('%s crew %d (%s)' % (name, i, a['prop']), None); col.objects.link(e)
        e.empty_display_type = 'SINGLE_ARROW'; e.empty_display_size = .5
        # A change runs from the actor's PREVIOUS key (on any channel) to this
        # one: a hold key at that time pins the old value, so a channel keyed
        # at 0 and 1.8 holds until the key before 1.8, then eases.
        state = dict(DEF); last = {}; prev_t = 0.0; segments = []
        def key(k, t):
            f = 1 + t * FPS
            if k == 'loc': e.location = bl(state['x'], state['z']); e.keyframe_insert('location', frame=f)
            elif k == 'yaw': e.rotation_euler = (0, 0, state['yaw']); e.keyframe_insert('rotation_euler', index=2, frame=f)
            else: e[k] = float(state[k]); e.keyframe_insert(data_path='["%s"]' % k, frame=f)
            last[k] = t
        for k in ['loc', 'yaw'] + CH: key(k, 0.0)
        for t, ch in sorted(a['keys'], key=lambda kc: kc[0]):
            if 'car' in ch: segments.append(t)   # the attached member's release time
            groups = {('loc' if k in ('x', 'z') else k) for k in ch if k != 'car'}
            for g in groups:
                if last[g] < prev_t: key(g, prev_t)
            for k, v in ch.items():
                if k != 'car': state[k] = v
            for g in groups: key(g, t)
            prev_t = max(prev_t, t)
        set_ease(e)
        a['_obj'] = e; a['_release'] = segments[0] if segments else None

# ── EXPORT ───────────────────────────────────────────────────────────────────
def r(v, n=3): return round(float(v), n)
def world_of(c, a, t):
    """World (x, z, yaw) at t: the Empty's evaluated transform, carried by the car
    proxy until its release key when it is attached (the PUSH-OUT crew)."""
    scene.frame_set(int(math.floor(1 + t * FPS)), subframe=(1 + t * FPS) % 1)
    e = a['_obj']; lx, ly = e.matrix_world.translation.x, e.matrix_world.translation.y
    x, z, yaw = lx, -ly, e.matrix_world.to_euler().z
    if a['car']:
        rel = a['_release']; tc = min(t, rel) if rel is not None else t
        cx, cz, cy = car_pose(c, tc); c0x, c0z, c0y = car_pose(c, 0)
        # Attached: the authored bay pose rides the car's displacement from rest.
        if t <= rel: return x + (cx - c0x), z + (cz - c0z), yaw + (cy - c0y)
        return x + (cx - c0x), z + (cz - c0z), yaw
    return x, z, yaw

clips_out = {}; max_reach = 0.0; worst = ''
for name, c in CLIPS.items():
    length = clip_len(name, c); actors = []
    for a in c['actors']:
        e = a['_obj']; ch = {}
        # Every keyed frame of the Empty's own curves, union across channels.
        times = sorted({(kp.co.x - 1) / FPS for fc in e.animation_data.action.fcurves for kp in fc.keyframe_points})
        if a['car']:   # baked: dense linear keys through the attached interval
            rel = a['_release']; times = sorted(set(times) | {i / 12 for i in range(int(rel * 12) + 1)} | {rel})
        # walk: the body's travel along its own facing, from 60 Hz evaluation.
        walk, prev, wt = 0.0, None, {}
        n = int(length * 60) + 1
        samples = {}
        for i in range(n + 1):
            t = min(length, i / 60); samples[t] = world_of(c, a, t)
        keys_t = sorted(samples)
        for t in keys_t:
            x, z, yaw = samples[t]
            if prev:
                dx, dz = x - prev[0], z - prev[1]; walk -= dx * math.sin(yaw) + dz * math.cos(yaw)
            prev = (x, z, yaw); wt[t] = walk
        def nearest(t): return min(keys_t, key=lambda k: abs(k - t))
        for k in ['x', 'z', 'yaw', 'walk'] + CH:
            seq = []
            for t in (times if k in ('x', 'z', 'yaw', 'walk') else
                      sorted({(kp.co.x - 1) / FPS for fc in e.animation_data.action.fcurves if fc.data_path == '["%s"]' % k for kp in fc.keyframe_points})):
                scene.frame_set(int(math.floor(1 + t * FPS)), subframe=(1 + t * FPS) % 1)
                if k in ('x', 'z', 'yaw'): v = samples[nearest(t)][('x', 'z', 'yaw').index(k)] if a['car'] else \
                        (e.matrix_world.translation.x if k == 'x' else -e.matrix_world.translation.y if k == 'z' else e.matrix_world.to_euler().z)
                elif k == 'walk': v = wt[nearest(t)]
                else: v = e[k]
                seq += [r(t), r(v)]
            # Drop keys equal to both neighbours (holds) to keep the table small.
            pairs = [(seq[i], seq[i + 1]) for i in range(0, len(seq), 2)]
            keep = [p for j, p in enumerate(pairs) if j in (0, len(pairs) - 1) or not (pairs[j - 1][1] == p[1] == pairs[j + 1][1])]
            ch[k] = [v for p in keep for v in p]
        # Validation: every hand target within the two-bone arm span (0.6 m).
        for t in keys_t[::6]:
            scene.frame_set(int(math.floor(1 + t * FPS)), subframe=(1 + t * FPS) % 1)
            crouch, lean, hy, hz = e['crouch'], e['lean'], e['handY'], e['reach']
            sy = .95 + .43 - crouch
            d = math.hypot(hy - sy, hz - lean)
            if d > max_reach: max_reach, worst = d, '%s actor %d t=%.2f (crouch %.2f lean %.2f handY %.2f reach %.2f)' % (name, len(actors), t, crouch, lean, hy, hz)
        actors.append(dict(prop=a['prop'], lin=1 if a['car'] else 0, ch=ch))
    clips_out[name] = dict(dir=c['dir'], extra=c['extra'], len=r(length), label=c['label'], actors=actors)
assert max_reach < .66, 'a hand target exceeds the arm span: %.3f at %s' % (max_reach, worst)

source_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
blend = out / 'crew-choreo.blend'; scene.frame_set(1); bpy.ops.wm.save_as_mainfile(filepath=str(blend))
meta = dict(authoring='Blender ' + bpy.app.version_string, sourceSHA256=source_hash, maxHandTarget=r(max_reach),
            clips={k: dict(len=v['len'], actors=len(v['actors'])) for k, v in clips_out.items()})
(out / 'crew-choreo.json').write_text(json.dumps(dict(meta, data=clips_out), indent=1) + '\n')

if opts.render:   # top-down stills: proxies at the crew empties, Cycles CPU
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 8
    scene.render.resolution_x, scene.render.resolution_y = 480, 480
    cam = bpy.data.objects.new('Plan camera', bpy.data.cameras.new('Plan camera')); scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 22; cam.location = (0, -3, 30); scene.camera = cam
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); scene.collection.objects.link(sun)
    def into(o, col):   # primitive ops link to the scene root; the clip's collection is what hide_render toggles
        for u in list(o.users_collection): u.objects.unlink(o)
        col.objects.link(o)
    for name, c in CLIPS.items():
        for a in c['actors']:
            bpy.ops.mesh.primitive_cylinder_add(radius=.22, depth=1.7, location=(0, 0, .85)); p = bpy.context.object; p.parent = a['_obj']; into(p, collections[name])
        bpy.ops.mesh.primitive_cube_add(size=1); body = bpy.context.object; body.parent = c['_car']; body.scale = (1, 1, 1); into(body, collections[name])
    for name, c in CLIPS.items():
        for other, col in collections.items(): col.hide_render = other != name
        for k, frac in enumerate((.25, .5, .75, 1.0)):
            scene.frame_set(1 + int(clip_len(name, c) * frac * FPS) - 1)
            scene.render.filepath = str(out / ('%s-%d.png' % (name, k))); bpy.ops.render.render(write_still=True)

if opts.write_runtime:
    p = root / 'js/garage/crew-choreo.js'; text = p.read_text()
    start = text.index('  // @blender-choreo:start'); end = text.index('  // @blender-choreo:end', start)
    block = ('  // @blender-choreo:start\n  // ' + meta['authoring'] + '; tools/gen/blender/crew-choreo.py; SINE ease-in-out keys.\n'
             '  // Source SHA256: ' + source_hash + '\n  const CLIPS = ' + json.dumps(clips_out, separators=(',', ':')) + ';\n')
    p.write_text(text[:start] + block + text[end:])
print(json.dumps(dict(blend=str(blend), clips=meta['clips'], maxHandTarget=meta['maxHandTarget'])))
