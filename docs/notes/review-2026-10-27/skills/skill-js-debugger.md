VERDICT: FIX — tool names and paths all check out, but the skill has no worked `debugger_break` example, and the Sonnet fix it proposed would be refused by the schema (`captureLocals` is not a `debugger_break` arg).
METRICS: SKILL.md 114 lines / 6430 B (~1.6k tok); references/tools.md 43 / 2371; references/step-loop.md 46 / 3211; description 279 chars; 2 reference files, one level deep.
PATHS: OK. The `#bootstrap-auto-setup` anchor resolves to docs/AGENT-SURFACE.md:19 "## Bootstrap (auto-setup)". docs/TESTING.md:330 "### Debug a Node test" exists. The reference doc, skill-smoke, debug-chrome and js-debugger-mcp.sh all exist.
COMMANDS: OK. Every tool the skill cites is defined in tools/mcp/js-debugger-mcp.mjs:26-88. Stale flags: none. Nit (confirms Sonnet #4): debug-chrome.mjs:3's Usage line omits `--headless-game` and `--device`, which SKILL.md:52 and tools.md:42 cite.
ARG CHECK (schema additionalProperties:false, js-debugger-mcp.mjs:23):
- `debugger_break` (:57-63) takes breakpoints[{url,line,column?,condition?}] (max 10), trigger, awaitPromise, timeoutMs (100-30000, default 10000), frames (0-3, default 1), executionTimeoutMs, maxLocals, resume, keep. It has NO `captureLocals`. `captureLocals` exists only on `debugger_node_test` probes (:71). Locals come back automatically for `frames` top frames (workflow.mjs:114).
- `debugger_breakpoint` takes url, line, column, condition. `debugger_control` takes action (pause|resume|over|into|out|cancel), pauseToken, waitMs. `debugger_evaluate` takes pauseToken, frame, expression, allowSideEffects. All match step-loop.md. Aliases `token`→pauseToken and `frameIndex`→frame are accepted (:93).
- A bare `js/game.js` url works on a page target: session.mjs:41 builds a suffix urlRegex with an optional `?v=`.
WALKTHROUGH ("conditional bp in updateCar when speed > 80, inspect locals"): SKILL.md:81 routes to `debugger_break {breakpoints, trigger}`, but an agent then has to guess four things. (1) The field: updateCar(c, dt, ranked) at js/game.js:4820 has no `speed` local. The field is `c.speed`, in m/s (apex.js:1749 `speed*3.6` = kph). Sonnet's `c.v` does not exist in game.js (0 hits). "80" is ambiguous: 80 m/s is 288 km/h, 80 km/h is `c.speed > 22.2`. (2) The line: use the first body line 4821 (`const S = _ucS;`), not the header. (3) The trigger: a real race must be started inside the trigger (race(id,…)+go(); reference §Starting a pause, :196-206). Only step-loop.md:36 mentions this, and it defers the recipe. (4) The timeout: reaching 80 m/s from a standing start can take more than the default 10 s, so pass `timeoutMs:30000`. An idle player car never reaches that speed, so the hit will be an AI car (add `c.isPlayer &&` only when there is input).
Exact sequence the skill should show:
  1. debugger_targets {"endpoint":"http://127.0.0.1:9222"} → debugger_attach {"targetId":"<page id>"}
  2. lsp_definition {"symbol":"updateCar","body":true} → confirm the line (4820 header, 4821 first body line)
  3. debugger_break {"breakpoints":[{"url":"js/game.js","line":4821,"condition":"c.speed > 80"}],
       "trigger":"(async()=>{__apex.headless(true);const r=__apex.race('bahrain','day','dry');await __apex.go();return r;})()",
       "timeoutMs":30000,"frames":1,"maxLocals":40}
     → reply: cause, stack, locals {c, dt, ranked, S…}, token. Check breakpoints[0].locations is non-empty.
  4. debugger_evaluate {"pauseToken":"<token>","expression":"({speed:c.speed,kph:c.speed*3.6,id:c.id,gear:c.gear,isPlayer:c.isPlayer})"}
  5. debugger_control {"action":"resume","pauseToken":"<token>"} → debugger_state until the trigger op is terminal
  6. debugger_remove_breakpoint {"id":"<bp id>"} (or resume:true in step 3) → debugger_detach {}
STRUCTURE: Within limits; no line over 400 chars, no dates. Unclear text:
- step-loop.md:11-13 says "Preserve the returned URL including its query suffix", then the next sentence says a URL without a query "matches every ?v=". These contradict. Rewrite: "Pass the repo path (`js/game.js`) or the full URL; either matches every `?v=` copy. Use the exact URL only to pin one copy."
- SKILL.md:81 "`debugger_break {breakpoints, trigger}`" shows no argument shape. Rewrite as the step-3 JSON above, plus: "conditions run in the paused frame, so name params/fields (`c.speed`, m/s), and break on a body line, not the `function` line."
- SKILL.md:20-22 duplicates the no-subagent rule from AGENTS.md rule 10, but it is hook-backed and cites the hook. Fine.
- SKILL.md:88-110 ("Confirm a bug and finish") is generic lifecycle prose; it could move to a reference (Sonnet #2, agreed; low value).
ENFORCEMENT: The subagent ban is enforced (mcp-browser-guard.sh). Unknown args are refused by validate(), so a wrong `captureLocals` fails loudly instead of being ignored, which is good, but the docs must not suggest it. Restart-on-stale (SKILL.md:44-47) is prose only; apex_status reports it, which is enough.
SONNET GAPS: #1 CONFIRMED but its fix is WRONG (`captureLocals` is node_test-only; `c.v` is not a field; it should be `c.speed`, m/s). #2 CONFIRMED (low priority). #3 CONFIRMED: `debugger_incident` (mcp.mjs:30) is absent from SKILL.md and tools.md. #4 CONFIRMED (debug-chrome.mjs:3). #5 REFUTED: the anchor exists (AGENT-SURFACE.md:19).
GAPS (ranked, each PR-sized):
1. SKILL.md:81-82: add the worked `debugger_break` JSON (step 3 above) with condition, a body line, a race trigger, timeoutMs, and the units note. Do not add `captureLocals`.
2. references/step-loop.md:11-13: resolve the contradictory URL guidance (rewrite above). Also add that `debugger_break` replaces steps 3-4 for a single pause.
3. references/tools.md:6-17: add a `debugger_incident` line (exception-log entry + Apex state + JPEG under scratch/debug-incidents; call while the page is running).
4. references/step-loop.md:36-38: inline the race-start trigger expression from AGENT-JS-DEBUGGER-MCP.md:201 instead of "Recipe … in the reference"; the trigger is required for any in-race breakpoint.
5. SKILL.md:88-110: move the finish/cleanup/evidence prose to references/finish.md (optional trim).
OUT OF SCOPE: tools/mcp/debug-chrome.mjs:3 — the Usage line omits --headless-game / --device. tools/mcp/js-debugger-mcp.mjs:37 — the `url` description says "Exact script URL, including query if present", but session.mjs:41 accepts a bare repo path; the schema text understates the behaviour.
