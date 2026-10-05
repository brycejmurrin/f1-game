---
name: asset-pack
description: "Use when baked PBR materials in assets/pack are missing, wrong, garbled, or mismatched in colour or layer (MAT id) on GLX/TLX/WGX, editing js/render/shared/assets.js or tools/gen/assets.mjs, or tuning matTexMix / __apex.assets() / matTex() and the procedural-vs-textured tarmac A/B (sheen/exposure with a pack loaded is lighting-tuner; liveries garage-parts-livery). Black screen or NaN-white with no material involved: renderer-debug."
---

# Baked asset pack

Optional PBR material arrays in `assets/pack/` (albedo+roughness, normal+AO)
indexed by per-vertex **MAT id**, blended over the procedural look via
`matTexMix`. Tool: `tools/gen/assets.mjs`. Loader: `js/render/shared/assets.js`.

Every failure degrades to **pure procedural** — no pack, bad manifest, decode
error, or a backend without `createTextureArray` never breaks boot. Deep
reference: `docs/research/ASSET-API-RESEARCH.md`.

**Step 0, always:** read `__apex.assets()` — `uploaded: false` (or `supported: false`) means
every surface is procedural, so "flat / plasticky / no texture" is a pack-load problem here;
`uploaded: true` with the look still flat is exposure/sheen → **lighting-tuner**.

**A garbled, wrong-layer or wrong-colour material on ANY backend, TLX (`three`, the default) included,
is this skill's workflow** (`references/workflow.md`, one-backend-only trace); other renderer
defects (black canvas, GPU errors, shaders) are **renderer-debug**.

**GLX, TLX, and WGX all implement the arrays.** A WGX `supported: false` is a
device/feature miss, not "WGX has no pack."

## When to Use

- Regenerating the pack (`bake-synthetic`) or adding CC0 scan layers.
- Licence/hash/size guards (`verify`).
- Invisible / wrong / not-loading baked materials.
- Tuning `matTexMix` / `__apex.matTex` or tier (`low`/`high`).
- Aligning MAT ids across `TrackGeom.MAT`, `tools/gen/assets.mjs`, and shaders.

## When NOT to Use

- Cache-busting shell assets — the pack has **no `?v=`**; `node tools/gen/gen-shell.mjs --check` ([shell/cache](../check-changes/references/bump.md)) is
  for `js/`/`css/`/`index.html` tags only.
- Mid-test-run pack edits — SW is cache-first (same class as not bumping
  `version.json` mid-run).
- Lighting-only tweaks with no pack change → **lighting-tuner**.

| Command / hook | Role |
|---|---|
| `node tools/gen/assets.mjs bake-synthetic` | Regenerate pack, no network |
| `node tools/gen/assets.mjs verify` | Licence allow-list, md5, 8 MB budget; read-only, prints `verify: OK` |
| `__apex.assets()` (browser-only) | `{ supported, pack, uploaded, tier, layers, error, … }` |
| `__apex.matTex(v?)` (browser-only) | Blend 0..1; same as `lightTune({ matTexMix })` |

```sh
npm run test:tooling-fast
node tools/ci/test-bg.mjs hooks
```

Related: [shell/cache](../check-changes/references/bump.md), **renderer-debug**, **lighting-tuner**.

## Load on demand

- MAT 17-slot lockstep, bake/A/B, one-backend-only garble trace, mistakes →
  [references/workflow.md](references/workflow.md).
