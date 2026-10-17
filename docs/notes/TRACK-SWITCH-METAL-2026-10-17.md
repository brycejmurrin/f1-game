# track-switch-memory on Metal (2026-10-17)

Red: `renderer-macos` job, `tests/specs/track-switch-memory.spec.js` fails attempt 1 and passes the retry
(`monza: heap 133 → 150.4 → 164.8 MB`, bound 10 MB; #2604 run 39012574309, #2634 run 39014200140).
Under `APEX_FAIL_ON_FLAKY` that is a red job. The 10 MB bound was calibrated on SwiftShader.

## Verdict

**Not a per-pick leak. A one-time ~13–17 MB step on monza's first revisit that lands at visit 2 or visit 3,
then ~0.6 MB a visit. Its cause is NOT named.** The step is reproduced on Metal and on local SwiftShader.

The spec compares visit 3 with visit 2 and assumes the first visit is the whole warm-up. When the step lands
in the visit 2 → 3 interval the check fails on timing alone (the original red); when it lands in 1 → 2 it passes.

## Evidence (instrumented spec, branch history e517b8a0 … 24359540; the diagnostic code is in 24359540)

Heap after forced GC (CDP `HeapProfiler.collectGarbage`), four re-reads per reading with a 1.5 s settle between
them: identical to ±1 MB, so the number is not GC timing.

| run (head) | attempt | monza visits 1–5 (MB) |
|---|---|---|
| 39017426292 (efaf8646, 3 visits) | 1 | 133.1, 148.5, 150.0 |
| | 2 | 136.2, 151.4, 152.9 |
| 39018575798 (1391db9a) | 1 | 133.1, 148.6, 149.9, 150.5, 151.2 |
| | 2 | 134.2, 151.5, 165.8, 166.4, 167.1 (steps at visits 2 AND 3) |
| 39021138295 (93f79b1f), 39022463641 (24359540) | 1, 2 | step at visit 2 in all four (e.g. 133.2, 148.7, 150.0, 150.6, 151.3 and 136.0, 151.6, 153.0, 153.5, 154.2) |
| local SwiftShader, TLX GL | – | 138.6, 155.4, 157.1, 157.0, 158.0 |
| local, models preloaded | – | 142.1, 158.6, 159.6, 160.9, 160.5 |
| original red (#2604 run 39012574309, 3 visits) | 1 | 133, 150.4, 164.8 (step at visit 3) |

- Metal runs three's native WebGPU path (`backendState().api = "webgpu"`, `softBlit: true`); the SwiftShader
  calibration only ever exercised the GL path. The step exists on both.
- Heap-snapshot diff, monza visit 1 → 3: **+13.0 MB `system / JSArrayBufferData`** with the buffer COUNT falling by
  91–118, +2 MB InstructionStream (JIT, normal). The new 1.3–4.3 MB buffers are Float32/Int16 `BufferAttribute.array`
  (color / normal / mat / position) of three RenderObject `attributes`, reached through WeakMaps from
  `window.scene` and `renderer.lighting`: the CURRENT world's vertex arrays, not an old world.
- Not a retained world: `aliveTracks` is exactly one at every reading; `nodeBuilderCache` (32), `_pipelines.caches`
  (40), geometry dispose listeners and render objects are constant from visit 2 to 5; the exact WeakRef and
  zero-orphan assertions in the same spec pass.
- The #773 retainer was the same class (`JSArrayBufferData`) but the buffer count GREW every pick (+1818, +53 MB a
  cycle). Here the count falls and the bytes plateau.

## Ruled out (each with the measurement that killed it)

- **GC / settle timing**: four re-reads after repeated GC are flat.
- **TLX CPU-mirror release (`_mirUsed` gate, tlx.js:5465)**: `memState().mirror` is `sweeps 0, geos 0, freedMB 0,
  chunks 0, gate "----"` at EVERY visit including visit 1. Nothing is ever released in the picker flow (the env
  probe never latches there), so v1 and v2 both carry their CPU arrays. An earlier version of this note's
  diagnosis blamed `_mirUsed`; the counters contradict it.
- **Baked-model pack not resident at the first build**: `Assets.state().models` is 0 before the first monza pick
  and 77 after, but preloading the whole pack (`Assets.loadModels()`) before the first pick still steps
  (142.1 → 158.6).
- **Render-object / geometry-set differences**: `renderer.info.memory.geometries` and the render-object count flip
  between ~35/62 and ~171/203 from visit to visit (what the picker's warm frames drew) with the heap not following.

## Open

The step is steady-state content of monza's revisit built world (monza ends ~16 MB above monaco; their first
builds are equal), so something the FIRST build of a circuit in a session does not carry. It is bounded in every run
(visit 5 within 1.3 MB per visit of visit 3) and is not the leak class this spec guards. What is missing is its name.
Next probes, none run: diff the first and second builds' attribute buffers by owner (which `scenery()` emitter or
batch the +13 MB belongs to), `track.stats`/prop counts per build, and the track-build worker path versus main thread.

## The spec change this supports (NOT applied; needs the orchestrator's decision)

`sustainedGrowthMB()` (tools/lib/mem-census.mjs, unit-tested in `tests/unit/mem-census-growth.test.mjs`): five
visits, the SMALLEST interval after visit 2 must be within the SAME 10 MB. A leak grows every interval, a one-time
step lands in one or two. Replay: #773 (100, 151, 203, 254, 306), +14 and +26 MB a round (2026-10-04) and an 11 MB a
pick leak all still fail it; both Metal runs, including the two-step one, pass it; the old visit-3-minus-visit-2
verdict fails the original red.

## Follow-ups (not done)

- TLX never frees CPU vertex mirrors in the picker (counters above) and, per tlx.js:1300, the default helmet camera
  takes the eager mirror warm so `_mirUsed` is normally true in a race: ~13 MB a world on desktop, more on a phone.
  Worth measuring in a race with `gpu-census.yml`, not assumed.
- A heap-diff tool (not written): the CDP snapshot aggregator with BFS retaining paths used here (validated on a planted
  3 MB buffer) belongs in a tool, not a temporary spec edit.
