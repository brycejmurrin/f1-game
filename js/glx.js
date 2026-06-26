/*
 * Apex 26 — WebGL2 renderer.
 * One standard lit shader (hemisphere ambient + lambert sun + exp2 fog),
 * a sky shader (fullscreen triangle via gl_VertexID) and a blob-shadow quad.
 */
"use strict";

const GLX = (function () {
  const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform vec3 uEye;
out vec3 vNrm;
out vec3 vCol;
out vec3 vWorldPos;
out float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNrm = mat3(uModel) * aNrm;
  vCol = aCol;
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
in float vDist;
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
uniform sampler2D uShadowMap;  // raw depth — PCSS reads blocker depth directly
uniform mat4 uLightVP;
uniform float uShadowBias;
uniform float uShadowStr;
uniform float uShadowTexel;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uFogHeight;
// Point lights (floodlights / street lights — mainly for night tracks). Each is
// {position, colour*intensity, radius}; uNumLights of the MAX_LIGHTS slots used.
const int MAX_LIGHTS = 32;
uniform int uNumLights;
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightCol[MAX_LIGHTS];
uniform float uLightRad[MAX_LIGHTS];
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;  // packed world-space normal [0,1] + sentinel w=1

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

// PCSS contact-hardening soft shadows.
// Step 1: blocker search (9 taps) → average blocker depth.
// Step 2: penumbra width ∝ receiver–blocker gap (contact = sharp, far = soft).
// Step 3: PCF with variable kernel (16 taps, wider when far from caster).
const float PCSS_LIGHT = 6.0;   // sun angular size in shadow-texel units
const float PCSS_SCALE = 280.0; // depth-difference → texel count

// Poisson disk for blocker search
const vec2 BLKD[9] = vec2[9](
  vec2(-0.94201624,-0.39906216), vec2( 0.94558609,-0.76890725),
  vec2(-0.09418410,-0.92938870), vec2( 0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432), vec2(-0.81544232,-0.87912464),
  vec2(-0.38277543, 0.27676845), vec2( 0.97484398, 0.75648379),
  vec2( 0.00000000, 0.00000000));
// Wider Poisson disk for PCF
const vec2 PCFD[16] = vec2[16](
  vec2(-0.94201624,-0.39906216), vec2( 0.94558609,-0.76890725),
  vec2(-0.09418410,-0.92938870), vec2( 0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432), vec2(-0.81544232,-0.87912464),
  vec2(-0.38277543, 0.27676845), vec2( 0.97484398, 0.75648379),
  vec2( 0.44323325,-0.97511554), vec2( 0.53742981,-0.47373420),
  vec2(-0.26496911,-0.41893023), vec2( 0.79197514, 0.19090188),
  vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590),
  vec2( 0.19984126, 0.78641367), vec2( 0.14383161,-0.14100790));

float sampleShadow(vec3 wpos) {
  vec4 lc = uLightVP * vec4(wpos, 1.0);
  vec3 sc = lc.xyz / lc.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z >= 1.0) return 1.0;
  float t = uShadowTexel;
  float cosTheta = clamp(dot(normalize(vNrm), uSunDir), 0.0, 1.0);
  float slopeBias = t * 1.5 * tan(acos(max(cosTheta, 0.05)));
  float z = sc.z - clamp(slopeBias, 0.0005, 0.004) - uShadowBias * 0.5;

  // Step 1: blocker search within PCSS_LIGHT-scaled radius
  float searchR = t * PCSS_LIGHT * 5.0;
  float sumZ = 0.0; int cnt = 0;
  for (int i = 0; i < 9; i++) {
    float d = texture(uShadowMap, sc.xy + BLKD[i] * searchR).r;
    if (d < z) { sumZ += d; cnt++; }
  }
  if (cnt == 0) return 1.0;  // no blocker → fully lit

  // Step 2: penumbra width from average blocker depth
  float avgZ = sumZ / float(cnt);
  float penumbraT = clamp((z - avgZ) * PCSS_SCALE, 1.0, 15.0);
  float pcfR = penumbraT * t;

  // Step 3: 16-tap PCF with variable kernel
  float s = 0.0;
  for (int i = 0; i < 16; i++) {
    s += texture(uShadowMap, sc.xy + PCFD[i] * pcfR).r > z ? 1.0 : 0.0;
  }
  return mix(1.0, s * 0.0625, uShadowStr);
}

void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uEye - vWorldPos);
  vec3 L = uSunDir;
  vec3 H = normalize(L + V);
  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 1e-4);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);

  vec3 albedo = vCol;
  // Procedural ground texture: coarse patchiness + fine aggregate grain keyed to
  // world position, so flat asphalt/concrete/grass read as a surface rather than
  // a solid slab. Multiplicative, so it darkens as much as it lightens.
  if (uDetail > 0.0) {
    vec2 wp = vWorldPos.xz;
    // Fade the fine high-frequency octave out with distance: at range it aliases
    // into shimmer (and the texel footprint exceeds its wavelength anyway), so
    // distant ground settles to flat colour while near ground keeps its grain.
    float fineFade = clamp(1.0 - (vDist - 35.0) / 90.0, 0.0, 1.0);
    float n = vnoise(wp * 0.35) * 0.60 + vnoise(wp * 2.1) * 0.40 * fineFade;
    albedo *= 1.0 + (n - 0.5) * uDetail;
    albedo = max(albedo, vec3(0.0));
  }
  float rough = clamp(uRoughness, 0.04, 1.0);
  float a = rough * rough;
  vec3 f0 = mix(vec3(0.08 * uSpecular), albedo, uMetalness);

  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);

  float shadow = sampleShadow(vWorldPos);
  float litNoL = NoL * shadow;

  // Base diffuse + ambient (== original lambert shader when uMetalness == 0).
  vec3 color = albedo * (amb + uSunColor * litNoL * (1.0 - uMetalness));

  // Point lights: floodlights / street lights. Lambert diffuse with smooth
  // inverse-ish falloff to the radius (cheap, no per-light shadows). A small
  // up-bias on the light vector keeps near-flat ground (road) catching the pool
  // even when a mast is almost overhead. Drives the moody night look — the scene
  // ambient can sit dark and these carve out the lit areas.
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uNumLights) break;
    vec3 LP = uLightPos[i] - vWorldPos;
    float dist = length(LP);
    float rad = uLightRad[i];
    if (dist > rad) continue;
    vec3 Ld = LP / max(dist, 1e-3);
    float att = clamp(1.0 - dist / rad, 0.0, 1.0);
    att *= att;                                  // smooth quadratic falloff
    float lnl = max(dot(N, Ld), 0.0);
    color += albedo * uLightCol[i] * lnl * att * (1.0 - uMetalness);
  }

  // Cook-Torrance specular, soft-clipped so highlights sheen instead of clipping.
  float D = D_GGX(NoH, a);
  float Vis = V_SmithGGX(NoV, NoL, a);
  vec3 F = F_Schlick(VoH, f0, clamp(1.0 - rough, 0.0, 1.0));
  vec3 specCol = (D * Vis) * F * uSunColor * litNoL;
  specCol = specCol / (1.0 + specCol);
  color += specCol;

  // Environment reflection: when roughness is very low (wet road / glossy paint),
  // sample the sky gradient in the reflected view direction.
  // Roughness > 0.4 = no visible reflection; < 0.15 = mirror-like sky in road.
  float envBlend = clamp((0.40 - rough) / 0.30, 0.0, 1.0) * uSpecular;
  if (envBlend > 0.001) {
    vec3 R = reflect(-V, N);
    float skyT = pow(max(R.y, 0.0), 0.5);
    // Tint env sample by sky gradient; also pick up a gentle sun-horizon blush
    // when the reflected direction aligns with the sun (warm chrome/paint sheen).
    vec3 envColor = mix(uSkyHorizon, uSkyZenith, skyT);
    float envSunAlign = max(dot(R, uSunDir), 0.0);
    envColor = mix(envColor, envColor * uSunColor * 1.3, envSunAlign * envSunAlign * (1.0 - rough));
    // Roughness dampens the env contribution: rough surfaces see a blurry flat sky.
    float roughDamp = 1.0 - rough * 0.7;
    // Fresnel: reflection is strongest at grazing angles
    float envFresnel = F_Schlick(max(dot(N, V), 0.0), vec3(0.04), 1.0).x;
    color += envColor * envFresnel * envBlend * roughDamp * (1.0 - uMetalness);
  }

  // Sky rim / fresnel: a subtle atmospheric brightening at grazing angles,
  // tinted by the horizon sky colour. Gives edges a little 'air' without
  // making surfaces look wet or plastic. Damped by roughness.
  {
    float rimFresnel = pow(1.0 - NoV, 3.0);
    float rimAmt = rimFresnel * (1.0 - rough * 0.85) * 0.18;
    color += uSkyHorizon * rimAmt;
  }

  // Ambient contact darkening: surfaces facing each other (concave) receive
  // less sky light. Approximate with a bent-normal trick: upward-facing
  // surfaces receive full ambient; downward faces lose it.
  // This is already partially handled by hemisphere ambient (N.y), but a
  // gentle extra crush in the darkest zones adds perceived depth.
  {
    float ao = pow(N.y * 0.5 + 0.5, 0.35);
    color *= mix(0.88, 1.0, ao);
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
    float glow = smoothstep(0.55, 0.95, bright) * uEmissive;
    color += albedo * glow * 0.9;
  }

  // Height-based fog: density falls off exponentially with altitude above eye level.
  // uFogHeight = 0 → uniform (original behaviour); > 0 → pooling fog.
  float heightAtten = uFogHeight > 0.0
    ? exp(-max(vWorldPos.y - uEye.y, 0.0) * uFogHeight)
    : 1.0;
  float fd = vDist * uFogDensity * heightAtten;
  float f = 1.0 - exp(-fd * fd);
  outColor = vec4(mix(color, uFogColor, f), uAlpha);
  outNormal = vec4(N * 0.5 + 0.5, 1.0);  // pack world normal; w=1 flags lit geometry
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
uniform float uTime;
uniform float uMoon;
uniform float uLightning;  // 0..1 lightning flash intensity
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
  for (int i = 0; i < 5; i++) { s += a * vnoise2(p); p *= 2.02; a *= 0.5; }
  return s;
}
void main() {
  vec3 dir = normalize(vDir);
  float up = dir.y;
  float sd = max(dot(dir, uSunDir), 0.0);

  float sunE = clamp(uSunDir.y * 1.4, 0.0, 1.0);
  float overcast = smoothstep(0.5, 1.0, uCloud);

  // --- Sky gradient: richer Rayleigh look with a 3-stop gradient ---
  vec3 c;
  if (up >= 0.0) {
    vec3 zenithO  = mix(uZenith,  vec3(0.55, 0.56, 0.58), overcast * 0.78);
    vec3 horizonO = mix(uHorizon, vec3(0.58, 0.58, 0.60), overcast * 0.62);
    // Shallower exponent = richer blue extends further down from zenith
    float skyLerp = pow(up, 0.28);
    c = mix(horizonO, zenithO, skyLerp);
    // Rayleigh mid-sky peak: slight saturation boost at ~40° elevation (physically accurate)
    float midPeak = smoothstep(0.0, 0.28, up) * smoothstep(0.75, 0.28, up);
    c += uZenith * 0.12 * midPeak * (1.0 - overcast * 0.9);

    // Golden-hour: wider and more saturated warm amber/orange overlay near horizon
    float goldenAmt = (1.0 - smoothstep(0.0, 0.78, sunE))
                    * (1.0 - smoothstep(0.0, 0.42, up))
                    * (1.0 - overcast * 0.88);
    vec3 goldenColor = mix(vec3(0.88, 0.18, 0.02), vec3(0.98, 0.62, 0.14),
                           clamp(sunE * 2.5, 0.0, 1.0));
    c = mix(c, c * 0.35 + goldenColor * 0.65, goldenAmt * 0.90);

    // Twilight band: pink-to-magenta between orange horizon and blue sky at sunset/sunrise
    float twilightBand = (1.0 - smoothstep(0.0, 0.62, sunE))
                       * smoothstep(0.10, 0.38, up)
                       * (1.0 - smoothstep(0.38, 0.68, up))
                       * (1.0 - overcast * 0.80);
    vec3 twilightColor = mix(vec3(0.95, 0.22, 0.38), vec3(0.52, 0.20, 0.78),
                             clamp(sunE * 2.2, 0.0, 1.0));
    c = mix(c, c * 0.40 + twilightColor * 0.60, twilightBand * 0.70);

    // Low-sun horizon band: super-saturated glow just above the horizon
    float lowBand = (1.0 - smoothstep(0.0, 0.62, sunE))
                  * (1.0 - smoothstep(0.0, 0.20, up))
                  * smoothstep(0.01, 0.06, up)
                  * (1.0 - overcast * 0.85);
    vec3 lowColor = mix(vec3(0.92, 0.18, 0.01), vec3(1.0, 0.68, 0.06),
                        clamp(sunE * 3.0, 0.0, 1.0));
    c = mix(c, lowColor, lowBand * 0.70);
  } else {
    float gnd = clamp(-up * 5.0, 0.0, 1.0);
    c = mix(uHorizon * 0.85, vec3(0.035, 0.030, 0.022), gnd * gnd);
  }

  // --- Procedural cloud layer (dramatic contrast + silver lining) ---
  if (uCloud > 0.001 && up > 0.012) {
    vec2 cp = dir.xz / up * 0.42;
    vec2 drift1 = vec2(uTime * 0.0028, uTime * 0.0011);
    vec2 drift2 = vec2(uTime * 0.0017, uTime * 0.0023);
    float evo = uTime * 0.00035;
    vec2 cp1 = cp + drift1;
    vec2 cp2 = cp + drift2;
    float f = fbm(cp1);
    float cov = smoothstep(0.55 - uCloud * 0.4, 0.92, f);
    cov *= smoothstep(0.012, 0.08, up);
    float thick = clamp(fbm(cp2 * 0.55 + vec2(3.1 + evo, 1.7)) * 2.0 - 0.55, 0.0, 1.0);
    float sl = pow(sd, 2.0);
    float sunBright = max(uSunColor.r, max(uSunColor.g, uSunColor.b));
    float effectiveSunBright = mix(sunBright, min(sunBright, 0.55), overcast);
    // Brighter, more vivid lit tops
    vec3 cloudTop = mix(vec3(0.62, 0.66, 0.74), vec3(1.02, 0.99, 0.94), sl);
    cloudTop *= 0.28 + 0.72 * effectiveSunBright;
    cloudTop = mix(cloudTop, cloudTop * uSunColor * 1.65, sl * (1.0 - sunE) * 0.65 * (1.0 - overcast));
    cloudTop = mix(cloudTop, vec3(0.60, 0.61, 0.63), overcast * 0.60);
    // Much darker, more threatening undersides
    vec3 cloudBot = vec3(0.15, 0.16, 0.21) * (0.18 + 0.55 * effectiveSunBright);
    cloudBot = mix(cloudBot, vec3(0.08, 0.08, 0.12), overcast * 0.75);  // near-black storm
    vec3 lit = mix(cloudBot, cloudTop, clamp(0.12 + (1.0 - thick) * 0.82, 0.0, 1.0));
    // Silver lining: bright rim on thin cloud edges when backlit by sun
    float edgeLit = cov * (1.0 - cov) * sl * 5.5 * (1.0 - overcast * 0.8);
    lit += vec3(0.85, 0.88, 0.92) * edgeLit;
    if (uMoon > 0.0) {
      float moonLit = uMoon * cov * (1.0 - thick * 0.6) * 0.22;
      lit = mix(lit, lit + vec3(0.08, 0.10, 0.18), moonLit);
    }
    c = mix(c, lit, cov);
  }

  // --- Mie forward scatter + dramatic horizon glow ---
  float upPos = max(up, 0.0);
  float mieDamp = 1.0 - overcast * 0.85;
  // Stronger forward scatter bloom toward sun
  c = mix(c, uSunColor * 1.2, pow(sd, 4.5) * 0.28 * max(1.0 - upPos * 1.2, 0.0) * mieDamp);

  // Wider, more dramatic horizon glow in sun's compass direction
  vec2 sunH = vec2(uSunDir.x, uSunDir.z);
  float sunHLen = length(sunH);
  if (sunHLen > 0.05) {
    vec2 dirH = vec2(dir.x, dir.z);
    float dirHLen = length(dirH);
    float hdot = dirHLen > 0.05 ? max(dot(dirH / dirHLen, sunH / sunHLen), 0.0) : 0.0;
    float hband = max(1.0 - abs(up) * 4.5, 0.0);
    // Wide ambient glow
    c += uSunColor * pow(hdot, 3.5) * hband * hband * 0.38 * sunHLen * mieDamp;
    // Below-horizon continuation of the glow
    c += uSunColor * 0.90 * pow(hdot, 2.2) * smoothstep(-0.06, 0.0, -up) * (1.0 - overcast * 0.6);
  }

  // --- Sun corona + disc (larger outer halo, atmospheric glow ring) ---
  float coronaDamp = 1.0 - overcast * 0.92;
  c += uSunColor * pow(sd, 7.0) * 0.20 * coronaDamp;   // wide atmospheric glow
  c += uSunColor * pow(sd, 22.0) * 0.68 * coronaDamp;  // tight corona ring
  c += uSunColor * pow(sd, 380.0) * 1.10 * coronaDamp; // bright disc core
  float perp = length(dir - uSunDir * sd);
  float disc = smoothstep(0.018, 0.006, perp) * coronaDamp;
  c += mix(uSunColor * 1.8, vec3(2.0, 1.9, 1.6), disc) * disc;

  // --- Stars: denser field with Milky Way band ---
  if (uStars > 0.5 && up > 0.05) {
    vec3 cell180 = floor(dir * 180.0);
    float h = hash3(cell180);
    float star = smoothstep(0.992, 1.0, h);   // lower threshold = more stars
    float bright = 0.40 + 0.60 * hash3(floor(dir * 43.0));
    float phase = hash3(floor(dir * 31.0)) * 6.2832;
    float twinkle = 0.78 + 0.22 * sin(uTime * 1.4 + phase);
    float giantH = hash3(floor(dir * 55.0));
    float giant = smoothstep(0.997, 1.0, giantH);
    float giantBright = 0.8 + 0.55 * hash3(floor(dir * 27.0));
    float giantTwinkle = 0.72 + 0.28 * sin(uTime * 0.9 + phase * 1.3);
    c += vec3(star * bright * twinkle + giant * giantBright * giantTwinkle);
    // Milky Way: diffuse band along a tilted galactic plane
    float galY = dot(dir, vec3(0.22, 0.94, 0.25));  // tilted galactic equator
    float galBand  = exp(-galY * galY * 7.0) * 0.55;   // wide glow
    float galCore  = exp(-galY * galY * 40.0) * 0.30;  // bright core
    galBand = (galBand + galCore) * smoothstep(0.05, 0.18, up) * (1.0 - overcast);
    c += vec3(0.22, 0.20, 0.32) * galBand * uStars;  // subtle purple-blue band
  }

  // --- Moon disc + halo ---
  if (uMoon > 0.0 && uStars > 0.5) {
    vec3 moonDir = normalize(vec3(0.42, 0.72, 0.55));
    float md = dot(dir, moonDir);
    float moonPerp = length(dir - moonDir * max(md, 0.0));
    float moonDisc = smoothstep(0.025, 0.010, moonPerp) * uMoon;
    float moonHalo = exp(-moonPerp * moonPerp * 110.0) * 0.35 * uMoon;  // larger halo
    vec3 moonCol = vec3(0.82, 0.88, 1.00);
    if (up > 0.0 && md > 0.0) {
      c += moonCol * (moonDisc * 1.20 + moonHalo);
    }
  }

  // --- Lightning flash: bleach sky toward blue-white ---
  if (uLightning > 0.001) {
    c = mix(c, vec3(0.88, 0.92, 1.10) * 2.8, uLightning * 0.40);
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

  // Composite: scene + bloom, filmic ACES tone-map, colour grading, sun shafts,
  // lens flare, and a soft vignette.
  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;   // level 0 — W/2 (tight glow)
uniform sampler2D uBloom1;  // level 1 — W/4 (medium spread)
uniform sampler2D uBloom2;  // level 2 — W/8 (wide halo)
uniform sampler2D uBloom3;  // level 3 — W/16 (ultra-wide atmospheric)
uniform sampler2D uSSAO;    // screen-space ambient occlusion
uniform sampler2D uSSR;     // screen-space reflections (pre-multiplied by strength)
uniform float uBloomAmt;
uniform vec2 uSunUV;
uniform float uFlareStr;
uniform float uExposure;
uniform float uSunShaft;
uniform vec3 uGradeShadow;   // multiplicative tint pulled into shadows  (~1.0 = neutral)
uniform vec3 uGradeHi;       // multiplicative tint pulled into highlights (~1.0 = neutral)
uniform float uGradeStr;     // 0 = neutral grade (backward-compatible)
out vec4 outColor;

// ACES fitted filmic tone-map (Stephen Hill's approximation). Kept for reference.
vec3 acesTonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// AgX filmic tone-map (Troy Sobotka / Filament fit). Preserves hue into the
// highlights far better than ACES — saturated neon, papaya orange and marshal
// flags roll off to their own bright colour instead of skewing to white. The
// pipeline is gamma-naive (tonemap output is written straight to the 8-bit
// canvas), so we skip the linear EOTF and emit the display-referred sigmoid.
vec3 agxDefaultContrastApprox(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  vec3 x6 = x4 * x2;
  return - 17.86 * x6 * x + 78.01 * x6 - 126.7 * x4 * x + 92.06 * x4
         - 28.72 * x2 * x + 4.361 * x2 - 0.1718 * x + 0.002857;
}
vec3 agxTonemap(vec3 color) {
  const mat3 AgXInset = mat3(
    0.856627153315983, 0.137318972929847, 0.11189821299995,
    0.0951212405381588, 0.761241990602591, 0.0767994186031903,
    0.0482516061458583, 0.101439036467562, 0.811302368396859);
  const mat3 AgXOutset = mat3(
    1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
    -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
    -0.016493938717834573, -0.016493938717834257, 1.2519364065950405);
  const float minEv = -12.47393, maxEv = 4.026069;
  color = AgXInset * color;
  color = clamp(log2(max(color, 1e-10)), minEv, maxEv);
  color = (color - minEv) / (maxEv - minEv);
  color = agxDefaultContrastApprox(color);
  color = AgXOutset * color;
  // Mild saturation restore: 1.22 keeps colour credible without cartoon oversaturation.
  vec3 luma = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
  color = mix(luma, color, 1.22);
  return clamp(color, 0.0, 1.0);
}

// Lift-gamma-gain colour grade: very mild S-curve per channel.
// Lifts shadows slightly (warm), crushes a tiny bit of the blue channel in
// mid-tones, and boosts green just a hint — gives an F1 broadcast look.
vec3 colourGrade(vec3 c) {
  // Gain (per-channel linear scale in highlights)
  c *= vec3(1.015, 1.008, 0.992);
  // Soft S-curve: deepen contrast for punch (less washed-out / flat)
  c = c * (1.0 + c * 0.13) / (1.0 + c * 0.20);
  // Vibrance: pull colour away from its luma. Weighted by how UNsaturated the
  // pixel already is, so pale, washed-out areas (hazy sky, dull grass, gray
  // asphalt) gain the most while vivid neon/kerbs don't over-cook. This is the
  // main fix for the "boring / washed-out" daytime look.
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float sat = mx - mn;
  c = mix(vec3(luma), c, 1.0 + (1.0 - clamp(sat * 1.5, 0.0, 1.0)) * 0.32);
  // Cinematic split-tone: tint shadows one way (cool teal) and highlights the
  // other (warm amber), blended by luma. A staple of the teal-orange film look —
  // gives dusk/dawn richer separation and night a cool moody cast. uGradeStr 0
  // (default) leaves the image untouched, so day stays neutral unless driven.
  float gl2 = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 toneTint = mix(uGradeShadow, uGradeHi, smoothstep(0.0, 0.85, gl2));
  c = mix(c, c * toneTint, uGradeStr);
  // Slight lift: prevents pure blacks — adds a tiny warm floor
  c = max(c, vec3(0.005, 0.004, 0.003));
  return c;
}

void main() {
  vec3 c = texture(uScene, vUV).rgb;

  // Exposure multiply before tone-mapping (default 1.0 = no change).
  c *= uExposure;

  // Multi-scale bloom: accumulate 3 levels (tight / medium / wide) with a
  // tone-aware mask that reduces bloom on already-saturated highlights.
  float bloomMask = 1.0 - clamp(max(c.r, max(c.g, c.b)) - 0.65, 0.0, 0.35) / 0.35 * 0.45;
  vec3 bl = texture(uBloom,  vUV).rgb * 0.35
           + texture(uBloom1, vUV).rgb * 0.28
           + texture(uBloom2, vUV).rgb * 0.22
           + texture(uBloom3, vUV).rgb * 0.15;
  c += bl * uBloomAmt * bloomMask;

  // Volumetric sun shafts: 16-tap radial march from pixel toward sun, sampling
  // the widest bloom level (diffuse sky light). Mie forward-scatter phase factor
  // concentrates the effect around the sun direction. Gated when uSunShaft > 0.
  if (uSunShaft > 0.0) {
    vec2 toSun = uSunUV - vUV;
    float dist = length(toSun);
    if (dist > 0.005) {
      // Forward-scatter phase (Mie-like): brighter when looking toward the sun.
      vec2 vd = normalize(vUV - vec2(0.5));
      vec2 sd = length(uSunUV - vec2(0.5)) > 0.001
                  ? normalize(uSunUV - vec2(0.5)) : vec2(0.0, 1.0);
      float phase = pow(max(dot(vd, sd), 0.0), 3.0) * 0.5 + 0.5; // [0.5, 1.0]

      vec2 step = toSun / dist * min(dist, 0.50) / 16.0;
      vec3 shaft = vec3(0.0);
      vec2 uv = vUV;
      float wt = 1.0, wtSum = 0.0;
      for (int i = 0; i < 16; i++) {
        uv += step;
        vec2 suv = clamp(uv, vec2(0.01), vec2(0.99));
        // Wide bloom captures diffuse sky scatter; tight bloom adds hotspot glow.
        shaft += (texture(uBloom2, suv).rgb * 0.65 + texture(uBloom, suv).rgb * 0.35) * wt;
        wtSum += wt;
        wt *= 0.88;
      }
      shaft /= wtSum;
      float radial = 1.0 - clamp(dist * 1.5, 0.0, 1.0);
      c += shaft * uSunShaft * radial * phase * 0.80;
    }
  }

  // SSAO: multiply scene colour by ambient occlusion factor before tonemap.
  // Applied pre-tonemap so AO darkening is in the same perceptual space as light.
  c *= texture(uSSAO, vUV).r;

  // SSR: additive screen-space reflection (pre-multiplied by fresnel×confidence).
  vec4 ssr = texture(uSSR, vUV);
  c += ssr.rgb;

  // AgX filmic tone-map — preserves hue into highlights vs ACES.
  c = agxTonemap(c);
  c = colourGrade(c);

  // Lens flare: anamorphic streak + ghost circles
  vec3 flare = vec3(0.0);
  if (uFlareStr > 0.0 && uSunUV.x >= 0.0 && uSunUV.x <= 1.0 &&
      uSunUV.y >= 0.0 && uSunUV.y <= 1.0) {
    // Anamorphic horizontal streak
    float streakY = exp(-abs(vUV.y - uSunUV.y) * 120.0);
    float streakX = exp(-abs(vUV.x - uSunUV.x) * 1.8);
    flare += vec3(0.55, 0.72, 1.0) * streakY * streakX * 0.9;

    // Lens ghost circles along sun-to-center axis
    vec2 toCenter = vec2(0.5) - uSunUV;
    float d0 = length(vUV - (uSunUV + toCenter * 0.5));
    flare += vec3(1.0, 0.88, 0.65) * smoothstep(0.055, 0.020, d0) * 0.45;
    float d1 = length(vUV - (uSunUV + toCenter * 1.3));
    flare += vec3(0.70, 0.60, 1.00) * smoothstep(0.038, 0.012, d1) * 0.35;
    float d2 = length(vUV - (uSunUV + toCenter * 1.8));
    flare += vec3(0.50, 1.00, 0.70) * smoothstep(0.028, 0.008, d2) * 0.25;

    flare = min(flare * uFlareStr, vec3(1.2));
  }
  c += flare;

  // Film grain: per-pixel pseudo-random noise breaks the "too clean" digital look.
  // Hash two different frequencies and mix — avoids visible tiling patterns.
  float g1 = fract(sin(dot(vUV, vec2(12.9898,  78.233))) * 43758.5453);
  float g2 = fract(sin(dot(vUV, vec2(63.7264, 107.457))) * 28941.3181);
  c += (mix(g1, g2, 0.5) - 0.5) * 0.028;

  vec2 q = vUV - 0.5;
  float vig = smoothstep(0.92, 0.28, length(q));
  c *= mix(0.76, 1.0, vig);
  outColor = vec4(c, 1.0);
}`;

  // Screen-Space Ambient Occlusion (SSAO): 12-tap hemisphere in depth buffer.
  // Depth is linearised with hardcoded near/far (0.1/2000) matching the game camera.
  // Normal buffer (w=1 on lit geometry, w=0 on sky) gates the effect.
  const SSAO_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uNormal;
uniform sampler2D uDepth;
uniform vec2 uTexel;
out vec4 outColor;
const float NEAR = 0.1, FAR = 2000.0;
float lin(float d) { return NEAR * FAR / (FAR - d * (FAR - NEAR)); }
const vec2 K[12] = vec2[12](
  vec2( 0.000, 1.000), vec2( 0.500, 0.866), vec2( 0.866, 0.500),
  vec2( 1.000, 0.000), vec2( 0.866,-0.500), vec2( 0.500,-0.866),
  vec2( 0.000,-1.000), vec2(-0.500,-0.866), vec2(-0.866,-0.500),
  vec2(-1.000, 0.000), vec2(-0.866, 0.500), vec2(-0.500, 0.866));
void main() {
  vec4 nrm = texture(uNormal, vUV);
  if (nrm.w < 0.5) { outColor = vec4(1.0); return; }  // sky / unlit
  float d = texture(uDepth, vUV).r;
  float ld = lin(d);
  float r = clamp(0.06 / max(ld * 0.004, 1.0), 0.004, 0.055);
  float ao = 0.0;
  for (int i = 0; i < 12; i++) {
    vec2 suv = clamp(vUV + K[i] * r, vec2(0.001), vec2(0.999));
    float sld = lin(texture(uDepth, suv).r);
    float diff = ld - sld;
    float range = smoothstep(r * ld * 3.0, 0.0, abs(diff));
    ao += step(0.04, diff) * range;
  }
  outColor = vec4(vec3(1.0 - clamp(ao / 12.0, 0.0, 1.0) * 0.70), 1.0);
}`;

  // Bilateral blur for SSAO: separable 5-tap Gaussian.
  const SSAO_BLUR_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uSSAO;
uniform vec2 uDir;
out vec4 outColor;
void main() {
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  float s = texture(uSSAO, vUV).r          * 0.2270270270;
  s += texture(uSSAO, vUV + o1).r          * 0.3162162162;
  s += texture(uSSAO, vUV - o1).r          * 0.3162162162;
  s += texture(uSSAO, vUV + o2).r          * 0.0702702703;
  s += texture(uSSAO, vUV - o2).r          * 0.0702702703;
  outColor = vec4(s, s, s, 1.0);
}`;

  // Screen-Space Reflections (SSR): ray march the reflected view vector through NDC,
  // sampling the scene colour at each hit. Half-res, 24 linear steps + 8-step binary
  // refine. Fades at screen edges, low-roughness surfaces, and grazing angles.
  const SSR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uNormal;
uniform sampler2D uDepth;
uniform mat4 uVP;        // view-projection (for projecting world points to NDC)
uniform mat4 uInvVP;     // inverse VP (for reconstructing world pos from NDC)
uniform vec3 uEye;
uniform vec2 uTexel;     // 1/full-res width,height
out vec4 outColor;

const float NEAR = 0.1, FAR = 2000.0;

// Reconstruct world-space position from NDC depth sample.
vec3 worldFromDepth(vec2 uv, float d) {
  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 wp  = uInvVP * ndc;
  return wp.xyz / wp.w;
}

void main() {
  // Sample the G-buffer
  vec4 nrmSample = texture(uNormal, vUV);
  if (nrmSample.w < 0.5) { outColor = vec4(0.0); return; }  // sky → no reflection
  vec3 N = normalize(nrmSample.xyz * 2.0 - 1.0);

  float d = texture(uDepth, vUV).r;
  if (d >= 0.9999) { outColor = vec4(0.0); return; }         // far plane

  vec3 P = worldFromDepth(vUV, d);
  vec3 V = normalize(P - uEye);
  vec3 R = reflect(V, N);

  // Only reflect upward-facing surfaces (floors/track), skip walls/sky-faces
  if (R.y < 0.0) { outColor = vec4(0.0); return; }

  // Fresnel: reflections strongest at grazing angles (water-on-tarmac look)
  float fresnel = pow(1.0 - max(dot(-V, N), 0.0), 3.0);
  // Also modulate by how horizontal the surface is: near-flat = strong, walls = weak
  float flatness = max(N.y, 0.0);
  float strength = fresnel * smoothstep(0.05, 0.35, flatness);
  if (strength < 0.005) { outColor = vec4(0.0); return; }

  // Ray march: 24 linear steps in world space, project each to screen UV
  const int STEPS = 24;
  float stepLen = 0.8;  // world metres per step
  vec3 hit = vec3(0.0);
  float hitConf = 0.0;
  vec2 hitUV = vec2(0.0);

  vec3 rp = P + R * 0.12;  // small offset to avoid self-intersection
  for (int i = 0; i < STEPS; i++) {
    rp += R * stepLen;
    stepLen *= 1.12;  // exponential step growth — covers near + far

    // Project to NDC
    vec4 clip = uVP * vec4(rp, 1.0);
    if (clip.w <= 0.0) break;
    vec3 ndc = clip.xyz / clip.w;
    if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0) break;  // left screen
    vec2 suv = ndc.xy * 0.5 + 0.5;

    // Compare march depth to scene depth
    float sd = texture(uDepth, suv).r;
    float marchDepth = ndc.z * 0.5 + 0.5;
    float diff = sd - marchDepth;

    if (diff > 0.0 && diff < 0.015) {
      // Hit! Binary refine (8 steps)
      vec3 lo = rp - R * stepLen / 1.12, hi = rp;
      for (int b = 0; b < 8; b++) {
        vec3 mid = (lo + hi) * 0.5;
        vec4 mc = uVP * vec4(mid, 1.0);
        vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
        float md = mc.z / mc.w * 0.5 + 0.5;
        float ms = texture(uDepth, muv).r;
        if (ms > md) lo = mid; else hi = mid;
      }
      vec4 fc = uVP * vec4((lo + hi) * 0.5, 1.0);
      hitUV = fc.xy / fc.w * 0.5 + 0.5;
      hit = texture(uScene, hitUV).rgb;
      // Confidence: fade at screen edges and far hits
      float edge = min(min(hitUV.x, 1.0 - hitUV.x), min(hitUV.y, 1.0 - hitUV.y));
      hitConf = smoothstep(0.0, 0.12, edge) * smoothstep(float(STEPS), 0.0, float(i));
      break;
    }
  }

  outColor = vec4(hit * strength * hitConf, strength * hitConf);
}`;

  // FXAA (subpixel morphological AA) + chromatic aberration + mild sharpening.
  // Reads the tonemapped LDR composite output and writes the final screen result.
  const FXAA_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;   // 1.0 / [width, height]
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 p = uTexel;

  // Chromatic aberration: R shifts outward, B shifts inward (mild cinematic look).
  float cdist = length(vUV - 0.5);
  vec2 caOff  = (cdist > 1e-4) ? normalize(vUV - 0.5) * (cdist * 0.0014) : vec2(0.0);

  // 9-tap luma grid for edge detection and subpixel blend.
  float lC  = luma(texture(uTex, vUV).rgb);
  float lN  = luma(texture(uTex, vUV + vec2(0,   p.y)).rgb);
  float lS  = luma(texture(uTex, vUV - vec2(0,   p.y)).rgb);
  float lE  = luma(texture(uTex, vUV + vec2(p.x, 0  )).rgb);
  float lW  = luma(texture(uTex, vUV - vec2(p.x, 0  )).rgb);
  float lNE = luma(texture(uTex, vUV + p).rgb);
  float lNW = luma(texture(uTex, vUV + vec2(-p.x,  p.y)).rgb);
  float lSE = luma(texture(uTex, vUV + vec2( p.x, -p.y)).rgb);
  float lSW = luma(texture(uTex, vUV - p).rgb);

  float lumaMin = min(lC, min(min(lN, lS), min(lE, lW)));
  float lumaMax = max(lC, max(max(lN, lS), max(lE, lW)));
  float range   = lumaMax - lumaMin;

  if (range < max(0.0312, lumaMax * 0.063)) {
    // Flat area: CA + mild sharpening (unsharp mask, ~0.15×).
    vec3 blur4 = (texture(uTex, vUV + vec2(p.x,0)).rgb
                + texture(uTex, vUV - vec2(p.x,0)).rgb
                + texture(uTex, vUV + vec2(0,p.y)).rgb
                + texture(uTex, vUV - vec2(0,p.y)).rgb) * 0.25;
    vec3 cen = texture(uTex, vUV).rgb;
    vec3 sharp = cen + (cen - blur4) * 0.15;
    outColor = vec4(vec3(
      texture(uTex, vUV + caOff).r,
      sharp.g,
      texture(uTex, vUV - caOff * 0.7).b), 1.0);
    return;
  }

  // Edge direction (Sobel).
  float edgeH = abs(lNW - lSW) + 2.0*abs(lN - lS) + abs(lNE - lSE);
  float edgeV = abs(lNW - lNE) + 2.0*abs(lW - lE) + abs(lSW - lSE);
  bool hori   = edgeH >= edgeV;

  // Step perpendicular to edge toward the steeper-gradient side.
  float lPos = hori ? lN : lE;
  float lNeg = hori ? lS : lW;
  bool neg   = abs(lNeg - lC) > abs(lPos - lC);
  vec2 step  = hori ? (neg ? vec2(0,-p.y) : vec2(0,p.y))
                    : (neg ? vec2(-p.x,0)  : vec2(p.x,0));

  // Subpixel blend: deviation of centre luma from the local neighbourhood average.
  float lAvg = (2.0*(lN+lE+lS+lW) + lNE+lNW+lSE+lSW) / 12.0;
  float sub  = smoothstep(0.0, 1.0, abs(lAvg - lC) / range);
  sub = sub * sub * 0.75;

  // Walk along the edge (8 × 1.5 px = up to ±12 px) to find its extent.
  vec2 walkDir = hori ? vec2(p.x,0) : vec2(0,p.y);
  float lumaMid  = (lC + (neg ? lNeg : lPos)) * 0.5;
  float stopDelt = 0.25 * range;
  vec2 posP = vUV + step * 0.5 + walkDir;
  vec2 posN = vUV + step * 0.5 - walkDir;
  bool dpDone = false, dnDone = false;
  for (int i = 0; i < 8; i++) {
    if (!dpDone) {
      if (abs(luma(texture(uTex, posP).rgb) - lumaMid) >= stopDelt) dpDone = true;
      else posP += walkDir * 1.5;
    }
    if (!dnDone) {
      if (abs(luma(texture(uTex, posN).rgb) - lumaMid) >= stopDelt) dnDone = true;
      else posN -= walkDir * 1.5;
    }
  }
  float dP = hori ? abs(posP.x - vUV.x) : abs(posP.y - vUV.y);
  float dN = hori ? abs(posN.x - vUV.x) : abs(posN.y - vUV.y);
  float edgeBlend = max(0.0, 0.5 - min(dP,dN)/(dP+dN));

  float blend  = max(sub, edgeBlend);
  vec2 blendUV = vUV + step * blend;

  // Sample at blend UV with CA.
  outColor = vec4(vec3(
    texture(uTex, blendUV + caOff).r,
    texture(uTex, blendUV).g,
    texture(uTex, blendUV - caOff * 0.7).b), 1.0);
}`;

  // Depth-only pass for shadow map — renders world position into depth buffer.
  const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

  const DEPTH_FS = `#version 300 es
void main() {}`;

  let gl = null;
  let canvas = null;
  let litProg = null, litU = null;
  let skyProg = null, skyU = null;
  let shadowProg = null, shadowU = null;
  let markProg = null, markU = null;
  let skyVAO = null;     // empty VAO (WebGL2 still needs one bound)
  let shadowVAO = null;
  let width = 0, height = 0, aspect = 1;
  let frameViewProj = null;
  let frameInvVP = null;
  let frameEye = null;
  let frameSunDir = null;

  let depthProg = null, depthU = null;
  let shadowMapFBO = null, shadowMapTex = null;
  let shadowLightVP = new Float32Array(16);
  const SHADOW_SIZE = 2048;  // 2K shadow map — PCSS quality benefit outweighs cost
  let shadowEnabled = false;

  // Post-processing state. postEnabled stays false (and rendering goes straight
  // to the default framebuffer, exactly as before) if any target/program setup
  // fails, so the game always renders.
  let postEnabled = false;
  let brightProg = null, brightU = null;
  let blurProg = null, blurU = null;
  let compProg = null, compU = null;
  let sceneFBO = null, sceneTex = null;
  let sceneDepthTex = null;    // depth as readable texture (was renderbuffer)
  let sceneNormalTex = null;   // G-buffer normals — MRT COLOR_ATTACHMENT1
  let ssaoProg = null, ssaoU = null;
  let ssaoBlurProg = null, ssaoBlurU = null;
  let ssaoFBO = [null,null], ssaoTex = [null,null];
  let ssrProg = null, ssrU = null;
  let ssrFBO = [null,null], ssrTex = [null,null];
  let fxaaProg = null, fxaaU = null;
  let interFBO = null, interTex = null;   // composite output before FXAA
  let bloomFBO = [null, null], bloomTex = [null, null];     // level 0 W/2
  let bloom1FBO = [null, null], bloom1Tex = [null, null];   // level 1 W/4
  let bloom2FBO = [null, null], bloom2Tex = [null, null];   // level 2 W/8
  let bloom3FBO = [null, null], bloom3Tex = [null, null];   // level 3 W/16 (ultra-wide halo)
  let colorType = null;        // HALF_FLOAT if renderable, else UNSIGNED_BYTE
  let bloomW = 0, bloomH = 0;
  let bloom1W = 0, bloom1H = 0;
  let bloom2W = 0, bloom2H = 0;
  let bloom3W = 0, bloom3H = 0;
  const BLOOM_DIV = 2;         // level-0 bloom at half resolution

  // Material uniform cache — skip redundant per-draw scalar uploads.
  let _matEmissive = -1, _matAlpha = -1, _matRough = -1, _matMetal = -1, _matSpec = -1, _matDetail = -1;

  // Active-program cache — gl.useProgram is a pipeline-flushing state change, so
  // skip it when the requested program is already bound. Route every bind here.
  let _activeProg = null;
  function useProg(p) { if (p !== _activeProg) { gl.useProgram(p); _activeProg = p; } }

  // Per-frame view-projection upload cache for the blob-shadow / skid-mark
  // programs. uViewProj never changes within a frame, but drawShadow/drawMark are
  // called dozens of times per frame (one per skid stamp / car shadow), each
  // re-uploading the same 16-float matrix. Track which program last received the
  // frame's matrix so the upload happens at most once per program per frame.
  let _frameToken = 0;
  let _shadowVPToken = -1, _markVPToken = -1;

  // VAO bind cache — drawElements requires the right VAO, but consecutive draws
  // of the same mesh (or repeated skid/shadow quads sharing shadowVAO) would
  // otherwise rebind redundantly. Binding null after every draw also forces a
  // rebind on the next; instead leave the last VAO bound and skip no-op binds.
  let _activeVAO = null;
  function bindVAO(v) { if (v !== _activeVAO) { gl.bindVertexArray(v); _activeVAO = v; } }

  // Render-state cache — enable/disable(BLEND) and depthMask are pipeline state
  // changes. Many consecutive draws share the same state (e.g. dozens of skid
  // marks and car shadows per frame), so collapse redundant toggles into no-ops.
  // begin() resyncs these to GL defaults each frame; present() restores them.
  let _blendOn = false, _depthWrite = true;
  function setBlend(on) {
    if (on !== _blendOn) { if (on) gl.enable(gl.BLEND); else gl.disable(gl.BLEND); _blendOn = on; }
  }
  function setDepthMask(on) {
    if (on !== _depthWrite) { gl.depthMask(on); _depthWrite = on; }
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("GLX shader compile failed:\n" + gl.getShaderInfoLog(sh) + "\n" + src);
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(vsSrc, fsSrc) {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("GLX program link failed: " + gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  function locs(prog, names) {
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(prog, n);
    return u;
  }

  // Build the post-processing programs + pick a colour format. Returns true if
  // the whole chain is usable; on any failure the caller leaves post disabled.
  function initPost() {
    // RGBA16F is the ideal HDR target (preserves sun/specular > 1 for bloom);
    // fall back to 8-bit if float colour buffers aren't renderable.
    const ext = gl.getExtension("EXT_color_buffer_float");
    colorType = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    brightProg = link(POST_VS, BRIGHT_FS);
    blurProg = link(POST_VS, BLUR_FS);
    compProg = link(POST_VS, COMPOSITE_FS);
    ssaoProg = link(POST_VS, SSAO_FS);
    ssaoBlurProg = link(POST_VS, SSAO_BLUR_FS);
    ssrProg  = link(POST_VS, SSR_FS);
    fxaaProg = link(POST_VS, FXAA_FS);
    if (!brightProg || !blurProg || !compProg || !ssaoProg || !ssaoBlurProg || !ssrProg || !fxaaProg) return false;
    brightU = locs(brightProg, ["uScene", "uThreshold"]);
    blurU = locs(blurProg, ["uTex", "uDir"]);
    ssaoU = locs(ssaoProg, ["uNormal", "uDepth", "uTexel"]);
    ssaoBlurU = locs(ssaoBlurProg, ["uSSAO", "uDir"]);
    ssrU = locs(ssrProg, ["uScene", "uNormal", "uDepth", "uVP", "uInvVP", "uEye", "uTexel"]);
    fxaaU = locs(fxaaProg, ["uTex", "uTexel"]);
    compU = locs(compProg, ["uScene", "uBloom", "uBloom1", "uBloom2", "uBloom3", "uSSAO", "uSSR", "uBloomAmt", "uSunUV", "uFlareStr", "uExposure", "uSunShaft", "uGradeShadow", "uGradeHi", "uGradeStr"]);
    return true;
  }

  // (Re)allocate the scene + bloom render targets at the current size.
  function createTargets() {
    if (!postEnabled) return;
    const internal = colorType === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
    const mk = (w, h) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, colorType, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    // G-buffer: color (RGBA16F/RGBA8) + depth texture + normals (RGBA8)
    if (sceneTex) gl.deleteTexture(sceneTex);
    if (sceneDepthTex) gl.deleteTexture(sceneDepthTex);
    if (sceneNormalTex) gl.deleteTexture(sceneNormalTex);
    if (!sceneFBO) sceneFBO = gl.createFramebuffer();
    sceneTex = mk(width, height);
    // Depth as TEXTURE (not renderbuffer) so SSAO/SSR can sample it.
    sceneDepthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneDepthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Normals MRT: RGBA8 (RGB = packed world normal, A = lit-geometry sentinel)
    sceneNormalTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneNormalTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, sceneNormalTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sceneDepthTex, 0);
    // Lit geometry writes both attachments; single-output shaders leave normals untouched.
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    // SSAO half-res ping-pong
    for (let i = 0; i < 2; i++) {
      if (ssaoTex[i]) gl.deleteTexture(ssaoTex[i]);
      if (!ssaoFBO[i]) ssaoFBO[i] = gl.createFramebuffer();
      const at = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, at);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, Math.max(1,width>>1), Math.max(1,height>>1),
        0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ssaoTex[i] = at;
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, at, 0);
    }
    // SSR half-res ping-pong (RGBA8: rgb=reflection, a=strength)
    for (let i = 0; i < 2; i++) {
      if (ssrTex[i]) gl.deleteTexture(ssrTex[i]);
      if (!ssrFBO[i]) ssrFBO[i] = gl.createFramebuffer();
      const st = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, st);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, Math.max(1,width>>1), Math.max(1,height>>1),
        0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ssrTex[i] = st;
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssrFBO[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, st, 0);
    }
    // Intermediate full-res LDR target: composite writes here, FXAA reads it → screen.
    if (interTex) gl.deleteTexture(interTex);
    if (!interFBO) interFBO = gl.createFramebuffer();
    interTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, interTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, interFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, interTex, 0);
    // Multi-scale bloom ping-pong targets: level 0 (W/2), 1 (W/4), 2 (W/8)
    bloomW  = Math.max(1, Math.floor(width  / 2));
    bloomH  = Math.max(1, Math.floor(height / 2));
    bloom1W = Math.max(1, Math.floor(width  / 4));
    bloom1H = Math.max(1, Math.floor(height / 4));
    bloom2W = Math.max(1, Math.floor(width  / 8));
    bloom2H = Math.max(1, Math.floor(height / 8));
    const mkBloomLevel = (fbos, texs, w, h) => {
      for (let i = 0; i < 2; i++) {
        if (texs[i]) gl.deleteTexture(texs[i]);
        if (!fbos[i]) fbos[i] = gl.createFramebuffer();
        texs[i] = mk(w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texs[i], 0);
      }
    };
    mkBloomLevel(bloomFBO,  bloomTex,  bloomW,  bloomH);
    mkBloomLevel(bloom1FBO, bloom1Tex, bloom1W, bloom1H);
    mkBloomLevel(bloom2FBO, bloom2Tex, bloom2W, bloom2H);
    bloom3W = Math.max(1, Math.floor(width  / 16));
    bloom3H = Math.max(1, Math.floor(height / 16));
    mkBloomLevel(bloom3FBO, bloom3Tex, bloom3W, bloom3H);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      postEnabled = false;     // unsupported combo: fall back to direct rendering
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function initShadowMap() {
    depthProg = link(DEPTH_VS, DEPTH_FS);
    if (!depthProg) return false;
    depthU = locs(depthProg, ["uModel", "uLightVP"]);

    shadowMapTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowMapTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    // NEAREST + no compare mode: PCSS reads raw depth for blocker search.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    shadowMapFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowMapTex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) return false;

    litProg = link(LIT_VS, LIT_FS);
    skyProg = link(SKY_VS, SKY_FS);
    shadowProg = link(SHADOW_VS, SHADOW_FS);
    markProg = link(SHADOW_VS, MARK_FS);
    if (!litProg || !skyProg || !shadowProg || !markProg) return false;

    postEnabled = initPost();   // best-effort; false -> render straight to screen
    shadowEnabled = initShadowMap();

    litU = locs(litProg, ["uModel", "uViewProj", "uEye", "uSunDir", "uSunColor",
      "uAmbGround", "uAmbSky", "uFogColor", "uFogDensity", "uEmissive", "uAlpha",
      "uRoughness", "uMetalness", "uSpecular", "uDetail",
      "uShadowMap", "uLightVP", "uShadowBias", "uShadowStr", "uShadowTexel",
      "uSkyZenith", "uSkyHorizon", "uFogHeight",
      "uNumLights", "uLightPos[0]", "uLightCol[0]", "uLightRad[0]"]);
    skyU = locs(skyProg, ["uInvViewProj", "uZenith", "uHorizon", "uSunDir", "uSunColor", "uStars", "uCloud", "uTime", "uMoon", "uLightning"]);
    shadowU = locs(shadowProg, ["uModel", "uViewProj", "uSize"]);
    markU = locs(markProg, ["uModel", "uViewProj", "uSize"]);

    skyVAO = gl.createVertexArray();

    // Cached unit quad for blob shadows (xz plane, CCW seen from +Y).
    shadowVAO = gl.createVertexArray();
    gl.bindVertexArray(shadowVAO);
    const qv = new Float32Array([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5]);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, qv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const qi = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, qi);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    resize();
    return true;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const changed = canvas.width !== w || canvas.height !== h;
    if (changed) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    const first = width === 0;
    width = w;
    height = h;
    aspect = w / h;
    if (changed || first) createTargets();   // (re)allocate HDR + bloom targets
  }

  function toF32(a) {
    return a instanceof Float32Array ? a : new Float32Array(a);
  }

  function createMesh(data) {
    const pos = toF32(data.pos);
    const nrm = toF32(data.nrm);
    const col = toF32(data.col);
    let idx = data.idx;
    const vCount = pos.length / 3;
    const big = vCount > 65535;
    if (idx instanceof Uint16Array || idx instanceof Uint32Array) {
      if (big && idx instanceof Uint16Array) idx = new Uint32Array(idx);
    } else {
      idx = big ? new Uint32Array(idx) : new Uint16Array(idx);
    }

    // Interleaved: [x,y,z, nx,ny,nz, r,g,b] per vertex — one buffer, stride=36.
    // Better GPU cache locality vs 3 separate VBOs.
    const interleaved = new Float32Array(vCount * 9);
    for (let i = 0; i < vCount; i++) {
      interleaved[i*9  ] = pos[i*3  ]; interleaved[i*9+1] = pos[i*3+1]; interleaved[i*9+2] = pos[i*3+2];
      interleaved[i*9+3] = nrm[i*3  ]; interleaved[i*9+4] = nrm[i*3+1]; interleaved[i*9+5] = nrm[i*3+2];
      interleaved[i*9+6] = col[i*3  ]; interleaved[i*9+7] = col[i*3+1]; interleaved[i*9+8] = col[i*3+2];
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    const stride = 36;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride,  0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    _activeVAO = null;   // keep the bind cache in sync with the direct bind above

    return { vao, vbo, ib, count: idx.length, indexType: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }

  function begin(frame) {
    frameViewProj = frame.viewProj;
    frameInvVP = M4.invert(frame.viewProj);
    frameEye = frame.eye;
    frameSunDir = frame.sunDir;
    _frameToken++;   // invalidate per-frame uViewProj upload caches
    // Render the scene into the HDR offscreen target when post is enabled, else
    // straight to the default framebuffer.
    if (postEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.viewport(0, 0, width, height);
      // G-buffer MRT: lit geometry writes normals to COLOR_ATTACHMENT1.
      // Single-output shaders (sky, shadow, mark) leave normals untouched.
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    }
    // Resync cached render state to GL defaults — depthMask must be on for the
    // depth buffer to clear, and blend off is the opaque-pass default.
    gl.disable(gl.BLEND); _blendOn = false;
    gl.depthMask(true); _depthWrite = true;
    const fc = frame.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    useProg(litProg);
    gl.uniformMatrix4fv(litU.uViewProj, false, frame.viewProj);
    gl.uniform3fv(litU.uEye, frame.eye);
    gl.uniform3fv(litU.uSunDir, frame.sunDir);
    gl.uniform3fv(litU.uSunColor, frame.sunColor);
    gl.uniform3fv(litU.uAmbGround, frame.ambientGround);
    gl.uniform3fv(litU.uAmbSky, frame.ambientSky);
    gl.uniform3fv(litU.uFogColor, frame.fogColor);
    gl.uniform1f(litU.uFogDensity, frame.fogDensity);
    if (shadowEnabled) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowMapTex);
      gl.uniform1i(litU.uShadowMap, 0);
      gl.uniformMatrix4fv(litU.uLightVP, false, shadowLightVP);
      gl.uniform1f(litU.uShadowBias, 0.001);
      gl.uniform1f(litU.uShadowStr, 1.0);
      gl.uniform1f(litU.uShadowTexel, 1.0 / SHADOW_SIZE);
    } else {
      gl.uniform1f(litU.uShadowStr, 0.0);
    }
    gl.uniform3fv(litU.uSkyZenith,  frame.skyZenith  || [0.18, 0.40, 0.78]);
    gl.uniform3fv(litU.uSkyHorizon, frame.skyHorizon || [0.62, 0.74, 0.88]);
    gl.uniform1f(litU.uFogHeight,   frame.fogHeight  != null ? frame.fogHeight : 0.0);
    // Point lights (floodlights / street lights). frame.lights is a flat array
    // [x,y,z, r,g,b, rad, …] of at most MAX_LIGHTS (24) entries, already culled to
    // the nearest set by the caller. Uploaded once per frame; uNumLights=0 on day.
    {
      const L = frame.lights;
      const nL = L ? Math.min(32, (L.length / 7) | 0) : 0;
      gl.uniform1i(litU.uNumLights, nL);
      if (nL > 0) {
        const pos = new Float32Array(nL * 3), col = new Float32Array(nL * 3), rad = new Float32Array(nL);
        for (let i = 0; i < nL; i++) {
          const o = i * 7;
          pos[i * 3] = L[o]; pos[i * 3 + 1] = L[o + 1]; pos[i * 3 + 2] = L[o + 2];
          col[i * 3] = L[o + 3]; col[i * 3 + 1] = L[o + 4]; col[i * 3 + 2] = L[o + 5];
          rad[i] = L[o + 6];
        }
        gl.uniform3fv(litU["uLightPos[0]"], pos);
        gl.uniform3fv(litU["uLightCol[0]"], col);
        gl.uniform1fv(litU["uLightRad[0]"], rad);
      }
    }
    _matEmissive = _matAlpha = _matRough = _matMetal = _matSpec = _matDetail = -1;
  }

  function draw(mesh, modelMat, opts) {
    useProg(litProg);
    gl.uniformMatrix4fv(litU.uModel, false, modelMat);
    const emissive = opts && opts.emissive !== undefined ? opts.emissive : 0;
    const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    // Material (set every draw so values never leak from the previous mesh).
    // Defaults give a matte dielectric, so callers that pass no material look
    // essentially like the original lambert shading, just with a faint sheen.
    const roughness = opts && opts.roughness !== undefined ? opts.roughness : 0.7;
    const metalness = opts && opts.metalness !== undefined ? opts.metalness : 0.0;
    const specular = opts && opts.specular !== undefined ? opts.specular : 0.5;
    const detail = opts && opts.detail !== undefined ? opts.detail : 0.0;
    if (emissive  !== _matEmissive) { gl.uniform1f(litU.uEmissive,  emissive);  _matEmissive = emissive; }
    if (alpha     !== _matAlpha)    { gl.uniform1f(litU.uAlpha,     alpha);     _matAlpha    = alpha; }
    if (roughness !== _matRough)    { gl.uniform1f(litU.uRoughness, roughness); _matRough    = roughness; }
    if (metalness !== _matMetal)    { gl.uniform1f(litU.uMetalness, metalness); _matMetal    = metalness; }
    if (specular  !== _matSpec)     { gl.uniform1f(litU.uSpecular,  specular);  _matSpec     = specular; }
    if (detail    !== _matDetail)   { gl.uniform1f(litU.uDetail,    detail);    _matDetail   = detail; }
    // Each draw declares the full render state it needs (no restores afterwards),
    // so runs of same-state draws collapse to a single real toggle via the cache.
    setDepthMask(true);
    setBlend(alpha < 1);
    bindVAO(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
  }

  function drawSky(sky) {
    useProg(skyProg);
    gl.uniformMatrix4fv(skyU.uInvViewProj, false, sky.invViewProj);
    gl.uniform3fv(skyU.uZenith, sky.zenith);
    gl.uniform3fv(skyU.uHorizon, sky.horizon);
    gl.uniform3fv(skyU.uSunDir, sky.sunDir);
    gl.uniform3fv(skyU.uSunColor, sky.sunColor);
    gl.uniform1f(skyU.uStars, sky.stars ? 1 : 0);
    gl.uniform1f(skyU.uCloud, sky.cloud !== undefined ? sky.cloud : 0);
    gl.uniform1f(skyU.uTime,  sky.time  !== undefined ? sky.time  : 0);
    gl.uniform1f(skyU.uMoon,  sky.moon  !== undefined ? sky.moon  : 0);
    gl.uniform1f(skyU.uLightning, sky.lightning !== undefined ? sky.lightning : 0);
    setBlend(false);
    setDepthMask(false);
    bindVAO(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawShadow(modelMat, w, l) {
    useProg(shadowProg);
    if (_shadowVPToken !== _frameToken) {
      gl.uniformMatrix4fv(shadowU.uViewProj, false, frameViewProj);
      _shadowVPToken = _frameToken;
    }
    gl.uniformMatrix4fv(shadowU.uModel, false, modelMat);
    gl.uniform2f(shadowU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    bindVAO(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function drawMark(modelMat, w, l) {
    useProg(markProg);
    if (_markVPToken !== _frameToken) {
      gl.uniformMatrix4fv(markU.uViewProj, false, frameViewProj);
      _markVPToken = _frameToken;
    }
    gl.uniformMatrix4fv(markU.uModel, false, modelMat);
    gl.uniform2f(markU.uSize, w, l);
    setBlend(true);
    setDepthMask(false);
    bindVAO(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  // Resolve the HDR scene to the screen: extract bright areas, blur them into a
  // bloom buffer, then composite scene + bloom with tonemap + vignette. No-op when
  // post is disabled (the scene was drawn straight to the screen already).
  function present(opts) {
    if (!postEnabled) return;
    const threshold = opts && opts.threshold !== undefined ? opts.threshold : 0.75;
    const bloomAmt = opts && opts.bloom !== undefined ? opts.bloom : 0.55;

    // Fullscreen passes must overwrite (no blend) and write depth normally; draws
    // above leave state undeclared, so set what we need through the cache.
    setBlend(false);
    setDepthMask(true);
    gl.disable(gl.DEPTH_TEST);
    bindVAO(skyVAO);   // reuse the empty VAO for fullscreen triangles

    // Helper: run one H+V Gaussian pass on a ping-pong pair at given size.
    const blurLevel = (fbos, texs, w, h) => {
      useProg(blurProg);
      gl.uniform1i(blurU.uTex, 0);
      let s = 0;
      for (const [dx, dy] of [[1/w,0],[0,1/h]]) {
        const d = 1 - s;
        gl.viewport(0, 0, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[d]);
        gl.bindTexture(gl.TEXTURE_2D, texs[s]);
        gl.uniform2f(blurU.uDir, dx, dy);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        s = d;
      }
      return s; // index of final blurred result
    };

    // 0) SSAO pass — half-res: raw AO → H blur → V blur → ssaoTex[0]
    {
      const sw = Math.max(1, width >> 1), sh = Math.max(1, height >> 1);
      // Raw SSAO
      gl.viewport(0, 0, sw, sh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO[1]);
      useProg(ssaoProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneNormalTex); gl.uniform1i(ssaoU.uNormal, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sceneDepthTex);  gl.uniform1i(ssaoU.uDepth,  1);
      gl.uniform2f(ssaoU.uTexel, 1.0 / sw, 1.0 / sh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Bilateral blur H: [1] → [0]
      useProg(ssaoBlurProg);
      gl.uniform1i(ssaoBlurU.uSSAO, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO[0]); gl.bindTexture(gl.TEXTURE_2D, ssaoTex[1]); gl.uniform2f(ssaoBlurU.uDir, 1.0/sw, 0.0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Bilateral blur V: [0] → [1]
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO[1]); gl.bindTexture(gl.TEXTURE_2D, ssaoTex[0]); gl.uniform2f(ssaoBlurU.uDir, 0.0, 1.0/sh); gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Blit [1] → [0] so ssaoTex[0] is the final blurred result
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ssaoFBO[1]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, ssaoFBO[0]);
      gl.blitFramebuffer(0, 0, sw, sh, 0, 0, sw, sh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }

    // 0b) SSR pass — half-res: ray-march reflections into ssrTex[0]
    if (frameViewProj && frameInvVP && frameEye) {
      const sw = Math.max(1, width >> 1), sh = Math.max(1, height >> 1);
      gl.viewport(0, 0, sw, sh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssrFBO[0]);
      useProg(ssrProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex);      gl.uniform1i(ssrU.uScene,  0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sceneNormalTex); gl.uniform1i(ssrU.uNormal, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sceneDepthTex);  gl.uniform1i(ssrU.uDepth,  2);
      gl.uniformMatrix4fv(ssrU.uVP,    false, frameViewProj);
      gl.uniformMatrix4fv(ssrU.uInvVP, false, frameInvVP);
      gl.uniform3fv(ssrU.uEye, frameEye);
      gl.uniform2f(ssrU.uTexel, 1.0 / width, 1.0 / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 1) bright-pass scene → bloom level 0 (W/2)
    gl.viewport(0, 0, bloomW, bloomH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[0]);
    useProg(brightProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(brightU.uScene, 0);
    gl.uniform1f(brightU.uThreshold, threshold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) blur level 0
    let src0 = blurLevel(bloomFBO, bloomTex, bloomW, bloomH);

    // 3) hardware-linear downsample level 0 → level 1 (W/4), then blur
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, bloomFBO[src0]);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, bloom1FBO[0]);
    gl.blitFramebuffer(0, 0, bloomW, bloomH, 0, 0, bloom1W, bloom1H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    let src1 = blurLevel(bloom1FBO, bloom1Tex, bloom1W, bloom1H);

    // 4) downsample level 1 → level 2 (W/8), then blur
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, bloom1FBO[src1]);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, bloom2FBO[0]);
    gl.blitFramebuffer(0, 0, bloom1W, bloom1H, 0, 0, bloom2W, bloom2H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    let src2 = blurLevel(bloom2FBO, bloom2Tex, bloom2W, bloom2H);

    // 5) downsample level 2 → level 3 (W/16), then blur
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, bloom2FBO[src2]);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, bloom3FBO[0]);
    gl.blitFramebuffer(0, 0, bloom2W, bloom2H, 0, 0, bloom3W, bloom3H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    let src3 = blurLevel(bloom3FBO, bloom3Tex, bloom3W, bloom3H);

    const src = src0; // level-0 final index (for god-ray sampling)

    // 6) composite → interFBO (LDR tonemap output; FXAA reads this next step)
    gl.bindFramebuffer(gl.FRAMEBUFFER, interFBO);
    gl.viewport(0, 0, width, height);
    useProg(compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(compU.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex[src0]);
    gl.uniform1i(compU.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bloom1Tex[src1]);
    gl.uniform1i(compU.uBloom1, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, bloom2Tex[src2]);
    gl.uniform1i(compU.uBloom2, 3);
    gl.uniform1f(compU.uBloomAmt, bloomAmt);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, ssaoTex[0]);
    gl.uniform1i(compU.uSSAO, 4);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, ssrTex[0]);
    gl.uniform1i(compU.uSSR, 5);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, bloom3Tex[src3]);
    gl.uniform1i(compU.uBloom3, 6);
    // Project sun direction to screen UV for lens flare
    let sunUV = [-2, -2], flareStr = 0, sunShaft = 0;
    if (frameSunDir && frameViewProj) {
      const s = frameSunDir;
      // Treat sun as infinitely distant: clip pos = VP * (sunDir, 0)
      const vp = frameViewProj;
      const cx = vp[0]*s[0] + vp[4]*s[1] + vp[8]*s[2];
      const cy = vp[1]*s[0] + vp[5]*s[1] + vp[9]*s[2];
      const cw = vp[3]*s[0] + vp[7]*s[1] + vp[11]*s[2];
      if (cw > 0) {
        sunUV = [cx / cw * 0.5 + 0.5, cy / cw * 0.5 + 0.5];
        flareStr = Math.max(s[1], 0) * 0.65;
        if (s[1] > 0.05) sunShaft = s[1] * 0.8;
      }
    }
    gl.uniform2fv(compU.uSunUV, sunUV);
    gl.uniform1f(compU.uFlareStr, flareStr);
    const exposure = opts && opts.exposure !== undefined ? opts.exposure : 1.0;
    gl.uniform1f(compU.uExposure, exposure);
    gl.uniform1f(compU.uSunShaft, sunShaft);
    // Cinematic split-tone grade (neutral by default → existing look unchanged).
    const grade = opts && opts.grade;
    gl.uniform3fv(compU.uGradeShadow, grade && grade.shadow ? grade.shadow : [1, 1, 1]);
    gl.uniform3fv(compU.uGradeHi, grade && grade.hi ? grade.hi : [1, 1, 1]);
    gl.uniform1f(compU.uGradeStr, grade && grade.str !== undefined ? grade.str : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 7) FXAA + CA + sharpening: interTex → screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    useProg(fxaaProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, interTex);
    gl.uniform1i(fxaaU.uTex, 0);
    gl.uniform2f(fxaaU.uTexel, 1.0 / width, 1.0 / height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    bindVAO(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST);
  }

  function freeMesh(mesh) {
    if (!mesh) return;
    if (_activeVAO === mesh.vao) { gl.bindVertexArray(null); _activeVAO = null; }
    gl.deleteBuffer(mesh.ib);
    gl.deleteBuffer(mesh.vbo);
    gl.deleteVertexArray(mesh.vao);
  }

  return {
    init,
    resize,
    createMesh,
    freeMesh,
    begin,
    draw,
    drawSky,
    drawShadow,
    drawMark,
    present,
    shadowBegin(lightVP) {
      if (!shadowEnabled) return;
      // Depth must be writable to clear/render the shadow map. This pass runs
      // before begin(), so declare the state explicitly rather than assuming it.
      setDepthMask(true);
      shadowLightVP.set(lightVP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapFBO);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      useProg(depthProg);
      gl.uniformMatrix4fv(depthU.uLightVP, false, lightVP);
      gl.disable(gl.CULL_FACE);  // render back faces to avoid peter-panning
    },
    castShadow(mesh, model) {
      if (!shadowEnabled || !mesh) return;
      bindVAO(mesh.vao);
      gl.uniformMatrix4fv(depthU.uModel, false, model);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    },
    shadowEnd() {
      if (!shadowEnabled) return;
      gl.enable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, postEnabled ? sceneFBO : null);
      gl.viewport(0, 0, width, height);
    },
    get width() { return width; },
    get height() { return height; },
    get aspect() { return aspect; },
    hdrMode: () => colorType === gl.HALF_FLOAT,
  };
})();
