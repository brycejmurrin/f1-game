---
name: garage-parts-livery
description: "Use when editing the GARAGE parts catalog, livery/finish/shark fin, a number/crest/sponsor mark unreadable against the car's paint (livery contrast/legibility; HUD digits are ui-menu-a11y, billboards scenery-dress), SIGNATURE or FACTORY_PRESETS meshes, ersProfile/aeroLoad, career owned-part UI, Car3D visual recipes. Isolated studio renders → playwright-probe; handling → tune-physics."
---

# Garage — parts, livery, and car mesh

The GARAGE (`#carsetup`, `js/garage/setup-sheet.js`) is who you are, what you
drive (12 categories + 780 cr, `Parts.BUDGET`), and how it looks. Catalog: `js/car/parts.js`.
Paint: `js/car/liveries.js` + `js/car/liverytex.js`. Geometry: `js/car/car3d.js`.

## Where things live (garage scene + render hook)

| Area | Path | Contract |
|---|---|---|
| GARAGE UI sheet | `js/garage/setup-sheet.js` | `create(G)` → `openSetup` / `buildSetup`; `#carsetup` DOM |
| 3D bay draw | `js/garage/scene.js` | `init`, `buildStatic`, `draw`, `live` pit board; uses `scene-prims.js`, `scene-equipment.js` |
| Preview camera | `js/garage/setup-camera.js` | `create`, `panelCover`, `presentOpts`, `glareScale` |
| Arrival motion | `js/garage/arrival.js` | Pit-lane entry into the bay (not race `PitLane`) |
| Title prebuild | `js/garage/prebuild.js` | `GaragePrebuild.create` — warm room/car; `__apex.garagePrebuild()` |
| Backend pick | `js/render/gfx.js` | `Gfx.create(canvas)` → TLX / GLX / WGX; `game.js` holds `gfx` for race + studio |
| Car mesh recipe | `js/car/car3d.js`, `js/car/car-draw.js` | Field + garage `Car3D` build; livery textures via `liverytex.js` |
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

- Pure driving feel → **tune-physics**. Career economy with no parts edit →
  **career-mode**. Isolated car shots → **playwright-probe** (`references/car-studio.md`). Cache bump →
  `node tools/gen/gen-shell.mjs --check` ([shell/cache](../check-changes/references/bump.md)).
- A live, driven-by-hand look at the Garage/LIVERY screen (as opposed to a
  batch `garage-angles.mjs` run) → **mcp-probe** against the local server,
  clicking category tabs / livery swatches directly — see
  `.claude/skills/mcp-probe/references/recipes.md` § "Driving a UI screen" and
  `.claude/skills/mcp-probe/references/traps-chrome.md` for the click-timeout and soft-present-wait
  gotchas specific to that screen.

## Quick Reference

| Item | Contract |
|---|---|
| Catalog | Ordered 12-category array; budget 780 cr (`Parts.BUDGET`) |
| SIGNATURE | Same cost/stats as `equivalent`; mesh-only |
| FACTORY_PRESETS | AI visual setup only |
| `_resolve` | Career-blind; supplier/team lock only |
| Owned gate | UI: `G.careerOwned()` → `Parts.isOptionAvailable` |
| ERS / aero | `ersProfile` / `aeroLoad` → game.js battery / X-mode |
| Finish | `gloss` default; `satin`/`chrome` via `FINISH_SURFACE` |
| `--refl` | Studio dial — **not** in-game chrome finish |

```sh
node tools/ci/test-bg.mjs car              # browser-gated
node tools/ci/test-bg.mjs modes            # browser-gated; research locks / ownership UI — no test:career
node tools/car/audit-parts.mjs             # browser-gated (needs :3456) [--cats=engine,aero]
node tools/car/spine-station.mjs --team=redbull [--logo=wrap] [--png=artifacts/spine]
node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme
# audit-aero.mjs is a thin alias of render-car --preset=wing — prefer the parent
node tools/shot/shot.mjs bahrain 0.06 orbit out.png --team audi --dist 5.5 --el 26 --az 205
```

### Cover design / number-mark legibility

Cover designs and unreadable numbers/marks have separate guards (`cover-legibility`, `crest-marks`, `fill-gating`,
`fin-design`; none implies another). Offline placement first: `node tools/car/spine-station.mjs --team=redbull`.
Detail and the NUMBER/MARK picker fix path → [references/placement.md](references/placement.md) § Cover-design guards.

Deep reference: **`../../../docs/CAREER.md`**. Related: **playwright-probe**, **career-mode**,
**tune-physics**, **agent-view** `references/state.md` (`physState()` for live ERS), `node tools/gen/gen-shell.mjs --check`.

## BEFORE pack — fetch, do not recapture

Car/garage agents MUST NOT capture their own 11-team garage BEFORE grid
(`garage-angles.mjs --budget=12m` / wheels-tyres runs). That costs 12–28 min
on llvmpipe and is why **Garage before** exists.

```sh
node tools/garage-angles-fetch.mjs                  # merge-base with ship
node tools/garage-angles-fetch.mjs --sha HEAD --out artifacts/garage-before
gh workflow run garage-before.yml -f ref=claude/f1-game-project-26h3ng
```

The pack is `garage-before-<sha>` (MANIFEST.json: team, preset, file, sha,
timestamp). If the exact SHA has no pack, the script takes the nearest
ancestor and prints compare-API staleness (commits + js/car|garage|render
files). Capture only AFTER shots for the angles you changed, then
`--baseline=` / `--against=` against the fetched pack. Workflow:
`.github/workflows/garage-before.yml` — macos, 4 team shards, daily
(10:23 UTC, only when watched paths moved) or on dispatch, not a
required check; a car change merged today has no pack until then. Not Car shot (`carview.html` has no garage room).

## Design loop — spine top / side, fin, any paint row

1. **Placement, no browser** (0.2 s): `node tools/car/spine-station.mjs --team=X --png=artifacts/spine`
   says where the ink lands (`v` 0 crease → 1 sidepod line) and rasterises the flat art.
2. **Look at it lit, once**: `garage-angles.mjs --team=X --spineLogo=wrap` — no camera
   flag, so it shoots the field's own STATION (`spineTop`; `spineSide` for a side
   design, `finBadge` for a fin). `--flat` puts the atlas art beside the frame.
3. **Iterate hot**: `garage-angles.mjs --serve --watch --team=X` (or `apex_garage`)
   keeps the garage open; edit the painter in `js/car/liverytex.js`, and each save
   re-shoots the last camera in ~10 s. Swap designs with `{"design":{…}}`, move with
   `{"frame":"spineSide"}` or an explicit `eye`/`look`, `{"diff":[a,b]}` for Δ + overlay.
4. **Choose**: `--pair='spineLogo:wrap|saddle'` scores the two in one run
   (`design-pairs.png`, magenta overlay of what changed).
5. **Gate**: `cover-legibility`, `crest-marks`, `fill-gating` (`node --test tests/unit/<x>.test.mjs`),
   then `fin-design` for placement. None of the three implies another.

## Load on demand

- Fin/spine/cover/draft field catalog + paint-sheet lockstep → [references/livery-fields.md](references/livery-fields.md).
- ERS ids, ownership gate, edit loop, node catalog gates (`parts-distinct-mesh`, `parts-ladder`), where a wing part goes (`aero`), mistakes → [references/workflow.md](references/workflow.md).
- Which surface answers a PLACEMENT question, and what each is blind to → [references/placement.md](references/placement.md).
- Garage multi-angle shots → [references/garage-angles.md](references/garage-angles.md): axes (`--az/--el/--dist`, `--target`, `--lamp`, `--driver`),
  STATIONS keyed to a part (`--station=spineTop`), the free camera (`--clamp=0`, `--eye/--look`, `--path`),
  comparisons (`--pair`, overlays, `--flat`), `--serve`/`--watch` and `apex_garage`, `--fast` (+`--sheet=1`), `--plan`, settle tuning, WebGL/`DISPLAY` setup.
