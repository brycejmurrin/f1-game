# Unit tests group 06 — complete reading map

Scope: exactly group 06 in `docs/project-map/unit-batches.json`: 11 files, 4,375 physical lines. All source lines were read in bounded chunks, including fixtures, helpers and comments. Initial oversized reads were replaced by the bounded reads below. This is static mapping evidence, not a test-run verdict. No tests, browsers, production edits, baseline updates or commits were performed.

## Read and hash ledger

SHA-256 is over the complete file bytes. Ranges are inclusive and gap-free; repeat reads are omitted. Case rows count lexical `test(...)` registrations, not runtime loop expansion.

| File | Lines read | SHA-256 | Cases |
|---|---|---|---:|
| `tests/unit/car-materials.test.mjs` | 1–130, 131–259, 260–450, 451–627 | `f10293cbeff8ffac6bbac776552c7d475dd71d8497925deaec577442a0b4cc50` | 27 |
| `tests/unit/car-mesh-anchors.test.mjs` | 1–32, 33–160, 161–286 | `c501fe788c985d8cf0d7ad13c4fbe0fa9dbf50d9fe421d1f008bd3233e1c51c7` | 6 |
| `tests/unit/car-mesh-budget.test.mjs` | 1–52 | `c52aa18a2ede4dec313152378fb8e20455b2194af7425853d73946f707aa84b7` | 2 |
| `tests/unit/car-mesh-crew-cache.test.mjs` | 1–160, 161–301 | `2b37bb48b3727c40cb13b05d0f31dc2b471ae07a62b7dc9b4b99136223ab1a08` | 14 |
| `tests/unit/car-multi-shot-tools.test.mjs` | 1–160, 161–330, 331–490, 491–620 | `43a523720251c75ede3b489b8a6d21f4702c70e979484e1dee46f776cd75f492` | 30 |
| `tests/unit/car-presentation-canary.test.mjs` | 1–199 | `312e03b5cfa91e72c83a566990e0fd30eef4e602ff83a3379a7ac609046a0313` | 12 |
| `tests/unit/car-presentation-vm.test.mjs` | 1–200, 201–400, 401–600, 601–780, 781–925 | `540012c2c4df22c7bdc0780b395997f8c4a8514017bb19a2e4a94b8ba871026e` | 29 |
| `tests/unit/car-shade.test.mjs` | 1–170, 171–350, 351–510, 511–661 | `6635f62733466d94238b0a5cf9248f9ba196d5883dd371227b03605c63d401d0` | 21 |
| `tests/unit/car-wheels-w13d.test.mjs` | 1–28 | `42b7ebf6c7e06126e3f04d77e6d232cf2d4af8f03d4a066498f55b5ec7f13f59` | 1 |
| `tests/unit/car-wing-foil.test.mjs` | 1–150, 151–371 | `d7a596502bae6342e7962050a25df55c98cff06609557dbbd957b520bb2d8928` | 14 |
| `tests/unit/career-ai-dev.test.mjs` | 1–160, 161–305 | `7191286cb30594e1f80744956b2aa0beff1cb7fdbcd3bc2c1a3e1c335e9b8285` | 13 |

## Navigation and evidence boundaries

Read repository `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`. Attached apex-lsp definitions established CarMaterials.applyFinish, CarMesh.getCrewMesh, CarGeometry.weld, Car3D.build/buildFlapGeom, CarDraw.create/carVisual, CareerAiDev.developWinter and CarShade.smooth. Outlines confirmed module boundaries. Car3D.bodyAnchors lookup returned forwarding/export rows rather than the underlying function body; the CarBodyGeom create boundary is recorded explicitly, without treating the alias excerpt as its implementation. Source fixture reads established tri-census:38–74, parts-sweep:96–120, customization-plan:5–86 and car-draw-vm:35–170.

Each row below identifies its assertion locations and intended invariant after full reading. Assertion spans are source coordinates, not copied assertions; short gaps inside a span may contain setup statements. Shared helper assertions supplement the case-local spans: materials expandedPins at 486–490 for cases 492/505/518/533/554/602; materials close at 570 for all normal-model comparisons; shade assertClosedOut at 338–350 for cases 353/568; cameraCatalogCode at 23–29 for all invoking camera-catalog cases; VM lifecycle free-once assertion at 836 for all sharedRivalLifecycleRig cases. Shared fixture/target descriptions apply to every case in that section; exceptions are called out. Historical incidents, dated timings and browser-parity comments are context supplied by test authors, not independently re-established evidence. Fictional fetch filenames and rejected path tokens are described by role instead of presented as live files.

## car-materials.test.mjs

Fixture: VM materials + shade constants; three shader texts; Teams in a separate VM with the real finish registry; tiny mutable mesh streams.

Production targets: CarMaterials.applyFinish → js/car/car-materials.js:110; CarMaterialShade → js/car/car-material-shade.js; Teams.liveryEnumOk → js/data/teams.js; chip wiring → js/garage/setup-sheet.js; dialects → js/render/glx/shaders/glsl-lit.js, js/render/three/tsl-lit.js, js/render/webgpu/wgsl-chunks.js.

What the assertions establish and limit: IDs, chip order and paint-only remaps are executable data checks. All dialect pins inspect text; the >=60-constant table excludes 0/1 and accepts several decimal spellings, so a number elsewhere can satisfy it. Hammered rotation/reflection/handedness and holographic energy bounds run local mathematical models, then require shader snippets; they do not execute GPU code. The resource-free scan covers marked expanded-finish blocks; hammered derivative checks separately inspect the transformed frame and pre-divergence WGSL position.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 27 | CarMaterials exposes SURFACES, FINISH_SURFACE, palette and SHADE | 29–43 |
| 46 | applyFinish remaps paint only; matte stays id 28 | 54–56 |
| 59 | shade contract numbers appear in all three lit backends | 111, 115–117 |
| 135 | every CarMaterialShade constant is spelled in GLX, TLX and WGX (table) | 146, 153 |
| 156 | FINISH_SURFACE rows tinted 36 and chameleon 37 exist, in the reserved ids | 158–164 |
| 167 | tinted/chameleon remap only paint vertices; gloss and unset stay byte-identical | 173, 176, 181 |
| 184 | the garage chip rows are derived from FINISH_SURFACE, so the new finishes appear (and only rendered ones) | 187–190, 194–196 |
| 200 | Teams.liveryEnumOk accepts the new finish names (derived from FINISH_SURFACE) and still refuses junk | 206–207 |
| 210 | tinted chrome: mirror response + livery-hue reflection, same numbers in GLX / TLX / WGX | 222–231 |
| 234 | chameleon: team hue face-on, fixed flip hue at grazing angles on the LIT colour, same numbers in GLX / TLX / WGX; pearl 30 untouched | 253–259 |
| 264 | FINISH_SURFACE rows flake 34 and candy 35 exist, are accepted by Teams.liveryEnumOk, and remap paint only | 266–272, 277, 282 |
| 286 | flake: same grain, spark, fade and specular numbers in GLX / TLX / WGX; paint-class response | 292, 316–318 |
| 321 | candy: darker saturated base, tinted lacquer, saturated rim, high gloss — same numbers in GLX / TLX / WGX | 346–348 |
| 351 | flake and candy add no uniform, define, texture fetch or shader variant (surfaceId branches only) | 355–356 |
| 366 | FINISH_SURFACE rows forged 38, gunmetal 39, goldplate 40 exist in the reserved ids and remap paint only | 369–370, 373, 379–380 |
| 383 | forged carbon: chip cells, fade, resin, roughness and lacquer — same numbers in GLX / TLX / WGX | 387–388, 405–407 |
| 410 | gunmetal: metal lobe with a dark livery-hue tint and the dark-metal env boost — same numbers in GLX / TLX / WGX | 431–433 |
| 436 | gold plate: chrome mirror response with a fixed gold that ignores the livery — same numbers in GLX / TLX / WGX | 441, 451 |
| 454 | forged, gunmetal and gold plate add no uniform, define, texture fetch or shader variant (surfaceId branches only) | 458–459 |
| 464 | expanded finishes reserve unique ids, accept whole-car/zone values and preserve mesh streams | 472–475, 480–482 |
| 492 | holographic keeps one continuous angular spectrum in all three backends | 502 |
| 505 | velvet has a diffuse dark face and lighting-preserving grazing sheen across backends | 515 |
| 518 | hammered relief is smooth, object-space and faded by 22 metres across backends | 528–530 |
| 533 | anodized retains bright colour on a broad metal lobe rather than gunmetal's dark substrate | 543 |
| 546 | expanded finish blocks add no resources, temporal pattern or shader derivatives | 549–550 |
| 554 | hammered cotangent frame follows panel rotation, reflection and screen handedness | 570, 585, 599 |
| 602 | holographic transfers existing light across hue channels without increasing the lit peak | 615, 618–621 |


## car-mesh-anchors.test.mjs

Fixture: loadParts twice, flat and shade-enabled; sentinel colours select geometric subsets. Two extreme engine recipes × three flat/rounded anchor comparisons; full aero and brake options.

Production targets: Car3D.build → js/car/car3d.js:237; bodyAnchors/buildFlapGeom forwarded through CarBodyGeom.create in js/car/car-body-geom.js:17; CarMesh.carDecalData → js/car/car-mesh.js.

What the assertions establish and limit: Nonempty selection guards prevent empty-array maxima passing. Pod decals <35 mm, nose decals <25 mm, accents/lights <40 mm; pod decal y is within 20 mm of bounds. Flap check uses a tip volume and independent FW_SPAN 0.715, not exact foil topology. T-camera housing/bar/LED are tested with driver present/absent; filler covers heights 0.78/1/1.28; emissive check limits every selected vertex to the rain-light volume. The sidepod template registers three cases.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 33 | nose paint and the crown light fit every team and concept body's crown | 41–43, 47–51 |
| 83 | sidepod and nose graphics stay attached across extreme engine recipes — flat / rounded / rounded-vs-flat | 113–116, 119–132 |
| 136 | every front-wing top flap reaches its endplates after taper and tip rise | 151–152, 183 |
| 186 | T-camera bar and LED ride the same snorkel-aware pod datum | 222–229 |
| 234 | fuel filler rides the engine-cover skin across coverHeight | 259, 262–263 |
| 267 | functionalEmissive stays reserved for the FIA rain light | 285 |


## car-mesh-budget.test.mjs

Fixture: tri-census loadCar with rounding enabled and real catalog/teams; Ferrari and Red Bull plus every body ID; Ferrari factory build for weld comparison.

Production targets: tools/car/tri-census.mjs:38,55,70 → Car3D.build; CarGeometry.weld → js/car/car-geometry.js:332.

What the assertions establish and limit: Player <=16500 triangles, field <=14000, far <=6500, player/field <=1.35 vertices per triangle. Welding preserves index count and each indexed position/normal/colour after Math.fround plus exact material IDs for default/auralis/caldra. No frame-rate, GPU or all-team census follows from these bounds.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 20 | every body stays inside the per-car triangle budget, welded | 24–27, 30 |
| 33 | the weld is lossless: same triangles, same corners | 40, 45–49 |


## car-mesh-crew-cache.test.mjs

Fixture: Real CarMesh in a VM with minimal GaragePrims and recording gfx; later loadReal uses real parts geometry with mesh/texture/free counters. clockOf installs a controlled VM performance clock.

Production targets: CarMesh.getCrewMesh → js/car/car-mesh.js:569; related getSpinDisc/getCompoundRing/getCarDecalMesh/getAeroFlap/getAeroFlapSet/getCockpitWheel/getCockpitCabin/releaseIdleFlaps in that module; release wiring → js/garage/setup-camera.js.

What the assertions establish and limit: Crew is six people, colour keys round at 0.01, FIFO remains <=64 with unique frees and rebuilds after eviction. Spin disc has 96 vertices/288 indices, x=0 and darker hub. Memo tests distinguish same object, equal new objects, in-place edits, finish, fin, legacy and shade switches. Idle tests use 60 set edits, 40 element edits, latest-draw protection and 16/900/2500/6000 ms frame gaps; a release-at-bust control deliberately retains multiple sets. Final garage integration is only a regex ordering pin.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 36 | a colour is built once and reused | 39–46 |
| 49 | the cache is capped and frees the OLDEST colour's mesh | 53–57, 60, 63–64 |
| 67 | no GaragePrims: nothing is built or cached | 73–74 |
| 78 | the spin-blur disc is one shared two-sided annulus, built once, hub dark and lip light | 81–82, 85–86, 89, 92–94 |
| 102 | colour keys: a hit per array, the same mesh for an equal new array, a rebuild when the array is edited in place | 106–109, 112–118 |
| 133 | decal mesh: memoised per parts object, invalidated by every other input, and equal to the string path | 138–142, 145–147, 150, 153–155 |
| 158 | aero flap mesh: the memoised key per record is the string key, and colour / finish edits rebuild | 163–165, 168–175 |
| 178 | cockpit wheel and cabin: the same livery object is an early hit; a new object takes the string path | 183–184, 187–189, 192–195 |
| 211 | aero flap sets: N garage edits leave one paint job resident, not N; a set drawn every frame stays | 218, 222–227 |
| 230 | aero flap elements (the opening wings): idle colours are released too | 244–245 |
| 248 | a frame longer than the idle window never frees the set it just drew (no relink on a part pick) | 253–254, 258 |
| 261 | the race path never releases: without a releaseIdleFlaps call (or without a clock) the FIFO cap alone applies | 265, 268 |
| 275 | release-since-bust leaves exactly the drawn paint job, whatever the frame gap | 291–292, 295 |
| 298 | the garage releases flaps on the first frame after a livery or parts edit busts the preview | 300 |


## car-multi-shot-tools.test.mjs

Fixture: Comment-stripped tool text plus child-process --plan/--help/list calls; imported canonical camera tables; real Teams VM and customization catalog. No child capture or browser action is invoked by this map.

Production targets: tools/car/render-car.mjs; tools/shot/garage-angles.mjs; tools/shot/lib/garage-camera-catalog.mjs; tools/shot/probe-page.mjs; tools/car/carshot.mjs; tools/car/lib/customization-plan.mjs:5,11,39,53; js/agent/apex.js garageFrame; js/garage/setup-camera.js; js/car/liveries.js.

What the assertions establish and limit: Source checks constrain shared capture paths, waits, one-browser walks, output names and hook wiring. Executed plan cases prove Cartesian products, zip/ranges, degree/radian conversion, stations/targets/lamps, seats/base lists, DPR/viewports, presets, discovery read-only output, budgets and rejection of unknown team/body/finish/unavailable/style values. They do not prove screenshot meaningfulness, browser-free timing, browser count, pixels, real room collision or capture success: most such claims are text pins. Equipment eye bounds are reconstructed from planned orbit parameters. Customization counts use canonical registry sizes; all style enums are propagated and rejected when invalid.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 32 | render-car has a spine preset and repeatable --shot customs | 34–38, 41–46 |
| 49 | render-car walks a team LIST in one browser, and grids the sheet by team | 54–57, 60–63 |
| 66 | garage-angles defaults to spine group and soft-captures via probe helpers | 68–75, 79–82 |
| 85 | garage-angles --aero walks same-camera corner/straight without stealing the view | 87–90, 95–100 |
| 103 | garage-angles --help exits 0 without launching Chromium | 109–112 |
| 115 | settleGarage batches steps in one evaluate | 119–121 |
| 124 | openGarage pins store.team as a numeric index | 128–130 |
| 133 | screenshotPresentedCanvas is soft-first then optional timed CDP | 135, 138–139, 142–146 |
| 149 | screenshotGameCanvas prefers #game-soft before freezing for CDP | 155–157 |
| 160 | carshot uses native pixels or soft→CDP with a proportional centre crop | 162–167 |
| 170 | garage-angles walks any Liveries.FIELDS axis, not two hard-coded ones | 185–192 |
| 196 | liveries.js publishes ONE field list and forTeam consumes it | 200–202, 205–210 |
| 213 | garage-angles labels frames and can A/B a ref without touching the tree | 221–228 |
| 231 | garage-angles reports per-phase timing and reads the loadavg | 235–239 |
| 242 | a preset is a bundle of plain flags, and a named camera is parameters | 249–253, 257–278 |
| 281 | garageFrame takes an absolute camera, not only counted clicks | 284–294 |
| 297 | every garage camera preset is one a PLAYER can reach | 305–307, 311, 314–316 |
| 320 | garage-angles multi-team rollup uses __apex fast path from PR #96 port | 322–327 |
| 330 | garage-angles walks CAMERAS as lists — views × az × el × dist × zoom × pan × viewport | 338–343, 348–365 |
| 368 | garage-angles: ranges, targets, lamps, seats, DPR, all, base lists and a budget are all axes | 375–385, 389–405 |
| 408 | garage-angles: stations, field→station picking, pairs, flat art, a free camera and a session | 415–433, 437–450, 453–457 |
| 473 | garage-angles plan: no flags is the spine group for one team; --team accepts = and a space | 475–479 |
| 482 | garage-angles plan: --team=all[+custom] walks the real roster, rolled up, and a junk id is refused | 485–492 |
| 495 | garage-angles plan: numeric lists expand, a camera key names only what was set, DPR/target/lamp/station are axes | 496–511 |
| 514 | garage-angles plan: presets are bundles of plain flags; none and list are first-class | 516–528 |
| 531 | garage camera catalog: bay is a base view plus an absolute orbit, bayFront the opposite diagonal | 532–535 |
| 539 | garage discovery finds equipment by purpose without opening/resetting output; presets plan bounded distinct subjects | 541, 545–552, 557–560, 564–565, 568–573 |
| 576 | customization audit plans every part, body and finish without a browser | 580–583, 586–590 |
| 593 | customization audit carries fixed body, finish and part selections through category sweeps | 597–602 |
| 606 | every cosmetic style field is enumerable, validated and carried by capture plans | 610, 613–616, 619 |


## car-presentation-canary.test.mjs

Fixture: Read game/custom-team/agent/shadow/camera sources; fnSource/gameSource/symbolSource extract bounded functions; wheel material literals evaluated in VM.

Production targets: js/game.js renderPosOf/playerAnchor/updateCar/coast/draw loop/makeCars; js/car/car-draw.js; js/render/shared/shadow-pass.js; js/career/custom-team.js; js/agent/apex-cam.js and agentview.js; agent error modules.

What the assertions establish and limit: All twelve are structural canaries, including source-order and one-site assertions, not live pose/render tests. They require shared world-pose treatment, skid-before-continue, no xVis damping, post-advance AI mirror, body+grounded wheels, custom-team structural livery, error-result strings, shared caster gates/keys and mirror wheel opts. Named misfiled pins remain visibly classified; no ownership or historical bug claim is inferred.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 26 | render interpolates world px/pz for every car, not only humans | 30–36 |
| 43 | the player's skid stamp precedes the cockpit-rig continue | 48–50 |
| 53 | xVis is a dump field — render and shadows do not damp it | 55–62 |
| 65 | AI world pose is mirrored after this step's (s, x) writes | 68, 71–78 |
| 85 | the draw loop draws body + planted wheels for every procedural car | 89, 93–95, 98–102 |
| 109 | MY TEAM foreign-tab sync and the customize preview keep the structural livery (misfiled pins) | 111–122 |
| 125 | agent error strings (misfiled pins) | 126–129 |
| 132 | orbit / agent-view read the mirrored world pose for the field | 135–139 |
| 146 | the shadow passes and the race warm share one caster gate and key | 149–153 |
| 160 | the mirror's wheel material is the main pass's, night term included | 162–166 |
| 173 | makeCars and the menu prep stamp cars through the one carVisual helper | 176–181 |
| 188 | the first-person caster is pinned to the car loop's cockpit branch | 190–198 |


## car-presentation-vm.test.mjs

Fixture: tests/helpers/car-draw-vm.mjs:35–170 loads real CarDraw, FieldLod, MirrorPass and real team roster; Car3D/Parts/track/DOM/gfx are stubs. Some cases load real vantage + ShadowPass or real Car3D; extracted lens/LRU/flap functions execute with explicit dependencies.

Production targets: CarDraw.create/carVisual → js/car/car-draw.js:33,24; mirror → js/render/shared/mirror-pass.js; shadow → js/render/shared/shadow-pass.js; vantage → js/camera/vantage.js; extracted drawAeroFlaps → js/game.js; real geometry exception → js/car/car3d.js:237.

What the assertions establish and limit: Warm rig charges synthetic 20–40 ms costs and schedules microtasks: one-heavy-piece, cancellation and deferred-drain assertions prove ordering/work partition, not measured frame times. Career/legends/custom-hire menu→race→mirror/PiP checks demand zero later builds/frees under recording counters. First-person cases compare exact Float32 cockpit transforms versus banked ground transforms, car/lamp modes, and actual whole-car/no-driver/own-halo build options; the separate real-geometry case verifies retained assemblies and halo deltas. LRU oracle compares 4000 seeded keys at capacity five. Decal memo keeps 32 states per team and keys legality. Lifecycle cases distinguish stale generation callbacks, adoption, failed GLB conversion/upload, reentrant invalidation and retry. Illustrative model URLs in fixtures denote stubbed fetch results, not repository assets.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 30 | factory invalidation frees both shared rival LODs and rebuilds the far body | 36–38, 41–42, 45, 48–49 |
| 52 | factory invalidation cancels a queued far rival decimation | 59–61, 65–66 |
| 69 | adopting a GLB releases the shared and far procedural rival bodies | 74, 77–80 |
| 83 | a failed synchronous far rival warm can retry on the next warm | 92–95 |
| 98 | a failed idle far rival build can retry on the next far draw | 107, 110–111 |
| 122 | the cockpit lens draws the live mirror glass XOR the sky-tint fallback | 146–151, 154–156, 161–163, 167–174 |
| 182 | the mirror and the PiP draw every car's flap set, still, one call per body | 191, 194–198, 202, 208, 214 |
| 221 | carVisual: a career shelf equal to the works build keys the factory; an upgrade keys its own build | 227–233 |
| 242 | a career field and MY TEAM's hire: after the menu prep, race entry builds no body and no caster | 250, 255–256, 265–267, 289–291 |
| 318 | warmCarAssetsAsync builds exactly warmCarAssets' set, one heavy piece per task | 322–337 |
| 342 | warmCarAssetsAsync deferRear: the rear grid's uploads and casters wait for the countdown drain | 346–353, 358–366 |
| 368 | warmCarAssetsAsync stops when current() goes false; carWarmSlice=0 is today's single task | 375–376, 382–386 |
| 389 | the menu prep solves the rivals' flaps and builds their planted wheels (carWarmSlice); race entry's lod phase hits | 394–398, 402–403, 410 |
| 418 | the bounded team caches hold the menu prep, the race warm and the mirror with nothing evicted | 431–434, 438, 443–444 |
| 453 | putBoundedMesh's stamp LRU evicts exactly what the old reorder-on-hit LRU did | 479–483 |
| 496 | first-person views cast the first-person caster at the cockpit matrix; exterior views the silhouette at the ground matrix | 532, 535, 549–552, 556, 561–562, 567 |
| 579 | the first-person caster is the whole car minus the driver, with the player's own halo | 591–592, 595–599, 615–619, 623–627, 631–632 |
| 642 | A-H3: drawAeroFlaps draws through CarDraw.coOpt — coalesced on TLX, the bag itself elsewhere | 644, 659–660, 666–672, 676–679 |
| 683 | custom decal recipes retain 32 recent states per team and re-resolve legality changes | 694–704, 707, 710–711 |
| 720 | team meshes: painted and body-only key per seat, the caster per team, and a repeat is a hit | 725, 729–731, 734–737, 740–742, 745–746 |
| 751 | a car on its own shelf builds its own body and its own caster; the factory car shares the team's | 758, 763–766 |
| 772 | warmCarAssets builds casters only where a shadow pass will fetch them | 784–790, 794–798 |
| 801 | with no car or lamp map, resolvePlayer builds no first-person caster | 818, 821 |
| 842 | shared rival cache: invalidation releases both LODs and rebuilds the far body | 847–848, 852–853 |
| 856 | shared rival cache: a stale idle callback cannot consume the next generation | 862–866 |
| 869 | shared rival cache: synchronous warm supersedes idle work without a second build | 874–877 |
| 880 | shared rival cache: GLB adoption releases both LODs and cancels pending work; failed loads preserve them | 887–894 |
| 898 | shared rival cache: invalidation during mesh creation discards the unadopted far mesh | 909–910 |
| 913 | shared rival cache: a failed far upload keeps its source and retries on the next far draw | 920–924 |


## car-shade.test.mjs

Fixture: Own VM loader with/without CarShade; fake storage/URL; real Car3D/Parts/Teams and isolated rear-light constants. Synthetic lofts, triangles and closed-solid collectors plus factory/extreme recipes.

Production targets: CarShade → js/car/car-shade.js:50 (smooth at :795); Car3D.build → js/car/car3d.js:237; body anchors and foil helpers forwarded through js/car/car-body-geom.js:17; wheels → js/car/car-wheels.js; rear-light datums → js/car/car-mesh.js.

What the assertions establish and limit: Geometry checks assert envelope, positive normals/volume and paired directed edges, not raster appearance. OFF equals omitted-module geometry; per-build smooth:false excludes tyre normal equivalence, whereas stored opt-out includes tyres. CPU usage is measured, despite the adjacent budget comment calling it wall-clock; threshold still scales by capped loadavg/core. Near cover increases ring density while both LODs retain COVER_Z; no longitudinal densification is asserted. Ramp/pinch checks sample factory/extreme recipes and boundaries, not every continuous recipe. Helper assertions at 338–350 apply to primitive and cover tests.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 49 | the rounded section keeps the trapezoid's envelope: top, bottom and mid-flank are where the flat faces were | 54–64 |
| 68 | the section is flat-topped (a real nose), rounder underneath, and sink() says where its top has fallen | 74–78 |
| 81 | a livery nose cap wraps the rounded nose: every point a few mm proud, none poking out | 91–93 |
| 96 | the loft is closed and every face points out | 108, 117 |
| 120 | the rounded sidepod is closed, faces out, and keeps the flank flat where the sponsor decal sits | 131, 136–139, 150, 159 |
| 176 | smoothing merges a shallow facet, keeps a 90 degree edge sharp, moves no vertex and leaves lights flat | 182–185, 189, 193 |
| 196 | the switch: ON by default; storage or URL picks every car, one team, or none, and an opt-out sticks | 198–202, 206–221 |
| 224 | Car3D: OFF is the build that never heard of CarShade; ON (the default) is finite, unit-normal and in the same bounds | 233–235, 240, 248–250, 253, 260, 273–275, 280, 286–287 |
| 290 | a shadow caster (silhouette build) keeps the rounded shape but skips the smoothing pass: depth never reads normals | 307–309 |
| 312 | tyres, with the switch on for any car: the tread shoulder is shaded from its real shape, same geometry, unit normals | 317, 320–326 |
| 353 | small-part primitives are closed solids that face out: strut, bent pipe, rounded block, C tub, plate, tunnel, floor | 374 |
| 381 | a block rounded all the way runs through its faces' centre lines; fine() keeps the points it was given | 386–387, 390–392 |
| 395 | earcut covers a non-convex polygon exactly once | 400–403 |
| 406 | the rounded car keeps what is placed against its small parts: endplate board, light and crown; mirror light; floor clear of the rear tyre; headrest clear of the helmet | 426–434, 446–447, 450–452 |
| 459 | rounded recipe headrest pads (styles 1–2) are denser pipes that still clear the helmet | 467, 472, 477–479 |
| 495 | bodyAnchors(.., false) is today's anchors for every factory car at every spine height | 501–505 |
| 510 | the downwash ramp: only pod TOPS aft of z -0.38 drop; floors at bottom + 0.03, inner top never under the cover's bottom + 0.01 | 514, 517–524, 529–530, 535–538 |
| 541 | the coke pinch narrows the cover's FOOT only: exact at both ends, never wider, deeper with coke, crown and shoulder untouched | 547, 551–558, 562–565 |
| 568 | the rounded engine cover is one closed, outward skin at CarShade.COVER_Z, and the build draws it there | 569, 572, 578, 589–590 |
| 596 | garage/near densifies the engine cover; mid/far LOD keep the cheap loft | 599–603, 621–622, 636–637 |
| 644 | a coloured livery halo is painted; a grey or untinted one stays metal | 651, 656–660 |


## car-wheels-w13d.test.mjs

Fixture: loadParts real mesh builds; McLaren default setup varied only in two tyre styles and their medium/soft equivalents.

Production targets: tools/car/parts-sweep.mjs loadParts/buildCar/compare/THRESHOLDS → Car3D wheel geometry in js/car/car-wheels.js, composed by js/car/car3d.js.

What the assertions establish and limit: Loop registers two cases. Hausdorff >=20 mm, moved area >=0.010 square metres and <=1.6× baseline triangles are geometric visibility proxies; the comment about unchanged glyph count has no direct count assertion.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 16 | tyres/style ID ΔHaus ≥ 20 mm vs equivalent | 20–26 |


## car-wing-foil.test.mjs

Fixture: Flat VM intentionally omits CarShade; real Car3D/Parts/Teams; checked-in measured triangle baseline; carDrawVm for caster key check. Synthetic foil/beam recipes and wheel-deflector variants.

Production targets: Car3D.buildFlapGeom → js/car/car-body-geom.js:750; Car3D.build → js/car/car3d.js:237; CarGeometry.create/addBeamBetween → js/car/car-geometry.js; baseline → tests/data/car-wing-foil-tris.json.

What the assertions establish and limit: Exact fixed counts plus baseline inventory and 1.6× option ceiling; only eight heaviest and every twelfth option are rebuilt in normal mode. Optional --update writes the baseline after checking ceiling; it was not invoked. Knife-edge samples/counts do not prove full manifold closure despite a test title saying closed foil. Recipe-zero checks compare index lengths and positions, not all streams. Source-only body/halo datums remain text pins. Beam section dimensions tested at two thicknesses/three orientations; deflector variants must append one stationary pair, leave wheel layers unchanged and match full/split geometry.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 80 | foil samples a knife trailing edge and splits the outboard span | 91, 95, 104–106 |
| 109 | wing elements stay knife-thin (not 32 mm planks) | 112–115 |
| 119 | one flap is a closed foil, not a 48-triangle plank | 125 |
| 128 | twist and teCurve reshape a flap without adding triangles | 135–137, 150–152 |
| 155 | TEAM_STYLE carries a per-team wingStyle | 156, 160–161 |
| 164 | default body, cockpit, busiest helmet and wheels match the measured budget | 169–171 |
| 174 | every recipe option has a measured count, none beyond 1.6x the default (sampled live) | 176–178, 188 |
| 191 | a shadow silhouette keeps the helmet shape without paint-split cost | 195–196, 199, 204–205, 211–214 |
| 217 | 2026 duct/board/slot knobs are inert at 0 and each deforms the mesh | 233–238, 241, 248 |
| 253 | 2026 body keeps a scooped pod, floor teeth, under-fences and a round halo | 254–258, 263–266, 273–275 |
| 278 | recipe-gated part knobs are inert at 0 and each deforms the mesh | 308–309 |
| 313 | factory SIGNATURE wings stay heavier than a stripped low-drag kit | 320–321 |
| 325 | beam cross-section scales linearly on both axes in every orientation | 338, 343–344 |
| 350 | fixed front deflectors occur once in both full and split race cars | 363–370 |


## career-ai-dev.test.mjs

Fixture: Real Parts/Teams/Regulations/CareerAiDev in isolated VMs with seeded logging and stub Career cap; deterministic rnd. makeCarsBoot extracts real makeCars with real DriverRatings, catalog and development but stub UI/race helpers and pace.

Production targets: CareerAiDev → js/career/ai-dev.js:13; fittedOf:51, worksSetup:62, pickStep:87, developWinter:116, scrubFitted:157; integration → js/career/career.js rollover and js/game.js makeCars.

What the assertions establish and limit: A forced winter proves at least one fitted category differs and every resolved option is legal; the title says one step, but this case does not count changed categories. Ban tests distinguish raw owned/shelved works IDs from legally resolved setup; four banned winters, recovery and legacy scar healing are exercised. RNG spy requires explicit dice year/tag; rollover is source-order only. makeCars integration checks natural suspension gain once, unchanged save/RNG count, separate aero/ERS channels, era-safe baseline and MY TEAM player/hire tier ratios. No full season simulation or statistical development probability is established.

| Case at line | Semantic assertion map | Assertion lines |
|---:|---|---|
| 45 | absent aiParts leaves fittedOf null (factory path) | 47–48 |
| 51 | developWinter writes one legal fitted step for a developing team | 55, 63–64, 70 |
| 74 | an era ban prevents fitting a banned option | 85, 91, 94 |
| 99 | pickStep never exceeds the team cap | 105–108 |
| 111 | scrubFitted fits the best legal OWNED part over a banned one, shelves it, and restores it after the era | 125, 130–132, 135–136 |
| 140 | a works part banned by an era is the works part again once the era lapses | 145, 155, 158–162 |
| 166 | ensureSeed under an era seeds the works build and leaves the ruleset installed | 172–175, 179 |
| 183 | scrubFitted is a no-op without a ban or a shelf, and heals a pre-fix scar | 190, 196–197 |
| 200 | developWinter rolls the dice on diceYear, not career.year | 207–208 |
| 211 | rollover develops after applyRegs and keeps the dice on the year that ended | 214, 219–220 |
| 253 | makeCars credits natural suspension development once and leaves controls unchanged | 264–274 |
| 277 | makeCars keeps aero and ERS on dedicated channels and respects era resolution | 288–289, 294 |
| 297 | makeCars preserves MY TEAM saved-build hire ratio and player tier | 303–304 |

