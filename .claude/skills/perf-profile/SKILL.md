---
name: perf-profile
description: Use when the user asks to profile the game loop, find a frame-budget hog, investigate GC jitter/spikes, slow track load/build times, measure physics/render CPU cost, or capture/open a flame chart/.cpuprofile for Apex 26.
---

# Headless CPU profiling via Playwright + CDP

Captures a V8 `.cpuprofile` of the running game loop without opening a browser
manually. The committed tool drives Playwright's `newCDPSession()` V8 profiler and
writes to `scratch/profiles/<track>-<mode>.cpuprofile`.

## Quick capture (committed tool)

```sh
node tools/profile-gameloop.mjs [track] [physics|render]
# examples:
node tools/profile-gameloop.mjs singapore render   # full rAF + WebGL draw path (~10 s)
node tools/profile-gameloop.mjs vegas physics      # synchronous __apex.step() loop (default)
```

- **`physics`** (default): `__apex.step(1/60, 600)` — 10 s of uncapped physics, no
  compositor; best for `updateCar`, AI, light culling JS.
- **`render`**: `recordVideo`-ticked rAF with throttle on — includes WebGL uniform
  upload and draw-call cost on the main thread.

The tool prints a self-time summary to stdout; open the `.cpuprofile` in Chrome
DevTools → **Performance** → **Load profile** for the full flame chart.

### Night / time-of-day gap

`profile-gameloop.mjs` loads the track but **does not call `setTimeOfDay`**. A
night-default circuit (Vegas, Singapore) still builds floodlights, but to profile
a *forced* night session (or to compare day vs night on a day-default track) inject
it before profiling — e.g. a one-off `page.evaluate(() =>
__apex.setTimeOfDay("night"))` after the mesh settle, or fork the tool. Without
that, "night lag" on a day-default track won't reproduce.

### GPU-bound frames

A CPU flame chart cannot see fill-/fragment-bound work. If the chart is mostly
idle but frames miss budget, use `__apex.gpuTimer(true)` then read
`__apex.gpuTimer().ms` (see DEBUG-HOOKS.md): GPU ms ≈ frame budget ⇒ shader/fill
work, not JS. Chrome/Android only; `-1` under SwiftShader/CI.

## Reading the flame chart

Open `scratch/profiles/<track>-<mode>.cpuprofile` in Chrome DevTools → **Performance** tab →
**Load profile** button.  Key functions to look for:

| Function | What it means |
|---|---|
| `updateCar` | Per-car physics tick — hot if AI count is high |
| `buildTrackLights` | Light culling each frame — should be < 0.5 ms |
| `begin` / `gl.uniform*` | Shader uniform upload — flag if > 2 ms |
| `(garbage collector)` | GC jitter — look for `Minor GC` during night races |
| `buildRoad` / `buildProps` | Track mesh build — runs once on load, not per-frame |

## Interpreting GC spikes on night tracks

If `Minor GC` appears frequently during a Vegas/Singapore session, the cause is
almost certainly per-frame `new Float32Array(...)` in the light-upload path.
Check `GLX.hdrMode()` returns `true` (RGBA16F FBO active) — RGBA8 fallback does
additional intermediate copies.

## Legacy inline harness

The old copy-paste Monza-only script lived here before `tools/profile-gameloop.mjs`
landed. Prefer the committed tool above; only hand-roll a harness when you need
custom staging (e.g. `setTimeOfDay("night")` before `Profiler.start`, a specific
car count, or career state). Pattern: free port → static server → Chromium +
SwiftShader → CDP `Profiler.enable/start/stop` → write JSON to
`scratch/profiles/`.
