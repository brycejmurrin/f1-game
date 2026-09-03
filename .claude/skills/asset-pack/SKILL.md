---
name: asset-pack
description: Use when baking or verifying assets/pack, editing js/render/shared/assets.js or tools/gen/assets.mjs, debugging matTexMix/baked PBR blend, __apex.assets()/matTex(), MAT layer mismatches, or procedural-vs-textured tarmac look on GLX/TLX/WGX.
---

# Baked asset pack

Optional PBR material arrays in `assets/pack/` (albedo+roughness, normal+AO)
indexed by per-vertex **MAT id**, blended over the procedural look via
`matTexMix`. Tool: `tools/gen/assets.mjs`. Loader: `js/render/shared/assets.js`.

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
- Aligning MAT ids across `TrackGeom.MAT`, `tools/gen/assets.mjs`, and shaders.

## When NOT to Use

- Cache-busting shell assets — the pack has **no `?v=`**; `node tools/gen/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`) is
  for `js/`/`css/`/`index.html` tags only.
- Mid-test-run pack edits — SW is cache-first (same class as not bumping
  `version.json` mid-run).
- Lighting-only tweaks with no pack change → **lighting-tuner**.

| Command / hook | Role |
|---|---|
| `node tools/gen/assets.mjs bake-synthetic` | Regenerate pack, no network |
| `node tools/gen/assets.mjs verify` | Licence allow-list, md5, 8 MB budget |
| `__apex.assets()` | `{ supported, pack, uploaded, tier, layers, error, … }` |
| `__apex.matTex(v?)` | Blend 0..1; same as `lightTune({ matTexMix })` |

```sh
npm run test:tooling-fast
node tools/ci/test-bg.mjs hooks
```

Related: `node tools/gen/gen-shell.mjs --check` (check-changes/references/bump.md), **webgl-debug**, **webgpu-debug**, **lighting-tuner**.

## Load on demand

- MAT 17-slot lockstep, bake/A/B, mistakes →
  [references/workflow.md](references/workflow.md).
