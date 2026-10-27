VERDICT: FIX — tree paths and tool names are sound, but the race-entry snippet runs `go()` before the async `race()` settles, nothing in the skill says when `physState()` returns null, and the heap `filePath` advice sends output to `/tmp` (AGENTS.md bans that) and cites a stale `/workspace` root.
METRICS: SKILL.md 114 lines / 7304 B (~1.8k tok); description ~390 chars; 12 references files (chrome.md 183 L / 9603 B, recipes.md 26 L / 1583 B)

## Rows (severity | file:line | problem | fix)
1. HIGH | SKILL.md:46, references/chrome.md:107 | `__apex.race(id); go()` is shown with no await. `race()` returns a promise (`settled(startRace())`, apex.js:1016), and the circuit hydrates lazily. `go()` returns false when no grid is built yet (apex.js:892), so the race never starts. | Write `await __apex.race(id); __apex.go();` or point to the chrome.md Setup block, which polls `info().track`.
2. HIGH | SKILL.md (missing), chrome.md:90-91 | Says "poke `physState()`" but never says it returns `null` until `player.px` is set (apex.js:584). AGENTS.md §__apex requires `jump()` or `step()` after `race()`+`go()`. | Add one line: "`obs()`/`physState()` need `jump()` (then `snapCam()`) or `step()` after awaited `race()`+`go()`; `null` means not initialised."
3. HIGH | chrome.md:105, 166-173 | "`/tmp/...` works" for `take_heapsnapshot` contradicts AGENTS.md §Critical conventions ("never /tmp"). The roots example uses `file:///workspace`, but the repo root is `/home/user/f1-game`. It also never says which root the attached `mcp__chrome-devtools__*` client advertises. `probe-mcp.py` has no `roots/list` handler; `cdmcp-cli.py:47` and `cdmcp-measure.py:120` do, and both point at ROOT. | Use `filePath` = an absolute `<repo>/artifacts/heap/<name>.heapsnapshot`. Fall back to `/tmp` only on `Access denied`, then copy into `artifacts/`. Drop `/workspace`. Note per client: the attached client is untested, the `probe-mcp` CLI is `/tmp` only, the `cdmcp-*` clients use the repo root.
4. MED | references/recipes.md:25 | Names `deploy-check`, which is neither a skill nor an agent on this tree. | Name only agent `deploy-research`.
5. MED | chrome.md:79 | Uses a hand-rolled `until grep -qE …` watcher. AGENTS.md rule 4 requires `node tools/ci/wait-for.mjs --log-matches <log> '^= '`. | Replace the watcher with `wait-for.mjs`.
6. MED | SKILL.md:3 | Description is not in third person ("Use when…"). It mixes in out-of-scope "private chat MCP startup, Session terminated recovery, readiness and catalog contracts" (SKILL.md:109-114), and does not name `renderer-debug`, whose `references/chrome-devtools-perf.md` also covers heap. | Rewrite: "Drives the live working-tree canvas via chrome-devtools MCP… (poke __apex, heap snapshot, console, perf trace, memory census)". Move private-chat to the DESIGN-TOOLS route.
7. LOW | SKILL.md:55-59 | The census list omits `tools/gfx/mem-census.mjs`, the scripted track-switch heap-snapshot census (it cites compare/retaining paths). | Add it next to `vm-leak-census`.
8. LOW | chrome.md:47 | Says "HeadlessChrome GLX paints `#game-soft`", but TLX is the default and every backend blits there (AGENTS.md §Seeing). | Change "GLX" to "every backend".
9. LOW | chrome.md:88-89, 127 | Session narrative ("This session confirmed…") and a dated 2026-08-17 table bloat a recipe file. | Move both to `docs/research/CHROME-DEVTOOLS-MCP.md`.
10. LOW | chrome.md:120-121 | `npx serve … &` backgrounds with a shell `&`. AGENTS.md rule 4 wants a `run_in_background` task. | Say "as a background task".

## FIRST-WRONG-STEP
The ask: "poke `__apex.physState()` on the live working-tree canvas and take a heap snapshot". Following SKILL.md:45-46, the agent serves :3456, navigates, then runs `evaluate_script` with `__apex.race(id); go()` and then `physState()`.
- **First wrong step: the unawaited `race(id); go()` (row 1).** `go()` hits `!G.cars.length` and returns false, and `physState()` returns `null` (apex.js:584).
- **Even with an awaited race,** the skill never says `px` needs a `jump()` or `step()` (row 2). An agent that does not happen to copy the Setup block's `jump()` gets `null`. There is no hint that this means "not initialised" rather than "broken".
- **Second wrong step: the heap snapshot.** chrome.md:105 says `filePath` is required and "`/tmp/...` works". The agent writes to `/tmp`, which breaks AGENTS.md's no-`/tmp` rule. If it instead tries the documented `/workspace` root, the path does not exist.
- **Never stated:** `take_heapsnapshot` and `mcp__chrome-devtools__*` are browser tools that a subagent cannot drive (`mcp-browser-guard.sh`). recipes.md:12 only says "parent owns".

## Verified on the tree
Every path SKILL.md and chrome.md name exists except `deploy-check`:
- `probe-mcp.py` `status` / `list-tools` / `chrome-start` / `chrome-stop` / `call`. `chrome-start` refuses a live Playwright run (probe-mcp.py:725-731) and needs tmux (:736).
- `mcp-cli.mjs --url`, `--tlx-webgpu`, `--dry-run`.
- `cdmcp-bg.mjs <boot|ui|full> --port`, with the log and json names.
- `cdmcp-cli.py apex-shot --az` / `--el` / `--dist`.
- `debug-chrome.mjs`, `webgpu-chrome-args.cjs`, `gfx-probe.mjs`, the perf census tools, `layout-audit.mjs`.
- `awaitPresent` (apex.js:2168), `diag` (apex.js:2364).
- The heap tool names `take_heapsnapshot`, `compare_heapsnapshots`, `get_heapsnapshot_class_nodes`, `get_heapsnapshot_retaining_paths`, `close_heapsnapshot` (probe-mcp.py:76-86).
- `--memoryDebugging` in the wrapper (chrome-devtools-mcp.sh:84).

## COVERED / NOT COVERED
COVERED: SKILL.md (full), references/recipes.md (full), references/chrome.md (full), the `physState` / `go` / `race` source, the chrome-devtools-mcp.sh args, probe-mcp.py's daemon and refusal logic, the roots handling in the cdmcp clients, existence of every cited path, `.mcp.json`.
NOT COVERED (budget): references/traps*.md, renderer.md, offline.md, web-egress.md, research.md, device-report.md, hud-freeze.md, a deep read of the js-debugger / playwright-probe / agent-view descriptions (judged only from SKILL.md's routing line), `docs/DESIGN-TOOLS.md` anchors, `--help` runs of the CLIs (flags read from source instead), and whether Claude Code's attached client answers `roots/list`.
