> Coverage update: Initial18-file ledger retained. track-tail-complete.md closes all ten pending files; the combined28-file hash/range inventory is complete.

# Track engine complete-read ledger (in progress)

This is an incremental source audit, not a completion claim. Scope: every JavaScript file under `js/track/`, including scenery helpers. No source edits, browser work or commits. Read on 2026-10-27. Full ranges below were delivered without truncation; an earlier oversized combined response was truncated and is not counted. Instructions read: root `AGENTS.md`, `js/track/AGENTS.md`, `.claude/skills/code-nav/SKILL.md`.

Coverage checkpoint: **18/28 JS files, 5,559/16,090 lines fully read**. Ten engine files remain unread.

## Coverage

| File | Lines | SHA-256 | Fully read ranges |
| --- | ---: | --- | --- |
| `js/track/build-client.js` | 453 | `77dc8b5e2ca3309594bd2aa172b27ba94d458c6e1695719ed6cba75ce3f504e0` | 1–240; 241–350; 351–453 |
| `js/track/build-worker.js` | 220 | `03e37c2fc90eb818e5e236caef923b60d426b0d3dd332a11250d4747ec86a16a` | 1–220 |
| `js/track/circuit-elevations.js` | 26 | `d039d5f05aab1afb35797ed26aee73d972c423a9172dd7b54e0617cb10e6a4cc` | 1–26 |
| `js/track/circuit-meta.js` | 58 | `03d63daea62ac9f739115cf94e9bb4dd5796e414384a8f922e6beeb4e32d7d8b` | 1–30; 31–58 |
| `js/track/core/def.js` | 311 | `db57bd98e7c4a42dc2b3da78f86c4764c554374130a3e775a3f7a4bf059f6070` | 1–311 |
| `js/track/core/geom.js` | 370 | `b26d3ac24079b41009a095c9ca6f38ac44720d284c376a588932ac160ce0187a` | 1–190; 191–370 |
| `js/track/core/hidden-faces.js` | 615 | `fb817d5a457dbe3f0607ed390505f2414a476ee627b8ca7e16b74605d41c291a` | 1–205; 206–410; 411–615 |
| `js/track/core/line.js` | 611 | `9b2a96ce16ebdad10b8555c07ca8a5ddb3a2477eaf055b61443cbba5337436ea` | 1–200; 201–400; 401–611 |
| `js/track/core/mesh.js` | 1575 | `8e73c2816f2fa9bf1c711813533e7c87c89a551be7556b90469364b308f8585c` | UNREAD |
| `js/track/core/pit.js` | 490 | `28d9e328f6b4b161c4212ad89725e73b254005a59cc973f0cc11eab5236ea872` | 1–140; 141–300; 301–490 |
| `js/track/core/space.js` | 168 | `d072821e18a358988a6e404873da645aa7d0d46c31e07a42b50c3e4ef655762a` | 1–168 |
| `js/track/core/spline.js` | 376 | `5ab93164ad1f61ed912a072a3caa48c7e40c8eb63d65ba8e87741417f3d811d1` | 1–195; 196–376 |
| `js/track/core/surface.js` | 182 | `a727c04aef70838131ea2bcca9751f4ffdb3dc8ffd7e8f5b93591d439aa21653` | 1–182 |
| `js/track/scenery/build-props.js` | 2290 | `8b508e1c98ee00ab02a88acd6843371a6fa6c8414837eea86f775a5936eb785c` | UNREAD |
| `js/track/scenery/circuit-kit.js` | 432 | `9aa4b4ede7b0108098c03841ec032a7c0e0550f2e967baf3709ca3761b523279` | UNREAD |
| `js/track/scenery/city.js` | 930 | `cd54bb6492f48c13b28fb3939f1f6ce32af59a8fda12497f83f87a564e1843dc` | UNREAD |
| `js/track/scenery/data.js` | 196 | `8be87c5a05f88e096277395d875fa8dab71f9d8f5575bd3ff1cb678ade0d4f28` | 1–196 |
| `js/track/scenery/graph.js` | 505 | `ced880aaf25fd30b966dd44b2675737c196f17f2209adb756144215f139cf2c1` | UNREAD |
| `js/track/scenery/guards.js` | 191 | `64eb74cc6d61e828ed7500ea8ea058d2db1614cb44fe58c0a92677dfa5c327cc` | 1–191 |
| `js/track/scenery/identity.js` | 449 | `59794921b71390b85f70296aa2151ebd46687983e81237a6a6bcc59cd25f7ff0` | UNREAD |
| `js/track/scenery/landmark-kit.js` | 203 | `d4f237a767b9d3c47b96a990d401aa671d5c53664ba4c984190bdaca12bafb91` | 1–203 |
| `js/track/scenery/models.js` | 803 | `eda48fc3a05ecc1c28eed487c07600184a013410939ffcb2755a3ec55f36743f` | UNREAD |
| `js/track/scenery/nature.js` | 1626 | `1a7da353b988c273362b3121129df92b3e4e252dcdd313f8092b0405eeb19faf` | UNREAD |
| `js/track/scenery/pits.js` | 791 | `cbd80e49853a8975f0656a1472d13532ff48bc38fef3802f742db9e73e72217c` | UNREAD |
| `js/track/scenery/structures.js` | 1130 | `28c1d77dcdef94fa5ae828dcf6ea7693cd9aca7878fc12c9320ac8e23942b8b5` | UNREAD |
| `js/track/scenery/themes.js` | 89 | `45ad1960354dc6adc4942974938e1f06333c5882101e3f0df98b82930373471a` | 1–89 |
| `js/track/scenery/venue.js` | 140 | `aa2aaf640527467f02a8c60073d29f3dd9585b3624a5f82289362c6382870acd` | 1–140 |
| `js/track/tracks.js` | 860 | `62abbda18aae41e6e016b4fdc1a6dbd346810f72c92058521405fd0b7149f9bb` | 1–120; 121–280; 281–440; 441–650; 651–860 |

## Architecture established from fully read source

- `TrackDef.fromRaw` builds the runtime def through an explicit field copy, normalized day/night palettes, lazy `points` getter, optional surveyed heights and width zones. Materialization reverses/rotates source nodes and remaps elevation/bridge anchors against the scenery authoring origin.
- `TrackSpace` owns source-index/racing transforms, scenery origin shift, lap mirroring and full-lap-preserving ranges. Index fractions and physical arc fractions are distinct; `_sceneryShift` is computed from dense chord lengths in `Tracks.buildCenterlineFresh`.
- `Tracks` resamples splines at approximately 4 m, bakes tangents/right vectors, curvature, racing line and bank profile. Full builds run the same generator synchronously (`build`) or cooperatively (`buildPaced`); full builds require `gfx.createMesh`. Pit precedes terrain surface and props. Props are sealed, stripped, compacted, uploaded and optionally retained for diagnostics. Geometry retention differs from GPU lifetime. Terrain height uses a transferable 8 m CSR triangle grid and chooses the highest containing triangle.
- Worker builds use the same manifest module list and `Tracks.build`, recording renderer uploads as tokens. Arrays and the terrain grid transfer; functions, graph, gfx and def do not. Page replay uploads in slices, reconstructs sampler/def/gfx, transfers derived origin fields back, paints pit signs, and frees partial resources on errors or cancellation. Independent callers preserve their own liveness; equal requests share only when ownership matches. Readiness and build replies have 30 s ceilings.
- `TrackSurface.profile` owns terrain rails, floor, bridge subtraction, run-off shelves, pit-side flattening, optional berms and optional extended falloff. `TrackSpline` owns spline interpolation, sampling, curvature, hinted/world projection, boundaries/posts and fold diagnostics; hintless projection accelerates via a 32 m segment CSR grid.

- `TrackPit` is the single model for pit bands, lane windows, row spacing, signs, entry/exit taper, working-lane flare and boundary opening. The row omits legends, adds custom once, pads to twelve in bare VMs and omits bays when full width cannot fit; street/full build a separate complex, narrow is painted only. Exit-window pullback spends only bay-row slack to improve merge straightness.
- `TrackGeom` owns material IDs (including fractional sway weights), handedness-aware boxes, outward-oriented polygons, primitive emitters, procedural mountains and uniform/yaw baked-model stamping. `TrackLine` derives wrap-aware corner runs, a knot seed, bounded coarse-to-fine exact-curvature relaxation, slope trim, inner/outer families, overtaking quality and calibrated path curvature. Two-entry memoization compares curvature/width float bits and returns fresh output copies.
- `SceneryThemes` merges deterministic theme defaults/overrides and hashes variants. `TrackSceneryData` supplies generic palettes, city-theme defaults, stand liveries, digit segments and Monaco's regulation distance exception. `SceneryVenue` searches six bounded race-day facility slots on level free terrain with trial model admission. `SceneryGuards` implements road/pit footprint rejection using shared node grids; trees may overhang only above the complex. `LandmarkKit` validates and bounds architectural subforms over caller-owned staging primitives.

- `TrackHiddenFaces` recognizes opaque static addBox signatures, indexes ordinary/giant boxes separately, strips fully enclosed/buried/down-facing terrain-adjacent triangles, then compacts only unreferenced vertices while remapping provenance blocks. Flag triangles are preserved. Generator boundaries split phases, not each individual loop. The header says “same five points” for bottom checks, but implementation checks three corners plus centroid plus three midpoints (seven points), consistent with buried checks.

## LSP evidence

Attached tools were used, not inferred from config. `lsp_references(Tracks.build, files:true)` returned four references in `js/track/tracks.js` (2), `js/game.js` (1), `js/track/build-worker.js` (1). `Tracks.buildPaced` returned three references across tracks.js (2) and game.js (1). `lsp_hover(TrackModel)` identifies the built-track interface at `types/game-ctx.d.ts:66`; the entire declaration (`types/game-ctx.d.ts:66–72`) was read. It pins only `def` and `total`, permitting all other members as `unknown`; it is a deliberately loose contract. Consumer ranges read: `js/game.js:1945–2015` and `2040–2090`. `loadTrackStepped` hydrates circuit/build modules, frees the old world, tries worker+replay only for in-session race/count switches, falls back to paced builds, and frees superseded partials. `_loadTrackBody` adopts a supplied build or calls `Tracks.build` synchronously, then registers furniture and world state. The intervening `game.js:2016–2039` is not counted as read.

## Evidenced comment issues (source unchanged)

1. `tracks.js:194–219` still tells maintainers to widen both `hw` sides for a pit lane and discusses `PIT_TAPER`. Immediately after, line 220 bakes the racing line without any width change; `tracks.js:235–242` explicitly says widening is gone and the road never moves. The old block contradicts the implemented pit architecture and the adjacent replacement explanation.
2. `core/def.js:195–201` cites `tracks.js:~815/~819/~1816` for scenery theme/own-pit consumers even though tracks.js is only 860 lines and delegates props to `scenery/build-props.js`. These are stale navigation references after extraction; actual current consumers need LSP confirmation.
3. `core/space.js:110` calls the callback frame `AUTHORIZED-frame`; the surrounding API and function name use `Authored`. Likely wording typo, with no runtime impact.
4. `core/def.js:302` says width zones stay in racing-lap space, while the immediately preceding mapping passes `TrackSpace.range(..., "source")` and the space module explicitly documents width zones as source-space. Needs clarification of authoring versus post-remap state.

5. `core/pit.js:38–40` describes the sign atlas as 1024×512, while the immediately following `SIGN` data is `{w:1024,h:1024}` and crest/signal rows use y=512/848. The prose reflects the older upper sign atlas and should distinguish it from the expanded full canvas.
6. `core/def.js:235–237` still says `LIST.length===40`, while generated `circuit-meta.js:6–57` pushes 52 entries. It is a historical performance sample, but its imperative wording gives an obsolete roster invariant.
7. `scenery/data.js:1` still locates buildProps in tracks.js; the fully read tracks.js header delegates it to `scenery/build-props.js`.

## Exact continuation

Next: `core/mesh.js:1–1575`, then scenery `build-props.js:1–2290`, `circuit-kit.js:1–432`, `city.js:1–930`, `graph.js:1–505`, `identity.js:1–449`, `models.js:1–803`, `nature.js:1–1626`, `pits.js:1–791`, `structures.js:1–1130`. These are precisely the UNREAD engine files; no partial reads of them are claimed. For large files use chunks of about 150–220 lines, output budgets sized to prevent truncation. Update ranges and hashes after each file. Finish architecture and consumer evidence only after all engine files are read.
