# Perf hunt 5 — the GPU path, measured (2026-10-30)

Scope: TLX (three.js/TSL, the default backend and Bryce's iPhone WebGPU path), with GLX and WGX for parity. Hunt 4
(PR #4190, `aac01b64`) was static. This one counts work from census artifacts and live probes. A software probe is
evidence of COUNTS, not milliseconds (PERF-FINDINGS §0).

## Method

1. Prior art first. The prior-art scout's KNOWN rows are the do-not-re-report list (`scratch/perf5/known.md` in the
   session; the headline items are in §Not re-reported below).
2. Hardware baseline: the last two macOS censuses on code equal to this branch's base. Their artifacts carry the
   per-pass attachment inventory (`passOps`), pass counts (`passes`) and the mirror readout (`mirror.backend`):
   - nightly **40868057244** (deploy tip `c8f844b1`, default inputs: montreal, helmet camera, api entry)
   - **40838027433** (hunt 4's head `228b4b9e`, the same inputs)
3. Local counts on lavapipe. `tools/gfx/gpu-game-check.mjs` gained `--lavapipe` (the gfx-probe launch pair), so the
   census's own scenario runs three's WebGPU path in this GPU-less container. Lavapipe is far too slow for a steady
   pass inventory: 5 of 456 frames drew a full pass set, and the mirror rendered 1 to 3 times. Use it for state
   readouts (`mirror.backend`, gpuErrors), not for per-frame counts.
4. Seven read-only code-hunter slices, each finding sent to finding-verifier (see §Hunt).

## Baseline: what a TLX WebGPU frame does (macOS runner, helmet, tier 1, scale 0.9)

From 40838027433 `game-webgpu-macos-latest.json` (the nightly agrees within 2 %):

| count | TLX WebGPU | WGX |
|---|---|---|
| passes per frame (median / max) | 27 / 29 | 31 / 70 |
| `queue.submit` per frame | 20 | 3 |
| colour+depth attachments stored / discarded per frame | 30.12 / 3.05 | 32.96 / 1.13 |
| mirror target | 415×118, **9 mip levels, `mipFull: true`** | full chain, rendered on 110 of 422 glass frames |
| mirror renders / glass draws in the window | 529 / 528 | 110 / 422 |

The largest single item in TLX's inventory is `415x118/rgba16float:clear>store` at **5.11 passes a frame**: the
mirror's mip regeneration. three r186 regenerates a mipmapped render target after each render with one render pass
per level (A-H5's measurement: 6.35–7.1 of ~27 passes). A-H5 capped the chain at 3 levels, but the cockpit glass
latched the full chain for the session, and helmet is the game's DEFAULT camera. Both census legs show it: `mips: 9,
mipCap: 3, mipFull: true`. So the cap never applied to a default-camera player.

## F1 — bound the cockpit glass's mirror LOD instead of latching the full chain

**Mechanism.** The glass samples the mirror with an implicit-LOD `texture()` on a small, foreshortened quad pair.
Its LOD is not unbounded: it is set by the quad's screen footprint. `PostCommon.mipFootprintLod` bounds it per
triangle. With perspective-correct interpolation uv = N/D, where N and D are affine in screen space, the gradient is
grad uv = (grad N − uv grad D)/D. The numerator's norm is convex in uv, so its maximum over the triangle is at a
vertex. 1/D peaks at the vertex with the largest clip w. Their product bounds |d texel / d pixel| everywhere inside
the triangle.

Per screen axis the bound takes √2·(|du|+|dv|). That is the widest approximation of ρx, ρy the Vulkan spec allows
an implementation ("max(|m_ux|,|m_vx|) ≤ f_x ≤ √2(|m_ux|+|m_vx|)"; Vulkan-Docs `chapters/textures.adoc`,
§Scale Factor Operation), so the bound holds for any conforming GPU, not just an exact one.

- A triangle wholly behind the eye, or wholly past one side plane, rasterizes nothing and is skipped.
- A triangle that straddles the eye plane is unbounded (Infinity).
- `tlx.js` keeps the session max (`_mirGlassLod`) and sizes the chain to `ceil(lod + 0.25) + 1` levels, A-H5's
  formula for the inset rect.
- One unbounded frame does not latch. That frame is the camera and car out of step, measured as the frame after a
  `jump()` teleport. Two in a row, or missing CPU arrays, latch the full chain as before. The A/B lever is the existing
  `apex26.tlxMirMips=0` (the full chain always). A session-only `apex26.tlxGlassFull` key served the measurements below
  and was dropped, because the store registry refuses a writer-less key.

**Measured (lavapipe, montreal, helmet, 1280×720, the census scenario):**

| arm | `glassLod` | mip levels | `mipFull` | gpuErrors |
|---|---|---|---|---|
| old latch (`apex26.tlxGlassFull=1` while measuring) | — | 9 once grown | true | 0 |
| default (bounded) | 1.84 steady, 2.31 session max incl. the jump frames | 4 | false | 0 |

So the glass needs 4 levels where it was given 9. On the census frame that removes 5 of the 8 mip render passes per
mirror frame: about 5 of 27 passes and 5 attachment stores per frame on the default camera. The level-0 store is
unchanged. Levels 4–8 of a 415×118 target are small, so the saving is mostly per-pass fixed cost (encoder, load/store
setup and a tile flush per pass on a TBDR GPU), not bytes.

**Pixels.** Identical by construction: no tap reads a level past the bound.

A screenshot A/B cannot resolve this on this box. I ran two loads of the old latch (the then `apex26.tlxGlassFull=1`) and one
bounded load: lavapipe, montreal, helmet, mirror on, `park(0.1)` + `freeze(true)`, after 6 mirror renders.

| comparison | whole frame: pixels differing / max Δ | glass rectangles only (10 800 px) |
|---|---|---|
| old vs old (noise) | 492 293 / 248 | 6 834 / 26 |
| old vs bounded | 634 304 / 136 | 8 487 / 44 |

The two loads of the SAME arm differ over half the frame, and inside the glass too, because the mirror's rear view
moves between loads. The noise floor is far above anything a mip-level change could produce, so this is no evidence
either way.

The evidence is therefore the bound itself, checked at the real pose. The unit suite carries the cockpit glass
geometry, model matrix and frame view-projection captured live from `drawMirrorGlass` on TLX WebGPU (montreal, helmet,
1280×720, the 461×132 target):

| quantity | value |
|---|---|
| exact max LOD (central differences, hypot) | 1.32, so a trilinear tap reads level ≤ 2 |
| spec-safe bound (`mipFootprintLod`) | 1.84 |
| chain levels kept | 4 (levels 0–3) |
| levels the old latch kept | 9 |

Levels 4–8 are never read at that pose, so dropping them cannot change a pixel. A GPU at the spec's widest LOD
approximation is still inside level 3.

**Tests.** `tests/unit/mip-footprint-lod.test.mjs` is behavioural. The bound is never below a brute-force
perspective-correct LOD (central differences at about 740 interior points per triangle, over four cockpit poses).
It is exactly log2(texels/px) + 0.5 for a screen-parallel quad. At the live cockpit pose it holds with 4 levels (above). It is Infinity for an eye-plane straddle, and
−Infinity (no fragments) for a quad behind or off-screen. It scales by exactly 1 LOD per doubling of the target.

## Hardware result (macOS census, same inputs: montreal, helmet, api entry)

| run | head | TLX WebGPU passes/f median (max) | stored / discarded per frame | mirror | gpuErrors (4 legs) | meanLuma |
|---|---|---|---|---|---|---|
| 40868057244 (nightly) | `c8f844b1` | 27 (–) | 29.65 / 3.06 | 9 levels, mipFull true | 0 | 68.5 |
| 40838027433 | `228b4b9e` | 27 (29) | 30.12 / 3.05 | 9 levels, mipFull true | 0 | 68.7 |
| **41005913372** | **`bf2a21d9` (F1)** | **22 (24)** | **23.78 / 3.05** | **4 levels, mipFull false, glassLod 2.31** | **0** | 68.5 |

- Five fewer render passes and about six fewer attachment stores a frame on Bryce's path (TLX WebGPU) at the default
  camera. Submits are unchanged at 20: three's mip build shares the mirror's submit.
- The TLX WebGL2 leg reads the same mirror state (4 levels, glassLod 2.31): one shorter `generateMipmap` a frame.
- The Verdict's wide-frame list no longer carries the mirror. Baseline: `WIDE FRAMES ADD: 2.15x
  461x132/rgba16float:clear, …`. After: `0.66x 2048x2048/r8unorm|d:clear, 0.66x 512x512/r32float:clear, …`.
- fps (20.3 / 24.5 → 26.5) and the census's normal-frame ms (14.9 / 13.1 → 5.6) moved the right way. Both are
  paravirtual-runner numbers (PP-19), quoted as correlation, never as the result. meanLuma is unchanged (68.5), which
  is consistent with the pixel argument but is not proof of it.

## F2 — WGX env cube: 4 mip levels, built in the face-5 submit (hunter W1 + W3)

The census's open WGX lead, `WIDE FRAMES ADD: 4.24x 64x64/rgba16float:clear`, is the env cube's mip ladder. The
inventory tags each view by its texture's base size, so every level lands in the 64×64 row. 7 levels × 6 faces gave
36 clear>store passes on the frame that completes a cube.

Every `envCube` tap in `wgsl-chunks.js` (1789, 1795, 1867, 1896) is `textureSampleLevel(…, rough * 2.5)`. After the
SAA clamp at 1405, rough is ≤ 1, and the wet and car terms only mix it toward 0.30 or 0.02 or scale it down. So a
tap reads level 3 at most. The fix is `envMips = min(7, ceil(2.5) + 1) = 4`. Levels 0–3 are built from the same
parents as before, so the result is bit-identical by construction, and the ladder drops to 18 passes. W3 records
the ladder into face 5's own encoder after its pass, so queue order is unchanged and a cube costs one submit less.

Test: `webgpu-lifecycle.test.mjs` "perf hunt 5 W1/W3" drives six env faces through the mock device and asserts:
- 4 levels on the cube texture
- one pass on each of faces 0–4
- 1 + 18 passes on face 5
- one submit per face

On the old code it fails (expected 4 levels, got 7).

Gates: `wgx-validate.mjs --static` clean. `webgpu-lifecycle` + `renderer-soft-lifecycle` pass 165 / 0.

Census on the PR head (macos-latest, same inputs), WGX leg:

| run | head | `64x64/rgba16float:clear>store` per frame | wide-frame add for that row | passes per frame, max | submits median | gpuErrors (4 legs) |
|---|---|---|---|---|---|---|
| 40868057244 / 40838027433 | base | 0.78 | 4.24× | 70 | 3 | 0 |
| 41005913372 | `bf2a21d9` (F1 only) | 0.95 | 4.98× | 68 | 3 | 0 |
| **41008210504** | **`4fd8b966` (F1 + F2)** | **0.42** | **1.91×** | **50** | 3 | **0** |

- The row halves, as the 36 → 18 ladder predicts, and the worst frame loses 18 passes.
- The median submit count is unchanged, because the saved submit happens once per cube, not once per frame.
- The same run keeps TLX WebGPU at 22 passes per frame (median), with the mirror at 4 levels (glassLod 2.38).
- meanLuma for WGX: 73.5, against 73.2 and 73.8 on the earlier runs, within run-to-run spread.


## Hunt

Workflow run `wf_69455213-93c`: seven code-hunter slices (TLX lit, TLX post, shadows, culling,
cars, fx/sky, WGX parity), each report sent to finding-verifier. 54 verdict rows: 30 CONFIRMED, 19 NEEDS-BROWSER,
8 REFUTED, 7 STALE. The raw output is session-local (`scratch/perf5/hunt-result.json`).

Shipped here, ranked by measured work removed per line:

| id | what | measured | status |
|---|---|---|---|
| F1 (parent) | TLX glass mip chain bounded | −5 passes/f, −5.9 stores/f on the macOS census | this PR |
| W1 | WGX env cube 7 → 4 levels | −18 passes per cube (the 64×64 wide-frame rows) | this PR |
| W3 | WGX env ladder in the face-5 submit | −1 submit per cube | this PR |

CONFIRMED, not shipped. These are per-pixel ALU gates, bit-identical by the verifier's trace, but their gain is
unmeasured and each needs a shader pixel A/B that this box cannot resolve (see the A/B noise above). Follow-ups:

- TLX-L1: the pit-lane mark block in `roadMarkings` runs on every road fragment. GLX branches on `uPitLane.y`;
  the branch was never ported to TLX (`tsl-lit.js:1116-1181`).
- TLX-L2 / shadows S1, S2: skip `cloudShadow`'s FBM when `sunSh == 0`, and skip the car-shadow taps when the static
  taps are all 0. S1 helps on DRY days only, because overcast presets set shadowStr < 1 so sunSh never reaches 0.
- cars F3 / F4: the carbon weave sin/cos when `wvFade == 0` (far carbon), and the sun disc in the mirror pass where
  `carSunGlint` is 0. Both run on all three backends.
- TLX-P5-3: lens-dirt fetch with bloom off. TLX-P5-1: WebGL2 phones' square post targets (cover), whose off-rect
  area is cleared and stored but never read (≤ 54 %); WebGL2 leg only.
- W2 / cars F1: WGX and GLX still keep the mirror's full chain. `PostCommon.mipFootprintLod` is the shared bound to
  port; it needs the same live footprint as TLX.
- culling S1–S5, fx P5-FX1/2: CPU-side index rebuilds and particle uploads; rates need a browser.

NEEDS-BROWSER rows (19) were not acted on. Their verdict text is in the run output.

## Not run / limits

- **BrowserStack.** The MCP's `runBrowserLiveSession` returns a dashboard URL for a person to drive. It has no fps
  or thermal readout an agent can script. Its "latest" iOS is 18.6, where Safari ships WebGPU off by default (Bryce
  is on iOS 26). So there are no real-iPhone fps or thermal numbers from this session; the device arms belong on
  #3954 (Device Farm).
- **Chrome DevTools trace, js-debugger hitch profile.** Not run. Every ms number in this container is SwiftShader
  or lavapipe time, which the plan rules out as evidence. The hitch question is answered from the census's
  `passes.costVerdict` instead.
- **Lavapipe steady counts.** Too few frames draw (above). The per-frame pass and store numbers come from the macOS
  census only.

## Not re-reported (prior art)

Hunt 4's ports (#4190), the A-H5 inset cap, patch 17 discards (#3685), A-P1/A-P2, scene11, the `tlxMir11` /
`tlxTag8` / `tlxGodray11` flags (device arms on #3954), depth-only shadow RTs (r187), unbatchable submits, sky cache
512 (rejected), SGSR default (rejected), and "post chain 15 draws, nothing to cut" (PERF-HUNT-TLX-2026-10-17).

## Sources

- three.js WebGPU post-processing manual (MRT, attachment precision): https://threejs.org/manual/en/webgpu-postprocessing.html
- three.js WebGPURenderer manual: https://threejs.org/manual/en/webgpurenderer.html
- UBO cost with many render items, mrdoob/three.js#30560: https://github.com/mrdoob/three.js/issues/30560
- WebGPURenderer CPU cost report (r183): https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904
- Apple tile memory and MSAA resolve (WWDC20 "Harness Apple GPUs with Metal"): https://developer.apple.com/videos/play/wwdc2020/10602/
- Apple GPU counters (WWDC20 10603): https://developer.apple.com/wwdc20/10603
- Xcode: Apple GPU counter statistics: https://developer.apple.com/documentation/xcode/analyzing-apple-gpu-performance-using-counter-statistics
- Xcode: measuring GPU memory bandwidth: https://developer.apple.com/documentation/xcode/measuring-the-gpus-use-of-memory-bandwidth
- wgpu `StoreOp::Discard` (tile-GPU guidance): https://idanarye.github.io/bevy-yoleck/wgpu/enum.StoreOp.html
- Transient MSAA on tile GPUs (practice): https://github.com/0x63616c/voxelite/pull/46, https://github.com/OpenH1/OpenH1/issues/133
- Safari WebGPU MSAA per-sample shading report: https://github.com/niivue/niivue/issues/1619
- Safari 27.2 transient MSAA device loss: https://github.com/pixijs/pixijs/issues/12344
- Safari 26 WebGPU device-lost / regressions: https://github.com/ocornut/imgui/issues/9103, https://github.com/rerun-io/rerun/issues/12788
- WebKit 26 memory pressure under WebGPU: https://github.com/microsoft/onnxruntime/issues/26827
- WebGPU implementation status: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- Vulkan scale-factor approximation bounds: https://github.com/KhronosGroup/Vulkan-Docs/blob/main/chapters/textures.adoc
- Prior repo issue on r186 storing every attachment: https://github.com/brycejmurrin/f1-game/issues/3681
