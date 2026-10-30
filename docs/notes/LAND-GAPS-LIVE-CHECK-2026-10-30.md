# Live check of the landing-gap fixes (#4221), 2026-10-30

Results of exercising `land.yml`'s `edited` trigger, the draft+`land` refusal and the stale-gate sweep on the deploy
branch after #4221 merged. Filled in as each check runs.

| check | expected | observed |
|---|---|---|
| `land` on a draft | `gate` failure "draft: flip ready first …" and one comment | pending |
| body edit on a `land` PR | a Land run resolves and re-gates | pending |
| title-only edit | a Land run in `land-noise-*`, resolve skipped | pending |
| scheduled sweep | a `schedule` Land run, `sweep` job summary | pending |
