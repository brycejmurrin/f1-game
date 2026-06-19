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
uniform sampler2DShadow uShadowMap;
uniform mat4 uLightVP;
uniform float uShadowBias;
uniform float uShadowStr;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uFogHeight;
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
  return f0 + (vec3(f90) - f0) * pow(1.0 - VoH, 5.0);
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

float sampleShadow(vec3 wpos) {
  vec4 lc = uLightVP * vec4(wpos, 1.0);
  vec3 sc = lc.xyz / lc.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z >= 1.0) return 1.0;
  ivec2 sz = textureSize(uShadowMap, 0);
  float t = 1.0 / float(sz.x);
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
    s += texture(uShadowMap, vec3(sc.xy + vec2(float(i), float(j)) * t, sc.z - uShadowBias));
  return mix(1.0, s / 9.0, uShadowStr);
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
    float n = vnoise(wp * 0.35) * 0.55 + vnoise(wp * 1.9) * 0.30 + vnoise(wp * 8.0) * 0.15;
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
    vec3 envColor = mix(uSkyHorizon, uSkyZenith, skyT);
    // Fresnel: reflection is strongest at grazing angles
    float envFresnel = F_Schlick(max(dot(N, V), 0.0), vec3(0.04), 1.0).x;
    color += envColor * envFresnel * envBlend * (1.0 - uMetalness);
  }

  color = mix(color, albedo, uEmissive);

  // Height-based fog: density falls off exponentially with altitude above eye level.
  // uFogHeight = 0 → uniform (original behaviour); > 0 → pooling fog.
  float heightAtten = uFogHeight > 0.0
    ? exp(-max(vWorldPos.y - uEye.y, 0.0) * uFogHeight)
    : 1.0;
  float fd = vDist * uFogDensity * heightAtten;
  float f = 1.0 - exp(-fd * fd);
  outColor = vec4(mix(color, uFogColor, f), uAlpha);
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

  // Sun-elevation factor: 0 = sun on/below horizon, 1 = overhead noon.
  // Drives automatic golden-hour / sunset tint without per-track authoring.
  float sunE = clamp(uSunDir.y * 1.4, 0.0, 1.0);

  // --- Sky gradient ---
  vec3 c;
  if (up >= 0.0) {
    c = mix(uHorizon, uZenith, pow(up, 0.5));
    // Golden-hour: warm amber/orange overlay near the horizon when the sun is low.
    // Concentrated in the bottom 32% of sky; fades out as sun climbs past ~50°.
    float goldenAmt = (1.0 - smoothstep(0.0, 0.72, sunE))
                    * (1.0 - smoothstep(0.0, 0.32, up));
    vec3 goldenColor = mix(vec3(0.70, 0.22, 0.04), vec3(0.92, 0.55, 0.16),
                           clamp(sunE * 2.5, 0.0, 1.0));
    c = mix(c, c * 0.45 + goldenColor * 0.55, goldenAmt * 0.80);
  } else {
    // Below the horizon: dark earth tone, smoothly blended from the horizon colour.
    float gnd = clamp(-up * 5.0, 0.0, 1.0);
    c = mix(uHorizon * 0.85, vec3(0.035, 0.030, 0.022), gnd * gnd);
  }

  // --- Procedural cloud layer ---
  // Static (no time uniform) so screenshots stay deterministic.
  if (uCloud > 0.001 && up > 0.012) {
    vec2 cp = dir.xz / up * 0.42;
    float f = fbm(cp);
    float cov = smoothstep(0.55 - uCloud * 0.4, 0.92, f);
    cov *= smoothstep(0.012, 0.08, up);
    // Second FBM gives per-cloud "thickness": thin areas = backlit bright,
    // thick billowing regions = shadowed dark underside.
    float thick = clamp(fbm(cp * 0.55 + vec2(3.1, 1.7)) * 2.0 - 0.55, 0.0, 1.0);
    float sl = pow(sd, 2.0);
    float sunBright = max(uSunColor.r, max(uSunColor.g, uSunColor.b));
    // Sunlit tops: white in daylight, warm-tinted at sunset
    vec3 cloudTop = mix(vec3(0.58, 0.62, 0.70), vec3(1.0, 0.97, 0.91), sl);
    cloudTop *= 0.38 + 0.62 * sunBright;
    cloudTop = mix(cloudTop, cloudTop * uSunColor * 1.45, sl * (1.0 - sunE) * 0.55);
    // Dark undersides: cooler and dimmer, conveying mass/volume
    vec3 cloudBot = vec3(0.31, 0.32, 0.38) * (0.28 + 0.48 * sunBright);
    vec3 lit = mix(cloudBot, cloudTop, clamp(0.18 + (1.0 - thick) * 0.75, 0.0, 1.0));
    c = mix(c, lit, cov);
  }

  // --- Mie forward scatter: glow toward the sun, strongest near the horizon ---
  float upPos = max(up, 0.0);
  c = mix(c, uSunColor, pow(sd, 5.0) * 0.22 * max(1.0 - upPos * 1.5, 0.0));

  // --- Horizon glow in the sun's compass direction ---
  vec2 sunH = vec2(uSunDir.x, uSunDir.z);
  float sunHLen = length(sunH);
  if (sunHLen > 0.05) {
    vec2 dirH = vec2(dir.x, dir.z);
    float dirHLen = length(dirH);
    float hdot = dirHLen > 0.05 ? max(dot(dirH / dirHLen, sunH / sunHLen), 0.0) : 0.0;
    float hband = max(1.0 - abs(up) * 5.0, 0.0);
    c += uSunColor * pow(hdot, 6.0) * hband * hband * 0.22 * sunHLen;
  }

  // --- Sun corona + disc ---
  c += uSunColor * pow(sd, 20.0) * 0.55;   // outer halo ~15°
  c += uSunColor * pow(sd, 300.0) * 0.90;  // inner ring ~4°
  float perp = length(dir - uSunDir * sd);
  float disc = smoothstep(0.018, 0.006, perp);
  c += mix(uSunColor * 1.6, vec3(1.8, 1.75, 1.5), disc) * disc;

  // --- Stars (night tracks) ---
  if (uStars > 0.5 && up > 0.05) {
    float h = hash3(floor(dir * 180.0));
    float star = smoothstep(0.9975, 1.0, h);
    float bright = 0.5 + 0.5 * hash3(floor(dir * 43.0));
    c += vec3(star * bright);
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

  // Composite: scene + bloom, then a highlight-preserving rolloff (identity below
  // ~0.8 so the hand-tuned mid/shadow palette is untouched; bright values compress
  // toward 1 instead of harshly clipping), plus a soft vignette.
  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmt;
uniform vec2 uSunUV;
uniform float uFlareStr;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  c += texture(uBloom, vUV).rgb * uBloomAmt;
  c = c / (1.0 + max(c - vec3(0.8), vec3(0.0)));

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

  vec2 q = vUV - 0.5;
  float vig = smoothstep(0.95, 0.35, length(q));
  c *= mix(0.86, 1.0, vig);
  outColor = vec4(c, 1.0);
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
  let frameSunDir = null;

  let depthProg = null, depthU = null;
  let shadowMapFBO = null, shadowMapTex = null;
  let shadowLightVP = new Float32Array(16);
  const SHADOW_SIZE = 1024;
  let shadowEnabled = false;

  // Post-processing state. postEnabled stays false (and rendering goes straight
  // to the default framebuffer, exactly as before) if any target/program setup
  // fails, so the game always renders.
  let postEnabled = false;
  let brightProg = null, brightU = null;
  let blurProg = null, blurU = null;
  let compProg = null, compU = null;
  let sceneFBO = null, sceneTex = null, sceneDepth = null;
  let bloomFBO = [null, null], bloomTex = [null, null];
  let colorType = null;        // HALF_FLOAT if renderable, else UNSIGNED_BYTE
  let bloomW = 0, bloomH = 0;
  const BLOOM_DIV = 2;         // bloom buffers at half resolution

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
    if (!brightProg || !blurProg || !compProg) return false;
    brightU = locs(brightProg, ["uScene", "uThreshold"]);
    blurU = locs(blurProg, ["uTex", "uDir"]);
    compU = locs(compProg, ["uScene", "uBloom", "uBloomAmt", "uSunUV", "uFlareStr"]);
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
    // scene target (full res) + depth
    if (sceneTex) gl.deleteTexture(sceneTex);
    if (sceneDepth) gl.deleteRenderbuffer(sceneDepth);
    if (!sceneFBO) sceneFBO = gl.createFramebuffer();
    sceneTex = mk(width, height);
    sceneDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, sceneDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sceneDepth);
    // bloom ping-pong targets (half res)
    bloomW = Math.max(1, Math.floor(width / BLOOM_DIV));
    bloomH = Math.max(1, Math.floor(height / BLOOM_DIV));
    for (let i = 0; i < 2; i++) {
      if (bloomTex[i]) gl.deleteTexture(bloomTex[i]);
      if (!bloomFBO[i]) bloomFBO[i] = gl.createFramebuffer();
      bloomTex[i] = mk(bloomW, bloomH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bloomTex[i], 0);
    }
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

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
      "uShadowMap", "uLightVP", "uShadowBias", "uShadowStr",
      "uSkyZenith", "uSkyHorizon", "uFogHeight"]);
    skyU = locs(skyProg, ["uInvViewProj", "uZenith", "uHorizon", "uSunDir", "uSunColor", "uStars", "uCloud"]);
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
    const big = pos.length / 3 > 65535;
    if (idx instanceof Uint16Array || idx instanceof Uint32Array) {
      if (big && idx instanceof Uint16Array) idx = new Uint32Array(idx);
    } else {
      idx = big ? new Uint32Array(idx) : new Uint16Array(idx);
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const attribs = [pos, nrm, col];
    for (let i = 0; i < 3; i++) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, attribs[i], gl.STATIC_DRAW);
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 0, 0);
    }
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    return {
      vao,
      count: idx.length,
      indexType: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
  }

  function begin(frame) {
    frameViewProj = frame.viewProj;
    frameSunDir = frame.sunDir;
    // Render the scene into the HDR offscreen target when post is enabled, else
    // straight to the default framebuffer.
    if (postEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.viewport(0, 0, width, height);
    }
    const fc = frame.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(litProg);
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
      gl.uniform1f(litU.uShadowBias, 0.002);
      gl.uniform1f(litU.uShadowStr, 1.0);
    } else {
      gl.uniform1f(litU.uShadowStr, 0.0);
    }
    gl.uniform3fv(litU.uSkyZenith,  frame.skyZenith  || [0.18, 0.40, 0.78]);
    gl.uniform3fv(litU.uSkyHorizon, frame.skyHorizon || [0.62, 0.74, 0.88]);
    gl.uniform1f(litU.uFogHeight,   frame.fogHeight  != null ? frame.fogHeight : 0.0);
  }

  function draw(mesh, modelMat, opts) {
    gl.useProgram(litProg);
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
    gl.uniform1f(litU.uEmissive, emissive);
    gl.uniform1f(litU.uAlpha, alpha);
    gl.uniform1f(litU.uRoughness, roughness);
    gl.uniform1f(litU.uMetalness, metalness);
    gl.uniform1f(litU.uSpecular, specular);
    gl.uniform1f(litU.uDetail, detail);
    const blend = alpha < 1;
    if (blend) gl.enable(gl.BLEND);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    gl.bindVertexArray(null);
    if (blend) gl.disable(gl.BLEND);
  }

  function drawSky(sky) {
    gl.useProgram(skyProg);
    gl.uniformMatrix4fv(skyU.uInvViewProj, false, sky.invViewProj);
    gl.uniform3fv(skyU.uZenith, sky.zenith);
    gl.uniform3fv(skyU.uHorizon, sky.horizon);
    gl.uniform3fv(skyU.uSunDir, sky.sunDir);
    gl.uniform3fv(skyU.uSunColor, sky.sunColor);
    gl.uniform1f(skyU.uStars, sky.stars ? 1 : 0);
    gl.uniform1f(skyU.uCloud, sky.cloud !== undefined ? sky.cloud : 0);
    gl.depthMask(false);
    gl.bindVertexArray(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);
  }

  function drawShadow(modelMat, w, l) {
    gl.useProgram(shadowProg);
    gl.uniformMatrix4fv(shadowU.uViewProj, false, frameViewProj);
    gl.uniformMatrix4fv(shadowU.uModel, false, modelMat);
    gl.uniform2f(shadowU.uSize, w, l);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.bindVertexArray(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function drawMark(modelMat, w, l) {
    gl.useProgram(markProg);
    gl.uniformMatrix4fv(markU.uViewProj, false, frameViewProj);
    gl.uniformMatrix4fv(markU.uModel, false, modelMat);
    gl.uniform2f(markU.uSize, w, l);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.bindVertexArray(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // Resolve the HDR scene to the screen: extract bright areas, blur them into a
  // bloom buffer, then composite scene + bloom with tonemap + vignette. No-op when
  // post is disabled (the scene was drawn straight to the screen already).
  function present(opts) {
    if (!postEnabled) return;
    const threshold = opts && opts.threshold !== undefined ? opts.threshold : 0.75;
    const bloomAmt = opts && opts.bloom !== undefined ? opts.bloom : 0.55;

    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(skyVAO);   // reuse the empty VAO for fullscreen triangles

    // 1) bright-pass scene -> bloom[0] (half res)
    gl.viewport(0, 0, bloomW, bloomH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[0]);
    gl.useProgram(brightProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(brightU.uScene, 0);
    gl.uniform1f(brightU.uThreshold, threshold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) separable gaussian blur, a couple of ping-pong passes
    gl.useProgram(blurProg);
    gl.uniform1i(blurU.uTex, 0);
    const passes = [[1 / bloomW, 0], [0, 1 / bloomH], [1 / bloomW, 0], [0, 1 / bloomH]];
    let src = 0;
    for (const [dx, dy] of passes) {
      const dst = 1 - src;
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[dst]);
      gl.bindTexture(gl.TEXTURE_2D, bloomTex[src]);
      gl.uniform2f(blurU.uDir, dx, dy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = dst;
    }

    // 3) composite to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(compU.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex[src]);
    gl.uniform1i(compU.uBloom, 1);
    gl.uniform1f(compU.uBloomAmt, bloomAmt);
    // Project sun direction to screen UV for lens flare
    let sunUV = [-2, -2], flareStr = 0;
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
      }
    }
    gl.uniform2fv(compU.uSunUV, sunUV);
    gl.uniform1f(compU.uFlareStr, flareStr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST);
  }

  return {
    init,
    resize,
    createMesh,
    begin,
    draw,
    drawSky,
    drawShadow,
    drawMark,
    present,
    shadowBegin(lightVP) {
      if (!shadowEnabled) return;
      shadowLightVP.set(lightVP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapFBO);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depthProg);
      gl.uniformMatrix4fv(depthU.uLightVP, false, lightVP);
      gl.disable(gl.CULL_FACE);  // render back faces to avoid peter-panning
    },
    castShadow(mesh, model) {
      if (!shadowEnabled || !mesh) return;
      gl.bindVertexArray(mesh.vao);
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
  };
})();
