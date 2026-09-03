# Agent surface — skills, MCP, tools, wrap

One map. Skills say **when**. MCP servers are **pinned calls**. `tools/` CLIs
do the work. Only ten CLIs are wrapped as `apex_*`.

```
need → skill (when / don'ts)
         ↓
       MCP?  local CLI pin → apex-tools (apex_*)
             live canvas   → chrome-devtools (chrome_*)      (mcp-probe)
             host browser  → playwright-official (browser_*) (playwright-probe / css-play)
             Pages / web   → deploy-research subagent (host fetch / WebFetch)
             no wrap       → run the tools/ CLI
```

## MCP servers

**Repo catalog** (root `.mcp.json` + `.cursor/mcp.json`, lockstepped, THREE
names — trimmed from seven on 2026-09). Stdio wrappers use `command: bash` +
`args: ["tools/…", …]` because Cursor looks up `command` on `PATH`. The
`playwright-official` row pins the same package the shell wrapper audits
(`@playwright/mcp@0.0.79`) — never `@latest`. Cloud often does **not**
auto-load them — then use the Fallback column.

| Server | Prefix | Job | Fallback |
|---|---|---|---|
| **apex-tools** | `apex_*` | Pin safe flags on ten committed `tools/` CLIs against the **working tree**. Never github.io. | `./tools/mcp/apex-tools-mcp.sh call <name> '{…}'` |
| **playwright-official** | `browser_*` | Interactive host Chromium (resize / DOM snapshot / evaluate). Skills **playwright-probe**, **survey-ui-matrix**, **css-play**. | `npx -y @playwright/mcp@0.0.79` |
| **chrome-devtools** | `chrome_*` (upstream names) | Interactive live canvas / DOM / heap / perf on the working tree, with the WebGPU flags from `webgpu-chrome-args.cjs`. Skill **mcp-probe**. | `tools/mcp/chrome-devtools-mcp.sh run` / `python3 tools/mcp/probe-mcp.py chrome-start` |

**Removed 2026-09 (CLI only now, not MCP-attached):**

| Was | Why it left the catalog | The CLI that remains |
|---|---|---|
| **playwright** (wrapper `run`, `--browser chromium`) | Failed to connect as a server; `playwright-official` is the same upstream without wrapper flags. | `tools/mcp/playwright-mcp.sh status\|play\|dom` (css-play) |
| **chrome-devtools-official** | Duplicate of **chrome-devtools** minus the WebGPU flags; two Chrome MCPs fought over one box. | `npx -y chrome-devtools-mcp@1.7.0` by hand |
| **tinyfish** (`127.0.0.1:3711`) and the `tinyfish_*` half of **probe** | Container egress blocks `agent.tinyfish.ai`, so the in-repo proxy can never answer here. The hosted TinyFish connector in the main session and the host fetch tool can. | `tools/mcp/tinyfish-mcp.sh` on a box with egress; key from shell / gitignored `.env` only (no tracked fallback) |
| **probe** (`chrome_*` + `tinyfish_*` bridge) | Its `chrome_*` half duplicates **chrome-devtools**; its `tinyfish_*` half is dead in-container. | `python3 tools/mcp/probe-mcp.py chrome-start` / `call` — the persistent-daemon flow has no MCP equivalent and stays |

**Cloud / desktop global catalog.** Cloud Agents do **not** read
`~/.cursor/mcp.json`. Add servers at https://cursor.com/agents (MCP dropdown)
when the host catalog is empty; `apex-tools` and `playwright-official` are
already in project `.mcp.json`. Never run **chrome-devtools** next to
`browser_*`, and never either of them while `playwright test` is live.

**Host catalog** (Cursor Cloud / Claude inject these; they are **not** extra
rows in repo `.mcp.json`):

| Server | Prefix | Job | Fallback |
|---|---|---|---|
| **mcp-context7** | `resolve-library-id` / `query-docs` | Library docs. | — |
| **Github** | `get_me` / `issue_*` / `pull_request_*` | GitHub API. | `gh` (read-only in Cloud) |
| **cursor-cloud** | `run-info` / `environment-*` | This Cloud run / environment. | — |
| **TinyFish (hosted connector)** | `search` / `fetch_content` | Public web / Pages when the main session has it. | host fetch tool (WebFetch) |

`playwright-official` is **not** `test-bg` and is **not** an `apex_*` wrap.
Never start it while Chrome DevTools / `probe-mcp.py chrome-start` is up, and
never start Chrome while a `browser_*` tab or `playwright test` is live.

Ports (do not reuse): TinyFish `3711` (CLI only), chrome daemon `3712`,
apex-tools HTTP `3713` (`127.0.0.1` only). Design / refuses:
[research/APEX-TOOLS-MCP.md](research/APEX-TOOLS-MCP.md).

**Route (do not mix):**

| Need | Use | Not |
|---|---|---|
| Pre-push / did I break anything | skill **check-changes** → `apex_verify_change_fast` / `verify-agent` | `mcp-probe` |
| One circuit build | `node tools/track/verify-track.cjs <id>` / skill **agent-view** | a browser group |
| Live working-tree canvas | skill **mcp-probe** (`chrome_*`) | apex-tools (no `--url`) |
| Live `version.json` / Pages | **deploy-research** (host fetch / WebFetch / hosted TinyFish) | `mcp-probe`, curl github.io, `tinyfish-mcp.sh` in-container |
| Batch screenshots | skill **playwright-probe** (`apex_shot` / `shot.mjs`) | Chrome MCP while Playwright runs |
| Interactive host browser | **playwright-official** (`browser_*`) | `test-bg.mjs`; chrome-devtools at the same time |
| One-screen CSS try-on | skill **css-play** → `css-play.mjs` / `playwright-mcp.sh play\|dom` | `layout-audit` matrix / `--gallery` |
| Start Playwright **groups** | `tools/ci/test-bg.mjs` (CLI only) | any `apex_*` wrap; host `browser_*` |
| Agent bloat / extract / dead code | skill **slim-bloat** → `bloat-auditor` + `bloat-scan.mjs` | a browser group; raising a ratchet to hide growth |

Call `apex_status` before any `apex_*` browser tool. Occupancy treats host
Playwright MCP (`@playwright/mcp` / `.playwright-mcp` Chromium) as live —
close `browser_*` (`browser_close`) before a browser wrap. Cursor's
`--mcp-config {"playwright":...}` line is ignored. Never run Chrome MCP
while Playwright is running.

One command that pokes the repo shell wrappers (no Chromium; missing
TinyFish key / chrome clone = warn; playwright `status` only):

```sh
./tools/mcp/apex-tools-mcp.sh smoke
node tools/mcp/mcp-smoke.mjs --dry-run
```

## Layers

| Layer | Lives | Answers |
|---|---|---|
| **Skills** | `.claude/skills/*/SKILL.md` — index [`.claude/skills/README.md`](../.claude/skills/README.md) | When to load a workflow; hard don'ts; which composer to run. |
| **Subagents** | `.claude/agents/*.md` — index [`.claude/agents/README.md`](../.claude/agents/README.md) | Isolated verify / survey / deploy-research / audits. No browser groups. |
| **MCP wrap** | `tools/mcp/apex-tools-mcp.mjs` + catalog `tools/mcp/apex-tools-mcp.json` | Pinned argv. Tree = no lock. Browser = lock + occupancy. |
| **CLIs** | `tools/*.mjs` / `*.cjs` — index [`tools/README.md`](../tools/README.md) | The real commands. Most exist whether or not they are wrapped. |

A skill is **not** an MCP tool. An MCP tool is **not** a new implementation —
it spawns the CLI with flags the project already considers safe (`--check`,
`--fast`, `--json`; never `--apply`, `--wait`, `--write`, `--bg`).

## Wrap map

`Kind` is `tree` (TRACK_VM / static, no Chromium lock) or `browser` (harness
Chromium; takes `scratch/apex-browser.lock`). `Skill` is the workflow that
names the CLI. Ten wraps (30 → 12 on 2026-09: the audits, startline,
survey-track, carshot, wgx-shot/capture/validate-live, layout-audit --survey,
quick-validate, select-recall, track-verts, assets-verify
and verify-track are plain CLIs now — `tools/README.md`).

<!-- WRAP-MAP -->
| MCP tool | CLI | Kind | Skill |
|---|---|---|---|
| `apex_status` | built-in | tree | check-changes |
| `apex_pick_tests` | `ci/pick-tests.mjs` | tree | check-changes |
| `apex_select_specs` | `ci/select-specs.mjs` | tree | check-changes |
| `apex_verify_change_fast` | `ci/verify-change.mjs` | tree | check-changes |
| `apex_bump_cache_check` | `ci/bump-cache.mjs` | tree | check-changes |
| `apex_rotate_markings_check` | `track/rotate-markings.cjs` | tree | new-track |
| `apex_graph_parity` | `track/graph-parity.cjs` | tree | scenery-dress |
| `apex_eval` | `shot/apex-eval.mjs` | browser | playwright-probe |
| `apex_agent` | `shot/agent.mjs` | browser | agent-view |
| `apex_shot` | `shot/shot.mjs` | browser | playwright-probe |

Pins the wrap always applies (you cannot override them):

- `apex_verify_change_fast` → `--fast --json` (never `--wait`)
- `apex_bump_cache_check` → `--check --json` (never `--apply`)
- `apex_pick_tests` / `apex_select_specs` → `--json` (never `--bg`)
- `apex_rotate_markings_check` → `--check` (never `--write`)
- `apex_graph_parity` → requires `base` (never vacuous HEAD-vs-clean)
- Browser wraps never take `--url`; output paths (`out`) must stay under
  `artifacts/` or `scratch/`

## Never wrap

These stay CLI-only on purpose. The MCP must refuse if asked to grow them.

<!-- NEVER-WRAP -->
| CLI / action | Why | Use instead |
|---|---|---|
| `test-bg.mjs` start / `--wait` / `--stop` | Minutes of Playwright; foreground-illegal | CLI `test-bg.mjs`; skill **check-changes** |
| `verify-change.mjs` without `--fast` | Starts browser groups | `apex_verify_change_fast` |
| `node tools/ci/bump-cache.mjs --apply` --at N --root _site` | Deploy-only: hashes a STAGED shell (pages.yml); the repo carries `?v=dev` and `--apply` refuses without `--root` | `check-changes/references/bump.md` |
| `assets.mjs bake*` | Author-time writer | skill **asset-pack** |
| `rotate-markings.cjs --write` | Mutates circuit markings | CLI after `--check` review |
| `graph-parity.cjs` without `BASE=` | Vacuous pass on a clean tree | `apex_graph_parity` with `base` |
| `lighting-tuner-sweep.mjs` / `physics-tune-sweep.mjs` | Long, sharded, resumable | skills **lighting-tuner** / **tune-physics** |
| `rtc-e2e*.mjs` / `nostr-probe.mjs` | Real network / minutes | skill **multiplayer-debug** |
| `report-server.mjs` | Binds `0.0.0.0` | skill **mcp-probe** |
| `cdmcp-*` / `mcp-cli.mjs` / `chrome-devtools-mcp.sh` / `probe-mcp.py` | Other catalogs / daemons | **mcp-probe** |
| `tinyfish-mcp.sh` / TinyFish keys | Not MCP-attached; egress-blocked in-container; key is shell / gitignored `.env` only (no tracked fallback; custom key → https://agent.tinyfish.ai/home) | **deploy-research** (host fetch / WebFetch) |
| github.io / `target=deploy` | Pages is never reached from `apex_*` or a container browser | **deploy-research** |

## How to call (Cloud)

Host catalog loaded:

```
apex_status
apex_pick_tests  { "since": "HEAD~1" }
```

Host catalog empty (this Cloud dashboard often is):

```sh
./tools/mcp/apex-tools-mcp.sh call apex_status '{}'
./tools/mcp/apex-tools-mcp.sh call apex_pick_tests '{"since":"HEAD~1"}'
```

`dryRun: true` prints argv and spawns nothing. Browser wraps take the lock —
`apex_status` first. `./tools/mcp/apex-tools-mcp.sh smoke` checks the repo shell
wrappers without taking the lock.
