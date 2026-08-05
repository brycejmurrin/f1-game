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

The light-upload path was a known GC source but is **fixed**: `js/render/glx.js`
allocates its per-lamp uniform arrays (`_luPos`, `_luCol`, `_luRad`, `_luDir`,
`_luCone`, `_luBleed`) **once at module scope** and writes into them each frame,
and `js/game/lighting.js`'s per-frame selection buffers (`_tlSel`,
`_lightCullBuf`, `_lightHeap`, …) are pooled objects reused in place — see the
"fresh objects here were per-car-per-frame GC churn" comment near
`appendCarTailLights`. **Don't blame "per-frame `new Float32Array` in light
upload" from memory — that folklore predates the pooling fix.** If `Minor GC`
still shows up frequently during a Vegas/Singapore session, profile fresh and
find the actual allocator; do not assume it's lighting.

Current cost centers worth checking first, in rough order of likely impact:

| Cost center | Where | What to look for |
|---|---|---|
| Shadow pass | `js/render/glx/shadow.js` (`GLXShadow`) | Static sun map + dynamic car/lamp maps — flag if the shadow FBO render is a large flame-chart slice, not just the main pass |
| Uniform upload | `js/render/glx.js` `gl.uniform*` calls, per light/mesh | Flag if `> 2 ms`; check light count (`numLights`) isn't maxed unnecessarily |
| Particles | `js/game/particles.js` | Pooled typed arrays (`_px`, `_vertA`, …) sized to `MAX` — profile the per-frame update/pack loop cost, not allocation |
| `appendCarTailLights` sort | `js/game/lighting.js` (`_tlSel.sort(_byDistAsc)`) | Runs every frame when floods are lit; cost scales with nearby-car count within `tailRange`, not GC — a flame-chart entry here is CPU time, not garbage |
| `(garbage collector)` | anywhere | If GC still appears, get the *actual* allocation site from the flame chart's bottom-up view before proposing a fix — don't reattach it to the light-upload path by default |

Check `GLX.hdrMode()` returns `true` (RGBA16F FBO active) — RGBA8 fallback does
additional intermediate copies, which is a separate, still-real cost.

## Legacy inline harness

The old copy-paste Monza-only script lived here before `tools/profile-gameloop.mjs`
landed. Prefer the committed tool above; only hand-roll a harness when you need
custom staging (e.g. `setTimeOfDay("night")` before `Profiler.start`, a specific
car count, or career state). Pattern: free port → static server → Chromium +
SwiftShader → CDP `Profiler.enable/start/stop` → write JSON to
`scratch/profiles/`.
