---
name: track-batch-verify
description: Run verify-track.cjs across all 24 circuits in one command and interpret the output — the fast pre-push gate for any js/tracks/*.js or js/tracks.js change. Use when adding a track, editing scenery(), or changing buildRoad/buildProps. Triggers - "verify all tracks", "pre-push check", "did I break any tracks", "batch verify", "check all circuits".
---

# Batch-verify all 24 circuits with verify-track.cjs

`tools/verify-track.cjs` is the headless build checker — it loads `js/tracks.js`
in a Node.js VM, stubs GLX, and runs the full `buildRoad → buildTerrain →
buildProps → buildGate` pipeline.  Any `throw` during the build is a hard failure
that would strand the game on the menu.

## Commands

```sh
# Verify a single track (fast, ~1 s):
node tools/verify-track.cjs monza

# Verify all 24 circuits registered in index.html (batch mode):
node tools/verify-track.cjs --all

# The check-changes skill also calls this automatically:
# run it as part of the pre-push workflow for any js/tracks/* edit
```

`--all` reads track IDs from `index.html` (`js/tracks/{id}.js?v=...` entries),
runs the build for each, and exits non-zero if any fail.  It also checks that
every built track has a `<script>` tag in `index.html` — catching the case where
a new `.js` file exists but was never registered.

## Reading the output

A passing track prints:
```
monza  road:4812v  terrain:2048v  props:6240v  gate:96v  OK  (312 ms)
```

A failing track prints the error and exits 1:
```
monaco  FAILED: ReferenceError: _myHelper is not defined  (scenery line 42)
```

## The 3 most common failures and how to fix them

**1. Bad reference in `scenery(api)`**
```
ReferenceError: someVar is not defined
```
A variable used in the track's `scenery(api)` callback was renamed or removed.
Search `js/tracks/{id}.js` for the variable name and fix the reference.

**2. `addBox` / `addCylinder` with non-finite coordinates**
```
Error: vertex NaN at prop index 37
```
A `def.segs` entry produced a `NaN` coordinate — usually a missing default
in a computed value (e.g. `def.length || undefined` instead of `def.length || 50`).
Add `|| 0` / `|| 1` guards to the offending expression.

**3. Track file not registered in index.html**
```
abu_dhabi  built OK but NOT in index.html — add <script src="js/tracks/abu_dhabi.js?v=N">
```
Add the `<script>` tag and bump the cache version (`bump-cache` skill).

## Pre-push workflow for track edits

```sh
# After editing js/tracks/singapore.js:
node tools/verify-track.cjs singapore          # fast single check
node tools/verify-track.cjs --all              # confirm no regressions on other tracks
npm run test:circuit                            # Playwright barrier + autopilot tests
```

Run `--all` before every push that touches `js/tracks/*.js` or `js/tracks.js`.
It takes ~30 s for all 24 circuits and catches geometry regressions that the
Playwright suite would take minutes to surface.
