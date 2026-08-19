/* Apex 26 — GLSL sources for the WebGL2 renderer (js/render/glx.js): the LIT program (LIT_VS/LIT_FS) — the scene pass: PBR sun + hemisphere ambient + 48 point lig… */
"use strict";

(function () {
  const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aMat;   // per-vertex material id (0 = FLAT/untextured)
layout(location=4) in vec3 aTrk;    // road only: (arc-length s, signed lateral x, half-width). (0,0,0) elsewhere.
layout(location=5) in vec4 aInst0;
layout(location=6) in vec4 aInst1;
layout(location=7) in vec4 aInst2;
layout(location=8) in vec4 aInst3;
layout(location=9) in vec3 aInstCol;
uniform float uInstanced;   // 0 = use uModel (default), 1 = use the instance columns
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
out vec3 vTrk;        // smooth (NOT flat): the marking SDF needs x/s to vary across the quad
void main() {
  vec3 pos = aPos;
  if (aMat >= 15.0 && aMat < 16.0) {
    float fw = fract(aMat) * 2.5;
    float ph = uTime * 5.5 + aPos.x * 1.9 + aPos.z * 1.9;
    pos += aNrm * ((sin(ph) * 0.085 + sin(ph * 2.17 + 1.3) * 0.045) * fw);
  }
  mat4 M = uInstanced > 0.5 ? mat4(aInst0, aInst1, aInst2, aInst3) : uModel;
  vec4 wp = M * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vObjPos = aPos;                 // object space: paint flake/orange-peel pattern
  vNrm = mat3(M) * aNrm;
  vCol = aCol * aInstCol;
  vMat = aMat;                    // constant across the face (flat) — procedural material key
  vTrk = aTrk;                    // road track-space coords; interpolated across the ribbon
  vDist = length(wp.xyz - uEye);
  gl_Position = uViewProj * wp;
}`;

  const LIT_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vNrm;
in vec3 vCol;
in vec3 vWorldPos;
in vec3 vObjPos;
in float vDist;
flat in float vMat;   // procedural material id (0 = FLAT); textured in applyMaterial()
in vec3 vTrk;         // road: (s, lateral x, half-width) — drives roadMarkings()
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
uniform lowp sampler2DArray uMatAlbedoTex;  // rgb = albedo reflectance, a = roughness
uniform lowp sampler2DArray uMatNormalTex;  // rg = tangent normal xy, b = AO
uniform float uMatTexMix;                   // ships 1.0 = full baked; 0 = pure procedural
uniform float uMatTexScale[17];             // world metres per tile per layer; 0 = layer absent
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
uniform vec3 uShadowCtr;    // unsnapped shadow-box snap anchor (Y = look-target height; fade uses eye XZ + this Y)
uniform highp sampler2DShadow uCarShadowMap;
uniform mat4 uCarLightVP;
uniform float uCarShadowOn;
uniform float uCarBiasScale;
uniform highp sampler2DShadow uLampShadowMap;
uniform mat4 uLampShadowVP;
uniform float uLampShadowOn;
uniform int uLampShadowIdx;
const int MAX_LIGHTS = 48;
uniform int uNumLights;
uniform vec4 uLightA[MAX_LIGHTS]; // xyz pos, w radius
uniform vec4 uLightB[MAX_LIGHTS]; // xyz colour*intensity, w out-of-beam bleed
uniform vec4 uLightC[MAX_LIGHTS]; // xyz beam aim, w cone cosInner
uniform vec4 uLightD[MAX_LIGHTS]; // x cone cosOuter
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
vec3 F_Schlick(float VoH, vec3 f0, float f90) {
  float v = 1.0 - VoH; float v2 = v * v;
  return f0 + (vec3(f90) - f0) * (v2 * v2 * v);
}

${GLXChunks.surfaceNoise}
${GLXChunks.ignoise}

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
  } else if (mid == 16) {  // ASPHALT: fine aggregate only — no macro relief
    return vnoise(uv * 9.0) * 0.34 + vnoise(uv * 26.0) * 0.16;
  }
  return 0.0;
}
// Is this material coursed/planked/panelled (keys off the wall coord (hc, y))
// rather than organic/horizontal (keys off world (x, z))? Shared by the
// procedural bump below and the baked texture sample, so the two can never
// disagree about which way a material's pattern runs — a scan landing rotated
// 90 degrees against the noise it augments would read as a smeared mess.
// NOTE this is a per-MATERIAL classification. applyMaterial()'s "wall" local is
// a different thing: a per-FRAGMENT orientation test (an.y < 0.6).
// (No backticks anywhere below this line — the GLSL is a JS template literal.)
bool matWallLike(int mid) {
  return mid == 1 || mid == 2 || mid == 4 || mid == 5 || mid == 7 || mid == 12 || mid == 13 || mid == 14;
}
bool matTexUV(int mid, out vec2 uv) {
  if (uMatTexMix <= 0.001 || mid <= 0 || mid > 16) { uv = vec2(0.0); return false; }
  float sc = uMatTexScale[mid];
  if (sc <= 0.0) { uv = vec2(0.0); return false; }
  vec3 an = abs(normalize(vNrm));
  uv = (matWallLike(mid) ? vec2(an.x > an.z ? vWorldPos.z : vWorldPos.x, vWorldPos.y)
                         : vWorldPos.xz) / sc;
  return true;
}
void applyMaterialTexNormal(int mid, inout vec3 N, float vd) {
  vec2 uv;
  if (!matTexUV(mid, uv)) return;
  float fade = clamp(1.0 - (vd - 22.0) / 58.0, 0.0, 1.0);   // same reach as the procedural bump
  if (fade <= 0.005) return;
  float fp = max(fwidth(uv.x), fwidth(uv.y));
  float aa = clamp(1.0 - (fp - 0.02) / 0.30, 0.0, 1.0);
  if (aa <= 0.005) return;
  vec2 dxy = (texture(uMatNormalTex, vec3(uv, float(mid))).xy - 0.5) * 2.0;
  vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-5));
  vec3 B = cross(N, T);
  float amt = (mid == 16 ? 0.10 : 0.55) * uMatTexMix * fade * aa;
  N = normalize(N + (T * dxy.x + B * dxy.y) * amt);
}
void applyMaterialNormal(int mid, inout vec3 N, float vd) {
  if (mid == 0 || mid == 3 || mid == 15) return;   // FLAT/GLASS/FLAG: no procedural bump
  float bumpFade = clamp(1.0 - (vd - 22.0) / 58.0, 0.0, 1.0);
  if (bumpFade <= 0.005) return;
  if (matWallLike(mid)) {
    vec3 an = abs(N);
    float hc = an.x > an.z ? vWorldPos.z : vWorldPos.x;
    float y = vWorldPos.y;
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
    float fpG = max(fwidth(p.x), fwidth(p.y));
    float aaG = clamp(1.0 - (fpG - 0.10) / 0.55, 0.0, 1.0);
    if (aaG <= 0.005) return;
    float e = 0.22;
    float h0 = matBumpHeight(mid, p);
    float hx = matBumpHeight(mid, p + vec2(e, 0.0));
    float hz = matBumpHeight(mid, p + vec2(0.0, e));
    // ASPHALT (16) is deliberately the weakest relief in the table.
    float amt = mid == 8 ? 0.16 : mid == 10 ? 0.14 : mid == 16 ? 0.025 : 0.07;
    N = normalize(N + vec3(h0 - hx, 0.0, h0 - hz) * (amt * bumpFade * aaG / e));
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
  } else if (mid == 16) {    // ASPHALT — aggregate speckle + broad laying/wear patches (markings: roadMarkings())
    albedo *= 1.0 + (vnoise(wp.xz * 0.035) - 0.5) * 0.10 * far;
    albedo *= 1.0 + (vnoise(wp.xz * 7.0) - 0.5) * 0.13 * near;
    // Tarmac is rough; the wet path (which runs after this) still overrides it.
    rough = min(1.0, rough + 0.10 * far);
  }
  vec2 tuv;
  if (matTexUV(mid, tuv)) {
    vec4 t = texture(uMatAlbedoTex, vec3(tuv, float(mid)));
    float k = uMatTexMix * far;                 // reuse the existing distance fade
    albedo = mix(albedo, albedo * t.rgb * 2.0, k);
    rough  = clamp(mix(rough, t.a, k * 0.8), 0.04, 1.0);
  }
}
void roadMarkings(inout vec3 albedo, inout float rough) {
  float hw = vTrk.z;
  if (hw <= 0.5) return;                     // not road surface (or no trk attribute)
  float s = vTrk.x, x = vTrk.y;
  const vec3 paint = vec3(0.95, 0.95, 0.97);

  // Lateral filter width. Clamped for the SDF band: at a grazing angle
  // fwidth explodes and an unclamped band would smear the line into a
  // wide grey wash. MIP uses the RAW footprint (WGX roadMarkings) so a
  // saturated 0.30 AA ceiling keeps ~64% paint instead of erasing it.
  float fwX = max(fwidth(x), 1e-4);
  float aaX = min(fwX, 0.30);

  float dEdge = abs(abs(x) - (hw - 0.10));
  float edge = 1.0 - smoothstep(0.10 - aaX, 0.10 + aaX, dEdge);

  float band = 1.0 - smoothstep(0.30 - aaX, 0.30 + aaX, abs(x));
  float ph = fract(s / 7.0);
  float aaS = clamp(fwidth(s) / 7.0, 1e-4, 0.24);
  float dash = 1.0 - smoothstep(0.25 - aaS, 0.25 + aaS, abs(ph - 0.25));

  // As a marking goes sub-pixel, fade its amplitude rather than let a
  // half-covered band strobe — the standard minification response. Soft
  // knee on the RAW footprint (same 0.10/0.55 as WGX).
  float mip = clamp(1.0 - (fwX - 0.10) / 0.55, 0.0, 1.0);
  float m = max(edge, band * dash) * mip;

  albedo = mix(albedo, paint, m);
  rough = mix(rough, 0.55, m);                // paint is smoother than tarmac
}
float cloudFBM(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 2; i++) { s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }  // 4→2 octaves (soft-thresholded, invisible)
  return s;
}
float cloudShadow(vec3 wp) {
  if (uCloudCover <= 0.001 || uSunDir.y <= 0.06) return 0.0;
  float cloudY = 360.0;
  float t = (cloudY - wp.y) / max(uSunDir.y, 0.15);
  float cT = uTime * uCloudSpeed;
  vec2 cp = (wp.xz + uSunDir.xz * t) * 0.0052 + vec2(cT * 0.012, cT * 0.005);
  float c = cloudFBM(cp);
  return smoothstep(0.54 - uCloudCover * 0.40, 0.92, c) * uCloudCover;
}

float sampleShadow(vec3 wpos) {
  if (uShadowStr <= 0.0) return 1.0;
  vec4 lc = uLightVP * vec4(wpos, 1.0);
  vec3 sc = lc.xyz / lc.w * 0.5 + 0.5;
  if (sc.z >= 1.0) return 1.0;
  // Distance fade: dissolve shadows by RECEIVER distance from a YAW-INVARIANT
  // origin — eye XZ, look-target Y (uShadowCtr.y). The BOX stays forward-biased
  // (game.js: camEye + look-dir, texel allocation only). Fading from that same
  // biased point swept the fade front around a 40 m circle on a pinned-eye yaw
  // (docs/PERF-FINDINGS.md 2026-08-15: 58% strength swing at 70 m). Height still
  // comes from the look target so aerial cameras do not erase ground shadows.
  // The box covers 0.875·range from its own anchor; at the default 80 m / 20 m
  // bias, 0.84·range from the eye lands on the 90° box edge (sqrt(70²-20²)≈67).
  float aDist = distance(wpos, vec3(uEye.x, uShadowCtr.y, uEye.z));
  float edgeFade = 1.0 - smoothstep(uShadowRange * 0.62, uShadowRange * 0.84, aDist);
  vec2 ef = smoothstep(0.0, 0.03, sc.xy) * (1.0 - smoothstep(0.97, 1.0, sc.xy));
  edgeFade *= ef.x * ef.y;
  if (edgeFade <= 0.0) return 1.0;
  float t = uShadowTexel;
  float cosTheta = clamp(dot(normalize(vNrm), uSunDir), 0.05, 1.0);
  float slopeBias = t * 1.5 * (sqrt(1.0 - cosTheta * cosTheta) / cosTheta);
  // Shared by the static map below AND the car map at the bottom — the A/B
  // harness (tools/lighting/ab-lighting.mjs shadow.biasClamp) pins this pattern to ONE
  // site, so keep the bias term factored here rather than repeating the clamp.
  float biasTerm = clamp(slopeBias, 0.0005, 0.004) + uShadowBias * 0.5;
  // BIAS MUST TRACK THE BOX, like the kernel below already does. slopeBias is
  // built from t = 1/SHADOW_SIZE, a UV quantity, so it is blind to the world
  // size of a texel — but that sweeps 12.5x across SHADOW DISTANCE (0.0156 m at
  // 16, 0.195 m at 200). Unscaled it was ~25x more offset than needed at 16 and
  // only ~2x at 200, i.e. a fixed 0.393 m of depth push at every setting (about
  // 1.08 m of ground detachment under a 20-degree sun) with the acne margin
  // nearly gone at the far end. Scaling here holds that margin roughly constant.
  // Applied to the STATIC map ONLY: the car map below multiplies the same
  // biasTerm by uCarBiasScale (= max(1, box/80) from game.js), so scaling the
  // shared term would square the correction on cars.
  float z = sc.z - biasTerm * (uShadowRange / 80.0);
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
    float bt = (1.5 / 512.0) * boxK;
    float zb = min(min(texture(uBlockerMap, sc.xy + vec2(-bt,  bt)).r,
                       texture(uBlockerMap, sc.xy + vec2( bt,  bt)).r),
                   min(texture(uBlockerMap, sc.xy + vec2(-bt, -bt)).r,
                       texture(uBlockerMap, sc.xy + vec2( bt, -bt)).r));
    float pen = clamp((z - zb) * uPcssPen, 0.0, 1.0);
    R = mix(1.5, 6.0, pen);
  }
  float ign = ignoise(floor(sc.xy / t));
  float ang = ign * 6.2831853;
  float cr = cos(ang), sr = sin(ang);
  mat2 rot = mat2(cr, -sr, sr, cr) * (t * R * boxK);
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
  if (uCarShadowOn > 0.5) {
    vec4 cc = uCarLightVP * vec4(wpos, 1.0);
    vec3 cs = cc.xyz * 0.5 + 0.5;
    if (cs.x > 0.0 && cs.x < 1.0 && cs.y > 0.0 && cs.y < 1.0 && cs.z < 1.0) {
      float cz = cs.z - biasTerm * uCarBiasScale;
      float ct = (1.0 / 1024.0) * 0.75;   // CAR_SHADOW_SIZE texel, tightened
      float csh = ( texture(uCarShadowMap, vec3(cs.xy + vec2(-ct, -ct), cz))
                  + texture(uCarShadowMap, vec3(cs.xy + vec2( ct, -ct), cz))
                  + texture(uCarShadowMap, vec3(cs.xy + vec2(-ct,  ct), cz))
                  + texture(uCarShadowMap, vec3(cs.xy + vec2( ct,  ct), cz)) ) * 0.25;
      sh = min(sh, csh);
    }
  }
  return max(0.0, mix(1.0, sh, uShadowStr * edgeFade));
}

void main() {
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;
  if (uDetail > 0.001) {
    float mnFade = clamp(1.0 - (vDist - 25.0) / 70.0, 0.0, 1.0) * (1.0 - uWetness * 0.75);
    float mnFp = max(fwidth(vWorldPos.x), fwidth(vWorldPos.z));
    mnFade *= clamp(1.0 - (mnFp - 0.15) / 0.70, 0.0, 1.0);
    if (mnFade > 0.01) {
      vec2 mnp = vWorldPos.xz * 1.7;
      float e = 0.22;
      float h0 = vnoise(mnp) * 0.7 + vnoise(mnp * 3.9) * 0.3;
      float hx = vnoise(mnp + vec2(e, 0.0)) * 0.7 + vnoise(mnp * 3.9 + vec2(e * 3.9, 0.0)) * 0.3;
      float hz = vnoise(mnp + vec2(0.0, e)) * 0.7 + vnoise(mnp * 3.9 + vec2(0.0, e * 3.9)) * 0.3;
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
  int surfaceId = int(vMat + 0.5);
  bool classifiedCar = surfaceId >= 20 && surfaceId <= 27;
  bool paintSurface = surfaceId == 20;
  bool carbonSurface = surfaceId == 21;
  bool rubberSurface = surfaceId == 22;
  bool metalSurface = surfaceId == 23;
  bool glassSurface = surfaceId == 24;
  bool emissiveSurface = surfaceId == 25;
  bool panelSurface = surfaceId == 26;
  bool mirrorSurface = surfaceId == 27;
  float carPaint = classifiedCar ? ((paintSurface || mirrorSurface) ? uCarPaint : 0.0) : uCarPaint;
  float clearcoat = classifiedCar
    ? (paintSurface ? uClearcoat
      : (mirrorSurface ? max(uClearcoat, 0.85)
      : (glassSurface ? uClearcoat * 0.45 : 0.0)))
    : uClearcoat;
  float metalness = classifiedCar
    ? (metalSurface ? max(uMetalness, 0.78)
      : (mirrorSurface ? max(uMetalness, 0.55)
      : (carbonSurface ? 0.08 : (paintSurface ? uMetalness : 0.0))))
    : uMetalness;
  float specular = classifiedCar
    ? (rubberSurface ? 0.18 : ((metalSurface || mirrorSurface) ? 1.0 : (carbonSurface ? 0.48 : (panelSurface ? 0.35 : uSpecular))))
    : uSpecular;
  float emissive = classifiedCar
    ? (emissiveSurface ? max(uEmissive, 1.0) : (paintSurface ? uEmissive : 0.0))
    : uEmissive;
  bool envSurface = (carPaint > 0.001 || glassSurface) && clearcoat > 0.001;
  if (carPaint > 0.001) {
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
      N = normalize(N + (pT * pbx + pB * pby) * (0.22 * carPaint * pFade));
    }
  }
  // SAA source: geometric N + peel, BEFORE wall/MAT bump. WGX cannot take
  // dpdx after the non-uniform matId branch (lifecycle ratchet), so it mixes
  // saaVarGeo with a hoisted peel. Feeding dFdx of the bumped wall N here
  // widened roughness on every brick/concrete/corrugation seam and made
  // WebGL2 walls read duller than WebGPU. Lighting still uses the bumped N.
  vec3 Nsaa = N;
  // Per-material procedural bump: MUST run before V/L/H/NoL below so brick
  // mortar/plank seams/corrugation ridges etc. actually affect the lighting
  // response, not just an albedo tint applied after the fact.
  applyMaterialNormal(int(vMat + 0.5), N, vDist);
  applyMaterialTexNormal(int(vMat + 0.5), N, vDist);   // baked map composes on top (no-op at uMatTexMix 0)
  vec3 V = normalize(uEye - vWorldPos);
  vec3 L = uSunDir;
  vec3 H = normalize(L + V + vec3(1e-5));   // +eps: normalize(0) NaNs when V==-L
  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 1e-4);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);

  vec3 albedo = vCol;
  float patchM = 0.5;
  if (uDetail > 0.0) {
    vec2 wp = vWorldPos.xz;
    float fineFade = clamp(1.0 - (vDist - 35.0) / 90.0, 0.0, 1.0);
    float n = vnoise(wp * 0.35) * 0.60 + vnoise(wp * 2.1) * 0.40 * fineFade;
    albedo *= 1.0 + (n - 0.5) * uDetail;
    patchM = vnoise(wp * 0.055 + 9.1);
    float pm = smoothstep(0.52, 0.72, patchM);
    albedo *= 1.0 - pm * 0.05 * min(uDetail * 4.0, 1.0);
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
  if (carbonSurface) rough = max(rough, 0.56);
  if (rubberSurface) rough = max(rough, 0.90);
  if (metalSurface) rough = min(rough, 0.16);
  if (glassSurface) rough = min(rough, 0.13);
  if (emissiveSurface) rough = max(rough, 0.32);
  if (panelSurface) rough = max(rough, 0.72);
  if (mirrorSurface) rough = min(rough, 0.09);
  if (uDetail > 0.0) rough = clamp(rough + (patchM - 0.5) * 0.16 * min(uDetail * 4.0, 1.0), 0.04, 1.0);
  // Procedural per-material surface texture (brick/glass/metal/wood/… ; 0 = FLAT).
  applyMaterial(int(vMat + 0.5), albedo, rough, vDist);
  // After the material's grain/tint so the paint sits ON the tarmac, not under it.
  roadMarkings(albedo, rough);
  // Specular anti-aliasing: widen roughness where the normal changes fast in
  // screen space (geometry edges, peel on paint). Nsaa is the pre-material
  // snapshot — same mix WGX uses (geo vs peel). Do not dFdx the bumped N.
  vec3 saaDx = dFdx(Nsaa), saaDy = dFdy(Nsaa);
  float saaVar = dot(saaDx, saaDx) + dot(saaDy, saaDy);
  rough = min(1.0, sqrt(rough * rough + saaVar * 0.35));
  float a = rough * rough;
  vec3 f0 = mix(vec3(0.08 * specular), albedo, metalness);

  float wet = 0.0;
  float puddle = 0.0;
  // The specular WATER FILM, as opposed to "this surface is rained on". Every
  // reflection-side use below must key off this, not plain wet — otherwise soaked
  // grass still mirrors the lamps and the sky.
  float wetSheen = 0.0;
  if (uWetness > 0.001) {
    float upFace = smoothstep(0.50, 0.90, N.y);      // flat ground only
    // Water only SHEETS on a sealed surface. The up-facing test alone put the
    // same mirror film on the grass verges and the gravel traps as on the
    // tarmac — flat is flat to a normal test — so a wet lap read as a flooded
    // canal with cyan banks. Porous ground drinks the water instead: it darkens
    // (more than tarmac, since wet soil is markedly darker) but never polishes.
    // This is only expressible now that road/terrain carry material ids.
    int wmid = int(vMat + 0.5);
    float porous = (wmid == 9 || wmid == 6 || wmid == 10 || wmid == 8 || wmid == 11) ? 1.0 : 0.0;
    wet = uWetness * upFace;
    float pn = vnoise(vWorldPos.xz * 0.13 + 4.7);
    puddle = smoothstep(0.48, 0.88, pn) * wet;        // only low spots pool
    // Porous ground cannot hold standing water — no pooling, and no sheen below.
    puddle *= 1.0 - porous;
    // Water absorbs light: wet asphalt reads notably darker, puddles a touch darker
    // (not stark, so they don't read as flat dark blobs). WET ROAD DARKEN knob
    // scales the absorption (uWetDark 1 = shipped 0.42 floor, 0 = no darkening).
    // Soaked grass/gravel darkens harder than tarmac and that is ALL it does.
    // The porous coefficient must be the LARGER of the two: absorb multiplies
    // albedo, so a bigger coefficient means a darker surface. These two were
    // transposed — mix(A,B,porous) returns A for tarmac and B for porous, so
    // tarmac absorbed 58% while soaked grass absorbed only 42%, leaving the
    // verges 38% BRIGHTER than the ribbon they border. That is the mirror image
    // of the "flooded canal with cyan banks" silhouette the porous branch was
    // added to fix, and it contradicts both comments above ("darkens more than
    // tarmac", "darkens harder than tarmac and that is ALL it does"). The 0.42
    // named in the comment above is the ROAD's result (1 - 0.58), which is why
    // the road literal stays put and only the porous one moves.
    // Porous expressed as a FRACTION of the road result, not its own coefficient.
    // An independent 0.72 was darker at the default (0.28 vs 0.42) but clipped to
    // pure black at uWetDark 1.389 while the road still rendered detail until
    // 1.724 — verges going black BEFORE the tarmac is the same silhouette break
    // this branch exists to prevent, just with the polarity flipped. As a
    // fraction the two saturate together and porous is strictly darker across
    // the whole 0..2.4 range, with no clip-order to get wrong.
    float absorbRoad = clamp(1.0 - 0.58 * uWetDark, 0.0, 1.0);
    float absorb = mix(absorbRoad, absorbRoad * 0.66, porous);
    albedo *= mix(1.0, absorb, wet);
    albedo *= mix(1.0, 0.50, puddle);
    wetSheen = wet * (1.0 - porous);
    rough = mix(rough, 0.30, wetSheen);
    rough = mix(rough, 0.06, puddle);
    a = rough * rough;
    f0 = mix(f0, vec3(0.04), wetSheen * 0.6);
  }

  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);

  // Combine the hard shadow map with soft drifting cloud shadows: the sun is
  // dimmed where clouds pass overhead, casting moving dappled light on the track.
  //
  // Gated on NoL, the PER-FRAGMENT twin of the uShadowStr <= 0.0 early-out inside
  // sampleShadow(). That one covers the frames where the whole pass is dark; this
  // covers the fragments that FACE AWAY from the sun on a bright frame — every
  // back-facing wall, every underside, everything on the shadow side of a car —
  // where the result is multiplied by NoL == 0 and thrown away.
  //
  // The local "shadow" has exactly three readers, each provably zero-or-guarded:
  //   972  litNoL = NoL * shadow * uKeyMul                    — NoL == 0
  //   1147 ccCol  = ... * NoLg * shadow * ... * clearcoat     — inside clearcoat > 0.001
  //   1210 envCC += ... * shadow                              — inside envSurface, and
  //        envSurface (805) is (carPaint || glass) && clearcoat > 0.001, a SUBSET
  // so "NoL > 0.0 || clearcoat > 0.001" is exactly sufficient and shadow = 1.0 on
  // the skipped branch is bit-identical: 972 yields 0 either way, and 1147/1210
  // are unreachable. Note 1147 uses NoLg (the GEOMETRIC normal) — that is why the
  // clearcoat term must keep the sample alive rather than riding on NoL alone.
  //
  // What it skips: 4 PCSS blocker taps + 4-8 Poisson taps + 4 car-map taps, the
  // ignoise/sin/cos dither rotation, the slope-bias normalize + sqrt, and
  // cloudShadow's 2 vnoise. The fragments are spatially coherent (whole surfaces
  // face away together), so warp divergence is low. This is the same argument the
  // lamp loop already makes at 1077 — the sun path never got it.
  float shadow = 1.0;
  if (NoL > 0.0 || clearcoat > 0.001) {
    shadow = sampleShadow(vWorldPos) * (1.0 - cloudShadow(vWorldPos) * uCloudShadowDim);
  }
  float litNoL = NoL * shadow * uKeyMul;

  // Base diffuse + ambient (== original lambert shader when uMetalness == 0).
  vec3 color = albedo * (amb + uSunColor * litNoL * (1.0 - metalness));
  if (uShadowTintAmt > 0.001) {
    color *= mix(vec3(1.0), vec3(0.90, 0.96, 1.12), uShadowTintAmt * clamp(1.0 - litNoL, 0.0, 1.0));
  }

  vec3 lampFog = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uNumLights) break;
    vec4 la = uLightA[i], lb = uLightB[i], lc = uLightC[i];
    vec3 LP = la.xyz - vWorldPos;
    float rad = la.w;
    float d2 = dot(LP, LP);
    if (d2 > rad * rad) continue;
    float dist = sqrt(d2);
    vec3 Ld = LP / max(dist, 1e-3);
    // Physical 1/d² falloff, eased to exactly 0 at the radius by (1-(d/r)^4)^2.
    float dn = dist / rad;
    float win = clamp(1.0 - dn * dn * dn * dn, 0.0, 1.0);
    float distC = max(dist, uLampNearClamp);   // LAMP NEAR CLAMP knob (def 4.0)
    float att = (win * win) / (distC * distC + 1.0);
    if (att < 1e-6) continue;
    float cd = dot(-Ld, lc.xyz);
    float beam = smoothstep(uLightD[i].x, lc.w, cd);
    // ILLUMINATION follows the beam (the pool on the road)…
    float spotD = mix(lb.w, 1.0, beam);
    float spotS = mix(mix(0.16, 0.30, wetSheen) * uLampWallSpill, 1.0, beam);   // LAMP WALL SPILL knob (def 1.0 = shipped floor)
    if (uLampFog > 0.0)
    lampFog += lb.xyz * (att * mix(0.35, 1.0, beam));
    float NoLl = max(dot(N, Ld), 0.0);
    float lampSh = 1.0;
    // NoLl GATE, same argument as the GGX block 30 lines below (which already
    // makes it in prose): lampSh has exactly two readers — line 1096, where the
    // term is multiplied by NoLl, and the specular block, which is already
    // inside 'if (NoLl > 0.0)'. A fragment facing AWAY from this lamp therefore
    // paid 4 dependent sampler2DShadow fetches, a mat4 transform, a perspective
    // divide and 5 bounds compares for a result multiplied by zero. This was the
    // last ungated per-fragment texture fetch in LIT_FS. Exactly the sun map's
    // fix at the top of the file ('NoL > 0.0 || clearcoat > 0.001') — the lamp
    // map never got it copied across. No new divergence class: 'NoLl > 0.0' is
    // already branched on in this same loop body.
    if (uLampShadowOn > 0.5 && i == uLampShadowIdx && NoLl > 0.0) {
      vec4 lpc = uLampShadowVP * vec4(vWorldPos, 1.0);
      if (lpc.w > 0.0) {
        vec3 lps = lpc.xyz / lpc.w * 0.5 + 0.5;
        if (lps.x > 0.002 && lps.x < 0.998 && lps.y > 0.002 && lps.y < 0.998 && lps.z < 1.0) {
          float lpz = lps.z - (0.0012 + 0.004 * (1.0 - NoLl));
          float lpt = 1.5 / 512.0;
          lampSh = ( texture(uLampShadowMap, vec3(lps.xy + vec2(-lpt, -lpt), lpz))
                   + texture(uLampShadowMap, vec3(lps.xy + vec2( lpt, -lpt), lpz))
                   + texture(uLampShadowMap, vec3(lps.xy + vec2(-lpt,  lpt), lpz))
                   + texture(uLampShadowMap, vec3(lps.xy + vec2( lpt,  lpt), lpz)) ) * 0.25;
        }
      }
    }
    color += albedo * lb.xyz * (att * spotD * lampSh) * NoLl * (1.0 - metalness) * (1.0 - wetSheen * 0.85);
    if (uBounceK > 0.0) {
      color += albedo * lb.xyz * (att * uBounceK * (0.55 + 0.45 * NoLl)) * (1.0 - metalness);
    }
    if (NoLl > 0.0) {
      vec3 Hl = normalize(Ld + V);
      float NoHl = max(dot(N, Hl), 0.0);
      float VoHl = max(dot(V, Hl), 0.0);
      float Dl = D_GGX(NoHl, a);
      float Vl = V_SmithGGX(NoV, NoLl, a);
      vec3 Fll = F_Schlick(VoHl, f0, clamp(1.0 - rough, 0.0, 1.0));
      vec3 radianceS = lb.xyz * (att * spotS * lampSh);
      vec3 lspec = (Dl * Vl) * Fll * radianceS * NoLl;
      color += lspec / (1.0 + lspec);
      if (clearcoat > 0.001) {
        float Dcc = D_GGX(NoHl, 0.03);
        float Vcc = V_SmithGGX(NoV, NoLl, 0.01);
        float Fcc = F_Schlick(VoHl, vec3(0.05), 1.0).x;
        vec3 ccl = vec3(Dcc * Vcc * Fcc) * radianceS * NoLl * clearcoat;
        color += 2.2 * ccl / (2.2 + ccl);
      }
    }
  }

  // Cook-Torrance specular, soft-clipped so highlights sheen instead of clipping.
  float D = D_GGX(NoH, a);
  float Vis = V_SmithGGX(NoV, NoL, a);
  vec3 F = F_Schlick(VoH, f0, clamp(1.0 - rough, 0.0, 1.0));
  vec3 specCol = (D * Vis) * F * uSunColor * litNoL;
  specCol = specCol / (1.0 + specCol);
  color += specCol;

  // Specular AA for the CLEARCOAT lobes below: the base-coat saaVar above
  // widens only the base roughness — the fixed-a clearcoat streak and the
  // pow-400 env sun disc ran unwidened, so on curved bodywork (where the
  // geometric normal swings fast per pixel) the tight lobes strobed frame to
  // frame. Variance of Ngeo (NOT N — the lacquer shades on the smooth shell,
  // and the flake micro-normal must not blur it). uClearcoat is a uniform, so
  // the branch is uniform control flow and the derivatives stay defined.
  float ccSaaVar = 0.0;
  if (uClearcoat > 0.001) {
    vec3 ccDx = dFdx(Ngeo), ccDy = dFdy(Ngeo);
    ccSaaVar = dot(ccDx, ccDx) + dot(ccDy, ccDy);
  }

  if (clearcoat > 0.001) {
    vec3 Hg = normalize(L + V);
    float NoHg = max(dot(Ngeo, Hg), 0.0);
    float NoVg = max(dot(Ngeo, V), 1e-4);
    float NoLg = max(dot(Ngeo, L), 0.0);
    // Widened by the geometric-normal variance (specular AA, same recipe as
    // the base coat): flat panels keep the crisp 0.035 lobe, tight curvature
    // fattens it just enough to stop the per-pixel strobing. Capped so a hard
    // silhouette edge can't matte the lacquer out entirely.
    float ccA = min(sqrt(0.035 * 0.035 + ccSaaVar * 0.25), 0.30);
    float Dc = D_GGX(NoHg, ccA);
    float Vc = V_SmithGGX(NoVg, NoLg, ccA);
    float Fc = F_Schlick(max(dot(V, Hg), 0.0), vec3(0.05), 1.0).x;
    vec3 ccCol = vec3(Dc * Vc * Fc) * uSunColor * NoLg * shadow * uKeyMul * clearcoat;
    ccCol = 2.6 * ccCol / (2.6 + ccCol);
    color += ccCol;
  }

  if (envSurface) {
    vec3 Rg = reflect(-V, Ngeo);
    float NoVc = max(dot(Ngeo, V), 1e-4);
    float ccFb = 1.0 - NoVc; float ccF = ccFb * ccFb;      // fresnel², rim-concentrated (mul not pow(_,2): pow(0,2) NaNs on mobile)
    float probeLive = clamp(uEnvStr, 0.0, 1.0);
    float baseRefl = mix(0.14, 0.72, probeLive);
    float envW = clamp(clearcoat * (baseRefl + 0.28 * ccF) * (1.0 - rough * 0.25), 0.0, 0.96);
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
    // Sun disc in the mirror: pow-400 ≈ a GGX lobe of alpha ~0.0705 — widen
    // that alpha by the same geometric variance (specular AA) and map back to
    // an exponent, so the disc softens on tight curvature instead of strobing;
    // flat panels keep the exact 400. Floor 32 caps how soft an edge can get.
    float ccDiscA = sqrt(0.0705 * 0.0705 + ccSaaVar * 0.25);
    float ccDiscExp = max(2.0 / (ccDiscA * ccDiscA) - 2.0, 32.0);
    envCC += uSunColor * pow(max(dot(Rg, uSunDir), 1e-4), ccDiscExp) * uCarSunGlint * shadow * uKeyMul;  // CAR SUN GLINT × KEY LIGHT — base floored 1e-4: pow(0.0,exp)=NaN on mobile GPUs (log2(0)=-Inf) → black car pixels at night; SwiftShader returns 0 so it never repro'd headless
    color *= 1.0 - envW * 0.94;                             // absorb: darken the base hard under the mirror so it reads as a mirror, not a milky wash
    vec3 addCC = envCC * envW;
    color += addCC / (1.0 + addCC * 0.35);                 // gentle soft-clip — keeps bright reflections bright
  }

  // Metallic-flake SPARKLE — the signature "metallic paint" glitter. Each ~4.5 mm
  // object-space cell gets a random flake tilt; a flake flashes only when its
  // facet half-aligns with the sun (view-dependent, so the sparkle field shifts
  // as the camera moves). HDR gain so flashes bloom. Distance-faded to nothing so
  // it never aliases at range. Additive white glint — leaves the pigment alone.
  if (carPaint > 0.001 && litNoL > 0.0 && uSparkle > 0.001) {
    float spFade = clamp(1.0 - (vDist - 14.0) / 30.0, 0.0, 1.0) * uSparkle;
    spFade *= smoothstep(0.06, 0.22, max(albedo.r, max(albedo.g, albedo.b)));
    if (spFade > 0.01) {
      vec3 cell = floor(vObjPos * 220.0);
      float h1 = hash21(cell.xy + cell.z * 19.7);
      float h2 = hash21(cell.yz + cell.x * 7.3);
      vec3 nN = length(Ngeo) > 1e-4 ? normalize(Ngeo) : vec3(0.0, 1.0, 0.0);
      vec3 fT = normalize(cross(nN, vec3(0.0, 1.0, 0.001)) + vec3(1e-4));
      vec3 fB = cross(nN, fT);
      vec3 gN = normalize(nN + (fT * (h1 * 2.0 - 1.0) + fB * (h2 * 2.0 - 1.0)) * 0.5);
      float glint = smoothstep(0.990, 1.0, dot(gN, H));
      // CAR SPARKLE knob (def 1.6 = as-shipped) sets the metallic-flake glint gain.
      color += uSunColor * litNoL * glint * uCarSparkle * carPaint * spFade;
    }
  }

  float envBlend = clamp((0.40 - rough) / 0.30, 0.0, 1.0) * specular;
  envBlend = max(envBlend, wetSheen * 0.55);   // smooth analytic wet mirror: this is the COHERENT reflective base the road shows wherever the screen-space SSR march misses (grazing cockpit views miss a lot). Was 0.15 (a whisper, "SSR owns it") — but SSR is patchy at grazing angles, so the analytic sky mirror carries the wet look and SSR just adds crisp on-screen detail on top.
  if (envBlend > 0.001) {
    vec3 R = reflect(-V, N);
    float skyT = pow(max(R.y, 1e-4), 0.40);
    vec3 envColor = mix(uSkyHorizon, uSkyZenith, skyT);
    float envSunAlign = max(dot(R, uSunDir), 0.0);
    envColor = mix(envColor, envColor * uSunColor * 1.15, envSunAlign * envSunAlign * (1.0 - rough));
    envColor += uSunColor * pow(max(envSunAlign, 1e-4), 22.0) * (1.0 - wetSheen) * envBlend * 0.6 * uWindowSunFlash * uKeyMul;   // WINDOW SUN FLASH × KEY LIGHT (def 1.0 = shipped)
    // Roughness dampens the env contribution: rough surfaces see a blurry flat sky.
    float roughDamp = 1.0 - rough * 0.7;
    // Fresnel: reflection is strongest at grazing angles. On wet ground square
    // it so the sky sheen concentrates into the far grazing band instead of
    // flooding the whole low-camera road — near/mid tarmac stays dark and glossy.
    // Also dim the reflected sky a touch when wet (a wet road is never as bright
    // as the sky it mirrors).
    float envFresnel = F_Schlick(max(dot(N, V), 0.0), vec3(0.04), 1.0).x;
    envFresnel = mix(envFresnel, envFresnel * envFresnel, wetSheen * 0.35);   // was full square when wet, which shoved the sky sheen into the far grazing band only and left near/mid road dark (SSR was meant to cover it). Soften the squaring so the smooth analytic reflection spreads across the whole wet road — a coherent mirror everywhere, not a thin far strip.
    vec3 envWet = envColor * (1.0 - wetSheen * 0.45);   // keep ~55% of the sky colour on a wet road (was 10%): the analytic mirror now has to read as a real reflection, since it's the smooth base under the patchy SSR. Soft-clip below still stops it blowing to white.
    // Soft-clip the reflection so a wet road can never blow out to a white sheet
    // (a low dusk/dawn sun + bright twilight sky otherwise push this past 1). A
    // Reinhard shoulder on the brightest channel keeps it bright where the scene
    // is dim and caps it where it would over-saturate.
    vec3 envAdd = envWet * envFresnel * envBlend * roughDamp * (1.0 - metalness);
    float envM = max(max(envAdd.r, envAdd.g), envAdd.b);
    color += envAdd / (1.0 + envM);
  }

  {
    float rf = 1.0 - NoV; float rimFresnel = rf * rf * rf;
    float rimAmt = rimFresnel * (1.0 - rough * 0.85) * 0.18 * uSkyRimGlow;   // SKY RIM GLOW knob (def 1.0 = shipped)
    color += uSkyHorizon * rimAmt;
  }

  {
    float ao = pow(max(N.y * 0.5 + 0.5, 1e-4), 0.35);
    color *= mix(1.0 - 0.12 * uAmbContactDark, 1.0, ao);   // AMBIENT CONTACT DARK knob (def 1.0 = shipped 0.88 floor)
  }

  if (emissive > 0.0) {
    color = mix(color, albedo, emissive);
    float bright = max(albedo.r, max(albedo.g, albedo.b));
    float glow = smoothstep(0.50, 0.95, bright) * emissive;
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

  float heightAtten = uFogHeight > 0.0
    ? exp(-max(vWorldPos.y - uEye.y, 0.0) * uFogHeight)
    : 1.0;
  float fd = vDist * uFogDensity * heightAtten;
  float f = 1.0 - exp(-fd * fd);
  vec3 rd = -V;   // == normalize(vWorldPos - uEye); V is already normalized above
  float sunAmount = max(dot(rd, uSunDir), 0.0);
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
  outColor = vec4(color, carPaint > 0.001 ? 0.35 : uAlpha);
}`;
  window.GLXShaders = Object.assign(window.GLXShaders || {}, { LIT_VS, LIT_FS });
})();
