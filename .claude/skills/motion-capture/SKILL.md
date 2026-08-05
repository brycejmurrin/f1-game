---
name: motion-capture
description: Use when the user reports flicker while driving, clipping as I drive, shadows shimmer/crawl/boil, z-fighting, geometry pop-in, texture shimmer, temporal artifacts during motion, or asks to record/compare a driven lap to verify a rendering fix.
---

# Headless motion capture (temporal-artifact verification)

Static screenshots are useless for "flicker while driving" — the artifact is
temporal (z-fighting, shadow boil, geometry pop, texture crawl appear only
frame-to-frame under motion). This skill captures a REAL driven clip headless and
scores per-frame flicker, so you can prove a rendering fix works instead of
guessing.

## The hard part (why naive capture fails)

- **Headless Chromium under SwiftShader freezes `requestAnimationFrame` at 0 fps.**
  The game's `tick()`/`render()` loop never advances on its own, so the car never
  moves and consecutive `page.screenshot()`s of a "driven" lap are *identical*.
- **`__apex.step()` advances physics but does NOT paint** — it has no `render()`.
- **The fix:** enabling Playwright `recordVideo` makes the compositor screencast
  TICK the rAF loop, so the car actually drives and the video contains real
  motion. (CDP `HeadlessExperimental.beginFrame` would be more deterministic but
  needs `enableBeginFrameControl` = "headless-shell only, not on macOS yet" and
  Playwright doesn't expose it — `recordVideo` is the portable route.)
- **Playwright's bundled ffmpeg is stripped:** it can DECODE vp8/vp9 and ENCODE
  png, but has NO png demuxer and NO raw/pgm muxer — so frames are read back by
  decoding the pngs in a second Chromium page, not by ffmpeg.

## The tool

```sh
node tools/motion-capture.mjs <track> [seconds] [speed] [outdir]
node tools/motion-capture.mjs monaco 4 50
node tools/motion-capture.mjs spa 4 70   # still starts at jump(0.05) — see below
```

**No start-frac CLI** — the tool always `jump(0.05, speed)`. To capture Eau Rouge
(~frac **0.078** on Spa) you must fork the tool or accept the limitation. Look up
the fraction first via `__apex.corners()`, `__apex.trackInfo({what:"corners"})`,
or `js/track/markings.js` before choosing a staging point.

It records a throttle-held chase-cam clip, extracts frames, and prints:

```
=== monaco motion-capture: 4s @ 50 m/s ===
  282 video frames, 156 driving-window frames; car s advanced to 174 m
  flicker (hard-flip %/frame):  mean 0.10   p90 0.00   max 15.66
```

- **`p90` is the metric to trust** — the typical-frame flicker floor. It is
  stable run-to-run. A clean scene sits near 0; per-frame z-fight/acne speckle
  pushes it up.
- **`mean` and `max` are noisy** — dominated by occasional big scene-change
  frames (a wall/building entering view) and by how far the car happened to drive
  that run. Do NOT A/B on these.
- Frames + the `.webm` are written to `scratch/captures/motion-capture/<track>/` for eyeballing.

## A/B a rendering change (the real use)

Prove a fix reduces flicker, don't assume it:

```sh
node tools/motion-capture.mjs monaco 4 50      # on your branch → note p90
# revert the change (e.g. git stash the glx/game edit, or flip the constant back)
node tools/motion-capture.mjs monaco 4 50      # baseline → note p90
```

Real result from the near-plane depth fix (0.2 → 0.3): **p90 0.21 → 0.00**
(reproduced twice), confirming the change removes the low-level per-frame speckle
that was present on most driving frames. The ~15.7 `max` spikes were scene cuts
and correctly unchanged.

Run each config 2× — SwiftShader timing means the car drives a slightly different
distance each run, so a single run's `mean` can mislead; the `p90` should repeat.

## When to reach for something else

- **Static look / framing / "does this render right"** → `playwright-probe`
  (`shot.mjs`, `apex-capture.mjs`) — deterministic single frames.
- **Shader compile errors / uniform upload / WebGL state** → `webgl-debug`.
- **Frame-time / GC / build-time spikes** → `perf-profile` (CPU flame chart).

## Gotchas

- A low `eyeAt` height (~0.12) puts the eye INSIDE the parked car — offset ahead
  or laterally if you free-cam instead of chase.
- The tool auto-picks the bundled Chromium + ffmpeg; on Linux/CI it falls back to
  `/opt/pw-browsers/...`.
- Editing `js/*`/`css/*` still needs a `?v=N` cache bump (see bump-cache).
