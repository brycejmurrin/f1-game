# Agent surface — skills, MCP, tools, wrap

One map. Skills say **when**. MCP servers are **pinned calls**. `tools/` CLIs
do the work. Only ten CLIs are wrapped as `apex_*` (eleven tools: `apex_garage` is a
session over one of them).

```
need → skill (when / don'ts)
         ↓
       MCP?  local CLI pin → apex-tools (apex_*)
             live canvas   → chrome-devtools (chrome_*)      (mcp-probe)
             host browser  → playwright-official (browser_*) (survey-ui-matrix / css-play)
             Pages / web   → deploy-research subagent (host fetch / WebFetch)
             no wrap       → run the tools/ CLI
```

## Bootstrap (auto-setup)

So every new Cursor / Claude Code / Codex / Cloud session gets the same
surface without hand-wiring:

| Piece | Path | Auto? |
|---|---|---|
| Rules | `AGENTS.md` | Yes (Cursor + Cloud + Codex). Claude Code via `CLAUDE.md` → `@AGENTS.md`. |
| Claude stub | `CLAUDE.md` | Must stay a one-line import; never duplicate rules. |
| Skills (canonical) | `.claude/skills/*/SKILL.md` | Yes for Claude Code + Cursor (compat). Do **not** copy into `.cursor/skills/`. |
| Skills (Codex mirror) | `.agents/skills/<name>` → `../../.claude/skills/<name>` | Yes. Codex scans `.agents/skills` (symlinks OK — OpenAI docs). Keep lockstep; never fork bodies. |
| Subagents | `.claude/agents/*.md` | Yes for Claude / Cursor. Codex has no parallel path — use AGENTS.md routes. |
| MCP catalog | `.mcp.json` + `.cursor/mcp.json` | Lockstep (unit-tested). Desktop Cursor loads them; Cloud often does not. |
| Codex MCP | `.codex/config.toml` | Project `[mcp_servers.*]` lockstepped to `.mcp.json`. Loads only when the project is **trusted**; user overrides may live in `~/.codex/config.toml`. |
| Claude MCP approve | `.claude/settings.json` → `enabledMcpjsonServers` | Lists the three catalog servers so Claude Code auto-approves project `.mcp.json` **after** workspace trust. Ignored until the trust dialog is accepted (Claude Code ≥2.1.196). |
| Cloud VM | `.cursor/environment.json` | `install` + Chromium path + allowlist of the three catalog commands. |
| Cursor entry | `.cursor/rules/apex-shared.mdc` | Always-on pointer at AGENTS / skills / MCP. |

**Layout principles (Claude + Codex + Cursor, 2026):**

1. **One always-on file.** `AGENTS.md` stays short: commands, hard don'ts,
   skill trigger table. Claude Code reaches it via `CLAUDE.md` → `@AGENTS.md`.
2. **One skill body.** Author under `.claude/skills/`; mirror to
   `.agents/skills/` with symlinks for Codex. Cursor loads both — never fork
   into `.cursor/skills/`.
3. **Progressive disclosure.** Skill `description` is the matcher; put deep
   recipes in `references/` so cold start stays cheap.
4. **Enforcement ≠ prose.** Permissions / MCP allowlists live in
   `.claude/settings.json`, `.cursor/environment.json`, and MCP catalogs —
   not as "NEVER" lines agents can forget.
5. **Path-scoped rules** (`.cursor/rules/*.mdc` with globs) for renderer
   backends; keep always-on rules thin.

**One-time Dashboard (not inventable from git):**

1. Save / Build the environment from this repo’s `.cursor/environment.json`.
2. Mirror the three servers under **Integrations & MCP** (same names/commands;
   prefer HTTP when a server can be remote; stdio needs the install script).
3. Put secrets in Cursor Secrets — never commit them into `mcp.json` `env`.
4. Per-user OAuth for any remote MCP that needs it.

When the host catalog is empty, use the Fallback column below (and
`./tools/mcp/apex-tools-mcp.sh call …`). Do not invent a fourth allowlist
name for a server that left `.mcp.json`.

## MCP servers

**Repo catalog** (root `.mcp.json` for Claude Code, `.cursor/mcp.json` for
Cursor, `.codex/config.toml` for Codex — the same THREE servers, lockstepped by
`tests/unit/agent-config.test.mjs`; trimmed from seven on 2026-09). Stdio wrappers use `command: bash` +
`args: ["tools/…", …]` because Cursor looks up `command` on `PATH`. The
`playwright-official` row pins the same package the shell wrapper audits
(`@playwright/mcp@0.0.79`) — never `@latest`. Cloud often does **not**
auto-load them — then use the Fallback column.

| Server | Prefix | Job | Fallback |
|---|---|---|---|
| **apex-tools** | `apex_*` | Pin safe flags on ten committed `tools/` CLIs against the **working tree**. Never github.io. | `./tools/mcp/apex-tools-mcp.sh call <name> '{…}'` |
| **playwright-official** | `browser_*` | Interactive host Chromium (resize / DOM snapshot / evaluate). Skills **survey-ui-matrix**, **css-play**. Batch shots → **playwright-probe** (CLI, not this MCP). | `npx -y @playwright/mcp@0.0.79` |
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
| Batch screenshots | skill **playwright-probe** (`shot.mjs` / `apex-capture`) | Chrome MCP while Playwright runs |
| Multi-angle car / garage (ONE Chromium) | `render-car.mjs --preset=spine` / `--shot=` · `garage-angles.mjs` | N× `carshot` relaunches; `page.screenshot` under SwiftShader |
| Tiny car inspect JPEG | `tools/car/carshot.mjs` (soft→CDP clip) | full `apex-capture` sweep |
| Interactive host browser | **playwright-official** (`browser_*`) | `test-bg.mjs`; chrome-devtools at the same time |
| One-screen CSS try-on | skill **css-play** → `css-play.mjs` / `playwright-mcp.sh play\|dom` | `layout-audit` matrix / `--gallery` |
| Start Playwright **groups** | `tools/ci/test-bg.mjs` (CLI only) | any `apex_*` wrap; host `browser_*` |
| Agent bloat / extract / dead code | skill **slim-bloat** → `bloat-auditor` + `bloat-scan.mjs` | a browser group; raising a ratchet to hide growth |

Call `apex_status` before any `apex_*` browser tool. Occupancy treats a
`playwright test` suite and the host Playwright MCP's LAUNCHED Chromium
(`.playwright-mcp` user-data-dir) as busy — close `browser_*`
(`browser_close`) before a browser wrap. The idle `@playwright/mcp` server
Cloud attaches for a whole session is reported (`playwright.hostMcp`) and
does not block (it did until 2026-09-10, which refused every browser wrap
here, always). Cursor's `--mcp-config {"playwright":...}` line is ignored.
Never run Chrome MCP while Playwright is running.

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
| `apex_garage` | `shot/garage-angles.mjs` | browser | garage-parts-livery |

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
