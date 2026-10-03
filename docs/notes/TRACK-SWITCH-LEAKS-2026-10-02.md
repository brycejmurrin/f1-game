# Track-switch leaks: three's render-object cache outlives the geometry (2026-10-02)

Report: "crashes or memory leaks from loading multiple tracks". Measured on the
default TLX backend, Chromium headless (SwiftShader / WebGPU), on the PICKER path
a player actually takes — open RACE, tap a circuit (the picker pre-builds it,
`scheduleFlybyTrack` → `loadTrackStepped`), tap the next one. JS heap read after
three forced GCs, 12 s after each `build done`.

## Before (tip 5ed4c66d9)

| pick | monza | monaco | spa |
|---|---|---|---|
| cycle 1 | 100 MB | 112 MB | 124 MB |
| cycle 2 | 151 MB | 164 MB | 188 MB |
| cycle 3 | 203 MB | 216 MB | 239 MB |

~17 MB per pick, like for like, with the old `track` object itself already
collected (a `WeakRef` census of every built track read exactly one alive after
each pick). `renderer.info.memory.geometries` was steady per circuit from cycle 2
on, so three's geometry ledger was not the signal; the heap was.

GLX, race→race via `__apex.race(id)` (seven switches): live WebGL objects return to
identical counts per circuit (bahrain 504 buffers / 39.2 MB both visits), heap
flat within noise. No GLX leak on that path.

## The retainer (heap diff, cycle 1 → cycle 2)

| class | Δ count | Δ size |
|---|---|---|
| `system / JSArrayBufferData` | +1818 | +53 MB |
| three RenderObject (`nb`) and its per-object state (`{nodeBuilderState}`, `{bindGroup}`, `{pipeline}`, `Va`, `OE`, `PE`) | +676 each | — |
| `GPUBuffer` | +863 | — |

Retaining path of a 4.5 MB vertex array: `Renderer._objects._renderObjects` (Set)
→ RenderObject → `vertexBuffers` → the attribute. three r186's `RenderObject`
listens for `"dispose"` on its **object** and **material** and only then removes
itself from the cache; the **geometry's** dispose only nulls an attribute mirror
(`onGeometryDispose = () => { this.attributes = null; ... }`). TLX draws every track
mesh through pooled `THREE.Mesh` wrappers (`acquireMesh`); `releaseGeometry` and
`prunePool` detached a wrapper and nulled its fields, and `Mesh` has no `dispose()`,
so the wrapper's RenderObject — with the freed track's geometry and GPU buffers —
stayed in the cache for the session. The shadow pass's parked caster slots had the
same shape: `m.geometry = parkedGeo` on a hidden slot never reaches the render
object, which keeps the geometry it last rendered.

## Fix

- `tlx.js dropWrapper(m)`: detach, `m.dispatchEvent({ type: "dispose" })`, null —
  used by both `releaseGeometry` (track free) and `prunePool` (20 s idle sweep).
- `tlx-shadow.js releaseGeometry(geo)`: park every slot still pointing at a released
  geometry AND dispatch dispose on it; `tlx.js releaseGeometry` calls it.
- `tlx-chunked.js free`: clear `_visList` (one frame of a dropped world sat in
  module scratch).
- Side fixes from the static audit (none measured as growth, all orphan GPU memory
  on a failure or pin the old world through the next build's peak): a synchronous
  `Tracks.build` that throws frees its partial uploads; `TrackBuildClient.replay`
  frees handles on a throw; `PitSigns.upload`'s catch frees what it made; prop
  batches are owned as each lands; `BAY_CACHE` is bounded (48); per-track memos in
  start-lights / marshal-panels / overtake-mode are `WeakMap`s and vantage's
  per-call track is released after use (collide's step bindings were left alone:
  `pairContact` is called standalone by a unit test and reads them).

## After (same run, fixed tree)

| pick | monza | monaco | spa |
|---|---|---|---|
| cycle 1 | 100 MB | 101 MB | 99 MB |
| cycle 2 | 118 MB | 112 MB | 117 MB |
| cycle 3 | 119 MB | 112 MB | 117 MB |

Cycle 3 equals cycle 2 per circuit: the heap plateaus. The one step from cycle 1
to 2 is steady state being reached (the quality-recovery chunked copies of road
and terrain are built lazily, and the program warms fill their caches), not
growth — it does not repeat. Harness: `scratchpad/leak-repro.cjs` in the session
(Playwright, `--js-flags=--expose-gc`, `performance.memory` after three `gc()`s,
a `WeakRef` census of every `Tracks.build`/`buildPaced` result, three's
`renderer.info.memory`); the retainer came from a DevTools heap-snapshot diff of
cycle 1 vs cycle 2 (`compare_heapsnapshots`, then `get_heapsnapshot_retaining_paths`
on a 4.5 MB `Float32Array`).

## Rule

Any `THREE.Mesh` (or other Object3D) TLX stops using must dispatch `"dispose"`,
whether or not its geometry is disposed. `tests/unit/gfx-backend-canary.test.mjs`
pins `dropWrapper` as the only drop path and the shadow pool's release.
