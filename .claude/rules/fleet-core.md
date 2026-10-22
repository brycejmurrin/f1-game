# Fleet core — every session

- Merge commits only: after every merge, `git log -1 --format=%p <sha>` shows
  two parents (a "merge" call once landed as a squash, #1743). Standing
  authority is AGENTS.md §Concurrent PRs: an orchestrator merges its own
  fleet's PRs when `node tools/ci/merge-gate.mjs --pr <n>` exits 0 (the hook
  requires that receipt, pinned to the gated head). Nobody re-asks it at a
  hand-off; a `.claude/**` edit or a lifted hold is typed in the acting session.
- Orchestrators merge in parallel, each its own PRs; no lease gates a merge.
  A game PR takes the bus `GAME-SLOT` first and waits for green Pages on the
  last game merge; non-game PRs batch. `DONE` after each merge; READY, GREEN,
  BLOCKED, HANDOFF and INCIDENT go on the bus (`fleet-bus.mjs send`); read it
  once per tick (orchestrator: ~3 min, running.md §Bus routine), never in a loop.
- READY goes to your own fleet's orchestrator; no Merge Desk exists unless
  Bryce designates one. Archive by rule (`node tools/ci/fleet-archive.mjs <saved list_sessions page>`):
  agent-created, role-tagged, idle an hour, PR merged or closed; never a
  session Bryce opened, an orchestrator or a watcher.
- The only veto is a PR-body line starting `MERGE-HOLD:`. Free-form "do not
  merge" is not a veto and must never be pasted into a body or handoff.
- On in-session rejection or "wait": put `MERGE-HOLD:` on the PR immediately
  and tell the orchestrator. "wait" pauses this session, not the fleet.
- Draft→ready only when the tip is green and
  `node tools/ci/ready-gate.mjs --pr <n>` exits 0.
- Sync only when GitHub reports CONFLICTING/DIRTY or a required tip check is
  red (`needs-sync.mjs`); never for clean-behind. Merge origin, never force or
  rebase.
- After every push: subscribe (host tool), at most one `ci-watch --once`, then
  end the turn — never poll in a shell loop.
- Times in Pacific (`America/Los_Angeles`). Bryce plays on a phone: reproduce
  HUD/UI reports at 844×390 landscape with touch first, not desktop.
