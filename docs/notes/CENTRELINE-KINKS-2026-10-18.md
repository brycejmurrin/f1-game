# Centreline kinks, first batch (#2209)

Measured 2026-10-18 on this branch. `node tools/track/centreline-kinks.cjs` pinned 25 kink nodes. Bahrain (3) stays with PR #2789. This batch clears 10 circuits (18 nodes). Fuji (4), the Nürburgring (1) and Sochi (4) stay pinned.

The edit is the smallest control-point change that takes that circuit's kink count to 0 without a new surface fold, and keeps every curated apex and the start line inside 2 m. Search: pull a point onto its neighbours' chord, slide it along one adjoining chord, or chamfer it into two points. Built-centreline displacement on the ten that landed is 0.10–0.62 m.

| circuit | edit | centreline move | gates recaptured |
|---|---|---|---|
| spa | slide one Bus Stop point 15% toward the next | 0.32 m | none (track-insight Spa fold stays clear) |
| jerez | slide one point 8% toward the next | 0.10 m | none |
| imola | two slides | 0.62 m | sector fractions reseated (lap −0.496 m; S1 stays 115 m before Tosa, S2 stays 190 m before Alta) |
| mexico | three slides / one pull | 0.43 m | none |
| indianapolis | slide one point 8% | 0.17 m | none |
| monza | chamfer the Rettifilo entry point at 22% (124 → 125 points) | 0.51 m | coplanar 4 → 5, clip 8 → 7, ground flatCoplanar 3 → 1, props strip 325542/294895 → 325396/294760, physics baseline |
| qatar | slide one point 8% | 0.28 m | buried 8 → 10 |
| paul_ricard | slide one point 15% | 0.13 m | unsupported 5 → 6 |
| buenos_aires | slide one point 8% | 0.24 m | buried 1 → 2 |
| zolder | slide one point 8% | 0.11 m | clip 0 → 1 |

Point count stays the same except Monza. `startFrac` is an index fraction, so an inserted point on Jerez or Zolder would rotate the racing frame under the scenery. That is what buried 49 Jerez props in the earlier chamfer pass. These slides do not.

## Left pinned, and why

A sub-metre slide still moves the hidden-face strip enough that props triangles leave the 0.5% ratchet:

- Fuji 562533 → 588918 (+4.7%), and unsupported 0 → 1.
- Nürburgring 360026 → 371488 (+3.2%), and buried 3 → 5.
- Sochi, three nudges and one kink still left: 199113 → 218513 (+9.7%), buried 0 → 3, clip 0 → 1. The colinear sample that clears the last kink does not bring the triangles back.

Those three stay at their old pins. Bahrain stays at 3.

`docs/agent-index.json` was already stale on the deploy tip: the two docs-integrity tests from 46e8ed07d (the KTX2 no) had landed after the index, so `test:docs-guards` read 587 and `test:guards` read 420. Regenerated; both counts are +2. No hook page or impact-map change.
