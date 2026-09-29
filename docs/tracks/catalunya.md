# Circuit de Barcelona-Catalunya — Visual Design Brief

**Setting:** DAY, modern theme (dry Catalan hillside at Montmeló). ~4.657 km, 14 turns (no chicane since 2023), clockwise.

## 1. Setting
Cut into open farmland hillside ~25 km north of Barcelona (Montmeló). Long clean sightlines, enormous run-off, sparse planting, and a low white pit terrace whose horizontal louvred facade reads as Mediterranean from a hundred metres away. The outfield is dry terraced farmland cut into pale rock, not woodland. Far hills close the horizon as **generic hazy ridges** — a named Montseny massif backdrop is **UNCERTAIN** (repo brief vs conflicting notes); do not label it.

## 2. Atmosphere & palette
Hard dry sun, bleached everything. Catalunya has no grey steel and no dark timber — the built world here is white render, sun-baked concrete and pale ochre stone.
- Sky: zenith `[0.20, 0.42, 0.76]`, horizon `[0.80, 0.80, 0.72]`; sun `[1.0, 0.95, 0.78]`
- Fog `[0.76, 0.74, 0.66]`; scrub grass `[0.30, 0.40, 0.19]`; ochre runoff `[0.62, 0.48, 0.32]`
- Umbrella pine `[0.14, 0.31, 0.16]` / `[0.11, 0.25, 0.14]`; dry scrub `[0.33, 0.38, 0.20]`
- Built: white `[0.93, 0.92, 0.88]`, bone `[0.86, 0.84, 0.78]`, ochre stone `[0.76, 0.69, 0.55]`, shade `[0.66, 0.63, 0.58]`
- Gravel `[0.70, 0.62, 0.46]`; kerbs red `[0.80, 0.14, 0.14]` / white `[0.92, 0.92, 0.90]`

## 3. Elevation
A hillside lap: it climbs from Turn 1 to the high ground at Campsa, then falls all the way back.
- s≈0.00–0.06: flat main straight into **Elf** (T1).
- s≈0.18: climb through Renault and Repsol.
- s≈0.44: high ground before **Campsa** — the crest the car goes light over.
- s≈0.62: drop off Campsa toward La Caixa.
- s≈0.86: continued descent to the final complex and the line.

## 4. Landmarks & surroundings by lap position

### Sourced (web-verified)
| s | Side | Distance | Box description | Source |
|------|------|----------|-----------------|--------|
| 0.005 | L (−1) | near | **Tilke main grandstand** (2002), ~9,580 seats, flat/metal canopy over rear tiers; required `catalunya-main-grandstand` | [tilke.de](https://tilke.de/portfolio/circuit-de-barcelona-catalunya/); [racingcircuits.info](https://www.racingcircuits.info/europe/spain/circuit-de-barcelona-catalunya.html); [oversteer48 Main](https://oversteer48.com/main-granstand-circuit-de-catalunya-barcelona/) |
| 0.048 | L (−1) | near | **Grandstand J** (Tribuna J): smaller, **uncovered**, opposite pit exit | [oversteer48 J](https://oversteer48.com/grandstand-j-circuit-de-catalunya-barcelona/) |
| 0.042 | R (+1) | near | **Pit-end scoreboard / scoring pylon** (approx size); required `catalunya-pit-end-scoreboard` | racingcircuits.info; oversteer48 J |
| 0.975–0.07 | L (−1) | far (~42 m) | **Railway** ballast + twin rails parallel to main-stand side (no train, no station at circuit) | racingcircuits.info |
| — | — | — | Europcar / T12 grandstands **removed** Dec 2017 for runoff — do not rebuild | Wikipedia / circuit history |

### Present but repo-brief / approximate (not expanded as “real”)
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.95–1.00 | R | near | Pit terrace: six white bays, louvred brise-soleil (keep; louvre detail not independently re-verified) |
| 0.985 | R | near | Race control tower with senyera-stripe cap (keep; senyera detail repo-brief) |
| 0.065 | R/L | near | Elf (T1): gravel + tyre wall; covered stand outside T1 |
| 0.00–0.10 | R | far | Paddock-club terraces |
| 0.02 | L | near | Tall floodlight masts (~40 m, 3-arm) — height approximate |
| 0.30–0.36 | — | mid | Open crowd terracing + shade sails |
| 0.50 | — | — | Campsa: blind crest, wide ochre run-off |
| 0.685 | R | near | La Caixa hairpin: gravel + yellow tyre wall |
| 0.80 | both | mid | Clipped hedges + columnar cypress |
| 0.95–0.10 | L | near | Sponsor hoarding on main straight |
| — | ring | far | Thin ochre terrace benches + **unnamed** hazy hills (not Montseny) |

## 5. Track features
- Long pit straight (~1,047 m) into heavy braking at Turn 1 — the main overtaking place.
- Turn names in common use: T1 Elf, T3 Renault, T4 Repsol, T5 Seat, T9 Campsa, T10 La Caixa ([Wikipedia](https://en.wikipedia.org/wiki/Circuit_de_Barcelona-Catalunya)).
- Capacity ~140,700 (same).
- Vast ochre asphalt-and-gravel run-off; kerbs low and flat.

## 6. Modelling notes
- Main stand is the hero: LEFT of S/F, opposite pits, raked rows rising away from the track, metal canopy over rear tiers only.
- Grandstand J is uncovered and shorter; do not give it the Main’s roof.
- Scoreboard is a modest totem at pit exit on the pit side — proportions approximate.
- Rail strip stays low and behind the Main; never a train model.
- Keep planting thin and low. Leave the Campsa / La Caixa infield open.
- Do **not** re-add `sceneryStartFrac` (removed 2026-09-22; residual shift is already 0).
