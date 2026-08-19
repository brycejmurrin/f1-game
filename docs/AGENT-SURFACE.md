# Agent surface — skills, MCP, tools, wrap

One map. Skills say **when**. MCP servers are **pinned calls**. `tools/` CLIs
do the work. Only some CLIs are wrapped as `apex_*`.

```
need → skill (when / don'ts)
         ↓
       MCP?  local CLI pin → apex-tools (apex_*)
             live canvas   → probe / chrome-devtools   (mcp-probe)
             Pages / web   → tinyfish                  (deploy-research)
             host browser  → playwright (browser_*)    (playwright-probe)
             no wrap       → run the tools/ CLI
```

## MCP servers

**Repo catalog** (root `.mcp.json` + `.cursor/mcp.json`, lockstepped seven
names). Stdio wrappers use `command: bash` + `args: ["tools/apex-tools-mcp.sh", …]`
because Cursor looks up `command` on `PATH` — a bare `tools/apex-tools-mcp.sh`
as `command` never starts (measured: only `probe` via `python3` loaded). Official
npx rows pin the same packages as the wrappers (`@playwright/mcp@0.0.79`,
`chrome-devtools-mcp@1.7.0`) — never `@latest`. Cloud often does **not**
auto-load them — then use the Fallback column.

| Server | Prefix | Job | Fallback |
|---|---|---|---|
| **apex-tools** | `apex_*` | Pin safe flags on committed `tools/` CLIs against the **working tree**. Never github.io. | `./tools/apex-tools-mcp.sh call <name> '{…}'` |
| **playwright** | `browser_*` | Interactive Chromium (resize / DOM snapshot / evaluate). Skill **playwright-probe**. | `./tools/playwright-mcp.sh` |
| **playwright-official** | `browser_*` | Same upstream MCP via pinned `npx` (no wrapper flags). | `npx -y @playwright/mcp@0.0.79` |
| **probe** | `chrome_*` / `tinyfish_*` | Passthrough so one catalog reaches Chrome + TinyFish. | `python3 tools/probe-mcp.py` |
| **chrome-devtools** | (upstream) | Interactive live canvas / DOM / heap. | `tools/chrome-devtools-mcp.sh` |
| **chrome-devtools-official** | (upstream) | Same upstream MCP via pinned `npx` (no WebGPU wrapper flags). | `npx -y chrome-devtools-mcp@1.7.0` |
| **tinyfish** | (upstream) | Deployed Pages / public web. | `./tools/tinyfish-mcp.sh deploy-check --tip` |

**Cloud / desktop global catalog.** Cloud Agents do **not** read
`~/.cursor/mcp.json`. Add servers at https://cursor.com/agents (MCP
dropdown) when the host catalog is empty.

Paste **probe** (stdio) if Cloud did not load the project file. That is how
Cloud gets `chrome_*` and `tinyfish_*`. Do **not** add TinyFish as
`http://127.0.0.1:3711/mcp` in the Cloud dropdown — HTTP MCP is proxied
outside the VM, so loopback never hits the local proxy. `playwright` and
`apex-tools` already live in project `.mcp.json`. Never run
`chrome-devtools` / `chrome-devtools-official` next to `browser_*` /
`playwright-official`.

```json
{
  "mcpServers": {
    "probe": {
      "command": "python3",
      "args": ["tools/probe-mcp.py", "serve"]
    }
  }
}
```

Desktop `~/.cursor/mcp.json` can add the same, plus local TinyFish HTTP
after `./tools/tinyfish-mcp.sh ensure`. Put `${workspaceFolder}/` in front
of `tools/...` there — a bare relative path is resolved from the home
config, not the repo. Project `.cursor/mcp.json` wins on duplicate names.

**Host catalog** (Cursor Cloud injects these; they are **not** extra rows
in repo `.mcp.json`):

| Server | Prefix | Job | Fallback |
|---|---|---|---|
| **mcp-context7** | `resolve-library-id` / `query-docs` | Library docs. | — |
| **Github** | `get_me` / `issue_*` / `pull_request_*` | GitHub API. | `gh` (read-only in Cloud) |
| **cursor-cloud** | `run-info` / `environment-*` | This Cloud run / environment. | — |

`playwright` MCP is **not** `test-bg` and is **not** an `apex_*` wrap. Never
start it while Chrome DevTools / probe chrome-daemon is up, and never start
Chrome while a Playwright MCP tab or `playwright test` is live.

Ports (do not reuse): TinyFish `3711`, chrome daemon `3712`, apex-tools HTTP
`3713` (`127.0.0.1` only). Design / refuses:
[research/APEX-TOOLS-MCP.md](research/APEX-TOOLS-MCP.md).

**Route (do not mix):**

| Need | Use | Not |
|---|---|---|
| Pre-push / did I break anything | skill **check-changes** → `apex_verify_change_fast` / `verify-agent` | `mcp-probe` |
| One circuit build | `apex_verify_track` / skill **debug-tracks** | a browser group |
| Live working-tree canvas | skill **mcp-probe** (`chrome_*`) | apex-tools (no `--url`) |
| Live `version.json` / Pages | **deploy-research** / TinyFish | `mcp-probe`, curl github.io |
| Batch screenshots | skill **playwright-probe** (`apex_shot` / `shot.mjs`) | Chrome MCP while Playwright runs |
| Interactive host browser | repo MCP **playwright** (`browser_*` via `playwright-mcp.sh`) | `test-bg.mjs`; chrome-devtools at the same time |
| One-screen CSS try-on | skill **css-play** → `css-play.mjs` / `playwright-mcp.sh play\|dom` | `layout-audit` matrix / `--gallery` |
| Start Playwright **groups** | `tools/test-bg.mjs` (CLI only) | any `apex_*` wrap; host `browser_*` |
| Agent bloat / extract / dead code | skill **slim-bloat** → `bloat-auditor` + `bloat-scan.mjs` | a browser group; raising a ratchet to hide growth |

Call `apex_status` before any `apex_*` browser tool. Occupancy treats host
Playwright MCP (`@playwright/mcp` / `.playwright-mcp` Chromium) as live —
close `browser_*` (`browser_close`) before a browser wrap. Cursor's
`--mcp-config {"playwright":...}` line is ignored. Never run Chrome MCP
while Playwright is running.

One command that pokes the five **repo** wrappers (no Chromium;
missing TinyFish key / chrome clone = warn; playwright `status` only):

```sh
./tools/apex-tools-mcp.sh smoke
node tools/mcp-smoke.mjs --dry-run
```

## Layers

| Layer | Lives | Answers |
|---|---|---|
| **Skills** | `.claude/skills/*/SKILL.md` — index [`.claude/skills/README.md`](../.claude/skills/README.md) | When to load a workflow; hard don'ts; which composer to run. |
| **Subagents** | `.claude/agents/*.md` — index [`.claude/agents/README.md`](../.claude/agents/README.md) | Isolated verify / survey / deploy-research. No browser groups. |
| **MCP wrap** | `tools/apex-tools-mcp.mjs` + catalog `tools/apex-tools-mcp.json` | Pinned argv. Tree = no lock. Browser = lock + occupancy. |
| **CLIs** | `tools/*.mjs` / `*.cjs` — index [`tools/README.md`](../tools/README.md) | The real commands. Most exist whether or not they are wrapped. |

A skill is **not** an MCP tool. An MCP tool is **not** a new implementation —
it spawns the CLI with flags the project already considers safe (`--check`,
`--fast`, `--json`; never `--apply`, `--wait`, `--write`, `--bg`).

## Wrap map

`Kind` is `tree` (TRACK_VM / static, no Chromium lock) or `browser` (harness
Chromium; takes `scratch/apex-browser.lock`). `Skill` is the workflow that
names the CLI.

<!-- WRAP-MAP -->
| MCP tool | CLI | Kind | Skill |
|---|---|---|---|
| `apex_status` | built-in | tree | check-changes |
| `apex_pick_tests` | `pick-tests.mjs` | tree | check-changes |
| `apex_select_specs` | `select-specs.mjs` | tree | check-changes |
| `apex_select_recall` | `select-recall.mjs` | tree | check-changes |
| `apex_verify_change_fast` | `verify-change.mjs` | tree | check-changes |
| `apex_verify_track` | `verify-track.cjs` | tree | debug-tracks |
| `apex_bump_cache_check` | `bump-cache.mjs` | tree | bump-cache |
| `apex_cache_bump_only` | `cache-bump-only.mjs` | tree | check-changes |
| `apex_assets_verify` | `assets.mjs` | tree | asset-pack |
| `apex_wgx_validate_static` | `wgx-validate.mjs` | tree | webgpu-debug |
| `apex_float_audit` | `float-audit.cjs` | tree | survey-track |
| `apex_clip_audit` | `clip-audit.cjs` | tree | scenery-dress |
| `apex_coplanar_audit` | `coplanar-audit.cjs` | tree | scenery-dress |
| `apex_track_verts` | `track-verts.cjs` | tree | debug-tracks |
| `apex_rotate_markings_check` | `rotate-markings.cjs` | tree | new-track |
| `apex_startline_snap` | `startline-snap.cjs` | tree | new-track |
| `apex_startline_probe` | `startline-probe.cjs` | tree | debug-tracks |
| `apex_aero_zone_turns` | `aero-zone-turns.cjs` | tree | debug-tracks |
| `apex_graph_parity` | `graph-parity.cjs` | tree | scenery-dress |
| `apex_eval` | `apex-eval.mjs` | browser | playwright-probe |
| `apex_agent` | `agent.mjs` | browser | agent-view |
| `apex_shot` | `capture/shot.mjs` | browser | playwright-probe |
| `apex_survey_track` | `survey-track.mjs` | browser | survey-track |
| `apex_carshot` | `car/carshot.mjs` | browser | car-viewer |
| `apex_gfx_probe` | `gfx-probe.mjs` | browser | webgpu-debug |
| `apex_wgx_validate` | `wgx-validate.mjs` | browser | webgpu-debug |
| `apex_wgx_capture` | `wgx-capture.mjs` | browser | webgpu-debug |
| `apex_wgx_shot` | `wgx-shot.mjs` | browser | webgpu-debug |
| `apex_quick_validate` | `quick-validate.mjs` | browser | check-changes |
| `apex_ui_survey` | `ui-survey.mjs` | browser | survey-ui-matrix |

Pins the wrap always applies (you cannot override them):

- `apex_verify_change_fast` → `--fast --json` (never `--wait`)
- `apex_bump_cache_check` → `--check --json` (never `--apply`)
- `apex_pick_tests` / `apex_select_specs` → `--json` (never `--bg`)
- `apex_assets_verify` → `verify` only (never bake / fetch / import)
- `apex_rotate_markings_check` → `--check` (never `--write`)
- `apex_graph_parity` → requires `base` (never vacuous HEAD-vs-clean)
- `apex_ui_survey` → six screens, iPhone landscape, `jobs=1` (widening refused)
- `apex_cache_bump_only` exit 1 = “not a pure bump”, not a crash
- Output paths (`out` / `diff`) must stay under `artifacts/` or `scratch/`

## Never wrap

These stay CLI-only on purpose. The MCP must refuse if asked to grow them.

<!-- NEVER-WRAP -->
| CLI / action | Why | Use instead |
|---|---|---|
| `test-bg.mjs` start / `--wait` / `--stop` | Minutes of Playwright; foreground-illegal | CLI `test-bg.mjs`; skill **check-changes** |
| `verify-change.mjs` without `--fast` | Starts browser groups | `apex_verify_change_fast` |
| `bump-cache.mjs --apply` | Writes `index.html` / `version.json` | skill **bump-cache** (last edit before commit) |
| `assets.mjs bake*` | Author-time writer | skill **asset-pack** |
| `rotate-markings.cjs --write` | Mutates circuit markings | CLI after `--check` review |
| `graph-parity.cjs` without `BASE=` | Vacuous pass on a clean tree | `apex_graph_parity` with `base` |
| `wgx-gallery.mjs` | Forwarder → `wgx-shot.mjs --gallery` | skill **webgpu-debug** (parent session); prefer `npm run wgx:gallery` |
| `lighting-tuner-sweep.mjs` / `physics-tune-sweep.mjs` | Long, sharded, resumable | skills **lighting-tuner** / **tune-physics** |
| `rtc-e2e*.mjs` / `nostr-probe.mjs` | Real network / minutes | skill **multiplayer-debug** |
| `report-server.mjs` | Binds `0.0.0.0` | skill **mcp-probe** |
| `cdmcp-*` / `mcp-cli.mjs` / `chrome-devtools-mcp.sh` | Other catalogs | **mcp-probe** |
| `tinyfish-mcp.sh` / TinyFish keys | Other catalog; shell / `.env` / tracked fallback; custom key → https://agent.tinyfish.ai/home | **deploy-research** |
| github.io / `target=deploy` | Pages is TinyFish-only | `./tools/tinyfish-mcp.sh deploy-check --tip` |

## How to call (Cloud)

Host catalog loaded:

```
apex_status
apex_verify_track  { "id": "monza" }
```

Host catalog empty (this Cloud dashboard often is):

```sh
./tools/apex-tools-mcp.sh call apex_status '{}'
./tools/apex-tools-mcp.sh call apex_verify_track '{"id":"monza"}'
```

`dryRun: true` prints argv and spawns nothing. Browser wraps take the lock —
`apex_status` first. `./tools/apex-tools-mcp.sh smoke` checks the five repo
wrappers without taking the lock.
