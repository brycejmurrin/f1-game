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

## 2b. Next campaign — designed 2026-09-24 (four read-only investigations)

Scripts and raw output: `scratch/roadfold/`, `scratch/terrainz/`, `scratch/guards/`,
`scratch/perf/`. Nothing below is shipped yet.

### R. Road ribbon (mesh.js buildRoad)
- **R1 — duplicate kerbs (the whole "road folding" signal).** `findCorners`
  (mesh.js 34-58) returns every local |k| peak and each gets its own span, so a
  long corner lays its kerb ribbon once per peak: 55 % of kerb/hatch triangles
  fleet-wide are bit-identical copies (up to 9 on shanghai). Same position and
  colour, so no flicker — pure waste and audit noise (it was ~308k of the
  triangle audit's road pairs). Fix: a per-side quad-coverage mask and one
  `ribbon()` per contiguous run (prototype `scratch/roadfold/mesh.js`): kerb
  set, colours and `kerbL`/`kerbR` identical on the 33 circuits compared, kerb
  triangles 170,786 -> 78,554. The other 19 circuits must be compared before shipping.
- **R2 — verge clamp on the fold side** (optional): |o| = min(|o|,
  max(w, 0.85 |dP| / |dot(dr, t)|)) on columns 0/1/12/13 only; never below w,
  so the racing surface is bit-identical. Moves 0-77 verge vertices per circuit.
- **R3 — true tarmac folds are centreline kinks** (R < hw): korea (f ~0.064,
  0.30, 0.43, 0.66; one node turns 97 deg in 4 m), bahrain, sepang, sochi. A
  circuit-data fix, not mesh.js.
- **Check:** verify-track fails on duplicate kerb triangles and on any rail in
  columns 2-11 running backwards (known-list ratchet for R3 circuits).
- Moves: road idx counts (`shared-track-foundation-characterization`
  records idxCount), coplanar/float baselines. The earlier "shanghai probe" was
  a false positive (sampled on shared strip edges).

### T. Terrain z-fighting and the 300 m audit window
- **T1 — props crossing terrain.** GLX/TLX draw terrain UNBIASED (only WGX
  reads `buryRibbon`), and the fighting props sit on BOTH sides of it (238
  above / 184 below on 5 circuits), so a geometric lift or sink does nothing
  (prototyped: 422 -> 428 pairs). Fix: `_terrainBias = [2, 10]` on
  `_wmTerrain*`, floor [4, 8] -> [4, 16] so it stays behind; WGX `_litOpts` to
  honour `depthBias` over `_BIAS_BURY`. Modelled: fighting metres within 300 m
  34,208 -> 5,339 (-84 %). Check first: wgx.js:1926-1927 may pass GL's
  [factor, units] into constant/slope swapped. Needs a live boot + gpu-census.
- **T2 — delete the universal ground slab** (tracks.js:983, 439 pairs on 34
  circuits; duplicates buildFloor, hidden from coplanar-audit by MAX_DIM, WGX
  already skips it).
- **T3 — groundPatch rigid for up to 96 m** (tracks.js:1298, models.js:354):
  tessellate along the track so it follows the terrain (220 pairs, 14 circuits).
- **T4 — MIN_SEP and the 300 m window.** At `--fight 300`: 584 spots vs 106
  today; 7 emitters are 80 % of the new ones, pits.js:516 x :533 alone 51 % (baked
  bay face vs jamb/lintel skin at 5 / 11 mm; the 6 mm alternate-slice stagger).
  Export `TrackGeom.MIN_SEP = 0.03` (fights only beyond 388 m), use it in
  pits.js staggers/insets, structures.js:633, nature.js step arithmetic;
  coplanar-audit gap window and FIGHT_MAX 300 from the same constant.
  Prototype: qatar 21 -> 0, bahrain 6 -> 0, 6 circuits 87 -> 42. Order: pits
  first, then rebaseline at 300 m (~250) and ratchet down.

### G. Guards
- **G1 — solid-in-the-road audit.** Prototyped (`scratch/guards/
  solid-in-road.cjs`): convex hull of each shipped prop primitive's real XZ
  vertices vs tarmac samples (|lat| <= 0.9 hw, <= 1 m along), counted only
  when the primitive is GROUNDED (minY <= road + 0.2) and spans into
  [road + 0.2, road + 5]. Catches the suzuka pillar on the pre-fix tree, 0 on
  HEAD, 52 circuits in ~100 s; fold into props-over-road.test.mjs's fleet pass.
- **G2 — flicker gate.** Two identical still frames CANNOT show z-fighting
  (a deterministic rasteriser resolves the fight the same way every frame).
  Per site: A and A' at one pose must diff to 0 (proves every time source is
  frozen: park, view(), renderClock, govHold + renderScale, lampFlicker 0, day
  dry, hud off); B and C with the eye moved 1-2 cm along the view ray; score =
  pixels flipping by > 48 in BOTH moves, in >= 9 px clusters. Sites: ~120 from
  overhead spans (add `frac` to overheadSpan's emitted record, models.js), start
  lines, top coplanar sites. Positive control: the pre-fix madrid.js must go
  red. Cost ~20 min on llvmpipe fleet-wide; start as a non-blocking CI job,
  block after ~5 runs with A/A' exactly 0.
- **G3 — `overheadSpan({ soffit })`.** Plate bottom AT `clearance`, deck raised
  by `inset`, plate thickness > inset (buried), span/depth scaled < 1 so its end
  faces never meet the deck's. Migrates madrid's two hand-rolled soffits (and
  should clear madrid's last 2 regular coplanar spots).

### P. Rendering only what a player can see
Already in place: props/glass/terrain/road in 72 m cells, frustum-culled on all
three backends; distance cull ~1424 m; instanced batches with per-cell cull;
per-chunk shadow-caster cull; probe cull 300 m. Occlusion culling and
multi-draw exist on GLX but ship OFF. Far/fogged geometry is ~0 % (0.03 % /
0.08 %), so impostors and tighter fog culls would gain nothing.

**13.7 % of all prop triangles (2.55 M of 18.6 M) can never be seen**:
enclosed in another opaque box 10.4 %, buried > 5 cm 1.5 %, bottom faces on
the ground 1.5 %, coincident opposite faces 1.3 % (worst: indianapolis 34 %,
fuji 29 %, interlagos 27 %).
- **P1 — strip never-visible triangles from the INDEX buffer at build time**
  (after buildProps, before createChunkedMesh; vertex buffer untouched so the
  audits' positions stay valid). Removes 13.7 % of prop vertex/primitive work
  in the main, shadow and probe passes. Small effort, low risk.
- **P2 — the main enclosure source is a look bug too.** grandstandEx's shell
  (gap + 2.5 .. + 12.5) swallows crowdBank's back rows (gap + 1.5, depth 4.2);
  the green shed also lands inside stands. Moving the crowd out may make it
  VISIBLE — confirm with a rendered before/after.
- **P3 — compact the vertex buffer too + a per-circuit props-triangle ratchet**
  (~9-10 MB of vegas's ~80 MB props; iPhone SE kills at ~100 MB). Medium risk:
  audit primitive ranges shift, rebaseline in the same change.
- **P4 — detail LOD:** props < ~1 m into a separate chunked mesh drawn within
  ~200-250 m (up to ~20 % of in-radius triangles are < 3 px). Needs multi-draw
  and a fade.
- Measurement: GPU timing on this box can't resolve it (RENDER-PERF-PLAN §6,
  same-state samples vary 18-45 %), so gate on COUNTS (props tris/verts per
  frame, glx-call-census, chunk-reach) and confirm frame time on gpu-census.

### Verification of the shipped batch (2026-09-24)
- Foundation specs (browser): cota and redbull passed; monza and suzuka were
  red since the 2026-09-23 frame fixes (never selected by CI) — monza's pit
  canopy is now superseded by the complex, suzuka's built fracs lost the bogus
  shift. Specs corrected (d7eaa6395), both pass.
- gpu-census on macos-latest (madrid: bridges + start-line bias): dispatched.
- Deploy of c08803d8: check scheduled.

## 3. Order of work (next campaign)

1. **Guards first:** G1 (cheap, catches a class that shipped) and G3 (small, removes madrid's last
   coplanar pair).
2. **R1** (pure waste removal, no visual change), with the verify-track check;
   then R3 per circuit.
3. **T1-T2** (terrain bias + slab removal), verified live and on gpu-census.
4. **T4** pits MIN_SEP, then the 300 m rebaseline and ratchet.
5. **P1** index strip, and **P2** after a rendered look check, then P3.
6. **G2** flicker gate as a non-blocking CI job, calibrated on the fixed sites.
7. T3, R2, P4 as capacity allows.

## 3a. Order of work (first campaign, done)

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
