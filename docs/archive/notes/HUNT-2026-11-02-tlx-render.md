# Hunt 2026-11-02 — TLX renderer (js/render/three/, js/render/shared/) — #4451

Prior art: prior-art-scout list (TLX-WEBGPU-PERF-2026-10-30, TLX-PERF-HUNT-2026-10-11, PERF-HUNT-TLX-2026-10-17, DEFECT-LEDGER). Three sonnet code-hunters, then finding-verifier on every row.
Result: no high or medium defect. Seven low rows; six confirmed, one refuted as live. All figures are by reading, none measured.

**Coverage was partial** (hunters hit their turn budget). Read in full: tsl-viewport, tsl-chunks, tsl-fx, mirror-pass, post-common, chunk-bins, frustum, inst-cells, lamp-chunks, puddles, canvas-css-size. Partial: tlx.js (~2000 of 7146 lines), tlx-post.js 520-1401, tsl-post, tsl-sky 178-520, tsl-lit (~15%), shadow-pass 16-415, tlx-shadow 300-530, tlx-chunked 529-925. NOT read: tlx.js create-time/WebGPU setup (205-1098), env probe, debug getters; tsl-lit shader graph body; tsl-post SSAO/godray/SSR/FXAA/SGSR bodies; vertex-pack, assets, gltf, driving-line, compatibility-recovery.

## Ranked

| # | Where | Verdict | Status |
|---|---|---|---|
| 1 | tlx.js:1555 mirror mip-grow calls `mirRT.dispose()` without `post.releaseMirror`/`fx.releaseTexture` (cf. releaseMirror :5813). Live: cockpit glass LOD rising at same w/h. WebKit stale-bind-group risk unproven. | CONFIRMED (literal), NEEDS-BROWSER for effect | FOLLOW-UP (needs iPhone/Safari evidence) |
| 2 | tlx.js:4097 `dropWrapper` `_dropQueue.some` — O(n²) during a warm window, once per track switch | CONFIRMED | follow-up |
| 3 | tlx.js:2508/2831/2945 `_instRegistry` indexOf+splice on batch free, not per frame | CONFIRMED | follow-up (sub-ms) |
| 4 | tsl-fx.js:194-203 glow billboard has no corner Discard; output ≈0 at corners, fill-rate only, not bit-identical if added | CONFIRMED | follow-up (needs gfx A/B) |
| 5 | tlx.js:2074 `"|fx"` concat per fx draw | CONFIRMED | FIXED here (`_fxKeys` cache) |
| 6 | tsl-sky.js:262 per-frame 3-element array in `derive()` | CONFIRMED | FIXED here (locals) |
| 7 | tlx-shadow.js:436 regrow guard skips plain InstancedMesh casters | REFUTED as live: nothing mutates `batch.instances` after creation | latent hazard only |

Tried and cleared: texture pool, acquireMesh/prunePool, cullInstances prefix reuse, mirror `_sv` save/restore, lamp heap, cloud-cache, decal eviction, depth/tag discard gates.
