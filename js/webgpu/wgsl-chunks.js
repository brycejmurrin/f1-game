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
  //    DEFERRED (clearly-marked TODOs, later phases — each an isolated block in
  //    GLX main() that this port drops):
  //      * shadow map / cloud shadow  (Phase 3 — needs the depth pass + compare sampler)
  //      * env-cube + analytic sky mirror + rim/AO  (Phase 3)
  //      * wet-road / puddle model  (Phase 4 — folds into the SSR composite)
  //      * per-material procedural bump + albedo (applyMaterial*), ground detail
  //        micro-normal, car-paint orange-peel, clearcoat 2nd lobe, sparkle
  //        (Phase 4 — the "14 procedural materials" half of LIT_FS)
  //      * lamp-fog / ground-mist volumetrics  (Phase 4)
  //    The material scalars for those (detail, clearcoat, carPaint, sparkle,
  //    wetness) still arrive in the uniform blocks so no re-plumbing is needed
  //    when the blocks land; they are simply not consumed yet.
  //
  //    UNIFORM LAYOUT — authored to WGSL std-layout rules and MUST match the
  //    JS-side struct writers in wgx.js (_writeFrame / _writeDraw). vec3s are
  //    padded to vec4 (16-byte align). Byte offsets are asserted in comments.
  //      FrameU  : 224 B (see WGX.FRAME_UNIFORM_BYTES)
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
};                            // size 224
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
@group(1) @binding(0) var<uniform> D : DrawU;
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
  let V = normalize(F.eye.xyz - in.wpos);
  let L = F.sunDir.xyz;
  let H = normalize(L + V + vec3<f32>(1e-5));   // +eps: normalize(0) NaNs at V==-L
  let NoL = max(dot(N, L), 0.0);
  let NoV = max(dot(N, V), 1e-4);
  let NoH = max(dot(N, H), 0.0);
  let VoH = max(dot(V, H), 0.0);

  let albedo    = in.col;
  let emissive  = D.mat0.x;
  let alpha     = D.mat0.y;
  let metalness = D.mat0.w;
  let specular  = D.mat1.x;
  let rough     = clamp(D.mat0.z, 0.04, 1.0);
  let a  = rough * rough;
  let f0 = mix(vec3<f32>(0.08 * specular), albedo, metalness);
  let keyMul = F.params1.x;

  // Hemisphere ambient + Lambert sun (== GLX base diffuse when metalness==0).
  let amb = mix(F.ambGround.xyz, F.ambSky.xyz, N.y * 0.5 + 0.5);
  let litNoL = NoL * keyMul;   // TODO(Phase 3): * shadow * (1 - cloudShadow)
  var color = albedo * (amb + F.sunColor.xyz * litNoL * (1.0 - metalness));

  // Cook-Torrance sun specular, soft-clipped so highlights sheen not clip.
  let Dg = D_GGX(NoH, a);
  let Vg = V_SmithGGX(NoV, NoL, a);
  let Fg = F_Schlick(VoH, f0, clamp(1.0 - rough, 0.0, 1.0));
  var specCol = (Dg * Vg) * Fg * F.sunColor.xyz * litNoL;
  specCol = specCol / (1.0 + specCol);
  color = color + specCol;

  // Physically-based punctual lights (floodlights / street lamps) — verbatim
  // math from GLX LIT_FS (js/glx.js:579-647): windowed 1/d² falloff, aimed spot
  // cone, diffuse pool + GGX spec. No per-light shadows (cost); the cone shapes
  // the light. (Bounce-fill + per-lamp clearcoat glint deferred to Phase 4.)
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
    let spotD = mix(bleed, 1.0, beam);
    let NoLl = max(dot(N, Ld), 0.0);
    color = color + albedo * lcol * (att * spotD) * NoLl * (1.0 - metalness);
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
  color = mix(color, fogCol, fAmt);

  return vec4<f32>(color, alpha);
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
  let sunWarm = mix(sunColor, sunColor * vec3<f32>(1.18, 0.52, 0.24), golden);
  c = c + sunWarm * pow(sd, mix(20.0, 8.0, golden)) * (0.55 + golden * 0.55);
  c = c + sunWarm * pow(sd, 300.0) * 0.95;
  let dd = dir - sunDir * sd;
  let perp = length(vec2<f32>(length(dd.xz), dd.y * mix(1.0, 1.6, golden)));
  let disc = smoothstep(mix(0.018, 0.028, golden), 0.006, perp);
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
    // byte size of the SkyU uniform block (mat4 64 + 7*vec4 112 = 176)
    SKY_UNIFORM_BYTES: 176,
    // Lit-pipeline uniform block sizes (see the LIT struct comments; the JS-side
    // writers in wgx.js MUST agree with these).
    FRAME_UNIFORM_BYTES: 224,   // FrameU
    LIGHT_STRIDE_BYTES: 64,     // one Light
    MAX_LIGHTS: 32,
    DRAW_UNIFORM_BYTES: 112,    // DrawU used bytes (dynamic-offset stride is 256)
    BLIT_UNIFORM_BYTES: 16,     // BlitU
  };
})();

// No-build global export (mirror GLX/Parts/Tracks style).
if (typeof window !== "undefined") window.WGSLChunks = WGSLChunks;
