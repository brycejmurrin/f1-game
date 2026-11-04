#!/usr/bin/env python3
# @doc Authors the garage entrance lane/back scenes and exports allocation-light transform samples.
"""blender -b --python tools/garage/author-entrance.py
Original authored blocking; Blender XYZ = game X,-Z,Y; metres, 24 fps.
Natural braking into the reverse mark (coast then linear decel), nose-dive that
settles at the stop, then a quintic reverse into the bay.

  blender -b --python tools/garage/author-entrance.py
  blender -b --python tools/garage/author-entrance.py -- --export-existing

--export-existing samples assets/source/garage-entrance.blend without rebuilding
or saving it. Default rebuilds the authored baseline and replaces the .blend.
Camera cubic controls already assembled into the runtime JS are preserved.
"""
import bpy, math, json, hashlib, argparse, sys, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/garage-entrance'
OUT.mkdir(parents=True, exist_ok=True)
BLEND = ROOT / 'assets/source/garage-entrance.blend'
RUNTIME = ROOT / 'js/data/garage-entrance-motion.js'
args = argparse.ArgumentParser()
args.add_argument('--export-existing', action='store_true',
                  help='Export edited assets/source/garage-entrance.blend without rebuilding or saving it')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

N = 65
FPS = 24
LENGTH = 96
WHEEL_RADIUS = .34
WHEEL_SEGMENTS = 32
WHEEL_VERTEX_RADIUS = WHEEL_RADIUS / math.cos(math.pi / WHEEL_SEGMENTS)
COLUMNS = ['x', 'z', 'yaw', 'wheelRoll', 'steer', 'heave', 'pitch']
# Last fraction of lane time is a linear brake from cruise to rest (natural stop).
LANE_BRAKE = .38
LANE_DIVE = .011
BACK_DIVE = .007


def xyz(x, y, z):
  return (x, -z, y)


def material(name, color):
  m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
  m.diffuse_color = (*color, 1)
  return m


def box(name, loc, size, mat, parent=None):
  bpy.ops.mesh.primitive_cube_add(size=1)
  o = bpy.context.object
  o.name = name
  o.location = loc
  o.scale = size
  bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
  o.data.materials.append(mat)
  o.parent = parent
  return o


def channel_driver(o, index, rig, channel, sign=1):
  d = o.driver_add('rotation_euler', index).driver
  d.type = 'SCRIPTED'
  v = d.variables.new()
  v.name = 'channel'
  v.type = 'SINGLE_PROP'
  v.targets[0].id = rig
  v.targets[0].data_path = '["' + channel + '"]'
  d.expression = '-channel' if sign < 0 else 'channel'


def key(o, frame, x, z, yaw, roll, steer, heave, pitch):
  o.location = xyz(x, heave, z)
  o.rotation_euler = (0, 0, yaw)
  o.keyframe_insert('location', frame=frame)
  o.keyframe_insert('rotation_euler', frame=frame)
  for name, value in [('wheelRoll', roll), ('steer', steer), ('pitch', pitch)]:
    o[name] = value
    o.keyframe_insert(data_path='["' + name + '"]', frame=frame)


def lane_progress(u):
  """Unit distance along the 22 m lane: coast, then linear brake to rest."""
  b = LANE_BRAKE
  v0 = 1 / (1 - b / 2)
  if u <= 1 - b:
    return v0 * u, 0.0
  t = (u - (1 - b)) / b
  # Velocity falls linearly to zero; nose-dive tracks brake force and settles at rest.
  dist = v0 * (1 - b) + v0 * b * (t - t * t / 2)
  dive = LANE_DIVE * (4 * t * (1 - t) ** 2)  # builds under brake, settles as u→1
  return dist, -dive


def back_pose(u):
  # Quintic smoothstep: zero speed and acceleration at both holds.
  e = u * u * u * (10 + u * (-15 + 6 * u))
  path = 8 + 5 * math.pi / 2
  s = path * (1 - e)
  th = max(0, min(math.pi / 2, (s - 8) / 5))
  x = 5 * (1 - math.cos(th))
  z = s if s < 8 else 8 + 5 * math.sin(th)
  yaw = th
  distance = 22 - (path - s)
  steer = -.28 * math.sin(min(1, max(0, (s - 7) / 2)) * math.pi / 2) * min(1, u / .1)
  # Reverse settle: slight nose rise under reverse brake that returns to level.
  pitch = BACK_DIVE * math.sin(math.pi * u) ** 2 * (1 - u)
  return x, z, yaw, distance, steer, pitch


def build(phase):
  scene = bpy.data.scenes.new('entrance-' + phase)
  bpy.context.window.scene = scene
  scene.unit_settings.system = 'METRIC'
  scene.unit_settings.scale_length = 1
  scene.render.fps = FPS
  scene.frame_start = 1
  scene.frame_end = LENGTH + 1
  rig = bpy.data.objects.new('CarRoot-' + phase, None)
  scene.collection.objects.link(rig)
  red = material('Proxy team red', (.6, .025, .02))
  grey = material('Concrete', (.22, .24, .27))
  black = material('Rubber', (.02, .02, .025))
  pivot = bpy.data.objects.new('BodyPivot-' + phase, None)
  scene.collection.objects.link(pivot)
  pivot.parent = rig
  pivot.location = xyz(0, .34, .05)
  pivot.empty_display_type = 'PLAIN_AXES'
  box('Body-' + phase, (0, .05, .14), (1.7, 4.8, .4), red, pivot)
  box('Nose-' + phase, (0, -2.35, .01), (.5, 1.1, .25), red, pivot)
  channel_driver(pivot, 0, rig, 'pitch')
  for x in [-.9, .9]:
    for z in [-1.7, 1.7]:
      bpy.ops.mesh.primitive_cylinder_add(
        vertices=WHEEL_SEGMENTS, radius=WHEEL_VERTEX_RADIUS, depth=.32,
        location=(x, z, WHEEL_RADIUS), rotation=(0, math.pi / 2, 0))
      w = bpy.context.object
      bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
      w.name = 'Wheel-' + phase
      w.parent = rig
      w.data.materials.append(black)
      channel_driver(w, 0, rig, 'wheelRoll')
      if z < 0:
        channel_driver(w, 2, rig, 'steer', -1)
  box('Floor-' + phase, (0, -6.4, -.05), (10.8, 25, .1), grey)
  for x in [-4.05, 4.05]:
    box('Door jamb-' + phase, (x, -6.4, 1.8), (2.7, .2, 3.6), grey)
  box('Header-' + phase, (0, -6.4, 4.1), (10.8, .2, 1), grey)
  cam = bpy.data.objects.new('Entrance camera-' + phase, bpy.data.cameras.new('Entrance lens-' + phase))
  scene.collection.objects.link(cam)
  scene.camera = cam
  cam.location = xyz(-3.8, 2.1, -4.8)
  cam.data.lens = 23
  target = bpy.data.objects.new('Camera target-' + phase, None)
  scene.collection.objects.link(target)
  target.location = xyz(0, .8, 6.2)
  c = cam.constraints.new('TRACK_TO')
  c.target = target
  c.track_axis = 'TRACK_NEGATIVE_Z'
  c.up_axis = 'UP_Y'
  for i in range(N):
    u = i / (N - 1)
    f = 1 + u * LENGTH
    if phase == 'lane':
      v, pitch = lane_progress(u)
      x = -17 + 22 * v
      z = 13
      yaw = math.pi / 2
      distance = 22 * v
      steer = 0
      heave = 0
    else:
      x, z, yaw, distance, steer, pitch = back_pose(u)
      heave = 0
    key(rig, f, x, z, yaw, distance / WHEEL_RADIUS, steer, heave, pitch)
  for fc in rig.animation_data.action.fcurves:
    for k in fc.keyframe_points:
      k.interpolation = 'LINEAR'
  # Markers: brake completes at the reverse mark; crew hand-off matches that stop.
  if phase == 'lane':
    scene.timeline_markers.new('Brake settles at reverse mark', frame=1 + int(LENGTH))
    scene.timeline_markers.new('Crew hand-off at car stop', frame=1 + int(LENGTH))
  else:
    scene.timeline_markers.new('Rear crosses doorway', frame=55)
    scene.timeline_markers.new('Parked · crew service', frame=1 + int(LENGTH))
  scene['wheelRadius'] = WHEEL_RADIUS
  scene['wheelAcrossFlatRadius'] = WHEEL_RADIUS
  scene['wheelVertexRadius'] = WHEEL_VERTEX_RADIUS
  scene['wheelProxyContact'] = 'circumscribed polygon, signed support gap -5mm..0mm'
  scene['axes'] = 'Blender XYZ = game X,-Z,Y; metres; root origin floor centre; local nose -Y'
  scene['license'] = 'Apex26-Procedural'
  scene['runtime'] = 'evaluated root transform and custom channels; geometry is previz only'
  scene['laneBrake'] = LANE_BRAKE
  scene['export_recipe'] = 'blender -b --python tools/garage/author-entrance.py'
  scene.render.engine = 'BLENDER_WORKBENCH'
  scene.render.resolution_x = 844
  scene.render.resolution_y = 390
  scene.render.resolution_percentage = 100
  scene.display.shading.light = 'STUDIO'
  scene.display.shading.color_type = 'MATERIAL'
  scene.display.shading.show_shadows = True
  return scene


def existing_camera():
  """Keep assembled cubic camera controls already in the shipped runtime."""
  if not RUNTIME.exists():
    return None
  text = RUNTIME.read_text()
  m = re.search(r'"camera"\s*:\s*(\{.*\})\s*\}\)\s*;\s*\}\)\s*\(\)\s*;', text, re.S)
  if not m:
    # Fallback: evaluate the IIFE for the camera field only.
    try:
      # Strip to JSON object inside Object.freeze(...)
      inner = re.search(r'Object\.freeze\((\{.*\})\)\s*;\s*\}\)\s*\(\)\s*;', text, re.S)
      if not inner:
        return None
      data = json.loads(inner.group(1))
      return data.get('camera')
    except Exception:
      return None
  try:
    return json.loads(m.group(1))
  except Exception:
    inner = re.search(r'Object\.freeze\((\{.*\})\)\s*;\s*\}\)\s*\(\)\s*;', text, re.S)
    if not inner:
      return None
    return json.loads(inner.group(1)).get('camera')


if opts.export_existing:
  bpy.ops.wm.open_mainfile(filepath=str(BLEND))
else:
  bpy.ops.wm.read_factory_settings(use_empty=True)
  for phase in ['lane', 'back']:
    build(phase)
  bpy.context.preferences.filepaths.save_version = 0
  bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

data = {'version': 1, 'columns': COLUMNS}
inspection = {}
for phase in ['lane', 'back']:
  scene = bpy.data.scenes['entrance-' + phase]
  bpy.context.window.scene = scene
  rig = bpy.data.objects['CarRoot-' + phase]
  rows = []
  contact = []
  for i in range(N):
    frame = 1 + i * LENGTH / (N - 1)
    scene.frame_set(int(frame), subframe=frame - int(frame))
    o = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
    dg = bpy.context.evaluated_depsgraph_get()
    floor = bpy.data.objects['Floor-' + phase].evaluated_get(dg)
    top = max((floor.matrix_world @ v.co).z for v in floor.data.vertices)
    for wheel in [w for w in rig.children if w.name.startswith('Wheel-')]:
      evaluated = wheel.evaluated_get(dg)
      contact.append(min((evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices) - top)
    rows.append([round(v, 6) for v in [
      o.location.x, -o.location.y, o.rotation_euler.z,
      o['wheelRoll'], o['steer'], o.location.z, o['pitch']]])
  # Endpoints must join and finish parked / stopped.
  assert all(math.isfinite(v) for row in rows for v in row)
  data[phase] = rows
  inspection[phase] = {
    'samples': N, 'first': rows[0], 'last': rows[-1],
    'rootScale': list(rig.scale), 'hierarchy': [o.name for o in rig.children],
    'wheelFloorClearance': {'min': min(contact), 'max': max(contact)},
  }
  scene.frame_set(1)
  scene.render.filepath = str(OUT / (phase + '-opening.png'))
  bpy.ops.render.render(write_still=True)
  scene.frame_set(49)
  scene.render.filepath = str(OUT / (phase + '-middle.png'))
  bpy.ops.render.render(write_still=True)
  scene.frame_set(97)
  scene.render.filepath = str(OUT / (phase + '-end.png'))
  bpy.ops.render.render(write_still=True)

# Join + park contracts the sampler unit tests freeze.
lane_end, back_start, back_end = data['lane'][-1], data['back'][0], data['back'][-1]
for i, key in enumerate(COLUMNS):
  assert abs(lane_end[i] - back_start[i]) < 1e-4, key + ' lane/back join'
assert abs(back_end[0]) < 1e-5 and abs(back_end[1]) < 1e-5 and abs(back_end[2]) < 1e-5
assert abs(back_end[4]) < 1e-5 and abs(back_end[5]) < 1e-5 and abs(back_end[6]) < 1e-5
assert abs(lane_end[0] - 5) < 1e-4 and abs(lane_end[1] - 13) < 1e-4
assert abs(data['lane'][0][3] * WHEEL_RADIUS) < 1e-4
assert abs(lane_end[3] * WHEEL_RADIUS - 22) < 1e-3

cam = existing_camera()
if cam:
  data['camera'] = cam

(OUT / 'motion.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
(OUT / 'inspection.json').write_text(json.dumps(inspection, indent=2) + '\n')
header = (
  '/* Blender evaluated entrance curves. Source: tools/garage/author-entrance.py.\n'
  ' * Original Apex26-Procedural; metres/radians; regenerate, do not hand edit. */\n'
  'const GarageEntranceMotionData = (function () {\n'
  '  "use strict";\n'
  '  return Object.freeze('
)
RUNTIME.write_text(header + json.dumps(data, separators=(',', ':')) + ');\n})();\n')
sha = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
(OUT / 'validation.json').write_text(json.dumps({
  'blender': bpy.app.version_string,
  'sourceSHA256': hashlib.sha256(BLEND.read_bytes()).hexdigest(),
  'scriptSHA256': sha,
  'samples': N,
  'laneBrake': LANE_BRAKE,
  'cameraPreserved': bool(cam),
  'exportExisting': bool(opts.export_existing),
}, indent=2) + '\n')
print('ENTRANCE_EXPORT_PASS', N, 'brake', LANE_BRAKE, 'camera', bool(cam))
