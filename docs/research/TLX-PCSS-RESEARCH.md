# TLX PCSS — how to close the one stubbed shadow gap (research, 2026-08-17)

> Errata: the vendored three has since moved to `vendor/three-0.185.1/`;
> read `three-0.184.0` below as the version at research time.

TLX's only deliberately-stubbed subsystem is PCSS (`TODO M4-PCSS`,
`js/render/three/tlx-shadow.js` header): GLX builds a 512² R16F min-of-4
blocker map by re-reading the sun depth map through a COMPARE-OFF sampler
object, and three has no per-use sampler override — `pcss()` returns false and
`tsl-lit.js` runs a fixed penumbra radius (R = 3.0) instead of the
blocker-scaled `mix(1.5, 6.0, pen)`.

Researched via the tinyfish MCP (search + fetch) plus a direct read of the
vendored `vendor/three-0.184.0/three.webgpu.min.js`. Findings:

## What the vendored r184 build actually does (read, not guessed)

- **GLSL backend declares the sampler type from the TEXTURE, not the node**:
  `r.compareFunction ? "sampler2DShadow" : "sampler2D"` in the uniform
  emitter. Any second TSL node reading the same depth texture also becomes
  `sampler2DShadow` — a plain read of the sun map is impossible on the WebGL2
  backend, and `texelFetch` on a shadow sampler is invalid GLSL, so
  `textureLoad` does not rescue it either.
- **WGSL backend keys the sampler the same way** (`isSampleCompare` =
  `isDepthTexture && compareFunction !== null` → `sampler_comparison`) — BUT
  its `generateTextureLoad` emits `textureLoad(tex, coord, level)`, which in
  WGSL is legal on `texture_depth_2d` and uses NO sampler binding at all.
- Upstream's own PCSS (`examples/webgl_shadowmap_pcss.html`, fetched) does the
  blocker search as 17 poisson-disk plain `texture2D(...).r` taps + the same
  parallel-plane penumbra estimate GLX uses — the algorithm is proven in
  upstream form; only the depth-read transport differs per backend.
- WebGPU validation (confirmed via web search): depth textures cannot be
  SAMPLED with a filtering sampler, but `textureLoad` bypasses samplers
  entirely. r184 also ships pluggable TSL shadow filters
  (`PCFSoftShadowFilter`, `VSMShadowFilter`, …) — not usable by TLX's custom
  `shadowSys`, but VSM shows three's own "depth-as-color second pass" precedent.

## The recommended fix, per backend

- **WebGPU path (three's primary)**: implement the blocker search with
  `TSL.textureLoad` on the EXISTING sun depth texture — zero new passes, zero
  new textures. Either port GLX's 512² min-of-4 downsample as a small
  fragment/compute pass whose reads are all `textureLoad`, or do the
  upstream-style poisson blocker search directly in `tsl-lit.js` (costlier
  per-pixel, simplest wiring). The comparison sampler binding stays declared
  and unused — harmless.
- **WebGL2 fallback path (landed, desktop)**: the sun pass writes `TSL.depth`
  (`ViewportDepthNode` = window depth) into an R16F color attachment on the
  existing sun RT. The 512² blocker downsample `textureLoad`s that color
  (texelFetch is legal; it is not a `sampler2DShadow`). Cadence is still
  `endPass()` on the sun snap-cache redraw. Phones and software GL keep
  `pcssEnabled = false` (fixed `R = 3.0`).
- Two `THREE.Texture` wrappers sharing one `.source` (one with
  `compareFunction`, one without) has NO upstream precedent (searched) and
  fights per-texture GL state on the WebGL backend — rejected.

Gate for whichever lands: `pcss()` must return true only when the blocker
path is live, and the penumbra radius must go back to blocker-scaled
`mix(1.5, 6.0, pen)` in `tsl-lit.js` (three call sites marked TODO M4-PCSS).
