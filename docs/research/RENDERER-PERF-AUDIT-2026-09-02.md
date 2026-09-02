# Renderer performance audit — 2026-09-02

Three read-only subagent audits (no edits, no browser runs) over the three
backends, ranked by expected frame-time win. Landed items are marked; the rest
are the backlog, with the proposed patch kept so the next round does not re-read
the code. Evidence for landed items lives in `docs/RENDERERS.md`,
`docs/research/PERF-FINDINGS.md` and `docs/research/WEBGPU-PARITY.md`.

Method notes shared by all three: nothing re-reports the items already landed
before this date (uInstanced bracket, uNumLights/uModel caches, interleaved lamp
array, GLX cell-set cache, chunk run-merge, GLX debris instancing, the
zero-gates, the 2026-09-01 WGX batch: soft-blit hardening, row-copy blit, decal
pooling, `trkFromWorldIf`; the TLX mesh-pool key and attribute pack). Cost
estimates are per frame unless stated.

## WGX (native WebGPU, `js/render/webgpu/`)

| # | Finding | Status | Metal | Windows |
|---|---|---|---|---|
| 1 | Prop-batch `cullInstances` re-packs + re-uploads every frame the camera moves (no cell-set key; shadow frames double it) | **LANDED 2026-09-02** (cell-set key ported from GLX) | 0.3–1 ms CPU on dense circuits | same or more |
| 2 | Two anisotropic MAT-array fetches per lit fragment whose result is discarded (floor, cars, ident mats) | PLAUSIBLE | 0.1–0.3 ms at 1440p | 0.3–0.5 ms on iGPU |
| 3 | DebrisWorld per-body draws — `updateInstances` unported | **LANDED 2026-09-02** | 0.05–0.1 ms steady, ~1 ms in a pileup | ~2× |
| 4 | Instanced prop batches carry all-ones lamp masks → 48-lamp loop per fragment at night | PLAUSIBLE | 0.1–0.3 ms night city | more on iGPU |
| 5 | Night road merge refusal | CONFIRMED, small | 0.05–0.15 ms | ~2× |
| 6 | ~19 per-present `writeBuffer` calls, ~10 frame-invariant (bloom UBOs, FXAA) | CONFIRMED, small | 0.03–0.05 ms | similar |
| 7 | Dynamic-offset rings padded to 256 B; Metal adapters allow 32 | CONFIRMED, bytes only | <0.05 ms | 0 |
| 8 | 64 KB `trackLightSBO` re-upload under flicker | CONFIRMED, small | <0.05 ms | <0.05 ms |
| 9 | Soft-present: per-frame multi-MB `MAP_READ` alloc + a redundant W×H alpha pass | CONFIRMED (software adapters only) | 0 | 0 |

**1 — `cullInstances` (wgx.js ~4848).** Only memo was exact plane equality,
which never holds while driving, so the 20-float copy loop and
`queue.writeBuffer(instBuf, n×80 B)` ran for every visible instance of every
batch every frame; shadow frames packed twice (`game.js:5894` passes
`{upload:false}`, which GLX/WGX ignore). GLX measured the same shape at
427–948 KiB/frame before its cell-set key (PERF-FINDINGS 2c). Landed: the
GLX block ported (`_cellKeyScratch`/`_cellKey`/`_cellKeyN`), `_cellKeyN = -1`
in `castShadowInstanced`'s full-set restore and in `updateInstances`.

**2 — MAT-array fetches (wgsl-chunks.js ~804-810).** `midClamp` maps car
surfaces 20–31 to layer 16; `textureSample(matAlbedoTex…)` and
`textureSample(matNormalTex…)` run unconditionally (uniform-CF rule), then
`applyMaterial` / `applyMaterialNormal` / `isIdentMat` discard the result for
the floor plane, every car fragment and mats 0/3/15. Proposed patch keeps the
derivatives at `fs_main` top level and uses `textureSampleGrad` with a huge
gradient for discarded fragments (one 1×1-mip tap):

```wgsl
let midClamp = select(clamp(i32(vMatId + 0.5), 0, 16), 0, vMatId > 16.5);
let isIdentMat = midClamp == 0 || midClamp == 3 || midClamp == 15;
let uvSel = matUvLit(midClamp, topNgeo, in.wpos);
let gX = select(dpdx(uvSel), vec2<f32>(64.0), isIdentMat);
let gY = select(dpdy(uvSel), vec2<f32>(64.0), isIdentMat);
let sampAlbedo = textureSampleGrad(matAlbedoTex, matSamp, uvSel, midClamp, gX, gY);
let sampNormal = textureSampleGrad(matNormalTex, matSamp, uvSel, midClamp, gX, gY);
```
Risk: pixel parity of the real-material path (aniso under SampleGrad) — check
on the macOS census before shipping.

**3 — DebrisWorld `updateInstances` (wgx.js exports).** Was `undefined`, so
`debrisworld.js:1137` fell to the per-body loop: 17 draws steady, 98 at desktop
caps, each a DrawU slot + bind + drawIndexed. Landed: stride-16 → stride-20
copy into `_instPacked` (colour lanes stay 1,1,1), both cull snapshots cleared.

**4 — Lamp masks on instanced draws (wgx.js `_writeDraw` ~3341, `drawInstanced`).**
Non-chunked draws get `LAMP_MASK_ALL`, so at night every instanced prop
fragment and the floor loop all ranked lamps (≤48 × 4 storage loads + dot)
where chunked geometry pays ~3 ALU per culled lamp. Patch: accumulate the
visible cells' union AABB in `cullInstances` (`batch._visMn/_visMx`), and in
`drawInstanced` when `frameNL > 8` call `_chunkLampMask(...)` (cache on
`_lmGen`) and write `_lm0/_lm1` into lanes 28/29. Bit-exact with the shader's
reject. The floor has no AABB and stays.

**5 — Night road merge refusal (wgx.js ~3657, `nightOK = indexed || !maskL`).**
≤30 extra draws per frame at `frameNL > 8`. Free-by-construction merge when the
chunk's mask equals the run's: `nightOK = indexed || !maskL || (run.active &&
run.m0 === _lm0 && run.m1 === _lm1)`. Run a chunk-share census before spending
more.

**6 — Post-chain uniform writes.** SSR 208 B, SSAO 176 B, godray 288 B, bloom
up to 9×16 B into separate UBOs, composite 256 B, FXAA 16 B, up to 6 blur-ring
writes. Bloom level UBOs `(1/w, 1/h, threshold|spread, 0)` and FXAA `1/tw,1/th`
are constant between resizes and knob edits: write them in `ensureTargets` and
re-write only when threshold/spread change (~10 calls/frame saved).

**7 — Dynamic-offset strides.** `DRAW_STRIDE`/`SHADOW_MODEL_STRIDE`/`FX_STRIDE`
256 B with 144/64/144 used; `requestDevice` passes no `requiredLimits`, so the
device gets the spec default 256 where the adapter reports 32 (Apple silicon).
~320 draws → 80 KB DrawU for 45 KB payload. Patch: request
`minUniformBufferOffsetAlignment` from the adapter and derive strides as
`align(used, limit)`; keep the lifecycle "stride is a multiple of the limit"
invariant against the requested limit.

**8 — `trackLightSBO` re-upload every night frame** (wgx.js ~3175-3203, driven
by lighting.js `_allLightsGen++` under LAMP FLICKER 0.10). 38–51 KB on
Vegas/Singapore; correctly deferred. If wanted: split rgb into a second
read-only storage binding (16 KB max), upload only it on a gen bump.

**9 — Soft-present path (software adapters only).** Fresh `MAP_READ` buffer of
`bpr×h` per frame (3.7 MB at 720p), `copyTextureToBuffer`, `mapAsync`, row
copies, a redundant W×H alpha pass (every producer already writes alpha 1.0),
`putImageData`, `destroy`. Patch: delete the alpha pass; keep a two-deep ring of
persistent `MAP_READ` buffers keyed on `(bpr,h)` (never destroy one in flight).
Real-GPU relevance none; it is the CPU half of every `gfx-probe` frame in CI.

Checked and clean: bind-group/pipeline creation is init/resize/first-use only;
one `queue.submit` per frame; rings flushed once; per-frame allocations pooled
(only `_sunScreen()`'s return remains); WGSL derivative and sampleCount rules
hold; shadow passes cull against the light, not the camera.

## GLX (WebGL2, `js/render/glx*.js`, `js/render/shaders/`)

Node-VM measurements: vegas = 35 instanced batches / 78,951 instances (5.05 MB
full pack), 914 prop chunks; monza 38 / 11,385; spa 33 / 6,017; singapore
50 / 31,841.

1. **LANDED 2026-09-02 — `gl.getError()` once per `present()`** — glx.js:2028 wraps
   `PST.present(opts)` with `drainGlErrors("present")`. In Chromium `getError`
   is a synchronous command-buffer flush + blocking IPC (the same stall the
   file documents for `getParameter` at :1098-1105), so the JS thread cannot
   start the next frame until the GPU process has decoded this one. 0.3–1 ms
   on a laptop, more on Android. It exists for the real-GPU gate (PERF-FINDINGS
   §2e). Patch: `if (_glDrain) drainGlErrors("present")`, `_glDrain` true only
   under `apex26.glErrDrain=1` (set by `tools/gpu-game-check.mjs`) or for the
   first ~120 presents; `gpuErrors()` forces one drain on read. CONFIRMED call,
   PLAUSIBLE magnitude.
2. **Dry-road SSR march for a 0.35×-damped sheen** — lighting.js:155-156
   `ssrDryNight 0.08` / `ssrDryDay 0.07` keep `uReflect > 0.001`, so
   post.js:779-780 opens the 24-step march + 4-step refine + 3 `ssrViewPos`
   + 7 scene taps for every road pixel (62–82 % of the frame), then damps by
   `min(gateSrc/0.20,1)` and `cover 0.60`. Patch: `steps = uReflect < 0.20 &&
   !carDom ? 8 : 24` and skip refine/grazing below 0.20; or carry the dry sheen
   on the lit shader's `envBlend` and enter the march only when `uReflect >=
   0.10 || carPx > 0.3`. PLAUSIBLE.
3. **One resident instance pack serves three frusta** — glx.js:1587-1664; the
   env probe (every 4th frame, a face frustum) and the shadow passes repack the
   same buffer the camera pack uses, so the cell key flips probe→camera and
   both miss. ~7,600 instances × 16 floats copied + ~0.5 MB upload per probe
   frame on vegas at tier 0 (desktop only; the probe is off on phones). Patch:
   a second `ibo`/`cbo` + VAO (`packAux`) selected by a `slot` arg for the
   probe/shadow callers, and cull the probe against a 300 m sphere so all six
   faces share one aux pack. CONFIRMED mechanism, PLAUSIBLE win.
4. **God-ray pass: 3-octave cloud FBM vs the lit shader's 2, and a double
   H+V blur** — post.js:316 `gCloudFBM` 3 octaves × 16 steps per half-res
   pixel; glx/post.js:641-650 blurs twice. Patch: 2 octaves (matches lit;
   blurred anyway), one wider 9-tap blur pair, `N = 8` on `MOBILE_TIER`.
5. **Phone MEDIUM keeps SSAO + god-ray + bloom + FXAA live** by design
   (gfx-quality.js:15-20, perf.js:401-417). Patch as a COST CAP, not a shed:
   SSAO 4 taps, god-ray N=8 + single blur, bloom levels 5 → 3 on mobile, plain
   bilinear AO fetch when `msaaSamples == 0`. 1–2 ms on a mid-range phone.
6. **Mobile scene target is RGBA16F with no alpha consumer** — glx/post.js:
   284-296; on a phone at MEDIUM/LOW `po.carReflect = 0`, `po.reflect = 0`
   (game.js:7586) and `_hazeStr = 0` (game.js:7285), so 8 B/px is written and
   read back for 4 B/px of information. Patch: `R11F_G11F_B10F` when
   `MOBILE_TIER && PerfGov.userTier() >= 2`, with `createTargets()` re-run on a
   preset change. ~25–30 % of scene-pass bandwidth on the phone.
7. **Asphalt baked-normal aniso fetch for a 0.10-weighted result** —
   lit.js:308-329 samples `uMatNormalTex` (aniso 4) on every road pixel at
   grazing angles. Patch: `if (mid == 16) return;` in `applyMaterialTexNormal`
   (≤0.1-strength relief lost; confirm with `backend-compare.mjs`), or a
   second non-anisotropic sampler object on unit 11 for zero look change.
8. **Restore-inside-call state brackets defeat the state cache** —
   glx.js:1746-1759 (`draw`), :1707-1714 (`drawInstanced`), :939-972
   (`drawDecal`) toggle cull / alpha-write / polygon-offset / depth-mask on
   and back off per call; the 22-decal flush and the 4-draw wheel runs alone
   are ~200 redundant GL calls per frame (§2i's 55.7 CULL_FACE toggles are
   the restores). Patch: cache `setCull`/`setAlphaWrite`/`setPolyOffset` like
   `setBlend`, delete the trailing restores, make every draw path DECLARE its
   state (`drawChunked` then needs `setCull(true)`, `setAlphaWrite(true)`,
   `setPolyOffset(null)`); set `decalU.uTex` once at link. CONFIRMED.
9. **LANDED 2026-09-02 — per-chunk lamp sets re-uploaded for non-contiguous identical lists** —
   glx/chunked.js:254-261 `flush()` re-uploads `uniform4fv` (≤1.5 KB) for
   ~40 runs/frame whose list the program already holds (§2c's own pair
   counts). Patch: `lastLi` beside `lastSlot`, skip when `_sameList`.
10. **LANDED 2026-09-02 (the three integer powers; :1456 left) — three always-on `pow()` per lit fragment** — lit.js:1522 `pow(sunAmt,
    4.0)`, :1524 `pow(sunAmt, 16.0)`, :1543 `pow(…, 3.0)`, :1456
    `pow(N.y*0.5+0.5, 0.35)`. Patch: `s2 = sunAmt*sunAmt, s4 = s2*s2, s16 =
    s4*s4*s4*s4` (exact); leave :1456 (not bit-identical otherwise).
11. **Residual per-frame allocations** — glx.js:516 `getSize` object,
    game.js:6507-6509 lookAt literal, game.js:5894 `{upload:false}` per batch,
    carmesh.js:524/:367 `for (const s of [-1, 1])`, glx/chunked.js:254 `flush`
    closure, glx.js:1146-1149 fallback literals. Individually unmeasurable.
12. **Constant sampler-unit and slow-changing mat4 uniforms re-uploaded every
    `begin()`** — glx.js:922, 930, 933, 1263, 1267, 1311-1312, 1327-1330, 1372.
    Move the integer ones to init after `locs()`; mat4s through `ufM4`.

Checked and clean: no `finish`/`flush`/`readPixels`/`getParameter` in the
frame; skids/particles/glow/debris single batched draws; shadow passes cull
against the light; sky late under early-Z; composite blocks uniform-gated;
`frame.lights` retained; MSAA `min(4, formatMax)` desktop, 2 below ULTRA, 0 on
phones with `invalidateFramebuffer` after the resolve.

## TLX (three.js r185, `js/render/three/`)

Read after c9f4dbea (keyed mesh pool), 9bf25b06 (attribute pack), 83d1b29a
(leak root cause) and 8ccd163c (half-float `mat` ids); none re-reported.

1. **LANDED 2026-09-02 — the keyed mesh pool collapsed every same-(geometry, material) draw in a
   batch onto ONE mesh — CONFIRMED, a correctness regression from c9f4dbea.**
   tlx.js:1229-1257 `acquireMesh`: `byMat.get(mat)` returns the same
   `THREE.Mesh` for every draw of a pair inside one `_poolBatch`; each call
   overwrites `m.matrix`, so only the LAST caller renders. Hit every frame:
   all 22 blob shadows (one survives), both front and both rear wheels of
   every car, brake rings, the two cars of each team (`teamBodyMesh` per team
   + one shared `paint` scratch → ~10 of 20 AI cars vanish), team decals,
   cockpit digits, DebrisWorld cones, the `drawMark` fallback. The "45 % fewer
   render objects / pool 342→198" figure is partly draws silently dropped.
   Patch: key on (geometry, material, occurrence index within the batch) —
   a per-material list with a batch stamp and a counter; wrapper identity
   stays stable per (geo, mat, k) so three's cache stays bounded. Canary: two
   `draw()`s of one mesh with two matrices in one `present()` leave two
   visible wrappers.
2. **`prunePool` leaks three RenderObjects and re-mints them every lap** —
   tlx.js:1210-1227. r185's `RenderObject` registers dispose listeners on the
   material and geometry; the pruned wrapper stays reachable through the
   long-lived material's `_listeners.dispose` with its `_bindings` (uniform
   buffer + bind groups), pipeline ref and dead Mesh — one leaked set per
   pruned wrapper PER render context (main + each env face), re-minted as a
   NEW Mesh when the car laps back. The §2o "remaining lead" (~28 MB/min).
   Patch: drop the clock prune; `meshByGeo` a `WeakMap`; evict on OWNER
   dispose (geometry `dispose` listener, `present()`'s `_matDispose` flush)
   onto a free-list reused for the next key; read `performance.now()` once
   per batch. The canary's prune sabotages need rewriting.
3. **The sky is drawn FIRST, full-screen, depth test off — CONFIRMED; the
   biggest GPU win on a phone.** tlx.js:2048/2061 `scene.backgroundNode`:
   three's `Background.update` unshifts a depth-test-off sphere as opaque
   item 0, so the tsl-sky fragment (4-octave clouds, stars, discs, glow —
   ≈200 ALU + ~40 sin/cos) shades every pixel and the world overdraws
   60–75 % of it. ≈0.8–1.5 ms on a phone at 1.5× DPR, 0.3–0.6 ms on Iris Xe.
   Patch: a pooled 3-vertex NDC triangle with `MeshBasicNodeMaterial{colorNode:
   sky.node, vertexNode: vec4(pos.xy, 0.99999*w, w), depthTest, depthWrite
   false, LessEqualDepth}` at `renderOrder 1e6`; `sky.node` reads `screenUV`.
4. **LANDED 2026-09-02 (update ranges + flat copy; the shadow snap path not yet) — instanced batches uploaded their WHOLE capacity `instanceMatrix`
   (+`instanceTint`) every frame the frustum moved — CONFIRMED.**
   tlx.js:870-884 `_writeInstanceMatrices` sets `needsUpdate` with no update
   range → full `cap×64 B` (+`cap×12 B`) every moving frame (20 k instances ≈
   1.5 MB/frame); the `Matrix4.fromArray → setMatrixAt` round trip doubles
   the CPU copy; tlx-shadow.js:219/228 repeats it per snap. Patch:
   `clearUpdateRanges(); addUpdateRange(0, drawN*16)` (and `drawN*3`), flat
   copy into `instanceMatrix.array`.
5. **Env probe = a full `renderer.render()` per face with its own retained
   RenderObject set** — tlx.js:1767-1870; six extra RenderObject/bind-group
   sets per chunk/car (multiplies #2), and every 4th frame `_projectObject`
   over the scene + sort + bindings for 100–200 objects → a 1.5–4 ms hitch
   (desktop tier < 1 only). Patch: `ENV_CULL_M` 300 → 150, skip props/glass
   in faces on mobile tiers, `renderer.sortObjects = false` around the face.
6. **Per-draw allocations: `materialFor` builds a ~15-part string key per
   draw; `drawList` allocates a record per draw** — tlx.js:779-800,
   :2066/2073/2158. ≈5 k conversions + ~7 k objects/strings per frame.
   Patch: `WeakMap<optsObj, numeric snapshot>` with field compares, rebuild
   the key only on change; pooled draw records.
7. **LANDED 2026-09-02 — DebrisWorld per-body draws on TLX** — tlx.js:1990 `updateInstances:
   undefined`. Patch (~10 lines): `_writeInstanceMatrices(b.imesh, m, null,
   n); b.visible = n; b._cullPlanes = null;` with #4's ranges.
8. **tlx-shadow.js still uses the flat index pools** (:167-181, :191-234) —
   `m.geometry` reassigned per cast → `getAttributes()` re-resolved whenever
   the pairing shifts (the `getAttributes 1.94 MB` profile line). Patch: the
   (geometry, k) keyed pool from #1 for `cast`, keyed on `batch` for
   `castInstanced`.
9. **Shadow maps carry an RGBA8 colour attachment cleared and written every
   pass** — tlx-shadow.js:63-80, `depthMat` :153 writes black with
   `colorWrite` true (:148). Patch (WebGPU backend only): `colorWrite =
   false`, non-PCSS targets `RedFormat/UnsignedByteType` (4× less bandwidth).
10. **Per-frame TSL node allocations** — tlx.js:2279 `setMRT(TSL.mrt(...))`
    per present, tsl-fx.js:52 `setSsrMrt(true)` rebuilds per frame,
    tsl-lit.js:1733 walks `_mats` twice per frame. Build once; early-return.
11. **The `mappedAtCreation → queue.writeBuffer` shim runs on real hardware
    too** — tlx.js:233-262; load-time only (~30–50 MB of transient copies per
    circuit load). Judgement call whether to gate on `_softAdapter`.
12. **Soft-present blit copies each frame twice** — tlx.js:1430-1445
    `_unstrideRgba` + :1467-1500; CI/probe path only. Unstride straight into
    `_softImg.data`.

Checked and dismissed: per-object uniform re-upload for static objects
(r185 computes modelView on the GPU; `UniformsGroup.update` compares before
writing); the env-cube `.value` swap; no per-frame `needsUpdate`/
`matrixAutoUpdate`; transparent sorting is renderOrder-first;
`cullInstances` skips unchanged planes.

---

# Round 2 — same day, four read-only agents plus a web survey

Four more read-only agents (GLX, TLX, WGX, and the CPU side outside the
renderers) re-walked the backlog above and hunted for what it missed, while a
fifth gathered outside knowledge (`docs/research/BROWSER-GRAPHICS-2026.md`).
Rules as before: trace, do not guess; no edits; no browser; CONFIRMED only with
the wrong outcome stated. The parent re-read every landed row's code before
editing.

## The sun-shaft march, found twice independently — LANDED

`js/render/shaders/post.js:1129` and `js/render/webgpu/wgsl-post.js:802` carry
the same composite block, and the GLX and WGX agents found the same defect in it
without seeing each other's work:

```glsl
      shaft /= 8.0;
      float radial = 1.0 - clamp(dist * (2.6 / uShaftSpread), 0.0, 1.0);
      c += shaft * uSunShaft * radial * radial * 0.60;
```

`radial` reaches an **exact** 0.0 at `dist = uShaftSpread / 2.6` and stays
there, and `shaft` has no other consumer — so beyond that radius all eight
dependent `uBloom` taps, eight `length()` and eight `clamp()` were accumulated
and then added as `+0.0`. At the shipped `uShaftSpread` (`sqrt(max(0.05,
_shaftMul))` = 1.0, `glx/post.js:874`) the disc where the result survives covers
at most `π·0.3846²` ≈ 46% of the frame, so **over half of every day frame** paid
the march for nothing — and 100% of any frame where the sun projects off-screen
while `uSunShaft` is still non-zero.

Landed on both backends as an upper bound on the existing `dist > 0.005` gate,
written with the **identical sub-expression** the radial line uses so the two
cannot drift apart. Bit-exact, not an approximation. `uShaftSpread` is
`sqrt(max(0.05, …))` and so is always ≥ 0.2236, which is what makes the divide
safe.

## Also landed

| area | finding | evidence |
|---|---|---|
| GLX shader | `applyMaterial` ran its whole body for Car3D surface ids 20-31: the else-if chain is 1..16 with NO catch-all and `matTexUV` refuses `mid > 16` outright (`lit.js:296`), so a normalize, two clamps and a 14-way integer chain provably could not change albedo or rough on any car pixel | bit-identical; `lit.js:335`'s normal twin deliberately NOT done — see below |
| TLX | the instance **tint** was marked dirty outside the branch that writes it: `col` always exists but `colors` is null on every `updateInstances` call (DebrisWorld) and every batch built without node colours, so an unchanged all-ones buffer was re-uploaded every frame | `tlx.js:909`; fix is net −1 line |
| WGX | `setIndexBuffer` was the one state call outside the `_setPipe`/`_setBG0`/`_setVB0`/`_setVB1` redundancy filter — whose own doctrine comment says every state call MUST route through them. `createChunkedMesh` gives **every chunk of a mesh the same index buffer** (`wgx.js:2843`), so the per-chunk-lamp path and `castShadow`'s chunk loop re-set an identical buffer once per visible chunk | `_setIB` added; `drawDecal`'s raw call routed through it too, since a bare one beside the cache desyncs it |
| game.js | **the title-screen flyby was drawing the previous race's grid.** `quitToMenu` resets `state` but never clears `cars`/`player` (both rebuilt only by `makeCars()`), and the car loop's only guard is a 550 m cull against `player` that every car parked on the grid passes | `state === "menu"` break; `skids.draw` gated for the same reason (`skids.reset()` runs only from `startRace`, so the last race's rubber was still under the flyby) |

The tell that the flyby row was an oversight and not a choice: the car and lamp
**shadow** producers a few hundred lines above it already gate on `state !==
"menu"` in four places, and a FIRST boot renders the same screen with `cars ===
[]` — an asymmetry no design would ask for. The setup/garage preview is
unaffected: `renderSetupPreview()` returns out of `render()` at `game.js:6116`,
well before the loop.

## The sky, settled three ways — NOT landed, and now fully de-risked

Audit item TLX-3 above called this "the biggest GPU win on a phone". It is also
a **parity defect**, and three independent lines of evidence now agree:

1. **The producer's contract.** `js/game.js` draws the world and THEN the sky at
   both call sites, and says why at each ("opaque → sky → glow"; and for the
   64² env-probe face, "the sky still filled every pixel the world then
   overwrote"). GLX honours it (`depthMask false` under a global LEQUAL) and so
   does WGX — whose pipeline comment records the migration explicitly: the depth
   compare "was `always`: correct only for sky-FIRST", and after late sky
   shipped that setting "ALWAYS overwrote the entire lit colour buffer
   (hall-of-mirrors / melted world)". **TLX was never ported.**
2. **The vendored bundle.** `three.webgpu.min.js` builds the background as a
   `BackSide` sphere with `depthTest = false` and ends
   `t.unshift(d, d.geometry, d.material, 0, 0, null, null)` — the head of the
   opaque list — and the renderer calls `sort(...)` **before**
   `_background.update(...)`, so `renderOrder` cannot reach it.
3. **Upstream source.** The same two facts read straight out of
   `mrdoob/three.js` `dev` (`Background.js`, `Renderer.js`).

TLX stamps `renderOrder = submission index` specifically to preserve "caller
order (the GLX contract)" for everything in its draw list — and the sky is the
one thing that bypasses that mechanism, because it never enters the list.

**The patch is feasible with no change to the sky shader.** `tsl-sky.js:168`
already anchors on `screenUV` and unprojects through `U.invViewProj`; a grep for
`texture(`, `cubeTexture(`, `normalWorld`, `positionWorld`,
`modelViewProjection` and `cameraPosition` in that file returns zero hits, so
nothing needs three's background `context({getUV: …})` wrapper. The replacement
is a pooled 3-vertex NDC triangle with `MeshBasicNodeMaterial`, `depthTest true`
/ `depthWrite false` / `LessEqualDepth`, `vertexNode = vec4(positionGeometry.xy,
0.999999, 1.0)`, `renderOrder 1e6` — the same shape GLX and WGX already draw.

Left unlanded deliberately: it needs `begin()`'s `scene.backgroundNode = null`
and `envFaceEnd`'s three background touches converted to `visible` toggles,
`pinSkyMaterial()` retired along with its two canary assertions, a
`renderer.reversedDepthBuffer` guard on the 0.999999, and a rendered A/B. That
is a change with a look consequence if any step is wrong, and it wants a real
GPU — not a SwiftShader frame — to sign off.

## Corrections to the backlog above

The value of a second read is mostly in what it takes AWAY.

- **GLX-8 (state brackets) is over-estimated.** Its "~200 redundant GL calls per
  frame" is contradicted by this repo's own census. A fresh
  `tools/glx-call-census.mjs` run (vegas night, 40 frames) measured
  **32.8 CULL_FACE toggles**, 8.3 `polygonOffset`, 7.5 `depthMask`, 11.3
  `colorMask` — the restores are ≤ ~45 calls, not 200, against 114.2 draws and
  ~540 total GL calls per frame. Rank it accordingly.
- **GLX-7's mechanism is partly wrong.** `applyMaterialTexNormal` already
  early-returns on `fade` and on the footprint `aa` *before* the fetch, so it is
  skipped exactly at the grazing angles the item names. The genuinely unguarded
  aniso tap on the road is the **albedo** one, guarded only by `far` (260 m).
- **GLX-12's line numbers are stale**, and `begin()` runs 1-2× per frame in a
  race, not eight. The census puts `uniform1i` at 72/frame and `uniform1f` at
  121.8/frame — the largest call categories by count — but `docs/PERF-FINDINGS.md`
  §3 already warns not to invent a millisecond claim from uniform elision, and
  that warning stands.
- **WGX-5 (night road merge) is nearly dead work.** `tools/chunk-share-census.mjs`
  already recorded the answer: 3 shared non-empty adjacent pairs out of 909.
  The merge would save about three draws. Rank it last.
- **TLX-2's magnitude was wrong, its mechanism right.** `prunePool` does leak —
  a pruned wrapper is retained through the long-lived material's dispose
  listener — but post-§2p it is ~15 `createRenderObject`/min, negligible per
  frame. It matters **across track and season changes**, where every geometry
  ever drawn stays CPU-resident.

## New, not landed — ranked, with the mechanism kept so nobody re-reads the code

1. **TLX: `DynamicDrawUsage` defeats the update-range fix that landed this
   morning.** three's `Attributes.update` is
   `(r.version<t.version||t.usage===x)&&(this.backend.updateAttribute(e),…)` —
   a dynamic attribute is re-uploaded on **every draw call regardless of
   version** — and `updateAttribute` **clears the ranges after use**, so any
   frame that does not rewrite the pack finds no ranges and uploads the whole
   capacity. `tlx.js:942`, `:893`, `:1168` and `tlx-shadow.js:202` all opt in.
   That is exactly the `cullInstances` `samePack` early-out (a stationary
   camera) and `drawSkidBatch`'s `dirty` check. Switching to `StaticDrawUsage`
   is correct because every writer already sets `needsUpdate`; three's own
   `InstancedMesh` defaults to static.
2. **GLX: `drawChunked` silently drops `opts.depthBias` and `opts.doubleSided`.**
   `glx/chunked.js:195` declares only `setDepthMask`/`setBlend`, and `core` does
   not even export `setCull`/`setPolyOffset`. The ROAD carries both
   (`game.js:5933`, `depthBias: [-8,-16], doubleSided: true`) and takes the
   chunked path whenever `PerfGov.tier() < 3` — the default on desktop HIGH and
   on the phone default MEDIUM. Only GRAPHICS: LOW falls back to `gfx.draw` and
   gets the offset. WGX honours both. Expected artefact: stipple/z-fight where
   terrain meets the ribbon, **disappearing at GRAPHICS: LOW** — that signature
   is the cheap way to confirm it.
3. **GLX: `frame.roadChunkLamps` never reaches GLX at all.** There is no
   `core.frame` getter for it and `begin()` never reads it, so
   `glx/chunked.js:211`'s `!F.roadChunkLamps` is always true and PER-CHUNK ROAD
   is a dead knob on the default backend — while 24 shipped presets set it to 1
   and `game.js:6038` still builds the second GPU copy of the road for it. WGX
   does the plumbing. `tools/slider-effect-live.mjs:124` already records the
   verdict "inert"; this names why.
4. **TLX: `tlx-shadow.castInstanced` has no update range at all** — pool slots
   are sized to the largest batch ever seen, so the upload is `cap × 64 B`, per
   caster, per shadow pass, per frame at night.
5. **TLX: shadow maps carry an RGBA8 colour attachment** cleared and written
   black every pass — 21 MB desktop-WebGPU / 4 MB mobile of dead VRAM and
   ~5 MB/frame of clear+write. `RedFormat`+`UnsignedByteType` is a 4× cut;
   `colorWrite = false` **must stay gated on WebGPU** (the note at
   `tlx-shadow.js:148` records a real WebGL defect where the next clear
   inherited the last draw's `glColorMask`).
6. **WGX: MAT-array fetches discarded per lit fragment** (backlog item 2, now
   traced end to end). Car ids 20-31 clamp to 16 and sample **asphalt** for a
   value neither consumer reads. The better patch than the one written above is
   to fold cars into the identity set and move the sample under the branch with
   `textureSampleGrad`, which carries no uniformity requirement — but
   `matUvLit` returns from a non-uniform `if`, and WEBGPU-PARITY §5a states the
   stricter folklore rule, so **`wgx-validate` must be the gate, not the
   argument**. Four tests pin the exact `textureSample(` string for aniso
   parity; a macOS census is the sign-off.
7. **CPU: a THIRD Δprog scan with no pre-reject** (`game.js:4211`), the same
   shape `docs/PERF-FINDINGS.md` §3 records fixing twice at **5.01% of physics
   CPU** — and worse than either, because it runs for every car, not just AI.
   462 pairs × 2 `fmod` per physics step. Every consumer is gated on `gapAhead <
   OT_GAP` in seconds, so the window must be `vTop()`-derived, never a literal.
   `physics-rows-vm.test.mjs:157` pins the lapped-backmarker case the wrap
   still has to reach.
8. **CPU: per-frame key rebuilds.** `getAeroFlap` (`carmesh.js:268`) rebuilds
   3 × `toFixed(2)` + 7 concats per flap per car per frame for a cache that
   always hits — 180-225 `toFixed` per frame — even though the colour array is
   the memoised livery object and could be a `WeakMap` key. `getCockpitWheel`
   mints 3 arrays + 4 closures + 9 `toFixed` every cockpit frame for the same
   reason. `getFieldWheelMeshes` and `getCarDecalTexture`/`getLiveryId` are the
   same shape. None is individually large; together they are the GC floor.
9. **CPU: `_hazeStr` is a latch with no invalidation** (`game.js:7413`). Its
   only writer sits after the cockpit `continue`, so entering cockpit view
   freezes it and pins a heat-haze warp to a stale world point; nothing resets
   it on camera change, `quitToMenu` or `loadTrack`.
10. **WGX: 16 of ~19 per-present `writeBuffer` calls are frame-invariant**
    (5 bloomDown + 4 bloomUp + FXAA + 6 blur). The blur six need
    `_blurWriteSlot`'s rotation replaced by a fixed slot per (consumer, pass)
    first — today a frame without SSAO hands the god-ray blur different slots,
    so the contents cannot be cached. Key the gate on the tuple
    `(tw, th, threshold, spread)`, never a hand-maintained flag.
11. **CPU: `makeFrustumPlanes` runs twice per frame** from the identical VP into
    the same pool (`game.js:6074` and `:7133`).
12. **CPU: `putBoundedMesh` allocates its `create` closure on every call**,
    including the ~66 cache hits a night frame takes. `js/track/mesh.js:398`
    hoisted the identical arrow for exactly this reason.

Deliberately NOT done, with the reason: **`applyMaterialNormal`'s `mid > 16`
guard.** `matBumpHeight` is likewise empty above 16, but the tail is `N =
normalize(N + 0)` and `N` is not provably unit-length at that call site
(`lit.js:877`), so skipping would drop a normalize the lighting may lean on.
Same reason backlog item 10 left `lit.js:1456` alone.

## A tool that reported ok on a file that would not parse

`tools/wgx-validate.mjs --static` — the gate AGENTS.md names for WGSL edits, and
the one a verify-agent runs — returned `{"ok": true}` on a `wgsl-post.js` whose
JavaScript was **syntactically broken**. It only ever `readFileSync`'d `wgx.js`
and `wgsl-chunks.js` as TEXT for a handful of regex invariants; it never read
`wgsl-post.js` or `wgsl-fx.js` at all, and never parsed any of them.

The WGSL lives in JS template literals, so a stray backtick in a shader comment
ends the string and the module stops parsing — which is how this was found, by
making that exact mistake and being told the file was fine. A module that does
not parse cannot define WGX, so the page falls back to GLX with one console
line: the silent-fallback failure this tool exists to catch, invisible to the
tool itself.

`parseCheck()` now compiles all four WGSL-carrying files with `vm.Script`
(compiles without running, which is what makes it safe to point at an IIFE
backend file from node). Proved to bite by reintroducing the backtick.

## Instrumentation

`tools/gpu-game-check.mjs` now records `__apex.renderScale()` and the census
prints a `gov:` row with `tier / autoTier / userTier / scale / fps / floorMs /
envFace`. §2t of `docs/PERF-FINDINGS.md` named this as the missing half: a
`meanLuma` comparison between two legs is only a comparison if both ran the same
content, and rung 1 of the governor's ladder is "env probe off". Run 25 read
46.9 vs 66.2 across three's two backends with none of it recorded, and the gap is
still open for exactly that reason. `envState().face` separates "the probe was
progressing and ran out of frames" from "the tier gate meant it was never
asked"; the tier says which rung closed it.
