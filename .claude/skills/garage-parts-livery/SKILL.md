---
name: garage-parts-livery
description: Use when editing the GARAGE parts catalog, livery/finish/shark fin, SIGNATURE or FACTORY_PRESETS meshes, ersProfile/aeroLoad, career owned-part UI, or Car3D visual recipes. Isolated studio renders → playwright-probe; on-track handling → tune-physics.
---

# Garage — parts, livery, and car mesh

The GARAGE (`#carsetup`, `js/garage/setup-sheet.js`) is who you are, what you drive
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
The mark takes up to THREE livery colours and the editor asks
`LiveryTex.markSlots(teamId)` how many and what to call them — never assume a
length. `logo` is the dominant shape; `logo2` is the mark's second SHAPE and
resolves to a different slot per mark (a backing plate/disc, a second traced
layer, or a same-ink island — `secondSlot` in `js/car/liverytex.js` decides,
and the four single-loop silhouettes offer no `logo2` row at all); `logo3` is
the OUTLINE, offered on every mark and opt-in everywhere. Red Bull's backing is
authored geometry (`CREST_DISC`), not traced: the gold cluster traces to the
union of the sun and both bulls, so painting it drew a rim and no sun.
The garage wall crest is the same `drawCrest`, but it picks its OWN field, so
it asks `LiveryTex.markOnField` what lands there — the BACKING when a mark has
one, never just the mark. `ALT_INSIDE` names the marks whose second colour is
drawn inside the mark and so answers to the mark alone.

## When to Use

- Catalog options, SIGNATURE clones, `FACTORY_PRESETS`, `visual` recipes.
- ERS battery / active-aero load from part choices.
- Career garage: owned parts, budget cap, locked rows, research unlocks.
- Livery schemes, paint finish, fin/finArt, sponsor/number layout.

## When NOT to Use

- Pure driving feel → **tune-physics**. Career economy with no parts edit →
  **career-mode**. Isolated car shots → **playwright-probe** (`references/car-studio.md`). Cache bump →
  `node tools/gen/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`).

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
node tools/ci/test-bg.mjs car
node tools/ci/test-bg.mjs modes              # research locks / ownership UI — no test:career
node tools/car/audit-parts.mjs [--cats=engine,aero]
node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme
```

Deep reference: **`../../../docs/CAREER.md`**. Related: **playwright-probe**, **career-mode**,
**tune-physics**, **agent-view** `references/state.md` (`physState()` for live ERS), `node tools/gen/gen-shell.mjs --check`.

## Load on demand

- ERS ids, ownership gate, edit loop, mistakes → [references/workflow.md](references/workflow.md).
