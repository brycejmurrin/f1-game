# Parallel hunt — what can leave the main thread (A·H14, 2026-10-24)

Lane A·H14 (Fleet A, wave 34). The ask: find work the game can move off the
main thread or run in parallel, rank it, and prototype the best wins behind an
`apex26.*` flag that defaults OFF. Bryce plays TLX on three's WebGPU backend on
an iPhone, so that path is weighed first.

This note builds on [MULTITHREADING-PLAN-2026-09-16](MULTITHREADING-PLAN-2026-09-16.md)
and does not repeat it. That plan's verdicts still stand unless a row below
reopens one with a new number.

## 1. Constraints, re-checked against current sources

| constraint | finding | source |
|---|---|---|
| SharedArrayBuffer / WASM threads | Need `crossOriginIsolated`: COOP `same-origin` + COEP `require-corp` or `credentialless`. GitHub Pages sets neither. | [MDN crossOriginIsolated](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated) |
| service-worker header shim | Works on GitHub Pages: a service worker can add COOP/COEP to its responses. Costs: a forced reload on first visit, and every subresource goes through that worker. It also clashes with our one generated `sw.js`. Safari has no `credentialless`, so the shim must fall back to `require-corp` there, which blocks any cross-origin response without CORP/CORS. | [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) (`coepDegrade`, `doReload`); [tomayac 2025-03](https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/); [StackBlitz on credentialless](https://blog.stackblitz.com/posts/cross-browser-with-coop-coep/) |
| OffscreenCanvas on iPhone | Partial in Safari iOS 16.2–16.7 (2D only); full from 17.0. | [caniuse offscreencanvas](https://caniuse.com/offscreencanvas) |
| WebGPU in a worker | `WorkerNavigator.gpu` is not Baseline. WebGPU itself ships in Safari 26 (iOS 26). I found no WebKit source that states `OffscreenCanvas.getContext("webgpu")` works in a dedicated worker on iOS. **Unverified: it needs a device probe** before any renderer-in-worker work. | [MDN WorkerNavigator.gpu](https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/gpu); [WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |
| classic vs module workers | All game workers are classic (`importScripts`), which matches the IIFE rule. TLX reaches three through an inline import map that a classic worker cannot use. Any three-in-a-worker would have to be a module worker, which is the one case where the no-ES-modules rule would need an exception. | MULTITHREADING-PLAN §5; `js/track/build-worker.js` header |
| determinism | Physics/AI may not cross a thread: the car step reads rival state inside the same step, so the only options are a synchronous round trip (needs SAB) or a one-frame delay (changes results). Off-thread work must be pure data in and the same bytes out. | MULTITHREADING-PLAN §5 |

**Verdict on the shim: still drop.** Nothing on the ranked list below needs
shared memory. The shim would cost a first-visit reload on Bryce's phone and a
second service worker, and buy nothing.

## 2. Existing levers — keep / revisit / drop

| lever | where | verdict | why |
|---|---|---|---|
| track build Worker (`apex26.buildWorker`, ON when multi-core) | `js/track/build-client.js`, `build-worker.js` | **keep** for in-session switches; cold entry stays on the paced build | PR #1175's quiet A/B: worker plus replay made race-entry maxBlock and wall time worse (`js/game.js` loadTrackStepped comment). |
| `Tracks.buildPaced` slicing (16 ms, scheduler.yield) | `tracks.js` buildPaced | keep | Already split into slices (PR #3385). |
| `compileAsync` warms (scene, shadow, post, sky, mirror, fx) | `js/render/three/*` | keep. Revisit only the serial fx probes (§3 row 4) | Three 0.186's `compileAsync(scene)` already issues `createRenderPipelineAsync` for every pipeline at once, so the scene warm is not serialised. |
| `createRenderPipelineAsync` | `js/render/webgpu/wgx.js` | keep | Opt-in WGX only. |
| KHR_parallel_shader_compile batching | `js/render/glx/glx.js` beginLinks | keep | WebKit 251514: parallel linking is not wired on ANGLE-Metal, so iOS still links on the main thread (BOOT-LOAD-TOOLING-RESEARCH). |
| `BitmapDecode.decode` worker | `js/workers/bitmap-decode-*` | **revisit → now used by P1** | Before this lane it had no caller at all (only its own test). The P1 `strip` lane reuses the worker and its boot-loaded client, so no new script tag was needed. |
| pack strip byte decode (inflate + unfilter) | `js/render/shared/assets.js` `_decodeStripBytes` | **revisit → P1** | Pure CPU on the main thread, sliced per layer. Measured below. |
| OffscreenCanvas uses | share-card, tlx scratch, assets | keep | Scratch canvases only; no renderer. |
| Rapier (WASM) debris side-world | `js/physics/debris-world.js` | revisit (§3 row 3) | `prime()` builds the road trimesh BVH on the main thread, about 216 ms on vegas, inside the countdown. |
| renderer in a worker (OffscreenCanvas) | — | **drop (again)** | Same reasons as the 2026-09 plan (pointer events, import map, every `__apex` hook binds to the main thread), and WebGPU-in-worker is unverified on iOS. The iPhone costs are pipeline compile and GPU-side, which no thread move touches. |
| SAB / WASM threads / parallel physics | — | drop | §1. |
| audio decode / data-hub parse | — | drop | `decodeAudioData` already runs off-thread; the data payloads are small (MULTITHREADING-PLAN §5). |

## 3. Ranked opportunities

Score = main-thread ms saved on the player's path × feasibility × (1 − risk).
"ms" are measured where stated, else estimated and labelled.

| # | opportunity | main-thread ms saved | feasibility | risk | owner lane | status |
|---|---|---|---|---|---|---|
| 1 | **P1: pack strip decode in the BitmapDecode worker** | **539 ms at 4× CPU, 111 ms at 1×** (high tier, measured §4) | high: pure bytes in, bytes out | low: byte-identical, falls back on any failure, default OFF | A·H14 (worker) + A·H15 (assets.js hook) | prototyped |
| 2 | iPhone WebGPU `programWarm` / pipelines (15–18 s of first-race entry) | the largest number in the game, but GPU-process compile, not main-thread JS | low for threading. Async pipelines already run concurrently | — | A·H10 / A·H12 | not a thread move. Attack it by compiling fewer pipelines (variant count), not with workers (DEVICE-FARM-ANALYSIS rows 12–21) |
| 3 | Rapier debris road world in a worker: build the trimesh there, `takeSnapshot()`, transfer the bytes, `World.restoreSnapshot` on the page | **build 111 → restore 8 ms (vegas), 101 → 11 (monza), 50 → 4 (monaco)**, measured §4b | medium: the snapshot API works in the vendored 0.19.3. Costs a 4–8 MB transfer and a second WASM instance in the worker | medium: construction order is the determinism contract (`debris-world.js` prime comment). A ball trajectory is bit-identical after a restore; the full mirror/furniture world is not yet checked | A·H13 (`js/physics/**`) | measured. Proposal for A·H13 |
| 4 | Serial fx warm probes in TLX (`warmFxPrograms` awaits 5 `compileAsync` in a row) | GPU-side. With WebKit's async compile queue it may overlap. Estimate ≤ 5 pipeline latencies | high: `Promise.all` over the jobs | low | A·H10 (`js/render/three/`) | proposed on the bus. Needs the census to measure |
| 5 | `ChunkBins.bin` + chunk packing during build-worker replay (runs on the page even when the worker built the track) | unmeasured; in-session switch only | medium: needs the bins in the worker's recorder | low | A·H15 (`js/track/`) | measure with `__apex.buildProfile()` on a track switch |
| 6 | car / helmet mesh build (~800 ms first draw, a 2026-09 estimate) in a worker, like the track build | ≤ 800 ms (estimate) | low: `Car3D` recipes touch gfx and liveries | medium | car/render lanes | first attribute the cost (RaceEntryProfile `warmCarAssets` span) |
| 7 | livery `createImageBitmap` (car-draw.js) through `BitmapDecode.decode` | small (browser decode is already async) | high | low | render lane | low value. Listed because the worker exists now |
| 8 | renderer / physics / AI in workers, SAB shim, WASM SIMD math | — | — | — | — | dropped (§1, §2) |

## 4. P1 — pack strip decode off the main thread

**What it does.** Before this change, on the default path, `Assets.load` inflates
each baked strip (`mat-albedo-256.png`, `mat-normal-256.png`; 17 layers) with
`DecompressionStream` and undoes the PNG scanline filters in JavaScript on the
page, one layer per task. With `localStorage["apex26.packDecodeWorker"] = "1"`,
the page instead posts the strip Blob to the existing BitmapDecode worker
(`js/workers/bitmap-decode-worker.js`, new `strip` message). The worker runs the
same reader (`PngStrip`) and transfers back one RGBA `ArrayBuffer`; the client
(`BitmapDecode.strip`) cuts it into per-layer views. Any refusal, error or
timeout answers `null`, and the page decodes exactly as before.

**Determinism.** Nothing physical reads these bytes. They are albedo and normal
texels. They are also byte-identical: `tests/unit/worker-pack-strip.test.mjs`
compares every layer of all four shipped strips with sharp (libvips, an
independent decoder), and the browser A/B below hashes every uploaded layer in
both modes. The hashes are equal in every run.

**Measured (Chromium 1243 headless, this container, 4 cores, loadavg < 1).**
Each run uses a fresh context. It loads `log.js`, `assets.js` and the client, then runs
`Assets.load({tier})` against a stub gfx. Main-thread cost is the CDP
`Performance.getMetrics` `TaskDuration` delta. In ON mode the worker is spawned
before the window opens, as an idle title warm would do. Median of 9 runs:

| tier | CPU | mode | main-thread task ms | longest task ms | worst rAF gap ms | wall ms | worker used |
|---|---|---|---|---|---|---|---|
| high (256) | 1× | off | 145.1 | 0 | 77.5 | 163.9 | 0/2 |
| high (256) | 1× | **on** | **34.1** | 0 | **21.4** | 172.7 | 2/2 |
| low (128) | 1× | off | 60.2 | 0 | 38.6 | 71.7 | 0/2 |
| low (128) | 1× | **on** | **18.3** | 0 | **17.8** | 72.8 | 2/2 |
| high (256) | 4× | off | 686.1 | 83 | 123.5 | 694.0 | 0/2 |
| high (256) | 4× | **on** | **147.1** | 51 | **60.7** | **273.8** | 2/2 |
| low (128) | 4× | off | 254.3 | 0 | 106.3 | 255.4 | 0/2 |
| low (128) | 4× | **on** | **86.0** | 0 | **36.6** | **133.3** | 2/2 |

At 4× throttle, a stand-in for a phone core, the high tier gives the page back
**539 ms of main-thread work (−79 %)** and halves the worst frame gap. The load
also finishes **2.5× sooner**, because the worker needs no per-layer yields.
At 1× the wall time is flat (+9 ms, the round trip), and main-thread work still
falls by 111 ms. The leftover ON cost (34 ms) is the blob fetch, the uploads and
the harness's own hash loop, which runs in both modes.

Caveats, stated plainly:

- **Where it lands for a player.** The pack loads in the title idle kick, and a
  tier swap re-runs it (a retry after the grid, #3584). So this is title / menu
  frame time and a race entry that overlaps the load. It is **not** the track
  build: race entry and track build time are unchanged when the pack is already
  resident.
- CDP CPU throttling is a proxy. I am not sure Chromium throttles worker
  threads the same way it throttles the main thread, so the 4× wall gain may be
  optimistic. The main-thread figures do not depend on that.
- No iPhone number yet. The worker uses `DecompressionStream` (Safari 16.4+)
  and transferables, both available on iOS 26. Bryce's TLX-WebGPU path reads the
  same `Uint8Array` layers as every backend.
- **The opt-in is in `assets.js _decodeStrip`** (5 lines, landed with A·H15's
  OK on this PR). The worker lane is tried first. A `null` answer falls back to
  `_decodeStripBytes`, and a cancel still rethrows `DECODE_CANCELED`.
  `worker-pack-strip.test.mjs` loads the real `assets.js` and checks two things.
  With the flag ON, every strip's upload is the worker's bytes. A `null`
  answer uploads the page decoder's bytes, identical to the flag-OFF run.

**Reproduce.** `npx serve -l 3456 .`, then run the A/B script from the PR body:
`node <script> 3456 9 <1|4> <high|low>`.

## 4b. Row 3 measured — Rapier snapshot restore against the trimesh build

`scratch` bench (in the PR body). It runs the real `Tracks.build` in the node
VM (`tools/lib/track-build-vm.cjs`), then does what `debris-world.js
buildWorld` does for the road: a fixed body plus a `ColliderDesc.trimesh(pos,
idx, FIX_INTERNAL_EDGES)`. Then `world.takeSnapshot()` and
`RAPIER.World.restoreSnapshot(bytes)`. A dynamic ball dropped on the original
and on the restored world must sit at bit-identical coordinates after 120
steps. Median of 7, vendored Rapier 0.19.3. Node runs on this box under load
(loadavg ~6, tooling-fast was running), so read the ratios, not the absolute ms.

| circuit | road tris | trimesh build ms | snapshot ms | restore ms | snapshot KB | ball after 120 steps |
|---|---|---|---|---|---|---|
| vegas | 55 656 | 111.1 | 6.0 | 8.2 | 7 668 | bit-identical |
| monza | 51 394 | 101.4 | 7.1 | 11.1 | 7 073 | bit-identical |
| monaco | 31 318 | 49.5 | 3.5 | 3.9 | 4 335 | bit-identical |

So the page would pay about a tenth of the build. The worker builds the road
world from the `roadGeo` the page already has (posted, ~1 MB), snapshots it and
transfers it back; the page restores it, then adds the mirrors and furniture in
today's order. That moves ~100–200 ms out of the countdown on a phone core.
`prime()` already runs it during the countdown rather than on the lights-out
frame, so this is a countdown-smoothness win, not a lights-out fix. Before any
code: A·H13 must confirm that the whole world (mirror handles, furniture,
panels) is sim-identical after a restore, with the existing debris
determinism tests run against a restored world.

## 5. Next steps

1. Measure on the device farm with the flag ON: Bryce's iPhone path, title idle
   → first race.
2. If the device run confirms the gain, flip the default to ON when
   `hardwareConcurrency > 1` (the same rule as `apex26.buildWorker`), and make
   `assets.js` call `PngStrip` for its own page path too, so there is one copy
   of the reader.
3. Row 3 (§4b): restore is ~10× cheaper than the build. Hand it to A·H13 with
   the determinism check that must come first.
