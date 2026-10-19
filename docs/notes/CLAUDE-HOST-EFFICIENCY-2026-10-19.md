# Claude host efficiency: wakes, hooks and transcript usage (2026-10-19)

These measurements come from one Claude Code cloud session: the AGENT-EFF owner of #3022, a takeover of the Codex
handoff whose results are in [AGENT-WORKFLOW-EXPERIMENTS-2026-10-19](AGENT-WORKFLOW-EXPERIMENTS-2026-10-19.md). The
evidence is this session's local JSONL transcript, digested by `tools/ci/claude-usage.mjs` (new). Only aggregates are
recorded here: transcripts carry prompts and paths, so they stay uncommitted. The scope is a single session over about
25 minutes. Read it as a measurement of mechanisms, not of fleet-wide cost.

## What the host exposes

| Facility | Present here | Notes |
|---|---|---|
| Local transcript `~/.claude/projects/<repo>/<session>.jsonl` | yes | carries per-request `message.usage`, `requestId`, `turnOrigin`, `origin.kind`, `promptSource`, `isMeta`, hook attachments and queue operations |
| Subagent sidechains | no rows | no subagent ran; their usage is unobserved, not zero |
| Billing, plan-limit weighting, dollars | no | not in a transcript |
| User-level hooks (`~/.claude`) | not inspected | personal settings; out of scope for this session |

## Findings

1. **Each content block is a separate assistant row carrying the same usage.** A request with thinking, then text,
   then two tool calls writes four rows, each with identical `usage`. Summing rows overcounts every counter. Here,
   500 records held 78 unique requests. The digester keys each request by `requestId` (falling back to
   `message.id`) and takes each counter's maximum.
2. **Cache reads dominate.** Over 78 requests: 14.1 M cache-read, 178 K cache-write, 158 uncached input and
   40 K output tokens. Cost scales with context size times request count. Text that enters context early (the skill
   listing, AGENTS.md, a long notification body) is re-read on every later request.
3. **The host coalesces queued notifications before a wake.** The queue log shows `enqueue "1 unread notification"`,
   then `remove`, then `enqueue "2 unread notifications"`. Two GitHub events cost one wake.
4. **One `subscribe_pr_activity` call produced two `subscription.created` events, 4 s apart.** Each repeated about
   10 KB of identical guidance and named no action. Both were read in one `ReadNotifications` call. The ~20 KB then
   stays in context and is cache-read on every later request. This is host behaviour, not repo code. The existing
   self-echo rule (`role-pr-owner.md` §On every wake) already says such a wake ends with no tool call. There is no repo-side fix.
5. **`skill-hint.py` ran on host wakes and printed unrelated hints.** A peer-message wake (`<task-notification>`
   envelope, `turnOrigin: task_notification`) ran the `UserPromptSubmit` hook. It printed "matches `pages-red-triage`
   and `survey-ui-matrix`" for a message about retargeting a PR. The #2899 check on `hook_event_name` cannot see these
   wakes: the event name is `UserPromptSubmit`. Fix in #3022: skip prompts that START with a host envelope
   (`<task-notification`, `<agent-message`, `[SYSTEM NOTIFICATION`). A user typing those words mid-prompt still gets
   the hint. The launch prompt is also tagged `task_notification`, but its text has no envelope, so it keeps its hint.
6. **The watch channels after #2884/#2901.** These rules are unchanged: the Monitor's `= ci` line is the CI
   authority, the subscription covers reviews and close, and the timer covers dropped `check_run` events. Each
   channel covers a measured gap, so no channel was removed. The remaining waste is echo wakes (finding 4), which the
   self-echo rule already covers.

7. **The user-level `~/.claude/stop-hook-git-check.sh` asks for a commit while a verification run is live.** It fired
   once, with staged changes under `tooling-fast --changed`. That cost one turn: a commit would have run `test:guards`
   on top of the live run. This is a personal hook, so it is reported here only and was not edited. An optional
   correction is to stay silent while the repo's `.claude/hooks/live-run.py`
   (which `stop-guard.sh` already uses) reports a live run.

## The digester

`node tools/ci/claude-usage.mjs` reads the current repo's transcript directory by default. It streams each line,
counts malformed lines and never aborts on one. It prints aggregates by turn trigger. `--turns --limit N` adds the
costliest turns; `--json` gives the whole object.

- A turn starts at a user record that is neither a tool result nor `isMeta` (skill bodies are `isMeta`).
- The trigger is the host's `turnOrigin` or `origin.kind`. Without either, an envelope prefix gives
  `inferred:<kind>`; anything else is `unclassified`.
- A counter that no row reported is printed as `+N unknown`, never as zero.
- A resumed or re-teleported copy of a session repeats record uuids, so it adds no turns or requests.
- "low-tool" turns (≤ 1 tool call) are printed as a proxy for wasted wakes, not proof of one.

## Not measured

- Billed tokens and dollars.
- Subagent cost.
- A matched brief/guided Claude workflow comparison.
- Long-session wake counts across a night.

Next step: run the digester over several owner sessions' transcripts, as §8 of the
[transcript audit](CLAUDE-TRANSCRIPT-TOKEN-AUDIT-2026-10-18.md) proposes.
