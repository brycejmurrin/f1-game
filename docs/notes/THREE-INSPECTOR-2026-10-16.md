# three.js Inspector, opt-in (2026-10-16)

Goal: the official `three/addons/inspector` dev panel on TLX, costing nothing unless asked for.

- **Vendored** by `tools/gen/vendor-three.mjs` (ADDONS): the 18 core files of three@0.186.1
  `examples/jsm/inspector/` (~320 KB, hashes in `vendor/three-0.186.1/MANIFEST.json`). `extensions/` (color-grading,
  tsl-graph) is NOT vendored: `Settings.js` imports it lazily on a click and Inspector.js never imports it. The
  generator now preserves the hand-written `PATCHES.md` across its wipe, so two runs leave no diff.
- **Toggle**: `js/perf/three-inspector.js` (`?inspector=0|1`, `__apex.inspector(on)`). Default ON on localhost/127.0.0.1/::1/file:, OFF on the deployed site and when `navigator.webdriver` (zero churn for the Playwright harness, which serves on 127.0.0.1); precedence URL > stored `apex26.inspector` > default (Bryce 2026-10-16). Dynamic `import("three/addons/inspector/Inspector.js")`
  through the existing importmap, then `renderer.inspector = new Inspector()` (three's setter calls `setRenderer`).
  TLX only: `tlx.js` `inspectorHost()` hands over the renderer; GLX/WGX have none, so the hook answers with a reason.
- **Never shipped eagerly**: not in `sw.js`, no modulepreload, not in `ApexRoster.DEFERRED`
  (`tests/unit/three-inspector.test.mjs`). The importmap entry `three/addons/` already existed.
- **Interlock**: `Inspector.setRenderer` sets `backend.trackTimestamp = true` and resolves timestamps itself.
  `inspectorHost().hold(true)` forces `gpuTimer` off (and stops touching `trackTimestamp`) so the two never resolve the
  same queries; `hold(false)` on dispose restores normal gpuTimer.
- **Limits**: GPU timings need WebGPU + `timestamp-query`; on WebGL2 / SwiftShader the Inspector logs "GPU Timestamp
  Queries not available" and the other tabs still work.
- **Phone**: Style.js makes the panel root `pointer-events:none` with only controls interactive; the built-in "-" folds it
  and our × disposes it, so steering touches pass through.
- Sibling: #2562 (profiler) also touches apex.js / agentview.js / tlx.js gpuTimer; edits here are distinct regions.
