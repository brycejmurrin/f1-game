---
name: dispatcher
description: "Use when you are the hourly dispatcher: run the scheduled cycle, launch workers, quota, pause the trigger, the lock. Not for: owning one PR → steward; a launched lane → worker."
---

# Dispatcher — the hourly cycle

ONE persistent session per Claude account, tagged `role:dispatcher` + `no-archive`, woken hourly by a scheduled task
bound to it. A fresh scheduled session (`create_new_session_on_fire`) lacks `get_session`, `list_sessions` and
`create_session`, so it cannot run the cycle. `node tools/ci/dispatch.mjs` is a pure plan over GitHub state and
`tools/ci/dispatch.json` (the caps): it only PLANS. GitHub writes happen with `--apply`; every session action is
printed as a line YOU execute. The exact commands, line formats and the scheduled task's prompt are the header of
`tools/ci/dispatch.mjs` (their one home). The labels and Hand-off format are `docs/WORKERS.md`; the worker's side of
a launch is skill `worker`.

## The cycle (summary; the header of `dispatch.mjs` is exact)

Read the FIRST output line of step 1: `= dispatch refused` (another lock: do nothing), `= quota rejected` (disable the
trigger), `= quota allowed_warning` (launch cycle skipped).

1. `node tools/ci/dispatch.mjs --children`
2. `get_session` per named child; save each result for `--sessions`.
3. `get_session` alone; its `rate_limit_info.status` is `--quota`.
4. `--apply`.
5. Per `CREATE_SESSION` line, ONE AT A TIME: `get_session` alone, `launch-gate.mjs artifacts/launch/self.json` (exit 0),
   `create_session`, then the `RECORD_LAUNCH` line with `{SESSION_ID}` replaced.
6. Each `NUDGE_SESSION` by `send_message`; each `ARCHIVE_SESSION` by `archive_session`.
7. A final `PAUSE_TRIGGER <id>` means `update_trigger enabled=false` and end; the next user message or PR event is the
   RESUME (`enabled=true`, then run the cycle).

## The six rules

1. A `ready` issue with no `claimed`, `blocked` or `needs-decision` gets one worker (`priority` first), within the
   caps and only when quota is `allowed`. Landing backpressure: while `landQueueMax` or more non-draft PRs carry
   `land`, no issue worker starts; rules 2 and 3 still launch (they drain the queue).
2. An open PR idle over `staleHours` (2; 6 for `lane:codex`), or already `needs-owner`, with no `hold` or
   `needs-decision`, gets `needs-owner` and ONE `CONTINUE PR #<n>` worker. Never re-owned: a `land` PR with no red
   check, no failed or stale `gate` and no conflict; a PR a RUNNING or WORKING `role:worker` session names; bot PRs;
   a PR with a foreign pusher in `foreignHours` (2), or a `lane:cursor` push in that window; a PR whose body names an
   open prerequisite PR ("after #N merges", "builds on #N").
3. Latest completed `pages.yml` run red → label the Board `deploy:red`, launch one fixer unless an open PR has it.
4. A child whose every PR and issue is closed longer than `archiveAfterMinutes` ago is archived. Never one tagged
   `no-archive` or `role:dispatcher`, an untagged one, one without a claim comment, or one RUNNING, WORKING or BLOCKED.
5. A child BLOCKED, REVIEW_READY or idle 20 min, whose PR/issue is open and not `land`/`needs-owner`/`hold`/
   `needs-decision`, gets one `NUDGE_SESSION` per hour.
6. The Board comment (issue #1780, marker `<!-- dispatch-board -->`) is rewritten each run.

## Guards you keep

- **One dispatcher at a time.** The Board carries `lock: <session> at <iso>`; `--apply --self <id>` refuses while
  ANOTHER lock is younger than `lockHours` (3). A clean handover is `--take-lock` by the successor, and the old one stops
  writing (skill `handoff` §Handing over an orchestrator).
- **Quota.** `rejected`: launch nothing and disable the hourly trigger (30 failed wakes followed one weekly-limit hit).
- **Ask Bryce once.** AskUserQuestion once; in the same turn label the PR `needs-decision` and post one comment.
  Never re-ask: the label is the queue (#4076 was asked 12–13 times).
- **Never push to a lane's branch.** Send the edit as a message to the lane's session.
- **A denial is final.** A hook or classifier refusal is not re-worded and retried: put it to Bryce as a choice.
- **A quoted relay counts; a paraphrase does not** (`docs/WORKERS.md`, contract item 7).

## Efficiency (docs/notes/EFFICIENCY-REVIEW-2026-10-30.md)

- Hand off at the brief's `STOP AT` (skill `handoff`): every wake re-reads the whole context. Draft follow-up prompts
  into the Hand-off block before idling.
- Launch prompts use the deep template: the full Hand-off block, `STOP AT`, exact numbers, known container-only reds.
  Only you use AskUserQuestion; workers send questions to `@parent` or `needs-decision` (`docs/WORKERS.md`).
- The model and caps come from `dispatch.json`; `pr-board.mjs` suggests LAND, never ARM (no session arms).
