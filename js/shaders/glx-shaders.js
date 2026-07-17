/*
 * Apex 26 — GLSL shader sources for the WebGL2 renderer (js/glx.js).
 * Pure data: every export is a template-literal GLSL string with no
 * interpolation. Must load BEFORE js/glx.js (see index.html).
 */
"use strict";

const GLXShaders = (function () {
  const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aMat;   // per-vertex material id (0 = FLAT/untextured)
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform vec3 uEye;
uniform float uTime;   // seconds (shared with the FS cloud-drift clock) — drives the FLAG wave
out vec3 vNrm;
out vec3 vCol;
out vec3 vWorldPos;
out vec3 vObjPos;
out float vDist;
flat out float vMat;
void main() {
  vec3 pos = aPos;
  // FLAG material (id 15, aMat 15.0..15.4): cloth wind-wave. The FRACTIONAL
  // part of aMat encodes a per-vertex wave weight (0 = hoist edge pinned to
  // the pole, 0.4 → weight 1 = free edge); a travelling two-sine ripple
  // displaces along the face normal, so marshal flags flutter while every
  // other material keeps the exact static path (pos == aPos).
  if (aMat >= 15.0 && aMat < 16.0) {
    float fw = fract(aMat) * 2.5;
    float ph = uTime * 5.5 + aPos.x * 1.9 + aPos.z * 1.9;
    pos += aNrm * ((sin(ph) * 0.085 + sin(ph * 2.17 + 1.3) * 0.045) * fw);
  }
  vec4 wp = uModel * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vObjPos = aPos;                 // object space: paint flake/orange-peel pattern
  vNrm = mat3(uModel) * aNrm;     // is glued to the panels, not streaming in world.
  vCol = aCol;
  vMat = aMat;                    // constant across the face (flat) — procedural material key
  vDist = length(wp.xyz - uEye);
  gl_Position = uViewProj * wp;
}`;

  // Lit shader: hemisphere ambient + lambert sun (the original, tuned look) PLUS
  // a Cook-Torrance (GGX) specular highlight on top. The diffuse + ambient base is
  // identical to the old shader when uMetalness==0, so the hand-tuned vertex-colour
  // palette is preserved; the spec term is soft-clipped so it sheens rather than
  // blooms. Per-draw material: uRoughness / uMetalness / uSpecular.
  const LIT_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vNrm;
in vec3 vCol;
in vec3 vWorldPos;
in vec3 vObjPos;
in float vDist;
flat in float vMat;   // procedural material id (0 = FLAT); textured in applyMaterial()
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbGround;
uniform vec3 uAmbSky;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uEmissive;
uniform float uAlpha;
uniform float uRoughness;
uniform float uMetalness;
uniform float uSpecular;
uniform float uDetail;
uniform float uClearcoat;  // 0..1 automotive lacquer layer: 2nd low-rough specular lobe
uniform float uCarPaint;    // 0..1 car-paint model: duotone pigment + bounded silhouette rim
uniform float uSparkle;     // 0..1 metallic-flake glitter strength (1 in-race; low in the setup turntable to kill the "twinkle")
uniform float uWetness;     // 0..1 rain wetness (wet-road material + reflections)
uniform samplerCube uEnvCube;  // live 64px env probe around the player car (one face/frame)
uniform float uEnvStr;         // 0 until the probe's first full 6-face cycle; then the CAR tuner's envCube strength
uniform sampler2DShadow uShadowMap;
uniform mat4 uLightVP;
uniform float uShadowBias;
uniform float uShadowStr;
uniform float uShadowTexel;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uFogHeight;
uniform float uGroundMist;  // 0..1 low-lying drifting ground mist
uniform float uLampFog;     // lamp-glow-in-fog strength (0 = off / day)
uniform sampler2D uBlockerMap;  // PCSS-lite min-depth blocker map (512sq)
uniform float uPcss;            // 1 = blocker map valid, 0 = fixed penumbra
// Live-tunable constants (LIGHTING TUNER panel / __apex.lightTune) — defaults
// mirror LightTune.TUNE_DEFS (js/game/lighting.js); uploaded per frame from frame.tune in begin().
uniform float uBounceK;     // per-lamp bounce-fill strength (was literal 0.04)
uniform float uMistShare;   // ground-mist share of the lamp fog glow (was 1.5)
uniform float uLampFogClip; // lamp-fog Reinhard shoulder strength (was 0.7)
uniform float uGlowAmp;     // emissive HDR glow push (was literal 2.3)
uniform float uBloomBoost;  // extra HDR push per unit of OVER-WHITE albedo (neon/lens tag)
uniform float uPcssPen;     // PCSS penumbra growth rate (was literal 80.0)
uniform float uKeyMul;      // direct sun/key-light intensity multiplier (default 1)
uniform float uTime;        // seconds (drives cloud-shadow drift)
uniform float uCloudCover;  // 0..1 cloud cover (drives cloud shadows)
uniform float uCloudSpeed;  // cloud drift-rate multiplier (matches SKY uCloudSpeed; 0 = frozen)
uniform float uCloudShadowDim; // how darkly cloud shadows dim the sun (def 0.80)
uniform float uCarSunGlint; // clearcoat sun-disc reflection punch on car paint (def 12.0)
uniform float uCarSparkle;  // metallic-flake sparkle glint gain (def 1.6)
uniform float uFogSunCore;  // tight hot core of the sun in-scatter through fog (def 0.6)
uniform float uFogTint;     // −1 cool .. +1 warm white-balance on the distance haze
uniform float uMistHeight;  // ground-mist layer height band (world m scale, def 0.30)
uniform float uShadowTintAmt; // 0..1 cool-blue tint on shadowed / ambient-only areas
uniform float uWetDark;     // wet-asphalt darkening multiplier (def 1.0)
uniform float uLampNearClamp;  // near-field distance floor on lamp 1/d² falloff (m, def 4.0) — tames close-by wall blow-out (dual: WGSL F.params7.w)
uniform float uWindowSunFlash; // glossy-glass dry sun-flash reflection strength (def 1.0 = shipped 0.6)
uniform float uSkyRimGlow;     // grazing-angle atmospheric sky-rim brightening strength (def 1.0 = shipped 0.18)
uniform float uAmbContactDark; // ambient contact-darkening depth on downward faces (def 1.0 = shipped 0.88 floor)
uniform float uLampWallSpill;  // out-of-beam lamp reflection floor on walls/road (def 1.0 = shipped 0.16/0.30)
uniform float uShadowRange; // sun shadow box half-size (m, def 80) — drives the receiver-distance shadow fade
uniform vec3 uShadowCtr;    // unsnapped shadow-box anchor (ground level, glides with the camera) — the fade origin
// Dynamic CAR shadow map: car meshes only, re-rendered every frame (the static
// map above is snap-cached and can't hold movers). 1024², box ±42 m on the anchor.
uniform highp sampler2DShadow uCarShadowMap;
uniform mat4 uCarLightVP;
uniform float uCarShadowOn;
// Nearest-FLOODLIGHT spot shadow (night, desktop): a 512² depth map rendered
// per frame from the single nearest lamp to the camera (perspective VP down its
// beam). Only the light-loop slot uLampShadowIdx pays the 4-tap PCF — every
// other lamp skips the branch, so the whole feature costs one lamp's shadow.
uniform highp sampler2DShadow uLampShadowMap;
uniform mat4 uLampShadowVP;
uniform float uLampShadowOn;
uniform int uLampShadowIdx;
// Point lights (floodlights / street lights — mainly for night tracks). Each is
// {position, colour*intensity, radius}; uNumLights of the MAX_LIGHTS slots used.
const int MAX_LIGHTS = 32;
uniform int uNumLights;
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightCol[MAX_LIGHTS];
uniform float uLightRad[MAX_LIGHTS];
uniform vec3 uLightDir[MAX_LIGHTS];    // per-lamp beam aim (normalized, tilted over the road)
uniform vec2 uLightCone[MAX_LIGHTS];   // per-lamp spot cone: x=cosInner, y=cosOuter
uniform float uLightBleed[MAX_LIGHTS]; // out-of-beam floor (city skyglow spill)
out vec4 outColor;

const float PI = 3.14159265359;

float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = (NoH * NoH) * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-6);
}
// Height-correlated Smith visibility (folds in the 1/(4 NoL NoV) denominator).
float V_SmithGGX(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
// Roughness-aware Schlick: grazing reflectance is capped at f90 = 1-roughness
// (Frostbite trick) so rough surfaces like asphalt/grass don't pick up a wet
// mirror sheen at the horizon, while smooth paint keeps its grazing reflection.
vec3 F_Schlick(float VoH, vec3 f0, float f90) {
  float v = 1.0 - VoH; float v2 = v * v;
  return f0 + (vec3(f90) - f0) * (v2 * v2 * v);
}

// --- Procedural surface texture (value noise on world XZ; no UVs needed) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// ── Procedural per-material surface texture (triplanar, UV-free) ─────────────
// Keyed by the flat per-vertex material id (aMat): brick, glass, concrete,
// metal, wood, foliage, fabric, sand, grass, rock, snow, roof tile, stone,
// rust/corrugated. No image textures, no UVs — everything below is world/
// object-position noise. Two passes:
//  1) applyMaterialNormal() — a REAL bump: perturbs the shading normal BEFORE
//     the lighting terms (NoL, shadow, specular) consume it, so mortar grooves,
//     plank seams, corrugation ridges etc. actually catch and cast light —
//     not just an albedo tint. Called early in main(), right after the
//     existing ground/car-paint normal relief.
//  2) applyMaterial() — albedo + roughness modulation, called after rough is
//     resolved (unchanged call site from the original single-pass version).
// Both key off the SAME per-material coordinate convention (hc/y for wall-like
// materials, wp.xz for organic/horizontal ones) so the bump and the tint line
// up — recessed mortar reads darker AND indented, not just darker.

// Scalar relief height for material mid at local coords uv (either (hc,y)
// for wall materials or world (x,z) for horizontal/organic ones — see call
// sites below). Sampled 3x per fragment (center + 2 offsets) for a gradient.
float matBumpHeight(int mid, vec2 uv) {
  float hc = uv.x, y = uv.y;
  if (mid == 1) {          // CONCRETE: fine aggregate + a shallow form-seam groove
    float seam = smoothstep(0.05, 0.0, abs(fract(y / 1.25) - 0.5) - 0.46);
    return vnoise(uv * 6.0) * 0.6 - seam * 0.5;
  } else if (mid == 2) {   // BRICK: bricks proud, mortar recessed
    float ch = 0.20, bl = 0.42, mort = 0.06;
    float row = floor(y / ch), off = mod(row, 2.0) * 0.5 * bl;
    float bx = fract((hc + off) / bl), by = fract(y / ch);
    float joint = max(smoothstep(mort, 0.0, min(bx, 1.0 - bx) * bl),
                      smoothstep(mort, 0.0, min(by, 1.0 - by) * ch));
    return (1.0 - joint) * 0.5 + vnoise(vec2(floor((hc + off) / bl), row) * 4.0) * 0.10;
  } else if (mid == 4) {   // METAL: fine brushed streaks along the vertical axis
    return vnoise(vec2(hc * 55.0, y * 3.0)) * 0.3;
  } else if (mid == 5) {   // WOOD: plank seams recessed + grain ridges along the board
    float seam = smoothstep(0.05, 0.0, abs(fract(hc / 0.35) - 0.5) - 0.46);
    return (1.0 - seam) * 0.4 + vnoise(vec2(hc * 3.0, y * 22.0)) * 0.16;
  } else if (mid == 6) {   // FOLIAGE: lumpy per-leaf-cluster relief
    return vnoise(uv * 3.2) * 0.5 + vnoise(uv * 11.0) * 0.3;
  } else if (mid == 7) {   // FABRIC: woven cross-thread ridges
    return sin(hc * 38.0) * 0.15 + sin(y * 38.0) * 0.15;
  } else if (mid == 8) {   // SAND: dune ripple — a real raised ridge, not just shading
    return sin(hc * 3.0 + vnoise(uv * 0.3) * 6.0) * 0.5 + vnoise(uv * 8.0) * 0.2;
  } else if (mid == 9) {   // GRASS: fine blade-clump bump
    return vnoise(uv * 6.0) * 0.4 + vnoise(uv * 20.0) * 0.25;
  } else if (mid == 10) {  // ROCK: craggy multi-octave relief
    return vnoise(uv * 1.3) * 0.6 + vnoise(uv * 4.5) * 0.3 + vnoise(uv * 15.0) * 0.15;
  } else if (mid == 11) {  // SNOW: soft drifts + a fine sparkly crust
    return vnoise(uv * 1.8) * 0.45 + vnoise(uv * 21.0) * 0.18;
  } else if (mid == 12) {  // ROOF (terracotta tile): ridged overlapping courses
    float ty = fract(y / 0.34);
    return sin(ty * 3.14159) * 0.5 + vnoise(vec2(hc * 2.0, floor(y / 0.34)) * 3.0) * 0.08;
  } else if (mid == 13) {  // STONE: irregular jittered blocks, deep mortar
    vec2 cell = floor(uv * 1.3);
    vec2 f = fract(uv * 1.3) - hash21(cell) * 0.12;
    float d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return smoothstep(0.0, 0.16, d) * 0.55 + vnoise(uv * 5.0) * 0.15;
  } else if (mid == 14) {  // RUST / CORRUGATED METAL: real sinusoidal corrugation
    return sin(hc * 7.5) * 0.55 + vnoise(uv * 6.0) * 0.10;
  }
  return 0.0;
}
// Wall-like materials (coursed/planked/panelled) key off (hc, y): hc runs along
// the wall's horizontal span, y is world-up. Organic/horizontal materials
// (foliage, sand, grass, rock, snow) key off world (x, z), matching the
// existing ground micro-relief above. GLASS (3) is intentionally left flat —
// bump would blur its mirror-reflection read.
void applyMaterialNormal(int mid, inout vec3 N, float vd) {
  if (mid == 0 || mid == 3 || mid == 15) return;   // FLAT/GLASS/FLAG: no procedural bump
  float bumpFade = clamp(1.0 - (vd - 22.0) / 58.0, 0.0, 1.0);
  if (bumpFade <= 0.005) return;
  bool wallLike = mid == 1 || mid == 2 || mid == 4 || mid == 5 || mid == 7 || mid == 12 || mid == 13 || mid == 14;
  if (wallLike) {
    vec3 an = abs(N);
    float hc = an.x > an.z ? vWorldPos.z : vWorldPos.x;
    float y = vWorldPos.y;
    // Fade the bump by the per-pixel WORLD FOOTPRINT of the (hc,y) coord, not
    // just camera distance. The height gradient below is a fixed-epsilon
    // (0.05 m) 3-tap probe; when a pixel spans more than the finest brick/stone
    // feature (~0.06 m) — which happens at a GRAZING viewing angle even up
    // close, from foreshortening — those three taps land at effectively random
    // points in the pattern and the perturbed normal aliases into a swirling
    // moiré ("wavy" sheen on the shallow-angle side of a facade). fwidth()
    // catches the grazing stretch that the distance-only bumpFade cannot; as
    // the footprint grows the relief flattens toward the interpolated N, the
    // normal-map analog of mip-fading high-frequency texture detail.
    float fp = max(fwidth(hc), fwidth(y));
    float aaFade = clamp(1.0 - (fp - 0.04) / 0.22, 0.0, 1.0);
    if (aaFade <= 0.005) return;
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-5));
    float e = 0.05;
    float h0 = matBumpHeight(mid, vec2(hc, y));
    float hx = matBumpHeight(mid, vec2(hc + e, y));
    float hy = matBumpHeight(mid, vec2(hc, y + e));
    float amt = (mid == 2 || mid == 13) ? 0.10 : (mid == 12 || mid == 14) ? 0.09 : 0.05;
    N = normalize(N + (T * (h0 - hx) + vec3(0.0, 1.0, 0.0) * (h0 - hy)) * (amt * bumpFade * aaFade / e));
  } else {
    vec2 p = vWorldPos.xz;
    float e = 0.22;
    float h0 = matBumpHeight(mid, p);
    float hx = matBumpHeight(mid, p + vec2(e, 0.0));
    float hz = matBumpHeight(mid, p + vec2(0.0, e));
    float amt = mid == 8 ? 0.16 : mid == 10 ? 0.14 : 0.07;
    N = normalize(N + vec3(h0 - hx, 0.0, h0 - hz) * (amt * bumpFade / e));
  }
}
// Albedo + roughness modulation (unchanged call site: after rough is resolved).
void applyMaterial(int mid, inout vec3 albedo, inout float rough, float vd) {
  if (mid == 0) return;
  float far  = clamp(1.0 - (vd - 90.0) / 170.0, 0.0, 1.0);   // coarse tint: mid range
  if (far <= 0.001) return;                                   // too distant to read — skip the noise
  float near = clamp(1.0 - (vd - 26.0) / 64.0, 0.0, 1.0);    // fine detail: near field only
  vec3 wp = vWorldPos;
  vec3 an = abs(normalize(vNrm));
  bool wall = an.y < 0.6;                          // roughly vertical face
  float hc = an.x > an.z ? wp.z : wp.x;            // horizontal coord along the wall
  float y = wp.y;
  if (mid == 1) {            // CONCRETE — patchy panels + fine speckle + form seams
    albedo *= 1.0 + (vnoise(wp.xz * 0.09 + y * 0.05) - 0.5) * 0.16 * far;
    albedo *= 1.0 + (vnoise(vec2(hc, y) * 6.0) - 0.5) * 0.10 * near;
    // AA the seam: fwidth() on the PRE-fract coordinate (fract() itself has a
    // hard C0 seam that would spike the derivative) widens the transition band
    // once a screen pixel spans more world-units than the seam's fixed 0.05 —
    // otherwise the line strobes between "on/off" as the camera moves (the
    // reported building-texture shimmer).
    if (wall) albedo *= 1.0 - smoothstep(max(0.05, fwidth(y / 1.25)), 0.0, abs(fract(y / 1.25) - 0.5) - 0.46) * 0.14 * near;
    rough = min(1.0, rough + 0.08 * far);
  } else if (mid == 2) {     // BRICK — courses + staggered joints + per-brick tint
    float ch = 0.20, bl = 0.42, mort = 0.06;
    float row = floor(y / ch);
    float off = mod(row, 2.0) * 0.5 * bl;
    float bx = fract((hc + off) / bl), by = fract(y / ch);
    // mort is a WORLD-space distance (min(bx,1-bx)*bl converts back to metres),
    // so the AA width is the raw per-pixel footprint of hc/y — see the seam
    // note above for why this must scale with distance/viewing angle.
    float mortAA = max(mort, max(fwidth(hc), fwidth(y)));
    float joint = max(smoothstep(mortAA, 0.0, min(bx, 1.0 - bx) * bl),
                      smoothstep(mortAA, 0.0, min(by, 1.0 - by) * ch));
    float bh = vnoise(vec2(floor((hc + off) / bl), row) * 1.3);
    vec3 brick = albedo * (0.82 + bh * 0.42) * vec3(1.06, 0.99, 0.92);
    vec3 mortar = mix(albedo, vec3(0.60, 0.58, 0.55), 0.6);
    albedo = mix(brick, mortar, joint * near);
    rough = min(1.0, rough + 0.12 * far);
  } else if (mid == 3) {     // GLASS / CURTAIN WALL — mullion grid + per-pane variation
    float pw = 1.6, ph = 1.4, mull = 0.11;
    float gx = fract(hc / pw), gy = fract(y / ph);
    // mull compares against a NORMALIZED (0..1 pane-fraction) distance here —
    // unlike brick's mort above, gx/gy are never scaled back to metres — so the
    // AA width must be fwidth() of the pre-fract NORMALIZED coordinate, not the
    // raw world-space one.
    float mullAA = max(mull, max(fwidth(hc / pw), fwidth(y / ph)));
    float bar = max(smoothstep(mullAA, 0.0, min(gx, 1.0 - gx)),
                    smoothstep(mullAA, 0.0, min(gy, 1.0 - gy)));
    albedo *= 1.0 + (vnoise(vec2(floor(hc / pw), floor(y / ph)) * 1.7) - 0.5) * 0.5 * far;
    albedo = mix(albedo, albedo * 0.32, bar * near);
    rough = mix(rough, min(rough, 0.12), near);
  } else if (mid == 4) {     // METAL — brushed vertical streaks, glossier
    float brushFade = clamp(1.0 - (vd - 26.0) / 29.0, 0.0, 1.0);   // fade 40-cycle brushing over 26-55m (tighter than 'near') so it stops sparkling
    albedo *= 1.0 + (vnoise(vec2(hc * 40.0, y * 2.0)) - 0.5) * 0.12 * brushFade;
    rough = clamp(rough - 0.15 * far, 0.05, 1.0);
  } else if (mid == 5) {     // WOOD — grain lines + plank seams
    albedo *= 1.0 + (vnoise(vec2(hc * 3.0, y * 22.0)) - 0.5) * 0.18 * near;
    // Same normalized-space AA correction as glass's mullion grid above.
    albedo *= 1.0 - smoothstep(max(0.05, fwidth(hc / 0.35)), 0.0, abs(fract(hc / 0.35) - 0.5) - 0.46) * 0.16 * near;
  } else if (mid == 6) {     // FOLIAGE — dapple + green variation, breaks flat canopy
    float d = vnoise(wp.xz * 2.4 + wp.y * 1.6) * 0.6 + vnoise(wp.xz * 9.0) * 0.4 * near;
    albedo *= 1.0 + (d - 0.5) * 0.34 * far;
    albedo.g *= 1.0 + (d - 0.5) * 0.10 * far;
  } else if (mid == 7) {     // FABRIC / CROWD / TENT — fine weave speckle
    float weaveFade = clamp(1.0 - (vd - 26.0) / 34.0, 0.0, 1.0);   // fade 26-cycle weave over 26-60m so it stops crawling mid-range
    albedo *= 1.0 + (vnoise(vec2(hc, y) * 26.0) - 0.5) * 0.14 * weaveFade;
  } else if (mid == 8) {     // SAND — fine grain + gentle dune ripple
    albedo *= 1.0 + (vnoise(wp.xz * 5.0) - 0.5) * 0.12 * near
                  + sin(wp.x * 0.7 + vnoise(wp.xz * 0.2) * 6.0) * 0.05 * far;
  } else if (mid == 9) {     // GRASS — bladed clumps + tone variation
    float g = vnoise(wp.xz * 3.5) * 0.6 + vnoise(wp.xz * 14.0) * 0.4 * near - 0.5;
    albedo *= 1.0 + g * 0.22 * far;
    albedo.g *= 1.0 + g * 0.08 * far;
  } else if (mid == 10) {    // ROCK — craggy grey-brown, multi-scale tonal variation
    float r = vnoise(wp.xz * 0.9 + y * 0.6) * 0.6 + vnoise(wp.xz * 4.5) * 0.4 - 0.5;
    albedo *= 1.0 + r * 0.30 * far;
    rough = min(1.0, rough + 0.16 * far);
  } else if (mid == 11) {    // SNOW — bright, soft blue-shaded crevices, sparkle near
    float s = vnoise(wp.xz * 1.6 + y * 0.4) - 0.5;
    albedo *= 1.0 + s * 0.10 * far;
    albedo.b *= 1.0 - s * 0.05 * far;              // shaded drifts read faintly cool
    float sparkleFade = clamp(1.0 - (vd - 26.0) / 34.0, 0.0, 1.0);  // fade 24-cycle snow sparkle over 26-60m so it stops shimmering
    albedo *= 1.0 + (vnoise(wp.xz * 24.0) - 0.5) * 0.06 * sparkleFade;
    rough = clamp(rough - 0.10 * far, 0.05, 1.0);
  } else if (mid == 12) {    // ROOF (terracotta tile) — ridged courses, warm tone bands
    float ty = fract(y / 0.34);
    float shadeAA = clamp(1.0 - fwidth(ty) * 6.0, 0.0, 1.0);           // fade tile-ridge sine when a pixel covers >~1/6 of a tile → no shimmer
    float shade = sin(ty * 3.14159) * shadeAA;
    albedo *= 0.88 + shade * 0.16;
    albedo *= 1.0 + (vnoise(vec2(hc * 2.0, floor(y / 0.34)) * 3.0) - 0.5) * 0.14 * near;
    rough = min(1.0, rough + 0.10 * far);
  } else if (mid == 13) {    // STONE — irregular jittered blocks, deep mortar
    vec2 cell = floor(vec2(hc, y) * 1.3);
    vec2 f = fract(vec2(hc, y) * 1.3) - hash21(cell) * 0.12;
    float d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    // Normalized-space AA (same correction as glass/wood above): d lives in the
    // *1.3 fract domain, so widen by fwidth() of that same pre-fract coordinate.
    float jointAA = max(0.16, max(fwidth(hc * 1.3), fwidth(y * 1.3)));
    float joint = smoothstep(0.0, jointAA, d);
    vec3 block = albedo * (0.80 + hash21(cell) * 0.4);
    vec3 mortar = mix(albedo, vec3(0.42, 0.40, 0.37), 0.65);
    albedo = mix(mortar, block, joint * near);
    rough = min(1.0, rough + 0.18 * far);
  } else if (mid == 14) {    // RUST / CORRUGATED METAL — ridge shading + rust streaks
    float ridgePhase = hc * 7.5;
    float ridgeAA = clamp(1.0 - fwidth(ridgePhase) * 3.0, 0.0, 1.0);   // fade the corrugation sine as a pixel spans >~1/3 cycle → no crawl at distance
    float ridge = sin(ridgePhase) * ridgeAA;
    albedo *= 0.85 + ridge * 0.18;
    float rust = smoothstep(0.55, 0.9, vnoise(vec2(hc * 0.8, y * 0.35) + 5.0));
    albedo = mix(albedo, albedo * vec3(0.62, 0.42, 0.28), rust * 0.5 * far);
    rough = min(1.0, rough + 0.14 * far);
  }
}
// Cloud cover at a world point: project the point up the sun direction to the
// cloud deck and sample a drifting FBM — gives moving dappled cloud SHADOWS on
// the ground (the "volumetric shading"). 0 = full sun, 1 = fully shadowed.
float cloudFBM(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 2; i++) { s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }  // 4→2 octaves (soft-thresholded, invisible)
  return s;
}
float cloudShadow(vec3 wp) {
  if (uCloudCover <= 0.001 || uSunDir.y <= 0.06) return 0.0;
  float cloudY = 360.0;
  // Floor the divisor well above the 0.06 cutoff: near that cutoff the sun ray
  // to the cloud deck is almost grazing, so t (and the resulting cp) grows huge
  // for a barely-changed wp — a tiny change in receiver height/position (e.g.
  // the road's own elevation profile, or the ground point sweeping under a
  // moving camera) gets amplified into many cycles of the cloud noise. That
  // over-sampling of a fast-varying signal is exactly what reads as noisy
  // "stripes" dappling the ground at dawn/dusk instead of smooth cloud shadows.
  // Capping the amplification (rather than raising the 0.06 cutoff itself)
  // keeps the shadow visible right down to that cutoff, just less jittery.
  float t = (cloudY - wp.y) / max(uSunDir.y, 0.15);
  // Drift scaled by uCloudSpeed so the ground dapple freezes/slows in lockstep
  // with the SKY clouds (which use the same knob). Was raw uTime, so "0 = frozen
  // sky" still left the ground shadows crawling.
  float cT = uTime * uCloudSpeed;
  vec2 cp = (wp.xz + uSunDir.xz * t) * 0.0052 + vec2(cT * 0.012, cT * 0.005);
  float c = cloudFBM(cp);
  return smoothstep(0.54 - uCloudCover * 0.40, 0.92, c) * uCloudCover;
}

float sampleShadow(vec3 wpos) {
  vec4 lc = uLightVP * vec4(wpos, 1.0);
  vec3 sc = lc.xyz / lc.w * 0.5 + 0.5;
  if (sc.z >= 1.0) return 1.0;
  // Distance fade: dissolve shadows by RECEIVER distance from uShadowCtr — the
  // unsnapped forward-biased ground anchor the box is snapped around (game.js
  // shadow pass). The anchor glides smoothly with the camera, so the fade front
  // never jumps on a box recentre (a BOX-anchored fade stepped sBox/4 = 16 m at
  // a time while driving — the visible shadow pop/jump at racing speed). The box
  // is guaranteed to cover 0.875·range from the anchor (snap slack = range/8),
  // so completing the fade at 0.84·range retains shadows to ~74 m ahead of the
  // camera at a 64 m box (the shipped default is 80 m, which reaches further
  // still) — vs 46 m when this faded from the eye, which had to absorb the
  // chase-cam offset AND the snap slack in one worst case.
  // (Camera-height-independent too: fading by eye distance erased every shadow
  // from high/aerial cameras, where vDist ≥ altitude for the whole ground.)
  float aDist = distance(wpos, uShadowCtr);
  float edgeFade = 1.0 - smoothstep(uShadowRange * 0.62, uShadowRange * 0.84, aDist);
  // UV border fade kept as a thin safety feather only: the distance fade above
  // completes at 0.84·range while the box guarantees 0.875·range from the anchor,
  // so anything this feather touches is already ≤~4% strength. Keep it THIN —
  // it is anchored to the BOX, which recentres in sBox/4 jumps, so any visible
  // strength it gates would step 16 m at a time while driving.
  vec2 ef = smoothstep(0.0, 0.03, sc.xy) * (1.0 - smoothstep(0.97, 1.0, sc.xy));
  edgeFade *= ef.x * ef.y;
  if (edgeFade <= 0.0) return 1.0;
  float t = uShadowTexel;
  // Slope-scale bias: gentle base + steeper slope term reduces both acne and
  // peter-panning on angled surfaces (walls, banking kerbs). tan(acos(c)) done
  // as sqrt(1-c²)/c (same value, no trig).
  float cosTheta = clamp(dot(normalize(vNrm), uSunDir), 0.05, 1.0);
  float slopeBias = t * 1.5 * (sqrt(1.0 - cosTheta * cosTheta) / cosTheta);
  // Shared by the static map below AND the car map at the bottom — the A/B
  // harness (tools/ab-lighting.mjs shadow.biasClamp) pins this pattern to ONE
  // site, so keep the bias term factored here rather than repeating the clamp.
  float biasTerm = clamp(slopeBias, 0.0005, 0.004) + uShadowBias * 0.5;
  float z = sc.z - biasTerm;
  // SHADOW DISTANCE compensation: the PCF/blocker offsets below are in shadow-map
  // UV space, so their WORLD footprint = offset * (2*uShadowRange). Without this,
  // raising SHADOW DISTANCE widened the penumbra proportionally and washed thin
  // casters (lamp posts, kerbs) out to lit. Scale the kernel by 80/box (clamped to
  // 1 so the crisp look at/below the default box is unchanged) to hold the world
  // penumbra ~constant as the box grows. Anchor tracks the shadowRange def.
  float boxK = min(1.0, 80.0 / uShadowRange);
  // Distance LOD: full 8-tap Poisson + PCSS-lite blocker search near the camera
  // (crisp tyre/kerb contact shadows), a cheap 4-tap disk on distant ground where
  // the shadow is small on screen. Halves shadow bandwidth over most of the frame.
  // Boundary SCALES with SHADOW DISTANCE (was a fixed 55.0 m) and is anchored to
  // the SAME gliding anchor as the distance fade above (aDist, not the eye): a
  // fixed or eye-anchored cutoff parked a hard 8-tap→4-tap / PCSS-off quality
  // ring in the MIDDLE of still-strong shadows — and swept it across the ground
  // as you drove. 0.80 places the switch deep into the 0.62→0.84 fade band
  // (shadows already dimmed to ~7% strength there), so the ring is invisible at
  // every SHADOW DISTANCE setting, and it can never jump: the anchor glides
  // continuously with the camera.
  bool near = aDist < uShadowRange * 0.80;
  float R = 3.0;
  if (near && uPcss > 0.5) {
    // PCSS-lite: blocker search scales the Poisson radius by the receiver-blocker
    // gap — crisp at the contact point, soft where the caster is far.
    float bt = (1.5 / 512.0) * boxK;
    float zb = min(min(texture(uBlockerMap, sc.xy + vec2(-bt,  bt)).r,
                       texture(uBlockerMap, sc.xy + vec2( bt,  bt)).r),
                   min(texture(uBlockerMap, sc.xy + vec2(-bt, -bt)).r,
                       texture(uBlockerMap, sc.xy + vec2( bt, -bt)).r));
    float pen = clamp((z - zb) * uPcssPen, 0.0, 1.0);
    R = mix(1.5, 6.0, pen);
  }
  // Dither anchored to the SHADOW-MAP TEXEL GRID, not gl_FragCoord: screen-keyed
  // noise re-rolls every world point's rotation each frame while driving (no TAA
  // here to average it), boiling the penumbra — the visible "shadow flicker at
  // speed". sc.xy is stable between recentres (the light VP is texel-snapped) and
  // shifts by whole texels on a recentre, so this pattern is glued to the ground.
  float ign = fract(52.9829189 * fract(dot(floor(sc.xy / t), vec2(0.06711056, 0.00583715))));
  float ang = ign * 6.2831853;
  float cr = cos(ang), sr = sin(ang);
  mat2 rot = mat2(cr, -sr, sr, cr) * (t * R * boxK);
  // 4 taps always; 4 more only near the camera. Rotated per-texel so the reduced
  // count still reads as noise, not banding.
  float s = texture(uShadowMap, vec3(sc.xy + rot * vec2(-0.94201624, -0.39906216), z))
          + texture(uShadowMap, vec3(sc.xy + rot * vec2( 0.94558609, -0.76890725), z))
          + texture(uShadowMap, vec3(sc.xy + rot * vec2(-0.09418410, -0.92938870), z))
          + texture(uShadowMap, vec3(sc.xy + rot * vec2( 0.34495938,  0.29387760), z));
  float sh;
  if (near) {
    s += texture(uShadowMap, vec3(sc.xy + rot * vec2(-0.91588581,  0.45771432), z))
       + texture(uShadowMap, vec3(sc.xy + rot * vec2(-0.81544232, -0.87912464), z))
       + texture(uShadowMap, vec3(sc.xy + rot * vec2(-0.38277543,  0.27676845), z))
       + texture(uShadowMap, vec3(sc.xy + rot * vec2( 0.97484398,  0.75648379), z));
    sh = s * 0.125;
  } else {
    sh = s * 0.25;
  }
  // Dynamic CAR shadows: min-combine with the per-frame car-only map so cars
  // cast real sun-projected shadows (direction/length correct, car-on-car
  // works) on top of the cached static map. Same slope/constant bias; a small
  // fixed 4-tap PCF (the map is tiny and its content moves every frame, so the
  // static map's dither/PCSS machinery buys nothing here).
  if (uCarShadowOn > 0.5) {
    vec4 cc = uCarLightVP * vec4(wpos, 1.0);
    vec3 cs = cc.xyz * 0.5 + 0.5;
    if (cs.x > 0.0 && cs.x < 1.0 && cs.y > 0.0 && cs.y < 1.0 && cs.z < 1.0) {
      float cz = cs.z - biasTerm;
      float ct = (1.0 / 1024.0) * 0.75;   // CAR_SHADOW_SIZE texel, tightened
      float csh = ( texture(uCarShadowMap, vec3(cs.xy + vec2(-ct, -ct), cz))
                  + texture(uCarShadowMap, vec3(cs.xy + vec2( ct, -ct), cz))
                  + texture(uCarShadowMap, vec3(cs.xy + vec2(-ct,  ct), cz))
                  + texture(uCarShadowMap, vec3(cs.xy + vec2( ct,  ct), cz)) ) * 0.25;
      sh = min(sh, csh);
    }
  }
  // Clamped: SHADOW DARKNESS goes to 2.0 and mix() EXTRAPOLATES above t=1 —
  // at sh~0 the lighting factor hit -1, i.e. negative light, which the
  // grade/tonemap renders as psychedelic orange/green in shadowed areas.
  // Clamping crushes >1 toward black, as the knob's help text promises.
  return max(0.0, mix(1.0, sh, uShadowStr * edgeFade));
}

void main() {
  vec3 N = normalize(vNrm);
  // Two-sided lighting: cull-off single-face geometry (the wheels — tyre bands,
  // sidewall discs, hub fans — are drawn double-sided with one face per wall)
  // shows its BACK side through spoke gaps and on the car's far wheels. Without
  // this the back face keeps the front normal and shades inverted, so the same
  // part reads bright on one side of the car and dark on the other. Flip N to
  // face the viewer on back fragments. No-op for culled meshes (their back faces
  // are discarded before shading), so only the double-sided draws are affected.
  if (!gl_FrontFacing) N = -N;
  // Micro-normal relief: perturb the normal with a two-scale noise gradient so
  // procedurally-textured ground (road/terrain, uDetail > 0) has real surface
  // bumps — sun glints, lamp speculars and reflections break up over the surface
  // instead of reading as one uniform polished sheet. Fades with distance (it
  // would alias to shimmer) and with wetness (the water film levels the surface).
  if (uDetail > 0.001) {
    float mnFade = clamp(1.0 - (vDist - 25.0) / 70.0, 0.0, 1.0) * (1.0 - uWetness * 0.75);
    // Footprint fade: the relief below is a fixed-epsilon (0.22 m) world-space
    // noise-gradient normal perturbation. On the ROAD/terrain — viewed at a
    // grazing angle while driving — one screen pixel spans many metres, so
    // neighbouring pixels sample the gradient at unrelated noise phases and the
    // perturbed normal aliases; because the noise is world-locked the aliased
    // pattern CRAWLS under the car as you move, and since it feeds N·L it reads
    // as wavy "shadows" streaming across the tarmac. The distance fade alone
    // misses this — a grazing patch can be close (high mnFade) yet still have a
    // metre-wide footprint — so also fade the relief out once the per-pixel
    // footprint outgrows the ~0.2 m noise-feature scale (the same fwidth() AA
    // used for the wall bump maps and albedo seams).
    float mnFp = max(fwidth(vWorldPos.x), fwidth(vWorldPos.z));
    mnFade *= clamp(1.0 - (mnFp - 0.15) / 0.70, 0.0, 1.0);
    if (mnFade > 0.01) {
      vec2 mnp = vWorldPos.xz * 1.7;
      float e = 0.22;
      float h0 = vnoise(mnp) * 0.7 + vnoise(mnp * 3.9) * 0.3;
      float hx = vnoise(mnp + vec2(e, 0.0)) * 0.7 + vnoise(mnp * 3.9 + vec2(e * 3.9, 0.0)) * 0.3;
      float hz = vnoise(mnp + vec2(0.0, e)) * 0.7 + vnoise(mnp * 3.9 + vec2(0.0, e * 3.9)) * 0.3;
      // (Near-field third octave removed: 3 extra vnoise/fragment over most of
      // the screen for fine aggregate bumps that are invisible at racing speed.)
      N = normalize(N + vec3(h0 - hx, 0.0, h0 - hz) * ((uDetail * 0.4 * mnFade) / e));
    }
  }
  // Car paint micro normal map (orange-peel): the same trick as the ground
  // relief above, at paint scale. No colour layers — the perturbed normal
  // feeds every standard lighting/reflection term below, so the surface
  // ITSELF reflects: the sun streak and sky env break into a live shimmer
  // that slides across the panels as the car moves.
  // Geometric normal, kept UNPERTURBED for the smooth lacquer clearcoat lobe and
  // the analytic env mirror below — orange-peel/flake live UNDER the clearcoat,
  // they must not roughen the mirror shell (that's what read as "ghostly" before).
  vec3 Ngeo = N;
  if (uCarPaint > 0.001) {
    // Two scales: coarse orange-peel waviness + fine metallic-flake sparkle.
    // Keyed to OBJECT space so the pattern is glued to the panels instead of
    // streaming across the bodywork as the car drives (texture-swimming).
    // Fades with distance so it never aliases to shimmer at range.
    float pFade = clamp(1.0 - (vDist - 18.0) / 50.0, 0.0, 1.0);
    if (pFade > 0.01) {
      vec2 puv = vObjPos.xz * 34.0 + vObjPos.y * 29.0;
      vec2 fuv = vObjPos.xz * 130.0 + vObjPos.y * 111.0;
      float pe = 0.09;
      float pb0 = vnoise(puv) * 0.6 + vnoise(fuv) * 0.4;
      float pbx = (vnoise(puv + vec2(pe, 0.0)) * 0.6 + vnoise(fuv + vec2(pe * 3.8, 0.0)) * 0.4) - pb0;
      float pby = (vnoise(puv + vec2(0.0, pe)) * 0.6 + vnoise(fuv + vec2(0.0, pe * 3.8)) * 0.4) - pb0;
      vec3 pT = normalize(cross(N, vec3(0.0, 1.0, 0.001)) + vec3(1e-4));
      vec3 pB = cross(N, pT);
      // 0.22 (was 0.7): at 0.7 the perturbation broke the base-coat specular into
      // per-pixel noise and the paint read sandy/matte — keep a whisper of live
      // shimmer, let the clearcoat lobe + env mirror carry the gloss.
      N = normalize(N + (pT * pbx + pB * pby) * (0.22 * uCarPaint * pFade));
    }
  }
  // Per-material procedural bump: MUST run before V/L/H/NoL below so brick
  // mortar/plank seams/corrugation ridges etc. actually affect the lighting
  // response, not just an albedo tint applied after the fact.
  applyMaterialNormal(int(vMat + 0.5), N, vDist);
  vec3 V = normalize(uEye - vWorldPos);
  vec3 L = uSunDir;
  vec3 H = normalize(L + V + vec3(1e-5));   // +eps: normalize(0) NaNs when V==-L
  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 1e-4);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);

  vec3 albedo = vCol;
  // NOTE: the old "car deck mirror" (a sky mirror weighted by N.y that only hit
  // up-facing panels) was removed — on the dead-flat floor plank / front-wing
  // planes (N.y≈1) it peaked at full strength and read as a chrome "silver plane"
  // under the car, brighter than the actual bodywork. The whole car is now
  // reflected uniformly by the VIEW-driven env mirror below (base reflectance on
  // every panel + grazing rim) plus SSR, so the reflection is consistent across
  // the body instead of a flat-panel standout.
  // Procedural ground texture: coarse patchiness + fine aggregate grain keyed to
  // world position, so flat asphalt/concrete/grass read as a surface rather than
  // a solid slab. Multiplicative, so it darkens as much as it lightens.
  float patchM = 0.5;
  if (uDetail > 0.0) {
    vec2 wp = vWorldPos.xz;
    // Fade the fine high-frequency octave out with distance: at range it aliases
    // into shimmer (and the texel footprint exceeds its wavelength anyway), so
    // distant ground settles to flat colour while near ground keeps its grain.
    float fineFade = clamp(1.0 - (vDist - 35.0) / 90.0, 0.0, 1.0);
    float n = vnoise(wp * 0.35) * 0.60 + vnoise(wp * 2.1) * 0.40 * fineFade;
    albedo *= 1.0 + (n - 0.5) * uDetail;
    // Repair patches: low-frequency resurfaced blotches darken the albedo a
    // few percent (patchM also nudges roughness below - fresh asphalt is
    // smoother and darker than the weathered surface around it).
    patchM = vnoise(wp * 0.055 + 9.1);
    float pm = smoothstep(0.52, 0.72, patchM);
    albedo *= 1.0 - pm * 0.05 * min(uDetail * 4.0, 1.0);
    // Sparse cracks: thin ridge-noise lines, masked by a low-frequency zone
    // gate so only some stretches are cracked; near-field only, and the
    // uDetail*4 gate means a wet road (detail 0.06) fades them to ~24%
    // (the water film hides them).
    float crackFade = clamp(1.0 - (vDist - 18.0) / 45.0, 0.0, 1.0);
    if (crackFade > 0.01) {
      float cr = abs(vnoise(wp * 0.9 + 3.3) * 2.0 - 1.0);
      // AA the crack-ridge threshold — same missing-derivative bug as the
      // building-material seams (fixed elsewhere in this file): the fixed
      // 0.015..0.075 band is a THRESHOLD ON cr, not a world-space distance, so
      // once a screen pixel's footprint changes cr by more than that band per
      // pixel, the ridge line pops in/out of existence per-frame instead of
      // fading — right in the driver's near field (crackFade only applies
      // <~63m), reading as thin dark stripes streaming under the car as it
      // moves through world space. fwidth(cr) widens the falloff edge to
      // match; the fixed 0.015 inner edge (solid ridge core) is kept as-is.
      float crAA = max(0.075, 0.015 + fwidth(cr));
      float crack = (1.0 - smoothstep(0.015, crAA, cr))
                  * smoothstep(0.40, 0.70, vnoise(wp * 0.11 + 7.7));
      albedo *= 1.0 - crack * 0.30 * crackFade * min(uDetail * 4.0, 1.0);
    }
    albedo = max(albedo, vec3(0.0));
  }
  float rough = clamp(uRoughness, 0.04, 1.0);
  // Repair patches read glossier: fold the patch mask into roughness (max
  // +-0.08) before the specular AA below widens it.
  if (uDetail > 0.0) rough = clamp(rough + (patchM - 0.5) * 0.16 * min(uDetail * 4.0, 1.0), 0.04, 1.0);
  // Procedural per-material surface texture (brick/glass/metal/wood/… ; 0 = FLAT).
  applyMaterial(int(vMat + 0.5), albedo, rough, vDist);
  // Specular anti-aliasing: widen roughness where the normal changes fast in
  // screen space (geometry edges, micro-normal at distance) so thin bright
  // highlights sheen smoothly instead of shimmering pixel-to-pixel.
  vec3 saaDx = dFdx(N), saaDy = dFdy(N);
  float saaVar = dot(saaDx, saaDx) + dot(saaDy, saaDy);
  rough = min(1.0, sqrt(rough * rough + saaVar * 0.35));
  float a = rough * rough;
  vec3 f0 = mix(vec3(0.08 * uSpecular), albedo, uMetalness);

  // ── Wet surface (rain) ──────────────────────────────────────────────────────
  // Rain darkens and polishes surfaces. Strongest on up-facing ground (water
  // pools on flat tarmac); near-vertical walls stay mostly matte. A low-frequency
  // value-noise mask carves standing puddles in the low spots that go near-mirror.
  // wet/puddle are reused below to brighten lamp reflections + sky env.
  float wet = 0.0;
  float puddle = 0.0;
  if (uWetness > 0.001) {
    float upFace = smoothstep(0.50, 0.90, N.y);      // flat ground only
    wet = uWetness * upFace;
    float pn = vnoise(vWorldPos.xz * 0.13 + 4.7);
    // Wide, soft puddle edges so pools BLEND into the wet sheet rather than reading
    // as hard painted ovals.
    puddle = smoothstep(0.48, 0.88, pn) * wet;        // only low spots pool
    // Water absorbs light: wet asphalt reads notably darker, puddles a touch darker
    // (not stark, so they don't read as flat dark blobs). WET ROAD DARKEN knob
    // scales the absorption (uWetDark 1 = shipped 0.42 floor, 0 = no darkening).
    albedo *= mix(1.0, clamp(1.0 - 0.58 * uWetDark, 0.0, 1.0), wet);
    albedo *= mix(1.0, 0.50, puddle);
    // Polish: damp sheen → mirror in the puddles. A wet sheet is glossy but not
    // a perfect mirror except where water actually pools, so the general wet
    // roughness stays moderate (keeps the sun specular a streak, not a flare).
    rough = mix(rough, 0.15, wet);
    rough = mix(rough, 0.05, puddle);
    a = rough * rough;
    // Thin water film is a dielectric (~0.03 reflectance) — raise f0 toward it.
    f0 = mix(f0, vec3(0.04), wet * 0.6);
  }

  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);

  // Combine the hard shadow map with soft drifting cloud shadows: the sun is
  // dimmed where clouds pass overhead, casting moving dappled light on the track.
  float shadow = sampleShadow(vWorldPos) * (1.0 - cloudShadow(vWorldPos) * uCloudShadowDim);
  // uKeyMul (KEY LIGHT tuner slider, default 1.0) scales all DIRECT sun lighting
  // — diffuse, GGX spec, clearcoat glint, car-paint glint — without touching
  // ambient fill, fog in-scatter or the env-sky reflection (those keep the
  // scene coherent when the key is dialled down).
  float litNoL = NoL * shadow * uKeyMul;

  // Base diffuse + ambient (== original lambert shader when uMetalness == 0).
  vec3 color = albedo * (amb + uSunColor * litNoL * (1.0 - uMetalness));
  // SHADOW COOLNESS: bias sun-starved (shadowed / ambient-only) pixels toward a
  // cool blue for a sunny-day contrast look. 0 = neutral (shipped).
  if (uShadowTintAmt > 0.001) {
    color *= mix(vec3(1.0), vec3(0.90, 0.96, 1.12), uShadowTintAmt * clamp(1.0 - litNoL, 0.0, 1.0));
  }

  // Reflected view ray — reused by the wet-road lamp reflections and the sky env.
  vec3 Rv = reflect(-V, N);

  // ── Physically-based punctual lights (floodlights / street lamps) ─────────
  // Each lamp is a REAL spotlight: windowed inverse-square falloff (the standard
  // punctual-light attenuation), a true AIMED cone (per-lamp beam direction +
  // inner/outer angles — masts tilt their beams over the road), and the SAME
  // Cook-Torrance GGX specular the sun uses. Diffuse paints the pool; the GGX
  // lobe gives physical highlights — elongated wet-road speculars, glass glints,
  // car-paint sparkle — replacing all the old hand-tuned lobe/glint hacks.
  // No per-light shadows (cost); the cone shapes the light instead.
  vec3 lampFog = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uNumLights) break;
    vec3 LP = uLightPos[i] - vWorldPos;
    float dist = length(LP);
    float rad = uLightRad[i];
    if (dist > rad) continue;
    vec3 Ld = LP / max(dist, 1e-3);
    // Physical 1/d² falloff, eased to exactly 0 at the radius by (1-(d/r)^4)^2.
    float dn = dist / rad;
    float win = clamp(1.0 - dn * dn * dn * dn, 0.0, 1.0);
    // Minimum-distance floor: each lamp's raw energy (buildTrackLights) is sized
    // so its INTENDED aim point (road centre, several metres out) reads as a
    // nicely bloomed pool. On tight street circuits the mast sits right beside
    // the barrier wall, much closer than that aim point — the true 1/d² falloff
    // then overshoots the wall by 10-20x, blowing it to solid white. Clamping
    // the near-field distance keeps the aim-point pool unchanged (dist there is
    // already well above the floor) while taming any close-by surface.
    float distC = max(dist, uLampNearClamp);   // LAMP NEAR CLAMP knob (def 4.0)
    float att = (win * win) / (distC * distC + 1.0);
    if (att < 1e-6) continue;
    // Aimed spot cone: how deep the surface sits inside the lamp's beam.
    // uLightDir = beam aim, uLightCone = (cosInner, cosOuter); uLightBleed is the
    // out-of-beam floor (city skyglow spill between pools).
    float cd = dot(-Ld, uLightDir[i]);
    float beam = smoothstep(uLightCone[i].y, uLightCone[i].x, cd);
    // ILLUMINATION follows the beam (the pool on the road)…
    float spotD = mix(uLightBleed[i], 1.0, beam);
    // …but the REFLECTION doesn't: the glowing lens itself is visible from far
    // outside the beam, so a wet road streaks beneath every lamp you can see —
    // not only inside its illumination cone. The floor is wetness-dependent:
    // high when wet (streaks from every visible lamp), lower when dry so a dry
    // night road keeps pool/valley contrast instead of a uniform specular sheet.
    float spotS = mix(mix(0.16, 0.30, wet) * uLampWallSpill, 1.0, beam);   // LAMP WALL SPILL knob (def 1.0 = shipped floor)
    // Fog in-scatter: lamp irradiance reaching the fog column at this surface.
    // Windowed 1/d2 falloff (att) with a partial out-of-beam floor so the lens
    // glows the fog all around, brightest down the throw. Consumed by the fog
    // and ground-mist tints below - everything here is already computed.
    lampFog += uLightCol[i] * (att * mix(0.35, 1.0, beam));
    float NoLl = max(dot(N, Ld), 0.0);
    // Per-lamp SHADOW for the one mapped floodlight: cars/walls between this
    // surface and the lamp block its pool — the radial shadow swinging around
    // a car as it passes under a mast is the marquee night cue the sun map
    // can't provide (no per-light shadows elsewhere; the cone shapes those).
    // Direct terms only (diffuse pool + GGX/clearcoat specular below): the
    // bounce fill and fog in-scatter stay unshadowed — they are indirect.
    float lampSh = 1.0;
    if (uLampShadowOn > 0.5 && i == uLampShadowIdx) {
      vec4 lpc = uLampShadowVP * vec4(vWorldPos, 1.0);
      if (lpc.w > 0.0) {
        vec3 lps = lpc.xyz / lpc.w * 0.5 + 0.5;
        if (lps.x > 0.002 && lps.x < 0.998 && lps.y > 0.002 && lps.y < 0.998 && lps.z < 1.0) {
          // Perspective depth is nonlinear (most precision at the lens), so the
          // receiver — the road, near the far plane — needs a slope-boosted
          // constant bias against acne rather than the sun map's texel-scaled one.
          float lpz = lps.z - (0.0012 + 0.004 * (1.0 - NoLl));
          float lpt = 1.5 / 512.0;
          lampSh = ( texture(uLampShadowMap, vec3(lps.xy + vec2(-lpt, -lpt), lpz))
                   + texture(uLampShadowMap, vec3(lps.xy + vec2( lpt, -lpt), lpz))
                   + texture(uLampShadowMap, vec3(lps.xy + vec2(-lpt,  lpt), lpz))
                   + texture(uLampShadowMap, vec3(lps.xy + vec2( lpt,  lpt), lpz)) ) * 0.25;
        }
      }
    }
    // Diffuse pool — fades as the road wets so a wet surface shows the lamp's
    // REFLECTION (SSR + the GGX lobe below), not a painted matte circle.
    color += albedo * uLightCol[i] * (att * spotD * lampSh) * NoLl * (1.0 - uMetalness) * (1.0 - wet * 0.85);
    // Bounce fill: pool light bounced off the road washes nearby surfaces
    // (walls, kerbs, car flanks) with the lamp tint even outside the beam -
    // a near-free stand-in for local ambient probes. Soft NoL floor so
    // surfaces facing away from the lamp still catch a little.
    color += albedo * uLightCol[i] * (att * uBounceK * (0.55 + 0.45 * NoLl)) * (1.0 - uMetalness);
    // GGX specular from the lamp — the same microfacet BRDF as the sun. On the
    // wet low-roughness road this physically elongates at grazing angles (the
    // real wet-night streak); on glass/car paint it's the city-light glint.
    vec3 Hl = normalize(Ld + V);
    float NoHl = max(dot(N, Hl), 0.0);
    float VoHl = max(dot(V, Hl), 0.0);
    float Dl = D_GGX(NoHl, a);
    float Vl = V_SmithGGX(NoV, NoLl, a);
    vec3 Fll = F_Schlick(VoHl, f0, clamp(1.0 - rough, 0.0, 1.0));
    vec3 radianceS = uLightCol[i] * (att * spotS * lampSh);
    vec3 lspec = (Dl * Vl) * Fll * radianceS * NoLl;
    color += lspec / (1.0 + lspec);
    // The clearcoat lacquer catches the lamps too — crisp floodlight glints on
    // car bodies at night, over the softer base-coat highlight.
    if (uClearcoat > 0.001) {
      float Dcc = D_GGX(NoHl, 0.03);
      float Vcc = V_SmithGGX(NoV, NoLl, 0.01);
      float Fcc = F_Schlick(VoHl, vec3(0.05), 1.0).x;
      vec3 ccl = vec3(Dcc * Vcc * Fcc) * radianceS * NoLl * uClearcoat;
      color += 2.2 * ccl / (2.2 + ccl);
    }
  }

  // Cook-Torrance specular, soft-clipped so highlights sheen instead of clipping.
  float D = D_GGX(NoH, a);
  float Vis = V_SmithGGX(NoV, NoL, a);
  vec3 F = F_Schlick(VoH, f0, clamp(1.0 - rough, 0.0, 1.0));
  vec3 specCol = (D * Vis) * F * uSunColor * litNoL;
  specCol = specCol / (1.0 + specCol);
  color += specCol;

  // Clearcoat: a second, fixed-low-roughness specular lobe over the base coat —
  // the thin lacquer shell of automotive paint. It keeps a crisp sun highlight
  // even where the base coat is rougher, which is what gives cars their glossy
  // showroom read. The bodywork is smooth-shaded (car3d.js lofts), so the lobe
  // sweeps across the curved panels per-pixel instead of flashing whole facets.
  if (uClearcoat > 0.001) {
    // Roughness ~0.19 (a=0.035): wide enough that the streak is VISIBLE sweeping
    // the curved panels (at 0.1 the cone is ~2 degrees — sub-pixel, reads matte).
    // Soft-clipped to a 2.6 HDR ceiling instead of 1.0: the hot core punches past
    // the bloom threshold, so the highlight GLOWS — the actual "shiny" cue.
    // Uses the GEOMETRIC normal (Ngeo): the lacquer shell is smooth, so the sun
    // streak stays crisp — the flake micro-normal only roughens the base coat.
    vec3 Hg = normalize(L + V);
    float NoHg = max(dot(Ngeo, Hg), 0.0);
    float NoVg = max(dot(Ngeo, V), 1e-4);
    float NoLg = max(dot(Ngeo, L), 0.0);
    float ccA = 0.035;
    float Dc = D_GGX(NoHg, ccA);
    float Vc = V_SmithGGX(NoVg, NoLg, ccA);
    float Fc = F_Schlick(max(dot(V, Hg), 0.0), vec3(0.05), 1.0).x;
    // uKeyMul included so KEY LIGHT dims this lobe with the rest of the direct
    // sun (it was the one direct term missing it — a keyMul of 0 left every
    // clearcoated car with a full-brightness sun streak).
    vec3 ccCol = vec3(Dc * Vc * Fc) * uSunColor * NoLg * shadow * uKeyMul * uClearcoat;
    ccCol = 2.6 * ccCol / (2.6 + ccCol);
    color += ccCol;
  }

  // Analytic clearcoat ENV mirror — the lacquer reflects a procedural sky in the
  // reflected view ray, on EVERY paint pixel including the vertical FLANKS (the
  // carDeck term below only mirrors up-facing decks; SSR can't reach flanks that
  // reflect off-screen). Now a WHOLE-CAR env mirror: a base reflectance on every
  // panel + a grazing Fresnel rim, so the entire body reads reflective (not just
  // the silhouette). VIEW-driven (Fresnel on Ngeo), NOT N.y-driven, so it stays
  // uniform across panel orientations instead of hot-spotting flat up-facing
  // panels the way the old deck mirror did (that was the "silver plane" under the
  // car). Energy-conserving: the base is DARKENED under the mirror weight first,
  // then the reflected sky is added over it (a mirror on gloss, not a milky wash),
  // so the livery still reads through it face-on while the car goes mirror-bright.
  if (uCarPaint > 0.001 && uClearcoat > 0.001) {
    vec3 Rg = reflect(-V, Ngeo);
    float NoVc = max(dot(Ngeo, V), 1e-4);
    float ccFb = 1.0 - NoVc; float ccF = ccFb * ccFb;      // fresnel², rim-concentrated (mul not pow(_,2): pow(0,2) NaNs on mobile)
    // Mirror strength scales with a LIVE probe (uEnvStr>0). Probe-less views —
    // the in-game SETUP MENU preview and the car-viewer with no world — have no
    // real surroundings to mirror, so a strong analytic mirror there just washes
    // the livery flat grey. Those keep only a gentle grazing sheen (base 0.14);
    // in-race the live cube drives a strong, near-uniform mirror (base 0.72).
    // The grazing Fresnel rim (0.28·ccF) stays in both — a subtle edge, not a wash.
    float probeLive = clamp(uEnvStr, 0.0, 1.0);
    float baseRefl = mix(0.14, 0.72, probeLive);
    float envW = clamp(uClearcoat * (baseRefl + 0.28 * ccF) * (1.0 - rough * 0.25), 0.0, 0.96);
    // Soft horizon: bright sky above, dark ground tone below. Was a hard step
    // (-0.03..0.06) — on the faceted engine cover / sidepod shoulders adjacent
    // facets straddled the line and flipped between "sky" and "ground", reading
    // as an arbitrary light/dark panel patchwork instead of a reflection. A wide
    // band keeps the sweep cue but blends across facet seams.
    // When the probe is FULLY live (uEnvStr≈1) the mix below collapses to envReal,
    // so the analytic gradient (smoothstep+mix+sqrt, ~10 ops/px on every clear-coated
    // pixel) would be computed only to be discarded — skip it in that case. The
    // common case (probe OFF, uEnvStr 0) still takes the analytic path and skips the
    // cube fetch, so this only ever removes work, never adds a branch cost that matters.
    vec3 envCC;
    if (uEnvStr >= 0.999) {
      // Sharp mip (rough·2.5): a crisp mirror so buildings/trees read as themselves.
      envCC = textureLod(uEnvCube, Rg, rough * 2.5).rgb;
    } else {
      float horiz = smoothstep(-0.12, 0.30, Rg.y);
      vec3 skyR = mix(uSkyHorizon * 1.2, uSkyZenith, sqrt(max(Rg.y, 0.0)));   // sqrt not pow(x,0.5): pow(0.0,0.5) NaNs on mobile
      envCC = mix(uAmbGround * 0.6, skyR, horiz);
      // LIVE env probe (partial fade): when the cubemap around the player car is
      // warm, the lacquer mirrors the REAL surroundings (trees, buildings, track,
      // sky — including everything behind the camera that SSR can never see) instead
      // of the analytic gradient above. uEnvStr fades analytic → real, so the first
      // frames (and the probe-less setup viewer) keep the gradient fallback.
      if (uEnvStr > 0.001) {
        vec3 envReal = textureLod(uEnvCube, Rg, rough * 2.5).rgb;
        envCC = mix(envCC, envReal, clamp(uEnvStr, 0.0, 1.0));
      }
    }
    envCC += uSunColor * pow(max(dot(Rg, uSunDir), 1e-4), 400.0) * uCarSunGlint * shadow;  // sun disc (CAR SUN GLINT knob, def 12.0) — base floored 1e-4: pow(0.0,400.0)=NaN on mobile GPUs (log2(0)=-Inf) → black car pixels at night; SwiftShader returns 0 so it never repro'd headless
    color *= 1.0 - envW * 0.94;                             // absorb: darken the base hard under the mirror so it reads as a mirror, not a milky wash
    vec3 addCC = envCC * envW;
    color += addCC / (1.0 + addCC * 0.35);                 // gentle soft-clip — keeps bright reflections bright
  }

  // Metallic-flake SPARKLE — the signature "metallic paint" glitter. Each ~4.5 mm
  // object-space cell gets a random flake tilt; a flake flashes only when its
  // facet half-aligns with the sun (view-dependent, so the sparkle field shifts
  // as the camera moves). HDR gain so flashes bloom. Distance-faded to nothing so
  // it never aliases at range. Additive white glint — leaves the pigment alone.
  if (uCarPaint > 0.001 && litNoL > 0.0 && uSparkle > 0.001) {
    float spFade = clamp(1.0 - (vDist - 14.0) / 30.0, 0.0, 1.0) * uSparkle;
    // Flakes live in the COLOUR coat: near-black albedo (tyres, carbon floor,
    // wings, trim) has no metallic pigment, so gate the glitter out there — the
    // dense white speckle on the dark parts read as dust, not sparkle.
    spFade *= smoothstep(0.06, 0.22, max(albedo.r, max(albedo.g, albedo.b)));
    if (spFade > 0.01) {
      vec3 cell = floor(vObjPos * 220.0);
      float h1 = hash21(cell.xy + cell.z * 19.7);
      float h2 = hash21(cell.yz + cell.x * 7.3);
      // Flake basis off the geometry normal. Ngeo is a well-defined car normal in
      // practice (and litNoL>0 above already rejects a NaN normal), but harden the
      // basis anyway: a fallback unit normal keeps cross()/normalize() finite even
      // if a degenerate (zero-length) Ngeo ever reaches here, so a bad face can't
      // spray NaN glints across the paint.
      vec3 nN = length(Ngeo) > 1e-4 ? normalize(Ngeo) : vec3(0.0, 1.0, 0.0);
      vec3 fT = normalize(cross(nN, vec3(0.0, 1.0, 0.001)) + vec3(1e-4));
      vec3 fB = cross(nN, fT);
      vec3 gN = normalize(nN + (fT * (h1 * 2.0 - 1.0) + fB * (h2 * 2.0 - 1.0)) * 0.5);
      // Tighter alignment window + lower gain than the original (0.965 / 3.0):
      // sparse individual glints that flash as the view moves, instead of a
      // dense sand-grain field that made the paint read dirty/matte.
      float glint = smoothstep(0.990, 1.0, dot(gN, H));
      // CAR SPARKLE knob (def 1.6 = as-shipped) sets the metallic-flake glint gain.
      color += uSunColor * litNoL * glint * uCarSparkle * uCarPaint * spFade;
    }
  }

  // (Car deck mirror step 2 removed — see the note at step 1; the clearcoat ENV
  //  mirror above now carries the car's reflection uniformly across every panel.)

  // Environment reflection: when roughness is very low (wet road / glossy paint),
  // sample the sky gradient in the reflected view direction.
  // Roughness > 0.4 = no visible reflection; < 0.15 = mirror-like sky in road.
  // Wetness forces the surface glossy, so this kicks in hard on rainy roads —
  // the sky/horizon mirrors in the tarmac and the sun smears a bright streak.
  float envBlend = clamp((0.40 - rough) / 0.30, 0.0, 1.0) * uSpecular;
  envBlend = max(envBlend, wet * 0.15);   // wet-road reflection is owned by SSR now; keep only a faint env tint
  if (envBlend > 0.001) {
    vec3 R = Rv;
    // Lower exponent shows more of the horizon→zenith gradient in the reflection
    // (vertical glass mostly reflects up into a near-uniform zenith, which reads
    // flat — this lets the brighter horizon band into the reflected sky).
    float skyT = pow(max(R.y, 1e-4), 0.40);
    // Tint env sample by sky gradient; also pick up a gentle sun-horizon blush
    // when the reflected direction aligns with the sun (warm chrome/paint sheen).
    vec3 envColor = mix(uSkyHorizon, uSkyZenith, skyT);
    float envSunAlign = max(dot(R, uSunDir), 0.0);
    envColor = mix(envColor, envColor * uSunColor * 1.15, envSunAlign * envSunAlign * (1.0 - rough));
    // (Wet-road sun-glitter removed — SSR now reflects the real sky/sun on wet roads.)
    // Dry glossy glass catches the sun too — a tighter, softer glint so day/dawn/dusk
    // windows flash where they face the sun. Gated (1-wet) so wet road is unchanged;
    // night sun is dim moonlight so this is naturally negligible after dark.
    envColor += uSunColor * pow(max(envSunAlign, 1e-4), 22.0) * (1.0 - wet) * envBlend * 0.6 * uWindowSunFlash;   // WINDOW SUN FLASH knob (def 1.0 = shipped)
    // Roughness dampens the env contribution: rough surfaces see a blurry flat sky.
    float roughDamp = 1.0 - rough * 0.7;
    // Fresnel: reflection is strongest at grazing angles. On wet ground square
    // it so the sky sheen concentrates into the far grazing band instead of
    // flooding the whole low-camera road — near/mid tarmac stays dark and glossy.
    // Also dim the reflected sky a touch when wet (a wet road is never as bright
    // as the sky it mirrors).
    float envFresnel = F_Schlick(max(dot(N, V), 0.0), vec3(0.04), 1.0).x;
    envFresnel = mix(envFresnel, envFresnel * envFresnel, wet);
    vec3 envWet = envColor * (1.0 - wet * 0.90);   // whisper only on wet; SSR owns the reflection
    // Soft-clip the reflection so a wet road can never blow out to a white sheet
    // (a low dusk/dawn sun + bright twilight sky otherwise push this past 1). A
    // Reinhard shoulder on the brightest channel keeps it bright where the scene
    // is dim and caps it where it would over-saturate.
    vec3 envAdd = envWet * envFresnel * envBlend * roughDamp * (1.0 - uMetalness);
    float envM = max(max(envAdd.r, envAdd.g), envAdd.b);
    color += envAdd / (1.0 + envM);
  }

  // Sky rim / fresnel: a subtle atmospheric brightening at grazing angles,
  // tinted by the horizon sky colour. Gives edges a little 'air' without
  // making surfaces look wet or plastic. Damped by roughness.
  {
    float rf = 1.0 - NoV; float rimFresnel = rf * rf * rf;
    float rimAmt = rimFresnel * (1.0 - rough * 0.85) * 0.18 * uSkyRimGlow;   // SKY RIM GLOW knob (def 1.0 = shipped)
    color += uSkyHorizon * rimAmt;
  }

  // Ambient contact darkening: surfaces facing each other (concave) receive
  // less sky light. Approximate with a bent-normal trick: upward-facing
  // surfaces receive full ambient; downward faces lose it.
  // This is already partially handled by hemisphere ambient (N.y), but a
  // gentle extra crush in the darkest zones adds perceived depth.
  {
    float ao = pow(max(N.y * 0.5 + 0.5, 1e-4), 0.35);
    color *= mix(1.0 - 0.12 * uAmbContactDark, 1.0, ao);   // AMBIENT CONTACT DARK knob (def 1.0 = shipped 0.88 floor)
  }

  // Emissive: lerp toward unlit albedo (self-illumination, sun-independent) and,
  // for bright/warm surfaces (lit windows, floodlight lenses, neon), add an extra
  // additive lift that pushes the value past 1.0 so the bloom bright-pass picks it
  // up and the surface actually *glows* at night rather than just reading flat.
  if (uEmissive > 0.0) {
    color = mix(color, albedo, uEmissive);
    // Glow weight: how "lamp-like" the albedo is. Bright (high luminance) AND
    // warm-or-neutral colours qualify; dark/muddy colours get no lift so emissive
    // walls don't bloom. Uses max channel for brightness, scaled smoothly in.
    float bright = max(albedo.r, max(albedo.g, albedo.b));
    float glow = smoothstep(0.50, 0.95, bright) * uEmissive;
    // Push the glow well PAST 1.0 (HDR) so lit windows / neon / lamp lenses read
    // as actual light SOURCES — they punch through the dark and bloom into halos,
    // instead of sitting as flat bright paint.
    // HDR push kept moderate (was 3.2): windows/heads GLOW, they don't glare —
    // the night energy budget lives or dies on this multiplier.
    // PER-MATERIAL bloom weight: albedos authored ABOVE white (the neon crown
    // bands at ~2.5, neon-tinted panes, the LENS_NIGHT lamp albedos at
    // 1.06-1.40 — see tracks.js) are the scenery's "this surface IS a light
    // source" tag, while generic emissive (lit concrete, night road/terrain
    // glow, warm office panes) sits at or under 1.0. Scaling an extra push by
    // how far past white the albedo is lets neon/signage/lenses bloom harder
    // WITHOUT raising uGlowAmp or lowering the global bloom threshold (both of
    // which drag every emissive surface — and the fog — up with them).
    float hdrTag = max(bright - 1.0, 0.0);
    color += albedo * glow * uGlowAmp * (1.0 + hdrTag * uBloomBoost);
  }

  // Height-based fog: density falls off exponentially with altitude above eye level.
  // uFogHeight = 0 → uniform (original behaviour); > 0 → pooling fog.
  float heightAtten = uFogHeight > 0.0
    ? exp(-max(vWorldPos.y - uEye.y, 0.0) * uFogHeight)
    : 1.0;
  float fd = vDist * uFogDensity * heightAtten;
  float f = 1.0 - exp(-fd * fd);
  // Sun in-scattering (Inigo Quilez): the fog is NOT a flat colour — when the
  // view ray points toward the sun, the fog glows toward the sun's colour
  // (forward Mie scatter), staying neutral away from it. Gives volumetric depth
  // and makes a low warm sun bleed dramatically through dawn/dusk haze.
  vec3 rd = normalize(vWorldPos - uEye);
  float sunAmount = max(dot(rd, uSunDir), 0.0);
  // Wider exponent (4) = the warm sun-glow in the haze spreads across a broader
  // arc of the horizon for a more dramatic sunset; an extra tight core (pow 16)
  // adds a hot bloom right at the sun.
  float sunAmt = max(sunAmount, 1e-4);   // floor base: pow(0.0, n) NaNs on mobile GPUs
  vec3 fogCol = mix(uFogColor, uSunColor, pow(sunAmt, 4.0));
  // FOG SUN CORE knob (def 0.6 = as-shipped): the tight hot bloom right at the sun.
  fogCol += uSunColor * pow(sunAmt, 16.0) * uFogSunCore;
  // FOG WARM / COOL white-balance (uFogTint 0 = neutral, + warm, − cool).
  fogCol *= vec3(1.0 + max(uFogTint, 0.0) * 0.25 - max(-uFogTint, 0.0) * 0.12,
                 1.0 - abs(uFogTint) * 0.02,
                 1.0 - max(uFogTint, 0.0) * 0.25 + max(-uFogTint, 0.0) * 0.18);
  // GLOWING FOG: nearby lamps tint the fog itself, so fog banks glow around
  // floodlights and neon at night. Soft-clipped so a lamp cluster can never
  // push the fog wall past the night bloom threshold into a white wash; the
  // mix by f below gates it, so clear air (f near 0) gets no halo. Energy
  // split with the godray pass: godray owns the NEAR air column (Beer-Lambert
  // decay + range gate), this tint owns the DISTANT fog wall (f grows with
  // distance) - the two never stack in the same regime.
  vec3 lampFogC = vec3(0.0);
  if (uLampFog > 0.0) {
    vec3 lf = lampFog * uLampFog;
    lampFogC = lf / (1.0 + max(max(lf.r, lf.g), lf.b) * uLampFogClip);
    fogCol += lampFogC;
  }
  color = mix(color, fogCol, f);
  // Low-lying GROUND MIST: a drifting FBM fog that pools near the surface (dawn /
  // humid / overcast). Densest at a low datum, thinning with altitude and ramping
  // in with distance; broken by a slow-drifting FBM so it rolls rather than a
  // flat sheet. Tinted by the fog colour with a warm sun in-scatter.
  if (uGroundMist > 0.001) {
    float lowH = max(vWorldPos.y - (uEye.y - 5.0), 0.0);
    // MIST HEIGHT BAND: taller band (bigger uMistHeight) = slower vertical falloff.
    float band = exp(-lowH * (0.09 / max(uMistHeight, 0.05)));
    vec2 mp = vWorldPos.xz * 0.020 + vec2(uTime * 0.010, uTime * 0.006);
    float dRamp = clamp((vDist - 8.0) / 45.0, 0.0, 1.0);
    float mist = uGroundMist * band * smoothstep(0.35, 0.72, cloudFBM(mp)) * dRamp;
    vec3 mistCol = mix(uFogColor, uSunColor, pow(max(sunAmount, 1e-4), 3.0)) + lampFogC * uMistShare;
    color = mix(color, mistCol, clamp(mist, 0.0, 0.45));
  }
  // Car-paint pixels are TAGGED in alpha (opaque draws never blend, so the
  // channel is free): the composite SSR pass reflects the real world on car
  // bodywork every frame — the same world-mirror the wet road gets.
  outColor = vec4(color, uCarPaint > 0.001 ? 0.35 : uAlpha);
}`;

  const SKY_VS = `#version 300 es
uniform mat4 uInvViewProj;
out vec3 vDir;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, 1.0, 1.0); // z = w -> depth 1.0 (far plane)
  vec4 a = uInvViewProj * vec4(p, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(p, 1.0, 1.0);
  vDir = b.xyz / b.w - a.xyz / a.w;
}`;

  const SKY_FS = `#version 300 es
precision highp float;
in vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStars;
uniform float uCloud;
uniform float uTime;   // seconds, 0 = static/deterministic (backward-compatible)
uniform float uMoon;   // 0..1 moon visibility (0 = none, backward-compatible)
uniform vec3 uCityGlow;  // night city light-pollution dome (colour x strength, 0 = none)
uniform float uStarBright; // star-field intensity multiplier (def 1.0)
uniform float uCloudSpeed; // cloud drift/evolution rate multiplier (def 1.0)
uniform float uSkyGrad;    // horizon→zenith gradient exponent (def 0.35)
uniform float uStarDensity;// star-field spawn-window multiplier (def 1.0)
uniform float uDaySkyBlue; // day deep-blue mid-band strength (def 1.0)
uniform float uMieScatter; // sun-facing sky forward-scatter glow gain (def 1.0)
uniform float uCloudSilver;// backlit cloud-edge silver-lining gain (def 1.0)
uniform float uCoronaAureole; // wide sun aureole halo gain (def 1.0)
uniform float uSunDiscSize;// angular size of the sun disc (def 1.0)
uniform float uStarSize;   // star point-size multiplier (def 1.0)
uniform float uStarTwinkle; // star twinkle amplitude scale (def 1.0)
uniform float uMoonDiscSize;// moon disc angular-size multiplier (def 1.0)
uniform float uMoonHalo;   // moon halo spread/strength scale (def 1.0)
uniform float uSunCorona;  // tight sun corona ring gain (def 1.0)
uniform float uSunSquash;  // sun horizon vertical-squash amount (def 1.0)
uniform float uCityGlowReach; // city-glow horizon reach scale (def 1.0)
uniform float uCloudDef;   // cloud edge definition/contrast (def 1.0)
out vec4 outColor;
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash2(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise2(p); p *= 2.02; a *= 0.5; }   // 5→4 octaves
  return s;
}
void main() {
  vec3 dir = normalize(vDir);
  float up = dir.y;
  float sd = max(dot(dir, uSunDir), 0.0);

  // Sun-elevation factor: 0 = sun on/below horizon, 1 = overhead noon.
  // Drives automatic golden-hour / sunset tint without per-track authoring.
  float sunE = clamp(uSunDir.y * 1.4, 0.0, 1.0);

  // Bright-DAY gate: 1 only when the sun is well up (≈25°+). Isolates day-only
  // sky enrichments (cumulus definition, horizon cloud-bank, gradient life) so
  // the dramatic dusk/dawn/night looks that share this shader are untouched.
  float daytime = smoothstep(0.35, 0.60, sunE);
  // TWILIGHT gate: ~1 at dawn/dusk (low sun above the horizon), 0 at deep night
  // and bright day. Drives extra sunset/sunrise cloud presence + warm grading.
  float twilight = smoothstep(0.02, 0.22, sunE) * (1.0 - daytime);

  // NIGHT gate: uStars>0.5 marks a night session. At night the scene keeps
  // uSunDir pointing HIGH (it doubles as the moon key-light direction), which
  // fools the sunElevation math above into reading midday — painting a bright
  // white sun disc + puffy daytime cumulus + a blue day gradient among the
  // stars. Zero the sun-driven day/twilight ENRICHMENTS here (the horizon
  // warm-glow terms below are already up-faded to the horizon, so they stay).
  float nightSky = step(0.5, uStars);
  daytime  *= (1.0 - nightSky);
  twilight *= (1.0 - nightSky);

  // Overcast factor: drives grey-shift and corona damping under heavy cloud.
  float overcast = smoothstep(0.5, 1.0, uCloud);

  // --- Sky gradient ---
  vec3 c;
  if (up >= 0.0) {
    // Under heavy overcast, flatten zenith/horizon toward a uniform grey.
    vec3 zenithO  = mix(uZenith,  vec3(0.55, 0.56, 0.58), overcast * 0.75);
    vec3 horizonO = mix(uHorizon, vec3(0.58, 0.58, 0.60), overcast * 0.60);
    // pow(up, uSkyGrad): richer blue zenith extends further down, horizon band
    // narrower — avoids the pale/washed look at mid-sky while keeping the
    // gradient smooth. (Was 0.5 which mapped too much sky to the horizon tint.)
    // SKY GRADIENT knob (def 0.35 = as-shipped); lower = richer dome, higher = paler mid.
    c = mix(horizonO, zenithO, pow(up, uSkyGrad));
    // Day gradient LIFE: a deeper saturated blue pushed into the low/mid band
    // (so the gameplay sky strip isn't a flat pale wash) plus a faint azimuthal
    // variation that breaks the perfectly-smooth gradient. Day-only and faded
    // under overcast, so dusk/dawn/night and grey days are untouched.
    {
      float bandLM = (1.0 - smoothstep(0.06, 0.55, up)) * smoothstep(0.0, 0.06, up);
      vec3 deepBlue = vec3(0.10, 0.30, 0.72);
      // DAY SKY BLUE knob (def 1.0 = as-shipped) scales the band strength; clamp
      // keeps the blend valid when the knob pushes past 1.
      c = mix(c, mix(c, deepBlue, 0.30), clamp(daytime * (1.0 - overcast) * bandLM * uDaySkyBlue, 0.0, 1.0));
      float az = vnoise2(vec2(atan(dir.z, dir.x) * 2.2, up * 6.0)) - 0.5;
      c *= 1.0 + az * 0.05 * daytime * (1.0 - overcast) * (1.0 - smoothstep(0.0, 0.5, up));
    }
    // Golden-hour: warm amber/orange overlay near the horizon when the sun is low.
    // Concentrated in the bottom 32% of sky; fades out as sun climbs past ~50°.
    // Damped under overcast so heavy cloud doesn't show warm colour.
    float goldenAmt = (1.0 - smoothstep(0.0, 0.72, sunE))
                    * (1.0 - smoothstep(0.0, 0.32, up))
                    * (1.0 - overcast * 0.9);
    vec3 goldenColor = mix(vec3(0.70, 0.22, 0.04), vec3(0.92, 0.55, 0.16),
                           clamp(sunE * 2.5, 0.0, 1.0));
    c = mix(c, c * 0.45 + goldenColor * 0.55, goldenAmt * 0.80);
    // Low-sun horizon band: extra warm band just above the horizon at sunset.
    // Gives a richer, more saturated glow at the magic hour.
    float lowBand = (1.0 - smoothstep(0.0, 0.60, sunE))
                  * (1.0 - smoothstep(0.0, 0.18, up))
                  * smoothstep(0.01, 0.06, up)
                  * (1.0 - overcast * 0.85);
    vec3 lowColor = mix(vec3(0.90, 0.26, 0.03), vec3(1.0, 0.66, 0.12),
                        clamp(sunE * 3.0, 0.0, 1.0));
    c = mix(c, lowColor, lowBand * 0.70);
  } else {
    // Below the horizon: dark earth tone, smoothly blended from the horizon colour.
    float gnd = clamp(-up * 5.0, 0.0, 1.0);
    c = mix(uHorizon * 0.85, vec3(0.035, 0.030, 0.022), gnd * gnd);
  }

  // --- Procedural cloud layer ---
  // Cloud plane is drifted slowly by uTime (no drift when time=0 → deterministic).
  // Coverage/thickness seen along this ray, exported for the city-glow cloud
  // pickup below (clouds over a lit city catch the uplight on their bellies).
  float cityCov = 0.0;
  float cityThick = 0.0;
  if (uCloud > 0.001 && up > 0.012) {
    vec2 cp = dir.xz / up * 0.42;
    // Drift offset: two independent slow vectors for parallax feel. CLOUD SPEED
    // knob scales the drift/evolution rate (uCloudSpeed 1 = shipped, 0 = frozen).
    float cT = uTime * uCloudSpeed;
    vec2 drift1 = vec2(cT * 0.0028, cT * 0.0011);
    vec2 drift2 = vec2(cT * 0.0017, cT * 0.0023);
    // Evolution: a very slow warp of the second octave to change cloud shape.
    float evo = cT * 0.00035;
    vec2 cp1 = cp + drift1;
    vec2 cp2 = cp + drift2;
    float f = fbm(cp1);
    // Base coverage. Lower band than the old 0.55→0.92 so puffy cumulus read
    // clearly instead of faint wisps; fade in just above the horizon.
    float cov = smoothstep(0.50 - uCloud * 0.42, 0.84, f) * smoothstep(0.013, 0.05, up);
    // ── Cloudscape enrichments — bright DAY *and* TWILIGHT (sunset/sunrise) get
    //    extra cumulus definition + a horizon cloud-bank; deep night is untouched.
    float cloudRich = max(daytime, twilight);
    if (cloudRich > 0.001) {
      // Billow: a higher-frequency octave carves lumpy cumulus definition so the
      // puffs read as 3-D cauliflower rather than flat smears.
      float billow = fbm(cp1 * 2.3 + vec2(11.7, 4.3));
      float defined = smoothstep(0.42, 0.80, f * 0.6 + billow * 0.45)
                    * smoothstep(0.013, 0.05, up);
      // CLOUD DEFINITION (uCloudDef, def 1) scales how strongly the billow octave
      // carves lumpy cumulus edges onto the base coverage (0.85 = as-shipped blend).
      cov = mix(cov, max(cov, defined), clamp(cloudRich * 0.85 * uCloudDef, 0.0, 1.0));
      // Horizon cloud-bank: distant cumulus bunched near the horizon on a
      // compressed plane, so the LOW gameplay sky band (just above the scenery)
      // is never a plain wash. Its own coverage + a band fade focused ~1–9°.
      // Twilight gets a fuller, lower bank so sunset/sunrise has dramatic strata
      // catching the warm light right where the player looks.
      vec2 bp = dir.xz / max(up, 0.02) * 0.16 + drift1 * 1.4;
      float bankThresh = 0.46 - uCloud * 0.30 - twilight * 0.10;
      float bankCov = smoothstep(bankThresh, 0.80, fbm(bp))
                    * smoothstep(0.013, 0.030, up) * (1.0 - smoothstep(0.10, 0.26, up));
      cov = max(cov, bankCov * cloudRich * (1.0 - overcast * 0.5));
      // Firmer edges so cumulus look solid, not gauzy.
      cov = mix(cov, smoothstep(0.18, 0.82, cov), cloudRich * 0.5);
    }
    // Second FBM gives per-cloud "thickness": thin areas = backlit bright,
    // thick billowing regions = shadowed dark underside.
    float thick = clamp(fbm(cp2 * 0.55 + vec2(3.1 + evo, 1.7)) * 2.0 - 0.55, 0.0, 1.0);
    float sl = pow(sd, 2.0);
    float sunBright = max(uSunColor.r, max(uSunColor.g, uSunColor.b));
    // Under heavy overcast, clamp sunBright so even a bright sun gives grey clouds.
    float effectiveSunBright = mix(sunBright, min(sunBright, 0.55), overcast);
    float golden = 1.0 - smoothstep(0.0, 0.45, sunE);   // 1 near horizon, 0 high
    // Sunlit tops: white in daylight, strongly warm/red-tinted at golden hour.
    vec3 cloudTop = mix(vec3(0.58, 0.62, 0.70), vec3(1.0, 0.97, 0.91), sl);
    cloudTop *= 0.38 + 0.62 * effectiveSunBright;
    cloudTop = mix(cloudTop, cloudTop * uSunColor * mix(1.45, 2.6, golden),
                   sl * (1.0 - sunE) * (0.55 + golden * 0.40) * (1.0 - overcast));
    // Under overcast flatten tops toward medium grey.
    cloudTop = mix(cloudTop, vec3(0.62, 0.63, 0.65), overcast * 0.65);
    // Dark undersides: cooler/dimmer, but pick up a warm pink under-glow at sunset.
    vec3 cloudBot = vec3(0.26, 0.27, 0.34) * (0.24 + 0.44 * effectiveSunBright);
    cloudBot += uSunColor * vec3(0.9, 0.42, 0.5) * (0.22 * golden * (1.0 - overcast) * (1.0 + twilight * 1.3));
    cloudBot = mix(cloudBot, vec3(0.19, 0.19, 0.22), overcast * 0.60);
    vec3 lit = mix(cloudBot, cloudTop, clamp(0.18 + (1.0 - thick) * 0.75, 0.0, 1.0));
    // Day: widen the top↔bottom contrast so cumulus get punchy sunlit caps and
    // shadowed bases (gated; twilight clouds keep their soft warm grading).
    {
      float capf = clamp(0.18 + (1.0 - thick) * 0.75, 0.0, 1.0);
      lit = mix(lit, mix(cloudBot * 0.80, cloudTop * 1.14, capf), daytime * 0.45);
    }
    // Silver lining: thin sun-facing cloud edges glow bright (backlit forward scatter),
    // most intense at golden hour — the defining dramatic-cloud cue. Pushed much
    // harder at twilight so sunset/sunrise clouds get blazing fire-lit rims.
    float silver = pow(sd, 6.0) * (1.0 - thick) * (0.55 + golden) * (1.0 - overcast * 0.7);
    // CLOUD SILVER LINING knob (def 1.0 = as-shipped) scales the backlit rim glow.
    lit += uSunColor * silver * (1.3 + twilight * 1.6) * uCloudSilver;
    // Twilight: a broad warm wash across the sun-facing cloud field (not just the
    // thin rim) so the whole sky catches fire at the magic hour.
    lit += uSunColor * pow(sd, 2.5) * twilight * 0.30 * (1.0 - overcast * 0.6);
    // Moon tints nearby clouds faintly blue-silver.
    if (uMoon > 0.0) {
      float moonLit = uMoon * cov * (1.0 - thick * 0.6) * 0.18;
      lit = mix(lit, lit + vec3(0.08, 0.10, 0.16), moonLit);
    }
    c = mix(c, lit, cov);
    cityCov = cov;
    cityThick = thick;
  }

  // --- Mie forward scatter: glow toward the sun, strongest near the horizon ---
  // Damped under overcast (corona hidden behind cloud).
  float upPos = max(up, 0.0);
  float mieDamp = 1.0 - overcast * 0.85;
  // MIE SCATTER knob (def 1.0 = as-shipped) scales the sun-facing sky glow; clamp
  // keeps the mix blend valid when the knob pushes the amount past 1.
  c = mix(c, uSunColor, clamp(pow(sd, 5.0) * 0.22 * max(1.0 - upPos * 1.5, 0.0) * mieDamp * uMieScatter, 0.0, 1.0));

  // --- Horizon glow in the sun's compass direction ---
  vec2 sunH = vec2(uSunDir.x, uSunDir.z);
  float sunHLen = length(sunH);
  if (sunHLen > 0.05) {
    vec2 dirH = vec2(dir.x, dir.z);
    float dirHLen = length(dirH);
    float hdot = dirHLen > 0.05 ? max(dot(dirH / dirHLen, sunH / sunHLen), 0.0) : 0.0;
    float hband = max(1.0 - abs(up) * 5.0, 0.0);
    c += uSunColor * pow(hdot, 6.0) * hband * hband * 0.22 * sunHLen * mieDamp;
  }

  // --- Sun corona + disc (damped under overcast) ---
  // goldenFactor: 1 when the sun is at the horizon, 0 high up — drives reddening,
  // a broader warm aureole, a vertically flattened disc, and a brighter HDR core.
  // coronaDamp folds in the NIGHT gate: the sun disc + corona + inner ring all
  // multiply by this, so a night session (sunDir high as the moon key) can never
  // paint a daytime sun disc up among the stars. The moon disc is drawn separately.
  float coronaDamp = (1.0 - overcast * 0.92) * (1.0 - nightSky);
  float golden = 1.0 - smoothstep(0.0, 0.45, sunE);
  vec3 sunWarm = mix(uSunColor, uSunColor * vec3(1.18, 0.52, 0.24), golden);
  // Wide aureole: broader (lower exponent) and stronger at golden hour.
  // CORONA AUREOLE knob (def 1.0 = as-shipped) scales the broad sun halo glow.
  c += sunWarm * pow(sd, mix(20.0, 8.0, golden)) * (0.55 + golden * 0.55) * coronaDamp * uCoronaAureole;
  // SUN CORONA RING knob (def 1.0 = as-shipped) scales the tight inner ring.
  c += sunWarm * pow(sd, 300.0) * 0.95 * uSunCorona * coronaDamp;   // tight inner ring
  // Flatten the disc near the horizon (atmospheric refraction squashes it).
  // SUN HORIZON SQUASH knob (def 1.0 = as-shipped): scales the golden-hour vertical
  // squash of the disc (1.0 = round, higher = more oval near the horizon).
  vec3 dd = dir - uSunDir * sd;
  float perp = length(vec2(length(dd.xz), dd.y * mix(1.0, mix(1.0, 1.6, golden), uSunSquash)));
  // SUN DISC SIZE knob (def 1.0 = as-shipped): scales the disc's angular radius by
  // widening the smoothstep edge. Larger = a bigger, brighter sun.
  float disc = smoothstep(mix(0.018, 0.028, golden) * uSunDiscSize, 0.006 * uSunDiscSize, perp) * coronaDamp;
  // Bright HDR core (>1) so it blooms into glare; warm-white high, deep amber low.
  vec3 discCore = mix(vec3(2.3, 2.2, 1.9), sunWarm * 2.8, golden);
  c += discCore * disc;

  // --- Stars (night tracks) ---
  if (uStars > 0.5 && up > 0.05) {
    // ROUND point stars. The old version lit whole direction-grid CELLS, which
    // project as elongated dashes on screen (they read as "tiny rays"), and its
    // giant stars crossed the bloom threshold and smeared into streaks. Now each
    // star is a tiny anti-aliased DISC placed inside its cell, with brightness
    // capped below the bloom threshold so stars can never bloom into rays.
    float SC = 180.0;
    vec3 cell = floor(dir * SC);
    float h = hash3(cell);
    // STAR DENSITY knob (def 1.0 = as-shipped): scale the (1 - threshold) spawn
    // window, clamped below 1 so a huge density can't reject every cell to blank.
    if (h > min(0.9994, 1.0 - (1.0 - 0.9968) * uStarDensity)) {
      vec3 jit = vec3(hash3(cell + 7.1), hash3(cell + 13.7), hash3(cell + 29.3)) - 0.5;
      vec3 sdir = normalize((cell + 0.5 + jit * 0.8) / SC);
      float d = length(dir - sdir);
      float bright = 0.30 + 0.55 * hash3(cell + 43.0);
      float phase = hash3(cell + 31.0) * 6.2832;
      // STAR TWINKLE knob (def 1.0 = as-shipped): scales the ±0.20 oscillation
      // amplitude around the 0.80 base (0 = rock-steady stars).
      float twinkle = 0.80 + 0.20 * uStarTwinkle * sin(uTime * 1.4 + phase);
      float giant = step(0.9995, h);                     // rare brighter star
      // STAR SIZE knob (def 1.0 = as-shipped): scales each star's disc radius.
      float srad = mix(0.0016, 0.0028, giant) * uStarSize;
      float star = smoothstep(srad, srad * 0.35, d)
                 * min(0.88, bright * twinkle * (1.0 + giant * 0.6));
      c += vec3(star) * uStarBright;   // STAR BRIGHTNESS knob
    }
  }

  // --- Moon disc + halo (night tracks) ---
  if (uMoon > 0.0 && uStars > 0.5) {
    // Fixed moon direction: high in the sky, to the right of the sun's compass direction.
    // Using a stable world-space direction so it doesn't follow the camera.
    vec3 moonDir = normalize(vec3(0.42, 0.72, 0.55));
    float md = dot(dir, moonDir);
    float moonPerp = length(dir - moonDir * max(md, 0.0));
    // Moon disc: crisp soft edge. MOON DISC SIZE knob (def 1.0 = as-shipped)
    // scales the disc's angular radius via the smoothstep edges.
    float moonDisc = smoothstep(0.025 * uMoonDiscSize, 0.010 * uMoonDiscSize, moonPerp) * uMoon;
    // Moon halo: broad soft glow. MOON HALO SPREAD knob (def 1.0 = as-shipped)
    // scales the halo strength (0.28) and widens its falloff (140 → 140/size).
    float moonHalo = exp(-moonPerp * moonPerp * (140.0 / max(uMoonHalo, 0.001))) * 0.28 * uMoonHalo * uMoon;
    // Moon colour: cool blue-white
    vec3 moonCol = vec3(0.82, 0.88, 1.00);
    // The halo should only appear above the horizon and not wash out too much.
    if (up > 0.0 && md > 0.0) {
      c += moonCol * (moonDisc * 1.10 + moonHalo);
    }
  }

  // CITY SKYGLOW: light pollution from the lit circuit/city — a warm dome that
  // hugs the horizon and fades fast with elevation, with a hint of cloud pickup
  // (clouds over a city glow from below). Zero when uCityGlow is black.
  if (uCityGlow.r + uCityGlow.g + uCityGlow.b > 0.001) {
    // CITY GLOW REACH knob (def 1.0 = as-shipped): scales the horizon-hug exponent
    // (lower = the glow climbs higher up the sky, higher = it hugs the horizon).
    float horiz = pow(clamp(1.0 - max(dir.y, 0.0) * 2.4, 0.0, 1.0), 3.0 * uCityGlowReach);
    c += uCityGlow * horiz;
    // Cloud pickup: the cloud deck over a lit city glows from BELOW — thick
    // bellies catch the most uplight, and the effect eases off toward the
    // zenith (the dome's energy is strongest near the horizon). Kept subtle
    // (×0.45) so heavy cover reads as a warm overcast lid, not banding.
    float pickup = cityCov * (0.35 + 0.65 * cityThick)
                 * clamp(1.0 - dir.y * 1.6, 0.0, 1.0);
    c += uCityGlow * pickup * 0.45;
  }

  outColor = vec4(c, 1.0);
}`;

  const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 aPos; // unit quad, -0.5..0.5 in x/z
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform vec2 uSize; // w, l in meters
out vec2 vUV;
void main() {
  vUV = aPos * 2.0; // -1..1
  vec4 wp = uModel * vec4(aPos.x * uSize.x, 0.02, aPos.y * uSize.y, 1.0);
  gl_Position = uViewProj * wp;
}`;

  const SHADOW_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 outColor;
void main() {
  float r = length(vUV);
  float a = 0.45 * (1.0 - smoothstep(0.25, 1.0, r));
  outColor = vec4(0.0, 0.0, 0.0, a);
}`;

  // Flat rectangular skid-mark stamp (x=lateral, y=along-travel in normalised -1..1 space)
  const MARK_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 outColor;
void main() {
  float a = 0.38 * smoothstep(1.0, 0.4, abs(vUV.x)) * smoothstep(1.0, 0.3, abs(vUV.y));
  outColor = vec4(0.0, 0.0, 0.0, a);
}`;

  // Batched skid marks: all live marks baked into one world-space vertex buffer
  // (pos + uv per vertex) so the whole trail draws in ONE call instead of up to
  // 120 per-mark drawElements. Same MARK_FS, so the look is identical.
  const MARK_BATCH_VS = `#version 300 es
layout(location=0) in vec3 aPos;   // world position (metres)
layout(location=1) in vec2 aUV;    // -1..1 across the stamp
uniform mat4 uViewProj;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

  // ---- Textured car decals (team logos / sponsors) ----
  // Flat UV'd quads sitting slightly proud of the bodywork, sampling a canvas-
  // baked RGBA atlas (transparent where there's no mark). Lit by sun + hemisphere
  // ambient so a decal sits INTO the paint's shading instead of floating flat;
  // uDecalGlow lifts bright marks so white sponsors read at night.
  const DECAL_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uViewProj;
out vec2 vUV;
out vec3 vNrm;
void main() {
  vUV = aUV;
  vNrm = mat3(uModel) * aNrm;
  gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}`;
  const DECAL_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec3 vNrm;
uniform sampler2D uTex;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform float uGlow;
out vec4 outColor;
void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.02) discard;
  vec3 N = normalize(vNrm);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
  vec3 lit = t.rgb * (amb + uSunColor * ndl) + t.rgb * uGlow;
  outColor = vec4(lit, t.a);
}`;

  // ---- Lamp lens glare (round veiling halo at each lamp head) ----
  // A camera-facing quad per lamp, drawn ADDITIVELY into the HDR scene before
  // bloom. Purely RADIAL: a hot core + a soft round veil, like real lens glare.
  // (The old version was a downward cone wedge meant to fake a beam — seen from
  // below/off-axis it projected as a bright diagonal dash hanging in the sky,
  // one of the "rays from the sky". Beams in the air are the volumetric godray
  // pass's job now; this billboard is only the glare around the source itself.)
  const GLOW_VS = `#version 300 es
layout(location=0) in vec2 aCorner;   // x in {-1,+1}, y in {0,1}
layout(location=1) in vec3 aCenter;   // lamp head world position
layout(location=2) in vec3 aColor;    // HDR lamp colour
layout(location=3) in float aRadius;  // halo radius (m)
uniform mat4 uViewProj;
uniform vec3 uEye;
out vec2 vUV;
out vec3 vColor;
void main() {
  vec3 fwd = normalize(uEye - aCenter);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd) + vec3(1e-4, 0.0, 0.0));
  vec3 upv = cross(fwd, right);
  vec2 c = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);   // corner buffer is x±1, y 0..1
  vec3 wp = aCenter + (right * c.x + upv * c.y) * aRadius;
  vUV = c;
  vColor = aColor;
  gl_Position = uViewProj * vec4(wp, 1.0);
}`;

  const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vUV;        // -1..1 across the halo quad
in vec3 vColor;
uniform float uStr;
out vec4 outColor;
void main() {
  float r2 = dot(vUV, vUV);
  float core = exp(-r2 * 28.0);   // hot centre right at the lens
  float veil = exp(-r2 * 5.0);    // broad soft glare veil (≈0 by the quad edge)
  float a = (core * 0.75 + veil * 0.28) * uStr;
  outColor = vec4(vColor * a, 1.0);   // additive (blendFunc ONE, ONE)
}`;

  // ---- Transient FX particles (tyre smoke / sparks / kickup / rain spray) ----
  // Camera-facing soft billboards, batched by js/game/particles.js into one
  // interleaved buffer per blend group. uAdditive switches the output packing:
  // 0 = classic alpha transparency (smoke/dust/spray), 1 = premultiplied energy
  // for the ONE/ONE spark group (HDR tints feed bloom).
  const PARTICLE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;   // quad corner in {-1,+1}²
layout(location=1) in vec3 aCenter;   // particle world position
layout(location=2) in vec3 aColor;    // tint (HDR allowed for the additive group)
layout(location=3) in float aSize;    // half-size (m)
layout(location=4) in float aAlpha;   // per-particle opacity
uniform mat4 uViewProj;
uniform vec3 uEye;
out vec2 vUV;
out vec3 vColor;
out float vAlpha;
void main() {
  vec3 fwd = normalize(uEye - aCenter);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd) + vec3(1e-4, 0.0, 0.0));
  vec3 upv = cross(fwd, right);
  vec3 wp = aCenter + (right * aCorner.x + upv * aCorner.y) * aSize;
  vUV = aCorner;
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = uViewProj * vec4(wp, 1.0);
}`;

  const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec2 vUV;        // -1..1 across the quad
in vec3 vColor;
in float vAlpha;
uniform float uAdditive;
out vec4 outColor;
void main() {
  float r2 = dot(vUV, vUV);
  float fall = max(1.0 - r2, 0.0);
  fall *= fall;                       // smooth soft-disc falloff, zero at the rim
  float a = vAlpha * fall;
  outColor = mix(vec4(vColor, a), vec4(vColor * a, 1.0), uAdditive);
}`;

  // ---- Post-processing (HDR scene target -> bloom -> tonemap + vignette) ----
  // Fullscreen triangle via gl_VertexID; vUV in 0..1.
  const POST_VS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  // Bright-pass: keep only the portion of each pixel above the threshold (the
  // sun, floodlights, specular hotspots, bright markings) for the bloom blur.
  const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform float uThreshold;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float l = max(max(c.r, c.g), c.b);
  float k = max(0.0, l - uThreshold) / max(l, 1e-4);
  outColor = vec4(c * k, 1.0);
}`;

  // Separable 5-tap gaussian (uDir = texelSize * axis).
  const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 outColor;
void main() {
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  vec3 s = texture(uTex, vUV).rgb * 0.2270270270;
  s += texture(uTex, vUV + o1).rgb * 0.3162162162;
  s += texture(uTex, vUV - o1).rgb * 0.3162162162;
  s += texture(uTex, vUV + o2).rgb * 0.0702702703;
  s += texture(uTex, vUV - o2).rgb * 0.0702702703;
  outColor = vec4(s, 1.0);
}`;

  // Mip-chain bloom downsample: 13-tap filter (Jimenez, SIGGRAPH 2014 "Next
  // Generation Post Processing in Call of Duty") — a wide, stable kernel that
  // avoids the pulsing/shimmer a plain box chain shows on small bright sources
  // (floodlights at distance, specular glints). uTexel = 1/source size.
  const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 outColor;
void main() {
  vec2 t = uTexel;
  vec3 a = texture(uTex, vUV + t * vec2(-2.0,  2.0)).rgb;
  vec3 b = texture(uTex, vUV + t * vec2( 0.0,  2.0)).rgb;
  vec3 c = texture(uTex, vUV + t * vec2( 2.0,  2.0)).rgb;
  vec3 d = texture(uTex, vUV + t * vec2(-2.0,  0.0)).rgb;
  vec3 e = texture(uTex, vUV).rgb;
  vec3 f = texture(uTex, vUV + t * vec2( 2.0,  0.0)).rgb;
  vec3 g = texture(uTex, vUV + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture(uTex, vUV + t * vec2( 0.0, -2.0)).rgb;
  vec3 i = texture(uTex, vUV + t * vec2( 2.0, -2.0)).rgb;
  vec3 j = texture(uTex, vUV + t * vec2(-1.0,  1.0)).rgb;
  vec3 k = texture(uTex, vUV + t * vec2( 1.0,  1.0)).rgb;
  vec3 l = texture(uTex, vUV + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture(uTex, vUV + t * vec2( 1.0, -1.0)).rgb;
  vec3 s = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625
         + (j + k + l + m) * 0.125;
  outColor = vec4(s, 1.0);
}`;

  // Mip-chain bloom upsample: 9-tap tent filter, drawn ADDITIVELY (ONE, ONE) into
  // the next-larger level so every octave of blur accumulates — a wide, smooth,
  // banding-free halo instead of the old single-octave gaussian's tight ring.
  const UP_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uSpread;   // BLOOM SPREAD: scales the tent-tap radius (def 1.0)
out vec4 outColor;
void main() {
  vec2 t = uTexel * uSpread;
  vec3 s = texture(uTex, vUV + t * vec2(-1.0,  1.0)).rgb
         + texture(uTex, vUV + t * vec2( 1.0,  1.0)).rgb
         + texture(uTex, vUV + t * vec2(-1.0, -1.0)).rgb
         + texture(uTex, vUV + t * vec2( 1.0, -1.0)).rgb
         + (texture(uTex, vUV + t * vec2( 0.0,  1.0)).rgb
          + texture(uTex, vUV + t * vec2( 0.0, -1.0)).rgb
          + texture(uTex, vUV + t * vec2(-1.0,  0.0)).rgb
          + texture(uTex, vUV + t * vec2( 1.0,  0.0)).rgb) * 2.0
         + texture(uTex, vUV).rgb * 4.0;
  outColor = vec4(s / 16.0, 1.0);
}`;

  // SSAO: view-space horizon-style ambient occlusion from the depth texture.
  // Reconstructs view position (via uInvProj) and a normal (from depth
  // derivatives), then counts neighbour samples that rise above the surface
  // tangent plane — so flat ground (the road at a grazing angle) is NOT falsely
  // darkened, only real creases/contacts (car-on-tarmac, barrier feet, kerbs).
  const SSAO_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uDepth;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform vec3 uSunVS;     // sun direction in view space
uniform vec2 uTexel;
uniform float uStrength;
uniform float uContact;  // contact-shadow strength (0 = off)
uniform float uRadius;   // AO world-space sample reach (def 0.6)
out vec4 outColor;
const float NEARP = 0.1, FARP = 900.0;
vec3 viewPos(vec2 uv) {
  float d = texture(uDepth, uv).r;
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}
const vec2 K[12] = vec2[12](
  vec2(0.0,1.0), vec2(0.5,0.866), vec2(0.866,0.5),
  vec2(1.0,0.0), vec2(0.866,-0.5), vec2(0.5,-0.866),
  vec2(0.0,-1.0), vec2(-0.5,-0.866), vec2(-0.866,-0.5),
  vec2(-1.0,0.0), vec2(-0.866,0.5), vec2(-0.5,0.866));
void main() {
  float d = texture(uDepth, vUV).r;
  if (d >= 0.99999) { outColor = vec4(1.0); return; }   // sky
  vec3 P = viewPos(vUV);
  // Guarded: at depth silhouettes the derivatives can be parallel/zero and
  // normalize(0) is NaN — a speckled AO pixel. Fall back to eye-facing.
  vec3 crN = cross(dFdx(P), dFdy(P));
  float crL = length(crN);
  vec3 N = crL > 1e-6 ? crN / crL : vec3(0.0, 0.0, 1.0);
  // Screen-space sample radius shrinks with distance so the world radius (~0.6 m)
  // stays roughly constant; clamp so near/far stay sane.
  float radius = uRadius;
  float scr = clamp(radius / max(-P.z, 1.0) * 0.9, 0.004, 0.05);
  // Per-pixel rotation to turn banding into noise.
  float a = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
  float ca = cos(a), sa = sin(a);
  float occ = 0.0;
  for (int i = 0; i < 8; i++) {   // 12→8 taps (half-res + blurred)
    vec2 k = vec2(K[i].x * ca - K[i].y * sa, K[i].x * sa + K[i].y * ca);
    vec3 S = viewPos(clamp(vUV + k * scr, vec2(0.001), vec2(0.999)));
    vec3 V = S - P;
    float len = length(V);
    // Occluder must rise above the tangent plane (dot>bias) and be within radius.
    float ndv = max(dot(N, V / max(len, 1e-4)) - 0.10, 0.0);
    float range = smoothstep(radius, radius * 0.4, len);
    occ += ndv * range;
  }
  float ao = 1.0 - clamp(occ / 8.0 * 2.4, 0.0, 1.0) * uStrength;

  // Contact shadows: a short ray-march toward the sun in view space, sampling the
  // depth buffer. If a nearby surface blocks the sun within a small distance, the
  // pixel is in contact shadow (grounds the car/objects where the sun map's texel
  // footprint is too coarse). Folded into AO so the composite multiply applies it.
  if (uContact > 0.0 && uSunVS.z < 0.05) {     // sun at/in front of the camera plane
    float sh = 1.0;
    for (int i = 1; i <= 5; i++) {   // contact-shadow march 8→5
      vec3 q = P + uSunVS * (0.04 * float(i));   // up to ~0.32 m toward the sun
      vec4 cp = uProj * vec4(q, 1.0);
      vec2 quv = cp.xy / cp.w * 0.5 + 0.5;
      if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) break;
      vec3 B = viewPos(quv);                     // blocker view position
      float dz = B.z - q.z;                       // >0: surface is in front of the ray
      // Reject the receiver's OWN near-coplanar surface as a false occluder. On a
      // flat road at a grazing angle the point sampled ahead is almost coplanar
      // with this pixel, so the raw depth test (dz in 0.015..0.5) fires on the
      // road itself — and being screen-space it SWIMS across the tarmac as the
      // camera moves ("wavy moving shadows that vanish when contact shadow is
      // off"). A genuine grounding occluder (wheel, barrier foot, kerb) rises
      // clearly above the receiver's tangent plane; the coplanar road does not.
      // Gate on that height so real contacts still darken but the road can't
      // self-shadow. Bias scales with distance so a distant road pixel (whose
      // whole ~0.3 m march projects into a pixel or two) isn't over-rejected.
      float above = dot(N, B - P);
      float aboveBias = 0.05 + 0.01 * max(-P.z - 6.0, 0.0);
      if (dz > 0.015 && dz < 0.5 && above > aboveBias) { sh = 1.0 - uContact; break; }
    }
    // Smoothly fade the contact term as the sun crosses the camera plane so a
    // chase-cam yaw doesn't flip the whole grounding shadow off in one frame (was
    // a hard uSunVS.z < 0 cutoff — a visible pop). Behind the plane the march
    // points away from view, so this fades to a no-op there (no spurious shadow).
    float front = clamp(-uSunVS.z * 6.0, 0.0, 1.0);
    ao *= mix(1.0, sh, front);
  }
  outColor = vec4(vec3(ao), 1.0);
}`;

  // Volumetric sun shafts (world-space): for each pixel, march the ray from the
  // camera toward the scene point and, at each step, test the SUN SHADOW MAP — lit
  // steps accumulate in-scattered sunlight, shadowed steps don't. The shafts are
  // therefore occluded by REAL geometry (grandstands, trees, cars), unlike a flat
  // screen-space radial blur. Forward Mie phase brightens them toward the sun.
  // Half-res; the result is added to the scene before tonemap so it blooms.
  const GODRAY_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec2 vUV;
uniform sampler2D uDepth;
uniform sampler2DShadow uShadowMap;
uniform mat4 uInvVP;
uniform mat4 uLightVP;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStr;
uniform float uTime;
uniform float uCloudCover;
uniform float uCloudSpeed;  // cloud drift-rate multiplier (matches SKY/LIT; 0 = frozen)
#define GR_MAX_LIGHTS 12
uniform int uNumLights;
uniform vec3 uLightPos[GR_MAX_LIGHTS];
uniform vec3 uLightCol[GR_MAX_LIGHTS];
uniform float uLightRad[GR_MAX_LIGHTS];
uniform vec3 uLightDir[GR_MAX_LIGHTS];
uniform vec2 uLightCone[GR_MAX_LIGHTS];   // (cosInner, cosOuter)
uniform float uLightVolW[GR_MAX_LIGHTS];  // per-lamp volumetric weight (beam character)
uniform float uMist;       // haze density gate for in-scatter (0 = none)
uniform float uLampStr;    // night lamp-volumetric strength (0 = off, e.g. day)
uniform float uHgAniso;    // god-ray forward-scatter anisotropy g (def 0.60)
uniform float uHgFloor;    // god-ray isotropic scatter floor (def 0.020)
// Nearest-floodlight spot shadow map (same 512² map the lit pass PCF-tests):
// beam steps that the lamp can't see stay dark, so the volumetric shaft is
// carved by cars/walls instead of glowing straight through them. uLampShadowIdx
// is the lamp's slot in THIS pass's nearest-N selection (-1 = no mapped lamp).
uniform sampler2DShadow uLampShadowMap;
uniform mat4 uLampShadowVP;
uniform int uLampShadowIdx;
out vec4 outColor;
vec3 worldPos(vec2 uv, float d) {
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 w = uInvVP * c;
  return w.xyz / w.w;
}
float gHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = gHash(i), b = gHash(i+vec2(1,0)), c = gHash(i+vec2(0,1)), d = gHash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float gCloudFBM(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<3;i++){ s+=a*gNoise(p); p=p*2.03+1.7; a*=0.5; } return s; }  // 4→3 octaves
// Cloud cover at a world point (same model as the lit shader's cloud shadows) so
// the shafts are broken by the SAME clouds that dapple the ground.
float gCloud(vec3 wp){
  if (uCloudCover <= 0.001 || uSunDir.y <= 0.06) return 0.0;
  // Same amplification floor as cloudShadow() in the lit shader (see its
  // comment): near the 0.06 cutoff, dividing by uSunDir.y blows up how fast cp
  // sweeps per metre of march-step height, aliasing under this pass's 16-tap
  // integration — this is the "0.9 made thin stripes" behaviour noted below,
  // now capped instead of only dimmed.
  float t = (360.0 - wp.y) / max(uSunDir.y, 0.15);
  float cT = uTime * uCloudSpeed;   // lockstep with SKY/LIT cloud drift
  vec2 cp = (wp.xz + uSunDir.xz * t) * 0.0052 + vec2(cT * 0.012, cT * 0.005);
  return smoothstep(0.54 - uCloudCover * 0.40, 0.92, gCloudFBM(cp)) * uCloudCover;
}
void main() {
  float d = texture(uDepth, vUV).r;
  // End point: scene hit, or (for sky) a far point along the view ray.
  vec3 near = worldPos(vUV, 0.0);
  vec3 viewDir = normalize(worldPos(vUV, 0.5) - uEye);
  vec3 endP = (d >= 0.99999) ? uEye + viewDir * 400.0 : worldPos(vUV, d);
  vec3 ro = uEye;
  vec3 rd = endP - ro;
  float dist = length(rd);
  rd /= max(dist, 1e-4);
  float march = min(dist, 260.0);          // cap the march length
  const int N = 16;                        // 32→22→16: jitter + blur hide the coarser step
  float stepLen = march / float(N);
  // Jitter the start with interleaved-gradient noise to hide banding.
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float t = stepLen * ign;
  float accum = 0.0;
  vec3 lampAccum = vec3(0.0);
  // PARTICIPATING MEDIUM: the haze has real structure now —
  //  • DENSITY hugs the ground (exp height falloff): beams live down where the
  //    air is, the upper sky holds no medium → no phantom beams in the sky.
  //  • EXTINCTION (Beer-Lambert transmittance): far scattering fades toward the
  //    camera, so shafts are strongest near you instead of piling up at range.
  float trans = 1.0;
  float groundY = uEye.y - 4.0;               // local ground datum
  for (int i = 0; i < N; i++) {
    float td = t + stepLen * float(i);        // distance marched from the camera
    vec3 p = ro + rd * td;
    trans *= exp(-stepLen * 0.010);
    float hSun  = exp(-max(p.y - groundY, 0.0) * 0.03);   // sun shafts reach higher
    float hLamp = exp(-max(p.y - groundY, 0.0) * 0.07);   // lamp haze hugs the road (taller beams)
    vec4 lc = uLightVP * vec4(p, 1.0);
    vec3 sc = lc.xyz / lc.w * 0.5 + 0.5;
    float lit = 1.0;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0)
      lit = texture(uShadowMap, vec3(sc.xy, sc.z - 0.002));
    lit *= 1.0 - gCloud(p) * 0.62;  // clouds break the shafts into SOFT crepuscular bands (0.9 made thin stripes)
    accum += lit * hSun * trans;
    // Lamp in-scatter: each nearby lamp casts a beam through the ground haze,
    // shaped by its aimed cone + falloff (same math as the lit shader's pools),
    // weighted per lamp type (uLightVolW). Range-limited: beams read near the
    // camera; distant cone-crossings were the source of sky-streak noise.
    if (uLampStr > 0.0 && td < 200.0) {
      for (int li = 0; li < 6; li++) {   // nearest-6 lamps for beams (was 12) — nearest-sorted
        if (li >= uNumLights) break;
        vec3 LP = uLightPos[li] - p;
        float ld = length(LP);
        float rad = uLightRad[li];
        if (ld > rad) continue;
        vec3 Ld = LP / max(ld, 1e-3);
        float s = ld / rad;
        float win = clamp(1.0 - s*s*s*s, 0.0, 1.0);
        float att = win * win / (ld * ld + 1.0);
        float cd = dot(-Ld, uLightDir[li]);
        float spot = smoothstep(uLightCone[li].y, uLightCone[li].x, cd);
        float cosL = max(dot(rd, Ld), 0.0);                          // forward scatter
        float hgL = (1.0 - 0.36) / pow(1.36 - 1.2 * cosL, 1.5);      // HG g=0.6
        // Shadowed shaft: test this march step against the mapped lamp's depth
        // map — an occluded step contributes no in-scatter, so the beam shows
        // the silhouette of whatever blocks the lamp (one tap × 16 steps,
        // and only for the single mapped lamp).
        float lampLit = 1.0;
        if (li == uLampShadowIdx) {
          vec4 lq = uLampShadowVP * vec4(p, 1.0);
          if (lq.w > 0.0) {
            vec3 lqs = lq.xyz / lq.w * 0.5 + 0.5;
            if (lqs.x > 0.002 && lqs.x < 0.998 && lqs.y > 0.002 && lqs.y < 0.998 && lqs.z < 1.0)
              lampLit = texture(uLampShadowMap, vec3(lqs.xy, lqs.z - 0.004));
          }
        }
        lampAccum += uLightCol[li] * (att * spot * (0.12 + hgL * 0.14) * lampLit) * uLightVolW[li] * hLamp * trans;
      }
    }
  }
  accum /= float(N);
  lampAccum *= uMist * uLampStr * 2.0 / float(N);
  // Henyey-Greenstein phase (g=0.60 = a wider forward lobe so the shafts read
  // across a broader arc, not only when staring straight at the sun) + a small
  // isotropic floor so lit haze glows everywhere, giving an atmospheric volume.
  float cosT = max(dot(rd, uSunDir), 0.0);
  // GOD-RAY FOCUS knob (def 0.60 = as-shipped); clamped <0.95 to keep the HG
  // denominator well-behaved. GOD-RAY HAZE knob (def 0.020) is the isotropic floor.
  float g = clamp(uHgAniso, 0.0, 0.95);
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
  float phase = hg * 0.16 + uHgFloor;
  outColor = vec4(uSunColor * accum * phase * uStr + lampAccum, 1.0);
}`;

  // Composite: scene + bloom, filmic ACES tone-map, colour grading, sun shafts,
  // lens flare, and a soft vignette.
  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uSSAO;     // ambient occlusion (1 = unoccluded)
uniform vec2 uAOTexel;       // 1/ssaoW, 1/ssaoH (half-res grid) — 0 when AO is off
uniform sampler2D uGodray;   // additive volumetric sun shafts
uniform float uBloomAmt;
uniform float uBloomKnee;    // how much bloom is suppressed over bright pixels (def 0.5)
uniform vec2 uSunUV;
uniform float uFlareStr;
uniform float uExposure;
uniform float uSunShaft;
uniform vec3 uGradeShadow;   // multiplicative tint pulled into shadows  (~1.0 = neutral)
uniform vec3 uGradeHi;       // multiplicative tint pulled into highlights (~1.0 = neutral)
uniform float uGradeStr;     // 0 = neutral grade (backward-compatible)
// Live colour-grade tunables (IMAGE & COLOUR tuner group); defaults reproduce
// the shipped look so a missing tune object is a no-op.
uniform float uContrast;     // midtone-contrast gamma (default 1.12)
uniform float uVibrance;     // selective saturation of dull pixels (default 0.20)
uniform float uSaturation;   // global saturation (1 = unchanged)
uniform float uTint;         // warm(+)/cool(-) white-balance shift, -1..1 (default 0)
uniform float uVignette;     // corner-darkening floor: 1 = none, lower = stronger (default 0.80)
uniform float uVigSoft;      // vignette inner-edge radius / reach (default 0.35)
uniform vec4 uTone0;         // blacks, shadows, midtones, highlights (stops)
uniform vec4 uTone1;         // whites (stops), toe, shoulder, padding
uniform vec3 uLift;          // per-channel lift (0 = neutral)
uniform vec3 uGamma;         // per-channel gamma (1 = neutral)
uniform vec3 uGain;          // per-channel gain (1 = neutral)
uniform sampler2D uDepth;    // scene depth (for wet-road screen-space reflection)
uniform mat4 uInvProj;       // clip → view (reconstruct view position from depth)
uniform mat4 uProj;          // view → clip  (project the marched ray to screen)
uniform vec3 uUpVS;          // world-up in view space (pick out up-facing road)
uniform vec2 uReflTexel;     // 1/width, 1/height
uniform float uReflect;      // wet-road SSR strength (0 = off)
uniform float uSsrOk;        // 1 when depth+proj inputs are bound this frame (0 = probe-less path: skip SSR entirely)
uniform float uCarReflect;   // car-bodywork SSR strength (CAR tuner group; default 0.05)
uniform float uCarGloss;     // car paint gloss (CAR tuner group; default 1.0) — widens the car's SSR streak as it drops
uniform vec3 uReflSkyHi;     // horizon sky-glow (dim reflection fallback on a march miss)
uniform vec3 uReflSkyLo;     // zenith sky-glow
uniform float uSsrThick;     // wet-road SSR depth thickness gate (def 0.20)
uniform float uChromAb;      // chromatic aberration toward frame edges (def 0)
uniform float uGrain;        // per-pixel film grain amount (def 0)
uniform float uGrainTime;    // seconds — animates the grain so it isn't a frozen speckle
uniform float uSharpen;      // unsharp-mask crispness (def 0)
uniform float uBlackLift;    // raised black floor (def 0.005)
uniform float uWhitePoint;   // highlight roll-off knee (def 1.0)
uniform float uAcesA;        // ACES curve num-quad coeff a (def 2.51)
uniform float uAcesB;        // ACES curve num-lin  coeff b (def 0.03)
uniform float uAcesC;        // ACES curve den-quad coeff c (def 2.43)
uniform float uAcesD;        // ACES curve den-lin  coeff d (def 0.59)
uniform float uAcesE;        // ACES curve den-const coeff e (def 0.14, floored >0)
uniform float uSpeedBlur;    // radial speed blur amount, 0 = off
uniform sampler2D uDirt;     // procedural lens-dirt smudge map (generated at init)
uniform float uLensDirt;     // lens-dirt veil strength (IMAGE & COLOUR knob, def 0.15)
uniform vec2 uHazeUV;        // player tailpipe screen UV (heat-haze plume anchor)
uniform float uHazeStr;      // exhaust heat-haze strength (0 = off; boost pushes ~1)
uniform float uHazeTime;     // seconds — scrolls the shimmer upward
uniform float uShaftDecay;   // screen-space sun-shaft per-tap falloff (def 0.82)
uniform float uFlareStreak;  // anamorphic flare horizontal tightness (def 7.0)
uniform float uFlareStreak2; // second thin hot-core flare streak strength (def 0.5)
out vec4 outColor;

// Reconstruct view-space position from the depth buffer at a screen UV.
vec3 ssrViewPos(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;     // window depth → NDC z
  vec4 cp = uInvProj * vec4(uv * 2.0 - 1.0, d, 1.0);
  return cp.xyz / cp.w;
}

// Scene sample carrying the CHROMATIC ABERRATION radial R/B split, so the later
// SPEED BLUR and SHARPEN passes sample in the SAME domain as CA instead of the
// raw scene — otherwise stacking CA with speed blur / sharpen re-mixed
// un-aberrated taps and largely cancelled the fringe. uChromAb = 0 → identity.
vec3 caScene(vec2 uv) {
  if (uChromAb <= 0.001) return texture(uScene, uv).rgb;
  vec2 d = uv - 0.5;
  float a = uChromAb * 0.004 * dot(d, d);
  return vec3(texture(uScene, uv + d * a).r, texture(uScene, uv).g, texture(uScene, uv - d * a).b);
}

// Five overlapping exposure masks in log2 stops around 18% middle grey.
void gradeZoneWeights(float y, out vec4 w0, out float wWhite) {
  float z = log2(max(y, 1e-6) / 0.18);
  w0.x = 1.0 - smoothstep(-5.0, -2.5, z);
  w0.y = smoothstep(-5.0, -2.5, z) * (1.0 - smoothstep(-1.5, 0.0, z));
  w0.z = smoothstep(-2.5, -0.5, z) * (1.0 - smoothstep(0.5, 2.5, z));
  w0.w = smoothstep(0.0, 1.5, z) * (1.0 - smoothstep(3.0, 5.0, z));
  wWhite = smoothstep(2.5, 5.0, z);
}

// Monotonic power curves pivoted at middle grey. Toe affects only luminance
// below the pivot; shoulder affects only luminance above it. RGB is rescaled by
// the luminance ratio, preserving hue and making zero on both controls identity.
vec3 applyToeShoulder(vec3 c, float toe, float shoulder) {
  c = max(c, vec3(0.0));
  float oldY = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  float exponent = oldY < 0.18
    ? exp2(clamp(toe, -1.0, 1.0))
    : exp2(clamp(-shoulder, -1.0, 1.0));
  float newY = 0.18 * pow(oldY / 0.18, exponent);
  return c * (newY / max(oldY, 1e-6));
}

vec3 applyHdrGrade(vec3 c) {
  vec3 lift = uLift;
  vec3 gain = max(uGain, vec3(1e-3));
  vec3 invGamma = 1.0 / max(uGamma, vec3(1e-3));
  c = lift + (gain - lift) * pow(max(c, vec3(0.0)), invGamma);

  float y = max(dot(max(c, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  vec4 w0; float wWhite;
  gradeZoneWeights(y, w0, wWhite);
  float stops = dot(w0, uTone0) + wWhite * uTone1.x;
  c *= exp2(clamp(stops, -4.0, 4.0));

  c = applyToeShoulder(c, uTone1.y, uTone1.z);
  return max(c, vec3(0.0));
}

// ACES fitted filmic tone-map (Krzysztof Narkowicz's approximation — the
// a=2.51,b=0.03,c=2.43,d=0.59,e=0.14 curve; NOT Stephen Hill's fit).
// Preserves colour ratios better than Reinhard; keeps darks dark, rolls off highlights.
// NOTE (display transfer): the composite writes these values straight to an RGBA8
// canvas with no explicit OETF (no pow(1/2.2) / sRGB encode, and the context/FBO
// is not sRGB). The whole look — uContrast, vibrance, black-lift, the baked light
// presets and the pixel-diff baselines — is hand-calibrated on top of that direct
// output. Adding a gamma encode here is therefore a deliberate, all-baselines-
// regenerating change, not a drop-in fix; leave it unless re-grading the game.
// Coefficients come from the TONE CURVE tuner knobs (uAcesA..E). Their defaults
// (2.51/0.03/2.43/0.59/0.14) reproduce the shipped Narkowicz curve byte-for-byte
// — same values, same expression, so the default output is bit-identical. e is
// floored >0 by the slider min so the denominator can't reach 0 for x>=0.
vec3 acesTonemap(vec3 x) {
  float a = uAcesA, b = uAcesB, c = uAcesC, d = uAcesD, e = uAcesE;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Lift-gamma-gain colour grade: very mild S-curve per channel.
// Lifts shadows slightly (warm), crushes a tiny bit of the blue channel in
// mid-tones, and boosts green just a hint — gives an F1 broadcast look.
vec3 colourGrade(vec3 c) {
  // Gain (per-channel linear scale in highlights)
  c *= vec3(1.015, 1.008, 0.992);
  // Soft S-curve: deepen contrast for punch (less washed-out / flat)
  c = c * (1.0 + c * 0.13) / (1.0 + c * 0.20);
  // Midtone-darkening contrast for a more realistic, less-bright look: a gentle
  // gamma deepens the mids/shadows while blacks stay black and the ACES highlight
  // rolloff is preserved — turns the flat "video-game bright" image filmic.
  c = pow(c, vec3(uContrast));
  // Vibrance: pull colour away from its luma. Weighted by how UNsaturated the
  // pixel already is, so pale, washed-out areas (hazy sky, dull grass, gray
  // asphalt) gain the most while vivid neon/kerbs don't over-cook. This is the
  // main fix for the "boring / washed-out" daytime look.
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float sat = mx - mn;
  c = mix(vec3(luma), c, 1.0 + (1.0 - clamp(sat * 1.5, 0.0, 1.0)) * uVibrance);
  // Global saturation (uniform, after vibrance): a plain luma<->colour lerp.
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSaturation);
  // White-balance tint: warm tilts red up / blue down, cool the reverse. Subtle
  // per-unit so the full -1..1 range stays natural rather than a colour cast.
  c *= vec3(1.0 + 0.07 * uTint, 1.0, 1.0 - 0.07 * uTint);
  // Cinematic split-tone: tint shadows one way (cool teal) and highlights the
  // other (warm amber), blended by luma. A staple of the teal-orange film look —
  // gives dusk/dawn richer separation and night a cool moody cast. uGradeStr 0
  // (default) leaves the image untouched, so day stays neutral unless driven.
  float gl2 = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 toneTint = mix(uGradeShadow, uGradeHi, smoothstep(0.0, 0.85, gl2));
  c = mix(c, c * toneTint, uGradeStr);
  // BLACK LIFT: raised (slightly warm) black floor — prevents pure blacks and,
  // pushed up, gives a matte faded-film base. Default 0.005 = the shipped floor.
  c = max(c, vec3(uBlackLift, uBlackLift * 0.8, uBlackLift * 0.6));
  return c;
}

void main() {
  // EXHAUST HEAT HAZE: a small rising shimmer plume anchored just above the
  // player's tailpipe screen position — refracts (UV-warps) the scene fetch
  // inside a soft elliptical region. Gaussian falloff keeps the warp local;
  // the travelling phase (uHazeTime) makes it boil upward frame to frame.
  // Skip the warp on car-paint pixels (SSR alpha tag): from chase cam the
  // plume sits on the rear body, and warping those UVs made the car look
  // wavy whenever throttle was held (exhaustPop > 0). Air/road behind still
  // shimmers.
  vec2 hazeUV = vUV;
  if (uHazeStr > 0.002) {
    float carHere = 1.0 - smoothstep(0.42, 0.55, texture(uScene, vUV).a);
    if (carHere < 0.25) {
      vec2 hd = (vUV - uHazeUV - vec2(0.0, 0.08)) * vec2(3.2, 1.0);   // tall plume, centred above the pipe
      float hm = exp(-dot(hd, hd) * 70.0) * uHazeStr;
      if (hm > 0.003) {
        float hp = vUV.y * 90.0 - uHazeTime * 11.0;
        hazeUV += vec2(sin(hp + vUV.x * 70.0), cos(hp * 0.63)) * (0.0075 * hm);
      }
    }
  }
  vec4 scn = texture(uScene, hazeUV);   // one fetch: .rgb colour + .a SSR car tag
  vec3 c = scn.rgb;
  vec2 caDir = vUV - 0.5;

  // CHROMATIC ABERRATION: split the R/B channels radially — the fringe grows
  // quadratically toward the frame corners (real lens dispersion). 0 = off.
  if (uChromAb > 0.001) {
    float caAmt = uChromAb * 0.004 * dot(caDir, caDir);
    c.r = texture(uScene, hazeUV + caDir * caAmt).r;
    c.b = texture(uScene, hazeUV - caDir * caAmt).b;
  }

  // SPEED BLUR: radial smear from the frame centre outward, growing with the
  // car's velocity (uSpeedBlur folds speed × the tuner amount). 0 = off.
  if (uSpeedBlur > 0.001) {
    vec3 acc = c; float wsum = 1.0;
    for (int i = 1; i <= 4; i++) {
      float t = float(i) / 4.0 * uSpeedBlur * 0.05;
      acc += caScene(vUV - caDir * t);   // caScene carries CA so the two don't cancel
      wsum += 1.0;
    }
    c = acc / wsum;
  }

  // SHARPEN: unsharp mask against a 4-tap neighbour blur (uReflTexel is uploaded
  // every frame). Recovers kerb/wire crispness FXAA softens. 0 = off.
  if (uSharpen > 0.001) {
    vec3 bl = (caScene(vUV + vec2(uReflTexel.x, 0.0))
             + caScene(vUV - vec2(uReflTexel.x, 0.0))
             + caScene(vUV + vec2(0.0, uReflTexel.y))
             + caScene(vUV - vec2(0.0, uReflTexel.y))) * 0.25;
    c += (c - bl) * uSharpen * 0.9;
  }

  // Ambient occlusion: darken creases/contacts before bloom + tonemap so the
  // grounding reads in linear light (under cars, barrier feet, kerbs, building
  // bases). 1.0 = no change, so it's a no-op when SSAO is disabled.
  // The AO buffer is HALF resolution — a plain bilinear fetch averages AO
  // straight across depth discontinuities, so the dark crease AO hugging a near
  // surface bleeds onto the far side of every silhouette (a soft grey halo
  // tracing the car roofline / wing tips against sky and road). Depth-aware
  // 4-tap bilateral upsample instead: the four half-res texels around this
  // pixel keep their bilinear weights, re-weighted by how close each tap's
  // depth is to THIS pixel's full-res depth — taps that belong to the other
  // side of an edge lose their vote, so AO stays pinned to its own surface.
  // uAOTexel is zeroed when AO is off (1×1 white bound): plain fetch, no cost.
  float aoV = 1.0;
  if (uAOTexel.x > 0.0) {
    float aoDc = texture(uDepth, vUV).r;
    vec2 aoG = vUV / uAOTexel - 0.5;
    vec2 aoF = fract(aoG);
    vec2 aoB = (floor(aoG) + 0.5) * uAOTexel;
    float aoSum = 0.0, aoW = 0.0;
    for (int ai = 0; ai < 4; ai++) {
      vec2 auv = aoB + vec2(ai == 1 || ai == 3 ? uAOTexel.x : 0.0,
                            ai >= 2 ? uAOTexel.y : 0.0);
      float bw = (ai == 0 ? (1.0 - aoF.x) * (1.0 - aoF.y)
                : ai == 1 ? aoF.x * (1.0 - aoF.y)
                : ai == 2 ? (1.0 - aoF.x) * aoF.y
                          : aoF.x * aoF.y) + 1e-4;
      // Depth similarity as a ratio weight: silhouettes are big steps in window
      // depth, same-surface slope is tiny, so no linearisation is needed — the
      // scale cancels in the normalisation below.
      float w = bw / (1e-4 + abs(aoDc - texture(uDepth, auv).r) * 30.0);
      aoSum += texture(uSSAO, auv).r * w;
      aoW += w;
    }
    aoV = aoSum / aoW;
  } else {
    aoV = texture(uSSAO, vUV).r;
  }
  c *= aoV;

  // Volumetric sun shafts: additive in-scattered sunlight (0 when disabled).
  c += texture(uGodray, vUV).rgb;

  // ── Wet-road screen-space reflection ────────────────────────────────────────
  // The neon city and lit windows are emissive geometry (not point lights), so
  // the lit shader can't mirror them on wet tarmac. Here we march the reflected
  // view ray through the depth buffer and sample the already-lit scene colour,
  // so the city actually reflects in wet night roads. Gated to wet+dark scenes.
  // Cheap early-out: the sky sits at the far plane and the upper screen is never
  // wet road — skip the costly position/normal reconstruction + march there.
  // Guarded so dry/day frames (uReflect 0, uDepth unbound) never sample depth.
  // Car-paint pixels (alpha tag < 0.5) reflect the world in EVERY session —
  // dry or wet — through the same march as the wet road.
  float carPx = 1.0 - smoothstep(0.42, 0.55, scn.a);
  if (uSsrOk > 0.5 && (uReflect > 0.001 || carPx > 0.3) && texture(uDepth, vUV).r < 0.9999 && vUV.y < 0.62) {
    vec3 P = ssrViewPos(vUV);
    // View-space normal from depth derivatives (cheap; rough at silhouettes, but
    // the road-mask + march thickness test reject the bad cases).
    vec3 dpx = ssrViewPos(vUV + vec2(uReflTexel.x, 0.0)) - P;
    vec3 dpy = ssrViewPos(vUV + vec2(0.0, uReflTexel.y)) - P;
    // Guarded like the SSAO normal: parallel/zero derivatives at silhouettes
    // NaN the normalize and sparkle the far field.
    vec3 crv = cross(dpx, dpy);
    float crvL = length(crv);
    vec3 Nv = crvL > 1e-6 ? crv / crvL : vec3(0.0, 0.0, 1.0);
    if (Nv.z < 0.0) Nv = -Nv;                     // face the eye (view space looks down -z)
    float upDot = dot(Nv, normalize(uUpVS));
    // Up-facing AND not the very-near cockpit (z near 0). P.z is negative ahead.
    // Fade out the far field: depth precision + coarse march steps there breed
    // speckle, and reflections compress to nothing near the horizon anyway — so
    // keep the clean, high-impact foreground and taper the distance out.
    float roadMask = smoothstep(0.40, 0.75, upDot)
                   * smoothstep(-2.5, -7.0, P.z)
                   * (1.0 - smoothstep(-22.0, -55.0, P.z));
    // Car bodywork: up-facing-ish panels, allowed much nearer than the road
    // (the chase camera sits ~5-8 m behind the car).
    float carMask = carPx * smoothstep(0.30, 0.65, upDot)
                  * smoothstep(-1.0, -3.0, P.z)
                  * (1.0 - smoothstep(-22.0, -55.0, P.z));
    // Reject the noisy car silhouette rim: dpx/dpy (already computed above for Nv)
    // spike at edge pixels, which is exactly where the cheap upDot normal is worst.
    float edgeGrad = length(dpx) + length(dpy);
    carMask *= 1.0 - smoothstep(0.35, 0.9, edgeGrad);
    float roadTerm = roadMask * uReflect;
    float carTerm  = carMask  * uCarReflect;
    float ssrGate  = max(roadTerm, carTerm);
    if (ssrGate > 0.001) {
      vec3 V = normalize(-P);
      vec3 R = reflect(-V, Nv);                    // points up toward the city
      // Finer refined march: small fixed steps (dense near/mid) so small/distant
      // emissive lamp heads + neon aren't stepped over (was a coarse 12×1.42 march).
      vec3 pos = P, prevPos = P;
      float stepLen = 0.55;
      float hit = 0.0;
      float hitDist = 0.0;                       // march distance to the hit (contact hardening)
      vec2 hitUV = vec2(0.0);
      bool found = false;
      for (int i = 0; i < 20; i++) {               // 28→20: slightly faster growth
        prevPos = pos;                             // keeps reach at ~30% less fill
        pos += R * stepLen;
        stepLen *= 1.22;                           // gentle growth
        vec4 cp = uProj * vec4(pos, 1.0);
        if (cp.w <= 0.0) break;
        vec2 suv = cp.xy / cp.w * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
        float dz = ssrViewPos(suv).z - pos.z;      // >0 = ray passed behind a surface
        if (dz > uSsrThick && dz < 5.0) {          // SSR THICKNESS gate (reject far sky)
          vec3 a = prevPos, b = pos;               // binary-search refine → crisp hit
          for (int j = 0; j < 4; j++) {
            vec3 mid = (a + b) * 0.5;
            vec4 mc = uProj * vec4(mid, 1.0);
            vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
            if (ssrViewPos(muv).z - mid.z > 0.20) b = mid; else a = mid;
          }
          vec4 fc = uProj * vec4(b, 1.0);
          hitUV = fc.xy / fc.w * 0.5 + 0.5;
          hitDist = length(b - P);
          vec2 e = abs(hitUV - 0.5) * 2.0;
          hit = 1.0 - pow(max(e.x, e.y), 4.0);     // screen-edge fade
          found = true;
          break;
        }
      }
      // Vertical light-smear: real wet roads stretch reflected lights into soft
      // vertical streaks toward the viewer. Extra HDR taps down/up-screen from the
      // hit (Gaussian, wetness+grazing-scaled) bloom into the streak naturally.
      vec3 hitCol = vec3(0.0);
      if (found) {
        // Car reflections get their own blur character (gloss-driven) instead of
        // inheriting the road's wetness-driven streak spread.
        float carSoft = clamp((1.4 - uCarGloss) * 0.5, 0.0, 1.0);
        float streak = (carTerm > roadTerm)
          ? uCarReflect * (0.006 + 0.030 * carSoft)
          : uReflect * (0.010 + 0.022 * clamp((0.62 - vUV.y) / 0.62, 0.0, 1.0));
        // CONTACT HARDENING: real rough reflections blur with distance from the
        // reflector — the reflection of an object touching the wet road is
        // near-crisp, a distant tower smears. Scale the streak by the march's
        // actual hit distance: sharp at contact (x0.3), softer far out (x1.6).
        streak *= mix(0.3, 1.6, clamp(hitDist / 25.0, 0.0, 1.0));
        float w0 = 0.30, w1 = 0.24, w2 = 0.15, w3 = 0.08, w4 = 0.04;
        hitCol  = texture(uScene, hitUV).rgb * w0;
        hitCol += texture(uScene, hitUV + vec2(0.0, -streak * 0.5)).rgb * w1;
        hitCol += texture(uScene, hitUV + vec2(0.0, -streak * 1.0)).rgb * w2;
        hitCol += texture(uScene, hitUV + vec2(0.0, -streak * 1.6)).rgb * w3;
        hitCol += texture(uScene, hitUV + vec2(0.0, -streak * 2.3)).rgb * w4;
        hitCol += texture(uScene, hitUV + vec2(0.0,  streak * 0.5)).rgb * w1;
        hitCol += texture(uScene, hitUV + vec2(0.0,  streak * 1.0)).rgb * w2;
        hitCol /= (w0 + 2.0 * w1 + 2.0 * w2 + w3 + w4);
      }
      // Miss fallback: reflect the dim night sky-glow, never a black hole.
      // R.y is the reflection's up-ness: grazing rays (R.y→0, far road) should
      // show the HORIZON glow, steep rays (R.y→1, road right under the camera)
      // the ZENITH — matching the lit shader's analytic env mix(horizon,zenith)
      // and physical wet-road reflection. Was mix(zenith,horizon), inverted, so
      // the reflected sky bands ran upside-down vs the road's own paint mirror.
      vec3 skyRefl = mix(uReflSkyHi, uReflSkyLo, clamp(R.y, 0.0, 1.0));
      vec3 reflCol = found ? hitCol : skyRefl;
      // SPECULAR OCCLUSION: the diffuse AO above never touched the reflection
      // terms, so a mirrored wet road / glossy deck inside an occluded crease
      // (under the car, wheel wells, barrier feet) still GLOWED with reflected
      // scene/sky — bright streaks exactly where the surface should be buried.
      // Lagarde-style ao² (specular visibility shrinks faster than diffuse)
      // on the reflected colour keeps open road untouched (ao ≈ 1) while
      // creases keep their darkness through the mirror substitution.
      reflCol *= aoV * aoV;
      // Soft-clip the reflected colour BEFORE it's substituted in: a bright HDR
      // hit (neon signage, a lit window, the sun disc, a floodlight lens) was
      // injected raw, so a handful of very bright reflected pixels could blow
      // the whole mirror surface toward white. Compressing here caps the mirror
      // itself at a sane peak while keeping its colour (unlike a post multiply).
      reflCol = reflCol / (1.0 + reflCol * 0.35);
      bool carDom = carTerm > roadTerm;
      // Car paint: a march MISS means "nothing on-screen mirrors here" — fall
      // through to the lit shader's analytic env mirror instead of substituting
      // the fallback sky over the livery. Up-facing panels miss constantly (the
      // reflected ray exits the screen), so the old full-cover fallback replaced
      // whole decks with flat sky — the "translucent car" read. The road keeps
      // its fallback: a wet road always mirrors SOMETHING, never a black hole.
      float cover  = found ? hit : (carDom ? 0.0 : 1.0);
      // Clean DARKER MIRROR: substitute the reflected scene into a darkened base
      // (a real wet mirror shows the scene it reflects, not a wash added on top).
      // Mirror-like: a high base reflectance (so mid/near tarmac mirrors too, not
      // just the grazing band) with a gentle Fresnel lift toward the horizon.
      float fres = pow(1.0 - max(dot(Nv, V), 0.0), 3.0);
      // Car SSR reflects the on-screen HDR scene — sharp, bright light sources
      // (neon, lit windows, floodlights) that punch through and bloom like the
      // wet road mirrors them. Strong face-on (the env cube owns the off-screen/
      // sky read; SSR owns the crisp on-screen lights + nearby geometry).
      float strength = ssrGate * (carDom ? (0.50 + 0.45 * fres)
                                         : (0.55 + 0.42 * fres));
      // The darker-mirror substitution below is tuned for WET roads. At the
      // faint dry levels (uReflect < 0.2: dry-day 0.07 / dry-night 0.16) fade
      // the substitution quadratically so it reads as a subtle sheen instead
      // of dark towers replacing the sunlit tarmac. Car-paint pixels damp by
      // their OWN driving value (uCarReflect), not the road's — otherwise a
      // dry session silently crushes car reflections regardless of carReflect.
      float gateSrc = carDom ? uCarReflect : uReflect;
      strength *= min(gateSrc / 0.20, 1.0);
      // The whole SSR branch above is gated by a HARD "vUV.y < 0.62" cutoff (a
      // cheap early-out — the upper screen is sky, never wet road/car paint).
      // That boolean gate is a step function: reflected pixels just below the
      // line are full-strength, pixels just above get none, so any noticeable
      // difference between the mirrored colour and the base scene shows as a
      // visible seam slicing across the frame. Fade the last few percent out
      // instead of cutting it off.
      strength *= 1.0 - smoothstep(0.56, 0.62, vUV.y);
      float mixAmt = clamp(strength * cover, 0.0, carDom ? 0.85 : 0.94);   // near-mirror, keeps a hint of pigment/asphalt
      // Near-full darker-mirror substitution — the car mirrors the scene it
      // reflects (bright on-screen lights punch through), keeping a whisper of
      // pigment so the livery still tints the reflection.
      vec3 mirrored = carDom ? c * 0.22 + reflCol * 0.88
                             : c * 0.10 + reflCol * 0.92;
      c = mix(c, mirrored, mixAmt);
    }
  }

  // Exposure multiply before tone-mapping (default 1.0 = no change).
  c *= uExposure;

  // Improved bloom: add with a mild tone-aware mask so it doesn't wash out
  // already-bright pixels (reduce bloom addition proportionally in highlights).
  vec3 bloomSample = texture(uBloom, vUV).rgb;
  // uBloomKnee (BLOOM ON HIGHLIGHTS) scales the highlight suppression: 0 = bloom
  // everything evenly (milky), 1 = strongly hold bloom off blown pixels (crisp).
  float bloomMask = 1.0 - clamp(max(c.r, max(c.g, c.b)) - 0.7, 0.0, 0.3) / 0.3 * uBloomKnee;
  // Scale by uExposure to match the scene: the bright-pass samples the RAW
  // pre-exposure HDR target, but the scene above is already multiplied by
  // uExposure. Without this, a driven exposure (0.86–0.90 at night) dimmed the
  // scene while the halos kept full pre-exposure energy — over-strong bloom.
  c += bloomSample * uBloomAmt * bloomMask * uExposure;

  // LENS DIRT veil: grime on the lens scatters incoming light into a smudgy
  // film. Driven by the blurred bright-pass, so it only appears where the frame
  // actually carries bright energy (sun, floodlights, neon) — a dark scene
  // stays clean. The dirt value is reused by the flare modulation below.
  float dirt = 0.0;
  if (uLensDirt > 0.001) {
    dirt = texture(uDirt, vUV).r;
    c += bloomSample * uExposure * dirt * uLensDirt * 2.2;
  }

  // Sun shafts / god-rays: radial samples from current pixel toward the sun's
  // screen position, reading the bright-pass (bloom[0] after bright-pass step).
  // Additively composited. Gated when uSunShaft > 0 (sun on-screen, above horizon).
  if (uSunShaft > 0.0) {
    vec2 toSun = uSunUV - vUV;
    float dist = length(toSun);
    // Only cast rays when we're not right on top of the sun (avoid div-zero).
    if (dist > 0.005) {
      vec2 step = toSun / dist * min(dist, 0.40) / 8.0;
      vec3 shaft = vec3(0.0);
      // Interleaved-gradient-noise start jitter: hides the 8-tap quantisation
      // (without it, a small bright spot smears into a dotted comet dash).
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 uv = vUV + step * ign;
      float decay = 1.0;
      for (int i = 0; i < 8; i++) {
        uv += step;
        // Clamp so we don't sample outside 0..1 (avoids edge bleed).
        vec2 suv = clamp(uv, vec2(0.0), vec2(1.0));
        // Crepuscular rays emanate from the SUN'S OWN glare. Weight each sample
        // by its proximity to the sun so an isolated bright lamp head or cloud
        // hotspot elsewhere on screen can never smear into a comet streak.
        float sw = 1.0 - clamp(length(suv - uSunUV) / 0.32, 0.0, 1.0);
        shaft += texture(uBloom, suv).rgb * (decay * sw * sw);
        decay *= uShaftDecay;   // SUN-SHAFT REACH knob (def 0.82 = as-shipped)
      }
      shaft /= 8.0;
      // Radial falloff: strongest near the sun, zero at the edge of the screen.
      float radial = 1.0 - clamp(dist * 2.6, 0.0, 1.0);
      c += shaft * uSunShaft * radial * radial * 0.60;
    }
  }

  // Professional HDR grade runs after all linear-light bloom/shaft composition
  // and before the display-referred ACES curve.
  c = applyHdrGrade(c);

  // Filmic tone-map (ACES) + colour grading. WHITE POINT scales the input knee:
  // lower clips highlights sooner (punchy), higher preserves highlight detail.
  c = acesTonemap(c / uWhitePoint);
  c = colourGrade(c);

  // Lens flare: anamorphic streak + ghost circles
  vec3 flare = vec3(0.0);
  // OCCLUSION: the streaks + ghosts below are PURELY procedural (screen position
  // vs sun UV) with no scene sampling, so without this they bleed straight
  // through a grandstand/building/hill the sun sits behind. Scene depth is 1.0
  // (far) on open sky and < 1.0 wherever geometry covers the sun's screen point,
  // so sample it at uSunUV and fade the flare when the sun is hidden. (The
  // god-ray shaft above self-occludes: it samples the dark-behind-geometry
  // bright-pass.) uDepth is bound to the scene depth every frame (SSR inputs).
  float sunVis = smoothstep(0.9990, 0.9999, texture(uDepth, uSunUV).r);
  if (uFlareStr > 0.0 && sunVis > 0.0 && uSunUV.x >= 0.0 && uSunUV.x <= 1.0 &&
      uSunUV.y >= 0.0 && uSunUV.y <= 1.0) {
    // Anamorphic horizontal streak — warm and wide, the iconic "sun bleeding
    // across the frame" golden-hour cue (uFlareStr peaks when the sun is low).
    // The horizontal falloff (was 1.3) barely decayed across the ENTIRE screen
    // width (exp(-1.3) ~ 0.27 a full frame-width away), so any golden-hour
    // driving painted a near-full-width bright band across the whole image,
    // added AFTER tonemap+grade with no further compression — none of the
    // exposure/bloom/reflection dampening upstream touched it. Tightened so
    // the streak stays a contained, elongated highlight near the sun instead
    // of a screen-wide wash.
    float streakY = exp(-abs(vUV.y - uSunUV.y) * 110.0);
    float streakX = exp(-abs(vUV.x - uSunUV.x) * uFlareStreak);   // FLARE STREAK knob (def 7.0)
    flare += vec3(1.0, 0.80, 0.52) * streakY * streakX * 0.75;
    // A second thinner hot core streak (FLARE CORE STREAK knob, def 0.5).
    float streakX2 = exp(-abs(vUV.x - uSunUV.x) * 10.0);
    flare += vec3(1.0, 0.92, 0.78) * exp(-abs(vUV.y - uSunUV.y) * 320.0) * streakX2 * uFlareStreak2;

    // Lens ghost circles along sun-to-center axis
    vec2 toCenter = vec2(0.5) - uSunUV;
    float d0 = length(vUV - (uSunUV + toCenter * 0.5));
    flare += vec3(1.0, 0.88, 0.65) * smoothstep(0.055, 0.020, d0) * 0.35;
    float d1 = length(vUV - (uSunUV + toCenter * 1.3));
    flare += vec3(0.70, 0.60, 1.00) * smoothstep(0.038, 0.012, d1) * 0.25;
    float d2 = length(vUV - (uSunUV + toCenter * 1.8));
    flare += vec3(0.50, 1.00, 0.70) * smoothstep(0.028, 0.008, d2) * 0.18;

    // Soft-clip (was a hard clamp to 1.2 — a flat ceiling still let a wide,
    // near-uniform band sit at 1.2 across the whole streak). Compressing keeps
    // the hot core near the sun bright while taming the wash further out.
    flare *= uFlareStr * sunVis;
    // Lens dirt breaks the clean procedural flare into a blotchy, smudged one —
    // bright spots where grime catches the glare, dimmer in the clean patches.
    if (uLensDirt > 0.001) flare *= mix(1.0, 0.35 + dirt * 2.2, clamp(uLensDirt * 2.0, 0.0, 0.85));
    flare = flare / (1.0 + flare * 0.6);
  }
  c += flare;

  // Vignette — aspect-corrected so the darkening is circular in SCREEN space,
  // not an ellipse. The old length(vUV-0.5) treated one UV unit of width like
  // one of height, so on the wide race viewport (~2.16:1) it over-darkened the
  // top/bottom into horizontal bands. Scale x by aspect (from uReflTexel =
  // 1/width,1/height) then renormalise so the frame CORNER still maps to the
  // same 0.707 radius the tuned thresholds expect (identity at 1:1).
  vec2 q = vUV - 0.5;
  float vAspect = uReflTexel.x > 0.0 ? uReflTexel.y / uReflTexel.x : 1.0;   // width/height
  q.x *= vAspect;
  float vr = length(q) * 0.70710678 / length(vec2(0.5 * vAspect, 0.5));
  // uVigSoft (VIGNETTE REACH) is the inner edge: lower = broad soft gradient
  // reaching toward centre, higher = a thin ring hugging the corners. Kept below
  // the fixed 0.95 outer edge so the smoothstep stays well-ordered.
  float vig = smoothstep(0.95, min(uVigSoft, 0.94), vr);
  c *= mix(uVignette, 1.0, vig);

  // Dither: a triangular-PDF noise of ~1 output LSB, added in the LDR domain to
  // break the 8-bit banding that otherwise stamps visible steps onto smooth sky
  // and fog gradients (and rescues the RGBA8 fallback path). Two hashes → a
  // triangular distribution in [-1,1]; cheap, per-pixel.
  float d0 = fract(sin(dot(vUV, vec2(12.9898, 78.233))) * 43758.5453);
  float d1 = fract(sin(dot(vUV, vec2(39.3468, 11.135))) * 24634.6345);
  c += (d0 + d1 - 1.0) / 255.0;
  // FILM GRAIN: luminance-weighted per-pixel noise (mid-tones grain most, blacks
  // and clipped whites least — where real sensor grain lives). 0 = off.
  if (uGrain > 0.001) {
    // Per-frame animated: without a time term the "grain" is welded to the
    // panel — a frozen dirty-lens speckle, not moving sensor noise. Offset the
    // sample point by a time-varying jitter so each frame re-randomises.
    vec2 gUV = vUV + vec2(fract(uGrainTime * 1.37), fract(uGrainTime * 0.61)) * 3.17;
    float gn = fract(sin(dot(gUV, vec2(93.9898, 47.233))) * 61237.312) - 0.5;
    float gLuma = dot(c, vec3(0.299, 0.587, 0.114));
    c += gn * uGrain * (1.0 - abs(gLuma - 0.5) * 1.4);
  }
  outColor = vec4(c, 1.0);
}`;

  // FXAA (Timothy Lottes, compact). Edge-detect via luma in a 3×3 neighbourhood,
  // then blend along the detected edge — kills the jaggies/shimmer on thin
  // geometry, kerbs, wires and specular highlights that MSAA misses. Runs on the
  // already-tonemapped LDR image, last, straight to the screen.
  const FXAA_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 outColor;
float fxLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 t = uTexel;
  vec3 cM = texture(uTex, vUV).rgb;
  float lM  = fxLuma(cM);
  float lNW = fxLuma(texture(uTex, vUV + vec2(-t.x,-t.y)).rgb);
  float lNE = fxLuma(texture(uTex, vUV + vec2( t.x,-t.y)).rgb);
  float lSW = fxLuma(texture(uTex, vUV + vec2(-t.x, t.y)).rgb);
  float lSE = fxLuma(texture(uTex, vUV + vec2( t.x, t.y)).rgb);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // Flat areas (incl. HUD/text) stay pixel-exact.
  if (lMax - lMin < max(0.04, lMax * 0.125)) { outColor = vec4(cM, 1.0); return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcp, -8.0, 8.0) * t;
  vec3 rA = 0.5 * (texture(uTex, vUV + dir * (-1.0/6.0)).rgb
                 + texture(uTex, vUV + dir * ( 1.0/6.0)).rgb);
  vec3 rB = rA * 0.5 + 0.25 * (texture(uTex, vUV + dir * -0.5).rgb
                             + texture(uTex, vUV + dir *  0.5).rgb);
  float lB = fxLuma(rB);
  outColor = vec4((lB < lMin || lB > lMax) ? rA : rB, 1.0);
}`;

  // Depth-only pass for shadow map — renders world position into depth buffer.
  const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

  const DEPTH_FS = `#version 300 es
void main() {}`;

  // PCSS blocker map: conservative min-of-4 downsample of the sun shadow map
  // (SHADOW_SIZE² -> 512²), one tap at the centre of each quadrant of this dest
  // texel's source footprint. uSrcTexel = 1/SHADOW_SIZE: the old hardcoded
  // 1/512*0.25 offset happened to equal one source texel on the desktop 2048
  // map (identical output) but sampled only a half-texel window on the 1024
  // mobile map — under-sampled blockers, optimistic penumbra, tier-dependent.
  const BLOCKER_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uDepthTex;
uniform vec2 uSrcTexel;
out vec4 o;
void main() {
  vec2 t = uSrcTexel;
  float d0 = texture(uDepthTex, vUV + t * vec2(-1.0, -1.0)).r;
  float d1 = texture(uDepthTex, vUV + t * vec2( 1.0, -1.0)).r;
  float d2 = texture(uDepthTex, vUV + t * vec2(-1.0,  1.0)).r;
  float d3 = texture(uDepthTex, vUV + t * vec2( 1.0,  1.0)).r;
  o = vec4(min(min(d0, d1), min(d2, d3)), 0.0, 0.0, 1.0);
}`;

  return { LIT_VS, LIT_FS, SKY_VS, SKY_FS, SHADOW_VS, SHADOW_FS, MARK_FS, MARK_BATCH_VS, DECAL_VS, DECAL_FS, GLOW_VS, GLOW_FS, PARTICLE_VS, PARTICLE_FS, POST_VS, BRIGHT_FS, BLUR_FS, DOWN_FS, UP_FS, SSAO_FS, GODRAY_FS, COMPOSITE_FS, FXAA_FS, DEPTH_VS, DEPTH_FS, BLOCKER_FS };
})();
