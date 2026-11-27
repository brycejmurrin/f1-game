---
name: garage-parts-livery
description: "Use when editing the GARAGE parts catalog, liveries, paint, number and sponsor legibility, factory presets, ersProfile/aeroLoad, career owned-part UI, or car meshes. Not livery screenshots → playwright-probe; handling → tune-physics."
---

# Garage — parts, livery, and car mesh

The GARAGE (`#carsetup`, `js/garage/setup-sheet.js`) is who you are, what you
drive (the `Parts.CATALOG` categories under the `Parts.BUDGET` cap), and how it looks. Catalog: `js/car/parts.js`.
Paint: `js/car/liveries.js` + `js/car/liverytex.js`. Geometry: `js/car/car3d.js`.

## Where things live

Garage sheet, bay scene, camera, arrival, prebuild, car mesh/geometry, finishes, livery design and setup helpers (path → contract table) →
[references/where-things-live.md](references/where-things-live.md). Entry points: `js/garage/setup-sheet.js`, `js/car/car3d.js`, `js/car/liveries.js`.

Garage CSS is the **UI Survey** lane (not this skill's OWNED). Race-track rendering defects → **renderer-debug**.

Field catalog — `Parts.CATALOG` order, SIGNATURE / `FACTORY_PRESETS`, `ersProfile` /
`aeroLoad`, `Car3D.FINISH_SURFACE`, fin/spine/cover/draft lockstep, paint-sheet rules
→ [references/livery-fields.md](references/livery-fields.md).

## When to Use

- Catalog options, SIGNATURE clones, `FACTORY_PRESETS`, `visual` recipes.
- ERS battery / active-aero load from part choices.
- Career garage: owned parts, budget cap, locked rows, research unlocks.
- Livery schemes, paint finish, fin/finArt, sponsor/number layout.

## When NOT to Use

- Pure driving feel → **tune-physics**.
- Career economy with no parts edit → **career-mode**.
- Isolated car shots → [playwright-probe car studio](../playwright-probe/references/car-studio.md); batch
  garage shot contract → [`references/shot-cli.md`](references/shot-cli.md).
- Cache bump → `node tools/gen/gen-shell.mjs --check` ([shell/cache](../check-changes/references/bump.md)).
- A live, driven-by-hand look at the Garage/LIVERY screen (as opposed to a
  batch `garage-angles.mjs` run) → **mcp-probe** against the local server,
  clicking category tabs / livery swatches directly.
  Recipe: [`chrome.md`](../mcp-probe/references/chrome.md); click-timeout and
  soft-present-wait gotchas for that screen:
  [`traps-chrome.md`](../mcp-probe/references/traps-chrome.md).

## Quick Reference

| Item | Contract |
|---|---|
| Catalog | Ordered category array; budget `Parts.BUDGET` (career: `Career.budget()`) |
| SIGNATURE | Same cost/stats as `equivalent`; mesh-only |
| FACTORY_PRESETS | AI build: mesh + aeroLoad/ERS (no stat `mods`) |
| `_resolve` | Ownership-blind (no `owned` set); supplier/team lock plus the career regulation via `isOptionAvailable` (the `_legal` predicate `Parts.setLegality` sets) |
| Owned gate | UI: `G.careerOwned()` → `Parts.isOptionAvailable` |
| ERS / aero | `ersProfile` / `aeroLoad` → game.js battery / X-mode |
| Finish | `gloss` default; every other finish is a `FINISH_SURFACE` key in `js/car/car-materials.js` (satin, chrome, matte, carbon, pearl, …) |
| `--refl` | Studio dial — **not** in-game chrome finish |

```sh
npm run test:garage-unit                   # node gate for a part/wing/livery edit (no browser)
node tools/ci/pick-tests.mjs              # which groups prove it (car; modes for research locks / ownership UI)
# the PR's own CI runs the browser shard (never locally); a whole `car` group is Bryce's opt-in
node tools/car/audit-parts.mjs             # browser-gated (needs :3456) [--cats=engine,aero]
node tools/car/spine-station.mjs --team=redbull [--logo=wrap] [--png=artifacts/spine]
node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme
node tools/shot/shot.mjs bahrain 0.06 orbit out.png --team audi --dist 5.5 --el 26 --az 205
```

### Cover design / number-mark legibility

A NUMBER / MARK unreadable on its paint: `node --test tests/unit/crest-marks.test.mjs` first; the fix is
in the ink pickers of `js/car/liverytex.js` or a team's `logo3` in `js/data/teams.js`. Paint guard set,
pickers and placement → [references/placement.md](references/placement.md) § Cover-design guards.

Deep reference: **`../../../docs/CAREER.md`**. Related: **playwright-probe**, **career-mode**,
**tune-physics**, [agent-view state hooks](../agent-view/references/state.md) (`physState()` for live ERS), `node tools/gen/gen-shell.mjs --check`.

## BEFORE pack — fetch, do not recapture

Never capture your own full-grid garage BEFORE pack (tens of minutes): fetch the
**Garage before** pack with `node tools/garage-angles-fetch.mjs`, then shoot
only AFTER angles → [references/before-pack.md](references/before-pack.md).

## Load on demand

- Paint design loop (spine-station placement → lit garage-angles → --serve --watch → --pair → paint guards) → [references/design-loop.md](references/design-loop.md).
- Fin/spine/cover/draft field catalog + paint-sheet lockstep → [references/livery-fields.md](references/livery-fields.md).
- ERS ids, ownership gate, edit loop, node gates (`npm run test:garage-unit`, `parts-ladder`), where a wing part goes (a look = a `STYLES` row; a new visual field = `VISUAL_FIELD_REGISTRY` + consumer + `aero-preview-fields`), mistakes → [references/workflow.md](references/workflow.md).
- Which surface answers a PLACEMENT question, and what each is blind to → [references/placement.md](references/placement.md).
- Garage multi-angle shots → [references/garage-angles.md](references/garage-angles.md): axes (`--az/--el/--dist`, `--target`, `--lamp`, `--driver`),
  STATIONS keyed to a part (`--station=spineTop`), the free camera (`--clamp=0`, `--eye/--look`, `--path`),
  comparisons (`--pair`, overlays, `--flat`; flag detail in [references/garage-angles-axes.md](references/garage-angles-axes.md)), `--serve`/`--watch` and `apex_garage`, `--fast` (+`--sheet=1`), `--plan`, settle tuning, WebGL/`DISPLAY` setup.
