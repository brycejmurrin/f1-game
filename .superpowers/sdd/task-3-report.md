# Task 3 Report: Inspection, accuracy, and ad-hoc gallery writers

## Scope completed

Implemented the Task 3 output-path migration in the isolated worktree at
`/Users/bmurrin/Documents/game-dev-plugin/f1-game/.worktrees/generated-output-layout`.

Updated writers:

- `tests/inspect/_capture.js`
- `tests/f1-track-accuracy.spec.js`
- `tests/galleries/track-lap-audit.spec.js`
- `tests/galleries/track-trace.spec.js`
- `tests/galleries/all-tracks-buildings.spec.js`

## What changed

### 1. Inspection contact-sheet writer

- Replaced the legacy `tests/ui-screenshots/inspect` root with `galleryPath(...)`
  and `galleryUrl(...)` from `tests/output-paths.js`.
- Removed the old `path` import and now rely on helper-created directories.
- Kept the same frame filenames and sheet filename behavior:
  - per-frame: `<circuit>/<circuit>-<pct>.png`
  - contact sheet: `<circuit>-sheet.png`
- Removed the unsupported `baseURL` option from `page.setContent(...)` so the
  sheet HTML resolves image URLs against the active Playwright origin.

### 2. Accuracy report writer

- Repointed the output root from the legacy local `f1-track-accuracy` directory
  to `galleryDir("f1-track-accuracy")`.
- Preserved all existing image and JSON report filenames.

### 3. Excluded gallery writers

- `track-lap-audit.spec.js`
  - moved suite root to `galleryDir("track-lap-audit")`
  - updated header comments to the real spec path and artifact location
  - removed the misleading `--update-snapshots` note
- `track-trace.spec.js`
  - moved suite root to `galleryDir("track-trace", TRACK)`
  - updated header comments to the real spec path and artifact location
- `all-tracks-buildings.spec.js`
  - moved suite root to `galleryDir("all-tracks-buildings")`
  - updated header comments to the real spec path and artifact location

## Verification performed

Per instruction, I did **not** run Playwright or `npm test` commands for this
task, even though the brief suggested them.

Ran instead:

- `node --check` on all five edited files
- `rg -n 'tests/(ui-screenshots|track-trace|f1-track-accuracy|all-tracks-buildings)|galleries/ui-screenshots' tests --glob '*.js'`
- IDE lint check on all five edited files
- manual diff/self-review of the scoped changes

Results:

- all five `node --check` commands passed
- legacy-path search returned no matches
- IDE lints reported no errors

## Notes / deviations

- The only deviation from the brief was verification method: Playwright-based
  checks were intentionally skipped because the user explicitly instructed to
  stop running tests.
