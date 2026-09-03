# spike/backends — WGX (WebGPU) and TLX (three.js/TSL)

Both backends behind the Gfx seam were opt-in only (`apex26.gfxBackend=
"webgpu"|"three"`) and moved out of the shipped tree on Phase 2b of the
2026-09 restructure (docs/research/TREE-RESTRUCTURE-2026-09.md §Phase 2).
GLX (WebGL2) is and remains the only shipped renderer.

**Status: this README is a draft written during the Phase 2b INVENTORY
(docs/notes/SPIKE-BACKENDS-CHECKLIST.md), before the move itself ran.** The
file lists (`webgpu/`, `three/`, `vendor/three-0.185.1/`, `tools/`, `tests/`,
`docs/`, `skills/`) below describe what the move window will place here, per
`tools/moves/spike-backends.json`; they are not yet populated on this branch.

## What's here (once the move lands)

- `webgpu/` — WGX: `wgx.js` (the backend) + `wgsl-chunks.js` / `wgsl-fx.js` /
  `wgsl-post.js` (WGSL-as-data shader sources).
- `three/` — TLX: `tlx.js` (the backend) + `tlx-shadow.js` / `tlx-chunked.js`
  / `tlx-post.js` (passes) + `tsl-chunks.js` / `tsl-lit.js` / `tsl-sky.js` /
  `tsl-fx.js` / `tsl-post.js` (TSL shader-node factories).
- `vendor/three-0.185.1/` — the vendored three.js island TLX imports at
  runtime (`three.webgpu.min.js` / `three.core.min.js` / `three.tsl.min.js` +
  the BloomNode addon). Carries two load-bearing patches — see
  `vendor/three-0.185.1/PATCHES.md` — re-apply both on any future re-attach.
- `tools/` — the WGX/TLX-only CLIs: `gfx-probe.mjs`, `gpu-census.mjs`,
  `road-lut-census.mjs`, `wgx-{capture,gallery,lavapipe-probe,shot,
  soft-present-diag,validate,vid-repro}.mjs`, `tlx-pack-check.cjs`,
  `webgpu-chrome-args.cjs`, `wgpu-flag-test.mjs`.
- `tests/` — `unit/webgpu-lifecycle.test.mjs`, `unit/renderer-soft-lifecycle.test.mjs`,
  `unit/road-lut-frame.test.mjs`, `specs/tlx-probes.spec.js`.
- `docs/` — `WEBGPU-PARITY.md` (gap inventory + WebGPU API recipes), the WGX/TLX
  sections carved out of `RENDERER-PERF-AUDIT-2026-09-02.md`, and `wgx-gallery/`
  (screenshot evidence, `wgx-gallery-manifest.json`).
- `skills/webgpu-debug/` — the WGX debugging skill.
- `skills/cursor-rules/render-{wgx,tlx}.mdc` — the two Cursor glob rules.

## How to re-attach

1. `git mv` every file back to its pre-spike path (the inverse of
   `tools/moves/spike-backends.json` — swap `moves` keys/values and re-run
   `node tools/move-tree.mjs <inverted-map>`).
2. Restore the two `tools/manifest.cjs` `DEFERRED` groups (`webgpu`/`three`
   arrays) and `DEFERRED_EDGES`, then `node tools/gen-shell.mjs` to
   regenerate `index.html`'s tag blocks, `js/roster.js` and `sw.js`'s
   optional precache set.
3. Restore `index.html`'s `three*` importmap keys (Trystero's three keys
   never left — do not duplicate them).
4. Restore `sw.js`'s hand-authored `vendor/three-0.185.1/*` OPTIONAL
   precache lines.
5. Restore `js/game.js`'s boot-canary block and `preloadThreeVendor()` if
   they were deleted rather than left as dead code (check the move-window
   commit — the checklist offered both options).
6. Restore `js/game/renderer-picker.js`'s `BACKENDS` array and the THREE
   PATH/SCREENSHOTS control block if deleted.
7. Re-widen `backend-surface-parity.test.mjs` and `godray-keep-nearest.test.mjs`
   back to their three-backend form; restore the deleted assertion blocks in
   `perf-try.test.mjs` / `perf-governor.test.mjs` / `light-grid.test.mjs` /
   `ci-coverage.test.mjs` / `mcp-cli.test.mjs` — these were narrowed, not
   just deleted, so re-attaching without them is real functional coverage
   loss until they are restored.
8. Re-run the WGX/TLX unit suite and the static WGX validator, then a live
   backend probe for each, before trusting either backend again — a
   spiked-out tree accrues drift the moment it stops running in CI.

## Provenance

Both backends shipped and were measured extensively before this spike-out —
see the archived WebGPU migration plan and maintainability review (the
original path was under the docs tree's archive of superseded designs),
`RENDERER-PERF-AUDIT-2026-09-02.md`'s WGX/GLX/TLX audits (the GLX section
stayed in the shipped tree; the WGX/TLX sections moved here alongside this
README), and the original three.js evaluation spike that led to TLX shipping
(kept, historically, alongside this directory's siblings under `spike/`).
This is not a green-field spike; it is a working, tested pair of renderers
taken out of the shipped tree for maintenance-cost reasons, not because
either was found broken.
