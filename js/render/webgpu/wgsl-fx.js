"use strict";

const WGSLFx = (function () {
  const FRAME_U = (typeof window !== "undefined" && window.WGSLChunks && window.WGSLChunks.FRAME_U) || "";

  const BLOB_SHADOW = `
struct ShadowU {
  viewProj : mat4x4<f32>,   // off   0
  model    : mat4x4<f32>,   // off  64
  size     : vec4<f32>,     // off 128  (w, l, softInner, peakAlpha)
};                          // size 144
@group(0) @binding(0) var<uniform> U : ShadowU;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0)       uv   : vec2<f32>,   // -1..1 across the quad
};

@vertex
fn vs_main(@location(0) aPos : vec2<f32>) -> VSOut {
  var o : VSOut;
  o.uv = aPos * 2.0;
  let wp = U.model * vec4<f32>(aPos.x * U.size.x, 0.02, aPos.y * U.size.y, 1.0);
  o.clip = U.viewProj * wp;
  return o;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  let a = U.size.w * (1.0 - smoothstep(U.size.z, 1.0, r));
  return vec4<f32>(0.0, 0.0, 0.0, a);
}`;

  const MARK = `
struct MarkU {
  viewProj : mat4x4<f32>,   // off   0
  model    : mat4x4<f32>,   // off  64
  size     : vec4<f32>,     // off 128  (w, l, peakAlpha, _)
};                          // size 144
@group(0) @binding(0) var<uniform> U : MarkU;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0)       uv   : vec2<f32>,   // -1..1 across the stamp
};

@vertex
fn vs_main(@location(0) aPos : vec2<f32>) -> VSOut {
  var o : VSOut;
  o.uv = aPos * 2.0;
  let wp = U.model * vec4<f32>(aPos.x * U.size.x, 0.02, aPos.y * U.size.y, 1.0);
  o.clip = U.viewProj * wp;
  return o;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  // GLX: 0.38 * smoothstep(1.0, 0.4, |x|) * smoothstep(1.0, 0.3, |y|).
  // WGSL rewrite of the descending smoothsteps (edge0 must be < edge1):
  let sx = 1.0 - smoothstep(0.4, 1.0, abs(in.uv.x));
  let sy = 1.0 - smoothstep(0.3, 1.0, abs(in.uv.y));
  let a = U.size.z * sx * sy;
  return vec4<f32>(0.0, 0.0, 0.0, a);
}`;

  const SKID = `
struct SkidU {
  viewProj : mat4x4<f32>,   // off 0
};                          // size 64
@group(0) @binding(0) var<uniform> U : SkidU;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0)       uv   : vec2<f32>,
  @location(1)       col  : vec4<f32>,
};

@vertex
fn vs_main(
  @location(0) aPos : vec3<f32>,
  @location(1) aUV  : vec2<f32>,
  @location(2) aCol : vec4<f32>,
) -> VSOut {
  var o : VSOut;
  o.uv  = aUV;
  o.col = aCol;
  o.clip = U.viewProj * vec4<f32>(aPos, 1.0);
  return o;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  // Same soft rectangle as MARK (0.38 base), then per-vertex colour/alpha.
  let sx = 1.0 - smoothstep(0.4, 1.0, abs(in.uv.x));
  let sy = 1.0 - smoothstep(0.3, 1.0, abs(in.uv.y));
  let a = 0.38 * sx * sy * in.col.a;
  return vec4<f32>(in.col.rgb, a);
}`;

  const GLOW = `
struct GlowU {
  viewProj : mat4x4<f32>,   // off  0
  eyeStr   : vec4<f32>,     // off 64  (xyz eye, w = strength)
};                          // size 80
@group(0) @binding(0) var<uniform> U : GlowU;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0)       uv   : vec2<f32>,   // -1..1 across the halo quad
  @location(1)       col  : vec3<f32>,   // HDR corona colour
};

@vertex
fn vs_main(
  @location(0) aCorner : vec2<f32>,
  @location(1) aCenter : vec3<f32>,
  @location(2) aColor  : vec3<f32>,
  @location(3) aRadius : f32,
) -> VSOut {
  var o : VSOut;
  let fwd   = normalize(U.eyeStr.xyz - aCenter);
  let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), fwd) + vec3<f32>(1e-4, 0.0, 0.0));
  let upv   = cross(fwd, right);
  // GL corner buffer is x in ±1, y in 0..1 -> remap y to -1..1.
  let c = vec2<f32>(aCorner.x, aCorner.y * 2.0 - 1.0);
  let wp = aCenter + (right * c.x + upv * c.y) * aRadius;
  o.uv  = c;
  o.col = aColor;
  o.clip = U.viewProj * vec4<f32>(wp, 1.0);
  return o;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let r2   = dot(in.uv, in.uv);
  let core = exp(-r2 * 28.0);   // hot centre right at the lens
  let veil = exp(-r2 * 5.0);    // broad soft glare veil (~0 by the quad edge)
  let a = (core * 0.75 + veil * 0.28) * U.eyeStr.w;
  // Additive: premultiplied HDR colour, alpha unused by the (one, one) blend.
  return vec4<f32>(in.col * a, 1.0);
}`;

  const DECAL = FRAME_U + `
struct DecalU {
  model     : mat4x4<f32>,  // off   0
  viewProj  : mat4x4<f32>,  // off  64
  sunDir    : vec4<f32>,    // off 128  (xyz)
  sunColor  : vec4<f32>,    // off 144  (xyz)
  ambSky    : vec4<f32>,    // off 160  (xyz)
  ambGround : vec4<f32>,    // off 176  (xyz)
  uvRect    : vec4<f32>,    // off 192  (u0, v0, uScale, vScale)
  tint      : vec4<f32>,    // off 208  (rgb tint, a = glow lift)
};                          // size 224
@group(0) @binding(0) var<uniform> U : DecalU;
@group(0) @binding(1) var atlasTex  : texture_2d<f32>;
@group(0) @binding(2) var atlasSamp : sampler;
@group(1) @binding(0) var<uniform> F : FrameU;
@group(1) @binding(2) var shadowTex  : texture_depth_2d;
@group(1) @binding(3) var shadowSamp : sampler_comparison;
@group(1) @binding(5) var envSamp : sampler;
@group(1) @binding(17) var lampBakeTex : texture_2d<f32>;
@group(1) @binding(18) var lampBakeIdx : texture_2d<f32>;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0)       uv   : vec2<f32>,
  @location(1)       nrm  : vec3<f32>,
  @location(2)       wpos : vec3<f32>,
};

@vertex
fn vs_main(
  @location(0) aPos : vec3<f32>,
  @location(1) aNrm : vec3<f32>,
  @location(2) aUV  : vec2<f32>,
) -> VSOut {
  var o : VSOut;
  o.uv  = U.uvRect.xy + aUV * U.uvRect.zw;
  let nm = mat3x3<f32>(U.model[0].xyz, U.model[1].xyz, U.model[2].xyz);
  o.nrm = nm * aNrm;
  let wp = U.model * vec4<f32>(aPos, 1.0);
  o.wpos = wp.xyz;
  o.clip = U.viewProj * wp;
  return o;
}

// Sun map (lit.wgsl parity: Z01 light VP, v flipped, the fade / slope bias /
// box compensation) with a 4-tap box PCF. Compare-LEVEL taps: legal in any
// control flow.
fn decalShadow(wp : vec3<f32>, N : vec3<f32>) -> f32 {
  if (F.params2.x < 0.5 || F.params2.y <= 0.0) { return 1.0; }
  let sc = F.lightVP * vec4<f32>(wp, 1.0);
  let ndc = sc.xyz / sc.w;
  let suv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let shRange = max(F.shadowCtr.w, 1.0);
  let fadeCtr = vec3<f32>(F.eye.x, F.shadowCtr.y, F.eye.z);
  var edgeFade = 1.0 - smoothstep(shRange * 0.62, shRange * 0.84, distance(wp, fadeCtr));
  let ef = smoothstep(vec2<f32>(0.0), vec2<f32>(0.03), suv)
         * (1.0 - smoothstep(vec2<f32>(0.97), vec2<f32>(1.0), suv));
  edgeFade = edgeFade * ef.x * ef.y;
  if (edgeFade <= 0.0 || ndc.z > 1.0) { return 1.0; }
  let cosT = clamp(dot(N, F.sunDir.xyz), 0.05, 1.0);
  let biasTerm = clamp(F.params2.z * 1.5 * (sqrt(1.0 - cosT * cosT) / cosT), 0.0005, 0.004)
               + max(F.params2.w, 0.0) * 0.5;
  let refD = ndc.z - biasTerm * (shRange / 80.0);
  let o = F.params2.z * 1.5 * min(1.0, 80.0 / shRange);
  let sh = 0.25 * ( textureSampleCompareLevel(shadowTex, shadowSamp, suv + vec2<f32>(-o, -o), refD)
                  + textureSampleCompareLevel(shadowTex, shadowSamp, suv + vec2<f32>( o, -o), refD)
                  + textureSampleCompareLevel(shadowTex, shadowSamp, suv + vec2<f32>(-o,  o), refD)
                  + textureSampleCompareLevel(shadowTex, shadowSamp, suv + vec2<f32>( o,  o), refD));
  return max(0.0, mix(1.0, sh, F.params2.y * edgeFade));
}

// Baked floodlight pools at the decal's ground position (lit.wgsl parity);
// alpha = the baked height, so a car's marks share the road's pool.
fn decalPool(wp : vec3<f32>, N : vec3<f32>) -> vec3<f32> {
  let bUv = (wp.xz - F.bakeA.xy) / max(F.bakeA.zw, vec2<f32>(1e-3));
  let bG = bUv * F.bakeD.xy;
  let bTile = clamp(floor(bG), vec2<f32>(0.0), max(F.bakeD.xy - 1.0, vec2<f32>(0.0)));
  // Gated like the lit pass: no bake or out of grid skips the load + sample.
  var bSlot = vec2<f32>(-1.0);
  var bT = vec4<f32>(0.0);
  let inG = all(bUv > vec2<f32>(0.0)) && all(bUv < vec2<f32>(1.0));
  if (F.bakeB.w > 0.5 && inG) {
    bSlot = textureLoad(lampBakeIdx, vec2<i32>(bTile), 0).xy;
    if (bSlot.x >= 0.0) {
      let bUvD = (bSlot + (bG - bTile) * F.bakeC.w + 1.0) / max(F.bakeD.zw, vec2<f32>(1.0));
      bT = textureSampleLevel(lampBakeTex, envSamp, bUvD, 0.0);
    }
  }
  let bIn = inG && bSlot.x >= 0.0;
  let hW = 1.0 - smoothstep(1.5, 3.0, abs(wp.y - bT.a));
  return select(vec3<f32>(0.0), bT.rgb * F.bakeB.xyz * hW * (0.5 + 0.5 * N.y), F.bakeB.w > 0.5 && bIn);
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let t = textureSample(atlasTex, atlasSamp, in.uv);
  if (t.a < 0.02) { discard; }
  let N = normalize(in.nrm);
  let ndl = max(dot(N, U.sunDir.xyz), 0.0);
  let amb = mix(U.ambGround.xyz, U.ambSky.xyz, N.y * 0.5 + 0.5);
  let sh = decalShadow(in.wpos, N);
  let base = t.rgb * U.tint.xyz;
  let lit = base * (amb + U.sunColor.xyz * (ndl * sh) + decalPool(in.wpos, N)) + base * U.tint.w;
  return vec4<f32>(lit, t.a);
}

@fragment
fn fs_glass(in : VSOut) -> @location(0) vec4<f32> {
  let t = textureSample(atlasTex, atlasSamp, in.uv);
  return vec4<f32>(t.rgb * U.tint.xyz, 1.0);
}`;

  const PARTICLE = `
struct ParticleU {
  viewProj : mat4x4<f32>,   // off  0
  eyeAdd   : vec4<f32>,     // off 64  (xyz eye, w additive)
  sunFog   : vec4<f32>,     // off 80  (xyz sun colour, w fog density)
  ambSky   : vec4<f32>,     // off 96  (xyz hemisphere sky)
  ambGnd   : vec4<f32>,     // off 112 (xyz hemisphere ground)
  fogCol   : vec4<f32>,     // off 128 (xyz fog colour)
};                          // size 144
@group(0) @binding(0) var<uniform> U : ParticleU;
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) color : vec3<f32>,
  @location(2) alpha : f32,
  @location(3) dist : f32,
};
@vertex
fn vs_main(
  @location(0) aCorner : vec2<f32>,
  @location(1) aCenter : vec3<f32>,
  @location(2) aColor : vec3<f32>,
  @location(3) aSize : f32,
  @location(4) aAlpha : f32,
) -> VSOut {
  var o : VSOut;
  let fwd = normalize(U.eyeAdd.xyz - aCenter);
  let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), fwd) + vec3<f32>(1e-4, 0.0, 0.0));
  let upv = cross(fwd, right);
  let wp = aCenter + (right * aCorner.x + upv * aCorner.y) * aSize;
  o.uv = aCorner;
  o.color = aColor;
  o.alpha = aAlpha;
  o.dist = length(U.eyeAdd.xyz - aCenter);
  o.clip = U.viewProj * vec4<f32>(wp, 1.0);
  return o;
}
// Lit + fogged (GLX PARTICLE_FS parity, 2026-10-01): the alpha group is shaded
// as a small sphere (hemisphere on the quad's up + a wrap of the key, floodlit
// floor 0.18); both groups take the lit pass's exp² fog on the eye distance.
@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  var fall = max(1.0 - r2, 0.0);
  fall = fall * fall;
  let a = in.alpha * fall;
  var col = in.color;
  if (U.eyeAdd.w < 0.5) {
    let lit = mix(U.ambGnd.xyz, U.ambSky.xyz, in.uv.y * 0.5 + 0.5) + U.sunFog.xyz * 0.45;
    col = col * max(lit, vec3<f32>(0.18));
  }
  let fd = in.dist * U.sunFog.w;
  let fog = 1.0 - exp(-fd * fd);
  col = mix(mix(col, U.fogCol.xyz, fog), col * (1.0 - fog), U.eyeAdd.w);
  return mix(vec4<f32>(col, a), vec4<f32>(col * a, 1.0), U.eyeAdd.w);
}`;

  const LINE = `
struct LineU {
  viewProj : mat4x4<f32>,   // off  0
  params   : vec4<f32>,     // off 64  x playerSpeed (m/s), y cornersOnly 0|1, z str, w spare (was the 0|1 palette flag)
  params2  : vec4<f32>,     // off 80  x opacity, yzw spare
  colOnPace: vec4<f32>,     // off 96  LINE COLOUR rgb (w unused): DrivingLine.PALETTES
  colLift  : vec4<f32>,     // off 112
  colBrake : vec4<f32>,     // off 128
};                          // size 144
@group(0) @binding(0) var<uniform> U : LineU;

struct VSOut {
  @builtin(position) clip   : vec4<f32>,
  @location(0)       across : f32,
  @location(1)       speed  : f32,
  @location(2)       zone   : f32,
  @location(3)       along  : f32,
};

@vertex
fn vs_main(
  @location(0) aPos    : vec3<f32>,
  @location(1) aAcross : f32,
  @location(2) aSpeed  : f32,
  @location(3) aZone   : f32,
  @location(4) aAlong  : f32,
) -> VSOut {
  var o : VSOut;
  o.across = aAcross;
  o.speed  = aSpeed;
  o.zone   = aZone;
  o.along  = aAlong;
  o.clip = U.viewProj * vec4<f32>(aPos, 1.0);
  return o;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let over = U.params.x / max(in.speed, 1.0);          // 1.0 = on the line's pace
  // on pace → lift → brake, the palette's colours as uniforms (GLX LINE_FS,
  // TLX lineMat: the three carry the same maths; the table and why it has a
  // colour-blind entry live in driving-line.js PALETTES).
  var col = mix(U.colOnPace.xyz, U.colLift.xyz, smoothstep(0.98, 1.06, over));
  col = mix(col, U.colBrake.xyz, smoothstep(1.06, 1.16, over));
  // Chevrons every PERIOD m pointing the way the lap runs (GLX LINE_FS):
  // pattern space is (along, across), so no derivatives for the soft edge.
  let PERIOD = 5.0;
  let SWEEP = 1.6;
  let THICK = 1.1;
  let tip = PERIOD * 0.6 - SWEEP * abs(in.across);
  var d = (in.along - tip) - PERIOD * floor((in.along - tip) / PERIOD);   // mod, positive
  d = min(d, PERIOD - d);
  let arrow = 1.0 - smoothstep(THICK * 0.5 - 0.18, THICK * 0.5, d);
  let rim = 1.0 - smoothstep(0.85, 1.0, abs(in.across));
  let zone = mix(1.0, smoothstep(0.05, 0.75, in.zone), U.params.y);
  let a = arrow * rim * zone;
  if (a < 0.01) { discard; }
  // LINE OPACITY (GLX LINE_FS, TLX lineMat: the three carry the same maths).
  // Scales emissive and coverage together; the alpha is clamped because SOLID
  // takes the 0.85 base past 1 and a source alpha over 1 over-blends.
  let op = U.params2.x;
  return vec4<f32>(col * U.params.z * a * op, min(a * 0.85 * op, 1.0));
}`;

  return {
    BLOB_SHADOW,
    MARK,
    SKID,
    LINE,
    GLOW,
    DECAL,
    PARTICLE,
    BLOB_SHADOW_UNIFORM_BYTES: 144,
    SKID_UNIFORM_BYTES:         64,
    LINE_UNIFORM_BYTES:        144,
    GLOW_UNIFORM_BYTES:         80,
    DECAL_UNIFORM_BYTES:       224,
    QUAD_VERTEX_BYTES:           8,
    SKID_VERTEX_BYTES:          36,
    LINE_VERTEX_BYTES:          28,
    GLOW_VERTEX_BYTES:          36,
    DECAL_VERTEX_BYTES:         32,
    PARTICLE_UNIFORM_BYTES:     144,
    PARTICLE_VERTEX_BYTES:      40,
  };
})();

if (typeof window !== "undefined") window.WGSLFx = WGSLFx;
