# TLX WebGPU pass and attachment audit, phone tier (2026-10-27)

Scope: Bryce's path (TLX, THREE PATH: WEBGPU, iPhone). Covers #2649's open bullets (godray R11F, depth-only shadow
RT, framebuffer formats and loads), the #3681 follow-up (audit every pass's load/store ops), #3104 F6 (one
`queue.submit` per `renderer.render()`) and the phone-tier format readout. #3681's lever (vendored patch 17,
single-sample `storeOp`/`depthStoreOp` discard) shipped in #3685 and is not repeated here. #2649's sky-cache item is
a measured negative (#3962).

Method: code reading of the vendored three r186 (three 0.186.1 `build/three.webgpu.js` from jsDelivr, the build `vendor/three-0.186.1`
minifies) and of `js/render/three/`, plus the three.js `dev` branch (r187, milestone due 2026-10-28). Measurement:
this PR adds a store inventory to the census (below). Phone numbers come only from a device batch (#3954).

## Per-frame passes on the phone tier (WebGPU, GRAPHICS MEDIUM, chase cam, dry day)

r186 opens one command encoder and calls `queue.submit` once per `renderer.render()`, and once per mip-chain build.

| pass | target (format) | colour load > store | depth | notes |
|---|---|---|---|---|
| sun shadow (about 1 frame in 20) | 1024² r8unorm + depth | clear > discard (patch 17) | clear > store (sampled) | `colorWrite=false`: the R8 only exists because r186 needs a colour attachment |
| mirror | lite 168×48 (×2 supersample) rgba16float + r16float tag | clear > store, tag > discard | clear > discard | then three's mip build (3 levels, A-H5): its own submit |
| main scene | full res rg11b10ufloat (scene11) + r16float tag | clear > store; tag > store, or discard when nothing reads it (A-P2) | clear > discard unless SSAO/SSR/godray/flare reads it (A-P1) | |
| godray march + 1 blur pair (grLite), SSAO folded in alpha | half of post size, rgba16float | clear > store | none | D7 fold: alpha carries AO by day |
| bloom bright + 2 down + 2 up (3 levels on MEDIUM) | rg11b10ufloat mips | clear > store; the additive UP passes load | none | |
| composite | post size rgba8unorm | clear > store | none | |
| FXAA (+ mirror inset) | canvas | clear > store | none | SGSR adds one pass when upscaling |

About 12-14 `render()` calls and submits a frame. Post targets are built with `depthBuffer: false`, and every
full-overwrite pass clears rather than loads (`runPass`), so there is no needless load or depth store left in post.

## Findings

1. **Mirror and scene disagree on attachment 0, so the mirror rebuilds every pipeline on the phone.** three's WebGPU
   pipeline cache key includes `getCurrentColorFormat()`, which is the format of attachment 0
   (`WebGPUPipelineUtils`/`getRenderCacheKey` in r186). A·W14 made the mirror target the scene's shape so the mirror
   reuses the scene's pipelines, but scene11 (#3690, phones on WebGPU only) moved the scene to rg11b10ufloat while
   `prepareMirrorTarget` still builds rgba16float. On every phone whose adapter exposes `rg11b10ufloat-renderable`,
   the two keys differ again: the mirror's first draws and its warm compile a second pipeline set. **Change:**
   `apex26.tlxMir11=1` gives the mirror the scene's rg11b10ufloat (scene11 only); also 4 B/px instead of 8. Default
   off: it changes the mirror's stored precision. A device arm must confirm iOS exposes the feature (PERF-KNOWN-WINS
   row 15 lists it as unverified); `post.state().formats.scene` answers that on the phone.
2. **ssrTag is r16float where r8unorm holds every value.** Tags are 0.35 (car paint), 0.75 (porous), the material
   alpha, and 1 (FX), read through smoothsteps at 0.42-0.55 and 0.85-0.95 (`tsl-post.js`). r8unorm stores
   0.349/0.749/1.0, which gives the same masks, and is blendable for the `_tagKeep` Zero/One state. A fractional alpha inside
   0.85-0.95 moves its road mask by up to 4 % (1/255 over the 0.1 step). The tag stores 2 B/px at full res whenever SSR
   or haze reads it. **Change:** `apex26.tlxTag8=1` makes it 1 B/px, on the scene and the mirror together. three keys
   pipelines on attachment 0 only, so a scene r8 tag beside an r16f mirror tag would reuse a pipeline with the wrong
   target format.
3. **Godray pair R11F (#2649 bullet).** The pair stays rgba16float because by day its alpha carries the folded AO
   (hunt D7). At night `_ao` is 0 (key brightness gate in `game.js`), the fold is off and the alpha is never read.
   **Change:** `apex26.tlxGodray11=1` builds the pair rg11b10ufloat on unfolded frames (WebGPU with the renderable
   feature) and rebuilds it rgba16float when a fold arrives, so a dusk crossing pays one rebuild and one pipeline set.
   Saving: 4 B/px on the march write, two blur writes and their reads, at half the post size.
4. **Depth-only shadow RT (#2649 bullet): deferred to the r187 bump.** three `dev` adds `RenderTarget({ count: 0 })`
   ("a depth-only render target (WebGPURenderer)", `src/core/RenderTarget.js`). On r186 the R8 colour is already
   `colorWrite=false` and stored with `discard` (patch 17), so what remains is a 1 MB allocation per shadow map and a
   tile clear. That is not worth a vendor patch on r186. When r187 is vendored, switch `tlx-shadow.js`'s map to
   `count: 0` and drop the `apexDiscardColor` site. PP-19's census ranked the 1024² r8unorm clear second among
   wide-frame passes on the runner, which is correlation, not cost.
5. **#3104 F6, submits: no upgrade fixes it, and batching is unsafe to patch.** r185's "Optimize `submit()` calls"
   (mrdoob/three.js#33513) only removed a per-call array allocation; the author notes a single command per
   `submit()`. `dev` (r187) still submits once per render context (`WebGPUBackend.finishRender`). A patch that collects
   the command buffers and submits once a frame would reorder work: three writes each pass's uniforms with
   `queue.writeBuffer`, which executes in queue order relative to submits, so a later pass's write to a shared
   buffer (camera, render group) would land before an earlier, deferred pass ran. No upgrade plan. The lever is fewer
   `render()` calls, and the cheap ones have shipped: grLite (one godray blur pair), bloom levels capped at 3 on
   MEDIUM, D7's AO fold, the A-H5 mirror mip cap. What is left is structural: composite and FXAA cannot merge,
   because FXAA reads neighbours of the composite's output.
6. **WebGL2 leg untouched.** All three flags need `isWebGPUBackend` (tag8) or the rg11b10 renderable feature on
   WebGPU (mir11, godray11). The rg11b10 scene was reverted on WebGL2 after a measured fps loss (LIVE-DEBUGGER-PHONEPERF
   §Reverted).

## Readout and census

- `GLX.__tlx` post state, `post.state().formats`: `{ scene, tag, mirror11, bloom, godray, ssao, ldr }`. On an iPhone
  that exposes the feature the default reads `scene: "rg11b10", tag: "r16f", bloom: "rg11b10", godray: "rgba16f"`.
  `mirrorState().hdr` now means "not 8-bit", so an rg11b10 mirror still tone-maps as HDR.
- `gpu-game-check.mjs` and `frame-hitch.mjs` record each pass's attachments as `WxH/format:load>store` (+ `d:` for
  depth) and the `queue.submit` count per frame. `analysePassOps` reports the steady frame's inventory, and the census
  Verdict prints it as `store: submits=… stored=…/f discarded=…/f` plus the top passes. A flag arm shows up as a
  changed format in that list (rgba16float → rg11b10ufloat, r16float → r8unorm).

## Census result (macos-latest, Dawn on Metal; montreal night, chase, `forceMobileTier=1`)

| arm | run | WebGPU gpuErrors | store row | scene pass |
|---|---|---|---|---|
| flags (`tlxMir11`, `tlxTag8`, `tlxGodray11`) | 40561149896 | 0 | submits=8, stored 9.08/f, discarded 2.05/f | `1280x720/rg11b10ufloat:clear>store + r8unorm:clear>discard + d:clear>discard` |
| control | 40565792193 | 0 | submits=8, stored 9.07/f, discarded 2.05/f | the same with `r16float` for the tag |

- The runner exposes `rg11b10ufloat-renderable`, so scene11 is on in both arms.
- The tag changed format. It is discarded in both arms, because the governor sits at tier 3 there and sheds SSR, so
  the r8 tag saves nothing on this runner.
- No godray pass ran in either arm, because tier 3 sheds it.
- The mirror was `shown=false` in the window. Only its warm draws ran into the rg11b10 + r8 target, and they raised
  no GPU error.
- Eight submits a frame confirms finding 5's count at this tier.
- fps (23.3 vs 20.1) is runner noise (PP-19) and is not quoted as a result.
- What is still open: the device arms on #3954 — the mirror drawn, a lower tier, and a fill-bound scale.

## A/B recipe

- Census, one run per arm, sequentially (render-tlx.md): `gpu-census.yml` with
  `ls: apex26.forceMobileTier=1 apex26.tlxMir11=1 apex26.tlxTag8=1 apex26.tlxGodray11=1`, `tod: night`, `cam: chase`,
  against the same dispatch without the three flags. Read `store:` and the `path:` row. The macOS runner's fps cannot
  resolve a format A/B (PP-19).
- Device (#3954 lists the arms): iPhone 14, TLX WebGPU, `--pin-scale 1` so the frame is fill-bound, monza night,
  chase. Arms `B=` / `F=apex26.tlxMir11:1,apex26.tlxTag8:1,apex26.tlxGodray11:1` / `B=` in ABA order. Record fps, p95,
  thermal, and `post.state().formats`. Add a first-race arm with `apex26.tlxMir11:1` for the mirror pipeline count
  (the #3673 recorder's `matMiss`).

## Sources

- three.js releases (r186 2026-09-24; r185 "Optimize `submit()` calls"): https://github.com/mrdoob/three.js/releases
- mrdoob/three.js#33513: https://github.com/mrdoob/three.js/pull/33513
- three.js milestones (r187 due 2026-10-28): https://github.com/mrdoob/three.js/milestones
- `dev` WebGPUBackend and RenderTarget (`count: 0`, `storeMultisampled*Buffer`):
  https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgpu/WebGPUBackend.js,
  https://github.com/mrdoob/three.js/blob/dev/src/core/RenderTarget.js
- mrdoob/three.js#30560 (UBO cost, no submit batching discussed): https://github.com/mrdoob/three.js/issues/30560
- GPUQueue.submit ordering: https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/submit
- `rg11b10ufloat-renderable`: https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedFeatures,
  WebKit bug 265897: https://bugs.webkit.org/show_bug.cgi?id=265897
