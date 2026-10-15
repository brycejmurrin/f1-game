# Night washout fleet survey — 2026-10-15

Branch `cursor/night-washout-per-track-df88`. Method follows
`docs/notes/NIGHT-MAST-POOLS-2026-10-05.md`: build each circuit with
`{ night: true }`, resolve `track|night|dry` onto `LT`, `buildTrackLights` +
`LampBake.bake` with `Tracks.terrainY` and road splat, sample pool irradiance
(diffuse + `bounceK` × bounce) × `lampLevel` every 7 nodes at road centre and
max of both sides at edge + 25 / 50 / 100 m.

Fleet `*|night|dry` on deploy already ships `lampRadiusMul` 0.9 and `bounceK`
0.06 (not the old 1.9 / 0.3 stamp). Qatar and Bahrain keep the flood-mast ring
package from #923. This pass adds per-track trims only where bake + SwiftShader
orbit shots (frac 0.3, el 18, dist 40) still read as a flat pool.

## Fleet bake snapshot (shipped knobs, 2026-10-15)

| id | lamps | mast | medRad m | maxRad m | road | edge+25 % | edge+50 % | valley/peak |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| qatar | 287 | 182 | 116.9 | 130.3 | 24.25 | 0 | 0 | 0.17 |
| bahrain | 162 | 125 | 106.5 | 120.4 | 14.95 | 2 | 3 | 0.16 |
| madrid | 241 | 6 | 27.0 | 75.4 | 3.72 | 0 | 2 | 0.03 |
| abudhabi | 273 | 6 | 30.6 | 58.7 | 5.14 | 2 | 7 | 0.09 |
| singapore | 248 | 237 | 37.0 | 37.3 | 5.37 | 1 | 1 | 0.04 |
| jeddah | 271 | 0 | 27.0 | 27.0 | 4.60 | 15 | 24 | 0.00 |
| monaco | 179 | 0 | 25.2 | 25.2 | 2.99 | 9 | 48 | 0.00 |

(Full JSON: `scratch/night-pool-survey-current.json` on the branch.)

High `edge+50 %` on Monaco (48 %) is a tight street layout; orbit shots still
show separated pools, so no preset change this round.

## Per-track changes (this PR)

| track | why | knobs |
|---|---|---|
| abudhabi | Six registered `floodMast` throws to ~124 m with stamped 1.9× mul; desert run-off and mast feet read as one white plane in shots | `poolEnergy` 0.85, `keyMul` 1, `lampRadiusMul` 0.85, `bounceK` 0.06, `beamCore`/`beamCone` 0.5, `bleedMul` 0.6, `lampTemp` 0 |
| madrid | Cool `floodMast` pair reaches ~159 m; same flat-pool read as Abu Dhabi on SwiftShader | same package as Abu Dhabi |
| jeddah | Highest fleet edge+25 (15 %) and edge+50 (24 %); Corniche rows blow out tarmac under posts | `poolEnergy` 0.8, `keyMul` 1, `lampRadiusMul` 0.85, `bounceK` 0.06, `beamCore`/`beamCone` 0.55, `bleedMul` 0.65, `lampTemp` 0 |

## Bake before → after (changed tracks)

| track | road | edge+25 % | edge+50 % | maxRad m |
|---|---:|---:|---:|---:|
| abudhabi | 5.14 → 4.47 | 2 → 2 | 7 → 4 | 58.7 → 55.4 |
| madrid | 3.72 → 3.16 | 0 → 0 | 2 → 1 | 75.4 → 71.2 |
| jeddah | 4.60 → 4.19 | 15 → 9 | 24 → 20 | 27.0 → 25.5 |

## Shots

Captured with `node tools/shot/shot.mjs <id> 0.3 orbit … --jpeg --tod night --el 18 --dist 40 --present-timeout 90 --capture-retries 4 --wait 120` under `artifacts/night-washout/{before,after}/`.
