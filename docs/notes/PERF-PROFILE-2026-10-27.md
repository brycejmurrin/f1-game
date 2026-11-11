# Live perf profile — heap, CPU, real-GPU census, 2026-10-27

One Bryce-attended session: Chrome DevTools MCP heap snapshots and CPU traces on the
working tree in the cloud container (TLX on SwiftShader WebGPU, 4 cores), then
`gpu-census.yml` on `macos-latest` for real-GPU numbers. Procedure: skill `mcp-probe`
(§Heap leak across N races). Raw files stayed under ignored `artifacts/heap/`.

## Results

| Question | Answer | Evidence |
|---|---|---|
| Same-track restart leaks? | No — growth slows as `teamMeshes` (LRU 40, `js/car/car-draw.js`) fills | buffers +2.5 MB/race, then +0.7 MB/race over 4 more |
| Track switch leaks? | No | 4-track rounds: +0.6 MB, then −1.7 MB |
| Real-GPU race → quit leak? | No: census verdict `plateau` on WebGPU and WebGL2 | run 40599628347, 6 cycles Silverstone/Monza: ~2.2–2.5k GPU buffers (51–57 MB), ~146 MB textures |
| Silverstone build cost | ~1.2 s main-thread CPU (props geo 411 ms) | census `build: main=1238ms`; container main-thread build 0.95 s |
| Race-entry stalls (real GPU) | shader warm `warm:draw` 1,474 ms; `ensureRaceSession` + lazy audio 1,077 ms, of which `js/audio/engine.js` `onload` 774 ms | census `marks` / `loaf` rows |

The 774 ms `engine.js` `onload` is mostly the browser's audio device starting up. A
cold race entry traced in the container: parse 15.6 ms and evaluate 6.9 ms, then 245 ms
of CPU under `engine.js` frames, of which `createCtx` (`new AudioContext()`,
`js/audio/engine.js:508`) is 150 ms. A second bare `new AudioContext()` on the same page
took 0–2 ms, so that cost is a once-per-browser device startup, not game code (game-side
audio setup ≈ 95 ms). Open lead, not acted on: if the player's first `AudioContext` is
created at race entry, warming it on an earlier menu tap moves that stall off the start.

## Traps — read before trusting a profile here

- **Inlined getters get the blame.** A trace put 10.6 % of the main thread on
  `get level` (`js/race/race-control.js`), a one-field getter reached only when
  `capBlocks && blocker === c._qOf` (`js/game.js`). One sample carried a 532 ms gap
  (profiler start); the rest were the inlining caller's (`updateCarBrakePlan`) samples.
  Check sample count, the largest `timeDeltas`, and whether the call can be hot before
  believing a leaf.
- **The build worker starves beside SwiftShader.** The same `validateGeometry` took
  38 ms on the main thread and 2,262 ms in the worker; `buildRoad` 28 vs 752 ms. The
  GPU process held ~3 of 4 cores while the race rendered. Wall-clock sampling charges
  the wait to whatever function was running. Worker timings from this container are
  not evidence; build on the main thread (`Tracks.build(def, { gfx: <recorder> })`)
  or use the census.
- **The racing-line memo holds two circuits** (`MEMO_MAX = 2`, `js/track/core/line.js`).
  A benchmark that rotates more than two tracks measures `bakeFresh` (~4 s worker
  time here) on every switch; alternating two shows no bake at all.
- **Chrome's GPU process keeps spinning after `about:blank`.** Close the page; if
  `top` still shows it busy, kill it by PID (AGENTS.md rule 7).
- **`get_job_logs` returns at most the last 5,000 lines**, which can miss an earlier
  census step. The run's artifact JSON (`game-memcycles-*.json`, `game-*.json`) has
  everything: `download_workflow_run_artifact`, unzip into its own `artifacts/` folder.
