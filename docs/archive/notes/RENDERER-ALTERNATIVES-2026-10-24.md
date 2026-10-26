# Renderer alternatives to the vendored three r186: WebGPU bandwidth and submit cost (2026-10-24)

Asked by Bryce for #3681 (A·W47). The goal was to get the phone bandwidth savings of
#3679 onto the iPhone WebGPU path, and to reduce the per-frame submit, `writeBuffer` and
bind-group cost (`PERF-KNOWN-WINS-2026-10-23.md` row 14). Everything below was checked
against the sources on 2026-10-24.

## Two levers

- **A. Discard unread attachments**: `storeOp: "discard"` per attachment on a
  single-sample target.
- **B. CPU submit and bind cost**: fewer `queue.submit`, `writeBuffer` and bind-group
  switches per frame.

## Findings

| Option | A | B | Cost | Source |
|---|---|---|---|---|
| three r187 | no release yet | #30560 open | none, but no date | npm `three` latest is 0.186.1 (2026-09-24); https://github.com/mrdoob/three.js/releases (r186 is "Latest"); `dev` `package.json` still reads 0.186.0 |
| three `dev` snapshot | **no**: `discardColor`/`discardDepth` still gate on `sampleCount > 1` | no | n/a | `src/renderers/webgpu/WebGPUBackend.js` on `dev`, fetched 2026-10-24 |
| **three r186 + patch 17** | **yes** (this PR) | no | S | `vendor/three-0.186.1/PATCHES.md` §17 |
| **three r186 `BundleGroup`** | no | **yes** for static batches (render bundles) | S–M, unmeasured | `src/renderers/common/BundleGroup.js` (r186); unused under `js/render/three/` |
| WGX (our raw WebGPU backend) | **yes**: already discards env and mirror depth (`wgx.js` env / mirror passes) | **yes**: it owns every submit | M–L: opt-in, `WGX_LITE` on WebKit, parity work to become the iPhone default | `js/render/webgpu/wgx.js` |
| PlayCanvas 2.23 | **yes**: `ColorAttachmentOps.store`, `DepthStencilAttachmentOps.storeDepth`, single- or multi-sampled | **yes**: persistent instance-matrix storage buffer, material-owned UBOs, up to 3.8× less CPU per frame on WebGPU | XL: a TLX rewrite (TSL node shaders, post, shadows, chunked track do not carry over) | https://github.com/playcanvas/engine/releases/tag/v2.23.0 ; `src/platform/graphics/render-pass.js` |
| Babylon.js 9.32 | **no**: `webgpuEngine.pure.ts` hard-codes `StoreOp.Store` (comment at the main pass: Discard breaks multi-viewport) | yes: snapshot rendering (render bundles), for mostly static scenes | XL rewrite | https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering |

Upstream #30560 (https://github.com/mrdoob/three.js/issues/30560) is open, High priority,
with no linked branch or PR. Maintainer sunag (2026-01-06) says shared buffers across
groups of similar objects are "in progress".

## Decision

Stay on three r186. Carry patch 17 for lever A (this PR; Bryce chose "Small patch", then
"Patch now!!" in the OrchA 31 session). Lever B is next: a `BundleGroup` trial on TLX's
static batches, measured with the PERF-TLX-WEBGPU census (submit and `writeBuffer`
counts) before and after. Re-check r187 when it ships: patch 15 retires there, and patch
17 retires if #30560-era work or the §4 upstream ask lands.

Not checked: Filament, Bevy/wgpu, Galacean, Orillusion. Each would be a full rewrite.

Open question: `PERF-IPHONE-AUDIT-2026-10-21.md` line 81 calls webgl2 the iPhone path,
while the fleet memory says Bryce plays THREE PATH: WEBGPU. If the audit is right, #3679
already covers his phone and this patch covers the WebGPU users.
