# Scenery QA plan — glitching faces, overhead undersides, the open tracks

Status: DRAFT (2026-09-24). Evidence is filled in as the four investigations
report; a section marked PENDING has no measurement behind it yet and must not be
acted on until it does. Follows the sceneryStartFrac / float wave (PR #234,
`docs/notes/DEFECT-LEDGER.md` "the LIKELY list, worked").

## 0. What the player reports

1. Some faces still glitch (z-fighting) although the coplanar audit is down to
   a handful of spots per circuit.
2. Driving UNDER a bridge, gate or gantry, the underside of the structure
   sometimes flickers.

Neither is gated today by anything that renders: every scenery check is a
node-VM geometry audit, and the one tool that measures flicker on screen
(`tools/shot/motion-capture.mjs`) is manual.

## 1. How scenery is tested now (the baseline this plan changes)

| layer | checks | runs |
|---|---|---|
| node VM build (`tools/lib/track-build-vm.cjs`) | `verify-track` (build/required models), float-audit, clip-audit, coplanar-audit (same-facing, few-mm gap), props-over-road (0.2-5 m over the tarmac, track.hw ladder), road-under-floor, lamp-fixture-anchor, pit-complex, baked-model-road-guard | `test:sweeps` (~15 min), CI "Per-circuit geometry sweeps" on any TRACK_VM path, `deploy.mjs --gate-only`; per-circuit baselines, exact match both ways |
| browser specs | 19 `*-foundation` specs (33 circuits have none), terrain-over-road, tracks-walls, props-over-road.spec (1500 s, nightly rota only), scenery-kits | change-aware selection + nightly rota |
| visual | motion-capture flicker score, shot.mjs, agent.mjs scene | manual only |

Known blind spots, measured before this plan:

- the 36 baked asset-pack models: `Assets` is not in TRACK_VM, so `bakedModel()`
  returns false in the VM and every node audit skips them;
- `pits.js` `sweep()` geometry records no primitive, so no audit can attribute it
  (1.5 % of zandvoort's prop vertices, the pit wall among them);
- coplanar-audit is SAME-facing only. That is correct for scenery (GLX culls back
  faces, TLX prop materials are FrontSide, verified 2026-09-24), but it has a gap
  cut-off, and the depth buffer resolves only ~2 cm at 300 m (TLX camera near
  0.3 / far 4000, 24-bit), so layers a few cm apart fight at distance unflagged;
- nothing targets overhead structures (deck undersides against what sits under
  them);
- nothing renders.

## 2. Workstreams

### A. Overhead undersides (bridges, gates, gantries) — PENDING investigation 1

Hypotheses under measurement: stacked `overheadSpan` layers at the same frac
(watkins_glen's covered bridge is five), deck/cap/sign faces a few cm apart,
thin deck slabs at view distance, the upper road of a crossover against a deck
prop, opposite-facing pairs if any overhead material is double-sided.

Deliverable: the fix per cause (engine emitter preferred: one deck per span, a
minimum layer separation, or a thicker slab), and an OVERHEAD audit: every
face above road + 3 m, same-facing pairs within the depth-resolvable separation
at the distance a car passes under (not the few-mm gap), baselined per circuit.

### B. Remaining z-fighting — PENDING investigation 2

To measure: the coplanar-audit residual by visibility distance; instanced
geometry (walls, fences, lamps, trees) and whether the audit reads instance
buffers; decals, markings and ground patches against the road/terrain buffers;
the pits.js sweep; pairs between the audit's gap cut-off and the depth buffer's
resolvable separation.

Deliverable: fixes per class, and the gap threshold re-derived from the depth
buffer at the distance each pair is seen from, not a fixed millimetre count.

### C. Make the asset pack visible to the node audits — PENDING investigation 3

Supply `Assets` in `track-build-vm.cjs` (the loader in
`tests/unit/baked-model-road-guard.test.mjs` shows the shape), re-baseline
float/clip/coplanar/props-over-road with the pack in, then fix the overhang class
(models anchored off-track whose upper parts reach over it; 14 circuits read
over tolerance with the pack visible, 8 of them only then).

### D. Open track items — PENDING investigation 4

monza (Lesmo/Ascari/Parabolica dressing off its apexes, Rettifilo gravel 300 m
early), redbull (Remus/Schlossgold early; pit-side stands), silverstone (`turns`
labels, a `recordBarrier` now at pit entry, silverstone.md on the old frame),
cota (a 6.65 m box pair at 0.049), the engine's 4.00 m frac-0 box pair on ~12
circuits, suzuka's `pit.side`.

### E. A rendered check, so flicker is gated and not only reported

`motion-capture.mjs` already scores per-frame flicker from a driven clip. Turn it
into a gate: a fixed set of shots (camera parked under each overhead span, plus
the worst coplanar sites from B), two consecutive rendered frames with the camera
still, and a per-site pixel-difference ceiling. A still camera must not change
between frames, so any difference there is z-fighting or shadow boil. Cost and
determinism under SwiftShader need measuring before it is gated; start
non-blocking, like "Golden menus on a runner".

## 3. Order of work

1. A (what the player sees most), then B's top classes.
2. C, because it changes every baseline, and anything fixed before it is
   re-measured after it.
3. D, per circuit, one commit each, with the audits run on each.
4. E, once A and B have produced known-good sites to hold.

Each step: all source edits first, then verify once (`deploy.mjs --gate-only`);
baselines lowered to the measured counts in the same commit; a ledger entry per
fix.

## 4. Verification

- node: `test:sweeps`, the new overhead audit, `deploy.mjs --gate-only`;
- browser: the affected circuits' foundation specs, and props-over-road.spec
  where C moves it;
- visual: motion-capture before/after at every site A fixes (p90 flicker), since
  a geometry audit going quiet does not prove the frame stopped flickering.

## 5. Open questions

- Is a still-camera pixel diff stable enough under SwiftShader to gate on?
- Should deliberate airborne props (madrid, mexico airliners) get an audit
  exemption flag rather than a float baseline?
