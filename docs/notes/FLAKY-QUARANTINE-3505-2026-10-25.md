# Flaky quarantine #3505, row 1: garage-livery-churn (2026-10-25)

Fleet B worker B·W1·L1. Scope: row 1 of #3505 only. Fleet D keeps the
menu-baseline and image-grade rows; the split is on the fleet bus at 40497cf.

## Verdict

**Row removed.** The cause was found and fixed on 2026-10-20, about three
hours after the quarantine merged. Every cold llvmpipe run of the exact test
since then has passed on the first try.

## Cause

The failing run was 39415873380 (car 2/4, job 118604624380). Both attempts
failed the same way:

- Before the final edit, no GPU texture was created at any point.
- During the edit burst, the number of live textures dropped by one (37 → 36
  in attempt 1, 55 → 53 in attempt 2).
- The edit after the 2.5 s pause then created exactly one texture.

So one texture was freed and then made again, and the timing depended on the
wall clock. That matches the garage live-atlas trace tick in
`js/garage/scene.js`:

- Every 1.5 s it repainted a 512² canvas, called `createTexture`, and freed the
  old handle.
- On TLX that call reuses a retired texture from the pool when a same-size
  entry is still there. When that entry has already been pruned, the call
  makes a new GPU texture.
- A 2.5 s pause always contains at least one tick, so whether the post-pause
  edit counted a new texture depended on whether the pool entry survived.

The diagnostic logging (name, size and creation stack) landed with the
quarantine (#3204). It has never fired because no failure has happened since.
The texture is identified from the mechanism above, and the unit test below
reproduces it.

| fix | merged (UTC) | what changed | test |
|---|---|---|---|
| #3201 (4eafa778) | 2026-10-20 | stale flap sets are released on the frame after a bust | `tests/unit/car-mesh-crew-cache.test.mjs` |
| #3205 (43007e66) | 2026-10-20 15:16 | the trace tick calls `refillTexture` and re-fills the same texture in place (TLX) | `tests/unit/garage-mesh.test.mjs`: 8 ticks create 0 textures (8 before the fix); `tests/unit/tlx-texture-release.test.mjs` |
| 45d576dd | 2026-10-21 | a paint draft gets its own decal key; no 2048 hi-res atlas is built while a draft is live | `tests/unit/car-draw-decal-budget.test.mjs` |

## Exit criterion: three cold llvmpipe runs with no retry

The row's review clause asks for three cold llvmpipe runs of the exact test
with no retry. While the row was active, a quarantined spec ran on its own
retrying shard (`oversize-garage-livery-churn`, `--retries=1`). In the
live-reporter log a retry shows as `! retry` or `(retry 1)`, and every log
below has neither:

| run | event | sha | job | first-try verdict |
|---|---|---|---|---|
| 39576288897 | nightly | 6c631c57 | 119142707024 | `= run passed (1/1)` |
| 39755074269 | nightly | e8630e9d | 119745801620 | `= run passed (1/1)` |
| 39931115193 | nightly | e64e4259 | 120345863435 | `= run passed (1/1)` |
| 40079703160 | nightly | b86aedbd | 120830588401 | `= run passed (1/1)` |

A scan of the newest 100 `ci.yml` and `pages.yml` runs (10-23 to 10-25) found 19 more
llvmpipe jobs of the exact test, PR and deploy-branch pushes included. All passed on the first try. The
full scan of every run since 2026-10-20 12:00Z is in the PR body.

All of them ran `APEX_GL: llvmpipe` on a fresh GitHub runner.

## After removal

The test blocks again: under `APEX_FAIL_ON_FLAKY=1` a pass that needed a retry
turns the run red. If it recurs, the failure
message lists every texture created after warm-up (name, size, creation
stack). Fix it from that list; do not add the row back without a fresh
failed-run link (AGENTS.md rule 9).
