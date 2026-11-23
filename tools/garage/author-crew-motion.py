#!/usr/bin/env python3
# @doc Authors editable Blender garage guide actions and exports deterministic runtime motion curves.
"""Author garage crew controls in Blender; export sampled curves to the runtime.
blender -b --python tools/garage/author-crew-motion.py -- --output-dir artifacts/garage-blender --write-runtime
Original project-authored motion, metres, 24 fps. Blender XYZ = game X,-Z,Y.

Walk polish: contralateral arm swing, slight torso lean, shorter/varied steps,
and a hip weight-shift (sway) channel. Cycle distance stays 1.35 m.
"""
import bpy, math, json, argparse, sys, hashlib
from pathlib import Path
args=argparse.ArgumentParser();args.add_argument('--output-dir',required=True);args.add_argument('--write-runtime',action='store_true');opts=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
root=Path(__file__).resolve().parents[2];out=Path(opts.output_dir).resolve();out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=49
# A real editable armature, with foot and hand targets and two-bone IK chains.
arm=bpy.data.armatures.new('Garage guide skeleton');rig=bpy.data.objects.new('Garage guide rig',arm);scene.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def xyz(p):return (p[0],-p[2],p[1])
def bone(name,a,b,parent=None):
 n=arm.edit_bones.new(name);n.head=xyz(a);n.tail=xyz(b)
 if parent:n.parent=arm.edit_bones[parent]
 return n
bone('root',[0,0,0],[0,.2,0]);bone('torso',[0,.91,0],[0,1.46,0],'root');bone('head',[0,1.46,0],[0,1.78,0],'torso')
for side,x in [('L',.1),('R',-.1)]:
 bone('thigh.'+side,[x,.91,0],[x,.49,.1],'root');bone('shin.'+side,[x,.49,.1],[x,.08,.03],'thigh.'+side)
 bone('upper_arm.'+side,[x*2.2,1.38,0],[x*2.2,1.12,.1],'torso');bone('forearm.'+side,[x*2.2,1.12,.1],[x*2.2,.85,.03],'upper_arm.'+side)
bpy.ops.object.mode_set(mode='OBJECT')
def control(name,pos):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.empty_display_type='SPHERE';o.empty_display_size=.06;o.location=xyz(pos);return o
controls={}
for side,x in [('L',.1),('R',-.1)]:
 for limb,p in [('foot',[x,.08,.03]),('hand',[x*2.2,.85,.03])]:
  c=control(limb+'.'+side,p);controls[limb+'.'+side]=c
  if limb=='hand':c.parent=rig
  ik=rig.pose.bones[('shin.' if limb=='foot' else 'forearm.')+side].constraints.new('IK');ik.target=c;ik.chain_count=2
# Hip sway + torso lean empties (exported channels; draw consumes them).
sway_c=control('Hip sway',[0,.91,0]);lean_c=control('Torso lean',[0,1.2,0])
# Foot placement is authored in world space during root retreat, then exported
# relative to the root. Five shorter, uneven steps; plant intervals stay linear
# in world space while swings ease, lift, and carry a small weight shift.
D=1.35
# Five shorter steps (old was four × D/4 = 0.3375). Lengths uneven; swing
# windows staggered so the gait fills most of the retreat instead of ending early.
STEP_LEN=(.22,.28,.24,.31,.30)  # sum = 1.35
assert abs(sum(STEP_LEN)-D)<1e-9
# Per-side: start phase, then each swing uses ~0.09 of back with a 0.08 gap
# (double-support). Five swings → ~0.85 of back from the first toe-off.
def foot_travel(back, phase):
 travelled=0.0;lift=0.0;support=0.0
 t_cursor=phase
 for step,length in enumerate(STEP_LEN):
  dur=0.088 + 0.012 * (step % 3) / 2  # 0.088 … 0.100, slight variety
  t=max(0,min(1,(back-t_cursor)/dur));e=t*t*(3-2*t)
  travelled+=length*e
  if 0<t<1:
   lift=.072*math.sin(math.pi*t)**2
   support=math.sin(math.pi*t)
  t_cursor+=dur+0.078
 return travelled,lift,support
for f in range(1,50):
 u=(f-1)/48;back=u*u*(3-2*u);root_z=-D*back
 # Slight forward lean builds with retreat, plus a gait bob from step phase.
 gait=math.sin(back*math.pi*5)  # ~2.5 cycles over the retreat
 lean=.028+.018*back+.012*gait
 sway=0.0
 rig.location=xyz([0,0,root_z]);rig.keyframe_insert('location',frame=f)
 for side,phase in [('L',.02),('R',.11)]:
  travelled,lift,support=foot_travel(back,phase)
  local_z=.03+D*back-travelled;y=.08+lift
  # Slight lateral push onto the stance side during the opposite swing.
  lat=(.10 if side=='L' else -.10)+(.018*support if side=='L' else -.018*support)
  sway+=(-.022 if side=='L' else .022)*support
  c=controls['foot.'+side];c.location=xyz([lat,y,root_z+local_z]);c.keyframe_insert('location',frame=f)
  # Contralateral arm: same-side hand goes back while that foot swings forward.
  foot_lead=local_z-.03
  hand_z=.10-.55*foot_lead+.04*gait*(1 if side=='L' else -1)
  hand_y=.88+.04*lift+.02*abs(gait)
  h=controls['hand.'+side];h.location=xyz([.22 if side=='L' else -.22,hand_y,hand_z]);h.keyframe_insert('location',frame=f)
 lean_c.location=xyz([0,1.2,lean]);lean_c.keyframe_insert('location',frame=f)
 sway_c.location=xyz([sway,.91,0]);sway_c.keyframe_insert('location',frame=f)
# A second action: relaxed, asymmetric "come forward / hold clear" hand cues
# overlaid on the same timeline (sampled by the runtime's decorative loop).
# Mid-clip both hands reach together; gait frames keep contralateral offsets.
signal=control('Signal channels',[0,0,0]);signal['reach']=.42;signal['handY']=1.35;signal['bob']=0.0
for f,reach,height,bob in [(1,.12,.88,0),(13,.42,1.35,.008),(25,.12,.88,0),(37,.36,1.22,-.006),(49,.12,.88,0)]:
 for key,value in [('reach',reach),('handY',height),('bob',bob)]:signal[key]=float(value);signal.keyframe_insert(data_path='["'+key+'"]',frame=f)
 # Softly pull both hands toward the cue without erasing contralateral lead.
 for side in ['L','R']:
  h=controls['hand.'+side];base=h.location
  # Game-space target mixed into the already-keyed contralateral pose.
  gx=.22 if side=='L' else -.22
  # Read current game Y/Z from blender location.
  cur_y=base.z;cur_z=-base.y
  mix=max(0,min(1,(reach-.12)/.30))
  hy=cur_y+(height-cur_y)*mix;hz=cur_z+(reach-cur_z)*mix
  h.location=xyz([gx,hy,hz]);h.keyframe_insert('location',frame=f)
  signal['bob']=float(bob)
# Visible proxy: capsules track the IK bones, providing an editable Blender rig
# without exporting a second, unrelated game character mesh.
scene.frame_set(1);bpy.context.view_layer.update()
primary=bpy.data.materials.new('Livery primary');primary.diffuse_color=(.08,.28,.65,1)
secondary=bpy.data.materials.new('Livery secondary');secondary.diffuse_color=(1,.72,.12,1)
for name in ['torso','head']+[a+'.'+s for a in ['thigh','shin','upper_arm','forearm'] for s in ['L','R']]:
 b=rig.pose.bones[name];mid=(b.head+b.tail)/2;length=(b.tail-b.head).length
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,location=mid);o=bpy.context.object;o.name='Guide '+name;o.rotation_mode='QUATERNION';o.rotation_quaternion=(b.tail-b.head).to_track_quat('Z','Y');o.scale=(.14 if name in ['torso','head'] else .065,.14 if name in ['torso','head'] else .065,length*.6);o.data.materials.append(secondary if name=='head' else primary)
 # Bone-parent in rest space; evaluate poses through the actual IK armature.
 bpy.context.view_layer.update();matrix=o.matrix_world.copy();o.parent=rig;o.parent_type='BONE';o.parent_bone=name;o.matrix_world=matrix
rig.show_in_front=True
rows=[];max_hand_distance=0.0;max_proxy_error=0.0
for f in range(1,50,2):
 scene.frame_set(f);back=((f-1)/48)**2*(3-2*((f-1)/48));root_z=-D*back
 for o in bpy.data.objects:
  if o.parent==rig and o.parent_type=='BONE':
   b=rig.pose.bones[o.parent_bone];center=rig.matrix_world@((b.head+b.tail)/2)
   max_proxy_error=max(max_proxy_error,(o.matrix_world.translation-center).length)
 assert max_proxy_error<.001, 'A proxy mesh is offset from its animated bone'
 for side in ['L','R']:
  shoulder=rig.matrix_world @ arm.bones['upper_arm.'+side].head_local
  target=controls['hand.'+side].matrix_world.translation
  max_hand_distance=max(max_hand_distance,(target-shoulder).length)
 assert max_hand_distance<.61, 'A hand target exceeds the two-bone arm span'
 vals=[]
 for side in ['L','R']:
  p=controls['foot.'+side].location;vals += [float(p.z),float(-p.y-root_z)]
 # Per-side hand Z (game forward) for contralateral swing; lean + sway.
 for side in ['L','R']:
  vals.append(float(-controls['hand.'+side].location.y))
 # lean empty at game (0,1.2,lean) → blender (0,-lean,1.2)
 vals.append(float(-lean_c.location.y))
 vals.append(float(sway_c.location.x))
 rows.append([round(v,4) for v in vals])
scene.frame_set(1);blend=out/'garage-guide-actions.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
source_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
metadata={'validation':{'maxProxyCenterError':round(max_proxy_error,6),'maxHandTargetDistance':round(max_hand_distance,6),'armSpanLimit':.61},'sourceSHA256':source_hash,'authoring':'Blender '+bpy.app.version_string,'fps':24,'frames':49,'sampleStep':2,'channels':['footLY','footLZ','footRY','footRZ','handLZ','handRZ','lean','sway'],'units':'metres; game X right,Y up,Z forward','license':'Original project-authored motion; follows repository license','samples':rows}
(out/'crew-motion.json').write_text(json.dumps(metadata,indent=2)+'\n')
if opts.write_runtime:
 p=root/'js/garage/crew-motion.js';text=p.read_text();start=text.index('  // @blender-motion:start');end=text.index('  // @blender-motion:end',start)
 block='  // @blender-motion:start\n  // Blender 4.2; tools/garage/author-crew-motion.py; 24 fps / 2; footLY,footLZ,footRY,footRZ,handLZ,handRZ,lean,sway\n  // Source SHA256: '+source_hash+'\n  const KEYS = '+json.dumps(rows,separators=(',',':'))+';\n'
 p.write_text(text[:start]+block+text[end:])
print(json.dumps({'blend':str(blend),'frames':49,'samples':len(rows),'channels':8,'export':str(out/'crew-motion.json')}))
