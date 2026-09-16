# Pit bay logos — plan (2026-09-15)

> A PLAN, not a record of work. Nothing below is implemented. Every fact is
> cited to the working tree at the session SHA; line numbers drift, names do not.
> Companion: `docs/research/PIT-LANE-REDESIGN-2026-09.md` (the complex this
> decorates). Measurements were taken headlessly with
> `tools/lib/track-build-vm.cjs` (`buildContext()`), no browser.

## 0. Goal

Put each team's identity on the OUTSIDE of its pit garage: a crest and the
team's short name on the fascia above the door, so a car in the lane, the
`pit-shots` box framings and the TV/aerial cameras can tell one bay from the
next by more than the lintel's colour. One draw call, one texture, no change
to the props buffer, nothing the headless VM has to know about.

## 1. Facts (verified; corrections to the first pass in **bold**)

Row and team data
- `TrackPit.row()` emits `{team, name, col, col2}` and `build()` adds
  `{through, s, k}` (`js/track/core/pit.js:115-125`, `:161-164`). **`short` is
  not carried** though `Teams.LIST` has it (`js/data/teams.js:20-21`). No logo
  asset exists: crests are vector paths (`js/car/crest-paths.js`) drawn by
  `LiveryTex.drawCrest` (`js/car/liverytex.js:1175`); the abandoned
  `assets/logos/<id>.png` prefetch is recorded at **`liverytex.js:1005-1013`**,
  not `scene.js ~:1008` (that is the strategy strip's compound loop).
- Row order IS `Teams.LIST` + `custom` (measured: mercedes … cadillac, custom;
  pitch 11.0 m; `off.workOut` 14 m; hw 7 m Albert Park, 8 m Silverstone/Monza;
  0.85-1.2 s per build in the VM).

Bay skin (`js/track/scenery/pits.js:167-213`; lateral from the road edge `h`,
sign `sd`, `garage = 14`)
- The bay mesh (`GarageScene.buildStatic`, 3,316 verts) is stamped by
  `TrackGeom.addMesh` with local +Z toward the track (`:170-177`), so its door
  plane `Z_DOOR` lands exactly at `garage` (`js/garage/scene-prims.js:11`);
  nothing of it stands proud of that plane.
- Jambs 0.25 thick at `garage-0.13` → front face `garage-0.255`, y 0-5
  (`:189-195`). Lintel `[0.25, 0.8, 5.4]` at `garage-0.14`, colour `box.col`
  → front face **`garage-0.265`**, y 4.80-5.60 (`:196-198`). Roof slab y
  5.05-5.40, front edge `garage-0.25` (`:199-200`). Hospitality glass front face
  `garage+1.1`, y 5.4-8.8 (`:203-204`); its roof front edge `garage+0.8`
  (`:205-206`). Odd bays sit 6 mm nearer the track (`lift`, `:187-189`).
- The props buffer has no UVs (`js/track/core/geom.js:249-279`: pos/nrm/col/
  idx/mat); `mat` indexes the fixed 17-layer array (`geom.js:7-18`,
  `js/render/shared/assets.js:13`, `createTextureArray` `glx.js:1231` /
  `wgx.js:5232` / `tlx.js:2515`) — per-team layers would be a three-backend +
  asset-pack change, rejected.
- `SceneryPits.build(ctx)` runs LAST in `buildProps` (`js/track/tracks.js:
  2227-2228`) and already has a per-bay frame with `basis = [sd*r, u, t]`
  (`pits.js:54-60`).

Decal path
- `createTexMesh` `glx.js:1104` / `wgx.js:3026` / `tlx.js:2450`;
  `createTexture(canvas)` `glx.js:1194` (mipmapped, max anisotropy, FLIP_Y) /
  `wgx.js:3247` (mips, linear clamp) / `tlx.js:2471` (`anisotropy 4`, `flipY`);
  `drawDecal` `glx.js:1347` / `wgx.js:5726` / `tlx.js:3179`; contract
  `js/render/gfx.js:50-53, :118`.
- Lighting is **sun Lambert + hemisphere ambient + `uGlow` only — no shadow
  map, no point lights, no fog** (`glsl-fx.js:60-79`; parity `wgsl-fx.js:
  248-290`, `tsl-fx.js:213-224`). Depth-tested, no depth write, alpha-blended,
  both faces (`glx.js:1370-1379`). Car decals use `glow` 0.35 at night
  (`js/car/car-draw.js:290`); the garage dress 0.62 (`scene.js:1263`).
- WGX: 128 decal slots per frame (`wgx.js:1208`), a bind group cached per
  texture (`:5750-5758`), `freeTexture` nulls `tex.view` (`:3319-3332`). TLX:
  one material per (texture, glow) (`tsl-fx.js:234-261`), model matrix
  required (`tlx.js:3180`).
- Precedent: the GARAGE atlas `D_CREST/D_WORD/D_SIGN` (`js/garage/scene.js:
  857-870`), painted by `paintDress` (`:884-1027`; sign `:1019-1025`), quads
  via `dquad` (`:1124-1137`, `[BL, BR, TR, TL]` from the front, V flipped), the
  door sign 5 mm proud of its fascia (`:1235-1240`), one `drawDecal` per wall
  after the opaque draws (`:1458-1463`). **`paintDress` is module-private**
  (exports `:1637-1638`); the reusable painter is
  `LiveryTex.paintTeamMark(ctx, teamId, liv, R, field, opts)`
  (`liverytex.js:3079-3109`, exported `:3137-3139` with `inkOn`/`contrast`),
  which needs only `liv.{c1,c2,logo3}` and covers the custom team's uploaded
  mark. Car atlas: `car-draw.js:161-186`, `buildAtlas` `:2210`.
- Lifecycle: `Tracks.build` creates every `track.meshes.*` through the
  injected `G` (`tracks.js:222-283`); `game.js` frees them on a track change
  (`js/game.js:2068-2091`, no `freeTexture` there today). The garage frees its
  texture with `freeTexture` (`scene.js:1385, 1396`) and texMeshes with
  `freeMesh` (`:1373`).
- Draw order: `drawWorldMeshes` (props `game.js:6193`) → `drawSky` (`:6940`)
  → skids → cars, car decals flushed after the car loop (`car-draw.js:
  327-339`). The env probe redraws `drawWorldMeshes` only (`:6910`).

Lettering, audits, VM, cameras
- `signDigit` = 7-segment boxes from `SIGN_SEG`/`SIGN_DIGIT` (`js/track/
  scenery/structures.js:710-718`; `data.js:48-60`), digits only; the braking
  board already uses a rotated basis (`structures.js:744-748`).
- Coplanar audit: same-facing (`dot ≥ 0.999`) AND **overlap ≥ 2 m²**
  (`tools/track/coplanar-audit.cjs:68-70, :221`); clip audit ≥ 1 m
  (`tests/unit/prop-clipping.test.mjs:29`).
- `TRACK_VM` loads `teams.js` and `garage/scene*.js` but NOT `liverytex.js`
  (`tools/manifest.cjs:296-331`); the sandbox has no `document` and its `GLX`
  stub has only `createMesh`/`createChunkedMesh` (`tools/lib/track-build-vm.cjs:
  58-70`; `verify-track.cjs:99-111`).
- Near plane 0.9 m (0.3 cockpit) `game.js:6445`; fov 60° `js/camera/vantage.js:
  248`; `pit-shots` box framing eye 16 m back, 3.0 m up (`tools/shot/pit-shots.
  mjs:131-140`), lane eye 1.9 m (`:111`). Ratchets: `game.js` 8790 (file 8789),
  `tracks.js` 2680, `apex.js` 2928 (`tests/data/ratchets.json`).

## 2. What real bays show, and what fits

Real pit buildings carry (a) name + logo on a continuous fascia band above
the roller doors, lit at night, (b) sponsor boards on the jambs, (c) wordmarked
roller doors, (d) LED/timing strips, (e) team stands on the pit-wall gantry.
This engine takes (a) now: the lintel IS a team-colour fascia band, so a sign
there is the real thing. (c) is the garage screen's shutter quad
(`scene.js:1254`), not in the static bay (`:1301-1305`); (b) is a second cell
type on the same atlas; (d)/(e) are platform-sweep geometry (`pits.js:
118-126`) — all later.

## 3. Design

### A (primary): one shared atlas, one texMesh, one decal draw

```
 FRONT ELEVATION, one bay, seen from the fast lane (sd = +1)      SIDE SECTION (lateral from road edge)
 y 9.2 ┌──────────── hospitality roof ────────────────┐            hosp roof   front edge garage+0.80
 y 8.8 │                                              │            glass band  front face garage+1.10
       │        glazed hospitality band (GLASS)       │            roof slab   front edge garage-0.25  y 5.05-5.40
 y 5.4 ├───────────────── roof slab ──────────────────┤            LINTEL      front face garage-0.265 y 4.80-5.60
 y 5.6 │ jamb │▓▓▓▓▓▓ LINTEL, team colour ▓▓▓▓▓▓│ jamb │            JAMBS       front face garage-0.255 y 0-5
 y 5.55│      │ ┌─ SIGN QUAD 5.2 × 0.7 m ──────────┐ │      │            SIGN QUAD   plane      garage-0.275 ← 1.0 cm proud
 y 4.85│      │ └──────────────────────────────────┘ │      │            door plane  (bay Z_DOOR) garage+0.00
 y 4.8 │ 2.7m │        door opening 5.4 m            │ 2.7m │            odd bays: every face 6 mm nearer (`lift`)
 y 0   └──────┴──────────────────────────────────────┴──────┘
        ◄──────────── 10.8 m frontage, 11.0 m pitch ────────►
```

- Plane: lateral `sd*(h + garage - 0.275) - bump` (inherits the 6 mm
  alternation), normal `-sd*r`. 1.0 cm proud of the lintel, 2.0 cm of the
  jambs, 2.5 cm of the roof-slab edge; at the 0.9 m near plane 24-bit depth
  resolves ~0.2 mm at 30 m, so 1 cm never fights (the garage uses 5 mm,
  `scene.js:1237-1240`).
- Extent: ±2.6 m along the row about the box centre, y 4.85-5.55 — inside the
  lintel's 5.4 × 0.8 m face. The viewer's right on the sign is `-sd*t` (facing
  the bay from the track, travel runs LEFT on a right-hand pit), so BL =
  `c + (-sd*t)*(-2.6) + u*4.85`, corners in `dquad`'s `[BL, BR, TR, TL]`; the
  unit test asserts `(BR-BL)×(TL-BL)·n > 0` so a left-hand pit is not mirrored.
- Atlas: 1024×512 RGBA, 12 cells of **512×80 px, 2 columns × 6 rows** (cell
  6.4:1 ≈ quad 7.4:1, so ~100 px/m; a 0.5 m cap is 57 px); 512×256 on the
  mobile tier with the same fractional layout (UVs are size-independent). Each
  cell on a TRANSPARENT field (the lintel's colour shows through, as `D_SIGN`
  does on the floor, `scene.js:1216-1221`): crest at the left via
  `paintTeamMark(ctx, id, {c1: col, c2: col2, logo3}, R, col, {fullLockup:
  true})`, then `SHORT` in 700 system-ui at ~0.62 of the cell height in
  `LiveryTex.inkOn([col])`. Not the full name — §4.
- Ownership: `SceneryPits.build` emits the quads into a SEPARATE accumulator
  `track.pitSigns = {pos, nrm, uv, idx, cells: [{i, team}], centre}` (pure
  numbers, VM-safe); the cell layout lives in `TrackPit.SIGN` so painter and
  geometry read one table. `Tracks.build` (where `G` is) creates
  `track.meshes.pitSigns` and `track.meshes.pitSignTex` behind
  `G.createTexMesh && G.createTexture && PitSigns.supported()` in a try/catch;
  `game.js` frees both in its existing block and draws ONE `drawDecal` right
  after `drawSky` (`gfx.js:104-119` fixes opaque → sky → decal), `glow =
  night ? 0.5 : 0`, gated by `!hideMeshes.pitSigns` and `dist(camEye, centre)
  < 350 m` (no fog in the decal shader — §6).
- Painter: new `js/garage/pit-signs.js` (`PitSigns.supported()`,
  `paintAtlas(boxes, {mobile})`) after `scene.js` in FULL, on
  `LiveryTex.paintTeamMark`/`inkOn` rather than an exported `paintDress`: the
  garage's `D_WORD` strip is a dark field + name, wrong for a transparent
  fascia, and `paintTeamMark` is already the ONE mark path (`liverytex.js:
  3077-3078`).

### B (fallback): box lettering of `team.short`

Extend `SIGN_SEG` to the 14-segment set (7 rectangles + 4 diagonals via the
rotated basis of `structures.js:744-748`; ~12 lines in `data.js`), add
`SIGN_GLYPH` A-Z (~28), generalise `signDigit` → `signGlyph` (~8), and in
`pits.js` place ≤ 3 glyphs 0.5 × 0.35 m, 0.03 m thick, back faces 5 mm proud
of the lintel (~12). Cost ≤ 3 × 9 × 24 = 648 verts per bay, ~5 k for the row —
0.6 % of Albert Park's 893,343 prop verts. Survives the audits by construction
(no two segment faces overlap ≥ 2 m², nothing penetrates ≥ 1 m); lit, shadowed
and fogged like every prop. Cannot draw a crest, reads as a scoreboard, grows
the props buffer on every circuit: ships only if A's texture path is rejected,
never alongside it.

## 4. Where it is seen, and whether it reads

Pixel height of `h` at distance `d`, 800×450, fov 60°: `px ≈ 390·h/d`. A
0.5 m cap: 19 px at 10 m, 11 px at 18 m (the `pit-shots` box framing), 7 px
at 28 m. Abeam from the fast lane (8.25 m) it is 24 px tall but seen 60-70°
off-normal, so a 0.35 m letter collapses to 3-5 px: **from the driving cameras
the sign reads as crest + colour, not text** — hence crest left, three-letter
`short` right, no 21-character name. The box, lane-overview and aerial
framings and photo mode read the letters; mips + anisotropy (set by every
`createTexture`) keep the grazing view from smearing. The hospitality band
could carry a 1.2 m sign (26 px at 18 m; a 1.9 m eye at ≥ 10 m clears the
roof-slab edge above y ≈ 5.9) but it brands the building, not the bay — a
later second quad on the same atlas, not now.

## 5. Implementation checklist (ordered)

1. `js/track/core/pit.js` `row()` (:119-123): carry `short` (custom → `short`,
   filler rows `"R"+i`); add `SIGN = {w: 1024, h: 512, cols: 2, cellW: 512,
   cellH: 80, quadW: 5.2, quadH: 0.7, y0: 4.85, proud: 0.275}` to the export
   (+8 lines). `tests/unit/pit-complex.test.mjs` keeps passing (row shape grows).
2. `js/track/scenery/pits.js` after the lintel (:198): push the quad into a
   local `signs` accumulator with the corner/UV rule above; after the loop set
   `track.pitSigns = signs` with `centre` = the middle bay's world point (+35).
3. New `js/garage/pit-signs.js` (`PitSigns` IIFE, `"use strict"`, frozen):
   `supported()` = `typeof document !== "undefined" && typeof LiveryTex !==
   "undefined"`; `paintAtlas(boxes, {mobile})` paints 12 cells from
   `TrackPit.SIGN`, looking up `Teams.LIST` by `box.team` for `livery.logo3`
   (+70). Register in `tools/manifest.cjs` FULL after `js/garage/scene.js`
   (no HARD_EDGES: nothing destructured at eval); `node tools/gen/gen-shell.mjs`
   (shell + `sw.js` precache); `npm run test:guards` names any registry entry
   (`tests/data/frozen-globals.json`) the new global needs.
4. `js/track/tracks.js` after `startline` (:282): create `track.meshes.pitSigns`
   and `track.meshes.pitSignTex` behind the feature-detect, `Log.warn` on
   throw (+8; ratchet 2680 has slack).
5. `js/game.js`: free both in the track-change block (:2083, +2); draw after
   `gfx.drawSky` (:6940, +4) with a pooled `_pitSignOpts` (+1) and the
   distance gate. Ratchet: the file is 1 line under its 8790 ceiling — raise it
   deliberately with `node tools/check/ratchets.mjs --update` and say why.
6. `js/agent/apex.js`: `pitSigns()` → `{cells, mesh, tex, drawn}` (+6),
   register in `agentHelp`, add the row to `docs/DEBUG-HOOKS.md`.
7. `tests/unit/pit-signs.test.mjs` (VM `buildContext()`; silverstone /
   albert_park / bahrain — `pit-complex`'s trio, one left-hand pit): 12 cells,
   `cells[i].team === pit.row.boxes[i].team`; each quad centre `0.275 (± lift)`
   inside the garage line with `dot(n, -sd*r) > 0.99`; y in 4.85-5.55,
   half-width ≤ 2.6; winding not mirrored; UVs inside their cell; `propsGeo`
   vertex count unchanged; no `pitSigns` on a `narrow` circuit. Quad
   collection follows `tests/unit/garage-sign-occlusion.test.mjs:75-93`.
8. `tests/specs/pit-signs.spec.js` in `test:circuits` (`tests/groups.json`,
   then `node tools/gen/gen-test-groups.mjs`): boot `albert_park` as
   `tests/specs/pit-lane.spec.js:31-40` does (`race`, `awaitTrackBuild`,
   headless), assert `__apex.pitSigns()` = `{cells: 12, mesh: true, tex:
   true}`, `drawn ≥ 1` after one presented frame, and `meshToggle({pitSigns:
   true})` stops it. There is no garage-sign browser spec to copy; the
   garage's gate is the unit test above (recording Gfx, `:36-69`).
9. Docs: a row in `docs/README.md` §research; one line in
   `docs/ARCHITECTURE.md` §Render-side clipping naming the 1 cm standoff.

## 6. Cost and risks

- Per frame: +1 `drawDecal` (48 verts, 72 indices, all bays in one mesh); 1 of
  WGX's 128 decal slots; 1-2 cached TLX materials. Zero change to the props
  buffer, chunked mesh, instanced batches or audit baselines.
- Memory: 1024×512 RGBA + mips ≈ 2.8 MB (a livery atlas is 6.99 MB,
  `liverytex.js:27`); 0.7 MB on mobile. GLX's `texCensus` counts it as
  `content2D`; TLX/WGX do not census (`tlx.js:2488-2495`). Painted once per
  track build (a few ms), freed with the track.
- Headless: no `document`, `LiveryTex` or `createTexMesh` in the VM — every
  GPU/paint step is feature-detected, so `verify-track`, the audits and the
  foundation specs see only the pure `track.pitSigns` numbers.
- No fog and no shadows in the decal shader: a sign 300 m off on a foggy dusk
  would float unfogged — the 350 m gate bounds it; `uFog*` in three decal
  shaders is the real fix if it shows. The unshadowed 1 cm strip under the
  roof slab is invisible from 10 m.
- Night: sun ≈ 0 leaves ambient only; `glow 0.5` reads as a lit fascia (the
  garage's 0.62 is the calibration point) — tune on `pit-shots --tod night`.
- The custom team's uploaded mark can change after the build: the garage
  repaints on `LiveryTex.onMarkChange` (`scene.js:1260-1262`); here "next
  track build" is the cheap answer, an atlas-only repaint the right one.
- Backends: all three expose the trio (`gfx.js:50-53`) on one lighting graph,
  so no WGSL/TSL edit and no `wgx-validate`; a boot probe each is still owed.

## 7. Verification (per AGENTS.md, cheapest first)

1. `node tools/track/verify-track.cjs albert_park` (and `silverstone`,
   `bahrain` for the left-hand pit) — 2 s each, must stay green with
   `track.pitSigns` present and the props vertex count unchanged.
2. `npm run test:tooling-fast` — runs `pit-complex`, `pit-signs`,
   `garage-sign-occlusion`, `load-order`, `global-registry`, `frozen-globals`,
   the ratchet check; `npm run test:guards` before the commit.
3. ONE spec, backgrounded: `npm test -- tests/specs/pit-signs.spec.js` with
   its log in `artifacts/`, anchored on `= run (passed|failed|…)`. Then
   `node tools/ci/pick-tests.mjs` and name any further group as not-run.
4. Visual sign-off: `node tools/shot/pit-shots.mjs albert_park --teams
   mercedes,ferrari` (the `05-box-*` frames are the 16 m / 3 m framing this
   plan is sized for), then `--tod night` for the glow, then `--full` once.
5. Backends: `node tools/gfx/gfx-probe.mjs --backend webgpu albert_park` and
   `--backend three --tlx-webgpu --lavapipe albert_park`, `gpuErrors` 0; no
   shader changed, so `gpu-census.yml` is only owed if a probe disagrees.

## 8. Open questions

- Fascia only, or also the 1.2 m hospitality-band sign per bay?
- `short` beside the crest, or crest alone on the fascia and the name on the
  band? (§4: text is for the box framings, not the lane.)
- Night glow 0.5 vs the car decals' 0.35 — decide on the night shot.
- Repaint on custom-mark change, or wait for the next track build?
- Sponsor boards on the jambs and a "RACE CONTROL" sign on the tower are the
  same mechanism with more cells — a second cell type now, or later?
