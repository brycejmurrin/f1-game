# Where Cursor agents spend tokens, and what was built (2026-10-20)

Method: nine Cursor cloud runs in flight (a Fleet D wave: five UI surveys, two experiments, two audits, one hunter), read with
`tools/ci/cursor-agents.mjs` (`transcript`, `call`) over the run stream's replay so far (capped at 12 s per run), plus the 56
cached runs from earlier. "Result characters" are the stored size of tool results in the stream, a proxy for input tokens: the
stream carries no token counts. One snapshot, runs still going; the shares can move as they finish.

## What the nine runs show

533 tool calls, about 1,804K stored result characters; assistant text 3K, thinking 144K. Output is not the cost; reading is.

| tool | share | calls | avg chars |
|---|---|---|---|
| `read_file` | 34 % | 148 | 4,194 |
| `grep_search` | 23 % | 139 | 2,939 |
| `run_terminal_cmd` | 19 % | 105 | 3,215 |
| `edit_file` | 13 % | 15 | 16,093 (the harness echoes the whole file) |
| `file_search` | 5 % | 32 | 2,840 |
| `get_mcp_tools` + `mcp` | 6 % | 76 | ~1,300 |

- Reads are already ranged (121 of 148 passed `offset`/`limit`) and rarely repeat (3 repeats in 56 earlier runs). What repeats is
  exploration of one big file: `js/ui/hud.js` was read 17 times in chunks (80K). `lsp_outline`, the tool for "a module's shape
  without reading it", was called 3 times against 148 reads.
- One agent read the 39K survey `SKILL.md` five times; the survey lanes already use pre-written scripts (`layout-audit`,
  `menu-mock`, `fit-audit`, `hud-survey`), so the cost is the exploration before the command, not the scripts.
- The largest terminal results were agents' own one-offs, not our scripts: a `node -e` that digested `audit.json` printed 64K,
  and a runner log piped through `tee` put 42K in context. Our audit scripts' own output was small (46K over 15 calls, 2.5 %).
- 53 of 678 distinct calls failed (8 %). The one failure our tools contributed to: `apex-lsp lsp_workspace_symbols`, called three
  times, a name our server does not have. The error wording ("Tool ... was not found. Use GetDynamicTools") is the Cursor
  harness's, not ours, so the harness rejects an unlisted name before it reaches the server.

## Recommendations I made, and what the data did to them

| earlier recommendation | verdict |
|---|---|
| launch prompts carry the exact commands | **kept**, built as `lane-preamble.mjs` |
| alias `lsp_workspace_symbols` -> `lsp_symbols` | **changed**: a hidden alias cannot work (the harness rejects the name first) and a published one adds a description to every listing for ~3 failed calls in 533. The `lsp_symbols` description now says it is the workspace search and that the other name does not exist (+61 bytes). |
| a "what changed" digest script | **dropped**: reads rarely repeat, and `lsp_outline` already exists; the gap is that it is not used. The preamble now steers to it. |
| bound the audit scripts' output | **dropped as stated**: their own output is small. The fix is a bounded reader for `audit.json` (`audit-summary.mjs`) and a redirect pattern in the preamble. |
| dump transcripts at hand-back | **kept**, built as `cursor-agents.mjs handback` |

## Built

- `tools/ui/audit-summary.mjs`: totals, worst N cells, per-screen rollup, skips counted apart (layout-audit's own red / skipped /
  amber definitions), one cell expandable with repeated finding lines collapsed to a count. Checked against a real `audit.json`
  (4 cells; 12 clipped findings printed as 3 lines). A real run also showed that `layout-audit`'s geometry mode ignores `--out`
  and writes `artifacts/layout-audit/`, merging with earlier rows; the tool defaults there.
- `tools/ci/lane-preamble.mjs`: the TOOLING block for a survey launch prompt (~1.1K characters in place of the 39K skill file),
  with screens and viewports checked against `layout-audit --list` (a typo fails in a second, not after the grid). A real run
  found a parser bug fixtures had hidden (viewport names followed by one space were dropped: 8 of 11 found); the test pins the
  real catalog.
- `cursor-agents.mjs handback <agent>`: waits, reads and caches every retrievable run while the 24 h stream lasts, prints a
  bounded digest (one line per run, at most five failures, artifact count). On the 16-run chat: 4.6 s, 3.4K characters,
  exit 1 because its last run was cancelled (the `wait` contract).

## Fleet survey: the last 200 Cursor agents (2026-10-21)

Listed the last 200 agents (2026-10-18 to 10-20) and ran `cursor-agents.mjs dump` over all of them: 1,452 runs were past the
24 h stream window, so the sample is the 34 agents (101 runs, ~4,300 calls, ~15M result characters) of the last day. Three
read-only subagents digested one role group each (survey, build + hunt/audit, infra) with `cursor-transcript.mjs`; I
re-counted the headline numbers myself. The survey found two `dump` hangs, both fixed: a RUNNING run's stream never closes
(now `live=`), and neither does a FINISHED run's on an agent with a live follow-up (now cut at 60 s, `slow=`).

| pattern | evidence | direction |
|---|---|---|
| `edit_file` echoes the whole file before and after | 27-33 % of every group (1.8M of 5.7M in build/hunt; 0.2M was actual diff); one survey run edited its own `pass2-lane-hud.mjs` 22 times at ~23K each | one edit per file holding every hunk; a change repeated across 3+ files goes through one terminal script printing `git diff --stat`; never re-edit a report, append to it. Not verified: whether the echo reaches the model or only the stream |
| grep instead of apex-lsp for JS symbols | LSP experiment, one run per arm: control 229 calls / 459K / 165 greps / 0 LSP; optional 137 / 236K / 81 / 23; required 147 / 180K / 28 / 89 (I re-counted). Survey lanes: 0 LSP calls in 1,547 | make apex-lsp required in the launch prompt for any named symbol: -61 % characters, -36 % calls on that task |
| hand-rolled audit post-processing | survey: 93 inline `node -e` / heredoc scripts, 503K; `layout-audit.mjs` run only 8 times | `lane-preamble.mjs` + `audit-summary.mjs` (built above; not yet on the deploy branch, so these agents could not use them) |
| GitHub issue loops in triage | 4 triage runs, 650K through `gh issue view` loops over number ranges; one ran its loop twice | a bounded `issue-digest.mjs` (one row per issue); the orchestrator saves the lane's issue list once for dedupe |
| MCP discovery churn and names that do not exist | 217 `get_mcp_tools` calls, ~500K; failures on Github, Browser-use, spector-webgl, mcp-context7, `lsp_workspace_symbols` | name the exact servers and tools in the prompt ("no GitHub MCP: use `gh`"), discover once per run, `--mcp-file` with only the lane's servers |
| process listings with full Chromium command lines | survey 16-20 `ps` calls, 267-290K; AGENTS.md rule 7's own `ps ... args` command printed 20-23K | use `comm` or `cut -c1-160` in rule 7 |
| re-reading big reference files | `docs/AGENT-SURFACE.md` (50K) read 18 times in 14 infra runs; `hud.js` 7-9 times per run; agents re-read their own spilled outputs 42 times (~320K) | an `mcp-inventory` table (< 2K) in place of AGENT-SURFACE.md; `lsp_outline` before any file over 500 lines; output over 50 lines goes to a file |
| unbounded test output and waits | `tooling-fast --changed` printed 13-57K (it lists every pass); `while sleep 30` waiters; `wait-for.mjs` used 0 times | a failures-only mode for tooling-fast; name `wait-for.mjs` in the prompt |

Failures were 1-8 % of calls in every group with no retry storms (longest identical streak 3); the main repeated failure
is `grep_search` with glob `**/*` (30 refusals over 11 runs). The subagents' reports and their counting scripts are in
`scratch/survey/reports/` (local, not committed).

## Not verified

Whether the survey launch prompts already carried commands (the stream has no user messages); whether the preamble changes what
an agent does (needs a before/after on a survey lane); A2's remark that cloud subagents were blocked (no `task` call in its
replay). The shares above are one snapshot of runs still in progress.
