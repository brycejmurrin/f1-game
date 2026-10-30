# Live check of the landing-gap fixes (#4221), 2026-10-30

Results of exercising `land.yml`'s `edited` trigger, the draft+`land` refusal and the stale-gate sweep on the deploy
branch after #4221 merged (test subject: draft PR #4249; times UTC).

| check | expected | observed |
|---|---|---|
| `land` on a draft | `gate` failure "draft: flip ready first …" and one comment | OK. `gate` failure at 10:14:30 with that description; one bot comment carrying the `<!-- land-draft:<head> -->` marker |
| body edit on a `land` PR | a Land run resolves and re-gates | OK. Run 41039342934 (10:15:00): `resolve` and `post` succeeded; a fresh `gate` status at 10:16:19; no second comment (once per head) |
| title-only edit | resolve skipped, no `gate` write | OK. Run 41039405320 (10:15:27): every job skipped |
| scheduled sweep (`17,47 * * * *`) | a `schedule` Land run | NOT YET OBSERVED. No schedule run of `land.yml` by 10:30 (ticks at 09:47, 10:17 missed). This repo's other cron workflows fire hours apart (Pages 13:44, 22:58, 06:27; Flake tally 5–6 h), so GitHub is delaying scheduled runs under load |

The sweep gained a manual handle for this reason: `gh workflow run land.yml --ref claude/f1-game-project-26h3ng -f stale=true`
runs the same `sweep` job (the dispatch is accepted only on the deploy branch). After that PR merges the sweep gets its
live check from the dispatch; the cron then only needs to fire eventually.
