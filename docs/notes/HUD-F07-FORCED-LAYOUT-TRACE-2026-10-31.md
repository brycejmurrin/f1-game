# HUD F-07 — forced layouts per HUD tick, measured (2026-10-31, #4318)

Setup: chrome-devtools `performance_start_trace`/`stop_trace`, 20 s, after a 25 s settle. Owner's export
(`tests/data/settings-defaults-export.json`: HUD 155.25, BUTTON 245, REL + STRAT + INPUTS + MIRROR on) imported through
`SettingsExport.applySettings`, 844x390 DPR 1 mobile+touch, Monza, `go()` + `setInput({throttle:1})`, **`headless(true)`**.
Deviation: with the 3D render on, SwiftShader pinned the GPU process (~180 % CPU) and the page ran at 0.2 fps (a DPR 3 run:
~1 rAF per 10 s), so the HUD tick never ran. Render off gives 57 fps and 60 live ticks/s. SwiftShader numbers are relative only;
a phone number needs the `gpu-census` / WebKit leg.

Counting: `Layout` / `UpdateLayoutTree` trace events that carry a JS stack (a forced pass), grouped by top frame and caller
(analysis script: scratch only, not committed).

## Before (HEAD, steady state, 23 s window)
- 1340 forced passes = 57.6/s, 1181 ms = 51 ms/s. The ForcedReflow insight window covers only ~0.3-20 s of it; read the events.
- Driven by the 10 Hz tick EVERY tick: `hud-inputs.js` `measure()` (`window.innerWidth/innerHeight` + `cv.currentCSSZoom`,
  228 passes, 39-51 ms) and `draw()` (`ctx.font =` , 164 passes, 46 ms).
- 1 Hz `HudRelative.tick`: `geoKey()` forces 1.2-1.4x/s (3.7-4.5 ms each: the layout is dirty from the same tick's writes);
  a moved box adds `fitRows` -> `fitRowsNow` (3 passes). So YES, the 1 Hz net forces a layout.
- 10 Hz tick other than inputs: `radioPaintedCollapseTick` 3 s backstop (3.9 ms each), `fitHud`, `announceLaneTick`->`laneRect`.
- Bursts of 100-200 passes/s every ~2-3 s: `clearReadouts` from its `ResizeObserver` (`hud-layout.js` watchReadoutSizes)
  and from `fitRows`/`fitPass`; it interleaves style writes and `getBoundingClientRect` per block.

## Top call sites by forced time (before)
1. `hud-layout.js` `clearReadouts` (box/screenBounds reads): ~370 passes, 170-250 ms.
2. `hud.js` `layoutRect` <- `wide` <- `fitPass` (28x, 145-230 ms, up to 17 ms each).
3. `hud-radio-lane.js` `radioPaintedCollapse` (37x, 143 ms); `hud-relative.js` `geoKey` (32x, 119-150 ms).

## Change in this PR
`hud-inputs.js`: viewport size re-read on `resize`/`orientationchange` only, `currentCSSZoom` within ~1 s (was every draw);
`ctx.font` set after a bitmap reset only. After: `measure` and the `font` write are gone from the forced list (trace7: 1138
passes = 49.7/s, 1052 ms = 46 ms/s; `fillText` in `draw` still forces 191x, 42 ms, ~0.2 ms each).

## Left (not fixed here, needs a design pass)
`clearReadouts` write/read interleave (reset, then box read per block, then a painted re-read), and the `fitPass`
`layoutRect` reads: batch all reads before the writes. Each is event/backstop driven, not per-tick.
