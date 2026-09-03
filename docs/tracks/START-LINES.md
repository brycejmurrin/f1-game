# Start/finish lines — the derivation, the values, and what moving them touches

Campaign closed — this doc is the live reference for `startFrac`. It positions the
start/finish line, and 22 of 40 circuits put it inside a corner. This is the fix and the evidence.

---

## Result

| | before | after |
|---|---|---|
| start lines inside a corner | **22 / 40** | **1 / 40** |
| Turn-1 hand vs six undisputed corners | — | **6 / 6** |
| `turns[0]` is the first apex after the line | — | **38 / 40** |
| circuits building (`verify-track --all`) | 40 | **40** |

The one line still in a corner is **jeddah**, deliberately untouched (see "Not
located"). The two turn tables that still disagree with the measured first apex
are **sochi** and **jacarepagua** — neither circuit's `startFrac` nor turns were
touched here, so that mismatch is pre-existing.

Reproduce:

```sh
node tools/startline-snap.cjs                       # the coordinate -> startFrac derivation
node tools/startline-probe.cjs --calibrate          # the two checks, sign-calibrated first
node tools/rotate-markings.cjs --check              # the turn-table rotation
node tools/track-verts.cjs --diff before.json       # did the dressed world move?
```

---

## The method

`startFrac` is an **index fraction**, not an arc-length fraction: `resolve()`
uses `round(wrap01(startFrac) * points.length)` as a node index, so racing node 0
*is* source control point `round(startFrac * N)`, under both the forward and the
`reverse: true` branch. `realPoints()` keeps the def's `path.pts`
index-for-index (it maps and smooths in place, never resamples), so

```
startFrac = ptsIndex / pts.length
```

Three corrections to the method as the handoff wrote it, each of which changed
answers:

- **Project onto the nearest SEGMENT, not the nearest vertex.** Vertex spacing
  runs 21–70 m and is not uniform, so a line sitting mid-segment reads as wildly
  off-circuit. The Red Bull Ring measured "126 m from the centreline" purely as
  an artefact; on segment projection it is **2.3 m**. All 22 researched
  coordinates are 0.1–6.8 m from the centreline once measured properly.
- **Monaco's committed trace is stored REVERSED** (`committed[i] ===
  projected[n-1-i]`) — the only one of 40. The handoff listed Monaco among the
  circuits where a 1:1 geojson↔pts index had been "verified"; assuming that puts
  its line on the mirror-image position. Storage order is now re-derived per
  circuit on every run rather than hard-coded.
- **Nearest-point snapping picks the nearest BRANCH.** Several circuits run
  alongside themselves — at Zandvoort the track 750 m past the line passes
  within ~60 m of the main straight — so a coordinate with 50 m of error lands
  on the wrong one. Zandvoort and Hungaroring both did. The tool now reports the
  runner-up branch distance and flags `AMBIGUOUS`; no circuit trips it now, the
  closest being Monaco at 63 m against a 0.5 m winner.

### The second estimator: the trace's own vertex 0

Measured, and not previously known: **the upstream `bacinger/f1-circuits` traces
begin at the start/finish line.** 39 of 40 are dead straight at their own vertex
0 — mean |curvature| ~0.00002 rad/m, two orders of magnitude under the bar — and
19 of the 22 researched coordinates land within two nodes of it. The repo
already half-knew this: `js/circuits/paul_ricard.js` said *"The trace's first
vertex opens the pit straight."*

The single exception is **monaco**, which is the reversed-stored trace, so its
committed index 0 is the upstream trace's *last* vertex. The two facts explain
each other exactly.

Two independent estimators. Where they agree (19 circuits) the value is settled;
where they disagree the falsifiable checks below break the tie.

---

## Verification that can fail

Neither check re-derives the answer; both can reject it.

1. **The line must sit on a straight.** Mean `|curvature|` over the 120 m centred
   on racing s=0; `> 0.004` rad/m (a 250 m radius held right across the line)
   means it is still in a corner. This vetoed the researched shanghai coordinate.
2. **The first apex must match the real Turn 1's hand.** `+k = LEFT`, but that
   label has shipped backwards before, so `--calibrate` scores the measure
   against six circuits whose Turn 1 is not in dispute *before* any other hand is
   worth reading: cota L, montreal L, monza R, silverstone R, singapore L, spa R.
   **6/6.** Montreal is in that set on purpose — its Turn 1 is a LEFT although
   the circuit runs clockwise, so a sign error cannot hide behind "well, it's a
   clockwise track".

An instrument limitation worth knowing: at Monaco the first peak above the
0.008 rad/m bar is the gentle left kink on Boulevard Albert 1er (|k| 0.012), not
Sainte Dévote (|k| 0.054, 36 m later). The probe finds the first *corner-like*
thing, not the first *numbered* corner.

---

## The values

`old -> new`. `coord` = snapped to the researched coordinate; `v0` = the trace's
own first vertex.

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

**Left alone deliberately, and already straight:** `nurburgring` 0.02, `kyalami`
0.01, `magny_cours` 0.99 — each within a node or three of v0 and passing both
checks. Changing them is churn with no measured benefit.

**Already correct:** baku, interlagos, madrid, hockenheim, sochi, watkins_glen,
buenos_aires, jacarepagua — all 0.0, confirmed by both estimators.

### The three judgement calls

- **shanghai** — its coordinate is 0 m off the centreline but snaps two nodes
  early and lands **in a corner** (mean |k| 0.0057, over the bar), while v0 is
  dead straight (0.00002) with T1 measured R, matching the real long right. Its
  sources disagree by 175 m, which covers the 78 m gap. The straightness check
  vetoing a coordinate is the check doing its job.
- **silverstone** — the only genuine half-lap disagreement. Both candidates are
  straight, so straightness cannot decide; the coordinate can. It sits 1.2 m from
  the centreline at upstream vertex 70 (52.06787, −1.02395, the Silverstone Wing)
  and 1298 m from vertex 0 (52.07879, −1.01535, the **old National pit
  straight**). Silverstone's trace is the one that does not begin at the modern
  line.
- **suzuka / vegas** — one node before v0 each. The coordinate is more precise
  than the convention, so it wins, but the difference is inside the method's
  resolution either way.

### Not located — do not guess

**bahrain** and **jeddah** keep their current values.

- bahrain is only *bounded*: OSM pit lane way 187123422 runs
  26.02985,50.51052 → 26.03420,50.51071 and main grandstand way 187123419
  centres 26.03207,50.51014, so the line lies between them at lon ≈ 50.5103.
  A bound is not a coordinate. Its current 0.225 already measures straight.
- jeddah: no usable source found. Its current 0.9625 measures **in a corner**
  (mean |k| 0.0173), so it is the one circuit still known-wrong.

For the record and not as an instruction: the v0 convention — 39/40 straight,
19/22 coordinate-confirmed — predicts **0.0** for both, and both measure dead
straight there (bahrain 0.00011 with T1 R; jeddah 0.00003 with T1 L). That is a
convention, not a located line, so the call belongs to whoever owns the data.

---

## What moving a start line touches

**This is the part the handoff did not have, and it is most of the work.**
`startFrac` does not just move a line — it rotates RACING space, and six
different things are written in racing fractions.

### 1. Authored scenery — `sceneryStartFrac`

A circuit's `scenery()` anchors, its `dressingExclusions` and its corner boards
are racing fractions, so moving the line drags the whole dressed world round the
lap. Measured with `tools/track-verts.cjs`: COTA −6 583 prop vertices, Istanbul
+34 318, and **seven circuits failed `verify-track --all`** outright on required
landmarks pushed off their footprints and into the road — Marina Bay Sands, the
Katara Towers, the Pudong skyline, the KLIA skyline, the Hungaroring lake, the
Miami Turnpike overpass, the Silverstone Wing facade.

The dressing is not re-derivable from the line. It was placed circuit by circuit
against whatever s=0 that def defined, tuned by eye, and it is **inconsistent**
about it: most briefs put the pit building at lap 0.95–1.00 as though s=0 were
the real line, while Silverstone's Wing sits at 0.45 and its brief says *"S=0.0
at start/finish on the National pit straight"* — a straight 1.3 km from the real
one, and a claim untrue even of its own def. No reinterpretation of those numbers
is globally right, so the only safe transformation is to keep every landmark
exactly where it is and move the line alone.

`sceneryStartFrac` records the startFrac a circuit's scenery was authored
against. `TrackSpace.sceneryOriginDelta` turns it into a post-rotation applied in
`sceneryFrac` / `sceneryNode` / `sceneryRange`. Absent, it is a strict no-op —
verified by diffing all 40 circuits before any of them opted in.

**Two traps, both of which cost a full debugging pass:**

- **The remap was never running.** `transformSceneryApi` only applied when
  `def.reverse || def.sceneryCoordinates === "source"`. Forward racing-space defs
  — most of the grid — took neither branch, because racing space *is* the
  identity remap. The condition needs the shift as a third case.
- **The shift is NOT `startFrac - sceneryStartFrac`.** Those are CONTROL-POINT
  index fractions; an authored scenery fraction is an ARC-LENGTH fraction, and
  the control points are nowhere near arc-uniform (Monaco 21 m, Baku 70 m).
  Subtracting one from the other looked plausible everywhere and was still
  moving 34 k vertices at Istanbul. The right shift is the arc-length fraction at
  which the OLD origin sits in the NEW lap — a lookup into `dlen` inside
  `buildCenterline` (control point *j* opens at dense sample `j*SUB`), stashed as
  `_sceneryShift` beside the existing `_startFrac`. It needs no forward/reverse
  branch: a point that was `f` past the old line is `shift + f` past the new one,
  whichever way the lap runs.

### 2. Six emitters the remap never covered

`transformSceneryApi` remaps a hard-coded list of names, and six entry points
that take a node index or a lap fraction were absent from it:

| emitter | signature | circuits |
|---|---|---|
| `groundPatch` | `(k, side, gap, sz, col, opts)` | 35 |
| `overheadSpan` | `(spec)` with `spec.frac` | 16 |
| `circuitKit` | every method takes `spec.frac`, routed through `frameAt` | 16 |
| `groundedSegments` | `(spec)` with `points[].k` | 10 |
| `waterField` | `(k, side, gap0, gap1, …)` | monaco |
| `frameAt` | `(frac)` | the shared lookup |

That gap is why Miami's Turnpike overpass and Singapore's kit-built pit building
were the last two required models left in the road. They now take a **shift-only**
remap — origin shift, no side flip, no reverse/mirror handling — deliberately,
because the same emitters are unremapped on the four reversed circuits (monaco,
kyalami, paul_ricard, singapore) *today*, and giving them the full treatment
would silently move already-shipped geometry on circuits this change has no
business touching.

`frameAt` is wrapped at the API boundary rather than at its definition: `models/`
and the kits hold the raw one and resolve fractions the caller already handed
them, so shifting it at source would apply the shift twice.

**That latent gap is confirmed live, not just theoretical — three of the four
reversed circuits (monaco, paul_ricard, singapore) now carry a nonzero shift,
and the shift-only wrap is measurably wrong for them.** Evidence, from
Monaco: `tools/float-audit.cjs monaco --why` names `waterField`/`grandstandEx`/
`cameraTower`/yacht call sites, and floating clusters went **29 → 48** after
the shift landed; `tools/coplanar-audit.cjs monaco --why --raw` found pairs
with byte-identical bounding boxes at two different harbour locations — not
near-misses, the exact same box twice.

The mechanism: `waterField`'s raw `k` (like every non-reverse-aware emitter,
historically) was always passed straight through with no space conversion at
all — not even the reverse flip the STANDARD group (`place`, `anchor`, …) has
always applied via `TrackSpace.sceneryNode`. A reversed circuit's own `K()`
helper (monaco's is `(s) => Math.round(s * n) % n`, tracks.js:91) was tuned by
its author to compensate for exactly that absence — which means the fractions
authored for `waterField` and the fractions authored for `place`/`anchor` are
**not necessarily in the same space**, even within one circuit file, and there
is no way to tell which is which without checking each call site. Adding
`sceneryStartFrac`'s shift on top of an authored-space mismatch that was
previously invisible (because the shift was always zero) is what surfaced it.

Not fixed here: closing it correctly requires reading every `groundPatch`/
`overheadSpan`/`groundedSegments`/`waterField`/`circuitKit` call in the three
affected circuit files and determining, per call, which space its fraction was
actually authored in — guessing wrong moves already-shipped geometry rather
than fixing it. `tools/coplanar-baseline.json`, `tools/clip-baseline.json` and
`tools/float-baseline.json` were only LOWERED where this round's measurement
showed genuine improvement; monaco/paul_ricard/singapore's grown counts were
left as failing baselines rather than raised, so `npm run test:sweeps` stays
red on exactly this until the six-emitter gap gets its own pass.

### 3. The generic scatter — `HK` and the phased `every()`

The engine's own dressing draws from `hash(nodeIndex)` — which tree, which lamp
style, which side, which building kind — and walks the lap with `every(m, fn)` in
fixed steps **from the start line**. Both are origin-relative, so moving the line
rerolled the entire scatter and stepped it onto different physical points. That
is not cosmetic: it took same-facing coplanar faces past their baseline on
**thirteen** circuits (miami 11 → 19 spots, monaco 5 → 9), manufacturing
z-fighting out of nothing but a renumbering.

Two changes fix it, both keyed on the same shift:
- `HK(k)` — the origin-invariant alias of a node, used as the hash **seed only**,
  never as a position.
- `every()` is **phased** by the shift so it revisits the same physical nodes.

Together the draw and its positions hold still. Both are zero for any circuit
that has not moved its line, so untouched circuits are bit-for-bit unchanged.

### 4. Elevation and bridge anchors — the road surface itself

The three fixes above hold the DRESSING still. They do not touch the ROAD:
`def.elevations`/`def.bridges` are cosine bumps keyed by lap fraction, and
`resolve()` remapped `e.s` through `toRacingFrac(def, e.s)` — the same
`startFrac`-keyed transform used for the control points. That is index algebra
(`toRacingFrac` subtracts an index fraction), but `buildCenterline` then reads
the result as an ARC fraction (`e.s * total`) — the exact
index-fraction-vs-arc-fraction conflation section 1 above already named once,
recurring in a second place because the two remaps are textually distant and
nothing forced them to agree.

Invisible while `startFrac` never moved: an index-vs-arc mismatch at a FIXED
origin is just a differently-labelled correct answer. Moving the origin turned
it into a bug — measured with a same-physical-point elevation diff between the
old and new build, mean vertical drift ranged 0.3–10.7 m and **peaked at 42.97 m
at Spa**, while the horizontal (X/Z) drift at the same points stayed under 0.9 m
everywhere. The road climbed and dropped in places it never used to, out from
under scenery that had not moved — which is what "floating cluster" means, and
is why the grounding ratchet read 29 → 44 at Monaco and 3 → 15 at Vegas even
after fixes 1–3 above landed.

The fix separates two questions that had been sharing one variable: WHERE the
bumps sit in the authored trace (an index-fraction question — unchanged, still
`toRacingFrac`, still evaluated at the AUTHORING origin `sceneryStartFrac`, not
the corrected `startFrac`) from WHERE that lands in the built lap (an
arc-length question — the same `_sceneryShift` computed for the scenery in
fix 1, applied to `e.s`/`b.s` in `buildCenterline` exactly like a scenery
fraction is). The fine-surface undulation ripple is phased by the same shift
for the same reason: it is `sin(lapFraction * cycles)`, so an unphased origin
change slides its 0.14–0.42 m amplitude to different physical corners.

One more spot needed the same distinction: `resolve()`'s `hwZones` remap is
control-point-index-native — already origin-independent — but ran unconditionally
whenever `def.reverse || phi`. On a def with `phi === 0` (a straight pass-through
identity) it still wrapped an authored `s1 === 1` down to `0`, which would have
blanked a full-lap zone. Guarded to skip when there is no remap to do.

### 5. A full-lap barrier is `0 → 1`, not `shift → shift`

`recordBarrier(0, 1, side, gap)` means "the whole lap" — `scanBarrier` recovers
that intent from `|s1 - s0| >= 1`, a check the origin shift in `sceneryRange`
was breaking: rotating both ends by the same amount and wrapping collapses
`0, 1` to `shift, shift`, a ONE-NODE barrier instead of a 471-node one. Caught
by `tests/unit/shared-track-foundation-characterization.test.cjs`'s
`recordBarrier` fixture, which expected 471 wrapped nodes and measured 1.
Fixed by special-casing the full-lap span in `sceneryRange` to pass through
unrotated — rotating a full circle onto itself is a no-op by definition, so the
only correct answer was already sitting there before the shift was added.

### 6. Turn tables — `tools/rotate-markings.cjs`

A def's `turns` apexes are racing fractions and deliberately never
fmap'd, so the same physical apex acquires a new fraction when the line moves.
They are rotated by the same arc shift and then **re-sorted**, which is the whole
point: the array is consumed by index (`signBoard(..., idx + 1)`), so index 0 must
be the first apex after the line for Turn 1 to mean Turn 1. That is what fixes
albert_park and silverstone sorting their FINAL turn before T1 — both now have
`turns[0]` within 2 m of the measured first apex.

**Sectors are deliberately NOT rotated.** They are not timing-loop positions: the
whole grid carries the same handful of idealised thirds (`[0.30, 0.62]`,
`[0.32, 0.68]`, `[0.28, 0.62]`), i.e. "about a third of a lap from the line",
which makes them line-relative by construction and already correct against a
corrected line. Rotating them produced `[0.7160, 0.0360]` at COTA and
`[0.9953, 0.3453]` at Qatar, breaking the sectors' own `0 < s1 < s2 < 1`
contract — the shape of an answer that was never physical to begin with.

---

## What this unblocks

- **Turn numbering.** `turns[0]` is now the first apex after the line on 38 of
  40 circuits (the two exceptions are pre-existing and unrelated).
- **The albert_park / silverstone ordering**, where the final turn sorted before
  T1.
- **Turn-keyed aero-zone authoring — landed.** The handoff records that
  authoring zones as `(fromTurn, toTurn)` pairs failed — 35 of 68 spans came
  out short or curved — because `def.turns` numbered corners as "the N
  strongest curvature peaks in lap order" against a line in the wrong place.
  With that repaired, `js/physics/aero-zones.js`'s `AERO_ZONE_TURNS` now names the
  bounding turns for 21 of the 22 circuits with a published zone count (all
  but `monaco`, which is 0 zones and needs none). Deliberately NOT a fresh
  corner-by-corner re-research: each pair is derived from — and verified
  byte-identical to — the already-sourced `ZONE_COUNT` selection (the N
  longest qualifying straights), via `tools/aero-zone-turns.cjs` and
  `tests/unit/aero-zones-turns.test.mjs`. So today it changes nothing about
  WHICH straight is selected; what it buys is a selection that is ROBUST to a
  future geometry change (a new curvature-scan parameter would otherwise
  silently re-sort `runs` and move a zone) and a real per-corner DRS-zone
  citation to check future corrections against, instead of a bare distance.
  `bahrain` and `jeddah` are excluded from `AERO_ZONE_TURNS` for the same
  reason they were excluded from the startFrac fix — their lines were never
  re-derived, so their turn numbers are not trustworthy.

## Tools

| tool | what it does |
|---|---|
| `tools/startline-snap.cjs` | start-line coordinate → `startFrac`; re-derives trace storage order per circuit, projects onto segments, flags ambiguous branch snaps |
| `tools/startline-probe.cjs` | the two falsifiable checks, with `--calibrate`, `--snap`, `--frac id=v` |
| `tools/rotate-markings.cjs` | rotates + re-sorts turn tables onto the corrected line |
| `tools/track-verts.cjs` | per-circuit vertex + diagnostics dump for exact before/after diffing |
