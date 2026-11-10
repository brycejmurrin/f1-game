# Phone perf hunt on the owner's path (2026-11-09)

Kind: measurement · Re-measure-by: 2026-12-15

Scope: Bryce's iPhone (Home Screen app, landscape 852×393, DPR 3, THREE PATH: WEBGPU) and what PR #5205's move
from LOW to MED costs. Tree: deploy tip `e808230`. Session `claude:session_01BEw9UFCj24izwGTq9NShzE`, stopped at
its 300k context cap: §6 lists what was not measured.

**Device class of every number here.** Nothing in this note was measured on a real phone by this session.
`node` = the shipped module replayed in node (no browser). `static` = bytes and tags counted from the tree or the
live shell. `prior device farm` = an earlier session's AWS Device Farm rows, quoted with their source and NOT
re-measured. The two real-device routes this session had were both closed (§5).

## 1. The answer that exists today for "what does MED cost on the phone?"

No number. The only real-iPhone rows in the repo are `prior device farm`, on an iPhone 14 (iOS 27, a rack unit in
Safari, not Bryce's model): WebGPU 59.5–60 fps at scale 0.5 / 0.75 / 1.0; WebGL2 52.8 default, 46–51 at 0.75,
38–42 at 1.0 (`DEVICE-FARM-LEDGER-2026-10-23.md` rows 4 and 14). Two reasons not to lean on them:

1. A 60 Hz phone that holds vsync reads 16.7 ms at every scale, so "60 fps at every scale" bounds the cost below one
   refresh and says nothing about headroom or heat. GPU TEST's fill slope (`js/perf/gpu-test-run.js` `fillSlope`,
   fitted on rAF p50) is 0 by construction on such a device.
2. `PERF-CENSUS-WEBGPU-2026-11-04.md` left open whether `renderScale()` resizes the post targets on the WebGPU
   path at all (its sweep read 960×540 at every scale). If it does not, "60 at every scale" is one measurement
   repeated. Bryce saw LOW as pixelated on WebGPU, so the canvas does follow the scale; the post chain is
   unverified. This belongs with the pixel-truth hunt (canvas/DPR owner).

The request that closes this is filed: BENCHMARK › THIS PATH on bridge issue #5168 (comment 6756527625), which
steps 0.5 / 0.75 / 1.0 on his phone. It needs his tap.

## 2. Ranked findings

| # | finding | method | device class | expected gain | risk |
|---|---|---|---|---|---|
| 1 | With RESOLUTION pinned (the phone default: `defaultResMode()` → `med`), the governor has no pixel lever. If shedding 4 feature tiers does not get under one refresh, it restores all tiers, latches `_tierFutile`, and the race stays at 30 fps. AUTO on the same modelled device settles at 60 fps. | `node --test tests/unit/perf-governor.test.mjs` (`phoneReplay()`: the real `tick()`), §3 | node, modelled device | a phone too slow for MED keeps 60 fps instead of 30 | a product choice (what a pin means); needs Bryce |
| 2 | The first player pit stop built the crew rig on the frame the car reached its box. Fixed here: queued behind the grid's deferred warm and built under the start lights. | unit test with a mesh counter, §4 | node (counts) | the rig's mesh builds leave the box frame: 0 created there after a warm | low; one more piece in a queue that already tolerates leftovers |
| 3 | Cold boot is 323 deferred `<script>` requests (8.21 MB raw, 2.87 MB gzip unminified in the tree) plus 34 stylesheets (1.24 MB raw, 0.40 MB gzip); the shell is 423 KB (131 KB gzip on Pages, `cache-control: max-age=600`). | static count of `index.html` and one `curl` of the live shell | static | not sized: no phone-CPU boot trace was taken (§6) | n/a |
| 4 | `tools/gfx/live-frame-census.mjs` cannot run its WebGPU row on this container: one Monza row at 844×390 ×1.5 hit the tool's 480 s row cap on SwiftShader. The phone-shaped frame census is real-GPU only. | one run, `artifacts/logs/lf-sw-gpu-med.log` | software | n/a (tool limit) | n/a |
| 5 | Open leads re-read on this tree (static, by a verifier agent): #5049 confirmed (paused SETTINGS draws every rAF unless a render-rate mode is active; fix needs `js/game.js`); #3104 F3 confirmed but negligible (hidden batches cost one `visible` test per pass); #4272 item 6 is WebGL2 only (`tlx-post.js:243` `!webgpu`), so not on the owner's path; #4710 has no unconditional per-frame buffer creation visible statically (candidates are guarded growth paths, `tlx.js:2255, 2989, 3018`); thermal drift is opt-in and off (`governor.js:474`). | static read | static | — | — |

Not confirmed as wins and therefore not filed: #4710, #4680, #4272 (all need a GPU).

## 3. Finding 1 in numbers (node replay, modelled device)

`phoneReplay({ base: B, fill: F, mode })` in `tests/unit/perf-governor.test.mjs`: a frame costs `(B + F × scale²) × (1 − 0.06 × tier)` ms and is
shown on the next 60 Hz refresh. The ms are the model's. The governor's decisions are the shipped code's.

| model | LOW pin | MED pin | HIGH pin | AUTO |
|---|---|---|---|---|
| base 9, fill 12 (MED = 15.8 ms) | 60 fps, tier 0 | 60 fps, tier 0 | 30 fps, 4 tiers shed then restored | 60 fps, scale 0.76 |
| base 9, fill 16 (MED = 18 ms) | 60 fps, tier 0 | 60 fps, tier 2 (two features shed) | 30 fps | 60 fps, scale 0.65 |
| base 14, fill 16 (MED = 23 ms) | 60 fps, tier 2 | **30 fps**, tiers restored at 19.5 s | 30 fps | 30 fps, scale back at 1.0 |

Reading: MED pinned is safe on a device with headroom, costs features (not pixels) on a marginal one, and strands a
slow one at 30 fps where LOW would have held 60. On AUTO a steady marginal device re-probes one scale step up every
2 minutes (two target reallocations each), which is the designed backoff ceiling, not a bug. Options for Bryce are
in the issue filed for this finding; my pick is AUTO with the governor's ceiling set to MED's 0.75 on phones, so the
default keeps the sharpness of #5205 and regains the pixel lever.

## 4. Finding 2: the pit-stop build (landed here)

`js/garage/pit-crew.js` gains `warm(G, car)`; `js/car/car-draw.js` queues one `{crew}` item after the grid's own
deferred pieces on both warm paths and `drainDeferredCarWarm` builds it under the lights. Budget test
(`tests/unit/garage-crew-choreo.test.mjs`): after a warm, the first box frame creates 0 meshes; a second warm is a
cache hit; an AI car and the A/B switch off build nothing. It only applies when the garage clip data is loaded
(`GarageCrewChoreo.has("pit")`), which is the only case the animated crew draws at all. Not measured: the ms this
removes on a phone, and whether the crew's first draw still compiles a WebGPU pipeline on that frame (§6).

## 5. Refusals and closed routes

- BrowserStack Automate (real iPhone 15 / iOS 26 over WebDriver): session create answered
  `Automate testing time expired` (free plan). The WebDriver harness written for it never reached a device and is
  not in this PR (a new tool needs `tools/README.md` and `tests/groups.json`, both held by open PR #5208).
- AWS Device Farm (`tools/perf/devicefarm-iphone.mjs run --scenario soak`, iPhone 14): the auto-mode classifier
  refused the launch as a metered real-world transaction. Final; not retried. Nothing ran and nothing was billed.

## 6. Not measured (for the next owner)

- Frame time p50/p95/p99 and long frames at MED and HIGH on any real GPU; CPU profile of a race frame on the WebGPU
  path; GC pauses; draw calls and `createBuffer` per frame; pipeline compiles at first corner, weather change and
  replay. `tools/gfx/frame-hitch.mjs monza --tlx-webgpu --cpu-profile 12` is the software-valid instrument for the
  CPU half and was not run.
- Time to first frame and to interactive, cold and warm, under a phone-class CPU throttle.
- The macOS GPU census `live-frame` leg with `apex26.resMode` varied (push-request only).
- Whether `renderScale()` resizes the post chain on WebGPU (§1 item 2).
