# Unit group 29 — complete semantic map

Read-only mapping of all 23 files (4979 lines) listed in unit-batches.json group 29. Every test-file line was returned in separate bounded 80-line pages, with no page omitted; an initially truncated aggregate was re-read cleanly. No test, browser, source mutation, or commit was performed. Hashes below identify the bytes mapped, not a test verdict.

Navigation: read AGENTS.md and .claude/skills/code-nav/SKILL.md. Local apex-lsp definition calls resolved Car3D.build (237), buildWheelLayers (car-wheels 704 via alias/export), CarWheels.tints (27), CarMaterials.finishPass (183), CustomLiveries.create (70), LiveryStations.emit/paint (42/22), LiveryTex.atlasDiv (55), LoadingScreen clampCard/flyMsFor/gridLayout/metaRows/packSettled (169/70/244/97/82), FlybySeq.shotAt (1149), LobbyCodes.codeFrom (36), LobbySettings.normaliseSettings (61), LoopHealth.fault (176), SceneryNature.create (54), and Log.NAMESPACES (14). Module-file fallbacks explicitly did not establish export/caller coverage. RadioVoice.plan resolved both the real implementation (audio/radio-voice.js:234) and inert audio/stub.js:90; these tests explicitly load the real module. Source excerpts corroborated tier arithmetic, wheel tint keys, superseded texture release, settings sanitation, fault/stall constants, VM seating and lockup generation.

Rows give exact lexical case ranges and assertion call spans, then production target and semantic boundary. Dynamic templates and loops describe case families, not a claim that their runtime cases were executed. Shared helper assertions outside case callbacks are stated in fixture notes.

## Shared fixture and source seams

- tools/car/parts-sweep.mjs:96–120 loads real car modules in VM, with optional CarShade; DOM raster is outside its default mesh seam.
- tools/car/crest-sweep.mjs:313–328 loads real livery modules against RecCtx canvases; recording canvas identity/operations is not actual pixels.
- tests/helpers/car-draw-vm.mjs:35–171 runs real CarDraw/MirrorPass against stub mesh/renderer/parts, with real Teams; disposal tests further replace LiveryTex.
- tools/lib/game-vm.cjs:641–695 establishes real game facade with pinned seat, tyre wear and wind off unless overridden. It is a Node sandbox, not browser renderer evidence.
- tests/helpers/game-source.mjs:49–84 derives modules instantiated by game.js from manifest; gameSource concatenates source, symbolSource requires a unique declaration and extracts it. Source coordinates in the tests are not original-file line numbers.
- tests/helpers/css-source.mjs, css-rules.mjs supply CSS union/rule parsing; seed-log.mjs and seed-clipboard.mjs inject real helpers; abs-src.mjs supplies VM diagnostic filenames.
- tools/track/verify-track.cjs:111 buildContext provides the track engine/definition roster; lobby-settings peers add real CustomTracks but fake persistence.
- tools/check/lockup-bench.mjs:87–113 runs a real VM weather/speed/pedal/bias sweep. No sweep was run for this map.

## tests/unit/livery-paint-zones.test.mjs

Read: 1–347. SHA-256: `c271a0ef5bc253a908bb479695739452c35e3fedd155cb4f938d75151e5e8bf7`. 16 lexical case declarations.

Production: [js/car/car3d.js:237](../../js/car/car3d.js#L237); [js/car/car-materials.js:183](../../js/car/car-materials.js#L183); [js/car/car-wheels.js:27](../../js/car/car-wheels.js#L27); [js/car/custom-liveries.js:70](../../js/car/custom-liveries.js#L70). Target: Car3D.build → CarMaterials.finishPass; CarWheels.tints; CustomLiveries.create.

Fixture / semantic coverage: Real mesh arrays through loadParts; Ferrari default/works-rim and cockpit variants; local custom-livery VM uses career/store stubs. Section ranges derive from measured vertex counts (30–49), with coverage assertion at 36. TINTS (62–69), DETAIL_FINISHES (128–133), and NEW (292–293) expand field families. Geometry/material/colour isolation and garage publication are separate checks; source pins do not operate editor controls.

Limits: Mesh arrays / source wiring; no raster or UI execution.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| every new field unset, or set to inherit: mesh byte-identical | 52–59 | 55, 56, 57, 58 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| each zone tint recolours only its own sections, and only to its colour (or the heat glaze) | 71–91 | 77, 80, 82, 83, 84, 90 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| FLOOR EDGE: carbon floor parts become paint, voids stay, and every vertex is low on the car | 93–99 | 96, 97, 98 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| BRAKE DUCTS: inlet mouths (voids) stay dark | 101–106 | 104, 105 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| zone finishes: floor / suspension land their own surface id, only on that zone | 108–126 | 112, 114, 115, 116, 120, 121, 124 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| detail finishes work alone, with tint, and through inherited whole-car finish | 135–182 | 140, 142, 144, 145, 146–147, 148, 149, 153, 155, 156, 157, 162, 164, 165, 166, 170, 177, 178–179 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| detail deflector finish is inert without the part and effective on WORKS RIM | 184–199 | 186, 187, 189, 193, 195, 196, 197 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| cockpit finish protects harnesses, carbon trim, voids and controls in driver-eye geometry | 201–235 | 206, 208, 209, 210, 213, 225, 226–227, 230, 233 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| NOSE FINISH: only painted vertices ahead of the bulkhead, on chassis / hood / livery | 237–252 | 241, 243, 244, 245, 246, 250, 251 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| DEFLECTORS: tints the over-wheel deflectors (WORKS RIM fits them), nothing without them | 254–263 | 255, 258, 260, 261 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| cockpit build: COCKPIT SURROUND dims a pale tint like every other cockpit livery paint | 265–270 | 268, 269 | Car3D.build → CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| RIM FINISH: rim faces take the finish surface; unset wheels are byte-identical | 272–290 | 274, 275, 277, 278, 281, 285, 287, 288, 289 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| GRIPS: getCockpitWheel keys on gripTint only when it is set | 295–299 | 297, 298 | CarMesh.getCockpitWheel cache / grip colour | Static wiring/shape contract; no flow execution. |
| every new field is published, copied, offered in the garage, hinted and filed in an editor section | 301–317 | 305, 306, 307, 308, 309, 312, 315, 316 | Liveries.FIELDS; custom-liveries; setup-sheet; editor | Static wiring/shape contract; no flow execution. |
| a null identity value reads as an empty custom list and resolveLivery does not throw | 336–341 | 338, 340 | CustomLiveries.getCustomLiveries / resolveLivery | Mesh/recording contract; no GPU or raster evidence. |
| a stored array of custom liveries still comes back untouched | 343–347 | 346 | CustomLiveries.getCustomLiveries / resolveLivery | Mesh/recording contract; no GPU or raster evidence. |

## tests/unit/livery-sidewall.test.mjs

Read: 1–132. SHA-256: `1df854dd013fd9ba5d3943d54e43e0c0512ff32a576f787d0a46f98063687ee6`. 7 lexical case declarations.

Production: [js/car/car-wheels.js:27](../../js/car/car-wheels.js#L27); [js/car/car-wheels.js:704](../../js/car/car-wheels.js#L704); [js/car/car3d.js:237](../../js/car/car3d.js#L237). Target: CarWheels.tints / buildWheelLayers; Car3D.build.

Fixture / semantic coverage: VM loads real wheel/body modules (15–19), factory setup and synthetic double-letter tyre (20–26). Helpers 28–40 compare colour changes independently of positions/normals/material/index arrays. Bare tyre adds a ring, unlike existing-letter recolouring.

Limits: Array equality means current-call equivalence, not an archived golden mesh; source pins only for editor/draw call sites.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| tints(): sidewallInk parses (array and #rrggbb), joins the key, and unset leaves the key empty | 42–52 | 43, 44, 46, 47, 48, 49, 51 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| unset ink: standalone wheels are byte-identical to today's call | 54–58 | 57 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| set ink: only lettering vertices recolour, all to the ink; the compound band keeps its colour; geometry unchanged | 60–83 | 62, 63, 65, 68, 71, 78, 80, 82 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| a tyre option with no lettering gets one inked ring only when sidewallInk is set; its band is untouched | 85–95 | 89, 91, 93, 94 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| ink composes with rim/caliper tints on disjoint vertices | 97–102 | 100, 101 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| Car3D.build: no ink = byte-identical car; ink changes only wheel-vertex colours on all four wheels | 104–121 | 107, 108, 110, 112, 117, 120 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| wheel mesh call sites pass the ink and the editor has the row (source pins) | 123–132 | 127, 128, 129, 130, 131 | car-draw / car3d / cockpit-preview / editor | Static wiring/shape contract; no flow execution. |

## tests/unit/livery-stations.test.mjs

Read: 1–208. SHA-256: `963811f76acb82e9a9b32128cc0eeb006248974b6ca4e12129c6e6e8e6a652b6`. 11 lexical case declarations.

Production: [js/car/livery-stations.js:22](../../js/car/livery-stations.js#L22); [js/car/livery-stations.js:42](../../js/car/livery-stations.js#L42); [js/car/car-mesh.js:372](../../js/car/car-mesh.js#L372). Target: LiveryStations.emit / paint / haloOf; CarMesh.carDecalData.

Fixture / semantic coverage: Real VM modules (12–26); capture records emitted quads with fixed 2048×2560 UV mapping (29–40). segDist (70–74) measures hoop clearance. Team loop covers current Teams.LIST; custom body-style IDs cover sculpted roofs.

Limits: Fit/UV/winding arithmetic and recording paint hooks; no texture raster or visible decal sign-off.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| new regions sit inside the atlas and overlap no other region | 42–55 | 46, 47, 53 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| halo literals stay in lockstep with the hoop car3d builds | 57–68 | 60, 61, 62, 63, 65, 66, 67 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| halo strip lies 0-4 mm proud of the tube, on the crown bar only | 76–95 | 82, 88, 89, 93 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| cockpit-side code lies 5 mm proud of the monocoque's raked flank | 97–110 | 100, 107, 108 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| nose-tip cap and sidepod-top band follow their anchors on every team | 112–131 | 116, 118, 120, 123, 126, 128 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| all 11 chassis still build and every car maps the four new decal regions | 133–149 | 136, 142, 145, 147 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| every station quad winds counter-clockwise about its normal, like every other decal | 151–160 | 158 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| driver code comes from the race number, else the team short name | 162–166 | 163, 164, 165 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| each station has a livery ON / OFF, and OFF paints nothing in its region | 168–183 | 176, 178, 179, 182 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| the sidepod-top sponsor is inked against the SIDEPOD colour, not the primary | 185–195 | 191, 194 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |
| on sculpted bodies the sidepod-top band drapes the roof's channel and crown | 197–208 | 200, 202, 205 | LiveryStations.emit / paint / haloOf | Mesh/recording contract; no GPU or raster evidence. |

## tests/unit/livery-swatch-cache.test.mjs

Read: 1–69. SHA-256: `82900d43b2697ec1b62e18fb38c0254ec23a5ad5875cca90eda40e483156ebf6`. 6 lexical case declarations.

Production: [js/car/liverytex.js:2600](../../js/car/liverytex.js#L2600); [js/car/liverytex.js:2622](../../js/car/liverytex.js#L2622); [js/car/liverytex.js:931](../../js/car/liverytex.js#L931). Target: LiveryTex.paintSwatch / swatchCanvas / setTeamLogo.

Fixture / semantic coverage: loadCrests plus RecCtx records painting; dest (16) counts only blits. Stable livery values, team and size determine identity; build epochs distinguish reuse from two simultaneous DOM cards.

Limits: Canvas identity and recorded operations prove cache contract; no timing or real DOM adoption measurement.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| a repeated swatch is painted once and blitted after | 18–27 | 21, 22, 25, 26 | LiveryTex.paintSwatch / swatchCanvas / setTeamLogo | Mesh/recording contract; no GPU or raster evidence. |
| a different livery, team or size is its own entry | 29–37 | 35, 36 | LiveryTex.paintSwatch / swatchCanvas / setTeamLogo | Mesh/recording contract; no GPU or raster evidence. |
| a logo change drops every cached card | 39–44 | 43 | LiveryTex.paintSwatch / swatchCanvas / setTeamLogo | Mesh/recording contract; no GPU or raster evidence. |
| swatchCanvas hands the same painted canvas to the next build's card | 48–56 | 49, 53, 54, 55 | LiveryTex.paintSwatch / swatchCanvas / setTeamLogo | Mesh/recording contract; no GPU or raster evidence. |
| two cards with one look in the same build get two canvases | 58–63 | 61, 62 | LiveryTex.paintSwatch / swatchCanvas / setTeamLogo | Mesh/recording contract; no GPU or raster evidence. |
| a logo change drops the kept card canvases too | 65–69 | 68 | LiveryTex.paintSwatch / swatchCanvas / setTeamLogo | Mesh/recording contract; no GPU or raster evidence. |

## tests/unit/livery-tex-dispose.test.mjs

Read: 1–155. SHA-256: `5ed591c62e98745599449dd94c1b5dbce8793e46acf0cf95a78f7decdded0c9a`. 3 lexical case declarations.

Production: [js/car/car-draw.js:486](../../js/car/car-draw.js#L486); [js/car/car-draw.js:498](../../js/car/car-draw.js#L498); [js/car/car-draw.js:679](../../js/car/car-draw.js#L679). Target: CarDraw.dropSupersededFittedAtlases / invalidateDecalTextures / deferred atlas lifecycle.

Fixture / semantic coverage: carDrawVm records texture build/free; rig 16–58 replaces LiveryTex, renderer and idle queues. atlasMB 12–15 estimates RGBA+mips by 4/3, with previews retained until next bind. SAVE & FIT minted IDs and draft-only invalidation emulate the garage.

Limits: Object accounting and approximate MB, not GPU allocation measurement; CANCEL preserves saved handle; four saves bound accumulation.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| SAVE & FIT new id disposes the previous fitted hi-res atlas (#3609) | 62–112 | 71, 72, 88, 104, 105, 106, 107, 108, 111 | CarDraw.dropSupersededFittedAtlases / invalidateDecalTextures / deferred atlas lifecycle | Mesh/recording contract; no GPU or raster evidence. |
| CANCEL still keeps the saved hi-res (draft keys only) | 114–131 | 120, 129, 130 | CarDraw.dropSupersededFittedAtlases / invalidateDecalTextures / deferred atlas lifecycle | Mesh/recording contract; no GPU or raster evidence. |
| repeated SAVE & FIT edits do not stack undisposed hi-res atlases | 133–155 | 151, 152, 154 | CarDraw.dropSupersededFittedAtlases / invalidateDecalTextures / deferred atlas lifecycle | Mesh/recording contract; no GPU or raster evidence. |

## tests/unit/livery-tier.test.mjs

Read: 1–592. SHA-256: `442c582f3066f2705fd7c12bf634c313b7424c4260a7cf18ae3d2aa81662a52e`. 25 lexical case declarations.

Production: [js/car/liverytex.js:31](../../js/car/liverytex.js#L31); [js/car/liverytex.js:55](../../js/car/liverytex.js#L55); [js/car/car-draw.js:532](../../js/car/car-draw.js#L532); [js/car/car-draw.js:679](../../js/car/car-draw.js#L679). Target: LiveryTex atlas tier policy; CarDraw photo/deferred atlas cache.

Fixture / semantic coverage: atlasBytes 41–48 computes exact rectangular mip-chain bytes. decalRig 172–220 extracts the real decal section into Function with fake textures/idle and a synthetic grid (221–226); paintAtlasWidths 424–453 uses recording canvases; logo race uses FakeImage. Opt-in C-P3 is a real Chromium/WebGL2 upload/readback comparison (521–592).

Limits: Most rows are arithmetic/source/recorded policy, not pixels or real GPU memory. C-P3 requires APEX_LIVERY_PARITY; ≤1 LSB is allowed despite byte-for-byte title; no probe was run.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| the authored atlas is the size the memory arithmetic assumes | 50–57 | 51, 52, 56 | LiveryTex atlas tier policy | Pure tier/mip arithmetic; no allocation measurement. |
| desktop: player preview is 1024, hi-res is 2048, AI stays 512×640 | 59–68 | 60, 61, 62, 64, 65, 66, 67 | LiveryTex atlas tier policy | Pure tier/mip arithmetic; no allocation measurement. |
| mobile keeps the same absolute upload sizes as the 1024-era policy | 70–77 | 72, 73, 74, 75, 76 | LiveryTex atlas tier policy | Pure tier/mip arithmetic; no allocation measurement. |
| a phone on GRAPHICS: HIGH keeps AI cars at the phone size (M-10); the player follows the tier | 79–91 | 81, 82, 83, 84, 85, 86, 89, 90 | LiveryTex atlas tier policy | Pure tier/mip arithmetic; no allocation measurement. |
| the desktop grid stays well under the old every-car-full figure | 93–106 | 101, 102, 103, 104–105 | LiveryTex atlas tier policy | Pure tier/mip arithmetic; no allocation measurement. |
| a tier is never bigger than the one above it | 108–117 | 110–111, 112–113, 115–116 | LiveryTex atlas tier policy | Pure tier/mip arithmetic; no allocation measurement. |
| photo mode routes every drawn car through the lazy full-tier picker | 119–135 | 123–124, 129–130, 131–132, 133–134 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| desktop player hi-res atlas upload is deferred off boot and garage-open | 137–165 | 140–141, 142–143, 144–145, 146–147, 148–149, 150–151, 152–153, 154–155, 156–157, 158–159, 160–161, 163–164 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| a phone at GRAPHICS: HIGH never schedules the 2048 player atlas | 230–238 | 233, 235, 236, 237 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| browsing to another team abandons the queued 2048 player atlas | 242–252 | 248, 251 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| sync player atlas is preview; hi-res lands only after idle flush | 254–266 | 258, 259, 260, 261, 263, 264, 265 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| a starved idle callback re-queues instead of painting 2048 | 268–278 | 271, 273, 274, 275, 277 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| L10: a livery switch before the idle slot never stores the new livery's atlas under the old key | 282–296 | 289, 290, 294, 295 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| L10: invalidate + re-mint under one key leaves exactly one live kick, built from the fresh livery | 298–308 | 305, 307 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| hi-res swap does not free prev while a material still holds it | 310–320 | 315, 317, 319 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| invalidate frees both the live atlas and a parked hi-res-swap preview | 322–337 | 331, 332, 334, 335, 336 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| entering photo mode on a grid builds ONE player-tier atlas a frame, nearest the camera first | 339–355 | 344, 347, 348, 349, 351, 353, 354 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| the photo set follows the camera, and closing photo mode frees every photo atlas | 357–376 | 366, 367, 369, 373, 374, 375 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| photo rivals never mint a :hi atlas; only the real player does | 378–391 | 386, 389–390 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| the decal cache evicts the least recently drawn atlas, never the live field | 393–403 | 399, 400, 402 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| the decal cache keys on the tier, which is what makes the upgrade cheap | 405–412 | 410–411 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| drawCarDecals re-reads _decalTexCache every frame via decalTextureFor | 414–422 | 417, 418, 420, 421 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| sync getCarDecalTexture path never creates a canvas wider than SIZE/div | 455–472 | 461, 462–463, 466, 467–468, 470, 471 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| M28: an emblem that finishes decoding after CLEAR or a newer upload never reinstalls | 476–509 | 491, 493, 495, 499, 502, 503, 508 | LiveryTex atlas tier policy | Mesh/recording contract; no GPU or raster evidence. |
| C-P3: ImageBitmap upload == canvas upload, byte for byte (Chromium, APEX_LIVERY_PARITY=1) | 521–592 | 581, 582, 583, 584, 585, 586, 587 | LiveryTex atlas tier policy | Opt-in WebGL2 pixel parity; 1 LSB tolerance; not run. |

## tests/unit/livery-wheels.test.mjs

Read: 1–109. SHA-256: `e0af0a1345870881f587431bbbda79bd6c1241072d8c76bc9453c677fe72d7ff`. 7 lexical case declarations.

Production: [js/car/car-wheels.js:27](../../js/car/car-wheels.js#L27); [js/car/car-wheels.js:704](../../js/car/car-wheels.js#L704); [js/car/car3d.js:237](../../js/car/car3d.js#L237). Target: CarWheels.tints / buildWheelLayers; Car3D.build.

Fixture / semantic coverage: Factory parts in real VM modules 15–23; colDiff and wheelsOf (26–40) isolate rim/caliper colour from geometry and fixed layers; full car locates all four wheel corners.

Limits: Current-call equivalence and spatial colour isolation; no appearance/contrast or real cache operation for source-only rows.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| tints(): unset is the shared empty record with an empty cache key | 43–49 | 46, 48 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| tints(): arrays and #rrggbb parse, and the key tracks the colours | 51–58 | 53, 55, 56, 57 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| unset tint: standalone wheels are byte-identical to today's call | 60–65 | 64 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| set tint: wheel colour arrays change, geometry and surface ids do not; rim and caliper hit disjoint vertices | 67–78 | 71, 74, 75, 76, 77 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| Car3D.build: no tint = byte-identical car; tint changes only wheel-vertex colours | 80–95 | 82, 83, 85, 89, 90, 94 | CarWheels.tints / buildWheelLayers | Mesh/recording contract; no GPU or raster evidence. |
| wheel mesh caches key on the tints (source pins) | 97–104 | 99, 100, 101, 102, 103 | CarWheels.tints / buildWheelLayers | Static wiring/shape contract; no flow execution. |
| editor: WHEELS & BRAKES section carries rimTint and caliperTint rows | 106–109 | 107, 108 | setup-sheet / livery-design-editor | Static wiring/shape contract; no flow execution. |

## tests/unit/livery-zone-finish.test.mjs

Read: 1–142. SHA-256: `6962b93e3cc938c38767b23a90363d427707d64a3d09455c816c93d807db6933`. 9 lexical case declarations.

Production: [js/car/car3d.js:237](../../js/car/car3d.js#L237); [js/car/car-materials.js:183](../../js/car/car-materials.js#L183). Target: Car3D.build / CarMaterials.finishPass.

Fixture / semantic coverage: loadParts Ferrari measured mesh, diffIdx 17 observes material IDs. near/ofColour 82–83 uses 0.08 channel tolerance. Whole-pod test spans all team/body styles with shading both off/on.

Limits: The early zone test only establishes nonempty disjoint material changes and array lengths; it does not itself establish contiguous section/paint-only claim in its title. Later pod-shell test checks actual sections and protected surfaces.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| unset (inherit) zone fields: mesh byte-identical | 20–26 | 22, 23, 24, 25 | Car3D.build / CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| each zone finish remaps only paint vertices, to its own surface id, in one contiguous section | 28–42 | 33, 34, 36, 37, 41 | Car3D.build / CarMaterials.finishPass | Nonempty disjoint material changes; section/paint claim not established. |
| mirrorTint recolours only mirror vertices and makes them paint | 44–59 | 46, 51, 54, 56, 58 | Car3D.build / CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| mirrorFinish alone finishes the housing (carbon -> paint -> finish) and leaves other zones alone | 61–66 | 64, 65 | Car3D.build / CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| the garage offers the three pill rows and the housing colour row, and the editor lists them | 68–78 | 73, 74, 76, 77 | Car3D.build / CarMaterials.finishPass | Static wiring/shape contract; no flow execution. |
| HALO FINISH paints an untinted titanium halo, so the finish lands on it (#2796 1) | 84–90 | 87, 88, 89 | Car3D.build / CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| SIDEPOD FINISH reaches the pod colour panel painted in the livery section (#2796 2) | 92–96 | 94, 95 | Car3D.build / CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| SIDEPOD colour paints the whole pod shell reached by its finish, not just the flank panel | 98–134 | 109, 110, 118–119, 120, 123, 124, 128, 131 | Car3D.build / CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |
| COVER FINISH reaches the stripe runs over the engine cover, not the nose run (#2796 3) | 136–142 | 139, 140, 141 | Car3D.build / CarMaterials.finishPass | Mesh/recording contract; no GPU or raster evidence. |

## tests/unit/load-order.test.mjs

Read: 1–614. SHA-256: `539518abcb910e825ea22189314c11a1a8a64120f432baecc724fac48bac43c3`. 38 lexical case declarations.

Production: [tools/manifest.cjs](../../tools/manifest.cjs); [tools/gen/gen-shell.mjs:120](../../tools/gen/gen-shell.mjs#L120); [tools/gen/gen-shell.mjs:149](../../tools/gen/gen-shell.mjs#L149); [tools/gen/gen-shell.mjs:326](../../tools/gen/gen-shell.mjs#L326); [index.html](../../index.html); [controller.html](../../controller.html); [sw.js](../../sw.js). Target: Manifest rosters/DAG and gen-shell projections/CSP.

Fixture / semantic coverage: Reads actual shell, manifest, generated artifacts and recursively scans js/tools/tests. parseTags (50–58) assumes double-quoted tag attributes; stripComments (42–44) is regex based. inlineScripts imports the generator tokenizer, while prepaint body extraction is independent. Dynamic page family 137–158 emits index/controller cases.

Limits: Static consistency/security-shape guards; no browser load, CSP enforcement, offline service-worker or loader execution. Circuit loader discovery is lexical (CIRCUITS_DIR plus VM-run markers) and can miss alternative patterns.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| index.html script sequence equals MANIFEST.FULL | 60–62 | 61 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| index.html stylesheet sequence equals MANIFEST.CSS | 64–66 | 65 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| CSP hashing ignores HTML prose but preserves script text exactly | 84–93 | 86–92 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| CSP hashing skips script-shaped text in raw text and RCDATA elements | 95–99 | 98 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| the real prepaint preferences script has its own allowed hash | 101–112 | 105, 109, 110–111 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| the shell's Content-Security-Policy is generated, first, and strict where it can be | 114–133 | 118, 119, 120, 121, 122, 123, 125, 128, 129–130, 132 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| `${page}: script-src has no 'unsafe-inline' and one sha256 per inline <script>` | 138–157 | 142, 143, 145, 147–148, 149, 150, 153, 156 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| Playwright bypasses CSP so the harness init scripts still run | 163–167 | 165–166 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| deferred stylesheets flip print→all from the hashed script, not an onload= attribute | 169–174 | 172, 173 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| every gen-shell block is byte-identical to a fresh generation | 176–180 | 178–179 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| every asset tag reads ?v=dev and the shell generation matches version.json | 182–192 | 187, 190, 191 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| controller.html carries the same apex-build generation marker as the shell | 194–201 | 199, 200 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| __APEX_BUILD is derived, not a stale literal | 203–206 | 204–205 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| shell leaves menu pinch-zoom to the user and cancels iOS double-tap / driving gestures | 208–241 | 223, 224, 225–226, 227–229, 230–231, 232, 233–234, 238–239 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| service-worker registration derives the shell build | 243–248 | 244–245, 246–247 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| every js/**/*.js appears in FULL ∪ DEFERRED ∪ LAZY_AGENT (and vice versa) | 250–267 | 265, 266 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| DEFERRED files have no <script> tag | 294–299 | 297 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| DEFERRED_EDGES are ordered within their group | 301–307 | 304, 305 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| DEFERRED_EDGES leave more than one TLX file ready at wave 0 | 309–319 | 316, 317, 318 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| sw.js seeds every DEFERRED file into its optional precache set | 321–345 | 324, 327, 342–343 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| sw.js stamps every injected asset it seeds | 351–369 | 354, 367–368 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| LAZY_AGENT files have no <script> tag | 371–377 | 373, 375 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| LAZY_EDGES are ordered within LAZY_AGENT | 379–386 | 382–383, 384 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| every circuit loader also loads the split scenery roster | 398–431 | 413, 428–430 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| LAZY_RACE files have no <script> tag | 433–438 | 436 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| LAZY_RACE_SESSION is tagless; FULL keeps the session stub | 440–448 | 442, 443, 445, 446 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| LAZY_TRACK_BUILD is tagless; TRACK_VM keeps the thirteen build files | 450–470 | 459, 461, 462, 463, 464, 468 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| the data-hub DAG orders every tab module before hub.js | 476–485 | 478, 479–480, 483 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| the track-designer DAG orders shape.js before every module that destructures it, and the screen last | 491–506 | 494, 495, 499, 504 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| sw.js optional precache does not include LAZY_AGENT | 508–523 | 517, 520, 521 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| HARD_EDGES are ordered in FULL | 525–532 | 528, 529, 530 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| circuit meta loads before the tracks engine; full defs are LAZY_CIRCUIT; game.js loads last | 534–546 | 538, 542, 543, 545 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| tools/carview.html tags equal MANIFEST.CARVIEW | 548–553 | 552 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| LAZY_XR is tagless and FULL keeps only the XR boot façade | 555–568 | 558–559, 561, 562, 566 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| FULL editor files are the picker boot half only (LAZY_EDITOR already lifted the rest) | 570–581 | 573–577, 579 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| LAZY_CAM_EDITOR is tagless; FULL keeps FlybyPanel algebra + CamTunerPanel stub | 583–593 | 586, 587, 588, 589, 591 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| LAZY_CAREER_UI is tagless; FULL keeps CareerUI stub only | 595–603 | 598, 599, 601 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |
| TRACK_VM entries exist in FULL or LAZY_TRACK_BUILD | 605–614 | 612 | Manifest rosters/DAG and gen-shell projections/CSP | Static wiring/shape contract; no flow execution. |

## tests/unit/loading-card.test.mjs

Read: 1–1132. SHA-256: `2a3f7db3a561bd0a9b7a6ef0ce7e64ec4c27b6b47c75e1383889fa935c2bf7ae`. 53 lexical case declarations.

Production: [js/ui/loading-screen.js:25](../../js/ui/loading-screen.js#L25); [js/camera/flyby-seq.js:1149](../../js/camera/flyby-seq.js#L1149); [js/audio/radio-voice.js:234](../../js/audio/radio-voice.js#L234); [js/perf/race-entry-profile.js](../../js/perf/race-entry-profile.js); [js/game.js](../../js/game.js); [css/loading.css](../../css/loading.css); [css/a11y-loading.css](../../css/a11y-loading.css). Target: LoadingScreen geometry/phases/grid/radio; FlybySeq; RaceEntryProfile; race-entry wiring.

Fixture / semantic coverage: load 43–50 rewrites const to var. harness 223–269 controls timers/Date, element dictionaries, store and announcer. gridHarness 643–699 adds real FlybySeq/RadioLines, canvas operation recording and radio stubs; modules 555–560 boots isolated real modules. ruleDecls/mediaBody inspect CSS; gameSource reads game plus manifest-derived create() modules.

Limits: Fake-clock behavioral checks plus static CSS/source pins; no actual layout, speech playback, rendering, GPU warm or presented-frame proof. Bounds and sequence timings are authored expectations; shell/source wiring rows do not execute launch routes.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| the registry is complete: every key has a range, a step, a label and a default inside it | 55–65 | 56, 59, 60, 61, 62, 63 | LoadingScreen CARD / clampCard / cardVars | Real-module VM; bounded fixture coverage. |
| clampCard fills EVERY field from anything at all — the store can hand back a fragment | 67–75 | 71, 72 | LoadingScreen CARD / clampCard / cardVars | Real-module VM; bounded fixture coverage. |
| a partial save keeps what it has and defaults the rest — it is not thrown away whole | 77–82 | 79, 80, 81 | LoadingScreen CARD / clampCard / cardVars | Real-module VM; bounded fixture coverage. |
| an out-of-range value is CLAMPED, never dropped — a card three times the screen is a card nobody can move back | 84–91 | 86, 87, 88, 90 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| the shipped geometry is pristine, and one moved field is not | 93–103 | 94, 95, 98, 99, 102 | LoadingScreen CARD / clampCard / cardVars | Real-module VM; bounded fixture coverage. |
| cardVars emits parseable CSS for every input, hostile ones included | 105–118 | 110, 114, 115, 116 | LoadingScreen CARD / clampCard / cardVars | Real-module VM; bounded fixture coverage. |
| the stylesheet reads exactly the custom properties this module writes, and gives each one a fallback | 120–131 | 127, 128–129 | loading CSS / LoadingScreen | Static CSS/source contract; no rendered launch proof. |
| the shipped default is the card that ships TODAY: no offset, no rescale | 133–141 | 138, 139, 140 | LoadingScreen CARD / clampCard / cardVars | Real-module VM; bounded fixture coverage. |
| letterbox bars run over the flyby only, in landscape, and never under reduced motion | 161–185 | 164, 165, 166, 168, 169, 170, 171, 172, 175–176, 177, 181, 182–183 | loading CSS / LoadingScreen | Static CSS/source contract; no rendered launch proof. |
| the card paints ABOVE the letterbox, so the bottom bar never covers it | 187–197 | 190, 193, 196 | loading CSS / LoadingScreen | Static CSS/source contract; no rendered launch proof. |
| the streak: a skip extends it, a watched flyby clears it, hostile input is no streak | 205–218 | 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| SETTINGS › MOTION: REDUCED still runs the card, the flyby and the announcer after the garage leave — a tap skips them | 271–286 | 274, 275, 277, 279, 282, 285 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| software GL, a PLAYER (no automation): raceIntro's hasWorld:false still shows the race card, then starts the race | 288–297 | 291, 292, 293, 294, 296 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| a harness-driven launch (navigator.webdriver) keeps the 700 ms card and hands off to the grid promptly; a player's reduced motion still flies | 299–309 | 302, 303, 305, 308 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| a skip of the GARAGE leave is not a verdict on the flyby: the streak counts flyby skips only | 311–319 | 314, 316, 318 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| three skips in a row shorten the next flyby — and its announcer budget — to SHORT_FLY_MS | 321–340 | 325, 328, 332, 333, 336, 339 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| busy(): the card over the scrim without a circuit, no timer, no skip, not active | 342–384 | 344, 345, 346, 347, 348, 349, 350, 351, 352, 355, 357, 358, 360, 361, 364, 366, 368–369, 370–371, 372–373, 374–375, 376–377, 378–379, 380–381, 382–383 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| building(): the card over the scrim, no timer, no skip, not active — then run() takes over | 386–400 | 388, 389, 390, 391, 394, 396, 398, 399 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| prep(): scrim up, race card hidden, skip arms studioSkip — garage-out owns the leave | 402–416 | 405, 406, 407, 408, 409, 410, 413, 414, 415 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| handoff(): the card stays up, disarmed, until render() lowers it with the race's first PRESENTED frame | 418–479 | 422, 423, 425, 426, 427, 428, 431, 433, 440–441, 442–443, 445–446, 447–448, 449–450, 451–452, 453–454, 464, 467, 469, 471, 474, 477, 478 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| a skip inside SKIP_GRACE_MS is ignored (a double-click on RACE!), and a real skip stops the event | 481–492 | 485, 486, 490, 491 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| a flyby that plays out resets the streak, and the full cut comes back | 494–504 | 497, 499, 502, 503 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| only a FLYBY counts: the no-world card and a stop() before the end leave the streak alone | 506–518 | 510, 513, 517 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| a store that throws never stops the flyby | 520–532 | 524, 527, 531 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| the skip hint is a run-phase pseudo-element that waits ~3 s — no new shell node | 534–543 | 537, 538, 539, 540, 541, 542 | loading CSS / LoadingScreen | Static CSS/source contract; no rendered launch proof. |
| grid geometry: the WHOLE field, in blocks of two staggered columns, P1 left and half a row ahead of P2 | 566–590 | 568, 569, 570, 571, 572, 573, 574, 575, 578, 579, 580, 583, 584, 585, 587, 588, 589 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| grid geometry: a phone keeps every car and drops the position before the code | 592–615 | 595, 596, 597, 598, 599, 600, 603, 604, 608, 609, 611, 613, 614 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| grid geometry: an unknown slot highlights nobody, and the card keeps its map | 617–626 | 619, 620, 621, 622, 623, 624, 625 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| grid colours: a black car is lifted to be visible, junk falls back to the accent | 628–638 | 629, 631, 632, 633, 635, 636, 637 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| the map slot switches to the grid for the grid shots, and back to the map otherwise | 702–720 | 705, 707, 709, 710, 711, 713, 717, 719 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| the turn on camera is tagged on the map, and only redrawn when it changes | 722–746 | 727, 732, 733, 734, 735, 737, 740, 741, 745 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| FlybySeq.airCorner: 0 until a corner shot is solved, and reset() clears it | 748–753 | 750, 752 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| an unknown slot (random grid) or a missing field keeps the map through the grid shots | 755–763 | 760, 761 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| the radio check fires ONCE, as grid-mine starts, with the player's slot and what is left of the flyby | 765–785 | 769, 771, 772, 773, 774, 775, 777, 783 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| the radio check never talks over the announcer: it waits, and gives up when the flyby runs out | 787–801 | 792, 795, 800 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| TEAM RADIO off, or the chatter setting at off/key, says nothing; the refusal is final for the run | 803–825 | 807, 808, 813, 820, 821, 822, 823, 824 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| stop() and a skip cut a radio check that is on air | 827–852 | 831, 833, 835, 841, 843, 850, 851 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| FlybySeq.shotAt names the shot solve() cuts to, without planning it | 854–866 | 856, 857, 858, 859, 860, 862, 865 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| game.js hands the card its field in grid order, the flyby's shots, and the radio | 868–875 | 870, 873, 874 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| with the radio check coming, the announcer's read is budgeted to end before the grid-mine shot | 877–888 | 883, 886, 887 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| the radio check's hiss is held for the line, not for the rest of the flyby | 890–902 | 894, 895, 896, 897, 901 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| flyMsFor(skips, wantMs): a real race's read stretches the flyby up to FLY_MAX_MS; a habitual skipper keeps the short cut | 905–922 | 907, 908, 909, 910, 911, 912, 913, 917, 918, 920, 921 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| flyMsFor: habitual short cut waits for warmReady (would fail before the warm gate) | 924–932 | 926, 927, 928, 929, 930, 931 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| metaRows: a circuit gets its facts; a real race joined mid-race gets the lap, your place, tyres, stops, leader and flag | 934–960 | 937–938, 944–946, 950, 952, 955, 956, 958–959 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| a habitual skipper's short cut leaves no room for the radio check, so the announcer keeps the whole flyby | 963–969 | 966, 968 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| a skip ends the announcer with the flyby, not when startRace reaches clearMenuScreens() | 971–978 | 977 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| RACE! over a pending warm holds the card until it ends; the sheets that skip the flyby still get the card and the handoff | 980–1004 | 983, 984, 985, 986, 988, 989, 990, 991, 996, 997, 1000, 1001, 1002, 1003 | game race-entry source wiring | Static CSS/source contract; no rendered launch proof. |
| launch unification: every session the player starts reaches raceIntro; the quick restarts and automation stay quick | 1006–1029 | 1009, 1010, 1011, 1013, 1014, 1017, 1018, 1019, 1020, 1022, 1024, 1025, 1026, 1028 | game race-entry source wiring | Static CSS/source contract; no rendered launch proof. |
| the card over the scene: black bars and a light hint in every theme, an undistorted map, a real fade, no bars under MENU ANIMATIONS: REDUCED | 1031–1041 | 1034, 1035, 1036, 1037, 1038, 1039, 1040 | loading CSS / LoadingScreen | Static CSS/source contract; no rendered launch proof. |
| the garage phase (the drive-out before the flyby): no card, no timer, and a tap skips to the card + flyby, not counted as a flyby skip | 1043–1085 | 1047, 1048, 1049, 1050, 1051, 1053, 1056, 1058, 1059, 1061, 1067, 1068, 1070, 1072, 1073, 1074, 1076, 1078, 1079, 1081–1082, 1083–1084 | LoadingScreen phase / timers / skip policy | Real-module VM; bounded fixture coverage. |
| a HIDDEN tab at run() gets the card, not the flyby: no announcer read starts unseen (bug-hunt 3, 2026-10-10) | 1087–1102 | 1094, 1095, 1097, 1101 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |
| the intro's safety caps run on introNow(), which freezes while the tab is hidden (bug-hunt 3, 2026-10-10) | 1104–1124 | 1109–1110, 1111–1112, 1114, 1115, 1119, 1121, 1123 | game race-entry source wiring | Static CSS/source contract; no rendered launch proof. |
| loading weather distinguishes storm from dry in normal, grid and mid-race cards | 1127–1132 | 1130 | LoadingScreen grid/radio; FlybySeq / RadioVoice | Real-module VM; bounded fixture coverage. |

## tests/unit/loading-screen-pack-gate.test.mjs

Read: 1–72. SHA-256: `9ed679d2c81fc7d62a3cdc8f2b01058f33a1d10a673e477925f456228fad73d6`. 3 lexical case declarations.

Production: [js/ui/loading-screen.js:82](../../js/ui/loading-screen.js#L82); [js/game.js:2669](../../js/game.js#L2669). Target: LoadingScreen.packSettled / warmPresentReady; startRaceBody requestWarm.

Fixture / semantic coverage: Real module in minimal VM (19–25), then create with null DOM (39–53). symbolSource finds the sole startRaceBody declaration in game-source union.

Limits: Predicate execution plus source order/gate checks; no pack upload/compile concurrency or real countdown timing. TLX early warm is explicitly exempted unless knob is 0.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| packSettled: uploaded / error / unsupported / off settle; in-flight does not | 27–37 | 29, 30, 31, 32, 33, 34, 35, 36 | LoadingScreen.packSettled / warmPresentReady | Real-module VM; bounded fixture coverage. |
| instance exposes the same packSettled gate | 39–53 | 50, 51, 52 | LoadingScreen.packSettled / warmPresentReady | Real-module VM; bounded fixture coverage. |
| startRaceBody arms count without awaiting pack; requestWarm is packSettled-gated | 55–72 | 59–60, 63, 64, 66, 69–70, 71 | LoadingScreen.packSettled / warmPresentReady | Real-module VM; bounded fixture coverage. |

## tests/unit/loading-wipe.test.mjs

Read: 1–94. SHA-256: `b115ad02959b17df8c82675dfa9022d4279aa97d9a538df86941f1f33ebbe372`. 4 lexical case declarations.

Production: [js/ui/loading-screen.js:299](../../js/ui/loading-screen.js#L299); [css/loading.css](../../css/loading.css). Target: LoadingScreen phase transition wipe; loading CSS.

Fixture / semantic coverage: Proxy stubEl 24–34 supplies arbitrary no-op methods; boot 36–56 fixes Teams, store, media and timers. Checks phase dataset and --ld-wipe values for papaya/near-black teams.

Limits: State and CSS text checks; no sweep frames, easing, contrast or browser reduced-motion execution.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| leaving the garage for the card sweeps once in the player's team colour | 59–68 | 62, 63, 65, 66, 67 | LoadingScreen phase transition wipe | Real-module VM; bounded fixture coverage. |
| a near-black livery sweeps in its second colour | 70–75 | 74 | LoadingScreen phase transition wipe | Real-module VM; bounded fixture coverage. |
| no sweep without a garage shot before it, and none into prep | 77–87 | 80, 84, 86 | LoadingScreen phase transition wipe | Real-module VM; bounded fixture coverage. |
| the stylesheet sweeps once over the scrim, and reduced motion (both forms) turns it off | 89–94 | 91, 92, 93 | LoadingScreen phase transition wipe | Real-module VM; bounded fixture coverage. |

## tests/unit/lobby-answer-flight.test.mjs

Read: 1–36. SHA-256: `69422c28a62049e90af30c551f4b253d531be03957893543493af0c7625d3a15`. 2 lexical case declarations.

Production: [js/net/lobby.js:1710](../../js/net/lobby.js#L1710); [js/net/lobby.js:1787](../../js/net/lobby.js#L1787). Target: NetLobby room-answer acceptAnswer guard.

Fixture / semantic coverage: Source slice starts answerInFlight and ends next stopCodeWait (11–13); tests inspect lock/seen/await order and refusal branch.

Limits: Static source ordering only; no simultaneous negotiation, relay, WebRTC or promise execution.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| a second answer during acceptAnswer does not start another negotiation | 15–24 | 16, 21, 22, 23 | NetLobby room-answer acceptAnswer guard | Static wiring/shape contract; no flow execution. |
| a wrong_offer answer stays blacklisted and silent | 30–36 | 32, 33, 34–35 | NetLobby room-answer acceptAnswer guard | Static wiring/shape contract; no flow execution. |

## tests/unit/lobby-codes.test.mjs

Read: 1–246. SHA-256: `39c9149d1631fc3d66c0fcb78fe9d55892aebe3010a6d6bbad391c8cf0b379f7`. 11 lexical case declarations.

Production: [js/net/lobby-codes.js:36](../../js/net/lobby-codes.js#L36); [js/net/lobby-codes.js:132](../../js/net/lobby-codes.js#L132); [js/net/handshake.js](../../js/net/handshake.js). Target: LobbyCodes.codeFrom / resolveCode / deliver / handOff.

Fixture / semantic coverage: boot 14–45 supplies fake QR/scan/share; seedClipboard loads real clipboard helper. realHandshake option loads bytes+handshake with actual codecs/compression. Deferred decode tests operation/reset/new-delivery cancellation. bootShare 216–234 records notices with failing share and clipboard outcomes.

Limits: Synthetic x.test links and data:A/B codes are test inputs, not deployed endpoints. Most handshake hooks are stubs; real compressed/plain round-trip case verifies codecs only, not peer connection.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| delivering a real invite preserves nonempty short final wrap fragments | 47–72 | 52, 58, 60, 61, 65, 69 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| an ambiguous delivery cannot write or negotiate after reset or a new operation | 74–93 | 89, 90, 91 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| codeFrom trims and unwraps invite URLs | 95–100 | 97, 98, 99 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| codeFrom lifts a code out of a message and re-joins one a mail client hard-wrapped | 102–124 | 110, 111, 112, 115, 116, 117, 118, 120, 121, 123 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| paintQr hides the wrap when encoding fails | 126–137 | 130, 131, 134, 135, 136 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| canShare reflects navigator.share | 139–142 | 140, 141 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| lobby-codes is on the lazy net roster ahead of lobby | 144–149 | 148 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| codeFrom lifts a code out of a LINK inside a sentence, wrapped or followed by punctuation | 151–168 | 157, 158, 163, 166, 167 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| codeFrom lifts a BARE code out of brackets, quotes and a sentence's end | 170–187 | 176, 177, 178, 179, 181, 184, 186 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| codeFrom re-joins a fold after the mode separator and a short mid soft-wrap | 189–211 | 196, 197, 198, 199–201, 203, 204, 207, 209, 210 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |
| a failed share copies if it still can, else asks for the COPY tap | 236–246 | 238, 239, 241, 242, 244, 245 | LobbyCodes.codeFrom / resolveCode / deliver / handOff | Real-module VM; bounded fixture coverage. |

## tests/unit/lobby-settings.test.mjs

Read: 1–137. SHA-256: `d2733dc79a34021683b9a4f3c4bd89c9ed56ef5e814da40a57899f022469606a`. 5 lexical case declarations.

Production: [js/net/lobby-settings.js:37](../../js/net/lobby-settings.js#L37); [js/net/lobby-settings.js:48](../../js/net/lobby-settings.js#L48); [js/net/lobby-settings.js:61](../../js/net/lobby-settings.js#L61); [tools/manifest.cjs](../../tools/manifest.cjs). Target: LobbySettings circuitPayload / normaliseSettings / installCircuit.

Fixture / semantic coverage: ellipse/design 19–30 are fictional Friend Loop input. peers 33–55 boots two independent verify-track VMs plus real CustomTracks and in-memory GameStore. Checks sanitized payload and centerline agreement; roster tests are separate static guards.

Limits: No relay/data-channel delivery or durable guest persistence; lap-length tolerance is under 1 unit and does not compare complete mesh or gameplay state.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| lobby-settings is on the lazy net roster ahead of lobby | 57–66 | 61, 62–65 | LobbySettings circuitPayload / normaliseSettings / installCircuit | Real-module VM; bounded fixture coverage. |
| glx soft-present sibling loads before glx.js | 68–73 | 72 | LobbySettings circuitPayload / normaliseSettings / installCircuit | Real-module VM; bounded fixture coverage. |
| circuitPayload + installCircuit builds the same custom circuit on both peers | 75–106 | 77, 80, 83, 84, 90, 91, 95, 96, 98, 99, 100, 105 | LobbySettings circuitPayload / normaliseSettings / installCircuit | Real-module VM; bounded fixture coverage. |
| normaliseSettings refuses an oversized or hostile circuit body | 108–128 | 112, 113, 115, 121, 122, 123, 124, 125, 126, 127 | LobbySettings circuitPayload / normaliseSettings / installCircuit | Real-module VM; bounded fixture coverage. |
| a custom LIST index without a circuit body is refused (legacy host) | 130–137 | 133, 134–136 | LobbySettings circuitPayload / normaliseSettings / installCircuit | Real-module VM; bounded fixture coverage. |

## tests/unit/lobed-trees.test.mjs

Read: 1–144. SHA-256: `150c32e3d858493d1ff203a09785179e3e4ce629009f6a9fb237d7bc8aea3ff4`. 6 lexical case declarations.

Production: [js/track/scenery/nature.js:54](../../js/track/scenery/nature.js#L54); [js/track/scenery/graph.js](../../js/track/scenery/graph.js); [js/track/core/geom.js](../../js/track/core/geom.js). Target: SceneryNature.create / tree; TrackGraph.instance; TrackGeom primitives.

Fixture / semantic coverage: makeFixture 9–54 provides a fictional 16-station flat track and real geom/graph/nature, recording guardable primitives, notes and occupancy; variants×mobile check budgets, normals and wind material weights.

Limits: No full circuit/terrain placement or rendered foliage. Material-reset case ends by planting accepted tree without an assertion of that final geometry; note case separately asserts accepted/rejected counts.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| lobed crowns preserve canonical/fused normals, sway and finite recipe budgets | 56–74 | 60, 62, 63, 65, 66, 68, 69, 70, 72 | SceneryNature.create / tree | Real-module VM; bounded fixture coverage. |
| a rejected lobed instance leaves the legacy planting site available | 76–83 | 78, 79, 80, 82 | SceneryNature.create / tree | Real-module VM; bounded fixture coverage. |
| an obstructed radial crown is rejected before any graph or geometry emission | 85–94 | 87, 88, 91, 92, 93 | SceneryNature.create / tree | Real-module VM; bounded fixture coverage. |
| invalid new crown options fail without geometry or occupancy | 96–104 | 99, 100, 102 | SceneryNature.create / tree | Real-module VM; bounded fixture coverage. |
| a tree whose trunk the pit guard rejects leaves no material behind | 106–131 | 115, 127 | SceneryNature.create / tree | Real-module VM; bounded fixture coverage. |
| a tree whose trunk the guard refuses leaves no registry note (H26b) | 133–144 | 140, 143 | SceneryNature.create / tree | Real-module VM; bounded fixture coverage. |

## tests/unit/lockup-bench-vm.test.mjs

Read: 1–33. SHA-256: `bbfd1894aabf992456635c7648d3d86ad6286c2207b2209831696a5f969d8955`. 2 lexical case declarations.

Production: [tools/check/lockup-bench.mjs:87](../../tools/check/lockup-bench.mjs#L87); [js/physics/player-forces.js:185](../../js/physics/player-forces.js#L185). Target: measureLockup → PlayerForces wheelLock / flatSpot.

Fixture / semantic coverage: row 8–10 selects weather/speed/pedal/bias from real game VM stop sweep; high-speed dry, mild slow, reference and half-pedal outcomes plus rain contrast.

Limits: Threshold shape at selected bench rows; render-only lock/flatSpot telemetry, not evidence of grip loss or visual smoke/sound.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| dry lock-up depends on speed, forward bias and pedal — not a flat constant | 12–25 | 19, 20, 21, 22, 23, 24 | measureLockup → PlayerForces wheelLock / flatSpot | Real-module VM; bounded fixture coverage. |
| rain still locks more readily than dry (wet longitudinal budget) | 27–33 | 31–32 | measureLockup → PlayerForces wheelLock / flatSpot | Real-module VM; bounded fixture coverage. |

## tests/unit/lockup-smoke-vm.test.mjs

Read: 1–49. SHA-256: `ad2d8eb09a40062507270471825712b2912695c7d39cd8af3c1da63cef0ca3e0`. 2 lexical case declarations.

Production: [js/physics/player-forces.js:185](../../js/physics/player-forces.js#L185); [js/game.js](../../js/game.js). Target: PlayerForces wheelLock; game skidIntensity/smoke site.

Fixture / semantic coverage: One createGame monza VM boot/close 19–21; staged straight stop with forward bias; source pins wheel choice and max(lock, slide) consumption.

Limits: Behavioral row requires at least one qualifying locked frame (okFrames > 0), not every locked frame despite message wording; sound, marks and smoke are not observed.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| a straight-line stop from speed locks a front and the lock reads as skid intensity | 23–40 | 27, 28, 38, 39 | PlayerForces wheelLock | At least one qualifying frame; not every locked frame. |
| the smoke site reads the lock and picks a front wheel for it | 42–49 | 45, 46, 47, 48 | PlayerForces wheelLock | Real-module VM; bounded fixture coverage. |

## tests/unit/log-namespaces.test.mjs

Read: 1–77. SHA-256: `fb881598ec81536b19b640d25e9b39322cf761d147e369cf7f7bcce139d8e4d2`. 2 lexical case declarations.

Production: [js/core/log.js:14](../../js/core/log.js#L14); [index.html](../../index.html); [js/](../../js/). Target: Log.NAMESPACES and literal logging callsites.

Fixture / semantic coverage: namespaceList 19–26 evaluates real Log; recursive walk 28–35 plus inline-script scan 39–50 feeds regex CALL after regex comment stripping 37. Anti-vacuity requires >100 literal calls.

Limits: Computed namespaces excluded; index.html#inline-script-N is an invented diagnostic label, not a file; ~line is in comment-stripped text. Regex scanning is not JS/HTML parsing.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| Log.NAMESPACES evaluates from log.js and is duplicate-free | 52–56 | 54, 55 | Log.NAMESPACES and literal logging callsites | Real registry + lexical scan; computed calls excluded. |
| every literal Log.<level>(ns, …) namespace is declared in Log.NAMESPACES | 58–77 | 73, 74–76 | Log.NAMESPACES and literal logging callsites | Real registry + lexical scan; computed calls excluded. |

## tests/unit/longitudinal-vm.test.mjs

Read: 1–185. SHA-256: `d775853226ee23a21954ee5f43ebc2a03af8fe085c6778e489e8f5082c85fc86`. 6 lexical case declarations.

Production: [js/game.js](../../js/game.js); [js/physics/player-forces.js](../../js/physics/player-forces.js); [js/agent/apex.js](../../js/agent/apex.js); [tools/lib/game-vm.cjs:641](../../tools/lib/game-vm.cjs#L641). Target: Game player driving / PlayerForces; __apex JSON hooks.

Fixture / semantic coverage: One VM boot, fresh() restores physics/headless and pinPace fixes 1 (22–37). drive 40–49 stages clean inputs. Monza tests propulsion, grass and wrap; Spa discovers steep/flat positions by sampling.

Limits: Deterministic VM physics, no browser/input-device/render evidence. Sloped test assumes sampled extrema; line wrap temporarily enables roadFollow 0.7, so it is not assists-off behavior.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| throttle accelerates from rest toward a high top speed | 51–71 | 68 | Game player driving / PlayerForces | Real-module VM; bounded fixture coverage. |
| braking slows faster than coasting, both slower than throttle | 73–84 | helper assertions only | Game player driving / PlayerForces | Real-module VM; bounded fixture coverage. |
| driving onto the grass bleeds speed | 86–99 | 97 | Game player driving / PlayerForces | Real-module VM; bounded fixture coverage. |
| steering is speed-sensitive: a tighter line at low speed than high | 101–118 | helper assertions only | Game player driving / PlayerForces | Real-module VM; bounded fixture coverage. |
| slope gravity: descents don't overspeed past top speed; climbs aren't a barrier | 120–160 | 157 | Game player driving / PlayerForces | Real-module VM; bounded fixture coverage. |
| crossing the start/finish line advances s (wraps) and increments the lap | 162–185 | 182, 183, 184 | Game player driving / PlayerForces | Real-module VM; bounded fixture coverage. |

## tests/unit/loop-health.test.mjs

Read: 1–276. SHA-256: `629b8fda4a6bf07cd0d2f631514fe1aafbdbf01a21ffbc9b8715fdfbecbfcb71`. 14 lexical case declarations.

Production: [js/perf/loop-health.js:12](../../js/perf/loop-health.js#L12); [js/perf/loop-health.js:176](../../js/perf/loop-health.js#L176). Target: LoopHealth fault / clean / state / stall watchdog.

Fixture / semantic coverage: load 24–42 fixes clock and captures real Log.error. loadStall 138–162 supplies storage maps, visibility, cover elements, PerfGov and reload spies. Race-settings case rebuilds its own equivalent context.

Limits: Clock/state/spies prove policy, not requestAnimationFrame scheduling, actual quality recovery or reload success. Quiet expiry and stopped latch are separate from stall shedding/reload budget.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| state() exposes the shipped caps and a null heartbeat before any clean frame | 44–54 | 47, 48, 49, 50, 51, 52, 53 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| RUN_CAP: seven consecutive faults survive; the eighth stops the loop | 56–69 | 59, 60, 61, 63, 65, 66, 67, 68 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| a clean frame pays the run back so a later fault streak starts fresh | 71–86 | 73, 74, 76, 77, 78, 81, 83, 84, 85 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| TOTAL_CAP: alternating clean/fault still stops at 240 total faults | 88–102 | 93, 96, 97, 98, 99, 100, 101 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stale-fault expiry: a quiet stretch longer than QUIET_RESET_MS forgets the tally | 104–123 | 107, 110, 114, 115, 119, 122 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| a stopped loop does not expire its tally on a later quiet clean | 125–134 | 128, 132, 133 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stall: a glacial loop sheds at SHED_RUN, then reloads once to the menu notice | 164–183 | 168, 170, 171, 172, 174, 176, 177, 178, 179, 180, 182 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stall: with the reload budget spent it only records | 185–191 | 188, 189, 190 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stall: healthy, hitchy, hidden and suspended loops never act | 193–203 | 200, 201, 202 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stall: off under automation unless ?stallwatch=1 forces it | 205–213 | 208, 209, 212 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stall: under the loading cover the shed waits and the reload needs a 30-frame run | 215–225 | 220, 221, 222, 224 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stall: #carsetup (garage) uses the same relaxed cover as #loading | 227–236 | 232, 233, 235 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stall: #race-settings (PREPARING…) uses the same relaxed cover as #loading | 238–269 | 265, 266, 268 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |
| stall: off in the node game VM (webdriver false, apex-game-vm UA) | 271–276 | 274, 275 | LoopHealth fault / clean / state / stall watchdog | Real-module VM; bounded fixture coverage. |

## tests/unit/low-speed-lock.test.mjs

Read: 1–81. SHA-256: `077ff155165653dd072fc23cabae5ecad8daa115ac9f10deeed4d5632c4745a8`. 2 lexical case declarations.

Production: [js/game.js:6055](../../js/game.js#L6055); [js/input/steer-tuning.js](../../js/input/steer-tuning.js). Target: game steering lock taper; SteerTune slider mapping.

Fixture / semantic coverage: rawTaper/blendTaper 21–28 are independent expected formulas. Monaco VM pins car to sampled road for 45 settle frames at each requested speed, retires rivals and compares measured wheel angle to current normalized speed.

Limits: Three sampled speeds (10/22/60) plus source pins; no exhaustive curve, driver hardware feel or full hairpin trajectory.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| source: game.js plateau is 1.06 and steer-tuning documents the hairpin boost | 30–36 | 33, 34, 35 | game steering lock taper | Static wiring/shape contract; no flow execution. |
| VM: full-lock wheel angle rises ~6% at 10 m/s, blends at 22 m/s, unchanged at 60 m/s | 38–81 | 65–66, 67, 72, 73–74, 78–79 | game steering lock taper | Real-module VM; bounded fixture coverage. |

## tests/unit/lsp-caller-fixes.test.mjs

Read: 1–49. SHA-256: `98d21f714946f0b70289e819a132fcb7c41bdd21ab9186382d4b8f4cfe5d7ee7`. 1 lexical case declaration.

Production: [tools/mcp/lsp-mcp.mjs:240](../../tools/mcp/lsp-mcp.mjs#L240); [tools/mcp/lsp-mcp.mjs:1108](../../tools/mcp/lsp-mcp.mjs#L1108); [tools/mcp/lsp-mcp.mjs:1157](../../tools/mcp/lsp-mcp.mjs#L1157). Target: Lsp / callTool lsp_callers alias and owner grouping.

Fixture / semantic coverage: Test writes a temporary jsconfig.json and fictional src/callers.js (12–26) with Hub.fire direct/arrow/duplicate owners and direct/destructured aliases. It queries symbol, declaration and use anchors and normalizes query-position prose only.

Limits: Fixture paths are created under os.tmpdir/lsp-caller-fixes-*, not repository production paths. Six uses in six functions and lexical ownership formatting are pinned; no real-tree caller completeness/performance guarantee.

| Case name | Case range | Assertion spans | Target | Meaning / limits |
|---|---|---|---|---|
| callers follow aliases and declaration anchors while preserving lexical owners | 8–49 | 30, 35, 36, 37, 38, 39, 40, 42, 44 | Lsp / callTool lsp_callers alias and owner grouping | Real LSP on fictional fixture; aliases/owner formatting. |

## Coverage receipt

235 lexical test declarations mapped across all 23 files. Every assertion call within each case is indexed above; loops and parameter tables remain represented by their complete case, with fixture dimensions described. The helpers build(), changed()/colDiff(), load(), query(), namespaceList() and VM setup add precondition/anti-vacuity behavior described in each file section. Assertions are interpreted as authored expectations, with no pass/fail claim.

Notable weak boundaries: byte-identical claims compare current calls rather than historical goldens; the early zone-finish case does not establish its entire title; lockup smoke observes at least one qualifying frame; static source checks cannot establish executed handshakes, CSP, rendering, audio or scheduling. The sole browser-capable case is opt-in C-P3 and was fully read as source and was not executed.
