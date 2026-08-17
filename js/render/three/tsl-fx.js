/* Apex 26 — TLXShaders.fx: the FX materials for the TLX backend (M6).
 *
 * TSL ports of the five tiny GLSL programs in js/render/shaders/fx.js
 * (the GLSL source of truth):
 *   - blob shadow (SHADOW_VS/FS): unit xz quad lifted y=0.02 (baked into the
 *     shared quad geometry; the per-draw w/l scale is baked into the record's
 *     matrix by tlx.js), radial a = 0.45*(1-smoothstep(0.25,1,r)).
 *   - skid mark (MARK_FS): same quad, rectangular falloff
 *     a = 0.38*smoothstep(1,0.4,|u|)*smoothstep(1,0.3,|v|).
 *   - skid batch (MARK_BATCH_VS + MARK_FS): world-space verts with a -1..1
 *     uv attribute, identical falloff — one draw for the whole trail.
 *   - lamp lens glare (GLOW_VS/FS): camera-facing billboard expanded in the
 *     vertex stage from [corner, center, color, radius] records, additive
 *     core+veil falloff scaled by the uStr uniform.
 *   - FX particles (PARTICLE_VS/FS): same billboard expansion from
 *     [corner, center, color, size, alpha] records; two material variants
 *     replace the uAdditive uniform branch (alpha smoke vs premultiplied
 *     ONE/ONE sparks) — both variants of the same math, mirroring
 *     outColor = mix(vec4(col,a), vec4(col*a,1), uAdditive).
 *   - car decal (DECAL_VS/FS): textured quads over the bodywork, sun+hemi
 *     lit + uGlow lift, discard a<0.02 (material.alphaTest).
 *
 * GL-STATE MAPPING (glx.js drawShadow/drawMark/drawSkidBatch/drawGlow/
 * drawParticles/drawDecal 1:1): every FX material is transparent (never
 * depth-written), depth-TESTED, and — where GLX runs polygonOffset(-4,-8) —
 * carries the same polygon offset. GLX masks the alpha channel on particles
 * and decals (colorMask a=false) to protect the SSR car-paint tag; three
 * r184 has only a BOOLEAN Material.colorWrite (mapped to GPUColorWrite.ALL
 * or 0 — no per-channel mask on either backend), so the equivalent is done
 * through the blend stage instead: CustomBlending with
 * blendSrcAlpha=Zero / blendDstAlpha=One leaves dst alpha untouched for the
 * SAME result the colorMask gave. All five FX materials use it — GLX's
 * colorMask protects the SSR car-paint tag on the HDR scene target; TLX
 * has no per-channel mask, so the blend stage must leave dst alpha
 * untouched or a written a<1 would punch through that tag (and, on the
 * direct-to-canvas fallback, the page).
 * three owns per-material state, so nothing leaks into the next pass's
 * clear (the M4 caster-bug lesson).
 *
 * SHAPE CONTRACT (see tlx.js header): publishes a FACTORY,
 *   TLXShaders.fx = (THREE, TSL, ctx) => ({ shadowMat, markMat, skidMat,
 *       glowMat, glowStr, particleMats, decalMaterialFor, updateFrame })
 * NEVER touches THREE/TSL at script eval — three exists only inside
 * TLX.create(). Geometry/buffer management (the shared quad, the dynamic
 * interleaved skid/glow/particle buffers) lives in tlx.js; this file is
 * materials only.
 *
 * STANDING RULE (tsl-lit.js header): every shared varying-derived TSL node
 * gets an unconditional Fn-body .toVar() anchor before any conditional use.
 */
"use strict";

(function () {
  function fx(THREE, TSL /*, ctx */) {
    const {
      Fn, uniform, attribute, texture,
      float, vec2, vec3,
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
      return m;
    }

    /* ── blob shadow (SHADOW_FS) ────────────────────────────────────────────
     * The shared quad geometry holds the unit xz footprint at y=0.02; vUV =
     * aPos*2 (SHADOW_VS) == positionGeometry.xz*2 here. */
    const shadowMat = fxMaterial({ offset: true });
    shadowMat.colorNode = vec3(0.0);
    shadowMat.opacityNode = Fn(() => {
      const uvv = vec2(positionGeometry.xz.mul(2.0)).toVar();   // anchor
      const r = length(uvv);
      return smoothstep(0.25, 1.0, r).oneMinus().mul(0.45);
    })();

    // MARK_FS rectangular falloff — shared by the per-mark quad (uv from the
    // quad position) and the world-space batch (uv attribute).
    const markFalloff = (uvv) =>
      smoothstep(float(1.0), float(0.4), abs(uvv.x))
        .mul(smoothstep(float(1.0), float(0.3), abs(uvv.y))).mul(0.38);

    /* ── per-mark skid stamp (SHADOW_VS quad + MARK_FS) — the fallback path ── */
    const markMat = fxMaterial({ offset: true });
    markMat.colorNode = vec3(0.0);
    markMat.opacityNode = Fn(() => {
      const uvv = vec2(positionGeometry.xz.mul(2.0)).toVar();   // anchor
      return markFalloff(uvv);
    })();

    /* ── batched skid trail (MARK_BATCH_VS + MARK_FS) ───────────────────────
     * World-space positions (identity model matrix in tlx.js) + a -1..1 "uv"
     * attribute across each stamp. */
    const skidMat = fxMaterial({ offset: true });
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

    /* ── lamp lens glare (GLOW_VS/FS): additive core + veil ───────────────── */
    const glowStr = uniform(0.12);   // uStr — set per drawGlow call (LT.glareStr def)
    const glowMat = fxMaterial({ additive: true, doubleSided: true });
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

    /* ── FX particles (PARTICLE_VS/FS): two variants replace uAdditive ────── */
    function particleMaterial(additive) {
      const m = fxMaterial({ additive, doubleSided: true });
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
    const particleMats = [particleMaterial(false), particleMaterial(true)];

    /* ── car decals (DECAL_VS/FS) ───────────────────────────────────────────
     * Sun + hemisphere lit so marks sit INTO the paint's shading; uGlow lifts
     * them at night. Frame uniforms are fx-local (the decal pass reads the
     * keyMul-scaled sun + ambientMul-scaled ambient — js/render/glx.js — and
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
    // Frame stamp per cached decal material — same guard as tlx.js materialFor.
    // drawList holds material REFERENCES flushed at present(); FIFO eviction of
    // an in-use entry mid-frame disposed the car's sponsor marks while later
    // draws still referenced them.
    let _decalFrame = 0;
    function decalMaterialFor(tex, glow) {
      const key = tex.id + "|" + glow;
      let m = decalCache.get(key);
      if (!m) {
        if (decalCache.size >= DECAL_CACHE_CAP) {
          for (const [k, v] of decalCache) {
            if (v && v.__tlxFrame === _decalFrame) continue;
            decalCache.delete(k);
            if (v) v.dispose();        // material only — the texture is game-owned
            break;
          }
        }
        m = fxMaterial({ doubleSided: true });   // GLX: cull off, depth write off
        m.alphaTest = 0.02;                      // DECAL_FS: if (t.a < 0.02) discard
        const smp = texture(tex);                // samples the mesh "uv" attribute
        m.colorNode = Fn(() => {
          const t = smp.toVar();                                  // anchor
          const N = normalize(vec3(normalWorld).toVar());         // anchor
          const ndl = max(dot(N, U.sunDir), 0.0);
          const amb = mix(vec3(U.ambGround), vec3(U.ambSky), N.y.mul(0.5).add(0.5));
          return t.rgb.mul(amb.add(vec3(U.sunColor).mul(ndl))).add(t.rgb.mul(glow));
        })();
        m.opacityNode = smp.a;
        decalCache.set(key, m);
      }
      if (m) m.__tlxFrame = _decalFrame;
      return m;
    }

    /** begin(frame) -> decal-pass uniforms (js/render/glx.js semantics: the
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

    return { shadowMat, markMat, skidMat, glowMat, glowStr, particleMats,
             decalMaterialFor, updateFrame };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { fx });
})();
