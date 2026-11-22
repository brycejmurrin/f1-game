# Circuit elevation and banking audit

Each of the 52 circuits was investigated in a separate worktree. The table reports the integrated game road in metres, longitudinal grade in percent and bank in degrees. Positive bank raises the right road edge. Grade comes from height change over horizontal distance between successive built nodes. Bank was sampled at the centre and both edges, which captures progressive crossfall.

Operator figures and registered pavement measurements provide the strongest checks. OpenF1 Z records the car positioning feed and can share underlying circuit data across laps. Elevation services sampled along a mapped route describe the terrain. Buildings, embankments, water, bridges, tunnels and coarse raster cells can separate those values from pavement height. A single coordinate gives only a site altitude. Centreline height alone cannot measure banking.

| Circuit | Built relief (m) | Grade, min to max (%) | Bank, min to max (°) | Terrain sample range (m) | Ground gate |
|---|---:|---:|---:|---:|---|
| [Bahrain](#bahrain) | 5.00 | -1.81 to 1.81 | -3.50 to 4.00 | [20.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/bh-2002.geojson) | Pass |
| [Monaco](#monaco) | 41.30 | -7.51 to 9.79 | -3.00 to 3.00 | [59.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/mc-1929.geojson) | Pass |
| [Silverstone](#silverstone) | 11.18 | -2.36 to 2.05 | -4.50 to 4.00 | [12.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/gb-1948.geojson) | Pass |
| [Spa](#spa) | 101.37 | -9.26 to 15.15 | -6.00 to 4.00 | [103.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/be-1925.geojson) | Pass |
| [Monza](#monza) | 12.39 | -2.23 to 1.59 | -6.00 to 0.04 | [24.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/it-1922.geojson) | Pass |
| [Suzuka](#suzuka) | 39.71 | -5.46 to 6.16 | -7.00 to 4.00 | [50.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/jp-1962.geojson) | Pass |
| [Singapore](#singapore) | 5.00 | -3.27 to 3.27 | -3.00 to 3.00 | [22.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/sg-2008.geojson) | Pass |
| [Cota](#cota) | 31.38 | -7.09 to 7.77 | -4.50 to 5.00 | [21.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/us-2012.geojson) | Pass |
| [Interlagos](#interlagos) | 40.37 | -4.22 to 5.75 | -4.00 to 7.00 | [47.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/br-1940.geojson) | Pass |
| [Vegas](#vegas) | 16.26 | -3.47 to 1.65 | -3.00 to 3.00 | [30.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/us-2023.geojson) | Pass |
| [Madrid](#madrid) | 26.00 | -6.73 to 5.44 | -13.50 to 3.00 | [28.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/es-2026.geojson) | Pass |
| [Zandvoort](#zandvoort) | 8.94 | -6.64 to 6.41 | -18.00 to 19.00 | [8.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/nl-1948.geojson) | Pass |
| [Jeddah](#jeddah) | 2.20 | -0.45 to 0.45 | -6.00 to 7.00 | [4.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/sa-2021.geojson) | Pass |
| [Albert Park](#albert-park) | 1.00 | -0.28 to 0.28 | -3.00 to 3.50 | [8.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/au-1953.geojson) | Pass |
| [Shanghai](#shanghai) | 6.50 | -1.70 to 1.70 | -4.00 to 5.00 | [9.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/cn-2004.geojson) | Pass |
| [Miami](#miami) | 3.13 | -4.03 to 5.27 | -3.00 to 3.50 | [12.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/us-2022.geojson) | Pass |
| [Imola](#imola) | 28.00 | -6.60 to 8.18 | -1.50 to 1.50 | [39.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/it-1953.geojson) | Pass |
| [Montreal](#montreal) | 3.20 | -1.15 to 1.15 | -3.00 to 3.00 | [13.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/ca-1978.geojson) | Pass |
| [Redbull](#redbull) | 53.24 | -5.68 to 5.89 | -4.00 to 4.00 | [68.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/at-1969.geojson) | Pass |
| [Hungaroring](#hungaroring) | 30.14 | -4.79 to 3.50 | -3.50 to 6.00 | [41.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/hu-1986.geojson) | Pass |
| [Baku](#baku) | 26.80 | -5.33 to 5.39 | 0.00 to 0.00 | [36.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/az-2016.geojson) | Pass |
| [Mexico](#mexico) | 2.80 | -0.79 to 0.79 | -3.50 to 6.00 | [7.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/mx-1962.geojson) | Pass |
| [Qatar](#qatar) | 6.50 | -1.23 to 1.23 | -4.00 to 4.00 | [5.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/qa-2004.geojson) | Pass |
| [Abudhabi](#abudhabi) | 9.00 | -1.68 to 1.68 | -3.00 to 5.00 | [13.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/ae-2009.geojson) | Pass |
| [Hockenheim](#hockenheim) | 4.30 | -3.23 to 2.23 | -4.00 to 2.50 | [16.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/de-1932.geojson) | Pass |
| [Nurburgring](#nurburgring) | 50.50 | -5.48 to 5.75 | -4.50 to 4.00 | [56.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/de-1927.geojson) | Pass |
| [Catalunya](#catalunya) | 28.90 | -6.15 to 6.57 | -4.50 to 0.00 | [35.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/es-1991.geojson) | Pass |
| [Sepang](#sepang) | 9.50 | -1.87 to 1.87 | -4.00 to 3.00 | [21.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/my-1999.geojson) | Pass |
| [Istanbul](#istanbul) | 21.00 | -6.28 to 6.28 | 0.00 to 7.00 | [34.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/tr-2005.geojson) | Pass |
| [Paul Ricard](#paul-ricard) | 29.82 | -6.56 to 6.73 | -4.00 to 3.00 | [27.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/fr-1969.geojson) | Pass |
| [Portimao](#portimao) | 24.05 | -5.49 to 3.17 | -4.00 to 4.50 | [25.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/pt-2008.geojson) | Pass |
| [Sochi](#sochi) | 1.90 | -0.38 to 0.38 | -5.00 to 0.00 | [7.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/ru-2014.geojson) | Pass |
| [Mugello](#mugello) | 21.00 | -4.62 to 4.62 | -5.00 to 4.50 | [37.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/it-1914.geojson) | Pass |
| [Magny Cours](#magny-cours) | 25.73 | -4.34 to 3.06 | -3.50 to 3.00 | [28.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/fr-1960.geojson) | Pass |
| [Estoril](#estoril) | 15.00 | -3.93 to 3.93 | -5.00 to 3.00 | [34.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/pt-1972.geojson) | Pass |
| [Kyalami](#kyalami) | 43.00 | -7.35 to 7.35 | -4.50 to 4.00 | [61.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/za-1961.geojson) | Pass |
| [Watkins Glen](#watkins-glen) | 31.40 | -5.13 to 3.90 | -4.00 to 4.50 | [40.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/us-1956.geojson) | Pass |
| [Indianapolis](#indianapolis) | 3.30 | -0.94 to 0.94 | -9.20 to 0.00 | [7.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/us-1909.geojson) | Pass |
| [Buenos Aires](#buenos-aires) | 4.20 | -1.02 to 1.02 | -5.00 to 0.00 | [11.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/ar-1952.geojson) | Pass |
| [Jacarepagua](#jacarepagua) | 3.80 | -0.83 to 0.83 | -3.50 to 4.50 | [7.0](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/br-1977.geojson) | Pass |
| [Fuji](#fuji) | 33.17 | -6.49 to 5.55 | 0.00 to 0.00 | [52.0](https://api.openstreetmap.org/api/0.6/map?bbox=138.9087,35.3537,138.9447,35.3897) | Pass |
| [Okayama](#okayama) | 25.81 | -3.46 to 5.32 | 0.00 to 0.00 | [37.0](https://api.openstreetmap.org/api/0.6/map?bbox=134.2026,34.8973,134.2386,34.9333) | Pass |
| [Korea](#korea) | 0.00 | 0.00 to 0.00 | 0.00 to 0.00 | [6.0](https://api.openstreetmap.org/api/0.6/map?bbox=126.3987,34.7153,126.4347,34.7513) | Pass |
| [Jerez](#jerez) | 17.64 | -2.25 to 2.52 | 0.00 to 0.00 | [33.0](https://api.openstreetmap.org/api/0.6/map?bbox=-6.0513,36.6903,-6.0153,36.7263) | Pass |
| [Donington](#donington) | 29.43 | -5.10 to 4.93 | 0.00 to 0.00 | [31.0](https://api.openstreetmap.org/api/0.6/map?bbox=-1.393,52.8126,-1.357,52.8486) | Pass |
| [Anderstorp](#anderstorp) | 2.82 | -1.25 to 1.13 | 0.00 to 0.00 | [9.0](https://api.openstreetmap.org/api/0.6/map?bbox=13.5837,57.2467,13.6197,57.2827) | Pass |
| [Brands Hatch](#brands-hatch) | 29.89 | -5.33 to 5.32 | 0.00 to 0.00 | [46.0](https://api.openstreetmap.org/api/0.6/map?bbox=0.242,51.342,0.278,51.378) | Pass |
| [Zolder](#zolder) | 14.04 | -2.34 to 2.22 | 0.00 to 0.00 | [21.0](https://api.openstreetmap.org/api/0.6/map?bbox=5.2389,50.9714,5.2749,51.0074) | Pass |
| [Dijon](#dijon) | 23.78 | -4.70 to 5.68 | 0.00 to 0.00 | [33.0](https://api.openstreetmap.org/api/0.6/map?bbox=4.8812,47.3445,4.9172,47.3805) | Pass |
| [Buddh](#buddh) | 15.83 | -3.82 to 4.84 | 0.00 to 0.00 | [14.0](https://api.openstreetmap.org/api/0.6/map?bbox=77.5151,28.3307,77.5511,28.3667) | Pass |
| [Mont Tremblant](#mont-tremblant) | 28.18 | -3.86 to 5.08 | 0.00 to 0.00 | [39.0](https://api.openstreetmap.org/api/0.6/map?bbox=-74.6288,46.1709,-74.5928,46.2069) | Pass |
| [Mosport](#mosport) | 40.49 | -5.61 to 5.29 | 0.00 to 0.00 | [52.0](https://api.openstreetmap.org/api/0.6/map?bbox=-78.6922,44.0331,-78.6562,44.0691) | Pass |

## How height and roll reach the car

The road builder locates each elevation sample along the lap. Authored elevations use overlapping smooth rises and dips. Baked routes draw on a sampled terrain profile. The builder converts the source trace to the racing start and direction, so a correct height at the wrong fraction can move a crest into a different corner. Spa and Silverstone both showed why checking only total relief misses this error.

Banking is transverse road slope. The surface builder holds the centreline fixed and computes height at the car’s lateral offset. On a progressive bank the local roll changes across lanes. The road mesh, tyre contact, car body, camera, shadows and driving line sample that surface. Longitudinal grade and lateral camber enter the driving model separately. A stream beside a hill or a tunnel under a city needs its own placement and measurement.

Ground-gate counts in parentheses give buried primitives, unsupported primitives and horizontal overlap spots, in that order. The terrain column links the mapped route. The accompanying CSV contains all 2,496 Open-Meteo terrain readings. Station divided by 48 gives distance as a fraction of the mapped lap. [Download the sampled coordinates and elevations](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv). Route geometry comes from Tomislav Bacinger’s circuit dataset (40) and OpenStreetMap contributors (12). Historic configurations can differ from the available modern route. [Bacinger circuit data and license](https://github.com/bacinger/f1-circuits) · [OpenStreetMap attribution and license](https://www.openstreetmap.org/copyright) · [Open-Meteo elevation data](https://open-meteo.com/en/docs/elevation-api)

## Evidence and disposition

### Bahrain

BIC 18 m and F1 16.9 m versus built 5.00 m, T4 climb missing. F1 identifies adverse T10 camber. Correct adverse T10 camber and University light placement, clear pit-exit stand from hospitality buildings. Elevation trial excluded due to new scenery defects. [Circuit evidence](https://www.bahraingp.com/corporate-sales/track-hire/) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Monaco

The game spans 41.30 m against 41.8 m in 268 OpenF1 qualifying positions. The same lap supplied the profile fit. Retained the road profile and corrected buried scenery. Urban terrain cells include buildings and tunnel roofs. [Circuit evidence](https://www.skysports.com/f1/news/9855244/anthony-davidsons-lap-of-monaco) · [API](https://api.openf1.org/v1/location?session_key=9519&driver_number=16&date%3E=2024-05-25T14%3A58%3A18.527000%2B00%3A00&date%3C=2024-05-25T14%3A59%3A28.797000%2B00%3A00)

### Silverstone

Three qualifying laps span 11.3 m. The revised profile spans 11.18 m and drops 5.1 m from Stowe to Vale. A 2023 lap differs by 0.21 m RMS. Replaced the fictional Chapel trough and revised the layout version. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.openf1.org/v1/location?session_key=9554&driver_number=63&date%3E=2024-07-06T15%3A08%3A48.284000%2B00%3A00&date%3C=2024-07-06T15%3A10%3A15.503000%2B00%3A00)

### Spa

Wallonia LiDAR measured 13.3 m of climb in the first 111 m of the sampled Eau Rouge sector. The original road gained 0.92 m. The revised road gains 13.26 m. Sector RMS error fell from 7.74 m to 0.25 m against 46 LiDAR samples. Corrected the timing of the ascent and grounded the old-road scenery. A 2025 qualifying lap corroborates the sector profile. [Circuit evidence](https://www.spa-francorchamps.be/en/news/96_the-corners-of-the-spa-francorchamps-circuit) · [API](https://geoservices.wallonie.be/arcgis/rest/services/RELIEF/WALLONIE_MNT_2021_2022/MapServer)

### Monza

The revised Lesmo–Ascari descent gives 12.39 m of relief against 12.4 m in two 2024 qualifying laps. A held-out 2025 pole lap differs by 0.119 m RMS, down from 4.782 m. Re-seated seven scenery pieces and cleared all horizontal overlap spots. Chromium recorded the updated nine-scenario driving reference in CI. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.openf1.org/v1/location?session_key=9586&driver_number=4&date%3E=2024-08-31T15%3A02%3A50.589000%2B00%3A00&date%3C=2024-08-31T15%3A04%3A09.916000%2B00%3A00)

### Suzuka

F1 relief 40.4 m vs built 39.71 m, Gyaku Bank nearly flat per operator. Removed the 3.5° T6 Gyaku Bank zone. [Circuit evidence](https://www.suzukacircuit.jp/course_s/pdf/suzuka_courseguide.pdf) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Singapore

4.997 m built relief vs 5.3 m on the pre-2023 layout, current street crossfalls unverified Corrected bank comment and separated overlapping skyline, stands and facades, retained track geometry [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.open-meteo.com/v1/elevation?latitude=1.291728,1.289994,1.289709,1.291436&longitude=103.864144,103.856541,103.851762,103.859414)

### Cota

F1 30.9 m lap relief vs built 31.38 m, both low T19–20 and high T1. Real climb reported at 11%, built max 7.77%. Main stand roof panels meet at pitch and sparse generic oaks clear crown overlap. Retain surface and banks. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.open-meteo.com/v1/elevation?latitude=30.13176,30.130031,30.13423,30.136168,30.139439,30.13729,30.134688,30.134626&longitude=-97.639651,-97.636905,-97.634774,-97.632276,-97.62457,-97.636645,-97.636781,-97.643274)

### Interlagos

FIA 42 m relief, built 40.37 m, terrain API 47 m across 48 samples. Ground hillside houses individually, buried primitives 25 → 18. Retain road profile and banks. [Circuit evidence](https://www.fia.com/sites/default/files/2026_gp_sao_paulo_media_kit_eng_1.pdf) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Vegas

48 USGS 1 m terrain samples span 16.28 m. Russell's 2024 pole spans 16.30 m, the rebuilt lap spans 16.26 m with 1.16 m RMS deviation. Apply USGS heights, seat Bellagio crown, set Paris hotel and service compound back from the terrain edge. [Circuit evidence](https://www.f1lasvegasgp.com/track-layout/) · [API](https://api.openf1.org/v1/laps?session_key=9640&driver_number=63&lap_number=24)

### Madrid

26.00 m built vs 26 m measured, crest/low misplaced, Monumental 13.5° matches 24%. Corrected banking at Curves 2, 11 (adverse) and 13, split the hedge at three inside bends. Elevation realignment pending scenery support. [Circuit evidence](https://www.madring.com/en/circuit) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Zandvoort

Two qualifying laps span 9.2 m and descend more than 6 m from Turn 4 to Turn 5. The previous road crested at Turn 5 and had 4.20 m of total relief. Corrected the dune sequence to 8.94 m relief and retained the designer-sourced progressive banking. [Circuit evidence](https://www.circuitzandvoort.nl/en/corners/) · [API](https://api.openf1.org/v1/laps?session_key=9145&driver_number=4)

### Jeddah

2.20 m built relief vs 0–4 m coastal DEM, T13 designer gives 12% (6.84°), operator gives 12° Anchored existing 7° bank to T13, moved mosque hall onto cap and eliminated 256 m² face overlap [Circuit evidence](https://racingnews365.com/jeddah-architect-explains-why-different-strategies-might-be-possible) · [API](https://api.open-meteo.com/v1/elevation?latitude=21.631053,21.643322,21.644585,21.631779&longitude=39.105076,39.101664,39.101558,39.102915)

### Albert Park

2016 F1 relief 2.6 m, built 1.00 m, 48 DEM samples span 8 m, Turn 11 rebuilt in 2022. Split folded T11 inside tyre-wall row, retain surface profile pending modern survey. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Shanghai

F1 reports T2 7.4 m above back straight, build peaks between T8 and T9 at 6.50 m. FIA grades +3%/−8% vs built ±1.70%. Corrected guide and comments, narrowed overlapping spiral apron and split T14 hedge. T2 crest trial remains deferred. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Miami

Two qualifying laps and corner markers place the Turnpike chicane crest about 250 m earlier than the original game profile. Relocated the crest to the chicane and re-grounded the marina and grandstand scenery. [Circuit evidence](https://www.formula1.com/en/racing/2024/miami) · [API](https://api.openf1.org/v1/location?session_key=9498&driver_number=1&date%3E=2024-05-04T20%3A50%3A55.643000%2B00%3A00&date%3C=2024-05-04T20%3A52%3A22.884000%2B00%3A00)

### Imola

Pirelli 30 m, built 28.00 m, route terrain 39 m, Acque Minerali relative to the line needs survey. Ground vineyard rows, separate church plinths and office turret, use chain-link on two fence runs. Buried 13 to 10, flat-coplanar 3 to 0, overhead 2 to 0. [Circuit evidence](https://press.pirelli.com/formula-1-returns-to-europe-for-an-appointment-with-history/) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Montreal

F1 publishes 5.2 m between the T2–T3 crest and T12–T13 low, built relief is 3.20 m, ±1.15% grade and ±3° bank. 48 terrain cells span 13 m. Correct hedge, lawn and casino overlaps, defer tested real-profile trial because it buried 13 more primitives. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.open-meteo.com/v1/elevation?latitude=45.513626,45.497132&longitude=-73.527556,-73.522992)

### Redbull

Operator 65 m and +12/−9.3% vs built 53.24 m and +5.89/−5.68%, DEM 68 m. F1 driver confirms off-camber T10. Corrected off-camber T10, grounded T4 tree row and shortened inside T6 hedge. Relief still 11.76 m below operator figure. [Circuit evidence](https://www.redbullring.com/en/track/red-bull-ring-f1-motogp-track/) · [API](https://api.open-meteo.com/v1/elevation?latitude=47.220023,47.226136&longitude=14.765119,14.754083)

### Hungaroring

Operator 36 m and +6.2%/−7.0%, built 30.14 m and +3.50%/−4.79%. Relocate pit broadcast compound 8 m to clear 0.07 m burial. Pavement profile unresolved. [Circuit evidence](https://hungaroring.hu/src/Hungaroring_F1_Guidebook_2018_WEB.pdf) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Baku

F1 gives 26.8 m to T13, stock built 14.0 m at T12. Updated runtime reaches 26.80 m at T13, max grade 5.39%, bank 0°. Correct T13 relief, seat palace and boulevard geometry, connect yacht cabin and separate overlapping skyline, arena and façade footprints. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.open-meteo.com/v1/elevation?latitude=40.37313,40.368163&longitude=49.8546,49.832153)

### Mexico

F1 lists 2.8 m of relief. Built relief falls from 6.600 m to 2.800 m. Match the 2.8 m relief, clear grandstand planting and size stadium shell panels to local spacing. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.open-meteo.com/v1/elevation?latitude=19.406226&longitude=-99.094338)

### Qatar

48 route terrain samples span 10–15 m. Williams describes modest altitude change. Built relief is 6.50 m. Retain current profile pending surveyed pavement heights and bank angles. [Circuit evidence](https://www.williamsf1.com/articles/e8d1e696-32b2-47b0-90f0-f7e1aaf750aa/five-things-to-know-about-the-qatar-gp) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Abudhabi

F1 places a 10.7 m crest at T3 (~0.137 lap), the 9.00 m game profile peaks at 0.661 lap near the marina. Retained existing road pending coordinated T3 crest work. Fixed pit and hairpin light pools and the eight-yacht marina group. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.multiviewer.app/api/v1/circuits/70/2024)

### Hockenheim

F1 4.3 m relief, second crest at Spitzkehre, built 9.00 → 4.30 m Fit circuit-specific rises to F1 longitudinal chart, retain banking. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Nurburgring

GP terrain 56 m vs built 50.50 m relief, Mercedes-Arena published 2.5% crossfall (1.43°). Corrected T2 crossfall and shortened overlapping Arena seating by two panels. [Circuit evidence](https://www.motor-kritik.de/sites/default/files/Fakten_N%C3%BCrburgring_allgemein.pdf) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Catalunya

F1 29.6 m T1 to T12 exit, 2024 OpenF1 pole lap 30.0 m, built 20.00 → 28.90 m with corrected extrema Replaced four authored bumps with a smoothed racing-lap profile, corrected brief. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.openf1.org/v1/location?session_key=9535&driver_number=4&date%3E=2024-06-22T14%3A59%3A40.646000%2B00%3A00&date%3C=2024-06-22T15%3A00%3A52.029000%2B00%3A00)

### Sepang

F1 gives 22 m from T3 to T11, terrain samples span 21 m, game spans 9.50 m and leaves adverse-camber T15 flat. Correct track brief, withhold road change after seven buried primitives appeared. [Circuit evidence](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [API](https://api.open-meteo.com/v1/elevation?latitude=2.763496,2.756636&longitude=101.733469,101.738695)

### Istanbul

46 m published relief vs 21.0 m built, maximum grade 8.145% vs 6.28%. Trimmed the T1/T4/T9 hillside runs where adjacent panels overlap, road unchanged. [Circuit evidence](https://tosfedistanbulpark.com/en/the-circuit/) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Paul Ricard

IGN 202-vertex terrain range 29.82 m, Open-Meteo 27 m. Built relief corrected from 6.50 to 29.82 m. Use IGN heights at unchanged XY vertices and fit paddock and planting geometry to grade. [Circuit evidence](https://science.nasa.gov/earth/earth-observatory/circuit-paul-ricard-92728/) · [API](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=5.791571%7C5.779603&lat=43.25202%7C43.258482&resource=ign_rge_alti_wld&zonly=true)

### Portimao

Built relief 24.05 m vs 25 m sampled terrain. Peak downhill 5.49% vs 16% in 2021 GP team guide. Peak bank 4.50° vs operator 4.57°. Trimmed the mid-lap red-earth cutting to remove the overlapping chord tops, retained road profile pending station-resolved pavement heights. [Circuit evidence](https://www.astonmartinf1.com/en-GB/races/2021-portuguese-gp) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Sochi

FIA and F1 publish 1.9 m relief, built 6.500→1.900 m, max grade 1.309→0.381%. Scale existing relief, reconnect palace roof, resolve hedge, paving and stand overlaps, bank unverified. [Circuit evidence](https://www.fia.com/sites/default/files/2019_russian_media_kit_eng_1-min.pdf) · [API](https://api.open-meteo.com/v1/elevation?latitude=43.409699,43.409796,43.406300&longitude=39.968066,39.956573,39.959199)

### Mugello

Official 42.86 m rise and 6.85% maximum grade vs built 21.00 m and 4.62%. Shortened Bucine vineyard rows, clearing two coplanar spots. Profile awaits scenery reseating. [Circuit evidence](https://mugellocircuit.cronorapino.it/downloads/MAPPE%20CIRCUITO/Mugello3Intermedi.pdf) · [API](https://api.open-meteo.com/v1/elevation?latitude=44.000669,43.992572&longitude=11.377208,11.369612)

### Magny Cours

IGN terrain spans 29.61 m and the Tour gives about 30 m, the SRTM-based road now spans 25.73 m versus 11.00 m. Bake the SRTM lap profile and clear the Estoril grandstand and Imola hedge intersections. [Circuit evidence](https://www.letourfemmes.fr/en/heritage/stage-7/town/chambery) · [API](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=3.165641%7C3.166542&lat=46.867507%7C46.859414&resource=ign_rge_alti_wld&zonly=true)

### Estoril

Operator +6.75%/−5.56% on GP layout, Tanque build +3.93%/−3.93%, 15 m relief vs 34 m sampled terrain. No patch, confirm pavement crest locations and variant before reprofiling. [Circuit evidence](https://www.circuito-estoril.pt/en/technical-data/) · [API](https://api.open-meteo.com/v1/elevation?latitude=38.748630,38.755182&longitude=-9.396854,-9.392092)

### Kyalami

Modern 16-turn anticlockwise circuit, 43 m relief with Leeukop highest. Built relief corrected from 27.0 m to 43.0 m. Correct Leeukop crest, Mineshaft descent and low approach to Crowthorne. Preserve banking. [Circuit evidence](https://www.readkong.com/page/kyalami-9-hour-welcome-to-the-race-3134028) · [API](https://api.open-meteo.com/v1/elevation?latitude=-25.99601,-25.999833&longitude=28.073436,28.060534)

### Watkins Glen

1971–74 Boot layout, published relief 35.05 m, built 21.00 → 31.40 m. Bake 86-point SRTM survey, seat ticket booth and move Boot camera clear of trees. Historic bank angles unverified. [Circuit evidence](https://gvc-bmwcca.org/_Download/Rookie_Chronicles_Part2.pdf) · [API](https://api.opentopodata.org/v1/srtm30m?locations=42.342965,-76.923725%7C42.331449,-76.920348)

### Indianapolis

2000–07 clockwise F1 course includes the 9.2° oval turn. The [period corner map](https://indymotorspeedway.com/sitebuilder/images/usgpmap5-600x328.jpg) places Turns 12 and 13 on the oval. Matched all 13 turn markers to the traced bends. The built final bend now peaks at 9.2°, with 3.95° on entry and 5.37° on exit. DEM span 7 m versus 3.30 m built relief. Recenter and widen the final bank, seat parked cars on the local terrain, move the infield gravel apron and overlapping tyre wall to the outside of their right-hand bend. [Circuit evidence](https://doctorindy.com/wp-content/uploads/2019/06/2007_indy500_media_guide.pdf) · [API](https://api.open-meteo.com/v1/elevation?latitude=39.793155&longitude=-86.238851)

### Buenos Aires

1995–98 No. 6-S 4,259 m, terrain 5–16 m across 48 positions, historical pavement and banking unmeasured Space roadside plane trees singly, preserve the avenues and the 4.20 m road profile [Circuit evidence](https://www.racingcircuits.info/south-america/argentina/buenos-aires.html) · [API](https://api.open-meteo.com/v1/elevation?latitude=-34.694048,-34.694217,-34.691953&longitude=-58.461256,-58.457689,-58.457439)

### Jacarepagua

Flat former marshland, GP course partly demolished in 2006, 48 modern terrain samples span 2–9 m versus 3.80 m game relief. Disable daytime mast light pools, retain historic surface estimates. Shared final-corner tyre caps overlap 2.19 m². [Circuit evidence](https://www.racingcircuits.info/south-america/brazil/jacarepagua.html) · [API](https://api.jolpi.ca/ergast/f1/1989/1/circuits.json)

### Fuji

Built 33.17 m vs speedway 40 m, grades −6.49/+5.55% vs −10.05/+8.88%. DEM spans 52 m. Document operator grades and Dunlop low point. Defer geometry pending road profile. [Circuit evidence](https://www.fsw.tv/guide/facility/racing.html) · [API](https://api.open-meteo.com/v1/elevation?latitude=35.368863&longitude=138.922017)

### Okayama

Operator 29 m, GSI 1 m lidar 29.3 m, game 21.99 → 25.81 m with stock grade and curvature limits. Bake the GSI centreline, separate overlapping aprons and relocate buried hoarding. Start-line registration remains open. [Circuit evidence](https://www.okayama-international-circuit.jp/guide/course.html) · [API](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=134.2216134&lat=34.9118655&outtype=JSON)

### Korea

Operator lists 5,615 m and 18 turns, 48 DEM samples span 0–6 m vs 0 m built relief. Retain flat profile pending pavement elevation and camber survey. [Circuit evidence](https://www.koreacircuit.com/Tracks) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Jerez

Smoothed MotoRaceLab DEM estimates 20 m relief and +3.7%/−3.5% vs built 17.64 m and +2.52%/−2.25%. Retain Jerez surface, shared tyre-wall cap candidate submitted for fleet gating. [Circuit evidence](https://motoracelab.com/en/guide/4/) · [API](https://api.open-meteo.com/v1/elevation?latitude=36.708775,36.709273,36.712779&longitude=-6.036768,-6.029387,-6.031916)

### Donington

48 route samples span 64–95 m. The terrain low matches the built trough near 27% of the lap. Built relief is 29.43 m. Retain road. Shorten two building footprints and open four pinched hedge runs. [Circuit evidence](https://www.donington-park.co.uk/about/circuit-map) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Anderstorp

Published 5 m lap relief vs 2.82 m built. Real long corners are banked, built banking is zero. Retain geometry pending pavement elevations and measured corner crossfalls. [Circuit evidence](https://www.racingcircuits.info/europe/sweden/anderstorp.html) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)

### Brands Hatch

EA lidar 17.51 m Paddock Hill drop / 20.57 m Druids climb, game improved 4.69/2.81 → 11.46/11.06 m. Patched 12 local lidar-fit posts, held-out relative height MAE reduced from 4.70 to 2.60 m. [Circuit evidence](https://brscc.co.uk/wp-content/uploads/2018/10/2025-British-GT-Brands-Hatch-GP.pdf#page=2) · [API](https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m&subset=E%28557000,558100%29&subset=N%28164150,165300%29&format=image/tiff)

### Zolder

Modern 4000 m official lap, 48 terrain samples span 21 m vs 14.04 m built relief. Retain elevation and bank, no measured pavement correction. [Circuit evidence](https://www.bgdc.be/files/R1TERLAEMEN200/2024TCNBRIEFINGBGDC.pdf) · [API](https://api.open-meteo.com/v1/elevation?latitude=50.984744,50.991880,50.992625&longitude=5.254065,5.260888,5.258415)

### Dijon

Operator 14% maximum at Parabolique versus +5.68% built, 3,801 m versus 3,717 m built. Seat detached limestone ledge on its bench, road profile needs chainage evidence. [Circuit evidence](https://www.circuit-dijon-prenois.com/en/drive-on-the-racetrack-en/) · [API](https://api.open-meteo.com/v1/elevation?latitude=47.3625&longitude=4.89913)

### Buddh

Williams 14 m T1–T3 climb, modeled −2.12 → +14.00 m. Back straight dips then climbs to T4, T10 banking angle unresolved. Correct first-sector profile in the elevation baker, reseat grandstand and paddock, drape fields and runoff. [Circuit evidence](https://www.motorsport.com/f1/news/f1-williams-can-t-wait-to-see-tilke-designed-indian-gp-track/413764/) · [API](https://api.open-meteo.com/v1/elevation?latitude=28.354021%2C28.354282%2C28.356498%2C28.351002%2C28.34543&longitude=77.533595%2C77.534557%2C77.535661%2C77.537599%2C77.539014)

### Mont Tremblant

28.18 m built relief versus 39 m across 48 contemporary terrain samples. The historic Hump was later lowered. Retain profile pending historic pavement data. [Circuit evidence](https://www.racingcircuits.info/north-america/canada/mont-tremblant.html) · [API](https://api.open-meteo.com/v1/elevation?latitude=46.181636,46.192807&longitude=-74.610185,-74.615380)

### Mosport

48 terrain samples span 52 m versus 40.49 m built. PCA documents off-camber T2 and drops of 13.7 m at T2 and 27.4 m at T4. Retain SRTM profile pending pavement data. Crossfall angle unresolved. Shared tyre-wall cap geometry flagged. [Circuit evidence](https://pcaucr.org/wp-content/uploads/Provinz/2014/ProvinzJul2014.pdf) · [API](./TRACK-ELEVATION-SAMPLES-2026-11-21.csv)
