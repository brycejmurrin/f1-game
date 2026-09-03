# Scenery grounding — measuring, positioning, filling, and not clipping

Written after an exhaustive float audit of all 40 circuits (see
`tools/float-audit.cjs`). It records *why* floating scenery kept recurring and
what to build so it stops, rather than listing the individual fixes.

---

## 1. The structural gap

The scenery system has strong **horizontal** guards and **no vertical ones**:

| Axis | Guard | What it enforces |
|---|---|---|
| Horizontal | `onTrack(x,z,margin)` | point is clear of any tarmac |
| Horizontal | `rejBox(c,sz,basis)` | full oriented footprint is clear of tarmac |
| Horizontal | `blockAt(k,side,gap,halfM)` | collision boundary matches the prop |
| Horizontal | `recordBarrier(s0,s1,side,gap)` | barrier line bookkeeping |
| **Vertical** | **— none —** | *nothing asserts a prop meets the ground* |

So "is this thing on the racing line?" is answered by the engine, while "is this
thing standing on anything?" is left to each caller's arithmetic. Every defect
found in the audit was vertical:

- roofs floating over their buildings (7 separate sites),
- crowds left behind when their seating riser was rejected,
- lamp heads cantilevered off poles with no arm,
- a beacon 1.85 m above every tall roof,
- a village grounded from one sample for 260 m of hillside.

None of these could have been caught by the existing guards, and all of them
were caught immediately once the vertical question was asked mechanically.

## 2. The two arithmetic traps

**Trap A — anchor semantics differ between primitives.**

| Primitive | `c` means |
|---|---|
| `addBox`, `addPyramid` | **centre** |
| `addPrism`, `addCyl`, `addCone`, `addFrustum` | **base** |

`addPrism(out, vadd(top, u, roofH / 2), …)` reads naturally and is wrong — it
floats by `roofH/2`. This single confusion produced seven defects. It is now
documented at the definition in `js/track/core/geom.js`, but documentation is a weak
control; §3 proposes a real one.

**Trap B — one ground sample reused across a wide model.**

`groundYAt(k, dist)` is a *point* query. Sampling it once and reusing the result
across a model that spans tens of metres assumes flat ground. On Imola's
hillside that put huts up to 47 m clear of the land. Any model wider than ~15 m
needs per-part sampling, or a foundation that spans down to the lowest corner.

A third, subtler variant: `anchor()` resolves height via `terrainYAt` (the
rendered ribbon) and falls back to `groundYAt` (closed form) off-ribbon. The two
disagree wherever the ribbon is carved or sags, so a model straddling that
boundary tilts or floats.

## 3. What to build

### 3.1 `seat()` — express intent, not arithmetic

Most floating geometry is a caller trying to say *"put this on top of that"* and
getting the offset wrong. Let them say it:

```js
// seat(prim, opts) → emits so the piece's UNDERSIDE lands at `on`
seat.prism(out, { on: bodyTopY, at: [x, z], size: [w, h, d], basis: b, col });
seat.box(out,   { on: roofY,    at: […],    size: […],       basis: b, col });
```

`seat.*` normalises the base/centre asymmetry in one place, so Trap A becomes
unexpressible. `seat` (and `foundation`, §3.2, plus `cantilever`, §3.4) now
ship on the `scenery(api)` contract — implemented in `js/track/tracks.js` and
already used by circuit files — so new scenery uses them by default. This was
the single highest-value change — it removes a whole bug class rather than
instances of it.

### 3.2 `foundation()` — filler instead of hand-built plinths

Several fixes this pass were "add the mass that should have been under it"
(Shanghai's terraces, Interlagos and COTA's stands). Make that a primitive:

```js
// Fills from the model's underside down to the ground beneath its footprint,
// sampling the corners so it stays correct on a slope.
foundation(out, { footprint: [w, d], at: [x, z], top: y, basis: b, col });
```

Rules it should encode:
- sample ground at all four corners **and** the centre; extend to the lowest,
- sink `~0.3–0.8 m` below grade so the seam never shows (the existing
  `place()` convention),
- inherit `rejBox` so a foundation can't spill onto the track.

### 3.3 Atomic assemblies — no orphaned parts

`crowdBank` emitted spectators through the unguarded `RAW` path while their
riser went through `rejBox`, so rejecting the riser left crowds on thin air.
The rule: **if a part is rejected, everything that rests on it must be dropped
too.** `modelGroup(…, {required})` already gives all-or-nothing staging; the fix
is to route composite props through it rather than emitting dependents directly.
Where that is too invasive, the cheap version is what was applied: test the
support first and `continue` before emitting dependents.

### 3.4 Cantilevers need visible structure

A head offset from a pole (lamps, floodlight lenses, signage) must emit the arm
that carries it. `streetLamp` does; Hungaroring's per-track copy did not, and
168 heads hovered. Any offset > ~0.5 m from its mast needs a connecting member —
this is also exactly the signature `float-audit` detects, so it self-polices.

## 4. Measuring it — `tools/float-audit.cjs`

Screenshots sample four points per lap and cannot prove absence. The audit runs
the real build in a Node VM (the `verify-track` trick) but keeps the vertex
buffers, then resolves per primitive **what it is resting on**:

1. index ground triangles (`road`/`terrain`/`floor`) and interpolate exact
   height — *not* binned vertices, which misreads cells spanned by large
   triangles,
2. seed: primitives whose lowest vertex touches that ground,
3. propagate: a primitive is grounded if it overlaps (XZ, with tolerance) a
   grounded primitive that rises to meet it,
4. **iterate to a fixed point** — a single bottom-up pass gets cantilevers wrong,
   because a lamp head hangs *below* the arm carrying it,
5. what is left is genuinely unsupported.

```sh
node tools/float-audit.cjs <track>          # count + worst offenders
node tools/float-audit.cjs <track> --why    # names each floater's SOURCE LINE
node tools/float-audit.cjs --all            # exit 1 if anything floats
```

`--why` works by re-running the deterministic build with stack capture enabled
only for the already-flagged primitives, so attribution costs nothing on the
common path.

**Validate any change to the detector by injection** — add a deliberately
floating box to a circuit and confirm the count rises by exactly one. Three real
bugs in this tool (a bad cell-key decode, single-pass ordering, and a fallback
that let any neighbour vouch for a floater) were caught that way, and its early
numbers were wrong until they were.

### Known-legitimate flags

Not everything elevated is a defect. Expect these and judge them:
- **Overhead spans** — gantries, bridge decks, footbridges (piers carry them,
  but a wide deck's centre can read as unsupported).
- **Suspended rides** — Abu Dhabi's `coasterLoop`, Ferris wheel rims.
- **Water-borne props** — Monaco's yachts float on water the ground model does
  not treat as a surface.

## 5. The gate

`npm run test:float` (`node tools/float-audit.cjs --all`) existed for a long
time and **ran nowhere** — no CI job, no test. It could not have been wired up
as written either: it exits 1 on any floater and 37 of the 40 circuits have
some, so a fleet-wide gate would have been red from the day it landed. A
detector nobody runs is a detector that does not exist.

What ships now is the per-circuit ratchet this section always argued for:

| | |
|---|---|
| caps | `tools/float-baseline.json` |
| test | `tests/unit/scenery-grounding.test.mjs` |
| runs in | `npm run test:sweeps`, which CI runs |

Semantics are copied from `tests/unit/prop-clipping.test.mjs` so both axes
behave the same: a circuit ABSENT from the baseline must read 0 (that is what
makes a new defect or a newly added circuit fail), a listed circuit fails when
it GROWS, there is no ALLOW hatch, and a cap sitting ABOVE the measured count
fails as slack — because that slack silently permits regressions up to it.

Two things learned wiring it up, both worth keeping:

- **`--all --json` over a pipe was truncated.** `console.log` to a pipe is
  async in Node and every exit path called `process.exit()` immediately after,
  so the ~180 KB payload lost its tail and the consumer got
  `SyntaxError: ... at position 219264`. It never reproduced locally because a
  shell redirect to a FILE is a synchronous write. The emitters use
  `fs.writeSync(1, …)` now. If you add another JSON path here, do the same.
- **Re-baselining is the move that hollows this out.** Doing it at a MERGE is
  legitimate — the baseline describes the tree it guards, and a merge makes a
  different tree — but it has to come with the deltas written down. When the
  deploy branch merged in, five circuits grew (+12, new scenery written before
  this guard existed) and two shrank (-4, from that branch's own Monaco fix).
  The decreases were not optional: the anti-slack test fails a cap left above
  the measured count, precisely so a fix in one place cannot leave headroom for
  a regression somewhere else.

Don't trust a "currently clean" list in prose — run the tool. At the time of
writing it is 3 circuits (miami, portimao, sepang), and an earlier draft of
this very section claimed 2, then 5.

## 5b. The inherited 12, and where the mechanical fixes ran out

Merging the deploy branch brought 12 new floaters from scenery written before
the guard existed. Two were **Trap B and fixed mechanically**, both in one line
once `terrainYAt(x, z)` reached the circuit API:

| | cause | result |
|---|---|---|
| spa | one `anchor()` reused along 248 m of the old-circuit ribbon | 7 → 6 |
| mugello | `anchor()` at the road edge, rows marching 37 m back up a hillside | 16 → 13 |

The rest are **not mechanical, and three were checked and deliberately left**:

- **mugello `terrazza`** — a TERRACED stand. Each row rises by design and steps
  into the hill; re-seating its rows on the terrain flattens the terrace and
  deletes the thing it is.
- **montreal Expo hall** — vertical aluminium fins projecting off each tier's
  façade. Cantilevered off a building, which is what a fin is.
- **montreal splayed-leg structure** — frustum segments at mid-height along legs
  that splay ~9 m out as they descend. The segments are elevated by
  construction; only the feet should touch.

The lesson for whoever picks this up: **elevated is not unsupported**, and the
count is not the target. Applying the Trap B pattern to any of the three above
would have improved the number and damaged the circuit. Judge each one against
§4's known-legitimate list before touching it.

## 5c. Singapore 18 → 19: three floaters that moved with a terrain fix

`3ee48bc` corrected Singapore's `elevations` source-fraction remap (it had been
solving `racing = source - startFrac` when the circuit's `reverse:true` makes
the actual remap `racing = wrap01(startFrac - source)`), which moved the
Sheares underpass dip and the Anderson Bridge rise onto their intended racing
positions — a real fix, and a net improvement (38 → 19 floating clusters
measured before → after on this circuit alone). Three of the survivors are new
at exactly the two moved features, all in §4's known-legitimate categories,
found by diffing `float-audit.cjs --json` before/after the commit and matching
each surviving cluster to its source line:

- **Anderson Bridge truss** (`js/circuits/singapore.js:515-522`, ~2.6–6.7 m
  gap) — an **overhead span**: the arched truss ribs and lamp posts now sit
  over the terrain rise that was moved here specifically to be under this
  bridge, so the deck reads as elevated the way a bridge over a rise does.
- **A second `makePortal` deck** (`:188`, ~7.3 m gap) — also an **overhead
  span**, `overheadSpan`'s declared clearance over the same newly-graded
  ground.
- **Bay water reflection streaks** (`:475`, ~1.3–1.9 m gap) — a **water-borne
  prop**: thin strips deliberately held 0.5 m above the water surface (see the
  comment at that line), just over `THRESH` now that the ground height nearby
  shifted with the terrain fix.

Re-baselined `singapore: 18 → 19` per §5's rule ("doing it at a merge is
legitimate... but it has to come with the deltas written down"). The other 16
floating clusters on this circuit are unrelated and untouched by this pass.

## 6. Clipping — the other half

Grounding and clipping are the same question on different axes, and the
horizontal side is already well served (`rejBox` footprint tests, the shoulder
bury, the terrain over-track clip). Two gaps remain:

- **Prop-vs-prop interpenetration** — now guarded and measured; see §6.1–6.2.
  `along()` documents part of the hazard (a box longer than the true node
  spacing shares volume with its neighbour), but that is *same-model* overlap,
  which blends and is deliberately accepted. The damage was cross-model.
- **Deliberate overhead geometry** bypasses footprint rejection by design and is
  only protected by `minimumClearance`. That contract is sound; it just has to
  be used (`overheadSpan`) rather than hand-rolled with raw boxes. The Suzuka
  crossover regressed precisely because its deck was authored 720 m away from
  the crossing it was meant to span, and no check related the two.

### 6.1 The detector — `tools/clip-audit.cjs`

The old exploratory `--clip` mode is gone. It reported ~15 700 pairs on Monza
and disclaimed its own numbers, and the fix it recommended — *"tag each
primitive with its emitting call site and report only pairs from DIFFERENT
models"* — **was tried and measured insufficient**: call-site identity alone
still leaves **3 207** Monza pairs, essentially all trees from one treeline
overlapping trees from another. That recommendation was wrong; this is what
works.

Four filters, in order, each justified by measurement:

| Filter | Effect on Monza | Why |
|---|---|---|
| soft-material class (both `FOLIAGE`/`WOOD`) | 15 962 → 1 874 | a forest is *supposed* to interpenetrate |
| emission adjacency (`\|q_a − q_b\| ≤ 8`) | 1 874 → 1 194 | primitives emitted back-to-back are ONE assembly — a bush's lobes, a tree's canopy tiers, a building's sections, one `along()` step's members |
| convex point-set SAT | rejects ~42 % (Monaco ~59 %) | an AABB over a diagonal wall is a fat over-approximation, and the error is worst exactly on corners, where the defects live |
| penetration depth ≥ 0.5 m | the reporting gate | see below |

Emission order is a better model-identity proxy than the call site, and it is
free — no stack capture. Call-site attribution stays, but for **naming** in the
report (`--why`), not filtering.

SAT runs over each primitive's **own vertices**, not an OBB rebuilt from
constructor arguments: `addPrism` is triangular, `addPyramid`/`addCone`/
`addFrustum` taper, and raw `emit()` polygons are arbitrary — an OBB over a cone
over-reports about as badly as an AABB over a diagonal wall.

**Severity is penetration DEPTH, not overlap volume.** Volume ranks by prop
size; depth ranks by what a player sees. Monza's largest-volume pair (609 m³) is
4 m deep, while Monaco's 8.8 m penetration is 2 219 m³.

```sh
node tools/clip-audit.cjs <track> [--why]     # defect list + call-site pairings
node tools/clip-audit.cjs --all --gate        # node tools/ci/test-bg.mjs clip
```

Gated by `tests/unit/prop-clipping.test.mjs` against `tools/clip-baseline.json`, on
the same ratchet semantics as `props-over-road.spec.js`: a circuit not in the
map must read 0, a capped circuit fails when it grows, no `ALLOW` hatch.

### 6.2 Blocking, not separating

Where two models meet, whichever got there first wins and the later one yields.
Overlap *within* one model is accepted — consecutive hedge or wall segments
sharing volume through a corner apex are the same colour and material, the
shared volume is interior, and it already blends.

**Re-spacing was tried and made things worse.** `cityFront`'s row, the
`neonTower` rows and bespoke per-track calls all step by CENTRELINE arc length
while standing metres out from the road edge, where the true world chord shrinks
by `(1 − curvature·distance)`; on a street circuit's corners their footprints
share volume. Clamping each unit's width to the chord actually available took
the fleet from **478 to 488** severe spots — narrowing a unit moves its centre,
which relocates the collision to a different producer instead of removing it.
`massBlocked()`/`massAdd()` replaced it: a later mass ≥82 % inside an existing
one is simply dropped.

Two rules this exposed, both load-bearing:

- **Dropping geometry must not drop the driving boundary.** `building()` and
  `neonTower()` still call `blockAt()` on the yield path — the ground is
  occupied either way. Skipping it loosened the limit on every street circuit
  and broke the walled-tight guarantee.
- **The index must know a model's bulk, not just its face.** `barSegs` records
  now carry a half-width, so `barrierClear()` measures to an obstacle's SURFACE.
  `indexSolid()`/`indexSolidAt()` register hedges, grandstands, seat bowls and
  placed props — which `recordBarrier` never did — so the existing
  `clearTreeDist()` move-or-drop handles foliage against them with no new code
  path. That one gap was ~89 % of Monza's cross-model pairs.

Fleet result: **679 → 348 severe spots**, no circuit regressed.

### 6.3 `safe()` can silently delete a whole circuit's scenery

Worth knowing before trusting any prop count. `Tracks.build` wraps each mesh in
`safe(name, geo)`, which on a `validateGeometry` failure logs a `console.warn`
and substitutes an **empty buffer**. One NaN vertex anywhere therefore costs the
entire mesh.

Silverstone shipped that way: `plantRoadsideTrees` spreads a stand over
neighbouring nodes as `k + (i%2) - (i>1?1:0)`, which at `k=0, i=2` is node
**−1**; `anchor()` read `undefined` off the typed arrays and the NaN propagated
through the whole props buffer. **783 066 vertices discarded**, the circuit
rendered with no scenery at all, and the only symptom was a warning nothing
reads. `anchor()` now normalises its node index defensively.

Check it directly rather than inferring it from vertex counts:

```js
track.geometryDiagnostics   // [{ name, ok, reason, vertices }] per mesh
```

## 7. Clipping you can fix in the RENDERER, without moving models

Not every visual "clip" is a placement bug. Two classes are pure rendering:

**Z-fighting on deliberately coplanar surfaces** (decals on tarmac, window
bands on facades, kerb ribbons). The usual workaround is a small geometric lift
— but a lift is fixed in metres while depth precision is not: the main camera
runs a `0.3 m` near plane against a `900 m` far plane, and a non-reversed depth
buffer spends almost all its precision in the first few metres. So a lift that
looks right in the pit lane quantises away at distance and the decal shimmers or
drops out.

The fix is `POLYGON_OFFSET_FILL`, now supported via `opts.depthBias =
[factor, units]` in `GLX.draw()` and used by the start line. Polygon offset
scales with the fragment's depth slope, so it wins at every distance and
grazing angle, costs nothing, and **moves no geometry**. Use it for any new
decal rather than lifting the mesh.

Further render-side options, in order of value if decal shimmer persists:
per-camera near planes (implemented: every view except cockpit and hood now
runs `near = 0.9` — a *global* raise breaks the cockpit, whose fascia sits
0.39 m from the eye; see RENDER-CLIPPING.md), then reversed-Z
with `WEBGL_clip_control` where available, and only then a logarithmic depth
shader (it writes `gl_FragDepth` and disables early-Z, so it is a real cost).

**Canopy pushing through barriers.** `float-audit.cjs <track> --foliage`
reports foliage primitives intersecting trackside barrier-shaped geometry, with
the penetration depth. `forestEdge()` already sizes its `dist` by canopy radius
so it cannot reach a wall; raw per-track `tree()`/`pine()` calls at a small gap
have no such guard, and that is where the intersections come from.

⚠ Same caveat as `--clip`: the barrier side is classified by *shape and
material* (untagged or hard-material boxes 0.5–6 m tall within 6 m of the road
edge), which also catches marshal posts, signage and stand fronts. Suzuka
reports 641 and Monza 1 — the ordering is meaningful, the absolute counts are
not. Tightening it needs the same call-site tagging as `--clip`.

### The canopy contract, and where it still does not reach

`canopyR(kind, h)` in `js/track/scenery/nature.js` is now the single source of truth for how
far a species' foliage reaches sideways. Both `forestEdge()` and the FURN
roadside scatter derive placement from it, so `dist` means *the clearance the
canopy's inner edge gets* — not the trunk offset. Two bugs were fixed by
introducing it:

- `forestEdge()` carried its own copy of the estimate, which still described
  `tree()`'s old `(2.9 + h*0.12)` skirt after the broadleaf crown was widened to
  `(3.7 + h*0.14)`. Its "GUARANTEED not to clip barriers" contract was ~0.9 m
  optimistic at h=16.
- The FURN scatter had no allowance at all — it passed `dist` straight through
  as a trunk offset, so any tree dropped within (barrier gap + crown radius) of
  a catch fence grew through it. This alone was Suzuka 326 → 190 canopy hits and
  Silverstone 7 → 1.

**What the contract cannot do on its own**: the intersections it leaves are
trees hitting barriers that belong to a *different part of the lap* — Suzuka's
Esses inner verge and its pit straight are the same strip of ground, Spa's
Raidillon wraps back onto Kemmel.

The tempting fix is to have the scatter consult `track.barL/barR`, deferring it
until after `def.scenery()` has recorded the per-circuit fences. **This was
tried and reverted — it cannot work.** Those arrays hold the *driving limit*,
i.e. the tightest lateral value, so a close fence records a SMALL clearance;
clamping a tree against it can only ever push out to the 9 m `RUNOFF_DEFAULT`,
never past the fence. And a per-node lateral table cannot represent a barrier
that belongs to another node's stretch of road at all.

### The spatial barrier index

The working guard asks the question in world space instead. `scanBarrier()`
records each barrier's **face as XZ segments** into `barSegs`; `barrierClear(x,
z, r)` answers "is any barrier face within `r` of this point" via a uniform grid
(`BAR_CELL = 24 m`) and point-to-segment distance. It neither knows nor cares
which node a wall came from, so the cross-lap cases above are ordinary hits.

`clearTreeDist()` walks a candidate trunk outward in 1.5 m steps until its crown
clears, up to +12 m, and **drops the tree** if nothing within reach is clear. A
missing tree in a gap with no room for one reads as correct; a tree growing
through a catch fence never does. Both foliage producers use it — the roadside
scatter in `plantTree()` and the per-track treelines in `forestEdge()`.

**Everything that plants foliage now runs last**, after `def.scenery()` returns:
the scatter is deferred out of the FURN pass, and `forestEdge()` only queues its
arguments (`deferredFoliage`) to be replayed at the end. This is not stylistic.
A track file is written in whatever order reads well — imola plants its
treelines at line 106 and builds the catch fences they intersect at line 387 —
so a guard that runs at call time is usually querying an empty index. Deferring
makes it order-independent: authors keep writing scenery in any order, and the
foliage always sees the finished barrier set. (Deferral *alone* was tried before
the index existed and did nothing; it needed both.) `barGrid` is invalidated on
every new segment for the same reason.

Two things this exposed that were not visible before:

- **`fence()` never registered its geometry at all.** `wall`, `guardrail` and
  `tyreWall` all called `recordBarrier`; `fence` called nothing. Catch fences
  were the one barrier class no guard in the engine could see — and the
  attribution pass showed they were the obstacle in most canopy intersections.
  They now call `indexBarrier()`, which feeds the spatial index **without**
  tightening `barL/barR`: a fence is solid enough that a tree must not grow
  through it, but it stands back beyond the runoff, so moving the driving limit
  out to meet it would change how the circuit drives. Keep those two concerns
  separate — `scanBarrier`'s `tighten` flag is the seam.
- **The generic corner tyre stacks had the mirror-image bug.** `buildProps`
  called `markBarrier` along each stack, which moves the driving limit but never
  tells the scenery engine that a metre-wide barrier physically stands there.
  They now also `indexBarrier()`. The two calls answer different questions and a
  barrier generally needs both.
- **The `--foliage` counts were never what they looked like.** They are
  primitive-*pair* counts: one tree overlapping one box scores once per canopy
  tier per box, so redbull's 613 collapsed to 25 real locations. The audit now
  prints distinct locations alongside the raw count, gates canopies by size
  (`backdrop()`'s wooded landforms share the foliage material and are hundreds
  of metres wide — that one false-positive class was most of redbull's count and
  all of spa's), and `--foliage --why` attributes each hit to the call sites that
  emitted both prims. Use `--why` before acting on any absolute number here.

**The counts that remain are an upper bound, not a defect list.** The screen is
AABB-vs-AABB. A fence panel is 0.05 m thick, but wherever the barrier runs
diagonally its *axis-aligned* box is metres wide, so a canopy comfortably clear
of the real panel still registers an overlap. The guard is exact — true
point-to-segment distance against the barrier face — so where the two disagree
it is the audit that is wrong. Each hit line now prints its lap fraction; feed
that to `__apex.orbit(frac, az, el, dist)` and *look* before treating a number
as a bug. Tightening this needs an oriented (or exact-geometry) test in the
audit, which is the obvious next piece of work here.
