# CPU / main-thread perf hunt (hunter B), 2026-10-17

Lane: everything on a phone's main thread that is not the GPU. Bryce plays on an iPhone 15 in landscape (852x393).
Prior art read first: PERF-ALLOC-HUNT, PERF-HUNT-RACELOOP, PERF-HUNT-BOOT, PERF-HUNT-SESSION-MEMORY(-R2),
PERF-HUNT-P7 and PERF-LAYOUT-SHOWNLAYER (all 2026-10-17). Those hunts profiled JS. None of them traced style and layout.

## Method: take SwiftShader out of the frame

The box draws on SwiftShader, so a normal race runs at 0.1-1 fps here, and a wall-clock gate (10 Hz HUD tick, 250 ms
memo) fires on every frame. That breaks every per-frame number. **`__apex.headless(true)` after `go()`** skips the 3D
draw but keeps the rAF loop, physics, AI, HUD and audio running. Monaco on GLX then runs at 38-48 fps on this VM, and
what the main thread spends is real CPU work. It is still not a phone: rank by relative cost only.

Config: Playwright Chromium, `viewport 852x393, hasTouch, isMobile`, `apex26.gfxBackend=webgl2`, `race("monaco")`,
`go()`, full throttle, an 8 s settle, then the window. Scripts (untracked, `scratch/perfB/`): `cpuprof.mjs` (CDP
Profiler, self time per frame), `trace.mjs` (DevTools trace, main-thread event totals; `SEL=1` adds CSS selector stats,
`REWRITE=1` applies the CSSOM rewrite A/B in `scratch/perfB/rewrite.js`), `bursts.mjs` / `inside.mjs` / `callers.mjs` (profile post-processing),
`fitprobe.mjs` / `roprobe.mjs` (mutation and ResizeObserver censuses), `crbench.mjs` (micro-benchmarks).

## Ranked findings

| # | finding | measured | status |
|---|---|---|---|
| 1 | `body:has(#x…)` rules search the whole document whenever body restyles | style recalc 5.6-7.3 → 3.6-4.2 ms/frame | **fixed here**: 54 `:has(` arguments scoped to `> #x` |
| 2 | HUD full fit (`fitHud`, every ~3.3 s on the same key) is a 54-125 ms task; each fit ping-pongs root custom properties | profile bursts; 13-16 ms per root-var write + read | reported to the HUD-fit owner (PR #2743 lane) |
| 3 | `HudLayout.clearReadouts` costs 9-24 ms per call at ~2 calls/s (ResizeObserver, plus 4 per full fit) | 397 ms of 20 s | open, hud-layout.js |
| 4 | 7 `body:has(#hud-*)` rules whose element sits inside `#hud` are still unscoped | selector stats | open: try `> #hud #hud-x` |
| 5 | `shownLayer` is still the top named JS function on the real-GPU census (macOS) | 1.1 %, 235 ms / 20.8 s, run 39042826810 | open, low |

### 1. `:has()` scope (fixed)

DevTools trace over 12 s, 530-578 frames: `UpdateLayoutTree` (style recalc) took **6.45 / 5.56 / 7.30 ms per frame**.
That is more than all JS put together (`FunctionCall` 3.3-3.9 ms/f). Each recalc touched few elements (`elementCount`
p50 9, p90 63) but cost a lot (p50 1.5 ms, p90 15 ms). CSS selector stats (`disabled-by-default-blink.debug`) named
the rules: `body:has(#lighting:not([hidden]))`, `html:has(#pausemenu:not([hidden])) #ios-install`,
`body:has(.screen:not([hidden])) …` and about 30 more. Each one was attempted about 60 times in 151 frames, at ~1.6 ms
per attempt with stats on. An unscoped `:has()` argument is a descendant search over all ~4.9k nodes (`#pmsettings`
alone is 2.9k, display:none or not), and every body-subject rule re-runs whenever body's style is invalidated.

Every one of those elements is a **direct child of `<body>`**: the ids, and all 24 `.screen` elements. So
`body:has(> #x…)` is the same match over about 60 children. The same holds for `html:has(> body > #x…)`. Chromium's
:has() intent to ship says to prefer the child combinator for exactly this reason
(https://groups.google.com/a/chromium.org/g/blink-dev/c/bRsbl3wLuyk/m/mt3iSKNHBQAJ). WebKit also scopes :has()
matching by combinator (https://webkit.org/blog/13096/css-has-pseudo-class/), but WebKit was not measured here.

A/B, interleaved, the same harness, CSSOM rewrite of the 48 matching rules in the live page:

| arm | UpdateLayoutTree ms/frame | RunTask ms/frame |
|---|---|---|
| base | 6.45, 5.56, 7.30 | 10.9, 9.4, — |
| scoped | 3.59, 3.97, 4.19 | 7.6, 8.3, 8.6 |

Re-measured on the COMMITTED CSS (no CSSOM rewrite), deploy tip 500ceb00 vs this branch at ff607831, interleaved,
same harness (`scratch/perfB/trace.mjs`, 12 s window, rAF-counted frames):

| arm | UpdateLayoutTree ms/frame | fps (headless race) |
|---|---|---|
| deploy tip | 7.21, 7.14, 6.04 | 37.7, 38.9, 44.2 |
| scoped | 4.17, 4.07, 4.23 | 44.8, 45.7, 43.4 |

The source change is the same rewrite, done in `css/*.css` (54 `:has(` arguments in carsetup, dialogs, hud, menus,
overlays, tuner and watch-transport, the second link of a chained `body:has(…):has(…)` included; `touch-controls.css` was left alone because it belongs to the HUD-fit lane). It skips `dialog[open]`
and `dialog:modal`, because the Data Hub telemetry dialog is nested inside `#datahub`. `tests/unit/css-has-scope.test.mjs`
pins every scoped id and every `.screen` to a body child in `index.html`, and refuses an unscoped search for a body child.

### 2. HUD full fit (reported, not edited)

CPU profile, 20 s: `updateHud` bursts p50 1 ms, but 6 bursts ran 54-125 ms, about one per same-key full fit (`_fitWait`
30 ticks ≈ 3 s). Inside `fitHud`: `getBoundingClientRect` 278 ms and `zoomDiv` (`el.currentCSSZoom`) 140 ms over 20 s.
Each full fit writes `--hud-left-h` and `--hud-left-px` twice with different values, removes and re-sets
`--hud-tyre-top`, and toggles `body.hud-tyre-stack` off and then on (counted: 9 fits, 18 / 18 / 9+9 / 9 changes). The
fit ends in the state it started in. `crbench.mjs`: one root custom-property write followed by a rect read costs **13-16 ms**
p50 (a whole-document restyle; 9 ms with `#pmsettings` detached), against 0.6 ms for a local style write.

### 3. clearReadouts

`callers.mjs` over 20 s: ResizeObserver 162 ms, fitHud 56, `fit → packPhone` 47, the double-rAF follow-up 67, the
+120 ms timeout 55. The observer fires about 0.8 times a second on legitimate size changes: radio cards coming and
going, and `#hud-damage` width jitter of 131.9-137.9 px as its digits change. Most of the cost is forced style and layout
(`box` 217 ms of self time); `querySelectorAll` adds 71 ms (a 15-selector list costs 1.3 ms over 4.9k nodes).

### 5. shownLayer on real hardware

gpu-census 39042826810 (macos-latest, TLX-WebGPU): `shownLayer @ js/ui/layers.js:97` 235 ms and `getBoundingClientRect`
202 ms in 20.8 s, ahead of `updateCar` (106 ms). In spike frames the stack is `remoteBrake ← braking ←
updateCarBrakePlan`. The #2605 memo watches the `style` attribute of `<html>`, and the HUD writes root custom properties,
so each full fit drops the memo.

## Not measurable here

- WebKit / iOS Safari style cost. Every number above is Blink. The direction should carry over (combinator scoping is
  the same idea in both engines); the size does not.
- GC pause lengths and thermal throttling on a phone.
- Real-GPU frame time. That is hunter A's lane (gpu-census).
