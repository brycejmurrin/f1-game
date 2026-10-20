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

This box binds GLX on the phone profile (`webgl2 (pick: three)`, SwiftShader), so `renderer.info` is absent and the
rendered window runs 1–2 fps: the per-frame allocation rows below are indicative only, and the GPU side needs
`gpu-census.yml` on real hardware. The JS heap and ArrayBuffer rows are backend-independent game state.

## Results — ranked

| # | finding | size | retainer | where | status |
|---|---|---|---|---|---|
| 1 | Every finished race's cars, and through `car._lk.track` the whole track (scenery placement records, model instances, ~12 MB of Float buffers), stayed reachable for the session | +12 MB heap and +12 MB ArrayBuffer per cycle, unbounded | `Collide._arcBuckets` → bucket → old car → `_lk.track` → `props.list`. `fillArcBuckets` left entries past `_arcN[b]` stale on purpose (to keep the backing store); a bucket a later race never refilled kept an earlier race's car | `js/physics/collide.js` `_arcClear` | **fixed** (`_arcClear` nulls the slots it drops) |
| 2 | The last field (and its track) stayed in step scratch until the next race overwrote it | 1 track, ≈ 6–16 MB, one generation | `G` context → `_finRanked` (and `ranked`, `parked`) → old car → `_lk.track` | `js/game.js` `rankFinishers` | **fixed** (`releaseFieldScratch()` in `quitToMenu` and `makeCars`) |
| 3 | The previous track is still alive for the first lap of the next race | ≈ 6 MB heap + 6 MB buffers, transient | not yet traced | — | open |
| 4 | The menu holds ~11 MB more than a race: it appears a few seconds after the flag (idle garage prebuild, `js/garage/prebuild.js`) and is released at the next race start | ≈ 11 MB, transient | not traced | — | open, by design? |
| 5 | Physics step allocation ~65 KB/step (boxed doubles in `updateCar*`) | ≈ 4 MB/s at 60 Hz, young-gen only | — | `js/game.js` `updateCar*` | PR #3218 (B·H9) owns it |

Within one 5-lap race the post-GC heap is flat (25–27 MB): nothing grows per lap.

## Before / after (post-GC, MB, `scratch/h12/leak-run.mjs --cycles 3 --laps 5`)

Base `2eda36c6` (worktree) vs this branch, same harness, same box, run back to back. Each cycle: race → results → MENU →
garage → spa → menu.

| step | before heap / buffers | after heap / buffers |
|---|---|---|
| cycle 1 menu | 45.5 / 43.2 | 45.4 / 43.2 |
| cycle 2 menu | 57.7 / 55.4 | 49.6 / 49.1 |
| cycle 3 menu | 69.8 / 67.6 | 49.9 / 49.1 |
| cycle 3 monza race end | 52.5 / 60.9 | 32.5 / 42.4 |

Growth from cycle 2 to cycle 3 at the menu: +12.1 MB heap and +12.2 MB buffers before, against +0.3 / 0.0 after.

Guard: `tests/unit/traffic-arc-buckets.test.mjs` "arc buckets never keep a previous field's cars alive" (WeakRef +
`--expose-gc`). It fails with the nulling line removed.
