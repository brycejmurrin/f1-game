# Depth-only shadow RT — gated on three r187 (2026-10-28)

Issue #2649 remaining slice: phone sun shadow target without the R8 colour attachment.

## Tip state (vendored `three@0.186.1`, REVISION `"186"`)

`makeDepthTarget` in `js/render/three/tlx-shadow.js` still allocates R8 colour for every non-PCSS map.
WebGPU discards that store (`apexDiscardColor` / patch 17); WebGL2 calls `discardColor` after the depth pass.
Counted oracle: `shadowSys.S.sunColorBytes === SUN_SIZE²` (1 048 576 on a phone 1024² map) and
`S.depthOnly === false` while `+(THREE.REVISION) < 187`.

## Gate

three.js #34782 (`RenderTarget({ count: 0 })`) is on `dev` for r187 and is **not** in npm `latest`
(`0.186.1` as of 2026-10-28). The code path is:

```js
if (!hdrColor && +(THREE.REVISION || 0) >= 187) {
  return new THREE.RenderTarget(size, size, { depthTexture, count: 0 });
}
```

When an official `0.187.x` is vendored, `S.depthOnly` becomes true and `S.sunColorBytes` drops to 0 for the
non-PCSS maps (PCSS still needs its R32F colour). No vendor bump in this PR (FORBIDDEN: manifest / three
upgrade is out of lane).

## A/B

No fps A/B until r187 is on tip — the attachment is already store-discarded on WebGPU, so the remaining win is
allocation + tile clear (~1 MB phone sun), not a measured frame-time floor on SoftGL. Recorded as **deferred**,
not a negative on the idea.
