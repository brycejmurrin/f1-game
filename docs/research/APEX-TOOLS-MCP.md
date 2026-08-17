# Apex Tools MCP — design

Hosted MCP that wraps committed CLIs under `tools/` against the **local working tree** (or refuses github.io and points at TinyFish). Skills stay in `.claude/skills/`. This is the machine interface so agents stop re-learning flags.

Does **not** replace Chrome DevTools or TinyFish. Does **not** extend `tools/probe-mcp.py`.

Sources: this session’s tool inventory and MCP wrap design. Stdio MCP is JSON-RPC on stdin/stdout; log only on stderr.

---

## Why a new server

`probe` is a passthrough for `chrome_*` / `tinyfish_*`. Mixing a third catalog into that process is how an earlier wrap shipped **0 tools** when TinyFish `ensure()` threw. Every wrap target is Node. Name collision (`chrome_*` / `tinyfish_*`) stays a structural invariant if this is a **fourth** `.mcp.json` entry: `apex-tools`.

| | |
|---|---|
| **Name** | `apex-tools` (`serverInfo.name`: `apex-tools-mcp`) |
| **Lives** | `tools/apex-tools-mcp.mjs` + `tools/apex-tools-mcp.sh` |
| **Transport** | stdio (Cursor); optional HTTP `127.0.0.1:3713` (Cloud) |
| **SDK** | Hand-rolled JSON-RPC like `probe-mcp.py` — **no npm MCP SDK**, no build step |
| **Prefix** | `apex_*` only |

## Local vs deploy

Precedence: per-call `url` → per-call `target` → `APEX_MCP_TARGET` → default `local`.

- **tree** tools (verify-track, bump-cache --check, pick-tests, verify-change --fast): working tree only. `target=deploy` → `tree_only`.
- **browser** tools (shot, survey-track, gfx-probe, apex-eval): local harness / `127.0.0.1`. github.io → `github_io_blocked` (use `tinyfish_*` / `deploy-research`). `__apex` does not exist on a TinyFish fetch.
- Allowed hosts only: loopback or `brycejmurrin.github.io/f1-game` (SSRF-closed).

## Week-1 tools (no live browser in CI)

`apex_verify_track`, `apex_verify_change_fast` (force `--fast --json`, never `--wait`), `apex_wgx_validate_static`, `apex_pick_tests`, `apex_bump_cache_check`, `apex_status` (lock + chrome healthz + test-bg + loadavg).

Every call accepts `dryRun`. Live result: `{ok, exit, argv, stdout, stderr, out, durationMs}`. Failures match `__apex` `{ok:false, error, message, fix}`.

## Week-2 (lock first)

`apex_eval`, `apex_shot`, `apex_survey_track`, `apex_gfx_probe`, `apex_wgx_validate`, `apex_wgx_capture`, `apex_ui_survey`, `apex_agent`. Exclusive `scratch/apex-browser.lock`. Refuse if chrome daemon `/healthz` is up or a Playwright group is live.

## Never wrap

Playwright groups (`test-bg`, `verify-change` without `--fast`), `bump-cache --apply`, rtc-e2e, TinyFish keys, `chrome_*` / `tinyfish_*` duplicates, lighting/physics sweeps, LAN `report-server`.

## Registration

Fourth `.mcp.json` server. Cloud: `./tools/apex-tools-mcp.sh call` (repo `.mcp.json` is not auto-loaded). Update the 3-key asserts in `probe-mcp.test.mjs` / `tinyfish-mcp.test.mjs` in the same commit as registration.

## Tests

`tests/unit/apex-tools-mcp.test.mjs` in `test:tooling-fast`. `APEX_MCP_MOCK=1`. No Chromium. Assert catalog has zero `chrome_`/`tinyfish_` names; `dry-run apex_verify_change_fast` cannot emit a group.
