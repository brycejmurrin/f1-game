# Hungaroring — Visual Design Brief

**Mode:** DAY · **Theme:** GREEN (hilly amphitheatre) · 4.381 km, 14 turns, run clockwise.

## 1. Setting
A tight, twisty permanent circuit carved into a natural valley basin in the dusty hills outside Budapest. The track snakes along the valley floor and up its grassy slopes, with spectator hills forming a continuous natural amphitheatre. "Monaco without the walls" — slow, technical, hemmed in by green banking rather than barriers. Open sky, low tree lines, sun-baked grass.

## 2. Atmosphere & palette
Hot, hazy summer afternoon. Pale washed-out blue sky, strong overhead sun, dry heat shimmer. Grass hills are dry straw-olive, not lush lawn — `ATM.dustyBowl`: grass `[0.42, 0.40, 0.22]`, runoff `[0.58, 0.50, 0.34]`, fog `[0.72, 0.68, 0.55]`. Amphitheatre banking stays slightly greener G-dominant (`[0.48, 0.54, 0.28]`) so mounds still read as rounded hills. Tarmac dark; kerb red/white and white walls pop against straw.

## 3. Elevation
Real Hungaroring basin from the SRTM bake in `js/track/circuit-elevations.js`
(~30 m peak-to-trough). Continuous valley bowl — not three isolated cosine
bumps. Start/finish sits high; the lap plunges into the T1 / T2–4 basin, then
climbs through the middle sector before rolling home.

## 4. Landmarks & surroundings by lap position

| s | Side | Distance | Box-model description |
|------|------|----------|------------------------|
| 0.00 | L | near | 2024–25 pit / paddock building: five storeys, parallel white slab with cantilever terrace lips, bioclimatic pergola, rooftop terrace (DVM / IADA / Motorsport.com). Authored length ~128 m (under sourced >340 m) to stay inside the props-tris ratchet; still clearly longer than the old ~80 m slab |
| 0.00 | R | near | Main grandstand opposite the pits: covered, ~10k seats, deep perpendicular terrace stack + dark roof (IADA); size approximate |
| — | — | — | Dynamics 21 m sculpture + separate entrance office: not modelled (appearance/GPS UNSOURCED for a faithful placement) |
| 0.02 / 0.985 | both | near | Two tunnel stairheads between paddock and main tribune (Motorsport.com) |
| 0.02 | L | near | Pit wall + garage row: thin white box strip with red kerb trim |
| 0.07 | R | mid | T1 / Pit Exit cluster — covered cantilever stand on the outside braking zone (oversteer48 Pit Exit 1/2 + T1; Pit Exit 2 not a separate mass — vertex budget) |
| 0.090–0.098 | R | near | Pit Exit 1 uncovered bleacher (oversteer48: no roof), positive rake |
| 0.08 | R | far | Dry-grass colour patch (40 x 32 m, 0.14 m skin) on the valley floor below T1 banking; no infield water |
| 0.12 | L | mid | Grass amphitheatre hill, sun-bleached green, dotted dark tree-cube clumps |
| 0.18 | R | mid | Low grandstand bleacher: pale tiered box facing the slow complex |
| 0.30 | L | far | Tree line mass: cluster of dark green cubes along ridge |
| 0.40 | R | mid | Mid-sector grass banking, spectator hill with sparse stand boxes |
| 0.55 | L | mid | Twisty-sector grandstand: small stepped seating wedge |
| 0.62 | R | far | Crest tree clumps + distant haze-tinted hill boxes |
| 0.75 | L | mid | Open grass run-off bank, dry yellow-green slope |
| 0.90 | R | mid | Approach grandstand: tiered box leading back to the line |

**Pit side note:** `pit.side` stays `-1` (paddock left of the main straight). oversteer48 places the 2025 main grandstand on the outside-left opposite the pit garages (implying pit on the right). That conflicts with the def; flipping pit side is a separate PR (TrackPit / foundation blast radius). This pass keeps the existing left-pit / right-tribune framing.

Sources: [Wikipedia](https://en.wikipedia.org/wiki/Hungaroring), [DVM Group](https://dvmgroup.com/en/references/projects/hungaroring), [IADA 2026](https://ad-c.org/winner/hungaroring-gold-winner-mixed-use-development-design-iada-2026/), [Motorsport.com](https://www.motorsport.com/f1/news/huge-renovation-work-almost-complete-at-hungaroring-ahead-of-f1-hungarian-gp/10734732/), [oversteer48 Pit Exit 1](https://oversteer48.com/hungaroring-pit-exit-1-grandstand/), [TrackTitan](https://www.tracktitan.io/post/hungaroring-track-guide), [F1 Technical](https://www.f1technical.net/news/25005), [Driver61](https://driver61.com/circuit-guide/hungaroring/)

## 5. Track features
Famously twisty and slow with very few overtaking spots — pole and clean air dominate. The downhill heavy-braking Turn 1 right-hander is the prime passing zone. A tight low-speed Turn 2–4 complex, then a relentless flowing middle sector of medium corners with no real straights. Aggressive red/white kerbs at apexes and exits; generous grass/asphalt run-off (no walls) ringed by green banking.

## 6. Modelling notes
- Sell the AMPHITHEATRE: line nearly the whole lap with stepped green banking boxes so the track sits in a bowl of grass.
- Use dry yellow-green grass, not vivid lawn — it reads as hot Hungarian summer.
- Make Turn 1 dramatic with a clear DOWN drop, tall banking, and dry grass in the basin floor.
- Cluster dark-green tree cubes along ridge lines for a low forested horizon.
- Anchor s=0 with the long modern pit slab (L) facing the deep covered grandstand (R).
- Keep palette warm and slightly hazy; fade far hills toward the fog tint for depth.
- Frame debt: `sceneryStartFrac` 0.9825 leaves `_sceneryShift` ≈ 0.90 — leave it alone until a dedicated frame commit (Estoril lesson).

## Research pass — the Pannonian plain

The Hungaroring sits in the **Valley of the Three Springs** at Mogyoród, and
the bowl (and the dust it causes) were already modelled. The **planting** was
not: the outfield used the generic broadleaf scatter, which could be any
European circuit. Two species make this landscape unmistakable and neither was
present.

- **Lombardy poplar, in dead-straight windbreak rows** along field edges and
  farm tracks. This is the defining line of the Hungarian landscape and the
  silhouette is extreme — ~20 m tall, ~2 m wide, a green exclamation mark.
  **The row is the read**: one poplar is nothing, twelve in a line is Hungary.
  Five rows, gap 58–74, spaced in metres along the arc. Crown width is what
  makes or breaks a poplar, so the stacked cones stay barely wider than the
  trunk.
- **Akác** (*Robinia pseudoacacia*, black locust) — roughly a fifth of all
  Hungarian forest. Scattered, not rowed, and deliberately **airy**: a bare
  trunk forking low, carrying two or three *offset* crown lobes with sky
  between them. Nothing like the solid cone the generic scatter plants.

## 2025 circuit-change detail

The [FIA's 30 July 2025 preview](https://www.fia.com/news/f1-2025-hungarian-grand-prix-preview)
and [Doc 10, Race Director's Event Notes V2, dated 1 August 2025 (printed p7; PDF p8)](https://www.fia.com/system/files/decision-document/2025_hungarian_grand_prix_-_race_directors_event_notes_v2.pdf)
state that the grass strip at Turn 5 exit was changed to gravel. Turn 5 is
the long **right-hand** bend after the left-hand Turn 4, so the outside exit
margin is **racing-left**. Matching the FIA map to the built centreline places
T4 near racing fraction `0.3602`, T5 near `0.4225`, and this local exit detail
near `0.447`. The turn list now follows all 14 physical corners: repeated
curvature peaks within T2/T14 are not additional corners, and both T6/T7
chicane corners and the distinct left-hand T10 are retained.

The dependent aero table now names T1/T2, T3/T4, T11/T12 and T14/T1.
These references preserve the existing four gameplay intervals exactly;
they do not claim surveyed 2025 DRS activation boundaries.

The scenery uses six short terrain-draped patches with the existing rock
material to show a narrow gravel margin. Its roughly **48 m length, 3 m width,
and 2.2 m road-edge gap are bounded visual estimates**, not surveyed 2025
dimensions. This is a bounded gravel-band representation over the generic
beige rock verge; it leaves the existing narrow grass/kerb separation and
surrounding terrain intact. It does not claim to reproduce the exact 2025
grass-strip footprint. The existing scenery origin is preserved; this racing
anchor is converted to authored coordinates once before the wrapped helper.

The [21 July 2024 F1i report and FIA photograph](https://f1i.com/news/514518-fia-replaces-turn-5-grass-strip-with-gravel-after-tsunoda-crash.html)
show a small gravel rectangle between kerb-side concrete and an outer drainage
channel, with asphalt beyond. Its quoted "last four metres" describes the
2024 overnight repair; it does not establish the 2025 strip's width or extent.
A dated 2025 photograph showing both endpoints is still needed for exact sizing.
The [FIA's Doc 4 map annexes, issued 31 July 2025](https://www.fia.com/system/files/decision-document/2025_hungarian_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exits_map_quarantine_zone_and_red_zones.pdf)
confirm the physical corner sequence but do not specify the gravel dimensions.

The 2025 FIA preview also specifies concrete blocks with fencing on the
left-hand side of Turn 14 until a bridge. The final right-hand corner is
physically identified near racing `0.865–0.901`, but the relevant bridge and
barrier endpoints have not been located. No bridge or guessed barrier stretch
is added. The modern pit building, main tribune, pit side, road width,
elevation profile and existing Pannonian planting remain the reference for
this bounded surface-detail pass.

The inspected Doc 4 circuit, emergency-exit, ERS-area and red-zone plans do
not identify a labelled bridge endpoint suitable for this barrier placement.
Avoid substituting the old main-straight bridge: [Károly Méhes's report dated
19 June 2025](https://gpdestinations.com/exploring-the-new-look-hungaroring/)
states that the old Marlboro bridge had gone and pedestrian traffic would use
a new tunnel under the main straight. That secondary report describes the
renovation; it does not locate the separate bridge mentioned in the FIA's
Turn 14 change note.

## Frame audit (2026-10-10, review F4 / F7)

`sceneryStartFrac` 0.9825 puts this file's authored `0.00` at racing 0.903, 424 m before the real line, so a raw
authored fraction is 0.0971 of a lap early. Only the start gantry had been re-keyed (through `sl()`), which left the
sections table above in the authored frame. Now:

| piece | before (racing) | after (racing) |
|-------|-----------------|----------------|
| pit building (gap 24 -> 44, behind the engine garages), paddock patch, broadcast compound, hospitality / service kits, pit wall, pit-side tunnel mouth | 0.903 (424 m before the line) | 0.000 (pit-side mouth: 0.965) |
| main tribune, tribune-side tunnel mouth | 0.903 | 0.000 |
| "Turn 5 Mogyoród" stand (+ accent, lit strip, hill shoulder) | 0.058 (1591 m from T5 apex 0.4225) | 0.434 (52 m past the apex; the exact apex buries 13 crowd bodies in the slope) |
| "T6/7 Driving Centre" stand | 0.158 (1459 m from T6 0.4922) | 0.492 (T6 apex) |
| Club stand, "final corner" | 0.803 (344 m from T14 0.8818) | 0.882 (T14 apex) |
| countryside village + church | infield, 16-47 m from the road at 0.32-0.33 (nave, roof, 2 cottages rejected) | outside (side -1), >= 236 m from any tarmac; church is one `modelGroup` |

Corner stands are keyed with `au(def.turns[i])`, the authored fraction that lands on a racing-frame apex. The engine
pit complex owns racing 0.93-0.04 (`pit.keep` reaches 30 m beyond the edge), so the hand-built pit block must clear that
footprint outright (gap 44 for its 22 m bounds) or it is superseded whole. Not re-keyed: the T1 / Pit Exit cluster
(authored 0.07-0.12, racing 0.97-0.02), whose `-1` stands at authored 0.10 / 0.12 sit on the engine pit and are dropped.
