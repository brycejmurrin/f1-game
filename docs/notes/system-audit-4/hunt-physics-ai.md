# hunt-physics-ai (sysaudit4) — slice js/physics/**, js/race/** (physics/AI/pit/RC), physics part of js/game.js
Inputs: checkout cursor/sysaudit3-7dd2e; known = docs/BUGS.md, docs/notes/system-audit-3/game-code.md (DEFECT-LEDGER.md at the docs root does not exist at HEAD).
Ran: apex-lsp references (Vehicle.*), git show 165a32652 / 77e5072f2, scratch/sysaudit4/hunt-physics-ai/deadexp.cjs (text scan of exports vs js/ tests/ tools/ index.html). No VM run, no browser.

## Clean (checked, fine)
- ARC RULE: no violation. assistDelta (game.js:6106) is x driveTune.ROAD_FOLLOW (default 0, drive-tune.js:18; set only by the HELP slider / __apex); lineDelta (game.js:6110) gated on raceLineAssist (default 0, game.js:966).
- ARC RULE: c.kCur (game.js:4855) is read only for !human (body-attitude.js:155-156, car-draw.js:1748); yawVis curvature term is on the AI branch only (game.js:5259); skid squeal uses own slip (game.js:6229).
- ARC RULE: BrakeCue reads Tracks.curvature (brake-cue.js:102) but is documented assist-gated (PHYSICS.md:1188); stored default is notch 1 = OFF (steer-tuning.js:642), audio/haptic only.
- ARC RULE: GripSteer reads own bicycle state only (grip-steer.js:117-135). vertLoad (game.js:6147-6150) is road pitch (surface column), not lateral arc.
- ai-corridor.js far-gap reject (77e5072f2): a sound necessary condition for both crosses() calls; NaN inputs fall through to crosses(), so it stays bit-identical.
- collide.js unyawed fast path: LCAR=4.8 = 2*HL exactly (collide.js:18-20), so the ea=eb=0 shortcut is IEEE-exact.
- TyreModel.aquaInto's shared _aq bag: one caller (game.js:4877), and the reads at 4888/5186 happen in the same car's step. Safe.
- pit-lane.js estimate/lossAt: roadFrac=min(STRAIGHT_V=0.85, flag frac) is a fraction of vTop in both places. Consistent.
- rankByProg (game.js:4428): a stable insertion sort that matches the old comparator. RaceControl.scQueueFrac/holdCap read snapshot poses.

## Findings
| id | finding | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| P1 | GripSteer gets the RAW stick as `shaped` (player-forces.js:212 `og.shaped = steer`; game.js:6160 `pf.steer = steer`), but its contract is the shaped lock (grip-steer.js:65-66, 107-111). The self-aligning term is scaled by 1-0.7·|steer| instead of 1-0.7·|steer|^2.4 (STEER_EXPO), so at half stick it is cut by 35% rather than 13%. GRIP-assist only; identity when OFF. | code trace; the pre-165a32652 literal had the same `shaped: steer`, so this is long-standing | Low: feel of an opt-in assist | pass `shaped` (game.js:6046) as its own ctx field, or rename the GripSteer param to `steer` if raw is intended; re-baseline the grip-steer unit test | med (intent unclear) | NEW |
| P2 | WheelState.stepPlayer allocates 4 object literals per tick (wheel-state.js:239-244: two `{vw,kappa}` states and two opts bags). Commit 165a32652 pooled the caller's bag only. | code trace | Low: the path is opt-in (WHEEL_STATE false); about 240 allocs/s when it is on | pool `_fState/_rState/_fIn/_rIn` beside `_fOut/_rOut` | high (alloc), est. cost | NEW |
| P3 | Dead code: Vehicle.forPlayer and Vehicle.stepWheel (vehicle.js:22-29) have no caller in js/. player-forces.js calls GripSteer/WheelState directly. They are used only by tests/unit/vehicle-tick-alloc.test.mjs:166-199. | lsp_references: def + export only; text cross-check of js/ tools/ tests/ | Low: misleading API, plus a test that pins dead code | delete both helpers and their two tests | high | NEW |
| P4 | Exports with no reader outside their own file (internal use only): AiDrive.paceEdgeN, AiDrive.trailN; TyreModel.deriveLife, lifeOf, coolFor, defectGrip, longSigned; AeroZones.runForTurnPair; AiBand.START_GUARD_S; SportingRegs.* constants. | deadexp.cjs scan over js/ tests/ tools/ index.html | Low: API surface only | drop them from the return objects (keep the internal functions) | med (text scan; a string lookup like `AiDrive[name]` would hide a use) | NEW |
| P5 | tyres.gripMul(c) is computed twice per player step (game.js:4878 and player-forces.js:163) on the same state. | code trace | Negligible: about 3 function calls/tick when wear is on | pass tyreGrip in the ctx (pf.tyreMu) | high | NEW |
| P6 | RaceControl.holdCap does ranked.indexOf(c) per AI car per tick under VSC/SC (race-control.js:686), O(n^2). c.rank-1 is the index for a running car (game.js:4598; rankFinishers permutes only finisher slots). | code trace | Negligible at 22 cars (est. ~240 compares/tick) | use `c.rank - 1` with an `ranked[i] === c` check and an indexOf fallback | high (mechanism), est. | NEW |

## Not done
- ai-drive.js (1942 lines): outline plus the export scan only. Behaviour functions were not read line by line.
- pit-lane.js beyond 495-635 and 1560-1600; collide.js beyond the 77e5072f2 hunks; incident-sim, wall-clamp, wall-end-face, debris-world, aero-zones body, the race/* UI/radio modules; game.js AI branch 5000-5800 not traced.
- No VM determinism run (game-vm.cjs) and no allocation measurement: P2, P5 and P6 costs are estimates.
