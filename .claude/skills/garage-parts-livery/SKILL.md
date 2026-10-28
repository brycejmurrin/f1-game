---
name: garage-parts-livery
description: "Use when editing the GARAGE parts catalog, livery/finish/fin data or paint code, paint legibility for numbers/crests/sponsors, SIGNATURE/FACTORY_PRESETS, ersProfile/aeroLoad, career owned-part UI, car mesh/geometry modules. Livery screenshots and studio captures → playwright-probe."
---

# Garage — parts, livery, and car mesh

The GARAGE (`#carsetup`, `js/garage/setup-sheet.js`) is who you are, what you
drive (12 categories under the `Parts.BUDGET` cap), and how it looks. Catalog: `js/car/parts.js`.
Paint: `js/car/liveries.js` + `js/car/liverytex.js`. Geometry: `js/car/car3d.js`.

## Where things live (garage scene + render hook)

| Area | Path | Contract |
|---|---|---|
| GARAGE UI sheet | `js/garage/setup-sheet.js` | `create(G)` → `openSetup` / `buildSetup`; `#carsetup` DOM |
| 3D bay draw | `js/garage/scene.js` | `init`, `buildStatic`, `draw`, `live` pit board; uses `scene-prims.js`, `scene-equipment.js` |
| Preview camera | `js/garage/setup-camera.js` | `create`, `panelCover`, `presentOpts`, `glareScale` |
| Arrival motion | `js/garage/arrival.js` | Pit-lane entry into the bay (not race `PitLane`); changing the motion → **f1-animation-cameras** |
| Title prebuild | `js/garage/prebuild.js` | `GaragePrebuild.create` — warm room/car; `__apex.garagePrebuild()` |
| Backend pick | `js/render/gfx.js` | `Gfx.create(canvas)` → TLX / GLX / WGX; `game.js` holds `gfx` for race + studio |
| Car mesh facade | `js/car/car3d.js`, `js/car/car-draw.js` | Field + garage `Car3D` build; livery textures via `liverytex.js` |
| Car geometry | `js/car/car-body-geom.js`, `car-mesh.js`, `car-wheels.js`, `car-geometry.js` | the `fit*` / `coverSurfaceY` builders `car3d.js` calls; after an edit run apex-lsp `lsp_outline` + `lsp_diagnostics` on the module (two `function X` in one IIFE: the later silently wins) |
| Finishes | `js/car/car-materials.js` | `FINISH_SURFACE` and material params |
| Livery design | `js/garage/livery-design-editor.js`; `js/car/livery-design.js`, `livery-graphics.js`, `livery-stations.js`, `custom-liveries.js` | the paint editor; graphics, stations, saved custom liveries |
| Setup sheet helpers | `js/garage/setup-presets.js`, `setup-tune.js`, `setup-trials.js`, `setup-experiments.js` | presets, tune, trials, experiments behind `#carsetup` |
| Agent garage shots | `js/agent/apex.js` | `garageCam()`, `garagePrebuild()`, `render({what:"car"})` |

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
- Isolated car shots → **playwright-probe** (`references/car-studio.md`); batch
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
| Catalog | Ordered 12-category array; budget `Parts.BUDGET` (career: `Career.budget()`) |
| SIGNATURE | Same cost/stats as `equivalent`; mesh-only |
| FACTORY_PRESETS | AI visual setup only |
| `_resolve` | Career-blind; supplier/team lock only |
| Owned gate | UI: `G.careerOwned()` → `Parts.isOptionAvailable` |
| ERS / aero | `ersProfile` / `aeroLoad` → game.js battery / X-mode |
| Finish | `gloss` default; `satin`/`chrome` via `FINISH_SURFACE` |
| `--refl` | Studio dial — **not** in-game chrome finish |

```sh
npm run test:garage-unit                   # node gate for a part/wing/livery edit (no browser)
node tools/ci/test-bg.mjs --spec tests/specs/parts-catalog.spec.js   # ONE spec; parent only
node tools/ci/remote-group.mjs car         # the whole group, on the pushed branch (modes: research locks / ownership UI)
node tools/car/audit-parts.mjs             # browser-gated (needs :3456) [--cats=engine,aero]
node tools/car/spine-station.mjs --team=redbull [--logo=wrap] [--png=artifacts/spine]
node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme
# audit-aero.mjs is a thin alias of render-car --preset=wing — prefer the parent
node tools/shot/shot.mjs bahrain 0.06 orbit out.png --team audi --dist 5.5 --el 26 --az 205
```

### Cover design / number-mark legibility

A NUMBER / MARK unreadable on its paint: `node --test tests/unit/crest-marks.test.mjs` first; the fix is
in the ink pickers of `js/car/liverytex.js` or a team's `logo3` in `js/data/teams.js`. Paint guard set,
pickers and placement → [references/placement.md](references/placement.md) § Cover-design guards.

Deep reference: **`../../../docs/CAREER.md`**. Related: **playwright-probe**, **career-mode**,
**tune-physics**, **agent-view** `references/state.md` (`physState()` for live ERS), `node tools/gen/gen-shell.mjs --check`.

## BEFORE pack — fetch, do not recapture

Never capture your own 11-team garage BEFORE grid (tens of minutes): fetch the
**Garage before** pack with `node tools/garage-angles-fetch.mjs`, then shoot
only AFTER angles → [references/before-pack.md](references/before-pack.md).

## Load on demand

- Paint design loop (spine-station placement → lit garage-angles → --serve --watch → --pair → paint guards) → [references/design-loop.md](references/design-loop.md).
- Fin/spine/cover/draft field catalog + paint-sheet lockstep → [references/livery-fields.md](references/livery-fields.md).
- ERS ids, ownership gate, edit loop, node gates (`npm run test:garage-unit`, `parts-ladder`), where a wing part goes (a look = a `STYLES` row; a new visual field = `VISUAL_FIELD_REGISTRY` + consumer + `aero-preview-fields`), mistakes → [references/workflow.md](references/workflow.md).
- Which surface answers a PLACEMENT question, and what each is blind to → [references/placement.md](references/placement.md).
- Garage multi-angle shots → [references/garage-angles.md](references/garage-angles.md): axes (`--az/--el/--dist`, `--target`, `--lamp`, `--driver`),
  STATIONS keyed to a part (`--station=spineTop`), the free camera (`--clamp=0`, `--eye/--look`, `--path`),
  comparisons (`--pair`, overlays, `--flat`), `--serve`/`--watch` and `apex_garage`, `--fast` (+`--sheet=1`), `--plan`, settle tuning, WebGL/`DISPLAY` setup.
