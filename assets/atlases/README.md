# Generated material atlases

Author-time 4×4 albedo / normal sheets for
`node tools/gen/assets.mjs bake-atlas --preset generated`.

The game never fetches these files. Runtime sampling goes through the baked
filmstrips in `assets/pack/` (`mat-albedo-*.png`, `mat-normal-*.png`).

**Provenance: AI-generated, not procedural.** Every PNG here carries a C2PA
manifest naming OpenAI's image service (`gpt-image`, digital source type
`trainedAlgorithmicMedia`, signer OpenAI OpCo, LLC). They were generated for this
project; they are not the output of `tools/gen/assets.mjs`. Licence id
**LicenseRef-AI-Generated-OpenAI** (`ATLAS_PROVENANCE` in `tools/gen/assets.mjs`):
use is governed by OpenAI's terms for generated output, and whether such output
carries copyright at all is unsettled. Not known: the prompts used and who ran
them. A layer baked from these sheets is labelled with that id, so
`tests/unit/assets-pack.test.mjs` (which allows only CC0 / procedural layers in
the shipped pack) refuses it until the owner decides. As of 2026-11-10 the
shipped pack holds no layer baked from these sheets.

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
