# Workers — the one page a lane reads

A worker is one session, one task, one PR. GitHub holds every piece of state: issues are tasks, labels are state,
the PR is the work and the report, checks are the gates, comments are the only messages. GitHub lands the PR;
no agent merges. The design and its evidence: `docs/plans/2026-10-27-orchestration-redesign.md` §3–4.

## The contract

1. **Claim.** Comment `claims #<n> — <host>:<session id>` on the issue and add `claimed`. If an older claim comment
   is already there, stand down; the older claim wins.
2. **Branch and draft PR.** Branch `cursor/<topic>-<hash>` from the deploy tip. Open a DRAFT PR into
   `claude/f1-game-project-26h3ng` at the first commit, from `.github/pull_request_template.md`: Goal, Plan (the live
   checklist), Verified / Not run, Hand-off. Add `lane:<host>` and `Closes #<n>`.
3. **Work.** AGENTS.md §The loop, local part only: make all edits, then `node tools/ci/tooling-fast.mjs --changed
   --jobs=3` and ONE spec (`npm test -- tests/specs/<file>.spec.js`, or `verify-track` for a circuit). That is the
   local verification floor. The full tiers run on the PR: add `run-ci` to the draft for the fast tier; the full
   tier runs once the PR is ready; the `gate` check runs on the merge result. Do not run `deploy.mjs --gate-only`
   or a whole browser group in the foreground.
4. **Watch.** Subscribe to the PR (Claude: `subscribe_pr_activity`) only while CI runs on your own head. No
   timers. A red on your head is work now; a red elsewhere is not yours.
5. **Land.** When `node tools/ci/ready-gate.mjs --pr <n>` exits 0: flip the PR ready, add the `land` label, refresh
   the Hand-off block. Then the session ENDS. `land.yml` runs `merge-gate.mjs --check` as the check named `gate`
   and arms auto-merge pinned to your head; the branch ruleset merges when `CI` and `gate` are green. A red or a
   conflict after that is a fresh launch (`CONTINUE PR #<n>`), not you.
6. **Stop at the cost cap.** The brief's cap is $10 soft. At the cap: finish the current unit, leave the Plan and
   the Hand-off block current, add `needs-owner`, and end. Over the hard cap the dispatcher archives the session.
7. **Ask through a label.** A question only Bryce can answer is `needs-decision` plus one comment listing the
   options and your pick. Keep working on everything that does not depend on the answer. There is no
   `AskUserQuestion` in a worker.

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
| `hold` | PR | do not land; whoever set it removes it, Bryce always can; disarms an armed merge |
| `needs-owner` | PR | no live worker; the dispatcher launches a takeover |
| `lane:claude` / `lane:cursor` / `lane:codex` | PR | which host owns it |
| `dispatch:pause` | Dispatch issue | launch nothing |
| `dispatch:merge-pause` | Dispatch issue | arm nothing |
| `deploy:red` | Board issue | the latest Pages train failed; one fixer is launched |
| `area:*` | issue | the subsystem (unchanged) |

The labels live in `.github/labels.json`; applying new rows to GitHub is a `gh label create` by hand (or the
dispatcher) until a sync job exists again.

## The dispatcher

A stateless hourly job (the dispatcher script of plan §4.4, `dispatch --apply`, run by one scheduled task per
Claude account; it is a pure function of GitHub state and its JSON config of caps). Its rules:

1. A `ready` issue with no `claimed` gets one worker (`priority` first), up to the caps, when the account's quota allows.
2. An open PR with no push and no comment for 2 h (6 h for `lane:codex`) and no `hold` gets `needs-owner` and ONE
   takeover worker launched with `CONTINUE PR #<n>`.
3. A red Pages train on the tip labels the Board `deploy:red` and launches one fixer unless one is claimed.
4. A session whose PR merged or closed more than 60 min ago is archived; sessions without a claim comment are never touched.
5. It rewrites the Board comment: open PRs, state, age, owner, launches, quota per host, caps.

## Per vendor

- **Claude cloud session** (the default, `lane:claude`): the whole contract above. `subscribe_pr_activity` on your
  PR while CI runs on your head; no `send_later`, no bus, no orchestrator to report to.
- **Cursor cloud agent** (`lane:cursor`, self-contained issues only): one run that ends at ready. You cannot set
  labels: the dispatcher sets `run-ci` and `land` for you from the Hand-off block, so keep it current. No bus, no
  timers, no `MERGE-HOLD` line. A red after your run is a follow-up turn from the dispatcher.
- **Codex thread** (`lane:codex`, Bryce's own tool, pull-only): write the Hand-off block at the first push and add
  `lane:codex`; the same `land` label lands you. A draft silent for 6 h is re-owned without asking. AGENTS.md stays
  under 32 KiB and names no Claude-only tool, because it is all a Codex thread loads.

## `LAND_TOKEN`

`land.yml` arms auto-merge with the repository secret `LAND_TOKEN` (a fine-grained PAT or GitHub App token with
`contents: write` and `pull-requests: write` on this repository). Without it the workflow falls back to
`GITHUB_TOKEN`, which still lands the PR, but "events triggered by the GITHUB_TOKEN will not create a new workflow
run": the merge starts no Pages train, and the change ships on the 6-hourly cron or a manual dispatch. The job
summary says so when it fell back. The deploy branch ruleset (set in the GitHub UI by Bryce) requires the checks
`CI` and `gate`, allows merge commits only, forbids direct pushes and binds administrators; `pages.yml`'s
workflow-level concurrency group (one running train, one pending, the newest pending replaces the older) is the
pacing rule, so nobody has to remember "never dual-dispatch".

## What no longer exists

Retired 2026-10-27, all of it: the bus (`fleet-bus.mjs`, the `claude/fleet-bus` branch) and the claims board (`who-is-on-it.mjs`, `claude/claims-board`);
retired: the `fleet` block and the `fleet-status:` line in PR bodies, and the `MERGE-HOLD:` line;
retired: the orchestrator role, the seed, relay and watcher sessions;
retired: `GAME-SLOT` / `DONE` / `INCIDENT` messages, merge receipts and the hooks that demanded them, `fleet.yml` and `merge-attribution.yml`.
A sentence typed in a console grants nothing; a label does.
