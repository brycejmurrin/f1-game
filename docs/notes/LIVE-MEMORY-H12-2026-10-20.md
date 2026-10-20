# Live memory over time on the phone profile (B·H12, 2026-10-20)

Fleet B perf hunt, lane "live-memory": JS heap and renderer memory across a 5-lap race,
garage ↔ race ↔ menu round trips and a track switch, plus allocation rate and GC pauses,
on the live build (apex-sha `2eda36c6`, deploy tip at measure time).

Prior art (not re-reported): PERF-HUNT-SESSION-MEMORY-2026-10-17 (+R2), TRACK-SWITCH-LEAKS-2026-10-02,
GL-OBJECT-LEAK-2026-10-17, PERF-ALLOC-HUNT-2026-10-17, PERF-SCENE-CPU-2026-10-20 (#3218: per-step iterator churn).

## Method

`scratch/h12/leak-run.mjs` (not committed; regenerable): 844×390, `isMobile`, `hasTouch`, DSF 1, TLX default,
SwiftShader. Per cycle: `race(monza, 5 laps)` driven headless by the autopilot spec's closed loop, one rendered
window at lap 2 (Chrome tracing `v8.gc` + sampling heap profiler), pause → QUIT TO MENU, GARAGE open/close,
`race(spa)`, quit. Post-GC heap (`Runtime.getHeapUsage` after two `HeapProfiler.collectGarbage`), DOM counters and
`renderer.info.memory` at every step.

## Results

(pending)
