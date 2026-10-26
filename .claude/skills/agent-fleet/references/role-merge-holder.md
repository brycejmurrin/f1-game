# Merging (every orchestrator, by gate)

Merging is a duty of each orchestrator, not a role, and since 2026-10-19 it is
decided by a GATE, not by a grant (`docs/plans/2026-10-19-fleet-redesign.md`
§1-2). The standing authority is AGENTS.md §Concurrent PRs; a successor
orchestrator inherits it by loading AGENTS.md and **never re-asks it** (ORCH13
asked four questions at its 18:58Z hand-off; the launch brief that told it to
is gone). What still needs Bryce's typed word in the acting session:
`authority.md`. Hold lifting: `.claude/rules/fleet-core.md` (a hold the PR's
own worker wrote is yours to lift; a hold Bryce wrote is his).

No Merge Desk exists unless Bryce designates one; every orchestrator merges its
own fleet's PRs, in parallel, on any host, and READY goes to it. A green, clean
READY PR that has waited ≥ 2 h with no action by its fleet's merger may be
merged by any live orchestrator, posting LEND then DONE, never under a
well-formed hold (`.claude/rules/fleet-core.md` is the home; DECISIONS 2026-10-26 #7).

## The gate

```
node tools/ci/merge-gate.mjs --pr <n>        # exit 0 = merge now; artifacts/merge-gate/<n>.json is the receipt
```

Rows, every one required: open (not draft; GitHub not dirty/unknown/blocked),
hold (no `MERGE-HOLD:` line), ready (`ready-gate`: Structural guards green,
Plan closed, memory marker), ci (the required `CI` check-run success on the
head), gen (the head merged onto the CURRENT deploy tip in a throw-away
worktree, `npm run gen:check` 0 — a peer may have merged a minute ago), and
for game PRs pacing (below). `github-mcp-guard.sh` and the `gh` door refuse
`merge_pull_request` / `enable_pr_auto_merge` without a receipt under 10 min
old whose head is the call's `expectedHeadSha`; `update_pull_request draft:false`
needs the `ready-gate --pr` receipt the same way. A refusal names the row.

## Mechanics

- Merge method and the two-parent check: `.claude/rules/fleet-core.md` (hook-denied otherwise).
- Gate, then merge at once: `merge_pull_request` with `merge_method: "merge"`
  and `expectedHeadSha` = the gated head. A 405/409 "base modified" means a
  peer merged first: gate again.
- After every merge: check two parents, then
  `node tools/ci/fleet-bus.mjs send DONE --to '*' "#<PR> <merge sha> game|non-game <fleet>"`
  (protocol line — keep on fleet-bus), archive the PR's finished session by the archive rule (AGENTS.md;
  `fleet-archive.mjs`), and tell the lane that produced it.
- **Non-game batch** (Bryce 2026-10-19): PRs touching only `tests/`, `tools/`,
  `docs/`, `.claude/` merge back-to-back, each gated against the tip the
  previous merge produced (GitHub "clean" is not enough: PRs older than #2899
  merged locally failed `gen:check`).
- **Game pacing** (`js/`, `css/`, `assets/`, `index.html`, `sw.js`): at most one
  merge per green Pages run, shared by every fleet, read from the bus. Claim
  the slot first: `fleet-bus.mjs send GAME-SLOT --to '*' "#<PR> <head sha>"`;
  the bus push is compare-and-swap, so the earlier GAME-SLOT line wins and a
  later claimant waits for the winner's `DONE` plus green Pages. The gate
  refuses while another live slot (< 30 min, no DONE after it) is open, while
  the last game `DONE`'s merge sha has no green `pages.yml` run, or while an
  `INCIDENT` line stands without its `INCIDENT … lifted`. A merge with no DONE
  line is usually Bryce's own: the gate's local merge onto the fresh tip still
  covers it.
- **Lent PRs** (#3780): lending a PR lends its merge. The lender records it on
  the PR (fleet block `orchestrator:` = borrower letter, `lent-by: <lender>`)
  and removes its own `MERGE-HOLD: <lender> merges` line; a message alone lends
  nothing. The borrower merges via merge-gate once READY + green (GAME-SLOT for
  game PRs), posts `DONE` and tells the lender. No clean-behind resync while it waits.
- **Stale holds**: a `MERGE-HOLD:` with no `lift:`/`until:` that a fleet worker
  wrote (e.g. `deploy gate pending`) is a Plan item in the wrong place: move it
  to the Plan and lift it; a READY green PR held > 12 h is reported to Bryce once.
- **Stop for everyone** on red Pages or red ship-push CI, whoever caused it:
  post an `INCIDENT` line; the author posts `INCIDENT #N lifted` when it is.
- Dispatch Pages after a game merge when no run is queued (never dual).

Never: cancel an Actions run, merge on a relayed grant, arm a draft, merge
without the receipt (the hook refuses), skip the two-parent check, merge
another fleet's PR it has not lent you.
