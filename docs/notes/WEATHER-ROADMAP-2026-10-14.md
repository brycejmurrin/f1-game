# Weather roadmap — research and plan (2026-10-14)

Two web-research passes (real F1 weather; how racing games do weather and how
they render it), mapped onto the current model. Every figure carries its
source. **snippet** marks a claim read from a search summary, not the full page.

## Where the game is (after #1471, #1482, #1510)

- Five types: `dry`, `wet`, `rain`, `overcast`, `fog`. They are chosen in race
  settings (`js/race/race-settings.js` `RS_WEATHER`), and MIXED walks an arc
  between them (`js/race/weather-arc.js`).
- Road wetness is ONE scalar for the whole lap. It lags the arc: τ 8 s
  wetting, 36 s drying. The stage comes from wetness at TyreModel.treadFor's
  0.25 / 0.72 thresholds.
- Grip comes from `WET_GRIP` (`js/physics/consts.js`): inters own the damp,
  full wets own the rain.
- Sky, fog and light read the enum (`js/lighting/atmosphere.js`). The road
  look, FX and grip read wetness.
- Friend rooms validate weather against the five names (`js/net/lobby.js:739`).
  A new type needs that one-line change, or it rejects the whole settings
  packet.

## Real-world anchors

- **Rain intensity:** light ≤ 2.5 mm/h, moderate 2.6–7.6 mm/h, heavy > 7.6 mm/h
  ([AMS glossary](https://glossary.ametsoc.org/wiki/Rain)). Spa, July 2025:
  9–11 mm over three hours with standing water
  ([RacingNews365](https://racingnews365.com/updated-2026-f1-belgian-grand-prix-weather-forecast-as-rain-suddenly-threatens-spa)).
- **Visibility, not grip, is F1's wet problem.** Most spray comes from the
  floor and diffuser; wheel guards did nothing for a following driver
  ([The Race](https://www.the-race.com/formula-1/why-f1-cant-solve-its-wet-weather-problem/)).
  The spray-guard project was dropped after the May 2024 test
  ([The Race](https://the-race.com/formula-1/f1-spray-guard-fix-delayed-or-abandoned)).
- **Procedure:** Belgian GP 2025 ran a formation lap, then a red flag for
  visibility, then a restart behind the safety car, over an hour late
  ([The Race](https://www.the-race.com/formula-1/belgian-grand-prix-delayed-red-flag-rain-visibility.md)).
  Race control may start behind the SC in heavy rain (snippet).
- **Crossover:** slick → inter at ~110–112 % of the dry lap time, according to
  [Pirelli](https://www.pirelli.com/global/en-ww/race/when-it-s-time-to-change-from-slick-to-wet-tyres-in-formula-1).
  Full wets sit closer to 118 % (Isola, snippet). Water moved at 300 km/h: an
  inter clears ~35–40 L/s, a full wet ~2× that (Pirelli; another source gives
  30 / 85 L/s).
- **Aquaplaning:** Horne's NASA estimate is Vc ≈ 9·√psi kt, about 83–99 km/h at
  25–35 psi ([NASA NTRS](https://ntrs.nasa.gov/api/citations/19690011094/downloads/19690011094.pdf)).
  It ignores water depth for treaded tyres.
- **Light rain:** the rubbered racing line is the slipperiest part of the
  track ([The Race](https://www.the-race.com/formula-1/leftfield-fix-idea-for-f1-rain-racing-getting-traction.md)).
  Drying is patchy: Red Bull Ring FP2 2016 was drying from T2 and still very
  wet at T9 (formula1.com, snippet). No sourced lap or minute count exists for
  how long a track takes to dry, so do not invent one.
- **Standing-water traps:** Interlagos T3 kerb hollows (2025 sprint crashes,
  then a drainage cut; snippet), Spa Kemmel grooves, Suzuka downhill rivers
  (low authority).
- **Microclimate:** Spa can be wet in one sector and dry in another
  ([GrandPrix247](https://www.grandprix247.com/formula-1-news/rain-over-spa-francochamps-could-turn-the-belgian-grand-prix-into-a-lottery-f1-preview)).
- **Forecasting:** Ubimet gives teams timed, located statements, accurate to
  the minute, and a single cell can miss by ~500 m
  ([formula1.com](https://www.formula1.com/en/latest/features/2016/9/how-weather-forecasting-works-in-f1.html)).
- **Heat and cold:** Bahrain track 38 °C versus < 19 °C in testing, with
  thermal degradation; Singapore ~55 °C track; Las Vegas 12–23 °C air, with
  cold graining
  ([Motor Sport](https://motorsportmagazine.com/articles/single-seaters/f1/why-f1-cars-struggle-to-race-in-the-cold-las-vegas-grand-prix-challenge)).
- **Wind and dust:** Monza's straight is north–south, so a headwind helps
  braking into Della Roggia. Silverstone gusts can put a car sideways. Bahrain
  sand turns the track green and cuts visibility (gusts ~50 km/h).
- **Fog:** Eifel 2020 Friday was cancelled because the medical helicopter
  could not fly
  ([formula1.com](https://www.formula1.com/en/latest/article/fia-reveal-back-up-plan-for-medical-helicopter-in-case-fog-returns-at-the.7Ju67iUocCjChkppIE7ZZg)).

## What games do (and what players say)

- **iRacing Tempest (2024):** aero lifts water and tyres throw it; rough
  texture fills first; the polished line slicks sooner; forecasts can be wrong,
  with uncertainty growing with race length
  ([iRacing](https://www.iracing.com/?p=272386)).
- **GT7:** live rain radar on the HUD, puddles at fixed real locations, the
  line dries first
  ([Traxion](https://traxion.gg/gran-turismo-7-features-detailed-dynamic-weather-but-not-at-every-track/)).
- **Forza Motorsport 7:** puddles grow lap to lap, storms with lightning,
  aquaplaning
  ([GTPlanet](https://gtplanet.net/forza-motorsport-7s-dynamic-weather-system-offers-visceral-experience)).
  Players complain that FM 2023 lost both (forum, snippet).
- **F1 24/25:** players criticise blanket, uniform rain over 2–3 laps, and
  reviews call the spray "particularly average"
  ([Traxion](https://traxion.gg/time-to-box-box-box-f1-24-review/)).
- **F1 2010 "Active Track":** per-section water, rubber and marbles; cars push
  water off the line
  ([Gaming Nexus](https://gamingnexus.com/News/17757/F1-2010-Dev-diary-3-Weather)).
- **Cheap rendering:** one wetness scalar on roughness, albedo and Fresnel; a
  baked low-res puddle mask; spray capped to the nearest cars; visor droplets
  from a half-res copy plus sprites; a lightning flash plus a sky crossfade;
  layered rain loops and slip-driven tyre hiss. SSR is not recommended on
  mobile (Unity docs, snippet), and the game already sheds it at the phone
  tier.

## Constraint that shapes the plan

AGENTS.md §Physics says nothing derived from the racing line may affect the
player with assists off. A "line dries first" grip map is therefore AI-only,
assist-gated or visual-only, unless a surface-based model (rubber laid by
cars, not the line) is designed and placed in the right column of the
docs/PHYSICS.md table.

## Plan

| Phase | Item | Size | Notes |
|---|---|---|---|
| 1 | **STORM** type: heavy rain, lightning, thunder, visibility; SC start / SC when an arc reaches storm | M | Friend rooms need the `lobby.js` one-liner (owned elsewhere); hidden in rooms until then |
| 1 | **Forecast** with deterministic uncertainty plus engineer radio calls | M | Ubimet-style timed calls; no HUD widget yet (HUD core is contended) |
| 2 | Rain that hits part of the lap (sector wetness) | L | A surface column in PHYSICS.md; tyre dilemmas |
| 2 | Aquaplaning in standing water above a speed threshold | M | tyre-model.js owner |
| 2 | Wind gusts and head/tail wind | M | top speed and braking; per-track direction |
| 3 | Puddle hotspots (baked mask), spray quality, visor droplets | M–L | three backends; phone variants |
| 3 | Heat / cold track temperature and graining | M | tyre-model.js owner |
| 3 | Radar / forecast HUD widget | S | once the HUD lane frees up |
