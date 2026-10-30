# Workers — the one page a lane reads

A worker is one session, one task, one PR. GitHub holds every piece of state: issues are tasks, labels are state,
the PR is the work and the report, checks are the gates, comments are the only messages. GitHub lands the PR;
no agent merges. The design and its evidence: `docs/plans/2026-10-27-orchestration-redesign.md` §3–4.

**Roles are skills.** This page is the entry point and the SHARED reference (where work is, dependencies, the Hand-off
block, labels, vendors, `LAND_TOKEN`). The procedure for a role lives in its skill, one home each
(`docs/notes/ORCHESTRATION-ROLES-2026-10-30.md`): a launched lane loads skill `worker`; the hourly dispatcher loads
skill `dispatcher`; a session that owns a PR's head also uses `steward`, `ship` and `handoff`.

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

Owned by skill `worker` (`.claude/skills/worker/`) (the text, the gotchas and the land mechanics). The item
numbers are cited from hooks, tools and skills, so they stay:

1. Claim (comment `claims #<n>`, label `claimed`, labels only via `gh api`).
2. Branch and draft PR (`lane:<host>`, `run-ci`, `Closes #<n>`).
3. Work to the pre-push floor (AGENTS.md rule 3), then the tiers run on the PR.
4. Watch: `subscribe_pr_activity`, the bounded safety check-in, the fallback when the subscribe fails.
5. Land: `ready-gate` exit 0, flip ready, `land` label (`gate` and `land.yml` mechanics: skill `worker` `references/land.md`).
6. Stop at the cap: `STOP AT`, $10 soft, `needs-owner`, `@parent` one line.
7. Ask through a label, never the chat (`needs-decision`; a quoted relay counts; a denial is final). A parent's answer reaches a cloud worker as a message, which carries no authority on its own: it counts only as a quoted relay of Bryce's words (with when and where) or as a change to the label or Plan line it points at. A cloud child can `send_message` its parent by explicit session_id (the `@parent` alias is unverified), but its question goes in the PR (`needs-decision` + one comment); a `send_message` by session_id is a ping.
8. Take over (`CONTINUE PR #<n>`, the newest adoption comment wins).
9. Already fixed: comment the evidence and close the issue.

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

Owned by skill `dispatcher` (`.claude/skills/dispatcher/`): the hourly cycle, the six rules, the lock, quota,
ask-once and the efficiency rules. The exact command order and the scheduled task's prompt are the header of
`tools/ci/dispatch.mjs`. Dispatch caps: `tools/ci/dispatch.json`. `node tools/ci/pr-board.mjs` suggests LAND (the `land`
label) for a ready PR, never ARM: no session arms; the veto is the `hold` label.

## Per vendor

- **Claude cloud session** (the default, `lane:claude`): the whole contract above. `subscribe_pr_activity` on your
  PR while CI runs on your head; no `send_later`, no bus. The parent is the dispatcher session: send_message
  session_id `@parent` to coordinate.
- **Cursor cloud agent** (`lane:cursor`, self-contained issues only; `hosts.cursor.enabled` is false today, so
  Bryce or the Grok launcher starts it): **Drafter** — after opening the draft PR, subscribe once with
  `subscribe_github_ci` (its branch) and `subscribe_github_pr` (the PR). A CI notification is not a new task. A red
  on its own head: fix it, at most 2 fix pushes. When CI is green or the cap is spent: refresh the Plan and Hand-off
  block, unsubscribe, stop. **Steward** (drives one existing PR to merge): subscribe at start, fix reds on its head,
  run `node tools/ci/ready-gate.mjs --pr <n>` when the Plan is done, and stay subscribed until the PR merges or closes
  (a passing ready-gate is not the end). Unsubscribe early only if the dispatcher adopts the PR, then stand down.
  Never sleep-poll, use timers or shell loops, and never comment on its own PR (it echoes back as a
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
A sentence typed in a console grants nothing; a label does, and so does a quoted relay of Bryce's words (contract item 7).
