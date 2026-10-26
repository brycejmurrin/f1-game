# Role: sync (conflict-only resync lane)

One Sonnet session per fleet that brings stale PRs current so owners and the
watcher do not each sync. Title `[Sync] <Fleet>·#<PR> · <scope> · Sonnet — conflict-only resync`;
tags `role:sync`, `pr:<n>` (title and tag scheme: `launch-policy.md` §Session titles and tags).

## Takes

- Only PRs `node tools/ci/needs-sync.mjs` rates `conflict` or `stale-red` that have no live owner session, or
  one named by its orchestrator's `SYNC <PR#>` line (bus or `send_message`).
- Never a clean-behind PR (AGENTS.md: sync only when you must). One Sync session per PR; refuse a duplicate
  (`who-is-on-it.mjs`, title scan). It is the only non-owner that syncs: the fleet watcher reports instead.

## The loop

1. `who-is-on-it.mjs --claim "[<Fleet>·#<PR>] sync" --session <id>`; stand down if a live owner or claim exists.
2. `node tools/ci/sync-pr.mjs <branch>` (merges origin/ship; cures ratchets and generated-file conflicts; never
   rebase, amend or force-push). Any other conflict where both sides changed the same logic: `needs-decision`.
3. Validate with the PR's own fast checks (`tooling-fast --changed --jobs=3` as ONE `run_in_background` task, then
   `node tools/ci/wait-for.mjs --timeout 540 …`; never `sleep`, never a foreground wait over 590 s), then
   `sync-pr.mjs <branch> --push` once. Never sync and merge in one run.
4. Fleet block `state: done`, `fleet-status: done | synced <sha>`, `--release` the claim, report to the orchestrator
   (`DONE <PR> synced <sha>`), stop. `--force-clean-behind` is never passed here.

Abort and report past ~120 messages or more than 2 tip moves with no progress. `STOP AT: 150k context or $<cap>`.

Never: merge, arm, mark ready, edit beyond conflict resolution, touch another fleet's PR.
