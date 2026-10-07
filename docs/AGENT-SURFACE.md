# Agent surface — skills, MCP, tools, wrap

One map. Skills say **when**. MCP servers are **pinned calls**. `tools/` CLIs
do the work. Twenty-eight `apex_*` tools wrap the CLIs (`apex_garage`, `apex_track`, and `apex_shot_survey` are

sessions over one CLI each; `apex_job_*` run the minutes-long ones in the background).

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
| Cloud VM | `.cursor/environment.json` | `install` + shared runtime Chromium discovery + allowlist of the three catalog commands. |
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

1. Link this repo to environment **Apex 26** ([819b740b-ac05-11f1-b532-320a589b8025](https://cursor.com/dashboard/cloud-agents/environments/e/819b740b-ac05-11f1-b532-320a589b8025)). **Save** from `.cursor/environment.json` on the ship branch, then **Build** until the newest row is green. Committed `environment.json` wins over personal dashboard JSON; recurring / config-change builds are what new agents boot from (not one-off draft builds from agents).
2. When starting a Cloud Agent, pick that environment — not a generic default. After boot, `cursor-cloud environment-info` should show `source: "Repository"`, `build.resolution: "resolved"`, and a `buildId`; run `npm run test:guards` without `npm install` first.
3. **MCP (required for `apex_*` / `browser_*` / `chrome_*` in Cloud):** the host
   does **not** attach project `.mcp.json` by itself ([capabilities](https://cursor.com/docs/cloud-agent/capabilities)).
   In [Cloud Agents → Integrations & MCP](https://cursor.com/agents) (team-shared:
   Dashboard → Plugins & MCPs) register these three **stdio** servers — same names /
   `bash` wrappers as root `.mcp.json`. Pasteable catalog (keep `command: bash`;
   do **not** use bare `npx @playwright/mcp`):

```json
{
  "apex-tools": {
    "type": "stdio",
    "command": "bash",
    "args": ["tools/mcp/apex-tools-mcp.sh", "serve"],
    "timeout": 900000
  },
  "chrome-devtools": {
    "type": "stdio",
    "command": "bash",
    "args": ["tools/mcp/chrome-devtools-mcp.sh", "run"]
  },
  "playwright-official": {
    "type": "stdio",
    "command": "bash",
    "args": ["tools/mcp/playwright-mcp.sh", "run"]
  }
}
```

   After editing ship `.cursor/environment.json`, **Save** the environment so the
   dashboard allowlist matches git. Each `mcpServerAllowlist` row keeps its
   `name` and a **full launch pattern** (`*bash tools/mcp/<wrapper>.sh …`) —
   Cursor matches `command` + `args` joined, with `*` wildcards
   ([enterprise MCP allowlist](https://cursor.com/docs/enterprise/model-and-integration-management);
   `tests/unit/environment-json.test.mjs`). A stale save shows three nameless
   `{ "command": "bash" }` rows in `environment-info` (or bare `npx` for
   playwright) and host attach fails. **Enable all three** in the launch MCP
   dropdown (catalog often ships only two until toggled — measured 2026-09-03;
   re-checked 2026-10-06).
4. Put secrets in Cursor Secrets — never commit them into `mcp.json` `env`.
5. Per-user OAuth for any remote MCP that needs it.

**Healthy Cloud session check** (after Save + new agent):

| Signal | Good | Broken (this session 2026-10-06) |
|---|---|---|
| `environment-info` → `source` / `build.resolution` | `Repository` / `resolved` | (VM OK even when MCP empty) |
| `environment-info` → `mcpServerAllowlist` | three named rows with distinct `*bash tools/mcp/…` patterns | nameless `{command:"bash"}` ×3 |
| Dynamic MCP namespaces | `apex-tools`, `chrome-devtools`, `playwright-official` plus `cursor*` | only `cursor`, `cursor-cloud`, `cursor-subscriptions` |
| VM wrappers | `bash tools/env/ensure-mcp-ready.sh` / `mcp-smoke` OK | n/a (VM ≠ host attach) |

**MCP empty in this session?** CLI fallbacks work without attachment:
`bash tools/mcp/apex-tools-mcp.sh call …`, `bash tools/mcp/playwright-mcp.sh run`,
`python3 tools/mcp/probe-mcp.py chrome-start` (see Fallback column below).
`tools/env/cloud-agent-install.sh` runs `tools/env/ensure-mcp-ready.sh` at the
end (Playwright chrome-channel symlink + `mcp-smoke.mjs`) — that validates the
VM, not host MCP attachment. If `environment-info` shows an allowlist without
**`name`** on each row, re-**Save** the environment from git’s
`.cursor/environment.json`, then start a **new** agent with all three MCPs enabled.

When the host catalog is empty, use the Fallback column below (and
`./tools/mcp/apex-tools-mcp.sh call …`). Do not invent a fourth allowlist
name for a server that left `.mcp.json`.

## MCP servers

**Repo catalog** (root `.mcp.json` for Claude Code, `.cursor/mcp.json` for
Cursor, `.codex/config.toml` for Codex — the same THREE servers, lockstepped by
`tests/unit/agent-config.test.mjs`; trimmed from seven on 2026-09). Stdio wrappers use `command: bash` +
`args: ["tools/…", …]` because Cursor looks up `command` on `PATH`. The
`playwright-official` row launches the shell wrapper's `run`, which pins
`@playwright/mcp@0.0.79` (never `@latest`) and passes the Chromium
`tools/lib/chromium-path.mjs` discovers — the bare package cannot launch in the
cloud container (measured 2026-10-05: its default `chrome` channel wants
/opt/google/chrome, and `--browser chromium` wants the build its own bundled
Playwright pins, not the installed one). Cloud often does **not**
auto-load them — then use the Fallback column.

| Server | Prefix | Job | Fallback |
|---|---|---|---|
| **apex-tools** | `apex_*` | Pin safe flags on committed `tools/` CLIs against the **working tree** (the wrap map below is the count). Never github.io. | `./tools/mcp/apex-tools-mcp.sh call <name> '{…}'` |
| **playwright-official** | `browser_*` | Interactive host Chromium (resize / DOM snapshot / evaluate). Skills **survey-ui-matrix**, **css-play**. Batch shots → **playwright-probe** (CLI, not this MCP). | `bash tools/mcp/playwright-mcp.sh run` (stdio) |
| **chrome-devtools** | `chrome_*` (upstream names) | Interactive live canvas / DOM / heap / perf on the working tree, with the WebGPU flags from `webgpu-chrome-args.cjs`. Skill **mcp-probe**. | `tools/mcp/chrome-devtools-mcp.sh run` / `python3 tools/mcp/probe-mcp.py chrome-start` |

**Removed 2026-09 (CLI only now, not MCP-attached):**

| Was | Why it left the catalog | The CLI that remains |
|---|---|---|
| **playwright** (the wrapper under its old name) | Its 2026-09 `run` combined `--isolated` with `--user-data-dir` and failed to connect; the bare package replaced it, then failed to launch in the container (above). Since 2026-10-05 the fixed `run` IS **playwright-official**. | `tools/mcp/playwright-mcp.sh status\|play\|dom` (css-play) |
| **chrome-devtools-official** | Duplicate of **chrome-devtools** minus the WebGPU flags; two Chrome MCPs fought over one box. | `npx -y chrome-devtools-mcp@1.7.0` by hand |
| **tinyfish** (`127.0.0.1:3711`) and the `tinyfish_*` half of **probe** | Container egress blocks `agent.tinyfish.ai`, so the in-repo proxy can never answer here. The hosted TinyFish connector in the main session and the host fetch tool can. | `tools/mcp/tinyfish-mcp.sh` on a box with egress; key from shell / gitignored `.env` only (no tracked fallback) |
| **probe** (`chrome_*` + `tinyfish_*` bridge) | Its `chrome_*` half duplicates **chrome-devtools**; its `tinyfish_*` half is dead in-container. | `python3 tools/mcp/probe-mcp.py chrome-start` / `call` — the persistent-daemon flow has no MCP equivalent and stays |

**Cloud / desktop global catalog.** Cloud Agents do **not** read
`~/.cursor/mcp.json`. Add servers at https://cursor.com/agents (MCP dropdown)
when the host catalog is empty; `apex-tools` and `playwright-official` are
already in project `.mcp.json`. Never run **chrome-devtools** next to
`browser_*`, and never either of them while `playwright test` is live.

**Two first-use traps of `browser_*` in a Cloud container (measured 2026-10-05).**
1. `Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`:
   the host's `playwright-official` asks for the Chrome *channel*, which the
   image does not ship. Point that path at the harness Chromium instead of
   running `playwright install` — `mkdir -p /opt/google/chrome && ln -sf "$(node
   tools/lib/chromium-path.mjs --path)" /opt/google/chrome/chrome`.
2. `browser_take_screenshot` times out (5 s) on any page with the live game
   canvas: the WebGL loop never goes idle. Hide it first —
   `browser_evaluate` `() => { document.getElementById('game').style.display = 'none'; }`
   — then screenshot (menu / HUD work only; a render check is `apex_shot`).

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
| Multi-angle car / garage (ONE Chromium) | `garage-angles-fetch.mjs` (BEFORE pack) · `render-car.mjs --preset=spine` / `--shot=` · `garage-angles.mjs` AFTER only | N× recapturing the 11-team garage grid; Car shot / `carview.html` |
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
names the CLI. Twenty-six tools (30 → 11 on 2026-09: the audits, startline,
survey-track, carshot, wgx-shot/capture/validate-live, layout-audit --survey,
quick-validate, select-recall, track-verts, assets-verify
and verify-track are plain CLIs now — `tools/README.md`; 11 → 12 on 2026-09-24 for
`apex_frame_report`, a node-VM framing report that answers in seconds what a
flyby render answers in minutes; 12 → 13 on 2026-10-01 for the read-only
`apex_doctor` capability and skill diagnostics; 13 → 16 on 2026-10-02 for
`apex_session_status`, `apex_who_is_on_it` and `apex_ci_status`, the three
read-only session checks; 16 → 24 on 2026-10-03 for `apex_track` (a persistent
track session: boot once, then shots in ~10–25 s instead of ~45 s each),
`apex_job_start`/`_status`/`_cancel` (survey-track, layout-audit matrices,
flicker-gate, frame-report --fleet, parts-sweep, livery-contrast in the
background), `apex_ui_fit`/`apex_ui_shot` (one menu screen × viewport, ~15 s)
and `apex_car_audit`/`apex_track_audit` (offline checks, seconds); 24 → 26 on
2026-10-04 for `apex_hud_shot` and `apex_hud_survey`, the race-HUD survey —
one CLI, `shot/hud-survey.mjs`, two wraps: one cell vs a matrix); 26 → 27 on
2026-10-05 for `apex_unit_test` (`node --test` of one `tests/unit/` file, the
browser-free check eight skills run every session and none had a wrap). The
same day `apex_eval` gained `backend` and `vm` (the Node VM route, no
Chromium), `apex_hud_shot` / `apex_hud_survey` gained `backend`, and
`apex_track_audit` gained `checks` (every per-circuit audit against its
baseline through `track/audit-circuit.cjs`; the bare call still runs the
verify-track + float-audit pair). `apex_unit_test` is built-in: `node --test`
of one `tests/unit/` file, no CLI of its own.

<!-- WRAP-MAP -->
| MCP tool | CLI | Kind | Skill |
|---|---|---|---|
| `apex_status` | built-in | tree | check-changes |
| `apex_doctor` | `check/doctor.mjs` | tree | check-changes |
| `apex_pick_tests` | `ci/pick-tests.mjs` | tree | check-changes |
| `apex_select_specs` | `ci/select-specs.mjs` | tree | check-changes |
| `apex_verify_change_fast` | `ci/verify-change.mjs` | tree | check-changes |
| `apex_bump_cache_check` | `ci/bump-cache.mjs` | tree | check-changes |
| `apex_rotate_markings_check` | `track/rotate-markings.cjs` | tree | new-track |
| `apex_graph_parity` | `track/graph-parity.cjs` | tree | scenery-dress |
| `apex_frame_report` | `shot/frame-report.mjs` | tree | playwright-probe |
| `apex_session_status` | `ci/session-status.mjs` | tree | steward |
| `apex_who_is_on_it` | `ci/who-is-on-it.mjs` | tree | steward |
| `apex_ci_status` | `ci/ci-watch.mjs` | tree | steward |
| `apex_track` | `shot/track-session.mjs` | browser | survey-track |
| `apex_job_start` | `mcp/apex-extras.mjs` | tree | check-changes |
| `apex_job_status` | `mcp/apex-extras.mjs` | tree | check-changes |
| `apex_job_cancel` | `mcp/apex-extras.mjs` | tree | check-changes |
| `apex_ui_fit` | `ui/layout-audit.mjs` | browser | ui-menu-a11y |
| `apex_ui_shot` | `ui/layout-audit.mjs` | browser | survey-ui-matrix |
| `apex_car_audit` | `car/parts-ladder.mjs` | tree | garage-parts-livery |
| `apex_track_audit` | `track/audit-circuit.cjs` | tree | survey-track |
| `apex_unit_test` | built-in | tree | check-changes |
| `apex_eval` | `shot/apex-eval.mjs` | browser | playwright-probe |
| `apex_agent` | `shot/agent.mjs` | browser | agent-view |
| `apex_shot` | `shot/shot.mjs` | browser | playwright-probe |
| `apex_shot_survey` | `shot/track-session.mjs` | browser | survey-track |
| `apex_garage` | `shot/garage-angles.mjs` | browser | garage-parts-livery |
| `apex_hud_shot` | `shot/hud-survey.mjs` | browser | survey-ui-matrix |
| `apex_hud_survey` | `shot/hud-survey.mjs` | browser | survey-ui-matrix |

Pins the wrap always applies (you cannot override them):

- `apex_doctor` → `--tree --json` (diagnostics only; never installs or launches)
- `apex_verify_change_fast` → `--fast --json` (never `--wait`)
- `apex_bump_cache_check` → `--check --json` (never `--apply`)
- `apex_pick_tests` / `apex_select_specs` → `--json` (never `--bg`)
- `apex_rotate_markings_check` → `--check` (never `--write`)
- `apex_graph_parity` → requires `base` (never vacuous HEAD-vs-clean); `all:true`
  outlasts the 180 s cap (killed at ~46 of 52 circuits, 2026-10-05), so it starts the
  `graph_parity_all` job (`BASE` by env, `--all` pinned) and returns its `jobId`
- `apex_frame_report` → one circuit: `track` must be a `Tracks.LIST` id, `u`
  (numbers in 0..1, ≤ 64) or `frames` (1..120) but not both, `shots` must be an
  existing JSON file under `artifacts/` or `scratch/` (symlinks resolved); never
  `--out` / `--fleet` / `--diff` / `--pose`. The fleet sweep
  (`frame-report.mjs --fleet`, ~10 min) and `--diff old.json new.json` stay CLI.
- `apex_who_is_on_it` → `--json`, never `--claim` / `--release` (they push refs);
  `paths` that start with `-` are refused so none reaches the CLI as a flag
- `apex_ci_status` → `ci-watch.mjs --once --sha <hex|HEAD>`, never `--timeout` /
  `--pages`; exits 0/1/2/124 are verdicts (`ok:true`, `out.verdict`), 3 (no
  token / API down) is a tool error. Watching a run stays a Monitor on the CLI
- `apex_shot_survey` → one `track-session.mjs --serve` boot per circuit, then
  1–32 shots, contact `sheet`, `index.html`, `progress.json`, `findings.json`;
  presets `quick`|`dual_lite`|`night_pass`|`scenery`|`full`|`lap`|`dual`|`inspect`
  or explicit `fracs` / `shots`; `tracks[]` queues circuits sequentially; long or
  multi-track runs default to async (`apex_job_start` kind `shot_survey`, returns
  `jobId`); `resume` skips existing PNGs; `gl` prefers `llvmpipe` when Mesa dri
  is present; never spawns N separate `shot.mjs` boots
- `apex_track` → one session per server: `open` takes the browser lock until
  `close` (or the server exits); `op survey` is the same batch as
  `apex_shot_survey`; `cam`/`tod`/`frac` are enum- and range-checked,
  `az`/`el`/`dist`/`h` bounded, `track` must be a `Tracks.LIST` id, `out` stays under
  `artifacts/`/`scratch/`. `h` is metres above the road (eye height on `eye`, aim
  point on `orbit` — frames a prop far overhead); `el` on `eye` is the pitch
- `apex_job_start` → `kind` from a fixed list (includes `shot_survey`), each with
  its own argv builder; callers pass values (ids, comma lists), never flags; at
  most two jobs run; browser kinds hold the lock until they exit;
  `apex_job_cancel` kills the group.
  The reported `log` is the CLI's stdout (its report; the status `tail` reads it),
  `stderr` the file beside it, both in `artifacts/logs/apex-jobs/`
- `apex_ui_fit` / `apex_ui_shot` → ONE screen × viewport; the matrix is a job
- `apex_car_audit` → `ladder` or `crest` only (the minutes-long sweeps are jobs)
- `apex_hud_shot` / `apex_hud_survey` → `hud-survey.mjs --json --out <dir>`,
  never `--plan` / `--self-test` / `--url`; `apex_hud_shot` always passes
  `--device` and `--cam` (one cell, never the quick matrix); every knob is an
  enum or a bounded number, inline `preset` offsets and a `matrix` file (JSON
  under `artifacts/` or `scratch/`) are validated by the CLI's own pure
  validators before the lock; `matrix: exhaustive` (~4 h) is refused without
  a `shard` (or dispatch `.github/workflows/hud-survey.yml`). Results carry `structuredContent`, its
  serialized copy as the first text block, and `resource_link`s (PNG /
  findings.md / index.html / report.json)
- Browser wraps never take `--url`; output paths (`out`) must stay under
  `artifacts/` or `scratch/`

## Never wrap

These stay CLI-only on purpose. The MCP must refuse if asked to grow them.

<!-- NEVER-WRAP -->
| CLI / action | Why | Use instead |
|---|---|---|
| `test-bg.mjs` start / `--wait` / `--stop` | Minutes of Playwright; foreground-illegal | CLI `test-bg.mjs`; skill **check-changes** |
| `verify-change.mjs` without `--fast` | Starts browser groups | `apex_verify_change_fast` |
| `node tools/ci/bump-cache.mjs --apply --at N --root _site` | Deploy-only: hashes a STAGED shell (pages.yml); the repo carries `?v=dev` and `--apply` refuses without `--root` | `check-changes/references/bump.md` |
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
