# Scenery D — complete source map

Scope: sorted `js/circuits/scenery/*.js` positions 40–52 of 52, inspected on 2026-10-27. All thirteen closures were read through their final line. This is a source architecture map, not a runtime or visual verdict. No game source, browser state, or generated assets were changed.

## Read ledger

SHA-256 identifies the exact bytes inspected. Ranges are inclusive and refer to the source files. Reads were bounded with `sed`; adjacent ranges cover every line, including comments. An initial combined Qatar/Red Bull read was truncated and does not count: both were reread in bounded ranges below. Shanghai's combined later read lost a small middle fragment to output truncation; the additional 600–680 read recovered that fragment. No omitted fragment is counted as read.

| Sorted position | Source | Lines | SHA-256 | Completed read ranges |
|---|---|---:|---|---|
| 40 | [qatar.js](../../js/circuits/scenery/qatar.js) | 747 | `3374a9f82097a5899e7d7518f54072c82fb602af22128eac02ff77c6544f979f` | 1–220; 221–440; 441–747 |
| 41 | [redbull.js](../../js/circuits/scenery/redbull.js) | 674 | `805e3d46c7be3b775e1cd2eb683c432dcd95b0bf68c26bb03a027ec0fc1f06b8` | 1–220; 221–460; 461–674 |
| 42 | [sepang.js](../../js/circuits/scenery/sepang.js) | 498 | `2e74ce9c6057088ee1b5b448f8ac458456e6c990c194653ac7ae0094c18bf20b` | 1–250; 251–498 |
| 43 | [shanghai.js](../../js/circuits/scenery/shanghai.js) | 1091 | `37aa0300b0e7e9b8af0fc6080371a8e879828e668255fcfb0f16cf9ffbfa70bc` | 1–250; 251–550; 551–850; 851–1091; recovery 600–680 |
| 44 | [silverstone.js](../../js/circuits/scenery/silverstone.js) | 1400 | `286f2c5e839a7107339fea5d1aaf864e9256633a910fc1efcc29c70a3ef91b44` | 1–300; 301–620; 621–940; 941–1200; 1201–1400 |
| 45 | [singapore.js](../../js/circuits/scenery/singapore.js) | 1176 | `760a431cae7c43f1b72101be72bb7e918cba5cb7ad8cb85e0e8dd3f8d8ae435c` | 1–300; 301–600; 601–900; 901–1176 |
| 46 | [sochi.js](../../js/circuits/scenery/sochi.js) | 578 | `c5be2cc99139da0e7b7872e4025811066ee3407e8a6ad0fe896925d7518cfab0` | 1–290; 291–578 |
| 47 | [spa.js](../../js/circuits/scenery/spa.js) | 925 | `c1d74bea47c168f437892c8407b9f1150872120cfbeb6e454d4516e2c4afef6a` | 1–310; 311–620; 621–925 |
| 48 | [suzuka.js](../../js/circuits/scenery/suzuka.js) | 993 | `edb15193b84ffa4b13de64b4c6961fbf4cdfee203123b6d796487b7d0eb42777` | 1–300; 301–600; 601–900; 901–993 |
| 49 | [vegas.js](../../js/circuits/scenery/vegas.js) | 915 | `35edfe428078ebb2def65ece524d72d44fde264a7dc777842d5741c2b28ea238` | 1–300; 301–610; 611–915 |
| 50 | [watkins_glen.js](../../js/circuits/scenery/watkins_glen.js) | 664 | `d6edd82c0a56b5609016a056cb06181125aaf77abc2c80645e68c5f1783c71b0` | 1–330; 331–664 |
| 51 | [zandvoort.js](../../js/circuits/scenery/zandvoort.js) | 897 | `920cae2d16e1ad4b412961ab4fcaba0bee30af9c41b2bba49a82599efb3b5e3f` | 1–300; 301–600; 601–897 |
| 52 | [zolder.js](../../js/circuits/scenery/zolder.js) | 985 | `8b9ef88b8601e6c19918c935de8a83c67b67d16ced276c1b1c853297a3777678` | 1–300; 301–620; 621–985 |

## Entry and shared contracts

Every file is a strict-mode script registering one `window.TrackScenery[id] = function (api)` callback. The twelve conventional headers still mention the historical “all 40” split; that comment is historical, whereas this directory currently contains 52 files. Zolder has its own extensive brief-to-block index. These scripts produce circuit DATA through the injected scenery surface; they do not implement a renderer or race loop.

LSP evidence used the checked-in `bash tools/mcp/lsp-mcp.sh` entrypoint. Outlines for all thirteen files resolve the registry callbacks at line 8 (Zolder line 36). `TrackBuildProps` outline resolves `buildSteps` at `js/track/scenery/build-props.js:215`, `build` at 2284. `TrackModels` outline resolves `create` at `js/track/scenery/models.js:215`, `drapeKit` at 682. Definitions of `TrackModels.create`, `TrackGeom.addBox`, `TrackGeom.addPrism`, and `TrackGeom.addCyl` were resolved and their returned bodies inspected. A guessed `TrackSceneryModels` symbol and wrong engine-root location for build-props failed; neither is an architecture claim.

The important runtime routing is visible in `build-props.js:2012`: explicit `def.scenery` overrides the registry; otherwise `window.TrackScenery[def.id]` is used. A missing closure warns and builds bare bespoke scenery. The callback gets raw normalized `K(s) = ((round(s*n)%n)+n)%n` at 2034; `K` does not apply scenery origin compensation.

`transformSceneryApi` (71–190) wraps node-based helpers through `TrackSpace.sceneryNode`, flips sides for reversed definitions, and transforms ranged helpers with `sceneryRange`. `bakedModel` has a separate wrapper because its first argument is an id. `groundPatch` uses shift-only node mapping. `frameAt` and `overheadSpan` use the mirrored fraction path when applicable; `circuitKit` uses shift-only fractions. This asymmetry is why Singapore's local `kitNode` exists. Copying `sl()` to every number would destroy intentionally authored mid-lap placements.

`TrackModels.create` supplies `modelGroup` (232–316): validate declared bounds, preflight, emit into a temporary stage, reject false/empty/invalid geometry, optionally enforce a vertex budget, report bounds escapes, preflight the emitted footprint, and append only the complete accepted stage. A pit preflight records supersession with `required:false`; a required id is not a bypass of road guards. Raw `out` calls lack that atomic grouping.

LSP resolves geometry primitives to `js/track/core/geom.js`: `addBox` at 113 uses half extents around its centre and corrects winding for handedness; `addPrism` at 187 puts gable bases at `c` and ridge at `c+u*h`; `addCyl` at 221 builds from base `c` to `c+u*h`. Consequently “box centre” and “cylinder/prism base” comments below are backed by implementation. `seat` adapters are consistently used by these closures as base-position helpers. Material selection is mutable buffer state (`out._mat` / `stage._mat`), normally reset to zero after a local emitter.

`models.js:319` begins `overheadSpan`: clearance is validated against the supplied minimum or default 4.8. Build options inject `frameAt`, terrain sampling, support clearance, and pit-aware preflight. The engine constructs theme/landmark/circuit kits before invoking the closure; `pitBuilt` allows a kit pit building to yield to engine garages. `indexSolid` reserves geometry for deferred foliage without changing driving limits; it cannot retroactively remove bespoke trees already emitted earlier in the same callback.

## Circuit architecture

### 40. Qatar

The first block defines rounded `SL` and `sl()` for racing-frame frontage, then optional hospitality/service/recovery/marshal kits. Local `floodTower`, `arabicSign`, and `qatarStand` are composite emitters; the stand emits an atomic bounded shell, crowd strip, roof and supports. A two-layer dune ring samples terrain with `pyMin` fallback. Flood lighting prefers the shared ring with `pool:false`, adds pit-straight masts through `sl()`, and falls back to custom towers. Seven authored apex fractions receive kerb-only strips.

The pit complex is a required 402 m slab at `sl(0)` on side −1, with garage skin, roof pods and aft control tower. Required media centre, five main-stand bays (first required), T1 stand, Lusail Hill and VVIP canopy form the frontage. The green terraced hill is prop geometry; it does not change road elevation. T2/T3 and T16 use bleachers with stand fallbacks. Mid-lap dunes, scrub, fencing, posts and signs retain their authored frame.

Katara towers and Lusail Stadium use compass vectors from the lap centroid rather than road normals; the actual code places bearings 151°/163° at 740/720 m. This is a compressed skyline representation. Green verge patches compute racing fractions before skipping the pit shoulder; sand aprons use discrete authored bay windows to avoid self-overlapping curved rings. Four villa clusters use a shared stage emitter, with the first cluster required. Terrain seating, group identity, keep-outs and lamp fallback are the principal maintenance boundaries.

### 41. Red Bull Ring

A local `backdrop` wrapper repeats the shared on-road footprint guard before delegating. Alpine atmosphere modifies `pal`; two mountain rings push peaks outward when their footprint touches another leg. Layered near/far foothills, sector-specific forest belts, continuous rail/fence, coloured braking-zone tyre stacks and green runoff establish the landscape.

Required Wing pavilion sits behind the pit complex on +1, opposite −1 pit stands. Start/scoring gantries combine hand poles with clearance-checked spans. Pit lamps skip engine-pit windows; stadium lamps use a computed lens-to-road distance to set light radius. The required bull plaza is a white portal and dark bull assembly on a hillside. Required Lauda/Steiermark stand has five outward-rising uncovered tiers; a following table walks stand lengths in metres using `ds*n`.

Local `chairlift` builds cable beams from endpoints, pylons and suspended cabins. `alpineChalet` adds timber balconies and pitched roofs; `campTerrace` reanchors each tent/RV by nearby node; `pastureFence` deliberately emits posts only; `hayBale` rotates the cylinder basis. Farmyard and fan-village groups, far snow mountains, broadcast compound and camera tower complete the outer scene. Orbit setbacks and slope-related omissions are documented source choices, not a fresh camera assessment.

### 42. Sepang

Plantation regularity is explicit: `along` at 26 m plants detailed front palms and three cheap rear ranks. `farPalm` uses one trunk and crown, rejects road overlap and proximity to the sampled pit-straight corridor. Scrub skips open paddock/stand windows.

The main required Hibiscus Canopy emitter builds stepped seating and six petal bays. `tilt2` rotates the basis in two directions; each bay approximates a hyperbolic paraboloid with a 4×5 panel grid, corner masts and edge beams. `indexSolid` reserves its footprint. Five required pit bays use seated slabs, shutters, teal banding, glass upper storeys and gallery posts. Required race control is a high narrow shaft with glazing and overlapping roof layers.

Other required anchors are positive-rake T1/K1 and T7/F grandstands, plus the KLIA skyline outside the lap. `shelter` wraps shared stands with a common roof/fascia palette. Paddock motorhomes reject mismatched ground samples; kit hospitality/service yards, sampled asphalt pads, gravel traps and drainage water bands surround them. Three horizon ridge layers represent plantation and limestone terrain. Shade walks, sponsor runs and camera towers close the scene. The source explicitly omits the unverified T15 umbrella canopy.

### 43. Shanghai

This is a marsh-campus scene with a deliberately distant hazed Pudong skyline. The initial paddy blocks seat each bund and reed cluster on its own `groundUnder` sample; selected rectangles use registered water surfaces. `groundedSail` replaces the shared floating rib/disc construction with a seated mast and touching slab. `sl()` is normalized for negative fractions; frontage, Yu lakes, snail runoff, lotus stands and T14 use racing coordinates.

Pit garages are raw staged primitives, with glazing and cantilever roof pieces; seven main-stand bays add local soffits and inset end fascias to the shared stand. Twin wings separate required off-road pier groups from `overheadSpan` decks. Their heights derive from `frameAt`; tip fins are extra geometry. Yu lakes are required water identities; required pavilion cluster and boardwalk sit beside them. Lotus/overlapping-circle secondary stand records a barrier, builds rows and canopy discs, and has one literal required id.

`pudongCluster` samples terrain over a 2.4 km pad, hazes the palette, seats four landmark cores, and emits required `shanghai-pudong`; exact skyline distance is representational. `midfieldCampus` makes service roads, grass variation and reserved tech sheds. `BS(r)=sl(r-0.10)` rekeys the long back-straight furniture, while T14 is separately keyed to racing 0.8227. Remaining marsh shelf, sponsorship, crowds, tree rings and low city strips retain authored layouts where intended. Do not conflate geographic-source comments with measured game placement.

### 44. Silverstone

The largest file in this slice combines airfield, farmland, paddock and race-weekend camping. Local `backdrop` grows a deep-skirted green hill to clear sampled terrain; `flash` seats thin decals rather than sinking them through `place`. `hedge` delegates then bins hedge centres into a 16 m grid; `nearHedge` and `OAK_KEEPOUT` protect later camping and broadleaf planting. Atmosphere sets overcast sky, then explicitly sets grass runoff.

Tables define hazed low horizon rings, field hedges, copse belts, fast-corner apron patches, blue-roof stands, bleachers, spectator banks and signs. Frontage includes four required Wing facade groups with zig-zag roof bands and red/white trim, required podium checks, required control tower, Hamilton Straight stand and a separate required wave roof. The latter builds four roof crests and oriented blades with explicit basis handedness. Pit wall uses grounded segments and separately records the barrier.

Racing Kit yard rows snap garage scale/pitch to nodes, rotate fronts toward the road, and retain procedural building fallbacks. Three required RAF T2 hangars use seven tangent roof strips each. Heritage museum/plane, barns/silos, runway marks and helicopter pad add airfield identity. Wheat patches tile and resample each tile. One camping implementation computes per-unit ground/wheels and group bounds; another large field implementation reserves land, rejects compressed columns and overlapping pitches, avoids hedges, and adds flags/marquees. `indexSolid` protects deferred foliage, while direct earlier planting still requires spatial separation. Baked furniture is enhancement or has fallback; no asset availability was exercised here.

### 45. Singapore

Reverse/mirrored scenery makes coordinate contracts unusually important. `kitNode(s)=(n-K(s))%n` meets shift-only circuit-kit placement with a fully transformed anchor and opposite side. Shared kits provide race control and pedestrian link. `makePortal` emits three short overhead decks per span, relying on built-in supports instead of mismatched hand legs. Far `place` silhouettes and `cityFront` corridors leave Marina Bay Sands/Supertrees windows clear.

Required skyline assemblies include Marina Bay Sands (three leaning towers plus touching Skypark), Fullerton Hotel, Anderson Bridge's one off-road truss group, Parliament, two Esplanade domes, Singapore Flyer, pit wave roof, and Merlion. Other civic geometry includes old court/dome, new court disc and St Andrew's spire. Flyer struts are endpoint-oriented with alternating axis offsets. The opposite Anderson rail emits outside the atomic footprint to avoid a single group crossing the live road.

Reflection strips use the bay's `pyMin` water level and skip covered land; water bands carry named bay identities. Flood masts disable pools. Pit kit control gets a local beacon through `kitNode`. Start gantry uses rounded scenery shift directly (mirror inverse); start-light housing is an overhead span with `startLights:true`. `sgFence` splits around tyre windows and steps posts back behind stacks, omitting the engine pit opening. Temporary `scaffoldBay` builds positive-rake decks, sparse crowd and fascia. Neon signage has one sparse hand/ring pass, with separate pit funnel hoarding. Bumboats use a local composite emitter. Merlion's source calls the real statue 8.6 m but its game head is placed at 20.5 m: treat this as stylization, not measured fidelity.

### 46. Sochi

Olympic Park is modelled as distinct required venue silhouettes around pale plaza patches: Fisht telescoping shell halves; Bolshoy drum/dome; Adler long glazed box; flame tower; Iceberg chorded roof; five Olympic rings with stems/hub support; Shayba layered puck; Ice Cube; and Olympic Park station. The flame pool is a thin box lifted to the maximum sampled terrain, rather than a low global water plane. Fountain cylinders use an explicit embed constant.

Pit bays are required glazed bodies with louvres, deck and oversailing roof. Required race control connects its mast to the roof. Main stand and civic drum/slab buildings face the frontage. `arcStand` first collects stations and limits each row's chord to real neighbouring-row distance, then scales canopy reach to the deck footprint. Three such stands cover Adler/T5, T13 and T17. Planting avoids these spans; plaza hedges split around foldbacks. Gravel, tyre, rail and camera placement tables form corner furniture. Three ridge rings form the hazed Caucasus; cypress avenues and parterres provide formal landscaping. The source's old “9 jets” explanatory comment no longer matches the five-iteration loop.

### 47. Spa

Damp Ardennes atmosphere is followed by explicit grass runoff; start gantry alone is rekeyed with `sl`. Three no-snow mountain rings and terrain-gated backdrops frame the circuit. An `OPEN` table shares exclusion windows across bespoke pine passes. `crownClear` rejects road-clipped crowns and excessive terrain variation; `plantPine` combines both checks. This prevents a low tier disappearing while upper cones hang unsupported.

Pit kit/race control, motorhomes, old pits, broadcast compound and baked fallback modules dress paddock areas. `ardennesTerrace` supports roofed and open timber seating, with sparse or fuller fans. Gold-3 stands, a required dual jumbotron with foundation, and continuous grass bank sit above Eau Rouge. Required brook crossing is an off-road service bridge; the water strips and valley wall share its compression area.

Slope-aware local architecture is substantial: `footprintFloor` raises a local floor against a 3×3 sample grid; `foundationBounds` mirrors foundation support extent; `partsBounds` unions part projections. `chalet` builds complete bounded supported houses; `rvCamp` can group each complete unit separately and preserve stable source ids after relocation. Required timing tower and overhead footbridges supply other identities. Dense pine belts and staggered forest ranks follow OPEN windows, with bounded lobed broadleaf substitutions around Pouhon. The old-road reconstruction re-seats chord endpoints and crossfall samples, derives a handed basis, lays short road/shoulder slabs, and adds memorial/trees only if enough chords survive. Francorchamps village and church complete the scene.

### 48. Suzuka

Layered green mountain rings sample skirts and solve base height while preserving peak height. Required Circuit Wheel uses a 52 m radius, twelve segments, terrain-high-point footing, thick teal rim, alternating axis offsets and cabins. Motopia rides/hotels are kept sparse and deeper than the wheel. Required arrival gate lifts box pillars by half-height; local carousel samples rim terrain; drop ride uses a mast/ring canopy stack.

Pit kit race control is a four-level setback building, with a required clock group attached to its upper face. Broadcast/hospitality sit behind garages; custom required pit-paddock mass sits opposite main stands. Start span, brand plate, footbridges, Degner/130R gantries and Dunlop arch use overhead versus off-road support contracts deliberately.

Figure-eight geometry derives lower/upper road heights from `py` at 0.437/0.845. Soffit clearance follows their difference, green parapets are lateral thin spans on the upper ribbon, and piers/abutments sample terrain but crown at road `py`. Required cheek id keeps “left” for stability although code places it on +1. Lower portal and abutment crowns have separate groups. Mixed Japanese forest, sakura, cedar/cypress, autumn broadleaf and bamboo clumps frame stands. Required Spoon terrace and 130R bank add stable local identities beside shared seating; shrine is an optional group with a base-anchored roof. Raw array access requires care because helper coordinates can be transformed independently.

### 49. Vegas

Local `ferrisWheel` emits required High Roller; `lotBleacher` samples the entire lot, raises the rig, optionally adds foundation, then builds asphalt stripes, scaffold, crowd bands/speckles and stairs. `sl()` maps racing fractions for the principal frontage and Strip. Fences, neon walls and tyre stacks keep engine pit windows open. Sparse desert ring contrasts with hotel skyline boxes, spandrels and bright crowns.

Required Grand Prix Plaza is four glazed setback levels behind the left pit lane; right stands/masts/broadcast form the other frontage. Pack modules have building fallback. Sphere is required truncated ellipsoid geometry from fourteen cosine-spaced latitude frustums, meridian ribs and seated apron. Wynn/Encore, Caesars, Bellagio and Paris balloon are required local groups; Venetian/Palazzo/Eiffel use shared buildings/tower. Bellagio has fountains, registered lake surfaces, balustrade and non-colliding apron patches.

Strip canyon densification uses hazed hotel backdrops, sparse local shop-front pods, casino tower table, palms, billboard rhythms and alternating stand/lot types. Gateway span width is measured between transformed anchors, avoiding raw `hw[k]` at the wrong frame. The file retains both deliberately authored low back-of-house city rows and racing-keyed hotel/landmark placements. Neon colours are source palette choices, not proof that a light was registered; compare Red Bull's explicit `api.lampPost` registrations.

### 50. Watkins Glen

Autumn hardwood is explicit: local plumb `maple` uses a world-level basis, lobed frustums and crown; dense close Esses ranks replace excluded generic foliage. Deeper conifers/hardwoods and forest-edge tables use seasonal colours. `liftToTerrain` raises complete footprints using nine samples.

Required pit garages include proud shutter skin and rooftop timing rail. Required lattice timing tower connects booths/roof/antenna; required Pit Terrace uses foundation and sparse coat bands. Local timber `bleacher` emits positive-rake planks and individual crowd; required Esses hill is a compact supported marker beside a larger shared grass bank. Blue rail tables choose double Armco on the fast run and single elsewhere with node-separated seams.

Seneca Lake is a distant northeast water band; nearer ridge rings omit its angular corridor. Covered footbridge is assembled from stacked overhead spans and required timber piers. Boot bog camp has irregular tents, charred bus, rims/fire/pallets; climb camp adds trailers; dairy farm adds double roof, silo and per-post sampled pasture fence. A separate RV lot uses a level basis and lowest corner sample per rig. Main gate/ticket booth, tech sheds and camera masts finish the scene. Camp identities and terrain policy intentionally differ; lifting a whole bog group to the maximum would change its grounding behavior.

### 51. Zandvoort

Coastal sand/marram, North Sea surfaces and beach patches dominate. Local `dune` repeats mountain fit/shrink guards but omits wholly hidden skirts; `addMountain` supplies the visible top. Near/mid dunes use transformed anchors; far peaks search lateral candidates and shrink width while maintaining plausible height. Sparse pine belts, individual marram prisms, guarded bushes and short jittered `marramHedge` chunks protect chicane bowl walls and camps.

`duneDeck` is a temporary open scaffold with barrier recording, tiers, orange crowd and bolt-on stair tower. Shared stands supply permanent silhouettes; three `bowlSeatWall` runs follow valid outside arcs. Beach terraces, orange camps, surf bands and fanzone stage are atomic groups. Required festival wheel is a ten-segment 20 m radius local assembly, approximate location/size explicitly labelled uncertain. Wind turbines, guarded/deduplicated beach huts and narrow sea glints populate distant layers.

Kerb/SAFER strips cover Hugenholtz and Luyendyk; fencing explicitly records barriers; rails, tyres, billboards and lamps follow tables. Required lighthouse and watertoren use base-position primitive stacks, with a keeper's house on the lighthouse. `seasideTown` uses horizon `pyMin`, while beach pavilions use local anchors. The blanket comment that all dunes never float is intent, not evidence across every extended footprint. The removed fixed roof strip is correctly described as delegating tier-dependent height to the shared stand.

### 52. Zolder

The source begins with a block-to-brief map: pale sand under dark Scots pine, flat club facilities, restrained memorial and Limburg plantation. `seatMotorhome` rejects anchor/terrain disagreement. `clubBuilding` emits a terrain-lifted flat-roof group. `emitOpenStand` builds outward-rising seating and roof; `clear` samples three longitudinal stations and three lateral positions against road clearance. `OWNED` windows keep global passes away from named corner dressing.

`SL/sl` and early `indexSolid` reservations precede forest emission. Global passes create two grades of sand, near pine ranks, sparse scrub/birch, two forest-edge depths, full-lap Armco, debris fence, marshal gaps, deep outer-only pine ranks, sandy forest rides and open heath. Inner deep ranks were intentionally removed because foldbacks reached pit facilities.

Only pit/start structures are racing-keyed: garage row, terrain-seated offices, sponsor band, yard/trucks and scrutineering; required main stand, museum and five-pole Villeneuve memorial. Other required local group is the Sterrenwacht building/drum, retaining authored-frame debt. Named authored corner blocks dress Earste chicane, Kanaal spoil ridge, motorhome park, Bianchi, Villeneuve viewing/memorial, service yard, Kleine, Bolderberg, Terlamen and Rindt. The chicane memorial remains one small low building distinct from paddock poles. Fast-sweeper pine loops and distant terril finish the callback; terril bearing is explicitly uncertain. These are source constraints, not independently surveyed real-world placement.

## Verified comment boundaries and maintenance implications

- Verified against primitive code: boxes need half-height centre lifts; cylinders/prisms start at their supplied bases. Sochi mast and Suzuka shrine-roof explanations match those contracts.
- Verified against transform implementation: raw `K` is unshifted; helper families do not all apply identical transformations; Singapore kits are shift-only and the local mirror inverse is purposeful.
- Verified against model implementation: required groups can be road-rejected or pit-superseded; staging preserves assembly atomicity and emitted bounds are rechecked. Literal required ids are source/test integration points, not visibility guarantees.
- Verified against call-site arithmetic: Qatar pit length is 402; Silverstone hangars have seven roof bands; Suzuka wheel has twelve segments; Vegas Sphere has fourteen latitude bands; Sochi fountain loop has five jets despite historical prose mentioning nine.
- Historical audit counts, orbit problems, external dimensions, geographic bearings, real-life architecture citations and claims of prior measured support are retained as source commentary. They were not reproduced with browser, geometry build or external research in this task. “Required”, source presence and a valid emitter are distinct from runtime success.
- Future terrain/placement work belongs in generic helpers when it changes their behavior. Circuit edits should retain authored/racing distinctions, reserve deferred foliage before it runs, bound whole assemblies, and treat raw tangent extrapolation as a need for per-item ground sampling.

Verification for this documentation-only edit is delegated to the parent session. No runtime tests, browser runs, commit or push were performed by this lane.
