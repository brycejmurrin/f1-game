# CPU profiling — headless Playwright + CDP (folded from the perf-profile skill)

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
and cost-center order are below. Live GC-jitter tracing in a running page is
`performance_start_trace` via **mcp-probe** (chrome-devtools MCP).

## Reading a game-loop flame chart

Open `scratch/profiles/<track>-<mode>.cpuprofile` in Chrome DevTools →
**Performance** → **Load profile**.

| Function | What it means |
|---|---|
| `updateCar` | Per-car physics tick — hot if AI count is high |
| `buildTrackLights` | Light culling each frame — should be < 0.5 ms |
| `begin` / `gl.uniform*` | Shader uniform upload — flag if > 2 ms |
| `(garbage collector)` | GC jitter — look for `Minor GC` during night races |
| `buildRoad` / `buildProps` | Track mesh build — runs once on load, not per-frame |

### Interpreting GC spikes on night tracks

The light-upload path was a known GC source but is **fixed**: `js/render/glx.js`
allocates its per-lamp uniform arrays (pooled as `_luA`/`_luB`/`_luC`/`_luD`)
**once at module scope** and writes into them each frame, and
`js/game/lighting.js`'s per-frame selection buffers (`_tlSel`, `_lightCullBuf`,
`_lightHeap`, …) are pooled objects reused in place. **Don't blame "per-frame
`new Float32Array` in light upload" from memory — that folklore predates the
pooling fix.** If `Minor GC` still shows up on Vegas/Singapore, profile fresh
and find the actual allocator.

Current cost centers, in rough order of likely impact:

| Cost center | Where | What to look for |
|---|---|---|
| Shadow pass | `js/render/glx/shadow.js` (`GLXShadow`) | Static sun map + dynamic car/lamp maps — flag if the shadow FBO is a large slice |
| Uniform upload | `js/render/glx.js` `gl.uniform*` | Flag if `> 2 ms`; check `numLights` isn't maxed |
| Particles | `js/game/particles.js` | Pooled typed arrays sized to `MAX` — profile the update/pack loop, not allocation |
| `appendCarTailLights` sort | `js/game/lighting.js` (`_tlSel.sort(_byDistAsc)`) | CPU time scaling with nearby-car count in `tailRange`, not GC |
| `(garbage collector)` | anywhere | Bottom-up view for the *actual* allocation site — don't reattach it to light upload |

Check `GLX.hdrMode()` returns `true` (RGBA16F FBO). RGBA8 fallback does extra
copies.

### Legacy inline harness

Prefer `tools/profile-gameloop.mjs`. Hand-roll only for custom staging
(`setTimeOfDay("night")` before `Profiler.start`, a specific car count). Pattern:
free port → static server → Chromium + SwiftShader → CDP
`Profiler.enable/start/stop` → write JSON to `scratch/profiles/`.
