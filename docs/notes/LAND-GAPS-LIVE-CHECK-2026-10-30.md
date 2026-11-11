# Live check of the landing-gap fixes (#4221), 2026-10-30

Results of exercising `land.yml`'s `edited` trigger, the draft+`land` refusal and the stale-gate sweep on the deploy
branch after #4221 merged (test subject: draft PR #4249; times UTC).

| check | expected | observed |
|---|---|---|
| `land` on a draft | `gate` failure "draft: flip ready first …" and one comment | OK. `gate` failure at 10:14:30 with that description; one bot comment carrying the `<!-- land-draft:<head> -->` marker |
| body edit on a `land` PR | a Land run resolves and re-gates | OK. Run 41039342934 (10:15:00): `resolve` and `post` succeeded; a fresh `gate` status at 10:16:19; no second comment (once per head) |
| title-only edit | resolve skipped, no `gate` write | OK. Run 41039405320 (10:15:27): every job skipped |
| scheduled sweep (`17,47 * * * *`) | a `schedule` Land run | OK, late. Run 41088148169, event `schedule`, created 16:15:05, head 8714fe18; `sweep` succeeded (16:15:08–16:15:15), every other job skipped. It re-gated nothing (see Sweep result). Earlier ticks (09:47, 10:17 and on) produced no run, so GitHub delayed the cron by hours |

The sweep gained a manual handle for this reason: `gh workflow run land.yml --ref claude/f1-game-project-26h3ng -f stale=true`
runs the same `sweep` job (the dispatch is accepted only on the deploy branch). After that PR merges the sweep gets its
live check from the dispatch; the cron then only needs to fire eventually.

## Sweep result

Checked 2026-10-30 (UTC) with `gh api 'repos/brycejmurrin/f1-game/actions/workflows/land.yml/runs?branch=claude/f1-game-project-26h3ng&per_page=100'`
(100 runs: 47 `workflow_dispatch`, 53 `workflow_run`) and `event=schedule` (total_count 1). #4249 merged at 11:49:54.

- **Schedule run:** 41088148169 at 16:15:05, the only one since #4249 merged. Its `sweep` job read the `land` PRs and logged
  #4262 gate is current, #4260 CI still running, #4225 and #3981 no successful CI on their heads. No re-gate was dispatched,
  none was due.
- **Cadence:** one scheduled run in about 4 h against a nominal two per hour, so the cron is delayed under load, as the note
  predicted. The run's creation time (16:15) also precedes the nominal 16:17 tick; the cause is unexplained.
- **Manual handle:** all 47 `workflow_dispatch` runs (20:13–20:45) have `sweep` skipped; they are the per-PR re-gate dispatches,
  not `stale=true`. The `stale=true` dispatch is therefore untested live; the cron run above exercised the same job.
- **Wrong:** nothing found.
