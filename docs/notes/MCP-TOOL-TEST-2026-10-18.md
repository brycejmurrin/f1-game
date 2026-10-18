# MCP tool-by-tool test — 2026-10-18

Bryce's ask, relayed by the "Project overview" session: test each of our MCPs and all their tools, then consider what to add,
improve, or use better (skills, web research). This note is the record. Branch `cursor/mcp-tool-tests-2a9f`, branched from
`cursor/plugin-policy-fixes-9c4d` (it builds on `MCP-REVIEW-2026-10-18.md` and `PLUGIN-SKILL-POLICY-2026-10-18.md`).

**Result in one line:** 117 tools across 4 servers were called (apex-tools 34/34, playwright-official 24/24,
chrome-devtools 40/40, js-debugger 19/19). Two apex-tools ran only as dry runs and a few sub-actions were not exercised; see "Not called". Five real
defects, all in our own code, are fixed on this branch; the third-party servers had no tool failures, only input mistakes of mine.

## How this was measured (read before trusting a number)

- **apex-tools**: the attached server answered (v1.16.0, 34 tools, connected in this session; no stderr to report). Every tool
  was driven through a small stdio JSON-RPC client (`scratch/mcp-harness.mjs`, not committed) that spawns
  `bash tools/mcp/apex-tools-mcp.sh serve` and times each `tools/call`. Latency is wall time at that client. Browser tools
  ran one at a time, never beside another browser (loadavg 0.5 at start, peaking at 5.6 during a SwiftShader boot). The attached
  tool path was also exercised directly for `apex_help`, `apex_job_start`, `apex_job_cancel`, `apex_job_status`.
- **Bytes** for apex-tools are the whole JSON-RPC line, which carries the text block AND `structuredContent`, so a payload is
  about half the figure (a 72 KB `apex_who_is_on_it` is 36 KB of data twice). The spec asks servers to also return the
  serialized JSON as text for compatibility ([tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools),
  "Structured Content"), so this duplication is by design; the cost is real for clients that feed both to the model.
- **playwright-official, chrome-devtools, js-debugger** were called through the attached tools. The host exposes no timer for
  those, so latency is **not measured**; sizes are read off the replies (approximate). Where a number is stated for them it is
  the server's own (Lighthouse 3.1 s, trace bounds) or `tools/list` bytes measured with the same stdio client.
- Browser servers ran one at a time. After chrome-devtools the page was left on `about:blank`; js-debugger used a Chromium
  from `tools/mcp/debug-chrome.mjs` (port 9222), stopped afterwards. **The brief said to attach js-debugger to the
  chrome-devtools Chrome. That is not possible here**: the wrapper launches Chrome with no `--browser-url` and no debugging
  port (see proposal 7), so `debug-chrome.mjs` is the only attach target.
- Not called: real `apex_verify_change_fast` and `apex_hud_survey` (dryRun only: minutes of CPU / a ~10 min matrix, rule 4),
  `apex_garage` ops other than open/status/shot/close, `debugger_exception_log action:clear`. No Playwright test group ran.

### `tools/list` cost (bytes, measured)

| server | tools | `tools/list` bytes |
|---|---|---|
| apex-tools | 34 | 51,471 (was 71,511 before `apex_help` landed) |
| chrome-devtools 1.7.0 | 40 | 32,038 |
| playwright-official (Playwright 1.63 alpha) | 24 | 18,546 |
| js-debugger 0.1.0 | 19 | 12,240 |
| **total** | **117** | **114,295 (~29k tokens if loaded eagerly)** |

In Claude Code these are deferred behind ToolSearch, so the cost is paid per loaded schema, not per session.

## 1. apex-tools — 34 tools

| tool | args (first call) | result | latency | bytes | useful to an agent? |
|---|---|---|---|---|---|
| `apex_verify_change_fast` | `{"dryRun":true}` | OK (dryRun) | 1 ms | 609 | dryRun only (real run is minutes of CPU, rule 4). |
| `apex_pick_tests` | `{"files":["js/circuits/monza.js"]}` | OK | 50 ms | 2286 | OK. Named groups, small. |
| `apex_bump_cache_check` | `{}` | OK | 121 ms | 705 | OK. |
| `apex_status` | `{}` | OK | 49 ms | 2752 | OK. Lock, chrome, test-bg, loadavg in one read. |
| `apex_catalog` | `{}` | OK | 278 ms | 6134 | OK. Every id; 6 KB. |
| `apex_help` | `{"tool":"apex_shot"}` | OK | 2 ms | 4110 | OK. Full schema of one tool (4 KB); replaces 20 KB of `tools/list` prose. |
| `apex_locations` | `{"track":"monza"}` | OK | 81 ms | 10618 | OK. 10.6 KB for one track (no `limit`). |
| `apex_doctor` | `{"full":true}` | OK | 179 ms | 120718 | OK. Default slim (1 KB). `full:true` is 120 KB: too big, no `limit`. |
| `apex_eval` | `{"track":"monza","expr":"info()"}` | OK | 53.8 s | 589 | vm and browser route both OK mechanically; a throwing expr (`info()`) gave `ok:true` on the browser route. Fixed. |
| `apex_shot` | `{"track":"monza","frac":0.1,"cam":"park"}` | OK | 57.4 s | 44390 | Bad track: ERROR with the full track list in `message` (1.5 KB) as designed; real shot OK. |
| `apex_shot_survey` | `{"track":"monza","preset":"quick","async":true}` | OK | 0.1 s + job 80 s | 1340 | ERROR on first call: `unknown flag --output-root`; FIXED in `track-session.mjs`, re-run job done in 73 s. |
| `apex_agent` | `{"track":"monza","command":"help"}` | OK | 5.3 s | 12734 | OK (`help`, 4 s cold boot, 12.7 KB). |
| `apex_garage` | `{"op":"close"}` | OK | 756 ms | 307 | OK: open, status, shot, close. Other ops (team/livery/design/frame/diff/sheet/reload) not called. |
| `apex_select_specs` | `{"since":"HEAD~3"}` | OK | 866 ms | 11093 | OK. 11 KB with shard summaries. |
| `apex_rotate_markings_check` | `{}` | OK | 4.6 s | 3043 | OK but 4.6 s for a check; summary good. |
| `apex_graph_parity` | `{"base":"HEAD","id":"monza"}` | OK | 8.0 s | 3116 | OK, 8 s for one circuit. |
| `apex_frame_report` | `{"track":"monza","frames":3}` | OK | 6.7 s | 8421 | dryRun OK; real `frames:3` OK, 8 KB text table + thumbs. |
| `apex_session_status` | `{}` | OK | 132 ms | 10235 | OK. 10 KB handoff block. |
| `apex_who_is_on_it` | `{"noFetch":true,"hours":2}` | OK | 104 ms | 72189 | TOO BIG: 72 KB (36 KB payload), 95 claims incl. stale/released. Fixed (see Applied). |
| `apex_ci_status` | `{"sha":"HEAD"}` | OK | 2.0 s | 673 | OK but `exit:124` + `ok:true` reads as success; `out.verdict` is the signal. HEAD unpushed gave `no workflow run yet`. |
| `apex_hud_shot` | `{"track":"monza","async":true,"device":"phone-landscape-844x` | OK | 0.1 s + job 70 s | 1539 | OK as job (64 s), PNG link, findings in `report.json`. |
| `apex_hud_survey` | `{"dryRun":true}` | OK (dryRun) | 50 ms | 681 | dryRun only (quick matrix ~10 min). |
| `apex_hud_mock` | `{"async":false,"cams":["chase"],"sets":["shipped"]}` | OK | 40.1 s | 2713 | OK sync 40 s, four `resource_link`s, 2.7 KB. |
| `apex_track` | `{"op":"close"}` | OK | 2.0 s | 339 | OK: open 15.7 s, eval, shot 25 s (image), track, status, close. `eval` error is `isError:true` but has no `fix`. |
| `apex_profile` | `{"track":"monza","frames":10}` | OK | 0.1 s + job 70 s | 1203 | OK as job (61 s, 10 frames); first frame 2.4 s = SwiftShader boot cost, not signal. |
| `apex_profile_query` | `{"file":"artifacts/profiles/none.json"}` | ERROR | 50 ms | 709 | ERROR path only (bad file): raw ENOENT, no `fix`. Fixed. Valid file run via CLI: OK table, `out:null`. |
| `apex_job_start` | `{"kind":"float_all"}` | OK | 0.0 s + job 100 s | 1031 | OK (`float_all` 94 s; shot_survey/hud/profile via the pairs above). |
| `apex_job_status` | `{}` | OK | 1 ms | 3505 | OK. |
| `apex_job_cancel` | `{"jobId":"nope"}` | ERROR | 1 ms | 318 | OK: unknown id gives `fix`; real cancel 2 s, `survivors:0`. |
| `apex_ui_fit` | `{"screen":"title"}` | OK | 8.7 s | 9239 | OK, 9 KB of numbers. |
| `apex_ui_shot` | `{"screen":"title"}` | OK | 9.9 s | 37216 | OK, thumbnail attached (31 KB b64). |
| `apex_car_audit` | `{"check":"ladder"}` | OK | 167 ms | 3673 | OK (`ladder`). |
| `apex_track_audit` | `{"track":"monza"}` | OK | 2.9 s | 857 | OK. One call replaces verify-track + float-audit. |
| `apex_unit_test` | `{"file":"tests/unit/mcp-cli.test.mjs"}` | OK | 851 ms | 493 | OK. Counts only (slimmed). |

**Findings**

1. `apex_shot_survey` / `apex_job_start shot_survey` **failed on every call**: `shot-survey.mjs` passes `--output-root` and
   `--designs` to `track-session.mjs`, whose `parseFlags` whitelist (`tools/shot/track-session.mjs:45`) lacked both, so the
   child exited with `unknown flag --output-root` and the job reported `track-session exited before ready (1)`. The
   `"hint":"Retry with --resume"` was misleading. Fixed (1 line + test); the re-run finished in 73 s.
2. `apex_eval` on the browser route returns `ok:true, exit:0` with `out:{err:"info is not defined"}` for a throwing
   expression, while `vm:true` exits 1. The expression scope is `a` (= `__apex`), which the tool description never says. Fixed:
   `ok:false`, `isError`, and a `fix` naming `a.info()`.
3. `apex_who_is_on_it` returns 95 claims including stale and released ones. Fixed: only live claims plus `hiddenClaims`.
4. `apex_profile_query` on a missing file returned a raw `ENOENT` with no `fix`. Fixed.
5. `apex_doctor {full:true}` is 120 KB, `apex_locations` 10.6 KB and `apex_select_specs` 11 KB with no `limit`/`offset`.
   Proposal 3.
6. `apex_ci_status` returns `ok:true` with `exit:124` for "no run yet / still running". Documented in code, but an agent
   reading `ok` alone is misled. Proposal 8.
7. `apex_track op:eval` on a bad expression is a correct `isError:true` but carries no `fix` (same scope hint as finding 2).

## 2. playwright-official — 24 tools, all called

Wrapper `playwright-mcp.sh run`; running version `@playwright/mcp@0.0.79` (pinned) on Playwright 1.63 alpha;
latest on npm is **0.0.83**. The game loaded at `http://localhost:3456` (title, 1 console warning: WebGPU context provider).

| tool | exercise | result | size / usefulness |
|---|---|---|---|
| `browser_navigate` | game URL; `about:blank`; a 404 | OK | ~0.5 KB; page title, console counts, snapshot file link |
| `browser_snapshot` | `depth:3`; `depth:4, boxes:true` | OK | 0.7–3 KB inline. Useful, but the title screen text contains decorative `▾ ▴` glyph runs (see game note below) |
| `browser_find` | text `race`, regex | OK | 2.4 KB; cheaper than a snapshot, returns refs |
| `browser_click` / `browser_hover` | SETTINGS by ref; injected button | OK | 0.4 KB + snapshot file link |
| `browser_evaluate` | `__apex.agentHelp()` keys | OK | exact; echoes the code it ran |
| `browser_take_screenshot` | jpeg to file | OK | file link only, no image bloat |
| `browser_resize` | 844x390 | OK | per tab: a new tab came up 1280x720 |
| `browser_console_messages` | level warning | OK | 0.2 KB |
| `browser_network_requests` / `browser_network_request` | filtered, one body | OK | 0.5 KB; hides 498 static requests, says so |
| `browser_tabs` | new, select, close, list | OK | 0.3 KB |
| `browser_navigate_back`, `browser_press_key`, `browser_wait_for` | | OK | 0.2–0.6 KB |
| `browser_type`, `browser_select_option`, `browser_fill_form`, `browser_drag`, `browser_drop`, `browser_handle_dialog`, `browser_file_upload` | injected fixture form | OK on a clean page; first try ERROR (my fixture sat under the open SETTINGS `<dialog>`) | the timeout error is ~2 KB of Playwright call log, 5 s each |
| `browser_run_code_unsafe` | `page.title()`, `files.length` | OK | RCE-equivalent by its own description |
| `browser_close` | | OK | |

Useful as-is. Weak spots: errors are verbose; `browser_handle_dialog` returns empty output on success;
`artifacts/playwright-mcp/` collects a snapshot file per action (76 KB for 18 files in this short run; no
`--output-max-size`). **Game finding for the UI skills (not fixed here):** the Playwright snapshot of the title screen carries
`▾ ▾ ▴ ▴` text runs and `SIZE PREVIEW GAS` fragments as text nodes. chrome-devtools' snapshot of the same page does not, so the
decorative chevrons are exposed to the accessibility tree in a way Chrome filters but Playwright's does not.

## 3. chrome-devtools (1.7.0) — 40 tools, all called

Emulated a phone: `emulate viewport 844x390x3,mobile,touch,landscape` (confirmed `innerWidth 844, dpr 3, maxTouchPoints 1`).

| tool(s) | result | size / usefulness |
|---|---|---|
| `list_pages`, `new_page`, `select_page`, `close_page`, `navigate_page` | OK | 0.1–0.2 KB |
| `take_snapshot` (inline and `filePath`) | OK | 1 KB for the title screen with stable `uid`s. **uids die on re-render** (stale `1_17` gave a clear error) |
| `click`, `hover`, `fill`, `fill_form`, `type_text`, `press_key`, `drag`, `upload_file`, `handle_dialog`, `wait_for` | OK | `wait_for` returns a fresh snapshot (good). `click` on a button that opens `alert()` reports an Error although the dialog opened |
| `evaluate_script` | OK | exact JSON |
| `list_console_messages`, `get_console_message` | OK | issues show up as `[issue]` with counts |
| `list_network_requests`, `get_network_request` | OK, but `resourceTypes:["fetch","xhr","document"]` still listed `.png` and `.json` | 0.5–1.5 KB |
| `emulate` | OK; `networkConditions:""` is rejected by validation (omit it instead) | |
| `resize_page` | **silent no-op while an `emulate` viewport is active** (asked 1000x600, stayed 844x390) | |
| `take_screenshot` | OK to file (161 KB jpeg at q60, 844x390@3x) | |
| `performance_start_trace` / `stop_trace` / `analyze_insight` | OK. Reload trace: LCP 1458 ms (render delay 1435 ms, TTFB 23 ms), CLS 0. `ForcedReflow` insight named `sheet-shape.js classifyBody` 36 ms, `scroll-fade.js measure` 66 ms, `appearance-studio.js previewContent` 50 ms, total 82 ms on boot (SwiftShader, so relative only) | each trace reply is ~6 KB of which ~3.5 KB is a fixed format legend |
| `take_heapsnapshot` + 11 `get_heapsnapshot_*` / `compare` / `close` | OK. Menu heap 64 MB (36.6 MB V8, 27.5 MB native, 13.9 MB typed arrays; strings 21.9 MB) | `get_heapsnapshot_duplicate_strings {pageSize:3}` returned **~35 KB** because each row lists every node id. Sizes print as `6,162 kB`, so a CSV row such as `0.0 kB,4,458 kB` cannot be split reliably |
| `lighthouse_audit` (snapshot, mobile) | OK, 3.1 s: A11y 100, Best practices 100, SEO 100, Agentic browsing 100; 28 passed / 0 failed | 0.6 KB + report files. `URL: undefined` |

**Game findings from the live tools (not fixed here, for the owners of those areas):**
(a) the menu heap holds **2,307 copies of one generated WGSL fragment string** (and 297 and 6 of two more); the retained sizes
the tool prints for them are double counted, so this is a count, not a megabyte figure. Hypothesis, not checked: the
three.js node-builder output is kept per material instance rather than per shader;
(b) `window` carries 13 `blur`, 13 `pointerup`, 13 `pointercancel`, 12 `resize` and 8 `orientationchange` listeners
(109 total) on the title screen: either many modules register their own, or something re-registers on a screen change; worth a
`debugger_listeners` check across a race restart; (c) Chrome Issues panel: "form field element should have an id or name" ×6.

## 4. js-debugger — 19 tools (the brief and the review note say 17)

Attached to the game at `127.0.0.1:3456` (phone-landscape 844x390), breakpoint at `game.js:8338` (`tickBody`), logpoint at 8340.

| tool | result | notes |
|---|---|---|
| `debugger_targets` (page, service_worker) | OK | title reads `F1 Racing &amp; Data` while Playwright and chrome-devtools show `&`: Chrome's `/json` target list escapes it; cosmetic |
| `debugger_attach`, `debugger_detach` | OK, `cleanupErrors:[]` | `resumedEventObserved:false` after detaching a running page is fine |
| `debugger_scripts` (`filter`, `limit`) | OK, `game.js` 9,349 lines | |
| `debugger_source` | OK, bounded excerpt | |
| `debugger_breakpoint` (conditional), `debugger_remove_breakpoint` | OK | hit on the first frame |
| `debugger_state` | OK, but **~2.5 KB for one pause** (3 frames × 4 scopes with objectIds) | proposal 6 |
| `debugger_evaluate` | OK, **returned only an `objectId` handle for an object result** | Fixed: now also returns a one-line `summary` |
| `debugger_properties` | OK | |
| `debugger_control` (`over`, `into`, `resume`) | OK. The acknowledgement says `paused:false` while `debugger_state` shows `paused:true reason:step` | documented ("acknowledgments are not pause evidence") but it is the first thing an agent trusts |
| `debugger_control resume` without a token while paused | clear `Stale or missing pauseToken` error | |
| `debugger_logpoint` | refused while paused (`resume first`), then OK; `logpoint_read` returned 59 hits, 17 ms frames | useful |
| `debugger_run` | OK, operationId, result via state | |
| `debugger_exceptions`, `debugger_exception_log` (start/read/stop) | OK; recorded a caught `TypeError` | stack frames show script 371 anonymous (my own eval) |
| `debugger_listeners`, `debugger_instances` | OK; 109 window listeners; 7 live `HTMLCanvasElement` | |
| `debugger_incident` | OK: jpeg + json under `scratch/debug-incidents/`, `resource_link`s | |

## 5. Failures, consolidated

| # | Where | Failure | Status |
|---|---|---|---|
| 1 | `tools/shot/track-session.mjs` | `unknown flag --output-root` kills every `shot_survey` | **fixed** |
| 2 | `apex_eval` | throwing expression reported `ok:true` | **fixed** |
| 3 | `apex_who_is_on_it` | 36 KB payload, stale claims | **fixed** |
| 4 | `apex_profile_query` | raw ENOENT, no `fix` | **fixed** |
| 5 | `debugger_evaluate` | object result is an opaque handle | **fixed** |
| 6 | chrome-devtools `resize_page` | silent no-op under `emulate` | upstream; doc in skill |
| 7 | chrome-devtools duplicate-strings | unbounded `nodeIds` (35 KB for 3 rows) | upstream; the 1.11 changelog adds truncation to other heap tools, not this one (unverified) |
| 8 | all browser servers | no way to attach js-debugger to the chrome-devtools Chrome | proposal 7 |

No third-party tool failed on valid input.

## 6. Proposals, ranked by value per cost

Sources for the third-party facts: Playwright MCP README
(<https://raw.githubusercontent.com/microsoft/playwright-mcp/main/README.md>) and releases
(<https://github.com/microsoft/playwright-mcp/releases>); chrome-devtools-mcp README
(<https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/README.md>), CHANGELOG
(<https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/CHANGELOG.md>) and configuration
(<https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/docs/configuration.md>); MCP tools spec
(<https://modelcontextprotocol.io/specification/2025-06-18/server/tools>); `anthropic-skills:mcp-builder`. npm latest:
`@playwright/mcp` 0.0.83 (2026-09-28), `chrome-devtools-mcp` 1.11.0 (2026-10-15).

| rank | proposal | value | cost | where |
|---|---|---|---|---|
| 1 | **Bump chrome-devtools-mcp 1.7.0 → 1.11.0** (pin in `chrome-devtools-mcp.sh:14`). 1.8 required `pageId` on page tools by default (check our skill text), 1.9 added path restrictions, 1.10 chunked trace parser and bounded console/network retention, 1.11 slimmer text snapshots, `compare_heapsnapshots` pagination, `get_heapsnapshot_details` truncation, a fix that closed a healthy browser after a 60 s tool call, `analyze_heapsnapshot_contexts`. Directly addresses findings 7 and the 6 KB trace legend | high | low, but re-run this test after | `chrome-devtools-mcp.sh` |
| 2 | **Bump `@playwright/mcp` 0.0.79 → 0.0.83**: 0.0.81 closes idle headless browsers after one hour (`--idle-timeout`), 0.0.83 fixes a server crash on download, dialog during `navigate`, `browser_wait_for` cap message | medium | low | `playwright-mcp.sh:18` |
| 3 | **Size caps and `limit` on the big apex-tools reads**: `apex_doctor full`, `apex_locations`, `apex_select_specs`, `apex_who_is_on_it` get `limit`/`offset` and `truncated`, the pattern `debugger_scripts` already follows. `outputSchema` stays; this is the spec's own pagination advice | high | medium (a shared helper in `slimBody`) | `apex-tools-mcp.mjs` |
| 4 | **`tooling_fast` and `gate_only` as `apex_job_start` kinds** (the job layer, log tail, and lock exist): AGENTS.md's loop step 3 and step 6 run `tooling-fast.mjs --changed --jobs=3` and `deploy.mjs --gate-only` every session, each 2–15 min, each told to run as one background task with a log path. Today that is `Bash run_in_background` + a hand-written log grep. Verdict line in `out` | high (every session, twice) | low | `apex_job_start` kinds |
| 5 | **Read-only `apex_ready_gate {pr}`** wrapping `ready-gate.mjs --pr`: AGENTS.md rule 12 and 7 skill files send agents to it before every draft→ready; the answer is an exit code plus text. Same shape as `apex_ci_status` | medium | low | new wrapper |
| 6 | **`debugger_state` `frames`/`scopes` limit** (default top frame, 2 scopes) and a `paused` field on the `debugger_control` acknowledgement that reflects the real state | medium | low | `js-debugger-session.mjs` |
| 7 | **Let chrome-devtools and js-debugger share one Chrome**: start Chrome with a CDP port, pass `--browser-url` to chrome-devtools-mcp (documented flag), attach js-debugger to the same endpoint. Removes the second browser the brief tried to avoid | medium | medium (changes the launch model of the chrome wrapper) | `chrome-devtools-mcp.sh` |
| 8 | **`apex_ci_status`: add a top-level `pending:true` when the exit is 124 or no run exists**, and the same `a.` scope hint on `apex_track op:eval` errors | low | low | `apex-tools-mcp.mjs` |
| 9 | **Third-party flags**: chrome-devtools `--no-usage-statistics` (usage statistics default on unless `CI` or `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` is set; this container sets neither) and `--no-performance-crux`; `--category-extensions=false`/`--category-pwa=false` are already default off; Playwright `--output-max-size`, `--console-level warning`, `--snapshot-mode full` kept; consider `--experimental-structured-content` on chrome-devtools. Never `--caps` beyond the default | medium (privacy hygiene, less noise) | low | both wrappers |
| 10 | **Read-only `apex_pr_board`** (wraps `pr-board.mjs`): the `ci-watcher` agent already runs it through Bash and returns a table | low | low | new wrapper; skip if the agent covers it |

### Add or drop a server? (against `SKILL-MCP-SCOUT-2026-10-18.md`)

The scout (`origin/cursor/skill-mcp-scout-3e7b`) advised **no new MCP servers** and ranked offline CLIs (zizmor, actionlint,
ast-grep, glslang, axe) first. This test supports that: four servers already cost ~29k tokens of `tools/list`, nothing in
117 tools was missing for the workflows tested, and every defect found was in our own wrapper code, not a gap in coverage.
**No exception is proposed.** On dropping: keep all four. `playwright-official` and `chrome-devtools` overlap on
navigate/click/evaluate/snapshot, but the first is the one the survey and UI skills use (`browser_resize`,
`browser_snapshot`) and the second is the only one with traces, heap analysis, Lighthouse and phone emulation; making either
opt-in would save a Node process per session and cost the startup-race hardening the preflight just added. Revisit if a
session ever needs the RAM.

### Skills that should change (no edits made: `.claude/**` is outside this lane)

- `mcp-probe` and `js-debugger` still say the debugger attaches to "the chrome-devtools Chrome"; it cannot today (proposal 7).
  Also: js-debugger has 19 tools, not 17.
- `mcp-probe` should record that `resize_page` is ignored while an `emulate` viewport is active (use `emulate viewport`).
- `playwright-probe`/`agent-view` should say the `apex_eval` scope is `a`.

## 7. Applied on this branch

All under `tools/mcp/**` except the one-line flag fix, each with a unit test; verified with
`node --test tests/unit/apex-tools-mcp.test.mjs tests/unit/js-debugger-mcp.test.mjs` (108 + 63 tests, 0 failures) and
`node tools/ci/tooling-fast.mjs --changed --jobs=2` (verdict below).

| commit | change | lines |
|---|---|---|
| `f3d6a4c4` | `slimBody`: `apex_eval` throw ⇒ `ok:false` + `a.` hint; `apex_profile_query` ENOENT `fix`; `apex_who_is_on_it` drops stale/released claims (`hiddenClaims`) | +14 |
| `0598565e` | `tools/shot/track-session.mjs`: accept `--output-root`, `--designs` (outside `tools/mcp/**`, one line, test fails without it) | +1 |
| `1a3e46cc` | `js-debugger-session.mjs`: `debugger_evaluate` returns `summary` from V8's preview | +9 |

Not applied (bigger than 30 lines or outside the lane): proposals 1–10.
