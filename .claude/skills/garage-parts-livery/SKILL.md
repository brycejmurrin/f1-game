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
SIGNATURE (`tag: "SIGNATURE"`, `teams: [id]`) is a cost/physics-identical
clone of `equivalent` — mesh only. `FACTORY_PRESETS` drives AI meshes only.
ERS/aero axes derive from the catalog (`ersProfile` / `aeroLoad`); a car with
no parts (every AI) sits at the midpoint.

Livery: `finish` (`gloss|satin|chrome`, `Car3D.FINISH_SURFACE`), the shark-fin
and tail fields (`fin`, `finArt`, `finShape`, `finStyle`, `finBadge`), the
spine designs (`spineLogo`, `spineSide`, `spineHeight`), `cover`, `wingCarbon`,
`rearWing`, `tcam`, `coverVents`, and the three mark colours (`logo`, `logo2`,
`logo3`). Every field, its enum, the surface it paints and the trap it carries:
[references/livery-fields.md](references/livery-fields.md). Three rules that
bind before any edit:

- The paint sheet has ONE field list (`LIV_DRAFT_COLORS` + `LIV_DRAFT_PILLS` in
  `js/garage/setup-sheet.js`, plus `Liveries.forTeam`'s copy list). Adding a
  field touches those and a `LIV_ROW_HINT` entry — nothing else;
  `tests/unit/team-livery.test.mjs` holds it, mutation-tested.
- A garage FILE is player input: `applyGarage` (`js/ui/settings-export.js`)
  validates shape per key family before writing.
- The mark takes up to three colours; ask `LiveryTex.markSlots(teamId)` how
  many, never assume a length.

## When to Use

- Catalog options, SIGNATURE clones, `FACTORY_PRESETS`, `visual` recipes.
- ERS battery / active-aero load from part choices.
- Career garage: owned parts, budget cap, locked rows, research unlocks.
- Livery schemes, paint finish, fin/finArt, sponsor/number layout.

## When NOT to Use

- Pure driving feel → **tune-physics**. Career economy with no parts edit →
  **career-mode**. Isolated car shots → **playwright-probe** (`references/car-studio.md`). Cache bump →
  `node tools/gen/gen-shell.mjs --check` (no cache bump: `.claude/skills/check-changes/references/bump.md`).

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
node tools/car/spine-station.mjs --team=redbull [--logo=wrap] [--png=artifacts/spine]
node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme
node tools/shot/shot.mjs bahrain 0.06 orbit out.png --team audi --dist 5.5 --el 26 --az 205
```

### A COVER DESIGN IS ONLY HALF-GUARDED

`cover-legibility.test.mjs` scores whether a design SEPARATES from the cover it
lands on — the half that varies per team. Whether it lands anywhere worth
looking is a different question, and you answer it on the cheapest surface that
can: `node tools/car/spine-station.mjs --team=redbull` measures where every
flank design's ink actually falls (`v` 0 = shoulder crease, 1 = sidepod line;
`u` front → rear) in 0.2 s with no browser, `--occlude` adds what the car's own
tyres and bodywork cover from a garage camera, the `(crown)` row measures the
crown's OWN flank graphic (the wrap's bull) which no side row can see,
`--team=all` runs one crown across the grid, `--png` rasterises the flat art,
and only foreshortening / lighting / racing distance need `garage-angles.mjs`
(pass `--zoom`/`--pan` or a flank mark arrives forty pixels wide) or
`shot.mjs --team`. Both halves are in CI via `fin-design.test.mjs`.

Deep reference: **`../../../docs/CAREER.md`**. Related: **playwright-probe**, **career-mode**,
**tune-physics**, **agent-view** `references/state.md` (`physState()` for live ERS), `node tools/gen/gen-shell.mjs --check`.

## Load on demand

- ERS ids, ownership gate, edit loop, mistakes → [references/workflow.md](references/workflow.md).
- Which surface answers a PLACEMENT question, and what each is blind to → [references/placement.md](references/placement.md).
- Garage multi-angle shots: presets, `--fast`, `--plan`, settle tuning → [references/garage-angles.md](references/garage-angles.md).
