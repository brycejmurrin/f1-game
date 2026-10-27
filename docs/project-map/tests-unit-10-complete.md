# Unit batch 10 — complete read and contract map

Read-only mapping on 2026-10-27. All 19 assigned files (4,850 physical lines) were read completely; no tests, browser sessions, source changes or commits were performed. The initial oversized combined read was truncated and discarded; each affected file was reread in the bounded ranges below. Definitions were navigated with attached apex-lsp (Collide, CockpitOpts, CarMesh, ContactGeometry, ControllerProfiles, LiveryTex, GameCams, CarDraw, RealReplay, Input); tool sources were followed directly. This report distinguishes runtime assertions, source pins and local mathematical replicas. It reports contracts, not passing verdicts.

## Full read ledger

SHA-256 hashes identify the exact bytes read. Ranges are inclusive and cover every physical line, including comments/imports/helpers. Assertion spans below are inclusive source lines; helper assertions are noted separately. Values inside loops denote one assertion site exercised across the listed fixture grid.

| File | Lines | Read ranges | SHA-256 | Cases |
|---|---:|---|---|---:|
| tests/unit/cockpit-wheels.test.mjs | 855 | 1–300, 301–600, 601–855 | 033c989d06adefdab7ea5019082f9d01e1033de9d5d58b124096fb1e9a174b28 | 35 |
| tests/unit/collide-wall-limits.test.mjs | 66 | 1–66 | 859e191aae31c8673dc761ca9738a4219376e29628b377c21c78801c134b14ad | 2 |
| tests/unit/collision-ai-fixes-vm.test.mjs | 281 | 1–281 | b4684a49f5e284ffbbe06350ea89263328bc0a9e94ca03c8a58c4281f7841875 | 14 |
| tests/unit/collision-contact-vm.test.mjs | 732 | 1–260, 261–515, 516–732 | ae4e72dd88e1ea3aeb9abe6801b013d3c79a684f1b818b82de337cc1ff1bcb38 | 28 |
| tests/unit/collisions-deep-vm.test.mjs | 358 | 1–358 | fd31bfca1bc74d2ea3c919143d963ae98b50435974dc76f465e487134a67308d | 15 |
| tests/unit/collisions-vm.test.mjs | 103 | 1–103 | 6e713e66d71ff9b6fd5fe5ba6a7df6e8ed08bca34e4b854ab6e965cbb46f3584 | 3 |
| tests/unit/comment-citations.test.mjs | 183 | 1–183 | 1a854d52bebaedb40f858d0e01d4021cd4a2a8d6ce8ef208a6bf87cfcebb7295 | 2 |
| tests/unit/committed-images.test.mjs | 77 | 1–77 | 90a26558f42c0b5b81913db8e7c14cddfdd1d16ba9f4aa76c4095077f140cbe4 | 4 |
| tests/unit/component-inventory.test.mjs | 102 | 1–102 | 95758726ece291eda1bae301a0b2e10175dd5c0f5434b3d8b20d674af1ca1b40 | 4 |
| tests/unit/compress-audio.test.mjs | 78 | 1–78 | 805b58c56ed882de39bd5c3cd403af27226dfef401296e32e0d57ca479416e1e | 4 |
| tests/unit/conflict-cure.test.mjs | 115 | 1–115 | 072dd5b9001f710830a5f0cd94ecf2066c1e0ecdb4bb0a257126c1d8ef4eb5b9 | 4 |
| tests/unit/contact-geometry.test.mjs | 260 | 1–260 | 2aa26648fe528f601a56c945545dcc53a967bb72457665ac97f15692ba66d950 | 18 |
| tests/unit/context-cap-hook.test.mjs | 72 | 1–72 | 86174f71926598a378dca1abbde23a615080084ce48e5b7f855e395036a0923f | 3 |
| tests/unit/controller-profiles.test.mjs | 150 | 1–150 | 40be85d690cf27283f489f5e6cf9fc7a88fcb0f918b349668fdad52d0ad4b369 | 10 |
| tests/unit/coplanar-faces.test.mjs | 192 | 1–192 | 1b9a421f3a635df315fb8cd96f5047add64d7f7ac0888770dfcdd9f47d015baf | 7 |
| tests/unit/cover-legibility.test.mjs | 195 | 1–195 | a681e743e6474d82b1acdc224df32515fdfbfac020d15f4806a49f3d0d21ed71 | 1 |
| tests/unit/coverage-merge.test.mjs | 118 | 1–118 | ee74374094eb7d738fd2ec7039906d9af77bfe6d70f6f22502390fee34f7ce6c | 6 |
| tests/unit/crest-marks.test.mjs | 818 | 1–280, 281–560, 561–818 | e0bda010c07a12b7bff26b4ce694b3ee1bc38bf67a7b622c34a9f66283b3c047 | 29 |
| tests/unit/cross-file-paths.test.mjs | 95 | 1–95 | 5a63067f2a971a5977397b5cdcfedcde610e0bba5b9f35a3e5ab2f6bee97cfb4 | 9 |

Total: 198 named top-level cases. Each case appears once below; table contracts paraphrase the asserted behavior instead of relying on test names.

## Case contracts and evidence

### tests/unit/cockpit-wheels.test.mjs

Production / policy targets: CockpitOpts at js/camera/cockpit-opts.js (CHOICES 24, halo 154, layout 228, presets 259); GameCams at js/camera/vantage.js (seat 99/103, HEAD_MAX 127); CarMesh at js/car/car-mesh.js (wheel 1183, roll 1235, arms 1270–1340, cabin 1559, telemetry 1591/1793/1845, glass 1657/1692); CarDraw.create in js/car/car-draw.js; Car3D.build in js/car/car3d.js; source pins also js/camera/mode-switch.js, js/camera/cockpit-preview.js, js/ui/settings-export.js and css/hud.css.

Fixtures and wiring: Local loadOpts/loadMesh (21–53) stub store/log/camera and GPU mesh allocation; real mat4/options/mesh modules. carDrawVm from tests/helpers/car-draw-vm.mjs records chosen mesh and matrices; loadCar3D from tools/car/cockpit-pale-sweep.mjs supplies real team/parts/car construction. LIV (118), bounds/hasVertex (120–130), ray triangle firstMaterial (378–393), rig transforms (741–746) and headEyes (823–829) define sampled geometry evidence.

Limits and comment findings: Mesh/ray/recorded draw evidence is CPU geometry, not backend rendering, pixels, font legibility or actual mirror framebuffer. Sweeps are finite grids, nearest-vertex distance is not nearest-surface distance. Header enum list and source-pin-only description are stale: it now runs rig behavior and has more wheels/interiors/fairing. Arms geometry remains tested although source pins deliberately exclude drawing sleeves.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 55–67 | Off by default; accepted visor choices persist/reload, invalid choices reset to off, query wins. | 57, 59–63, 65–66 | CockpitOpts.visor/setVisor |
| 69–90 | Smoke preserves neutral/light legacy defaults; all 4×3 color/intensity combinations reload independently, invalid values fall back, capture queries override. | 71–73, 78–79, 83–84, 86–87, 89 | CockpitOpts visorColor/visorIntensity |
| 92–117 | Each optics/water control validates its own enum, persists and reloads, survives visor toggles, honors query overrides and defaults on invalid data. | 102, 105–107, 110, 112–115 | CockpitOpts visor optics/water choices |
| 132–145 | Exact wheel/seat/interior enums and initial values, storage writes, invalid fallback and capture-query precedence. | 134–137, 139–142, 144 | CockpitOpts.CHOICES / choice/setChoice |
| 147–159 | Five halo values map to 0–4; old boolean storage and boolean setter retain meaning; explicit off/thick/fairing queries work. | 148, 150–155, 157–158 | CockpitOpts.haloSize/setHalo |
| 161–176 | All wheel×seat layouts retain eye-relative wheel offsets and >=0.40 m depth; low/high/forward ordering and cache identity. | 164, 169–171, 174–175 | CockpitOpts.layout |
| 178–186 | Cockpit seat follows options; VISOR remains at its independent constants. | 180, 182, 184–185 | GameCams.seatFwd/seatUp |
| 188–196 | Exact screen-presence vector, no-argument selected-wheel query, and wheel/seat listener events. | 190, 194–195 | CockpitOpts.wheelHasScreen/onWheel |
| 198–214 | F1 LCD vertex exists; retro/round lack that large LCD and fit width/height/depth bounds, retain both palms; exact mesh wheel enum. | 201, 203, 206–208, 210–211, 213 | CarMesh.getCockpitWheel |
| 216–237 | All five cabin meshes build within ±0.33 m and tall-trim eye limits; livery changes free cache; classic glass has 12 vertices below 0.90 m. | 221–222, 226–227, 230, 232, 234, 236 | CarMesh cabin/glass/cache |
| 242–288 | Real rig emits the mounted/scaled wheel and telemetry for four seats; NONE omits wheel/readouts, screenless options omit screen telemetry and classic includes glass. | 271–275, 278–279, 281, 284–286 | CarDraw.drawCockpitRig |
| 290–313 | Source pins exclude sleeves in race/preview; require progressive damped roll, style LEDs, body cache key, halo sizing, screen-sensitive HUD class/listener and export enums. | 296–297, 299–303, 305–307, 311–312 | CarDraw rig / mode-switch / settings-export source |
| 317–333 | Every sampled mesh has aligned arrays, finite positions/normals, valid indices, unit normals and nonzero triangle area. | 323–326, 330 | CarMesh mesh builders |
| 335–374 | Fifteen 9-vertex lenses retain emissive/dark states; five fascia rows have bounded radii, positive gaps and hull containment, cached meshes, aligned orange LCD gear. | 338–340, 347–348, 366–368, 371–373 | CarMesh.getLedStrip/getGearDigit |
| 395–417 | First two teams × default/factory setup × body × seat: both lenses exist and a 5×5 ray grid first meets mirror material. | 408, 413 | Car3D.build mirrors |
| 423–445 | First three teams × two setups: cached two-band fallback covers lens corners, pale color bounds; source keeps limiter lit and live glass gated by drawing pass. | 429, 431, 435, 437, 440, 443–444 | Car3D.cockpitMirrorGlass / CarMesh.getMirrorFallback / CarDraw source |
| 452–495 | 7:2 HUD target, cached 8-vertex/12-index glass, exact lens corners and mirrored UV table; texel aspect error <2%; unsupported textured backend returns null. | 457, 459, 465, 467–468, 471–472, 481–483, 490, 494 | CarMesh.getMirrorGlass / HUD CSS |
| 497–506 | Faired halo adds <=20 triangles; finite normals/positions and carbon vertices above 1.05 m. | 501–502, 504–505 | Car3D.build halo |
| 508–517 | Bolster top exceeds standard wheel height by 0.045 m yet remains below low-seat eye. | 515–516 | Car3D.build bolsters |
| 520–529 | Body default/persistence/query/fallback and exact export enum. | 522, 524–528 | CockpitOpts.body/setBody / settings-export |
| 531–541 | Five modern wheels preserve LCD/depth/width/eye clearance and have distinct vertex arrays. | 535, 537–538, 540 | CarMesh.getCockpitWheel |
| 543–557 | Every body mesh is finite, <=1580 triangles, below low-seat eye, with pairwise distinct positions. | 548–549, 554, 556 | Car3D.build body variants |
| 560–572 | All interiors/seats/rest-plus-head eyes occlude a 5×5 lower-front road ray grid before target, front-face only. | 569 | CarMesh.getCockpitCabin |
| 575–597 | All bodies/seats/head eyes have shoulders >2 m behind eye and occlude lateral/spin rays at five angles on both sides. | 589, 593 | Car3D bolsters + CarMesh cabin |
| 599–613 | All interiors/seats/head eyes occlude rear-floor and bulkhead sample rays. | 607, 609 | CarMesh.getCockpitCabin |
| 616–627 | Every enabled halo extends >0.50 m behind every seat eye. | 625 | Car3D.build halo |
| 630–650 | All halo/interior/seat combinations and selected widest head eyes occlude the rear mounting-end vertices. | 640, 646 | Car3D halo + CarMesh cabin |
| 653–665 | Modern/historic presets set coordinated fields; independent edit becomes custom; reload retains historic; custom/invalid preset preserve saved choices. | 655–661, 664 | CockpitOpts.preset/setPreset |
| 667–684 | Retro state emits expected draw counts/placement, reuses digit meshes, clamps negative speed, keeps finite transforms, adds aero/overtake lamps. | 672–673, 675, 678–679, 682–683 | CarMesh.drawRetroTelemetry |
| 686–697 | Throttle/brake generate separate filled status geometry, and 30 repeated states allocate no extra mesh. | 692–693, 696 | CarMesh.drawWheelExtras |
| 700–723 | Classic RPM/speed/energy needles use one shared mesh, correct 0/half/full independent angles and locations, clamp invalid/out-of-range readings, avoid rebuild across 120 states. | 705, 707, 709, 711, 713, 716–718, 720–722 | CarMesh.drawClassicTelemetry |
| 725–735 | Every trim separates carbon/padding/detail material IDs and retains matte headrest padding. | 729–730, 733 | CarMesh.getCockpitCabin |
| 748–759 | Roll is zero-centered, odd, strictly progressive, 1.4–1.6 rad full lock, small-angle slope -0.80, clamped beyond steer 1 and damp lambda >=10. | 751, 753–758 | CarMesh.cockpitWheelRoll |
| 761–816 | Every wheel/seat/side/steer cuff and sleeve has near-plane/angular/length clearance; matrix endpoints/basis/radius hold; two cached sleeves per frame and livery rebuild. | 770, 781, 786, 789, 791, 793, 801–802, 804–806, 812–815 | CarMesh forearmEnds/forearmMatrix/drawForearms |
| 832–855 | Head motion constants stay within small bounds; sampled shifted eyes are >=8 cm from nearest body vertex across three halos/all bodies/seats. | 834–836, 850–851 | GameCams HEAD_MAX / Car3D.build |

### tests/unit/collide-wall-limits.test.mjs

Production / policy targets: Collide.create / resolveCollisions in js/physics/collide.js (create 281), Tracks.wallAt/postLimits in js/track/tracks.js and Monza pit/post track data.

Fixtures and wiring: Shared createGame from tools/lib/game-vm.cjs boots/races Monza; place (26–35) puts two AI cars 30 m apart with zero motion and synchronized world poses.

Limits and comment findings: Isolates end-of-solver wall limits with no contact; does not test contact-driven motion into every pit/post or a browser frame.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 37–50 | Monza pit-wall fixture proves ordinary wallAt would not bind, then requires same-step pit-face clearance of 1.1 m. | 39, 42, 46, 49 | Collide.resolveCollisions pit clamp |
| 52–66 | Monza post fixture proves only the post binds, then requires post edge clamp and finite world writeback. | 54, 61, 64–65 | Collide.resolveCollisions post clamp |

### tests/unit/collision-ai-fixes-vm.test.mjs

Production / policy targets: Full game update/player physics/wall clamp and AI via tools/lib/game-vm.cjs; js/physics/collide.js, js/physics/ai-drive.js, js/game.js; Monza/Zandvoort/Jeddah circuit data and Tracks wall query.

Fixtures and wiring: One createGame boot with saved tuning; fresh/loadRace (28–41) restores physics/headless then races and jumps. __apex reset/aim/act/rival/jam/cars/probe/obs drive real fixed-step logic.

Limits and comment findings: 14 browser-twin cases claimed in header; browser equivalence/CI history unverified here. Trigger title says 0.6 s but <=40 frames allows 0.667 s; clear title says 0.5 s but loop allows 35 frames (0.583 s). Banking comparison is liveness ratio, not direct grip equality; done case does not independently check wrongWay.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 45–57 | Reverse crawl below threshold leaves wrongWay false. | 56 | Player wrong-way state |
| 59–74 | 25 m/s backward drive must trigger wrongWay in <=40 frames, observed within 60. | 72–73 | Player wrong-way state |
| 76–96 | WrongWay must first activate, then clear after turning forward within 35 frames. | 94–95 | Player wrong-way hysteresis |
| 98–111 | Backward-driving episode yields obs.done true (does not separately assert terminal wrongWay). | 110 | __apex obs terminal state |
| 115–132 | Coasting control stays >15 m/s and pinned-wall sample loses >1 m/s extra after ten ticks. | 130–131 | WallClamp / player push-in scrub |
| 134–151 | Throttle-held wedge rescues at a positive frame within 420 ticks to >3 m inboard. | 149–150 | Player auto-rescue |
| 155–175 | Two wedge episodes separated by reset each rescue at a positive frame within 420 ticks. | 173–174 | Grid/reset rescue timer |
| 179–196 | Overlapping rear rival exists and both player/rival contact timers become positive after six ticks. | 185, 194–195 | Collide rear contact timer |
| 200–208 | Ten-car jam yields finite x/prog/speed after 300 ticks. | 207 | Collide / AI jam liveness |
| 210–219 | Ten-car jam/full returned field average speed exceeds 10 m/s after 300 ticks. | 218 | Collide / AI jam speed |
| 223–241 | Zandvoort flat/banked episodes are finite and banked AI average exceeds half flat average. | 239–240 | AI banked grip integration |
| 243–258 | Four-second Zandvoort banking sample keeps minimum left/right clearance >-3 m and ends >5 m/s. | 255–257 | Player banked integration |
| 262–268 | Jeddah configured gap equals 3.4 m and observed right limit is hw+gap-1.1 within 0.05 m. | 266–267 | Tracks.wallAt / Jeddah data |
| 270–281 | After an outside-barrier placement and three ticks, Jeddah x is below hw+gap. | 280 | Player barrier clamp / Jeddah |

### tests/unit/collision-contact-vm.test.mjs

Production / policy targets: Collide at js/physics/collide.js (scanTraffic 227, create 281); AiDrive contact policy in js/physics/ai-drive.js; ContactGeometry in js/physics/contact-geometry.js; RealReplay.create in js/race/real-replay.js (260), RealRace/DataRealRace/SportingRegs and full js/game.js WATCH update.

Fixtures and wiring: Shared real-game Monza boot; straight/laneSteer (47–59) set reproducible lane episodes. Local formula models (169–171, 226–237, 359–371, 419) are distinguished below from shipped source checks. replayContactFixture (427–458) runs real contact/replay modules with straight-track wall/sample stubs and notification counters. WATCH uses tests/fixtures/openf1-baku-2026-race.json plus three explicit linear traces; netRearEnd (613–630) transfers authority to remote fixture.

Limits and comment findings: Arithmetic replicas alone cannot prove runtime classification; source pins connect selected formulas but remain syntax-sensitive. Fixed 1/60 scenarios and synthetic ownership exercise logic, not network transport or renderer. WATCH fixture exercises game DOM callbacks through VM, not browser controls. Performance gates count operations in a quiet field, not elapsed frame time. Historical measured comments were not remeasured.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 61–84 | Two-second initial sandwich really contacts; player minimum >=38.5 m/s from 40 and both AIs finish >38. | 79, 81, 83 | Collide side response / AiDrive.rubDecel |
| 86–105 | Three-second lane lean really contacts; player minimum >=43 from 45 and AI finish >40. | 101, 103–104 | Collide side response / AI steering |
| 107–130 | Rear bump arrives with >5 m/s closing, leaves <=15% closing in contact frame, accelerates front car above 40.5 and slows player below 50. | 123, 126, 128–129 | Collide rear impulse / AiDrive.bumpRestitution |
| 136–154 | Coasting finisher is scanner blocker but not tow target; trailing AI has zero contact ticks over three seconds. | 145–146, 153 | Collide.scanTraffic / AI queue |
| 173–181 | Local scaled formula classifies seven zero-offset gaps as rear; local obsolete formula misclassifies two controls. | 175–176, 179–180 | Local scaled model |
| 183–187 | Four local alongside examples classify side. | 185 | Local scaled model |
| 189–195 | Local formula changes classification ±0.01 m around aspect-ratio boundary for four progress gaps. | 192–193 | Local scaled model |
| 197–203 | Local scaled formula never classifies zero lateral offset as side, including coincidence. | 201–202 | Local scaled model |
| 205–213 | Shipped source must contain extent-scaled penetration comparison and omit obsolete raw comparison. | 210–212 | Collide pairContact source |
| 239–251 | Local extent formulas preserve old 2.4/1 m half-extents below 20 degrees. | 242–243, 245–246 | Local yaw extent model |
| 253–286 | Local yaw-reach table checks five rounded values, full geometry at >=60 degrees and coverage of 2.8 m sideways gap. | 256, 273–274, 279, 284–285 | Local yaw extent model |
| 288–298 | Local sampled lateral miss at 60/75 degrees exceeds 90 degrees; longitudinal extent shrinks at 90. | 292–293, 297 | Local yaw extent model |
| 300–325 | Local dense yaw sweep stays near analytic 2.6 m bound; parsed production max-pair span >=5 m drives bucket and cheap reject. | 312–313, 315, 319–324 | Local model + Collide broadphase source |
| 327–344 | Extracted production angle helpers ignore AI cosmetic/nonfinite yaw, honor human 90-degree yaw; source pins both extent gates. | 337–338, 340–343 | Collide extentAngle/bodyAngle extracted helper |
| 354–380 | Local bucket traversal model reverses order while preserving exact unordered pair set. | 376–377, 379 | Local bucket-walk model |
| 382–394 | Source pins alternating bucket/all-pairs relaxation and single forward separation pass. | 388–391, 393 | Collide relaxation source |
| 396–413 | Source pins local-body pre-step speed snapshot, pre-step restitution reference and live-relative-speed impulse. | 407–412 | Collide snapshot/impulse source |
| 415–423 | Local restitution model verifies threshold zero and strong ramp sensitivity; no production function invoked. | 420–422 | Local restitution model |
| 460–472 | Real replay fixture, 2/14 cars including yawed human: three solver steps preserve full serialized cars, no notifications/writebacks and no pair contact. | 467–469 | Collide ownsPose / RealReplay.owns |
| 474–487 | After ownership acquisition and crossing poses, prior sweep memory cannot rewind cars or emit side effects. | 485–486 | Collide sweep ownership gate |
| 489–498 | Unowned control exchanges speed, separates overlaps, clamps both x to 2 and writes world coordinates. | 494–497 | Collide ordinary solver |
| 503–515 | 22-car quiet motion pass uses <60 WeakMap.get calls. | 514 | Collide swept motion cache |
| 517–606 | Full VM WATCH hides competing instant replay, owns three traces, retains camera for retired/finished seat, pauses speed/HUD time and poses through recovery, bypasses simulated caution penalty while control watcher charges 10 s. | 529, 549, 551, 555–556, 562–564, 567, 578, 580, 583–587, 594, 603–604 | RealRace / RealReplay / game WATCH / SportingRegs |
| 632–637 | Straight net-owned front car gets no speed/contact writes; local rear absorbs full (1+e)×10 correction within 1e-6. | 634–636 | Collide rear impulse net owner |
| 639–649 | Net-owned striker gets no speed/contact writes; local front punt is between capped (1+e)×8 and full (1+e)×10. | 645–648 | Collide rear punt net owner |
| 656–670 | Heavy shunt really transfers speed, increments player hit count exactly once and reaches incident candidate accounting. | 667–669 | Collide FX / IncidentSim notification |
| 672–707 | 2/3/22-car paths notify every expected closing unordered pair once, align FX/debris/incident pairs, preserve frozen numeric physics, avoid separating duplicates and notify again in later step. | 689–691, 699–700, 704 | Collide pair notification bookkeeping |
| 713–732 | Unavoidable AI strike loses >40 m/s in one tick, keeps human below 10 m/s, and leaves both speeds finite. | 729–731 | Collide rear punt cap / AiDrive |

### tests/unit/collisions-deep-vm.test.mjs

Production / policy targets: js/physics/collide.js contact solver, js/physics/ai-drive.js policy, player/world integration in js/game.js and wall/kerb track logic; Monza/Monaco definitions.

Fixtures and wiring: Shared game VM; tuning/headless reset, console/rejection snapshots, startRace/startStreet, and noIncidents (25–43). Explicit rivals and fixed-step probes drive each episode.

Limits and comment findings: 15 browser twins; no browser parity executed. Open-wall title promises speed loss but asserts only reach/bounds. Desync title asserts only finite x/s/speed, not prog/s consistency. Five-car pileup actually spawns five rivals plus player. Incident disabling is only applied in explicit wall-isolation cases.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 45–71 | Side contact gives player min x<-0.15 and AI clears 2 m lateral gap before frame 12. | 69–70 | Collide side separation / AI contactGive |
| 73–90 | Heavy side overlap while steering toward rival retains minimum lateral separation >0.9 m during longitudinal overlap. | 89 | Collide side separation |
| 92–111 | Open-track wall episode reaches beyond road half-width but stays within hw+9.5; no speed assertion. | 109–110 | Player wall clamp |
| 113–128 | Corner/offset search observes player kerb flag. | 127 | Player kerb sampling |
| 130–149 | Rear ram sampled for 90 ticks has maximum minimum-axis penetration <1 m. | 148 | Collide rear separation |
| 151–170 | Monaco wall episode reaches barrier, max wall overshoot <0.01 m and ends below 40 m/s. | 167–169 | Player street clamp/scrub |
| 172–192 | Sliding wall episode has no recorded errors, finite x/s and max \|x\|<4×maximum half-width. | 188–189, 191 | Player drift/wall integration |
| 194–214 | Sandwich has no errors, finite player x and bounded \|x\|<hw+9.5. | 211–213 | Collide sandwich / walls |
| 216–231 | Coasting side rub maximum speed <=initial+0.5 m/s. | 230 | Collide side-rub scrub |
| 233–253 | Side rub pushes player left below -0.1 m while every lateral step remains <0.6 m. | 251–252 | Collide side displacement |
| 255–266 | Monaco outward rival shove retains \|x\|<hw+0.2. | 265 | Collide separation + wall clamp |
| 268–288 | Five rivals plus player over 90 ticks produce no errors, finite field x/prog and \|x\|<20. | 285–287 | Collide pileup integration |
| 290–308 | Start-line collision leaves finite progress and no backwards step >0.6 m over 120 ticks. | 306–307 | Collide progress wrapping |
| 310–326 | Contact/oscillating steering has no errors and finite x/s/speed; no explicit prog-to-s relation. | 324–325 | Player contact integration finiteness |
| 328–358 | Two-second Monaco traffic nest keeps rounded minimum speed >18 and overlap ticks <90. | 356–357 | Collide side-rub / traffic liveness |

### tests/unit/collisions-vm.test.mjs

Production / policy targets: Collide resolver and AI/world simulation through js/game.js and __apex in js/agent/apex.js.

Fixtures and wiring: One Monza game VM; fresh resets tuning/headless, mark/errorsSince inspect only new errors/rejections, helpers step at 1/60. pair/jam generate overlap fixtures.

Limits and comment findings: Three browser twins run logical simulation only; sampled windows and absolute bounds are not general overlap-free proofs. Jam test has no explicit returned-ID count assertion.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 40–66 | Pair separates while alongside: peak gap grows and exceeds 1.6; final selected x finite and \|x\|<12, no errors. | 59–61, 63–64 | Collide pair / world writeback |
| 68–88 | Five-car jam after 360 ticks has no errors, each selected car >12 m/s, \|x\|<12, and every pair progress gap>3 or lateral gap>1.4. | 76, 79–80, 86 | Collide / AI jam |
| 90–103 | Full field after 600 ticks has no errors, finite x/prog and \|x\|<18. | 97, 99–101 | Full game field integration |

### tests/unit/comment-citations.test.mjs

Production / policy targets: Repository comment policy implemented locally in this test: filesystem walk (50–90), espree comments (95–109), index (115–122), regex/heuristic/extraction (124–157), scanning js/css/types and tests/tools.

Fixtures and wiring: Live filesystem text, production-target line counts and espree parser. Self excluded; tests/tools excluded from resolution index; parser fallback heuristic and HTTP-containing comment skip.

Limits and comment findings: Header describes a ratchet but current second case requires zero. First case only checks range end beyond EOF, permits zero/reversed ranges and skips unresolved/ambiguous targets; second still rejects collected citations. Valid in-range semantic drift is unmeasured; js/css/types heuristic is not lexical comment parsing.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 161–177 | All resolvable scanned citation range ends are <=target line count; ambiguous/unindexed targets are ignored by this case. | 174–176 | citations + byPath/byBase resolution |
| 179–183 | Entire collected citation list must be empty, including unresolved targets: zero-citation policy, not a nonzero ceiling. | 180–182 | citations zero-population policy |

### tests/unit/committed-images.test.mjs

Production / policy targets: Tracked-image policy in this test; git ls-files, image suffix filter, docs legacy allowlist and filesystem stat.

Fixtures and wiring: Real Git index file list (28–29); 15 fixed legacy image paths; MAX_MB=4. No image decode.

Limits and comment findings: Checks tracked paths and working-tree sizes, not historical Git blob size or pending untracked images; deleted worktree paths count zero.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 31–34 | Tracked image scan contains >=10 images and at least one under assets. | 32–33 | git ls-files walk |
| 36–42 | Every tracked test image belongs to a Playwright snapshot directory. | 38–41 | tracked test-image placement |
| 57–66 | Docs/artifact/gallery/shot images exactly obey the 15-entry legacy allowlist, with no deleted stale allowance. | 59–63, 65 | DOCS_IMAGE_ALLOW policy |
| 68–77 | Each tracked non-asset image is <=4 MiB; files absent from worktree count as size zero. | 73–76 | MAX_MB size policy |

### tests/unit/component-inventory.test.mjs

Production / policy targets: css top-level .css declarations and docs/COMPONENTS.md, index.html and recursive js text; collect/family local scanner (27–44).

Fixtures and wiring: Live text; strips CSS block comments and scans selector-shaped class names; doc membership uses substring code tokens.

Limits and comment findings: No CSS AST, computed cascade, DOM usage or JS class construction proof. Dead class case proves documentation membership, not claimed dead count or absence of stale named dead rows; shared class case does not locate the mention inside claimed section.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 46–54 | Every alphabetic CSS class prefix family is named as a code token in the component doc. | 51–53 | collect / family / doc membership |
| 56–64 | Every family token named by the component doc still exists in CSS. | 62–63 | collect / family / reverse membership |
| 66–79 | All CSS class names absent as substrings from index/JS must be named by doc; no numeric count comparison. | 75–78 | collect / index+JS text / dead doc membership |
| 91–102 | Every class declared in >1 CSS file must be mentioned with dotted code token in doc. | 98–101 | collect duplicate-file sets / doc membership |

### tests/unit/compress-audio.test.mjs

Production / policy targets: tools/gen/compress-audio.mjs CAP_KBPS/TRACKS (29–38), scanMp3 (47–71), check (76–88); real soundtrack and assets/music/CREDITS.txt.

Fixtures and wiring: Synthetic MPEG-1 Layer III zero-filled frames, variable bitrate list, optional mono/ID3 (22–37); temporary replacement tree copies other tracks, cleans up in finally.

Limits and comment findings: Header/title includes resampling but bad-file case only changes bitrate and length; stereo/rate are exercised by real tracks and mono parser case, no bad-rate check fixture. Parser metadata/frames are not audio decoding/listening or encoder invocation.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 39–46 | Synthetic MPEG frames exercise exact counts/bitrate/duration/rate/channels, ID3v2 skip, mono and ID3v1 end; interior junk and Ogg bytes throw. | 41–45 | scanMp3 |
| 48–56 | Cap is 128; all listed real tracks pass check, have max bitrate <=cap, original listed bitrate >cap and >7000 frames. | 49–50, 53–54 | CAP_KBPS / TRACKS / check |
| 58–73 | Replacing one track with two frames (192/128) yields exactly over-cap and duration diagnostics; other tracks copied unchanged. | 69–71 | check |
| 75–78 | Every listed soundtrack basename appears in credits text. | 77 | TRACKS / CREDITS.txt |

### tests/unit/conflict-cure.test.mjs

Production / policy targets: tools/lib/conflict-cure.mjs resolveGenBlocks (32–62), mergeJson3 (76–98), mergePackageJson (101–105); used by deploy/sync tools but their invocation is not exercised.

Fixtures and wiring: SHELL HTML factory (20–32), three-way JSON objects, real temporary Git repository with divergent commits/conflicted merge and index stages; tests/helpers/git-fixture-env.mjs clears inherited Git environment.

Limits and comment findings: No deployed repo edits or real PR merge. Generated block retained side is later generator responsibility; this suite does not run regeneration or full deploy/sync protocol.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 34–40 | Generated-block internal conflict resolves to ours with no unresolved hunks/markers; outer shell remains exact. | 37–39 | resolveGenBlocks |
| 42–54 | Hand-DOM conflict and marker-spanning conflict remain unresolved; alternate title-art close spelling bounds the resolved span correctly. | 45–46, 48, 52–53 | resolveGenBlocks |
| 56–71 | Three-way JSON retains both sides independent edits/deletion and sorted dependencies, treats generated test-script clash as regenerable, reports real dependency/add-add clashes. | 61–65, 67, 69–70 | mergeJson3 |
| 73–115 | Real temporary Git merge proves both manual DOM edits and dependency additions survive resolvers, valid JSON ends in newline, and wholesale old-side checkout loses opposite edits. | 93, 96–99, 102, 104–106, 109, 111 | resolveGenBlocks / mergePackageJson / Git |

### tests/unit/contact-geometry.test.mjs

Production / policy targets: ContactGeometry in js/physics/contact-geometry.js overlap/sweep/impulse; Collide.create/pairContact/swept resolver in js/physics/collide.js; AiDrive.bumpRestitution in js/physics/ai-drive.js.

Fixtures and wiring: setup (6–18) loads real mat4/AI/contact/collide with straight 1000 m track, ownership flags, callbacks and optional counting Math proxy; car (98), close tolerance 1e-8. No full game or renderer.

Limits and comment findings: Sampled numeric conservation/operation counts only; not continuous collision proof across all rotation, track curvature, simulator authority or browser runtime. Infinity extent NaNs are explicitly preserved characterization, not asserted physically correct behavior.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 22–26 | SAT rejects one rotated AABB false positive and resolves sideways overlap depth 0.6. | 23, 25 | ContactGeometry.overlap |
| 27–33 | Swapping pair reverses normal with same depth; rotating geometry rotates normal and preserves depth. | 29, 32 | ContactGeometry.overlap |
| 34–39 | Linear sweep reports analytic first-contact time; rejects lateral near miss, separating travel and initial overlap. | 35–38 | ContactGeometry.sweep |
| 40–53 | 100 oblique impulse samples preserve x/y momentum, do not increase kinetic energy and yield positive normal impulse. | 44, 49–51 | ContactGeometry.impulse |
| 54–64 | Unyawed material gate has no lateral impulse/slide and equalizes longitudinal velocities without bounce. | 60, 62–63 | ContactGeometry.impulse material gate |
| 68–82 | Yawed impact separates by shared restitution×closing; at ramp floor separates by zero. | 73–75, 81 | ContactGeometry.impulse / AiDrive.bumpRestitution |
| 83–97 | Friction opposes slide at Coulomb clamp, balances lateral momentum and yaws both bodies; affordable slide stays below clamp. | 89–92, 96 | ContactGeometry.impulse friction |
| 99–104 | Resolver catches 18 m between-step crossing, restores 4.8 m separation and equal speed. | 103 | Collide swept-contact response |
| 109–115 | Human yaw crossing ±pi retains swept collision instead of tunneling. | 114 | Collide wrapped yaw sweep gate |
| 116–125 | Remote/incident ownership and inconsistent-speed teleport fixtures skip sweep rewinds and preserve relevant poses/speed. | 120, 124 | Collide sweep ownership/motion gates |
| 133–142 | 90-degree human right slide is closing and loses slide speed; left slide stays unchanged; overlap anti-vacuity holds. | 138–140 | Collide body/pushVelocity basis |
| 143–151 | Rotated remote car keeps prog/s/x/speed/yaw while locally owned car moves. | 149–150 | Collide orientedResponse net owner |
| 157–171 | Three-body successive sweeps use updated middle-car motion, match analytic poses/separation and emit two ordered FX pairs. | 166–170 | Collide successive sweep motion |
| 173–189 | Incident acquiring all three cars during first response immediately prevents second sweep; third pose/speed unchanged, only first FX pair. | 184–188 | Collide immediate ownership checks |
| 191–206 | Quiet 22-car sweep preserves all poses/speeds and invokes Math.hypot zero times. | 202, 205 | Collide sweep operation count |
| 208–221 | Overlap and sweep each preserve contact result with <=12 sin/cos calls. | 215–216, 219–220 | ContactGeometry overlap/sweep trig |
| 223–242 | Unyawed signed-zero angle has exact old penetrations and zero trig; Infinity preserves NaN extents and non-oriented classification. | 233, 235, 240–241 | Collide.pairContact extents |
| 244–260 | Unyawed progress/lateral grid exactly matches closed-form penetrations with Object.is, and rejects nonpositive penetration. | 254–257 | Collide.pairContact closed form |

### tests/unit/context-cap-hook.test.mjs

Production / policy targets: .claude/hooks/context-cap.py context_tokens (42), brief_text (55), caps (72), once (87), decide (100).

Fixtures and wiring: Temporary transcript JSONL has user brief and newest assistant input/cache token total; Python subprocess receives controlled env and project directory; status=0 checked by run helper (28–35).

Limits and comment findings: Synthetic hook events only, not actual host enforcement. Does not test malformed/multiple usage entries, explicit hard env override, marker escape hatch, or all spawn names.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 37–43 | 400k usage with no cap produces empty output. | 41 | decide / caps |
| 45–55 | 170k usage against 150k STOP AT produces soft advice with hard 200k and worker doc, then suppresses repeated advice. | 51–53 | brief_text / context_tokens / once / decide |
| 57–72 | 160k against 100/150 soft/hard denies Agent; successor remote handoff allowed; off switch and 300k environment override silence it. | 64–70 | decide spawn gate / caps override |

### tests/unit/controller-profiles.test.mjs

Production / policy targets: ControllerProfiles in js/input/controller-profiles.js idOf 5, clean 7, create 25; Input in js/input/input.js remoteLost 454, setPadAxisMap 708, resetControllerProfile 767, calibration 803, poll 1856 and demand/edge exports.

Fixtures and wiring: boot (8–25) loads real input dependencies with fake document/events, storage map, clock, gamepad snapshots; pad (26) supplies 4 axes/20 buttons. Values serialized across VM realm for comparisons.

Limits and comment findings: No physical USB/gamepad/browser permissions or lazy UI rendering. Device ids/index and time progression are synthetic; persistence is a mocked store, not localStorage durability.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 27–48 | Initial held actions fire; missing pad neutralizes axes; recovery/device replacement seeds held buttons until release/repress. | 33, 36–37, 39, 41, 45, 47 | Input.poll recovery/edge seeding |
| 49–58 | Wheel→standard→wheel restores axes/buttons per device; reset affects current wheel and preserves other pad profile. | 52–57 | Input profiles / resetControllerProfile |
| 59–66 | Manager recreation restores stored wheel mapping; first legacy map retained; >16 devices capped at 16. | 63–65 | ControllerProfiles.create persistence/eviction |
| 67–73 | Hostile metadata truncates IDs to 120, deduplicates resulting IDs, drops junk/nonfinite axes and invalid button keys/extra slots. | 71–72 | ControllerProfiles.clean |
| 74–81 | Remote loss with mismatched source cannot clear owner/state; matching source clears; omitted source clears all. | 76–80 | Input.remoteLost |
| 82–89 | Legacy stored axes/buttons activate before lazy UI; profile import immediately updates active wheel axes/buttons/identity. | 85, 87–88 | Input legacy/profile import |
| 90–95 | Standard pad does not claim legacy wheel map; first unmapped physical wheel claims it, next wheel uses defaults. | 92–94 | ControllerProfiles legacy claiming |
| 98–117 | Profile reset neutralizes steering, retains other-device calibration, invalidates only changed axis/sign calibration and persists invalidation. | 105, 111, 113–115 | Input calibration reset |
| 119–130 | Axis-map commit rejects absent captured owner without changing map; connected captured wheel receives mapping/profile. | 123–124, 127–129 | Input.setPadAxisMap captured owner |
| 132–150 | Two connected wheels initialize pedals independently; half-travel works after local initialization; newly mapped throttle axis returns uninitialized zero. | 141–143, 146–147, 149 | Input per-device pedal initialization |

### tests/unit/coplanar-faces.test.mjs

Production / policy targets: tools/track/coplanar-audit.cjs overlapArea/planeGap/idsFrom/optsFrom and CLI real-track sweep; tools/track/coplanar-baseline.json; tools/lib/circuit-scope.cjs; tools/manifest.cjs circuit roster.

Fixtures and wiring: One cached --all --json --both child-process sweep shared by default/overhead tests; APEX_CIRCUITS scopes both roster and caps. Synthetic rectangles, rotated bars and far-origin near-parallel plane fixture (135–180).

Limits and comment findings: Geometric audit spots and filter thresholds, not screenshots or GPU depth precision. Default count equality follows two assertions; removed/unknown cap outside active scope deferred. CLI site-filter example is synthetic and is described here without a live-looking filename citation.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 64–79 | Scoped full-roster sweep count matches manifest; each default coplanar spot count <=baseline or zero for new circuit. | 71, 78 | coplanar-audit real default sweep |
| 81–92 | Every scoped baseline circuit measured and count cannot be below cap, so together default caps equal measurements. | 88, 91 | coplanar baseline equality |
| 111–123 | Scoped overhead roster complete and every circuit spot count exactly zero. | 114, 120–122 | coplanar-audit overhead sweep |
| 137–144 | Convex intersection area exact for identical/offset/disjoint squares and perpendicular thin bars. | 138–141, 143 | overlapArea |
| 146–162 | Near-parallel far-origin fixture reproduces misleading plane-constant gap; actual planeGap >1.3 m, truly coplanar offset <1e-9. | 158–159, 161 | planeGap |
| 164–180 | Rotated thin bars overlap 0.05–0.2 square metres versus bounding product >30, over 100× smaller. | 177–179 | overlapArea |
| 182–192 | Boolean flags preserve following circuit IDs, value flags consume their argument; positive gap parsed, missing/nonpositive/nonnumeric values throw. | 184–188, 190 | idsFrom / optsFrom |

### tests/unit/cover-legibility.test.mjs

Production / policy targets: LiveryTex.buildAtlas in js/car/liverytex.js (1658), livery graphics/crest modules and Teams/Liveries; tools/car/crest-sweep.mjs RecCtx/paintStackAt.

Fixtures and wiring: Recording canvas atlas VM (73–89), linear-light contrast (91–96), 40×40 sample survey (122–134); default roster liveries only, all crown/flank editor IDs except mark designs delegated to crest suite; empty KNOWN.

Limits and comment findings: Not every arbitrary player color or raster appearance. Finite sample grid and recording/compositing approximations; bare/zero-painted regions deliberately skipped without independent presence guarantee. Header 3% is crown-only; flank threshold is 1.5%. No live-camera visual measurement here.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 161–195 | Every roster default livery × non-mark crown/flank choice: painted regions must have >=3%/1.5% samples at >=2:1 body contrast; empty known set rejects both new gaps and stale allowances. | 192, 194 | LiveryTex.buildAtlas / LiveryGraphics non-mark designs |

### tests/unit/coverage-merge.test.mjs

Production / policy targets: tools/ci/coverage-merge.mjs sourcePathOf 55, attachSource 83, readDir 99, mergeCoverage 117; tests/helpers/js-coverage.js flag-gated helper and real js/core/hash32.js source fixture.

Fixtures and wiring: Synthetic URL/V8 coverage entries, real raw/rewritten fixture text, temporary JSON input/output directories, real monocart lcov generation, fake page coverage call sentinel.

Limits and comment findings: One-source smoke fixture, not complete instrumentation correctness or browser CDP. Input filter/path normalization is not a security boundary; raw-length match only heuristic for selecting rewritten text. Fake/external paths are described generically here.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 27–39 | HTTP/query, repo file-URL and absolute product paths normalize; helpers/vendor/external/prelude/internal/undefined are refused. | 28–38 | sourcePathOf |
| 50–62 | V8 end offset chooses rewritten const→var versus raw real fixture text; unmatched size drops; supplied browser source preserved. | 52–53, 55–56, 58, 60–61 | attachSource |
| 64–78 | Directory reader accepts bare and wrapped lists, counts four JSON/two malformed, ignores non-JSON, missing directory returns empty summary. | 73–76 | readDir |
| 80–96 | Synthetic Node coverage merges through monocart into lcov, dropping helper entry, yielding one entry/source and relative SF plus LF row. | 89–91, 93–94 | mergeCoverage + monocart |
| 98–106 | Empty/missing input union returns ok=false/no-entries reason and creates no report directory. | 102–104 | mergeCoverage empty input |
| 108–118 | Unflagged browser helper returns disabled results, calls no CDP methods, and advertises port-specific artifact directory. | 111, 114–117 | js-coverage browser helper |

### tests/unit/crest-marks.test.mjs

Production / policy targets: LiveryTex in js/car/liverytex.js contrast 166, numCrestBox 301, markBase 643, markPalette 675, markSlots 904, drawLogoImage 978, drawCrest 1029; js/car/crest-draw.js and js/car/crest-paths.js; js/car/liveries.js; js/data/teams.js and js/data/legends.js.

Fixtures and wiring: tools/car/crest-sweep.mjs loadCrests/replay/RecCtx/cssOf; cached roster×default-livery×cover/badge measurements (29–67). Full-livery palette grids and independent sentinel picks; custom uploaded image stub; legend-specific VM; recorded operations serialized across realms.

Limits and comment findings: Recording canvas and sampled coverage, no actual canvas raster/font/GPU. Some comments about c2 wash/background are historical; fieldsFor currently uses cover||c1. Legend shape equality compares op kinds, not coordinates. Style title claims bounded/legible art but asserts operation count/stroke floor, not explicit spatial bounds/contrast. Round-trip title only asserts FIELDS inclusion. Uploaded-emblem LOGO DETAIL test passes its color as drawLogoImage outline argument; offered-row suite correctly removes logo2 for uploaded art.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 69–79 | Every roster team except legitimate custom has vector crest entry. | 78 | LiveryTex.CRESTS / Teams.LIST |
| 81–86 | Every crest function has exactly five declared parameters. | 85 | CRESTS arity |
| 88–96 | Every team/default cover+badge normalized bounds stay within -0.02..1.02 on both axes. | 93–94 | drawCrest fit geometry |
| 98–111 | Normalized major extent >=0.88, minor >=0.20. | 108–109 | drawCrest fit geometry |
| 113–120 | Any recorded stroked limb meets exported minimum stroke floor. | 117–118 | drawCrest stroke geometry |
| 122–133 | Bare fin badge has no text; all recorded font relative sizes meet exported minimum. | 128, 130–131 | drawCrest lettering |
| 135–145 | Recorded colors all belong to resolved palette; empty hardcoded allowance. | 143 | drawCrest palette use |
| 147–156 | No rgba/hsla recorded paint or non-null compositing operation. | 153–154 | drawCrest opacity/compositing |
| 158–175 | 430px total ink coverage >=10%, excluding plate <=62%; relative coverage drift to 40px <=35%. | 170–173 | drawCrest sampled coverage |
| 177–241 | Full team/livery/four-field grid >400: authored/brand color preserved, no authored auto-halo, shipped visible brand/derived mark meets floor through permitted outline/halo, alternative/plate contrast thresholds; both free/derived categories exercised. | 238–240 | LiveryTex.markPalette / team/livery data |
| 243–257 | Own first livery is default; its markBase color differs from a selected nondefault livery. | 250, 254–255 | LiveryTex.markBase |
| 259–272 | No quoted raster-logo URL in source and no roster raster logo file on disk. | 266, 270 | LiveryTex raster logo precedence |
| 274–302 | 8 colors × all team/liveries × cover/badge (>8000 rows) preserve authored logo color and never auto-halo. | 300–301 | LiveryTex.markPalette authored logo |
| 304–343 | Every logo2-offering mark row (>=5) paints sentinel detail color on both surfaces for every livery; unset control must not already paint it. | 341–342 | markSlots / markPalette / drawCrest |
| 345–359 | With logo2/logo3 explicitly unset, all palettes have null outline. | 355 | markPalette outline opt-in |
| 361–392 | Uploaded emblem tinted/untinted paints rim behind final image and optional halo before rim; no request gives one plain draw. | 380–381, 386–388, 390 | LiveryTex.drawLogoImage |
| 394–427 | Across fields/surfaces/liveries, part islands absent when unset; offered authored part uses exact chosen color without halo and nonzero cases scored. | 422–426 | markPalette same-ink part |
| 429–474 | Rows lead logo/end logo3, unique keys/labels and uppercase label syntax; every non-logo offered row reaches sentinel paint with unset anti-vacuity. | 449–454, 473 | markSlots / drawCrest picker reachability |
| 476–512 | Red Bull sentinel sun paint exists, every sampled op circular within 2% radii, and first/backmost op is sun. | 495, 506–507, 510 | CREST_DISC / drawCrest |
| 514–531 | Explicitly unset logo3 yields null outline on every livery/surface. | 526–527 | markPalette logo3 opt-in |
| 533–571 | Recreated lightbox field selection preserves own brand backing versus car and avoids grey fallback for painted interior detail. | 570 | markOnField / markPalette wall lockup |
| 573–622 | Ferrari/Red Bull plated membership required; cover/badge/wall retain plate/mark color identities, authored plate consistent, plate color actually painted on cover and badge. | 581–582, 621 | crestKeepsPlate / markPalette / drawCrest |
| 624–653 | Exported number crest box; every team number-board and cover have same color set and number board retains authored secondary paint. | 628, 652 | numCrestBox / drawCrest |
| 655–686 | Every team fin/cover have identical color sets, badge no text and authored secondary color reaches fin wherever it reaches cover. | 685 | drawCrest cover/fin lockup |
| 688–723 | Custom monogram initially offers three keys; uploaded art offers only tint/outline, outline paints behind image; cleanup restores monogram row. | 702–703, 710–711, 717–718, 722 | markSlots / LOGOS.custom / drawLogoImage |
| 731–769 | Legend duel/current seat resolves marque by equal non-text op-kind sequence, suppresses slot monograms, and wordmark legends spell team names. | 753–754, 760, 767 | crestKey / Legends / drawCrest |
| 772–788 | Exact 14 style IDs; unset/team/unknown retain team operations; 13 emblems deterministic, pairwise distinct, nonempty <400 ops and stroke floor. | 773, 777, 781–782, 785–786 | drawCrest EMBLEMS/style |
| 790–793 | Liveries.FIELDS contains crestStyle/crestTone/crestFrame; does not execute a garage-file round trip. | 791–792 | Liveries.FIELDS |
| 796–818 | Exact tone/frame enums; default/invalid settings op-identical; team mark ignores them; 15 gear combinations distinct, bounded <600 ops and stroke floor. | 797–798, 805, 807, 812, 814–815, 817 | drawCrest dressEmblem tone/frame |

### tests/unit/cross-file-paths.test.mjs

Production / policy targets: tools/check/cross-file-paths.mjs referencesIn 70, resolves 109, audit 116; espree parser for literal static/dynamic import, require and new URL.

Fixtures and wiring: Synthetic code strings, temporary moved-file tree with one broken ref, actual tests/tools audit and checked-count anti-vacuity.

Limits and comment findings: Literal AST existence guard only: dynamic computed paths ignored; union of resolver extensions/directories is more permissive than ESM resolution. No module execution or exported symbol validity. Fake paths in fixtures are intentionally described without live literal references.

| Case span | Asserted contract | Assertion spans | Target (see file-level source mapping) |
|---|---|---|---|
| 21–24 | Parser identifies a static relative import kind/spec. | 23 | referencesIn static import |
| 26–31 | Parser still identifies literal dynamic import inside swallowed try/catch. | 30 | referencesIn dynamic import |
| 33–37 | Parser identifies relative new-URL data reference kind/spec. | 36 | referencesIn new URL |
| 39–44 | Parser identifies relative require argument. | 43 | referencesIn require |
| 46–49 | Bare package and node built-ins produce no relative refs. | 48 | referencesIn relative filter |
| 51–57 | Import-looking source inside string produces no AST references. | 56 | referencesIn AST lexical scope |
| 59–79 | Temporary moved-file tree with unchanged relative reference yields exactly one named broken reference. | 74–75 | audit + resolves temporary tree |
| 81–86 | Real audited tree has zero broken relative refs. | 85 | audit real tree |
| 88–95 | Real audited tree has no parse errors and >100 checked refs, preventing empty-scan success. | 92, 94 | audit parser/scan floor |

## Cross-cutting limits

No execution verdict is implied. Full-game VM coverage exercises production simulation with mocked host services; pure geometry/recording suites do not establish renderer boot or pixel appearance. Source pins can fail after behavior-preserving refactors, and local replicated formulas can pass independently of production unless separately linked by source/helper checks. Policy scans use their stated scopes and parsers, not a complete semantic repository model.

Shared assertion helpers: collision-ai-fixes closeTo/gt/lt/lte at 23–26; collisions-deep gt/lt/lte at 21–23; collisions-vm gt/lt at 19–20; contact-geometry close at 21; context-cap run checks Python exit status at 33; collision-contact replay fixture verifies replay start at 454 and net fixture asserts straight classification at 624; coverage fixture verifies raw/rewritten lengths differ at 44. Coplanar near at 138 wraps every arithmetic sample. These are counted in the assertion spans when called inside a case; fixture assertions outside cases apply to the relevant fixture consumers.

Comment-only findings were recorded above, without changing source. Numeric historical measurements and claims of prior CI/browser/live verification were read as provenance, not independently verified in this lane. Synthetic missing paths, URL examples and site-filter examples are described rather than repeated as live-looking repository references.
