# Live debugger hunt — 2026-10-16

Exploratory runtime bug hunt driven by the js-debugger MCP (CDP, headless Chromium + SwiftShader, no real GPU —
nothing here is a player-GPU or long-session claim). Orchestrator `claude:session_013meHKLoGb66QWDCy9zMdPn`, worker
`claude:session_01KXgRNxiNG3mXz2wkEXDbTM`, branch `cursor/live-debugger-hunt-4c7e`.

Not re-reported: `docs/BUGS.md`, `DEFECT-LEDGER.md`, `BUG-HUNT*.md`, and the 7 findings a sibling is fixing (apex.js
aiPlace prog / reset delete, lobby.js pollTimer, hub.js double open, real-race-tab forgetRaw memCache, tlx.js
create-throw listener leak, game.js passHunger alloc).

## Setup

- `python3 -m http.server 3456`; Chrome `--remote-debugging-port=9222 --user-data-dir=scratch/debug-chrome`, headless
  new, SwiftShader. Attached via `debugger_attach`; `debugger_exceptions all` (caught included).
- Trap 1: `game.js?v=dev` line 6271 (`updateCarBicycle`, after `c.px/c.pz` integrate; resolves to 6274:14), condition
  `!Number.isFinite(c.speed) || !Number.isFinite(c.px) || !Number.isFinite(c.pz)`.
  Liveness proven by swapping the condition to `c.speed > 25`: it paused on the natural rAF loop (`tick` → `tickBody`
  → `update` → `updateCar` → `updateCarBicycle`), then the NaN condition was restored.

## Scenario matrix

| scenario | vegas | monaco | spa | singapore | + 2 more |
|---|---|---|---|---|---|
| race+go+300 steps | no pause | no pause | | | |
| pit stop | | | | | |
| restart | | | | | |
| circuit switch | | | | | |
| WATCH/replay | | | | | |
| garage open/close | | | | | |
| career quick race | | | | | |
| GLX vs TLX | | | | | |
| tab hidden/visible | | | | | |

## Findings

### Tool observations (js-debugger MCP — not patched, `tools/mcp/` is forbidden)

- T1. `debugger_scripts {filter:"game.js"}` returned `[]` after a race build while the page was still running game.js:
  the 200-row cap fills with ~200 anonymous (`url:""`) scripts and the real script drops out; the breakpoint then
  reports `locations: []` yet is still armed (it paused). Misleading for an agent that trusts `locations`.
- T2. Every `debugger_state` / `debugger_control` response repeats all completed operation results (a 10 KB
  `Object.keys(__apex)` result is re-sent each time). Response-size problem; sibling #2534 owns it.
- T3. `debugger_run` is refused while paused (`Use debugger_evaluate while paused`) — correct, but means a step-driven
  repro must be started before the breakpoint is armed.

### Faults

_(none confirmed yet)_
