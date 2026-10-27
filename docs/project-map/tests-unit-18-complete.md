# Unit group 18 — complete semantic map

Read-only mapping at the working-tree content identified by SHA-256 below. All 20 assigned test files, 4017 lines, were read in full, with bounded nontruncated follow-up reads wherever a larger combined response truncated. No tests, browsers, test subprocesses or measurement tools were run. No production or test files edited.

Ranges are inclusive, one-based. `assertionSpans` records assert/near/finite and shared assertion-helper call sites within each case, not a dump of assertion predicates. File preambles/fixtures are included in full-read ranges. Parameterized declarations are expanded to concrete cases; they share declaration/assertion ranges.

## Navigation and production evidence

Read AGENTS.md and .claude/skills/code-nav/SKILL.md. Used the code-nav shell fallback: FrameLights definition and full outline, FreeCam full outline, Frustum outline, Car3D.frontPlate definition, CarMesh.getAeroFlapSet definition, GhostShare.decode definition, DataRealRace.build definition, SetupCamera definition. LSP resolved GhostShare through text fallback (CommonJS export) and DataRealRace.build via module-file fallback (no js caller); no claim of verified caller coverage. Source reads additionally checked game-vm settle/handle lifecycle/stepUntil, game-vm-pool closure/close behavior, setSetupAero and production gantry. Source index below records exact working-tree hashes and ranges; symbol anchors come from LSP or parsed source.

Key live anchors: FrameLights appendCarTailLights 28, _rankSet 402, tierShed 329, glowFade 335, release 619, viewLights 646, setFrameLights 659; FreeCam pure math 23-95 and create 114 onward; Frustum radialCulled 65 and bucketInstances 91; CarMesh.getAeroFlapSet 772-810; GhostShare.decode 209-228; DataRealRace.build 154-256; setSetupAero 442-456; gantry 329-401.

## Fixture and harness interpretation

- frame-hitch fixtures are constructed spike/sawtooth series, CDP allocation/CPU trees, work/pass/gap records and race-entry marks/LoAFs. `http://x`, the synthetic probe-fixture filename, invented callback names/line numbers and profile URL strings are synthetic attribution labels. Do not navigate them as production references.
- Lighting tests build 15-number lamp records, street grid, artificial clocks and fake cars. Release tests expose internal pools by replacing the return list.
- FreeCam mini-DOM + fake photo owner and straight four-corner planner fixtures are in its preamble 25-75; the final case alone builds Monza and loads real FlybySeq. loadParts loads real car/parts geometry into a renderer-free VM.
- Free-design fixtures create scratch PNG/GLB/room/service/profile data and mocked upstream connections. Traversal/file/HTTP URI strings and /etc/hosts are hostile fixture inputs; `artifacts/must-not-exist`, /gateway and checkout-path examples are test data, not live dependencies.
- Fuzz helpers provide Hash32 PRNG, fixed seed strings and mutation corpus; N=2000 except real-race single-row N=200 and CPU slice N=200. Real Baku fixture supplies data only; fake logo Image emits dimensions without decoding pixels.
- gameSource reads game.js plus manifest modules instantiated via Global.create; its union source pins can succeed in an extracted file. frozen-globals scans named rosters and category JSON. game-ctx synthetic fixture/game.js and fixture/game-ctx.d.ts strings are diagnostic labels only.
- game VM loads actual manifest modules against inert DOM/graphics and captures G through ApexApi.create; it seeds McLaren/empty parts, wear off and ?seed=1. Pool probes use INIT, GRADIENT and BANKED in the same order at size 1 (Monza then Zandvoort). OpenF1 WATCH trace is synthetic track-frame footage, not a captured race.

## tests/unit/frame-hitch-analyse.test.mjs

Full read: 1-494; SHA-256 `3a5ac462c53df14c5fa560cc19dc930c09e598b709daff99f8ffbb8e3be6172c`.

Target scope: tools/gfx/frame-hitch.mjs.

Pure arithmetic on constructed series/profiles. Profile URLs, named renderer functions and fixture line numbers are invented data, even where their spelling resembles an existing repository path; they are not live source references or GPU measurements. GL_BYTES is executed as a lifted source block without a browser.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| analyse separates a periodic spike train from a clean run | 37-47 | 39, 44, 45, 46 | analyse | Flat versus periodic 120 ms spike trains; checks spike count, periodicity and roughly 3 s gaps. |
| analyseHeap names GC when the collections land on the spikes | 64-77 | 70, 72, 73, 74, 75, 76 | analyseHeap | Sawtooth heap with costly collections; rate roughly 44 MB/s and GC coincidence must name GC. |
| analyseHeap clears GC when the spikes are somewhere else | 79-95 | 90, 92, 93, 94 | analyseHeap | Independent spike cadence with cheap collections; enrichment must reject GC as the spike source. |
| analyseHeap reports an unsampled series as unsampled, never as flat | 97-105 | 103, 104 | analyseHeap | Zero heap samples name missing performance.memory and omit an allocation rate. |
| analyseAlloc corrects the sampler's bias against many small objects | 119-143 | 138-139, 140, 142 | analyseAlloc | Small-object sampling probability correction must reverse the biased retainer ranking and expose biased totals. |
| analyseAlloc folds one site reached two ways into one row | 145-165 | 161-162, 163, 164 | analyseAlloc | Duplicate call-tree nodes for materialFor merge by normalized file and one-based line; one dominant row. |
| analyseAlloc refuses to name a winner when the profile is flat | 167-180 | 179 | analyseAlloc | Eight equal sites must produce no dominant retainer verdict. |
| analyseAlloc reports an absent or sample-less profile as unusable, never as zero | 182-189 | 183, 187, 188 | analyseAlloc | Missing profile and sample-less tree must name unusability and omit total MB. |
| analyseAlloc says on every result that it measures RETENTION, not allocation | 191-203 | 200, 202 | analyseAlloc | Both usable and degraded results explicitly describe retained objects. |
| analyseCpu ranks by exact self time and folds a function reached two ways | 211-236 | 229, 230, 231, 232, 233, 234, 235 | analyseCpu | Unequal CPU deltas total 410 ms; duplicate function nodes merge to 300 ms and bundle attribution is 400/410. |
| analyseCpu reports an absent profile as absent, never as an empty ranking | 238-241 | 239, 240 | analyseCpu | Missing/empty CPU profiles explicitly report absence. |
| analyseSpikeCpu attributes only the samples that fall inside spike frames, on the joined clock | 243-278 | 265, 266, 267, 268, 269, 270, 271, 272, 275, 276, 277 | analyseSpikeCpu | Clock-joined 200 ms spike attributes about 150 ms GC and 50 ms render with folded callers; wrong clock refuses ranking. |
| analyseSpikeWork sums per-frame resource calls inside and outside the spike frames | 280-295 | 285, 286, 287, 288, 289, 290, 291, 292, 293, 294 | analyseSpikeWork | Resource counts and timed GPU calls separate spike/rest frames; wrapped duration and unaccounted remainder stay explicit. |
| analyseSpikePassKinds ranks the pass kinds that spike frames run and normal frames do not | 297-313 | 307, 308, 309, 310, 311, 312 | analyseSpikePassKinds | Shadow-only spike pass ranks first; empty render frames excluded and missing/no-spike inputs named. |
| analyseWindow reads the driven window in GAME frames, not callbacks or the end-of-run ring (hunt 4 I4) | 315-337 | 323, 324, 325, 326, 327, 328, 329, 332, 333, 335, 336 | analyseWindow | 400 game frames and 800 callbacks yield 20 fps, not 40; interval quantiles, callback fallback and open-window failures checked. |
| analyseGapWork attributes a multi-second rAF gap to the step before it and its phase (hunt 4 §A gap ii) | 339-364 | 353, 354, 356, 357, 358, 359, 360, 361, 362, 363 | analyseGapWork | Three synthetic gaps classified by build/window/after phase; previous step, between-work and overlapping tasks attributed separately. |
| analyseRaceEntrySpans names the race-entry span each long task and rAF gap fell in (hunt 4 B-F3.3) | 366-410 | 382, 383, 384, 385, 387, 388, 389, 391, 392, 393, 394, 396, 397, 398, 399, 404-405, 407, 408, 409 | analyseRaceEntrySpans + raceEntrySpanList | Race-entry marks, legs and warm spans attribute ranked gaps/tasks; unmatched work, open spans and missing snapshots remain explicit. |
| analyseRaceEntryLoaf keeps the longest LoAFs of race entry with their scripts' invokers, named by span (hunt 5 E) | 412-453 | 427, 428, 429, 430, 432, 433, 434, 435-436, 437, 438, 439, 443, 445, 446, 447, 448, 451, 452 | analyseRaceEntryLoaf + analyseGapWork | LoAF scripts ranked by invoker and bounded to longest 20; span/time offsets, unsupported observer and unknown callback counts checked. |
| analyseDepthDiscard reads TLX's depth row over the window only, and is null-safe off TLX (hunt 4 A-P1) | 455-471 | 458-459, 461-462, 463, 465, 467, 468, 469, 470 | analyseDepthDiscard | Depth discard uses end-minus-start window counts; no arm sample never masquerades as a window count; backend/knob/read failures named. |
| the census sizes WebGL2 uploads from the call's own arguments (hunt 4 §A gap i) | 473-494 | 479, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493 | tools/gfx/gpu-game-check.mjs GL_BYTES block | Lifted GL_BYTES block distinguishes upload bytes from allocation and honors buffer offsets, image forms and layered textures. |

## tests/unit/frame-hotpath-alloc.test.mjs

Full read: 1-342; SHA-256 `8d582e58b4b5ac0d2779e4526a7db93361ba96a1a82c98885639a40ac2abb90b`.

Target scope: js/render/three/tlx.js; js/render/glx/glx.js; js/car/car-mesh.js; js/game.js and its carved union.

Most cases pin source syntax, not actual allocations, renderer output, GPU behavior or frame timing. lift is a simple brace counter, and gameSource combines game.js with discovered extracted modules. VM car tests use fake graphics; only synthetic microbench is conditional on gc.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| TLX cullInstances does not for…of over c.idx | 30-35 | 32, 33, 34 | TLX cullInstances | Indexed TLX cull source shape avoids iterator syntax and caches the index array. |
| TLX poolModelMat short-circuits identity to null | 37-42 | 39, 40, 41 | TLX poolModelMat | Identity model source gate must return null and check both matrix diagonal ends. |
| GLX shadow cull skips colour pack/upload | 44-55 | 49, 50, 51, 53, 54 | GLX _shadowPackFor/cullInstances | Shadow packing excludes color arrays/uploads; shadow culling uses no color pack. |
| GLX begin caches pit uniforms and uTime | 57-63 | 59, 60, 61, 62 | GLX begin/uf4/uf1 | GLX source routes pit vectors/time through uniform caches. |
| countdown setGridIdle reuses a pooled opts bag | 65-70 | 67, 68, 69 | gameSource countdown _gridIdleOpts | Countdown source reuses one grid-idle options bag. |
| race present sheds bloom mips + godray blur pair at MEDIUM/LOW | 72-79 | 74, 75, 76, 78 | gameSource present post options | Presentation source wires bloom mip, lightweight godray and automatic environment-probe shedding. |
| race present sheds look post via lookPostShed (LOW or measured tier 4) | 81-98 | 87, 89, 91, 95, 96-97 | PostFxOpts.applyLookShed + PostCommon.roadReflection | Look-shed source zeros five effects; road reflection still consumes automatic tier. |
| TLX/GLX/WGX honour opts.bloomLevels truncation | 100-110 | 104, 105, 106, 107, 108, 109 | tlx-post/post/wgx bloomLevels | All three post backends include positive bloom-level override and useLv wiring. |
| TLX rtSetSize does not dispose RT textures after setSize (r186) | 112-120 | 117, 118-119 | tlx-post rtSetSize | TLX resize source calls setSize without a second texture dispose. |
| WGX frees the larger target set before allocating a shrink | 122-130 | 125, 129 | WGX ensureTargets | WGX shrinking source frees the old target set before allocating the replacement scene texture. |
| GLX setPolyOffset caches bias and draw() passes depthBias without a literal | 132-142 | 135, 136, 138, 139, 140, 141 | GLX setPolyOffset/draw/uf2 | GLX polygon-bias source caches state, avoids draw-array literal and caches bake origin. |
| iterator GC microbench: indexed cull packs with less young-gen pressure than for…of | 145-192 | 189-190 | local synthetic packForOf/packIdx (production analogy only) | Synthetic indexed versus iterator packing compares post-GC retained heap with 64 KiB slack; returns without assertions if gc unavailable. |
| CarMesh.aeroEdgeOn is memoised and tested AFTER the blend: no localStorage read per car per frame | 195-210 | 207, 209 | CarMesh.drawAeroEdge | 2000 low-blend aero edges read no storage; 2000 high-blend draws read at most once. |
| CarMesh.getAeroFlapSet: a (record, pose) memo returns the same baked mesh and never hands back an evicted one | 212-230 | 218, 219, 220, 222, 223, 224, 226, 228, 229 | CarMesh.getAeroFlapSet | Flap-set cache returns identical mesh on hit, separates five poses, evicts/frees old entries and never returns a freed mesh. |
| CarMesh.drawRearLights / drawMirrorLights: one draw per car, the old per-light offsets baked into the vertices | 233-269 | 241, 242, 243, 252, 255, 257, 258, 263, 264, 265, 267, 268 | CarMesh.drawRearLights/drawMirrorLights | Rear/mirror lamps use one draw and shared cached mesh; baked positions match former transforms and anchor geometry. |
| CarMesh tail glows: a decalRuns backend gets the field back to back after the car loop, same matrices, same order | 285-302 | 290, 292, 295, 297, 298, 299, 301 | CarMesh.drawTailGlow/flushTailGlows | Immediate and queued tail-glow backends produce equal ordered matrices; batch flags retained and flush empties queue. |
| TLX decal runs: A6's live-record guard, one material per run, and the normal carried in the planar quad's Y column | 303-315 | 306, 307, 308, 310, 311, 312, 313, 314 | TLX _decalAppend + game render flush order | TLX decal source checks live record, contiguous capped material run, batching opt-out, normal column and warm-up; game flush order pinned. |
| blueWatch.tick gets the pooled _blueCtx, never a per-step literal (issue #1649) | 317-322 | 319, 320, 321 | gameSource blueWatch.tick | Blue-watch source reuses one context bag without inline tick literal. |
| car loop: a world-posed rival behind the eye is culled before playerAnchor and sampleAt (perf plan C-10) | 324-335 | 330, 331, 332, 334 | game render world-pose early cull | Behind-eye rival source culls interpolated world pose before anchor projection/track sampling while exempting player and retaining 6 m grace. |
| Collide relaxation stops after a pass that reached no contact (hunt-2 P6) | 337-342 | 340, 341 | Collide.resolveCollisions/_colResolvePair | Collision source exits later relaxation passes after no contact and marks contact only after a real pair contact. |

## tests/unit/frame-lights-rank-cache.test.mjs

Full read: 1-171; SHA-256 `a7f393dc5ac6acc932a14be13dd996ce662812368ce5ed1e5b8c92a3a8b2f6eb`.

Target scope: js/lighting/frame-lights.js (_rankSet, setFrameLights, viewLights, release).

Synthetic straight lamp street, wall clock and VM lighting only. Cache counters and illumination proxy do not prove rendered flash absence; GC assertions depend on V8 collection semantics.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| at 60 m/s the forward rank reuses most frames (distance/time budget) | 42-57 | 52, 53-54, 56 | js/lighting/frame-lights.js (_rankSet, setFrameLights, viewLights, release) | 600 forward frames at 60 m/s reuse more than rebuild and rebuild at most 150 times. |
| cornering at 60 m/s: a long, yawing forward vector still reuses the rank (unit-direction yaw budget) | 59-73 | 71, 72 | js/lighting/frame-lights.js (_rankSet, setFrameLights, viewLights, release) | Long forward vectors yawing 0.3 degrees/frame still reuse more than rebuild and rebuild at most 200 times. |
| a yaw past the budget re-ranks at once, whatever the vector's length | 75-87 | 85 | js/lighting/frame-lights.js (_rankSet, setFrameLights, viewLights, release) | A 3 degree turn forces a fresh rank at direction lengths 1, 8 and 40. |
| mirror viewLights shares the view heap — far fewer rebuilds than frames | 89-104 | 101-102, 103 | js/lighting/frame-lights.js (_rankSet, setFrameLights, viewLights, release) | Mirror ranks over 600 frames reuse more than rebuild and rebuild at most 150 times. |
| a parked eye does not rebuild on the clock alone | 106-118 | 116, 117 | js/lighting/frame-lights.js (_rankSet, setFrameLights, viewLights, release) | Parked eye makes one rank and 119 reuses despite advancing wall clock. |
| mirror light stays flash-free under the new cache budget | 120-142 | 141 | js/lighting/frame-lights.js (_rankSet, setFrameLights, viewLights, release) | After 30-frame settling, normalized mirror-window illumination has no relative step above 10 percent. |
| a track switch releases the previous track's lamp array (#2180) | 147-171 | 167, 170 | js/lighting/frame-lights.js (_rankSet, setFrameLights, viewLights, release) | Switching from lit world to unlit world nulls frame lights and allows the prior lamp array to be collected. |

## tests/unit/frame-lights-release.test.mjs

Full read: 1-53; SHA-256 `12fdd4ed5550c08cc06aca13274a0b3d8f999fdf93f47407871235301211285d`.

Target scope: js/lighting/frame-lights.js (appendCarTailLights, release).

Export-list replacement exposes private arrays; fake track sampler/lighting budget. No browser or end-to-end track switch exercised.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| release() clears every _tlPool car ref and empties _tlSel after a night append | 35-53 | 41, 43, 44, 45, 50, 52 | js/lighting/frame-lights.js (appendCarTailLights, release) | Night append first populates car references and selection; release nulls every pooled car and empties selection. |

## tests/unit/frame-lights-shed.test.mjs

Full read: 1-143; SHA-256 `c8fcc62d9c94d79bb4d2ad1567eb43df9a6d66a4d3c2ec8597ef649b2705c09b`.

Target scope: js/lighting/frame-lights.js (_shedTick, tierShed, glowFade, setFrameLights).

Controlled VM wall/render clocks and fake lighting knobs/budget; no visual fade claim. Private tierShed is exposed by export-list replacement.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| a governor step waits for the tier to hold, then slides the cap | 35-50 | 37, 39, 44, 48, 49 | js/lighting/frame-lights.js (_shedTick, tierShed, glowFade, setFrameLights) | Tier-2 transition holds initial cap, drops at most one slot/frame, reaches 24 over at least 20 steps. |
| a step that reverts inside the hold never touches the lamps | 52-59 | 58 | js/lighting/frame-lights.js (_shedTick, tierShed, glowFade, setFrameLights) | A tier change reverted inside hold never alters cap. |
| halos fade out at a held tier 3 and back in after | 61-76 | 63, 69, 72, 75 | js/lighting/frame-lights.js (_shedTick, tierShed, glowFade, setFrameLights) | Tier-3 halo intensity fades to zero with bounded per-frame decrement then recovers to one. |
| a device that boots at tier 2 starts shed, with no hold | 78-82 | 81 | js/lighting/frame-lights.js (_shedTick, tierShed, glowFade, setFrameLights) | Booting at tier 2 immediately starts at 24 slots. |
| a pause, a hitch or a hidden tab does not replay the lamp warm-up; lamps unlit while rendering, or a new track, still ramp | 89-115 | 99, 101, 103, 107, 111, 114 | js/lighting/frame-lights.js (_shedTick, tierShed, glowFade, setFrameLights) | Render-clock pause and clamped hitch preserve warmed lamps; rendered darkness/new track restart warm-up; missing render clock retains wall-clock fallback. |
| setFrameLights does not keep a strong reference to the last lit track | 121-143 | 142 | js/lighting/frame-lights.js (_shedTick, tierShed, glowFade, setFrameLights) | After lighting a track and yielding a job, forced GC must clear its WeakRef without another lighting call. |

## tests/unit/frame-math.test.mjs

Full read: 1-157; SHA-256 `718aedd29db6afefbcc42772261a23cb336f3e61264a7b021a9ae6c98912701f`.

Target scope: tools/lib/frame-math.mjs.

Pure coarse scene proxies and analytic tolerances, not pixel render parity, real scenery hull quality or image aesthetics.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| projection: centre is centre, +right is screen right, behind is null | 22-37 | 27, 28, 29, 30, 33, 36 | tools/lib/frame-math.mjs | Analytic camera verifies centre/right/up projection, behind-lens null, aspect scaling and ray/project inverse. |
| ray vs box: entry distance, miss, inside, and a box laid along a rotated road | 39-52 | 41, 42, 43, 44, 50, 51 | tools/lib/frame-math.mjs | Known ray-box distances cover miss/behind/inside and rotated slab containment. |
| a level camera splits sky and ground at the middle row, and the horizon says so | 54-68 | 56, 60, 61, 63, 64, 67 | tools/lib/frame-math.mjs | Flat scene yields approximately half sky/ground and level middle horizon; steep downward camera puts horizon above frame. |
| a wall beside the lens fills the left third and is named as the nearest obstruction | 70-81 | 75, 76, 77, 78, 80 | tools/lib/frame-math.mjs | Near left wall dominates left third, leaves right clear and identifies nearest tree/distance. |
| occlusion: opaque blocks, partial transmits, terrain crests block, the subject's own box does not | 83-96 | 89, 90, 91, 93, 95 | tools/lib/frame-math.mjs | Opaque and partial hulls, own-subject skip, all occluder listing and terrain crest blocking checked. |
| subject geometry: centred, on a power point, clipped at an edge | 98-109 | 101, 102, 103, 104, 105, 107, 108 | tools/lib/frame-math.mjs | Centred quadrilateral area, thirds distance, clipping side and half-in-frame point count checked. |
| motion: pan rate, parallax, and zoom from two poses | 111-119 | 115, 116, 118 | tools/lib/frame-math.mjs | Two poses give 45 degrees/s pan, 2 degrees/s zoom and analytic translation parallax. |
| judge: the flags an agent acts on fire on their defects and stay quiet on a clean frame | 121-143 | 129, 130, 138, 140, 141-142 | tools/lib/frame-math.mjs | Clean report scores high without flags; defective report triggers eight expected flags/low score; cuts suppress motion flags. |
| thumbnail: dimensions, subject priority, and uppercase for the near field | 145-157 | 151, 152, 154, 155, 156 | tools/lib/frame-math.mjs | ASCII thumbnail has requested dimensions, subject glyph and uppercase near tree in left third. |

## tests/unit/free-cam.test.mjs

Full read: 1-353; SHA-256 `dc0c537076d9836a8435c2a2a25cab39fbcfbc655788e93c5de5c15008732ade`.

Target scope: js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js.

Most cases use mini-DOM, stub straight track/FlybySeq and inert timers/clipboard. Real PhotoMode wiring is still VM input. Only final Monza corner case uses real built circuit/planner; no rendered UI proof.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| a temporary dock can close while preserving photo mode for its previous owner | 77-84 | 81, 82, 83 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Temporary dock close retains its owning photo session and resets roll. |
| speed dial is logarithmic 5-200 m/s and round-trips; the wheel steps and clamps | 86-97 | 88, 89, 90, 91, 92, 93, 94, 95, 96 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Speed slider endpoints/geometric midpoint round-trip; wheel multiplies, clamps and preserves zero delta. |
| roll clamps to ±45°, junk is level | 99-104 | 101, 102, 103 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Roll accepts finite inputs, clamps to 45 degrees and levels invalid values. |
| COPY VIEW is an __apex.view() call rounded to centimetres | 106-110 | 108-109 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | View snippet matches executable command with centimetre rounding. |
| snap maths: behind the car along its heading; a corner from its outside, before the apex | 112-132 | 115, 116, 118, 120, 121, 122, 124, 125, 126, 128, 129, 131 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Stub straight-road car/corner poses obey heading/outside/wrapping conventions and reset borrowed planner cut state. |
| open flies from the game camera; roll, lens and Q/E decorate dbgCam; DONE restores | 134-172 | 136, 137, 138, 139, 140, 141, 142, 143, 144, 147, 148, 149, 151, 153, 155, 156, 157, 161, 164, 165, 166, 167, 168, 169, 170, 171 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Open publishes original camera and installs panel/wheel; roll/lens/QE decorate view; DONE restores game camera, menus and defaults. |
| photo mode leaving by another door (resume / quit) closes the panel without reopening the menu | 174-182 | 180, 181 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | External photo exit closes dock while leaving hidden pause menu hidden. |
| cornerPose plans each corner once per track and hands back a private copy | 184-201 | 190, 191, 192, 194, 196, 197, 198, 200 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Per-track/corner memo avoids re-solving, handles wrap, returns defensive copies and replans another track identity. |
| __apex.freeCam: state, place, snap, copy and exit | 203-219 | 205, 207, 208, 210, 212, 213, 214, 216, 217, 218 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Public command reads state, opens/places/clamps FOV, snaps/cycles corners, refuses missing car and closes. |
| COPY VIEW / COPY FLYBY POSE write the textarea and report the round trip | 221-230 | 224, 225, 227, 228, 229 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Copy actions fill output and expose planner round-trip error text. |
| wired into the real photo mode: speed dial drives the fly-cam, Q rolls, EXIT closes to the menu, resume closes | 232-277 | 261, 262, 266, 268, 270, 271, 275, 276 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Real Photomode/Input wiring moves 10 m at slider maximum, rolls Q, closes EXIT to menu and resume without menu. |
| the flyby editor's sub-mode: starts at the previewed frame on the flyby lens, runs its shot actions, DONE goes back to the editor | 279-304 | 287, 288, 289, 291, 292, 294, 296, 297, 298, 299, 300, 303 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Flyby-editor entry uses preview camera/lens and action callback; DONE invokes back once while resume does not. |
| wheel over Studio scroll controls or browser zoom cannot change FreeCam speed | 306-313 | 311, 312 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Wheel over Studio controls, browser zoom or prevented event preserves speed; game-wheel changes it. |
| suspended PhotoKit effects stay hidden across frame updates and restore their prior preferences | 314-324 | 319, 321, 322, 323 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Suspending overlays survives frame decoration and restoring retains grid/DOF preferences. |
| snap to a corner on built Monza: the real planner frames it from the outside, looking at the apex | 330-353 | 339, 340, 341, 347, 349, 351, 352 | js/camera/free-cam.js; js/camera/photo-cam.js; js/camera/photo-kit.js; js/camera/flyby-seq.js | Built Monza through real planner reports 11 corners; wrapped third corner has finite outside elevated framing, near-apex target and 20-60 m range. |

## tests/unit/free-design-tools.test.mjs

Full read: 1-148; SHA-256 `18cffe041399e4591227d04ad293e59a985275631f8a33d68b26854f00ddfc2e`.

Target scope: tools/ui/design-evidence.mjs; tools/mcp/chat-gateway.mjs; tools/assets/gltf-check.mjs; tools/mcp/doctor-catalog.mjs and individual imports.

Generated scratch fixtures and mocked MCP upstreams; subprocess cases are test definitions only and were not executed in this mapping. No real browser, Blender, hosted gateway or external service claim.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| gallery is self-contained and escapes labels, metadata and script-closing text | 18-26 | 21, 22, 23, 24, 25 | tools/ui/design-evidence.mjs screenshotReview/localImage/tokenHTML | Embedded image gallery escapes labels/metadata and script-closing content, has comparison range, rejects escape/symlink/empty shots; token HTML escapes values. |
| contract check finds advertised route drift, duplicates and missing release | 28-34 | 31, 32, 33 | tools/mcp/check-chat-contract.mjs checkCatalog/normalizeHostName | Catalog accepts complete routes/release, rejects duplicate tools and advertised missing host route; host prefix normalization checked. |
| gateway serializes calls, blocks conflicting browsers and reconnects released mode | 36-53 | 46, 47, 48, 49, 50, 51 | tools/mcp/chat-gateway.mjs createGateway | Mock gateway serializes calls, prevents conflicting browser ownership, releases/closes and reconnects; unknown route rejects. |
| external glTF buffers cannot escape through traversal, scheme or symlinks | 55-60 | 57, 58, 59 | tools/assets/gltf-check.mjs localResource | Local glTF buffer resolves known bytes but refuses traversal, remote/file schemes, malformed escapes and symlink escape. |
| real triangle GLB validates; budgets fail and dedup output preserves original | 62-75 | 69, 70, 72, 73, 74 | tools/assets/gltf-check.mjs validateAsset/optimizeAsset/CLI | Generated real triangle GLB validates; byte budget fails; report/optimization cannot overwrite input or existing output and original bytes preserved. |
| room adapter rejects unapproved final composition and export before importing Blender | 77-82 | 80 | tools/assets/procedural-room.py compose/export gates | Compose/export CLI refuses missing function approval before Blender work. |
| CSS inspection accepts explicit axe/token flags; stale service records are not live | 84-88 | 85, 87 | tools/ui/css-play.mjs parseCssPlayArgs + tools/env/chat-mcp-service.mjs readService | CSS flags parse explicitly and wrong process identity makes service record stale. |
| profile upgrade retains tunnel identity and never accepts literal credential values | 90-96 | 93, 94, 95 | tools/env/configure-chat-mcp.mjs gatewayProfile | Profile migration preserves tunnel control plane, leaves original command alone, handles spaced path and rejects literal credential. |
| procedural arrival cannot be declared outside its wall | 98-103 | 102 | tools/assets/procedural-room.py opening validation | Room opening outside wall fails validation with containment diagnostic. |
| texture budgets use dimensions from the validator resource report | 105-116 | 114, 115 | tools/assets/gltf-check.mjs validateAsset | Generated textured triangle validates normally; 8x8 texture violates max-dimension 4 budget using validator resource dimensions. |
| caller catalog reaches doctor and the checkout SDK resolves | 123-127 | 125, 126 | tools/mcp/doctor-catalog.mjs doctorWithCatalog | Doctor receives caller catalog and reports catalog and checkout runtime dependency pass. |
| catalog input cannot select files, commands, or roots | 128-134 | 132 | tools/mcp/doctor-catalog.mjs doctorWithCatalog | Doctor rejects wrong host-name shapes, excessive list, extra root/command and nonboolean full. |
| gateway advertises host input, preserves ordinary doctor, and dispatches supplied input | 135-148 | 142, 145, 146 | tools/mcp/chat-gateway.mjs createGateway + doctorWithCatalog | Gateway advertises bounded hostToolNames; ordinary doctor forwards upstream while supplied catalog dispatches local doctor. |

## tests/unit/front-wing-decal.test.mjs

Full read: 1-119; SHA-256 `103c8c527e44d5f6c226a426b85ca5b9c15876e91069b421b3cbef90953fe8e3`.

Target scope: js/car/car3d.js (frontPlateGeom/build); js/car/car-mesh.js (carDecalData).

Real mesh geometry with renderer-free parts loader; point-to-triangle proximity and lateral bounds do not prove texture orientation, alpha, z-fighting or other teams/recipes. Unknown recipes are caught and skipped; explicitly required profile coverage is 0, 1 and 3, not profile 2.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| Car3D exposes the front-plate placement the decal has to share | 58-65 | 59, 63, 64 | js/car/car3d.js (frontPlateGeom/build); js/car/car-mesh.js (carDecalData) | Real frontPlate accessor exists with finite station fields and ordered front/rear z. |
| every front-endplate decal vertex sits on the plate, at every plate profile | 67-103 | 86, 97, 100, 102 | js/car/car3d.js (frontPlateGeom/build); js/car/car-mesh.js (carDecalData) | Four teams and ten recipes compare eight decal vertices to real nearby car triangles within 12 mm; requires nonvacuous plate geometry/profile coverage. |
| the decal sits proud of the plate, not buried in it | 105-119 | 114-115, 116-117 | js/car/car3d.js (frontPlateGeom/build); js/car/car-mesh.js (carDecalData) | Ferrari default decal x bounds place it outside skin with bounded proud offset. |

## tests/unit/frozen-globals.test.mjs

Full read: 1-80; SHA-256 `3f90f36ab015d70ad5990976d1e20df92a7f309015cc11691a58d917166808fd`.

Target scope: tools/manifest.cjs roster; tests/data/frozen-globals.json; discovered js module tails.

Text heuristics over manifest-discovered files, not executing Object.isFrozen or checking arbitrary writers. Regex may see comments; globals not matching IIFE naming form are outside scan.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| every listed global's module ends with Object.freeze(<global>) | 37-50 | 47, 49 | tools/manifest.cjs roster; tests/data/frozen-globals.json; discovered js module tails | Every listed frozen module has exact freeze tail and every frozen list entry is discovered in manifest. |
| the accumulator and descriptor-install targets are never frozen | 52-60 | 58, 59 | tools/manifest.cjs roster; tests/data/frozen-globals.json; discovered js module tails | Mutable accumulator/descriptor targets have no freeze occurrence and baseline includes GLX and TrackDefs. |
| a module with an object-literal return and no writers is either frozen or named mutable | 62-80 | 79 | tools/manifest.cjs roster; tests/data/frozen-globals.json; discovered js module tails | Manifest scanner identifies unlisted object-return modules without detected writers and requires none. |

## tests/unit/frustum-buckets.test.mjs

Full read: 1-152; SHA-256 `6d699eee462e048f162579eff04eaac950bda07925d60acce7c5d12165927ef7`.

Target scope: js/render/shared/frustum.js; backend chunked modules; js/game.js fog wiring.

Analytic cube/box samples and source wiring checks, not raster/frustum integration, all geometry/transforms or device output.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| a rotated instance's every vertex lies inside its cell box | 33-56 | 48-49, 55 | js/render/shared/frustum.js; backend chunked modules; js/game.js fog wiring | Forty rotated/scaled cubes have all 320 transformed vertices inside their assigned cell bounds. |
| an explicit radius still wins over the derived reach | 58-63 | 61, 62 | js/render/shared/frustum.js; backend chunked modules; js/game.js fog wiring | Explicit radius 10 overrides derived reach, yielding exact symmetric bounds. |
| radialCulled keeps a TALL chunk past the eye-level fog wall and drops a LOW one | 78-91 | 82, 83, 84, 86, 90 | js/render/shared/frustum.js; backend chunked modules; js/game.js fog wiring | At night fog a low 800 m box culls while tall mast stays; mast only culls after top exceeds 99.98 percent fog. |
| radialCulled is CONSERVATIVE: every point of a culled chunk is >= 99.98 % fogged | 93-108 | 102, 106 | js/render/shared/frustum.js; backend chunked modules; js/game.js fog wiring | Four fog profiles and sampled box points ensure every culled sample is over 99.98 percent fog with nonempty cull sets. |
| radialCulled with h = 0 is the old ceil(3 / density) radius, to the metre | 110-121 | 118 | js/render/shared/frustum.js; backend chunked modules; js/game.js fog wiring | Zero height falloff matches old ceil(3/density) cull within one metre across densities/heights. |
| radialCulled: the hard radius always wins, and no fog is no fog cull | 123-132 | 125, 126, 128, 129, 131 | js/render/shared/frustum.js; backend chunked modules; js/game.js fog wiring | Hard draw radius overrides fog; missing/zero fog performs no fog cull; FOG_CULL_FD fixed at 3. |
| every backend's chunk loop culls through radialCulled, and game.js feeds it the fog the shader renders | 134-152 | 138, 139, 142-143, 144, 145, 147, 148, 149, 150, 151 | js/render/shared/frustum.js; backend chunked modules; js/game.js fog wiring | Backend source uses shared height-aware radial cull; game forwards shader density/falloff with cine/debug exemptions and backend latches. |

## tests/unit/fuzz-untrusted-inputs.test.mjs

Full read: 1-622; SHA-256 `c895a29029383bd05e658494b732ae38646e9249b81709c45c79636e81fa2ad6`.

Target scope: production decoder/importer named by case, resolved below.

Finite fixed-seed corpus mutations are boundary regression evidence, not exhaustive security proof. Compression streams disabled in ghost/invite harness. Settings store detects only direct scalar nonfinite/undefined writes; track cleanliness is checked after JSON normalization, which can erase undefined or convert nonfinite values. QR is structural, not decode round-trip.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| GhostShare.decode never throws past the boundary (N=2000) | 106-122 | 114, 116, 118, 119 | js/car/ghost-share.js decode | 2000 seeded ghost mutations must resolve ok/reason shapes without thrown boundary errors; successful ghost fields clean and track string. |
| LobbyCodes.codeFrom + NetHandshake.peek/decode never throw (N=2000) | 171-200 | 179, 181, 187, 189, 195, 197, 198 | js/net/lobby-codes.js codeFrom + js/net/handshake.js peekCode/decodeCode | 2000 invite mutations pass code extraction, peek and decode without throws; string and ok/error shapes plus clean successful payload. |
| NetSdp.unpack never throws on hostile bytes (N=2000) | 203-235 | 228, 230, 231 | js/net/sdp.js unpack | 2000 mutated compact SDP byte inputs return null or string, never throws/dirty live values. |
| NetQr.encode never throws on hostile text (N=2000) | 238-255 | 247, 249, 251, 252 | js/net/qr.js encode | 2000 hostile QR inputs return null or positive square module matrix, with clean values. |
| NetSnapshot.decodeSnapshot never throws on hostile packets (N=2000) | 258-284 | 276, 278, 280, 281 | js/net/snapshot.js decodeSnapshot | 2000 hostile snapshot packets decode without throws; successful cars clean and tick finite. |
| SettingsExport.applySettings/applyGarage never throw or poison store (N=2000) | 345-362 | 356, 358, 359, 360 | js/ui/settings-export.js applySettings/applyGarage | 2000 settings/garage mutations return ok/reason and never ask store to persist undefined/nonfinite scalar. |
| SaveMigrate.migrateCareer never throws or leaves NaN in career (N=2000) | 386-415 | 394, 397, 401, 406, 410, 411, 412 | js/career/save-migrate.js migrateCareer | 2000 career mutations migrate without throws; present required numeric/deal fields finite, season round nonnegative integer and point maps clean. |
| GameStore.get never throws on corrupt disk and never returns NaN default path (N=2000) | 418-463 | 456, 460 | js/core/store.js store.get | 2000 corrupt stored texts never escape get; numeric outputs finite. Does not require recursive validity of arbitrary returned objects. |
| TrackCodec.decode and CustomTracks.sanitize never throw or leak NaN (N=2000) | 475-495 | 485, 488, 489, 490, 492, 493 | js/editor/codec.js decode/fromHash + js/editor/custom-tracks.js sanitize | 2000 track mutations handle malformed hash escapes and decode/sanitize without throws; success has 8-200 points and JSON-normalized clean design. |
| DataRealRace.build: a fractional or huge lap count builds a bounded race, never throws | 516-536 | 532, 533, 534 | js/data/real-race-tab.js build/lapNo | Six fractional/huge lap-count cases drop invalid row, retain lap 1 and keep bounded integer arrays/lapsDone. |
| DataRealRace.build survives one hostile field in the Baku fixture (seeded, N=200) | 538-558 | 554, 555, 556 | js/data/real-race-tab.js build/lapNo | 200 seeded single-field hostile mutations of real Baku fixture keep integer bounded lap counts and cannot grow race beyond fixture baseline. |
| LiveryTex.setTeamLogo refuses a decompression-bomb emblem before any draw | 565-598 | 585, 586, 594, 595, 596 | js/car/liverytex.js setTeamLogo | Fake image upload of normal size installs/samples; three huge dimensions cause no canvas draw, remove logo and notify caches once. |
| 200 GhostShare decodes stay under 2 s of CPU | 601-622 | 620 | js/car/ghost-share.js decode | 200 deterministic ghost mutations consume under 2000 ms process CPU; this measures a thin surface slice, not cumulative suite runtime. |

## tests/unit/gallery-capture-draws.test.mjs

Full read: 1-94; SHA-256 `a4fc5c0d78d37abb5e2a822a0b849ba802a7ec03cc70796628e0fd36ca77480b`.

Target scope: tests/specs/*.spec.js participating source (test-harness guard, no runtime module).

Regex discovery and string test-block splitting only; does not execute screenshot timing, verify waits or inspect canvas pixels. Scope is shared stop-by-default idioms, not every headless call.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| every gallery screenshot is taken with the render loop running | 66-94 | 70-71, 90-93 | tests/specs/*.spec.js participating source (test-harness guard, no runtime module) | Static spec scan finds at least two participating files and rejects direct screenshots without draw opt-in or outside sanctioned shot helper. |

## tests/unit/game-ctx-surface.test.mjs

Full read: 1-157; SHA-256 `96d3b93ef1a06ceb24a2a37463e8cc304d16ff02d2e348a6e6a6a67335c005c9`.

Target scope: tools/check/check-gctx.mjs; types/game-ctx.d.ts; js/game.js and declared ctx modules.

Static scanner/optional tsc checks; synthetic fixture path labels are diagnostic text, not files. Empty KNOWN_UNREAD baseline. Factory/usage floors catch gross scanner omissions but not completeness by themselves.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| types/game-ctx.d.ts declares exactly the members of `const G` in game.js | 48-54 | 50-52, 53 | checkParity | Actual façade and declaration parity return no problems and discover over 200 members. |
| the writability of every member is transcribed, not guessed | 56-69 | 63, 66, 67, 68 | scanGameCtx/scanDts | Declaration parse clean, more than 50 writable/120 readonly members and no duplicate real keys. |
| every module that receives the ctx is a declared GameModuleFactory | 71-80 | 73, 74, 75, 78, 79 | ctxModuleFiles | Ctx module discovery exceeds 15, includes RaceSettings and excludes three unrelated factory shapes. |
| nested GameEls drift is rejected by a negative fixture | 82-88 | 85-87 | scanGameEls/scanDtsEls/checkElsParity | Synthetic GameEls declaration missing tyreWear yields exact located drift diagnostic. |
| module reads through direct, destructured and aliased G.els are emitted against GameEls | 90-108 | 103-107 | collectUsage | Synthetic direct/destructured/aliased els uses emit correct read/destructure/write names. |
| the usage extractor finds the G reference sites it is supposed to check | 110-117 | 112, 115, 116 | emitShadow | Usage shadow has over 1700 sites, 100 writes and eight destructures so empty scans cannot pass. |
| no NEW G member is published for a consumer that does not exist | 127-134 | 130-132, 133 | deadMembers + local judgeDead | No unbaselined dead façade members and no obsolete baseline entries. |
| positive control: the KNOWN_UNREAD judge fails on both drift directions | 136-142 | 139, 140, 141 | local judgeDead (test helper only) | Local judge positive controls cover new unread, known unread and baseline removal directions. |
| tsc accepts every module's use of G against types/game-ctx.d.ts | 144-157 | 153, 154-156 | findTsc/runTsc | When TypeScript resolvable, checker must actually run and have no errors; otherwise explicit skip. |

## tests/unit/game-round2-vm.test.mjs

Full read: 1-307; SHA-256 `6da1f077c58de4b93e71c6f739ab49b430c6743f0fdab6ef16d3d3ca0d0deca9`.

Target scope: js/game.js; race/input/session/camera modules through full game VM.

Real game through inert DOM/render harness and selected spies/overrides. Render faults caught in camera case; ghost gate source-only. Descriptive header and test name do not enlarge actual bodies (WATCH not launched in M5).

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| R4: BOOST drains nothing and does not deploy while the pit limiter holds the car | 34-54 | 44, 50, 51 | js/game.js; race/input/session/camera modules through full game VM | Control boost deploys; overriding pit held disables deploy and prevents battery drain. |
| R5: the Detection Line cannot earn an Overtake while the pit limiter holds the car | 56-76 | 67, 73 | js/game.js; race/input/session/camera modules through full game VM | Spy confirms overtake detection opens outside lane and closes while pit-held. |
| LT: a flash cut short by the gate closing restores the saved ambient and exposure | 78-94 | 83, 89, 90, 91, 92 | js/game.js; race/input/session/camera modules through full game VM | Ending dry-weather flash restores exact ambient/exposure and clears flash scalar. |
| S4: the TT ghost car waits for the first line crossing (lap 0 is the run-up) | 96-104 | 102, 103 | js/game.js; race/input/session/camera modules through full game VM | Source-only ghost lookup requires player lap at least one; VM cannot validate ghost rendering. |
| CAM-1: a world-fixed TRACKSIDE eye is not dragged down-track by the car-frame damper | 106-124 | 112, 122 | js/game.js; race/input/session/camera modules through full game VM | Moving car in trackside mode leaves fixed eye within 0.1 m over six pumped frames; catches stub draw faults. |
| S6: quitToMenu mid-quali gives the menu the whole field back | 126-140 | 133, 135, 136, 137, 138 | js/game.js; race/input/session/camera modules through full game VM | Quitting one-car qualifying restores whole field/quali preview and resets auto camera once. |
| QUIT-FX: quitToMenu empties the particle pool and hides the lens drops (perf-debug-e5b2) | 142-158 | 151, 153, 155, 156 | js/game.js; race/input/session/camera modules through full game VM | Quit clears real particle count and calls spied droplet clear once; canvas rendering stubbed. |
| QUIT-INC: a mid-quali quit hands takeovers back against the 1-car trim, before the field swap | 160-174 | 168, 172 | js/game.js; race/input/session/camera modules through full game VM | Incident reset first sees trimmed one-car grid, before replacing field. |
| S1: quitToMenu forgets a one-off GP's quali order; a season's stays | 176-191 | 188 | js/game.js; race/input/session/camera modules through full game VM | Quit removes one-off GP qualifying order but retains season qualifying order. |
| NET: a failed openQuali prepare cancels the lobby it was opened for | 193-203 | 201 | js/game.js; race/input/session/camera modules through full game VM | Rejected scenery prepare during network qualifying cancels lobby once. |
| I-03/I-04: a launch that bypasses RACE! re-asks for the gyro and re-locks landscape | 205-220 | 215, 216, 218 | js/game.js; race/input/session/camera modules through full game VM | Bypassed launch requests gyro once and landscape lock while fullscreen; second launch does not re-ask gyro. |
| I-07: a transient motion-permission rejection does not claim a switch to buttons | 222-233 | 230, 231 | js/game.js; race/input/session/camera modules through full game VM | Transient motion rejection neither claims switched banner nor changes tilt preference. |
| I-pm-calib: RECALIBRATE takes the zero a beat after the tap, not under the thumb | 235-246 | 242, 244 | js/game.js; race/input/session/camera modules through full game VM | Recalibration click does not zero immediately; timer flush after delay does so once. |
| M5: a refused Data Hub bundle announces it (door and WATCH) | 248-260 | 258 | js/game.js; race/input/session/camera modules through full game VM | Blocked lazy loading from Data Hub door announces COULD NOT LOAD. Despite name mentioning WATCH, body exercises door only. |
| S3: a STANDARD daily chosen before the race-session bundle landed is prepared when it lands | 262-285 | 274, 278, 280, 283 | js/game.js; race/input/session/camera modules through full game VM | Captured race-session-ready callback prepares selected standard daily once; inactive daily does not prepare. |
| DAILY: record() survives a restored entry of the wrong shape | 287-307 | 298, 299, 300, 301, 304 | js/game.js; race/input/session/camera modules through full game VM | Malformed persisted daily entries record clean first lap/best/class values; numeric entry reads as no today entry. |

## tests/unit/game-tools-help.test.mjs

Full read: 1-121; SHA-256 `cd6cc0aaffc1f6b81bb636ed9f11e2f14ec78a5d179b33d64a48a5997527bd9a`.

Target scope: CASES/PARSED target CLI paths in fixture inventory below.

Help/error subprocess exit, text and deadline contracts; timeouts are only indirect evidence of no expensive work. Mapping ran no CLI cases. All concrete paths expanded below.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| audit-aero.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/car/audit-aero.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| audit-parts.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/car/audit-parts.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| cockpit-pale-sweep.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/car/cockpit-pale-sweep.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| crest-sweep.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/car/crest-sweep.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| logo-authored-sweep.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/car/logo-authored-sweep.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| trace-logo.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/car/trace-logo.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| batch-visible-probe.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/gfx/batch-visible-probe.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| chunk-reach.cjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/gfx/chunk-reach.cjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| chunk-share-census.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/gfx/chunk-share-census.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| frame-hitch.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/gfx/frame-hitch.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| road-lut-census.mjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/gfx/road-lut-census.mjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| tlx-pack-check.cjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/gfx/tlx-pack-check.cjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| track-verts.cjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/track/track-verts.cjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| startline-probe.cjs --help prints usage and exits 0 without launching (#1708) | 91-97 | 93, 94, 95, 96 | tools/track/startline-probe.cjs | Each PARSED CLI help returns without process error under 10 s, exits zero and prints exact usage prefix. |
| audit-aero.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/car/audit-aero.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| audit-parts.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/car/audit-parts.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| cockpit-pale-sweep.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/car/cockpit-pale-sweep.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| crest-sweep.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/car/crest-sweep.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| logo-authored-sweep.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/car/logo-authored-sweep.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| trace-logo.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/car/trace-logo.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| batch-visible-probe.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/gfx/batch-visible-probe.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| chunk-reach.cjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/gfx/chunk-reach.cjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| chunk-share-census.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/gfx/chunk-share-census.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| frame-hitch.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/gfx/frame-hitch.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| road-lut-census.mjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/gfx/road-lut-census.mjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| tlx-pack-check.cjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/gfx/tlx-pack-check.cjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| track-verts.cjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/track/track-verts.cjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| startline-probe.cjs --no-such-flag exits non-zero before work (#1708) | 98-103 | 100, 101, 102 | tools/track/startline-probe.cjs | Each PARSED CLI unknown flag returns under 10 s with nonzero exit and unknown-flag diagnostic. |
| gen-shell.mjs refuses an unknown flag instead of writing | 106-111 | 108, 109, 110 | tools/gen/gen-shell.mjs | Generator bogus flag exits exactly 2, diagnoses and prints no written/unchanged status. |
| audit-circuit.cjs --help exits 0 before work | 114-120 | 118, 119 | tools/track/audit-circuit.cjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| ai-pace.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/ai-pace.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| ai-field.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/ai-field.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| ai-line.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/ai-line.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| ai-stuck.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/ai-stuck.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| ai-human.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/ai-human.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| player-dyn.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/player-dyn.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| physics-tune-sweep.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/physics-tune-sweep.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| career-economy.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/car/career-economy.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| apex-eval.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/shot/apex-eval.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| render-car.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/car/render-car.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| spine-station.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/car/spine-station.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| check-physics.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/check-physics.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| vstd-lint.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/check/vstd-lint.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| ci-watch.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/ci/ci-watch.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| bump-cache.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/ci/bump-cache.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| test-solo.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/ci/test-solo.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| verify-track.cjs --help exits 0 before work | 114-120 | 118, 119 | tools/track/verify-track.cjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| float-audit.cjs --help exits 0 before work | 114-120 | 118, 119 | tools/track/float-audit.cjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| shot.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/shot/shot.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| livery-contrast.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/car/livery-contrast.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| rtc-e2e.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/net/rtc-e2e.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| graph-parity.cjs --help exits 0 before work | 114-120 | 118, 119 | tools/track/graph-parity.cjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| glx-call-census.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/gfx/glx-call-census.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| gen-shell.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/gen/gen-shell.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| bake.mjs --help exits 0 before work | 114-120 | 118, 119 | .claude/skills/lighting-tuner/scripts/bake.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| ground-profile.mjs --help exits 0 before work | 114-120 | 118, 119 | .claude/skills/survey-track/ground-profile.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| carshot.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/car/carshot.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| trace-car.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/car/trace-car.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |
| ssr-probe.mjs --help exits 0 before work | 114-120 | 118, 119 | tools/gfx/ssr-probe.mjs | Each CASES CLI help exits zero within spawn timeout and matches its expected identifying usage text. |

## tests/unit/game-vm-pool.test.mjs

Full read: 1-95; SHA-256 `b3f595f652e635d4de1bab44b710fb0b42c47b70a260dd5350bcec85bcf421f2`.

Target scope: tools/lib/game-vm-pool.cjs; tools/lib/game-vm.cjs.

One worker and two real probes, exact same sequence. Does not validate other pool sizes, recycling/timeout paths or browser parity.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| a circuit probed in a worker returns the parent's numbers exactly | 53-62 | 56-58, 59, 60 | tools/lib/game-vm-pool.cjs; tools/lib/game-vm.cjs | One-worker serial order matches parent probe objects exactly for Monza gradient/Zandvoort banking, no errors and real relief. |
| a probe that throws fails ITS circuit, by name | 64-69 | 65-68 | tools/lib/game-vm-pool.cjs; tools/lib/game-vm.cjs | Throwing Bahrain probe rejects with both circuit name and original message. |
| carMeshes:false stubs the builders and refuses a caller that measures | 71-80 | 72, 75, 76, 77, 78-79 | tools/lib/game-vm-pool.cjs; tools/lib/game-vm.cjs | Opt-out records stubbed meshes, empty geometry and wheel-layer keys; requesting mesh measurement throws. |
| closing a pool settles active and queued jobs before returning | 83-95 | 87, 88, 91, 92, 93 | tools/lib/game-vm-pool.cjs; tools/lib/game-vm.cjs | Close rejects active and queued jobs, empties running/queued stats, rejects late work and supports repeated close. |

## tests/unit/game-vm.test.mjs

Full read: 1-345; SHA-256 `063bf121bfdd0cf2ed79bfad469211a300b20ee381e9d1ef934f0cef3f828038`.

Target scope: tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules.

Real manifest/game simulation with inert renderer/DOM, pinned seed/seat/wear defaults; no visual, audio, device or browser-performance proof. Shared boot/state means cases progress same handle. WATCH uses real Baku data but synthetic one-car trace.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| boots to __apex with no script errors | 24-30 | 25, 26, 27, 28, 29 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | VM exposes apex step and captured track/player with no script/rejection errors; inert graphics advertises no mirror. |
| failed automatic race boot releases harness resources | 32-40 | 34-38, 35, 36, 39 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Unknown circuit auto-boot rejects with closed/empty resources and restores process rejection-listener count. |
| nodeAt wraps fractions behind the start line and setPhysics rejects poisoned patches atomically | 42-50 | 44, 46, 48, 49 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Negative node fraction wraps; nonfinite/string physics patches and negative grip reject without partial tuning mutation. |
| cameraState returns detached damping snapshots and separate render/simulation clocks | 52-64 | 54, 55, 56, 58, 62, 63 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Camera snapshot arrays detached and finite; simulation step advances sim clock without inventing render frame. |
| reset clears caution holds and queued debris without changing same-seed rollout | 66-94 | 81, 84, 86, 87, 88, 89, 91, 92 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Reset clears real caution/debris queue and same-seed unrounded physical rollout matches control excluding coaching diagnostics. |
| boot and track build do not hang | 114-116 | 115 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Combined boot/track build stays below 12 s; broad hang guard sensitive to host load. |
| race(monza) + go() + 60 throttle steps: finite physState, speed > 0 | 118-130 | 120, 121, 127, 128, 129 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Monza boot reaches mesh stub; 60 throttle steps produce finite physics, positive speed and advancing progress. |
| crossing the lap line increments lap and wraps s | 132-150 | 136, 146, 147, 148, 149 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Near-line launch crosses within 300 ticks, increments lap/timing and wraps s below 200. |
| the JSON hooks answer: obs / act / probe / cars / setInput / reset | 152-167 | 155, 157, 159, 161, 162, 164, 165, 166 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | JSON hooks expose substantial observation, finite actions/probe/field and reproducible reset speed/seed. |
| every car's gear and rpm track its speed, not just the player's | 174-189 | 180, 182, 183-184, 185, 188 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | At least five moving AI cars rev above idle and one shifts above first; human rpm still valid. |
| the default seed pins tyre wear OFF (recorded AI numbers assume it) | 200-206 | 201, 202, 204-205 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Default harness tyre model off and no car accumulates wear after stepping. |
| the default seed pins McLaren + empty sheet (characterization, not GarageDefaults) | 208-213 | 209, 212 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Default harness seat is McLaren and stored parts empty, intentionally different from shipped defaults. |
| the sim seed: pinned to 1 here, fresh per page load for a player, ?seed=N wins | 215-229 | 223, 225, 226, 227 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Default harness seed one, explicit empty search produces distinct fresh seeds, explicit seed 42 wins. |
| opts.storage.tyreWear turns the model on — the seam --wear rides | 231-243 | 234, 235, 240-241 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Real wear override turns model on and at least five cars accumulate wear over 600 ticks. |
| the driving line never gains speed faster than the car can accelerate at this pace | 248-267 | 258, 264 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | At pace 1 and 0.469 rebuilt driving-line acceleration stays within 1 percent of actual aTop. |
| readiness helpers separate async settling from simulation frames | 270-281 | 272, 273, 277, 278, 279, 280 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Async settle aliases agree and yield host turns without simulation; stepUntil advances exactly one required frame. |
| stepUntil checks initially, honors exact bounds and yields after each frame | 283-306 | 288, 293, 294, 295, 296, 297, 299, 300, 301, 302, 303, 304 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Controlled stepUntil tests initial predicate, zero/exact bounds, dt, host yielding, final check and predicate exception propagation. |
| stepUntil rejects invalid inputs before advancing simulation | 308-317 | 310, 311, 313, 315, 316 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Invalid predicate/options/step bounds/dt reject before simulation clock changes. |
| stepUntil arms a real WATCH countdown and advances its replay clock | 320-345 | 331, 332, 333, 334, 335, 339, 341, 342, 343 | tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js and real manifest modules | Real Baku WATCH script with synthetic trace builds asynchronously but arms countdown and advances replay only through simulation steps; player replay-owned. |

## tests/unit/gantry-cantilever-legs.test.mjs

Full read: 1-28; SHA-256 `7399b0ca82a076e09dfd404653e4827b8a3f79e6820d798a269c16d48d03734c`.

Target scope: js/track/scenery/structures.js:329-401 gantry; tools/lib/track-build-vm.cjs.

Scenery build diagnostics only on Monaco/Madrid; vertex ceiling and nonzero total do not independently assert mast count, exact span count or every gantry style.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| cantilever gantries emit the beam only; the mast is gantry()'s own | 17-28 | 24, 27 | js/track/scenery/structures.js:329-401 gantry; tools/lib/track-build-vm.cjs | Built Monaco/Madrid gantry diagnostics emit at most 24 vertices per span with at least one encountered; this bounds beam geometry, not full support topology. |

## tests/unit/garage-aero-no-camera.test.mjs

Full read: 1-36; SHA-256 `6b9c03a65dda660e97263d2b4084e4bd5918db158f2224f61547a0f4c7cdfef4`.

Target scope: js/garage/setup-camera.js:442-456 setSetupAero.

Lifted function with fake button and spies, three fixed state bags; no full garage lifecycle/rendering and no assertion of button aria/text contents.

| Test name | range | assertionSpans | target | Meaning |
|---|---|---|---|---|
| AERO on/off leaves the camera alone: untouched turntable | 28-35 | 31, 33, 34 | js/garage/setup-camera.js:442-456 setSetupAero | For all three camera states, lifted production aero toggles on/off and never invokes view/spin entry points; spies do not prove every possible camera field immutable. |
| AERO on/off leaves the camera alone: whole-car preset (> 5 m) | 28-35 | 31, 33, 34 | js/garage/setup-camera.js:442-456 setSetupAero | For all three camera states, lifted production aero toggles on/off and never invokes view/spin entry points; spies do not prove every possible camera field immutable. |
| AERO on/off leaves the camera alone: close-in view | 28-35 | 31, 33, 34 | js/garage/setup-camera.js:442-456 setSetupAero | For all three camera states, lifted production aero toggles on/off and never invokes view/spin entry points; spies do not prove every possible camera field immutable. |

## Exact source and fixture inventory

Existing dependency paths only. Hashes/ranges pin inspected contract sources and referenced harness/fixture/CLI dependencies; this inventory does not mean every dependency was fully read. Full-read completion claim applies to the 20 test files above. Incidental paths mentioned only as profile labels, hostile inputs or negative examples are not treated as execution dependencies.

| Path | range | SHA-256 |
|---|---|---|
| .claude/skills/lighting-tuner/scripts/bake.mjs | 1-112 | `0061c40e0e9b3b111b10311c48ba1182c32abb47793b37a8a666d1078d8660ed` |
| .claude/skills/survey-track/ground-profile.mjs | 1-92 | `55191589632859ce6757238ec60e7a46784ba1b5a70d26c1382cea32d26c2b5f` |
| js/agent/agentview-raster.js | 1-716 | `12e89fe25fd063f49cf757db4bbd9ecc03965a31144cf2abc205659fd6d2f4c9` |
| js/agent/apex.js | 1-2495 | `fc763bef7f8648781baa4f884933265d07545630a54df8218197e6aa439c7fc1` |
| js/camera/flyby-seq.js | 1-2145 | `8341ed7ed0f871ae5f90bab851dc3f1a9628122972ee54e32c7b8480591b9d97` |
| js/camera/free-cam.js | 1-524 | `9b84aa105ffa22ccdae1fd45d806a6762b763651ae10712efd6d1143274860cf` |
| js/camera/photo-cam.js | 1-296 | `a2cbe21c7affdd99fc0a444678a46372dc08a9036fe67b051bc2eb68e2b0db66` |
| js/camera/photo-kit.js | 1-189 | `f82eb10d7cc6f2427c231a539dc84e487986d11de9c4e23bf48fe8bc24dcfe53` |
| js/car/car-mesh.js | 1-2105 | `c13a3031510b4f20ac8c658c300a2e8bcee98f0599c658c5fd59d80deae28003` |
| js/car/car3d.js | 1-2899 | `d2ca91950cf1e65dc4161bda35b23148b409095016ed6618ca8ff7d0f714483e` |
| js/car/crest-draw.js | 1-481 | `b7a14497cbbb91f7a37e6ae987ad2b107b544685463af434d1b0ba4b24c9075c` |
| js/car/ghost-share.js | 1-395 | `716716ca491d18a399d261013819f680e20c7134a90623e7d6221beeee05d0c4` |
| js/car/livery-graphics.js | 1-507 | `ddecd391e04e52d62731bd1669931de8b7d68f71c119882c1f39619b8a556c48` |
| js/car/liverytex.js | 1-2676 | `da5d9bec070227b89d688ac965af5210b4c7c99cc25724b62c16ce9c84a2e713` |
| js/car/parts.js | 1-1043 | `7b4c53b388b06b294b59faf46f44f5d01b7fccece83e8732b3c083194558fe4f` |
| js/career/save-migrate.js | 1-418 | `4cda0b16446ec654bfdab06d873ef934c45b9bebd8906621b2a908f8896793e7` |
| js/core/clipboard.js | 1-85 | `4e1e9b0c4b5693665dbeabeb426b342088be74a66a8a4c32aa8e496f52ede46b` |
| js/core/hash32.js | 1-31 | `aaaf3c18de712a7226b8a312c2b0a757879b264dcc40bbd37e4165a16ebd1369` |
| js/core/log.js | 1-210 | `f0971eef3aa6b20f41093617ea1994a47ca24e4606478c64c8eb55ef20515f64` |
| js/core/mat4.js | 1-98 | `8b80f0f6223622840031c736453f9d84862f049e70ce49a1709090098f7d121d` |
| js/core/store.js | 1-878 | `736b2573d7a8376f5eaa7526486310fa1455e47ee7aa20c510ba4f648f2dda0b` |
| js/data/real-race-tab.js | 1-1186 | `66a53dd8451e268658c52130ff44da3078fece6f16fe3aea1c6e50af7170a1d7` |
| js/data/teams.js | 1-395 | `6ff73b5e60b9d510d9a9d4a17129f1947811ce217fda0dc8c1ccf8b64fdfe838` |
| js/editor/codec.js | 1-368 | `bc7c87c5e76045489ce0ac4707cc35de399637aa57215ba6b7a885b70c5a0cf6` |
| js/editor/custom-tracks.js | 1-632 | `060b22134e9f11d71158ef90887683f1a99133c998c7b13b549bcadc45bed9f6` |
| js/fx/skidmarks.js | 1-124 | `7e156b4f20d8fb38f23d0e6264dc1fc498450172d3fa0a0151c241168f4f414f` |
| js/game.js | 1-9554 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| js/garage/setup-camera.js | 1-1153 | `15edc407088a93398cfa04a8ec828867e956d2d832c1cfffafb2c94589843637` |
| js/input/bindings.js | 1-319 | `c6ab198929edc778cc7d23b6b573f2d7c6feb608283f2b160d4ee8a819ea03e4` |
| js/input/haptics.js | 1-213 | `a7ae29b469fa16a74dfe9394a1cf4bddaf0fc0cba06f2296a6aad6312410b0d2` |
| js/input/hold-buttons.js | 1-211 | `9727946b9132cd9e5694b85ff624953e5573a7aa52560a9e85d59c9c762d3ff7` |
| js/input/input.js | 1-2624 | `cb7c8f371e27b0b5862fafc0327f896f80f778948e7a7778ea8380707c356de2` |
| js/input/pad-menu.js | 1-286 | `d2b3a3b58c89b25b15742bd6fd39eefb9a39a71e833a48a59f7b14bce1a56abe` |
| js/lighting/frame-lights.js | 1-769 | `f491413e9d00405865c3033be7b092107b7f1acbf5418d9df5303ba62457957e` |
| js/net/bytes.js | 1-58 | `bcbd948cab766323fb0277c834e0e942a10120eb6118c7870d808a844d4f13fc` |
| js/net/handshake.js | 1-384 | `79fa22247bccc7c4fd0704cc4299dd10dbeba761723f7e3c4f66db0dd9a38f0e` |
| js/net/lobby-codes.js | 1-294 | `22acb631ec421aac5e46541e131fa9d287204aa0a28549401aa596d047b0cf63` |
| js/net/lobby-roster.js | 1-82 | `a60fb05e2d2c7d8bdf938b7cd4072d629c969a7ba01300b516bc75b64f944cda` |
| js/net/qr.js | 1-337 | `ae24090cc94a81386da17c90fed7cc8f8ef2a68cb6551ee327535808dbdb5108` |
| js/net/sdp.js | 1-341 | `399ad9a1ac8630650e3c41cc077a601eaf71fb5f010175caffc30002018827c4` |
| js/net/session.js | 1-381 | `7d016f38240c2360241162100995480a5c6635d67a6f876c54274c5b16456b01` |
| js/net/snapshot.js | 1-398 | `23659eed7cbe28b23d7a8363576db9e39c774e13af4e4b7b517b70e5ddb66298` |
| js/physics/collide.js | 1-886 | `c62b984abfe3a51ff99921cb5b46991755f627b57b6fccef1e1033eb804c1708` |
| js/race/race-settings.js | 1-742 | `ce990121d0c41f64547ecd8a7d6f811b7bd1861f19f6f4879c180ce41d15c0f5` |
| js/render/glx/chunked.js | 1-848 | `7ad6e66ee44b7868051ef18426848bd3203cf5dd0256dac2207398fed90efee3` |
| js/render/glx/glx.js | 1-2887 | `9453e308fc6f88160634c29d2d4bee36ec6ca7074fc8b8381ce26f457baf553f` |
| js/render/glx/post.js | 1-1354 | `bee401242ac69ab9a0529848d324b43ba16cd6ea257f9dce73eaafef5b6c86d1` |
| js/render/shared/frustum.js | 1-126 | `b18b607fd0db76124761bd8a3f23543d7274779082f9a1ef3385321fa54cd61d` |
| js/render/shared/light-budget.js | 1-31 | `cdfd5c32a1ecc55952aa082e6689c2a31f5a700c0faa719e3200fb4e6cf55e1e` |
| js/render/three/tlx-chunked.js | 1-772 | `3b34cb80249d6a38c66ad86e341ad14b4a38dc835ffd741542d737d3ecfd91cb` |
| js/render/three/tlx-post.js | 1-1312 | `3d9a328acc1cd51be49e8d853cbfa3a0f2eba4311bad30d3475610b5d5b315b1` |
| js/render/three/tlx.js | 1-6854 | `58669a10791324112e956d2b63adefd0c2b793147945a148d2eda447340922a2` |
| js/render/webgpu/wgx-chunked.js | 1-508 | `bd51ea5391167d4055fc5a8c6374a782aa4d53475a5071343008367b37806b2b` |
| js/render/webgpu/wgx.js | 1-6085 | `7ce7dd4b81578e15a31cd102eb36229a8c2b7c8e59f65aed837cbfbe1888d855` |
| js/track/scenery/structures.js | 1-1130 | `28c1d77dcdef94fa5ae828dcf6ea7693cd9aca7878fc12c9320ac8e23942b8b5` |
| js/ui/post-fx-opts.js | 1-83 | `49b65f2768466fb76d1c92c2d86a2d1e74786489062404e04b97d0e01e5cba45` |
| js/ui/settings-export.js | 1-1348 | `f88dcf1dfe421bd91f8777328723045a6c7336a375e81cb372a2137bccf8ebf3` |
| js/ui/track-maps.js | 1-675 | `a9033bee5cd751c31e05fe82b80d3b6d6edb55b6aed92f6749d81a589c8f413c` |
| tests/data/frozen-globals.json | 1-224 | `d11bdf9a010099f9a67799438167882e22aca4301d785d6d6a6930c63cb2da35` |
| tests/fixtures/openf1-baku-2026-race.json | 1-1 | `90733ce5cee211dd9fc470a883e802ce1a24cba3aa5768dbd17d3b8f7583df12` |
| tests/helpers/abs-src.mjs | 1-8 | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| tests/helpers/editor-vm.mjs | 1-48 | `ebbdbb10a8e175aa4b957975fb659e60c782cd62a17aa849d77997db602106df` |
| tests/helpers/elevation-probes.cjs | 1-164 | `d2f5b61f593d115ce80520a22bb3566e801014dd2fd2f471a21a940326419da6` |
| tests/helpers/game-source.mjs | 1-84 | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| tests/helpers/mini-dom.mjs | 1-186 | `3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1` |
| tests/helpers/seed-clipboard.mjs | 1-21 | `e4f18d266dc740416dc84129c6e512cd6941572df3f4c27fd9611ea926050897` |
| tests/helpers/seed-log.mjs | 1-35 | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| tests/helpers/seed-save-migrate.mjs | 1-31 | `01e258dd999942cd1633f79d6ef90b693c2b6529bf11d67ebf7160fd6c505295` |
| tests/helpers/seeded-fuzz.mjs | 1-223 | `4599b2405923cb7845dd71a51f1594871f634d5c8ad34b9cfccaa2087f5b7c53` |
| tools/assets/gltf-check.mjs | 1-72 | `86094de39d1735779c2980bde18d08ba04edfa8fcdf2bf9ba78d0a5e81f09cae` |
| tools/assets/procedural-room.example.json | 1-16 | `72a4dd6355de2d80d6037915ffa6527619e4b0c9dfcac4178bac87a6047047c3` |
| tools/assets/procedural-room.py | 1-167 | `c9f6067c68be9942ae510d60e612df259524d7351a96e84e31a2c85e8cd995d0` |
| tools/car/audit-aero.mjs | 1-29 | `473f5312ba1fb13850afa0a3e0f6e17431df0a42715462c806e28724c0c551eb` |
| tools/car/audit-parts.mjs | 1-103 | `f0c6cf0a056afc7179ac1ebd3d596fc1c91c5df1e76ec5771757fa4f5ec432e0` |
| tools/car/career-economy.mjs | 1-149 | `18de0988b12db6441c128de15813e5808716f3ae4070d7efaa1485087d8c1946` |
| tools/car/carshot.mjs | 1-113 | `a05d07fff3ce2655ae1baa24eeb005f032cc2b5beee551e8b6e669dea26e1446` |
| tools/car/cockpit-pale-sweep.mjs | 1-149 | `85696f1b67a441ebf343b29c72e5f179d774c7600c7febd0d2f374e06e9dcf93` |
| tools/car/crest-sweep.mjs | 1-431 | `0012e8a5165eda92c9b8e15f6f4fe14a877c65a26fff482c959156299b10ba0f` |
| tools/car/livery-contrast.mjs | 1-148 | `2f79e0f06fe976ed80baf732639d0bdef515a7eac589aefcd9ddb990e0c4642c` |
| tools/car/logo-authored-sweep.mjs | 1-80 | `ffa444f3386b2d4b15e2c6e933e34de8e62a18e35e88a8f656b4287e1c3b3ee0` |
| tools/car/parts-sweep.mjs | 1-1011 | `60df9d4b5ad7080a9c7a4444d892078d271c89030bbedf429efe1f7d01602949` |
| tools/car/render-car.mjs | 1-558 | `6b13ecda072160103bbc612705bef79b42501896bea827906150399aa065936b` |
| tools/car/spine-station.mjs | 1-246 | `9cb975eca9499a3aea9892497bda8832b17782a78ba9b98ce9a061f5ee4df340` |
| tools/car/trace-car.mjs | 1-268 | `31cf46ed0549d0822f397999ae152bafcce2158b88fe09427e67286ea56f167e` |
| tools/car/trace-logo.mjs | 1-490 | `ea50258993335ba4f3540e0b8fe0e7b85aea7033cc483e79918259b9b7d564e8` |
| tools/check/ai-field.mjs | 1-272 | `cf4ad0bcdd052898f4d695084cebf692f094c65bc33f9a3a8bf6dabb38c47024` |
| tools/check/ai-human.mjs | 1-308 | `188efcc7a60817f1c993f12691dbe917930b4834ac4ca04998f512ed85ad1ee4` |
| tools/check/ai-line.mjs | 1-144 | `3b18b63f951fbd1e1bc2ace70384eb0406f59c0afa3653e540d8332d5ed2021e` |
| tools/check/ai-pace.mjs | 1-123 | `fd1ec8cc25324bf622a265ed16c54daf39f1e8927e818cc48ead5f3f837ca04e` |
| tools/check/ai-stuck.mjs | 1-88 | `bd57e5aa090294ef442ab3089699f139c777c98e607280cc8105706f74c86433` |
| tools/check/check-gctx.mjs | 1-612 | `337f129aa6508cb6e9877d90bbb9e6f1fd3d630aa820a79b5c011350bf403405` |
| tools/check/check-physics.mjs | 1-158 | `20f1e232585365158b0ae92c4eed2dff4994aec4103b88adf53ff1b43dbad7b2` |
| tools/check/physics-tune-sweep.mjs | 1-366 | `2594bc636c11c809c13a954ea724698a9eba94b2a53424d1e1eb299f9e5b3b44` |
| tools/check/player-dyn.mjs | 1-196 | `461ff3bc2b725b864982089fb5e2a28edab7266324609c8868448ba6610c3480` |
| tools/check/vstd-lint.mjs | 1-296 | `3188ad4aaa48e08037f4ae3c853c5e09b938e40f875deb793e24779f7c8665e8` |
| tools/ci/bump-cache.mjs | 1-258 | `20b1d8e2fe5dea1fb23041709ae5a6de836a93668ad80f6bef4cf55de0a96808` |
| tools/ci/ci-watch.mjs | 1-596 | `a410bd3b1a57dae99924af53eeec8bcb874bdfc913b1b929a34696da82fb8e47` |
| tools/ci/test-solo.mjs | 1-123 | `632cb607c7dcd675c8db74191e8e80cbe43e768895f50add88f2caa867420cef` |
| tools/env/chat-mcp-service.mjs | 1-77 | `9a5e51b0f776e32692448949d97ca2ac799ce5f44cca5bd878b5546213f6bb90` |
| tools/env/configure-chat-mcp.mjs | 1-30 | `2aa8b23acb02b450b4411fe52f0ba3eb35a096511fc60a9bc4270da722bd5891` |
| tools/gen/gen-shell.mjs | 1-361 | `743b17348c6a8cd70fb1a03380d2a7b97f0fd6d1fe559d508e3f0b8b9d8def96` |
| tools/gfx/batch-visible-probe.mjs | 1-277 | `5cafd7a8148166ae048cb0c157517e5599a2a9e49516ca73f0075248982fda94` |
| tools/gfx/chunk-reach.cjs | 1-150 | `9b5616fd2f99e10b2ec455cbf8d4de92b4b3dd363fe00aefcd05c44f89b8e7be` |
| tools/gfx/chunk-share-census.mjs | 1-89 | `362a10082bf727aeef1232290f6cf4aed7db4e01959b88aabd32dcb5143e8e17` |
| tools/gfx/frame-hitch.mjs | 1-1564 | `e0b23ce19516aa417ce4f50bb70c1e15d06a0f456d489361d1db1d50c7097aea` |
| tools/gfx/glx-call-census.mjs | 1-203 | `3a4a88a9400752e1561ce506f426f157bc56e9534d1c07e7d0b70adc297248bf` |
| tools/gfx/gpu-game-check.mjs | 1-1734 | `77f91e8296df186063f0946c11a99cbc5c8cc21725284efc003a92e8c47143bd` |
| tools/gfx/road-lut-census.mjs | 1-265 | `4365525bad72ebd68e5f4584f5a0e3a27d86accf1ce67f140c36a663a5f5ce9e` |
| tools/gfx/ssr-probe.mjs | 1-215 | `087068ea3695eae908f35c05efd75974821136e811a4bf7c7439378289553af6` |
| tools/gfx/tlx-pack-check.cjs | 1-195 | `b7854941ac6861649c395384e6ce7d0a931e41cb80338ff3e4742fd5acfdc556` |
| tools/lib/frame-math.mjs | 1-443 | `71fdf53f140beea05b5adc88be9df1a30ad73f319a298992e0ff7c48fd808da8` |
| tools/lib/game-vm-pool.cjs | 1-269 | `7560826b2a08ab902a07ff36273489a9737284ec44d369fb88eec0d8c29d196b` |
| tools/lib/game-vm.cjs | 1-880 | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| tools/lib/track-build-vm.cjs | 1-270 | `09e00ae387a0e46bf25c9d7cbe4eb71ab32c891b7aba36e645c5d6614f6f311b` |
| tools/manifest.cjs | 1-1691 | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| tools/mcp/chat-gateway.mjs | 1-89 | `5995327b2f26508bfb261a0114ec6b0b33f6e25ec81492ee0a1fff469fc83cd3` |
| tools/mcp/check-chat-contract.mjs | 1-35 | `64fa36a63669afa14de9d170e34ddcfd5cb4c015dba6a86191401f1059a10347` |
| tools/mcp/doctor-catalog.mjs | 1-34 | `39a66e2b0d8aff3d3186aac3190e07bb94b82ae429e18b6e76cc311acf3da097` |
| tools/net/rtc-e2e.mjs | 1-262 | `afd5c2631929fd8f1332243ba44992f5fbf80633af7de2a5ddc741e0dcd973af` |
| tools/shot/apex-eval.mjs | 1-181 | `76dae71f48574741b825d411e830cca16b2b012d9f4b1e4eb34061316f434f57` |
| tools/shot/shot.mjs | 1-305 | `48f3ae666446fa2522a21aa6bb127a4a53eb817f58dd0e499c79a22c8ae51038` |
| tools/track/audit-circuit.cjs | 1-157 | `04241f9b47b4c91cc55a7a51976b6415038188c3777387085d19fb91c05e57cd` |
| tools/track/float-audit.cjs | 1-795 | `b7a3bb559686d84c889784039676b6be8400d49c2dd8e5a35400ba735893238f` |
| tools/track/graph-parity.cjs | 1-227 | `2dbfa7a3cf0d25234f16daef17d512cc3af4efee26a0e0edb87a2a26d9b954b9` |
| tools/track/startline-probe.cjs | 1-357 | `f600f550578e427a3d9d36766513cad0b0768892ebafbfcfd6f7d7e96c632910` |
| tools/track/track-verts.cjs | 1-68 | `28bc475e58bd61b8eb15629f90ae1c248a2ebf0371235ab912bf9b3ffbc4aa0b` |
| tools/track/verify-track.cjs | 1-458 | `6eb4174e4ce20105e81c76fcfde2c6b2199818aeb2e22ba4612b909127be0b8b` |
| tools/ui/css-play.mjs | 1-488 | `ad07e88e918184f53f4ac9945c0b66320db1971af88618abc56caaffb61c477e` |
| tools/ui/design-evidence.mjs | 1-80 | `6ac60712edb2cd8bfc0fa8a6c7215620efd09964748206694f56a2397f4f6806` |
| types/game-ctx.d.ts | 1-941 | `c79b3b7726f51baed438d0c1a3345ad7641b5bd73622bb437f241b2c60205e42` |

## Selected production symbol ranges

| Path | symbol | range |
|---|---|---|
| js/agent/agentview-raster.js | project | 486-491 |
| js/camera/free-cam.js | speedFromSlider | 23-26 |
| js/camera/free-cam.js | sliderFromSpeed | 27-30 |
| js/camera/free-cam.js | wheelSpeed | 33-36 |
| js/camera/free-cam.js | clampRoll | 38-38 |
| js/camera/free-cam.js | viewSnippet | 45-47 |
| js/camera/free-cam.js | aim | 51-55 |
| js/camera/free-cam.js | carPose | 60-66 |
| js/camera/free-cam.js | cornerPose | 72-92 |
| js/camera/photo-cam.js | release | 228-228 |
| js/car/car-mesh.js | carDecalData | 36-374 |
| js/car/car-mesh.js | getAeroFlapSet | 772-810 |
| js/car/car-mesh.js | drawRearLights | 1913-1916 |
| js/car/car-mesh.js | drawAeroEdge | 1940-1965 |
| js/car/car-mesh.js | drawTailGlow | 2021-2045 |
| js/car/car-mesh.js | flushTailGlows | 2047-2050 |
| js/car/car-mesh.js | drawMirrorLights | 2073-2076 |
| js/car/ghost-share.js | encode | 160-185 |
| js/car/ghost-share.js | codeFrom | 187-195 |
| js/car/ghost-share.js | decode | 209-228 |
| js/car/liverytex.js | setTeamLogo | 931-949 |
| js/career/save-migrate.js | migrateCareer | 287-394 |
| js/data/real-race-tab.js | lapNo | 36-36 |
| js/editor/codec.js | encode | 303-313 |
| js/editor/codec.js | decode | 315-333 |
| js/editor/codec.js | fromHash | 344-348 |
| js/editor/custom-tracks.js | sanitize | 197-241 |
| js/game.js | setFrameLights | 6692-6694 |
| js/game.js | appendCarTailLights | 6695-6697 |
| js/garage/setup-camera.js | setSetupAero | 442-456 |
| js/garage/setup-camera.js | release | 977-981 |
| js/garage/setup-camera.js | release | 1068-1071 |
| js/input/hold-buttons.js | release | 125-132 |
| js/lighting/frame-lights.js | appendCarTailLights | 28-137 |
| js/lighting/frame-lights.js | _shedTick | 313-328 |
| js/lighting/frame-lights.js | tierShed | 329-333 |
| js/lighting/frame-lights.js | glowFade | 335-339 |
| js/lighting/frame-lights.js | _rankSet | 402-599 |
| js/lighting/frame-lights.js | release | 619-633 |
| js/lighting/frame-lights.js | viewLights | 646-658 |
| js/lighting/frame-lights.js | setFrameLights | 659-765 |
| js/net/handshake.js | peekCode | 99-111 |
| js/net/handshake.js | decodeCode | 112-137 |
| js/net/lobby-codes.js | codeFrom | 36-93 |
| js/net/qr.js | encode | 284-308 |
| js/net/sdp.js | unpack | 234-283 |
| js/net/session.js | release | 217-221 |
| js/net/snapshot.js | decodeSnapshot | 135-152 |
| js/physics/collide.js | _colResolvePair | 571-685 |
| js/physics/collide.js | resolveCollisions | 754-864 |
| js/render/glx/glx.js | uf1 | 349-352 |
| js/render/glx/glx.js | uf4 | 420-427 |
| js/render/glx/glx.js | uf2 | 430-437 |
| js/render/glx/glx.js | setPolyOffset | 480-493 |
| js/render/glx/glx.js | _shadowPackFor | 2148-2159 |
| js/render/glx/glx.js | cullInstances | 2183-2319 |
| js/render/glx/post.js | uf1 | 93-96 |
| js/render/glx/post.js | uf4 | 105-112 |
| js/render/three/tlx-post.js | rtSetSize | 374-378 |
| js/render/three/tlx.js | poolModelMat | 2100-2114 |
| js/render/three/tlx.js | cullInstances | 2257-2368 |
| js/render/three/tlx.js | _decalAppend | 2701-2720 |
| js/render/three/tlx.js | release | 3195-3199 |
| js/render/three/tlx.js | release | 4977-4981 |
| js/render/three/tlx.js | settle | 5114-5120 |
| js/render/webgpu/wgx.js | release | 1981-1981 |
| js/render/webgpu/wgx.js | ensureTargets | 2342-2607 |
| js/render/webgpu/wgx.js | settle | 4921-4927 |
| js/render/webgpu/wgx.js | cullInstances | 5096-5190 |
| js/render/webgpu/wgx.js | _shadowPackFor | 5871-5871 |
| js/track/scenery/structures.js | gantry | 329-401 |
| js/ui/post-fx-opts.js | applyLookShed | 50-59 |
| js/ui/settings-export.js | applySettings | 554-597 |
| js/ui/settings-export.js | applyGarage | 745-787 |
| tools/assets/gltf-check.mjs | localResource | 14-22 |
| tools/assets/gltf-check.mjs | validateAsset | 23-38 |
| tools/assets/gltf-check.mjs | optimizeAsset | 39-54 |
| tools/check/check-gctx.mjs | scanGameCtx | 120-151 |
| tools/check/check-gctx.mjs | scanDts | 158-180 |
| tools/check/check-gctx.mjs | scanGameEls | 183-198 |
| tools/check/check-gctx.mjs | scanDtsEls | 206-228 |
| tools/check/check-gctx.mjs | checkElsParity | 233-242 |
| tools/check/check-gctx.mjs | collectUsage | 318-425 |
| tools/check/check-gctx.mjs | ctxModuleFiles | 440-446 |
| tools/check/check-gctx.mjs | emitShadow | 449-482 |
| tools/check/check-gctx.mjs | deadMembers | 495-506 |
| tools/check/check-gctx.mjs | findTsc | 511-519 |
| tools/check/check-gctx.mjs | runTsc | 529-550 |
| tools/check/check-gctx.mjs | checkParity | 554-582 |
| tools/env/chat-mcp-service.mjs | readService | 28-30 |
| tools/env/configure-chat-mcp.mjs | gatewayProfile | 10-19 |
| tools/gfx/batch-visible-probe.mjs | settle | 108-113 |
| tools/gfx/frame-hitch.mjs | analyse | 110-149 |
| tools/gfx/frame-hitch.mjs | analyseCpu | 158-192 |
| tools/gfx/frame-hitch.mjs | analyseSpikeCpu | 206-283 |
| tools/gfx/frame-hitch.mjs | analyseSpikeWork | 290-320 |
| tools/gfx/frame-hitch.mjs | analyseWindow | 329-356 |
| tools/gfx/frame-hitch.mjs | analyseGapWork | 367-409 |
| tools/gfx/frame-hitch.mjs | analyseDepthDiscard | 418-430 |
| tools/gfx/frame-hitch.mjs | raceEntrySpanList | 449-481 |
| tools/gfx/frame-hitch.mjs | analyseRaceEntrySpans | 491-541 |
| tools/gfx/frame-hitch.mjs | analyseRaceEntryLoaf | 557-591 |
| tools/gfx/frame-hitch.mjs | analyseSpikePassKinds | 602-626 |
| tools/gfx/frame-hitch.mjs | analyseAlloc | 779-844 |
| tools/gfx/frame-hitch.mjs | analyseHeap | 857-917 |
| tools/gfx/gpu-game-check.mjs | settle | 1341-1343 |
| tools/gfx/tlx-pack-check.cjs | decode | 78-84 |
| tools/lib/frame-math.mjs | makeCamera | 33-46 |
| tools/lib/frame-math.mjs | project | 50-55 |
| tools/lib/frame-math.mjs | rayDir | 58-63 |
| tools/lib/frame-math.mjs | rayBox | 68-86 |
| tools/lib/frame-math.mjs | insideBox | 88-92 |
| tools/lib/frame-math.mjs | castFrame | 173-185 |
| tools/lib/frame-math.mjs | transmittance | 190-212 |
| tools/lib/frame-math.mjs | thirdsDistance | 216-221 |
| tools/lib/frame-math.mjs | fitHorizon | 226-238 |
| tools/lib/frame-math.mjs | geomHorizon | 242-244 |
| tools/lib/frame-math.mjs | motion | 247-257 |
| tools/lib/frame-math.mjs | asciiThumb | 288-311 |
| tools/lib/frame-math.mjs | subjectGeometry | 314-343 |
| tools/lib/frame-math.mjs | frameStats | 346-383 |
| tools/lib/frame-math.mjs | judge | 391-443 |
| tools/lib/game-vm-pool.cjs | createPool | 140-244 |
| tools/lib/game-vm.cjs | stubCarMeshes | 586-600 |
| tools/lib/game-vm.cjs | settle | 619-626 |
| tools/lib/game-vm.cjs | createGame | 641-852 |
| tools/mcp/chat-gateway.mjs | createGateway | 15-77 |
| tools/mcp/check-chat-contract.mjs | normalizeHostName | 10-10 |
| tools/mcp/check-chat-contract.mjs | checkCatalog | 11-19 |
| tools/mcp/doctor-catalog.mjs | doctorWithCatalog | 11-34 |
| tools/ui/css-play.mjs | parseCssPlayArgs | 107-155 |
| tools/ui/design-evidence.mjs | tokenHTML | 47-51 |
| tools/ui/design-evidence.mjs | localImage | 57-66 |
| tools/ui/design-evidence.mjs | screenshotReview | 67-80 |

Coverage: 20 files / 4017 fully read lines; 172 test declarations, 229 concrete cases after loop expansion. Assertions in reusable local helpers additionally live at frame-hotpath lift 20-28; frame-math near 14; fuzz assertion shapes/cleanliness 30-73 and sane-lap helper 508-514; game-vm finite 18; garage source-anchor assertion 12. These helper definitions are mapped above and are not independent registered tests.

Validation: source/AST metadata inspection only. Test execution and browser validation intentionally not run for this documentation mapping lane.
