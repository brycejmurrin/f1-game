---
name: asset-pack
description: "Use when tarmac or grass textures look garbled or wrong, PBR materials (MAT layers, assets/pack, matTexMix) differ between GLX/TLX/WGX, or checking a GLB model or procedural Blender room. Not exposure → lighting-tuner; liveries → garage-parts-livery; other render bugs → renderer-debug."
---

# Baked asset pack

Optional PBR material arrays in `assets/pack/` (albedo+roughness, normal+AO)
indexed by per-vertex **MAT id**, blended over the procedural look via
`matTexMix`. Tool: `tools/gen/assets.mjs`. Loader: `js/render/shared/assets.js`.

The pack's standing facts (ships ON, blend, layer = MAT id, degrade-to-procedural,
the 4 s model wait, all three backends) live in AGENTS.md §Baked asset pack. Deep
reference: `docs/research/ASSET-API-RESEARCH.md`.

**Step 0, always:** read `__apex.assets()` — `uploaded: false` (or `supported: false`) means
every surface is procedural, so "flat / plasticky / no texture" is a pack-load problem here;
`uploaded: true` with the look still flat is exposure/sheen → **lighting-tuner**.

**A garbled, wrong-layer or wrong-colour material on ANY backend, TLX (`three`, the default) included,
is this skill's workflow** (`references/workflow.md`, one-backend-only trace); other renderer
defects (black canvas, GPU errors, shaders) are **renderer-debug**.

A WGX `supported: false` is a device/feature miss, not "WGX has no pack."

**Agents cannot bake.** `.claude/settings.json` denies `node tools/gen/assets.mjs bake*`
(every `bake-*` subcommand); only `verify` runs. A regenerate step is a hand-off:
write the exact command into the PR body for Bryce, or ask him for a grant (in a worker:
`needs-decision` plus one comment, docs/WORKERS.md §7).

## When to Use

- Planning a pack regeneration (`bake-synthetic`, Bryce runs it) or adding CC0 scan layers.
- Validate local glTF/GLB assets or create zero-spend procedural Blender room drafts.
- Licence/hash/size guards (`verify`).
- Invisible / wrong / not-loading baked materials.
- Tuning `matTexMix` / `__apex.matTex` or tier (`high`/`low`; `off` = the pack failed or the backend is unsupported, read `error`; `browser-bake` = layers baked in the browser by `adopt()` in `assets.js`, not the shipped PNGs).
- Aligning MAT ids across `TrackGeom.MAT`, `tools/gen/assets.mjs`, and shaders.

## When NOT to Use

- Cache-busting shell assets — the pack has **no `?v=`**; `node tools/gen/gen-shell.mjs --check` ([shell/cache](../check-changes/references/bump.md)) is
  for `js/`/`css/`/`index.html` tags only.
- Mid-test-run pack edits — SW is cache-first (same class as not bumping
  `version.json` mid-run).
- Lighting-only tweaks with no pack change → **lighting-tuner**.

| Command / hook | Role |
|---|---|
| `node tools/gen/assets.mjs bake-synthetic` | Regenerate pack, no network (Bryce runs it) |
| `node tools/gen/assets.mjs verify` | Licence allow-list, md5, 8 MB budget; read-only, prints `verify: OK` |
| `__apex.assets()` (browser-only) | `{ supported, pack, uploaded, tier, layers, error, … }` |
| `__apex.matTex(v?)` (browser-only) | Blend 0..1; same as `lightTune({ matTexMix })` |

Verify: AGENTS.md loop; the pack's own spec is `tests/specs/assets-api.spec.js` (workflow step 6).

Related: [shell/cache](../check-changes/references/bump.md), **renderer-debug**, **lighting-tuner**.

## Load on demand

- MAT 17-slot lockstep, bake/A/B, one-backend-only garble trace, mistakes →
  [references/workflow.md](references/workflow.md).

## Local 3D authoring and interchange

For zero-spend procedural room drafts and validation of exported glTF assets,
use the project adapter in [free design tooling](../../../docs/DESIGN-TOOLS.md).
This extends authoring evidence, not the baked material-array loader. Preserve
Function/Form/Runtime review gates; primitive drafts are not final assets.
