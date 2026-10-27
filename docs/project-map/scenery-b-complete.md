# Scenery B — complete source reading

Snapshot: `212adc24b985b120a63507c988abea69e7740e74`, 2026-10-27. Scope is positions **14–26 inclusive** of the 52 alphabetically sorted `js/circuits/scenery/*.js` files: **fuji.js, hockenheim.js, hungaroring.js, imola.js, indianapolis.js, interlagos.js, istanbul.js, jacarepagua.js, jeddah.js, jerez.js, korea.js, kyalami.js, madrid.js**. All 13 files, **9,161 lines**, were read through EOF. This is a static code map, not a rendered appearance or runtime verification result.

Instructions read: root `AGENTS.md`, `js/circuits/AGENTS.md`, `js/track/AGENTS.md`, and `.agents/skills/code-nav/SKILL.md`. All outputs used for the complete-read ledger below were bounded `sed` ranges without truncation. One initial combined Fuji/Hockenheim output was truncated; both affected files were subsequently covered by the explicit ranges below. No circuit or engine source was edited. Tests belong to the parent lane.

## Complete-read ledger

Line numbers include comments and blank lines; SHA-256 hashes cover exact file bytes. Ranges are inclusive and contiguous.

| Alphabetical position | File under `js/circuits/scenery/` | Lines | Ranges read | SHA-256 |
|---|---|---:|---|---|
| 14 | `fuji.js` | 593 | 1–300; 301–593 | `ecf8abc94469bfe3c8de20583100a9d179eb020219ee3b140ef93da20beeafce` |
| 15 | `hockenheim.js` | 497 | 1–180; 181–497 | `c7ac8bd6f8eeb894f18c765cc1e9ea5ca28b15e6a22dd9cdb2be47ee38bb8168` |
| 16 | `hungaroring.js` | 879 | 1–260; 261–560; 561–879 | `b82a4eb96859a1024445d3b636672ed501321d3ebf0970a535b2766c6fad378c` |
| 17 | `imola.js` | 885 | 1–300; 301–600; 601–885 | `005467474ffae4828e72f51c6f43662d5907c27965d65633ba98c653e9211257` |
| 18 | `indianapolis.js` | 559 | 1–280; 281–559 | `d1ad0b9f3597ceed76bf86b418b8f978df3ec30bdf396173f536b7a2b5f2a540` |
| 19 | `interlagos.js` | 1040 | 1–300; 301–600; 601–850; 851–1040 | `e09806dcdfb944923f75603651c5a9d2f5b8922cda7a3943120a387b633f152a` |
| 20 | `istanbul.js` | 357 | 1–180; 181–357 | `f17ddcc1b6b91ebcfe5d80cded24a722e96e4334a88e112812c0bd04fe115089` |
| 21 | `jacarepagua.js` | 532 | 1–180; 181–532 | `b8b19fe725bfd5011e74c3628f6c4c14995fed96bdadf4d497db094e693f1b8c` |
| 22 | `jeddah.js` | 840 | 1–300; 301–600; 601–840 | `684b20348eabad3f3ef72d43d2049a90b2ec81fb4aa6b5ad1b1948c91084e32b` |
| 23 | `jerez.js` | 797 | 1–280; 281–560; 561–797 | `dea349feb75e826c24dd92a3f70295f24564faffd17017c717f3169966fc093f` |
| 24 | `korea.js` | 485 | 1–150; 151–485 | `e1afe4dd02d55629f172c67bb776bead02978f91fed47bb397a2782767b80d27` |
| 25 | `kyalami.js` | 593 | 1–300; 301–593 | `23759f0442beb731f97ed9b0bc11f5c74bf119f22074f190670ab816b07b128c` |
| 26 | `madrid.js` | 1104 | 1–280; 281–560; 561–840; 841–1104 | `e7f3f98092e4f145cee2e5bd3410ed7a3a4f005b4c40f78ea704789e1e859727` |

## Engine and helper map, checked with apex-lsp

Attached `apex-lsp` was used for module outlines, definitions and references; the initial shell fallback `def TrackScenery` returned 52 separate registry assignments, not a callable global body. The attached outlines identify `TrackBuildProps` in `js/track/scenery/build-props.js:4`, `TrackModels` in `models.js:3`, `SceneryNature` in `nature.js:2`, `SceneryStructures` in `structures.js:2`, `SceneryCity` in `city.js:2`, and `SceneryIdentity` in `identity.js:2`.

| Circuit-facing surface | Engine owner and evidence | Meaning for these files |
|---|---|---|
| Registry callback | `build-props.js:2011` vicinity, `sceneryFn = def.scenery || window.TrackScenery[def.id]`; API assembled immediately below | Every file registers one callback keyed by its filename ID. Inline `def.scenery` overrides the registry. Missing callback logs a bare-build warning. |
| `modelGroup`, water/patch/segment/span models | LSP definition `TrackModels.create` → `models.js:215`; reference page: its only use is `build-props.js:694` | Models validate bounds, preflight and stage geometry. At `models.js:232–265`, invalid, suppressed and failed-emission paths return false; pit supersession explicitly clears `required` in suppression diagnostics. A source call alone does not prove emitted geometry. |
| `anchor`, vegetation, hills and crowd forms | LSP `SceneryNature.create` → `nature.js:54`, sole external use `build-props.js:1414`; point definition `nature.js:92` | `anchor` normalizes nodes, offsets by `side * (hw[k] + dist)`, samples ground and embeds 0.3 m. World-XZ `groundUnder` first asks `terrainYAt`, then nearest-node fallback. |
| `along`, fences, rails, walls, signage, camera/broadcast furniture | LSP `SceneryStructures.create` → `structures.js:5`, used at `build-props.js:1415` | Structures own the shared along-span and barrier furniture. `along` supplies actual node-quantized spacing; repeated full boxes must size against that spacing. |
| `building`, `motorhome`, `tower`, `cityFront` | LSP outline `SceneryCity.create` → `city.js:14`; context assembly `build-props.js:1416–1434` | Generic city masses are shared emissions. Local raw/atomic halls and skyline cores in this slice intentionally bypass their chosen shape vocabulary, while retaining guarded primitives. |
| `concreteCanyon`, `floodMast`, `runoffApron` and composites | LSP `SceneryIdentity.create` → `identity.js:5`, use `build-props.js:1417` | Jeddah uses the shared canyon; Korea/Jerez/Madrid use apron/composite surfaces; several circuits use registered flood masts. Jeddah also defines its own unrelated local `floodMast`. |
| `K`, `lapBounds`, `night`, `MAT`, primitives, seat/foundation and light registration | API assembly in `build-props.js:2030–2107` | `K` is normalized raw fraction-to-node; cached `lapBounds` is centroid plus maximum radius. Geometry, colours and light-registration calls are distinct responsibilities. |
| Coordinate wrapper | LSP point definition `build-props.js:71` (`transformSceneryApi`) | Node helpers remap `k`; range helpers remap spans and side; reversed definitions flip side. `along` and `every` return authored-frame callback nodes before circuit code calls wrapped helpers. `K` stays raw. |
| Deferred foliage | `build-props.js:2111` onward | `forestEdge` queues are flushed after bespoke scenery and venue construction, then generic roadside planting runs. Local solid reservations and barriers can therefore affect planting. |

LSP bounded definition pages were intentionally capped (15–90 lines); their `… more lines (maxLines)` markers mean the remainder of those *engine definitions* was not claimed as fully read. Complete reads here apply to the thirteen circuit files only. A lookup for `TrackSceneryKits.create` correctly failed (no such global); no ownership claim is based on it. One point lookup at column 22 of `indexSolid,` landed on whitespace and was corrected by looking up the actual declaration `transformSceneryApi` at 71:12.

## Per-circuit map

All source paths in the following sections are relative to `js/circuits/scenery/`. The model inventory later in this document is a source call-site inventory, including optional and dynamically named groups; runtime emission is conditional on guards.

### 14. Fuji — `fuji.js:33`

The callback builds a pale pit frontage and deep grandstand wall around the long straight, a western volcano, hotel/museum, sequential corner furniture, layered cedar forest and continuous barriers. `W`, `SM` and local `run` convert metre lengths into wrapped lap-fraction walks (lines 72–81). Pit bays quantize a 76 m pitch into whole nodes; hospitality alternates bays and skips control-tower overlap. Main stands mix `grandstandEx`, terraces and far forest edge. Mount Fuji (lines 182–240) uses true-bearing world coordinates, `addMountain` with `MAT.ROCK`, a required atomic cone and nonrequired flank mountains. Hotel (lines 259–336) samples terrain at its own footprint and stages a nine-storey, three-bay hotel plus wellness wing; museum is represented within the hotel, rather than by a separate block.

T1/75R, Coca-Cola/Toyopet, Advan/120R, 300R, Dunlop, flick and Panasonic sections deliberately split or skip forest/barrier spans around folded-road conflicts. The two `every(32)` cedar passes at lines 516–568 have distinct window/density rules; the second offsets nodes by four. The final +1 rail wraps from .716 to .700, excluding the fold. Required IDs: `fuji-mount-fuji` and `fuji-speedway-hotel`.

### 15. Hockenheim — `hockenheim.js:7`

`tiltBasis` rotates roof axes (line 16). Hardtwald forest spans and four scatter passes avoid `inStadium` and a T4 interval .203–.237 (lines 31–118). The `runs` helper removes T4 only on +1. A third forest rank also skips the folded .615–.620 band. `motodromTerrace` (line 130 vicinity) follows shared `along` actual spacing and emits staggered concrete/crowd boxes. Motodrom roof columns, screen and hospitality crown lead into separately grouped South and North stands, flag masts, six pit bays and race control (lines 155–371).

Main stand, buildings, sparse paddock RVs and broadcast compound surround the line. Spitzkehre has gravel, tyres and a locally guarded three-row temporary stand; Ostkurve furniture is at .220 on +1, and forest/rails split around that clearing. Three world-space ridge rings surround the circuit; the optional old overlapping canopy-wall slabs are explicitly absent. Final infield compound, sponsor runs and camera towers close the callback. The Mercedes-labelled model is retained at Motodrom, while comments explicitly leave the real named-stand mapping uncertain.

### 16. Hungaroring — `hungaroring.js:7`

The callback has explicit dual frame helpers: rounded `SL`/`sl` for line-relative authored data and `au`/`TURN` for racing-frame turn fractions (lines 24–28). `blanket` tiles thin crowd colour patches onto per-tile `terrainYAt` heights (line 34). Poplar columns and lobed akác clumps precede a dusty palette override, rounded `dome` hills, haze ridges and amphitheatre mounds. Main/T1 and sector stands include turn-derived T5, T6/7 and T14 placements; most forest has very low pine fraction and the pit-straight forest is carved back.

Lighting combines local poles, optional `lampPost` registration, and counted modular loops with `cantilever` arms. Modern pit (lines 381–497) levels a 340 m five-storey assembly by sampling its ground-storey footprint, then uses a retaining `foundation`; its required bounds include footing depth. Pit wall uses connected `groundedSegments` and matching `recordBarrier`; start lights are explicitly attached to a required `overheadSpan`. Covered main tribune, tunnel mouths, basin, two crowd-density passes, hillside banks, custom bowl terraces, jumbotron, village church, fields, optional circuit-kit compounds and a six-piece T5 exit gravel strip finish the callback. The exit gravel converts racing fractions back to authored fractions explicitly. The church is an optional model group; pit and main tribune are required.

### 17. Imola — `imola.js:7`

`sl`, `R`, `terrainPatch` and `riverSurface` convert selected racing-frame positions (lines 20–28). The programme includes two woodland mountain rings, slope-checked vineyards, deciduous forest spans, required Santerno water patches, canopy backdrops and a campanile. Start frontage is six pit blocks, pit banners, pit-side and Partenza stands, required Partenza marker, paddock gate, several service buildings, a required solid-shaft Racetrack Tower and a pit wall.

The custom `emiliaCasale` samples footprint corners, rejects steep grades and chooses a maximum from terrain/groundUnder/anchor; it places village and Piratella houses. A separate old-town complex resolves nearest nodes for each tangent-offset footing, using `foundation`. Lamps are drawn and optionally registered; cypress, stone-pine and pollarded-plane helpers establish regional vegetation. Required models include Senna memorial, Santerno footbridge, historic race office, hill villas and tribute wall. Crowd forms mix Tosa `tieredBowl`, Rivazza `terrace`, and several spectator hills. Raw fraction range calls still coexist with `R`-based node placements; the opening claim that every landmark uses R/sl is broader than the implementation.

### 18. Indianapolis — `indianapolis.js:7`

`OUT=-1`, `IN=1`, and local `rot` negate both horizontal basis axes to move road-facing assemblies without mirroring their text (lines 38–42). An oval stand bank walks 40 m fractions with 38 m bodies and skips the S/F hero. Required main stands use the rotated outside anchor; Pagoda, scoring pylon and pit stalls use rotated infield anchors. The pylon's numeric panels call `signDigit`; Pagoda is a continuous solid core with storey shells/eaves. Yard of Bricks emits three staggered rows across `hw` (the nearby comment says two).

Gasoline Alley creates three optional grouped shed rows, aprons, RVs and broadcast mass. Infield gravel/tyres, bleachers, scaffold stand and four golf greens/bunkers frame open grass. The outer oval retaining wall uses actual `along` spacing and alternating 3 cm radial offsets; catch fence follows it. Two low ridge rings, registered flood masts, T1 viewing mound, golf water surfaces, required museum with `indexSolid` reservation, parking cars, fairway ribbons and clubhouse silhouettes fill the site. The town scatter stays outside at gap120+; final T1 and mid-course bleachers remain independently authored.

### 19. Interlagos — `interlagos.js:7`

This callback has the richest local procedural vocabulary: `camHot`/`blocksOrbitView` (lines 26–35), dense `favelaPatch` (49), `crowdBank` (122), `arquibancada` (167), `pitGarageRow` (238), and required `pitTower` (277). Favela houses select stable raw-block/screed/paint skins and occasional tanks/rebar. Crowd banks step outward using `side`, with a supporting box shifted across the actual row footprint. Arquibancadas use concrete benches, packed yellow/green crowd, rusted canopy ribs and optional Brazilian fascia.

Pit complex, main tribuna/crowd, Senna S required terrace, favela patches/cores and subtropical forest form the first half. Guarapiranga (lines 582–649) samples an elliptical cell field, picks a 25th-percentile flat waterline, skips dry/steep cells and puts only its first accepted cell into the required model group; other cells emit directly. A fallback pin exists if no cells survive. Required shore and skyline groups sit alongside palms, broadleaf and distant city rows. Bico de Pato, Junção and Subida carry corner furniture and terraces. A final sixty-ray bowl ring reserves space from road, lake and hero skyline, then emits terraced earth/low-rise housing and apartment towers. Its local nearest-road scan and per-site atomic groups are separate from `cityFront`.

### 20. Istanbul — `istanbul.js:7`

`openArea` excludes the pit straight and T8 .395–.515 from generic pine/scrub/tree scatter. T8 uses an eight-row `along` amphitheatre, grounded revetment, broad gravel apron, flag poles, three shared grandstands and a required two-tier hospitality group. Pit frontage is six required stepped stone bays, required control tower and optional paddock blocks, backed by buildings/RVs/broadcast. T1/T9/final-corner stands and gravel, rails/fences/marshal rhythm, three ridge rings, distant apartment blocks, Turkish flag rank, camera towers and a required stone portal complete the built mass. Grounded hillside segments and pine-heavy forest spans close the lap.

Silver3 and Silver8 are authored uncovered; Silver8 is .910/gap24/length52 to clear the neighbouring leg. The tree scatter `every(44)` requires `h>=.55`, then selects side with `h<.5`; that side test is statically unreachable, so this pass always selects +1. This is an observation of the source, not a runtime visual defect verdict.

### 21. Jacarepaguá — `jacarepagua.js:7`

Two mountain arcs and a low seaward ridge create the horizon. Morro housing uses six raw-geometry clusters, terracotta/cream/blue skins, flat roofs and tanks over a base berm. Lagoon is required `waterField` plus `waterBand`, a shoreline patch and six locally sampled water boxes. Required shoreline hardscape, reeds and three skiffs use atomic groups; skiff keels sample their own terrain point.

Palms concentrate on the lagoon rank and broadleaf trees on the .50–.635 infield pocket. Required Tijuca ridge uses a centroid/bearing world-space footprint. The programme then builds a required pit-grandstand, roofline timing box, local timber bleacher and three paddock blocks sharing `emitPaddock`. RV filtering avoids those paddock blocks. Period boards/hoarding, corner sand/tyres/terraces, furniture-only back-half sectors, floods/cameras, scaffold stand and layered Brazilian flags finish the callback. The header's historical claim of “all40” closures is not a current roster count; the inventory is52.

### 22. Jeddah — `jeddah.js:7`

The callback mixes `sl` for its start gantry with predominantly authored-frame surroundings. It defines local unregistered `floodMast`, `ledHead` (with optional real `lampPost` registration), `lightTower`, `seatCanyonFeet`, `palmLit`, `slabOnGround`, `floatingMosque` and `dhow`. Shared `api.concreteCanyon` gets six Saudi green/gold blocks per side plus a dedicated T13 span; pit-side canyon ends at the pit-complex window. Canyon footings sample terrain and add support only within bounded height gaps; tagged `along` calls maintain the lattice across blocks.

Palms, sea rail, Red Sea/marina water bands, reflections and required fountain establish the waterfront. Inland coral roshan houses, pit-kit/fallback hall, distant main stands/cityFront and closed street masses provide depth while keeping the orbit corridor. Required blue sail, golden twins and Golden Tower hotel use base-seated boxes with fallback emission. Marina yachts, club and painted promenade lead into T13 scaffold stands, commercial cluster, neon fascia/boards/storefronts and corner protection. Required floating mosque/flagpole, optional construction tower, dhow fleet and far backdrops complete it. Bright lens/paint colour alone is not proof of a registered light; only `ledHead` explicitly registers one in the local lamp vocabulary.

### 23. Jerez — `jerez.js:50`

The opening brief and frame warning are unusually explicit: corner labels lag built corner order and are not survey truth. Local helpers `clear`, `olive`, `scrub`, `carPark`, `kiosks`, `seatOk`, camera exclusions and dry-bank clearance bands control almost every scatter. Cars are deduplicated in XZ against a shared `parked` list, which also receives freight-container footprints. Scrub tries four progressively farther sites rather than requesting guard rejection. `sl` only rekeys line/pit blocks.

The18 source blocks construct pale main terracing, pit/paddock depth, Expo/Michelin stand complexes, bare climb and descent, broadcast pocket, Dry Sack seating, open-country olives/farm/bodega/vines, Angel Nieto amphitheatre, Peluqui/Ferrari bowl, final corner and sparse lap-wide furniture. Options consistently override northern green/concrete defaults with ochre/dust/pale concrete. Two required line-side landmarks are El Ovni and control tower with Tío Pepe silhouette; two required marker groups label Lorenzo and Pedrosa corners. Terrain/pit/fold guards can bypass a group before `modelGroup` is called, so “required” remains conditional on reaching the call site.

### 24. Korea — `korea.js:49`

The visual identity is flat reclaimed land, sparse scrub, open asphalt and unfinished marina shells. Four initial barrier calls split the two occupied-road bands; every base-fill pass excludes dedicated patch windows. Required pit and main stand sample terrain then use staged base-seated geometry. Paddock depth includes RVs, freight, perimeter fence and lots. Broad T1/T3 aprons and split tyres/rails/fences surround sparse furniture and a T3 broadcast area.

Mid-lap scrub/grey backdrop shells lead to a segmented seawall, riprap and water bands. A small stand and service area precede required marina shells: short podiums, three plain slabs and two cylindrical cores, sampled per footprint. Raw `prop`/`place` masses deliberately keep shells unglazed. Stadium barriers/towers, water glimpse, set-back T17 apron and final required bridge span plus stair/lift tower finish the circuit. Final marshal posts precheck `onTrack`. The intended “uncovered” secondary stands are passed to `grandstandEx` without explicit roof options; their actual default roof must be determined in shared helper logic, not from comments.

### 25. Kyalami — `kyalami.js:7`

`IN(side)=-side` is central to every face/rake (line31). Open veld acacia, low frustum scrub and boundary gum rows are distinct programmes; later the callback appends outside acacia, rectangular gum woodlots and corner banks. Required brick pit block and race control sit behind engine garages; optional paddock buildings, sparse RVs, broadcast and hoarding accompany them. Local `ironTerrace` makes stepped benches, packed crowd and corrugated roofs; required main grandstand uses sandstone/brick regional vocabulary rather than a generic cantilever.

Corner earth patches, tyre walls, spectator banks and rails lead into three low ridge rings, planar mine-dump mesas and distant buildings. Required headgear, windpump and clubhouse are detailed connected assemblies. Camera masts and distant forest edge precede appended hospitality-kit units, registered floods and convention centre. `estateHouse` (line542) requires every sample to be outside the terrain ribbon, gets `groundUnder` height, then seats houses with hipped roofs; office park, granite koppies and dark firebreak patches finish the site. Commented modern turn names are explicitly not reverified in this pass.

### 26. Madrid — `madrid.js:7`

Madrid keeps local raw `at(frac)=round(frac*n)%n` and `basis`, then composes almost every object through `venueGroup` (line45), optionally rotating its location to a true compass bearing. Local families: IFEMA halls (sawtooth/vault/deck), monumental stands/arcades, varied urban blocks, avenue offices, modular scaffold-like decks and pit bays. Required IFEMA hall is passed through `venueGroup`; literal model strings alone undercount its landmark calls.

The venue includes IFEMA entrance/campus, Barajas control tower/airliner at bearing51°, main shared grandstands with local soffits/end fascias, required S/F tribuna footing, modular decks/pits/control and required La Monumental inner hero. Outer monumental ring remains dense, inner mid-bowl is skipped for the hero. Short apron bays and buttress fins inherit road basis. Required motorway/start/access spans use explicit clearance and soffit/support choices. El Búnker is groundedSegments plus slot bands. Urban ranges, five-tower CTBA horizon cluster, closed nearer skyline, IFEMA stands, plaza/service roads and pavilions form the surroundings. `indexSolid` reserves pavilions; `recordBarrier` pins driving limits across visual wall gaps. Local seated motorhome/tent/tyre stand-ins replace generic forms, then sparse olive scrub, Madrid GP boards and two Sierra ridge layers close the callback.

## Proven comment and interpretation checks

These are source-level checks. Historic measurements quoted in comments remain historical claims unless a current run repeats them.

- **Registry/loading:** every scoped file assigns its own registry key. LSP finds52 declarations; repeated headers saying “all40” refer to the former split/boot measurement, not today's file count.
- **Frame ownership:** current `transformSceneryApi` explicitly converts both `along` and `every` callbacks back to authored nodes. Fuji's line541 inline “every() hands out raw nodes” wording must not override that engine contract. Whether this changes placement for a particular definition depends on whether its wrapper is active.
- **Imola generalization:** `imola.js:19` says every landmark uses R/sl, but direct `forestEdge`, grandstand, barrier and lamp-range fractions remain. The report documents actual call families instead of asserting a universal racing-frame migration.
- **Geometry anchoring:** the shared anchor has a 0.3 m embed; local terrain-resampling in Hungaroring blankets, Imola casali, Jacarepaguá skiffs, Korea models and Madrid groundUnder stand-ins is present in code. That supports the *mechanism* described by comments; it does not independently reprove old buried/floating audit totals.
- **Indianapolis row count:** the Yard of Bricks comment says two staggered rows, while `for (let row=0; row<3; row++)` emits three source iterations. The body is authoritative.
- **Istanbul selector:** after `if (h<.55) return`, the later `h<.5` side test cannot select -1. Source proof requires no rendering.
- **Conditional required models:** early `onTrack`/seat guards can return before a required call, and the shared model engine treats pit supersession specially. Therefore neither literal `required:true` nor a historical “required hero” comment alone proves current runtime presence.
- **Water:** Interlagos reservoir is raw boxes plus one required pin, not reflective typed `waterSurface`; Imola/Indianapolis use `waterSurface`, Jacarepaguá uses waterField/waterBand, and Jeddah/Korea use waterBand. Different emission paths must remain distinct in any renderer investigation.
- **Appearance and reality:** comments explicitly mark uncertain mappings (Hockenheim Mercedes stand, Imola AM lettered stands, Jerez corner order, Jacarepaguá exact peak/pier positions, Korea planned hotels, Madrid ticket numbers). None has been promoted to a surveyed fact here.

## Source model-group call inventory

This inventory was extracted after full reading to aid navigation; it is not the reading method. It preserves dynamic ID expressions and includes helper-level registrations. Options/guards and helper arguments above determine requiredness. `overheadSpan`, water and circuit-kit IDs are additional model-producing surfaces and are described in each circuit map.

### `fuji.js`

- Line 217: `modelGroup("fuji-mount-fuji", {`
- Line 332: `modelGroup("fuji-speedway-hotel", {`

### `hockenheim.js`

- Line 162: `modelGroup("hockenheim-motodrom-screen", {`
- Line 184: `modelGroup("hockenheim-mercedes-tribune", {`
- Line 220: `modelGroup("hockenheim-sued-tribune", {`
- Line 270: `modelGroup("hockenheim-nord-tribune", {`
- Line 324: `modelGroup(ˋhockenheim-pit-bay-${i + 1}ˋ, {`
- Line 354: `modelGroup("hockenheim-race-control", {`
- Line 470: `modelGroup("hockenheim-infield-compound", {`

### `hungaroring.js`

- Line 493: `modelGroup("hungaroring-pit-complex", {`
- Line 545: `modelGroup("hungaroring-main-tribune", {`
- Line 789: `modelGroup("hungaroring-village-church", {`

### `imola.js`

- Line 269: `modelGroup("imola-partenza-stands", {`
- Line 405: `modelGroup("imola-paddock-gate", {`
- Line 492: `modelGroup("imola-racetrack-tower", {`
- Line 691: `modelGroup("senna-memorial", {`
- Line 730: `modelGroup("santerno-footbridge", {`
- Line 787: `modelGroup("imola-historic-race-office", {`
- Line 841: `modelGroup("imola-hill-villas", {`
- Line 857: `modelGroup("imola-tamburello-tribute-wall", {`

### `indianapolis.js`

- Line 126: `modelGroup("indy-main-stands", {`
- Line 141: `modelGroup("indy-pagoda", {`
- Line 176: `modelGroup("indy-scoring-pylon", {`
- Line 217: `modelGroup("indy-pit-stalls", {`
- Line 266: `modelGroup(ˋindy-gasoline-alley-${row + 1}ˋ, {`
- Line 450: `modelGroup("indy-museum", {`

### `interlagos.js`

- Line 58: `modelGroup(ˋinterlagos-favela-${Math.round(s * 100)}ˋ, {`
- Line 131: `modelGroup(ˋinterlagos-crowd-${k}ˋ, {`
- Line 173: `modelGroup(id, {`
- Line 244: `modelGroup(id, {`
- Line 282: `modelGroup("interlagos-pit-tower", {`
- Line 385: `modelGroup("interlagos-main-tribuna", {`
- Line 408: `modelGroup("interlagos-main-tribuna-crowd", {`
- Line 448: `modelGroup("interlagos-senna-s", {`
- Line 560: `modelGroup(ˋinterlagos-favela-core-${i}ˋ, {`
- Line 641: `modelGroup("interlagos-guarapiranga", {`
- Line 659: `modelGroup("interlagos-guarapiranga-shore", {`
- Line 754: `modelGroup("interlagos-sp-skyline", {`
- Line 796: `modelGroup(ˋinterlagos-skyline-core-${i}ˋ, {`
- Line 992: `modelGroup(ˋinterlagos-bowl-${i}ˋ, {`

### `istanbul.js`

- Line 110: `modelGroup("istanbul-turn8-hospitality", {`
- Line 141: `modelGroup(ˋistanbul-pit-bay-${i + 1}ˋ, {`
- Line 169: `modelGroup("istanbul-race-control", {`
- Line 201: `modelGroup(ˋistanbul-paddock-block-${i + 1}ˋ, {`
- Line 315: `modelGroup("istanbul-stone-portal", {`

### `jacarepagua.js`

- Line 136: `modelGroup("jacarepagua-lagoon-shore", {`
- Line 168: `modelGroup("jacarepagua-shore-reeds", {`
- Line 228: `if (p) modelGroup("jacarepagua-fishing-skiff", {`
- Line 234: `if (p) modelGroup("jacarepagua-sail-skiff-a", {`
- Line 240: `if (p) modelGroup("jacarepagua-sail-skiff-b", {`
- Line 286: `modelGroup("jacarepagua-tijuca-ridge", {`
- Line 326: `modelGroup("jacarepagua-pit-grandstand", {`
- Line 358: `modelGroup("jacarepagua-timing-box", {`
- Line 372: `modelGroup("jacarepagua-pit-bleacher", {`
- Line 419: `modelGroup("jacarepagua-paddock-1", {`
- Line 425: `modelGroup("jacarepagua-paddock-2", {`
- Line 431: `modelGroup("jacarepagua-paddock-3", {`

### `jeddah.js`

- Line 297: `modelGroup("jeddah-fountain", {`
- Line 481: `modelGroup("jeddah-blue-sail", {`
- Line 515: `modelGroup("jeddah-golden-twins", {`
- Line 549: `modelGroup("jeddah-golden-tower-hotel", {`
- Line 749: `modelGroup("jeddah-floating-mosque", {`
- Line 779: `modelGroup("jeddah-flagpole", {`
- Line 797: `modelGroup("jeddah-tower-construction", {`

### `jerez.js`

- Line 702: `modelGroup("jerez-ovni", {`
- Line 734: `modelGroup("jerez-control-tower", {`
- Line 764: `modelGroup("jerez-lorenzo-corner", {`
- Line 784: `modelGroup("jerez-dani-pedrosa", {`

### `korea.js`

- Line 138: `modelGroup("korea-pit-complex", {`
- Line 203: `modelGroup("korea-main-grandstand", {`
- Line 381: `modelGroup("korea-marina-shells", {`
- Line 469: `modelGroup("korea-final-footbridge", {`

### `kyalami.js`

- Line 97: `modelGroup("kyalami-pit-block", {`
- Line 128: `modelGroup("kyalami-race-control", {`
- Line 173: `modelGroup(id, {`
- Line 269: `modelGroup("kyalami-main-grandstand", {`
- Line 351: `modelGroup("kyalami-headgear", {`
- Line 387: `modelGroup("kyalami-windpump", {`
- Line 425: `modelGroup("kyalami-clubhouse", {`

### `madrid.js`

- Line 56: `return modelGroup(id, { center, size, basis: basis(a) }, (stage) => {`
- Line 475: `modelGroup("madrid-sf-tribuna", { center, size, basis: basis(a) }, (stage) => {`
- Line 577: `modelGroup("madrid-monumental-stands", {`

## Verification boundary

Pass: 13/13 complete static reads, contiguous inclusive range coverage, SHA-256 ledger, and LSP-backed shared-owner map. Not run in this subtask: browser, geometry builds, unit suites, source edits, commit or push. The parent lane owns documentation integrity checks and integration.
