# Diagnosis and prerequisites

## Anchor owners (grep these first)
- `js/race/real-replay.js` — replay `follow` / `setLocked` / seek state (the followed car id).
- `js/ui/watch-transport.js` — FOLLOWED DRIVER select, FOLLOW LOCK, director chip.
- `js/camera/director.js`, `js/camera/replay-buf.js` — TV director cuts, replay buffer.
- `js/game.js` `cameraDampingState()` (`__apex.cameraState()`): eye, target, fov,
  `previousAnchor`/`nextAnchor` (car-frame damping), `renderFrame`, `simulationTime`.

## Likely causes of "old car after a seek"
- FOLLOW LOCK is on (`setLocked(true)`): `reposition()` in `real-replay.js` skips the auto re-follow (`setFollow`) while `picture.locked`/`manual`.
- The follow id was not re-pointed on seek (`setFollow` not called for the new car).

## Fields to diff per phase (probe JSON on stdout)
`samples[].phase`, `samples[].frame.camera`, `samples[].eyeDeltaMetres` (jump between
consecutive samples), `samples[].replay`, `preferences.restored`, `exit.replay.active`,
top-level `ok`. A stale anchor shows as a large `eyeDeltaMetres` at seek/follow/reentry.

## Non-Baku circuit
`--fixture default` requires `--track baku`. For another circuit pass `--fixture FILE`
(compiled `script` or raw OpenF1 data; `--plan` validates it offline) with matching `--track`.

## ffmpeg (only if step 3 fails on missing ffmpeg-<revision>)
```sh
apex_browser_cache="$(node tools/lib/chromium-path.mjs --cache-path)" &&
  PLAYWRIGHT_BROWSERS_PATH="$apex_browser_cache" npx playwright install ffmpeg
```
Use that same `PLAYWRIGHT_BROWSERS_PATH` for the live run.
