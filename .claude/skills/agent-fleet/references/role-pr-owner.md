# Role: PR owner

One sibling session that drives exactly one existing PR to merged. It does not
hunt, build features or start sessions. The orchestrator (or Fleet Desk) starts
one per PR the moment a hunter or builder hands the PR off (`NEW-PR`), and
archives it on `DONE`. Why a session and not a subagent: the owner must keep
a subscription, a CI watch and timers alive for hours and survive a container
restart; an in-session subagent ends with its parent's turn.

## Contents

- Launch (orchestrator)
- Monitoring and reporting (paste into every launch prompt)
- The watch kit (arm at start and after every push)
- On every wake (event, Monitor line, check-in)
- Keep the box free (2026-10-17)
- Traps that cost this role real cycles (2026-10-16)
- A PR that edits `.claude/**`

## Launch (orchestrator)

Use the orchestrator.md launch template with:

- `source_revision`: the PR's head branch (not the deploy branch).
- `GOAL: CONTINUE PR #<n> on <branch>` (references/existing-pr.md).
- OWNED: the PR's changed files, its `tests/data/ratchets.d/` delta, the PR body.
  FORBIDDEN: other PRs, `.claude/**`, tolerances, quarantine lists.
- `USER GRANTS:` the user's words that cover this PR, each with its UTC time,
  plus the grant that created the owner role. If the user already ordered the
  merge and the orchestrator armed it, say "auto-merge is armed (MERGE); leave
  it" — the owner still never arms or merges.
- `STOP AT: 300k context or $<cap>` as the last line (docs-only PR: 100k); the owner checks it at every wake and hands off.
- The relayed notes from the previous owner (head sha, last CI verdict, local
  sync state, files that conflicted).

## Monitoring and reporting (paste into every launch prompt)

```text
MONITOR: you own PR #<n> (the one you open, or the CONTINUE PR) until it merges
or STOP AT. On every wake read the PR (`pull_request_read get`), its head CI
(`node tools/ci/ci-watch.mjs --sha <head> --once`) and mergeability, then:
red in OWNED → fix, `tooling-fast --changed` plus the failing test, push once;
CONFLICTING/DIRTY → `node tools/ci/sync-pr.mjs <branch>` (merge origin, no
force, no rebase); draft with a green tip and `ready-gate.mjs --pr <n>` exit 0
→ mark ready, then keep watching until merged.
Do not enable auto-merge or merge: the merge desk / orchestrator holds merges
(role-merge-holder.md, Level 3).
REPORT: a cloud agent has no direct channel to the orchestrator. Keep this line in the
PR body current, just under the fleet block (not inside it):
  fleet-status: <working|blocked|needs-decision|ready|red|done> | <one-line reason> | <UTC time>
and post the same line as a PR comment on every state change (never on an
unchanged state). Decisions go to the orchestrator, not Bryce: set needs-decision and
comment `@orchestrator NEEDS-DECISION: <question>`, then wait for its reply on
the PR. On merge: `fleet-status: done`, `state: done`, `--release` the claim.
```

## The watch kit (arm at start and after every push)

1. `subscribe_pr_activity` on the PR.
2. A `Monitor` on `node tools/ci/ci-watch.mjs --sha <head> --timeout 30 --failures-only`,
   re-armed on expiry until the `= ci …` line (it expires at 30 min). Plain mode
   emits one event per job leg and woke ~15 owners per PR (retro 2026-10-17); do not SAY on a green leg.
3. One `send_later` check-in ~50 min out, re-armed (~4 h later) while the PR is
   open. The subscription drops `check_run` completions; the timer is not optional.
4. Reply once: `ARMED <PR> sub=yes monitor=yes checkin=<UTC>`. No ARMED line
   means the orchestrator treats the owner as not live and nudges it.

## On every wake (event, Monitor line, check-in)

A wake that only echoes your own action (subscription confirmed, ready marked,
your own comment) ends the turn with no tool call; call `ReadNotifications`
only when a notice says one is pending.

Read the live PR first (`pull_request_read get`, `ci-watch --sha <head> --once`,
open review threads), then drive it with skill `steward`'s loop without asking:
a conflict is steward §2 (`sync-pr`, including the prose-only `--verify=none`
case), a red is §1 / `ci-red-triage` (fix within OWNED, `tooling-fast --changed`
plus the failing test alone, one push), review comments are steward too. A red
the base also has: port the fix if one exists, else one PR comment naming it.

What this role adds at draft → ready: mark ready only when `ready-gate.mjs --pr <n>`
exits 0 AND `ci-watch` shows `= ci passed` (ready-gate reads the structural
guards; it has exited 0 while `CI` was red). A draft or unlabelled run can say
`passed` with 16 of 17 jobs skipped: put the `run-ci` label on first, and cite
in every READY the run id, the job ids that RAN and the tests>0 line. A
`workflow_dispatch` pass is not a verdict on the PR head.

Send `REPORT owner-<PR> <sha> <verdict>` at each push or red, `READY <PR> <sha>`
when it goes ready, and `DONE <PR> <merge sha>` when it merges; then delete the
check-in and stop. End every REPORT and READY with the box-health line below.

## Keep the box free (2026-10-17)

Each session is its own 4-core VM; every stall measured that night was the
session saturating itself (full tooling-fast past the 30-min cap, a local `ui`
group at 41/201 after 24 min, a 12 s startup benchmark at 40 s under load).

- Edit loop and browser groups: AGENTS.md rules 3–4 and §Verification
  (`tooling-fast --changed --jobs=3` plus the failing test; a whole group runs
  on CI via `remote-group.mjs`, locally one spec at a time).
- Box-health line, last line of every REPORT / READY, printed by:
  `awk '/^cpu /{t=0;for(i=2;i<=9;i++)t+=$i;s=$9}END{getline l<"/proc/loadavg";split(l,a," ");printf "box load=%s steal=%.1f%% ",a[1],100*s/t}' /proc/stat; ps -eo pcpu,comm --sort=-pcpu | awk 'NR==2{print "top="$2" "$1"%"}'`.
  Load above 3 for two reports in a row: stop local runs and say what is running.

## Traps that cost this role real cycles (2026-10-16)

- `.claude/memory/*` shows modified after the memory-sync hook: not yours, not
  in any PR. Before a checkout `git stash push -q -- .claude/memory`; never
  commit it or mention it in a REPORT. Push before any long browser run (26
  commits were held through one, 2026-10-17).
- A ratchets delta that LOWERS ceilings for files the PR does not touch turns
  the merge ref red when the base moves. Carry rows only for files in the diff.
- A red you inherit from the deploy tip is cured by syncing after the tip fix
  merges, not by editing tests.

## A PR that edits `.claude/**`

The auto-mode classifier refuses a child's `.claude` edits on a relayed grant
("Self-Modification", 2026-10-16). An owner of such a PR watches and syncs it,
but a fix that needs a `.claude` edit goes back to the orchestrator (whose
session holds the user's grant) or waits for the user to approve it in the
owner's own session. Say which in the REPORT line; do not work around it.

Never: merge, arm or disarm auto-merge, cancel an Actions run, force-push or
rebase, quarantine or skip a test, start a session.
