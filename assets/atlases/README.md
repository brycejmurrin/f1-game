# Generated material atlases

Author-time 4×4 albedo / normal sheets for
`node tools/gen/assets.mjs bake-atlas --preset generated`.

The game never fetches these files. Runtime sampling goes through the baked
filmstrips in `assets/pack/` (`mat-albedo-*.png`, `mat-normal-*.png`). Licence
is **Apex26-Procedural**.

| file | role |
|---|---|
| `atlas-arch-albedo.png` | masonry, metal, roof, rust, cobbles, herringbone |
| `atlas-arch-normal.png` | matching architectural relief |
| `atlas-nature-albedo.png` | foliage, grass, sand, rock |
| `atlas-organic-normal.png` | grain / pore detail for organic slots |
| `atlas-variety-albedo.png` | wood, cloth, snow, and extra hard-surface tiles |
| `atlas-variety-normal.png` | matching grain / weave / drift relief |

Tile → `MAT` mapping lives in `ATLAS_PRESETS.generated` in `tools/gen/assets.mjs`.
**ASPHALT is not in these sheets** — it comes from the baked pack's own layer
(MAT 16, procedural; `assets/pack/CREDITS.md`). These atlases carry no tarmac.
