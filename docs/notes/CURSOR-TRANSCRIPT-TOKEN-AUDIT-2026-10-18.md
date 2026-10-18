# Cursor transcript token audit: f1-game cloud agents

Research snapshot 2026-10-18, ship `758646374`; data pulled 3:49–3:50 AM PT. A recommendation only: no runtime code,
tool, skill, hook, setting or existing doc changes. It extends [#2899](https://github.com/brycejmurrin/f1-game/pull/2899)
(token efficiency from committed records) by reading the Cursor Cloud conversations themselves. Code links are pinned
to `758646374`.

## 1. Executive findings and priorities

No Cursor token or cost record was reachable, so every size is a labelled proxy: stored result characters, call counts
and turn counts. Over 121 cloud-agent transcripts (26,241 tool calls; Oct 5–6 and Oct 17–18):

1. **Large-context turns that change nothing.** 278 of 1,003 follow-up turns (28%) made at most one tool call. At those
   turns the median accumulated transcript was 578K characters (an upper bound; host compaction is not visible).
   Timer wakes are FIXED (143 timer turns Oct 5–6 → 7 Oct 17–18). Wakes on the agent's own status comments are a
   CURRENT GAP: 65 turns Oct 17–18, 56 no-ops. The source is in the repo:
   [`role-pr-owner.md:51`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/role-pr-owner.md#L51)
   says to "post the same line as a PR comment on every state change", which the 2:53 AM launch briefs contradict.
2. **`sync-pr.mjs` streams every verify stage to the caller** (`stdio: "inherit"`,
   [`sync-pr.mjs:81`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/sync-pr.mjs#L81)).
   One call returned 754,776 characters (bc-94efd3ae L64, 2:38 AM PT Oct 18), 76% of that session's result volume. The agent
   then grepped the terminal spill file to find the verdict (L77, L83). Across the sample, 222 sync-pr calls returned 1.40M characters. CURRENT GAP.
3. **MCP discovery detours.** 933 `get_mcp_tools` calls in 112 sessions. 261 returned a schema the session already had,
   81 asked for a nonexistent `Github` namespace and 26 for built-ins (TodoWrite, AwaitShell, Task).
   [`AGENTS.md:73`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/AGENTS.md#L73)
   still says to open drafts via "GitHub MCP", which Cursor Cloud lacks. Duplicates fell from 228 to 33 between waves. PARTLY FIXED.
4. **The repo's compact producers never reached Cursor agents.** Of the 65 sessions that show their namespace list, 51
   saw only `cursor`, `cursor-cloud` and `cursor-subscriptions`, and 14 (Oct 18) also saw `apex`. Not one of 908 `mcp`
   calls went to apex-tools or apex-lsp. That means `slimBody`, job-status caps and LSP concise rows did not apply;
   navigation ran on 5,207 greps and 6,220 reads. apex-lsp landed at 11:13 PM PT Oct 17, so this is a HOST LIMITATION
   for earlier sessions and a CURRENT GAP in adoption on Oct 18: 0 calls, and Cursor has no `lsp-hint` equivalent.
5. **Post-ready churn costs wall time and turns more than tokens.** After marking #2824 ready, its owner ran four ship
   merges and seven poll loops (about 10,200 s of tool time); the token cost is the extra CI runs' notification turns, not the loops. The briefs now say to end at STOP AT, but
   [`role-pr-owner.md:45`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/role-pr-owner.md#L45)
   still says "keep watching until merged". PARTLY FIXED.

Also FIXED: identical rereads of guidance docs fell from 150 (50 sessions) to 20 (71 sessions). Oct 5–6 sessions
reread steward SKILL.md 13–17 times; no Oct 17–18 session reread a skill five times.

**Priorities:** P1 compact `sync-pr`; P2 one status channel; P3 host-neutral PR/MCP text; P4 apex-lsp on Cursor; P5 a Cursor transcript digester.

## 2. Access limits and sampling

| History | Access | Carries |
|---|---|---|
| Cursor Cloud agent list | 200 agents (3:49 AM PT): title, status, branch, PR, archived | no usage fields |
| Cloud runs | 121 dumps (106 MB), 6 refreshed 3:50 AM PT; 79 listed agents undumped (unavailable, not empty) | text, reasoning, tool calls (args on 15,566 of 26,241), stored results, timings. **No token, cost, cache or per-run fields**; model only via `run-info` |
| Local CLI | this is the orchestrator VM, not Bryce's machine. `~/.cursor/projects/workspace` holds tool/terminal spill files only; `~/.claude/projects` holds 33 Claude Code teleport exports (30 unique sessions) | Claude per-request usage; not Cursor (side reference in §5) |
| IDE conversations | unavailable from this box | — |
| Archived vs active | the list flags archived; dumps cover archived agents and 6 running | — |

**Method.** Scripts in gitignored scratch computed metrics for all 121 dumps without printing pages. 13 sessions were
then reconstructed turn by turn. Definitions are in the appendix.

**Bias.** Dumps exist where the orchestrator managed waves: two bursts, PR owners over-represented, the Oct 17 hook
incident inflating turns, six partial or running. Stored size is not model-visible size (the host may truncate), and a
blocking call is one call, not tokens.

## 3. Session inventory (13 reconstructed)

Turns are follow-ups after the launch prompt. "Res K" is stored result characters (proxy). "Rsn K" is reasoning characters.

| Session | Work | Model | Start PT | Turns / no-op | Calls | Res K | Rsn K | Outcome |
|---|---|---|---|---|---|---|---|---|
| bc-01a11052 | orchestrator | default | Oct 6 01:26 | 190 / 66 | 1,085 | 2,755 | 304 | coordination, 4 timers |
| bc-cf7a956c | #1021 owner, CI red | default | Oct 5 18:37 | 67 / 13 | 1,370 | 3,352 | 399 | merged |
| bc-4cdc054c | UI title menu | n/r | Oct 5 10:50 | 19 / 5 | 735 | 2,162 | 207 | #1010 merged |
| bc-af7ba75a | ratchet carve | default | Oct 17 13:39 | 18 / 6 | 809 | 1,413 | 253 | #2768 merged |
| bc-6f151752 | centreline kinks | grok-4.7 | Oct 17 21:37 | 7 / 2 | 376 | 672 | 159 | #2824 merged |
| bc-b3d2eca8 | Bahrain kinks | gpt-5.6-sol-medium | Oct 17 15:13 | 0 | 66 | 106 | 8 | attempt cap; #2789 closed |
| bc-e6684b3d | photo cards (UI) | gpt-5.6-sol-medium | Oct 17 14:04 | 16 / 4 | 370 | 490 | 49 | #2772 open |
| bc-c783e917 | barrier-jump cap | gpt-5.6-sol-medium | Oct 17 14:04 | 6 / 0 | 87 | 272 | 13 | #2775 merged |
| bc-43efec42 | livery takeover | composer-2.5 | Oct 18 02:15 | 4 / 1 | 150 | 218 | 20 | #2829 merged |
| bc-94efd3ae | #2863 Zandvoort | default | Oct 18 02:35 | 3 / 1 | 94 | 999 | 19 | open draft |
| bc-f7051dbe | MCP follow-ups | n/r | Oct 18 02:23 | 1 / 0 | 72 | 218 | 10 | #2886 merged |
| bc-6658853d | skills fixes | n/r | Oct 18 02:14 | 1 / 0 | 144 | 236 | 16 | into #2865, merged |
| bc-881a2f94 | fleet-core rules | n/r | Oct 18 03:33 | 0 | 138 | 287 | 18 | #2901 draft |

Fleet: 1,003 follow-up turns, plus 215 notifications batched into them. Reasoning text totalled 6.73M characters,
against 0.88M of visible assistant text.

## 4. Timeline case studies

**A. Centreline kinks, opposite shapes: bc-6f151752 vs bc-b3d2eca8.** bc-6f151752 made 293 launch-turn calls before
its first push (10:43 PM) and was ready about 11:16 PM. A conflict justified the 11:39 PM sync; it re-merged ship at
12:38, 1:49 and 2:35 AM (about 490 s each) chasing generated-file drift, polling between (`seq 1 40|50|60`: 3,616, 2,009
and 1,456 s; L970/L991/L1006). bc-b3d2eca8 read its guidance once, made 66 calls in 36 minutes, hit its three-attempt
cap, reverted and stopped. A hard stop rule and no monitoring separated them; models and outcomes differ, so costs are not comparable.

**B. Stacked monitoring: bc-01a11052 (Oct 6).** Four timers at once (5-minute ×43 fires, 15-minute ×15, two
30-minute ×7 each) plus subscriptions: 66 of 190 turns were no-ops and 52 of 74 discovery calls duplicates. Current
briefs ban this; Oct 17–18 owners show 7 timer turns in total.

**C. One oversized result: bc-94efd3ae.** `git commit && sync-pr --resume` ran 728 s and returned 755K characters
(L64). The agent grepped the spill file for the verdict, then tee'd later runs to a log (L90, L93): the
compact-with-log pattern the tool should default to.

**D. Harness work.** bc-881a2f94 and bc-6658853d each finished in one turn of about 140 calls and stopped at a pushed
draft. bc-af7ba75a made 391 launch-turn calls (129 greps; 21–22 partial reads each of `game.js` and `apex.js`, i.e.
symbol navigation before apex-lsp existed), then 18 turns: six no-ops, three of them for superseded-sha CI (fleet-wide
18 of 181 CI notifications), and seven from incident broadcasts. A `game.js` carve is larger than rule edits; this shows
where calls went, not equal cost.

## 5. Tool output: producer and consumer

Stored result characters: read_file 22.9M (6,220 calls, median 2.8K), terminal 17.8M (8,855, median 464), grep 13.0M
(5,207, median 491), get_mcp_tools 2.4M, mcp 1.4M. grep is mostly fine: 62 results over 20K characters (1.2% of calls) carry 44% of its volume. Those were repo-wide
content searches spanning 100–558 files. `gh run view --log*` ran 204 times (median 1.2K), and was mostly already piped through grep or tail.

| Surface (current code) | Observed | Status |
|---|---|---|
| [`sync-pr.mjs:79-84`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/sync-pr.mjs#L79) `runStage` inherits stdio | 755K in one call, verdict buried | CURRENT GAP (default) |
| [`ci-watch.mjs:49`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/ci-watch.mjs#L49) `--failures-only`/`--once`; annotations capped at 5 ([`:348`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/ci-watch.mjs#L348)) | 307 calls, 300K total; loops around it were the issue | FIXED (tool and briefs) |
| [`apex-tools-mcp.mjs:1816`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/mcp/apex-tools-mcp.mjs#L1816) `slimBody`; [`apex-extras.mjs:479-483`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/mcp/apex-extras.mjs#L479), [`:560`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/mcp/apex-extras.mjs#L560), [`:598`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/mcp/apex-extras.mjs#L598) (tail on every status) | 0 Cursor calls | exists; HOST LIMITATION |
| [`lsp-mcp.mjs:640`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/mcp/lsp-mcp.mjs#L640) `concise=false`, `MAX_ROWS = 200` | 0 MCP calls; `lsp-mcp.sh` CLI used 4 times in 1 session | CURRENT GAP (adoption) |
| [`role-pr-owner.md:51`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/role-pr-owner.md#L51) status comment on each change | 56 of 65 own-status turns were no-ops | CURRENT GAP (instruction) |
| [`AGENTS.md:73`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/AGENTS.md#L73) "GitHub MCP"; [`apex-shared.mdc:21`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.cursor/rules/apex-shared.mdc#L21) says three servers, `environment.json` lists five | 81 namespace misses, 26 built-in lookups | CURRENT GAP (host-specific text) |
| `subscribe_github_ci` re-subscribe | 102 of 480 returned an id already held (34 sessions); 141 `list_subscriptions` | CURRENT GAP (minor) |
| [`session-transcript.mjs:2-13`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/session-transcript.mjs#L2) reads Claude `list_events` pages only | nothing digests Cursor dumps | CURRENT GAP (capability) |

**Side reference (Claude Code, not Cursor).** The 30 teleported sessions here (Oct 17–18), deduplicated by message
and request id: 5,809 requests; 1.94B cache-read, 12.8M cache-write, 12K uncached input, 3.33M output tokens (cache
reads 99.3% of input); median context 314K tokens, 1,960 requests above 400K. Provider counters, not billing, and not
Cursor, but they show repeated large-context turns dominate, which is why finding 1 outranks shortening output.

## 6. Fixed vs current gaps

| Finding | Class | Cause |
|---|---|---|
| Short and stacked timers | FIXED (143 → 7 timer turns) | brief rule followed |
| Repeated skill/doc reads | FIXED (150 → 20 identical rereads) | steward card, briefs |
| Duplicate MCP discovery | PARTLY FIXED (228 → 33); misses persist | unclear instruction |
| Own-status comment wakes | CURRENT GAP | skill contradicts brief |
| Post-ready monitoring/re-sync | PARTLY FIXED; `role-pr-owner.md:45` | contradiction |
| `sync-pr` output volume | CURRENT GAP | poor default |
| Apex MCP on Cursor | HOST LIMITATION (Oct 5–17); UNVERIFIED what the Oct 18 `apex` namespace exposed | environment |
| LSP adoption on Cursor | CURRENT GAP (new tool) | no Cursor nudge |
| Stale-sha CI wakes | HOST LIMITATION (branch-scoped subscription) | one cheap check each |
| Token attribution | HOST LIMITATION | no usage in dumps |

## 7. Ranked implementation plan

Output levels:
- **Compact:** verdict line, exit code, counts and log path.
- **Diagnostic:** adds the first failing block with its cause or stack.
- **Full:** the saved log, on request.

Always print omission markers. Never replace a verdict with "looks good".

1. **P1: `sync-pr` compact stages (small).**
   - In `runStage`, pipe each stage to `artifacts/logs/sync-pr-<stage>.log` and print `[sync-pr] <stage>: pass|FAIL|timeout (exit N) log=<path>`.
   - On failure, print the last 60 lines plus any `not ok`/`Error` blocks and an omitted-lines marker. `--stream` keeps today's behaviour.
   - Keep the 124 timeout code and the resume hint.
   - Callers: [check-changes sync-pr](../../.claude/skills/check-changes/references/sync-pr.md), steward/agent-fleet references, briefs.
   - Test: in [`sync-pr-robust.test.mjs`](../../tests/unit/sync-pr-robust.test.mjs), inject a failing `run` and assert the exit code, the excerpt and the log path.
   - Validate by replaying one sync, old vs new. No open PR touches the file.
2. **P2: a single status channel (small).**
   - Change `role-pr-owner.md:45-54`: status lives on the body line, which [`pr-board.mjs:60-66`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/pr-board.mjs#L60) already parses. Keep `@orchestrator NEEDS-DECISION:` comments.
   - Line 45 becomes "end the run at STOP AT".
   - Risk: the orchestrator loses comment events, so confirm pr-board reads the body first.
   - Overlap: #2884 edits this file.
3. **P3: host-neutral routing text (small).**
   - `AGENTS.md:73` becomes "your host's PR tool (Claude: GitHub MCP; Cursor: built-in PR tool or `gh`)".
   - `apex-shared.mdc` lists all five servers and says built-in tools need no discovery.
   - Overlap: #2901 edits both files.
4. **P4: apex-lsp on Cursor (medium).**
   - Check `environment-info` on one fresh agent against Bootstrap §3.
   - Name the `lsp-mcp.sh def|refs|callers` CLI in the always-on Cursor entry (`js-nav.mdc` attaches only with js/ files in context).
   - Validate on a matched symbol-edit task by counting LSP calls and grep→read chains.
   - Overlap: #2862, #2870, #2878, #2873.
5. **P5: Cursor transcript digester (medium).** A `--cursor` input for `session-transcript.mjs`, or a sibling script, that emits the appendix metrics. P1–P4 cannot be measured without it.
6. **P6: subscribe once per branch (trivial).** Brief text only.

Not recommended: blanket truncation hooks or stripping MCP text/structured duplicates; neither is measured and both can hide exit codes. Models and the orchestrator's check cadence are the user's choice.
The tradeoff is that each unchanged check on a long-lived context is a full-context turn. Shorter-lived contexts would
cut that more than shorter replies would.

## 8. Before/after validation

Baseline: the Oct 17–18 cohort (71 sessions). Per session: follow-up turns, no-op share, own-status turns,
`get_mcp_tools` calls and errors, sync-pr result characters, result characters per merged PR. After: at least 10 owners
on unchanged models, digested by P5. Matched tasks: a known-conflicting sync (P1), a JS symbol rename (P4), a red-CI
triage (P2/P3). Record verdict correctness and time to name the failure, not only size. Calibrate characters against
tokens with per-agent Cursor usage for five baseline ids; until then bytes/4 is a rough estimate only.

## 9. Open questions

How much of a large stored result reaches the model? Does the host compact context between wakes? What did the Oct 18
`apex` namespace expose, and why was it never called? Can per-agent Cloud usage be exported? What do the 79 undumped agents show?

## 10. Handoff

Start P1 (one file, no overlap; tooling-fast plus the sync-pr unit test). P2 waits for #2884, P3 for #2901, P4 for a
one-agent environment check. Rebuild metrics from the appendix; never commit transcript data.

## 11. Cost of this investigation

3:49 to about 4:30 AM PT, roughly 75 tool calls by one agent; no transcript pages fetched via API. The 121 dumps (106 MB)
and 33 Claude exports were processed by scripts; only aggregates and short excerpts entered context. Own token usage
is not observable.

---

## Appendix: definitions and excerpts

- **Result characters:** read `contents`; terminal `output`; grep `resource` + `previewText` + 8 per match (the
  stored envelope is 2.3× larger and not counted); mcp `result`; edits diff/4. Stored size, not model-visible size.
- **Turn:** a message, plus notifications batched with it, followed by assistant activity. **No-op:** a follow-up
  turn with at most one tool call. **Accumulated transcript:** the running sum of message and result characters.
- **Identical reread:** same path, same content hash as that path's previous read in the session.
- **Duplicate discovery:** a `get_mcp_tools` content hash already seen in the session (spill paths normalised).
- **Eras:** sessions starting before vs after 2:33 PM PT Oct 15 (50 / 71).

| Ref | Excerpt or pattern |
|---|---|
| bc-af7ba75a L1741 | "The comment is the fleet-status note from this session. No further action." |
| bc-94efd3ae L64 | `git commit … && node tools/ci/sync-pr.mjs … --resume` → 728 s, 754,776 characters |
| bc-881a2f94 L24 (3:34 AM PT) | `Error: namespace "Github" not found. Available namespaces: apex, cursor, cursor-cloud, cursor-subscriptions` |
| bc-881a2f94 L10 | `get_mcp_tools` fetched the built-in TodoWrite schema |
| bc-37e12564 L118/L241/L287 | `subscribe_github_ci` returned the same `sub_adb56c59…` three times |
| bc-01a11052 L2147, L2356 | timers `pr-5min-red-am` and `pr-cron-halfhour` fired alongside 15- and 30-minute backups |
| bc-6f151752 L970/L991/L1006 | `for i in $(seq 1 40|50|60)` over `gh run list`, after ready |
