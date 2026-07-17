/*
 * Apex 26 — WGSL shader chunks (WebGPU migration, Phase 0/1).
 *
 * A minimal "shader chunk" registry — the WebGPU-side realization of the
 * maintainability review's recommendation (docs/WEBGPU-MAINTAINABILITY.md
 * §B / §C.1). It holds the shared *math leaves* that multiple WGSL passes will
 * want as named string fragments, exactly the way a future GLSL-side
 * `js/shaders/chunks.js` would (same chunk NAMES on both sides, so a change to
 * the noise/tonemap math is "edit two small leaves" instead of "hand-diff two
 * 850-line files").
 *
 * NO build step: these are plain JS template strings, concatenated at load,
 * assigning one global `WGSLChunks`. No imports, no ES modules.
 *
 * Scope for Phase 0/1: only the leaves the *sky* shader needs (hash, value
 * noise/fbm, an ACES tonemap leaf, and the fullscreen-triangle vertex helper),
 * plus the ported SKY shader itself (`WGSLChunks.SKY` — the simplest GLX shader,
 * SKY_FS at js/glx.js:901). The heavy Lit/Composite shaders are explicitly NOT
 * ported here (Phase 2/4).
 *
 * WGSL vs GLSL notes captured while porting (see docs/WEBGPU-PHASE0-NOTES.md):
 *  - texture(s,uv)          -> textureSample(t, s, uv)  (texture+sampler split)
 *  - vec3                   -> vec3<f32>, strict typing (1.0 not 1, explicit f32())
 *  - gl_VertexID            -> @builtin(vertex_index) (u32)
 *  - gl_Position (z=w)      -> @builtin(position); depth 1.0 via pos = vec4(p,1,1)
 *  - integer bit ops        -> WGSL needs u32 literals: (vi << 1u) & 2u
 */
"use strict";

const WGSLChunks = (function () {
  // ── hash: cheap value-hash leaves (mirror SKY_FS hash2/hash3, js/glx.js:916) ──
  const hash = `
fn hash2(p_in: vec2<f32>) -> f32 {
  var p = fract(p_in * vec2<f32>(127.1, 311.7));
  p = p + dot(p, p + 34.5);
  return fract(p.x * p.y);
}
fn hash3(p_in: vec3<f32>) -> f32 {
  var p = fract(p_in * 0.3183099 + vec3<f32>(0.1, 0.2, 0.3));
  p = p * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`;

  // ── vnoise: value noise + 4-octave fbm (mirror SKY_FS vnoise2/fbm, glx:926) ──
  // Depends on `hash` (uses hash2). This is the leaf that is duplicated in GLSL
  // today as vnoise/vnoise2 — here it lives once.
  const vnoise = `
fn vnoise(p_in: vec2<f32>) -> f32 {
  let i = floor(p_in);
  var f = fract(p_in);
  f = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2<f32>(1.0, 0.0));
  let c = hash2(i + vec2<f32>(0.0, 1.0));
  let d = hash2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn fbm(p_in: vec2<f32>) -> f32 {
  var p = p_in;
  var s = 0.0;
  var a = 0.5;
  for (var i = 0; i < 4; i = i + 1) {
    s = s + a * vnoise(p);
    p = p * 2.02;
    a = a * 0.5;
  }
  return s;
}`;

  // ── tonemap: ACES filmic approx — a shared math leaf the review names as one
  //    of the "single-source" candidates (acesTonemap, js/glx.js:1644). Not used
  //    by the sky (which outputs HDR straight to an LDR swapchain here), but
  //    included as the seed of the shared post-math the Composite port will use.
  const tonemap = `
fn acesTonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}`;

  // ── fullscreenTri: the empty-VBO fullscreen triangle (mirror SKY_VS/POST_VS
  //    gl_VertexID trick, js/glx.js:894). draw(3) with no vertex buffers; WGSL
  //    generates the NDC positions from @builtin(vertex_index).
  const fullscreenTri = `
fn fsTriNDC(vi: u32) -> vec2<f32> {
  // p = vec2((vi<<1)&2, vi&2) * 2 - 1  — the exact GLX SKY_VS derivation.
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  return vec2<f32>(x, y) * 2.0 - vec2<f32>(1.0);
}`;

  // ── brdf: the Cook-Torrance GGX trio shared by the Lit sun + point lights.
  //    Verbatim port of GLX's D_GGX / V_SmithGGX / F_Schlick (js/glx.js:107-125),
  //    the single-source math leaf the migration plan names (§2a). Any future
  //    edit to the microfacet model happens here, mirrored into the GLSL leaf.
  const brdf = `
const PI : f32 = 3.14159265359;
fn D_GGX(NoH: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = (NoH * NoH) * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-6);
}
// Height-correlated Smith visibility (folds in the 1/(4 NoL NoV) denominator).
fn V_SmithGGX(NoV: f32, NoL: f32, a: f32) -> f32 {
  let a2 = a * a;
  let gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  let gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
// Roughness-aware Schlick (f90 = 1-roughness, Frostbite grazing cap).
fn F_Schlick(VoH: f32, f0: vec3<f32>, f90: f32) -> vec3<f32> {
  let v = 1.0 - VoH; let v2 = v * v;
  return f0 + (vec3<f32>(f90) - f0) * (v2 * v2 * v);
}`;

  // ── LIT: a FAITHFUL-BUT-REDUCED WGSL port of GLX's Lit program
  //    (LIT_VS js/glx.js:9, LIT_FS js/glx.js:39-896). It renders the BASE PBR
  //    that carries the scene read: hemisphere ambient + Lambert sun diffuse +
  //    Cook-Torrance sun specular (soft-clipped), the 32 aimed point lights
  //    (windowed 1/d² falloff + spot cone + diffuse + GGX spec), emissive HDR
  //    glow, and height fog with sun in-scatter.
  //
  //    PHASE 3 (landed): sun shadow map (3×3-PCF compare, see the shadow block).
  //    PHASE 4 (landed): the deferred MATERIAL blocks now consume the plumbed
  //    scalars — each gated on its scalar so a 0 value is a no-op and the existing
  //    Phase-2/3 looks are byte-for-byte unchanged. Faithful-but-reduced ports:
  //      * [Block 1a/1b] ground/terrain detail micro-normal + procedural albedo
  //        grain  (detail = mat1.y ; GLX LIT_FS js/glx.js:405-422, 473-507)
  //      * [Block 2]    clearcoat 2nd low-roughness spec lobe (sun + lamp glints)
  //        (clearcoat = mat1.z ; GLX js/glx.js:657-680, 638-646)
  //      * [Block 3a]   car-paint orange-peel micro-normal
  //        (carPaint = mat1.w ; GLX js/glx.js:432-452)
  //      * [Block 4]    metallic-flake sparkle (view-dependent glint, paint-only)
  //        (sparkle = mat2.x, gated on carPaint ; GLX js/glx.js:732-756)
  //      * [Block 5/5b] wet-road response: lower roughness + grazing Fresnel sheen
  //        (wetness = params1.z ; GLX js/glx.js:519-546, 761-801)
  //      * [Block 6]    lamp-fog glow + low ground-mist  (GLX js/glx.js:864-891)
  //    PHASE 4 (deferred features, this file): PCSS-style shadow penumbra +
  //    cool shadow tint (params4.x/.y consumed in the shadow block);
  //      * [Block 7]    env-cube car-paint reflection (carReflect = params4.z ;
  //        group0 @binding 4/5 env cube+sampler ; mirrors GLX uCarReflect)
  //      * [Block 8]    wet-road SSR consumption (ssrStrength = params4.w ;
  //        group0 @binding 6 SSR-result texture from wgsl-post.js)
  //    STILL DEFERRED: analytic sky mirror + rim/AO (Phase 3 probe);
  //    per-material applyMaterial* bump/tint (brick/glass/metal/wood — the "14
  //    procedural materials").
  //
  //    UNIFORM LAYOUT — authored to WGSL std-layout rules and MUST match the
  //    JS-side struct writers in wgx.js (_writeFrame / _writeDraw). vec3s are
  //    padded to vec4 (16-byte align). Byte offsets are asserted in comments.
  //      FrameU  : 384 B (see WGX.FRAME_UNIFORM_BYTES)
  //      Light   :  64 B/light × 32 = 2048 B storage (see WGX.LIGHT_STRIDE_BYTES)
  //      DrawU   : 112 B, dynamic-offset stride 256 (see WGX.DRAW_UNIFORM_BYTES)
  const LIT = `
struct FrameU {
  viewProj   : mat4x4<f32>,   // off   0
  eye        : vec4<f32>,     // off  64  (xyz eye)
  sunDir     : vec4<f32>,     // off  80
  sunColor   : vec4<f32>,     // off  96
  ambSky     : vec4<f32>,     // off 112
  ambGround  : vec4<f32>,     // off 128
  skyZenith  : vec4<f32>,     // off 144
  skyHorizon : vec4<f32>,     // off 160
  fogColor   : vec4<f32>,     // off 176
  params0    : vec4<f32>,     // off 192  (fogDensity, fogHeight, time, numLights)
  params1    : vec4<f32>,     // off 208  (keyMul, glowAmp, wetness, cloud)
  lightVP    : mat4x4<f32>,   // off 224  sun light-space view-proj (shadow, Phase 3)
  params2    : vec4<f32>,     // off 288  (shadowOn, shadowStrength, shadowTexel, shadowBias)
  params3    : vec4<f32>,     // off 304  (bounceK, fogTint, groundMist, mistHeight) — live tuner knobs
  params4    : vec4<f32>,     // off 320  (pcssPen, shadowTintAmt, carReflect, ssrStrength) — Phase-4 deferred knobs
  params5    : vec4<f32>,     // off 336  (envProbeStr, _, _, _) — real env-cube probe strength
  shadowCtr  : vec4<f32>,     // off 352  (xyz unsnapped shadow-box anchor — fade origin; w shadowRange = box half-size m)
  params6    : vec4<f32>,     // off 368  (wetDark, _, _, _) — live wet-surface darkening
};                            // size 384
struct Light {
  posRad   : vec4<f32>,       // xyz pos, w radius
  colBleed : vec4<f32>,       // xyz colour*intensity, w out-of-beam bleed
  dirVol   : vec4<f32>,       // xyz beam aim, w volW (godray — unused here)
  cone     : vec4<f32>,       // x cosInner, y cosOuter, z glareW (unused), w pad
};                            // size 64
struct DrawU {
  model : mat4x4<f32>,        // off  0
  mat0  : vec4<f32>,          // off 64  (emissive, alpha, roughness, metalness)
  mat1  : vec4<f32>,          // off 80  (specular, detail, clearcoat, carPaint)
  mat2  : vec4<f32>,          // off 96  (sparkle, _, _, _)
};                            // size 112
@group(0) @binding(0) var<uniform> F : FrameU;
@group(0) @binding(1) var<storage, read> lights : array<Light, 32>;
@group(0) @binding(2) var shadowTex  : texture_depth_2d;
@group(0) @binding(3) var shadowSamp : sampler_comparison;
// ── Phase-4 deferred bindings (wgx.js binds real resources; placeholders are safe) ──
//   @binding(4) envCube   : texture_cube<f32>  — environment reflection probe
//                           (mirrors GLX uCarReflect env-mirror). 1×1 placeholder
//                           when no probe is captured; carReflect=0 makes it a no-op.
//   @binding(5) envSamp   : sampler            — filtering sampler for envCube (and SSR).
//   @binding(6) ssrTex    : texture_2d<f32>    — screen-space-reflection result
//                           (Phase-4 post pass, wgsl-post.js). 1×1 placeholder is safe;
//                           ssrStrength=0 or non-up/dry surfaces make it a no-op.
@group(0) @binding(4) var envCube : texture_cube<f32>;
@group(0) @binding(5) var envSamp : sampler;
@group(0) @binding(6) var ssrTex  : texture_2d<f32>;
@group(1) @binding(0) var<uniform> D : DrawU;
${hash}
${vnoise}
${brdf}

struct VSOut {
  @builtin(position) clip  : vec4<f32>,
  @location(0)       nrm   : vec3<f32>,
  @location(1)       col   : vec3<f32>,
  @location(2)       wpos  : vec3<f32>,
  @location(3)       dist  : f32,
  @location(4) @interpolate(flat) matId : f32,
};

@vertex
fn vs_main(
  @location(0) aPos : vec3<f32>,
  @location(1) aNrm : vec3<f32>,
  @location(2) aCol : vec3<f32>,
  @location(3) aMat : f32,
) -> VSOut {
  var o : VSOut;
  let wp = D.model * vec4<f32>(aPos, 1.0);
  // Upper-left 3x3 of the (column-major) model matrix — GLX mat3(uModel).
  let nm = mat3x3<f32>(D.model[0].xyz, D.model[1].xyz, D.model[2].xyz);
  o.nrm  = nm * aNrm;
  o.col  = aCol;
  o.wpos = wp.xyz;
  o.dist = length(wp.xyz - F.eye.xyz);
  o.matId = aMat;               // flat — procedural material key (Phase 4)
  o.clip = F.viewProj * wp;
  return o;
}

@fragment
fn fs_main(in : VSOut, @builtin(front_facing) ff : bool) -> @location(0) vec4<f32> {
  var N = normalize(in.nrm);
  // Two-sided lighting: flip N to face the viewer on back faces (double-sided
  // wheel/body draws) — GLX LIT_FS gl_FrontFacing branch (js/glx.js:404).
  if (!ff) { N = -N; }

  // ── Deferred material scalars (Phase 4) — all read from the already-plumbed
  //    DrawU/FrameU fields; a 0 value makes each block below a no-op so existing
  //    looks are unchanged. detail=mat1.y, clearcoat=mat1.z, carPaint=mat1.w,
  //    sparkle=mat2.x, wetness=F.params1.z.
  let detail    = D.mat1.y;
  let clearcoat = D.mat1.z;
  let carPaint  = D.mat1.w;
  let sparkle   = D.mat2.x;
  let wetness   = F.params1.z;

  // [Block 1a] Ground/terrain detail MICRO-NORMAL (mirrors GLX LIT_FS js/glx.js:405-422).
  // Two-scale value-noise gradient perturbs N so procedurally-textured ground gets
  // real bumps (sun/lamp glints break up over the surface instead of one polished
  // sheet). Distance-faded (would alias to shimmer) and wetness-faded (the water
  // film levels the surface).
  if (detail > 0.001) {
    let mnFade = clamp(1.0 - (in.dist - 25.0) / 70.0, 0.0, 1.0) * (1.0 - wetness * 0.75);
    if (mnFade > 0.01) {
      let mnp = in.wpos.xz * 1.7;
      let e = 0.22;
      let h0 = vnoise(mnp) * 0.7 + vnoise(mnp * 3.9) * 0.3;
      let hx = vnoise(mnp + vec2<f32>(e, 0.0)) * 0.7 + vnoise(mnp * 3.9 + vec2<f32>(e * 3.9, 0.0)) * 0.3;
      let hz = vnoise(mnp + vec2<f32>(0.0, e)) * 0.7 + vnoise(mnp * 3.9 + vec2<f32>(0.0, e * 3.9)) * 0.3;
      N = normalize(N + vec3<f32>(h0 - hx, 0.0, h0 - hz) * ((detail * 0.4 * mnFade) / e));
    }
  }
  // Geometric normal snapshot for the smooth clearcoat lobe + flake tangent frame:
  // orange-peel/flake live UNDER the lacquer, so they must not roughen the mirror
  // shell (GLX LIT_FS js/glx.js:431).
  let Ngeo = N;
  // [Block 3a] Car-paint ORANGE-PEEL micro-normal (mirrors GLX LIT_FS js/glx.js:432-452).
  // Coarse waviness + fine flake wobble perturb N so the sun streak / sky reflection
  // shimmer live on the panels. GLX keys this to OBJECT space (vObjPos); WGSL has no
  // object-position varying yet, so we key to world pos — faithful-but-reduced (a
  // touch of texture-swim, invisible at the 0.22 amplitude). Distance-faded.
  if (carPaint > 0.001) {
    let pFade = clamp(1.0 - (in.dist - 18.0) / 50.0, 0.0, 1.0);
    if (pFade > 0.01) {
      let puv = in.wpos.xz * 34.0 + in.wpos.y * 29.0;
      let fuv = in.wpos.xz * 130.0 + in.wpos.y * 111.0;
      let pe = 0.09;
      let pb0 = vnoise(puv) * 0.6 + vnoise(fuv) * 0.4;
      let pbx = (vnoise(puv + vec2<f32>(pe, 0.0)) * 0.6 + vnoise(fuv + vec2<f32>(pe * 3.8, 0.0)) * 0.4) - pb0;
      let pby = (vnoise(puv + vec2<f32>(0.0, pe)) * 0.6 + vnoise(fuv + vec2<f32>(0.0, pe * 3.8)) * 0.4) - pb0;
      let pT = normalize(cross(N, vec3<f32>(0.0, 1.0, 0.001)) + vec3<f32>(1e-4));
      let pB = cross(N, pT);
      N = normalize(N + (pT * pbx + pB * pby) * (0.22 * carPaint * pFade));
    }
  }
  let V = normalize(F.eye.xyz - in.wpos);
  let L = F.sunDir.xyz;
  let H = normalize(L + V + vec3<f32>(1e-5));   // +eps: normalize(0) NaNs at V==-L
  let NoL = max(dot(N, L), 0.0);
  let NoV = max(dot(N, V), 1e-4);
  let NoH = max(dot(N, H), 0.0);
  let VoH = max(dot(V, H), 0.0);

  var albedo    = in.col;
  let emissive  = D.mat0.x;
  let alpha     = D.mat0.y;
  let metalness = D.mat0.w;
  let specular  = D.mat1.x;
  var rough     = clamp(D.mat0.z, 0.04, 1.0);
  let keyMul    = F.params1.x;

  // [Block 1b] Procedural ground ALBEDO grain (mirrors GLX LIT_FS js/glx.js:473-507,
  // reduced: coarse+fine value-noise grain + repair-patch tint/roughness; the sparse
  // crack lines are dropped). Multiplicative, so it darkens as much as it lightens.
  var patchM = 0.5;
  if (detail > 0.0) {
    let wp = in.wpos.xz;
    let fineFade = clamp(1.0 - (in.dist - 35.0) / 90.0, 0.0, 1.0);
    let n = vnoise(wp * 0.35) * 0.60 + vnoise(wp * 2.1) * 0.40 * fineFade;
    albedo = albedo * (1.0 + (n - 0.5) * detail);
    patchM = vnoise(wp * 0.055 + vec2<f32>(9.1));
    let pm = smoothstep(0.52, 0.72, patchM);
    albedo = albedo * (1.0 - pm * 0.05 * min(detail * 4.0, 1.0));
    albedo = max(albedo, vec3<f32>(0.0));
    rough = clamp(rough + (patchM - 0.5) * 0.16 * min(detail * 4.0, 1.0), 0.04, 1.0);
  }

  var f0 = mix(vec3<f32>(0.08 * specular), albedo, metalness);

  // [Block 5] WET-ROAD material response (mirrors GLX LIT_FS js/glx.js:519-546). Rain
  // darkens + polishes up-facing ground; a value-noise mask pools puddles that go
  // near-mirror. Lowers effective roughness and lifts f0 toward a water film so the
  // sun/lamp GGX speculars (which read rough/a/f0) elongate into wet streaks. Full
  // SSR + puddle reflection is Phase-4 wgx-side; here just the material response.
  var wet = 0.0;
  if (wetness > 0.001) {
    let upFace = smoothstep(0.50, 0.90, N.y);   // flat ground only
    wet = wetness * upFace;
    let pn = vnoise(in.wpos.xz * 0.13 + vec2<f32>(4.7));
    let puddle = smoothstep(0.48, 0.88, pn) * wet;
    albedo = albedo * mix(1.0, clamp(1.0 - 0.58 * F.params6.x, 0.0, 1.0), wet);
    albedo = albedo * mix(1.0, 0.50, puddle);
    rough = mix(rough, 0.15, wet);
    rough = mix(rough, 0.05, puddle);
    f0 = mix(f0, vec3<f32>(0.04), wet * 0.6);    // thin water film dielectric
  }

  let a = rough * rough;

  // Hemisphere ambient + Lambert sun (== GLX base diffuse when metalness==0).
  // Ground fill is NOT scaled by anything — matches GLX js/glx.js:639
  // amb = mix(uAmbGround, uAmbSky, N.y*0.5+0.5). BOUNCE (params3.x) is the
  // per-lamp bounce-fill strength (== GLX uBounceK), consumed in the lamp loop below.
  let amb = mix(F.ambGround.xyz, F.ambSky.xyz, N.y * 0.5 + 0.5);
  // Sun shadow (Phase 3): project the world pos into the sun's light-space clip,
  // then 3×3-PCF compare against the depth map (WebGPU NDC z is already [0,1], so
  // no -1..1 remap). shadowSamp is a comparison sampler — Level variant is legal
  // in non-uniform control flow. shadow = fraction lit (1 = fully lit).
  //
  // PHASE 4: PCSS-STYLE PENUMBRA (F.params4.x = pcssPen) widens the PCF sample
  // radius so contact edges stay crisp while the body softens — a fixed-kernel
  // approximation of PCSS (no blocker search; pcssPen scales the filter step).
  // pcssPen=0 keeps the exact Phase-3 1-texel 3×3 kernel (byte-for-byte no-op).
  var shadow = 1.0;
  if (F.params2.x > 0.5) {
    let sc = F.lightVP * vec4<f32>(in.wpos, 1.0);
    let ndc = sc.xyz / sc.w;
    let suv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    // Distance + border fade (GLX sampleShadow parity, js/shaders/glx-shaders.js).
    // Dissolve shadows by receiver distance from the UNSNAPPED box anchor
    // (F.shadowCtr.xyz, glides with the camera) instead of hard-cutting at the
    // box border: the box recentres in sBox/4 = 16 m snaps (game.js shadow pass),
    // so an unfaded border made the whole shadow field's edge JUMP 16 m at a time
    // while driving. The UV border fade stays as a safety clamp for worst-case
    // box alignments. shadowCtr.w = shadowRange (box half-size, m).
    let shRange = max(F.shadowCtr.w, 1.0);
    var edgeFade = 1.0 - smoothstep(shRange * 0.62, shRange * 0.84, distance(in.wpos, F.shadowCtr.xyz));
    let ef = smoothstep(vec2<f32>(0.0), vec2<f32>(0.03), suv)
           * (1.0 - smoothstep(vec2<f32>(0.97), vec2<f32>(1.0), suv));
    edgeFade = edgeFade * ef.x * ef.y;
    if (edgeFade > 0.0 && ndc.z <= 1.0) {
      let refD = ndc.z - max(F.params2.w, 0.0);   // SHADOW BIAS knob (params2.w)
      // PENUMBRA: pcfStep = texel * (1 + pcssPen). pcssPen=0 -> unchanged.
      let pcfStep = F.params2.z * (1.0 + max(F.params4.x, 0.0));   // params2.z = 1/shadowMapSize
      var s = 0.0;
      for (var oy = -1; oy <= 1; oy = oy + 1) {
        for (var ox = -1; ox <= 1; ox = ox + 1) {
          s = s + textureSampleCompareLevel(shadowTex, shadowSamp,
                    suv + vec2<f32>(f32(ox), f32(oy)) * pcfStep, refD);
        }
      }
      // Clamped like GLX: SHADOW DARKNESS reaches 2.0 and mix() extrapolates
      // above t=1 — unclamped, sh~0 went NEGATIVE (negative light -> psychedelic
      // grade output in shadowed areas).
      shadow = max(0.0, mix(1.0, s / 9.0, F.params2.y * edgeFade));   // params2.y = shadow strength
    }
  }
  let litNoL = NoL * keyMul * shadow;
  // SHADOW TINT (F.params4.y = shadowTintAmt): push shadowed regions toward a cool
  // colour (sky-fill bias), applied to the hemisphere ambient so cast shadows read
  // as cool ambient occlusion. shadowTintAmt=0 -> tintMul is 1 (no-op).
  let shadowTintAmt = max(F.params4.y, 0.0);
  let tintMul = mix(vec3<f32>(1.0), vec3<f32>(0.80, 0.88, 1.08), (1.0 - shadow) * shadowTintAmt);
  var color = albedo * (amb * tintMul + F.sunColor.xyz * litNoL * (1.0 - metalness));

  // Cook-Torrance sun specular, soft-clipped so highlights sheen not clip.
  let Dg = D_GGX(NoH, a);
  let Vg = V_SmithGGX(NoV, NoL, a);
  let Fg = F_Schlick(VoH, f0, clamp(1.0 - rough, 0.0, 1.0));
  var specCol = (Dg * Vg) * Fg * F.sunColor.xyz * litNoL;
  specCol = specCol / (1.0 + specCol);
  color = color + specCol;

  // [Block 2] CLEARCOAT 2nd specular lobe (mirrors GLX LIT_FS js/glx.js:657-680). A
  // second, fixed low-roughness (a=0.035) GGX lobe over the base coat catches a crisp
  // sun glint on the smooth lacquer even where the base coat is rough — the glossy
  // showroom read. Uses the UNPERTURBED geometric normal (Ngeo) so the flake wobble
  // roughens only the base coat and this streak stays sharp. Soft-clipped to a 2.6
  // HDR ceiling so the hot core punches past the bloom threshold.
  if (clearcoat > 0.001) {
    let Hg = normalize(L + V);
    let NoHg = max(dot(Ngeo, Hg), 0.0);
    let NoVg = max(dot(Ngeo, V), 1e-4);
    let NoLg = max(dot(Ngeo, L), 0.0);
    let ccA = 0.035;
    let Dc = D_GGX(NoHg, ccA);
    let Vc = V_SmithGGX(NoVg, NoLg, ccA);
    let Fc = F_Schlick(max(dot(V, Hg), 0.0), vec3<f32>(0.05), 1.0).x;
    var ccCol = vec3<f32>(Dc * Vc * Fc) * F.sunColor.xyz * NoLg * shadow * clearcoat;
    ccCol = 2.6 * ccCol / (2.6 + ccCol);
    color = color + ccCol;
  }

  // [Block 7] ENV car-paint reflection (mirrors GLX uCarReflect env-mirror). On
  // lacquered surfaces (car-paint or clearcoat) reflect the environment along the
  // view-reflection vector, weighted by a grazing Fresnel so the mirror strengthens
  // toward the edges. TWO sources, matching GLX:
  //   • carReflect (F.params4.z): the ANALYTIC sky gradient (skyHorizon↔skyZenith by
  //     the reflected ray's Y, same convention as the wet-road sheen Block 5b). Always
  //     available, cheap — the default (carEnvCube=0) and the mobile-safe path.
  //   • envProbeStr (F.params5.x): the REAL live cube probe (wgx.js envFaceBegin/End).
  //     Non-zero only after a full 6-face capture cycle when the CAR ENV REFLECTION
  //     tuner is on — then the paint mirrors actual surroundings (trees, buildings,
  //     everything behind the camera SSR can't see). Supersedes the analytic sky.
  // textureSampleLevel (explicit LOD 0) keeps the cube sample legal in this branch.
  let carReflect  = max(F.params4.z, 0.0);
  let envProbeStr = max(F.params5.x, 0.0);
  if ((carReflect > 0.001 || envProbeStr > 0.001) && (carPaint > 0.001 || clearcoat > 0.001)) {
    let R = reflect(-V, Ngeo);
    var envCol : vec3<f32>;
    var strength : f32;
    if (envProbeStr > 0.001) {
      envCol = textureSampleLevel(envCube, envSamp, R, 0.0).rgb;
      strength = envProbeStr;
    } else {
      let skyRT = pow(max(R.y, 1e-4), 0.40);
      envCol = mix(F.skyHorizon.xyz, F.skyZenith.xyz, skyRT);
      strength = carReflect;
    }
    let envF = F_Schlick(NoV, f0, clamp(1.0 - rough, 0.0, 1.0));
    let refl = envCol * envF * strength * (1.0 - rough * 0.5);
    color = color + refl;
  }

  // Physically-based punctual lights (floodlights / street lamps) — verbatim
  // math from GLX LIT_FS (js/glx.js:579-647): windowed 1/d² falloff, aimed spot
  // cone, diffuse pool + GGX spec. No per-light shadows (cost); the cone shapes
  // the light. (Bounce-fill + per-lamp clearcoat glint deferred to Phase 4.)
  var lampFog = vec3<f32>(0.0);   // lamp irradiance reaching the fog column (Block 6)
  let nL = i32(F.params0.w);
  for (var i = 0; i < nL; i = i + 1) {
    let LP = lights[i].posRad.xyz - in.wpos;
    let dist = length(LP);
    let rad = lights[i].posRad.w;
    if (dist > rad) { continue; }
    let Ld = LP / max(dist, 1e-3);
    let dn = dist / rad;
    let win = clamp(1.0 - dn * dn * dn * dn, 0.0, 1.0);
    let distC = max(dist, 4.0);
    let att = (win * win) / (distC * distC + 1.0);
    if (att < 1e-6) { continue; }
    let lcol  = lights[i].colBleed.xyz;
    let bleed = lights[i].colBleed.w;
    let cd = dot(-Ld, lights[i].dirVol.xyz);
    let beam = smoothstep(lights[i].cone.y, lights[i].cone.x, cd);
    lampFog = lampFog + lcol * (att * mix(0.35, 1.0, beam));   // Block 6 in-scatter (GLX js/glx.js:616)
    let spotD = mix(bleed, 1.0, beam);
    let NoLl = max(dot(N, Ld), 0.0);
    color = color + albedo * lcol * (att * spotD) * NoLl * (1.0 - metalness);
    // Bounce fill: pool light bounced off the road washes nearby surfaces (walls,
    // kerbs, car flanks) with the lamp tint even outside the beam — a near-free
    // stand-in for local ambient probes, with a soft NoL floor (mirrors GLX
    // js/glx.js:716; BOUNCE = params3.x = uBounceK, default 0.04).
    color = color + albedo * lcol * (att * F.params3.x * (0.55 + 0.45 * NoLl)) * (1.0 - metalness);
    // GGX specular from the lamp (same microfacet BRDF as the sun).
    let Hl = normalize(Ld + V);
    let NoHl = max(dot(N, Hl), 0.0);
    let VoHl = max(dot(V, Hl), 0.0);
    let Dl = D_GGX(NoHl, a);
    let Vl = V_SmithGGX(NoV, NoLl, a);
    let Fll = F_Schlick(VoHl, f0, clamp(1.0 - rough, 0.0, 1.0));
    let radianceS = lcol * att;   // spotS floor (wet/dry) deferred with the wet model
    var lspec = (Dl * Vl) * Fll * radianceS * NoLl;
    lspec = lspec / (1.0 + lspec);
    color = color + lspec;
    // [Block 2 — lamp portion] The clearcoat lacquer catches the floodlights too: a
    // crisp low-roughness lens glint over the softer base highlight (GLX js/glx.js:638-646).
    if (clearcoat > 0.001) {
      let Dcc = D_GGX(NoHl, 0.03);
      let Vcc = V_SmithGGX(NoV, NoLl, 0.01);
      let Fcc = F_Schlick(VoHl, vec3<f32>(0.05), 1.0).x;
      var ccl = vec3<f32>(Dcc * Vcc * Fcc) * radianceS * NoLl * clearcoat;
      color = color + 2.2 * ccl / (2.2 + ccl);
    }
  }

  // [Block 4] Metallic-flake SPARKLE (mirrors GLX LIT_FS js/glx.js:732-756). A
  // view-dependent micro-glint: each tiny cell gets a random flake tilt and flashes
  // only when its facet half-aligns with the sun. sparkle DEFAULTS TO 1, so the
  // effect is gated on carPaint>0 AND on a non-dark albedo — non-paint meshes
  // (carPaint=0) and the dark carbon/tyre parts stay untouched. GLX cells in object
  // space (vObjPos); reduced to world space here (no object-pos varying yet).
  if (carPaint > 0.001 && litNoL > 0.0 && sparkle > 0.001) {
    var spFade = clamp(1.0 - (in.dist - 14.0) / 30.0, 0.0, 1.0) * sparkle;
    spFade = spFade * smoothstep(0.06, 0.22, max(albedo.r, max(albedo.g, albedo.b)));
    if (spFade > 0.01) {
      let cell = floor(in.wpos * 45.0);
      let h1 = hash3(cell);
      let h2 = hash3(cell + vec3<f32>(19.7, 7.3, 3.1));
      // Mirror the GLSL finite-basis guard: malformed/degenerate geometry must
      // not feed normalize(0) and spray NaN glints across the paint.
      var nN = vec3<f32>(0.0, 1.0, 0.0);
      if (length(Ngeo) > 1e-4) {
        nN = normalize(Ngeo);
      }
      let fT = normalize(cross(nN, vec3<f32>(0.0, 1.0, 0.001)) + vec3<f32>(1e-4));
      let fB = cross(nN, fT);
      let gN = normalize(nN + (fT * (h1 * 2.0 - 1.0) + fB * (h2 * 2.0 - 1.0)) * 0.5);
      let glint = smoothstep(0.990, 1.0, dot(gN, H));
      color = color + F.sunColor.xyz * litNoL * glint * 1.6 * carPaint * spFade;
    }
  }

  // [Block 5b] WET-ROAD grazing SHEEN (mirrors GLX LIT_FS js/glx.js:761-801, reduced
  // to the material response — full SSR is Phase-4 wgx-side). On wet up-facing ground
  // a boosted grazing Fresnel tints the surface with the sky gradient reflected in the
  // view ray, so the tarmac mirrors a faint sky band at the far grazing edge.
  if (wet > 0.001) {
    let Rw = reflect(-V, N);
    let skyT = pow(max(Rw.y, 1e-4), 0.40);
    let envColor = mix(F.skyHorizon.xyz, F.skyZenith.xyz, skyT);
    let ef = 1.0 - max(dot(N, V), 0.0);
    let envFresnel = ef * ef * ef * ef * ef;   // 5th power: concentrate into the grazing band
    let envAdd = envColor * envFresnel * wet * 0.9 * (1.0 - metalness);
    let envM = max(max(envAdd.r, envAdd.g), envAdd.b);
    color = color + envAdd / (1.0 + envM);
  }

  // [Block 8] SSR consumption (F.params4.w = ssrStrength). On up-facing WET ground
  // blend in the screen-space-reflection result (computed by the Phase-4 post pass,
  // wgsl-post.js) scaled by wetness * ssrStrength — a real mirror where puddles pool.
  // Screen uv comes from the fragment framebuffer position / SSR texture size
  // (textureDimensions), so it stays aligned without a resolution uniform. Reuses
  // envSamp (clamped). A 1×1 placeholder or ssrStrength=0 makes this a no-op.
  let ssrStrength = max(F.params4.w, 0.0);
  if (wet > 0.001 && ssrStrength > 0.001) {
    let ssrUV = in.clip.xy / vec2<f32>(textureDimensions(ssrTex));
    let ssr = textureSampleLevel(ssrTex, envSamp, ssrUV, 0.0).rgb;
    let ssrK = clamp(wet * ssrStrength, 0.0, 1.0) * (1.0 - metalness);
    color = mix(color, ssr, ssrK);
  }

  // Emissive: lerp to unlit albedo + HDR glow lift for bright/warm surfaces so
  // lit windows / neon / lamp lenses bloom (GLX LIT_FS js/glx.js:826-839).
  if (emissive > 0.0) {
    color = mix(color, albedo, emissive);
    let bright = max(albedo.r, max(albedo.g, albedo.b));
    let glow = smoothstep(0.50, 0.95, bright) * emissive;
    color = color + albedo * glow * F.params1.y;   // params1.y = uGlowAmp
  }

  // Height-based fog + sun in-scatter (GLX LIT_FS js/glx.js:841-877; lamp-fog /
  // ground-mist volumetrics deferred to Phase 4).
  let fogDensity = F.params0.x;
  let fogHeight  = F.params0.y;
  var heightAtten = 1.0;
  if (fogHeight > 0.0) {
    heightAtten = exp(-max(in.wpos.y - F.eye.y, 0.0) * fogHeight);
  }
  let fd = in.dist * fogDensity * heightAtten;
  let fAmt = 1.0 - exp(-fd * fd);
  let rd = normalize(in.wpos - F.eye.xyz);
  let sunAmt = max(dot(rd, F.sunDir.xyz), 1e-4);   // floor: pow(0,n) NaNs on mobile
  var fogCol = mix(F.fogColor.xyz, F.sunColor.xyz, pow(sunAmt, 4.0));
  fogCol = fogCol + F.sunColor.xyz * pow(sunAmt, 16.0) * 0.6;
  // FOG TINT knob (params3.y, -1..1): warm (+) or cool (-) the distance haze.
  let fTint = F.params3.y;
  fogCol = fogCol * vec3<f32>(1.0 + fTint * 0.16, 1.0 - abs(fTint) * 0.02, 1.0 - fTint * 0.16);
  // [Block 6 — lamp-fog] Nearby floodlights/neon tint the DISTANT fog wall so it
  // glows around the lamps at night (mirrors GLX LIT_FS js/glx.js:864-877, reduced:
  // fixed soft-clip, no uLampFog knob). lampFog is 0 with no lamps, so it is a no-op
  // by day; the mix by fAmt gates it so clear near air gets no halo.
  let lf = lampFog * 0.6;
  let lampFogC = lf / (1.0 + max(max(lf.r, lf.g), lf.b));
  fogCol = fogCol + lampFogC;
  color = mix(color, fogCol, fAmt);

  // [Block 6 — ground mist] Low drifting FBM haze pooling near the surface (mirrors
  // GLX LIT_FS js/glx.js:976-985). GROUND MIST (params3.z) carries frame.groundMist ×
  // mistDensity (uploaded wgx.js d[78], == GLX uGroundMist) and gates the whole block
  // exactly like GLX (if uGroundMist > 0.001) — no fogDensity proxy, so clear/dry
  // air is a true no-op. MIST HEIGHT (params3.w) sets the vertical falloff.
  let mistK = max(F.params3.z, 0.0);
  if (mistK > 0.001) {
    let mh = max(F.params3.w, 0.05);
    let lowH = max(in.wpos.y - (F.eye.y - 5.0), 0.0);
    let band = exp(-lowH / (mh * 20.0));
    let mp = in.wpos.xz * 0.020 + vec2<f32>(F.params0.z * 0.010, F.params0.z * 0.006);
    let dRamp = clamp((in.dist - 8.0) / 45.0, 0.0, 1.0);
    let mistAmt = mistK * band * smoothstep(0.35, 0.72, fbm(mp)) * dRamp * 0.5;
    let mistCol = mix(F.fogColor.xyz, F.sunColor.xyz, pow(sunAmt, 3.0)) + lampFogC * 1.5;
    color = mix(color, mistCol, clamp(mistAmt, 0.0, 0.35));
  }

  return vec4<f32>(color, alpha);
}`;

  // ── SHADOW: depth-only sun-shadow caster pass (Phase 3). Vertex-only pipeline
  //    (no fragment stage) — rasterises clip-space depth into the shadow map from
  //    the sun's POV. Model rides a dynamic-offset uniform so terrain / road /
  //    props share one buffer (one slot per castShadow* call).
  const SHADOW = `
struct ShadowU { lightVP : mat4x4<f32> };
struct ShadowModel { model : mat4x4<f32> };
@group(0) @binding(0) var<uniform> S : ShadowU;
@group(1) @binding(0) var<uniform> M : ShadowModel;
@vertex
fn vs_main(@location(0) aPos : vec3<f32>) -> @builtin(position) vec4<f32> {
  return S.lightVP * (M.model * vec4<f32>(aPos, 1.0));
}`;

  // ── BLIT: the present() resolve. Samples the RGBA16F scene target, applies
  //    exposure + the shared ACES tonemap leaf, writes the LDR swapchain. A
  //    stand-in for the full Phase-4 post chain (bloom/SSAO/godray/SSR/grade/
  //    flare/FXAA). Fullscreen triangle; uv flips Y into texture space.
  const BLIT = `
struct BlitU { params : vec4<f32> };   // x = exposure
@group(0) @binding(0) var srcTex  : texture_2d<f32>;
@group(0) @binding(1) var srcSamp : sampler;
@group(0) @binding(2) var<uniform> B : BlitU;
${fullscreenTri}
${tonemap}
struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
};
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VOut {
  var o : VOut;
  let p = fsTriNDC(vi);
  o.pos = vec4<f32>(p, 0.0, 1.0);
  o.uv = vec2<f32>((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return o;
}
@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let hdr = textureSampleLevel(srcTex, srcSamp, in.uv, 0.0).rgb * B.params.x;
  return vec4<f32>(acesTonemap(hdr), 1.0);
}`;

  // ── SKY: the first real WGSL shader. A *reduced but faithful* port of SKY_FS
  //    (js/glx.js:901) — gradient (zenith/horizon), golden-hour horizon warmth,
  //    a basic procedural cloud layer, Mie sun corona + disc, stars, moon, and
  //    city skyglow. Composed from the leaves above.
  //
  //    Deliberately reduced vs GLX SKY_FS (drops the overcast grey-shift, the
  //    twilight cloud-bank enrichment, and azimuthal gradient variation) — those
  //    land in Phase 2 when the sky becomes the real drawSky() call. This is the
  //    end-to-end pipeline proof, not the final look.
  //
  //    Uniform block layout MUST match WGX._writeSky() (see wgx.js). vec3s are
  //    padded to vec4 per WGSL's 16-byte alignment.
  const SKY = `
struct SkyU {
  invViewProj : mat4x4<f32>,   // 64 B
  zenith      : vec4<f32>,     // xyz colour
  horizon     : vec4<f32>,     // xyz colour
  sunDir      : vec4<f32>,     // xyz
  sunColor    : vec4<f32>,     // xyz
  cityGlow    : vec4<f32>,     // xyz night light-pollution dome
  p0          : vec4<f32>,     // (stars, cloud, time, moon)
  p1          : vec4<f32>,     // (starBright, cloudSpeed, _, _)
};
@group(0) @binding(0) var<uniform> U : SkyU;
${hash}
${vnoise}
${fullscreenTri}

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       dir : vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VSOut {
  var o : VSOut;
  let p = fsTriNDC(vi);
  o.pos = vec4<f32>(p, 1.0, 1.0);           // z = w -> depth 1.0 (far plane)
  let a = U.invViewProj * vec4<f32>(p, -1.0, 1.0);
  let b = U.invViewProj * vec4<f32>(p,  1.0, 1.0);
  o.dir = b.xyz / b.w - a.xyz / a.w;
  return o;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let dir = normalize(in.dir);
  let up = dir.y;
  let sunDir = U.sunDir.xyz;
  let sunColor = U.sunColor.xyz;
  let sd = max(dot(dir, sunDir), 0.0);
  let stars = U.p0.x;
  let cloud = U.p0.y;
  let time = U.p0.z;
  let moon = U.p0.w;
  let starBright = U.p1.x;
  let cloudSpeed = U.p1.y;

  let sunE = clamp(sunDir.y * 1.4, 0.0, 1.0);
  let daytime = smoothstep(0.35, 0.60, sunE);
  // NIGHT gate (parity with GLX): at night sunDir stays HIGH as the moon
  // key-light direction, which the sunElevation math reads as midday and paints
  // a bright white sun disc among the stars. Suppress the sun corona/disc at
  // night; the moon disc below is drawn separately.
  let nightSky = step(0.5, stars);

  // --- Sky gradient ---
  var c : vec3<f32>;
  if (up >= 0.0) {
    c = mix(U.horizon.xyz, U.zenith.xyz, pow(max(up, 0.0), 0.35));
    // Golden-hour warm band near the horizon when the sun is low.
    let goldenAmt = (1.0 - smoothstep(0.0, 0.72, sunE)) * (1.0 - smoothstep(0.0, 0.32, up));
    let goldenColor = mix(vec3<f32>(0.70, 0.22, 0.04), vec3<f32>(0.92, 0.55, 0.16),
                          clamp(sunE * 2.5, 0.0, 1.0));
    c = mix(c, c * 0.45 + goldenColor * 0.55, goldenAmt * 0.80);
  } else {
    let gnd = clamp(-up * 5.0, 0.0, 1.0);
    c = mix(U.horizon.xyz * 0.85, vec3<f32>(0.035, 0.030, 0.022), gnd * gnd);
  }

  // --- Procedural cloud layer (basic) ---
  if (cloud > 0.001 && up > 0.012) {
    let cp = dir.xz / up * 0.42;
    let cT = time * cloudSpeed;
    let cp1 = cp + vec2<f32>(cT * 0.0028, cT * 0.0011);
    let cp2 = cp + vec2<f32>(cT * 0.0017, cT * 0.0023);
    let f = fbm(cp1);
    let cov = smoothstep(0.50 - cloud * 0.42, 0.84, f) * smoothstep(0.013, 0.05, up);
    let thick = clamp(fbm(cp2 * 0.55 + vec2<f32>(3.1, 1.7)) * 2.0 - 0.55, 0.0, 1.0);
    let sl = pow(sd, 2.0);
    let sunBright = max(sunColor.r, max(sunColor.g, sunColor.b));
    let cloudTop = mix(vec3<f32>(0.58, 0.62, 0.70), vec3<f32>(1.0, 0.97, 0.91), sl)
                 * (0.38 + 0.62 * sunBright);
    let cloudBot = vec3<f32>(0.26, 0.27, 0.34) * (0.24 + 0.44 * sunBright);
    var lit = mix(cloudBot, cloudTop, clamp(0.18 + (1.0 - thick) * 0.75, 0.0, 1.0));
    let silver = pow(sd, 6.0) * (1.0 - thick);
    lit = lit + sunColor * silver * 1.3;
    c = mix(c, lit, cov);
  }

  // --- Mie forward scatter + sun corona/disc ---
  let upPos = max(up, 0.0);
  c = mix(c, sunColor, pow(sd, 5.0) * 0.22 * max(1.0 - upPos * 1.5, 0.0));
  let golden = 1.0 - smoothstep(0.0, 0.45, sunE);
  let coronaDamp = 1.0 - nightSky;
  let sunWarm = mix(sunColor, sunColor * vec3<f32>(1.18, 0.52, 0.24), golden);
  c = c + sunWarm * pow(sd, mix(20.0, 8.0, golden)) * (0.55 + golden * 0.55) * coronaDamp;
  c = c + sunWarm * pow(sd, 300.0) * 0.95 * coronaDamp;
  let dd = dir - sunDir * sd;
  let perp = length(vec2<f32>(length(dd.xz), dd.y * mix(1.0, 1.6, golden)));
  let disc = smoothstep(mix(0.018, 0.028, golden), 0.006, perp) * coronaDamp;
  let discCore = mix(vec3<f32>(2.3, 2.2, 1.9), sunWarm * 2.8, golden);
  c = c + discCore * disc;

  // --- Stars ---
  if (stars > 0.5 && up > 0.05) {
    let SC = 180.0;
    let cell = floor(dir * SC);
    let h = hash3(cell);
    if (h > 0.9968) {
      let jit = vec3<f32>(hash3(cell + 7.1), hash3(cell + 13.7), hash3(cell + 29.3)) - 0.5;
      let sdir = normalize((cell + 0.5 + jit * 0.8) / SC);
      let dstar = length(dir - sdir);
      let bright = 0.30 + 0.55 * hash3(cell + 43.0);
      let phase = hash3(cell + 31.0) * 6.2832;
      let twinkle = 0.80 + 0.20 * sin(time * 1.4 + phase);
      let giant = step(0.9995, h);
      let srad = mix(0.0016, 0.0028, giant);
      let star = smoothstep(srad, srad * 0.35, dstar) * min(0.88, bright * twinkle * (1.0 + giant * 0.6));
      c = c + vec3<f32>(star) * starBright;
    }
  }

  // --- Moon disc + halo ---
  if (moon > 0.0 && stars > 0.5) {
    let moonDir = normalize(vec3<f32>(0.42, 0.72, 0.55));
    let md = dot(dir, moonDir);
    let moonPerp = length(dir - moonDir * max(md, 0.0));
    let moonDisc = smoothstep(0.025, 0.010, moonPerp) * moon;
    let moonHalo = exp(-moonPerp * moonPerp * 140.0) * 0.28 * moon;
    if (up > 0.0 && md > 0.0) {
      c = c + vec3<f32>(0.82, 0.88, 1.00) * (moonDisc * 1.10 + moonHalo);
    }
  }

  // --- City skyglow ---
  if (U.cityGlow.x + U.cityGlow.y + U.cityGlow.z > 0.001) {
    let horiz = pow(clamp(1.0 - max(dir.y, 0.0) * 2.4, 0.0, 1.0), 3.0);
    c = c + U.cityGlow.xyz * horiz;
  }

  return vec4<f32>(c, 1.0);
}`;

  return {
    // named leaves (for future passes to compose)
    hash,
    vnoise,
    tonemap,
    fullscreenTri,
    brdf,
    // real shaders, pre-composed from the leaves above
    SKY,
    LIT,
    BLIT,
    SHADOW,
    // byte size of the SkyU uniform block (mat4 64 + 7*vec4 112 = 176)
    SKY_UNIFORM_BYTES: 176,
    // Lit-pipeline uniform block sizes (see the LIT struct comments; the JS-side
    // writers in wgx.js MUST agree with these).
    FRAME_UNIFORM_BYTES: 384,   // FrameU (Phase 3: +lightVP +params2; tune: +params3; Phase 4: +params4..params6; +shadowCtr)
    SHADOW_LVP_BYTES: 64,       // ShadowU (lightVP mat4)
    SHADOW_MODEL_BYTES: 64,     // ShadowModel (model mat4), dynamic-offset stride 256
    LIGHT_STRIDE_BYTES: 64,     // one Light
    MAX_LIGHTS: 32,
    DRAW_UNIFORM_BYTES: 112,    // DrawU used bytes (dynamic-offset stride is 256)
    BLIT_UNIFORM_BYTES: 16,     // BlitU
  };
})();

// No-build global export (mirror GLX/Parts/Tracks style).
if (typeof window !== "undefined") window.WGSLChunks = WGSLChunks;
