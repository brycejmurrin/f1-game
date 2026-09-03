# Apex 26 — Architecture & Module Contract

Pure JS/CSS/HTML, **no build step**. The **runtime has zero npm
dependencies**; every `devDependency` is test- or tooling-only (Playwright the
harness, jsQR to verify the QR encoder in tests, espree/eslint-scope for the
source audits, sharp and typescript for tooling — never shipped). Four vendored
libraries DO ship, under `vendor/`, each loaded only by the feature that needs
it: three.js r185.1 (TLX backend), Rapier (`debrisworld.js`), Trystero (the
Nostr room-code rendezvous) and jsQR (the answer-code camera scan). Served as
static files (GitHub Pages). Every JS file is an IIFE that assigns ONE global.

> This file is the module **contract** — what each module is and what it may
> assume. For an assessment of how the project is built, what the no-build-step
> bet costs, and the register of known defects (fixed and deferred), see
> [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md).

Modules are grouped by domain: `js/render/` (renderers), `js/track/` (the track
**engine** — shared spline/mesh/scenery code), `js/circuits/` (the 40 circuit
**data** files), `js/car/` (car geometry, liveries, parts, teams), `js/data/`
(API clients + data hub), `js/game/` (game subsystems), with `js/mat4.js` and
the `js/game.js` entry at the root.

**`tools/manifest.cjs` is the single source of truth for load order.** The
`<script>` tag block in `index.html`, the `tools/carview.html` tags, sw.js's
optional precache seed and `js/roster.js` (the lazy rosters `js/game.js`
injects at runtime, one frozen `ApexRoster` global) are all GENERATED from it
by `tools/gen-shell.mjs`; `tests/unit/load-order.test.mjs` (run via
`npm run test:tooling-fast`) asserts every generated block is byte-identical
to a fresh run. Adding a file means a `FULL` entry, a `DEFERRED` backend entry, a `LAZY_AGENT` entry
(`apex.js` / `agentview*` — injected when tests / localhost / `?apex=1`), a
`LAZY_RACE` entry (`light-presets.js`, fetched before the first race) or a
`LAZY_SCENERY` entry (`js/circuits/scenery/<id>.js`, fetched per build). The abbreviated sketch below is a subset;
consult the manifest for the full, current order:

```
js/log.js                -> Log        (levelled logging; loads FIRST)
js/mat4.js               -> M4, V3
js/render/shaders/*      -> GLXChunks, GLXShaders   (pure data, before glx.js)
js/render/glx.js + glx/* -> GLX        (default WebGL2 renderer + its passes)
js/render/gfx.js         -> Gfx        (renderer selection seam; the WGX and
                                        TLX backends are DEFERRED — no script
                                        tag, injected at boot when opted into)
js/car/teams.js          -> Teams      (2026 grid data + TIER_V pace ladder + the MY TEAM seed)
js/track/*               -> the track engine (spline, mesh, scenery, markings…)
js/circuits/*.js         -> TrackDefs  (one def per circuit; its scenery(api) closure is
                                        split to js/circuits/scenery/<id>.js, fetched per build)
js/track/tracks.js       -> Tracks     (engine shell: resolve + build; reads TrackDefs)
js/car/*                 -> Car3D, Liveries, LiveryTex, Parts, Ghost
js/game/*                -> Input, GameAudio, LightTune, Particles, GameCams, GameHud, …
js/data/*                -> F1API, DataHub + tab modules
js/game.js               -> (main, self-executing)
```

Conventions: `const` + `camelCase`, constants `UPPER_CASE`, colors are
`[r,g,b]` floats 0–1, angles in radians, distances in meters, world space is
**+Y up**, car/track local forward is the spline tangent. No ES modules, no
`import`/`export`, no `async` top-level. Each file starts with
`"use strict";` inside its IIFE. localStorage keys prefixed `apex26.`.

---

## Reorg (2026-07)

The July 2026 architecture reorg moved every module into a domain directory
(old→new map in the git history) and split the three giants (`game.js` 8,955 →
~4,700 lines as measured then; `glx-shaders.js` → chunked shader files;
`buildProps` → four scenery modules).

**That 4,700 is a historical measurement, not a current one.** `game.js` grew
back to its ceiling (8,885 as of 2026-09) — extraction moved code out once and nothing stopped it
accumulating again until the size ratchet (`tests/data/ratchets.json`, checked by `tools/ratchets.mjs`) put a ceiling on
the file (lowered with each extraction). Treat the number as a record of what
the reorg achieved, and `wc -l js/game.js` against the current ceiling as the
truth about today.

The mechanisms that keep a no-build, script-tag codebase coherent after the split:

- **The `G` ctx façade.** Extracted `js/game/*` modules never reach into
  game.js's closure. game.js builds one `G` object — live getters/setters over
  its closure state (player, cars, race flags, …) plus stable helpers — and
  instantiates each module once via `Module.create(G)`. A module reads
  `G.player`, calls `G.helpers`, and stays testable/loadable in isolation.
- **`tools/manifest.cjs`** — the load-order single source of truth, asserted by
  `tests/unit/load-order.test.mjs`. Its `HARD_EDGES` list records **eval-time load
  dependencies** (B destructures A's global at eval time, so A must precede B —
  e.g. shaders before glx.js). Its `TRACK_VM` list names the files
  `tools/verify-track.cjs` and the VM-based tests load into a bare Node VM, so
  headless guards follow the layout automatically.
- **`tools/extract-module.mjs`** assists further extractions from game.js
  (moves a block, wires the `create(G)` boilerplate, updates manifest + tags).
- **Cache busting is the DEPLOY's job** — the committed shell reads `?v=dev` on
  every tag; `pages.yml` rewrites them to 12-char content hashes and stamps the
  generation while staging (`bump-cache.mjs --apply --at N --root _site`). There
  is NO bump after a `js/`/`css/` edit, and `bump-cache --apply` REFUSES on the
  repo (exit 2). The tag blocks themselves are written by
  `tools/gen-shell.mjs`, never by hand.

### Deferred follow-ups (known debt, in rough priority order)

- **game.js pass 2** — promote the remaining closure `let`s to a shared state
  object. The early extractions were `js/game/aerozones.js`, `js/game/skidmarks.js`,
  `js/game/light-store.js`, `js/game/racecontrol.js`, and from the 2026-08
  cleanup `js/game/physics-consts.js` and `js/game/cam-modes.js` — more have
  landed since (e.g. `js/game/ai-drive.js`); `tools/manifest.cjs` is the roster
  truth and `tests/data/ratchets.json` the tally. The current
  count and its ratcheted ceiling live there (`node tools/ratchets.mjs`), and the
  remaining extraction candidates are ranked in ARCHITECTURE-REVIEW.md §8.

  **The payoff is testability, not tidiness.** Race control is the clearest
  case: 118 lines in the middle of `game.js` had exactly one assertion anywhere
  in the suite, because the only way to reach the machine was to stage real
  settled debris in a browser. As a module taking its hazard picture through a
  seam, it gets `tests/unit/race-control.test.mjs` — sixteen tests in milliseconds
  covering the hysteresis, the time caps and the storage-format migration. None
  of that was reachable before, and nobody had chosen for it not to be.

  **Check for leftovers after every extraction.** Three for three so far:
  aerozones COPIED two constants instead of moving them; race control left the
  settings panel reading a deleted `_cautionOn` (a `ReferenceError` on opening
  race settings, which no test opens). `grep` the removed symbol names — the
  suite will not do it for you.

  **Sort candidates by boundary crossings, not by line count.** The two measured
  in the 2026-08 pass came out at opposite ends and the difference decided which
  was taken:

  | candidate | lines | crossings | verdict |
  |---|---:|---:|---|
  | lighting profile store | ~94 | 0 new | taken — the whole surface was ALREADY on `G` for four other files |
  | garage live preview | ~415 (ARCHITECTURE-REVIEW.md's measurement) | ~15 new | **left** — `teamDecalState`, `drawAeroFlaps`, `drawCarDecals`, `carDecalNum`, `carPaintMat`, `partsVisualKey`, `resolveLivery`, `getTeamParts`, `teamIdx`, `MAT_REFLECT_X` … none of which `G` carries |

  The garage preview is the bigger block and the more obvious target — its
  natural partner `js/game/setup-ui.js` already exists — but taking it would
  widen the façade by half again for one screen. That is precisely the review's
  warning about `G` being a *migration* device used as an *architecture*: an
  extraction that adds fifteen accessors has moved the coupling, not removed it.
  Take it only together with a real car-drawing seam that `render()` shares.

  **Splitting the two megafunctions is NOT recommended.** `render()` and
  `updateCar()` are ~1,370 and ~1,130 lines (2026-08 measurement), and `updateCar`'s tyre model is one
  continuous integration over ~40 interdependent locals — extracting it means
  inventing a state struct and risking the determinism that
  `tests/specs/physics-characterization.spec.js` now pins, for no functional gain.
  Take the cohesive blocks around them instead.

  `tests/data/ratchets.json` (`tools/ratchets.mjs`, `tests/unit/ratchets.test.mjs`) is the guard that makes this stick: a per-file
  line ceiling you LOWER when you extract. It exists because this file's own
  note above — that extraction happened once and nothing stopped the file
  growing back — was demonstrated again in miniature during the 2026-08 cleanup,
  when two extractions removed 91 lines from game.js and a concurrent branch
  added 130 over the same period. Nobody did anything wrong; nothing was
  watching.
- **~~tracks.js → GLX direct calls~~ (done, TLX M10)** — `Tracks.build` now
  takes the active backend via `opts.gfx` and routes every `createMesh` /
  `createChunkedMesh` / `mobileTier` read through that injected handle (falling
  back to the `GLX` global only for the Node-VM build guard / VM tests that
  install a stub `GLX`). game.js's descriptor-copy install onto the `GLX` object
  is retained solely as the object-identity contract for the ~8 spec files that
  monkey-patch `GLX.*`.
- **~~`liverytex.js` duplicates GLX's mobile-tier detection~~ (done)** —
  `liverytex.js` reads `GLX.mobileTier` (a manifest `HARD_EDGES` pair); the one
  detection lives in `glx.js`.
- **`TUNE_DEFS` mirror-comment invariants** in `glx.js`/`gfx.js` — comments that
  must track the registry by hand; replace with a checked mapping.
- **~~WebGPU lazy-load~~ (done)** — `js/render/webgpu/*` and `js/render/three/*`
  are now DEFERRED: no `<script>` tag, injected by `js/game.js` only when
  `apex26.gfxBackend` selects one. See `tools/manifest.cjs`'s `DEFERRED` map;
  `tests/unit/load-order.test.mjs` pins the manifest, game.js's loader table and
  `sw.js`'s optional precache seed to each other.
- **~~`css/*.css` split~~ (done)** — eleven sheets under a declared `@layer`
  order (`tools/manifest.cjs` `CSS`); the visual suite still has no tracked
  golden images, so further CSS restructuring stays ungated by pixels.

---

## js/log.js — `Log`

Levelled, namespaced logging with a retained ring buffer. Loads FIRST in
`tools/manifest.cjs`, so any module can log at evaluation time.

```
Log.error/warn/info/debug(ns, ...args)   ns from Log.NAMESPACES
Log.enabled(ns, level)                -> bool   (guard hot-path debug calls)
Log.level(spec?)                      -> resolved thresholds; a string applies one
Log.persist(spec|null)                -> remember it across reloads
Log.records({ns, level, since, limit}) -> [{id, t, ns, level, msg}]
Log.clear() / Log.time(ns, label) -> end()
```

Two independent thresholds: the CONSOLE level (default `warn`) decides what a
human sees, the BUFFER level (default `info`) decides what is retained for
`__apex.logs()`. Retention is never lower than the console level — the ring is
what you read after the fact, so it cannot hold less than what printed.

Configured by `Log.level()`, `?log=<spec>`, or `apex26.logLevel`; specs are
`"debug"`, `"scenery:debug"`, `"buffer:trace"`, comma-separated. Records are
flattened to strings at emit time so a diagnostic never keeps a mesh alive.
Every host lookup is feature-detected — the track engine also runs in a Node VM
with no `localStorage` and no `location`.

## js/mat4.js — `M4`, `V3`

Column-major `Float32Array(16)`, compatible with `uniformMatrix4fv`. Every
operation is non-allocating (writes into a caller-owned `out`) — the earlier
allocating siblings (`mul`, `perspective`, `lookAt`, `translation`, `rotX`/
`rotY`/`rotZ`, `scale`, `invert`, `transformPoint`, `ortho`, and all of `V3`
except `norm`) were removed as dead code (2026-08): a full second
implementation nobody had switched away from, zero callers anywhere in the
repo including tests and tools.

```
M4.ident()                              -> mat
M4.mulTo(out, a, b)                     -> out (a*b)
M4.perspectiveTo(out, fovY, aspect, near, far) -> out
M4.lookAtTo(out, eye, target, up)       -> out, the VIEW matrix (already inverted, ready to use)
M4.orthoTo(out, l, r, b, t, n, f)       -> out
M4.invertTo(out, m)                     -> out (general 4x4 inverse; identity on singular input)
V3.norm(a)                              -> [x,y,z]
```

## js/render/shaders/ — `GLXChunks`, `GLXShaders`

All GLSL sources for the renderer as template-literal strings with no
interpolation — pure data. `chunks.js` (`GLXChunks`) holds the shared leaves
(noise/hash, GGX BRDF trio, tonemap/grade) authored once; `lit.js`, `sky.js`,
`fx.js`, and `post.js` compose them into the program sources
(LIT/SKY/SHADOW/MARK/DECAL/GLOW, the post chain, SSAO/GODRAY/COMPOSITE/FXAA/
DEPTH) on the shared `GLXShaders` global. Replaces the old monolithic
`js/render/shaders/lit.js`. `glx.js` destructures `GLXShaders` at the top of
its IIFE, so these files must load first (a manifest `HARD_EDGES` entry).

## js/render/glx.js (+ js/render/glx/) / js/render/webgpu/wgx.js / js/render/three/* / js/render/gfx.js — renderers

Boot / pipeline / parity map: **[RENDERERS.md](RENDERERS.md)**. This section
is the module contract and GLX API sketch.

### Three backends behind one seam

`js/render/gfx.js` (`Gfx`) is the renderer selection seam. `Gfx.create(canvas)`
resolves the localStorage key `apex26.gfxBackend` to a backend and returns it
(or `null` → the caller falls back to GLX). Three backends implement the same
~40-member contract (documented in the `gfx.js` header block):

| `apex26.gfxBackend` | Backend | Notes |
|---|---|---|
| unset / `"webgl2"` | **GLX** | WebGL2 — the shipped default |
| `"three"` | **TLX** | three.js r185.1 + TSL; WebGPU with automatic WebGL2 fallback inside three |
| `"webgpu"` | **WGX** | native WebGPU; requires `navigator.gpu`; opt-in. Parity recipes: [research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md) |

GLX remains the default; TLX and WGX are **opt-in only**. The pause-menu
**RENDERER** control is a 3-state cycle (WEBGL2 → THREE → WEBGPU) that writes
the key and reloads. WEBGPU without `navigator.gpu` flashes UNAVAILABLE and
does not persist. The eventual flip of the default and the deletion of
GLX/WGX is "Phase D" — future work, out of scope here.

**Every device may select every backend, phones included.** Boot used to refuse
both alternates whenever `GLX.isMobile` and the RENDERER button hid there, after
TLX on iOS rendered a flat pale ground with the lower half of the frame black.
The replacement is a **boot canary**: `js/game.js` writes `apex26.gfxBackendProbe`
before handing the canvas to an alternate and clears it once that backend is
*bound* (title SETTINGS never presents a world frame — `render()` returns on
`!track` until the deferred flyby builds — so waiting for `present()` reverted
every menu refresh to WEBGL2). The probe is re-armed around the first world
`present()` so a jetsam on that frame still reverts; a boot that still finds it
armed resets `apex26.gfxBackend` to `webgl2` unless this tab is already on a
one-shot `sessionStorage` claim-fail skip. A *live* `Gfx.create()` refusal
(Safari WebGPU self-test, missing adapter) must not write `webgl2` — keep the
pick, disarm the probe, and retry next boot. A canvas-claim failure sets that
skip, disarms the probe, and reloads so this tab can attach GLX without
erasing THREE/WEBGPU. WGX `device.lost` uses the same skip — it must not
write `webgl2` (Safari often loses the device on the first frame). That covers the failure a visible
button cannot — an iOS jetsam kill, which takes the tab with no JS error and no
`webglcontextlost`, and which the `GLX.init`-failure recovery in the same file
never sees. Everything else is recoverable by hand: the menus are DOM layered
over the canvas, so they stay legible through a garbage frame and the button
(owned by `js/game/renderer-picker.js`, visible in the HTML, wired at
DOMContentLoaded) is one tap away. Pressing the button also disarms the probe,
so switching from the menu before any world frame does not revert the choice
just made.

Note that iOS 26+ and Android 12+ (Qualcomm/ARM) expose `navigator.gpu`, so the
**WEBGPU** stop is reachable on phones. The canary is what makes a bad boot
survivable, not a claim that every phone looks right.

**WGX is opt-in and aims at the GLX draw-API surface.** Do not assume a GLX
feature exists there until you have read the backend object — a missing name
must stay an explicit `undefined` so game.js does not inherit a dead GLX
function. The 2026-08 parity pass (recipes in
[research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md)) landed:

- `gpuTimer` / `gpuMs` via `"timestamp-query"` (unsupported if the bit is absent)
- baked material arrays (`createTextureArray` / `setMaterialMaps` / `matTexMix`)
- lamp shadows, instancing family, `drawParticles`
- Poisson-8 PCSS + far 4-tap, tunable lamp-fog, world-space god-ray + lamp vol
- MSAA 4× (color `resolveTarget` + manual MS-depth resolve for SSAO; WebGPU forbids 2)
- env-probe / 2d / array mip chains (blit; WebGPU has no `generateMipmap`)
- `applyMaterial*` / `roadMarkings` / heat haze / car-paint SSR scene-alpha tag
- SSAO denoise + god-ray separable 5-tap blur (GLX `BLUR_FS`)

GLX stays the default. Nothing here flips that.

**TLX (`js/render/three/`)** is the three.js/TSL backend: classic-IIFE scripts
(`tlx.js` core + `tlx-shadow.js` / `tlx-post.js` / `tlx-chunked.js` passes +
`tsl-*.js` shader-node factories on a `TLXShaders` global) that dynamically
`import("three/webgpu")` inside `TLX.create()`. The `import` never touches
`THREE` at script-eval (three doesn't exist until `create()`), so there is no
deferred-ordering problem — the handshake IS the existing `await Gfx.create` in
game.js. Vendored three r185.1 lives OUTSIDE `js/` at top-level
`vendor/three-0.185.1/` (the load-order test walks `js/**`; an un-versioned
transitive `three.core` import would break the uniform-`?v=` rule otherwise);
an inline `<script type="importmap">` in `index.html` maps the `three`/`three/*`
specifiers to that dir (invisible to the load-order regex and the sw.js precache
parser). GLX users fetch zero vendor bytes; a dynamic-import failure resolves
`TLX.create()` to `null` → GLX fallback, never a throw.

**Façade wiring (TLX M10):** game.js talks to whichever backend `Gfx.create`
returned through the local `gfx` handle, and now passes that handle into the
track engine — `Tracks.build(def, { night, gfx })`. `tracks.js` resolves
`const G = (opts && opts.gfx) || (typeof GLX !== "undefined" ? GLX : null)` and
builds every mesh through `G` (`createMesh` / `createChunkedMesh` / `mobileTier`)
instead of reaching the `GLX` global directly. The `GLX` fallback in that line
serves only the Node-VM build guard (`tools/verify-track.cjs`) and the VM tests,
which install a stub `GLX` rather than injecting `opts.gfx`. On an opt-in, game.js
still descriptor-copies the backend's methods onto the `GLX` object — that
monkey-patch is retained purely as the **object-identity compatibility contract**
for the ~8 spec files that patch `GLX.*` and read the page-scope `GLX` global
directly (webgl-probes, parts-mesh-cache, custom-team, lighting-ab, …). Because
of the copy, `gfx === GLX` on every path, so injecting `opts.gfx` is
behaviorally identical to the old direct calls while ending the reliance on the
patch for the engine's own code.

### GLX internals

GLX is the default WebGL2 renderer. `js/render/glx.js` is the core; the
heavier passes live beside it in `js/render/glx/` — `post.js` (`GLXPost`, the
HDR post chain), `shadow.js` (`GLXShadow`, sun/car shadow maps), `chunked.js`
(`GLXChunked`, the chunked-mesh path) — each created with a shared `GLXCore`
context object so the public `GLX` surface is unchanged. WGX is selected
through the active Gfx seam only when `apex26.gfxBackend=webgpu` opts in and
WebGPU initializes successfully; otherwise game.js uses GLX. One standard lit
shader handles everything except the sky on the GLX path. Shader source
strings live in `js/render/shaders/` (globals `GLXChunks`/`GLXShaders`).

```
GLX.init(canvasEl) -> boolean         // false if no WebGL2
GLX.resize()                          // canvas.clientWidth*dpr, dpr capped at 2
                                      // (1.5 on the mobile tier);
                                      // sets GLX.width, GLX.height, GLX.aspect
GLX.createMesh(data) -> mesh          // data = {pos:Float32Array(3n), nrm:Float32Array(3n),
                                      //         col:Float32Array(3n), idx:Uint16Array|Uint32Array}
                                      // builds VAO; mesh is opaque handle
GLX.begin(frame)                      // clears color+depth, stores frame uniforms:
   frame = { viewProj: mat4, eye:[x,y,z], sunDir:[x,y,z] (normalized, TOWARD sun),
             sunColor:[r,g,b], ambientGround:[r,g,b], ambientSky:[r,g,b],
             fogColor:[r,g,b], fogDensity: number,    // exp2 fog
             lights: [x,y,z, r,g,b, rad, aim…] }      // optional stride-15 point lights (≤48, MAX_LIGHTS)
GLX.draw(mesh, modelMat, opts)        // opts optional {emissive:0..1, alpha:0..1}
                                      // lit: hemisphere ambient (mix ground/sky by N.y)
                                      //      + lambert sun + up to 48 point lights
                                      //      (diffuse, quadratic falloff to radius);
                                      //      fog by view distance.
                                      // emissive=1 -> full albedo, no lighting (night glow)
GLX.drawSky(sky)                      // fullscreen triangle via gl_VertexID, depth 1.0
   sky = { invViewProj: mat4, zenith:[r,g,b], horizon:[r,g,b],
           sunDir:[x,y,z], sunColor:[r,g,b], stars:0|1 }   // stars: cheap hash sparkle for night
GLX.drawShadow(modelMat, w, l)        // dark radial-alpha blob quad, w x l meters,
                                      // at local y=0 plane of modelMat, blended, no depth write
```

Depth test LEQUAL, backface culling CCW, `alpha:false` context;
`antialias` is always `false` on the context — the post chain renders
offscreen and resolves its own MSAA (`glx/post.js`), so browser MSAA on the
default framebuffer would be pure waste. The lit fragment shader fades to `fogColor` with
`1-exp(-(d*fogDensity)^2)`.

## js/render/gltf.js — `GLTF`

Self-contained binary glTF 2.0 (`.glb`) parser that bakes a model down to the
plain mesh data `createMesh` expects (`{pos,nrm,col,idx}`) — materials'
baseColorFactor and any COLOR_0 baked into vertex colours, all primitives
merged with node transforms applied. Self-test: `tools/gltf-selftest.mjs`.

## js/car/teams.js — `Teams`

2026 grid, hardcoded.

```
Teams.LIST -> [ { id:"mercedes", name:"Mercedes-AMG Petronas", short:"MER",
                  color:[r,g,b], color2:[r,g,b], engine:"Mercedes",
                  tier:0,                 // 0 fastest .. 4 slowest
                  drivers:[ {name:"George Russell", code:"RUS", num:63},
                            {name:"Kimi Antonelli", code:"ANT", num:12} ] }, ... ]
// 11 teams in 2026 spec: Mercedes(t0), Ferrari(t1), McLaren(t1, Norris num:1),
// Red Bull(t2, Verstappen num:33), Alpine(t3), Racing Bulls(t3), Haas(t3),
// Williams(t3), Audi(t4), Aston Martin(t4), Cadillac(t4, Perez 11 / Bottas 77)
Teams.TIER_V -> [1.0, 0.988, 0.973, 0.958, 0.942]   // ground-speed scale per tier
Teams.DEFAULT_CUSTOM -> the MY TEAM seed record (id "custom", tier 2)
Teams.POINTS  -> [25,18,15,12,10,8,6,4,2,1]   // top 10, no fastest-lap point
```

## js/track/geom.js — `TrackGeom`

The pure geometry emitters shared by the road/terrain builders and the scenery
modules: `addBox, emit, addPrism, addPyramid, addCone, addCyl, addFrustum,
addMountain` plus the vec helpers (`cross`, `norm`, `vadd`) and the `MAT`
material-id map. Each `add*(out, …)` pushes pos/nrm/col/idx into the caller's
accumulator; stateless, renderer-free (loads under verify-track's bare VM).
The engine destructures it and the scenery modules re-wrap the emitters with
the on-track rejection guard (`RAW`).

## js/track/scenery-data.js — `TrackSceneryData`

The GENERIC dressing tables hoisted out of buildProps: the theme fallbacks
`FURN_DEF` (trees + lamps), `KIT_DEF` (barrier/signage/marshal families),
`THEME_DEF` (city style) and `STAND_SET_DEF`, plus `STAND_LIVERIES`,
`CROWD_DAY`, `WINTINTS`, `HOUSE_*`, `MOTORHOME_BODY`, `SIGN_SEG`/`SIGN_DIGIT`,
the colour packs `NC`/`DC`/`ATM`/`COL`, `BLD`, and `resolveCityStyle()` (turns
a def's `cityStyle` colour NAMES into `NC`/`DC` arrays). Pure constants —
anything that closes over placement state stays in the scenery modules, and
anything PER-CIRCUIT is a key of the def (below), never an id-keyed table here.

## js/track/ — the rest of the engine

One concern per file, all loaded before `tracks.js`:

| File | Global | Owns |
|---|---|---|
| `spline.js` | `TrackSpline` | closed Catmull-Rom sampling, curvature |
| `graph.js` | `TrackGraph` | the scenery model library + node graph (HARD_EDGES pair with `tracks.js`) |
| `mesh.js` | `TrackMesh` | road/terrain mesh extrusion (`buildRoad`/`buildTerrain`) |
| `space.js` | `TrackSpace` | world↔track (Frenet) projection used by physics |
| `surface.js` | `TrackSurface` | road-surface build details, per-track tarmac/verge tints |
| `models.js` | `TrackModels` | composite prop models shared across circuits |
| `themes.js` | `SceneryThemes` | theme tables for the city generator |
| `landmark-kit.js` / `circuit-kit.js` | `LandmarkKit` / `CircuitKit` | landmark & circuit composite kits for `scenery(api)` |
| `maps.js` | `TrackMaps` | offline 2D picker outlines from the spline engine — was `trackmaps.js` |
| `scenery-nature.js` / `scenery-city.js` / `scenery-structures.js` / `scenery-identity.js` | `Scenery*` | the buildProps split (below) |

**The buildProps split.** Prop placement is four `Scenery*.create(ctx)`
modules — nature (trees/terrain furniture), city (the `cityStyle` building
generator, neon, glass), structures (grandstands, gantries, barriers,
floodmasts), identity (per-circuit landmark passes) — each instantiated with a
ctx of the placement helpers and accumulators. Together they serve the
**111-member `scenery(api)` contract**, frozen by
`tests/unit/scenery-api-contract.test.mjs`: a circuit's `scenery(api)` callback can
destructure any of those 111 names, so removing/renaming one is a breaking
change the test catches. See [SCENERY-API.md](SCENERY-API.md).

## js/circuits/<id>.js — `TrackDefs` (circuit data)

One def file per circuit, plus one scenery file under `js/circuits/scenery/`.
The def is a self-contained IIFE that pushes a plain data object onto the
global `TrackDefs` list — no engine logic, no palette helpers, just raw fields.
**The def is the single home of a circuit's data**: its real centreline
(`path`), curated sector splits + turn apexes (`sectors`, `turns`) and its
dressing rows (`barrier`, `furniture`, `kit`, `standSet`, `cityStyle`) all live
here — there are no id-keyed tables in `js/track/` any more, and the engine
reads every one of them off the BUILT def (`tests/unit/circuit-def-fields.test.mjs`
pins that they survive the copy).
The bespoke `scenery(api)` closure lives in `js/circuits/scenery/<id>.js`
(registered on `window.TrackScenery[id]`, no `<script>` tag: `game.js` fetches
the one it is about to build, ~27 KB each, so a session does not parse all 40). Loaded *before* `js/track/tracks.js`, in the order their
`<script>` tags appear in `index.html` (this is **not** the real-world F1
calendar order). **Tag order == `Tracks.LIST` order == picker/season order.**

```
def = { id, name, gp, country, night, theme, lengthKm, baseHW,
        street?:true,                              // continuous-barrier street circuit
        pal: { ...palette overrides... },          // engine wraps with day/nightPal
        path: { len, pts: [[x,z], ...] },          // REQUIRED: the real centreline (OSM trace, open loop)
        sectors?: [s1End, s2End], turns: [frac…],  // curated FIA markings, RACING-LAP fractions, never fmap'd
        barrier?: {a,b,c,night,tyre},              // armco livery (street / night circuits)
        furniture: {tree, fol, lamp, lc?, sparse?, treeCrown?},   // roadside planting + lamps
        kit: {marshal, rail, fence, tyre, board, gantry, camera, hoarding},   // api.kitOf families
        standSet: [livery, livery, livery],        // grandstand livery rotation (STAND_LIVERIES names)
        cityStyle?: {neon: [NC names], dayPal: [DC names], bias, fh, bh, kinds, neonKinds, tone},
        bridges?:   [ {s,halfM,rise}, ... ],       // figure-8 overpass deck (terrain stays flat)
        elevations?:[ {s,halfM,rise}, ... ],       // real elevation bumps (terrain follows road)
        hwZones?:   [ {s0,s1,hw,ease?}, ... ] }    // half-width overlays on the path
```

## js/track/tracks.js — `Tracks` (engine shell)

Resolves each `TrackDefs` entry (palette from the `night` flag, geometry from
the def's `path` — a def without one is a build error naming the circuit, there
is no authored-segment fallback), samples the
closed Catmull-Rom spline (via `TrackSpline`), and orchestrates the build —
road/terrain meshes through `TrackMesh`/`TrackSurface`, props through the four
scenery modules.

```
Tracks.LIST -> [ trackDef, ... ]   // 40 circuits. LIST order == the `<script>` load
                                   // order in index.html (each circuits/<id>.js registers
                                   // itself as it loads) — it is NOT the real F1 calendar
                                   // order. Check tools/manifest.cjs / index.html.
trackDef = { id, name:"MONZA", gp:"Italian GP", country:"Italy",
             laps:3, night:false, lengthKm:5.79,
             palette: { zenith,horizon,sun:[r,g,b], grass:[r,g,b], runoff:[r,g,b],
                        fog:[r,g,b], fogDensity:number, kerbA:[r,g,b], kerbB:[r,g,b],
                        ambientSky:[r,g,b], ambientGround:[r,g,b], sunColor:[r,g,b],
                        sunDir:[x,y,z] },
             points: [ [x, y, z, halfWidth?, bank?], ... ] }  // halfWidth default 7, bank rad default 0

Tracks.build(trackDef, { night?, gfx? }) -> track   // gfx = active renderer backend
                                                    //   (façade wiring; falls back to
                                                    //   the GLX global for VM callers)
track = { def, total,                       // total = length of loop in meters
          n,                                // sample count (spacing ~4 m)
          // parallel typed arrays, length n (closed loop, sample i at s = i*total/n):
          px,py,pz, tx,ty,tz, rx,ry,rz,     // position, tangent, right (banked)
          hw,                               // half width
          meshes: { road, terrain, props, gate },  // renderer mesh handles (created by build)
          map: [ [x,z], ... ] }             // ~200 pts for the DOM minimap, normalized 0..1

Tracks.sample(track, s, out)   // s wraps; out = {p:[3], t:[3], r:[3], hw:number}
                               // linear interp between samples; REUSE out, no alloc
Tracks.curvature(track, s)     // signed curvature 1/m at s (+ = LEFT turn, measured), smoothed
```

Mesh content baked as vertex colors: asphalt `[0.16,0.16,0.17]` with subtle
per-slice variation, white edge lines, red/white kerb stripes alternating
every ~4 m on corner outsides, start/finish checker band at s≈0, grass/runoff
terrain skirt ~40 m each side, simple themed props (boxes/prisms: grandstands,
trees, buildings, floodlight poles for night tracks) and a start gantry. Props
should be ONE merged mesh per track. Road slices: 14 verts across the section
(grass shoulder · kerb · bold edge line · asphalt · dashed centre · asphalt ·
edge line · kerb · grass shoulder), banked along `up` on banked corners. The
grass-shoulder verts sit a hair below the asphalt plane and any shoulder vert
that chords over a nearby node's tarmac (tight-corner inside) is buried under it.

**Terrain ribbon (`buildTerrain`)**: a 5-vert-per-side skirt whose inner edge
hugs the road and outer edge eases (quadratic) down to the lap low point.
An **over-track clip** lowers any ribbon vert/face that would render above the
racing surface — the inside of corners, fold-backs, and the channel cut where an
elevation mound (e.g. a rise that runs close to a lower part of the lap) bulges
over the road. The raw geometry is kept on `track.terrainGeo` so the scenery
modules' `anchor()` can raycast it (`terrainY`) and seat roadside props on the
real carved ground rather than the closed-form `groundYAt` estimate — no
floating/sunk props. Two whole-circuit audits assert nothing renders over the
racing line: `tests/specs/terrain-over-road.spec.js` for terrain/road faces (large
road-over-road overs ignored as intentional crossovers, e.g. Suzuka figure-8),
and `tests/specs/props-over-road.spec.js` for scenery props (roofs/canopies/buildings/
crowds). The prop guard itself wraps every primitive emitter in a
full-footprint Minkowski test (`rejBox`/`onRoadHit`) against the road
half-width, so `building()`/`neonTower`/floodlight masts drop any part that
would overhang the tarmac on a curving stretch — not just their inner-face point.

## js/car/car3d.js — `Car3D`

```
Car3D.build(color, color2) -> meshData   // PLAIN data {pos,nrm,col,idx} for renderer.createMesh
                                         // (game creates one renderer mesh per team, shared by both cars)
```
Local space: origin at ground under center of gravity, **+Z forward, +Y up**.
~1.9 m wide, ~5.4 m long. Parts: floor, tapered nose, front wing + endplates,
sidepods, cockpit + halo (3 thin boxes), engine cover spine + airbox, rear
wing on endplates, 4 wheel boxes (dark `[0.05,0.05,0.05]`, slightly rounded
via chamfer prisms ok). color = livery body, color2 = wings/accents. Flat
shading (duplicated verts, face normals).

## js/car/ — the rest of the car domain

| File | Global | Owns |
|---|---|---|
| `liveries.js` | `Liveries` | custom paint jobs — `{id, name, c1, c2, stripe?, noseStripe?, …}` |
| `liverytex.js` | `LiveryTex` | per-team livery texture atlas (canvas-2D; stylised fan-art crests, invented sponsor wordmarks, car number onto a 1024² atlas mapped by panel UVs) |
| `driver-ratings.js` | `DriverRatings` | the five-axis skill table for the grid (pace / racecraft / awareness / consistency / experience), keyed by driver CODE. Feeds every AI car's `skill` in EVERY mode, not just career. Kept out of `teams.js` because that is verified real-world data and is also loaded by `tools/carview.html` |
| `parts.js` | `Parts` | upgrade catalog — 12 ordered categories, `getMods`, `getCost`, `statMult`, 780 cr budget (see docs/PARTS.md) |
| `ghost.js` | `Ghost` | time-trial ghost: records the player's lap as parallel `(t, s, x)` arrays, replays the best one; pure data layer — game.js feeds samples and draws |

## js/game/input.js — `Input`

Steering priority: keyboard > tilt > touch.

```
Input.init(canvasEl, {onPause})
Input.requestGyro() -> Promise<boolean>   // call from user gesture (iOS)
Input.calibrate()                          // capture neutral tilt
Input.steer() -> -1..1                     // deadzone 2.5deg, MAX_TILT=36deg for full lock,
                                           // One-Euro low-pass, remap by screen.orientation.angle
Input.braking() -> bool                    // ArrowDown/S or BRAKE touch button
Input.consumeBoostToggle() -> bool         // boost is a TOGGLE (Space / BOOST button taps
                                           // flip it on/off — not held)
Input.consumeOvertake() -> bool            // X key or OT button tap (edge-triggered)
Input.tiltActive() -> bool
Input.setSteerMode("tilt"|"buttons"|"touch")   // tilt opt-in lives in the steer mode
Input.touchControlsNeeded() -> bool        // coarse pointer
```
Touch layout (game.js shows/hides the DOM buttons, input.js wires them):
left/right steer halves on the lower screen when tilt off; `#btn-boost`,
`#btn-ot`, `#btn-brake` buttons always in race. Listeners use
`{passive:false}` + preventDefault on the canvas only.

## js/game/audio.js — `GameAudio`

Engine = a looping recorded drone pitched by revs (assets/sfx/f1_engine.mp3),
with a saw+square synth pair ~90–700 Hz as the fallback when decode fails.
Continuous layers over it, all on `sfxBus`: turbo whine (high sine), MGU-K
harvest whirr under deceleration, ERS deploy whine while the battery is
deploying (level tracks charge, pitch sags under 20%), AIRFLOW (broadband
bandpass rising with speed², plus kerb/offroad buffeting and wet spray), an
offroad pitch LFO, and the tyre screech. Per-manufacturer timbre comes from
`ENGINE_VOICES` keyed by `team.engine` — `setVoice()` before `startEngine()`.
Must init from a user gesture.

```
GameAudio.init()  GameAudio.setEnabled(b)  GameAudio.enabled() -> bool
GameAudio.setVoice(engineName)   // "Mercedes" | "Ferrari" | "Red Bull Ford" | "Honda" | "Audi"
GameAudio.startEngine() / stopEngine()
GameAudio.setEngine(rev01, boost01, offroad, speed01, gear, physics?)
  // physics (optional): { slip, ax, onKerb, wet, deploy, energy, ersDeploy }
GameAudio.setSkid(x 0..1)
SFX: lightOn(i 0..4), lightsOut(), overtakeReady(), deployBoost(), xMode(on),
     collision(), offtrack(), lap(), finish(), uiTick(), uiSelect(), penalty()
GameAudio.startMusic(trackIdx) / stopMusic()   // menu uses startMusic(-1)
// lookahead scheduler (300 ms, timer + rAF), 2-3 short loops reused across tracks ok
```

## js/data/api.js — `F1API`

Jolpica `https://api.jolpi.ca/ergast/f1/` + OpenF1 `https://api.openf1.org/v1`.
All methods return Promises of SIMPLIFIED plain objects (not raw API shapes).
Single internal queue: min 400 ms between requests, localStorage cache
(`apex26.api.<url>` -> `{t, data}`), TTLs: schedule 24 h, standings/results
1 h, openf1 latest-session 10 min, finished session data 7 d. On 429 or
network error: serve stale cache if present, else reject. Never auto-poll.

```
F1API.schedule()              -> [{round, name, circuit, locality, country, date, time, hasSprint}]
F1API.driverStandings()       -> [{pos, points, wins, name, code, number, team}]
F1API.constructorStandings()  -> [{pos, points, wins, name}]
F1API.lastRace()              -> {name, round, date, results:[{pos, name, code, team, grid, points, status, time}]}
F1API.latestSession()         -> {sessionKey, name, type, circuit, country, dateStart} | null
F1API.weather(sessionKey)     -> {airT, trackT, humidity, rainfall, windSpeed} | null
F1API.positions(sessionKey)   -> [{num, pos}] | null      // folded latest per driver
F1API.sessionDrivers(sessionKey) -> [{num, code, name, team, color}] | null
```

## js/data/ — the hub and its tabs

`hub.js` (`DataHub`, was `data.js`) is the DOM overlay (`#datahub` in
index.html) and the shared session plumbing; each tab is its own module
exposing `create(ctx) -> { load<Tab>, … }`, instantiated once by the shell
with exactly the helpers it needs (`el`/`clear`/`spinner`/`emptyMsg` DOM
builders, `ensureSession`/`buildPicker`/`invalidateOther` session plumbing,
`COMPOUND`, `findTeam`/`cssColor`, message constants). All use the `F1API`
global directly and load before hub.js.

| File | Global | Tab |
|---|---|---|
| `schedule.js` | `DataSchedule` | SCHEDULE |
| `standings.js` | `DataStandings` | STANDINGS (drivers + constructors) |
| `lastrace.js` | `DataLastRace` | LAST RACE |
| `live.js` | `DataLive` | LIVE (30 s refresh loop) |
| `telemetry.js` | `DataTelemetry` | TELEMETRY (trace viewer/map/playback; also returns `closeTelemPopup` — the shell closes the popup on tab switch / hub close) |
| `export.js` | `DataExport` | EXPORT dev tool (GPS traces → ZIP) |

Tabs build DOM with createElement (no innerHTML for API data), show loading
spinners, stale-data notes ("cached Xm ago"), graceful errors. Team color
chips use `Teams.LIST` colors matched by name substring.

```
DataHub.init(rootEl)   DataHub.open()   DataHub.close()   DataHub.isOpen() -> bool
```
Styles in `css/data.css` only (prefix all classes `dh-`).

## Where the old `tables.js` rows live

The grab-bag data file went with Phase 2a of
`docs/research/TREE-RESTRUCTURE-2026-09.md`; each row sits with its owner:
`DEFAULT_CUSTOM` and `TIER_V` in `js/car/teams.js` (the record shape and the
`tier` field they index), `GEARS`/`GEAR_TOP`/`IDLE_RPM`/`MAX_RPM` and `DIFF`
in `js/game/physics-consts.js` (immutable model numbers, already eval-pinned
before every reader), `CAM_MODES` in `js/game/cam-modes.js`
(`CamModes.CAM_MODES`), and the four `PAINT_*` car-paint constants in
`js/game.js` beside `carPaintMat()`, their only reader.

## js/game/lighting.js — `LightTune` (a façade over three files)

The lighting-tuner core, split by lifecycle (Phase 2a of
`docs/research/TREE-RESTRUCTURE-2026-09.md`):

- `js/game/lighting-knobs.js` — `LightKnobs`: `TUNE_DEFS` (the slider
  registry — the `def` values ARE the shipped tuning; min/max/step are the
  clamps) and the live `LT` value object (a plain object mutated in place by
  `light-store.js`'s profile resolution and `__apex.lightTune`).
- `js/game/track-lights.js` — `TrackLights`: `buildTrackLights(track)` bakes
  the per-track light records ONCE per track (colour and fixture character from
  the internal `floodColor` + `LAMP_KINDS` tables, the LAMP DENSITY and
  DARK-GAP FILL walks), plus `lampStrideNodes`.
- `js/game/frame-lights.js` — `FrameLights`: the per-frame light upload —
  `setFrameLights` (distance-sorted cull to the frame CAP, twilight scale,
  flicker / warm-up, the per-chunk full-set twin) and `appendCarTailLights`.
- `js/game/lighting.js` — `LightTune`: re-exports the three as the ONE surface
  every consumer reads (`LightTune.TUNE_DEFS` / `LT` / `buildTrackLights` /
  `setFrameLights` / …). The eval-time edges are `HARD_EDGES` pairs in
  `tools/manifest.cjs`; both siblings destructure `LightKnobs.LT` at eval.

Profile persistence and the (track, time-of-day, weather) resolution live in
`js/game/light-store.js` — they read live session state.

## js/game/carmesh.js — `CarMesh`

Car decal-quad geometry (`carDecalData` + the shared decal meshes), the effect
quads (brake-glow ring, rain light, exhaust/boost flames, ERS strip) and the
cockpit-rig instrument builders (wheel, LED strip, gear/speed digits, ERS and
pedal bars, OT lamp), with their memo caches. Only dependency is the renderer
handle, injected once at boot: `CarMesh.init(gfx)`. State-coupled car drawing
(teamMesh, playerBodyMesh, cockpitBodyMesh, drawCockpitRig, decal textures)
stays in game.js.

## js/game/particles.js — `Particles`

Shared transient-particle pool (tyre smoke, collision sparks, gravel/grass
kickup, rain spray): a fixed CPU pool of camera-facing soft billboards drawn
in two batches per frame via `gfx.drawParticles()` — alpha-blended
(smoke/dust/spray) and additive (sparks; HDR tints feed bloom for free). Also
owns the **rain overlay** (`Particles.rain*`). Emitters only READ car state;
update/draw run in the RENDER path only, never inside the physics step, so
headless obs/act runs are identical with FX on or off.

## js/game/ — the extracted game modules

Each is an IIFE global instantiated by game.js with the **`G` ctx façade**
(see Reorg above) — one object of live getters/setters over game.js closure
state plus stable helpers, passed to `Module.create(G)`:

| File | Global | Owns |
|---|---|---|
| `physics-consts.js` | `PhysicsConsts` | the driving model's immutable numbers (`VMAX`, `LAT_MAX`, `BRAKE`, …, the `GEAR_TOP`/`IDLE_RPM`/`MAX_RPM` gearbox and the `DIFF` difficulty presets), destructured once by game.js at eval time (a `HARD_EDGES` entry in `tools/manifest.cjs`; `hud.js` reads the RPM pair the same way). Values only — anything a slider or `setPhysics` can change stays a `let` in game.js. A plain data global, not a `create(G)` module |
| `store.js` | `GameStore` | localStorage persistence (settings, season, parts, records) + the career save and its migration ladder |
| `career.js` | `Career` | CAREER rules: the `apex26.career.<flavour>.0..2` saves (three DRIVER slots and three MY TEAM slots in separate sets, one live at a time; both earlier layouts migrate in), the credits economy, contracts, driver/team development, R&D ownership, round settlement. Pure data — no DOM, and a plain global (no ctx), because game.js calls it from `makeCars()`/`recomputePlayerMods()`/`endRace()`. Every GAMEPLAY accessor is gated on `inCareer()`, NOT on "a save exists": the save loads at boot so the title button can offer CONTINUE, but its rules must never reach a Grand Prix |
| `career-ui.js` | `CareerUI` | the CAREER screen (`#career`) — three states in one sheet: CAREER MODES (both modes, their six slots and their guides — the title button's one door), new-career setup, and the season hub. States rather than screens, so all three inherit the sheet's MenuNav / ScrollFade / AriaState registration instead of needing their own. Replaces `#select` in career, since the calendar owns where you race |
| `quali.js` | `Quali` | ONE-LAP QUALIFYING, the MODEL. A `session`, not a game state: the player's flying lap reuses the time-trial path, and the rest of the field is MODELLED — a quasi-steady forward/backward lap simulation off the same `LAT_MAX`/`ACCEL`/`BRAKE` the driving model uses, so a simulated time and a driven one land on one scale. Owns the classification between session and grid and its persist (`season.qualiOrder`); feeds `gridUp()`. No DOM — `rows()` is what the sheet paints |
| `quali-sheet.js` | `QualiSheet` | the QUALIFYING sheet (`#quali`): `build(rows)` / `open(rows)` / `close()` over `quali.rows()` — pure DOM assembly of the model's classification (podium classes, the DRIVEN tag on a rival's real lap, the P-title). No timing, no ordering, no persist |
| `reliability.js` | `Reliability` | RELIABILITY / DNFs — whether a car reaches the flag. Risk is DERIVED (team tier, relieved by career team development and by the player's fitted engine + gearbox), never authored per team. The whole field's retirements are drawn ONCE at the green light from a stateless hash of `(seed, round, driver)`, so arming a race consumes nothing from the sim RNG stream. Ships OFF — opt-in per race via the RELIABILITY setting |
| `perf.js` | `PerfGov` | adaptive performance governor (render scale / FX tiers) |
| `cameras.js` | `GameCams` | the 13 player camera modes + the `__apex.view` debug free-cam framing |
| `cam-modes.js` | `CamModes` | `CAM_MODES` (the 13-entry player camera list — index IS the persisted `camMode`) plus the CAM button / picker-grid / C-key mode-switch UI (broadcast-only; mutates `camMode` through `G`) — the DOM front-end to `cameras.js` |
| `hud.js` | `GameHud` | in-race DOM HUD (pos/lap/times, speed, energy, gaps, minimap) |
| `results.js` | `GameResults` | results + season-end screens, penalties, points |
| `apex.js` | `ApexApi` | the **whole `window.__apex` dev API** (see DEBUG-HOOKS.md). `LAZY_AGENT` — no tagged script; `game.js` injects it when `wantAgentSurface()` |
| `atmosphere.js` | `Atmosphere` | `applyRaceSettings` — time-of-day/weather scene state, palettes, flood activation |
| `setup-ui.js` | `SetupUI` | GARAGE screen — TEAM & DRIVER, 12 part categories + budget, LIVERY |
| `menus.js` | `Menus` | menu/select/pause DOM flows |
| `scrollfade.js` | `ScrollFade` | edge fade + scroll-position indicator on every menu pane (self-initialising, owns no game state) |
| `menunav.js` | `MenuNav` | desktop menu input (self-initialising): wheel/trackpad gestures that land outside a pane are redirected into the open menu's nearest one, and arrow keys / Home / End / PageUp / PageDown move focus through it |
| `photomode.js` | `Photomode` | photo mode ONLY — the free-fly camera, its touch sticks / hold buttons and the enter/exit plumbing; the lighting tuner's `lt-*` buttons live in `tuner.js` |
| `tuner.js` | `TunerPanel` | LIGHTING TUNER pause-menu panel: slider rows from `TUNE_DEFS`, preview chips, COPY TO ALL TRACKS, the help toggle, RESET and the COPY VALUES export (`window.LightEdits`) |
| `steer-tuning.js` | `SteerTuning` | ADVANCED STEERING panel (presets + sliders) |
| `aerozones.js` | `AeroZones` | ACTIVE AERO activation zones — pure circuit GEOMETRY (curvature in, arc-metre spans out). Knows nothing about a car; `xStraightAhead()`/`aeroDfMult()` stay in game.js because they read car state |
| `skidmarks.js` | `SkidMarks` | the 120-entry tyre-mark ring buffer plus its batched vertex build — one draw call instead of up to 120 per frame — and the per-mark fallback for GPUs where the batch program fails to link. Fully self-contained: game.js calls only `reset()` / `stamp()` / `draw()` |
| `sheetshape.js` | `SheetShape` | self-initialising: measures every `.sheet` with a ResizeObserver and writes `data-shape="tall\|wide"` / `data-pair`. **Its consumer is CSS**, not JS — which is why a JS-only reference scan reports it as orphaned |
| `topmodal.js` | `TopModal` | self-initialising: the top-layer/z-index ladder over the 19 `<dialog class="screen">` elements, reading `data-esc-close` / `data-esc`. Same CSS/DOM-contract shape as `sheetshape.js` |
| `ariastate.js` | `AriaState` | mirrors each option group's visual selection onto `aria-pressed` for screen readers |

The table lists the modules whose contracts need prose; the rest of `js/game/`
(58 files today — input, audio, lighting, particles, ai-drive, season-cal,
ui-scale, gfx-quality, renderer-picker, metrics and the rest) is enumerated by
`tools/manifest.cjs`, which is the roster truth AGENTS.md's layout defers to
(the docs-integrity guard asserts the deferral, not a per-file list).

## js/game.js — main

The entry point (the largest file in the repo — its line ceiling is ratcheted by
`tests/data/ratchets.json`; loop, physics, AI, race logic — the subsystems
above are extracted). Player + 21 AI.

**States** are `menu | count | race | results` — those are the only four values
ever assigned to `state`. (This previously listed `select` and `seasonEnd` as
well; neither exists. The select screen is shown by unhiding `#select` while the
state stays `menu`, and the season-end panel is the `results` state with
`#res-next` relabelled.)

**Mode** is two independent axes rather than one enum, because a career weekend
has to be able to say "career" and "qualifying" at the same time:

- `flow` — `gp | season | career`: what the RUN is for; survives a whole championship.
- `session` — `race | tt | quali`: what THIS visit to the track is.

`seasonMode` and `timeTrial` are no longer state: they are derived views handed
out through the `G` façade (`seasonMode` = `flow` is season **or** career, since a
career is a championship), which is why every module that reads them and the
`__apex.info()` contract were unaffected by the split. `setFlow()` is the only
writer — it also tells `Career` whether its rules apply. See docs/CAREER.md.
Position model: the car drives in **world space** (`player.head` = world
heading, `px/pz` world position); `s` (metres along centreline, wraps) and `x`
(lateral metres, +right) are recovered by projection each frame. Physics:
arcade — vmax base `VMAX = 72` m/s scaled by tier (player = tier1 equivalent),
electric deploy (`DEPLOY_A = 3.0` m/s²) tapers to 0 across the `TAPER_LO..TAPER_HI`
= 41–53 m/s band, boost drains energy bar (recharges under braking + slow
corners), OVERTAKE: when gap to car ahead < 1.0 s, OT light on; activating gives
a full-taper-free deploy sized by the fitted ERS part — 3.2–5.2 s push, then a
9–14 s cooldown (`OT_TIME_LO/HI` / `OT_COOL_LO/HI` in
`js/game/physics-consts.js`; a no-parts car sits at the midpoint). OT is FREE — it draws nothing
from the battery and fires on a flat one; its OT_GAP/OT_COOL window is the only
limiter. Grass (|x| > hw) = heavy drag.
Walls sit at the per-node barrier limit from `Tracks.wallAt`: soft push back.
Cars collide as ~4.8 × 2.0 m oriented boxes: lateral push + small speed loss.
AI: follow racing-line offset = -curvatureAhead * k, brake by curvature, tier
speed + rubber-band by difficulty (EASY/NORMAL/HARD). Start: grid 22 (player P12
default, tier order), five red lights (1 s apart) then out. Race =
`GAME_LAPS` (3). HUD (DOM): pos/lap/laptime/best, speed km/h, energy bar, OT
indicator, gaps, minimap canvas 2D. Penalty: a repeating ladder — three
warnings, +5 s on the 4th cut (announced in-race), then the warning count
resets; `cuts` stays the lifetime total for the career `clean` objective. Points per Teams.POINTS; SEASON mode = Tracks.SEASON (the 24
non-`classic` circuits; the 16 retired ones are playable but never a round)
in load order, standings table between races, saved in
`apex26.season`. localStorage: hiscore N/A, settings (team, difficulty, tilt,
sound), season.

Camera: 13 player modes (`CAM_MODES` in `js/game/cam-modes.js`, driven by
`GameCams`) cycled with the CAM button / C key (persisted) — CHASE (close,
behind+above), FAR (pulled back/up), DRIFT (swings outside on a slide),
COCKPIT (onboard eye, player car hidden), HOOD (nose cam), OVERHEAD (top-down
drone), HELI (broadcast heli), REVERSE (mounted ahead looking back), TV SIDE
(trackside panning), CINEMATIC (slow orbit), LOW (surface skimmer), T-CAM
(roll-hoop broadcast), REAR CAM (tail-mounted looking back). Chase modes
anchor a fixed arc-length behind the car so they never lag at speed; onboard
modes ride ON the car with very high damping. fov widens with speed; a debug
free camera (`__apex.view`) can override all of it.

Debug & test API: `window.__apex` (built by `js/game/apex.js`) drives the game
from the console or a headless harness — loading/positioning
(race/park/jump/aim/sky/go/info), cameras (camera/view/snapCam), telemetry
(probe/physState/tuning/cars/corners/wallStats), deterministic physics
(setInput/clearInput/step/setPhysics), and collision/AI scenarios
(rival/rivals/pair/jam). Full reference in [DEBUG-HOOKS.md](DEBUG-HOOKS.md).
Per-circuit scenery design briefs live in [docs/tracks/](tracks/).

## index.html / css

`index.html` owns ALL static DOM: canvas `#game`, HUD, overlay menus, select
screen, pause menu, data hub root, touch buttons, help modal. Script tags must
match `tools/manifest.cjs` (asserted by `tests/unit/load-order.test.mjs`).
`css/*.css` = layout/HUD/menus (F1 style: black `#0a0a0f`, red `#e10600`
accents, bold italic headings); `css/data.css` = data hub only. Cache-bust
every script/style URL with `?v=<sha256>`, while a separate monotonic shell generation
(check `index.html` for the current value). `version.json` `{ "build": N }`
mirrors the same `N`; the shell version guard uses it to force-refresh a stale
installed PWA.

## Deploy

`.github/workflows/pages.yml`: on push to `claude/f1-game-project-26h3ng` or
workflow_dispatch, stage the runtime subset in `_site` (`index.html`,
`version.json`, `manifest.json`, `sw.js`, `.nojekyll`, `js/`, `css/`, `icons/`,
`assets/`, and `vendor/` — asserted by `tests/unit/deploy-staging.test.mjs`)
and deploy that Pages artifact. Tests, tools, docs, and other repository-only
files are not shipped. `manifest.json` defines the PWA. NOT affiliated with
FIA/F1 — fan project disclaimer in README and menu footer ("Unofficial fan
project").
