# Package research — helpful libraries for Apex 26 (2025–2026)

Companion to `ADOPTION-PLAN.md`. Consolidates four web-research sweeps
(physics/vehicle-dynamics, three.js rendering ecosystem, performance/worker/WASM,
game systems). Research-only — nothing here is adopted yet; it's the menu.

**The constraint that governs every verdict:** Apex 26 is no-build-step, pure
IIFE `<script>` globals + one importmap-loaded three.js island, static-hosted on
GitHub Pages. GitHub Pages **cannot set HTTP headers**, so cross-origin isolation
(COOP/COEP) is unavailable — which rules out **`SharedArrayBuffer` / WASM
threads** and nothing else. Everything below is tagged:
✅ static-OK · ⚠️ works-with-caveats · ❌ needs-server-or-headers-or-bundler.

Every candidate splits three ways for loading: **UMD global** (one `<script>`,
zero friction) · **vendored ESM + importmap** (works, but adds a module boundary
to bridge into the IIFE closures) · **server/bundler-required** (off GitHub Pages).

---

## 1. Physics & vehicle dynamics

**Verdict: stay on Rapier. One genuinely useful additive newcomer (TreadJS).**

Measured single-file dist sizes (from actual npm tarballs):

| Package | Ver | License | gzip dist | WASM | Load |
|---|---|---|---|---|---|
| `@dimforge/rapier3d-compat` | 0.19.3 | Apache-2.0 | **815 KB** | inlined | ESM/importmap ✅ |
| `…-deterministic-compat` | 0.19.3 | Apache-2.0 | 827 KB | inlined | ✅ |
| `…-simd-compat` | 0.19.3 | Apache-2.0 | 842 KB | inlined | ✅ (needs simd128) |
| `jolt-physics` (single-thread) | 1.1.0 | MIT | 884 KB | inlined | ESM ✅ / multithread ❌ |
| `cannon-es` | 0.20.0 | MIT | 73 KB | none | UMD ✅ — **dormant since 2022** |
| `planck` | 1.5.0 | MIT | 53 KB | none | UMD global ✅ (2D only) |
| `physx-js-webidl` | 2.7.3 | MIT | ~10 MB total | separate | ❌ too big |
| `ammo.js` | dormant | MIT/Zlib | — | separate | unmaintained, non-deterministic |

- **Determinism boundary (important):** the plain `rapier3d-compat` we ship is
  **locally** deterministic, NOT cross-platform bit-identical. Fine for cosmetic
  debris. If we ever route anything the deterministic headless test-loop depends
  on through Rapier, swap to **`@dimforge/rapier3d-deterministic-compat`** — a
  drop-in same-API build (~+12 KB gz, gives up SIMD) that guarantees bit-identity.
  Mutually exclusive with SIMD. (Corrects the ADOPTION-PLAN note that
  enhanced-determinism needed a custom build — it's now a prebuilt bundle.)
- **SIMD is header-free** (needs only `simd128`, Baseline since early 2025):
  `rapier3d-simd-compat` is a 2–5× win over 2024 builds with no bundler/headers.
  The threads increment (another 1.8–2.9×) is the only thing COOP/COEP gates.
- **Vehicle controllers exist** (Rapier `DynamicRayCastVehicleController`, cannon
  `RaycastVehicle`, Jolt `WheeledVehicleController`) but all are arcade raycast
  models lacking our combined-slip friction ellipse — corroborating the deep-dive:
  player physics stays bespoke.
- **TreadJS `@hivoltagexyz/tread`** (BSD-3, pure JS, no deps, ESM) — a Pacejka-2002
  Magic Formula *force* model (F_x/F_y/M_z…, parses `.tir`). Not an engine; it
  slots ALONGSIDE our per-axle model. The one compelling additive find — useful to
  validate/extend our combined-slip math against a published tire model.

**Action:** consider `rapier3d-simd-compat` now (default-on debris = everyone
loads Rapier; SIMD is a free win); keep the deterministic build in mind as the
boundary if Rapier ever feeds gameplay. TreadJS is a physics-validation spike.

---

## 2. three.js rendering ecosystem (r184, WebGPU + WebGL2 fallback)

**Verdict: our custom-TSL post chain was the right call; three backend-agnostic
helpers are worth adopting.**

- **The legacy post pipeline is a dead end on WebGPU.** `EffectComposer`, three's
  own `addons/postprocessing/*`, pmndrs `postprocessing`, `n8ao`,
  `realism-effects` are all **WebGL-only with no WebGPURenderer path**. On
  WebGPURenderer post is a **TSL node graph** (`PostProcessing`/`RenderPipeline`) —
  the only system that runs on both backends from one source. → M8's decision to
  hand-write the post chain in TSL is vindicated.
- **three ships ready-made TSL display nodes** (`three/addons/tsl/display/*`, MIT,
  no extra dep): `BloomNode`, `GTAONode` (SSAO), `FXAANode`, `DenoiseNode`,
  `DepthOfFieldNode`, `ChromaticAberrationNode`, tone-map/colour-grade. These could
  replace chunks of our custom M8 chain later; **godrays** we'd still author as a
  custom TSL node (no first-class volumetric-light node exists).
- **Adopt candidates (all ✅ static-OK, backend-agnostic, no headers):**
  - **three-mesh-bvh** (MIT, v0.9.x) — CPU BVH for track raycasts, off-track
    detection, wall-proximity, terrain-gap probes. Renderer-agnostic.
  - **BatchedMesh** (three core) — multi-draw batching for chunked track meshes;
    r184 fixed its per-frame allocation churn.
  - **InstancedMesh2** (`@three.ez/instanced-mesh`, MIT) — per-instance frustum
    cull + BVH raycast + LOD for trees/lamps/barriers/crowd (vendor its `bvh.js`).
- **Loaders (all ✅ static-OK — WASM + normal Workers, no SharedArrayBuffer):**
  meshopt (easiest) → DRACO (or `mrdoob/draco.js` pure-JS) → KTX2/Basis (biggest
  VRAM win, most moving parts). Assets built offline; no runtime build step.
- **Particles/FX:** `three.quarks` (MIT, mature on WebGL, experimental node path on
  WebGPU); a TSL GPGPU compute-particle system is the native 2026 route for
  smoke/spray at scale; Makio `MeshLine` (TSL, both backends) for skid trails.
- **TSL gotchas to keep planning around:** slow initial pipeline compile
  (`compileAsync` non-blocking in r184), node features land on WebGPU first (test
  both backends per effect), legacy GLSL `ShaderMaterial` needs full TSL rewrite.

**Action:** three-mesh-bvh + BatchedMesh + InstancedMesh2 are the highest-value
no-regret adoptions when TLX matures (M9/M10 era). Evaluate swapping parts of the
M8 chain onto stock TSL display nodes to cut maintenance.

---

## 3. Performance / workers / WASM / profiling

**Verdict: the big header-free wins are SIMD-Rapier, a physics Web Worker, and
adaptive resolution. Do NOT chase SharedArrayBuffer.**

- ✅ **WASM SIMD (single-thread)** — `rapier3d-simd-compat`, no headers (see §1).
- ✅ **`wasm-feature-detect`** (MIT, tiny) — runtime pick SIMD build vs fallback so
  old devices still boot.
- ✅ **Physics/AI in a Web Worker** with a fixed-timestep accumulator + main-thread
  interpolation, communicating via **ping-ponged transferable `ArrayBuffer`s**
  (zero-copy, the header-free substitute for SAB) + **object/typed-array pooling**
  (directly targets the night-track GC jitter).
- ✅ **Dynamic resolution scaling** wired into our existing perf governor
  (frame-time-proportional drawing-buffer scale) — biggest free smoothness lever,
  especially on HiDPI.
- ✅ **Profiling stack, all static-OK:** stats-gl + `EXT_disjoint_timer_query_webgl2`
  on the GLX/WebGL2 path; three.js **Inspector** + WebGPU **timestamp-query** on
  the TLX/WebGPU path (note: stats-gl dropped WebGPU support at r181); Spector.js
  (incl. its MCP server) for WebGL2 frame captures; Chrome tracing + our existing
  CDP `.cpuprofile`; Chrome heap snapshots for the day↔night rebuild leak audit.
- ⚠️ **OffscreenCanvas render-in-worker** — works (Safari 17+), but input still
  arrives on the main thread → an input→render hop that hurts steering feel. Keep
  render+input on main; only physics/AI in the worker.
- ⚠️ **Comlink** — nice but ESM; for one physics worker, hand-rolling ~30 lines of
  `postMessage` beats adopting a module system-wide.
- ❌ **SharedArrayBuffer / WASM threads / coi-serviceworker** — only unlocks the
  threads increment, at the cost of a first-load reload, cross-origin-resource
  fragility, and conflict with our PWA SW. Skip unless we move to a host that sets
  headers (Cloudflare Pages `_headers`, Netlify).
- ❌ **`requestVideoFrameCallback`** as a loop driver — wrong tool; `rAF` + fixed
  accumulator stays correct.
- ✅ **PWA/SW asset strategy:** cache-first immutable for `?v=N` assets + the
  vendored `.wasm`; **per-asset version keys** (own key for the big `.wasm`) so a
  renderer update doesn't force re-download of everything.

---

## 4. Game systems (ECS, tween, input, audio, netcode, AI)

**Verdict: most libraries are a net negative for this mature hand-rolled codebase.
Narrow real wins only.**

- **GSAP** ✅ — **free incl. commercial since April 2025**, UMD global, one
  `<script>`. The one best-in-class animation engine that fits no-build with zero
  ceremony — menu/HUD/results/camera-move juice, NOT physics. Real adopt.
- **Offline racing-line bake** ✅ — no JS racing-line lib exists; run a Python
  minimum-curvature optimizer offline against our splines, ship the line as
  per-track *data* in `js/circuits/`. AI lines + player overlay become data, not a
  dependency. Best ROI, stays static.
- **Native platform APIs (zero dep):** Gamepad `vibrationActuator` rumble on
  kerbs/collisions/lockups; `PannerNode`/`AudioListener` for positional rival
  audio; an **AudioWorklet** refactor of our synth (reference:
  Antonio-R1/engine-sound-generator). Prefer these over any library.
- **Yuka** ⚠️ (MIT, ESM) — steering behaviors; only interesting for emergent
  overtaking/defending layered on the racing line. Prototype, not core.
- **Multiplayer** (future ghost/live-race), split by hosting reality:
  - ✅ **Async ghost sharing** — a lap is data; share via URL/paste/download. Zero
    infra, do this first.
  - ✅ **Trystero** — serverless WebRTC P2P (small lobbies, third-party matchmaking).
  - ⚠️ **PlayroomKit / PartyKit (Cloudflare)** — managed realtime, client stays on
    Pages, room logic on their edge.
  - ❌ **Colyseus / geckos.io** — authoritative Node server (best for real racing),
    must be hosted off Pages.
  - ❌ **Rollback/lockstep (Telegraph/GGPO)** — needs bit-deterministic sim; wrong
    fit for float-heavy car grids. Use state-sync + interpolation instead.
- **Skip:** ECS libs (bitECS/miniplex/becsy/koota — earn their keep at thousands
  of entities, not 22 cars; fight our `G` ctx façade); Tone.js (5.4 MB, overkill);
  hammer.js (unmaintained, broken Pointer Events); popmotion (stalled);
  Resonance/Omnitone (dormant); howler/smplr (only if we ship sampled audio).

---

## Bottom line — ranked, actionable

1. **`rapier3d-simd-compat`** — free header-free perf win now that debris is
   default-on. Keep `-deterministic-compat` as the boundary if Rapier ever feeds
   gameplay/tests.
2. **Physics/AI Web Worker** + fixed-timestep accumulator + transferable ping-pong
   + object pools — kills main-thread physics cost and GC jitter, no headers.
3. **Adaptive resolution** into the perf governor — biggest free smoothness lever.
4. **three-mesh-bvh + BatchedMesh + InstancedMesh2** — no-regret TLX-era adoptions.
5. **Evaluate stock TSL display nodes** to slim the custom M8 post chain.
6. **GSAP** for UI/camera juice; **offline racing-line bake** to per-track data.
7. **Native APIs** (gamepad rumble, PannerNode, AudioWorklet) over deps.
8. **TreadJS** as a tire-model validation spike.
9. Multiplayer trajectory: async ghost → Trystero → PlayroomKit/PartyKit →
   Colyseus/geckos (off Pages). Skip rollback.
10. **Do NOT:** SharedArrayBuffer/threads/coi-serviceworker, ECS libraries,
    WebGL-only post libs on the WebGPU path, `requestVideoFrameCallback` as loop.

**Golden rule:** prefer platform-native APIs and UMD globals over ESM-only deps;
push anything server-shaped off GitHub Pages onto Cloudflare/Colyseus/PlayroomKit.
