# Scenery A — complete callback reading map

Read on 2026-10-27 at checkout HEAD `212adc24b985b120a63507c988abea69e7740e74`. Scope is the first 13 paths from lexicographically sorted `js/circuits/scenery/*.js` (52 callbacks total), abudhabi through estoril. Every line of these 13 callbacks was read, including local emitters and comments; this is a source map, not a rendered visual verdict. No game source was changed and no browser was run.

Instructions read: root `AGENTS.md`, `js/circuits/AGENTS.md` (symlink to CLAUDE.md), `js/track/AGENTS.md`, `.claude/rules/game-code.md`, and `.claude/skills/code-nav/SKILL.md`. There is no nested scenery AGENTS.md. The audit note about code-nav was also read; the actual skill governs navigation.

## Full-file reading ledger

Ranges below are inclusive and partition each entire file. SHA-256 covers the exact UTF-8 bytes, not normalized text. Initial combined output attempts were truncated; those attempts do not count: abudhabi and the albert_park/anderstorp boundary were re-read completely using the bounded ranges below. Subsequent tool result budgets were raised explicitly and all listed complete ranges returned without truncation.

| Path under js/circuits/scenery/ | Lines | Complete read ranges | SHA-256 |
|---|---:|---|---|
| abudhabi.js | 1024 | 1–250; 251–650; 651–1024 | `5184a7cda03f9ffeb254be56f349148667ad84e4f306f6435a25b7bf3e4dba98` |
| albert_park.js | 787 | 1–400; 401–787 | `cac02663a612de38edf0a46e69ec96039ebe0479f0cb56d7308cd9a16e769138` |
| anderstorp.js | 953 | 1–400; 401–953 | `54d64b718388c3114b352dc0393ae346cb6a52b427520f0c6933bd92c0ba136c` |
| bahrain.js | 1203 | 1–600; 601–1203 | `43b2886e64b71aac74fd6381bfaee5dbad2e45340cf0a159b4a80bead3978355` |
| baku.js | 870 | 1–450; 451–870 | `97e87efd76e48ce9bd92cfd4da66ea724d62a342680b2884b5d87dd3e8488038` |
| brands_hatch.js | 935 | 1–400; 401–935 | `cc2394ae1c180dac6f5de36878271b72224aeb729c75cc0596475f1ab1170615` |
| buddh.js | 715 | 1–715 | `37360583bfcf68bdc42d1f8ec415c5ab47e1daaed25a6a7533c21029b1964dcf` |
| buenos_aires.js | 380 | 1–380 | `17415169fe83e68352b05fdac97afbf25bbd5d96f94c5a29a70fd3ec76805acd` |
| catalunya.js | 454 | 1–454 | `a339054419c6b750b7adf95a044fc6797f3935fc2fea89f33132c5f9a98bea70` |
| cota.js | 627 | 1–627 | `229d8f739ed8ad4512b849a470a46bcd431d185a381239884780d5e95b429a0e` |
| dijon.js | 824 | 1–430; 431–824 | `0f65b1e925d3c590d7873998396ed10acd0222dcf5214eb50eef44dd6b95ed7c` |
| donington.js | 704 | 1–350; 351–704 | `f820744dbe16ac15e4f80a57e2905e4e18aeaea853db099b83130b1c8d60f186` |
| estoril.js | 441 | 1–441 | `226e58490f7918d51f0eb870473f080985b67dc10f5a903436badcc421fa6b79` |

Total: **9917 lines, 13/13 callbacks**. The remaining 39 callbacks are outside this report.

## Engine contract and navigation evidence

- Registry: each file assigns `window.TrackScenery[id] = function(api)`. It is lazy scenery data; there is no per-file script tag. The engine resolves the callback and invokes it once per prop build. Source callback emission mutates `out`; most callback functions have no explicit return.
- Frozen public API: **114 unique members**, as enumerated and count-asserted in `tests/unit/scenery-api-contract.test.mjs:26` and `:59`; assembly is `js/track/scenery/build-props.js:2049`. Additions/removals require a deliberate contract update. Hero IDs are frozen separately in `tests/data/landmarks/<id>.json`; required literal groups are scanned in a 2200-character window by the contract test. Dynamic group IDs can be required at runtime without being literal landmark pins.
- Position shapes differ: node helpers take `(K(frac), side, gap, ...)`; grandstands take a fraction; barriers/terraces take fraction ranges; primitives take world positions. K is normalized into [0,n), including negative fractions (build-props:2034). Albert Park alone retains a local `k(s)=Math.round(s*n)%n`; its observed calls use nonnegative values.
- +Y is up; metres/radians; side −1 is left and +1 right. Gap is measured beyond the road edge. Basis arrays are normally [right,up,tangent]. A cylinder's axis is the SECOND vector: MSAC uses [up,tangent,right], and Donington's airliner / Baku's carpet roll use [right,tangent,up]. This is a geometry contract, not cosmetic metadata.
- LSP definition `SceneryNature.create` resolves to `nature.js:54`; positional definition `nature.js:92:11` resolves the actual anchor body (92–131): normalized node, terrain sample beyond gap 2.2 m, banked road datum inside that gap, fallback ground estimate, and **0.3 m embed**. Therefore Anderstorp's seatBox comment about anchor embedding is current, not stale.
- LSP positional definition `build-props.js:1231:11` resolves place (1231–1266): terrain-aware center, 0.8 m buried base, per-call separation slots, road guard, visible-solid driving boundary for height ≥0.85 m, and solid-index reservation. Raw addBox is center-based; seat.box takes a foot and adds half height. seat.cyl/cone/frustum/prism preserve the native foot-based primitive shape.
- LSP `TrackModels.create` resolves `models.js:215`; its modelGroup body (232 onward) preflights a declared footprint, emits into a private stage, rejects false/empty/nonfinite/invalid-index/exception/budget failures, and commits the complete group only after validation. Pit-superseded groups are suppressed with required=false. Declared bounds and actual emitted footprint both matter; a plausible center alone cannot prove a group emits.
- LSP `TrackSpace.sceneryFrac` resolves `core/space.js:95`, `sceneryNode` resolves :101, and references place its engine consumer at `build-props.js:72`. The API boundary remaps authored nodes/ranges once. `along` and `every` give callback bodies authored-frame nodes, preventing double shifts. Primitive world coordinates are not remapped.
- The wrapper has deliberate asymmetry: groundPatch/waterField/groundedSegments/circuitKit use origin-only shifts, whereas the ordinary trackside helpers apply the full scenery transform. All 13 corresponding definitions currently explicitly use sceneryCoordinates='racing' and reverse=false, so no reverse-only inference is needed here. Abu Dhabi, Bahrain, Brands Hatch, Buddh and Donington also have sceneryStartFrac and locally re-key only line-related structures via inverse shift; do not apply an extra global correction to their remaining corner dressing.
- LSP outlines identify engine owners: SceneryNature (nature.js), SceneryCity (city.js:14), SceneryStructures (structures.js:5), SceneryIdentity (identity.js:5), TrackModels (models.js), CircuitKit (circuit-kit.js:64). build-props creates/binds them, guarded primitives, geometry buffers, transformed API, then calls scenery. The venue pass and deferred forestEdge / roadside foliage replay run afterward (build-props:2114 onward), so a callback's source order is not final foliage order.
- Lighting is a separate registration contract: bright colored boxes or a tower cap do not imply point lights. Albert's parkLamp registers lampPost; Abu Dhabi calls floodMast for the real S/F rig; Bahrain delegates registered shared masts and adds local head geometry. Water helpers feed typed reflective-water geometry; Buenos Aires' custom lake instead uses terrain-following colored boxes.

Navigation used local `bash tools/mcp/lsp-mcp.sh` outline/definition/references/symbol queries, with bounded bodies. An attached-tool guessed TrackSceneryBuildProps lookup correctly returned symbol-not-found; the real module is TrackBuildProps. Resolving a destructured callback anchor directly returned zero definitions, so its actual engine declaration was resolved by positional LSP. One nonexistent placement.js query and one transient LSP process failure supplied no evidence and were replaced by successful owner/definition queries. Broader SCENERY-API.md output was truncated and is not claimed as a full-document read; contract statements above are grounded in the bounded implementation and contract-test reads.

## Per-circuit geometry and behavior

### abudhabi.js

Lines 9–118 bind helpers, define dusk/LED/glass palettes and inverse-shift sl/R. The existing definition uses sceneryStartFrac=0.075; only the line/pit/north-hairpin features move through sl. Kits add race control, hospitality, event service and two camera cranes. Required LED canopy groups flank the hairpin and T9. Lines 120–303 construct two dune rings, city silhouettes, start garages/gantries, pit-exit tunnel portal with ground trench, Ferrari World sawtooth roof and logo discs, hairpin stands and light pools. Lines 305–399 build the typed marina band, required yacht basin, extra yachts, hotel masses, paved apron and marina bleachers.

Lines 400–665 are the major geometry contract: twin required Yas towers, named ground supports, seven required overhead arches with varying clearance, custom oriented steel chord members and re-orthogonalized glass-cell panels, required off-road veil fragment, two overhead bridges with explicit model-group piers and barrier reservations, then reflecting pool and dock lights. Lines 667–1024 finish stand/fascia pairs, Radisson masses, sparse marina fingers, palms, barriers, pit hospitality, control beacon, screen boxes, mega-yacht/jetty, low dunes, chord-aligned coaster loop, arena and Ferris wheel. Many pools are painted geometry; only explicit registered mast calls prove lights. Bridge barrier extents use a hard-coded 5300 m divisor; preserve that authored dependency when changing length.

### albert_park.js

Lines 9–90 bind a local node helper, kits and required MSAC complex. The long vaulted roof explicitly rotates its cylinder axis onto the hall tangent. Lines 92–233 define large reflective lake/shore sheets, boats, two required fountains, reeds, pier/scull, five skyline heroes, sparse lit CBD fabric and park berms. Lines 235–377 build eucalyptus belts and lake-sightline exclusions, palm avenues, temporary containers, boathouses, and required Lakeside Stadium with terrain pitch.

Lines 379–471 build required 2026 Piastri stand with positive rake, indexSolid and front/back barrier reservations, plus Fangio/Brabham/Jones/Hill and other stands and split T11 bowl walls. Lines 473–605 leave the engine in charge of pits, then add tents, containers, mounds, banked kerb strips, turf/golf patches and circuit barriers/marshals. Lines 607–787 define six sparse-crowd timber/mat park decks, sponsor boards, camera tower, motorhomes and lamp zones. parkLamp draws housing and explicitly registers sodium lenses; S/F uses cool floodMast fixtures. Local k is not the normalized API K, a maintenance distinction even though current arguments are safe.

### anderstorp.js

Lines 1–52 provide an explicit numbered 0–20 map and bind the API. Lines 54–246 define cool forest/grey-airfield palette, RW0=0.545/RW1=0.875 corridor, world-space road clearance, predeclared stand/shed footprints and crown-aware plantPine/plantTree/plantBush wrappers, plus seatBox, aircraft, windsock and braking-board helpers. Footprint tables compensate for early tree emission before later structures exist.

Lines 248–420 plant receding Scots-pine ranks outside the open runway/paddock window, armco shell, required concrete press stand, speaker tower and 1968 timber station, low garages and line furniture. Lines 421–711 cover T1 grey apron, service sheds/fuel silos/helipad, Sodra bank, woods/huts, bog water/reeds, Opel outside, scrub infield, T5 and the flared runway apron/paint/light sequence. Lines 713–953 add required paired Flight hangars, flying club and parked aircraft, far-side runway fields/barn, apron end, T7 enclosure and T8 stands/terrace. All distant rows use clear/footprint guards. Native plant aliases matter: local pine/tree/bush are wrappers, not new public API members.

### bahrain.js

Lines 9–47 derive SF from built _sceneryShift, T1F from turns[0], FC from turns[13], then place required kit facilities. The origin is sceneryStartFrac=0.225, and the file mixes derived racing anchors with retained authored sectors. Lines 49–299 define sand/cream/slate/HDR light palettes, two dune rings, Manama bearing-side skyline, Musco lampHead, registered mast delegation with output-length success check and fallback geometry, terrain-seated duneWedge, hospitality/access helpers and closed sakhirTribuna emitter.

Lines 301–600 build pit hall, required start overhead span, required main tribuna, motorhomes/control tower, required cylindrical LED Sakhir Tower, hospitality city frontage, T1 stand and required Schumacher board, required University stacked stand with flanking stands, terrain wedges and T4 furniture. Lines 601–947 continue stands/compound/dunes, required Beyon stand, pit-safe barriers, scoring overhead, pit-exit stand and floods, alternating full-lap light ring, dry scrub, terrain-seated dune ridges/wind towers, marquee and video walls. Lines 948–1203 add straight-only GA terrace, acacias, broadcast/oasis, a segmented two-lane drag strip at gap178 with tree/stands/floods, stepped rock shelves and service-road/tech-shed midfield detail. ledFacadeBands called inside a modelGroup emits via its helper rather than passing stage explicitly; do not infer group membership from indentation alone. Current source mixes old geographic narrative with tuned geometry; visual claims require builds.

### baku.js

Lines 9–124 define sandstone/glass/civic/sea palettes, kit finish bridge, street pit exclusion windows and near-road wall/fence/rail, plus painted street/waterfront lamps. Lines 126–360 create city silhouettes, facade bands, Government House composite, opposite-pit Absheron stands, gantries/broadcast/flagpoles and required Flame Towers with tapered glass, fire bands and crowns. Roadside plane/cypress/palm avenue and balconies precede the old-city corridor.

Lines 362–497 split ramparts and merlons around the T7 inner bend, place narrow per-node squeeze curtains/piers and gateway towers, and add required Icheri Sheher bastion. Lines 499–605 define required Maiden Tower and forecourt plus required Shirvanshah palace; palace seating samples eleven terrain points and chooses the highest before emitting. Lines 607–870 finish old-town masses, castle-exit terrace, named stands, glowing Caspian rail, city frontage shifted back for orbit corridor, glass skyline, hoardings, three typed Caspian bands, Ferris wheel/plinth, sparse yachts, Flag Square pole and rolled-carpet museum. Lamps are decorative boxes without lampPost registration in this callback. The waterfront's open side is intentional; broad city fill would change the venue identity.

### brands_hatch.js

Lines 1–148 establish numbered bowl/frontage/infield/bridge/woods/furniture/horizon bands, broadleaf palette, WOODS_A=0.378/WOODS_B=0.845, guarded car parks and mixed tree belts. Lines 150–287 build open spectator hills, split Druids terraces, Stirlings bleachers, chalk scrapes/desire paths, rim catering, cars and distant hedged boundaries. Inside-hairpin seating avoids the apex to keep offset rows from folding together.

Lines 289–510 derive rounded sl for the start complex and define positive-rake open stand geometry. Four required named groups (Pit Straight, Desire Wilson, Paddock Hill, Hailwoods) reserve solids explicitly; partial cover is optional. Retail/workshops/entrance/marquees/concourse/car parks deepen the outside frontage. Lines 512–650 build infield garages/race control/gantries, required terrain-seated Kentagon, paddock transporters/motorhomes, Cooper Straight buildings and helipad. Lines 652–935 create raw footbridges at Druids and Pilgrims, four woodland ranks with bridge/post exclusions, ground litter/logs/gravel, barriers/cameras/hoardings, Kent ridges and five no-snow far hills. The footbridges are raw addBox assemblies, unlike Donington's kit overhead bridge; their source is not evidence of a validated overheadSpan contract.

### buddh.js

Lines 1–83 explicitly warn that block/turn labels use the old origin; only line complexes use sl, derived from the definition (startFrac=0.7551, sceneryStartFrac=0). Lines 84–190 define short bank chains, outfield clear guards, dust/field/brick/haze palettes, kiln and pylon helpers. Lines 192–398 build lap barriers, required closed pit block behind engine pits, required main stand whose wave canopy faces the track with positive rake, parking and paddock coach/service ranks. Roof geometry uses truss stations and interpolated metal sheeting rather than a generic stand roof.

Lines 400–584 build broad runoff, dry inside ground, worked fields/bunds/farmstead, scaffold stands, constructed earth banks and spectator hill, haze chains and east stands, then final-corner and sparse infield/outfield detail. Lines 586–715 add required generic temple/hill silhouette and the rural depth system: six kilns, pylon strings, crop/burnt plots, village boxes and field-boundary trees. This callback intentionally substitutes runoffApron/place/ridge for historically failing groundPatch/motorhome/backdrop shapes; the dated header is historical test evidence, not proof those engine helpers remain invalid today. Temple placement is explicitly a regional cue, not a surveyed on-site landmark.

### buenos_aires.js

Lines 9–108 establish classic concrete/celeste palette, sparse bushes and mass-concrete terraces around S/F, Curvon and lake straight. Required Curvon group adds a deeper seven-tier concrete bank. Lines 110–175 build required pit block and square control tower, gantries, paddock/broadcast, panel-style signs and hoardings. Lines 177–266 add gravel/tyres, covered secondary stands, grass banks/talud, guardrails, ridge rings, distant apartment blocks, uncertain entrance poles and plane-tree avenues/camera positions.

Lines 268–350 build three required named assemblies: portico, approximate Confiteria cafe and talud access gate. Lines 352–380 implement a custom lake in raw world XZ at (120,-285), ellipse42×24, 6m cells. Each cell samples a 3×3 terrain grid and spans low-0.14 to high+0.09; indexSolid reserves its band. It is colored prop geometry, not waterSurface, so reflection/water-buffer behavior does not follow from its visual lake intent. Nearby comments explicitly call the real location uncertain.

### catalunya.js

Lines 9–82 define a local sunTerrace that scales nominal bay spacing by the offset-verge chord ratio, preventing inner-curve overlap, plus foliage exclusions around stands. Lines 84–241 add required individual pit bay groups, required race control, gantries, main shared stand with required fascia/glazing/canopy overlay, uncovered J, required pit-end scoreboard and a railway ballast/twin-rail run behind the left grandstand.

Lines 243–348 add paddock/broadcast, T1 stand, open sun terraces, sail canopies, spectator banks and explicit Stadium B/G/C uncovered bleachers plus covered T10/H, gravel/barriers and unnamed countryside ridge rings. Lines 350–454 finish floods, pergola paddock clubs, hedges/cypress, ochre farmland strips draped onto the actual terrain, sponsor boards, stone-pine second ranks, camera towers and recovery/marshal kits. The required main-stand group intentionally omits shell mass because shared grandstandEx owns seating; adding a full-depth local body would cover the rake. Fractions are racing frame with no sceneryStartFrac.

### cota.js

Lines 9–71 define metres-to-frac span helpers and required amphitheater (stage/deck, stepped roof/PA towers/LED wall/lawn crowd). Lines 73–193 set Texas dry-grass/red-steel palette, many stand forms and main-stand fascia group, split terrain-aware upper bays, non-required garage group with corner terrain sampling, paddock units and media tower. Lines 195–305 form Big Red/esses earthworks, required T1 crest marker, high-rake bleachers with rail=false, amphitheater and required observation tower with red tube veil and flare ribs.

Lines 307–531 add plaza water/apron, selectively terrain-seated mounds, scaffold seating, red frameworks, RV/tent camping, three depth rings of backdrop landforms, sparse far city, foliage belts and mesquite/live oaks. Lines 533–627 define cotaGantry: required overhead span plus required per-side cylinder supports, start-light registration, runoff, pit wall/barriers, signs/braking boards/cameras, parking and sodium-look lamp geometry. The final lamp loop draws fixtures but does not register lampPost. Some raw prisms deliberately use [t,u,r] while the major Big Red/esses banks use [r,u,t]; preserve these differences when interpreting width/depth.

### dijon.js

Lines 1–196 map all 18 sections, define dry Burgundy palette, terrain-oriented ridgeAt, guard wrappers, drapeRun fields with five separation residues, raised vine rows, poplar rows, outcrops and terrain-seated farmsteads. Lines 198–360 build required pit garages/race control, main stand/line furniture/floods, spartan service paddock, open field frontages, spectator hills, Pouas and short limestone/outfield ridges.

Lines 362–492 add required Combe limestone benches with independently sampled feet, open valley fields/vineyards/hamlet and required Prenois farmstead. Lines 494–695 cover measured Villeroy handedness, esses, Bretelle, required Parabolique positive-rake bank at0.830 rather than the falling outer corner, open infield and line/paddock exit. Lines 697–824 add isolated trees, guarded short hedge/fence tiers, crop/vine parcels/farmsteads/sheds/rapeseed, limestone outcrops and five plateau far hills. drapeRun is fundamental: ordinary one-height ground boxes do not follow this hillside. Historical row headings retain old corner wording; the detailed comments explicitly distinguish measured centerline handedness from unverified brief names.

### donington.js

Lines 1–173 define 18 row blocks, parkland palette, ridge heading, guarded specimen/safeBox/hut/rank/carPark helpers. Lines 175–238 derive rounded sl from startFrac0.9072 versus sceneryStartFrac0 and move only pit/SF complex; garages, offices, paddock depth, broadcast, stands, gantry, public parking/tree belt use that frame. Lines 240–350 model the closed Collection hall and roof-plant curb, Redgate, required Hollywood positive-rake stand and Garage39, with open grass banks around its footprint.

Lines 351–437 keep Craner infield low, build dark outer wood/Old Hairpin bank and Starkey's required kit bridge with explicit abutment/wing-wall surroundings. Lines 439–561 build Schwantz/McLeans, required parked EMA airliner with tangent-axis fuselage/apron/gear, Coppice woods, Esses tunnel mouth, Melbourne rural buildings and Goddards. Lines 563–704 finish spaced parkland/estate ranks, barriers/banks, required Ratcliffe power-station silhouette and farmland far hills. Ratcliffe uses compass bearing66.1° at compressed3400m from lap centroid, eight two-stage cooling towers plus chimney; it is intentionally independent of road normals. No browser evidence is claimed for dated scenery-audit measurements in comments.

### estoril.js

Lines 9–66 define a bespoke Atlantic-wind stonePine (trunk + flared parasol + shallow cone), scrub and deeper pine loops. Lines 68–140 state racing frame/no sceneryStartFrac and build required thirty-bay 201m pit terrace plus required timing tower in plain limewash, pantile/azulejo, terrace posts/stair towers and gantries. Lines 142–213 define local scaffoldStand with sparse figures and optional striped awning, six named scaffold sites, two grandstandEx bays and early gravel.

Lines 215–296 build five segmented Parabolica gravel patches, two spectator banks, tyres/boards/rails, three local ridge rings and bearing-defined Serra de Sintra mountains. Lines 298–412 add required aldeia/church, water depot and explicitly uncertain moinho, then camera masts and stone-pine belts. Lines 414–441 finish open hairpin cork-oak proxy acacias, distant scrub, sponsor/camera and recovery kit. No Atlantic water is emitted: inland hills and Sintra are the explicit horizon. Motorhomes are omitted by design after historical burial findings; the local scaffold emitter is distinct from the public same-named API helper.

## Verified stale comments (source contradictions only)

These are documentation defects, not asserted rendering defects, and remain unedited:

| Callback | Comment | Current implementation evidence |
|---|---|---|
| brands_hatch.js:100 | carPark skips terrain mismatch >0.8m | :112 uses absolute difference >0.28m |
| bahrain.js:950 | GA terrace is between 118m hero stand / gap36 Victory stand | :303 main hero len=58; :345 Victory gap=44 |
| buenos_aires.js:72 | Curvon front terrace clears grandstandEx@38 | :188 actual covered stand gap=68; later prose :185 describes the deeper arrangement |
| donington.js:204 | second S/F bank gap30 | :205 passes gap32 |
| donington.js:402 | a smaller frozen API contract | contract test CONTRACT_SIZE=114; build-props API has drape/drapeRun |
| estoril.js:235 | three shorter gravel patches | :237 enumerates five stations:0.876,0.884,0.900,0.916,0.928 |
| anderstorp.js:865 | gap31 for apron-end blue shed | :867 passes gap28; preceding historical offset34/36 prose is also no longer the current argument |

Not stale: Anderstorp's anchor-0.3m and place-0.8m embedding explanations match current engine definitions. The repeated 'all40 together were1083KB' header is historical boot-cost narrative, not a current roster count. Buddh's old turn labels are explicitly explained by the opening frame legend; do not silently rename them as if they were current racing fractions.

## Exact local helper and model inventory

Counts below are syntactic call sites, not runtime instances or emitted geometry counts. Generated by AST traversal of the same byte-hashed files after full reading: imported API aliases are mapped to their public names, local wrappers are identified separately, and literal/dynamic group IDs retain source expressions. Optional branches and loops are intentionally not expanded.

### abudhabi.js inventory

Direct API call sites: K ×54; addBox ×55; addCone ×1; addCyl ×15; addFrustum ×4; along ×2; anchor ×36; backdrop ×1; billboard ×4; bleacher ×3; building ×6; bush ×1; cityFront ×2; fence ×3; ferrisWheel ×1; floodMast ×1; gantry ×2; grandstandEx ×19; groundPatch ×4; guardrail ×3; hash ×22; hedge ×2; lapBounds ×1; marshalPost ×1; modelGroup ×8; motorhome ×1; mountain ×3; onTrack ×2; overheadSpan ×2; palm ×7; place ×8; recordBarrier ×4; sailCanopy ×1; tower ×5; tyreWall ×5; vadd ×107; wall ×1; waterBand ×1; waterSurface ×1.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, addPrism, circuitKit, forestEdge, grandstand, groundPlane, landmarkKit, n, out, prop, px, py, pyMin, pz, seat, underpassPortal.

modelGroup sites: 97: id; 201: "abudhabi:pit-exit-tunnel-portal"; 227: "abudhabi-ferrari-world"; 316: "abudhabi-marina"; 442: "yas-hotel-left-tower"; 446: "yas-hotel-right-tower"; 458: id; 590: "yas-hotel-gridshell".

CircuitKit method sites: 62: raceControl; 73: hospitality; 78: serviceCompound; 83: cameraCrane; 87: cameraCrane.

### albert_park.js inventory

Direct API call sites: addBox ×28; addCone ×7; addCyl ×8; addFrustum ×4; addPrism ×3; anchor ×19; backdrop ×1; bankedKerbStrip ×9; billboard ×7; bowlSeatWall ×2; building ×2; cameraTower ×1; cityFront ×1; every ×2; fence ×13; floodMast ×1; forestEdge ×14; gantry ×2; grandstandEx ×10; groundPatch ×6; guardrail ×10; hash ×25; indexSolid ×1; lampPost ×1; marshalPost ×1; modelGroup ×7; motorhome ×1; onTrack ×14; palm ×2; recordBarrier ×4; tower ×1; tree ×3; tyreWall ×4; vadd ×100; waterSurface ×5.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, addPyramid, bush, circuitKit, groundYAt, hedge, n, out, place, prop, px, pyMin, pz, seat, track.

modelGroup sites: 53: "albert-msac"; 114: `albert-lake-fountain-${kk}`; 143: `albert-shore-reeds-${seed}`; 327: `albert-boathouse-${seed}`; 356: "albert-lakeside-stadium"; 391: "albert-piastri-stand"; 619: id.

CircuitKit method sites: 20: marshalShelter; 24: recoveryBay; 28: trackSigns; 32: hospitality; 36: serviceCompound.

### anderstorp.js inventory

Direct API call sites: K ×216; addBox ×1; addCyl ×1; addFrustum ×1; anchor ×11; billboard ×17; building ×40; bush as plantBush ×1; cameraTower ×5; every ×1; fence ×7; forestEdge ×11; gantry ×1; grandstandEx ×5; groundPatch ×36; guardrail ×6; hash ×20; marshalPost ×25; modelGroup ×4; onTrack ×3; pine as plantPine ×1; place ×31; runoffApron ×12; spectatorHill ×2; sponsorHoarding ×6; terrace ×1; tree as plantTree ×1; tyreWall ×6; vadd ×32; waterBand ×1.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, n, out, seat.

modelGroup sites: 304: "anderstorp-press-stand"; 330: "anderstorp-speaker-tower"; 350: "anderstorp-stations-1968"; 741: "anderstorp-flight-hangars".


### bahrain.js inventory

Direct API call sites: K ×92; acacia ×1; addBox ×70; addCyl ×12; addFrustum ×4; addMountain ×2; addPyramid ×1; anchor ×25; backdrop ×2; billboard ×17; broadcastCompound ×1; building ×9; bush ×3; cameraTower ×5; cityFront ×1; every ×1; fence ×9; floodMast as apiFloodMast ×1; floodMastRing ×1; grandstandEx ×18; groundPatch ×1; guardrail ×2; hash ×36; lapBounds ×1; ledFacadeBands ×1; marshalPost ×8; modelGroup ×8; mountain ×2; onTrack ×21; overheadSpan ×2; palm ×1; place ×1; terrace ×1; terrainYAt ×8; tower ×1; tyreWall ×7; vadd ×133; wall ×2.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, addCone, bleacher, circuitKit, def, ds, grandstand, n, out, px, pyMin, pz.

modelGroup sites: 253: id; 307: "bahrain-main-tribuna"; 378: "bahrain-control-tower"; 408: "bahrain-sakhir-tower"; 482: "bahrain-schumacher-corner"; 515: "bahrain-university-grandstand"; 642: "bahrain-beyon-grandstand"; 1066: "bahrain-drag-tree".

CircuitKit method sites: 34: hospitality; 38: serviceCompound; 42: serviceCompound; 46: recoveryBay.

### baku.js inventory

Direct API call sites: K ×49; addBox ×70; addCone ×14; addCyl ×20; addFrustum ×23; addPrism ×1; along ×3; anchor ×34; backdrop ×9; billboard ×5; broadcastCompound ×1; building ×2; cityFront ×11; cypress ×1; fence ×4; ferrisWheel ×1; gantry ×2; grandstand ×4; grandstandEx ×6; groundPatch ×1; guardrail ×1; hash ×38; marshalPost ×1; modelGroup ×4; onTrack ×5; palm ×1; plane ×1; sponsorHoarding ×2; terrace ×1; terrainYAt ×5; tower ×1; tyreWall ×1; vadd ×166; wall ×10; waterBand ×3.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, circuitKit, ds, every, n, out, waterSurface.

modelGroup sites: 259: "baku-flame-towers"; 477: "baku-icheri-sheher-wall"; 511: "baku-maiden-tower"; 570: "baku-shirvanshah-palace".

CircuitKit method sites: 63: pedestrianBridge.

### brands_hatch.js inventory

Direct API call sites: K ×81; addBox ×15; anchor ×20; billboard ×4; bleacher ×1; broadcastCompound ×1; broadleafFall ×2; building ×20; bush ×2; cameraTower ×1; conifer ×2; every ×7; fence ×7; forestEdge ×2; gantry ×2; groundPatch ×17; guardrail ×1; hash ×21; hedge ×3; house ×6; indexSolid ×4; marshalPost ×2; modelGroup ×5; motorhome ×2; mountain ×1; onTrack ×6; pine ×1; place ×10; ridge ×1; signBoard ×4; spectatorHill ×6; sponsorHoarding ×6; terrace ×2; terrainYAt ×7; tower ×1; tree ×11; tyreWall ×9; vadd ×21; wall ×3.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, n, out.

modelGroup sites: 357: "brands-pit-straight-stand"; 371: "brands-desire-wilson-stand"; 386: "brands-paddock-hill-stand"; 400: "brands-hailwoods-stand"; 538: "brands-kentagon".


### buddh.js inventory

Direct API call sites: K ×97; addBox ×25; addCone ×2; addCyl ×3; addFrustum ×4; anchor ×9; billboard ×6; broadcastCompound ×1; bush ×6; cameraTower ×2; every ×2; grandstandEx ×2; guardrail ×9; hash ×23; marshalPost ×7; modelGroup ×3; onTrack ×8; place ×22; ridge ×1; runoffApron ×39; scaffoldStand ×1; spectatorHill ×1; sponsorHoarding ×3; terrainYAt ×2; tree ×8; tyreWall ×4; vadd ×62.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, n, out.

modelGroup sites: 248: "buddh-pit-complex"; 329: "buddh-main-grandstand"; 609: "buddh-temple-hill".


### buenos_aires.js inventory

Direct API call sites: K ×24; addBox ×28; addCyl ×4; anchor ×7; billboard ×1; broadcastCompound ×1; building ×2; bush ×2; cameraTower ×3; every ×4; fence ×1; forestEdge ×1; gantry ×2; grandstandEx ×2; groundPatch ×4; guardrail ×3; hash ×8; indexSolid ×1; lapBounds ×1; marshalPost ×5; modelGroup ×6; motorhome ×1; onTrack ×2; plane ×2; ridge ×1; spectatorHill ×4; sponsorHoarding ×1; terrace ×5; terrainYAt ×1; tyreWall ×3; vadd ×55.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, n, out, pyMin.

modelGroup sites: 87: "baires-terrace-curvon"; 110: "baires-pit-block"; 130: "baires-control-tower"; 271: "baires-portico"; 303: "baires-confiteria"; 329: "baires-talud-gate".


### catalunya.js inventory

Direct API call sites: K ×23; addBox ×30; addCone ×2; addCyl ×4; along ×3; anchor ×12; billboard ×1; bleacher ×3; broadcastCompound ×1; building ×1; bush ×2; cameraTower ×1; drape ×1; every ×5; fence ×3; floodMast ×1; gantry ×2; grandstandEx ×5; groundPatch ×4; guardrail ×3; hash ×8; hedge ×3; lapBounds ×1; marshalPost ×5; modelGroup ×5; motorhome ×1; onTrack ×5; pine ×1; ridge ×1; sailCanopy ×1; spectatorHill ×1; sponsorHoarding ×3; stonePine ×1; tree ×1; tyreWall ×3; vadd ×65.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, circuitKit, n, out, px, pyMin, pz, seat.

modelGroup sites: 87: `catalunya-pit-bay-${i + 1}`; 116: "catalunya-race-control"; 157: "catalunya-main-grandstand"; 200: "catalunya-pit-end-scoreboard"; 359: `catalunya-paddock-club-${i + 1}`.

CircuitKit method sites: 446: marshalShelter; 450: recoveryBay.

### cota.js inventory

Direct API call sites: K ×44; acacia ×1; addBox ×27; addCone ×1; addCyl ×8; addFrustum ×4; addPrism ×9; along ×2; anchor ×20; backdrop ×1; billboard ×9; bleacher ×3; building ×2; cameraTower ×1; cityFront ×1; fence ×4; forestEdge ×11; grandstandEx ×14; groundPatch ×3; guardrail ×4; hash ×15; marshalPost ×1; modelGroup ×6; motorhome ×3; onTrack ×5; overheadSpan ×1; place ×2; plane ×1; scaffoldStand ×1; spectatorHill ×1; terrace ×1; terrainYAt ×2; tyreWall ×3; vadd ×77; wall ×1; waterSurface ×1.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, ds, grandstand, hw, n, out, seat.

modelGroup sites: 25: "cota-amphitheater"; 99: "cota-main-grandstand"; 160: "cota-pit-garages"; 222: "cota-turn1-big-red"; 269: "cota-observation-tower"; 547: `${id}-support-${side < 0 ? "left" : "right"}`.


### dijon.js inventory

Direct API call sites: K ×61; addPrism ×4; anchor ×10; billboard ×5; building ×5; bush ×5; cameraTower ×4; drapeRun ×3; every ×1; fence ×2; floodMast ×1; grandstandEx ×2; groundPatch ×16; guardrail ×13; hash ×12; hedge ×3; marshalPost ×12; modelGroup ×6; mountain ×1; onTrack ×2; ridge ×1; spectatorHill ×3; sponsorHoarding ×4; terrainYAt ×12; tree ×9; tyreWall ×7; vadd ×31.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, drape, n, seat.

modelGroup sites: 176: id; 209: "dijon-pit-garages"; 232: "dijon-race-control"; 378: "dijon-combe-cut"; 468: "dijon-prenois-ferme"; 584: "dijon-parabolique-bank".


### donington.js inventory

Direct API call sites: K ×109; addBox ×8; addCyl ×2; addFrustum ×3; anchor ×12; billboard ×4; broadcastCompound ×1; building ×19; bush ×5; cameraTower ×1; every ×1; fence ×7; forestEdge ×15; gantry ×1; grandstandEx ×3; groundPatch ×19; guardrail ×13; hash ×7; hedge ×16; lapBounds ×1; marshalPost ×12; modelGroup ×3; mountain ×1; onTrack ×7; place ×4; ridge ×1; spectatorHill ×8; sponsorHoarding ×7; terrace ×1; terrainYAt ×6; tree ×3; tyreWall ×8; vadd ×19.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, circuitKit, motorhome, n, out, pyMin, seat.

modelGroup sites: 282: "donington-hollywood-stand"; 465: "donington-ema-airliner"; 662: "donington-ratcliffe-power".

CircuitKit method sites: 403: pedestrianBridge.

### estoril.js inventory

Direct API call sites: K ×26; acacia ×1; addBox ×3; addCyl ×1; addFrustum ×5; anchor ×8; billboard ×1; broadcastCompound ×1; bush ×2; cameraTower ×2; every ×6; fence ×1; gantry ×2; grandstandEx ×2; groundPatch ×4; guardrail ×3; hash ×12; lapBounds ×1; marshalPost ×5; modelGroup ×6; mountain ×1; onTrack ×1; ridge ×1; spectatorHill ×2; sponsorHoarding ×2; tyreWall ×3; vadd ×75.

Other API bindings (values, member-call namespaces, or unused compatibility bindings): MAT, circuitKit, forestEdge, n, out, px, pyMin, pz, seat, tree.

modelGroup sites: 79: "estoril-pit-terrace"; 112: "estoril-timing-tower"; 151: id; 306: "estoril-aldeia"; 343: "estoril-deposito"; 370: "estoril-moinho".

CircuitKit method sites: 437: recoveryBay.

## Verification boundary

Pass: complete source reads and SHA-256 ledger for all 13 callbacks, AST parse/inventory of every callback, matching definition frame fields, bounded LSP owner/contract lookups, and comment-to-code comparisons. Skip: geometry builds, screenshot surveys, runtime light/water/overhead validation and browser tests (read-only source-mapping scope). Required IDs denote intended runtime obligations; source presence alone does not establish successful emission. Parent integration owns repository-wide docs-only checks.
