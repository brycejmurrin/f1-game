---
name: garage-parts-livery
description: Use when editing the GARAGE parts catalog, livery/finish/shark fin, SIGNATURE or FACTORY_PRESETS meshes, ersProfile/aeroLoad, career owned-part UI, or Car3D visual recipes. Isolated studio renders → car-viewer; on-track handling → tune-physics.
---

# Garage — parts, livery, and car mesh

The GARAGE (`#carsetup`, `js/game/setup-ui.js`) is who you are, what you drive
(12 categories + 600 cr), and how it looks. Catalog: `js/car/parts.js`. Paint:
`js/car/liveries.js` + `js/car/liverytex.js`. Geometry: `js/car/car3d.js`.

`Parts.CATALOG` is an **ordered array**, not a keyed map. `Parts.getMods`
returns four stat multipliers; `getVisualTiers()` feeds `Car3D.build`.
**SIGNATURE** (`tag: "SIGNATURE"`, `teams: [id]`) is a cost/physics-identical
clone of `equivalent` — mesh only. **`FACTORY_PRESETS`** drives **AI meshes
only**. ERS/aero axes derive from the catalog (`ersProfile` / `aeroLoad`); a
car with no parts (every AI) sits at the midpoint. Livery finish is
`finish: "gloss" | "satin" | "chrome"` via `Car3D.FINISH_SURFACE`. Shark fin:
`fin` (plate, defaults to `c2`) and `finArt` (must contrast or it vanishes).
The mark takes TWO livery colours: `logo` is the dominant shape, `logo2` its
second colour — and `logo2` resolves to a different SLOT per mark (a backing
plate, a second painted layer, or an outline that exists only once set), so
read `secondSlot` in `js/car/liverytex.js` before assuming which.

## When to Use

- Catalog options, SIGNATURE clones, `FACTORY_PRESETS`, `visual` recipes.
- ERS battery / active-aero load from part choices.
- Career garage: owned parts, budget cap, locked rows, research unlocks.
- Livery schemes, paint finish, fin/finArt, sponsor/number layout.

## When NOT to Use

- Pure driving feel → **tune-physics**. Career economy with no parts edit →
  **career-mode**. Isolated car shots → **car-viewer**. Cache bump →
  **bump-cache**.

## Quick Reference

| Item | Contract |
|---|---|
| Catalog | Ordered 12-category array; budget 600 cr |
| SIGNATURE | Same cost/stats as `equivalent`; mesh-only |
| FACTORY_PRESETS | AI visual setup only |
| `_resolve` | Career-blind; supplier/team lock only |
| Owned gate | UI: `G.careerOwned()` → `Parts.isOptionAvailable` |
| ERS / aero | `ersProfile` / `aeroLoad` → game.js battery / X-mode |
| Finish | `gloss` default; `satin`/`chrome` via `FINISH_SURFACE` |
| `--refl` | Studio dial — **not** in-game chrome finish |

```sh
node tools/test-bg.mjs parts
node tools/test-bg.mjs modes              # research locks / ownership UI — no test:career
node tools/audit-parts.mjs [--cats=engine,aero]
node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme
```

Deep reference: **`docs/PARTS.md`**. Related: **car-viewer**, **career-mode**,
**tune-physics**, **debug-state** (`physState()` for live ERS), **bump-cache**.

## Load on demand

- ERS ids, ownership gate, edit loop, mistakes → [references/workflow.md](references/workflow.md).
