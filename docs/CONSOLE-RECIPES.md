# Console recipes — driving the app from DevTools

Copy-paste blocks for debugging the **real, deployed** game from a browser
console, plus the browser gotchas that make console work fail in confusing ways.

## Why bother, when there are 250 test files

The Playwright suite is better at regression. The console is the only thing that
can reach four situations the suite **structurally cannot**:

| the console can | the headless suite cannot |
|---|---|
| a real GPU | SwiftShader (CPU) only — timing and shimmer read differently |
| Safari / iOS / a phone | Chromium only |
| fetch third-party CDNs | the CI/sandbox proxy blocks them |
| a human judging how it looks | no eyes |

So use the console for **exploration, device-specific bugs, and judgement**;
use background test suites (`node tools/test-bg.mjs <group>`) or unit tests (`npm run test:tooling-fast`) for anything you want to stay fixed. See
[DEBUG-HOOKS.md](DEBUG-HOOKS.md) for the full `__apex` reference.

---

## Gotchas (every one of these has cost real time)

**Safari has no top-level `await` in the console.** It parses `await` as an
identifier, so `await __apex.race("x")` fails with the baffling
`Unexpected identifier '__apex'`. Use `.then()`, or wrap in `(async()=>{ … })()`.

```js
__apex.race("monza"); setTimeout(function(){ __apex.jump(0.25,0); __apex.snapCam() }, 2000)
```

**`copy()` only exists at top-level console scope.** It is a DevTools
command-line helper, not a real function — inside a callback or an async IIFE it
throws `Can't find variable: copy`. Use `__apex.save(obj, "name.json")` to get a
file instead, which works anywhere.

**`navigator.clipboard.writeText()` needs document focus.** Run it from the
console with DevTools focused and it rejects. Click the page first. Downloading
a file is more reliable than the clipboard.

**Canvas pixels cannot be read back.** The WebGL context is created without
`preserveDrawingBuffer`, so `canvas.toDataURL()` / `readPixels` after a frame
return blank. For screenshots use DevTools' own capture
(`Cmd/Ctrl+Shift+P` → "Capture screenshot"), not JS.

**A dev script loaded once stays cached.** Always cache-bust when reloading one:

```js
(function(){var s=document.createElement('script');s.src='assets/pack/webbake.js?x='+Date.now();document.head.appendChild(s)})()
```

**`page.route()`-style request counting does not see service-worker traffic.**
Inside the page, use Resource Timing instead:

```js
performance.getEntriesByType("resource").map(e=>e.name).filter(n=>/assets\/pack/.test(n))
```

**Lighting knobs are per-(track, time-of-day, weather) profile.** Setting one on
the menu screen does not affect a track — load the track first, then set it.

---

## One-line diagnostics

```js
__apex.diag()
```

Snapshots build, UA, device pixel ratio, **GPU vendor/renderer** (the thing that
says whether you are on real silicon or SwiftShader), backend, HDR/MSAA/render
scale, plus `info`/`assets`/`lightTune`/`lightState`/`viewState`/`physState`/
`timing`, and downloads `apex-diag.json`. `__apex.diag({download:false})` logs
only.

**Install an error collector _before_ reproducing a bug** — `diag()` reports
`errors`, but nothing is captured retroactively:

```js
window.__apexErrors=[];addEventListener('error',function(e){__apexErrors.push(String(e.message))});addEventListener('unhandledrejection',function(e){__apexErrors.push('rejection: '+e.reason)});console.log('collector armed')
```

Save anything at all:

```js
__apex.save(__apex.fieldState(), "field.json")
```

---

## Baked materials (assets/pack)

```js
__apex.matTex()          // current blend, 0..1
__apex.matTex(0)         // pure procedural — the pre-scan look
__apex.matTex(1)         // full baked CC0 photoscans
__apex.assets()          // {supported, pack, uploaded, tier, layers, scales, bytes}
```

A/B fairly by locking the camera so both settings frame identically:

```js
__apex.race("monza"); setTimeout(function(){ __apex.eyeAt(0.25,0,2.5) }, 2000)
```

**The check that matters is temporal, not static:** set `matTex(1)`, drive at
speed, and watch the road far down a straight for crawling or shimmering. A
screenshot cannot show it, and a photoscan is more prone to it than the
procedural noise it replaced — see the `MAT.ASPHALT` note in `js/track/geom.js`.

Re-bake materials from real CC0 scans (needs `assets/pack/webbake.js`, see
[research/ASSET-API-RESEARCH.md](research/ASSET-API-RESEARCH.md)):

```js
WebBake.run().then(function(r){ console.log(r && r.failed) })
```

---

## Driving and physics

```js
__apex.race("monza"); setTimeout(function(){ __apex.jump(0.5,60,0); console.log(__apex.probe()) }, 2000)
__apex.setPhysics({pace:0.8})
__apex.physState()
__apex.freeze(true)
```

Deterministic headless loop (same seed + same inputs = same result):

```js
__apex.seed(42); __apex.reset(0.25, 40, 0);
console.log(__apex.act({steer:0.2, throttle:true}, 1/60, 60))
```

`__apex.rollout({seconds:5})` drives an interval and returns a digest rather
than frames — see [AGENT-WORLD-API.md](AGENT-WORLD-API.md).

---

## Cameras and framing

```js
__apex.camera("cockpit")
__apex.eyeAt(0.116, 0, 2.5)     // track-relative free cam
__apex.orbit(0.116, 45, 15, 35) // orbit a track point
__apex.camState()
```

Always `__apex.snapCam()` after `park()`/`jump()` before judging a frame — the
camera eases toward its rig target, so without it you are looking at a camera
still flying to the car.

---

## Fetching third-party data

The console can reach hosts CI cannot. Verified: **Poly Haven allows CORS**
(API *and* CDN, including canvas pixel reads); **ambientCG, poly.pizza, itch.io
and Kenney do not**. Probe before building on one:

```js
Promise.allSettled([fetch('https://api.polyhaven.com/assets?type=textures')]).then(function(r){console.log(r.map(function(x){return x.status==='fulfilled'?'OK '+x.value.status:'BLOCKED'}).join(' | '))})
```

`BLOCKED` here means the browser refused it — a server (CI, a GitHub Actions
runner) has no CORS at all and can still reach it.

---

## Which renderer am I even debugging?

This matters before you install anything. The game ships **`GLX`**, a
hand-written WebGL2 renderer — there is no `THREE.Scene`, no `Object3D`, no
scene graph. So the **Three.js DevTools extension shows an empty panel**, and
`AxesHelper` / `BoxHelper` / `CameraHelper` do not exist to add. Three is the
opt-in **`TLX`** backend:

```js
localStorage.setItem('apex26.gfxBackend','three'); location.reload()
```

On TLX, `window.scene`, `camera`, `renderer` and `THREE` are published on boot
(look for the `[TLX] … exposed` console line), so the extension finds the scene
and the usual console workflow applies:

```js
scene.children.length
camera.position
scene.add(new THREE.AxesHelper(20))
scene.add(new THREE.BoxHelper(scene.children[3], 0xff0000))
```

TLX also has its own probes: `__tlx.shader(idx)` dumps the generated GLSL/WGSL,
`__tlx.chunkState()`, `__tlx.postState()`, and `?viz=mat|normal|lamp` debug
views.

**On the default GLX backend** the equivalent of "visual helpers" is data rather
than wireframes, and it is already there:

```js
__apex.survey()      // geometry DEFECTS: floating/buried props, terrain through the road
__apex.wallStats()   // barrier geometry audit
__apex.groundY(0.11, 12)  // terrain vs road height at a point (gap finder)
__apex.camState()    // where the camera actually is
__apex.lightState()  // ambient, sun, active light count
__apex.scene({radius:120})   // named scenery near the car
```

### FPS / frame time — the stats.js role

```js
__apex.stats(true)    // overlay: fps, render scale + tier, GPU ms, matTex
__apex.stats(false)
```

Works on **all three backends**, because it reads the numbers the game already
keeps rather than hooking a renderer. Watch the **scale** line, not just fps:
the performance governor holds 60 fps by quietly dropping render resolution, so
a soft-looking frame at a healthy fps usually means `scale` is below 1 — which
is invisible without this readout.

Deeper: `__apex.gpuTimer(true)` for GPU-side milliseconds (Chrome/Android only),
and the playwright-probe skill (`references/perf-profile.md`) for a CPU flame chart.
