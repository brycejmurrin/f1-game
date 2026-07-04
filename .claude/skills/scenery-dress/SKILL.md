---
name: scenery-dress
description: Write or edit a track's scenery(api) callback in js/tracks/<id>.js — the per-circuit prop dressing (trees, buildings, grandstands, barriers, mountains, billboards, floodlights). Covers the placement model, the composite-model helpers, the on-track rejection guard, terrain anchoring, the vertex budget, and common failure modes. Use for "add buildings to Monaco", "make Spa's forest denser", "the trees are floating", "dress this circuit".
---

# Dress a circuit's scenery

`buildProps` in `js/tracks.js` calls each track's `def.scenery(api)` to lay down
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
  `billboard(...)`, `gantry(...)`, `marshalPost(...)`.
- **Barriers** (these tighten the driving boundary via `recordBarrier`): `wall`,
  `fence`, `guardrail`, `tyreWall`.
- **Terrain/relief**: `mountain(cx,cz,baseY,baseR,h,opts)`, plus raw primitives
  `addBox/addCyl/addCone/addPrism/addPyramid/addFrustum` (world coords, optional
  `[right,up,forward]` basis; winding auto-orients outward).
- **Utilities**: `every(metres, fn)` loops `fn(k)` around the lap; `hash(i)` →
  deterministic 0–1; `anchor(k,side,dist)` → ground point + track basis;
  `groundYAt(k,dist)` → terrain height estimate; `onTrack(x,z,margin)` → guard.

## Hard rules

- **On-track rejection guard.** Every primitive emitter (`addBox`/`addCyl`/…) is
  wrapped in a Minkowski test against the road half-width at each node (`rejBox`/
  `onRoadHit` in `js/tracks.js`). If a prop's **full oriented footprint** covers
  tarmac at **any** node it rises above, the **entire shape is dropped** (logged as
  `[scenery] ... SUPPRESSED at k=...`). So props never half-clip the track — but a
  too-close prop silently vanishes. If something you placed isn't showing, check
  the console for SUPPRESSED and increase `dist`/`gap`.
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
  - **Regression coverage:** `tests/props-over-road.spec.js` audits all 24 circuits
    in 3D and fails if any prop sits on/above the racing line beyond its documented
    `BASELINE` cap. Run it after scenery edits; measure a single track with
    `TRACK=<id> PORT=<p> node tools/measure-props-over-road.mjs --shots`.
- **Terrain anchoring.** `place`/`prop`/`anchor` sit on the actual raycast terrain
  when available, else fall back to a closed-form `groundYAt` estimate. Props set
  far out (>120 m) or on street circuits can float/sink where the estimate
  diverges — pull them in or use `anchor()` and read its `c[1]` height.
- **Reverse circuits.** When `reverse: true`, the engine auto-flips `side`; author
  scenery in the original trace direction and let it remap.
- **Vertex budget.** Keep the props mesh roughly **under ~50k verts** (SwiftShader
  in tests is tighter than desktop WebGL2). Use `every(20)` for sparse features,
  `every(5)` only for hero sections; jitter sizes with `hash()` so ranks don't look
  like clones; double-place at two distances for depth instead of doubling density.

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
