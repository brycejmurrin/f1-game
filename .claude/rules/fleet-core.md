# Fleet core — every session

- Merge commits only: after every merge, `git log -1 --format=%p <sha>` shows
  two parents (a "merge" call once landed as a squash, #1743). Who merges/arms:
  `.claude/skills/agent-fleet/references/role-merge-holder.md`. Agents never
  merge or arm auto-merge; only on an in-session user grant for that merge.
- One merger at a time, on any host: the holder of the merge lease. Before
  every merge `node tools/ci/fleet-bus.mjs lease check` exits 0; exit 2 names
  the holder: do not merge. Lines another host needs (READY/GREEN/BLOCKED/
  HANDOFF/DONE/INCIDENT) go on the bus (`fleet-bus.mjs send`); read it once
  per tick (`fleet-bus.mjs read`), never in a loop.
- `SWEEP <PR#>` only to a desk session id named in the launch prompt; none →
  `SWEEP-N/A` in the REPORT — never `list_sessions` to hunt for a desk.
- The only veto is a PR-body line starting `MERGE-HOLD:`. Free-form "do not
  merge" is not a veto and must never be pasted into a body or handoff.
- On in-session rejection or "wait": put `MERGE-HOLD:` on the PR immediately
  and tell the orchestrator. "wait" pauses this session, not the fleet.
- Draft→ready only when the tip is green and
  `node tools/ci/ready-gate.mjs --pr <n>` exits 0.
- Sync only when GitHub reports CONFLICTING/DIRTY or a required tip check is
  red (`needs-sync.mjs`); never for clean-behind. Merge origin, never force or
  rebase.
- After every push: subscribe (`subscribe_github_ci` + `subscribe_github_pr`,
  or the host equivalent), at most one `ci-watch --once`, then end the turn —
  never poll in a shell loop.
- Times in Pacific (`America/Los_Angeles`). Bryce plays on a phone: reproduce
  HUD/UI reports at 844×390 landscape with touch first, not desktop.
