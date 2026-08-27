/* Apex 26 — WGSL post-processing shaders (WGSLPost). WGSL port of js/render/shaders/post.js: SSAO, godray, bloom, SSR, composite, FXAA. Composes WGSLChunks leaves (fullscreenTri, tonemap). wgx.js owns pipelines/targets. */
"use strict";

const WGSLPost = (function () {
  const CH = (typeof window !== "undefined" && window.WGSLChunks) || {};
  const fullscreenTri = CH.fullscreenTri || "";
  const tonemap = CH.tonemap || "";

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

// First 8 of GLX/TLX K[12] (js/render/shaders/post.js, js/render/three/tsl-post.js).
const SSAO_K = array<vec2<f32>, 8>(
  vec2<f32>(0.0, 1.0), vec2<f32>(0.5, 0.866), vec2<f32>(0.866, 0.5), vec2<f32>(1.0, 0.0),
  vec2<f32>(0.866, -0.5), vec2<f32>(0.5, -0.866), vec2<f32>(0.0, -1.0), vec2<f32>(-0.5, -0.866)
);

fn ssaoDepth(uv : vec2<f32>) -> f32 {
  let dims = vec2<i32>(textureDimensions(depthTex));
  let px = clamp(vec2<i32>(uv * vec2<f32>(dims)), vec2<i32>(0), max(dims - vec2<i32>(1), vec2<i32>(0)));
  return textureLoad(depthTex, px, 0);
}
fn ssaoViewPosFromD(uv : vec2<f32>, d : f32) -> vec3<f32> {
  // Texture-space uv -> WebGPU NDC (y flip), depth already 0..1.
  let ndc = vec3<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, d);
  let v = U.invProj * vec4<f32>(ndc, 1.0);
  return v.xyz / v.w;
}
fn ssaoViewPos(uv : vec2<f32>) -> vec3<f32> {
  return ssaoViewPosFromD(uv, ssaoDepth(uv));
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
  let dCentre = ssaoDepth(in.uv);
  let P = ssaoViewPosFromD(in.uv, dCentre);
  // Guarded like GLX: at a depth silhouette the two derivatives can be parallel
  // or zero, and normalize(0) is NaN — one speckled AO pixel per silhouette
  // edge. Fall back to eye-facing.
  let crN = cross(dpdx(P), dpdy(P));
  let crL = length(crN);
  let N = select(vec3<f32>(0.0, 0.0, 1.0), crN / crL, crL > 1e-6);
  if (dCentre >= 0.99999) { return vec4<f32>(1.0); }   // sky: unoccluded
  // uStrength == 0 is supported: the pass still runs contact shadows
  // (haveAO arms on aoStr > 0 || contactStr > 0). Skip the 8 dependent
  // depth taps + the sin/cos rotation when AO itself is off — same as
  // GLX SSAO_FS (js/render/shaders/post.js). strength is a uniform.
  var occ = 0.0;
  if (strength > 0.0) {
    let scr = clamp(radius / max(-P.z, 1.0) * 0.9, 0.004, 0.05);
    let ang = fract(sin(dot(in.pos.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 6.2832;
    let ca = cos(ang);
    let sa = sin(ang);
    for (var i = 0; i < 8; i = i + 1) {
      // GLX/TLX fan (not an even 2π ring) + the same per-pixel rotation.
      let kb = SSAO_K[i];
      let k  = vec2<f32>(kb.x * ca - kb.y * sa, kb.x * sa + kb.y * ca);
      let suv = clamp(in.uv + k * scr, vec2<f32>(0.001), vec2<f32>(0.999));
      let S = ssaoViewPos(suv);
      let V = S - P;
      let len = length(V);
      let ndv = max(dot(N, V / max(len, 1e-4)) - 0.10, 0.0);
      let range = smoothstep(radius, radius * 0.4, len);
      occ = occ + ndv * range;
    }
  }
  var ao = 1.0 - clamp(occ / 8.0 * 2.4, 0.0, 1.0) * strength;

  // Contact shadows: short view-space march toward the sun sampling depth.
  if (contact > 0.0 && U.sunVS.z < 0.05) {   // sun at/in front of the camera plane
    var sh = 1.0;
    for (var s = 1; s <= 5; s = s + 1) {
      let q  = P + U.sunVS.xyz * (0.04 * f32(s));   // up to ~0.32 m toward the sun
      let cp = U.proj * vec4<f32>(q, 1.0);
      let quv = cp.xy / cp.w * 0.5 + 0.5;
      if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) { break; }
      // proj gives NDC (y-up); flip to texture space to sample the scene depth.
      let quvT = vec2<f32>(quv.x, 1.0 - quv.y);
      let B  = ssaoViewPos(quvT);                   // blocker view position
      let dz = B.z - q.z;
      // Reject the receiver's OWN near-coplanar surface (GLX parity). On flat
      // road at a grazing angle the point sampled ahead is almost coplanar with
      // this pixel, so the raw dz window fires on the road itself — and being
      // screen-space it SWIMS across the tarmac as the camera moves. A real
      // grounding occluder (wheel, barrier foot, kerb) rises above the
      // receiver's tangent plane; the road does not. Bias grows with distance
      // so a far road pixel, whose whole march projects into a pixel or two,
      // is not over-rejected.
      let above = dot(N, B - P);
      let aboveBias = 0.05 + 0.01 * max(-P.z - 6.0, 0.0);
      if (dz > 0.015 && dz < 0.5 && above > aboveBias) { sh = 1.0 - contact; break; }
    }
    // Fade as the sun crosses the camera plane instead of cutting hard at 0, so
    // a chase-cam yaw cannot flip the whole grounding shadow off in one frame.
    let front = clamp(-U.sunVS.z * 6.0, 0.0, 1.0);
    ao = ao * mix(1.0, sh, front);
  }
  return vec4<f32>(vec3<f32>(ao), 1.0);
}`;

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

  // 4. GODRAY — world-space 16-step march through scene depth + sun/lamp
  //    shadow maps (GLX GODRAY_FS). Composite adds the result. CPU gates on
  //    sun-on-screen or lampVol > 0. A separable BLUR follows the march.
  //    Lamp loop is 6 — GR_MAX_LIGHTS=6 on GLX too, upload and march alike
  //    (the old upload-12/march-6 split was removed; see the removal note in
  //    glx/post.js). Matching keeps WGX from showing more beams than GLX.
  const GODRAY = `
struct GodrayU {
  invVP    : mat4x4<f32>,   // off   0
  lightVP  : mat4x4<f32>,   // off  64
  lampVP   : mat4x4<f32>,   // off 128
  eye      : vec4<f32>,     // off 192
  sunDir   : vec4<f32>,     // off 208
  sunColor : vec4<f32>,     // off 224
  p0       : vec4<f32>,     // off 240  (str, lampStr, mist, time)
  p1       : vec4<f32>,     // off 256  (cloudCover, cloudSpeed, godrayAniso, godrayFloor)
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
  let dims = vec2<i32>(textureDimensions(depthTex));
  let px = clamp(vec2<i32>(in.uv * vec2<f32>(dims)), vec2<i32>(0), max(dims - vec2<i32>(1), vec2<i32>(0)));
  let d = textureLoad(depthTex, px, 0);
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
      for (var li = 0; li < 6; li = li + 1) {   // GLX GODRAY_FS consumer cap (upload pad is 12; 16×6 is the cost floor)
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
  // HG phase's only consumer is * uStr (GLX GODRAY_FS). Night lamp-vol
  // frames skip the sqrt — lampAccum is unchanged.
  var sunTerm = vec3<f32>(0.0);
  if (uStr > 0.0) {
    let cosT = max(dot(rd, U.sunDir.xyz), 0.0);
    let g = clamp(U.p1.z, 0.0, 0.95);
    let hgD = 1.0 + g * g - 2.0 * g * cosT;
    let hg = (1.0 - g * g) / (hgD * sqrt(hgD));
    let phase = hg * 0.16 + U.p1.w;
    sunTerm = U.sunColor.xyz * accum * phase * uStr;
  }
  return vec4<f32>(sunTerm + lampAccum, 1.0);
}`;

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
  //      @binding(6) dirtTex   : texture_2d<f32>   LENS DIRT grime map
  //      @binding(7) depthTex  : texture_depth_2d  scene depth (bilateral AO + flare occ)
  //      @binding(8) ssrPostTex: texture_2d<f32>   this-frame SSR (same-present consume)
  //    UNIFORM CompositeU (256 B):
  //      p0          : vec4<f32>  off   0   (exposure, bloomAmt, sunShaft, flareStr)
  //      sunUV       : vec4<f32>  off  16   (sunUV.x, sunUV.y, whitePoint, blackLift)
  //      grade       : vec4<f32>  off  32   (contrast, vibrance, saturation, tint)
  //      fx          : vec4<f32>  off  48   (vignette, grain, time, shaftDecay)
  //                                          fx.w = shaftDecay (def 0.82)
  //      gradeShadow : vec4<f32>  off  64   (xyz split-tone shadow tint, w gradeStr)
  //      gradeHi     : vec4<f32>  off  80   (xyz split-tone highlight tint,
  //                                          w = shaftSpread, def 1.0)
  //      texel       : vec4<f32>  off  96   (1/w, 1/h, aoTexel.x, aoTexel.y) —
  //                                          xy = sharpen unsharp-blur tap offset;
  //                                          zw = aoTexel (half-res 1/w,1/h; 0 = skip
  //                                          bilateral upsample, plain SSAO sample)
  //      imgFx       : vec4<f32>  off 112   (chromAb, sharpen, speedBlur, bloomKnee)
  //                                          image FX. Each 0 = no-op:
  //                                          chromAb  = radial R/B split amount
  //                                          sharpen  = unsharp-mask crispness
  //                                          speedBlur= radial centre->edge smear
  //                                                     (GLX folds car speed in)
  //      tuneFx      : vec4<f32>  off 128   (vignetteSoft, flareStreak2, acesE, flareStreak)
  //      tone0       : vec4<f32>  off 144   (blacks, shadows, midtones, highlights)
  //      tone1       : vec4<f32>  off 160   (whites, toe, shoulder, hdrGradeOn)
  //                                          w = GLX uHdrGradeOn: 1 only when an
  //                                          HDR-grade knob is off-neutral
  //      lift        : vec4<f32>  off 176   (RGB lift, haveGR)
  //      gamma       : vec4<f32>  off 192   (RGB gamma, reflect / wet-road SSR)
  //      gain        : vec4<f32>  off 208   (RGB gain, carReflect)
  //      aces        : vec4<f32>  off 224   (acesA, acesB, acesC, acesD) — ACES
  //                                          TONE CURVE knobs; defaults 2.51/0.03/
  //                                          2.43/0.59 (+ acesE 0.14 in tuneFx.z)
  //      dirtFx      : vec4<f32>  off 240   (lensDirt, hazeU, hazeV, hazeStr) —
  //                                          LENS DIRT veil + heat-haze UV/str;
  //                                          samples binding(6) dirtTex grime map
  //    NOTE: sunShaft (p0.z) is SCREEN sun-shaft intensity only (8-tap radial
  //    bloom toward sunUV). Volumetric godray is added unscaled; its strength
  //    lives in the GODRAY uniform.
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
@group(0) @binding(7) var depthTex  : texture_depth_2d;
@group(0) @binding(8) var ssrPostTex : texture_2d<f32>;  // this-frame SSR (GLX composite consume)
${fullscreenTri}
${tonemap}
${POST_VS}

fn loadCompDepth(uv : vec2<f32>) -> f32 {
  let dims = vec2<i32>(textureDimensions(depthTex));
  let px = clamp(vec2<i32>(uv * vec2<f32>(dims)), vec2<i32>(0), max(dims - vec2<i32>(1), vec2<i32>(0)));
  return textureLoad(depthTex, px, 0);
}

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
  let sceneS = textureSampleLevel(sceneTex, samp, sceneUV, 0.0);
  var c = sceneS.rgb;
  let sceneA = sceneS.a;
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
  // Half-res AO: 4-tap depth-aware bilateral upsample when U.texel.z > 0
  // (aoTexel = half-res 1/w,1/h); else plain sample (AO off / 1×1 white).
  var aoV = 1.0;
  if (U.texel.z > 0.0) {
    let aoDc = loadCompDepth(in.uv);
    let aoTexel = U.texel.zw;
    let aoG = in.uv / aoTexel - vec2<f32>(0.5);
    let aoF = fract(aoG);
    let aoB = (floor(aoG) + vec2<f32>(0.5)) * aoTexel;
    var aoSum = 0.0;
    var aoW = 0.0;
    for (var ai = 0; ai < 4; ai = ai + 1) {
      let ox = select(0.0, aoTexel.x, ai == 1 || ai == 3);
      let oy = select(0.0, aoTexel.y, ai >= 2);
      let auv = aoB + vec2<f32>(ox, oy);
      var bw = 1e-4;
      if (ai == 0) { bw = (1.0 - aoF.x) * (1.0 - aoF.y) + 1e-4; }
      else if (ai == 1) { bw = aoF.x * (1.0 - aoF.y) + 1e-4; }
      else if (ai == 2) { bw = (1.0 - aoF.x) * aoF.y + 1e-4; }
      else { bw = aoF.x * aoF.y + 1e-4; }
      let dTap = loadCompDepth(auv);
      let w = bw / (1e-4 + abs(aoDc - dTap) * 30.0);
      aoSum = aoSum + textureSampleLevel(ssaoTex, samp, auv, 0.0).r * w;
      aoW = aoW + w;
    }
    aoV = aoSum / aoW;
  }
  c = c * aoV;

  // Same-frame SSR consume (GLX COMPOSITE_FS). The SSR pass already baked
  // gate, fresnel, cover, seam fade, and min(gateSrc/0.20) into .a —
  // remultiplying wetness * reflect here zeros dry sheen (wetness=0) and
  // double-counts wet (po.reflect is already wetness * ssrWetMul).
  let ssrWet = U.lift.w;
  let ssrRefl = U.gamma.w;
  let ssrCar = U.gain.w;
  // Wetness already lives in the SSR pass .a (min(gateSrc/0.20)). Keep
  // the ssrWet let so a leftover use still compiles (Dawn sheds COMPOSITE
  // on an undeclared name). lift.w is now haveGR (leftover 6).
  if (ssrRefl > 0.001 || ssrCar > 0.001) {
    let ssr = textureSampleLevel(ssrPostTex, samp, in.uv, 0.0);
    if (ssr.a > 0.001) {
      let carPx = select(0.0, 1.0, abs(sceneA - 0.35) < 0.08);
      let dark = select(0.10, 0.22, carPx > 0.5);
      let sat = select(0.92, 0.88, carPx > 0.5);
      // Lagarde ao² on the reflected colour (GLX post.js) — open road
      // (ao≈1) is untouched; creases stay dark through the mirror.
      let refl = ssr.rgb * aoV * aoV;
      c = mix(c, c * dark + refl * sat, clamp(ssr.a, 0.0, 0.85));
    }
  }

  // Volumetric shafts (additive, unscaled — strength is in the GODRAY pass).
  // lift.w is haveGR (wetness already lives in SSR .a). Skip the fetch
  // when the godray pass did not run — stale contents are unread.
  if (U.lift.w > 0.5) {
    c = c + textureSampleLevel(godrayTex, samp, in.uv, 0.0).rgb;
  }

  // Exposure before tonemap.
  c = c * exposure;

  // Bloom: tone-aware mask so already-bright pixels don't over-wash.
  // Skip the fetch when bloomAmt is 0 (CPU shed the chain / cleared mip0).
  var bloomSample = vec3<f32>(0.0);
  if (bloomAmt > 0.001) {
    bloomSample = textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb;
    let bloomMask = 1.0 - clamp(max(c.r, max(c.g, c.b)) - 0.7, 0.0, 0.3) / 0.3 * bloomKnee;
    // Scale by exposure to match the scene (parity with GLX): the bright-pass is
    // pre-exposure, but the scene above is already * exposure — so a driven
    // exposure would otherwise leave the halos over-strong.
    c = c + bloomSample * bloomAmt * bloomMask * exposure;
  }

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

  // SCREEN SUN-SHAFT: 8-tap radial bloom toward sunUV (p0.z = shaft intensity only).
  let shaftMul = max(sunShaft, 0.0);
  let shaftDecay = select(0.82, U.fx.w, U.fx.w > 0.0);
  let shaftSpread = select(1.0, U.gradeHi.w, U.gradeHi.w > 0.0);
  if (shaftMul > 0.0) {
    let toSun = sunUV - in.uv;
    let dist = length(toSun);
    if (dist > 0.005) {
      let shaftStep = toSun / dist * min(dist, 0.40) / 8.0;
      var shaft = vec3<f32>(0.0);
      let ign = fract(52.9829189 * fract(dot(in.pos.xy, vec2<f32>(0.06711056, 0.00583715))));
      var uv = in.uv + shaftStep * ign;
      var decay = 1.0;
      let reach = 0.32 * shaftSpread;
      for (var i = 0; i < 8; i = i + 1) {
        uv = uv + shaftStep;
        let suv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
        let sw = 1.0 - clamp(length(suv - sunUV) / reach, 0.0, 1.0);
        shaft = shaft + textureSampleLevel(bloomTex, samp, suv, 0.0).rgb * (decay * sw * sw);
        decay = decay * shaftDecay;
      }
      shaft = shaft / 8.0;
      let radial = 1.0 - clamp(dist * (2.6 / max(shaftSpread, 1e-3)), 0.0, 1.0);
      c = c + shaft * shaftMul * radial * radial * 0.60;
    }
  }

  // Professional HDR grade runs after linear-light composition and before ACES.
  // Gated: at neutral knobs the block is an identity that still cost ~20 ALU.
  // tone1.w is GLX uHdrGradeOn (1 only when a knob is off-neutral).
  if (U.tone1.w > 0.5) { c = applyHdrGrade(c); }

  // Filmic tonemap (shared leaf) + colour grade. White point scales the knee.
  // ACES TONE CURVE knobs (aces.xyzw = a,b,c,d; tuneFx.z = e). Defaults reproduce
  // the shipped Narkowicz coefficients; the JS uploader always packs them.
  c = acesTonemap(c / max(whitePoint, 1e-3), U.aces.x, U.aces.y, U.aces.z, U.aces.w, U.tuneFx.z);
  c = colourGrade(c);

  // Lens flare: anamorphic streak + ghost circles (GLX js/render/shaders/post.js COMPOSITE_FS).
  // Occlusion: procedural flare would bleed through geometry; sample depth at sunUV.
  // Skip the depth fetch when the flare is off or the sun is off-screen
  // (uniform CF). Matches GLX post.js sunVis.
  var sunVis: f32 = select(0.0,
    smoothstep(0.9990, 0.9999, loadCompDepth(sunUV)),
    flareStr > 0.0 && sunUV.x >= 0.0 && sunUV.x <= 1.0 && sunUV.y >= 0.0 && sunUV.y <= 1.0);
  if (flareStr > 0.0 && sunVis > 0.0 && sunUV.x >= 0.0 && sunUV.x <= 1.0 &&
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
    flare = flare * flareStr * sunVis;
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
  // Outer edge is the CORNER (vr is corner-normalised => exactly 0.70710678 at
  // every aspect), not 0.95. The old form ran edge0 > edge1 and never finished
  // its ramp. Mirrors js/render/shaders/post.js.
  let vig = 1.0 - smoothstep(min(vignetteSoft, 0.69), 0.70710678, vr);
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

  // 7. SSR — wet-road + car-paint screen-space reflection (its own full-res pass).
  //    Port of the GLX COMPOSITE_FS wet-road SSR block (js/render/shaders/post.js COMPOSITE_FS),
  //    reduced for mobile: road + car-paint (.a tag) paths, SHORT 12-step reflected-
  //    ray march + 4-step binary refine.
  //    Reconstructs view position from depth, a view-space normal from depth
  //    finite differences (NOT dpdx/dpdy — safe past the early sky/road-mask
  //    returns), masks to up-facing foreground road OR car bodywork, marches the
  //    reflected view ray R = reflect(-V, N) through the depth buffer and samples
  //    the already-lit scene HDR at the hit. Bright HDR hits are soft-clipped so a
  //    floodlight lens can't blow the mirror white; a march MISS falls back to a
  //    dim night sky-glow (a wet road always mirrors something).
  //
  //    OUTPUT (rgba16float reflection buffer):
  //      .rgb = soft-clipped reflected HDR colour
  //      .a   = mix amount in [0, 0.85] (ssrGate * fresnel * cover, seam-faded;
  //             road cap 0.80 / car cap 0.85). 0 = leave the surface untouched.
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
  //    UNIFORM SsrU (208 B):
  //      invProj   : mat4x4<f32>  off   0   (clip[0..1 z] -> view; WebGPU-convention)
  //      proj      : mat4x4<f32>  off  64   (view -> clip; projects the marched ray)
  //      upVS      : vec4<f32>    off 128   (xyz world-up in view space,
  //                                          w = carReflect — car-paint SSR amount)
  //      p0        : vec4<f32>    off 144   (texel.x, texel.y, ssrThick, strength)
  //                                          ssrThick = depth-tolerance gate (GLX
  //                                          uSsrThick, def 0.20); strength folds
  //                                          the wet-road SSR amount (GLX uReflect
  //                                          * wetness) — 0 disables the road path.
  //      reflSkyLo : vec4<f32>    off 160   (xyz zenith sky-glow miss fallback,
  //                                          w = upper-screen cutoff, GLX 0.62)
  //      reflSkyHi : vec4<f32>    off 176   (xyz horizon sky-glow miss fallback,
  //                                          w = near-fade start in view-space z,
  //                                          GLX uSsrNear, def -2.5; the low
  //                                          onboard eye passes -1.0)
  //      gloss     : vec4<f32>    off 192   (x = carGloss, GLX uCarGloss def 1.0;
  //                                          yzw pad). Drives the car SSR streak
  //                                          width: carSoft = clamp((1.4-gloss)*0.5).
  const SSR = `
struct SsrU {
  invProj   : mat4x4<f32>,
  proj      : mat4x4<f32>,
  upVS      : vec4<f32>,
  p0        : vec4<f32>,
  reflSkyLo : vec4<f32>,
  reflSkyHi : vec4<f32>,
  gloss     : vec4<f32>,
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
fn ssrDepth(uv : vec2<f32>) -> f32 {
  let dims = vec2<i32>(textureDimensions(depthTex));
  let px = clamp(vec2<i32>(uv * vec2<f32>(dims)), vec2<i32>(0), max(dims - vec2<i32>(1), vec2<i32>(0)));
  return textureLoad(depthTex, px, 0);
}
fn ssrViewPos(uv : vec2<f32>) -> vec3<f32> {
  let d = ssrDepth(uv);
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
  let texel      = U.p0.xy;
  let thick      = U.p0.z;
  let strength   = U.p0.w;
  let carReflect = U.upVS.w;
  let yCut       = U.reflSkyLo.w;   // upper-screen sky cutoff (GLX 0.62)

  let dC = ssrDepth(in.uv);
  // Cheap early-outs: sky (far plane), upper screen, both paths off.
  // yCut is GLX's uSsrTopUV in GL's y-UP uv space (keep vUV.y < 0.62 = the
  // bottom 62%); our uv is y-DOWN, so test the flipped 1 - in.uv.y against it.
  if (dC >= 0.9999 || (1.0 - in.uv.y) >= yCut || (strength <= 0.0 && carReflect <= 0.0)) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  let scnA = textureSampleLevel(sceneTex, sceneSamp, in.uv, 0.0).a;
  let carPx = 1.0 - smoothstep(0.42, 0.55, scnA);

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
  // CONDITIONING, not absolute magnitude (GLX COMPOSITE_FS / TLX tsl-post).
  // crvL scales with |dpx|·|dpy|, so at grazing distance the cross stays
  // large while its DIRECTION is depth-quantization noise. sinT is the
  // scale-free sine of the angle between the derivatives — fallback to
  // the road plane when the basis is degenerate at any distance.
  let crv = cross(dpx, dpy);
  let crvL = length(crv);
  let sinT = crvL / max(length(dpx) * length(dpy), 1e-12);
  var Nv = select(upVSn, crv / max(crvL, 1e-12), crvL > 1e-6 && sinT > 0.08);
  if (Nv.z < 0.0) { Nv = -Nv; }   // face the eye (view space looks down -z)
  // ...and a ground normal's view-space z is ~0 at grazing incidence, so that
  // flip is a coin toss and lands DOWN when the camera pitches up, driving upDot
  // to -1 and collapsing the mask past a few metres.
  if (dot(Nv, upVSn) < -0.25) { Nv = -Nv; }
  let upDot = dot(Nv, upVSn);
  // Up-facing road, foreground-weighted, far-field faded (precision/step speckle).
  // Near fade: reflSkyHi.w is GLX uSsrNear (def -2.5, x2.8 for the far end, the
  // same pair tsl-post.js derives). game.js halves it for a low onboard eye —
  // a cockpit camera sits close enough to the road that a -2.5 start fades out
  // the whole visible mirror, so the literal made the knob's onboard case dead.
  let ssrNear = U.reflSkyHi.w;
  let roadMask = smoothstep(0.25, 0.55, upDot)
               * smoothstep(ssrNear, ssrNear * 2.8, P.z)
               * (1.0 - smoothstep(-22.0, -78.0, P.z));
  // Car bodywork: up-facing-ish panels, nearer than the road (chase sits ~5–8 m back).
  var carMask = carPx * smoothstep(0.30, 0.65, upDot)
              * smoothstep(-1.0, -3.0, P.z)
              * (1.0 - smoothstep(-22.0, -55.0, P.z));
  let edgeGrad = (length(dpx) + length(dpy)) * (1.0 / 3.0);
  carMask = carMask * (1.0 - smoothstep(0.35, 0.9, edgeGrad));
  let roadTerm = roadMask * strength;
  let carTerm  = carMask * carReflect;
  let ssrGate  = max(roadTerm, carTerm);
  if (ssrGate <= 0.001) { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }
  let carDom = carTerm > roadTerm;

  let V = normalize(-P);
  // Road: flatten onto the plane so bump scatter doesn't patch the mirror.
  // Car paint keeps the true per-pixel normal (curved bodywork needs it).
  let Nr = select(normalize(mix(Nv, upVSn, 0.85)), Nv, carDom);
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
  var stepLen = 0.55;
  pos = pos + R * (stepLen * ign);           // sub-step start offset per pixel
  var found = false;
  var hitUV = vec2<f32>(0.0);
  var hitEdge = 0.0;
  var hitDist = 0.0;
  for (var i = 0; i < 24; i = i + 1) {
    prevPos = pos;
    pos = pos + R * stepLen;
    stepLen = stepLen * 1.16;
    let sp = ssrProjUV(pos);
    if (sp.z <= 0.0) { break; }              // behind the eye
    let suv = sp.xy;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) { break; }
    let dz = ssrViewPos(suv).z - pos.z;      // >0 = ray passed behind a surface
    if (dz > thick && dz < max(5.0, stepLen * 1.5)) {   // step-scaled far-sky reject
      var a = prevPos;
      var b = pos;
      for (var j = 0; j < 4; j = j + 1) {    // binary refine -> crisp hit (GLX)
        let mid = (a + b) * 0.5;
        let muv = ssrProjUV(mid).xy;
        if (ssrViewPos(muv).z - mid.z > 0.20) { b = mid; } else { a = mid; }
      }
      let huv = ssrProjUV(b).xy;
      // GRAZING SELF-REFLECTION REJECT (road only): skim-hit on tarmac itself.
      // Car paint skips this — curved bodywork legitimately hits nearby geometry.
      if (!carDom) {
        let hP = ssrViewPos(huv);
        let hdx = ssrViewPos(huv + vec2<f32>(nT.x, 0.0)) - hP;
        let hdy = ssrViewPos(huv + vec2<f32>(0.0, nT.y)) - hP;
        var hN = normalize(cross(hdx, hdy));
        if (hN.z < 0.0) { hN = -hN; }
        if (dot(hN, upVSn) > 0.55) { continue; }
      }
      hitUV = huv;
      hitDist = length(b - P);
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
  // Vertical light-smear (GLX COMPOSITE_FS / TLX tsl-post): wet roads and
  // lacquer stretch reflected lights into a gloss-driven streak. WGX used to
  // take a single tap, so CAR GLOSS was a dead slider and night lamps sat
  // as hard dots. uv is y-DOWN; GLX vUV.y is y-UP.
  var hitCol = vec3<f32>(0.0);
  if (found) {
    let carSoft = clamp((1.4 - U.gloss.x) * 0.5, 0.0, 1.0);
    let yUp = 1.0 - in.uv.y;
    var streak = select(
      strength * (0.010 + 0.022 * clamp((yCut - yUp) / yCut, 0.0, 1.0)),
      carReflect * (0.006 + 0.030 * carSoft),
      carDom);
    streak = streak * mix(0.3, 1.6, clamp(hitDist / 25.0, 0.0, 1.0));
    let w0 = 0.30; let w1 = 0.24; let w2 = 0.15; let w3 = 0.08; let w4 = 0.04;
    hitCol  = textureSampleLevel(sceneTex, sceneSamp, hitUV, 0.0).rgb * w0;
    hitCol += textureSampleLevel(sceneTex, sceneSamp, hitUV + vec2<f32>(0.0, -streak * 0.5), 0.0).rgb * w1;
    hitCol += textureSampleLevel(sceneTex, sceneSamp, hitUV + vec2<f32>(0.0, -streak * 1.0), 0.0).rgb * w2;
    hitCol += textureSampleLevel(sceneTex, sceneSamp, hitUV + vec2<f32>(0.0, -streak * 1.6), 0.0).rgb * w3;
    hitCol += textureSampleLevel(sceneTex, sceneSamp, hitUV + vec2<f32>(0.0, -streak * 2.3), 0.0).rgb * w4;
    hitCol += textureSampleLevel(sceneTex, sceneSamp, hitUV + vec2<f32>(0.0,  streak * 0.5), 0.0).rgb * w1;
    hitCol += textureSampleLevel(sceneTex, sceneSamp, hitUV + vec2<f32>(0.0,  streak * 1.0), 0.0).rgb * w2;
    hitCol /= (w0 + 2.0 * w1 + 2.0 * w2 + w3 + w4);
  }
  var reflCol = mix(skyRefl, hitCol, conf);
  // Road: constant cover; car: confidence-scaled (falls through to lit env on miss).
  let cover = select(0.60, conf, carDom);
  // Soft-clip the reflected HDR colour before it's substituted (caps the mirror
  // at a sane peak while keeping its colour).
  reflCol = reflCol / (1.0 + reflCol * 0.35);

  // Fresnel lift toward the horizon + seam fade at the hard upper cutoff.
  // Off Nr, the same normal the ray used — Nv carries the road's facets and the
  // depth-derivative noise, and this term swings the amount across 0.55..0.97.
  let fres = pow(1.0 - max(dot(Nr, V), 0.0), 3.0);
  var amt = ssrGate * select(0.55 + 0.42 * fres, 0.50 + 0.45 * fres, carDom);
  // Dry sheen fade (GLX): at faint dry levels (reflect < 0.2) the darker-
  // mirror substitution reads as a sheen, not dark towers on sunlit tarmac.
  // Applied HERE so COMPOSITE can consume .a as the mix amount without
  // remultiplying wetness * reflect.
  let gateSrc = select(strength, carReflect, carDom);
  amt = amt * min(gateSrc / 0.20, 1.0);
  // Seam fade at the cutoff, in the same flipped y-UP coordinate as the gate.
  amt = amt * (1.0 - smoothstep(yCut - 0.06, yCut, 1.0 - in.uv.y));
  amt = clamp(amt * cover, 0.0, select(0.80, 0.85, carDom));
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
    SSR_UNIFORM_BYTES: 208,         // SsrU  (2×mat4 128 + 5×vec4 80)
    // chain description
    PASS_ORDER,
  };
})();

// No-build global export (mirror GLX/Parts/Tracks/WGSLChunks style).
if (typeof window !== "undefined") window.WGSLPost = WGSLPost;
