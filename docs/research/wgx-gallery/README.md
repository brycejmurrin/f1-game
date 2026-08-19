# WebGPU (WGX) screenshot gallery

Committed captures from `node tools/wgx-shot.mjs --gallery --lite` (or
`npm run wgx:gallery`) on the software WebGPU compositor path
WebGPU compositor path (`apex26.gfxWgxAllowSoftware=1`). Every frame:
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
Regenerate: `npm run wgx:gallery` or `node tools/wgx-shot.mjs --gallery --lite`.
