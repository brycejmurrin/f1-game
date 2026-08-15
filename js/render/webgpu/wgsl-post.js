/*
 * Apex 26 — WGSL post-processing shaders (WebGPU migration, Phase 4).
 *
 * A FAITHFUL-BUT-REDUCED WGSL port of the GLX post chain — the same philosophy
 * the Phase 2 sky/lit port used (docs/archive/webgpu/WEBGPU-PHASE2-NOTES.md) and the Phase 3
 * shadow port (docs/archive/webgpu/WEBGPU-PHASE3-NOTES.md): keep the *look-defining* math,
 * drop the deep tail. The Phase-4 tail that WAS deferred — screen-space
 * reflections, radial speed-blur, chromatic aberration and unsharp-mask sharpen
 * — is now ported (SSR as its own pass; the three image FX folded into
 * COMPOSITE). Nothing here is wired into index.html — the wgx.js pipeline agent
 * owns that. This file only ships the shader strings + their exact bind/uniform
 * contracts. Passes `node --check`.
 *
 * NO build step: plain JS template strings, one global `WGSLPost`. No modules.
 *
 * GROUNDING (the GLX programs this ports — all of them in js/render/shaders/post.js;
 * glx.js only destructures GLXShaders and holds no shader source):
 *   POST_VS       js/render/shaders/post.js   fullscreen-triangle vertex (VBO-less)
 *   BRIGHT_FS     js/render/shaders/post.js   bright-pass threshold
 *   DOWN_FS       js/render/shaders/post.js   13-tap Jimenez bloom downsample
 *   UP_FS         js/render/shaders/post.js   9-tap tent bloom upsample (additive)
 *   SSAO_FS       js/render/shaders/post.js   depth-based horizon-AO + contact shadow
 *   GODRAY_FS     js/render/shaders/post.js   volumetric shafts (world-march) — see NOTE
 *   COMPOSITE_FS  js/render/shaders/post.js COMPOSITE_FS   scene+bloom+ssao+godray, ACES, grade, flare, vignette
 *   FXAA_FS       js/render/shaders/post.js COMPOSITE_FS   Timothy Lottes compact FXAA
 *
 * Composed from the shared leaves in js/render/webgpu/wgsl-chunks.js (a global loaded
 * BEFORE this file):
 *   WGSLChunks.fullscreenTri  — fsTriNDC(vi): VBO-less triangle NDC positions
 *   WGSLChunks.tonemap        — acesTonemap(vec3): shared ACES filmic leaf
 *   WGSLChunks.hash / .vnoise — value-hash + fbm (available; not all passes need them)
 *
 * WGSL-vs-GLSL notes carried over (see wgsl-chunks.js header):
 *   - textureSampleLevel(t,s,uv,0.0) not texture(s,uv); split texture+sampler.
 *   - vec3<f32>, explicit f32(), 1.0 not 1. dFdx/dFdy -> dpdx/dpdy.
 *   - depth is [0,1] in WebGPU NDC (no *2-1 window->NDC remap that GL needs).
 *   - depth textures bind as texture_depth_2d, sampled with a NON-filtering
 *     sampler; textureSampleLevel(...) returns f32 directly (the raw depth).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SHARED SCREEN CONVENTION (contract for wgx.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Every pass is a fullscreen triangle: draw(3), no vertex buffers. The vertex
 * stage emits `uv` in TEXTURE space (origin top-left, y-down):
 *     uv = ((p.x+1)*0.5, (1-p.y)*0.5)      // p = NDC from fsTriNDC(vi)
 * View-position reconstruction from depth (SSAO) uses NDC:
 *     ndc = vec3(uv.x*2-1, 1 - uv.y*2, depth)   // depth already 0..1
 * so the invProj uniform wgx uploads MUST be the WebGPU-convention inverse
 * projection (clip[0..1 z] -> view).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RENDER-TARGET CHAIN wgx.js should allocate (pass order = WGSLPost.PASS_ORDER)
 * ─────────────────────────────────────────────────────────────────────────────
 * Inputs from the main pass:  sceneHDR (rgba16float, full-res, .a = SSR car tag
 *                             — unused here), sceneDepth (depth24plus/depth32f).
 *
 *   0. SSAO      : half-res R8/rgba8. reads sceneDepth.            -> ssaoTex
 *   0b SSAO denoise / god-ray blur: separable 5-tap gaussian (BLUR)
 *   1. GODRAY    : half-res rgba16float. world-space march through
 *                  depth + sun/lamp shadow maps.                   -> godrayTex
 *   2. BLOOM_DOWN: mip0 = bright-pass+downsample of sceneHDR at HALF res
 *                  (threshold > 0); mips 1..N-1 = plain downsample of the
 *                  previous mip (threshold = 0). Each mip is rgba16float, each
 *                  half the size of the last (GLX BLOOM_DIV=2, up to 5 levels).
 *   3. BLOOM_UP  : from the smallest mip upward, tent-upsample each level ADD-
 *                  blended (blend: src ONE, dst ONE) into the next-larger mip.
 *                  The full bloom result ends up in mip0.                -> bloomTex (mip0)
 *   3b SSR       : full-res rgba16float. reads sceneHDR + sceneDepth (+ invProj/
 *                  proj/upVS). Marches the reflected view ray to mirror the
 *                  on-screen world onto up-facing wet road. .rgb = soft-clipped
 *                  reflected HDR colour, .a = mix amount (0 = no reflection).
 *                  Consumed by COMPOSITE (or the LIT pass) on wet surfaces.  -> ssrTex
 *   4. COMPOSITE : full-res -> LDR intermediate (or straight to swapchain if
 *                  FXAA is folded off). reads sceneHDR, bloomTex(mip0),
 *                  ssaoTex, godrayTex. Also runs chromatic aberration, radial
 *                  speed-blur and unsharp sharpen on the scene read (each gated
 *                  0 = no-op). If wgx also feeds ssrTex here, add it as a 7th
 *                  binding and mix per the SSR contract below.          -> ldrTex
 *   5. FXAA      : full-res LDR -> swapchain. reads ldrTex.        -> present
 *
 * FXAA is a SEPARATE pass (not folded into COMPOSITE) so the edge AA runs on the
 * final tonemapped LDR image, exactly like GLX (FXAA_FS is the last blit). If a
 * target wants to skip AA, present COMPOSITE straight to the swapchain and drop
 * pass 5.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOW PORTED (Phase 4b) vs the earlier DEFERRED list:
 *   - Wet-road screen-space reflection: the big SSR march block is lifted into a
 *     SEPARATE `SSR` pass (GLX COMPOSITE_FS wet-road block, js/render/shaders/post.js COMPOSITE_FS) —
 *     short 12-step march for mobile, road-only (car-paint tag omitted; the .a
 *     SSR tag path from GLX isn't reproduced here).
 *   - Radial speed-blur, chromatic aberration, unsharp mask: folded into
 *     COMPOSITE (GLX COMPOSITE_FS, js/render/shaders/post.js COMPOSITE_FS), each gated by a scalar
 *     so 0 = the shipped no-op look.
 *   - Film grain is KEPT (cheap, one hash); dither is KEPT (8-bit banding fix).
 * GODRAY is the GLX world-space march (depth + sun/lamp shadows + HG phase);
 * BLUR is the shared 5-tap separable gaussian used to denoise SSAO and soften
 * the shaft slices (GLX BLUR_FS, js/render/shaders/post.js).
 */
"use strict";

const WGSLPost = (function () {
  const CH = (typeof window !== "undefined" && window.WGSLChunks) || {};
  const fullscreenTri = CH.fullscreenTri || "";
  const tonemap = CH.tonemap || "";

  // ── Shared fullscreen-triangle vertex stage (mirror BLIT in wgsl-chunks.js) ──
  // Emits texture-space uv (y-down). Depends on fsTriNDC from `fullscreenTri`.
  const POST_VS = `
struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
};
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VOut {
  var o : VOut;
  let p = fsTriNDC(vi);
  o.pos = vec4<f32>(p, 0.0, 1.0);
  o.uv  = vec2<f32>((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return o;
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 1. BLOOM_DOWN — bright-pass threshold + 13-tap downsample.
  //    Port of GLX BRIGHT_FS js/render/shaders/post.js folded into DOWN_FS js/render/shaders/post.js.
  //    threshold > 0 -> bright-pass gate the result (first mip). threshold == 0
  //    -> pure downsample (subsequent mips).
  //
  //    BIND GROUP 0:
  //      @binding(0) srcTex  : texture_2d<f32>   scene HDR (mip0) OR previous mip
  //      @binding(1) srcSamp : sampler           linear clamp
  //      @binding(2) U       : uniform  BloomDownU
  //    UNIFORM BloomDownU (16 B):
  //      texel     : vec2<f32>  off 0   (1/srcWidth, 1/srcHeight)
  //      threshold : f32        off 8   (>0 = bright-pass, 0 = plain downsample)
  //      _pad      : f32        off 12
  // ════════════════════════════════════════════════════════════════════════
  const BLOOM_DOWN = `
struct BloomDownU {
  texel     : vec2<f32>,
  threshold : f32,
  _pad      : f32,
};
@group(0) @binding(0) var srcTex  : texture_2d<f32>;
@group(0) @binding(1) var srcSamp : sampler;
@group(0) @binding(2) var<uniform> U : BloomDownU;
${fullscreenTri}
${POST_VS}
@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let t  = U.texel;
  let uv = in.uv;
  // 13-tap Jimenez (COD 2014) — wide, stable, no small-source pulsing.
  let a = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>(-2.0,  2.0), 0.0).rgb;
  let b = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 0.0,  2.0), 0.0).rgb;
  let c = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 2.0,  2.0), 0.0).rgb;
  let d = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>(-2.0,  0.0), 0.0).rgb;
  let e = textureSampleLevel(srcTex, srcSamp, uv, 0.0).rgb;
  let f = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 2.0,  0.0), 0.0).rgb;
  let g = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>(-2.0, -2.0), 0.0).rgb;
  let h = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 0.0, -2.0), 0.0).rgb;
  let i = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 2.0, -2.0), 0.0).rgb;
  let j = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>(-1.0,  1.0), 0.0).rgb;
  let k = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 1.0,  1.0), 0.0).rgb;
  let l = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>(-1.0, -1.0), 0.0).rgb;
  let m = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 1.0, -1.0), 0.0).rgb;
  // The 13 taps form 5 overlapping quads (Jimenez): 4 corner quads at weight
  // 0.125 + the centre quad at 0.5 — identical totals to the old flat sum.
  let g0 = (a + b + d + e) * 0.25;
  let g1 = (b + c + e + f) * 0.25;
  let g2 = (d + e + g + h) * 0.25;
  let g3 = (e + f + h + i) * 0.25;
  let g4 = (j + k + l + m) * 0.25;
  var s : vec3<f32>;
  if (U.threshold > 0.0) {
    // FIRST mip: Karis partial luma weighting (GLX DOWN_FS parity) — weight
    // each quad by 1/(1+luma) and renormalise, so a sub-pixel HDR spike (the
    // bloom "firefly") can't dominate the downsample; uniform regions
    // renormalise back to the plain average (energy roughly preserved).
    let w0 = 0.125 / (1.0 + max(g0.r, max(g0.g, g0.b)));
    let w1 = 0.125 / (1.0 + max(g1.r, max(g1.g, g1.b)));
    let w2 = 0.125 / (1.0 + max(g2.r, max(g2.g, g2.b)));
    let w3 = 0.125 / (1.0 + max(g3.r, max(g3.g, g3.b)));
    let w4 = 0.5   / (1.0 + max(g4.r, max(g4.g, g4.b)));
    s = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4)
      / (w0 + w1 + w2 + w3 + w4);
    // Bright-pass gate with a quadratic soft knee (GLX BRIGHT_FS parity):
    // pixels ramp into the bloom as they approach the threshold instead of
    // popping their whole halo on in one frame.
    let lum  = max(max(s.r, s.g), s.b);
    let knee = U.threshold * 0.5 + 1e-4;
    var soft = clamp(lum - U.threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee);
    let bp = max(soft, lum - U.threshold) / max(lum, 1e-4);
    s = s * bp;
  } else {
    s = (g0 + g1 + g2 + g3) * 0.125 + g4 * 0.5;
  }
  return vec4<f32>(s, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 2. BLOOM_UP — 9-tap tent upsample. Port of GLX UP_FS js/render/shaders/post.js.
  //    Additive combine is done by the PIPELINE BLEND STATE (src ONE, dst ONE),
  //    NOT in the shader — the shader just outputs the tent-filtered sample so
  //    every octave accumulates into the next-larger mip. wgx.js MUST configure
  //    the additive blend on this pipeline's colour target.
  //
  //    BIND GROUP 0:
  //      @binding(0) srcTex  : texture_2d<f32>   the smaller (source) mip
  //      @binding(1) srcSamp : sampler           linear clamp
  //      @binding(2) U       : uniform  BloomUpU
  //    UNIFORM BloomUpU (16 B):
  //      texel  : vec2<f32>  off 0   (1/srcWidth, 1/srcHeight of the SOURCE mip)
  //      spread : f32        off 8   (tent radius scale; GLX BLOOM SPREAD, def 1.0)
  //      _pad   : f32        off 12
  // ════════════════════════════════════════════════════════════════════════
  const BLOOM_UP = `
struct BloomUpU {
  texel  : vec2<f32>,
  spread : f32,
  _pad   : f32,
};
@group(0) @binding(0) var srcTex  : texture_2d<f32>;
@group(0) @binding(1) var srcSamp : sampler;
@group(0) @binding(2) var<uniform> U : BloomUpU;
${fullscreenTri}
${POST_VS}
@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let t  = U.texel * U.spread;
  let uv = in.uv;
  var s = textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>(-1.0,  1.0), 0.0).rgb
        + textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 1.0,  1.0), 0.0).rgb
        + textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>(-1.0, -1.0), 0.0).rgb
        + textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 1.0, -1.0), 0.0).rgb
        + (textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 0.0,  1.0), 0.0).rgb
         + textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 0.0, -1.0), 0.0).rgb
         + textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>(-1.0,  0.0), 0.0).rgb
         + textureSampleLevel(srcTex, srcSamp, uv + t * vec2<f32>( 1.0,  0.0), 0.0).rgb) * 2.0
        + textureSampleLevel(srcTex, srcSamp, uv, 0.0).rgb * 4.0;
  return vec4<f32>(s / 16.0, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 3. SSAO — depth-based horizon AO + optional contact shadow.
  //    Port of GLX SSAO_FS js/render/shaders/post.js, reduced to 8 directional taps and
  //    a 5-step contact march (mobile). Reconstructs view position from depth,
  //    a normal from depth derivatives (dpdx/dpdy), then counts neighbour taps
  //    rising above the tangent plane. Output: AO in .r (1 = unoccluded).
  //
  //    BIND GROUP 0:
  //      @binding(0) depthTex : texture_depth_2d   scene depth (0..1)
  //      @binding(1) depthSamp: sampler            NON-filtering, clamp
  //      @binding(2) U        : uniform  SsaoU
  //    UNIFORM SsaoU (176 B):
  //      invProj : mat4x4<f32>  off   0   (clip[0..1 z] -> view)
  //      proj    : mat4x4<f32>  off  64   (view -> clip, for the contact march)
  //      sunVS   : vec4<f32>    off 128   (xyz sun dir in view space)
  //      p0      : vec4<f32>    off 144   (texel.x, texel.y, strength, contact)
  //      p1      : vec4<f32>    off 160   (radius, near, far, _pad)
  // ════════════════════════════════════════════════════════════════════════
  const SSAO = `
struct SsaoU {
  invProj : mat4x4<f32>,
  proj    : mat4x4<f32>,
  sunVS   : vec4<f32>,
  p0      : vec4<f32>,
  p1      : vec4<f32>,
};
@group(0) @binding(0) var depthTex  : texture_depth_2d;
@group(0) @binding(1) var depthSamp : sampler;
@group(0) @binding(2) var<uniform> U : SsaoU;
${fullscreenTri}
${POST_VS}

fn ssaoViewPos(uv : vec2<f32>) -> vec3<f32> {
  let d = textureSampleLevel(depthTex, depthSamp, uv, 0i);
  // Texture-space uv -> WebGPU NDC (y flip), depth already 0..1.
  let ndc = vec3<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, d);
  let v = U.invProj * vec4<f32>(ndc, 1.0);
  return v.xyz / v.w;
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let texel    = U.p0.xy;
  let strength = U.p0.z;
  let contact  = U.p0.w;
  let radius   = U.p1.x;

  // Derivatives (dpdx/dpdy) MUST run in uniform control flow, so compute the
  // view-space position + normal BEFORE the sky early-out (an early conditional
  // return makes everything after it non-uniform).
  let P = ssaoViewPos(in.uv);
  let N = normalize(cross(dpdx(P), dpdy(P)));
  let dCentre = textureSampleLevel(depthTex, depthSamp, in.uv, 0i);
  if (dCentre >= 0.99999) { return vec4<f32>(1.0); }   // sky: unoccluded
  // Screen-space radius shrinks with distance so world reach stays ~constant.
  let scr = clamp(radius / max(-P.z, 1.0) * 0.9, 0.004, 0.05);
  // Per-pixel rotation turns banding into noise (uses the frag coord).
  let ang = fract(sin(dot(in.pos.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 6.2832;
  let ca = cos(ang);
  let sa = sin(ang);

  var occ = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    // Even angular spread; the per-pixel rotation decorrelates neighbours.
    let ka = (f32(i) + 0.5) / 8.0 * 6.2832;
    let kb = vec2<f32>(cos(ka), sin(ka));
    let k  = vec2<f32>(kb.x * ca - kb.y * sa, kb.x * sa + kb.y * ca);
    let suv = clamp(in.uv + k * scr, vec2<f32>(0.001), vec2<f32>(0.999));
    let S = ssaoViewPos(suv);
    let V = S - P;
    let len = length(V);
    let ndv = max(dot(N, V / max(len, 1e-4)) - 0.10, 0.0);
    let range = smoothstep(radius, radius * 0.4, len);
    occ = occ + ndv * range;
  }
  var ao = 1.0 - clamp(occ / 8.0 * 2.4, 0.0, 1.0) * strength;

  // Contact shadows: short view-space march toward the sun sampling depth.
  if (contact > 0.0 && U.sunVS.z < 0.0) {
    var sh = 1.0;
    for (var s = 1; s <= 5; s = s + 1) {
      let q  = P + U.sunVS.xyz * (0.04 * f32(s));   // up to ~0.32 m toward the sun
      let cp = U.proj * vec4<f32>(q, 1.0);
      let quv = cp.xy / cp.w * 0.5 + 0.5;
      if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) { break; }
      // proj gives NDC (y-up); flip to texture space to sample the scene depth.
      let quvT = vec2<f32>(quv.x, 1.0 - quv.y);
      let sz = ssaoViewPos(quvT).z;
      let dz = sz - q.z;
      if (dz > 0.015 && dz < 0.5) { sh = 1.0 - contact; break; }
    }
    ao = ao * sh;
  }
  return vec4<f32>(vec3<f32>(ao), 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 3b. BLUR — separable 5-tap gaussian (GLX BLUR_FS).
  //    SSAO: one H then V pass. God-ray: H+V twice with growing radius so the
  //    world-march slices soften into volumes instead of thin stripes.
  //
  //    BIND GROUP 0:
  //      @binding(0) srcTex  : texture_2d<f32>
  //      @binding(1) srcSamp : sampler           linear clamp
  //      @binding(2) U       : uniform  BlurU
  //    UNIFORM BlurU (16 B):
  //      dir : vec2<f32>  off 0   (texel * axis, e.g. (1/w, 0) or (0, 1/h))
  //      _pad: vec2<f32>  off 8
  // ════════════════════════════════════════════════════════════════════════
  const BLUR = `
struct BlurU { dir : vec4<f32> };
@group(0) @binding(0) var srcTex  : texture_2d<f32>;
@group(0) @binding(1) var srcSamp : sampler;
@group(0) @binding(2) var<uniform> U : BlurU;
${fullscreenTri}
${POST_VS}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let d = U.dir.xy;
  let o1 = d * 1.3846153846;
  let o2 = d * 3.2307692308;
  var s = textureSampleLevel(srcTex, srcSamp, in.uv, 0.0).rgb * 0.2270270270;
  s = s + textureSampleLevel(srcTex, srcSamp, in.uv + o1, 0.0).rgb * 0.3162162162;
  s = s + textureSampleLevel(srcTex, srcSamp, in.uv - o1, 0.0).rgb * 0.3162162162;
  s = s + textureSampleLevel(srcTex, srcSamp, in.uv + o2, 0.0).rgb * 0.0702702703;
  s = s + textureSampleLevel(srcTex, srcSamp, in.uv - o2, 0.0).rgb * 0.0702702703;
  return vec4<f32>(s, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 4. GODRAY — world-space 16-step march through scene depth + sun/lamp
  //    shadow maps (GLX GODRAY_FS). Composite adds the result. CPU gates on
  //    sun-on-screen or lampVol > 0. A separable BLUR follows the march.
  // ════════════════════════════════════════════════════════════════════════
  const GODRAY = `
struct GodrayU {
  invVP    : mat4x4<f32>,   // off   0
  lightVP  : mat4x4<f32>,   // off  64
  lampVP   : mat4x4<f32>,   // off 128
  eye      : vec4<f32>,     // off 192
  sunDir   : vec4<f32>,     // off 208
  sunColor : vec4<f32>,     // off 224
  p0       : vec4<f32>,     // off 240  (str, lampStr, mist, time)
  p1       : vec4<f32>,     // off 256  (cloudCover, cloudSpeed, hgAniso, hgFloor)
  p2       : vec4<f32>,     // off 272  (numLights, lampShadowIdx, 0, 0)
};
struct GRLight {
  posRad   : vec4<f32>,
  colBleed : vec4<f32>,
  dirVol   : vec4<f32>,
  cone     : vec4<f32>,
};
@group(0) @binding(0) var depthTex : texture_depth_2d;
@group(0) @binding(1) var depthSamp : sampler;
@group(0) @binding(2) var shadowTex : texture_depth_2d;
@group(0) @binding(3) var shadowSamp : sampler_comparison;
@group(0) @binding(4) var lampShadowTex : texture_depth_2d;
@group(0) @binding(5) var<uniform> U : GodrayU;
@group(0) @binding(6) var<storage, read> lights : array<GRLight, 32>;
${fullscreenTri}
${POST_VS}
fn grHash21(p_in: vec2<f32>) -> f32 {
  var p = fract(p_in * vec2<f32>(123.34, 456.21));
  p = p + dot(p, p + 45.32);
  return fract(p.x * p.y);
}
fn grNoise(p_in: vec2<f32>) -> f32 {
  let i = floor(p_in);
  var f = fract(p_in);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grHash21(i), grHash21(i + vec2<f32>(1.0, 0.0)), f.x),
             mix(grHash21(i + vec2<f32>(0.0, 1.0)), grHash21(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
fn grCloudFBM(p_in: vec2<f32>) -> f32 {
  var p = p_in; var s = 0.0; var a = 0.5;
  for (var i = 0; i < 3; i = i + 1) { s = s + a * grNoise(p); p = p * 2.03 + 1.7; a = a * 0.5; }
  return s;
}
fn grCloud(wp: vec3<f32>) -> f32 {
  if (U.p1.x <= 0.001 || U.sunDir.y <= 0.06) { return 0.0; }
  let t = (360.0 - wp.y) / max(U.sunDir.y, 0.15);
  let cT = U.p0.w * U.p1.y;
  let cp = (wp.xz + U.sunDir.xz * t) * 0.0052 + vec2<f32>(cT * 0.012, cT * 0.005);
  return smoothstep(0.54 - U.p1.x * 0.40, 0.92, grCloudFBM(cp)) * U.p1.x;
}
fn worldPos(uv: vec2<f32>, d: f32) -> vec3<f32> {
  let c = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, d, 1.0);
  let w = U.invVP * c;
  return w.xyz / w.w;
}
@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let d = textureSampleLevel(depthTex, depthSamp, in.uv, 0.0);
  let viewDir = normalize(worldPos(in.uv, 0.5) - U.eye.xyz);
  let endP = select(worldPos(in.uv, d), U.eye.xyz + viewDir * 400.0, d >= 0.99999);
  let ro = U.eye.xyz;
  var rd = endP - ro;
  let dist = length(rd);
  rd = rd / max(dist, 1e-4);
  let march = min(dist, 260.0);
  let N = 16;
  let stepLen = march / 16.0;
  let ign = fract(52.9829189 * fract(dot(in.pos.xy, vec2<f32>(0.06711056, 0.00583715))));
  let t0 = stepLen * ign;
  var accum = 0.0;
  var lampAccum = vec3<f32>(0.0);
  var trans = 1.0;
  let groundY = U.eye.y - 4.0;
  let uStr = U.p0.x;
  let uLampStr = U.p0.y;
  let nL = i32(U.p2.x);
  let lampIdx = i32(U.p2.y);
  for (var i = 0; i < N; i = i + 1) {
    let td = t0 + stepLen * f32(i);
    let p = ro + rd * td;
    trans = trans * exp(-stepLen * 0.010);
    if (uStr > 0.0) {
      let hSun = exp(-max(p.y - groundY, 0.0) * 0.03);
      let lc = U.lightVP * vec4<f32>(p, 1.0);
      let sc = lc.xyz / lc.w;
      let suv = vec2<f32>(sc.x * 0.5 + 0.5, 0.5 - sc.y * 0.5);
      var lit = 1.0;
      if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0 && sc.z < 1.0) {
        lit = textureSampleCompareLevel(shadowTex, shadowSamp, suv, sc.z - 0.002);
      }
      lit = lit * (1.0 - grCloud(p) * 0.62);
      accum = accum + lit * hSun * trans;
    }
    if (uLampStr > 0.0 && td < 200.0) {
      let hLamp = exp(-max(p.y - groundY, 0.0) * 0.07);
      for (var li = 0; li < 6; li = li + 1) {
        if (li >= nL) { break; }
        let LP = lights[li].posRad.xyz - p;
        let rad = lights[li].posRad.w;
        let ld2 = dot(LP, LP);
        if (ld2 > rad * rad) { continue; }
        let ld = sqrt(ld2);
        let Ld = LP / max(ld, 1e-3);
        let sn = ld / rad;
        let win = clamp(1.0 - sn * sn * sn * sn, 0.0, 1.0);
        let att = win * win / (ld * ld + 1.0);
        let cd = dot(-Ld, lights[li].dirVol.xyz);
        let spot = smoothstep(lights[li].cone.y, lights[li].cone.x, cd);
        let cosL = max(dot(rd, Ld), 0.0);
        let hgLd = 1.36 - 1.2 * cosL;
        let hgL = 0.64 / (hgLd * sqrt(hgLd));
        var lampLit = 1.0;
        if (li == lampIdx) {
          let lq = U.lampVP * vec4<f32>(p, 1.0);
          if (lq.w > 0.0) {
            let lqs = lq.xyz / lq.w;
            let luv = vec2<f32>(lqs.x * 0.5 + 0.5, 0.5 - lqs.y * 0.5);
            if (luv.x > 0.002 && luv.x < 0.998 && luv.y > 0.002 && luv.y < 0.998 && lqs.z < 1.0) {
              lampLit = textureSampleCompareLevel(lampShadowTex, shadowSamp, luv, lqs.z - 0.004);
            }
          }
        }
        lampAccum = lampAccum + lights[li].colBleed.xyz * (att * spot * (0.12 + hgL * 0.14) * lampLit)
                    * lights[li].dirVol.w * hLamp * trans;
      }
    }
  }
  accum = accum / 16.0;
  lampAccum = lampAccum * U.p0.z * uLampStr * 2.0 / 16.0;
  let cosT = max(dot(rd, U.sunDir.xyz), 0.0);
  let g = clamp(U.p1.z, 0.0, 0.95);
  let hgD = 1.0 + g * g - 2.0 * g * cosT;
  let hg = (1.0 - g * g) / (hgD * sqrt(hgD));
  let phase = hg * 0.16 + U.p1.w;
  return vec4<f32>(U.sunColor.xyz * accum * phase * uStr + lampAccum, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 5. COMPOSITE — final resolve to LDR.
  //    Port of GLX COMPOSITE_FS (js/render/shaders/post.js COMPOSITE_FS), reduced: scene * SSAO,
  //    + godray, * exposure, + bloom (tone-masked), ACES tonemap (shared leaf),
  //    lift-gamma-gain colour grade (contrast / vibrance / saturation / tint /
  //    split-tone shadow+hi / black-lift), soft lens-flare + ghosts, vignette,
  //    dither, film grain, chromatic aberration, radial speed blur and sharpen.
  //    SSR is implemented as the separate pass documented above.
  //
  //    BIND GROUP 0:
  //      @binding(0) sceneTex  : texture_2d<f32>   scene HDR (full-res)
  //      @binding(1) bloomTex  : texture_2d<f32>   bloom result (mip0)
  //      @binding(2) ssaoTex   : texture_2d<f32>   AO (.r, 1 = unoccluded)
  //      @binding(3) godrayTex : texture_2d<f32>   additive shafts
  //      @binding(4) samp      : sampler           linear clamp (all four)
  //      @binding(5) U         : uniform  CompositeU
  //    UNIFORM CompositeU (256 B):
  //      p0          : vec4<f32>  off   0   (exposure, bloomAmt, sunShaft, flareStr)
  //      sunUV       : vec4<f32>  off  16   (sunUV.x, sunUV.y, whitePoint, blackLift)
  //      grade       : vec4<f32>  off  32   (contrast, vibrance, saturation, tint)
  //      fx          : vec4<f32>  off  48   (vignette, grain, time, _pad)
  //      gradeShadow : vec4<f32>  off  64   (xyz split-tone shadow tint, w gradeStr)
  //      gradeHi     : vec4<f32>  off  80   (xyz split-tone highlight tint, w _pad)
  //      texel       : vec4<f32>  off  96   (1/w, 1/h, _pad, _pad) — also the
  //                                          sharpen unsharp-blur tap offset
  //      imgFx       : vec4<f32>  off 112   (chromAb, sharpen, speedBlur, bloomKnee)
  //                                          NEW Phase-4b image FX. Each 0 = no-op:
  //                                          chromAb  = radial R/B split amount
  //                                          sharpen  = unsharp-mask crispness
  //                                          speedBlur= radial centre->edge smear
  //                                                     (GLX folds car speed in)
  //      tuneFx      : vec4<f32>  off 128   (vignetteSoft, flareStreak2, acesE, flareStreak)
  //      tone0       : vec4<f32>  off 144   (blacks, shadows, midtones, highlights)
  //      tone1       : vec4<f32>  off 160   (whites, toe, shoulder, _pad)
  //      lift        : vec4<f32>  off 176   (RGB lift, _pad)
  //      gamma       : vec4<f32>  off 192   (RGB gamma, _pad)
  //      gain        : vec4<f32>  off 208   (RGB gain, _pad)
  //      aces        : vec4<f32>  off 224   (acesA, acesB, acesC, acesD) — ACES
  //                                          TONE CURVE knobs; defaults 2.51/0.03/
  //                                          2.43/0.59 (+ acesE 0.14 in tuneFx.z)
  //      dirtFx      : vec4<f32>  off 240   (lensDirt, hazeU, hazeV, hazeStr) —
  //                                          LENS DIRT veil + heat-haze UV/str;
  //                                          samples binding(6) dirtTex grime map
  //    NOTE: sunShaft (p0.z) here is an extra scalar multiplier on the godray
  //    contribution; the godray strength itself lives in the GODRAY uniform.
  // ════════════════════════════════════════════════════════════════════════
  const COMPOSITE = `
struct CompositeU {
  p0          : vec4<f32>,
  sunUV       : vec4<f32>,
  grade       : vec4<f32>,
  fx          : vec4<f32>,
  gradeShadow : vec4<f32>,
  gradeHi     : vec4<f32>,
  texel       : vec4<f32>,
  imgFx       : vec4<f32>,
  tuneFx      : vec4<f32>,
  tone0       : vec4<f32>,
  tone1       : vec4<f32>,
  lift        : vec4<f32>,
  gamma       : vec4<f32>,
  gain        : vec4<f32>,
  aces        : vec4<f32>,
  dirtFx      : vec4<f32>,     // off 240   (lensDirt, hazeUV.x, hazeUV.y, hazeStr)
};
@group(0) @binding(0) var sceneTex  : texture_2d<f32>;
@group(0) @binding(1) var bloomTex  : texture_2d<f32>;
@group(0) @binding(2) var ssaoTex   : texture_2d<f32>;
@group(0) @binding(3) var godrayTex : texture_2d<f32>;
@group(0) @binding(4) var samp      : sampler;
@group(0) @binding(5) var<uniform> U : CompositeU;
@group(0) @binding(6) var dirtTex   : texture_2d<f32>;   // LENS DIRT grime map (linear clamp via samp)
${fullscreenTri}
${tonemap}
${POST_VS}

struct GradeZoneWeights {
  tone0 : vec4<f32>,
  white : f32,
};

// Five overlapping exposure masks in log2 stops around 18% middle grey.
fn gradeZoneWeights(y : f32) -> GradeZoneWeights {
  let z = log2(max(y, 1e-6) / 0.18);
  var w : GradeZoneWeights;
  // ACES compresses roughly the bottom four linear stops into the first few
  // display values. Wider low-end masks keep BLACKS and SHADOWS visible after
  // that compression instead of letting the later black-floor clamp erase them.
  w.tone0.x = 1.0 - smoothstep(-4.0, -0.75, z);
  w.tone0.y = smoothstep(-4.0, -1.5, z) * (1.0 - smoothstep(-1.0, 0.75, z));
  w.tone0.z = smoothstep(-2.5, -0.5, z) * (1.0 - smoothstep(0.5, 2.5, z));
  w.tone0.w = smoothstep(0.0, 1.5, z) * (1.0 - smoothstep(3.0, 5.0, z));
  w.white = smoothstep(2.5, 5.0, z);
  return w;
}

// Monotonic power curves pivoted at middle grey. RGB rescaling preserves hue.
fn applyToeShoulder(c_in : vec3<f32>, toe : f32, shoulder : f32) -> vec3<f32> {
  let c = max(c_in, vec3<f32>(0.0));
  let oldY = max(dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)), 1e-6);
  var exponent = exp2(clamp(-shoulder, -1.0, 1.0));
  if (oldY < 0.18) {
    exponent = exp2(clamp(toe, -1.0, 1.0));
  }
  let newY = 0.18 * pow(oldY / 0.18, exponent);
  return c * (newY / max(oldY, 1e-6));
}

fn applyHdrGrade(c_in : vec3<f32>) -> vec3<f32> {
  var c = U.lift.xyz
    + (max(U.gain.xyz, vec3<f32>(1e-3)) - U.lift.xyz)
    * pow(max(c_in, vec3<f32>(0.0)), 1.0 / max(U.gamma.xyz, vec3<f32>(1e-3)));

  let y = max(dot(max(c, vec3<f32>(0.0)), vec3<f32>(0.2126, 0.7152, 0.0722)), 1e-6);
  let weights = gradeZoneWeights(y);
  // Wider stop swing for the two dark zones (blacks x3, shadows x2): a plain
  // +/-1 stop multiply barely moves the low end after ACES compression, so
  // SHADOWS looked weak. Neutral (0) stays an exact identity. Mirrors GLX.
  let toneGain = U.tone0 * vec4<f32>(3.0, 2.0, 1.0, 1.0);
  let stops = dot(weights.tone0, toneGain) + weights.white * U.tone1.x;
  c = c * exp2(clamp(stops, -4.0, 4.0));
  // Additive low-end offset: a multiply can never move a near-black pixel
  // (x*0 stays 0), which is why BLACKS "did nothing" on dark scenes. A small
  // signed lift weighted to the black/shadow zones reveals near-black detail
  // (+) or crushes it to true black (-). Neutral adds nothing. Mirrors GLX.
  c = c + vec3<f32>(weights.tone0.x * U.tone0.x * 0.05 + weights.tone0.y * U.tone0.y * 0.025);
  c = max(c, vec3<f32>(0.0));

  c = applyToeShoulder(c, U.tone1.y, U.tone1.z);
  return max(c, vec3<f32>(0.0));
}

// Lift-gamma-gain colour grade (GLX colourGrade, js/render/shaders/post.js COMPOSITE_FS), reduced.
fn colourGrade(c_in : vec3<f32>) -> vec3<f32> {
  var c = c_in;
  let contrast   = U.grade.x;
  let vibrance   = U.grade.y;
  let saturation = U.grade.z;
  let tint       = U.grade.w;
  let gradeStr   = U.gradeShadow.w;
  let blackLift  = U.sunUV.w;
  let LUMA = vec3<f32>(0.299, 0.587, 0.114);

  c = c * vec3<f32>(1.015, 1.008, 0.992);                 // gain
  c = c * (1.0 + c * 0.13) / (1.0 + c * 0.20);            // soft S-curve
  c = pow(max(c, vec3<f32>(0.0)), vec3<f32>(contrast));   // midtone contrast
  // Vibrance: pull dull pixels toward colour more than vivid ones.
  let luma = dot(c, LUMA);
  let mx = max(max(c.r, c.g), c.b);
  let mn = min(min(c.r, c.g), c.b);
  let sat = mx - mn;
  c = mix(vec3<f32>(luma), c, 1.0 + (1.0 - clamp(sat * 1.5, 0.0, 1.0)) * vibrance);
  // Global saturation.
  c = mix(vec3<f32>(dot(c, LUMA)), c, saturation);
  // White-balance tint (warm/cool).
  c = c * vec3<f32>(1.0 + 0.07 * tint, 1.0, 1.0 - 0.07 * tint);
  // Cinematic split-tone (shadows vs highlights); gradeStr 0 = neutral.
  let gl2 = dot(c, LUMA);
  let toneTint = mix(U.gradeShadow.xyz, U.gradeHi.xyz, smoothstep(0.0, 0.85, gl2));
  c = mix(c, c * toneTint, gradeStr);
  // Raised (slightly warm) black floor.
  c = max(c, vec3<f32>(blackLift, blackLift * 0.8, blackLift * 0.6));
  return c;
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let exposure   = U.p0.x;
  let bloomAmt   = U.p0.y;
  let sunShaft   = U.p0.z;
  let flareStr   = U.p0.w;
  let sunUV      = U.sunUV.xy;
  let whitePoint = U.sunUV.z;
  let vignette   = U.fx.x;
  let grain      = U.fx.y;
  let chromAb    = U.imgFx.x;
  let sharpen    = U.imgFx.y;
  let speedBlur  = U.imgFx.z;
  let bloomKnee  = U.imgFx.w;
  let vignetteSoft = U.tuneFx.x;
  // FLARE CORE STREAK knob (U.tuneFx.y; GLX parity, def 0.5). Read directly — 0 is
  // a valid "single-streak flare", so the uploader always packs the resolved value.
  let flareStreak2 = U.tuneFx.y;
  // FLARE STREAK width (U.tuneFx.w; GLX parity, def 7.0). The main anamorphic
  // streak's horizontal tightness — the uploader packs the resolved value; the
  // default reproduces the literal 7.0 this pass used before, so byte-identical.
  let flareStreak = U.tuneFx.w;
  // LENS DIRT knob (U.dirtFx.x; GLX parity, def 0.15). Grime on the lens scatters
  // bright energy into a smudgy veil + breaks the clean flare into blotches. Read
  // directly — 0 is a valid "clean lens", so the uploader always packs the value.
  let lensDirt = U.dirtFx.x;
  let hazeStr  = U.dirtFx.w;
  let texel      = U.texel.xy;

  var sceneUV = in.uv;
  if (hazeStr > 0.002) {
    let hd = (in.uv - U.dirtFx.yz - vec2<f32>(0.0, 0.08)) * vec2<f32>(3.2, 1.0);
    let hm = exp(-dot(hd, hd) * 70.0) * hazeStr;
    if (hm > 0.003) {
      let carHere = 1.0 - smoothstep(0.42, 0.55, textureSampleLevel(sceneTex, samp, in.uv, 0.0).a);
      if (carHere < 0.25) {
        let hp = in.uv.y * 90.0 - U.fx.z * 11.0;
        sceneUV = in.uv + vec2<f32>(sin(hp + in.uv.x * 70.0), cos(hp * 0.63)) * (0.0075 * hm);
      }
    }
  }
  var c = textureSampleLevel(sceneTex, samp, sceneUV, 0.0).rgb;
  let caDir = in.uv - vec2<f32>(0.5);

  // CHROMATIC ABERRATION (GLX js/render/shaders/post.js COMPOSITE_FS): split R/B channels radially, the
  // fringe growing quadratically toward the frame corners (lens dispersion).
  // 0 = off. textureSampleLevel (explicit LOD) is legal in non-uniform flow.
  if (chromAb > 0.001) {
    let caAmt = chromAb * 0.004 * dot(caDir, caDir);
    c.r = textureSampleLevel(sceneTex, samp, in.uv + caDir * caAmt, 0.0).r;
    c.b = textureSampleLevel(sceneTex, samp, in.uv - caDir * caAmt, 0.0).b;
  }

  // SPEED BLUR (GLX js/render/shaders/post.js COMPOSITE_FS): radial smear from the frame centre outward,
  // scaled by the scalar (GLX folds car velocity into it). 4 taps toward centre.
  if (speedBlur > 0.001) {
    var acc = c;
    var wsum = 1.0;
    for (var i = 1; i <= 4; i = i + 1) {
      let tt = f32(i) / 4.0 * speedBlur * 0.05;
      acc = acc + textureSampleLevel(sceneTex, samp, in.uv - caDir * tt, 0.0).rgb;
      wsum = wsum + 1.0;
    }
    c = acc / wsum;
  }

  // SHARPEN (GLX js/render/shaders/post.js COMPOSITE_FS): unsharp mask vs a 4-tap neighbour blur (uses
  // U.texel for the tap offset). Recovers kerb/wire crispness FXAA softens.
  if (sharpen > 0.001) {
    let bl = (textureSampleLevel(sceneTex, samp, in.uv + vec2<f32>(texel.x, 0.0), 0.0).rgb
            + textureSampleLevel(sceneTex, samp, in.uv - vec2<f32>(texel.x, 0.0), 0.0).rgb
            + textureSampleLevel(sceneTex, samp, in.uv + vec2<f32>(0.0, texel.y), 0.0).rgb
            + textureSampleLevel(sceneTex, samp, in.uv - vec2<f32>(0.0, texel.y), 0.0).rgb) * 0.25;
    c = c + (c - bl) * sharpen * 0.9;
  }

  // Ambient occlusion (multiply in linear light; 1 = no change).
  c = c * textureSampleLevel(ssaoTex, samp, in.uv, 0.0).r;

  // Volumetric shafts (additive), scaled by the composite sun-shaft gate.
  c = c + textureSampleLevel(godrayTex, samp, in.uv, 0.0).rgb * max(sunShaft, 0.0);

  // Exposure before tonemap.
  c = c * exposure;

  // Bloom: tone-aware mask so already-bright pixels don't over-wash.
  let bloomSample = textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb;
  let bloomMask = 1.0 - clamp(max(c.r, max(c.g, c.b)) - 0.7, 0.0, 0.3) / 0.3 * bloomKnee;
  // Scale by exposure to match the scene (parity with GLX): the bright-pass is
  // pre-exposure, but the scene above is already * exposure — so a driven
  // exposure would otherwise leave the halos over-strong.
  c = c + bloomSample * bloomAmt * bloomMask * exposure;

  // LENS DIRT veil (GLX js/render/shaders/post.js): grime on the lens
  // scatters incoming light into a smudgy film. Driven by the blurred bright-pass
  // (bloomSample), so it only appears where the frame carries bright energy (sun,
  // floodlights, neon) — a dark scene stays clean. The dirt value is reused by the
  // flare modulation below (declared here so it stays in scope).
  var dirt = 0.0;
  if (lensDirt > 0.001) {
    dirt = textureSampleLevel(dirtTex, samp, in.uv, 0.0).r;
    c = c + bloomSample * exposure * dirt * lensDirt * 2.2;
  }

  // Professional HDR grade runs after linear-light composition and before ACES.
  c = applyHdrGrade(c);

  // Filmic tonemap (shared leaf) + colour grade. White point scales the knee.
  // ACES TONE CURVE knobs (aces.xyzw = a,b,c,d; tuneFx.z = e). Defaults reproduce
  // the shipped Narkowicz coefficients; the JS uploader always packs them.
  c = acesTonemap(c / max(whitePoint, 1e-3), U.aces.x, U.aces.y, U.aces.z, U.aces.w, U.tuneFx.z);
  c = colourGrade(c);

  // Lens flare: anamorphic streak + ghost circles (GLX js/render/shaders/post.js COMPOSITE_FS).
  if (flareStr > 0.0 && sunUV.x >= 0.0 && sunUV.x <= 1.0 &&
      sunUV.y >= 0.0 && sunUV.y <= 1.0) {
    var flare = vec3<f32>(0.0);
    let streakY = exp(-abs(in.uv.y - sunUV.y) * 110.0);
    let streakX = exp(-abs(in.uv.x - sunUV.x) * flareStreak);
    flare = flare + vec3<f32>(1.0, 0.80, 0.52) * streakY * streakX * 0.75;
    let streakX2 = exp(-abs(in.uv.x - sunUV.x) * 10.0);
    flare = flare + vec3<f32>(1.0, 0.92, 0.78) * exp(-abs(in.uv.y - sunUV.y) * 320.0) * streakX2 * flareStreak2;
    let toCenter = vec2<f32>(0.5) - sunUV;
    let d0 = length(in.uv - (sunUV + toCenter * 0.5));
    flare = flare + vec3<f32>(1.0, 0.88, 0.65) * smoothstep(0.055, 0.020, d0) * 0.35;
    let d1 = length(in.uv - (sunUV + toCenter * 1.3));
    flare = flare + vec3<f32>(0.70, 0.60, 1.00) * smoothstep(0.038, 0.012, d1) * 0.25;
    let d2 = length(in.uv - (sunUV + toCenter * 1.8));
    flare = flare + vec3<f32>(0.50, 1.00, 0.70) * smoothstep(0.028, 0.008, d2) * 0.18;
    flare = flare * flareStr;
    // LENS DIRT breaks the clean procedural flare into a blotchy, smudged one —
    // bright spots where grime catches the glare, dimmer in the clean patches
    // (GLX js/render/shaders/post.js). Reuses the dirt sample from the veil.
    if (lensDirt > 0.001) {
      flare = flare * mix(vec3<f32>(1.0), vec3<f32>(0.35 + dirt * 2.2), clamp(lensDirt * 2.0, 0.0, 0.85));
    }
    flare = flare / (1.0 + flare * 0.6);
    c = c + flare;
  }

  // Vignette — aspect-corrected (parity with GLX) so it's circular in screen
  // space, not an ellipse over-darkening top/bottom on a wide viewport. texel =
  // (1/width,1/height), so texel.y/texel.x = aspect; renormalise the corner to
  // the tuned 0.707 radius (identity at 1:1).
  var q = in.uv - vec2<f32>(0.5);
  let vAspect = select(1.0, texel.y / texel.x, texel.x > 0.0);
  q.x = q.x * vAspect;
  let vr = length(q) * 0.70710678 / length(vec2<f32>(0.5 * vAspect, 0.5));
  let vig = smoothstep(0.95, min(vignetteSoft, 0.94), vr);
  c = c * mix(vignette, 1.0, vig);

  // Triangular-PDF dither (breaks 8-bit banding in sky/fog gradients).
  // Interleaved-gradient hashes on pixel coords, stepped per frame by the
  // golden-ratio IGN offset (GLX COMPOSITE parity) — animated noise, not a
  // frozen speckle welded to the panel.
  let dhc = in.pos.xy + 5.588238 * (floor(U.fx.z * 60.0) % 64.0);
  let dh0 = fract(52.9829189 * fract(dot(dhc, vec2<f32>(0.06711056, 0.00583715))));
  let dh1 = fract(52.9829189 * fract(dot(dhc + 17.31, vec2<f32>(0.00583715, 0.06711056))));
  c = c + vec3<f32>((dh0 + dh1 - 1.0) / 255.0);

  // Film grain: luma-weighted (mids grain most). 0 = off. Animated per frame via
  // U.fx.z (time) so it isn't a frozen speckle welded to the panel (parity with
  // GLX) — the time offset re-randomises the hash each frame.
  if (grain > 0.001) {
    let gTime = U.fx.z;
    let gUV = in.uv + vec2<f32>(fract(gTime * 1.37), fract(gTime * 0.61)) * 3.17;
    let gn = fract(sin(dot(gUV, vec2<f32>(93.9898, 47.233))) * 61237.312) - 0.5;
    let gLuma = dot(c, vec3<f32>(0.299, 0.587, 0.114));
    c = c + vec3<f32>(gn * grain * (1.0 - abs(gLuma - 0.5) * 1.4));
  }

  return vec4<f32>(c, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 6. FXAA — Timothy Lottes compact edge AA. Port of GLX FXAA_FS (js/render/shaders/post.js COMPOSITE_FS).
  //    Runs LAST on the tonemapped LDR image, straight to the swapchain.
  //
  //    BIND GROUP 0:
  //      @binding(0) srcTex  : texture_2d<f32>   LDR composite result
  //      @binding(1) srcSamp : sampler           linear clamp
  //      @binding(2) U       : uniform  FxaaU
  //    UNIFORM FxaaU (16 B):
  //      texel : vec2<f32>  off 0   (1/width, 1/height)
  //      _pad  : vec2<f32>  off 8
  // ════════════════════════════════════════════════════════════════════════
  const FXAA = `
struct FxaaU {
  texel : vec2<f32>,
  _pad  : vec2<f32>,
};
@group(0) @binding(0) var srcTex  : texture_2d<f32>;
@group(0) @binding(1) var srcSamp : sampler;
@group(0) @binding(2) var<uniform> U : FxaaU;
${fullscreenTri}
${POST_VS}

fn fxLuma(c : vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.299, 0.587, 0.114)); }

@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let t  = U.texel;
  let uv = in.uv;
  let cM  = textureSampleLevel(srcTex, srcSamp, uv, 0.0).rgb;
  let lM  = fxLuma(cM);
  let lNW = fxLuma(textureSampleLevel(srcTex, srcSamp, uv + vec2<f32>(-t.x, -t.y), 0.0).rgb);
  let lNE = fxLuma(textureSampleLevel(srcTex, srcSamp, uv + vec2<f32>( t.x, -t.y), 0.0).rgb);
  let lSW = fxLuma(textureSampleLevel(srcTex, srcSamp, uv + vec2<f32>(-t.x,  t.y), 0.0).rgb);
  let lSE = fxLuma(textureSampleLevel(srcTex, srcSamp, uv + vec2<f32>( t.x,  t.y), 0.0).rgb);
  let lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  let lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // Flat areas (incl. HUD/text) stay pixel-exact.
  if (lMax - lMin < max(0.04, lMax * 0.125)) { return vec4<f32>(cM, 1.0); }
  var dir = vec2<f32>(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  let dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  let rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcp, vec2<f32>(-8.0), vec2<f32>(8.0)) * t;
  let rA = 0.5 * (textureSampleLevel(srcTex, srcSamp, uv + dir * (-1.0 / 6.0), 0.0).rgb
                + textureSampleLevel(srcTex, srcSamp, uv + dir * ( 1.0 / 6.0), 0.0).rgb);
  let rB = rA * 0.5 + 0.25 * (textureSampleLevel(srcTex, srcSamp, uv + dir * -0.5, 0.0).rgb
                            + textureSampleLevel(srcTex, srcSamp, uv + dir *  0.5, 0.0).rgb);
  let lB = fxLuma(rB);
  if (lB < lMin || lB > lMax) { return vec4<f32>(rA, 1.0); }
  return vec4<f32>(rB, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 7. SSR — wet-road screen-space reflection (its own full-res pass).
  //    Port of the GLX COMPOSITE_FS wet-road SSR block (js/render/shaders/post.js COMPOSITE_FS),
  //    reduced for mobile: the road path only (the GLX .a car-paint tag branch
  //    is dropped), a SHORT 12-step reflected-ray march + 4-step binary refine.
  //    Reconstructs view position from depth, a view-space normal from depth
  //    finite differences (NOT dpdx/dpdy — safe past the early sky/road-mask
  //    returns), masks to up-facing foreground road, marches the reflected view
  //    ray R = reflect(-V, N) through the depth buffer and samples the already-
  //    lit scene HDR at the hit. Bright HDR hits are soft-clipped so a floodlight
  //    lens can't blow the mirror white; a march MISS falls back to a dim night
  //    sky-glow (a wet road always mirrors something).
  //
  //    OUTPUT (rgba16float reflection buffer):
  //      .rgb = soft-clipped reflected HDR colour
  //      .a   = mix amount in [0, 0.94] (roadMask * strength * fresnel * cover,
  //             seam-faded at the upper cutoff). 0 = leave the surface untouched.
  //    CONSUMER CONTRACT (COMPOSITE or the LIT pass, per wgx wiring):
  //      let r = textureSampleLevel(ssrTex, samp, uv, 0.0);
  //      c = mix(c, c * 0.10 + r.rgb * 0.92, r.a);   // darker-mirror substitution
  //    i.e. .a already folds every gate; the consumer just lerps toward a mostly
  //    reflected colour that keeps a whisper (10%) of the base tarmac.
  //
  //    BIND GROUP 0:
  //      @binding(0) sceneTex  : texture_2d<f32>    scene HDR (full-res)
  //      @binding(1) depthTex  : texture_depth_2d   scene depth (0..1)
  //      @binding(2) sceneSamp : sampler            LINEAR clamp (scene colour)
  //      @binding(3) depthSamp : sampler            NON-filtering clamp (depth)
  //      @binding(4) U         : uniform  SsrU
  //    UNIFORM SsrU (192 B):
  //      invProj   : mat4x4<f32>  off   0   (clip[0..1 z] -> view; WebGPU-convention)
  //      proj      : mat4x4<f32>  off  64   (view -> clip; projects the marched ray)
  //      upVS      : vec4<f32>    off 128   (xyz world-up in view space, w unused)
  //      p0        : vec4<f32>    off 144   (texel.x, texel.y, ssrThick, strength)
  //                                          ssrThick = depth-tolerance gate (GLX
  //                                          uSsrThick, def 0.20); strength folds
  //                                          the wet-road SSR amount (GLX uReflect
  //                                          * wetness) — 0 disables the pass.
  //      reflSkyLo : vec4<f32>    off 160   (xyz zenith sky-glow miss fallback,
  //                                          w = upper-screen cutoff, GLX 0.62)
  //      reflSkyHi : vec4<f32>    off 176   (xyz horizon sky-glow miss fallback, w _pad)
  // ════════════════════════════════════════════════════════════════════════
  const SSR = `
struct SsrU {
  invProj   : mat4x4<f32>,
  proj      : mat4x4<f32>,
  upVS      : vec4<f32>,
  p0        : vec4<f32>,
  reflSkyLo : vec4<f32>,
  reflSkyHi : vec4<f32>,
};
@group(0) @binding(0) var sceneTex  : texture_2d<f32>;
@group(0) @binding(1) var depthTex  : texture_depth_2d;
@group(0) @binding(2) var sceneSamp : sampler;
@group(0) @binding(3) var depthSamp : sampler;
@group(0) @binding(4) var<uniform> U : SsrU;
${fullscreenTri}
${POST_VS}

// Reconstruct view-space position from the depth buffer at a texture-space uv.
// Depth is already 0..1 in WebGPU (no *2-1 window->NDC remap); integer LOD 0i +
// the non-filtering depthSamp are required for texture_depth_2d.
fn ssrViewPos(uv : vec2<f32>) -> vec3<f32> {
  let d = textureSampleLevel(depthTex, depthSamp, uv, 0i);
  let ndc = vec3<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, d);
  let v = U.invProj * vec4<f32>(ndc, 1.0);
  return v.xyz / v.w;
}

// Project a view-space point to a texture-space uv (y-down).
fn ssrProjUV(p : vec3<f32>) -> vec3<f32> {
  let cp = U.proj * vec4<f32>(p, 1.0);
  let ndc = cp.xy / cp.w;
  return vec3<f32>(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5), cp.w);
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let texel    = U.p0.xy;
  let thick    = U.p0.z;
  let strength = U.p0.w;
  let yCut     = U.reflSkyLo.w;   // upper-screen sky cutoff (GLX 0.62)

  let dC = textureSampleLevel(depthTex, depthSamp, in.uv, 0i);
  // Cheap early-outs: sky (far plane), upper screen (never wet road), pass off.
  // yCut is GLX's uSsrTopUV in GL's y-UP uv space (keep vUV.y < 0.62 = the
  // bottom 62%); our uv is y-DOWN, so test the flipped 1 - in.uv.y against it.
  if (dC >= 0.9999 || (1.0 - in.uv.y) >= yCut || strength <= 0.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  let P = ssrViewPos(in.uv);
  // View-space normal from depth finite differences (cheap; the road mask +
  // thickness test reject the noisy silhouette cases). No dpdx/dpdy so this is
  // safe below the early returns above.
  // 3-TEXEL baseline (GLX build 746): at phone resolution a 1-texel step at a
  // grazing road angle is quantization-dominated and the normal turns to noise.
  let nT = texel * 3.0;
  let dpx = ssrViewPos(in.uv + vec2<f32>(nT.x, 0.0)) - P;
  let dpy = ssrViewPos(in.uv + vec2<f32>(0.0, nT.y)) - P;
  // upVS is the ROAD PLANE's normal (game.js builds it from r x t), not world-up:
  // on a gradient the two differ by the slope, and reflect() doubles that error.
  let upVSn = normalize(U.upVS.xyz);
  var Nv = normalize(cross(dpx, dpy));
  if (Nv.z < 0.0) { Nv = -Nv; }   // face the eye (view space looks down -z)
  // ...and a ground normal's view-space z is ~0 at grazing incidence, so that
  // flip is a coin toss and lands DOWN when the camera pitches up, driving upDot
  // to -1 and collapsing the mask past a few metres.
  if (dot(Nv, upVSn) < -0.25) { Nv = -Nv; }
  let upDot = dot(Nv, upVSn);
  // Up-facing road, foreground-weighted, far-field faded (precision/step speckle).
  let roadMask = smoothstep(0.25, 0.55, upDot)
               * smoothstep(-2.5, -7.0, P.z)
               * (1.0 - smoothstep(-22.0, -78.0, P.z));
  if (roadMask <= 0.001) { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }

  let V = normalize(-P);
  // Reflect off the smooth road PLANE, not the bumpy per-pixel normal — a bumpy
  // normal scatters the ray and splits the mirror into hit/miss patches.
  let Nr = normalize(mix(Nv, upVSn, 0.85));
  let R = reflect(-V, Nr);         // points up toward the world above the road

  // Higher-fidelity march (optimized): 24 steps, fine-grained geometric growth.
  // JITTERED (mirrors the GLX fix): an un-jittered march quantizes the hit at
  // identical step boundaries down whole pixel columns, slicing the mirrored
  // city into hard vertical slats with flat sky-fallback stripes between them.
  // IGN offsets each pixel's march start by a sub-step; the far-sky reject
  // window scales with the step so late (multi-metre) steps keep their hits.
  let ign = fract(52.9829189 * fract(dot(in.pos.xy, vec2<f32>(0.06711056, 0.00583715))));
  var pos = P;
  var prevPos = P;
  var stepLen = 0.40;
  pos = pos + R * (stepLen * ign);           // sub-step start offset per pixel
  var found = false;
  var hitUV = vec2<f32>(0.0);
  var hitEdge = 0.0;
  for (var i = 0; i < 24; i = i + 1) {
    prevPos = pos;
    pos = pos + R * stepLen;
    stepLen = stepLen * 1.15;
    let sp = ssrProjUV(pos);
    if (sp.z <= 0.0) { break; }              // behind the eye
    let suv = sp.xy;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) { break; }
    let dz = ssrViewPos(suv).z - pos.z;      // >0 = ray passed behind a surface
    if (dz > thick && dz < max(5.0, stepLen * 1.5)) {   // step-scaled far-sky reject
      var a = prevPos;
      var b = pos;
      for (var j = 0; j < 5; j = j + 1) {    // binary refine -> crisp hit
        let mid = (a + b) * 0.5;
        let muv = ssrProjUV(mid).xy;
        if (ssrViewPos(muv).z - mid.z > 0.20) { b = mid; } else { a = mid; }
      }
      let huv = ssrProjUV(b).xy;
      // GRAZING SELF-REFLECTION REJECT: the reflected ray skims the tarmac and
      // lands on the ROAD itself, filling the wet mirror with wet-darkened
      // asphalt. A rough wet surface barely reflects itself at grazing angles.
      let hP = ssrViewPos(huv);
      let hdx = ssrViewPos(huv + vec2<f32>(nT.x, 0.0)) - hP;
      let hdy = ssrViewPos(huv + vec2<f32>(0.0, nT.y)) - hP;
      var hN = normalize(cross(hdx, hdy));
      if (hN.z < 0.0) { hN = -hN; }
      if (dot(hN, upVSn) > 0.55) { continue; }
      hitUV = huv;
      let e = abs(hitUV - vec2<f32>(0.5)) * 2.0;
      hitEdge = 1.0 - pow(max(e.x, e.y), 4.0);   // screen-edge fade
      found = true;
      break;
    }
  }

  // Miss fallback: horizon-vs-zenith by the reflection's up-ness, measured
  // against the ROAD PLANE — R.y is view-space y, which only tracks up while the
  // camera is level, and an onboard eye pitches with the road.
  let skyRefl = mix(U.reflSkyHi.xyz, U.reflSkyLo.xyz, clamp(dot(R, upVSn), 0.0, 1.0));
  // SSR changes WHAT the road mirrors, never HOW MUCH: scaling the substitution
  // by hit-vs-miss turned reflected CONTENT into a change of SURFACE, which is
  // the glossy-here/matte-there patching. Hold cover constant and blend the
  // content by the hit's own screen-edge confidence.
  let conf = select(0.0, clamp(hitEdge, 0.0, 1.0), found);
  var reflCol = mix(skyRefl, textureSampleLevel(sceneTex, sceneSamp, hitUV, 0.0).rgb, conf);
  let cover = 0.60;
  // Soft-clip the reflected HDR colour before it's substituted (caps the mirror
  // at a sane peak while keeping its colour).
  reflCol = reflCol / (1.0 + reflCol * 0.35);

  // Fresnel lift toward the horizon + seam fade at the hard upper cutoff.
  // Off Nr, the same normal the ray used — Nv carries the road's facets and the
  // depth-derivative noise, and this term swings the amount across 0.55..0.97.
  let fres = pow(1.0 - max(dot(Nr, V), 0.0), 3.0);
  var amt = roadMask * strength * (0.55 + 0.42 * fres);
  // Seam fade at the cutoff, in the same flipped y-UP coordinate as the gate.
  amt = amt * (1.0 - smoothstep(yCut - 0.06, yCut, 1.0 - in.uv.y));
  amt = clamp(amt * cover, 0.0, 0.80);   // road cap 0.94 -> 0.80, matching GLX
  return vec4<f32>(reflCol, amt);
}`;

  // Human-readable pass order for the wgx.js render-target allocator.
  const PASS_ORDER = [
    "SSAO",        // half-res  <- sceneDepth
    "BLUR",        // half-res  SSAO denoise + god-ray soften (separable 5-tap)
    "GODRAY",      // half-res  <- depth + sun/lamp shadows
    "BLOOM_DOWN",  // mip chain (mip0 bright-pass, mips 1..N plain) <- sceneHDR
    "BLOOM_UP",    // mip chain upsample, additive blend -> bloom mip0
    "SSR",         // full-res  <- sceneHDR + sceneDepth  -> ssrTex (rgba, .a=mix)
    "COMPOSITE",   // full-res LDR <- sceneHDR, bloom, ssao, godray (+ image FX; ssrTex optional)
    "FXAA",        // full-res -> swapchain <- LDR composite
  ];

  return {
    // shaders
    BLOOM_DOWN,
    BLOOM_UP,
    SSAO,
    BLUR,
    GODRAY,
    COMPOSITE,
    FXAA,
    SSR,
    // shared vertex stage (exported for reference/reuse)
    POST_VS,
    // uniform byte sizes (JS-side writers in wgx.js MUST agree)
    BLOOM_DOWN_UNIFORM_BYTES: 16,   // BloomDownU
    BLOOM_UP_UNIFORM_BYTES: 16,     // BloomUpU
    SSAO_UNIFORM_BYTES: 176,        // SsaoU  (2×mat4 128 + 3×vec4 48)
    BLUR_UNIFORM_BYTES: 16,         // BlurU  (dir.xy + pad)
    GODRAY_UNIFORM_BYTES: 288,      // GodrayU (world-space march + lamp vol)
    COMPOSITE_UNIFORM_BYTES: 256,   // CompositeU (16×vec4) — +HDR grading + ACES tone curve + LENS DIRT
    FXAA_UNIFORM_BYTES: 16,         // FxaaU
    SSR_UNIFORM_BYTES: 192,         // SsrU  (2×mat4 128 + 4×vec4 64)
    // chain description
    PASS_ORDER,
  };
})();

// No-build global export (mirror GLX/Parts/Tracks/WGSLChunks style).
if (typeof window !== "undefined") window.WGSLPost = WGSLPost;
