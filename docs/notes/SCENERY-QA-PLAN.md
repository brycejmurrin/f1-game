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
- coplanar-audit is SAME-facing only. That is correct for scenery: GLX culls back
  faces (`glx.js:941`), TLX scenery materials are FrontSide (`tsl-lit.js:1919`),
  WGX's lit pipeline uses `cullMode "back"`, so ~600 opposite-facing touching pairs
  fleet-wide can never fight. Depth is 24-bit, near 0.9 m (0.3 m in cockpit/hood,
  `game.js:6751`), far 900 m: one depth step is ~2.6 mm at 200 m (8 mm with the
  0.3 m near plane), so only a gap of ~0 mm fights at driving distances;
- **coplanar-audit skips every face with |n.y| >= 0.5 unless `--horizontal` is
  passed, and `coplanar-faces.test.mjs` never passes it**: no deck bottom, soffit,
  gantry underside or roof top has ever been checked. `--horizontal` globally is too
  noisy (madrid 4 -> 109, monaco 4 -> 58, mostly ground-level prop tops);
- nothing renders.

## 2. Workstreams

### A. Overhead undersides (bridges, gates, gantries) — MEASURED

Measured with `scratch/under/overhead-coplanar.cjs` (reuses coplanar-audit's
`facesOf`/`overlapArea`; near-horizontal faces > road + 3 m within hw + 8 m of the
centreline; all 52 circuits).

- **The reported flicker is madrid, and only madrid.** Two structures draw a thin
  "soffit" span at the SAME clearance as their deck, so both bottoms sit in one
  plane, 0.0 mm apart, both down-facing and drawn:
  `madrid.js:471` motorway overpass (frac 0.085, clearance 6.2) with its soffit at
  `:483` (216 m2), and `:508` IFEMA access bridge (0.885, clearance 6.4) with `:519`
  (203 m2). `overheadSpan` (`models.js:309-316`) puts every box's bottom exactly at
  `clearance`, so two spans at one frac and clearance always coincide. These are
  the only down-facing same-facing overhead pairs in the fleet.
  **Fix:** soffit clearances 6.15 / 6.35 (thickness 0.22 unchanged): the soffit top
  lands inside the deck and the dark soffit owns the underside. Engine option: a
  `soffitColor` on `overheadSpan` that emits the plate itself 0.03-0.05 m under
  `clearance`, so "one bridge in two layers" cannot be written wrong again.
- **monaco tunnel tops** (up-facing, seen only from orbit/cinematic/photo cameras):
  roof, haunch and springing (`monaco.js:473-493`) all top out at road + 7.80 m,
  124 pairs, gap 0. Fix: thicknesses 1.35 / 1.72 / 2.21 (tops 7.80 / 7.77 / 7.76).
  Minor, also up-facing: `miami.js:181/182` tops coplanar at road + 10 m (4 pairs).
- Ruled out: opposite-facing pairs (culled, above), depth precision (slabs
  0.22-1.7 m against mm-scale steps), shadow acne (down-facing faces skip the sun
  and lamp shadow, `glsl-lit.js:1215`), crossovers (suzuka deck top 7.2 m against
  the upper road at 9.1 m; nothing on monza or any def bridge).
- **Audit extension:** `coplanar-audit --overhead`: faces with n.y <= -0.5 centred
  above road + 3 m within hw + 8 m, same-facing, gap < 5 mm, area >= 0.25 m2; gated
  at ZERO fleet-wide in `coplanar-faces.test.mjs` (it finds exactly the 2 madrid
  pairs today, so no baseline noise). An up-facing overhead ratchet catches the
  monaco class.
- Verify: re-run the scratch audit (0 hits), then motion-capture driving under
  madrid 0.085 and 0.885 before/after.

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
