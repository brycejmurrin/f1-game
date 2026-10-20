# Garage perf census — body meshes + finishes (B·L24, 2026-10-20)

Bryce (06:36Z, via OrchB 21): "my garage is pretty laggy" after wave 1 (#3145),
resized bodies (#3160) and wave 2 (#3169, finishes 60–85). The baseline is
`c2902ca6` (the first parent of #3145's merge `8b3a2ea2`); the tip is `06c131b7`.

Probe: `node tools/perf/garage-census.mjs [--root <worktree>]`. TLX (the shipped
default) with GL forced, 844×390, SwiftShader. Frame times here measure this
container's CPU, not a phone GPU: the COUNTS (programs, shader source bytes,
tris, build ms) are the evidence. The gl.finish column is a fragment-cost proxy
between two trees only.

## Measured (tip vs baseline)

| metric | baseline | tip | delta |
|---|---|---|---|
| lit uber-shader fragment source (TLX, both lit programs) | 91.7 KB / 86.9 KB | 105.3 KB / 100.5 KB | +13.6 KB each (+15 %) |
| programs linked on garage open | 6 | 6 | 0 |
| compile ms on open (SwiftShader) | 1402 | 1494 | +7 % |
| preview car (team body) | 53.4 k verts / 19.4 k tris | 55.2 k / 20.0 k | +3 % |
| Car3D.build, team body (median of 3) | 100 ms | 97 ms | ~0 |
| draws / tris per frame (rAF avg) | 14.7 / 24.5 k | 14.7 / 25.3 k | +3 % tris |
| main-thread ms per frame (median) | 2.1 | 1.8 | ~0 |
| JS heap | 28.6 MB | 29.2 MB | +0.6 MB |
| DOM nodes (whole page) | 15 409 | 15 453 | +44 |

The car is drawn twice every garage frame (the car, and the floor reflection,
`GarageScene.draw` → `MIRROR_RESOLVE`), so every car fragment-shader cost is
paid twice in the bay.

## Findings so far (ranked; detail in the PR body)

1. Finish shader cost is paid by every lit pixel, not only the car: the finish
   anti-alias inputs (`dFdx/dFdy(Ngeo)`, `fwidth(vObjPos)`, a `smoothstep`) run
   unconditionally in `glsl-lit.js` / `tsl-lit.js`, and the program grew 15 %.
2. A livery-editor tap on an atlas-only field (crest style / tone / frame, cover
   bind, fin art, grips) rebuilt the whole car: those fields are not in
   `MESH_FREE_DRAFT` (js/garage/setup-sheet.js). Guarded by
   `tests/unit/garage-perf-mesh-free.test.mjs`.
3. A one-off ~3 s shader compile on the first picker change in one census run
   (not reproduced by the link probe) — under investigation.
