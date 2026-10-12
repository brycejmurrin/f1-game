# TLX perf hunt, 2026-10-11 — five read-only Opus agents on tip 9941d84

Bryce asked to "use opus subagents to hunt for performance improvements for three js".
Five agents each took one disjoint slice of the three.js backend (`js/render/three/` and
the `js/render/shared/` files it uses), read the code and the vendored three r186 (a
beautified copy; `pretty:NNNN` below is a line in that scratch copy, not in the repo),
and reported ranked findings with file:line, mechanism, fix, verification and risk.
Nothing was measured: no browser, no test, no GPU timing. Every ms, byte and pixel
figure is arithmetic or a Node micro-benchmark, and each item keeps its hunter's own
confidence: CONFIRMED (the mechanism is traced from the real per-frame caller and, where
three internals are claimed, read in the vendored source) or SUSPECTED (reading only, or
the mechanism is confirmed but the size or the look effect is not). The do-not-re-report
list was `TLX-PERF-PLAN.md`, `PERF-FINDINGS.md`, `TLX-SHADER-IDEAS-2026-10-01.md` and
the other renderer notes; items already there are omitted or say how they differ.

Four of the decisive claims were spot-checked by the parent session before this note was
written (marked ✓): the default camera is HELMET (`camMode` 19 → `mode-switch.js` index
19), the material-array taps sit before their `live` / `fade` gates, post passes run with
`renderer.autoClear = false`, and L1 is gated to WebGPU by the comment at
`tlx-shadow.js:132-137`.

## Plan status corrections

- **P2 (fixed per-pair post materials) has shipped** — `_fixedMats` defaults on
  (`tlx-post.js:195-198`), every AO / godray / down / up pass has its own material; the
  remaining `.tex.value` writes set the same texture, which three ignores
  (pretty:15905-15909). `TLX-PERF-PLAN.md`'s status row still says "low priority".
- **L1 is WebGPU-only**: on three's WebGL2 backend (desktop Safari, Firefox, Linux) every
  night lamp rebuild is still a full prop pass, 30–60/s. Finding C1 below is the fix.
- **`scratch/shadow-pass-count.mjs`**, which the plan cites, is not in the tree, and
  `lampShadowState()` (`tlx.js:3224`) does not expose `lampStaticBuilds` / `lampCarOnly`,
  so verifying L1 changes needs that hook extended first.

## Cross-slice shortlist — what to build first

Ordered by (reach × confidence) / fix size. S = one function, no new program family;
M = a new buffer, a shared-file change or a capability flag; L = a design change.
"Phone" marks what pays off on the device Bryce plays on (tile-based GPU, MEDIUM tier).

| # | item | slice | size | phone | look |
|---|---|---|---|---|---|
| 1 | Clear instead of load on every overwrite post pass (`autoClear=false` → `loadOp:"load"`) | D1 | S | yes | identical |
| 2 | Sample the baked material arrays inside the `live`/`fade` gate with `.grad()` (cars, glass, flags, far road pay 2 trilinear aniso taps for nothing) ✓ | B1 | S | yes | identical |
| 3 | Wrap `roadMarkings()` (~150 ALU) in `If(hw > 0.5)` — it runs on cars, walls, pines, crowd and is masked away | B4 | S | yes | identical |
| 4 | Gate the baked lamp-pool block (3 dependent taps + ~60 ALU on 100 % of lit fragments, day and night) | B3 | S | yes | identical |
| 5 | ssrTag attachment RGBA16F → R8; fetch the tag lazily (mobile composite reads it with nothing writing) | D2 | S | yes | identical |
| 6 | Godray march: skip the 3-octave cloud FBM when the shadow tap is 0 | D5a | S | yes | identical |
| 7 | L1 on WebGL2: pre-seed the five `UNPACK_*` keys with `state.pixelStorei` at boot so the first copy does no `getParameter` ✓ | C1 | S | — | identical |
| 8 | Lamp-change rebuild draws the static props twice with identical planes; static pass first, then copy + cars | C2 | S | — | identical |
| 9 | Night lamp loop: hoist the lamp-index fetch, add GLX's squared-distance reject (up to 48 fetches + 48 `sqrt` per fragment) | B2 | S | yes | identical |
| 10 | Mirror pass re-packs and re-uploads every visible instance batch because it shares the instance buffer with the main pass; on by default via HELMET ✓ | A1 | M | — | identical |
| 11 | Uniform arrays (~3.3 KB) re-upload per render object per variant even when unchanged; vendor patch to skip equal contents | A2 | S (vendor) | yes | identical |
| 12 | `forceSinglePass` on transparent double-sided lit materials (tsl-fx already does; 2 draws + 2 uncompiled pipelines per such mesh) | B5 | S | yes | identical |
| 13 | Lamp texture: 64 KB re-upload per night frame when only ~3.7 KB of colour moved | A3 | S-M | yes | identical |
| 14 | SSR march skipped by day below gate ≈ 0.02 (max blend weight ≤ 0.014 at the shipped 0.07) | D4 | S-M | — | needs A/B |
| 15 | AO → R8, bloom/godray → RG11B10F (GLX already does; three r186 supports both) | D6 | S-M | yes | A/B for RG11B10 |
| 16 | The mirror ignores the render scale: the governor drops the main frame first, so a GPU-bound desktop keeps the full-res 2× supersampled mirror (~8 texels per displayed pixel at scale 0.7); one shared-file change covers all three backends | E2 | S | — | identical |
| 17 | The full mirror rung draws building glass and water for a ~300 CSS px box; the lite rung already drops both | E6 | S | — | near-identical |
| 18 | Sky cloud noise (17 value-noise calls per sky pixel by day) runs on every uncovered pixel every frame, main pass and mirror, for clouds that drift ≤ 0.11 px/frame; cache the slow part in a 2D texture refreshed a slice at a time | E1 | L | yes | needs A/B + GLX/WGX parity |

Everything marked "identical" should be pixel-identical within the same-tree A/B floor
and is verified by a frozen A/B plus `gfx-probe` with `gpuErrors` 0 on both three paths;
the look-changing items need a GLX/TLX side-by-side and the census `meanLuma`
(`PERF-FINDINGS.md` §0: frame rate is never the measure here).

## A. Per-frame CPU path (`tlx.js`)

The big structural fact: the default camera is HELMET, an onboard view, so the AUTO
rear-view mirror runs at full quality every frame on any desktop GPU. Every frame has two
full world passes — the mirror at `tlx.js:3743` and the main scene at `tlx.js:4501` — and
several costs below are that doubling.

| # | file:line | finding | confidence | cost | fix |
|---|---|---|---|---|---|
| A1 | `tlx.js:1718-1789, 1664-1673, 3721-3745`; `game.js:6683-6702` | Mirror and main passes share one instance buffer per prop batch; each pass re-packs and re-uploads every visible instance, so the cell-set cache never hits on the default camera | mechanism CONFIRMED, size estimated | ~0.5–1 ms CPU at 10k visible instances + 2 pack uploads/frame | M: a lazily created per-batch mirror instance mesh sharing vertex/index buffers, a `gfx.instPerPass` flag so game.js skips its freeze/record copies on TLX |
| A2 | `tsl-lit.js:266-283, 299`; `tlx.js:747-751`; vendored three | Five lamp/material uniform arrays (~3.3 KB) re-upload on every render call for every program variant, unchanged or not; each of the ~28 instanced prop batches is its own variant, mirror and main count separately | CONFIRMED in three; variant count estimated | ~350 uploads, ~230 KB/frame | S vendor patch (upload only when contents differ — removes every upload by day) / L: instancing through geometry attributes collapses the 28 variants to one, needs a real-hardware census (the per-object key prevents the "barriers vanished" bug) |
| A3 | `tlx.js:4373-4378`; `tsl-lit.js:492-500`; `frame-lights.js:312-335, 619-622` | At night, lamp flicker / warm-up changes lamp colours every frame; each change re-uploads the whole 64 KB lamp texture when ~3.7 KB moved (~235 lamps, montreal) | CONFIRMED | 64 KB texture upload per night frame | S-M: size the texture to the baked lamp count, or split colours into their own texture |
| A4 | `tlx.js:1640-1646, 1756-1773` | Every instance pack is copied twice, the second by a JS element loop (247 µs vs 27 µs for `TypedArray.set` on 160k floats in node) | CONFIRMED | ~0.25 ms per 10k instances per copy; 2–3 copies/frame with A1 | S: pack straight into the instance attribute array; `set` where a copy remains |
| A5 | `tlx.js:1583-1587, 3574/3716/3754/4037`; `tlx-chunked.js:383` | `drawList.length = 0`, `_visList.length = 0`, `_instAlive.clear()` discard their storage so every pass regrows from empty (node: 137 vs 0 scavenges per 20k resets) | CONFIRMED | ~10–20 KB garbage/frame | S: draw-count cursor, drop the `_visList` reset, per-frame stamp instead of the Set |
| A6 | `tlx.js:4161-4165`; `shadow-pass.js:202-205` | Blob shadows are ~22 separate render objects per frame; worst on three's WebGL2 path (Safari/iOS) where §2y measured ~10 ms JS per frame inside render | count CONFIRMED, ms estimated | ~0.3–0.8 ms on WebGL2 | M: one instanced blob mesh |
| A7 | `tlx.js:4447, 4495, 4601, 1956-1959` | Small per-frame allocations: the `refuseTab` closure (despite its "hoisted" comment), the `setMirror` array literal, the mirror-gate string concat, one range object per stream upload | SUSPECTED (V8 may elide) | < 1 KB/frame | S |

Verify: A1 by summing `instanceMatrix.version` over the prop batches across 120 frames
with `apex26.hudMirror` on and off (three's WebGL2 on SwiftShader or
`apex26.tlxForceHw=batches`, because AUTO mirror and batches are off on software
WebGPU); A2 by wrapping `__tlx.renderer.backend.updateBinding` on a parked day frame; A3
by wrapping `backend.updateTexture` and counting bytes per night frame; A4/A5 by a
`frame-hitch.mjs` heap A/B; A6 by `memState().rObj` dropping by (cars − 1).

Ruled out by this hunter: `setRenderTarget` / `setMRT` are plain field writes;
`scene.matrixWorldAutoUpdate` is false and hidden pooled meshes are skipped at once; no
TLX material sets `needsUpdate` per frame; `updateRanges` is honoured on both backends;
the mirror mip chain uses cached render bundles; the program-key override runs once per
render object; material-cache thrash past 64 entries was ~1 miss/s in census 212.

## B. Lit shader GPU cost (`tsl-lit.js`, `tsl-chunks.js`)

Four facts about the vendored r186 that shape the ranking: `select()` compiles to a real
if/else (pretty:1731-1780) so both arms are not evaluated; nodes are hashed by id
(pretty:483) so two identical `textureLoad` calls emit two fetches; three prepends
`diagnostic(off, derivative_uniformity)` to every fragment shader except on Firefox
(pretty:19646), so the "hoist or hard WGSL error" comments in tsl-lit.js bind only there
and `.level()` / `.grad()` / `textureLoad` are legal inside branches everywhere else; the
lamp loop is a plain `for` with a `Break` that already stops at the live count.

| # | file:line | finding | confidence | cost | fix |
|---|---|---|---|---|---|
| B1 | `tsl-lit.js:956-963, 996-997` ✓ | Both baked-material array taps (trilinear, aniso 4) run on every lit fragment — cars, glass, flags, past 80 m / 260 m, and at `matTexMix` 0; GLX skips them | CONFIRMED | 2 texture taps/fragment | S: sample inside the gate with `.grad(dFdx(uv), dFdy(uv))` |
| B2 | `tsl-lit.js:1727-1756` | Every night lamp-loop iteration fetches the lamp-index texture even when the per-chunk path is unused, and TLX lacks GLX's squared-distance reject so it pays a `sqrt` per lamp: up to 48 fetches + 48 `sqrt` per fragment | CONFIRMED | taps + ALU | S |
| B3 | `tsl-lit.js:1670-1692` | The baked lamp-pool block does 3 dependent taps + ~60 ALU on 100 % of lit fragments, day and night | CONFIRMED | taps | S: gate on `bakeOn && bIn && N.y > 0.55`, result identical |
| B4 | `tsl-lit.js:1032-1116, 1533` | `roadMarkings()` (~150 ALU) runs on every plain and instanced fragment and is masked away | CONFIRMED | ALU | S: `If(hw > 0.5)` around the body, the 2 fwidths stay outside |
| B5 | `tsl-lit.js:2281` | Transparent double-sided lit materials (classic-cockpit glass, ERS bar / overtake lamp at alpha < 1) take three's two-pass draw: 2 draws + 2 pipelines the warm never compiles; `tsl-fx.js:41-49` already fixed this with `forceSinglePass` (§2ah) | CONFIRMED | compile hitch, variants | S |
| B6 | `tsl-lit.js:1733-1744` | With per-chunk lamps on, each in-range lamp emits up to 6 lamp-texture fetches where 2 are needed (colour read 4×, direction texel 2×) | CONFIRMED (emitted) | taps | S |
| B7 | `tlx-post.js:115, 165-182` | The ssrTag attachment is full RGBA16F (MSAA on desktop WebGL2) but only `.r` is read — same as D2 | CONFIRMED format | bandwidth | S-M |
| B8 | `tsl-lit.js:1293, 1304, 1463` | `cr` (vnoise + fwidth), `mnFp`, `trkRightXZ` are hoisted out of gates on uniforms (`matU.detail`, `U.wetness`) and run on every fragment | CONFIRMED | ALU | S |
| B9 | `tsl-lit.js:1135-1145` | 7 of the 10 fwidths hoisted in `applyMaterial` are linear rescales of `fwHc` / `fwY` | CONFIRMED | ALU | S |
| B10 | `tsl-lit.js:1275, 1298` | `normalWorld` costs an inverse-view transform + 2 normalizes per fragment; on double-sided materials (road, cars) r186 already flips by face and tsl-lit flips again | cost CONFIRMED, look SUSPECTED | ALU, parity | S: `normalWorldGeometry` |
| B11 | `tsl-lit.js:1305-1321, 805-816` | Up to 12 vnoise finite differences build the near-road normal; several steps span 0.86–5.7 noise cells, so they are jitter, not gradients | SUSPECTED (look) | ALU | M |
| B12 | `tsl-lit.js:526-544, 2063-2072` | Cloud-shadow and ground-mist FBM run per fragment on features 100+ m wide; a per-frame mask texture would replace them (pairs with D5b) | SUSPECTED | ALU | M-L |
| B13 | `tsl-lit.js:1969/2000, 2052-2053, 2069` | Duplicate env-cube fetch on metal; constant-exponent `pow` in fog | CONFIRMED | small | S |
| B14 | pretty:1354, 12528-12538, 7366-7400 | The ~12 lit textures and samplers sit in three's per-object binding group, cloned and walked per render object per pass | SUSPECTED | per-draw CPU | M |

Parity: B1–B6, B8, B9, B13 leave the picture unchanged and touch no other backend; B10,
B11, B12 change the look. Not new: the per-object uniform question is settled by
PERF-FINDINGS §2y (`U` lives in `renderGroup`); the three remaining per-draw uniforms
are legitimately per-object, only the textures (B14) are left.

Correctness side note (renderer-debug, not perf): on Firefox three omits the uniformity
opt-out and `sampleShadow`'s `textureSampleCompare` sits inside non-uniform branches, so
TLX on WebGPU may fail to compile the lit pipeline there.

## C. Shadows and culling (`tlx-shadow.js`, `shared/shadow-pass.js`, `tlx-chunked.js`)

What runs each frame: there are no cascades. The sun map holds only static casters and
is rebuilt when the camera crosses a 20 m light-space cell or the sun changes (~3–5/s at
80 m/s by the cell size; census 216 measured ~1/0.95 s in a slower drive), each rebuild
with a 512² PCSS blocker pass; cars go to a separate car map rendered every frame and
the lit shader takes the minimum. The lamp map (night, 512²) on WebGPU is mostly a 1 MB
depth copy + 1–3 car draws; on three's WebGL2 backend L1 is off, so every rebuild redraws
all props 30–60/s. The shadow passes have their own instance pack (not the camera's);
one caster per batch is shared by the sun, lamp and lamp-static passes, each rebuild two
n×16 float copies per batch plus an n×64 B upload.

| # | file:line | finding | confidence | cost | fix |
|---|---|---|---|---|---|
| C1 | `tlx-shadow.js:132-142` ✓ | L1 is off on WebGL2 only because the first `copyTextureToTexture` does a sync `getParameter` (pretty:17283); writing the five `UNPACK_*` keys once via `state.pixelStorei` at boot fills three's cache with no GL read (pretty:16917-16924) | CONFIRMED | CPU + GPU draws every night rebuild on Safari / Firefox / Linux | S |
| C2 | `shadow-pass.js:616-629` ✓ | A lamp change draws the static props twice with identical planes (full pass, then static pass); static first, then copy + cars, does it once — the ~1/s night hitch frame (2.05 ms static render on Lavapipe, paid twice) | CONFIRMED | CPU + GPU | S, shared file |
| C3 | `shadow-pass.js:617-627`; `tlx.js:3443` | Lamp-pass props are culled only by the 140–149° lamp frustum whose corners reach ~4× the lamp radius; the file's own argument that casters beyond the radius cannot matter is applied to cars, not props; `Frustum.radialCulled` / `aabbDist2` exist; GLX same | mechanism CONFIRMED, size SUSPECTED | CPU + GPU | S-M, shared + each backend's cull |
| C4 | `shadow-pass.js:303-353` | Every sun cell crossing clears and redraws the whole 2048² map though the box shifts by 1/8; a shifted depth copy + a strip render cuts fill to 1/8–2/8 and draws to ~1/3 | gain SUSPECTED | day periodic hitch | L |
| C5 | `tlx.js:1754-1781`; `tlx-shadow.js:327-356` | The shadow pack is copied twice and a full-size `_shadowPack` per batch stays on the heap for the session; write straight into the caster's `instanceMatrix.array` | CONFIRMED | CPU + heap | S-M |
| C6 | `tlx-shadow.js:97-118, 213-218` | Every shadow target carries an unread RGBA8 colour attachment (three r186 default, pretty:7571), cleared, written and stored on every pass: 22 MiB VRAM on desktop WebGPU; R8 + `colorWrite=false` on WebGPU cuts it ≥ 4× | VRAM CONFIRMED, bandwidth SUSPECTED | GPU | S |
| C7 | `shadow-pass.js:366-390` | On clear nights the car map renders every frame for a moon shadow at strength ≤ 0.29 (`tsl-lit.js:381-390`); the existing odd-frame cadence halves it | CONFIRMED; lag visibility needs A/B | GPU + CPU | S, shared |
| C8 | `shadow-pass.js:383-403` | The car pass casts the player with no distance test and still clears + arms the map when nothing can reach it (TV, broadcast, replay cameras); every lit fragment in the box then pays 4 compare taps on an empty map | CONFIRMED, rare | GPU | S, shared |

Not confirmed (one line each): incremental per-frame chunk culling (the AABB tests cost
tens of µs); a low-sun receiver cull (risks the godrays); back-face-only casters;
per-chunk caster slots; tiny-prop culling; snap hysteresis; a car-map content key;
inflated chunk boxes; per-pass submits.

## D. Post chain (`tlx-post.js`, `tsl-post.js`, `shared/post-common.js`)

Passes per frame, each a full `renderer.render(QuadMesh)` and, on WebGPU, its own
command encoder and `queue.submit` (pretty:21309, 21444, 18446):

| condition | passes | detail |
|---|---|---|
| desktop day, HIGH, tier 0, 1920×1080 | **19** (20 with the mirror inset) | scene → RGBA16F ×2 (output + ssrTag) + D24, MSAA ×2 (×4 ULTRA) on WebGL2; SSAO + 2 blurs at 960×540 RGBA8; godray march (16 steps × shadow compare + 3-noise cloud FBM) + 4 blurs at 960×540 RGBA16F; bright + 4 down + 3 upAdd + upFinal RGBA16F; composite → RGBA8 at full res including the SSR march; FXAA → canvas (bgra8, canvas depth attached) |
| desktop night, mist > 0 | **14** (11 with mist 0) | lamp-beam march + 1 blur pair, bloom ×9, composite, FXAA |
| mobile day, MEDIUM, 1266×585, no MSAA | **13** | SSAO ×3 at 633×292 RGBA8, march + 1 pair RGBA16F, bloom ×5, composite (still fetches the ssrTag every pixel with SSR off), FXAA |
| mobile night | **7** | |
| autoTier 4 | **2** | |

| # | file:line | finding | confidence | cost | fix |
|---|---|---|---|---|---|
| D1 | `tlx-post.js:393-394, 301-306` ✓; pretty:12503-12510, 21290-21297 | `autoClear=false` gives every post pass `loadOp:"load"`, overwrite passes included; a tile-based GPU (phones, Apple Silicon) reads the whole target first: ~53 MB/frame at 1080p day, ~16 MB/frame on a phone | mechanism CONFIRMED | bandwidth (tile-based) | S: clear on overwrite passes, load only for upAdd and the mirror; program keys unchanged |
| D2 | `tlx-post.js:166-182`; `tsl-post.js:549, 607, 612-614` | ssrTag is full-res RGBA16F (× MSAA samples on WebGL2) for one value: ~30 MB/frame WebGPU 1080p, ~100 MB/frame WebGL2 2× MSAA; on mobile MEDIUM it is fetched every pixel with nothing writing it. Per-attachment formats are supported (pretty:18421, 18198-18205, 17109). Not the dropped "skip the attachment": count and keys stay | CONFIRMED | bandwidth | S: `textures[1]` RedFormat + UnsignedByte, lazy fetch |
| D3 | pretty:18281-18296 | Three's WebGL MRT resolve loop masks the depth bit on every attachment, so MSAA depth resolves twice per frame on desktop WebGL2 (every desktop Safari boot); on ANGLE-D3D11 an extra full-screen pass | CONFIRMED | bandwidth | S: one-token vendor patch |
| D4 | `tsl-post.js:612-753, 741-747`; `game.js:8184` | The SSR march (24 steps + 4 refine + 7 taps, full res) runs wherever `ssrGate > 0.001`; at the shipped dry-day road 0.07 its largest blend weight is ≤ 0.0143, car paint 0.05 ≤ 0.012 | arithmetic CONFIRMED; look-neutral SUSPECTED | GPU ALU | S-M: skip below ~0.02 by day only (night neon sheen is visible), use the miss path; GLX needs the same gate |
| D5 | `tsl-post.js:355-374` | The day godray march computes the 3-octave cloud noise at all 16 steps (~2.2k ALU per half-res pixel, ~1.1 G ops/frame at 1080p) even when the shadow tap already returned 0 | CONFIRMED | GPU ALU | (a) S bit-identical: gate on `lit > 0`; (b) M: a per-frame cloud-shadow texture (pairs with B12) |
| D6 | `tlx-post.js:91-95, 226-250` | AO could be R8 and bloom/godray RG11B10F as GLX does; the header's "three exposes neither" is wrong for r186 (R8 pretty:17109; RG11B10 pretty:19284-19289 / 17125; three requests `rg11b10ufloat-renderable`, pretty:18340, 21064-21070) — RG11B10 needs a renderability gate | plumbing CONFIRMED | bandwidth, memory | S-M: ~half of ~70 MB bloom/godray traffic per day frame |
| D7 | `tlx-post.js:415-525` | Fold SSAO into the godray march (AO in its unused alpha) and share the first identical blur pair: 19 → 16 desktop, 13 → 10 phone; conflicts with RG11B10 for godray in D6 | SUSPECTED | bandwidth + per-pass CPU | M-L |
| D8 | `tlx.js:356-379`; `tlx-post.js:689/694`; pretty:21131-21146, 21302-21303, 18862-18876 | The canvas pass carries an unused canvas-size depth buffer, loaded and stored every frame on WebGPU; the mirror inset is a second render pass over the whole canvas | CONFIRMED | bandwidth (tile-based) + 1 pass | S-M: clear/discard that depth; draw the mirror inside the FXAA shader |
| D9 | `tlx-post.js:166-169`; pretty:18299-18302 | `sceneRT` keeps `storeMultisampled*: true`, so the MSAA buffers are never discarded after the resolve; the scene renders into it exactly once per frame (`tlx.js:4499-4501`) | gain SUSPECTED | bandwidth (WebGL2 MSAA, tile-based) | S: both false |
| D10 | `tsl-post.js:358` | A loop-invariant `exp(stepLen*-0.01)` is recomputed at all 16 godray steps (GLX `glsl-post.js:365` same) | CONFIRMED | ALU | S |
| D11 | `tsl-post.js:198-203, 250-255, 483-485, 669-674` | View position is rebuilt with a full mat4 for every SSAO tap and every SSR step; a perspective matrix needs a few scalars | SUSPECTED | ALU | M |
| D12 | pretty:8678, 15119-15175, 21309, 21444 | Every pass pays a full `_renderScene` plus its own encoder and `queue.submit`: 11–20 per frame from post alone; the only lever is fewer passes (D7, D8) | structure CONFIRMED, ms unmeasured | CPU | — |

Need a luma / look A/B: D4, D5b, D6 (RG11B10), D7. Byte-identical within the floor: D1,
D3, D5a, D9, D10, the R8 AO and tag formats. Every change: `gfx-probe` gpuErrors 0 on
three/WebGPU and three/WebGL2, and the braking compile probe stays at 0 lap compiles
(D2 and D6 re-key the scene or post pipelines once; the warm should absorb it). D1, D8,
D9 only pay on tile-based GPUs, so measure on the census `macos-latest` leg (`gpuMs`); D3
on a Windows WebGL2 leg.

Checked, nothing to fix: no hidden output pass (Linear output, no tone mapping, FXAA
writes the canvas, pretty:15341); no canvas MSAA on the post path (pretty:15348-15351);
no post target generates mipmaps or is resized per frame; no per-frame CPU texture
upload (lens dirt and the 1×1 fallbacks upload once); no readback outside the soft-blit
path; the MRT set during post adds no shader cost (pretty:4339-4341); `present()`'s own
JS is ~75 uniform writes, ~45 knob lookups and one closure; the blurs are already
separable and bilinear-optimised.

## E. Sky, FX, mirror pass, assets (`tsl-sky.js`, `tsl-fx.js`, `shared/mirror-pass.js`)

What the mirror and the env cube cost per frame (desktop HIGH, tier 0, HELMET, mirror
AUTO = the "full" rung every frame): one world render of the whole scene into its own
target (the world to 400 m with the main frame's fog cull, building glass, water, up to 6
rivals, the full cloud sky; no shadows, post, particles, decals or skid marks), then a
full mip chain of that target (WebGPU: an extra submit plus ~9–10 tiny passes,
pretty:21444-21449 → 18628-18675; WebGL2: one `generateMipmap`), then one quad into the
HUD box. Resolution is CSS box × DPR (max 2) × 2 supersampling, capped 1024×512
(`mirror-pass.js:147-153`): 600×171 at 1080p (~5 % of the main frame's pixels), 1024×293
on a DPR-2 laptop. Lite / low / min rungs run at 0.6 / 0.5 / 0.4 of that every 1 / 2 / 3
frames and drop instanced props, glass and water. The env cube renders zero faces per
frame — TLX opts out of the probe unless `apex26.tlxEnvProbe=1` (`tlx.js:2106, 3479`).
The main-pass sky covers the ~25 % of pixels the world leaves uncovered; by day
(cloud 0.4) each runs 17 value-noise calls, at night ~8.

| # | file:line | finding | confidence | cost | fix |
|---|---|---|---|---|---|
| E1 | `tsl-sky.js:259-340` | Full cloud noise on every sky pixel every frame, main pass and mirror, for clouds drifting ≤ 0.11 px/frame (0.3 at max speed); cache the slow part in a 2D texture keyed by direction, refreshed a slice at a time (2D, not a cube: the WebGPU cube target still has the open "black world" problem); sun, stars, moon, dither stay per pixel | runs-per-frame CONFIRMED, saving SUSPECTED (est. 3–7× less sky work) | GPU ALU | L, look change, GLX/WGX parity |
| E2 | `mirror-pass.js:147-153, 463-475` | The mirror ignores the render scale; the governor drops the main frame first and sheds tiers only at the floor, so a GPU-bound desktop keeps the full-res 2× supersampled mirror | CONFIRMED | GPU fill | S, shared file, all backends |
| E3 | `tlx-post.js:166-180` | ssrTag RGBA16F for one scalar: 8 B written per scene fragment, 8 B read + written per blended smoke / spray / rain / halo fragment, multisampled + resolved on desktop WebGL2 (= D2 / B7) | format CONFIRMED | bandwidth | S, TLX only |
| E4 | `particles.js:338, 486, 517-560` | Rain is rebuilt on the CPU and re-uploaded at ≥ 30 Hz: 450–650 drops × 6 vertices ≈ 156 KB per upload while spray is alive; a vertex shader can place drops from data seeded once | CONFIRMED | CPU + upload | M, shared across backends |
| E5 | `tsl-sky.js:186-197, 297-311, 377-393` | ~25 uniform-only sky terms computed per pixel; move to `update()` | CONFIRMED | ALU (est. 5–10 % of sky) | S-M, near-identical |
| E6 | `game.js:6712, 6716` | The full mirror rung draws building glass and water; gate on "this is the mirror" as the lite rung does | CONFIRMED | draws + per-object updates | S |
| E7 | `tsl-fx.js:186-206` | Particle and rain quad corners (21 %) blend at exactly zero alpha; the outer halo band contributes < 0.5 %: discard the first, shrink the halo quad to ±0.8 | math CONFIRMED, saving SUSPECTED | blend bandwidth | S |
| E8 | `tlx.js:1180`; pretty:21444, 18637 | The mirror rebuilds its whole mip chain every frame; the HUD box reads only the first level down, the deep levels serve the cockpit glass only, so hood / visor / T-cam could skip them | CONFIRMED | small | S |
| E9 | `tsl-lit.js:1747`; `mirror-pass.js:611-617` | The mirror at night has no lamp cap: the full per-chunk lamp loop at 2× supersampling, and every baked lamp re-ranked on the CPU each frame | CONFIRMED, benefit SUSPECTED | GPU + CPU | S-M, look change |
| E10 | env probe (opt-in) | The cube target has `generateMipmaps: true`, so three rebuilds 6 faces × 6 mips (36 passes) after every single face render; the explicit pass at face 5 is redundant — fix before re-enabling the probe | CONFIRMED | — (opt-in only) | S |
| E11 | `tsl-lit.js:492-501`; `tlx.js:4374` | Lamp texture re-uploaded every night frame for ~235 colour changes (= A3) | CONFIRMED | 64 KB/frame | S |
| E12 | `tsl-lit.js:1937` | The car sparkle block still runs in the mirror: gated per material, not on the sparkle setting the mirror zeroes | CONFIRMED | tiny | S |

`assets.js` / `gltf.js`: nothing per frame; the per-track lamp grid uploads ~0.8 MB of
fixed-size textures per bake, fine at that cadence.

Not confirmed or not worth it: no FX material reads scene depth, so no soft-particle
cost; draw counts are already low (2 particle, 1 skid, 1 glow, ~1.8 blob shadows, 1
decal per car); the glow halo rebuild is ~8.6 KB/frame; gating the mirror when the
player is stationary almost never fires (cars behind move); a half-rate mirror world
reads as lag without reprojection; skipping thick cloud noise where coverage is zero
saves about what the branch costs (~12 % of day sky pixels are clear at cloud 0.4);
mirror MSAA instead of 2× supersampling does not remove shading aliasing.

Verify: frozen-frame look A/B against the same-tree noise floor; `frame-hitch.mjs` for
CPU and allocations; `__apex.mirror().backend.w/h`, `Particles.stats()`,
`tools/gfx/ssr-probe.mjs`, `mem-census.mjs`; gpu-census on macos-latest (gpuErrors,
meanLuma, gpuMs) — a day leg covers E1, night legs E9 and E11.

## Method notes

- One Opus agent per slice, two concurrent (AGENTS.md: ≤ 2 nested subagents), read-only,
  no browser; each got the do-not-re-report list and a disjoint file set, and wrote its
  full report to the session scratchpad (gone with the container; this note is the copy).
- The hunters beautified the minified vendored three r186 with the repo's terser to read
  its internals; those `pretty:NNNN` lines are reproducible from
  `vendor/three-0.186.0` but are not repo lines.
- Cross-slice duplicates were found independently by two hunters each, which is weak
  corroboration: ssrTag format (B7 = D2 = E3), the lamp texture upload (A3 = E11), the
  mirror's instance re-pack (A1, and E's cost table).
- Two hunters' ruled-out lists disagree with nothing in the others'; the one open
  conflict is D7 (fold SSAO into the godray target) versus D6 (RG11B10 for godray).

## Fix pass, 2026-10-12 (PR #1446, `cursor/tlx-perf-fixes-3b7e`)

Bryce: "Fix all". Five implementation lanes, one Opus agent each in its own worktree, two
at a time, each limited to the pixel-identical items of one section. What landed, by
commit:

| commit | items | note |
|---|---|---|
| lit shader | B2, B3, B4, B6, B8, B9, B13, E12 | verified with a TSL codegen dump (GLSL + WGSL, plain / chunked / instanced) diffed per item; B1 was a false premise (r186 emits an un-`toVar`'d tap at its first use, already inside the gate), B5 is a look change |
| post chain + vendor | D1, D2 (R16F one-channel, not R8: the composite's smoothstep ramp has real values inside it), D5a, D6 (AO R8), D10; vendor patches §11 (D3) and §12 (A2) | D9 is a no-op off OculusBrowser; D8 only the depth clear |
| shadows | C1, C2, C3 (chunked + instanced cells), C6, C8 | C1 moves the WebGL2 lamp map to DEPTH32F (quantisation-level only) |
| mirror / sky / fx | E2, E5, E7a | E7b skipped: the halo is 1.1 % of its centre at ±0.8 |
| frame path | A1, A3 (sized upload: 16 KB, not 64 KB, on montreal), A4, A5, A6, A7 (3 of 4), C3b, C5 (one copy), E6 (look change in the inset only), E10 | E8 skipped: the inset samples trilinear levels 1-2+ |

Not done, with the reason: B10–B12, B14, D4, D7, D11, D6-RG11B10F, A2-instancing (L), C4
(L), C7, E1 (L), E4 (M, three backends), E9. The AI car-pass bound `hypot(cBox, 170) + 8`
is too small above ~108 m SHADOW DISTANCE (unfixed: changes output).

### Evidence

- Frozen A/B, `backend-compare.mjs montreal 0.12 eye --backends three`, untouched tip in a
  worktree vs the fix tree: day MAD 0.585 (same-tree floor 0.584; 98 vs 80 px > 32, all
  silhouette edge jitter), night MAD 0.003 (0 px > 32), mean luma identical both legs.
- `gfx-probe --backend three` plain, `tlxForceHw=1` and `hudMirror=on`: PASS, gpuErrors 0.
- Remote `tiny` 4/4, `gfx` 4 llvmpipe shards; per-lane unit files all green; the WebGPU path
  is the gpu-census macOS dispatch (no Vulkan ICD in the cloud container, so lavapipe cannot
  boot there on any commit).

### Two lessons (measured here, 2026-10-12)

1. **`gfx-probe`'s PASS does not fail on a page JS error.** Its gate is a visible presented
   canvas plus `gpuErrors`. A6's first cut threw `Cannot read properties of undefined
   (reading 'instanced')` on EVERY frame (`drawList[-1]` from a `-1` sentinel) and the probe
   said PASS; the error card was only visible in `page-hud.png`, and the only textual
   evidence was `console.txt` (`[pageerror]`). After a renderer change, grep every probe's
   `console.txt` for `pageerror|Uncaught|TypeError` and diff the count against the untouched
   tip (the tip itself carries one pre-existing `reading 'total'`).
2. **Software CI never runs the instanced-batch paths.** `skipBatches()` is true on
   SwiftShader and llvmpipe unless `apex26.tlxForceHw=batches`, so the remote `tiny` and
   `gfx` groups, the unit files and the plain probe were all green on the crashing head. A
   change under `skipBatches()` needs a probe with `--ls apex26.tlxForceHw=1` (or the named
   part) before it is called verified, and the census on real hardware after.
3. **The probe's page capture is not a frozen frame.** `page-hud.png` lands on the title
   screen or in the race depending on build time (the untouched tip captured the title
   twice; the fix tree the race), and the perf governor's dynamic render scale changes the
   canvas size between a loaded and a quiet box (1152×648 vs 1280×720). A pixel A/B needs
   `backend-compare.mjs` (one deterministic scene) and the same-tree floor captured in the
   same session.

## Tier 2, 2026-10-12 (PR #1447, `cursor/tlx-perf-tier2-6d1e`)

Bryce: "Work on the next findings asap". Four lanes, two at a time, each look-changing
item behind a `localStorage` kill switch; `tools/shot/backend-compare.mjs` gained `--ls`
pins so each switch can be A/B'd on the same deterministic scene.

| lane | landed | skipped (reason) |
|---|---|---|
| lit shader | B10 (one-flip world normal — the double flip was a BUG: r186 already flips on DoubleSide, so back faces were lit with an inverted normal vs GLX), B10b (constant env-cube uv: the default reflectVector chain was dead), B11 (analytic near-road gradient, `apex26.tlxRoadNormalV2`), B12 (cloud/mist octave-2 skip, bit-identical) | B14 (r186 `NodeBuilder._getBindGroup` keys the shared group by `nodeUniform.id`, which texture bindings lack — needs a vendor patch), B1, B5 |
| post chain | D7 (SSAO in the godray pass's alpha, `tlxAoFold`), D6 bloom RG11B10F behind a renderability gate (`tlxBloom11`), D8 (mirror inset in the FXAA pass, `tlxMirFold`), D11 (scalar projection terms) | D4 (parity with GLX's look) |
| shadows | the AI car-pass bound bug (box-corner reach; rivals above ~108 m SHADOW DISTANCE get their shadow back), C5 second copy, C7 moon-only cadence (`moonShadowCadence`) | C4 (WebGPU forbids a sub-region depth copy; the along-sun term is unsnapped) |
| sky / mirror / fx | E1 cloud-noise cache (768² RGBA16F, banded re-bake, `tlxSkyCache`), E9 mirror lamp cap + held re-rank (`tlxMirLampCap`), blob-quad zero-alpha discard | E4, E8 |

Passes per frame after D7/D8: desktop day 19 → 16, phone day 13 → 10. Sky: day 17 noise
calls per sky pixel → 1 + 2–3 fetches, night 8 → 0 + 2.

### Evidence

- Software-sky A/B (`montreal 0.12 eye`, merged tip in a worktree vs the fix tree; day
  floor MAD 0.589): day MAD 0.830 (B11's road texture), night 0.630 (floor); D7 alone
  0.542, B10+B12 alone 0.068 (under the floor); night with the fold on vs off 0.014.
- Hardware-sky A/B (`--ls apex26.tlxForceHw=sky` on BOTH trees): day MAD 0.923 / sky
  band 0.685 against 0.638 / 0.687 between two trees whose sky code is byte-identical —
  the cloud cache is at the floor; night MAD 1.133, mean luma −0.12.
- Probes (plain and `tlxForceHw=1`): PASS, gpuErrors 0, only the pre-existing
  `reading 'total'` TypeError. Remote `gfx` 4/4 and `tiny` 4/4; `ci.yml` 42 jobs green incl.
  the Metal renderer specs; gpu-census macos-latest Verdict passed on all four legs with
  gpuErrors 0.

### Three more lessons

4. **Three merges same-uuid texture nodes into one sampler, and the composite is compiled
   once.** D7's first cut bound the godray target to both the AO and godray slots; the
   night (unfolded) frames then read the white fallback through the godray slot and added
   (1,1,1) to every pixel (night luma 85.6 → 175.9). The same hazard pre-existed for
   bloom-off + godray-off (both `blackTex`). Every composite slot now holds a distinct
   texture; an A/B with the fold on and off is the check.
5. **A worktree runs its own copy of the tools.** The base capture for the hardware-sky
   A/B ran the base tree's `backend-compare.mjs`, which predates `--ls`, so it silently
   rendered the software fallback sky (no clouds) and looked like a sky regression (sky
   band MAD 30). Copy the tool into the worktree, or pin through the init script, before
   comparing trees.
6. **Census `meanLuma` is tier-confounded.** The governor settles at a different tier per
   run (tier 4 sheds post effects): the TLX/WebGL2 leg read 47.6 at tier 4 and 56.5 at
   tier 3 for the same look. Read `gov:` next to `meanLuma`; the census is a gpuErrors +
   Verdict gate, the frozen A/B is the look instrument.
