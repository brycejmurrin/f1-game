---
name: check-changes
description: Pre-commit/pre-push validation for Apex 26 — pick the right npm test:<group> for the files you touched, run the headless verify-track guard for any track edit, and confirm the cache-busting version was bumped. Use before committing or pushing, when asked "did I break anything?", "run the right tests", "validate my changes", or "ready to push?".
---

# Validate changes before committing/pushing

The suite is large (100+ specs, ~10+ min full). Don't run everything for every
change — map the files you touched to the **narrowest** group that covers them,
then add the universal guards. Inspect the diff first:

```sh
git status --short && git diff --stat
```

## File → test group map

| You changed… | Run |
|---|---|
| `js/tracks/<id>.js` (geometry/metadata) | `node tools/verify-track.cjs <id>` → `npm run test:circuit` → `npm run test:barriers` |
| a track's `scenery(...)` | `node tools/verify-track.cjs <id>` → (full suite's `terrain-over-road.spec.js` for terrain) |
| `js/tracks.js` (engine) | `node tools/verify-track.cjs <a few ids>` → `npm run test:circuit` |
| `js/game.js` physics/AI | `npm run test:physics` + `npm run test:behaviour` (+ `test:steering` if steering) |
| `js/game.js` `__apex` API | `npm run test:api` (dev-tools + headless + obs/act edge + new-hooks) |
| `js/parts.js` | `npm run test:parts` |
| `js/input.js` / steering modes | `npm run test:steering` |
| `js/glx.js` / lighting / `css/` / UI DOM | `npm run test:ui` (slow) and/or `npm run test:visual` |
| game modes (season / time-trial) | `npm run test:modes` |
| broad / unsure | `npm run test:fast` (smoke + api + collision + parts, ~3 min) |

## Universal guards (always, before push)

1. **Build guard for any track touched** — must print `OK <id>: ...`:
   ```sh
   node tools/verify-track.cjs <id>
   ```
   A throw here means the game would strand on the menu. Non-negotiable.
2. **Cache version bumped?** If you changed any `js/*.js` or `css/*.css`, the
   `?v=N` in `index.html` must be incremented (use the `bump-cache` skill):
   ```sh
   grep -o '?v=[0-9]\+' index.html | sort -u   # must be exactly ONE line
   ```
   Forgetting this ships a change users never see (stale CDN/browser cache).
3. **Smoke** if you touched load order, `index.html`, or a core module:
   ```sh
   npm run test:smoke
   ```

## Reading failures (house rule)

When a spec fails, first decide **stale expectation vs real regression**: read the
actual `__apex` hook values the test asserts on (`physState()`, `obs()`,
`wallStats()`, `groundY()`) and check whether the assertion still matches the
intended design. Magnitude-threshold specs and the legacy `blank-scan/*` /
`visual-regression-*` heuristics drift; geometry/behaviour hooks are ground truth.
Don't "fix" code to satisfy a threshold that itself went stale — fix the threshold,
or confirm the behaviour is genuinely wrong first.

## Push

Only push to the active development branch; never to `main` without review. Bump,
verify, test, then commit + `git push -u origin <branch>`.
