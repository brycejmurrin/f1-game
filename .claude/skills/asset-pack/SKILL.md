---
name: asset-pack
description: Use when baking or verifying assets/pack, editing js/render/assets.js or tools/assets.mjs, debugging matTexMix/baked PBR blend, __apex.assets()/matTex(), MAT layer mismatches, or procedural-vs-textured tarmac look on GLX/TLX/WGX.
---

# Baked asset pack

Optional PBR material arrays in `assets/pack/` (albedo+roughness, normal+AO)
indexed by per-vertex **MAT id**, blended over the procedural look via
`matTexMix`. Tool: `tools/assets.mjs`. Loader: `js/render/assets.js`.

Every failure degrades to **pure procedural** — no pack, bad manifest, decode
error, or a backend without `createTextureArray` never breaks boot. Deep
reference: `docs/research/ASSET-API-RESEARCH.md`.

**GLX, TLX, and WGX all implement the arrays.** A WGX `supported: false` is a
device/feature miss, not "WGX has no pack."

## When to Use

- Regenerating the pack (`bake-synthetic`) or adding CC0 scan layers.
- Licence/hash/size guards (`verify`).
- Invisible / wrong / not-loading baked materials.
- Tuning `matTexMix` / `__apex.matTex` or tier (`low`/`high`).
- Aligning MAT ids across `TrackGeom.MAT`, `tools/assets.mjs`, and shaders.

## When NOT to Use

- Cache-busting shell assets — the pack has **no `?v=`**; **bump-cache** is
  for `js/`/`css/`/`index.html` tags only.
- Mid-test-run pack edits — SW is cache-first (same class as not bumping
  `version.json` mid-run).
- Lighting-only tweaks with no pack change → **lighting-tuner**.

| Command / hook | Role |
|---|---|
<<<<<<< HEAD
| `node tools/assets.mjs bake-synthetic` | Regenerate pack, no network |
=======
| `node tools/assets.mjs bake-synthetic [--size N] [--models]` | Regenerate pack, no network/deps (default: 256+128). `--models` also rebuilds AX26 scenery models. |
| `node tools/assets.mjs bake-synthetic-models` | Replace pack models with procedural AX26 meshes (same ids as circuit `bakedModel()` calls) |
>>>>>>> origin/cursor/synthetic-models-4d65
| `node tools/assets.mjs verify` | Licence allow-list, md5, 8 MB budget |
| `./tools/apex-tools-mcp.sh call apex_assets_verify '{}'` | Same pin; never bake |
| `__apex.assets()` | `{ supported, pack, uploaded, tier, layers, error, … }` |
| `__apex.matTex(v?)` | Blend 0..1; same as `lightTune({ matTexMix })` |

```sh
npm run test:tooling-fast
node tools/test-bg.mjs api
```

Related: **bump-cache**, **webgl-debug**, **webgpu-debug**, **lighting-tuner**.

## Load on demand

- MAT 17-slot lockstep, bake/A/B, mistakes →
  [references/workflow.md](references/workflow.md).
