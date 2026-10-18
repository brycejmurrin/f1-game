# js-debugger — non-pausing tools, long runs, workers

Load from SKILL.md when a pause is the wrong instrument (hot loops, leaks) or a
run is long, hung, or targets a worker.

## Without pausing (hot loops, leaks)

- `debugger_logpoint` records a value per hit into a bounded ring; read it with
  `debugger_logpoint_read`.
- `debugger_exception_log` (start/read/clear/stop) collects exceptions without pausing.
- `debugger_listeners` and `debugger_instances` report counts across restarts.
- `debugger_run` is always mutating (no `allowSideEffects`; only `debugger_evaluate`
  has it), and a new run abandons a hung one.
- `debugger_scripts` hides anonymous scripts and reports `total`/`truncated`.

## Long runs

- Chunk long loops: a `race()` loop or minutes of `headless(false)` blocks the page;
  `debugger_state` then shows `pageUnresponsive`. `debugger_control cancel` ends the
  script; then reload.
- A `timeoutMs` deadline leaves the op `timedOut` but tracked; page JS is not
  cancelled and its late result still lands.

## Targets and viewport

- `debugger_targets targetType:"service_worker"|"worker"` reaches `sw.js` and workers.
- `node tools/mcp/debug-chrome.mjs start --device phone-landscape|desktop` guarantees
  the viewport (default `phone-landscape`, 844x390 touch; see `status`).
