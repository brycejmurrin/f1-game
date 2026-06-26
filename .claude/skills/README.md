# Apex 26 developer skills

Claude Code skills scoped to this repo's real workflows. Each is a `SKILL.md`
(invoked automatically when its description matches, or via `/<name>`), grounded
in the `__apex` debug API, `tools/verify-track.cjs`, and the `npm run test:*`
groups.

| Skill | Use it when |
|---|---|
| **survey-track** | Making a circuit accurate end-to-end: survey vs real-world reference → diagnose geometry (floating props, channels, terrain-over-road) → edit → verify → ship. Orchestrates the skills below + a lateral ground-profile probe. |
| **bump-cache** | You edited any `js/*.js` or `css/*.css` — increment the `?v=N` cache-bust in `index.html` before committing. |
| **new-track** | Adding a circuit or editing a track's geometry/metadata in `js/tracks/`. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains). |
| **tune-physics** | A/B testing or tuning the driving physics in `js/game.js` via the headless `obs/act/reset` loop. |
| **physics-ab-test** | Side-by-side A/B comparison of two physics configs using the headless loop — run both variants, diff the obs output, screenshot the result. |
| **inspect-scene** | Capturing deterministic screenshots of a track/car/UI to verify a visual change (`shot.mjs` helper). |
| **check-changes** | Pre-push validation — pick the right `test:<group>`, run `verify-track`, confirm the cache bump. |
| **debug-cameras** | The 12 camera modes + free debug-camera framing hooks (`view/eyeAt/orbit/cinematic/...`). |
| **debug-tracks** | Track geometry/surface/barrier query hooks + the parallel multi-track sweep. |
| **debug-state** | Live race/physics/lighting telemetry hooks + the headless `act/obs/reset` loop. |
| **playwright-probe** | Drive the game headless at scale — parallel servers + screenshot validation; `tools/apex-eval.mjs` & `tools/apex-capture.mjs`. |
| **audio-debug** | Inspect and tune the WebAudio synth engine (`js/audio.js`) — engine pitch curve, sfx triggers, music layers, mute/volume state. |
| **perf-profile** | Capture a headless V8 CPU flame chart of the game loop via Playwright CDP — diagnose frame-time spikes, GC jitter, or slow track-build times. |
| **lighting-tuner** | Tune and validate per-time-of-day atmosphere settings in `applyRaceSettings` using live `lightState()` probes and orbit screenshots. |
| **track-batch-verify** | Run `verify-track` across all 24 circuits in parallel — catch any track that would strand the game on the menu before pushing. |
| **webgl-debug** | Diagnose WebGL2/GLX renderer issues: UBO binding, std140 padding, shadow acne, bloom, shader compile errors, `GL_INVALID_OPERATION`. |

The debug-* skills are grounded in **verified live return shapes** (probed via
`tools/apex-eval.mjs` against the running game) and pair with screenshot capture
(`tools/apex-capture.mjs`) so changes are validated visually, not just asserted.

Design principles these encode (from `CLAUDE.md`):
- **No build step** — pure IIFE modules; always bump `?v=N` on asset edits.
- **Debug-hooks first** — assert behaviour/geometry via `__apex`, not brittle magnitudes.
- **Headless verify-track** is the fast pre-push guard for any `js/tracks/*` change.
