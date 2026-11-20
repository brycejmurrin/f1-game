"use strict";

(function () {
  function sky(THREE, TSL, ctx) {
    const {
      Fn, If, uniform, texture, positionGeometry,
      float, vec2, vec3, vec4,
      screenUV, screenCoordinate,
      fract, floor, dot, mix, smoothstep, clamp, pow, exp,
      abs, max, min, normalize, length, sin, atan, step,
    } = TSL;
    const smoothstepDown = (hi, lo, x) => smoothstep(lo, hi, x).oneMinus();
    const imageUV = (ctx && ctx.vp && ctx.sceneView) ? ctx.vp.uv(ctx.sceneView) : screenUV;

    const hash3 = Fn(([pIn]) => {
      const p = fract(vec3(pIn).mul(0.3183099).add(vec3(0.1, 0.2, 0.3))).mul(17.0).toVar();
      return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
    }).setLayout({ name: "apexSkyHash3", type: "float", inputs: [{ name: "pIn", type: "vec3" }] });
    const hash2 = Fn(([pIn]) => {
      const p = fract(vec2(pIn).mul(vec2(127.1, 311.7))).toVar();
      p.addAssign(dot(p, p.add(34.5)));
      return fract(p.x.mul(p.y));
    }).setLayout({ name: "apexSkyHash2", type: "float", inputs: [{ name: "pIn", type: "vec2" }] });
    const vnoise = Fn(([pIn]) => {
      const i = floor(pIn);
      const f = fract(pIn).toVar();
      f.assign(f.mul(f).mul(f.mul(-2.0).add(3.0)));
      const a = hash2(i), b = hash2(i.add(vec2(1, 0)));
      const c = hash2(i.add(vec2(0, 1))), d = hash2(i.add(vec2(1, 1)));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }).setLayout({ name: "apexSkyVnoise", type: "float", inputs: [{ name: "pIn", type: "vec2" }] });
    const fbm = Fn(([pIn]) => {
      const p = vec2(pIn).toVar();
      const s = vnoise(p).mul(0.5).toVar();
      p.mulAssign(2.02); s.addAssign(vnoise(p).mul(0.25));
      p.mulAssign(2.02); s.addAssign(vnoise(p).mul(0.125));
      p.mulAssign(2.02); s.addAssign(vnoise(p).mul(0.0625));
      return s;
    }).setLayout({ name: "apexSkyFbm", type: "float", inputs: [{ name: "pIn", type: "vec2" }] });
    const ignoise = (ctx && ctx.chunks && ctx.chunks.ignoise) || Fn(([p]) => {
      return fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));
    });

    const U = {
      invViewProj:   uniform(new THREE.Matrix4()),
      zenith:        uniform(new THREE.Vector3(0.18, 0.40, 0.78)),
      horizon:       uniform(new THREE.Vector3(0.62, 0.74, 0.88)),
      sunDir:        uniform(new THREE.Vector3(0.4, 0.8, 0.4)),
      sunColor:      uniform(new THREE.Vector3(1.0, 0.98, 0.9)),
      stars:         uniform(0.0),
      cloud:         uniform(0.0),
      time:          uniform(0.0),
      moon:          uniform(0.0),
      cityGlow:      uniform(new THREE.Vector3()),
      starBright:    uniform(1.0),
      cloudSpeed:    uniform(1.0),
      skyGrad:       uniform(0.35),
      starDensity:   uniform(1.0),
      daySkyBlue:    uniform(1.0),
      mieScatter:    uniform(1.0),
      cloudSilver:   uniform(1.0),
      coronaAureole: uniform(1.0),
      sunDiscSize:   uniform(1.0),
      starSize:      uniform(1.0),
      starTwinkle:   uniform(1.0),
      moonDiscSize:  uniform(1.0),
      moonHalo:      uniform(1.0),
      sunCorona:     uniform(1.0),
      sunSquash:     uniform(1.0),
      cityGlowReach: uniform(1.0),
      cloudDef:      uniform(1.0),
      lightning:     uniform(0.0),
    };

    const v3 = () => uniform(new THREE.Vector3());
    const v2 = () => uniform(new THREE.Vector2());
    const D = {
      sunE: uniform(0.0), daytime: uniform(0.0), twilight: uniform(0.0),
      nightSky: uniform(0.0), overcast: uniform(0.0),
      zenithO: v3(), horizonO: v3(), dayClear: uniform(0.0),
      goldenK: uniform(0.0), goldenColor: v3(), lowK: uniform(0.0), lowColor: v3(),
      drift1: v2(), drift2: v2(), bankDrift: v2(), thickOff: v2(),
      covLo: uniform(0.0), cloudRich: uniform(0.0), defMix: uniform(0.0),
      bankThresh: uniform(0.0), bankK: uniform(0.0),
      topK: uniform(0.0), topTint: v3(), topWarm: uniform(0.0), cloudBot: v3(),
      silverK: uniform(0.0), silverCol: v3(), washCol: v3(),
      mieK: uniform(0.0),
      sunHLen: uniform(0.0), sunHn: v2(), hGlowCol: v3(),
      coronaDamp: uniform(0.0), sunWarm: v3(), aurExp: uniform(0.0),
      aurCol: v3(), squash: uniform(0.0), discOut: uniform(0.0), discIn: uniform(0.0),
      discCore: v3(), starThresh: uniform(0.0), dthOff: uniform(0.0),
      cacheOn: uniform(0.0), cD1: v2(), cD3: v2(), cDb: v2(),
    };
    const C = ctx && ctx.cache ? makeCache() : null;
    const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const set3 = (u, x, y, z) => u.value.set(x, y, z);
    const lid = (a, b) => (a + b) * 1.25;
    const s3 = (u, a) => { if (a) u.value.set(a[0], a[1], a[2]); };
    const s1 = (u, v, def) => { u.value = v !== undefined ? v : def; };
    const NO_GLOW = Object.freeze([0, 0, 0]);
    function derive() {
      const sd = U.sunDir.value, sc = U.sunColor.value, ze = U.zenith.value, ho = U.horizon.value;
      const cloud = U.cloud.value;
      const sunE = clamp01(sd.y * 1.4);
      const night = U.stars.value >= 0.5 ? 1 : 0;
      const day0 = sstep(0.35, 0.60, sunE);
      const daytime = day0 * (1 - night);
      const twilight = sstep(0.02, 0.22, sunE) * (1 - day0) * (1 - night);
      const overcast = sstep(0.5, 1.0, cloud);
      D.sunE.value = sunE; D.daytime.value = daytime; D.twilight.value = twilight;
      D.nightSky.value = night; D.overcast.value = overcast;
      const kz = overcast * 0.75, kh = overcast * 0.60;
      const greyLight = 0.35 + 0.65 * daytime;
      const lx = lid(ze.x, ho.x), ly = lid(ze.y, ho.y), lz = lid(ze.z, ho.z);
      set3(D.zenithO,
        lerp(ze.x, lerp(0.55 * greyLight, lx, night), kz),
        lerp(ze.y, lerp(0.56 * greyLight, ly, night), kz),
        lerp(ze.z, lerp(0.58 * greyLight, lz, night), kz));
      set3(D.horizonO,
        lerp(ho.x, lerp(0.58 * greyLight, lx, night), kh),
        lerp(ho.y, lerp(0.58 * greyLight, ly, night), kh),
        lerp(ho.z, lerp(0.60 * greyLight, lz, night), kh));
      D.dayClear.value = daytime * (1 - overcast);
      D.goldenK.value = (1 - sstep(0.0, 0.72, sunE)) * (1 - overcast * 0.9);
      const gc = clamp01(sunE * 2.5);
      set3(D.goldenColor, lerp(0.70, 0.92, gc), lerp(0.22, 0.55, gc), lerp(0.04, 0.16, gc));
      D.lowK.value = (1 - sstep(0.0, 0.60, sunE)) * (1 - overcast * 0.85);
      const lc = clamp01(sunE * 3.0);
      set3(D.lowColor, lerp(0.90, 1.0, lc), lerp(0.26, 0.66, lc), lerp(0.03, 0.12, lc));
      const cT = U.time.value * U.cloudSpeed.value;
      D.drift1.value.set(cT * 0.0028, cT * 0.0011);
      D.drift2.value.set(cT * 0.0017, cT * 0.0023);
      D.bankDrift.value.set(cT * 0.0028 * 1.4, cT * 0.0011 * 1.4);
      D.thickOff.value.set(cT * 0.00035 + 3.1, 1.7);
      D.covLo.value = 0.50 - cloud * 0.42;
      const rich = Math.max(daytime, twilight);
      D.cloudRich.value = rich;
      D.defMix.value = clamp01(rich * 0.85 * U.cloudDef.value);
      D.bankThresh.value = 0.46 - cloud * 0.30 - twilight * 0.10;
      D.bankK.value = rich * (1 - overcast * 0.5);
      const sunBright = Math.max(sc.x, Math.max(sc.y, sc.z));
      const eff = lerp(sunBright, Math.min(sunBright, 0.55), overcast);
      const golden = 1 - sstep(0.0, 0.45, sunE);
      D.topK.value = eff * 0.62 + 0.38;
      const tk = lerp(1.45, 2.6, golden);
      set3(D.topTint, sc.x * tk, sc.y * tk, sc.z * tk);
      D.topWarm.value = (1 - sunE) * (golden * 0.40 + 0.55) * (1 - overcast);
      const bk = eff * 0.44 + 0.24, bw = golden * 0.22 * (1 - overcast) * (twilight * 1.3 + 1.0), bo = overcast * 0.60;
      set3(D.cloudBot,
        lerp(0.26 * bk + sc.x * 0.9 * bw, 0.19, bo),
        lerp(0.27 * bk + sc.y * 0.42 * bw, 0.19, bo),
        lerp(0.34 * bk + sc.z * 0.5 * bw, 0.22, bo));
      D.silverK.value = (golden + 0.55) * (1 - overcast * 0.7);
      const sk = (twilight * 1.6 + 1.3) * U.cloudSilver.value;
      set3(D.silverCol, sc.x * sk, sc.y * sk, sc.z * sk);
      const wk = twilight * 0.30 * (1 - overcast * 0.6);
      set3(D.washCol, sc.x * wk, sc.y * wk, sc.z * wk);
      const mieDamp = (1 - overcast * 0.85) * (1 - night);
      D.mieK.value = 0.22 * mieDamp * U.mieScatter.value;
      const hLen = Math.hypot(sd.x, sd.z);
      D.sunHLen.value = hLen;
      if (hLen > 0.05) D.sunHn.value.set(sd.x / hLen, sd.z / hLen); else D.sunHn.value.set(0, 0);
      const hk = 0.22 * hLen * mieDamp;
      set3(D.hGlowCol, sc.x * hk, sc.y * hk, sc.z * hk);
      const cd = (1 - overcast * 0.92) * (1 - night);
      D.coronaDamp.value = cd;
      const sw0 = lerp(sc.x, sc.x * 1.18, golden), sw1 = lerp(sc.y, sc.y * 0.52, golden), sw2 = lerp(sc.z, sc.z * 0.24, golden);
      set3(D.sunWarm, sw0, sw1, sw2);
      D.aurExp.value = lerp(20.0, 8.0, golden);
      const ak = (golden * 0.55 + 0.55) * cd * U.coronaAureole.value;
      set3(D.aurCol, sw0 * ak, sw1 * ak, sw2 * ak);
      D.squash.value = lerp(1.0, lerp(1.0, 1.6, golden), U.sunSquash.value);
      D.discOut.value = lerp(0.018, 0.028, golden) * U.sunDiscSize.value;
      D.discIn.value = U.sunDiscSize.value * 0.006;
      set3(D.discCore, lerp(2.3, sw0 * 2.8, golden), lerp(2.2, sw1 * 2.8, golden), lerp(1.9, sw2 * 2.8, golden));
      D.starThresh.value = Math.min(0.9994, 1.0 - U.starDensity.value * (1.0 - 0.9968));
      const step60 = Math.floor(Math.fround(Math.fround(U.time.value) * 60.0));
      D.dthOff.value = (step60 - 64 * Math.floor(step60 / 64)) * 5.588238;
      if (C) cacheSync();
    }

    function makeCache() {
      const S = (ctx.cacheSize | 0) > 0 ? ctx.cacheSize | 0 : 768, U0 = 0.06, MARGIN = 0.5, N_BANDS = 16;
      const AB = 0.16 / 0.42;
      const R = 0.42 * Math.sqrt(1 - U0 * U0) / U0;
      const W = (R + MARGIN) * (1 + 4 / S);
      const mkRT = () => {
        const rt = new THREE.RenderTarget(S, S, {
          type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
          generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
        });
        rt.texture.colorSpace = THREE.NoColorSpace;
        rt.texture.name = "tlx-sky-cache";
        return rt;
      };
      const F = { o1: v2(), o2: v2(), oT: v2(), ob: v2(), y0: uniform(-1.0), y1: uniform(1.0) };
      const fill = Fn(() => {
        const cpt = vec2(screenUV).mul(2.0).sub(1.0).mul(W).toVar();
        const q1 = cpt.add(F.o1).toVar();
        return vec4(fbm(q1), fbm(q1.mul(2.3).add(vec2(11.7, 4.3))),
          fbm(cpt.add(F.o2).mul(0.55).add(F.oT)), fbm(cpt.mul(AB).add(F.ob)));
      })();
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.fragmentNode = fill;
      mat.vertexNode = vec4(positionGeometry.x, mix(F.y0, F.y1, positionGeometry.y), 0.0, 1.0);
      mat.depthTest = false; mat.depthWrite = false; mat.side = THREE.DoubleSide;
      mat.lights = false; mat.fog = false; mat.toneMapped = false; mat.transparent = false;
      mat.blending = THREE.NoBlending;
      mat.customProgramCacheKey = () => "tlx-sky-cache";
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
      const scene = new THREE.Scene();
      scene.add(mesh);
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const rts = [mkRT(), mkRT()];
      return { S, U0, MARGIN, N_BANDS, AB, W, F, mat, geo, scene, cam, rts, tex: texture(rts[0].texture),
        front: 0, valid: false, filling: false, band: 0, dead: false,
        fo1: [0, 0], fo2: [0, 0], foT: [0, 0], fob: [0, 0], fills: 0, bands: 0, maxOff: Infinity };
    }
    function cacheSync() {
      const d1 = D.drift1.value, d2 = D.drift2.value, to = D.thickOff.value, bd = D.bankDrift.value;
      const ax = d1.x - C.fo1[0], ay = d1.y - C.fo1[1];
      const tx = (d2.x - C.fo2[0]) + (to.x - C.foT[0]) / 0.55, ty = (d2.y - C.fo2[1]) + (to.y - C.foT[1]) / 0.55;
      const bx = (bd.x - C.fob[0]) / C.AB, by = (bd.y - C.fob[1]) / C.AB;
      D.cD1.value.set(ax, ay); D.cD3.value.set(tx, ty); D.cDb.value.set(bx, by);
      C.maxOff = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(tx), Math.abs(ty), Math.abs(bx), Math.abs(by));
      D.cacheOn.value = C.valid && !C.dead && C.maxOff <= C.MARGIN ? 1 : 0;
    }
    let cacheWarmPending = 0, cacheRetireOwed = false, cacheRetired = false;
    function retireCache() {
      if (!C || cacheRetired) return;
      C.dead = true; C.filling = false; D.cacheOn.value = 0;
      if (cacheWarmPending) { cacheRetireOwed = true; return; }
      cacheRetired = true; cacheRetireOwed = false;
      for (const resource of [...C.rts, C.geo, C.mat]) {
        try { resource.dispose(); } catch (_) {  }
      }
    }
    function cacheStep(renderer) {
      if (!C || C.dead || !renderer || !(U.cloud.value > 0.001)) return;
      if (!C.filling) {
        if (C.valid && C.maxOff <= C.MARGIN * 0.5) return;
        C.F.o1.value.copy(D.drift1.value); C.F.o2.value.copy(D.drift2.value);
        C.F.oT.value.copy(D.thickOff.value); C.F.ob.value.copy(D.bankDrift.value);
        C.filling = true; C.band = 0;
      }
      const k = C.band, N = C.N_BANDS;
      C.F.y0.value = -1 + 2 * k / N; C.F.y1.value = -1 + 2 * (k + 1) / N;
      const t = renderer.getRenderTarget(), mrt = renderer.getMRT ? renderer.getMRT() : null, ac = renderer.autoClear;
      try {
        if (mrt) renderer.setMRT(null);
        renderer.autoClear = false;
        renderer.setRenderTarget(C.rts[1 - C.front]);
        renderer.render(C.scene, C.cam);
      } catch (e) {
        C.dead = true; C.filling = false; D.cacheOn.value = 0;
        throw e;
      } finally {
        try {
          renderer.autoClear = ac;
          renderer.setRenderTarget(t);
          if (mrt) renderer.setMRT(mrt);
        } finally { if (C.dead) retireCache(); }
      }
      C.bands++;
      if (++C.band < N) return;
      C.front = 1 - C.front; C.filling = false; C.valid = true; C.fills++;
      C.tex.value = C.rts[C.front].texture;
      const F = C.F;
      C.fo1[0] = F.o1.value.x; C.fo1[1] = F.o1.value.y; C.fo2[0] = F.o2.value.x; C.fo2[1] = F.o2.value.y;
      C.foT[0] = F.oT.value.x; C.foT[1] = F.oT.value.y; C.fob[0] = F.ob.value.x; C.fob[1] = F.ob.value.y;
      cacheSync();
    }
    function cacheDrawWarm(renderer) {
      if (!C || C.dead || !renderer) return 0;
      const t = renderer.getRenderTarget(), mrt = renderer.getMRT ? renderer.getMRT() : null, ac = renderer.autoClear;
      const y0 = C.F.y0.value, y1 = C.F.y1.value;
      try {
        if (mrt) renderer.setMRT(null);
        renderer.autoClear = false;
        C.F.y0.value = -1; C.F.y1.value = -1;
        renderer.setRenderTarget(C.rts[1 - C.front]);
        renderer.render(C.scene, C.cam);
        return 1;
      } catch (_) {
        return 0;
      } finally {
        C.F.y0.value = y0; C.F.y1.value = y1;
        renderer.autoClear = ac;
        renderer.setRenderTarget(t);
        if (mrt) renderer.setMRT(mrt);
      }
    }
    async function cacheWarm(renderer) {
      if (!C || C.dead || !renderer || !renderer.compileAsync || cacheWarmPending) return;
      const target = C.rts[1 - C.front];
      const previousTarget = renderer.getRenderTarget();
      const previousMRT = renderer.getMRT ? renderer.getMRT() : null;
      cacheWarmPending++;
      try {
        if (renderer.setMRT) renderer.setMRT(null);
        renderer.setRenderTarget(target);
        await renderer.compileAsync(C.scene, C.cam);
      } finally {
        try {
          if (renderer.getRenderTarget() === target) {
            renderer.setRenderTarget(previousTarget);
            if (renderer.setMRT) renderer.setMRT(previousMRT);
          }
        } finally {
          cacheWarmPending--;
          if (cacheRetireOwed) retireCache();
        }
      }
    }
    function cacheState() {
      return C ? { size: C.S, u0: C.U0, on: D.cacheOn.value, valid: C.valid, filling: C.filling, band: C.band,
        fills: C.fills, bands: C.bands, maxOff: +C.maxOff.toFixed(4), dead: C.dead } : null;
    }
    function dispose() { retireCache(); }
    derive();

    function update(sky) {
      if (!sky) return;
      if (sky.invViewProj) U.invViewProj.value.fromArray(sky.invViewProj);
      s3(U.zenith, sky.zenith);
      s3(U.horizon, sky.horizon);
      s3(U.sunDir, sky.sunDir);
      s3(U.sunColor, sky.sunColor);
      U.stars.value = sky.stars ? 1 : 0;
      s1(U.cloud, sky.cloud, 0);
      s1(U.time, sky.time, 0);
      s1(U.moon, sky.moon, 0);
      s3(U.cityGlow, sky.cityGlow || NO_GLOW);
      s1(U.starBright, sky.starBright, 1);
      s1(U.cloudSpeed, sky.cloudSpeed, 1);
      s1(U.skyGrad, sky.skyGrad, 0.35);
      s1(U.starDensity, sky.starDensity, 1);
      s1(U.daySkyBlue, sky.daySkyBlue, 1);
      s1(U.mieScatter, sky.mieScatter, 1);
      s1(U.cloudSilver, sky.cloudSilver, 1);
      s1(U.coronaAureole, sky.coronaAureole, 1);
      s1(U.sunDiscSize, sky.sunDiscSize, 1);
      s1(U.starSize, sky.starSize, 1);
      s1(U.starTwinkle, sky.starTwinkle, 1);
      s1(U.moonDiscSize, sky.moonDiscSize, 1);
      s1(U.moonHalo, sky.moonHalo, 1);
      s1(U.sunCorona, sky.sunCorona, 1);
      s1(U.sunSquash, sky.sunSquash, 1);
      s1(U.cityGlowReach, sky.cityGlowReach, 1);
      s1(U.cloudDef, sky.cloudDef, 1);
      s1(U.lightning, sky.lightning, 0);
      derive();
    }

    const node = Fn(() => {
      const suv = vec2(imageUV).toVar();
      const p = vec2(suv.x.mul(2.0).sub(1.0), float(1.0).sub(suv.y).mul(2.0).sub(1.0)).toVar();
      const a4 = U.invViewProj.mul(vec4(p, -1.0, 1.0)).toVar();
      const b4 = U.invViewProj.mul(vec4(p, 1.0, 1.0)).toVar();
      const dir = normalize(b4.xyz.div(b4.w).sub(a4.xyz.div(a4.w))).toVar();

      const up = dir.y.toVar();
      const sd = max(dot(dir, U.sunDir), 0.0).toVar();

      const sunE = D.sunE;
      const daytime = D.daytime, twilight = D.twilight, nightSky = D.nightSky;
      const overcast = D.overcast;

      const c = vec3(0.0).toVar();
      If(up.greaterThanEqual(0.0), () => {
        const zenithO = D.zenithO, horizonO = D.horizonO;
        c.assign(mix(horizonO, zenithO, pow(up, U.skyGrad)));
        If(daytime.greaterThan(0.0), () => {
          const bandLM = smoothstep(0.06, 0.55, up).oneMinus().mul(smoothstep(0.0, 0.06, up));
          const deepBlue = vec3(0.10, 0.30, 0.72);
          c.assign(mix(c, mix(c, deepBlue, 0.30),
            clamp(D.dayClear.mul(bandLM).mul(U.daySkyBlue), 0.0, 1.0)));
          const az = vnoise(vec2(atan(dir.z, dir.x).mul(2.2), up.mul(6.0))).sub(0.5);
          c.mulAssign(az.mul(0.05).mul(D.dayClear)
            .mul(smoothstep(0.0, 0.5, up).oneMinus()).add(1.0));
        });
        If(D.nightSky.lessThan(0.5).and(sunE.lessThan(0.72)), () => {
        const goldenAmt = D.goldenK.mul(smoothstep(0.0, 0.32, up).oneMinus());
        const goldenColor = D.goldenColor;
        c.assign(mix(c, c.mul(0.45).add(goldenColor.mul(0.55)), goldenAmt.mul(0.80)));
        const lowBand = D.lowK.mul(smoothstep(0.0, 0.18, up).oneMinus())
          .mul(smoothstep(0.01, 0.06, up));
        const lowColor = D.lowColor;
        c.assign(mix(c, lowColor, lowBand.mul(0.70)));
        });
      }).Else(() => {
        const gnd = clamp(up.negate().mul(5.0), 0.0, 1.0);
        c.assign(mix(U.horizon.mul(0.85), vec3(0.035, 0.030, 0.022), gnd.mul(gnd)));
      });

      const cityCov = float(0.0).toVar();
      const cityThick = float(0.0).toVar();
      If(U.cloud.greaterThan(0.001).and(up.greaterThan(0.012)), () => {
        const cp = dir.xz.div(up).mul(0.42);
        const cp1 = cp.add(D.drift1).toVar();
        const cp2 = cp.add(D.drift2);
        const cpv = C ? cp.toVar() : null;
        const useC = C ? D.cacheOn.greaterThan(0.5).and(up.greaterThanEqual(C.U0)).toVar() : null;
        const tap = C ? (off) => C.tex.sample(cpv.add(off).mul(0.5 / C.W).add(0.5)).level(float(0.0)) : null;
        const f = C ? float(0.0).toVar() : fbm(cp1).toVar();
        const billowN = C ? float(0.0).toVar() : null;
        const thickN = C ? float(0.0).toVar() : null;
        if (C) {
          If(useC, () => {
            const t1 = tap(D.cD1).toVar();
            f.assign(t1.x);
            billowN.assign(t1.y);
            thickN.assign(tap(D.cD3).z);
          }).Else(() => {
            f.assign(fbm(cp1));
            thickN.assign(fbm(cp2.mul(0.55).add(D.thickOff)));
          });
        }
        const cov = smoothstep(D.covLo, 0.84, f)
          .mul(smoothstep(0.013, 0.05, up)).toVar();
        const cloudRich = D.cloudRich;
        If(cloudRich.greaterThan(0.001), () => {
          const bankN = C ? float(0.0).toVar() : null;
          if (C) {
            If(useC, () => {
              If(up.lessThan(0.26), () => { bankN.assign(tap(D.cDb).w); });
            }).Else(() => {
              billowN.assign(fbm(cp1.mul(2.3).add(vec2(11.7, 4.3))));
              bankN.assign(fbm(dir.xz.div(max(up, 0.02)).mul(0.16).add(D.bankDrift)));
            });
          }
          const billow = C ? billowN : fbm(cp1.mul(2.3).add(vec2(11.7, 4.3)));
          const defined = smoothstep(0.42, 0.80, f.mul(0.6).add(billow.mul(0.45)))
            .mul(smoothstep(0.013, 0.05, up));
          cov.assign(mix(cov, max(cov, defined), D.defMix));
          const bp = dir.xz.div(max(up, 0.02)).mul(0.16).add(D.bankDrift);
          const bankThresh = D.bankThresh;
          const bankCov = smoothstep(bankThresh, 0.80, C ? bankN : fbm(bp))
            .mul(smoothstep(0.013, 0.030, up))
            .mul(smoothstep(0.10, 0.26, up).oneMinus());
          cov.assign(max(cov, bankCov.mul(D.bankK)));
          cov.assign(mix(cov, smoothstep(0.18, 0.82, cov), cloudRich.mul(0.5)));
        });
        const thick = clamp((C ? thickN : fbm(cp2.mul(0.55).add(D.thickOff)))
          .mul(2.0).sub(0.55), 0.0, 1.0).toVar();
        const sl = pow(sd, 2.0).toVar();
        const cloudTop = mix(vec3(0.58, 0.62, 0.70), vec3(1.0, 0.97, 0.91), sl).toVar();
        cloudTop.mulAssign(D.topK);
        cloudTop.assign(mix(cloudTop, cloudTop.mul(D.topTint), sl.mul(D.topWarm)));
        cloudTop.assign(mix(cloudTop, vec3(0.62, 0.63, 0.65), overcast.mul(0.65)));
        const cloudBot = D.cloudBot;
        const capf = clamp(thick.oneMinus().mul(0.75).add(0.18), 0.0, 1.0).toVar();
        const lit = mix(cloudBot, cloudTop, capf).toVar();
        lit.assign(mix(lit, mix(cloudBot.mul(0.80), cloudTop.mul(1.14), capf), daytime.mul(0.45)));
        const silver = pow(sd, 6.0).mul(thick.oneMinus()).mul(D.silverK);
        lit.addAssign(D.silverCol.mul(silver));
        If(twilight.greaterThan(0.001), () => {
        lit.addAssign(D.washCol.mul(pow(sd, 2.5)));
        });
        lit.mulAssign(mix(daytime.mul(0.65).add(0.35), float(1.0), D.nightSky));
        If(U.moon.greaterThan(0.0), () => {
          const moonLit = U.moon.mul(cov).mul(thick.mul(0.6).oneMinus()).mul(0.18);
          lit.assign(mix(lit, lit.add(vec3(0.08, 0.10, 0.16)), moonLit));
        });
        If(U.lightning.greaterThan(0.001), () => {
          const ltFlash = vec3(0.82, 0.94, 1.30).mul(thick.mul(1.2).add(1.0));
          lit.assign(mix(lit, ltFlash, clamp(U.lightning.mul(thick.mul(0.60).add(0.40)), 0.0, 1.0)));
        });
        c.assign(mix(c, lit, cov));
        cityCov.assign(cov);
        cityThick.assign(thick);
      });

      If(U.lightning.greaterThan(0.001).and(up.greaterThan(0.0)), () => {
        c.addAssign(vec3(0.10, 0.13, 0.20).mul(U.lightning).mul(cityCov.mul(0.6).oneMinus()));
      });

      const upPos = max(up, 0.0).toVar();
      c.assign(mix(c, U.sunColor, clamp(pow(sd, 5.0)
        .mul(max(upPos.mul(1.5).oneMinus(), 0.0)).mul(D.mieK), 0.0, 1.0)));

      If(D.sunHLen.greaterThan(0.05), () => {
        const dirH = vec2(dir.x, dir.z);
        const dirHLen = length(dirH).toVar();
        const hdot = dirHLen.greaterThan(0.05)
          .select(max(dot(dirH.div(max(dirHLen, 1e-5)), D.sunHn), 0.0), float(0.0));
        const hband = max(abs(up).mul(5.0).oneMinus(), 0.0);
        c.addAssign(D.hGlowCol.mul(pow(hdot, 6.0)).mul(hband).mul(hband));
      });

      If(nightSky.lessThan(0.5), () => {
        const coronaDamp = D.coronaDamp;
        const sunWarm = D.sunWarm;
        c.addAssign(D.aurCol.mul(pow(sd, D.aurExp)).mul(cityCov.mul(0.6).oneMinus()));
        c.addAssign(sunWarm.mul(pow(sd, 300.0)).mul(0.95).mul(U.sunCorona).mul(coronaDamp).mul(cityCov.oneMinus()));
        const dd = dir.sub(U.sunDir.mul(sd)).toVar();
        const perp = length(vec2(length(dd.xz), dd.y.mul(D.squash))).toVar();
        const disc = smoothstepDown(D.discOut, D.discIn, perp).mul(coronaDamp).mul(cityCov.oneMinus()).toVar();
        const discCore = D.discCore;
        c.addAssign(discCore.mul(disc));
      });

      If(U.stars.greaterThan(0.5).and(up.greaterThan(0.05)), () => {
        const SC = 180.0;
        const cell = floor(dir.mul(SC)).toVar();
        const h = hash3(cell).toVar();
        If(h.greaterThan(D.starThresh), () => {
          const jit = vec3(hash3(cell.add(7.1)), hash3(cell.add(13.7)), hash3(cell.add(29.3))).sub(0.5);
          const sdir = normalize(cell.add(0.5).add(jit.mul(0.8)).div(SC));
          const d = length(dir.sub(sdir));
          const bright = hash3(cell.add(43.0)).mul(0.55).add(0.30);
          const phase = hash3(cell.add(31.0)).mul(6.2832);
          const twinkle = U.starTwinkle.mul(0.20).mul(sin(U.time.mul(1.4).add(phase))).add(0.80);
          const giant = step(0.9995, h);
          const srad = mix(float(0.0016), float(0.0028), giant).mul(U.starSize);
          const star = smoothstepDown(srad, srad.mul(0.35), d)
            .mul(min(0.88, bright.mul(twinkle).mul(giant.mul(0.6).add(1.0))));
          c.addAssign(vec3(star).mul(U.starBright).mul(cityCov.oneMinus()));
        });
      });

      If(U.moon.greaterThan(0.0).and(U.stars.greaterThan(0.5)), () => {
        const moonDir = normalize(U.sunDir);
        const md = dot(dir, moonDir).toVar();
        const moonPerp = length(dir.sub(moonDir.mul(max(md, 0.0)))).toVar();
        const moonDisc = smoothstepDown(U.moonDiscSize.mul(0.025), U.moonDiscSize.mul(0.010), moonPerp)
          .mul(U.moon);
        const moonHalo = exp(moonPerp.mul(moonPerp)
          .mul(float(140.0).div(max(U.moonHalo, 0.001))).negate())
          .mul(0.28).mul(U.moonHalo).mul(U.moon);
        const moonCol = vec3(0.82, 0.88, 1.00);
        If(up.greaterThan(0.0).and(md.greaterThan(0.0)), () => {
          c.addAssign(moonCol.mul(moonDisc.mul(1.10).add(moonHalo)).mul(cityCov.oneMinus()));
        });
      });

      If(U.cityGlow.x.add(U.cityGlow.y).add(U.cityGlow.z).greaterThan(0.001), () => {
        const horiz = pow(clamp(max(dir.y, 0.0).mul(2.4).oneMinus(), 0.0, 1.0),
          U.cityGlowReach.mul(3.0));
        c.addAssign(U.cityGlow.mul(horiz));
        const pickup = cityCov.mul(cityThick.mul(0.65).add(0.35))
          .mul(clamp(dir.y.mul(1.6).oneMinus(), 0.0, 1.0));
        c.addAssign(U.cityGlow.mul(pickup).mul(0.45));
      });

      const skyDth = ignoise(screenCoordinate.xy.add(D.dthOff));
      c.addAssign(skyDth.sub(0.5).mul(1.0 / 255.0));

      return vec4(c, 1.0);
    })();

    const fallbackNode = Fn(() => {
      const t = smoothstep(0.08, 0.88, imageUV.y);
      return vec4(mix(U.zenith, U.horizon, t), 1.0);
    })();

    return { node, fallbackNode, uniforms: U, update, cacheStep, cacheWarm, cacheDrawWarm, cacheState, dispose };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { sky });
})();
