# Live debugger hunt — race weekend and AI racecraft (2026-10-16)

Lane: race weekend + AI racecraft. Owned: `js/race/**`, `tyre-model.js`, `ai-*.js`.

## Honest scope

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
