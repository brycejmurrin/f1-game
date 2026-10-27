# Track engine and circuit map

## Goal
Map `js/track/` and `js/circuits/` from the present checkout, with bounded source inspection and explicit limits. This is a navigation report, not a geometry or visual certification. No runtime source was changed and no browser was opened.

## Source identity
- Checkout: `/workspace/f1-game`; branch `cursor/project-map-a84f`.
- Inspected HEAD: `ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb` (2026-10-27 UTC session).
- Read root `AGENTS.md`, both scoped `AGENTS.md` files, and `.claude/skills/code-nav/SKILL.md`. The engine/data boundary, coordinate conventions, generated-file rule and scenery contract govern this map.
- Identity is this local checkout. Attached LSP returned matching paths and line numbers; its output did not independently attest a remote Git SHA.

## Inventory
132 JavaScript files / 62,355 lines: 28 engine files (5 root, 9 core, 14 scenery), 52 circuit definitions and 52 matching scenery callbacks. Each scoped directory also contains `AGENTS.md` and `CLAUDE.md`; the latter import/config wrappers were inventoried, not read. Counts came from filesystem enumeration and `wc -l`, not prior documentation.

## Architecture and data flow
1. This is script-global IIFE code. `tools/manifest.cjs` owns loading order; its inspected text identifies `LAZY_CIRCUIT`, `LAZY_SCENERY` and `TRACK_VM`. Generated `circuit-meta.js` registers lightweight `_metaOnly` picker records in `window.TrackDefs`; full circuit files push raw definitions into that registry. Full loader implementation was outside this inspection.
2. `TrackDef.fromRaw` supplies the built definition and lazy point materialization. Read factory sections show source-point reordering, width-zone remapping, and elevation/bridge mapping against the authoring origin. `Tracks.LIST` maps raw defs through this factory; `hydrate` updates the existing object and registry references, invalidates map/preview caches, and removes `_metaOnly`.
3. `Tracks.buildCenterline` interpolates path points, closes the seam, resamples to roughly 4 m nodes (minimum 200), computes tangents/right vectors, real/authored elevations and curvature. Zero-length laps throw. `_sceneryShift` is an arc-length offset computed from a control-point origin; it is not simple fraction subtraction.
4. `TrackSpace` centralizes source/racing coordinates, reversal, scenery authoring origins and range endpoints. Full-lap ranges short-circuit before modulo can collapse 0→1. Authoring frame, control-index fraction and racing arc are distinct concepts.
5. `Tracks.buildSteps` requires `gfx.createMesh`; it creates centreline, pit model, surface profile, floor, road, terrain, props, then opens the pit driving boundary. Geometry validation, hidden-face stripping and vertex compaction happen before final prop upload. `build` drains the generator synchronously; `buildPaced` slices the same steps, checks generation/liveness and hands abandoned partial resources to its callback. `free` releases backend resources.
6. `TrackBuildProps` coordinates generic data/themes, guards, graph/model helpers and the bespoke callback. At lines 2012–2013 an inline `def.scenery` takes precedence over `window.TrackScenery[id]`; missing closures warn. The callback receives the frozen-contract API with coordinate wrappers when necessary. Venue facilities follow it; foliage is deferred until barriers/solid footprints exist; pit furniture derives from `track.pit`.
7. The worker records gfx operations while running the same track builder; page replay owns actual GPU uploads. Inspected headers/initial code describe transferable buffers, model-residency checks, team injection and null/fallback behavior. The complete worker protocol and replay cleanup were not read.
8. Core modules separate definition factory, spline/projection, geometry emitters, mesh/banking, pit model, ground profile, racing line and hidden-face optimization. Scenery modules separate city/nature/structures/identity/pits/venue, shared defaults/themes, reusable kits, staging/validation and graph instancing. These latter roles are header/export evidence unless a deeper range is listed below.

## File-by-file coverage
“Partial” means only listed ranges or header/export excerpts were inspected, and is not a full behavioral review. Some large batched outputs were truncated; omitted content is not counted as read. “Unread” means inventory only. Circuit path arrays were read as data, without geometric validation.

| File | Lines | Coverage |
|---|---:|---|
| `js/circuits/abudhabi.js` | 66 | Unread: inventory only. |
| `js/circuits/albert_park.js` | 66 | Unread: inventory only. |
| `js/circuits/anderstorp.js` | 76 | Unread: inventory only. |
| `js/circuits/bahrain.js` | 73 | Unread: inventory only. |
| `js/circuits/baku.js` | 61 | Unread: inventory only. |
| `js/circuits/brands_hatch.js` | 73 | Unread: inventory only. |
| `js/circuits/buddh.js` | 90 | Unread: inventory only. |
| `js/circuits/buenos_aires.js` | 69 | Unread: inventory only. |
| `js/circuits/catalunya.js` | 88 | Unread: inventory only. |
| `js/circuits/cota.js` | 72 | Unread: inventory only. |
| `js/circuits/dijon.js` | 62 | Unread: inventory only. |
| `js/circuits/donington.js` | 74 | Unread: inventory only. |
| `js/circuits/estoril.js` | 100 | Unread: inventory only. |
| `js/circuits/fuji.js` | 71 | Unread: inventory only. |
| `js/circuits/hockenheim.js` | 67 | Unread: inventory only. |
| `js/circuits/hungaroring.js` | 57 | Unread: inventory only. |
| `js/circuits/imola.js` | 89 | Unread: inventory only. |
| `js/circuits/indianapolis.js` | 103 | Unread: inventory only. |
| `js/circuits/interlagos.js` | 64 | Unread: inventory only. |
| `js/circuits/istanbul.js` | 85 | Unread: inventory only. |
| `js/circuits/jacarepagua.js` | 81 | Unread: inventory only. |
| `js/circuits/jeddah.js` | 76 | Unread: inventory only. |
| `js/circuits/jerez.js` | 79 | Unread: inventory only. |
| `js/circuits/korea.js` | 88 | Unread: inventory only. |
| `js/circuits/kyalami.js` | 84 | Unread: inventory only. |
| `js/circuits/madrid.js` | 94 | Unread: inventory only. |
| `js/circuits/magny_cours.js` | 79 | Unread: inventory only. |
| `js/circuits/mexico.js` | 106 | Unread: inventory only. |
| `js/circuits/miami.js` | 70 | Unread: inventory only. |
| `js/circuits/monaco.js` | 128 | Fully read. |
| `js/circuits/mont_tremblant.js` | 73 | Unread: inventory only. |
| `js/circuits/montreal.js` | 61 | Unread: inventory only. |
| `js/circuits/monza.js` | 81 | Unread: inventory only. |
| `js/circuits/mosport.js` | 95 | Unread: inventory only. |
| `js/circuits/mugello.js` | 90 | Unread: inventory only. |
| `js/circuits/nurburgring.js` | 74 | Unread: inventory only. |
| `js/circuits/okayama.js` | 62 | Unread: inventory only. |
| `js/circuits/paul_ricard.js` | 94 | Unread: inventory only. |
| `js/circuits/portimao.js` | 93 | Unread: inventory only. |
| `js/circuits/qatar.js` | 65 | Unread: inventory only. |
| `js/circuits/redbull.js` | 68 | Unread: inventory only. |
| `js/circuits/scenery/abudhabi.js` | 1024 | Unread: inventory only. |
| `js/circuits/scenery/albert_park.js` | 787 | Unread: inventory only. |
| `js/circuits/scenery/anderstorp.js` | 953 | Unread: inventory only. |
| `js/circuits/scenery/bahrain.js` | 1203 | Unread: inventory only. |
| `js/circuits/scenery/baku.js` | 870 | Unread: inventory only. |
| `js/circuits/scenery/brands_hatch.js` | 935 | Unread: inventory only. |
| `js/circuits/scenery/buddh.js` | 715 | Unread: inventory only. |
| `js/circuits/scenery/buenos_aires.js` | 380 | Unread: inventory only. |
| `js/circuits/scenery/catalunya.js` | 454 | Unread: inventory only. |
| `js/circuits/scenery/cota.js` | 627 | Unread: inventory only. |
| `js/circuits/scenery/dijon.js` | 824 | Unread: inventory only. |
| `js/circuits/scenery/donington.js` | 704 | Unread: inventory only. |
| `js/circuits/scenery/estoril.js` | 441 | Unread: inventory only. |
| `js/circuits/scenery/fuji.js` | 593 | Unread: inventory only. |
| `js/circuits/scenery/hockenheim.js` | 497 | Unread: inventory only. |
| `js/circuits/scenery/hungaroring.js` | 879 | Unread: inventory only. |
| `js/circuits/scenery/imola.js` | 885 | Unread: inventory only. |
| `js/circuits/scenery/indianapolis.js` | 559 | Unread: inventory only. |
| `js/circuits/scenery/interlagos.js` | 1040 | Unread: inventory only. |
| `js/circuits/scenery/istanbul.js` | 357 | Unread: inventory only. |
| `js/circuits/scenery/jacarepagua.js` | 532 | Unread: inventory only. |
| `js/circuits/scenery/jeddah.js` | 840 | Unread: inventory only. |
| `js/circuits/scenery/jerez.js` | 797 | Unread: inventory only. |
| `js/circuits/scenery/korea.js` | 485 | Unread: inventory only. |
| `js/circuits/scenery/kyalami.js` | 593 | Unread: inventory only. |
| `js/circuits/scenery/madrid.js` | 1104 | Unread: inventory only. |
| `js/circuits/scenery/magny_cours.js` | 652 | Unread: inventory only. |
| `js/circuits/scenery/mexico.js` | 1097 | Unread: inventory only. |
| `js/circuits/scenery/miami.js` | 926 | Unread: inventory only. |
| `js/circuits/scenery/monaco.js` | 1731 | Partial: 1–28 (registration/API/local frame comments). |
| `js/circuits/scenery/mont_tremblant.js` | 964 | Unread: inventory only. |
| `js/circuits/scenery/montreal.js` | 1111 | Unread: inventory only. |
| `js/circuits/scenery/monza.js` | 956 | Unread: inventory only. |
| `js/circuits/scenery/mosport.js` | 559 | Unread: inventory only. |
| `js/circuits/scenery/mugello.js` | 731 | Unread: inventory only. |
| `js/circuits/scenery/nurburgring.js` | 508 | Unread: inventory only. |
| `js/circuits/scenery/okayama.js` | 728 | Unread: inventory only. |
| `js/circuits/scenery/paul_ricard.js` | 670 | Unread: inventory only. |
| `js/circuits/scenery/portimao.js` | 782 | Unread: inventory only. |
| `js/circuits/scenery/qatar.js` | 747 | Unread: inventory only. |
| `js/circuits/scenery/redbull.js` | 674 | Unread: inventory only. |
| `js/circuits/scenery/sepang.js` | 498 | Unread: inventory only. |
| `js/circuits/scenery/shanghai.js` | 1091 | Unread: inventory only. |
| `js/circuits/scenery/silverstone.js` | 1400 | Unread: inventory only. |
| `js/circuits/scenery/singapore.js` | 1176 | Unread: inventory only. |
| `js/circuits/scenery/sochi.js` | 578 | Unread: inventory only. |
| `js/circuits/scenery/spa.js` | 925 | Unread: inventory only. |
| `js/circuits/scenery/suzuka.js` | 993 | Unread: inventory only. |
| `js/circuits/scenery/vegas.js` | 915 | Unread: inventory only. |
| `js/circuits/scenery/watkins_glen.js` | 664 | Unread: inventory only. |
| `js/circuits/scenery/zandvoort.js` | 897 | Partial: 1–28 (registration/API/palette). |
| `js/circuits/scenery/zolder.js` | 985 | Unread: inventory only. |
| `js/circuits/sepang.js` | 90 | Unread: inventory only. |
| `js/circuits/shanghai.js` | 74 | Unread: inventory only. |
| `js/circuits/silverstone.js` | 86 | Unread: inventory only. |
| `js/circuits/singapore.js` | 150 | Unread: inventory only. |
| `js/circuits/sochi.js` | 85 | Unread: inventory only. |
| `js/circuits/spa.js` | 82 | Unread: inventory only. |
| `js/circuits/suzuka.js` | 86 | Unread: inventory only. |
| `js/circuits/vegas.js` | 80 | Unread: inventory only. |
| `js/circuits/watkins_glen.js` | 76 | Unread: inventory only. |
| `js/circuits/zandvoort.js` | 95 | Fully read. |
| `js/circuits/zolder.js` | 78 | Unread: inventory only. |
| `js/track/build-client.js` | 453 | Partial: 1–95 (setup/defaults/drop); remainder unread. |
| `js/track/build-worker.js` | 220 | Partial: 1–85 (imports/team/model residency/transfers); remainder unread. |
| `js/track/circuit-elevations.js` | 26 | Partial: generated header and sampled profile rows; numerical profiles not audited. |
| `js/track/circuit-meta.js` | 58 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/core/def.js` | 311 | Partial: 1–65 and 250–311, plus header/export; intervening field-copy implementation unread. |
| `js/track/core/geom.js` | 370 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/core/hidden-faces.js` | 615 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/core/line.js` | 611 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/core/mesh.js` | 1575 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/core/pit.js` | 490 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/core/space.js` | 168 | Fully read. |
| `js/track/core/spline.js` | 376 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/core/surface.js` | 182 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/build-props.js` | 2290 | Partial: 1–65, 195–230, 1998–2030, 2080–2115 and 2210–2290; remainder unread. |
| `js/track/scenery/circuit-kit.js` | 432 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/city.js` | 930 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/data.js` | 196 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/graph.js` | 505 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/guards.js` | 191 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/identity.js` | 449 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/landmark-kit.js` | 203 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/models.js` | 803 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/nature.js` | 1626 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/pits.js` | 791 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/structures.js` | 1130 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/scenery/themes.js` | 89 | Fully read. |
| `js/track/scenery/venue.js` | 140 | Partial: header/export excerpts only (bounded batch; some output truncated). |
| `js/track/tracks.js` | 860 | Partial: 1–210, 287–410, 471–560, 610–677, 680–860 requested; truncated batches mean portions are unconfirmed. LSP exported outline also read. |

## LSP evidence
Attached `mcp__codex_apps__f1_cloud_mcp_apex_lsp` tools were used successfully:
- `lsp_outline({symbol:"Tracks",limit:100,outputLevel:"full"})`: `js/track/tracks.js:3`, 31 exported / 42 internal members. Confirmed `buildCenterline:47`, `buildSteps:287`, `build:471`, `buildPaced:493`, `free:513`, `hydrate:650`, `terrainY:788`. This is an exported outline, not a read of every body.
- `lsp_references({symbol:"Tracks.build",files:true,outputLevel:"full"})`: 4 references in 3 files: `js/track/tracks.js` (2), `js/game.js` (1), `js/track/build-worker.js` (1). Response identified query location `js/game.js:2071:29`. This semantic result supports page/worker entry points; aliases or dynamic property access may require separate queries.
No diagnostics, callers graph, browser probes or executable geometry checks were run.

## Comment findings with proof
- **Confirmed stale navigation wording, low risk:** `core/space.js:77–78` attributes control-index origin resolution to `resolve()`; `core/space.js:127` likewise calls width-zone remapping `resolve()`'s work. The inspected `core/def.js:250–311` implements this in `materializeListPoints` using `racingNodeToSource` and `TrackSpace.range`; the Tracks LSP outline has no exported `resolve`. The coordinate explanation remains useful; its implementation pointer needs refreshing in a separate change.
- **Confirmed comment typo:** `core/space.js:110` says callback receives “AUTHORIZED-frame k”; its `sceneryNodeToAuthored` name, inverse implementation and adjacent discussion clearly mean authored frame. No runtime impact.
- **Confirmed fallback-order wording drift:** `scenery/build-props.js:2007` says “`|| def.scenery` keeps an inline closure working,” but actual selection at 2012 starts with `def.scenery || registry`. Lines 2009–2011 correctly explain the current precedence. Updating only the obsolete expression would remove ambiguity.
- **Historical measurements are not present-day inventory:** scenery callback headers and build-props comments cite “all 40” / 1,083 KB; current enumeration is 52 callbacks. They use past tense and describe the extraction baseline, so this map does not label those figures false or replace them with unmeasured sizes.
- Comments asserting byte identity, historical rendering defects, real-world circuit geometry and measured performance were treated as author claims. This read-only map did not reproduce those measurements or verify linked external sources.

## Risks/unknowns
- Most of the 62k-line scope remains unread. In particular 50 defs and 50 callbacks were inventory-only, and all major geometry/scenery builders remain partial. No claim of fleet correctness follows from this report.
- Source/racing/index/arc frames, `_sceneryShift`, reversed circuits and wraparound ranges create high change sensitivity. Monaco and Zandvoort provide concrete examples; their detailed placement numbers were not tested.
- API membership is documented as 114 and guarded by `tests/unit/scenery-api-contract.test.mjs`; that test was not read/run, so this is an instruction/contract reference, not a verified count.
- Worker serialization/replay, cancellation/resource cleanup, caches and backend-specific packing need deeper body reads before changes. Geometry upload/free behavior was mapped only through inspected slices.
- Renderer, physics and editor consumers are outside this lane; semantic references establish entry points only. Manifest and referenced tests were sampled as navigation context, not audited.

## Next steps
1. For a concrete edit, use LSP definition/callers on the target export and read only the relevant unread bodies/circuit callback, preserving this coverage ledger.
2. For geometry or circuit edits, follow scoped instructions: run `node tools/track/verify-track.cjs <id>` first, then the change-aware test selection. This report changes prose only; the parent owns docs-only validation and Git serialization.
3. A separate comment-only patch could refresh the stale `resolve()` pointers, authored-frame typo and fallback-expression wording after confirming exact current lines. No source fixes were bundled into this report.
