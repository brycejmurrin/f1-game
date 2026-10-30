# Garage departure motion authoring

Base: `7c6d11c68ad8fd670ee2a882d53bb2eec50c548b`, isolated worktree `/workspace/garage-departure`.

Original project-authored blocking in `assets/source/garage-departure.blend` uses Blender 4.3.2. Rebuild from repository root:

```sh
blender -b --python tools/garage/author-departure.py
```

To edit the saved source, open `assets/source/garage-departure.blend` in Blender, modify `departure.car.root`, `departure.follow` and `departure.aim` keyed transforms/lens across frames 49–193, then save. Export those edits without rebuilding or writing the `.blend`:

```sh
blender -b --python tools/garage/author-departure.py -- --export-existing
```

The default command rebuilds the authored baseline and replaces the `.blend`; `--export-existing` preserves it byte for byte. Keep object names and frame range. Car and aim translation must remain unparented, and yaw is Blender rotation Z. Wheel distance is measured from the evaluated edited car path rather than the baseline formula. Export fails if camera sample displacement exceeds 0.3 m or the initial straight moves laterally before clearing the door; run the swept-envelope unit checks after edits.

Both modes write `js/data/garage-departure-motion.js` and `artifacts/garage-departure/validation.json`. API checked: https://docs.blender.org/api/current/bpy.types.Object.html (location, keyframe_insert); fetched reference retained under artifacts.

Metres, 24 fps, Blender XYZ = game X, -Z, Y. Car envelope x ±0.95, z -2.69..3.18 matches documented procedural car bounds; nose faces game +Z. Frames 1–49 block crew release; 49–193 contain normalized rolling time. Crew proxies demonstrate retreat positions; runtime retains selected existing choreography and must hold the car until release completes.

`GarageDepartureMotion.sample(u, side, out)` mutates a caller-owned object with x, z, yaw, cumulative distance, crewClear, eye[3], aim[3], and vertical fov degrees. Preallocate eye and aim arrays. `u` is rolling time 0–1 after crew release and shutter opening. First 0.16307 accelerates from rest. Car keys are dense linear curves; camera uses Blender Bezier keys. Export evaluates 241 samples. Runtime interpolation allocates no arrays or closures and never rebuilds geometry. Side -1 mirrors X and yaw.

Car travels straight to z=9.8 before radius 3.2 m turn, clearing the 6.4 m doorway plane with the rear before turning. End: x=12.4, z=13, yaw=π/2, cumulative distance≈24.02631 m. Wheel rotation must use distance and actual wheel radius, independent of FPS.

Follow camera stays behind the subject and crosses the aperture near x=-1.5. Final eye (5.5,2.3,10.2), aim (12.4,.65,13), FOV 58°. Runtime should use authored camera for the shipped departure shot, preserve user-selected rigs, and follow existing reduced-motion skip policy.

Existing lane bands, opposite garages, bollards, hoardings and lighting support exterior filming, but x ±10.5 m original extent does not cover the final car. Lead owns lane/apron/frontage extension and coordination with entrance owner. This task changes no shared scene files.

Export assertions passed finite samples, rear-clear turn, maximum successive camera displacement 0.150113 m. A 10,001-pose Node interpolation probe passed monotonic distance and swept doorway envelope clearance; car does not reach far wall. These geometric checks do not prove rendered crew intersections, lighting, actual Start Race handoff or actual-game smoothness. Parent must verify desktop and 844×390 touch landscape.

Follow-up verification: `node --test --test-name-pattern='departure export|departure swept' tests/unit/garage-arrival.test.mjs` passes both motion tests. The tests sample both mirrored lane sides, check every car-envelope edge against three planes across the 30 cm door reveal, monotonic wheel distance, finite and repeatable output, caller vector reuse and camera continuity. Exporting the existing source twice produced identical runtime bytes and preserved the `.blend` SHA256.

## Runtime and ownership contract

`raceIntroFromSheet` waits for the race-session lazy bundle, including motion and wheel layers, under the existing PREPARING sheet. Its generation and sheet-owner checks discard cancelled loads; a false/rejected load releases controls through the existing failure path. `studioOpen/Shown/Done` owns the garage render camera and audio, `afterGarageOut` transfers to the loading cover/flyby, then `startRace` transfers to grid/driving. A skip finishes the departure only; race entry still owns its own skippable cover. Existing reduced-motion framing and timing remain in force. No camera preference is persisted by departure.

Arrival/tuner coordination: [PR #4227 comment](https://github.com/brycejmurrin/f1-game/pull/4227#issuecomment-6528704556). That session retains arrival.js and tuner UI/transport ownership. This change consumes the current timeline API without changing arrival motion. An acknowledgement from the independent session has not been observed. Exterior owner is the departure integration: an additive outward frontage/lane extension, preserving the inward inspection shell.

The body mesh and fitted wheel layers build only when their configuration key changes. Render frames mutate car/camera/wheel transforms. Wheel distance comes from evaluated Blender samples; fixed calipers do not rotate. Reflected wheels use the same distance and steering under the reflected body matrix. Stop releases wheel meshes, engine, held gestures and sequence look; the next launch rebuilds its wheel cache even with identical settings.

Validation boundaries: authored crew proxies explain blocking, but existing runtime crew clips remain authoritative and require actual-game intersection inspection. Software Chromium evidence does not establish performance or appearance on an iPhone GPU.
