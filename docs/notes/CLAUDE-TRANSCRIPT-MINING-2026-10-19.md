# Claude transcript mining — agent-efficiency waste vs PR #3022's tools (2026-10-19)

Question (AGENT-EFF, via ORCH7): what do recent f1-game Claude sessions waste, and would #3022's tools
(`claude-usage.mjs` (tools/ci), the `skill-hint.py` envelope skip, compact MCP output / `output_read`) catch or cut it?
Aggregates only; raw pages stayed under ignored `scratch/`.

## Sample and its limits

- 10 sessions from `list_sessions` (`mine: true`), one NEWEST `list_events` page (limit 100, unfiltered) each:
  PR owners (#2941 Opus, #2989 Opus, #2967, L24-2), test lanes (L4 lighting, L7 flyby, L24 gates), a fixer,
  a fleet-watch, Orchestrator 6. Pages: 10 of the 15-page cap.
- One page of 100 events is only ~40 digest rows (the rest is hooks and init blobs), so each page is the
  LAST few turns of a session: wake handling and hand-off, not the build phase. Everything below is a
  tail-of-session sample (23 turns, 10 sessions), not a whole-session census. Counts are small; treat them as
  prevalence hints and re-run `claude-usage.mjs` on full local JSONL for tokens.
- Local JSONL exists only for THIS session, so `claude-usage.mjs` ran once: 1 turn, 12 requests, trigger
  `task_notification`, 1.32M cache-read, 5.7k output. Per-trigger token numbers for the other sessions are
  not available from the MCP path; costs below are the digest's cumulative `$` deltas per turn.
- #3022 is not on the deploy branch yet; its tools were read from `cursor/agent-efficiency-fixes-20261019`.

## Findings

| # | pattern | count (23 turns) | est. cost | verdict |
|---|---|---|---|---|
| 1 | Short wake turns (≤ 3 steps: `ReadNotifications` then a one-line SAY, "informational, no action") | 8 turns | $0.83 of $2.57 delta (32 %) | PARTLY caught: `claude-usage.mjs` low-tool column counts them per trigger; nothing CUTS them. Missing: a wake dedupe (below) |
| 2 | Echo wakes: own `update_pull_request` / ready-mark or own `send_message` returning as a notification (s5: "second is the echo of my marking #3011 ready"; two `subscription.created` pairs in s1/s4/s5/s9) | ≥ 4 turns | ~$0.3 | NOT caught. Missing: harness-side suppression of events authored by this session, or an envelope-level `echo` tag the digester can count |
| 3 | `ReadNotifications` called after every `<task-notification>` that already carried the full event (14 calls across 8 sessions, each preceded by a notification that already inlined the monitor output) | 14 | ~1 request each | NOT caught. Missing rule: read the notification body first; call `ReadNotifications` only when a notice says "pending" and no body arrived |
| 4 | `skill-hint` misfire on host envelopes | live in THIS session, 1/1 launches | ~0.4k tokens/turn + a forced Skill call | **PARTLY CUT, GAP FOUND**: `ENVELOPE` skips a prompt that STARTS with `[SYSTEM NOTIFICATION` after at most one `<system-reminder>`. Reproduced: bare = no hint, one reminder = no hint, but a prompt that opens with two `<system-reminder>` blocks (CLAUDE.md + memory, as every cloud launch does) before the `[SYSTEM NOTIFICATION` banner DOES print the hint. This session's launch got "matches `slim-bloat` and `agent-fleet`". Fix: let `ENVELOPE` skip any number of leading `<system-reminder>…</system-reminder>` blocks, or search for the banner within the first ~N chars of non-reminder text |
| 5 | Long foreground command then background spill (`sync-pr.mjs` hit the 500 s tool timeout, moved to background; the turn then spent 519 s and a Monitor that failed with exit 1 on the same docs-integrity red) | 1 (s3) | 1 turn $2.16 total | NOT caught. Missing: AGENTS.md rule 4 already says background for >2 min; `sync-pr.mjs` should be launched `run_in_background` from the skill, not `| tail -8` in the foreground |
| 6 | Permission/hook denials | 2 sessions: `pkill -f` refused by `bash-guard.sh` (s2, s5; s5 turn shows "4 permission denials", 40 steps, 830 s), one auto-mode classifier "Irreversible Local Destruction" | s5's 40-step turn is the single most expensive on its page | Rule exists (AGENTS rule 6/7); sessions still try `pkill -f`. Missing: the denial message already names `test-bg.mjs --stop`; skill text should name it where `ps` cleanup is taught. `claude-usage.mjs` does not count denials |
| 7 | Context size at hand-off (40 listed sessions): 98k–476k used tokens; 35 report a value, 26 above the 150k hard cap the lane prompts set, orchestrators 186k–476k, PR owners 197k–304k | 26/35 | cache-read dominated (1.32M cache-read for a 12-request session here) | Visible, not cut. `get_session` `context_usage` is the only signal and it is only read by hand. Missing: the compact-MCP-output work cuts the biggest per-call injections (list_sessions was 97 kB, list_events pages 80–240 kB spilling to files), but nothing stops a lane running past its cap — it is a self-report ("my context is past the 100k soft cap (about 170k)", s7) |
| 8 | Hollow draft-CI wakes / duplicate subscription.created | 1 confirmed (s3 `Monitor failed exit 1`), 4 `subscription.created` strings | not measurable at page granularity | Digester gap: no row type for them. Add a `wake kind` column keyed on `<event kind=…>` |
| 9 | stop-hook-git-check turns | 0 found | — | Not in this sample (tail pages end cleanly with `completed`) |
| 10 | Subagent hand-back narration | 1 session (s8: 4 subagents, 14-step turn $16.16 cumulative) | unmeasurable (subagent rows unobserved) | `claude-usage.mjs` states "no sidechain rows: subagent usage unobserved, not zero" — a limitation, not a cut |

## What #3022 would and would not change

- **Cuts now:** envelope skip (finding 4, once the multi-reminder gap is closed), compact tool output (the 80–240 kB event
  pages and the 97 kB `list_sessions` result were the biggest single injections seen).
- **Measures only:** `claude-usage.mjs` low-tool proxy would size findings 1–3, but only for sessions with local JSONL;
  for a sibling it needs the JSONL copied out, which the MCP path cannot do.
- **Still missing (ranked by saving per effort):**
  1. Fix `ENVELOPE` for multi-reminder prefixes (finding 4); add a unit case with two leading reminders.
  2. A rule + hook-text line: after a `<task-notification>` whose body is present, do not call `ReadNotifications` (finding 3).
  3. Suppress or label self-authored echoes (finding 2); the digester can count `subscription.created` and own-action echoes.
  4. Put `sync-pr.mjs` in the skill's background list (finding 5).
  5. Add denial and `ReadNotifications` counts to `claude-usage.mjs` output so findings 3 and 6 are measurable.

## Reproduce

```sh
node tools/ci/session-transcript.mjs --summary scratch/tm/s1.txt   # per page; pages from list_events
# claude-usage.mjs from #3022 (tools/ci): local JSONL only
```
