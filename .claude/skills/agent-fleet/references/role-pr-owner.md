# Role: PR owner

One sibling session that drives exactly one existing PR to merged. It does not
hunt, build features or start sessions. The orchestrator (or Fleet Desk) starts
one per PR the moment a hunter or builder hands the PR off (`NEW-PR`), and
archives it on `DONE`. Why a session and not a subagent: the owner must keep
a subscription, a CI watch and timers alive for hours and survive a container
restart; an in-session subagent ends with its parent's turn.

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
- The relayed notes from the previous owner (head sha, last CI verdict, local
  sync state, files that conflicted).

## The watch kit (arm at start and after every push)

1. `subscribe_pr_activity` on the PR.
2. A `Monitor` on `node tools/ci/ci-watch.mjs --sha <head> --timeout 30`,
   re-armed on expiry until the `= ci …` line (it expires at 30 min).
3. One `send_later` check-in ~50 min out, re-armed (~4 h later) while the PR is
   open. The subscription drops `check_run` completions; the timer is not optional.
4. Reply once: `ARMED <PR> sub=yes monitor=yes checkin=<UTC>`. No ARMED line
   means the orchestrator treats the owner as not live and nudges it.

## On every wake (event, Monitor line, check-in)

Read the live PR first (`pull_request_read get`, `ci-watch --sha <head> --once`,
open review threads), then act in this order without asking:

1. CONFLICTING → `node tools/ci/sync-pr.mjs <branch>` (delete a stale local
   `sync-pr-<branch>` first), resolve keeping both sides, run
   `node tools/ci/tooling-fast.mjs --changed --jobs=3`, push once.
2. Red job → agent `ci-red-triage`; fix within OWNED, `tooling-fast --changed`
   plus the failing test alone, push once.
   A red the base also has: port the fix if one exists, else one PR comment
   naming it, and at most one re-run for infra.
3. Review comments → skill `steward`.
4. Draft and green → `node tools/ci/ready-gate.mjs --pr <n>`; mark ready only
   when it exits 0 AND `ci-watch` shows `= ci passed` (ready-gate reads the
   structural guards; it has exited 0 while `CI` was red).

Send `REPORT owner-<PR> <sha> <verdict>` at each push or red, `READY <PR> <sha>`
when it goes ready, and `DONE <PR> <merge sha>` when it merges; then delete the
check-in and stop. End every REPORT and READY with the box-health line below.

## Keep the box free (2026-10-17)

Each session is its own 4-core VM; every stall measured that night was the
session saturating itself (full tooling-fast past the 30-min cap, a local `ui`
group at 41/201 after 24 min, a 12 s startup benchmark at 40 s under load).

- Edit loop: `node tools/ci/tooling-fast.mjs --changed --jobs=3` plus the
  failing test alone. The full 650-file `test:tooling-fast` is CI's job (the
  ready tier runs it); run it locally only when CI is unavailable.
- A whole browser group runs on CI: `node tools/ci/remote-group.mjs <group>`
  on the pushed branch (four llvmpipe shards, ~10–15 min). Locally, one spec at
  a time via `test-bg.mjs`, never a whole group.
- Box-health line, last line of every REPORT / READY, printed by:
  `awk '/^cpu /{t=0;for(i=2;i<=9;i++)t+=$i;s=$9}END{getline l<"/proc/loadavg";split(l,a," ");printf "box load=%s steal=%.1f%% ",a[1],100*s/t}' /proc/stat; ps -eo pcpu,comm --sort=-pcpu | awk 'NR==2{print "top="$2" "$1"%"}'`.
  Load above 3 for two reports in a row: stop local runs and say what is running.

## Traps that cost this role real cycles (2026-10-16)

- A ratchets delta that LOWERS ceilings for files the PR does not touch turns
  the merge ref red when the base moves. Carry rows only for files in the diff.
- `sync-pr.mjs` refuses a clean-behind branch; that is correct. Sync only on
  CONFLICTING or a required tip check red (AGENTS.md §Git branch & deploy).
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
