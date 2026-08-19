/* Apex 26 — TLXShaders.post: the TSL post-chain shaders for the TLX backend (M8). A 1:1 port of js/render/shaders/post.js (the GLSL source of truth): BRIGHT (soft… */
"use strict";

(function () {
  const GR_MAX_LIGHTS = 12;

  function post(THREE, TSL, ctx) {
    const {
      Fn, If, Loop, Break, Continue, uniform, uniformArray, texture,
      float, int, vec2, vec3, vec4,
      screenUV, screenCoordinate,
      fract, floor, mod, dot, cross, mix, smoothstep, clamp, pow, exp, exp2,
      log2, sqrt, abs, max, min, normalize, length, reflect, select, sin, cos,
      dFdx, dFdy,
    } = TSL;
    const { vnoise, ignoise } = ctx.chunks;
    const SHD = ctx.shadow || null;   // tlx-shadow.js subsystem (godray needs it)

    // GL bottom-left uv -> the node system's top-left texture space.
    const TL = (u) => vec2(u.x, u.y.oneMinus());
    // Shadow-map UV flip — the tsl-lit.js flipUV convention for compare taps.
    const flipUV = TL;

    const sceneT = texture(ctx.sceneTex);
    const tagT = texture(ctx.sceneTagTex || ctx.sceneTex);
    const depthT = texture(ctx.sceneDepthTex);
    const dirtT = texture(ctx.dirtTex || ctx.blackTex);
    const depthAt = (uvGl) => float(depthT.sample(TL(uvGl)));
    /** Fullscreen overwrite pass material (POST_VS role is three's QuadMesh). */
    const _pinKeys = Object.create(null);
    function passMaterial(fragNode, key) {
      const m = new THREE.NodeMaterial();
      if (typeof ctx.trackMaterial === "function") ctx.trackMaterial(m);
      m.fragmentNode = fragNode;
      m.depthTest = false;
      m.depthWrite = false;
      m.blending = THREE.NoBlending;
      m.fog = false;
      m.lights = false;
      const k = key || "tlx-post";
      m.customProgramCacheKey = _pinKeys[k] || (_pinKeys[k] = () => k);
      return m;
    }

    const brightU = { threshold: uniform(0.75) };
    const bright = {
      U: brightU,
      mat: passMaterial(Fn(() => {
        const suv = vec2(screenUV).toVar();
        const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
        const c = vec3(sceneT.sample(TL(vUV)).rgb).toVar();
        const l = max(max(c.r, c.g), c.b).toVar();
        const knee = brightU.threshold.mul(0.5).add(1e-4).toVar();
        const soft = clamp(l.sub(brightU.threshold).add(knee), 0.0, knee.mul(2.0)).toVar();
        soft.assign(soft.mul(soft).div(knee.mul(4.0)));
        const k = max(soft, l.sub(brightU.threshold)).div(max(l, 1e-4));
        return vec4(c.mul(k), 1.0);
      })(), "tlx-post-bright"),
    };

    // Two instances (SSAO r8 target family / godray HDR family) so a material
    // never renders into two different target formats (pipeline-per-format).
    function makeBlur(key) {
      const tex = texture(ctx.blackTex);
      const U = { dir: uniform(new THREE.Vector2()) };
      const mat = passMaterial(Fn(() => {
        const suv = vec2(screenUV).toVar();
        const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
        const o1 = U.dir.mul(1.3846153846);
        const o2 = U.dir.mul(3.2307692308);
        const s = vec3(tex.sample(TL(vUV)).rgb.mul(0.2270270270)).toVar();
        s.addAssign(tex.sample(TL(vUV.add(o1))).rgb.mul(0.3162162162));
        s.addAssign(tex.sample(TL(vUV.sub(o1))).rgb.mul(0.3162162162));
        s.addAssign(tex.sample(TL(vUV.add(o2))).rgb.mul(0.0702702703));
        s.addAssign(tex.sample(TL(vUV.sub(o2))).rgb.mul(0.0702702703));
        return vec4(s, 1.0);
      })(), key);
      return { mat, tex, U };
    }
    const blurAO = makeBlur("tlx-post-blur-ao");
    const blurGR = makeBlur("tlx-post-blur-godray");

    const downTex = texture(ctx.blackTex);
    const downU = { texel: uniform(new THREE.Vector2()), karis: uniform(0) };
    const down = {
      tex: downTex, U: downU,
      mat: passMaterial(Fn(() => {
        const suv = vec2(screenUV).toVar();
        const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
        const t = vec2(downU.texel).toVar();
        const tap = (x, y) => vec3(downTex.sample(TL(vUV.add(t.mul(vec2(x, y))))).rgb);
        const a = tap(-2, 2).toVar(), b = tap(0, 2).toVar(), c = tap(2, 2).toVar();
        const d = tap(-2, 0).toVar(), e = tap(0, 0).toVar(), f = tap(2, 0).toVar();
        const g = tap(-2, -2).toVar(), h = tap(0, -2).toVar(), i = tap(2, -2).toVar();
        const j = tap(-1, 1).toVar(), k = tap(1, 1).toVar();
        const l = tap(-1, -1).toVar(), m = tap(1, -1).toVar();
        const g0 = a.add(b).add(d).add(e).mul(0.25).toVar();
        const g1 = b.add(c).add(e).add(f).mul(0.25).toVar();
        const g2 = d.add(e).add(g).add(h).mul(0.25).toVar();
        const g3 = e.add(f).add(h).add(i).mul(0.25).toVar();
        const g4 = j.add(k).add(l).add(m).mul(0.25).toVar();
        const res = vec3(0.0).toVar();
        If(downU.karis.greaterThan(0.5), () => {
          // Karis partial luma weighting, FIRST mip only (firefly fix).
          const w0 = float(0.125).div(max(g0.r, max(g0.g, g0.b)).add(1.0)).toVar();
          const w1 = float(0.125).div(max(g1.r, max(g1.g, g1.b)).add(1.0)).toVar();
          const w2 = float(0.125).div(max(g2.r, max(g2.g, g2.b)).add(1.0)).toVar();
          const w3 = float(0.125).div(max(g3.r, max(g3.g, g3.b)).add(1.0)).toVar();
          const w4 = float(0.5).div(max(g4.r, max(g4.g, g4.b)).add(1.0)).toVar();
          res.assign(g0.mul(w0).add(g1.mul(w1)).add(g2.mul(w2)).add(g3.mul(w3)).add(g4.mul(w4))
            .div(w0.add(w1).add(w2).add(w3).add(w4)));
        }).Else(() => {
          res.assign(g0.add(g1).add(g2).add(g3).mul(0.125).add(g4.mul(0.5)));
        });
        return vec4(res, 1.0);
      })(), "tlx-post-down"),
    };

    /* ── UP (UP_FS in js/render/shaders/post.js): 9-tap tent. Two materials: additive
     *    (ONE,ONE) for the intermediate octaves, overwrite for the final into
     *    level 0 (js/render/shaders/post.js — adding onto the sharp bright-pass
     *    would re-inject it at full sharpness). Shared BLOOM SPREAD knob. ── */
    const spread = uniform(1.0);
    function makeUp(additive) {
      const tex = texture(ctx.blackTex);
      const U = { texel: uniform(new THREE.Vector2()) };
      const mat = passMaterial(Fn(() => {
        const suv = vec2(screenUV).toVar();
        const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
        const t = vec2(U.texel.mul(spread)).toVar();
        const tp = (x, y) => vec3(tex.sample(TL(vUV.add(t.mul(vec2(x, y))))).rgb);
        const s = tp(-1, 1).add(tp(1, 1)).add(tp(-1, -1)).add(tp(1, -1))
          .add(tp(0, 1).add(tp(0, -1)).add(tp(-1, 0)).add(tp(1, 0)).mul(2.0))
          .add(tp(0, 0).mul(4.0));
        return vec4(s.div(16.0), 1.0);
      })(), additive ? "tlx-post-up-add" : "tlx-post-up");
      if (additive) {
        m8Additive(mat);
      }
      return { mat, tex, U };
    }
    function m8Additive(mat) {
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendEquationAlpha = THREE.AddEquation;
      mat.blendSrcAlpha = THREE.OneFactor;
      mat.blendDstAlpha = THREE.OneFactor;
    }
    const upAdd = makeUp(true);
    const upFinal = makeUp(false);

    /* ── SSAO (SSAO_FS in js/render/shaders/post.js): view-space horizon AO + contact
     *    shadows, half-res. Depth reconstruction through the game's
     *    GL-convention invProj (window depth d -> NDC z = d*2-1, exactly the
     *    GLSL — the shadow family already treats every manual matrix as GL
     *    convention on both backends, see tsl-lit sampleShadow). ──────────── */
    const ssaoU = {
      invProj: uniform(new THREE.Matrix4()),
      proj: uniform(new THREE.Matrix4()),
      sunVS: uniform(new THREE.Vector3(0, 0, -1)),
      texel: uniform(new THREE.Vector2()),
      strength: uniform(0),
      contact: uniform(0),
      radius: uniform(0.6),
    };
    const ssaoViewPosFromD = (uvGl, d) => {
      const c = vec4(uvGl.mul(2.0).sub(1.0), d.mul(2.0).sub(1.0), 1.0);
      const v = ssaoU.invProj.mul(c);
      return v.xyz.div(v.w);
    };
    const ssaoViewPos = (uvGl) => ssaoViewPosFromD(uvGl, depthAt(uvGl));
    // 12-vector kernel, first 8 used (js/render/shaders/post.js, 190).
    const SSAO_K = [
      [0.0, 1.0], [0.5, 0.866], [0.866, 0.5], [1.0, 0.0],
      [0.866, -0.5], [0.5, -0.866], [0.0, -1.0], [-0.5, -0.866],
    ];
    const ssao = {
      U: ssaoU,
      mat: passMaterial(Fn(() => {
        const suv = vec2(screenUV).toVar();
        const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
        const res = float(1.0).toVar();
        const d = depthAt(vUV).toVar();
        // Derivatives BEFORE the sky depth gate — non-uniform If around dFdx/dFdy
        // is a hard WGSL compile error on TLX-WebGPU (same class as WGX fwidth).
        const P0 = vec3(ssaoViewPosFromD(vUV, d)).toVar();
        const crN0 = cross(dFdx(P0), dFdy(P0)).toVar();
        If(d.lessThan(0.99999), () => {          // sky -> 1.0
          const P = P0;
          const crN = crN0;
          const crL = length(crN).toVar();
          const N = select(crL.greaterThan(1e-6), crN.div(crL), vec3(0.0, 0.0, 1.0)).toVar();
          // GLX SSAO does not flip N.z — a view-space coin toss darkens walls.
          const radius = float(ssaoU.radius).toVar();
          const occ = float(0.0).toVar();
          // GLX/WGX: skip the 8 dependent depth taps when AO strength is 0
          // (contact shadows still run). strength is a uniform.
          If(ssaoU.strength.greaterThan(0.0), () => {
            const scr = clamp(radius.div(max(P.z.negate(), 1.0)).mul(0.9), 0.004, 0.05).toVar();
            const ang = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453)).mul(6.2832).toVar();
            const ca = cos(ang).toVar(), sa = sin(ang).toVar();
            for (let ki = 0; ki < 8; ki++) {         // 12→8 taps (half-res + blurred)
              const kx = SSAO_K[ki][0], ky = SSAO_K[ki][1];
              const k = vec2(ca.mul(kx).sub(sa.mul(ky)), sa.mul(kx).add(ca.mul(ky)));
              const S = ssaoViewPos(clamp(vUV.add(k.mul(scr)), vec2(0.001), vec2(0.999))).toVar();
              const V = S.sub(P).toVar();
              const len = length(V).toVar();
              const ndv = max(dot(N, V.div(max(len, 1e-4))).sub(0.10), 0.0);
              const range = smoothstep(radius, radius.mul(0.4), len);
              occ.addAssign(ndv.mul(range));
            }
          });
          const ao = clamp(occ.div(8.0).mul(2.4), 0.0, 1.0).mul(ssaoU.strength).oneMinus().toVar();
          // Contact shadows: short view-space march toward the sun (SSAO_FS).
          If(ssaoU.contact.greaterThan(0.0).and(ssaoU.sunVS.z.lessThan(0.05)), () => {
            const sh = float(1.0).toVar();
            Loop({ start: int(1), end: int(6), type: "int", condition: "<" }, ({ i }) => {
              const q = P.add(ssaoU.sunVS.mul(float(i).mul(0.04))).toVar();
              const cp = ssaoU.proj.mul(vec4(q, 1.0)).toVar();
              const quv = cp.xy.div(cp.w).mul(0.5).add(0.5).toVar();
              If(quv.x.lessThan(0.0).or(quv.x.greaterThan(1.0))
                .or(quv.y.lessThan(0.0)).or(quv.y.greaterThan(1.0)), () => { Break(); });
              const B = ssaoViewPos(quv).toVar();
              const dz = B.z.sub(q.z).toVar();
              // Coplanar-road false-occluder reject js/render/shaders/post.js.
              const above = dot(N, B.sub(P));
              const aboveBias = float(0.05).add(max(P.z.negate().sub(6.0), 0.0).mul(0.01));
              If(dz.greaterThan(0.015).and(dz.lessThan(0.5)).and(above.greaterThan(aboveBias)), () => {
                sh.assign(ssaoU.contact.oneMinus());
                Break();
              });
            });
            const front = clamp(ssaoU.sunVS.z.negate().mul(6.0), 0.0, 1.0);
            ao.mulAssign(mix(float(1.0), sh, front));
          });
          res.assign(ao);
        });
        return vec4(res, res, res, 1.0);
      })(), "tlx-post-ssao"),
    };

    /* ── GODRAY (GODRAY_FS in js/render/shaders/post.js): world-space 16-step march of
     *    the SUN SHADOW MAP + nearest-12 lamp beam in-scatter with the mapped
     *    lamp's spot-shadow carve. Built only when the shadow subsystem is
     *    live — its depth textures are the samplers. ───────────────────────── */
    let godray = null;
    if (SHD && SHD.sunTex) {
      const grU = {
        invVP: uniform(new THREE.Matrix4()),
        lightVP: uniform(new THREE.Matrix4()),
        eye: uniform(new THREE.Vector3()),
        sunDir: uniform(new THREE.Vector3(0, 1, 0)),
        sunColor: uniform(new THREE.Vector3(1, 1, 1)),
        str: uniform(0),
        time: uniform(0),
        cloudCover: uniform(0),
        cloudSpeed: uniform(1),
        numLights: uniform(0),
        mist: uniform(0),
        lampStr: uniform(0),
        hgAniso: uniform(0.60),     // GOD-RAY FOCUS (TUNE_DEFS godrayAniso)
        hgFloor: uniform(0.020),    // GOD-RAY HAZE  (TUNE_DEFS godrayFloor)
        lampShadowVP: uniform(new THREE.Matrix4()),
        lampShadowIdx: uniform(-1.0),
      };
      const grPos = Array.from({ length: GR_MAX_LIGHTS }, () => new THREE.Vector3());
      const grCol = Array.from({ length: GR_MAX_LIGHTS }, () => new THREE.Vector3());
      const grDir = Array.from({ length: GR_MAX_LIGHTS }, () => new THREE.Vector3(0, -1, 0));
      const grGeo = Array.from({ length: GR_MAX_LIGHTS }, () => new THREE.Vector4(1, 1, 0.8, 0));
      grU.lightPos = uniformArray(grPos);
      grU.lightCol = uniformArray(grCol);
      grU.lightDir = uniformArray(grDir);
      grU.lightGeo = uniformArray(grGeo);

      const worldPos = (uvGl, d) => {
        const c = vec4(uvGl.mul(2.0).sub(1.0), d.mul(2.0).sub(1.0), 1.0);
        const w = grU.invVP.mul(c);
        return w.xyz.div(w.w);
      };
      // 3-octave surface-family FBM js/render/shaders/post.js over the shared vnoise leaf.
      const gCloudFBM = (pIn) => {
        const s1 = vnoise(pIn).mul(0.5);
        const s2 = vnoise(pIn.mul(2.03).add(1.7)).mul(0.25);
        const s3 = vnoise(pIn.mul(2.03 * 2.03).add(1.7 * 2.03 + 1.7)).mul(0.125);
        return s1.add(s2).add(s3);
      };
      const gCloud = Fn(([wpIn]) => {
        const wp = vec3(wpIn).toVar();
        const res = float(0.0).toVar();
        If(grU.cloudCover.greaterThan(0.001).and(grU.sunDir.y.greaterThan(0.06)), () => {
          const t = float(360.0).sub(wp.y).div(max(grU.sunDir.y, 0.15));
          const cT = grU.time.mul(grU.cloudSpeed);
          const cp = wp.xz.add(grU.sunDir.xz.mul(t)).mul(0.0052)
            .add(vec2(cT.mul(0.012), cT.mul(0.005)));
          res.assign(smoothstep(float(0.54).sub(grU.cloudCover.mul(0.40)), 0.92, gCloudFBM(cp))
            .mul(grU.cloudCover));
        });
        return res;
      });

      godray = {
        U: grU,
        lightPos: grPos, lightCol: grCol, lightDir: grDir, lightGeo: grGeo,
        mat: passMaterial(Fn(() => {
          const suv = vec2(screenUV).toVar();
          const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
          const d = depthAt(vUV).toVar();
          const viewDir = normalize(worldPos(vUV, float(0.5)).sub(grU.eye)).toVar();
          const endP = select(d.greaterThanEqual(0.99999),
            grU.eye.add(viewDir.mul(400.0)), worldPos(vUV, d)).toVar();
          const ro = vec3(grU.eye).toVar();
          const rd = endP.sub(ro).toVar();
          const dist = length(rd).toVar();
          rd.assign(rd.div(max(dist, 1e-4)));
          const march = min(dist, 260.0).toVar();
          const stepLen = march.div(16.0).toVar();     // N = 16
          const ign = ignoise(screenCoordinate.xy);
          const t0 = stepLen.mul(ign).toVar();
          const accum = float(0.0).toVar();
          const lampAccum = vec3(0.0).toVar();
          const trans = float(1.0).toVar();            // Beer-Lambert extinction
          const groundY = grU.eye.y.sub(4.0).toVar();  // local ground datum
          Loop({ start: int(0), end: int(16), type: "int", condition: "<" }, ({ i }) => {
            const td = t0.add(stepLen.mul(float(i))).toVar();
            const p = ro.add(rd.mul(td)).toVar();
            trans.mulAssign(exp(stepLen.mul(-0.010)));
            // SUN half: GLX/WGSL gate on uStr. Night haveGR is lampVol with
            // str=0 (moon-key sunDir.y ~0.97) — 16 shadow taps + gCloud FBM
            // were * 0. trans stays outside so lampAccum is bit-identical.
            If(grU.str.greaterThan(0.0), () => {
            const hSun = exp(max(p.y.sub(groundY), 0.0).mul(-0.03)).toVar();
            const lc = grU.lightVP.mul(vec4(p, 1.0)).toVar();
            const sc = lc.xyz.div(lc.w).mul(0.5).add(0.5).toVar();
            const lit = float(1.0).toVar();
            If(sc.x.greaterThan(0.0).and(sc.x.lessThan(1.0))
              .and(sc.y.greaterThan(0.0)).and(sc.y.lessThan(1.0))
              .and(sc.z.lessThan(1.0)), () => {
              lit.assign(texture(SHD.sunTex, flipUV(sc.xy)).compare(sc.z.sub(0.002)));
            });
            lit.mulAssign(gCloud(p).mul(0.62).oneMinus());   // SOFT crepuscular bands
            accum.addAssign(lit.mul(hSun).mul(trans));
            });
            // Lamp in-scatter: nearest-6 aimed beams js/render/shaders/post.js.
            If(grU.lampStr.greaterThan(0.0).and(td.lessThan(200.0)), () => {
              // hLamp only has one consumer (lampAccum). GLX moved the exp
              // inside this gate — daytime sun-shafts force lampVol=0.
              const hLamp = exp(max(p.y.sub(groundY), 0.0).mul(-0.07)).toVar();
              Loop({ start: int(0), end: int(6), type: "int", condition: "<" }, ({ i: li }) => {
                If(float(li).greaterThanEqual(grU.numLights), () => { Break(); });
                const geo = grU.lightGeo.element(li);
                const LP = grU.lightPos.element(li).sub(p).toVar();
                const ld = length(LP).toVar();
                const rad = float(geo.x).toVar();
                If(ld.lessThanEqual(rad), () => {
                  const Ld = LP.div(max(ld, 1e-3)).toVar();
                  const s = ld.div(rad);
                  const win = clamp(s.mul(s).mul(s).mul(s).oneMinus(), 0.0, 1.0);
                  const att = win.mul(win).div(ld.mul(ld).add(1.0));
                  const cd = dot(Ld.negate(), grU.lightDir.element(li));
                  const spot = smoothstep(geo.z, geo.y, cd);
                  const cosL = max(dot(rd, Ld), 0.0);
                  const hgLd = float(1.36).sub(cosL.mul(1.2)).toVar();   // HG g=0.6; d >= 0.16
                  const hgL = float(1.0 - 0.36).div(hgLd.mul(sqrt(hgLd)));
                  // Mapped-lamp spot shadow carve js/render/shaders/post.js.
                  const lampLit = float(1.0).toVar();
                  if (SHD.lampTex) {
                    If(float(li).equal(grU.lampShadowIdx), () => {
                      const lq = grU.lampShadowVP.mul(vec4(p, 1.0)).toVar();
                      If(lq.w.greaterThan(0.0), () => {
                        const lqs = lq.xyz.div(lq.w).mul(0.5).add(0.5).toVar();
                        If(lqs.x.greaterThan(0.002).and(lqs.x.lessThan(0.998))
                          .and(lqs.y.greaterThan(0.002)).and(lqs.y.lessThan(0.998))
                          .and(lqs.z.lessThan(1.0)), () => {
                          lampLit.assign(texture(SHD.lampTex, flipUV(lqs.xy)).compare(lqs.z.sub(0.004)));
                        });
                      });
                    });
                  }
                  lampAccum.addAssign(grU.lightCol.element(li)
                    .mul(att.mul(spot).mul(hgL.mul(0.14).add(0.12)).mul(lampLit))
                    .mul(float(geo.w)).mul(hLamp).mul(trans));
                });
              });
            });
          });
          accum.divAssign(16.0);
          lampAccum.mulAssign(grU.mist.mul(grU.lampStr).mul(2.0 / 16.0));
          // HG phase * str — skip the sqrt when str is 0 (GLX/WGSL).
          const sunTerm = vec3(0.0).toVar();
          If(grU.str.greaterThan(0.0), () => {
          const cosT = max(dot(rd, grU.sunDir), 0.0);
          const g = clamp(grU.hgAniso, 0.0, 0.95).toVar();
          const hgD = g.mul(g).add(1.0).sub(g.mul(cosT).mul(2.0)).toVar();
          const hg = g.mul(g).oneMinus().div(hgD.mul(sqrt(hgD)));
          const phase = hg.mul(0.16).add(grU.hgFloor);
          sunTerm.assign(grU.sunColor.mul(accum).mul(phase).mul(grU.str));
          });
          return vec4(sunTerm.add(lampAccum), 1.0);
        })(), "tlx-post-godray"),
      };
    }

    const C = {
      aoTexel: uniform(new THREE.Vector2(0, 0)),
      haveGodray: uniform(0),
      bloomAmt: uniform(0.55), bloomKnee: uniform(0.5),
      sunUV: uniform(new THREE.Vector2(-2, -2)),
      flareStr: uniform(0), exposure: uniform(1), sunShaft: uniform(0),
      gradeShadow: uniform(new THREE.Vector3(1, 1, 1)),
      gradeHi: uniform(new THREE.Vector3(1, 1, 1)),
      gradeStr: uniform(0),
      contrast: uniform(1.12), vibrance: uniform(0.20), saturation: uniform(1.0),
      tint: uniform(0), vignette: uniform(0.80), vigSoft: uniform(0.35),
      tone0: uniform(new THREE.Vector4(0, 0, 0, 0)),
      tone1: uniform(new THREE.Vector4(0, 0, 0, 0)),
      lift: uniform(new THREE.Vector3(0, 0, 0)),
      gamma: uniform(new THREE.Vector3(1, 1, 1)),
      gain: uniform(new THREE.Vector3(1, 1, 1)),
      hdrGradeOn: uniform(0),
      carReflect: uniform(0.05), carGloss: uniform(1.0),
      invProj: uniform(new THREE.Matrix4()), proj: uniform(new THREE.Matrix4()),
      upVS: uniform(new THREE.Vector3(0, 1, 0)),
      reflTexel: uniform(new THREE.Vector2()),
      reflect: uniform(0), ssrOk: uniform(0),
      reflSkyHi: uniform(new THREE.Vector3(0.05, 0.06, 0.09)),
      reflSkyLo: uniform(new THREE.Vector3(0.02, 0.025, 0.05)),
      ssrTopUV: uniform(0.62), ssrNear: uniform(-2.5),
      ssrThick: uniform(0.20), chromAb: uniform(0), grain: uniform(0),
      grainTime: uniform(0), sharpen: uniform(0), blackLift: uniform(0.005),
      whitePoint: uniform(1.0),
      acesA: uniform(2.51), acesB: uniform(0.03), acesC: uniform(2.43),
      acesD: uniform(0.59), acesE: uniform(0.14),
      speedBlur: uniform(0), lensDirt: uniform(0.15),
      hazeUV: uniform(new THREE.Vector2(-9, -9)), hazeStr: uniform(0),
      hazeTime: uniform(0),
      shaftDecay: uniform(0.82), shaftSpread: uniform(1.0),
      flareStreak: uniform(7.0), flareStreak2: uniform(0.5),
    };
    const bloomTexN = texture(ctx.blackTex);
    const ssaoTexN = texture(ctx.whiteTex);
    const godrayTexN = texture(ctx.blackTex);

    const acesTonemap = (x0) => {
      const x = max(x0, vec3(0.0));
      return clamp(x.mul(C.acesA.mul(x).add(C.acesB))
        .div(x.mul(C.acesC.mul(x).add(C.acesD)).add(C.acesE)), 0.0, 1.0);
    };

    // Reconstruct view-space position from depth (COMPOSITE ssrViewPos).
    const ssrViewPos = (uvGl) => {
      const d = depthAt(uvGl).mul(2.0).sub(1.0);
      const cp = C.invProj.mul(vec4(uvGl.mul(2.0).sub(1.0), d, 1.0));
      return cp.xyz.div(cp.w);
    };
    const caScene = (uvGl) => {
      const dd = uvGl.sub(0.5);
      const a = C.chromAb.mul(0.004).mul(dot(dd, dd));
      return vec3(
        sceneT.sample(TL(uvGl.add(dd.mul(a)))).r,
        sceneT.sample(TL(uvGl)).g,
        sceneT.sample(TL(uvGl.sub(dd.mul(a)))).b);
    };

    const composite = {
      U: C, tex: { bloom: bloomTexN, ssao: ssaoTexN, godray: godrayTexN },
      mat: passMaterial(Fn(() => {
        // ── anchors ─────────────────────────────────────────────────────────
        const suv = vec2(screenUV).toVar();
        const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
        const fragXY = vec2(screenCoordinate.xy).toVar();

        const hazeUV = vec2(vUV).toVar();
        If(C.hazeStr.greaterThan(0.002), () => {
          // SCREEN-SPACE TEST FIRST (GLX/WGSL). Gaussian is tight — ~8% of
          // the frame is on-plume; the tag fetch is a full-res dependent read.
          const hd = vUV.sub(C.hazeUV).sub(vec2(0.0, 0.08)).mul(vec2(3.2, 1.0)).toVar();
          const hm = exp(dot(hd, hd).mul(-70.0)).mul(C.hazeStr).toVar();
          If(hm.greaterThan(0.003), () => {
          const carHere = smoothstep(0.42, 0.55, tagT.sample(TL(vUV)).r).oneMinus();
          If(carHere.lessThan(0.25), () => {
            const hp = vUV.y.mul(90.0).sub(C.hazeTime.mul(11.0)).toVar();
            hazeUV.addAssign(vec2(sin(hp.add(vUV.x.mul(70.0))), cos(hp.mul(0.63)))
              .mul(hm.mul(0.0075)));
          });
          });
        });
        const scn = vec4(sceneT.sample(TL(hazeUV))).toVar();  // .rgb colour; tag is tagT
        const c = vec3(scn.rgb).toVar();
        const tagA = float(tagT.sample(TL(hazeUV)).r).toVar();
        const caDir = vec2(vUV.sub(0.5)).toVar();

        // CHROMATIC ABERRATION js/render/shaders/post.js — stays in the hazeUV domain.
        If(C.chromAb.greaterThan(0.001), () => {
          const caAmt = C.chromAb.mul(0.004).mul(dot(caDir, caDir));
          c.r.assign(sceneT.sample(TL(hazeUV.add(caDir.mul(caAmt)))).r);
          c.b.assign(sceneT.sample(TL(hazeUV.sub(caDir.mul(caAmt)))).b);
        });

        If(C.speedBlur.greaterThan(0.001), () => {
          const acc = vec3(c).toVar();
          for (let i = 1; i <= 4; i++) {
            const t = C.speedBlur.mul((i / 4) * 0.05);
            acc.addAssign(caScene(vUV.sub(caDir.mul(t))));
          }
          c.assign(acc.div(5.0));
        });

        // SHARPEN js/render/shaders/post.js: unsharp mask, caScene domain.
        If(C.sharpen.greaterThan(0.001), () => {
          const bl = caScene(vUV.add(vec2(C.reflTexel.x, 0.0)))
            .add(caScene(vUV.sub(vec2(C.reflTexel.x, 0.0))))
            .add(caScene(vUV.add(vec2(0.0, C.reflTexel.y))))
            .add(caScene(vUV.sub(vec2(0.0, C.reflTexel.y)))).mul(0.25);
          c.addAssign(c.sub(bl).mul(C.sharpen).mul(0.9));
        });

        const aoV = float(1.0).toVar();
        If(C.aoTexel.x.greaterThan(0.0), () => {
          const aoDc = depthAt(vUV).toVar();
          const aoG = vUV.div(C.aoTexel).sub(0.5).toVar();
          const aoF = fract(aoG).toVar();
          const aoB = floor(aoG).add(0.5).mul(C.aoTexel).toVar();
          const aoSum = float(0.0).toVar();
          const aoW = float(0.0).toVar();
          for (let ai = 0; ai < 4; ai++) {
            const auv = aoB.add(vec2(
              (ai === 1 || ai === 3) ? C.aoTexel.x : float(0.0),
              (ai >= 2) ? C.aoTexel.y : float(0.0))).toVar();
            const bw = (ai === 0 ? aoF.x.oneMinus().mul(aoF.y.oneMinus())
              : ai === 1 ? aoF.x.mul(aoF.y.oneMinus())
              : ai === 2 ? aoF.x.oneMinus().mul(aoF.y)
              : aoF.x.mul(aoF.y)).add(1e-4);
            const w = bw.div(abs(aoDc.sub(depthAt(auv))).mul(30.0).add(1e-4)).toVar();
            aoSum.addAssign(float(ssaoTexN.sample(TL(auv)).r).mul(w));
            aoW.addAssign(w);
          }
          aoV.assign(aoSum.div(aoW));
        });
        c.mulAssign(aoV);

        // Volumetric sun shafts: skip the fetch when the CPU shed the pass.
        If(C.haveGodray.greaterThan(0.5), () => {
          c.addAssign(godrayTexN.sample(TL(vUV)).rgb);
        });

        // ── Wet-road + car-paint screen-space reflection js/render/shaders/post.js ──
        const carPx = smoothstep(0.42, 0.55, tagA).oneMinus().toVar();
        If(C.ssrOk.greaterThan(0.5)
          .and(C.reflect.greaterThan(0.001).or(carPx.greaterThan(0.3)))
          .and(depthAt(vUV).lessThan(0.9999))
          .and(vUV.y.lessThan(C.ssrTopUV)), () => {   // sky/horizon seam gate
          const P = vec3(ssrViewPos(vUV)).toVar();
          const nT = C.reflTexel.mul(3.0).toVar();
          const dpx = ssrViewPos(vUV.add(vec2(nT.x, 0.0))).sub(P).toVar();
          const dpy = ssrViewPos(vUV.add(vec2(0.0, nT.y))).sub(P).toVar();
          const crv = cross(dpx, dpy).toVar();
          const crvL = length(crv).toVar();
          const upVSn = normalize(C.upVS).toVar();
          // CONDITIONING, not absolute magnitude (COMPOSITE_FS in
          // js/render/shaders/post.js). crvL scales with |dpx|·|dpy|, so at
          // grazing distance the cross stays large while its DIRECTION is
          // depth-quantization noise — the old crvL>1e-6 guard almost never
          // fired where it was needed and the wet-road mask collapsed past
          // the first few metres. sinT is the scale-free sine of the angle
          // between the derivatives.
          const sinT = crvL.div(max(length(dpx).mul(length(dpy)), 1e-12)).toVar();
          const Nv = select(crvL.greaterThan(1e-6).and(sinT.greaterThan(0.08)),
            crv.div(crvL), upVSn).toVar();
          If(Nv.z.lessThan(0.0), () => { Nv.assign(Nv.negate()); });
          If(dot(Nv, upVSn).lessThan(-0.25), () => { Nv.assign(Nv.negate()); });
          const upDot = dot(Nv, upVSn).toVar();
          // Relaxed up-facing test + far fade pushed out, matching GLX.
          const roadMask = smoothstep(0.25, 0.55, upDot)
            .mul(smoothstep(C.ssrNear, C.ssrNear.mul(2.8), P.z))
            .mul(smoothstep(-22.0, -78.0, P.z).oneMinus()).toVar();
          const carMask = carPx.mul(smoothstep(0.30, 0.65, upDot))
            .mul(smoothstep(-1.0, -3.0, P.z))
            .mul(smoothstep(-22.0, -55.0, P.z).oneMinus()).toVar();
          // /3 keeps the per-texel meaning under the wider baseline.
          const edgeGrad = length(dpx).add(length(dpy)).div(3.0);
          carMask.mulAssign(smoothstep(0.35, 0.9, edgeGrad).oneMinus());
          const roadTerm = roadMask.mul(C.reflect).toVar();
          const carTerm = carMask.mul(C.carReflect).toVar();
          const ssrGate = max(roadTerm, carTerm).toVar();
          If(ssrGate.greaterThan(0.001), () => {
            const carDomEarly = carTerm.greaterThan(roadTerm);
            const V = normalize(P.negate()).toVar();
            const Nr = select(carDomEarly, Nv, normalize(mix(Nv, upVSn, 0.85))).toVar();
            const R = reflect(V.negate(), Nr).toVar();
            // Jittered fine march js/render/shaders/post.js.
            const ign = ignoise(fragXY).toVar();
            const pos = vec3(P).toVar();
            const prevPos = vec3(P).toVar();
            const stepLen = float(0.55).toVar();
            pos.addAssign(R.mul(stepLen.mul(ign)));
            const hit = float(0.0).toVar();
            const hitDist = float(0.0).toVar();
            const hitUV = vec2(0.0).toVar();
            const found = float(0.0).toVar();
            Loop({ start: int(0), end: int(24), type: "int", condition: "<" }, () => {
              prevPos.assign(pos);
              pos.addAssign(R.mul(stepLen));
              stepLen.mulAssign(1.16);
              const cp = C.proj.mul(vec4(pos, 1.0)).toVar();
              If(cp.w.lessThanEqual(0.0), () => { Break(); });
              const muv = cp.xy.div(cp.w).mul(0.5).add(0.5).toVar();
              If(muv.x.lessThan(0.0).or(muv.x.greaterThan(1.0))
                .or(muv.y.lessThan(0.0)).or(muv.y.greaterThan(1.0)), () => { Break(); });
              const dz = ssrViewPos(muv).z.sub(pos.z).toVar();
              // SSR THICKNESS gate; far reject scales with the step.
              If(dz.greaterThan(C.ssrThick).and(dz.lessThan(max(float(5.0), stepLen.mul(1.5)))), () => {
                const aP = vec3(prevPos).toVar();
                const bP = vec3(pos).toVar();
                Loop({ start: int(0), end: int(4), type: "int", condition: "<" }, () => {
                  const mid = aP.add(bP).mul(0.5).toVar();
                  const mc = C.proj.mul(vec4(mid, 1.0)).toVar();
                  const midUV = mc.xy.div(mc.w).mul(0.5).add(0.5).toVar();
                  If(ssrViewPos(midUV).z.sub(mid.z).greaterThan(0.20), () => {
                    bP.assign(mid);
                  }).Else(() => {
                    aP.assign(mid);
                  });
                });
                const fc = C.proj.mul(vec4(bP, 1.0)).toVar();
                const huv = fc.xy.div(fc.w).mul(0.5).add(0.5).toVar();
                const hP = vec3(ssrViewPos(huv)).toVar();
                const hdx = ssrViewPos(huv.add(vec2(nT.x, 0.0))).sub(hP).toVar();
                const hdy = ssrViewPos(huv.add(vec2(0.0, nT.y))).sub(hP).toVar();
                const hcr = cross(hdx, hdy).toVar();
                const hcl = length(hcr).toVar();
                const hN = select(hcl.greaterThan(1e-6), hcr.div(hcl), upVSn).toVar();
                If(hN.z.lessThan(0.0), () => { hN.assign(hN.negate()); });
                const selfHit = carDomEarly.not().and(dot(hN, upVSn).greaterThan(0.55));
                If(selfHit, () => { Continue(); });
                hitUV.assign(huv);
                hitDist.assign(length(bP.sub(P)));
                const e = abs(hitUV.sub(0.5)).mul(2.0).toVar();
                hit.assign(pow(max(e.x, e.y), 4.0).oneMinus());   // screen-edge fade
                found.assign(1.0);
                Break();
              });
            });
            // Vertical light-smear streak taps + contact hardening (COMPOSITE_FS).
            const hitCol = vec3(0.0).toVar();
            const carDom = carTerm.greaterThan(roadTerm);
            If(found.greaterThan(0.5), () => {
              const carSoft = clamp(float(1.4).sub(C.carGloss).mul(0.5), 0.0, 1.0);
              const streak = select(carDom,
                C.carReflect.mul(carSoft.mul(0.030).add(0.006)),
                C.reflect.mul(clamp(C.ssrTopUV.sub(vUV.y).div(C.ssrTopUV), 0.0, 1.0).mul(0.022).add(0.010))).toVar();
              streak.mulAssign(mix(float(0.3), float(1.6), clamp(hitDist.div(25.0), 0.0, 1.0)));
              const sTap = (k) => sceneT.sample(TL(hitUV.add(vec2(0.0, streak.mul(k))))).rgb;
              const w0 = 0.30, w1 = 0.24, w2 = 0.15, w3 = 0.08, w4 = 0.04;
              hitCol.assign(sTap(0.0).mul(w0)
                .add(sTap(-0.5).mul(w1)).add(sTap(-1.0).mul(w2))
                .add(sTap(-1.6).mul(w3)).add(sTap(-2.3).mul(w4))
                .add(sTap(0.5).mul(w1)).add(sTap(1.0).mul(w2)));
              hitCol.divAssign(w0 + 2 * w1 + 2 * w2 + w3 + w4);
            });
            // Miss fallback: horizon-vs-zenith by the reflection's up-ness,
            // measured against the ROAD PLANE — R.y is view-space y, which only
            // tracks up while the camera is level, and the cockpit pitches with
            // the road.
            const skyRefl = mix(C.reflSkyHi, C.reflSkyLo, clamp(dot(R, upVSn), 0.0, 1.0));
            const conf = select(found.greaterThan(0.5), clamp(hit, 0.0, 1.0), float(0.0)).toVar();
            const reflCol = mix(skyRefl, hitCol, conf).toVar();
            reflCol.mulAssign(aoV.mul(aoV));           // Lagarde specular occlusion
            reflCol.assign(reflCol.div(reflCol.mul(0.35).add(1.0)));   // soft-clip
            // SSR changes WHAT the road mirrors, never HOW MUCH: a hit/miss step
            // in the substitution turned reflected CONTENT into a change of
            // SURFACE (glossy vs matte patches). Car paint keeps its
            // confidence-scaled cover — its env cube covers every direction.
            const cover = select(carDom, conf, float(0.60)).toVar();
            // Fresnel off the SAME normal the ray used, not the bumpy Nv.
            const fres = pow(max(dot(Nr, V), 0.0).oneMinus(), 3.0).toVar();
            const strength = ssrGate.mul(select(carDom,
              fres.mul(0.45).add(0.50), fres.mul(0.42).add(0.55))).toVar();
            const gateSrc = select(carDom, C.carReflect, C.reflect);
            strength.mulAssign(min(gateSrc.div(0.20), 1.0));
            // Soft fade below the hard 0.62 gate — no seam js/render/shaders/post.js.
            strength.mulAssign(smoothstep(C.ssrTopUV.sub(0.06), C.ssrTopUV, vUV.y).oneMinus());
            const mixAmt = clamp(strength.mul(cover), 0.0, select(carDom, float(0.85), float(0.80)));
            const mirrored = select(carDom,
              c.mul(0.22).add(reflCol.mul(0.88)),
              c.mul(0.10).add(reflCol.mul(0.92)));
            c.assign(mix(c, mirrored, mixAmt));
          });
        });

        // Exposure before tone-mapping js/render/shaders/post.js.
        c.mulAssign(C.exposure);

        // Bloom with the highlight-suppression knee, exposure-matched (COMPOSITE_FS).
        const bloomSample = vec3(0.0).toVar();
        If(C.bloomAmt.greaterThan(0.001), () => {
          bloomSample.assign(bloomTexN.sample(TL(vUV)).rgb);
          const bloomMask = clamp(max(c.r, max(c.g, c.b)).sub(0.7), 0.0, 0.3)
            .div(0.3).mul(C.bloomKnee).oneMinus();
          c.addAssign(bloomSample.mul(C.bloomAmt).mul(bloomMask).mul(C.exposure));
        });

        // LENS DIRT veil js/render/shaders/post.js: grime scatters the bright-pass.
        const dirt = float(0.0).toVar();
        If(C.lensDirt.greaterThan(0.001), () => {
          dirt.assign(dirtT.sample(TL(vUV)).r);
          c.addAssign(bloomSample.mul(C.exposure).mul(dirt).mul(C.lensDirt).mul(2.2));
        });

        // Screen-space sun shafts: 8 radial bright-pass taps js/render/shaders/post.js.
        // Bloom-gated: the taps read the bright-pass; a shed chain is * 0.
        If(C.sunShaft.greaterThan(0.0).and(C.bloomAmt.greaterThan(0.001)), () => {
          const toSun = C.sunUV.sub(vUV).toVar();
          const dist = length(toSun).toVar();
          If(dist.greaterThan(0.005), () => {
            const stp = toSun.div(dist).mul(min(dist, 0.40)).div(8.0).toVar();
            const shaft = vec3(0.0).toVar();
            const ign = ignoise(fragXY);
            const uvi = vUV.add(stp.mul(ign)).toVar();
            const decay = float(1.0).toVar();
            Loop({ start: int(0), end: int(8), type: "int", condition: "<" }, () => {
              uvi.addAssign(stp);
              const suv2 = clamp(uvi, vec2(0.0), vec2(1.0)).toVar();
              const reach = float(0.32).mul(C.shaftSpread);
              const sw = clamp(length(suv2.sub(C.sunUV)).div(reach), 0.0, 1.0).oneMinus().toVar();
              shaft.addAssign(bloomTexN.sample(TL(suv2)).rgb.mul(decay.mul(sw).mul(sw)));
              decay.mulAssign(C.shaftDecay);           // SUN-SHAFT REACH knob
            });
            shaft.divAssign(8.0);
            const radial = clamp(dist.mul(float(2.6).div(C.shaftSpread)), 0.0, 1.0).oneMinus();
            c.addAssign(shaft.mul(C.sunShaft).mul(radial).mul(radial).mul(0.60));
          });
        });

        If(C.hdrGradeOn.greaterThan(0.5), () => {
          const lift = vec3(C.lift).toVar();
          const gain = max(C.gain, vec3(1e-3)).toVar();
          const invGamma = vec3(1.0).div(max(C.gamma, vec3(1e-3))).toVar();
          c.assign(lift.add(gain.sub(lift).mul(pow(max(c, vec3(0.0)), invGamma))));
          // five overlapping exposure masks in log2 stops around 18% grey
          const y = max(dot(max(c, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722)), 1e-6).toVar();
          const z = log2(y.div(0.18)).toVar();
          const w0x = smoothstep(-4.0, -0.75, z).oneMinus().toVar();
          const w0y = smoothstep(-4.0, -1.5, z).mul(smoothstep(-1.0, 0.75, z).oneMinus()).toVar();
          const w0z = smoothstep(-2.5, -0.5, z).mul(smoothstep(0.5, 2.5, z).oneMinus()).toVar();
          const w0w = smoothstep(0.0, 1.5, z).mul(smoothstep(3.0, 5.0, z).oneMinus()).toVar();
          const wWhite = smoothstep(2.5, 5.0, z).toVar();
          // per-zone exposure gain (blacks x3, shadows x2 in js/render/shaders/post.js)
          const stops = w0x.mul(C.tone0.x.mul(3.0)).add(w0y.mul(C.tone0.y.mul(2.0)))
            .add(w0z.mul(C.tone0.z)).add(w0w.mul(C.tone0.w))
            .add(wWhite.mul(C.tone1.x));
          c.mulAssign(exp2(clamp(stops, -4.0, 4.0)));
          // additive low-end lift for BLACKS/SHADOWS js/render/shaders/post.js
          c.addAssign(w0x.mul(C.tone0.x).mul(0.05).add(w0y.mul(C.tone0.y).mul(0.025)));
          c.assign(max(c, vec3(0.0)));
          // toe/shoulder: monotonic power pivoted at middle grey (applyToeShoulder)
          const oldY = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-6).toVar();
          const exponent = select(oldY.lessThan(0.18),
            exp2(clamp(C.tone1.y, -1.0, 1.0)),
            exp2(clamp(C.tone1.z.negate(), -1.0, 1.0)));
          const newY = pow(oldY.div(0.18), exponent).mul(0.18);
          c.assign(max(c.mul(newY.div(max(oldY, 1e-6))), vec3(0.0)));
        });

        // Filmic tone-map (parameterised Narkowicz ACES) + WHITE POINT knee.
        c.assign(acesTonemap(c.div(C.whitePoint)));

        c.mulAssign(vec3(1.015, 1.008, 0.992));
        c.assign(c.mul(c.mul(0.13).add(1.0)).div(c.mul(0.20).add(1.0)));
        c.assign(pow(max(c, vec3(0.0)), vec3(C.contrast)));
        const luma = dot(c, vec3(0.299, 0.587, 0.114)).toVar();
        const mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
        const sat = mx.sub(mn);
        c.assign(mix(vec3(luma), c,
          clamp(sat.mul(1.5), 0.0, 1.0).oneMinus().mul(C.vibrance).add(1.0)));
        c.assign(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, C.saturation));
        c.mulAssign(vec3(C.tint.mul(0.07).add(1.0), 1.0, C.tint.mul(-0.07).add(1.0)));
        const gl2 = dot(c, vec3(0.299, 0.587, 0.114));
        const toneTint = mix(C.gradeShadow, C.gradeHi, smoothstep(0.0, 0.85, gl2));
        c.assign(mix(c, c.mul(toneTint), C.gradeStr));
        c.assign(max(c, vec3(C.blackLift, C.blackLift.mul(0.8), C.blackLift.mul(0.6))));

        const sunVis = float(0.0).toVar();
        If(C.flareStr.greaterThan(0.0)
          .and(C.sunUV.x.greaterThanEqual(0.0)).and(C.sunUV.x.lessThanEqual(1.0))
          .and(C.sunUV.y.greaterThanEqual(0.0)).and(C.sunUV.y.lessThanEqual(1.0)), () => {
          sunVis.assign(smoothstep(0.9990, 0.9999, depthAt(C.sunUV)));
        });
        const flare = vec3(0.0).toVar();
        If(C.flareStr.greaterThan(0.0).and(sunVis.greaterThan(0.0))
          .and(C.sunUV.x.greaterThanEqual(0.0)).and(C.sunUV.x.lessThanEqual(1.0))
          .and(C.sunUV.y.greaterThanEqual(0.0)).and(C.sunUV.y.lessThanEqual(1.0)), () => {
          const streakY = exp(abs(vUV.y.sub(C.sunUV.y)).mul(-110.0));
          const streakX = exp(abs(vUV.x.sub(C.sunUV.x)).mul(C.flareStreak).negate());
          flare.addAssign(vec3(1.0, 0.80, 0.52).mul(streakY.mul(streakX).mul(0.75)));
          const streakX2 = exp(abs(vUV.x.sub(C.sunUV.x)).mul(-10.0));
          flare.addAssign(vec3(1.0, 0.92, 0.78)
            .mul(exp(abs(vUV.y.sub(C.sunUV.y)).mul(-320.0))).mul(streakX2).mul(C.flareStreak2));
          const toCenter = vec2(0.5).sub(C.sunUV).toVar();
          const d0 = length(vUV.sub(C.sunUV.add(toCenter.mul(0.5))));
          flare.addAssign(vec3(1.0, 0.88, 0.65).mul(smoothstep(0.055, 0.020, d0)).mul(0.35));
          const d1 = length(vUV.sub(C.sunUV.add(toCenter.mul(1.3))));
          flare.addAssign(vec3(0.70, 0.60, 1.00).mul(smoothstep(0.038, 0.012, d1)).mul(0.25));
          const d2 = length(vUV.sub(C.sunUV.add(toCenter.mul(1.8))));
          flare.addAssign(vec3(0.50, 1.00, 0.70).mul(smoothstep(0.028, 0.008, d2)).mul(0.18));
          flare.mulAssign(C.flareStr.mul(sunVis));
          If(C.lensDirt.greaterThan(0.001), () => {   // dirt breaks the flare up
            flare.mulAssign(mix(float(1.0), dirt.mul(2.2).add(0.35),
              clamp(C.lensDirt.mul(2.0), 0.0, 0.85)));
          });
          flare.assign(flare.div(flare.mul(0.6).add(1.0)));   // soft-clip
        });
        c.addAssign(flare);

        // Vignette — aspect-corrected circular falloff js/render/shaders/post.js.
        const q = vec2(vUV.sub(0.5)).toVar();
        const vAspect = select(C.reflTexel.x.greaterThan(0.0),
          C.reflTexel.y.div(C.reflTexel.x), float(1.0)).toVar();
        q.x.mulAssign(vAspect);
        const vr = length(q).mul(0.70710678)
          .div(length(vec2(vAspect.mul(0.5), 0.5)));
        // Outer edge is the CORNER (vr is corner-normalised, so exactly
        // 0.70710678 at every aspect), not 0.95. The old form ran edge0 > edge1
        // and could never finish its ramp, so VIGNETTE could not reach black and
        // REACH swung corner darkening 28x. Mirrors js/render/shaders/post.js.
        const vig = smoothstep(min(C.vigSoft, 0.69), 0.70710678, vr).oneMinus();
        c.mulAssign(mix(C.vignette, float(1.0), vig));

        // Triangular-PDF LDR dither, golden-ratio time-stepped js/render/shaders/post.js.
        const dc = fragXY.add(mod(floor(C.grainTime.mul(60.0)), 64.0).mul(5.588238)).toVar();
        const d0n = ignoise(dc);
        const d1n = fract(fract(dot(dc.add(17.31), vec2(0.00583715, 0.06711056))).mul(52.9829189));
        c.addAssign(vec3(d0n.add(d1n).sub(1.0).div(255.0)));
        // FILM GRAIN: luminance-weighted animated noise js/render/shaders/post.js.
        If(C.grain.greaterThan(0.001), () => {
          const gUV = vUV.add(vec2(fract(C.grainTime.mul(1.37)), fract(C.grainTime.mul(0.61))).mul(3.17));
          const gn = fract(sin(dot(gUV, vec2(93.9898, 47.233))).mul(61237.312)).sub(0.5);
          const gLuma = dot(c, vec3(0.299, 0.587, 0.114));
          c.addAssign(vec3(gn.mul(C.grain).mul(abs(gLuma.sub(0.5)).mul(1.4).oneMinus())));
        });
        return vec4(c, 1.0);
      })(), "tlx-post-comp"),
    };

    /* ── FXAA (FXAA_FS in js/render/shaders/post.js): Lottes compact, LDR resolve.
     *    The flat-area early-out (lMax-lMin < max(0.04, lMax*0.125)) keeps
     *    flat regions pixel-exact — constants verbatim. ─────────────────────── */
    const fxaaTex = texture(ctx.blackTex);
    const fxaaU = { texel: uniform(new THREE.Vector2()) };
    const fxLuma = (cc) => dot(cc, vec3(0.299, 0.587, 0.114));
    const fxaa = {
      tex: fxaaTex, U: fxaaU,
      mat: passMaterial(Fn(() => {
        const suv = vec2(screenUV).toVar();
        const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
        const t = vec2(fxaaU.texel).toVar();
        const cM = vec3(fxaaTex.sample(TL(vUV)).rgb).toVar();
        const res = vec3(cM).toVar();
        const lM = fxLuma(cM).toVar();
        const lNW = fxLuma(fxaaTex.sample(TL(vUV.add(vec2(t.x.negate(), t.y.negate())))).rgb).toVar();
        const lNE = fxLuma(fxaaTex.sample(TL(vUV.add(vec2(t.x, t.y.negate())))).rgb).toVar();
        const lSW = fxLuma(fxaaTex.sample(TL(vUV.add(vec2(t.x.negate(), t.y)))).rgb).toVar();
        const lSE = fxLuma(fxaaTex.sample(TL(vUV.add(t))).rgb).toVar();
        const lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))).toVar();
        const lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE))).toVar();
        // Flat areas stay pixel-exact (the early-out).
        If(lMax.sub(lMin).greaterThanEqual(max(float(0.04), lMax.mul(0.125))), () => {
          const dir = vec2(
            lNW.add(lNE).sub(lSW.add(lSE)).negate(),
            lNW.add(lSW).sub(lNE.add(lSE))).toVar();
          const dirReduce = max(lNW.add(lNE).add(lSW).add(lSE).mul(0.03125), 0.0078125);
          const rcp = float(1.0).div(min(abs(dir.x), abs(dir.y)).add(dirReduce));
          dir.assign(clamp(dir.mul(rcp), vec2(-8.0), vec2(8.0)).mul(t));
          const rA = fxaaTex.sample(TL(vUV.add(dir.mul(-1.0 / 6.0)))).rgb
            .add(fxaaTex.sample(TL(vUV.add(dir.mul(1.0 / 6.0)))).rgb).mul(0.5).toVar();
          const rB = rA.mul(0.5)
            .add(fxaaTex.sample(TL(vUV.add(dir.mul(-0.5)))).rgb
              .add(fxaaTex.sample(TL(vUV.add(dir.mul(0.5)))).rgb).mul(0.25)).toVar();
          const lB = fxLuma(rB);
          res.assign(select(lB.lessThan(lMin).or(lB.greaterThan(lMax)), rA, rB));
        });
        return vec4(res, 1.0);
      })(), "tlx-post-fxaa"),
    };

    /* ── BLIT (debug ?viz= bisect): paint any chain texture to the canvas.
     *    mono=1 spreads .r to rgb (SSAO); gain rescales HDR sources. ───────── */
    const blitTex = texture(ctx.blackTex);
    const blitU = { mono: uniform(0), gain: uniform(1) };
    const blit = {
      tex: blitTex, U: blitU,
      mat: passMaterial(Fn(() => {
        const suv = vec2(screenUV).toVar();
        const vUV = vec2(suv.x, suv.y.oneMinus()).toVar();
        const s = vec4(blitTex.sample(TL(vUV))).toVar();
        const c = select(blitU.mono.greaterThan(0.5), vec3(s.r), s.rgb).mul(blitU.gain);
        return vec4(clamp(c, vec3(0.0), vec3(1.0)), 1.0);
      })(), "tlx-post-blit"),
    };

    return { bright, blurAO, blurGR, down, upAdd, upFinal, spread, ssao, godray,
             composite, fxaa, blit };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { post });
})();
