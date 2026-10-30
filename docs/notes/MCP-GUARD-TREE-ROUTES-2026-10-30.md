# mcp-browser-guard: allow tree routes (PR #4252 Proposal P3)

Status: NOT IMPLEMENTED. The auto-mode classifier denied the edit of `.claude/hooks/mcp-browser-guard.sh`
twice as [Self-Modification], the second time with Bryce's relayed go (2026-10-30, "Relay your go to it").
The denial is final; this note holds the planned change for whoever may edit the hook.

Decision (Bryce, 2026-10-30 ~17:03Z): option (b), "Read tool_input", so the guard reads `tool_input` the way its
`debug_start` branch does. Real browser calls stay refused inside subagents.

## Plan

In the guard's python block, before the `BROWSER.match` check, exit 0 when:

- `name == mcp__js-debugger__debugger_node_test`
- `apex_eval` and `tool_input.vm is True`
- `apex_diagnostics` and `op` (default `capabilities`) is `capabilities` or `query`
- `apex_job_start` and `kind` is one of `frame_fleet`, `parts_sweep`, `livery_contrast`, `verify_change_fast`,
  `verify_all`, `float_all`, `graph_parity_all` (the `browser:false` plans in `tools/mcp/apex-extras.mjs`)

Everything else stays refused (`apex_eval` without `vm:true`, `apex_diagnostics op:run`, `hud_shot`, `profile`,
`apex_job_start` with no kind, other `debugger_*`).

Tests: one row per allowed call and per still-refused call in `tests/unit/bash-guard-hardening.test.mjs`
(next to the `debug_start` rows). Docs: extend the `mcp-browser-guard.sh` clause in `.claude/rules/claude-config.md`.
Verify: `node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet` plus that test file.
