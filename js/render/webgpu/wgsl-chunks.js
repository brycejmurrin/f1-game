/*
 * Apex 26 — WGSL shader chunks (WGSLChunks). Shared WGSL math leaves plus
 * SKY/LIT/SHADOW/BLIT/BLOCKER shader strings for WGX. Mirror names with
 * js/render/shaders/chunks.js where applicable. WGSL: texture+sampler split,
 * vec3<f32>, @builtin(vertex_index). See docs/research/WEBGPU-PARITY.md.
 *
 * NO build step: plain JS template strings, one global WGSLChunks.
 */
"use strict";

const WGSLChunks = (function () {
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

  //    js/render/shaders/chunks.js) ──
  // Depends on `hash` (uses hash2). The old GLSL vnoise/vnoise2 duplication is
  // gone — the sky-family GLSL copy lives once there, under this chunk's name.
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

  //    of the "single-source" candidates (acesTonemap, js/render/shaders/chunks.js). Not used
  //    by the sky (which outputs HDR straight to an LDR swapchain here), but
  //    included as the seed of the shared post-math the Composite port will use.
  // Coefficients are passed in (TONE CURVE knobs on the composite path; the BLIT
  // stand-in passes the shipped defaults). Defaults 2.51/0.03/2.43/0.59/0.14
  // reproduce the Narkowicz curve byte-for-byte. e is floored >0 by the slider
  // min so the denominator can't reach 0 for x>=0.
  // Surface-family hash/noise (GLXChunks.surfaceNoise / ignoise). Distinct from
  // the sky-family hash2/vnoise above — procedural MAT ids are welded to these.
  const matLib = `
fn hash21(p_in: vec2<f32>) -> f32 {
  var p = fract(p_in * vec2<f32>(123.34, 456.21));
  p = p + dot(p, p + 45.32);
  return fract(p.x * p.y);
}
fn svnoise(p_in: vec2<f32>) -> f32 {
  let i = floor(p_in);
  var f = fract(p_in);
  f = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn ignoise(p: vec2<f32>) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
}
// Object-space orange-peel (GLX LIT_FS / TLX tsl-lit). Surface-family
// svnoise (hash21), not sky vnoise (hash2) — GLX interpolates surfaceNoise
// which redefines vnoise. amt=1 is the full wobble; SAA hoists that at
// fs_main top (uniform CF) then mixes by per-fragment carPaint.
fn paintPeelN(N: vec3<f32>, objPos: vec3<f32>, vDist: f32, amt: f32) -> vec3<f32> {
  // amt is uniform per draw (the caller gates on D.mat1.w), so this early
  // return is uniform control flow: road/terrain/building draws — where the
  // peel is mixed by 0 anyway — skip 6 svnoise + 2 normalize + 2 cross per
  // fragment. The caller's dpdx(Npeel) stays at fs_main top level (legal:
  // a uniform-return callee does not poison the call site).
  if (amt <= 0.0) { return N; }
  let pFade = clamp(1.0 - (vDist - 18.0) / 50.0, 0.0, 1.0);
  let puv = objPos.xz * 34.0 + objPos.y * 29.0;
  let fuv = objPos.xz * 130.0 + objPos.y * 111.0;
  let pe = 0.09;
  let pb0 = svnoise(puv) * 0.6 + svnoise(fuv) * 0.4;
  let pbx = (svnoise(puv + vec2<f32>(pe, 0.0)) * 0.6 + svnoise(fuv + vec2<f32>(pe * 3.8, 0.0)) * 0.4) - pb0;
  let pby = (svnoise(puv + vec2<f32>(0.0, pe)) * 0.6 + svnoise(fuv + vec2<f32>(0.0, pe * 3.8)) * 0.4) - pb0;
  let pT = normalize(cross(N, vec3<f32>(0.0, 1.0, 0.001)) + vec3<f32>(1e-4));
  let pB = cross(N, pT);
  return normalize(N + (pT * pbx + pB * pby) * (0.22 * amt * pFade));
}
fn matScale(mid: i32) -> f32 {
  if (mid < 0 || mid > 16) { return 0.0; }
  return MatS.s[mid / 4][mid % 4];
}
fn matWallLike(mid: i32) -> bool {
  return mid == 1 || mid == 2 || mid == 4 || mid == 5 || mid == 7 || mid == 12 || mid == 13 || mid == 14;
}
fn matBumpHeight(mid: i32, uv: vec2<f32>) -> f32 {
  let hc = uv.x; let y = uv.y;
  if (mid == 1) {
    let seam = smoothstep(0.05, 0.0, abs(fract(y / 1.25) - 0.5) - 0.46);
    return svnoise(uv * 6.0) * 0.6 - seam * 0.5;
  } else if (mid == 2) {
    let ch = 0.20; let bl = 0.42; let mort = 0.06;
    let row = floor(y / ch); let off = (row % 2.0) * 0.5 * bl;
    let bx = fract((hc + off) / bl); let by = fract(y / ch);
    let joint = max(smoothstep(mort, 0.0, min(bx, 1.0 - bx) * bl),
                    smoothstep(mort, 0.0, min(by, 1.0 - by) * ch));
    return (1.0 - joint) * 0.5 + svnoise(vec2<f32>(floor((hc + off) / bl), row) * 4.0) * 0.10;
  } else if (mid == 4) { return svnoise(vec2<f32>(hc * 55.0, y * 3.0)) * 0.3;
  } else if (mid == 5) {
    let seam = smoothstep(0.05, 0.0, abs(fract(hc / 0.35) - 0.5) - 0.46);
    return (1.0 - seam) * 0.4 + svnoise(vec2<f32>(hc * 3.0, y * 22.0)) * 0.16;
  } else if (mid == 6) { return svnoise(uv * 3.2) * 0.5 + svnoise(uv * 11.0) * 0.3;
  } else if (mid == 7) { return sin(hc * 38.0) * 0.15 + sin(y * 38.0) * 0.15;
  } else if (mid == 8) { return sin(hc * 3.0 + svnoise(uv * 0.3) * 6.0) * 0.5 + svnoise(uv * 8.0) * 0.2;
  } else if (mid == 9) { return svnoise(uv * 6.0) * 0.4 + svnoise(uv * 20.0) * 0.25;
  } else if (mid == 10) { return svnoise(uv * 1.3) * 0.6 + svnoise(uv * 4.5) * 0.3 + svnoise(uv * 15.0) * 0.15;
  } else if (mid == 11) { return svnoise(uv * 1.8) * 0.45 + svnoise(uv * 21.0) * 0.18;
  } else if (mid == 12) {
    let ty = fract(y / 0.34);
    return sin(ty * 3.14159) * 0.5 + svnoise(vec2<f32>(hc * 2.0, floor(y / 0.34)) * 3.0) * 0.08;
  } else if (mid == 13) {
    let cell = floor(uv * 1.3);
    let f = fract(uv * 1.3) - hash21(cell) * 0.12;
    let d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return smoothstep(0.0, 0.16, d) * 0.55 + svnoise(uv * 5.0) * 0.15;
  } else if (mid == 14) { return sin(hc * 7.5) * 0.55 + svnoise(uv * 6.0) * 0.10;
  } else if (mid == 16) { return svnoise(uv * 9.0) * 0.34 + svnoise(uv * 26.0) * 0.16; }
  return 0.0;
}
fn matTexUV(mid: i32, nrm: vec3<f32>, wpos: vec3<f32>, uv_ptr: ptr<function, vec2<f32>>) -> bool {
  if (F.params8.w <= 0.001 || mid <= 0 || mid > 16) { return false; }
  let sc = matScale(mid);
  if (sc <= 0.0) { return false; }
  let an = abs(normalize(nrm));
  if (matWallLike(mid)) {
    *uv_ptr = vec2<f32>(select(wpos.x, wpos.z, an.x > an.z), wpos.y) / sc;
  } else {
    *uv_ptr = wpos.xz / sc;
  }
  return true;
}
// UV for a CONSTANT layer id (fs_main hoist). Same wall-vs-xz rule as
// matTexUV; scale 0 still divides by 1e-4 so the unused sample is defined.
fn matUvLit(mid: i32, nrm: vec3<f32>, wpos: vec3<f32>) -> vec2<f32> {
  let sc = max(matScale(mid), 1e-4);
  let an = abs(normalize(nrm));
  if (matWallLike(mid)) {
    return vec2<f32>(select(wpos.x, wpos.z, an.x > an.z), wpos.y) / sc;
  }
  return wpos.xz / sc;
}
// Baked pack is 256² (assets/pack/manifest.json). textureSampleLevel(..., 0)
// locked every layer to mip 0 — at range tarmac read as a flat smear vs GLX's
// implicit LOD. Footprint from fwWpos (hoisted in fs_main) picks a mip without
// needing derivative-bearing textureSample inside a matId branch.
fn matTexLod(fwUv: vec2<f32>) -> f32 {
  // Geometric mean, not max(): max(ddx,ddy) at chase grazing is the
  // foreshortened axis and jumps to mip 7–8 (flat smear). GLX texture() +
  // aniso 4 tracks the minor axis. textureSampleLevel cannot use aniso, so
  // the LOD itself has to stay closer to that minor axis.
  let sx = max(fwUv.x, 1e-6) * 256.0;
  let sy = max(fwUv.y, 1e-6) * 256.0;
  return clamp(log2(sqrt(sx * sy)) - 0.35, 0.0, 8.0);
}
fn applyMaterialTexNormal(mid: i32, N_ptr: ptr<function, vec3<f32>>, vd: f32, wpos: vec3<f32>, fwWpos: vec3<f32>, litNrm: vec4<f32>, packOn: bool) {
  var uv = vec2<f32>(0.0);
  if (!matTexUV(mid, *N_ptr, wpos, &uv)) { return; }
  let fade = clamp(1.0 - (vd - 22.0) / 58.0, 0.0, 1.0);
  if (fade <= 0.005) { return; }
  let sc = matScale(mid);
  let an = abs(normalize(*N_ptr));
  let fwUv = select(fwWpos.xz, vec2<f32>(select(fwWpos.x, fwWpos.z, an.x > an.z), fwWpos.y), matWallLike(mid)) / max(sc, 1e-4);
  let fp = max(fwUv.x, fwUv.y);
  let aa = clamp(1.0 - (fp - 0.02) / 0.30, 0.0, 1.0);
  if (aa <= 0.005) { return; }
  // Pack layers 1..16 (except glass/flag) are hoisted in fs_main with
  // textureSample — implicit LOD + aniso 4, GLX texture() parity.
  // textureSampleLevel cannot use aniso (washed walls / ribbon).
  let hoisted = packOn && mid >= 1 && mid <= 16 && mid != 3 && mid != 15;
  // if, not select(): both select arms evaluate, so hoisted materials (nearly
  // all) still paid this dependent sample + matTexLod's log2/sqrt.
  // textureSampleLevel (explicit LOD) is legal in non-uniform control flow.
  var nrmSample = litNrm;
  if (!hoisted) {
    nrmSample = textureSampleLevel(matNormalTex, matSamp, uv, mid, matTexLod(fwUv));
  }
  let dxy = (nrmSample.xy - 0.5) * 2.0;
  let T = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), *N_ptr) + vec3<f32>(1e-5, 0.0, 0.0));
  let B = cross(*N_ptr, T);
  let amt = select(0.55, 0.10, mid == 16) * F.params8.w * fade * aa;
  *N_ptr = normalize(*N_ptr + (T * dxy.x + B * dxy.y) * amt);
}
fn applyMaterialNormal(mid: i32, N_ptr: ptr<function, vec3<f32>>, vd: f32, wpos: vec3<f32>, fwWpos: vec3<f32>, litNrm: vec4<f32>, packOn: bool) {
  if (mid == 0 || mid == 3 || mid == 15 || mid >= 20) { return; }
  let bumpFade = clamp(1.0 - (vd - 22.0) / 58.0, 0.0, 1.0);
  if (bumpFade <= 0.005) { return; }
  var N = *N_ptr;
  if (matWallLike(mid)) {
    let an = abs(N);
    let hc = select(wpos.x, wpos.z, an.x > an.z);
    let y = wpos.y;
    let fwHc = select(fwWpos.x, fwWpos.z, an.x > an.z);
    let fwY = fwWpos.y;
    let fp = max(fwHc, fwY);
    let aaFade = clamp(1.0 - (fp - 0.04) / 0.22, 0.0, 1.0);
    if (aaFade <= 0.005) { return; }
    let T = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), N) + vec3<f32>(1e-5, 0.0, 0.0));
    let e = 0.05;
    let h0 = matBumpHeight(mid, vec2<f32>(hc, y));
    let hx = matBumpHeight(mid, vec2<f32>(hc + e, y));
    let hy = matBumpHeight(mid, vec2<f32>(hc, y + e));
    let amt = select(select(0.05, 0.09, mid == 12 || mid == 14), 0.10, mid == 2 || mid == 13);
    N = normalize(N + (T * (h0 - hx) + vec3<f32>(0.0, 1.0, 0.0) * (h0 - hy)) * (amt * bumpFade * aaFade / e));
  } else {
    let p = wpos.xz;
    let fpG = max(fwWpos.x, fwWpos.z);
    let aaG = clamp(1.0 - (fpG - 0.10) / 0.55, 0.0, 1.0);
    if (aaG <= 0.005) { return; }
    let e = 0.22;
    let h0 = matBumpHeight(mid, p);
    let hx = matBumpHeight(mid, p + vec2<f32>(e, 0.0));
    let hz = matBumpHeight(mid, p + vec2<f32>(0.0, e));
    let amt = select(select(select(0.07, 0.025, mid == 16), 0.14, mid == 10), 0.16, mid == 8);
    N = normalize(N + vec3<f32>(h0 - hx, 0.0, h0 - hz) * (amt * bumpFade * aaG / e));
  }
  *N_ptr = N;
  applyMaterialTexNormal(mid, N_ptr, vd, wpos, fwWpos, litNrm, packOn);
}
fn applyMaterial(mid: i32, albedo_ptr: ptr<function, vec3<f32>>, rough_ptr: ptr<function, f32>, vd: f32, wpos: vec3<f32>, nrm: vec3<f32>, fwWpos: vec3<f32>, litPack: vec4<f32>, packOn: bool) {
  if (mid == 0) { return; }
  let far = clamp(1.0 - (vd - 90.0) / 170.0, 0.0, 1.0);
  if (far <= 0.001) { return; }
  let near = clamp(1.0 - (vd - 26.0) / 64.0, 0.0, 1.0);
  let an = abs(normalize(nrm));
  let wall = an.y < 0.6;
  let hc = select(wpos.x, wpos.z, an.x > an.z);
  let y = wpos.y;
  let fwHc = select(fwWpos.x, fwWpos.z, an.x > an.z);
  let fwY = fwWpos.y;
  var albedo = *albedo_ptr;
  var rough = *rough_ptr;
  if (mid == 1) {
    albedo = albedo * (1.0 + (svnoise(wpos.xz * 0.09 + y * 0.05) - 0.5) * 0.16 * far);
    albedo = albedo * (1.0 + (svnoise(vec2<f32>(hc, y) * 6.0) - 0.5) * 0.10 * near);
    if (wall) {
      albedo = albedo * (1.0 - smoothstep(max(0.05, fwY / 1.25), 0.0, abs(fract(y / 1.25) - 0.5) - 0.46) * 0.14 * near);
    }
    rough = min(1.0, rough + 0.08 * far);
  } else if (mid == 2) {
    let ch = 0.20; let bl = 0.42; let mort = 0.06;
    let row = floor(y / ch); let off = (row % 2.0) * 0.5 * bl;
    let bx = fract((hc + off) / bl); let by = fract(y / ch);
    let mortAA = max(mort, max(fwHc, fwY));
    let joint = max(smoothstep(mortAA, 0.0, min(bx, 1.0 - bx) * bl),
                    smoothstep(mortAA, 0.0, min(by, 1.0 - by) * ch));
    let bh = svnoise(vec2<f32>(floor((hc + off) / bl), row) * 1.3);
    let brick = albedo * (0.82 + bh * 0.42) * vec3<f32>(1.06, 0.99, 0.92);
    let mortar = mix(albedo, vec3<f32>(0.60, 0.58, 0.55), 0.6);
    albedo = mix(brick, mortar, joint * near);
    rough = min(1.0, rough + 0.12 * far);
  } else if (mid == 3) {
    let pw = 1.6; let ph = 1.4; let mull = 0.11;
    let gx = fract(hc / pw); let gy = fract(y / ph);
    let mullAA = max(mull, max(fwHc / pw, fwY / ph));
    let bar = max(smoothstep(mullAA, 0.0, min(gx, 1.0 - gx)),
                  smoothstep(mullAA, 0.0, min(gy, 1.0 - gy)));
    albedo = albedo * (1.0 + (svnoise(vec2<f32>(floor(hc / pw), floor(y / ph)) * 1.7) - 0.5) * 0.5 * far);
    albedo = mix(albedo, albedo * 0.32, bar * near);
    rough = mix(rough, min(rough, 0.12), near);
  } else if (mid == 4) {
    let brushFade = clamp(1.0 - (vd - 26.0) / 29.0, 0.0, 1.0);
    albedo = albedo * (1.0 + (svnoise(vec2<f32>(hc * 40.0, y * 2.0)) - 0.5) * 0.12 * brushFade);
    rough = clamp(rough - 0.15 * far, 0.05, 1.0);
  } else if (mid == 5) {
    albedo = albedo * (1.0 + (svnoise(vec2<f32>(hc * 3.0, y * 22.0)) - 0.5) * 0.18 * near);
    albedo = albedo * (1.0 - smoothstep(max(0.05, fwHc / 0.35), 0.0, abs(fract(hc / 0.35) - 0.5) - 0.46) * 0.16 * near);
  } else if (mid == 6) {
    let d = svnoise(wpos.xz * 2.4 + wpos.y * 1.6) * 0.6 + svnoise(wpos.xz * 9.0) * 0.4 * near;
    albedo = albedo * (1.0 + (d - 0.5) * 0.34 * far);
    albedo.g = albedo.g * (1.0 + (d - 0.5) * 0.10 * far);
  } else if (mid == 7) {
    let weaveFade = clamp(1.0 - (vd - 26.0) / 34.0, 0.0, 1.0);
    albedo = albedo * (1.0 + (svnoise(vec2<f32>(hc, y) * 26.0) - 0.5) * 0.14 * weaveFade);
  } else if (mid == 8) {
    albedo = albedo * (1.0 + (svnoise(wpos.xz * 5.0) - 0.5) * 0.12 * near
                          + sin(wpos.x * 0.7 + svnoise(wpos.xz * 0.2) * 6.0) * 0.05 * far);
  } else if (mid == 9) {
    let g = svnoise(wpos.xz * 3.5) * 0.6 + svnoise(wpos.xz * 14.0) * 0.4 * near - 0.5;
    albedo = albedo * (1.0 + g * 0.22 * far);
    albedo.g = albedo.g * (1.0 + g * 0.08 * far);
  } else if (mid == 10) {
    let r = svnoise(wpos.xz * 0.9 + y * 0.6) * 0.6 + svnoise(wpos.xz * 4.5) * 0.4 - 0.5;
    albedo = albedo * (1.0 + r * 0.30 * far);
    rough = min(1.0, rough + 0.16 * far);
  } else if (mid == 11) {
    let s = svnoise(wpos.xz * 1.6 + y * 0.4) - 0.5;
    albedo = albedo * (1.0 + s * 0.10 * far);
    albedo.b = albedo.b * (1.0 - s * 0.05 * far);
    let sparkleFade = clamp(1.0 - (vd - 26.0) / 34.0, 0.0, 1.0);
    albedo = albedo * (1.0 + (svnoise(wpos.xz * 24.0) - 0.5) * 0.06 * sparkleFade);
    rough = clamp(rough - 0.10 * far, 0.05, 1.0);
  } else if (mid == 12) {
    let ty = fract(y / 0.34);
    let shadeAA = clamp(1.0 - (fwY / 0.34) * 6.0, 0.0, 1.0);
    albedo = albedo * (0.88 + sin(ty * 3.14159) * shadeAA * 0.16);
    albedo = albedo * (1.0 + (svnoise(vec2<f32>(hc * 2.0, floor(y / 0.34)) * 3.0) - 0.5) * 0.14 * near);
    rough = min(1.0, rough + 0.10 * far);
  } else if (mid == 13) {
    let cell = floor(vec2<f32>(hc, y) * 1.3);
    let f = fract(vec2<f32>(hc, y) * 1.3) - hash21(cell) * 0.12;
    let d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    let jointAA = max(0.16, max(fwHc * 1.3, fwY * 1.3));
    let joint = smoothstep(0.0, jointAA, d);
    let block = albedo * (0.80 + hash21(cell) * 0.4);
    let mortar = mix(albedo, vec3<f32>(0.42, 0.40, 0.37), 0.65);
    albedo = mix(mortar, block, joint * near);
    rough = min(1.0, rough + 0.18 * far);
  } else if (mid == 14) {
    let ridgePhase = hc * 7.5;
    let ridgeAA = clamp(1.0 - (fwHc * 7.5) * 3.0, 0.0, 1.0);
    albedo = albedo * (0.85 + sin(ridgePhase) * ridgeAA * 0.18);
    let rust = smoothstep(0.55, 0.9, svnoise(vec2<f32>(hc * 0.8, y * 0.35) + 5.0));
    albedo = mix(albedo, albedo * vec3<f32>(0.62, 0.42, 0.28), rust * 0.5 * far);
    rough = min(1.0, rough + 0.14 * far);
  } else if (mid == 16) {
    albedo = albedo * (1.0 + (svnoise(wpos.xz * 0.035) - 0.5) * 0.10 * far);
    albedo = albedo * (1.0 + (svnoise(wpos.xz * 7.0) - 0.5) * 0.13 * near);
    rough = min(1.0, rough + 0.10 * far);
  }
  var tuv = vec2<f32>(0.0);
  let hoisted = packOn && mid >= 1 && mid <= 16 && mid != 3 && mid != 15;
  if (hoisted) {
    // Implicit-LOD + aniso sample hoisted in fs_main (GLX texture()).
    let k = F.params8.w * far;
    albedo = mix(albedo, albedo * litPack.rgb * 2.0, k);
    rough = clamp(mix(rough, litPack.a, k * 0.8), 0.04, 1.0);
  } else if (matTexUV(mid, nrm, wpos, &tuv)) {
    let scT = matScale(mid);
    let fwUvT = select(fwWpos.xz, vec2<f32>(select(fwWpos.x, fwWpos.z, an.x > an.z), fwWpos.y), matWallLike(mid)) / max(scT, 1e-4);
    let t = textureSampleLevel(matAlbedoTex, matSamp, tuv, mid, matTexLod(fwUvT));
    let k = F.params8.w * far;
    albedo = mix(albedo, albedo * t.rgb * 2.0, k);
    rough = clamp(mix(rough, t.a, k * 0.8), 0.04, 1.0);
  }
  *albedo_ptr = albedo;
  *rough_ptr = rough;
}
fn roadMarkings(albedo_ptr: ptr<function, vec3<f32>>, rough_ptr: ptr<function, f32>, trk: vec3<f32>, fwTrk: vec3<f32>) {
  let hw = trk.z;
  if (hw <= 0.5) { return; }
  let s = trk.x; let x = trk.y;
  let paint = vec3<f32>(0.95, 0.95, 0.97);
  // UNCLAMPED lateral footprint drives minification fade. GLX clamps first then
  // feeds the same value into mip — when fw hits the 0.30 AA ceiling, mip is
  // exactly 0 and every edge/centre line vanishes. That ceiling is routine on
  // phone WGX (lite DPR 1.5 + chase grazing), which is why WebGPU tarmac reads
  // as a bare ribbon while WebGL2 on the same device still shows paint.
  let fwX = max(fwTrk.y, 1e-4);
  let aaX = min(fwX, 0.30);
  let dEdge = abs(abs(x) - (hw - 0.10));
  let edge = 1.0 - smoothstep(0.10 - aaX, 0.10 + aaX, dEdge);
  let band = 1.0 - smoothstep(0.30 - aaX, 0.30 + aaX, abs(x));
  let ph = fract(s / 7.0);
  let fwS = max(fwTrk.x, 1e-4);
  let aaS = min(fwS / 7.0, 0.24);
  let dash = 1.0 - smoothstep(0.25 - aaS, 0.25 + aaS, abs(ph - 0.25));
  // Soft knee on the RAW footprint: still gone by ~0.65 m/px, but a saturated
  // AA clamp (fwX==0.30) keeps ~64% amplitude instead of erasing the paint.
  let mip = clamp(1.0 - (fwX - 0.10) / 0.55, 0.0, 1.0);
  let m = max(edge, band * dash) * mip;
  *albedo_ptr = mix(*albedo_ptr, paint, m);
  *rough_ptr = mix(*rough_ptr, 0.55, m);
}
`;

  const tonemap = `
fn acesTonemap(x0: vec3<f32>, a: f32, b: f32, c: f32, d: f32, e: f32) -> vec3<f32> {
  // Sign guard, mirroring GLXChunks.tonemap: the curve rises back out of the
  // negatives (x=-0.2417 clips to pure WHITE), and SHARPEN's overshoot is
  // unclamped, so a negative here paints a white fringe on a dark edge.
  let x = max(x0, vec3<f32>(0.0));
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}`;

  //    gl_VertexID trick, js/render/shaders/sky.js / post.js). draw(3) with no vertex buffers; WGSL
  //    generates the NDC positions from @builtin(vertex_index).
  const fullscreenTri = `
fn fsTriNDC(vi: u32) -> vec2<f32> {
  // p = vec2((vi<<1)&2, vi&2) * 2 - 1  — the exact GLX SKY_VS derivation.
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  return vec2<f32>(x, y) * 2.0 - vec2<f32>(1.0);
}`;

  //    Verbatim port of GLX's D_GGX / V_SmithGGX / F_Schlick (js/render/shaders/lit.js),
  //    the single-source math leaf the migration plan names (§2a). Any future
  //    edit to the microfacet model happens here, mirrored into the GLSL leaf.
  const brdf = `
const PI : f32 = 3.14159265359;
fn D_GGX(NoH: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = (NoH * NoH) * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-6);
}
// Height-correlated Smith visibility (folds in the 1/(4 NoL NoV) denominator).
fn V_SmithGGX(NoV: f32, NoL: f32, a: f32) -> f32 {
  let a2 = a * a;
  let gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  let gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
// Roughness-aware Schlick (f90 = 1-roughness, Frostbite grazing cap).
fn F_Schlick(VoH: f32, f0: vec3<f32>, f90: f32) -> vec3<f32> {
  let v = 1.0 - VoH; let v2 = v * v;
  return f0 + (vec3<f32>(f90) - f0) * (v2 * v2 * v);
}`;

  // LIT: WGSL port of js/render/shaders/lit.js (LIT_VS/LIT_FS). Uniform layout must match wgx.js _writeFrame/_writeDraw.
  const LIT = `
struct FrameU {
  viewProj   : mat4x4<f32>,   // off   0
  eye        : vec4<f32>,     // off  64  (xyz eye)
  sunDir     : vec4<f32>,     // off  80
  sunColor   : vec4<f32>,     // off  96
  ambSky     : vec4<f32>,     // off 112
  ambGround  : vec4<f32>,     // off 128
  skyZenith  : vec4<f32>,     // off 144
  skyHorizon : vec4<f32>,     // off 160
  fogColor   : vec4<f32>,     // off 176
  params0    : vec4<f32>,     // off 192  (fogDensity, fogHeight, time, numLights)
  params1    : vec4<f32>,     // off 208  (keyMul, glowAmp, wetness, cloud)
  lightVP    : mat4x4<f32>,   // off 224  sun light-space view-proj (shadow, Phase 3)
  params2    : vec4<f32>,     // off 288  (shadowOn, shadowStrength, shadowTexel, shadowBias)
  params3    : vec4<f32>,     // off 304  (bounceK, fogTint, groundMist, mistHeight) — live tuner knobs
  params4    : vec4<f32>,     // off 320  (pcssPen, shadowTintAmt, carReflect, ssrStrength) — Phase-4 deferred knobs
  params5    : vec4<f32>,     // off 336  (envProbeStr, cloudSpeed, cloudShadowDim, mistShare) — env-cube probe strength (0 = analytic sky only), cloud-shadow drift rate, cloud-shadow depth, ground-mist share of the lamp-fog glow
  shadowCtr  : vec4<f32>,     // off 352  (xyz unsnapped shadow-box anchor — fade origin; w shadowRange = box half-size m)
  params6    : vec4<f32>,     // off 368  (wetDark, carShadowOn, carSparkle, fogSunCore) — wet darkening + car-shadow arm flag + pure-look sparkle/fog knobs (zw always packed; WGSL reads them directly)
  carLightVP : mat4x4<f32>,   // off 384  Z01-remapped car-shadow view-proj (per-frame car-only map)
  params7    : vec4<f32>,     // off 448  (fogClip, carSunGlint, neonBoost, lampNearClamp)
  lampLightVP: mat4x4<f32>,   // off 464  Z01-remapped nearest-floodlight spot VP
  params8    : vec4<f32>,     // off 528  (lampFog, lampShadowOn, lampIdx, matTexMix)
  params9    : vec4<f32>,     // off 544  (ambContactDark, lampWallSpill, windowSunFlash, skyRimGlow)
};                            // size 560
struct Light {
  posRad   : vec4<f32>,       // xyz pos, w radius
  colBleed : vec4<f32>,       // xyz colour*intensity, w out-of-beam bleed
  dirVol   : vec4<f32>,       // xyz beam aim, w volW (godray — unused here)
  cone     : vec4<f32>,       // x cosInner, y cosOuter, z glareW (unused), w pad
};                            // size 64
struct DrawU {
  model : mat4x4<f32>,        // off  0
  mat0  : vec4<f32>,          // off 64  (emissive, alpha, roughness, metalness)
  mat1  : vec4<f32>,          // off 80  (specular, detail, clearcoat, carPaint)
  mat2  : vec4<f32>,          // off 96  (sparkle, instanced, surfaceId, buryRibbon)
  mat3  : vec4<f32>,          // off 112 (lampMask lo24, lampMask hi24, 0, 0) — chunk-AABB
                              //         lamp cull, bit-exact (see the lamp loop); each mask
                              //         float holds a 24-bit integer exactly. All-ones
                              //         (16777215) = unmasked, the default for every draw.
};                            // size 128
struct MatScaleU { s : array<vec4<f32>, 5> };
@group(0) @binding(0) var<uniform> F : FrameU;
@group(0) @binding(1) var<storage, read> lights : array<Light, 48>;
@group(0) @binding(2) var shadowTex  : texture_depth_2d;
@group(0) @binding(3) var shadowSamp : sampler_comparison;
// ── Phase-4 deferred bindings (wgx.js binds real resources; placeholders are safe) ──
//   @binding(4) envCube   : texture_cube<f32>  — environment reflection probe
//                           (mirrors GLX uCarReflect env-mirror). 1×1 placeholder
//                           when no probe is captured; carReflect=0 makes it a no-op.
//   @binding(5) envSamp   : sampler            — filtering sampler for SSR + PCSS blocker
//                           (NOT the cube — cube anisotropy is envCubeSamp).
//   @binding(6) ssrTex    : texture_2d<f32>    — screen-space-reflection result
//                           (Phase-4 post pass, wgsl-post.js). 1×1 placeholder is safe;
//                           ssrStrength=0 or non-up/dry surfaces make it a no-op.
@group(0) @binding(4) var envCube : texture_cube<f32>;
@group(0) @binding(5) var envSamp : sampler;
@group(0) @binding(6) var ssrTex  : texture_2d<f32>;
@group(0) @binding(7) var blockerTex : texture_2d<f32>;      // PCSS-lite min-depth blocker map (512², r16float)
@group(0) @binding(8) var carShadowTex : texture_depth_2d;   // per-frame car-only shadow map (shares shadowSamp)
@group(0) @binding(9) var matAlbedoTex : texture_2d_array<f32>;
@group(0) @binding(10) var matNormalTex : texture_2d_array<f32>;
@group(0) @binding(11) var matSamp : sampler;
@group(0) @binding(12) var lampShadowTex : texture_depth_2d;
@group(0) @binding(13) var<uniform> MatS : MatScaleU;
@group(0) @binding(14) var envCubeSamp : sampler;            // 4× aniso, GLX env cube
@group(1) @binding(0) var<uniform> D : DrawU;
@group(2) @binding(0) var<storage, read> matTrkArr : array<vec4<f32>>;
// Reconstruct (mat, s, x, hw) from world XZ via the 32×32×16 centerline LUT
// uploaded by WGX._makeRoadLUT. Magic 12345 distinguishes a LUT from the
// dummy / per-vertex attr buffer. Uniform 16-iteration loop — no data-
// dependent break — so the caller may take dpdx of the result.
fn trkFromWorld(wp: vec3<f32>) -> vec4<f32> {
  let h0 = matTrkArr[0];
  let h1 = matTrkArr[1];
  let gated = h0.x == 12345.0;
  let ext = max(h1.xy, vec2<f32>(1.0));
  let gw = max(h1.z, 1.0);
  let gh = max(h1.w, 1.0);
  let uv = clamp((wp.xz - h0.yz) / ext, vec2<f32>(0.0), vec2<f32>(0.999));
  let gx = u32(uv.x * gw);
  let gz = u32(uv.y * gh);
  let base = select(0u, 2u + (gx + gz * u32(gw)) * 16u, gated);
  var bestD = 1e20;
  var best = vec4<f32>(0.0);
  var best2 = vec4<f32>(0.0);
  var bestD2 = 1e20;
  for (var i = 0u; i < 16u; i = i + 1u) {
    let p = matTrkArr[base + i];
    let d = select(1e20, dot(wp.xz - p.xy, wp.xz - p.xy), gated);
    let take = d < bestD;
    best2 = select(best2, best, take);
    bestD2 = select(bestD2, bestD, take);
    best = select(best, p, take);
    bestD = select(bestD, d, take);
    // Require a spatially distinct second sample — a lone centerline point
    // left best2 at the origin and produced a garbage tangent, so lateral x
    // blew past hw and terrain discard never punched the ribbon footprint.
    let sep = dot(p.xy - best.xy, p.xy - best.xy);
    let take2 = (d < bestD2) && !take && sep > 0.25;
    best2 = select(best2, p, take2);
    bestD2 = select(bestD2, d, take2);
  }
  let tangRaw = best2.xy - best.xy;
  // best2.w carries sample hw — origin placeholder (w=0) must not invent a tangent.
  let tangOk = best2.w > 0.5 && dot(tangRaw, tangRaw) > 1e-4;
  let tang = normalize(select(vec2<f32>(1.0, 0.0), tangRaw, tangOk));
  // Face +s so lateral x does not flip when the nearest sample swaps, and
  // dashed paint can use a continuous along-track s (nearest-bin s stair-steps).
  let sSign = select(1.0, sign(best2.z - best.z), abs(best2.z - best.z) > 1e-3);
  let tangFwd = tang * sSign;
  let right = vec2<f32>(tangFwd.y, -tangFwd.x);
  let x = select(0.0, dot(wp.xz - best.xy, right), tangOk);
  let ds = select(0.0, dot(wp.xz - best.xy, tangFwd), tangOk);
  // Two-sample s-blend warped the near dash (measured). Nearest + ds
  // stair-steps at cell swaps but keeps rectangular paint.
  let s = best.z + ds;
  let hw = best.w;
  let dCenter = sqrt(bestD);
  // Prefer perpendicular distance when a real tangent exists. Point-distance
  // alone rejects on-ribbon fragments: 32×32 cells are tens of metres across,
  // so the nearest centerline sample can sit far along-track.
  // Hole is tarmac + kerb lip only (~0.55 m). hw+2.4 ate the barrier line
  // and the first terrain rail (verge / berms at ~hw+2.2). Without a tangent,
  // a circle of radius hw+0.8 stays on the ribbon — hw+8 ate a disk of walls.
  let onRibbon = select(dCenter <= hw + 0.8, abs(x) <= hw + 0.55, tangOk);
  let valid = gated && hw > 0.5 && onRibbon;
  // xyz = track (s, lateral x, half-width); w = 1 when the LUT hit is valid.
  // Asphalt vs verge is classified in fs_main from abs(x) < hw - 0.45.
  return select(vec4<f32>(0.0), vec4<f32>(s, x, hw, 1.0), valid);
}
${hash}
${vnoise}
${brdf}
${matLib}

// Drifting cloud-shadow dapple (GLX parity, js/render/shaders/lit.js
// cloudFBM/cloudShadow): FBM sampled where the sun ray through the receiver
// meets a 360 m cloud deck, drifted by time × CLOUD SPEED so the ground dapple
// moves in lockstep with the sky. cover = F.params1.w, cloudSpeed = F.params5.y.
// Was entirely missing from the WebGPU port — partly-cloudy day tracks read
// uniformly lit while WebGL2 showed cloud shadows crossing the track.
fn cloudFBM(p_in: vec2<f32>) -> f32 {
  var p = p_in; var s = 0.0; var a = 0.5;
  for (var i = 0; i < 2; i = i + 1) { s = s + a * svnoise(p); p = p * 2.03 + 1.7; a = a * 0.5; }
  return s;
}
fn cloudShadow(wp: vec3<f32>) -> f32 {
  let cover = F.params1.w;
  // Divisor floored at 0.15 (not the 0.06 cutoff): near-grazing sun rays blow
  // the deck-intersection offset up and over-sample the noise into stripes —
  // same fix as GLX.
  if (cover <= 0.001 || F.sunDir.y <= 0.06) { return 0.0; }
  let t = (360.0 - wp.y) / max(F.sunDir.y, 0.15);
  let cT = F.params0.z * F.params5.y;
  let cp = (wp.xz + F.sunDir.xz * t) * 0.0052 + vec2<f32>(cT * 0.012, cT * 0.005);
  return smoothstep(0.54 - cover * 0.40, 0.92, cloudFBM(cp)) * cover;
}

fn findBlocker(suv : vec2<f32>, bt : f32) -> f32 {
  let d0 = textureSampleLevel(blockerTex, envSamp, suv + vec2<f32>(-bt,  bt), 0.0).r;
  let d1 = textureSampleLevel(blockerTex, envSamp, suv + vec2<f32>( bt,  bt), 0.0).r;
  let d2 = textureSampleLevel(blockerTex, envSamp, suv + vec2<f32>(-bt, -bt), 0.0).r;
  let d3 = textureSampleLevel(blockerTex, envSamp, suv + vec2<f32>( bt, -bt), 0.0).r;
  return min(min(d0, d1), min(d2, d3));
}

struct VSOut {
  @builtin(position) clip  : vec4<f32>,
  @location(0)       nrm   : vec3<f32>,
  @location(1)       col   : vec3<f32>,
  @location(2)       wpos  : vec3<f32>,
  // vec3, not vec4: Dawn drops location-3 .w and that poisoned interpolated s.
  // Default perspective — @interpolate(linear) shattered dashes at chase
  // angle (measured).
  @location(3)       trk : vec3<f32>,
  @location(4) @interpolate(flat) matId : f32,
  @location(5)       objPos : vec3<f32>,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vid : u32,
  @location(0) aPos : vec3<f32>,
  @location(1) aNrm : vec3<f32>,
  @location(2) aCol : vec3<f32>,
  @location(5) aInst0 : vec4<f32>,
  @location(6) aInst1 : vec4<f32>,
  @location(7) aInst2 : vec4<f32>,
  @location(8) aInst3 : vec4<f32>,
  @location(9) aInstColor : vec3<f32>,
) -> VSOut {
  var o : VSOut;
  var model = D.model;
  var col = aCol;
  if (D.mat2.y > 0.5) {
    model = mat4x4<f32>(aInst0, aInst1, aInst2, aInst3);
    col = aCol * aInstColor;
  }
  var wp = model * vec4<f32>(aPos, 1.0);
  // Upper-left 3x3 of the (column-major) model matrix — GLX mat3(uModel).
  let nm = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
  // No 4th vertex attribute — Dawn zeros it (and pos fetch) even in a
  // separate stride-16 slot. Road pieces bind authored storage[vid]
  // (mat,s,x,hw). The LUT (magic 12345) is only a fallback when group 2
  // is the world grid — using it at every road vertex stair-steps dashes.
  var pulled = vec4<f32>(0.0);
  if (matTrkArr[0].x != 12345.0) {
    pulled = matTrkArr[vid];
  } else if (D.mat2.z > 15.5 && D.mat2.z < 16.5) {
    let wt = trkFromWorld(wp.xyz);
    if (wt.w > 0.5) {
      let mid = select(0.0, 16.0, abs(wt.y) < wt.z - 0.45);
      pulled = vec4<f32>(mid, wt.x, wt.y, wt.z);
    }
  }
  // Do not lift the ribbon. An 8 cm Y bump won the floor/terrain depth
  // fight and then buried cars, AI, and fence feet in the tarmac.
  o.trk = pulled.yzw;           // s, x, hw — vec3 at location 3
  o.matId = pulled.x;
  o.nrm  = nm * aNrm;
  o.col  = col;
  o.wpos = wp.xyz;
  o.objPos = aPos;              // object space: paint flake / orange-peel (GLX vObjPos)
  o.clip = F.viewProj * wp;
  return o;
}

@fragment
fn fs_main(in : VSOut, @builtin(front_facing) ff : bool) -> @location(0) vec4<f32> {
  // Screen-space derivatives MUST be computed in uniform control flow at the top level
  // before any branching or early exit.
  let fwWpos = abs(dpdx(in.wpos)) + abs(dpdy(in.wpos));
  let fwTrkAttr = abs(dpdx(in.trk)) + abs(dpdy(in.trk));
  let fromWorld = trkFromWorld(in.wpos);
  // fromWorld.xyz is (s, x, hw) — not .yzw (that was x/hw/valid and smashed dash AA).
  let fwWorld = abs(dpdx(fromWorld.xyz)) + abs(dpdy(fromWorld.xyz));
  let isRoadDraw = D.mat2.z > 15.5 && D.mat2.z < 16.5;
  // Location-3 in.trk shards dashes on Dawn (loc5 / linear / perspective
  // all measured). Road markings reconstruct (s,x,hw) per fragment from
  // interpolated wpos + the world LUT — bind group 2 is the LUT, not
  // authored storage[vid]. LUT miss on a road draw zeros trk so we do
  // not fall back to the shattered interpolator.
  let useWorldTrk = fromWorld.w > 0.5;
  let vTrk = select(select(vec3<f32>(0.0), in.trk, !isRoadDraw), fromWorld.xyz, useWorldTrk);
  let lutAsphalt = abs(fromWorld.y) < fromWorld.z - 0.45;
  let vsMat = in.matId;
  let classified = select(select(0.0, 16.0, lutAsphalt), vsMat, vsMat > 0.5);
  // surfaceId 16 is the isRoadDraw flag, not a material stamp. Forcing 16
  // on every fragment painted kerbs, grass shoulders, and skirts as asphalt.
  let vMatId = select(D.mat2.z, classified, isRoadDraw || classified > 0.5);
  let fwTrk = select(fwTrkAttr, fwWorld, useWorldTrk);
  let vDist = length(in.wpos - F.eye.xyz);
  // ONE dynamic-layer sample replaces the old 30-sample hoist (13 albedo +
  // 13 normal + 2 road layers sampled, 28 discarded per fragment). WGSL only
  // requires that textureSample (implicit LOD + aniso) sit in UNIFORM CONTROL
  // FLOW — the layer index and UV may be non-uniform EXPRESSIONS. That is
  // exactly GLX's texture(matTex, vec3(uv, layer)) path: same implicit LOD,
  // same aniso, same quad divergence at material seams (GLX ships it).
  // matUvLit(16) == the old roadUv (road is not wall-like, same wpos.xz/sc),
  // so the road folds into the same lookup. Identity layers (0/3/15) still
  // sample — the result is select()ed away, keeping the call unconditional.
  let topNgeo = normalize(in.nrm);
  let identPack = vec4<f32>(0.5, 0.5, 0.5, 0.5);
  let packOn = F.params8.w > 0.001;
  let midClamp = clamp(i32(vMatId + 0.5), 0, 16);
  let isIdentMat = midClamp == 0 || midClamp == 3 || midClamp == 15;
  let uvSel = matUvLit(midClamp, topNgeo, in.wpos);
  let sampAlbedo = textureSample(matAlbedoTex, matSamp, uvSel, midClamp);
  let sampNormal = textureSample(matNormalTex, matSamp, uvSel, midClamp);
  let litPack = select(sampAlbedo, identPack, isIdentMat);
  let litNrm = select(sampNormal, identPack, isIdentMat);
  // GLX takes dFdx(N) AFTER orange-peel + applyMaterialNormal. The matId
  // bump is non-uniform — a dpdx after that branch is the NaN-white-road
  // class. Peel is a function of interpolators only, so hoist it here
  // (uniform CF), take both geometric and peel derivatives, then mix SAA
  // by per-fragment carPaint. Clearcoat stays on geometric N (GLX Ngeo).
  let ccDx = dpdx(topNgeo);
  let ccDy = dpdy(topNgeo);
  // Same value — the old second dpdx/dpdy pair of topNgeo relied on the
  // compiler to CSE across divergent later uses; reuse explicitly.
  let saaDxGeo = ccDx;
  let saaDyGeo = ccDy;
  // Paint peel ran for EVERY fragment — road, terrain, buildings — feeding a
  // mix whose factor (carPaint, D.mat1.w) is 0 on all of them. The gate lives
  // INSIDE paintPeelN as a uniform early return (see its header) so these
  // derivatives stay at fs_main top level, before any branch. Non-paint
  // draws get Npeel == topNgeo, so saaDxPeel == ccDx — mixed by 0 regardless.
  let peelAmt = select(0.0, 1.0, D.mat1.w > 0.001);
  let Npeel = paintPeelN(topNgeo, in.objPos, vDist, peelAmt);
  let saaDxPeel = dpdx(Npeel);
  let saaDyPeel = dpdy(Npeel);
  // Floor + terrain only. The 1600 m scenery slab is skipped on WGX
  // (G.roadLutReady); a screen-footprint "slab" test also punched long
  // barrier / grandstand faces that sit on the ribbon.
  let bury = D.mat2.w > 0.5;
  if (bury && !isRoadDraw && fromWorld.w > 0.5) {
    discard;
  }

  var N = topNgeo;
  // Two-sided lighting: flip N to face the viewer on back faces (double-sided
  // wheel/body draws) — GLX LIT_FS gl_FrontFacing branch (js/render/shaders/lit.js).
  // Skip that on the road. buildRoad writes upOf = cross(right, tangent)
  // (track-up). _expandPull swaps winding so Dawn rasterizes the tops, which
  // makes them back-facing under frontFace cw — the ff flip would invert
  // authored +Y and light the underside (featureless grey + horizon rim).
  if (!ff && !isRoadDraw) { N = -N; }
  if (isRoadDraw && N.y < 0.0) { N = -N; }

  // ── Deferred material scalars (Phase 4) — all read from the already-plumbed
  //    DrawU/FrameU fields; a 0 value makes each block below a no-op so existing
  //    looks are unchanged. detail=mat1.y, clearcoat=mat1.z, carPaint=mat1.w,
  //    sparkle=mat2.x, wetness=F.params1.z.
  let detail    = D.mat1.y;
  var clearcoat = D.mat1.z;
  var carPaint  = D.mat1.w;
  let sparkle   = D.mat2.x;
  let wetness   = F.params1.z;
  // Car3D surface ids are isolated above TrackGeom's 0..15 range. Keep id 0 on
  // the legacy whole-draw path for imported/custom meshes.
  let surfaceId = i32(vMatId + 0.5);
  let classifiedCar = surfaceId >= 20 && surfaceId <= 27;
  let paintSurface = surfaceId == 20;
  let carbonSurface = surfaceId == 21;
  let rubberSurface = surfaceId == 22;
  let metalSurface = surfaceId == 23;
  let glassSurface = surfaceId == 24;
  let emissiveSurface = surfaceId == 25;
  let panelSurface = surfaceId == 26;
  // MIRROR: chrome livery finish (car3d.js SURFACES.mirror = 27). Paint-like
  // (keeps clearcoat + env lobe) but metallic and nearly smooth.
  let mirrorSurface = surfaceId == 27;
  if (classifiedCar) {
    if (paintSurface || mirrorSurface) {
      carPaint = D.mat1.w;
      clearcoat = select(max(D.mat1.z, 0.85), D.mat1.z, paintSurface);
    } else {
      carPaint = 0.0;
      clearcoat = select(0.0, D.mat1.z * 0.45, glassSurface);
    }
  }
  let envSurface = (carPaint > 0.001 || glassSurface) && clearcoat > 0.001;

  // [Block 1a] Ground/terrain detail MICRO-NORMAL (mirrors GLX LIT_FS js/render/shaders/lit.js).
  // Two-scale value-noise gradient perturbs N so procedurally-textured ground gets
  // real bumps (sun/lamp glints break up over the surface instead of one polished
  // sheet). Distance-faded (would alias to shimmer) and wetness-faded (the water
  // film levels the surface).
  if (detail > 0.001) {
    var mnFade = clamp(1.0 - (vDist - 25.0) / 70.0, 0.0, 1.0) * (1.0 - wetness * 0.75);
    // Footprint fade (GLX lit.js): grazing road pixels span metres; without this
    // the fixed 0.22 m noise gradient aliases into wavy "shadows" crawling under
    // the car. Distance fade alone misses a near-but-grazing patch.
    // Derived from fwWpos computed in top-level uniform control flow.
    let mnFpAbs = max(fwWpos.x, fwWpos.z);
    mnFade = mnFade * clamp(1.0 - (mnFpAbs - 0.15) / 0.70, 0.0, 1.0);
    if (mnFade > 0.01) {
      let mnp = in.wpos.xz * 1.7;
      let e = 0.22;
      let h0 = svnoise(mnp) * 0.7 + svnoise(mnp * 3.9) * 0.3;
      let hx = svnoise(mnp + vec2<f32>(e, 0.0)) * 0.7 + svnoise(mnp * 3.9 + vec2<f32>(e * 3.9, 0.0)) * 0.3;
      let hz = svnoise(mnp + vec2<f32>(0.0, e)) * 0.7 + svnoise(mnp * 3.9 + vec2<f32>(0.0, e * 3.9)) * 0.3;
      N = normalize(N + vec3<f32>(h0 - hx, 0.0, h0 - hz) * ((detail * 0.4 * mnFade) / e));
    }
  }
  // Geometric normal snapshot for the smooth clearcoat lobe + flake tangent frame:
  // orange-peel/flake live UNDER the lacquer, so they must not roughen the mirror
  // shell (GLX LIT_FS js/render/shaders/lit.js).
  let Ngeo = N;
  // [Block 3a] Car-paint ORANGE-PEEL micro-normal (mirrors GLX LIT_FS js/render/shaders/lit.js).
  // Coarse waviness + fine flake wobble perturb N so the sun streak / sky reflection
  // shimmer live on the panels. Keyed to OBJECT space (in.objPos / GLX vObjPos)
  // so the peel does not swim as the car translates. Distance-faded.
  if (carPaint > 0.001) {
    N = paintPeelN(N, in.objPos, vDist, carPaint);
  }
  // Wall/MAT bump AFTER detail + peel, matching GLX lit.js. Lighting
  // still uses the bumped N; SAA does not (Nsaa / geo+peel mix).
  applyMaterialNormal(i32(vMatId + 0.5), &N, vDist, in.wpos, fwWpos, litNrm, packOn);
  let V = normalize(F.eye.xyz - in.wpos);
  let L = F.sunDir.xyz;
  let H = normalize(L + V + vec3<f32>(1e-5));   // +eps: normalize(0) NaNs at V==-L
  let NoL = max(dot(N, L), 0.0);
  let NoV = max(dot(N, V), 1e-4);
  let NoH = max(dot(N, H), 0.0);
  let VoH = max(dot(V, H), 0.0);

  var albedo    = in.col;
  var emissive  = D.mat0.x;
  let alpha     = D.mat0.y;
  var metalness = D.mat0.w;
  var specular  = D.mat1.x;
  var rough     = clamp(D.mat0.z, 0.04, 1.0);
  let keyMul    = F.params1.x;
  if (classifiedCar) {
    metalness = select(0.0, max(D.mat0.w, 0.78), metalSurface);
    if (mirrorSurface) { metalness = max(D.mat0.w, 0.55); }
    if (carbonSurface) { metalness = 0.08; }
    // PAINT gets metalness rather than the 0.0 base — mirrors
    // js/render/shaders/lit.js. tables.js sets 0.12 on every PAINT_* for the
    // metallic-flake tint; the 0.0 discarded it and left CAR METALLIC dead.
    if (paintSurface) { metalness = D.mat0.w; }
    if (rubberSurface) { specular = 0.18; }
    if (metalSurface || mirrorSurface) { specular = 1.0; }
    if (carbonSurface) { specular = 0.48; }
    if (panelSurface) { specular = 0.35; }
    emissive = select(0.0, D.mat0.x, paintSurface);
    if (emissiveSurface) { emissive = max(D.mat0.x, 1.0); }
    if (carbonSurface) { rough = max(rough, 0.56); }
    if (rubberSurface) { rough = max(rough, 0.90); }
    if (metalSurface) { rough = min(rough, 0.16); }
    if (glassSurface) { rough = min(rough, 0.13); }
    if (emissiveSurface) { rough = max(rough, 0.32); }
    if (panelSurface) { rough = max(rough, 0.72); }
    if (mirrorSurface) { rough = min(rough, 0.09); }
  }
  // [Block 1b] Procedural ground ALBEDO grain (mirrors GLX LIT_FS js/render/shaders/lit.js):
  // coarse+fine value-noise grain + repair-patch tint/roughness + sparse crack lines.
  // Multiplicative, so it darkens as much as it lightens. Crack ridge AA uses the
  // hoisted fwWpos footprint (GLX uses fwidth(cr)) — a dpdx(cr) here would sit
  // AFTER the non-uniform matId bump branch and re-open the NaN-white-road class.
  var patchM = 0.5;
  if (detail > 0.0) {
    let wp = in.wpos.xz;
    let fineFade = clamp(1.0 - (vDist - 35.0) / 90.0, 0.0, 1.0);
    let n = svnoise(wp * 0.35) * 0.60 + svnoise(wp * 2.1) * 0.40 * fineFade;
    albedo = albedo * (1.0 + (n - 0.5) * detail);
    patchM = svnoise(wp * 0.055 + vec2<f32>(9.1));
    let pm = smoothstep(0.52, 0.72, patchM);
    albedo = albedo * (1.0 - pm * 0.05 * min(detail * 4.0, 1.0));
    // Sparse cracks (GLX lit.js): ridge-noise lines, zone-masked, near-field only.
    let crackFade = clamp(1.0 - (vDist - 18.0) / 45.0, 0.0, 1.0);
    let cr = abs(svnoise(wp * 0.9 + vec2<f32>(3.3)) * 2.0 - 1.0);
    let crAA = max(0.075, 0.015 + max(fwWpos.x, fwWpos.z) * 0.9);
    let crack = (1.0 - smoothstep(0.015, crAA, cr))
              * smoothstep(0.40, 0.70, svnoise(wp * 0.11 + vec2<f32>(7.7)));
    albedo = albedo * (1.0 - crack * 0.30 * crackFade * min(detail * 4.0, 1.0));
    albedo = max(albedo, vec3<f32>(0.0));
    rough = clamp(rough + (patchM - 0.5) * 0.16 * min(detail * 4.0, 1.0), 0.04, 1.0);
  }
  applyMaterial(i32(vMatId + 0.5), &albedo, &rough, vDist, in.wpos, in.nrm, fwWpos, litPack, packOn);
  if (i32(vMatId + 0.5) == 16) {
    roadMarkings(&albedo, &rough, vTrk, fwTrk);
  }

  var f0 = mix(vec3<f32>(0.08 * specular), albedo, metalness);

  // SPECULAR ANTI-ALIASING BEFORE wet (GLX lit.js). Widen roughness by how
  // fast the normal is changing in SCREEN space, so a thin bright GGX lobe
  // on a geometry edge or peel sheens smoothly. Then wet recomputes a from
  // the polished roughness — doing SAA after wet extra-widened puddle edges.
  // Geometric + peel derivatives are taken in top-level uniform CF; mix by
  // carPaint (paint gets peel SAA). Material/wall bump stays out of SAA on
  // all three backends — a dpdx after the matId branch is illegal WGSL, and
  // GLX/TLX snapshot Nsaa before applyMaterialNormal so brick/concrete
  // match this mix.
  let saaVarGeo = dot(saaDxGeo, saaDxGeo) + dot(saaDyGeo, saaDyGeo);
  let saaVarPeel = dot(saaDxPeel, saaDxPeel) + dot(saaDyPeel, saaDyPeel);
  let saaVar = mix(saaVarGeo, saaVarPeel, saturate(carPaint));
  rough = min(1.0, sqrt(rough * rough + saaVar * 0.35));

  var a = rough * rough;

  // [Block 5] WET-ROAD material response (mirrors GLX LIT_FS js/render/shaders/lit.js). Rain
  // darkens + polishes up-facing ground; a value-noise mask pools puddles that go
  // near-mirror. Lowers effective roughness and lifts f0 toward a water film so the
  // sun/lamp GGX speculars (which read rough/a/f0) elongate into wet streaks. Full
  // SSR + puddle reflection is Phase-4 wgx-side; here just the material response.
  var wet = 0.0;
  var wetSheen = 0.0;
  if (wetness > 0.001) {
    let upFace = smoothstep(0.50, 0.90, N.y);   // flat ground only
    // Porous ground (grass/foliage/rock/sand/snow) drinks the water: it
    // darkens but never polishes. Reflection-side terms key off wetSheen.
    let wmid = i32(vMatId + 0.5);
    let porous = select(0.0, 1.0, wmid == 9 || wmid == 6 || wmid == 10 || wmid == 8 || wmid == 11);
    wet = wetness * upFace;
    let pn = svnoise(in.wpos.xz * 0.13 + vec2<f32>(4.7));
    let puddle = smoothstep(0.48, 0.88, pn) * wet * (1.0 - porous);
    // POROUS MUST BE DARKER THAN THE ROAD, not lighter. Two independently
    // clamped coefficients transpose the order: 0.42 fades SLOWER than 0.58, so
    // at wetDark 1.0 porous sat at 0.58 against the road's 0.42 — verges and
    // gravel traps reading 38% BRIGHTER than the tarmac they border, which is
    // the flooded-canal-with-pale-banks silhouette inverted. As a FRACTION of
    // the road's own absorption the two saturate together and porous stays
    // strictly darker across the whole range, with no clip order to get wrong.
    // GLX carries the fixed form in js/render/shaders/lit.js.
    let absorbRoad = clamp(1.0 - 0.58 * F.params6.x, 0.0, 1.0);
    let absorb = mix(absorbRoad, absorbRoad * 0.66, porous);
    albedo = albedo * mix(1.0, absorb, wet);
    albedo = albedo * mix(1.0, 0.50, puddle);
    wetSheen = wet * (1.0 - porous);
    rough = mix(rough, 0.30, wetSheen);
    rough = mix(rough, 0.06, puddle);
    f0 = mix(f0, vec3<f32>(0.04), wetSheen * 0.6);    // thin water film dielectric
    a = rough * rough;
  }

  // Hemisphere ambient + Lambert sun (== GLX base diffuse when metalness==0).
  // Ground fill is NOT scaled by anything — matches GLX js/render/shaders/lit.js
  // amb = mix(uAmbGround, uAmbSky, N.y*0.5+0.5). BOUNCE (params3.x) is the
  // per-lamp bounce-fill strength (== GLX uBounceK), consumed in the lamp loop below.
  let amb = mix(F.ambGround.xyz, F.ambSky.xyz, N.y * 0.5 + 0.5);
  // Sun shadow (Phase 3): project the world pos into the sun's light-space clip,
  // then 3×3-PCF compare against the depth map (WebGPU NDC z is already [0,1], so
  // no -1..1 remap). shadowSamp is a comparison sampler — Level variant is legal
  // in non-uniform control flow. shadow = fraction lit (1 = fully lit).
  //
  // PHASE 4: PCSS-STYLE PENUMBRA (F.params4.x = pcssPen). Near-field (inside
  // 80% of the shadow range, pcssPen > 0) runs a REAL blocker search: a 4-tap
  // min-depth read of blockerTex (findBlocker above) scales the PCF step with
  // the receiver-blocker gap, so contact edges stay crisp while the body
  // softens. Far field drops to 4-tap. pcssPen=0 skips the blocker search.
  //
  // GLX parity (js/render/shaders/lit.js sampleShadow + composite):
  //   * params2.y (shadowStrength) <= 0 → skip all PCF/blocker/car taps (return
  //     unshadowed). wgx.js packs the key-luminance-faded strength into this
  //     slot the same way GLX drives uShadowStr to 0 on overcast nights.
  //   * NoL / clearcoat gate — back-faces throw the result away (litNoL *= NoL)
  //     except clearcoat on Ngeo, so skip the taps when they cannot contribute.
  var shadow = 1.0;
  if (NoL > 0.0 || clearcoat > 0.001) {
    if (F.params2.x > 0.5 && F.params2.y > 0.0) {
      let sc = F.lightVP * vec4<f32>(in.wpos, 1.0);
      let ndc = sc.xyz / sc.w;
      let suv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
      // Distance + border fade (GLX sampleShadow parity, js/render/shaders/lit.js).
      // Fade from eye XZ + look-target Y (yaw-invariant). The box still recentres
      // in sBox/4 = 16 m snaps; an unfaded BOX-anchored border jumped 16 m while
      // driving, and a look-biased fade origin swept on yaw. UV border fade stays
      // as a safety clamp. shadowCtr.w = shadowRange (box half-size, m).
      let shRange = max(F.shadowCtr.w, 1.0);
      // Yaw-invariant fade origin (eye XZ, look-target Y) — lit.js sampleShadow.
      let fadeCtr = vec3<f32>(F.eye.x, F.shadowCtr.y, F.eye.z);
      var edgeFade = 1.0 - smoothstep(shRange * 0.62, shRange * 0.84, distance(in.wpos, fadeCtr));
      let ef = smoothstep(vec2<f32>(0.0), vec2<f32>(0.03), suv)
             * (1.0 - smoothstep(vec2<f32>(0.97), vec2<f32>(1.0), suv));
      edgeFade = edgeFade * ef.x * ef.y;
      if (edgeFade > 0.0 && ndc.z <= 1.0) {
        // Slope-scale bias (GLX parity, js/render/shaders/lit.js sampleShadow):
        // a constant-only bias can't cover grazing sun angles on walls / banked
        // kerbs — acne that shimmers while driving — and raising the constant
        // knob to hide it peter-pans flat ground instead. Same clamp band, and
        // the knob contributes HALVED exactly like GLX (uShadowBias * 0.5).
        let cosT = clamp(dot(Ngeo, F.sunDir.xyz), 0.05, 1.0);
        let slopeB = F.params2.z * 1.5 * (sqrt(1.0 - cosT * cosT) / cosT);
        // STATIC map only: biasTerm × (shadowRange/80) — GLX lit.js sampleShadow.
        // Unscaled, the same absolute push is ~25× too much at SHADOW DISTANCE 16
        // and barely covers acne at 200. Car map below uses biasTerm × params6.y
        // (carBoxScale when armed — GLX uCarBiasScale).
        let biasTerm = clamp(slopeB, 0.0005, 0.004) + max(F.params2.w, 0.0) * 0.5;
        let refD = ndc.z - biasTerm * (shRange / 80.0);
        // True PCSS-Lite for WebGPU: blocker search scales the penumbra dynamically
        let aDist = distance(in.wpos, fadeCtr);
        let near = aDist < shRange * 0.80;
        let boxK = min(1.0, 80.0 / shRange);
        var R = 3.0;
        if (near && F.params4.x > 0.0) {
          let bt = (1.5 / 512.0) * boxK;
          let zb = findBlocker(suv, bt);
          let pen = clamp((refD - zb) * F.params4.x, 0.0, 1.0);
          R = mix(1.5, 6.0, pen);
        }
        let ign = ignoise(floor(suv / max(F.params2.z, 1e-6)));
        let ang = ign * 6.2831853;
        let cr = cos(ang); let sr = sin(ang);
        let k = F.params2.z * R * boxK;
        let rot0 = vec2<f32>(cr, -sr) * k;
        let rot1 = vec2<f32>(sr, cr) * k;
        var s = textureSampleCompareLevel(shadowTex, shadowSamp, suv + rot0 * -0.94201624 + rot1 * -0.39906216, refD)
              + textureSampleCompareLevel(shadowTex, shadowSamp, suv + rot0 *  0.94558609 + rot1 * -0.76890725, refD)
              + textureSampleCompareLevel(shadowTex, shadowSamp, suv + rot0 * -0.09418410 + rot1 * -0.92938870, refD)
              + textureSampleCompareLevel(shadowTex, shadowSamp, suv + rot0 *  0.34495938 + rot1 *  0.29387760, refD);
        var sh : f32;
        if (near) {
          s = s + textureSampleCompareLevel(shadowTex, shadowSamp, suv + rot0 * -0.91588581 + rot1 *  0.45771432, refD)
                + textureSampleCompareLevel(shadowTex, shadowSamp, suv + rot0 * -0.81544232 + rot1 * -0.87912464, refD)
                + textureSampleCompareLevel(shadowTex, shadowSamp, suv + rot0 * -0.38277543 + rot1 *  0.27676845, refD)
                + textureSampleCompareLevel(shadowTex, shadowSamp, suv + rot0 *  0.97484398 + rot1 *  0.75648379, refD);
          sh = s * 0.125;
        } else {
          sh = s * 0.25;
        }
        // Dynamic CAR shadows (GLX parity): min-combine the per-frame car-only
        // map — cars can't live in the snap-cached static map, so without this
        // they cast nothing. biasTerm × params6.y (= carBoxScale when armed, 0
        // when not — same gate as GLX uCarBiasScale); carLightVP is the
        // Z01-remapped matrix the car map was rasterised with.
        if (F.params6.y > 0.5) {
          let cc = F.carLightVP * vec4<f32>(in.wpos, 1.0);
          let cn = cc.xyz / cc.w;
          let cuv = vec2<f32>(cn.x * 0.5 + 0.5, 0.5 - cn.y * 0.5);
          if (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0 && cn.z <= 1.0) {
            let crefD = cn.z - biasTerm * F.params6.y;
            let ct = (1.0 / 1024.0) * 0.75;   // CAR_SHADOW_SIZE texel, tightened
            let csh = ( textureSampleCompareLevel(carShadowTex, shadowSamp, cuv + vec2<f32>(-ct, -ct), crefD)
                      + textureSampleCompareLevel(carShadowTex, shadowSamp, cuv + vec2<f32>( ct, -ct), crefD)
                      + textureSampleCompareLevel(carShadowTex, shadowSamp, cuv + vec2<f32>(-ct,  ct), crefD)
                      + textureSampleCompareLevel(carShadowTex, shadowSamp, cuv + vec2<f32>( ct,  ct), crefD) ) * 0.25;
            sh = min(sh, csh);
          }
        }
        // Clamped like GLX: SHADOW DARKNESS reaches 2.0 and mix() extrapolates
        // above t=1 — unclamped, sh~0 went NEGATIVE (negative light -> psychedelic
        // grade output in shadowed areas).
        shadow = max(0.0, mix(1.0, sh, F.params2.y * edgeFade));   // params2.y = shadow strength
      }
    }
    // Cloud dapple multiplies the cast shadow exactly like GLX (LIT_FS composite):
    // applied outside the depth-map gate, so broken cloud still shades the ground
    // even where/when the sun shadow map is off — but still inside the NoL gate,
    // matching lit.js (cloudShadow is skipped on back-faces too).
    // CLOUD SHADOW DEPTH knob (F.params5.z; GLX parity). _writeFrame always packs
    // the resolved value (0.80 default), so 0 here means a real "no cloud shade".
    shadow = shadow * (1.0 - cloudShadow(in.wpos) * F.params5.z);
  }
  let litNoL = NoL * keyMul * shadow;
  var color = albedo * (amb + F.sunColor.xyz * litNoL * (1.0 - metalness));
  // SHADOW COOLNESS (GLX lit.js): bias sun-starved pixels toward cool blue.
  let shadowTintAmt = max(F.params4.y, 0.0);
  if (shadowTintAmt > 0.001) {
    color = color * mix(vec3<f32>(1.0), vec3<f32>(0.90, 0.96, 1.12),
      shadowTintAmt * clamp(1.0 - litNoL, 0.0, 1.0));
  }

  // Cook-Torrance sun specular, soft-clipped so highlights sheen not clip.
  // specCol is * litNoL; a backface paid two GGX evals for 0.
  if (NoL > 0.0) {
    let Dg = D_GGX(NoH, a);
    let Vg = V_SmithGGX(NoV, NoL, a);
    let Fg = F_Schlick(VoH, f0, clamp(1.0 - rough, 0.0, 1.0));
    var specCol = (Dg * Vg) * Fg * F.sunColor.xyz * litNoL;
    specCol = specCol / (1.0 + specCol);
    color = color + specCol;
  }

  // Specular AA variance for clearcoat + lacquer env disc (GLX parity).
  // ccDx/ccDy are hoisted to uniform control flow (see where Ngeo is bound).
  let ccSaaVar = dot(ccDx, ccDx) + dot(ccDy, ccDy);

  // [Block 2] CLEARCOAT 2nd specular lobe (mirrors GLX LIT_FS js/render/shaders/lit.js). A
  // second, fixed low-roughness (a=0.035) GGX lobe over the base coat catches a crisp
  // sun glint on the smooth lacquer even where the base coat is rough — the glossy
  // showroom read. Uses the UNPERTURBED geometric normal (Ngeo) so the flake wobble
  // roughens only the base coat and this streak stays sharp. Soft-clipped to a 2.6
  // HDR ceiling so the hot core punches past the bloom threshold.
  if (clearcoat > 0.001) {
    let Hg = normalize(L + V);
    let NoHg = max(dot(Ngeo, Hg), 0.0);
    let NoVg = max(dot(Ngeo, V), 1e-4);
    let NoLg = max(dot(Ngeo, L), 0.0);
    if (NoLg > 0.0) {
    // Specular AA (GLX parity): widen the fixed lobe by the geometric-normal
    // variance so the streak stops strobing on tight curvature; flat panels
    // keep the crisp 0.035. Capped so silhouette edges can't matte it out.
    let ccA = min(sqrt(0.035 * 0.035 + ccSaaVar * 0.25), 0.30);
    let Dc = D_GGX(NoHg, ccA);
    let Vc = V_SmithGGX(NoVg, NoLg, ccA);
    let Fc = F_Schlick(max(dot(V, Hg), 0.0), vec3<f32>(0.05), 1.0).x;
    // keyMul: GLX includes uKeyMul so KEY LIGHT dims this lobe with the rest of
    // the direct sun (lit.js). Without it a keyMul of 0 left every clearcoated
    // car with a full-brightness sun streak on WebGPU.
    var ccCol = vec3<f32>(Dc * Vc * Fc) * F.sunColor.xyz * NoLg * shadow * keyMul * clearcoat;
    ccCol = 2.6 * ccCol / (2.6 + ccCol);
    color = color + ccCol;
    }
  }

  // [Block 7] ENV lacquer mirror (GLX energy-conserving clearcoat env — lit.js).
  // Gate on envSurface + clearcoat (not carReflect — that slot drives composite
  // SSR). envProbeStr scales probeLive (baseRefl 0.14→0.72); probe 0 still gets
  // a gentle analytic sheen. Energy-conserving: darken base under envW, then add.
  let envProbeStr = max(F.params5.x, 0.0);
  if (envSurface && clearcoat > 0.001) {
    let Rg = reflect(-V, Ngeo);
    let NoVc = max(dot(Ngeo, V), 1e-4);
    let ccFb = 1.0 - NoVc;
    let ccF = ccFb * ccFb;
    let probeLive = clamp(envProbeStr, 0.0, 1.0);
    let baseRefl = mix(0.14, 0.72, probeLive);
    let envW = clamp(clearcoat * (baseRefl + 0.28 * ccF) * (1.0 - rough * 0.25), 0.0, 0.96);
    var envCC : vec3<f32>;
    if (envProbeStr >= 0.999) {
      envCC = textureSampleLevel(envCube, envCubeSamp, Rg, rough * 2.5).rgb;
    } else {
      let horiz = smoothstep(-0.12, 0.30, Rg.y);
      let skyR = mix(F.skyHorizon.xyz * 1.2, F.skyZenith.xyz, sqrt(max(Rg.y, 0.0)));
      envCC = mix(F.ambGround.xyz * 0.6, skyR, horiz);
      if (envProbeStr > 0.001) {
        let envReal = textureSampleLevel(envCube, envCubeSamp, Rg, rough * 2.5).rgb;
        envCC = mix(envCC, envReal, clamp(envProbeStr, 0.0, 1.0));
      }
    }
    // Specular-AA sun disc in the mirror (GLX: alpha~0.0705 → exponent).
    let ccDiscA = sqrt(0.0705 * 0.0705 + ccSaaVar * 0.25);
    let ccDiscExp = max(2.0 / (ccDiscA * ccDiscA) - 2.0, 32.0);
    envCC = envCC + F.sunColor.xyz * pow(max(dot(Rg, F.sunDir.xyz), 1e-4), ccDiscExp)
          * F.params7.y * shadow * keyMul;
    color = color * (1.0 - envW * 0.94);
    let addCC = envCC * envW;
    color = color + addCC / (1.0 + addCC * 0.35);
  }

  // Physically-based punctual lights (floodlights / street lamps) — verbatim
  // math from GLX LIT_FS (js/render/shaders/lit.js): windowed 1/d² falloff, aimed spot
  // cone, diffuse pool + GGX spec. No per-light shadows (cost); the cone shapes
  // the light. The nearest floodlight also 4-tap-PCF-samples lampShadowTex.
  var lampFog = vec3<f32>(0.0);   // lamp irradiance reaching the fog column (Block 6)
  let nL = i32(F.params0.w);
  // Chunk-AABB lamp cull (bit-exact): drawChunked sets a bit only for lights
  // whose radius reaches the chunk's AABB, so a cleared bit is precisely a
  // light the ld2 > rad*rad reject below would discard for EVERY fragment of
  // this draw — same output, ~3 ALU instead of the distance math per culled
  // light. Non-chunked draws carry all-ones masks (no cull).
  let lampM0 = u32(D.mat3.x);
  let lampM1 = u32(D.mat3.y);
  for (var i = 0; i < nL; i = i + 1) {
    // Both select arms evaluate — mask the shift amounts so the unselected
    // arm's underflowed count stays a defined shift (WGSL: >=32 is indeterminate).
    let lampBit = u32(i);
    let masked = select((lampM1 >> ((lampBit - 24u) & 31u)) & 1u,
                        (lampM0 >> (lampBit & 31u)) & 1u, i < 24);
    if (masked == 0u) { continue; }
    let LP = lights[i].posRad.xyz - in.wpos;
    let rad = lights[i].posRad.w;
    // Squared-distance reject before the sqrt — the godray loop's shape
    // (wgsl-post.js); saves a sqrt per rejected light per fragment, and most
    // of up to 48 lights reject here on night circuits.
    let ld2 = dot(LP, LP);
    if (ld2 > rad * rad) { continue; }
    let dist = sqrt(ld2);
    let Ld = LP / max(dist, 1e-3);
    let dn = dist / rad;
    let win = clamp(1.0 - dn * dn * dn * dn, 0.0, 1.0);
    let distC = max(dist, F.params7.w);   // LAMP NEAR CLAMP knob (uLampNearClamp, def 4.0)
    let att = (win * win) / (distC * distC + 1.0);
    if (att < 1e-6) { continue; }
    let lcol  = lights[i].colBleed.xyz;
    let bleed = lights[i].colBleed.w;
    let cd = dot(-Ld, lights[i].dirVol.xyz);
    let beam = smoothstep(lights[i].cone.y, lights[i].cone.x, cd);
    // F.params8.x = uLampFog is 0 in daylight, so skip the accumulate on
    // day frames. Uniform CF (params8.x), safe for WGSL.
    if (F.params8.x > 0.0) {
      lampFog = lampFog + lcol * (att * mix(0.35, 1.0, beam));   // Block 6 in-scatter
    }
    let spotD = mix(bleed, 1.0, beam);
    let NoLl = max(dot(N, Ld), 0.0);
    var lampSh = 1.0;
    if (F.params8.y > 0.5 && i == i32(F.params8.z) && NoLl > 0.0) {
      let lpc = F.lampLightVP * vec4<f32>(in.wpos, 1.0);
      if (lpc.w > 0.0) {
        let lps = lpc.xyz / lpc.w;
        let luv = vec2<f32>(lps.x * 0.5 + 0.5, 0.5 - lps.y * 0.5);
        if (luv.x > 0.002 && luv.x < 0.998 && luv.y > 0.002 && luv.y < 0.998 && lps.z < 1.0) {
          let lpz = lps.z - (0.0012 + 0.004 * (1.0 - NoLl));
          let lpt = 1.5 / 512.0;
          lampSh = ( textureSampleCompareLevel(lampShadowTex, shadowSamp, luv + vec2<f32>(-lpt, -lpt), lpz)
                   + textureSampleCompareLevel(lampShadowTex, shadowSamp, luv + vec2<f32>( lpt, -lpt), lpz)
                   + textureSampleCompareLevel(lampShadowTex, shadowSamp, luv + vec2<f32>(-lpt,  lpt), lpz)
                   + textureSampleCompareLevel(lampShadowTex, shadowSamp, luv + vec2<f32>( lpt,  lpt), lpz) ) * 0.25;
        }
      }
    }
    color = color + albedo * lcol * (att * spotD * lampSh) * NoLl * (1.0 - metalness) * (1.0 - wetSheen * 0.85);
    // Bounce fill: pool light bounced off the road washes nearby surfaces (walls,
    // kerbs, car flanks) with the lamp tint even outside the beam — a near-free
    // stand-in for local ambient probes, with a soft NoL floor (mirrors GLX
    // js/render/shaders/lit.js; BOUNCE = params3.x = uBounceK, default 0.04).
    if (F.params3.x > 0.0) {
      color = color + albedo * lcol * (att * F.params3.x * (0.55 + 0.45 * NoLl)) * (1.0 - metalness);
    }
    // GGX specular from the lamp (same microfacet BRDF as the sun).
    // LAMP WALL SPILL (params9.y = uLampWallSpill): out-of-beam reflection floor
    // so wet roads / walls still streak a lamp you can see, not only the pool.
    let spotS = mix(mix(0.16, 0.30, wetSheen) * F.params9.y, 1.0, beam);
    let Hl = normalize(Ld + V);
    let NoHl = max(dot(N, Hl), 0.0);
    let VoHl = max(dot(V, Hl), 0.0);
    let Dl = D_GGX(NoHl, a);
    let Vl = V_SmithGGX(NoV, NoLl, a);
    let Fll = F_Schlick(VoHl, f0, clamp(1.0 - rough, 0.0, 1.0));
    let radianceS = lcol * (att * spotS * lampSh);
    var lspec = (Dl * Vl) * Fll * radianceS * NoLl;
    lspec = lspec / (1.0 + lspec);
    color = color + lspec;
    // [Block 2 — lamp portion] The clearcoat lacquer catches the floodlights too: a
    // crisp low-roughness lens glint over the softer base highlight (GLX js/render/shaders/lit.js).
    if (clearcoat > 0.001) {
      let Dcc = D_GGX(NoHl, 0.03);
      let Vcc = V_SmithGGX(NoV, NoLl, 0.01);
      let Fcc = F_Schlick(VoHl, vec3<f32>(0.05), 1.0).x;
      var ccl = vec3<f32>(Dcc * Vcc * Fcc) * radianceS * NoLl * clearcoat;
      color = color + 2.2 * ccl / (2.2 + ccl);
    }
  }

  // [Block 4] Metallic-flake SPARKLE (mirrors GLX LIT_FS js/render/shaders/lit.js). A
  // view-dependent micro-glint: each tiny cell gets a random flake tilt and flashes
  // only when its facet half-aligns with the sun. sparkle DEFAULTS TO 1, so the
  // effect is gated on carPaint>0 AND on a non-dark albedo — non-paint meshes
  // (carPaint=0) and the dark carbon/tyre parts stay untouched. Cells in object
  // space (in.objPos / GLX vObjPos) so glitter stays welded to the bodywork.
  if (carPaint > 0.001 && litNoL > 0.0 && sparkle > 0.001) {
    var spFade = clamp(1.0 - (vDist - 14.0) / 30.0, 0.0, 1.0) * sparkle;
    spFade = spFade * smoothstep(0.06, 0.22, max(albedo.r, max(albedo.g, albedo.b)));
    if (spFade > 0.01) {
      let cell = floor(in.objPos * 220.0);
      let h1 = hash21(cell.xy + cell.z * 19.7);
      let h2 = hash21(cell.yz + cell.x * 7.3);
      // Mirror the GLSL finite-basis guard: malformed/degenerate geometry must
      // not feed normalize(0) and spray NaN glints across the paint.
      var nN = vec3<f32>(0.0, 1.0, 0.0);
      if (length(Ngeo) > 1e-4) {
        nN = normalize(Ngeo);
      }
      let fT = normalize(cross(nN, vec3<f32>(0.0, 1.0, 0.001)) + vec3<f32>(1e-4));
      let fB = cross(nN, fT);
      let gN = normalize(nN + (fT * (h1 * 2.0 - 1.0) + fB * (h2 * 2.0 - 1.0)) * 0.5);
      let glint = smoothstep(0.990, 1.0, dot(gN, H));
      // CAR SPARKLE knob (F.params6.z; GLX parity, def 1.6). Read directly — 0 is
      // a valid "no sparkle", so the uploader always packs the resolved value.
      color = color + F.sunColor.xyz * litNoL * glint * F.params6.z * carPaint * spFade;
    }
  }

  // [Block 5b] WET-ROAD grazing SHEEN (mirrors GLX LIT_FS js/render/shaders/lit.js, reduced
  // to the material response — full SSR is Phase-4 wgx-side). On wet up-facing ground
  // a boosted grazing Fresnel tints the surface with the sky gradient reflected in the
  // view ray, so the tarmac mirrors a faint sky band at the far grazing edge.
  var envBlend = clamp((0.40 - rough) / 0.30, 0.0, 1.0) * specular;
  envBlend = max(envBlend, wetSheen * 0.55);
  if (envBlend > 0.001) {
    let Rw = reflect(-V, N);
    let skyT = pow(max(Rw.y, 1e-4), 0.40);
    var envColor = mix(F.skyHorizon.xyz, F.skyZenith.xyz, skyT);
    let envSunAlign = max(dot(Rw, F.sunDir.xyz), 0.0);
    envColor = mix(envColor, envColor * F.sunColor.xyz * 1.15, envSunAlign * envSunAlign * (1.0 - rough));
    // WINDOW SUN FLASH (params9.z = uWindowSunFlash): dry glossy glass catches
    // a tight sun glint. Gated (1-wetSheen) so wet road is unchanged; night
    // moonlight is naturally negligible (GLX js/render/shaders/lit.js).
    // * (1-wetSheen): a fully-wet road paid pow(_,22) for a result of 0.
    if ((1.0 - wetSheen) * F.params9.z * keyMul > 0.001) {
      envColor = envColor + F.sunColor.xyz * pow(max(envSunAlign, 1e-4), 22.0) * (1.0 - wetSheen) * envBlend * 0.6 * F.params9.z * keyMul;
    }
    let ef0 = F_Schlick(max(dot(N, V), 0.0), vec3<f32>(0.04), 1.0).x;
    let envFresnel = mix(ef0, ef0 * ef0, wetSheen * 0.35);
    let envWet = envColor * (1.0 - wetSheen * 0.45);
    let envAdd = envWet * envFresnel * envBlend * (1.0 - rough * 0.7) * (1.0 - metalness);
    let envM = max(max(envAdd.r, envAdd.g), envAdd.b);
    color = color + envAdd / (1.0 + envM);
  }

  // Sky rim / fresnel (GLX js/render/shaders/lit.js): grazing-angle atmospheric
  // brightening tinted by the horizon. SKY RIM GLOW = params9.w (def 1.0).
  {
    let rf = 1.0 - NoV;
    let rimFresnel = rf * rf * rf;
    let rimAmt = rimFresnel * (1.0 - rough * 0.85) * 0.18 * F.params9.w;
    color = color + F.skyHorizon.xyz * rimAmt;
  }

  // Ambient contact darkening (GLX js/render/shaders/lit.js): extra crush on
  // downward faces. AMBIENT CONTACT DARK = params9.x (def 1.0 = 0.88 floor).
  {
    let ao = pow(max(N.y * 0.5 + 0.5, 1e-4), 0.35);
    color = color * mix(1.0 - 0.12 * F.params9.x, 1.0, ao);
  }

  // [Block 8] SSR consumption (F.params4.w = ssrStrength). On up-facing WET ground
  // blend in the screen-space-reflection result (computed by the Phase-4 post pass,
  // wgsl-post.js) scaled by wetness * ssrStrength — a real mirror where puddles pool.
  // Screen uv comes from the fragment framebuffer position / SSR texture size
  // (textureDimensions), so it stays aligned without a resolution uniform. Reuses
  // envSamp (clamped). Per the SSR pass's CONSUMER CONTRACT (wgsl-post.js) .a is
  // the mix amount — 0 wherever the pass masked out or missed — and the blend is
  // the darker-mirror substitution c*0.10 + rgb*0.92; honouring .a is what keeps
  // masked-out texels (transparent black, incl. the 1×1 placeholder and the
  // cleared texture) from darkening wet road toward black. ssrStrength=0 also
  // makes this a no-op.
  // SSR is consumed SAME-FRAME in COMPOSITE (wgsl-post.js), matching GLX
  // COMPOSITE_FS. LIT used to sample last present()'s ssrTex here — a 1-frame
  // lag on wet road / lacquer. The texture stays bound so a 1×1 placeholder
  // cannot poison unused bindings; the mix lives in post.

  // Emissive: lerp to unlit albedo + HDR glow lift for bright/warm surfaces so
  // lit windows / neon / lamp lenses bloom (GLX LIT_FS js/render/shaders/lit.js).
  if (emissive > 0.0) {
    color = mix(color, albedo, emissive);
    let bright = max(albedo.r, max(albedo.g, albedo.b));
    let glow = smoothstep(0.50, 0.95, bright) * emissive;
    // NEON BOOST knob (F.params7.z = uBloomBoost, def 0.6; GLX js/render/shaders/lit.js):
    // albedos authored ABOVE white (neon bands ~2.5, lamp lenses 1.06-1.40) are the
    // "this surface IS a light source" tag — scale the extra HDR push by how far past
    // white the albedo is so neon/signage bloom harder without dragging every emissive
    // surface (and the fog) up with a bigger uGlowAmp.
    let hdrTag = max(bright - 1.0, 0.0);
    color = color + albedo * glow * F.params1.y * (1.0 + hdrTag * F.params7.z);   // params1.y = uGlowAmp
  }

  // Height-based fog + sun in-scatter (GLX LIT_FS js/render/shaders/lit.js).
  // Same dummy-producer gate as GLX: skip pow/exp when density and mist are off.
  let fogDensity = F.params0.x;
  let mistK = max(F.params3.z, 0.0);
  if (fogDensity > 0.0 || mistK > 0.001) {
    let rd = normalize(in.wpos - F.eye.xyz);
    let sunAmt = max(dot(rd, F.sunDir.xyz), 1e-4);   // floor: pow(0,n) NaNs on mobile
    // [Block 6 — lamp-fog] Nearby floodlights/neon tint the DISTANT fog wall so it
    // glows around the lamps at night (mirrors GLX LIT_FS; F.params8.x = uLampFog).
    var lampFogC = vec3<f32>(0.0);
    if (F.params8.x > 0.0) {
      let lf = lampFog * F.params8.x;
    // FOG LAMP CLIP knob (F.params7.x = uLampFogClip, def 0.7; GLX js/render/shaders/lit.js):
    // scales the soft-clip denominator so a lamp cluster can never push the fog wall
    // past the night bloom threshold into a white wash. lampFogC is reused by the
    // ground-mist glow below, so the knob shapes both halos.
      lampFogC = lf / (1.0 + max(max(lf.r, lf.g), lf.b) * F.params7.x);
    }
    if (fogDensity > 0.0) {
      let fogHeight  = F.params0.y;
      var heightAtten = 1.0;
      if (fogHeight > 0.0) {
        heightAtten = exp(-max(in.wpos.y - F.eye.y, 0.0) * fogHeight);
      }
      let fd = vDist * fogDensity * heightAtten;
      let fAmt = 1.0 - exp(-fd * fd);
      var fogCol = mix(F.fogColor.xyz, F.sunColor.xyz, pow(sunAmt, 4.0));
      // FOG SUN CORE knob (F.params6.w; GLX parity, def 0.6). Read directly — 0 is a
      // valid "no hot core", so the uploader always packs the resolved value.
      fogCol = fogCol + F.sunColor.xyz * pow(sunAmt, 16.0) * F.params6.w;
      // FOG WARM / COOL white-balance (params3.y; GLX uFogTint asymmetric mix).
      let fTint = F.params3.y;
      fogCol = fogCol * vec3<f32>(
        1.0 + max(fTint, 0.0) * 0.25 - max(-fTint, 0.0) * 0.12,
        1.0 - abs(fTint) * 0.02,
        1.0 - max(fTint, 0.0) * 0.25 + max(-fTint, 0.0) * 0.18);
      fogCol = fogCol + lampFogC;
      color = mix(color, fogCol, fAmt);
    }

    // [Block 6 — ground mist] Low drifting FBM haze pooling near the surface (mirrors
    // GLX LIT_FS js/render/shaders/lit.js). GROUND MIST (params3.z) carries frame.groundMist ×
    // mistDensity (uploaded wgx.js d[78], == GLX uGroundMist) and gates the whole block
    // exactly like GLX (if uGroundMist > 0.001) — no fogDensity proxy, so clear/dry
    // air is a true no-op. MIST HEIGHT (params3.w) sets the vertical falloff.
    if (mistK > 0.001) {
      let mh = max(F.params3.w, 0.05);
      let lowH = max(in.wpos.y - (F.eye.y - 5.0), 0.0);
      // GLX parity (lit.js): band = exp(-lowH * (0.09 / mh)). The old WGX form
      // exp(-lowH/(mh*20)) == exp(-lowH*0.05/mh) fell off ~1.8× too slowly and
      // the extra *0.5 + 0.35 clamp stacked a denser low sheet than GLX's 0.45
      // ceiling — a washed translucent band over the road on misty day circuits.
      let band = exp(-lowH * (0.09 / mh));
      let mp = in.wpos.xz * 0.020 + vec2<f32>(F.params0.z * 0.010, F.params0.z * 0.006);
      let dRamp = clamp((vDist - 8.0) / 45.0, 0.0, 1.0);
      let mistAmt = mistK * band * smoothstep(0.35, 0.72, fbm(mp)) * dRamp;
      // MIST GLOW SHARE knob (F.params5.w; GLX uMistShare parity, def 1.5).
      let mistCol = mix(F.fogColor.xyz, F.sunColor.xyz, pow(sunAmt, 3.0)) + lampFogC * F.params5.w;
      color = mix(color, mistCol, clamp(mistAmt, 0.0, 0.45));
    }
  }

  return vec4<f32>(color, select(alpha, 0.35, carPaint > 0.001));
}`;

  //    (no fragment stage) — rasterises clip-space depth into the shadow map from
  //    the sun's POV. Model rides a dynamic-offset uniform so terrain / road /
  //    props share one buffer (one slot per castShadow* call).
  const SHADOW = `
struct ShadowU { lightVP : mat4x4<f32> };
struct ShadowModel { model : mat4x4<f32> };
@group(0) @binding(0) var<uniform> S : ShadowU;
@group(1) @binding(0) var<uniform> M : ShadowModel;
@vertex
fn vs_main(@location(0) aPos : vec3<f32>,
           @location(1) aInst0 : vec4<f32>,
           @location(2) aInst1 : vec4<f32>,
           @location(3) aInst2 : vec4<f32>,
           @location(4) aInst3 : vec4<f32>) -> @builtin(position) vec4<f32> {
  var model = M.model;
  // Instancing gate: castShadowInstanced writes a zero model (w=0);
  // every affine caster has model[3].w = 1. A dedicated flag would
  // match GLX uInstanced / LIT D.mat2.y, but the zero-matrix write is
  // the only caller of w<0.5 and IDENT/real models never trip it.
  if (M.model[3].w < 0.5) {
    model = mat4x4<f32>(aInst0, aInst1, aInst2, aInst3);
  }
  return S.lightVP * (model * vec4<f32>(aPos, 1.0));
}`;

  //    exposure + the shared ACES tonemap leaf, writes the LDR swapchain. A
  //    stand-in for the full Phase-4 post chain (bloom/SSAO/godray/SSR/grade/
  //    flare/FXAA). Fullscreen triangle; uv flips Y into texture space.
  const BLIT = `
struct BlitU { params : vec4<f32> };   // x = exposure
@group(0) @binding(0) var srcTex  : texture_2d<f32>;
@group(0) @binding(1) var srcSamp : sampler;
@group(0) @binding(2) var<uniform> B : BlitU;
${fullscreenTri}
${tonemap}
struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
};
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VOut {
  var o : VOut;
  let p = fsTriNDC(vi);
  o.pos = vec4<f32>(p, 0.0, 1.0);
  o.uv = vec2<f32>((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return o;
}
@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let hdr = textureSampleLevel(srcTex, srcSamp, in.uv, 0.0).rgb * B.params.x;
  // Stand-in resolve: fixed shipped ACES coefficients (the TONE CURVE knobs only
  // reach the full composite path, not this fallback blit).
  return vec4<f32>(acesTonemap(hdr, 2.51, 0.03, 2.43, 0.59, 0.14), 1.0);
}`;

  //    r16float blocker map (PCSS-lite blocker-search source; GLX BLOCKER_FS
  //    parity). This chunk was MISSING when wgx.js first referenced
  //    WGSLChunks.BLOCKER — createShaderModule({code: undefined}) threw and
  //    killed the whole WGX init (silent GLX fallback). Bindings must match
  //    blockerG0Layout in wgx.js: 0 = shadow depth texture, 1 = BlockerU
  //    (xy = 1/SHADOW_SIZE source texel). textureLoad, not textureSampleLevel:
  //    Safari / compat-mode rejects texture_depth_2d + a non-comparison sampler
  //    (gpuweb compatibility-mode.md) and that used to fail the whole create().
  const BLOCKER = `
struct BlockerU { srcTexel : vec4<f32> };   // xy = 1/SHADOW_SIZE
@group(0) @binding(0) var depthTex : texture_depth_2d;
@group(0) @binding(1) var<uniform> B : BlockerU;
${fullscreenTri}
struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
};
fn loadDepth(uv : vec2<f32>) -> f32 {
  let dims = vec2<i32>(textureDimensions(depthTex));
  let px = clamp(vec2<i32>(uv * vec2<f32>(dims)), vec2<i32>(0), max(dims - vec2<i32>(1), vec2<i32>(0)));
  return textureLoad(depthTex, px, 0);
}
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VOut {
  var o : VOut;
  let p = fsTriNDC(vi);
  o.pos = vec4<f32>(p, 0.0, 1.0);
  o.uv = vec2<f32>((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  return o;
}
@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
  let t = B.srcTexel.xy;
  let d0 = loadDepth(in.uv + t * vec2<f32>(-1.0, -1.0));
  let d1 = loadDepth(in.uv + t * vec2<f32>( 1.0, -1.0));
  let d2 = loadDepth(in.uv + t * vec2<f32>(-1.0,  1.0));
  let d3 = loadDepth(in.uv + t * vec2<f32>( 1.0,  1.0));
  return vec4<f32>(min(min(d0, d1), min(d2, d3)), 0.0, 0.0, 1.0);
}`;

  //    (js/render/shaders/sky.js) — gradient (zenith/horizon) with overcast
  //    grey-shift + azimuthal variation, golden-hour horizon warmth, procedural
  //    clouds with twilight horizon bank + lightning flash, Mie sun corona +
  //    disc, stars, moon, and city skyglow. Composed from the leaves above.
  //
  //    GLX SKY_FS parity: overcast grey-shift (night-gated), twilight horizon
  //    cloud-bank, and azimuthal gradient variation. SkyU is 240 B (p0–p5);
  //    p5.x is CLOUD DEFINITION (uCloudDef), p5.y is lightning (uLightning).
  //    The moon sits behind covRay like the stars.
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
  p1          : vec4<f32>,     // (starBright, cloudSpeed, skyGrad, starDensity)
  p2          : vec4<f32>,     // (mieScatter, cloudSilver, coronaAureole, sunDiscSize) — pure-look knobs; read directly (0 is a real "off"), uploader always packs the resolved default
  p3          : vec4<f32>,     // (daySkyBlue, starSize, starTwinkle, moonDiscSize) — GLX-parity sky knobs; read directly, uploader always packs the resolved default (1.0 = as-shipped)
  p4          : vec4<f32>,     // (moonHalo, sunCorona, sunSquash, cityGlowReach) — GLX-parity sky knobs; read directly, uploader always packs the resolved default (1.0 = as-shipped)
  p5          : vec4<f32>,     // (cloudDef, lightning, _, _) — CLOUD DEFINITION billow-octave scale (def 1.0); p5.y = storm lightning flash 1→0
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
  // SKY GRADIENT / STAR DENSITY knobs (GLX parity). Defaults reproduce shipped.
  let skyGrad = select(0.35, U.p1.z, U.p1.z > 0.0);
  let starDensity = select(1.0, U.p1.w, U.p1.w > 0.0);
  // Pure-look knobs (GLX parity). Read DIRECTLY — 0 is a valid "off" for the
  // first three, so a select-on-zero would wrongly snap them back to 1.0. The
  // uploader always packs the resolved value (default 1.0 reproduces the ship).
  let mieScatter    = U.p2.x;
  let cloudSilver   = U.p2.y;
  let coronaAureole = U.p2.z;
  let sunDiscSize   = max(U.p2.w, 1e-3);   // disc size scales a divisor-like edge; keep > 0
  // DAY SKY BLUE knob (GLX parity, def 1.0). Read directly — 0 is a valid "no
  // deep-blue band", so the uploader always packs the resolved value.
  let daySkyBlue    = U.p3.x;
  // More GLX-parity sky knobs (def 1.0). Read directly — 0 is a valid "off" for
  // most; the two that scale a divisor (disc/halo sizes) are floored > 0. The
  // uploader always packs the resolved value.
  let starSize      = max(U.p3.y, 1e-3);   // scales a smoothstep radius; keep > 0
  let starTwinkle   = U.p3.z;
  let moonDiscSize  = max(U.p3.w, 1e-3);   // scales smoothstep edges; keep > 0
  let moonHaloK     = max(U.p4.x, 1e-3);   // divides a falloff; keep > 0
  let sunCorona     = U.p4.y;
  let sunSquash     = U.p4.z;
  let cityGlowReach = U.p4.w;
  let cloudDef      = U.p5.x;   // CLOUD DEFINITION; 0 is a valid "soft smear"
  let lightning     = U.p5.y;   // storm strike flash 1→0 (0 = none)

  let sunE = clamp(sunDir.y * 1.4, 0.0, 1.0);
  // NIGHT gate (parity with GLX): at night sunDir stays HIGH as the moon
  // key-light direction, which the sunElevation math reads as midday and paints
  // a bright white sun disc among the stars. Suppress the sun corona/disc at
  // night; the moon disc below is drawn separately.
  let nightSky = step(0.5, stars);
  // Gate daytime by (1 - nightSky) so the day-only deep-blue band never paints a
  // blue gradient among the stars (GLX js/render/shaders/sky.js).
  let dayGate = smoothstep(0.35, 0.60, sunE);
  let daytime = dayGate * (1.0 - nightSky);
  // TWILIGHT: low sun above the horizon, gated off night (GLX SKY_FS).
  let twilight = smoothstep(0.02, 0.22, sunE) * (1.0 - dayGate) * (1.0 - nightSky);
  // Overcast factor: fades the deep-blue band under heavy cloud so grey days are
  // untouched (GLX js/render/shaders/sky.js).
  let overcast = smoothstep(0.5, 1.0, cloud);

  var c : vec3<f32>;
  if (up >= 0.0) {
    // Overcast grey-shift, night-gated (GLX SKY_FS). A day overcast ceiling
    // must not paint a pale lid over a night+rain session.
    let nightLid = (U.zenith.xyz + U.horizon.xyz) * 1.25;
    let greyZ = mix(vec3<f32>(0.55, 0.56, 0.58), nightLid, nightSky);
    let greyH = mix(vec3<f32>(0.58, 0.58, 0.60), nightLid, nightSky);
    let zenithO = mix(U.zenith.xyz, greyZ, overcast * 0.75);
    let horizonO = mix(U.horizon.xyz, greyH, overcast * 0.60);
    c = mix(horizonO, zenithO, pow(max(up, 0.0), skyGrad));
    // Day gradient LIFE (GLX js/render/shaders/sky.js): a deeper
    // saturated blue pushed into the low/mid band so the gameplay sky strip isn't
    // a flat pale wash, plus faint azimuthal variation. Day-only and faded under
    // overcast, so dusk/dawn/night and grey days are untouched. DAY SKY BLUE knob
    // scales the band; clamp keeps the blend valid when the knob pushes past 1.
    if (daytime > 0.0) {
      let bandLM = (1.0 - smoothstep(0.06, 0.55, up)) * smoothstep(0.0, 0.06, up);
      let deepBlue = vec3<f32>(0.10, 0.30, 0.72);
      c = mix(c, mix(c, deepBlue, 0.30), clamp(daytime * (1.0 - overcast) * bandLM * daySkyBlue, 0.0, 1.0));
      let az = vnoise(vec2<f32>(atan2(dir.z, dir.x) * 2.2, up * 6.0)) - 0.5;
      c = c * (1.0 + az * 0.05 * daytime * (1.0 - overcast) * (1.0 - smoothstep(0.0, 0.5, up)));
    }
    // Golden-hour + low-sun band: both amounts are 0 when sunE >= 0.72
    // (GLX SKY_FS). Default day / night moon-key skip; dawn/dusk still enter.
    if (sunE < 0.72) {
    // Golden-hour warm band near the horizon when the sun is low.
    let goldenAmt = (1.0 - smoothstep(0.0, 0.72, sunE)) * (1.0 - smoothstep(0.0, 0.32, up))
                  * (1.0 - overcast * 0.9);
    let goldenColor = mix(vec3<f32>(0.70, 0.22, 0.04), vec3<f32>(0.92, 0.55, 0.16),
                          clamp(sunE * 2.5, 0.0, 1.0));
    c = mix(c, c * 0.45 + goldenColor * 0.55, goldenAmt * 0.80);
    let lowBand = (1.0 - smoothstep(0.0, 0.60, sunE))
                * (1.0 - smoothstep(0.0, 0.18, up))
                * smoothstep(0.01, 0.06, up)
                * (1.0 - overcast * 0.85);
    let lowColor = mix(vec3<f32>(0.90, 0.26, 0.03), vec3<f32>(1.0, 0.66, 0.12),
                       clamp(sunE * 3.0, 0.0, 1.0));
    c = mix(c, lowColor, lowBand * 0.70);
    }
  } else {
    let gnd = clamp(-up * 5.0, 0.0, 1.0);
    c = mix(U.horizon.xyz * 0.85, vec3<f32>(0.035, 0.030, 0.022), gnd * gnd);
  }

  // covRay: cloud coverage seen along this ray, hoisted for the star-occlusion
  // term below (GLX parity — stars fade out behind the deck).
  var covRay = 0.0;
  if (cloud > 0.001 && up > 0.012) {
    let cp = dir.xz / up * 0.42;
    let cT = time * cloudSpeed;
    let cp1 = cp + vec2<f32>(cT * 0.0028, cT * 0.0011);
    let cp2 = cp + vec2<f32>(cT * 0.0017, cT * 0.0023);
    let f = fbm(cp1);
    var cov = smoothstep(0.50 - cloud * 0.42, 0.84, f) * smoothstep(0.013, 0.05, up);
    // Billow octave + CLOUD DEFINITION (GLX SKY_FS / TLX tsl-sky). Day +
    // twilight get lumpy cumulus edges; deep night stays a soft smear.
    let cloudRich = max(daytime, twilight);
    if (cloudRich > 0.001) {
      let billow = fbm(cp1 * 2.3 + vec2<f32>(11.7, 4.3));
      let defined = smoothstep(0.42, 0.80, f * 0.6 + billow * 0.45)
                  * smoothstep(0.013, 0.05, up);
      cov = mix(cov, max(cov, defined), clamp(cloudRich * 0.85 * cloudDef, 0.0, 1.0));
      // Twilight / day horizon cloud-bank (GLX SKY_FS): distant cumulus on a
      // compressed plane so the low gameplay sky band isn't a plain wash.
      let bp = dir.xz / max(up, 0.02) * 0.16 + vec2<f32>(cT * 0.0028, cT * 0.0011) * 1.4;
      let bankThresh = 0.46 - cloud * 0.30 - twilight * 0.10;
      let bankCov = smoothstep(bankThresh, 0.80, fbm(bp))
                  * smoothstep(0.013, 0.030, up) * (1.0 - smoothstep(0.10, 0.26, up));
      cov = max(cov, bankCov * cloudRich * (1.0 - overcast * 0.5));
      cov = mix(cov, smoothstep(0.18, 0.82, cov), cloudRich * 0.5);
    }
    covRay = cov;
    let thick = clamp(fbm(cp2 * 0.55 + vec2<f32>(3.1, 1.7)) * 2.0 - 0.55, 0.0, 1.0);
    let sl = pow(sd, 2.0);
    let sunBright = max(sunColor.r, max(sunColor.g, sunColor.b));
    let cloudTop = mix(vec3<f32>(0.58, 0.62, 0.70), vec3<f32>(1.0, 0.97, 0.91), sl)
                 * (0.38 + 0.62 * sunBright);
    let cloudBot = vec3<f32>(0.26, 0.27, 0.34) * (0.24 + 0.44 * sunBright);
    var lit = mix(cloudBot, cloudTop, clamp(0.18 + (1.0 - thick) * 0.75, 0.0, 1.0));
    let silver = pow(sd, 6.0) * (1.0 - thick);
    lit = lit + sunColor * silver * 1.3 * cloudSilver;   // CLOUD SILVER LINING knob
    // LIGHTNING: cool blue-white flash through the deck (GLX SKY_FS).
    if (lightning > 0.001) {
      let ltFlash = vec3<f32>(0.82, 0.94, 1.30) * (1.0 + thick * 1.2);
      lit = mix(lit, ltFlash, clamp(lightning * (0.40 + 0.60 * thick), 0.0, 1.0));
    }
    c = mix(c, lit, cov);
  }

  // LIGHTNING sky-gradient lift between clouds (GLX SKY_FS).
  if (lightning > 0.001 && up > 0.0) {
    c = c + vec3<f32>(0.10, 0.13, 0.20) * lightning * (1.0 - covRay * 0.6);
  }

  let upPos = max(up, 0.0);
  // MIE SCATTER knob (clamp keeps the mix blend valid past 1).
  c = mix(c, sunColor, clamp(pow(sd, 5.0) * 0.22 * max(1.0 - upPos * 1.5, 0.0) * mieScatter, 0.0, 1.0));
  // SKIP THE WHOLE BLOCK ON A NIGHT FRAME (GLX SKY_FS) — don't mul-to-zero.
  // uStars/nightSky is a uniform, so the branch is uniform control flow.
  if (nightSky < 0.5) {
    let golden = 1.0 - smoothstep(0.0, 0.45, sunE);
    let coronaDamp = 1.0 - nightSky;
    let sunWarm = mix(sunColor, sunColor * vec3<f32>(1.18, 0.52, 0.24), golden);
    c = c + sunWarm * pow(sd, mix(20.0, 8.0, golden)) * (0.55 + golden * 0.55) * coronaDamp * coronaAureole;   // SUN AUREOLE knob
    c = c + sunWarm * pow(sd, 300.0) * 0.95 * sunCorona * coronaDamp;   // SUN CORONA RING knob
    let dd = dir - sunDir * sd;
    // SUN HORIZON SQUASH knob: scales the golden-hour vertical squash of the disc.
    let perp = length(vec2<f32>(length(dd.xz), dd.y * mix(1.0, mix(1.0, 1.6, golden), sunSquash)));
    // SUN DISC SIZE knob: scale both smoothstep edges to grow/shrink the disc.
    let disc = smoothstep(mix(0.018, 0.028, golden) * sunDiscSize, 0.006 * sunDiscSize, perp) * coronaDamp;
    let discCore = mix(vec3<f32>(2.3, 2.2, 1.9), sunWarm * 2.8, golden);
    c = c + discCore * disc;
  }

  if (stars > 0.5 && up > 0.05) {
    let SC = 180.0;
    let cell = floor(dir * SC);
    let h = hash3(cell);
    // STAR DENSITY knob (GLX parity): scale the (1 - threshold) spawn window,
    // clamped below 1 so a huge density can't reject every cell to a blank sky.
    if (h > min(0.9994, 1.0 - (1.0 - 0.9968) * starDensity)) {
      let jit = vec3<f32>(hash3(cell + 7.1), hash3(cell + 13.7), hash3(cell + 29.3)) - 0.5;
      let sdir = normalize((cell + 0.5 + jit * 0.8) / SC);
      let dstar = length(dir - sdir);
      let bright = 0.30 + 0.55 * hash3(cell + 43.0);
      let phase = hash3(cell + 31.0) * 6.2832;
      let twinkle = 0.80 + 0.20 * starTwinkle * sin(time * 1.4 + phase);   // STAR TWINKLE knob
      let giant = step(0.9995, h);
      let srad = mix(0.0016, 0.0028, giant) * starSize;   // STAR SIZE knob
      let star = smoothstep(srad, srad * 0.35, dstar) * min(0.88, bright * twinkle * (1.0 + giant * 0.6));
      // Cloud occlusion (GLX parity): stars sit behind the deck.
      c = c + vec3<f32>(star) * starBright * (1.0 - covRay);
    }
  }

  if (moon > 0.0 && stars > 0.5) {
    let moonDir = normalize(vec3<f32>(0.42, 0.72, 0.55));
    let md = dot(dir, moonDir);
    let moonPerp = length(dir - moonDir * max(md, 0.0));
    let moonDisc = smoothstep(0.025 * moonDiscSize, 0.010 * moonDiscSize, moonPerp) * moon;   // MOON DISC SIZE knob
    let moonHalo = exp(-moonPerp * moonPerp * (140.0 / moonHaloK)) * 0.28 * moonHaloK * moon;   // MOON HALO knob
    if (up > 0.0 && md > 0.0) {
      // Cloud occlusion (GLX / TLX): the moon sits behind the deck.
      c = c + vec3<f32>(0.82, 0.88, 1.00) * (moonDisc * 1.10 + moonHalo) * (1.0 - covRay);
    }
  }

  if (U.cityGlow.x + U.cityGlow.y + U.cityGlow.z > 0.001) {
    let horiz = pow(clamp(1.0 - max(dir.y, 0.0) * 2.4, 0.0, 1.0), 3.0 * cityGlowReach);   // CITY GLOW REACH knob
    c = c + U.cityGlow.xyz * horiz;
  }

  // ~1/255 interleaved-gradient dither on the dome output (GLX SKY_FS parity):
  // breaks the night-gradient banding at scene write; time-stepped shimmer.
  let skyDth = fract(52.9829189 * fract(dot(
    in.pos.xy + 5.588238 * (floor(time * 60.0) % 64.0),
    vec2<f32>(0.06711056, 0.00583715))));
  c = c + vec3<f32>((skyDth - 0.5) * (1.0 / 255.0));

  return vec4<f32>(c, 1.0);
}`;

  return {
    // named leaves (for future passes to compose)
    hash,
    vnoise,
    tonemap,
    fullscreenTri,
    brdf,
    // real shaders, pre-composed from the leaves above
    SKY,
    LIT,
    BLIT,
    BLOCKER,
    SHADOW,
    // byte size of the SkyU uniform block (mat4 64 + 11*vec4 176 = 240)
    SKY_UNIFORM_BYTES: 240,
    // Lit-pipeline uniform block sizes (see the LIT struct comments; the JS-side
    // writers in wgx.js MUST agree with these).
        FRAME_UNIFORM_BYTES: 560,   // FrameU + lampLightVP + params8 + params9 (LIT tuner knobs)
    SHADOW_LVP_BYTES: 64,       // ShadowU (lightVP mat4)
    SHADOW_MODEL_BYTES: 64,     // ShadowModel (model mat4), dynamic-offset stride 256
    LIGHT_STRIDE_BYTES: 64,     // one Light
    MAX_LIGHTS: 48,
    DRAW_UNIFORM_BYTES: 128,    // DrawU used bytes (dynamic-offset stride is 256)
    BLIT_UNIFORM_BYTES: 16,     // BlitU
    DEPTH_RESOLVE: `
@group(0) @binding(0) var src : texture_depth_multisampled_2d;
struct DROut { @builtin(position) clip : vec4<f32> };
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> DROut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o : DROut;
  o.clip = vec4<f32>(p[vi], 0.0, 1.0);
  return o;
}
@fragment
fn fs_main(@builtin(position) pos : vec4<f32>) -> @builtin(frag_depth) f32 {
  let c = vec2<i32>(pos.xy);
  // MSAA_COUNT is 4 (or this pass is not created). min of only samples 0 and 1
  // was correct when the count was 2; after the spec-legal 4× fix it left
  // samples 2 and 3 out of the resolved depth used by SSAO/godray/SSR.
  return min(
    min(textureLoad(src, c, 0), textureLoad(src, c, 1)),
    min(textureLoad(src, c, 2), textureLoad(src, c, 3)));
}`,
  };
})();

// No-build global export (mirror GLX/Parts/Tracks style).
if (typeof window !== "undefined") window.WGSLChunks = WGSLChunks;
