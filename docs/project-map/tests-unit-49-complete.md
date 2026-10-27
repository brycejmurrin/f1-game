# Unit group 49 — complete source map

Read-only source mapping, 2026-10-27. All 26 assigned files, 4,922 source lines, fully read in 84 individual chunks of at most 70 lines and under 10,000 characters. No tests or browser sessions ran. Tables describe assertion contracts, not passing results. Inclusive ranges and SHA-256 bind the reviewed source.

Exact coverage: 199 declared test case sites and 923 assertion-call sites inside cases; loop-expanded instances remain represented by their declaration and full matrix in the source. Shared assertion helpers (shader need:26, shadow sunVP:42, shared-math near16:198–203, ship emission:43 and skill frontmatter:23–31) supplement case spans.

## Navigation evidence and shared boundaries

AGENTS.md and `.claude/skills/code-nav/SKILL.md` read. Local apex-lsp definitions resolve SetupTrialSession at js/race/setup-trial-session.js:2, SetupTune at js/garage/setup-tune.js:4, ShadowPass at js/render/shared/shadow-pass.js:15, ShareCardData and ShareCardLayout at line 4 of their respective share modules, ShareCode at js/ui/share-code.js:9, Tracks at js/track/tracks.js:3, SkidMarks at js/fx/skidmarks.js:2 and Particles at js/fx/particles.js:8.

LSP production usage: ShareCard has 5 references across its own module and js/race/daily-challenge.js (3); SheetShape has 4 across js/ui/sheet-shape.js and js/ui/screen-looks.js (3), explicitly a text-match fallback because window.SheetShape is untyped. M4.wrapDelta has 9 across js/core/mat4.js, js/agent/agentview.js, js/net/snapshot.js, js/agent/apex-track.js, js/game.js and js/physics/collide.js. This is navigation evidence, not exhaustive call-graph coverage. Tool/config targets below are direct imports or source reads.

Additional LSP usage: SetupTrialSession, ShadowPass and SkidMarks each have the game entry as a consumer. SetupTune has 70 references in 10 files: setup experiments/presets/sheet/trials, game entry, player forces, settings export, setup trial session, HUD and its declaration module. ShareCode has 26 references in 7 files (results sheet, settings export, setup sheet, Daily Challenge, title flow/menu and declaration); LSP explicitly reports text-match fallback because module.exports scopes its symbol to the file.

## tests/unit/setup-trial-session.test.mjs

Read 1–173; SHA-256 419282623fc309f49b6f16b37e115b3abd4fdeb93da810aaa85f21c05f3e74e3. 10 declared case sites.

Targets: js/race/setup-trial-session.js; js/race/session-records.js.
Fixtures/setup: 10–41: mutable G/parts/tune/records facade, fresh solo grid, deferred promise; actual SessionRecords.PHYS list.
Evidence limits: VM restart ownership and comparison identity; startRace/coach/tyres are controlled stubs, so no actual race entry, timing or scoring result.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| fresh normal TT launch is solo, unscored, weather-preserving and A/A context-identical (43–59) | 47–51, 53, 56–58 | runtime.restart, options. |
| completion context refreshes all static physics/settings but freezes actual initial consumables and point (61–72) | 65, 67, 69, 71 | runtime.restart, options, runtime.context. |
| scored modes, unstable weather and ordinary races are refused before any start (74–83) | 80–81 | change, runtime.restart, options. |
| parts, tune, physics and settings changes while awaiting restart never arm the drill (85–96) | 91, 93–94 | defer, h.runtime.restart, h.options, h.runtime.pending, change, h.fresh, pending.resolve, h.runtime.context. |
| cancel and caller ownership release prevent late arming (98–107) | 104–105 | h.runtime.cancel, defer, h.runtime.restart, h.options, cancel, h.fresh, pending.resolve, h.runtime.context, h.runtime.pending. |
| superseded restart cannot clear or arm a newer successful operation (109–117) | 114–116 | defer, h.runtime.restart, h.options, h.fresh, pending.resolve, h.runtime.context. |
| failed/canceled entry and unverifiable rolling or non-solo grids never arm (119–130) | 122, 128 | h.fresh, h.runtime.restart, h.options, g.cars.push, change. |
| explicit SessionEntry outcome is authoritative and changed mode is not made practice (133–150) | 141–142, 148–149 | h.fresh, h.runtime.restart, h.options, defer, next.runtime.restart, next.options, waiting.resolve. |
| cold records stub can load real config during normal start without invalidating unchanged physics (153–162) | 158–161 | h.fresh, h.runtime.restart, h.options, PHYS.map. |
| every facade physics tuner stays guarded across cold-stub bundle replacement (164–173) | 170–171 | h.fresh, h.runtime.restart, h.options. |

## tests/unit/setup-tune.test.mjs

Read 1–143; SHA-256 3700badcfacac430526256046de887fecc8e2f9703f482675973899173d8bd97. 7 declared case sites.

Targets: js/garage/setup-tune.js; js/car/parts.js; js/game.js.
Fixtures/setup: 20–38: Map-backed GameStore with shipped fallback, real M4/PhysicsConsts/Teams/Parts/SetupTune; host JSON conversion.
Evidence limits: Numeric tune contracts use shipped teams; player-only makeCars argument is checked by source regex, not a running teammate.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| the works sheet is identity for every team: mods 1.0, rake 0, brake-bias split 1/1 (40–52) | 43–45, 47–48, 50–51 | S.mods, S.rake, S.isDefault, Parts.getFactorySetup, Parts.aeroLoad, S.aero, Parts.getMods, S.bbScales. |
| bars move the four channels the way the sheet says, inside the ±5 % clamp (54–65) | 58–59, 62, 64 | S.set, S.mods, S.reset. |
| rake adds aero load on top of the wing and clamps at the ends; the factory path ignores it (67–80) | 73, 75, 77–79 | Teams.LIST.find, Parts.aeroLoad, Parts.getFactorySetup, S.set, S.rake, S.aero. |
| brake bias: forward spends the front's circle, rearward the rear's; the wheel's range is 50–62 in halves (82–92) | 85–86, 88, 90–91 | S.bbScales, S.set, S.get, S.brakeBias. |
| a damaged sheet falls back per field, and reset restores the works numbers (94–105) | 98–102, 104 | S.get, S.defaults, S.isDefault, S.reset. |
| the rake sheet reaches the player alone: a shared MY TEAM build carries the parts, not the tune (115–129) | 120–121, 126–128 | Parts.aeroLoad, l.includes. |
| reset returns to the SHIPPED sheet a fresh install gets, not the works default (131–143) | 135, 137–139, 142 | S.get, S.set, S.reset, bare.set, bare.reset. |

## tests/unit/shader-validate.test.mjs

Read 1–96; SHA-256 d135c7e149fc0fdf7044967d4b213c5e5ef118d9e58cb484b3d2edc659ee05d3. 7 declared case sites.

Targets: tools/check/shader-validate.mjs; tools/lib/lint-bins.mjs.
Fixtures/setup: 20–31: good/bad GLSL and WGSL fixture files, required-binary policy and resolver.
Evidence limits: Extraction always checked; compiler cases skip without binaries unless required. Naga tree rows may warn; external compiler acceptance is not browser backend evidence.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| lint binaries: a local green is only shader evidence when both are installed (33–40) | 38–39 | t.diagnostic, resolveBin. |
| extraction finds the GLX programs, both stages and the inline occlusion pair (42–53) | 44, 46–52 | extractGlsl, ids.has, ids.values, s.source.startsWith, ids.get. |
| extraction finds the WGX modules and names the one fragment it skips (55–61) | 57–60 | extractWgsl, ids.has. |
| glslang accepts every GLX shader in the tree (63–67) | 65–66 | validateTree. |
| glslang FAILS the planted bad shader and passes the good one (69–75) | 71, 73–74 | validateGlsl, fx. |
| glslang FAILS a defect injected into the real SKY_FS (77–84) | 79, 82–83 | extractGlsl, sky.source.includes, sky.source.replace, validateGlsl. |
| naga FAILS the planted bad WGSL and passes the good one (advisory on the tree) (86–96) | 88, 90–91, 93, 95 | validateWgsl, fx, validateTree. |

## tests/unit/shadow-pass-depth.test.mjs

Read 1–327; SHA-256 f1e8df8a698a9a51b2f33e681c3ed60af094e589ed1e807a3bfa2e81f75a36da. 12 declared case sites.

Targets: js/render/shared/shadow-pass.js; js/core/mat4.js; js/track/tracks.js; tools/track/verify-track.cjs.
Fixtures/setup: 19–49: real M4 + ShadowPass against captured gfx matrices; elevations 51; reset fixture 132–150; capability/caster/matrix spies 167–200; instanced/fused Zolder build 119–125.
Evidence limits: CPU VM verifies projection, gating, counters and cache keys. Source assertions inspect propTop calculation; mesh build compares only Zolder. No GPU allocation, shadow image or mobile backend validation.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| a 250 m prop at the anchor lies inside the sun map's depth range (53–66) | 62–63 | sunVP, ndcZ, z.toFixed. |
| the receiver side keeps its 170 m below the anchor (68–79) | 77 | sunVP, sd.map, ndcZ, z.toFixed. |
| the depth span is PER CIRCUIT: a circuit without tall props keeps the old 150/320 (and its bias in metres) (81–100) | 90, 92–93, 98 | sunVP, ndcZ, span, tall.toFixed, z.toFixed. |
| Tracks measures the tallest prop above its OWN ground, before the upload (102–106) | 104–105 | Source-content / schema guard against the targets above. |
| propTop counts the instanced placements a real backend withholds from propsGeo (116–126) | 124–125 | buildContext, T.build, T.LIST.find, top, fused.toFixed, inst.toFixed. |
| reset() stops the cadence keep re-arming the previous session's car map (131–161) | 152, 154, 157, 160 | seedLog, absSrc, sp.sunPass, sp.reset. |
| cockpit casters follow live knobs, governor tiers, capabilities and consumer hooks (202–235) | 206, 209, 212, 214, 216, 219, 222, 224, 226, 230, 232, 234 | dynamicShadowFixture, sp.resolvePlayer, resolve. |
| moving casters reuse byte-identical lamp VP until any camera input changes or reset (237–264) | 252, 254–255, 259, 261, 263 | dynamicShadowFixture, frame, realM4.clamp, realM4.lookAtTo, L.slice, realM4.perspectiveTo, realM4.mulTo, sp.lampPass, vps.at, expectedVP. |
| a failed lamp camera build does not publish a reusable matrix key (266–276) | 271, 274–275 | dynamicShadowFixture, sp.lampPass, frame. |
| disabled car maps do not resolve casters; live capability restoration and legacy hooks work (278–294) | 281–282, 285–286, 289, 293 | dynamicShadowFixture, sp.sunPass, frame. |
| disabled lamp maps skip lamp caster resolution and prop packing, and resume when enabled (296–310) | 302–304, 307–309 | dynamicShadowFixture, sp.lampPass, frame. |
| zero shadow darkness stops only the car map, preserving sun-map readers and restoration (312–327) | 317–319, 322–323, 326 | dynamicShadowFixture, sp.sunPass, frame. |

## tests/unit/shanghai-pudong-horizon.test.mjs

Read 1–47; SHA-256 4fc0c05a10b7a02f86a665a99756c4e4ef0eb31139590ac674648e508156e008. 2 declared case sites.

Targets: js/circuits/scenery/shanghai.js; tools/track/ground-audit.cjs; tools/lib/track-build-vm.cjs.
Fixtures/setup: 13–15: shipped Shanghai source; 33–44: actual VM build and ground-audit findings filtered to Pudong stack and gaps ≥50 m.
Evidence limits: Source pattern limits HORIZON to four digits 2000–9999; audit checks only matching findings, not visual skyline realism or all terrain gaps.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| pudongCluster anchors past multi-km haze (not dist 300) (17–30) | 20, 22–29 | Source-content / schema guard against the targets above. |
| shanghai ground-audit: no pudongCluster / shanghai-pudong footprint ≥ 50 m (32–47) | 45–46 | require, buildContext, GA.run, GA.lineOf. |

## tests/unit/share-card-data.test.mjs

Read 1–54; SHA-256 d5683fcedebdb6d26e067433e9463a8b9b881856b10e821e6cb123aaff0d72a5. 2 declared case sites.

Targets: js/share/share-card-data.js.
Fixtures/setup: 12–16: isolated pure module; 20–26 valid daily model with secrets/control characters; 41–46 malformed values and forbidden title.
Evidence limits: Privacy schema, sanitizing and freezing are checked; line36 JSON round-trip compares the same expression to itself and does not independently establish safety.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| fromDaily returns a frozen JSON-safe model with only the card schema (18–37) | 27–36 | data.fromDaily. |
| fromDaily defaults to anonymous DRIVER and rejects dishonest values (39–54) | 47–53 | data.fromDaily. |

## tests/unit/share-card-layout.test.mjs

Read 1–52; SHA-256 a92f9b62cc0de9c9cacfcc6cd85cf9ddded6bdd6e0a55fa481640310a1dad03b. 2 declared case sites.

Targets: js/share/share-card-layout.js.
Fixtures/setup: 12–24: isolated module and deliberately long MODEL; deterministic fake text metrics in each case.
Evidence limits: All SPECS geometry/text fitting is checked under fake metrics; real fonts, CSS, QR scanning and raster appearance are outside this file.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| every card spec has bounded ops, an unofficial footer and no forbidden mark (26–43) | 31, 33–35, 37–40 | String, layout.layout, ops.find, measure. |
| fake metrics force long text down to the minimum size without overflow (45–52) | 49–51 | layout.layout, String, ops.find. |

## tests/unit/share-card.test.mjs

Read 1–246; SHA-256 442e9b6103f9d5abdda98033c9670044383de4fced6723dc3e08bc18e17e1a76. 9 declared case sites.

Targets: js/share/share-card.js; js/share/share-card-layout.js; js/net/qr.js; js/race/daily-challenge.js; js/core/script-loader.js; js/ui/results-sheet.js.
Fixtures/setup: 12–30 recording 2D context; File/navigator/download and NativeDownload stubs; DailyChallenge Map store 100–124; OffscreenCanvas/font spy 137–157; async script injection 177–210; pixel fill raster and jsqr decoder 220–243.
Evidence limits: Delivery branches and CPU paint/QR decode are real API contracts with stubbed native/browser surfaces. PNG blob encoding is a stub, text raster is omitted in decoder fixture, results-sheet hook is source-only.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| paint executes layout ops on a generic 2D context (33–43) | 40–42 | recordingContext, card.paint. |
| deliver shares a PNG file when supported (45–55) | 52–54 | card.deliver. |
| deliver treats AbortError as choice and falls back on other share failures (57–73) | 61–65, 68–72 | cancelled.deliver, fallback.deliver. |
| results-sheet exposes SHARE CARD beside the daily copy chip (75–79) | 77–78 | Source-content / schema guard against the targets above. |
| deliver reports native sharing, cancellation and real failures (81–97) | 89–90, 92, 94, 96 | card.deliver. |
| Daily Challenge exposes a delivery hook built from its canonical result (99–132) | 125–131 | String, c.charCodeAt, absSrc, t.toFixed, Daily.create, daily.open, daily.record, daily.shareCard. |
| render waits on both card fonts, paints the layout with a real QR, encodes PNG and frees the canvas (136–174) | 146, 158–162, 164, 170, 173 | String, absSrc, card.render, qr.modules.reduce, bySize.set, bySize.get, bySize.values. |
| a solo share card loads only the QR encoder before painting its link (176–214) | 211–213 | String, injected.push, absSrc, el.onload, card.render. |
| the painted share-card QR decodes without inversion on every spec (219–246) | 244 | absSrc, String, card.paint, L.layout, jsQR. |

## tests/unit/share-code.test.mjs

Read 1–579; SHA-256 f9dd89f2a9b885e0d88cabeedeca36035e399ee5dbd2ed3afde437a7915c7bad. 23 declared case sites.

Targets: js/ui/share-code.js; js/car/custom-liveries.js; js/core/store.js; js/garage/setup-sheet.js; js/car/liveries.js; js/ui/title-flow.js; js/ui/title-menu.js.
Fixtures/setup: 16–72: Map store, synthetic location/history/catalog/career/daily with real CustomLiveries + ShareCode; editor slices 102–120; quotaHarness 413–436 uses real GameStore and reloadable faulting storage; garage-defaults recovery fixture 558–571.
Evidence limits: Envelope, apply, collisions, undo and durable recovery contracts execute in VM. Source pins cover title hooks; date-dependent continueHint uses current UTC day. No native storage, navigation UI, real compression/browser share interaction.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| setup encode/decode round-trip (74–86) | 78–80, 82–85 | ShareCode.encode, ShareCode.decode. |
| livery encode/decode keeps colours (88–99) | 92–93, 95–98 | ShareCode.encode, ShareCode.decode. |
| a fully customized editor livery round-trips every optional paint field (101–131) | 117, 122, 124–125, 129–130 | absSrc, editor.slice, editor.indexOf, ShareCode.encode, ShareCode.decode. |
| daily encode/decode (133–146) | 139–140, 142–145 | ShareCode.encode, ShareCode.decode. |
| corrupt and unknown-team codes are refused (148–153) | 150, 152 | ShareCode.decode, ShareCode.encode. |
| apply setup writes store and never calls startRace (155–174) | 170–173 | ShareCode.encode, ShareCode.decode, ShareCode.apply. |
| hash consumer clears #share= and does not invoke startRace (176–196) | 192–195 | ShareCode.encode, ShareCode.consumeHash, ShareCode.apply. |
| title-flow source never calls startRace from share apply hooks (198–203) | 200–202 | Source-content / schema guard against the targets above. |
| lastSession round-trips and continueHint prefers career then daily then session (205–246) | 207, 209–210, 219, 233–234, 245 | ShareCode.recordSession, ShareCode.lastSession, withCareer.ShareCode.continueHint, withDaily.ShareCode.recordSession, withDaily.ShareCode.continueHint. |
| career continueHint names the save's own calendar, not the build's Tracks.SEASON (251–267) | 258–259, 265–266 | ShareCode.continueHint, last.ShareCode.continueHint. |
| continueHint never offers yesterday's daily (272–289) | 284, 286–288 | d.setUTCDate, d.getUTCDate, d.toISOString, h.ShareCode.continueHint, daily. |
| a livery code never trims the player's customs; at the cap it refuses honestly (294–327) | 309–315, 320, 322–324, 326 | ShareCode.encode, ShareCode.consumeHash, ShareCode.apply, after.map, mine.map, mine.slice, ShareCode.decode, got.some. |
| a shared custom livery that collides with the catalog is renamed and selected (329–340) | 335, 337–339 | ShareCode.decode, ShareCode.encode, ShareCode.apply. |
| catalog-collision import preserves an unrelated custom using the synthesized suffix (342–356) | 348, 350–355 | ShareCode.decode, ShareCode.encode, ShareCode.apply, after.map. |
| selected-only livery share falls back when its id is absent (358–365) | 362–364 | ShareCode.decode, ShareCode.encode, ShareCode.apply. |
| a setup code keeps the player's previous sheet and UNDO restores it (370–397) | 382–383, 387–388, 390–392, 396 | ShareCode.encode, ShareCode.consumeHash, ShareCode.apply, ShareCode.decode. |
| CONTINUE's lastSession never carries a season or career flow (402–410) | 405, 407, 409 | ShareCode.recordSession, ShareCode.lastSession. |
| quota-refused backup never overwrites setup or prior recovery, even after reload/retry (438–456) | 447–450, 454–455 | quotaHarness, q.reload, q.fail, ShareCode.apply, setupImport. |
| partial livery durability rolls back session values and keeps reload recovery (458–483) | 469–471, 473, 475–477, 479, 481–482 | quotaHarness, q.reload, q.fail, ShareCode.decode, ShareCode.encode, ShareCode.apply, setupImport, ShareCode.undo. |
| Undo retains recovery across failed restore and failed cleanup, then retries (485–504) | 489, 491–492, 494, 496–497, 499–500, 502–503 | quotaHarness, q.reload, ShareCode.apply, setupImport, q.fail, ShareCode.undo. |
| partial multi-key Undo blocks replacement after reload; completed imports stay one-deep (506–529) | 514–515, 517, 519–520, 522–523, 525–528 | quotaHarness, q.reload, ShareCode.decode, ShareCode.encode, ShareCode.apply, q.fail, ShareCode.undo, setupImport. |
| failed completion marker leaves durable pending recovery; failed Undo marker changes no values (531–552) | 536–537, 539–540, 542–543, 546–548, 551 | quotaHarness, q.reload, q.fail, ShareCode.apply, setupImport, ShareCode.undo. |
| UNDO of a setup code on an empty store leaves the key absent, not pinned to the garage default (#2191) (557–579) | 572–573, 575–578 | String, absSrc, ShareCode.encode, ShareCode.apply, ShareCode.decode. |

## tests/unit/shared-math.test.mjs

Read 1–291; SHA-256 7c622c39581f31a96b4eb12b8bc76c86d7387227451681be18f98e57baa8e016. 15 declared case sites.

Targets: js/core/mat4.js; the JavaScript scalar consumer tree.
Fixtures/setup: 34–41 actual M4/V3 lexical VM exports; jsFiles/PRIVATE_DEF/EXEMPT 116–137; near16 assertion helper 198–203.
Evidence limits: Scalar and matrix properties use numeric examples/sweeps; private-definition guard is line-oriented regex with explicit Three.js exemption. wrapDelta sweep is one-period difference only. No GPU projection/render evidence.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| clamp pins to the range and passes interior values through untouched (46–55) | 47–51, 53–54 | M4.clamp. |
| clamp keeps the two edges that made the Math.max/Math.min copy different (57–70) | 60, 65–66, 69 | M4.clamp. |
| lerp is exact at both ends and extrapolates past them (72–78) | 73–77 | M4.lerp. |
| wrapDelta takes the short way round a circular axis (80–92) | 82–83, 85–86, 89–91 | M4.wrapDelta. |
| wrapDelta over 2π folds a heading the short way (94–99) | 96–98 | M4.wrapDelta. |
| wrapDelta is exactly what the migrated sites hand-wrote (101–111) | 108 | M4.wrapDelta, ladder. |
| no js/ file re-declares a private clamp or lerp (139–153) | 149–152 | jsFiles, EXEMPT, ln.trimStart, PRIVATE_DEF.test, ln.trim. |
| the ratchet's regex actually fires on the shapes it is meant to catch (155–172) | 163, 171 | PRIVATE_DEF.test. |
| the shared helpers are actually consumed — the migration is not decorative (174–180) | 177–179 | jsFiles. |
| mulTo is associative-with-identity and composes in the documented order (205–218) | 215–217 | M4.ident, near16, M4.mulTo. |
| invertTo round-trips a non-trivial transform, and is safe on a singular one (220–230) | none directly (see helper assertions) | M4.ident, M4.lookAtTo, M4.invertTo, near16, M4.mulTo. |
| perspectiveTo puts the near plane at -1 and the far plane at +1 (232–245) | 241–244 | M4.perspectiveTo, M4.ident, depthOf. |
| orthoTo maps the box corners onto the unit cube (247–259) | 254, 257 | M4.orthoTo, M4.ident, apply. |
| lookAtTo builds an orthonormal basis that puts the eye at the origin (261–280) | 270, 273–275, 278 | M4.lookAtTo, M4.ident, at. |
| V3.norm returns a unit vector and refuses to divide by zero (282–291) | 284, 287, 289–290 | V3.norm, n.toFixed. |

## tests/unit/shared-track-foundation-characterization.test.cjs

Read 1–416; SHA-256 165b807ad443759780f1bd53cce9fd5481f79549b3da9a6448869198e1855a05. 5 declared case sites.

Targets: tools/manifest.cjs TRACK_VM/LAZY_SCENERY; js/track/tracks.js and manifest track modules.
Fixtures/setup: 28–80 real manifest-loaded VM with GLX mesh observers; 82–116 cloned definitions and neutral synthetic ring; grounding sample 207–246; capture pre-strip/pre-compaction counts 332–348; mesh observer 369–390.
Evidence limits: Real CPU track builds characterize transforms, grounding, barriers, suppression and finite mesh indices; no GPU upload or rendering. Fleet mesh loop may narrow via APEX_CIRCUITS and unknown scope can select none; structural roster assertions remain unscoped.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| startFrac and reverse transform source control points and authored fractions (118–184) | 155–161, 171, 173, 179–180, 183 | pathData.pts.map, points.map, Tracks.LIST.find, wrap, smoothXZ, mapDressing, raw.hwZones.forEach, mapFraction. |
| open and street grounding follow their current terrain profiles (206–271) | 250, 252–253, 256–259, 261–262, 264–265, 268–269 | Tracks.LIST.find, copyDefinition, distances.map, api.anchor, api.groundYAt, Tracks.build, Tracks.terrainY, sample, open.rows.at, open.rows.find. |
| recordBarrier wraps partial ranges and treats 0 to 1 as a full lap (273–316) | 300, 302, 304–306, 312, 314–315 | Tracks.build, circleDefinition, api.recordBarrier, indices.push, changed, owned, right.includes, left.includes. |
| road-overlapping place helper is suppressed as a whole (331–364) | 361–363 | harness.observe, Tracks.build, capture, circleDefinition, api.place. |
| all current track mesh buffers are finite and structurally indexable (366–416) | 412–415 | harness.observe, s.trim, Tracks.LIST.filter, SCOPE.includes, Tracks.build, Tracks.LIST.map, Tracks.SEASON.every, ids.includes. |

## tests/unit/sheet-per-screen.test.mjs

Read 1–78; SHA-256 e62bab7bdf4a8c2363257f1c43b6b6b74cefe548b7f300f1e413e3580241faa1. 1 declared case sites.

Targets: index.html; js/ui/sheet-shape.js parent scale contract.
Fixtures/setup: 25–61: real shell text and custom quote-aware stack tag parser.
Evidence limits: Static DOM parent uniqueness protects shared scale host; runtime-injected sheets and browser HTML parser repair behavior are outside scope.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| no two .sheet elements share a parent (the --sheet-eff-scale host) (64–78) | 66–67, 74–77 | sheetParents, seen.has, dupes.push, seen.set, seen.get. |

## tests/unit/sheetshape-batch-measure.test.mjs

Read 1–89; SHA-256 f0aaba49ea551c4b8a27d6ec2e8ba239ebbce4a8be531cfafcf7388a63a68edf. 2 declared case sites.

Targets: js/ui/sheet-shape.js via tests/helpers/sheetshape-boot.mjs.
Fixtures/setup: 11–60 MutationObserver callbacks and ordered rect/style spies; 62–89 registry reclassify with two sheets.
Evidence limits: Ordering evidence proves both rect measurements precede first computed-style read for two synthetic sheets; not measured browser layout-flush cost.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| watchVisibility measures every sheet before any classify style read (11–60) | 46, 56, 58–59 | bootSheetShape, el.getBoundingClientRect.bind, rect, screen.appendChild, mk, cb. |
| reclassify measures the registry as a batch before classify style reads (62–89) | 86–88 | bootSheetShape, el.getBoundingClientRect.bind, rect, mk, sheet.observe, sheet.reclassify. |

## tests/unit/sheetshape-density-scale.test.mjs

Read 1–169; SHA-256 d74194e949c12389b0b41fa0fab9633fa2da011a1ff6796c27bc0faf25c6c086. 4 declared case sites.

Targets: js/ui/sheet-shape.js via tests/helpers/sheetshape-boot.mjs.
Fixtures/setup: 21–70 mini-DOM with scripted CSS properties, stale CssZoom, observers and optional queued frames; 121–134 controlled delayed fit layout fixture.
Evidence limits: Deterministic density/settlement scheduling under modeled layout; does not establish every browser delays fit or emits observer events identically.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| sheet density releases compact at UI SIZE 50% even when currentCSSZoom is stale (72–116) | 101–102, 112–115 | el.classList.add, host.appendChild, sheet.observe, sheet.reclassify. |
| UI SIZE settles density after a fit-cap write's next layout paint (136–146) | 138, 140–141, 144–145 | fittedScaleFixture, b.scale, b.frame, b.el.style.getPropertyValue. |
| a newer UI SIZE cancels a pending settlement and owns both new frames (148–158) | 151, 153, 155–157 | fittedScaleFixture, b.scale, b.frame, b.el.style.getPropertyValue. |
| unrelated HUD style mutations never schedule UI SIZE classification (160–169) | 167 | fittedScaleFixture, b.styleMutation, b.frame, b.dom.document.documentElement.style.setProperty. |

## tests/unit/sheetshape-keyboard.test.mjs

Read 1–286; SHA-256 e3e9f67f728aaeb15ca9285d926e338e91661f00be2cd8ce82f53761edc58da5. 9 declared case sites.

Targets: js/ui/sheet-shape.js via tests/helpers/sheetshape-boot.mjs.
Fixtures/setup: 53–95 independently scriptable layout/visual viewport, queued RAF/timers, event maps; 252–258 Home Screen launch geometry and CSS.
Evidence limits: CPU mini-DOM reproduces event order, keyboard band, shape/density and scroll resets; CSS consumption and device/PWA timing remain browser concerns.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| --kb clears when the rotation that stranded it finishes (97–129) | 104, 113–114, 126–128 | fire, kb. |
| a window resize alone re-derives the band from the current pair (131–144) | 139, 143 | fire, kb. |
| the pinch and URL-bar guards still hold on the window path (146–158) | 152, 157 | fire, kb. |
| body shape follows a rotation whose size lands after its events (167–187) | 174, 179, 184–186 | fire, runTimers. |
| --kb clears on a silent size settle after a mismatched rotation (194–219) | 201, 209–210, 216–218 | fire, kb, runTimers. |
| title scrollers reset when body shape flips on settle (223–247) | 233, 242–246 | fire, runTimers. |
| Home Screen startup rechecks a viewport that settles without resize (260–268) | 262–263, 266–267 | bootHomeLaunch, runTimers. |
| pageshow re-arms settling for a restored Home Screen window (270–277) | 276 | bootHomeLaunch, runTimers, fire. |
| visual viewport resize updates title density as well as keyboard padding (279–286) | 285 | bootHomeLaunch, fire, runTimers. |

## tests/unit/sheetshape-registry.test.mjs

Read 1–134; SHA-256 f75d3187605564295daabdbd3838cbbbdaa1caa18ef0534077c75db6ad66aba0. 3 declared case sites.

Targets: js/ui/sheet-shape.js via tests/helpers/sheetshape-boot.mjs.
Fixtures/setup: 30–58: mini-DOM, RO observe/unobserve spies, MO callbacks and attached managed card.
Evidence limits: Checks detached-node measurement/unobserve outcomes and pruning gate; no heap snapshot, actual GC or measured canvas memory release.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| a detached managed element is dropped from the registry and unobserved (60–86) | 70, 74, 78–82 | makeCard, sheet.observe, rect, sheet.reclassify, card.remove. |
| closing a popup prunes it without waiting for a resize (88–104) | 90, 102–103 | cb, makeCard, sheet.observe, card.remove, fire. |
| the prune is gated: unrelated DOM churn does not sweep the whole registry (106–134) | 124–125, 132–133 | cb, makeCard, sheet.observe, stale.remove, noise.remove, fire, card.remove. |

## tests/unit/shell-ids.test.mjs

Read 1–114; SHA-256 a78c0cfb064a08597244e77ba9e80f2811613e5ac65cf6ad7485a3110a379375. 8 declared case sites.

Targets: tools/check/shell-ids.mjs; tools/check/ratchets.mjs; index.html and scanned JS hosts.
Fixtures/setup: mkTmpDir cleanup fixtures 46–54,68–76,80–89: tiny shell/lookup and isolated cockpit document; real tree scanner and ratchet loader.
Evidence limits: Static literal IDs, duplicate declarations, runtime exemption reasons and dynamic-read ceiling; dynamically assembled IDs are counted, not resolved; VM boot is deliberately avoided.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| every id the source looks up by name exists (30–35) | 32–34 | scan. |
| no shell id is declared twice (37–43) | 41–42 | scan, duplicates.map. |
| a duplicated shell id is caught (45–55) | 53 | mkTmpDir, scan. |
| the check actually resolves the shell, not an empty set (57–63) | 61–62 | scan. |
| a renamed shell id is caught (65–77) | 74–75 | mkTmpDir, scan, missing.map. |
| isolated cockpit document IDs are checked against their own host (79–90) | 86, 88 | mkTmpDir, scan. |
| every RUNTIME_IDS entry is still read, and carries a reason (92–101) | 97, 99 | scan, read.has. |
| the ratcheted dynamic-read count matches the tree (103–114) | 109, 111–113 | loadRatchets, scan. |

## tests/unit/ship-filter-paths.test.mjs

Read 1–81; SHA-256 681d3e79091c0e568b6f80808001b3e8877a7917a72a935ad7216576039f9ed8. 4 declared case sites.

Targets: tools/desktop/stage-files.mjs; .github/workflows/ci.yml; .github/workflows/pages.yml.
Fixtures/setup: 22–45 real workflow text, exact staged-name expectation and child Node emission helper.
Evidence limits: Allowlist emission executes pure module; workflow policy asserted as text, no Actions staging/filter execution or deploy.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| stage-files.mjs allow-list is non-empty and matches its two source lists (47–54) | 49–53 | stagedNames, names.join, names.includes. |
| ship-filter reads stage-files.mjs and fails loudly on an empty list (56–67) | 59–63, 65–66 | CI.split. |
| pages.yml stages via stage.mjs (same allow-list the ship-filter reads) (69–73) | 70–72 | Source-content / schema guard against the targets above. |
| emitted staged path list matches stage-files.mjs (ship-filter / Pages drift) (75–81) | 77–80 | emitStagedPathList, stagedNames. |

## tests/unit/shot-jobs.test.mjs

Read 1–218; SHA-256 21283cf55cb72f957d14e03d8b3c925ca563ecf22bbcc0e55d76c81dbdfa34d9. 15 declared case sites.

Targets: tools/shot/shot-jobs.mjs; tools/shot/ab-gallery.mjs; tools/shot/visor-lab-export.mjs.
Fixtures/setup: 18–19 artifacts batch directory; JSON/JSONL files 40–46,84–90; normalized synthetic capture matrices; sharp-generated paired PNGs, gallery lock and metadata 181–209.
Evidence limits: Parser/grouping and A/B filesystem validation execute without browser; image dimensions and persistence are checked, not rendered scene correctness. A/B fixture uses system temp despite repository scratch policy.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| imageFormatFor: extension and --jpeg (21–26) | 22–25 | imageFormatFor. |
| normalizeJob defaults and safety (28–37) | 30–33, 35–36 | normalizeJob. |
| parseShotArgv single + batch + raster (39–64) | 48–50, 53–55, 57–59, 62–63 | parseShotArgv, groupJobsByTrack, SHOT_USAGE.includes. |
| --clear is opt-in: off by default, on from the flag or a batch field (#2253) (66–73) | 67, 69–72 | parseShotArgv, normalizeJob, SHOT_USAGE.includes. |
| traffic and racing-line shot flags preserve AI cars and hide the suggested line (75–81) | 77–80 | parseShotArgv. |
| loadBatchFile accepts JSONL (83–92) | 91 | loadBatchFile. |
| batch groups only compatible warm scenes, including an unpinned first team (95–113) | 108–112 | raws.map, normalizeJob, groupJobsByTrack, shotSessionKey. |
| shared capture flags do not consume shot positionals and preview controls output (115–128) | 118–127 | parseShotArgv. |
| isolated batches keep every job in its own group (130–134) | 133 | parseShotArgv, normalizeJob, groupJobsByTrack. |
| job-specific comparison profile resets preview encoder and size (136–144) | 139–143 | parseShotArgv, normalizeJob. |
| per-job isolation is retained even when the batch otherwise reuses warm scenes (147–151) | 149–150 | normalizeJob, groupJobsByTrack. |
| --weather parses, validates, and splits batch groups (153–168) | 155–160, 164–167 | parseShotArgv, normalizeJob, groupJobsByTrack, groups.map, g.jobs.map, shotSessionKey. |
| A/B gallery validates capture recipes before launching a browser (174–179) | 176–178 | recipePairs. |
| A/B append, replace and failed imports preserve valid comparisons (180–210) | 190, 194, 196–197, 199, 201–203, 206–207 | os.tmpdir, sharp, addPair, add, file.startsWith, file.endsWith, file.slice, execFileSync. |
| A/B selectors derive scene metadata and isolate individual lens effects (212–218) | 214–217 | recipePairs, selectionFields. |

## tests/unit/shot-survey-runner.test.mjs

Read 1–154; SHA-256 fdccfdf3742ed2535664f5997040abf0b786cfa435462386ab0e93d42883a496. 3 declared case sites.

Targets: tools/shot/build-gallery.cjs; tools/shot/lib/survey-runner.mjs; tools/shot/shot-survey.mjs; tools/mcp/apex-extras.mjs.
Fixtures/setup: 12–20 artifacts tmp root; fake host source 24–49; shared custom SPEC 51; real CLI spawn 54–64 and MCP injected host 67–90 with environment/listener cleanup.
Evidence limits: Transport parity exercises real CLI/handler/manifests and collision gallery; fake PNG bytes/renderer readiness provide no capture or browser evidence.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| #1983: a fixture with colliding names keeps distinct gallery entries (92–112) | 98–100, 104, 106–108 | galleryEntries, buildSurveyGallery. |
| #1982: the real CLI and the real MCP handler produce the same survey manifest (114–134) | 116–117, 122, 124, 127–130 | normalizeSurveyRequest, cli.plans.get, runCli, runMcp, canonicalSurveyOutput. |
| #1982: a failed shot is a failed manifest for both real transports (136–154) | 142, 144, 147–150 | normalizeSurveyRequest, spec.plans.get, runCli, runMcp, canonicalSurveyOutput. |

## tests/unit/sim-bytecode-budget.test.mjs

Read 1–67; SHA-256 46d39be525c2fd9079bbf247d2bfd1530ebab1c9879ff394c621ffca24569efe. 2 declared case sites.

Targets: js/game.js via tests/helpers/game-source.mjs.
Fixtures/setup: 20–34 cap/budget/hot-name list and missing-listing policy; 36–51 child Node compile-only bytecode parser cached across cases.
Evidence limits: Measures compiler listing length, not simulation execution or TurboFan optimization/performance. Local no-listing skips; CI/explicit-required fails. Child status itself is not asserted; anti-vacuity checks updateCar >1000.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| every function of the physics step compiles under the bytecode budget (TurboFan cap 61,440 B) (53–61) | 57, 59 | bytecodeSizes, noListing, sizes.has, sizes.get. |
| control: the listing parser reads a real size (a 0-length parse would pass everything) (63–67) | 66 | bytecodeSizes, noListing, sizes.get. |

## tests/unit/skidmarks-cadence.test.mjs

Read 1–181; SHA-256 13c0f812d775cde9ed8301417028fbf6b979a1eb18a53f5056554679004455e8. 6 declared case sites.

Targets: js/fx/skidmarks.js; js/fx/particles.js.
Fixtures/setup: 20–39 VM SkidMarks, identity matrix and draw-count helper; seeded RNG 62–71 rain batch recorder; per-car timers 139–148; retained-coordinate ring probe 168–175.
Evidence limits: Cadence, AI quota/ring preservation and rain geometry tested through CPU draw submissions. No rendered appearance or browser framerate measurement; fixed seed controls rain scatter.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| two seconds of laying leaves the same trail at 30, 60 and 144 Hz (41–47) | 45 | laidOver. |
| rain re-seeds only newly visible drops when the governor sheds less (49–116) | 74, 78–79, 84–88, 97, 99, 111, 115 | makeRng, rng.unit, seedLog, absSrc, rain.init, data.subarray, rain.rainSeed, rain.rainShow, rain.rainActive, rain.rainUpdate. |
| the first stamp of a slide lands at once, and lifting off re-arms it (118–125) | 121, 124 | skids.stamp, count. |
| a caller that passes no dt is charged one nominal frame per call (127–131) | 130 | skids.stamp, count. |
| other cars stamp on their own cadence, inside a capped share of the ring (138–164) | 149–150, 153–154, 157–159, 161–163 | seedLog, SkidMarks.create, skids.stamp, skids.stampFor, count, skids.reset. |
| rival quota refreshes oldest rival marks without moving the player ring (167–181) | 176–178, 180 | IDENT.slice, skids.stamp, skids.stampFor, skids.draw, centers.push, centers.filter, centers.includes. |

## tests/unit/skill-hint-hook.test.mjs

Read 1–132; SHA-256 29bc4944354d8da1b0b373b7aa46efe8afb34892adb88c0a6193e82553f824c6. 8 declared case sites.

Targets: .claude/hooks/skill-hint.py; .claude/settings.json; tests/data/skill-routing/queries.
Fixtures/setup: 22–28 real Python hook process; YAML scalar samples/importlib mocked file 31–48; offline query scoring 85–95; notification/envelope matrices 103–131.
Evidence limits: Tests actual advisory hook and corpus floor; no live model routing or host hook invocation. Garbage/slash/notification envelopes must stay silent and exit zero.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| description reads continued YAML scalars without indexing another frontmatter field (30–51) | 49–50 | spawnSync, cases.map. |
| a race-weekend prompt names race-weekend first (53–57) | 55–56 | ask. |
| it never blocks and stays silent on slash commands, empty or garbage stdin (59–66) | 63–64 | hint. |
| APEX_SKILL_HINT=off prints nothing; generic prints only the rule (68–74) | 70, 72–73 | ask. |
| settings.json wires it under UserPromptSubmit with a short timeout (76–82) | 80–81 | cmds.find. |
| offline floor: the hint's top two hold the expected skill for >=85% of routing queries (84–99) | 96, 98 | f.endsWith, spawnSync, Number. |
| host notification events skip routing while user audit and notification requests still route (102–112) | 106, 109–111 | hint, ask. |
| host envelopes delivered as UserPromptSubmit skip routing; the same words typed by a user still route (114–132) | 124, 128–129, 131 | ask, envelope.slice, typed.out.startsWith. |

## tests/unit/skill-progressive.test.mjs

Read 1–618; SHA-256 c806ed6c147b801a7b2bd05d30602ae5eb4fc0914cd2f304fa77876e9c8a172b. 27 declared case sites.

Targets: .claude/skills canonical tree; .claude/agents canonical tree; AGENTS.md; .cursor/rules/apex-shared.mdc; tools/check/bloat-scan.mjs; tools/gfx/wgx-validate.mjs.
Fixtures/setup: 23–31 yaml parser helper with assertions; thin-index/references tables 50–55,89–141; folded-name/vocabulary maps 153–169,224–232; agent tier roster 314–333; recursive markdown walkers and real bloat-scan child 596–618.
Evidence limits: Static content, existence, YAML, CLI text and reporter shape contracts; not live skill capability or agent enforcement. Historical removed names are intentional negative fixtures. Bloat scan shape allows negative slack; ratchets suite owns health.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| real YAML validation rejects colon-space descriptions and duplicate metadata (33–37) | 34–36 | frontmatter. |
| mcp-probe SKILL.md stays a thin index (not the war-story dump) (39–45) | 42–44 | skill.split, skill.includes. |
| mcp-probe references keep the measured traps and recipes (47–62) | 58, 61 | scene.split. |
| every skill: name matches folder, description has a trigger, body ≤ 500 lines (64–84) | 75–79, 83 | d.isDirectory, frontmatter, fat.push. |
| previously-fat skills stay split (index + references/) (86–148) | 144–146 | skill.split, ref.replace. |
| the 2026-09 skill set: folded and deleted skills stay gone, the pointer stays thin (150–217) | 170, 174–175, 180–184, 186, 191, 194–195, 197, 199–200, 202–203, 216 | d.isDirectory, catalog.recipes.map, e.isDirectory, walk, e.name.endsWith, env.push. |
| a folded skill's trigger words live in the hub description (219–238) | 236 | frontmatter. |
| skills do not recommend the retired test:career group (240–258) | 257 | d.isDirectory, e.isDirectory, walk, e.name.endsWith. |
| skills only name real test-bg groups (260–285) | 284 | k.startsWith, k.slice, e.isDirectory, walk, e.name.endsWith, flags.has, groups.has. |
| wgx-validate Usage lists --static as the no-browser gate (287–293) | 290–292 | Source-content / schema guard against the targets above. |
| verify-agent stays --fast, never starts Playwright, and carries the --base worktree mode (295–307) | 297–300, 302–306 | Source-content / schema guard against the targets above. |
| every custom subagent declares name, description, and model (309–349) | 314–317, 338–341, 343, 345–347 | f.endsWith, files.sort, frontmatter, f.replace, String. |
| review-pass contracts: no stale commands or steal phrases (351–396) | 354–357, 370, 373, 376–377, 380–381, 384–385, 388, 391, 394–395 | e.isDirectory, walkMd, e.name.endsWith, fn, apexGfx.push, frontmatter. |
| coverage skills exist for input, season, data-hub, and AI (398–420) | 401, 404–406, 409–410, 412–413, 415–416, 418–419 | frontmatter. |
| readonly review agents stay --fast and never start Playwright (422–462) | 426, 429–432, 434–437, 440–441, 443–447, 450, 456–461 | frontmatter. |
| every mcp__ tool an agent body names is in its tools: list (468–485) | 483 | x.endsWith, frontmatter, String, body.match, tools.has, t.startsWith, grants. |
| do not grow a parallel Cursor skills or agents tree (487–498) | 492–496 | Source-content / schema guard against the targets above. |
| apex-shared.mdc stays a pointer, not a second AGENTS.md (500–513) | 504–512 | Source-content / schema guard against the targets above. |
| file-family skills keep their file anchors in the body (515–525) | 523 | Source-content / schema guard against the targets above. |
| check-changes names the apex-tools MCP wrap (527–532) | 529–531 | Source-content / schema guard against the targets above. |
| skills README and AGENTS.md point at the wrap map (534–540) | 537–539 | Source-content / schema guard against the targets above. |
| AGENTS.md points at mcp-probe recipes for renderer probes (542–546) | 544–545 | Source-content / schema guard against the targets above. |
| css-play names the css-play CLI and Playwright DOM commands (548–555) | 550–554 | Source-content / schema guard against the targets above. |
| survey-ui-matrix names the layout-audit CLI recipes (557–562) | 559–561 | Source-content / schema guard against the targets above. |
| skills README says the committed shell reads ?v=dev and the deploy stamps hashes (564–570) | 566–569 | Source-content / schema guard against the targets above. |
| slim-bloat is the Claude-simplify analog and stays a thin index (572–593) | 575–583, 585–588, 590–592 | frontmatter, skill.split. |
| bloat-scan reports ratchet slack and skill sizes as JSON (595–618) | 599, 601, 603–605, 614, 616–617 | spawnSync, j.files.find. |

## tests/unit/skill-routing-eval.test.mjs

Read 1–147; SHA-256 a169f698db9fcb90fd1eae0764a13dcef90898b0775d3d8ae34d17589857247a. 5 declared case sites.

Targets: tools/check/skill-routing-eval.py.
Fixtures/setup: 14–70 temporary artifact tree, executable fake claude emitting split stream-json/tool events, query corpus and Python runner; 124–135 legacy/current comparison JSON.
Evidence limits: Deterministic CLI parsing/scoring/majority/grace/cwd evidence against canned events; no live LLM behavior, authentication or network.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| --only filters sources; header records the claude version and model; cwd defaults to the script's repo (74–90) | 77–89 | run, cwds. |
| --grace records late:<skill> within K calls; --alias rescores a merged skill; --root sets cwd (92–111) | 96–97, 99–107, 110 | run, cwds. |
| --runs N takes the majority and records agreement k/N (113–121) | 116–120 | run. |
| --compare prints the per-skill base→head table and flipped queries (legacy list input too) (123–142) | 137–141 | row, execFileSync. |
| --help works and --queries/--out are required without --compare (144–147) | 145–146 | execFileSync. |

## tests/unit/skill-smoke.test.mjs

Read 1–30; SHA-256 0517c9445212d5081c2263457358949e6495f68790a43f09485593a30ebf5e42. 8 declared case sites.

Targets: tools/check/skill-smoke.mjs; tools/check/skill-smoke-recipes.json.
Fixtures/setup: 4–9 real recipes plus empty/failing/timeout injected subprocess results; 12–13 deterministic clock and injected checker; 22–28 real plan CLI progress.
Evidence limits: Offline bounded AgentView check is executed when this suite runs; followups deliberately stay unverified. Plan/progress parsing is not live skill/browser verification.

| Case name and range | Assertion spans | Exercised operation / meaning |
|---|---|---|
| smoke catalog has a nonempty bounded recipe for every canonical skill (4–4) | 4 | loadRecipes, recipes.map. |
| smoke rejects unknown flags, missing names and contradictory modes (5–5) | 5 | parseArgs. |
| smoke plans preserve unverified followups without executing or claiming a pass (6–6) | 6 | planRecipe, loadRecipes, p.followups.every. |
| smoke rejects duplicate and empty fixture selections (7–7) | 7 | loadRecipes, validateCatalog. |
| smoke detects non-vacuity, failing subprocesses and timeouts (8–8) | 8 | loadRecipes, checkRecipe. |
| smoke executes a real bounded AgentView contract and retains its scope (9–9) | 9 | checkRecipe, loadRecipes, result.followups.every. |
| smoke progress tracks recipe transitions and failures without claiming unfinished work (11–20) | 14–19 | loadRecipes, runRecipes, events.push, events.map, events.every. |
| smoke progress CLI keeps stdout as one complete JSON and stderr opt-in (21–30) | 25, 27–28 | spawnSync, events.at. |

## Dependency and comment cleanup findings

- All assigned tests import Node builtins plus actual local helpers/modules; third-party dependencies are yaml, sharp and jsqr. Shader compiler executables and python3 are external prerequisites with policies described above. Manifest-driven track code, real shell/workflow text and canonical skill/agent trees are read-time dependencies, not proven run results.
- Temporary tiny shell source files, canned executable/skill-read names, synthetic track IDs, planted shader failures and removed skill names are intentional positive/negative fixtures. They do not imply missing production modules. No archive paths are recorded here.
- Comment cleanup candidates: shared-track-foundation header lines 2–3 says the known full-lap modulo behavior will change, while case 273–316 already asserts full-lap handling. Its lines403–409 retain old fleet-count history immediately before line410 delegates counts elsewhere.
- shared-math header lines19–20 claims a no-private-wrap ratchet, but PRIVATE_DEF (133) checks clamp/lerp only; wrapDelta has semantic and consumption checks. Matrix case205 title says associative but assertions208–217 establish identity and composition order only.
- share-card render preamble134–135 and shared-math historical mutation narrative185–191 describe former coverage gaps; preserve as dated history or shorten to current intent to avoid sounding like present coverage. shell-ids line17 pins an incidental VM-test count; leave qualitative rationale instead.
- skill-progressive folded-skill case title150 and failure170 label the set 2026-09 even though the list includes October folds. Removed-path regex assertions are intentionally negative; describe their meaning without resurrecting their old paths.
- shot-jobs A/B fixture181 uses os.tmpdir rather than repository artifacts/scratch, contrasting its sibling survey test explicit policy. Initial batch fixtures40–46 and84–90 create a fixed artifacts directory without teardown. Mapping only: no cleanup edits made.
- Weaknesses worth preserving in review: share-card-data line36 self-comparison; Shanghai audit tolerates missing matching findings unless source contract still exists; fleet scope can select no tracks; sim budget parser ignores child exit status; static regex guards generally assert shape rather than runtime behavior.

No runtime source edits, tests, browser work, commits or batch-status changes were made by this lane.

Independent cleanup review correction: the shared-track-foundation header count is accurate: five literal declarations at118,206,273,331,366. The earlier six-case candidate was rejected; see comment-cleanup.md and its evidence.
