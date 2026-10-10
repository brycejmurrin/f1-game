# Screenshot / Playwright tool speed (2026-10-10)

Research + landed knobs for making Chromium / Playwright / screenshot tools
faster without thrashing SwiftShader. External sources cited in the session;
repo measurements stay in `CI-RENDERING-PERFORMANCE.md`.

## What already worked

- CI `APEX_GL=llvmpipe` (~8–12× vs SwiftShader) via `browser-group.yml` /
  `remote-group.mjs`
- Worker caps (1 local on ≤4 cores; render-heavy stays low)
- `apex-capture`: N Chromium *processes* (tabs share one GPU process)
- `garage-angles`: one boot, many angles
- Soft-present / `#game-soft` instead of hung `page.screenshot`
- Cached Playwright Chromium action (avoids ~25 s re-download per job)

## Landed this pass

| Change | Why |
|---|---|
| `tools/lib/browser-workers.mjs` | One place for GL-aware worker defaults |
| `apex-capture` uses `defaultCaptureWorkers` | Higher pool on `APEX_GL=llvmpipe` (cap 4) |
| `remote-group` / `browser-group` plan emits `workers=` | Empty input → 1 for RENDER_SPECS groups, 2 for headless-ish on llvmpipe |
| `shot.mjs --batch` / `--jpeg` / `--raster` | One Chromium; JPEG for review; character raster skips pixels |
| Unit tests in tooling-fast | `browser-workers`, `shot-jobs`, updated `remote-group` |

## Docker (deliberately not)

Playwright’s CI docs recommend `mcr.microsoft.com/playwright:v…-noble`. This
repo already caches Chromium keyed on `package-lock.json` + runner image
(`.github/actions/playwright-chromium`). On Linux, restore time is comparable
to download ([Playwright CI — Caching browsers](https://playwright.dev/docs/ci#caching-browsers)),
and llvmpipe still needs Mesa + Xvfb on the **host** (`mesa-xvfb` composite).
Putting shards in the Playwright container would re-solve apt/Xvfb/DISPLAY
inside the image without removing the Mesa step — net win unproven. Revisit
only if cache-miss rate or install flakes dominate wall clock.

## Operator cheatsheet

```sh
# Many frames, one boot (same track grouped automatically):
node tools/shot/shot.mjs --batch jobs.json
# Human-review JPEGs:
node tools/shot/shot.mjs monza 0.1 orbit out.jpg
# No pixels — __apex.render character raster only:
node tools/shot/shot.mjs monza 0.1 --raster
# Headless-ish group on CI llvmpipe (plan defaults workers=2):
node tools/ci/remote-group.mjs physics-core
# Force override:
node tools/ci/remote-group.mjs ui --workers 1
```

## Sources

- [Playwright CI](https://playwright.dev/docs/ci) — workers, sharding, Docker, `--only-changed`
- [Playwright test sharding](https://playwright.dev/docs/test-sharding)
- [Optimize Playwright workers (TestDino)](https://testdino.com/blog/optimize-playwright-workers)
- [Headless vs headed / headless-shell (Currents, 2026-02)](https://currents.dev/posts/when-tests-should-run-headless-vs-headed-in-playwright)
- [Playwright #33566](https://github.com/microsoft/playwright/issues/33566) — chromium-headless-shell
- In-repo: `docs/notes/CI-RENDERING-PERFORMANCE.md`, `docs/notes/TESTING-FIELD-NOTES.md` (2026-09-30 workers=4 timeout)
