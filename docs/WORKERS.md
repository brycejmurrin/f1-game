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

## The contract

1. **Claim.** Comment `claims #<n> — <host>:<session id>` on the issue and add `claimed`. If an older claim comment
   is already there, stand down; the older claim wins.
2. **Branch and draft PR.** Branch `cursor/<topic>-<hash>` from the deploy tip. Open a DRAFT PR into
   `claude/f1-game-project-26h3ng` at the first commit, from `.github/pull_request_template.md`: Goal, Plan (the live
   checklist), Verified / Not run, Hand-off. Add `lane:<host>` and `Closes #<n>`.
3. **Work.** AGENTS.md §The loop: make all edits, then verify once to the pre-push floor (AGENTS.md rule 3 is its
   one home). The full tiers run on the PR: add `run-ci` to the draft for the fast tier; the full tier runs once
   the PR is ready; the `gate` check runs on the merge result. `ready-gate` (step 5) needs `Structural guards`
   green on your head, so let the `run-ci` fast tier finish once before you land (a full local tooling-fast run
   writes the other accepted stamp).
4. **Watch.** Subscribe to the PR (Claude: `subscribe_pr_activity`) only while CI runs on your own head. No
   timers. A red on your head while you still own it is work now; a red elsewhere is not yours. Never claim done
   on a red.
5. **Land.** When `node tools/ci/ready-gate.mjs --pr <n>` exits 0: flip the PR ready, add the `land` label, refresh
   the Hand-off block, and end the turn. The session stays subscribed, so each PR event wakes it, until the
   dispatcher archives it (rule 4 below: `archiveAfterMinutes` after its PR merged or closed, 60 in
   `tools/ci/dispatch.json`, on the hourly cycle). `land.yml` runs `merge-gate.mjs --check` as the check named `gate`
   and arms auto-merge pinned to your head; the ruleset merges when `gate` is green (its ci row requires the newest
   check named exactly `CI` green on your head). Adding `land` while CI still runs is fine: `gate` shows in
   progress ("waiting") and re-evaluates when CI ends. Going back to draft or removing `land` turns `gate` red. A
   red or a conflict after that is a fresh launch (`CONTINUE PR #<n>`), not you.

   How `land.yml` arms: one PR per run, skipped when the deploy tip moved since its `gate` evaluation (the next
   event re-gates it); `gh pr merge --auto` on a CLEAN PR merges at once. An API or git error leaves `gate` in
   progress ("error, will retry"), never red.
6. **Stop at the cost cap.** The brief's cap is $10 soft. At the cap: finish the current unit, leave the Plan and
   the Hand-off block current, add `needs-owner`, and end. The $15 hard-cap archive is NOT built (`dispatch.mjs`
   reads no cost), so the soft cap is yours to keep.
7. **Ask through a label.** A question only Bryce can answer is `needs-decision` plus one comment listing the
   options and your pick. Keep working on everything that does not depend on the answer. There is no
   `AskUserQuestion` in a worker. When Bryce answers in the thread, the worker removes `needs-decision` and
   carries on. The dispatcher skips a PR or issue carrying it, so a waiting PR is never re-owned.
8. **Take over.** A `CONTINUE PR #<n>` worker adopts the PR: comment `adopts PR #<n> — <host>:<session id>` on it
   and remove `needs-owner`, then work from the Hand-off block and the Plan. On a PR the NEWEST adoption comment
   wins (stand down if a newer one appears), the opposite of issue claims: a takeover replaces an owner that went
   silent.

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
| `blocked` | issue | waits on another issue (`Blocked by #n`) |
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
`ARCHIVE_SESSION <id>` line that the running agent executes. One cycle, in order: `list_sessions` (every page,
saved for `--sessions`) → `get_session` (its `rate_limit_info.status` is `--quota`) → `dispatch.mjs --apply` → per
`CREATE_SESSION` line: `get_session` (must complete; `launch-gate.py` refuses `create_session` without that fresh
quota receipt) → `create_session` → run the printed `RECORD_LAUNCH` line, which posts the launch comment after the
launch. Live workers are `role:worker` sessions that are RUNNING or WORKING; nothing else counts against the caps.

It runs in ONE persistent session per Claude account, woken hourly by a scheduled task bound to that session. A
fresh scheduled session (`create_new_session_on_fire`) lacks `get_session`, `list_sessions` and `create_session`,
so it cannot execute the lines. Two accounts are two dispatchers on one Board comment (marker
`<!-- dispatch-board -->`, the last run wins it): the `dispatch: launched <host>:<title> for #<n> at <iso>`
comment is the lock (younger than `launchClaimHours` = a live launch), and each account's quota, caps and
archive scope are its own; one account cannot archive or message the other's sessions. Its rules:

1. A `ready` issue with no `claimed`, `blocked` or `needs-decision` gets one worker (`priority` first), up to the
   caps, when the account's quota allows. The script reads one page of 100 open issues (a known gap; a hand
   search with `search_issues` sees them all).
2. An open PR whose `updated_at` is older than 2 h (6 h for `lane:codex`), with no `hold` or `needs-decision`, gets
   `needs-owner` and ONE takeover worker launched with `CONTINUE PR #<n>` (contract step 8). Never re-owned: a
   `land` PR with no red and no conflict (GitHub is landing it), and bot PRs.
3. When the latest COMPLETED `pages.yml` run on the deploy branch is red, it labels the Board `deploy:red` and
   launches one fixer unless an open PR already carries `deploy:red`.
4. A session whose PR merged or closed more than 60 min ago is archived. Never archived: a session tagged
   `no-archive` or `role:dispatcher`, an untagged one, one without a claim comment, and one that is RUNNING, WORKING
   or BLOCKED.
5. It rewrites the Board comment: open PRs, state, age, owner, launches, quota per host, caps.

`node tools/ci/pr-board.mjs` suggests LAND (the `land` label) for a PR that is ready to go, never ARM: no session
arms. The veto is the `hold` label; a `MERGE-HOLD:` body line is retired and binds nothing.

## Per vendor

- **Claude cloud session** (the default, `lane:claude`): the whole contract above. `subscribe_pr_activity` on your
  PR while CI runs on your head; no `send_later`, no bus, no orchestrator to report to.
- **Cursor cloud agent** (`lane:cursor`, self-contained issues only; `hosts.cursor.enabled` is false today): one
  run that ends at ready, with the Hand-off block current. NOT BUILT: the dispatcher sets neither `run-ci` nor
  `land` for a Cursor PR and sends no follow-up turn, so until it does Bryce adds them by hand. No bus, no timers.
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
