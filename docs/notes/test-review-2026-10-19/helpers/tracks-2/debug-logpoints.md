# tracks-2 browser debugger recipe (js-debugger MCP, Chrome on :9222)
1. `node tools/mcp/debug-chrome.mjs start` (needs loadavg < 3, no test run).
2. debugger_attach, then debugger_logpoint on:
   - js/agent/apex-track.js `trackGeometry` (line 87): entry used by props-over-road + *-foundation specs
   - js/physics/wall-clamp.js line 41 (`ContactGeometry.wallLimits` call): tracks-walls*, offtrack
3. debugger_run (not _evaluate) with the spec's own calls, e.g.
   `await __apex.race("montreal","day","dry"); __apex.go(); setPhysics({drift:0.3}); step x120`.
4. debugger_logpoint_read; detach; `debug-chrome.mjs stop`.
Result 2026-10-19: trackGeometry hit 1x; wallLimits hit 2684x in 120 steps (AI field).
