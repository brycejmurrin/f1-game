# Circuito de Jerez — Visual Design Brief

**Setting:** DAY, desert theme (dry Andalusian scrub). ~4.43 km, 13 turns, clockwise.

## 1. Setting

Dry, pale, open country outside Jerez de la Frontera. Low scrub and bleached earth, a big permanent grandstand bank on the inside of the stadium section, and hard Andalusian sun. Hosted five Spanish Grands Prix and two European ones — and the 1986 finish Senna took from Mansell by 0.014 s, still the second-closest in the sport.

Opened 8 Dec 1985; capacity up to 125,000; renamed Circuito de Jerez – Ángel Nieto in 2018. Length 4.423 km (4.428 km with the Senna chicane for cars). — [Wikipedia](https://en.wikipedia.org/wiki/Circuito_de_Jerez), [circuitodejerez.com](https://circuitodejerez.com/en/circuito/).

## 2. Atmosphere & palette

Bleached. Earth is pale ochre, vegetation olive-grey, and the light is hard and high-contrast with short shadows. Nothing here is lush.

## 3. Elevation

Gentle, with a noticeable climb to the Dry Sack hairpin (Curva Dani Pedrosa since 2019) and a fall through the final sector.

## 4. Landmarks & surroundings by lap position

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | -1 | 20 | Main start/finish terracing. A long `grandstandEx` run facing the pit lane, pale concrete, roofless for most of its length with one covered centre bay. `sponsorHoarding` along the full base, `guardrail` at the track edge, two `cameraTower` masts at the ends. |
| 0.005 | +1 | 22 | **El Ovni** — required `modelGroup("jerez-ovni")`. 2002 VIP viewing platform over the finish line (530 m² / ~120 guests), nicknamed UFO. — [circuitodejerez.com](https://circuitodejerez.com/en/circuito/), [Box Repsol](https://www.boxrepsol.com/en/motogp-en/jerez-much-more-than-the-motorcycle-capital-of-the-world/). |
| 0.018 | +1 | 30 | **Control tower + Tío Pepe** — required `modelGroup("jerez-control-tower")`. ~30 m tower crowned by an ~8 m bottle-figure mascot. Exact bottle art UNCERTAIN (silhouette only). — [Box Repsol](https://www.boxrepsol.com/en/motogp-en/jerez-much-more-than-the-motorcycle-capital-of-the-world/). |
| 0.010 | +1 | 8 | Pit and paddock block, infield side. A low flat-roofed `building` row (garages) with the taller control tower `building` above the grid, `motorhome` rows parked behind it, `guardrail` on the pit wall line. This is the only dense built mass on the circuit. |
| 0.045 | -1 | 32 | Braking zone for Expo '92. Open `terrace` steps cut into the natural rise, `spectatorHill` continuing behind them, one `cameraTower`. Ground here is bare pale ochre — use `groundPatch`, not grass. |
| 0.0663 | +1 | 14 | Turn 1, Curva Expo '92 — infield apex. `tyreWall` against the barrier, `marshalPost`, a single `billboard` angled at the braking zone. Nothing tall: the horizon must stay visible over the infield. |
| 0.110 | -1 | 45 | Open country between T1 and Michelin. Scattered `bush` and a loose scatter of olive-grey `tree`, never a continuous rank, on flat ochre `groundPatch`. Empty to the horizon. |
| 0.130 | -1 | 28 | Curva Michelin outside. Permanent stand complex toward Sito Pons: `grandstandEx` with `terrace` filling between bays, `sponsorHoarding` at the base, `guardrail` and `tyreWall` at the edge. |
| 0.3043 | -1 | 38 | Turn 4, start of the climb. Natural `spectatorHill` banking with no built seating — earth and scrub, a thin `guardrail` line, one `marshalPost`. |
| 0.3563 | +1 | 18 | Curva Sito Pons, infield. `broadcastCompound` with a `cameraTower` beside it, serving the whole upper loop. `tyreWall` on the apex side. |
| 0.3842 | -1 | 22 | Curva Dry Sack / **Dani Pedrosa** (renamed 2019) — highest point of the lap. Stepped `terrace` plus a `grandstandEx` block, deep `tyreWall`, `marshalPost`, `billboard`, plus required `modelGroup("jerez-dani-pedrosa")` naming marker. Signage art UNCERTAIN. — [Wikipedia](https://en.wikipedia.org/wiki/Circuito_de_Jerez). |
| 0.460 | +1 | 50 | Descent away from Dry Sack. Bare `ridge` running parallel to the track with sparse `bush`; the fall of the land is the landmark, not any prop. |
| 0.5228 | -1 | 28 | Turn 7 left. `guardrail` and `tyreWall`, a low `spectatorHill` with standing room only, one `marshalPost`. |
| 0.6300 | -1 | 65 | Far outfield, the quietest stretch. Widely spaced olive `tree` in field rows and a single white farm `building` set well back. Horizon unbroken above it. |
| 0.7123 | -1 | 26 | Curva Ángel Nieto. `terrace` returns here as the stadium section opens up, with `sponsorHoarding` and a `cameraTower`; `guardrail` and `tyreWall` at the edge. |
| 0.8417 | -1 | 42 | Peluqui, into the stadium bowl. Continuous permanent `terrace` wrapping the outside, `grandstandEx` on the highest bank, `billboard` above the run-off. |
| 0.9177 | -1 | 20 | Curva Ferrari. Terracing unbroken from Peluqui — `terrace` and `grandstandEx`, `sponsorHoarding` at the base, `tyreWall` and `marshalPost` at the edge. |
| 0.9517 | +1 | 12 | Final right onto the pit straight / **Curva Jorge Lorenzo** (renamed 2013). Pit exit `guardrail`, paddock mass, plus required `modelGroup("jerez-lorenzo-corner")` naming marker. Signage art UNCERTAIN. — [Wikipedia](https://en.wikipedia.org/wiki/Circuito_de_Jerez), [RacingCircuits.info](https://www.racingcircuits.info/europe/spain/jerez.html). |

## 5. Track features

- Dry Sack / Dani Pedrosa, the slow right-hander at the top of the climb.
- A long, fast, open final sector into Curva Lorenzo.
- Big permanent terracing around the stadium section.
- El Ovni VIP deck over the start/finish (2002).

## 6. Modelling notes

- Vegetation is sparse: olive, low scrub, the occasional palm. Never a tree line.
- Pale concrete terracing is the built landmark alongside El Ovni and the control tower.
- Keep the outfield open and empty — the horizon should be visible almost everywhere.
- Frame debt: `startFrac` 0.122 with `sceneryStartFrac` 0 — pit/finish props key through `sl()`; do not move frame keys. Probe before touching authored `K()` on non-sl blocks.

## 7. UNCERTAIN (do not build as fact)

- Exact Tío Pepe bottle/face art and copyrighted brand detailing.
- Exact corner-board graphics for Pedrosa / Lorenzo markers.
- Mayor-podium incident (1997) — history only; do not model.
- Residual `_sceneryShift` ≈ 0.87 — frame debt; leave `startFrac` / `sceneryStartFrac` alone.
