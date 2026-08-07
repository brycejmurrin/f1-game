# Scenery upgrade plan — shared models + per-circuit dressing

Working document for the track-scenery improvement pass. Produced from an
engine audit of `js/track/*` plus 24 per-circuit research reviews (one per
circuit, real-world reference vs. what `scenery(api)` currently emits).

Read alongside [SCENERY-API.md](SCENERY-API.md) (the toolkit) and
[SCENERY-GROUNDING.md](SCENERY-GROUNDING.md) (anchoring rules).

---

## 1. Engine-level findings

### 1.1 `grandstand()` is one template used 248 times

`js/track/scenery-nature.js` exposes exactly one grandstand form, and the 24
circuit files call it **248 times** (shanghai 28, redbull 25, bahrain 23,
silverstone 19, abudhabi 19 …). Every one of those renders the identical
silhouette:

| part | geometry | varies? |
|---|---|---|
| back shell | `[10, 12, len]` box at `gap+7.5` | colour + `len` only |
| crowd | `crowdBank(rise 7, depth 4.2)` | riser tint only |
| roof | `[12, 0.8, len+2]` slab at `+13` | never |
| rear fascia | auto-closed gap | never |
| night strip | emissive under-roof band | never |

So the only knobs a circuit has are **length and two colours**. Height, tier
count, roof style, end walls, pylons, glazed suite decks, and open/uncovered
variants are all impossible. This is the single largest cause of "every track
looks the same": a Monza tifosi bowl, a Bahrain desert stand, a Baku temporary
scaffold deck and a Miami pastel bleacher are the same 12 m grey box.

Nine of the reviews independently reported "all our grandstands look identical"
as a top-3 issue.

### 1.2 Half the roster never touches the facility kit

`circuitKit` ships nine facilities (`pitBuilding`, `hospitality`, `raceControl`,
`cameraCrane`, `marshalShelter`, `recoveryBay`, `serviceCompound`, `trackSigns`,
`pedestrianBridge`). Usage across all 24 circuits:

```
serviceCompound 9   hospitality 9   marshalShelter 6   recoveryBay 5
pitBuilding 3       cameraCrane 3   raceControl 2      pedestrianBridge 2
trackSigns 1
```

Only 12 circuits call the kit at all. **12 do not** — cota, imola, interlagos,
madrid, mexico, monaco, montreal, monza, redbull, shanghai, vegas, zandvoort.
Those tracks hand-roll their pit complexes out of stacked `building()` boxes
instead, which is why so many reviews land on "the pit building is a flat slab
with no garage-bay rhythm and no control tower."

`trackSigns` — braking boards, corner numbers, sponsor hoardings — is called
**once in the entire game**.

### 1.3 The generic pit/grandstand fallback is crude and unconditional

`js/track/tracks.js:1546-1559` runs for every circuit, before `def.scenery`:

```js
for (let i = 0; i < 7; i++) {
  const k = (i * 4) % n;
  place(k, -1, 14, [6, 11, 16], [0.5, 0.5, 0.56]);   // grandstand shell
  crowdBank(k, -1, 8, 16, 7, 4.2, …);
  place(k, 1, 12, [7, 5.5, 16], [0.83, 0.83, 0.86]); // pit building
}
```

With `ds ≈ 4 m` that is a 112 m grey slab on each side of the first 100 m of
every lap, in the same two colours, regardless of where the circuit's real pit
straight is and regardless of whether the circuit already built its own. On
Monza it sits on top of the bespoke Tribuna Centrale and pit canopy.

### 1.4 Local helpers reinvented per circuit

The same composites keep being hand-written inside individual circuit files
instead of living in the engine:

| composite | circuits that hand-rolled it |
|---|---|
| tiered/stepped crowd bowl | monza (`tieredBowl`), hungaroring (`terracedHillStand`), imola (`tieredBowl`), mexico (`boundedStand`), interlagos (`crowdBank`) |
| TV/camera tower | silverstone (`tvTower`) |
| sponsor hoarding run | silverstone (`hoardingLine`) |
| helipad | silverstone, interlagos, miami |
| yacht / marina | monaco (`megaYacht`), abudhabi, miami |
| RV / tent camp | spa (`rvCamp`), zandvoort, cota, redbull |
| jumbotron / big screen | mexico, bahrain (`videoWall`), hungaroring |
| chairlift | redbull |
| hillside village | imola |

Circuit files average **11 local helper definitions each**; abudhabi and
bahrain have 20 apiece.

### 1.5 Zero circuits model a broadcast compound

Every real F1 venue has satellite dishes, OB vans and camera cranes behind the
paddock. **No circuit in the game has any of it**, and there is no dish
primitive at all. This was independently the most-requested new shared model —
it appeared in 14 of the 24 reviews.

### 1.6 What the captures show

From `scratch/captures/review-identity/` (aerial / corner-tour / driver-eye per
circuit, via `tools/apex-capture.mjs identity`):

- **Street circuits read as scattered blocks, not street canyons.** Monaco's
  aerial is a field of detached boxes with sky between them; the driver-eye shot
  shows daylight gaps between every façade. Real street circuits are continuous
  walls. `cityFront` walks `along(step=22)` and emits a façade whose frontage is
  `depth ± 30%` (15–29 m) at a **constant** `gap`, so roughly half the units leave
  a visible gap and none stagger in depth. A `contiguous: true` option — frontage
  pinned to `step`, with the jitter moved onto depth/height/setback instead —
  would give real frontage walls for the same vertex count.
- **Grandstands read as bare pale slabs at any distance.** In the Silverstone
  corner-tour the stands around the far side are featureless light-grey boxes:
  the crowd speckle is small enough to vanish beyond ~100 m and the roof slab is
  the same tone as the shell. Roof/fascia colour contrast (see §2 `grandstandEx`)
  matters more than crowd detail at broadcast distance.
- **The terrain ribbon ends on a hard polygonal edge** visible in every wide
  aerial — the ring simply stops against the skybox. Worth a faded outer skirt or
  a distance-hazed backdrop ring.
- Foliage does most of the visual work on permanent circuits and does it well;
  the infields are the empty part.

---

## 2. Proposed shared models

Ranked by how many circuits asked for them. Names are proposals; each addition
needs an entry in `CONTRACT` in `tests/unit/scenery-api-contract.test.mjs`, a row in
`docs/SCENERY-API.md`, and — where the signature leads with `(k, side, …)`,
`(s, side, …)` or `(s0, s1, side, …)` — registration in the matching list in
`transformSceneryApi` (`js/track/tracks.js:277-299`) so reversed/source-coordinate
circuits remap correctly.

### Tier 1 — build these first

**`grandstandEx(s, side, gap, len, opts)`** — a superset of `grandstand()` that
keeps the old call signature working. `opts`: `{ tiers:1|2|3, h, roof:"cantilever"|"flat"|"none"|"truss", suites:bool, suiteCol, endWalls:bool, pylons:bool, shell, crowd, crowdMix, uncovered:bool }`. Requested by
baku, jeddah, miami, vegas, singapore, monaco, montreal, spa, silverstone, redbull.
This is the highest-leverage change in the whole plan — it upgrades 248 existing
call sites' worth of visual variety.

**`spectatorHill(s0, s1, side, gap, opts)`** — informal grass-bank terracing:
3–5 stepped earth risers following the terrain, sparse crowd speckle on top, no
shell and no roof. Cheap (`every()`-stepped boxes). Requested by monza (Lesmo,
Curva Grande), spa (Eau Rouge/Pouhon banks), suzuka (Spoon, 130R), cota (Turn 1
hill), silverstone (embankments), interlagos, zandvoort (dunes), redbull (Green
Hill), hungaroring, mexico, miami.

**`broadcastCompound(k, side, gap, opts)`** — OB-van box row + 2–3 tilted
satellite dishes (`addFrustum` backing + `addCyl` rim) + a short mast, optionally
composing the existing `cameraCrane`/`serviceCompound`. Requested by 14 circuits;
currently zero coverage.

**`sponsorHoarding(s0, s1, side, gap, opts)`** — continuous trackside advertising
board run (promote silverstone's `hoardingLine`). Fills long straights that read
empty: Monza's straights, Spa's Kemmel, Baku's 2.2 km blast, Jeddah, Bahrain's
back straight. Pairs with widening `trackSigns` usage from its current one call.

**`cameraTower(k, side, gap, opts)`** — lattice mast + railed platform + camera
head (promote silverstone's `tvTower`). Cheap repeated furniture, wanted
everywhere.

### Tier 2 — strong reuse, moderate effort

**`jumbotron(k, side, gap, w, h, opts)`** — big double-sided LED screen on posts,
plus an optional variant that mounts mid-span on `gantry()`. Hand-rolled today at
mexico, bahrain, hungaroring; wanted by every start/finish straight.

**`helipad(k, side, gap, opts)`** — H-marked pad + windsock + optional parked
rotor silhouette. Hand-rolled at silverstone, interlagos, miami.

**`marinaBasin(s0, s1, side, opts)`** — water band + tiered yacht rows + jetty
fingers + mooring posts, as one call. Hand-rolled at monaco and abudhabi;
wanted by miami, singapore, jeddah, montreal.

**`fanCamp(k, side, gap, opts)`** — grid of gable tent prisms + RV boxes +
flagpoles. Hand-rolled at spa; wanted by cota, silverstone, zandvoort, redbull,
hungaroring.

**`parkingDeck(k, side, gap, opts)`** — open-sided multi-level precast car park
with ramped ends and sparse car dots. Wanted by miami, cota, mexico, vegas.

**`ledMegascreen(k, side, gap, w, h, opts)`** — thin emissive facade panel with
banded "video" pattern. Wanted by vegas (Resorts World), baku, shanghai, suzuka,
cota, miami.

**`trussBridge(k, side, dist, span, h, col)`** — distant steel-truss road/rail
bridge silhouette from repeated struts. Wanted by montreal (Jacques Cartier),
miami, baku, jeddah, shanghai.

**`waterTower(k, side, dist, opts)`** — shaft + tank drum + conical cap. Wanted
by zandvoort (the real 1912 watertoren) and generically useful.

**`constructionSite(k, side, gap, opts)`** — hoarding fence + tower crane +
portacabin row. Wanted by singapore (NS Square), jeddah (Jeddah Tower), vegas,
qatar.

### Tier 3 — narrower but still shared

- **`arenaBowl(s0, s1, gapL, gapR, opts)`** — paired-side stadium wrapper that
  places both walls facing each other in one call and asserts symmetry. Zandvoort's
  Arena is currently modelled on one side only, exactly the mistake this prevents.
  Also mexico (Foro Sol), cota.
- **`infieldStand`** — dual-aspect stand on an island between two track legs.
  cota T6, silverstone, suzuka.
- **`monumentFlagpole(k, side, dist, opts)`** — tall pole + large flag panel.
  baku (National Flag Square), jeddah (171 m pole, already bespoke), miami.
- **`ruralFarmstead`** — barn + A-roof + silo + shed. redbull, spa, hungaroring, imola.
- **`hillsideVillage`** — promote imola's terrain-grounded village cluster
  (it already solves per-building XZ grounding correctly). spa, suzuka, zandvoort.
- **`colonnade`** — neoclassical column row + pediment + optional dome.
  singapore (National Gallery), baku (Government House), albert_park.
- **`gondolaLift`** — A-frame pylons + twin cables + coloured chairs. Promote
  redbull's `chairlift`.
- **`boathouse`** — low pitched-roof shed + ramp + upturned hulls. albert_park,
  montreal.
- **Roof-style options on `building`/`pitBuilding`** — `roof:"pleated"|"sawtooth"|
  "swept"` plus a `roofTerrace` flag. Wanted by montreal (Espace Paddock),
  silverstone (The Wing's swept roofline is currently a flat slab), hungaroring,
  spa (Pit Bar terrace), abudhabi (Ferrari World).
- **`canopyRow(s0, s1, side, opts)`** — auto-places N `sailCanopy` sails along a
  stand run with jittered height/rotation instead of hand-authored
  `anchor()`+`sailCanopy()` triples. shanghai (hand-rolls it twice), suzuka,
  zandvoort, miami, qatar.
- **`pavilionCluster(s, side, dist, opts)`** — pavilion box + prism roof + lit
  window band, repeated with jitter (promote shanghai's `yuGarden`). suzuka,
  miami, vegas waterside villages.
- **`industrialShedRow(s0, s1, side, opts)`** — low flat-roofed factory sheds with
  roll-up-door banding. shanghai (Anting auto plants), suzuka (Honda), silverstone
  (industrial estate) — currently nothing represents factory-adjacent skylines.
- **`airportBackdrop(k, side, dist, opts)`** — control tower (tapered box + glass
  cab + radar mast) plus a low-poly airliner silhouette on approach. madrid
  (Barajas), mexico (Benito Juárez), singapore (Changi), bahrain.
- **`expoHallCampus(...)`** — parameterised exhibition-hall generator (white box +
  glass strip + roof lanterns). Promote madrid's `ifemaHall`; vegas (Convention
  Center), miami, cota.
- **`bankedBowlRing(s0, s1, tiers, arcDeg)`** — continuous stepped tiers wrapping a
  banked corner (promote madrid's `monumentalStand`). zandvoort, cota.
- **`branchShadeCanopy(k, side, gap, opts)`** — steel trunk + radiating frond struts,
  Tilke's paddock shading motif. qatar (the signature 2023 renovation detail),
  bahrain, jeddah, abudhabi, miami.

---

## 3. Per-circuit findings

Condensed from the 24 reviews. "Hero" = bespoke geometry worth building for that
circuit alone.

| circuit | top accuracy gaps | hero |
|---|---|---|
| **monaco** | Prince's Palace placed behind Casino Square instead of on Le Rocher across the harbour; Grandstand K too short and sited before Tabac (real span Tabac→Piscine); no Yacht Club de Monaco; no Grimaldi Forum; `cityFront` disabled in sectors 1/3/6 with nothing replacing it | Yacht Club de Monaco wave roof; harbour-backdrop Rock |
| **monza** | no crowd at all at Lesmo (0.43–0.54) or Curva Grande (0.08–0.18); Roggia's namesake ditch unmodelled; forest ranks repeat uniformly past the manicured Villa/lake arc; pit complex hand-rolled instead of `pitBuilding` | saplings growing out of the Sopraelevata ruin; golf-course fairway in the infield |
| **spa** | no facility kit at all — pit complex is one slab; Blanchimont grandstand missing; Gold 4 (Raidillon) undersized post-2022 rebuild; Kemmel straight has no signage over 800 m; Eau Rouge has no brook | Eau Rouge valley wall + stream; Pit Bar rooftop terrace |
| **silverstone** | The Wing's signature swept roof is a flat slab; hangars sit on Hangar Straight where none have existed since the base closed (the real repurposed one is the Silverstone Experience museum by the entrance); ~20 stands all one grey | The Wing roofline; Silverstone Experience |
| **suzuka** | pit complex is three raw boxes, no garage rhythm, no clock-face control tower; Spoon and 130R use roofed stands where the real viewing is grass terracing; Degner→hairpin corridor bare; Dunlop arch missing | Dunlop Curve sponsor arch; clock-face control tower |
| **singapore** | pit building modelled as five garage sheds instead of the continuous ~350 m glass Pit Building; National Gallery / City Hall and the Cricket Club pavilion absent by the Padang; three overlapping billboard systems stack near 0.90–0.98; Bay Grandstand modelled although decommissioned in 2023 | glass Pit Building; National Gallery; NS Square construction site |
| **bahrain** | Sakhir Tower is at the pit straight with a sail canopy — the real one is at Turn 1 and LED-wrapped full height; dune mounds too dense/rolling for what is flat scrubland at 0.47–0.56; same `mountain()` params reused ~15× | Sakhir Tower, relocated and LED-wrapped |
| **baku** | no grandstand at the Filarmoniya/Azneft pair (0.75–0.78) or Icheri Sheher (0.545); National Flag Square (162 m pole) absent; Port Baku Towers indistinguishable from filler | National Flag Square |
| **abudhabi** | the pit-exit tunnel under the main straight (an F1 first) is entirely absent; Ferrari World is a flat box (`landmarkKit.roof kind:"sawtooth"` exists and is unused); Etihad Arena on the wrong side; ~22 hulls for a 222-berth marina; 15 stands in 2 colours | pit-exit tunnel |
| **jeddah** | 62 m pit building vs. the real 280 m four-storey media centre; Golden Tower hotel at T1 missing; Al-Rahma mosque placed at 0.165 instead of the real turnaround near 0.495; the 0.78–0.86 technical sector has no structures at all; LED tunnel runs unbroken for 6.2 km | Jeddah Tower under construction (crane-topped, unfinished spire) |
| **zandvoort** | the Arena (0.735–0.78) has a seat wall on ONE side — it is a facing-bowl in reality; pit complex under-scaled vs. the 2020-21 rebuild; Masterbocht (~0.60) empty; the modelled lighthouse is invented (Zandvoort's was decommissioned in 1907) — the real landmark is the 1912 water tower | the Arena as one atomic model; watertoren |
| **interlagos** | corner dressing is displaced — the code dresses "Ferradura" at 0.70 and "Junção" at 0.82 while the GPS-referenced `bankZones` put them at 0.455 and 0.741; Arquibancadas (0.8375 — literally "grandstands") has none; Bico de Pato/Mergulho undressed; Subida dos Boxes has no retaining wall | curved Arquibancadas stand following the bend |
| **cota** | Grand Plaza has no reflecting pool (`waterSurface` is imported but unused anywhere in the file); 0.28–0.42 is the emptiest stretch and is exactly where the real tailgating/RV fields are; 12 stands in one grey; T6 infield stand modelled as an ordinary trackside box | Main Grandstand swept canopy; Grand Plaza pool |
| **mexico** | Foro Sol seating rendered as a rainbow block — the real bleachers are grey concrete with blue buckets; left side 0.28–0.50 has no treeline at all; no camera towers or corner signage anywhere; "Estadio Azteca" comment mislabels a stand (the real Azteca is 9 km away) | low-flying airliner on approach to Benito Juárez |
| **miami** | five `cityFront` runs share two palettes; ~11 stands cycle four pastels; pit/paddock/arrival are three near-identical white boxes; T17 hairpin gets no bespoke treatment; car parks are flat slabs on a circuit whose identity is car parks | (heroes already built — refine Hard Rock crowd variation) |
| **vegas** | pit building is six generic garage boxes although the real Grand Prix Plaza is a 300,000 sq ft permanent landmark; T1–T5 (convention-centre back-of-house) uses the same glitzy palette as the Strip canyon; Bellagio water is one 110 m patch for ~300 m of real frontage; Fontainebleau and Resorts World absent | Grand Prix Plaza pit building |
| **montreal** | Jacques Cartier Bridge absent; Casino de Montréal at 30 m vs. the real 8–9 storeys; Habitat 67 is five plain backdrop boxes; no facility kit usage at all; 11 stands share one palette | Habitat 67 stepped cubes; Jacques Cartier |
| **imola** | left treeline hole 0.17–0.22; Villeneuve chicane has no crowd; race-control tower modelled at 22 m vs. the real 7-storey Torre di Controllo; hospitality stranded mid-hillside at 0.49 instead of the paddock | Torre di Controllo; Tosa "Casa degli Eventi" glass pavilion |
| **redbull** | `crowdBank` is never called — the Green Hill (0.20–0.38), the circuit's broadcast signature, is bare green boxes; the T1–T3 mega-stand is modelled as 5 disconnected chunks; 0.40–0.62 has no near-field texture | (Wing + Bull plaza already good — add hill crowds) |
| **hungaroring** | 0.12–0.30 (T5 through the T6/T7 chicane) has no stand of any kind; the 2025 rebuild's 40 garages read as 9 bays; the two new pedestrian tunnels under the straight are absent; three separate hacks skip props at frac≈0.432 to dodge a terrain intrusion | 2025-26 pit/paddock rebuild as one atomic hero |
| **albert_park** | the lakeside "boathouses" are three-storey glass blocks instead of single-storey weatherboard sheds; no kerbs at the fast sweeps (0.18–0.26) or lakeside rights (0.53–0.60); the southern infield is unbroken forest where the real Albert Park golf course sits; 21 stands share one colour | Lakeside Stadium |
| **shanghai** | 0.58–0.78 is the emptiest fifth of the lap — fence, 3 billboards and 2 marshal posts; six near-identical stands each at 0.42–0.52 and 0.75–0.87 varying only ±0.02 RGB; the lotus-petal sail roof appears at 2 of many stand clusters; the Pudong skyline is a deliberate fiction (the circuit is in Anting, 40 km out, surrounded by auto plants and country park) | moon-gate bridge on the Yu Garden boardwalk; sail ring wrapping the whole T1 snail |
| **qatar** | `bankedKerbStrip` is imported and never called despite `bankZones` already defining all 7 apexes — the brief's "bold red-white sawtooth kerbs at every apex" is unmet; pit slab modelled at 212 m vs. the real 402 m (the world's longest); Katara Towers and Lusail Stadium absent from an anonymous random-box skyline; 0.30–0.36 bare | Katara Towers + Lusail Stadium bowl; full-length pit slab |
| **madrid** | **no `grandstand()` call anywhere in the file** although the brief's first landmark is the main grandstand; El Búnker retaining wall spans 0.43–0.54 where the real climb is 0.35–0.55, and has no slot banding; Cuatro Torres visible for 3.6% of the lap on one side; urban seams at 0.27–0.30 and 0.65–0.68; Barajas airport — the venue's single most distinctive fact — is unmodelled | Barajas control tower + airliner; La Monumental brick cupola; a real dark tunnel portal |

---

## 4. Suggested execution order

1. **Engine pass** — build Tier 1 shared models, extend `grandstand` to
   `grandstandEx`, add the roof-style options, and gate the generic 7-box
   pit/grandstand fallback so a circuit that builds its own opts out.
2. **Palette pass** — a shared `GRANDSTAND_LIVERIES` table so stands vary by
   circuit and by named stand without each file hand-rolling RGB triples. This
   is the cheapest large win in the plan and needs no new geometry.
3. **Per-circuit pass** — one agent per circuit, each applying its own accuracy
   fixes and adopting the new shared models, verified with
   `node tools/verify-track.cjs <id>` and `npm run test:scenery`.
4. **Tier 2/3 models** on demand as the circuit agents need them.

### Guardrails for every change

- `node tools/verify-track.cjs <id>` after any scenery edit — a throw strands
  the game on the menu.
- `npm run test:scenery` (`props-over-road`, `terrain-over-road`,
  `f1-track-accuracy`, `scenery-kits`) — the on-track guard audits all 24.
- `npm run test:tooling` covers the frozen api contract and load order.
- Bump `?v=N` in `index.html` **and** `version.json` on any JS change.
- Budgets: hero 50k verts, facility 25k, repeated furniture 10k per sector.
- New composites must guard their **full footprint** with `rejBox(centre,[w,h,d],basis)`,
  never a single `onTrack()` point.
