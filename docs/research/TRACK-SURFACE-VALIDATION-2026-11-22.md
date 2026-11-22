# Circuit surface validation, second pass

The starting revision was `0211dc069b` in [PR #6132](https://github.com/brycejmurrin/f1-game/pull/6132). Each circuit has a dedicated worktree. Measurements use the built racing surface. Grade is the rise per horizontal distance between consecutive centreline nodes. Signed bank is the local tangent just inside each asphalt edge, with a positive angle raising the right edge.

The initial probe checked both shoulders at all 63,392 nodes across 52 circuits. One metre outside each asphalt edge, it checked for zero residual road-bank angle and preserved edge height within 0.1 mm. At the edge it compared the planner and vehicle bank samplers within 0.000001 radians. All nodes passed. Kerb height, verge drainage and off-road terrain have separate geometry.

Across the 52 circuit investigations, 32 received changes to elevation or banking. Anderstorp, Buddh and Korea received corrections to the documentation or source descriptions. The other 17 retained their existing geometry. The combined build contains 63,397 centreline nodes. The edge-height, shoulder tangent and planner-versus-vehicle comparisons passed on both sides of every node.

## How the game builds the road

The circuit definition supplies a horizontal path and the racing direction and start position. A baked survey stores 64 heights at equal intervals of distance around the source path. The factory interpolates those heights periodically, and the centreline builder samples the racing surface roughly every four metres. On a circuit with a survey, that survey takes precedence over the authored elevation bumps. Circuits without a baked survey use their authored height profiles. Bridges can add a local deck rise above the terrain. [Definition factory](../../js/track/core/def.js) · [Centreline builder](../../js/track/tracks.js)

Banking is a separate measurement across the road. A corner zone defines how the edge-to-edge height difference grows and decays along the lap. Progressive corners can also change slope across the width of the asphalt. At a given station the planner queries the local bank angle, and vehicle contact uses the corresponding height and tangent at its lateral position. A single car's altitude trace can locate a crest but cannot determine the height difference between left and right edges. Paired lateral survey samples can constrain that difference. [Road mesh and bank samplers](../../js/track/core/mesh.js)

## Starting measurements

| Circuit | Nodes | Relief (m) | Grade range (%) | Bank range (°) |
|---|---:|---:|---:|---:|
| Bahrain | 1,347 | 5.00 | -1.81 to 1.81 | -3.50 to 4.00 |
| Monaco | 824 | 41.30 | -7.51 to 9.79 | -3.00 to 3.00 |
| Silverstone | 1,461 | 11.18 | -2.36 to 2.05 | -4.50 to 4.00 |
| Spa | 1,737 | 101.37 | -9.26 to 15.15 | -6.00 to 4.00 |
| Monza | 1,444 | 12.39 | -2.23 to 1.59 | -6.00 to 0.04 |
| Suzuka | 1,447 | 39.71 | -5.46 to 6.16 | -7.00 to 4.00 |
| Singapore | 1,227 | 5.00 | -3.27 to 3.27 | -3.00 to 3.00 |
| Cota | 1,376 | 31.38 | -7.09 to 7.77 | -4.50 to 5.00 |
| Interlagos | 1,071 | 40.37 | -4.22 to 5.75 | -4.00 to 7.00 |
| Vegas | 1,543 | 16.26 | -3.47 to 1.65 | -3.00 to 3.00 |
| Madrid | 1,336 | 26.00 | -6.73 to 5.44 | -13.50 to 3.00 |
| Zandvoort | 1,054 | 8.94 | -6.64 to 6.41 | -18.00 to 19.00 |
| Jeddah | 1,540 | 2.20 | -0.45 to 0.45 | -6.00 to 7.00 |
| Albert Park | 1,315 | 1.00 | -0.28 to 0.28 | -3.00 to 3.50 |
| Shanghai | 1,354 | 6.50 | -1.70 to 1.70 | -4.00 to 5.00 |
| Miami | 1,342 | 3.13 | -4.03 to 5.27 | -3.00 to 3.50 |
| Imola | 1,218 | 28.00 | -6.60 to 8.18 | -1.50 to 1.50 |
| Montreal | 1,087 | 3.20 | -1.15 to 1.15 | -3.00 to 3.00 |
| Redbull | 1,072 | 53.24 | -5.68 to 5.89 | -4.00 to 4.00 |
| Hungaroring | 1,091 | 30.14 | -4.79 to 3.50 | -3.50 to 6.00 |
| Baku | 1,475 | 26.80 | -5.33 to 5.39 | 0.00 to 0.00 |
| Mexico | 1,072 | 2.80 | -0.79 to 0.79 | -3.50 to 6.00 |
| Qatar | 1,348 | 6.50 | -1.23 to 1.23 | -4.00 to 4.00 |
| Abudhabi | 1,319 | 9.00 | -1.68 to 1.68 | -3.00 to 5.00 |
| Hockenheim | 1,135 | 4.30 | -3.23 to 2.23 | -4.00 to 2.50 |
| Nurburgring | 1,278 | 50.50 | -5.48 to 5.75 | -4.50 to 4.00 |
| Catalunya | 1,163 | 28.90 | -6.15 to 6.57 | -4.50 to 0.00 |
| Sepang | 1,376 | 9.50 | -1.87 to 1.87 | -4.00 to 3.00 |
| Istanbul | 1,313 | 21.00 | -6.28 to 6.28 | 0.00 to 7.00 |
| Paul Ricard | 1,453 | 29.82 | -6.56 to 6.73 | -4.00 to 3.00 |
| Portimao | 1,157 | 24.05 | -5.49 to 3.17 | -4.00 to 4.50 |
| Sochi | 1,449 | 1.90 | -0.38 to 0.38 | -5.00 to 0.00 |
| Mugello | 1,307 | 21.00 | -4.62 to 4.62 | -5.00 to 4.50 |
| Magny Cours | 1,105 | 25.73 | -4.34 to 3.06 | -3.50 to 3.00 |
| Estoril | 1,034 | 15.00 | -3.93 to 3.93 | -5.00 to 3.00 |
| Kyalami | 1,120 | 43.00 | -7.35 to 7.35 | -4.50 to 4.00 |
| Watkins Glen | 1,356 | 31.40 | -5.13 to 3.90 | -4.00 to 4.50 |
| Indianapolis | 1,018 | 3.30 | -0.94 to 0.94 | -9.20 to 0.00 |
| Buenos Aires | 1,059 | 4.20 | -1.02 to 1.02 | -5.00 to 0.00 |
| Jacarepagua | 1,228 | 3.80 | -0.83 to 0.83 | -3.50 to 4.50 |
| Fuji | 1,131 | 33.17 | -6.49 to 5.55 | 0.00 to 0.00 |
| Okayama | 922 | 25.81 | -3.46 to 5.32 | 0.00 to 0.00 |
| Korea | 1,389 | 0.00 | 0.00 to 0.00 | 0.00 to 0.00 |
| Jerez | 1,098 | 17.64 | -2.25 to 2.52 | 0.00 to 0.00 |
| Donington | 996 | 29.43 | -5.10 to 4.93 | 0.00 to 0.00 |
| Anderstorp | 997 | 2.82 | -1.25 to 1.13 | 0.00 to 0.00 |
| Brands Hatch | 971 | 29.89 | -5.33 to 5.32 | 0.00 to 0.00 |
| Zolder | 997 | 14.04 | -2.34 to 2.22 | 0.00 to 0.00 |
| Dijon | 929 | 23.78 | -4.70 to 5.68 | 0.00 to 0.00 |
| Buddh | 1,276 | 15.83 | -3.82 to 4.84 | 0.00 to 0.00 |
| Mont Tremblant | 1,052 | 28.18 | -3.86 to 5.08 | 0.00 to 0.00 |
| Mosport | 983 | 40.49 | -5.61 to 5.29 | 0.00 to 0.00 |

## Integrated changes

The following measurements come from rebuilding the combined patch. Relief is the difference between the highest and lowest centreline nodes. A correction can move a crest or deepen a local descent while leaving total relief similar. The individual findings below identify the measured corner or sector.

| Circuit | Previous relief (m) | Updated relief (m) | Updated steepest descent / climb (%) |
|---|---:|---:|---:|
| Abudhabi | 9.00 | 11.15 | -3.50 / +4.54 |
| Albert Park | 1.00 | 2.39 | -0.83 / +0.81 |
| Bahrain | 5.00 | 16.27 | -4.88 / +3.91 |
| Brands Hatch | 29.89 | 35.62 | -13.49 / +12.29 |
| Buenos Aires | 4.20 | 4.30 | -1.16 / +1.16 |
| Dijon | 23.78 | 31.65 | -8.15 / +13.89 |
| Donington | 29.43 | 35.82 | -8.85 / +7.23 |
| Estoril | 15.00 | 18.55 | -3.75 / +4.33 |
| Fuji | 33.17 | 37.13 | -9.38 / +8.70 |
| Hungaroring | 30.14 | 36.79 | -5.95 / +5.96 |
| Imola | 28.00 | 34.44 | -8.75 / +8.80 |
| Indianapolis | 3.30 | 3.30 | -0.94 / +0.94 |
| Interlagos | 40.37 | 40.48 | -5.91 / +5.75 |
| Istanbul | 21.00 | 46.00 | -8.14 / +8.14 |
| Jerez | 17.64 | 19.25 | -4.87 / +4.76 |
| Kyalami | 43.00 | 43.00 | -9.90 / +9.90 |
| Magny Cours | 25.73 | 30.00 | -4.20 / +5.05 |
| Mexico | 2.80 | 2.80 | -0.88 / +0.84 |
| Mont Tremblant | 28.18 | 28.18 | -7.30 / +9.31 |
| Montreal | 3.20 | 5.20 | -4.68 / +4.85 |
| Mosport | 40.49 | 50.89 | -13.03 / +9.97 |
| Mugello | 21.00 | 37.66 | -7.19 / +6.25 |
| Okayama | 25.81 | 25.81 | -3.46 / +5.32 |
| Paul Ricard | 29.82 | 29.82 | -6.56 / +6.73 |
| Portimao | 24.05 | 28.32 | -14.79 / +9.26 |
| Qatar | 6.50 | 4.04 | -1.06 / +0.66 |
| Redbull | 53.24 | 63.75 | -8.36 / +11.49 |
| Sepang | 9.50 | 22.00 | -5.14 / +5.32 |
| Singapore | 5.00 | 5.20 | -4.86 / +3.58 |
| Sochi | 1.90 | 1.90 | -1.46 / +2.80 |
| Watkins Glen | 31.40 | 31.40 | -5.13 / +3.90 |
| Zolder | 14.04 | 9.85 | -4.79 / +5.90 |

### Corner banking

| Circuit and station | Earlier game | Revised game | Reference |
|---|---:|---:|---|
| Paul Ricard, Signes | −4.0° | −1.4° peak | Nine IGN sections. Centre section −2.0°. |
| Indianapolis, Turn 13 exit | −5.37° | −8.26° | −8.42° from USGS lidar. |
| Magny-Cours, Adelaide apex | −0.13° | −2.64° | −2.79° from IGN. |
| Watkins Glen, final turn | −4.0° | −5.8° peak | Nine modern USGS sections. The 1971 race report confirms a banked turn. |
| Okayama, Attwood | 0° | −3.5° peak | 23 GSI sections, mean angular error 2.21° before and 0.30° after. |
| Donington, McLeans | 0° | −2.8° | −2.8° from Environment Agency lidar. |
| Istanbul, Turn 1 | Inward | Outward | Published track design supplies the direction. The 4° magnitude is estimated. |

### Matched game views

Both builds use the eye camera, daylight and the same lap fractions (0.045 at Brands Hatch and 0.205 at Bahrain). The screenshots show the approach from the driver’s viewpoint. Height and crossfall comparisons use the built nodes and cited field data.

The two matched pairs are in the reviewed screenshot bundle as `brands-bahrain.webp`.

At Spa, the measured lower Raidillon section gains 13.30 m and the built surface gains 13.26 m. At Monaco, Sainte Dévote to Beau Rivage gains 29.49 m in the game and approximately 29.5 m on the held-out lap. These screenshots were captured on the starting revision at lap fractions 0.141 and 0.170. The two validated road profiles are unchanged in this pass.

The Spa and Monaco views are in `spa-monaco.webp`.

At Imola the corrected Acque Minerali road is 11.53 m above the timing line, compared with 6.67 m below on the previous build. The matched views use the eye camera at lap fraction 0.567.

The Imola pair is in `imola.webp`. The screenshot bundle contains the original PNG captures and their camera receipts.

## Circuit findings

### Bahrain

Correct the centreline profile and re-seat affected scenery. The original 1,347-node road had 5.00 m of relief and no climb from the start to Turn 4. The rebuilt road has 16.27 m of relief and rises 14.23 m from the lap seam to the T4 marker. Formula 1 reports 16.9 m of relief and describes the start-finish straight as roughly 15 m below the Turn 4 hairpin. The game’s crest falls after the T4 marker, consistent with the two sampled laps continuing uphill past the marker. [Formula 1 elevation comparison](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc)

Reconstructed distance from cumulative XY position, converted Z from decimetres, and removed the starting datum for each lap separately. Verstappen’s lap 16 (354 positions) and Leclerc’s lap 12 (350) both span 16.7 m. A periodic fit of 48 overlapping raised cosines uses Verstappen only. Direct interpolation of the rebuilt game nodes at each car sample yields 0.17 m RMS for Verstappen and 0.21 m RMS for held-out Leclerc. These measurements compare normalized lap distance on different racing lines. OpenF1 supplies car positions, so they constrain relative elevation without resolving lateral banking. [Verstappen positions](https://api.openf1.org/v1/location?session_key=9468&driver_number=1) · [Leclerc positions](https://api.openf1.org/v1/location?session_key=9468&driver_number=16) · [Lap windows](https://api.openf1.org/v1/laps?session_key=9468)

Grades span −4.88% to +3.91%. Signed banking spans −3.5° to +4.0° and measures −3.0° at T10. Magnitudes remain estimates. Both road edges matched racing roll, and every shoulder held the edge height with zero roll. Track build reported zero surface folds and zero invalid or unsafe geometry. Both grandstand seating tests and the Bahrain slope-gravity and road-following VM test passed. Ground, clip, float and both coplanar audits passed. The floodlight pool near T11 was 0.08 m underground. Moving its mast from 36 m to 22 m beyond the same road edge leaves one buried distant dune, matching the parent count. The ground audit reports zero unsupported objects and 16 partial-footprint advisories (previously 12). All 13,652 audited prop primitives remain present. Clip audit retains a single minor cylinder intersection, 0.86 m. The remaining 0.63 m difference from the published relief is consistent with smoothing the recorded crest and trough.

### Monaco

Fresh build of `0211dc069b` produced 41.30 m of lap relief, longitudinal grades of −7.51% to +9.79%, and signed banking of −3.00° to +3.00°. Both shoulder checks passed at all 824 nodes. Track verification found zero folds and zero invalid or unsafe props.

Oscar Piastri’s 2024 qualifying lap 23 provides a check separate from the Charles Leclerc lap used to fit the road. Its 266 positions span 41.9 m in relative Z, 0.60 m more than the game. Between Sainte Dévote (T1) and Beau Rivage (T2), the game rises 29.49 m; Piastri’s samples nearest the corresponding normalized driven distances rise 29.5 m. This is a segment comparison: the sampled endpoints are at 6.6% and 18.5% of the driven path, versus the game’s 6.66% and 18.20% of centreline distance. The telemetry’s low point is around 82.9% of the lap, within the same pool-complex interval as the game. A single racing trajectory does not measure transverse banking. Retain the present climb and document the corner crossfalls as estimates pending transverse survey. [Lap](https://api.openf1.org/v1/laps?session_key=9519&driver_number=81&lap_number=23) · [Position samples](https://api.openf1.org/v1/location?session_key=9519&driver_number=81&date%3E=2024-05-25T14%3A58%3A27.264000%2B00%3A00&date%3C=2024-05-25T14%3A59%3A37.688000%2B00%3A00)

### Silverstone

The PR road drops 5.10 m from Stowe (T15 at lap fraction 0.8569) to Vale (T16 at 0.9384). Verstappen’s 2023 qualifying lap 25 gives 5.01 m between the corresponding measured stations at 0.857 and 0.938, a difference of 0.09 m. Built relief is 11.18 m against 11.3 m in the positioning data. Driver-line differences and the positioning feed’s shared circuit map limit local accuracy. [OpenF1 qualifying positions](https://api.openf1.org/v1/location?session_key=9122&driver_number=1&date%3E=2023-07-08T15%3A14%3A14.048000%2B00%3A00&date%3C=2023-07-08T15%3A15%3A42.168000%2B00%3A00)

Grade ranged from −2.36% to +2.05%, and signed bank ranged from −4.50° to +4.00°. All 1,461 nodes passed both shoulder checks. The track verifier found zero surface folds and zero invalid or unsafe diagnostics. Retain the current road. The reported increase in positive Copse camber supports its direction, while its built 4.47° at the apex remains an estimate. [Resurfacing account](https://www.bennetts.co.uk/bikesocial/news-and-views/news/2019/july/2019-silverstone-resurfacing-success)

### Spa

At PR commit `0211dc069b`, the 1,737-node road spans **101.37 m**. Its steepest uphill grade is **15.15%**, steepest downhill grade is **−9.26%**, and signed road bank spans **−6.00° to +4.00°**. Both shoulder probes passed at every node. The Spa build verifier found zero road folds, invalid diagnostics or unsafe diagnostics. It reported an existing scenery suppression.

At Raidillon, the stored Wallonia 0.5 m LiDAR samples at lap fractions 0.132988 and 0.149108 measure 389.926 and 403.225 m. The freshly built nodes gain **13.259 m**, within **0.041 m** of the measured **13.299 m**. From the latter station to fraction 0.162925 the built rise is **9.963 m** against **10.104 m** measured. These differences use the actual sample coordinates and are relative rises, so the game's vertical origin cancels. [Lower station](https://geoservices.wallonie.be/arcgis/rest/services/RELIEF/WALLONIE_MNT_2021_2022/MapServer/identify?f=json&geometry=5.970753696499606%2C50.44238924112071&geometryType=esriGeometryPoint&sr=4326&tolerance=0&mapExtent=5.970653696499606%2C50.442289241120704%2C5.9708536964996055%2C50.44248924112071&imageDisplay=256%2C256%2C96&layers=all%3A0&returnGeometry=false) · [Middle station](https://geoservices.wallonie.be/arcgis/rest/services/RELIEF/WALLONIE_MNT_2021_2022/MapServer/identify?f=json&geometry=5.9718263289807645%2C50.441680035349734&geometryType=esriGeometryPoint&sr=4326&tolerance=0&mapExtent=5.971726328980765%2C50.44158003534973%2C5.971926328980764%2C50.44178003534974&imageDisplay=256%2C256%2C96&layers=all%3A0&returnGeometry=false) · [Upper station](https://geoservices.wallonie.be/arcgis/rest/services/RELIEF/WALLONIE_MNT_2021_2022/MapServer/identify?f=json&geometry=5.972118870139803%2C50.440840456528896&geometryType=esriGeometryPoint&sr=4326&tolerance=0&mapExtent=5.972018870139803%2C50.44074045652889%2C5.972218870139803%2C50.4409404565289&imageDisplay=256%2C256%2C96&layers=all%3A0&returnGeometry=false)

Retain the current road profile. This longitudinal survey does not independently validate camber across the rest of the lap. The probes confirm consistent surface behaviour, while physical crossfall beyond surveyed locations remains uncertain.

### Monza

At PR commit `0211dc069b`, Lesmo 2 to the Ascari entry (T7–T8) drops 6.14 m on the built road. I fetched the 297 samples from Verstappen's 2025 pole lap and interpolated their heights at the same two fractions of cumulative horizontal distance. The trace drops 6.23 m, a difference of 0.09 m. Full-lap relief is 12.39 m built and 12.40 m recorded. Positioning data measures the car and cannot establish the angle between the two road edges. [OpenF1 qualifying trace](https://api.openf1.org/v1/location?session_key=9908&driver_number=1&date%3E=2025-09-06T15%3A00%3A54.117000%2B00%3A00&date%3C=2025-09-06T15%3A02%3A12.909000%2B00%3A00)

Grades span −2.23% to +1.59%. Signed bank spans −6.00° to +0.044°. Both shoulders passed the bank-angle and edge-height checks at all 1,444 nodes. The track verifier passed with zero folds, invalid models or unsafe models. Retain the profile. The magnitude of the Lesmo crossfall remains an estimate.

### Suzuka

The built lap spans 39.71 m at commit 0211dc069b, 0.69 m below Formula 1’s published 40.4 m. Its extrema occur at different places. The high is at lap fraction 0.6496, around 187 m before the Spoon exit apex (T14 at 0.6820). Formula 1 places it just after Spoon. The low is 30 m past the T2 apex, while Formula 1 locates it between T1 and T2. These are longitudinal placement discrepancies even though the relief is close. [Formula 1 circuit elevation profile](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc)

Gyaku Bank (T6) climbs 2.12% longitudinally with 0° centreline banking. Across 1,447 built nodes, grades span −5.46% to +6.16% and edge banking spans −7.00° to +4.00°. Both shoulders retained edge height and shed road banking at every node. Track verification passed with zero folds, invalid placements or unsafe objects and one existing scenery suppression warning. [Operator's course guide](https://www.suzukacircuit.jp/course_s/pdf/suzuka_courseguide.pdf)

Retain the profile pending a pavement trace that resolves both crossover decks and the Spoon exit. Moving the summit from the published description alone would leave its approach and descent unconstrained.

### Singapore

Both 2024 qualifying traces span 5.4 m. The 1,227-node game road spanned 5.00 m but reached only 2.50 m above its minimum at the Turn 13 hairpin. At the hairpin the two position feeds place the car 5.0–5.1 m above the lap low. The revised road gives 5.00 m at T13 and 5.20 m of total relief. Fit 80 smooth stations to the 338 positions in Lando Norris's lap 15. Against the 333 positions in Max Verstappen's lap 11, which was excluded from fitting, vertical RMS error after constant datum alignment fell from 1.11 m to 0.10 m. Planar registration had a 7.4 m RMS station-matching error before nearest-road projection. Both drivers can share the feed’s underlying height map. These traces describe centreline variation and cannot establish lane crossfall. [Norris lap](https://api.openf1.org/v1/location?session_key=9602&driver_number=4&date%3E=2024-09-21T14%3A13%3A32.655000%2B00%3A00&date%3C=2024-09-21T14%3A15%3A02.180000%2B00%3A00) · [Verstappen lap](https://api.openf1.org/v1/location?session_key=9602&driver_number=1&date%3E=2024-09-21T13%3A35%3A10.490000%2B00%3A00&date%3C=2024-09-21T13%3A36%3A40.170000%2B00%3A00)

The revised road ranges from −4.86% to +3.58% grade. Authored banking remains −3° to +3°, with zero edge-height, shoulder-roll or AI-tangent mismatches in the all-node probe. Moved six harbour boats into the bay’s rendered water bands, seated their hulls at the sheet elevation, and closed a gap between two promenade lights at their high station. Incremented the circuit revision and regenerated its definition fingerprint.

Track verification and the ground, vertical coplanar, overhead, float and severe-clipping gates passed. The fine-ground audit counted two buried primitives, zero unsupported primitives, zero flat-coplanar spots and 90 advisory footprint warnings. There are zero elevated clusters or overhead overlaps and two minor clips. Recommendation: apply the measured longitudinal correction; retain existing corner banking pending cross-section data.

The browser migration spec and its VM mirror now check the T4-to-T13 rise, the total relief, and the lap windows containing the low and crest. The focused Singapore VM migration test passed with both day and night scenery loaded. The incremental test changes are in `singapore-tests.patch`.

### Cota

Measured on 0211dc069b. The lowest point is at 91.35% of the lap between T19 and T20. The crest is at 6.54%, 3.8 m before the T1 marker. The rise between them is 31.38 m versus Formula 1’s 30.9 m, a +0.48 m difference. From the timing line to T1 alone the game rises 20.24 m. [Formula 1](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc)

Signed longitudinal grade spans −7.09% to +7.77% and signed bank spans −4.50° to +5.00°. The 11% approach grade reported by NASCAR exceeds the game’s maximum by 3.23 percentage points. The precise distance interval for the reported grade and independently measured crossfalls remain unresolved. Retain the validated crest position and lap relief pending a station-resolved approach profile. [NASCAR](https://www.nascar.com/gallery/nascarcasm-why-turn-1-at-cota-is-the-most-chaotic-corner-in-nascar/)

The shared lane/shoulder probe passed at all 1,376 nodes, both edges. Track verification passed with zero folds and zero unsafe or invalid scenery diagnostics. No circuit patch.

### Interlagos

**Interlagos — corrected the Descida do Lago descent.** The built centerline fell 3.34 m between the authored T4 and T5 stations. Two 2025 qualifying laps independently measured 6.75 m (Norris) and 6.66 m (Piastri). Each lap was registered to the built centerline using horizontal coordinates, then its recorded altitude was interpolated at the turn stations. Horizontal alignment RMS was 7.0 and 5.8 m, respectively. These are vehicle positioning samples, with some uncertainty over the exact point on the road. [Norris location samples](https://api.openf1.org/v1/location?session_key=9865&driver_number=4&date%3E=2025-11-08T19%3A02%3A47.003000%2B00%3A00&date%3C=2025-11-08T19%3A03%3A56.514000%2B00%3A00) · [Piastri location samples](https://api.openf1.org/v1/location?session_key=9865&driver_number=81&date%3E=2025-11-08T18%3A34%3A21.338000%2B00%3A00&date%3C=2025-11-08T18%3A35%3A31.173000%2B00%3A00)

A nine-post adjustment to the terrain bake now produces a 6.73 m descent on the built road. All 1,071 nodes passed shoulder checks. Signed grade ranges from −5.91% to +5.75% and authored banking from −4° to +7°. A centerline trace cannot establish crossfall. Overall relief is 40.48 m against 42 m published and 43.10 m observed on both laps. Retain this localized fix and leave a whole-lap adjustment pending a higher-resolution road survey. [FIA São Paulo media kit](https://www.fia.com/sites/default/files/2026_gp_sao_paulo_media_kit_eng_1.pdf)

Verification passed the track build, signed grade limit, definition golden, scenery grounding baseline (18 buried, zero unsupported), clip and overhead audits, and floating cluster scan. The patch adds a 6.7 ±0.5 m station regression check.

### Vegas

At PR head `0211dc069b`, the road rises **16.02 m** from T10 beside the Sphere to T14 at the end of the Strip. A fresh query of George Russell’s 2024 pole lap returned 368 positions. Interpolating feed height at the same fractions of horizontal lap distance gives **15.65 m**, a 0.37 m difference. Whole-lap relief is 16.26 m built versus 16.30 m recorded. The comparison assumes equal normalized lap distances and supports the overall climb. [OpenF1 position samples](https://api.openf1.org/v1/location?session_key=9640&driver_number=63&date%3E=2024-11-23T07:20:35.796&date%3C=2024-11-23T07:22:08.108)

Built grades run from −3.47% to +1.65% and signed edge banking from −3.00° to +3.00°. Both shoulders passed at all 1,543 nodes. The track verifier reported zero folds, invalid models or unsafe models, and five palm placements dropped by the scenery guard. Retain the profile. Local corner crossfall remains an estimate because a single car path does not measure a road cross-section.

### Madrid

Two 2026 qualifying laps independently put the low at 10.2–10.4% and the high at 35.0–35.1% of driven lap distance, with 24.6 m relief in both. The game’s 26.00 m relief matches the operator’s published elevation range, but its low occurs at 52.02% and its high at 39.97%. Normalized driven distance approximates station alignment. At La Monumental the measured game bank is 13.50°, matching the operator’s 24% crossfall (13.496°). Built grades span −6.73% to +5.44%; all 1,336 nodes passed both shoulder checks and track verification found zero folds or unsafe models. [Operator](https://www.madring.com/en/circuit) · [Car 1, lap 18](https://api.openf1.org/v1/location?session_key=11365&driver_number=1&date%3E=2026-09-12T14%3A58%3A42.680000%2B00%3A00&date%3C=2026-09-12T15%3A00%3A14.504000%2B00%3A00) · [Car 81, lap 21](https://api.openf1.org/v1/location?session_key=11365&driver_number=81&date%3E=2026-09-12T14%3A58%3A55.180000%2B00%3A00&date%3C=2026-09-12T15%3A00%3A27.474000%2B00%3A00)

An isolated 48-station trial fitted to car 1 gave 0.17 m RMS error against car 81 after removing the vertical datum. The trial failed the scenery gate with 143 unsupported objects (122 in the Monumental seating) and three coplanar spots against a cap of one. Retain the current profile until the stand foundations can be rebuilt with the measured road. No patch.

### Zandvoort

At the built Arie Luyendyk apex (T14), crossfall measures −18.00° across all three lanes. The magnitude matches the operator’s 18° figure, and the outside of this right-hand bend is raised. At Hugenholtz (T3), the inside, centre and outside measure +4.50°, +11.94° and +19.00°. The operator describes a maximum 18° there; the project designer’s previously reported outer-edge value is 19°. Keep the progressive bank and record the 1° disagreement. [Circuit operator](https://www.circuitzandvoort.nl/en/corners/) · [Project designer](https://studiodromo.it/portfolio/zandvoort/)

Hunserug to T5 falls 6.74 m in the game against 6.3–6.6 m in the two qualifying-lap traces. Overall relief is 8.94 m and grades range from −6.64% to +6.41%. All 1,054 pairs of shoulders passed and track verification found zero folds or unsafe geometry. No circuit change recommended. [2024 qualifying laps](https://api.openf1.org/v1/laps?session_key=9578&driver_number=4)

### Jeddah

Turn 13 reaches +7.00° at lap fraction 0.3539, raising the outside edge of this left-hander by 12.28 cm per metre across the road. Circuit designer Carsten Tilke specifies 12% crossfall, equivalent to 6.84°, and Honda independently describes approximately 12%. Pirelli gives 12° for the same corner. The game differs by 0.16° from the designer’s figure and 5.00° from Pirelli’s. Retain the designer-supported setting pending an as-built cross-section. [Designer interview](https://racingnews365.com/jeddah-architect-explains-why-different-strategies-might-be-possible) · [Honda circuit guide](https://global.honda/en/F1/circuit/jeddah-corniche-circuit/) · [Pirelli preview](https://press.pirelli.com/2022-saudi-arabia-grand-prix---preview/)

The 1,540-node road has 2.20 m of relief, grades from −0.45% to +0.45%, and signed banking from −6° to +7°. The earlier 48 terrain samples span 0–4 m; the exact road elevation remains unverified. Both shoulders passed at every node. Track verification found zero surface folds and zero invalid or unsafe diagnostics. No circuit change.

### Albert Park

Verstappen’s pole lap (302 positions) and Sainz’s final qualifying lap (304) each span 2.5 m on the 2024 layout. Both put the low on the pit straight at 2.9–3.0% of the lap, the crest on the approach to T11 at 71.6–71.8%, and T11 about 1.5 m above the timing line. The original 1.00 m profile put T11 level with the line and the crest at 22.2%. [Verstappen positions](https://api.openf1.org/v1/location?session_key=9484&driver_number=1&date%3E=2024-03-23T05%3A58%3A15.936000%2B00%3A00&date%3C=2024-03-23T05%3A59%3A31.851000%2B00%3A00) · [Sainz positions](https://api.openf1.org/v1/location?session_key=9484&driver_number=55&date%3E=2024-03-23T05%3A58%3A28.514000%2B00%3A00&date%3C=2024-03-23T05%3A59%3A44.699000%2B00%3A00)

Fit a smooth lap-distance profile to Verstappen’s run. The built road spans 2.39 m, crests at 71.86% and puts T11 1.37 m above the line. Height RMS error against Sainz decreased from 0.88 to 0.17 m. Both drivers use the positioning feed’s circuit map, and the measurements do not establish corner crossfall. Retained −3.00° to +3.50° banking. The revised grade ranges from −0.83% to +0.81%. All 1,315 nodes passed shoulder checks. Seating the spectator-deck mats at the local turf height preserved the existing two buried ramp flags (0.03 m), with zero unsupported or horizontal coplanar spots. Track verification found zero folds or invalid/unsafe placements.

### Shanghai

Formula 1 places T2 7.4 m above the low point on the long back straight. The built T2 and back-straight midpoint are level, and the game’s 6.50 m crest comes between T8 and T9. Fresh OpenF1 positions for Piastri’s and Russell’s fastest 2025 qualifying laps both span 7.1 m, with their maximum at 13.1–13.2% of driven distance. Their lap-distance stations still need registration to the built centreline before fitting local gradients. A previous T2 crest trial left 97 unsupported scenery primitives, so the elevation correction requires coordinated scenery work. [Formula 1 circuit profile](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [Piastri positions](https://api.openf1.org/v1/location?session_key=9994&driver_number=81&date%3E=2025-03-22T07%3A58%3A40.095000%2B00%3A00&date%3C=2025-03-22T08%3A00%3A10.736000%2B00%3A00)

All 1,354 nodes passed both shoulder checks. Built grades range from −1.70% to +1.70% and edge banking from −4.00° to +5.00°. The existing fold at node 702 remains; the track verifier passed with zero invalid or unsafe diagnostics. Retain the current banking estimates pending measured crossfalls.

### Miami

The built Turnpike chicane rises 3.05 m from T13 to T15 and drops 1.42 m to T16. A fresh query of Leclerc’s 340 positions from 2024 qualifying, matched by XY to the corner markers, gives a 3.10 m rise and 1.50 m drop. The two differences are 0.05 m and 0.08 m respectively. The game’s +2.79% grade at T14 and −2.02% at T15 put the crest between the apexes. [Qualifying positions](https://api.openf1.org/v1/location?session_key=9498&driver_number=16&date%3E=2024-05-04T20%3A51%3A11.151000%2B00%3A00&date%3C=2024-05-04T20%3A52%3A38.533000%2B00%3A00) · [Corner coordinates](https://api.multiviewer.app/api/v1/circuits/151/2024)

All 1,342 nodes passed the banking and shoulder checks. The track verifier reported zero folds and zero invalid or unsafe geometry. Retain the current chicane profile. The rest of the lap is largely flat in the build; smaller elevation variations and the −3.0° to +3.5° authored crossfalls remain unverified.

### Imola

The 2025 qualifying laps of Verstappen (288 positions) and Piastri (282) each span 34.4 m vertically. I registered each lap independently to the built centreline in plan view (4.5–5.2 m RMS), then compared provider altitude at the nearest stations. Acque Minerali T11 sits 11.3 m above the timing line on both laps. The old build put it 6.67 m below. Piratella T9 was +10.86 m against about +32.2 m. Pirelli describes approximately 30 m of overall relief. The two drivers share a provider coordinate system, so lap-to-lap agreement measures repeatability. [Verstappen positions](https://api.openf1.org/v1/location?session_key=9983&driver_number=1&date%3E=2025-05-17T15%3A32%3A36.645Z&date%3C=2025-05-17T15%3A33%3A51.349Z) · [Piastri positions](https://api.openf1.org/v1/location?session_key=9983&driver_number=81&date%3E=2025-05-17T15%3A31%3A30.816Z&date%3C=2025-05-17T15%3A32%3A45.486Z) · [Pirelli](https://press.pirelli.com/formula-1-returns-to-europe-for-an-appointment-with-history/)

The patch fits 64 cosine elevation zones to Verstappen's lap in the game’s actual basis. It maps sample zero through the authored origin back to the timing line. Independent timed-lap RMS falls from 7.83 to 0.10 m after datum alignment. On the 1,218-node runtime build, T11 is +11.53 m, T9 is +32.09 m and relief is 34.44 m. Signed grade spans −8.75% to +8.80%. Crossfall remains an estimate (−1.50° to +1.50°). All edge-continuity samples pass. The game VM reproduced the five landmark assertions and a maximum 0.098 m shoulder gap at the 480 foundation probes.

The pit-side stand moves about 19 m along the straight to clear its lowest seating row. The grove at fraction .345 moves outboard of the spectator bank. Track verification and the slope-gravity/road-following VM test pass, as do the definition fingerprint, ground, float, clip, and default/overhead coplanar gates. Ground reports six pre-existing buried strips, one unsupported memorial component and 13 advisory footprints. Clipping retains one severe and one minor spot within baseline. No browser screenshots were captured in this worktree.

### Montreal

The old road rose 3.20 m and crested at lap fraction 0.060 near T1. Formula 1 marks 17.8 m between T2 and T3 and 12.6 m between T12 and T13. Sampling its altitude graphic at 48 lap intervals gives the revised 1,087-node road 5.20 m of relief, a crest at 0.125 and a low at 0.792. Signed grades range from −4.68% to +4.85%. These local grades are interpolated estimates. The 48 Open-Meteo terrain samples span 4–17 m across the island. Neither source measures pavement crossfall, so banking remains an estimate (−3° to +3°, zero shoulder discontinuities). [Formula 1 elevation graphic](https://media.formula1.com/image/upload/c_lfill,w_1000/q_auto/v1740000001/content/dam/fom-website/manual/Misc/Topography/canada.webp) · [Terrain API](https://api.open-meteo.com/v1/elevation?latitude=45.513626,45.497132&longitude=-73.527556,-73.522992)

Integrate the profile and revision bump. Moving the T1 grandstand 22 m back along the approach keeps two risers and 11 spectators above terrain. The garden beds now use local ground heights. Verify-track, ground, float, clip, both coplanar gates and all seven definition-factory tests pass. Two riverbank slabs remain buried, with 14 advisory footprint warnings and 14 minor clipping spots. There are zero folds, invalid or unsafe placements, severe clips, unsupported primitives, floating clusters, or coplanar spots.

### Redbull

**Red Bull Ring — corrected the climb to Remus.** The circuit publishes 65 m of relief, +12% maximum climb and −9.3% maximum descent. Independently sampled Verstappen and Norris qualifying laps each span 63.4 m. Their T3 heights are 62.0 and 62.3 m above the lap low. The original road spanned 53.24 m and reached T3 only 48.79 m above the low. [Circuit profile](https://www.redbullring.com/en/track/red-bull-ring-f1-motogp-track/) · [Circuit facts](https://www.redbullring.com/en/events-tickets/formula-1/formula-1-circuit/) · [Verstappen locations](https://api.openf1.org/v1/location?session_key=9541&driver_number=1&date%3E=2024-06-29T14%3A58%3A29.286000%2B00%3A00&date%3C=2024-06-29T14%3A59%3A33.600000%2B00%3A00) · [Norris locations](https://api.openf1.org/v1/location?session_key=9541&driver_number=4&date%3E=2024-06-29T14%3A59%3A13.272000%2B00%3A00&date%3C=2024-06-29T15%3A00%3A17.990000%2B00%3A00)

The 64-station profile fits Verstappen's relative altitude. Both traces were registered in plan and projected onto the built road. Plan registration RMS was 11.6–12.4 m. The held-out Norris lap's relative elevation RMS improves from 3.80 m to 0.49 m. Built relief is 63.75 m, T3 is 61.22 m above the low, and signed grades reach −8.36% and +11.49%. The built crest sits at 32.25% of the lap versus 31.69–31.78% in the feeds, about 20–24 m later. The 1,073 road nodes have zero shoulder mismatches. Banking still spans −4° to +4° and remains an estimate because a single vehicle trajectory cannot determine crossfall.

One collinear point on the existing approach chord resolves a resampling fold at T3. The farmhouse and a motorhome were moved 2 m outward for ground clearance. The final build has zero folds, an 8.83 m minimum bend radius, zero clips and zero elevated scenery clusters. The ground gate reports three established buried backdrop primitives, zero unsupported and zero flat-coplanar. The overhead suite (seven tests), signed-grade and T3 regression, and definition golden pass. The patch updates the browser foundation bounds to the measured relief and crest stations.

The integrated camera regression identified one 15 m pine whose canopy intersected the 25%-lap orbit ray on the corrected climb, reducing modeled transmittance to 0.20. An opening in the near treeline removes two instances. Both existing orbit clearance assertions now pass at all four hot stations. Track geometry, clipping and floating-cluster checks pass after this correction.

### Hungaroring

**Hungaroring — corrected the T2–T4 basin.** Registered 2024 qualifying position samples to the built road in the horizontal plane and interpolated altitude at the three authored corner stations. Norris and Piastri both descend 14.6 m from T2 to T3 and climb 8.3 and 8.4 m to T4. Each lap spans 34.8 m. The circuit operator publishes 36 m relief and peak grades of −7.0% / +6.2%. [Norris lap](https://api.openf1.org/v1/location?session_key=9562&driver_number=4&date%3E=2024-07-20T15%3A02%3A04.274000%2B00%3A00&date%3C=2024-07-20T15%3A03%3A19.501000%2B00%3A00) · [Piastri lap](https://api.openf1.org/v1/location?session_key=9562&driver_number=81&date%3E=2024-07-20T15%3A06%3A50.677000%2B00%3A00&date%3C=2024-07-20T15%3A08%3A05.926000%2B00%3A00) · [Operator guide](https://hungaroring.hu/src/Hungaroring_F1_Guidebook_2018_WEB.pdf)

The road previously dropped 9.43 m and climbed 2.90 m. The revised bake drops 12.55 m and climbs 8.07 m, with total relief moving from 30.14 to 36.79 m. Signed grades now span −5.95% to +5.96%. The grade cap leaves about 2 m of descent unresolved. All 1,091 road nodes passed the signed shoulder check, with authored bank ranging from −3.5° to +6°. Vehicle position alone cannot establish bank angle.

Track build found zero surface folds, invalid objects or unsafe objects. Grounding passed with zero buried and zero unsupported primitives, one flat-coplanar spot and 18 footprint advisories. There were zero elevated clusters and one severe clipping spot within the existing baseline. The patch preserves the correction on rebake and adds corner-height regression coverage.

### Baku

The rebuilt road gains 26.80 m from the seafront to T13. At T8 it is 5.18 m above the boulevard and climbing at 4.24%. Formula 1 reports the ascent around T8, the high point at T13 and 26.8 m overall relief. Leclerc’s 2024 qualifying pole lap independently spans 26.8 m across 394 recorded positions. Its highest sample occurs at 54.68% of distance along the driven line, compared with the game’s T13 marker at 52.90% of its centreline. Differences in stationing and the game’s shorter lap limit a point-by-point comparison. Retain the relief and named crest; the detailed slope through the castle district and transverse camber remain approximate. [Formula 1 profile](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [Qualifying positions](https://api.openf1.org/v1/location?session_key=9594&driver_number=16&date%3E=2024-09-14T12%3A59%3A01.688%2B00%3A00&date%3C=2024-09-14T13%3A00%3A43.053%2B00%3A00)

Signed grades range from −5.33% to +5.39% with zero authored banking. All 1,475 nodes passed both shoulder checks. The track verifier found zero folds and zero invalid or unsafe geometry.

### Mexico

Mexico City’s previous surface put Turn 17 1.27 m above the timing line. After registering two 2024 qualifying laps to the built circuit in plan, both put the corner about 0.5 m below the line (median within ±1% of a lap). The revised 40-knot smooth profile puts it 0.65 m below in the game’s 240-station sampler. Sainz’s lap 20 supplied the fit. Against Verstappen’s separate lap 17, estimated vertical RMS error drops from 1.05 m to 0.13 m. Median horizontal registration residuals were 2.8 m and 2.7 m. Both cars used the same positional feed, so this is a repeatability check rather than an independent pavement survey. [Sainz position API](https://api.openf1.org/v1/location?session_key=9621&driver_number=55&date%3E2024-10-26T22:03:53.895&date%3C2024-10-26T22:05:09.841) · [Verstappen position API](https://api.openf1.org/v1/location?session_key=9621&driver_number=1&date%3E2024-10-26T22:04:05.322&date%3C2024-10-26T22:05:21.493)

The 1,072-node road has 2.804 m relief, consistent with Formula 1’s 2.8 m. Signed grade ranges from −0.878% to +0.839%. Shoulder-height continuity checks passed at all 2,144 edges. Banking spans −3.5° to +6° and remains an estimate because the position feed contains no paired road-edge heights. A regression now checks T17’s sign and height relative to the line. [Formula 1](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc)

The new elevation revealed a 50 m² overlap between a Peraltada floodlight pad and a grandstand. The two pads now sit behind the stands and terrace. Track verification and ground, clip, vertical coplanar, overhead coplanar and float gates pass. Five minor clips, 13 partial footprint advisories and two baselined float clusters remain. The sampler assertions were exercised against the built track in Node. Browser execution is pending integration.

### Qatar

Two 2024 qualifying laps each span 4.2 m vertically. The previous road spanned 6.50 m and put Turn 5 3.94 m above the start. In both traces the Turn 5 neighborhood lies 0.70–0.85 m below the line. The revised road puts T5 0.75 m below and T16 2.19 m above the start, versus +2.10–2.20 m measured at T16. The 32 overlapping cosine functions were fitted to Verstappen lap 21 after matching XY to the circuit, then checked independently against Russell lap 23. On the held-out lap, centered RMS height error falls from 2.14 m to 0.10 m. Position telemetry measures the car, so its 0.1 m vertical quantization and the racing line limit pavement precision. [Verstappen locations](https://api.openf1.org/v1/location?session_key=9646&driver_number=1&date%3E=2024-11-30T18%3A59%3A28.120Z&date%3C=2024-11-30T19%3A00%3A48.640Z) · [Russell locations](https://api.openf1.org/v1/location?session_key=9646&driver_number=63&date%3E=2024-11-30T18%3A51%3A23.933Z&date%3C=2024-11-30T18%3A52%3A44.508Z)

The rebuilt 1,348 nodes span 4.04 m, with grades −1.06% to +0.66%. The estimated ±4° banking remains, with continuous shoulder height at all 2,696 edges. Track, ground, clipping, vertical/overhead coplanarity and floating-cluster checks pass. Grounding reports eight buried elements, one unsupported element and 35 footprint warnings. Clipping reports two minor overlaps. The Qatar driving VM passes its uphill, downhill and road-following checks. All seven circuit-definition factory tests pass.

### Abudhabi

The previous 9.00 m profile crested at 66.11% lap near the marina. The rebuilt road now crests at 13.80%, the physical Turn 3 sweep, with 11.15 m lap relief and grades from −3.50% to +4.54%. Formula 1 lists Turn 3 as the high point with 10.7 m lap relief on the earlier layout. [Formula 1](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc) · [2024 corner map](https://api.multiviewer.app/api/v1/circuits/70/2024)

I aligned 2024 qualifying car positions to the built XY centreline and projected them to its 1,319 nodes. Norris and Piastri independently put the crest at 13.87% and 14.03% with relief of 10.97 and 10.95 m. A smoothed fit to Norris gives 0.19 m RMS vertical difference against Piastri, down from 3.59 m. Horizontal registration RMS was 4.4 and 4.2 m. Both laps share the positioning system, and neither measures transverse camber. The existing bank remains −3° to +5° with zero shoulder continuity failures. The game's numbered T3 marker still sits at 24.4%, distinct from the mapped opening T3 sweep. [Norris lap](https://api.openf1.org/v1/location?session_key=9658&driver_number=4&date%3E=2024-12-07T15%3A01%3A59.489000%2B00%3A00&date%3C=2024-12-07T15%3A03%3A22.084000%2B00%3A00) · [Piastri lap](https://api.openf1.org/v1/location?session_key=9658&driver_number=81&date%3E=2024-12-07T15%3A01%3A27.313000%2B00%3A00&date%3C=2024-12-07T15%3A02%3A50.117000%2B00%3A00)

Removed painted floodlight pools and nearshore bars intersecting the reshaped terrain. The south stand uses its attached fascia, the roofless bleacher no longer emits suspended roof trim, and the pit-exit stand's end-wall avoids intersecting its rear fascia. Added a regression for crest position and relief on the built road.

Verification passed all 19 circuit-definition tests, verify-track, ground, clipping, vertical and overhead coplanar, and floating-prop gates. The initial patch exposed two flat-coplanar spots where the marina hedge overlapped itself at racing fractions 0.752 and 0.775. Breaking the hedge around those bends removed both. Final ground counts are zero buried, zero unsupported and zero flat-coplanar, below the parent allowance of one. Three minor clipping spots and 37 advisory footprint warnings remain. No surface folds, severe clips, vertical or overhead coplanar spots, or elevated clusters.

### Hockenheim

Formula 1’s longitudinal chart puts the 152.5 m high near Turn 2, 4.3 m above the 148.2 m pit straight. On the built road the crest is +4.299 m at 17.89% lap distance. The second crest into the Spitzkehre is +3.864 m at 45.46%, within 0.1 m of the approximately +3.8 m read from the chart. Retain the profile. The game’s numbered marker at the hairpin reads T5 while the chart calls it T6. Use the physical hairpin to compare profiles. [Formula 1 elevation chart](https://media.formula1.com/image/upload/c_lfill,w_1000/q_auto/v1740000001/content/dam/fom-website/manual/Misc/Topography/germany.webp)

The 1,135-node rebuild produced grades of −3.23% to +2.23% and road bank of −4.00° to +2.50°. Both shoulders passed at every node, and track verification found zero surface folds, invalid placements or unsafe placements. The longitudinal chart provides no crossfall measurement for Sachskurve, so the bank there remains an estimate.

### Nurburgring

The circuit operator gives 627.75 m for the crest at the beginning of the main straight and 620.39 m for the start/finish straight, a 7.36 m difference. The built crest to the game's start line is 8.26 m, 0.90 m greater. The sheet does not locate the 620.39 m measurement precisely along the straight. Its Mercedes-Arena section specifies 7.7 m of relief over a 710 m ideal line. The built 710 m window from 0.5% of the lap, before T1, spans 7.59 m. Moving that window upstream by 25.6 m gives 8.08 m, illustrating the sensitivity to its unspecified endpoints. The modeled T2 apex crossfall is +1.43° and agrees in magnitude with the section specification of 2.5%. Direction and the progression through T1–T4 remain estimates. [Operator fact sheet, p. 5](https://www.motor-kritik.de/sites/default/files/Fakten_N%C3%BCrburgring_allgemein.pdf)

Retain the present geometry. The road has 50.50 m relief, grades of −5.48% to +5.75%, and bank angles from −4.50° to +4.00°. The 48-point terrain reference spans 56 m, with insufficient pavement resolution for a local correction. Both shoulder sweeps passed on all 1,278 built nodes, and track verification returned zero folds, invalid elements or unsafe placements, with one scenery-suppression warning. [Elevation API documentation and terrain resolution](https://open-meteo.com/en/docs/elevation-api)

### Catalunya

Retain the Barcelona road profile fitted to Norris’s qualifying lap. A separate 2024 qualifying lap by Verstappen returned 280 positions with 30.0 m of relief. Registering its closed horizontal racing trajectory by normalized distance puts T1 at −7.48 m and T12 at +20.28 m relative to the line. The game rises 27.19 m between those two apexes against 27.76 m in the trace. The full built lap spans 28.90 m, compared with Formula 1’s published 29.6 m from the T1 low point to the high point after T12 on the older layout. The two apexes and the two extrema are distinct comparisons. [Verstappen’s lap](https://api.openf1.org/v1/laps?session_key=9535&driver_number=1&lap_number=11) · [Position samples](https://api.openf1.org/v1/location?session_key=9535&driver_number=1&date%3E=2024-06-22T14%3A59%3A13.760000%2B00%3A00&date%3C=2024-06-22T15%3A00%3A25.163000%2B00%3A00) · [Formula 1 profile](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc)

The built road’s signed grades range from −6.15% to +6.57%, and the signed bank ranges from −4.50° to 0°. Both shoulders passed at all 1,163 nodes. Track verification found zero surface folds, invalid diagnostics or unsafe diagnostics, and seven suppressed trees. Crossfall remains estimated because the vehicle-position feed follows one racing trajectory.

### Sepang

Formula 1’s profile places Turn 3 at 27.7 m and Turn 11 at 49.7 m. Its terrain landmarks were cross-checked on the geographic centreline. A fresh elevation API query returned 23 and 44 m at the two corresponding terrain posts. These are coarse ground heights with different absolute elevations. I fitted the published chart’s smaller rises and falls between the landmarks, using the 22 m difference to set the vertical scale. [Formula 1 profile](https://media.formula1.com/image/upload/content/dam/fom-website/manual/Misc/Topography/malaysia.webp) · [Elevation API query](https://api.open-meteo.com/v1/elevation?latitude=2.763496,2.756636&longitude=101.733469,101.738695)

At lap fractions 0.15625 and 0.58333, the built road now climbs 21.97 m against the published 22 m. It previously climbed 0.33 m there. Overall relief increased from 9.50 to 22.00 m, the low is at 15.84% and the crest at 58.36%. Grades range from −5.14% to +5.32%. All 1,376 nodes passed both shoulder and planner checks. The signed road bank spans −4° to +3°. The final hairpin remains flat in game. Dromo documented adverse camber after the 2016 works but the reported 1 m kerb lift does not establish the finished transverse angle. [Dromo interview](https://www.motorsport.com/f1/news/analysis-why-revamped-sepang-means-step-into-unknown-for-f1-teams-830812/830812/)

Moved the paddock service vehicles and broadcast compound and brought two guardrail runs onto the graded verge. The track rebuild and all 26 circuit-definition and factory tests passed, including a new check of the T3–T11 rise. One grandstand suppression persists.

All scenery gates passed. There were zero buried or unsupported props, severe clips, vertical or overhead coplanar spots, or elevated clusters. A generic palm crown overlapped the authored plantation at 78.3% lap. A 33 m exclusion for generic foliage on the right verge cleared the horizontal coplanar pair. Three minor clips and 12 footprint advisories remain.

### Istanbul

The built lap now spans **46.00 m**, up from 21.00 m. Its grades reach −8.14% and +8.14%. From the exit of Turn 8 to Turn 9 the built road descends **37.24 m** over the corresponding 650 m design interval, compared with 37.5 m published and 5.82 m previously. The following 280 m design interval rises **19.04 m**, compared with 19.68 m from its published 7.03% grade and 3.33 m previously. The opening climb from the first valley toward Turn 3 rises 33.76 m, against 34.8 m published and 4.20 m previously. [METU study, §1.3 and Fig. 1.1](https://etd.lib.metu.edu.tr/upload/12608091/index.pdf) · [Midland F1 lap relief](https://www.f1technical.net/news/3751) · [Circuit operator and maximum grade](https://tosfedistanbulpark.com/en/the-circuit/)

The fit used the three published sector height changes, the published grade and relief limits, and 48 Open-Meteo terrain samples on the OSM alignment. The terrain samples guide the intervening shape. The design drawing uses a 5,377 m station axis, the operator lists a 5,338 m racing lap, and the built centreline is 5,251 m. The Turn 9 measurements register to the built apex at 62.34% of the lap. The opening climb uses the valley and crest in the terrain trace. These figures measure how well the game reproduces the fit inputs. [Terrain dataset](https://open-meteo.com/en/docs/elevation-api) · [Mapped circuit](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/tr-2005.geojson)

The study describes Turn 1 as tilting outward. The patch reverses the previous inward bank there. Its peak magnitude of 4° and the Turn 8 peak of 7° remain estimates. Both shoulders passed the height, bank and tangent checks at all 1,313 nodes. Two motorhomes were seated on the pit straight and an overlapping pit stand end wall was removed. All 26 circuit-definition and factory tests passed, including new regressions at Turns 1 and 9.

The build verifier, ground, clip, vertical and overhead coplanar, and floating-prop gates all passed. The track has zero surface folds, zero clipping spots and zero floating clusters. Four buried primitives, 16 advisory footprint warnings and 12 tree suppressions remain.

### Paul Ricard

The earlier profile reproduces 29.82 m of longitudinal relief. At Signes, the built centre is 8.12 m above start, against 8.02 m from the IGN terrain service (434.46 m at the apex and 426.44 m at start). Centreline grades run from −6.56% to +6.73%.

The updated banking uses nine IGN transverse sections across each of Verrerie, Signes and Le Beausset, covering about 40 m around each corner. For each section the API sampled positions 5 m either side along the built road’s right vector. At the three central sections the heights change by +0.05 m, −0.35 m and −0.11 m across 10 m. Fitting the existing corner envelopes to the sections gives signed peak banks of +0.4°, −1.4° and −0.8° respectively. Mean absolute angular differences across the sections fall from 2.37°, 2.44° and 2.57° to 0.17°, 0.33° and 0.22°. The IGN terrain grid smooths small surface features and gives variable vertical accuracy, so individual crossfall and crowns remain approximate. [Verrerie](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&lon=5.7864160%7C5.7863869%7C5.7863579&lat=43.2544809%7C43.2545205%7C43.2545601&zonly=false) · [Signes](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&lon=5.8037495%7C5.8036896%7C5.8036298&lat=43.2476831%7C43.2476938%7C43.2477046&zonly=false) · [Le Beausset](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&lon=5.8018879%7C5.8019196%7C5.8019512&lat=43.2471201%7C43.2471587%7C43.2471972&zonly=false)

The rebuilt road passed both shoulder checks at all 1,453 nodes.

Track, ground, clipping, vertical and overhead coplanar, and floating-prop checks passed. There were zero folds, severe clips, elevated clusters, buried or unsupported props. The gates retain six flat-coplanar spots, twenty minor clipping spots and fifteen advisory footprint warnings.

### Portimao

Portimão's previous terrain fit lost both midfield descents. The game dropped just 0.12 m from T8 to T9 and 2.21 m from T11 to T12. After registering the 2021 Portuguese qualifying positions to game XY, the Bottas and Hamilton laps give 5.17–5.25 m and 14.64–14.67 m respectively, using median heights within 0.4% of each apex. The game now descends 5.32 m and 14.40 m. Relative elevation error against Hamilton fell from 3.31 m to 0.18 m RMS, after fitting Bottas alone. Both use the same timing feed. [Bottas lap 18](https://raw.githubusercontent.com/TracingInsights/2021/main/Portuguese%20Grand%20Prix/Qualifying/BOT/18_tel.json) · [Hamilton lap 12](https://raw.githubusercontent.com/TracingInsights/2021/main/Portuguese%20Grand%20Prix/Qualifying/HAM/12_tel.json)

The 1,157-node surface spans 28.32 m against 28.72 m on both driven laps. Its steepest descent is 14.79% versus 5.49% before. Aston Martin identifies a 16% peak downhill and names both midfield dips in its race guide. The peak climb is 9.26%. Game banking remains −4° to +4.5° with zero shoulder discrepancies at 2,314 edges. The circuit operator lists a maximum 8% bank (4.57°) for its 4,684 m configuration. Neither qualifying lap measures transverse camber or validates the sign at individual turns. [Aston Martin](https://www.astonmartinf1.com/en-GB/races/2021-portuguese-gp) · [Circuit operator](https://autodromodoalgarve.com/the-park/racing-track/)

The windmill was seated 28 m nearer the road, the right T8 rail moved 1 m inward, and a short terrace and scrub section were cleared. The final build, shoulder, grounding, clipping, vertical and overhead coplanar, and float checks passed. No folds, buried props, unsupported props, severe clips, coplanar spots or floating clusters remain. One minor clip, 14 advisory footprint warnings and 24 unjudged footprint samples remain. The measured-drop regression, densified grade check and all seven definition-factory tests passed.

### Sochi

Formula 1's elevation chart places the low at physical Turn 14 and the crest at Turn 17. Both corners were level in the previous model, despite its correct total relief. The revised road follows 72 heights read from that chart, with the horizontal axis matched at identifiable corner apexes and vertical scale set by the FIA's 21.4–23.3 m range. The rebuilt road gains 1.90 m from T14 to T17. [Published chart](https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000001/content/dam/fom-website/manual/Misc/Topography/russia.webp) · [FIA media kit, p. 4](https://www.fia.com/sites/default/files/2019_russian_media_kit_eng_1-min.pdf) · [FIA corner map](https://www.fia.com/sites/default/files/decision-document/2021%20Russian%20Grand%20Prix%20-%20Circuit%20Map.pdf)

Sainz and Norris's 2021 qualifying position traces independently show 1.60 and 1.62 m of rise from physical T14 to T15. The game now gains 1.47 m across that section, previously 0 m. At T17 the samples nearest the mapped apex were 2.2 and 13.1 m away in plan, so the chart supplies the more precise peak reference. Closely spaced corner markers in the game use different numbering around T13–T14. Relative rise is pinned at the physical positions. [Sainz lap 24](https://raw.githubusercontent.com/TracingInsights-Archive/2021/main/Russian%20Grand%20Prix/Qualifying/SAI/24_tel.json) · [Norris lap 23](https://raw.githubusercontent.com/TracingInsights-Archive/2021/main/Russian%20Grand%20Prix/Qualifying/NOR/23_tel.json) · [Corner positions](https://raw.githubusercontent.com/TracingInsights-Archive/2021/main/Russian%20Grand%20Prix/Qualifying/corners.json)

Built relief is 1.90 m, signed grades range from −1.46% to +2.80%, and both shoulders pass at all 1,449 nodes. Signed banking remains an estimate at −5° to 0°. The scenery adjustment moves a buried rail footing at T13 and clears paving and hedge overlaps at the approach planting bed. Ground verification reports zero buried or unsupported props, one flat-coplanar spot, and 18 footprint advisories.

All six track and scenery gates passed. The clipping audit reports nine minor spots (eight on the previous profile) and zero severe spots. Vertical and overhead coplanarity and elevated-cluster counts are zero. The built-profile regression and all seven factory tests passed.

### Mugello

The previous road rose 1.89 m from Poggio Secco (T3) to Arrabbiata 1 (T8). Mugello’s published corner heights, 285.50 m and 247.96 m, give a 37.54 m descent. The revised road descends 36.03 m, then climbs 23.08 m to Scarperia against the published 24.74 m. We fitted a smooth loop to the 15 named corner heights and used local terrain to guide the unlabelled return straight. After aligning vertical origins, RMS error at those fit stations falls from 12.81 m to 0.71 m. A separate terrain API check near 20.8% and 43.8% of the lap gives a 35 m descent against 33.83 m on the rebuilt road. [Circuit technical map](https://mugellocircuit.cronorapino.it/downloads/MAPPE%20CIRCUITO/Cartina%20Tecnica.pdf) · [Terrain sample](https://api.open-meteo.com/v1/elevation?latitude=44.000669,43.992572&longitude=11.377208,11.369612)

Built relief increased from 21.00 m to 37.66 m. The separate circuit sheet states 42.86 m, leaving 5.20 m of unresolved relief between labelled stations. Grades run from −7.19% to +6.25%, compared with 6.85% maximum gradient on that sheet. Banking spans −5.0° to +4.5° and remains estimated. Both shoulder tests passed at all 1,307 nodes. [Circuit sheet](https://mugellocircuit.cronorapino.it/downloads/MAPPE%20CIRCUITO/Mugello3Intermedi.pdf)

Stepped spectator terraces and vineyard strips now sample the ground beneath each row or segment. All six road and scenery gates passed, with zero folds, unsupported props, floating clusters or coplanar spots. Two buried stand primitives, four minor clips and 18 advisory footprints remain. The two circuit-definition suites passed all 26 tests, including a regression for the T3–T8 descent.

### Magny Cours

The rebuilt 1,105-node road uses 64 arc-length samples from France’s IGN RGE ALTI terrain service along the [Magny-Cours circuit trace](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/fr-1960.geojson). Lap relief is 30.00 m, up from 25.73 m. Separate queries on the trace at named corners place Adelaide 15.58 m above the timing line and Château d’Eau 18.92 m above it. The built rises changed from 11.43 to 15.40 m and from 14.79 to 18.87 m respectively. Estoril is 10.24 m below the line against IGN’s 10.00 m. Signed game grades range from −4.20% to +5.05%. [Timing line](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=3.1619101%7C3.1619427%7C3.1619752&lat=46.8631322%7C46.8631040%7C46.8630758) · [Estoril](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=3.1655922%7C3.1656445%7C3.1656968&lat=46.8675646%7C46.8675611%7C46.8675576) · [Adelaide](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=3.1677376%7C3.1677385%7C3.1677394&lat=46.8598412%7C46.8598772%7C46.8599131) · [Château d’Eau](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=3.1665781%7C3.1665346%7C3.1664910&lat=46.8591517%7C46.8591718%7C46.8591920)

Across 8 m transverse sections, positive angles raise the right edge. Game crossfall now measures +1.50° at Grande Courbe against IGN’s +1.58° and −2.64° at the Adelaide apex against −2.79° (previously −0.13°). Nine transverse sections around Grande Courbe, 24 along the Adelaide approach and hairpin, and nine on the approach to Château d’Eau give mean absolute bank errors of 0.26°, 0.65° and 0.31°, down from 1.38°, 1.25° and 2.19°. Cross-sections use the nearest OSM centreline point and the built right vector. The terrain grid and the trace-to-game offset of up to 3.34 m limit precision. Surfaces outside the sampled sectors retain their existing bank estimates. [Grande Courbe](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=3.1658748%7C3.1659227%7C3.1659705&lat=46.8654558%7C46.8654410%7C46.8654261) · [Adelaide approach](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=3.1680886%7C3.1680383%7C3.1679881&lat=46.8603036%7C46.8603142%7C46.8603247) · [Château d’Eau approach](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=3.1661821%7C3.1661296%7C3.1660772&lat=46.8606327%7C46.8606304%7C46.8606282)

Both shoulders passed at every built node. The revised profile includes a regression for the two measured climbs.

Track verification, grounding, clipping, vertical and overhead coplanarity, and floating-prop gates all passed. The build has zero surface folds, buried or unsupported scenery, clipping spots or elevated clusters. Grounding retains one horizontal coplanar spot within the existing baseline, 18 footprint advisories and 116 unjudged samples.

### Estoril

The operator confirms the game’s 11-turn Tanque variant at 4,163 m. The previous model used the 13-turn GP length in its metadata, and its road descended 9.06 m between T7 and the Parabólica Ayrton Senna. At the corresponding normalized stations, bilinear sampling of the 30 m AWS terrain tile on the geographic trace gives an 18.66 m rise. The coarser Open-Meteo terrain series independently gives a 24.30 m rise. The rebuilt road now climbs 16.53 m. Both terrain grids include off-road contributions and cannot resolve the exact asphalt height or transverse camber. [Tanque map](https://circuitoestoril.alkamelsystems.com/Results_NoticeBoard/12_2025/01_ANPAC%20START%20SEASON/Mapa%20da%20Pista%20circuito%20estoril%20CURVA%20TANQUE.pdf) · [AWS terrain tile](https://s3.amazonaws.com/elevation-tiles-prod/skadi/N38/N38W010.hgt.gz) · [Open-Meteo bracketing coordinates](https://api.open-meteo.com/v1/elevation?latitude=38.750928,38.751400,38.755240,38.754758&longitude=-9.395312,-9.395977,-9.391133,-9.390377)

The patch uses the existing 64-station elevation baker with 83 geographic trace vertices and cubic SRTM queries. Relief increased from 15.00 m to 18.55 m. Signed grades range from −3.75% to +4.33%, still below the GP variant’s published −5.56% and +6.75%. The raw terrain sources disagree on the height of the deepest hollow, so the exact lap relief remains uncertain. The game’s signed bank ranges from −5° to +3° and remains estimated. Both shoulders passed at every one of 1,035 built nodes. [Mapped loop](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/pt-1972.geojson) · [SRTM query](https://api.opentopodata.org/v1/srtm30m?locations=38.750928,-9.395312%7C38.755182,-9.392092&interpolation=cubic) · [GP technical data](https://www.circuito-estoril.pt/en/technical-data/)

Two control points moved by 0.28 m and 1.41 m to clear hairpin folds on the rebuilt road. The scaffold stands and hillside houses now seat against local terrain. Geometry checks report zero road folds and zero buried or unsupported primitives. There are 13 advisory footprint warnings and 48 unjudged footprint samples.

All six track and scenery gates passed. Clipping found one severe and three minor spots within the existing allowance. The severe spot involves a spectator-terrace tread near 48% of the lap. The floating-prop and vertical/overhead coplanar checks were clear.

### Kyalami

Kyalami retains 43.00 m of relief and the Turn 10 Leeukop crest at 63.3% of the lap, consistent with the 2020 Kyalami 9 Hour programme. Its previous crest was too broad on both approaches to the summit. Narrowing the existing crest envelope from 620 m to 460 m moves the descent into Mineshaft closer to two terrain datasets. [Race programme, p. 12](https://www.readkong.com/page/kyalami-9-hour-welcome-to-the-race-3134028)

At 72.92% of lap distance, fresh bilinear 1-arcsecond SRTM samples show 32.38 m of descent from the near-summit station at 62.50%. Copernicus shows 41 m between the same coordinates, equivalent to 28.90 m when its 61 m range is scaled to the published 43 m relief. The built drop from the Turn 10 apex to that Mineshaft station improves from 22.94 m to 28.75 m. On the approach at 58.33%, the built climb to the apex increases from 8.34 m to 13.85 m, against 13.6 m from SRTM and 15.5 m from scaled Copernicus. Both terrain grids resolve broad features at about 30 m spacing. Their stations and the built apex differ slightly. A new regression checks both sides of the crest. [AWS SRTM tile](https://s3.amazonaws.com/elevation-tiles-prod/skadi/S26/S26E028.hgt.gz) · [AWS southern tile](https://s3.amazonaws.com/elevation-tiles-prod/skadi/S27/S27E028.hgt.gz) · [Copernicus crest and descent samples](https://api.open-meteo.com/v1/elevation?latitude=-25.999833,-25.999419&longitude=28.060534,28.064058)

Signed grade now spans −9.90% to +9.90%. Both shoulders passed at all 1,120 nodes. Signed bank remains −4.50° to +4.00° and lacks transverse survey evidence. Track verification reports zero folds, invalid or unsafe diagnostics. The ground audit records five buried items, no unsupported items and 13 advisory footprint warnings. Clipping records one minor overlap.

All 28 circuit-definition, factory and Kyalami orbit tests passed. Both coplanar checks and the floating-prop audit passed.

### Watkins Glen

The 1971 race report describes the tightened final right as banked. Nine transverse sections from the USGS 1 m elevation service, spanning 48 m around the apex, provide a modern estimate of its magnitude. At the apex the right side is 484.863 m and the left side 485.612 m across 8 m, equivalent to −5.34°. Fitting the existing bank envelope gives a signed peak of −5.8° (previously −4.0°). Mean absolute angular error across the nine sections falls from 1.79° to 1.00°. The 2020 acquisition cannot establish the angle of the 1971 pavement. The club driving guide independently lists 6° for ordinary corners. [1971 report](https://www.motorsportmagazine.com/archive/article/september-1971/32/watkins-glen-6-hours-3/) · [USGS right side](https://epqs.nationalmap.gov/v1/json?x=-76.9287621&y=42.3375053&wkid=4326&units=Meters&includeDate=True) · [USGS left side](https://epqs.nationalmap.gov/v1/json?x=-76.9288143&y=42.3374446&wkid=4326&units=Meters&includeDate=True) · [Club guide, p. 2](https://gvc-bmwcca.org/_Download/Rookie_Chronicles_Part2.pdf)

The rebuilt approach from Turn 2 to Turn 4 climbs 15.11 m. The USGS sections at those stations rise 21.67 m. Across 64 regular centreline stations and 11 corner centres, modern terrain spans 44.29 m, while the club diagram labels a 35.05 m range and the historic game profile spans 31.40 m. The stations cover the Boot and use the historic alignment through the subsequently modified circuit. A period longitudinal survey remains necessary to resolve the discrepancy. [Turn 2](https://epqs.nationalmap.gov/v1/json?x=-76.9245341&y=42.3437069&wkid=4326&units=Meters&includeDate=True) · [Turn 4](https://epqs.nationalmap.gov/v1/json?x=-76.9207433&y=42.3388561&wkid=4326&units=Meters&includeDate=True)

The new runtime regression verifies right-minus-left height across the centre of Turn 11. The centreline retains its −5.13% to +3.90% grade range. Track verification found zero road folds and zero invalid or unsafe diagnostics.

All six circuit and scenery gates passed. Both shoulders passed at 1,356 nodes. No buried, unsupported, floating or coplanar spots were reported. Grounding retains 13 advisory footprint warnings and 29 unjudged samples.

### Indianapolis

The F1 Turn 13 exit at 90.5% lap has a 1.480 m outside-to-inside drop across a 10 m transect on the USGS 1 m terrain model. Its −8.42° crossfall was −5.37° in the previous build. Narrowing the apex envelope and fitting a second envelope over the exit produces −8.26° there, while preserving the nominal 9°12′ peak. Nine additional transects interleaved between the fit stations reduce mean absolute angular error from 1.34° to 0.51°. All samples use the same 2016 dataset. The later IMS guide reports an 8.27° apex at an unspecified lane. [USGS outside](https://epqs.nationalmap.gov/v1/json?x=-86.2386997&y=39.7896619&wkid=4326&units=Meters&includeDate=true) · [USGS inside](https://epqs.nationalmap.gov/v1/json?x=-86.2385907&y=39.7896944&wkid=4326&units=Meters&includeDate=true) · [IMS Turn One](https://www.indianapolismotorspeedway.com/news-multimedia/news/2013/04/04/one-good-turn-indianapolis-motor-speedways-turn-one) · [Period media guide](https://doctorindy.com/wp-content/uploads/2019/06/2007_indy500_media_guide.pdf)

The 1,018-node road retains 3.30 m of longitudinal relief and grades of −0.94% to +0.94%. Both shoulders passed at all nodes. The geometry verifier found zero folds, invalid or unsafe placements. The surveyed exit-span regression and bank-placement check passed. The 2016 model postdates the F1 infield reconstruction, so uncertainty remains in the 2000–07 longitudinal profile. [Historical F1 configuration](https://imsdotcom.azureedge.net/history/formula-one)

Ground, clip, vertical and overhead coplanar and floating-prop gates passed. The ground audit retains 12 footprint advisories with zero buried or unsupported props.

### Buenos Aires

The Buenos Aires municipal 1 m contours cross the built No. 6-S route at 16 distinct stations. The approach to the opening corner crosses from 10 to 8 m at lap fractions 0.0179–0.0673. The rebuilt road descends 2.18 m there, previously zero. From fractions 0.2593 to 0.3165, approaching the infield Turn 6, the contours descend 3 m. The game now descends 2.35 m where it previously climbed 0.90 m. The second valley returns from the 7 m contour at 0.3693 to the 10 m contour at 0.4668, a 3.40 m rise in the game. [City elevation dataset](https://data.buenosaires.gob.ar/dataset/elevacion-terreno) · [Municipal shapefile](https://cdn.buenosaires.gob.ar/datosabiertos/datasets/secretaria-de-desarrollo-urbano/elevacion-terreno/curvas-de-nivel-zip.zip) · [Historic layout maps](https://www.racingcircuits.info/south-america/argentina/buenos-aires.html)

Two raised cosines fit the mapped valleys. After subtracting a common vertical datum, RMS error across the 16 crossings falls from 1.67 m to 0.15 m. The municipal linework postdates the 1995–98 racing layout, and station elevations between contours remain interpolations. The longest gap between crossings spans 46% of a lap. Built relief is 4.30 m with signed grades of −1.16% to +1.16%. Banking remains estimated, from −5° to 0°. All 1,059 nodes passed both shoulder checks and the built surface has zero folds.

Four paddock vehicles moved to level sites on the outer apron. The park-side covered stand moved 21 m along its terrace, which cleared a crowd member previously buried by 0.07 m. All 26 circuit-definition and factory tests and all six geometry and scenery checks passed. Two minor clipping spots and 13 partial-footprint advisories remain. The audits found zero buried or unsupported primitives, flat-coplanar spots or elevated clusters.

### Jacarepagua

The game puts its first crest at T3, 2.00 m above the line. I sampled the original 4,961 m trace at 256 evenly spaced stations on the public 1-arcsecond elevation tile, using bilinear interpolation. At the timing line and corresponding T3 station (27.75% lap), the terrain measures 5.73 and 5.76 m. At the game's basin near 70% lap the terrain reads 5.74 m, while the game falls 1.80 m below the line. The near-zero differences on the raster give little support for either feature. The full raster range of 9.22 m includes changes much shorter than either authored rise. The trace lists a 5,031 m official lap. Its normalized stations approximate the 4,913 m built lap. [Original circuit alignment](https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/br-1977.geojson) · [Elevation tile](https://s3.amazonaws.com/elevation-tiles-prod/skadi/S23/S23W044.hgt.gz)

Retain the 3.80 m lap relief and mark the two broad undulations and T5’s +4.5° bank as estimates. The period circuit occupied drained marshland, and redevelopment substantially altered the site. A terrain raster cannot distinguish bumps or measure historic pavement crossfall. Fresh checks found grades of −0.83% to +0.83%, banks of −3.50° to +4.50°, and zero shoulder discrepancies on all 1,228 nodes. The track and ground gates passed with zero folds, buried objects, unsupported objects or flat overlaps. Grounding retained 15 footprint advisories. [Historical account](https://www.statsf1.com/en/circuit-jacarepagua.aspx) · [Layout and demolition chronology](https://www.racingcircuits.info/south-america/brazil/jacarepagua.html)

### Fuji

Japan’s GSI elevation API returned 1 m laser DEM heights for 126 stations on the built alignment, approximately 36 m apart. Alternating stations supplied the 64-post profile. At the other 63 stations, vertical RMS error relative to the timing line falls from 2.71 m to 0.22 m. Between the ADVAN hairpin and the approach to Dunlop, the road now descends 18.06 m against 18.20 m measured, up from 6.49 m. Built relief is 37.13 m against 37.20 m sampled and the operator’s published 40 m elevation range. Peak grades are −9.38% and +8.70%, compared with −10.05% and +8.88% published. [Fuji Speedway](https://www.fsw.tv/guide/facility/racing.html) · [ADVAN station](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=138.9284257&lat=35.3704381&outtype=JSON) · [Dunlop approach station](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=138.9251834&lat=35.3653827&outtype=JSON)

Three bank zones use 8 m transverse sections. Across nine sections around each apex, mean absolute angular error falls from 1.03° to 0.41° at TGR, 4.05° to 0.44° at ADVAN, and 1.75° to 0.41° at the Dunlop entry. Peak signed bank is −1.2°, +4.2° and −2.0° respectively. The laser DEM reports elevations in 0.1 m increments, which limits the precision of individual transects. All 1,131 nodes pass both shoulder probes. [ADVAN left edge sample](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=138.9281195&lat=35.3705699&outtype=JSON) · [Right edge sample](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=138.9281055&lat=35.3706409&outtype=JSON)

Shortened the adjoining front-straight grandstand sections, cleared a marshal post from the hedge and omitted the middle paddock transporter with buried low trim. The circuit and scenery gates passed. Fine-ground counts are 12 buried, zero unsupported and one horizontally coplanar spot, with 23 partial-footprint advisories. One pre-existing clipping spot remains near lap fraction 0.376. The rebuilt road has zero folds, and the measured-descent and signed-crossfall regressions pass.

### Okayama

At Attwood the previous game surface was level across the road. Fresh Geospatial Information Authority of Japan 1 m laser DEM queries sampled 23 cross-sections at fractions 0.825–0.930, each 4 m either side of the built centreline. The right edge of an 8 m transect sits 0.40 m below the left at fraction 0.867 and 0.60 m below at 0.900. The revised signed bank peaks at −3.50°, and the mean absolute angular difference across these 23 sections falls from 2.21° to 0.30°. A regression checks the height difference through three sections. These current terrain measurements are rounded to 0.1 m, and the 1994–95 GP-era pavement angle remains unverified. [GSI section at 0.900, left](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=134.2244159&lat=34.9204390&outtype=JSON) · [Right](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=134.2243304&lat=34.9204228&outtype=JSON)

GSI reports 274.7 m near Hobbs at fraction 0.375 and 245.4 m near Attwood at 0.872, a 29.3 m difference. The operator publishes 29 m of lap relief. Between those same two stations the built road drops 24.81 m, leaving 4.49 m of local compression from the existing smoothed centreline. Its lap relief is 25.81 m, with grades from −3.46% to +5.32%. Both shoulders passed at all 922 nodes. [GSI Hobbs](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=134.2215958&lat=34.9117444&outtype=JSON) · [GSI Attwood](https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=134.2234668&lat=34.9208080&outtype=JSON) · [Operator guide](https://www.okayama-international-circuit.jp/guide/course.html)

All 26 circuit-definition and factory tests passed. Track verification found no folds, invalid or unsafe placements. Ground verification found no buried or unsupported props and zero flat overlaps, with 12 advisory footprint warnings. The clipping and vertical coplanar checks found zero spots. The overhead coplanar and floating-prop gates also passed.

The corner-frame audit places the Attwood banking peak at fraction 0.8948, 100 m along the exit from the T11 apex. Its offset from the surveyed exit station rounds to 0 m. The regression checks that a peak shifted several road nodes or a narrowed bank that misses the apex fails the audit.

### Korea

The built road is level through Turn 3 and across the entire 1,389-node lap. Both edges passed height and banking continuity at every node. The verifier found zero folded surfaces, invalid objects or unsafe objects. It reported one aggregate scenery suppression warning.

The original zero-relief SRTM bake surveyed the Yeongam tidal flats in February 2000, ten years before the circuit opened. It cannot establish finished pavement heights. Fresh 90 m Open-Meteo terrain cells approaching and leaving the Turn 3 hairpin read 5, 3, 4 and 3 m. The 48-cell circuit sweep spans 6 m. A secondary circuit guide lists 5 m lap relief, consistent in scale, but gives neither station positions nor crossfalls. The patch corrects the source descriptions in the circuit definition, design brief and tests. The flat fallback remains provisional pending pavement measurements. [NASA SRTM dates](https://data.nasa.gov/dataset/shuttle-radar-topography-mission-1-arc-second-global) · [Circuit history](https://www.racingcircuits.info/asia/south-korea/korea-international-circuit.html) · [Turn 3 terrain samples](https://api.open-meteo.com/v1/elevation?latitude=34.736903,34.737622,34.738372,34.738501&longitude=126.413084,126.412153,126.411317,126.412557) · [Secondary relief figure](https://www.f1-fansite.com/f1%20circuits/korean-international-circuit-yeongam/)

### Jerez

Spain’s IGN 5 m national terrain grid gives 48 m at Michelin (T2) and 41 m at Turn 4. The old road dropped 2.68 m between them. The rebuilt road drops **6.93 m**, against 7.00 m measured. The climb from T4 to Sito Pons (T5) now measures 11.85 m against 12.00 m. Coordinates use the bounding box and projection of the circuit’s OSM ring. Bilinear samples from the national raster supply 64 equally spaced source posts. After removing a constant height offset, RMS differences from the same raster across the 1,098 actual built nodes decrease from 1.99 to 0.29 m. These differences quantify reproduction of the survey grid. The returned raster stores integer metres and cannot resolve the small height differences needed to establish transverse camber. [IGN terrain subset](https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&coverageId=Elevacion4258_5&subset=lat%2836.703,36.714%29&subset=long%28-6.042,-6.027%29&format=image/tiff) · [Circuit operator](https://circuitodejerez.com/en/circuito/)

Updated relief is 19.25 m, versus 17.64 m before and 19.01 m on the sampled grid. Signed grades reach −4.87% and +4.76%. Banking remains level. All shoulder probes and six track and scenery gates passed. The built road has zero folds. The roofless grandstand bay along the pit straight now fits between its two terraces. Shortening the bay and the adjoining terrace removed a 5.61 m² overlap between the shell and a spectator row. The ground audit found zero flat-coplanar spots, buried objects or unsupported objects. Two severe scenery clips remain within the existing allowance. A regression now checks the Michelin-to-T4 drop.

### Donington

The UK Environment Agency’s 1 m composite DTM shows a 28.59 m climb from the Old Hairpin to McLeans. The new surface climbs 28.37 m there, up from 22.72 m. Lap relief rises from 29.43 m to 35.82 m against the grid’s 35.93 m. The baker samples 64 equally spaced stations on the unrotated OSM alignment. At 59 additional racing-line centre stations, root-mean-square height error after removing the vertical datum drops from 1.58 m to 0.08 m. These additional samples use the same survey. The measured maximum 20 m downhill grade is 8.38%, compared with the game's 8.85% peak over a single 4 m interval. [Environment Agency terrain model](https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc) · [Survey coverage API](https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&version=2.0.1&request=GetCapabilities) · [Circuit guide](https://driver61.com/circuit-guide/donington/)

Nine 8 m transverse sections centred around each of Craner Curves and McLeans show consistent signed camber. The revised zones peak at +2.3° and −2.8°, previously zero. Across the nine sections at each turn, mean absolute angular error falls from 2.00° to 0.19° and from 2.47° to 0.14°. The survey constrains the present pavement and cannot establish exact resurfacing differences since the 1993 Grand Prix.

Both shoulder checks passed at every one of 996 road nodes. The Old Hairpin climb and both signed 8 m edge differences have regression coverage. The Hollywood sponsor boards are now mounted to the existing rail to avoid burying their supports on the steeper descent. The build reported zero folds, invalid or unsafe diagnostics. A short field entrance separates two adjoining hedgerow panels that overlapped by 2.40 m² on the inside of the bend. The final ground check reports zero buried, unsupported or flat-coplanar spots. The revised elevation initially exposed a 1.12 m self-intersection where the spectator terrace curved back onto itself. Moving the terrace 0.025 lap upstream preserved all three rows and its 0.028-lap length, clearing the new overlap and a previous intersection with its neighbouring shed. The final clip audit counts five severe and three minor spots, compared with six severe and four minor on the starting geometry. Vertical and overhead coplanarity and floating-prop checks passed.

### Anderstorp

Anderstorp’s contemporary Grand Prix race report describes banked constant-radius bends. A driver's lap puts the banked left-hand Södra directly before the runway and describes Karusellen as a banked right-hander. The built Södra entry at lap fraction 0.5543 gives 0.00 m right-minus-left elevation across 10 m of road. The same cross-section at 0.420 in the Karusellen sweep also gives 0.00 m. The design brief had misidentified the bend at 0.185 as Södra. The patch corrects the named stations and distinguishes the physical banks from the current flat cross-sections. [Period race report](https://www.motorsportmagazine.com/archive/article/july-1976/23/swedish-grand-prix-4/) · [Driver’s lap](https://www.hultman.info/anderstorp.html) · [BMW circuit map](https://www.press.bmwgroup.com/global/article/attachment/T0000370EN/487)

The 997-node road spans 2.82 m, against 5 m in a present-day circuit listing. The built runway rises 2.34 m from 60% to 85% lap. The operator publishes the airfield elevation as 155 m without individual threshold heights. Lantmäteriet’s catalogue identifies the specific 1 m survey tile covering both bends, but downloading the elevation grid requires authentication. The available evidence supports the presence of banking without establishing a historical angle or a more accurate runway slope. No geometric change was made. Fresh node checks found grades from −1.25% to +1.13%, zero bank and zero shoulder mismatches across all 1,994 road edges. Track verification found zero folds, invalid placements or unsafe placements. [Circuit figures](https://motorracingindustry.com/business/anderstorp-racing-club) · [Airfield operator](https://www.srwanderstorp.se/en/anderstorp-airfield/) · [Swedish 1 m survey tile](https://api.lantmateriet.se/stac-hojd/v1/collections/dtm-cog/items/634_41)

### Brands Hatch

The prior 5.3% constrained fit erased much of the climb to Druids. Replacing 12 baked postings with Environment Agency 1 m lidar heights recovered the Paddock Hill descent and Druids climb. At the measured approach crest, trough and Druids crest (138, 365 and 598 m from the timing line), the game now reproduces both height changes within 0.2 m of the survey's 17.51 and 20.57 m. The previous game profile recovered 11.46 and 11.06 m even when taking nearby extrema. Nine held-out stations spanning 154–642 m show approximately 0.27 m mean absolute relative height error, previously 2.60 m. The independent event timing chart also shows the descent and climb. [EA lidar](https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc) · [BRSCC timing chart, page 2](https://brscc.co.uk/wp-content/uploads/2018/10/2025-British-GT-Brands-Hatch-GP.pdf#page=2)

The rebuilt 972-node circuit has 35.62 m relief, −13.49/+12.29% peak signed grade, zero bank and zero shoulder height mismatch in the probe. Banking remains unverified. The regression checks enforce measured local drop/climb within 0.5 m, held-out heights within 1.5 m and observed signed grade bounds inside the opening 790 m. The rest of the lap retains its SRTM grade cap.

Moved two scenery huts apart after resampling introduced overlaps. Targeted elevation test and geometry verification passed, with zero folds, invalid placements or unsafe objects. Ground and coplanar checks passed. Clip audit found zero severe and 13 minor overlaps. Ground reports 16 footprint advisories and 45 unjudged samples. The integrated patch brings the secondary hedgerow 2 m closer to the first row. This cleared both elevated tree clusters found near lap fraction 0.51.

### Zolder

The 1 m Flemish DHMV II bare-earth survey covers the modern GP layout modelled in game. Bilinear samples along the built centreline span 10.54 m, compared with 14.04 m on the original surface. At game Turn 4 the survey drops 4.64 m from the timing line. The rebuilt road drops 4.58 m, versus 8.56 m before. A 64-post centreline fit gives 9.85 m relief, peak grades of −4.79% and +5.90%, and 0.22 m RMS vertical error over the 997 surveyed road nodes after removing a constant datum (previously 2.60 m). The sampled profile leaves 0.69 m of relief unresolved through the sharp crest. [Flemish DHMV II raster used for this comparison](https://geo.api.vlaanderen.be/DHMV/wcs?service=WCS&version=1.0.0&request=GetCoverage&coverage=DHMVII_DTM_1m&crs=EPSG%3A31370&bbox=211823%2C186379%2C212981%2C187737&resx=1&resy=1&format=GeoTIFF) · [2024 circuit briefing](https://www.bgdc.be/files/R1TERLAEMEN200/2024TCNBRIEFINGBGDC.pdf)

Transverse samples 4 m either side of the apex at game Turns 4 and 9 give right-minus-left falls of 0.36 and 0.55 m. Seven sections spanning each apex confirm the direction. Both zones were previously flat. The revised peak signed banks are −2.5° and −3.8°, reproducing both measurements within 0.02 m. Other sections retain their previous bank. Both shoulders passed at all 997 nodes. A new regression checks the Turn 4 descent and both signed crossfalls.

All 46 definition, factory and elevation-smoothness tests passed. Track verification and ground, clipping, overhead, vertical coplanar and float gates passed. Shifting the scrutineering shed 8 m along the yard cleared a pine crown. One severe clip and one minor clip remain. Ground verification records four buried primitives, zero unsupported, zero flat-coplanar spots and 13 advisory footprint warnings.

### Dijon

Parabolique now climbs 21.59 m between 52.74% and 60.28% of the racing lap, compared with 10.23 m before and 22.65 m from IGN. The operator's maximum gradient is 14%. The game now reaches +13.89% against +5.68% before. The revised road uses 64 IGN RGE ALTI centreline posts on the stitched OSM alignment. Comparing 93 additional stations on the built route at a common starting datum gives 0.17 m mean absolute error against 1.83 m previously. The present-day terrain data leave period resurfacing uncertain. The map places Parabolique on the middle extension and Pouas in the closing sector. [Paired IGN heights](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=4.9027700%7C4.8997565&lat=47.3601382%7C47.3606863) · [Operator](https://www.circuit-dijon-prenois.com/en/drive-on-the-racetrack-en/) · [Parabolique](https://www.openstreetmap.org/way/242987767) · [Courbe de Pouas](https://www.openstreetmap.org/way/242987763)

Nine transverse sections 8 m wide through Pouas show its right edge higher by 3.01° to 7.13°. The added local banking peaks at +5.40°, reducing mean absolute angular error from 5.23° to 1.03°. The rebuilt 930-node track spans 31.65 m vertically with a maximum descent of −8.15%. Both shoulders passed at all nodes. Field parcels, fencing and two farmhouse trees were moved to accommodate the grade. A regression checks the measured Parabolique climb and Pouas crossfall. [IGN Pouas section](https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=4.8923202%7C4.8924240&lat=47.3587895%7C47.3588044)

All six track and scenery gates passed. Planting two vineyard rows directly on the slope preserves the vines and removes three coplanar spots. Vertical and overhead coplanar checks and the clipping audit found zero spots. One buried primitive, 16 advisory footprint warnings and four distant skyline clusters remain within the existing baselines.

### Buddh

The rebuilt road rises 14.00 m from Turn 1 to Turn 3, matching McLaren’s published 14 m. Sampling the Copernicus 30 m surface-model tile at T1, T2, T3, the back-straight midpoint and T4 gives 194.52, 193.19, 203.78, 194.46 and 201.86 m. That surface model supports the crest and dip. It gives a 7.40 m rise from the midpoint to T4. The game gains 1.88 m from its local hollow to T4. The raster mixes pavement with adjacent terrain and structures, so the depth of the dip remains uncertain. [McLaren preview](https://www.pitpass.com/47662/Indian-GP-Preview-McLaren) · [Copernicus source tile](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N28_00_E077_00_DEM/Copernicus_DSM_COG_10_N28_00_E077_00_DEM.tif)

The contemporary Vögele paving account reports up to 12% superelevation (6.84°) and 10% downhill grade around the circuit. Renault identifies Turn 10 as cambered and Turns 13–14 as off-camber. The game has zero crossfall there and around the lap, with longitudinal grades of −3.82% to +4.84% and overall relief of 15.83 m. The new track brief records both discrepancies. The available sources do not locate the maxima or give individual transverse profiles, so the angles remain unresolved. Both shoulders passed at all 1,276 nodes. Track verification found zero folds, invalid models or unsafe placements. [Paving report, p. 12](https://vdbum-info.de/wp-content/uploads/INFOS/archiv/3_2012.pdf#page=12) · [Renault Sport](https://media.alpinecars.com/renault-sport-f1-preview-to-the-indian-gp/?lang=eng)

### Mont Tremblant

The back-straight Hump now crests near 59.5% of the built lap. The former broad crest was near 62%. Natural Resources Canada’s 1 m bare-earth lidar records a 12.68 m rise from the Carousel exit to the modern crest, then a 5.03 m descent. A 2005 account of the redevelopment reports that approximately 12 ft (3.66 m) was removed from the crest. The resulting historical targets are approximately 16.3 m up and 8.6 m down, assuming the two comparison stations were outside the cut. The built road now rises 16.18 m and drops 8.32 m between those stations. It previously rose 10.99 m and dropped 1.67 m. The transition width is a reconstruction. The 1970 Can-Am race account places the period Hump on this same back straight. [Canadian lidar tile and source raster](https://datacube.services.geo.ca/api/collections/hrdem-lidar/items/QC-600018-23_DIF_Grand_Mtl_2018-1m) · [Northlander, October 2005](https://ncr-pca.org/images/stories/Northlander/2005-10.pdf) · [Motor Sport, 1970 St-Jovite Can-Am](https://www.motorsportmagazine.com/database/races/1970-st-jovite-can-am/)

The revision preserves 28.18 m of total relief. Grades now range from −7.30% to +9.31%. The modern lidar spans 35.02 m around the complete game route, but other parts of the circuit were rebuilt after the Grands Prix. Only the Hump received a local correction. Banking remains unverified and the built road has zero bank. Both shoulders passed at all 1,052 nodes. Verification, ground, clip, overhead, vertical and float checks passed with zero folds, buried or unsupported objects, coplanar spots or elevated clusters. Two minor clipping spots and 14 guarded trees remain. The measured Hump regression and seven factory tests passed.

### Mosport

The NRCan Peterborough 2016–17 one-metre lidar product spans 50.79 m on the mapped racing line. Sampling the Central East 2025 product gives 50.84 m. The two products may share acquisition inputs. The old road spanned 40.49 m. The updated road spans 50.89 m with its crest at 93.19% and trough at 44.00% of the lap, against 93.39% and 44.25% in the 2025 product. Relative-height RMS across 63 check stations falls from 3.13 m to 0.19 m after removing the common vertical datum. [NRCan 2016–17 terrain](https://datacube.services.geo.ca/pgstac/api/collections/hrdem-lidar/items/ON-2016-17-Peterborough-1m) · [NRCan 2025 terrain](https://datacube.services.geo.ca/pgstac/api/collections/hrdem-lidar/items/ON-Central_East_2025-1m)

From Clayton’s apex to its exit (14.95%–18% of the lap) the game now drops 12.60 m, against 12.77 m surveyed and 5.43 m previously. On the approach to Moss (38.56%–44.2%) it drops 14.75 m, against 15.07 m surveyed and 5.30 m previously. Grades span −13.03% to +9.97%. Both shoulders passed at all 984 nodes. Modern cross-sections around the first Clayton apex put the right edge about 0.30 m above the left across 8 m. The club’s published description calls Turn 2 off-camber, and the road was widened after its F1 era. A representative historic transverse profile remains unresolved and the game still uses zero bank. [Porsche Club of America circuit guide](https://pcaucr.org/wp-content/uploads/Provinz/2014/ProvinzJul2014.pdf)

The fitting and factory suites passed all 27 tests, including separate descent regressions. All six final geometry and scenery checks passed. The final ground audit reports zero buried or unsupported props and zero flat overlaps. Fifteen partial-footprint advisories and 37 unjudged samples remain. The patch shortens the Moss hoarding, removes a buried artificial ridge and an overlapping hedge, and keeps the existing Moss-exit verge patch clear of the general shoulder dressing.
