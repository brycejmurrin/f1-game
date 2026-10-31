#!/usr/bin/env python3
# @doc Authors the garage departure blocking scene and exports allocation-light transform samples.
"""blender -b --python tools/garage/author-departure.py
Original authored blocking; Blender XYZ = game X,-Z,Y; metres, 24 fps.
"""
import bpy, math, json, hashlib, argparse, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/garage-departure'; OUT.mkdir(parents=True,exist_ok=True)
args=argparse.ArgumentParser()
args.add_argument('--export-existing', action='store_true', help='Export edited assets/source/garage-departure.blend without rebuilding or saving it')
opts=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
B=lambda p:(p[0],-p[2],p[1])
G=lambda p:[p[0],p[2],-p[1]]
N=241
if opts.export_existing:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/garage-departure.blend'))
 scene=bpy.context.scene
 car=bpy.data.objects['departure.car.root'];cam=bpy.data.objects['departure.follow'];at=bpy.data.objects['departure.aim']
else:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 scene=bpy.context.scene; scene.render.fps=24; scene.frame_end=193
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
 # Rolling interval is 7.359 seconds, normalized so tuner speed changes preserve beats.
 N=241; L=9.8+3.2*math.pi/2+9.2; ACCEL=.16307
 # The distance profile is the integral of a linear acceleration then constant speed.
 def distance(u):return L*(u*u/(2*ACCEL) if u<ACCEL else u-ACCEL/2)/(1-ACCEL/2)
 def path(d):
  a=min(math.pi/2,max(0,d-9.8)/3.2);tail=max(0,d-9.8-3.2*math.pi/2)
  return (3.2*(1-math.cos(a))+tail,0, min(d,9.8) if d<9.8 else 9.8+3.2*math.sin(a)),a
 for i in range(N):
  u=i/(N-1);p,yaw=path(distance(u));f=49+u*144
  car.location=B(p);car.rotation_euler[2]=yaw;car.keyframe_insert('location',frame=f);car.keyframe_insert('rotation_euler',frame=f)
 cam=bpy.data.objects.new('departure.follow',bpy.data.cameras.new('departure.follow'));scene.collection.objects.link(cam)
 cam.data.sensor_fit='VERTICAL';cam.data.sensor_height=24
 at=empty('departure.aim');con=cam.constraints.new('TRACK_TO');con.target=at;con.track_axis='TRACK_NEGATIVE_Z';con.up_axis='UP_Y'
 # Stable rear quarter, then follow through the aperture without crossing a wall.
 for u,p,fov in [(0,(-2.2,2.2,-3.8),54),(.25,(-2.2,2.2,-2.6),54),(.48,(-1.6,2.1,2.5),58),(.7,(-1.5,2.1,7.4),58),(1,(5.5,2.3,10.2),58)]:
  cam.location=B(p);cam.keyframe_insert('location',frame=49+u*144);cam.data.lens=12/math.tan(math.radians(fov)/2);cam.data.keyframe_insert('lens',frame=49+u*144)
 for i in range(N):
  u=i/(N-1);p,yaw=path(distance(u));at.location=B((p[0],.65,p[2]+.6*math.cos(yaw)));at.keyframe_insert('location',frame=49+u*144)
 # Blender location keys on the densely keyed car use linear interpolation (no overshoot).
 for obj in [car,at]:
  for curve in obj.animation_data.action.fcurves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
rows=[];worst=0;prev=None;prev_car=None;travel=0
for i in range(N):
 u=i/(N-1);scene.frame_set(49+int(u*144),subframe=(u*144)%1)
 p=G(car.location);eye=G(cam.location);aim=G(at.location)
 if prev_car:travel+=math.dist(p,prev_car)
 prev_car=p
 row=[p[0],p[2],car.rotation_euler[2],travel,*eye,*aim,math.degrees(2*math.atan(12/cam.data.lens))]
 assert all(math.isfinite(v) for v in row)
 if p[2]<9.1:assert abs(p[0])<.08,'Turn starts before rear clears door'
 if prev:worst=max(worst,math.dist(eye,prev))
 prev=eye;rows.append([round(v,5) for v in row])
assert worst<.3
scene.camera=cam;scene.frame_set(49)
scene['export_recipe']='blender -b --python tools/garage/author-departure.py'
scene['coordinates']='game=(Blender X, Blender Z, -Blender Y)'
if not opts.export_existing:bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/garage-departure.blend'))
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
  return Object.freeze({ sample, samples: ROWS.length });
})();
'''
(ROOT/'js/data/garage-departure-motion.js').write_text(code)
(OUT/'validation.json').write_text(json.dumps(dict(blender=bpy.app.version_string,sourceSHA256=sha,samples=N,maxEyeStep=worst,pathLength=travel,door=6.4,turnStartsAt=9.8,carRear=-2.69),indent=2)+'\n')
print('DEPARTURE_EXPORT_PASS',N,worst)
