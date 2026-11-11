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

Follow camera stays behind the subject and crosses the aperture near x=-1.5. Final eye (5.5,2.3,10.2), aim (12.4,.65,13), FOV 58°. Runtime uses the authored follow camera for the shipped CUT departure, preserves the paired legacy paths for explicitly selected rigs, and uses a fixed wide exterior establishing view for reduced motion.

Existing lane bands, opposite garages, bollards, hoardings and lighting support exterior filming, but x ±10.5 m original extent does not cover the final car. Lead owns lane/apron/frontage extension and coordination with entrance owner. The departure owner makes the additive extension in `js/garage/scene.js`; the entrance/tuner owner retains its arrival and preview files.

Export assertions passed finite samples, rear-clear turn, maximum successive camera displacement 0.150113 m. A 10,001-pose Node interpolation probe passed monotonic distance and swept doorway envelope clearance; car does not reach far wall. These geometric checks do not prove rendered crew intersections, lighting, actual Start Race handoff or actual-game smoothness. Actual Start Race verification and remaining presentation limits are recorded below.

Follow-up verification: `node --test --test-name-pattern='departure export|departure swept' tests/unit/garage-arrival.test.mjs` passes both motion tests. The tests sample both mirrored lane sides, check every car-envelope edge against three planes across the 30 cm door reveal, monotonic wheel distance, finite and repeatable output, caller vector reuse and camera continuity. Exporting the existing source twice produced identical runtime bytes and preserved the `.blend` SHA256.

## Runtime and ownership contract

`raceIntroFromSheet` waits for the race-session lazy bundle, including motion and wheel layers, under the existing PREPARING sheet. Its generation and sheet-owner checks discard cancelled loads; a false/rejected load releases controls through the existing failure path. `studioOpen/Shown/Done` owns the garage render camera and audio, `afterGarageOut` transfers to the loading cover/flyby, then `startRace` transfers to grid/driving. A skip finishes the departure only; race entry still owns its own skippable cover. Reduced-motion timing remains in force; CUT uses a fixed wide exterior camera, while explicitly selected tuner rigs retain their paired analytic path and camera. No camera preference is persisted by departure.

Arrival/tuner coordination: [PR #4227 comment](https://github.com/brycejmurrin/f1-game/pull/4227#issuecomment-6528704556). That session retains arrival.js and tuner UI/transport ownership. This change consumes the current timeline API without changing arrival motion. The arrival-tuner owner acknowledged the contract and confirmed its preview transport does not edit the departure start/left/stop APIs. Exterior owner is the departure integration: an additive outward frontage/lane extension, preserving the inward inspection shell.

The body mesh and fitted wheel layers build only when their configuration key changes. Render frames mutate car/camera/wheel transforms. Wheel distance comes from evaluated Blender samples; fixed calipers do not rotate. Reflected wheels use the same distance and steering under the reflected body matrix. Stop releases wheel meshes, engine, held gestures and sequence look; the next launch rebuilds its wheel cache even with identical settings.

Validation boundaries: authored crew proxies explain blocking, but existing runtime crew clips remain authoritative and require actual-game intersection inspection. Software Chromium evidence does not establish performance or appearance on an iPhone GPU.

## Actual-game evidence (2026-10-30)

Source `57e90ede2deeb0fd2747fcb58b4e60b302f0dd5d`; headless Chromium 154, three.js WebGPU on software adapter, 844×390 touch. `artifacts/departure/phone` captures default Bahrain night; `phone-day` and `phone-reduced-night` additionally use an iPhone user agent and explicit race-settings time changes. Each records the real menu → race settings → Start Race → garage → entry → count path, without staging a race through the debug API. All reach count with zero page/GPU errors and preserve saved DRIFT camera index 2. Departure observed for 10.53–10.57 seconds; render-clock callback gaps p90 26.4–31.7 ms are software observations, not hardware frame-rate guarantees. Videos, opening/middle/end PNGs, identity, trace and renderer diagnostics are retained in those artifact directories; `summary.json` aggregates coverage.

`artifacts/departure/repeat-skip` records two launches in one context with real Space-key skips, a quit and re-entry, and a DAY → NIGHT setup change. Both reach count without page errors. The first restores DRIFT; the actual C-key control then selects COCKPIT, and the second launch preserves that new preference (index 3).

Garage/setup-preview matrix: 363 passed, 0 failed. Additional DAILY/lazy integration checks: 79 passed; merged boot/load-order checks: 42 passed. Focused runtime/motion/geometry subset: 120 passed, 0 failed. Production-function unit coverage includes cancellation/stale loading callbacks and false/rejected departure preparation. The final actual-game `failure-retry` browser probe blocks the departure-motion script (two real requests), verifies PREPARATION FAILED with START RACE and BACK restored, removes the block and retries normally through garage to count. DRIFT index 2 survives and there are no page errors; video, failure/retry keyframes and result JSON are retained in `artifacts/departure/failure-retry`. Commit guards pass. Final structural floor at `d629974083be08ca12297cf1a9665cae5f8e7900`: `tooling-fast --changed --jobs=3 --quiet` passed all 727 test files with zero failures in the prepared clean validation clone. [CI 41105698795](https://github.com/brycejmurrin/f1-game/actions/runs/41105698795) also completed successfully, including all four Structural guards shards. Earlier setup, extraction-fixture and merged catalog-digest failures are retained; the catalog was regenerated and changed only its source digest, with its 38 tests passing. Initial concurrent-load, linked-worktree and pre-correction generator/registration/ratchet failures remain recorded. Earlier desktop capture failures remain retained. A matched video-only TLX harness (explicit page focus and phase history) subsequently reaches count on both base and candidate. Candidate: 628 garage callbacks over 10.55 s, zero page/GPU errors; `artifacts/departure/desktop-tlx-day` contains its actual video and extracted frames. However, desktop software presentation completes only two readbacks (last 10,562 ms; base last 7,882 ms), so its pixels hold the initial pose even while animation callbacks advance. This is lifecycle evidence, not a smooth-motion sign-off. GLX also reaches count, with only three garage callbacks over 40.4 s and readback-stall warnings. No hardware quality inference is made from either software result.

The targeted real-entry reduced-motion browser regression also passes on merged source `d62997408` (70.3 s test, 77.7 s runner): `= run passed (1/1 done, 0 failed, 0 skipped)` in `artifacts/logs/spec-garage-out-before-card.log`. Its first run failed at a strict timestamp comparison. Ordered mutation samples can share a timestamp; the assertion now uses event order after the final garage entry, retaining duration, visible-card, ordering and no-overlap requirements. Independent review accepted this correction. Earlier failure summary: `artifacts/departure/first-spec-failure.txt`.

Hardware follow-up: [GPU census run 41100541186](https://github.com/brycejmurrin/f1-game/actions/runs/41100541186), source57e90ede2, macos-latest, Bahrain/day, `entry=menu-full`, `relaunch=true`. Completed successfully: `anyHardware: true`, Apple GPU, full `menu-full` entry on WebGPU, WebGL2, GLX and WGX, all `phase=done`, `ok=true`, with zero GPU errors in the verdict. Cold and warm relaunch profiles also report `phase=done`, `ok=true`. The downloaded archive and per-backend JSON/screenshots are retained in `artifacts/departure/native-gpu`; [durable native evidence](https://github.com/brycejmurrin/f1-game/releases/tag/evidence-garage-departure-native-1030-6d94949e358fe76d) was checksum-verified by archive run 41104394986. This verifies hardware rendering and entry, rather than frame-by-frame cinematic motion. [Manual workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow). PR #4306 stays draft until remaining structural checks and desktop cinematic acceptance are resolved. Desktop hardware frame-by-frame departure capture and a physical phone run remain unverified; cancellation is covered by unit extraction of production functions rather than browser injection. A real Start Race failed-asset/retry browser probe is recorded below.

Dependent authoring-tool integration: [arrival-owner follow-up](https://github.com/brycejmurrin/f1-game/pull/4227#issuecomment-6529212981). Main Start Race consumes the new sampler after `poseOut` for CUT; the independently owned `poseFor("out")` tuner preview retains its old analytic CUT until that owner adopts the sampler. Its preview functions were deliberately not changed in this patch.

## Delivery and dependent entrance integration

The entrance session [PR #4309](https://github.com/brycejmurrin/f1-game/pull/4309) requested and received the [explicit shared wheel/lifecycle/camera contract](https://github.com/brycejmurrin/f1-game/pull/4306#issuecomment-6530256044). Departure owns `setup-camera.js`, `scene.js`, `game.js`, `lazy-bundles.js`, manifest and SW integration for this change. Entrance retains its motion/data/Blender source and `arrival.js`; it will adopt shared changes through a narrow dependent patch. `GarageDepartureWheels.create(gfx)` exposes `prepare(configKey, resolvedLivery, visualTiers)`, `draw(carMatrix, signedDistanceMetres, frontSteerRadians, material)` and `release()`. Authored wheel-roll radians map to distance with radius .34 m; body pitch belongs in the caller's car matrix. The module is lazy, so WORK ON CAR must await explicit readiness rather than switching a live trajectory when an idle load finishes.

The reviewed local video/source bundle is checksum-verified at `artifacts/evidence-uploads/garage-departure-1030-xTlb24/`. Publication failed at binary upload to `uploads.github.com` with HTTP 401; it is not published. Preserve that entire directory and retry the prepared receipt on a publishing host, as described in [evidence storage](../EVIDENCE-STORAGE.md):

```sh
node tools/shot/publish-evidence.mjs --receipt artifacts/evidence-uploads/garage-departure-1030-xTlb24/receipt.json --publish
```

The archive contains original Blender source/exporter, actual Start Race phone/desktop videos and keyframes, capture scripts, traces, error records, a matched baseline desktop run and native GPU JSON/screenshots. Its README identifies capture source `57e90ede2deeb0fd2747fcb58b4e60b302f0dd5d`, separately from packaging revision `d629974083be08ca12297cf1a9665cae5f8e7900`.

Final handoff: published runtime checkpoint `d629974083be08ca12297cf1a9665cae5f8e7900` has 727/727 local structural files and successful CI; the final reduced-motion real-entry browser test and failed-asset/retry probe both pass. Subsequent changes to this note are documentation only. Keep PR #4306 draft for remaining desktop cinematic visual acceptance; use its Hand-off block for the current documentation head and CI state.
