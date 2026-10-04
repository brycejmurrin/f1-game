# Apex Tools MCP — design

> **Errata (2026-09):** Repo `.mcp.json` attaches **three** servers
> (`apex-tools`, `playwright-official`, `chrome-devtools`). TinyFish and
> `probe` are CLI-only. Live Pages / github.io checks go to **deploy-research**
> (host fetch / WebFetch), not `tinyfish-mcp.sh`. Sections below that still say
> “five servers” or “Pages is TinyFish” are historical.

**Agent map (what is wrapped, which skill, never-wrap):**
[`docs/AGENT-SURFACE.md`](../AGENT-SURFACE.md). This file is the refuse table
and week-by-week pin history.

Hosted MCP that wraps committed CLIs under `tools/` against the **local
working tree**. Skills stay in `.claude/skills/`. This is the machine
interface so agents stop re-learning flags.

Does **not** replace Chrome DevTools or TinyFish. Does **not** extend
`tools/mcp/probe-mcp.py`. **Catalog finished** (`tools/mcp/apex-tools-mcp.mjs` + `.sh` +
`tools/mcp/apex-tools-mcp.json`). Live Chromium is occupancy-gated; CI covers
mock/`dryRun` plus HTTP loopback. `.mcp.json` stdio → `serve`; HTTP is
`serve-http` on `127.0.0.1:3713`.

Measured 2026-08-18 (this container, loadavg ~0.1): `apex_eval` monza
`a.info()` via `./tools/mcp/apex-tools-mcp.sh call` — `ok`, 12061 ms, lock
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
relative `tools/mcp/apex-tools-mcp.sh` works. After `agent mcp enable apex-tools`:
`ready`; `list-tools` → **30** `apex_*`. `agent -p` needs login. When the
Cloud host catalog is empty, `./tools/mcp/apex-tools-mcp.sh call`.

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
| **Lives** | `tools/mcp/apex-tools-mcp.mjs` + `tools/mcp/apex-tools-mcp.sh` |
| **Transport** | stdio. **Root `.mcp.json` stays** (Cloud / Claude / this agent). Cursor CLI/IDE also loads **`.cursor/mcp.json`**. Same five servers, lockstepped (`playwright` is `tools/mcp/playwright-mcp.sh run`). HTTP `127.0.0.1:3713` via `serve-http`. If the host catalog is empty: `./tools/mcp/apex-tools-mcp.sh call`. Lockstep names: `tools/mcp/apex-tools-mcp.json`. |
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

**No `apex_*` tool may hit github.io.** Pages checks belong to
**deploy-research** (host fetch / WebFetch). The in-repo `tinyfish-mcp.sh`
CLI remains for a box with egress only — it is not MCP-attached and cannot
answer in this container. The Cloud proxy blocks `github.io`
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
Catalog lockstep: `tools/mcp/apex-tools-mcp.json` (stdio + http + tool names).

Still not wrapped (use the CLI): `wgx-gallery` (batch Chromium). chrome-devtools
stdio occupancy gap stays documented.

All eight already boot via `harness.mjs` (`startStaticServer` + own Chromium).

**Pin `apex_ui_survey`:** wrap `ui-survey.mjs` with the alias defaults frozen
(`--screens=title,select,garage,settings,career,datahub`,
`--viewports=ios-iphone-landscape`, `--jobs=1`). Refuse caller `--screens=` /
`--viewports=` / `--jobs=` that widen the matrix. Extra argv on the CLI
replaces the recipe (layout-audit first-wins); an MCP pass-through would
become a full `layout-audit`.

## Week-6 (2026-10-02: session checks, and a live re-test of every wrap)

| Tool | CLI | Pin |
|---|---|---|
| `apex_session_status` | `session-status.mjs --json` | No args |
| `apex_who_is_on_it` | `who-is-on-it.mjs --json [--hours N] [--no-fetch] [paths…]` | Never `--claim` / `--release`; a path starting `-` is refused |
| `apex_ci_status` | `ci-watch.mjs --once --sha <hex\|HEAD>` | One poll; exits 0/1/2/124 are verdicts in `out.verdict` |

Live re-test of all twelve wraps (idle container, loadavg < 0.1) found three
browser wraps broken and fixed them at the CLI, not the wrap:

- `apex_agent` failed 2 of 2 on `waitForFunction: Timeout 15000ms` —
  `agent.mjs` had no `polling: 100` and a 15 s boot / 20 s build budget.
  `__apex` lands 10.3–12.6 s after `goto` on an idle box (3 boots) and a TLX
  monza build is 16.6 s. Now 45 s / 45 s with timer polling: `world` in 22 s.
- `apex_eval` failed its first call and passed the retry: same 15 s boot.
- `apex_shot` exited 0 having saved an all-transparent PNG, then on a second
  run the menu's garage scene, as monza. The first TLX present after the
  camera move took 17.6 s; `awaitPresentedFrame`'s 8 s default timed out
  silently and the capture read the previous blit. It now returns
  true/false/null, `shot.mjs` waits up to 90 s and refuses a stale or blank
  (sharp stats, not byte count) frame.
- `parseOut` returned `563.528` for `apex_shot`: the line-by-line fallback
  parsed an indented number from inside the JSON. The fallback now takes the
  last column-0 `{`/`[` block, objects and arrays only.

## Week-7 (2026-10-03: async calls, cancellation, client timeouts)

A second agent's re-test (deploy tip `ff109fc`, 14/15 pass) found `apex_agent`
cut off by its CLIENT at 60 s while the CLI itself answered in 97 s — and
worse, the server kept running it: `spawnSync` blocked the whole process (not
even `apex_status` could answer) and the lock stayed held, so the next call got
`lock_held`. Fixed in the server:

- Every wrap spawns asynchronously (`runSpawn` returns a promise); the child
  leads its own process group, so a timeout kills the Chromium it launched too.
- `notifications/cancelled` aborts the call: the process group is killed, the
  lock is released when the child exits, and no response is sent for that id
  ([spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation)).
  Measured over stdio: `apex_status` answered at 4.1 s during an `apex_agent`
  run; cancel at 8 s; lock free and no browser left at 13 s.
- `.mcp.json` / `.cursor/mcp.json` set `"timeout": 900000` on `apex-tools`,
  matching `.codex/config.toml`'s `tool_timeout_sec = 900`. Claude Code's CLI
  has no 60 s stdio limit (default ~28 h; a per-server `timeout` overrides
  `MCP_TOOL_TIMEOUT`: https://code.claude.com/docs/en/mcp), but the Desktop app
  cancels stdio calls at ~60 s regardless — now a clean cancel, not a stuck lock.
- `apex_rotate_markings_check` parses its rows into `out` (`wouldChange`,
  `circuits[]`); `who-is-on-it.mjs` lists each touched commit once, with every
  branch carrying it in `branches`.

Not a bug: `apex_shot`'s `frame.camera.mode` is the GAME camera underneath;
the free cam that framed the shot is `dbgCamActive: true`.

## Week-8 (2026-10-03: sessions, jobs, UI, audits — 16 → 24 tools)

Measured live over stdio (`apex-tools-mcp.sh serve`, idle container):

| Tool | What | Measured |
|---|---|---|
| `apex_track` | persistent `track-session.mjs --serve`: open once, then shot / eval / track / sheet / diff | open 27 s; shots 10–25 s (60 s once under a concurrent `verify_all` job); eval 7 ms; switch circuit 3 s |
| `apex_job_start` / `_status` / `_cancel` | minutes-long CLIs in the background, ≤ 2 at once, browser kinds hold the lock | `verify_all` done in 136 s; `parts_sweep` cancelled; a third start → `jobs_busy` |
| `apex_ui_fit` | layout-audit geometry, one screen × viewport | 19 s, `settings` clean |
| `apex_ui_shot` | layout-audit `--screen`, PNG + DOM + thumbnail | 19 s |
| `apex_car_audit` | `parts-ladder` (0.24 s) or `crest-sweep` (~34 s) | ladder: 12 rows |
| `apex_track_audit` | `verify-track --quiet` + `float-audit --json` in parallel | 3.3 s, monza 0 clusters |

A session shot waits for TWO soft presents: the first resolved on a present
already in flight from the previous camera, and an orbit and an eye shot came
back 0.5 % apart (the same frame). With two waits they are 99 % apart.

Screenshot tools (`apex_shot`, `apex_track` shot / sheet / diff, `apex_ui_shot`)
attach a 640-px JPEG thumbnail as an MCP image block (`image:false` opts out),
so an agent sees the frame without a Read. The server also lists three
resources (`resources/list` / `resources/read`): DEBUG-HOOKS.md, AGENT-SURFACE.md
and this file — read without booting anything; any other URI is -32002.

A second re-test (all 16 tools PASS on `dd69887`) found Chromium outliving
the lock after a cancel: killing the CLI's process group missed the browser,
because Playwright starts Chromium in its OWN group, and it ran ~7 s after the
lock read free. Every cancel, timeout, session close and job cancel now
snapshots the whole process tree first (`processTree`: a re-parented browser
is unreachable later), kills it (`killTreeAndWait`: TERM, KILL after 3 s) and
only then releases the lock. Measured: browser gone at 9 s after an 8 s
cancel, 0 seconds with a browser under a free lock (was ~18 s); `apex_track`
close returns `{survivors:0, lockFree:true}` and a status right after reads free.

Not built: `apex_car_shot` — an `apex_garage` session already renders any team
from any angle in seconds, and `render-car.mjs` needs a server on :3456.

## Week-9 (2026-10-04: batch, survey, driving, compare, restart-safe jobs — 26 → 27 tools)

Measured live over stdio on an idle container:

- `apex_track` `survey` `quick` on monza: the shot list is built from
  `trackInfo` corners (T1–T4: overview, approach eye, apex orbit) and run as one
  op — 12 shots in ~2 min with a `notifications/progress` per shot when the
  client sent `_meta.progressToken`, plus a contact sheet thumbnail.
- `batch`: 3 shots + 1 bad spec → 3 done, 1 reported in `failed`, not fatal.
- Driving ops in the same session: `reset` (speedKph 144), `act` 120 ticks,
  `rollout` 4 s (distance, speeds, corner minima), `world` / `field` — and the
  next shot turns rendering back on (headless would freeze the canvas).
- Idle auto-close (`APEX_SESSION_IDLE_MS`, default 10 min) for `apex_track` and
  `apex_garage`. First cut closed a session mid-batch (the clock counted from
  the op's START); the clock now pauses while an op runs.
- Jobs survive a server restart: children are `unref`ed, recorded in
  `artifacts/logs/apex-jobs/registry.json`, and a browser job's lock is handed
  to the JOB's pid on exit. Measured: restart with `survey_track` running →
  new server shows it `orphaned`, `apex_status` busy (lock held by the job),
  `apex_track open` refused `lock_held`, `apex_job_cancel` → survivors 0, lock
  free.
- `compare` job (`shot/track-compare.mjs`): monza `quick`, HEAD~1 vs the
  working tree, 12 pairs. At full resolution identical scenes differed 2–4 %
  (anti-aliasing shimmer on tree and fence edges), so the score is taken on a
  quarter-size, blurred copy: identical scenes ≤ 0.13 %, a different view
  73.5 %; `changed` counts pairs over 0.5 %.
- `apex_physics_audit` `ai_band` (30 s sim): ~12 s; `apex_status` gained
  `browserFree` and a one-line `summary`.

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
`tools/mcp/playwright-mcp.sh`) is a **fifth** browser with the same gap.
`layout-audit` / `cdmcp-*` / a raw `node tools/shot/apex-eval.mjs` from a shell
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
| `node tools/gen/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`) / `--at` / `--merge` | Writes `index.html` / `version.json`; last edit before commit |
| `rtc-e2e` / `rtc-e2e-3p` / `rtc-e2e-room` / `nostr-probe` | Real network / minutes / host stack |
| TinyFish keys / `tinyfish-mcp.sh` / `.env` | Probe owns `tinyfish_*`; key is shell / gitignored `.env` / tracked `TINYFISH_KEY_FALLBACK` (`TINYFISH_NO_FALLBACK=1`; custom key: https://agent.tinyfish.ai/home) |
| `chrome_*` / `tinyfish_*` names or passthrough | Mixing catalogs is how apex-wrap shipped 0 tools |
| `lighting-tuner-sweep`, `lighting-campaign/`, `ab-lighting`, `physics-tune-sweep` | Long, sharded, resumable; not a one-shot MCP call |
| `report-server.mjs` | Binds `0.0.0.0`, LAN URLs |
| `cdmcp-*`, `mcp-cli.mjs`, `chrome-devtools-mcp.sh` | Probe / chrome-devtools |
| `playwright-mcp.sh` / `@playwright/mcp` | Interactive UI survey; not an apex_* wrap |
| `assets.mjs bake*`, `rotate-markings --write` | Writers |
| `graph-parity` without `BASE=` | Vacuous-refuse on a clean tree (exit 2). Wrapped only as `apex_graph_parity` with required `base`. |

---

## Registration

Fifth catalog name in both files: `playwright` → `bash`
`["tools/mcp/playwright-mcp.sh", "run"]`. `apex-tools` stays `bash`
`["tools/mcp/apex-tools-mcp.sh", "serve"]` (Cursor PATH-lookup: a bare
`tools/*.sh` command never starts). Official npx rows
`playwright-official` / `chrome-devtools-official` pin the same
`MCP_NPM_PACKAGE` as those wrappers — never `@latest`.
Same-commit updates:

- key lists in `tests/unit/probe-mcp.test.mjs` and
  `tests/unit/tinyfish-mcp.test.mjs` include
  `playwright-official` and `chrome-devtools-official`
- `.cursor/mcp.json` locksteps those seven names + apex-tools argv (`type: stdio`)
- `apex-tools-mcp.sh` / `playwright-mcp.sh` help in `tests/unit/tools-runnable.test.mjs`
- AGENTS Cloud path lists `./tools/mcp/apex-tools-mcp.sh` and
  `./tools/mcp/playwright-mcp.sh` next to `tinyfish-mcp.sh` / `probe-mcp.py`

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
