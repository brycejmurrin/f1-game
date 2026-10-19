# WebGPU (WGX) screenshot gallery

Committed captures from `node tools/gfx/wgx-shot.mjs --gallery --lite` (or
`npm run wgx:gallery`) on the software WebGPU compositor path (`apex26.gfxWgxAllowSoftware=1`). Every frame:
`backend: webgpu`, `gpuErrors: 0`.

| File | Track | Camera |
|------|-------|--------|
| `montreal.png` | Montreal | orbit |
| `montreal-eye.png` | Montreal | eye |
| `singapore.png` | Singapore (night) | orbit |
| `vegas.png` | Las Vegas (night) | orbit |
| `spa.png` | Spa | orbit |
| `monaco-eye.png` | Monaco | eye |
| `bahrain.png` | Bahrain | orbit |

Manifest: [`../wgx-gallery-manifest.json`](../wgx-gallery-manifest.json).
Fresh diagnostic captures: `npm run wgx:gallery` or
`node tools/gfx/wgx-shot.mjs --gallery --lite --out artifacts/wgx-gallery`.
Each run writes its images, state and `manifest.json` only to its output directory;
it does not refresh this retained historical gallery or its manifest.

Publish selected new evidence through the explicit workflow in
[EVIDENCE-STORAGE.md](../../EVIDENCE-STORAGE.md), then deliberately update the
reference links and provenance together after review.
