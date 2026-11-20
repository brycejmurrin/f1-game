"use strict";

(function () {

  function lit(THREE, TSL, ctx) {
    const MAX_LIGHTS = (ctx && ctx.maxLights > 0) ? (ctx.maxLights | 0) : LightBudget.MAX;
    const {
      Fn, If, Loop, Break, uniform, uniformArray, renderGroup, attribute, varying, texture, cubeTexture,
      textureLoad, ivec2,
      float, int, vec2, vec3, vec4, mrt,
      positionWorld, positionGeometry, positionLocal, normalLocal, normalWorld, normalWorldGeometry,
      cameraPosition, frontFacing,
      fract, floor, mod, dot, cross, mix, smoothstep, step, clamp, pow, exp, sqrt,
      abs, max, min, normalize, length, reflect, select, sin, cos,
      dFdx, dFdy, fwidth,
    } = TSL;
    const smoothstepDown = (hi, lo, x) => smoothstep(lo, hi, x).oneMinus();
    const { hash21, vnoise, vnoiseGrad, ignoise } = ctx.chunks;
    const ROAD_NORMAL_V2 = (() => {
      try { return localStorage.getItem("apex26.tlxRoadNormalV2") !== "0"; } catch (_) { return true; }
    })();
    const SHARED_TEX = !(ctx && ctx.sharedUniforms === false) && (() => {
      try { return localStorage.getItem("apex26.tlxSharedTex") !== "0"; } catch (_) { return true; }
    })();
    const shadowMapNode = (tex) => texGroup(texture(tex).setUpdateMatrix(false));
    function texGroup(n) { return SHARED_TEX && n ? n.setGroup(renderGroup) : n; }

    function pinProgram(m, key) {
      m.lights = false;
      m.fog = false;
      m.vertexColors = false;
      m.premultipliedAlpha = false;
      m.customProgramCacheKey = () => key + (m.mrtNode
        ? (m.userData.tlxKeepSsrTag ? "-mrt-keep" : "-mrt") : "");
    }

    const SHD = (ctx.shadow && ctx.shadow.S) ? ctx.shadow : null;
    const SSR_TAG = !!ctx.ssrTag;
    const ENV_CUBE = ctx.envCube || null;
    const envCubeNode = ENV_CUBE ? texGroup(cubeTexture(ENV_CUBE, vec3(0.0, 1.0, 0.0))) : null;
    const shadowOn = !!(SHD && SHD.S.enabled && SHD.sunTex);
    const carShadowOn = !!(shadowOn && SHD.S.carEnabled && SHD.carTex);
    const lampShadowOn = !!(shadowOn && SHD.S.lampEnabled && SHD.lampTex);
    const PI = 3.14159265359;

    const U = {
      sunDir:      uniform(new THREE.Vector3(0.4, 0.8, 0.4)),
      sunColor:    uniform(new THREE.Vector3(1.0, 0.98, 0.9)),
      ambSky:      uniform(new THREE.Vector3(0.3, 0.32, 0.36)),
      ambGround:   uniform(new THREE.Vector3(0.2, 0.19, 0.18)),
      skyZenith:   uniform(new THREE.Vector3(0.18, 0.40, 0.78)),
      skyHorizon:  uniform(new THREE.Vector3(0.62, 0.74, 0.88)),
      fogColor:    uniform(new THREE.Vector3(0.04, 0.04, 0.06)),
      fogDensity:  uniform(0.0),
      fogHeight:   uniform(0.0),
      groundMist:  uniform(0.0),
      pitLane:     uniform(new THREE.Vector4(0, 0, 1, 1)),
      pitBox:      uniform(new THREE.Vector4(0, 0, 0, 0)),
      lampFog:     uniform(0.0),
      wetness:     uniform(0.0),
      rain:        uniform(0.0),
      specKnee:    uniform(4.0),
      time:        uniform(0.0),
      wind:        uniform(new THREE.Vector3(0.819, 0.574, 1.0)),
      cloudCover:  uniform(0.0),
      cloudSpeed:  uniform(1.0),
      bounceK:        uniform(0.04),
      mistShare:      uniform(1.5),
      lampFogClip:    uniform(0.7),
      glowAmp:        uniform(2.3),
      bloomBoost:     uniform(0.6),
      keyMul:         uniform(1.0),
      fogTint:        uniform(0.0),
      mistHeight:     uniform(0.30),
      shadowTintAmt:  uniform(0.0),
      wetDark:        uniform(1.0),
      puddles:        uniform(1.0),
      cloudShadowDim: uniform(0.80),
      carSunGlint:    uniform(12.0),
      carSparkle:     uniform(1.6),
      fogSunCore:     uniform(0.6),
      lampNearClamp:  uniform(4.0),
      windowSunFlash: uniform(1.0),
      skyRimGlow:     uniform(1.0),
      ambContactDark: uniform(1.0),
      lampWallSpill:  uniform(1.0),
      envStr:         uniform(0.0),
      numLights:      uniform(0),
      lampCap:        uniform(MAX_LIGHTS),
      shadowStr:      uniform(0.0),
      shadowRange:    uniform(80.0),
      shadowBias:     uniform(0.001),
      shadowTexel:    uniform(1 / 2048),
      shadowCtr:      uniform(new THREE.Vector3()),
      pcssPen:        uniform(80.0),
      pcssOn:         uniform(0.0),
      lightVP:        uniform(new THREE.Matrix4()),
      carLightVP:     uniform(new THREE.Matrix4()),
      carShadowOn:    uniform(0.0),
      carBiasScale:   uniform(1.0),
      lampShadowVP:   uniform(new THREE.Matrix4()),
      lampShadowOn:   uniform(0.0),
      lampShadowIdx:  uniform(-1.0),
      lgOrigin:       uniform(new THREE.Vector2(0, 0)),
      lgSize:         uniform(new THREE.Vector2(1, 1)),
      lgCell:         uniform(72.0),
      lgIdxW:         uniform(256.0),
      lgOn:           uniform(0.0),
      bakeOn:         uniform(0.0),
      bakeOrigin:     uniform(new THREE.Vector2(0, 0)),
      bakeSize:       uniform(new THREE.Vector2(1, 1)),
      bakeScale:      uniform(new THREE.Vector3(0, 0, 0)),
      bakeShCol:      uniform(new THREE.Vector3(0, 0, 0)),
      bakeGrid:       uniform(new THREE.Vector3(1, 1, 32)),
      bakeAtlas:      uniform(new THREE.Vector2(1, 2)),
      lgRoad:         uniform(0.0),
    };
    const lampPos = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
    const lampCol = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
    const lampDir = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -1, 0, 0));
    const lampGeo = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(1, 0.8, 0.5, 0));
    U.lampPos = uniformArray(lampPos);
    U.matTexMix = uniform(1.0);
    U.matTexScale = uniformArray(Array(17).fill(0));
    U.lampCol = uniformArray(lampCol);
    U.lampDir = uniformArray(lampDir);
    U.lampGeo = uniformArray(lampGeo);
    const SHARED_UNIFORMS = !(ctx && ctx.sharedUniforms === false);
    if (SHARED_UNIFORMS) for (const k in U) U[k].setGroup(renderGroup);

    function uf1(u, v) {
      if (u.value !== v) u.value = v;
    }
    const _bakeShScr = [0, 0, 0];
    let _tuneT = null;
    const _tk = (id, def) => (_tuneT && _tuneT[id] != null ? _tuneT[id] : def);
    const _s3m = (u, a, m) => { if (a) u.value.set(a[0] * (m ?? 1), a[1] * (m ?? 1), a[2] * (m ?? 1)); };
    function updateFrame(frame, mirror) {
      const T = (frame && frame.tune) || null;
      _tuneT = T;
      const k = _tk, s3 = _s3m;
      s3(U.sunDir, frame.sunDir);
      s3(U.sunColor, frame.sunColor);
      setLampBake(frame.lampBake, frame.lampBakeScale);
      const ambM = k("ambientMul", 1);
      s3(U.ambSky, frame.ambientSky || [0.3, 0.32, 0.36], ambM);
      s3(U.ambGround, frame.ambientGround || [0.2, 0.19, 0.18], ambM);
      s3(U.skyZenith, frame.skyZenith || [0.18, 0.40, 0.78]);
      s3(U.skyHorizon, frame.skyHorizon || [0.62, 0.74, 0.88]);
      s3(U.fogColor, frame.fogColor || [0.04, 0.04, 0.06]);
      U.fogDensity.value = (frame.fogDensity || 0) * k("fogDensityMul", 1);
      uf1(U.fogHeight, T && T.fogHeight != null ? T.fogHeight
        : (frame.fogHeight != null ? frame.fogHeight : 0.0));
      U.groundMist.value = (frame.groundMist != null ? frame.groundMist : 0) * k("mistDensity", 1);
      {
        const pl = frame.pitLane;
        U.pitLane.value.set(pl ? pl[0] : 0, pl ? pl[1] : 0, pl ? pl[2] : 1, pl ? pl[3] : 1);
        const pb = frame.pitBox;
        U.pitBox.value.set(pb ? pb[0] : 0, pb ? pb[1] : 0, 0, 0);
      }
      U.lampFog.value = frame.lampFog != null ? frame.lampFog : 0;
      U.wetness.value = frame.wetness != null ? frame.wetness : 0;
      U.rain.value = frame.rain != null ? frame.rain : 0;
      U.time.value = frame.time != null ? frame.time : 0;
      {
        const wd = k("windDir", 35) * (Math.PI / 180);
        U.wind.value.set(Math.cos(wd), Math.sin(wd), k("windSpeed", 1.0));
      }
      U.cloudCover.value = frame.cloud != null ? frame.cloud : 0;
      U.cloudSpeed.value = frame.cloudSpeed != null ? frame.cloudSpeed : 1;
      uf1(U.bounceK, k("bounceK", 0.04));
      uf1(U.specKnee, k("specKnee", 4.0));
      uf1(U.mistShare, k("mistShare", 1.5));
      uf1(U.lampFogClip, k("fogClip", 0.7));
      uf1(U.glowAmp, k("glowAmp", 2.3));
      uf1(U.bloomBoost, k("neonBoost", 0.6));
      uf1(U.keyMul, k("keyMul", 1.0));
      uf1(U.fogTint, k("fogTint", 0.0));
      uf1(U.mistHeight, k("mistHeight", 0.30));
      uf1(U.shadowTintAmt, k("shadowTintAmt", 0.0));
      uf1(U.wetDark, k("wetDark", 1.0));
      uf1(U.puddles, k("puddles", 1.0));
      uf1(U.matTexMix, k("matTexMix", 1.0));
      uf1(U.cloudShadowDim, k("cloudShadowDim", 0.80));
      uf1(U.carSunGlint, k("carSunGlint", 12.0));
      uf1(U.carSparkle, k("carSparkle", 1.6));
      uf1(U.fogSunCore, k("fogSunCore", 0.6));
      uf1(U.lampNearClamp, k("lampNearClamp", 4.0));
      uf1(U.windowSunFlash, k("windowSunFlash", 1.0));
      uf1(U.skyRimGlow, k("skyRimGlow", 1.0));
      uf1(U.ambContactDark, k("ambContactDark", 1.0));
      uf1(U.lampWallSpill, k("lampWallSpill", 1.0));
      U.envStr.value = 0;
      if (shadowOn) {
        uf1(U.shadowBias, k("shadowBias", 0.001));
        uf1(U.pcssPen, k("pcssPen", 80.0));
        U.pcssOn.value = SHD.S.pcssEnabled ? 1 : 0;
        const _kl = frame.sunColor
          ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
        let _hf = (_kl - 0.28) / 0.14;
        _hf = _hf < 0 ? 0 : _hf > 1 ? 1 : _hf;
        _hf = _hf * _hf * (3 - 2 * _hf);
        const _mSh = k("moonShadow", 0.25) * (frame.moonGate || 0);
        if (_mSh > _hf) _hf = _mSh;
        U.shadowStr.value = SHD.S.enabled ? k("shadowStr", 1.15) * _hf : 0;
        uf1(U.shadowRange, k("shadowRange", 80.0));
        U.shadowTexel.value = 1 / (SHD.sunSize || 2048);
        const _sc = frame.shadowCtr || frame.eye;
        if (_sc) U.shadowCtr.value.set(_sc[0], _sc[1], _sc[2]);
        U.lightVP.value.fromArray(SHD.S.lightVP);
        if (carShadowOn) {
          U.carLightVP.value.fromArray(SHD.S.carLightVP);
          U.carShadowOn.value = SHD.S.carArmed ? 1 : 0;
          U.carBiasScale.value = SHD.S.carBoxScale || 1;
        }
        if (lampShadowOn) {
          U.lampShadowVP.value.fromArray(SHD.S.lampLightVP);
          const _lampOn = SHD.S.lampArmed && !mirror;
          U.lampShadowOn.value = _lampOn ? 1 : 0;
          U.lampShadowIdx.value = SHD.S.lampIdx;
          const _sc = typeof LampBake !== "undefined" ? LampBake.shadowCol(frame, _lampOn ? SHD.S.lampIdx : -1, _bakeShScr) : _bakeShScr;
          U.bakeShCol.value.set(_sc[0], _sc[1], _sc[2]);
        }
      }
      const L = frame.lights;
      const nL = L ? Math.min(MAX_LIGHTS, (L.length / 15) | 0) : 0;
      U.numLights.value = nL;
      uf1(U.lampCap, mirror && frame.mirrorLampCap > 0 ? Math.min(MAX_LIGHTS, frame.mirrorLampCap) : MAX_LIGHTS);
      const hasLB = typeof LampBake !== "undefined";
      for (let i = 0; i < nL; i++) {
        const o = i * 15;
        lampPos[i].set(L[o], L[o + 1], L[o + 2]);
        lampCol[i].set(L[o + 3], L[o + 4], L[o + 5]);
        lampDir[i].set(L[o + 7], L[o + 8], L[o + 9], hasLB ? LampBake.liveOnlyAt(L, o) : 0);
        lampGeo[i].set(L[o + 6], L[o + 10], L[o + 11], L[o + 12]);
      }
    }

    function setLampGrid(info) {
      if (!LGRID) return false;
      const off = () => { U.lgOn.value = 0.0; return false; };
      if (!info || !info.lights || !info.table || !info.grid) return off();
      const L = info.lights, t = info.table, g = info.grid;
      const cat = g.concat || t.concat;
      const nLamps = (L.length / 15) | 0;
      if (!(nLamps > 0) || nLamps > LGRID.LAMPS) return off();
      if (cat.length > LGRID.IDXW * LGRID.IDXW) return off();
      if (!(g.gw > 0) || !(g.gh > 0) || g.gw > LGRID.G || g.gh > LGRID.G) return off();

      const lt = LGRID.lampTex.image.data;
      lt.fill(0);
      for (let i = 0; i < nLamps; i++) {
        const o = i * 15, r = i * 16;
        lt[r]      = L[o];     lt[r + 1]  = L[o + 1]; lt[r + 2]  = L[o + 2]; lt[r + 3]  = L[o + 6];
        lt[r + 4]  = L[o + 3]; lt[r + 5]  = L[o + 4]; lt[r + 6]  = L[o + 5]; lt[r + 7]  = 0;
        lt[r + 8]  = L[o + 7]; lt[r + 9]  = L[o + 8]; lt[r + 10] = L[o + 9];
        lt[r + 11] = typeof LampBake !== "undefined" ? LampBake.liveOnlyAt(L, o) : 0;
        lt[r + 12] = L[o + 6]; lt[r + 13] = L[o + 10]; lt[r + 14] = L[o + 11]; lt[r + 15] = L[o + 12];
      }
      const it = LGRID.idxTex.image.data;
      it.fill(0);
      for (let k = 0; k < cat.length; k++) it[k] = cat[k];
      const gt = LGRID.gridTex.image.data;
      gt.fill(0);
      if (typeof LampChunks === "undefined" || !LampChunks.blitGrid(g, gt, LGRID.G)) return off();
      LGRID.lampTex.needsUpdate = LGRID.idxTex.needsUpdate = LGRID.gridTex.needsUpdate = true;
      U.lgOrigin.value.set(g.gx0, g.gz0);
      U.lgSize.value.set(g.gw, g.gh);
      U.lgCell.value = info.cell > 0 ? info.cell : 72.0;
      U.lgIdxW.value = LGRID.IDXW;
      U.lgOn.value = 1.0;
      return true;
    }

    function setLampGridColors(L) {
      if (!LGRID || !(U.lgOn.value > 0.5) || !L) return false;
      const nLamps = Math.min((L.length / 15) | 0, LGRID.LAMPS);
      const lt = LGRID.lampTex.image.data;
      for (let i = 0; i < nLamps; i++) {
        const o = i * 15, r = i * 16 + 4;
        lt[r] = L[o + 3]; lt[r + 1] = L[o + 4]; lt[r + 2] = L[o + 5];
      }
      LGRID.lampTex.needsUpdate = true;
      return true;
    }

    const D_GGX = Fn(([NoH, a]) => {
      const a2 = a.mul(a);
      const d = NoH.mul(NoH).mul(a2.sub(1.0)).add(1.0);
      return a2.div(max(d.mul(d).mul(PI), 1e-6));
    }).setLayout({ name: "apexGgx", type: "float", inputs: [
      { name: "NoH", type: "float" }, { name: "a", type: "float" }] });
    const smithViewRoot = (NoV, a) => {
      const a2 = a.mul(a);
      return sqrt(NoV.mul(NoV).mul(a2.oneMinus()).add(a2));
    };
    const V_SmithGGX = Fn(([NoV, NoL, a, viewRoot]) => {
      const a2 = a.mul(a);
      const gv = NoL.mul(viewRoot);
      const gl = NoV.mul(sqrt(NoL.mul(NoL).mul(a2.oneMinus()).add(a2)));
      return float(0.5).div(max(gv.add(gl), 1e-5));
    }).setLayout({ name: "apexSmithGGX", type: "float", inputs: [
      { name: "NoV", type: "float" }, { name: "NoL", type: "float" },
      { name: "a", type: "float" }, { name: "viewRoot", type: "float" }] });
    const F_Schlick = Fn(([VoH, f0, f90]) => {
      const v = VoH.oneMinus();
      const v2 = v.mul(v);
      return f0.add(vec3(f90).sub(f0).mul(v2.mul(v2).mul(v)));
    }).setLayout({ name: "apexSchlick", type: "vec3", inputs: [
      { name: "VoH", type: "float" }, { name: "f0", type: "vec3" }, { name: "f90", type: "float" }] });

    const cloudFBM = (pIn, edge0) => {
      const c = vnoise(pIn).mul(0.5).toVar();
      If(c.add(0.2501).greaterThan(edge0), () => {
        c.addAssign(vnoise(pIn.mul(2.03).add(1.7)).mul(0.25));
      });
      return c;
    };
    const cloudShadow = Fn(([wpIn]) => {
      const wp = vec3(wpIn).toVar();
      const res = float(0.0).toVar();
      If(U.cloudCover.greaterThan(0.001).and(U.sunDir.y.greaterThan(0.06)), () => {
        const t = float(360.0).sub(wp.y).div(max(U.sunDir.y, 0.15));
        const cT = U.time.mul(U.cloudSpeed);
        const cp = wp.xz.add(U.sunDir.xz.mul(t)).mul(0.0052)
          .add(vec2(cT.mul(0.012), cT.mul(0.005)));
        const lo = float(0.54).sub(U.cloudCover.mul(0.40)).toVar();
        const c = cloudFBM(cp, lo);
        res.assign(smoothstep(lo, 0.92, c).mul(U.cloudCover));
      });
      return res;
    });

    const flipUV = (u) => vec2(u.x, u.y.oneMinus());
    const sampleShadow = !shadowOn ? null : Fn(([wpIn, nrmIn]) => {
      const wp = vec3(wpIn).toVar();
      const nrm = vec3(nrmIn).toVar();
      const res = float(1.0).toVar();
      If(U.shadowStr.greaterThan(0.0), () => {
        const lc = U.lightVP.mul(vec4(wp, 1.0)).toVar();
        const sc = lc.xyz.div(lc.w).mul(0.5).add(0.5).toVar();
        If(sc.z.lessThan(1.0), () => {
          const fadeCtr = vec3(cameraPosition.x, U.shadowCtr.y, cameraPosition.z);
          const aDist = length(wp.sub(fadeCtr)).toVar();
          const edgeFade = smoothstep(U.shadowRange.mul(0.62), U.shadowRange.mul(0.84), aDist)
            .oneMinus().toVar();
          const ef = smoothstep(vec2(0.0), vec2(0.03), sc.xy)
            .mul(smoothstep(vec2(0.97), vec2(1.0), sc.xy).oneMinus());
          edgeFade.mulAssign(ef.x.mul(ef.y));
          If(edgeFade.greaterThan(0.0), () => {
            const t = float(U.shadowTexel).toVar();
            const cosTheta = clamp(dot(normalize(nrm), U.sunDir), 0.05, 1.0);
            const slopeBias = t.mul(1.5).mul(sqrt(cosTheta.mul(cosTheta).oneMinus()).div(cosTheta));
            const biasTerm = clamp(slopeBias, 0.0005, 0.004).add(U.shadowBias.mul(0.5)).toVar();
            const z = sc.z.sub(biasTerm.mul(U.shadowRange.div(80.0))).toVar();
            const boxK = min(1.0, float(80.0).div(U.shadowRange)).toVar();
            const nearLod = aDist.lessThan(U.shadowRange.mul(0.80)).toVar();
            const R = float(3.0).toVar();
            if (SHD.blockerTex) {
              If(nearLod.and(U.pcssOn.greaterThan(0.5)), () => {
                const bt = float(1.5 / (SHD.blockerSize || 512)).mul(boxK).toVar();
                const blkT = shadowMapNode(SHD.blockerTex);
                const btap = (px, py) =>
                  blkT.sample(flipUV(sc.xy.add(vec2(px, py).mul(bt)))).r;
                const zb = min(min(btap(-1.0, 1.0), btap(1.0, 1.0)),
                               min(btap(-1.0, -1.0), btap(1.0, -1.0)));
                const pen = clamp(z.sub(zb).mul(U.pcssPen), 0.0, 1.0);
                R.assign(mix(float(1.5), float(6.0), pen));
              }).Else(() => {
                R.assign(float(3.0).mul(U.pcssPen.div(80.0)));
              });
            } else {
              R.assign(float(3.0).mul(U.pcssPen.div(80.0)));
            }
            const ign = ignoise(floor(sc.xy.div(t)));
            const ang = ign.mul(6.2831853);
            const cr = cos(ang).toVar(), sr = sin(ang).toVar();
            const rk = t.mul(R).mul(boxK).toVar();
            const rot = (px, py) => vec2(
              cr.mul(px).add(sr.mul(py)),
              sr.negate().mul(px).add(cr.mul(py))).mul(rk);
            const sunT = shadowMapNode(SHD.sunTex);
            const tap = (px, py) =>
              sunT.sample(flipUV(sc.xy.add(rot(px, py)))).compare(z);
            const s = tap(-0.94201624, -0.39906216)
              .add(tap(0.94558609, -0.76890725))
              .add(tap(-0.09418410, -0.92938870))
              .add(tap(0.34495938, 0.29387760)).toVar();
            const sh = float(1.0).toVar();
            If(nearLod, () => {
              s.addAssign(tap(-0.91588581, 0.45771432)
                .add(tap(-0.81544232, -0.87912464))
                .add(tap(-0.38277543, 0.27676845))
                .add(tap(0.97484398, 0.75648379)));
              sh.assign(s.mul(0.125));
            }).Else(() => {
              sh.assign(s.mul(0.25));
            });
            if (carShadowOn) {
              If(U.carShadowOn.greaterThan(0.5).and(sh.greaterThan(0.0)), () => {
                const cc = U.carLightVP.mul(vec4(wp, 1.0));
                const cs = cc.xyz.mul(0.5).add(0.5).toVar();
                If(cs.x.greaterThan(0.0).and(cs.x.lessThan(1.0))
                  .and(cs.y.greaterThan(0.0)).and(cs.y.lessThan(1.0))
                  .and(cs.z.lessThan(1.0)), () => {
                  const cz = cs.z.sub(biasTerm.mul(U.carBiasScale)).toVar();
                  const ct = (1.0 / (SHD.carSize || 1024)) * 0.75;
                  const carT = shadowMapNode(SHD.carTex);
                  const ctap = (px, py) =>
                    carT.sample(flipUV(cs.xy.add(vec2(px, py)))).compare(cz);
                  const csh = ctap(-ct, -ct).add(ctap(ct, -ct))
                    .add(ctap(-ct, ct)).add(ctap(ct, ct)).mul(0.25);
                  sh.assign(min(sh, csh));
                });
              });
            }
            res.assign(max(0.0, mix(float(1.0), sh, U.shadowStr.mul(edgeFade))));
          });
        });
      });
      return res;
    });

    const matBumpHeight = Fn(([mid, uv]) => {
      const hc = uv.x, y = uv.y;
      const h = float(0.0).toVar();
      If(mid.equal(1.0), () => {
        const seam = smoothstepDown(0.05, 0.0, abs(fract(y.div(1.25)).sub(0.5)).sub(0.46));
        h.assign(vnoise(uv.mul(6.0)).mul(0.6).sub(seam.mul(0.5)));
      }).ElseIf(mid.equal(2.0), () => {
        const ch = 0.20, bl = 0.42, mort = 0.06;
        const row = floor(y.div(ch));
        const off = mod(row, 2.0).mul(0.5 * bl);
        const bx = fract(hc.add(off).div(bl)), by = fract(y.div(ch));
        const joint = max(smoothstepDown(mort, 0.0, min(bx, bx.oneMinus()).mul(bl)),
                          smoothstepDown(mort, 0.0, min(by, by.oneMinus()).mul(ch)));
        h.assign(joint.oneMinus().mul(0.5)
          .add(vnoise(vec2(floor(hc.add(off).div(bl)), row).mul(4.0)).mul(0.10)));
      }).ElseIf(mid.equal(4.0), () => {
        h.assign(vnoise(vec2(hc.mul(55.0), y.mul(3.0))).mul(0.3));
      }).ElseIf(mid.equal(5.0), () => {
        const seam = smoothstepDown(0.05, 0.0, abs(fract(hc.div(0.35)).sub(0.5)).sub(0.46));
        h.assign(seam.oneMinus().mul(0.4).add(vnoise(vec2(hc.mul(3.0), y.mul(22.0))).mul(0.16)));
      }).ElseIf(mid.equal(6.0), () => {
        h.assign(vnoise(uv.mul(3.2)).mul(0.5).add(vnoise(uv.mul(11.0)).mul(0.3)));
      }).ElseIf(mid.equal(7.0), () => {
        h.assign(sin(hc.mul(38.0)).mul(0.15).add(sin(y.mul(38.0)).mul(0.15)));
      }).ElseIf(mid.equal(8.0), () => {
        h.assign(sin(hc.mul(3.0).add(vnoise(uv.mul(0.3)).mul(6.0))).mul(0.5)
          .add(vnoise(uv.mul(8.0)).mul(0.2)));
      }).ElseIf(mid.equal(9.0), () => {
        h.assign(vnoise(uv.mul(6.0)).mul(0.4).add(vnoise(uv.mul(20.0)).mul(0.25)));
      }).ElseIf(mid.equal(10.0), () => {
        h.assign(vnoise(uv.mul(1.3)).mul(0.6).add(vnoise(uv.mul(4.5)).mul(0.3))
          .add(vnoise(uv.mul(15.0)).mul(0.15)));
      }).ElseIf(mid.equal(11.0), () => {
        h.assign(vnoise(uv.mul(1.8)).mul(0.45).add(vnoise(uv.mul(21.0)).mul(0.18)));
      }).ElseIf(mid.equal(12.0), () => {
        const ty = fract(y.div(0.34));
        h.assign(sin(ty.mul(3.14159)).mul(0.5)
          .add(vnoise(vec2(hc.mul(2.0), floor(y.div(0.34))).mul(3.0)).mul(0.08)));
      }).ElseIf(mid.equal(13.0), () => {
        const cell = floor(uv.mul(1.3));
        const f = fract(uv.mul(1.3)).sub(hash21(cell).mul(0.12));
        const d = min(min(f.x, f.x.oneMinus()), min(f.y, f.y.oneMinus()));
        h.assign(smoothstep(0.0, 0.16, d).mul(0.55).add(vnoise(uv.mul(5.0)).mul(0.15)));
      }).ElseIf(mid.equal(14.0), () => {
        h.assign(sin(hc.mul(7.5)).mul(0.55).add(vnoise(uv.mul(6.0)).mul(0.10)));
      }).ElseIf(mid.equal(16.0), () => {
        h.assign(vnoise(uv.mul(9.0)).mul(0.34).add(vnoise(uv.mul(26.0)).mul(0.16)));
      });
      return h;
    }).setLayout({ name: "apexMatBumpHeight", type: "float",
      inputs: [{ name: "mid", type: "float" }, { name: "uv", type: "vec2" }] });

    const matWallLike = (mid) => mid.equal(1.0).or(mid.equal(2.0)).or(mid.equal(4.0))
      .or(mid.equal(5.0)).or(mid.equal(7.0)).or(mid.equal(12.0))
      .or(mid.equal(13.0)).or(mid.equal(14.0));

    const applyMaterialNormal = Fn(([mid, Nin, wpIn, vd]) => {
      const N = vec3(Nin).toVar();
      const wp = vec3(wpIn).toVar();
      const bumpFade = clamp(vd.sub(22.0).div(58.0).oneMinus(), 0.0, 1.0).toVar();
      const inRange = mid.greaterThan(0.5).and(mid.lessThan(16.5))
        .and(mid.notEqual(3.0)).and(mid.notEqual(15.0));
      const an0 = abs(N);
      const hc0 = select(an0.x.greaterThan(an0.z), wp.z, wp.x).toVar();
      const y0 = wp.y.toVar();
      const fwWall = max(fwidth(hc0), fwidth(y0)).toVar();
      const fwGround = max(fwidth(wp.x), fwidth(wp.z)).toVar();
      If(inRange.and(bumpFade.greaterThan(0.005)), () => {
        If(matWallLike(mid), () => {
          const hc = hc0;
          const y = y0;
          const aaFade = clamp(fwWall.sub(0.04).div(0.22).oneMinus(), 0.0, 1.0).toVar();
          If(aaFade.greaterThan(0.005), () => {
            const T = select(an0.x.greaterThan(an0.z), vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0));
            const e = 0.05;
            const h0 = matBumpHeight(mid, vec2(hc0, y0));
            const hx = matBumpHeight(mid, vec2(hc0.add(e), y0));
            const hy = matBumpHeight(mid, vec2(hc0, y0.add(e)));
            const amt = select(mid.equal(2.0).or(mid.equal(13.0)), float(0.10),
                        select(mid.equal(12.0).or(mid.equal(14.0)), float(0.09), float(0.05)));
            N.assign(normalize(N.add(
              T.mul(h0.sub(hx)).add(vec3(0.0, 1.0, 0.0).mul(h0.sub(hy)))
                .mul(amt.mul(bumpFade).mul(aaFade).div(e)))));
          });
        }).Else(() => {
          const aaG = clamp(fwGround.sub(0.10).div(0.55).oneMinus(), 0.0, 1.0).toVar();
          const fdBump = () => {
            const e = 0.22;
            const p0 = wp.xz;
            const h0 = matBumpHeight(mid, p0);
            const hx = matBumpHeight(mid, p0.add(vec2(e, 0.0)));
            const hz = matBumpHeight(mid, p0.add(vec2(0.0, e)));
            const amt = select(mid.equal(8.0), float(0.16),
                        select(mid.equal(10.0), float(0.14),
                        select(mid.equal(16.0), float(0.025), float(0.07))));
            N.assign(normalize(N.add(
              vec3(h0.sub(hx), 0.0, h0.sub(hz)).mul(amt.mul(bumpFade).mul(aaG).div(e)))));
          };
          If(aaG.greaterThan(0.005), () => {
            if (!ROAD_NORMAL_V2) { fdBump(); return; }
            If(mid.equal(16.0), () => {
              const g = vnoiseGrad(wp.xz.mul(9.0)).yz.mul(1.233).add(vnoiseGrad(wp.xz.mul(26.0)).yz.mul(0.571));
              N.assign(normalize(N.sub(vec3(g.x, 0.0, g.y).mul(bumpFade.mul(aaG).mul(0.025)))));
            }).Else(fdBump);
          });
        });
      });
      return N;
    });

    const MAT_MAPS = ctx.matMaps || null;

    const LGRID = (ctx.lampGrid && ctx.lampGrid.lampTex) ? ctx.lampGrid : null;
    const _bakeBlank = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    _bakeBlank.minFilter = _bakeBlank.magFilter = THREE.LinearFilter;
    _bakeBlank.needsUpdate = true;
    const _bakeIdxBlank = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    _bakeIdxBlank.minFilter = _bakeIdxBlank.magFilter = THREE.NearestFilter;
    _bakeIdxBlank.needsUpdate = true;
    const BAKE_NODE = texGroup(texture(_bakeBlank));
    const BAKE_IDX_NODE = texGroup(texture(_bakeIdxBlank));
    const LG_TEX = LGRID ? { grid: texGroup(texture(LGRID.gridTex)), idx: texGroup(texture(LGRID.idxTex)), lamp: texGroup(texture(LGRID.lampTex)) } : null;
    function _halfData(data, w, h, filter) {
      const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
      t.minFilter = t.magFilter = filter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    }
    let _bakeSrc = null, _bakeOffN = 0;
    function setLampBake(b, scale) {
      if (!b || !scale) {
        U.bakeOn.value = 0.0;
        if (BAKE_NODE.value !== _bakeBlank && ++_bakeOffN > 120) {
          const old = BAKE_NODE.value, oldIdx = BAKE_IDX_NODE.value;
          BAKE_NODE.value = _bakeBlank;
          BAKE_IDX_NODE.value = _bakeIdxBlank;
          _bakeSrc = null;
          try { old.dispose(); } catch (_) {  }
          if (oldIdx !== _bakeIdxBlank) { try { oldIdx.dispose(); } catch (_) {  } }
        }
        return false;
      }
      _bakeOffN = 0;
      if (b !== _bakeSrc) {
        const t = _halfData(b.data, b.atlasW, b.atlasH * 2, THREE.LinearFilter);
        const ti = _halfData(b.indir, b.tilesX, b.tilesY, THREE.NearestFilter);
        const old = BAKE_NODE.value, oldIdx = BAKE_IDX_NODE.value;
        BAKE_NODE.value = t;
        BAKE_IDX_NODE.value = ti;
        if (old && old !== _bakeBlank) { try { old.dispose(); } catch (_) {  } }
        if (oldIdx && oldIdx !== _bakeIdxBlank) { try { oldIdx.dispose(); } catch (_) {  } }
        _bakeSrc = b;
        U.bakeOrigin.value.set(b.x0, b.z0);
        U.bakeSize.value.set(b.tilesX * b.T * b.cell, b.tilesY * b.T * b.cell);
        U.bakeGrid.value.set(b.tilesX, b.tilesY, b.T);
        U.bakeAtlas.value.set(b.atlasW, b.atlasH * 2);
      }
      U.bakeScale.value.set(scale[0], scale[1], scale[2]);
      U.bakeOn.value = 1.0;
      return true;
    }
    const matAlbedoNode = MAT_MAPS && MAT_MAPS.albedo ? texGroup(texture(MAT_MAPS.albedo)) : null;
    const matNormalNode = MAT_MAPS && MAT_MAPS.normal ? texGroup(texture(MAT_MAPS.normal)) : null;

    const matTexLayer = (mid) => clamp(mid, float(0.0), float(16.0));
    const matTexInPack = (mid) => mid.greaterThanEqual(1.0).and(mid.lessThanEqual(16.0));
    const matTexScaleOf = (mid) => U.matTexScale.element(int(matTexLayer(mid)));
    const matTexUV = (mid, N, wp) => select(matWallLike(matTexLayer(mid)),
      vec2(select(abs(N).x.greaterThan(abs(N).z), wp.z, wp.x), wp.y),
      wp.xz).div(max(matTexScaleOf(mid), float(0.0001)));

    const applyMaterialTexNormal = matNormalNode ? Fn(([mid, Nin, wpIn, vd, nGeoIn]) => {
      const N = vec3(Nin).toVar();
      const wp = vec3(wpIn).toVar();
      const nGeo = normalize(vec3(nGeoIn)).toVar();
      const fade = clamp(vd.sub(22.0).div(58.0).oneMinus(), 0.0, 1.0).toVar();
      const live = U.matTexMix.greaterThan(0.001)
        .and(matTexInPack(mid))
        .and(matTexScaleOf(mid).greaterThan(0.0));
      const uv = matTexUV(mid, nGeo, wp).toVar();
      const fp = max(fwidth(uv.x), fwidth(uv.y)).toVar();
      const aa = clamp(fp.sub(0.02).div(0.30).oneMinus(), 0.0, 1.0).toVar();
      const nt = matNormalNode.sample(uv).depth(int(matTexLayer(mid)));
      If(live.and(fade.greaterThan(0.005)), () => {
        If(aa.greaterThan(0.005), () => {
          const dxy = nt.xy.sub(0.5).mul(2.0).toVar();
          const an = abs(nGeo);
          const wall = matWallLike(matTexLayer(mid));
          const T = select(wall,
            select(an.x.greaterThan(an.z), vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0)),
            vec3(1.0, 0.0, 0.0));
          const B = select(wall, vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));
          const amt = select(mid.equal(16.0), float(0.10), float(0.55))
            .mul(U.matTexMix).mul(fade).mul(aa);
          N.assign(normalize(N.add(T.mul(dxy.x).add(B.mul(dxy.y)).mul(amt))));
        });
      });
      return N;
    }) : null;

    const applyMaterialTex = matAlbedoNode ? Fn(([mid, albedoIn, roughIn, wpIn, nrmIn, vd]) => {
      const albedo = vec3(albedoIn).toVar();
      const rough = float(roughIn).toVar();
      const wp = vec3(wpIn).toVar();
      const far = clamp(vd.sub(90.0).div(170.0).oneMinus(), 0.0, 1.0).toVar();
      const live = U.matTexMix.greaterThan(0.001)
        .and(matTexInPack(mid))
        .and(matTexScaleOf(mid).greaterThan(0.0));
      const uv = matTexUV(mid, normalize(vec3(nrmIn)), wp).toVar();
      const t = matAlbedoNode.sample(uv).depth(int(matTexLayer(mid)));
      If(live.and(far.greaterThan(0.001)), () => {
        const k = U.matTexMix.mul(far).toVar();
        albedo.assign(mix(albedo, albedo.mul(t.xyz).mul(2.0), k));
        rough.assign(clamp(mix(rough, t.w, k.mul(0.8)), 0.04, 1.0));
      });
      return vec4(albedo, rough);
    }) : null;

    const PIT_LANE_W = 3.2;
    const PIT_LANE_MIN = 2.4;
    const PIT_MIN_RACING = 7.0;
    const roadMarkings = Fn(([trkIn, albedoIn, roughIn]) => {
      const s = float(trkIn.x).toVar();
      const x = float(trkIn.y).toVar();
      const hw = float(trkIn.z).toVar();
      const fwX = max(fwidth(x), 1e-4).toVar();
      const aaX = min(fwX, 0.30).toVar();
      const aaS = clamp(fwidth(s).div(7.0), 1e-4, 0.24).toVar();
      const albedo = vec3(albedoIn).toVar();
      const rough = float(roughIn).toVar();
      If(hw.greaterThan(0.5), () => {
        const dEdge = abs(abs(x).sub(hw.sub(0.10))).toVar();
        const edge = smoothstep(aaX.mul(-1.0).add(0.10), aaX.add(0.10), dEdge).oneMinus().toVar();

        const band = smoothstep(aaX.mul(-1.0).add(0.30), aaX.add(0.30), abs(x)).oneMinus().toVar();
        const ph = fract(s.div(7.0)).toVar();
        const dash = smoothstep(aaS.mul(-1.0).add(0.25), aaS.add(0.25), abs(ph.sub(0.25))).oneMinus().toVar();

        const mip = clamp(fwX.sub(0.10).div(0.55).oneMinus(), 0.0, 1.0).toVar();
        const base = max(edge, band.mul(dash)).toVar();
        const m = base.mul(mip).toVar();

        albedo.assign(mix(albedo, vec3(0.95, 0.95, 0.97), m));
        rough.assign(mix(rough, 0.55, m));
        const lenM = float(U.pitLane.y).toVar();
        If(lenM.greaterThan(0.0), () => {
          const L = float(U.pitLane.w).toVar();
          const through = mod(s.sub(U.pitLane.x).add(L), L).toVar();
          If(through.lessThanEqual(lenM), () => {
            const laneW = min(float(PIT_LANE_W), max(float(PIT_LANE_MIN), hw.mul(2.0).sub(PIT_MIN_RACING))).toVar();
            const lx = hw.sub(laneW).mul(U.pitLane.z).toVar();
            const pitBand = smoothstep(aaX.mul(-1.0).add(0.20), aaX.add(0.20), abs(x.sub(lx))).oneMinus().toVar();
            const fadeIn = smoothstep(0.0, 2.0, through).toVar();
            const fadeOut = smoothstep(0.0, 6.0, lenM.sub(through)).toVar();
            const inLane = select(x.sub(lx).mul(U.pitLane.z).greaterThanEqual(0.0), float(1.0), float(0.0)).toVar();
            const bar = smoothstep(0.4, 1.0, through).sub(smoothstep(2.4, 3.0, through)).mul(inLane).toVar();
            const hasBox = select(float(U.pitBox.y).greaterThan(0.0), float(1.0), float(0.0)).toVar();
            const dBox = abs(through.sub(U.pitBox.x)).toVar();
            const bEnds = smoothstep(0.12, 0.30, abs(dBox.sub(U.pitBox.y))).oneMinus().toVar();
            const bSpan = select(dBox.lessThan(float(U.pitBox.y)), float(1.0), float(0.0)).toVar();
            const bRails = max(smoothstep(0.12, 0.30, abs(x.sub(lx))).oneMinus(),
                               smoothstep(0.12, 0.30, abs(abs(x).sub(hw))).oneMinus()).toVar();
            const boxM = max(bEnds, bSpan.mul(bRails)).mul(inLane).mul(hasBox).toVar();
            const pitLine = max(max(pitBand.mul(fadeIn), bar), boxM).mul(fadeOut).mul(mip).toVar();
            const pitFill = inLane.mul(fadeIn).mul(fadeOut).toVar();

            albedo.assign(mix(albedo, vec3(0.15, 0.16, 0.19), pitFill.mul(0.35)));
            albedo.assign(mix(albedo, vec3(0.10, 0.36, 0.86), pitLine));
            rough.assign(mix(rough, 0.55, pitLine));
          });
        });
      });
      return vec4(albedo, rough);
    });

    const applyMaterial = Fn(([mid, albedoIn, roughIn, wpIn, nrmIn, vd]) => {
      const albedo = vec3(albedoIn).toVar();
      const rough = float(roughIn).toVar();
      const wp = vec3(wpIn).toVar();
      const nrm = vec3(nrmIn).toVar();
      const far = clamp(vd.sub(90.0).div(170.0).oneMinus(), 0.0, 1.0).toVar();
      const near = clamp(vd.sub(26.0).div(64.0).oneMinus(), 0.0, 1.0).toVar();
      const inRange = mid.greaterThan(0.5).and(mid.lessThan(16.5)).and(mid.notEqual(15.0));
      const an = abs(normalize(nrm)).toVar();
      const wall = an.y.lessThan(0.6);
      const hc = select(an.x.greaterThan(an.z), wp.z, wp.x).toVar();
      const y = wp.y.toVar();
      const fwHc = fwidth(hc).toVar();
      const fwY = fwidth(y).toVar();
      const fwY125 = fwY.div(1.25);
      const fwHcPw = fwHc.div(1.6);
      const fwYPh = fwY.div(1.4);
      const fwHc035 = fwHc.div(0.35);
      const fwHc13 = fwHc.mul(1.3);
      const fwY13 = fwY.mul(1.3);
      const fwTy = fwidth(fract(y.div(0.34))).toVar();
      const ridgePhase0 = hc.mul(7.5);
      const fwRidge = fwHc.mul(7.5);
      If(inRange.and(far.greaterThan(0.001)), () => {
        If(mid.equal(1.0), () => {
          albedo.mulAssign(vnoise(wp.xz.mul(0.09).add(y.mul(0.05))).sub(0.5).mul(0.16).mul(far).add(1.0));
          If(near.greaterThan(0.0), () => {
            albedo.mulAssign(vnoise(vec2(hc, y).mul(6.0)).sub(0.5).mul(0.10).mul(near).add(1.0));
          });
          const seam = smoothstepDown(max(float(0.05), fwY125), 0.0,
            abs(fract(y.div(1.25)).sub(0.5)).sub(0.46)).mul(0.14).mul(near);
          albedo.mulAssign(select(wall, seam.oneMinus(), float(1.0)));
          rough.assign(min(1.0, rough.add(far.mul(0.08))));
        }).ElseIf(mid.equal(2.0), () => {
          const ch = 0.20, bl = 0.42, mort = 0.06;
          const row = floor(y.div(ch));
          const off = mod(row, 2.0).mul(0.5 * bl);
          const bx = fract(hc.add(off).div(bl)), by = fract(y.div(ch));
          const mortAA = max(float(mort), max(fwHc, fwY));
          const joint = max(smoothstepDown(mortAA, 0.0, min(bx, bx.oneMinus()).mul(bl)),
                            smoothstepDown(mortAA, 0.0, min(by, by.oneMinus()).mul(ch)));
          const bh = vnoise(vec2(floor(hc.add(off).div(bl)), row).mul(1.3));
          const brick = albedo.mul(bh.mul(0.42).add(0.82)).mul(vec3(1.06, 0.99, 0.92));
          const mortar = mix(albedo, vec3(0.60, 0.58, 0.55), 0.6);
          albedo.assign(mix(brick, mortar, joint.mul(near)));
          rough.assign(min(1.0, rough.add(far.mul(0.12))));
        }).ElseIf(mid.equal(3.0), () => {
          const pw = 1.6, ph = 1.4, mull = 0.11;
          const gx = fract(hc.div(pw)), gy = fract(y.div(ph));
          const mullAA = max(float(mull), max(fwHcPw, fwYPh));
          const bar = max(smoothstepDown(mullAA, 0.0, min(gx, gx.oneMinus())),
                          smoothstepDown(mullAA, 0.0, min(gy, gy.oneMinus())));
          albedo.mulAssign(vnoise(vec2(floor(hc.div(pw)), floor(y.div(ph))).mul(1.7)).sub(0.5).mul(0.5).mul(far).add(1.0));
          albedo.assign(mix(albedo, albedo.mul(0.32), bar.mul(near)));
          rough.assign(mix(rough, min(rough, 0.12), near));
        }).ElseIf(mid.equal(4.0), () => {
          const brushFade = clamp(vd.sub(26.0).div(29.0).oneMinus(), 0.0, 1.0);
          If(brushFade.greaterThan(0.0), () => {
            albedo.mulAssign(vnoise(vec2(hc.mul(40.0), y.mul(2.0))).sub(0.5).mul(0.12).mul(brushFade).add(1.0));
          });
          rough.assign(clamp(rough.sub(far.mul(0.15)), 0.05, 1.0));
        }).ElseIf(mid.equal(5.0), () => {
          If(near.greaterThan(0.0), () => {
            albedo.mulAssign(vnoise(vec2(hc.mul(3.0), y.mul(22.0))).sub(0.5).mul(0.18).mul(near).add(1.0));
          });
          albedo.mulAssign(smoothstepDown(max(float(0.05), fwHc035), 0.0,
            abs(fract(hc.div(0.35)).sub(0.5)).sub(0.46)).mul(0.16).mul(near).oneMinus());
        }).ElseIf(mid.equal(6.0), () => {
          const d = vnoise(wp.xz.mul(2.4).add(wp.y.mul(1.6))).mul(0.6).toVar();
          If(near.greaterThan(0.0), () => { d.addAssign(vnoise(wp.xz.mul(9.0)).mul(0.4).mul(near)); });
          albedo.mulAssign(d.sub(0.5).mul(0.34).mul(far).add(1.0));
          albedo.y.mulAssign(d.sub(0.5).mul(0.10).mul(far).add(1.0));
        }).ElseIf(mid.equal(7.0), () => {
          const weaveFade = clamp(vd.sub(26.0).div(34.0).oneMinus(), 0.0, 1.0);
          If(weaveFade.greaterThan(0.0), () => {
            albedo.mulAssign(vnoise(vec2(hc, y).mul(26.0)).sub(0.5).mul(0.14).mul(weaveFade).add(1.0));
          });
        }).ElseIf(mid.equal(8.0), () => {
          const sandG = float(0.0).toVar();
          If(near.greaterThan(0.0), () => { sandG.assign(vnoise(wp.xz.mul(5.0)).sub(0.5).mul(0.12).mul(near)); });
          albedo.mulAssign(sandG
            .add(sin(wp.x.mul(0.7).add(vnoise(wp.xz.mul(0.2)).mul(6.0))).mul(0.05).mul(far))
            .add(1.0));
        }).ElseIf(mid.equal(9.0), () => {
          const g = vnoise(wp.xz.mul(3.5)).mul(0.6).toVar();
          If(near.greaterThan(0.0), () => { g.addAssign(vnoise(wp.xz.mul(14.0)).mul(0.4).mul(near)); });
          g.subAssign(0.5);
          albedo.mulAssign(g.mul(0.22).mul(far).add(1.0));
          albedo.y.mulAssign(g.mul(0.08).mul(far).add(1.0));
        }).ElseIf(mid.equal(10.0), () => {
          const r = vnoise(wp.xz.mul(0.9).add(y.mul(0.6))).mul(0.6)
            .add(vnoise(wp.xz.mul(4.5)).mul(0.4)).sub(0.5);
          albedo.mulAssign(r.mul(0.30).mul(far).add(1.0));
          rough.assign(min(1.0, rough.add(far.mul(0.16))));
        }).ElseIf(mid.equal(11.0), () => {
          const s = vnoise(wp.xz.mul(1.6).add(y.mul(0.4))).sub(0.5);
          albedo.mulAssign(s.mul(0.10).mul(far).add(1.0));
          albedo.z.mulAssign(s.mul(0.05).mul(far).oneMinus());
          const sparkleFade = clamp(vd.sub(26.0).div(34.0).oneMinus(), 0.0, 1.0);
          If(sparkleFade.greaterThan(0.0), () => {
            albedo.mulAssign(vnoise(wp.xz.mul(24.0)).sub(0.5).mul(0.06).mul(sparkleFade).add(1.0));
          });
          rough.assign(clamp(rough.sub(far.mul(0.10)), 0.05, 1.0));
        }).ElseIf(mid.equal(12.0), () => {
          const ty = fract(y.div(0.34));
          const shadeAA = clamp(fwTy.mul(6.0).oneMinus(), 0.0, 1.0);
          const shade = sin(ty.mul(3.14159)).mul(shadeAA);
          albedo.mulAssign(shade.mul(0.16).add(0.88));
          If(near.greaterThan(0.0), () => {
            albedo.mulAssign(vnoise(vec2(hc.mul(2.0), floor(y.div(0.34))).mul(3.0)).sub(0.5).mul(0.14).mul(near).add(1.0));
          });
          rough.assign(min(1.0, rough.add(far.mul(0.10))));
        }).ElseIf(mid.equal(13.0), () => {
          const cell = floor(vec2(hc, y).mul(1.3));
          const f = fract(vec2(hc, y).mul(1.3)).sub(hash21(cell).mul(0.12));
          const d = min(min(f.x, f.x.oneMinus()), min(f.y, f.y.oneMinus()));
          const jointAA = max(float(0.16), max(fwHc13, fwY13));
          const joint = smoothstep(0.0, jointAA, d);
          const block = albedo.mul(hash21(cell).mul(0.4).add(0.80));
          const mortar = mix(albedo, vec3(0.42, 0.40, 0.37), 0.65);
          albedo.assign(mix(mortar, block, joint.mul(near)));
          rough.assign(min(1.0, rough.add(far.mul(0.18))));
        }).ElseIf(mid.equal(14.0), () => {
          const ridgeAA = clamp(fwRidge.mul(3.0).oneMinus(), 0.0, 1.0);
          const ridge = sin(ridgePhase0).mul(ridgeAA);
          albedo.mulAssign(ridge.mul(0.18).add(0.85));
          const rust = smoothstep(0.55, 0.9, vnoise(vec2(hc.mul(0.8), y.mul(0.35)).add(5.0)));
          albedo.assign(mix(albedo, albedo.mul(vec3(0.62, 0.42, 0.28)), rust.mul(0.5).mul(far)));
          rough.assign(min(1.0, rough.add(far.mul(0.14))));
        }).ElseIf(mid.equal(16.0), () => {
          albedo.mulAssign(vnoise(wp.xz.mul(0.035)).sub(0.5).mul(0.10).mul(far).add(1.0));
          If(near.greaterThan(0.0), () => {
            albedo.mulAssign(vnoise(wp.xz.mul(7.0)).sub(0.5).mul(0.13).mul(near).add(1.0));
          });
          rough.assign(min(1.0, rough.add(far.mul(0.10))));
        });
      });
      return vec4(albedo, rough);
    });

    function buildFragment(matU, chunked, instanced, fx) {
      return Fn(() => {
        const wp = vec3(positionWorld).toVar();
        const Nvary = vec3(normalWorldGeometry).toVar();
        const objP = vec3(positionGeometry).toVar();
        const vertexColor = vec3(attribute("color", "vec3")).toVar();
        const albedoIn = instanced
          ? vertexColor.mul(attribute("instanceTint", "vec3")).toVar()
          : vertexColor;
        const matA = float(attribute("mat", "float")).toVar();
        const trkA = chunked ? null : vec3(attribute("trk", "vec3")).toVar();
        const hmUV = objP.xz.add(objP.y.mul(vec2(0.73, -0.61))).toVar();
        const hmDP1 = vec3(0.0).toVar(), hmDP2 = vec3(0.0).toVar();
        const hmDUV1 = vec2(0.0).toVar(), hmDUV2 = vec2(0.0).toVar();
        If(matU.carFinish.greaterThan(0.5), () => {
          hmDP1.assign(dFdx(wp)); hmDP2.assign(dFdy(wp));
          hmDUV1.assign(dFdx(hmUV)); hmDUV2.assign(dFdy(hmUV));
        });
        const vd = length(wp.sub(cameraPosition)).toVar();
        const trkRightXZ = trkA ? vec2(0.0).toVar() : null;
        if (trkA) If(U.wetness.greaterThan(0.001), () => {
          trkRightXZ.assign(dFdx(wp.xz).mul(dFdx(trkA.y)).add(dFdy(wp.xz).mul(dFdy(trkA.y))));
        });
        const V = normalize(cameraPosition.sub(wp)).toVar();

        const N = select(frontFacing, Nvary, Nvary.negate()).toVar();
        N.assign(normalize(N));

        If(matU.detail.greaterThan(0.001), () => {
          const mnFp = max(fwidth(wp.x), fwidth(wp.z)).toVar();
          const mnFade = clamp(vd.sub(25.0).div(70.0).oneMinus(), 0.0, 1.0)
            .mul(U.wetness.mul(0.75).oneMinus()).toVar();
          mnFade.mulAssign(clamp(mnFp.sub(0.15).div(0.70).oneMinus(), 0.0, 1.0));
          If(mnFade.greaterThan(0.01), () => {
            const mnp = wp.xz.mul(1.7);
            if (ROAD_NORMAL_V2) {
              const g = vnoiseGrad(mnp).yz.mul(0.683).add(vnoiseGrad(mnp.mul(3.9)).yz.mul(0.900));
              N.assign(normalize(N.sub(vec3(g.x, 0.0, g.y).mul(matU.detail.mul(0.4).mul(mnFade)))));
              return;
            }
            const e = 0.22;
            const h0 = vnoise(mnp).mul(0.7).add(vnoise(mnp.mul(3.9)).mul(0.3));
            const hx = vnoise(mnp.add(vec2(e, 0.0))).mul(0.7)
              .add(vnoise(mnp.mul(3.9).add(vec2(e * 3.9, 0.0))).mul(0.3));
            const hz = vnoise(mnp.add(vec2(0.0, e))).mul(0.7)
              .add(vnoise(mnp.mul(3.9).add(vec2(0.0, e * 3.9))).mul(0.3));
            N.assign(normalize(N.add(vec3(h0.sub(hx), 0.0, h0.sub(hz))
              .mul(matU.detail.mul(0.4).mul(mnFade).div(e)))));
          });
        });

        const Ngeo = vec3(N).toVar();

        const surfaceId = floor(matA.add(0.5)).toVar();
        const finishId = surfaceId.toVar();
        If(surfaceId.equal(62.0).or(surfaceId.equal(67.0)).or(surfaceId.equal(68.0)).or(surfaceId.equal(69.0)).or(surfaceId.equal(70.0))
          .or(surfaceId.equal(74.0)).or(surfaceId.equal(81.0)).or(surfaceId.equal(82.0)).or(surfaceId.equal(83.0)).or(surfaceId.equal(84.0)), () => { surfaceId.assign(20.0); });
        If(surfaceId.equal(61.0).or(surfaceId.equal(71.0).or(surfaceId.equal(85.0))), () => { surfaceId.assign(28.0); });
        If(surfaceId.equal(63.0).or(surfaceId.equal(65.0)), () => { surfaceId.assign(29.0); });
        If(surfaceId.equal(72.0), () => { surfaceId.assign(34.0); });
        If(surfaceId.equal(60.0), () => { surfaceId.assign(39.0); });
        If(surfaceId.equal(66.0), () => { surfaceId.assign(31.0); });
        const fnPx = float(1.0).toVar(), fnCrease = float(0.0).toVar();
        If(matU.carFinish.greaterThan(0.5), () => {
          const fnDx = dFdx(Ngeo).toVar(), fnDy = dFdy(Ngeo).toVar();
          fnPx.assign(max(length(fwidth(objP)), 1e-5));
          fnCrease.assign(smoothstep(0.02, 0.20, dot(fnDx, fnDx).add(dot(fnDy, fnDy))));
        });
        const classifiedCar = surfaceId.greaterThanEqual(20.0).and(surfaceId.lessThanEqual(90.0)).toVar();
        const flakeSurface = surfaceId.equal(34.0).toVar();
        const candySurface = surfaceId.equal(35.0).toVar();
        const paintSurface = surfaceId.equal(20.0).or(flakeSurface).or(candySurface).toVar();
        const carbonSurface = surfaceId.equal(21.0).toVar();
        const rubberSurface = surfaceId.equal(22.0).toVar();
        const sidewallSurface = surfaceId.equal(33.0).toVar();
        const metalSurface = surfaceId.equal(23.0).toVar();
        const glassSurface = surfaceId.equal(24.0).toVar();
        const emissiveSurface = surfaceId.equal(25.0).toVar();
        const panelSurface = surfaceId.equal(26.0).toVar();
        const tintedSurface = surfaceId.equal(36.0).toVar();
        const goldSurface = surfaceId.equal(40.0).toVar();
        const mirrorSurface = surfaceId.equal(27.0).or(tintedSurface).or(goldSurface).toVar();
        const forgedSurface = surfaceId.equal(38.0).toVar();
        const gunSurface = surfaceId.equal(39.0).toVar();
        const holoSurface = surfaceId.equal(41.0).toVar();
        const velvetSurface = surfaceId.equal(42.0).toVar();
        const hammerSurface = surfaceId.equal(43.0).toVar();
        const anodSurface = surfaceId.equal(44.0).toVar();
        const matteSurface = surfaceId.equal(28.0).toVar();
        const satinMetalSurface = surfaceId.equal(29.0).toVar();
        const chamSurface = surfaceId.equal(37.0).toVar();
        const iriSurface = surfaceId.equal(30.0).or(chamSurface).toVar();
        const carbonFinish = surfaceId.equal(31.0).toVar();
        const weave = float(0.5).toVar();
        const wvT = vec2(0.0).toVar();
        If(carbonFinish.or(carbonSurface), () => {
          const wvFade = clamp(vd.sub(10.0).div(10.0).oneMinus(), 0.0, 1.0).toVar();
          If(wvFade.greaterThan(0.0), () => {
            const wv = objP.xz.mul(190.0).add(objP.y.mul(190.0)).toVar();
            weave.assign(wv.x.sin().mul(wv.y.sin()).mul(wvFade).mul(0.5).add(0.5));
            wvT.assign(vec2(wv.x.cos().mul(wv.y.sin()), wv.x.sin().mul(wv.y.cos())).mul(wvFade));
          });
        });
        const fgM = float(0.667).toVar();
        If(forgedSurface, () => {
          const fgF = clamp(vd.sub(10.0).div(10.0).oneMinus(), 0.0, 1.0).toVar();
          If(fgF.greaterThan(0.0), () => {
            const fgA = floor(objP.mul(60.0));
            const fgB = floor(vec3(objP.x.add(objP.z), objP.y.sub(objP.x), objP.z.add(objP.y)).mul(95.0));
            fgM.assign(mix(float(0.667), max(hash21(fgA.xy.add(fgA.z.mul(19.7))), hash21(fgB.xz.add(fgB.y.mul(7.3)))), fgF));
          });
        });
        const visorSurface = surfaceId.equal(32.0).toVar();
        const paintLike = paintSurface.or(mirrorSurface).or(iriSurface).or(satinMetalSurface).or(forgedSurface).or(gunSurface).or(holoSurface).or(hammerSurface).or(anodSurface).toVar();
        const carPaint = select(classifiedCar,
          select(paintLike, matU.carPaint, float(0.0)), matU.carPaint).toVar();
        const clearcoat = select(classifiedCar,
          select(paintSurface, select(candySurface, max(matU.clearcoat, 0.90), matU.clearcoat),
            select(mirrorSurface, max(matU.clearcoat, 0.85),
              select(iriSurface, max(matU.clearcoat, 0.70),
                select(satinMetalSurface, min(matU.clearcoat, 0.25),
                  select(matteSurface, float(0.0),
                    select(carbonSurface.or(carbonFinish), min(matU.clearcoat, 0.42),
                      select(glassSurface.or(visorSurface), matU.clearcoat.mul(0.45), float(0.0)))))))),
          matU.clearcoat).toVar();
        const metalness = select(classifiedCar,
          select(metalSurface, max(matU.metalness, 0.82),
            select(mirrorSurface, max(matU.metalness, 0.55),
              select(satinMetalSurface, max(matU.metalness, 0.60),
                select(matteSurface, float(0.0),
                  select(iriSurface, max(matU.metalness, 0.25),
              select(carbonSurface.or(carbonFinish), float(0.08),
                select(paintSurface, select(flakeSurface, max(matU.metalness, 0.35), matU.metalness), float(0.0)))))))),
          matU.metalness).toVar();
        const specular = select(classifiedCar,
          select(rubberSurface, float(0.18),
            select(sidewallSurface, float(0.35),
            select(metalSurface.or(mirrorSurface), float(1.0),
              select(satinMetalSurface, float(0.82),
                select(matteSurface, float(0.11),
                  select(carbonSurface.or(carbonFinish), float(0.48),
                    select(panelSurface, float(0.35), matU.specular))))))),
          matU.specular).toVar();
        const emissive = select(classifiedCar,
          select(emissiveSurface, max(matU.emissive, 1.0),
            select(paintLike, matU.emissive, float(0.0))),
          matU.emissive).toVar();
        If(forgedSurface, () => { clearcoat.assign(clamp(matU.clearcoat, 0.40, 0.60)); metalness.assign(0.08); specular.assign(0.48); });
        If(gunSurface, () => { clearcoat.assign(min(matU.clearcoat, 0.30)); metalness.assign(max(matU.metalness, 0.85)); specular.assign(0.90); });
        If(holoSurface, () => { clearcoat.assign(max(matU.clearcoat, 0.80)); metalness.assign(0.35); specular.assign(0.90); });
        If(velvetSurface, () => { clearcoat.assign(0.0); metalness.assign(0.0); specular.assign(0.08); });
        If(hammerSurface, () => { clearcoat.assign(min(matU.clearcoat, 0.15)); metalness.assign(0.90); specular.assign(0.90); });
        If(anodSurface, () => { clearcoat.assign(min(matU.clearcoat, 0.08)); metalness.assign(0.90); specular.assign(0.90); });
        const envSurface = carPaint.greaterThan(0.001).or(glassSurface).or(visorSurface)
          .and(clearcoat.greaterThan(0.001)).toVar();

        If(carPaint.greaterThan(0.001), () => {
          const pFade = clamp(vd.sub(18.0).div(50.0).oneMinus(), 0.0, 1.0).toVar();
          If(pFade.greaterThan(0.01), () => {
            const puv = objP.xz.mul(34.0).add(objP.y.mul(29.0));
            const fuv = objP.xz.mul(130.0).add(objP.y.mul(111.0));
            const pe = 0.09;
            const pb0 = vnoise(puv).mul(0.6).add(vnoise(fuv).mul(0.4));
            const pbx = vnoise(puv.add(vec2(pe, 0.0))).mul(0.6)
              .add(vnoise(fuv.add(vec2(pe * 3.8, 0.0))).mul(0.4)).sub(pb0);
            const pby = vnoise(puv.add(vec2(0.0, pe))).mul(0.6)
              .add(vnoise(fuv.add(vec2(0.0, pe * 3.8))).mul(0.4)).sub(pb0);
            const pT = normalize(cross(N, vec3(0.0, 1.0, 0.001)).add(vec3(1e-4)));
            const pB = cross(N, pT);
            N.assign(normalize(N.add(pT.mul(pbx).add(pB.mul(pby))
              .mul(carPaint.mul(pFade).mul(0.28)))));
          });
        });

        const Nsaa = vec3(N).toVar();

        If(carbonFinish.or(carbonSurface), () => {
          const wT = normalize(cross(N, vec3(0.0, 1.0, 0.001)).add(vec3(1e-4)));
          const wB = cross(N, wT);
          N.assign(normalize(N.add(wT.mul(wvT.x).add(wB.mul(wvT.y)).mul(0.26))));
        });

        If(hammerSurface, () => {
          N.assign(Ngeo);
          const hmF = clamp(vd.sub(8.0).div(14.0).oneMinus(), 0.0, 1.0).toVar();
          If(hmF.greaterThan(0.0), () => {
            const hmP = objP.xz.add(objP.y.mul(vec2(0.73, -0.61))).mul(90.0).toVar();
            const hmT = hmP.add(hmP.yx.mul(0.73).sin().mul(0.80)).sin();
            const hmC1 = cross(hmDP2, Ngeo), hmC2 = cross(Ngeo, hmDP1);
            const hmU = hmC1.mul(hmDUV1.x).add(hmC2.mul(hmDUV2.x));
            const hmV = hmC1.mul(hmDUV1.y).add(hmC2.mul(hmDUV2.y));
            const hmOrient = select(dot(hmDP1, hmC1).lessThan(0.0), float(-1.0), float(1.0));
            const hmScale = hmOrient.div(sqrt(max(max(dot(hmU, hmU), dot(hmV, hmV)), 1e-12)));
            const hmTilt = hmU.mul(hmT.x).add(hmV.mul(hmT.y)).mul(hmScale);
            N.assign(normalize(Ngeo.add(hmTilt.mul(hmF.mul(0.42)))));
          });
        });
        N.assign(applyMaterialNormal(surfaceId, N, wp, vd));
        if (applyMaterialTexNormal) N.assign(applyMaterialTexNormal(surfaceId, N, wp, vd, Nsaa));

        const L = vec3(U.sunDir).toVar();
        const H = normalize(L.add(V).add(vec3(1e-5))).toVar();
        const NoL = max(dot(N, L), 0.0).toVar();
        const NoV = max(dot(N, V), 1e-4).toVar();
        const NoH = max(dot(N, H), 0.0).toVar();
        const VoH = max(dot(V, H), 0.0).toVar();

        const albedo = vec3(albedoIn).toVar();

        const patchM = float(0.5).toVar();
        If(matU.detail.greaterThan(0.0), () => {
          const cr = abs(vnoise(wp.xz.mul(0.9).add(3.3)).mul(2.0).sub(1.0)).toVar();
          const crAA = max(float(0.075), fwidth(cr).add(0.015)).toVar();
          const gxz = wp.xz;
          const fineFade = clamp(vd.sub(35.0).div(90.0).oneMinus(), 0.0, 1.0);
          const n = vnoise(gxz.mul(0.35)).mul(0.60).toVar();
          If(fineFade.greaterThan(0.0), () => { n.addAssign(vnoise(gxz.mul(2.1)).mul(0.40).mul(fineFade)); });
          albedo.mulAssign(n.sub(0.5).mul(matU.detail).add(1.0));
          patchM.assign(vnoise(gxz.mul(0.055).add(9.1)));
          const pm = smoothstep(0.52, 0.72, patchM);
          albedo.mulAssign(pm.mul(0.05).mul(min(matU.detail.mul(4.0), 1.0)).oneMinus());
          const crackFade = clamp(vd.sub(18.0).div(45.0).oneMinus(), 0.0, 1.0).toVar();
          If(crackFade.greaterThan(0.01), () => {
            const crack = smoothstep(0.015, crAA, cr).oneMinus()
              .mul(smoothstep(0.40, 0.70, vnoise(gxz.mul(0.11).add(7.7))));
            albedo.mulAssign(crack.mul(0.30).mul(crackFade).mul(min(matU.detail.mul(4.0), 1.0)).oneMinus());
          });
          albedo.assign(max(albedo, vec3(0.0)));
        });

        const rough = clamp(matU.roughness, 0.04, 1.0).toVar();
        If(carbonSurface.or(carbonFinish), () => { rough.assign(max(rough, 0.52).add(weave.sub(0.5).mul(0.12))); });
        If(rubberSurface, () => { rough.assign(max(rough, 0.90)); });
        If(sidewallSurface, () => { rough.assign(clamp(rough, 0.55, 0.65)); });
        If(metalSurface, () => { rough.assign(min(rough, 0.18)); });
        If(glassSurface.or(visorSurface), () => { rough.assign(min(rough, 0.13)); });
        If(emissiveSurface, () => { rough.assign(max(rough, 0.32)); });
        If(panelSurface, () => { rough.assign(max(rough, 0.72)); });
        If(mirrorSurface, () => { rough.assign(min(rough, 0.09)); });
        If(matteSurface, () => { rough.assign(max(rough, 0.92)); });
        If(satinMetalSurface, () => { rough.assign(clamp(rough, 0.24, 0.40)); });
        If(iriSurface, () => { rough.assign(min(rough, 0.22)); });
        If(forgedSurface, () => { rough.assign(clamp(rough, 0.28, 0.42).add(fgM.sub(0.667).mul(0.20))); });
        If(gunSurface, () => { rough.assign(clamp(rough, 0.16, 0.28)); });
        If(holoSurface, () => { rough.assign(0.18); });
        If(velvetSurface, () => { rough.assign(max(rough, 0.96)); });
        If(hammerSurface, () => { rough.assign(clamp(rough, 0.24, 0.36)); });
        If(anodSurface, () => { rough.assign(clamp(rough, 0.30, 0.42)); });
        If(carbonFinish, () => {
          albedo.assign(mix(albedo.mul(0.16).add(vec3(0.030, 0.031, 0.035)), albedo.mul(0.28), 0.25));
          albedo.assign(albedo.mul(weave.mul(0.32).add(0.84)));
        }).ElseIf(carbonSurface, () => {
          albedo.assign(albedo.mul(weave.mul(0.24).add(0.88)));
        });
        If(flakeSurface, () => {
          const fkF = clamp(vd.sub(10.0).div(16.0).oneMinus(), 0.0, 1.0).toVar();
          If(fkF.greaterThan(0.0), () => {
            const fkC = floor(objP.mul(140.0));
            const fkH = hash21(fkC.xy.add(fkC.z.mul(19.7)));
            const fkS = smoothstep(0.82, 1.0, fkH);
            albedo.assign(albedo.mul(fkH.sub(0.5).mul(0.30).add(fkS.sub(0.09).mul(0.90)).mul(fkF).add(1.0)));
            specular.assign(min(specular.add(fkS.mul(0.40).mul(fkF)), 1.0));
          });
        });
        If(candySurface, () => {
          const cdL = dot(albedo, vec3(0.299, 0.587, 0.114));
          albedo.assign(max(mix(vec3(cdL), albedo, 1.35), vec3(0.0)).mul(0.62));
        });
        If(forgedSurface, () => {
          albedo.assign(mix(albedo.mul(0.10).add(vec3(0.026, 0.027, 0.03)), albedo.mul(0.22), 0.20).mul(fgM.sub(0.667).mul(0.90).add(1.0)));
        }).ElseIf(gunSurface, () => {
          albedo.assign(mix(vec3(0.2, 0.205, 0.22), albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), 0.04)).mul(0.24), 0.40));
        }).ElseIf(goldSurface, () => {
          albedo.assign(vec3(0.83, 0.65, 0.23));
        });
        If(velvetSurface, () => { albedo.mulAssign(0.65); });
        If(anodSurface, () => {
          const anHue = albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), 0.04));
          albedo.assign(anHue.mul(0.78).add(albedo.mul(0.22)));
        });
        If(finishId.equal(74.0), () => { albedo.assign(vec3(0.012, 0.012, 0.012)); });
        If(finishId.equal(84.0), () => { albedo.assign(vec3(0.016, 0.007, 0.030)); });
        const chamFlip = float(0.0).toVar();
        const chamHue = vec3(1.0).toVar();
        If(chamSurface, () => {
          const fres = clamp(dot(N, V), 0.0, 1.0).oneMinus().toVar();
          chamFlip.assign(smoothstep(0.58, 1.00, fres));
          chamHue.assign(albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), 0.04)));
        }).ElseIf(iriSurface, () => {
          const fres = clamp(dot(N, V), 0.0, 1.0).oneMinus().toVar();
          const shift = vec3(0.0, 0.33, 0.67).add(fres.mul(1.4)).mul(6.2831853)
            .cos().mul(0.5).add(0.5).toVar();
          albedo.assign(albedo.mul(mix(vec3(1.0), shift.mul(0.80).add(0.60),
            smoothstep(0.30, 0.92, fres).mul(0.40))));
        });
        If(matU.detail.greaterThan(0.0), () => {
          rough.assign(clamp(rough.add(patchM.sub(0.5).mul(0.16).mul(min(matU.detail.mul(4.0), 1.0))), 0.04, 1.0));
        });

        const packedMat = applyMaterial(surfaceId, albedo, rough, wp, Nvary, vd);
        albedo.assign(packedMat.xyz);
        rough.assign(packedMat.w);
        if (applyMaterialTex) {
          const packedTex = applyMaterialTex(surfaceId, albedo, rough, wp, Nvary, vd);
          albedo.assign(packedTex.xyz);
          rough.assign(packedTex.w);
        }

        if (trkA) {
          const packedPaint = roadMarkings(trkA, albedo, rough);
          albedo.assign(packedPaint.xyz);
          rough.assign(packedPaint.w);
        }

        const saaDx = dFdx(Nsaa), saaDy = dFdy(Nsaa);
        const saaVar = dot(saaDx, saaDx).add(dot(saaDy, saaDy)).toVar();
        rough.assign(min(1.0, sqrt(rough.mul(rough).add(saaVar.mul(0.35)))));
        const a = rough.mul(rough).toVar();
        const f0 = mix(vec3(specular.mul(0.08)), albedo, metalness).toVar();

        const wet = float(0.0).toVar();
        const puddle = float(0.0).toVar();
        const wetSheen = float(0.0).toVar();
        const wmid = surfaceId;
        const porous = select(
          wmid.equal(9.0).or(wmid.equal(6.0)).or(wmid.equal(10.0))
            .or(wmid.equal(8.0)).or(wmid.equal(11.0)),
          float(1.0), float(0.0));
        If(U.wetness.greaterThan(0.001).and(classifiedCar.not()), () => {
          const upFace = smoothstep(0.50, 0.90, N.y);
          wet.assign(U.wetness.mul(upFace));
          const pg = clamp(smoothstep(0.6, 1.0, U.wetness).mul(U.puddles), 0.0, 1.0);
          If(pg.greaterThan(0.0).and(upFace.greaterThan(0.0)).and(porous.lessThan(0.5)), () => {
            const pn = vnoise(wp.xz.mul(0.13).add(4.7)).mul(0.70).add(vnoise(wp.xz.mul(0.29).add(11.3)).mul(0.30));
            const pool = float(1.0).toVar();
            if (trkA) {
              If(trkA.z.greaterThan(0.5), () => {
                const lat = clamp(trkA.y.div(trkA.z), -1.0, 1.0);
                const rl = length(trkRightXZ);
                const downhill = select(rl.greaterThan(1e-6), dot(trkRightXZ.div(rl), Ngeo.xz).negate(), float(0.0));
                pool.assign(mix(float(0.75), float(1.25), smoothstep(0.35, 0.95, abs(lat))).mul(clamp(float(1.0).add(downhill.mul(lat).mul(4.0)), 0.5, 1.5)));
              });
            }
            const plo = pg.mul(0.38).oneMinus();
            puddle.assign(smoothstep(plo, plo.add(0.20), pn.mul(pool)).mul(pg).mul(upFace).mul(porous.oneMinus()));
          });
          If(puddle.greaterThan(0.001).and(U.rain.greaterThan(0.001)), () => {
            const ring = (sc, seed, hseed, rate) => {
              const rp = wp.xz.mul(sc).add(seed);
              const ci = floor(rp), cf = fract(rp).sub(0.5);
              const hh = hash21(ci.add(hseed));
              const t = fract(U.time.mul(rate).add(hh));
              const r = length(cf).add(1e-4);
              const ph = r.sub(t.mul(0.45)).mul(40.0);
              const amp = t.oneMinus().mul(t).mul(4.0).mul(exp(r.mul(-5.0))).mul(step(r, t.mul(0.45).add(0.08)));
              return cos(ph).mul(cf.div(r)).mul(amp);
            };
            const rg = ring(1.7, 0.0, 0.0, 0.8).add(ring(2.9, 7.3, 19.0, 1.3)).toVar();
            N.assign(normalize(N.add(vec3(rg.x, 0.0, rg.y).mul(U.rain.mul(puddle).mul(0.10)))));
          });
          const absorbRoad = clamp(U.wetDark.mul(0.58).oneMinus(), 0.0, 1.0);
          const absorb = mix(absorbRoad, absorbRoad.mul(0.66), porous);
          albedo.mulAssign(mix(float(1.0), absorb, wet));
          albedo.mulAssign(mix(float(1.0), float(0.40), puddle));
          wetSheen.assign(wet.mul(porous.oneMinus()));
          rough.assign(mix(rough, 0.30, wetSheen));
          rough.assign(mix(rough, 0.02, puddle));
          a.assign(rough.mul(rough));
          f0.assign(mix(f0, vec3(0.04), wetSheen.mul(0.6)));
        });
        If(U.wetness.greaterThan(0.001).and(classifiedCar), () => {
          If(carbonSurface.or(carbonFinish).or(rubberSurface).or(sidewallSurface).or(matteSurface).or(panelSurface).or(velvetSurface), () => {
            albedo.mulAssign(U.wetness.mul(0.20).oneMinus());
            rough.mulAssign(U.wetness.mul(0.25).oneMinus());
            a.assign(rough.mul(rough));
            f0.assign(mix(f0, max(f0, vec3(0.04)), U.wetness.mul(0.6)));
          });
        });

        const gpao = select(matU.carPaint.greaterThan(0.5).and(rubberSurface.not()).and(sidewallSurface.not()),
          smoothstep(0.02, 0.40, objP.y).oneMinus(), float(0.0)).toVar();
        const amb = mix(vec3(U.ambGround).mul(gpao.mul(0.50).oneMinus()),
          vec3(U.ambSky).mul(gpao.mul(0.06).oneMinus()), N.y.mul(0.5).add(0.5)).toVar();

        const shadow = float(1.0).toVar();
        If(NoL.greaterThan(0.0).or(clearcoat.greaterThan(0.001)), () => {
          if (!sampleShadow) { shadow.assign(cloudShadow(wp).mul(U.cloudShadowDim).oneMinus()); return; }
          shadow.assign(sampleShadow(wp, Nvary));
          If(shadow.greaterThan(0.0), () => { shadow.assign(shadow.mul(cloudShadow(wp).mul(U.cloudShadowDim).oneMinus())); });
        });
        const litNoL = NoL.mul(shadow).mul(U.keyMul).toVar();

        const color = albedo.mul(amb.add(vec3(U.sunColor).mul(litNoL).mul(metalness.oneMinus()))).toVar();
        If(U.shadowTintAmt.greaterThan(0.001), () => {
          color.mulAssign(mix(vec3(1.0), vec3(0.90, 0.96, 1.12),
            U.shadowTintAmt.mul(clamp(litNoL.oneMinus(), 0.0, 1.0))));
        });

        const lampFogAcc = vec3(0.0).toVar();

        const bUv = wp.xz.sub(U.bakeOrigin).div(U.bakeSize).toVar();
        const bIn = bUv.x.greaterThan(0.0).and(bUv.x.lessThan(1.0))
          .and(bUv.y.greaterThan(0.0)).and(bUv.y.lessThan(1.0));
        const bakeW = float(0.0).toVar();
        If(U.bakeOn.greaterThan(0.5).and(bIn).and(N.y.greaterThan(0.55)), () => {
          const bG = bUv.mul(U.bakeGrid.xy).toVar();
          const bTile = clamp(floor(bG), vec2(0.0), max(U.bakeGrid.xy.sub(1.0), vec2(0.0))).toVar();
          const bSlot = BAKE_IDX_NODE.sample(bTile.add(0.5).div(U.bakeGrid.xy)).level(0).xy.toVar();
          If(bSlot.x.greaterThanEqual(0.0), () => {
            const bUvD = bSlot.add(bG.sub(bTile).mul(U.bakeGrid.z)).add(1.0).div(max(U.bakeAtlas, vec2(1.0))).toVar();
            const bT = BAKE_NODE.sample(bUvD).level(0).toVar();
            const bE = bT.rgb.mul(U.bakeScale).toVar();
            const bB = BAKE_NODE.sample(bUvD.add(vec2(0.0, 0.5))).level(0).rgb.mul(U.bakeScale).toVar();
            const bOnY = smoothstep(0.75, 2.5, abs(wp.y.sub(bT.a))).oneMinus();
            bakeW.assign(smoothstep(0.55, 0.85, N.y).mul(bOnY));
            color.addAssign(albedo.mul(bE).mul(bakeW)
              .mul(metalness.oneMinus()).mul(wetSheen.mul(0.85).oneMinus()));
            color.addAssign(albedo.mul(bB).mul(U.bounceK.mul(bakeW)).mul(metalness.oneMinus()));
          });
        });

        const PC = (LGRID && !instanced) ? (() => {
          const on = chunked ? U.lgOn.greaterThan(0.5)
            : U.lgOn.greaterThan(0.5).and(U.lgRoad.greaterThan(0.5)).and(matU.lgRoad.greaterThan(0.5));
          const cx = floor(wp.x.div(U.lgCell)).add(1024.0).sub(U.lgOrigin.x);
          const cz = floor(wp.z.div(U.lgCell)).add(1024.0).sub(U.lgOrigin.y);
          const inside = on.and(cx.greaterThanEqual(0.0)).and(cx.lessThan(U.lgSize.x))
                           .and(cz.greaterThanEqual(0.0)).and(cz.lessThan(U.lgSize.y));
          const base = float(0.0).toVar();
          const cnt = float(0.0).toVar();
          If(inside, () => {
            const g = textureLoad(LG_TEX.grid, ivec2(cx, cz));
            base.assign(g.x);
            cnt.assign(g.y);
          });
          return { base, n: cnt, use: cnt.greaterThan(0.5) };
        })() : null;

        const lampRow = PC ? (i) => {
          const k = PC.base.add(float(i)), r = floor(k.div(U.lgIdxW));
          return select(PC.use, textureLoad(LG_TEX.idx, ivec2(k.sub(r.mul(U.lgIdxW)), r)).r, float(0.0)).toVar();
        } : null;
        const _fetch = (row, col) => textureLoad(LG_TEX.lamp, ivec2(float(col), row));
        const LGeo = PC ? ((i, r) => select(PC.use, _fetch(r, 3), U.lampGeo.element(i)))
                        : ((i) => U.lampGeo.element(i));
        const LPos = PC ? ((i, r) => select(PC.use, _fetch(r, 0).xyz, U.lampPos.element(i)))
                        : ((i) => U.lampPos.element(i));
        const LCol = PC ? ((i, r) => select(PC.use, _fetch(r, 1).xyz, U.lampCol.element(i)))
                        : ((i) => U.lampCol.element(i));
        const LDirW = PC ? ((i, r) => select(PC.use, _fetch(r, 2), U.lampDir.element(i)))
                         : ((i) => U.lampDir.element(i));
        const lampN = PC ? select(PC.use, min(PC.n, U.lampCap), U.numLights) : U.numLights;
        const lampViewRoot = float(-1.0).toVar();
        const lampCoatViewRoot = float(-1.0).toVar();

        Loop({ start: int(0), end: int(MAX_LIGHTS), type: "int", condition: "<" }, ({ i }) => {
          If(float(i).greaterThanEqual(lampN), () => { Break(); });
          const row = lampRow ? lampRow(i) : null;
          const geo = LGeo(i, row);
          const LP = LPos(i, row).sub(wp).toVar();
          const rad = geo.x;
          If(dot(LP, LP).lessThan(rad.mul(rad)), () => {
            const dist = length(LP).toVar();
            const Ld = LP.div(max(dist, 1e-3)).toVar();
            const dn = dist.div(rad);
            const win = clamp(dn.mul(dn).mul(dn).mul(dn).oneMinus(), 0.0, 1.0);
            const distC = max(dist, U.lampNearClamp);
            const att = win.mul(win).div(distC.mul(distC).add(1.0)).toVar();
            If(att.greaterThanEqual(1e-6), () => {
              const lCol = LCol(i, row).toVar(), lDir = LDirW(i, row).toVar();
              const cd = dot(Ld.negate(), lDir.xyz);
              const beam = smoothstep(geo.z, geo.y, cd).toVar();
              const spotD = mix(geo.w, float(1.0), beam);
              const spotS = mix(mix(float(0.16), float(0.30), wetSheen).mul(U.lampWallSpill), float(1.0), beam);
              If(U.lampFog.greaterThan(0.0), () => {
                lampFogAcc.addAssign(lCol.mul(att.mul(mix(float(0.35), float(1.0), beam))));
              });
              const NoLl = max(dot(N, Ld), 0.0).toVar();
              const lampSh = float(1.0).toVar();
              if (lampShadowOn) {
                If(U.lampShadowOn.greaterThan(0.5).and(float(i).equal(U.lampShadowIdx)).and(NoLl.greaterThan(0.0))
                   .and(PC ? PC.use.not() : float(1.0).greaterThan(0.5)), () => {
                  const lpc = U.lampShadowVP.mul(vec4(wp, 1.0)).toVar();
                  If(lpc.w.greaterThan(0.0), () => {
                    const lps = lpc.xyz.div(lpc.w).mul(0.5).add(0.5).toVar();
                    If(lps.x.greaterThan(0.002).and(lps.x.lessThan(0.998))
                      .and(lps.y.greaterThan(0.002)).and(lps.y.lessThan(0.998))
                      .and(lps.z.lessThan(1.0)), () => {
                      const lpz = lps.z.sub(float(0.0012).add(float(0.004).mul(NoLl.oneMinus()))).toVar();
                      const lpt = 1.5 / (SHD.lampSize || 512);
                      const lampT = shadowMapNode(SHD.lampTex);
                      const ltap = (px, py) =>
                        lampT.sample(flipUV(lps.xy.add(vec2(px, py)))).compare(lpz);
                      lampSh.assign(ltap(-lpt, -lpt).add(ltap(lpt, -lpt))
                        .add(ltap(-lpt, lpt)).add(ltap(lpt, lpt)).mul(0.25));
                    });
                  });
                });
              }
              const bakeWl = bakeW.mul(lDir.w.oneMinus()).toVar();
              color.addAssign(albedo.mul(lCol.mul(lampSh.mul(bakeWl.oneMinus()))
                .sub(vec3(U.bakeShCol).mul(lampSh.oneMinus().mul(bakeWl))))
                .mul(att.mul(spotD)).mul(NoLl)
                .mul(metalness.oneMinus()).mul(wetSheen.mul(0.85).oneMinus()));
              If(U.bounceK.greaterThan(0.0), () => {
                color.addAssign(albedo.mul(lCol)
                  .mul(att.mul(U.bounceK).mul(NoLl.mul(0.45).add(0.55)))
                  .mul(metalness.oneMinus()).mul(bakeWl.oneMinus()));
              });
              If(NoLl.greaterThan(0.0), () => {
                If(lampViewRoot.lessThan(0.0), () => {
                  lampViewRoot.assign(smithViewRoot(NoV, a));
                });
                const Hl = normalize(Ld.add(V));
                const NoHl = max(dot(N, Hl), 0.0).toVar();
                const VoHl = max(dot(V, Hl), 0.0).toVar();
                const Dl = D_GGX(NoHl, a);
                const Vl = V_SmithGGX(NoV, NoLl, a, lampViewRoot);
                const Fll = F_Schlick(VoHl, f0, clamp(rough.oneMinus(), 0.0, 1.0));
                const radianceS = lCol.mul(att.mul(spotS).mul(lampSh)).toVar();
                const lspec = Fll.mul(Dl.mul(Vl)).mul(radianceS).mul(NoLl).toVar();
                color.addAssign(lspec.div(lspec.add(1.0)));
                If(clearcoat.greaterThan(0.001), () => {
                  If(lampCoatViewRoot.lessThan(0.0), () => {
                    lampCoatViewRoot.assign(smithViewRoot(NoV, float(0.01)));
                  });
                  const Dcc = D_GGX(NoHl, float(0.03));
                  const Vcc = V_SmithGGX(NoV, NoLl, float(0.01), lampCoatViewRoot);
                  const Fcc = F_Schlick(VoHl, vec3(0.05), float(1.0)).x;
                  const ccl = radianceS.mul(Dcc.mul(Vcc).mul(Fcc)).mul(NoLl).mul(clearcoat).toVar();
                  color.addAssign(ccl.mul(2.2).div(ccl.add(2.2)));
                });
              });
            });
          });
        });
        color.assign(max(color, vec3(0.0)));

        If(NoL.greaterThan(0.0), () => {
          const D = D_GGX(NoH, a);
          const Vis = V_SmithGGX(NoV, NoL, a, smithViewRoot(NoV, a));
          const F = F_Schlick(VoH, f0, clamp(rough.oneMinus(), 0.0, 1.0));
          const specCol = F.mul(D.mul(Vis)).mul(vec3(U.sunColor)).mul(litNoL).toVar();
          specCol.assign(specCol.div(specCol.div(U.specKnee).add(1.0)));
          color.addAssign(specCol);
        });

        const ccSaaVar = float(0.0).toVar();
        If(matU.clearcoat.greaterThan(0.001), () => {
          const ccDx = dFdx(Ngeo), ccDy = dFdy(Ngeo);
          ccSaaVar.assign(dot(ccDx, ccDx).add(dot(ccDy, ccDy)));
        });

        If(clearcoat.greaterThan(0.001), () => {
          const Hg = normalize(L.add(V));
          const NoHg = max(dot(Ngeo, Hg), 0.0);
          const NoVg = max(dot(Ngeo, V), 1e-4);
          const NoLg = max(dot(Ngeo, L), 0.0);
          If(NoLg.greaterThan(0.0), () => {
            const ccA = min(sqrt(ccSaaVar.mul(0.25).add(0.035 * 0.035)), 0.30);
            const Dc = D_GGX(NoHg, ccA);
            const Vc = V_SmithGGX(NoVg, NoLg, ccA, smithViewRoot(NoVg, ccA));
            const Fc = F_Schlick(max(dot(V, Hg), 0.0), vec3(0.05), float(1.0)).x;
            const ccCol = vec3(U.sunColor).mul(Dc.mul(Vc).mul(Fc)).mul(NoLg)
              .mul(shadow).mul(U.keyMul).mul(clearcoat).toVar();
            ccCol.assign(ccCol.mul(2.6).div(ccCol.add(2.6)));
            color.addAssign(ccCol);
          });
        });

        const ccTrans = float(1.0).toVar();
        If(envSurface, () => {
          const Rg = reflect(V.negate(), Ngeo).toVar();
          const NoVc = max(dot(Ngeo, V), 1e-4);
          const ccFb = NoVc.oneMinus();
          const ccF = ccFb.mul(ccFb);
          const probeLive = clamp(U.envStr, 0.0, 1.0);
          const baseRefl = select(visorSurface, mix(float(0.05), float(0.16), probeLive),
                                                mix(float(0.14), float(0.72), probeLive));
          const envW = clamp(clearcoat.mul(baseRefl.add(ccF.mul(0.28))).mul(rough.mul(0.25).oneMinus()), 0.0, 0.96);
          const horiz = smoothstep(-0.12, 0.30, Rg.y);
          const skyR = mix(vec3(U.skyHorizon).mul(1.2), vec3(U.skyZenith), sqrt(max(Rg.y, 0.0)));
          const envCC = mix(vec3(U.ambGround).mul(0.6), skyR, horiz).toVar();
          if (envCubeNode) {
            const cubeRefl = cubeTexture(envCubeNode, Rg, rough.mul(2.5)).rgb;
            envCC.assign(mix(envCC, cubeRefl, probeLive));
          }
          If(U.carSunGlint.notEqual(0.0), () => {
            const ccDiscA = sqrt(ccSaaVar.mul(0.25).add(0.0705 * 0.0705));
            const ccDiscExp = max(float(2.0).div(ccDiscA.mul(ccDiscA)).sub(2.0), 32.0);
            envCC.addAssign(vec3(U.sunColor)
              .mul(pow(max(dot(Rg, U.sunDir), 1e-4), ccDiscExp))
              .mul(U.carSunGlint).mul(shadow).mul(U.keyMul));
          });
          ccTrans.assign(envW.mul(0.94).oneMinus());
          color.mulAssign(ccTrans);
          const addCC = envCC.mul(envW).toVar();
          If(tintedSurface, () => {
            addCC.mulAssign(mix(vec3(1.0), albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), 0.04)), 0.88));
          });
          If(goldSurface, () => { addCC.mulAssign(mix(vec3(1.0), vec3(1.0, 0.78, 0.27), 0.88)); });
          If(candySurface, () => {
            const cdHue = albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), 0.04)).toVar();
            addCC.mulAssign(mix(vec3(1.0), cdHue, 0.55));
            color.addAssign(cdHue.mul(ccF).mul(0.45));
          });
          color.addAssign(addCC.div(addCC.mul(0.35).add(1.0)));
        });

        If(carPaint.greaterThan(0.001).and(litNoL.greaterThan(0.0)).and(matU.sparkle.greaterThan(0.001))
          .and(U.carSparkle.notEqual(0.0)), () => {
          const spFade = clamp(vd.sub(14.0).div(30.0).oneMinus(), 0.0, 1.0).mul(smoothstep(1.5, 4.0, vd)).mul(matU.sparkle).toVar();
          spFade.mulAssign(smoothstep(0.06, 0.22, max(albedo.r, max(albedo.g, albedo.b))));
          If(spFade.greaterThan(0.01), () => {
            const cell = floor(objP.mul(220.0)).toVar();
            const h1 = hash21(cell.xy.add(cell.z.mul(19.7)));
            const h2 = hash21(cell.yz.add(cell.x.mul(7.3)));
            const nN = select(length(Ngeo).greaterThan(1e-4), normalize(Ngeo), vec3(0.0, 1.0, 0.0)).toVar();
            const fT = normalize(cross(nN, vec3(0.0, 1.0, 0.001)).add(vec3(1e-4)));
            const fB = cross(nN, fT);
            const gN = normalize(nN.add(fT.mul(h1.mul(2.0).sub(1.0))
              .add(fB.mul(h2.mul(2.0).sub(1.0))).mul(0.5)));
            const glint = smoothstep(0.990, 1.0, dot(gN, H));
            color.addAssign(vec3(U.sunColor).mul(litNoL).mul(glint)
              .mul(U.carSparkle).mul(carPaint).mul(spFade));
          });
        });

        const envBlend = clamp(float(0.40).sub(rough).div(0.30), 0.0, 1.0).mul(specular).toVar();
        const envCubeTap = envCubeNode ? vec4(0.0).toVar() : null;
        envBlend.assign(max(envBlend, max(wetSheen.mul(0.55), puddle.mul(0.90))));
        If(envBlend.greaterThan(0.001), () => {
          const R = reflect(V.negate(), N).toVar();
          const skyT = pow(max(R.y, 1e-4), 0.40);
          const envColor = mix(vec3(U.skyHorizon), vec3(U.skyZenith), skyT).toVar();
          if (envCubeNode) {
            If(U.envStr.greaterThan(0.001), () => {
              const probeW = clamp(U.envStr, 0.0, 1.0)
                .mul(clamp(vd.sub(60.0).div(90.0).oneMinus(), 0.0, 1.0)).toVar();
              If(probeW.greaterThan(0.001), () => {
                envCubeTap.assign(vec4(cubeTexture(envCubeNode, R, rough.mul(2.5)).rgb, probeW));
                envColor.assign(mix(envColor, envCubeTap.rgb, envCubeTap.w));
              });
            });
          }
          const envSunAlign = max(dot(R, U.sunDir), 0.0).toVar();
          envColor.assign(mix(envColor, envColor.mul(U.sunColor).mul(1.15),
            envSunAlign.mul(envSunAlign).mul(rough.oneMinus())));
          If(wetSheen.oneMinus().mul(U.windowSunFlash).mul(U.keyMul).greaterThan(0.001), () => {
            envColor.addAssign(vec3(U.sunColor).mul(pow(max(envSunAlign, 1e-4), 22.0))
              .mul(wetSheen.oneMinus()).mul(envBlend).mul(0.6).mul(U.windowSunFlash).mul(U.keyMul));
          });
          const roughDamp = rough.mul(0.7).oneMinus();
          const envFresnel = F_Schlick(max(dot(N, V), 0.0), vec3(0.04), float(1.0)).x.toVar();
          envFresnel.assign(mix(envFresnel, envFresnel.mul(envFresnel), wetSheen.mul(0.35)));
          const envWet = envColor.mul(wetSheen.mul(0.45).mul(puddle.mul(0.5).oneMinus()).oneMinus());
          const envAdd = envWet.mul(envFresnel).mul(envBlend).mul(roughDamp).mul(metalness.oneMinus()).toVar();
          const envM = max(max(envAdd.r, envAdd.g), envAdd.b);
          color.addAssign(envAdd.div(envM.add(1.0)));
        });

        If(metalSurface.or(satinMetalSurface).or(mirrorSurface).or(gunSurface).or(hammerSurface).or(anodSurface), () => {
          const Rm = reflect(V.negate(), N).toVar();
          const skyM = mix(vec3(U.skyHorizon).mul(1.2), vec3(U.skyZenith), sqrt(max(Rm.y, 0.0)));
          const envMet = mix(vec3(U.ambGround).mul(0.6), skyM, smoothstep(-0.12, 0.30, Rm.y)).toVar();
          if (envCubeNode) {
            If(U.envStr.greaterThan(0.001), () => {
              const cubeM = select(envCubeTap.w.greaterThan(0.0), envCubeTap.rgb, cubeTexture(envCubeNode, Rm, rough.mul(2.5)).rgb);
              envMet.assign(mix(envMet, cubeM, clamp(U.envStr, 0.0, 1.0)));
            });
          }
          const metAdd = envMet.mul(F_Schlick(NoV, albedo, rough.mul(0.5).oneMinus()))
            .mul(metalness.mul(rough.mul(0.7).oneMinus()).mul(ccTrans)).toVar();
          If(metalSurface.or(gunSurface), () => {
            const metLum = dot(albedo, vec3(0.299, 0.587, 0.114));
            metAdd.mulAssign(clamp(metLum.mul(4.0), 0.0, 1.0).oneMinus().mul(0.32).add(1.0));
          });
          color.addAssign(metAdd.div(max(max(metAdd.r, metAdd.g), metAdd.b).add(1.0)));
        });
        If(tintedSurface, () => {
          color.mulAssign(albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), 0.04)));
        });
        If(goldSurface, () => { color.mulAssign(vec3(1.0, 0.78, 0.27)); });
        If(chamSurface, () => {
          color.mulAssign(mix(chamHue, vec3(0.25, 0.55, 1.0), chamFlip.mul(0.90)));
        });
        If(holoSurface, () => {
          const hoF = clamp(NoV.oneMinus(), 0.0, 1.0).toVar();
          const hoS = vec3(0.0, 0.33, 0.67).add(hoF.mul(1.65)).mul(6.2831853).cos().mul(0.5).add(0.5);
          const hoPeak = max(max(max(color.r, color.g), color.b), 0.0).toVar();
          color.assign(mix(color, hoS.mul(0.75).add(0.25).mul(hoPeak), mix(float(0.28), float(0.85), smoothstep(0.05, 0.60, hoF))));
        });
        If(velvetSurface, () => {
          const veF = clamp(NoV.oneMinus(), 0.0, 1.0).toVar();
          color.mulAssign(veF.mul(veF).mul(1.50).add(1.0));
        });
        If(anodSurface, () => {
          const anHue = albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), 0.04));
          color.mulAssign(mix(vec3(1.0), anHue, 0.72));
        });
        if (fx) If(matU.carFinish.greaterThan(0.5).and(finishId.greaterThanEqual(60.0)).and(finishId.lessThanEqual(85.0)), () => {
          const pvHue = albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), 0.04)).toVar();
          const pvG = clamp(dot(Ngeo, V), 0.0, 1.0).oneMinus().toVar();
          const pvG2 = pvG.mul(pvG).toVar();
          const pvL = dot(color, vec3(0.299, 0.587, 0.114)).toVar();
          const pvA = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05).toVar();
          const pvLit = pvL.div(pvA).toVar();
          const pvSun = max(dot(Ngeo, U.sunDir), 0.0).toVar();
          const pvNH = max(dot(Ngeo, normalize(U.sunDir.add(V))), 0.0).toVar();
          const pvEdge = fnCrease.oneMinus().toVar();
          If(finishId.equal(60.0), () => {
            const film0 = (cos(vec3(0.0, 0.33, 0.67).add(pvG.mul(0.9)).add(objP.y.mul(1.3)).add(objP.z.mul(0.32)).add(objP.x.mul(0.4)).mul(6.2831853)).mul(0.5).add(0.5)).toVar();
            const film = (mix(vec3(dot(film0, vec3(0.3333))), film0, 0.75)).toVar();
            color.assign(mix(color, color.mul(film).mul(2.4), smoothstep(0.05, 0.6, pvG).mul(0.65).add(0.35).mul(mix(float(0.35), float(1.0), pvEdge))));
          }).ElseIf(finishId.equal(61.0), () => {
            const frC = (floor(objP.mul(90.0))).toVar();
            const frF = (clamp(float(0.5).div(fnPx.mul(90.0)).sub(0.5), 0.0, 1.0)).toVar();
            color.assign(min(mix(color, vec3(pvL), 0.6).mul(vec3(0.80, 0.82, 0.86)).add(0.02)
              .mul(hash21(frC.xy.add(frC.z.mul(19.7))).sub(0.5).mul(0.35).mul(frF).add(1.0)), vec3(0.26)).mul(vec3(0.90, 0.94, 1.0)));
            color.addAssign(vec3(U.sunColor).mul(mix(pvHue, vec3(1.0), 0.6)).mul(pvA.mul(0.25).add(0.03)).mul(pow(pvNH, 2.0)).mul(pvSun));
            color.addAssign(vec3(U.ambSky).add(vec3(U.sunColor).mul(0.25)).mul(vec3(0.78, 0.80, 0.86)).mul(smoothstep(0.15, 0.8, pvG).mul(0.40).mul(pvEdge)));
          }).ElseIf(finishId.equal(62.0), () => {
            const flS = (max(pvHue.r, max(pvHue.g, pvHue.b)).sub(min(pvHue.r, min(pvHue.g, pvHue.b)))).toVar();
            const flH = (mix(vec3(0.80, 1.0, 0.06), pow(pvHue, vec3(2.6)), smoothstep(0.20, 0.50, flS))).toVar();
            const flK = (smoothstep(0.05, 0.14, pvA)).toVar();
            color.assign(color.mul(mix(vec3(1.0), flH, flK.mul(0.6)))
              .add(flH.mul(vec3(U.ambSky).mul(1.6).add(vec3(U.sunColor).mul(pvSun.mul(0.55))).add(0.22)).mul(flK)));
          }).ElseIf(finishId.equal(63.0), () => {
            const t = (clamp(float(0.5).sub(objP.z.mul(0.30)).add(pvG.mul(0.10)), 0.0, 1.0)).toVar();
            const ox = vec3(0.85, 0.86, 0.88).toVar();
            ox.assign(mix(ox, vec3(0.95, 0.82, 0.52), smoothstep(0.10, 0.25, t)));
            ox.assign(mix(ox, vec3(0.92, 0.66, 0.30), smoothstep(0.25, 0.40, t)));
            ox.assign(mix(ox, vec3(0.72, 0.42, 0.40), smoothstep(0.40, 0.55, t)));
            ox.assign(mix(ox, vec3(0.50, 0.30, 0.75), smoothstep(0.55, 0.70, t)));
            ox.assign(mix(ox, vec3(0.25, 0.45, 0.95), smoothstep(0.70, 0.88, t)));
            color.assign(vec3(min(pvLit, 2.5)).mul(ox).mul(0.85));
          }).ElseIf(finishId.equal(65.0), () => {
            const abY = (smoothstep(-0.3, 0.7, Ngeo.y)).toVar();
            const abB = (hash21(vec2(floor(objP.y.mul(320.0)), floor(objP.x.mul(320.0))))).toVar();
            const abF = (clamp(float(0.5).div(fnPx.mul(320.0)).sub(0.5), 0.0, 1.0)).toVar();
            color.assign(vec3(min(pvLit, 3.0)).mul(vec3(0.60, 0.58, 0.54)).mul(mix(float(0.45), float(1.25), abY)).mul(abB.sub(0.5).mul(0.22).mul(abF).add(1.0))
              .add(vec3(U.ambSky).mul(0.6).add(vec3(U.sunColor).mul(0.2)).mul(vec3(0.95, 0.97, 1.0)).mul(smoothstep(0.35, 0.9, pvG).mul(abY).mul(0.5))));
          }).ElseIf(finishId.equal(66.0), () => {
            color.assign(vec3(pvL).mul(1.7).add(0.030).mul(vec3(0.66, 0.68, 0.74))
              .add(vec3(U.sunColor).mul(vec3(0.80, 0.84, 0.92)).mul(pow(pvNH, 4.0).mul(pvSun).mul(0.22))));
          }).ElseIf(finishId.equal(67.0), () => {
            const fvN = (abs(Ngeo)).toVar();
            const fvC = objP.y.toVar();
            If(fvN.y.greaterThan(max(fvN.x, fvN.z)), () => { fvC.assign(objP.x); });
            const fvS = (sin(fvC.mul(70.0).add(sin(objP.z.mul(1.7).add(fvC.mul(9.0))).mul(1.2))).mul(0.5).add(0.5)).toVar();
            const fvBr = (smoothstep(-0.6, 0.2, sin(objP.z.mul(4.0).add(fvC.mul(37.0))))).toVar();
            const fvPer = (float(0.090).div(fnPx)).toVar();
            const fv = (mix(smoothstep(0.50, 0.80, fvS).mul(fvBr), float(0.30), smoothstepDown(3.0, 1.5, fvPer)).mul(smoothstepDown(1.4, 0.2, objP.z))).toVar();
            const fvGlow = (mix(vec3(0.78, 1.0, 0.30), vec3(0.05, 0.14, 0.0), smoothstep(0.35, 0.75, pvA))
              .mul(vec3(U.ambSky).mul(2.5).add(vec3(U.sunColor).mul(pvSun.mul(0.6))).add(0.15))).toVar();
            color.assign(mix(color, fvGlow, fv));
          }).ElseIf(finishId.equal(68.0), () => {
            const cfW = (objP.xz.mul(120.0).add(objP.y.mul(120.0))).toVar();
            const cfWv = (sin(cfW.x).mul(sin(cfW.y)).mul(clamp(float(0.052).div(fnPx).mul(0.5).sub(1.0), 0.0, 1.0)).mul(0.5).add(0.5)).toVar();
            const cfN = (sin(objP.z.mul(9.0).add(sin(objP.x.mul(13.0)).mul(1.5))).mul(0.5).add(sin(objP.z.mul(23.0).add(objP.x.mul(7.0))).mul(0.25))
              .add(sin(objP.z.mul(61.0).add(objP.x.mul(29.0))).mul(0.35)).add(hash21(floor(objP.zx.mul(40.0))).sub(0.5).mul(0.6))).toVar();
            const cfM = (smoothstep(0.585, 0.615, objP.y.add(cfN.mul(0.08)))).toVar();
            const cfC = (vec3(min(pvLit, 3.0).mul(0.11)).mul(cfWv.mul(0.76).add(0.62)).mul(vec3(0.95, 0.97, 1.05))
              .add(vec3(U.sunColor).mul(pow(pvNH, 6.0).mul(pvSun).mul(cfWv.add(0.5)).mul(0.30)))).toVar();
            color.assign(mix(cfC, color, cfM));
          }).ElseIf(finishId.equal(69.0), () => {
            const sfT = (clamp(float(0.5).sub(objP.z.mul(0.28)), 0.0, 1.0)).toVar();
            const sfN = (abs(Ngeo)).toVar();
            const sfUV = vec2(objP.x, objP.y).toVar();
            If(sfN.y.greaterThan(max(sfN.x, sfN.z)), () => { sfUV.assign(vec2(objP.z, objP.x)); })
              .ElseIf(sfN.x.greaterThan(sfN.z), () => { sfUV.assign(vec2(objP.z, objP.y)); });
            const sfR = (smoothstep(0.15, 0.85, sfT).oneMinus().mul(0.62)).toVar();
            const sfW = (max(fnPx.mul(11.0), 0.02)).toVar();
            const sfDot0 = (smoothstepDown(sfR.add(sfW), sfR.sub(sfW), length(fract(sfUV.mul(11.0)).sub(0.5)))).toVar();
            const sfDot = (mix(sfDot0, min(sfR.mul(sfR).mul(3.14159), 1.0), smoothstep(0.25, 0.45, sfW))).toVar();
            const sfS = (max(sfDot, smoothstep(0.08, 0.18, sfT).oneMinus())).toVar();
            color.assign(mix(vec3(min(pvLit, 3.0).mul(0.035)), vec3(pvLit).mul(vec3(0.70, 0.72, 0.76)), sfS));
          }).ElseIf(finishId.equal(70.0), () => {
            const mfF = (smoothstep(0.04, 0.30, pvG).mul(pvEdge)).toVar();
            const mfFace = (max(mix(vec3(pvL), color, 1.4), vec3(0.0)).mul(1.7)).toVar();
            const mfFlop = (mix(color.mul(0.08), vec3(pvL.mul(0.12)).mul(vec3(0.80, 0.84, 0.92)), smoothstep(0.40, 0.80, pvA))).toVar();
            const mfC = (floor(objP.mul(150.0))).toVar();
            const mfH = (hash21(mfC.xy.add(mfC.z.mul(17.3)))).toVar();
            const mfSp = (step(0.80, mfH).mul(smoothstep(0.6, 1.0, fract(mfH.mul(41.0).add(pvNH.mul(3.0)))))).toVar();
            color.assign(mix(mfFace, mfFlop, mfF).add(vec3(U.sunColor).mul(pvSun.mul(1.2).mul(mix(float(0.03), mfSp, clamp(float(0.5).div(fnPx.mul(150.0)).sub(0.5), 0.0, 1.0))))));
          }).ElseIf(finishId.greaterThanEqual(81.0).and(finishId.lessThanEqual(85.0)), () => {
            const bL = pvA;
            const bLit = (min(pvLit, 1.6)).toVar();
            const bSun = pvSun;
            const bNH = pvNH;
            If(finishId.equal(81.0), () => {
              const gpK0 = (vec3(1.0).sub(pvHue)).toVar();
              const gpK = (gpK0.div(max(max(gpK0.r, max(gpK0.g, gpK0.b)), 0.04))).toVar();
              const gpS = (max(pvHue.r, max(pvHue.g, pvHue.b)).sub(min(pvHue.r, min(pvHue.g, pvHue.b)))).toVar();
              const gpC = (mix(pvHue, mix(vec3(0.55, 0.40, 1.0), gpK, smoothstep(0.15, 0.5, gpS)), 0.85)).toVar();
              const gpE = (smoothstep(0.15, 0.55, pvG).mul(smoothstep(0.85, 1.0, pvG).oneMinus()).mul(bSun.mul(0.55).add(0.45))
                .add(pow(bNH, 6.0).mul(0.6)).mul(pvEdge)).toVar();
              color.assign(mix(color, vec3(bLit).mul(gpC).mul(0.85), clamp(gpE, 0.0, 1.0).mul(0.75)));
            }).ElseIf(finishId.equal(82.0), () => {
              const xC = (floor(objP.mul(75.0))).toVar();
              const xH = (hash21(xC.xy.add(xC.z.mul(23.1)))).toVar();
              const xF = (clamp(float(0.5).div(fnPx.mul(75.0)).sub(0.5), 0.0, 1.0)).toVar();
              const xS = (step(0.45, xH).mul(smoothstep(0.70, 1.0, fract(xH.mul(53.0).add(bNH.mul(4.0)))))).toVar();
              color.assign(color.mul(mix(float(1.04), float(0.80), smoothstep(0.45, 0.85, bL).mul(xF)))
                .add(vec3(U.sunColor).mul(bSun.mul(2.5).add(0.5)).add(vec3(U.ambSky).mul(2.0)).mul(vec3(0.92, 0.96, 1.0)).mul(mix(float(0.08), xS.mul(3.0), xF)))
                .add(vec3(U.sunColor).mul(pow(bNH, 30.0).mul(bSun).mul(0.55))));
            }).ElseIf(finishId.equal(83.0), () => {
              const mcT = (clamp(pvG.mul(1.05).add(objP.y.mul(0.30)).sub(objP.z.mul(0.06)).add(0.04), 0.0, 1.0)).toVar();
              const mc = mix(vec3(0.05, 0.80, 0.30), vec3(0.06, 0.25, 1.0), smoothstep(0.05, 0.45, mcT)).toVar();
              mc.assign(mix(mc, vec3(0.50, 0.05, 0.80), smoothstep(0.38, 0.68, mcT)));
              mc.assign(mix(mc, vec3(0.012, 0.008, 0.02), smoothstep(0.62, 0.88, mcT)));
              color.assign(vec3(min(pvLit, 1.3)).mul(mc).mul(0.95).add(vec3(U.sunColor).mul(pow(bNH, 24.0).mul(bSun).mul(0.35))));
            }).ElseIf(finishId.equal(84.0), () => {
              const mpH = (pow(bNH, 16.0)).toVar();
              color.addAssign(vec3(U.sunColor).mul(vec3(0.40, 0.20, 1.0)).mul(mpH.mul(0.35).add(bSun.mul(0.006)))
                .add(vec3(U.ambSky).add(vec3(U.sunColor).mul(0.3)).mul(vec3(0.60, 0.36, 0.12)).mul(smoothstep(0.50, 0.92, pvG).mul(0.45).mul(pvEdge))));
            }).Else(() => {
              color.assign(vec3(0.010, 0.010, 0.011).mul(bLit.mul(0.6).add(1.0)).add(vec3(U.ambSky).mul(pvG.mul(0.010))));
            });
          }).ElseIf(finishId.greaterThanEqual(71.0), () => {
            const lit = pvLit;
            If(finishId.equal(71.0), () => {
              const tmAlb = (mix(vec3(pvA), albedo, 0.55)).toVar();
              color.assign(tmAlb.mul(pow(min(pvLit, 0.85), 0.55)).mul(0.82).add(dot(vec3(U.ambSky), vec3(0.299, 0.587, 0.114)).mul(0.10).add(0.03))
                .add(mix(vec3(0.62), albedo, 0.35).mul(smoothstep(0.25, 0.95, pvG).mul(0.55).mul(pvEdge))));
            }).ElseIf(finishId.equal(72.0), () => {
              const pwT = (mix(vec3(1.0, 0.92, 0.80), vec3(0.70, 0.82, 1.05), smoothstep(0.10, 0.70, pvG))).toVar();
              pwT.assign(mix(pwT, vec3(0.98, 0.86, 0.96), smoothstep(0.25, 0.45, pvG).mul(smoothstep(0.45, 0.65, pvG).oneMinus()).mul(0.6)));
              color.assign(vec3(min(lit, 1.3)).mul(0.85).mul(pwT));
            }).ElseIf(finishId.equal(74.0), () => {
              const jgC = (floor(objP.mul(180.0))).toVar();
              const jgH = (hash21(jgC.xy.add(jgC.z.mul(19.7)))).toVar();
              const jg = (smoothstep(0.975, 1.0, jgH).mul(smoothstep(0.55, 1.0, fract(jgH.mul(37.0).add(pvNH.mul(3.0)))))).toVar();
              color.addAssign(vec3(1.0, 0.78, 0.32).mul(vec3(U.sunColor).mul(pvSun).add(vec3(U.ambSky))
                .mul(mix(float(0.010), jg.mul(6.0), clamp(float(0.5).div(fnPx.mul(180.0)).sub(0.5), 0.0, 1.0))))
                .add(vec3(U.sunColor).mul(pow(pvNH, 40.0).mul(pvSun).mul(0.30))));
            });
          });
        });

        {
          const rf = NoV.oneMinus();
          const rimFresnel = rf.mul(rf).mul(rf);
          const rimAmt = rimFresnel.mul(rough.mul(0.85).oneMinus()).mul(0.18).mul(U.skyRimGlow);
          color.addAssign(vec3(U.skyHorizon).mul(rimAmt));
        }

        {
          const ao = pow(max(N.y.mul(0.5).add(0.5), 1e-4), 0.35);
          color.mulAssign(mix(float(0.12).mul(U.ambContactDark).oneMinus(), float(1.0), ao));
        }

        If(emissive.greaterThan(0.0), () => {
          color.assign(mix(color, albedo, emissive));
          const bright = max(albedo.r, max(albedo.g, albedo.b));
          const glow = smoothstep(0.50, 0.95, bright).mul(emissive);
          const hdrTag = max(bright.sub(1.0), 0.0);
          color.addAssign(albedo.mul(glow).mul(U.glowAmp).mul(hdrTag.mul(U.bloomBoost).add(1.0)));
        });

        If(U.fogDensity.greaterThan(0.0).or(U.groundMist.greaterThan(0.001)), () => {
          const rd = V.negate();
          const sunAmount = max(dot(rd, U.sunDir), 0.0).toVar();
          const lampFogC = vec3(0.0).toVar();
          If(U.lampFog.greaterThan(0.0), () => {
            const lf = lampFogAcc.mul(U.lampFog);
            lampFogC.assign(lf.div(max(max(lf.r, lf.g), lf.b).mul(U.lampFogClip).add(1.0)));
          });
          If(U.fogDensity.greaterThan(0.0), () => {
            const heightAtten = select(U.fogHeight.greaterThan(0.0),
              exp(max(wp.y.sub(cameraPosition.y), 0.0).negate().mul(U.fogHeight)),
              float(1.0));
            const fd = vd.mul(U.fogDensity).mul(heightAtten);
            const f = exp(fd.mul(fd).negate()).oneMinus();
            const sunAmt = max(sunAmount, 1e-4);
            const sunAmt2 = sunAmt.mul(sunAmt), sunAmt4 = sunAmt2.mul(sunAmt2).toVar(), sunAmt8 = sunAmt4.mul(sunAmt4);
            const fogSun = vec3(U.sunColor).div(max(float(1.0), max(U.sunColor.x, max(U.sunColor.y, U.sunColor.z))));
            const fogCol = mix(vec3(U.fogColor), fogSun, sunAmt4).toVar();
            fogCol.addAssign(fogSun.mul(sunAmt8.mul(sunAmt8)).mul(U.fogSunCore));
            fogCol.mulAssign(vec3(
              float(1.0).add(max(U.fogTint, 0.0).mul(0.25)).sub(max(U.fogTint.negate(), 0.0).mul(0.12)),
              float(1.0).sub(abs(U.fogTint).mul(0.02)),
              float(1.0).sub(max(U.fogTint, 0.0).mul(0.25)).add(max(U.fogTint.negate(), 0.0).mul(0.18))));
            fogCol.addAssign(lampFogC);
            color.assign(mix(color, fogCol, f));
          });
          If(U.groundMist.greaterThan(0.001), () => {
            const lowH = max(wp.y.sub(cameraPosition.y.sub(5.0)), 0.0);
            const band = exp(lowH.negate().mul(float(0.09).div(max(U.mistHeight, 0.05))));
            const mp = wp.xz.mul(0.020).add(vec2(U.time.mul(0.010), U.time.mul(0.006)));
            const dRamp = clamp(vd.sub(8.0).div(45.0), 0.0, 1.0);
            const mistFill = smoothstep(1.1, 1.5, U.groundMist);
            const mistPatch = smoothstep(0.35, 0.72, cloudFBM(mp, 0.35));
            const mist = U.groundMist.mul(band).mul(mix(mistPatch, mistPatch.mul(0.45).add(0.55), mistFill)).mul(dRamp);
            const mistSun = max(sunAmount, 1e-4);
            const mistCol = mix(vec3(U.fogColor), vec3(U.sunColor), mistSun.mul(mistSun).mul(mistSun))
              .add(lampFogC.mul(U.mistShare));
            color.assign(mix(color, mistCol, clamp(mist, 0.0, mistFill.mul(0.2).add(0.45))));
          });
        });

        return vec4(color, SSR_TAG
          ? select(carPaint.greaterThan(0.001), float(0.35),
            select(porous.greaterThan(0.5).and(matU.alpha.greaterThanEqual(1.0)), float(0.75), matU.alpha))
          : matU.alpha);
      })();
    }

    const vertexMotionNode = () => Fn(() => {
      const p = vec3(positionLocal).toVar();
      const nL = vec3(normalLocal).toVar();
      const matA = attribute("mat", "float");
      const mid = floor(matA.add(0.5)).toVar();
      const mfr = clamp(matA.sub(mid), 0.0, 1.0).toVar();
      const off = vec3(0.0).toVar();
      If(mid.equal(15.0), () => {
        const fw = mfr.mul(2.5);
        const ph = U.time.mul(5.5).add(positionGeometry.x.mul(1.9)).add(positionGeometry.z.mul(1.9));
        const wave = sin(ph).mul(0.085).add(sin(ph.mul(2.17).add(1.3)).mul(0.045)).mul(fw);
        off.assign(nL.mul(wave));
      }).ElseIf(mid.equal(6.0).and(mfr.greaterThan(0.002)), () => {
        const w = clamp(mfr.div(0.45), 0.0, 1.0);
        const spd = U.wind.z;
        const along = p.x.mul(U.wind.x).add(p.z.mul(U.wind.y));
        const gust = U.time.mul(spd.mul(1.1).add(0.6)).sub(along.mul(0.07));
        const bend = sin(gust).mul(0.55)
          .add(sin(gust.mul(2.31).add(along.mul(0.19)).add(1.7)).mul(0.25))
          .add(0.45);
        const amp = spd.mul(0.32).mul(w).mul(w);
        const sway = vec3(U.wind.x, 0.0, U.wind.y).mul(bend.mul(amp));
        const flPh = U.time.mul(spd.mul(3.2).add(1.5)).add(p.x.mul(1.3)).add(p.z.mul(1.1)).add(p.y.mul(0.7));
        const flutter = sin(flPh).mul(spd.mul(0.05)).mul(w);
        off.assign(nL.mul(flutter).add(sway));
      });
      return p.add(off);
    })();

    const _PACK_A_DEF = new THREE.Vector4(0.7, 0.0, 0.5, 0.0);
    const _PACK_B_DEF = new THREE.Vector4(0.0, 0.0, 1.0, 0.0);
    const _drawKeys = ["tlxEmissive", "tlxAlpha", "tlxLgRoad"];
    function perDrawUniforms() {
      const pA = uniform(_PACK_A_DEF.clone()), pB = uniform(_PACK_B_DEF.clone());
      const draw = uniform(new THREE.Vector3(0, 1, 0)).onObjectUpdate(({ object, material }) => {
        const v = draw.value, mud = material ? material.userData : null;
        for (let i = 0; i < 3; i++) {
          const k = _drawKeys[i];
          let x = object ? object.userData[k] : undefined;
          if (x === undefined && mud) x = mud[k];
          if (x !== undefined) v.setComponent(i, x);
        }
        pA.value = (mud && mud.tlxPackA) || _PACK_A_DEF;
        pB.value = (mud && mud.tlxPackB) || _PACK_B_DEF;
        return v;
      });
      return { draw, pA, pB };
    }
    const _sharedGraph = [null, null, null, null, null, null];
    const _tagKeep = {
      blending: THREE.CustomBlending,
      blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation,
    };
    const _mats = [];
    let _sharedPos = null;
    function sharedFragment(chunked, instanced, fx) {
      const idx = (instanced ? 2 : (chunked ? 1 : 0)) + (fx ? 3 : 0);
      let g = _sharedGraph[idx];
      if (!g) {
        const { draw, pA, pB } = perDrawUniforms();
        const matU = { emissive: draw.x, alpha: draw.y, lgRoad: draw.z };
        matU.roughness = pA.x; matU.metalness = pA.y;
        matU.specular = pA.z;  matU.detail = pA.w;
        matU.clearcoat = pB.x; matU.carPaint = pB.y; matU.sparkle = pB.z; matU.carFinish = pB.w;
        const packed = buildFragment(matU, chunked, instanced, fx);
        const out = vec4(packed.rgb, matU.alpha);
        g = _sharedGraph[idx] = {
          rgb: packed.rgb, a: packed.a, opacity: matU.alpha,
          out,
          mrt: (SSR_TAG && typeof mrt === "function")
            ? mrt({ output: out, ssrTag: packed.a })
            : null,
          mrtKeep: (SSR_TAG && typeof mrt === "function")
            ? mrt({ output: out, ssrTag: packed.a }).setBlendMode("ssrTag", _tagKeep)
            : null,
        };
      }
      return g;
    }
    function makeMaterial(opts) {
      const o = opts || {};
      const val = (v, d) => (v !== undefined ? v : d);
      const alpha = val(o.alpha, 1);
      const m = new THREE.MeshBasicNodeMaterial();
      const ud = m.userData;
      ud.tlxEmissive  = val(o.emissive, 0);
      ud.tlxAlpha     = alpha;
      ud.tlxLgRoad    = 0;
      ud.tlxRoughness = val(o.roughness, 0.7);
      ud.tlxMetalness = val(o.metalness, 0.0);
      ud.tlxSpecular  = val(o.specular, 0.5);
      ud.tlxDetail    = val(o.detail, 0.0);
      ud.tlxClearcoat = val(o.clearcoat, 0.0);
      ud.tlxCarPaint  = val(o.carPaint, 0.0);
      ud.tlxSparkle   = val(o.sparkle, 1.0);
      ud.tlxPackA = new THREE.Vector4(ud.tlxRoughness, ud.tlxMetalness, ud.tlxSpecular, ud.tlxDetail);
      ud.tlxPackB = new THREE.Vector4(ud.tlxClearcoat, ud.tlxCarPaint, ud.tlxSparkle, o.carFinish ? 1 : 0);
      ud.tlxChunked   = !!o.chunked;
      ud.tlxInstanced = !!o.instanced;
      ud.tlxFx = !!o.finishX && !o.chunked;
      ud.tlxKeepSsrTag = alpha < 1 || !!o.noAlphaWrite;
      const packed = sharedFragment(!!o.chunked, !!o.instanced, ud.tlxFx);
      _mats.push(m);
      m.colorNode = packed.rgb;
      m.opacityNode = packed.opacity;
      m.outputNode = packed.out;
      m.positionNode = _sharedPos || (_sharedPos = vertexMotionNode());
      pinProgram(m, (o.instanced ? "tlx-lit-instanced" : (o.chunked ? "tlx-lit-ch" : "tlx-lit")) + (ud.tlxFx ? "-fx" : ""));
      if (_ssrOn) m.mrtNode = ud.tlxKeepSsrTag ? packed.mrtKeep : packed.mrt;
      m.transparent = alpha < 1;
      m.depthWrite = o.chunked ? true : alpha >= 1;
      m.side = o.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
      if (o.depthBias) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = o.depthBias[0];
        m.polygonOffsetUnits = o.depthBias[1];
      }
      if (alpha < 1 || o.noAlphaWrite) {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation;
        m.blendSrc = alpha < 1 ? THREE.SrcAlphaFactor : THREE.OneFactor;
        m.blendDst = alpha < 1 ? THREE.OneMinusSrcAlphaFactor : THREE.ZeroFactor;
        m.blendEquationAlpha = THREE.AddEquation;
        m.blendSrcAlpha = THREE.ZeroFactor;
        m.blendDstAlpha = THREE.OneFactor;
      } else {
        m.blending = THREE.NoBlending;
      }
      if (o.noDepthTest) {
        m.depthTest = false;
        m.depthWrite = false;
        m.transparent = false;
      }
      return m;
    }

    function makeViz(mode) {
      const m = new THREE.MeshBasicNodeMaterial();
      if (mode === "normal") {
        m.colorNode = Fn(() => {
          const N = vec3(normalWorld).toVar();
          return normalize(N).mul(0.5).add(0.5);
        })();
      } else if (mode === "lamp") {
        m.colorNode = Fn(() => {
          const wp = vec3(positionWorld).toVar();
          const N = vec3(normalWorld).toVar();
          const sum = vec3(0.0).toVar();
          Loop({ start: int(0), end: int(MAX_LIGHTS), type: "int", condition: "<" }, ({ i }) => {
            If(float(i).greaterThanEqual(U.numLights), () => { Break(); });
            const geo = U.lampGeo.element(i);
            const LP = U.lampPos.element(i).sub(wp);
            const dist = length(LP).toVar();
            If(dist.lessThan(geo.x), () => {
              const Ld = LP.div(max(dist, 1e-3));
              const dn = dist.div(geo.x);
              const win = clamp(dn.mul(dn).mul(dn).mul(dn).oneMinus(), 0.0, 1.0);
              const distC = max(dist, U.lampNearClamp);
              const att = win.mul(win).div(distC.mul(distC).add(1.0));
              const beam = smoothstep(geo.z, geo.y, dot(Ld.negate(), U.lampDir.element(i).xyz));
              const NoLl = max(dot(normalize(N), Ld), 0.0);
              sum.addAssign(U.lampCol.element(i).mul(att.mul(mix(geo.w, float(1.0), beam))).mul(NoLl).mul(0.25));
            });
          });
          return sum;
        })();
      } else {
        m.colorNode = Fn(() => {
          const matA = float(attribute("mat", "float")).toVar();
          const id = floor(matA.add(0.5));
          return vec3(fract(id.mul(0.6180339)).mul(0.8).add(0.2),
                      fract(id.mul(0.3819660).add(0.33)).mul(0.8).add(0.2),
                      fract(id.mul(0.2360679).add(0.67)).mul(0.8).add(0.2));
        })();
      }
      m.side = THREE.DoubleSide;
      pinProgram(m, "tlx-viz-" + mode);
      return m;
    }

    function setEnvStr(v) { U.envStr.value = +v || 0; }
    function setEnvCube(tex) { if (envCubeNode && tex) envCubeNode.value = tex; }
    let _ssrOn = false;
    function setSsrMrt(on) {
      if (!SSR_TAG || _ssrOn === !!on) return;
      _ssrOn = !!on;
      for (let i = 0; i < _mats.length; i++) {
        const m = _mats[i];
        const g = sharedFragment(!!m.userData.tlxChunked, !!m.userData.tlxInstanced, !!m.userData.tlxFx);
        m.mrtNode = on ? (m.userData.tlxKeepSsrTag ? g.mrtKeep : g.mrt) : null;
      }
    }

    function setMaterialMaps(maps) {
      if (matAlbedoNode && maps && maps.albedo) matAlbedoNode.value = maps.albedo;
      if (matNormalNode && maps && maps.normal) matNormalNode.value = maps.normal;
      const store = U.matTexScale.array || U.matTexScale.value;
      if (store) {
        for (let i = 0; i < 17; i++)
          store[i] = maps && maps.scales && maps.scales[i] > 0 ? maps.scales[i] : 0;
      }
      if (U.matTexScale.needsUpdate !== undefined) U.matTexScale.needsUpdate = true;
    }

    const decalShadow = !shadowOn ? null : Fn(([wpIn, nrmIn]) => {
      const wp = vec3(wpIn).toVar();
      const nrm = vec3(nrmIn).toVar();
      const res = float(1.0).toVar();
      If(U.shadowStr.greaterThan(0.0), () => {
        const lc = U.lightVP.mul(vec4(wp, 1.0)).toVar();
        const sc = lc.xyz.div(lc.w).mul(0.5).add(0.5).toVar();
        If(sc.z.lessThan(1.0), () => {
          const fadeCtr = vec3(cameraPosition.x, U.shadowCtr.y, cameraPosition.z);
          const edgeFade = smoothstep(U.shadowRange.mul(0.62), U.shadowRange.mul(0.84), length(wp.sub(fadeCtr)))
            .oneMinus().toVar();
          const ef = smoothstep(vec2(0.0), vec2(0.03), sc.xy)
            .mul(smoothstep(vec2(0.97), vec2(1.0), sc.xy).oneMinus());
          edgeFade.mulAssign(ef.x.mul(ef.y));
          If(edgeFade.greaterThan(0.0), () => {
            const t = float(U.shadowTexel).toVar();
            const c = clamp(dot(normalize(nrm), U.sunDir), 0.05, 1.0);
            const biasTerm = clamp(t.mul(1.5).mul(sqrt(c.mul(c).oneMinus()).div(c)), 0.0005, 0.004)
              .add(U.shadowBias.mul(0.5));
            const z = sc.z.sub(biasTerm.mul(U.shadowRange.div(80.0))).toVar();
            const o = t.mul(1.5).mul(min(1.0, float(80.0).div(U.shadowRange))).toVar();
            const sunT = shadowMapNode(SHD.sunTex);
            const tap = (px, py) => sunT.sample(flipUV(sc.xy.add(vec2(px, py).mul(o)))).compare(z);
            const sh = tap(-1.0, -1.0).add(tap(1.0, -1.0)).add(tap(-1.0, 1.0)).add(tap(1.0, 1.0)).mul(0.25);
            res.assign(max(0.0, mix(float(1.0), sh, U.shadowStr.mul(edgeFade))));
          });
        });
      });
      return res;
    });
    const decalPool = Fn(([wpIn, nIn]) => {
      const wp = vec3(wpIn).toVar();
      const n = vec3(nIn).toVar();
      const bUv = wp.xz.sub(U.bakeOrigin).div(U.bakeSize).toVar();
      const bIn = bUv.x.greaterThan(0.0).and(bUv.x.lessThan(1.0))
        .and(bUv.y.greaterThan(0.0)).and(bUv.y.lessThan(1.0));
      const res = vec3(0.0).toVar();
      If(U.bakeOn.greaterThan(0.5).and(bIn), () => {
        const bG = bUv.mul(U.bakeGrid.xy).toVar();
        const bTile = clamp(floor(bG), vec2(0.0), max(U.bakeGrid.xy.sub(1.0), vec2(0.0))).toVar();
        const bSlot = BAKE_IDX_NODE.sample(bTile.add(0.5).div(U.bakeGrid.xy)).level(0).xy.toVar();
        If(bSlot.x.greaterThanEqual(0.0), () => {
          const bUvD = bSlot.add(bG.sub(bTile).mul(U.bakeGrid.z)).add(1.0).div(max(U.bakeAtlas, vec2(1.0))).toVar();
          const bT = BAKE_NODE.sample(bUvD).level(0).toVar();
          const hW = smoothstep(1.5, 3.0, abs(wp.y.sub(bT.a))).oneMinus();
          res.assign(bT.rgb.mul(U.bakeScale).mul(hW).mul(n.y.mul(0.5).add(0.5)));
        });
      });
      return res;
    });

    function releaseMaterial(m) {
      const i = _mats.indexOf(m);
      if (i >= 0) _mats.splice(i, 1);
    }

    return { makeMaterial, makeViz, releaseMaterial, uniforms: U, sharedUniforms: SHARED_UNIFORMS, updateFrame, setEnvStr, setEnvCube, setLampGrid, setLampGridColors, setLampBake,
             decalLight: { shadow: decalShadow, pool: decalPool },
             setSsrMrt, setMaterialMaps, hasMaterialMaps: !!matAlbedoNode, MAX_LIGHTS };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { lit });
})();
