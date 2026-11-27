# Terrain-over-road: node fleet twin vs the browser spec (#7087, #6557 P4a)

Kind: measurement · Re-measure-by: 2027-01-15 (or the next change to `tools/lib/over-road-scan.cjs`, the spec's ladder, or `Tracks.terrainY`)

`tests/unit/terrain-over-road-fleet.test.mjs` (group `test:sweeps`) runs the spec's own scan
(`tools/lib/over-road-scan.cjs`) on a VM build's `terrainGeo` and `roadGeo` for every circuit at TOL 0.18,
with the spec's ladder `[-0.6..0.6]`, its road-mesh half-width rule, `Tracks.banking` heights, three-decimal
`nodeAt` rounding and planted-face control. Measured 2026-11-27 on tip 22660801: 52 circuits, 149 s, one
shared VM context, all green.

## Readings, circuit by circuit

Every one of the 52 circuits reads `road=0 terr=0` in the VM, and the control reads 1.0 m on every one.
The circuits: bahrain monaco silverstone spa monza suzuka singapore cota interlagos vegas madrid zandvoort
jeddah albert_park shanghai miami imola montreal redbull hungaroring baku mexico qatar abudhabi hockenheim
nurburgring catalunya sepang istanbul paul_ricard portimao sochi mugello magny_cours estoril kyalami
watkins_glen indianapolis buenos_aires jacarepagua fuji okayama korea jerez donington anderstorp
brands_hatch zolder dijon buddh mont_tremblant mosport.

## Against `tests/specs/terrain-over-road.spec.js` (browser)

The spec prints `over-road <id>: road=<m> terr=<m>` per circuit but no recorded run of those lines is
in the repo, and AGENTS.md rule 5 bars a local browser run. What a browser verdict does establish: the
spec fails any circuit above 0.18, so a green run of the per-circuit tests means each reads <= 0.18 in the
page. VM and browser therefore agree on the verdict for every circuit the last green `test:circuits` covered;
they are NOT compared at the metre level. To fill that in, read the `over-road <id>:` lines from a
`test:circuits` job log and diff against `TERRAIN_OVER_ROAD_TABLE=1 node --test
tests/unit/terrain-over-road-fleet.test.mjs`.

Known differences in method (the twin is not byte-identical to the page): the page reads `__apex.nodeAt` and
`trackGeometry()` buffers, the twin reads `track.px/py/rx/rz` and `terrainGeo`/`roadGeo` from a harness with
GLX stubbed; the lap-node `i/M` to node rounding follows `props-over-road.test.mjs`.

## Props: browser vs VM (recorded, not gated)

No new measurement. The standing record is the header of `tests/unit/props-over-road.test.mjs`: the VM
build reproduces the spec's documented readings (jeddah, mont_tremblant) and the mosport/zandvoort pit-wall
cap, but on monza the browser reported 0.75 m at frac 0.115 from a flat 2.2 x 0.2 m face at y 0.70 where the
VM build has no prop vertex within 5 m. So the props buffers differ between the two builds and a VM-clean
props reading is not a browser-clean one. Open in `docs/notes/DEFECT-LEDGER.md`. Terrain and road did not show
such a divergence in this fleet, but that is a statement about this scan only.
