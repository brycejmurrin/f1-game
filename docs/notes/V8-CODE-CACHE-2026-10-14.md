# V8 code caches for the VM harness and node suites — measured, not adopted (2026-10-14)

Issue #1715 (plan: `docs/plans/research-2026-09-16/testing.md` §3). Question:
does V8 code caching speed up game-vm boots and the node suites?

## What was tried

- **3a, vm cachedData.** `tools/lib/game-vm.cjs` `runFile` compiled each game
  script with `new vm.Script(code, { filename, cachedData })`, keyed by a SHA-1
  of `process.version` + the transformed source, and wrote
  `script.createCachedData()` back after the first run (so lazily compiled
  functions were included). It was behind a switch, off by default and off
  under `NODE_V8_COVERAGE`. Cache: 317 files, 3.0 MB.
  https://nodejs.org/docs/latest-v22.x/api/vm.html
- **3b, `NODE_COMPILE_CACHE`.** Caches CJS/ESM modules that Node loads, but
  not `vm.Script` (Node ≥ 22.1; this box runs 22.22).
  https://nodejs.org/docs/latest-v22.x/api/module.html#module-compile-cache

## Measurements (4-core cloud container, loadavg 1.2–1.6, caches warmed first)

**One `createGame({})` boot, fresh process, 12 interleaved runs per arm (medians):**

| arm | total boot | game-script eval |
|---|---|---|
| no cache | 340 ms | 181 ms |
| vm cachedData | 257 ms | 108 ms |

**12 game-vm unit files (216 tests), `node --test --test-concurrency=1`, two rounds:**

| arm | round 1 | round 2 |
|---|---|---|
| none | 236.3 s | 236.3 s |
| vm cachedData | 239.0 s | 242.1 s |
| vm + `NODE_COMPILE_CACHE` | 237.8 s | 236.5 s |

## Verdict

**Not adopted.** Each boot saves about 80 ms, but these files spend about
20 s each running the simulation, so the saving is under the run-to-run noise.
The vm-only arm was the slowest in both rounds. Adopting it would add a
3 MB on-disk cache, an invalidation key and a coverage carve-out for no
measurable gain. `NODE_COMPILE_CACHE` was also flat. The harness change was
reverted; nothing ships.

Worth revisiting only if a suite boots the VM many times per test (hundreds
of short `createGame` calls). Then the 80 ms per boot would dominate:
measure fresh-process `createGame({})` boot medians
(`require("tools/lib/game-vm.cjs")`, time to resolved `createGame`) against
that suite's wall time before building it.
