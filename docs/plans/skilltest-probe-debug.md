# Skilltest — probe-debug

Hands-on audit of the probe/debug skill + tool surface (2026-10-01). Ship tip at
start: `cd4ec4c6f` (later `6434ac25b`). Branch work: `cursor/skilltest-probe-debug-6483`
(report) and `cursor/probe-cli-help-guards-6483` (fix #690).

Method: follow each `SKILL.md` entry / tool header as a new agent would; prefer
small / `--list` / `--plan` / `--dry-run` / `--static` inputs; skip secrets, real
GPU, and network-blocked TinyFish.

## Verdict summary

| Bucket | Count |
|---|---|
| Works | 28 |
| Works with caveats | 14 |
| Broken (fixed in #690) | 15 |
| Not testable here | 6 |

## Skills

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| **agent-view** | works | `node tools/shot/agent.mjs help`; `… monza world --detail brief`; `… monza track --what corners`; `./tools/mcp/apex-tools-mcp.sh call apex_agent '{"track":"monza","command":"objective"}'` | References resolve; staging bootstrap works. | — |
| **mcp-probe** | works with caveats | `python3 tools/mcp/probe-mcp.py status\|help\|list-tools`; `node tools/mcp/mcp-cli.mjs probe --dry-run --backend webgpu`; `./tools/mcp/chrome-devtools-mcp.sh status`; `python3 tools/mcp/cdmcp-cli.py list-tools` | TinyFish half egress-blocked (documented). `cdmcp-cli` tool names lack `chrome_` prefix that `probe-mcp` uses — confusing when reading both. Daemon `chrome-start` not fully exercised (one-browser rule + load). | Proposal R1: document the two naming schemes in one table in `mcp-probe` SKILL. |
| **playwright-probe** | works with caveats | `apex-eval.mjs monza '…'`; `shot.mjs monza 0.1 orbit …`; `garage-angles --plan`; `flicker-gate --list`; `frame-report --track monza --quiet` | Many shot CLIs launched Chromium on `--help` (see Tools). Skill example `--views=spine` is correct (`spine` expands to hero/top/rear/side). | #690 |
| **webgl-debug** | works | `apex-eval.mjs singapore '({backend, hdr: GLX.hdrMode(), lights})' --backend webgl2` → `backend=webgl2`, `hdr=true`, `lights=40` | Skill recipes match; SwiftShader HDR true as expected. | — |
| **webgpu-debug** | works with caveats | `wgx-validate.mjs --static` → `ok:true`; `apex-eval … --backend webgpu` → `backend=webgpu`, `gpuErrors:0`, `msaa:1` | Full Dawn `wgx-validate` / `gfx-probe` not re-run (expensive; soft-present path already covered by eval). Skill correctly routes `--static` first. | Proposal R2: add a one-liner in SKILL that `apex-eval --backend webgpu` is enough for a smoke when Dawn gallery is too slow. |
| **css-play** | works | `css-play.mjs --list`; `css-play.mjs --screen settings --no-shot` → `dom.json` under `artifacts/css-play/` | Fast; catalog is a title-path subset of layout-audit (documented). | — |
| **survey-ui-matrix** | works with caveats | `layout-audit.mjs --list\|--help`; `--screen=title --viewport=ios-iphone-landscape` | SKILL said **48** screens × 11; live `--list` is **49** × 11. Claimed `menu-fit`/`fit-audit` have no `--help` (was true; fixed). | #690 (count + help note) |
| **ui-menu-a11y** | works | `node --test tests/unit/menu-a11y-audit.test.mjs` → 25/25; `pick-tests` path named in skill | Unit pins Escape/layers without browser. Full `test-bg ui` not run (10–40 min; named not-run). | — |

## Tools — `tools/mcp/`

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `apex-tools-mcp.sh` / `.mjs` | works | `help`; `call apex_status`; `call apex_pick_tests` (needs `files` not `paths`); `call apex_agent` / `apex_shot` dryRun | Schema uses `files`; agents who pass `paths` silently get empty pick. | Proposal R3: accept `paths` as alias of `files`, or reject unknown keys. |
| `mcp-smoke.mjs` | works | `node tools/mcp/mcp-smoke.mjs` → `mcp-smoke ok` | Warns when `TINYFISH_API_KEY` unset (expected). | — |
| `probe-mcp.py` | works with caveats | `status` / `help` / `list-tools` (56 tools) | TinyFish DOWN without key/egress. | — |
| `chrome-devtools-mcp.sh` | works | `status` / `help` — Bin OK, local clone present | — | — |
| `playwright-mcp.sh` | works | `status` / `help` — pins `@playwright/mcp@0.0.79` | — | — |
| `mcp-cli.mjs` | works | `--help`; `probe --dry-run` | — | — |
| `cdmcp-cli.py` | broken → fixed | `--help` printed `unknown: --help` | No top-level help. | #690 |
| `cdmcp-bg.mjs` | broken → fixed | `--help` detached `boot --help` measure | `start()` rewrites leading `--*` as `boot --*`. | #690 |
| `cdmcp-measure.py` | works | `--help` exits 0 (already gated) | — | — |
| `cdmcp-lamps.py` / `cdmcp-lamps-tune.py` | works (help only) | `--help` exits 0 | Full lamp suites need night tracks + Chromium MCP; skipped (load + time). | — |
| `report-server.mjs` | broken → fixed | `--help` bound `0.0.0.0` and hung | No help path. | #690 |
| `apex-report.js` | not testable | Browser paste (header) | Needs live page / phone path. Unit covers collector via `startReportServer`. | — |
| `tinyfish-mcp.sh` / `tinyfish-rpc.py` | not testable | `help` works; fetch needs key + egress | Documented container block. | — |

## Tools — `tools/shot/`

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `agent.mjs` | works | `help`; `monza world --detail brief`; `monza track --what corners` | — | — |
| `apex-eval.mjs` | works | monza corners; singapore webgl2; monza webgpu | — | — |
| `shot.mjs` | works | `monza 0.1 orbit artifacts/tmp/…/monza-orbit.png` (20 KB) | — | — |
| `apex-capture.mjs` | broken → fixed | `--help` would have defaulted to `modes` sweep | No help. | #690 |
| `garage-angles.mjs` | broken → fixed | `--help` ran full McLaren spine (~152 s) | Bare `--help` ignored by OWN_FLAGS. | #690 |
| `garage-frame.mjs` | broken → fixed | `--help` launched; failed `all_dark` gate | No help. Soft-present/WebGPU on this box often all-dark — separate caveat. | #690; Proposal R4: document SwiftShader garage-frame flake / gate. |
| `loading-probe.mjs` | broken → fixed | `--help` ran full RACE! probe | No help. | #690 |
| `flyby.mjs` | broken → fixed | `--help` shot monza flyby | No help. | #690 |
| `profile-gameloop.mjs` | broken → fixed | `--help` treated as track, timed out | Positional parse. | #690 |
| `backend-compare.mjs` | broken → fixed | `--help` compared webgl2/three | No help. | #690 |
| `pit-shots.mjs` | broken → fixed | `--help` ignored; would default albert_park | `--plan` works. | #690 |
| `motion-capture.mjs` | broken → fixed | `--help` → `invalid track: --help` | Fail-fast but not help. | #690 |
| `frame-report.mjs` | broken → fixed | `--help` → unknown flag (makeFlags) | Added to KNOWN + usage. | #690 |
| `flicker-gate.mjs` | works | `--list`; `--help` prints header pointer | — | — |
| `probe-page.mjs` | works | Library (imported by garage/css tools) | — | — |
| `baked-scenery.mjs` | not testable | Heavy multi-track gallery | Skip (time). | Proposal R5: add `--help` + `--plan`/`--limit`. |
| `repro-shot.mjs` | not testable | Needs a player `repro.json` blob | Header already warns cockpit is wrong. | — |
| `garage-interior.mjs` | works with caveats | Library gate; exercised via garage-frame failure path | `all_dark` on software WebGPU. | R4 |

## Tools — `tools/ui/`

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `css-play.mjs` | works | `--list`; `--screen settings --no-shot` | — | — |
| `layout-audit.mjs` | works | `--list` / `--help` / one-cell gallery | — | — |
| `menu-screens.mjs` | works | import smoke (`SCREENS`, `VIEWPORTS`) | — | — |
| `ui-scale-axis.mjs` / `circuit-axis.mjs` | works | import smoke | — | — |
| `menu-capture.mjs` | works | Library behind layout-audit gallery | — | — |
| `fit-audit.mjs` | broken → fixed | No `--help`; any argv launched Chromium | SKILL warned; still a foot-gun. | #690 |
| `menu-fit.mjs` | broken → fixed | Same as fit-audit | Same. | #690 |

## Ranked proposals (not built)

1. **R0 / #690 (done):** `--help` must never launch Chromium or bind a server — systemic across probe-debug CLIs. Shared `exitIfHelp` in `tools/lib/cli-args.mjs`.
2. **R1:** Unify chrome tool naming docs (`chrome_click` vs `click`) in mcp-probe SKILL + `cdmcp-cli` docstring.
3. **R3:** `apex_pick_tests` should accept `paths` as alias of `files`, or error on unknown keys (silent empty pick).
4. **R6:** Extend `OWN_FLAGS` / `makeFlags` habit to every shot CLI so unknown bare flags error instead of no-op (garage-angles pattern).
5. **R4:** Document or soft-fail `garage-frame` `all_dark` under software WebGPU; gate already exists but `--help` was the discovery path.
6. **R5:** `baked-scenery.mjs` `--help` / `--limit=1` for cheap smoke.
7. **R7:** Add `menu-fit`/`fit-audit` `--help` mention to `tools/README.md` generation (`@doc` already; regenerate after header tweaks).
8. **R2:** webgpu-debug SKILL one-liner for `apex-eval --backend webgpu` smoke.

## Not run (explicit)

- Browser groups `ui` / `hooks` / `gallery` (10–40 min SwiftShader each).
- `cdmcp-measure` / lamps full profiles; `chrome-start` multi-call daemon session.
- TinyFish fetch/search/deploy-check (egress + key).
- Full Dawn `wgx-validate` / `wgx-shot --gallery` / Lavapipe.
- `motion-capture` / `apex-capture cameras` real sweeps (after help fix, still expensive).

## Fix PR

| PR | Branch | Scope |
|---|---|---|
| **#690** | `cursor/probe-cli-help-guards-6483` | `--help` guards for mcp + shot + ui CLIs; `exitIfHelp`; survey-ui-matrix screen count; unit + tools-runnable pins |

Keep draft until CI green on the exact head; do not merge from this agent.
