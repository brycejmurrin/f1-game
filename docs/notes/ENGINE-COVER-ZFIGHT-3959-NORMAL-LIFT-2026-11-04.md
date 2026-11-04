# #3959 engineCover~sidepods z-fight — normal-lift sweep (2026-11-04)

Kind: measurement · Re-measure-by: 2026-12-04

Re-measured on deploy tip `1f00b697` with
`node tools/car/car-fit-audit.mjs --bodies=needle,brick,anteater,arched,wedge,barge --baseline <tip baseline>` (48 s/run).
Tip baseline: 45 ZFIGHT `engineCover~sidepods` rows on the six concept bodies.

Variant: pod-flank decals in car3d `addPodFlankSpan` (sculpt branch) moved from `+2 mm x` to a lift along the
facet's outward normal (tangent from `podFlank(z, f±0.01)`), `LIFT` mm, same lift on every quad.

| LIFT | WORSE / NEW | notable rows |
|---|---|---|
| 0.8 mm | 65 / 56 | ZFIGHT livery~sidepods 61, engineCover~sidepods 45 (unchanged), engineCover~livery 14 |
| 1.0 / 1.5 mm | 48 / 27 | engineCover~sidepods 18 left, livery~sidepods 14, OPEN engineCover 37 |
| 4.0 mm | 88 / 35 | OPEN engineCover 66, OPEN livery 50, GAP livery~engineCover 4 |

Reading: confirms the 2026-10-27 / 10-29 notes. A uniform lift never reaches 0 `engineCover~sidepods` rows without
raising OPEN/GAP (the livery quads in car-mesh `podDecal` sit +4 mm over `podFlank` and share the weld). Do not retry an
offset. The remaining route is the partition (clip the sculpt pod skin quads into PANEL/accent cells and drop the
overlay board/band), which also moves the titleA ink substrate and the tri budget (`body-styles:497`); it needs its own
PR with the livery-zone and budget tests in the loop. No source change in this PR.
