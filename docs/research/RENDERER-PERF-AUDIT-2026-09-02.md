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
