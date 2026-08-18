---
name: motion-capture
description: Use when the user reports flicker while driving, clipping as I drive, shadows shimmer/crawl/boil, z-fighting, geometry pop-in, texture shimmer, temporal artifacts during motion, or asks to record/compare a driven lap to verify a rendering fix.
---

# Headless motion capture (temporal-artifact verification)

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
rAF-under-headless, ffmpeg, and the near-plane A/B that proved p90 0.21→0.00 →
[references/traps.md](references/traps.md).

## When to reach for something else

- Static look / framing → **playwright-probe** (`shot.mjs`, `apex-capture.mjs`).
- Shader / GL state → **webgl-debug**.
- Frame-time / GC / build spikes → **perf-profile**.

Editing `js/`/`css/` still needs a cache bump (`bump-cache`).
