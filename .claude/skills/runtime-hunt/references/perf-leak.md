# Mode A — perf / leak

## Contents
- Repeat loops · Per-iteration read-out · Hitch capture · Heap: snapshot, compare, retainers · The leak bar

## Repeat loops

Run every loop in pass 1 (js-debugger attached), then repeat the title ↔ race loop in pass 2 (chrome-devtools) for
the heap snapshots. Two circuits per run: one street circuit and one big track (the title roster: `apex_catalog`). Each loop is run on
both, in this order, with a read-out after every iteration:

| Loop | Iterations | What it exposes |
|---|---|---|
| Cold start → race | ×3 (fresh page each) | boot and first race-entry cost |
| Restart in race | ×3 | per-race state that survives a restart |
| Title ↔ race | ×5 | listeners, timers, GPU resources and scene objects never torn down |

## Per-iteration read-out

- Race entry: `__apex.raceEntryStages()` (the stage table) and `raceEntryProfile()` (legs, marks, long tasks,
  `maxBlockMs`); docs/DEBUG-HOOKS.md §raceEntryStages.
- Memory: `frametimeBench` (`heapUsedMB`), `texCensus()` (GPU bytes by kind), `lifecycle()`; a `memState` hook,
  if one lands, goes here. Bounded census: `apex_job_start {kind: memory_census}` (or `gpu_memory_census`,
  `vm_lifecycle`), then `node tools/perf/diagnostics.mjs` on the saved report.
- Listener / instance counts: js-debugger `debugger_listeners` and `debugger_instances` (window, document,
  `#game-soft`) — a count that climbs by a constant per iteration is the signal.
- Frame budget: `apex_profile` on a 20 s window in race.

## Hitch capture

js-debugger `debugger_profile` `hitch` arms rAF-gap capture on the attached page; run the transition, stop, read
the slowest frames' stacks (skill `js-debugger` references/tools.md). A hitch row names the function and the
file:line, not only the ms.

## Heap: snapshot, compare, retainers

chrome-devtools `take_heapsnapshot` (its `filePath` under `artifacts/`) after iteration 1 and after the last;
`compare_heapsnapshots` lists the classes that grew; `get_heapsnapshot_retainers` / `get_heapsnapshot_retaining_paths`
on a grown object names who holds it. Force GC between snapshots (the snapshot does). Only one heap tool open at a
time; js-debugger is detached and its Chrome stopped before this pass (skill `js-debugger`: never beside
chrome-devtools).

## The leak bar

Heap growth alone is not a leak (docs/AGENT-SURFACE.md route table). A leak row needs: growth that is monotone over
≥ 3 iterations of the same loop, a retainer path to a game object, and the file:line that adds it without a
matching remove.
