/* Apex 26 — TLXShaders.gi: the desktop-tier screen-space passes of the TLX backend (GTAO, SSGI, DoF, motion blur) and their tier plan.
 * Design: docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md §Phase 1, 2, 5. Holds the tier plan (which extra is BUILT at
 * chain creation and which is LIVE this frame), the pure maths the shaders are built from (kernels, sample budgets,
 * GTAO's slice integral, the depth-of-field circle of confusion, the focus pull, the motion-blur velocity clamp), and
 * the TSL builders of the new passes: GTAO, a depth-aware bilateral denoise, one-bounce SSGI, the autofocus probe,
 * depth of field and camera motion blur; on native WebGPU, SSGI temporal accumulation and, with the scene's velocity
 * attachment, per-object reprojection and motion blur.
 *
 * Nothing here runs below ULTRA, on a phone, on GLX / WGX, or with fixed / orient-cover targets: buildPlan() answers all
 * false there and tlx-post.js keeps today's exact pass set. tsl-post.js builds the variants that live inside its own
 * closures (16-tap SSAO, the 32-step god-ray march, the SSR / SSGI composite) from the same budgets.
 *
 * UNVERIFIED ON A GPU: this container has none. The node graphs are built from three's TSL exactly as tsl-post.js builds
 * bloom / SSAO / SSR, but no frame of them has been compiled or seen. */
"use strict";

(function () {
  // -------------------------------------------------------------------------------------------------------------------
  // PURE MATHS (node-tested: tests/unit/tsl-gi.test.mjs). Every constant a shader below is built from lives here.
  // -------------------------------------------------------------------------------------------------------------------
  const NAMES = Object.freeze(["ssaoHi", "raysHi", "gtao", "ssrHi", "ssgi", "dof", "motionBlur"]);
  // Per-tier sample budgets: index 0 is today's shipped value (tsl-post.js), index 1 the desktop extra.
  const BUDGET = Object.freeze({
    ssaoTaps: Object.freeze([8, 16]),
    raySteps: Object.freeze([16, 32]),
    rayLamps: Object.freeze([6, 12]),
    ssrMarch: Object.freeze([24, 48]),
    ssrRefine: Object.freeze([4, 8]),
    ssrStep: Object.freeze([0.55, 0.35]),       // first march step (m) at quality 0
    ssrGrowth: Object.freeze([1.16, 1.075]),    // per-step growth at quality 0
    gtaoSlices: 3, gtaoSteps: 6,
    ssgiRays: 6, ssgiSteps: 8, ssgiRadius: 3.0, ssgiStr: 0.35,
    // Temporal SSGI: fewer rays a frame (rotated per frame by giPhase), the history carries the rest. Per pixel
    // 4 x 8 march steps + the accumulate pass's 12 taps (depth, velocity, 3x3 current, history) against today's
    // 6 x 8 (tsl-gi.test.mjs pins the inequality).
    ssgiRaysT: 4, giAccTaps: 12,
    dofTaps: 24, mbTaps: 12,
  });

  // The 16-tap SSAO kernel: n directions evenly round the circle, radii alternating 1 / 0.55 so half the taps probe the
  // near field (today's 8 taps are all unit length over 240 degrees). Rotated per pixel by the pass's noise angle.
  function ssaoKernel(n) {
    const k = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = i % 2 === 0 ? 1.0 : 0.55;
      k.push([+(Math.cos(a) * r).toFixed(6), +(Math.sin(a) * r).toFixed(6)]);
    }
    return k;
  }

  // Total distance a geometric SSR march reaches: s0 * (g^n - 1) / (g - 1).
  function marchReach(s0, g, n) { return g === 1 ? s0 * n : s0 * (Math.pow(g, n) - 1) / (g - 1); }

  // GTAO (Jimenez et al. 2016, the XeGTAO form): one slice's cosine-weighted visibility, given the projected normal's
  // angle n, the two horizon angles h0 <= n <= h1 (clamped to n +- pi/2) and the projected normal's length.
  function gtaoSliceVis(n, h0, h1, projLen) {
    const H = Math.PI / 2;
    const c0 = n + Math.max(-H, Math.min(H, h0 - n)), c1 = n + Math.max(-H, Math.min(H, h1 - n));
    const cosN = Math.cos(n), sinN = Math.sin(n);
    const a0 = (cosN + 2 * c0 * sinN - Math.cos(2 * c0 - n)) / 4;
    const a1 = (cosN + 2 * c1 * sinN - Math.cos(2 * c1 - n)) / 4;
    return projLen * (a0 + a1);
  }
  // The distance falloff a horizon sample takes (1 inside 38.5 % of the radius, 0 at the radius).
  function gtaoFalloff(dist, radius) {
    const range = 0.615 * radius, from = radius * (1 - 0.615);
    return Math.max(0, Math.min(1, dist * (-1 / range) + (from / range + 1)));
  }

  // Bilateral denoise: the separable 5-tap gaussian of makeBlur times a RELATIVE depth weight, so a car silhouette or a
  // wall edge does not bleed AO / GI into the road behind it.
  const BILATERAL_G = Object.freeze([0.2270270270, 0.3162162162, 0.0702702703]);
  const BILATERAL_O = Object.freeze([1.3846153846, 3.2307692308]);
  function bilateralDepthW(dz, zc) { return Math.exp(-Math.abs(dz) / (Math.abs(zc) * 0.04 + 0.05)); }

  // Depth of field: thin-lens circle of confusion in pixels for a view distance z (m), focus distance f (m).
  // |1 - f/z| is 0 at the focus plane, rises to 1 at infinity, and grows past 1 in front of it (clamped).
  function cocPx(z, f, aperture, maxPx) {
    if (!(z > 0) || !(f > 0)) return 0;
    return Math.max(0, Math.min(1, aperture * Math.abs(1 - f / z))) * maxPx;
  }
  // Golden-angle spiral, n taps on the unit disc (sqrt radius: equal area per tap).
  function dofKernel(n) {
    const ga = Math.PI * (3 - Math.sqrt(5)), k = [];
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt((i + 0.5) / n), a = i * ga;
      k.push([+(Math.cos(a) * r).toFixed(6), +(Math.sin(a) * r).toFixed(6)]);
    }
    return k;
  }
  // Autofocus: the mean distance of the probe taps that land on a car (the followed car fills the probe window in the
  // chase / replay framing), else the centre tap; clamped to the lens range. samples = [{ z, car }], centre = metres.
  const FOCUS_MIN = 0.5, FOCUS_MAX = 400;
  function focusDistance(samples, centre) {
    let s = 0, n = 0;
    for (const p of samples || []) if (p && p.car && p.z > 0) { s += p.z; n++; }
    const z = n > 0 ? s / n : centre;
    return Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, z > 0 ? z : FOCUS_MAX));
  }
  // Focus pull: exponential approach, ~0.25 s to 63 %; a first frame or a camera cut snaps (blend 1).
  function focusBlend(dt, snap) {
    if (snap || !(dt > 0)) return 1;
    return 1 - Math.exp(-Math.min(dt, 0.25) / 0.25);
  }
  // Camera motion blur: the screen velocity (uv / frame) scaled by the shutter, clamped to maxLen; a jump longer than
  // cutLen is a camera cut, not motion, and blurs nothing.
  function mbVelocity(dx, dy, shutter, maxLen, cutLen) {
    const len = Math.hypot(dx, dy);
    if (!(len > 0) || len > cutLen) return [0, 0];
    const s = shutter * Math.min(1, maxLen / (len * shutter));
    return [dx * s, dy * s];
  }
  const MB = Object.freeze({ shutter: 0.5, maxLen: 0.06, cutLen: 0.25 });
  // SSGI TEMPORAL ACCUMULATION: last frame's GI reprojected (per-object velocity where the scene has it, else the
  // camera through the depth), clamped to this frame's 3x3 spatial neighbourhood and blended at weight 0.9; a
  // disoccluded / off-screen / reset pixel takes this frame's spatial-only denoise alone. depthTol as TRAA's.
  const GI_ACC = Object.freeze({ weight: 0.9, depthTol: 0.08, skyD: 0.999999, wMax: 60000 });
  // The shader's blend in JS: cur / hist / lo / hi are rgb triples; reject = disocclusion, off-screen or reset.
  function historyBlend(cur, hist, lo, hi, weight, reject, out) {
    const o = out || [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const h = Math.min(Math.max(hist[i], lo[i]), hi[i]);
      o[i] = reject ? cur[i] : h * weight + cur[i] * (1 - weight);
    }
    return o;
  }
  // The per-frame ray rotation: an R2 offset (px) into the interleaved-gradient noise, so frames sample new
  // directions the history then averages.
  function giPhase(n, out) {
    const o = out || [0, 0];
    o[0] = ((n * 0.7548776662) % 1) * 64; o[1] = ((n * 0.5698402910) % 1) * 64;
    return o;
  }
  // The effective sample count after k frames of history at weight w (geometric series), times the per-frame rays.
  function giEffectiveRays(raysPerFrame, w, k) { return raysPerFrame * (1 - Math.pow(w, k)) / (1 - w); }
  const DOF = Object.freeze({ aperture: 0.55, maxPx1080: 11 });

  // WHICH EXTRA IS BUILT. env = { detail, need(name) -> level (GfxQuality.FEATURES), feature(name) -> bool (boot, no
  // shed), webgpu, mobile, phys, hdr }. A feature at or under the device's detail level is built when feature() says
  // so; the CINEMA extras (level 3) whenever detail is EXTREME (cinema flips at runtime); any feature forced on with
  // apex26.gfxx.<name>=1 below its level is built too (the A/B). Levels 2+ need native WebGPU (the design's TLX WebGPU
  // carve-out) unless forced; DoF needs the HDR chain for its float focus probe. Phones and fixed targets: none.
  function buildPlan(env) {
    const e = env || {}, out = {};
    for (const n of NAMES) out[n] = false;
    if (e.mobile || e.phys) return out;
    const d = e.detail | 0;
    for (const n of NAMES) {
      let need = 0, f = false;
      try { need = e.need ? e.need(n) | 0 : 0; f = !!(e.feature && e.feature(n)); } catch (_) { need = 0; f = false; }
      if (!need) continue;
      const natural = d >= Math.min(need, 2);
      let b = need >= 3 ? natural || f : f;
      if (b && natural && need >= 2 && !e.webgpu) b = false;
      if (b && n === "dof" && !e.hdr) b = false;
      out[n] = b;
    }
    return out;
  }
  // WHICH BUILT EXTRA IS LIVE: built && feature(name) now (the governor's shed and the cinema flag move it).
  function livePlan(build, feature) {
    const out = {};
    for (const n of NAMES) {
      let on = false;
      try { on = !!(build && build[n] && feature(n)); } catch (_) { on = false; }
      out[n] = on;
    }
    return out;
  }
  function anyBuilt(build) { return !!build && NAMES.some((n) => build[n]); }

  // GfxQuality's view of this boot (no GfxQuality = nothing built). Every read guarded: a throw means today's path.
  function gfxEnv(extra) {
    const env = Object.assign({ detail: 0, need: () => 0, feature: () => false }, extra || {});
    try {
      if (typeof GfxQuality === "undefined" || !GfxQuality.feature) return env;
      env.detail = GfxQuality.detail() | 0;
      env.need = (n) => (GfxQuality.FEATURES && GfxQuality.FEATURES[n]) | 0;
      env.feature = (n) => !!GfxQuality.feature(n);
    } catch (_) { env.detail = 0; env.need = () => 0; env.feature = () => false; }
    return env;
  }
  function gfxFeature(n) {
    try { return typeof GfxQuality !== "undefined" && !!GfxQuality.feature(n); } catch (_) { return false; }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // TSL BUILDERS. bag = tsl-post.js's helpers: { passMaterial, depthAt, TL, sceneT, tagT, viewPosNdc, clipXYW, perspU,
  // ssaoU, contactShadowT, ignoise, blackTex }. Every material keeps its own customProgramCacheKey; every texture slot
  // gets its OWN placeholder (three merges texture nodes that hold one texture at build time, tsl-post.js composite).
  // -------------------------------------------------------------------------------------------------------------------
  function build(THREE, TSL, bag, plan) {
    const {
      Fn, If, Loop, Break, uniform, texture, float, int, vec2, vec3, vec4, screenCoordinate,
      dot, cross, mix, clamp, max, min, abs, normalize, length, select, sin, cos, sqrt, acos, sign, fract, smoothstep,
      dFdx, dFdy, exp,
    } = TSL;
    const { passMaterial, depthAt, TL, sceneT, tagT, viewPosNdc, clipXYW, perspU, ssaoU, ignoise } = bag;
    const own = () => {
      const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
      if (bag.ownTexture) bag.ownTexture(t);
      return t;
    };
    const glUV = bag.passUV;
    const out = {};
    const PI = Math.PI;

    // Bilateral denoise (H or V by U.dir). zOf: view z (negative) at a GL uv, from the U the caller keeps current.
    function makeBilateral(key, zOf) {
      const tex = texture(own());
      const U = { dir: uniform(new THREE.Vector2()) };
      const mat = passMaterial(Fn(() => {
        const vUV = glUV();
        const zc = float(zOf(vUV)).toVar();
        const c0 = vec4(tex.sample(TL(vUV))).toVar();
        const s = vec4(c0.mul(BILATERAL_G[0])).toVar();
        const wsum = float(BILATERAL_G[0]).toVar();
        for (let k = 0; k < 2; k++) {
          for (const sg of [1, -1]) {
            const uv = vUV.add(U.dir.mul(BILATERAL_O[k] * sg)).toVar();
            const dz = float(zOf(uv)).sub(zc);
            const w = float(BILATERAL_G[k + 1]).mul(exp(abs(dz).negate().div(abs(zc).mul(0.04).add(0.05)))).toVar();
            s.addAssign(tex.sample(TL(uv)).mul(w));
            wsum.addAssign(w);
          }
        }
        return vec4(s.div(wsum).rgb, 1.0);
      })(), key);
      return { mat, tex, U };
    }
    const zFrom = (U) => (uv) => viewPosNdc(U, uv, depthAt(uv).mul(2.0).sub(1.0)).z;

    // GTAO: horizon-based, BUDGET.gtaoSlices slices x 2 sides x BUDGET.gtaoSteps steps, then today's contact shadows.
    if (plan.gtao) {
      const zAO = zFrom(ssaoU);
      const vp = (uv) => viewPosNdc(ssaoU, uv, depthAt(uv).mul(2.0).sub(1.0));
      const texel = uniform(new THREE.Vector2(1, 1));   // 1 / AO target size
      const halfH = uniform(1);                         // 0.5 * AO target height (px per NDC unit)
      const mat = passMaterial(Fn(() => {
        const vUV = glUV();
        const d = depthAt(vUV).toVar();
        const res = float(1.0).toVar();
        // Derivatives in uniform control flow, before the sky gate (tsl-post.js ssaoTerm).
        const P0 = vec3(viewPosNdc(ssaoU, vUV, d.mul(2.0).sub(1.0))).toVar();
        const crN0 = cross(dFdx(P0), dFdy(P0)).toVar();
        If(d.lessThan(0.99999), () => {
          const P = P0;
          const crL = length(crN0).toVar();
          const N = select(crL.greaterThan(1e-6), crN0.div(crL), vec3(0.0, 0.0, 1.0)).toVar();
          If(dot(N, P).greaterThan(0.0), () => { N.assign(N.negate()); });   // face the eye
          const ao = float(1.0).toVar();
          If(ssaoU.strength.greaterThan(0.0), () => {
            const V = normalize(P.negate()).toVar();
            const R = float(ssaoU.radius).mul(1.5).toVar();
            const scrPx = clamp(R.mul(ssaoU.pXY.y).mul(halfH).div(max(P.z.negate(), 0.1)), 4.0, 96.0).toVar();
            const ign = ignoise(screenCoordinate.xy).toVar();
            const jit = fract(ign.mul(1.6180339).add(0.5)).toVar();
            const fMul = float(-1.0).div(R.mul(0.615)).toVar();
            const fAdd = R.mul(1.0 - 0.615).div(R.mul(0.615)).add(1.0).toVar();
            const vis = float(0.0).toVar();
            const SL = BUDGET.gtaoSlices, ST = BUDGET.gtaoSteps;
            for (let s = 0; s < SL; s++) {
              const phi = ign.mul(PI).add(s * PI / SL).toVar();
              const dir = vec3(cos(phi), sin(phi), 0.0).toVar();
              const ortho = dir.sub(V.mul(dot(dir, V))).toVar();
              const axis = normalize(cross(ortho, V)).toVar();
              const pN = N.sub(axis.mul(dot(N, axis))).toVar();
              const pLen = max(length(pN), 1e-4).toVar();
              const sgn = sign(dot(ortho, pN)).toVar();
              const cosN = clamp(dot(pN, V).div(pLen), 0.0, 1.0).toVar();
              const n = sgn.mul(acos(cosN)).toVar();
              const hc0 = cos(n.add(PI / 2)).toVar();   // side +dir
              const hc1 = cos(n.sub(PI / 2)).toVar();   // side -dir
              const low0 = float(hc0).toVar(), low1 = float(hc1).toVar();
              for (let j = 0; j < ST; j++) {
                const t = float(j).add(jit).div(ST).toVar();
                const off = dir.xy.mul(t.mul(t).mul(scrPx).add(1.0)).mul(texel).toVar();
                for (const side of [0, 1]) {
                  const uv = clamp(side === 0 ? vUV.add(off) : vUV.sub(off), vec2(0.001), vec2(0.999));
                  const dv = vp(uv).sub(P).toVar();
                  const len = max(length(dv), 1e-4).toVar();
                  const w = clamp(len.mul(fMul).add(fAdd), 0.0, 1.0);
                  const hc = mix(side === 0 ? low0 : low1, dot(dv.div(len), V), w);
                  if (side === 0) hc0.assign(max(hc0, hc)); else hc1.assign(max(hc1, hc));
                }
              }
              const h0 = n.add(clamp(acos(clamp(hc1, -1.0, 1.0)).negate().sub(n), -PI / 2, PI / 2)).toVar();
              const h1 = n.add(clamp(acos(clamp(hc0, -1.0, 1.0)).sub(n), -PI / 2, PI / 2)).toVar();
              const sinN = sin(n);
              const a0 = cosN.add(h0.mul(2.0).mul(sinN)).sub(cos(h0.mul(2.0).sub(n))).div(4.0);
              const a1 = cosN.add(h1.mul(2.0).mul(sinN)).sub(cos(h1.mul(2.0).sub(n))).div(4.0);
              vis.addAssign(pLen.mul(a0.add(a1)));
            }
            vis.divAssign(SL);
            ao.assign(clamp(float(1.0).sub(clamp(vis, 0.0, 1.0).oneMinus().mul(ssaoU.strength).mul(1.4)), 0.0, 1.0));
          });
          if (bag.contactShadowT) bag.contactShadowT(P, N, ao);
          res.assign(ao);
        });
        return vec4(res, res, res, 1.0);
      })(), "tlx-gi-gtao");
      out.gtao = { mat, U: { texel, halfH } };
      out.gtaoH = makeBilateral("tlx-gi-gtao-bl-h", zAO);
      out.gtaoV = makeBilateral("tlx-gi-gtao-bl-v", zAO);
    }

    // SSGI: one diffuse bounce from the lit HDR scene, half resolution; cosine-weighted rays marched in view space.
    // ssgiPass(RAYS, key, temporal): today's pass (6 rays, no phase) or the temporal one (BUDGET.ssgiRaysT rays, the
    // interleaved-gradient noise shifted by U.phase each frame). Same march, same soft-clip.
    function ssgiPass(RAYS, key, temporal) {
      const giU = Object.assign(perspU(), {
        radius: uniform(BUDGET.ssgiRadius),
        thick: uniform(0.6),
      });
      if (temporal) giU.phase = uniform(new THREE.Vector2(0, 0));
      const vp = (uv) => viewPosNdc(giU, uv, depthAt(uv).mul(2.0).sub(1.0));
      const mat = passMaterial(Fn(() => {
        const vUV = glUV();
        const d = depthAt(vUV).toVar();
        const P0 = vec3(viewPosNdc(giU, vUV, d.mul(2.0).sub(1.0))).toVar();
        const crN0 = cross(dFdx(P0), dFdy(P0)).toVar();
        const acc = vec3(0.0).toVar();
        If(d.lessThan(0.99999), () => {
          const P = P0;
          const crL = length(crN0).toVar();
          const N = select(crL.greaterThan(1e-6), crN0.div(crL), vec3(0.0, 0.0, 1.0)).toVar();
          If(dot(N, P).greaterThan(0.0), () => { N.assign(N.negate()); });
          const up = select(abs(N.y).lessThan(0.99), vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0));
          const T = normalize(cross(N, up)).toVar();
          const B = cross(N, T).toVar();
          const ign = ignoise(temporal ? screenCoordinate.xy.add(giU.phase) : screenCoordinate.xy).toVar();
          const jit = fract(ign.mul(1.6180339).add(0.5)).toVar();
          const STEPS = BUDGET.ssgiSteps;
          const stepLen = giU.radius.div(STEPS).toVar();
          for (let r = 0; r < RAYS; r++) {
            const u1 = fract(ign.add((r + 0.5) / RAYS)).toVar();
            const phi = jit.mul(2 * PI).add(r * 2.39996323).toVar();
            const sinT = sqrt(u1), cosT = sqrt(u1.oneMinus());
            const dir = T.mul(cos(phi).mul(sinT)).add(B.mul(sin(phi).mul(sinT))).add(N.mul(cosT)).toVar();
            const pos = P.add(N.mul(0.05)).add(dir.mul(stepLen.mul(jit))).toVar();
            Loop({ start: int(0), end: int(STEPS), type: "int", condition: "<" }, () => {
              pos.addAssign(dir.mul(stepLen));
              const cp = clipXYW(giU, pos).toVar();
              If(cp.z.lessThanEqual(0.0), () => { Break(); });
              const muv = cp.xy.div(cp.z).mul(0.5).add(0.5).toVar();
              If(muv.x.lessThan(0.0).or(muv.x.greaterThan(1.0))
                .or(muv.y.lessThan(0.0)).or(muv.y.greaterThan(1.0)), () => { Break(); });
              const dz = vp(muv).z.sub(pos.z).toVar();
              If(dz.greaterThan(0.02).and(dz.lessThan(giU.thick.add(stepLen))), () => {
                const dist = length(pos.sub(P));
                acc.addAssign(vec3(sceneT.sample(TL(muv)).rgb).div(dist.mul(dist).mul(0.15).add(1.0)));
                Break();
              });
            });
          }
          acc.divAssign(RAYS);
          acc.assign(acc.div(dot(acc, vec3(0.299, 0.587, 0.114)).add(1.0)));   // firefly soft-clip
        });
        return vec4(acc, 1.0);
      })(), key);
      return { mat, U: giU };
    }
    // The accumulate pass (half res): history <- blend(this frame's denoised GI, last frame's reprojected GI). Alpha
    // carries the view depth, the disocclusion test. velT: the scene's velocity attachment, else camera only.
    function giAccPass(velTex) {
      const curT = texture(own()), histT = texture(own());
      const velT = velTex ? texture(velTex) : null;
      const aU = {
        invVP: uniform(new THREE.Matrix4()), prevVP: uniform(new THREE.Matrix4()),
        texel: uniform(new THREE.Vector2(1, 1)), reset: uniform(1),
        weight: uniform(GI_ACC.weight), depthTol: uniform(GI_ACC.depthTol),
      };
      const mat = passMaterial(Fn(() => {
        const vUV = glUV();
        const d = min(depthAt(vUV), float(GI_ACC.skyD)).toVar();
        const wp = aU.invVP.mul(vec4(vUV.mul(2.0).sub(1.0), d.mul(2.0).sub(1.0), 1.0)).toVar();
        const wCur = min(float(1.0).div(wp.w), float(GI_ACC.wMax));
        const pc = aU.prevVP.mul(vec4(wp.xyz.div(wp.w), 1.0)).toVar();
        const pUv = pc.xy.div(pc.w).mul(0.5).add(0.5).toVar();
        if (velT) If(d.lessThan(float(GI_ACC.skyD)), () => { pUv.assign(vUV.sub(vec2(velT.sample(TL(vUV)).xy).mul(0.5))); });
        const c = vec3(curT.sample(TL(vUV)).rgb).toVar();
        const mn = vec3(c).toVar(), mx = vec3(c).toVar();
        for (let y = -1; y <= 1; y++) {
          for (let x = -1; x <= 1; x++) {
            if (!x && !y) continue;
            const sN = curT.sample(TL(vUV.add(vec2(x, y).mul(aU.texel)))).rgb;
            mn.assign(min(mn, sN)); mx.assign(max(mx, sN));
          }
        }
        const h = vec4(histT.sample(TL(pUv))).toVar();
        const wPrev = min(pc.w, float(GI_ACC.wMax));
        const rej = aU.reset.greaterThan(0.5).or(d.greaterThanEqual(float(GI_ACC.skyD)))
          .or(pUv.x.lessThan(0.0)).or(pUv.x.greaterThan(1.0)).or(pUv.y.lessThan(0.0)).or(pUv.y.greaterThan(1.0))
          .or(pc.w.lessThanEqual(0.0)).or(abs(h.a.sub(wPrev)).div(max(wPrev, 1e-3)).greaterThan(aU.depthTol));
        const blended = mix(c, clamp(h.rgb, mn, mx), aU.weight);
        return vec4(select(rej, c, blended), wCur);
      })(), "tlx-gi-ssgi-acc");
      return { mat, U: aU, cur: curT, hist: histT, velocity: !!velT };
    }
    if (plan.ssgi) {
      // bag.giTemporal (EXTREME on native WebGPU): the temporal pass set; a build throw keeps today's spatial set.
      let pass = null;
      if (bag.giTemporal) {
        try {
          pass = ssgiPass(BUDGET.ssgiRaysT, "tlx-gi-ssgi-t", true);
          out.giAcc = giAccPass(bag.velTex || null);
        } catch (_) { pass = null; out.giAcc = null; }
      }
      if (!pass) pass = ssgiPass(BUDGET.ssgiRays, "tlx-gi-ssgi", false);
      out.ssgi = pass;
      const zGI = zFrom(pass.U);
      out.giH = makeBilateral("tlx-gi-ssgi-bl-h", zGI);
      out.giV = makeBilateral("tlx-gi-ssgi-bl-v", zGI);
    }

    // Autofocus probe (1x1, float): 5x3 taps round focusUV; car-tagged taps win; blended with the previous value.
    if (plan.dof) {
      const fU = Object.assign(perspU(), {
        focusUV: uniform(new THREE.Vector2(0.5, 0.45)),
        fixed: uniform(0),      // > 0: a caller-given focus distance (m)
        blend: uniform(1),
      });
      const prevTex = texture(own());
      const dist = (uv) => viewPosNdc(fU, uv, depthAt(uv).mul(2.0).sub(1.0)).z.negate();
      const focusMat = passMaterial(Fn(() => {
        const sum = float(0.0).toVar(), cnt = float(0.0).toVar();
        for (let gy = -1; gy <= 1; gy++) {
          for (let gx = -2; gx <= 2; gx++) {
            const uv = clamp(fU.focusUV.add(vec2(gx * 0.06, gy * 0.07)), vec2(0.001), vec2(0.999)).toVar();
            const car = smoothstep(0.42, 0.55, tagT.sample(TL(uv)).r).oneMinus();
            const dd = depthAt(uv);
            If(car.greaterThan(0.5).and(dd.lessThan(0.99999)), () => { sum.addAssign(dist(uv)); cnt.addAssign(1.0); });
          }
        }
        const cd = depthAt(fU.focusUV);
        const centre = select(cd.lessThan(0.99999), dist(fU.focusUV), float(FOCUS_MAX));
        const target = clamp(select(cnt.greaterThan(0.5), sum.div(max(cnt, 1.0)), centre), FOCUS_MIN, FOCUS_MAX).toVar();
        If(fU.fixed.greaterThan(0.0), () => { target.assign(fU.fixed); });
        const prev = float(prevTex.sample(vec2(0.5)).r);
        return vec4(mix(prev, target, fU.blend), 0.0, 0.0, 1.0);
      })(), "tlx-gi-focus");
      out.focus = { mat: focusMat, U: fU, prevTex };

      const src = texture(own());
      const focusTex = texture(own());
      const dU = Object.assign(perspU(), {
        texel: uniform(new THREE.Vector2(1, 1)),
        aperture: uniform(DOF.aperture),
        maxPx: uniform(DOF.maxPx1080),
      });
      const zDist = (uv) => viewPosNdc(dU, uv, depthAt(uv).mul(2.0).sub(1.0)).z.negate();
      const K = dofKernel(BUDGET.dofTaps);
      const dofMat = passMaterial(Fn(() => {
        const vUV = glUV();
        const f = max(float(focusTex.sample(vec2(0.5)).r), FOCUS_MIN).toVar();
        const coc = (z) => clamp(dU.aperture.mul(abs(float(1.0).sub(f.div(max(z, 0.05))))), 0.0, 1.0).mul(dU.maxPx);
        const z0 = float(zDist(vUV)).toVar();
        const c0 = float(coc(z0)).toVar();
        const acc = vec3(src.sample(TL(vUV)).rgb).toVar();
        const wsum = float(1.0).toVar();
        If(c0.greaterThan(0.5), () => {
          for (const k of K) {
            const rr = Math.hypot(k[0], k[1]);
            const uv = clamp(vUV.add(vec2(k[0], k[1]).mul(c0).mul(dU.texel)), vec2(0.0), vec2(1.0)).toVar();
            const zt = float(zDist(uv)).toVar();
            const ct = coc(zt);
            const w = clamp(select(zt.lessThan(z0), ct, min(ct, c0)).sub(c0.mul(rr)).add(1.0), 0.0, 1.0).toVar();
            acc.addAssign(vec3(src.sample(TL(uv)).rgb).mul(w));
            wsum.addAssign(w);
          }
        });
        return vec4(acc.div(wsum), 1.0);
      })(), "tlx-gi-dof");
      out.dof = { mat: dofMat, U: dU, src, focusTex };
    }

    // Camera motion blur: depth reprojection through last frame's view-projection; car pixels (the tag) stay sharp
    // and never smear into the world. With bag.velTex (the scene's per-object velocity attachment) every drawn pixel
    // blurs along its OWN motion instead: a rival passing the camera smears, the followed car (still relative to the
    // camera) stays sharp; world taps still refuse car pixels. The camera answer keeps the cut test either way.
    function mbPass(velTex) {
      const src = texture(own());
      const velT = velTex ? texture(velTex) : null;
      const mU = {
        invVP: uniform(new THREE.Matrix4()), prevVP: uniform(new THREE.Matrix4()),
        shutter: uniform(MB.shutter), maxLen: uniform(MB.maxLen), cutLen: uniform(MB.cutLen),
      };
      const isCar = (uv) => smoothstep(0.42, 0.55, tagT.sample(TL(uv)).r).oneMinus();
      const mbMat = passMaterial(Fn(() => {
        const vUV = glUV();
        const d = min(depthAt(vUV), 0.99999).toVar();
        const w = mU.invVP.mul(vec4(vUV.mul(2.0).sub(1.0), d.mul(2.0).sub(1.0), 1.0)).toVar();
        const wp = w.xyz.div(w.w).toVar();
        const pc = mU.prevVP.mul(vec4(wp, 1.0)).toVar();
        const puv = pc.xy.div(max(pc.w, 1e-4)).mul(0.5).add(0.5).toVar();
        const raw = vUV.sub(puv).toVar();
        const len = length(raw).toVar();
        const carC = velT ? isCar(vUV).toVar() : null;
        let mv = raw, mlen = len;
        if (velT) {
          const ov = vec2(raw).toVar();
          If(d.lessThan(0.99999), () => { ov.assign(vec2(velT.sample(TL(vUV)).xy).mul(0.5)); });
          mv = ov; mlen = length(ov).toVar();
        }
        const vel = mv.mul(mU.shutter).mul(min(float(1.0), mU.maxLen.div(max(mlen.mul(mU.shutter), 1e-6)))).toVar();
        If(len.greaterThan(mU.cutLen).or(pc.w.lessThanEqual(0.0)).or(velT ? mlen.greaterThan(mU.cutLen) : isCar(vUV).greaterThan(0.5)), () => {
          vel.assign(vec2(0.0));
        });
        const c0 = vec3(src.sample(TL(vUV)).rgb).toVar();
        const acc = vec3(c0).toVar();
        const wsum = float(1.0).toVar();
        If(length(vel).greaterThan(0.0005), () => {
          const ign = ignoise(screenCoordinate.xy).toVar();
          const N = BUDGET.mbTaps;
          for (let i = 0; i < N; i++) {
            const t = float(i).add(ign).div(N).sub(0.5);
            const uv = clamp(vUV.add(vel.mul(t)), vec2(0.0), vec2(1.0)).toVar();
            // A car tap would smear the car into the world; a car pixel blurs over whatever its motion crosses.
            const wt = (velT ? max(isCar(uv).oneMinus(), carC) : isCar(uv).oneMinus()).toVar();
            acc.addAssign(vec3(src.sample(TL(uv)).rgb).mul(wt));
            wsum.addAssign(wt);
          }
        });
        return vec4(acc.div(wsum), 1.0);
      })(), velT ? "tlx-gi-mblur-v" : "tlx-gi-mblur");
      return { mat: mbMat, U: mU, src, velocity: !!velT };
    }
    if (plan.motionBlur) {
      let mb = null;
      if (bag.velTex) { try { mb = mbPass(bag.velTex); } catch (_) { mb = null; } }
      out.motionBlur = mb || mbPass(null);
    }
    return out;
  }

  const gi = {
    NAMES, BUDGET, MB, DOF, FOCUS_MIN, FOCUS_MAX, BILATERAL_G, BILATERAL_O,
    ssaoKernel, marchReach, gtaoSliceVis, gtaoFalloff, bilateralDepthW, cocPx, dofKernel, focusDistance, focusBlend,
    mbVelocity, buildPlan, livePlan, anyBuilt, gfxEnv, gfxFeature, build,
    GI_ACC, historyBlend, giPhase, giEffectiveRays,
  };
  window.TLXShaders = Object.assign(window.TLXShaders || {}, { gi: Object.freeze(gi) });
})();
