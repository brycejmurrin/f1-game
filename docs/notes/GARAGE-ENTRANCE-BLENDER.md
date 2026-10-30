# Entrance motion production

Original project-authored motion and proxy geometry, `Apex26-Procedural`; no downloaded models, textures or third-party motion. Bootstrap source: deployed branch SHA `7c6d11c68ad8fd670ee2a882d53bb2eec50c548b`. Authoring uses Blender 4.3.2, installed at `/usr/bin/blender` in the production environment.

Rebuild the editable source, inspection receipts, six blocking frames and runtime data:

```sh
blender -b --factory-startup --python tools/gen/blender/garage-entrance.py -- --output-dir artifacts/garage-entrance --write-runtime
```

Edit `artifacts/garage-entrance/garage-entrance.blend`, then re-export those edits:

```sh
blender -b --python tools/gen/blender/garage-entrance.py -- --output-dir artifacts/garage-entrance-edited --source artifacts/garage-entrance/garage-entrance.blend --write-runtime
```

Generated source and review images stay under ignored `artifacts/` per repository policy; publish the selected source with the evidence bundle. `js/data/garage-entrance-motion.js` is the shipped runtime export. The script produces it; do not hand-edit sampled values. A scene opened with `--source` is sampled without reconstructing or overwriting the editable original.

There are two scenes, `entrance-lane` and `entrance-back`. Each is 96 authoring frames long at 24 fps; the runtime remaps normalized phase to tuner timing. Each root has 65 evaluated samples. Runtime columns are `x,z,yaw,wheelRoll,steer,heave,pitch`, in metres and radians. Wheel rotation accumulates through the lane/hold/reverse join. The reverse move has zero endpoint speed and acceleration. Steering begins neutral, turns while moving slowly, then unwinds before the straight approach to the service mark. Heave remains zero to preserve contact; the authored body pitch is a small separate channel.

Blender XYZ maps to game X, -Z, Y. The floor origin is the parked car centre; nose is Blender local -Y/game +Z; scale is one metre. Root scales are identity, body proxies have applied mesh scale, four wheel proxies have radius 0.36 m and centres at floor +0.36 m. Materials are simple named diffuse proxy materials; the renderer retains production car meshes/materials. Children live under the motion root and wheel/body channels drive the preview. Door jamb geometry represents the existing 5.4 m clear opening at game z=6.4. The interior camera uses a Track To target with eye (-3.8,2.1,-4.8).

The exported representation is sampled numeric curves. A GLB is intentionally not the runtime contract: the garage renderer owns car/crew meshes, draw transforms and camera ownership. The `.blend` geometry is editable production blocking, not replacement runtime geometry. Neither clip changes race physics clocks. Failure to load usable data is handled by the runtime sampler's procedural fallback.

API references checked during production:

- [Scene frame evaluation](https://docs.blender.org/api/4.3/bpy.types.Scene.html): `frame_set` evaluates requested frames/subframes.
- [Keyframe insertion](https://docs.blender.org/api/4.3/bpy.types.bpy_struct.html): key location, rotation and custom property channels.
- [Blender glTF export](https://docs.blender.org/manual/en/4.3/addons/import_export/scene_gltf2.html): glTF supports transform animation, but constraints/drivers require evaluated sampling and do not establish integration with Apex's draw API.

Static production checks: Blender completed without Python failure; inspection receipts report roots/children/materials/endpoints; runtime sampler unit checks passed 3/3 for corrupt-data fallback, joins/final position, mirrored contact and tuner remapping. Blender stills establish blocking only. Actual-game raster, lifecycle, camera continuity and mobile acceptance belong to integration verification.

Integration checkpoint: entrance-only `poseIn` consumes the authored route; out/home remain unchanged. Optional data and sampler warm in the existing lazy preset payload, without adding eager bytes. Each arrival latches data availability at start: cold or failed fetch retains the procedural route for that entire run; a later visit can use the authored route. Wheel/steering/pitch channels remain authoring data; the production whole-car preview mesh does not yet articulate them. Camera handoff and the pre-arrival parked flash remain open work. PR #4227 owner agreed to entrance-only pose edits in [this coordination reply](https://github.com/brycejmurrin/f1-game/pull/4227); their transport and home/out code remain owned there.
