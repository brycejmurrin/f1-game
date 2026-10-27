# Unit group 20 — complete source map

Read-only semantic inventory, 2026-10-27. All 11 manifest files (2,374 lines) read fully with bounded, nontruncated reads; the initial truncated aggregate was reread in bounded sections. No tests or browser run, source edits or commits. Ranges are one-based inclusive; SHA-256 pins full file bytes. assertionSpans are complete assertion call spans, including calls inside loops and local helpers, not predicate dumps. A registration template repeats for its indicated inputs.

Local navigation used `.claude/skills/code-nav/SKILL.md` and `bash tools/mcp/lsp-mcp.sh`: outlines resolved SetupCamera (5 exports), GaragePrebuild (13), GarageScene (31); Car3D.build resolved `js/car/car3d.js:237` and export `:2888`. TrackGeom.addMountain resolved `js/track/core/geom.js:248-312` by module-file fallback: direct use/export/caller coverage was explicitly unverified. GarageExperience outline exposes 13 internals (no directly recognized exports). Tools outside js were mapped by imports and bounded source inspection.

Production source anchors: SetupCamera panelCover `js/garage/setup-camera.js:17`, presentOpts `:69`, glareScale `:107`, create `:138`; GaragePrebuild signals `js/garage/prebuild.js:68-109`, blockers `:111-135`, create `:152-350`; GarageScene live `js/garage/scene.js:546`, mood `:676`, hangerSpan `:405`, context key `:1215`, draw `:1230`, recentre `:1419`, preview cache `:1449`, prepare/prepared/release `:1492-1522`. Generator comparator/ordering/index source `tools/docs/gen-agent-index.mjs:41-55,120-142,150-184,229-269,292-375`; architecture source `tools/gen/gen-arch-table.mjs:60-140`; README collector `tools/gen/gen-tools-readme.mjs:37-152`; slider collector/render `tools/gen/gen-slider-doc.mjs:81-165,175-214`; hooks collector/render `tools/gen/gen-hooks-table.mjs:133-214`; flags collector/render `tools/gen/gen-flags-table.mjs:16-65`; coverage render `tools/docs/gen-coverage-table.mjs:49-86`; ladder `tools/gen/gen-ladder-figures.mjs:34-79`; baseline routing `tools/ci/geometry-paths.mjs:168-170,185-203`, baseline loader `tools/track/ground-audit.cjs:47,260`. These are navigation evidence, not execution verdicts.

## tests/unit/garage-panel-side.test.mjs

Read range: 1-326; SHA-256: `6c78ab833e3f790e11f52502b7f066761171fbc04ead68681ffe93620a50a826`. 16 declared registrations.

Production target: SetupCamera.panelCover/presentOpts/glareScale/create; GarageScene.recentre; SetupUI chips; game render.

Fixture/helper ranges: 12-18 rectangle and VM setup; 281-301 garageCtxHarness; 302-303 careerWith.

Fixtures / limits: Synthetic rectangles, extracted real pointer/framing/cache segments and event targets, fake MutationObserver; static CSS and race-render matches. No browser layout, pointer capture implementation or pixels.

Shared helper assertion spans: 285.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| garage held camera controls release only their owning pointer, or window blur | 19-38 | 29, 29, 30, 31, 33, 34, 35, 36 | SetupCamera / GarageScene / CSS contracts — garage held camera controls release only their owning pointer, or window blur. Supplied fixtures only. |
| garage gesture lifecycle drops old fingers and held owners without breaking the next drag or pinch | 40-80 | 67, 69, 70, 72, 72, 74, 76, 76, 78 | SetupCamera / GarageScene / CSS contracts — garage gesture lifecycle drops old fingers and held owners without breaking the next drag or pinch. Supplied fixtures only. |
| a RIGHT dock returns the same unsigned fraction it always did | 82-90 | 86, 87, 88 | SetupCamera / GarageScene / CSS contracts — a RIGHT dock returns the same unsigned fraction it always did. Supplied fixtures only. |
| a LEFT dock is the exact mirror, so the car lands in the right half | 92-105 | 96, 97, 101 | SetupCamera / GarageScene / CSS contracts — a LEFT dock is the exact mirror, so the car lands in the right half. Supplied fixtures only. |
| the side is judged against the canvas's own rect, not x = 0 | 107-111 | 109, 110 | SetupCamera / GarageScene / CSS contracts — the side is judged against the canvas's own rect, not x = 0. Supplied fixtures only. |
| portrait keeps its vertical band and reads the camera panel lazily | 113-119 | 116, 117, 118 | SetupCamera / GarageScene / CSS contracts — portrait keeps its vertical band and reads the camera panel lazily. Supplied fixtures only. |
| the fit takes the magnitude; the lens shift and recentre keep the sign | 121-130 | 123-124, 125, 126, 127, 128-129 | SetupCamera / GarageScene / CSS contracts — the fit takes the magnitude; the lens shift and recentre keep the sign. Includes source-shape checks; matching text alone is not runtime proof. |
| a Home photo uses manual distance and aim while the background retains automatic framing | 132-162 | 136, 154, 155, 156, 157, 159, 160 | SetupCamera / GarageScene / CSS contracts — a Home photo uses manual distance and aim while the background retains automatic framing. Supplied fixtures only. |
| the GARAGE look rules keep the car's floor and stay out of portrait | 164-180 | 168-169, 171, 173, 174, 175-176, 177, 178, 179 | SetupCamera / GarageScene / CSS contracts — the GARAGE look rules keep the car's floor and stay out of portrait. Includes source-shape checks; matching text alone is not runtime proof. |
| narrow landscape garage keeps camera and aero controls reachable | 182-201 | 187, 188-189, 190, 191-192, 193-194, 195-196, 197-198, 199-200 | SetupCamera / GarageScene / CSS contracts — narrow landscape garage keeps camera and aero controls reachable. Includes source-shape checks; matching text alone is not runtime proof. |
| REAR-WING sits back and slightly above the wing | 203-209 | 206, 207, 208 | SetupCamera / GarageScene / CSS contracts — REAR-WING sits back and slightly above the wing. Supplied fixtures only. |
| garage present routes through Lighting Tuner multipliers | 211-249 | 212, 213, 219-220, 221-222, 223-224, 225, 226, 227, 228, 229, 230, 233-234, 235-236, 240, 241, 242-243, 244-245, 246, 247, 248 | SetupCamera / GarageScene / CSS contracts — garage present routes through Lighting Tuner multipliers. Supplied fixtures only. |
| INTER and WET tyre chips take their ink from the compound visual.band | 251-256 | 253-254, 255 | SetupCamera / GarageScene / CSS contracts — INTER and WET tyre chips take their ink from the compound visual.band. Includes source-shape checks; matching text alone is not runtime proof. |
| the garage frame calls presentOpts and glareScale; the race path still owns LT | 258-275 | 260, 261, 262, 263-264, 267, 268, 269, 270, 272, 273, 274 | SetupCamera / GarageScene / CSS contracts — the garage frame calls presentOpts and glareScale; the race path still owns LT. Includes source-shape checks; matching text alone is not runtime proof. |
| garage wall wins are keyed on the results array, not just its length | 305-311 | 308, 310 | SetupCamera / GarageScene / CSS contracts — garage wall wins are keyed on the results array, not just its length. Supplied fixtures only. |
| garage frames memoise the career sponsor + achievements on (store.rev, results, history) | 313-326 | 318, 321, 324, 325 | SetupCamera / GarageScene / CSS contracts — garage frames memoise the career sponsor + achievements on (store.rev, results, history). Supplied fixtures only. |

## tests/unit/garage-perf-mesh-free.test.mjs

Read range: 1-86; SHA-256: `2768286069b5283fa962265f09fa16ed75093c5519453ec9cc123b5640460277`. 2 declared registrations.

Production target: SetupUI MESH_FREE_DRAFT → Car3D.build.

Fixture/helper ranges: 28-33 meshFreeFields; 35-63 real loadParts, probe fields, build and two contexts.

Fixtures / limits: Every listed atlas-only field changes together for two supplied liveries; exact numeric array comparisons, not timing or rendered decals. Field interactions can cancel; finite contexts do not prove all combinations.

Shared helper assertion spans: 31.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| every MESH_FREE_DRAFT field has a probe value | 64-67 | 66 | MESH_FREE_DRAFT → Car3D.build — every MESH_FREE_DRAFT field has a probe value. Supplied fixtures only. |
| MESH_FREE_DRAFT fields leave Car3D.build byte-identical (context 0: team from CONTEXTS[0]) | 70-85 | 76, 77, 80, 83 | MESH_FREE_DRAFT → Car3D.build — MESH_FREE_DRAFT fields leave Car3D.build byte-identical (context 0: team from CONTEXTS[0]). Repeats for context indices 0 and 1 (two team/livery fixtures). |
| MESH_FREE_DRAFT fields leave Car3D.build byte-identical (context 1: team from CONTEXTS[1]) | 70-85 | 76, 77, 80, 83 | MESH_FREE_DRAFT → Car3D.build — MESH_FREE_DRAFT fields leave Car3D.build byte-identical (context 1: team from CONTEXTS[1]). Repeats for context indices 0 and 1 (two team/livery fixtures). |

## tests/unit/garage-personality.test.mjs

Read range: 1-190; SHA-256: `041840851153fe1fd7b8db6ddd7e720b7efaed9bce1f207f762e8f43f1d0c92c`. 7 declared registrations.

Production target: GarageScene.live/mood/hangerSpan; SetupCamera drive-out; LoadingScreen.garage.

Fixture/helper ranges: 23-34 sceneHarness; 37-44 teamEnergy; 59-74 driveOutHarness; 111-115 stubEl; 116-134 loadingHarness; 135 info.

Fixtures / limits: Recording gfx/audio/canvas, controlled clock/timers and extracted drive-out segment. Radio/audio calls and light records only; no audible output, GPU lighting or browser scheduling.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| the team uplights swell as the shutter lifts, and sit at their usual level otherwise | 46-57 | 52, 53, 54, 56 | GarageScene / SetupCamera / LoadingScreen — the team uplights swell as the shutter lifts, and sit at their usual level otherwise. Supplied fixtures only. |
| the drive-out starts the engine (with the team's voice), revs it with the car, and stops it | 76-93 | 78, 79, 80, 87, 88, 89, 90, 92 | GarageScene / SetupCamera / LoadingScreen — the drive-out starts the engine (with the team's voice), revs it with the car, and stops it. Supplied fixtures only. |
| sound off: no engine at all | 95-101 | 100 | GarageScene / SetupCamera / LoadingScreen — sound off: no engine at all. Supplied fixtures only. |
| rain light on rolling in or out at night or in the wet; the ctx carries the door to the scene | 103-108 | 105, 106, 107 | GarageScene / SetupCamera / LoadingScreen — rain light on rolling in or out at night or in the wet; the ctx carries the door to the scene. Includes source-shape checks; matching text alone is not runtime proof. |
| one team radio line as the car rolls out, with the radio sting, through the flyby check's gates | 137-157 | 141, 143, 144, 145, 145, 146, 151, 156 | GarageScene / SetupCamera / LoadingScreen — one team radio line as the car rolls out, with the radio sting, through the flyby check's gates. Includes source-shape checks; matching text alone is not runtime proof. |
| lighting moods: shipped is the identity, every mood finite and distinct, the switch restores | 159-179 | 163, 166, 168, 169, 170, 171, 173, 176, 177, 178 | GarageScene / SetupCamera / LoadingScreen — lighting moods: shipped is the identity, every mood finite and distinct, the switch restores. Supplied fixtures only. |
| fit: every ceiling fixture's hangers reach from its housing to the ceiling, never short or through it | 181-190 | 185, 186, 187, 189 | GarageScene / SetupCamera / LoadingScreen — fit: every ceiling fixture's hangers reach from its housing to the ceiling, never short or through it. Includes source-shape checks; matching text alone is not runtime proof. |

## tests/unit/garage-prebuild.test.mjs

Read range: 1-703; SHA-256: `b84ae760ccd9986c7096f1908f15d1fe920801cbea8fd1a5bdfd5751765be1d0`. 32 declared registrations.

Production target: GaragePrebuild gates/plan/create; GarageScene prepare/release/init; game garage integration.

Fixture/helper ranges: 19-29 loadModule; 31-35 GO; 131-183 page; 184 owned; 416-443 sceneHarness/TEAM/LIV.

Fixtures / limits: Explicit microtask/slice clock, fake asset/gfx/menu state and resource handle ownership. Real scene modules run in VM, optional crew and permissive canvas. Warm readiness is manually signalled; no actual compilation, GPU bytes, wall timing or first-present measurement.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| blockers: an idle title with nothing in the way goes | 37-40 | 39 | GaragePrebuild / GarageScene lifecycle — blockers: an idle title with nothing in the way goes. Supplied fixtures only. |
| blockers: never on a race start, with the garage open, a hidden tab or headless | 42-53 | 45, 46, 47, 48, 49, 50, 51, 52 | GaragePrebuild / GarageScene lifecycle — blockers: never on a race start, with the garage open, a hidden tab or headless. Supplied fixtures only. |
| blockers: the title is speculative — Save-Data, the intro and the world all gate it | 55-67 | 58, 59, 60, 61, 62, 63, 64, 65, 66 | GaragePrebuild / GarageScene lifecycle — blockers: the title is speculative — Save-Data, the intro and the world all gate it. Supplied fixtures only. |
| blockers: race settings ignores sheetOpen — RACE! still needs that garage | 69-73 | 72 | GaragePrebuild / GarageScene lifecycle — blockers: race settings ignores sheetOpen — RACE! still needs that garage. Supplied fixtures only. |
| blockers: race settings keeps its old gates — RACE! needs that garage | 75-80 | 78, 79 | GaragePrebuild / GarageScene lifecycle — blockers: race settings keeps its old gates — RACE! needs that garage. Supplied fixtures only. |
| blockers: race settings ignores phoneHold — RACE! still needs that garage on phones | 82-86 | 85 | GaragePrebuild / GarageScene lifecycle — blockers: race settings ignores phoneHold — RACE! still needs that garage on phones. Supplied fixtures only. |
| phoneHold: mobile tier / isMobile / low deviceMemory; desktop stays clear | 88-98 | 90, 91, 92, 93, 94, 95, 96, 97 | GaragePrebuild / GarageScene lifecycle — phoneHold: mobile tier / isMobile / low deviceMemory; desktop stays clear. Supplied fixtures only. |
| plan: only a hidden canvas gets hidden frames; a Home garage keeps its own room | 100-108 | 103, 104, 105, 106, 107 | GaragePrebuild / GarageScene lifecycle — plan: only a hidden canvas gets hidden frames; a Home garage keeps its own room. Supplied fixtures only. |
| homeKind, packSettled and saveData read the real signals | 110-126 | 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125 | GaragePrebuild / GarageScene lifecycle — homeKind, packSettled and saveData read the real signals. Supplied fixtures only. |
| the title builds the car, then the room, then arms two hidden frames after ONE warm request | 186-207 | 190, 192, 194, 195, 196, 200, 202, 203, 204, 205, 206 | GaragePrebuild / GarageScene lifecycle — the title builds the car, then the room, then arms two hidden frames after ONE warm request. Supplied fixtures only. |
| ready is keyed: a team pick or a livery bust re-arms it, and the warm is never asked twice | 209-224 | 212, 213, 214, 216, 217, 218, 220, 221, 222, 223 | GaragePrebuild / GarageScene lifecycle — ready is keyed: a team pick or a livery bust re-arms it, and the warm is never asked twice. Supplied fixtures only. |
| the menu world's hidden frames are waited for, never stolen | 226-236 | 230, 233, 235 | GaragePrebuild / GarageScene lifecycle — the menu world's hidden frames are waited for, never stolen. Supplied fixtures only. |
| a tap mid-sequence supersedes it: no room, no frames | 238-248 | 244, 245, 246, 247 | GaragePrebuild / GarageScene lifecycle — a tap mid-sequence supersedes it: no room, no frames. Supplied fixtures only. |
| a Home garage already draws the room: car only, ready without a hidden frame | 250-259 | 254, 255, 256, 257, 258 | GaragePrebuild / GarageScene lifecycle — a Home garage already draws the room: car only, ready without a hidden frame. Supplied fixtures only. |
| a circuit Home gets the car and the room on the CPU, no frames over the circuit | 261-269 | 265, 266, 267, 268 | GaragePrebuild / GarageScene lifecycle — a circuit Home gets the car and the room on the CPU, no frames over the circuit. Supplied fixtures only. |
| a frameless title prebuild never stands in for race settings' hidden frames | 275-297 | 280, 281, 282, 283, 288, 289, 290, 293, 294, 295 | GaragePrebuild / GarageScene lifecycle — a frameless title prebuild never stands in for race settings' hidden frames. Supplied fixtures only. |
| phoneHold: title skips / releases on mobile; desktop and settings keep the prebuild | 299-340 | 303, 304, 305, 310, 311, 316, 317, 321, 322, 329, 330, 333, 335, 336, 337, 338, 339 | GaragePrebuild / GarageScene lifecycle — phoneHold: title skips / releases on mobile; desktop and settings keep the prebuild. Supplied fixtures only. |
| blocked runs build nothing: Save-Data on the title, a race start anywhere | 342-351 | 345, 346, 349, 350 | GaragePrebuild / GarageScene lifecycle — blocked runs build nothing: Save-Data on the title, a race start anywhere. Supplied fixtures only. |
| car and room build while the pack is still uploading; frames wait for packSettled | 353-370 | 359, 360, 361, 364, 365, 368, 369 | GaragePrebuild / GarageScene lifecycle — car and room build while the pack is still uploading; frames wait for packSettled. Supplied fixtures only. |
| the tap-to-first-frame measure counts only the visible garage, and says whether it was prebuilt | 372-394 | 377, 383, 384, 385, 386, 387, 388, 393 | GaragePrebuild / GarageScene lifecycle — the tap-to-first-frame measure counts only the visible garage, and says whether it was prebuilt. Supplied fixtures only. |
| GaragePrebuild.instance() is the page's one instance (for __apex.garagePrebuild) | 396-413 | 398, 400, 402, 403, 404, 407-408, 409-410, 411-412 | GaragePrebuild / GarageScene lifecycle — GaragePrebuild.instance() is the page's one instance (for __apex.garagePrebuild). Includes source-shape checks; matching text alone is not runtime proof. |
| a prepared room is the one the first garage draw uses: no rebuild on the tap | 445-459 | 448, 449, 450, 452, 454, 456, 457-458 | GaragePrebuild / GarageScene lifecycle — a prepared room is the one the first garage draw uses: no rebuild on the tap. Supplied fixtures only. |
| the A/B switch: apex26.garagePrewarm="off" at boot, or setEnabled(false), stops the TITLE prebuild only | 461-487 | 464, 465, 466, 467, 468, 470, 471, 472, 473, 474, 475, 477, 478, 480, 481, 482, 483, 485, 486 | GaragePrebuild / GarageScene lifecycle — the A/B switch: apex26.garagePrewarm="off" at boot, or setEnabled(false), stops the TITLE prebuild only. Supplied fixtures only. |
| a denied global storage getter keeps GaragePrebuild.create on its default | 489-497 | 492, 496 | GaragePrebuild / GarageScene lifecycle — a denied global storage getter keeps GaragePrebuild.create on its default. Supplied fixtures only. |
| release at race start frees the garage and re-arms the next title prebuild | 502-524 | 505, 506, 508, 509, 511, 512, 513, 514, 515, 516, 517, 519, 520, 521, 523 | GaragePrebuild / GarageScene lifecycle — release at race start frees the garage and re-arms the next title prebuild. Includes source-shape checks; matching text alone is not runtime proof. |
| a released frameless title rebuilds its actual room before reporting ready | 526-557 | 538, 539, 541, 542, 543, 546, 547, 548, 550, 551, 552, 553, 554, 555, 556 | GaragePrebuild / GarageScene lifecycle — a released frameless title rebuilds its actual room before reporting ready. Supplied fixtures only. |
| GarageScene.release frees every garage handle; the next draw rebuilds the room | 559-580 | 567, 568, 569, 570, 571, 572, 573, 575, 577, 578, 579 | GaragePrebuild / GarageScene lifecycle — GarageScene.release frees every garage handle; the next draw rebuilds the room. Supplied fixtures only. |
| garage release frees arrival crew meshes once and the next arrival rebuilds them | 582-616 | 590, 591, 594, 597, 598, 599, 601, 602, 608, 610, 611, 614, 615 | GaragePrebuild / GarageScene lifecycle — garage release frees arrival crew meshes once and the next arrival rebuilds them. Supplied fixtures only. |
| paint and context changes retain the invariant truss and dress meshes until release | 619-645 | 625, 632, 633, 635, 636, 639, 640, 642, 643, 644 | GaragePrebuild / GarageScene lifecycle — paint and context changes retain the invariant truss and dress meshes until release. Supplied fixtures only. |
| renderer replacement releases garage resources through their original owner | 647-670 | 652, 656, 657, 661, 662, 665, 666-667, 668, 669 | GaragePrebuild / GarageScene lifecycle — renderer replacement releases garage resources through their original owner. Supplied fixtures only. |
| quiet gate: the title prebuild waits QUIET_MS after the title shows, and any input restarts the wait | 675-688 | 678, 679, 681, 684, 686, 687 | GaragePrebuild / GarageScene lifecycle — quiet gate: the title prebuild waits QUIET_MS after the title shows, and any input restarts the wait. Supplied fixtures only. |
| quiet gate: input mid-sequence abandons the rest of a title prebuild, and it never starts on the input | 690-703 | 696, 699, 700, 701, 702 | GaragePrebuild / GarageScene lifecycle — quiet gate: input mid-sequence abandons the rest of a title prebuild, and it never starts on the input. Supplied fixtures only. |

## tests/unit/garage-sheet-round2.test.mjs

Read range: 1-299; SHA-256: `b900b5d9f5d759172b19d4f10897347ad7190c025479193b3bf1f17fab8bcdb2`. 14 declared registrations.

Production target: SetupUI.buildSetup; GarageExperience.statsOf/compare; GarageScene board/key; SetupCamera legend keys.

Fixture/helper ranges: 25-74 harness; 156-193 sceneBoard; 271-285 choiceDom.

Fixtures / limits: Real parts/regulations/UI with mini-dom, stub Career and recording canvas. choiceDom adds reflected dataset and detach-focus semantics. No browser layout/a11y tree; compare case checks delta length rather than delta magnitudes.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| G2: an era ban never erases a fitted part from the career garage; a permanent lock still remaps | 76-99 | 79-80, 82, 83, 84, 87, 91, 92, 97, 98 | SetupUI / GarageExperience / GarageScene board — G2: an era ban never erases a fitted part from the career garage; a permanent lock still remaps. Supplied fixtures only. |
| G5: the stat bars read Career.teamStats (development), not the base team.stats | 101-112 | 107, 111 | SetupUI / GarageExperience / GarageScene board — G5: the stat bars read Career.teamStats (development), not the base team.stats. Supplied fixtures only. |
| G5: GarageExperience.compare and statsOf fall back to team.stats outside a career | 114-126 | 117, 123, 125 | SetupUI / GarageExperience / GarageScene board — G5: GarageExperience.compare and statsOf fall back to team.stats outside a career. Supplied fixtures only. |
| G6: a signature part row carries ONE SIGNATURE badge | 128-138 | 133, 136 | SetupUI / GarageExperience / GarageScene board — G6: a signature part row carries ONE SIGNATURE badge. Supplied fixtures only. |
| G7: legends' driver chips drop the placeholder #1 but keep real numbers | 140-153 | 148, 152 | SetupUI / GarageExperience / GarageScene board — G7: legends' driver chips drop the placeholder #1 but keep real numbers. Includes source-shape checks; matching text alone is not runtime proof. |
| G4: the wall BUDGET board reads FREE BUILD when the budget is unlimited | 195-202 | 197, 198, 200, 201 | SetupUI / GarageExperience / GarageScene board — G4: the wall BUDGET board reads FREE BUILD when the budget is unlimited. Supplied fixtures only. |
| G4: toggling FREE BUILD repaints the board (the cache stamp carries the flag) | 204-209 | 206, 207-208 | SetupUI / GarageExperience / GarageScene board — G4: toggling FREE BUILD repaints the board (the cache stamp carries the flag). Supplied fixtures only. |
| G4: a career board ignores the free-play flag (its cap is the career budget) | 211-215 | 213, 214 | SetupUI / GarageExperience / GarageScene board — G4: a career board ignores the free-play flag (its cap is the career budget). Supplied fixtures only. |
| G5: the wall stat board reads Career.teamStats | 217-223 | 221, 222 | SetupUI / GarageExperience / GarageScene board — G5: the wall stat board reads Career.teamStats. Supplied fixtures only. |
| the setup turntable gives the Legends slot its own helmet key and a per-legend mesh key | 225-229 | 227, 228 | SetupUI / GarageExperience / GarageScene board — the setup turntable gives the Legends slot its own helmet key and a per-legend mesh key. Includes source-shape checks; matching text alone is not runtime proof. |
| garage identity is locked only during pit work: race | 232-251 | 241, 242, 243, 245, 246, 247, 250 | SetupUI / GarageExperience / GarageScene board — garage identity is locked only during pit work: race. Repeats for race and menu states. |
| garage identity is locked only during pit work: menu | 232-251 | 241, 242, 243, 245, 246, 247, 250 | SetupUI / GarageExperience / GarageScene board — garage identity is locked only during pit work: menu. Repeats for race and menu states. |
| career contract still locks team and driver at the title garage | 255-267 | 262, 263, 265, 266 | SetupUI / GarageExperience / GarageScene board — career contract still locks team and driver at the title garage. Supplied fixtures only. |
| driver confirmation restores focus to the newly selected chip after replacement | 286-292 | 290, 291, 291 | SetupUI / GarageExperience / GarageScene board — driver confirmation restores focus to the newly selected chip after replacement. Supplied fixtures only. |
| fitting a livery restores focus by data identity even for an imported id with CSS punctuation | 293-299 | 298, 298, 298 | SetupUI / GarageExperience / GarageScene board — fitting a livery restores focus by data identity even for an imported id with CSS punctuation. Supplied fixtures only. |

## tests/unit/garage-sign-occlusion.test.mjs

Read range: 1-147; SHA-256: `3a245ced54877cce8ae5a7c850360d1b487d2fb97a64e5fa72356e99dc28cea5`. 2 declared registrations.

Production target: GarageScene.draw with scene equipment/dress/live geometry.

Fixture/helper ranges: 32-34 constants; 37-70 harness; 72-74 TEAM/LIV; 77-94 collect; 96-103 inTri; 106-126 coverage.

Fixtures / limits: 60×12 samples per wall quad, opaque triangles entirely 0.012–0.5 m in front, 5% maximum. Floor quads excluded. One team/day scene; ignores distant/preset-dependent occlusion, transparency, raster pixels, text painting and subcell coverage.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| the harness builds the dress and live quads, not just the shell | 128-134 | 131, 133 | GarageScene wall geometry — the harness builds the dress and live quads, not just the shell. Supplied fixtures only. |
| no wall sign has opaque geometry mounted over it within half a metre | 136-147 | 146 | GarageScene wall geometry — no wall sign has opaque geometry mounted over it within half a metre. Supplied fixtures only. |

## tests/unit/gen-agent-index-order.test.mjs

Read range: 1-146; SHA-256: `7e3de32f0fdfc7b79c40c2d22640b35182f8fee93944417b1bb3974fce7a25a0`. 4 declared registrations.

Production target: gen-agent-index comparator/index/hook/impact rendering.

Fixture/helper ranges: 31-43 shuffleInPlace; 46-55 reorderKeys; 58-68 shuffleManifest; 70-78 listSpecFiles.

Fixtures / limits: Real repository manifest/spec inputs with deterministic seeded permutations. Tests output equality for chosen permutations; no cross-host locale process or browser.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| cmpStr is locale-free plain < (not localeCompare) | 80-88 | 81, 82, 83, 85, 86, 87 | tools/docs/gen-agent-index.mjs — cmpStr is locale-free plain < (not localeCompare). Supplied fixtures only. |
| sortById is stable on equal ids (ties by path) | 90-102 | 99-101 | tools/docs/gen-agent-index.mjs — sortById is stable on equal ids (ties by path). Supplied fixtures only. |
| flattenHooks / buildIndex are byte-identical across shuffled manifests | 104-127 | 109, 110, 113, 114, 121-124 | tools/docs/gen-agent-index.mjs — flattenHooks / buildIndex are byte-identical across shuffled manifests. Supplied fixtures only. |
| buildImpactMap is byte-identical across shuffled spec lists | 129-146 | 138, 139, 143, 145 | tools/docs/gen-agent-index.mjs — buildImpactMap is byte-identical across shuffled spec lists. Supplied fixtures only. |

## tests/unit/gen-arch-table.test.mjs

Read range: 1-131; SHA-256: `0ff8969a066d317da821632925d77673f281d5e088ed779e3eed9fe8df174f4c`. 7 declared registrations.

Production target: gen-arch-table collect/roster/header/global/renderBlock and CLI --check.

Fixture/helper ranges: 30-33 ROOT/manifest/read; inline header strings in 99-113 and globals in 116-123.

Fixtures / limits: Real manifest/doc plus in-memory header strings. --check subprocess would validate bytes; row test verifies coverage/floor and collapsed counts, does not independently count duplicates per file despite title. Fixture path strings name supplied text, not filesystem reads.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| docs/ARCHITECTURE.md matches a fresh `gen-arch-table.mjs --check` | 33-39 | 36-38 | tools/gen/gen-arch-table.mjs — docs/ARCHITECTURE.md matches a fresh `gen-arch-table.mjs --check`. Supplied fixtures only. |
| module-index summary has no total row count (merge-safe across concurrent module PRs) | 45-50 | 47-48, 49 | tools/gen/gen-arch-table.mjs — module-index summary has no total row count (merge-safe across concurrent module PRs). Includes source-shape checks; matching text alone is not runtime proof. |
| every non-data manifest file gets exactly one row | 52-83 | 74, 75, 78, 79, 81, 82 | tools/gen/gen-arch-table.mjs — every non-data manifest file gets exactly one row. Supplied fixtures only. |
| each row's roster label is the manifest's own roster, not a guess | 85-95 | 92 | tools/gen/gen-arch-table.mjs — each row's roster label is the manifest's own roster, not a guess. Supplied fixtures only. |
| headerSentence handles the three header shapes js/ uses | 97-111 | 98-100, 101-103, 104-106, 108-110 | tools/gen/gen-arch-table.mjs — headerSentence handles the three header shapes js/ uses. Supplied fixtures only. |
| fileGlobal finds the real global, and treats js/game.js as the documented exception | 113-121 | 114, 115, 116, 120 | tools/gen/gen-arch-table.mjs — fileGlobal finds the real global, and treats js/game.js as the documented exception. Supplied fixtures only. |
| the hand-written contract prose around the block survives regeneration | 123-131 | 126, 127, 128, 129, 130 | tools/gen/gen-arch-table.mjs — the hand-written contract prose around the block survives regeneration. Includes source-shape checks; matching text alone is not runtime proof. |

## tests/unit/generated-docs.test.mjs

Read range: 1-275; SHA-256: `12781eb562a13267b0b3b94b9dd6114304caf324fed3245a6fb579c876c98cfd`. 11 declared registrations.

Production target: Docs generators, package generation order, slider help and reporting ladder.

Fixture/helper ranges: 32-41 GENERATORS; 43-45 check; 62-67 block; inline tool-reader fixtures 137-177.

Fixtures / limits: CLI checks use 60s subprocess timeout; anti-empty/content checks inspect committed files. In-memory tool paths are descriptive fixture keys, not live references. Regex source scans are shape-limited; no execution of sliders/hooks or actual alternate locale host.

Shared helper assertion spans: 65.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| aggregate generation can repair every checked locale and DevFlags output | 47-60 | 54, 55, 56, 57, 58-59 | Generated docs / tools generators — aggregate generation can repair every checked locale and DevFlags output. Supplied fixtures only. |
| `tools/README.md matches a fresh `tools/gen/gen-tools-readme.mjs --check`` | 70-75 | 72-74 | Generated docs / tools generators — `tools/README.md matches a fresh `tools/gen/gen-tools-readme.mjs --check``. Repeats for all six GENERATORS rows (README, sliders, hooks, flags, coverage, agent index). |
| `docs/LIGHTING-TUNER-SLIDERS.md matches a fresh `tools/gen/gen-slider-doc.mjs --check`` | 70-75 | 72-74 | Generated docs / tools generators — `docs/LIGHTING-TUNER-SLIDERS.md matches a fresh `tools/gen/gen-slider-doc.mjs --check``. Repeats for all six GENERATORS rows (README, sliders, hooks, flags, coverage, agent index). |
| `docs/DEBUG-HOOKS.md matches a fresh `tools/gen/gen-hooks-table.mjs --check`` | 70-75 | 72-74 | Generated docs / tools generators — `docs/DEBUG-HOOKS.md matches a fresh `tools/gen/gen-hooks-table.mjs --check``. Repeats for all six GENERATORS rows (README, sliders, hooks, flags, coverage, agent index). |
| `docs/DEBUG-HOOKS.md matches a fresh `tools/gen/gen-flags-table.mjs --check`` | 70-75 | 72-74 | Generated docs / tools generators — `docs/DEBUG-HOOKS.md matches a fresh `tools/gen/gen-flags-table.mjs --check``. Repeats for all six GENERATORS rows (README, sliders, hooks, flags, coverage, agent index). |
| `docs/TESTING-COVERAGE.md matches a fresh `tools/docs/gen-coverage-table.mjs --check`` | 70-75 | 72-74 | Generated docs / tools generators — `docs/TESTING-COVERAGE.md matches a fresh `tools/docs/gen-coverage-table.mjs --check``. Repeats for all six GENERATORS rows (README, sliders, hooks, flags, coverage, agent index). |
| `docs/agent-index.json matches a fresh `tools/docs/gen-agent-index.mjs --check`` | 70-75 | 72-74 | Generated docs / tools generators — `docs/agent-index.json matches a fresh `tools/docs/gen-agent-index.mjs --check``. Repeats for all six GENERATORS rows (README, sliders, hooks, flags, coverage, agent index). |
| tools/README.md: one row per tool, every row within the @doc cap, no undefined | 78-121 | 97, 99, 100-101, 109-110, 111, 115, 119 | Generated docs / tools generators — tools/README.md: one row per tool, every row within the @doc cap, no undefined. Includes source-shape checks; matching text alone is not runtime proof. |
| gen-tools-readme refuses an over-long @doc instead of truncating it (#1709) | 123-139 | 133, 134, 136-138 | Generated docs / tools generators — gen-tools-readme refuses an over-long @doc instead of truncating it (#1709). Supplied fixtures only. |
| tools data-file readers cover specs and CommonJS unit tests | 141-146 | 144, 145 | Generated docs / tools generators — tools data-file readers cover specs and CommonJS unit tests. Supplied fixtures only. |
| tools data readers reuse one source snapshot per collection and refresh the next collection | 148-162 | 154, 155, 156, 159, 160, 161 | Generated docs / tools generators — tools data readers reuse one source snapshot per collection and refresh the next collection. Supplied fixtures only. |
| docs/LIGHTING-TUNER-SLIDERS.md: the generated block lists every TUNE_DEFS knob | 164-177 | 168, 169, 172, 173, 175, 176 | Generated docs / tools generators — docs/LIGHTING-TUNER-SLIDERS.md: the generated block lists every TUNE_DEFS knob. Includes source-shape checks; matching text alone is not runtime proof. |
| docs/DEBUG-HOOKS.md: the hook index names every __apex hook plus the agent-view surface | 179-197 | 184, 189, 191, 193, 195, 196 | Generated docs / tools generators — docs/DEBUG-HOOKS.md: the hook index names every __apex hook plus the agent-view surface. Includes source-shape checks; matching text alone is not runtime proof. |
| the consumer column credits a slider to files that read the TUNE, not to homonyms | 199-222 | 212, 215-216, 220, 221 | Generated docs / tools generators — the consumer column credits a slider to files that read the TUNE, not to homonyms. Includes source-shape checks; matching text alone is not runtime proof. |
| a slider's help text states ITS OWN ceiling, not a bound it no longer has | 224-253 | 250, 251-252 | Generated docs / tools generators — a slider's help text states ITS OWN ceiling, not a bound it no longer has. Supplied fixtures only. |
| gen-ladder-figures: the report is three real rows and the figures form a ladder | 259-275 | 263, 264, 265, 265, 268, 269, 271, 272, 273-274 | Generated docs / tools generators — gen-ladder-figures: the report is three real rows and the figures form a ladder. Includes source-shape checks; matching text alone is not runtime proof. |

## tests/unit/geom-mountain-lowmat.test.mjs

Read range: 1-38; SHA-256: `4abbd8adf0f908889966f18421ab3c387a16cf760e7f2ede868a651d326a23b9`. 4 declared registrations.

Production target: TrackGeom.addMountain.

Fixture/helper ranges: 5-12 VM/mats; 22-26 build.

Fixtures / limits: Seed 3, 10 segments, origin, radius 100/height 60. Default/profile comparison checks positions/colours only; material membership and axis extents do not prove topology/render correctness.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| addMountain default keeps FOLIAGE on the lower zone | 13-15 | 14 | TrackGeom.addMountain — addMountain default keeps FOLIAGE on the lower zone. Supplied fixtures only. |
| addMountain lowMat replaces the FOLIAGE zone (desert dunes) | 16-20 | 18, 19 | TrackGeom.addMountain — addMountain lowMat replaces the FOLIAGE zone (desert dunes). Supplied fixtures only. |
| addMountain profile/stretch/crest are opt-in: explicit defaults are byte-identical | 26-30 | 28, 29 | TrackGeom.addMountain — addMountain profile/stretch/crest are opt-in: explicit defaults are byte-identical. Supplied fixtures only. |
| addMountain massif profile adds rings; stretch elongates along fwd only | 31-38 | 33, 36, 37 | TrackGeom.addMountain — addMountain massif profile adds rings; stretch elongates along fwd only. Supplied fixtures only. |

## tests/unit/geometry-paths-baseline.test.mjs

Read range: 1-33; SHA-256: `5636eedc49078f9b44130ab3a6b4cbb10f62a8a9b162043757806e8c2056cbbb`. 3 declared registrations.

Production target: geometry-paths targetedSuites/sweepOrder; ground-audit baseline input.

Fixture/helper ranges: 16-18 ROOT/BASELINE/SUITE.

Fixtures / limits: Static path routing, existence and source string evidence. Does not run the routed sweep or validate baseline contents; unrelated files are only two selected examples.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| the scenery audit baseline routes the targeted sweep that reads it | 20-23 | 21, 22 | tools/ci/geometry-paths.mjs — the scenery audit baseline routes the targeted sweep that reads it. Supplied fixtures only. |
| the routed suite is a real test:sweeps member and really reads the baseline | 25-29 | 26, 27, 28 | tools/ci/geometry-paths.mjs — the routed suite is a real test:sweeps member and really reads the baseline. Includes source-shape checks; matching text alone is not runtime proof. |
| an unrelated data file still routes no sweep | 31-33 | 32 | tools/ci/geometry-paths.mjs — an unrelated data file still routes no sweep. Supplied fixtures only. |

Total: 102 declared registration sites; 109 expanded cases are listed. Dynamic loops expand the mesh comparison to two cases, identity lock to two cases, and generator freshness to six cases. All case bodies, fixture setup and shared assertions above were inspected; no passing-test claim is made.

## Source and fixture snapshot ledger

Existing files directly loaded, imported or read by the group (descriptive in-memory fixture keys are excluded). Full-file ranges identify the snapshot, not a claim that every production body was read. Production anchors above record the bounded navigation performed.

| Existing source / helper | Full range | SHA-256 |
|---|---|---|
| css/carsetup.css | 1-1977 | `4d235738b11c969af77099b5e045c3ab992cef96c44db925cd814c5e728acf29` |
| js/agent/apex.js | 1-2495 | `fc763bef7f8648781baa4f884933265d07545630a54df8218197e6aa439c7fc1` |
| js/car/crest-paths.js | 1-85 | `5b9bef47d3211a8adabbb035348ec8bfcf719a3030927a3685f6c59b64cecd1a` |
| js/car/parts.js | 1-1043 | `7b4c53b388b06b294b59faf46f44f5d01b7fccece83e8732b3c083194558fe4f` |
| js/career/regulations.js | 1-119 | `8423af9b935c719538a622e091216a8476a4b6a4c8695727b6e0141a948bc6d2` |
| js/core/mat4.js | 1-98 | `8b80f0f6223622840031c736453f9d84862f049e70ce49a1709090098f7d121d` |
| js/data/teams.js | 1-395 | `6ff73b5e60b9d510d9a9d4a17129f1947811ce217fda0dc8c1ccf8b64fdfe838` |
| js/game.js | 1-9554 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| js/garage/arrival.js | 1-279 | `f4f1f7ba4c7442f6e55ae06c95489843f7a37ad20b44a66b4a0c615a3455eb22` |
| js/garage/experience.js | 1-181 | `d056d7825af79b0a79518aec34e0e3184a134b3a45a6f52fc63418249a51598d` |
| js/garage/prebuild.js | 1-354 | `f747ff4c1359d367a335e45b238e55fe17f47c5ec0179225a8b929bc03b89696` |
| js/garage/scene-crew.js | 1-356 | `49d45c984b35f10ffdce57cdde76814eaea571f8874740ffe123223907195801` |
| js/garage/scene-dress.js | 1-644 | `9b4c16e4f14d2669c8320bbe0b14b9d1c4d069260d6ce51c2ba7efbc84a64cee` |
| js/garage/scene-equipment.js | 1-374 | `c0f5d72820c82fb8b049085852f4a0df8b6f5cd65fa5c6504e6459b39f0bef61` |
| js/garage/scene-live.js | 1-215 | `f37ab403ccabe33c92bd23d4088a102897dc028541af839213ecbe00195bd5bf` |
| js/garage/scene-prims.js | 1-314 | `227201c803f8f1db3385016437c72e1c0c6fe38b3eb125a63ef6036f28e1335c` |
| js/garage/scene.js | 1-1532 | `43e2ba3b86ea7e2a74cf2d2d14b45a403d5a515320de597c9170a2d7e3fd20d9` |
| js/garage/setup-camera.js | 1-1153 | `15edc407088a93398cfa04a8ec828867e956d2d832c1cfffafb2c94589843637` |
| js/garage/setup-experiments.js | 1-170 | `37f58c215d81e1da25743aafded99336ad06ca13e4101ce930babad038221d4a` |
| js/garage/setup-sheet.js | 1-1725 | `4c6302ec91946cfb134e8155d314e421844d73524d6f3dac5e679efba699f4da` |
| js/garage/setup-tune.js | 1-153 | `8d9029dab3d314e10ad6a4be8845c5af04176d8ff4945606e326a1c46c0723ae` |
| js/lighting/knobs.js | 1-258 | `ddcb861d37e0b881cd0dcd46eea21b0858552f30e3bcf1442b9fb3796cf8165d` |
| js/physics/consts.js | 1-331 | `5b4ca20dff59b0139fa2e4bb531d092a54738274dcca666a40067cad42c005aa` |
| js/roster.js | 1-920 | `0693f9b697d4bd66164a2ba305239d66a6c8aa1267398b398cf49405f2e43d67` |
| js/track/core/geom.js | 1-370 | `b26d3ac24079b41009a095c9ca6f38ac44720d284c376a588932ac160ce0187a` |
| js/track/core/pit.js | 1-490 | `28d9e328f6b4b161c4212ad89725e73b254005a59cc973f0cc11eab5236ea872` |
| js/ui/loading-screen.js | 1-998 | `10e41fe7df89e96271b724ecfb35c433f67b46a05bdf3a1a9d14e8e14614c2a5` |
| tests/helpers/abs-src.mjs | 1-8 | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| tests/helpers/mini-dom.mjs | 1-186 | `3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1` |
| tools/car/parts-sweep.mjs | 1-1011 | `60df9d4b5ad7080a9c7a4444d892078d271c89030bbedf429efe1f7d01602949` |
| tools/ci/geometry-paths.mjs | 1-262 | `f5ed0099ffdb374e684d92556b145f64ea34e5d8f59137945681d5521785fba6` |
| tools/docs/gen-agent-index.mjs | 1-399 | `c58467c3cc7c2c0e1380751114b7c61fd7201649b4ad5713fe45ef5a13d1c310` |
| tools/docs/gen-coverage-table.mjs | 1-96 | `688aa28a5b169bf737e7aa6f999b2d5e85036651ed32da7f6c4c73b0d8c64c36` |
| tools/gen/gen-arch-table.mjs | 1-199 | `2dc63b5746f557c362d7989fd1dbf2b6eb85c344e676978dc1953bfc427dd56f` |
| tools/gen/gen-flags-table.mjs | 1-65 | `906d7216f454fa9f0e83a879a0a997a8605af54a7e123a402a3a9f6ce9122c83` |
| tools/gen/gen-hooks-table.mjs | 1-215 | `572418b999625e2b154017cee4a0d331dca421f0a0fcca4de32e00dbf83f9b63` |
| tools/gen/gen-ladder-figures.mjs | 1-85 | `c931913265d78dbe3d3fdcd216a32015648849bc60f614fed59f893277c16b02` |
| tools/gen/gen-slider-doc.mjs | 1-222 | `429a9e12255e12313dae188661ae481cbe82f7117f063705f7c5c9ea31a7f785` |
| tools/gen/gen-tools-readme.mjs | 1-290 | `6af9992233198f84dec389c1016deba8f4cb71553a2097cb261b4033d2702923` |
| tools/track/ground-audit.cjs | 1-371 | `9afae60024a8d8a2c58cd02c9cb1e418726f45d8bfe0079029ecfd461c3b0e04` |
