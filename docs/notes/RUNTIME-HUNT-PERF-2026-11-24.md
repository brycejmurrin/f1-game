# Runtime hunt A: perf hitches and memory growth a player feels, 2026-11-24

Kind: measurement · Re-measure-by: 2027-01-31

Summary: Measured on tip `0f252d0b` in the container's headless Chromium (TLX on three's WebGPU path, SwiftShader soft
adapter, soft-blit, 852×393 @1). Over 12 title→garage→race→results→title loops, listeners, timers, DOM nodes, three
textures and GPU MB all stayed flat after the first loop. Restarts reach the grid in about 200 ms. Warm in-race windows
had no long tasks. The garage exterior is the player-facing cost. The circuit's whole `scenery()` pass re-runs on the
main thread on every garage open, again at the title, and again inside every race entry. One unsliceable step costs
130–274 ms, and a build holds a ~33 MB transient JS working set. Second: the deferred car-warm drain overruns its 4 ms
budget by 10–80× per item, which lands 60–325 ms tasks in the first second of green whenever the lights are skipped.
GPU-bound numbers here (the 14 s first-race warm) are relative only. See [Needs the real GPU](#needs-the-real-gpu--iphone).

## Method

- Server `python3 -m http.server -b 127.0.0.1 3456`; one chrome-devtools MCP page; `__apex` driven by
  `evaluate_script`. Backend from `__apex.diag().env`: `three`, `api: webgpu`, `softAdapter`, `softBlit`, `headless`.
- An init script, installed before boot, counted live `addEventListener` minus `removeEventListener` per
  target/type/capture, live `setInterval` handles and pending `setTimeout`s. It also recorded rAF gaps and `longtask`
  entries per transition. Per-loop reads: `performance.memory`, DOM element count, `__apex.texCensus()` (three
  textures, render targets, attribute MB), `GLX.__tlx.memState()` (meshPool, churn), and
  `__apex.garagePrebuild().exterior`.
- Loop = click `#mb-garage`, wait for `#cs-done`, click it; `await __apex.race(id)` + `go()`; drive 5 s;
  `finishRace()`; click `#res-menu`. Restart = `finishRace()` then `#res-next` (RACE AGAIN), lights run normally.
- Cold start = a fresh navigation, the title settled for 3 s, then `__apex.race(id)`. Run 3× on monaco (street) and
  3× on monza (big). One extra cold run waited out real lights without `go()`.
- Heap snapshots after loops 1, 5 and 9 (post-GC, same page), compared A→B and B→C; retainers via
  `get_heapsnapshot_retaining_paths` and edge walks. DevTools traces around garage opens and one cold monza entry,
  attributed to functions with a sampled-CPU summariser (self and inclusive ms inside each `RunTask` ≥ 50 ms).
  SwiftShader's sync waits show as `(idle)` inside tasks and are discounted. Only JS CPU is cited below.

## Numbers

### Cold race entry (`await __apex.race(id)`, fresh page)

| track | run | entry ms | loadTrack | warmCarAssets | profile maxBlockMs | observed worst long task |
| --- | --- | --- | --- | --- | --- | --- |
| monaco | 1 | 2,857 | 908 | 1,362 | 172 | 306 |
| monaco | 2 | 2,801 | 958 | 1,295 | 156 | 260 |
| monaco | 3 | 2,476 | 691 | 1,253 | 147 | 246 |
| monza | 1 | 2,765 | 854 | 1,265 | 235 | 306 |
| monza | 2 | 2,554 | 675 | 1,304 | 236 | 279 |
| monza | 3 | 2,561 | 682 | 1,266 | 237 | 301 |

The first monaco loop on the instrumented page measured 3,224 ms. Warm re-entry on the same page (loops 2–12, monaco)
took 211–902 ms. Under real lights a cold monza grid waited 14.0 s for `warming` to clear, then 6.5 s of lights (20.6
s `race()`→green). Frames after green were clean. That wait is GPU pipeline compile on SwiftShader: real-GPU list.

### Restart (RACE AGAIN, real lights)

3 runs on monaco: the race reaches `count` 206 ms after the click; the startRace window is 125–190 ms, maxBlock
51–83 ms, 1–8 wrappers minted. Green comes 6.1 s after the click (the lights). A monza restart had no long task near
green.

### Loops ×12 (monaco; title→garage→race→results→title)

| read | loop 1 | loops 2–12 |
| --- | --- | --- |
| listeners (live) | 1,068 → 1,131 | 1,131 every loop |
| intervals / pending timeouts | 1 / 3 | 0 / 2 |
| DOM elements | 4,551 → 5,878 | 5,861–5,863 |
| three textures / render targets | 57 / 15 | 57–59 / 17 |
| GPU MB (texCensus) | 151.0 | 149.5–151.2 |
| transition worst long task | garage 50–288, results 55–107, title 0–81 | same band, no trend |

Post-GC heap (snapshots): loop 1→5 +29.4 MB (warm-up: `(array)` +15 MB, compiled code +6.8 MB); loop 5→9 +3.6 MB
(~0.9 MB/loop, led by +64k small `Uint32Array`s). Those arrays are held by the current track's
`_lightOccluders.cells` (`js/track/core/geom.js:441` lightIndexSteps), which is rebuilt per build. Promise +1,261 (25
KB) over 8 loops. Neither is a demonstrated leak; a 30-minute soak would settle it.

## Findings (ranked)

Verdicts are from `finding-verifier` on `0f252d0b`: 5 CONFIRMED, 1 NEEDS-BROWSER, 0 refuted, 0 stale.

| # | where | mechanism | player impact | fix sketch | test | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `js/garage/setup-camera.js:1608`, `js/garage/exterior.js:175-176,269` | Hiding `#carsetup` calls `releaseExterior()` → `exterior.release` (= `cancel`) → `discard` frees the whole built set. No CPU-side copy survives, so the next garage open re-runs `GarageExteriorGeometry.buildSteps` (`exterior.js:207`) from scratch. | Every garage open: a 130–210 ms main-thread task on monaco (traced ×2; the 2nd open 132 ms) and 274 ms on monza (`stats.maxSliceMs`), 3.3 s build wall time, 157k vertices re-uploaded, ~33 MB transient JS heap (a suspended build's generator retained 33.3 MB). On a phone CPU (2–4×) that is a 0.3–1 s freeze on the GARAGE tap. | Keep the last build's CPU arrays (or the GPU set) per `geometryKey` across `release`, an LRU of 1, so a reopen only re-uploads or re-shows. | Unit with a fake gfx: `request(k)` → `release()` → `request(k)` calls `buildSteps` once. | CONFIRMED |
| 2 | `js/garage/exterior.js:207-215`, `js/garage/exterior-geometry.js:217` | The build yields between iterator steps, but the circuit's `scenery()` callback (`js/circuits/scenery/monza.js:8`, `monaco.js:8`) runs inside one `iterator.next()` (`js/track/scenery/build-props.js:2160` calls `sceneryFn(sceneryApi, true)` inline; the yield follows at 2163). `deps.sliceMs` bounds steps per slice, not one step, so "sliced" builds still block 130–274 ms. | The size of every hitch in #1 and #3. | Split `buildRegion` so `scenery(api)` emits per region or batch (the track build already yields inside `build-props.js` buildSteps), or move the exterior CPU build to a worker. | `exterior-geometry` unit: no single step over N ms on monza with a fake clock. | CONFIRMED |
| 3 | `js/game.js:2745` → `kickRaceBundles` `js/game.js:2724` → `js/garage/setup-camera.js:1650` | Every `startRace` (outside a drive-out or arrival) asks for a garage-exterior build of the race circuit. It runs inside race entry beside `loadTrack`/`warmCarAssets`; by green the job is cancelled (`idle`, gen +2), and at the title it is rebuilt (gen 7→23 over two loops). | Cold monza entry: a 308 ms task, 77.6 ms of it monza `scenery()` via `exterior.js:196`. Wasted when no drive-in follows; adds to entry wall time. | Prewarm only when a garage arrival or drive-in will show it (flow known at `startRace`), or after green via idle; never during entry. | game-vm: `startRace` on a flow with no drive-in issues no exterior request. | CONFIRMED |
| 4 | `js/car/car-draw.js:1064-1078`, call `js/game.js:8665` | `drainDeferredCarWarm(4)` checks the budget only after each item, so one caster (`teamMesh(…, true)`) or atlas item runs whole: 27–39 ms CPU + GC per item here. Items left at green drain in the first race frames. | Under real lights the queue empties during the countdown (measured clean). Flows that skip the lights (`go`, `goRolling`, #5830) measured 60–84 ms tasks 0.5–0.7 s after green on 5 of 6 cold starts, and a 325/127/67/53 ms cluster in the traced run, at launch. | Stop before an item whose last measured cost exceeds the remaining budget; split caster builds; or hold green on skipped-lights flows until the queue is empty. | Unit: drain with a fake 30 ms item and a 4 ms budget runs 0 items when one is already over budget. | CONFIRMED |
| 5 | `js/render/three/tlx.js:4371` (prune), `js/garage/setup-camera.js:1667` | After a garage visit the next race entry minted 202–256 new meshPool wrappers (three RenderObject + object UBO + bind group each; `memState().churn.poolNew`), against 1–8 on a restart or a loop without the garage. The pool grew 1,219→1,429 in 3 loops and nothing is pruned for 600 s (deliberate, #5387). | Extra race-entry CPU after the garage (warmCarAssets 35–97 ms vs 9–11 ms on restarts) and 150–200 more live wrappers per garage visit inside the 10-minute window. Which geometries are re-minted is not yet attributed. | Attribute the re-minted geometries (car or preview meshes freed by `GarageScene.release`); keep race car geometry out of the garage release, or reuse wrappers by geometry key. | `memState().churn.poolNew` delta across a garage→race loop ≤ 10 (browser spec). | NEEDS-BROWSER (churn measured live; which geometries is unattributed) |
| 6 | `js/perf/race-entry-profile.js:79-88` | `recordLongTasks` drops entries delivered after the window is disarmed and clips each task to `winT0`. | Instrumentation only: `raceEntryStages().maxBlockMs` read 147–237 ms while an independent observer saw 246–306 ms on 6/6 cold starts, so phone-bridge entry numbers read low. | Record the unclipped duration with an `overlapMs`, and keep the observer one delivery past `end()`. | The synthetic-longtask seam (`race-entry-profile.js:458`): a task straddling `winT0` reports its full duration. | CONFIRMED |

Not re-reported (already known; prior-art scout): `endRace`/results sheet in one task (HITCH-MEM-LOAD-2026-11-18,
the 55–107 ms `toResults` task here); first-use pipeline compile on the phone; `updateCar*` boxed-double garbage
(#3100); listeners and GPU handles flat in `tools/perf/vm-leak-census.mjs`. That census covers race→menu only; this
hunt adds the garage, restart and results paths in a real browser and found them flat too.

## Needs the real GPU / iPhone

The orchestrator drives the phone bridge (skill `phone-bridge`) and can dispatch `gpu-census.yml`.

1. First-race warm wait. Here it was 14 s of `warming` before the lights. On the phone:
   `await __apex.race("monza"); const t=performance.now(); while(__apex.info().warming) await new Promise(r=>setTimeout(r,50)); [performance.now()-t, __apex.raceEntryStages()]`.
2. Garage open hitch (#1/#2). On the phone, from the title:
   `const s=__apex.garagePrebuild().exterior; [s.status, s.stats && s.stats.maxSliceMs, s.stats && s.stats.buildWallMs]`
   after tapping GARAGE twice (close between). Expect maxSliceMs × 2–4 vs 274 ms here.
3. Race-entry exterior prewarm (#3). On the phone:
   `__apex.raceEntryProfile().longTasks` for a cold `race("monza")`, and the gen delta of `__apex.garagePrebuild().exterior.generation` across it.
4. Deferred car warm after a skipped green (#4). On the phone: `await __apex.race("monza"); __apex.go();` then
   read `__apex.raceEntryProfile().longTasks` 2 s later, plus `__apex.frametimeBench` if a frame histogram is wanted.
5. Wrapper re-mint after garage (#5): `GLX.__tlx.memState().churn.poolNew` before and after a garage→race loop on
   WebGPU (Metal). A real GPU makes each mint's bind group and UBO cost real.
6. GPU memory across loops: `__apex.texCensus().mb` per loop ×5 on the phone (flat 149.5–151.2 MB here).
