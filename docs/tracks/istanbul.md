# Intercity Istanbul Park — Visual Design Brief

**Setting:** DAY, green theme (dry Thracian hillside east of Istanbul). ~5.34 km, 14 turns, **anticlockwise**.

## 1. Setting
Built across a shallow valley in dry hill country on the Asian side of Istanbul (Tuzla), opened 2005. One of only a handful of anticlockwise circuits, and the only one whose defining feature is a single corner: **Turn 8**, a long, wide, banked left with four apexes, taken flat, wrapped in a natural amphitheatre of crowd terracing on the outside and completely open on the inside. The hillside itself is parched — sparse pine and dry brush over pale limestone, nothing like a forest — and the city's apartment blocks are just visible creeping toward the park on one horizon.

F1 returns 2027–2031 (five-year deal). Organisers plan a doubled paddock, more grandstand coverage, and Turn 8 hospitality; the **track layout stays the 2011 configuration** (no public renovated geometry yet). Sources: [The Race](https://www.the-race.com/formula-1/inside-turkeys-massive-f1-return-revamp/), [Formula1.com](https://www.formula1.com/en/latest/article/formula-1-returns-to-turkeys-istanbul-park-from-2027-as-part-of-new-five-year-agreement.1I7OZGeDPoC6Vysv3iqadY).

## 2. Atmosphere & palette
Hazy warm sun, parched grass, pale limestone dust. Dry rather than lush; the green in this theme is scrub green, not canopy green.
- Sky: zenith `[0.24, 0.44, 0.74]`, horizon `[0.80, 0.78, 0.70]`; sun `[1.0, 0.94, 0.76]`
- Fog `[0.76, 0.74, 0.66]`; grass `[0.31, 0.39, 0.20]`; limestone run-off `[0.64, 0.58, 0.44]`
- Pine `[0.13, 0.30, 0.15]` / `[0.10, 0.24, 0.13]`; dry scrub `[0.34, 0.38, 0.21]` / `[0.28, 0.32, 0.18]`
- Gravel `[0.70, 0.63, 0.48]`; Turkish red `[0.86, 0.16, 0.14]` on flags and boards
- Kerbs red `[0.80, 0.14, 0.14]` / white `[0.92, 0.92, 0.90]`

## 3. Elevation
The circuit drops and climbs constantly — this is a valley lap, and the Turn 1 plunge is the introduction.
- s≈0.055: the **Turn 1 plunge** — a 12 m drop into a blind downhill left.
- s≈0.28: valley floor, ~7 m lower still, on the approach to Turn 8.
- s≈0.48: **8 m climb** out of Turn 8.
- s≈0.72: long 9 m rise back toward the pits.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.97 | R | far | **Paddock block**: long low pale-stone building with a distinctive stepped roofline (three offset caps). Modest mass only — see UNCERTAIN below for VIP towers. |
| 0.965–0.99 | L | near | Rank of tall red **flagpoles** down the pit straight (decorative trackside poles; not a documented ceremonial “Turkish flagpole rank”) |
| 0.955 | L | near | Steel grandstand (90 m) closing the straight |
| 0.005 | L | near | **Gold** main grandstand, 150 m, covered (capacity ~25,000 for the main stand — Wikipedia) |
| 0.055 | L | near | **Turn 1** gravel apron (34×48) + red tyre wall — at the bottom of the plunge |
| 0.060 | R | mid | **Silver 1** two-tier stand on the outside of Turn 1 |
| 0.290 | R | mid | **Silver 3** uncovered stand after Turn 6 / before T8 (GP Grand Tours / Biletix seating maps) |
| 0.10–0.20 | both | mid | Sparse pine and dry scrub on open hillside; long views in every direction |
| 0.15 | — | — | Turn 3–4 complex, half-width pinched to 6.4 m |
| 0.34–0.46 | R | near | **TURN 8 AMPHITHEATRE**: eight rows of earth crowd terracing wrapping the outside of the corner |
| 0.36–0.44 | R | mid | **Silver 4** area: three covered stands above the terracing (gap ~54 m) |
| 0.418 | R | mid | **Turn 8 hospitality**: low two-tier club/terrace (`istanbul-turn8-hospitality`) — sourced by The Race 2027 revamp; keep modest |
| 0.40 | R | mid | Enormous Turn 8 gravel run-off (56×140) — the biggest single trap on the lap |
| 0.34–0.46 | L | far | Turn 8 infield: deliberately EMPTY. The open inside is why the corner reads as enormous |
| 0.615 | L | near | **Silver 5/6** area: concrete stand opposite T9–10 gravel + blue tyre wall |
| 0.76 | — | — | Turn 12, gently banked (3.5°) |
| 0.905 | L | near | Turn 13–14 gravel + yellow tyre wall |
| 0.910 | R | mid | **Silver 8** uncovered stand at the final-corner complex (was a hollow shell at s=0.900) |
| 0.990 | R | near | Race-control tower (`istanbul-race-control`) |
| 0.930 | L | mid | Stone portal (`istanbul-stone-portal`) |
| — | ring | far | Dry Kocaeli ridgelines, pale and sparsely wooded; faint pale apartment blocks on one horizon only |

## 5. Track features
- **Turn 8**: 7° of banking held over a 300 m width zone — by far the biggest banking on this circuit and the reason it exists. Exaggerate it; the camera has to read the tilt.
- Anticlockwise: most corners turn left, and the neck loading is part of the circuit's reputation.
- Turn 1 is a blind downhill multi-apex left — the plunge and the corner arrive together.
- Three pinch points (T3–T4, T9–T10, T13–T14); heavy modern kerbs; large limestone-dust run-offs.

## 6. Modelling notes
- Everything is subordinate to Turn 8. Give it the crowd bank, the stand, the run-off, the hospitality terrace and the camera tower, and give the rest of the lap noticeably less.
- Keep the inside of Turn 8 completely clear — no props, no planting, no fence detail. The emptiness is what makes the outside look vast.
- Bank the Turn 8 kerbs and the outer barrier line with the road so the tilt is visible from the cockpit and the chase cam.
- Plant thinly and unevenly: this is a dry hillside with scattered pine, not a plantation. Any continuous treeline is wrong.
- The paddock block's stepped roofline is the only architectural cue worth building — keep everything else here low, pale and plain.
- One horizon gets apartment blocks; the other three stay bare ridge. The asymmetry is what places the circuit next to a city.
- Silver stands other than the Gold main are uncovered (Biletix / GP Destinations).

## UNCERTAIN — do not build as fact
- **Turkish flagpole rank** as a ceremonial / documented landmark — older brief text and a survey claim; web research found no supporting source. Decorative red/white poles along the pit straight stay as scenery colour, not a named required landmark.
- Wikipedia’s claim of two 7-storey VIP towers at each paddock end + 5,000 hospitality seats — contradicted by other synthesis; build at most a modest paddock-club mass (existing stepped blocks) or leave towers out.
- Current (2027-return) renovated paddock / stand geometry is not public; keep the 2011 layout and only add sourced hospitality intent at Turn 8.

## Research pass — wave 6
Verified and modelled: Turn 8 amphitheatre + Silver 4 stands, Turn 8 hospitality terrace, Silver 3 / Silver 8 open stands, race control, stone portal, pit bays, modest paddock blocks. Istanbul Park is inland at Tuzla — the Bosphorus and a dense city skyline do **not** belong here.
