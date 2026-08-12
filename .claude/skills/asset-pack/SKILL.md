---
name: asset-pack
description: Use when baking or verifying assets/pack, editing js/render/assets.js or tools/assets.mjs, debugging matTexMix/baked PBR blend, __apex.assets()/matTex(), MAT layer mismatches, or procedural-vs-textured tarmac look on GLX/TLX.
---

## Overview

The optional **baked asset pack** (`assets/pack/`) adds PBR material arrays
(albedo+roughness, normal+AO) indexed by per-vertex **MAT id**, blended over the
procedural look via `matTexMix`. Offline tool: `tools/assets.mjs`. Runtime loader:
`js/render/assets.js`.

Every failure path degrades to **pure procedural** — no pack, bad manifest, decode
error, or backend without `createTextureArray` never breaks boot.

Deep reference: `docs/research/ASSET-API-RESEARCH.md`. Hooks:
`docs/DEBUG-HOOKS.md` (assets / matTex).

## When to Use

- Regenerating the committed pack (`bake-synthetic`) or adding CC0 scan layers.
- Running licence/hash/size guards before commit (`verify`).
- Debugging why baked materials are invisible, wrong, or not loading.
- Tuning the blend knob (`matTexMix` / `__apex.matTex`) or tier (`low`/`high`).
- Aligning MAT ids between `TrackGeom.MAT`, `tools/assets.mjs`, and shader upload.

## When NOT to Use

- **WebGPU / WGX backend** — no `createTextureArray`; `matTexMix` is inert and
  the look stays procedural (`docs/ARCHITECTURE.md`). Reproduce:
  `localStorage.setItem("apex26.gfxBackend","webgpu")` → reload →
  `__apex.assets().supported` should be `false`.
- **Cache-busting shell assets** — the pack has **no `?v=`** on URLs; use
  **bump-cache** only for `js/`/`css/`/`index.html` script tags, not pack files.
- **Mid-test-run pack edits** — SW is cache-first on fetch; rebaking during a
  Playwright group causes stale-pack confusion (same class of rule as not bumping
  `version.json` mid-run).
- **Lighting-only tweaks** with no pack change — use **lighting-tuner**; reach
  here only when `matTexMix` or pack content is involved.

## Quick Reference

| Command | Role |
|---|---|
| `node tools/assets.mjs bake-synthetic [--size N]` | Regenerate pack, no network/deps (default: 256+128) |
| `node tools/assets.mjs verify` | Licence allow-list, md5, 8 MB budget |
| `npm run test:tooling-fast` | Includes `tests/unit/assets-pack.test.mjs` |
| `npm run test:api` | Includes `tests/specs/assets-api.spec.js` |

| Runtime | Role |
|---|---|
| `Assets.init(gfx)` | Bind active renderer (GLX / TLX) |
| `Assets.load({ tier })` | Fetch manifest + upload arrays (async, non-blocking boot) |
| `Assets.supported()` | `createTextureArray` + `setMaterialMaps` present |
| Blend | `TUNE_DEFS matTexMix` — **default 1.0** (full baked detail when pack loads) |

| Hook | Role |
|---|---|
| `__apex.assets()` | `{ supported, pack, uploaded, tier, layers, bytes, error, … }` |
| `__apex.assetLoad(tier?)` | Force (re)load; `"low"` / `"high"` |
| `__apex.matTex(v?)` | Get/set blend 0..1; same as `lightTune({ matTexMix })` |

**MAT layers:** 17 slots — `MAT.FLAT(0)` … `MAT.ASPHALT(16)`. Must match
`TrackGeom.MAT` (`js/track/geom.js`) and `MAT_LAYERS` in both `assets.mjs` and
`assets.js`. **If you ever change the layer count**, `MAT_LAYERS`/`17` is also
hardcoded (not read from a shared constant) in `js/render/shaders/lit.js`
(`uMatTexScale[17]` and the `mid > 16` range check in `matTexUV()`) and in
`js/render/three/tsl-lit.js` (`uniformArray(new Array(17)...)` and the
`for (let i = 0; i < 17; i++)` upload loop) — miss either and the extra
layer's scale silently reads `0.0` (GLX) or is dropped (TLX), which is
indistinguishable from a pack that never uploaded.

**Never bake:** `GLASS`, `FLAG`, `FLAT` — glass needs mirror read; flags are
vertex-displaced in shader; FLAT is the no-material id.

**Backends:** GLX (WebGL2) and TLX (three) implement material arrays; WGX does not.

## Workflow

1. **Inspect live state** (GLX/TLX, after a track load):
   ```js
   __apex.assets()
   __apex.matTex()          // 1.0 = full blend when pack uploaded
   __apex.lightTune({ matTexMix: 0.5 })   // same knob via tuner
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
   __apex.matTex(0)   // procedural-only look
   __apex.matTex(1)   // full baked detail (triggers load if needed)
   ```
   Blend is **multiplicative** — per-track tarmac tint and racing-line wear survive.

4. **Add a real CC0 layer** — follow the manifest shape in
   `docs/research/ASSET-API-RESEARCH.md`; run `verify`; confirm MAT id and
   `scale` (world metres per tile — there is no `worldTile` field; the
   manifest and `tools/assets.mjs`'s `SCALES` table both call it `scale`) match.

5. **Validate**:
   ```sh
   npm run test:tooling-fast
   npm run test:api
   ```
   For visual confirmation, **lighting-tuner** or **webgl-debug** on a track with
   varied surfaces (street + grass + asphalt).

6. **Ship** — commit `assets/pack/` when regenerated. Bump `?v=N` + `version.json`
   only if you changed `js/` or `css/` (**bump-cache**). Pack URLs rely on SW
   cache generation + normal revalidation, not shell `?v=`.

## Common Mistakes

- **Assuming load changes the render** — upload alone is not enough; `matTexMix`
  must be > 0 (shipped default 1.0). At 0 the pack may not download at all.
- **Testing on WGX** — `supported: false` is expected; not a pack bug.
- **MAT id drift** — a layer baked at the wrong index tints the wrong surface;
  grep `TrackGeom.MAT`, `tools/assets.mjs` `MAT`, and manifest `layers` together.
- **Baking GLASS/FLAG/FLAT** — breaks glass reflection read or flag shader; excluded
  by design in `assets.mjs`.
- **Skipping `verify`** — licence or md5 drift fails CI via `assets-pack.test.mjs`.
- **Bumping `?v=` for pack-only changes** — unnecessary for pack files; confuses
  PWA shell reload semantics without updating pack cache.
- **Rebaking during Playwright** — service worker + HTTP cache can serve the old
  pack to an in-flight run; finish tests first.
- **Expecting normal maps on mobile tier** — check manifest tier flags and
  `__apex.assets().tier`; low tier may omit normal strips.

## Related skills

- **bump-cache** — version bump for `js/`/`css/` only, not `assets/pack/`.
- **webgl-debug** — `createTextureArray`, shader `uMatTexMix`, GL upload errors.
- **lighting-tuner** — live `matTexMix` slider, per-profile preset bake.
