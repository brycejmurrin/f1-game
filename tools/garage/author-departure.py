#!/usr/bin/env python3
# @doc Authors the garage departure blocking scene and exports allocation-light transform samples.
"""blender -b --python tools/garage/author-departure.py
Polish an edited blend, then re-export:
  blender -b --python tools/garage/author-departure.py -- --polish
  blender -b --python tools/garage/author-departure.py -- --export-existing
Original authored blocking; Blender XYZ = game X,-Z,Y; metres, 24 fps.
Launch uses a C2 quintic ease-in (zero vel/accel at rest, matched cruise); wheels
roll at distance/WHEEL_RADIUS; car heave/pitch stay flat; camera keys are dense LINEAR.
"""
import bpy, math, json, hashlib, argparse, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'assets/source/garage-departure.blend'
OUT=ROOT/'artifacts/garage-departure'; OUT.mkdir(parents=True,exist_ok=True)
args=argparse.ArgumentParser()
args.add_argument('--export-existing', action='store_true', help='Export edited assets/source/garage-departure.blend without rebuilding or saving it')
args.add_argument('--polish', action='store_true', help='Re-key launch, wheels and camera on the existing .blend, then save it')
opts=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
B=lambda p:(p[0],-p[2],p[1])
G=lambda p:[p[0],p[2],-p[1]]
N=241; FPS=24; ROLL_START=49; ROLL_FRAMES=144
# Runtime CarWheels.createGarage spins as distance / .34; keep the proxy in lockstep.
WHEEL_RADIUS=.34; WHEEL_SEGMENTS=32
WHEEL_VERTEX_RADIUS=WHEEL_RADIUS/math.cos(math.pi/WHEEL_SEGMENTS)
L=9.8+3.2*math.pi/2+9.2
# Fraction of the rolling clip spent easing out of the box. Quintic Hermite has
# zero velocity and acceleration at rest and matches constant cruise with zero
# accel at the join (no jerk pop into the straight).
LAUNCH=.28
def _I(t): return 2.5*t**4 - 3*t**5 + t**6          # ∫₀ᵗ quintic
def _quintic(t): return t*t*t*(10 + t*(-15 + 6*t))
def distance(u):
 u=max(0,min(1,u)); V=1/(1 - .5*LAUNCH)
 if u < LAUNCH: return L * V * LAUNCH * _I(u/LAUNCH)
 return L * V * (.5*LAUNCH + (u - LAUNCH))
def path(d):
 a=min(math.pi/2,max(0,d-9.8)/3.2);tail=max(0,d-9.8-3.2*math.pi/2)
 return (3.2*(1-math.cos(a))+tail,0, min(d,9.8) if d<9.8 else 9.8+3.2*math.sin(a)),a
def clear_anim(obj):
 if obj.animation_data:
  if obj.animation_data.action: bpy.data.actions.remove(obj.animation_data.action)
  obj.animation_data_clear()
def linearize(obj):
 if not (obj.animation_data and obj.animation_data.action): return
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points: key.interpolation='LINEAR'
def ensure_wheels(car, black):
 # Drop prior proxies so --polish is idempotent. Rest the root so local wheel
 # slots match game (±track, ±axle, radius) under Blender XYZ = game X,-Z,Y.
 for child in list(car.children):
  if child.name.startswith('departure.wheel.'):
   mesh=child.data; bpy.data.objects.remove(child, do_unlink=True)
   if mesh and mesh.users==0: bpy.data.meshes.remove(mesh)
 car.location=(0,0,0); car.rotation_euler=(0,0,0)
 wheels=[]
 for side in (-1,1):
  for axle,game_z in (('F',1.7),('R',-1.6)):
   bpy.ops.mesh.primitive_cylinder_add(vertices=WHEEL_SEGMENTS,radius=WHEEL_VERTEX_RADIUS,depth=.32,
     location=(0,0,0), rotation=(0,math.pi/2,0))
   w=bpy.context.object; bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
   w.name='departure.wheel.%s.%s'%({'F':'front','R':'rear'}[axle], 'L' if side<0 else 'R')
   w.parent=car
   # Front axle is game +Z → Blender −Y; height is game Y → Blender Z.
   w.location=(side*(.79 if axle=='F' else .76), -game_z, WHEEL_RADIUS)
   w.data.materials.append(black); wheels.append(w)
 return wheels
def key_motion(car, cam, at, wheels):
 clear_anim(car); clear_anim(cam); clear_anim(at)
 for w in wheels: clear_anim(w)
 # Stable rear-quarter follow; height held near 2.2 so Bezier heave cannot pop.
 cam_keys=((0,(-2.2,2.2,-3.8),54),(.25,(-2.2,2.2,-2.6),54),(.48,(-1.6,2.2,2.5),58),(.7,(-1.5,2.2,7.4),58),(1,(5.5,2.2,10.2),58))
 def cam_at(u):
  for i in range(len(cam_keys)-1):
   u0,p0,f0=cam_keys[i]; u1,p1,f1=cam_keys[i+1]
   if u<=u1 or i==len(cam_keys)-2:
    t=0 if u1==u0 else max(0,min(1,(u-u0)/(u1-u0))); e=t*t*(3-2*t)
    return tuple(p0[j]+(p1[j]-p0[j])*e for j in range(3)), f0+(f1-f0)*e
  return cam_keys[-1][1], cam_keys[-1][2]
 for i in range(N):
  u=i/(N-1); d=distance(u); p,yaw=path(d); f=ROLL_START+u*ROLL_FRAMES
  # Heave (game Y / Blender Z) and pitch/roll stay zero — no suspension pop.
  car.location=B(p); car.rotation_euler=(0,0,yaw)
  car.keyframe_insert('location',frame=f); car.keyframe_insert('rotation_euler',frame=f)
  eye,fov=cam_at(u); cam.location=B(eye); cam.keyframe_insert('location',frame=f)
  cam.data.lens=12/math.tan(math.radians(fov)/2); cam.data.keyframe_insert('lens',frame=f)
  at.location=B((p[0],.65,p[2]+.6*math.cos(yaw))); at.keyframe_insert('location',frame=f)
  roll=d/WHEEL_RADIUS
  for w in wheels:
   w.rotation_euler=(roll,0,0); w.keyframe_insert('rotation_euler',frame=f)
 for obj in [car,cam,at]+list(wheels): linearize(obj)
 if cam.data.animation_data and cam.data.animation_data.action:
  for curve in cam.data.animation_data.action.fcurves:
   for key in curve.keyframe_points: key.interpolation='LINEAR'

if opts.export_existing:
 bpy.ops.wm.open_mainfile(filepath=str(SRC))
 scene=bpy.context.scene
 car=bpy.data.objects['departure.car.root'];cam=bpy.data.objects['departure.follow'];at=bpy.data.objects['departure.aim']
elif opts.polish:
 bpy.ops.wm.open_mainfile(filepath=str(SRC))
 scene=bpy.context.scene; scene.render.fps=FPS; scene.frame_end=ROLL_START+ROLL_FRAMES
 car=bpy.data.objects['departure.car.root'];cam=bpy.data.objects['departure.follow'];at=bpy.data.objects['departure.aim']
 black=bpy.data.materials.get('Rubber') or bpy.data.materials.new('Rubber'); black.diffuse_color=(.02,.02,.025,1)
 wheels=ensure_wheels(car, black)
 key_motion(car, cam, at, wheels)
else:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 scene=bpy.context.scene; scene.render.fps=FPS; scene.frame_end=ROLL_START+ROLL_FRAMES
 def empty(name):
  o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);return o
 def box(name,p,scale,color):
  bpy.ops.mesh.primitive_cube_add(size=2,location=B(p));o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);o.data.materials.append(m);return o
 car=empty('departure.car.root');car['note']='Runtime car geometry remains engine-owned; proxy bounds -2.69..3.18, width 1.9'
 body=box('car clearance envelope',(0,.5,.245),(.95,.5,2.935),(.7,.12,.06));body.parent=car
 box('bay floor',(0,-.07,0),(5.4,.07,6.4),(.22,.23,.25))
 box('lane',(0,-.1,11.45),(20,.06,5),(.12,.13,.14))
 for x in [-4.05,4.05]:box('door jamb',(x,2.5,6.4),(1.35,2.5,.15),(.3,.32,.35))
 box('door lintel',(0,4.9,6.4),(2.7,.1,.15),(.3,.32,.35))
 # Release guides retreat outside the swept envelope during the pre-roll beat.
 for side in [-1,1]:
  guide=box('crew.release.'+str(side),(side*1.45,.9,2.5),(.23,.9,.2),(.15,.25,.7))
  for frame,x in [(1,side*1.45),(25,side*2.3),(49,side*2.3)]:
   guide.location=B((x,.9,2.5));guide.keyframe_insert('location',frame=frame)
 cam=bpy.data.objects.new('departure.follow',bpy.data.cameras.new('departure.follow'));scene.collection.objects.link(cam)
 cam.data.sensor_fit='VERTICAL';cam.data.sensor_height=24
 at=empty('departure.aim');con=cam.constraints.new('TRACK_TO');con.target=at;con.track_axis='TRACK_NEGATIVE_Z';con.up_axis='UP_Y'
 black=bpy.data.materials.new('Rubber'); black.diffuse_color=(.02,.02,.025,1)
 wheels=ensure_wheels(car, black)
 key_motion(car, cam, at, wheels)

rows=[];worst=0;prev=None;prev_car=None;travel=0;max_heave=0;max_pitch=0
for i in range(N):
 u=i/(N-1);scene.frame_set(ROLL_START+int(u*ROLL_FRAMES),subframe=(u*ROLL_FRAMES)%1)
 p=G(car.location);eye=G(cam.location);aim=G(at.location)
 max_heave=max(max_heave,abs(p[1]),abs(eye[1]-2.2)); max_pitch=max(max_pitch,abs(car.rotation_euler[0]),abs(car.rotation_euler[1]))
 if prev_car:travel+=math.dist(p,prev_car)
 prev_car=p
 row=[p[0],p[2],car.rotation_euler[2],travel,*eye,*aim,math.degrees(2*math.atan(12/cam.data.lens))]
 assert all(math.isfinite(v) for v in row)
 if p[2]<9.1:assert abs(p[0])<.08,'Turn starts before rear clears door'
 if prev:worst=max(worst,math.dist(eye,prev))
 prev=eye;rows.append([round(v,5) for v in row])
assert worst<.3
assert max_heave<.15,'camera/car heave pop'
assert max_pitch<1e-4,'car pitch/roll must stay flat'
# Wheel roll must track path length within one tyre patch (no skating).
wheels=[o for o in car.children if o.name.startswith('departure.wheel.')]
if wheels:
 scene.frame_set(ROLL_START+ROLL_FRAMES)
 for w in wheels:
  assert abs(w.rotation_euler[0] - travel/WHEEL_RADIUS) < .02, 'wheel roll skates vs distance'
scene.camera=cam;scene.frame_set(ROLL_START)
scene['export_recipe']='blender -b --python tools/garage/author-departure.py -- --export-existing'
scene['coordinates']='game=(Blender X, Blender Z, -Blender Y)'
scene['wheelRadius']=WHEEL_RADIUS; scene['launchEase']='quintic-c2'; scene['launchFraction']=LAUNCH
if not opts.export_existing: bpy.ops.wm.save_as_mainfile(filepath=str(SRC))
sha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
header='/* Apex 26 — Blender-authored departure transforms. Regenerate with tools/garage/author-departure.py. */\nconst GarageDepartureMotion = (function () {\n  "use strict";\n'
code=header+'  const ROWS = '+json.dumps(rows,separators=(',',':'))+';\n'+'''  // Caller owns out, eye and aim; no geometry or arrays are rebuilt per frame.
  function value(a, b, k, j) { return a[j] + (b[j] - a[j]) * k; }
  function sample(u, side, out) {
    const f = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0)) * (ROWS.length - 1);
    const i = Math.min(ROWS.length - 2, Math.floor(f)), k = f - i, a = ROWS[i], b = ROWS[i + 1];
    const s = side < 0 ? -1 : 1;
    out.x = s * value(a, b, k, 0); out.z = value(a, b, k, 1); out.yaw = s * value(a, b, k, 2); out.distance = value(a, b, k, 3); out.crewClear = 1;
    for (let j = 0; j < 3; j++) { out.eye[j] = value(a, b, k, 4 + j) * (j === 0 ? s : 1); out.aim[j] = value(a, b, k, 7 + j) * (j === 0 ? s : 1); }
    out.fov = value(a, b, k, 10); return out;
  }
  return Object.freeze({ sample, samples: ROWS.length, wheelRadius: 0.34 });
})();
'''
(ROOT/'js/data/garage-departure-motion.js').write_text(code)
(OUT/'validation.json').write_text(json.dumps(dict(blender=bpy.app.version_string,sourceSHA256=sha,samples=N,maxEyeStep=worst,pathLength=travel,door=6.4,turnStartsAt=9.8,carRear=-2.69,launchFraction=LAUNCH,wheelRadius=WHEEL_RADIUS,maxHeave=max_heave,maxPitch=max_pitch),indent=2)+'\n')
print('DEPARTURE_EXPORT_PASS',N,worst,'heave',max_heave,'travel',round(travel,5))
