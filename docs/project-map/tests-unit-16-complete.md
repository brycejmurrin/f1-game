# Unit group 16 — complete source map

Read-only semantic inventory, 2026-10-27. All 21 manifest files, 4,944 lines, read in full using bounded chunks (oversized initial reads were repeated in smaller chunks). No tests or browser were run. Ranges are one-based inclusive; SHA-256 identifies the read snapshot. Case rows describe declarations; loops expand as noted, and assertions nested in loops run per input. `assertionSpans` includes complete assertion-call ranges, not a predicate dump. File-level fixture and limitation notes apply to every row.

LSP evidence: shell fallback `bash tools/mcp/lsp-mcp.sh def RaceEngineer.create --body --maxLines=35` resolved definition at engineer.js:78 and export at :535. Bounded outlines confirmed ErsLayer (:8; update :190), ExtraRigs (:2; pickRival :43, solve :237, tickPitAuto :262), FieldLod (:17; tier :75, farBody :88), Flags (:10; code :178, svg :185), LiveryTex (:2; markPalette :675), Car3D (:3; build :237). These are navigation evidence, not runtime verification.

## tests/unit/engineer.test.mjs

Read range: 1-733; SHA-256: `3d9347017f84478394f4041fd58f2540915b2ed00cdd512b71b229fed58fbe4f`.

Production target: RaceEngineer.create / senseOf / callFor / update — js/race/engineer.js:78-535.

Fixtures / limits: Real TyreModel with synthetic G, warm three-lap-old sets, recording announce acceptance; line() bypasses sensing. Proves priority, wording, suppression, staleness and timers for supplied states; no banner/audio delivery or race strategy quality.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| nothing the engineer says arms a stop or touches the car's pit state | 87-95 | 91-94 | nothing the engineer says arms a stop or touches the car's pit state.  Observes c.pitArmed, c.pitState, c.pitNext. Target: file target above; limited to supplied fixtures. |
| it speaks to the LOCAL player and to nobody else | 97-102 | 101 | it speaks to the LOCAL player and to nobody else.  Observes said.length. Target: file target above; limited to supplied fixtures. |
| one voice: while the pit cue gives a DIRECTION the engineer waits, and the line it owes is not spent | 104-122 | 112, 115-116, 120-121 | one voice: while the pit cue gives a DIRECTION the engineer waits, and the line it owes is not spent.  Observes said.length, said[0], ["enter", "keep", "square", "stop", "merge"].includes, E.DIRECTIONAL.includes. Target: file target above; limited to supplied fixtures. |
| OFF: the engineer is silent, because there is nothing to be legible about | 124-130 | 129 | OFF: the engineer is silent, because there is nothing to be legible about.  Observes said.length. Target: file target above; limited to supplied fixtures. |
| the wrong tread outranks everything — it is the one that costs whole seconds | 142-145 | 143-144 | the wrong tread outranks everything — it is the one that costs whole seconds.  Target: file target above; limited to supplied fixtures. |
| a LOCAL SHOWER names its sector, and says whether the lap as a whole wants rubber for it (js/race/rain-cells.js) | 147-152 | 148-151 | a LOCAL SHOWER names its sector, and says whether the lap as a whole wants rubber for it.  Observes E.create({}).callFor(sense({ rainWhere: "1", rainInLaps: 2 }))[1]. Target: file target above; limited to supplied fixtures. |
| a strong GUST is a word below every pit line, said once per gusty spell | 154-159 | 155-158 | a strong GUST is a word below every pit line, said once per gusty spell.  Observes E.create({}).callFor(sense({ gust: 7, gustKmh: 46 }))[1]. Target: file target above; limited to supplied fixtures. |
| gust advice follows real speed preferences while retaining canonical wind and once-per-gust ownership | 161-191 | 170-172, 179, 183, 186, 189-190 | gust advice follows real speed preferences while retaining canonical wind and once-per-gust ownership.  Observes snapshot.gustKmh, session.said.at, session.said.length, eng.senseOf(car).gustKmh. Target: file target above; limited to supplied fixtures. |
| ONE COMPOUND with five laps left is called after the tread and before everything else (FIA 2026 SR B6.3.6) | 193-197 | 194-196 | ONE COMPOUND with five laps left is called after the tread and before everything else.  Observes E.create({}).callFor(sense({ oneCompound: true }))[1]. Target: file target above; limited to supplied fixtures. |
| a reduced-cost stop under caution outranks tyre complaints without promising a free stop | 199-201 | 200 | a reduced-cost stop under caution outranks tyre complaints without promising a free stop.  Target: file target above; limited to supplied fixtures. |
| graining and blistering say DIFFERENT things, and that is the point | 203-213 | 207-209, 212 | Graining advises easing off, blistering reports a finished set; blistering wins when both are present.  Target: file target above; limited to supplied fixtures. |
| the axle call names an END of the car and what to do about it | 215-220 | 216-217, 219 | Front imbalance requests earlier braking, rear imbalance asks for throttle care; sub-threshold split stays silent.  Target: file target above; limited to supplied fixtures. |
| the axle call is reachable on a real stint: it reads the WEAR split, not the grip ratio | 222-238 | 230-231, 234, 237 | the axle call is reachable on a real stint: it reads the WEAR split, not the grip ratio.  Observes s.front, eng.senseOf(early).axle. Target: file target above; limited to supplied fixtures. |
| a defect outranks the axle call — 'brake earlier' is the wrong answer to graining | 240-242 | 241 | a defect outranks the axle call — 'brake earlier' is the wrong answer to graining.  Target: file target above; limited to supplied fixtures. |
| cold tyres are called on the out-lap and never after it | 244-247 | 245-246 | cold tyres are called on the out-lap and never after it.  Target: file target above; limited to supplied fixtures. |
| cold advice keeps rounded thresholds without constructing tyre telemetry | 249-264 | 258, 260, 263 | cold advice keeps rounded thresholds without constructing tyre telemetry.  Observes eng.senseOf(c).belowWindow. Target: file target above; limited to supplied fixtures. |
| rain is called in LAPS, singular and plural, because a driver counts laps | 266-269 | 267-268 | rain is called in LAPS, singular and plural, because a driver counts laps.  Target: file target above; limited to supplied fixtures. |
| the wear ladder counts DOWN — a driver wants life left, not life spent | 271-276 | 272-275 | the wear ladder counts DOWN — a driver wants life left, not life spent.  Target: file target above; limited to supplied fixtures. |
| a clean, fresh set gets no radio at all | 278-280 | 279 | a clean, fresh set gets no radio at all.  Target: file target above; limited to supplied fixtures. |
| one line at a time: a second call inside the quiet window is swallowed | 284-291 | 288, 290 | one line at a time: a second call inside the quiet window is swallowed.  Observes said.length. Target: file target above; limited to supplied fixtures. |
| the same line does not repeat, even long after the quiet window | 293-299 | 298 | the same line does not repeat, even long after the quiet window.  Observes new Set(gone).size. Target: file target above; limited to supplied fixtures. |
| a wear step is only SPENT when it is actually said | 301-314 | 310, 313 | a wear step is only SPENT when it is actually said.  Observes said.length. Target: file target above; limited to supplied fixtures. |
| a line the BANNER drops is not spent either — a cinematic camera must not end the radio | 316-335 | 327, 331, 334 | a line the BANNER drops is not spent either — a cinematic camera must not end the radio.  Observes said.length. Target: file target above; limited to supplied fixtures. |
| a NEW SET restarts the ladder, worked out from the stint counter alone | 337-349 | 342, 348 | a NEW SET restarts the ladder, worked out from the stint counter alone.  Target: file target above; limited to supplied fixtures. |
| the plan lines sit between the tread and the tyre complaints, and each names a lap or a compound | 353-371 | 355-358, 360, 362-363, 365-368, 370 | the plan lines sit between the tread and the tyre complaints, and each names a lap or a compound.  Observes /FREE STOP\|LOSES NOTHING/.test. Target: file target above; limited to supplied fixtures. |
| senseOf reads the plan and the field: the next stop lap, its compound, and a rival's undercut | 373-403 | 382-383, 385, 387, 390, 392, 394-395, 398, 400, 402 | senseOf reads the plan and the field: the next stop lap, its compound, and a rival's undercut.  Observes s.lapsToStop, s.nextCode, eng.senseOf(c).nextCode, s.rivalBoxed. Target: file target above; limited to supplied fixtures. |
| the PIT CALL rides its own priority; every other line still yields | 405-430 | 415, 425, 427, 429 | the PIT CALL rides its own priority; every other line still yields.  Observes Array.prototype.join.call. Target: file target above; limited to supplied fixtures. |
| the last lap (and a one-lap qualifying run) gets no call to stop: the flag is closer than the box | 432-447 | 440-442, 444, 446 | the last lap (and a one-lap qualifying run) gets no call to stop: the flag is closer than the box.  Observes s.wrongTread, s.cheapStop, s.lapsToStop, eng.senseOf(c).wrongTread. Target: file target above; limited to supplied fixtures. |
| paused (a VS FRIEND race keeps running under the menu), the engineer holds its lines | 449-458 | 454, 457 | paused (a VS FRIEND race keeps running under the menu), the engineer holds its lines.  Observes said.some. Target: file target above; limited to supplied fixtures. |
| a lapped car's last lap starts when the leader takes the flag: no stop calls from then on | 460-469 | 464, 467-468 | a lapped car's last lap starts when the leader takes the flag: no stop calls from then on.  Observes eng.callFor(eng.senseOf(c))[1], s.finalLap. Target: file target above; limited to supplied fixtures. |
| no 'take a lap' for cold tyres on the only lap there is (qualifying, a one-lap race) | 471-478 | 476-477 | no 'take a lap' for cold tyres on the only lap there is.  Observes s.outLap, (eng.callFor(s) \|\| [])[1]. Target: file target above; limited to supplied fixtures. |
| our own stop answers a rival's latched undercut: no BOX NOW on the out-lap | 480-510 | 509 | our own stop answers a rival's latched undercut: no BOX NOW on the out-lap.  Target: file target above; limited to supplied fixtures. |
| no engineer call under the pause menu (VS FRIEND keeps ticking) | 512-515 | 514 | no engineer call under the pause menu.  Target: file target above; limited to supplied fixtures. |
| the undercut THREAT comes before the rival boxes, and the stop call says where it rejoins | 519-525 | 520, 522-524 | the undercut THREAT comes before the rival boxes, and the stop call says where it rejoins.  Target: file target above; limited to supplied fixtures. |
| pace calls: manage a set short of the flag, push one with laps to spare and a car to catch | 527-536 | 529-533, 535 | pace calls: manage a set short of the flag, push one with laps to spare and a car to catch.  Target: file target above; limited to supplied fixtures. |
| senseOf reads the cars around the player: the threat, the car ahead, and the rejoin | 538-558 | 549-551, 555, 557 | senseOf reads the cars around the player: the threat, the car ahead, and the rejoin.  Observes s.threat, s.ahead, s.rejoin, eng.senseOf(c).rejoin. Target: file target above; limited to supplied fixtures. |
| senseOf stays a fresh snapshot; update's scratch sense is the same state | 563-574 | 567-568, 571, 573 | senseOf stays a fresh snapshot; update's scratch sense is the same state.  Observes Object.keys(a).length, eng.update. Target: file target above; limited to supplied fixtures. |
| a steady state is said once; the same line returns only when what it reports changed | 580-605 | 587, 593, 600, 603-604 | a steady state is said once; the same line returns only when what it reports changed.  Observes rain().length, rain()[0]. Target: file target above; limited to supplied fixtures. |
| the cheap stop under caution is offered only when a stop is still due | 607-623 | 613-614, 617, 622 | the cheap stop under caution is offered only when a stop is still due.  Observes sa.cheapStop, short.eng.senseOf(a).cheapStop, long.eng.senseOf(b).cheapStop. Target: file target above; limited to supplied fixtures. |
| pits.estimate() is re-read on a 0.25 s clock, not every physics step (bug-hunt 7.11) | 625-636 | 631-632, 635 | pits.estimate() is re-read on a 0.25 s clock, not every physics step.  Target: file target above; limited to supplied fixtures. |
| a said top rung does not shadow the pit call below it (blisters, then BOX BOX BOX) | 643-654 | 649, 652-653 | a said top rung does not shadow the pit call below it.  Observes said.filter((m) => /BLISTERS/.test(m)).length, said.some. Target: file target above; limited to supplied fixtures. |
| a rain forecast already given does not block BOX BOX BOX on the stop lap | 656-663 | 661-662 | a rain forecast already given does not block BOX BOX BOX on the stop lap.  Observes said.some. Target: file target above; limited to supplied fixtures. |
| callFor still returns the single top line for a state | 665-670 | 668-669 | callFor still returns the single top line for a state.  Observes top[1], eng.callFor. Target: file target above; limited to supplied fixtures. |
| a BOX call is not held by the quiet timer; a report still is | 673-687 | 678, 682-683, 686 | a BOX call is not held by the quiet timer; a report still is.  Observes said.at, said.length. Target: file target above; limited to supplied fixtures. |
| queued BOX and rain calls carry a still() that goes false once the stop is armed | 690-706 | 698-700, 702-703, 705 | queued BOX and rain calls carry a still() that goes false once the stop is armed.  Target: file target above; limited to supplied fixtures. |
| BOX NEXT LAP is stale a lap later | 708-718 | 715, 717 | BOX NEXT LAP is stale a lap later.  Target: file target above; limited to supplied fixtures. |
| RAIN IN N LAPS counts to the first wet stage of the arc, not its end | 722-733 | 728, 732 | RAIN IN N LAPS counts to the first wet stage of the arc, not its end.  Observes s.said[0], w.eng.senseOf(d).rainInLaps. Target: file target above; limited to supplied fixtures. |

## tests/unit/environment-json.test.mjs

Read range: 1-321; SHA-256: `5e6b7490dfa755b2f93f0eb9dd85491a4dcc05dd5e04c1649f50bf3e7cf2a413`.

Production target: tools/env/install-browsers.sh; tools/env/cloud-agent-install.sh; .claude/hooks/session-start.sh; .cursor/environment.json; .mcp.json.

Fixtures / limits: Offline temporary dependency trees and command stubs preserve npm dependency parsing; prefix check uses host PATH/link manipulation. Config/source-shape assertions do not establish MCP attachment, network installs or browser operation.

Expansion: defect template declares three cases (missing, hollow, incompatible); recovery loops exits 0/1 in one case.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| browser bootstrap reuses a complete dependency tree without installing or launching Chromium | 67-73 | 70-72 | browser bootstrap reuses a complete dependency tree without installing or launching Chromium.  Observes r.status, r.stdout.includes, f.installs. Target: file target above; limited to supplied fixtures. |
| `browser bootstrap rejects ${defect} tooling outside the three browser sentinels` | 76-88 | 83-87 | `browser bootstrap rejects ${defect} tooling outside the three browser sentinels`.  Observes r.status, r.stderr.includes, f.installs, r.stdout. Target: file target above; limited to supplied fixtures. |
| browser bootstrap validates recovery, including npm reporting failure after repairing packages | 91-101 | 96-99 | browser bootstrap validates recovery, including npm reporting failure after repairing packages.  Observes r.status, r.stdout.includes. Target: file target above; limited to supplied fixtures. |
| cloud bootstrap cannot accept partial dependencies through its browser fallback | 103-114 | 108-109, 112-113 | cloud bootstrap cannot accept partial dependencies through its browser fallback.  Observes r.status, r.stdout, r.stdout.includes. Target: file target above; limited to supplied fixtures. |
| cloud-agent-install cures npm prefix=/ before any npm use (D·W14a) | 118-136 | 125, 127, 129-130, 134-135 | cloud-agent-install cures npm prefix=/ before any npm use.  Observes src.includes. Target: file target above; limited to supplied fixtures. |
| cloud-agent-install --check-npm-prefix leaves npm prefix off / | 138-186 | 163, 165, 167-168, 173-175, 177-178 | cloud-agent-install --check-npm-prefix leaves npm prefix off /.  Observes r.status, after.status, after.stdout.trim, before.stdout.trim. Target: file target above; limited to supplied fixtures. |
| browser bootstrap plan does not install even with missing dependencies | 188-195 | 192-194 | browser bootstrap plan does not install even with missing dependencies.  Observes r.status, r.stdout.includes, f.installs. Target: file target above; limited to supplied fixtures. |
| .cursor/environment.json exists and bootstraps chrome MCP | 210-226 | 212-215, 218-225 | .cursor/environment.json exists and bootstraps chrome MCP.  Observes env.name, env.install, Object.hasOwn. Target: file target above; limited to supplied fixtures. |
| SessionStart reuses a discovered browser and routes missing-browser installs through shared bootstrap | 228-264 | 253-255, 257-259, 262-263 | SessionStart reuses a discovered browser and routes missing-browser installs through shared bootstrap.  Observes result.status, result.stdout, fs.existsSync, fs.readFileSync. Target: file target above; limited to supplied fixtures. |
| .cursor/environment.json allowlist covers every stdio MCP command in .mcp.json | 266-304 | 275-279, 282, 284-285, 288-291, 293, 298, 300-303 | .cursor/environment.json allowlist covers every stdio MCP command in .mcp.json.  Observes row.command.includes, row.command, new Set(patterns).size, allowByName.has. Target: file target above; limited to supplied fixtures. |
| .cursor/environment.json plugin allowlist admits browser-use debugging MCP | 306-321 | 309, 311-315, 317-319 | .cursor/environment.json plugin allowlist admits browser-use debugging MCP.  Observes plugins.length, row.command. Target: file target above; limited to supplied fixtures. |

## tests/unit/episode-transients.test.mjs

Read range: 1-101; SHA-256: `cb8dc10fb2c05db3702ced477fedfa750768e5ca5812b79abf3fc8b9952a2f28`.

Production target: tools/check/episode-diff.mjs; js/agent/apex.js reset / EPISODE_TRANSIENTS.

Fixtures / limits: Production game VM, seed 42, Monza/Singapore, three episodes of four seconds. Snapshot records primitive own fields and replaces nested objects with a stable tag; deep object mutation is outside the leak oracle. Planted leak is a positive scanner control; retirement test covers later race state. Does not exhaust seeds, tracks, long rollouts or browser lifecycle.

Expansion: track template declares Monza and Singapore cases; positive control and retirement cases are separate.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| `${track}: no per-car field survives reset() from one episode to the next` | 34-43 | 38-41 | `${track}: no per-car field survives reset() from one episode to the next`.  Target: file target above; limited to supplied fixtures. |
| episodeLeaks reports a planted per-car leak (the guard can fail) | 50-72 | 66, 68-70 | episodeLeaks reports a planted per-car leak.  Observes hit.cars. Target: file target above; limited to supplied fixtures. |
| reset() clears retirements and classification and re-arms the same reliability plan | 79-101 | 90, 94-99 | reset() clears retirements and classification and re-arms the same reliability plan.  Observes G.cars[3].retired, G.cars[3].dnf, G.cars[5].finPos, G.cars[5]._coastHeld. Target: file target above; limited to supplied fixtures. |

## tests/unit/ers-audio-layer.test.mjs

Read range: 1-291; SHA-256: `dfa04fe2f7df0bf07423147033b7716f20a0c6c85268b7277d8bf8648cbf1a36`.

Production target: ErsLayer — js/audio/ers-layer.js:8-246; GameAudio — js/audio/engine.js.

Fixtures / limits: Recording fake AudioParams/nodes; integration boots real GameAudio with held fetches and fake AudioContext. Asserts scheduling targets, graph allocation and hooks; no audible quality, actual Web Audio scheduling or device output.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| deploy whine gain and pitch rise monotonically with deploy power | 71-84 | 79-80, 83 | deploy whine gain and pitch rise monotonically with deploy power.  Target: file target above; limited to supplied fixtures. |
| muted ERS preserves pitch through its fade, sleeps while inputs move, and resumes without rebuilding | 86-118 | 94, 101, 108-111, 115, 117 | muted ERS preserves pitch through its fade, sleeps while inputs move, and resumes without rebuilding.  Observes freqs.filter((p, i) => p.sets > initial[i]).length, freqs.map, E.inspect().deployHz, E.inspect().harvestHz. Target: file target above; limited to supplied fixtures. |
| harvest tone is a distinct lower, braking-linked register | 120-136 | 127-132, 135 | harvest tone is a distinct lower, braking-linked register.  Observes dep.harvest, har.deploy. Target: file target above; limited to supplied fixtures. |
| layer is silent at an empty battery or with ERS off | 138-156 | 142, 145-147, 150, 153-155 | layer is silent at an empty battery or with ERS off.  Observes ErsLayer.deployLevel, ErsLayer.harvestLevel, ErsLayer.sustainLevel. Target: file target above; limited to supplied fixtures. |
| boost cue fires once per activation | 158-178 | 161, 164, 169, 174, 176-177 | boost cue fires once per activation.  Observes ErsLayer.cueCount. Target: file target above; limited to supplied fixtures. |
| ramps use setTargetAtTime and a steady update creates zero nodes | 180-194 | 185, 192-193 | ramps use setTargetAtTime and a steady update creates zero nodes.  Observes snap.deployMethod, ErsLayer.builds. Target: file target above; limited to supplied fixtures. |
| GameAudio.setEngine drives the layer through the init/update hook | 196-263 | 257, 259-260, 262 | GameAudio.setEngine drives the layer through the init/update hook.  Observes ErsLayer.attached, GameAudio.ersLevel. Target: file target above; limited to supplied fixtures. |
| boost cue respects zero trim and muted ERS cancels an active cue | 266-283 | 269, 273, 276, 279-282 | boost cue respects zero trim and muted ERS cancels an active cue.  Observes E.cueCount, cue.gain.targets.some, E.deployLevel, E.sustainLevel. Target: file target above; limited to supplied fixtures. |
| deploy and onset use soft sine waves and a nonresonant lowpass | 285-291 | 288, 290 | deploy and onset use soft sine waves and a nonresonant lowpass.  Observes oscs.every. Target: file target above; limited to supplied fixtures. |

## tests/unit/evaluate-scope-lint.test.mjs

Read range: 1-117; SHA-256: `6ede6d56c06a82d47c81d23e0a6b579ac4c4096ff74c3444e60f6ac35532f3c4`.

Production target: tools/check/evaluate-scope-lint.mjs lintSource / lintAll.

Fixtures / limits: Inline source fixtures, real tree scan and optional git historical file. Historical case explicitly skips when commit unavailable; parser scope checking does not execute browser callbacks.

Expansion: method templates each declare $eval and $$eval cases.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| a Node-side const read inside evaluate() is an error | 24-30 | 28-29 | a Node-side const read inside evaluate() is an error.  Observes bad.length, bad[0].name. Target: file target above; limited to supplied fixtures. |
| passing it in as an argument is the fix, and lints clean | 32-36 | 35 | passing it in as an argument is the fix, and lints clean.  Target: file target above; limited to supplied fixtures. |
| page globals and the game's own globals are allowed | 38-44 | 43 | page globals and the game's own globals are allowed.  Target: file target above; limited to supplied fixtures. |
| waitForFunction is checked too — same boundary, same trap | 46-52 | 50-51 | waitForFunction is checked too — same boundary, same trap.  Observes bad.length, bad[0].method. Target: file target above; limited to supplied fixtures. |
| `${method} checks the second argument callback for Node captures` | 55-61 | 58-60 | `${method} checks the second argument callback for Node captures`.  Observes bad.length, bad[0].name, bad[0].method. Target: file target above; limited to supplied fixtures. |
| `${method} allows a value passed through its third argument` | 63-66 | 64-65 | `${method} allows a value passed through its third argument`.  Target: file target above; limited to supplied fixtures. |
| it catches the shape that actually broke — both sites | 86-89 | 88 | Synthetic historical callback reports both FLAT_LAUNCH and CLIMB_LAUNCH captures, excluding callback-local upAt.  Observes bad.map((b) => b.name).sort. Target: file target above; limited to supplied fixtures. |
| and catches it in the REAL file, wherever history is available | 91-109 | 108 | and catches it in the REAL file, wherever history is available.  Observes bad.map((b) => b.name).sort. Target: file target above; limited to supplied fixtures. |
| the tree is clean | 111-117 | 116 | lintAll must return no parse errors or capture violations in the current scanned tree; does not execute callbacks.  Target: file target above; limited to supplied fixtures. |

## tests/unit/extra-rigs.test.mjs

Read range: 1-190; SHA-256: `2f4c6486cb8c794b54556c7be6925ce3b378b2bf864116b011a5d32c0d323294`.

Production target: ExtraRigs — js/camera/extra-rigs.js:2-326; js/camera/offsets.js; tests/helpers/camera-modes.mjs.

Fixtures / limits: Straight synthetic track, camera-mode helper, map store and injected Broadcast; speed-scale case loads real broadcast. Finite geometry and state transitions do not establish visual framing on curved circuits.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| CAM_MODES appends rival, pitwall, drone after trackside (save-format contract) | 50-55 | 53-54 | CAM_MODES appends rival, pitwall, drone after trackside.  Observes CAM_MODE_IDS.slice, CAM_MODE_IDS.length. Target: file target above; limited to supplied fixtures. |
| ExtraRigs.pickRival uses Broadcast.battles when present | 57-70 | 68-69 | ExtraRigs.pickRival uses Broadcast.battles when present.  Observes ExtraRigs.pickRival. Target: file target above; limited to supplied fixtures. |
| ExtraRigs.pickRival falls back to nearest car within FALLBACK_S | 72-79 | 77-78 | ExtraRigs.pickRival falls back to nearest car within FALLBACK_S.  Observes ExtraRigs.pickRival. Target: file target above; limited to supplied fixtures. |
| ExtraRigs.pickRival: RIVAL LOCK picks the same rival at OVERALL SPEED 0.469 as at pace 1; WATCH keeps real m/s (4-F6) | 81-106 | 99-100, 103-104 | ExtraRigs.pickRival: RIVAL LOCK picks the same rival at OVERALL SPEED 0.469 as at pace 1; WATCH keeps real m/s.  Target: file target above; limited to supplied fixtures. |
| ExtraRigs.solve returns finite eye/tgt/fov for rival, pitwall, drone | 108-121 | 116-119 | ExtraRigs.solve returns finite eye/tgt/fov for rival, pitwall, drone.  Observes eye.every, tgt.every. Target: file target above; limited to supplied fixtures. |
| ExtraRigs.tickPitAuto cuts to pitwall on entry and restores on exit | 123-141 | 135-136, 139-140 | ExtraRigs.tickPitAuto cuts to pitwall on entry and restores on exit.  Observes ExtraRigs.tickPitAuto. Target: file target above; limited to supplied fixtures. |
| ExtraRigs.tickPitAuto leaves the camera alone by default (opt-in only) | 143-160 | 155-156, 158-159 | ExtraRigs.tickPitAuto leaves the camera alone by default.  Observes ExtraRigs.tickPitAuto. Target: file target above; limited to supplied fixtures. |
| ExtraRigs.pitCamAuto persists through GameStore | 162-169 | 164-168 | ExtraRigs.pitCamAuto persists through GameStore.  Observes ExtraRigs.pitCamAuto, disk.get. Target: file target above; limited to supplied fixtures. |
| drone cornerLead is gated in CamTune.modes | 171-174 | 173 | drone cornerLead is gated in CamTune.modes.  Target: file target above; limited to supplied fixtures. |
| ExtraRigs.pickRival reuses its running-car rows and array across calls | 178-190 | 186-189 | ExtraRigs.pickRival reuses its running-car rows and array across calls.  Observes seen[0].arr, seen[1].rows.every, seen[1].arr.length, seen[1].arr[0].key. Target: file target above; limited to supplied fixtures. |

## tests/unit/f1-dev-tools.test.mjs

Read range: 1-359; SHA-256: `57998d55f42006015162c93ff051bfeadb3c20a8bab38624e3ab1149420b9db8`.

Production target: plugins/f1-dev-tools/skills/f1-dev-tools/scripts/browser.js; compare.mjs; sites/design-lab/app.js; examples/visor-lab/optics.html; spike/capture-m8.mjs; design-preview/concept-bodies/solve-cam.mjs, envelope-limits.mjs and cmp.mjs; spike/physics/deep-sideworld-run.mjs; plugin and MCP configuration files.

Fixtures / limits: Production game VM plus synthetic traces, fetch/DOM/RAF stubs, source slices, filesystem subprocess fixtures. Trace timeout deliberately supplies no frames: rejection is required and this is no motion/rendering evidence. Paths inside fixture payloads are synthetic identities, not repository links.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| real game API: capture/restore, raw preset inheritance, invalid inputs and failure cleanup | 18-97 | 26, 28-31, 37-39, 41-42, 46, 59-61, 65-67, 69, 76-84, 86-87, 89-90, 93-94 | real game API: capture/restore, raw preset inheritance, invalid inputs and failure cleanup.  Observes inspection.info.track, diagnostic.schema, diagnostic.inspection.info.track, ['visible','hidden',null].includes. Target: file target above; limited to supplied fixtures. |
| scene restore keeps absent and seeded camera preferences and sparse inheritance on success and failure | 100-144 | 115-121, 124, 127-130, 138-140 | scene restore keeps absent and seeded camera preferences and sparse inheritance on success and failure.  Observes restored.result.restored, restored.cameraOverride, g.apex.camera().mode, g.apex.camTune('chase').height. Target: file target above; limited to supplied fixtures. |
| production WATCH API: batch validation is atomic and timeout restores replay state | 146-191 | 160-161, 163-165, 169-171, 174, 178, 186, 189 | production WATCH API: batch validation is atomic and timeout restores replay state.  Observes g.ctx.F1Dev.replayCheck, r.status().T, JSON.stringify, g.G.state. Target: file target above; limited to supplied fixtures. |
| comparison detects mismatches, rejects non-rendering and non-finite traces | 197-208 | 199-200, 202, 204, 206-207 | comparison detects mismatches, rejects non-rendering and non-finite traces.  Observes same.comparable, same.delta.maxEyeStep, compare(trace(),trace({track:'baku'})).mismatches, compare(unknown,unknown).comparable. Target: file target above; limited to supplied fixtures. |
| plugin advertises the checkout MCP catalog without owning server startup | 211-238 | 214-215, 218, 220, 222, 227-228, 232-233, 235-237 | plugin advertises the checkout MCP catalog without owning server startup.  Observes manifest.version, Object.keys(checkout.mcpServers).sort, Object.keys(cursor.mcpServers).sort, fs.existsSync. Target: file target above; limited to supplied fixtures. |
| audit: comparison rejects scene identity drift and output aliases | 240-252 | 243, 249-250 | comparison rejects scene identity drift and output aliases.  Observes compare(before,after).mismatches.includes, JSON.parse(fs.readFileSync(input)).schema. Target: file target above; limited to supplied fixtures. |
| audit: asset evidence identifies redirects and the final resource | 254-261 | 259-260 | asset evidence identifies redirects and the final resource.  Observes r.results[0].url, r.results[0].requestedUrl, r.results[0].redirected. Target: file target above; limited to supplied fixtures. |
| audit: design lab skips invalid entries, derives counts and retains existing cards on load-more | 263-281 | 277-278, 280 | design lab skips invalid entries, derives counts and retains existing cards on load-more.  Observes get('load-error').hidden, get('capture-grid').children.length, get('source-backend').textContent, get('capture-grid').children[0]. Target: file target above; limited to supplied fixtures. |
| audit: optics stops scheduling when paused and responds to motion preference changes | 283-298 | 293-295, 297 | optics stops scheduling when paused and responds to motion preference changes.  Observes callbacks.size, ctx.window.animate, motion.checked. Target: file target above; limited to supplied fixtures. |
| audit: M8 capture explicitly selects GLX and closes the browser after navigation failure | 300-308 | 306-307 | M8 capture explicitly selects GLX and closes the browser after navigation failure.  Observes ctx.shot, preferences.get. Target: file target above; limited to supplied fixtures. |
| audit: fixed-point camera result reports the coordinates used for projection | 310-315 | 314 | fixed-point camera result reports the coordinates used for projection.  Observes result[0].cx, result[0].cy. Target: file target above; limited to supplied fixtures. |
| audit: envelope enforces the lower current or historical size per dimension | 318-321 | 319-320 | envelope enforces the lower current or historical size per dimension.  Target: file target above; limited to supplied fixtures. |
| audit: concept comparison writes to the supplied confined destination | 323-334 | 329, 331-332 | concept comparison writes to the supplied confined destination.  Observes run.status, overwrite.status, overwrite.stderr.split('\n').some, fs.readFileSync. Target: file target above; limited to supplied fixtures. |
| audit: side-world file server rejects decoded parent traversal before accessing files | 337-346 | 345 | side-world file server rejects decoded parent traversal before accessing files.  Target: file target above; limited to supplied fixtures. |
| audit: failed M8 shots produce a failing verdict and close the static server | 349-359 | 357 | failed M8 shots produce a failing verdict and close the static server.  Observes process.exitCode. Target: file target above; limited to supplied fixtures. |

## tests/unit/factory-ai-setup.test.mjs

Read range: 1-39; SHA-256: `b842d51bb9886d5b389658b77c0cb7b8daadbc4545da0b86b1dad4e716b20e4e`.

Production target: Parts.getFactorySetup / aeroLoad / ersProfile — js/car/parts.js; js/data/teams.js.

Fixtures / limits: Real team/factory tables in VM. Compares factory values, without running AI driving or measuring race performance.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| factory aeroLoad and ersDeploy spread across the grid | 28-39 | 32-35, 37-38 | factory aeroLoad and ersDeploy spread across the grid.  Target: file target above; limited to supplied fixtures. |

## tests/unit/fake-audio-vm.cjs

Read range: 1-36; SHA-256: `bf3d952dddc793d791b722d55c1349d62e5a9e5b7987340086987356f94f7ec7`.

Support module, no test declarations or assertions. install (8-35) injects a recording AudioContext, node lifetime set and parameter setters; decode always rejects. Used by finish-coast and other VM audio tests; does not emulate acoustic output.

## tests/unit/field-lod.test.mjs

Read range: 1-603; SHA-256: `cd9b1f6e37e21ea4e2b900838bb745f599319ce10f202df33a1b3acd7f640f1e`.

Production target: FieldLod — js/car/field-lod.js:17-136; js/game.js render/drawAeroFlaps; js/car/car-draw.js; shared shadow/mirror passes; js/render/three/tlx.js.

Fixtures / limits: Mixes real table functions, extracted production source slices, recording gfx/track stubs and real car geometry caches. World positions/normals and draw/material keys are CPU evidence; source regex checks are structural; no live GPU, visual quality or measured frame-time guarantee.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| behind-eye world rivals skip road projection, including interpolated and remote poses | 68-89 | 83-85, 87-88 | behind-eye world rivals skip road projection, including interpolated and remote poses.  Observes r.prepared.map, r.projected.length, interpolated.z, r.prepared.find(p => p.car.id === "no-world").world. Target: file target above; limited to supplied fixtures. |
| the early car gate follows the current camera and preserves player, menu and distance guards | 91-112 | 103-104, 107, 110-111 | the early car gate follows the current camera and preserves player, menu and distance guards.  Observes r.prepared.map, r.projected.length, r.prepared.some, r.prepared.length. Target: file target above; limited to supplied fixtures. |
| the table: a rival's parts by camera distance; the player is never reduced | 114-140 | 116-118, 120-121, 123-125, 127, 129-131, 133-135, 137-139 | the table: a rival's parts by camera distance; the player is never reduced.  Observes Object.isFrozen, L.d2. Target: file target above; limited to supplied fixtures. |
| lite LOD keeps the fixed wheel layer (open-rim fill past WHEEL_EXTRAS_M) | 142-155 | 146-149, 152-154 | lite LOD keeps the fixed wheel layer.  Observes p.tier, p.fixedWheels, p.compound, p.spinDisc. Target: file target above; limited to supplied fixtures. |
| apex26.fieldLod = 0 returns every legacy gate; unset or 1 is on | 157-171 | 160-167, 169-170 | apex26.fieldLod = 0 returns every legacy gate; unset or 1 is on.  Observes L.on, L.tier, L.parts(at(500), false).cheapBody, L.wheelsLite. Target: file target above; limited to supplied fixtures. |
| nearest(): keeps the cap smallest, the forced index always | 173-182 | 176-181 | nearest(): keeps the cap smallest, the forced index always.  Observes L.nearest, d.filter((_, i) => keep[i]).sort, keep[9]. Target: file target above; limited to supplied fixtures. |
| shadow gate: cast=false keeps the blob but is never a sun-map caster; an omitted flag casts | 206-222 | 214, 221 | shadow gate: cast=false keeps the blob but is never a sun-map caster; an omitted flag casts.  Observes r.blobs, r.cast.filter. Target: file target above; limited to supplied fixtures. |
| shadow gate: the lamp map skips a non-casting rival in its key AND its cast loop | 224-227 | 226 | shadow gate: the lamp map skips a non-casting rival in its key AND its cast loop.  Observes (src.match(/!_shadowCast\[i\]/g) \|\| []).length. Target: file target above; limited to supplied fixtures. |
| game.js: under FieldLod the caster is pushed AFTER the side-frustum test, gated at 50 m | 229-252 | 234-236, 238-242, 245, 247, 250-251 | game.js: under FieldLod the caster is pushed AFTER the side-frustum test, gated at 50 m.  Target: file target above; limited to supplied fixtures. |
| the LOD scales by the lens: a long lens keeps the livery, a wide one cuts sooner | 260-272 | 262-266, 268-271 | the LOD scales by the lens: a long lens keeps the livery, a wide one cuts sooner.  Observes L.lensK2, L.tier. Target: file target above; limited to supplied fixtures. |
| hysteresis: a car hovering at a threshold does not flicker between tiers | 274-286 | 279-283, 285 | hysteresis: a car hovering at a threshold does not flicker between tiers.  Observes c._lodTier, LO.tier. Target: file target above; limited to supplied fixtures. |
| drawAeroFlaps: moving = one draw per element; `still` or at rest = ONE draw of the whole set | 334-353 | 336-337, 339-340, 346-348, 350-351 | drawAeroFlaps: moving = one draw per element; `still` or at rest = ONE draw of the whole set.  Observes ["front", "rear"].map, flapDraws(r).length, edgeDraws(r).length, flaps.length. Target: file target above; limited to supplied fixtures. |
| the static set is the per-element draw, baked: same vertices and normals at each rest pose | 355-374 | 364-367, 373 | the static set is the per-element draw, baked: same vertices and normals at each rest pose.  Observes r.draws[0].mesh.d.mat, r.draws[0].mesh.d.pos.length. Target: file target above; limited to supplied fixtures. |
| the static set is cached per (solve, colour, finish, pose, wing) and FIFO-freed | 376-391 | 381-384, 386, 390 | the static set is cached per (solve, colour, finish, pose, wing) and FIFO-freed.  Observes r.made.length. Target: file target above; limited to supplied fixtures. |
| mirror: the nearest 6 rivals behind, nothing outside its cone; every car with apex26.fieldLod=0 | 440-448 | 442-443, 445, 447 | mirror: the nearest 6 rivals behind, nothing outside its cone; every car with apex26.fieldLod=0.  Observes on.draws, on.mp.state().cars, on.posed.filter, off.draws. Target: file target above; limited to supplied fixtures. |
| warm: TLX compiles the flame / ERS lit keys during the lights | 456-472 | 459, 468, 470-471 | warm: TLX compiles the flame / ERS lit keys during the lights.  Observes warmed.has. Target: file target above; limited to supplied fixtures. |
| game.js swaps rivals to the one shared body mesh past tier 2 | 474-497 | 479, 490-495 | game.js swaps rivals to the one shared body mesh past tier 2.  Target: file target above; limited to supplied fixtures. |
| warm: warmCarAssets builds the caster silhouette, the field wheels and the flame (not a whole-car mesh per rival) | 499-512 | 502-503, 506, 509-511 | warm: warmCarAssets builds the caster silhouette, the field wheels and the flame.  Target: file target above; limited to supplied fixtures. |
| drawPlayerWheels' lite gate follows c._lodTier (hysteresis), wheelsLite only without a tier | 517-548 | 520, 536-537, 541, 543-545, 547 | drawPlayerWheels' lite gate follows c._lodTier (hysteresis), wheelsLite only without a tier.  Target: file target above; limited to supplied fixtures. |
| moving and resting flap draws use the regional wing finish over the body finish | 551-561 | 555, 557-558 | moving and resting flap draws use the regional wing finish over the body finish.  Observes draw.mesh.d.mat.includes. Target: file target above; limited to supplied fixtures. |
| cockpit flap finish overrides reach moving and static front wings without changing exterior livery | 563-587 | 571-572, 574-576, 578, 581, 583-584 | cockpit flap finish overrides reach moving and static front wings without changing exterior livery.  Observes cockpit.length, mesh.d.mat.includes, JSON.stringify. Target: file target above; limited to supplied fixtures. |
| farBody: the decimated silhouette body past FAR_BODY_M, sticky, never when the LOD is off | 589-603 | 591-593, 595-599, 601-602 | farBody: the decimated silhouette body past FAR_BODY_M, sticky, never when the LOD is off.  Observes L.T.FAR_BODY_M, L.farBody, loadLod(0).FieldLod.farBody. Target: file target above; limited to supplied fixtures. |

## tests/unit/fill-gating.test.mjs

Read range: 1-130; SHA-256: `f3f07575152b5b0c66b3c658b5a82bd3eb15f1145c587c21c11cfe94eed4c4b4`.

Production target: LiveryTex.FILL_SURFACES / fillInert / buildAtlas — js/car/liverytex.js; tools/car/livery-contrast.mjs.

Fixtures / limits: Recording atlas paint operations use magenta probe and cleared competing fills. LIVE means some team can spend each declared pair; INERT negatives sample first four or three teams, not every livery combination. Paint operations are not GPU pixels.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| LiveryTex publishes the fill map the sheet and the shot tool both read | 42-58 | 43-44, 46-50, 56-57 | LiveryTex publishes the fill map the sheet and the shot tool both read.  Observes LT.SPINE_LOGO_IDS.includes, LT.SPINE_SIDE_IDS.includes, LT.fillInert. Target: file target above; limited to supplied fixtures. |
| every design the map calls LIVE can really spend that row | 60-87 | 85-86 | every design the map calls LIVE can really spend that row.  Target: file target above; limited to supplied fixtures. |
| a design the map calls INERT paints nothing in that row | 89-109 | 107-108 | a design the map calls INERT paints nothing in that row.  Target: file target above; limited to supplied fixtures. |
| a design the map calls INERT paints nothing in that row, under EVERY cover bind | 111-130 | 128-129 | a design the map calls INERT paints nothing in that row, under EVERY cover bind.  Target: file target above; limited to supplied fixtures. |

## tests/unit/fin-design.test.mjs

Read range: 1-932; SHA-256: `27c1e6662828486d64b2db9399f3d04648ae986c56db071d24be3798622d2fa7`.

Production target: Car3D.build / bodyAnchors / coverProfile — js/car/car3d.js; LiveryTex — js/car/liverytex.js; js/car/livery-graphics.js; js/car/liveries.js; js/car/car-mesh.js.

Fixtures / limits: Real geometry and recorded atlas ops, clipping approximated by clip bounding boxes. Later spine-station sweeps use 64-grid ink and 96-grid CPU side-camera occlusion; loaded images use traced offline badge boxes. Bounds establish station/geometry and contrast contracts, not art quality or all camera visibility.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| an absent finShape is the shipped car, byte for byte | 37-40 | 38-39 | an absent finShape is the shipped car, byte for byte.  Observes M.Car3D.FIN_SHAPE_IDS. Target: file target above; limited to supplied fixtures. |
| the argument-less badge still lands on z -1.235 / -1.465 | 46-50 | 49 | the argument-less badge still lands on z -1.235 / -1.465.  Target: file target above; limited to supplied fixtures. |
| every shape moves the blade, and its own badge and panel stay on it | 52-67 | 55, 60-61, 65 | every shape moves the blade, and its own badge and panel stay on it.  Observes F.topLE[1]. Target: file target above; limited to supplied fixtures. |
| finShape none removes the blade and its decal quads together | 71-77 | 73, 75-76 | finShape none removes the blade and its decal quads together.  Target: file target above; limited to supplied fixtures. |
| finStyle none paints nothing on the fin panel, and the crown never carries the wash | 129-138 | 131-132, 136-137 | finStyle none paints nothing on the fin panel, and the crown never carries the wash.  Observes opsIn(none, R.fin).length, opsIn(A.paint("ferrari", { ...BASE, spineLogo: "none" }), R.crest).length. Target: file target above; limited to supplied fixtures. |
| every named motif paints the fin, and a foreign one falls back to the team's | 140-146 | 142, 145 | every named motif paints the fin, and a foreign one falls back to the team's.  Target: file target above; limited to supplied fixtures. |
| spineLogo none drops the crest from the cover and keeps it on the fin | 148-152 | 150-151 | spineLogo none drops the crest from the cover and keeps it on the fin.  Observes opsIn(none, R.finBadge).length. Target: file target above; limited to supplied fixtures. |
| optional paints do not cross-feed other surfaces | 165-184 | 170-183 | optional paints do not cross-feed other surfaces.  Target: file target above; limited to supplied fixtures. |
| saddle / crown band ignore BODY STRIPE; SPINE TINT is the override | 186-216 | 203-206, 208-209, 214-215 | saddle / crown band ignore BODY STRIPE; SPINE TINT is the override.  Observes [...stylesOf(withStripe)].sort. Target: file target above; limited to supplied fixtures. |
| saddleTint owns the saddle flank fill, not spineTint / bandC | 218-238 | 231-234, 236-237 | saddleTint owns the saddle flank fill, not spineTint / bandC.  Target: file target above; limited to supplied fixtures. |
| coverBind saddleWrap paints saddle flanks without a saddle crown | 240-245 | 242-244 | coverBind saddleWrap paints saddle flanks without a saddle crown.  Target: file target above; limited to supplied fixtures. |
| airboxMeshColour: wrap sun wins over cover | 247-251 | 250 | airboxMeshColour: wrap sun wins over cover.  Observes A.LT.airboxMeshColour. Target: file target above; limited to supplied fixtures. |
| airboxMeshColour: non-wrap uses cover (airboxTint folded away) | 253-258 | 256-257 | airboxMeshColour: non-wrap uses cover.  Observes A.LT.airboxMeshColour. Target: file target above; limited to supplied fixtures. |
| migratePaint folds RIDGE, drops AIRBOX and the lettering overrides | 260-279 | 262, 265-266, 273-274, 276-278 | migratePaint folds RIDGE, drops AIRBOX and the lettering overrides.  Observes a.spineTint, a.ridgeTint, b.airboxTint, b.cover. Target: file target above; limited to supplied fixtures. |
| finHandoff contrast derives when fin unset; authored fin always wins | 281-294 | 289-290, 293 | finHandoff contrast derives when fin unset; authored fin always wins.  Target: file target above; limited to supplied fixtures. |
| authored DETAIL accent and saddleTint shoulder are used as-is | 296-318 | 308-309, 316-317 | authored DETAIL accent and saddleTint shoulder are used as-is.  Target: file target above; limited to supplied fixtures. |
| finHandoff hardCut stops crown continuation on the tail, fin motif stays | 320-326 | 323-325 | finHandoff hardCut stops crown continuation on the tail, fin motif stays.  Observes opsIn(cut, R.tail).length. Target: file target above; limited to supplied fixtures. |
| spineTint colours the crown band alone, and is absent-identical | 328-372 | 345-346, 353-356, 361-362, 370-371 | spineTint colours the crown band alone, and is absent-identical.  Observes JSON.stringify, [...after].sort, [...noseAfter].sort. Target: file target above; limited to supplied fixtures. |
| the flank squash table still matches the cover Car3D actually builds | 374-396 | 381-382, 388-389, 394-395 | the flank squash table still matches the cover Car3D actually builds.  Observes Object.keys(A.LT.FLANK_H).sort. Target: file target above; limited to supplied fixtures. |
| every SPINE TOP design paints the crown; wordmark and number carry text | 398-477 | 399, 403, 407-408, 419-422, 427, 429-430, 447-448, 454-455, 460-461, 464-465, 470, 472, 474-475 | every SPINE TOP design paints the crown; wordmark and number carry text.  Observes Array.from, flankFills(auth).includes, opsIn(A.paint("ferrari", BASE), R.spineSideL).length, opsIn(wrap, R.tail).length. Target: file target above; limited to supplied fixtures. |
| carbon tail keylines match the crown width | 479-489 | 484, 486-487 | carbon tail keylines match the crown width.  Observes m[0]. Target: file target above; limited to supplied fixtures. |
| finBadge number puts the race number on the fin; none leaves the plate bare | 491-498 | 494, 496-497 | finBadge number puts the race number on the fin; none leaves the plate bare.  Observes texts.includes. Target: file target above; limited to supplied fixtures. |
| the stepped fin adds a rear block behind an unchanged front-blade outline | 504-511 | 506, 509-510 | the stepped fin adds a rear block behind an unchanged front-blade outline.  Observes badge.every. Target: file target above; limited to supplied fixtures. |
| cover vents are geometry; the T-cam pick is colour only | 513-521 | 516, 519-520 | cover vents are geometry; the T-cam pick is colour only.  Target: file target above; limited to supplied fixtures. |
| spineHeight lifts the cover crown top-only and leaves the fin top alone | 527-571 | 528, 530, 533, 535-539, 541-542, 553, 560-561, 568-569 | spineHeight lifts the cover crown top-only and leaves the fin top alone.  Observes Array.from, M.Car3D.bodyAnchors, a2.coverAt(-0.55).bottom, m.pos.length. Target: file target above; limited to supplied fixtures. |
| spineSide paints the flank band on pick only, and clears the service panels from under it | 577-645 | 578-587, 590-591, 593-594, 596-597, 599-600, 605-609, 612-629, 631-634, 636-637, 643-644 | spineSide paints the flank band on pick only, and clears the service panels from under it.  Observes Array.from, saddle.u, saddle.v, wrap.u. Target: file target above; limited to supplied fixtures. |
| authored TEAM LOGO / LOGO DETAIL reach the flank logo and emblem | 647-682 | 665-668, 671-672, 674-675, 680-681 | authored TEAM LOGO / LOGO DETAIL reach the flank logo and emblem.  Observes P0.plate, P1.plate. Target: file target above; limited to supplied fixtures. |
| the cover profile rounds the crown and its samplers sit on the skin | 688-704 | 694, 696-701 | the cover profile rounds the crown and its samplers sit on the skin.  Target: file target above; limited to supplied fixtures. |
| T-cam auto paints car 1 black and car 2 yellow | 709-716 | 714-715 | T-cam auto paints car 1 black and car 2 yellow.  Target: file target above; limited to supplied fixtures. |
| finBadge code puts the driver's three letters on the fin | 718-725 | 722-724 | finBadge code puts the driver's three letters on the fin.  Observes texts.includes. Target: file target above; limited to supplied fixtures. |
| mirror lamp anchors follow the team's mirror style and are cached | 727-734 | 729-731, 733 | mirror lamp anchors follow the team's mirror style and are cached.  Observes a.length, M.Car3D.mirrorLightAnchors. Target: file target above; limited to supplied fixtures. |
| the ERS light code flashes once at full deploy, rapidly when clipping, and stands aside otherwise | 740-752 | 744, 746, 748-751 | the ERS light code flashes once at full deploy, rapidly when clipping, and stands aside otherwise.  Observes dep.every, sample({ deploying: false, energy: 0.6, axEstSm: 0 }).every, sample({ deploying: false, energy: 1, axEstSm: 0 }).every. Target: file target above; limited to supplied fixtures. |
| the wrap sun clears the cover it is painted on, for every team | 756-769 | 767 | the wrap sun clears the cover it is painted on, for every team.  Target: file target above; limited to supplied fixtures. |
| bigmark is BIG — not logo at 1.087x | 771-796 | 792-794 | bigmark is BIG — not logo at 1.087x.  Target: file target above; limited to supplied fixtures. |
| every flank MARK lands clear of the crease and above the sidepod, on every crown | 804-825 | 819-822 | every flank MARK lands clear of the crease and above the sidepod, on every crown.  Target: file target above; limited to supplied fixtures. |
| nothing that has to be READ is put where the car covers it | 834-864 | 861-862 | nothing that has to be READ is put where the car covers it.  Target: file target above; limited to supplied fixtures. |
| the crown's own mark on the flank is on camera, on every team | 875-898 | 894-896 | the crown's own mark on the flank is on camera, on every team.  Target: file target above; limited to supplied fixtures. |
| under a crown that moves the side design, the cover's trim moves with it | 909-932 | 928-931 | under a crown that moves the side design, the cover's trim moves with it.  Target: file target above; limited to supplied fixtures. |

## tests/unit/finish-coast-rev-vm.test.mjs

Read range: 1-101; SHA-256: `764b69897d21480cb2562cdd08ff374c6121e32b4d8532a9595183ed1e50225c`.

Production target: js/game.js finished-car update branch; tools/lib/game-vm.cjs; fake-audio-vm.cjs.

Fixtures / limits: Real one-lap Monza game VM with fake audio; solo/local friend/AI coast paths. Samples RPM versus coast speed; no real engine sound or multiplayer network ownership behavior.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| solo finisher: rpm falls with coast speed, not pinned on the limiter | 41-52 | 48-50 | solo finisher: rpm falls with coast speed, not pinned on the limiter.  Target: file target above; limited to supplied fixtures. |
| VS FRIEND wait: finisher rpm reaches idle while the other human is still running | 54-70 | 66-68 | VS FRIEND wait: finisher rpm reaches idle while the other human is still running.  Observes G.state, p.rpm. Target: file target above; limited to supplied fixtures. |
| AI finisher: the same coast branch winds its rpm to the crawl, not the crossing revs | 75-101 | 84, 86, 90-91, 96, 98-99 | AI finisher: the same coast branch winds its rpm to the crawl, not the crossing revs.  Observes G.state. Target: file target above; limited to supplied fixtures. |

## tests/unit/fit-audit-car.test.mjs

Read range: 1-148; SHA-256: `d3c9bee4d6dfeb4a7e23abf249f0c63792f04d8db016f4a95d87bb5dd55a8214`.

Production target: tools/car/lib/fit-geom.mjs; fit-checks.mjs; tools/car/car-fit-audit.mjs.

Fixtures / limits: Axis-aligned closed boxes/open quads with known gaps, plus real McLaren planted fin lift and Racing Bulls top perturbation. CPU visibility/classification does not prove all cars fit or visual sign-off.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| FIT thresholds are the documented ones (widening one is a tolerance change) | 42-45 | 43-44 | FIT thresholds are the documented ones.  Target: file target above; limited to supplied fixtures. |
| a closed box welds into one closed piece; an open quad is open | 47-52 | 49-51 | a closed box welds into one closed piece; an open quad is open.  Observes A.pieces.length, A.pieces[1].boundary. Target: file target above; limited to supplied fixtures. |
| GAP: a touching part joins the car; one 10 mm off floats and fails | 54-67 | 56-57, 60-61, 63, 66 | GAP: a touching part joins the car; one 10 mm off floats and fails.  Observes gaps(touch).rows, gaps(touch).joints.map, r.check, r.a. Target: file target above; limited to supplied fixtures. |
| PENETRATION: 30 mm into a closed box fails, a 10 mm embed is a join | 69-76 | 72, 75 | PENETRATION: 30 mm into a closed box fails, a 10 mm embed is a join.  Target: file target above; limited to supplied fixtures. |
| ZFIGHT: a coplanar plate of another colour fights; the same colour cannot show | 78-85 | 82-84 | ZFIGHT: a coplanar plate of another colour fights; the same colour cannot show.  Observes z.length. Target: file target above; limited to supplied fixtures. |
| OPEN: a visible free quad edge warns; a rim butting the body is sealed | 87-93 | 90, 92 | OPEN: a visible free quad edge warns; a rim butting the body is sealed.  Observes openEdges(flush).filter. Target: file target above; limited to supplied fixtures. |
| compareRuns: NEW, WORSE and PRE-EXISTING; a branch-only style is charged against the base factory car | 95-108 | 103-104, 107 | compareRuns: NEW, WORSE and PRE-EXISTING; a branch-only style is charged against the base factory car.  Observes out.cars[0].rows.map, out.cars[1].rows.map, jitter.cars[0].rows.map. Target: file target above; limited to supplied fixtures. |
| real car: its shark fin lifted off the body reads as a NEW GAP (fix-proof: the defect is made here) | 110-128 | 118, 125, 127 | real car: its shark fin lifted off the body reads as a NEW GAP.  Target: file target above; limited to supplied fixtures. |
| visibility frame: 1 mm on the car's top does not re-raster the rest (B·L25 ZFIGHT jitter) | 130-148 | 147 | visibility frame: 1 mm on the car's top does not re-raster the rest.  Target: file target above; limited to supplied fixtures. |

## tests/unit/fixture-consumer-audit.test.mjs

Read range: 1-50; SHA-256: `2f43aeaf24248575fb59000babc291118d742bdc746e224ad52cc0d7b639d7cf`.

Production target: tools/ci/fixture-consumer-audit.mjs:32-100; tests/helpers/fixtures.js.

Fixtures / limits: Synthetic spec-name/source maps and real adoption scan. Import/source-shape checks do not boot fixtures; synthetic smoke/unrelated names are payload examples, not current-file links.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| worker-scoped shared context preserves configured reduced motion | 8-14 | 10-13 | worker-scoped shared context preserves configured reduced motion.  Target: file target above; limited to supplied fixtures. |
| fixture consumer audit rejects direct Playwright imports | 16-22 | 21 | fixture consumer audit rejects direct Playwright imports.  Target: file target above; limited to supplied fixtures. |
| fixture consumer audit ignores unrelated direct imports | 24-30 | 29 | fixture consumer audit ignores unrelated direct imports.  Target: file target above; limited to supplied fixtures. |
| the load-bearing consumers really import the shared fixture | 35-39 | 36-38 | the load-bearing consumers really import the shared fixture.  Target: file target above; limited to supplied fixtures. |
| real fixture adoption sits within the ratchet band | 41-50 | 43-49 | real fixture adoption sits within the ratchet band.  Target: file target above; limited to supplied fixtures. |

## tests/unit/fixtures/flake-tally/junit-retries.xml

Read range: 1-8; SHA-256: `e3f8ee213e4bc9bc12435f64dcc4b63c913afe33390eb56a0b4ce91f0e274d89`.

Fixture, no assertions. Consumer: flake-tally.test.mjs parser cases. JUnit repeated failure/pass pair, lone hard failure and clean pass; expected one flaky and one fail.

## tests/unit/fixtures/flake-tally/live-reporter-flaky.log

Read range: 1-9; SHA-256: `1e3ab8d2b61f7936f02714e87dfd30e1be15b05774d2d8f3a89d79f768b80400`.

Fixture, no assertions. Consumer: flake-tally.test.mjs parser cases. Timestamped retry lines, two BLOCKING flaky entries, one FAIL and failed summary; expected two flaky events and one fail.

## tests/unit/fixtures/flake-tally/report-flaky.json

Read range: 1-33; SHA-256: `66d85d9ccc80096e6b171068cec5adac8b6850ea787b097e4c6f05fc550beb91`.

Fixture, no assertions. Consumer: flake-tally.test.mjs parser cases. Report stats and file tests: two flaky nested-title cases and one unexpected persistence failure; expected normalized spec identities and joined titles.

## tests/unit/fixtures/process-dashboard/runs.json

Read range: 1-146; SHA-256: `e3d5128dbda7f38b2a8014a109501aaf0edd17bd59093d6a169e83d4486d384b`.

Fixture, no assertions: generated timestamp, duplicate flake events, three CI runs (same-SHA success/cancel plus another-SHA success containing failed fast job), seven then one then four jobs, and four Pages outcomes/durations. Consumers: tests/unit/process-dashboard.test.mjs:31 and tools/ci/process-dashboard.mjs fixture CLI (outside this group). Synthetic SHA/run/job identities model deduplication, grouping, critical paths and cancellation; not live CI evidence.

## tests/unit/flags.test.mjs

Read range: 1-67; SHA-256: `3598c9c28b71ed47e413db89c3bfcea9e4593b473def694c91967a9efa825208`.

Production target: Flags — js/ui/flags.js:178-194; js/circuits country metadata.

Fixtures / limits: Evaluates real SVG generator and scans country string literals. Markup/fill safety and coverage are checked; no SVG raster or accessibility browser audit.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| every circuit country resolves to a drawn flag, not the placeholder | 30-37 | 36 | every circuit country resolves to a drawn flag, not the placeholder.  Target: file target above; limited to supplied fixtures. |
| svg() is one self-contained <svg> with the code stamped on it | 39-48 | 42-44, 46 | svg() is one self-contained <svg> with the code stamped on it.  Observes s.endsWith, (s.match(/<svg/g) \|\| []).length, m[1]. Target: file target above; limited to supplied fixtures. |
| a country name works as well as a code; an unknown one is the chequered fallback | 50-55 | 51-54 | a country name works as well as a code; an unknown one is the chequered fallback.  Observes Flags.svg, Flags.code. Target: file target above; limited to supplied fixtures. |
| SEC2-4: prototype-key countries render the chequered placeholder, never an inherited member | 57-67 | 59, 61-62, 64-66 | SEC2-4: prototype-key countries render the chequered placeholder, never an inherited member.  Observes Flags.code, Flags.svg. Target: file target above; limited to supplied fixtures. |

## tests/unit/flake-tally.test.mjs

Read range: 1-530; SHA-256: `39a7d20d16ddb34f88c7325d163a7a9bb7b92a5b8c999acb77252d9dd00b4933`.

Production target: tools/ci/flake-tally.mjs; tools/lib/proxy-fetch.mjs; .github/workflows/flake-tally.yml; .github/labels.json.

Fixtures / limits: Static JSON/log/XML fixtures, handcrafted ZIP, synthetic events/API hooks and fake child streams. Confirms parser/aggregation, pagination/error retention, proposal thresholds and issue request payloads; no actual GitHub calls, issue writes, curl transport or workflow execution.

| Case name | Range | assertionSpans | Target / meaning and limits |
|---|---|---|---|
| normaliseSpec restores the tests/ prefix junit and reports drop | 35-39 | 36-38 | normaliseSpec restores the tests/ prefix junit and reports drop.  Target: file target above; limited to supplied fixtures. |
| reportTitle joins path + title like live-reporter key() | 41-44 | 42-43 | reportTitle joins path + title like live-reporter key.  Target: file target above; limited to supplied fixtures. |
| parseReportJson: flaky → flaky-pass, unexpected → fail | 46-69 | 49-68 | parseReportJson: flaky → flaky-pass, unexpected → fail.  Target: file target above; limited to supplied fixtures. |
| parseLiveLogFlakes reads = FLAKY BLOCKING rows and x FAIL lines | 71-78 | 74-77 | parseLiveLogFlakes reads = FLAKY BLOCKING rows and x FAIL lines.  Observes ev.filter((e) => e.kind === "flaky").length, ev.filter((e) => e.kind === "fail").length, ev.some. Target: file target above; limited to supplied fixtures. |
| parseJunitAttempts: fail-then-pass is flaky; lone failure is fail | 80-90 | 83-89 | parseJunitAttempts: fail-then-pass is flaky; lone failure is fail.  Observes ev.map((e) => [e.kind, e.title]).sort. Target: file target above; limited to supplied fixtures. |
| extractReportJsonFromHtml reads embedded zip report.json | 92-147 | 138, 141-146 | extractReportJsonFromHtml reads embedded zip report.json.  Target: file target above; limited to supplied fixtures. |
| tallyEvents aggregates fails, flaky-passes, runs seen, last seen run id | 149-163 | 156-162 | tallyEvents aggregates fails, flaky-passes, runs seen, last seen run id.  Observes rows[0].spec, rows[0].flakyPasses, rows[0].fails, rows[0].runsSeen. Target: file target above; limited to supplied fixtures. |
| formatMarkdownTable has the required columns and deploy branch | 165-173 | 169-172 | formatMarkdownTable has the required columns and deploy branch.  Target: file target above; limited to supplied fixtures. |
| artifact lookups are exact-name; never a bare repo-wide page scan | 175-186 | 176-177, 179-180, 184-185 | artifact lookups are exact-name; never a bare repo-wide page scan.  Target: file target above; limited to supplied fixtures. |
| pickArtifactForRun keeps the matching workflow_run id | 188-195 | 193-194 | pickArtifactForRun keeps the matching workflow_run id.  Observes pickArtifactForRun(arts, 38392542652).id. Target: file target above; limited to supplied fixtures. |
| #2188: GitHub callers default to the proxy-aware fetch; curl carries headers on stdin and never disables TLS | 199-236 | 201-205, 207-213, 226-229, 233-234 | #2188: GitHub callers default to the proxy-aware fetch; curl carries headers on stdin and never disables TLS.  Observes pickFetch({ HTTPS_PROXY: "x" }).toString, res.status, res.ok, src.replace. Target: file target above; limited to supplied fixtures. |
| tallyEvents keeps the distinct branches a test failed on | 258-265 | 264 | tallyEvents keeps the distinct branches a test failed on.  Observes rows[0].branches. Target: file target above; limited to supplied fixtures. |
| proposeRows: a pass-on-retry in 2 runs or a first-try fail on 3 branches is proposed; one branch's red is not | 267-284 | 268-269, 281-283 | proposeRows: a pass-on-retry in 2 runs or a first-try fail on 3 branches is proposed; one branch's red is not.  Observes p.map((r) => r.spec).sort, p.find((r) => r.spec.endsWith("smoke.spec.js")).reason, p.find((r) => r.spec.endsWith("hud-layout.spec.js")).reason. Target: file target above; limited to supplied fixtures. |
| quarantineRows follows the ledger's shape: legacy spec rows, or #2280's exact-title rows with evidence and expiry | 286-304 | 293-295, 297-299, 303 | quarantineRows follows the ledger's shape: legacy spec rows, or #2280's exact-title rows with evidence and expiry.  Observes Object.keys, legacy[0].since, legacy[0].why, exact[0].title. Target: file target above; limited to supplied fixtures. |
| formatIssueBody starts with the marker and carries the table, the proposals and the hand recipe | 306-314 | 309-313 | formatIssueBody starts with the marker and carries the table, the proposals and the hand recipe.  Observes body.startsWith. Target: file target above; limited to supplied fixtures. |
| listAllRuns pages FAILED ci.yml / pages.yml runs since the window; green, cancelled and other workflows are skipped | 316-342 | 335-337, 340 | listAllRuns pages FAILED ci.yml / pages.yml runs since the window; green, cancelled and other workflows are skipped.  Observes r.runs.map, calls[0], calls.length, capped.runs.map. Target: file target above; limited to supplied fixtures. |
| upsertIssue rewrites the open marker issue, else creates one with the flaky label | 344-366 | 356-359, 362-364 | upsertIssue rewrites the open marker issue, else creates one with the flaky label.  Observes calls[1][0], calls[1][1], calls[1][2].body, calls[1][2]. Target: file target above; limited to supplied fixtures. |
| baseRedRows: 3 unrelated branches, or 2 with a train, is a red on the base; one branch's red and a retry-pass are not | 370-381 | 379-380 | baseRedRows: 3 unrelated branches, or 2 with a train, is a red on the base; one branch's red and a retry-pass are not.  Observes baseRedRows(rows)[1].reason. Target: file target above; limited to supplied fixtures. |
| formatBaseRedBody starts with its own marker (not the daily one) and lists the suspects | 383-389 | 385-388 | formatBaseRedBody starts with its own marker (not the daily one) and lists the suspects.  Observes body.startsWith. Target: file target above; limited to supplied fixtures. |
| syncBaseRedIssue opens on the first suspect, refreshes while it lasts, closes when the window is clean, and is a no-op with nothing open | 391-419 | 404-406, 409-410, 412-413, 416-417 | syncBaseRedIssue opens on the first suspect, refreshes while it lasts, closes when the window is clean, and is a no-op with nothing open.  Observes calls[0][1], calls[1][2], calls[1][0], calls.length. Target: file target above; limited to supplied fixtures. |
| flake-tally.yml: a 2-hourly base-red mode beside the daily tally, same least privilege; the base-red label exists | 421-430 | 423-426, 429 | flake-tally.yml: a 2-hourly base-red mode beside the daily tally, same least privilege; the base-red label exists.  Target: file target above; limited to supplied fixtures. |
| flake-tally.yml runs the daily tally with least privilege, and the flaky label exists | 432-442 | 434-439, 441 | flake-tally.yml runs the daily tally with least privilege, and the flaky label exists.  Observes labels.some. Target: file target above; limited to supplied fixtures. |
| #2233: listRunJobs pages 30 at a time (per_page=100 is a 502 on large runs) and keeps what it read when a later page fails | 444-472 | 458-462, 467, 470 | #2233: listRunJobs pages 30 at a time (per_page=100 is a 502 on large runs) and keeps what it read when a later page fails.  Observes r.jobs.length, calls.length, calls.every, partial.jobs.length. Target: file target above; limited to supplied fixtures. |
| curlFetch rejects pre-aborted requests without creating a child | 475-486 | 481-485 | curlFetch rejects pre-aborted requests without creating a child.  Target: file target above; limited to supplied fixtures. |
| curlFetch retains child error handling during cancellation and removes abort listeners | 489-506 | 502-505 | curlFetch retains child error handling during cancellation and removes abort listeners.  Observes getEventListeners(controller.signal, "abort").length. Target: file target above; limited to supplied fixtures. |
| node jobs count: tooling-fast FAIL blocks become first-try fails on the unit file (audit4 D1) | 508-530 | 519-522, 525, 529 | node jobs count: tooling-fast FAIL blocks become first-try fails on the unit file.  Observes rows.map. Target: file target above; limited to supplied fixtures. |

Declaration census: 216 test-call sites; parameterized sites expand to five additional runtime cases (3 defect cases from 1 site, 2 track cases from 1, and two 2-method sites). Four data fixtures and one CommonJS helper have no test cases.
