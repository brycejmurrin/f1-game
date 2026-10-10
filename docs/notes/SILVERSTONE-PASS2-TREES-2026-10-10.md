# Silverstone pass 2 — tree models (not shipped)

Survey (2026-10-09) noted every Silverstone tree is the same procedural
cone/dome. Pass 2 checked importing CC0 trees via `tools/gen/assets.mjs`.

## Sources checked (2026-10-10)

- Poly Haven Public API: https://api.polyhaven.com/assets?type=models
  (docs: https://polyhaven.com/our-api ,
  https://github.com/Poly-Haven/Public-API/blob/master/swagger.yml).
  Assets are CC0 (https://polyhaven.com/license). Live API use asks for a
  "Powered by Poly Haven" credit; baking a one-shot download into
  `assets/pack/` is not a live integration.
- CLI: `node tools/gen/assets.mjs search models tree` (type must be
  `models` / `textures` / `hdris` — bare `search tree` 400s).

## Why not baked

| id | polycount | note |
|---|---|---|
| fir_sapling | 433 021 | smallest live fir |
| pine_sapling_small | 398 144 | smallest live pine |
| tree_small_02 | 4 652 585 | |
| fir_tree_01 | 7 853 731 | |
| pine_tree_01 | 17 427 094 | |

Kenney / Racing Kit scenery bins in this pack are ~4–65 KB. A 400 k-tri
tree (before textures) would dominate the 8 MB pack budget
(`assets.mjs verify` was ~4.1 / 8 MB clean). There is no decimation step
in `bake-model` today.

## Follow-up

Ship a low-poly CC0 oak/ash set (or add a bake-time decimate) before
replacing Silverstone's procedural `broadleafFall` / `plane` rows. Until
then the understorey bushes from pass 1 remain the vegetation variety
lever.
