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
drives the fin panel ONLY — the crown's gradient wash was removed, so every
SPINE TOP now stands on bare paint with hard edges; `drawTailGraphic` is called
on `REGIONS.fin` alone, which is why the garage greys TAIL STYLE under FIN
SHAPE `none`), `finBadge` (`logo|number|code|none`) and
`spineLogo` (SPINE TOP: `logo|none|wrap|bigmark|saddle|panel|stripe|twin|chevron|wedge|rungs|tricolour|wordmark|carbon|number` —
`wedge` tapers airbox→tail and `rungs` runs bars ACROSS the crown, the one direction nothing else does;
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
garage — never by deriving it from car space, which is where the first pass inverted both. UVs divide v by `SIZE_H`. `drawTailGraphic` clips to its region.
`wingCarbon` (`paint|carbon`) puts every flap, front and rear, on `SURFACES.carbon` — the flap sites
pass their surface explicitly, so a CARBON colour alone would be dark paint — and `rearWing` colours the
rear mainplane block (absent = `c2`, today's look); the garage greys WINGS and REAR WING under carbon.
`finStyle` also offers `stars` (the W17's star flake, a fixed nine-point table, no RNG).
`cover` is the ENGINE COVER colour zone — the airbox, roll structure, cover loft and snorkel
take it instead of `c1` (the SF-26's white top on a red car); the atlas inks the crest and the
spine designs against it through `coverPaint`, or a light cover swallows a light crest. Body details:
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
node tools/shot/shot.mjs bahrain 0.06 orbit out.png --team audi --dist 5.5 --el 26 --az 205
```

### A COVER DESIGN IS ONLY HALF-GUARDED

`tests/unit/cover-legibility.test.mjs` measures the atlas: for every shipped
default it takes the colour covering most of the crown and flank and scores it
against the cover it lands on. That is the half that VARIES per team — team
paint against a `liv.cover` override — and it earned its place by catching a
white saddle on Ferrari's pale cover and teal stripes on Mercedes' silver one,
both already merged, in about a second.

It is blind to PLACEMENT, by construction. Audi's `twin` stripes score 17
against black and are invisible anyway, because they sit on the shoulders where
the cover curves away from a rear three-quarter camera. No colour metric can
see that.

Placement is a property of the DESIGN, not the team — the geometry is identical
on all twelve cars — so it is answered once per design rather than per livery,
and it does not belong in CI. **When you add a crown or flank design, or move
an existing one's geometry, shoot it on track** with `shot.mjs --team` and look.
A 430 px atlas crop flatters a graphic that a race camera renders as forty
pixels of mud: `carbon` and `bigmark` both passed every test and every atlas
review, and neither existed at racing distance.

Scripting the studio instead? `CARVIEW.set({livery})` takes an id OR a livery
object; an id that matches nothing warns and renders the default rather than
pretending. It silently ignored objects until 2026-09-09, which is worth
knowing if you find an old script that varies a field and photographs the same
car every time.

Deep reference: **`../../../docs/CAREER.md`**. Related: **playwright-probe**, **career-mode**,
**tune-physics**, **agent-view** `references/state.md` (`physState()` for live ERS), `node tools/gen/gen-shell.mjs --check`.

## Load on demand

- ERS ids, ownership gate, edit loop, mistakes → [references/workflow.md](references/workflow.md).
