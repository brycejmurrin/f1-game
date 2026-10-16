# Live debugger hunt — race weekend and AI racecraft (2026-10-16)

Lane: race weekend + AI racecraft. Owned: `js/race/**`, `tyre-model.js`, `ai-*.js`.

## Update — debugger attached (second pass)
Orchestrator's recipe worked: headless Chromium on :9222 + `npx serve`, `debugger_attach`, exceptions paused on **all**.
- **R1: CONFIRMED-LIVE.** Paused inside the page's real `ambientAt` (breakpoint, reached via `startRaceBody` -> `info()` and
  via the per-tick `update`). On the pre-fix module (`53fa2b57`, served and reloaded): a cell arc at its end gives
  ambient 13 -> 30 °C and track 14 -> 48 °C in one step. On the fixed module: 29.915 -> 30 and 47.83 -> 48 (< 0.1 °C).
  (Used the live closure functions `ambientAt`/`trackTempAt` with a synthetic arc; the game's own `weatherArc` hook builds a
  non-cell arc, and a cell needs the plan hash, so the arc object was supplied by hand.)
- **R2: still VM-confirmed only.** Reproducing in the live page needs a practice drill with a storm and 150 s of SC time at
  ~0.4 s per tick; not run.
- **Live scenario run (monaco, 22 cars, dry -> rain arc 120 s, `step(1/30)` x 600, exceptions = all):** no exception paused,
  no lap counter going backwards, no NaN tyre temperature, max |Δ tempS| 2.4 °C per 30 ticks. Evidence: this note.
- **Throughput limit:** SwiftShader page ~5 min wall per 20 s of sim with 22 cars, so full 6-lap races, SC/red-flag/pit
  stress, rescue teleports and classification edge cases on 4 circuits were **NOT** driven. Those need a faster box
  (`/dev/dri` or the llvmpipe CI runner) or `tools/ci` VM harness runs.

## Honest scope (first pass)

No debugger-attached Chrome was reachable (`debugger_targets http://127.0.0.1:9222` -> `fetch failed`; no `/dev/dri`, no
parent-owned CDP browser). So the scenario list (4 circuits, SC/red flag/jump start/rewind/22-car fast-forward, exception
pauses, breakpoints) was **NOT driven**. The two seeded findings were verified against the real modules in the Node VM
(`vm.createContext` with the shipped `tyre-model.js`, `race-control.js`, `storm.js`), which executes the same code
but is not a live-debugger pause. Labelled VM evidence, not CONFIRMED-LIVE.

## R1 — CONFIRMED (VM). Fixed.
`ambientAt`/`trackTempAt` clamp the blend at f = 1 while a cell arc outlives `dur` (`cell.life = dur + 90..330 s`), then the
arc ends (`arc = null`, `raceWeather = from`) ~7 x TAU_DRY after `life`. Failing run before the fix:
`ambient steps 13 -> 30 at the arc end` (track 14 -> 48 °C). Fix: `arcFrac()` decays f as `exp(-(t-life)/36)` after
`cell.life` (36 = weather-arc `TAU_DRY`, the road's own lag), so the residual at arc end is SETTLE (0.005) x 17 °C < 0.1 °C.
Test: `tests/unit/tyre-model.test.mjs` "R1: ... continuous across a local shower's end" (fails before, passes after).
Duplicated constant `TAU_DRY = 36` in tyre-model: a future cleanup could export it from WeatherArc.

## R2 — CONFIRMED (VM). Fixed.
`stormTick` measures `t - stormSince` on `G.raceT`; `restoreWorld` rewinds `raceT` but not `stormSince`. A 100 s rewind
inside a storm kept the SC out 100 s longer (cap SC_ROLL_S=150 -> ~250 s flown). Fix: carry `stormSince` back by the jump
(`stormLastT`, 0.5 s tolerance). Test: `tests/unit/storm-weather.test.mjs` "R2: a practice rewind ...".
Note `wxHeld` itself is not captured/restored by a rewind; out of scope (practice-only).

## Not done
Whole scenario list and all breakpoint triage: needs a parent-owned Chrome with CDP. Re-run this lane when one exists.
