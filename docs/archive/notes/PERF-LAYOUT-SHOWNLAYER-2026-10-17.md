# Per-frame forced layout in `UiLayers.navOpen()` (2026-10-17)

**Evidence.** gpu-census run 38985693871 (macos-latest, real GPU, monaco, chase, tip 7d96dc5b): `shownLayer @ js/ui/layers.js:97`
took 3.3–5.7 % of all sampled CPU on every backend (TLX-WebGPU 1222 ms, TLX-GL 845 ms, GLX 695 ms per ~21 s; 9.5 % in TLX spike frames).
Stack: `tickRace → lookingBack → remoteDrivingBlocked → navOpen → shownLayer → getComputedStyle + getBoundingClientRect`.

**Cause.** `#rotate-device` is hidden by CSS (`display: none` outside `body.in-race:not(.rotate-ok)`), never by the `hidden`
attribute, so `shownLayer`'s `el.hidden` shortcut cannot skip it. Every `navOpen()` call (about six per tick) flushed style and
layout that the HUD's own writes had just dirtied.

**Fix.** `navOpen()` memoises its answer for 250 ms and drops it the moment a `MutationObserver` (watching the layers, their
subtrees, and `<html>`/`<body>` attributes) has a record, drained synchronously with `takeRecords()` (no layout). Resize and
orientationchange drop it too (media queries). The time bound is only the net for what the observer cannot see. The zero-size
wrapper rule (`shownLayer` asks the children) is untouched; it just runs less often.

**Measured** (`scratch/nav-bench.mjs`, SwiftShader box, monaco in a race, 6 `navOpen()` calls per frame after a HUD style write,
150 frames, 3 runs): base 0.314 / 0.318 / 0.415 ms per frame; fixed 0.056 / 0.037 / 0.040 ms per frame (about 8x, spread far smaller
than the gap). Real-GPU CPU table: see the PR body (gpu-census on this branch).

Pinned by `tests/unit/layers-nav-memo.test.mjs`.
