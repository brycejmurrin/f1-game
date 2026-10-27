# Running the fleet (orchestrator, after launch)

Launching is `orchestrator.md`; this is every wake after it.

## Roles and hand-offs (2026-10-17)

Launch by role (SKILL.md §roles): a hunter finds and fixes, then sends
`NEW-PR <#> <branch> <sha> <summary>` and drops the PR; you start one PR owner
per PR (role-pr-owner.md) within minutes, quoting the user's grants; the owner
replies `ARMED`, drives the PR, and sends `READY <PR> <head sha>`; you gate and
merge it (`merge-gate.mjs`, role-merge-holder.md), verify two parents, send
`DONE`, and archive the owner by `fleet-archive.mjs` (`.claude/rules/fleet-core.md`),
never the hunter. Spawning stays here by
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
  once before a code push (AGENTS.md rule 3). Syncing follows
  `.claude/rules/fleet-core.md` only; being N commits behind is no reason.
- Per wake, flag runaways before reading PRs from ONE saved `list_sessions` page (`mine: true`, limit 100,
  written to `artifacts/fleet/sessions-<time>.json` and digested by `node tools/ci/fleet-archive.mjs <file> --json`):
  never `get_session` per sibling — each reply is ~10k tokens of another session's JSON, and the 14:40Z ORCH B
  reached 204k context in 9 minutes that way. The page carries `context_usage` and `cost_usd` per session.
  This is the one home of the rule: `get_session` only on yourself (`rate_limit_info`) or, for the seed, on the
  one child it just launched; never on a worker, never per sibling, never a roster sweep.
- A worker is **stalled** when its state has not changed and its branch has
  not moved for ~90 min, or it passed its caps. Ask once, then interrupt and
  relaunch with NEW evidence or a narrower OWNED, never the same prompt.
- Wake sources and timers (bus Monitor, 50–55 min safety net, the account-wide
  FLEET BUS WATCH): `orchestrator.md` §First acts, their one home. Each wake runs
  one pass: ReadNotifications once, `fleet-bus.mjs read --to <letter>` (inbox
  senders `claude:fleet-a-inbox` / `claude:fleet-b-inbox` included),
  `pr-board.mjs`, READY → `merge-gate.mjs`; report changes only.
- Each wake also lists every open PR with no live owner session (Bryce requires
  one per PR); start an owner (role-pr-owner.md) or say why not. `pr-board`
  does not print this yet: read it from the saved `list_sessions` page.
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
