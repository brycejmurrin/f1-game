# Concept body fit rows on the deploy tip (#3156)

Measured 2026-10-27 on `c4a1c688` (includes #3118's conceptNose pin):
`node tools/car/car-fit-audit.mjs --all-bodies --json` — 7 min wall, 11 cars x (factory + 30 body looks;
the issue counted six, `--all-bodies` now covers 30).

## Method
The issue's base (71ca7a4a) predates the pin, so `--base` against it no longer measures the work. This run
compares each of the six original bodies (needle, brick, anteater, arched, wedge, barge) with the FACTORY
build of the same team: a failing row is NEW if factory has no failing row for that pair, WORSE if its value
is more than 1.25x + 3 mm of factory's. Rows below are counts over 6 bodies x 11 cars (max 66 per row).

## Ranked rows (n, worst mm / cm2, where, bodies)
```
ZFIGHT engineCover~sidepods NEW n=60 max=331.84 [-0.704,0.174,0.033] {"needle":10,"brick":11,"anteater":11,"arched":9,"wedge":11,"barge":8}
PENETRATION frontWing~chassis NEW n=55 max=46 [-0.027,0.266,2.234] {"brick":11,"anteater":11,"arched":11,"wedge":11,"barge":11}
OPEN engineCover~- NEW n=51 max=3792 [0.493,0.395,-0.34] {"needle":11,"brick":11,"anteater":5,"arched":11,"wedge":11,"barge":2}
ZFIGHT livery~livery WORSE n=34 max=105.6 [0.008,0.524,2.097] {"brick":11,"barge":11,"arched":5,"anteater":3,"wedge":3,"needle":1}
GAP suspension~suspension WORSE n=33 max=14.6 [-0.211,0.344,-1.569] {"needle":5,"brick":5,"anteater":6,"arched":6,"wedge":6,"barge":5}
PENETRATION chassis~bolsters NEW n=31 max=32.4 [-0.272,0.47,0.05] {"anteater":11,"wedge":11,"barge":9}
OPEN livery~- NEW n=30 max=543 [-0.594,0.594,-0.025] {"needle":9,"brick":11,"arched":8,"barge":2}
PENETRATION mirrors~sidepods NEW n=27 max=58.9 [-0.404,0.604,0.347] {"needle":10,"brick":9,"arched":8}
ZFIGHT engineCover~livery NEW n=25 max=73.72 [-0.744,0.245,0.138] {"anteater":11,"wedge":11,"barge":2,"needle":1}
OPEN chassis~- WORSE n=22 max=4659.3 [0.193,0.513,1.05] {"needle":11,"anteater":11}
GAP livery~chassis NEW n=22 max=6 [-0.224,0.313,2.126] {"brick":11,"barge":11}
GAP bodyDetail~bodyDetail NEW n=21 max=20.5 [-0.863,0.088,0.5] {"needle":7,"brick":7,"wedge":7}
GAP livery~engineCover NEW n=20 max=4.5 [-0.025,0.957,-0.66] {"brick":5,"arched":7,"barge":8}
PENETRATION aeroFlaps~chassis NEW n=18 max=48.7 [-0.188,0.272,1.98] {"brick":7,"wedge":8,"barge":3}
```
Per-body totals: needle 122, brick 145, wedge 118, anteater 111, arched 110, barge 117.

## Reading
- The issue's named rows are still present but are NOT the biggest: engineCover~sidepods ZFIGHT (60),
  frontWing~chassis PENETRATION (55, brick/anteater/arched/wedge/barge on every car, 46 mm near z 2.23),
  engineCover OPEN (51) and chassis~bolsters (31, anteater/wedge/barge) lead.
- hood~chassis and halo~hood fail at 57-59 mm on FACTORY too, so they are not concept-specific; the nose-root
  blend (extra station near z 1.20) cannot clear them as a NEW row.
- frontWing~chassis is new for every non-needle body: the wing mounts were not re-derived from the concept
  nose bottom.

## Next steps (not done here)
1. frontWing mount from the concept nose underside (conceptNose floor), then re-run `--bodies=brick`.
2. bolsters / cockpit rim from `bodyAnchors().podAt/coverAt` (chassis~bolsters, bolsters~sidepods, cockpit~engineCover).
3. engineCover vs sidepods ZFIGHT: the cover/pod shoulder overlap at z -0.7.
4. Gate once per fix: `--bodies=<id>` with a saved `--write-baseline` from this tip (~1 min per body).
   Coordinate with Codex car-design-expansion-84b2 on the same recipes.

## Row 1 experiment (frontWing~chassis), second worker, NOT landed
Cause: the five non-needle bodies all take `fitBodyDetails.noseMount()` (`js/car/car-body-geom.js`, ~line 1608). Every
BODY_STYLES entry without its own `podProfile`/`podShape` gets `podSculpt`, so `seat = min(0.035, (top-bottom)*0.35)`
puts the arm's lower end up to 35 mm ABOVE the nose underside at z 2.40, and the leaning arm (z 2.23-2.43) then sits
41-46 mm inside the cone.
Tried: `seat = -0.030` for podSculpt bodies. Result on ferrari: the penetration row vanished on all five bodies, but
`--baseline` (six bodies x 11 cars, written at 8bd7c9a2, `--write-baseline`) showed NEW floating-wing GAP rows
(frontWing~chassis 4.8 mm on brick, 18.9 mm on arched; frontWing~aeroFlaps/wheels/brakeDucts 4-14 mm), so -30 mm is too
low. The bracket is between the old seat (+0..35 mm) and -30 mm: try -0.010 to -0.015 first, and make the seat per
body (derive from `n.top - n.bottom`) rather than a constant. Reverted; no geometry is committed.
Tip: a body audit is ~1 s per car (`--bodies=brick --team=ferrari --checks=PENETRATION,GAP`), the six-body baseline
run ~60 s foreground.
Rows 2 (bolsters) and 3 (engineCover~sidepods) were not started.

## Row 1 seat sweep (third worker), NOT landed
Constant podSculpt seat vs the six-body `--baseline` audit and `tests/unit/body-styles.test.mjs`
("expanded wing supports penetrate the nose", which requires the emitted upper cap INSIDE the nose section):
```
seat     audit frontWing~chassis rows (ferrari+mclaren, 6 bodies)   baseline gate        body-styles test
-0.030   0                                                          14 NEW / 11 WORSE    (not run)
-0.012   0                                                          PASS (0 NEW, 154 s)  FAIL mercedes/hammerhead/flat
-0.008   0                                                          (not run)            FAIL mercedes/hammerhead/flat
-0.004   2                                                          (not run)            FAIL mercedes/hammerhead/flat
 0.000   4                                                          (not run)            FAIL mercedes/hammerhead/rounded
```
-0.012 clears the audit with 0 NEW/WORSE, but the existing test pins the upper cap inside the nose hull on hammerhead
(a design assertion that contradicts the audit's PENETRATION limit). Landing it needs either a per-body seat that keeps
hammerhead's cap inside (hammerhead is outside the six-body audit set) or Bryce relaxing that test. Left as the
decision; no geometry committed.

## Row 1 landed (per-body seat)
Decision (orchestration session, 2026-10-27): keep the `body-styles` "supports penetrate the nose" test as is (rule 9).
`noseMount()` seat is now `style.noseSeat` when set, else `-0.012` for podSculpt bodies, else `+0.012`. The six expansion
bodies (hammerhead, swan, manta, wasp, scorpion, blade) pin `noseSeat: 0.012` because their thin noses must keep the cap inside.
Measured: six-body `--baseline` PASS (0 NEW/WORSE, 146 s); `tooling-fast --changed` 81/81; no frontWing~chassis row remains.

## Row 2 landed (bolsters) — third continuation, 2026-10-27
Cause: the non-cockpit bolster block is fixed at x 0.24..0.40, but the pod inner wall is x 0.289 (z 0.12) / 0.279 (z -0.43)
on every body and the concept tubs are wider than 0.24 at z 0.14, so the block ran 30-40 mm into sidepods and chassis
(`chassis~bolsters` 31 rows, 32.4 mm; `bolsters~sidepods` 30-40 mm).
Fix (`js/car/car3d.js`, "bolsters"): on concept bodies (`BODY_STYLES[styleKey] === teamStyle`, not the narrow-waisted
needle, `waist < -0.2`, whose pods wrap the old block and which went WORSE on bodyDetail~sidepods 24->43 mm when changed)
the inner edge is x 0.27 and the outer edge `podAt(z).inner + 0.004` at z 0.12 / -0.43. Factory cars keep 0.24/0.40.
Measured (ferrari, anteater/wedge/barge/brick): chassis~bolsters 32.4 -> 4.4 mm, bolsters~chassis 31.3 -> 1.5 mm,
bolsters~sidepods cleared. Six-body `--baseline` (written at e470b830): PASS, 0 NEW/WORSE, factory builds unchanged.

## Row 3 deferred: engineCover~sidepods ZFIGHT
deferred: shared cover/pod loft overlap, not a concept-body mount. Measured ZFIGHT engineCover~sidepods max cm2 per
body over 11 cars: needle 127, brick 71, anteater 323, arched 181, wedge 332, barge 80 (z about 0.03, x -0.68, y 0.18:
the cover foot and the pod top share a plane). Needle (near-factory) fails too, so the fix is in the shared
`coverLoft`/pod seam (`js/car/car-shade.js`, `car-body-geom.js`), which moves factory cars; needs its own change with a
factory-wide baseline.

## Row 3 diagnosis (#3959), NOT landed
Cause found: the `engineCover~sidepods` pair is NOT the cover loft. The engineCover section (car3d `part("engineCover")`)
also emits the pod flank decals (`addPodFlankSpan(0.46,-0.34, …)`: the PANEL sponsor board 0.32-0.80 and the c2 band
0.08-0.30). On `podSculpt` pods each quad vertex is `podFlank(z,f)` shifted 2 mm in x, which slides ALONG the near-horizontal
lower facet (normal about -0.6,-0.8), so the band's underside is coplanar with the pod skin; a second, smaller strip
(brick/arched/needle, z 0.38-0.41, upper facet) comes from the first segment starting at z 0.46, mid-quad (not a pod
station), where the decal chord twists off the pod's diagonal.
Tried (six-body `--baseline`, written from the tip before the change; `artifacts/` only, not committed):
```
variant                                              engineCover~sidepods rows        elsewhere
2 mm shift along the facet NORMAL                    brick/wedge/anteater ok, 45 rows  28 WORSE / 14 NEW (OPEN, engineCover~livery)
4 mm normal                                          0 on six bodies (ZFIGHT-only run) not checked with GAP
6 mm normal                                          0                                 GAP engineCover~sidepods NEW 30 (> 3 mm), OPEN
skip quads whose facet is shallow (|dx| > 0.4 run)   needle 68, brick 60, arched 72    PASS on brick/wedge/anteater; six-body: 1 WORSE
                                                                                       (wheels OPEN on mclaren needle, 82101 vs 81970 mm,
                                                                                       a part the change never touches)
+ y drop 2.5 mm x downward normal                    worse                             56 WORSE / 18 NEW (welds with the adjacent quads break)
first segment lifted 3.5 mm (per vertex)             2 rows left on brick              livery OPEN WORSE x11 (car-mesh podDecal sits 4 mm proud)
```
Lessons: the OPEN row is a weld/SEALED metric (rim within ATTACH 3 mm of another surface), so any change of a decal vertex
must move the SAME vertex in every quad that shares it (board, band, ERS strips, car-mesh `podDecal`'s livery quads at
+4 mm); and the GAP limit (3 mm) bounds the lift from above. Next step: author ONE shared `flankPoint(z,f,side,lift)`
used by car3d `addPodFlankSpan` and car-mesh `podDecal`, with the lift taken along the facet normal and the first
segment started at a pod station (0.50) with its UV range clipped, then re-run the six-body baseline.

## Row 3: shared `flankPoint` tried, NOT landed (2026-10-27)
Added `anchors.flankPoint(z,f,lift)` (podFlank lifted along the facet's outward normal) and used it in car3d
`addPodFlankSpan` (4 mm) and car-mesh `podDecal` (6 mm). Six-body `--baseline` (from the pre-change tip, 76 s per run):
```
engineCover~sidepods ZFIGHT   rows kept, max cm2 down (anteater 299 -> 19; z 0.38 strip 60 -> 25-30), none reach 0
elsewhere                     88 WORSE / 51 NEW: OPEN engineCover (3735 -> 4022 mm, 1308 -> 5969 mm), OPEN livery
                              (542 -> 1297 mm, 258 -> 1534 mm, 36 NEW), GAP livery~engineCover 4.5 mm x4
```
Reverted. A uniform lift fixes the coplanar band but moves every decal rim off the weld distance the OPEN metric reads
(and the z 0.38 strip needs the first segment on a pod station, which changes the board's UV). The fix needs the board,
band, ERS strips and livery quads re-meshed together, not a vertex offset. #3959 stays open; this PR is `Refs`.
