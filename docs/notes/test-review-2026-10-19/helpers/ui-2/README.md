# ui-2 test-review helpers
- `run-spec.sh <spec-basename> [--grep ...]`: one Playwright spec via `npm test`, log in `artifacts/test-review/ui-2/spec-<name>.log`, final `= run rc=N wall=Ns` line. `test-bg.mjs` takes GROUP names only, not spec paths.
- Browser debugger recipe used: `node tools/mcp/debug-chrome.mjs start`, `debugger_attach`, `debugger_logpoint` on `http://127.0.0.1:3456/js/<file>?v=dev` lines, `debugger_run` a `race()` through `__apex`, `debugger_logpoint_read`, then `debugger_detach` and `debug-chrome.mjs stop`. Never beside a spec run.
- Subset of a long spec: `run-spec.sh hud-layout --grep "<describe names joined by |>"`.
