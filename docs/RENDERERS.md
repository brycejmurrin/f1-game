# Apex 26 — three-renderer architecture

How GLX, WGX, and TLX share one draw-API seam. Module contracts and API
signatures live in [ARCHITECTURE.md](ARCHITECTURE.md); WGX gap recipes in
[research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md). This page is the
boot / pipeline / parity map.

## Mental model

```
apex26.gfxBackend (localStorage)
        │
        ▼
   game.js async boot
        │
   ┌────┼──────────────────────────────┐
   │    │                              │
webgl2  three                    webgpu (+ navigator.gpu)
 /fail  │                              │
 /skip  ▼                              ▼
   loadBackendScripts            loadBackendScripts
   DEFERRED.three                DEFERRED.webgpu
        │                              │
        ▼                              ▼
   Gfx.create → TLX.create      Gfx.create → WGX.create
        │                              │
        ├── ok ──► descriptor-copy onto GLX identity ──┐
        └── null ──────────────────────────────────────┤
                                                       ▼
                                              GLX.init(canvas)
                                                       │
                                                       ▼
                                              Assets.init(gfx)
                                                       │
                                                       ▼
                                   shadowBegin → … → present via gfx
```

**One contract, three implementers.** Game code talks to `gfx` (bound to
`GLX` after a successful opt-in descriptor-copy). Backends must match the
seam documented in `js/render/gfx.js`: lifecycle, mesh/texture resources,
shadow/env/begin/draw/present. Feature-detected APIs may be `undefined`
when a backend honestly lacks them — never omit the name (descriptor-copy
would keep GLX’s dead closure).

## Who does what

| Backend | Role | Entry | Shaders |
|---|---|---|---|
| **GLX** | Default always-tagged WebGL2 | `js/render/glx/glx.js` + `glx/{shadow,post,chunked}.js` | GLSL strings in `js/render/shaders/` |
| **WGX** | Opt-in WebGPU, hand-ported WGSL | `js/render/webgpu/wgx.js` | `js/render/webgpu/wgsl-{chunks,post,fx}.js` |
| **TLX** | Opt-in Three `WebGPURenderer` (`forceWebGL` when `tlxForceGL=1`, or on AUTO when `navigator.gpu` is absent / `tlxAutoGL` is set; WebKit (Safari/iOS) takes three WebGL2 on AUTO since 2026-09-03; THREE PATH: WEBGPU pins the lite WebGPU path) | `js/render/three/tlx.js` | TSL factories on `TLXShaders`; vendor `vendor/three-0.185.1/` |

**Shared always-on:** `js/render/gfx.js` (`create` only), `js/render/shared/gltf.js`,
`js/render/shared/assets.js` (MAT `TEXTURE_2D_ARRAY`). Deferred lists live in
`tools/manifest.cjs` `DEFERRED`, mirrored into `js/roster.js` by `tools/gen/gen-shell.mjs`; no `<script>` tags for
WGX/TLX.

## Frame pipeline (all three)

1. `shadowBegin` → cast* → `shadowEnd` (optional car/lamp on desktop)
2. Optional env-probe faces
3. `begin(frame)` → `drawSky` → lit/chunked/instanced/FX draws
4. `present(opts)` — SSAO → godrays → bloom → composite (ACES) → FXAA

GLX owns the reference pass order in `GLXPost` / `GLXShadow`. WGX mirrors
formats and mobile cost caps. TLX uses a draw-list of pooled Three meshes +
TSL post chain; stamps `renderOrder` for FX/glass.

## Boot / safety

| Key | Role |
|---|---|
| `apex26.gfxBackend` | Pick: `webgl2` / `three` / `webgpu` (picked in `js/perf/renderer-picker.js`) |
| `apex26.gfxBackendProbe` | Canary armed around claim / first world `present()` |
| `apex26.gfxClaimFail` (session) | Skip opt-in after canvas claim-and-die |
| `apex26.gfxBound` (session) | Live fallback label while the pick stays |
| `apex26.gfxWgxLevel` / `gfxWgxLite` / `gfxWgxOk` / `gfxWgxFail` | WGX quality ladder / refuse reason |
| `apex26.gfxTlxFail`, `apex26.tlxForceGL` | TLX fail / THREE PATH (`1`=WebGL2, `0`=WebGPU, unset=AUTO) |
| `apex26.wgxCapture` | SCREENSHOTS: `1`=2D blit, `0`=native swapchain, unset=AUTO (session overrides local) |
| `apex26.tlxForceBatches`, `apex26.tlxForceHw` | DEBUG: run the code a real GPU runs, on a software adapter. `tlxForceHw` is a comma list — `sky\|env\|chunked\|batches\|shadow`, or `1`/`all`. Every software skip in TLX is a BUDGET guard, so an unforced CI run never executes the player's path; `env` is how the black-frame Dawn defect was found. Presentation stays soft. Set them with `gfx-probe --ls key=value` |

Canary + session claim-fail recover from claim-and-die / jetsam by falling
back to WebGL2 without always wiping the user’s pick. WGX climbs
`gfxWgxLevel` (full → lite → minimal → session skip). Phones are not
hard-refused; tiers read `GLX.isMobile` / `mobileTier` for caps.

## WebKit silent draw drops (iOS 26, three-WebGPU / WGX) — what "no errors" meant

The phone that rendered only the sky on three-WebGPU reported `gpuErrors 0`
because iOS 26.0–26.5 never fires `device.onuncapturederror = fn` (WebKit
689ebe5, 2026-04-26, bug 291775); three r185 and both our backends used the
property. Both now register `addEventListener("uncapturederror")` first.
With the ear open, the WebKit-source ranking of what drops draws without a
word (full list and commits: `docs/research/WEBGPU-PARITY.md` §5a rule 4):

| # | mechanism | discriminator | A/B on the phone |
|---|---|---|---|
| 1 | Metal PSO compiled lazily at first draw with `error:nil`; on failure the draw is issued with no pipeline. OOM error "…too complex, please reduce its size" (only since Oct 2025) | sky (small program) survives, every lit draw vanishes; `gpuFirst` now shows the message | THREE PATH: WEBGPU + COPY DIAG after one lap; if it names "too complex", the lit program is the size problem |
| 3 | indexed draw skipped when any declared vertex buffer is one element short; OOB index poisons the index buffer for good | per-mesh, not per-material | `tlxForceBatches` / chunk on-off |
| 4 | one validation failure kills the encoder for the rest of the pass | everything after the first bad draw missing, sky first so it survives | `tlxNoMrt` |
| 5 | mat3 packing miscompile (three `normalMatrix` in the object struct) fixed upstream mid-2026 | materials using normals only | a `colorNode`-only material draws, a lit one does not |

**Resolved the same day.** With the listener live the phone reported
`err 1 · setPipeline: invalid RenderPipeline`, and the metrics `log` tab
carried three's own line for every lit variant: `Render pipeline creation
failed (renderPipeline_MeshBasicNodeMaterial_41): The combined byte size of
all variables in the private address space exceeds 8192 bytes`. WebKit caps
module-scope `var<private>` storage at 8 KB; three r185 emits every node
variable that way and the lit fragment had 1,597 (the sky's 174 fit). Fix:
layouted noise helpers in `tsl-chunks.js` (compile once, not inlined ~50×)
plus vendor PATCHES.md §4 (node variables declared inside `main()`). None
of the ranked mechanisms above was it; they stay as the bisect list for the
NEXT silent drop. AUTO on WebKit stays on three's WebGL2 backend until the
WebGPU path has a lap of phone evidence (`docs/research/WEBGPU-PARITY.md`
§5a rule 5).

## Screenshots — why WebGPU can look black

Play with this in **SETTINGS ▸ DISPLAY**. The controls are injected next to
RENDERER so the body-node ratchet stays put.

| Control | What it does |
|---|---|
| **RENDERER** | `WEBGL2` (default) / `THREE.JS` / `WEBGPU`. Reloads. |
| **THREE PATH** | three.js GPU: `AUTO` / `WEBGL2` / `WEBGPU` (`apex26.tlxForceGL`). Reloads only if RENDERER is THREE.JS. |
| **SCREENSHOTS** | WebGPU present: `AUTO` / `2D BLIT` / `NATIVE` (`apex26.wgxCapture`). Reloads only if RENDERER is WEBGPU. |
| **SAVE SCREENSHOT** | Waits for `awaitSoftPresent`, then downloads `#game` as a PNG. |
| **COPY DIAG** | `__apex.diag({download:false})` as JSON on the clipboard (clipboard API, hidden-textarea fallback) — `env.backendState` carries api, `gpuErrors`, the first GPU/WGSL error, the soft-present counters, pack state and the debug switches. Paste it into a bug report instead of a clipped panel screenshot. |
| Status line | Plain-language: which path is live, and whether screenshots will work. |

**The rule in one sentence.** On a software GPU (SwiftShader / Lavapipe) the
native WebGPU swapchain never composites — a screenshot of that canvas is
black — and calling `getCurrentTexture()` once breaks `mapAsync` for the
whole device.

| Backend | Visible `#game` on software | Screenshot API |
|---|---|---|
| **WEBGL2** | Native canvas. Screenshots just work. | `canvas.toDataURL` |
| **WEBGPU** | Soft-present: final pass → `COPY_SRC` texture → ephemeral readback → `putImageData` on `#game`. Forced by SCREENSHOTS: 2D BLIT or a software adapter. SCREENSHOTS: NATIVE leaves the swapchain black. | `GLX.awaitSoftPresent()` then `#game`; optional `GLX.capturePixels()` |
| **THREE.JS** | AUTO can be **WebGPU or three WebGL2**. SETTINGS shows `AUTO (WEBGPU)` / `AUTO (WEBGL2)` from the live backend. It tries WebGPU wherever `navigator.gpu` exists (phones/Safari: lite stack, same as WGX_LITE; since 2026-09-02 a phone that picks THREE.JS BINDS it despite the §2m memory risk — `apex26.tlxMobile=0` declines back to GLX, and the boot canary reverts a load that never presented). It lands on three WebGL2 when GPU is missing, `apex26.tlxAutoGL=1` after this tab lost WebGPU, `init()` threw before `#game` was claimed, **or the browser is WebKit (Safari, every iOS browser) — since 2026-09-03: two deploys drew three-WebGPU wrongly on an iPhone with zero reported errors (bodywork missing, then sky-only at `c6d8fd3`); THREE PATH: WEBGPU still pins it for the investigation, with `apex26.tlxArrayNearest=1` / `apex26.tlxNoMrt=1` as the on-device A/B switches and SETTINGS ▸ COPY DIAG as the report** — still TLX, not game WEBGL2 (`gfxClaimFail` is what binds GLX). Software WebGPU 2D-blits the LDR target. `mappedAtCreation` uploads go through `queue.writeBuffer`. THREE PATH: WEBGL2 / WEBGPU pins one path. | Same façade: `GLX.capturePixels()` / `awaitSoftPresent()` — WebGL2 `readPixels`; WebGPU LDR readback |

Probes: `node tools/gfx-probe.mjs --backend webgpu|three <track>`.

## Parity snapshot

- **GLX:** full reference — MSAA on desktop 4× at GRAPHICS: ULTRA, capped to 2× on
  HIGH and below, 0 if the HDR format cannot; phones always 0, PCSS, car/lamp shadows, TrackGraph instancing, MAT arrays.
  SAA snapshots N after peel and before wall/MAT bump so brick/concrete
  match WGX (a post-bump `dFdx(N)` dulled every seam).
- **WGX:** near-GLX on desktop; lite/WebKit matches GLX phone cost (env probe off on LITE since 2026-09-03 — a cube cycle is six world passes + 36 mip passes on the jetsam rung); honest
  remaining gap = TAA scaffold off (`_TAA_ENABLED = false` — jitter without a
  history resolve is sub-pixel shimmer). The road is NOT lifted — WGX uses
  `depthBias`/`depthBiasSlopeScale` only, the same as GLX's polygonOffset;
  an 8 cm Y bump was tried and buried cars and fence feet. Env cube uses a dedicated 4×-aniso
  sampler (binding 14). Car-paint flake / orange-peel interpolate `objPos`.
  SSAO uses the GLX/TLX `K[0..7]` fan and skips taps at strength 0.
  `applyHdrGrade` is gated on `tone1.w`. SSR is consumed in COMPOSITE the
  same present() (not next-frame LIT). SAA hoists object-space peel in
  uniform CF and mixes that variance with geometric N by `carPaint`
  (`dpdx` after a non-uniform matId branch is illegal WGSL). GLX/TLX
  now snapshot the same pre-material N — wall bump stays out of SAA
  on all three backends. Every baked MAT layer is hoisted with
  `textureSample` (aniso 4) so brick/concrete match GLX `texture()`.
  Per-chunk lamps ship natively: the shared `LampChunks` bake
  (`js/render/shared/lamp-chunks.js`) uploads the full baked track set +
  concatenated index table to storage bindings 15/16, one DrawU slot per
  visible chunk, absolute shadow index in `params10.x` (no slot remap);
  `gfx.hasPerChunkLights` is the capability read (GLX + WGX; absent TLX).
  `gfx.updateInstances(batch, matrices, n)` is the second capability of
  that shape, and unlike per-chunk lights it is now on ALL THREE
  (`glx.js:1742`, `wgx.js:5069`, `tlx.js:924` — WGX and TLX ported
  2026-09-02): it hands an existing instanced batch a
  caller-packed transform set, for a batch whose poses are new every
  frame rather than static geometry narrowed by a frustum. Its one
  consumer is `DebrisWorld.draw`, whose four per-body loops reached 98
  draws at desktop caps and cost 17 every frame of every lap from cones
  alone (PERF-FINDINGS 2h). The per-body loop it replaces looks
  identical on screen, so porting it was a perf task, never a
  correctness one. It MUST clear `_cullPlanes`/`_cellKeyN`:
  those snapshots describe the frustum that wrote the resident bytes and
  `cullInstances` skips its re-upload on a hit.
  Names that used
  to be absent (`gpuTimer`, texture arrays, lamp shadows, instancing,
  particles, …) are real functions on the backend object; they stay listed
  so descriptor-copy overwrites GLX’s dead closures (`backend-surface-parity`
  guard).
- **TLX:** TrackGraph instancing via `THREE.InstancedMesh`; PCSS blocker map
  on WebGPU (`textureLoad` depth) and desktop WebGL2 (R16F `TSL.depth` color);
  phones / software GL keep fixed `R = 3.0`. Software sky fallback is a
  zenith→horizon mix, not a flat lid. FS `mat` stays a smooth attribute
  (`varying()+FLAT` blanked the garage car on three r185). FLAG wave
  stays per-vertex. Probe-less frames (garage) paint the canvas, not
  the HDR scene target. MSAA still off + FXAA (three does not
  expose a resolved depth for the post chain); 8-bit post
  stays on when half-float is missing (GLX RGBA8 path), env cube 4× aniso.
  THREE PATH: WEBGPU must not call `getContext("webgl2")` on `#game` after
  `renderer.init()` — three lazy-configures the swapchain on first present,
  and a canvas is bound to one context type for life (that sniff was the
  `configure` null throw on SwiftShader). Instanced props use a geometry
  `InstancedBufferAttribute` named `color`, not `imesh.instanceColor`.
  **The texture ACCESS MODE is compiled in from the texture bound at
  program-build time** (2026-09-03): three's WGSL builder emits
  `textureLoad` + a baked wrap for a Nearest/Nearest texture, and the lit
  graph is built against the 1×1 placeholder material arrays — so the
  placeholders carry the pack's Repeat / LinearMipmapLinear / aniso 4 state
  (guard-asserted), or every baked fragment reads an edge texel on WebGPU
  (the phone "unlit / see-through track"). The WebGL backend emits
  `texture()` regardless. A WebGPU device that rejects work in the first 120
  presents on AUTO self-heals to three WebGL2 next boot (`tlxAutoGL`), and
  `backendState()` (now on all three backends, via the GOV panel `gfx` row
  and `__apex.diag().env`) reports `api`, `gpuErrors` and the first GPU or
  WGSL-compile error. Phones are never classified as software adapters.
  Software adapters stay on WebGPU (soft-present + writeBuffer shim); they
  must not silently bind GLX. AUTO may then take three WebGL2 (`tlxAutoGL`)
  without writing `gfxClaimFail`. Phones and Safari AUTO try the same
  WebGPU path with a lite swapchain (`UnsignedByteType`, no MSAA 4,
  low-power).

## Cross-backend parity — mirroring a knob across GLX / WGX / TLX

(Folded from the `cross-backend-parity` skill, 2026-09.) Use this when a
look / knob / feature already differs between the three backends, or when
auditing drift after a lighting or rendering change. Night-looks-wrong is a
`lighting-tuner` question first; a WGX validation defect is `webgpu-debug`.

**The rule: a GLX fix is not done until it is mirrored in WGX and TLX — or
recorded as a gap** in §Parity snapshot above and in the defect inventory
[research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md).

1. `node --test tests/unit/backend-surface-parity.test.mjs` first — the
   façade must carry the same member names on all three backends (a missing
   name leaves GLX's dead closure behind after descriptor-copy; see §Mental
   model).
2. Grep the knob across ALL of `js/render/`: GLSL in `shaders/`, WGSL in
   `webgpu/wgsl-*.js`, TSL factories in `three/`, and the CPU plumbing that
   feeds the uniforms — a knob that reaches one shader family and not the
   others is the usual drift.
3. WGX: `node tools/wgx-validate.mjs --static` (real Dawn WGSL validation,
   ~5 s). A live-device Dawn run is parent-session only → `webgpu-debug`.
4. Same-scene shots per backend: `node tools/capture/backend-compare.mjs
   <track> …` (one deterministic framing, N backends, numeric pixel diff —
   MAD and %px changed — plus per-backend console errors), or
   `tools/gfx-probe.mjs --backend webgpu|three <track>` (`playwright-probe`
   skill). `__apex.diag({download:false}).env.backend` is what actually
   bound — a fallback to GLX is silent, so never trust the pick alone.

## Boot evidence — a unit test of a backend is not evidence that it runs

WGX's mock device passed every assertion while FOUR separate defects made the
real backend refuse to boot. Each hid the one after it, so they came out one
boot at a time, and none was findable without a live device:

| defect | why a mock cannot see it |
|---|---|
| MSAA `sampleCount: 2` | WebGPU allows 1 or 4 only; the mock accepted any integer |
| a derivative (`dpdx`) behind a non-uniform branch | a WGSL compile error, invisible without a real shader compiler |
| `mappedAtCreation` for a 35 MB mesh | exhausts the mappable pool on a real device; the mock never ran out |
| `rg11b10ufloat` as a render target | needs the optional feature; the mock did not model features |

Breaking any of these does not throw: WGX refuses and the game falls back to
GLX with one console warning, so a green suite plus a silent fallback looks
like success.

**The recipe.** Serve from a secure context — `navigator.gpu` is absent on
`about:blank`:

```sh
npx serve -l 3456 .
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --console 'WGX|error'
```

`probe` writes the backend pick and RELOADS in one batch (`--backend
webgl2|three|webgpu`; `three` gets the specs' WebGL2 pin), `--eval` runs a
body, `--console RE` greps the dump, `--dry-run` shows the batch. In page code
use BARE globals — `GLX`, not `window.GLX`: script-level `const` is a lexical
binding, not a window property.

**Assert a POSITIVE signal.** A clean WGX boot writes NO console line and
leaves `sessionStorage["apex26.gfxBound"]` absent (that key means it refused)
— both are ABSENCE signals, and an absence test that reports the same value as
a success test is not a test. Drive a race and assert
`canvas.getContext("webgl2") === null`, which only holds once WebGPU has
claimed the canvas. SwiftShader is a validation oracle; for WGX **visible**
pixels use `tools/gfx-probe.mjs` (`#game` after `awaitSoftPresent`); for the
readback oracle use `tools/wgx-capture.mjs` → `frame.png`. Full trap list:
`.claude/skills/mcp-probe/references/recipes.md` §Probing a specific renderer.
WGSL validation without a browser: `node tools/wgx-validate.mjs` (real Dawn,
~5 s) — never ship "read-verified" WGSL. The live run compiles every module
at WebKit's ERROR-severity uniformity default (Dawn only warns), so a pass
here is evidence about an iPhone too; `--lax-uniformity` opts out to bisect.

## Related

- Module contract + GLX API sketch: [ARCHITECTURE.md](ARCHITECTURE.md)
  (section *js/render/glx/glx.js … — renderers*)
- WGX recipes and inventory: [research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md)
- Clipping / depth: [RENDER-CLIPPING.md](RENDER-CLIPPING.md)
- Lighting uniforms: [LIGHTING-REF.md](LIGHTING-REF.md)
