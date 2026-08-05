/*
 * Apex 26 — WGSL shader chunks (WebGPU migration, Phase 0/1).
 *
 * A minimal "shader chunk" registry — the WebGPU-side realization of the
 * maintainability review's recommendation (docs/archive/webgpu/WEBGPU-MAINTAINABILITY.md
 * §B / §C.1). It holds the shared *math leaves* that multiple WGSL passes will
 * want as named string fragments, exactly the way a future GLSL-side
 * `js/render/shaders/chunks.js` would (same chunk NAMES on both sides, so a change to
 * the noise/tonemap math is "edit two small leaves" instead of "hand-diff two
 * 850-line files").
 *
 * NO build step: these are plain JS template strings, concatenated at load,
 * assigning one global `WGSLChunks`. No imports, no ES modules.
 *
 * Scope for Phase 0/1: only the leaves the *sky* shader needs (hash, value
 * noise/fbm, an ACES tonemap leaf, and the fullscreen-triangle vertex helper),
 * plus the ported SKY shader itself (`WGSLChunks.SKY` — the simplest GLX shader,
 * SKY_FS at js/render/glx.js:901). The heavy Lit/Composite shaders are explicitly NOT
 * ported here (Phase 2/4).
 *
 * WGSL vs GLSL notes captured while porting (see docs/archive/webgpu/WEBGPU-PHASE0-NOTES.md):
 *  - texture(s,uv)          -> textureSample(t, s, uv)  (texture+sampler split)
 *  - vec3                   -> vec3<f32>, strict typing (1.0 not 1, explicit f32())
 *  - gl_VertexID            -> @builtin(vertex_index) (u32)
 *  - gl_Position (z=w)      -> @builtin(position); depth 1.0 via pos = vec4(p,1,1)
 *  - integer bit ops        -> WGSL needs u32 literals: (vi << 1u) & 2u
 */
"use strict";

const WGSLChunks = (function () {
  // ── hash: cheap value-hash leaves (mirror SKY_FS hash2/hash3, js/render/glx.js:916) ──
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
  //    of the "single-source" candidates (acesTonemap, js/render/glx.js:1644). Not used
  //    by the sky (which outputs HDR straight to an LDR swapchain here), but
  //    included as the seed of the shared post-math the Composite port will use.
  // Coefficients are passed in (TONE CURVE knobs on the composite path; the BLIT
  // stand-in passes the shipped defaults). Defaults 2.51/0.03/2.43/0.59/0.14
  // reproduce the Narkowicz curve byte-for-byte. e is floored >0 by the slider
  // min so the denominator can't reach 0 for x>=0.
  const tonemap = `
fn acesTonemap(x: vec3<f32>, a: f32, b: f32, c: f32, d: f32, e: f32) -> vec3<f32> {
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}`;

  // ── fullscreenTri: the empty-VBO fullscreen triangle (mirror SKY_VS/POST_VS
  //    gl_VertexID trick, js/render/glx.js:894). draw(3) with no vertex buffers; WGSL
  //    generates the NDC positions from @builtin(vertex_index).
  const fullscreenTri = `
fn fsTriNDC(vi: u32) -> vec2<f32> {
  // p = vec2((vi<<1)&2, vi&2) * 2 - 1  — the exact GLX SKY_VS derivation.
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  return vec2<f32>(x, y) * 2.0 - vec2<f32>(1.0);
}`;

  // ── brdf: the Cook-Torrance GGX trio shared by the Lit sun + point lights.
  //    Verbatim port of GLX's D_GGX / V_SmithGGX / F_Schlick (js/render/glx.js:107-125),
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
  //    (LIT_VS js/render/glx.js:9, LIT_FS js/render/glx.js:39-896). It renders the BASE PBR
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
  //        grain  (detail = mat1.y ; GLX LIT_FS js/render/glx.js:405-422, 473-507)
  //      * [Block 2]    clearcoat 2nd low-roughness spec lobe (sun + lamp glints)
  //        (clearcoat = mat1.z ; GLX js/render/glx.js:657-680, 638-646)
  //      * [Block 3a]   car-paint orange-peel micro-normal
  //        (carPaint = mat1.w ; GLX js/render/glx.js:432-452)
  //      * [Block 4]    metallic-flake sparkle (view-dependent glint, paint-only)
  //        (sparkle = mat2.x, gated on carPaint ; GLX js/render/glx.js:732-756)
  //      * [Block 5/5b] wet-road response: lower roughness + grazing Fresnel sheen
  //        (wetness = params1.z ; GLX js/render/glx.js:519-546, 761-801)
  //      * [Block 6]    lamp-fog glow + low ground-mist  (GLX js/render/glx.js:864-891)
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
  //      FrameU  : 464 B (see WGX.FRAME_UNIFORM_BYTES)
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
  params5    : vec4<f32>,     // off 336  (envProbeStr, cloudSpeed, cloudShadowDim, mistShare) — env-cube probe strength (0 = analytic sky only), cloud-shadow drift rate, cloud-shadow depth, ground-mist share of the lamp-fog glow
  shadowCtr  : vec4<f32>,     // off 352  (xyz unsnapped shadow-box anchor — fade origin; w shadowRange = box half-size m)
  params6    : vec4<f32>,     // off 368  (wetDark, carShadowOn, carSparkle, fogSunCore) — wet darkening + car-shadow arm flag + pure-look sparkle/fog knobs (zw always packed; WGSL reads them directly)
  carLightVP : mat4x4<f32>,   // off 384  Z01-remapped car-shadow view-proj (per-frame car-only map)
  params7    : vec4<f32>,     // off 448  (fogClip, carSunGlint, neonBoost, lampNearClamp) — GLX-parity lit-shader knobs (uLampFogClip / uCarSunGlint / uBloomBoost / uLampNearClamp); always packed, WGSL reads them directly
};                            // size 464
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
@group(0) @binding(7) var blockerTex : texture_2d<f32>;      // PCSS-lite min-depth blocker map (512², r16float)
@group(0) @binding(8) var carShadowTex : texture_depth_2d;   // per-frame car-only shadow map (shares shadowSamp)
@group(1) @binding(0) var<uniform> D : DrawU;
${hash}
${vnoise}
${brdf}

// Drifting cloud-shadow dapple (GLX parity, js/render/shaders/lit.js
// cloudFBM/cloudShadow): FBM sampled where the sun ray through the receiver
// meets a 360 m cloud deck, drifted by time × CLOUD SPEED so the ground dapple
// moves in lockstep with the sky. cover = F.params1.w, cloudSpeed = F.params5.y.
// Was entirely missing from the WebGPU port — partly-cloudy day tracks read
// uniformly lit while WebGL2 showed cloud shadows crossing the track.
fn cloudFBM(p_in: vec2<f32>) -> f32 {
  var p = p_in; var s = 0.0; var a = 0.5;
  for (var i = 0; i < 2; i = i + 1) { s = s + a * vnoise(p); p = p * 2.03 + 1.7; a = a * 0.5; }
  return s;
}
fn cloudShadow(wp: vec3<f32>) -> f32 {
  let cover = F.params1.w;
  // Divisor floored at 0.15 (not the 0.06 cutoff): near-grazing sun rays blow
  // the deck-intersection offset up and over-sample the noise into stripes —
  // same fix as GLX.
  if (cover <= 0.001 || F.sunDir.y <= 0.06) { return 0.0; }
  let t = (360.0 - wp.y) / max(F.sunDir.y, 0.15);
  let cT = F.params0.z * F.params5.y;
  let cp = (wp.xz + F.sunDir.xz * t) * 0.0052 + vec2<f32>(cT * 0.012, cT * 0.005);
  return smoothstep(0.54 - cover * 0.40, 0.92, cloudFBM(cp)) * cover;
}

fn findBlocker(suv : vec2<f32>, bt : f32) -> f32 {
  let d0 = textureSampleLevel(blockerTex, envSamp, suv + vec2<f32>(-bt,  bt), 0.0).r;
  let d1 = textureSampleLevel(blockerTex, envSamp, suv + vec2<f32>( bt,  bt), 0.0).r;
  let d2 = textureSampleLevel(blockerTex, envSamp, suv + vec2<f32>(-bt, -bt), 0.0).r;
  let d3 = textureSampleLevel(blockerTex, envSamp, suv + vec2<f32>( bt, -bt), 0.0).r;
  return min(min(d0, d1), min(d2, d3));
}

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
  // wheel/body draws) — GLX LIT_FS gl_FrontFacing branch (js/render/glx.js:404).
  if (!ff) { N = -N; }

  // ── Deferred material scalars (Phase 4) — all read from the already-plumbed
  //    DrawU/FrameU fields; a 0 value makes each block below a no-op so existing
  //    looks are unchanged. detail=mat1.y, clearcoat=mat1.z, carPaint=mat1.w,
  //    sparkle=mat2.x, wetness=F.params1.z.
  let detail    = D.mat1.y;
  var clearcoat = D.mat1.z;
  var carPaint  = D.mat1.w;
  let sparkle   = D.mat2.x;
  let wetness   = F.params1.z;
  // Car3D surface ids are isolated above TrackGeom's 0..15 range. Keep id 0 on
  // the legacy whole-draw path for imported/custom meshes.
  let surfaceId = i32(in.matId + 0.5);
  let classifiedCar = surfaceId >= 20 && surfaceId <= 26;
  let paintSurface = surfaceId == 20;
  let carbonSurface = surfaceId == 21;
  let rubberSurface = surfaceId == 22;
  let metalSurface = surfaceId == 23;
  let glassSurface = surfaceId == 24;
  let emissiveSurface = surfaceId == 25;
  let panelSurface = surfaceId == 26;
  if (classifiedCar) {
    if (paintSurface) {
      carPaint = D.mat1.w;
      clearcoat = D.mat1.z;
    } else {
      carPaint = 0.0;
      clearcoat = select(0.0, D.mat1.z * 0.45, glassSurface);
    }
  }
  let envSurface = (carPaint > 0.001 || glassSurface) && clearcoat > 0.001;

  // [Block 1a] Ground/terrain detail MICRO-NORMAL (mirrors GLX LIT_FS js/render/glx.js:405-422).
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
  // shell (GLX LIT_FS js/render/glx.js:431).
  let Ngeo = N;
  // Screen-space derivatives of that geometric normal, for the clearcoat lobe's
  // specular-AA widening in [Block 2] far below. They are taken HERE, at uniform
  // control flow, because WGSL forbids dpdx/dpdy inside a non-uniform branch:
  // taking them inside the clearcoat branch is a hard COMPILE ERROR
  // ("'dpdx' must only be called from uniform control flow") which invalidates
  // the whole lit pipeline — and WebGPU reports that asynchronously, so the
  // backend still "initialises" and then draws an all-black world. Ngeo is a
  // let-binding and never reassigned, so the value is what it was there.
  let ccDx = dpdx(Ngeo);
  let ccDy = dpdy(Ngeo);
  // [Block 3a] Car-paint ORANGE-PEEL micro-normal (mirrors GLX LIT_FS js/render/glx.js:432-452).
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
  var emissive  = D.mat0.x;
  let alpha     = D.mat0.y;
  var metalness = D.mat0.w;
  var specular  = D.mat1.x;
  var rough     = clamp(D.mat0.z, 0.04, 1.0);
  let keyMul    = F.params1.x;
  if (classifiedCar) {
    metalness = select(0.0, max(D.mat0.w, 0.78), metalSurface);
    if (carbonSurface) { metalness = 0.08; }
    if (rubberSurface) { specular = 0.18; }
    if (metalSurface) { specular = 1.0; }
    if (carbonSurface) { specular = 0.48; }
    if (panelSurface) { specular = 0.35; }
    emissive = select(0.0, D.mat0.x, paintSurface);
    if (emissiveSurface) { emissive = max(D.mat0.x, 1.0); }
    if (carbonSurface) { rough = max(rough, 0.56); }
    if (rubberSurface) { rough = max(rough, 0.90); }
    if (metalSurface) { rough = min(rough, 0.16); }
    if (glassSurface) { rough = min(rough, 0.13); }
    if (emissiveSurface) { rough = max(rough, 0.32); }
    if (panelSurface) { rough = max(rough, 0.72); }
  }

  // [Block 1b] Procedural ground ALBEDO grain (mirrors GLX LIT_FS js/render/glx.js:473-507,
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

  // [Block 5] WET-ROAD material response (mirrors GLX LIT_FS js/render/glx.js:519-546). Rain
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
  // Ground fill is NOT scaled by anything — matches GLX js/render/glx.js:639
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
    // Distance + border fade (GLX sampleShadow parity, js/render/shaders/lit.js).
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
      // Slope-scale bias (GLX parity, js/render/shaders/lit.js sampleShadow):
      // a constant-only bias can't cover grazing sun angles on walls / banked
      // kerbs — acne that shimmers while driving — and raising the constant
      // knob to hide it peter-pans flat ground instead. Same clamp band, and
      // the knob contributes HALVED exactly like GLX (uShadowBias * 0.5).
      let cosT = clamp(dot(Ngeo, F.sunDir.xyz), 0.05, 1.0);
      let slopeB = F.params2.z * 1.5 * (sqrt(1.0 - cosT * cosT) / cosT);
      let refD = ndc.z - clamp(slopeB, 0.0005, 0.004) - max(F.params2.w, 0.0) * 0.5;   // SHADOW BIAS knob (params2.w)
      // True PCSS-Lite for WebGPU: blocker search scales the penumbra dynamically
      let aDist = distance(in.wpos, F.shadowCtr.xyz);
      let near = aDist < shRange * 0.80;
      var pcfStep = F.params2.z;
      if (near && F.params4.x > 0.0) {
        let boxK = min(1.0, 64.0 / F.shadowCtr.w);
        let bt = (1.5 / 512.0) * boxK;
        let zb = findBlocker(suv, bt);
        let pen = clamp((refD - zb) * (F.params4.x * 266.666), 0.0, 1.0);
        pcfStep = F.params2.z * (1.0 + max(F.params4.x, 0.0) * pen);
      } else {
        pcfStep = F.params2.z * (1.0 + max(F.params4.x, 0.0));
      }
      var s = 0.0;
      for (var oy = -1; oy <= 1; oy = oy + 1) {
        for (var ox = -1; ox <= 1; ox = ox + 1) {
          s = s + textureSampleCompareLevel(shadowTex, shadowSamp,
                    suv + vec2<f32>(f32(ox), f32(oy)) * pcfStep, refD);
        }
      }
      var sh = s / 9.0;
      // Dynamic CAR shadows (GLX parity): min-combine the per-frame car-only
      // map — cars can't live in the snap-cached static map, so without this
      // they cast nothing. Same slope/constant bias; params6.y arms it only on
      // frames where wgx ran the car caster pass; carLightVP is the Z01-remapped
      // matrix the car map was rasterised with.
      if (F.params6.y > 0.5) {
        let cc = F.carLightVP * vec4<f32>(in.wpos, 1.0);
        let cn = cc.xyz / cc.w;
        let cuv = vec2<f32>(cn.x * 0.5 + 0.5, 0.5 - cn.y * 0.5);
        if (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0 && cn.z <= 1.0) {
          let crefD = cn.z - clamp(slopeB, 0.0005, 0.004) - max(F.params2.w, 0.0) * 0.5;
          let ct = (1.0 / 1024.0) * 0.75;   // CAR_SHADOW_SIZE texel, tightened
          let csh = ( textureSampleCompareLevel(carShadowTex, shadowSamp, cuv + vec2<f32>(-ct, -ct), crefD)
                    + textureSampleCompareLevel(carShadowTex, shadowSamp, cuv + vec2<f32>( ct, -ct), crefD)
                    + textureSampleCompareLevel(carShadowTex, shadowSamp, cuv + vec2<f32>(-ct,  ct), crefD)
                    + textureSampleCompareLevel(carShadowTex, shadowSamp, cuv + vec2<f32>( ct,  ct), crefD) ) * 0.25;
          sh = min(sh, csh);
        }
      }
      // Clamped like GLX: SHADOW DARKNESS reaches 2.0 and mix() extrapolates
      // above t=1 — unclamped, sh~0 went NEGATIVE (negative light -> psychedelic
      // grade output in shadowed areas).
      shadow = max(0.0, mix(1.0, sh, F.params2.y * edgeFade));   // params2.y = shadow strength
    }
  }
  // Cloud dapple multiplies the cast shadow exactly like GLX (LIT_FS composite):
  // applied outside the depth-map gate, so broken cloud still shades the ground
  // even where/when the sun shadow map is off.
  // CLOUD SHADOW DEPTH knob (F.params5.z; GLX parity). _writeFrame always packs
  // the resolved value (0.80 default), so 0 here means a real "no cloud shade".
  shadow = shadow * (1.0 - cloudShadow(in.wpos) * F.params5.z);
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

  // [Block 2] CLEARCOAT 2nd specular lobe (mirrors GLX LIT_FS js/render/glx.js:657-680). A
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
    // Specular AA (GLX parity): widen the fixed lobe by the geometric-normal
    // variance so the streak stops strobing on tight curvature; flat panels
    // keep the crisp 0.035. Capped so silhouette edges can't matte it out.
    // ccDx/ccDy are hoisted to uniform control flow (see where Ngeo is bound).
    let ccSaaVar = dot(ccDx, ccDx) + dot(ccDy, ccDy);
    let ccA = min(sqrt(0.035 * 0.035 + ccSaaVar * 0.25), 0.30);
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
  if ((carReflect > 0.001 || envProbeStr > 0.001) && envSurface) {
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
    // CAR SUN GLINT knob (F.params7.y = uCarSunGlint, def 12.0; GLX js/render/shaders/lit.js):
    // a tight sun disc reflected in the lacquer. Folded into the env colour so it rides
    // the same mirror weight (envF·strength) exactly as GLX adds it to envCC before ×envW.
    // Base floored at 1e-4 — pow(0.0, 400.0) is NaN on mobile GPUs (log2(0) = -Inf).
    envCol = envCol + F.sunColor.xyz * pow(max(dot(R, F.sunDir.xyz), 1e-4), 400.0) * F.params7.y * shadow;
    let envF = F_Schlick(NoV, f0, clamp(1.0 - rough, 0.0, 1.0));
    let refl = envCol * envF * strength * (1.0 - rough * 0.5);
    color = color + refl;
  }

  // Physically-based punctual lights (floodlights / street lamps) — verbatim
  // math from GLX LIT_FS (js/render/glx.js:579-647): windowed 1/d² falloff, aimed spot
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
    let distC = max(dist, F.params7.w);   // LAMP NEAR CLAMP knob (uLampNearClamp, def 4.0)
    let att = (win * win) / (distC * distC + 1.0);
    if (att < 1e-6) { continue; }
    let lcol  = lights[i].colBleed.xyz;
    let bleed = lights[i].colBleed.w;
    let cd = dot(-Ld, lights[i].dirVol.xyz);
    let beam = smoothstep(lights[i].cone.y, lights[i].cone.x, cd);
    lampFog = lampFog + lcol * (att * mix(0.35, 1.0, beam));   // Block 6 in-scatter (GLX js/render/glx.js:616)
    let spotD = mix(bleed, 1.0, beam);
    let NoLl = max(dot(N, Ld), 0.0);
    color = color + albedo * lcol * (att * spotD) * NoLl * (1.0 - metalness);
    // Bounce fill: pool light bounced off the road washes nearby surfaces (walls,
    // kerbs, car flanks) with the lamp tint even outside the beam — a near-free
    // stand-in for local ambient probes, with a soft NoL floor (mirrors GLX
    // js/render/glx.js:716; BOUNCE = params3.x = uBounceK, default 0.04).
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
    // crisp low-roughness lens glint over the softer base highlight (GLX js/render/glx.js:638-646).
    if (clearcoat > 0.001) {
      let Dcc = D_GGX(NoHl, 0.03);
      let Vcc = V_SmithGGX(NoV, NoLl, 0.01);
      let Fcc = F_Schlick(VoHl, vec3<f32>(0.05), 1.0).x;
      var ccl = vec3<f32>(Dcc * Vcc * Fcc) * radianceS * NoLl * clearcoat;
      color = color + 2.2 * ccl / (2.2 + ccl);
    }
  }

  // [Block 4] Metallic-flake SPARKLE (mirrors GLX LIT_FS js/render/glx.js:732-756). A
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
      // CAR SPARKLE knob (F.params6.z; GLX parity, def 1.6). Read directly — 0 is
      // a valid "no sparkle", so the uploader always packs the resolved value.
      color = color + F.sunColor.xyz * litNoL * glint * F.params6.z * carPaint * spFade;
    }
  }

  // [Block 5b] WET-ROAD grazing SHEEN (mirrors GLX LIT_FS js/render/glx.js:761-801, reduced
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
  // lit windows / neon / lamp lenses bloom (GLX LIT_FS js/render/glx.js:826-839).
  if (emissive > 0.0) {
    color = mix(color, albedo, emissive);
    let bright = max(albedo.r, max(albedo.g, albedo.b));
    let glow = smoothstep(0.50, 0.95, bright) * emissive;
    // NEON BOOST knob (F.params7.z = uBloomBoost, def 0.6; GLX js/render/shaders/lit.js):
    // albedos authored ABOVE white (neon bands ~2.5, lamp lenses 1.06-1.40) are the
    // "this surface IS a light source" tag — scale the extra HDR push by how far past
    // white the albedo is so neon/signage bloom harder without dragging every emissive
    // surface (and the fog) up with a bigger uGlowAmp.
    let hdrTag = max(bright - 1.0, 0.0);
    color = color + albedo * glow * F.params1.y * (1.0 + hdrTag * F.params7.z);   // params1.y = uGlowAmp
  }

  // Height-based fog + sun in-scatter (GLX LIT_FS js/render/glx.js:841-877; lamp-fog /
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
  // FOG SUN CORE knob (F.params6.w; GLX parity, def 0.6). Read directly — 0 is a
  // valid "no hot core", so the uploader always packs the resolved value.
  fogCol = fogCol + F.sunColor.xyz * pow(sunAmt, 16.0) * F.params6.w;
  // FOG TINT knob (params3.y, -1..1): warm (+) or cool (-) the distance haze.
  let fTint = F.params3.y;
  fogCol = fogCol * vec3<f32>(1.0 + fTint * 0.16, 1.0 - abs(fTint) * 0.02, 1.0 - fTint * 0.16);
  // [Block 6 — lamp-fog] Nearby floodlights/neon tint the DISTANT fog wall so it
  // glows around the lamps at night (mirrors GLX LIT_FS js/render/glx.js:864-877, reduced:
  // fixed soft-clip, no uLampFog knob). lampFog is 0 with no lamps, so it is a no-op
  // by day; the mix by fAmt gates it so clear near air gets no halo.
  let lf = lampFog * 0.6;
  // FOG LAMP CLIP knob (F.params7.x = uLampFogClip, def 0.7; GLX js/render/shaders/lit.js):
  // scales the soft-clip denominator so a lamp cluster can never push the fog wall
  // past the night bloom threshold into a white wash. lampFogC is reused by the
  // ground-mist glow below, so the knob shapes both halos.
  let lampFogC = lf / (1.0 + max(max(lf.r, lf.g), lf.b) * F.params7.x);
  fogCol = fogCol + lampFogC;
  color = mix(color, fogCol, fAmt);

  // [Block 6 — ground mist] Low drifting FBM haze pooling near the surface (mirrors
  // GLX LIT_FS js/render/glx.js:976-985). GROUND MIST (params3.z) carries frame.groundMist ×
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
    // MIST GLOW SHARE knob (F.params5.w; GLX uMistShare parity, def 1.5).
    let mistCol = mix(F.fogColor.xyz, F.sunColor.xyz, pow(sunAmt, 3.0)) + lampFogC * F.params5.w;
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
  // Stand-in resolve: fixed shipped ACES coefficients (the TONE CURVE knobs only
  // reach the full composite path, not this fallback blit).
  return vec4<f32>(acesTonemap(hdr, 2.51, 0.03, 2.43, 0.59, 0.14), 1.0);
}`;

  // ── BLOCKER: min-of-4 downsample of the sun shadow depth map into the 512²
  //    r16float blocker map (PCSS-lite blocker-search source; GLX BLOCKER_FS
  //    parity). This chunk was MISSING when wgx.js first referenced
  //    WGSLChunks.BLOCKER — createShaderModule({code: undefined}) threw and
  //    killed the whole WGX init (silent GLX fallback). Bindings must match
  //    blockerG0Layout in wgx.js: 0 = shadow depth texture, 1 = non-filtering
  //    sampler, 2 = BlockerU (xy = 1/SHADOW_SIZE source texel).
  const BLOCKER = `
struct BlockerU { srcTexel : vec4<f32> };   // xy = 1/SHADOW_SIZE
@group(0) @binding(0) var depthTex : texture_depth_2d;
@group(0) @binding(1) var depthSamp : sampler;
@group(0) @binding(2) var<uniform> B : BlockerU;
${fullscreenTri}
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
  let t = B.srcTexel.xy;
  let d0 = textureSampleLevel(depthTex, depthSamp, in.uv + t * vec2<f32>(-1.0, -1.0), 0);
  let d1 = textureSampleLevel(depthTex, depthSamp, in.uv + t * vec2<f32>( 1.0, -1.0), 0);
  let d2 = textureSampleLevel(depthTex, depthSamp, in.uv + t * vec2<f32>(-1.0,  1.0), 0);
  let d3 = textureSampleLevel(depthTex, depthSamp, in.uv + t * vec2<f32>( 1.0,  1.0), 0);
  return vec4<f32>(min(min(d0, d1), min(d2, d3)), 0.0, 0.0, 1.0);
}`;

  // ── SKY: the first real WGSL shader. A *reduced but faithful* port of SKY_FS
  //    (js/render/glx.js:901) — gradient (zenith/horizon), golden-hour horizon warmth,
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
  p1          : vec4<f32>,     // (starBright, cloudSpeed, skyGrad, starDensity)
  p2          : vec4<f32>,     // (mieScatter, cloudSilver, coronaAureole, sunDiscSize) — pure-look knobs; read directly (0 is a real "off"), uploader always packs the resolved default
  p3          : vec4<f32>,     // (daySkyBlue, starSize, starTwinkle, moonDiscSize) — GLX-parity sky knobs; read directly, uploader always packs the resolved default (1.0 = as-shipped)
  p4          : vec4<f32>,     // (moonHalo, sunCorona, sunSquash, cityGlowReach) — GLX-parity sky knobs; read directly, uploader always packs the resolved default (1.0 = as-shipped)
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
  // SKY GRADIENT / STAR DENSITY knobs (GLX parity). Defaults reproduce shipped.
  let skyGrad = select(0.35, U.p1.z, U.p1.z > 0.0);
  let starDensity = select(1.0, U.p1.w, U.p1.w > 0.0);
  // Pure-look knobs (GLX parity). Read DIRECTLY — 0 is a valid "off" for the
  // first three, so a select-on-zero would wrongly snap them back to 1.0. The
  // uploader always packs the resolved value (default 1.0 reproduces the ship).
  let mieScatter    = U.p2.x;
  let cloudSilver   = U.p2.y;
  let coronaAureole = U.p2.z;
  let sunDiscSize   = max(U.p2.w, 1e-3);   // disc size scales a divisor-like edge; keep > 0
  // DAY SKY BLUE knob (GLX parity, def 1.0). Read directly — 0 is a valid "no
  // deep-blue band", so the uploader always packs the resolved value.
  let daySkyBlue    = U.p3.x;
  // More GLX-parity sky knobs (def 1.0). Read directly — 0 is a valid "off" for
  // most; the two that scale a divisor (disc/halo sizes) are floored > 0. The
  // uploader always packs the resolved value.
  let starSize      = max(U.p3.y, 1e-3);   // scales a smoothstep radius; keep > 0
  let starTwinkle   = U.p3.z;
  let moonDiscSize  = max(U.p3.w, 1e-3);   // scales smoothstep edges; keep > 0
  let moonHaloK     = max(U.p4.x, 1e-3);   // divides a falloff; keep > 0
  let sunCorona     = U.p4.y;
  let sunSquash     = U.p4.z;
  let cityGlowReach = U.p4.w;

  let sunE = clamp(sunDir.y * 1.4, 0.0, 1.0);
  // NIGHT gate (parity with GLX): at night sunDir stays HIGH as the moon
  // key-light direction, which the sunElevation math reads as midday and paints
  // a bright white sun disc among the stars. Suppress the sun corona/disc at
  // night; the moon disc below is drawn separately.
  let nightSky = step(0.5, stars);
  // Gate daytime by (1 - nightSky) so the day-only deep-blue band never paints a
  // blue gradient among the stars (GLX js/render/shaders/sky.js).
  let daytime = smoothstep(0.35, 0.60, sunE) * (1.0 - nightSky);
  // Overcast factor: fades the deep-blue band under heavy cloud so grey days are
  // untouched (GLX js/render/shaders/sky.js).
  let overcast = smoothstep(0.5, 1.0, cloud);

  // --- Sky gradient ---
  var c : vec3<f32>;
  if (up >= 0.0) {
    c = mix(U.horizon.xyz, U.zenith.xyz, pow(max(up, 0.0), skyGrad));
    // Day gradient LIFE (GLX js/render/shaders/sky.js): a deeper
    // saturated blue pushed into the low/mid band so the gameplay sky strip isn't
    // a flat pale wash. Day-only and faded under overcast, so dusk/dawn/night and
    // grey days are untouched. DAY SKY BLUE knob scales the band; clamp keeps the
    // blend valid when the knob pushes past 1.
    let bandLM = (1.0 - smoothstep(0.06, 0.55, up)) * smoothstep(0.0, 0.06, up);
    let deepBlue = vec3<f32>(0.10, 0.30, 0.72);
    c = mix(c, mix(c, deepBlue, 0.30), clamp(daytime * (1.0 - overcast) * bandLM * daySkyBlue, 0.0, 1.0));
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
  // covRay: cloud coverage seen along this ray, hoisted for the star-occlusion
  // term below (GLX parity — stars fade out behind the deck).
  var covRay = 0.0;
  if (cloud > 0.001 && up > 0.012) {
    let cp = dir.xz / up * 0.42;
    let cT = time * cloudSpeed;
    let cp1 = cp + vec2<f32>(cT * 0.0028, cT * 0.0011);
    let cp2 = cp + vec2<f32>(cT * 0.0017, cT * 0.0023);
    let f = fbm(cp1);
    let cov = smoothstep(0.50 - cloud * 0.42, 0.84, f) * smoothstep(0.013, 0.05, up);
    covRay = cov;
    let thick = clamp(fbm(cp2 * 0.55 + vec2<f32>(3.1, 1.7)) * 2.0 - 0.55, 0.0, 1.0);
    let sl = pow(sd, 2.0);
    let sunBright = max(sunColor.r, max(sunColor.g, sunColor.b));
    let cloudTop = mix(vec3<f32>(0.58, 0.62, 0.70), vec3<f32>(1.0, 0.97, 0.91), sl)
                 * (0.38 + 0.62 * sunBright);
    let cloudBot = vec3<f32>(0.26, 0.27, 0.34) * (0.24 + 0.44 * sunBright);
    var lit = mix(cloudBot, cloudTop, clamp(0.18 + (1.0 - thick) * 0.75, 0.0, 1.0));
    let silver = pow(sd, 6.0) * (1.0 - thick);
    lit = lit + sunColor * silver * 1.3 * cloudSilver;   // CLOUD SILVER LINING knob
    c = mix(c, lit, cov);
  }

  // --- Mie forward scatter + sun corona/disc ---
  let upPos = max(up, 0.0);
  // MIE SCATTER knob (clamp keeps the mix blend valid past 1).
  c = mix(c, sunColor, clamp(pow(sd, 5.0) * 0.22 * max(1.0 - upPos * 1.5, 0.0) * mieScatter, 0.0, 1.0));
  let golden = 1.0 - smoothstep(0.0, 0.45, sunE);
  let coronaDamp = 1.0 - nightSky;
  let sunWarm = mix(sunColor, sunColor * vec3<f32>(1.18, 0.52, 0.24), golden);
  c = c + sunWarm * pow(sd, mix(20.0, 8.0, golden)) * (0.55 + golden * 0.55) * coronaDamp * coronaAureole;   // SUN AUREOLE knob
  c = c + sunWarm * pow(sd, 300.0) * 0.95 * sunCorona * coronaDamp;   // SUN CORONA RING knob
  let dd = dir - sunDir * sd;
  // SUN HORIZON SQUASH knob: scales the golden-hour vertical squash of the disc.
  let perp = length(vec2<f32>(length(dd.xz), dd.y * mix(1.0, mix(1.0, 1.6, golden), sunSquash)));
  // SUN DISC SIZE knob: scale both smoothstep edges to grow/shrink the disc.
  let disc = smoothstep(mix(0.018, 0.028, golden) * sunDiscSize, 0.006 * sunDiscSize, perp) * coronaDamp;
  let discCore = mix(vec3<f32>(2.3, 2.2, 1.9), sunWarm * 2.8, golden);
  c = c + discCore * disc;

  // --- Stars ---
  if (stars > 0.5 && up > 0.05) {
    let SC = 180.0;
    let cell = floor(dir * SC);
    let h = hash3(cell);
    // STAR DENSITY knob (GLX parity): scale the (1 - threshold) spawn window,
    // clamped below 1 so a huge density can't reject every cell to a blank sky.
    if (h > min(0.9994, 1.0 - (1.0 - 0.9968) * starDensity)) {
      let jit = vec3<f32>(hash3(cell + 7.1), hash3(cell + 13.7), hash3(cell + 29.3)) - 0.5;
      let sdir = normalize((cell + 0.5 + jit * 0.8) / SC);
      let dstar = length(dir - sdir);
      let bright = 0.30 + 0.55 * hash3(cell + 43.0);
      let phase = hash3(cell + 31.0) * 6.2832;
      let twinkle = 0.80 + 0.20 * starTwinkle * sin(time * 1.4 + phase);   // STAR TWINKLE knob
      let giant = step(0.9995, h);
      let srad = mix(0.0016, 0.0028, giant) * starSize;   // STAR SIZE knob
      let star = smoothstep(srad, srad * 0.35, dstar) * min(0.88, bright * twinkle * (1.0 + giant * 0.6));
      // Cloud occlusion (GLX parity): stars sit behind the deck.
      c = c + vec3<f32>(star) * starBright * (1.0 - covRay);
    }
  }

  // --- Moon disc + halo ---
  if (moon > 0.0 && stars > 0.5) {
    let moonDir = normalize(vec3<f32>(0.42, 0.72, 0.55));
    let md = dot(dir, moonDir);
    let moonPerp = length(dir - moonDir * max(md, 0.0));
    let moonDisc = smoothstep(0.025 * moonDiscSize, 0.010 * moonDiscSize, moonPerp) * moon;   // MOON DISC SIZE knob
    let moonHalo = exp(-moonPerp * moonPerp * (140.0 / moonHaloK)) * 0.28 * moonHaloK * moon;   // MOON HALO knob
    if (up > 0.0 && md > 0.0) {
      c = c + vec3<f32>(0.82, 0.88, 1.00) * (moonDisc * 1.10 + moonHalo);
    }
  }

  // --- City skyglow ---
  if (U.cityGlow.x + U.cityGlow.y + U.cityGlow.z > 0.001) {
    let horiz = pow(clamp(1.0 - max(dir.y, 0.0) * 2.4, 0.0, 1.0), 3.0 * cityGlowReach);   // CITY GLOW REACH knob
    c = c + U.cityGlow.xyz * horiz;
  }

  // ~1/255 interleaved-gradient dither on the dome output (GLX SKY_FS parity):
  // breaks the night-gradient banding at scene write; time-stepped shimmer.
  let skyDth = fract(52.9829189 * fract(dot(
    in.pos.xy + 5.588238 * (floor(time * 60.0) % 64.0),
    vec2<f32>(0.06711056, 0.00583715))));
  c = c + vec3<f32>((skyDth - 0.5) * (1.0 / 255.0));

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
    BLOCKER,
    SHADOW,
    // byte size of the SkyU uniform block (mat4 64 + 10*vec4 160 = 224)
    SKY_UNIFORM_BYTES: 224,
    // Lit-pipeline uniform block sizes (see the LIT struct comments; the JS-side
    // writers in wgx.js MUST agree with these).
    FRAME_UNIFORM_BYTES: 464,   // FrameU (Phase 3: +lightVP +params2; tune: +params3; Phase 4: +params4..params6; +shadowCtr +carLightVP; +params7 GLX-parity lit knobs)
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
