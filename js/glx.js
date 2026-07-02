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
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }
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
  // peter-panning on angled surfaces (walls, banking kerbs).
  float cosTheta = clamp(dot(normalize(vNrm), uSunDir), 0.0, 1.0);
  float slopeBias = t * 1.5 * tan(acos(max(cosTheta, 0.05)));
  float z = sc.z - clamp(slopeBias, 0.0005, 0.004) - uShadowBias * 0.5;
  // 8-tap Poisson disk, ROTATED per-pixel by interleaved-gradient noise so the
  // sampling pattern varies every fragment — banding becomes fine noise and the
  // 8 taps read as a much smoother penumbra. Radius 3.0 texels: a visibly SOFT
  // penumbra (real sun shadows aren't razor-edged) that also stops thin kerb/car
  // shadows shimmering at the low racing-camera angle.
  const float R = 3.0;
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float ang = ign * 6.2831853;
  float cr = cos(ang), sr = sin(ang);
  mat2 rot = mat2(cr, -sr, sr, cr) * (t * R);
  vec2 p0 = rot * vec2(-0.94201624, -0.39906216);
  vec2 p1 = rot * vec2( 0.94558609, -0.76890725);
  vec2 p2 = rot * vec2(-0.09418410, -0.92938870);
  vec2 p3 = rot * vec2( 0.34495938,  0.29387760);
  vec2 p4 = rot * vec2(-0.91588581,  0.45771432);
  vec2 p5 = rot * vec2(-0.81544232, -0.87912464);
  vec2 p6 = rot * vec2(-0.38277543,  0.27676845);
  vec2 p7 = rot * vec2( 0.97484398,  0.75648379);
  float s = texture(uShadowMap, vec3(sc.xy + p0, z))
          + texture(uShadowMap, vec3(sc.xy + p1, z))
          + texture(uShadowMap, vec3(sc.xy + p2, z))
          + texture(uShadowMap, vec3(sc.xy + p3, z))
          + texture(uShadowMap, vec3(sc.xy + p4, z))
          + texture(uShadowMap, vec3(sc.xy + p5, z))
          + texture(uShadowMap, vec3(sc.xy + p6, z))
          + texture(uShadowMap, vec3(sc.xy + p7, z));
  return mix(1.0, s * 0.125, uShadowStr);
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
      N = normalize(N + vec3(h0 - hx, 0.0, h0 - hz) * ((uDetail * 0.4 * mnFade) / e));
    }
  }
  // Car paint micro normal map (orange-peel): the same trick as the ground
  // relief above, at paint scale. No colour layers — the perturbed normal
  // feeds every standard lighting/reflection term below, so the surface
  // ITSELF reflects: the sun streak and sky env break into a live shimmer
  // that slides across the panels as the car moves.
  if (uCarPaint > 0.001) {
    // Two scales: coarse orange-peel waviness + fine metallic-flake sparkle.
    // Fades with distance so it never aliases to shimmer at range.
    float pFade = clamp(1.0 - (vDist - 18.0) / 50.0, 0.0, 1.0);
    if (pFade > 0.01) {
      vec2 puv = vWorldPos.xz * 34.0 + vWorldPos.y * 29.0;
      vec2 fuv = vWorldPos.xz * 130.0 + vWorldPos.y * 111.0;
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
  float litNoL = NoL * shadow;

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
    float att = (win * win) / (dist * dist + 1.0);
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
    color += albedo * uLightCol[i] * (att * 0.04 * (0.55 + 0.45 * NoLl)) * (1.0 - uMetalness);
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
    float ccA = 0.035;
    float Dc = D_GGX(NoH, ccA);
    float Vc = V_SmithGGX(NoV, NoL, ccA);
    float Fc = F_Schlick(VoH, vec3(0.05), 1.0).x;
    vec3 ccCol = vec3(Dc * Vc * Fc) * uSunColor * litNoL * uClearcoat;
    ccCol = 2.6 * ccCol / (2.6 + ccCol);
    color += ccCol;

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
    color += albedo * glow * 2.3;
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
    lampFogC = lf / (1.0 + max(max(lf.r, lf.g), lf.b) * 0.7);
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
    vec3 mistCol = mix(uFogColor, uSunColor, pow(sunAmount, 3.0)) + lampFogC * 1.5;
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
float gCloudFBM(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*gNoise(p); p=p*2.03+1.7; a*=0.5; } return s; }
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
  const int N = 32;
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
uniform sampler2D uDepth;    // scene depth (for wet-road screen-space reflection)
uniform mat4 uInvProj;       // clip → view (reconstruct view position from depth)
uniform mat4 uProj;          // view → clip  (project the marched ray to screen)
uniform vec3 uUpVS;          // world-up in view space (pick out up-facing road)
uniform vec2 uReflTexel;     // 1/width, 1/height
uniform float uReflect;      // wet-road SSR strength (0 = off)
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
  c = pow(c, vec3(1.12));
  // Vibrance: pull colour away from its luma. Weighted by how UNsaturated the
  // pixel already is, so pale, washed-out areas (hazy sky, dull grass, gray
  // asphalt) gain the most while vivid neon/kerbs don't over-cook. This is the
  // main fix for the "boring / washed-out" daytime look.
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float sat = mx - mn;
  c = mix(vec3(luma), c, 1.0 + (1.0 - clamp(sat * 1.5, 0.0, 1.0)) * 0.20);
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
  float carPx = 1.0 - smoothstep(0.42, 0.55, texture(uScene, vUV).a);
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
    float roadMask = smoothstep(0.55, 0.85, upDot)
                   * smoothstep(-2.5, -7.0, P.z)
                   * (1.0 - smoothstep(-22.0, -55.0, P.z));
    // Car bodywork: up-facing-ish panels, allowed much nearer than the road
    // (the chase camera sits ~5-8 m behind the car).
    float carMask = carPx * smoothstep(0.30, 0.65, upDot)
                  * smoothstep(-1.0, -3.0, P.z)
                  * (1.0 - smoothstep(-22.0, -55.0, P.z));
    float ssrGate = max(roadMask * uReflect, carMask * 0.55);
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
      for (int i = 0; i < 28; i++) {
        prevPos = pos;
        pos += R * stepLen;
        stepLen *= 1.16;                           // gentle growth
        vec4 cp = uProj * vec4(pos, 1.0);
        if (cp.w <= 0.0) break;
        vec2 suv = cp.xy / cp.w * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
        float dz = ssrViewPos(suv).z - pos.z;      // >0 = ray passed behind a surface
        if (dz > 0.20 && dz < 5.0) {               // thickness gate (reject far sky)
          vec3 a = prevPos, b = pos;               // binary-search refine → crisp hit
          for (int j = 0; j < 5; j++) {
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
      float cover  = found ? hit : 1.0;
      // Clean DARKER MIRROR: substitute the reflected scene into a darkened base
      // (a real wet mirror shows the scene it reflects, not a wash added on top).
      // Mirror-like: a high base reflectance (so mid/near tarmac mirrors too, not
      // just the grazing band) with a gentle Fresnel lift toward the horizon.
      float fres = pow(1.0 - max(dot(Nv, V), 0.0), 3.0);
      float strength = ssrGate * (0.55 + 0.42 * fres);
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
    float streakY = exp(-abs(vUV.y - uSunUV.y) * 110.0);
    float streakX = exp(-abs(vUV.x - uSunUV.x) * 1.3);
    flare += vec3(1.0, 0.80, 0.52) * streakY * streakX * 1.25;
    // A second thinner hot core streak.
    flare += vec3(1.0, 0.92, 0.78) * exp(-abs(vUV.y - uSunUV.y) * 320.0) * exp(-abs(vUV.x - uSunUV.x) * 2.2) * 0.7;

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
  c *= mix(0.80, 1.0, vig);

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

  let gl = null;
  let canvas = null;
  let litProg = null, litU = null;
  let skyProg = null, skyU = null;
  let shadowProg = null, shadowU = null;
  let markProg = null, markU = null;
  let glowProg = null, glowU = null, glowVAO = null, glowVBO = null;
  let glowData = null;   // CPU-side dynamic vertex buffer for light-glow billboards
  let skyVAO = null;     // empty VAO (WebGL2 still needs one bound)
  let shadowVAO = null;
  let width = 0, height = 0, aspect = 1;
  let frameViewProj = null;
  let frameSunDir = null;
  let frameEye = null;
  let frameLights = null;
  let frameGroundMist = 0;
  const _grPos = new Float32Array(36), _grCol = new Float32Array(36),
        _grRad = new Float32Array(12), _grDir = new Float32Array(36),
        _grCone = new Float32Array(24), _grVolW = new Float32Array(12), _grSel = [];
  let frameInvProj = null;
  let frameInvVP = null;
  let frameProj = null;
  let frameSunVS = null;
  let frameUpVS = null;
  let frameSkyHi = null;
  let frameSkyLo = null;
  let frameSunColor = null;
  let frameTime = 0, frameCloud = 0;
  let ssaoProg = null, ssaoU = null, ssaoFBO = null, ssaoTex = null;
  let ssaoBlurFBO = null, ssaoBlurTex = null, whiteTex = null, blackTex = null;
  let godrayProg = null, godrayU = null, godrayFBO = null, godrayTex = null;
  let godrayBlurFBO = null, godrayBlurTex = null;
  let godrayW = 0, godrayH = 0;
  let ssaoW = 0, ssaoH = 0;   // SSAO runs at half res (upscaled in composite)
  let fxaaProg = null, fxaaU = null, ldrFBO = null, ldrTex = null;   // FXAA pass + its LDR input

  let depthProg = null, depthU = null;
  let shadowMapFBO = null, shadowMapTex = null;
  let shadowLightVP = new Float32Array(16);
  const SHADOW_SIZE = 2048;
  let shadowEnabled = false;

  // Post-processing state. postEnabled stays false (and rendering goes straight
  // to the default framebuffer, exactly as before) if any target/program setup
  // fails, so the game always renders.
  let postEnabled = false;
  let brightProg = null, brightU = null;
  let blurProg = null, blurU = null;
  let downProg = null, downU = null, upProg = null, upU = null;
  let compProg = null, compU = null;
  let sceneFBO = null, sceneTex = null, sceneDepth = null;
  let colorType = null;        // HALF_FLOAT if renderable, else UNSIGNED_BYTE
  // Mip-chain bloom: progressive downsample levels (half res, /4, /8, …), then
  // additive tent upsample back to level 0 — wide multi-octave glow.
  const BLOOM_DIV = 2;         // level 0 at half resolution
  const BLOOM_LEVELS_MAX = 5;
  let bloomLv = [];            // [{fbo, tex, w, h}] — rebuilt on resize
  // MSAA scene target: the geometry passes render into multisampled renderbuffers,
  // resolved (blitFramebuffer) into sceneTex/sceneDepth before post — real edge AA
  // on the HDR path, with FXAA left to clean up what the resolve misses.
  let msaaSamples = 0;         // 0/1 = off (render straight into sceneFBO)
  let msFBO = null, msColorRB = null, msDepthRB = null;

  // Material uniform cache — skip redundant per-draw scalar uploads.
  let _matEmissive = -1, _matAlpha = -1, _matRough = -1, _matMetal = -1, _matSpec = -1, _matDetail = -1, _matCC = -1, _matCP = -1;

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
    downProg = link(POST_VS, DOWN_FS);
    upProg = link(POST_VS, UP_FS);
    compProg = link(POST_VS, COMPOSITE_FS);
    ssaoProg = link(POST_VS, SSAO_FS);
    godrayProg = link(POST_VS, GODRAY_FS);
    fxaaProg = link(POST_VS, FXAA_FS);
    if (fxaaProg) fxaaU = locs(fxaaProg, ["uTex", "uTexel"]);
    if (!brightProg || !blurProg || !compProg || !downProg || !upProg) return false;
    brightU = locs(brightProg, ["uScene", "uThreshold"]);
    blurU = locs(blurProg, ["uTex", "uDir"]);
    downU = locs(downProg, ["uTex", "uTexel"]);
    upU = locs(upProg, ["uTex", "uTexel"]);
    // MSAA: pick the sample count the HDR colour format actually supports (many
    // mobile GPUs render RGBA16F but not multisampled RGBA16F — query, don't assume).
    try {
      const fmt = colorType === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
      const cs = gl.getInternalformatParameter(gl.RENDERBUFFER, fmt, gl.SAMPLES);
      const ds = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES);
      const cMax = cs && cs.length ? cs[0] : 0;
      const dMax = ds && ds.length ? ds[0] : 0;
      msaaSamples = Math.min(4, cMax, dMax);
      if (msaaSamples < 2) msaaSamples = 0;
    } catch (e) { msaaSamples = 0; }
    compU = locs(compProg, ["uScene", "uBloom", "uSSAO", "uGodray", "uBloomAmt", "uSunUV", "uFlareStr", "uExposure", "uSunShaft", "uGradeShadow", "uGradeHi", "uGradeStr", "uDepth", "uInvProj", "uProj", "uUpVS", "uReflTexel", "uReflect", "uReflSkyHi", "uReflSkyLo"]);
    if (ssaoProg) ssaoU = locs(ssaoProg, ["uDepth", "uInvProj", "uProj", "uSunVS", "uTexel", "uStrength", "uContact"]);
    if (godrayProg) godrayU = locs(godrayProg, ["uDepth", "uShadowMap", "uInvVP", "uLightVP", "uEye", "uSunDir", "uSunColor", "uStr", "uTime", "uCloudCover", "uNumLights", "uLightPos[0]", "uLightCol[0]", "uLightRad[0]", "uLightDir[0]", "uLightCone[0]", "uLightVolW[0]", "uMist", "uLampStr"]);
    // 1×1 white texture: the "AO off" fallback so the composite multiply is a no-op.
    whiteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // 1×1 black texture: the "god-ray off" fallback so the additive term is a no-op.
    blackTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blackTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
    // scene target (full res) + depth as a SAMPLEABLE texture (enables SSAO and
    // any depth-aware post; same pattern already used for the shadow map).
    if (sceneTex) gl.deleteTexture(sceneTex);
    if (sceneDepth) gl.deleteTexture(sceneDepth);
    if (!sceneFBO) sceneFBO = gl.createFramebuffer();
    sceneTex = mk(width, height);
    sceneDepth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sceneDepth, 0);
    // MSAA scene target: multisampled colour + depth renderbuffers, resolved into
    // sceneTex/sceneDepth at present(). Falls back silently (msaaSamples = 0) if
    // the combo doesn't yield a complete FBO on this driver.
    if (msaaSamples > 1) {
      const internalD = gl.DEPTH_COMPONENT24;
      if (msColorRB) gl.deleteRenderbuffer(msColorRB);
      if (msDepthRB) gl.deleteRenderbuffer(msDepthRB);
      if (!msFBO) msFBO = gl.createFramebuffer();
      msColorRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, msColorRB);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, internal, width, height);
      msDepthRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, msDepthRB);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, internalD, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColorRB);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepthRB);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) msaaSamples = 0;
    }
    // bloom mip chain (half res, /4, /8, … — stop once a level gets tiny)
    for (const lv of bloomLv) { if (lv.tex) gl.deleteTexture(lv.tex); if (lv.fbo) gl.deleteFramebuffer(lv.fbo); }
    bloomLv = [];
    let bw = Math.max(1, Math.floor(width / BLOOM_DIV));
    let bh = Math.max(1, Math.floor(height / BLOOM_DIV));
    for (let i = 0; i < BLOOM_LEVELS_MAX && bw >= 8 && bh >= 8; i++) {
      const tex = mk(bw, bh);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      bloomLv.push({ fbo, tex, w: bw, h: bh });
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    // SSAO targets (HALF res): raw AO + a blurred copy to denoise the 12-tap pass.
    // AO is low-frequency, so half-res + LINEAR upscale in the composite is ~75%
    // cheaper with no visible loss (depth is still sampled at full res per tap).
    if (ssaoProg) {
      ssaoW = Math.max(1, Math.floor(width / 2));
      ssaoH = Math.max(1, Math.floor(height / 2));
      if (ssaoTex) gl.deleteTexture(ssaoTex);
      if (ssaoBlurTex) gl.deleteTexture(ssaoBlurTex);
      if (!ssaoFBO) ssaoFBO = gl.createFramebuffer();
      if (!ssaoBlurFBO) ssaoBlurFBO = gl.createFramebuffer();
      ssaoTex = mk(ssaoW, ssaoH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ssaoTex, 0);
      ssaoBlurTex = mk(ssaoW, ssaoH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoBlurFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ssaoBlurTex, 0);
    }
    // God-ray targets (half res): raw shafts + a blurred copy to soften the march.
    if (godrayProg) {
      godrayW = Math.max(1, Math.floor(width / 2));
      godrayH = Math.max(1, Math.floor(height / 2));
      if (godrayTex) gl.deleteTexture(godrayTex);
      if (godrayBlurTex) gl.deleteTexture(godrayBlurTex);
      if (!godrayFBO) godrayFBO = gl.createFramebuffer();
      if (!godrayBlurFBO) godrayBlurFBO = gl.createFramebuffer();
      godrayTex = mk(godrayW, godrayH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, godrayTex, 0);
      godrayBlurTex = mk(godrayW, godrayH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, godrayBlurFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, godrayBlurTex, 0);
    }
    // LDR target (full res, RGBA8): the composite renders here so the FXAA pass
    // can edge-detect on the final tonemapped image, then resolve to the screen.
    if (fxaaProg) {
      if (ldrTex) gl.deleteTexture(ldrTex);
      if (!ldrFBO) ldrFBO = gl.createFramebuffer();
      ldrTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, ldrTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ldrFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ldrTex, 0);
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
    glowProg = link(GLOW_VS, GLOW_FS);
    if (!litProg || !skyProg || !shadowProg || !markProg) return false;

    postEnabled = initPost();   // best-effort; false -> render straight to screen
    shadowEnabled = initShadowMap();

    litU = locs(litProg, ["uModel", "uViewProj", "uEye", "uSunDir", "uSunColor",
      "uAmbGround", "uAmbSky", "uFogColor", "uFogDensity", "uEmissive", "uAlpha",
      "uRoughness", "uMetalness", "uSpecular", "uDetail", "uClearcoat", "uCarPaint", "uWetness",
      "uShadowMap", "uLightVP", "uShadowBias", "uShadowStr", "uShadowTexel",
      "uSkyZenith", "uSkyHorizon", "uFogHeight", "uGroundMist", "uLampFog", "uTime", "uCloudCover",
      "uNumLights", "uLightPos[0]", "uLightCol[0]", "uLightRad[0]", "uLightDir[0]", "uLightCone[0]", "uLightBleed[0]"]);
    skyU = locs(skyProg, ["uInvViewProj", "uZenith", "uHorizon", "uSunDir", "uSunColor", "uStars", "uCloud", "uTime", "uMoon", "uCityGlow"]);
    shadowU = locs(shadowProg, ["uModel", "uViewProj", "uSize"]);
    markU = locs(markProg, ["uModel", "uViewProj", "uSize"]);
    if (glowProg) {
      glowU = locs(glowProg, ["uViewProj", "uEye", "uStr"]);
      // Dynamic interleaved buffer: [cornerX, cornerY, cx, cy, cz, r, g, b, radius] ×6 verts/lamp.
      glowVAO = gl.createVertexArray();
      gl.bindVertexArray(glowVAO);
      glowVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, glowVBO);
      const st = 9 * 4;   // 9 floats per vertex
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
      gl.bindVertexArray(null);
    }

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
    frameSunDir = frame.sunDir;
    frameSunColor = frame.sunColor;
    frameEye = frame.eye;
    frameInvProj = frame.invProj || null;
    frameInvVP = frame.invViewProj || null;
    frameProj = frame.proj || null;
    frameSunVS = frame.sunViewDir || null;
    frameUpVS = frame.upViewDir || null;
    frameSkyHi = frame.skyHorizon || [0.05, 0.06, 0.09];
    frameSkyLo = frame.skyZenith || [0.02, 0.025, 0.05];
    frameTime = frame.time != null ? frame.time : 0;
    frameCloud = frame.cloud != null ? frame.cloud : 0;
    frameLights = frame.lights || null;
    frameGroundMist = frame.groundMist != null ? frame.groundMist : 0;
    _frameToken++;   // invalidate per-frame uViewProj upload caches
    // Render the scene into the HDR offscreen target when post is enabled, else
    // straight to the default framebuffer. With MSAA the geometry goes into the
    // multisampled renderbuffer, resolved into sceneTex/sceneDepth at present().
    if (postEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, msaaSamples > 1 ? msFBO : sceneFBO);
      gl.viewport(0, 0, width, height);
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
    gl.uniform1f(litU.uGroundMist,  frame.groundMist != null ? frame.groundMist : 0.0);
    gl.uniform1f(litU.uLampFog,     frame.lampFog != null ? frame.lampFog : 0.0);
    gl.uniform1f(litU.uTime,        frame.time  != null ? frame.time  : 0.0);
    gl.uniform1f(litU.uCloudCover,  frame.cloud != null ? frame.cloud : 0.0);
    gl.uniform1f(litU.uWetness,     frame.wetness != null ? frame.wetness : 0.0);
    // Point lights (floodlights / street lights). frame.lights is a flat array
    // of at most MAX_LIGHTS (32) entries, already culled to the nearest set by
    // the caller. Uploaded once per frame; uNumLights=0 on day.
    {
      const L = frame.lights;
      // Flat stride-15: [x,y,z, r,g,b, rad, dirX,dirY,dirZ, cosInner, cosOuter,
      // bleed, volW, glareW]. volW is consumed by the godray pass only; glareW
      // (lens-glare halo weight) by drawGlow only.
      const nL = L ? Math.min(32, (L.length / 15) | 0) : 0;
      gl.uniform1i(litU.uNumLights, nL);
      if (nL > 0) {
        const pos = new Float32Array(nL * 3), col = new Float32Array(nL * 3),
              rad = new Float32Array(nL), dir = new Float32Array(nL * 3),
              cone = new Float32Array(nL * 2), bleed = new Float32Array(nL);
        for (let i = 0; i < nL; i++) {
          const o = i * 15;
          pos[i * 3] = L[o]; pos[i * 3 + 1] = L[o + 1]; pos[i * 3 + 2] = L[o + 2];
          col[i * 3] = L[o + 3]; col[i * 3 + 1] = L[o + 4]; col[i * 3 + 2] = L[o + 5];
          rad[i] = L[o + 6];
          dir[i * 3] = L[o + 7]; dir[i * 3 + 1] = L[o + 8]; dir[i * 3 + 2] = L[o + 9];
          cone[i * 2] = L[o + 10]; cone[i * 2 + 1] = L[o + 11];
          bleed[i] = L[o + 12];
        }
        gl.uniform3fv(litU["uLightPos[0]"], pos);
        gl.uniform3fv(litU["uLightCol[0]"], col);
        gl.uniform1fv(litU["uLightRad[0]"], rad);
        gl.uniform3fv(litU["uLightDir[0]"], dir);
        gl.uniform2fv(litU["uLightCone[0]"], cone);
        gl.uniform1fv(litU["uLightBleed[0]"], bleed);
      }
    }
    _matEmissive = _matAlpha = _matRough = _matMetal = _matSpec = _matDetail = _matCC = _matCP = -1;
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
    const clearcoat = opts && opts.clearcoat !== undefined ? opts.clearcoat : 0.0;
    const carPaint = opts && opts.carPaint !== undefined ? opts.carPaint : 0.0;
    if (emissive  !== _matEmissive) { gl.uniform1f(litU.uEmissive,  emissive);  _matEmissive = emissive; }
    if (alpha     !== _matAlpha)    { gl.uniform1f(litU.uAlpha,     alpha);     _matAlpha    = alpha; }
    if (roughness !== _matRough)    { gl.uniform1f(litU.uRoughness, roughness); _matRough    = roughness; }
    if (metalness !== _matMetal)    { gl.uniform1f(litU.uMetalness, metalness); _matMetal    = metalness; }
    if (specular  !== _matSpec)     { gl.uniform1f(litU.uSpecular,  specular);  _matSpec     = specular; }
    if (detail    !== _matDetail)   { gl.uniform1f(litU.uDetail,    detail);    _matDetail   = detail; }
    if (clearcoat !== _matCC)       { gl.uniform1f(litU.uClearcoat, clearcoat); _matCC       = clearcoat; }
    if (carPaint  !== _matCP)       { gl.uniform1f(litU.uCarPaint,  carPaint);  _matCP       = carPaint; }
    // Each draw declares the full render state it needs (no restores afterwards),
    // so runs of same-state draws collapse to a single real toggle via the cache.
    setDepthMask(true);
    setBlend(alpha < 1);
    bindVAO(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
  }

  // ── Frustum-culled chunked meshes (used for the heavy city/props geometry) ────
  // Gribb–Hartmann plane extraction from a COLUMN-MAJOR view-proj (m[col*4+row]).
  // Planes are [a,b,c,d], inside = a*x+b*y+c*z+d >= 0. Scratch is module-static so
  // culling allocates nothing per frame.
  const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                     new Float32Array(4), new Float32Array(4), new Float32Array(4)];
  function _setPlane(p, a, b, c, d) {
    const inv = 1 / (Math.hypot(a, b, c) || 1);
    p[0] = a * inv; p[1] = b * inv; p[2] = c * inv; p[3] = d * inv;
  }
  function _extractPlanes(m, planes) {
    const m0=m[0],m4=m[4],m8=m[8],m12=m[12], m1=m[1],m5=m[5],m9=m[9],m13=m[13],
          m2=m[2],m6=m[6],m10=m[10],m14=m[14], m3=m[3],m7=m[7],m11=m[11],m15=m[15];
    _setPlane(planes[0], m3+m0, m7+m4, m11+m8,  m15+m12); // left
    _setPlane(planes[1], m3-m0, m7-m4, m11-m8,  m15-m12); // right
    _setPlane(planes[2], m3+m1, m7+m5, m11+m9,  m15+m13); // bottom
    _setPlane(planes[3], m3-m1, m7-m5, m11-m9,  m15-m13); // top
    _setPlane(planes[4], m3+m2, m7+m6, m11+m10, m15+m14); // near
    _setPlane(planes[5], m3-m2, m7-m6, m11-m10, m15-m14); // far
  }
  // AABB vs frustum via the box's most-positive vertex per plane (conservative).
  function _aabbInFrustum(planes, mn, mx) {
    for (let i = 0; i < 6; i++) {
      const p = planes[i];
      const px = p[0] >= 0 ? mx[0] : mn[0];
      const py = p[1] >= 0 ? mx[1] : mn[1];
      const pz = p[2] >= 0 ? mx[2] : mn[2];
      if (p[0]*px + p[1]*py + p[2]*pz + p[3] < 0) return false;
    }
    return true;
  }

  // Build a chunked mesh: ONE shared VBO/VAO + one index buffer per spatial XZ
  // cell (cellSize metres), each with an AABB over the verts it references. Index
  // type is Uint32 whenever total verts > 65535 (chunk indices reference the full
  // shared vertex array). Returns an object that also works as a plain mesh
  // (top-level vao/vbo/ib/count) so a stray draw()/castShadow() won't crash.
  function createChunkedMesh(data, cellSize) {
    const cell = cellSize > 0 ? cellSize : 72;
    const pos = toF32(data.pos), nrm = toF32(data.nrm), col = toF32(data.col);
    const srcIdx = data.idx, vCount = pos.length / 3, big = vCount > 65535;
    const triCount = (srcIdx.length / 3) | 0;
    if (triCount < 2000) { const m = createMesh(data); m.chunks = null; return m; }
    const interleaved = new Float32Array(vCount * 9);
    for (let i = 0; i < vCount; i++) {
      interleaved[i*9  ]=pos[i*3  ]; interleaved[i*9+1]=pos[i*3+1]; interleaved[i*9+2]=pos[i*3+2];
      interleaved[i*9+3]=nrm[i*3  ]; interleaved[i*9+4]=nrm[i*3+1]; interleaved[i*9+5]=nrm[i*3+2];
      interleaved[i*9+6]=col[i*3  ]; interleaved[i*9+7]=col[i*3+1]; interleaved[i*9+8]=col[i*3+2];
    }
    // Bin triangles by centroid cell. Numeric key (fast, no string alloc): the
    // grid is bounded (tracks span a few km), so pack signed cell coords.
    const buckets = new Map();
    for (let t = 0; t < srcIdx.length; t += 3) {
      const a = srcIdx[t], b = srcIdx[t+1], c = srcIdx[t+2];
      const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2], bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2],
            cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
      const gx = Math.floor(((ax+bx+cx)/3)/cell) + 1024;
      const gz = Math.floor(((az+bz+cz)/3)/cell) + 1024;
      const key = gx * 4096 + gz;
      let bk = buckets.get(key);
      if (!bk) { bk = { idx: [], mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] }; buckets.set(key, bk); }
      bk.idx.push(a, b, c);
      const mn = bk.mn, mx = bk.mx;
      if (ax<mn[0])mn[0]=ax; if (ax>mx[0])mx[0]=ax; if (ay<mn[1])mn[1]=ay; if (ay>mx[1])mx[1]=ay; if (az<mn[2])mn[2]=az; if (az>mx[2])mx[2]=az;
      if (bx<mn[0])mn[0]=bx; if (bx>mx[0])mx[0]=bx; if (by<mn[1])mn[1]=by; if (by>mx[1])mx[1]=by; if (bz<mn[2])mn[2]=bz; if (bz>mx[2])mx[2]=bz;
      if (cx<mn[0])mn[0]=cx; if (cx>mx[0])mx[0]=cx; if (cy<mn[1])mn[1]=cy; if (cy>mx[1])mx[1]=cy; if (cz<mn[2])mn[2]=cz; if (cz>mx[2])mx[2]=cz;
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
    const IndexArray = big ? Uint32Array : Uint16Array;
    const indexType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    const chunks = [];
    let firstIb = null;
    buckets.forEach((bk) => {
      const arr = new IndexArray(bk.idx);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      if (!firstIb) firstIb = ibo;
      chunks.push({ ibo, count: arr.length, indexType, min: bk.mn, max: bk.mx });
    });
    gl.bindVertexArray(null);
    _activeVAO = null;
    return { vao, vbo, ib: firstIb, count: chunks.length ? chunks[0].count : 0, indexType, chunks, cellSize: cell };
  }

  // Draw a chunked mesh, frustum-culling each chunk against the camera. Material
  // setup is identical to draw() (kept in lockstep).
  function drawChunked(mesh, modelMat, opts) {
    if (!mesh) return;
    useProg(litProg);
    gl.uniformMatrix4fv(litU.uModel, false, modelMat);
    const emissive = opts && opts.emissive !== undefined ? opts.emissive : 0;
    const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    const roughness = opts && opts.roughness !== undefined ? opts.roughness : 0.7;
    const metalness = opts && opts.metalness !== undefined ? opts.metalness : 0.0;
    const specular = opts && opts.specular !== undefined ? opts.specular : 0.5;
    const detail = opts && opts.detail !== undefined ? opts.detail : 0.0;
    const clearcoat = opts && opts.clearcoat !== undefined ? opts.clearcoat : 0.0;
    const carPaint = opts && opts.carPaint !== undefined ? opts.carPaint : 0.0;
    if (emissive  !== _matEmissive) { gl.uniform1f(litU.uEmissive,  emissive);  _matEmissive = emissive; }
    if (alpha     !== _matAlpha)    { gl.uniform1f(litU.uAlpha,     alpha);     _matAlpha    = alpha; }
    if (roughness !== _matRough)    { gl.uniform1f(litU.uRoughness, roughness); _matRough    = roughness; }
    if (metalness !== _matMetal)    { gl.uniform1f(litU.uMetalness, metalness); _matMetal    = metalness; }
    if (specular  !== _matSpec)     { gl.uniform1f(litU.uSpecular,  specular);  _matSpec     = specular; }
    if (detail    !== _matDetail)   { gl.uniform1f(litU.uDetail,    detail);    _matDetail   = detail; }
    if (clearcoat !== _matCC)       { gl.uniform1f(litU.uClearcoat, clearcoat); _matCC       = clearcoat; }
    if (carPaint  !== _matCP)       { gl.uniform1f(litU.uCarPaint,  carPaint);  _matCP       = carPaint; }
    setDepthMask(true);
    setBlend(alpha < 1);
    bindVAO(mesh.vao);
    if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
    _extractPlanes(frameViewProj, _fcPlanes);
    const chunks = mesh.chunks;
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (!_aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ch.ibo);
      gl.drawElements(gl.TRIANGLES, ch.count, ch.indexType, 0);
    }
  }

  // Shadow cast for a chunked mesh, culled against the shadow light frustum (an
  // off-camera building can still cast INTO view, so we cull by the light-VP, not
  // the camera). Runs under depthProg (bound by shadowBegin).
  function castShadowChunked(mesh, model) {
    if (!shadowEnabled || !mesh) return;
    bindVAO(mesh.vao);
    gl.uniformMatrix4fv(depthU.uModel, false, model);
    if (!mesh.chunks) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0); return; }
    _extractPlanes(shadowLightVP, _fcPlanes);
    const chunks = mesh.chunks;
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (!_aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ch.ibo);
      gl.drawElements(gl.TRIANGLES, ch.count, ch.indexType, 0);
    }
  }

  function freeChunkedMesh(mesh) {
    if (!mesh) return;
    if (_activeVAO === mesh.vao) { gl.bindVertexArray(null); _activeVAO = null; }
    if (mesh.chunks) for (let i = 0; i < mesh.chunks.length; i++) gl.deleteBuffer(mesh.chunks[i].ibo);
    else if (mesh.ib) gl.deleteBuffer(mesh.ib);
    if (mesh.vbo) gl.deleteBuffer(mesh.vbo);
    if (mesh.vao) gl.deleteVertexArray(mesh.vao);
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
    gl.uniform3fv(skyU.uCityGlow, sky.cityGlow || [0, 0, 0]);
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

  // Additive lens-glare halos: one round billboard per lamp. `lights` is the
  // stride-15 frame.lights array; fields 0-6 (position, colour, radius) and 14
  // (glareW: per-lamp halo weight, 0 = no visible fixture = no halo) are
  // read here. Must be called while the HDR scene target is bound (after
  // drawSky, before present) so the glare lands in the scene buffer and
  // participates in bloom. `str` scales halo brightness (0 disables).
  const _glowCorners = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
  function drawGlow(lights, str) {
    if (!glowProg || !lights || !lights.length || !(str > 0)) return;
    const nL = (lights.length / 15) | 0;  // stride-15 light records (see frame.lights)
    const floatsPerLamp = 6 * 9;
    if (!glowData || glowData.length < nL * floatsPerLamp) glowData = new Float32Array(nL * floatsPerLamp);
    let p = 0, nDraw = 0;
    const ex = frameEye ? frameEye[0] : 0, ey = frameEye ? frameEye[1] : 0, ez = frameEye ? frameEye[2] : 0;
    for (let i = 0; i < nL; i++) {
      const o = i * 15;
      // Per-lamp glare weight (record field 14): 0 = fixture-less light (edge
      // washers) that must never paint a floating halo; >1 = big soft glare
      // (heritage globes, flood banks).
      const glareW = lights[o + 14];
      if (!(glareW > 0)) continue;
      const cx = lights[o], cy = lights[o + 1], cz = lights[o + 2];
      // Lens glare is a NEAR-FIELD veiling effect. Distant sources already read
      // as bloom on their emissive head geometry — a halo billboard out there is
      // a detached orb hanging in the sky (elevated flood heads especially).
      const dxE = cx - ex, dyE = cy - ey, dzE = cz - ez;
      const dEye = Math.sqrt(dxE * dxE + dyE * dyE + dzE * dzE);
      const fade = Math.min(1, Math.max(0, (170 - dEye) / 110));
      if (fade <= 0) continue;
      // Light colours carry PHYSICAL intensities (hundreds, for the inverse-square
      // shader) — normalise to a display-scale corona colour that keeps the hue.
      let r = lights[o + 3], g = lights[o + 4], b = lights[o + 5];
      const rad = lights[o + 6];
      const cm = Math.max(r, g, b) || 1;
      const csc = Math.min(1, 3.2 / cm) * (0.5 + 0.5 * Math.min(1, cm / 40)) * fade * glareW;
      r *= csc; g *= csc; b *= csc;
      // Billboard size: a small LENS HALO hugging the lamp head — NOT a beam cone.
      // Sized to the lens housing (~2 m) and scaled by the lamp's glare weight.
      const brad = Math.min(2.2, rad * 0.10) * (0.7 + 0.6 * Math.min(glareW, 2));
      for (let v = 0; v < 6; v++) {
        const c = _glowCorners[v];
        glowData[p++] = c[0]; glowData[p++] = c[1];
        glowData[p++] = cx; glowData[p++] = cy; glowData[p++] = cz;
        glowData[p++] = r; glowData[p++] = g; glowData[p++] = b;
        glowData[p++] = brad;
      }
      nDraw++;
    }
    if (!nDraw) return;
    useProg(glowProg);
    gl.uniformMatrix4fv(glowU.uViewProj, false, frameViewProj);
    gl.uniform3fv(glowU.uEye, frameEye);
    gl.uniform1f(glowU.uStr, str);
    bindVAO(glowVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, glowVBO);
    gl.bufferData(gl.ARRAY_BUFFER, glowData.subarray(0, p), gl.DYNAMIC_DRAW);
    // Additive, depth-tested (halos occlude behind walls) but no depth write.
    setBlend(true);
    gl.blendFunc(gl.ONE, gl.ONE);
    setDepthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, nDraw * 6);
    // Restore the default alpha-blend + culling for subsequent passes.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.CULL_FACE);
  }

  // Resolve the HDR scene to the screen: extract bright areas, blur them into a
  // bloom buffer, then composite scene + bloom with tonemap + vignette. No-op when
  // post is disabled (the scene was drawn straight to the screen already).
  function present(opts) {
    if (!postEnabled) return;
    const threshold = opts && opts.threshold !== undefined ? opts.threshold : 0.75;
    const bloomAmt = opts && opts.bloom !== undefined ? opts.bloom : 0.55;

    // MSAA resolve: average the multisampled scene into sceneTex (and copy depth
    // into sceneDepth for SSAO/god-rays/SSR) before any post pass samples them.
    if (msaaSamples > 1) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFBO);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height,
        gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Fullscreen passes must overwrite (no blend) and write depth normally; draws
    // above leave state undeclared, so set what we need through the cache.
    setBlend(false);
    setDepthMask(true);
    gl.disable(gl.DEPTH_TEST);
    bindVAO(skyVAO);   // reuse the empty VAO for fullscreen triangles

    const aoStr = opts && opts.ssao !== undefined ? opts.ssao : 0;
    // 0) SSAO: raw AO from the depth texture, then a separable blur to denoise.
    const haveAO = ssaoProg && aoStr > 0 && frameInvProj && ssaoFBO;
    if (haveAO) {
      gl.viewport(0, 0, ssaoW, ssaoH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
      useProg(ssaoProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.uniform1i(ssaoU.uDepth, 0);
      gl.uniformMatrix4fv(ssaoU.uInvProj, false, frameInvProj);
      gl.uniform2f(ssaoU.uTexel, 1 / ssaoW, 1 / ssaoH);
      gl.uniform1f(ssaoU.uStrength, aoStr);
      // Contact shadows ride along in the AO pass when proj + view-sun are present.
      const csOn = (opts && opts.contact > 0) && frameProj && frameSunVS;
      gl.uniformMatrix4fv(ssaoU.uProj, false, frameProj || frameInvProj);
      gl.uniform3fv(ssaoU.uSunVS, frameSunVS || [0, 0, -1]);
      gl.uniform1f(ssaoU.uContact, csOn ? opts.contact : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Blur H (ssaoTex -> ssaoBlurFBO) then V (ssaoBlurTex -> ssaoFBO). Half res.
      useProg(blurProg);
      gl.uniform1i(blurU.uTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoBlurFBO);
      gl.bindTexture(gl.TEXTURE_2D, ssaoTex);
      gl.uniform2f(blurU.uDir, 1 / ssaoW, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
      gl.bindTexture(gl.TEXTURE_2D, ssaoBlurTex);
      gl.uniform2f(blurU.uDir, 0, 1 / ssaoH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 0b) Volumetric sun shafts: world-space march of the sun shadow map (half-res)
    // then a separable blur. Gated on the sun being up (grStr > 0) + shadows on.
    const grStr = opts && opts.godray !== undefined ? opts.godray : 0;
    const lampVol = (opts && opts.lampVol) || 0;
    const sunGR = shadowEnabled && grStr > 0;
    const haveGR = godrayProg && frameInvVP && godrayFBO && (sunGR || lampVol > 0);
    if (haveGR) {
      gl.viewport(0, 0, godrayW, godrayH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
      useProg(godrayProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.uniform1i(godrayU.uDepth, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, shadowMapTex);
      gl.uniform1i(godrayU.uShadowMap, 1);
      gl.uniformMatrix4fv(godrayU.uInvVP, false, frameInvVP);
      gl.uniformMatrix4fv(godrayU.uLightVP, false, shadowLightVP);
      gl.uniform3fv(godrayU.uEye, frameEye);
      gl.uniform3fv(godrayU.uSunDir, frameSunDir);
      gl.uniform3fv(godrayU.uSunColor, frameSunColor || [1, 1, 1]);
      gl.uniform1f(godrayU.uStr, sunGR ? grStr : 0.0);
      gl.uniform1f(godrayU.uTime, frameTime);
      gl.uniform1f(godrayU.uCloudCover, frameCloud);
      // Lamp volumetrics: upload the nearest-8 lamps to the eye + the haze gate.
      let grNL = 0;
      if (lampVol > 0 && frameLights) {
        const L = frameLights, total = (L.length / 15) | 0;
        const ex = frameEye[0], ey = frameEye[1], ez = frameEye[2];
        for (let i = 0; i < total; i++) {
          const o = i * 15, dx = L[o] - ex, dy = L[o + 1] - ey, dz = L[o + 2] - ez;
          const d = dx * dx + dy * dy + dz * dz;
          const e = _grSel[i]; if (e) { e.d = d; e.o = o; } else _grSel[i] = { d: d, o: o };
        }
        _grSel.length = total;
        _grSel.sort((a, b) => a.d - b.d);
        grNL = Math.min(12, total);
        for (let i = 0; i < grNL; i++) {
          const o = _grSel[i].o;
          _grPos[i*3]=L[o]; _grPos[i*3+1]=L[o+1]; _grPos[i*3+2]=L[o+2];
          _grCol[i*3]=L[o+3]; _grCol[i*3+1]=L[o+4]; _grCol[i*3+2]=L[o+5];
          _grRad[i]=L[o+6];
          _grDir[i*3]=L[o+7]; _grDir[i*3+1]=L[o+8]; _grDir[i*3+2]=L[o+9];
          _grCone[i*2]=L[o+10]; _grCone[i*2+1]=L[o+11];
          _grVolW[i]=L[o+13];
        }
        gl.uniform3fv(godrayU["uLightPos[0]"], _grPos);
        gl.uniform3fv(godrayU["uLightCol[0]"], _grCol);
        gl.uniform1fv(godrayU["uLightRad[0]"], _grRad);
        gl.uniform3fv(godrayU["uLightDir[0]"], _grDir);
        gl.uniform2fv(godrayU["uLightCone[0]"], _grCone);
        gl.uniform1fv(godrayU["uLightVolW[0]"], _grVolW);
      }
      gl.uniform1i(godrayU.uNumLights, grNL);
      gl.uniform1f(godrayU.uLampStr, lampVol);
      gl.uniform1f(godrayU.uMist, (opts && opts.mist) || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      useProg(blurProg);
      gl.uniform1i(blurU.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      // Double separable blur (H+V twice): the march + shadow slices otherwise
      // leave thin stripe artifacts that read as "random tiny rays" — two passes
      // turn the shafts into wide, soft volumes.
      for (let bp = 0; bp < 2; bp++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayBlurFBO);
        gl.bindTexture(gl.TEXTURE_2D, godrayTex);
        gl.uniform2f(blurU.uDir, (1 + bp) / godrayW, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
        gl.bindTexture(gl.TEXTURE_2D, godrayBlurTex);
        gl.uniform2f(blurU.uDir, 0, (1 + bp) / godrayH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    // 1) bright-pass scene -> bloom level 0 (half res)
    const nLv = bloomLv.length;
    gl.viewport(0, 0, bloomLv[0].w, bloomLv[0].h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomLv[0].fbo);
    useProg(brightProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(brightU.uScene, 0);
    gl.uniform1f(brightU.uThreshold, threshold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) mip-chain bloom: progressive 13-tap downsample to the smallest level,
    //    then additive 9-tap tent upsample back up — each level contributes one
    //    octave of blur, so bright sources get a tight core AND a wide soft halo.
    useProg(downProg);
    gl.uniform1i(downU.uTex, 0);
    for (let i = 1; i < nLv; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomLv[i].fbo);
      gl.viewport(0, 0, bloomLv[i].w, bloomLv[i].h);
      gl.bindTexture(gl.TEXTURE_2D, bloomLv[i - 1].tex);
      gl.uniform2f(downU.uTexel, 1 / bloomLv[i - 1].w, 1 / bloomLv[i - 1].h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    useProg(upProg);
    gl.uniform1i(upU.uTex, 0);
    for (let i = nLv - 1; i >= 1; i--) {
      // Intermediate levels accumulate (ONE, ONE) so every octave sums; the FINAL
      // pass into level 0 OVERWRITES instead — level 0 still holds the sharp
      // unblurred bright-pass, and adding onto it would re-inject the scene's
      // bright areas at full sharpness (large lamp-lit surfaces wash out).
      const last = i === 1;
      setBlend(!last);
      if (!last) gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomLv[i - 1].fbo);
      gl.viewport(0, 0, bloomLv[i - 1].w, bloomLv[i - 1].h);
      gl.bindTexture(gl.TEXTURE_2D, bloomLv[i].tex);
      gl.uniform2f(upU.uTexel, 1 / bloomLv[i].w, 1 / bloomLv[i].h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    setBlend(false);

    // 3) composite — to the LDR target when FXAA is on (it resolves to screen),
    //    else straight to the screen.
    const useFxaa = fxaaProg && ldrFBO && ldrTex;
    gl.bindFramebuffer(gl.FRAMEBUFFER, useFxaa ? ldrFBO : null);
    gl.viewport(0, 0, width, height);
    useProg(compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(compU.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomLv[0].tex);
    gl.uniform1i(compU.uBloom, 1);
    // Normalise the mip-chain accumulation (level 0 holds nLv-1 summed blur
    // octaves) so the hand-tuned per-time-of-day bloom amounts keep their overall
    // energy — same brightness budget, spread over a wider, smoother halo.
    gl.uniform1f(compU.uBloomAmt, bloomAmt * 1.25 / Math.max(nLv - 1, 1));
    // AO: post-blur result is in ssaoTex; when AO is off bind a white 1×1 so the
    // shader's `c *= texture(uSSAO).r` is a no-op.
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, haveAO ? ssaoTex : whiteTex);
    gl.uniform1i(compU.uSSAO, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, haveGR ? godrayTex : blackTex);
    gl.uniform1i(compU.uGodray, 3);
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
        // Lens flare peaks at GOLDEN HOUR (low sun), fading as the sun climbs —
        // the opposite of the old height-scaled version that vanished at sunset.
        // Gate flare + shafts by the sun's actual BRIGHTNESS, not just elevation:
        // at night the key light is dim moonlight kept above the horizon for sky
        // glow, and without this gate the radial pass streaked every bright lamp
        // head toward the moon — random "beams from the sky".
        const _sl = frameSunColor ? Math.max(frameSunColor[0], frameSunColor[1], frameSunColor[2]) : 1;
        const _sunGate = Math.min(1, Math.max(0, (_sl - 0.35) / 0.45));
        if (s[1] > -0.02) {
          const golden = 1.0 - Math.min(Math.max(s[1], 0) / 0.45, 1.0);
          flareStr = (0.30 + golden * 0.55) * _sunGate;
        }
        if (s[1] > 0.05) sunShaft = s[1] * 0.8 * _sunGate;
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
    // Wet-road screen-space reflection: needs depth + view/proj + world-up-in-view.
    const reflStr = (opts && opts.reflect) || 0;
    // SSR inputs bind every frame now — car paint reflects the world even in
    // dry sessions (the shader's carPx tag gates the work to car pixels).
    const haveRefl = frameInvProj && frameProj && frameUpVS;
    if (haveRefl) {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.uniform1i(compU.uDepth, 4);
      gl.uniformMatrix4fv(compU.uInvProj, false, frameInvProj);
      gl.uniformMatrix4fv(compU.uProj, false, frameProj);
      gl.uniform3fv(compU.uUpVS, frameUpVS);
      gl.uniform2f(compU.uReflTexel, 1 / width, 1 / height);
      gl.uniform3fv(compU.uReflSkyHi, frameSkyHi || [0.05, 0.06, 0.09]);
      gl.uniform3fv(compU.uReflSkyLo, frameSkyLo || [0.02, 0.025, 0.05]);
    }
    gl.uniform1f(compU.uReflect, haveRefl ? reflStr : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 4) FXAA resolve: edge-AA the tonemapped LDR image straight to the screen.
    if (useFxaa) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      useProg(fxaaProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ldrTex);
      gl.uniform1i(fxaaU.uTex, 0);
      gl.uniform2f(fxaaU.uTexel, 1 / width, 1 / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

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
    createChunkedMesh,
    freeMesh,
    freeChunkedMesh,
    begin,
    draw,
    drawChunked,
    castShadowChunked,
    drawSky,
    drawShadow,
    drawMark,
    drawGlow,
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
      gl.bindFramebuffer(gl.FRAMEBUFFER, postEnabled ? (msaaSamples > 1 ? msFBO : sceneFBO) : null);
      gl.viewport(0, 0, width, height);
    },
    get width() { return width; },
    get height() { return height; },
    get aspect() { return aspect; },
    hdrMode: () => colorType === gl.HALF_FLOAT,
    msaa: () => msaaSamples,
  };
})();
