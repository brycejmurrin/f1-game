/*
 * Apex 26 — GLSL shader sources for the GLX WebGL2 renderer (js/glx.js).
 * Pure data: `#version 300 es` vertex/fragment shader strings. Split out of
 * glx.js so the renderer logic is readable; glx.js destructures GLXShaders at
 * module-eval time, so this file MUST load before js/glx.js (see index.html).
 * BLOCKER_FS (the PCSS-lite shadow blocker-search shader) stays inline in
 * glx.js near initShadowMap() — it's colocated with its one caller rather
 * than grouped here.
 */
"use strict";

const GLXShaders = (function () {
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
out vec3 vObjPos;
out float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vObjPos = aPos;                 // object space: paint flake/orange-peel pattern
  vNrm = mat3(uModel) * aNrm;     // is glued to the panels, not streaming in world.
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
in vec3 vObjPos;
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
uniform float uClearcoat;  // 0..1 automotive lacquer layer: 2nd low-rough specular lobe
uniform float uCarPaint;    // 0..1 car-paint model: duotone pigment + bounded silhouette rim
uniform float uWetness;     // 0..1 rain wetness (wet-road material + reflections)
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
// mirror game.js TUNE_DEFS; uploaded per frame from frame.tune in begin().
uniform float uBounceK;     // per-lamp bounce-fill strength (was literal 0.04)
uniform float uMistShare;   // ground-mist share of the lamp fog glow (was 1.5)
uniform float uLampFogClip; // lamp-fog Reinhard shoulder strength (was 0.7)
uniform float uGlowAmp;     // emissive HDR glow push (was literal 2.3)
uniform float uPcssPen;     // PCSS penumbra growth rate (was literal 80.0)
uniform float uKeyMul;      // direct sun/key-light intensity multiplier (default 1)
uniform float uTime;        // seconds (drives cloud-shadow drift)
uniform float uCloudCover;  // 0..1 cloud cover (drives cloud shadows)
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
// Cloud cover at a world point: project the point up the sun direction to the
// cloud deck and sample a drifting FBM — gives moving dappled cloud SHADOWS on
// the ground (the "volumetric shading"). 0 = full sun, 1 = fully shadowed.
float cloudFBM(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }  // 4→3 octaves (soft-thresholded, invisible)
  return s;
}
float cloudShadow(vec3 wp) {
  if (uCloudCover <= 0.001 || uSunDir.y <= 0.06) return 0.0;
  float cloudY = 360.0;
  float t = (cloudY - wp.y) / uSunDir.y;          // distance up the sun ray to the deck
  vec2 cp = (wp.xz + uSunDir.xz * t) * 0.0052 + vec2(uTime * 0.012, uTime * 0.005);
  float c = cloudFBM(cp);
  return smoothstep(0.54 - uCloudCover * 0.40, 0.92, c) * uCloudCover;
}

float sampleShadow(vec3 wpos) {
  vec4 lc = uLightVP * vec4(wpos, 1.0);
  vec3 sc = lc.xyz / lc.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z >= 1.0) return 1.0;
  float t = uShadowTexel;
  // Slope-scale bias: gentle base + steeper slope term reduces both acne and
  // peter-panning on angled surfaces (walls, banking kerbs). tan(acos(c)) done
  // as sqrt(1-c²)/c (same value, no trig).
  float cosTheta = clamp(dot(normalize(vNrm), uSunDir), 0.05, 1.0);
  float slopeBias = t * 1.5 * (sqrt(1.0 - cosTheta * cosTheta) / cosTheta);
  float z = sc.z - clamp(slopeBias, 0.0005, 0.004) - uShadowBias * 0.5;
  // Distance LOD: full 8-tap Poisson + PCSS-lite blocker search near the camera
  // (crisp tyre/kerb contact shadows), a cheap 4-tap disk on distant ground where
  // the shadow is small on screen. Halves shadow bandwidth over most of the frame.
  bool near = vDist < 55.0;
  float R = 3.0;
  if (near && uPcss > 0.5) {
    // PCSS-lite: blocker search scales the Poisson radius by the receiver-blocker
    // gap — crisp at the contact point, soft where the caster is far.
    float bt = 1.5 / 512.0;
    float zb = min(min(texture(uBlockerMap, sc.xy + vec2(-bt,  bt)).r,
                       texture(uBlockerMap, sc.xy + vec2( bt,  bt)).r),
                   min(texture(uBlockerMap, sc.xy + vec2(-bt, -bt)).r,
                       texture(uBlockerMap, sc.xy + vec2( bt, -bt)).r));
    float pen = clamp((z - zb) * uPcssPen, 0.0, 1.0);
    R = mix(1.5, 6.0, pen);
  }
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float ang = ign * 6.2831853;
  float cr = cos(ang), sr = sin(ang);
  mat2 rot = mat2(cr, -sr, sr, cr) * (t * R);
  // 4 taps always; 4 more only near the camera. Rotated per-pixel so the reduced
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
  return mix(1.0, sh, uShadowStr);
}

void main() {
  vec3 N = normalize(vNrm);
  // Micro-normal relief: perturb the normal with a two-scale noise gradient so
  // procedurally-textured ground (road/terrain, uDetail > 0) has real surface
  // bumps — sun glints, lamp speculars and reflections break up over the surface
  // instead of reading as one uniform polished sheet. Fades with distance (it
  // would alias to shimmer) and with wetness (the water film levels the surface).
  if (uDetail > 0.001) {
    float mnFade = clamp(1.0 - (vDist - 25.0) / 70.0, 0.0, 1.0) * (1.0 - uWetness * 0.75);
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
      N = normalize(N + (pT * pbx + pB * pby) * (0.7 * uCarPaint * pFade));
    }
  }
  vec3 V = normalize(uEye - vWorldPos);
  vec3 L = uSunDir;
  vec3 H = normalize(L + V);
  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 1e-4);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);

  vec3 albedo = vCol;
  // Car deck mirror, step 1 — the WET-ROAD recipe on the paint's up-facing
  // panels: the reflective film ABSORBS first (darkened pigment, energy
  // conserving) so the sky added below reads as a mirror on a dark gloss,
  // not a milky layer. Fresnel²-concentrated: strong at grazing deck angles
  // (chase camera), zero face-on; flanks keep pure livery colour.
  float carDeck = 0.0;
  if (uCarPaint > 0.001) {
    carDeck = smoothstep(0.55, 0.85, N.y) * pow(1.0 - NoV, 2.0) * uCarPaint;
    albedo *= 1.0 - carDeck * 0.38;   // slightly softened: the SSR world-mirror stacks on decks
  }
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
      float crack = (1.0 - smoothstep(0.015, 0.075, cr))
                  * smoothstep(0.40, 0.70, vnoise(wp * 0.11 + 7.7));
      albedo *= 1.0 - crack * 0.30 * crackFade * min(uDetail * 4.0, 1.0);
    }
    albedo = max(albedo, vec3(0.0));
  }
  float rough = clamp(uRoughness, 0.04, 1.0);
  // Repair patches read glossier: fold the patch mask into roughness (max
  // +-0.08) before the specular AA below widens it.
  if (uDetail > 0.0) rough = clamp(rough + (patchM - 0.5) * 0.16 * min(uDetail * 4.0, 1.0), 0.04, 1.0);
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
    // (not stark, so they don't read as flat dark blobs).
    albedo *= mix(1.0, 0.42, wet);
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
  float shadow = sampleShadow(vWorldPos) * (1.0 - cloudShadow(vWorldPos) * 0.80);
  // uKeyMul (KEY LIGHT tuner slider, default 1.0) scales all DIRECT sun lighting
  // — diffuse, GGX spec, clearcoat glint, car-paint glint — without touching
  // ambient fill, fog in-scatter or the env-sky reflection (those keep the
  // scene coherent when the key is dialled down).
  float litNoL = NoL * shadow * uKeyMul;

  // Base diffuse + ambient (== original lambert shader when uMetalness == 0).
  vec3 color = albedo * (amb + uSunColor * litNoL * (1.0 - uMetalness));

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
    float distC = max(dist, 4.0);
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
    float spotS = mix(mix(0.16, 0.30, wet), 1.0, beam);
    // Fog in-scatter: lamp irradiance reaching the fog column at this surface.
    // Windowed 1/d2 falloff (att) with a partial out-of-beam floor so the lens
    // glows the fog all around, brightest down the throw. Consumed by the fog
    // and ground-mist tints below - everything here is already computed.
    lampFog += uLightCol[i] * (att * mix(0.35, 1.0, beam));
    float NoLl = max(dot(N, Ld), 0.0);
    // Diffuse pool — fades as the road wets so a wet surface shows the lamp's
    // REFLECTION (SSR + the GGX lobe below), not a painted matte circle.
    color += albedo * uLightCol[i] * (att * spotD) * NoLl * (1.0 - uMetalness) * (1.0 - wet * 0.85);
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
    vec3 radianceS = uLightCol[i] * (att * spotS);
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
    vec3 ccCol = vec3(Dc * Vc * Fc) * uSunColor * NoLg * shadow * uClearcoat;
    ccCol = 2.6 * ccCol / (2.6 + ccCol);
    color += ccCol;
  }

  // Analytic clearcoat ENV mirror — the lacquer reflects a procedural sky in the
  // reflected view ray, on EVERY paint pixel including the vertical FLANKS (the
  // carDeck term below only mirrors up-facing decks; SSR can't reach flanks that
  // reflect off-screen). Strictly a dielectric-clearcoat SPECULAR add: weighted
  // by fresnel²·(1-rough) so it's ~0 face-on (livery reads pure) and mirror-like
  // at grazing/silhouette; NEVER multiplies or mixes albedo (that bleached the
  // paint before), and soft-clipped below the bloom threshold so it can't glare.
  if (uCarPaint > 0.001 && uClearcoat > 0.001) {
    vec3 Rg = reflect(-V, Ngeo);
    float NoVc = max(dot(Ngeo, V), 1e-4);
    float ccF = pow(1.0 - NoVc, 2.0);                       // fresnel², rim-concentrated
    float envW = uClearcoat * ccF * (1.0 - rough) * 0.55;
    // Hard-ish horizon line: bright sky above, dark ground tone below. The step
    // sweeping across the curved flanks as the car yaws is the "mirror" cue.
    float horiz = smoothstep(-0.03, 0.06, Rg.y);
    vec3 skyR = mix(uSkyHorizon * 1.2, uSkyZenith, pow(max(Rg.y, 0.0), 0.5));
    vec3 envCC = mix(uAmbGround * 0.6, skyR, horiz);
    envCC += uSunColor * pow(max(dot(Rg, uSunDir), 0.0), 400.0) * 12.0 * shadow;  // sun disc
    vec3 addCC = envCC * envW;
    color += addCC / (1.0 + addCC);                         // soft-clip < 1.0
  }

  // Metallic-flake SPARKLE — the signature "metallic paint" glitter. Each ~4.5 mm
  // object-space cell gets a random flake tilt; a flake flashes only when its
  // facet half-aligns with the sun (view-dependent, so the sparkle field shifts
  // as the camera moves). HDR gain so flashes bloom. Distance-faded to nothing so
  // it never aliases at range. Additive white glint — leaves the pigment alone.
  if (uCarPaint > 0.001 && litNoL > 0.0) {
    float spFade = clamp(1.0 - (vDist - 14.0) / 30.0, 0.0, 1.0);
    if (spFade > 0.01) {
      vec3 cell = floor(vObjPos * 220.0);
      float h1 = hash21(cell.xy + cell.z * 19.7);
      float h2 = hash21(cell.yz + cell.x * 7.3);
      vec3 fT = normalize(cross(Ngeo, vec3(0.0, 1.0, 0.001)) + vec3(1e-4));
      vec3 fB = cross(Ngeo, fT);
      vec3 gN = normalize(Ngeo + (fT * (h1 * 2.0 - 1.0) + fB * (h2 * 2.0 - 1.0)) * 0.5);
      float glint = smoothstep(0.965, 1.0, dot(gN, H));
      color += uSunColor * litNoL * glint * 3.0 * uCarPaint * spFade;
    }
  }

  // Car deck mirror, step 2 — the sky reflection over the darkened film,
  // soft-clipped exactly like the wet road so a bright sky can never blow
  // the deck to white. On the flat-shaded panels this resolves to one clean
  // mirror tone per deck facet.
  if (carDeck > 0.001) {
    float skyTd = pow(max(Rv.y, 0.0), 0.40);
    vec3 envD = mix(uSkyHorizon, uSkyZenith, skyTd);
    vec3 addD = envD * carDeck * 0.85;
    color += addD / (1.0 + addD);
  }

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
    float skyT = pow(max(R.y, 0.0), 0.40);
    // Tint env sample by sky gradient; also pick up a gentle sun-horizon blush
    // when the reflected direction aligns with the sun (warm chrome/paint sheen).
    vec3 envColor = mix(uSkyHorizon, uSkyZenith, skyT);
    float envSunAlign = max(dot(R, uSunDir), 0.0);
    envColor = mix(envColor, envColor * uSunColor * 1.15, envSunAlign * envSunAlign * (1.0 - rough));
    // (Wet-road sun-glitter removed — SSR now reflects the real sky/sun on wet roads.)
    // Dry glossy glass catches the sun too — a tighter, softer glint so day/dawn/dusk
    // windows flash where they face the sun. Gated (1-wet) so wet road is unchanged;
    // night sun is dim moonlight so this is naturally negligible after dark.
    envColor += uSunColor * pow(envSunAlign, 22.0) * (1.0 - wet) * envBlend * 0.6;
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
    float glow = smoothstep(0.50, 0.95, bright) * uEmissive;
    // Push the glow well PAST 1.0 (HDR) so lit windows / neon / lamp lenses read
    // as actual light SOURCES — they punch through the dark and bloom into halos,
    // instead of sitting as flat bright paint.
    // HDR push kept moderate (was 3.2): windows/heads GLOW, they don't glare —
    // the night energy budget lives or dies on this multiplier.
    color += albedo * glow * uGlowAmp;
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
  vec3 fogCol = mix(uFogColor, uSunColor, pow(sunAmount, 4.0));
  fogCol += uSunColor * pow(sunAmount, 16.0) * 0.6;
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
    float band = exp(-lowH * 0.30);
    vec2 mp = vWorldPos.xz * 0.020 + vec2(uTime * 0.010, uTime * 0.006);
    float dRamp = clamp((vDist - 8.0) / 45.0, 0.0, 1.0);
    float mist = uGroundMist * band * smoothstep(0.35, 0.72, cloudFBM(mp)) * dRamp;
    vec3 mistCol = mix(uFogColor, uSunColor, pow(sunAmount, 3.0)) + lampFogC * uMistShare;
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

  // Bright-DAY gate: 1 only when the sun is well up (≈25°+). Isolates day-only
  // sky enrichments (cumulus definition, horizon cloud-bank, gradient life) so
  // the dramatic dusk/dawn/night looks that share this shader are untouched.
  float daytime = smoothstep(0.35, 0.60, sunE);
  // TWILIGHT gate: ~1 at dawn/dusk (low sun above the horizon), 0 at deep night
  // and bright day. Drives extra sunset/sunrise cloud presence + warm grading.
  float twilight = smoothstep(0.02, 0.22, sunE) * (1.0 - daytime);

  // Overcast factor: drives grey-shift and corona damping under heavy cloud.
  float overcast = smoothstep(0.5, 1.0, uCloud);

  // --- Sky gradient ---
  vec3 c;
  if (up >= 0.0) {
    // Under heavy overcast, flatten zenith/horizon toward a uniform grey.
    vec3 zenithO  = mix(uZenith,  vec3(0.55, 0.56, 0.58), overcast * 0.75);
    vec3 horizonO = mix(uHorizon, vec3(0.58, 0.58, 0.60), overcast * 0.60);
    // pow(up, 0.35): richer blue zenith extends further down, horizon band
    // narrower — avoids the pale/washed look at mid-sky while keeping the
    // gradient smooth. (Was 0.5 which mapped too much sky to the horizon tint.)
    c = mix(horizonO, zenithO, pow(up, 0.35));
    // Day gradient LIFE: a deeper saturated blue pushed into the low/mid band
    // (so the gameplay sky strip isn't a flat pale wash) plus a faint azimuthal
    // variation that breaks the perfectly-smooth gradient. Day-only and faded
    // under overcast, so dusk/dawn/night and grey days are untouched.
    {
      float bandLM = (1.0 - smoothstep(0.06, 0.55, up)) * smoothstep(0.0, 0.06, up);
      vec3 deepBlue = vec3(0.10, 0.30, 0.72);
      c = mix(c, mix(c, deepBlue, 0.30), daytime * (1.0 - overcast) * bandLM);
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
  if (uCloud > 0.001 && up > 0.012) {
    vec2 cp = dir.xz / up * 0.42;
    // Drift offset: two independent slow vectors for parallax feel.
    vec2 drift1 = vec2(uTime * 0.0028, uTime * 0.0011);
    vec2 drift2 = vec2(uTime * 0.0017, uTime * 0.0023);
    // Evolution: a very slow warp of the second octave to change cloud shape.
    float evo = uTime * 0.00035;
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
      cov = mix(cov, max(cov, defined), cloudRich * 0.85);
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
    lit += uSunColor * silver * (1.3 + twilight * 1.6);
    // Twilight: a broad warm wash across the sun-facing cloud field (not just the
    // thin rim) so the whole sky catches fire at the magic hour.
    lit += uSunColor * pow(sd, 2.5) * twilight * 0.30 * (1.0 - overcast * 0.6);
    // Moon tints nearby clouds faintly blue-silver.
    if (uMoon > 0.0) {
      float moonLit = uMoon * cov * (1.0 - thick * 0.6) * 0.18;
      lit = mix(lit, lit + vec3(0.08, 0.10, 0.16), moonLit);
    }
    c = mix(c, lit, cov);
  }

  // --- Mie forward scatter: glow toward the sun, strongest near the horizon ---
  // Damped under overcast (corona hidden behind cloud).
  float upPos = max(up, 0.0);
  float mieDamp = 1.0 - overcast * 0.85;
  c = mix(c, uSunColor, pow(sd, 5.0) * 0.22 * max(1.0 - upPos * 1.5, 0.0) * mieDamp);

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
  float coronaDamp = 1.0 - overcast * 0.92;
  float golden = 1.0 - smoothstep(0.0, 0.45, sunE);
  vec3 sunWarm = mix(uSunColor, uSunColor * vec3(1.18, 0.52, 0.24), golden);
  // Wide aureole: broader (lower exponent) and stronger at golden hour.
  c += sunWarm * pow(sd, mix(20.0, 8.0, golden)) * (0.55 + golden * 0.55) * coronaDamp;
  c += sunWarm * pow(sd, 300.0) * 0.95 * coronaDamp;   // tight inner ring
  // Flatten the disc near the horizon (atmospheric refraction squashes it).
  vec3 dd = dir - uSunDir * sd;
  float perp = length(vec2(length(dd.xz), dd.y * mix(1.0, 1.6, golden)));
  float disc = smoothstep(mix(0.018, 0.028, golden), 0.006, perp) * coronaDamp;
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
    if (h > 0.9968) {
      vec3 jit = vec3(hash3(cell + 7.1), hash3(cell + 13.7), hash3(cell + 29.3)) - 0.5;
      vec3 sdir = normalize((cell + 0.5 + jit * 0.8) / SC);
      float d = length(dir - sdir);
      float bright = 0.30 + 0.55 * hash3(cell + 43.0);
      float phase = hash3(cell + 31.0) * 6.2832;
      float twinkle = 0.80 + 0.20 * sin(uTime * 1.4 + phase);
      float giant = step(0.9995, h);                     // rare brighter star
      float srad = mix(0.0016, 0.0028, giant);
      float star = smoothstep(srad, srad * 0.35, d)
                 * min(0.88, bright * twinkle * (1.0 + giant * 0.6));
      c += vec3(star);
    }
  }

  // --- Moon disc + halo (night tracks) ---
  if (uMoon > 0.0 && uStars > 0.5) {
    // Fixed moon direction: high in the sky, to the right of the sun's compass direction.
    // Using a stable world-space direction so it doesn't follow the camera.
    vec3 moonDir = normalize(vec3(0.42, 0.72, 0.55));
    float md = dot(dir, moonDir);
    float moonPerp = length(dir - moonDir * max(md, 0.0));
    // Moon disc: crisp soft edge
    float moonDisc = smoothstep(0.025, 0.010, moonPerp) * uMoon;
    // Moon halo: broad soft glow
    float moonHalo = exp(-moonPerp * moonPerp * 140.0) * 0.28 * uMoon;
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
    float horiz = pow(clamp(1.0 - max(dir.y, 0.0) * 2.4, 0.0, 1.0), 3.0);
    c += uCityGlow * horiz;
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
out vec4 outColor;
void main() {
  vec2 t = uTexel;
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
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  // Screen-space sample radius shrinks with distance so the world radius (~0.6 m)
  // stays roughly constant; clamp so near/far stay sane.
  float radius = 0.6;
  float scr = clamp(radius / max(-P.z, 1.0) * 0.9, 0.004, 0.05);
  // Per-pixel rotation to turn banding into noise.
  float a = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
  float ca = cos(a), sa = sin(a);
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    vec2 k = vec2(K[i].x * ca - K[i].y * sa, K[i].x * sa + K[i].y * ca);
    vec3 S = viewPos(clamp(vUV + k * scr, vec2(0.001), vec2(0.999)));
    vec3 V = S - P;
    float len = length(V);
    // Occluder must rise above the tangent plane (dot>bias) and be within radius.
    float ndv = max(dot(N, V / max(len, 1e-4)) - 0.10, 0.0);
    float range = smoothstep(radius, radius * 0.4, len);
    occ += ndv * range;
  }
  float ao = 1.0 - clamp(occ / 12.0 * 2.4, 0.0, 1.0) * uStrength;

  // Contact shadows: a short ray-march toward the sun in view space, sampling the
  // depth buffer. If a nearby surface blocks the sun within a small distance, the
  // pixel is in contact shadow (grounds the car/objects where the sun map's texel
  // footprint is too coarse). Folded into AO so the composite multiply applies it.
  if (uContact > 0.0 && uSunVS.z < 0.0) {     // sun in front of the camera-ish
    float sh = 1.0;
    for (int i = 1; i <= 8; i++) {
      vec3 q = P + uSunVS * (0.04 * float(i));   // up to ~0.32 m toward the sun
      vec4 cp = uProj * vec4(q, 1.0);
      vec2 quv = cp.xy / cp.w * 0.5 + 0.5;
      if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) break;
      float sz = viewPos(quv).z;                 // scene surface depth at that pixel
      float dz = sz - q.z;                       // >0: surface is in front of the ray
      if (dz > 0.015 && dz < 0.5) { sh = 1.0 - uContact; break; }
    }
    ao *= sh;
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
  float t = (360.0 - wp.y) / uSunDir.y;
  vec2 cp = (wp.xz + uSunDir.xz * t) * 0.0052 + vec2(uTime * 0.012, uTime * 0.005);
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
  const int N = 22;                        // 32→22: jitter + blur hide the coarser step
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
      for (int li = 0; li < GR_MAX_LIGHTS; li++) {
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
        lampAccum += uLightCol[li] * (att * spot * (0.12 + hgL * 0.14)) * uLightVolW[li] * hLamp * trans;
      }
    }
  }
  accum /= float(N);
  lampAccum *= uMist * uLampStr * 2.0 / float(N);
  // Henyey-Greenstein phase (g=0.60 = a wider forward lobe so the shafts read
  // across a broader arc, not only when staring straight at the sun) + a small
  // isotropic floor so lit haze glows everywhere, giving an atmospheric volume.
  float cosT = max(dot(rd, uSunDir), 0.0);
  float g = 0.60;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
  float phase = hg * 0.16 + 0.020;
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
uniform sampler2D uGodray;   // additive volumetric sun shafts
uniform float uBloomAmt;
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
uniform sampler2D uDepth;    // scene depth (for wet-road screen-space reflection)
uniform mat4 uInvProj;       // clip → view (reconstruct view position from depth)
uniform mat4 uProj;          // view → clip  (project the marched ray to screen)
uniform vec3 uUpVS;          // world-up in view space (pick out up-facing road)
uniform vec2 uReflTexel;     // 1/width, 1/height
uniform float uReflect;      // wet-road SSR strength (0 = off)
uniform float uCarReflect;   // car-bodywork SSR strength (CAR tuner group; default 0.55)
uniform vec3 uReflSkyHi;     // horizon sky-glow (dim reflection fallback on a march miss)
uniform vec3 uReflSkyLo;     // zenith sky-glow
out vec4 outColor;

// Reconstruct view-space position from the depth buffer at a screen UV.
vec3 ssrViewPos(vec2 uv) {
  float d = texture(uDepth, uv).r * 2.0 - 1.0;     // window depth → NDC z
  vec4 cp = uInvProj * vec4(uv * 2.0 - 1.0, d, 1.0);
  return cp.xyz / cp.w;
}

// ACES fitted filmic tone-map (Stephen Hill's approximation).
// Preserves colour ratios better than Reinhard; keeps darks dark, rolls off highlights.
vec3 acesTonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
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
  // Slight lift: prevents pure blacks — adds a tiny warm floor
  c = max(c, vec3(0.005, 0.004, 0.003));
  return c;
}

void main() {
  vec4 scn = texture(uScene, vUV);   // one fetch: .rgb colour + .a SSR car tag
  vec3 c = scn.rgb;

  // Ambient occlusion: darken creases/contacts before bloom + tonemap so the
  // grounding reads in linear light (under cars, barrier feet, kerbs, building
  // bases). 1.0 = no change, so it's a no-op when SSAO is disabled.
  c *= texture(uSSAO, vUV).r;

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
  if ((uReflect > 0.001 || carPx > 0.3) && texture(uDepth, vUV).r < 0.9999 && vUV.y < 0.62) {
    vec3 P = ssrViewPos(vUV);
    // View-space normal from depth derivatives (cheap; rough at silhouettes, but
    // the road-mask + march thickness test reject the bad cases).
    vec3 dpx = ssrViewPos(vUV + vec2(uReflTexel.x, 0.0)) - P;
    vec3 dpy = ssrViewPos(vUV + vec2(0.0, uReflTexel.y)) - P;
    vec3 Nv = normalize(cross(dpx, dpy));
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
    float ssrGate = max(roadMask * uReflect, carMask * uCarReflect);
    if (ssrGate > 0.001) {
      vec3 V = normalize(-P);
      vec3 R = reflect(-V, Nv);                    // points up toward the city
      // Finer refined march: small fixed steps (dense near/mid) so small/distant
      // emissive lamp heads + neon aren't stepped over (was a coarse 12×1.42 march).
      vec3 pos = P, prevPos = P;
      float stepLen = 0.55;
      float hit = 0.0;
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
        if (dz > 0.20 && dz < 5.0) {               // thickness gate (reject far sky)
          vec3 a = prevPos, b = pos;               // binary-search refine → crisp hit
          for (int j = 0; j < 4; j++) {
            vec3 mid = (a + b) * 0.5;
            vec4 mc = uProj * vec4(mid, 1.0);
            vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
            if (ssrViewPos(muv).z - mid.z > 0.20) b = mid; else a = mid;
          }
          vec4 fc = uProj * vec4(b, 1.0);
          hitUV = fc.xy / fc.w * 0.5 + 0.5;
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
        float streak = uReflect * (0.010 + 0.022 * clamp((0.62 - vUV.y) / 0.62, 0.0, 1.0));
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
      vec3 skyRefl = mix(uReflSkyLo, uReflSkyHi, clamp(R.y, 0.0, 1.0));
      vec3 reflCol = found ? hitCol : skyRefl;
      // Soft-clip the reflected colour BEFORE it's substituted in: a bright HDR
      // hit (neon signage, a lit window, the sun disc, a floodlight lens) was
      // injected raw, so a handful of very bright reflected pixels could blow
      // the whole mirror surface toward white. Compressing here caps the mirror
      // itself at a sane peak while keeping its colour (unlike a post multiply).
      reflCol = reflCol / (1.0 + reflCol * 0.35);
      float cover  = found ? hit : 1.0;
      // Clean DARKER MIRROR: substitute the reflected scene into a darkened base
      // (a real wet mirror shows the scene it reflects, not a wash added on top).
      // Mirror-like: a high base reflectance (so mid/near tarmac mirrors too, not
      // just the grazing band) with a gentle Fresnel lift toward the horizon.
      float fres = pow(1.0 - max(dot(Nv, V), 0.0), 3.0);
      float strength = ssrGate * (0.55 + 0.42 * fres);
      // The darker-mirror substitution below is tuned for WET roads. At the
      // faint dry levels (uReflect < 0.2: dry-day 0.07 / dry-night 0.16) fade
      // the substitution quadratically so it reads as a subtle sheen instead
      // of dark towers replacing the sunlit tarmac.
      strength *= min(uReflect / 0.20, 1.0);
      // The whole SSR branch above is gated by a HARD "vUV.y < 0.62" cutoff (a
      // cheap early-out — the upper screen is sky, never wet road/car paint).
      // That boolean gate is a step function: reflected pixels just below the
      // line are full-strength, pixels just above get none, so any noticeable
      // difference between the mirrored colour and the base scene shows as a
      // visible seam slicing across the frame. Fade the last few percent out
      // instead of cutting it off.
      strength *= 1.0 - smoothstep(0.56, 0.62, vUV.y);
      float mixAmt = clamp(strength * cover, 0.0, 0.94);   // near-mirror, keeps a hint of asphalt
      c = mix(c, c * 0.10 + reflCol * 0.92, mixAmt);
    }
  }

  // Exposure multiply before tone-mapping (default 1.0 = no change).
  c *= uExposure;

  // Improved bloom: add with a mild tone-aware mask so it doesn't wash out
  // already-bright pixels (reduce bloom addition proportionally in highlights).
  vec3 bloomSample = texture(uBloom, vUV).rgb;
  float bloomMask = 1.0 - clamp(max(c.r, max(c.g, c.b)) - 0.7, 0.0, 0.3) / 0.3 * 0.5;
  c += bloomSample * uBloomAmt * bloomMask;

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
        decay *= 0.82;
      }
      shaft /= 8.0;
      // Radial falloff: strongest near the sun, zero at the edge of the screen.
      float radial = 1.0 - clamp(dist * 2.6, 0.0, 1.0);
      c += shaft * uSunShaft * radial * radial * 0.60;
    }
  }

  // Filmic tone-map (ACES) + colour grading.
  c = acesTonemap(c);
  c = colourGrade(c);

  // Lens flare: anamorphic streak + ghost circles
  vec3 flare = vec3(0.0);
  if (uFlareStr > 0.0 && uSunUV.x >= 0.0 && uSunUV.x <= 1.0 &&
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
    float streakX = exp(-abs(vUV.x - uSunUV.x) * 7.0);
    flare += vec3(1.0, 0.80, 0.52) * streakY * streakX * 0.75;
    // A second thinner hot core streak.
    float streakX2 = exp(-abs(vUV.x - uSunUV.x) * 10.0);
    flare += vec3(1.0, 0.92, 0.78) * exp(-abs(vUV.y - uSunUV.y) * 320.0) * streakX2 * 0.5;

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
    flare *= uFlareStr;
    flare = flare / (1.0 + flare * 0.6);
  }
  c += flare;

  vec2 q = vUV - 0.5;
  float vig = smoothstep(0.95, 0.35, length(q));
  c *= mix(uVignette, 1.0, vig);

  // Dither: a triangular-PDF noise of ~1 output LSB, added in the LDR domain to
  // break the 8-bit banding that otherwise stamps visible steps onto smooth sky
  // and fog gradients (and rescues the RGBA8 fallback path). Two hashes → a
  // triangular distribution in [-1,1]; cheap, per-pixel.
  float d0 = fract(sin(dot(vUV, vec2(12.9898, 78.233))) * 43758.5453);
  float d1 = fract(sin(dot(vUV, vec2(39.3468, 11.135))) * 24634.6345);
  c += (d0 + d1 - 1.0) / 255.0;
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


  return {
    LIT_VS, LIT_FS, SKY_VS, SKY_FS, SHADOW_VS, SHADOW_FS, MARK_FS,
    GLOW_VS, GLOW_FS, POST_VS, BRIGHT_FS, BLUR_FS, DOWN_FS, UP_FS,
    SSAO_FS, GODRAY_FS, COMPOSITE_FS, FXAA_FS, DEPTH_VS, DEPTH_FS,
  };
})();
