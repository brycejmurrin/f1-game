# Apex 26 developer skills

Claude Code skills scoped to this repo's real workflows. Each is a `SKILL.md`
(invoked automatically when its description matches, or via `/<name>`), grounded
in the `__apex` debug API, `tools/verify-track.cjs`, and the `npm run test:*`
groups.

| Skill | Use it when |
|---|---|
| **bump-cache** | You edited any `js/*.js` or `css/*.css` — increment the `?v=N` cache-bust in `index.html` before committing. |
| **new-track** | Adding a circuit or editing a track's geometry/metadata in `js/tracks/`. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains). |
| **tune-physics** | A/B testing or tuning the driving physics in `js/game.js` via the headless `obs/act/reset` loop. |
| **inspect-scene** | Capturing deterministic screenshots of a track/car/UI to verify a visual change (`shot.mjs` helper). |
| **check-changes** | Pre-push validation — pick the right `test:<group>`, run `verify-track`, confirm the cache bump. |

Design principles these encode (from `CLAUDE.md`):
- **No build step** — pure IIFE modules; always bump `?v=N` on asset edits.
- **Debug-hooks first** — assert behaviour/geometry via `__apex`, not brittle magnitudes.
- **Headless verify-track** is the fast pre-push guard for any `js/tracks/*` change.
