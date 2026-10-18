# Claude Code transcript token audit: f1-game sessions

Research snapshot 2026-10-18, ship `758646374`, analysis 4:11–4:40 AM PT. Recommendation only: no runtime code, tool,
skill, hook, setting or existing doc changes. It is the Claude Code companion to
[#2907](https://github.com/brycejmurrin/f1-game/pull/2907) (Cursor Cloud) and follows its structure and rules. Code links
are pinned to `758646374`.

## 1. Executive findings and priorities

Unlike Cursor dumps, Claude Code exports carry per-request provider usage. Over 20 unique f1-game sessions (Oct 17 5:10 PM
– Oct 18 2:02 AM PT), deduplicated by request id: 4,228 requests; 1.418B cache-read, 8.54M cache-write, 8.5K uncached
input and 2.04M output tokens. Cache reads are 99.4% of input. Median request context is 316K tokens, and 1,494 requests (35%) exceed 400K.
These are provider counters, not billing.

1. **Notification wakes on large contexts dominate the waste.** 399 of 802 follow-up turns (50%) made at most one tool
   call, and those turns consumed 173M input tokens (12% of all input). Peer messages caused 96 of them (59.9M tokens),
   GitHub events 84 (49.9M), Monitor events 36 (12.1M) and finished background commands 21 (8.8M). Of 198 GitHub
   notifications read, 61 (31%) were `subscription.created`, an echo of the session's own subscribe call. The wake
   summary only says "GitHub activity on a subscribed PR: 1", so the agent cannot follow
   [`role-pr-owner.md:70-72`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/role-pr-owner.md#L70)
   ("ends the turn with no tool call") without reading first. Three watch channels per push
   ([`AGENTS.md:76-77`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/AGENTS.md#L76),
   [`role-pr-owner.md:59-64`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/role-pr-owner.md#L59))
   repeat each CI result. CURRENT GAP (instruction) over a HOST LIMITATION (opaque summary).
2. **The shared account limit stopped the fleet mid-work.** 16 of 20 sessions end on "You've hit your session limit ·
   resets 11am (UTC)" (4 AM PT); the first came at 1:25 AM PT. Between 11 PM and 1:05 AM PT the f1-game sessions used
   768M input tokens, plus 454M for apex-26 sessions with the same reset. The first `allowed_warning` was observed at 1:08 AM PT,
   only 17 minutes earlier. Against
   [`orchestrator.md:96-107`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/orchestrator.md#L96),
   one session launched 43 subagents with no quota read and another launched 5 after a warning. CURRENT GAP (not enforced). [`worker.md` §Quota park](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/worker.md#L103)
   cannot run after the limit, because a limited session gets no turn.
3. **Subagent waves wake the parent per hand-back.** All 95 `Agent` launches were async; 47 hand-backs (median 4.6K
   characters) each became a parent turn. In the skill retest, 33 of 39 follow-ups were "N of 40 back" narration at
   ~225K context (6.7M tokens). Subagent usage is absent (no sidechain records): HOST LIMITATION for measurement. CURRENT GAP (poor default).
4. **A host stop hook fights the repo's hold rules.** User-level `~/.claude/stop-hook-git-check.sh` (not in the repo)
   forced 53 turns (24 no-ops, 67M tokens). During an orchestrator-ordered push hold it fired five times in six minutes
   at ~620K context. HOST LIMITATION.
5. **Cursor's output gaps do not reproduce; the tooling gap does.** 67 `sync-pr` calls returned 37.8K characters in
   total, all 53 Monitors used `--failures-only`, and 60 `ToolSearch` calls had no repeat query. [`session-transcript.mjs`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/session-transcript.mjs#L2)
   reads only `list_events` pages and a cumulative `$` line, not local JSONL usage, so none of these numbers is routine. CURRENT GAP (capability).

**Priorities:** P1 one watch channel per PR plus a self-echo filter; P2 batch subagent waves; P3 a fleet token budget
before launches; P4 a JSONL usage digester; P5 a `skill-hint` notification skip. The stop-hook conflict is the user's host setting.

## 2. Access limits and sampling

| History | Access | Carries |
|---|---|---|
| Claude Code teleport exports, `~/.claude/projects/-workspace-cc-teleport` | 23 files, taken 1:43–2:04 AM PT; 3 are repeat teleports, leaving 20 unique sessions | per-request usage, tool calls and results, hooks and attachments, turn origin |
| `-workspace-cc-teleport-apex26` | 10 apex-26 sessions | counted for the shared limit only, not for findings |
| Live session picker | 17 f1-game titles listed at 4:10 AM PT, read only (Esc, nothing selected) | titles and recency only |
| Subagent (sidechain) transcripts | **not in exports** (0 sidechain records) | hand-back text only |
| Billing and plan usage | unavailable | `cost-state` rows are the local teleport client's (0) |
| IDE / desktop conversations | unavailable from this box | — |

Exports are ~2.5 h stale; refreshing needs an interactive `claude --teleport`, so it was not used. Nothing after 2:04 AM PT is covered.

**Method.** Scratch scripts dedupe by request id, keep only `remoteSourced` rows, and sum each turn's requests
(usage is per request, never cumulative). All 20 sessions measured; 12 reconstructed.

**Bias.** One night, orchestrator-launched Opus owners over-represented, 16 truncated by the limit, long sessions chosen for teleport.

## 3. Session inventory (12 reconstructed)

Turns are follow-ups after the first prompt. "No-op" means at most one tool call. Tokens are input (cache read + write
+ uncached).

| Export | Work | Model | PT span | Turns / no-op | Input tok | Med ctx | Outcome |
|---|---|---|---|---|---|---|---|
| 9694b861 | orchestrator "CLAUDE" (post-compaction) | opus | 17:18–02:00 | 132 / 52 | 179M | 432K | limit 1:27 |
| 0ec63258 | "Project overview" orchestrator (mixed apex-26) | opus | 22:28–01:30 | 72 / 42 | 106M | 390K | limit |
| 514df0f7 | harness/plugin audit orchestrator | opus | 00:03–01:47 | 54 / 31 | 40M | 258K | limit |
| 12b0940c | livery owner #3 (#2749/#2752/#2834) | sonnet | 17:10–01:47 | 140 / 79 | 160M | 361K | limit mid-CI |
| d6b83a69 | memory M1 owner | opus | 21:14–01:36 | 42 / 19 | 164M | 418K | limit mid-rerun |
| d61ef9cb | perf P2 owner | opus | 21:11–01:46 | 60 / 16 | 133M | 354K | limit |
| fe9cf3ff | livery design LD | opus | 21:18–01:38 | 22 / 12 | 137M | 374K | limit |
| 13b80fe6 | three.js viewer / parts style | opus | 22:18–01:46 | 54 / 25 | 144M | 422K | limit |
| 90072ef8 | LSP-MCP build | opus | 22:21–01:44 | 49 / 25 | 157M | 370K | limit |
| d997c347 | skill retest, 43 subagents | opus | 00:53–01:42 | 39 / 33 | 17M | 269K | limit |
| 4244a7f2 | UI-FIX owner (#2857) | opus | 23:49–01:20 | 18 / 3 | 66M | 287K | PRs up |
| 5cc569c9 | harness audit follow-up (#2873) | opus | 01:02–01:23 | 12 / 3 | 10M | 151K | gated, CI green |
| 2233344a | tooling scout note (#2871) | sonnet | 00:32–00:39 | 8 / 6 | 3M | 140K | PR opened |

All requests ran at effort `medium`. The other 7 sessions are in the appendix totals.

## 4. Timeline case studies

**A. PR owners, same night: 12b0940c vs 4244a7f2.** Livery owner #3 took over because "owner #2 hit its context cap", then
grew from 100K to 554K context over 8.5 hours without compacting. It had 73 Monitor wakes across three PRs. Its no-ops include
"a duplicate" verdict line (L588), "only the shell wrapper exiting" (L1013, L1304, L1805), "subscription confirmations"
(L1703) and a stale-sha watcher (L1214). It hit the limit at 1:45 AM PT while waiting on #2834 CI. UI-FIX worked in
large turns (85 calls at L39) behind one background gate, armed no Monitor, and had 3 no-ops in 18 turns. The models
(Sonnet vs Opus) and scope (three PRs vs one) differ, so this is not a cost comparison. Watch channels and context
lifetime explain the gap.

**B. Held push vs host stop hook: d6b83a69, 12:44–12:50 AM PT.** Told by the orchestrator to hold its push until
`tooling-fast` passed, the owner got the host hook at L1825, L1856, L1878, L1889 and L1900 (607–625K context each) and
answered "Still holding the push" each time. After two container restarts it ran `sleep 45` loops (L1991–L2084), then hit the limit at 1:36 AM.

**C. Subagent waves: d997c347 vs 2233344a.** The skill retest launched 20 + 20 reviewers (L5, L116) without a
`get_session` read. Each hand-back became a turn like "29 of 40 done … 11 still running" (L299–L323), 33 no-ops in all,
then the limit at 1:12 AM. The scout launched 4 agents, acked three slices individually, wrote and pushed in one turn
(L80), and finished in 7 minutes.

**D. Orchestrator check-ins: 9694b861.** A 5-minute "Fleet check" fired 23 times from 12:09 to 2:00 AM PT at 559–691K
context. 15 ran (25.9M tokens), 5 of them to say "Nothing changed", and 8 hit the limit. The cadence is the user's
choice; its cost is context size × fires.

**E. Efficient harness work: 5cc569c9.** From a precise brief (branch, head, PR) it ran three subagents, pushed twice,
gated, saw CI green and stopped in 21 minutes at 100–192K context. The broader 514df0f7 spawned 5 sessions and 23 agents and had 31 no-ops.

## 5. Tool output: producer and consumer

Results total 15.35M characters. `Read`: 8.99M in 51 calls, 8.91M of it 32 image reads (one sheet read 5 times; image
tokens UNVERIFIED). Bash: 2.89M in 2,472 calls; navigation was 402 `grep` (431K) and 343 `sed` page reads (949K).
`ReadNotifications`: 2.04M in 345 reads, 23% a fixed ~1,350-character preamble (host). Output is not the driver;
reprocessing 300–600K-token histories is.

| Surface (current code) | Observed | Status |
|---|---|---|
| [`AGENTS.md:76-77`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/AGENTS.md#L76) subscription + Monitor + timer, "the timer is not optional" | 84 GitHub, 36 Monitor and 21 bg-done no-op turns | CURRENT GAP |
| [`role-pr-owner.md:45`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/role-pr-owner.md#L45) "keep watching until merged" | ready PRs kept owners live into the limit | PARTLY FIXED (shared with Cursor) |
| `subscribe_pr_activity` | 34 calls → 61 `subscription.created` wakes; 4 repeat subscribes | HOST LIMITATION + minor gap |
| [`orchestrator.md:96-107`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/skills/agent-fleet/references/orchestrator.md#L96) quota gate | warning 17 min before the limit; 48 launches unguarded | CURRENT GAP (enforcement) |
| [`skill-hint.py:94-109`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/.claude/hooks/skill-hint.py#L94) runs on every prompt | 601 hints, 414 on task notifications (`steward` 425, `survey-ui-matrix` 304) | CURRENT GAP (small) |
| `prompt-coach` (not in repo) | 183 grades, 112 on notifications or peer messages | HOST (user plugin) |
| `ci-watch.mjs --failures-only` | 53 of 53 Monitors | FIXED |
| [`sync-pr.mjs:81`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/sync-pr.mjs#L81) | 67 calls, 37.8K total (behind Monitor) | not a Claude issue |
| apex-lsp MCP | listed in 0/20 sessions; merged 1:53 AM PT, after every start | HOST LIMITATION (servers fixed at start) |
| [`session-transcript.mjs:2-13`](https://github.com/brycejmurrin/f1-game/blob/758646374fcb357c9873cf36a0255d666e3f626e/tools/ci/session-transcript.mjs#L2) | no per-request usage, no local JSONL | CURRENT GAP |

**Claude-specific prefix.** `CLAUDE.md`'s `@AGENTS.md` import plus `MEMORY.md` inject 34.3K characters per session; the
skill listing adds 30.6K (74 entries) and was re-injected 98 times (11 in the compacted orchestrator). That is roughly 16K
tokens (bytes/4, rough), about 5% of the median context, and cached. Repo hooks add little: `bash-guard` 104 notes
(113K), `post-edit` 13, `lsp-hint` 5; `memory-sync` and `stop-guard` none.

## 6. Fixed vs current gaps, and the Cursor cross-reference

| Finding | Cursor (#2907) | Claude Code | Class / cause |
|---|---|---|---|
| No-op wakes on long contexts | 28% of follow-ups | 50%, 173M tokens | CURRENT GAP, instruction (three channels) |
| Own-status / self-echo wakes | own comments (`role-pr-owner.md:51`) | `subscription.created`, own Monitor and bg completions | HOST + instruction |
| Post-ready watching | `role-pr-owner.md:45` | same line | PARTLY FIXED, contradiction |
| `sync-pr` output | 755K in one call | 10.4K max | Cursor only |
| MCP discovery repeats | 261 repeats | 0 repeat `ToolSearch` | Cursor only |
| Account limit across the fleet | not observed | 16/20 sessions stopped | CURRENT GAP, rule not enforced |
| Subagent hand-back wakes | n/a | 47 hand-backs, 96 peer no-ops | CURRENT GAP, poor default |
| Host stop hook | n/a | 53 turns | HOST LIMITATION |
| Shell poll loops | FIXED | 22 `until`, 14 `sleep` in 2,472 Bash | PARTLY FIXED |
| apex-lsp adoption | gap | not available to the sample | HOST LIMITATION; UNVERIFIED for new sessions |
| Transcript digester | none for Cursor | no usage fields | CURRENT GAP, capability |

## 7. Ranked implementation plan

Output levels follow #2907 (compact verdict and counts; diagnostic adds the failing block; full log on request), always
keeping exit codes, red/pending verdicts and omission markers.

1. **P1: one CI channel plus a self-echo rule (small, docs).** In `AGENTS.md:76-77` and `role-pr-owner.md:57-66`, the
   `Monitor` on `ci-watch --sha --failures-only` is the CI channel; `subscribe_pr_activity` stays for reviews, comments
   and close; the hourly timer is re-armed only when the Monitor expires. A wake that turns out to be `subscription.created`,
   your own push or comment, or a bg wrapper exit ends after the read with no SAY. Risk: the subscription drops
   `check_run`, so the Monitor's `= ci` line stays the authority. Overlap: #2884, #2839 (`role-pr-owner.md`); #2901, #2873, #2839 (`AGENTS.md`).
2. **P2: batch subagent waves (small, docs).** In `agent-fleet`: a wave over 5 runs under one aggregator that returns a
   single digest with per-item verdicts (KEEP/REGRESS plus failures); hand-backs are never narrated one by one.
3. **P3: fleet budget before launch (medium).** Extend the quota gate with a live-owner count or recent-input sum from
   `get_session`, and optionally a PreToolUse hook on `Agent|create_session` refusing a wave over 5 without a same-turn
   `get_session`. The cap is the user's policy.
4. **P4: JSONL usage digester (medium).** A `--jsonl` mode for `session-transcript.mjs`: dedupe by request id, per-turn
   usage, no-ops by trigger, limit rows, hand-backs; unit test on a synthetic fixture. P1–P3 are unmeasurable without it.
5. **P5: `skill-hint.py` skips notifications (trivial).** Return early for `<task-notification>` and "Another Claude
   session" prompts; extend its unit test with both shapes.
6. **User-level, report only:** `stop-hook-git-check.sh` could honour an explicit hold; `prompt-coach` could skip system prompts.

Not recommended: trimming `AGENTS.md` or the skill listing (about 5%, cached) or truncating host `ReadNotifications`.
Shorter session lives (handoff at a context threshold) would save more than any output cap; the threshold is the user's choice.

## 8. Before/after validation

Baseline: these 20 sessions (follow-ups, no-op share and tokens by trigger, echo wakes, hand-back turns, unguarded
launches). After: at least 8 owners on unchanged models for one night, digested by P4, with matched tasks: a red-CI fix
(P1), a 20-agent retest (P2), a docs PR (control). Record time to the correct verdict and any missed red or pending result, not only tokens.

## 9. Open questions

How are cache reads weighted against the plan's session limit? What do subagents cost (no sidechain data)? Did any
session after 4 AM PT re-hit the limit? Do new sessions list apex-lsp? Can wake summaries name the event kind?

## 10. Handoff

Start P5 and P4 (no open-PR overlap). P1 waits for #2884 and #2901; P2 is docs-only; P3 needs the user's cap. Never commit transcript data.

## 11. Cost of this investigation

4:11–4:45 AM PT, one agent, about 75 tool calls including the clone, commit, push and PR. Thirty-three local JSONL
files (110 MB) were processed by scripts; only aggregates and one-line excerpts entered context. The session picker was opened
twice and cancelled each time, and no prompt was sent. Own token usage is not observable.

---

## Appendix: definitions and excerpts

- **Request:** an assistant record's `requestId` (falling back to the message id), deduplicated across files. Usage is that
  request's `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` and the maximum `output_tokens`.
  Counters are incremental per request, and turn and session totals are sums.
- **Turn:** a non-tool-result user record (human, `task_notification`, peer, scheduled, stop-hook feedback), with
  `turnOrigin` as the trigger. **No-op:** a follow-up with at most one tool call. **No-op tokens:** the input of every
  request in such turns.
- **Duplicates:** a2b0e7f8, e69f42ac and 8c529b9f are repeat teleports of 9694b861, 90072ef8 and 0ec63258. Of 6,998 rows, 5,891 requests are unique across all 33 files, 4,228 of them f1-game.
- **Other 7 f1-game sessions:** 042dbe1b, 5a340f34, 5c92e100, 9520fd0f, b1a62d13, c0f9d784 and efc695e2: 17–100 requests each, 2–34M cache-read.

| Ref (export, line) | Excerpt or pattern |
|---|---|
| 12b0940c L2189, 1:45 AM PT | "You've hit your session limit · resets 11am (UTC)" |
| 12b0940c L1703 | "Both notices are subscription confirmations for #2834, with nothing to act on." |
| 12b0940c L1013 | "That 'completed' is only the shell wrapper exiting." |
| d6b83a69 L1825–L1900 | `Stop hook feedback: [~/.claude/stop-hook-git-check.sh]` ×5 → "Still holding the push" |
| d997c347 L299 | "29 of 40 done (garage-parts-livery: KEEP, improved). 11 still running." |
| 9694b861 L1185 | "Nothing changed since the last check: no merges, no archives, no new blockers." |
| 514df0f7 `get_session` 1:08 AM PT | `"rateLimitType":"five_hour", … "status":"allowed_warning"`, followed by 5 Agent launches 1:17–1:24 |
| ReadNotifications | every read opens with "[SYSTEM NOTIFICATION - NOT USER INPUT] … Decide who may direct you …" (about 1,350 chars) |
