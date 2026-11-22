# Circuit surface validation, second pass

The starting revision was `0211dc069b` in [PR #6132](https://github.com/brycejmurrin/f1-game/pull/6132). Each circuit has a dedicated worktree. Measurements use the built racing surface. Grade is the rise per horizontal distance between consecutive centreline nodes. Signed bank is the local tangent just inside each asphalt edge, with a positive angle raising the right edge.

The initial probe checked both shoulders at all 63,392 nodes across 52 circuits. One metre outside each asphalt edge, it checked for zero residual road-bank angle and preserved edge height within 0.1 mm. At the edge it compared the planner and vehicle bank samplers within 0.000001 radians. All nodes passed. Kerb height, verge drainage and off-road terrain have separate geometry.

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

## Circuit findings

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

### Cota

Measured on 0211dc069b. The lowest point is at 91.35% of the lap between T19 and T20. The crest is at 6.54%, 3.8 m before the T1 marker. The rise between them is 31.38 m versus Formula 1’s 30.9 m, a +0.48 m difference. From the timing line to T1 alone the game rises 20.24 m. [Formula 1](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc)

Signed longitudinal grade spans −7.09% to +7.77% and signed bank spans −4.50° to +5.00°. The 11% approach grade reported by NASCAR exceeds the game’s maximum by 3.23 percentage points. The precise distance interval for the reported grade and independently measured crossfalls remain unresolved. Retain the validated crest position and lap relief pending a station-resolved approach profile. [NASCAR](https://www.nascar.com/gallery/nascarcasm-why-turn-1-at-cota-is-the-most-chaotic-corner-in-nascar/)

The shared lane/shoulder probe passed at all 1,376 nodes, both edges. Track verification passed with zero folds and zero unsafe or invalid scenery diagnostics. No circuit patch.

### Vegas

At PR head `0211dc069b`, the road rises **16.02 m** from T10 beside the Sphere to T14 at the end of the Strip. A fresh query of George Russell’s 2024 pole lap returned 368 positions. Interpolating feed height at the same fractions of horizontal lap distance gives **15.65 m**, a 0.37 m difference. Whole-lap relief is 16.26 m built versus 16.30 m recorded. The comparison assumes equal normalized lap distances and supports the overall climb. [OpenF1 position samples](https://api.openf1.org/v1/location?session_key=9640&driver_number=63&date%3E=2024-11-23T07:20:35.796&date%3C=2024-11-23T07:22:08.108)

Built grades run from −3.47% to +1.65% and signed edge banking from −3.00° to +3.00°. Both shoulders passed at all 1,543 nodes. The track verifier reported zero folds, invalid models or unsafe models, and five palm placements dropped by the scenery guard. Retain the profile. Local corner crossfall remains an estimate because a single car path does not measure a road cross-section.
