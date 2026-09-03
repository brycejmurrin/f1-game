# Motion capture — temporal-artifact verification (folded from the motion-capture skill)

Static screenshots miss flicker — the artifact is frame-to-frame under motion.
This skill captures a real driven clip headless and scores per-frame flicker.

```sh
node tools/capture/motion-capture.mjs <track> [seconds] [speed] [outdir]
node tools/capture/motion-capture.mjs monaco 4 50
```

**No start-frac CLI** — always `jump(0.05, speed)`. Eau Rouge is ~0.078 on Spa;
look up corners first (`__apex.corners()` / `trackInfo({what:"corners"})`).
Trust **p90** (typical-frame floor). `mean`/`max` are noisy scene-cut spikes.
Output: `scratch/captures/motion-capture/<track>/`.

A/B a rendering change on the same `(track, seconds, speed)` twice per side.
rAF-under-headless, ffmpeg, and the near-plane A/B that proved p90 0.21→0.00 are
below.

## When to reach for something else

- Static look / framing → **playwright-probe** (`shot.mjs`, `apex-capture.mjs`).
- Shader / GL state → **webgl-debug**.
- Frame-time / GC / build spikes → [perf-profile.md](perf-profile.md).

Editing `js/`/`css/` still needs a cache bump (`node tools/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`)).

## Why naive motion capture fails

- **Headless Chromium under SwiftShader freezes `requestAnimationFrame` at 0 fps.**
  The game's `tick()`/`render()` loop never advances on its own, so the car never
  moves and consecutive `page.screenshot()`s of a "driven" lap are identical.
- **`__apex.step()` advances physics but does NOT paint** — it has no `render()`.
- **The fix:** enabling Playwright `recordVideo` makes the compositor screencast
  tick the rAF loop, so the car actually drives and the video contains real
  motion. (CDP `HeadlessExperimental.beginFrame` would be more deterministic but
  needs `enableBeginFrameControl` = "headless-shell only, not on macOS yet" and
  Playwright doesn't expose it — `recordVideo` is the portable route.)
- **Playwright's bundled ffmpeg is stripped:** it can DECODE vp8/vp9 and ENCODE
  png, but has NO png demuxer and NO raw/pgm muxer — so frames are read back by
  decoding the pngs in a second Chromium page, not by ffmpeg.

### Reading the score

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

### A/B a rendering change

```sh
node tools/capture/motion-capture.mjs monaco 4 50      # on your branch → note p90
# revert the change
node tools/capture/motion-capture.mjs monaco 4 50      # baseline → note p90
```

Real result from the near-plane depth fix (0.2 → 0.3): **p90 0.21 → 0.00**
(reproduced twice). The ~15.7 `max` spikes were scene cuts and correctly
unchanged. Run each config 2× — SwiftShader timing means the car drives a
slightly different distance each run.

### Gotchas

- A low `eyeAt` height (~0.12) puts the eye INSIDE the parked car — offset ahead
  or laterally if you free-cam instead of chase.
- The tool auto-picks the bundled Chromium + ffmpeg; on Linux/CI it falls back to
  `/opt/pw-browsers/...`.
