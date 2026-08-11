# Bahrain International Circuit — Visual Design Brief

**Location:** Sakhir, Bahrain · **Setting:** NIGHT race, desert theme · 5.412 km, 15 corners, clockwise.

## 1. Setting
The circuit sits in the open Sakhir desert south of Manama — flat, exposed sand and scrub, no city skyline. The complex is an isolated island of asphalt and concrete ringed by gravel run-offs, with sculpted artificial dunes and sparse desert planting separating the track from the bare sand beyond. The defining built feature is the **Sakhir Tower**, a ~10-storey building wrapped full-height in video LEDs, standing over the Turn 1 braking zone — not the paddock.

**Two research facts that change how the surroundings should be modelled:**

- **The ground is rock, not sand sea.** Tilke chose Sakhir partly because it offered *some* elevation, and levelling it meant blasting ~2,000 tonnes of rock — crushed on site, because moving it would have wrecked the local road network. Sakhir is rocky desert pavement over a limestone shelf. Dressing the lap purely in soft dune mounds gives the horizon no hard edge; low flat-topped **limestone ledges** (bright sunlit cap, darker shadowed face, scree skirt at the foot) are what the real ground does between the dunes. Blown sand around the track is held down with a sprayed **adhesive crust**, so the apron ringing the circuit reads darker and harder than open desert.
- **BIC is a complex, not a circuit.** Six tracks share the site: the Grand Prix layout, the Outer, Endurance and Paddock circuits, the "Oasis" Inner circuit (its own pit lane and paddock, used by the F2/Porsche support fields), a flat oval, and a **1.2 km drag strip**. The drag strip is the one that matters visually — it lies parallel to the pit straight out past the paddock, and from the main straight it is the only built thing on that side. Model it with its twin prepped lanes (rubbered dark toward the start line), guard walls, low bleachers at the *launch* end, a starter/timing box, and the **Christmas tree** light stack — two pre-stage ambers, three staged ambers, green over red, per lane. At night it is unmistakable.

Other named specifics: **Turn 1 is officially the Michael Schumacher corner** (renamed 2014). Capacity ~70,000. Track surface is graywacke shipped from Bayston Hill quarry, Shropshire — the same aggregate as Yas Marina. Tilke placed deliberate emphasis on **local Gulf architecture** in the buildings and grandstands (barjeel wind-towers, arabesque marquees — both already modelled).

## 2. Atmosphere & palette
Black night sky lit by banks of white floodlights; the track reads as bright grey asphalt against warm sand under cool artificial light. Palette suggestions:
- Sky / horizon: deep indigo-black `[0.04, 0.05, 0.10]`
- Sand / desert ground: warm tan `[0.62, 0.50, 0.34]`, dune highlights `[0.74, 0.62, 0.44]`
- Asphalt: `[0.18, 0.18, 0.20]`
- Floodlight pools / lit concrete: `[0.90, 0.90, 0.85]`
- Kerbs: red `[0.85, 0.15, 0.15]` / white `[0.95, 0.95, 0.95]`
Fog: thin warm dust haze low to the ground, mild — preserves long-straight visibility but softens far dunes.

## 3. Elevation
Near-flat overall (only a few metres). Notable: a gentle **downhill braking zone into Turn 8** (~s 0.42) and a short **rise into the Turn 9–10 complex** (~s 0.50). Everything else effectively level.

## 4. Landmarks & surroundings by lap position
| s (0–1) | Side | Dist | Box-model description |
|--------|------|------|------------------------|
| 0.00 | L | close | Pit/control building: long low white box, ~12 m, glass-grey top stripe |
| 0.00 | R | close | Main Grandstand: stepped grey slab, ~20 m, dark seating face |
| 0.05 | L | far | **Sakhir Tower**: ~10-storey shaft over the Turn 1 braking zone, wrapped full-height in bright LED video bands, flat capped roofline (no sail canopy) |
| 0.05 | R | mid | Turn 1 Grandstand: angled stepped box, ~18 m, blue trim |
| 0.18 | R | mid | University Grandstand (triple): three stacked grey slabs, ~16 m |
| 0.20 | both | mid | Floodlight masts: tall dual-arm cool-white poles + lens banks, **~36–42 m** |
| 0.30 | L | far | Sculpted dunes: low rounded tan wedges, 3–6 m |
| 0.42 | R | mid | Turn 8 hairpin grandstand: low grey arc, ~12 m |
| 0.50 | both | far | Open desert sand flats, near-ground tan plane (sparse dry scrub — no oasis planting) |
| 0.62 | L | far | Marshal/timing huts: small white cubes, ~4 m |
| 0.80 | R | mid | Back-straight catch-fence + tall flood ring |
| 0.95 | L | close | Pit entry wall + garage roofline returning to start |
| 0.015 | L | very far (~180 m) | **Drag strip**: twin prepped lanes parallel to the pit straight, darkening toward the start line; guard walls, centre stripe, launch-end bleachers, starter box, and the **Christmas tree** light stack (2 pre-stage + 3 staged ambers, green, red — per lane). Its own 28 m flood masts |
| 0.135 / 0.225 / 0.345 / 0.475 / 0.605 / 0.705 / 0.845 | alternating | far (74–96 m) | **Limestone shelves**: low stepped flat-topped ledges, bright sunlit cap over a darker face, scree skirt at the foot — the rocky pavement the circuit was blasted out of. Sparse, so the dune bands keep the skyline |

## 5. Track features
Near-flat, with modest real camber in the fast sweeps (3–4°: T1, T4, the T5–T7 sweep, T10, the final right). Signature corners: **Turn 1** right-hand hairpin (heavy braking, prime overtake), **Turn 4** right hairpin after the Turn 3 kink/DRS, the flowing **Turns 5-6-7 sweep**, **Turn 8** downhill right hairpin, and the technical double-apex **Turns 9-10**. Wide asphalt with generous gravel/asphalt run-off; bold red-white sawtooth kerbs at every apex and exit.

## 6. Modelling notes
- Light from above: bake bright top faces / floodlit pools so night track reads against black sky.
- **Sakhir Tower** = ~10-storey shaft wrapped full-height in bright LED video bands, flat capped roofline (no sail canopy) — single hero over the Turn 1 braking zone, not the start/finish straight.
- Surround with warm tan sand and rounded dune wedges; keep desert **sparse** (dry scrub/rocks only — no green palm oasis or gateway clutter).
- Repeat tall cool-white floodlight masts (~36–42 m) around the lap for night-race drama.
- Grandstands = stepped cream slabs with darker/blue seating faces; vary height to distinguish main vs minor stands.
- Saturated red/white kerb boxes at apexes give the strongest "this is Bahrain" colour pop against grey asphalt.
