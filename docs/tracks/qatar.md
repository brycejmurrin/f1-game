# Lusail International Circuit — Visual Design Brief

**Location:** Lusail, Qatar (north of Doha) · **Setting:** NIGHT race, desert theme · 5.419 km, 16 corners, clockwise.

## 1. Setting
A fully floodlit circuit on flat, open desert just outside Lusail, north of Doha. The track is ringed by artificial green grass strips (laid to stop blowing sand) then warm sand run-offs — a continuous green→sand sandwich — surrounded by bare flat desert and low dunes. Built features share Tilke architectural language: record-length white pit slab (Guinness **402.1 m** / 50 garages), covered main grandstand (~40,000), **Lusail Hill** GA terraces outside Turn 1, T1 VVIP branch canopy, and white hospitality villas. Tall cool-white Musco floodlight masts ring the lap as the primary night identity. The distant Lusail/Doha skyline sits low on the far horizon (no Aspire Torch / mosque / oasis fantasy props).

## 2. Atmosphere & palette
Black desert night cut by tall banks of pure white floodlights — the brightest, whitest lighting on the calendar. Asphalt reads as cool grey, framed by green artificial-grass verge and warm sand beyond.
- Sky / horizon: deep indigo-black `[0.03, 0.04, 0.09]`
- Sand / desert ground / runoff: warm tan `[0.72, 0.58, 0.38]` (`COL.desertSand`), dune highlights `[0.76, 0.64, 0.46]`
- Asphalt: smooth dark grey `[0.17, 0.17, 0.19]`
- Artificial grass verge: muted green `[0.20, 0.42, 0.22]` (continuous band, then sand apron)
- Floodlight pools / lit white structures: bright `[0.95, 0.95, 0.92]`
- Kerbs: red `[0.85, 0.15, 0.15]` / white `[0.95, 0.95, 0.95]`
- Distant skyline glow: cool teal-white pinpricks `[0.55, 0.70, 0.80]`
Fog: very light, clean dry air — long-straight visibility intact, only the far skyline softened.

## 3. Elevation
Near-flat but not billiard-table: two long, gentle swells (~3.5 m and ~5.5 m, both far under 1 % grade) and a slight late dip. Model as broad cosine bumps, not a dead-level plane. **Do not** encode Lusail Hill as road elevation — it is a prop mound only (`flatTerrain` stays on).

## 4. Landmarks & surroundings by lap position
| s (0–1) | Side | Dist | Box-model description |
|--------|------|------|------------------------|
| 0.00 | L | close | **Pit building**: Guinness 402 m white slab, 50 garage doors, race-control tower at pit-entry end, Paddock Club roof terrace + suite pods |
| 0.955–0.03 | L | mid | **Team hospitality villas**: sixteen white villas in four groups of four behind the pit slab, curved fronts + first-floor LED brand panels (`qatar-hospitality-villas-*`; Tilke 2023) |
| 0.00 | R | close | **Main Grandstand**: long covered raked stand (~40k), white roof (crescent plan is a survey ask — not independently sourced; keep long stand) |
| 0.00 | both | mid | Floodlight ring: tall cool-white dual-arm Musco masts (~46–50 m), densified on S/F; ground washes via `groundPatch` (not engine `pool`) |
| — | both | near | **Green→sand sandwich**: continuous artificial-grass verge, then warm sand runoff bays on the major mid-lap / T2–T3 / late-complex windows |
| 0.05 | L | mid | **T1 VVIP**: white villa + branch/sail canopy (~60 m span) |
| 0.06–0.09 | R | mid–far | **Lusail Hill**: elevated GA grass terraces outside T1 beyond the gravel trap (`qatar-lusail-hill`) |
| 0.06 | R | mid | Turn 1 (North) Grandstand: angled stepped grey box, ~18 m |
| 0.10 | L | far | Sparse palm cluster (culled) |
| 0.18 | R | mid | T2/T3 grandstands: paired low grey slabs, ~14 m |
| 0.28 | L | far | Low sand dunes: rounded tan wedges, 3–6 m (seated on local `terrainYAt`) |
| 0.40 | both | far | Flowing Turns 4–6 sweep flanked by green-grass verge + flat sand |
| 0.80–0.82 | R | far | **Katara Towers** + **Lusail Stadium** on the SSE horizon (~151–165° from lap centre; ~720–740 m game scale) |
| 0.62 | R | mid | Marshal/timing huts: small white cubes, ~4 m, dark-tan service track |
| 0.74 | both | mid | Repeating floodlight masts + catch-fence: dark verticals, white caps |
| 0.86 | L | far | Sparse palm row + sand flats, near-ground tan plane |
| 0.925 | L | mid | Paddock media centre |
| 0.95 | R | close | Turn 16 grandstand + pit entry: grey arc returning onto the main straight |

## 5. Track features
Fast, flowing layout inherited from its MotoGP origins: long medium- and high-speed corners with very few hard stops. Signature beats: **Turn 1** sweeping right (heavy braking off the long straight, prime overtake), the tight **Turn 2** left, the **Turns 4–5–6** high-speed double-apex sweeps that punish front tyres, and a flat-out final sequence onto the 1.07 km straight. Smooth resurfaced asphalt, bold red-white sawtooth kerbs at every apex, green artificial-grass strips, and wide sand/asphalt run-offs.

## 6. Modelling notes
- Light from above: bake bright top faces and white floodlight washes so the track reads as a lit ribbon against pure black sky.
- Hero silhouettes: **402 m pit slab + race control + Paddock Club terrace**, covered **main grandstand**, **Lusail Hill** at T1, **T1 VVIP canopy**, **sixteen Tilke hospitality villas** in groups of four (not mosque/oasis/Aspire).
- Floodlight ring is the defining "Qatar night" motif — densify cool-white masts via `floodMastRing` with `pool:false` + `groundPatch` washes.
- Frame asphalt with a continuous green artificial-grass verge, then warm `COL.desertSand` runoff aprons on the sourced bay windows (a full-lap sand chord at 7 m out flat-coplanars on inside curves — discrete bays), then open desert.
- Sparse palms only; faint low Lusail/Doha skyline on the far horizon.
- Keep corners long and gently curved with continuous red-white kerb boxes to evoke the flowing, motorcycle-style layout.
- Residual `_sceneryShift` ≈ 0.70 from `sceneryStartFrac: 0.8` — probe before touching; prefer leave (Estoril lesson).

## Research pass — verified; deliberate decisions

**Do not add a mosque here.** The villa block explicitly *replaced* an earlier
"mosque / marquees / Aspire" group, recorded in the code as **fantasy
landmarks** — invented Gulf set-dressing that does not correspond to anything
at Lusail. A later research pass reading "Qatar → mosque, minaret" would
re-introduce exactly what was deliberately removed. **Nothing added.**

### Sources (wave-5 scenery pass)
- Pit 402.1 m / 50 garages / Tilke RC tower: [Tilke](https://tilke.de/portfolio/lusail-race-track-qatar/), [Visit Qatar](https://visitqatar.com/intl-en/things-to-do/adventure-sports/sports-venues/lusail-international-circuit), [Qatar Tribune Guinness](https://www.qatar-tribune.com/article/86488/front/ashghal-sets-guinness-world-record-for-longest-motorsport-pitlane-building-at-lusail-intl-circuit)
- Lusail Hill GA at T1: [racingcircuits.info](https://www.racingcircuits.info/middle-east/qatar/lusail-international-circuit.html), [oversteer48 review](https://oversteer48.com/lusail-hill-general-admission-qatar-gp/), [lcsc.qa](https://www.lcsc.qa/ticket/general-admission-lusail-hill-3-day)
- Main stand ~40k / capacity 52k: racingcircuits.info, [PlanetF1](https://www.planetf1.com/news/first-look-revamped-lusail-international-circuit-qatar)
- Musco lighting: [Wikipedia](https://en.wikipedia.org/wiki/Lusail_International_Circuit), [oversteer48 layout](https://oversteer48.com/lusail-international-circuit-layout/)
- Flat ~4.2 m elevation: oversteer48 layout (matches `flatTerrain`)

### Sources (wave-7 hospitality + sand sandwich)
- Sixteen team hospitality villas in groups of four, curved fronts + LED façade screens: [Tilke](https://tilke.de/portfolio/lusail-race-track-qatar/)
- Artificial grass then sand runoff (green→sand sandwich): [Wikipedia](https://en.wikipedia.org/wiki/Lusail_International_Circuit), [F1 destination guide](https://www.formula1.com/en/latest/article/destination-guide-what-fans-can-eat-see-and-do-when-they-visit-qatar-for.6w898BzkTVMpvoYbQ9BHqJ)

### Geography (horizon — 2026-10 survey pass)
Coordinates from [Wikipedia Lusail International Circuit](https://en.wikipedia.org/wiki/Lusail_International_Circuit) (25.49000°N, 51.45417°E), [Aspire Tower](https://en.wikipedia.org/wiki/Aspire_Tower) (25.262472°N, 51.444833°E), [Katara Towers](https://en.wikipedia.org/wiki/Katara_Towers) (~25.36°N, 51.53°E), [Lusail Stadium](https://en.wikipedia.org/wiki/Lusail_Iconic_Stadium) (~25.42°N, 51.49°E). Great-circle from the circuit:

| Landmark | Distance | Bearing (N clockwise) | In-game |
|----------|----------|------------------------|---------|
| Katara Towers | ~16 km | ~153° | `qatar-katara-towers` @ s≈0.82, right, 720 m |
| Lusail Stadium | ~8.5 km | ~155° | `qatar-lusail-stadium` @ s≈0.80, right, 740 m |
| Aspire Tower (Doha) | ~25 km | ~182° | **Not modelled** — beyond plausible desert horizon; landmarks list omits by design |

### Uncertain (not asserted as fact)
- Crescent main-stand plan — survey ask only; modelled as a long covered stand.
- Geographic south for race-control end — Tilke says southern end; we placed RC at the pit-entry / T16 end of the slab.
