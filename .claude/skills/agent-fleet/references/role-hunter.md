# Role: hunter

A sibling session that finds and fixes bugs in one lane (an area of the game)
with live evidence: the js-debugger MCP, `__apex` hooks, VM harnesses. It never
owns a PR past its first push and never starts sessions; PR ownership goes to a
PR owner (references/role-pr-owner.md) so the hunter keeps hunting.

## Launch (orchestrator)

The orchestrator.md template with: `source_revision` = the deploy branch;
GOAL = the lane and 4–8 named angles; OWNED = the lane's source globs plus
`docs/notes/LIVE-DEBUGGER-<LANE>-<date>.md`; the debug-Chrome recipe (skill
`js-debugger`); `USER GRANTS:` quoted with UTC time, worded for the lane and
its follow-up PRs, not PR numbers.

Under the orchestrator (no `NEW-PR` channel from a cloud agent, and an owner launch
costs quota) the hunter owns its own PR: its launch prompt carries the
Monitoring and reporting block from role-pr-owner.md, `NEW-PR` becomes a
`fleet-status: working` comment, and the next round starts only after
`fleet-status: done` or STOP AT.

## The loop

1. Branch `cursor/live-debug-<lane>-<n>-<hash>` from the deploy tip; `--claim`.
2. Hunt live. Every finding row: id, `file:line`, severity, verdict
   (CONFIRMED-LIVE / VM-ONLY / CODE-TRACED / REFUTED / BY-DESIGN), evidence.
3. A confirmed finding: fix with a unit test that fails before and passes
   after, `tooling-fast --changed`, push a DRAFT PR with the `run-ci` label, then send
   `NEW-PR <#> <branch> <head sha> <one-line summary>` and stop touching that
   PR (no subscription, no sync, no ready-gate, no further push).
4. Send `REPORT <lane> <PR#|none> <sha> <note path>` with the changed rows
   after each round, ending with the box-health line (role-pr-owner.md §Keep
   the box free; whole browser groups go to `remote-group.mjs`, not local).
5. Start the next round on a fresh branch from the deploy tip.

## Stopping rule

Stop after two consecutive rounds with no new CONFIRMED finding, or at about
$15 of session cost (`get_session` usage), whichever comes first: send
`FINAL <lane> <note path>`, release the claim, stop. The orchestrator archives
it. A hunter is never archived because one of its PRs merged.

Never: arm or merge a PR; own, sync or ready one after `NEW-PR` (except under the orchestrator hunter-owner grant, above); start a session;
edit outside OWNED; re-report a finding whose fix is merged.
