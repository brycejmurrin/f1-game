# Simulation project map

## Goal
Map `js/physics/` and `js/race/` from a fresh, bounded source inspection. This is a navigation map, not a correctness audit or proof that comments describe all current runtime behavior.

## Source identity
- Checkout: `/workspace/f1-game`; branch `cursor/project-map-a84f`.
- Source HEAD: `ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb`; inspected 2026-10-27 UTC.
- Read root `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`; no browser, source changes, tests or commits in this lane.

## Inventory
61 JavaScript files, 22,553 logical lines: 20 physics modules and 41 race modules. Counts use Python splitlines(), including comments and blanks; wc -l reports 22,552 newline characters (one final line lacks a newline). Module responsibilities below are primarily header-derived unless a body range is stated.

## Architecture and data flow
The project uses script-global IIFEs. Root engineering instructions identify `js/game.js` as the orchestration entry and the live `G` facade as its module contract. LSP confirms `PlayerForces.create` and `DriveTune.create` are called there.

`DriveTune.create()` returns mutable tuning defaults. `PaceMath.create(deps)` obtains live PACE, bare VMAX, cars, track and race-control through getters; `vTop/vStd/aStd` normalize the ground-speed scale, while aero/ERS/gearing helpers derive per-car values. Its pace reference buffer is keyed by cars-array identity.

The player-force seam receives an existing car plus an explicit tick context. Observed code reads tunables through `G`, rejects invalid dt, derives axle grip, uses `Vehicle.grip` for `GripSteer.forPlayer`, and integrates lateral velocity, yaw and heading. Low-speed yaw uses four substeps and a smooth blend. The inspected ending applies longitudinal coupling. Header says Frenet world writeback remains in game.js; the calling body was not traced here. AI drive is a separate decision subsystem; its implementation was not audited.

Boundary/contact responsibilities are divided between WallClamp (per-tick driving bounds), WallEndFace (forward encounters with abruptly narrowing barriers), ContactGeometry (geometric queries) and Collide (car contact/post-contact pose handling). WallEndFace restores prior s and scrubs speed while leaving lateral position. IncidentSim advertises temporary motion ownership; DebrisWorld advertises render-only rigid-body debris. Those ownership claims were not fully traced.

RaceControl exposes common crossing/finish/classification rules. Its inspected opening queues crossing entries and sorts by crossing time before finalizing flags, avoiding roster-order dependence. SportingRegs, pit state, tyres and reliability are separate policy/model seams. SessionEntry supplies generation-based async ownership: duplicate pending starts share a promise, superseded preparation cannot commit, validation failure recovers, and callers can inspect explicit outcomes.

WeatherArc owns live weather/arc progression; RainCells supplies localized-rain maths and Storm/Wind supply environmental policy. RaceFacts → RaceRadio → RadioLines is the advertised facts/rules/phrasebook split; AnnounceBanner presents queued calls. RealRace directs timing-script pace, while RealReplay owns trace-driven replay poses/clock and Broadcast observes them for TV direction. These latter paths were read at header level only.

## File-by-file coverage
“Partial” always means the remainder is unread; an outline is not a full read. All files had at least an opening/header sample. The first broad header command was truncated, so conservative guaranteed coverage for ordinary rows is lines 1–3 (the compact repeat covered all race openings); physics opening samples were visible through all 20 physics modules.

| File | Lines | Responsibility | Coverage |
|---|---:|---|---|
| `js/physics/aero-zones.js` | 260 | Fixed active-aero activation zones | Partial: 1–14 |
| `js/physics/ai-band.js` | 77 | Scripted/catchup AI pace policy | Partial: 1–14 |
| `js/physics/ai-corridor.js` | 97 | Reachable passing-lane maths | Partial: 1–14 |
| `js/physics/ai-drive.js` | 1950 | AI racecraft decisions | Partial: 1–14 |
| `js/physics/body-attitude.js` | 224 | Cosmetic suspension attitude | Partial: 1–14 |
| `js/physics/brake-cue.js` | 144 | Braking cue timing | Partial: 1–14 |
| `js/physics/collide.js` | 886 | Car contact resolution and pose writeback | Partial: 1–14 |
| `js/physics/consts.js` | 331 | Immutable driving constants | Partial: 1–14 |
| `js/physics/contact-geometry.js` | 164 | Road bounds and oriented-box geometry | Partial: 1–14 |
| `js/physics/debris-draw.js` | 134 | Debris pool drawing | Partial: 1–14 |
| `js/physics/debris-world.js` | 1336 | Rapier render-debris side-world | Partial: 1–14 |
| `js/physics/drive-tune.js` | 27 | Mutable driving tune defaults | Fully read (1–27) |
| `js/physics/grip-steer.js` | 142 | Own-state assist steering cap | Partial: 1–14 |
| `js/physics/incident-sim.js` | 543 | Temporary incident motion ownership | Partial: 1–14 |
| `js/physics/player-forces.js` | 458 | Human tyre forces and yaw/lateral integration | Partial: 1–14, 25–85, 195–225, 395–457; LSP outline |
| `js/physics/tyre-model.js` | 1072 | Tyre wear, grip and fuel model | Partial: 1–14 |
| `js/physics/vehicle.js` | 23 | Reusable tick scratch objects | Fully read (1–23) |
| `js/physics/wall-clamp.js` | 261 | Driving boundary constraints | Partial: 1–14 |
| `js/physics/wall-end-face.js` | 48 | Barrier end-face handling | Fully read (1–48) |
| `js/physics/wheel-state.js` | 278 | Optional axle rim speed/slip | Partial: 1–14 |
| `js/race/announce-banner.js` | 184 | Priority announcement queue | Partial: 1–3 |
| `js/race/broadcast.js` | 497 | Replay director and timing tower | Partial: 1–3 |
| `js/race/car-fields.js` | 272 | Predeclared car state fields | Partial: 1–3 |
| `js/race/daily-challenge.js` | 199 | Date-derived time-trial challenge | Partial: 1–3 |
| `js/race/damage.js` | 158 | Impact-derived damage readout | Partial: 1–3 |
| `js/race/driving-coach.js` | 804 | Driving feedback and solo practice | Partial: 1–3 |
| `js/race/duel.js` | 158 | Single-rival practice format | Partial: 1–3 |
| `js/race/engineer.js` | 537 | Tyre/pit engineer advice | Partial: 1–3 |
| `js/race/flying-start.js` | 119 | Rolling qualifying/time-trial start | Partial: 1–3 |
| `js/race/forecast.js` | 191 | Weather uncertainty forecast | Partial: 1–3 |
| `js/race/jump-start-penalty.js` | 71 | False-start detection | Partial: 1–3 |
| `js/race/lap-record.js` | 23 | Lap and sector mutable state | Fully read (1–23) |
| `js/race/light-tune-edit.js` | 43 | Lighting tuner persistence path | Partial: 1–3 |
| `js/race/marshal-panels.js` | 146 | World flag panels | Partial: 1–3 |
| `js/race/overtake-mode.js` | 155 | Detection/activation-line allowance | Partial: 1–3 |
| `js/race/pace-math.js` | 110 | Speed normalization, aero, ERS and gearing | Fully read (1–110) |
| `js/race/pit-lane.js` | 2081 | Pit state machine and strategy | Partial: 1–80; 25–60 re-read |
| `js/race/quali-model.js` | 463 | Qualifying model | Partial: 1–3 |
| `js/race/quali-net.js` | 259 | Peer qualifying readiness | Partial: 1–3 |
| `js/race/race-control.js` | 744 | Flags, finish crossing and classification | Partial: 1–110; LSP outline |
| `js/race/race-facts.js` | 400 | Timing facts and edge events | Partial: 1–3 |
| `js/race/race-insights.js` | 636 | Stint/energy advice and drills | Partial: 1–3 |
| `js/race/race-radio.js` | 777 | Situation rules for radio | Partial: 1–3 |
| `js/race/race-settings.js` | 742 | Session settings sheet | Partial: 1–3 |
| `js/race/radio-lines.js` | 247 | Radio phrasebook | Partial: 1–3 |
| `js/race/rain-cells.js` | 159 | Localized drifting rain maths | Partial: 1–3 |
| `js/race/real-race.js` | 970 | Real timing-script pace director | Partial: 1–3 |
| `js/race/real-replay.js` | 758 | Trace-driven replay clock and poses | Partial: 1–3 |
| `js/race/reliability.js` | 105 | Failure risk planning | Partial: 1–3 |
| `js/race/session-entry.js` | 60 | Async preparation/commit ownership | Fully read (1–60) |
| `js/race/session-records.js` | 140 | Comparable lap configuration | Partial: 1–3 |
| `js/race/session-stub.js` | 157 | Lazy-session global placeholders | Partial: 1–3 |
| `js/race/setup-trial-session.js` | 97 | Fresh solo setup trials | Partial: 1–3 |
| `js/race/sporting-regs.js` | 306 | Sporting compliance rules | Partial: 1–3 |
| `js/race/spotter.js` | 161 | Alongside-car occupancy and voice | Partial: 1–3 |
| `js/race/start-lights.js` | 145 | Start gantry lamps | Partial: 1–3 |
| `js/race/storm-flash.js` | 77 | Per-frame flash/thunder state | Partial: 1–3 |
| `js/race/storm.js` | 101 | Storm tables and lightning schedule | Partial: 1–3 |
| `js/race/tv-graphics.js` | 103 | Broadcast graphic overlays | Partial: 1–3 |
| `js/race/weather-arc.js` | 527 | Live weather and dynamic arc | Partial: 1–3 |
| `js/race/wind.js` | 216 | Seeded wind and gust effects | Partial: 1–3 |

## LSP evidence
Attached private F1 Cloud `apex-lsp` tools answered successfully (not a shell text-search substitute):
- `lsp_outline(file: js/physics/player-forces.js, limit: 25)`: PlayerForces at line 13; exports `tyreSat` line 21 and `create` line 30; five internal members omitted.
- `lsp_references(PlayerForces.create, concise, limit: 12)`: 3 references in 2 files, including `js/game.js:3473:35` use and module definition/export lines 30/456.
- `lsp_outline(file: js/race/race-control.js, limit: 30)`: 20 exports and 29 internals; exported finish/crossing/order functions, `create:246`, `scQueueFrac:682`, `holdCap:729`. Internal bodies remain unread.
- `lsp_references(DriveTune.create, concise, limit: 10)`: 3 references in 2 files; `js/game.js:355:29` use and module definition/export lines 6/25.
No diagnostics were requested because no executable files changed. Remote tool source identity was not independently compared with local HEAD; line correspondence supports navigation but is not a SHA attestation.

## Comment findings with proof
- **Historical narrative can mislead a partial reader.** `js/race/pit-lane.js:33–41` says the lane is longitudinal only, lacks garages and reads no geometry. The same header at lines 53–59 explicitly supersedes this: TrackPit now builds a physical complex and geometry-free arithmetic is fallback. This is proven internal narrative tension, not proof of a runtime defect. Consider collapsing the history into a short present-tense contract plus a history link.
- **Scratch ownership contract is explicit and partly corroborated.** `js/physics/vehicle.js:3–8` says caller fills reused bags and callees copy their fields. `player-forces.js:210–214` fills Vehicle.grip before the call; text scan also found Vehicle.wheel at line 248. Callee non-retention was not audited; preserve that as an unchecked contract.
- **A follow-up marker is not a confirmed bug.** `drive-tune.js:19–21` calls WHEEL_STATE opt-in and says game.js mirror is follow-up. `player-forces.js:203` gates behavior directly through `WheelState.enabled()`. This supports two distinct control surfaces, but does not establish that the follow-up is still needed; trace settings/dev API before changing it.
- The bounded TODO/FIXME/HACK/follow-up text scan found the DriveTune follow-up but no TODO/FIXME/HACK markers in these directories. Absence of such markers is not evidence of completeness.

## Risks/unknowns
Only six files were fully read. Large implementation bodies (AiDrive, TyreModel, DebrisWorld, PitLane, replay, coaching/radio) remain largely unread. Header-derived responsibilities can lag code. Eval-time load edges, lazy placeholder replacement, network determinism, player assists-off invariants and competing pose owners require targeted follow-up. No gameplay, numerical stability, performance, test adequacy, load order or renderer behavior is validated by this map. Total source size is an inventory, not a maintenance risk score.

## Next steps
1. Trace one tick from game.js through player/AI, incident, collision and line-crossing owners using LSP callers/references; record authoritative write order.
2. Trace PitLane’s TrackPit-backed versus fallback execution and shorten the historical header if documentation cleanup is requested.
3. Audit scratch non-retention in GripSteer/WheelState and the WHEEL_STATE settings/dev-API seam.
4. Map focused existing unit/spec coverage before any behavioral edits; no browser work is required for this documentation pass.
