# Unit group 15 — complete semantic map

Read-only mapping of all 19 files in group 15 of `unit-batches.json` (4,618 lines). Every body read; exact-byte SHA-256 and inclusive read ranges follow. No tests, browser, runtime changes or commits. Case ranges cover registration calls; assertionSpans cover full assertion calls, including nested callbacks. Titles state each expected behavioral contract; the meaning column identifies its evidence and boundary. Dynamic registrations are explicitly expanded below.

Navigation: AGENTS.md and `.claude/skills/code-nav/SKILL.md` read. Attached tools were discovered; shell apex-lsp fallback performed bounded outlines for DriverRatings, DrivingCues, DrivingLineOpts, DrivingLine, Droplets, Particles, RaceSettings, Duel, EditorWorkspace, ElevPresets, Tracks, GameAudio and RealReplay. Bounded definitions confirmed DrivingCoach.create (50–84) and GameAudio.setEngine (1658–1687). LSP lists the lazy audio stub as a second setEngine candidate; fake-audio boots await replacement before assertions. An initial wrong replay filename lookup returned no file, corrected to real-replay.js. Outlines with omitted rows are navigation only, never claimed as full source reads. Direct source reads cover EditorWorkspace 1–120, ElevPresets 1–110 and elevation-probes 1–164.

## tests/unit/docs-integrity.test.mjs

- Full read: 1–1065; SHA-256: `f3665a3d7817d402fe96e76e5d1d2785f846a037986d1a3d47247b1475b44746`.
- Production: Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration; Parts.CATALOG and lighting defaults.
- Fixtures and setup: Real tracked working tree, git index, recursive source/document scans. PLACEHOLDERS and SOURCE_EXEMPT deliberately include synthetic fixture paths (duplicate move-tree/CI-planner labels and absent-spec sentinels); they are not live dependencies. Optional baked-elevation output and intentionally removed PerfTry are distinct exemptions.
- Limits: Static lexical/shape guards; exclusions and regex floors define scope. Link anchors and prose correctness are not generally checked. figureEqual is advisory only under APEX_DOCS_FIGURES_ADVISORY=1.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| live docs reference only files that exist | 168–174 | 172–173 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | a doc points at a path that no longer exists — update the doc, or add a placeholder if it is illustrative. Repository-derived guard; lexical scope and exemptions above. |
| a `file.js:NNN` citation in a comment points inside that file | 227–287 | 285–286 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | a comment cites a line number past the end of the file it names — the code moved; cite a function or symbol instead. Repository-derived guard; lexical scope and exemptions above. |
| source comments reference only files that exist | 289–313 | 311–312 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | a source comment points at a path that no longer exists — update it, or add a justified SOURCE_EXEMPT entry. Repository-derived guard; lexical scope and exemptions above. |
| tests/manual/README.md indexes every suite in that directory, and only real ones | 315–343 | 335–336, 342 | tests/manual/README.md | a suite in tests/manual/ is absent from its README table — nothing else indexes these files; the manual README lists a suite that no longer exists. Repository-derived guard; lexical scope and exemptions above. |
| skills reference only files that exist | 345–351 | 349–350 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | a skill points at a path that no longer exists — skills are run by agents, so a dead path is a dead end. Repository-derived guard; lexical scope and exemptions above. |
| the scenery api member count in the docs matches the frozen contract | 353–369 | 356, 367, 368 | tests/unit/scenery-api-contract.test.mjs | could not find the CONTRACT array; no doc states the scenery(api) member count — the scan checked nothing (reworded?). Repository-derived guard; lexical scope and exemptions above. |
| the test-suite counts in the agent docs and README.md match the files on disk | 371–407 | 389 (helper), 393, 402 (helper), 403, 406 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | neither CLAUDE.md nor README.md states a Playwright spec count any more. Repository-derived guard; lexical scope and exemptions above. |
| docs/TESTING.md quotes no hard spec ratio or twin count — the tools print them (#2168) | 409–422 | 421 | docs/TESTING.md | name the measuring tool (fixture-consumer-audit / vm-portable / twinned-specs) instead of a count. Repository-derived guard; lexical scope and exemptions above. |
| the gate ladder is a ladder, and no doc commits its sizes | 424–455 | 443, 444, 445, 448, 453 | tests/groups.json | the report tool measures the same ladder. Source/text contract; pattern scope only. |
| ci.yml makes the derived figures advisory off pull requests, and only there | 457–470 | 463, 465–466, 468, 469 | .github/workflows/ci.yml, package.json, tools/ci/tooling-fast.mjs | all four tooling-fast shards must exist so Structural guards can split; each tooling-fast shard must set APEX_DOCS_FIGURES_ADVISORY=1 off pull requests only. Source/text contract; pattern scope only. |
| README's retired-classics count matches the circuits flagged classic | 472–483 | 477, 479, 480, 482 | README.md | no circuit is flagged classic — the regex or the flag moved; README.md no longer states a retired-classics count. Repository-derived guard; lexical scope and exemptions above. |
| README's season round list names exactly the non-classic circuits | 485–502 | 497, 499, 501 | README.md | could not read every non-classic circuit's name; README.md no longer has a 'The season rounds: …' sentence. Repository-derived guard; lexical scope and exemptions above. |
| live docs name only real files in backticked bare `name.js` tokens | 515–536 | 534, 535 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | no live doc names a backticked bare .js file — the scan checked nothing; a live doc names a .js file no tracked file is called — write its real path, or mark the line historical. Repository-derived guard; lexical scope and exemptions above. |
| live docs name only real test files in backticked bare `name.test.mjs` / `name.spec.js` tokens | 544–565 | 563, 564 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | no live doc names a backticked bare test file — the scan checked nothing; a live doc names a test file no tracked file is called — write its real name, or mark the line historical. Repository-derived guard; lexical scope and exemptions above. |
| the circuit count in the docs matches js/circuits/ | 570–582 | 575, 578 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | Repository-derived guard; lexical scope and exemptions above. |
| the parts-category count in the docs matches Parts.CATALOG | 584–597 | 590, 594–595 | js/car/parts.js | could not count Parts.CATALOG categories. Repository-derived guard; lexical scope and exemptions above. |
| live docs and skills cite AGENTS.md as the rule owner, not CLAUDE.md | 599–625 | 624 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | cite AGENTS.md for current rules; leave archive/research alone. Repository-derived guard; lexical scope and exemptions above. |
| CLAUDE.md is a stub that imports AGENTS.md, not a second copy | 627–640 | 635–636, 638–639 | CLAUDE.md | CLAUDE.md must import AGENTS.md with a line reading exactly `@AGENTS.md`. Repository-derived guard; lexical scope and exemptions above. |
| AGENTS.md's matTexMix default matches TUNE_DEFS | 642–682 | 647, 651, 652–653, 654–655, 658, 659, 677–678, 680–681 | js/lighting/knobs.js, AGENTS.md | matTexMix is no longer a TUNE_DEFS entry with a def; the baked-asset-pack section moved. Source/text contract; pattern scope only. |
| AGENTS.md's layout names the module-roster truth it defers to | 684–707 | 695, 696–697, 703, 705–706 | tools/manifest.cjs, AGENTS.md | tools/manifest.cjs unreadable; AGENTS.md no longer points readers at tools/manifest.cjs for the module roster. Repository-derived guard; lexical scope and exemptions above. |
| AGENTS.md names the deploy branch | 709–719 | 715, 717–718 | AGENTS.md, .github/workflows/pages.yml | pages.yml no longer pins a deploy branch (env DEPLOY_BRANCH). Repository-derived guard; lexical scope and exemptions above. |
| every npm test:* group names specs that exist | 721–748 | 744–746, 747 | package.json | an npm test group points at a spec that no longer exists. Repository-derived guard; lexical scope and exemptions above. |
| every renderer backend directory is described in AGENTS.md | 750–762 | 761 | AGENTS.md | a renderer backend/dir under js/render/ is missing from the AGENTS.md layout. Repository-derived guard; lexical scope and exemptions above. |
| the skills index lists every skill | 764–771 | 770 | .claude/skills/README.md | a skill exists on disk but is not in .claude/skills/README.md. Repository-derived guard; lexical scope and exemptions above. |
| docs/README.md indexes every directory under docs/ | 773–799 | 798 | docs/README.md | a directory under docs/ is unreachable from docs/README.md. Repository-derived guard; lexical scope and exemptions above. |
| the agents index lists every custom subagent and gitignore tracks the dir | 801–817 | 805–808, 811, 816 | .gitignore, .claude/agents/README.md | .gitignore must allowlist !.claude/agents/ so subagents are trackable; .claude/agents/ must exist. Repository-derived guard; lexical scope and exemptions above. |
| every tool named in tools/README.md exists on disk | 819–840 | 839 | tools/README.md | tools/README.md documents a tool that does not exist on disk. Repository-derived guard; lexical scope and exemptions above. |
| tools/README documents live test-infra knobs and stays two-column in the runner section | 842–856 | 847, 850, 851, 852–853, 854–855 | tools/README.md | fixture-consumer upper-bound slack must be indexed; select-specs row missing. Source/text contract; pattern scope only. |
| the tools index lists every tool | 858–880 | 879 | tools/README.md | a tool exists on disk but is not in tools/README.md. Repository-derived guard; lexical scope and exemptions above. |
| docs/README indexes every live engineering doc | 882–887 | 886 | docs/README.md | a doc under docs/ is not linked from docs/README.md. Repository-derived guard; lexical scope and exemptions above. |
| every markdown table in docs/README.md has a header separator before body rows | 889–906 | 904 | docs/README.md | Repository-derived guard; lexical scope and exemptions above. |
| docs/README indexes every research doc too | 908–917 | 915–916 | docs/README.md, docs/NOTES-INDEX.md | a doc under docs/research/ is not linked from docs/README.md. Repository-derived guard; lexical scope and exemptions above. |
| every relative link in EVERY live doc resolves | 919–968 | 967 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | a live doc links to a path that does not exist. Repository-derived guard; lexical scope and exemptions above. |
| every relative link inside archived documentation resolves | 970–992 | 991 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | an archived doc links to a path that does not exist. Repository-derived guard; lexical scope and exemptions above. |
| no live doc points a reader at archived documentation | 994–1015 | 1013–1014 | Repository docs/indexes, AGENTS.md, tools/manifest.cjs, tests/groups.json, CI configuration | a live doc references archived documentation — either it should not be archived, or the reference is stale. Repository-derived guard; lexical scope and exemptions above. |
| the data hub does not hardcode a season year | 1017–1032 | 1030–1031 | js/data/api.js, js/data/hub.js | a season year is hardcoded again — derive it from the clock, or the data hub silently ages out. Repository-derived guard; lexical scope and exemptions above. |
| Supersedes: / Superseded by: pairs in docs/notes are two-way and indexed | 1042–1065 | 1050, 1053, 1055, 1057, 1062–1063 | docs/README.md, docs/NOTES-INDEX.md | Source/text contract; pattern scope only. |

## tests/unit/drift-vm.test.mjs

- Full read: 1–152; SHA-256: `fbca0dd258eeea03454278042e5ced93958356d22e2000324c75793572e992dd`.
- Production: js/physics/player-forces.js; js/agent/apex.js; js/physics/consts.js.
- Fixtures and setup: createGame boot on Monza; saved tuning restored per case; PACE=1; fixed steering/step windows avoid pit-wall contamination. gt/lt helper assertions at 20–21; errorsSince includes console errors and rejections.
- Limits: Real game VM numerical hooks; no browser rendering or player-input device evidence. Qualitative thresholds concern these sampled maneuvers.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| default car is stable at the limit: full lock washes wide, never spins | 68–78 | 75, 76 (helper), 77 (helper) | js/physics/player-forces.js | Game VM numeric/call evidence; no browser/audio output. |
| SLIDE loosens the rear: more slip than planted | 80–86 | 84, 85 (helper) | js/physics/player-forces.js | Game VM numeric/call evidence; no browser/audio output. |
| slide self-aligns: release the steering and the slip decays | 88–101 | 100 (helper) | js/physics/player-forces.js | Game VM numeric/call evidence; no browser/audio output. |
| cornering is grip-limited: yaw rate doesn't run away with speed | 103–113 | 111, 112 (helper) | js/physics/player-forces.js | Game VM numeric/call evidence; no browser/audio output. |
| high drift + aggressive steering never NaNs or flies off | 115–134 | 131, 132, 133 (helper) | js/physics/player-forces.js | Game VM numeric/call evidence; no browser/audio output. |
| SPEED STEER: higher keeps more turn-in at high speed | 136–152 | 151 (helper) | js/physics/player-forces.js | Game VM numeric/call evidence; no browser/audio output. |

## tests/unit/driver-ratings-personality.test.mjs

- Full read: 1–136; SHA-256: `776bfe44faae7952f79588b2e037fa1c5622b63f5c79758097ab441e86cd1d51`.
- Production: js/data/driver-ratings.js; tools/lib/ai-ratings-math.mjs.
- Fixtures and setup: VM loads real M4/Hash32/DriverRatings. Authored BASE, pinned 22-driver pace table, 200 deterministic unrated codes, dangerous inherited-property codes and malformed deltas.
- Limits: Table/distribution and pure rating-function evidence; no race pacing or overtaking integration.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| authored BASE: craft/awareness/consistency pairwise \|r\| < 0.5 | 24–35 | 30, 32, 33, 34 | js/data/driver-ratings.js | Controlled fixture values/calls; limits above. |
| skill() is pace(+consistency jitter) only — craft reshuffle does not move it | 37–45 | 42, 44 | js/data/driver-ratings.js | craft/awareness must not enter skill(); lower pace must lower skill. Controlled fixture values/calls; limits above. |
| overall() still ranks VER above LIN and keeps elites high | 47–57 | 50, 51, 52, 56 | js/data/driver-ratings.js | Controlled fixture values/calls; limits above. |
| pace column frozen vs tip — skill() at roll 0.5 is pace-only and tip-identical | 67–78 | 71, 76, 77 | js/data/driver-ratings.js | Controlled fixture values/calls; limits above. |
| style axes present, zero-mean, and excluded from overall/skill | 80–96 | 82, 87, 88, 89, 92, 93, 94, 95 | js/data/driver-ratings.js | overall ignores style; skill ignores style. Controlled fixture values/calls; limits above. |
| unrated drivers' style axes are not one-sided (optimism had only 2 bits) | 100–114 | 107, 108, 112, 113 | js/data/driver-ratings.js | Controlled fixture values/calls; limits above. |
| a persisted code of constructor / __proto__ / toString is unrated, never NaN | 116–125 | 120, 121, 123, 124 | js/data/driver-ratings.js | a HIRES row is still found; a BASE row is still found. Controlled fixture values/calls; limits above. |
| get() applies only finite NUMBER deltas (a saved career's string / Infinity delta is ignored) | 127–136 | 129, 130, 131, 132, 135 | js/data/driver-ratings.js | a string delta must not concatenate to 825. Controlled fixture values/calls; limits above. |

## tests/unit/driving-coach.test.mjs

- Full read: 1–629; SHA-256: `b24e7a0b474cdad46207fcf65e94e26ab00099b910fcb557f06fbd76427d4108`.
- Production: js/race/driving-coach.js:50; js/race/race-insights.js; js/race/race-control.js; js/game.js; index.html.
- Fixtures and setup: VM fake store/DOM/car/G, 1000m loop with apexes 100/500/980m and 60s ghost; real RaceInsights only where requested. Announce delivery verdict, practice/caution/traffic flags and fake pit/SetupTrials hooks are explicit controls.
- Limits: Coach decisions, copy, exports and checkpoint state over controlled telemetry; no real audio/banner rendering or driving physics. A lap segment includes the straight after its apex.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| checkpoint retry clears an armed finish countdown before racing resumes | 58–76 | 62, 65, 66, 67, 68, 71, 75 | js/race/driving-coach.js:50 | restored field does not rearm results; the facade clears the actual game countdown, not a detached property. Controlled fixture values/calls; limits above. |
| trace export attaches its anchor so the native document download listener sees the click | 78–91 | 81, 84, 87, 88, 89, 90 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| native trace export awaits sharing and reports failure without opening an anchor fallback | 93–116 | 105, 106, 107, 108, 111, 114 | js/race/driving-coach.js:50 | a second tap cannot open an overlapping native share request; the guard releases after cancellation or failure. Controlled fixture values/calls; limits above. |
| every real practice drill has readable help and canonical goal state survives a session reset | 118–134 | 120, 122, 123, 125, 126, 129, 130, 131, 133 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| the practice arming method refuses career and season scoring even when called directly | 136–153 | 142, 143, 144, 146, 147, 149, 150, 151, 152 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| a coach switched off paints as off, saves the toggle, and paints understandable empty feedback | 155–163 | 157, 158, 159, 160, 161, 162 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| six recommendations use actual inputs and axle slip without changing car state | 165–182 | 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181 | js/race/driving-coach.js:50 | a trailed brake at a third of the ceiling is the technique, not the mistake; deceleration without the pedal is not a braking tip. Controlled fixture values/calls; limits above. |
| coasting and X-mode tips read the pedals, the flaps and the cornering load, and coasting needs sustained evidence | 184–197 | 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 196 | js/race/driving-coach.js:50 | a breath of throttle is driving; a slow car is not coasting. Controlled fixture values/calls; limits above. |
| a tip the banner never showed is not recorded as advice given | 199–214 | 207, 208, 212, 213 | js/race/driving-coach.js:50 | the coach stopped offering the tip, not just saying it; a tip nobody saw was logged as delivered. Controlled fixture values/calls; limits above. |
| a track-limits warning is coached at once, but not the count the coach first saw nor the reset after a penalty | 216–234 | 218, 219, 219, 220, 221, 223, 224, 229, 232, 233 | js/race/driving-coach.js:50 | an existing count is history, not a new warning; the game announces the penalty that reset the ladder. Controlled fixture values/calls; limits above. |
| a tip records the curated turn it happened at, wrapping across the start line | 236–251 | 239, 241, 243, 245, 246, 248, 250 | js/race/driving-coach.js:50 | a tip on a straight names no turn; the review is a copy. Controlled fixture values/calls; limits above. |
| the turn window is a distance, not a share of the lap, so a long circuit keeps its straights | 253–260 | 257, 259 | js/race/driving-coach.js:50 | 100 m past the apex is that turn on any circuit; 300 m out is 3% of this lap — a fraction window would have called it Turn 1. Controlled fixture values/calls; limits above. |
| a repeated tip names the practice goal that drills it, and the review reads as advice | 262–281 | 265, 266, 269, 269, 270, 271, 272, 275, 276, 277, 278, 280, 280 | js/race/driving-coach.js:50 | one tip is not a pattern; the review names the goal the way the picker does. Controlled fixture values/calls; limits above. |
| counts rank the most repeated tip first so the panel does not ask the driver to compare numbers | 283–290 | 289 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| the lap report differences your time against the reference at each apex, and names the worst corner | 299–318 | 308, 310, 311, 312, 313, 314, 315, 316, 317 | js/race/driving-coach.js:50 | the worst corner is named; segments are ranked worst first. Controlled fixture values/calls; limits above. |
| a lap report is a copy, clears on reset, and needs a reference lap to exist at all | 320–335 | 324, 328, 329, 330, 332, 334 | js/race/driving-coach.js:50 | two corners, worst first; the report handed out is a copy. Controlled fixture values/calls; limits above. |
| a teleport cannot invent a segment, and a faster lap reads as faster | 337–350 | 343, 347, 348, 349 | js/race/driving-coach.js:50 | the jumped lap produced no report; the lap after the teleport is measured. Controlled fixture values/calls; limits above. |
| only a Time Trial lap is measured, and a caution lap is dropped rather than charged to a corner | 352–368 | 357, 364, 365, 367 | js/race/driving-coach.js:50 | a race lap was measured against a Time Trial ghost; the caution lap produced a report. Controlled fixture values/calls; limits above. |
| checkpoint messages name the practice goal, and the pause menu lists attempts and the saved best | 370–382 | 372, 372, 373, 373, 378, 381 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| retry puts the pit plan back: replan() mutates it in place, so it rides in the checkpoint with tyre and pitNext | 384–399 | 388, 391, 392, 394, 395, 397, 398 | js/race/driving-coach.js:50 | the plan the checkpoint saw; the saved plan is a copy. Controlled fixture values/calls; limits above. |
| practice guidance says retry and rewind restore the grid and race clock | 401–413 | 403, 406, 407, 408, 410, 411, 412 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| brief transients and suspended frames cannot trigger a tip; sustained evidence can | 415–426 | 418, 419, 420, 421, 422, 423, 425 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| global spacing and per-tip cooldown prevent repeated reminders | 428–436 | 430, 431, 432, 433, 434, 435 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| cautions and race messages discard pending evidence rather than queue a stale tip | 438–449 | 444, 444, 446, 447 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| pause, pits, finish and retirement suppress coaching, and toggle resets pending evidence | 451–461 | 455, 456, 459, 460 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| feedback snapshots cannot corrupt session counts; reset clears history but keeps the preference | 463–471 | 466, 466, 467, 468, 469, 469, 470 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| coasting advice allows cornering and a deliberate lift behind traffic, including over the line | 473–482 | 476, 477, 478, 480, 481 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| coach yields to alongside traffic and does not accumulate evidence while paused | 484–493 | 487, 488, 491, 492 | js/race/driving-coach.js:50 | pause is not sustained braking evidence. Controlled fixture values/calls; limits above. |
| repeated corner mistakes earn a next-lap approach reminder without adding mistakes | 495–512 | 502, 506, 507, 508, 509, 510, 511 | js/race/driving-coach.js:50 | one reminder per turn per lap. Controlled fixture values/calls; limits above. |
| lap-loss feedback waits for traffic and braking to clear | 514–526 | 520, 521, 523, 525 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| the tyre watch names the corner eating a fast-wearing set, and which end of the car | 528–547 | 538, 539, 546 | js/race/driving-coach.js:50 | logged for the debrief; no tyre line at the planned rate. Controlled fixture values/calls; limits above. |
| wake exit cue requires sustained measured loss and keeps the existing quiet/repeat policy | 551–561 | 553, 554, 555, 556, 557, 557, 559, 560 | js/race/driving-coach.js:50 | advice never drives the car. Controlled fixture values/calls; limits above. |
| wake cue suppresses unqualified evidence ${JSON.stringify(fields)} | 566–569 | 568 | js/race/driving-coach.js:50 | Controlled fixture values/calls; limits above. |
| wake dwell yields to flags and traffic and respects the once-per-frame stamp | 571–580 | 573, 575, 577, 578, 579 | js/race/driving-coach.js:50 | duplicate frame does not accumulate dwell. Controlled fixture values/calls; limits above. |
| cooling goal uses the existing selected practice control and displays its measured verdict | 582–595 | 586, 587, 593, 594 | js/race/driving-coach.js:50 | explicitly arms through checkpoint button API. Controlled fixture values/calls; limits above. |
| WATCH pause hides pit strategy and cannot choose tyres; driving restores it | 598–620 | 611, 612, 613, 614, 615, 617, 618, 619 | js/race/driving-coach.js:50 | even a retained strategy handler cannot edit replay tyres; WATCH does not calculate a simulated pit recommendation. Controlled fixture values/calls; limits above. |
| setup trial hook arms real unscored launch, samples equivalence and settles once through the comparison owner | 622–629 | 626, 626, 627, 627, 627, 627, 627, 628 | js/race/driving-coach.js:50 | refuses a scored session. Controlled fixture values/calls; limits above. |

Generated wake suppression cases (registration 566–569, assertion 568): eleven separate rows of input evidence are exercised: dirtyAirMul=1; dirtyAirMul absent; wake=.2; aeroX=1; coachAssisted=true; incidentInvalidLap=true; dnf=dns; pitState=lane; throttleDemand=0; brakeDemand=.3; speed=5. Each expects no wake count after 1.2s; this tests qualification independently, not all combinations.

## tests/unit/driving-cues.test.mjs

- Full read: 1–419; SHA-256: `eac755edcc401ff0a8899a0f60e677b1d6e3794b48d6a4478c755c25ef01136d`.
- Production: js/audio/driving-cues.js.
- Fixtures and setup: VM curvature fixtures (signed left/right peaks, sweeper, short straights, chicane jitter), fake monotonic clock and GameAudio counters; fake injected slider/store; shared BrakeCue capacity/busy stubs.
- Limits: Read/call counts establish assist gating and deduplication; no audible timing, real geometry or browser slider proof.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| slider 1 is OFF; mid notches are on | 49–55 | 51, 52, 53, 54 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| OFF path performs zero curvature reads over N ticks | 57–71 | 68, 69, 70 | js/audio/driving-cues.js | OFF must not touch Tracks.curvature. Controlled fixture values/calls; limits above. |
| left-hand curvature ahead yields L corner call; urgency rises into a corner | 73–88 | 84, 85, 87 | js/audio/driving-cues.js | ON must sample curvature. Controlled fixture values/calls; limits above. |
| source never calls announce or raceRadio | 90–95 | 92, 93, 94 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| urgency is 0..1 only — never a brake command | 97–101 | 100 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| cornerSide maps +k to LEFT and -k to RIGHT | 103–110 | 107, 109 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| one call per turn: a long sweeper is called ONCE, and the next turn on the same side is called again | 112–133 | 132 | js/audio/driving-cues.js | the sweeper once, the later left once. Controlled fixture values/calls; limits above. |
| two same-side turns split by a straight shorter than the lookahead are each called | 135–156 | 155 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| a double-apex dip inside one long turn does not re-arm the call | 158–177 | 176 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| the call memory resets when the cues stand down (a new race starts clean) | 179–196 | 191, 195 | js/audio/driving-cues.js | the first call of the next race is not suppressed. Controlled fixture values/calls; limits above. |
| cornerExit uses the nearest same-side entry, so a sharper second turn already in the window still gets its own call | 198–223 | 222 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| a rewind behind lastCallS does not re-arm and double-call the same turn | 225–249 | 244, 248 | js/audio/driving-cues.js | sweeper called once on approach. Controlled fixture values/calls; limits above. |
| crawling through a chicane: opposite-side flips are spaced, not machine-gunned | 251–280 | 277, 278–279 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| a race-pace chicane still gets both calls (1.4 s / 69 m apart) | 282–300 | 299 | js/audio/driving-cues.js | Controlled fixture values/calls; limits above. |
| audio driving cues stay silent during a real-race WATCH (same gate as the spotter) | 302–344 | 341, 342, 343 | js/audio/driving-cues.js | no brake tone while watching; no corner calls while watching. Controlled fixture values/calls; limits above. |
| injected AUDIO DRIVING CUES slider is painted from the store and wired (H11) | 368–383 | 373, 374, 375, 377, 378, 379, 381, 382 | js/audio/driving-cues.js | first paint must show the saved level, not 1; injected slider must carry its own handler. Controlled fixture values/calls; limits above. |
| condition mode delegates to the shared capacity estimate only while cues are ON | 386–394 | 388, 390, 391, 393, 393 | js/audio/driving-cues.js | default timing remains unchanged. Controlled fixture values/calls; limits above. |
| the predictive cue is asked whether it is busy only past the brake gate | 396–419 | 413, 415, 416, 418 | js/audio/driving-cues.js | below the gate the busy check is skipped; past the gate the predictive cue is consulted. Controlled fixture values/calls; limits above. |

## tests/unit/driving-line-opts.test.mjs

- Full read: 1–182; SHA-256: `e9d76cf2c576f2c5f6648a2ff5664ca2816b7b69ef553431dc3c6e50f0e587ce`.
- Production: js/ui/driving-line-opts.js:10; index.html.
- Fixtures and setup: Fake SettingRow records specs, fake DrivingLine setters/store and delayed DOMContentLoaded. Reads actual shell for IDs, fold placement and instructional copy.
- Limits: Wiring and initial restoration; real SettingRow layout/input handling and rendered accessibility are outside scope.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| every row it claims is a real set-row in the shell, and it claims all three | 54–66 | 56, 58, 59, 63, 64–65 | js/ui/driving-line-opts.js:10 | steer BRAKE CUE range keeps pm-brakecue; the set-row must not reuse the slider id. Controlled fixture values/calls; limits above. |
| the stored values reach DrivingLine AT EVAL, before any DOM event | 68–78 | 74, 75, 76, 77 | js/ui/driving-line-opts.js:10 | precondition: the UI has not been wired yet; palette restored at eval. Controlled fixture values/calls; limits above. |
| a pre-rename string under brakeCue still restores the cue at eval | 80–87 | 84, 86 | js/ui/driving-line-opts.js:10 | legacy string on → cue on; legacy number is the slider, not this flag. Controlled fixture values/calls; limits above. |
| an absent store gives the shipped defaults, and BRAKE CUE ships OFF | 89–94 | 91, 92, 93 | js/ui/driving-line-opts.js:10 | an assist must not switch itself on. Controlled fixture values/calls; limits above. |
| each row round-trips through the store under its own key | 96–123 | 99, 100, 101, 104, 105, 107, 109, 117, 118, 119, 121, 122 | js/ui/driving-line-opts.js:10 | read() reflects the write; stored as the string the loader reads back. Controlled fixture values/calls; limits above. |
| the legacy shared key is honoured as a flag, never as the slider's notch | 125–146 | 129, 136, 141, 145 | js/ui/driving-line-opts.js:10 | a legacy string flag still restores; the new key is the truth once written. Controlled fixture values/calls; limits above. |
| it wires on DOMContentLoaded when the document is still loading | 148–153 | 150, 152 | js/ui/driving-line-opts.js:10 | the rows are claimed once the shell exists. Controlled fixture values/calls; limits above. |
| it reaches nothing from game.js — the reason it could leave the entry file | 155–161 | 158–159 | js/ui/driving-line-opts.js:10 | Controlled fixture values/calls; limits above. |
| braking cues share one Driving fold and distinguish steering from the visual line | 164–182 | 168, 169, 171, 172, 173, 174, 175, 176, 179, 180, 181 | js/ui/driving-line-opts.js:10 | no duplicate control. Source/text contract; pattern scope only. |

## tests/unit/driving-line-pace.test.mjs

- Full read: 1–44; SHA-256: `5ee223fb1a3916c22fba2bda592d76fc2d396c0d50d1c58d83d7189f922d8b06`.
- Production: js/game.js (drivingLineApi/render); js/render/shared/driving-line.js.
- Fixtures and setup: Real game VM intercepts DrivingLine.draw before assignment, captures accel/vTop at PACE 1.34 on Monza with car meshes disabled.
- Limits: Checks runtime API values and render call delivery; does not assert profile accuracy across all pace settings.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| the driving-line api carries aTop(), not the bare ACCEL, at PACE 1.34 | 21–44 | 34, 37, 39, 40, 41, 42 | js/game.js (drivingLineApi/render) | render() drew the driving line; aTop() is the pace-scaled ACCEL. Controlled fixture values/calls; limits above. |

## tests/unit/driving-line.test.mjs

- Full read: 1–315; SHA-256: `0ff012c64d4f04b1bd5b37a081a8a5dbd0727be1780c6575dabecaab236c30eb`.
- Production: js/render/shared/driving-line.js:48; js/track/core/mesh.js (bank convention).
- Fixtures and setup: Pure VM stadium: 600m straights, R60 semicircles, hw7; typed vertex/profile arrays and spy backend. Synthetic baked line and alternating banking exercise interpolation.
- Limits: Geometry/numerical and backend-call contracts; no GL shader/pixel result. Missing-pass comment is historical, not evidence about current backend capability.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| the strip is the backends' layout: stride 7, two vertices per sample, closed, along runs 0 → L | 53–67 | 57, 58, 59, 61, 63, 64, 66, 66 | js/render/shared/driving-line.js:48 | Controlled fixture values/calls; limits above. |
| through a left-hander the line sits INSIDE (−x of the centreline) and on a straight it is centred | 69–88 | 81, 87 | js/render/shared/driving-line.js:48 | Controlled fixture values/calls; limits above. |
| the speed profile brakes BEFORE the corner: the cap is reached at entry, not after | 90–107 | 96, 99, 103, 106 | js/render/shared/driving-line.js:48 | Controlled fixture values/calls; limits above. |
| CORNERS mode: lit through the turn and its exit, dark mid-straight, and never a cut | 109–127 | 113, 114, 116, 119, 125 | js/render/shared/driving-line.js:48 | mid-corner is a corner; mid-straight is not. Controlled fixture values/calls; limits above. |
| draw() honours the mode and reports a backend without the pass | 129–152 | 135, 137, 138, 139, 140, 141, 143, 146, 148, 149, 150, 151 | js/render/shared/driving-line.js:48 | the strip is uploaded once per circuit; no member at all is 'no pass' too. Controlled fixture values/calls; limits above. |
| LINE COLOUR is a palette flag the draw carries, not a colour the module knows | 154–169 | 161, 163, 166, 168 | js/render/shared/driving-line.js:48 | draw() passes palette 0 for F1 and 1 for the safe triple. Controlled fixture values/calls; limits above. |
| LINE OPACITY is a multiplier the draw carries, and an unknown value is NORMAL | 171–192 | 179, 180, 182, 184, 186, 188, 191 | js/render/shared/driving-line.js:48 | an unknown value falls back to the shipped look. Controlled fixture values/calls; limits above. |
| the BRAKING CUE is the ribbon's own colour ramp as a number, and silent on the line's pace | 194–229 | 198, 208, 209, 213, 214, 216, 221, 227, 228 | js/render/shared/driving-line.js:48 | just under the line is still silent; past 1.16 it is pinned at full. Controlled fixture values/calls; limits above. |
| the BRAKING CUE still works with the line hidden: cue() builds the profile draw() never did | 231–253 | 238, 239, 242, 243, 244, 249, 252 | js/render/shared/driving-line.js:48 | OFF still draws and builds nothing for the ribbon; the cue has a profile to be over. Controlled fixture values/calls; limits above. |
| with a baked racing line the ribbon follows IT, easing to the centre where the line has no opinion | 255–277 | 274, 275, 276 | js/render/shared/driving-line.js:48 | Controlled fixture values/calls; limits above. |
| on banking the ribbon rides the road's own node-to-node LERP, LIFT above it — never the nearest node | 279–315 | 310, 311, 314 | js/render/shared/driving-line.js:48 | Controlled fixture values/calls; limits above. |

## tests/unit/droplets-spray.test.mjs

- Full read: 1–242; SHA-256: `f3fe4066d70e097927f59e6a572a51e1f5fc4e4afceb0325d16da74f89c7f80a`.
- Production: js/fx/droplets.js:16; js/fx/particles.js:8; game source through tests/helpers/game-source.mjs.
- Fixtures and setup: Seeded RNG, canvas/DOM spies at 844×390/DPR3, helmet/mobile/quality options, fake particle backend. Spray uses 150 shuffled candidate sets per tier including Float32, zero and Infinity boundaries.
- Limits: Effect gates/counts/scaling/geometry calls, not pixels. Static game-source matching checks wiring only; browser shot still needed for appearance.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| droplets: spawn rate follows rain — none below falling rain, storm heavier | 58–66 | 60, 61, 63, 64, 65 | js/fx/droplets.js:16 | drizzle tier wets the road, not the lens; reduced motion spawns fewer. Controlled fixture values/calls; limits above. |
| droplets: onboard-only — any other camera hides the overlay and drops every drop | 68–78 | 71, 72, 74, 75, 77 | js/fx/droplets.js:16 | onboard in rain gathers drops; overlay shown onboard. Controlled fixture values/calls; limits above. |
| droplets: capped — ≤ 40 on phones, ≤ 90 desktop, half under reduced motion | 80–89 | 85, 86, 87 | js/fx/droplets.js:16 | Controlled fixture values/calls; limits above. |
| droplets: blown off at speed — fewer live drops at 80 m/s than parked | 91–97 | 95, 96 | js/fx/droplets.js:16 | moving drops are drawn as rotated streaks. Controlled fixture values/calls; limits above. |
| droplets: reduced motion — drops never move or streak | 99–104 | 102, 103 | js/fx/droplets.js:16 | still shows water on the lens; no streaks under reduced motion. Controlled fixture values/calls; limits above. |
| droplets: GRAPHICS LOW is off; pause freezes; a missing static element is built after #game | 106–122 | 109, 110, 116, 117, 121 | js/fx/droplets.js:16 | LOW: overlay hidden; paused (dt 0): the glass is frozen. Controlled fixture values/calls; limits above. |
| droplets: DPR capped (phones 1, desktop 1.5) and the canvas tracks the viewport | 124–131 | 127, 130 | js/fx/droplets.js:16 | phone: DPR 1 at 844×390; desktop: DPR capped at 1.5. Controlled fixture values/calls; limits above. |
| helmet rain: amount scales accumulation and OFF clears only the optional shield | 133–141 | 136, 138, 140 | js/fx/droplets.js:16 | other onboard cameras retain their rain. Controlled fixture values/calls; limits above. |
| helmet rain: a stopped shower drains gradually; runoff controls retention | 143–152 | 147, 149, 151, 151 | js/fx/droplets.js:16 | ending rain does not erase collected water; fast runoff clears sooner. Controlled fixture values/calls; limits above. |
| helmet rain: stopped water falls vertically; speed bends it into sideways streaks | 154–172 | 159, 161, 161, 163, 164, 171, 171, 171 | js/fx/droplets.js:16 | lateral airflow increases with speed; fast streaks are predominantly sideways. Controlled fixture values/calls; limits above. |
| spray: strength scales with speed, wetness and the storm tier | 188–195 | 190, 191, 192, 193, 194 | js/fx/particles.js | below ~21 % of the envelope: none; storm ×1.35 (Storm.sprayK). Controlled fixture values/calls; limits above. |
| spray: never takes the pool's last quarter, and leaves mist hanging past the old 1.9 s plume | 197–203 | 200, 202 | js/fx/particles.js | mist clouds (3-4.5 s) still hang in the air. Controlled fixture values/calls; limits above. |
| spray: only the nearest N cars emit (desktop 6, phone 3) | 205–216 | 208, 213, 214 | js/fx/particles.js | Controlled fixture values/calls; limits above. |
| spray: shuffled Float32 distances preserve the capped nearest-N threshold and hysteresis | 218–235 | 232 | js/fx/particles.js | Controlled fixture values/calls; limits above. |
| game.js wires the nearest-N gate, sprayStr/sprayRate and the Droplets tick | 237–242 | 239, 240, 241 | js/game.js through tests/helpers/game-source.mjs | Source/text contract; pattern scope only. |

## tests/unit/duel-row.test.mjs

- Full read: 1–161; SHA-256: `99e5062c59dda4273d779224e3c5c13c0d7b7950639688ae909fda0f429f232c`.
- Production: js/race/race-settings.js:5; js/data/legends.js; index.html.
- Fixtures and setup: Pure VM with/without Legends plus real createGame sheet buttons; real handler chooses every option. HTML/source scans cover dialog/copy/preset behavior.
- Limits: DOM-stub state and pure values, not browser modal focus or listbox keyboard interaction. Stale legend remains its stored id while enabled.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| the row still offers OFF and ON, in that order, before any legend | 51–55 | 53, 54 | js/race/race-settings.js:5 | Controlled fixture values/calls; limits above. |
| every legend reaches the row, labelled by name | 57–65 | 61, 62, 64 | js/race/race-settings.js:5 | Controlled fixture values/calls; limits above. |
| no legend id can shadow OFF or ON | 67–69 | 68 | js/race/race-settings.js:5 | Controlled fixture values/calls; limits above. |
| picking a value in the real sheet paints that same value back | 71–80 | 76, 77 | js/race/race-settings.js:5 | Actual sheet handler round-trip in game VM; browser interactions unverified. |
| OFF and ON clear the legend; a legend turns the duel on (the real handler) | 82–91 | 85, 86, 87–88, 89 | js/race/race-settings.js:5 | a legend must set BOTH cells — duelMode gates the trim, duelLegend picks the driver; and OFF takes the legend back out. Actual sheet handler round-trip in game VM; browser interactions unverified. |
| without the roster the row degrades to the OFF/ON it always was | 93–97 | 94, 95, 96 | js/race/race-settings.js:5 | Controlled fixture values/calls; limits above. |
| a stale legend left in the store still reads as ON, never as OFF | 99–104 | 102, 103 | js/race/race-settings.js:5 | no getter at all is the plain duel. Controlled fixture values/calls; limits above. |
| the duel control opens a rival sheet instead of a mega select | 106–111 | 107, 108, 109, 110 | js/race/race-settings.js:5 | Source/text contract; pattern scope only. |
| the rival sheet shows the whole roster, with nothing to type into | 118–128 | 119, 120, 121, 124, 125, 126, 127 | js/race/race-settings.js:5 | the search field is gone; …and so is the no-matches line it fed. Source/text contract; pattern scope only. |
| race presets are complete, distinct settings bundles | 130–147 | 134–137, 138, 139, 140, 141, 142, 143, 144, 145, 146 | js/race/race-settings.js:5 | presets leave the sticky caution preference unchanged. Controlled fixture values/calls; limits above. |
| preset matching does not read the sticky caution preference | 149–155 | 152, 153–154 | js/race/race-settings.js:5 | currentPresetValues exists; preset matching must not reclaim ownership of caution. Source/text contract; pattern scope only. |
| championship race settings hide Duel help with the absent Duel row | 157–161 | 159–160 | js/race/race-settings.js:5 | career/season GRID=QUALIFYING must not leave standalone Duel copy visible. Source/text contract; pattern scope only. |

## tests/unit/duel.test.mjs

- Full read: 1–183; SHA-256: `25f95b9030a08bb5a8b0645390d1bbc51f79c5e16741a3f52f2b3ddb0b61eb0a`.
- Production: js/race/duel.js:12; js/data/legends.js; js/data/driver-ratings.js.
- Fixtures and setup: Real Duel/Legends with simple DriverRatings stub for isolated axis transfer; one real DriverRatings check for hard-difficulty speed product. Snapshot expected ratings prevents mutation masking.
- Limits: Data transformation and multiplication; no race outcome or fairness/playability proof.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| pick() takes the fastest non-player car | 34–38 | 36, 37 | js/race/duel.js:12 | Controlled fixture values/calls; limits above. |
| the bump lifts racecraft harder than pace, and leaves awareness alone | 40–60 | 44, 45, 54, 56, 57, 58, 59 | js/race/duel.js:12 | …and so must the other two; bumping awareness makes the rival concede sooner, not drive better. Controlled fixture values/calls; limits above. |
| asLegend takes the legend's own ratings and lifts them with LEGEND_BUMP | 62–87 | 71, 72, 73, 74, 77, 78, 79, 80, 81, 85 | js/race/duel.js:12 | Controlled fixture values/calls; limits above. |
| the legend lift raises racecraft, never caution, and pace least of all | 93–100 | 95, 96, 97, 99 | js/race/duel.js:12 | lifting awareness buys a rival that yields quicker; a legend is at least as hard as a bumped midfielder. Controlled fixture values/calls; limits above. |
| a legend rival's car is lifted, and only his | 105–123 | 106, 109, 118–119, 122 | js/race/duel.js:12 | the lift must actually lift; tierV is scaled, not replaced. Controlled fixture values/calls; limits above. |
| asLegend degrades to the ordinary duel when the legend has no ratings | 125–130 | 127, 128, 129 | js/race/duel.js:12 | an unknown legend must not rename the rival. Controlled fixture values/calls; limits above. |
| every legend in the roster is duel-ready | 132–140 | 135, 137 | js/race/duel.js:12 | Controlled fixture values/calls; limits above. |
| asLegend hands the rival the legend's own team, paint and number | 145–156 | 149, 150, 151, 155 | js/race/duel.js:12 | the rival flies the legend's team object; …and the timing screen / minimap colour follows the paint. Controlled fixture values/calls; limits above. |
| a duel rival's team id is unique per legend and never the player's slot | 162–167 | 164, 165, 166 | js/data/legends.js (raceTeam/parts) | every legend needs its own cache key; …and none may collide with the player's legends slot. Controlled fixture values/calls; limits above. |
| every legend's duel car carries his period setup and his own paint | 172–183 | 178, 179, 180, 181 | js/data/legends.js (raceTeam/parts) | Controlled fixture values/calls; limits above. |

## tests/unit/dup-keys.test.mjs

- Full read: 1–63; SHA-256: `90e852588d089547dfbee2c0a91ab9a0763a5e0d292632b348eb8cd4627e2e94`.
- Production: tools/check/dup-keys.mjs; tools/lib/changed-files.mjs; tools/ci/pick-tests.mjs.
- Fixtures and setup: Real git-tracked sources, merge-base/diff scope; in-memory duplicate-key source with fictional filename x.js is a fixture label. Full fallback for missing merge-base/no diff or APEX_DUPKEYS_FULL=1.
- Limits: AST lint coverage is limited to selected existing tracked source files; scope selection branches are not individually unit exercised here.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| the scanner still sees a duplicate (anti-vacuity) | 49–53 | 51, 52 | tools/check/dup-keys.mjs | premise: git ls-files must list the tree's sources. Controlled fixture values/calls; limits above. |
| no tracked js/tools/tests source this change touches declares the same object key twice | 55–63 | 62 | tools/check/dup-keys.mjs | Controlled fixture values/calls; limits above. |

## tests/unit/editor-workspace.test.mjs

- Full read: 1–150; SHA-256: `7d84919d6ae55cfb6645da46d04182ae000ad206ff8bcee459f5be33fe5a84cd`.
- Production: js/ui/editor-workspace.js:2.
- Fixtures and setup: mini-dom with ownerDocument/reparenting fixes, manual media and MutationObserver callbacks, Settings launcher/nav and optional nested Free Camera/rail/actions.
- Limits: State/DOM furniture and focus target checks; no CSS fit, native observer ordering or actual browser keyboard proof.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| preview furniture changes without closing the editor or taking over Escape | 43–53 | 46, 48, 49, 50, 52 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| reopening restores controls and mounting is idempotent | 55–63 | 58, 59, 60, 62 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| short screens collapse tools without dropping them; wide screens expand them | 65–75 | 68, 69, 70, 72, 74 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| closing restores the captured Settings page after domain cleanup | 77–84 | 82, 83 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| resume and non-Settings entries do not force navigation | 86–95 | 91, 94 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| nested Free Camera returns to the original Settings page | 98–107 | 103, 106 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| abandoning Free Camera clears the suspended Settings origin | 109–118 | 117 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| missing DOM ownership is a no-op for shallow boot hosts | 120–124 | 122, 123 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| secondary editor actions keep their handlers inside tools while Done stays reachable | 127–137 | 130, 131, 132, 133, 136 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |
| Free Camera stays on the toolbar when compact tools collapse | 140–150 | 144, 145, 146, 149 | js/ui/editor-workspace.js:2 | Controlled fixture values/calls; limits above. |

## tests/unit/elev-presets.test.mjs

- Full read: 1–98; SHA-256: `b005c5cbb29f0017a6f192ac16f0f3faf902444f4810c6f07e1fbd0c40d017ca`.
- Production: js/editor/elev-presets.js:6.
- Fixtures and setup: Pure VM, deterministic oval control points; missing/short heights, lattice rounding, seed repetition, 24-seed average and 40 seeds × 3 lengths × 2 styles.
- Limits: Node heights and individual planned cosine bump slope caps; does not prove combined bumps or final interpolated track grade never exceeds that cap.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| sanitize: missing heights → flat zeros; clamps to ±60 on the 0.25 m lattice | 28–42 | 31, 32, 34, 36, 38, 39, 40, 41 | js/editor/elev-presets.js:6 | 0.12 m is under half a lattice step: rounds to 0; -0.13 m rounds to the nearest quarter metre, not toward 0. Controlled fixture values/calls; limits above. |
| Flat / Rolling / Hilly presets write node heights; deterministic; undo-shaped replace | 44–75 | 48, 49, 50, 53, 54, 55, 56, 57, 60, 63, 70, 74 | js/editor/elev-presets.js:6 | rolling moves some nodes; start pinned flat for a closed loop. Controlled fixture values/calls; limits above. |
| unknown style → flat; short pts → flat | 77–81 | 79, 80 | js/editor/elev-presets.js:6 | Controlled fixture values/calls; limits above. |
| every planned bump respects the ~8 % grade cap (\|rise\| <= halfM / 19.6) for any seed and lap length | 83–98 | 89, 91, 93 | js/editor/elev-presets.js:6 | Controlled fixture values/calls; limits above. |

## tests/unit/elevation-smoothness.test.mjs

- Full read: 1–134; SHA-256: `878ab7334c487748ea91afb45cfa53a9435af31c6706c242d4e0e2696687d63c`.
- Production: js/track/tracks.js:3; js/track/circuit-elevations.js; tools/manifest.cjs TRACK_VM; js/circuits/.
- Fixtures and setup: Manifest track VM, fake mesh allocator, real baked profiles; undulate:false isolates survey height remap; bridge ramps excluded. Cota 8% override, others 5.5%, plus 0.5pp interpolation allowance.
- Limits: Densified geometry only; no car dynamics. Generated per-profile case additionally checks Cota T1 relief and Nürburgring relief/window jerk.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| ${id}: densified grade ≤ bake cap (+CR slop) | 89–132 | 91, 104–105, 111, 115, 127–128, 129–130 | js/track/tracks.js:3 | Controlled fixture values/calls; limits above. |

Generated profile names come from Object.keys(CircuitElevations), not all roster circuits. At 88–132 every loaded profile asserts a real definition and bridge-excluded grade bound; Cota also requires early crest–low >=25m; Nürburgring also requires relief >=45m, local grade <=6% and jerk <=3/km in s=.77–.80. No assertion ensures the profile key set is nonempty here.

## tests/unit/elevation-tracks-vm.test.mjs

- Full read: 1–263; SHA-256: `335c494a479b25472ff53f248d28c7adf9a050306d192bcdf5ee9489c7b6c1ef`.
- Production: js/track/tracks.js:3; js/camera/vantage.js; js/physics/player-forces.js; js/agent/apex.js.
- Fixtures and setup: Real game VM and optional pool; tests/helpers/elevation-probes.cjs fully read 1–164 (INIT, GRADIENT, BANKED). Forty grade circuits and two bank circuits; APEX_CIRCUITS and APEX_CIRCUIT_SHARD narrow generated registration.
- Limits: Numerical VM hooks, no rendered banking/camera sign-off. roadFollow=.6 is intentionally enabled in road-holding recipes. Helpers gt/lt/gte/closeTo assert at 47–50; startRace relief premise at 144.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| banking pivots around the centreline with smooth edge transitions | 147–170 | 166 (helper), 167 (helper), 168 (helper) | js/track/tracks.js:3 | Game VM numeric/call evidence; no browser/audio output. |
| Zandvoort banking peaks at Hugenholtz and Arie Luyendyk | 172–186 | 183 (helper), 184 (helper), 185 (helper) | js/track/tracks.js:3 | Game VM numeric/call evidence; no browser/audio output. |
| Madrid converts La Monumental's 24 percent bank to degrees | 188–196 | 194 (helper), 195 (helper) | js/track/tracks.js:3 | Game VM numeric/call evidence; no browser/audio output. |
| bank roll matches the road surface slope | 198–208 | 207 (helper) | js/track/tracks.js:3 | Game VM numeric/call evidence; no browser/audio output. |
| chase camera follows the road bank instead of showing a sideways wall | 210–232 | 227 (helper), 228 (helper), 229 (helper), 230, 231 (helper) | js/track/tracks.js:3 | Game VM numeric/call evidence; no browser/audio output. |
| ${id}: slope gravity behaves + road-following holds on the grade | 238–251 | 240, 241, 242, 243 (helper), 244 (helper), 245–246 (helper), 247 (helper), 248 (helper), 249 (helper), 250 (helper) | js/track/tracks.js:3 | Game VM numeric/call evidence; no browser/audio output. |
| ${id}: banked corner is drivable and stays on the road | 255–262 | 257, 258, 259, 260, 261 (helper) | js/track/tracks.js:3 | Game VM numeric/call evidence; no browser/audio output. |

Generated grade names at 237–250 expand over abudhabi, albert_park, bahrain, baku, cota, hungaroring, imola, interlagos, jeddah, madrid, mexico, miami, monaco, montreal, monza, qatar, redbull, shanghai, silverstone, singapore, spa, suzuka, vegas, zandvoort, hockenheim, nurburgring, catalunya, sepang, istanbul, paul_ricard, portimao, sochi, mugello, magny_cours, estoril, kyalami, watkins_glen, indianapolis, buenos_aires and jacarepagua. Each asserts actual relief, no errors, finite state, both slope signs, >30 usable reference steps, flat speed >=40m/s, descent <1.35× flat maximum, climb end >5m/s and widest <last sampled hw+8m. Banking names 254–262 expand zandvoort/madrid and assert relief, no errors, finite/progressed state and widest<hw. The fixed five cases always register; scope/shard filters can reduce the 42 generated cases.

## tests/unit/end-race-music-vm.test.mjs

- Full read: 1–92; SHA-256: `072b1de1110e151258810bdb070733614854da5de4d06e2ad8d4ca445f37f469`.
- Production: js/game.js (endRace/quitToMenu); js/ui/results-sheet.js; js/audio/engine.js.
- Fixtures and setup: Real game VM with fake-audio-vm installer, pointerdown lazy-audio unlock, spies call through to real GameAudio; one-lap Monza, synthetic season finale.
- Limits: Call ordering/counts and source wiring, not audible output or OS playback.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| endRace stops race music and plays the finish fanfare once | 43–56 | 48, 50, 51, 54 | js/game.js (endRace/quitToMenu) | endRace must stop the race soundtrack; exactly one finish fanfare per race end. Game VM numeric/call evidence; no browser/audio output. |
| season finale champion sheet does not trigger a second finish fanfare | 58–69 | 63, 66–67 | js/ui/results-sheet.js (buildChampion) | buildChampion must not call finish again. Game VM numeric/call evidence; no browser/audio output. |
| quitToMenu from results restarts menu music | 71–81 | 77, 79 | js/game.js (endRace/quitToMenu) | returning to MAIN MENU must start menu music (startMusic(-1)). Game VM numeric/call evidence; no browser/audio output. |
| source: endRace stops music; buildChampion does not re-finish | 83–92 | 86–87, 88–89, 90–91 | js/game.js (endRace/quitToMenu) | endRace stops the race loop with the other race SFX; endRace still owns the single finish fanfare. Source/text contract; pattern scope only. |

## tests/unit/engine-note-quality.test.mjs

- Full read: 1–183; SHA-256: `bc92174f4a0eb059d8711808b001d02d09da19c0bbf424ac87499eceb8775bb2`.
- Production: js/audio/engine.js:1658; js/audio/tone-model.js; js/audio/signal.js; js/audio/soundtrack.js; js/audio/radio-fx.js.
- Fixtures and setup: Handmade AudioContext/AudioParam graph with counted methods/live nodes; held fetch releases synthetic sine buffer; sampleEngine premise assertion at 98.
- Limits: Scheduling calls/control values/node allocation only, not decoded real sample quality or acoustics. Idle-source selector is a harness assumption.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| pitch is monotonic with RPM on the sample core | 107–116 | 113 | js/audio/engine.js:1658 | Controlled fixture values/calls; limits above. |
| a steady rev climb smooths via setTargetAtTime, not per-frame setValue snaps | 118–133 | 121, 130, 131, 132 | js/audio/engine.js:1658 | precondition: idle BufferSource; steady climb must not setValueAtTime the rate. Controlled fixture values/calls; limits above. |
| overrun (lift) timbre is darker than on-throttle at the same rev | 135–150 | 144, 145, 148 | js/audio/engine.js:1658 | overrun layer off restores the brighter closed-throttle colour. Controlled fixture values/calls; limits above. |
| an upshift dips the engine then recovers; the rev limiter chops at redline | 152–168 | 159, 161, 162, 165, 167 | js/audio/engine.js:1658 | duck recovers after ~0.12 s tau; recovered level returns near the pre-shift base. Controlled fixture values/calls; limits above. |
| setEngine allocates zero nodes on a steady per-frame update | 170–183 | 182 | js/audio/engine.js:1658 | Controlled fixture values/calls; limits above. |

## tests/unit/engine-revs-replay-vm.test.mjs

- Full read: 1–107; SHA-256: `100f53396afab69cc44b86251cd9e054554f2fb2b3d8dd257df646242dfd05a5`.
- Production: js/race/real-replay.js:260; js/data/real-race-tab.js; js/audio/engine.js; js/physics/consts.js.
- Fixtures and setup: Real game VM plus fake audio, checked-in OpenF1 Baku 2026 race fixture; synthetic half-second track-frame traces for RUS/LEC at 50 or 22m/s; 1× and 4× transports.
- Limits: Replay ownership/speed/RPM and active voice frequency; no external API call or audible playback.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| WATCH followed car and rivals rev with speed, not idle rpm | 30–63 | 56, 57, 58, 59, 61 | js/race/real-replay.js:260 | followed car must be at race speed; followed car rpm must track speed. Game VM numeric/call evidence; no browser/audio output. |
| WATCH transport speed scales the rpm, never the car's speed (camera readers see the trace's m/s) | 89–107 | 97, 99, 101, 102 | js/race/real-replay.js:260 | 1x fed speed stays the trace pace; redline cap still bounds extreme effective speeds. Game VM numeric/call evidence; no browser/audio output. |

Additional assertion limits observed during the full read:

- Drift stability uses finite lateral position, peak slip <45° and |x|<60m over 27 frames; it does not directly assert a spin count. The 400-frame abuse case also checks s/x finiteness and VM error records.
- Coach lap-copy case title mentions needing a reference, but its body checks pre-lap explanatory copy, slower-lap display, defensive copying and reset; it does not remove Ghost or assert the missing-reference branch directly.
- Duel stale-legend case preserves the stored unknown id (`nobody`), rather than normalizing it to the literal `on`; the enabled state prevents an OFF representation.
- Editor media tests manually invoke recorded callbacks. Reparenting keeps handler identity; no real layout measurement occurs.
- Elevation probe `hw` is the most recently sampled corner width, while `widest` accumulates over corners; the bound is a coarse gate, not a per-sample corridor guarantee.
- The docs circuit-count scan allows no current claims; scenery/member, suite/spec and matTex scans use explicit floors where stated. Superseded-by verifies the replacement has a Supersedes line, but that reverse branch does not compare its linked filename to the old note. Link scans omit anchors and URLs.
- Shared `figureEqual` assertion is at docs-integrity 43, reached by helper spans in suite-count checks; its advisory branch warns and returns. Fake fixture filenames named in exemptions remain input strings, never claims that those files exist.

Total syntactic case registrations: 199. Loop expansion is described at its owning file; this count is not a runtime test verdict.
