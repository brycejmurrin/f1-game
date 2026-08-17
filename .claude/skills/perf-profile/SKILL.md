---
name: perf-profile
description: Use when the user asks to profile the game loop, find a frame-budget hog, investigate GC jitter/spikes, slow track load/build times, measure physics/render CPU cost, or capture/open a flame chart/.cpuprofile for Apex 26.
---

# Headless CPU profiling via Playwright + CDP

Captures a V8 `.cpuprofile` of the running game loop. Writes
`scratch/profiles/<track>-<mode>.cpuprofile`.

```sh
node tools/profile-gameloop.mjs [track] [physics|render]
node tools/profile-gameloop.mjs singapore render   # rAF + WebGL draw (~10 s)
node tools/profile-gameloop.mjs vegas physics      # __apex.step() loop (default)
```

- **`physics`** (default): `__apex.step(1/60, 600)` — uncapped physics, no compositor.
- **`render`**: `recordVideo`-ticked rAF with throttle on — includes WebGL upload.

The tool does **not** call `setTimeOfDay`. Night-default circuits still build
floodlights; forced night on a day track needs a one-off `page.evaluate`.
CPU charts cannot see fill-bound work — `__apex.gpuTimer(true)` then
`__apex.gpuTimer().ms` (Chrome/Android; `-1` under SwiftShader).

Open the `.cpuprofile` in Chrome DevTools → Performance → Load profile.
Flame-chart symbols, GC folklore (light-upload is pooled — do not re-blame it),
and cost-center order → [references/flame.md](references/flame.md).
