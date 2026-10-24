# Live-debugger race hunt — 2026-10-24 (fleet A, hunter A·H11)

Lane: race flow, physics, `js/game.js`, AI, race weekend (quali, pit, tyres, flags/SC), restarts and
menu→race transitions, reproduced the way Bryce plays (phone landscape 844×390, touch).
Seed: deploy tip `b3779370`. Prior art: agent prior-art-scout over `DEFECT-LEDGER.md`, `docs/BUGS.md`,
`LIVE-DEBUGGER-RACE-2026-10-16/17/22`, the Fleet D `[D·audit]` backlog (#3283 restart plate/governor,
#3287 DSQ finisher, #3290 tail-light refs — not re-reported). Evidence source: `tools/lib/game-vm.cjs`
(the real `js/game.js` in a Node VM, `__apex` hooks) for every deterministic lap; one Playwright
session at 844×390 with touch for the menu→race→pause→restart→quit→race path. Probe scripts are
`scratch/probe-*-ah11.*` (ignored).

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| F2 | `js/game.js:9279` (pm-restart `frozen = true`) / `quitToMenu` 4325–4410 | LOW | CONFIRMED (code), no visible effect found | A RESTART whose start does not commit (onFail → `quitToMenu`, or the `openQuali` arm at 2595) leaves `frozen` true on the title until the next committed `startRaceBody` (2653). Every reader of `frozen` is race/count-gated or dev-only (`skyViewOverride`, env probe, HUD `updateHud(false)`, mirror throttle), and "race" is only reachable through "count", which clears it. Hygiene only; filed here, not fixed (no test can observe it from the player's side). |
| F1 | `js/race/marshal-panels.js:107` + `js/game.js:2513/2653/8236` | — | REFUTED | Claim: an in-race RESTART under a flying flag hands the new race a stale 4 s green flash. `marshalPanels.update` sits behind `render()`, which returns early for the whole restart window (`_carWarm.busy`, then the loading plate's `menuBlank`), so no frame sees level 0 with `_prevLevel > 0`. |
| F3 | `js/race/race-control.js:296` `setEnabled(false)` → full `reset()` | — | REFUTED (dev-API only) | Wipes a flying RED procedure and the scripted holder, contradicting the comments at :375 and :385. The only mid-race caller is `__apex.caution(false)`; `#rs-caution` lives in the pre-race `<dialog id="race-settings">` (no pause-menu, quick-settings or HUD toggle). |
| X1 | `js/game.js:1809` `c.pitPlan` at `gridUp` | — | PROBE ARTEFACT | 8-lap Monza with `__apex.tyres({level:"real"})` called AFTER the grid formed: no AI plans (`pitPlan` null), nobody stopped, all 22 cars DSQ "one dry compound" at the flag. With TYRE WEAR set before the grid (the only player path: the race-settings sheet) all 22 stopped once (lane→box→out 272–655 s), two compounds each, no DSQ. Noted so the next hunter does not chase it. |

## Scenarios run and cleared

| id | scenario | result |
|---|---|---|
| S1 | Monza 4 laps, cautions ON, scripted SC 40→110 s, player car AI-driven | SC deployed and withdrew on the hold; GREEN at release; owed 0; race to results at 536 s; no NaN, no stuck car (the first "stuck" sweep read `c.v`, which does not exist — `c.speed` is the field). |
| S2 | Monza 5 laps, AI-only field, scripted SC 40→110 s | 0 position swaps under SC (6-tick sampling, pit/retired excluded); at release the queue was 15–33 m nose-to-tail at 26–28 m/s; race to results 656.8 s. |
| S3 | quit-to-menu → start again (same VM) | caution, pass-watch debt, pit state, tyre wear/compound/fuel, `raceT`, `paused`, `frozen`, pending timers (23 → 5 → 4) all fresh for race 2. |
| S4 | Time trial ×2 with quit between, AI-driven | solo field (1 car), 3 timed laps each (128.6/123.3/123.6 s), `apex26.ttlb.monza` + `apex26.ghost.v1` + `apex26.inputGhost.v1` written after the first valid lap, ghost loaded on re-entry (`hasGhost` true from the grid). Careful: `__apex.tt()` from inside a running race returns before the new field exists — a probe that does not await the `G.cars` identity change reads the OLD race with `session` already "tt" (22 cars, pos 21/22). |
| S5 | Monza 8 laps, TYRE WEAR real set before the grid | 22/22 AI one stop each, two compounds, no DSQ; player (AI-driven) plan [5] honoured. |
| S6 | Red flag at 150 s (AI-only, 5 laps) | standing restart re-gridded 21 cars on lap 1 at the stopped clock (150.0), green at 150, lap 2 crossings within 14 s, no caution left flying, results sane (3 finishers lap 6, rest classified lap 5). |
| S7 | Human player (policy-driven) under SC, `pit({arm:true})` at 55 s | the arm sets `armed` only; the lane is driven, and the crude policy never entered it — inconclusive for the lane-under-SC case (covered by `tests/unit/pit-lane-vm.test.mjs`). The +5 s at 240 s under green is the track-limits ladder on the policy's cuts. |
| S8 | Full weekend in the VM: grid = quali → SIMULATE → TO THE GRID → race → results → RACE AGAIN → quit → race again | the race gridded in the sheet's order (player P2 from the sheet), RACE AGAIN re-used it with penalties/finishes/stints/caution/pit state all fresh, and after a quit the one-off GP re-qualified (its order is forgotten by design). |
| S9 | Monaco 6 laps, AI-only, cautions ON, scripted SC 60→150 s | no car stuck (stuckT max 1.2 s, ≤ 4 s under 2 m/s all race), 0 swaps under SC, queue 12–40 m at release, 21 classified. (`rescueT > 0` is the stuck TIMER ticking for a moment off the standing start, not a rescue; a rescue is the clamp at `aiRescueDelay`.) |
| S10 | Pause → RESTART at 844×390 touch, SwiftShader | the first press only ARMS the button (`js/ui/pause-opts.js` two-press guard, 5 s window, CONFIRMS on by default): a single tap/click leaves the card open and the race paused — by design, and the same guard QUIT has. Second-press timeline: see S11. |
| S11 | Pause → RESTART (both presses inside the 5 s window), 844×390 touch, SwiftShader | "Race resumed why=restart", the field rebuilt (`race car assets ready` again), lights up in "count" with the pause card down, `frozen` false, HUD and lights shown; first sample 131 s after the press on this software-GL box (not a phone number). The plate-drop/governor symptom on this path is Fleet D's #3283. |

## Round 1 summary

Six-plus angles, no CONFIRMED player-facing defect: S1–S11 all cleared; F1/F3 refuted by the verifier, F2 a code-only leak with no visible effect. Round 2 targets what the VM cannot reach (natural debris cautions, pause/resume countdown) and the remaining physics/AI angles.

## Round 2 (cut short: Bryce 2026-10-24 ~01:10Z "No create new sessions handoff all", relayed by OrchA 32)

| id | scenario | result |
|---|---|---|
| S12 | Overtake gate across an SC (Monza 10 laps, AI-only, SC 40→80 s) + RELIABILITY real | `otEnabled` false from the grid, stays false after the SC is withdrawn until the LEADER's next crossing (lap 2 at 164 s), then true for the rest of the race (B7.2.2c approximation holds). Reliability "real" produced no retirement in 10 laps on this seed (life scales with distance); the one retired car was the benched player. |
| S13 | VSC (level 2) 40→100 s, AI-only Monza | 0 swaps under VSC; field at 35–36 m/s (SC: 26–28); release gaps 12–98 m; GREEN at release, results reached. |
| S14 | Pause / resume | VM: `__apex.step()` calls `update()` directly, so the pause gate (the frame loop's) is bypassed — a VM pause "advances" physics; NOT evidence. Browser (S10/S11): speed stayed constant for the whole paused window. |
| S15 | Jump start: throttle held through the lights | +5 s penalty at green (`JumpStartPenalty`), the car still launches, P3 at 6 s; without the hold, no penalty. By design. |
| S16 | Natural caution (browser, Rapier debris, `__apex.debris(true)` first; headless stepping, AI-only Monza) | first run: `DebrisWorld` is OFF on this software-GL page (`enabled:false, loadState 0`, IncidentSim `rejected.inactive`) — the natural SC path never runs here without the explicit switch. With debris on: a real pile at raceT 128 s escalated YELLOW (hz 4) → VSC (8) → SAFETY CAR (20) within 4 s, then fell SC → YELLOW after exactly `MIN_HOLD` 6 s as the picture settled (hz 3) and GREEN at 145 s. The machine deploys and withdraws as its constants say (`MIN_HOLD = 6`, `SC_MAX` cap); whether a SIX-SECOND safety car is what Bryce wants (F1 holds one for laps / until the queue forms) is a design question, not a defect — handoff item 5. `incident({launch:true})` itself forced nothing (`count 0`) on this page. |
| A1 | AGENTS.md §Physics contract (agent physics-contract-auditor) | pass: every curvature / racing-line read on the player path is behind `ROAD_FOLLOW` (default 0) or `raceLineAssist !== 0` (default 0), or reaches only audio/render; vstd-invariant pass, curvature-channels pass. 22 sites tabled in the agent's report (not copied here). |

Two rounds, no CONFIRMED player-facing defect in this lane.

## Handoff (for the next race hunter)

1. The natural-caution path ran here only with `__apex.debris(true)` (S16): `DebrisWorld` is disabled under software GL. Confirm on a real GPU (gpu-census.yml `macos-latest`, or the phone) that the default-on path raises and withdraws the same way, and read `caution({hazards:true})` through one full `SC_MAX` cap.
2. Human pit stop UNDER the SC (lane entry, pass-watch debt while in the lane) still lacks a VM scenario: reuse `tests/unit/pit-lane-vm.test.mjs` `drive()`/`aimTo()` to enter the lane with `G.holdCaution(3)` flying, then assert `cautionInfo().owed === 0` and `penalty === 0` at the flag.
3. F2 (`frozen` left true after a failed RESTART start) is a one-line hygiene fix in `quitToMenu` if anyone touches that function; no test can observe it.
4. Probe scripts live in `scratch/probe-*-ah11.*` on this container only (ignored); each row above names its scenario so they can be rewritten in minutes.
5. Design question for Bryce: an SC raised by a quick-settling pile is withdrawn after `MIN_HOLD` 6 s (S16). If an SC should hold at least until the field has queued (or one lap), raise `MIN_HOLD` for levels ≥ 3 only in `js/race/race-control.js` with a `tests/unit/race-control.test.mjs` case; the yellow/VSC anti-flicker can keep 6 s.

## CPU profile (VM, 22 cars, Monza, AI-only, 60 Hz, 14 400 ticks) — data for #3109, no change made

2.20 ms per physics tick on this box (`node --cpu-prof scratch/probe-perf-ah11.cjs`, summary `scratch/prof-summary-ah11.cjs`).
Self time: `AiDrive.brakeTarget` 9.3 % (already carries the #3109 ascending-skip), `updateCar` 8.3 %, `updateCarLateral` 4.9 %,
`updateCarBrakePlan` 3.8 %, `car-geometry weld` 2.9 %, `car-shade smooth` 2.7 %, `collide sweepContacts` 2.6 %,
`weather-arc hasTM` 2.4 % (a `typeof TyreModel` probe per wetness read, per car per tick), `vTop` 2.3 %, `race-control lowGrip` 1.4 %
(`TyreModel.treadFor` per read; `otEnabled`/`aeroWetK` call it per car per tick). The last three are memoisable per tick but each is ≤ 2.4 %.
