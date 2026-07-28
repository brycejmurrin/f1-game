# WebGPU migration — Phase 3 notes (sun shadows)

Phase 3 fills the shadow-pass stubs on the WGX backend (`js/render/webgpu/wgx.js`) and
the LIT shader (`js/render/webgpu/wgsl-chunks.js`). Additive and **opt-in**: the WebGPU
backend is now loaded by `index.html` but only activates under
`localStorage apex26.gfxBackend = "webgpu"` (WebGL2/GLX remains the default,
always-present fallback), so the shipping WebGL2 game is untouched. Both files
pass `node --check`. The risks below were paper-verified and flagged for a
browser pass.

## What now renders

**Sun shadow map.** A depth-only pass rasterises shadow casters from the sun's
point of view into a `depth24plus` texture (`SHADOW_SIZE` = 2048 desktop / 1024
mobile), which the LIT fragment shader samples through a comparison sampler:

- `shadowBegin(lightVP)` — stashes the light view-proj, opens a vertex-only
  depth render pass (`colorAttachments: []`, its own command encoder), and
  extracts the light frustum planes for chunk culling.
- `castShadow(mesh, model)` / `castShadowChunked(mesh, model)` — record caster
  draws; the chunked variant frustum-culls chunks against the light planes.
  Model rides a dynamic-offset uniform ring (one slot per call; all current
  game casters use `MAT_IDENT`).
- `shadowEnd()` — ends the pass and **submits its own command buffer** so the
  depth map is ready before the later lit pass that samples it (queue ordering
  gives the read-after-write barrier).
- LIT shader: `lightVP` + `params2(shadowOn, strength, texel)` added to `FrameU`
  (now 304 B); a `texture_depth_2d` + `sampler_comparison` on group 0
  (bindings 2/3); a 3×3 PCF `textureSampleCompareLevel` loop modulating the sun
  diffuse **and** specular (both flow through `litNoL`).
- Shadows auto-disable when the sun is below the horizon (`sunDir.y < -0.05`) so
  a stale daytime map can't leak shadows into night. `pcss()` now returns true.

**Clip-space z fix (cross-cutting).** Phase 2 uploaded `viewProj` verbatim, but
game.js builds GL-convention projections (NDC z ∈ [−1,1]) while WebGPU rasterises
z ∈ [0,1]. Left-multiplying by `Z01` (`_mul4(out, Z01, vp)`) remaps
`z' = 0.5z + 0.5w`. Applied to the uploaded lit `viewProj` and the shadow
`lightVP`; **not** to the sky's `invViewProj` (ray reconstruction is convention-
independent) and **not** to the CPU-side `frameViewProj`/light planes used for
frustum culling (Gribb–Hartmann is fine on the GL matrix). Without this, the near
half of every scene — and every shadow caster — would have been clipped.

## Riskiest assumptions to verify in a WebGPU browser (ranked)

1. **Z01 remap correctness / double-application.** This is the highest-impact new
   change and touches the Phase-2 main pass. Verify geometry fills the full depth
   range (no near-plane clip, no z-fighting) and that nothing else already
   remapped. If geometry vanishes, this is the first suspect.
2. **Shadow bias.** Constant `0.0015` in-shader + pipeline `depthBias: 2,
   depthBiasSlopeScale: 3`. Tune for acne vs peter-panning against the real
   scene; the current values are conservative guesses.
3. **`FrameU` is now 304 B** (was 224). Confirm `FRAME_UNIFORM_BYTES` (chunks) ==
   `FRAME_BYTES` (wgx) and the `lightVP`@224 / `params2`@288 offsets match the
   `_writeFrame` float indices (56 / 72).
4. **Depth texture as both attachment and sampled resource.** `shadowTex` is
   `RENDER_ATTACHMENT` in the shadow pass then `TEXTURE_BINDING` (depth sample)
   in the lit pass — never simultaneously. Confirm no validation error and that
   `sampleType: "depth"` + `sampler_comparison` bind cleanly.
5. **`textureSampleCompareLevel` in non-uniform control flow.** Legal (explicit
   LOD), but confirm the target's WGSL implementation accepts it inside the
   `if (suv…)` branch.
6. **Shadow-pass submit ordering.** `shadowEnd()` submits before `begin()`; the
   lit pass samples the result same frame. Verify the barrier holds (no
   read-before-write flicker).

## Limitations / deferred

- Only the **sun** casts shadows (matches GLX). No point-light shadows (cost).
- **Cloud shadows** (GLX multiplies sun by `1 - cloudShadow`) not ported.
- Non-identity caster models are supported via the ring but untested (game only
  ever passes `MAT_IDENT`).
- `shadowOn` is gated on "any shadow ever rendered" + sun-up, not on a per-frame
  engine signal (the game doesn't send one to WGX); good enough for parity.

## Remaining phases

- **Phase 4** — full post chain (bloom / SSAO / god-ray / SSR / grade / flare /
  FXAA) replacing the tonemap-only `present()`, MSAA, decals (`drawDecal` +
  `createTexMesh`/`createTexture`), and the skid/glow FX (`drawMark`,
  `drawSkidBatch`, `drawGlow`, `drawShadow` blob). The deferred LIT material
  blocks (wet-road, procedural materials/detail, clearcoat, car-paint, sparkle,
  lamp-fog) also land here — their scalars are already plumbed.
- **Phase 3b (env probe)** — `envFaceBegin`/`envFaceEnd` cube-face render for car
  paint reflections. **Since implemented (Phase 4b):** they render a real
  RGBA16F cube one face/frame and the LIT shader samples it once a 6-face cycle
  completes; the default reflection is the cheap analytic sky when no probe is
  active. See `docs/WEBGPU-PHASE4-NOTES.md`.
- **Phase 5** — instancing (`drawElementsInstanced` equivalent) for lamps/trees/
  wheels/blob-shadows to cut draw calls.
- **Integration** — wire `js/render/gfx.js` into `index.html` + the async boot in
  `js/game.js` (still a deliberate later step; see WEBGPU-PHASE0-NOTES).
