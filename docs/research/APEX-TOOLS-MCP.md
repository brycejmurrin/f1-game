# Apex Tools MCP — design

**Agent map (what is wrapped, which skill, never-wrap):**
[`docs/AGENT-SURFACE.md`](../AGENT-SURFACE.md). This file is the refuse table
and week-by-week pin history.

Hosted MCP that wraps committed CLIs under `tools/` against the **local
working tree**. Skills stay in `.claude/skills/`. This is the machine
interface so agents stop re-learning flags.

Does **not** replace Chrome DevTools or TinyFish. Does **not** extend
`tools/probe-mcp.py`. **Catalog finished** (`tools/apex-tools-mcp.mjs` + `.sh` +
`tools/apex-tools-mcp.json`). Live Chromium is occupancy-gated; CI covers
mock/`dryRun` plus HTTP loopback. `.mcp.json` stdio → `serve`; HTTP is
`serve-http` on `127.0.0.1:3713`.

Measured 2026-08-18 (this container, loadavg ~0.1): `apex_eval` monza
`a.info()` via `./tools/apex-tools-mcp.sh call` — `ok`, 12061 ms, lock
released after. `apex_status` then `playwright.live === false`.

Week-3 live tree (same container, no Chromium): `apex_select_specs`
`since=HEAD~8` 322 ms `ok`; `apex_assets_verify` 40 ms `verify: OK`;
`apex_float_audit` monza 895 ms `clusters: 0`.

Week-4 live tree: `apex_select_recall` 739 ms `ok` (5 cases, no silent
miss); `apex_cache_bump_only` since=HEAD~1 28 ms `ok` with CLI exit 1
(`pure:false`, empty diff); `apex_aero_zone_turns` monza 78 ms;
`apex_startline_snap` monza 30 ms.

Live locked browser (2026-08-18): `apex_carshot` after `apex_status`
(lock free, chrome down, `playwright.live === false`) — first boot died
at `waitForFunction(__apex)` under `--use-gl=angle`; after pinning
carshot to SwiftShader like `apex-eval`, `ok` in 16862 ms, 7.4 KB JPEG,
lock released. `apex_agent` monza `world` 33020 ms `ok` (apiVersion 1);
`apex_quick_validate` 3089 ms `QUICK-VALIDATE OK`; lock released after
each. HTTP `127.0.0.1:3713/healthz` → `{ok:true, tools:30, bind:127.0.0.1}`.
`apex_graph_parity` monza `BASE=HEAD~1` 1552 ms exact.

Keep **root `.mcp.json`** (Cloud / Claude / this agent) and **`.cursor/mcp.json`**
(Cursor `agent mcp`) in lockstep — same five servers, `type: "stdio"` on the
local ones. `agent mcp` (2026.08.11) reads `.cursor/mcp.json`;
`${workspaceFolder}` in `command` spawned as a literal path (`ENOENT`);
relative `tools/apex-tools-mcp.sh` works. After `agent mcp enable apex-tools`:
`ready`; `list-tools` → **30** `apex_*`. `agent -p` needs login. When the
Cloud host catalog is empty, `./tools/apex-tools-mcp.sh call`.

Sources: this session’s tool inventory and MCP wrap design. Stdio MCP is
JSON-RPC on stdin/stdout; log only on stderr.

---

## Why a new server

`probe` is a passthrough for `chrome_*` / `tinyfish_*`. Mixing a third
catalog into that process is how an earlier wrap shipped **0 tools** when
TinyFish `ensure()` threw. Every wrap target is Node. Name collision
(`chrome_*` / `tinyfish_*`) stays a structural invariant if this is a
**fifth** `.mcp.json` entry next to `playwright`: `apex-tools`.

| | |
|---|---|
| **Name** | `apex-tools` (`serverInfo.name`: `apex-tools-mcp`) |
| **Lives** | `tools/apex-tools-mcp.mjs` + `tools/apex-tools-mcp.sh` |
| **Transport** | stdio. **Root `.mcp.json` stays** (Cloud / Claude / this agent). Cursor CLI/IDE also loads **`.cursor/mcp.json`**. Same five servers, lockstepped (`playwright` is `tools/playwright-mcp.sh run`). HTTP `127.0.0.1:3713` via `serve-http`. If the host catalog is empty: `./tools/apex-tools-mcp.sh call`. Lockstep names: `tools/apex-tools-mcp.json`. |
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
| `apex_verify_change_fast` | `verify-change.mjs --fast --json` | Never `--wait`. Exit 2 (`verdict: partial`, fast phase passed, browser groups not-run) is `ok:true` + `exit:2`. Exit 1 (`fail`) stays `ok:false`. Live `--fast` can exceed ~30 s — MCP timeout 180 s; CI uses mock/`dryRun` only. |
| `apex_wgx_validate_static` | `wgx-validate.mjs --static` | Source invariants; live Dawn is week-2 |
| `apex_pick_tests` | `pick-tests.mjs --json` | **Never `--bg`** (that prints `test-bg` start lines) |
| `apex_bump_cache_check` | `bump-cache.mjs --check --json` | Never `--apply` / `--at` / `--merge` |
| `apex_status` | lock + chrome `/healthz` + `test-bg --status` + `playwright test` process + loadavg | Read-only; does **not** take the lock |

Every call accepts `dryRun`. `--plan` is not a separate tool: `dryRun` on
`apex_verify_change_fast` prints argv / plan JSON and spawns nothing.
`dryRun` / mock of that tool **must not** emit `test-bg` or a group name as
something to start.

---

## Week-2 (lock first)

`apex_eval`, `apex_shot`, `apex_survey_track`, `apex_gfx_probe`,
`apex_wgx_validate`, `apex_wgx_capture`, `apex_ui_survey`, `apex_agent`.

---

## Week-3 (more catalog)

Tree (no lock — same gate as week-1):

| Tool | CLI | Pin |
|---|---|---|
| `apex_select_specs` | `select-specs.mjs --since <ref> --json` | Requires `since`. Never `--bg`. |
| `apex_assets_verify` | `assets.mjs verify` | Never `bake*` / `fetch` / `import-pack` |
| `apex_float_audit` | `float-audit.cjs <id>\|--all --json` | Never `--clip` / `--foliage` |
| `apex_clip_audit` | `clip-audit.cjs <id>\|--all --json` | No `--depth` / `--adj` (CLI defaults) |
| `apex_coplanar_audit` | `coplanar-audit.cjs <id>\|--all --json` | No `--gap` / `--area` / `--fight` |
| `apex_track_verts` | `track-verts.cjs` or `--diff <path>` | `--diff` path must stay under `artifacts/` or `scratch/` |

Browser (lock + occupancy, same as week-2):

| Tool | CLI | Pin |
|---|---|---|
| `apex_carshot` | `car/carshot.mjs [az] [tod] [teamIdx] [out]` | `out` under `artifacts/` / `scratch/` |
| `apex_wgx_shot` | `wgx-shot.mjs [track] [--lite] [--cam] [--out]` | No `--url`. `out` contained. |
| `apex_quick_validate` | `quick-validate.mjs` | **No port** (self-boots) |

Output paths on every wrap (`--out`, carshot dest, `--diff`) are refused with
`path_escaped` unless they resolve under `artifacts/` or `scratch/`.
Dispatch keys off `kind` (`tree` vs `browser`), not the week-1 name set — a
new tree tool must not take the lock.

## Week-4 (more tree CLIs)

| Tool | CLI | Pin |
|---|---|---|
| `apex_select_recall` | `select-recall.mjs --json` | Replay only |
| `apex_cache_bump_only` | `cache-bump-only.mjs <since> --json` | Requires `since`. Exit 1 (not a pure bump) is `ok:true` + `exit:1` |
| `apex_rotate_markings_check` | `rotate-markings.cjs --check` | Never `--write` |
| `apex_startline_snap` | `startline-snap.cjs --json [ids…]` | JSON |
| `apex_startline_probe` | `startline-probe.cjs --json` | Optional `--calibrate` / `--snap` / `--frac` |
| `apex_aero_zone_turns` | `aero-zone-turns.cjs <id>\|--all` | TRACK_VM |

| `apex_graph_parity` | `BASE=<ref> graph-parity.cjs <id>\|--all` | **`base` required** (never vacuous HEAD-vs-clean) |

HTTP `serve-http` binds `127.0.0.1:3713` only (`APEX_MCP_HTTP_PORT` override).
Catalog lockstep: `tools/apex-tools-mcp.json` (stdio + http + tool names).

Still not wrapped (use the CLI): `wgx-gallery` (batch Chromium). chrome-devtools
stdio occupancy gap stays documented.

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
   `alive(pid)` **and** a process-table check for `playwright test`,
   `@playwright/mcp`, or Chromium with a `playwright-mcp` user-data-dir
   (not Cursor `--mcp-config` JSON). `test-bg --status` misses orphans.

**Known gap (document, do not pretend to close):** Cursor’s `.mcp.json`
`chrome-devtools` stdio server is a **third** browser and does **not** answer
`:3712/healthz`. Official `@playwright/mcp` (`playwright` in the same catalogs,
`tools/playwright-mcp.sh`) is a **fifth** browser with the same gap.
`layout-audit` / `cdmcp-*` / a raw `node tools/apex-eval.mjs` from a shell
also sit outside the lock unless they take it. v1 mutex is MCP-owned;
`/healthz` + test-bg + `playwright test` + `@playwright/mcp` are the known
other occupants. One-sided is acceptable if `apex_status` reports them
(`playwright.suite` / `hostMcp` / `hostBrowser`). Cursor
`--mcp-config {"playwright":...}` is not occupancy.

---

## Never wrap

`test-bg` has **no** `--fast`. Never wrap `test-bg` start / `--wait` /
`--stop` / `--parallel`. `--status` is allowed only inside `apex_status`.

| Class | Why |
|---|---|
| `verify-change` without `--fast` (default starts batch 1; `--wait` runs every group) | Playwright groups, minutes, foreground-illegal |
| `test-shards.sh` | Blocking concurrent groups |
| `node tools/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`) / `--at` / `--merge` | Writes `index.html` / `version.json`; last edit before commit |
| `rtc-e2e` / `rtc-e2e-3p` / `rtc-e2e-room` / `nostr-probe` | Real network / minutes / host stack |
| TinyFish keys / `tinyfish-mcp.sh` / `.env` | Probe owns `tinyfish_*`; key is shell / gitignored `.env` / tracked `TINYFISH_KEY_FALLBACK` (`TINYFISH_NO_FALLBACK=1`; custom key: https://agent.tinyfish.ai/home) |
| `chrome_*` / `tinyfish_*` names or passthrough | Mixing catalogs is how apex-wrap shipped 0 tools |
| `lighting-tuner-sweep`, `lighting-campaign/`, `ab-lighting`, `physics-tune-sweep` | Long, sharded, resumable; not a one-shot MCP call |
| `report-server.mjs` | Binds `0.0.0.0`, LAN URLs |
| `cdmcp-*`, `mcp-cli.mjs`, `chrome-devtools-mcp.sh` | Probe / chrome-devtools |
| `playwright-mcp.sh` / `@playwright/mcp` | Interactive UI survey; not an apex_* wrap |
| `assets.mjs bake*`, `tests-split --apply`, `rotate-markings --write` | Writers |
| `graph-parity` without `BASE=` | Vacuous-refuse on a clean tree (exit 2). Wrapped only as `apex_graph_parity` with required `base`. |

---

## Registration

Fifth catalog name in both files: `playwright` → `bash`
`["tools/playwright-mcp.sh", "run"]`. `apex-tools` stays `bash`
`["tools/apex-tools-mcp.sh", "serve"]` (Cursor PATH-lookup: a bare
`tools/*.sh` command never starts). Official npx rows
`playwright-official` / `chrome-devtools-official` pin the same
`MCP_NPM_PACKAGE` as those wrappers — never `@latest`.
Same-commit updates:

- key lists in `tests/unit/probe-mcp.test.mjs` and
  `tests/unit/tinyfish-mcp.test.mjs` include
  `playwright-official` and `chrome-devtools-official`
- `.cursor/mcp.json` locksteps those seven names + apex-tools argv (`type: stdio`)
- `apex-tools-mcp.sh` / `playwright-mcp.sh` help in `tests/unit/tools-runnable.test.mjs`
- AGENTS Cloud path lists `./tools/apex-tools-mcp.sh` and
  `./tools/playwright-mcp.sh` next to `tinyfish-mcp.sh` / `probe-mcp.py`

---

## Tests

`tests/unit/apex-tools-mcp.test.mjs` + `tests/unit/mcp-smoke.test.mjs` in
`TOOLING_FAST_FILES` (next to `probe-mcp.test.mjs`). `APEX_MCP_MOCK=1` /
`--dry-run`. No Chromium.

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
- week-3: `select-specs` requires `--since --json`; `assets verify` never
  bake; float/clip pin `--json` and default tunables; tree tools ignore
  the lock; `path_escaped` / `port_not_supported`
