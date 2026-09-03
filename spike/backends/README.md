# spike/backends — WGX (WebGPU) and TLX (three.js/TSL)

Both backends behind the Gfx seam were opt-in only (`apex26.gfxBackend=
"webgpu"|"three"`) and moved out of the shipped tree on Phase 2b of the
2026-09 restructure (docs/research/TREE-RESTRUCTURE-2026-09.md §Phase 2).
GLX (WebGL2) is and remains the only shipped renderer.

**Status: LANDED 2026-09-03.** 46 files moved by
`node tools/gen/move-tree.mjs tools/moves/spike-backends.json`; the non-move
edits are in `docs/notes/SPIKE-BACKENDS-CHECKLIST.md`.

Two files the inventory listed for the move STAYED in the shipped tree,
because the move proved they were not WGX/TLX-only:

- `tools/lib/webgpu-chrome-args.cjs` — `tools/lib/harness.mjs` requires it and
  re-exports its three flag sets, so it feeds the Chromium launch of EVERY
  browser test, GLX included. Moving it broke the whole shipped harness.
- `tools/gfx/gpu-census.mjs` — `ci.yml`'s renderer-macos job runs it to prove a
  hardware adapter before trusting the GLX `test:gfx` run, and `gpu-census.yml`
  runs it for the whole census. It imports nothing WGX-specific; it answers
  "is there a real GPU here", which the shipped tree still needs to ask.

That is the same class of correction the checklist itself had already made for
`ssr-probe.mjs` (GLX-only) and `gpu-game-check.mjs` (has a live GLX leg): a
tool that MENTIONS WebGPU is not automatically a WebGPU-only tool.

## What's here

- `webgpu/` — WGX: `wgx.js` (the backend) + `wgsl-chunks.js` / `wgsl-fx.js` /
  `wgsl-post.js` (WGSL-as-data shader sources).
- `three/` — TLX: `tlx.js` (the backend) + `tlx-shadow.js` / `tlx-chunked.js`
  / `tlx-post.js` (passes) + `tsl-chunks.js` / `tsl-lit.js` / `tsl-sky.js` /
  `tsl-fx.js` / `tsl-post.js` (TSL shader-node factories).
- `vendor/three-0.185.1/` — the vendored three.js island TLX imports at
  runtime (`three.webgpu.min.js` / `three.core.min.js` / `three.tsl.min.js` +
  the BloomNode addon). Carries two load-bearing patches — see
  `vendor/three-0.185.1/PATCHES.md` — re-apply both on any future re-attach.
- `tools/` — the WGX/TLX-only CLIs: `gfx-probe.mjs`, `road-lut-census.mjs`,
  `wgx-{capture,lavapipe-probe,shot,validate,vid-repro}.mjs`,
  `tlx-pack-check.cjs`, `wgpu-flag-test.mjs`. (`gpu-census.mjs` and
  `webgpu-chrome-args.cjs` stayed shipped — see above.)
- `tests/` — `unit/webgpu-lifecycle.test.mjs`, `unit/renderer-soft-lifecycle.test.mjs`,
  `unit/road-lut-frame.test.mjs`, `specs/tlx-probes.spec.js`.
- `docs/` — `WEBGPU-PARITY.md` (gap inventory + WebGPU API recipes), the WGX/TLX
  sections carved out of `RENDERER-PERF-AUDIT-2026-09-02.md`, and `wgx-gallery/`
  (screenshot evidence, `wgx-gallery-manifest.json`).
- `skills/webgpu-debug/` — the WGX debugging skill.
- `skills/cursor-rules/render-{wgx,tlx}.mdc` — the two Cursor glob rules.

## Two shipped guards still read this directory — on purpose

`tests/unit/backend-surface-parity.test.mjs` and
`tests/unit/gfx-backend-canary.test.mjs` are on the shipped fast gate and still
read `spike/backends/webgpu/*` and `spike/backends/three/*`. That was a choice,
not an oversight. The plan wanted parity narrowed to a GLX-vs-`gfx.js`-header
check, but narrowing it deletes the guarantee: parity has caught the same
defect shape twice (a backend missing a member silently inherits GLX's own
function, which then dies on null `gl`). The tests are node-only and cost
about two seconds, so keeping them costs nothing and keeps the spike honest.

The consequence to know about: **editing code in here can turn the SHIPPED fast
gate red.** That is the intended trade — it means the spike cannot rot
unnoticed while it sits out of the tree. If that coupling ever becomes the
thing standing in the way, narrow the two guards and record the loss here,
the way the narrowed guards in step 7 below are recorded.

## How to re-attach

1. `git mv` every file back to its pre-spike path (the inverse of
   `tools/moves/spike-backends.json` — swap `moves` keys/values and re-run
   `node tools/gen/move-tree.mjs <inverted-map>`).
2. Restore the two `tools/manifest.cjs` `DEFERRED` groups (`webgpu`/`three`
   arrays) and `DEFERRED_EDGES`, then `node tools/gen/gen-shell.mjs` to
   regenerate `index.html`'s tag blocks, `js/roster.js` and `sw.js`'s
   optional precache set.
3. Restore `index.html`'s `three*` importmap keys (Trystero's three keys
   never left — do not duplicate them).
4. Restore `sw.js`'s hand-authored `vendor/three-0.185.1/*` OPTIONAL
   precache lines.
5. Restore `js/game.js`'s `preloadThreeVendor()` (deleted — it pointed at
   vendor paths that left the shipped tree). The boot canary and the
   `optIn`/`PROBE_KEY` machinery were LEFT IN PLACE: with `DEFERRED` empty
   they load nothing and `Gfx.create()` returns null, which is the same
   "backend refused" path an unsupported browser always took.
6. `js/perf/renderer-picker.js` still offers all three stops — it was NOT
   narrowed in the move window, so a returning player can still pick a backend
   that now falls back to GLX. Narrowing it is the one deliberate follow-up.
7. Restore the NARROWED guards. `image-grade-shaders.test.mjs` lost its
   GLSL-vs-WGSL grade parity test (it was catching real drift and now the
   GLSL contract stands alone); `global-registry.test.mjs` lost the
   `TLXShaders: 8` writer count and gained `js/render/gfx.js: ["TLX", "WGX"]`
   in `KNOWN_EXTERNAL_READS`; `load-order.test.mjs` lost its TLX wave-0 test.
   These were narrowed, not tidied — re-attaching without restoring them is
   real coverage loss.
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
