/*
 * Apex 26 — WGSL foreground-FX shaders (WGSLFx). Blob shadow, skid marks,
 * glow billboards, textured decals — WGSL ports of js/render/glx/shaders/glsl-fx.js.
 * Loaded after wgsl-chunks.js. Uniform layouts exported as WGSLFx.*_UNIFORM_BYTES.
 *
 * NO build step: plain JS template strings, one global WGSLFx.
 */
"use strict";

const WGSLFx = (function () {

  // 1. BLOB_SHADOW — soft dark elliptical ground decal under a car.
  //
  //    GEOMETRY : a shared unit quad, aPos in -0.5..0.5 (x, z). Scaled to the
  //               car footprint by size.xy and laid flat at y = 0.02 in model
  //               space (model matrix places + orients it on the road).
  //    LOOK     : radial falloff, alpha-blended dark disc (GLX SHADOW_FS).
  //               size.z = soft inner radius (GL literal 0.25), size.w = peak
  //               alpha (GL literal 0.45) — exposed as the "softness" knob.
  //
  //    VERTEX INPUT  : @location(0) aPos : vec2<f32>   (unit quad, stride 8 B)
  //    BIND GROUP    : @group(0) @binding(0) var<uniform> U : ShadowU
  //    BLEND         : alpha  (srcAlpha, oneMinusSrcAlpha)
  //    DEPTH         : test ENABLED, write DISABLED. Needs a depth bias toward
  //                    camera (GL polygonOffset(-4,-8)) so the coplanar quad does
  //                    not z-fight the road — set constant/slope depthBias on the
  //                    pipeline in wgx.js.
  //    CULL          : none (single flat quad)
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

  // 2a. MARK — a single rectangular tyre-mark stamp on the road (per-draw quad).
  //
  //    GEOMETRY : same shared unit quad as BLOB_SHADOW (aPos -0.5..0.5), scaled
  //               by size.xy (x = lateral width, z = along-travel length), placed
  //               & oriented by the model matrix at the contact point.
  //    LOOK     : soft-edged dark rectangle (GLX MARK_FS). size.z = peak alpha
  //               (GL literal 0.38). The two GL descending smoothsteps are
  //               rewritten as (1 - smoothstep(lo, hi, x)) for WGSL.
  //
  //    VERTEX INPUT  : @location(0) aPos : vec2<f32>   (unit quad, stride 8 B)
  //    BIND GROUP    : @group(0) @binding(0) var<uniform> U : MarkU
  //    BLEND         : alpha  (srcAlpha, oneMinusSrcAlpha)
  //    DEPTH         : test ENABLED, write DISABLED, depthBias toward camera
  //                    (GL polygonOffset(-4,-8)) — same as BLOB_SHADOW.
  //    CULL          : none
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

  // 2b. SKID — the batched skid trail: ONE draw over a prebuilt world-space
  //     vertex buffer holding every live mark segment (GLX drawSkidBatch).
  //
  //    GEOMETRY : real interleaved vertex buffer, 6 verts/mark (two triangles),
  //               world-space positions already baked by the CPU. Extends the GL
  //               layout (pos3 + uv2, stride 20 B) with a per-vertex RGBA colour/
  //               alpha attribute so older marks in the trail can fade out and
  //               tint independently — the "per-vertex colour/alpha attribute"
  //               contract for this batched variant. A wgx.js writer that only
  //               has pos+uv can fill rgba = (0,0,0,1) to reproduce the exact GL
  //               look.
  //    LOOK     : same soft rectangle falloff as MARK, then multiplied by the
  //               per-vertex colour/alpha.
  //
  //    VERTEX INPUT  (single interleaved buffer, stride 36 B):
  //        @location(0) aPos : vec3<f32>   off  0   world position (m)
  //        @location(1) aUV  : vec2<f32>   off 12   -1..1 across the stamp
  //        @location(2) aCol : vec4<f32>   off 24   rgba tint * fade
  //    BIND GROUP    : @group(0) @binding(0) var<uniform> U : SkidU  (viewProj only)
  //    BLEND         : alpha  (srcAlpha, oneMinusSrcAlpha)
  //    DEPTH         : test ENABLED, write DISABLED, depthBias toward camera.
  //    CULL          : none
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

  // 3. GLOW — additive HDR lens-glare billboard, one round quad per lamp head.
  //
  //    GEOMETRY : real interleaved vertex buffer, 6 verts/lamp, built each frame
  //               by drawGlow. The billboard is oriented CAMERA-FACING in the
  //               vertex shader from the eye position (GLX GLOW_VS). Matches the
  //               GL stride exactly (9 floats = 36 B).
  //    LOOK     : hot core + soft veil radial falloff, output = colour * alpha,
  //               HDR (colour carries display-normalised lamp intensity) so it
  //               blooms in the post chain. NO clamp.
  //
  //    VERTEX INPUT  (single interleaved buffer, stride 36 B — matches GLX glowVBO):
  //        @location(0) aCorner : vec2<f32>   off  0   x in {-1,+1}, y in {0,1}
  //        @location(1) aCenter : vec3<f32>   off  8   lamp head world pos
  //        @location(2) aColor  : vec3<f32>   off 20   HDR corona colour
  //        @location(3) aRadius : f32         off 32   halo radius (m)
  //    BIND GROUP    : @group(0) @binding(0) var<uniform> U : GlowU
  //    BLEND         : ADDITIVE (one, one)
  //    DEPTH         : test ENABLED (halos occlude behind walls), write DISABLED.
  //                    NO depthBias.
  //    CULL          : none
  //    TARGET        : must render into the RGBA16F HDR scene target (before the
  //                    bloom/composite pass), not the LDR swapchain.
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

  // 4. DECAL — textured atlas quad (team number / sponsor) sitting proud of the
  //     bodywork, sampling an RGBA decal atlas (GLX drawDecal).
  //
  //    GEOMETRY : a real UV'd mesh quad (pos + normal + uv). The mesh UV is
  //               remapped into an atlas sub-rect by U.uvRect so many marks share
  //               one atlas texture: uv = uvRect.xy + meshUV * uvRect.zw.
  //    LOOK     : sun Lambert + hemisphere ambient (so the decal sits INTO the
  //               paint shading, not flat), alpha-TESTED (discard a < 0.02) then
  //               alpha-blended, plus a glow lift (tint.w) so white sponsors read
  //               at night. tint.rgb multiplies the sampled colour.
  //
  //    VERTEX INPUT  (mesh buffer, stride 32 B):
  //        @location(0) aPos : vec3<f32>   off  0
  //        @location(1) aNrm : vec3<f32>   off 12
  //        @location(2) aUV  : vec2<f32>   off 24
  //    BIND GROUP    :
  //        @group(0) @binding(0) var<uniform> U : DecalU
  //        @group(0) @binding(1) var atlasTex  : texture_2d<f32>
  //        @group(0) @binding(2) var atlasSamp : sampler        (linear, clamp)
  //    BLEND         : alpha  (srcAlpha, oneMinusSrcAlpha), ALPHA-TESTED
  //    DEPTH         : test ENABLED, write DISABLED (sits proud of the body).
  //    CULL          : none (single quad, both faces)
  const DECAL = `
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

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0)       uv   : vec2<f32>,
  @location(1)       nrm  : vec3<f32>,
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
  o.clip = U.viewProj * (U.model * vec4<f32>(aPos, 1.0));
  return o;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let t = textureSample(atlasTex, atlasSamp, in.uv);
  if (t.a < 0.02) { discard; }
  let N = normalize(in.nrm);
  let ndl = max(dot(N, U.sunDir.xyz), 0.0);
  let amb = mix(U.ambGround.xyz, U.ambSky.xyz, N.y * 0.5 + 0.5);
  let base = t.rgb * U.tint.xyz;
  let lit = base * (amb + U.sunColor.xyz * ndl) + base * U.tint.w;
  return vec4<f32>(lit, t.a);
}`;

  const PARTICLE = `
struct ParticleU {
  viewProj : mat4x4<f32>,   // off  0
  eyeAdd   : vec4<f32>,     // off 64  (xyz eye, w additive)
};                          // size 80
@group(0) @binding(0) var<uniform> U : ParticleU;
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) color : vec3<f32>,
  @location(2) alpha : f32,
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
  o.clip = U.viewProj * vec4<f32>(wp, 1.0);
  return o;
}
@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  var fall = max(1.0 - r2, 0.0);
  fall = fall * fall;
  let a = in.alpha * fall;
  return mix(vec4<f32>(in.color, a), vec4<f32>(in.color * a, 1.0), U.eyeAdd.w);
}`;

  return {
    // shader strings
    BLOB_SHADOW,
    MARK,
    SKID,
    GLOW,
    DECAL,
    PARTICLE,
    // uniform block byte sizes (JS-side writers in wgx.js MUST agree)
    BLOB_SHADOW_UNIFORM_BYTES: 144,   // ShadowU: mat4 64 + mat4 64 + vec4 16
    MARK_UNIFORM_BYTES:        144,   // MarkU:   mat4 64 + mat4 64 + vec4 16
    SKID_UNIFORM_BYTES:         64,   // SkidU:   mat4 64
    GLOW_UNIFORM_BYTES:         80,   // GlowU:   mat4 64 + vec4 16
    DECAL_UNIFORM_BYTES:       224,   // DecalU:  mat4 64 + mat4 64 + 6*vec4 96
    // vertex buffer strides (bytes) for the pipeline vertex-layout descriptors
    QUAD_VERTEX_BYTES:           8,   // BLOB_SHADOW / MARK: vec2 unit quad
    SKID_VERTEX_BYTES:          36,   // pos3(12) + uv2(8) + rgba4(16)
    GLOW_VERTEX_BYTES:          36,   // corner2(8) + center3(12) + color3(12) + radius(4)
    DECAL_VERTEX_BYTES:         32,   // pos3(12) + nrm3(12) + uv2(8)
    PARTICLE_UNIFORM_BYTES:     80,
    PARTICLE_VERTEX_BYTES:      40,   // corner2 + center3 + color3 + size + alpha
  };
})();

// No-build global export (mirror GLX/Parts/Tracks/WGSLChunks style).
if (typeof window !== "undefined") window.WGSLFx = WGSLFx;
