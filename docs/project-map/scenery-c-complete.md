# Scenery C — complete callback reading map

Read on 2026-10-27 at checkout HEAD `212adc24b985b120a63507c988abea69e7740e74`. Scope is positions **27–39 inclusive** of lexicographically sorted `js/circuits/scenery/*.js`: Magny-Cours through Portimão, 13 of 52 callbacks. Every source line in this scope was read, including local emitters and comments. This is a source relationship map; it does not assert rendered appearance or current audit metrics. No runtime source, browser session, tests, or git history was changed by this pass. Parent owns verification and persistence through git.

Instructions read: root `AGENTS.md`, nested `js/circuits/AGENTS.md`, `js/track/AGENTS.md`, `.claude/rules/game-code.md`, and `.claude/skills/code-nav/SKILL.md`. The nested instruction files are symlinked area rules. Symbol navigation used apex-lsp, primarily the local `bash tools/mcp/lsp-mcp.sh` entry point. Source file reads and AST extraction supplement semantic navigation rather than replace it.

## Full-file reading ledger

All ranges are inclusive, gap-free, and cover the exact source bytes hashed below. An initial combined Magny-Cours/Mexico request hit an outer output cap; it is excluded from this ledger. Magny-Cours 331–652 and all of Mexico were subsequently re-read as separate nontruncated bounded requests. Outlines, AST inventories, helper snippets and the truncated broad SCENERY-API.md request do not count as full-file reads.

| Position | File under js/circuits/scenery/ | Lines | Complete visible read ranges | SHA-256 |
|---:|---|---:|---|---|
| 27 | magny_cours.js | 652 | 1–330; 331–652 | `4b527de2cf4703c9821666be187780846573c62c36a7f127adcd0686fee21caf` |
| 28 | mexico.js | 1097 | 1–360; 361–730; 731–1097 | `3892cb16c69db40988e0dd68488107f5f4e334e1ee025be0df9ce7ef15f928df` |
| 29 | miami.js | 926 | 1–470; 471–926 | `c3697eb8cd640f3323459311beee0dc66fc7048b32f640c5f081cd3ae82d9a83` |
| 30 | monaco.js | 1731 | 1–430; 431–860; 861–1290; 1291–1731 | `bafcc09ad5d51bc9a62bb2bbd7b74c7fd11471dbf61130748e763987ade26883` |
| 31 | mont_tremblant.js | 964 | 1–485; 486–964 | `021a460fcb545f7cd31a57735bd84f738bc4e084a3fdae6e7245484e37922d5e` |
| 32 | montreal.js | 1111 | 1–375; 376–745; 746–1111 | `07ebf410b6464d5e9c2096060883bb49c2723ad17d7a6420f5ab7c4afa649cdc` |
| 33 | monza.js | 956 | 1–480; 481–956 | `e1befc0e7691a6ef16a05d55138bd42d7562654860a1b6d89fce054489007a3a` |
| 34 | mosport.js | 559 | 1–280; 281–559 | `ae41aa7adab6790e1ccd628ab61ce8f8f2f6039b93b60c1cc76aa7902201bf4e` |
| 35 | mugello.js | 731 | 1–370; 371–731 | `ddde9704891bb526ecfb5dbaaadca9eca2f3725c98193e9b9adf8e89ee914c3a` |
| 36 | nurburgring.js | 508 | 1–260; 261–508 | `838a479da6a9c3539f12e2971d2e6db59568b8c88b33f78d559a8634d77a86f3` |
| 37 | okayama.js | 728 | 1–365; 366–728 | `aec35897905bcee72b13bb5403ef08c822d4f9148a02b467e994e3e97e3c34e5` |
| 38 | paul_ricard.js | 670 | 1–340; 341–670 | `57760d07332aa1b0eeb3a998dc1d2c3f764efb366c7b9e423186556600fab2f0` |
| 39 | portimao.js | 782 | 1–395; 396–782 | `1e941cea9adacabd32ed90e00fad302eb40cc25818c3e61827fcfc63f996fa84` |

Total: **11,415 lines, 13/13 assigned callbacks**. Other scenery callbacks and circuit definition files are not claimed as full reads here. Corresponding definition metadata was inspected only to verify coordinate modes.

## Shared contracts and semantic navigation

The registry assignment is `window.TrackScenery[id] = function(api)`. Each callback emits into supplied buffers and usually returns nothing. It is data loaded lazily for the chosen circuit, not an independently imported engine module. The frozen API currently has **114 unique members**, explicitly enumerated and count-asserted in `tests/unit/scenery-api-contract.test.mjs:26–59`; the older 112-member wording in Mosport's header is historical.

`TrackBuildProps` orchestrates guarded geometry, helper factories, transformed callback API, then later shared venue and deferred foliage work. LSP outline resolved this module at `js/track/scenery/build-props.js:4`, with `buildSteps:215`, `build:2284`, and internal `transformSceneryApi:71`. `TrackModels` outline resolved `models.js:3`, with `create:215` and `drapeKit:682`; `SceneryNature.create` is `nature.js:54`. The callback outline tool sees the registry function, not every nested helper: all thirteen outlines resolved the expected named callback; the appendix below records nested helpers from full reads and an AST inventory.

| Contract | Verified owner and behavior | Consequence for these circuits |
|---|---|---|
| Node and fraction placement | `transformSceneryApi`, build-props:71–193; `TrackSpace.sceneryNode`, core/space:101–107 | Node helpers accept `K(s)`; stand helpers accept one frac; barrier/terrace helpers accept ranges; raw primitives accept world positions. `along` and `every` hand their callbacks authored-frame nodes so wrapped helpers shift exactly once. |
| Coordinate transform asymmetry | build-props:77–111 and :162–189 | Ordinary node/range helpers remap node/fracs and reverse side. `groundPatch`, `waterField`, `groundedSegments`, `circuitKit` instead use the documented origin-only path; `overheadSpan.rawFrac` bypasses fraction remapping. Paul Ricard compensates groundPatch's side explicitly. Monaco's raw-array and wrapped paths must remain distinct. |
| Anchor | positional LSP definition `nature.js:92:11`, body 92–131 | Normalizes node, computes road-edge-relative XZ and basis, samples rendered terrain beyond 2.2 m, uses banked road datum inside the gap, falls back to ground estimate, and embeds `c` **0.3 m**. It also returns resolved `k`; `a.c` is not exact grade. |
| Primitive origins | LSP `TrackGeom.addBox`, geom:113; positional addPrism:187 and addCyl:221 | addBox uses a center and half extents. Prism and cylinder use a base and extend along basis[1]. Rotating basis to `[r,t,u]` changes a cylinder's axis to the road tangent, used by barrel roofs and fuselages. |
| Foot placement | positional LSP definition `build-props.js:739:11`, body 739–745 | `seat.box` adds half the height along basis[1] to the supplied underside foot. `seat.prism/cyl/cone/frustum` retain native base placement. It does not raycast terrain automatically. Several old comments conflict with this implementation. |
| Foundation | positional LSP definition `build-props.js:752:11`, body 752–773 | Nine samples over a rectangular footprint; terrain fallback; optional explicit ground; fills to absolute `top` with embed (default 0.6). Montreal's footbridge sets embed 0 and supplies anchor+0.3 as fallback grade. |
| Atomic models | positional LSP definition `models.js:232:14`, complete body 232–317 | Declared bounds preflight, private stage, false/empty/nonfinite/index/exception/budget rejection, bounds-escape diagnostic, second preflight over emitted XZ bounds, then append all. Pit supersession records required=false. A `required:true` literal hidden behind an early `onTrack` guard never reaches this validation when that guard skips. |
| Reserved solids | positional LSP definition `build-props.js:1005:11`, complete body 1005–1019 | `indexSolid(s0,s1,side,gap,width)` registers world-space obstacle segments for foliage avoidance. It is distinct from driving-limit registration; modelGroup alone is not a substitute for the explicit reservations in these callbacks. |
| Ordinary placed box | positional LSP definition `build-props.js:1231:11`, complete body 1231–1266 | Terrain sample, four separation slots, **0.8 m base sink**, road rejection, visible-height driving boundary, and solid reservation. Thin paint boxes below the sink can disappear; Miami/Okayama use drape and Mexico/Montreal raise total place height to 0.84. |
| Forest edge | positional LSP definition `nature.js:1511:11`, complete body 1511–1573 | Deferred belt: `col` pine tone, `col2` broadleaf tone, pineFrac selects species, `gap` is canopy clearance, `clearTreeDist` moves/drops against finished solids. `opts.spacing` is now explicitly honored at :1544; density alone quantizes to coarse node spacings. |
| Spectator hill | positional LSP definition `nature.js:1241:11`, relevant body through :1349 | `rows/rise/depth` control the ladder, `grass` falls back to old `col`, and `riser` controls the side tone. `h` and `steps` remain ignored by design (:1273–1286), relevant to Mosport/Okayama. Solids are registered; treads fit neighboring offset-verge geometry. |
| Lighting and water | callback calls plus API contracts | Bright colored geometry alone does not register a light. Mexico explicitly hands custom sodium lenses to apiLampPost; Monaco registers tunnel lenses with always=true; Montreal calls floodMast. waterSurface/waterBand/waterField are typed water helpers, while raw blue boxes are ordinary props. |

Current definition modes: all thirteen explicitly declare `sceneryCoordinates:"racing"` except Monaco (`"source"`). Paul Ricard and Monaco set `reverse:true`; the other eleven set false. Mont-Tremblant keeps `sceneryStartFrac:0` alongside `startFrac:0.6465`; Monaco keeps `sceneryStartFrac:0.28` alongside `startFrac:0.2516`. These are distinct retained origins, not permission to normalize all local fractions globally. `TrackSpace.sceneryOriginDelta` (space.js:91–93) returns built `_sceneryShift` even for racing-coordinate definitions.

Semantic reference evidence (all rows returned completely with limit=20; counts include the declaration):

| Local helper | LSP target | References / actual uses | Call sites |
|---|---|---:|---|
| Magny-Cours vaultStand | magny_cours.js:387:13 | 4 / 3 | 486, 492, 498 |
| Mexico boundedStand | mexico.js:182:13 | 10 / 9 | 205–206, 656–661, 742–743 |
| Miami buildOverpass | miami.js:188:13 | 3 / 2 | 796–797 |
| Monaco KOLD | monaco.js:40:13 | 7 / 6 | 602 (twice), 735, 814, 1023, 1123 |
| Tremblant ridgeAt | mont_tremblant.js:132:13 | 7 / 6 | 353, 361, 468, 477–478, 487 |
| Montreal strut | montreal.js:19:13 | 10 / 9 | 426, 680, 683, 685–686, 688, 755, 757–758 |
| Monza gravelMargin | monza.js:380:13 | 3 / 2 | 394, 408 |
| Mosport mixedWood | mosport.js:122:13 | 13 / 12 | 196, 213, 226, 237–238, 247, 256, 373, 383–384, 426–427 |
| Mugello local cypress | mugello.js:233:16 | 17 / 16 | 200, 203, 212–213, 223, 256, 260–262, 264–266, 608–609, 634–635 |
| Nürburgring local scaffoldStand | nurburgring.js:16:16 | 2 / 1 | 303, Dunlop only |
| Okayama clayCut | okayama.js:157:13 | 4 / 3 | 416, 574, 640 |
| Paul Ricard local bleacher | paul_ricard.js:234:13 | 7 / 6 | 299–304 |
| Portimão hillsideTerrace | portimao.js:154:13 | 7 / 6 | 243, 246–250 |

The attached LSP was also used for TrackModels outline and TrackGeom.addBox/transformSceneryApi definitions; local LSP supplies the positional evidence above. A guessed `TrackSpace.transformSceneryApi` member did not exist, `TrackNature` was the wrong global name, and broad common-name lookups for seat/anchor/place were ambiguous or scoped to no definition. Those unsuccessful calls are not evidence; successful positional definitions resolve the actual implementation. The CLI body flag is `--max-lines=N`.

## Per-circuit geometry map

### magny_cours.js

Lines 9–166 establish French farmland palettes, hand-built narrow poplars, random woodland windows, hedges, nine worked-field patches, terrain-seated plough strips, copses, and low Technopôle midfield sheds. Farm/Adelaide clear zones are explicit; foliage is not uniform across the lap. Lines 168–348 build four required garage bays with tangent-axis barrel vaults, required squat race-control block with attached wing, two gantries, shared start stands and required bespoke tribuna shell, then tech sheds and broadcast compound. `emitControlBlock` stacks seat.box from sampled feet; `emitMainTribuna` supplies shell/seat/roof detail behind shared stands.

Lines 350–481 add signs, required Conservatoire museum and the local `vaultStand` contract. That helper sizes every row by neighboring offset anchors, curvature cap and tangent swing, then adds crowd cubes, terrain-seated cylinder legs, tie beam and six cambered roof bays with blue eaves. Lines 483–652 place vault stands at Adelaide, Estoril and Lycée, gravel/tyres/marshals, grass spectator banks, safety furniture, three world-space ridge rings, required ferme (barn/silos/bales), distant bourg/church, Château d'Eau and optional Technopôle units. Final forest belts deliberately split around the farm and Adelaide stands. Required groups and repeated dynamic groups are listed in the appendix.

### mexico.js

Lines 9–202 bind a vivid fiesta/jacaranda/huizache palette, PIT=+1 and STAND=-1, and define banners, flood masts, registered sodium lamp posts, planted avenue, tiny visible kerb strips and atomic bounded stands. Banners skip sharp road turns and terrain jumps. `blocked` tests manually listed SOLID arcs for direct species calls; `boundedStand` reserves the footprint with lap-length-derived fractions before staging body/crowd/roof. Lines 204–438 build the main two-ring stands, scoreboard, flags/paddock suites, motorhomes and race control, hospitality, Mixhuca park/sports pavilions, T1/Esses/Horquilla stands, low city fronts and deeper skyline. The broad park sections are consciously kept free of generic tall city dressing.

Lines 440–730 build required Palacio de los Deportes as copper frustum rings and inset saddle pylons, park/plaza/service/floor patches, required Foro Sol entry/exit portals, four-tier stadium bowl, closed back walls, upper terraces and seals. Inside bowl/terrace runs break around the tight stadium entry to avoid rows passing the center of curvature. Registered floodMast and required supported scoreboard augment decorative lightMast geometry. Lines 731–978 handle Peraltada's bounded rings, required far stand at gap62, separated single-node terraces, lighting/banners/flags, repeated named grandstands, protected avenue and tree scatter, tyres and kerbs. Lines 980–1097 reserve a stepped pyramid, place Popocatépetl/Iztaccíhuatl from centroid compass bearings, exclude overlapping horizon mountains, draw optional distant airborne approach silhouette with whole-lap clearance search, and place far city towers only when clear of every lap leg. The plane remains intentionally airborne; comments quote historical audits, not this pass's measurements.

### miami.js

Lines 9–210 define teal/coral/pastel/HDR palettes, terrain-fitted drape, guarded beach club with typed pool, terrain-sampled car parks, atomic multi-level parking deck, and required Turnpike overpass/pier assembly with barrier recording. Parking slabs sample 3×3 footprint ground extrema. Lines 212–455 place distant hazed skyline and Hard Rock's large segmented ellipse, roof frusta, neon rims, hospitality cubes, separate required neon guitar tower, kit pits/control and pit-end shells, gantries, stadium-side decorative lamps, palms, T1 stands and low city fronts. The entire stadium is deliberately raw primitive emission because a whole-bowl footprint would reject; its neon tower is the separate required hero.

Lines 457–633 build three required typed marina sheets, terrain-following pontoons, draped paint, bollards, atomic berth yachts, larger yachts and required MSC club, bleachers, stadium-lot stands/car parks, required parking deck, arrival court and hospitality deck. Lines 635–926 add required pedestrian spans at .235/.405 and outer abutments, kit compounds, aqua runoff/striped brake zones, free-standing brand boards and required MIA sign, beach club and art-deco street masses, neon signs, Turnpike calls at .66/.685, back-straight stands/scaffolds, final-sector banks/kerbs/barriers, palm rows and sparse live-oak acacias. `ledFacadeBands` called from inside the neon group does not receive `stage`; nesting alone does not establish atomic membership. Many decorative lamp heads are raw geometry; explicit shared kit/mast registrations are a separate question.

### monaco.js

Lines 9–131 are the highest-risk coordinate boundary in this scope. `KR` maps a source node; `KOLD` applies the retained **index** delta for old raw racing-array readers; `KRACE` inverts the wrapped source+shift node transform for named landmarks; `KRAW` is a racing node; `SRACE` maps a racing fraction to an authored range endpoint, with order reversed for a racing interval. `racingSide` compensates reverse; `faceRoadRight` rotates a sign basis for readable road-facing wordCue glyphs. `nightDim` changes only night-build albedo. The backdrop wrapper skips world-space road conflicts before delegating.

Lines 133–505 document and place narrow Armco excluding the engine's pit window, required Sainte-Dévote, sparse Beau Rivage canyon/hills, then required Casino, Hôtel/Café de Paris and Massenet at measured racing corners. The Casino uses KRAW with raw racing arrays; other named buildings use KRACE+wrapped anchor. Formal gardens use reversed SRACE ranges. The fountain remains raw by an explicitly documented historical pit-supersession decision; its current success was not remeasured. A full-lap wall uses 1−1/n to avoid source-wrap endpoint aliasing.

Lines 507–800 build required Fairmont main plus flanking wings, inside hairpin planters, and the tunnel using KOLD raw arrays. Tunnel stations use rawFrac overhead spans for crown/haunch/springing/lamp/overburden; side walls, ducts, ribs, emergency signs and portal jambs are raw world geometry. Every-other-station lamps and portal fixtures register actual always-on lights with explicit downward/angled aims. Lines 802–1190 cover harbor streets, required Rocher palace, quay, `afloat` footprint tests and `moor` outward relocation, stacked yachts, bollards/shore steps, grounded lip, required Tabac and Rascasse, guarded pool deck, harbor houses/baked fallback and yacht club. groundedSegments uses its origin-only path, so those quay nodes are intentionally not KR conversions.

Lines 1192–1579 add decorative street lamps, vegetation, far towers, start gantry computed from source+shift, scaffold harbor stands, twelve 15 m Grandstand K segments, banners/paddock, three constrained typed harbor-water stations, larger yachts, terrace stacks, moored pontoons/sailboats, required Mirabeau apartments, tunnel vents and terrain-aware balcony walls. Lines 1581–1731 add bearing-based limestone amphitheatre, world-XZ sea polygon tiled into merged 20 m runs while excluding roads/terrain, and sparse city fill excluding sea/harbor. Mountains and shoreline use different explicitly described frames. Do not collapse this file to a single fraction convention or infer raw blue sea boxes are typed reflective water.

### mont_tremblant.js

Lines 1–165 map numbered blocks to brief rows and establish deep summer greens, camera clearances, world-space ridge/massif helpers and minimum distance to sampled road edges. `ridgeAt` tries eight sites at +130 m; `massifAt` tries eight at +220 m, using explicit footprint clearance and road/terrain fallback heights. Lines 167–364 build full-lap armco, clear windows for structures and lake, near mixed tree wall with hardwood stand selection, outfield near pines, depth bands A/B/C and hazier ridge tier. `blocksOrbitView` uses both side and hot-frac distance thresholds; direct species calls have additional fold guards.

Lines 366–490 form the esses granite cutting, overhead green crown layers, ski mountain/shoulder/trail colors and ridge depth. Lines 492–603 compute rounded inverse shift SL and local `sl` for **only line-related paddock and start stand**, then add club garages, apron, terrain-seated vans, required control tower and clearing-backed forest. Lines 605–964 dress crest T1, esses exit, T4 spectator bank, hardwood T5, Lac Ouimet water/reserved footprint, Carousel, Hump crest cabin, climbing rights, required bridge marker with overheadSpan deck, Namerow outside bank/required marker, Paddock Bend stand/required fascia and coverage posts. Head comments deliberately distinguish brief labels, authored fractions and built racing corners. Most locality/clearance comments are historical authored evidence, not new runtime assertions.

### montreal.js

Lines 9–162 define point-to-point oriented-cylinder `strut`, flag/rowing towers, far bank level, typed river runs and Jean-Doré lagoon/beach, continuous walls/fences, island lawn patches and hedges. `farBank` uses an explicit fixed bank top relative to pyMin rather than anchor height; array dimensions are along the chosen basis, not geographic axes. Lines 164–398 add start stands, gantries, flags, kit pit/hospitality/compound/signs, raw terrain-seated garage-end walls, visible kerb paint, north rowing basin/shore/reeds/tower and forest/maple bands.

Lines 400–611 create far-bank Calder sculpture from struts/frusta, formal Floralies geometric beds, service paths and reserved tech sheds, then required Casino tiers/annex seated on dry ground, before extra island foliage. Lines 613–802 build required Biosphère open triangulated spherical frame. Base height samples the actual polygon chords and finite member width, low-side piers reach ground, museum decks stand on columns; this is a true frame rather than opaque stacked frusta. Distant downtown/hero towers, Jacques-Cartier truss and Habitat67 follow.

Lines 804–1111 add the required casino footbridge whose separate required piers use `foundation` and whose overheadSpan has supports=false, La Ronde wheel/tower, required hairpin outer stand cluster with separate inside GS34, signage, basin straight and rowing tower, open banks/canals/forest, and required Wall-of-Champions stand/panel. The actual tight wall stays a wall helper outside the modelGroup. Night floods are explicit floodMast calls because generic light dressing is excluded by the definition.

### monza.js

Lines 9–208 build park brick walls/gate and four foliage ranks, open parkland, separate flyover and Parabolica/hedge clearances, plus canopy fill beyond Sopraelevata. Lines 210–372 build required Centrale shell and shared crimson stand, secondary stands/trim/light bands, garage fallbacks, required supported pit canopy and podium tower, podium step, gantries, fence/rail, supported boards and lamps. Required tower body is sampled onto grade; the engine still owns occupied pit footprints.

Lines 374–479 add `gravelMargin`, whose short terrain patches use neighboring offset-node chords, two updated gravel strips with explicitly estimated lengths, major Rettifilo/Roggia/Lesmo/Ascari/Parabolica runoff/tyres/stands, low terrain-seated mist and typed ditch. Lines 481–715 add other marshals, three connected banking tiers plus moss, Villa Reale/wing masses, paddock kit garage rows with snapped node width and explicit road-facing yaw plus fallback buildings, typed park lakes, Milan silhouettes, forest ridge rings, supported stands, kerb flashes and lamps. Lines 717–956 add cypress avenues, local tifosiBowl wrapper over shared tieredBowl, museum/colonnade, required Sopraelevata overhead deck with separate required piers and grounded wings, chicane kerbs, park trees/banks, terrain-resampled tifosi camps, Vedano gate and extra uncovered stands. Native prism base convention matters for tents and portico roofs; baked row scaling is intentionally quantized.

### mosport.js

Lines 1–140 provide a numbered venue map and club/rural mixed-wood palette plus headingAt, slopeRidge, specimen, mixedTree, mixedWood and footbridge. `mixedWood` currently makes three forestEdge passes, shortening the deeper pass; it passes spacing options that the engine now honors despite the header's old warning. `mixedTree` chooses conifer-colored vs broadleaf-colored tree calls; a paint color alone is not proof of distinct geometry. Footbridges use required circuitKit pedestrianBridge plus place-built abutments.

Lines 142–279 build required pit garages with annex, apron and modest stands, then open Turn1 infield, Clayton bridge/descending wood, Quebec and lower Moss approach. Lines 281–445 build required short Moss bank with per-tier anchors and explicit solid reservations on both sides of the fold, rear woodland, climb/Andretti straight, open hedged drumlin farmland, second footbridge, enclosed Esses, and required Whites tunnel portal group plus opposite headwall and apron. No terrain bore is claimed: it is a portal cue. Lines 447–559 add required Event Centre, whole-lap mixed scatter with open/infrastructure exclusions, deep belts, sandy shoulders/armco/posts and five low no-snow wooded horizon hills. Several seat.box calls retain center-style offsets even though current seat.box takes underside feet; this pass records the contract mismatch without diagnosing rendered failure.

### mugello.js

Lines 9–172 establish a world-up flattened basis and vineyards: per-row/per-segment terrain samples, narrow separated trellis canopy, tilled soil and end posts. Four casali reserve their ground via indexSolid; stone walls, terracotta prism roofs and gate cypresses establish Tuscany identity. Lines 174–266 define additional reserved hero footprints, `offCasale` world clearance, open-area/camera windows and local cypress primitive assembly with a whole-tree road guard, plus ordered cypress ranks. This local cypress function is not the API species helper.

Lines 268–429 build four required detailed pit bays plus plain infill, required race control and gantries, required Centrale using dedicated positive-rake shell/seat/roof/end-wall emission, paddock sheds/motorhomes and broadcast. Lines 431–560 define terrain-aware terrazza and open hill stand emitters, San Donato/Casanova/Arrabbiata/Bucine gravel/tyres/terraces, separated inside-Casanova runs, grass banks and required Poggio Secco/Materassi. Lines 562–731 add barriers/posts, three no-snow Tuscan mountain rings, optional casale/pieve, paired cypresses, vine/olive bands with per-row terrain reseating and neighboring-chord clipping, signboards/camera towers/hoardings, and forest belts excluding hero terraces and the mid-lap orbit corridor. Distinct seed/order and world-up placement are load-bearing geometry choices.

### nurburgring.js

Lines 9–160 define local scaffoldStand with reserved rake and terrain-reaching rear rail uprights, dense/deep Eifel forest belts with fold and Schumacher-S holes, and scattered species. The long raw-state skip windows are authored constraints around surveyed elevation changes, not just aesthetic thinning. Lines 162–297 build Arena stand/bowl wall, Haug-Haken gravel, six fallback required pit bays, required race-control shaft/cab/mast outside the engine complex, gantries/start stand, Mercedes fascia badge, Boulevard glazed halls, paddock/broadcast/hoardings/camera towers.

Lines 299–393 add Dunlop gravel with the **only actual local scaffoldStand call**, Schumacher reserved bank corridor without a scaffold, Veedol/Coca-Cola runoff and required final-corner terrace, barriers/posts, green-rock Eifel mountain rings and the intended near ridge loop. That loop reads raw centerline px/pz before onTrack rejection; it should not be assumed to produce roadside ridges merely from its comment. Lines 395–508 build required Dunlop overhead span/piers and high fascia, spectator banks, bearing-placed required Burg Nürburg ruin atop a green massif, and two tent/flag camps. `scaffoldStand`'s rear supports iterate toward sampled terrain; tents use base-anchored prisms with slight embed.

### okayama.js

Lines 1–209 define numbered brief blocks, measured historical emitter notes, humid canopy/clay/club palettes, a local tree wrapper selecting lobed/columnar/sugi recipes, heading/hill/clayCut and clear/pad/box/bld/hut/safeBox helpers. `pad` converts center gap into drape edge gap; `bld` uses clear and grade checks then passes legacy col/roof/floors option names, so color/floor intent needs the shared building contract when changed. `clayCut` deliberately retains unused h as documentation and delegates one spectatorHill with grass/riser colors.

Lines 211–381 build tight full-lap armco/fence, tree wall excluding built/bank windows and requiring near terrain agreement, second canopy, required garages/control/paddock block reservations, required Dunlop overhead bridge, draped aprons and soft clutter. Lines 383–612 dress main stand, Turn1 clay cut/apron, Attwood wall, Williams club/paddock estate with safe trailers, Moss flick forest/banks, hairpin clay/terrace/bamboo and Revolver. Lines 614–728 continue dense climbing woodland/ridges, Hobbs clay/stands, Mike Knight descent and last-corner facility/clutter/banks. Numerous spectatorHill h/steps arguments describe historical intent but do not change the current ladder. Direct local tree calls and deferred forestEdge are different producers; not every bamboo-colored belt inherits the local tree wrapper's columnar recipe.

### paul_ricard.js

Lines 9–90 define reversed side convention (authored +1 lands racing left), local groundPatch side compensation, shared drape/drapeRun, corner blue-first/red-outer runoff bands, and the full-lap four-band apron with white lane markings. Lines 92–232 add sparse pine/scrub outside open-runoff windows, fallback pit bays/control mirrored to the engine side, line gantry, required main stand as one custom group, paddock/broadcast and signs. The required stand separately records a barrier; a model group alone does not establish collision.

Lines 234–340 define local bleacher with chord/swing row sizing, sparse crowd gated on tier success, six stand runs, required Beausset berm and safety furniture. Lines 342–459 add low pale ridge rings, groundPatch aerodrome apron/runway/taxiway, required barrel-roof hangars and airfield tower/windsock, and three supported parked aircraft. Lines 461–670 add nine static wind turbines with orthonormal blade bases, paddock apron/terrain-resampled lines, required 2019 pit-entry cue, helipad/boards/hoarding/cameras, twenty vine/lavender parcels with draped soil, terrain-checked posts, and required cabanon plus separately bounded seven-course dry wall. Long diagonal/tangent offsets are explicitly checked/reseated; historical comments explain abandoned placements but are not runtime evidence.

### portimao.js

Lines 9–100 build irregular cork-oak montado clusters and small silver-green olive groves with locally sampled trunks, no tilled pads. Lines 102–250 establish open sectors, source-space distance keep-outs, world-XZ terrace footprints and cut polylines, then `hillsideTerrace`. It computes signed offset-curve arc ratios, drops rows approaching cusps, checks separating axes against previously laid rows and stops a support chain on a rejected tier. Retaining walls/crowd/escarpments share the terrace basis; the rear prism requires terrain within 4.5 m of nominal top.

Lines 252–393 add scattered foliage screened against both same-leg and neighboring-leg terrace footprints, service paths/scrub pads, and required six-block paddock with continuous wave-roof phase and distinct A–F storeys. Lines 395–570 build required control tower, four shared main-stand bays plus required footing/fascia/end-shell overlay, required T1 stand past the amphitheatre, signs, gravel/tyres, red verge patches, banked kerb strips and connected red cut banks. Lines 572–782 add barriers/marshals, three Monchique hill rings, crest silhouette boards, terrain-aware quintas/walls, required windmill and five hillside apartments stepped down by APARTMENT_DROP, final signs/hoardings/camera towers and split forest runs. The cut/terrace keep-outs are world-geometry constraints, so changing one fraction without the others can reintroduce cross-leg foliage clashes.

## Verified stale comments and bounded cleanup candidates

These are static contradictions verified against current implementation or complete semantic references. No source comments were changed and no old measurement was silently promoted to a current result.

| Location | Comment says | Current evidence / precise cleanup |
|---|---|---|
| mexico.js:747 | Peraltada hero is at gap40 | Actual anchor at :752 uses gap62; following local comment already explains the farther ring. Update the old introductory number. |
| miami.js:183 | buildOverpass used at .635 and .685 | Complete semantic references resolve calls :796–797, `.66` and `.685`. Lower placement note already documents the move from .635. |
| monaco.js:829 | addFrustum/**addBox** anchor at BASE | addBox geom:113–119 uses center/half extents; frustum remains base-based. Narrow the comment to the actual base-based primitive. |
| montreal.js:201 | seat.box is center-anchored | LSP seat implementation build-props:740 adds sz[1]/2 to the foot. The local shell call supplies foot, consistent with underside anchoring. Correct the parenthetical only. |
| mont_tremblant.js:205,216 | CAM_NEAR base is 20–24 m | CAM_NEAR is 22 at :83 and base = CAM_NEAR + hash*4. The expression spans 22–26 m before rank offsets/guards. |
| mosport.js:45–49 | forestEdge opts.spacing is INERT | Current forestEdgeNow nature.js:1537–1544 honors opts.spacing via max(ds,spacing). Preserve the old zero-delta experiment as dated history if useful, but remove its present-tense instruction. |
| mosport.js:37–38 | frozen scenery API has 112 members | Current contract test :59 explicitly asserts 114 (drape/drapeRun additions). |
| nurburgring.js:434 | bank ends before Schumacher-S scaffold stand at .766 | Complete local scaffoldStand refs show only Dunlop call at :303. Lines :307–313 reserve the Schumacher corridor and explicitly explain why no scaffold is emitted. Describe the reserved corridor instead of a present stand. |

Shared `all 40 together were ...` file headers are phrased as a historical boot-cost observation; current roster has 52 files, but the past-tense measurement is not itself disproved. Do not mechanically replace 40 with 52 while retaining the historical byte count. Historical collision/float/audit counts throughout these callbacks are similarly not fresh results. Source-grounded maps do not prove photographs, true compass alignment of imported traces, or that a preflight-guarded required group actually survives a current build.

## Complete local helper and API binding index

The following index is extracted from the same hashed files after the full reads. Inclusive helper spans include small nested geometric functions; named callback bodies themselves were verified by LSP outlines. API aliases are explicit (for example Mexico lampPost→apiLampPost and Okayama tree→rawTree). These are bindings, not promises that every imported helper is called.

### magny_cours.js bindings and helper spans

API bindings: `K`, `lapBounds`, `out`, `MAT`, `n`, `ds`, `hw`, `pyMin`, `hash`, `every`, `along`, `anchor`, `vadd`, `onTrack`, `px`, `pz`, `pine`, `tree`, `bush`, `hedge`, `ridge`, `building`, `grandstandEx`, `spectatorHill`, `broadcastCompound`, `billboard`, `gantry`, `marshalPost`, `fence`, `guardrail`, `tyreWall`, `groundPatch`, `modelGroup`, `seat`, `terrainYAt`, `cameraTower`, `sponsorHoarding`, `signBoard`, `addBox`, `addCyl`, `addCone`, `addPrism`, `addFrustum`, `forestEdge`.

Local helpers (inclusive lines): `openArea:24-24`, `poplar:25-36`, `copse:102-109`, `emitControlBlock:205-240`, `emitMainTribuna:269-315`, `vaultStand:387-481`, `curveRow:397-427`, `at:399-399`, `legFoot:453-458`.

Model-group call sites (literal/dynamic first argument and source line):

- `magny-cours-pit-bay-${i + 1}:173`
- `"magny-cours-control-block":241`
- `"magny-cours-main-tribuna":316`
- `"magny-cours-conservatoire":363`
- `"magny-cours-ferme":532`
- `"magny-cours-bourg":571`
- `"magny-cours-chateau-deau":601`
- `magny-cours-technopole-${i + 1}:616`

### mexico.js bindings and helper spans

API bindings: `K`, `lapBounds`, `out`, `n`, `px`, `pz`, `pyMin`, `place`, `backdrop`, `groundPlane`, `addBox`, `addCyl`, `addFrustum`, `addCone`, `every`, `onTrack`, `hash`, `vadd`, `anchor`, `along`, `building`, `motorhome`, `grandstandEx`, `billboard`, `tree`, `hedge`, `fence`, `guardrail`, `tyreWall`, `marshalPost`, `tower`, `gantry`, `mountain`, `wall`, `modelGroup`, `groundPatch`, `groundedSegments`, `cityFront`, `forestEdge`, `bush`, `terrace`, `tieredBowl`, `broadleafFall`, `plane`, `acacia`, `cypress`, `cameraTower`, `sponsorHoarding`, `broadcastCompound`, `circuitKit`, `terrainYAt`, `indexSolid`, `seat`, `floodMast`, `lampPost:apiLampPost`.

Local helpers (inclusive lines): `cityBand:18-18`, `banners:55-69`, `lightMast:72-97`, `lampPost:100-109`, `blocked:136-137`, `avenue:138-152`, `kerb:155-164`, `boundedStand:182-202`, `emitSuite:245-256`, `closeBowlBack:599-610`, `sealTerraceBack:626-652`, `vol:991-991`, `nearVolcano:995-995`, `clearOfLap:1047-1052`, `nearAnyLeg:1075-1080`.

Model-group call sites (literal/dynamic first argument and source line):

- `mexico-flood-${k}-${side}:74`
- `mexico-stand-${k}-${side}-${gap}:190`
- `"mexico-paddock-suite-0":258`
- `mexico-paddock-suite-${i}:262`
- `"mexico-palacio-deportes":431`
- `"mexico-foro-sol-entry":539`
- `"mexico-foro-sol-exit":559`
- `"foro-scoreboard":680`
- `"mexico-peraltada-stand":755`

### miami.js bindings and helper spans

API bindings: `K`, `lapBounds`, `out`, `MAT`, `COL`, `n`, `pyMin`, `place`, `prop`, `backdrop`, `grandstandEx`, `building`, `tower`, `billboard`, `palm`, `bush`, `fence`, `wall`, `guardrail`, `tyreWall`, `bankedKerbStrip`, `marshalPost`, `gantry`, `anchor`, `addBox`, `addCyl`, `addPrism`, `addPyramid`, `addCone`, `addFrustum`, `vadd`, `hash`, `onTrack`, `every`, `along`, `cityFront`, `runoffApron`, `modelGroup`, `overheadSpan`, `waterSurface`, `groundPatch`, `recordBarrier`, `scaffoldStand`, `bleacher`, `acacia`, `circuitKit`, `ledFacadeBands`, `terrainYAt`, `neonSign`, `drape`.

Local helpers (inclusive lines): `rotPal:65-65`, `beachClub:71-102`, `carPark:105-133`, `parkingDeck:135-181`, `buildOverpass:188-210`, `haze:222-222`, `palmRow:896-901`.

Model-group call sites (literal/dynamic first argument and source line):

- `"beach-club-cabana":81`
- `car-park-${k}:119`
- `miami-parking-deck-${k}:147`
- `turnpike-pier-${k}-${side}:200`
- `"miami-hard-rock-neon":344`
- `miami-pit-end-shell-${endS === 0 ? "s" : "n"}:388`
- `miami-berth-${k}:498`
- `marina-yacht-${i}:519`
- `"msc-yacht-club":536`
- `"miami-campus-arrival-court":594`
- `"miami-marina-hospitality-deck":612`
- `"miami-mia-sign":737`

### monaco.js bindings and helper spans

API bindings: `K`, `out`, `MAT`, `def`, `track`, `n`, `ds`, `px`, `py`, `pz`, `hw`, `pyMin`, `terrainYAt`, `night`, `addBox`, `addPrism`, `addCyl`, `addCone`, `addFrustum`, `addPyramid`, `modelGroup`, `overheadSpan`, `lampPost`, `waterSurface`, `waterField`, `groundedSegments`, `onTrack`, `hash`, `upOf`, `vadd`, `anchor`, `along`, `place`, `prop`, `building`, `tower`, `palm`, `tree`, `bush`, `hedge`, `grandstand`, `grandstandEx`, `scaffoldStand`, `bleacher`, `cypress`, `stonePine`, `plane`, `broadcastCompound`, `cameraTower`, `billboard`, `gantry`, `marshalPost`, `fence`, `guardrail`, `wall`, `cityFront`, `bakedModel`, `seat`, `motorhome`, `pastelStreetRow`.

Local helpers (inclusive lines): `backdrop:16-20`, `KR:22-22`, `KOLD:40-40`, `racingSide:41-41`, `KRACE:71-71`, `KRAW:72-72`, `SRACE:73-73`, `faceRoadRight:79-79`, `nightDim:101-101`, `wordCue:112-128`, `emitFairmont:520-568`, `build:529-560`, `lat:633-633`, `tunnelPortal:734-792`, `afloat:858-870`, `moor:874-881`, `yacht:882-907`, `megaYacht:1367-1420`, `terraceStack:1431-1450`, `under:1568-1571`, `bear:1609-1609`, `inPoly:1650-1657`, `flush:1672-1678`.

Model-group call sites (literal/dynamic first argument and source line):

- `"monaco-sainte-devote":202`
- `"monaco-casino":292`
- `"monaco-hotel-de-paris":359`
- `"monaco-cafe-de-paris":403`
- `"monaco-massenet":441`
- `"monaco-fairmont-main":564`
- `monaco-fairmont-${raceFrac < HP ? "west" : "east"}:566`
- `"monaco-rocher-palace":825`
- `"monaco-tabac-shop":993`
- `"monaco-rascasse-bar":1102`
- `monaco-marina-pontoon-${i}:1465`
- `monaco-far-sailboat-${i}:1483`
- `"monaco-mirabeau-apartments":1504`
- `monaco-tunnel-vent-${side < 0 ? "entry" : "exit"}:1541`
- `monaco-harbour-balcony-wall-${i}:1558`

### mont_tremblant.js bindings and helper spans

API bindings: `n`, `hash`, `every`, `anchor`, `onTrack`, `out`, `MAT`, `vadd`, `modelGroup`, `seat`, `pine`, `tree`, `bush`, `forestEdge`, `building`, `grandstandEx`, `spectatorHill`, `guardrail`, `fence`, `tyreWall`, `marshalPost`, `cameraTower`, `billboard`, `motorhome`, `groundPatch`, `ridge`, `mountain`, `terrainYAt`, `addBox`, `indexSolid`, `waterBand`, `overheadSpan`, `K`.

Local helpers (inclusive lines): `inOrbitRing:84-84`, `camHot:85-88`, `blocksOrbitView:91-92`, `heading:94-98`, `overRoad:101-105`, `within:106-106`, `minEdge:120-128`, `ridgeAt:132-148`, `massifAt:151-161`, `stand:165-165`, `blocked:190-194`, `paddock:200-203`, `sl:503-503`, `seatVan:514-524`.

Model-group call sites (literal/dynamic first argument and source line):

- `"tremblant-control-tower":543`
- `"tremblant-hump-crest":736`
- `"tremblant-bridge":819`
- `"tremblant-namerow-bank":860`
- `"tremblant-paddock-bend-stand":926`

### montreal.js bindings and helper spans

API bindings: `K`, `out`, `n`, `py`, `pyMin`, `place`, `backdrop`, `wall`, `grandstandEx`, `building`, `anchor`, `addBox`, `addCyl`, `addCone`, `addPrism`, `addFrustum`, `vadd`, `hash`, `fence`, `tyreWall`, `hedge`, `billboard`, `gantry`, `marshalPost`, `bush`, `scaffoldStand`, `broadleafFall`, `tree`, `pine`, `seat`, `groundUnder`, `indexSolid`, `ferrisWheel`, `tower`, `onTrack`, `forestEdge`, `cityFront`, `modelGroup`, `overheadSpan`, `waterSurface`, `waterBand`, `groundPatch`, `foundation`, `broadcastCompound`, `cameraTower`, `sponsorHoarding`, `circuitKit`, `cross`, `norm`, `MAT`, `COL`, `frameAt`, `floodMast`.

Local helpers (inclusive lines): `strut:19-27`, `flagMast:46-52`, `rowingTower:54-73`, `farBank:86-96`, `basePoint:637-638`, `emitBio:658-708`, `surf:664-668`, `stand:883-896`.

Model-group call sites (literal/dynamic first argument and source line):

- `id:57`
- `"montreal-calder-trois-disques":414`
- `"montreal-casino":574`
- `"montreal-biosphere":709`
- `"montreal-habitat67":783`
- `montreal-casino-footbridge-support-${side < 0 ? "left" : "right"}:811`
- `"montreal-hairpin-grandstands":878`
- `"montreal-wall-of-champions-stand":1058`

### monza.js bindings and helper spans

API bindings: `K`, `lapBounds`, `out`, `MAT`, `n`, `ds`, `pyMin`, `place`, `prop`, `backdrop`, `groundYAt`, `every`, `onTrack`, `hash`, `pine`, `tree`, `bush`, `hedge`, `ridge`, `forestEdge`, `building`, `motorhome`, `tower`, `cypress`, `stonePine`, `tieredBowl`, `grandstandEx`, `spectatorHill`, `broadcastCompound`, `billboard`, `gantry`, `marshalPost`, `wall`, `fence`, `guardrail`, `tyreWall`, `addBox`, `addCyl`, `addPrism`, `anchor`, `along`, `vadd`, `modelGroup`, `overheadSpan`, `waterSurface`, `waterBand`, `groundPatch`, `groundedSegments`, `terrainYAt`, `bakedModel`, `px`, `pz`.

Local helpers (inclusive lines): `openParkland:76-77`, `flyoverClear:80-80`, `curvaGrandeHedge:85-85`, `parabolicaStandClear:88-88`, `gravelMargin:380-391`, `chord:386-386`, `tierPoints:488-495`, `tifosiBowl:736-744`, `points:807-812`, `tifosiCamp:896-931`, `onTerrain:902-905`.

Model-group call sites (literal/dynamic first argument and source line):

- `"monza-park-gate":48`
- `"monza-tribuna-centrale":202`
- `"monza-pit-canopy":273`
- `"monza-podium-tower":308`
- `monza-sopraelevata-pier-${side < 0 ? "left" : "right"}:798`
- `id:906`
- `"monza-vedano-gate":940`

### mosport.js bindings and helper spans

API bindings: `mountain`, `n`, `hash`, `every`, `anchor`, `onTrack`, `out`, `terrainYAt`, `tree`, `bush`, `hedge`, `forestEdge`, `vadd`, `MAT`, `modelGroup`, `seat`, `grandstandEx`, `spectatorHill`, `indexSolid`, `guardrail`, `fence`, `tyreWall`, `marshalPost`, `cameraTower`, `broadcastCompound`, `billboard`, `sponsorHoarding`, `gantry`, `groundPatch`, `place`, `ridge`, `circuitKit`, `K`.

Local helpers (inclusive lines): `headingAt:89-93`, `slopeRidge:95-100`, `specimen:103-109`, `mixedTree:112-119`, `mixedWood:122-127`, `footbridge:131-140`, `farHill:542-553`.

Model-group call sites (literal/dynamic first argument and source line):

- `"mosport-pit-garages":152`
- `"mosport-moss-corner-bank":288`
- `"mosport-whites-tunnel":409`
- `"mosport-event-centre":440`

### mugello.js bindings and helper spans

API bindings: `K`, `lapBounds`, `out`, `MAT`, `n`, `track`, `pyMin`, `hash`, `every`, `along`, `anchor`, `vadd`, `onTrack`, `px`, `pz`, `hw`, `indexSolid`, `seat`, `pine`, `tree`, `bush`, `hedge`, `ridge`, `mountain`, `building`, `grandstandEx`, `spectatorHill`, `broadcastCompound`, `billboard`, `gantry`, `marshalPost`, `motorhome`, `fence`, `guardrail`, `tyreWall`, `groundPatch`, `modelGroup`, `cameraTower`, `sponsorHoarding`, `signBoard`, `addBox`, `addCyl`, `addCone`, `addPrism`, `addFrustum`, `forestEdge`, `terrainYAt`, `groundYAt`, `groundUnder`.

Local helpers (inclusive lines): `flatBasis:21-25`, `offCasale:179-182`, `openArea:185-187`, `midLapOrbit:192-192`, `cypress:233-254`, `emitCentraleStand:350-399`, `terrazza:431-468`, `emitOpenHillStand:510-533`, `flatD:668-668`.

Model-group call sites (literal/dynamic first argument and source line):

- `mugello-pit-bay-${i + 1}:271`
- `"mugello-race-control":325`
- `"mugello-centrale-stand":404`
- `"mugello-poggio-secco-stand":537`
- `"mugello-materassi-stand":544`
- `"mugello-casale":583`
- `"mugello-pieve":616`

### nurburgring.js bindings and helper spans

API bindings: `K`, `lapBounds`, `out`, `MAT`, `n`, `pyMin`, `hash`, `every`, `along`, `anchor`, `vadd`, `onTrack`, `px`, `pz`, `pine`, `tree`, `bush`, `ridge`, `mountain`, `building`, `grandstandEx`, `spectatorHill`, `broadcastCompound`, `billboard`, `gantry`, `marshalPost`, `motorhome`, `fence`, `guardrail`, `tyreWall`, `groundPatch`, `modelGroup`, `bowlSeatWall`, `cameraTower`, `sponsorHoarding`, `seat`, `forestEdge`, `addBox`, `addCyl`, `addCone`, `addPrism`, `addFrustum`, `indexSolid`, `groundUnder`.

Local helpers (inclusive lines): `scaffoldStand:16-59`, `openArena:65-65`, `schumacherS:70-70`, `deep:104-105`.

Model-group call sites (literal/dynamic first argument and source line):

- `nurburgring-pit-bay-${i + 1}:179`
- `"nurburgring-race-control":214`
- `"nurburgring-mercedes-tribune-header":237`
- `nurburgring-boulevard-${i + 1}:258`
- `"nurburgring-coca-cola-kurve":328`
- `nurburgring-dunlop-pier-${side < 0 ? "left" : "right"}:406`
- `"nurburgring-burg-nurburg":451`
- `id:491`

### okayama.js bindings and helper spans

API bindings: `n`, `hash`, `every`, `anchor`, `onTrack`, `terrainYAt`, `tree:rawTree`, `bush`, `hedge`, `forestEdge`, `building`, `grandstandEx`, `spectatorHill`, `guardrail`, `fence`, `tyreWall`, `marshalPost`, `cameraTower`, `billboard`, `sponsorHoarding`, `place`, `ridge`, `groundPatch`, `modelGroup`, `vadd`, `MAT`, `seat`, `indexSolid`, `overheadSpan`, `addBox`, `addCyl`, `K`, `drape`.

Local helpers (inclusive lines): `tree:129-133`, `headingAt:138-141`, `hill:142-146`, `clayCut:157-159`, `clear:164-168`, `pad:173-177`, `box:178-182`, `bld:187-195`, `hut:198-199`, `safeBox:202-206`, `inBuilt:208-209`, `onHill:231-232`.

Model-group call sites (literal/dynamic first argument and source line):

- `"okayama-pit-garages":290`
- `"okayama-control-tower":323`
- `"okayama-paddock-block":481`

### paul_ricard.js bindings and helper spans

API bindings: `K`, `lapBounds`, `out`, `MAT`, `n`, `ds`, `pyMin`, `hash`, `every`, `along`, `anchor`, `vadd`, `onTrack`, `pine`, `tree`, `bush`, `ridge`, `building`, `grandstandEx`, `spectatorHill`, `broadcastCompound`, `billboard`, `gantry`, `marshalPost`, `motorhome`, `fence`, `guardrail`, `tyreWall`, `modelGroup`, `prop`, `runoffApron`, `cameraTower`, `sponsorHoarding`, `signBoard`, `terrainYAt`, `recordBarrier`, `addBox`, `addCyl`, `addCone`, `addFrustum`, `addPrism`, `drape`, `drapeRun`.

Local helpers (inclusive lines): `groundPatch:30-30`, `openRunoff:92-93`, `bleacher:234-298`, `chord:243-251`, `rowSeg:261-266`, `windTurbine:461-494`.

Model-group call sites (literal/dynamic first argument and source line):

- `paul-ricard-pit-bay-${i + 1}:129`
- `"paul-ricard-race-control":159`
- `"paul-ricard-main-grandstand":198`
- `"paul-ricard-beausset-hill":313`
- `"paul-ricard-aerodrome":385`
- `"paul-ricard-airfield-tower":410`
- `paul-ricard-lightplane-${i + 1}:436`
- `id:466`
- `"paul-ricard-pit-entry-2019":532`
- `"paul-ricard-cabanon":646`
- `"paul-ricard-drywall":662`

### portimao.js bindings and helper spans

API bindings: `K`, `lapBounds`, `out`, `MAT`, `n`, `pyMin`, `hash`, `every`, `along`, `anchor`, `vadd`, `onTrack`, `px`, `pz`, `pine`, `tree`, `bush`, `mountain`, `grandstandEx`, `spectatorHill`, `billboard`, `gantry`, `marshalPost`, `fence`, `guardrail`, `tyreWall`, `groundPatch`, `modelGroup`, `cameraTower`, `sponsorHoarding`, `signBoard`, `groundedSegments`, `bankedKerbStrip`, `addBox`, `addCyl`, `addCone`, `addPrism`, `addFrustum`, `forestEdge`, `terrainYAt`, `seat`.

Local helpers (inclusive lines): `openArea:101-101`, `keptOut:116-118`, `onTerrace:123-128`, `hillsideTerrace:154-242`, `footprint:162-166`, `sinksInto:167-176`, `rad:171-172`, `arcAt:186-189`, `segAt:193-194`, `dressPitBlocks:334-386`, `dressMainStand:446-481`, `quinta:657-687`.

Model-group call sites (literal/dynamic first argument and source line):

- `"portimao-pit-blocks":387`
- `"portimao-race-control":397`
- `"portimao-main-stand":482`
- `"portimao-t1-stands":495`
- `id:660`
- `"portimao-moinho":699`
- `portimao-hillside-apartments-${i + 1}:731`

## Verification boundary

Pass: complete source visibility for every ledger range; exact-byte SHA-256 ledger; all thirteen callback outlines; complete representative-helper semantic reference pages; bounded engine definition reads supporting the contracts and stale-comment rows. AST metadata/call-site extraction was used for the index and counterpart coordinate flags.

Skip: all runtime geometry/audit tools, rendered screenshots, browser playtests, source fixes, commits and pushes. This pass changed documentation only; parent runs the repository docs-only checks once after integrating sibling reports. A green historical comment is not a replacement for those checks or for a fresh track build before future geometry changes.
