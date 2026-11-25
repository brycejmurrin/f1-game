# Mode B — scripted play

## Contents
- Flows · After every transition · Errors · Calibration case

## Flows

Drive the game the way a player does: real menu ids from `index.html` (`.click()` through `debugger_evaluate`, or
chrome-devtools `click` in a chrome-devtools pass) plus `__apex` for state you cannot click. The bridge (`js/agent/apex-bridge.js`) has no tap
command today; PR #6389 proposes a TAP_OK list. If it lands, that list is the canonical set of tappable ids: reuse
it so a flow can replay on Bryce's phone through skill `phone-bridge`. Cover at least: quick race, time trial (garage → track), season
weekend entry, restart, quit to title, settings round-trip mid-race.

## After every transition

1. `__apex.awaitPresent()` — a real frame is on screen.
2. Read `info()`, `viewState()`, `lightState()`, `scene({visible:true})`, `diag({download:false})` and
   `logs()` (docs/DEBUG-HOOKS.md).
3. Non-black check: `render({what:"view"})` must show the scene, and the mean of a `#game-soft` pixel sample
   (`getImageData` through `debugger_evaluate` / `evaluate_script`) must be above near-black; a black frame with `glCaps.lost` false is a
   finding, with the state that produced it.

## Errors

js-debugger `debugger_exception_log` (start before the flow, read after each transition) or `debugger_exceptions`
(pause on uncaught); caught-and-logged errors are in `__apex.logs()` (or `list_console_messages` in a chrome-devtools
pass). Each throw gets its stack, the
transition that raised it and the file:line.

## Calibration case

Issue #6390 (black time-trial garage) is a known positive: run it first. A hunt that does not reproduce it has a
broken read-out; fix the read-out before trusting a clean run.
