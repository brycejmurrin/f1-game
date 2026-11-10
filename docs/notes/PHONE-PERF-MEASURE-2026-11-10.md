# Phone perf, the half that needs no real phone (2026-11-10)

Kind: measurement · Re-measure-by: 2026-12-15

Continues `PHONE-PERF-HUNT-2026-11-09.md` §6. Session `claude:session_01BEw9UFX6oYgayDZxfwkXtC`. Rule for this
note: no earlier number is quoted as true; every row states its method and its device class.

**Device classes used here.** `software` = this container, 4 cores, no GPU: Chromium's WebGPU on a CPU rasteriser
(Dawn over SwiftShader/Lavapipe) or WebGL2 on SwiftShader. `software ×N` = the same with CDP
`Emulation.setCPUThrottlingRate(N)` on the page's main thread. `apple-ci` = GitHub's `macos-latest` runner (Apple
GPU through Metal, paravirtual), reached by the `live-frame` census request. `real phone` = none: no row in this note.

## 1. Instrument

`tools/gfx/live-frame-census.mjs` (phone shape 844×390, touch, driven race, helmet camera) gained:

- `--dsf N` (the page's DPR), `--cpu-throttle N`, `--lab dpr3|dpr2` (the URL lab below), `--row-cap s`;
- `--sweep 3,2,1.5`: after the main window, with the governor's ladder held (`govHold`), each DPR cap (descending,
  `capDpr` only lowers) × scale 1 / 0.75 / 0.5 for `--step` s: canvas px, rAF interval, rAF callback wall, GPU timer;
- per-frame counts over the window (WebGPU): `createBuffer`, `createTexture`, `createBindGroup`, `writeBuffer`,
  draws, render passes; boot and race-entry wall.

The same options ride the census request's `ls` field as `lf.*` pseudo-keys, so the `apple-ci` leg needs no
workflow edit.

`?lab=dpr2` / `?lab=dpr3` (`js/render/three/tlx.js` `labDprCap`) replaces TLX's DPR cap for one boot. No lab: the
cap is the tier's (1.5 phone, 2 desktop), unchanged. It exists so the cost of a sharper picture can be measured, on
the census and on Bryce's own phone (`https://brycejmurrin.github.io/f1-game/?lab=dpr2`).

`--alloc N` samples V8's heap profiler with collected objects kept, so garbage is attributed by function; `--poke
"expr"` runs one `__apex` call after the window and records the next 12 s (pipelines, shader modules, long calls).

## 2. Answers

1. **Pixel-bound or CPU-bound?** On a desktop-class core the race frame's JavaScript is 4–6 ms of the 16.7 ms
   budget, and it does not change with pixel count (§3 sweep: 3.1 / 3.3 / 4.2 ms across a 4× pixel range). So on a
   phone whose core is in that class, what raising the DPR cap costs is entirely a GPU question. At a 4× slower main
   thread the same frame is 19–23 ms of JavaScript: CPU-bound at 30 fps, and no resolution change can fix that.
2. **What does cap 2 or 3 cost per frame on the phone's GPU?** Not measurable from here. The software adapter's ms
   are a CPU rasteriser's. The `apple-ci` runner re-measured as pixel-blind: 33.3 ms at 2532×1170, 1899×878 and
   1266×585 alike (§4). What is exact is the pixel count, for an 852×393 panel: MED today 959×443 = 0.42 Mpx; cap 2
   at scale 1 = 1704×786 = 1.34 Mpx (×3.2); cap 3 at scale 1 = 2556×1179 = 3.01 Mpx (×7.1), through 9–11 render
   passes per frame (§3 counts; not every pass is full-size, the per-pass sizes were not counted).
3. **The number that decides it** is Bryce's own: BENCHMARK › THIS PATH opened as `…/f1-game/?lab=dpr2` steps
   scale 0.5 / 0.75 / 1.0, which under that lab is 852×393, 1278×590 and 1704×786 on his GPU.

## 3. Software rows (this container; TLX WebGPU, phone tier, monza, helmet camera, RESOLUTION MED = 950×439)

Method: `node tools/gfx/live-frame-census.mjs --tracks monza --backends tlx-gpu --cpu-throttle N --sweep 1.5 --ls
apex26.forceMobileTier=1`, one driven race, 8 s warm, 30 s window. `interval` = rAF to rAF; `callback` = wall time
inside the game's rAF callback; spans = the game's own PerfSpans. One run per row (no repeat: read ±20%).

| | software ×1 (n 1810) | software ×4 (n 894) |
|---|---|---|
| interval p50 / p95 / p99 ms | 16.7 / 33.3 / 50 | 33.2 / 100 / 150 |
| frames over 33 ms / over 50 ms | 3.4% / 0.6% | 33.7% / 19.6% |
| callback p50 / p95 / p99 ms | 5.6 / 27 / 42.9 | 19.4 / 77 / — |
| span frame p50 / p95 | 4.1 / 10.8 | 23.2 / 80.1 |
| span render p50 / p95 | 2.2 / 7.9 | 15.5 / 51.6 |
| span physics p50 / p95 | 0.5 / 1.3 | 4.6 / 30.5 |
| span ai p50 / p95 | 0.3 / 0.5 | 1.5 / 6.5 |
| GC in the traced seconds | 6 s: 6 minor (max 2.1 ms), 2 major (max 29.9 ms) | 4 s: 2 minor (max 1.4), 2 major (max 28.5) |
| render passes / submits per frame | 9.26 / 8.4 | 11.45 / 10.92 |
| draws / `writeBuffer` per frame | 143 / 148 | 133 / 134 |
| `createBuffer` / `createBindGroup` / `createTexture` per frame | 0.23 / 0.08 / 0.01 | 0.50 / 0.17 / 0.02 |
| render pipelines created in the window | 0 (20 before it) | 0 |
| scale sweep at cap 1.5, interval p50 at 1266×585 / 950×439 / 633×293 | 16.7 / 16.7 / 16.7 | 49.9 / 33.4 / 50 (noise; CPU-bound) |
| same sweep, callback p50 | 3.1 / 3.3 / 4.2 | 30.1 / 22.7 / 26.5 |
| boot / race entry wall | 1.5 s / 12.1 s | (throttle starts after entry) |

Readings, each `software`:

- **CPU profile, ×1, 13.0 s over 606 frames:** 5.0 s idle; of the busy time `createCommandEncoder` 2.05 s and
  `queue.submit` 1.69 s (together 54%), three.js 0.96 s, `game.js` 0.32 s, `tlx.js` 0.19 s. The two WebGPU calls
  block on this box's CPU rasteriser, so their ms are not a phone's; the COUNT is exact: three submits once per
  render pass, 8–11 times a frame. Fewer passes is the structural lever on this path (lead, not sized).
- **Buffers created mid-race (#4710):** real but not per-frame churn. ×4 row stacks: 261 vertex buffers and 57
  index buffers from three's first-draw upload (`createAttribute` under `update`), 130 uniform buffers from
  `_createBindings` for render objects first drawn in the window, over 894 frames. Geometry that first enters view
  uploads on that frame. No per-frame re-creation of an existing buffer was seen.
- **Major GC:** two ~29 ms major collections inside a 4–6 s trace on both rows. A 29 ms pause is a dropped frame
  at 60 Hz. Attribution by site is §5.
- **Weather change** (`--poke 'weather("rain")'`, ×4): 0 pipelines, 0 shader modules, 39 buffers in the next 12 s,
  no single call over 20 ms. No compile hitch at a weather change on this path.
- **First lap from 8 s after the lights:** 0 pipelines in the 30 s window on both rows (20 were built before it). The
  first 8 s themselves were not captured (the tool that does, `first-race-census`, is broken: below).
- **One stall per row** (1050 ms at ×1, 3517 ms at ×4, long-animation-frame with 31 ms of script) sits at the tool's
  own trace-end → profiler-start hand-over. Treated as the instrument, not attributed to the game.

Not obtained: the WebGL2 fallback. three's WebGL2 at the phone tier on SwiftShader did not finish one row inside a
1400 s cap, twice. `tools/perf/first-race-census.mjs --track monza --go` throws on this tip (`Cannot read
properties of undefined (reading 'pipes')`, its line 143); not fixed here. Pit stop and replay were not probed
(no `__apex` hook reaches a replay; a stop needs a full driven in-lap).

## 4. `apple-ci` row (macos-latest, Metal, census run 42743763886 on 7d81c11)

`lf.dsf=3 lf.lab=dpr3 lf.sweep=3,2,1.5`, TLX WebGPU, monza. Three steps completed before the row's 480 s cap:

| canvas | interval p50 / p95 ms | callback p50 ms | GPU timer |
|---|---|---|---|
| 2532×1170 | 33.3 / 66.6 | 3.9 | unsupported |
| 1899×878 | 33.3 / 66.7 | 3.4 | unsupported |
| 1266×585 | 33.2 / 66.6 | 3.4 | unsupported |

A 4× pixel range with no change in frame time: this runner's frame time is its present path, not GPU work. That
re-measures (and agrees with) `TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md`. Both rows then hit the cap, so the runner
gave no main-window data; a rerun needs `lf.rowCap=1300` and a shorter sweep. The `?lab=dpr3` boot did draw
2532×1170, which is the proof the lab works on a real WebGPU device.

## 5. Per-frame allocation

Method: `--alloc 10` on the ×1 row above (V8 sampling heap profiler, 16 KB interval, objects collected by minor
and major GC kept), 597 frames. Bytes allocated are a property of the JavaScript, not of the adapter, so this is
the one number here that carries to a phone (sampled: read ±10%).

**222 KB allocated per frame** (132 MB in 10 s; about 13 MB/s at 60 fps), which is what feeds the collections in
§3. Top allocating functions, KB per frame:

| function | KB / frame |
|---|---|
| `updateCarLateral` game.js:5706 | 19.4 |
| `updateCar` game.js:4831 | 13.5 |
| three `_update` / `update` (render lists, bindings) | 10.0 / 8.6 |
| `render` game.js:7263 | 8.1 |
| `Array.push` (native) | 8.1 |
| `updateCarBrakePlan` game.js:5317 | 8.0 |
| `updateCarLongitudinal` game.js:5511 | 5.3 |
| three `getCacheKey` / `getDynamicCacheKey` | 4.1 / 3.5 |
| `matKeyFor` tlx.js:2052 | 4.1 |
| `updateCarAdvance` game.js:6253 | 4.0 |
| `curvature` spline.js:147 | 3.8 |

The car step (`updateCar*`) is about 50 KB per frame, the largest single owner and all game code. That is the
measured lead of this note. It is not fixed here: the step is the physics core (replay determinism and the
curvature contract ride on it) and a zero-allocation pass needs its own PR with the characterization traces.

## 6. A default that is sharp when the phone can afford it (for #5227; `js/ui/scale.js` is held by #5205)

Today: the phone cap is 1.5 with no exception (`js/render/shared/glx-facade.js`: `mobileTier: isMobile`; the
`tlx.js` comment that GRAPHICS HIGH restores full DPR is stale), and RESOLUTION is pinned MED, so the governor
cannot touch pixels. Proposed, as one change once Bryce's benchmark under `?lab=dpr2` shows scale 1.0 holding 60:

- phone DPR cap 2, RESOLUTION default AUTO. The governor's existing order is resolution first (0.1 steps down to
  0.5), then the feature ladder. Range on an 852×393 panel: 1704×786 at best, 852×393 at worst.
- the worst case is 79% of today's MED pixel count. If that floor reads too soft, the governor's floor on a phone
  becomes 0.5625 (= today's MED, 959×443) instead of 0.5.
- cap 3 is not proposed: 3.01 Mpx is 24 MB per RGBA16F target against 10.7 MB at cap 2, on a tier whose whole
  point is the iOS memory limit. It stays a lab.
- what this cannot promise: on a phone whose main thread is 3–4× slower than a desktop core the frame is
  CPU-bound (§3 ×4) and AUTO will sit at its floor without reaching 60.

Evidence class of this section: design from `software` rows and exact pixel counts. No real-phone number.

## 7. Not done

- Any real-phone number (BENCHMARK on #5168 unanswered at 2026-11-09 19:00 Pacific).
- WebGL2 fallback rows; pit-stop and replay hitches; cold vs warm load under a phone-class throttle (only the
  software boot 1.5 s / entry 12.1 s above); per-pass target sizes; repeat runs for a noise floor.
- Open leads #4680 #4272 #4270 #3104 #3100 were not re-read; only #4710 was checked against counts (§3).
- No game-code win landed: the one sized lead (§5, car-step allocation) is physics-core work for its own PR.
