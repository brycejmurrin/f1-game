# Land mechanics — what happens after `land`

Read when you need the detail behind SKILL.md §Land (the steps themselves are there).

- `land.yml` runs `merge-gate.mjs --check` as the commit status named `gate` and arms auto-merge pinned to your head;
  the ruleset merges when `gate` is green. Its ci row requires the newest check named exactly `CI` green on your head.
- Adding `land` while CI still runs is fine: `gate` shows in progress ("waiting") and re-evaluates when CI ends. Going
  back to draft or removing `land` turns `gate` red.
- `land` on a draft does nothing until the flip (`gate` reads "draft: flip ready first", one comment per head).
  Removing and re-adding `land` re-gates a stale `gate` by hand; `land.yml` also re-gates on a PR-body edit and on a schedule.
- Route: `node tools/ci/ship-pr.mjs --pr <n>` (runs ready-gate; prints the next two calls), the GitHub MCP
  `update_pull_request` with `draft:false`, then `gh api -X POST repos/<o>/<r>/issues/<n>/labels -f 'labels[]=land'`.
- Arming: one PR per run, skipped when the deploy tip moved since its `gate` evaluation; the `retry` job dispatches a
  re-gate (at most 3 per head). An API or git error leaves `gate` in progress ("error, will retry"), never red. `gate`
  turns green only while the deploy tip is the one it measured. `land.yml` never merges the tip into a PR branch.
- Gate rows that read Bryce's own click (provenance, not a relay): `hold` (only the actor who set it, or Bryce,
  lifts it), `config` (`config-ok` on a hooks/settings PR).
- `LAND_TOKEN` and the ruleset: [`vendors.md`](vendors.md).
