# Scenery grounding — measuring, positioning, filling, and not clipping

Written after an exhaustive float audit of all 24 circuits (see
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
documented at the definition in `js/track-geom.js`, but documentation is a weak
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
unexpressible. Migrate the seven known sites first; new scenery uses it by
default. This is the single highest-value change — it removes a whole bug class
rather than instances of it.

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

## 5. Suggested gate

Add to CI once a circuit reaches zero:

```json
"test:float": "node tools/float-audit.cjs --all"
```

Gate per-circuit rather than fleet-wide while counts are non-zero — a ratchet
that forbids regressions on already-clean circuits (currently Miami and Vegas)
is more useful than a red build everywhere.

## 6. Clipping — the other half

Grounding and clipping are the same question on different axes, and the
horizontal side is already well served (`rejBox` footprint tests, the shoulder
bury, the terrain over-track clip). Two gaps remain:

- **Prop-vs-prop interpenetration** is unguarded. `along()` documents the
  hazard — a box longer than the true node spacing shares volume with its
  neighbour, which shows as z-fighting on straights and visible overlap on
  hairpins — but nothing enforces it.
- **Deliberate overhead geometry** bypasses footprint rejection by design and is
  only protected by `minimumClearance`. That contract is sound; it just has to
  be used (`overheadSpan`) rather than hand-rolled with raw boxes. The Suzuka
  crossover regressed precisely because its deck was authored 720 m away from
  the crossing it was meant to span, and no check related the two.

`float-audit.cjs --clip` implements the first half of this: it reports primitive
pairs sharing significant volume, filtered to trackside props of comparable size
(landforms are excluded — mountains and backdrop mounds are *built* to
interpenetrate, and unfiltered they drown everything else).

**It is exploratory, not a defect count.** Dense scenery interpenetrates by
design — forest canopies, crowd boxes, stacked building detail — and the pass
cannot separate those from mistakes because it has no model identity: on Monza
it reports ~15 700 pairs, nearly all legitimate. Finishing it means tagging each
primitive with its emitting call site (the machinery `--why` already uses) and
reporting only pairs from DIFFERENT models. That is the remaining work; until
then the ranked list is a lead, not a verdict.

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
raise the near plane (biggest single win for depth precision — it is the
*ratio* that matters, so `0.3 → 0.6` roughly halves the error), then reversed-Z
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

`canopyR(kind, h)` in `js/tracks.js` is now the single source of truth for how
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

**What the contract still cannot do**, and why the obvious fix does not work:
the remaining intersections are trees hitting barriers that belong to a
*different part of the lap* — Suzuka's Esses inner verge and its pit straight
are the same strip of ground, Spa's Raidillon wraps back onto Kemmel.

The tempting fix is to have the scatter consult `track.barL/barR`, deferring it
until after `def.scenery()` has recorded the per-circuit fences. **This was
tried and reverted — it cannot work.** Those arrays hold the *driving limit*,
i.e. the tightest lateral value, so a close fence records a SMALL clearance;
clamping a tree against it can only ever push out to the 9 m `RUNOFF_DEFAULT`,
never past the fence. And a per-node lateral table cannot represent a barrier
that belongs to another node's stretch of road at all.

A real guard has to be spatial: test the candidate trunk's world XZ (plus
`canopyR`) against recorded barrier *geometry*, the way `onTrack()` already
tests against the road. That is the missing piece — every existing guard in the
scenery engine is either horizontal-vs-road or vertical, and none is
horizontal-vs-barrier.
