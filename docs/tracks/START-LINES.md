# Start/finish lines — the derivation, the values, and why they are not applied yet

Supersedes the research half of `HANDOFF-STARTFRAC.md`. That file asked for one
field to be corrected on 22 circuits. **The values are now derived, verified two
independent ways, and reproducible from committed tools.** Applying them is a
second, larger job, for a reason nobody had measured before — see "The blocker".

---

## Result

| | before | after |
|---|---|---|
| start lines inside a corner | **22 / 40** | **1 / 40** |
| Turn-1 hand vs six undisputed corners | — | **6 / 6** |

The one remaining is **jeddah**, deliberately untouched (see "Not located").

Reproduce both numbers:

```sh
node tools/startline-snap.cjs              # the coordinate -> startFrac derivation
node tools/startline-probe.cjs             # 22/40 in a corner, as the tree stands
node tools/startline-probe.cjs --snap --calibrate   # after the corrections
```

---

## The method

`startFrac` is an **index fraction**, not an arc-length fraction:
`resolve()` uses `round(wrap01(startFrac) * points.length)` as a node index, so
racing node 0 *is* source control point `round(startFrac * N)`, under both the
forward and the `reverse: true` branch. `realPoints()` keeps
`CircuitPaths[id].pts` index-for-index (it maps and smooths in place, never
resamples), so

```
startFrac = ptsIndex / pts.length
```

`tools/startline-snap.cjs` projects a real start-line coordinate into the same
frame as the committed trace and reports the index. Two corrections to the
method as originally written, both of which changed answers:

- **Project onto the nearest SEGMENT, not the nearest vertex.** Vertex spacing
  runs 21–70 m and is not uniform, so a line sitting mid-segment reads as
  wildly off-circuit. The Red Bull Ring measured "126 m from the centreline"
  purely as an artefact; on segment projection it is **2.3 m**. Every one of the
  22 coordinates is 0.1–6.8 m from the centreline once measured properly, i.e.
  they are all genuinely on the track.
- **Monaco's committed trace is stored REVERSED** (`committed[i] ===
  projected[n-1-i]`) — the only one of 40. The handoff listed Monaco among the
  circuits where a 1:1 geojson↔pts index had been "verified". Assuming 1:1 puts
  its line on the mirror-image position. The tool re-derives the storage order
  per circuit on every run and prints it rather than hard-coding a fixup.

### The second estimator: the trace's own vertex 0

Measured, and not previously known: **the upstream `bacinger/f1-circuits`
traces begin at the start/finish line.** 39 of 40 are dead straight at their own
vertex 0 — mean |curvature| ~0.00002 rad/m, two orders of magnitude under the
bar — and 19 of the 22 researched coordinates land within two nodes of it. The
repo already half-knew this: `js/circuits/paul_ricard.js` says *"The trace's
first vertex opens the pit straight."*

The single exception is **monaco**, which is the reversed-stored trace, so its
committed index 0 is the upstream trace's *last* vertex. The two facts explain
each other exactly.

That gives two independent estimators. Where they agree (19 circuits) the value
is settled. Where they disagree, the tie-break is which one the falsifiable
checks prefer — see the table.

---

## Verification that can fail

Neither check re-derives the answer; both can reject it.

1. **The line must sit on a straight.** Mean `|curvature|` over the 120 m
   centred on racing s=0; `> 0.004` rad/m (a 250 m radius held right across the
   line) means it is still in a corner. This is what vetoed the researched
   shanghai coordinate.
2. **The first apex must match the real Turn 1's hand.** `+k = LEFT`, but that
   label has shipped backwards before, so `--calibrate` scores the measure
   against six circuits whose Turn 1 is not in dispute *before* any other hand
   is worth reading: cota L, montreal L, monza R, silverstone R, singapore L,
   spa R. **6/6.** Montreal is in that set on purpose — its Turn 1 is a LEFT
   although the circuit runs clockwise, so a sign error cannot hide behind
   "well, it's a clockwise track".

The straightness check also caught an instrument limitation worth knowing: at
Monaco the first peak above the 0.008 rad/m bar is the gentle left kink on
Boulevard Albert 1er (|k| 0.012), not Sainte Dévote (|k| 0.054, 36 m later). The
apex bar finds the first *corner-like* thing, not the first *numbered* corner.

---

## The values

`old -> new`, with what decided it. `coord` = snapped to the researched
coordinate; `v0` = the trace's own first vertex.

| circuit | old | new | decided by |
|---|---|---|---|
| abudhabi | 0.075 | 0.0000 | coord 0.2 m off centreline, = v0 |
| albert_park | 0.0925 | 0.0000 | coord 2.5 m, = v0 |
| catalunya | 0.03 | 0.0000 | coord 0.2 m, = v0 |
| cota | 0.515 | 0.0000 | coord 0.8 m, = v0 |
| estoril | 0.96 | 0.0000 | v0; T1 measured R, matches the real T1 |
| hungaroring | 0.9825 | 0.0000 | coord 1.7 m, = v0 |
| imola | 0.495 | 0.0000 | coord 6.3 m, = v0 (timing line) |
| indianapolis | 0.05 | 0.0000 | v0; T1 measured R, matches the real T1 |
| istanbul | 0.98 | 0.0000 | v0; T1 measured L, matches the real T1 |
| mexico | 0.635 | 0.0000 | coord 1.6 m, = v0 |
| miami | 0.2325 | 0.0000 | coord 0.7 m, = v0 |
| monaco | 0.28 | 0.2516 | coord 0.5 m; trace stored REVERSED, so v0 is not the line |
| montreal | 0.915 | 0.0198 | coord 0.1 m, 2 nodes past v0 |
| monza | 0.0125 | 0.0000 | coord 3.9 m, = v0 |
| mugello | 0.05 | 0.0000 | v0; T1 measured R, matches San Donato |
| paul_ricard | 0.03 | 0.0000 | v0; T1 measured L, matches the Verrerie left-right |
| portimao | 0.96 | 0.0000 | v0; T1 measured R, matches the real T1 |
| qatar | 0.8 | 0.0000 | coord 0.3 m, = v0 |
| redbull | 0.1875 | 0.0000 | coord 2.3 m, = v0 (timing line) |
| sepang | 0.95 | 0.0000 | v0; T1 measured R, matches the real T1 |
| shanghai | 0.1525 | 0.0000 | **v0; the coordinate was rejected** — see below |
| silverstone | 0.64 | 0.5224 | coord 1.2 m at the Wing; **v0 is the OLD National pit straight, 1.3 km away** |
| singapore | 0.5075 | 0.0000 | coord 6.8 m, = v0 |
| spa | 0.9875 | 0.0000 | coord 1.9 m, = v0 |
| suzuka | 0.6125 | 0.9942 | coord 1.3 m, 1 node before v0 |
| vegas | 0.8575 | 0.9899 | coord 0.3 m, 1 node before v0 (timing line) |
| zandvoort | 0.3275 | 0.0000 | coord 0.4 m, = v0 (timing line) |

**Left alone deliberately, and already straight:** `nurburgring` 0.02,
`kyalami` 0.01, `magny_cours` 0.99 — each within a node or three of v0 and
passing both checks. Changing them is churn with no measured benefit.

**Already correct:** baku, interlagos, madrid, hockenheim, sochi, watkins_glen,
buenos_aires, jacarepagua — all 0.0, all confirmed by both estimators.

### The three judgement calls

- **shanghai** — its coordinate is 0 m off the centreline but snaps two nodes
  early and lands **in a corner** (mean |k| 0.0057, over the bar), while v0 is
  dead straight (0.00002) with T1 measured R, matching the real long right. Its
  sources disagree by 175 m, which covers the 78 m gap. The straightness check
  vetoing a coordinate is the check doing its job.
- **silverstone** — the only genuine half-lap disagreement. Both candidates are
  straight, so straightness cannot decide; the coordinate can. It sits 1.2 m
  from the centreline at upstream vertex 70 (52.06787, −1.02395, the Silverstone
  Wing) and 1298 m from vertex 0 (52.07879, −1.01535, the **old National pit
  straight**). Silverstone's trace is the one that does not begin at the modern
  line.
- **zandvoort / hungaroring** — under nearest-*vertex* snapping both jumped to a
  parallel branch of the circuit (at Zandvoort the track 750 m past the line
  passes within ~60 m of the main straight). Segment projection put both back on
  vertex 0. The tool now reports the runner-up branch distance and flags
  `AMBIGUOUS`; no circuit trips it, the closest being Monaco at 63 m against a
  0.5 m winner.

### Not located — do not guess

**bahrain** and **jeddah** keep their current values, per the handoff.

- bahrain is only *bounded*: OSM pit lane way 187123422 runs
  26.02985,50.51052 → 26.03420,50.51071 and main grandstand way 187123419
  centres 26.03207,50.51014, so the line lies between them at lon ≈ 50.5103.
  A bound is not a coordinate. Its current 0.225 already measures straight.
- jeddah: no usable source was found. Its current 0.9625 measures **in a
  corner** (mean |k| 0.0173), so it is the one circuit still known-wrong.

For the record and not as an instruction: the v0 convention — 39/40 straight,
19/22 coordinate-confirmed — predicts **0.0** for both, and both measure dead
straight there (bahrain 0.00011 with T1 R; jeddah 0.00003 with T1 L). That is a
convention, not a located line, so the call belongs to whoever owns the data.

---

## The blocker: `startFrac` is coupled to the dressed world

**This is why the values are derived but not applied, and it is the finding the
handoff did not have.**

`startFrac` does not just move a line — it rotates RACING space, and a circuit's
authored scenery, its `dressingExclusions` and its `CircuitMarkings` corner
boards are all written in racing fractions. Moving the line drags the whole
dressed world round the lap with it. Measured with `tools/track-verts.cjs`:

```
cota      startFrac 0.515 -> 0    props 641 134 -> 634 551   (-6 583 vertices)
spa       startFrac 0.9875 -> 0   props 491 066 -> 494 146   (+3 080)
istanbul  startFrac 0.98 -> 0     props 563 750 -> 598 068   (+34 318)
```

Applied to all 27 circuits, **seven fail `verify-track --all` outright** on
required models pushed off their footprints and into the road: Marina Bay Sands,
the Katara Towers and Lusail Stadium, the Pudong skyline, the KLIA skyline, the
Hungaroring lake, the Miami Turnpike overpass, and the Silverstone Wing facade.

### What was tried, and how far it got

A `sceneryStartFrac` def field — "the startFrac this circuit's scenery was
authored against" — applied as a post-rotation in `TrackSpace.sceneryFrac` /
`sceneryNode` / `sceneryRange`, so the line moves and the dressing stays put.
Built, measured, and **it works**: required-model failures went **7 → 2** and the
authored-scenery drift fell from tens of thousands of vertices to ~2 k (node
quantisation). Three things learned building it, all of which cost time:

1. **The remap was never running.** `transformSceneryApi` is only applied when
   `def.reverse || def.sceneryCoordinates === "source"`. Forward racing-space
   defs — most of the grid — take neither branch, because racing space is the
   identity remap. The condition needs the shift as a third case.
2. **The shift is NOT `startFrac - sceneryStartFrac`.** Those are CONTROL-POINT
   index fractions; an authored scenery fraction is an ARC-LENGTH fraction, and
   the control points are nowhere near arc-uniform (Monaco 21 m, Baku 70 m).
   Subtracting one from the other looked plausible everywhere and was still
   moving 34 k vertices at Istanbul. The right shift is the arc-length fraction
   at which the OLD origin sits in the NEW lap — a lookup into `dlen` inside
   `buildCenterline` (control point *j* opens at dense sample `j*SUB`), stashed
   as `_sceneryShift` alongside the existing `_startFrac`. It needs no
   forward/reverse branch: a point that was `f` past the old line is `shift + f`
   past the new one, whichever way the lap runs.
3. **A blind alley worth not repeating.** Every `docs/tracks/*.md` brief puts the
   pit building at lap 0.95–1.00 and the main grandstand at 0.00–0.005, which
   reads as proof that authored fractions are true positions from the real line
   — i.e. that the dressing should move with it and no shift is wanted. It is a
   sampling artefact: those are the circuits whose old `startFrac` happened to
   be near-correct. **Silverstone's Wing is authored at 0.45**, and its brief
   says *"S=0.0 at start/finish on the National pit straight"* — a straight
   1.3 km from the real one, and a claim that is not even true of its own def.
   The corpus is tuned by eye, per circuit, against whatever origin that def
   defined, and it is inconsistent about it. No reinterpretation of the numbers
   is globally right; keeping every landmark exactly where it is and moving only
   the line is the only safe transformation.

### Why it still is not enough

The two remaining failures (`miami` turnpike-overpass, `singapore`
pit-building-1) are not quantisation. **`transformSceneryApi` remaps a
hard-coded list of emitter names, and six scenery entry points that take a node
index or a lap fraction are absent from it:**

| emitter | signature | circuits using it |
|---|---|---|
| `groundPatch` | `(k, side, gap, sz, col, opts)` | 35 |
| `overheadSpan` | `(spec)` with `spec.frac` | 16 |
| `circuitKit` | kit surface, places via `frameAt` | 16 |
| `waterField` | `(k, side, gap0, gap1, …)` | monaco |
| `groundedSegments` | `(spec)` | 10 |
| `landmarkKit` | kit surface | abudhabi |

`groundPatch` and `waterField` match the existing `(k, side, …)` group exactly
and are a one-line addition. `overheadSpan` and `groundedSegments` need a small
spec wrapper. The kits are the real work: they place through `frameAt`, so the
remap has to reach inside `CircuitKit`/`LandmarkKit` rather than wrap them.

**This is a pre-existing gap, not one the start-line work introduces.** Those
same emitters are unremapped today on the four reversed circuits (monaco,
kyalami, paul_ricard, singapore), which means their ground patches, water fields
and kit-placed buildings are already being placed against an unmirrored lap.
Closing the gap will move shipped geometry on those four, so it needs its own
before/after pass and its own sweep run.

### The order of work

1. Close the `transformSceneryApi` coverage gap (six emitters above), and
   re-baseline the four reversed circuits on its own commit — that change stands
   alone and is worth doing regardless.
2. Land `sceneryStartFrac` (mechanism above), verifying with
   `tools/track-verts.cjs --diff` that untouched circuits are bit-for-bit
   unchanged. It was measured as a strict no-op before any circuit opts in.
3. Apply the table above, then `verify-track --all`, the clip/coplanar/float
   audits per changed circuit, and `npm run test:sweeps`.
4. Rotate `CircuitMarkings` sectors/turns by the same arc shift and re-sort the
   turn arrays so index 0 is the first apex after the new line. **This is the
   deliverable** — correct turn numbering, the albert_park/silverstone
   final-turn-before-T1 ordering, and turn-keyed aero-zone authoring all fall
   out of it. Check that rotated `sectors` still satisfy `0 < s1 < s2 < 1`;
   where rotation pushes a boundary through the line, that circuit's sectors
   need re-deriving rather than rotating.

Expect the generic dressing to reshuffle on every changed circuit no matter what
— it scatters on `hash(nodeIndex)` (`js/track/tracks.js`, `hash(k * 17 + side * 4)`),
so moving the origin necessarily rerolls it. That part is cosmetic and cannot be
preserved; only the authored placements can. Budget for the clip/coplanar/float
ratchets to move and need re-baselining with proof, not just raising.

---

## Tools

| tool | what it does |
|---|---|
| `tools/startline-snap.cjs` | start-line coordinate → `startFrac`; re-derives trace storage order per circuit, projects onto segments, flags ambiguous branch snaps |
| `tools/startline-probe.cjs` | the two falsifiable checks — straightness at s=0 and first-apex hand — with `--calibrate`, `--snap`, `--frac id=v` |
| `tools/track-verts.cjs` | per-circuit vertex + diagnostics dump for exact before/after diffing; `--diff before.json` |

The derivation the handoff described as "gone" is now these three files.
