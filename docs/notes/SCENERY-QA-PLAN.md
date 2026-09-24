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

### A. Overhead undersides (bridges, gates, gantries) — FIXED (3b711e3f0)

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
- **Done:** madrid soffits 6.15 / 6.35, monaco thicknesses 1.72 / 2.21, miami
  pier shafts end inside their caps. `coplanar-audit.cjs --overhead` is a real
  mode now, and `coplanar-faces.test.mjs` holds it at zero fleet-wide except one
  named 0.4 m2 madrid lamp-arm pair (not an overhead structure). madrid's regular
  coplanar count fell 4 -> 2 (the soffits' side faces were coincident too). Not
  yet done: the motion-capture before/after, and the `soffitColor` engine option.

### B. Remaining z-fighting — MEASURED; first fixes DONE

Measured with a triangle-level audit over every shipped mesh (road, terrain,
glass, water, startline, props incl. instances, pack injected;
`scratch/zfight/tri-audit.cjs`). Counts are an upper bound (a ranking, not
visible-glitch counts). Instancing is NOT a blind spot (the VM records every
instance through the wrapped emitters).

DONE in this batch: start line / grid boxes / pit paint depth bias (1); pit
canopy shell and city mullion tops (part of 3); neonTower self-intersection;
asset pack visible (5).

OPEN, next campaign, ranked:
2. Props flush on terrain (terrain has no bias): 2,811 pairs / 1,063 spots / 48
   circuits; ground slabs at buildProps `tracks.js:983` (> 220 m, hidden by
   MAX_DIM), `tracks.js:1298` modelGroup, pit model `pits.js:516`. Fix: seat
   ground slabs >= 2 cm off terrain or give them a decal bias; audit: road and
   terrain triangles as pseudo-primitives.
3. Remaining up-facing tops (TV/elevated cameras): city sections
   `city.js:189 x 241` residue, neonTower `city.js:417/522`, grandstand
   plank/riser `structures.js:632 x 633`, korea `tracks.js:1298`.
4. The audit's window: FIGHT_MAX 150 m drops 4.5-20 mm pairs that fight within
   300 m (24-bit depth, near 0.3 cockpit / 0.9 chase). At `--fight 320`: 631
   spots vs 111 (zandvoort alone 1,837 pairs at 10-11 mm). Fix: FIGHT_MAX =
   NEAR_TRACK and a ~20 mm MIN_SEP for layered faces — a baseline campaign.
6. Road ribbon folding over itself on corner insides (verge strips of adjacent
   nodes, different colours, one bias): 1,734 spots, worst shanghai, catalunya,
   anderstorp. Fix in mesh.js buildRoad; check in verify-track.
7. pits.js `sweep()` geometry, unrecorded: 180 spots / 45 circuits; route it
   through TrackGeom.emit.
8. Overlapping water slabs (waterBand `tracks.js:1251/1275`): 114 spots, 5 circuits.

### C. The asset pack and the "overhang class" — DONE (pack visible; suzuka pillar fixed)

Harness: `scratch/overhang/` (injects `Assets` into the VM; `preload.cjs` does it
for any audit CLI).

- **The ledger's "14 of 52 over tolerance with the pack visible, 8 only then" is a
  method artifact, not the pack.** It reproduces exactly with the triangle-centroid
  method (nearest-node height, 0.75 x road-mesh half-width) — with the pack OFF as
  well. Under props-over-road's current method (track.hw, 0.9 rung) the fleet
  reads 1 of 52 over TOL with or without the pack: mont_tremblant's baselined
  crown. 13 of the 14 are edge objects at >= 0.94 hw (pit-wall caps, corner tyre
  stacks `tracks.js:1855`, graph-instanced boundary boxes `tracks.js:943`).
  Only 5 circuits call `bakedModel` (monza 49 stamps, spa 48, silverstone 39,
  monaco 5, vegas 3); none overhangs. The ledger entry needs correcting.
- **Making the pack visible costs nothing in baselines**: on those 5 circuits,
  clip severe, coplanar, float and props-over-road are identical pack on/off
  (+~80 MB peak RSS). Worth doing: set `sandbox.Assets` in
  `tools/lib/track-build-vm.cjs` (export the parser from
  `js/render/shared/assets.js` rather than copy it a third time) and in
  `float-audit.cjs`'s own VM context.
- **Real defect found on the way — suzuka crossover pillar in the lower road.**
  A bridge pillar (`RAW.addBox`, `tracks.js:2371`), 1.6 x 9.2 m, stands at
  lateral -3.0 on the LOWER road (frac 0.439, hw 7): placed at hw + 2 from the
  upper deck's node, which on the oblique crossover lands on the other road. RAW
  deliberately skips `rejBox` (`tracks.js:2358-2360`), and its collider belongs to
  the upper-road node, so a car on the lower road drives through a concrete
  column. props-over-road cannot see it: a solid spanning the whole [TOL, CEIL]
  band has no qualifying face. Fix: reject a pillar whose footprint is
  `onTrack` at a node outside the deck's own arc window (> ~30 nodes from k).
  Audit: flag any shipped primitive whose XZ footprint covers a road sample and
  whose y-span overlaps [road + TOL, road + CEIL].

### D. Open track items — DONE (monza, redbull, silverstone, cota, frac-0 shed; redbull and suzuka pit sides from references)

Corner fracs from curvature peaks (smoothed over 40 m; +k = left).

1. **monza** — apexes: Rettifilo 0.1025, Roggia 0.3047, Lesmo 0.3705 / 0.4321,
   Ascari 0.6177 / 0.6330 / 0.6503, Parabolica 0.8241. Roggia is right; the rest
   need per-group moves: Rettifilo +0.059, Lesmo onto its two apexes AND onto the
   outside (-1; +1 is the inside of a right-hander), Ascari -0.147, Parabolica
   -0.081, with the Parabolica tifosi bowl to (0.824, -1, 60) (on the inside at
   R 72 m its tiers converge: +2 severe 5.21 m spots) and the guardrail windows
   re-cut to the corners. Tested: clip 18 -> 17, float 0, coplanar 3. Risk: walls
   move, so the physics baseline (monza is the characterization track) re-blesses
   the same way it did on 2026-09-23.
2. **redbull** — Remus +0.0785 (and to -1, the outside), Schlossgold +0.147;
   the steel stand at 0.50 moves to 0.34. Tested: clip 4, float 0, coplanar 7,
   all at baseline. Pit side: the complex is on +1, the main stands are on +1
   too; mirroring the four stands to -1 adds one floater, so not ready. The Wing
   and motorhomes sit on -1 — check a reference before mirroring anything.
3. **silverstone** — `turns` is wrong (index 9 at 0.4199 is Woodcote; two entries
   on Luffield; Maggotts missing). Proposed 18-entry list from the peaks: Abbey
   0.0705, Farm 0.1095, Village 0.1526, Loop 0.1780, Aintree 0.2101, Brooklands
   0.3402, Luffield 0.3723, Woodcote 0.4199, Copse 0.5229, Maggotts 0.6140, 0.6324,
   0.6612, Becketts 0.6838, Chapel 0.7105, Stowe 0.8556, Vale 0.9384, 0.9507, Club
   0.9802. `recordBarrier(0.44, 0.50, 1, 4)` spans engine 0.963-0.023: it crosses
   the pit entry AND exit, 4 m off the Club apex. Proposed (0.452, 0.494) with the
   pit-wall points clipped to match, or drop both (the complex has `hasWall`).
   docs/tracks/silverstone.md still cites the 0.64 frame. Risk: HUD turn names,
   f1-track-accuracy and new-hooks read `turns`.
4. **cota** — the 6.65 m clip at 0.049 is two sections of one `neonTower`
   (city.js:361) overlapping each other: a section-stacking bug in the engine
   emitter, not an alignment problem.
5. **Engine 4.00 m clip at frac 0.000 (29 spots fleet-wide)** — the green-theme
   shed `every(140, place(k, +-1, 14, [4,6,22]))` (tracks.js:1970) starts at
   k = 0 on unshifted circuits and, when its hash side is -1, lands on the generic
   stand `place(0, -1, 14, [6,11,16])` (tracks.js:2044). Tested fix: skip the shed
   when side < 0 && !ownPitStraight && k <= 32. Fleet A/B: all 29 spots gone, no
   circuit gains one; severe -1 on 14 circuits (buddh, buenos_aires, cota, dijon,
   donington, estoril, fuji, hockenheim, interlagos, korea, magny_cours, mosport,
   nurburgring, watkins_glen).
6. **suzuka** — the kit (+1) is most likely right and `pit: { side: -1 }` wrong
   (the main grandstand is on -1, "opposite the pits"); an inference, to confirm
   against imagery. `side: 1` alone raises clip 2 -> 3 and coplanar 1 -> 2 and
   suppresses 14 pit-side props, so it goes the mexico way: `side: 1`, drop the
   kit pit building the complex supersedes, re-check the pit-side fences.

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
