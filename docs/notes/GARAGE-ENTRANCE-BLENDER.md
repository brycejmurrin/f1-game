# Entrance motion production

Original project-authored motion and proxy geometry, `Apex26-Procedural`; no downloaded models, textures or third-party motion. Bootstrap source: deployed branch SHA `7c6d11c68ad8fd670ee2a882d53bb2eec50c548b`. Authoring uses Blender 4.3.2, installed at `/usr/bin/blender` in the production environment.

Rebuild the editable source, inspection receipts, six blocking frames and runtime data:

```sh
blender -b --factory-startup --python tools/gen/blender/garage-entrance.py -- --output-dir artifacts/garage-entrance --write-runtime
```

The editable authored source is `assets/source/garage-entrance.blend`. Edit it, then re-export those edits:

```sh
blender -b --python tools/gen/blender/garage-entrance.py -- --output-dir artifacts/garage-entrance-edited --source assets/source/garage-entrance.blend --write-runtime
```

The editable Blender authoring asset is committed under `assets/source/`; generated inspection reports, renders and capture bundles remain under ignored `artifacts/`. `js/data/garage-entrance-motion.js` is the shipped runtime export. The script produces it; do not hand-edit sampled values. A scene opened with `--source` is sampled without reconstructing or overwriting the editable original.

There are two scenes, `entrance-lane` and `entrance-back`. Each is 96 authoring frames long at 24 fps; the runtime remaps normalized phase to tuner timing. Each root has 65 evaluated samples. Runtime columns are `x,z,yaw,wheelRoll,steer,heave,pitch`, in metres and radians. Wheel rotation accumulates through the lane/hold/reverse join. The reverse move has zero endpoint speed and acceleration. Steering begins neutral, turns while moving slowly, then unwinds before the straight approach to the service mark. Heave remains zero to preserve contact; the authored body pitch is a small separate channel.

Blender XYZ maps to game X, -Z, Y. The floor origin is the parked car centre; nose is Blender local -Y/game +Z; scale is one metre. Root scales are identity, body proxies have applied mesh scale, four wheel proxies have radius 0.36 m and centres at floor +0.36 m. Materials are simple named diffuse proxy materials; the renderer retains production car meshes/materials. Children live under the motion root and wheel/body channels drive the preview. Door jamb geometry represents the existing 5.4 m clear opening at game z=6.4. The interior camera uses a Track To target with eye (-3.8,2.1,-4.8).

The exported representation is sampled numeric curves. A GLB is intentionally not the runtime contract: the garage renderer owns car/crew meshes, draw transforms and camera ownership. The `.blend` geometry is editable production blocking, not replacement runtime geometry. Neither clip changes race physics clocks. Failure to load usable data is handled by the runtime sampler's procedural fallback.

API references checked during production:

- [Scene frame evaluation](https://docs.blender.org/api/4.3/bpy.types.Scene.html): `frame_set` evaluates requested frames/subframes.
- [Keyframe insertion](https://docs.blender.org/api/4.3/bpy.types.bpy_struct.html): key location, rotation and custom property channels.
- [Blender glTF export](https://docs.blender.org/manual/en/4.3/addons/import_export/scene_gltf2.html): glTF supports transform animation, but constraints/drivers require evaluated sampling and do not establish integration with Apex's draw API.

Static production checks: Blender completed without Python failure; inspection receipts report roots/children/materials/endpoints; runtime sampler unit checks passed 3/3 for corrupt-data fallback, joins/final position, mirrored contact and tuner remapping. Blender stills establish blocking only. Actual-game raster, lifecycle, camera continuity and mobile acceptance belong to integration verification.

Integration checkpoint: entrance-only `poseIn` consumes the authored route; out/home remain unchanged. Optional data and sampler warm in the existing lazy preset payload, without adding eager bytes. Each arrival latches data availability at start: cold or failed fetch retains the procedural route for that entire run; a later visit can use the authored route. Wheel/steering/pitch channels remain authoring data; the production whole-car preview mesh does not yet articulate them. Camera handoff and the pre-arrival parked flash remain open work. PR #4227 owner agreed to entrance-only pose edits in [this coordination reply](https://github.com/brycejmurrin/f1-game/pull/4227); their transport and home/out code remain owned there.

Camera-language research: [Adobe establishing-shot guide](https://www.adobe.com/creativecloud/video/discover/establishing-shot.html) supports establishing bay geography before introducing the car. External physical reference footage was not successfully obtained; no footage-match claim is made. [Playwright video documentation](https://playwright.dev/docs/videos) was checked for explicit remote video saving, and [network documentation](https://playwright.dev/docs/network) for service-worker interception limits.

## Verification checkpoint (2026-10-30, 10:39 Pacific)

Runtime captures served `/workspace/garage-entrance` at source revision `13d9e7c06`; subsequent changes are this note and the non-served editable source asset. Fixture placement uses the existing debug driving controls to reach a legitimate Bahrain pit-box stop in a factory McLaren. The feature trigger is Playwright clicking the visible WORK ON CAR HUD button, not calling an internal arrival function. These are real game frames, not Blender renders or replay data.

| Check | Outcome | Evidence under `artifacts/` |
| --- | --- | --- |
| Phone full entry, lock/unlock, race physics held | Pass; position/speed unchanged across 60 observations; zero page errors | `garage-entrance-real/result.json`, `phone-0.png`, `phone-20.png`, `phone-55.png` |
| Warm entry and skip | Pass; authored data available; skip unlocks; RETURN TO RACE closes garage | `garage-entrance-skip/result.json` |
| Repeat entry from the same valid stop | Pass; second actual WORK ON CAR opens an active arrival, then skip/return succeeds | `garage-entrance-repeat/result.json`, `motion.webm` |
| Reduced OS motion | Pass; no staged arrival or inert controls; return succeeds | `garage-entrance-reduced/result.json` |
| Optional export network failure | Pass with service workers blocked for interception; both script requests aborted, availability false, procedural sequence completes and returns; zero page errors | `garage-entrance-failure-network/result.json`, `motion.webm` |
| Desktop entry | Pass at 1440×900, render scale 0.5; zero page errors, physics held | `garage-entrance-real-desktop-scaled/result.json`, `desktop-0.png`, `desktop-middle.png` (video at 67s), `desktop-55.png`, `motion.webm` |
| Desktop full-resolution pointer entry | Unverified; HUD click timed out under software rendering | `logs/entrance-real-desktop.log` |
| Cold delayed-load path ownership and internal cancellation | VM pass; late source cannot change an active run; not yet reproduced as a delayed-load real-entry browser case | `logs/entrance-focused.log` |
| Mid-sequence navigation cancellation | Not run; ordinary Escape maps to skip. Internal cancellation has unit coverage | — |

All captures use Three/WebGL2 on ANGLE SwiftShader, not a physical phone/GPU. Phone viewport is 844×390 touch at the shipped mobile scale 0.5. The tuner-only capture is separate (`garage-entrance-game/`); its fixed sampling window covers opening motion, not a completed arrival. Its CPU profile includes video/probe overhead and cannot establish a speed improvement. The first attempted export failure capture had authored data available because interception missed service-worker traffic; it is excluded from fallback acceptance. Initial pit fixture misses are setup failures and excluded from entrance acceptance.

Structural evidence: commit guards passed at `5e83a1c29`; focused motion/load-order/normalizer tests 51/51; sampler and façade regression tests 6/6. The full structural run finished 729/731 with two failures: linked-worktree `tool-hook-fixes` expects a main checkout, and eager script budget is 8,210,424 bytes against 8,200,000 (base already 8,209,755). Neither is recorded as green. Remaining car/hooks/tiny/ui groups and real GPU checks are not run. The floor `garage-first-frame` spec passed 5/5 with zero failures/skips (`= run passed (5/5 done, 0 failed, 0 skipped)`, `artifacts/logs/spec-garage-first-frame.log`).

Shared ownership now includes departure draft [#4306](https://github.com/brycejmurrin/f1-game/pull/4306). That session owns `setup-camera.js`, `scene.js`, `game.js`, `lazy-bundles.js` and its departure wheel seam; a coordination request asks for the reusable contract and manifest/SW ownership. This entrance draft does not edit those shared renderer/lifecycle files. Visible wheel/steer/pitch integration, continuous setup-camera handoff, first-entry parked-flash ordering, production-mesh/crew swept clearance, physical motion-reference footage and full-resolution desktop acceptance remain incomplete. Do not mark this draft ready or claim the full mission complete.

The evidence-release upload returned HTTP401 at `uploads.github.com`; local prepared bundle/receipt is retained under `artifacts/evidence-uploads/garage-entrance-blender-zT4Tj6/`. The editable 662 KiB authoring asset is delivered in Git at `assets/source/garage-entrance.blend` (SHA256 `f8fd1ba56465e6430751544442aacafb7c59687e4adebfa354af35c1dc88b372`), with original Apex26-Procedural provenance above. Generated screenshots/videos/reports remain outside Git.
