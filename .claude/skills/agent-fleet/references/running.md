# Running the fleet (orchestrator, after launch)

Launching is `orchestrator.md`; this is every wake after it.

## Roles and hand-offs (2026-10-17)

Launch by role (SKILL.md §roles): a hunter finds and fixes, then sends
`NEW-PR <#> <branch> <sha> <summary>` and drops the PR; you start one PR owner
per PR (role-pr-owner.md) within minutes, quoting the user's grants; the owner
replies `ARMED`, drives the PR, and sends `DONE <PR> <merge sha>`; you verify
two parents and archive the owner, never the hunter. With no live Merge Desk
you are the merge holder (role-merge-holder.md). Spawning stays here by
default: a grandchild acting on a quote of a quote is relayed authority, and
the auto-mode classifier refused relayed `.claude` edits, CI re-runs and merges
on 2026-10-16. `.claude/**` edits are done by you or approved by the user in
the acting session.

## Reading the fleet

- One pass per wake: for every worker PR, read the fleet block (its
  `fleet-status:` line), the latest `@orchestrator` / `fleet-status:` comment, the head SHA's CI (`node tools/ci/ci-watch.mjs --sha
  <sha> --once`) and mergeability.
- Workers iterate on what their change touches (`tooling-fast --changed` plus
  the specs `pick-tests` / `select-specs` name) and run the full `tooling-fast`
  once before a code push (AGENTS.md rule 3). At most one merge from the deploy branch per PR per hour unless the PR
  is `dirty` / conflicting or `needs-sync.mjs` says `stale-red` (`sync-pr.mjs`); being N commits behind is no reason.
- Per wake, flag runaways before reading PRs: collect each sibling's `get_session` reply (plus cumulative `cost_usd` from its `result` events) into a JSON array and run `node tools/ci/fleet-flags.mjs <file>`. It prints cost, context, configured vs served model, connection and age, and flags served≠configured, cost over the brief's cap (default $15), context over 300k, and a `working` session disconnected or silent for 30 min (#2666).
- A worker is **stalled** when its state has not changed and its branch has
  not moved for ~90 min, or it passed its caps. Ask once, then interrupt and
  relaunch with NEW evidence or a narrower OWNED, never the same prompt.
- Keep one safety-net timer (`send_later` / `subscribe_timer`, ~50 min, later
  ~4 h) while workers run; drop it when every PR is merged or closed.
- Each wake also lists every open PR with no live owner session (Bryce requires
  one per PR); start an owner (role-pr-owner.md) or say why not. `pr-board`
  does not print this yet: check `get_session` per owner.
- One owner per red tip: steward §3.
- After a merge, if a Pages run is pending and none running, hold further
  merges until one starts: each merge replaces the PENDING train (45 min stale
  site, 2026-10-17). A RUNNING train is never cancelled.

## Answering an escalation

Answer only from what the user already decided, the launch prompt, the code,
or AGENTS.md. Anything that is the user's call goes to the user, with the
worker's question quoted and the options. Reply where the worker can read it:
`send_message` (Claude), `Task` `resume` or a follow-up run (Cursor), a PR
comment (all).
