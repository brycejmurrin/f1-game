# Flaky quarantine #3505, row 1 exit: garage-livery-churn (2026-10-27)

Fleet B worker B·W1·L1. Follows `FLAKY-QUARANTINE-3505-2026-10-25.md`, which
named the third cause and set the exit.

## The fix (already on the deploy branch)

- Mechanism: on every paint edit `js/garage/scene.js` freed and re-created
  the bay dress (1024²) and live (512²) atlases. On TLX the free retired the
  handle into `_texPool`. A handle retired before its first draw (two
  rebuilds with no frame between them) came back with no GPU texture, so
  three made one on the next draw. That is the two textures in run
  39876864967.
- Fix: `reuploadTex` (`js/garage/scene.js:1077`) refills the live handle in
  place with `_gfx.refillTexture` when the size matches. It falls back to
  free and create only on a backend without refill. Both `uploadLive` and the
  dress block in `rebuild` go through it.
- Landed in ef69ec44 (PR #3797), carried by mega train W3 (649361d7) and
  merged to the deploy branch in d50af27a (#3888, 2026-10-27 01:28Z).
- Regression assertion: `tests/unit/garage-mesh.test.mjs` (the test added in
  ef69ec44, around line 482) and `tests/unit/tlx-texture-release.test.mjs`
  (around line 315, refill in place).

No new source change was needed in this lane. `js/render/three/**` was not
touched.

## Exit evidence

The row's own `review` clause says to remove it once the exact test passes
without retry on three cold llvmpipe car runs after the fix. This PR removes
the row first, so each run below is a blocking run of the spec:

| # | run | head | verdict |
|---|---|---|---|
| 1 | [40434845441](https://github.com/brycejmurrin/f1-game/actions/runs/40434845441) | ae9895b5 | `= group passed` 4/4 shards; spec `+ pass` first try |
| 2 | [40546559179](https://github.com/brycejmurrin/f1-game/actions/runs/40546559179) | ae9895b5 | `= group passed (4/4 shards done, 0 failed)` |
| 3 | [40548339428](https://github.com/brycejmurrin/f1-game/actions/runs/40548339428) | ae9895b5 | `= group passed (4/4 shards done, 0 failed)` |

A run counts only if its log has no `! retry` line for the spec and ends in
`= run passed`.
Every shard ran with `APEX_FAIL_ON_FLAKY=1`, so a pass that needed a retry
would have failed the shard. Runs 40434826142, 40434835826 and 40546536484
show `cancelled`: `browser-group.yml` cancels an in-progress run of the same
branch and group (`cancel-in-progress`), so dispatches overlapped. They were
superseded, not red. Dispatch exit runs one at a time.

## Left as is

The `garage-livery-pick-cost` row in `tests/data/flaky-quarantine.json`
still says "as in the garage-livery-churn row" in its review text. That row
is outside this lane, so it was not edited.
