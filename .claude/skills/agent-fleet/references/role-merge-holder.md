# Merging (every orchestrator, by gate; Merge Desk dormant unless designated)

Merging is a duty of each orchestrator, not a role, and since 2026-10-19 it is
decided by a GATE, not by a grant (`docs/plans/2026-10-19-fleet-redesign.md`
§1-2). The standing authority is AGENTS.md §Concurrent PRs; a successor
orchestrator inherits it by loading AGENTS.md and **never re-asks it** (ORCH13
asked four questions at its 18:58Z hand-off; the launch brief that told it to
is gone). What still needs Bryce's typed word in the acting session: a
`.claude/**` edit (the platform classifier gates it), lifting a `MERGE-HOLD:`,
and a merge the gate refuses.

Merge Desk is dormant unless Bryce designates a session or Routine (ci-watch
skill). No designation means every orchestrator merges its own fleet's PRs, in
parallel, on any host. Every launch prompt says: "No Merge Desk is live; the
PR's own orchestrator merges. Send READY to it, never SWEEP."

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
`merge_pull_request` / `enable_pr_auto_merge` without a receipt under 30 min
old whose head is the call's `expectedHeadSha`; `update_pull_request draft:false`
needs the `ready-gate --pr` receipt the same way. A refusal names the row.

## Mechanics

- **MERGE-COMMIT-ONLY.** Never squash or rebase-merge (hook-denied).
- Gate, then merge at once: `merge_pull_request` with `merge_method: "merge"`
  and `expectedHeadSha` = the gated head. A 405/409 "base modified" means a
  peer merged first: gate again.
- After every merge: `git log -1 --format=%p <merge sha>` shows **two
  parents** (a one-parent "merge" landed as squash in #1743), then
  `node tools/ci/fleet-bus.mjs send DONE --to '*' "#<PR> <merge sha> game|non-game <fleet>"`,
  archive the PR's finished session by the archive rule (AGENTS.md;
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
  `INCIDENT` line stands without its `INCIDENT … lifted`. Bryce's own merges
  carry no bus line (memory `bryce-merges-manually`): the gate's local merge
  onto the fresh tip still covers them.
- **Stop for everyone** on red Pages or red ship-push CI, whoever caused it:
  post an `INCIDENT` line; the author posts `INCIDENT #N lifted` when it is.
- Dispatch Pages after a game merge when no run is queued (never dual).

Never: cancel an Actions run, merge on a relayed grant, arm a draft, merge
without the receipt (the hook refuses), skip the two-parent check, merge
another fleet's PR.
