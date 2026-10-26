# Flaky quarantine #3505, row 1: garage-livery-churn (2026-10-25)

Fleet B worker B·W1·L1. Scope: row 1 of #3505 only. Fleet D keeps the
menu-baseline and image-grade rows; the split is on the fleet bus at 40497cf.

## Verdict

**The row is re-dated to 2026-11-10, not removed.**

- The texture-creation log named a third leaking texture source in run
  39876864967 on 2026-10-23. That failure came after both earlier fixes, and
  no fix for it has landed.
- Since then there have been 37 cold llvmpipe first-try passes and no failure.
  That is not a fix: the failure rate before was about 1 in 38 jobs, so 37
  passes is what you would expect anyway.
- Removing the row would put that failure rate back into required CI.

## Three causes, one after another

Each failure happened on the edit after the spec's 2.5 s pause. The
texture-creation log (#3204) names every texture made after the warm-up.

| run (job) | when (UTC) | textures created | source | status |
|---|---|---|---|---|
| 39415873380 (118604624380) | 10-20 11:36 | 1 (logged by count only) | live-atlas trace tick (`js/garage/scene.js`): it freed and re-created its 512² texture every 1.5 s | fixed by #3205 (43007e66, `refillTexture`), 10-20 15:16 |
| 39501456087 (118900056868) | 10-20 21:36 | 1 × 1024×1280, both attempts | the player decal-atlas preview (`js/car/car-draw.js`) | 45d576dd (10-21): a paint draft gets its own decal key; no hi-res atlas while a draft is live |
| 39876864967 (120164712044 and re-run 120169556802) | 10-23 00:16 | 1024² + 512², both attempts | the garage bay **dress** atlas (`scene-dress.js`, `DRESS = 1024`) and **live** atlas (`scene-live.js`, `LIVE = 512`) | **open** |

For the third source, three created both textures on first draw
(`Rb._createBindings → Gb.updateTexture`, in `_renderTransparents`). Every
paint edit makes `scene.js` call `freeTexture` and then `createTexture` for
both atlases (`uploadLive` and the dress block in `rebuild`).

On TLX, the free retires the texture into `_texPool` (up to 4 entries, aged
out after 10 s), and the create takes a same-size entry back. That should
mean no new GPU texture. The miss means the reused `THREE.Texture` still had
no GPU texture.

**Hypothesis, not measured:** a texture that was retired before three ever
uploaded it is still `isDefaultTexture` when it is taken back. Two rebuilds
in a row with no draw between them would cause that, and the first edit after
a pause might do it. Three would then allocate on the next draw.

The fix belongs in `js/garage/scene.js` or in the TLX pool. Both are outside
this lane: `js/garage/**` is forbidden here, and a `tlx.js` change needs a
claim and the gpu-census gate. The fix is handed to Fleet B's orchestrator.

## Scan: every run since the quarantine

Method:

- Read every non-cancelled `ci.yml` and `pages.yml` run created from
  2026-10-20 12:00Z to 2026-10-25 (1,080 runs).
- The pages were fetched one by one, because the proxy refuses `--paginate`
  link URLs.
- Kept every job whose name contains `churn`.
- In each job's log, read the live-reporter lines: `! retry` or `x FAIL` means
  a retry or a failure, and `= run …` gives the verdict.

Results:

- 107 jobs ran the exact test.
- One run's job list returned HTTP 502 every time: 39841058813 (`a8ec4735`,
  pull_request). It is not counted.
- Every job counted ran with `APEX_GL: llvmpipe` on a fresh runner.
- Failures in both attempts: 3 jobs, in the two failing runs listed above,
  10-20 21:36 and 10-23 00:16.
- Passes that needed a retry: 0. Each failing job failed both attempts.
- After 10-23 00:16Z: 37 first-try passes and 0 failures (18 pull_request,
  16 push, 2 nightly, 1 dispatch).

Nightly first-try passes:

| run | sha | job | first-try verdict |
|---|---|---|---|
| 39576288897 | 6c631c57 | 119142707024 | `= run passed (1/1)` |
| 39755074269 | e8630e9d | 119745801620 | `= run passed (1/1)` |
| 39931115193 | e64e4259 | 120345863435 | `= run passed (1/1)` |
| 40079703160 | b86aedbd | 120830588401 | `= run passed (1/1)` |

## Exit for the renewed row

1. Fix the dress/live atlas pool miss.
2. A unit test should fail before the fix: free and re-create a texture that
   was never drawn, then draw it, and expect `texMade` to stay flat.
3. Remove the row after three cold llvmpipe car runs pass without retry on a
   tree that contains the fix.

Don't extend the row again without a fresh failed-run link (AGENTS.md rule 9).
