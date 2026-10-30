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

Blender XYZ maps to game X, -Z, Y. The floor origin is the parked car centre; nose is Blender local -Y/game +Z; scale is one metre. Root scales are identity, body proxies have applied mesh scale, four wheel proxies use nominal rolling radius 0.34 m and centres at floor +0.34 m. The circumscribed 32-sided support mesh has vertex radius 0.3416451146 m to avoid floating between polygon faces; see the signed support audit below. Materials are simple named diffuse proxy materials; the renderer retains production car meshes/materials. Children live under the motion root and wheel/body channels drive the preview. Door jamb geometry represents the existing 5.4 m clear opening at game z=6.4. The interior camera uses a Track To target with eye (-3.8,2.1,-4.8).

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

## Continuation fixes (2026-10-30, 11:18 Pacific)

Synced the conflicting draft with deploy via merge `0b9311e2f`, preserving both appearance and entrance SW stamping. The newer deploy budget check and the entrance-focused suite pass (77/77). The former main-checkout hook regression was a faulty fixture: it asked a linked checkout to behave like main. Its corrected isolated Git main+linked fixture passes9/9 while asserting main allowance, linked refusal and unchanged file bytes. The actual protection hook is unchanged.

Blender source repair now matches the fitted wheel radius/centre0.34m, bakes the proxy cylinder axis before rolling, and aligns its support floor to zero. Strict support audit uses a circumscribed32-sided proxy (vertex radius0.3416451146m, nominal rolling/across-flat radius0.34m). Evaluated world vertices across520 wheel/frame samples have controlled inset0.048–1.645mm, with no positive floating gaps; root path/poses, steering, pitch, camera world transform/lens are exactly unchanged. Accumulated wheel travel is preserved within1.23e-6m. `artifacts/entrance-radius-fix/inset-audit.json` records the final signed support audit; the earlier audit exposed a small positive gap and was superseded. Re-exporting the repaired editable source succeeded. Current source SHA256 is `aae4a9e4353112e1703c38cf2028ef11219c3cb6c2990dcf91a556324be854c3`, superseding the earlier source hash above.

The entrance now forwards an explicit authored-channel contract: signed `wheelDistance` in metres, `steer` and `bodyPitch` in radians, `bodyHeave` in metres and `articulated:true`. The marker describes authored channels, not renderer readiness. Ground root remains unchanged; fallback/home/out acquire no new fields. Sampler/facade regression tests8/8 pass. The visible wheel/body consumer is still pending the shared renderer ownership agreement with departure#4306; no duplicate wheel renderer was introduced.

Tagged plugin repairs were applied through Plugin Creator to the existing private identities: F1 Cloud MCP1.0.6 (release `pluginrel_6ae4de16780c81919e0db84b6f400a44`) and F1 Dev Tools0.3.0 (`pluginrel_6ae4de1b18a08191a93676c68ea497c2`). They correct obsolete separate-runtime and fleet-bus instructions. All42 supported source-readback checks passed; manifest presentation/defaultPrompt and App/MCP bindings are preserved. Hosted apex_status/apex_doctor succeed (234 doctor passes, zero failures with the actual host catalog supplied; upstream BROWSER_CANCEL_ABSENT warning retained); no runtime restart was needed. Loaded-session skill refresh was observed; fresh published-environment restore remains unverified. Build3DRooms contact/clearance doctrine was used for this existing-bay maintenance audit; no new layout, paid Meshy work, curated plugin mutation, or human gate approval is claimed.


## Historical checkpoint: delayed load and cancellation (2026-10-30, 12:20 Pacific)

Source local `e5f787d707183856894e4488b39becc7055ef2d8` and published `72c90909e859a7e52c1a5b1423de9913d20fa1b9` have identical tree `3ac3ed050e6718425f7b52c807f4b16b6b94e1d2`. The connected GitHub app published the exact verified tree after CLI write credentials expired, preserving its parent and using a non-force compare-and-swap update; local history remains intact. Draft CI [41109744222](https://github.com/brycejmurrin/f1-game/actions/runs/41109744222) passed after one infrastructure retry, including all four structural shards, parts census, workflow/shader lints and driving characterization. Several full-tier jobs were skipped and the selected browser plan was empty; this is not full mission acceptance. Earlier local structural counts above are historical.

The lead ran the actual visible WORK ON CAR path at 844×390 touch using Three/WebGL2 ANGLE SwiftShader. Both optional requests were held until entry started, then released with service workers blocked. Seventeen active post-load pose observations retained the procedural path; completion unlocked setup and race position/speed stayed unchanged. A subsequent entry used authored motion. During BRINGING CAR IN, the existing `__apex.tt` session replacement canceled the real arrival, hid the sheet, released inert controls/camera and did not reopen it. A later valid authored entry, skip and RETURN TO RACE succeeded. All 14 evidence assertions pass with zero page errors.

These observations wrap the actual arrival methods in the served response to record state, without changing input, transforms, clocks, duration or callbacks. Original response bytes match the tracked source and are retained beside the observational version. Evidence is `artifacts/garage-entrance-delayed-cold/`: `verification.json`, `result.json`, `cancel-recovery.json`, opening/end PNG and 132.56-second `motion.webm` (6,653,593 bytes). Cancellation was injected through the real session API, not a UI navigation gesture. The first no-video probe did not establish completion and is excluded; a new-session fixture attempt with pits disabled is also excluded, then retried with real tyres restored. The hosted MCP browser could not reach this worktree server and was closed before the successful local capture. No real device/GPU or smoothness claim.

A subsequent entrance-only source change admits `start({ authored: false })` as an explicit procedural recovery decision even when data is available. The source remains latched for that run; an ordinary or explicitly authored later run can adopt ready data. Existing regression coverage now checks all three warm-source choices. This safeguard does not implement the pending shared optional loader and is newer than the video source above.

Production triangle audits distinguish signature WokingActive factory parts from the pinned browser's empty parts profile: the signature plank/skids/body undershoot the floor by up to 16 mm; the pinned profile has minimum Y0. Production rotating 24-gon tyres can float by 2.899 mm relative to flat Y0. The exterior lane is Y−0.036, apron Y−0.04 and sill top Y+0.044. Neither the repaired proxy nor a flat-plane tyre audit validates those real surfaces. Sampled actual car/jamb and selected guide torso/boots show no intersections; other actors/configurations and runtime draw matrices remain unverified. See `artifacts/entrance-production-audit/` with corrected profile labels and provenance.

At this historical checkpoint, dependent loader and camera work remained in scratch proposals while departure [#4306](https://github.com/brycejmurrin/f1-game/pull/4306#issuecomment-6530256044) retains shared-file ownership until landing. Loader checks include optional/race failure isolation, strict evaluate-once joins/retries and all generic tooling inventories. An existing in-flight strict load retains its original responsive-time deadline, potentially 25 seconds; no universal five-second wall bound is claimed. A naive direct camera blend was rejected because it traverses the shell plane. Physically clear doorway blocking is being evaluated in Blender before shared integration. Visible wheel/body consumption, actual surface contact, camera continuity, pending-preparation UI cancellation and full-resolution desktop/real-GPU acceptance remain unfinished.


The saved proxy now follows the runtime front-steering sign. Its baked local-X wheel axle and XYZ Euler Z driver need `-channel_steer`: the renderer mirrors the car root on X. This corrects the displayed Blender wheel heading while preserving car/root/camera curves and the exported runtime bytes (SHA256 `f5d0f2f2985761351bdddc91e55a4c481b2f27d460098cef47113716e52dfa50`). The repaired editable source SHA256 is `a87d7ae7c0058c133502dee1f2a1d3d8d1e137fd9280997d32b8fe024640c3c5`. Re-export and 260 evaluated front-wheel poses per source verify the corrected heading; the maximum angular error falls from32.085639 degrees to0.000003432 degrees. This is a source-display repair, not production renderer adoption.


Editable camera review source: `assets/source/garage-entrance-camera-proposal.blend` (SHA256 `53042cd255cc77d4e1d04ffce7e9987eeae6205e432d3e8a360d8460e6d2e6c7`). This separate file retains the car/room proxies and actual cubic camera eye keys. Its saved target keys follow the moving car immediately during the default RIGHT back-in; eye, lens and car keys are unchanged from the preceding geometric blocking. Reopening the saved source and exporting produces byte-identical JSON. This asset remains a reviewed dependent proposal until the shared renderer/lifecycle integration is adopted.

Reproduce from saved edits with Blender4.3.2, from the repository root:

```sh
# Export saved car curves; this rewrites the base runtime table without camera data.
blender -b --python tools/gen/blender/garage-entrance.py -- --source assets/source/garage-entrance.blend --output-dir artifacts/entrance-export --write-runtime
# Export saved camera F-curves without rebuilding/saving the source.
blender -b --python tools/gen/blender/garage-entrance-camera.py -- --source assets/source/garage-entrance-camera-proposal.blend --export-existing --output-dir artifacts/entrance-camera-export
# Copy the exported cubic eye controls into the numeric runtime table.
python3 tools/gen/blender/assemble-entrance-camera.py --curves-js js/data/garage-entrance-motion.js --camera-json artifacts/entrance-camera-export/camera-proposal.json --output-js js/data/garage-entrance-motion.js --receipt artifacts/entrance-camera-export/assembly.json
npm run gen
```

Car geometry remains renderer-owned; these files provide evaluated car transforms and camera controls rather than a GLB animation. The real default RIGHT runtime target is the normal setup target carried by the actual moving car root, matching the Blender preview. LEFT/DOOR and explicit custom optics retain their existing framing. The close crossing pass deliberately crops the nose; no whole-car-in-frame guarantee applies during that shot. Exact normal setup projection/target returns at the endpoint. Generated screenshots, reports and videos remain under ignored artifacts.


The new eye/target handoff is restricted to real CUT entry with the exact shipped stored shot triplet. Other saved shot configurations retain the original production camera transport; a comparison against the pre-integration deployment verifies280 matrices and35 optical poses. Default CUT poses are unchanged by this scope gate. Clear mechanic staging remains independent of camera/asset availability.


Final authoring hierarchy repair: one `BodyPivot` under each `CarRoot` now carries body and nose, with wheels kept directly under `CarRoot`. The pivot is game `(0,0.34,0.05)` / Blender `(0,-0.05,0.34)`, matching the renderer. Separate old object-centre drivers displaced the nose from that intended motion by21.150mm in lane /14.100mm in back-in. Saved evaluated geometry now matches within2.384micrometres; rest geometry is preserved within0.954micrometres. Root, wheel, steer, camera, target and lens keys are unchanged, and heave remains zero. Current editable main source SHA256 is `aab8812d62ed5d3d3a8e48b763f3f7fc3fdd53529dbebd41c2994504e520d6d8`; current camera source is `2b5f08a30c1c4768b1df18e9623e851ad9a26d62acf5af7c81b66215820d3f5d`. These supersede the earlier source fingerprints. Actual base car runtime bytes remain `f5d0f2f2...`; assembled car/camera runtime remains `04183b72...`. This source-only preview correction preserves the runtime used by the browser evidence.


Current delivery checkpoint: departure #4306 has landed and is merged locally. Shared garage PR #4310 retains editing ownership through its merge, so the assembled entrance remains a dependent review copy rather than production adoption. That copy passes actual phone/desktop opening, approach, crossing and end review; default desktop completion and inspection controls; natural cold/warm repeat; skip, reduced motion, failure/retry, controlled partial-warm and pause-key pending cancellation, with no page errors. Finite actual draw-geometry audits cover observed authored wheel support, reflection, crew and camera clearances. Procedural fallback split-wheel contact, continuous collision, all tuner/part/crew combinations, full-resolution and hardware performance remain unverified. The replay package passes 25 entrance tests plus 4 output-surface guards; current combined production-branch checks must follow ownership release. Earlier paragraphs record historical limits and source fingerprints, not current acceptance.
