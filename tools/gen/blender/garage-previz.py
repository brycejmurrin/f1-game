#!/usr/bin/env python3
# @doc Editable Blender previz of the garage arrival / drive-out (bay, shutter, car, keyed camera) from arrival-poses JSON.
"""Garage in / out previz, keyed from the game's own poses.

  node tools/garage/arrival-poses.mjs --out artifacts/garage-previz/poses.json
  blender -b --factory-startup --python tools/gen/blender/garage-previz.py -- \
      --poses artifacts/garage-previz/poses.json --output-dir artifacts/garage-previz [--render] [--step 2]

One Blender scene per clip (garage-in, garage-out) sharing one room built from
TrackPit.BAY: floor and pit lane, walls with the door hole, ceiling, a roller
shutter keyed from `door`, a car proxy keyed from x / z / yaw (nose = red
wedge), and the camera keyed from eye / aim / fov (vertical, as
M4.perspectiveTo). Every key is CONSTANT, so a two-eye CUT is frame-exact.
Caption changes (`label`) are timeline markers. The .blend is the design
surface: retime or re-path the car proxy and camera there, then port the
change into js/garage/arrival.js (the runtime stays analytic).

Blender XYZ = game X, -Z, Y; game yaw = Blender Z rotation (forward is local
-Y), as tools/gen/blender/crew-choreo.py. --render writes Workbench frames and,
with ffmpeg on PATH, garage-<dir>.mp4 plus a contact sheet garage-<dir>-sheet.png.
"""
import bpy, math, json, argparse, sys, shutil, subprocess
from pathlib import Path

args = argparse.ArgumentParser()
args.add_argument('--poses', required=True)
args.add_argument('--output-dir', required=True)
args.add_argument('--render', action='store_true')
args.add_argument('--step', type=int, default=1, help='render every Nth frame (keys stay at full rate)')
args.add_argument('--res', default='844x390', help='WxH; default the phone landscape the owner plays on')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
data = json.loads(Path(opts.poses).read_text())
out = Path(opts.output_dir).resolve(); out.mkdir(parents=True, exist_ok=True)
W, H = (int(v) for v in opts.res.split('x'))
BAY = data['bay']

def xyz(p): return (p[0], -p[2], p[1])

bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb):
    m = bpy.data.materials.new(name); m.diffuse_color = (*rgb, 1); return m

def box(name, coll, centre, size, material):
    """Axis-aligned box: centre and size in GAME axes (x, y up, z)."""
    me = bpy.data.meshes.new(name)
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    v = [(sx * hx, sy * hz, sz * hy) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]   # Blender local
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me.from_pydata(v, [], f); me.materials.append(material)
    o = bpy.data.objects.new(name, me); o.location = xyz(centre); coll.objects.link(o)
    return o

# ── THE ROOM (shared by every clip scene) ────────────────────────────────────
room = bpy.data.collections.new('Garage bay')
hw, zb, zd, ch = BAY['w'] / 2, -BAY['depth'] / 2, BAY['depth'] / 2, BAY['h']
dw, dh, t = BAY['doorW'] / 2, BAY['doorH'], 0.15
CONCRETE, WALL, LANE, STEEL = mat('Floor', (.42, .42, .44)), mat('Wall', (.78, .78, .8)), mat('Pit lane', (.16, .16, .17)), mat('Shutter', (.5, .52, .56))
box('Floor', room, (0, -.05, 0), (BAY['w'], .1, BAY['depth']), CONCRETE)
box('Pit lane', room, (0, -.06, zd + 14), (60, .1, 28), LANE)
box('Ceiling', room, (0, ch + t / 2, 0), (BAY['w'], t, BAY['depth']), WALL)
box('Back wall', room, (0, ch / 2, zb - t / 2), (BAY['w'], ch, t), WALL)
for s in (-1, 1):
    box('Side wall %+d' % s, room, (s * (hw + t / 2), ch / 2, 0), (t, ch, BAY['depth']), WALL)
    box('Door jamb %+d' % s, room, (s * (dw + hw) / 2, ch / 2, zd + t / 2), (hw - dw, ch, t), WALL)
box('Door header', room, (0, (dh + ch) / 2, zd + t / 2), (2 * dw, ch - dh, t), WALL)
lamp = bpy.data.objects.new('Bay light', bpy.data.lights.new('Bay light', 'AREA'))
lamp.data.energy = 1500; lamp.data.size = 6; lamp.location = xyz((0, ch - .2, 0)); room.objects.link(lamp)

# ── ONE SCENE PER CLIP ───────────────────────────────────────────────────────
def key_all(obj, path):
    for fc in (obj.animation_data.action.fcurves if obj.animation_data and obj.animation_data.action else []):
        if fc.data_path == path:
            for k in fc.keyframe_points: k.interpolation = 'CONSTANT'

made = []
for clip in data['clips']:
    name = 'garage-' + clip['dir']
    scene = bpy.data.scenes.new(name); scene.collection.children.link(room)
    fps = clip['fps']; scene.render.fps = fps; scene.frame_start = 1; scene.frame_end = len(clip['frames'])
    scene.render.resolution_x, scene.render.resolution_y = W, H
    world = bpy.data.worlds.new(name); world.color = (.55, .6, .68); scene.world = world
    coll = bpy.data.collections.new(name + ' actors'); scene.collection.children.link(coll)

    car = box('Car', coll, (0, .45, 0), (1.9, .9, 5.6), mat('Car', (.08, .08, .1)))
    nose = box('Nose', coll, (0, 0, 0), (1.2, .12, 1.2), mat('Nose', (.88, .02, 0)))
    nose.parent = car; nose.location = xyz((0, .5, 2.1))   # car-local: a red stripe on top of the front
    shutter = box('Shutter', coll, (0, dh / 2, zd + t * 1.5), (2 * dw, dh, .05), STEEL)

    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); coll.objects.link(cam); scene.camera = cam
    cam.data.sensor_fit = 'VERTICAL'; cam.data.clip_start = .1; cam.data.clip_end = 60
    aim = bpy.data.objects.new('Aim', None); aim.empty_display_type = 'SPHERE'; aim.empty_display_size = .15; coll.objects.link(aim)
    track = cam.constraints.new('TRACK_TO'); track.target = aim; track.track_axis = 'TRACK_NEGATIVE_Z'; track.up_axis = 'UP_Y'

    label = None
    for i, f in enumerate(clip['frames']):
        fr = i + 1
        car.location = xyz((f['x'], .45, f['z'])); car.rotation_euler = (0, 0, f['yaw'])
        car.keyframe_insert('location', frame=fr); car.keyframe_insert('rotation_euler', frame=fr)
        shutter.location = xyz((0, dh / 2 + dh * f['door'], zd + t * 1.5)); shutter.keyframe_insert('location', frame=fr)
        cam.location = xyz(f['eye']); cam.keyframe_insert('location', frame=fr)
        aim.location = xyz(f['aim']); aim.keyframe_insert('location', frame=fr)
        cam.data.angle_y = math.radians(f['fov']); cam.data.keyframe_insert('lens', frame=fr)
        if f['label'] != label:
            label = f['label']; scene.timeline_markers.new(label, frame=fr)
    for o, paths in ((car, ('location', 'rotation_euler')), (shutter, ('location',)), (cam, ('location',)), (aim, ('location',)), (cam.data, ('lens',))):
        for p in paths: key_all(o, p)
    made.append((scene, clip))

for s in [s for s in bpy.data.scenes if s not in [m[0] for m in made]]: bpy.data.scenes.remove(s)
blend = out / 'garage-previz.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))

report = dict(blend=str(blend), scenes=[dict(scene=s.name, frames=s.frame_end, seconds=c['length'], angle=c['angle'],
              markers=[m.name for m in sorted(s.timeline_markers, key=lambda m: m.frame)]) for s, c in made])
if opts.render:
    ffmpeg = shutil.which('ffmpeg')
    for scene, clip in made:
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
        scene.display.shading.show_shadows = True; scene.display.shading.show_cavity = True
        scene.render.image_settings.file_format = 'PNG'
        frames = out / ('frames-' + clip['dir']); shutil.rmtree(frames, ignore_errors=True); frames.mkdir()
        n = 0
        for fr in range(scene.frame_start, scene.frame_end + 1, max(1, opts.step)):
            # Background mode has no window: frame_set re-evaluates only the
            # context scene, so each clip renders under its own override.
            with bpy.context.temp_override(scene=scene):
                scene.frame_set(fr); scene.render.filepath = str(frames / ('%04d.png' % n)); n += 1
                bpy.ops.render.render(write_still=True)
        if ffmpeg:
            rate = str(clip['fps'] / max(1, opts.step)); mp4 = out / ('garage-%s.mp4' % clip['dir'])
            subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-framerate', rate, '-i', str(frames / '%04d.png'),
                            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', str(mp4)], check=True)
            sheet = out / ('garage-%s-sheet.png' % clip['dir']); every = max(1, n // 12)
            subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', str(frames / '%04d.png'), '-vf',
                            "select='not(mod(n\\,%d))',scale=422:-1,tile=3x4" % every, '-frames:v', '1', str(sheet)], check=True)
            report.setdefault('renders', []).append(dict(mp4=str(mp4), sheet=str(sheet), frames=n))
print(json.dumps(report))
