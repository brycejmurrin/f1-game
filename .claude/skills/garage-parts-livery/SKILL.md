---
name: garage-parts-livery
description: Use when editing the GARAGE parts catalog, livery/finish/shark fin, SIGNATURE or FACTORY_PRESETS meshes, ersProfile/aeroLoad, career owned-part UI, or Car3D visual recipes. Isolated studio renders → playwright-probe; on-track handling → tune-physics.
---

# Garage — parts, livery, and car mesh

The GARAGE (`#carsetup`, `js/garage/setup-sheet.js`) is who you are, what you
drive (12 categories + 600 cr), and how it looks. Catalog: `js/car/parts.js`.
Paint: `js/car/liveries.js` + `js/car/liverytex.js`. Geometry: `js/car/car3d.js`.

`Parts.CATALOG` is an **ordered array**. SIGNATURE = mesh-only clone of
`equivalent`. `FACTORY_PRESETS` = AI meshes only. ERS/aero from `ersProfile` /
`aeroLoad`. Finish via `Car3D.FINISH_SURFACE`. Full field catalog (fin/spine/
cover/draft lockstep, paint-sheet rules) → [references/livery-fields.md](references/livery-fields.md).

## When to Use

- Catalog options, SIGNATURE clones, `FACTORY_PRESETS`, `visual` recipes.
- ERS battery / active-aero load from part choices.
- Career garage: owned parts, budget cap, locked rows, research unlocks.
- Livery schemes, paint finish, fin/finArt, sponsor/number layout.

## When NOT to Use

- Pure driving feel → **tune-physics**. Career economy with no parts edit →
  **career-mode**. Isolated car shots → **playwright-probe** (`references/car-studio.md`). Cache bump →
  `node tools/gen/gen-shell.mjs --check` ([shell/cache](../check-changes/references/bump.md): `?v=dev`, no bump).

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
node tools/ci/test-bg.mjs car              # browser-gated
node tools/ci/test-bg.mjs modes            # browser-gated              # research locks / ownership UI — no test:career
node tools/car/audit-parts.mjs             # browser-gated (needs :3456) [--cats=engine,aero]
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
and only foreshortening / lighting / racing distance need `tools/shot/garage-angles.mjs`
(pass `--zoom`/`--pan` or a flank mark arrives forty pixels wide) or
`shot.mjs --team`. Placement/fin gates live in `fin-design.test.mjs`; cover-legibility
and livery-contrast are separate unit suites — a green fin-design is not proof
those two are green.

Deep reference: **`../../../docs/CAREER.md`**. Related: **playwright-probe**, **career-mode**,
**tune-physics**, **agent-view** `references/state.md` (`physState()` for live ERS), `node tools/gen/gen-shell.mjs --check`.

## Load on demand

- Fin/spine/cover/draft field catalog + paint-sheet lockstep → [references/livery-fields.md](references/livery-fields.md).
- ERS ids, ownership gate, edit loop, mistakes → [references/workflow.md](references/workflow.md).
- Which surface answers a PLACEMENT question, and what each is blind to → [references/placement.md](references/placement.md).
- Garage multi-angle shots: presets, `--fast`, `--plan`, settle tuning → [references/garage-angles.md](references/garage-angles.md).
