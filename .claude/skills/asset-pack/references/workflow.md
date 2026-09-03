# Asset-pack bake, MAT layers, mistakes

Load this when regenerating the pack, adding a CC0 layer, or chasing a MAT-id
mismatch.

## MAT layers

17 slots — `MAT.FLAT(0)` … `MAT.ASPHALT(16)`. Must match `TrackGeom.MAT`
(`js/track/geom.js`) and `MAT_LAYERS` in both `tools/assets.mjs` and
`js/render/assets.js`. If you change the layer count, `17` is also hardcoded
in `js/render/shaders/lit.js` (`uMatTexScale[17]`, `mid > 16` in `matTexUV()`)
and `js/render/three/tsl-lit.js` (`uniformArray(new Array(17)...)` and the
`for (let i = 0; i < 17; i++)` upload loop). Miss either and the extra
layer's scale silently reads `0.0` (GLX) or is dropped (TLX).

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

2. **Regenerate synthetic pack** (no network):
   ```sh
   node tools/assets.mjs bake-synthetic
   node tools/assets.mjs verify
   ```
   `verify` enforces CC0 / **Apex26-Procedural** licence allow-list, per-asset
   md5, manifest consistency, and **8 MB** total budget.

3. **A/B the blend** without reloading JS:
   ```js
   __apex.matTex(0)   // procedural-only
   __apex.matTex(1)   // full baked detail (triggers load if needed)
   ```
   Blend is **multiplicative** — per-track tarmac tint and racing-line wear
   survive.

4. **Slice a generated 4×4 atlas** onto scenery MAT slots (keeps the
   Poly Haven ASPHALT racing-surface layer; every other slot is generated):
   ```sh
   node tools/assets.mjs bake-atlas --preset generated
   node tools/assets.mjs verify
   ```
   Sources live in `assets/atlases/`. `--map BRICK=1,0` patches one tile;
   `ATLAS_PRESETS.generated` in `tools/assets.mjs` is the committed mapping.

5. **Add a real CC0 layer** — manifest shape in
   `docs/research/ASSET-API-RESEARCH.md`; run `verify`; confirm MAT id and
   `scale` (world metres per tile — there is no `worldTile` field; the
   manifest and `tools/assets.mjs` `SCALES` table both call it `scale`).

6. **Validate**:
   ```sh
   npm run test:tooling-fast
   node tools/test-bg.mjs hooks
   ```
   Visual: **lighting-tuner** or **webgl-debug** / **webgpu-debug** on a track
   with varied surfaces.

7. **Ship** — commit `assets/pack/` when regenerated. Bump `?v=N` +
   `version.json` only if you changed `js/` or `css/` (`node tools/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`)). Pack
   URLs rely on SW cache generation + revalidation, not shell `?v=`.

## Common mistakes

- Assuming upload alone changes the render — `matTexMix` must be > 0
  (shipped default 1.0). At 0 the pack may not download.
- Treating WGX `supported: false` as "WGX has no arrays" — check
  `createTextureArray` on the live device and `__apex.assets()`.
- MAT id drift — grep `TrackGeom.MAT`, `tools/assets.mjs` `MAT`, and
  manifest `layers` together.
- Baking GLASS/FLAG/FLAT.
- Skipping `verify` — licence or md5 drift fails CI via
  `tests/unit/assets-pack.test.mjs`.
- Bumping `?v=` for pack-only changes.
- Rebaking during Playwright — SW + HTTP cache can serve the old pack.
- Expecting normal maps on mobile tier — check `__apex.assets().tier`.
