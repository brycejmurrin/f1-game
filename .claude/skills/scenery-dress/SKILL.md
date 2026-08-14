---
name: scenery-dress
description: Use when the user asks to add/edit track scenery, dress a circuit, add buildings/trees/grandstands/barriers/mountains/billboards/floodlights, make Spa denser, fix floating/sunken/missing props, or work in a circuit scenery(api) callback.
---

# Dress a circuit's scenery

`buildProps` (the `js/track/scenery-*.js` modules — nature/city/structures/identity,
orchestrated by `js/track/tracks.js`; the 110-member `api` surface is frozen by
`tests/unit/scenery-api-contract.test.mjs`) calls each track's `def.scenery(api)` to lay down
3D props, then merges everything into one mesh. The full reference is
`docs/SCENERY-API.md` — **read it before non-trivial work**. This skill is the
working summary.

## Placement model

Every helper takes `(k, side, dist, …)`:
- `k` — node index `0 … n-1`. Convert a lap fraction with `Math.round(s * n) % n`.
- `side` — `-1` (left of racing direction) or `+1` (right).
- `dist` — metres **beyond the road edge**, measured outward from the centreline.
- `s` — lap fraction `0 → 1` where helpers take it.

Destructure what you need from `api` first — **forgetting `out` is the #1 crash**:
```js
scenery: function (api) {
  const { out, n, px, py, pz, hw, pyMin, night,
          place, prop, backdrop, anchor, every, hash, onTrack,
          tree, pine, palm, bush, forestEdge, hedge,
          building, tower, grandstand, billboard, gantry, marshalPost,
          wall, fence, guardrail, tyreWall, mountain,
          addBox, addCyl, addCone, addPrism, addPyramid } = api;
  // ...
}
```

## Helper families

- **Trackside boxes** (terrain-anchored): `place(k, side, dist, [w,h,d], col)`,
  `prop(k, side, gap, [d,h,len], col)` (placed by clearance), `backdrop(...)`
  (settles to lap low-point — organic mounds if green), `groundPlane(...)` (water/
  paddock slabs just below grade).
- **Vegetation**: `tree` (broadleaf), `pine`/`conifer`, `palm`, `bush`, `hedge`,
  `forestEdge(s0,s1,side,gap,opts)` (dense gap-aware treeline).
- **Structures**: `building(k,side,gap,w,h,d,opts)`, `tower(...)`, `grandstand(...)`,
  `billboard(...)` (use billboard-style fascia in tight street spots),
  `gantry(...)`, `marshalPost(...)`.
- **Barriers** (these tighten the driving boundary via `recordBarrier`): `wall`,
  `fence`, `guardrail`, `tyreWall`.
- **Terrain/relief**: `mountain(cx,cz,baseY,baseR,h,opts)`, plus raw primitives
  `addBox/addCyl/addCone/addPrism/addPyramid/addFrustum` (world coords, optional
  `[right,up,forward]` basis; winding auto-orients outward).
- **Utilities**: `every(metres, fn)` loops `fn(k)` around the lap; `hash(i)` →
  deterministic 0–1; `anchor(k,side,dist)` → ground point + track basis;
  `groundYAt(k,dist)` → terrain height estimate; `onTrack(x,z,margin)` → guard.

## Hard rules

- **Survey before placing.** Grep existing dressing at the target frac in
  `js/circuits/<id>.js` and read `docs/tracks/<id>.md` — avoid duplicating or
  fighting landmarks already authored there.
- **On-track rejection guard.** Every primitive emitter (`addBox`/`addCyl`/…) is
  wrapped in a Minkowski test against the road half-width at each node (`rejBox`/
  `onRoadHit` in the `js/track/` scenery modules). If a prop's **full oriented footprint** covers
  tarmac at **any** node it rises above, the **entire shape is dropped**. So props
  never half-clip the track — but a too-close prop silently vanishes. If something
  you placed isn't showing, increase `dist`/`gap` — **don't assume the console will
  tell you it happened.**
  - **The console warning is NOT universal.** The composite helpers
    (`building`, `tree`/`pine`/`palm`, `wall`/`fence`/`guardrail`, `tower`,
    `billboard`, `grandstand`, …) each call `Log.warn("scenery", "<name>
    SUPPRESSED at k=…")` on rejection — see `js/track/scenery-{nature,city,
    identity,structures}.js`. But the **raw primitive path**
    (`addBox`/`addCyl`/`addCone`/… called directly, e.g. from `RAW` or a bespoke
    shape) only increments a per-track counter (`_culled` in `js/track/tracks.js`)
    and logs a **single build-end summary** (`Log.info("track", "<id>: culled N
    on-track primitive(s)")`) with no per-instance identity — you get a count, not
    a location. A composite helper's SUPPRESSED warning tells you which call and
    roughly where; the raw-primitive path does not.
  - **Circuit-inline composites are still vulnerable.** Several
    `js/circuits/<id>.js` files call `onTrack(x, z, margin)` directly as a
    single-point guard for a bespoke shape instead of routing through a
    footprint-tested composite helper (grep `onTrack(` across `js/circuits/` —
    it's common). A single-point `onTrack()` check has exactly the bug described
    below for `building()`/mast helpers before they were fixed: it only proves
    that one sampled point is clear, not the shape's full oriented footprint. If a
    circuit-inline shape is silently vanishing OR silently clipping the track,
    check whether it's using a single `onTrack()` point rather than `rejBox(...)`
    over its widest section — the console will not distinguish these for you.
  - **Composite helpers must guard their whole footprint, not one point.** The
    footprint test only works if the *thing you test* covers the whole model. The
    "props over the racing line" bug came from `building()`/`neonTower`/floodlight
    masts testing a single inner-face **point** with `onTrack(x,z,margin)` — a
    long/deep model on a curving street then swept its body over a nearby
    doubling-back stretch the point never sampled. Both are now fixed to test the
    full `w×d` box via `rejBox`. If you add a new composite emitter, guard it with
    `rejBox(centre, [w,h,d], basis)` over its widest section — NOT a single
    `onTrack()` point — or it will re-introduce that class of bug.
  - **`RAW.*` bypasses the guard.** Crowd spectators are emitted via `RAW.addBox`
    for speed and are NOT footprint-tested; only place them safely BEHIND a shell.
  - **Regression coverage:** `tests/specs/props-over-road.spec.js` audits all 40 circuits
    in 3D and fails if any prop sits on/above the racing line beyond its documented
    `BASELINE` cap. Run it after scenery edits; measure a single track with
    `TRACK=<id> PORT=<p> node tools/measure-props-over-road.mjs --shots`.
- **Terrain anchoring.** `place`/`prop`/`anchor` sit on the actual raycast terrain
  when available, else fall back to a closed-form `groundYAt` estimate. Props set
  far out (>120 m) or on street circuits can float/sink where the estimate
  diverges — pull them in or use `anchor()` and read its `c[1]` height.
- **Reverse circuits.** When `reverse: true`, the engine auto-flips `side`; author
  scenery in the original trace direction and let it remap.
- **Vertex budget — a per-edit INCREMENT budget, not an absolute ceiling.**
  Shipped circuits run **400k–900k prop verts** (monaco ~493k, zandvoort ~532k,
  watkins_glen ~680k, suzuka ~685k), and **vegas ~1.8M is the known ceiling
  case — do not grow it** (~80 MB of GPU buffer against an iPhone SE that dies
  near 100 MB; see docs/research/CI-RENDERING-PERFORMANCE.md Part 2 and
  SCENE-GRAPH-PLAN.md §2). So the rule is relative: run
  `node tools/verify-track.cjs <id>` before and after, and keep your edit at or
  below the circuit's existing count unless you can say why the feature is
  worth the delta. Use `every(20)` for sparse features,
  `every(5)` only for hero sections; jitter sizes with `hash()` so ranks don't look
  like clones; double-place at two distances for depth instead of doubling density.
- **Overhead landmarks.** Bridges/flyovers (e.g. Monza Ascari) need clearance —
  a low `place()`/`building()` can intersect the deck from below.

## Validate

```sh
node tools/verify-track.cjs <id>     # must print OK ...; catches any throw in scenery()
```
Then bump the cache version (`bump-cache` skill — you edited a JS file) and eyeball
it with the `playwright-probe` skill's `shot.mjs`:
```js
__apex.race("<id>"); __apex.orbit(0.1, 60, 20, 60);   // sweep the dressing from outside
__apex.eyeAt(0.1, 0, 2.5);                              // driver's-eye — does it read right at speed?
```
The full suite's `terrain-over-road.spec.js` will flag any verge/terrain triangle
that ended up above the racing line.
