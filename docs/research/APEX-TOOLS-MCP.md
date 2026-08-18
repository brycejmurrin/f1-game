# Apex Tools MCP — design

Hosted MCP that wraps committed CLIs under `tools/` against the **local
working tree**. Skills stay in `.claude/skills/`. This is the machine
interface so agents stop re-learning flags.

Does **not** replace Chrome DevTools or TinyFish. Does **not** extend
`tools/probe-mcp.py`. **Week-1 + week-2 catalog implemented**
(`tools/apex-tools-mcp.mjs` + `.sh`). Live Chromium is occupancy-gated;
CI covers mock/`dryRun` only.

Sources: this session’s tool inventory and MCP wrap design. Stdio MCP is
JSON-RPC on stdin/stdout; log only on stderr.

---

## Why a new server

`probe` is a passthrough for `chrome_*` / `tinyfish_*`. Mixing a third
catalog into that process is how an earlier wrap shipped **0 tools** when
TinyFish `ensure()` threw. Every wrap target is Node. Name collision
(`chrome_*` / `tinyfish_*`) stays a structural invariant if this is a
**fourth** `.mcp.json` entry: `apex-tools`.

| | |
|---|---|
| **Name** | `apex-tools` (`serverInfo.name`: `apex-tools-mcp`) |
| **Lives** | `tools/apex-tools-mcp.mjs` + `tools/apex-tools-mcp.sh` |
| **Transport** | stdio (Cursor). Cloud default is `./tools/apex-tools-mcp.sh call` (repo `.mcp.json` is not auto-loaded). Optional HTTP `127.0.0.1:3713` is **not** required for v1. |
| **SDK** | Hand-rolled JSON-RPC like `probe-mcp.py` — **no npm MCP SDK**, no build step |
| **Prefix** | `apex_*` only |
| **CLI** | `help` / `status` / `list-tools` / `call <name> '<json>'` / `serve` |

Ports (do not reuse): TinyFish `3711`, chrome daemon `3712`, this HTTP `3713`.
HTTP binds `127.0.0.1` only — never `0.0.0.0`. Protocol `2025-06-18`.
Notifications (no `id`) ignored. Expected refuses are **tool results** with
`isError: true`, not JSON-RPC `-32000`. Body is `{ok:false, error, message, fix}`.
Live success: `{ok, exit, argv, stdout, stderr, out, durationMs}`.

`APEX_MCP_MOCK=1` freezes the catalog and returns fake results (no spawn, no
Chromium) — same role as `PROBE_MCP_MOCK`.

---

## Local vs deploy

**No `apex_*` tool may hit github.io.** Pages is TinyFish / `deploy-research`
/ `tinyfish-mcp.sh deploy-check --tip`. The Cloud proxy blocks `github.io`
anyway. `__apex` recipes assume the local harness, not a TinyFish HTML fetch.

Precedence: per-call `url` → per-call `target` → `APEX_MCP_TARGET` → default
`local`.

- **tree** tools (verify-track, bump-cache `--check`, pick-tests,
  verify-change `--fast`): working tree only. `target=deploy` → `tree_only`.
  Week-1 ignores `url` (they never navigate).
- **browser** tools: local `harness.mjs` Chromium + loopback static server.
  Do **not** add `--url` to shot / eval / survey / gfx-probe in v1. Reject
  `target=deploy` and any non-loopback `url`. Attaching to an already-running
  `npx serve :3456` is a later feature and still loopback-only.
- **SSRF allowlist = loopback only** (`127.0.0.1`, `localhost`, `[::1]`).
  Any `github.io` / `*.github.io` URL → `{ok:false, error:"github_io_blocked",
  message, fix}` pointing at TinyFish / deploy-research. Do not fetch it “to
  classify.” Other hosts → generic SSRF refuse (not the typed Pages error).

Week-1 does **not** need `npx serve :3456`. Only week-2/harness does, and
harness binds its own loopback port.

---

## Week-1 tools (no live browser in CI)

| Tool | CLI | Pin |
|---|---|---|
| `apex_verify_track` | `verify-track.cjs <id>` or `--all` | VM only (`TRACK_VM`) |
| `apex_verify_change_fast` | `verify-change.mjs --fast --json` | Never `--wait`. Live `--fast` can exceed ~30 s — MCP timeout ~90 s; CI uses mock/`dryRun` only. |
| `apex_wgx_validate_static` | `wgx-validate.mjs --static` | Source invariants; live Dawn is week-2 |
| `apex_pick_tests` | `pick-tests.mjs --json` | **Never `--bg`** (that prints `test-bg` start lines) |
| `apex_bump_cache_check` | `bump-cache.mjs --check --json` | Never `--apply` / `--at` / `--merge` |
| `apex_status` | lock + chrome `/healthz` + `test-bg --status` + `playwright test` process + loadavg | Read-only; does **not** take the lock |

Every call accepts `dryRun`. `--plan` is not a separate tool: `dryRun` on
`apex_verify_change_fast` prints argv / plan JSON and spawns nothing.
`dryRun` / mock of that tool **must not** emit `test-bg` or a group name as
something to start.

Leave out of both weeks (agents already have them as CLIs): `select-specs`,
`assets.mjs verify`, `carshot`, `wgx-shot`, `quick-validate`, `float-audit` /
`clip-audit`.

---

## Week-2 (lock first)

`apex_eval`, `apex_shot`, `apex_survey_track`, `apex_gfx_probe`,
`apex_wgx_validate`, `apex_wgx_capture`, `apex_ui_survey`, `apex_agent`.

All eight already boot via `harness.mjs` (`startStaticServer` + own Chromium).

**Pin `apex_ui_survey`:** wrap `ui-survey.mjs` with the alias defaults frozen
(`--screens=title,select,garage,settings,career,datahub`,
`--viewports=ios-iphone-landscape`, `--jobs=1`). Refuse caller `--screens=` /
`--viewports=` / `--jobs=` that widen the matrix. Extra argv on the CLI
replaces the recipe (layout-audit first-wins); an MCP pass-through would
become a full `layout-audit`.

### Locking

Exclusive `scratch/apex-browser.lock` (gitignored). Week-1 including
`apex_status` must not take it. Stale lock: steal if the PID is dead; a crash
leftover must not wedgie the session.

Refuse (typed `{ok:false, error, message, fix}`) if any of:

1. **Lock held** by another live PID.
2. **Probe chrome daemon `/healthz` up** — same discovery as `probe-mcp.py`
   `daemon_port()`: `PROBE_CHROME_PORT` → `scratch/probe-chrome-daemon.port`
   → `3712`, each health-checked. Week-2 uses harness Chromium, not the
   daemon; do not share it.
3. **A Playwright group is live** — `artifacts/logs/test-bg.json` +
   `alive(pid)` **and** a process-table check for `playwright test`.
   `test-bg --status` misses orphans.

**Known gap (document, do not pretend to close):** Cursor’s `.mcp.json`
`chrome-devtools` stdio server is a **third** browser and does **not** answer
`:3712/healthz`. `layout-audit` / `cdmcp-*` / a raw `node tools/apex-eval.mjs`
from a shell also sit outside the lock unless they take it. v1 mutex is
MCP-owned; `/healthz` + test-bg + `playwright test` are the known other
occupants. One-sided is acceptable if `apex_status` reports all three.

---

## Never wrap

`test-bg` has **no** `--fast`. Never wrap `test-bg` start / `--wait` /
`--stop` / `--parallel`. `--status` is allowed only inside `apex_status`.

| Class | Why |
|---|---|
| `verify-change` without `--fast` (default starts batch 1; `--wait` runs every group) | Playwright groups, minutes, foreground-illegal |
| `test-shards.sh` | Blocking concurrent groups |
| `bump-cache --apply` / `--at` / `--merge` | Writes `index.html` / `version.json`; last edit before commit |
| `rtc-e2e` / `rtc-e2e-3p` / `rtc-e2e-room` / `nostr-probe` | Real network / minutes / host stack |
| TinyFish keys / `tinyfish-mcp.sh` / `.env` | Probe owns `tinyfish_*`; baked-key path is guard-asserted |
| `chrome_*` / `tinyfish_*` names or passthrough | Mixing catalogs is how apex-wrap shipped 0 tools |
| `lighting-tuner-sweep`, `lighting-campaign/`, `ab-lighting`, `physics-tune-sweep` | Long, sharded, resumable; not a one-shot MCP call |
| `report-server.mjs` | Binds `0.0.0.0`, LAN URLs |
| `cdmcp-*`, `mcp-cli.mjs`, `chrome-devtools-mcp.sh` | Probe / chrome-devtools |
| `assets.mjs bake*`, `tests-split --apply`, `rotate-markings --write` | Writers |
| `graph-parity` as a default tool | Needs `BASE=`; vacuous-refuse on a clean tree (exit 2) |

---

## Registration

Fourth `.mcp.json` server: `command` → `tools/apex-tools-mcp.sh`,
`args` → `["serve"]`. Same-commit updates:

- 3-key lists in `tests/unit/probe-mcp.test.mjs` and
  `tests/unit/tinyfish-mcp.test.mjs` become
  `["apex-tools", "chrome-devtools", "probe", "tinyfish"]`
- `apex-tools-mcp.sh help` in `tests/unit/tools-runnable.test.mjs`
- AGENTS Cloud path lists `./tools/apex-tools-mcp.sh` next to
  `tinyfish-mcp.sh` / `probe-mcp.py`

---

## Tests

`tests/unit/apex-tools-mcp.test.mjs` in `TOOLING_FAST_FILES` (next to
`probe-mcp.test.mjs`). `APEX_MCP_MOCK=1`. No Chromium.

Assert:

- `initialize` → `serverInfo.name === "apex-tools-mcp"`
- `tools/list` names are **all** `apex_*` and **zero** `chrome_` / `tinyfish_`
- `dryRun` / mock `apex_verify_change_fast`: argv contains `--fast` and
  `--json`, does **not** contain `--wait`, does **not** spawn `test-bg`
- `apex_bump_cache_check` argv never contains `--apply`
- `apex_pick_tests` argv never contains `--bg`; includes `--json`
- `target=deploy` on a tree tool → `tree_only`; `url` with `github.io` →
  `github_io_blocked` (no fetch)
- `isError` preserved on tool failure (not a JSON-RPC `error`)
- stdout is JSON-RPC only (no log lines)
