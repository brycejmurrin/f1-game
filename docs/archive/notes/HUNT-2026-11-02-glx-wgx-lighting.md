# Hunt 2026-11-02 — GLX + WGX renderers and lighting (#4452)

Slice: `js/render/glx/`, `js/render/webgpu/`, `js/render/gfx.js`, `js/render/renderer-boot.js`, `js/lighting/`.
Method: prior-art scout, three read-only code-hunters (GLX, WGX, lighting; static, nothing measured), one
finding-verifier pass. 7 candidate rows: 5 CONFIRMED, 1 REFUTED, 1 CONFIRMED-but-dead. No perf win was
found or measured. No browser run, no gpu-census dispatch.

Hunter gaps (not covered, so not clean): `glx.js` init/begin/uniform upload and export table, `chunked.js` 1-225,
`post.js` 1-240, GLSL shaders; `wgx.js` outside 2885-3130, `wgsl-*.js` (UBO layout, device-lost body);
`tuner-panel.js`, `knobs.js` 1-149.

## Fixed in this PR
| # | where | defect | fix |
|---|---|---|---|
| 1 | `wgx-chunked.js` `freeChunkedMesh` | plain-`createMesh` road result (OOM upload fallback) leaked `lutSbuf` (~262 KB) and `pieces[1..]` per rebuild | free LUT + non-head piece buffers, clear `roadLutBG` when it owned it |
| 2 | `glx/chunked.js` `_occVisible`, `drawChunkedBody` | main-camera occlusion flags culled chunks in the rear-view mirror pass (flag `apex26.occlusionCull`, ships OFF) | mirror pass ignores flags and does not queue meshes |
| 3 | `renderer-boot.js` GLX boot | after the watchdog fired, the late `GLX.init` still built a WebGL2 context behind "Graphics unavailable" | `onTimeout` sets a flag; run skips `GLX.init` |

Tests: #2 has a behavioural case in `glx-occlusion.test.mjs` (mock core gained `post.mirror.active`). #1 and #3 have none:
source pins are ratcheted (`assert-match-ratchet`) and a WGX/boot behavioural test needs a device mock that does not exist; both are
small guarded early-outs, covered by existing lifecycle tests not regressing.

## Follow-ups (CONFIRMED, not fixed)
- `track-lights.js:166-172` `applyLampDensity` (density < 1): last-to-first gap across node 0 can be < `targetGap`. Cosmetic.
  A seam pop broke `lamp-density.test.mjs` "wraps like a ring", which pins `ceil(n/gap)`; needs a decision on the intended contract.
- `profiles.js:358-367` `reset()` deletes the global `"*"` profile that `tuned()` never counts. Policy call (count it, or keep it).
- `wgx-shadow.js:83-95` blocker-texture try/catch can never fire (`createTexture` reports through error scopes); dead, harmless.

## Refuted
- `atmosphere.js:346-358` fog/sunDir compounding: every built def has a palette (`js/track/core/def.js:153`).
