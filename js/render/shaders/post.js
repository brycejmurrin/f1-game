/* Apex 26 — GLSL sources for the WebGL2 renderer (js/render/glx.js): the post chain — POST_VS fullscreen triangle, bloom (BRIGHT/BLUR/DOWN/UP), SSAO, volumetric s… */
"use strict";

(function () {
  // Fullscreen triangle via gl_VertexID; vUV in 0..1.
  const POST_VS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform float uThreshold;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float l = max(max(c.r, c.g), c.b);
  float knee = uThreshold * 0.5 + 1e-4;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float k = max(soft, l - uThreshold) / max(l, 1e-4);
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

  const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uKaris;   // 1 on the FIRST mip only: partial luma weighting (firefly fix)
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
  vec3 g0 = (a + b + d + e) * 0.25;
  vec3 g1 = (b + c + e + f) * 0.25;
  vec3 g2 = (d + e + g + h) * 0.25;
  vec3 g3 = (e + f + h + i) * 0.25;
  vec3 g4 = (j + k + l + m) * 0.25;
  if (uKaris > 0.5) {
    float w0 = 0.125 / (1.0 + max(g0.r, max(g0.g, g0.b)));
    float w1 = 0.125 / (1.0 + max(g1.r, max(g1.g, g1.b)));
    float w2 = 0.125 / (1.0 + max(g2.r, max(g2.g, g2.b)));
    float w3 = 0.125 / (1.0 + max(g3.r, max(g3.g, g3.b)));
    float w4 = 0.5   / (1.0 + max(g4.r, max(g4.g, g4.b)));
    vec3 s = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4)
           / (w0 + w1 + w2 + w3 + w4);
    outColor = vec4(s, 1.0);
  } else {
    vec3 s = (g0 + g1 + g2 + g3) * 0.125 + g4 * 0.5;
    outColor = vec4(s, 1.0);
  }
}`;

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
  vec3 crN = cross(dFdx(P), dFdy(P));
  float crL = length(crN);
  vec3 N = crL > 1e-6 ? crN / crL : vec3(0.0, 0.0, 1.0);
  float radius = uRadius;
  float occ = 0.0;
  if (uStrength > 0.0) {
    float scr = clamp(radius / max(-P.z, 1.0) * 0.9, 0.004, 0.05);
    // Per-pixel rotation to turn banding into noise.
    float a = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
    float ca = cos(a), sa = sin(a);
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
  }
  float ao = 1.0 - clamp(occ / 8.0 * 2.4, 0.0, 1.0) * uStrength;

  if (uContact > 0.0 && uSunVS.z < 0.05) {     // sun at/in front of the camera plane
    float sh = 1.0;
    for (int i = 1; i <= 5; i++) {   // contact-shadow march 8→5
      vec3 q = P + uSunVS * (0.04 * float(i));   // up to ~0.32 m toward the sun
      vec4 cp = uProj * vec4(q, 1.0);
      vec2 quv = cp.xy / cp.w * 0.5 + 0.5;
      if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) break;
      vec3 B = viewPos(quv);                     // blocker view position
      float dz = B.z - q.z;                       // >0: surface is in front of the ray
      float above = dot(N, B - P);
      float aboveBias = 0.05 + 0.01 * max(-P.z - 6.0, 0.0);
      if (dz > 0.015 && dz < 0.5 && above > aboveBias) { sh = 1.0 - uContact; break; }
    }
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
  // Half-res, added to the scene before TONEMAP — but NOT before BLOOM, which this
  // line used to claim. present() runs the bright pass off sceneTex (glx/post.js,
  // "bindTexture(gl.TEXTURE_2D, sceneTex)" under useProg(brightProg)) and only then
  // runs the composite, where the god-ray buffer is added. The bright pass therefore
  // never sees these shafts, so they cannot halo — the shaft term is flat additive
  // haze. Same for the SSR substitution and the uExposure multiply, both of which
  // also land in the composite; see the SSR note further down.
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
// 6, not 12: the beam march below is the ONLY consumer of these arrays and it
// has walked 6 since the nested-loop cost cut. The extra 6 slots were uploaded
// every frame with nothing reading them, and they were worse than free — the
// CPU picked the shadow-mapped lamp's slot out of a 12-long ordering, so a lamp
// that sorted 7th-12th got an index the march can never equal and its beam
// shadow vanished. One bound, one meaning.
#define GR_MAX_LIGHTS 6
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
uniform sampler2DShadow uLampShadowMap;
uniform mat4 uLampShadowVP;
uniform int uLampShadowIdx;
out vec4 outColor;
vec3 worldPos(vec2 uv, float d) {
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 w = uInvVP * c;
  return w.xyz / w.w;
}
${GLXChunks.surfaceNoise}
${GLXChunks.ignoise}
float gCloudFBM(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+1.7; a*=0.5; } return s; }  // 4→3 octaves
float gCloud(vec3 wp){
  if (uCloudCover <= 0.001 || uSunDir.y <= 0.06) return 0.0;
  float t = (360.0 - wp.y) / max(uSunDir.y, 0.15);
  float cT = uTime * uCloudSpeed;   // lockstep with SKY/LIT cloud drift
  vec2 cp = (wp.xz + uSunDir.xz * t) * 0.0052 + vec2(cT * 0.012, cT * 0.005);
  return smoothstep(0.54 - uCloudCover * 0.40, 0.92, gCloudFBM(cp)) * uCloudCover;
}
void main() {
  float d = texture(uDepth, vUV).r;
  // End point: scene hit, or (for sky) a far point along the view ray.
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
  float ign = ignoise(gl_FragCoord.xy);
  float t = stepLen * ign;
  float accum = 0.0;
  vec3 lampAccum = vec3(0.0);
  float trans = 1.0;
  float groundY = uEye.y - 4.0;               // local ground datum
  for (int i = 0; i < N; i++) {
    float td = t + stepLen * float(i);        // distance marched from the camera
    vec3 p = ro + rd * td;
    trans *= exp(-stepLen * 0.010);
    if (uStr > 0.0) {
      float hSun = exp(-max(p.y - groundY, 0.0) * 0.03);   // sun shafts reach higher
      vec4 lc = uLightVP * vec4(p, 1.0);
      vec3 sc = lc.xyz / lc.w * 0.5 + 0.5;
      float lit = 1.0;
      if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0)
        lit = texture(uShadowMap, vec3(sc.xy, sc.z - 0.002));
      lit *= 1.0 - gCloud(p) * 0.62;  // clouds break the shafts into SOFT crepuscular bands (0.9 made thin stripes)
      accum += lit * hSun * trans;
    }
    if (uLampStr > 0.0 && td < 200.0) {
      float hLamp = exp(-max(p.y - groundY, 0.0) * 0.07);
      for (int li = 0; li < GR_MAX_LIGHTS; li++) {   // nearest-6 lamps for beams (was 12) — nearest-sorted
        if (li >= uNumLights) break;
        vec3 LP = uLightPos[li] - p;
        float rad = uLightRad[li];
        float ld2 = dot(LP, LP);
        if (ld2 > rad * rad) continue;
        float ld = sqrt(ld2);
        vec3 Ld = LP / max(ld, 1e-3);
        float s = ld / rad;
        float win = clamp(1.0 - s*s*s*s, 0.0, 1.0);
        float att = win * win / (ld * ld + 1.0);
        float cd = dot(-Ld, uLightDir[li]);
        float spot = smoothstep(uLightCone[li].y, uLightCone[li].x, cd);
        float cosL = max(dot(rd, Ld), 0.0);                          // forward scatter
        float hgLd = 1.36 - 1.2 * cosL;                              // HG g=0.6; d >= 0.16, sqrt safe
        float hgL = (1.0 - 0.36) / (hgLd * sqrt(hgLd));              // == pow(d, 1.5) minus the transcendental
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
  float cosT = max(dot(rd, uSunDir), 0.0);
  float g = clamp(uHgAniso, 0.0, 0.95);
  float hgD = 1.0 + g * g - 2.0 * g * cosT;   // >= (1-g)^2 > 0 at the clamp, sqrt safe
  float hg = (1.0 - g * g) / (hgD * sqrt(hgD));   // == pow(d, 1.5) minus the transcendental
  float phase = hg * 0.16 + uHgFloor;
  outColor = vec4(uSunColor * accum * phase * uStr + lampAccum, 1.0);
}`;

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
uniform float uHdrGradeOn;   // 1 only when any lift/gamma/gain/tone knob is off-neutral (skips the block)
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
uniform float uSsrTopUV;     // top-of-screen SSR cutoff (def 0.62). The upper screen
                             //   is "never wet road" ONLY for a high, down-looking
                             //   chase eye; a low onboard eye (cockpit/hood) pushes the
                             //   road far higher up the frame, so game.js raises this
                             //   for those cams or the top half of the wet road gets no
                             //   reflection and the band-edge sweeps as the car pitches.
uniform float uSsrNear;      // near edge of the SSR road fade in view Z (def -2.5; the
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
uniform float uShaftSpread;  // how far the shafts reach (1 = shipped radius)
uniform float uFlareStreak;  // anamorphic flare horizontal tightness (def 7.0)
uniform float uFlareStreak2; // second thin hot-core flare streak strength (def 0.5)
out vec4 outColor;

// Reconstruct view-space position from the depth buffer at a screen UV.
vec3 ssrViewPos(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;     // window depth → NDC z
  vec4 cp = uInvProj * vec4(uv * 2.0 - 1.0, d, 1.0);
  return cp.xyz / cp.w;
}

vec3 caScene(vec2 uv) {
  if (uChromAb <= 0.001) return texture(uScene, uv).rgb;
  vec2 d = uv - 0.5;
  float a = uChromAb * 0.004 * dot(d, d);
  return vec3(texture(uScene, uv + d * a).r, texture(uScene, uv).g, texture(uScene, uv - d * a).b);
}

// Five overlapping exposure masks in log2 stops around 18% middle grey.
void gradeZoneWeights(float y, out vec4 w0, out float wWhite) {
  float z = log2(max(y, 1e-6) / 0.18);
  w0.x = 1.0 - smoothstep(-4.0, -0.75, z);
  w0.y = smoothstep(-4.0, -1.5, z) * (1.0 - smoothstep(-1.0, 0.75, z));
  w0.z = smoothstep(-2.5, -0.5, z) * (1.0 - smoothstep(0.5, 2.5, z));
  w0.w = smoothstep(0.0, 1.5, z) * (1.0 - smoothstep(3.0, 5.0, z));
  wWhite = smoothstep(2.5, 5.0, z);
}

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
  vec4 toneGain = uTone0 * vec4(3.0, 2.0, 1.0, 1.0);
  float stops = dot(w0, toneGain) + wWhite * uTone1.x;
  c *= exp2(clamp(stops, -4.0, 4.0));
  // Additive low-end offset for BLACKS/SHADOWS. A multiply can never move a
  // near-black pixel (x*0 stays 0), which is exactly why BLACKS "did nothing" on
  // dark night/dusk scenes. A small signed additive lift, weighted to the black
  // and shadow zones, is what actually reveals near-black detail (+) or crushes
  // it to a true black (-) — the DaVinci-style Lift the labels describe. Neutral
  // (0) adds nothing, so identity is preserved; the clamp keeps blacks solid.
  c += w0.x * uTone0.x * 0.05 + w0.y * uTone0.y * 0.025;
  c = max(c, vec3(0.0));

  c = applyToeShoulder(c, uTone1.y, uTone1.z);
  return max(c, vec3(0.0));
}

${GLXChunks.ignoise}
${GLXChunks.tonemap}
vec3 colourGrade(vec3 c) {
  // Gain (per-channel linear scale in highlights)
  c *= vec3(1.015, 1.008, 0.992);
  // Soft S-curve: deepen contrast for punch (less washed-out / flat)
  c = c * (1.0 + c * 0.13) / (1.0 + c * 0.20);
  c = pow(c, vec3(uContrast));
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float sat = mx - mn;
  c = mix(vec3(luma), c, 1.0 + (1.0 - clamp(sat * 1.5, 0.0, 1.0)) * uVibrance);
  // Global saturation (uniform, after vibrance): a plain luma<->colour lerp.
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSaturation);
  c *= vec3(1.0 + 0.07 * uTint, 1.0, 1.0 - 0.07 * uTint);
  float gl2 = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 toneTint = mix(uGradeShadow, uGradeHi, smoothstep(0.0, 0.85, gl2));
  c = mix(c, c * toneTint, uGradeStr);
  c = max(c, vec3(uBlackLift, uBlackLift * 0.8, uBlackLift * 0.6));
  return c;
}

void main() {
  vec2 hazeUV = vUV;
  if (uHazeStr > 0.002) {
    // SCREEN-SPACE TEST FIRST, TEXTURE FETCH SECOND. The two conditions are
    // independent and ANDed, so the order is free to choose — and the plume
    // test is a varying against a uniform while carHere is a full-res dependent
    // fetch of uScene. The Gaussian is tight: at uHazeStr ~ 1 it needs
    // dot(hd,hd) < ln(333)/70 = 0.083, an ellipse of UV semi-axes 0.09 x 0.288,
    // about 8% of the frame. So 92% of pixels were paying a dependent fetch to
    // learn they are nowhere near the exhaust. exp + dot is far cheaper.
    // Bit-identical by construction, and verbatim the vUV.y < uSsrTopUV reorder
    // already taken one gate over in this same file — never copied across.
    vec2 hd = (vUV - uHazeUV - vec2(0.0, 0.08)) * vec2(3.2, 1.0);   // tall plume, centred above the pipe
    float hm = exp(-dot(hd, hd) * 70.0) * uHazeStr;
    if (hm > 0.003) {
      float carHere = 1.0 - smoothstep(0.42, 0.55, texture(uScene, vUV).a);
      if (carHere < 0.25) {
        float hp = vUV.y * 90.0 - uHazeTime * 11.0;
        hazeUV += vec2(sin(hp + vUV.x * 70.0), cos(hp * 0.63)) * (0.0075 * hm);
      }
    }
  }
  vec4 scn = texture(uScene, hazeUV);   // one fetch: .rgb colour + .a SSR car tag
  vec3 c = scn.rgb;
  vec2 caDir = vUV - 0.5;

  if (uChromAb > 0.001) {
    float caAmt = uChromAb * 0.004 * dot(caDir, caDir);
    c.r = texture(uScene, hazeUV + caDir * caAmt).r;
    c.b = texture(uScene, hazeUV - caDir * caAmt).b;
  }

  if (uSpeedBlur > 0.001) {
    vec3 acc = c; float wsum = 1.0;
    for (int i = 1; i <= 4; i++) {
      float t = float(i) / 4.0 * uSpeedBlur * 0.05;
      acc += caScene(vUV - caDir * t);   // caScene carries CA so the two don't cancel
      wsum += 1.0;
    }
    c = acc / wsum;
  }

  if (uSharpen > 0.001) {
    vec3 bl = (caScene(vUV + vec2(uReflTexel.x, 0.0))
             + caScene(vUV - vec2(uReflTexel.x, 0.0))
             + caScene(vUV + vec2(0.0, uReflTexel.y))
             + caScene(vUV - vec2(0.0, uReflTexel.y))) * 0.25;
    c += (c - bl) * uSharpen * 0.9;
  }

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
  // TWO EXACT CHANGES TO THIS GATE, both about paying before rejecting.
  //
  // 1. 'carPx > 0.3' gained '&& uCarReflect > 0.001'. The outer gate never
  //    consulted uCarReflect, so with the CAR reflection slider at zero every
  //    car-paint pixel still reconstructed P, ran 3 ssrViewPos, a cross, a
  //    normalize and both masks before 'ssrGate > 0.001' (line 825) threw it
  //    away. Exactly equivalent: ssrGate is max(roadMask*uReflect,
  //    carMask*uCarReflect), and both masks are products of smoothstep()s and
  //    carPx so both lie in [0,1] — hence if uReflect <= 0.001 (the only way
  //    this operand is reached) and uCarReflect <= 0.001, ssrGate <= 0.001 and
  //    the inner block was already skipped.
  //
  // 2. The free varying compare now precedes the depth fetch. GLSL ES 3.00 §5.9
  //    gives && short-circuit semantics, so operand order IS cost order, and
  //    'vUV.y < uSsrTopUV' (a varying against a uniform) was sitting behind a
  //    full-res dependent texture(uDepth). uSsrTopUV is 0.62 chase / 0.82
  //    onboard, so that is 38% / 18% of full-res pixels each dropping one
  //    discarded fetch on a wet frame. Both operands are pure and side-effect
  //    free, so the swap is exact.
  if (uSsrOk > 0.5 && (uReflect > 0.001 || (carPx > 0.3 && uCarReflect > 0.001))
      && vUV.y < uSsrTopUV && texture(uDepth, vUV).r < 0.9999) {
    vec3 P = ssrViewPos(vUV);
    vec2 nT = uReflTexel * 3.0;
    vec3 dpx = ssrViewPos(vUV + vec2(nT.x, 0.0)) - P;
    vec3 dpy = ssrViewPos(vUV + vec2(0.0, nT.y)) - P;
    vec3 crv = cross(dpx, dpy);
    float crvL = length(crv);
    vec3 upVSn = normalize(uUpVS);
    // ...but crvL > 1e-6 is an ABSOLUTE magnitude, and that is the wrong test.
    // crvL scales with |dpx|·|dpy|, and at grazing distance those derivatives span
    // METRES — so the cross product stays large while its DIRECTION is pure depth
    // quantization noise. The guard therefore almost never fired where it was
    // needed: measured on a wet straight from the cockpit, upDot collapsed and
    // smoothstep(0.25, 0.55, upDot) zeroed the road mask across everything past
    // the first few metres, leaving a narrow glossy strip in front of the car and
    // matte tarmac for the rest of the frame. Test the CONDITIONING instead — the
    // sine of the angle between the two derivatives, which is scale-free — so the
    // fallback fires exactly when the basis is degenerate, at any distance.
    float sinT = crvL / max(length(dpx) * length(dpy), 1e-12);
    vec3 Nv = (crvL > 1e-6 && sinT > 0.08) ? crv / crvL : upVSn;
    if (Nv.z < 0.0) Nv = -Nv;                     // face the eye (view space looks down -z)
    // ...and THAT flip is what actually killed the wet road. A ground normal seen
    // at grazing incidence is world-up, whose view-space z is ~0 — so "face the
    // eye" picks its sign off a near-zero component, i.e. essentially at random,
    // and with the camera pitched up (an uphill, or just the cockpit's look-ahead)
    // it lands DOWNWARD. upDot then reads -1, smoothstep(0.25, 0.55, upDot)
    // returns 0, and the road mask collapses across everything past the first few
    // metres: a narrow glossy strip in front of the car, matte tarmac for the rest
    // of the frame, and a hard line where the sign flips. MEASURED by rendering
    // the three roadMask gates to RGB — the road came back cyan (upDot gate 0)
    // beyond one white band.
    //
    // Alignment with up is a DOUBLE-SIDED property of a plane, so don't decide it
    // from a coin-toss component: re-orient a clearly ground-facing normal upward.
    // Walls sit at |dot| ~ 0.0-0.1, well inside the dead band, so the road-vs-wall
    // classification this mask exists for is untouched. Nv itself is re-oriented
    // (not just upDot) so the flattened reflection normal Nr and the car mask stay
    // consistent with it.
    if (dot(Nv, upVSn) < -0.25) Nv = -Nv;
    float upDot = dot(Nv, upVSn);
    // Up-facing AND not the very-near cockpit (z near 0). P.z is negative ahead.
    // Fade out the far field: depth precision + coarse march steps there breed
    // speckle, and reflections compress to nothing near the horizon anyway — so
    // keep the clean, high-impact foreground and taper the distance out. The
    // fade end is pushed out (-55 → -78) so the taper spreads across more screen
    // rows near the cockpit horizon instead of compressing into a visible band.
    // Relaxed up-facing test (was 0.40..0.75): with the road's reflection ray
    // now built from the flattened plane, upDot only has to separate ROAD from
    // WALLS — and walls sit at upDot ≈ 0.0-0.1, nowhere near 0.25. The old 0.40
    // edge (already scraped by banked corners per LIGHTING-KNOBS) meant a noisy
    // grazing-angle normal could drop genuine road below threshold — the other
    // half of the patchy/dropout mask failure at phone resolution.
    float roadMask = smoothstep(0.25, 0.55, upDot)
                   * smoothstep(uSsrNear, uSsrNear * 2.8, P.z)
                   * (1.0 - smoothstep(-22.0, -78.0, P.z));
    float carMask = carPx * smoothstep(0.30, 0.65, upDot)
                  * smoothstep(-1.0, -3.0, P.z)
                  * (1.0 - smoothstep(-22.0, -55.0, P.z));
    float edgeGrad = (length(dpx) + length(dpy)) * (1.0 / 3.0);
    carMask *= 1.0 - smoothstep(0.35, 0.9, edgeGrad);
    float roadTerm = roadMask * uReflect;
    float carTerm  = carMask  * uCarReflect;
    float ssrGate  = max(roadTerm, carTerm);
    if (ssrGate > 0.001) {
      bool carDom = carTerm > roadTerm;   // hoisted: the march needs it too
      vec3 V = normalize(-P);
      // The ROAD reflects off a near-FLAT plane, not its bumpy per-pixel normal.
      // Nv is reconstructed from depth derivatives, so it picks up the road's
      // facets / undulation / micro-relief — and reflecting off that bumpy normal
      // scatters the reflected ray, so the march hits on-screen scenery in some
      // pixels and shoots off-screen (miss) in others. That is the "patchy, shifts
      // as I drive" wet road: the reflective/matte split wanders with the bumps and
      // the camera. Reflecting off the smooth road plane keeps every road pixel's
      // ray coherent → one continuous, stable reflection that still mirrors the
      // real scene. Car paint keeps its true normal (curved bodywork needs it).
      // 0.85 toward flat: kills the bump scatter while retaining a little real
      // slope/bank response.
      //
      // upVSn is the ROAD's normal, not world-up (game.js builds it from r × t).
      // That distinction is the whole elevation story: flattening onto world-up
      // put this normal a full gradient-angle off the surface it is meant to
      // approximate, the reflect() doubled it, and on any real climb the ray left
      // at an angle the road never had.
      vec3 Nr = (carTerm > roadTerm) ? Nv : normalize(mix(Nv, upVSn, 0.85));
      vec3 R = reflect(-V, Nr);                    // points up toward the city
      float ign = ignoise(gl_FragCoord.xy);
      vec3 pos = P, prevPos = P;
      float stepLen = 0.55;
      pos += R * (stepLen * ign);                  // sub-step start offset per pixel
      float hit = 0.0;
      float hitDist = 0.0;                       // march distance to the hit (contact hardening)
      vec2 hitUV = vec2(0.0);
      bool found = false;
      for (int i = 0; i < 24; i++) {
        prevPos = pos;
        pos += R * stepLen;
        stepLen *= 1.16;                           // gentle growth
        vec4 cp = uProj * vec4(pos, 1.0);
        if (cp.w <= 0.0) break;
        vec2 suv = cp.xy / cp.w * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
        float dz = ssrViewPos(suv).z - pos.z;      // >0 = ray passed behind a surface
        // SSR THICKNESS gate. The far-sky reject window must scale with the
        // current step: late steps span many metres, so a fixed 5 m ceiling
        // rejected legitimate hits mid-distance — the other source of the
        // striped hit/miss alternation on strongly reflective roads.
        if (dz > uSsrThick && dz < max(5.0, stepLen * 1.5)) {
          vec3 a = prevPos, b = pos;               // binary-search refine → crisp hit
          for (int j = 0; j < 4; j++) {
            vec3 mid = (a + b) * 0.5;
            vec4 mc = uProj * vec4(mid, 1.0);
            vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
            if (ssrViewPos(muv).z - mid.z > 0.20) b = mid; else a = mid;
          }
          vec4 fc = uProj * vec4(b, 1.0);
          vec2 huv = fc.xy / fc.w * 0.5 + 0.5;
          // GRAZING SELF-REFLECTION REJECT. From a low onboard eye the reflected
          // ray leaves the tarmac at the same shallow angle the view ray arrived,
          // so it skims a metre above the road for tens of metres — and the march
          // lands on the ROAD ITSELF a short way ahead (measured: the whole
          // mid-frame band of a wet straight mirrors wet-darkened asphalt). The
          // wet mirror then fills with tarmac, reads MATTE, and butts against the
          // analytic sky mirror beside it as a hard-edged patch. Physically a
          // rough wet surface contributes almost nothing to its own grazing
          // reflection, so reject a hit whose surface faces the same way the
          // reflector does and keep marching — the ray climbs and may still find
          // a barrier, car or tree. Normals are reconstructed on the same 3-texel
          // baseline as Nv, and the eye-facing flip keeps the up/down distinction
          // (a roof UNDERSIDE reads down-facing, so real overheads still mirror).
          if (!carDom) {
            vec3 hP  = ssrViewPos(huv);
            vec3 hdx = ssrViewPos(huv + vec2(nT.x, 0.0)) - hP;
            vec3 hdy = ssrViewPos(huv + vec2(0.0, nT.y)) - hP;
            vec3 hcr = cross(hdx, hdy);
            float hcl = length(hcr);
            vec3 hN  = hcl > 1e-6 ? hcr / hcl : upVSn;
            if (hN.z < 0.0) hN = -hN;
            if (dot(hN, upVSn) > 0.55) continue;
          }
          hitUV = huv;
          hitDist = length(b - P);
          vec2 e = abs(hitUV - 0.5) * 2.0;
          hit = 1.0 - pow(max(e.x, e.y), 4.0);     // screen-edge fade
          found = true;
          break;
        }
      }
      vec3 hitCol = vec3(0.0);
      if (found) {
        float carSoft = clamp((1.4 - uCarGloss) * 0.5, 0.0, 1.0);
        float streak = (carTerm > roadTerm)
          ? uCarReflect * (0.006 + 0.030 * carSoft)
          : uReflect * (0.010 + 0.022 * clamp((uSsrTopUV - vUV.y) / uSsrTopUV, 0.0, 1.0));
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
      // ...but "up-ness" is measured against the surface, and R.y is the ray's
      // VIEW-space y — those only agree while the camera is level. In the cockpit
      // the view pitches with the road, so on a climb or a dip R.y drifted off the
      // real up axis and the fallback picked horizon-vs-zenith from the wrong one:
      // the miss regions took a sky colour that did not belong to the direction
      // they were reflecting. Now that a miss substitutes at the same cover as a
      // hit, that error is fully visible, so measure against the road plane.
      vec3 skyRefl = mix(uReflSkyHi, uReflSkyLo, clamp(dot(R, upVSn), 0.0, 1.0));
      float conf = found ? clamp(hit, 0.0, 1.0) : 0.0;
      vec3 reflCol = mix(skyRefl, hitCol, conf);
      // SPECULAR OCCLUSION: the diffuse AO above never touched the reflection
      // terms, so a mirrored wet road / glossy deck inside an occluded crease
      // (under the car, wheel wells, barrier feet) still GLOWED with reflected
      // scene/sky — bright streaks exactly where the surface should be buried.
      // Lagarde-style ao² (specular visibility shrinks faster than diffuse)
      // on the reflected colour keeps open road untouched (ao ≈ 1) while
      // creases keep their darkness through the mirror substitution.
      reflCol *= aoV * aoV;
      reflCol = reflCol / (1.0 + reflCol * 0.35);
      // SSR changes WHAT the wet road mirrors, never HOW MUCH it mirrors.
      //
      // The march hits in some screen regions and misses in others — from a low
      // grazing onboard eye it alternates over a few pixels (each mirrored tree
      // is a hit, the sky between them a miss). Scaling the SUBSTITUTION by that
      // boolean turned a difference in reflected CONTENT into a difference in
      // SURFACE: hit pixels took a near-full mirror, miss pixels a third of one,
      // so the tarmac broke into reflective-vs-matte patches with hard edges.
      // Cover 1.0-vs-0.30 (and 1.0-vs-1.0 before build 734) both did this; the
      // ratio only set how obvious it was.
      //
      // The lit shader already carries the coherent base — envBlend is floored
      // at wetSheen*0.55 (lit.js) expressly so the analytic sky mirror gives the
      // wet look wherever the march misses. So hold the road's cover CONSTANT and
      // let only reflCol vary: hits show the marched scene, misses the sky, both
      // through the same amount of mirror. Car paint keeps its confidence-scaled
      // cover — it falls through to the lit shader's env mirror on a miss, which
      // is already continuous because the env cube covers every direction.
      float cover  = carDom ? conf : 0.60;
      float fres = pow(1.0 - max(dot(Nr, V), 0.0), 3.0);
      // Car SSR reflects the on-screen HDR scene — sharp, bright light sources
      // (neon, lit windows, floodlights) that punch through. They do NOT bloom,
      // which this line used to claim: the substitution below happens in the
      // COMPOSITE, and the bright pass has already sampled sceneTex by then. It is
      // doubly unreachable anyway — reflCol is soft-clipped to ~2.86 and mixAmt caps
      // at 0.80, so the result could not pass the bright threshold even if the order
      // allowed it. Strong face-on (the env cube owns the off-screen/
      // sky read; SSR owns the crisp on-screen lights + nearby geometry).
      float strength = ssrGate * (carDom ? (0.50 + 0.45 * fres)
                                         : (0.55 + 0.42 * fres));
      float gateSrc = carDom ? uCarReflect : uReflect;
      strength *= min(gateSrc / 0.20, 1.0);
      // The whole SSR branch above is gated by a HARD "vUV.y < uSsrTopUV" cutoff
      // (a cheap early-out — for a high chase eye the upper screen is sky, never
      // wet road/car paint; a low onboard eye raises uSsrTopUV since the road
      // climbs higher up the frame). That boolean gate is a step function:
      // reflected pixels just below the line are full-strength, pixels just above
      // get none, so any noticeable difference between the mirrored colour and the
      // base scene shows as a visible seam slicing across the frame. Fade the last
      // few percent out instead of cutting it off.
      strength *= 1.0 - smoothstep(uSsrTopUV - 0.06, uSsrTopUV, vUV.y);
      float mixAmt = clamp(strength * cover, 0.0, carDom ? 0.85 : 0.80);   // road cap 0.94→0.80: keep more of the reflective lit base under a HIT so hit vs miss regions share the same wet look (less patchy), car unchanged
      vec3 mirrored = carDom ? c * 0.22 + reflCol * 0.88
                             : c * 0.10 + reflCol * 0.92;
      c = mix(c, mirrored, mixAmt);
    }
  }

  // Exposure multiply before tone-mapping (default 1.0 = no change).
  c *= uExposure;

  vec3 bloomSample = texture(uBloom, vUV).rgb;
  float bloomMask = 1.0 - clamp(max(c.r, max(c.g, c.b)) - 0.7, 0.0, 0.3) / 0.3 * uBloomKnee;
  c += bloomSample * uBloomAmt * bloomMask * uExposure;

  float dirt = 0.0;
  if (uLensDirt > 0.001) {
    dirt = texture(uDirt, vUV).r;
    c += bloomSample * uExposure * dirt * uLensDirt * 2.2;
  }

  if (uSunShaft > 0.0) {
    vec2 toSun = uSunUV - vUV;
    float dist = length(toSun);
    // Only cast rays when we're not right on top of the sun (avoid div-zero).
    if (dist > 0.005) {
      vec2 step = toSun / dist * min(dist, 0.40) / 8.0;
      vec3 shaft = vec3(0.0);
      float ign = ignoise(gl_FragCoord.xy);
      vec2 uv = vUV + step * ign;
      float decay = 1.0;
      for (int i = 0; i < 8; i++) {
        uv += step;
        // Clamp so we don't sample outside 0..1 (avoids edge bleed).
        vec2 suv = clamp(uv, vec2(0.0), vec2(1.0));
        // Crepuscular rays emanate from the SUN'S OWN glare. Weight each sample
        // by its proximity to the sun so an isolated bright lamp head or cloud
        // hotspot elsewhere on screen can never smear into a comet streak.
        // The proximity weight exists to stop an isolated bright lamp head
        // smearing into a comet; it is NOT meant to cap how far the sun's own
        // rays reach. It used to be a fixed 0.32 radius, and the radial term
        // below a fixed 2.6, so SCREEN SUN-SHAFT could only brighten a small
        // fixed disc around the disc — MEASURED, pushing the knob 1 -> 4 with the
        // sun centred moved the image by 2.30/255 while the volumetric god-ray
        // knob moved it 12.77. The knob had intensity authority and no reach
        // authority, which is what "this slider does nothing" feels like.
        // Let a turned-up knob EXTEND the rays as well as brighten them, while
        // the shipped value keeps the shipped radius.
        float reach = 0.32 * uShaftSpread;
        float sw = 1.0 - clamp(length(suv - uSunUV) / reach, 0.0, 1.0);
        shaft += texture(uBloom, suv).rgb * (decay * sw * sw);
        decay *= uShaftDecay;   // SUN-SHAFT REACH knob (def 0.82 = as-shipped)
      }
      shaft /= 8.0;
      // Radial falloff: strongest near the sun, zero at the edge of the screen.
      float radial = 1.0 - clamp(dist * (2.6 / uShaftSpread), 0.0, 1.0);
      c += shaft * uSunShaft * radial * radial * 0.60;
    }
  }

  if (uHdrGradeOn > 0.5) c = applyHdrGrade(c);

  c = acesTonemap(c / uWhitePoint);
  c = colourGrade(c);

  // Lens flare: anamorphic streak + ghost circles
  vec3 flare = vec3(0.0);
  float sunVis = (uFlareStr > 0.0 && uSunUV.x >= 0.0 && uSunUV.x <= 1.0 && uSunUV.y >= 0.0 && uSunUV.y <= 1.0)
               ? smoothstep(0.9990, 0.9999, texture(uDepth, uSunUV).r) : 0.0;
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

    flare *= uFlareStr * sunVis;
    if (uLensDirt > 0.001) flare *= mix(1.0, 0.35 + dirt * 2.2, clamp(uLensDirt * 2.0, 0.0, 0.85));
    flare = flare / (1.0 + flare * 0.6);
  }
  c += flare;

  vec2 q = vUV - 0.5;
  float vAspect = uReflTexel.x > 0.0 ? uReflTexel.y / uReflTexel.x : 1.0;   // width/height
  q.x *= vAspect;
  float vr = length(q) * 0.70710678 / length(vec2(0.5 * vAspect, 0.5));
  // uVigSoft (VIGNETTE REACH) is the inner edge: lower = broad soft gradient
  // reaching toward centre, higher = a thin ring hugging the corners.
  // OUTER EDGE IS THE CORNER, NOT 0.95. vr is normalised by the corner length,
  // so it is exactly 0.70710678 at all four corners for EVERY aspect ratio
  // (measured 1920x1080, 2160x1000, 1000x1000, 800x1600 — all identical). The
  // old form was smoothstep(0.95, min(uVigSoft, 0.94), vr): edge0 > edge1, which
  // GLSL ES 3.00 SS8.3 leaves undefined, and whose ramp the frame could never
  // finish walking — the corner topped out at vig 0.198 (REACH min) to 0.972
  // (REACH max), so VIGNETTE could not reach the "pure black corners" its help
  // promises and REACH swung corner darkening 28x instead of pairing with it.
  // Well-ordered now, and the corner lands on uVignette exactly.
  float vig = 1.0 - smoothstep(min(uVigSoft, 0.69), 0.70710678, vr);
  c *= mix(uVignette, 1.0, vig);

  vec2 dc = gl_FragCoord.xy + 5.588238 * mod(floor(uGrainTime * 60.0), 64.0);
  float d0 = ignoise(dc);
  float d1 = fract(52.9829189 * fract(dot(dc + 17.31, vec2(0.00583715, 0.06711056))));
  c += (d0 + d1 - 1.0) / 255.0;
  if (uGrain > 0.001) {
    vec2 gUV = vUV + vec2(fract(uGrainTime * 1.37), fract(uGrainTime * 0.61)) * 3.17;
    float gn = fract(sin(dot(gUV, vec2(93.9898, 47.233))) * 61237.312) - 0.5;
    float gLuma = dot(c, vec3(0.299, 0.587, 0.114));
    c += gn * uGrain * (1.0 - abs(gLuma - 0.5) * 1.4);
  }
  outColor = vec4(c, 1.0);
}`;

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
  // Sun/lamp shadow depth pass. Mirrors LIT_VS's instancing gate so instanced
  // scenery CASTS shadows: without it an instanced prop would light correctly and
  // then drop no shadow, which reads as a floating object rather than a bug.
  // Locations 5-8 are the same four instance-matrix columns LIT_VS declares, and
  // uInstanced defaults to 0 so every existing caller is byte-identical.
  const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=5) in vec4 aInst0;
layout(location=6) in vec4 aInst1;
layout(location=7) in vec4 aInst2;
layout(location=8) in vec4 aInst3;
uniform float uInstanced;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() {
  mat4 M = uInstanced > 0.5 ? mat4(aInst0, aInst1, aInst2, aInst3) : uModel;
  gl_Position = uLightVP * M * vec4(aPos, 1.0);
}`;

  const DEPTH_FS = `#version 300 es
void main() {}`;

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
  window.GLXShaders = Object.assign(window.GLXShaders || {}, { POST_VS, BRIGHT_FS, BLUR_FS, DOWN_FS, UP_FS, SSAO_FS, GODRAY_FS, COMPOSITE_FS, FXAA_FS, DEPTH_VS, DEPTH_FS, BLOCKER_FS });
})();
