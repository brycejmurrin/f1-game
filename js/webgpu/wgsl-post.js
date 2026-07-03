/*
 * Apex 26 — WGSL post-processing shaders (WebGPU migration, Phase 4).
 *
 * A FAITHFUL-BUT-REDUCED WGSL port of the GLX post chain — the same philosophy
 * the Phase 2 sky/lit port used (docs/WEBGPU-PHASE2-NOTES.md) and the Phase 3
 * shadow port (docs/WEBGPU-PHASE3-NOTES.md): keep the *look-defining* math,
 * drop the deep tail (screen-space reflections, speed-blur, chromatic
 * aberration are marked DEFERRED). Nothing here is wired into index.html — the
 * wgx.js pipeline agent owns that. This file only ships the shader strings +
 * their exact bind/uniform contracts. Passes `node --check`.
 *
 * NO build step: plain JS template strings, one global `WGSLPost`. No modules.
 *
 * GROUNDING (GLX reference programs this ports, js/glx.js):
 *   POST_VS       js/glx.js:1309   fullscreen-triangle vertex (VBO-less)
 *   BRIGHT_FS     js/glx.js:1319   bright-pass threshold
 *   DOWN_FS       js/glx.js:1354   13-tap Jimenez bloom downsample
 *   UP_FS         js/glx.js:1383   9-tap tent bloom upsample (additive)
 *   SSAO_FS       js/glx.js:1409   depth-based horizon-AO + contact shadow
 *   GODRAY_FS     js/glx.js:1484   volumetric shafts (world-march) — see NOTE
 *   COMPOSITE_FS  js/glx.js:1602   scene+bloom+ssao+godray, ACES, grade, flare, vignette
 *   FXAA_FS       js/glx.js:1996   Timothy Lottes compact FXAA
 *
 * Composed from the shared leaves in js/webgpu/wgsl-chunks.js (a global loaded
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
 *   1. GODRAY    : half-res rgba16float. reads a bright source     -> godrayTex
 *                  (bloomMip0 after its bright-pass, OR sceneHDR).
 *   2. BLOOM_DOWN: mip0 = bright-pass+downsample of sceneHDR at HALF res
 *                  (threshold > 0); mips 1..N-1 = plain downsample of the
 *                  previous mip (threshold = 0). Each mip is rgba16float, each
 *                  half the size of the last (GLX BLOOM_DIV=2, up to 5 levels).
 *   3. BLOOM_UP  : from the smallest mip upward, tent-upsample each level ADD-
 *                  blended (blend: src ONE, dst ONE) into the next-larger mip.
 *                  The full bloom result ends up in mip0.                -> bloomTex (mip0)
 *   4. COMPOSITE : full-res -> LDR intermediate (or straight to swapchain if
 *                  FXAA is folded off). reads sceneHDR, bloomTex(mip0),
 *                  ssaoTex, godrayTex.                             -> ldrTex
 *   5. FXAA      : full-res LDR -> swapchain. reads ldrTex.        -> present
 *
 * FXAA is a SEPARATE pass (not folded into COMPOSITE) so the edge AA runs on the
 * final tonemapped LDR image, exactly like GLX (FXAA_FS is the last blit). If a
 * target wants to skip AA, present COMPOSITE straight to the swapchain and drop
 * pass 5.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFERRED vs GLX COMPOSITE_FS (each an isolated block dropped from the port):
 *   - Wet-road / car-paint screen-space reflection (the big SSR march block).
 *   - Radial speed-blur, chromatic aberration, unsharp mask.
 *   - Film grain is KEPT (cheap, one hash); dither is KEPT (8-bit banding fix).
 * GODRAY here is the CHEAPER screen-space radial variant (GLX COMPOSITE_FS sun-
 * shaft block, js/glx.js:1899) rather than the world-space shadow-map march
 * (GLX GODRAY_FS) — no depth/shadow-map dependency, matches the "reduced" brief.
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
  //    Port of GLX BRIGHT_FS (js/glx.js:1319) folded into DOWN_FS (js/glx.js:1354).
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
  var s = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625
        + (j + k + l + m) * 0.125;
  // Bright-pass gate (first mip only). Keeps the portion above the threshold.
  if (U.threshold > 0.0) {
    let lum = max(max(s.r, s.g), s.b);
    let bp  = max(0.0, lum - U.threshold) / max(lum, 1e-4);
    s = s * bp;
  }
  return vec4<f32>(s, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 2. BLOOM_UP — 9-tap tent upsample. Port of GLX UP_FS (js/glx.js:1383).
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
  //    Port of GLX SSAO_FS (js/glx.js:1409), reduced to 8 directional taps and
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
  // 4. GODRAY — screen-space radial light-shaft accumulation toward the sun.
  //    Port of the sun-shaft block in GLX COMPOSITE_FS (js/glx.js:1899): 8 taps
  //    marching from the pixel toward the sun's screen position, reading a
  //    bright source (bloom bright-pass mip0, or scene HDR), weighted by decay
  //    and proximity-to-sun so isolated hotspots can't smear into comet dashes.
  //    Output is the ADDITIVE shaft (composite adds it to the scene). Gate on
  //    the CPU: only dispatch when the sun is on-screen + above the horizon.
  //
  //    BIND GROUP 0:
  //      @binding(0) brightTex : texture_2d<f32>   bright source (bloom mip0 / scene)
  //      @binding(1) brightSamp: sampler           linear clamp
  //      @binding(2) U         : uniform  GodrayU
  //    UNIFORM GodrayU (32 B):
  //      p0       : vec4<f32>  off  0   (sunUV.x, sunUV.y, strength, radialScale)
  //      sunColor : vec4<f32>  off 16   (xyz sun tint, w = per-step decay e.g. 0.82)
  // ════════════════════════════════════════════════════════════════════════
  const GODRAY = `
struct GodrayU {
  p0       : vec4<f32>,
  sunColor : vec4<f32>,
};
@group(0) @binding(0) var brightTex  : texture_2d<f32>;
@group(0) @binding(1) var brightSamp : sampler;
@group(0) @binding(2) var<uniform> U : GodrayU;
${fullscreenTri}
${POST_VS}
@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let sunUV    = U.p0.xy;
  let strength = U.p0.z;
  let radialK  = U.p0.w;
  let decayK   = U.sunColor.w;

  let toSun = sunUV - in.uv;
  let dist  = length(toSun);
  if (dist <= 0.005 || strength <= 0.0) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }

  let stepV = toSun / dist * min(dist, 0.40) / 8.0;
  // Interleaved-gradient-noise start jitter hides the 8-tap quantisation.
  let ign = fract(52.9829189 * fract(dot(in.pos.xy, vec2<f32>(0.06711056, 0.00583715))));
  var uv = in.uv + stepV * ign;
  var shaft = vec3<f32>(0.0);
  var decay = 1.0;
  for (var i = 0; i < 8; i = i + 1) {
    uv = uv + stepV;
    let suv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    // Weight by proximity to the sun so only the sun's glare casts shafts.
    let sw = 1.0 - clamp(length(suv - sunUV) / 0.32, 0.0, 1.0);
    shaft = shaft + textureSampleLevel(brightTex, brightSamp, suv, 0.0).rgb * (decay * sw * sw);
    decay = decay * decayK;
  }
  shaft = shaft / 8.0;
  // Radial falloff: strongest at the sun, zero toward the frame edge.
  let radial = 1.0 - clamp(dist * radialK, 0.0, 1.0);
  let outc = shaft * U.sunColor.xyz * strength * radial * radial * 0.60;
  return vec4<f32>(outc, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 5. COMPOSITE — final resolve to LDR.
  //    Port of GLX COMPOSITE_FS (js/glx.js:1602), reduced: scene * SSAO,
  //    + godray, * exposure, + bloom (tone-masked), ACES tonemap (shared leaf),
  //    lift-gamma-gain colour grade (contrast / vibrance / saturation / tint /
  //    split-tone shadow+hi / black-lift), soft lens-flare + ghosts, vignette,
  //    dither, film grain. SSR / speed-blur / chromatic-aberration DEFERRED.
  //
  //    BIND GROUP 0:
  //      @binding(0) sceneTex  : texture_2d<f32>   scene HDR (full-res)
  //      @binding(1) bloomTex  : texture_2d<f32>   bloom result (mip0)
  //      @binding(2) ssaoTex   : texture_2d<f32>   AO (.r, 1 = unoccluded)
  //      @binding(3) godrayTex : texture_2d<f32>   additive shafts
  //      @binding(4) samp      : sampler           linear clamp (all four)
  //      @binding(5) U         : uniform  CompositeU
  //    UNIFORM CompositeU (112 B):
  //      p0          : vec4<f32>  off  0   (exposure, bloomAmt, sunShaft, flareStr)
  //      sunUV       : vec4<f32>  off 16   (sunUV.x, sunUV.y, whitePoint, blackLift)
  //      grade       : vec4<f32>  off 32   (contrast, vibrance, saturation, tint)
  //      fx          : vec4<f32>  off 48   (vignette, grain, time, _pad)
  //      gradeShadow : vec4<f32>  off 64   (xyz split-tone shadow tint, w gradeStr)
  //      gradeHi     : vec4<f32>  off 80   (xyz split-tone highlight tint, w _pad)
  //      texel       : vec4<f32>  off 96   (1/w, 1/h, _pad, _pad)
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
};
@group(0) @binding(0) var sceneTex  : texture_2d<f32>;
@group(0) @binding(1) var bloomTex  : texture_2d<f32>;
@group(0) @binding(2) var ssaoTex   : texture_2d<f32>;
@group(0) @binding(3) var godrayTex : texture_2d<f32>;
@group(0) @binding(4) var samp      : sampler;
@group(0) @binding(5) var<uniform> U : CompositeU;
${fullscreenTri}
${tonemap}
${POST_VS}

// Lift-gamma-gain colour grade (GLX colourGrade, js/glx.js:1660), reduced.
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

  var c = textureSampleLevel(sceneTex, samp, in.uv, 0.0).rgb;

  // Ambient occlusion (multiply in linear light; 1 = no change).
  c = c * textureSampleLevel(ssaoTex, samp, in.uv, 0.0).r;

  // Volumetric shafts (additive), scaled by the composite sun-shaft gate.
  c = c + textureSampleLevel(godrayTex, samp, in.uv, 0.0).rgb * max(sunShaft, 0.0);

  // Exposure before tonemap.
  c = c * exposure;

  // Bloom: tone-aware mask so already-bright pixels don't over-wash.
  let bloomSample = textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb;
  let bloomMask = 1.0 - clamp(max(c.r, max(c.g, c.b)) - 0.7, 0.0, 0.3) / 0.3 * 0.5;
  c = c + bloomSample * bloomAmt * bloomMask;

  // Filmic tonemap (shared leaf) + colour grade. White point scales the knee.
  c = acesTonemap(c / max(whitePoint, 1e-3));
  c = colourGrade(c);

  // Lens flare: anamorphic streak + ghost circles (GLX js/glx.js:1934).
  if (flareStr > 0.0 && sunUV.x >= 0.0 && sunUV.x <= 1.0 &&
      sunUV.y >= 0.0 && sunUV.y <= 1.0) {
    var flare = vec3<f32>(0.0);
    let streakY = exp(-abs(in.uv.y - sunUV.y) * 110.0);
    let streakX = exp(-abs(in.uv.x - sunUV.x) * 7.0);
    flare = flare + vec3<f32>(1.0, 0.80, 0.52) * streakY * streakX * 0.75;
    let streakX2 = exp(-abs(in.uv.x - sunUV.x) * 10.0);
    flare = flare + vec3<f32>(1.0, 0.92, 0.78) * exp(-abs(in.uv.y - sunUV.y) * 320.0) * streakX2 * 0.5;
    let toCenter = vec2<f32>(0.5) - sunUV;
    let d0 = length(in.uv - (sunUV + toCenter * 0.5));
    flare = flare + vec3<f32>(1.0, 0.88, 0.65) * smoothstep(0.055, 0.020, d0) * 0.35;
    let d1 = length(in.uv - (sunUV + toCenter * 1.3));
    flare = flare + vec3<f32>(0.70, 0.60, 1.00) * smoothstep(0.038, 0.012, d1) * 0.25;
    let d2 = length(in.uv - (sunUV + toCenter * 1.8));
    flare = flare + vec3<f32>(0.50, 1.00, 0.70) * smoothstep(0.028, 0.008, d2) * 0.18;
    flare = flare * flareStr;
    flare = flare / (1.0 + flare * 0.6);
    c = c + flare;
  }

  // Vignette.
  let q = in.uv - vec2<f32>(0.5);
  let vig = smoothstep(0.95, 0.35, length(q));
  c = c * mix(vignette, 1.0, vig);

  // Triangular-PDF dither (breaks 8-bit banding in sky/fog gradients).
  let dh0 = fract(sin(dot(in.uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  let dh1 = fract(sin(dot(in.uv, vec2<f32>(39.3468, 11.135))) * 24634.6345);
  c = c + vec3<f32>((dh0 + dh1 - 1.0) / 255.0);

  // Film grain: luma-weighted (mids grain most). 0 = off.
  if (grain > 0.001) {
    let gn = fract(sin(dot(in.uv, vec2<f32>(93.9898, 47.233))) * 61237.312) - 0.5;
    let gLuma = dot(c, vec3<f32>(0.299, 0.587, 0.114));
    c = c + vec3<f32>(gn * grain * (1.0 - abs(gLuma - 0.5) * 1.4));
  }

  return vec4<f32>(c, 1.0);
}`;

  // ════════════════════════════════════════════════════════════════════════
  // 6. FXAA — Timothy Lottes compact edge AA. Port of GLX FXAA_FS (js/glx.js:1996).
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

  // Human-readable pass order for the wgx.js render-target allocator.
  const PASS_ORDER = [
    "SSAO",        // half-res  <- sceneDepth
    "GODRAY",      // half-res  <- bright source (bloom mip0 / scene)
    "BLOOM_DOWN",  // mip chain (mip0 bright-pass, mips 1..N plain) <- sceneHDR
    "BLOOM_UP",    // mip chain upsample, additive blend -> bloom mip0
    "COMPOSITE",   // full-res LDR <- sceneHDR, bloom, ssao, godray
    "FXAA",        // full-res -> swapchain <- LDR composite
  ];

  return {
    // shaders
    BLOOM_DOWN,
    BLOOM_UP,
    SSAO,
    GODRAY,
    COMPOSITE,
    FXAA,
    // shared vertex stage (exported for reference/reuse)
    POST_VS,
    // uniform byte sizes (JS-side writers in wgx.js MUST agree)
    BLOOM_DOWN_UNIFORM_BYTES: 16,   // BloomDownU
    BLOOM_UP_UNIFORM_BYTES: 16,     // BloomUpU
    SSAO_UNIFORM_BYTES: 176,        // SsaoU  (2×mat4 128 + 3×vec4 48)
    GODRAY_UNIFORM_BYTES: 32,       // GodrayU (2×vec4)
    COMPOSITE_UNIFORM_BYTES: 112,   // CompositeU (7×vec4)
    FXAA_UNIFORM_BYTES: 16,         // FxaaU
    // chain description
    PASS_ORDER,
  };
})();

// No-build global export (mirror GLX/Parts/Tracks/WGSLChunks style).
if (typeof window !== "undefined") window.WGSLPost = WGSLPost;
