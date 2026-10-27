# Game entry: complete middle range map

## Source and complete reading evidence

Fully read `js/game.js:3001–6200` (3,200 consecutive lines) at checkout HEAD `64809115e276d7a2b03ccf5678773a001e817db3`. Reading used eight bounded, untruncated `sed` chunks: 3001–3400, 3401–3800, 3801–4200, 4201–4600, 4601–5000, 5001–5400, 5401–5800, 5801–6200. This is complete coverage, including comments and partial functions at both boundaries; it is not an outline-only pass.

Source SHA-256: `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` (`js/game.js`, 9,554 lines). Contract navigation source SHA-256: `c79b3b7726f51baed438d0c1a3345ad7641b5bd73622bb437f241b2c60205e42` (`types/game-ctx.d.ts`). The contract was navigated with LSP, not fully read in this pass. No runtime edits, browser session, or commit.

## Integration map

| Read range | Responsibilities and cross-module edges |
|---|---|
| 3001–3030 | End-race scoring tail: career versus standalone season settlement; clears spent qualifying classification, saves standalone season, flags result camera and builds results/announcer output. |
| 3031–3466 | Shared `G` façade: live accessors over closure state, stable helpers, deferred calls across construction order, state/mode adapters, persistence setters, render/debug/network/weather/session seams. |
| 3467–3638 | Dependency-ordered module construction: lighting before atmosphere, tyre model before pits, voice before announcer; replay/director/results, HUD, garage/select/car drawing, setup camera/prebuild, shadows/mirror, custom team and scale, career/season/quali/network quali, settings and loading. |
| 3639–3800 | Flyby scenery grid preserves simulation RNG; grid ordering mirrors qualifying/duel/grid rules. Intro generation/settings ownership, visible-time clock, loading-sheet release, garage drive-out, first-present gating, skip and bounded completion. |
| 3801–3980 | Sliced flyby planning and lamp preparation; shader warm retains renderer ownership. Build, warm and ready-world routes converge through garage-out then card/flyby. Async results publish only for a live generation/settings request. |
| 3981–4149 | Covered sheet starts preserve qualification; settings preparation disables owner buttons and waits for lazy daily session changes; `raceIntro` chooses build/warm/garage, seats scenery cars, applies lighting, resolves authored/planned shots and hands off through LoadingScreen. Software raster disables world flyby unless debug override. `loadingInfo` is shared descriptive data for announcer/editor. |
| 4150–4220 | Aero/skids/car FX, driving-line cached circuit/pace API, audio/photo/tuners, incident/contact owners, solo network null objects, body attitude and audio panel. Net null objects retain solo classification/control authority. |
| 4221–4423 | UI helpers and arm-confirm, menu-sheet teardown, rotation pause/blocker synchronization, graphics recovery and full quit teardown. Quit can defer until corrected-time finish settlement; releases incident/track scratch, weather/session/network state, audio/particles and returns title. |
| 4424–4600 | Stable progress ranking, classified finisher rank slots and scratch release; `update(dt)` starts with no-track guard, replay/flying-start/recover then network-or-local countdown. Lights-out consumes shared clock, clears stale drive edges, arms green-time/reaction and race weather/retirement/ranking. |
| 4601–4763 | Frame simulation ordering: flag samples → traffic snapshot/buckets → line-step begin/pits begin → all car steps → pit/reaction/line settle → collisions → incident pre/world/post → line-step end → final flag sample. Last physics step flushes summed presentation dt; finish policy/host classification controls results; continuous audio flushes once per frame, edge SFX per step. |
| 4764–5000 | Pooled AI/player/wall contexts and collision cues; `updateCar` owner exits, tyre/pit/engineer state, aquaplaning/wind/pace/caution/pit limits, AI traffic/strategy and racecraft inputs. |
| 5001–5326 | Traffic results and yields, ERS and detection-line overtake allowance, brake planner, active-aero travel, manual gearbox, longitudinal/lateral/bicycle helpers, wall clamp, presentation cues and advancement handoff. |
| 5327–5521 | Brake planning: human analog pedals and positions-only tow; AI node-aligned cached lookahead/path curvature/bank/grip brake targets, tow/queue/pit constraints, yield/squeeze recovery. |
| 5522–5727 | Longitudinal force integration, surface and braking budgets, throttle/reverse/deploy/regen/launch, gravity and caps, gearbox telemetry, track-limit lap validity/penalties, kerb feedback and observed acceleration. |
| 5728–6029 | Lateral AI controller: line families, attack zones and deterministic mistake hash, pass latch/corridor/defend/yield/unstuck/separation constraints, human safety concession, pit-lane final target, crawl/emergency position loop or grip-bounded heading state. Human steering reads native/scripted input. |
| 6030–6200 | Human bicycle bridge: speed-shaped driver lock, explicit road/line assists, loads/banking/crest modifiers, pooled PlayerForces call, wind and world-velocity integration followed by local track projection. Ends inside AI contact-compliance branch; remainder begins at 6201. |

## Façade and controller contract

`G` is an object of live accessors, not a state snapshot. `state` routes writes through `setState`; `flow` through `setFlow`; seasonMode/timeTrial/practice/raceQuali are compatibility views of authoritative flow/session/grid state. Career save is read through `Career.data()`. Setters may validate, persist, reinitialize cameras or invalidate a derived weather plan, so direct closure writes and façade writes are not generally interchangeable. Deferred arrows permit cyclic menu/garage/module construction while preserving current lazy module instances. `G.netPlay`/`G.netLobby` accessors are necessary for later null-object replacement.

LSP resolved `G.player` to readonly `CarState | null` at `types/game-ctx.d.ts:373`, `G.state` to `GameState` at line 370, and `GameCtx` to line 358. `G.player --files` reported 417 textual façade references in 49 files, with largest consumers apex (215), driving-coach (43), agentview (32), apex-lobby (20), shadow-pass (16); this tool explicitly labels façade usage as text matches. `G.update` resolved to contract line 813, with no external direct textual use found. These are bounded navigation observations, not a claim of full contract-file coverage.

LSP callers confirmed `updateCar` at 4820 is called by `update` at 4633; `updateCarBicycle` at 6030 by `updateCar` at 5236; and `raceIntro` at 4029 by afterGarageOut (3731), startRaceFromSheet (3985), raceIntroFromSheet (3999) and its intro callback (4014). A `PlayerForces.step` shorthand query returned module-file fallback with export/caller coverage explicitly unverified; therefore its actual injected-instance call is established by the full read at 6161, not by that zero-use answer.

The simulation uses separate ownership gates for retired, finished, incident, network and real-race cars before bespoke motion. Input is read at existing physics sites; the time-trial recorder copies those decisions without supplying controls. Pooled `_ucS`/contexts are overwritten synchronously per car and must never be retained or reentered. AI traffic reads snapshots from before any car moves, while collision and incident writeback run after all bespoke car motion. Human world pose is authoritative; road coordinates are a local projection for track queries, timing and walls. The tail map owns advancement and the outer fixed-step/render loop.

## Verified stale comments

- The large bicycle introduction at 5222–5234 says position advances directly in track coordinates and world position is only a derived mirror. The actual human branch at 6174–6190 advances `px/pz` in world space and reads `s/x` back through `trackFrom`; its nearby comments state that world pose is truth. The introduction describes an earlier integration design.
- The PlayerForces bridge comment at 6152 calls the remaining writeback “Frenet world writeback (px/pz → s,x)”: the operation is world-to-track projection, rather than a write into world position. The code unambiguously updates world position first.

## Limits and handoff

Source reading is complete for 3001–6200. Range boundaries intentionally intersect endRace and updateCarBicycle; adjacent boot/tail maps carry their other statements. No GPU/device behavior or physics outcome was exercised. This map records source contracts and directly verified comment/code disagreements, without proposing runtime changes.
