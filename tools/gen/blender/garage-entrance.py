#!/usr/bin/env python3
# @doc Author and export the entrance car rig from evaluated Blender scenes.
"""Original Apex 26 procedural work; no external meshes or textures.
blender -b --factory-startup --python tools/gen/blender/garage-entrance.py -- --output-dir artifacts/garage-entrance --write-runtime
Edit the saved .blend, then export without rebuilding using --source FILE.
Upgrade an older .36 m proxy source with --source FILE --repair-wheel-radius
--save-source FILE; this preserves path/camera keys and rescales wheel rotation.
API references: https://docs.blender.org/api/4.3/bpy.types.Scene.html
https://docs.blender.org/api/4.3/bpy.types.bpy_struct.html
https://docs.blender.org/manual/en/4.3/addons/import_export/scene_gltf2.html
Runtime uses sampled transforms, not glTF clips: the garage renderer owns car geometry.
"""
import argparse, bpy, json, math, sys, hashlib
from pathlib import Path
p=argparse.ArgumentParser(); p.add_argument('--output-dir',required=True); p.add_argument('--source'); p.add_argument('--write-runtime',action='store_true'); p.add_argument('--repair-wheel-radius',action='store_true',help='Upgrade existing .36m wheel source to runtime .34m, preserving root and camera keys'); p.add_argument('--save-source',help='Save evaluated editable source after repair')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
root=Path(__file__).resolve().parents[3]; out=Path(a.output_dir).resolve(); out.mkdir(parents=True,exist_ok=True)
N=65; FPS=24; LENGTH=96; WHEEL_RADIUS=.34
# Nominal rolling / across-flat radius stays .34 m. Circumscribe the polygon
# around that circle so roll and steer never leave a positive support gap.
WHEEL_SEGMENTS=32; WHEEL_VERTEX_RADIUS=WHEEL_RADIUS/math.cos(math.pi/WHEEL_SEGMENTS)
columns=['x','z','yaw','wheelRoll','steer','heave','pitch']
def xyz(x,y,z): return (x,-z,y)
def material(name,color):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color=(*color,1); return m
def box(name,loc,size,mat,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1); o=bpy.context.object; o.name=name; o.location=loc; o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat); o.parent=parent; return o
def channel_driver(o,index,rig,channel,sign=1):
 d=o.driver_add('rotation_euler',index).driver; d.type='SCRIPTED'
 v=d.variables.new(); v.name='channel'; v.type='SINGLE_PROP'; v.targets[0].id=rig; v.targets[0].data_path='["'+channel+'"]'
 d.expression='-channel' if sign<0 else 'channel'
def key(o,frame,x,z,yaw,roll,steer,heave,pitch):
 o.location=xyz(x,heave,z); o.rotation_euler=(0,0,yaw)
 o.keyframe_insert('location',frame=frame); o.keyframe_insert('rotation_euler',frame=frame)
 for name,value in [('wheelRoll',roll),('steer',steer),('pitch',pitch)]:
  o[name]=value; o.keyframe_insert(data_path='["'+name+'"]',frame=frame)
def build(phase):
 scene=bpy.data.scenes.new('entrance-'+phase); bpy.context.window.scene=scene; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
 scene.render.fps=FPS; scene.frame_start=1; scene.frame_end=LENGTH+1
 rig=bpy.data.objects.new('CarRoot-'+phase,None); scene.collection.objects.link(rig)
 red=material('Proxy team red',(.6,.025,.02)); grey=material('Concrete',(.22,.24,.27)); black=material('Rubber',(.02,.02,.025))
 # One rigid body pivot matches entranceBodyLocal at game(0,.34,.05).
 # Wheels remain directly under CarRoot; the authored heave channel is zero.
 pivot=bpy.data.objects.new('BodyPivot-'+phase,None); scene.collection.objects.link(pivot)
 pivot.parent=rig; pivot.location=xyz(0,.34,.05); pivot.empty_display_type='PLAIN_AXES'
 body=box('Body-'+phase,(0,.05,.14),(1.7,4.8,.4),red,pivot)
 nose=box('Nose-'+phase,(0,-2.35,.01),(.5,1.1,.25),red,pivot)
 channel_driver(pivot,0,rig,'pitch')
 for x in [-.9,.9]:
  for z in [-1.7,1.7]:
   bpy.ops.mesh.primitive_cylinder_add(vertices=WHEEL_SEGMENTS,radius=WHEEL_VERTEX_RADIUS,depth=.32,location=(x,z,WHEEL_RADIUS),rotation=(0,math.pi/2,0))
   w=bpy.context.object; bpy.ops.object.transform_apply(location=False,rotation=True,scale=True); w.name='Wheel-'+phase; w.parent=rig; w.data.materials.append(black); channel_driver(w,0,rig,'wheelRoll')
   if z<0: channel_driver(w,2,rig,'steer',-1)  # runtime X mirror makes physical world steer=-parameter
 box('Floor-'+phase,(0,-6.4,-.05),(10.8,25,.1),grey)
 for x in [-4.05,4.05]: box('Door jamb-'+phase,(x,-6.4,1.8),(2.7,.2,3.6),grey)
 box('Header-'+phase,(0,-6.4,4.1),(10.8,.2,1),grey)
 # A real camera with a target constraint documents safe interior blocking.
 cam=bpy.data.objects.new('Entrance camera-'+phase,bpy.data.cameras.new('Entrance lens-'+phase)); scene.collection.objects.link(cam); scene.camera=cam
 cam.location=xyz(-3.8,2.1,-4.8); cam.data.lens=23
 target=bpy.data.objects.new('Camera target-'+phase,None); scene.collection.objects.link(target); target.location=xyz(0,.8,6.2)
 c=cam.constraints.new('TRACK_TO'); c.target=target; c.track_axis='TRACK_NEGATIVE_Z'; c.up_axis='UP_Y'
 for i in range(N):
  u=i/(N-1); f=1+u*LENGTH
  # Keyed in Blender: quintic braking envelope has zero speed and acceleration at both holds.
  e=u*u*u*(10+u*(-15+6*u))
  if phase=='lane':
   # Approach starts already travelling, then eases decisively to the reverse mark.
   v=1-(1-u)**3; x=-17+22*v; z=13; yaw=math.pi/2; distance=22*v
   steer=0; heave=0; pitch=-.009*math.sin(math.pi*u)**2
  else:
   s=(8+5*math.pi/2)*(1-e); th=max(0,min(math.pi/2,(s-8)/5))
   x=5*(1-math.cos(th)); z=s if s<8 else 8+5*math.sin(th); yaw=th
   distance=22-((8+5*math.pi/2)-s); steer=-.28*math.sin(min(1,max(0,(s-7)/2))*math.pi/2)*min(1,u/.1)
   heave=0; pitch=.006*math.sin(math.pi*u)**2
  key(rig,f,x,z,yaw,distance/WHEEL_RADIUS,steer,heave,pitch)
 for fc in rig.animation_data.action.fcurves:
  for k in fc.keyframe_points: k.interpolation='LINEAR'
 scene.timeline_markers.new('Brake at reverse mark' if phase=='lane' else 'Rear crosses doorway',frame=97 if phase=='lane' else 55)
 scene['wheelRadius']=WHEEL_RADIUS; scene['wheelAcrossFlatRadius']=WHEEL_RADIUS; scene['wheelVertexRadius']=WHEEL_VERTEX_RADIUS; scene['wheelProxyContact']='circumscribed polygon, signed support gap -5mm..0mm'
 scene['axes']='Blender XYZ = game X,-Z,Y; metres; root origin floor centre; local nose -Y'; scene['license']='Apex26-Procedural'; scene['runtime']='evaluated root transform and custom channels; geometry is previz only'
 scene.render.engine='BLENDER_WORKBENCH'; scene.render.resolution_x=844; scene.render.resolution_y=390; scene.render.resolution_percentage=100
 scene.display.shading.light='STUDIO'; scene.display.shading.color_type='MATERIAL'; scene.display.shading.show_shadows=True
 return scene
if a.source:
 bpy.ops.wm.open_mainfile(filepath=str(Path(a.source).resolve()))
 if a.repair_wheel_radius:
  from mathutils import Matrix
  for phase in ['lane','back']:
   scene=bpy.data.scenes['entrance-'+phase]; bpy.context.window.scene=scene; rig=bpy.data.objects['CarRoot-'+phase]
   old_radius=float(scene.get('wheelRadius',.36)); ratio=old_radius/WHEEL_RADIUS
   for fc in rig.animation_data.action.fcurves:
    if fc.data_path=='["wheelRoll"]':
     for k in fc.keyframe_points:
      k.co.y*=ratio; k.handle_left.y*=ratio; k.handle_right.y*=ratio
   for w in [o for o in rig.children if o.name.startswith('Wheel-')]:
    # Bake the axle alignment into vertices: X roll must spin around an X axle,
    # rather than tilt the cylinder through an unapplied Euler Y rotation.
    bpy.ops.mesh.primitive_cylinder_add(vertices=WHEEL_SEGMENTS,radius=WHEEL_VERTEX_RADIUS,depth=.32)
    temp=bpy.context.object; mesh=temp.data.copy(); bpy.data.objects.remove(temp,do_unlink=True)
    mesh.transform(Matrix.Rotation(math.pi/2,4,'Y')); mesh.materials.clear()
    for m in w.data.materials: mesh.materials.append(m)
    w.data=mesh; w.rotation_euler.y=0; w.location.z=WHEEL_RADIUS
   bpy.data.objects['Floor-'+phase].location.z=-.05
   scene['wheelRadius']=WHEEL_RADIUS; scene['wheelAcrossFlatRadius']=WHEEL_RADIUS; scene['wheelVertexRadius']=WHEEL_VERTEX_RADIUS; scene['wheelProxyContact']='circumscribed polygon, signed support gap -5mm..0mm'
  bpy.context.view_layer.update()
else:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 for phase in ['lane','back']: build(phase)
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'garage-entrance.blend'))
if a.save_source:
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(Path(a.save_source).resolve()))
data={'version':1,'columns':columns}; inspection={}
for phase in ['lane','back']:
 scene=bpy.data.scenes['entrance-'+phase]; bpy.context.window.scene=scene; rig=bpy.data.objects['CarRoot-'+phase]; rows=[]; contact=[]
 for i in range(N):
  frame=1+i*LENGTH/(N-1); scene.frame_set(int(frame),subframe=frame-int(frame)); o=rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
  dg=bpy.context.evaluated_depsgraph_get(); floor=bpy.data.objects['Floor-'+phase].evaluated_get(dg)
  top=max((floor.matrix_world@v.co).z for v in floor.data.vertices)
  for wheel in [w for w in rig.children if w.name.startswith('Wheel-')]:
   evaluated=wheel.evaluated_get(dg)
   contact.append(min((evaluated.matrix_world@v.co).z for v in evaluated.data.vertices)-top)
  rows.append([round(v,6) for v in [o.location.x,-o.location.y,o.rotation_euler.z,o['wheelRoll'],o['steer'],o.location.z,o['pitch']]])
 data[phase]=rows
 inspection[phase]={'samples':N,'first':rows[0],'last':rows[-1],'rootScale':list(rig.scale),'rootOrigin':'floor centre','hierarchy':[o.name for o in rig.children],'materials':[m.name for m in bpy.data.materials],'wheelRadius':WHEEL_RADIUS,'wheelAcrossFlatRadius':WHEEL_RADIUS,'wheelVertexRadius':WHEEL_VERTEX_RADIUS,'wheelFloorClearance':{'min':min(contact),'max':max(contact),'evaluatedWorldVertexSamples':len(contact)},'geometryExported':False}
 scene.frame_set(1); scene.render.filepath=str(out/(phase+'-opening.png')); bpy.ops.render.render(write_still=True)
 scene.frame_set(49); scene.render.filepath=str(out/(phase+'-middle.png')); bpy.ops.render.render(write_still=True)
 scene.frame_set(97); scene.render.filepath=str(out/(phase+'-end.png')); bpy.ops.render.render(write_still=True)
(out/'motion.json').write_text(json.dumps(data,separators=(',',':'))+'\n'); (out/'inspection.json').write_text(json.dumps(inspection,indent=2)+'\n')
if a.write_runtime:
 dest=root/'js/data/garage-entrance-motion.js'
 dest.write_text('/* Blender evaluated entrance curves. Source: tools/gen/blender/garage-entrance.py.\n * Original Apex26-Procedural; metres/radians; regenerate, do not hand edit. */\nconst GarageEntranceMotionData = (function () {\n  "use strict";\n  return Object.freeze('+json.dumps(data,separators=(',',':'))+');\n})();\n')
print(json.dumps({'blend':str(Path(a.save_source or a.source).resolve() if (a.save_source or a.source) else out/'garage-entrance.blend'),'samples':N,'blender':bpy.app.version_string,'dataSHA256':hashlib.sha256((out/'motion.json').read_bytes()).hexdigest()}))
