# Workers — the one page a lane reads

A worker is one session, one task, one PR. GitHub holds every piece of state: issues are tasks, labels are state,
the PR is the work and the report, checks are the gates, comments are the only messages. GitHub lands the PR;
no agent merges. The design and its evidence: `docs/plans/2026-10-27-orchestration-redesign.md` §3–4.

## Where the work is

- **The Board** is issue #1780 (the dispatcher's one status comment, `deploy:red` while the Pages train is red).
  **The Dispatch issue** is #3899 (Bryce's switch: `dispatch:pause`, `dispatch:merge-pause`).
- **Find work with GitHub search**, never by paging `list_issues` (its pages miss issues): the GitHub MCP
  `search_issues` with `repo:brycejmurrin/f1-game is:issue is:open label:ready -label:claimed -label:blocked
  -label:epic`. An `epic` is a parent; its sub-issues are the work. In a Claude cloud session `gh api search/*`
  is refused (repo-scoped REST only).
- **`dispatch:pause` stops launches, not workers.** A running worker carries on to `land` or its cap; the label
  changes nothing for it. A session Bryce starts by hand may still take a `ready` issue.

## Issue dependencies

For an issue blocked by another issue, record the relationship with GitHub's native
`GET` / `POST /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by` REST API.
Read both issue scopes and existing relationships first; the POST body takes the blocking issue's numeric
`id` as `issue_id`, not its issue number. Add only a real prerequisite, not a test-only relationship.
The authenticated cloud route was verified on 2026-10-29: #3971 is blocked by #1578 (HTTP 201 and GET readback).

The native relation records the issue-to-issue dependency. Keep the `blocked` label as a compatibility
projection while the dispatcher and ready search above still filter labels; neither reads native blockers.
The label also covers gates without a blocking issue, such as an explicit maintainer deferral. Check the
actual prerequisite before removing a stale label. Do not replace complete label lists or remove another
owner's relationship merely to make an issue launchable. Evidence and reproducible counts:
[the two-week backlog check-in](notes/AGENT-WORK-TRACKING-2026-10-14.md).

## The contract

1. **Claim.** Comment `claims #<n> — <host>:<session id>` on the issue and add `claimed`. If an older claim comment
   is already there, stand down; the older claim wins. Add or remove a label ONLY with
   `gh api -X POST repos/<owner>/<repo>/issues/<n>/labels -f 'labels[]=claimed'` (`-X DELETE …/labels/<name>` to
   remove), never the GitHub MCP `issue_write` `labels` field: it REPLACES the whole list (workers wiped `bug` and
   `area:ui` off #3263–#3267 that way, 2026-10-27).
2. **Branch and draft PR.** Branch `cursor/<topic>-<hash>` from the deploy tip. Open a DRAFT PR into
   `claude/f1-game-project-26h3ng` at the first commit, from `.github/pull_request_template.md`: Goal, Plan (the live
   checklist), Verified / Not run, Hand-off. Add `lane:<host>` and `Closes #<n>`.
3. **Work.** AGENTS.md §The loop: make all edits, then verify once to the pre-push floor (AGENTS.md rule 3 is its
   one home). The full tiers run on the PR: add `run-ci` to the draft for the fast tier; the full tier runs once
   the PR is ready; the `gate` check runs on the merge result. `ready-gate` (step 5) needs `Structural guards`
   green on your head, so let the `run-ci` fast tier finish once before you land (a full local tooling-fast run
   writes the other accepted stamp).
4. **Watch.** Before ending a turn while CI runs on your own head, subscribe to the PR (Claude:
   `subscribe_pr_activity`); only then. No timers. A red on your head while you still own it is work now; a red elsewhere is not yours. Never claim done
   on a red.
   **If `subscribe_pr_activity` fails** (it has, with no reason, on #3970, #3981 and #4062), keep ONE background
   `node tools/ci/ci-watch.mjs --sha <head> --timeout 30` (`--once` for a single read) and tell the dispatcher in one
   `send_message`; a lane that cannot subscribe is handed to its parent, not left silent.
5. **Land.** When `node tools/ci/ready-gate.mjs --pr <n>` exits 0: flip the PR ready, add the `land` label, refresh
   the Hand-off block, and end the turn. The session stays subscribed, so each PR event wakes it, until the
   dispatcher archives it (rule 4 below: `archiveAfterMinutes` after its PR merged or closed, as set in
   `tools/ci/dispatch.json`, on the hourly cycle). `land.yml` runs `merge-gate.mjs --check` as the check named `gate`
   and arms auto-merge pinned to your head; the ruleset merges when `gate` is green (its ci row requires the newest
   check named exactly `CI` green on your head). Adding `land` while CI still runs is fine: `gate` shows in
   progress ("waiting") and re-evaluates when CI ends. Going back to draft or removing `land` turns `gate` red. A
   red or a conflict after that is a fresh launch (`CONTINUE PR #<n>`), not you.

   How `land.yml` arms: one PR per run, skipped when the deploy tip moved since its `gate` evaluation; its `retry`
   job then dispatches an immediate re-gate of that PR (at most 3 per head, then the next train or CI run re-gates);
   `gh pr merge --auto` on a CLEAN PR merges at once. An API or git error leaves `gate` in
   progress ("error, will retry"), never red. `gate` turns green only while the deploy tip is still the one it
   measured (else in progress "re-gating", through the same retry), and any other `gate` disarms an armed PR.
   `land.yml` may merge the deploy tip into a `land` PR whose `gate` refused only on distance (update-branch, its
   AUTO-SYNC, at most `SYNC_MAX` waiting on CI at once); pull before pushing to such a branch.
6. **Stop at the cap.** The brief's caps are its `STOP AT` line (context) and $10 soft (cost). At either, or when
   stuck: finish the current unit, push, refresh the Plan and the Hand-off block, add `needs-owner`, send_message
   `@parent` one line naming the PR, and end. The dispatcher launches the takeover on its next cycle. The $15 hard-cap archive is NOT built (`dispatch.mjs`
   reads no cost), so the soft cap is yours to keep.
7. **Ask through a label, never the chat.** Nobody reads a worker's chat. Never end a turn with a question or a
   request to the user or Bryce: decide and record the pick in the PR body; or, for a question only Bryce can
   answer, add `needs-decision` plus one comment listing the options and your pick, and keep working on everything
   that does not depend on the answer; or send_message session_id `@parent` (the dispatcher). There is no
   `AskUserQuestion` in a worker. When Bryce answers in the thread, the worker removes `needs-decision` and
   carries on. The dispatcher skips a PR or issue carrying it, so a waiting PR is never re-owned.
8. **Take over.** A `CONTINUE PR #<n>` worker adopts the PR. The dispatcher does the mechanics when it records the
   launch (`dispatch.mjs --record-launch` removes `needs-owner` and posts `adopts PR #<n> — <host>:<session id>`,
   because the auto-mode classifier denies the label DELETE to a worker). The worker sets `owner:` in the Hand-off
   block and works from it and the Plan; a session launched by hand does both steps itself. On a PR the NEWEST adoption comment
   wins (stand down if a newer one appears), the opposite of issue claims: a takeover replaces an owner that went
   silent.
9. **Already fixed.** When the issue is already fixed on the deploy tip: comment the evidence (the commit sha and
   the repro you ran) on the issue and close it as completed. No PR, no question.

The PR is the report. Nothing else is read.

## The Hand-off block

The last section of the PR body, inside a ` ```handoff ` fence, one value per line:

```handoff
branch: <branch>
head: <sha>
owner: <host>:<session or agent id>
lane: claude | cursor | codex
verified: <what ran, verdict lines>
not-run: <groups the change needs that did not run, and why>
next: <the one next step>
```

Refresh it at every push and whenever you add `land`, `needs-owner` or `needs-decision`. A takeover worker
starts from this block and the Plan; it reads nothing else.

## Labels

| label | on | meaning |
|---|---|---|
| `ready` | issue | backlog, unclaimed |
| `claimed` | issue | a worker owns it; the claim comment names the session |
| `blocked` | issue | dispatcher/search projection of an open native dependency, or a documented non-issue gate |
| `needs-decision` | issue, PR | waits on Bryce; the options are in a comment |
| `priority` | issue, PR | Bryce's one steering word: launched or landed first |
| `run-ci` | draft PR | run the fast tier on the draft |
| `land` | PR | the worker asks GitHub to land it: `gate` check, then auto-merge |
| `hold` | PR | do not land; whoever set it removes it, Bryce always can; adding it turns an existing `gate` red ("not asked") and disables auto-merge |
| `needs-owner` | PR | no live worker; the dispatcher launches a takeover |
| `lane:claude` / `lane:cursor` / `lane:codex` | PR | which host owns it |
| `dispatch:pause` | Dispatch issue | launch nothing |
| `dispatch:merge-pause` | Dispatch issue | arm nothing: `land.yml` posts `gate` in progress ("paused"); removing the label takes effect on each PR's next event |
| `deploy:red` | Board issue | the latest Pages train failed; one fixer is launched |
| `epic` | issue | a parent; the work is in its sub-issues, so never take the epic itself |
| `bug` | issue | something is broken (GitHub's default label) |
| `flaky` | issue | a test that passed on retry or fails across branches (AGENTS.md rule 9) |
| `area:*` | issue | the subsystem (unchanged) |

The labels live in `.github/labels.json`; applying new rows to GitHub is a `gh label create` by hand (or the
dispatcher) until a sync job exists again.

## The dispatcher

`node tools/ci/dispatch.mjs` is a pure function of GitHub state and `tools/ci/dispatch.json` (the caps). A node
script cannot call the session tools, so it only PLANS: GitHub writes (labels, launch comments, the Board
comment) happen with `--apply`, and every session action is printed as a `CREATE_SESSION <json>` or
`NUDGE_SESSION <id> <message>` or `ARCHIVE_SESSION <id>` line that the running agent executes (`send_message`,
`archive_session`). One cycle, in order: `dispatch.mjs --children` → `get_session` for every named child
(save each result for `--sessions`) → `get_session` without an id (its `rate_limit_info.status` is `--quota`)
→ `dispatch.mjs --apply` → per
`CREATE_SESSION` line: `get_session` (must complete; `launch-gate.py` refuses `create_session` without that fresh
quota receipt) → `create_session` → run the printed `RECORD_LAUNCH` line, which posts the launch comment after the
launch. Live workers are `role:worker` sessions that are RUNNING or WORKING, plus recent launch comments
whose sessions are not represented in the fetched records; those claims count until `launchClaimHours` expires
or the session is known to have ended. The script's header holds the exact cycle and launch-gate commands.

It runs in ONE persistent session per Claude account, woken hourly by a scheduled task bound to that session. A
fresh scheduled session (`create_new_session_on_fire`) lacks `get_session`, `list_sessions` and `create_session`,
so it cannot execute the lines. The scheduled task's prompt is in the header of `tools/ci/dispatch.mjs` (its one
home; the cycle above is the summary). Its guards:

- **One dispatcher at a time.** The Board comment (issue #1780, marker `<!-- dispatch-board -->`) carries
  `lock: <session id> at <iso>`. `dispatch.mjs --apply --self <id>` refuses to act (first output line `= dispatch
  refused …`; no labels, Board, launches, nudges or archives) while ANOTHER session's lock is younger than `lockHours`
  (3). A clean handover is `--take-lock` by the new dispatcher, and the old one stops writing (skill `handoff`).
  Evidence: 7 dispatcher sessions in 30 h, two orchestrators labelling the same PRs at 10-29 07:41Z. The
  `dispatch: launched <host>:<title> for #<n> at <iso>` comment stays the per-target claim (younger than
  `launchClaimHours` = a live launch); each account's quota, caps and archive scope are its own.
- **Quota.** `rejected`: launch nothing, and the first output line says to disable the hourly trigger
  (`update_trigger enabled=false`; about 30 failed wake-ups followed a weekly-limit hit). `allowed_warning`: the launch
  cycle is skipped and the first line says so.
- **Foreign-activity probe.** Rule 2 skips a PR with a commit in the last `foreignHours` (2) by an author who is neither
  the PR's author nor a Claude identity, or a `lane:cursor` PR with a push in that window (#4187: a takeover lost 57
  min to a live Cursor agent).
- **Prerequisites.** Rule 2 skips a PR whose body or Plan names an open PR as its prerequisite ("after #N merges",
  "builds on #N", "depends on #N", "blocked by #N"); it launches once #N has merged (#4096 idled 4.4 h).

Its rules:

1. A `ready` issue with no `claimed`, `blocked` or `needs-decision` gets one worker (`priority` first), up to the
   caps, only when the account's quota is `allowed`; `allowed_warning`, `rejected` or unknown quota launches nothing.
   The script paginates list endpoints in pages of 100, capped at 50 pages. Landing backpressure: while `landQueueMax` (tools/ci/dispatch.json,
   15) or more open non-draft PRs carry `land`, it starts no issue worker and records one skip line ("issue
   launches paused: N PRs waiting to land"); rules 2 and 3 still launch, since they drain the queue.
2. An open PR whose `updated_at` is older than 2 h (6 h for `lane:codex`), or that already carries `needs-owner`
   (its worker stopped at the cap: no 2 h wait), with no `hold` or `needs-decision`, gets `needs-owner` and ONE
   takeover worker launched with `CONTINUE PR #<n>` (contract step 8). Never re-owned: a
   `land` PR with no red check, no failed (or stale pending) `gate` status and no conflict (GitHub is landing it;
   `dispatch:merge-pause` makes a pending gate an expected wait),
   a PR a RUNNING or WORKING `role:worker` session names, and bot PRs.
3. When the latest COMPLETED `pages.yml` run on the deploy branch is red, it labels the Board `deploy:red` and
   launches one fixer unless an open PR already carries `deploy:red`.
4. A session whose every referenced PR and issue is known closed, with the youngest closure more than
   `archiveAfterMinutes` (tools/ci/dispatch.json) ago, is archived. Never archived: a session tagged
   `no-archive` or `role:dispatcher`, an untagged one, one without a claim comment, and one that is RUNNING, WORKING
   or BLOCKED.
5. A child that is BLOCKED, REVIEW_READY or idle for 20 min, whose PR or issue is open and not labelled `land`,
   `needs-owner`, `hold` or `needs-decision`, gets one `NUDGE_SESSION` ("Continue …: subscribe to the PR, finish
   the Plan; questions go to @parent or `needs-decision`, never the user"), at most once an hour.
6. It rewrites the Board comment: open PRs, state, age, owner, launches, waiting children, nudges (the hourly
   record), quota per host, caps and the land queue depth.

`node tools/ci/pr-board.mjs` suggests LAND (the `land` label) for a PR that is ready to go, never ARM: no session
arms. The veto is the `hold` label; a `MERGE-HOLD:` body line is retired and binds nothing.

## Per vendor

- **Claude cloud session** (the default, `lane:claude`): the whole contract above. `subscribe_pr_activity` on your
  PR while CI runs on your head; no `send_later`, no bus. The parent is the dispatcher session: send_message
  session_id `@parent` to coordinate.
- **Cursor cloud agent** (`lane:cursor`, self-contained issues only; `hosts.cursor.enabled` is false today, so
  Bryce or the Grok launcher starts it): **Drafter** — after opening the draft PR, subscribe once with
  `subscribe_github_ci` (its branch) and `subscribe_github_pr` (the PR). A CI notification is not a new task. A red
  on its own head: fix it, at most 2 fix pushes. When CI is green or the cap is spent: refresh the Plan and Hand-off
  block, unsubscribe, stop. **Steward** (drives one existing PR to merge): subscribe at start, fix reds on its head,
  run `node tools/ci/ready-gate.mjs --pr <n>` when the Plan is done, unsubscribe and stand down if the dispatcher
  adopts the PR. Never sleep-poll, use timers or shell loops, and never comment on its own PR (it echoes back as a
  wake). The Cursor token does not add labels, claim, post issue comments, or open issues. Put `run-ci`,
  `lane:cursor`, and `land` in the block's `next:` line; Bryce or a later Claude lane applies them. Symbols go
  through apex-lsp (`lsp_outline`, `lsp_definition`, `lsp_callers`, then `lsp_diagnostics` once after the edit);
  grep is for comments, docs, and CSS. Do not spawn task_v2 scouts. Gate order: edit, `npm run gen`, the one spec
  `pick-tests` names, `tooling-fast --changed` once, commit, push. One more gate only when GitHub says CONFLICTING.
  NOT BUILT: the dispatcher sets neither `run-ci` nor `land` and sends no follow-up turn. No bus.
- **Codex thread** (`lane:codex`, Bryce's own tool, pull-only): write the Hand-off block at the first push and add
  `lane:codex`; the same `land` label lands you. A draft silent for 6 h is re-owned without asking. AGENTS.md stays
  under 32 KiB because it is all a Codex thread loads; where it names a Claude-only tool (`Monitor`,
  `run_in_background`, `subscribe_pr_activity`), Codex uses its own equivalent or skips the step.

## `LAND_TOKEN`

`land.yml` arms auto-merge with the repository secret `LAND_TOKEN` (a fine-grained PAT on this repository with
Contents, Pull requests and Workflows, each read and write; Workflows is needed to merge a PR that touches
`.github/workflows/`). Without it the workflow falls back to
`GITHUB_TOKEN`, which still lands the PR, but "events triggered by the GITHUB_TOKEN will not create a new workflow
run": the merge starts no Pages train, and the change ships on the 6-hourly cron or a manual dispatch. The job
summary says so when it fell back. The deploy branch ruleset "Deploy-reset" (set in the GitHub UI by Bryce; since
2026-10-27 the only rule, classic branch protection is deleted) requires ONE check, `gate` (source: GitHub Actions).
`CI` is not a GitHub-required check: `merge-gate.mjs`'s ci row enforces it, reading the newest check named exactly
`CI` (the "CI ignored: edit/label" runs never post one, so they cannot leave a required `CI` "expected"). The ruleset
allows merge commits only, forbids direct pushes and binds administrators; `pages.yml`'s
workflow-level concurrency group (one running train, one pending, the newest pending replaces the older) is the
pacing rule, so nobody has to remember "never dual-dispatch".

## What no longer exists

Retired 2026-10-27, all of it: the bus (`fleet-bus.mjs`, the `claude/fleet-bus` branch) and the claims board (`who-is-on-it.mjs`, `claude/claims-board`);
retired: the `fleet` block and the `fleet-status:` line in PR bodies, and the `MERGE-HOLD:` line;
retired: the orchestrator role, the seed, relay and watcher sessions;
retired: `GAME-SLOT` / `DONE` / `INCIDENT` messages, merge receipts and the hooks that demanded them, `fleet.yml` and `merge-attribution.yml`.
A sentence typed in a console grants nothing; a label does.
