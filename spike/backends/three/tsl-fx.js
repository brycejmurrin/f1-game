/* Apex 26 — TLXShaders.fx: the FX materials for the TLX backend (M6). TSL ports of the five tiny GLSL programs in js/render/glx/shaders/glsl-fx.js (the GLSL source of trut… */
"use strict";

(function () {
  function fx(THREE, TSL /*, ctx */) {
    const {
      Fn, uniform, attribute, texture, materialReference, mrt,
      float, vec2, vec3, vec4,
      positionGeometry, cameraPosition, normalWorld,
      normalize, cross, dot, length, exp, max, mix, smoothstep, abs,
    } = TSL;

    /* ── shared FX render state ─────────────────────────────────────────────
     * transparent + no depth write + depth test, and the blend-stage alpha
     * mask (dst alpha preserved — see header). additive -> ONE/ONE like the
     * GLX glow/spark groups; else classic SRC_ALPHA/ONE_MINUS_SRC_ALPHA. */
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
      m.blendSrcAlpha = THREE.ZeroFactor;   // dst alpha preserved (SSR tag / canvas)
      m.blendDstAlpha = THREE.OneFactor;
      if (o.offset) {           // GLX polygonOffset(-4,-8): no z-fight with the road
        m.polygonOffset = true;
        m.polygonOffsetFactor = -4;
        m.polygonOffsetUnits = -8;
      }
      if (o.doubleSided) m.side = THREE.DoubleSide;   // GLX disables CULL_FACE
      m.lights = false;
      m.customProgramCacheKey = () => (o.key || "tlx-fx") + (m.mrtNode ? "-mrt" : "");
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
    function setSsrMrt(on) {
      if (typeof mrt !== "function") return;
      const node = on ? mrt({ ssrTag: float(1) }).setBlendMode("ssrTag", _tagKeep) : null;
      for (let i = 0; i < _fxMats.length; i++) _fxMats[i].mrtNode = node;
    }

    /* ── blob shadow (SHADOW_FS) ────────────────────────────────────────────
     * The shared quad geometry holds the unit xz footprint at y=0.02; vUV =
     * aPos*2 (SHADOW_VS) == positionGeometry.xz*2 here. */
    const shadowMat = trackFx(fxMaterial({ offset: true, key: "tlx-fx-blob" }));
    shadowMat.colorNode = vec3(0.0);
    shadowMat.opacityNode = Fn(() => {
      const uvv = vec2(positionGeometry.xz.mul(2.0)).toVar();   // anchor
      const r = length(uvv);
      return smoothstep(0.25, 1.0, r).oneMinus().mul(0.45);
    })();

    const markFalloff = (uvv) =>
      smoothstep(float(1.0), float(0.4), abs(uvv.x))
        .mul(smoothstep(float(1.0), float(0.3), abs(uvv.y))).mul(0.38);

    const markMat = trackFx(fxMaterial({ offset: true, key: "tlx-fx-mark" }));
    markMat.colorNode = vec3(0.0);
    markMat.opacityNode = Fn(() => {
      const uvv = vec2(positionGeometry.xz.mul(2.0)).toVar();   // anchor
      return markFalloff(uvv);
    })();

    /* ── batched skid trail (MARK_BATCH_VS + MARK_FS) ───────────────────────
     * World-space positions (identity model matrix in tlx.js) + a -1..1 "uv"
     * attribute across each stamp. */
    const skidMat = trackFx(fxMaterial({ offset: true, key: "tlx-fx-skid" }));
    skidMat.colorNode = vec3(0.0);
    skidMat.opacityNode = Fn(() => {
      const uvv = vec2(attribute("uv", "vec2")).toVar();        // anchor
      return markFalloff(uvv);
    })();

    /* ── billboard corner expansion (GLOW_VS / PARTICLE_VS, identical math) ──
     * The record's center rides in the "position" attribute (so three's draw
     * count derives naturally); corner is -1..1 (tlx.js writes the glow
     * corners pre-remapped — GLX's y 0..1 -> y*2-1 is baked at fill time).
     * uEye == cameraPosition (tlx.js begin() sets camera.position from
     * frame.eye). */
    function billboardPosition(sizeNode) {
      return Fn(() => {
        const ctr = vec3(positionGeometry).toVar();             // anchor
        const c = vec2(attribute("fxCorner", "vec2")).toVar();  // anchor
        const fwd = normalize(cameraPosition.sub(ctr));
        const right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd).add(vec3(1e-4, 0.0, 0.0)));
        const upv = cross(fwd, right);
        return ctr.add(right.mul(c.x).add(upv.mul(c.y)).mul(sizeNode));
      })();
    }

    const glowStr = uniform(0.12);   // uStr — set per drawGlow call (LT.glareStr def)
    const glowMat = trackFx(fxMaterial({ additive: true, doubleSided: true, key: "tlx-fx-glow" }));
    glowMat.positionNode = billboardPosition(attribute("fxRadius", "float"));
    glowMat.colorNode = Fn(() => {
      const c = vec2(attribute("fxCorner", "vec2")).toVar();    // anchor
      const col = vec3(attribute("fxColor", "vec3")).toVar();   // anchor
      const r2 = dot(c, c);
      const core = exp(r2.mul(-28.0));   // hot centre right at the lens
      const veil = exp(r2.mul(-5.0));    // broad soft glare veil
      const a = core.mul(0.75).add(veil.mul(0.28)).mul(glowStr);
      return col.mul(a);                 // premultiplied for ONE/ONE
    })();
    glowMat.opacityNode = float(1.0);

    function particleMaterial(additive) {
      const m = fxMaterial({ additive, doubleSided: true, key: additive ? "tlx-fx-pt-add" : "tlx-fx-pt" });
      m.positionNode = billboardPosition(attribute("fxSize", "float"));
      const soft = Fn(() => {
        const c = vec2(attribute("fxCorner", "vec2")).toVar();  // anchor
        const fall = max(float(1.0).sub(dot(c, c)), 0.0).toVar();
        fall.mulAssign(fall);            // soft-disc falloff, zero at the rim
        return float(attribute("fxAlpha", "float")).mul(fall);
      })();
      const col = vec3(attribute("fxColor", "vec3"));
      if (additive) {                    // vec4(col*a, 1) into ONE/ONE
        m.colorNode = col.mul(soft);
        m.opacityNode = float(1.0);
      } else {                           // vec4(col, a) classic alpha
        m.colorNode = col;
        m.opacityNode = soft;
      }
      return m;
    }
    const particleMats = [trackFx(particleMaterial(false)), trackFx(particleMaterial(true))];

    /* ── car decals (DECAL_VS/FS) ───────────────────────────────────────────
     * Sun + hemisphere lit so marks sit INTO the paint's shading; uGlow lifts
     * them at night. Frame uniforms are fx-local (the decal pass reads the
     * keyMul-scaled sun + ambientMul-scaled ambient — js/render/glx/glx.js — and
     * must keep working when the lit factory is absent). One material per
     * (texture, glow) pair, cached: ~2 textures/car x 2 glow states. */
    const U = {
      sunDir:   uniform(new THREE.Vector3(0.4, 0.8, 0.4)),
      sunColor: uniform(new THREE.Vector3(1.0, 0.98, 0.9)),   // keyMul-scaled
      ambSky:   uniform(new THREE.Vector3(0.3, 0.32, 0.36)),  // ambientMul-scaled
      ambGround: uniform(new THREE.Vector3(0.2, 0.19, 0.18)),
    };

    const decalCache = new Map();      // "texture.id|glow" -> material
    const DECAL_CACHE_CAP = 24;
    const _decalGraph = [null, null];
    function sharedDecal(glow) {
      const gi = glow ? 1 : 0;
      let packed = _decalGraph[gi];
      if (!packed) {
        packed = _decalGraph[gi] = Fn(() => {
          const t = materialReference("map", "texture").toVar();
          const N = normalize(vec3(normalWorld).toVar());
          const ndl = max(dot(N, U.sunDir), 0.0);
          const amb = mix(vec3(U.ambGround), vec3(U.ambSky), N.y.mul(0.5).add(0.5));
          const rgb = t.rgb.mul(amb.add(vec3(U.sunColor).mul(ndl))).add(t.rgb.mul(glow));
          return vec4(rgb, t.a);
        })();
      }
      return packed;
    }
    let _decalFrame = 0;
    const _evicted = [];   // evicted decal materials; tlx present() flushes after paint
    function flushEvicted() {
      for (let i = 0; i < _evicted.length; i++) { try { _evicted[i].dispose(); } catch (_) { /* already disposed */ } }
      _evicted.length = 0;
    }
    function decalMaterialFor(tex, glow) {
      const key = tex.id + "|" + glow;
      let m = decalCache.get(key);
      if (!m) {
        if (decalCache.size >= DECAL_CACHE_CAP) {
          // Same eviction as tlx.js materialFor: dispose is DEFERRED to
          // present() (tlx.js calls flushEvicted after paint) — drawList
          // still holds this material until then, and the vendored #33952
          // backport (vendor PATCHES.md) makes the dispose itself leak-free.
          // The texture itself is game-owned either way.
          for (const [k, v] of decalCache) {
            if (v && v.__tlxFrame === _decalFrame) continue;
            decalCache.delete(k);
            if (v) {
              _evicted.push(v);
              // Drop it from the per-frame setSsrMrt registry too, or every
              // evicted decal material stays pinned (and walked) forever —
              // the same leak tlx.js's lit.releaseMaterial closed.
              const fi = _fxMats.indexOf(v);
              if (fi >= 0) _fxMats.splice(fi, 1);
            }
            break;
          }
        }
        m = fxMaterial({ doubleSided: true, key: "tlx-fx-decal-" + glow });   // GLX: cull off, depth write off
        m.alphaTest = 0.02;                      // DECAL_FS: if (t.a < 0.02) discard
        m.map = tex;
        const packed = sharedDecal(glow);
        m.colorNode = packed.rgb;
        m.opacityNode = packed.a;
        trackFx(m);
        decalCache.set(key, m);
      }
      if (m) m.__tlxFrame = _decalFrame;
      return m;
    }

    /** begin(frame) -> decal-pass uniforms (js/render/glx/glx.js semantics: the
     * AMBIENT and KEY LIGHT sliders re-light the sponsor marks too). */
    function updateFrame(frame) {
      _decalFrame++;   // new frame: last frame's decal mats are evictable again
      const T = (frame && frame.tune) || null;
      const k = (id, def) => (T && T[id] != null ? T[id] : def);
      const kM = k("keyMul", 1), aM = k("ambientMul", 1);
      const d = frame.sunDir; if (d) U.sunDir.value.set(d[0], d[1], d[2]);
      const s = frame.sunColor; if (s) U.sunColor.value.set(s[0] * kM, s[1] * kM, s[2] * kM);
      const as = frame.ambientSky || [0.3, 0.32, 0.36];
      const ag = frame.ambientGround || [0.2, 0.19, 0.18];
      U.ambSky.value.set(as[0] * aM, as[1] * aM, as[2] * aM);
      U.ambGround.value.set(ag[0] * aM, ag[1] * aM, ag[2] * aM);
    }

    return { shadowMat, markMat, skidMat, glowMat, glowStr, particleMats, setSsrMrt,
             decalMaterialFor, updateFrame, flushEvicted };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { fx });
})();
