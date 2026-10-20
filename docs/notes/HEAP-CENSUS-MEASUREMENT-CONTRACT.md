# Heap census measurement boundaries

`tools/gfx/mem-census.mjs` observes post-GC JS heap and successful public track builds. Its report separates completion, required-data completeness, correctness and an optional growth budget. A report or query existing is not evidence that the measurement passed.

Each expected visit needs finite raw heap bytes, installed track hooks, exactly the expected observed live track root and an actual renderer/API matching the request. TLX additionally needs its resource counters. Page errors, missing visits or duplicate visit samples prevent success. Boot can legitimately have no track. An interrupted run saves partial rows and a failure reason when `--json` is supplied.

The default is three cycles. `--max-growth-mb` requires at least three: the first warms caches, and the last-minus-penultimate comparison then excludes that first visit. Raw bytes determine the budget; legacy `heapMB` and `growthMbLastCycle` are rounded **MiB**, retained for consumers. `heapSeriesBytes` preserves every visit so a small final interval cannot hide earlier drift in the report. The separate browser spec now uses five visits and a median of the eligible warmed growth intervals with a 10 MiB budget. Documented Metal warm-release fixtures, known leaks and intermittent growth have focused controls; this diagnostic policy does not prove absence of every growth pattern.

The observer deduplicates object identity through WeakSets and prunes dead WeakRef records on reads. Two different live track objects with the same circuit ID remain two observations. Callback and promise completion of one decoded AudioBuffer remain one observation. Hooks do not cover partial/abandoned builds, every audio allocation path, all native storage or process RSS; forced GC also changes player-session behavior.

The collector copies primitive numeric fields from the installed Three `renderer.info.memory`, including `programs`, `programsSize` and `total`. In the installed r186 module, `info.memory.programs` is the program count; `info.programs.length` is an obsolete shape. Resource bookkeeping bytes estimate storage and are not physical GPU residency. The candidate also repairs the game's `tlx.memState().progs` consumer and exposes installed Info fields in the renderer-scoped change; software renderer probes and repeated track visits pass; hardware validation is recorded separately.

Animation callbacks and the picker warm log do not establish scene-specific visible presentation. Candidate picker reports persist bounded receipts for an actual submission observed after each fresh build, once the final warm attempt occurs and mark renderer display completion verified only when every expected visit has a matching successful receipt. Race-mode and legacy reports remain unverified; failures preserve presentation details and the active visit. Do not interpret a warm flag as completed presentation, or renderer completion as physical scanout. Software measurements establish execution/measurement behavior, not player-hardware performance.

CDP runtime memory fields retain their collection policy, scope and units in queries. They are sampled separately from performance.memory and can overlap; do not add heap, backing, embedder and renderer bytes into a total. Older reports lack the new completeness/correctness checks, even when their legacy verdict says `ok`.

Sources checked against the installed code:

- [Chrome heap snapshots and retained objects](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots)
- [Three Info memory categories](https://threejs.org/docs/pages/Info.html)

Focused falsifying controls live in `tests/unit/diagnostics-tools.test.mjs`; historical growth sequences remain in `tests/unit/mem-census-growth.test.mjs`. These controls validate the measurement contract; none proves absence of game memory leaks.
