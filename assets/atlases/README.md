# Generated material atlases

Author-time 4×4 albedo / normal sheets for
`node tools/assets.mjs bake-atlas --preset generated`.

The game never fetches these files. Runtime sampling goes through the baked
filmstrips in `assets/pack/` (`mat-albedo-*.png`, `mat-normal-*.png`). Licence
is **Apex26-Procedural**.

| file | role |
|---|---|
| `atlas-arch-albedo.png` | masonry, metal, roof, rust, cobbles |
| `atlas-arch-normal.png` | matching architectural relief |
| `atlas-nature-albedo.png` | foliage, grass, sand, rock |
| `atlas-organic-normal.png` | grain / pore detail for organic slots |

Tile → `MAT` mapping lives in `ATLAS_PRESETS.generated` in `tools/assets.mjs`.
ASPHALT, WOOD, FABRIC, and SNOW stay on the Poly Haven photoscans — these
sheets have no tarmac, wood albedo, cloth, or snow.
