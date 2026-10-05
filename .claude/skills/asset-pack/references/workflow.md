# Asset-pack bake, MAT layers, mistakes

Load this when regenerating the pack, adding a CC0 layer, or chasing a MAT-id
mismatch.

## Contents
- MAT layers
- Workflow
- One material garbled on ONE backend (e.g. grass, TLX only)
- Common mistakes

## MAT layers

17 slots — `MAT.FLAT(0)` … `MAT.ASPHALT(16)`. Must match `TrackGeom.MAT`
(`js/track/core/geom.js`) and `MAT_LAYERS` in both `tools/gen/assets.mjs` and
`js/render/shared/assets.js`. If you change the layer count, `17` is also hardcoded
in `js/render/glx/shaders/glsl-lit.js` (`uMatTexScale[17]`, `mid > 16` in `matTexUV()`),
`js/render/glx/glx.js` (`MAT_TEX_LAYERS`), `js/render/three/tsl-lit.js`
(`uniformArray(Array(17).fill(0))` and the `for (let i = 0; i < 17; i++)` upload
loop), `js/render/three/tlx.js` (`grey()` placeholders and `layers || 17`) and
`js/render/webgpu/` (`wgx.js` `MAT_TEX_LAYERS`; `wgsl-chunks.js` `MatScaleU`
`array<vec4<f32>, 5>` and `mid > 16`). Miss one and the extra layer's scale
silently reads `0.0` (GLX) or is dropped (TLX/WGX).

**Never bake:** `GLASS`, `FLAG`, `FLAT` — glass needs mirror read; flags are
vertex-displaced; FLAT is the no-material id.

**Backends:** GLX, TLX, **and WGX** implement `createTextureArray` /
`setMaterialMaps` / `matTexMix` (WGX parity 2026-08). A `supported: false` on
WGX is a device/feature miss, not "WGX has no arrays."

## Workflow

1. **Inspect live state** after a track load:
   ```js
   __apex.assets()
   __apex.matTex()
   __apex.lightTune({ matTexMix: 0.5 })
   ```

2. **Check the pack offline** (Node only, ~2 s, writes nothing; expect
   `verify: OK`, ~4.1 MB of 8 MB; `tests/unit/assets-pack.test.mjs` is the
   43-test guard incl. MAT-id lockstep) — or **regenerate synthetic pack**
   (no network; rewrites `assets/pack/`, `git checkout -- assets/pack` undoes):
   ```sh
   node tools/gen/assets.mjs bake-synthetic
   node tools/gen/assets.mjs verify
   ```
   `verify` enforces CC0 / **Apex26-Procedural** licence allow-list, recorded model/material-strip hashes, PNG decodability/dimensions,
   high/low tier licence/MAT/scale consistency, and **8 MB** total budget.

3. **A/B the blend** without reloading JS (BROWSER-ONLY: `__apex` needs a live
   page — `mcp-probe`, or `apex_eval`; no Node-VM route). Tarmac is MAT 16, so
   `matTex(0)` vs `matTex(1)` on any track is the textured-vs-procedural tarmac
   A/B; confirm `__apex.assets()` reads `supported:true, uploaded:true` first,
   else both arms are procedural and the A/B proves nothing:
   ```js
   __apex.matTex(0)   // procedural-only
   __apex.matTex(1)   // full baked detail (triggers load if needed)
   ```
   Blend is **multiplicative** — per-track tarmac tint and racing-line wear
   survive.

4. **Slice a generated 4×4 atlas** onto scenery MAT slots (`bake-atlas`
   leaves ASPHALT unmapped; NB the committed manifest currently lists all 14
   layers, ASPHALT included, as `Apex26-Procedural` — no Poly Haven layer is
   in the pack today, whatever the `assets.mjs` header comment says):
   ```sh
   node tools/gen/assets.mjs bake-atlas --preset generated
   node tools/gen/assets.mjs verify
   ```
   Sources live in `assets/atlases/`. `--map BRICK=1,0` patches one tile;
   `ATLAS_PRESETS.generated` in `tools/gen/assets.mjs` is the committed mapping.

5. **Add a real CC0 layer** — manifest shape in
   `docs/research/ASSET-API-RESEARCH.md`; run `verify`; confirm MAT id and
   `scale` (world metres per tile — there is no `worldTile` field; the
   manifest and `tools/gen/assets.mjs` `SCALES` table both call it `scale`).

6. **Validate**:
   ```sh
   npm run test:tooling-fast
   node tools/ci/test-bg.mjs hooks   # whole browser group (10-40 min); a lone `npm test -- tests/specs/assets-api.spec.js` is the pack's own spec
   ```
   Visual: **lighting-tuner** or **webgl-debug** / **webgpu-debug** on a track
   with varied surfaces.

7. **Ship** — commit `assets/pack/` when regenerated. There is nothing to
   bump: committed shell tags stay `?v=dev` and the deploy stamps content
   hashes ([shell/cache](../../check-changes/references/bump.md)); run
   `node tools/gen/gen-shell.mjs --check` if you touched `js/` or `css/`. Pack
   URLs rely on SW cache generation + revalidation, not shell `?v=`.

## One material garbled on ONE backend (e.g. grass, TLX only)

Static trace, no browser (line anchors drift — grep the names). Every backend
does `tex = array[layer = MAT id]`, `uv = wp.xz / scale[mid]` (wall-like ids
1,2,4,5,7,12,13,14 use `(wp.x|wp.z, wp.y)`), `albedo * tex.rgb * 2`, only for
mid 1..16 with scale > 0 — the same numbers in `glsl-lit.js` `matTexUV`,
`wgsl-chunks.js` `matTexUV`/`matUvLit`, `tsl-lit.js` `matTexUV`/`matTexLayer`.
Diff these seams, in order:
1. **Layer index**: TLX `surfaceId = floor(matA + 0.5)` where `matA` is a SMOOTH
   `attribute("mat")` (GLX/WGX: `flat vMat`), so a triangle spanning two
   materials interpolates the id and samples a neighbouring layer; then
   `.depth(int(matTexLayer(mid)))` truncates. First suspect for mixed-id seams.
2. **Sampling state** (`tlx.js` `createTextureArray` vs the 1x1 placeholders
   `grey()`): repeat wrap, LinearMipmapLinear, aniso 4 must match or WGSL
   compiles a `textureLoad` edge-texel read (flat grass/asphalt on WebGPU).
   Pinned by `gfx-backend-canary.test.mjs` "TLX placeholder material arrays…".
3. **Pixel bytes**: TLX reads the PNGs back through a scratch WebGL2 context
   (`readbackTextureLayers`; 2d-canvas readback is colour-managed and neutralises
   the pack). A wrong-but-not-flat pack = check FLIP_Y false there and in GLX/WGX.
4. **Bake side**: the layer itself (`tools/gen/assets.mjs` GRASS row of
   `ATLAS_PRESETS.generated`, `SCALES`). If GLX/WGX look right it is not this.

Parity gates (all static): `tests/unit/assets-pack.test.mjs` (MAT_LAYERS /
`uMatTexScale[17]` / manifest ids; backend layer allocation/upload invariants are pinned in the updated
asset/renderer contracts; inspect GLX/TLX/WGX together when changing MAT count), the canary tests
above and `webgpu-lifecycle.test.mjs` (WGX `textureSample` uniform-CF).
Per-backend pixel truth is BROWSER-ONLY: `matTex(0)` vs `matTex(1)` per
backend, `__apex.assets()` `uploaded:true`. Record which of 1-4 was ruled out.

## Common mistakes

- Assuming upload alone changes the render — `matTexMix` must be > 0
  (shipped default 1.0). The pack is fetched at boot regardless (game.js
  `Assets.load()`); at 0 it is uploaded but blends nothing.
- Treating WGX `supported: false` as "WGX has no arrays" — check
  `createTextureArray` on the live device and `__apex.assets()`.
- MAT id drift — grep `TrackGeom.MAT`, `tools/gen/assets.mjs` `MAT`, and
  manifest `layers` together.
- Baking GLASS/FLAG/FLAT.
- Skipping `verify` — licence or md5 drift fails CI via
  `tests/unit/assets-pack.test.mjs`.
- Bumping `?v=` for pack-only changes.
- Rebaking during Playwright — SW + HTTP cache can serve the old pack.
- Expecting normal maps on mobile tier — check `__apex.assets().tier`.
