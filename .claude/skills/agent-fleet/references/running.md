# Running the fleet (orchestrator, after launch)

Launching is `orchestrator.md`; this is every wake after it.

## Roles and hand-offs (2026-10-17)

Launch by role (SKILL.md §roles): a hunter finds and fixes, then sends
`NEW-PR <#> <branch> <sha> <summary>` and drops the PR; you start one PR owner
per PR (role-pr-owner.md) within minutes, quoting the user's grants; the owner
replies `ARMED`, drives the PR, and sends `READY <PR> <head sha>`; you gate and
merge it (`merge-gate.mjs`, role-merge-holder.md), verify two parents, send
`DONE`, and archive the owner by the archive rule (`node tools/ci/fleet-archive.mjs
<saved list_sessions page>`: agent-created, role-tagged, idle an hour, PR merged
or closed; never a session Bryce opened), never the hunter. Spawning stays here by
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
- **Bus routine (Bryce 2026-10-22: "set routine to check the bus every few mins").**
  From the `ORCH <letter> LIVE` line until no fleet work is live, keep two timers,
  armed as your first acts (orchestrator.md §First acts):
  1. a TICK every ~3 min: one `send_later` at a time whose message runs the wake
     pass (ReadNotifications, `fleet-bus.mjs read --to <letter>`, `pr-board.mjs`,
     READY → `merge-gate.mjs`) and re-arms itself; report changes only;
  2. a recurring SAFETY NET, `create_trigger` `cron_expression: "0 * * * *"`,
     `initiation: human_request`, bound to this session: it re-arms the tick
     chain if it broke, then runs the same pass. Recurring schedules under 1 h
     are refused (`*/5` measured 2026-10-22: "the minimum interval is 1 hour"),
     so the few-minute cadence is the `send_later` chain, not the cron.
  Cursor hosts use `subscribe_timer` for both. At hand-off, `delete_trigger` your
  own safety net (it fires into your session only) and let the successor arm its own.
  3. a FLEET BUS WATCH that survives the orchestrator (Bryce 2026-10-22: "setup
     up a webhook or routine to track the bus"). This is one account-wide
     `create_trigger` with `create_new_session_on_fire: true`, hourly, Sonnet (OrchA 23 created `trig_01JY5wYatqkrVwPXPsMD1ryZ`, "Fleet bus watch (A+D liveness)").
     Each fire gets a fresh, short-lived session that reads the bus once and
     works out each fleet orchestrator's last line, from `read --last N --json`
     filtered by `from`. Do not use `who`'s age: `who` dates the `ORCH LIVE` line,
     not the latest activity. An orchestrator silent for 30 min or more is
     ABSENT (the adaptive A+D plan, #3548). The watch then posts a bus INCIDENT,
     wakes the other fleet (webhook to D, `send_message` to A's live session),
     and ends. It never merges, pushes or edits a PR. An orchestrator keeps it
     across hand-offs: list it with `list_triggers` and never create a second.
  The webhook wakes D only. A's wake pass also reads DAD's direct messages
  through ReadNotifications (orchestrator.md §Talking to other fleets).
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
