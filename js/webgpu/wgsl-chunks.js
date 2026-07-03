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
    // first real shader, pre-composed from the leaves above
    SKY,
    // byte size of the SkyU uniform block (mat4 64 + 7*vec4 112 = 176)
    SKY_UNIFORM_BYTES: 176,
  };
})();

// No-build global export (mirror GLX/Parts/Tracks style).
if (typeof window !== "undefined") window.WGSLChunks = WGSLChunks;
