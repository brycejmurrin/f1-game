# First BOOST press freezes ~0.74–0.93 s on iPhone: the first ERS-strip draw (A·W15, 2026-10-23)

Bryce: "whenever I am in buttons steering mode and I take my finger off of throttle to hit boost the game lags".
PR #3611. Fleet A worker A·W15.

## 1. Result

| run (AWS Device Farm, iPhone 18 Pro Max, iOS 27.0, three.js WebGPU) | first BOOST tap, worst rAF gap in the 400 ms after it | later BOOST taps | control window (GAS held) |
|---|---|---|---|
| 3: live site | **742 ms** | 21–37 ms | max 19 ms |
| 4: live site, AERO tapped first | **737 ms** (first AERO tap: 47 ms) | 19–25 ms | max 33 ms |
| 5: four page loads in one Safari session | load 0 **734 ms**; loads 1–3 22–23 ms | 19–28 ms | — |
| 6: Safari terminated between loads | load 0 **748 ms**; later loads 34 / — ms | 21–26 ms | — |
| 7: Safari terminated between loads | load 0 **853 ms**; load 1, no warm-up, 33 ms | 21–28 ms | — |
| 8: fresh session, `#btn-boost.on` drawn 2 frames before any press | **756 ms** | 22–31 ms | — |
| 9: fresh session, Event Timing + queue probes | **934 ms** | 23–28 ms | — |

- **Once per device, not per page.** Every new Device Farm session stalled on its first BOOST tap (742–934 ms).
  Later page loads in the same session did not, even after `mobile: terminateApp` killed Safari (run 7), so the cache
  is system-level, not per page or per process.
- **Outside the game tick.** `PerfSpans` frame max ≤ 27 ms in every run.
- **Not the HUD.** Drawing `#btn-boost.on` for two frames before any press (run 8) left the stall at 756 ms. AERO's
  first tap (its own lit state, `:active`) costs 47 ms.

## 2. Root cause (run 9)

Times relative to the first BOOST pointerdown:

| ms | what happened |
|---|---|
| 0 | BOOST pointerdown handled; the game frame runs 0→6 (render 1→6 ms) with `boostOn` true |
| 59 | the GAS `pointerup`/`touchend` and BOOST's touch events are queued (Event Timing `startTime`) |
| 6 → ~742 | main thread blocked: no tick, no listener, no timer (`setTimeout(0)` ran at 945); every queued event has `processingStart` 749 |
| 934 | the next game frame starts (rAF gap 934 ms) |

The frame at 0 ran with BOOST on **and GAS still held**, because the lift had not been processed yet. That frame is
the car's first ERS deploy. `c.deploying` makes `js/game.js` call `carDraw.drawExhaustFx(c, …, isErsDeploying(c), …)`,
which draws the player's ERS status strip for the first time (`CarMesh.getErsLight()`, a `_flatQuadData` quad,
opts `{emissive: 1, roughness: 1, specular: 0, noAlphaWrite: true, alpha 1 | 0.6}`). The block comes after that
frame's JavaScript, so the WebGPU frame waits on a first-use pipeline compile in the GPU process. That fits every run:
the stall survives killing Safari (Metal's shader cache is system-wide), a fresh device pays it again, and ERS still
reads 4.0 MJ after one deploy frame. A normal race shows it too: the first BOOST with GAS held is the first deploy.

The throttle lift in Bryce's report is how the deploy starts: BOOST lands before the lift is processed.

**The miss, named by `tools/perf/ers-deploy-census.mjs`.** The census holds GAS, then turns BOOST on (the first deploy) and
logs every three `createRenderPipeline` and the TLX `memState().matMissKeys` delta:

| run (local, three WebGL2 backend, Monza, mirror on) | deployed | new material on the first deploy |
|---|---|---|
| `--cam helmet` (the game's default camera; the wheel is on screen) | yes | **1: `t,0.9,0,0,0,0,0,1\|ds\|na`** |
| `--cam chase` | yes | 0 |

`t,0.9,…|ds|na` is `js/car/car-draw.js` `_rigFxA` (`doubleSided: true, emissive: 1, roughness: 0.9, specular: 0,
noAlphaWrite: true`, alpha `0.75 + 0.25·sin`). At `car-draw.js:1516` it draws the cockpit dash ERS bar only while
`c.deploying`; the armed OT lamp at `:1521` shares it. TLX's `_LATE_LIT` warm (`js/render/three/tlx.js`) has the same
entry **without `doubleSided`**, so it warms `t,0.9,…|na`, not `…|ds|na`. The first deploy mints the material, and on
WebGPU it compiles the pipeline mid-race. Three's WebGL2 backend reuses the program (no lazy pipeline logged), which
is why the stall is a WebGPU one. Run 9 on the iPhone used the cockpit camera, matching this.

**Owner: renderer (A·W14).** Suggested fix: warm the `doubleSided` variant of `_LATE_LIT` (on the rig meshes' layouts,
both winding signs), or warm `_rigFxA` itself. Proof: `node tools/perf/ers-deploy-census.mjs --cam helmet` prints
`misses=0`, and on the device the first BOOST tap drops from 734–934 ms to the 20–40 ms of a later tap. A first
attempt in PR #3611 (drawing the HUD button's lit state early) was measured not to help (run 8) and was reverted.

## 3. Method

- Local (`tools/perf/touch-boost-probe.mjs`): CDP `Input.dispatchTouchEvent` at 844x390 hasTouch, rAF intervals, a
  `devtools.timeline` trace, tap vs control windows, `--from/--to none` controls. It cannot see this bug: this
  container has no GPU, TLX never ticks a race here and GLX runs ~1–2 fps under SwiftShader, and any DOM change costs
  the same ~300 ms of software recomposite (lift-only and tap-only alike).
- Device (`tools/perf/devicefarm-iphone.mjs run --touch N`): a remote access session + Appium endpoint; the race is
  started through `__apex` (Pages loads it only with `?apex`); real fingers are NATIVE_APP W3C touch actions. CSS px map
  to points as `(x·k, screenH − innerH·k + y·k)`: the WebView element's rect includes Safari's 64 pt top bar (run 2
  landed every tap 64 pt high). The page logs rAF gaps, the pointer stream, `PerfSpans` and the `Log` ring.
  `--variants a@live,b@fix --fix-url URL --cold` loads one page per entry, with a fresh Safari process between entries.
- Instance: AWS returns no `instanceArn`/`deviceUdid` for remote sessions; `mobile: deviceInfo` gives a per-phone
  uuid (run 4 `034D496E…`, run 5 `32CFAFDB…`), recorded per run. Safari's caches outlive a session on one phone
  (OrchA27 / A·D1); run 7 showed even `mobile: terminateApp` does not reset it, so only the FIRST load of a new
  Device Farm session is a cold measurement.
- Device minutes: runs 1–2 were tooling failures (about 2–3 metered minutes each); trial balance ~800 min at start.
