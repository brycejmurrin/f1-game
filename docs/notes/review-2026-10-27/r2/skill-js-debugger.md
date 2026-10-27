VERDICT: FIX — routing, paths and tool schemas are accurate; the skill never says that a condition runs in the paused frame, or how to reach a speed-gated pause in a race, so the headline ask times out silently.
METRICS: SKILL.md 115 lines / ~6.3 KB; description 271 chars; references 2 (tools.md 44 lines, step-loop.md 47 lines), one level deep. Server: 23 tools (`js-debugger-mcp.sh list-tools`).
PATHS: OK. These exist: docs/research/AGENT-JS-DEBUGGER-MCP.md (recipe §"Starting a pause in the game" :194), docs/AGENT-SURFACE.md#bootstrap-auto-setup (:19), docs/TESTING.md §Debug a Node test (:330), .claude/hooks/mcp-browser-guard.sh (regex :52 covers `js-debugger__.+`), tools/mcp/debug-chrome.mjs, tools/check/skill-smoke.mjs (`--skill`/`--check` :18-19), tools/mcp/js-debugger-mcp.sh (subcommands list-tools/status/serve-http/call/smoke).
COMMANDS: OK. `debug-chrome start --headless-game --device phone-landscape|desktop` and `status|stop` match its --help. Every tool name the skill cites exists in the server schema: break, collect, node_test, targets, attach, scripts, source, breakpoint{url,line,column,condition}, run{expression,awaitPromise,timeoutMs}, state, evaluate{pauseToken,frame,allowSideEffects}, properties, control, exceptions{none/uncaught/all}, logpoint(+_read), exception_log, listeners, instances, profile{start/stop/status/hitch}, remove_breakpoint, detach. `waitMs` default 1500 is still correct (js-debugger-mcp.mjs:39). node_test caps `files` at 8 (:69), as cited.

## Gaps (severity | file:line | problem | fix)
1. HIGH | step-loop.md:14-15, SKILL.md:81-82 | Nothing says the condition is evaluated in the paused frame, or that a condition that throws (e.g. a bare `speed`, which is not in scope) silently never pauses. `debugger_break` then just times out (default 10 s, js-debugger-mcp.mjs:60). | Add one line: "A condition is an expression in the frame (`c.speed`, not `speed`). A throwing condition never pauses, so test it first with debugger_collect or debugger_evaluate."
2. HIGH | step-loop.md:36-38 | The in-race recipe (reference :201) gets a race running, but nothing gets the player to a speed. With no input the human car stays slow. updateCar runs for every car on every tick (game.js:4633), so an unscoped `c.speed > 80` pauses on an AI car, possibly before go. | Add the steps: scope the condition with `c.human &&`, and drive the player (the autopilot or throttle hook from `__apex.agentHelp()`). Raise `timeoutMs` (max 30000) or use `keep`.
3. MED | step-loop.md:14 | No unit or PACE guidance. `c.speed` is m/s (game-code.md: metres), so "80" from a user is ambiguous (80 m/s = 288 km/h). AGENTS.md §Physics says to compare speeds via `vTop()`/`vStd()`. | Add one sentence: convert the user's units (`80/3.6` for km/h) and quote the threshold back to them.
4. MED | tools.md:33-34 | "Probe a body line, not the function header" is given for Node probes only. For a page breakpoint on updateCar (header :4820), the useful locals (`hw`, `slopeSin`) start after the early-outs (:4832-4853). | Generalise it: break on the first body statement past the early returns you care about.
5. LOW | SKILL.md:3 | The description starts "Use when…" (imperative, not third person). | "Debugs JavaScript via the js-debugger MCP: …" Keep the mcp-probe hand-off (mcp-probe:3 points back here with "Breakpoints → js-debugger"; no fight).
6. LOW | step-loop.md:23 | The skill lists control actions over/into/out/resume, but the schema also has `pause` and `cancel` (js-debugger-mcp.mjs:40). `cancel` appears only in tools.md:22. | List all six actions.
7. LOW | SKILL.md:52-60 | Only the CLI form is given. apex-tools has `apex_debug_chrome` (apex-tools-mcp.mjs:575), and `debugger_targets`/`attach` take no endpoint when debug-chrome runs (schema). | Add "MCP: apex_debug_chrome; endpoint optional".
8. LOW | SKILL.md (absent) | `debugger_incident` (exception → JPEG + `__apex` state) is never mentioned. | Add one bullet in tools.md §Without pausing.
9. LOW | step-loop.md:13 | The example `?v=1695` is stale: the shell ships `?v=dev` (game-code.md). | Use `?v=dev`.
10. LOW | SKILL.md:45 | "`apex_status` reports `server.stale`": apex_status's stale check covers apex-tools' own watched files (apex-tools-mcp.mjs:2293-2298). Not verified that the js-debugger files are in that watch set. | Check, or say "restart after editing js-debugger-*.mjs" without the apex_status claim.

## FIRST-WRONG-STEP
Ask: "set a conditional breakpoint in updateCar when speed > 80 and inspect the locals".
- Routing (SKILL.md:81 → `debugger_break`) and lookup are fine. code-nav finds `function updateCar(c, dt, ranked)` at js/game.js:4820, and bare url `js/game.js` matches by suffix.
- FIRST WRONG STEP: writing the condition (step-loop.md:14). An agent following the skill writes `speed > 80`. The real field is `c.speed` (game.js:4838 and later). The bare name throws in the frame, the breakpoint never pauses, and debugger_break times out after 10 s with nothing pointing at the condition.
- Even with `c.speed > 80`, three problems remain:
  - It fires on AI cars (updateCar is called per car, game.js:4633).
  - The units are m/s, not km/h, and not PACE-relative.
  - The player never gets to speed without a drive input the skill never mentions.
- The tool that takes the condition is `debugger_break.breakpoints[].condition` or `debugger_breakpoint.condition`; both exist.

## COVERED / NOT COVERED
COVERED:
- SKILL.md and both references read in full.
- The .mcp.json entry and the wrapper sh.
- The full tool schema list (`list-tools`).
- js-debugger-mcp.mjs defs for control, break, collect and node_test; session.mjs for the pageUnresponsive and unowned wording.
- debug-chrome --help; skill-smoke flags; mcp-browser-guard regex.
- Anchors in the reference doc, AGENT-SURFACE and TESTING.
- The mcp-probe description (routing); updateCar's location and speed field.
NOT COVERED:
- The tool behaviour itself: nothing was run, no browser.
- Whether `apex_status`'s stale watch includes the js-debugger files.
- Whether AGENT-JS-DEBUGGER-MCP.md below :200 contradicts the skill.
- `__apex` drive/autopilot hook names.
- skill-smoke fixture content.
