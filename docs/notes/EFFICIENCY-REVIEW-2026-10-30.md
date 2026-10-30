# Agent efficiency review — 2026-10-30

Bryce asked (2026-10-30 ~08:45Z): "analyze session transcripts again from the perspective of agent
efficiency, how it uses tool calls, how it was prompted, etc. let's really consider the process".
[ORCHESTRATION-REVIEW-2026-10-29.md](ORCHESTRATION-REVIEW-2026-10-29.md) covered outcomes; this
pass covers how turns, tool calls and tokens were spent.

**Method.** Four Opus reviewers read 49 cloud sessions from 2026-10-27 to 2026-10-30 through
`list_events`. Long sessions were sampled at their newest pages, because `list_events` has no
oldest-first cursor. A fifth reviewer parsed the dispatcher's own transcript and its 17 subagent
transcripts in full, with a script. The raw reports stayed in the dispatcher container
(`scratch/efficiency/{P,Q,R,S,L}.md`). The numbers below come from them.

## Where the money went

| group | cost | merged PRs | per PR |
|---|---|---|---|
| Sonnet/Haiku workers launched from the dispatcher template | ~$2–3 each | most | $1.2–3.4 |
| Opus hunts and attended sessions at 300–780k context | $14–97 each | few | $29–76 |
| the dispatcher (25.2 h, 21.4 h of it idle) | $82 | ~20 steered | — |

Big-context Opus sessions were 78–95 % of each batch's spend. One perf hunt read 228.7M cached
tokens to write 1.06M. A 16-minute dispatcher window cost $15.39.

## Findings, by cost

1. **Context size, not work, drives the bill.** The 300k STOP AT binds launched workers only.
   Attended hunts and the dispatcher grew to 324–783k, and every wake re-reads all of it: $0.24–0.40
   for a "nothing to do" turn, and $4–5 when the 1-hour prompt cache had expired. Relay and
   prompt-writing turns in a big idle session cost about $4 each.
   *Fix:* every session hands off at 300k (skill `handoff`). Draft follow-up prompts into the
   Hand-off block before idling. Read-only reviewer subagents run on Sonnet.
2. **The hourly scheduled task woke the dispatcher when nothing could move.** 11 wakes from 19:16Z,
   with #3981 waiting only on Bryce, cost about $21. The quota-refused wakes cost $0.19 each.
   *Fix:* `dispatch.mjs` prints a PAUSE line when no PR is actionable, and the dispatcher disables
   its scheduled task until a label or event changes.
3. **Questions to Bryce were lost on restarts.** Only 6 of 27 AskUserQuestion calls were answered,
   because 21 of the 22 worker restarts hit while a question was pending. The #4076 question went
   out 12–13 times, about 530 min of decision latency. *Fix:* ask once, and at the same time
   label the PR `needs-decision` and post one comment. Never re-ask; the label is the queue.
4. **Commit-hook failures surface one at a time.** One worker needed 5 commit calls, each failing
   on a different guard (assert-pin ratchet, groups.json order, merge hygiene, a docs fixture
   path); three agents rediscovered the shrink-only assert-pin ratchet in one day. `tooling-fast …
   | tail` hid red tests behind exit 0 (16 min), and foreground floors ran 9–22 min. *Fix:* one
   pre-commit pass that lists every failing guard with its fix command; a closing
   `= tooling-fast passed|failed` line; `bash-guard.sh` refuses a foreground or piped floor.
5. **Hand-written poll loops.** When the harness blocks `sleep N; check`, its message suggests "Monitor
   with an until-loop". Agents then wrote `until …; do sleep` loops (6 cases in 5 sessions), and
   `bash-guard.sh` missed one. *Fix:* AGENTS.md rule 4 shows the literal `wait-for.mjs` and
   `ci-watch.mjs` calls, and `bash-guard.sh` refuses `until … sleep` and names them.
6. **Ready flips stalled for 11–68 min.** The raw `gh api …/ready_for_review` route prompts (fixed by
   #4226), and the receipt expired on the clock (11 min against its 10-min limit) on an unchanged
   head. *Fix:* the receipt is valid while the head sha and the Plan are unchanged.
7. **Dispatch targeted the wrong thing.** A worker went to a merged PR ($1.19, 30 min), another onto
   a branch Cursor was pushing (45 min), and the dispatcher pushed onto a lane's branch (fix 3), so
   the worker's relayed edit was dropped. *Fix:* `dispatch.mjs` re-checks merged state and a
   non-Claude pusher in the last 60 min right before CREATE_SESSION. The dispatcher never pushes
   to a lane's branch; it sends the edit as a message.
8. **Launch overhead.** About 4 calls per launch. The 120 s receipt window refused twice;
   `--children` hit the 120 s Bash timeout both times it ran and listed 22 not-found sessions of 29.
   *Fix:* `--children --recent`, and reuse the receipt from the same turn.
9. **Template gaps.** Self-caused PR events (its own subscribe, ready flip or superseded head) woke
   sessions about 8 times. A draft pushed without `run-ci` ran only skip jobs, then idled 98 min. The
   Haiku sync lane ran `sync-pr --push` in the foreground and pushed 0 of 4 PRs. *Fix:* in the
   launch template, events you caused need no tool call; `run-ci` at the first push;
   `run_in_background: true, timeout: 7200000` for sync.
10. **A classifier denial was re-worded and retried, and was denied again** ([Self-Modification], then
    [Auto-Mode Bypass]). *Fix:* a denial is final for that action; put it to Bryce as a choice.
11. **The cloud stop hook's commit-and-push nag** (`~/.claude/stop-hook-git-check.sh`, installed by
    the environment in every container) fired at least 6 times in 4 sessions during browser runs. It
    does not contradict rule 2, which forbids source edits during a run, not commits. *Fix:*
    commit and push before starting a browser run, as rule 12 already asks before a long wait.

## Keep

- The dispatcher worker template with its Known pitfalls block. #4203 went from launch to merge in 51
  min for $1.18; fix 4 merged in 68 min for $2.72, with no nudges.
- Red-CI triage subagents (18–32 s), `remote-group.mjs` instead of local SwiftShader runs, and
  `gh api … --jq` (about 0.75 KB per call).
- The guards that refused a false "merged" claim and unverified relayed authority.

## Decisions

Bryce, 2026-10-30 ~09:05Z: "Build all, hooks included" (items 1–10, hook edits granted for
items 4–6); the stop hook is environment-owned, so item 11 is a doc line; the dispatcher hands
off to a fresh session after launching the fixes.
