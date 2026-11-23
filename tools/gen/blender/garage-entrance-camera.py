#!/usr/bin/env python3
# @doc Author and export editable Blender entrance camera blocking.
"""Editable camera-blocking PROPOSAL, not runtime accepted motion.

Run only after the lead has closed its browser:
blender -b --python tools/gen/blender/garage-entrance-camera.py -- \
  --source assets/source/garage-entrance.blend \
  --output-dir artifacts/entrance-blender-camera

Reads existing source, saves a separate proposal .blend and normalized samples.
Never writes assets/source or js/. Original Apex26-Procedural geometry/motion.
API references: https://docs.blender.org/api/4.3/bpy.types.Scene.html
https://docs.blender.org/api/4.3/bpy.types.bpy_struct.html
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output-dir', required=True)
parser.add_argument('--export-existing', action='store_true', help='Export the saved proposal camera as edited, without authoring or saving a blend')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = Path(args.source).resolve()
out = Path(args.output_dir).resolve()
out.mkdir(parents=True, exist_ok=True)
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.data.scenes['entrance-back']
bpy.context.window.scene = scene
sys.path.insert(0,str(Path(__file__).resolve().parent))
from garage_entrance_camera_export import export_camera
if args.export_existing:
    result=export_camera(scene,bpy.data.objects['Doorway handoff proposal camera'],
        bpy.data.objects['Doorway handoff live car target'],source,out)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash,'Source changed during export'
    print(json.dumps({'source':str(source),'samples':len(result['rows']),'sourcePreserved':True,'status':'export-existing'}))
    sys.exit(0)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.render.fps = 24
# Match the real default CUT mirrored route in this COPY only. Existing source
# authors positive-side car path; runtime right camera selects side=-1.
rig = bpy.data.objects['CarRoot-back']
for fc in rig.animation_data.action.fcurves:
    if ((fc.data_path == 'location' and fc.array_index == 0)
            or (fc.data_path == 'rotation_euler' and fc.array_index == 2)
            or fc.data_path == '["steer"]'):
        for k in fc.keyframe_points:
            for co in (k.co, k.handle_left, k.handle_right):
                co.y *= -1

def to_blender(game):
    return (game[0], -game[2], game[1])

def ease(u):
    u = max(0, min(1, u))
    return u * u * u * (10 + u * (-15 + 6 * u))

# Tangents are metres per normalized route time. At the two doorway pins,
# tangent X/Y is zero: the crossing is straight and cannot bulge into a jamb.
# Endpoint/fit is only nominal in Blender; runtime computes its exact endpoint.
PINS = [
    {'u': 0.00, 'eye': [4.1, 2.25, -4.9], 'tangent': [0, 0, 0], 'name': 'Right-shot handoff begins'},
    {'u': 0.30, 'eye': [3.6, 2.55, 0], 'tangent': [-4.09, .45, 15.98], 'name': 'Raised interior dolly'},
    {'u': 0.66, 'eye': [1.4, 2.55, 5.65], 'tangent': [0, 0, 12], 'name': 'Doorway approach'},
    {'u': 0.78, 'eye': [1.4, 2.55, 7.1], 'tangent': [0, 0, 8], 'name': 'Outside reveal clear'},
    {'u': 1.00, 'eye': [4.63, 2.04, 7.01], 'tangent': [0, 0, 0], 'name': 'Nominal setup endpoint'},
]

def sample(u):
    u = max(0, min(1, u))
    i = next((i for i in range(len(PINS) - 1) if u <= PINS[i + 1]['u']), len(PINS) - 2)
    a, b = PINS[i], PINS[i + 1]
    span = b['u'] - a['u']
    t = (u - a['u']) / span
    h00, h10 = 2*t**3 - 3*t**2 + 1, t**3 - 2*t**2 + t
    h01, h11 = -2*t**3 + 3*t**2, t**3 - t**2
    return [h00*a['eye'][j] + h10*span*a['tangent'][j]
            + h01*b['eye'][j] + h11*span*b['tangent'][j] for j in range(3)]

collection = bpy.data.collections.new('Physical camera handoff PROPOSAL')
scene.collection.children.link(collection)
camera = bpy.data.objects.new('Doorway handoff proposal camera', bpy.data.cameras.new('Doorway handoff proposal lens'))
collection.objects.link(camera)
camera.data.sensor_fit = 'VERTICAL'
camera.data.sensor_height = 24
camera.data.clip_start = .1
camera.data.clip_end = 200
target = bpy.data.objects.new('Doorway handoff live car target', None)
collection.objects.link(target)
constraint = camera.constraints.new('TRACK_TO')
constraint.target = target
constraint.track_axis = 'TRACK_NEGATIVE_Z'
constraint.up_axis = 'UP_Y'
scene.camera = camera

# Route includes existing .3-second tail; car finishes its 3.6s back-in first.
# Original car root keys end at97; rescale them over3.6s at24fps in the copy.
for fc in rig.animation_data.action.fcurves:
    for k in fc.keyframe_points:
        for co in (k.co, k.handle_left, k.handle_right):
            co.x = 1 + (co.x - 1) * (3.6*24/96)
scene.frame_start = 1
scene.frame_end = 1 + round(3.9 * 24)
rows = []
for pin in PINS:
    camera.location = to_blender(pin['eye'])
    camera.keyframe_insert('location', frame=1+pin['u']*3.9*24)
# Actual editable Blender location curves carry matching spatial/time Bezier
# handles, rather than a follow-path constraint that reparameterizes by length.
for fc in camera.animation_data.action.fcurves:
    for i, key in enumerate(fc.keyframe_points):
        pin = PINS[i]
        previous = pin['u'] - PINS[max(0, i-1)]['u'] if i else PINS[1]['u']
        following = PINS[min(len(PINS)-1, i+1)]['u'] - pin['u'] if i<len(PINS)-1 else previous
        derivative = to_blender(pin['tangent'])[fc.array_index]
        key.interpolation = 'BEZIER'
        key.handle_left_type = key.handle_right_type = 'FREE'
        key.handle_left = (key.co.x-previous*3.9*24/3, key.co.y-derivative*previous/3)
        key.handle_right = (key.co.x+following*3.9*24/3, key.co.y+derivative*following/3)
for index in range(241):
    u = index / 240
    frame = 1 + u * 3.9 * 24
    scene.frame_set(int(frame), subframe=frame-int(frame))
    evaluated = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
    car = [evaluated.location.x, evaluated.location.z, -evaluated.location.y]
    # Real default CUT RIGHT starts on a deliberate cut. Track the actual car
    # immediately; blending the old doorway aim toward a parked target points
    # at empty floor while the car crosses the entrance.
    yaw = float(evaluated.rotation_euler.z)
    normal = [0, .45, .245]
    c,s = math.cos(yaw),math.sin(yaw)
    aim = [car[0]+c*normal[0]+s*normal[2], normal[1], car[2]-s*normal[0]+c*normal[2]]
    w = ease(u)
    target.location = to_blender(aim)
    fov = math.radians(54 + (36-54)*w)
    camera.data.lens = 12/math.tan(fov/2)
    camera.data.keyframe_insert('lens', frame=frame)
    target.keyframe_insert('location', frame=frame)
for obj in (target,):
    for fc in obj.animation_data.action.fcurves:
        for key in fc.keyframe_points:
            key.interpolation = 'LINEAR'
for fc in camera.data.animation_data.action.fcurves:
    for key in fc.keyframe_points:
        key.interpolation = 'LINEAR'
# Export evaluated Blender values after animation/constraints exist; edits to
# the saved camera keys remain visible and separately exportable.
for index in range(241):
    u = index/240
    frame = 1+u*3.9*24
    scene.frame_set(int(frame),subframe=frame-int(frame))
    deps = bpy.context.evaluated_depsgraph_get()
    eye_b = camera.evaluated_get(deps).matrix_world.translation
    aim_b = target.evaluated_get(deps).matrix_world.translation
    eye = [eye_b.x,eye_b.z,-eye_b.y]
    aim = [aim_b.x,aim_b.z,-aim_b.y]
    rows.append([u,*eye,*aim,math.degrees(2*math.atan(12/camera.data.lens))])
for pin in PINS:
    marker = bpy.data.objects.new(pin['name'], None)
    collection.objects.link(marker)
    marker.location = to_blender(pin['eye'])
    marker.empty_display_type = 'SPHERE'
    marker.empty_display_size = .2
    marker['normalizedTime'] = pin['u']
    scene.timeline_markers.new(pin['name'], frame=1+round(pin['u']*3.9*24))
scene['cameraProposal'] = 'Runtime-dependent, not accepted; exact full-hull/panel projection remains runtime-owned'
scene['cameraOriginalSourceSHA256'] = source_hash
scene['cameraProposalAxes'] = 'game XYZ -> Blender X,-Z,Y; metres; source file preserved'
scene['cameraProposalDuration'] = '3.6s back-in plus existing0.3s tail; speed/slowmo tuner modifies wall time'
scene['cameraAimPolicy'] = 'Immediate real default CUT RIGHT car-tracked normal setup target offset [0,.45,.245]; LEFT/DOOR establishment unaffected'
scene['cameraProposalClearance'] = 'Doorway pins x1.4,y2.55,z5.65..7.1; camera safety radius0.2m; production crew/props not yet audited'
scene['license'] = 'Apex26-Procedural'
scene.frame_set(1)
bpy.context.preferences.filepaths.save_version = 0
destination = out/'garage-entrance-camera-proposal.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash, 'Original source changed'
segments=[]
for a,b in zip(PINS,PINS[1:]):
    span=b['u']-a['u']
    segments.append({'from':a['u'],'to':b['u'],'controls':[a['eye'],
        [a['eye'][i]+span*a['tangent'][i]/3 for i in range(3)],
        [b['eye'][i]-span*b['tangent'][i]/3 for i in range(3)],b['eye']]})
export_camera(scene,camera,target,destination,out)
print(json.dumps({'blend':str(destination),'samples':len(rows),'sourcePreserved':True,'status':'proposal'}))
