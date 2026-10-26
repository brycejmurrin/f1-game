# Long-session memory hunt (P5), round 2, 2026-10-17: GARAGE, WATCH replay, race to menu on 3 fresh pages

Branch `cursor/perf-mem-3c9a` (round 1: `PERF-HUNT-SESSION-MEMORY-2026-10-17.md`, PR #2671). Box: SwiftShader, no
`/dev/dri`, TLX, 844x390 touch, headless Chromium. Verdict: **no leak confirmed**. The evidence rule (growth on
>=3 pages AND a named retainer) is met by none of the three scenarios.

## Method (reproduce)

`scratch/memhunt.mjs <garage|replay|race|hub|season|career|settings|pause> <page> <cycles>` (untracked scratch, not committed; the
steps below are enough to rebuild it). One fresh browser per page. Per cycle: `HeapProfiler.collectGarbage`
twice, then `Runtime.getHeapUsage` + `Performance.getMetrics` (Nodes, JSEventListeners). Heap snapshots at cycle 2
and the last cycle (`HeapProfiler.takeHeapSnapshot`), diffed with chrome-devtools `compare_heapsnapshots`.
Harness traps found (each cost a run): `__apex.race()` needs a track id (`race("monaco")`); the `count` state is
only ~5 s before it starts itself, so wait for `count|race` and call `go()` only in `count`; `#pm-quit` is
two-step (the first click arms, the second quits); results to menu is `#res-menu`.

## Results (heap MB after GC; DOM nodes and listeners flat unless stated)

| scenario | page | heap by cycle | nodes | listeners |
|---|---|---|---|---|
| GARAGE open/close x10 | 1 | 16.99 ... 17.24 | 15567 -> 15716 (step at cycle 4, then flat) | 1892 -> 1929 (same step) |
| | 2 | 17.08 ... 17.80 | flat | flat |
| | 3 | 14.88 ... 15.48 | flat | flat |
| WATCH replay x6 (launch watch, 8 seek/follow, quit) | 1 | 41.78, 42.53, 44.51, 45.46, 45.97, 46.34 | flat | 1837 flat |
| | 2 | 42.14 ... 46.67 | flat | flat |
| | 3 | 41.77 ... 46.91 | flat | flat |
| race (monaco) -> results -> menu x6 | 1 | 31.63 ... 34.52 | 15412 -> 15407 | flat |
| | 2 | 30.95 ... 33.09 | flat | flat |
| | 3 | cut short at cycle 4 (35.4); not counted | | |

Timers/intervals were not sampled this round (round 1: flat).

## Why none of them is a leak

- **GARAGE**: +0.25/+0.72/+0.60 MB over 9 cycles, but the cycle 2 -> 10 snapshot diff on all three pages has no
  application class growing. The net is `(compiled code)` +0.6..0.85 MB (JIT tier-up) and
  `Performance*Timing` entries (~10 kB, the browser's own long-frame observers); DOM, `WebGLBuffer`, textures,
  pipelines and `KeyframeEffect` are flat or negative. No retainer exists to name. REFUTED.
- **WATCH replay**: +4.5..5 MB over 5 cycles but decelerating on every page (+2.0, +1.0, +0.5 on page 1) with
  nodes, detached DOM and listeners flat. The replay-2 diff (c2 -> c6) is `(compiled code)` +1.9 MB,
  `JSArrayBufferData` +1.7 MB (+202), `WebGLBuffer` +829, `WebGLVertexArrayObject` +151, `{pipeline}`/
  `{nodeBuilderState}` +33: the renderer GL-object growth that #2678 and #2637 own, not re-reported. +23k
  zero-size `(concatenated string)` objects have no retaining path in the c6 snapshot (cons-string joiners of
  shader/node-builder text). Nothing replay-specific (RealReplay state, listeners, timers) grows. REFUTED as an
  app-level leak; renderer part belongs to the excluded issues.
- **race -> menu**: rises 2.9 and 2.1 MB over 5 cycles with a shrinking step each time (warm-up, as in round 1), nodes
  and listeners flat. No snapshot diff taken for it (cut by the stand-down): UNPROVEN, leaning warm-up.

## Not done

Data Hub, career and season open/close cycles, the pause-menu/settings listener and timer census (`hub`,
`season`, `career`, `settings`, `pause` scenarios were written but never ran), race page 3, the race c2 -> c6 snapshot
diff. A container restart killed the background chain twice; run chains from a state file (skip a scenario whose
`artifacts/memhunt/<scn>-p<n>/rows.json` exists).
