"use strict";

(function () {
  const _kn = (T, id, def) => (T && T[id] != null ? T[id] : def);
  const _AMB_SKY = Object.freeze([0.3, 0.32, 0.36]);
  const _AMB_GROUND = Object.freeze([0.2, 0.19, 0.18]);
  function fx(THREE, TSL, opts) {
    const {
      Fn, uniform, attribute, texture, materialReference, mrt, renderGroup, Discard, uv, varying,
      float, vec2, vec3, vec4,
      positionGeometry, positionWorld, cameraPosition, normalWorld,
      normalize, cross, dot, length, exp, max, min, mix, smoothstep, abs, floor,
    } = TSL;
    const smoothstepDown = (hi, lo, x) => smoothstep(lo, hi, x).oneMinus();

    function fxMaterial(o) {
      const m = new THREE.MeshBasicNodeMaterial();
      m.transparent = true;
      m.depthWrite = false;
      m.depthTest = true;
      m.fog = false;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = o.additive ? THREE.OneFactor : THREE.SrcAlphaFactor;
      m.blendDst = o.additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
      m.blendEquationAlpha = THREE.AddEquation;
      m.blendSrcAlpha = THREE.ZeroFactor;
      m.blendDstAlpha = THREE.OneFactor;
      if (o.offset) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = -4;
        m.polygonOffsetUnits = -8;
      }
      if (o.doubleSided) { m.side = THREE.DoubleSide; m.forceSinglePass = true; }
      m.lights = false;
      m.customProgramCacheKey = () => (o.key || "tlx-fx") + (m.mrtNode ? "-mrt" : "");
      if (_ssrOn) m.mrtNode = _ssrTagNode;
      return m;
    }

    const _tagKeep = {
      blending: THREE.CustomBlending,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendEquationAlpha: THREE.AddEquation,
    };
    const _fxMats = [];
    function trackFx(m) { _fxMats.push(m); return m; }
    let _ssrTagNode = null;
    let _ssrOn = false;
    function setSsrMrt(on) {
      if (typeof mrt !== "function" || _ssrOn === !!on) return;
      _ssrOn = !!on;
      if (on && !_ssrTagNode) _ssrTagNode = mrt({ ssrTag: float(1) }).setBlendMode("ssrTag", _tagKeep);
      const node = on ? _ssrTagNode : null;
      for (let i = 0; i < _fxMats.length; i++) _fxMats[i].mrtNode = node;
    }

    const shadowMat = trackFx(fxMaterial({ offset: true, key: "tlx-fx-blob" }));
    shadowMat.colorNode = vec3(0.0);
    shadowMat.opacityNode = Fn(() => {
      const uvv = vec2(positionGeometry.xz.mul(2.0)).toVar();
      const r = length(uvv);
      const a = smoothstep(0.25, 1.0, r).oneMinus().mul(0.45).toVar();
      if (Discard) Discard(a.lessThanEqual(0.0));
      return a;
    })();

    const markFalloff = (uvv) =>
      smoothstepDown(float(1.0), float(0.4), abs(uvv.x))
        .mul(smoothstepDown(float(1.0), float(0.3), abs(uvv.y))).mul(0.38);

    const markMat = trackFx(fxMaterial({ offset: true, key: "tlx-fx-mark" }));
    markMat.colorNode = vec3(0.0);
    markMat.opacityNode = Fn(() => {
      const uvv = vec2(positionGeometry.xz.mul(2.0)).toVar();
      return markFalloff(uvv);
    })();

    const skidMat = trackFx(fxMaterial({ offset: true, key: "tlx-fx-skid" }));
    skidMat.colorNode = vec3(0.0);
    skidMat.opacityNode = Fn(() => {
      const uvv = vec2(attribute("uv", "vec2")).toVar();
      return markFalloff(uvv);
    })();

    const lineSpeed = uniform(0.0);
    const lineCorners = uniform(0.0);
    const lineStr = uniform(1.6);
    const lineOnPace = uniform(new THREE.Vector3(0.10, 0.95, 0.35));
    const lineLift = uniform(new THREE.Vector3(1.00, 0.72, 0.10));
    const lineBrake = uniform(new THREE.Vector3(1.00, 0.12, 0.10));
    const lineOpacity = uniform(1.0);
    const lineMat = trackFx(fxMaterial({ offset: true, doubleSided: true, key: "tlx-fx-line" }));
    const lineAlpha = Fn(() => {
      const across = float(attribute("lineAcross", "float")).toVar();
      const zone = float(attribute("lineZone", "float")).toVar();
      const along = float(attribute("lineAlong", "float")).toVar();
      const PERIOD = float(5.0), SWEEP = float(1.6), THICK = float(1.1);
      const tip = PERIOD.mul(0.6).sub(SWEEP.mul(abs(across)));
      const rel = along.sub(tip);
      const d0 = rel.sub(PERIOD.mul(floor(rel.div(PERIOD))));
      const d = min(d0, PERIOD.sub(d0));
      const arrow = smoothstep(THICK.mul(0.5).sub(0.18), THICK.mul(0.5), d).oneMinus();
      const rim = smoothstep(float(0.85), float(1.0), abs(across)).oneMinus();
      const z = mix(float(1.0), smoothstep(float(0.05), float(0.75), zone), lineCorners);
      return arrow.mul(rim).mul(z);
    });
    lineMat.colorNode = Fn(() => {
      const spd = float(attribute("lineSpeed", "float")).toVar();
      const over = lineSpeed.div(max(spd, float(1.0)));
      const col = mix(mix(lineOnPace, lineLift, smoothstep(float(0.98), float(1.06), over)), lineBrake, smoothstep(float(1.06), float(1.16), over));
      return col.mul(lineStr).mul(lineAlpha()).mul(lineOpacity);
    })();
    lineMat.opacityNode = Fn(() => min(lineAlpha().mul(0.85).mul(lineOpacity), float(1.0)))();

    function billboardPosition(sizeNode, centerNode = positionGeometry) {
      return Fn(() => {
        const ctr = vec3(centerNode).toVar();
        const c = vec2(attribute("fxCorner", "vec2")).toVar();
        const fwd = normalize(cameraPosition.sub(ctr));
        const right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd).add(vec3(1e-4, 0.0, 0.0)));
        const upv = cross(fwd, right);
        return ctr.add(right.mul(c.x).add(upv.mul(c.y)).mul(sizeNode));
      })();
    }

    const glowStr = uniform(0.12);
    const glowMat = trackFx(fxMaterial({ additive: true, doubleSided: true, key: "tlx-fx-glow" }));
    glowMat.positionNode = billboardPosition(attribute("fxRadius", "float"), attribute("fxCenter", "vec3"));
    glowMat.colorNode = Fn(() => {
      const c = vec2(attribute("fxCorner", "vec2")).toVar();
      const col = vec3(attribute("fxColor", "vec3")).toVar();
      const r2 = dot(c, c);
      const core = exp(r2.mul(-28.0));
      const veil = exp(r2.mul(-5.0));
      const a = core.mul(0.75).add(veil.mul(0.28)).mul(glowStr);
      return col.mul(a);
    })();
    glowMat.opacityNode = float(1.0);

    function particleMaterial(additive) {
      const m = fxMaterial({ additive, doubleSided: true, key: additive ? "tlx-fx-pt-add" : "tlx-fx-pt" });
      m.positionNode = billboardPosition(attribute("fxSize", "float"));
      const soft = Fn(() => {
        const c = vec2(attribute("fxCorner", "vec2")).toVar();
        const fall = max(float(1.0).sub(dot(c, c)), 0.0).toVar();
        if (Discard) Discard(fall.lessThanEqual(0.0));
        fall.mulAssign(fall);
        return float(attribute("fxAlpha", "float")).mul(fall);
      })();
      const col = Fn(() => {
        const c = vec3(attribute("fxColor", "vec3")).toVar();
        if (!additive) {
          const up = float(attribute("fxCorner", "vec2").y).mul(0.5).add(0.5);
          const lit = mix(vec3(U.ambGround), vec3(U.ambSky), up).add(vec3(U.sunColor).mul(0.45));
          c.mulAssign(max(lit, vec3(0.18)));
        }
        const fd = varying(length(cameraPosition.sub(vec3(positionGeometry)))).mul(U.fogDensity);
        const fog = float(1.0).sub(exp(fd.mul(fd).negate()));
        return additive ? c.mul(fog.oneMinus()) : mix(c, vec3(U.fogColor), fog);
      })();
      if (additive) {
        m.colorNode = col.mul(soft);
        m.opacityNode = float(1.0);
      } else {
        m.colorNode = col;
        m.opacityNode = soft;
      }
      return m;
    }

    const U = {
      sunDir:   uniform(new THREE.Vector3(0.4, 0.8, 0.4)),
      sunColor: uniform(new THREE.Vector3(1.0, 0.98, 0.9)),
      ambSky:   uniform(new THREE.Vector3(0.3, 0.32, 0.36)),
      ambGround: uniform(new THREE.Vector3(0.2, 0.19, 0.18)),
      fogColor:  uniform(new THREE.Vector3(0.5, 0.6, 0.7)),
      fogDensity: uniform(0.0),
    };
    if (!(opts && opts.sharedUniforms === false)) for (const k in U) U[k].setGroup(renderGroup);
    const particleMats = [trackFx(particleMaterial(false)), trackFx(particleMaterial(true))];

    const decalCache = new Map();
    const decalByTex = new Map();
    function _decalDrop(k, v) {
      decalCache.delete(k);
      const t = v && v.map, g = t && decalByTex.get(t);
      if (g) { g.delete(v.tlxGlow); if (!g.size) decalByTex.delete(t); }
    }
    const DECAL_CACHE_CAP = 24;
    let _decalGraph = null;
    const DL = (opts && opts.lit && opts.lit.decalLight) || null;
    function sharedDecal() {
      let packed = _decalGraph;
      if (!packed) {
        packed = Fn(() => {
          const glow = materialReference("tlxGlow", "float");
          const t = materialReference("map", "texture").toVar();
          const N = normalize(vec3(normalWorld).toVar()).toVar();
          const wp = vec3(positionWorld).toVar();
          const ndl = max(dot(N, U.sunDir), 0.0);
          const sh = DL && DL.shadow ? DL.shadow(wp, N) : float(1.0);
          const pool = DL && DL.pool ? DL.pool(wp, N) : vec3(0.0);
          const amb = mix(vec3(U.ambGround), vec3(U.ambSky), N.y.mul(0.5).add(0.5));
          const rgb = t.rgb.mul(amb.add(vec3(U.sunColor).mul(ndl.mul(sh))).add(pool)).add(t.rgb.mul(glow));
          return vec4(rgb, t.a);
        })();
        _decalGraph = packed;
      }
      return packed;
    }
    let _decalFrame = 0;
    const _evicted = [];
    function flushEvicted() {
      for (let i = 0; i < _evicted.length; i++) { try { _evicted[i].dispose(); } catch (_) {  } }
      _evicted.length = 0;
    }
    function releaseTexture(tex) {
      let n = 0;
      if (!tex) return n;
      for (const [k, v] of decalCache) {
        if (!v || v.map !== tex) continue;
        _decalDrop(k, v);
        _evicted.push(v);
        const fi = _fxMats.indexOf(v);
        if (fi >= 0) _fxMats.splice(fi, 1);
        n++;
      }
      if (_glassMat && _glassMat.__tlxTex === tex) { _evicted.push(_glassMat); _glassMat = null; n++; }
      return n;
    }
    function decalMaterialFor(tex, glow) {
      const byGlow = decalByTex.get(tex);
      let m = byGlow && byGlow.get(glow);
      if (!m) {
        const key = tex.id + "|" + glow;
        if (decalCache.size >= DECAL_CACHE_CAP) {
          for (const [k, v] of decalCache) {
            if (v && v.__tlxFrame === _decalFrame) continue;
            _decalDrop(k, v);
            if (v) {
              _evicted.push(v);
              const fi = _fxMats.indexOf(v);
              if (fi >= 0) _fxMats.splice(fi, 1);
            }
            break;
          }
        }
        m = fxMaterial({ doubleSided: true, key: "tlx-fx-decal" });
        m.blendSrc = THREE.OneFactor;
        m.alphaTest = 0.02;
        m.map = tex;
        m.tlxGlow = glow;
        const packed = sharedDecal();
        m.colorNode = packed.rgb;
        m.opacityNode = packed.a;
        trackFx(m);
        decalCache.set(key, m);
        let g = decalByTex.get(tex);
        if (!g) decalByTex.set(tex, g = new Map());
        g.set(glow, m);
      }
      if (m) m.__tlxFrame = _decalFrame;
      return m;
    }

    let _glassMat = null;
    function mirrorGlassMaterial(tex) {
      if (_glassMat && _glassMat.__tlxTex === tex) return _glassMat;
      if (_glassMat) _evicted.push(_glassMat);
      const m = new THREE.MeshBasicNodeMaterial();
      m.side = THREE.DoubleSide;
      m.transparent = false;
      m.depthWrite = true;
      m.depthTest = true;
      m.fog = false;
      m.lights = false;
      const st = uv();
      m.colorNode = texture(tex, vec2(st.x, st.y.oneMinus())).rgb;
      m.opacityNode = float(1.0);
      m.customProgramCacheKey = () => "tlx-fx-mirror-glass";
      m.__tlxTex = tex;
      return (_glassMat = m);
    }

    function updateFrame(frame) {
      _decalFrame++;
      const T = (frame && frame.tune) || null;
      const kM = _kn(T, "keyMul", 1), aM = _kn(T, "ambientMul", 1);
      const d = frame.sunDir;
      if (d) U.sunDir.value.set(d[0], d[1], d[2]);
      const s = frame.sunColor;
      if (s) U.sunColor.value.set(s[0] * kM, s[1] * kM, s[2] * kM);
      const as = frame.ambientSky || _AMB_SKY;
      const ag = frame.ambientGround || _AMB_GROUND;
      U.ambSky.value.set(as[0] * aM, as[1] * aM, as[2] * aM);
      U.ambGround.value.set(ag[0] * aM, ag[1] * aM, ag[2] * aM);
      const fc = frame.fogColor;
      if (fc) U.fogColor.value.set(fc[0], fc[1], fc[2]);
      U.fogDensity.value = (frame.fogDensity != null ? frame.fogDensity : 0) * _kn(T, "fogDensityMul", 1);
    }

    return { shadowMat, markMat, skidMat, glowMat, glowStr, lineMat, lineSpeed, lineCorners, lineStr, lineOnPace, lineLift, lineBrake, lineOpacity,
             particleMats, setSsrMrt, decalMaterialFor, releaseTexture, mirrorGlassMaterial, updateFrame, flushEvicted };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { fx });
})();
