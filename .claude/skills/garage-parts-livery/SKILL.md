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
`fin` (plate, defaults to `c2`) and `finArt` (must contrast or it vanishes);
the tail DESIGN is four enum fields with defaults that reproduce the shipped car —
`finShape` (`Car3D.FIN_SHAPES` + `none`; the ONE non-colour livery field that moves
a vertex, declared in `SP_HULL_GEOM_FIELDS`), `finStyle` (`LiveryTex.TAIL_STYLE_IDS`,
drives the fin panel AND the engine-cover wash), `finBadge` (`logo|number|none`) and
`spineLogo` (SPINE TOP: `logo|none|wrap|bigmark|saddle|panel|stripe|twin|wordmark|carbon|number`;
`wrap` paints one car-space shape into `REGIONS.crest` AND `REGIONS.spineSide` via
`drawSunWrap`, so a graphic crosses the shoulder — the region↔car maps are documented there;
painted by `drawSpineTop` into `REGIONS.crest` on BARE paint — the crown carries no
tail wash; the fin motif stops at the fin — and continued down `REGIONS.tail` by
`drawTailTop`; the crest and number read top-down, nose up). SPINE SIDE ids also
offer `plate|wordmark|duo|slash` (from the 2026 launch photos; `wrap` + `duo` is the RB22).
The two flanks are SEPARATE regions (`spineSide` RIGHT, `spineSideL` LEFT, in the atlas's
extra rows: `SIZE` × `SIZE_H`); paint them through `eachFlank`/`flankFrame`, never one
mirrored texture. The car is drawn through an x-reflection, so the mesh's +x quad RENDERS
as the car's right flank: right canvas-left = REAR, left canvas-left = FRONT, text reading
on both. Calibrate by painting a labelled grid into both regions and reading it in the REAL
garage — never by deriving it from car space, which is where the first pass inverted both. UVs divide v by `SIZE_H`. `drawTailGraphic` clips to its region. Body details:
`tcam` (`Car3D.TCAM_IDS`, mesh colour only) and `coverVents` (`Car3D.COVER_VENT_IDS`,
geometry, also in `SP_HULL_GEOM_FIELDS`); `spineHeight` (`Car3D.SPINE_HEIGHT_IDS`,
lifts the cover crown top-only through `bodyAnchors(parts, teamId, spineHeight)` —
pass it wherever anchors or `getCarDecalMesh` are taken, or the crest decal floats;
geometry, in `SP_HULL_GEOM_FIELDS`; `dorsal` is the fin-less 2026 cover) and
`spineSide` (`LiveryTex.SPINE_SIDE_IDS`, the number / mark / code painted into
`REGIONS.spineSide` and mapped by car-mesh onto both cover flanks; the service
panels and the accent pinstripe keep clear of the band, so it is in
`SP_HULL_GEOM_FIELDS` too); `finBadge`
also offers `code`. The engine-cover cross-section is `Car3D.coverProfile(c)`
(flank → shoulder at 0.72x → two facets → flat crown ±0.32x): the loft, the
crest strip and the flank band in car-mesh, and every cover-mounted detail read
it — place side details with `coverFlankX(c, y)` and crown details with
`coverSurfaceY(c, x)`, never at `c.x` / `c.top` literally, or they float. The 2026
lights are draw-time, not livery: `CarMesh.ersLightCode` (pure) and
`drawMirrorLights` at `Car3D.mirrorLightAnchors` under 20 km/h.
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
one, never just the mark. Every team's lockup is the same construction on the fin, the spine and the
wall: plated marks keep the shield/disc, Haas keeps the ring, Audi keeps the
weave, and `buildAtlas` shares one `markPalette`. `bare` only drops fillText. `ALT_INSIDE` names the marks whose
second colour is drawn inside the mark and so answers to the mark alone.

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
