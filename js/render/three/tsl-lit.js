/* Apex 26 — TLXShaders.lit: the TSL lit-shader core for the TLX backend (M3).
 *
 * A 1:1 port of js/render/shaders/lit.js (the GLSL source of truth) into
 * three.js TSL nodes: all 15 procedural track materials + the car surface ids
 * (20-26), the FLAG cloth-wave vertex displacement, hemisphere ambient +
 * lambert sun + GGX specular (soft-clipped), the 32-lamp spot loop with GGX +
 * clearcoat lobes, cloud shadows, wetness, the analytic clearcoat env mirror,
 * metallic-flake sparkle, emissive/hdrTag over-white glow, and the full fog
 * stack (height fog + sun in-scatter + fogTint + lamp-fog Reinhard + ground
 * mist). Constants are lifted verbatim from lit.js — line refs in comments.
 *
 * M3 SCOPE — deliberately stubbed (search "TODO M"):
 *   - sun/car/lamp SHADOW-MAP sampling  -> shadow = 1.0        (TODO M4)
 *   - PCSS / blocker map                -> n/a                 (TODO M4)
 *   - live env CUBE probe               -> uEnvStr = 0, analytic-gradient
 *     mirror only (the uEnvStr<0.999 branch of lit.js:962-979)  (TODO M9)
 *   - SSR car-paint ALPHA TAG: computed but NOT written — M3 renders straight
 *     to the composited canvas, where a 0.35 alpha ghosts the cars against the
 *     page. M8's offscreen HDR target must route the tag through. (TODO M8)
 *
 * SHAPE CONTRACT (see tlx.js header): publishes a FACTORY,
 *     TLXShaders.lit = (THREE, TSL, ctx) => ({ makeMaterial, makeViz,
 *                                              uniforms, updateFrame, ... })
 * ctx = { chunks } from TLXShaders.chunks(THREE, TSL). NEVER touches THREE or
 * TSL at script eval — three exists only inside TLX.create().
 *
 * ── STANDING RULE (critical — the spike's black-lamp landmine) ──────────────
 * TSL emits a cached property chain (normalWorld -> normalView ->
 * v_normalViewGeometry, positionWorld -> ...) at its FIRST USE SITE. If that
 * first use sits inside an If/ElseIf branch, the chain's assignments strand in
 * that branch and every out-of-branch consumer silently reads an uninitialized
 * local — black/garbage output on the WebGL backend, no error. Therefore:
 * EVERY shared varying-derived node (normalWorld, positionWorld, attributes,
 * camera-relative chains) gets an UNCONDITIONAL Fn-BODY .toVar() ANCHOR before
 * any conditional use. Anchors must be Fn-body statements (a .toVar() outside
 * an Fn body also emits at first use — measured in the spike, not guessed).
 * See spike/three-spike.js applyMaterial "PORT FRICTION".
 */
"use strict";

(function () {
  const MAX_LIGHTS = 32;

  function lit(THREE, TSL, ctx) {
    const {
      Fn, If, Loop, Break, uniform, uniformArray, attribute,
      float, int, vec2, vec3, vec4,
      positionWorld, positionGeometry, positionLocal, normalLocal, normalWorld,
      cameraPosition, frontFacing,
      fract, floor, mod, dot, cross, mix, smoothstep, clamp, pow, exp, sqrt,
      abs, max, min, normalize, length, reflect, select, sin,
      dFdx, dFdy, fwidth,
    } = TSL;
    const { hash21, vnoise } = ctx.chunks;

    const PI = 3.14159265359;

    /* ── frame + tune uniforms ────────────────────────────────────────────────
     * One shared set across every material variant (uniform nodes are shared
     * descriptors; tlx.js calls updateFrame(frame) once per begin()).
     * Defaults MUST mirror LightTune.TUNE_DEFS (js/game/lighting.js) exactly
     * like glx.js:712-848 — a missing tune object renders the shipped look. */
    const U = {
      sunDir:      uniform(new THREE.Vector3(0.4, 0.8, 0.4)),
      sunColor:    uniform(new THREE.Vector3(1.0, 0.98, 0.9)),
      ambSky:      uniform(new THREE.Vector3(0.3, 0.32, 0.36)),
      ambGround:   uniform(new THREE.Vector3(0.2, 0.19, 0.18)),
      skyZenith:   uniform(new THREE.Vector3(0.18, 0.40, 0.78)),
      skyHorizon:  uniform(new THREE.Vector3(0.62, 0.74, 0.88)),
      fogColor:    uniform(new THREE.Vector3(0.04, 0.04, 0.06)),
      fogDensity:  uniform(0.0),      // frame.fogDensity * tune.fogDensityMul (def 1)
      fogHeight:   uniform(0.0),      // tune.fogHeight ?? frame.fogHeight (TUNE def 0.018; frame-driven)
      groundMist:  uniform(0.0),      // frame.groundMist * tune.mistDensity (def 1)
      lampFog:     uniform(0.0),      // frame.lampFog (0 = day/off)
      wetness:     uniform(0.0),
      time:        uniform(0.0),      // frame.time — drives FLAG wave + cloud drift (deterministic with the game clock)
      cloudCover:  uniform(0.0),
      cloudSpeed:  uniform(1.0),
      // LIGHTING TUNER knobs (TUNE_DEFS defs in comments)
      bounceK:        uniform(0.04),  // LAMP BOUNCE
      mistShare:      uniform(1.5),   // MIST GLOW SHARE
      lampFogClip:    uniform(0.7),   // FOG GLOW CLIP
      glowAmp:        uniform(2.3),   // EMISSIVE GLOW
      bloomBoost:     uniform(0.6),   // NEON & LENS BLOOM (neonBoost)
      keyMul:         uniform(1.0),   // KEY LIGHT (SUN)
      fogTint:        uniform(0.0),   // FOG WARM / COOL
      mistHeight:     uniform(0.30),  // MIST HEIGHT BAND
      shadowTintAmt:  uniform(0.0),   // SHADOW COOLNESS
      wetDark:        uniform(1.0),   // WET ROAD DARKEN
      cloudShadowDim: uniform(0.80),  // CLOUD SHADOW DEPTH
      carSunGlint:    uniform(12.0),  // PAINT SUN GLINT
      carSparkle:     uniform(1.6),   // METALLIC SPARKLE
      fogSunCore:     uniform(0.6),   // FOG SUN CORE
      lampNearClamp:  uniform(4.0),   // LAMP NEAR CLAMP
      windowSunFlash: uniform(1.0),   // WINDOW SUN FLASH
      skyRimGlow:     uniform(1.0),   // SKY RIM GLOW
      ambContactDark: uniform(1.0),   // AMBIENT CONTACT DARK
      lampWallSpill:  uniform(1.0),   // LAMP WALL SPILL
      envStr:         uniform(0.0),   // TODO M9: live env-probe strength (carEnvCube, def 0)
      numLights:      uniform(0),
    };
    // Lamp arrays: the flat stride-15 frame.lights record split by consumer,
    // exactly like glx.js:870-895 / the spike. geo = (rad, cosInner, cosOuter,
    // bleed). volW/glareW are godray/glow-pass fields — not consumed here.
    const lampPos = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
    const lampCol = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
    const lampDir = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -1, 0));
    const lampGeo = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(1, 0.8, 0.5, 0));
    U.lampPos = uniformArray(lampPos);
    U.lampCol = uniformArray(lampCol);
    U.lampDir = uniformArray(lampDir);
    U.lampGeo = uniformArray(lampGeo);

    /** begin(frame) -> uniform values. Mirrors the glx.js:662-898 semantics:
     * ambient scaled CPU-side by tune.ambientMul; keyMul/fog/mist knobs applied
     * where glx.js applies them; every default = TUNE_DEFS def. */
    function updateFrame(frame) {
      const T = (frame && frame.tune) || null;
      const k = (id, def) => (T && T[id] != null ? T[id] : def);
      const s3 = (u, a, m) => { if (a) u.value.set(a[0] * (m || 1), a[1] * (m || 1), a[2] * (m || 1)); };
      s3(U.sunDir, frame.sunDir);
      s3(U.sunColor, frame.sunColor);
      const ambM = k("ambientMul", 1);
      s3(U.ambSky, frame.ambientSky || [0.3, 0.32, 0.36], ambM);
      s3(U.ambGround, frame.ambientGround || [0.2, 0.19, 0.18], ambM);
      s3(U.skyZenith, frame.skyZenith || [0.18, 0.40, 0.78]);
      s3(U.skyHorizon, frame.skyHorizon || [0.62, 0.74, 0.88]);
      s3(U.fogColor, frame.fogColor || [0.04, 0.04, 0.06]);
      U.fogDensity.value = (frame.fogDensity || 0) * k("fogDensityMul", 1);
      U.fogHeight.value = T && T.fogHeight != null ? T.fogHeight
        : (frame.fogHeight != null ? frame.fogHeight : 0.0);
      U.groundMist.value = (frame.groundMist != null ? frame.groundMist : 0) * k("mistDensity", 1);
      U.lampFog.value = frame.lampFog != null ? frame.lampFog : 0;
      U.wetness.value = frame.wetness != null ? frame.wetness : 0;
      U.time.value = frame.time != null ? frame.time : 0;
      U.cloudCover.value = frame.cloud != null ? frame.cloud : 0;
      U.cloudSpeed.value = frame.cloudSpeed != null ? frame.cloudSpeed : 1;
      U.bounceK.value = k("bounceK", 0.04);
      U.mistShare.value = k("mistShare", 1.5);
      U.lampFogClip.value = k("fogClip", 0.7);
      U.glowAmp.value = k("glowAmp", 2.3);
      U.bloomBoost.value = k("neonBoost", 0.6);
      U.keyMul.value = k("keyMul", 1.0);
      U.fogTint.value = k("fogTint", 0.0);
      U.mistHeight.value = k("mistHeight", 0.30);
      U.shadowTintAmt.value = k("shadowTintAmt", 0.0);
      U.wetDark.value = k("wetDark", 1.0);
      U.cloudShadowDim.value = k("cloudShadowDim", 0.80);
      U.carSunGlint.value = k("carSunGlint", 12.0);
      U.carSparkle.value = k("carSparkle", 1.6);
      U.fogSunCore.value = k("fogSunCore", 0.6);
      U.lampNearClamp.value = k("lampNearClamp", 4.0);
      U.windowSunFlash.value = k("windowSunFlash", 1.0);
      U.skyRimGlow.value = k("skyRimGlow", 1.0);
      U.ambContactDark.value = k("ambContactDark", 1.0);
      U.lampWallSpill.value = k("lampWallSpill", 1.0);
      U.envStr.value = 0;   // TODO M9: (envReady && !noEnv) ? tune.carEnvCube : 0
      const L = frame.lights;
      const nL = L ? Math.min(MAX_LIGHTS, (L.length / 15) | 0) : 0;
      U.numLights.value = nL;
      for (let i = 0; i < nL; i++) {
        const o = i * 15;
        lampPos[i].set(L[o], L[o + 1], L[o + 2]);
        lampCol[i].set(L[o + 3], L[o + 4], L[o + 5]);
        lampDir[i].set(L[o + 7], L[o + 8], L[o + 9]);
        lampGeo[i].set(L[o + 6], L[o + 10], L[o + 11], L[o + 12]);
      }
    }

    /* ── BRDF leaves (lit.js:150-168) — plain node composition, inlined ────── */
    const D_GGX = (NoH, a) => {
      const a2 = a.mul(a);
      const d = NoH.mul(NoH).mul(a2.sub(1.0)).add(1.0);
      return a2.div(max(d.mul(d).mul(PI), 1e-6));
    };
    // Height-correlated Smith visibility (folds in 1/(4 NoL NoV)).
    const V_SmithGGX = (NoV, NoL, a) => {
      const a2 = a.mul(a);
      const gv = NoL.mul(sqrt(NoV.mul(NoV).mul(a2.oneMinus()).add(a2)));
      const gl = NoV.mul(sqrt(NoL.mul(NoL).mul(a2.oneMinus()).add(a2)));
      return float(0.5).div(max(gv.add(gl), 1e-5));
    };
    // Roughness-aware Schlick (f90 capped by the caller — Frostbite trick).
    const F_Schlick = (VoH, f0, f90) => {
      const v = VoH.oneMinus();
      const v2 = v.mul(v);
      return f0.add(vec3(f90).sub(f0).mul(v2.mul(v2).mul(v)));
    };

    /* ── cloud shadows (lit.js:393-418) ─────────────────────────────────────── */
    // 2-octave FBM (per-pass tuning — matches LIT's cloudFBM, unrolled).
    const cloudFBM = (pIn) => {
      const s1 = vnoise(pIn).mul(0.5);
      const s2 = vnoise(pIn.mul(2.03).add(1.7)).mul(0.25);
      return s1.add(s2);
    };
    const cloudShadow = Fn(([wpIn]) => {
      const wp = vec3(wpIn).toVar();
      const res = float(0.0).toVar();
      If(U.cloudCover.greaterThan(0.001).and(U.sunDir.y.greaterThan(0.06)), () => {
        // divisor floored at 0.15 (grazing-sun stripe fix — see lit.js:399-410)
        const t = float(360.0).sub(wp.y).div(max(U.sunDir.y, 0.15));
        const cT = U.time.mul(U.cloudSpeed);
        const cp = wp.xz.add(U.sunDir.xz.mul(t)).mul(0.0052)
          .add(vec2(cT.mul(0.012), cT.mul(0.005)));
        const c = cloudFBM(cp);
        res.assign(smoothstep(float(0.54).sub(U.cloudCover.mul(0.40)), 0.92, c).mul(U.cloudCover));
      });
      return res;
    });

    /* ── matBumpHeight (lit.js:192-233): scalar relief height for material mid
     *    at local coords uv — (hc,y) for wall materials, world (x,z) for
     *    organic/horizontal. Sampled 3x per fragment for a gradient. ───────── */
    const matBumpHeight = Fn(([mid, uv]) => {
      const hc = uv.x, y = uv.y;
      const h = float(0.0).toVar();
      If(mid.equal(1.0), () => {          // CONCRETE: aggregate + form-seam groove
        const seam = smoothstep(0.05, 0.0, abs(fract(y.div(1.25)).sub(0.5)).sub(0.46));
        h.assign(vnoise(uv.mul(6.0)).mul(0.6).sub(seam.mul(0.5)));
      }).ElseIf(mid.equal(2.0), () => {   // BRICK: bricks proud, mortar recessed
        const ch = 0.20, bl = 0.42, mort = 0.06;
        const row = floor(y.div(ch));
        const off = mod(row, 2.0).mul(0.5 * bl);
        const bx = fract(hc.add(off).div(bl)), by = fract(y.div(ch));
        const joint = max(smoothstep(mort, 0.0, min(bx, bx.oneMinus()).mul(bl)),
                          smoothstep(mort, 0.0, min(by, by.oneMinus()).mul(ch)));
        h.assign(joint.oneMinus().mul(0.5)
          .add(vnoise(vec2(floor(hc.add(off).div(bl)), row).mul(4.0)).mul(0.10)));
      }).ElseIf(mid.equal(4.0), () => {   // METAL: brushed streaks
        h.assign(vnoise(vec2(hc.mul(55.0), y.mul(3.0))).mul(0.3));
      }).ElseIf(mid.equal(5.0), () => {   // WOOD: plank seams + grain
        const seam = smoothstep(0.05, 0.0, abs(fract(hc.div(0.35)).sub(0.5)).sub(0.46));
        h.assign(seam.oneMinus().mul(0.4).add(vnoise(vec2(hc.mul(3.0), y.mul(22.0))).mul(0.16)));
      }).ElseIf(mid.equal(6.0), () => {   // FOLIAGE: per-leaf-cluster lumps
        h.assign(vnoise(uv.mul(3.2)).mul(0.5).add(vnoise(uv.mul(11.0)).mul(0.3)));
      }).ElseIf(mid.equal(7.0), () => {   // FABRIC: woven cross-thread ridges
        h.assign(sin(hc.mul(38.0)).mul(0.15).add(sin(y.mul(38.0)).mul(0.15)));
      }).ElseIf(mid.equal(8.0), () => {   // SAND: dune ripple
        h.assign(sin(hc.mul(3.0).add(vnoise(uv.mul(0.3)).mul(6.0))).mul(0.5)
          .add(vnoise(uv.mul(8.0)).mul(0.2)));
      }).ElseIf(mid.equal(9.0), () => {   // GRASS: blade-clump bump
        h.assign(vnoise(uv.mul(6.0)).mul(0.4).add(vnoise(uv.mul(20.0)).mul(0.25)));
      }).ElseIf(mid.equal(10.0), () => {  // ROCK: craggy multi-octave
        h.assign(vnoise(uv.mul(1.3)).mul(0.6).add(vnoise(uv.mul(4.5)).mul(0.3))
          .add(vnoise(uv.mul(15.0)).mul(0.15)));
      }).ElseIf(mid.equal(11.0), () => {  // SNOW: drifts + sparkle crust
        h.assign(vnoise(uv.mul(1.8)).mul(0.45).add(vnoise(uv.mul(21.0)).mul(0.18)));
      }).ElseIf(mid.equal(12.0), () => {  // ROOF: ridged tile courses
        const ty = fract(y.div(0.34));
        h.assign(sin(ty.mul(3.14159)).mul(0.5)
          .add(vnoise(vec2(hc.mul(2.0), floor(y.div(0.34))).mul(3.0)).mul(0.08)));
      }).ElseIf(mid.equal(13.0), () => {  // STONE: jittered blocks, deep mortar
        const cell = floor(uv.mul(1.3));
        const f = fract(uv.mul(1.3)).sub(hash21(cell).mul(0.12));
        const d = min(min(f.x, f.x.oneMinus()), min(f.y, f.y.oneMinus()));
        h.assign(smoothstep(0.0, 0.16, d).mul(0.55).add(vnoise(uv.mul(5.0)).mul(0.15)));
      }).ElseIf(mid.equal(14.0), () => {  // RUST/CORRUGATED: sinusoidal ridges
        h.assign(sin(hc.mul(7.5)).mul(0.55).add(vnoise(uv.mul(6.0)).mul(0.10)));
      });
      return h;
    });

    /* ── applyMaterialNormal (lit.js:239-277): REAL bump — perturbs the shading
     *    normal before the lighting terms consume it. Wall-like materials key
     *    off (hc,y); organic ones off world (x,z). GLASS(3)/FLAG(15) flat.
     *    Returns the perturbed normal (TSL has no inout). ─────────────────── */
    const applyMaterialNormal = Fn(([mid, Nin, wpIn, vd]) => {
      const N = vec3(Nin).toVar();
      const wp = vec3(wpIn).toVar();
      const bumpFade = clamp(vd.sub(22.0).div(58.0).oneMinus(), 0.0, 1.0).toVar();
      const inRange = mid.greaterThan(0.5).and(mid.lessThan(14.5)).and(mid.notEqual(3.0));
      If(inRange.and(bumpFade.greaterThan(0.005)), () => {
        const wallLike = mid.equal(1.0).or(mid.equal(2.0)).or(mid.equal(4.0))
          .or(mid.equal(5.0)).or(mid.equal(7.0)).or(mid.equal(12.0))
          .or(mid.equal(13.0)).or(mid.equal(14.0));
        If(wallLike, () => {
          const an = abs(N);
          const hc = select(an.x.greaterThan(an.z), wp.z, wp.x).toVar();
          const y = wp.y.toVar();
          // fwidth-AA fade on the (hc,y) world footprint — grazing-angle moiré
          // guard (lit.js:248-259; the 0.04/0.22 constants).
          const fp = max(fwidth(hc), fwidth(y));
          const aaFade = clamp(fp.sub(0.04).div(0.22).oneMinus(), 0.0, 1.0).toVar();
          If(aaFade.greaterThan(0.005), () => {
            const T = normalize(cross(vec3(0.0, 1.0, 0.0), N).add(vec3(1e-5)));
            const e = 0.05;
            const h0 = matBumpHeight(mid, vec2(hc, y));
            const hx = matBumpHeight(mid, vec2(hc.add(e), y));
            const hy = matBumpHeight(mid, vec2(hc, y.add(e)));
            const amt = select(mid.equal(2.0).or(mid.equal(13.0)), float(0.10),
                        select(mid.equal(12.0).or(mid.equal(14.0)), float(0.09), float(0.05)));
            N.assign(normalize(N.add(
              T.mul(h0.sub(hx)).add(vec3(0.0, 1.0, 0.0).mul(h0.sub(hy)))
                .mul(amt.mul(bumpFade).mul(aaFade).div(e)))));
          });
        }).Else(() => {
          const p = wp.xz;
          const e = 0.22;
          const h0 = matBumpHeight(mid, p);
          const hx = matBumpHeight(mid, p.add(vec2(e, 0.0)));
          const hz = matBumpHeight(mid, p.add(vec2(0.0, e)));
          const amt = select(mid.equal(8.0), float(0.16),
                      select(mid.equal(10.0), float(0.14), float(0.07)));
          N.assign(normalize(N.add(
            vec3(h0.sub(hx), 0.0, h0.sub(hz)).mul(amt.mul(bumpFade).div(e)))));
        });
      });
      return N;
    });

    /* ── applyMaterial (lit.js:279-389): albedo + roughness modulation for the
     *    15 track materials. nrmIn = the RAW varying normal (vNrm), matching
     *    the GLSL call site. Returns vec4(albedo, rough). ─────────────────── */
    const applyMaterial = Fn(([mid, albedoIn, roughIn, wpIn, nrmIn, vd]) => {
      const albedo = vec3(albedoIn).toVar();
      const rough = float(roughIn).toVar();
      const wp = vec3(wpIn).toVar();
      const nrm = vec3(nrmIn).toVar();
      const far = clamp(vd.sub(90.0).div(170.0).oneMinus(), 0.0, 1.0).toVar();   // coarse: mid range
      const near = clamp(vd.sub(26.0).div(64.0).oneMinus(), 0.0, 1.0).toVar();   // fine: near field
      const inRange = mid.greaterThan(0.5).and(mid.lessThan(14.5));
      If(inRange.and(far.greaterThan(0.001)), () => {
        const an = abs(normalize(nrm)).toVar();
        const wall = an.y.lessThan(0.6);
        const hc = select(an.x.greaterThan(an.z), wp.z, wp.x).toVar();
        const y = wp.y.toVar();
        If(mid.equal(1.0), () => {          // CONCRETE — panels + speckle + seams
          albedo.mulAssign(vnoise(wp.xz.mul(0.09).add(y.mul(0.05))).sub(0.5).mul(0.16).mul(far).add(1.0));
          albedo.mulAssign(vnoise(vec2(hc, y).mul(6.0)).sub(0.5).mul(0.10).mul(near).add(1.0));
          // fwidth-AA the seam on the PRE-fract coordinate (lit.js:293-297)
          const seam = smoothstep(max(float(0.05), fwidth(y.div(1.25))), 0.0,
            abs(fract(y.div(1.25)).sub(0.5)).sub(0.46)).mul(0.14).mul(near);
          albedo.mulAssign(select(wall, seam.oneMinus(), float(1.0)));
          rough.assign(min(1.0, rough.add(far.mul(0.08))));
        }).ElseIf(mid.equal(2.0), () => {   // BRICK — courses + joints + tint
          const ch = 0.20, bl = 0.42, mort = 0.06;
          const row = floor(y.div(ch));
          const off = mod(row, 2.0).mul(0.5 * bl);
          const bx = fract(hc.add(off).div(bl)), by = fract(y.div(ch));
          // mort is WORLD-space — AA width = raw hc/y footprint (lit.js:305-309)
          const mortAA = max(float(mort), max(fwidth(hc), fwidth(y)));
          const joint = max(smoothstep(mortAA, 0.0, min(bx, bx.oneMinus()).mul(bl)),
                            smoothstep(mortAA, 0.0, min(by, by.oneMinus()).mul(ch)));
          const bh = vnoise(vec2(floor(hc.add(off).div(bl)), row).mul(1.3));
          const brick = albedo.mul(bh.mul(0.42).add(0.82)).mul(vec3(1.06, 0.99, 0.92));
          const mortar = mix(albedo, vec3(0.60, 0.58, 0.55), 0.6);
          albedo.assign(mix(brick, mortar, joint.mul(near)));
          rough.assign(min(1.0, rough.add(far.mul(0.12))));
        }).ElseIf(mid.equal(3.0), () => {   // GLASS — mullion grid + pane variation
          const pw = 1.6, ph = 1.4, mull = 0.11;
          const gx = fract(hc.div(pw)), gy = fract(y.div(ph));
          // NORMALIZED-space AA: fwidth of the pre-fract pane fraction (lit.js:318-322)
          const mullAA = max(float(mull), max(fwidth(hc.div(pw)), fwidth(y.div(ph))));
          const bar = max(smoothstep(mullAA, 0.0, min(gx, gx.oneMinus())),
                          smoothstep(mullAA, 0.0, min(gy, gy.oneMinus())));
          albedo.mulAssign(vnoise(vec2(floor(hc.div(pw)), floor(y.div(ph))).mul(1.7)).sub(0.5).mul(0.5).mul(far).add(1.0));
          albedo.assign(mix(albedo, albedo.mul(0.32), bar.mul(near)));
          rough.assign(mix(rough, min(rough, 0.12), near));
        }).ElseIf(mid.equal(4.0), () => {   // METAL — brushed streaks, glossier
          const brushFade = clamp(vd.sub(26.0).div(29.0).oneMinus(), 0.0, 1.0);   // 26-55 m
          albedo.mulAssign(vnoise(vec2(hc.mul(40.0), y.mul(2.0))).sub(0.5).mul(0.12).mul(brushFade).add(1.0));
          rough.assign(clamp(rough.sub(far.mul(0.15)), 0.05, 1.0));
        }).ElseIf(mid.equal(5.0), () => {   // WOOD — grain + plank seams
          albedo.mulAssign(vnoise(vec2(hc.mul(3.0), y.mul(22.0))).sub(0.5).mul(0.18).mul(near).add(1.0));
          // normalized-space AA (as glass) — lit.js:334-335
          albedo.mulAssign(smoothstep(max(float(0.05), fwidth(hc.div(0.35))), 0.0,
            abs(fract(hc.div(0.35)).sub(0.5)).sub(0.46)).mul(0.16).mul(near).oneMinus());
        }).ElseIf(mid.equal(6.0), () => {   // FOLIAGE — dapple + green variation
          const d = vnoise(wp.xz.mul(2.4).add(wp.y.mul(1.6))).mul(0.6)
            .add(vnoise(wp.xz.mul(9.0)).mul(0.4).mul(near));
          albedo.mulAssign(d.sub(0.5).mul(0.34).mul(far).add(1.0));
          albedo.y.mulAssign(d.sub(0.5).mul(0.10).mul(far).add(1.0));
        }).ElseIf(mid.equal(7.0), () => {   // FABRIC — fine weave speckle
          const weaveFade = clamp(vd.sub(26.0).div(34.0).oneMinus(), 0.0, 1.0);   // 26-60 m
          albedo.mulAssign(vnoise(vec2(hc, y).mul(26.0)).sub(0.5).mul(0.14).mul(weaveFade).add(1.0));
        }).ElseIf(mid.equal(8.0), () => {   // SAND — grain + dune ripple
          albedo.mulAssign(vnoise(wp.xz.mul(5.0)).sub(0.5).mul(0.12).mul(near)
            .add(sin(wp.x.mul(0.7).add(vnoise(wp.xz.mul(0.2)).mul(6.0))).mul(0.05).mul(far))
            .add(1.0));
        }).ElseIf(mid.equal(9.0), () => {   // GRASS — bladed clumps + tone
          const g = vnoise(wp.xz.mul(3.5)).mul(0.6)
            .add(vnoise(wp.xz.mul(14.0)).mul(0.4).mul(near)).sub(0.5);
          albedo.mulAssign(g.mul(0.22).mul(far).add(1.0));
          albedo.y.mulAssign(g.mul(0.08).mul(far).add(1.0));
        }).ElseIf(mid.equal(10.0), () => {  // ROCK — craggy multi-scale tone
          const r = vnoise(wp.xz.mul(0.9).add(y.mul(0.6))).mul(0.6)
            .add(vnoise(wp.xz.mul(4.5)).mul(0.4)).sub(0.5);
          albedo.mulAssign(r.mul(0.30).mul(far).add(1.0));
          rough.assign(min(1.0, rough.add(far.mul(0.16))));
        }).ElseIf(mid.equal(11.0), () => {  // SNOW — bright, cool crevices, sparkle
          const s = vnoise(wp.xz.mul(1.6).add(y.mul(0.4))).sub(0.5);
          albedo.mulAssign(s.mul(0.10).mul(far).add(1.0));
          albedo.z.mulAssign(s.mul(0.05).mul(far).oneMinus());
          const sparkleFade = clamp(vd.sub(26.0).div(34.0).oneMinus(), 0.0, 1.0);   // 26-60 m
          albedo.mulAssign(vnoise(wp.xz.mul(24.0)).sub(0.5).mul(0.06).mul(sparkleFade).add(1.0));
          rough.assign(clamp(rough.sub(far.mul(0.10)), 0.05, 1.0));
        }).ElseIf(mid.equal(12.0), () => {  // ROOF — ridged courses, warm bands
          const ty = fract(y.div(0.34));
          const shadeAA = clamp(fwidth(ty).mul(6.0).oneMinus(), 0.0, 1.0);   // ridge-sine AA (lit.js:363)
          const shade = sin(ty.mul(3.14159)).mul(shadeAA);
          albedo.mulAssign(shade.mul(0.16).add(0.88));
          albedo.mulAssign(vnoise(vec2(hc.mul(2.0), floor(y.div(0.34))).mul(3.0)).sub(0.5).mul(0.14).mul(near).add(1.0));
          rough.assign(min(1.0, rough.add(far.mul(0.10))));
        }).ElseIf(mid.equal(13.0), () => {  // STONE — jittered blocks, deep mortar
          const cell = floor(vec2(hc, y).mul(1.3));
          const f = fract(vec2(hc, y).mul(1.3)).sub(hash21(cell).mul(0.12));
          const d = min(min(f.x, f.x.oneMinus()), min(f.y, f.y.oneMinus()));
          // normalized-space AA in the *1.3 fract domain (lit.js:373-375)
          const jointAA = max(float(0.16), max(fwidth(hc.mul(1.3)), fwidth(y.mul(1.3))));
          const joint = smoothstep(0.0, jointAA, d);
          const block = albedo.mul(hash21(cell).mul(0.4).add(0.80));
          const mortar = mix(albedo, vec3(0.42, 0.40, 0.37), 0.65);
          albedo.assign(mix(mortar, block, joint.mul(near)));
          rough.assign(min(1.0, rough.add(far.mul(0.18))));
        }).ElseIf(mid.equal(14.0), () => {  // RUST/CORRUGATED — ridges + rust streaks
          const ridgePhase = hc.mul(7.5);
          const ridgeAA = clamp(fwidth(ridgePhase).mul(3.0).oneMinus(), 0.0, 1.0);  // corrugation AA (lit.js:382)
          const ridge = sin(ridgePhase).mul(ridgeAA);
          albedo.mulAssign(ridge.mul(0.18).add(0.85));
          const rust = smoothstep(0.55, 0.9, vnoise(vec2(hc.mul(0.8), y.mul(0.35)).add(5.0)));
          albedo.assign(mix(albedo, albedo.mul(vec3(0.62, 0.42, 0.28)), rust.mul(0.5).mul(far)));
          rough.assign(min(1.0, rough.add(far.mul(0.14))));
        });
      });
      return vec4(albedo, rough);
    });

    /* ── the fragment (lit.js main(), :538-1175) built per material variant ──
     * matU = the per-draw material scalars as uniform nodes (one set per
     * cached variant — every variant compiles to the SAME program text, so
     * three's program cache dedupes the actual GL compiles). */
    function buildFragment(matU) {
      return Fn(() => {
        // ── STANDING-RULE ANCHORS: unconditional Fn-body .toVar() on every
        //    shared varying-derived node BEFORE any conditional use. ──────────
        const wp = vec3(positionWorld).toVar();               // vWorldPos
        const Nvary = vec3(normalWorld).toVar();              // vNrm (raw varying)
        const objP = vec3(positionGeometry).toVar();          // vObjPos
        const albedoIn = vec3(attribute("color", "vec3")).toVar();   // vCol
        const matA = float(attribute("mat", "float")).toVar();       // vMat
        const vd = length(wp.sub(cameraPosition)).toVar();    // vDist
        const V = normalize(cameraPosition.sub(wp)).toVar();

        // Two-sided lighting: flip N toward the viewer on back fragments
        // (lit.js:540-547). Raw normalWorld carries no faceDirection flip.
        const N = select(frontFacing, Nvary, Nvary.negate()).toVar();
        N.assign(normalize(N));

        // ── ground micro-normal relief (uDetail — lit.js:553-578) ───────────
        If(matU.detail.greaterThan(0.001), () => {
          const mnFade = clamp(vd.sub(25.0).div(70.0).oneMinus(), 0.0, 1.0)
            .mul(U.wetness.mul(0.75).oneMinus()).toVar();
          // footprint fade — grazing-angle crawl guard (0.15/0.70 constants)
          const mnFp = max(fwidth(wp.x), fwidth(wp.z));
          mnFade.mulAssign(clamp(mnFp.sub(0.15).div(0.70).oneMinus(), 0.0, 1.0));
          If(mnFade.greaterThan(0.01), () => {
            const mnp = wp.xz.mul(1.7);
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

        // Geometric normal for the clearcoat lobes + env mirror — captured
        // AFTER the ground relief, BEFORE paint/material bumps (lit.js:587).
        const Ngeo = vec3(N).toVar();

        // ── car surface ids 20-26 (car3d.js SURFACES; lit.js:590-611) ───────
        const surfaceId = floor(matA.add(0.5)).toVar();
        const classifiedCar = surfaceId.greaterThanEqual(20.0).and(surfaceId.lessThanEqual(26.0)).toVar();
        const paintSurface = surfaceId.equal(20.0).toVar();
        const carbonSurface = surfaceId.equal(21.0).toVar();
        const rubberSurface = surfaceId.equal(22.0).toVar();
        const metalSurface = surfaceId.equal(23.0).toVar();
        const glassSurface = surfaceId.equal(24.0).toVar();
        const emissiveSurface = surfaceId.equal(25.0).toVar();
        const panelSurface = surfaceId.equal(26.0).toVar();
        const carPaint = select(classifiedCar,
          select(paintSurface, matU.carPaint, float(0.0)), matU.carPaint).toVar();
        const clearcoat = select(classifiedCar,
          select(paintSurface, matU.clearcoat,
            select(glassSurface, matU.clearcoat.mul(0.45), float(0.0))),
          matU.clearcoat).toVar();
        const metalness = select(classifiedCar,
          select(metalSurface, max(matU.metalness, 0.78),
            select(carbonSurface, float(0.08), float(0.0))),
          matU.metalness).toVar();
        const specular = select(classifiedCar,
          select(rubberSurface, float(0.18),
            select(metalSurface, float(1.0),
              select(carbonSurface, float(0.48),
                select(panelSurface, float(0.35), matU.specular)))),
          matU.specular).toVar();
        const emissive = select(classifiedCar,
          select(emissiveSurface, max(matU.emissive, 1.0),
            select(paintSurface, matU.emissive, float(0.0))),
          matU.emissive).toVar();
        const envSurface = carPaint.greaterThan(0.001).or(glassSurface)
          .and(clearcoat.greaterThan(0.001)).toVar();

        // ── car-paint orange-peel micro normal (lit.js:613-633) ─────────────
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
              .mul(carPaint.mul(pFade).mul(0.22)))));
          });
        });

        // ── per-material procedural bump (before V/L/H/NoL — lit.js:637) ────
        N.assign(applyMaterialNormal(surfaceId, N, wp, vd));

        const L = vec3(U.sunDir).toVar();
        const H = normalize(L.add(V).add(vec3(1e-5))).toVar();   // +eps: V==-L NaN guard
        const NoL = max(dot(N, L), 0.0).toVar();
        const NoV = max(dot(N, V), 1e-4).toVar();
        const NoH = max(dot(N, H), 0.0).toVar();
        const VoH = max(dot(V, H), 0.0).toVar();

        const albedo = vec3(albedoIn).toVar();

        // ── procedural ground texture + patches + cracks (lit.js:657-693) ───
        const patchM = float(0.5).toVar();
        If(matU.detail.greaterThan(0.0), () => {
          const gxz = wp.xz;
          const fineFade = clamp(vd.sub(35.0).div(90.0).oneMinus(), 0.0, 1.0);
          const n = vnoise(gxz.mul(0.35)).mul(0.60).add(vnoise(gxz.mul(2.1)).mul(0.40).mul(fineFade));
          albedo.mulAssign(n.sub(0.5).mul(matU.detail).add(1.0));
          patchM.assign(vnoise(gxz.mul(0.055).add(9.1)));
          const pm = smoothstep(0.52, 0.72, patchM);
          albedo.mulAssign(pm.mul(0.05).mul(min(matU.detail.mul(4.0), 1.0)).oneMinus());
          const crackFade = clamp(vd.sub(18.0).div(45.0).oneMinus(), 0.0, 1.0).toVar();
          If(crackFade.greaterThan(0.01), () => {
            const cr = abs(vnoise(gxz.mul(0.9).add(3.3)).mul(2.0).sub(1.0)).toVar();
            // fwidth-AA on the crack-ridge threshold (lit.js:680-689)
            const crAA = max(float(0.075), fwidth(cr).add(0.015));
            const crack = smoothstep(0.015, crAA, cr).oneMinus()
              .mul(smoothstep(0.40, 0.70, vnoise(gxz.mul(0.11).add(7.7))));
            albedo.mulAssign(crack.mul(0.30).mul(crackFade).mul(min(matU.detail.mul(4.0), 1.0)).oneMinus());
          });
          albedo.assign(max(albedo, vec3(0.0)));
        });

        // ── roughness resolution + car-surface clamps (lit.js:695-704) ──────
        const rough = clamp(matU.roughness, 0.04, 1.0).toVar();
        If(carbonSurface, () => { rough.assign(max(rough, 0.56)); });
        If(rubberSurface, () => { rough.assign(max(rough, 0.90)); });
        If(metalSurface, () => { rough.assign(min(rough, 0.16)); });
        If(glassSurface, () => { rough.assign(min(rough, 0.13)); });
        If(emissiveSurface, () => { rough.assign(max(rough, 0.32)); });
        If(panelSurface, () => { rough.assign(max(rough, 0.72)); });
        If(matU.detail.greaterThan(0.0), () => {   // glossier repair patches
          rough.assign(clamp(rough.add(patchM.sub(0.5).mul(0.16).mul(min(matU.detail.mul(4.0), 1.0))), 0.04, 1.0));
        });

        // ── procedural per-material albedo/roughness (lit.js:706) ───────────
        const packedMat = applyMaterial(surfaceId, albedo, rough, wp, Nvary, vd);
        albedo.assign(packedMat.xyz);
        rough.assign(packedMat.w);

        // ── specular AA: widen roughness by the normal's screen-space
        //    variance (lit.js:708-712). Drop with a comment if TSL fights it —
        //    it did not: dFdx/dFdy on the anchored N compile clean. ───────────
        const saaDx = dFdx(N), saaDy = dFdy(N);
        const saaVar = dot(saaDx, saaDx).add(dot(saaDy, saaDy)).toVar();
        rough.assign(min(1.0, sqrt(rough.mul(rough).add(saaVar.mul(0.35)))));
        const a = rough.mul(rough).toVar();
        const f0 = mix(vec3(specular.mul(0.08)), albedo, metalness).toVar();

        // ── wet surface (rain — lit.js:716-743) ─────────────────────────────
        const wet = float(0.0).toVar();
        const puddle = float(0.0).toVar();
        If(U.wetness.greaterThan(0.001), () => {
          const upFace = smoothstep(0.50, 0.90, N.y);
          wet.assign(U.wetness.mul(upFace));
          const pn = vnoise(wp.xz.mul(0.13).add(4.7));
          puddle.assign(smoothstep(0.48, 0.88, pn).mul(wet));
          albedo.mulAssign(mix(float(1.0), clamp(U.wetDark.mul(0.58).oneMinus(), 0.0, 1.0), wet));
          albedo.mulAssign(mix(float(1.0), float(0.50), puddle));
          rough.assign(mix(rough, 0.15, wet));
          rough.assign(mix(rough, 0.05, puddle));
          a.assign(rough.mul(rough));
          f0.assign(mix(f0, vec3(0.04), wet.mul(0.6)));   // thin water film dielectric
        });

        const amb = mix(vec3(U.ambGround), vec3(U.ambSky), N.y.mul(0.5).add(0.5)).toVar();

        // ── shadow: TODO M4 (sun/car shadow maps + PCSS). Cloud shadows are
        //    real already (lit.js:749). ───────────────────────────────────────
        const shadow = cloudShadow(wp).mul(U.cloudShadowDim).oneMinus().toVar();
        const litNoL = NoL.mul(shadow).mul(U.keyMul).toVar();

        // Base diffuse + hemisphere ambient (lit.js:757).
        const color = albedo.mul(amb.add(vec3(U.sunColor).mul(litNoL).mul(metalness.oneMinus()))).toVar();
        // SHADOW COOLNESS (lit.js:760-762).
        If(U.shadowTintAmt.greaterThan(0.001), () => {
          color.mulAssign(mix(vec3(1.0), vec3(0.90, 0.96, 1.12),
            U.shadowTintAmt.mul(clamp(litNoL.oneMinus(), 0.0, 1.0))));
        });

        // ── the 32-lamp spot loop (lit.js:766-873) ───────────────────────────
        // Windowed inverse-square + aimed cone + bleed + bounce fill + GGX and
        // clearcoat lamp lobes with their soft-clips. lampSh = 1 (TODO M4: the
        // nearest-floodlight shadow map slot).
        const lampFogAcc = vec3(0.0).toVar();
        Loop({ start: int(0), end: int(MAX_LIGHTS), type: "int", condition: "<" }, ({ i }) => {
          If(float(i).greaterThanEqual(U.numLights), () => { Break(); });
          const geo = U.lampGeo.element(i);
          const LP = U.lampPos.element(i).sub(wp).toVar();
          const dist = length(LP).toVar();
          const rad = geo.x;
          If(dist.lessThan(rad), () => {
            const Ld = LP.div(max(dist, 1e-3)).toVar();
            const dn = dist.div(rad);
            const win = clamp(dn.mul(dn).mul(dn).mul(dn).oneMinus(), 0.0, 1.0);
            const distC = max(dist, U.lampNearClamp);   // LAMP NEAR CLAMP
            const att = win.mul(win).div(distC.mul(distC).add(1.0)).toVar();
            If(att.greaterThanEqual(1e-6), () => {
              const cd = dot(Ld.negate(), U.lampDir.element(i));
              const beam = smoothstep(geo.z, geo.y, cd).toVar();
              const spotD = mix(geo.w, float(1.0), beam);                       // illumination follows the beam
              const spotS = mix(mix(float(0.16), float(0.30), wet).mul(U.lampWallSpill), float(1.0), beam);  // reflection floor
              // fog in-scatter share (consumed by the fog stack below)
              lampFogAcc.addAssign(U.lampCol.element(i).mul(att.mul(mix(float(0.35), float(1.0), beam))));
              const NoLl = max(dot(N, Ld), 0.0).toVar();
              // diffuse pool — fades as the road wets (reflection takes over)
              color.addAssign(albedo.mul(U.lampCol.element(i))
                .mul(att.mul(spotD)).mul(NoLl)
                .mul(metalness.oneMinus()).mul(wet.mul(0.85).oneMinus()));
              // bounce fill (uBounceK, def 0.04 — lit.js:841-845)
              color.addAssign(albedo.mul(U.lampCol.element(i))
                .mul(att.mul(U.bounceK).mul(NoLl.mul(0.45).add(0.55)))
                .mul(metalness.oneMinus()));
              // GGX + clearcoat lamp speculars, NoLl-gated (lit.js:846-871)
              If(NoLl.greaterThan(0.0), () => {
                const Hl = normalize(Ld.add(V));
                const NoHl = max(dot(N, Hl), 0.0).toVar();
                const VoHl = max(dot(V, Hl), 0.0).toVar();
                const Dl = D_GGX(NoHl, a);
                const Vl = V_SmithGGX(NoV, NoLl, a);
                const Fll = F_Schlick(VoHl, f0, clamp(rough.oneMinus(), 0.0, 1.0));
                const radianceS = U.lampCol.element(i).mul(att.mul(spotS)).toVar();
                const lspec = Fll.mul(Dl.mul(Vl)).mul(radianceS).mul(NoLl).toVar();
                color.addAssign(lspec.div(lspec.add(1.0)));                     // soft-clip
                If(clearcoat.greaterThan(0.001), () => {
                  const Dcc = D_GGX(NoHl, float(0.03));
                  const Vcc = V_SmithGGX(NoV, NoLl, float(0.01));
                  const Fcc = F_Schlick(VoHl, vec3(0.05), float(1.0)).x;
                  const ccl = radianceS.mul(Dcc.mul(Vcc).mul(Fcc)).mul(NoLl).mul(clearcoat).toVar();
                  color.addAssign(ccl.mul(2.2).div(ccl.add(2.2)));              // 2.2 HDR shoulder
                });
              });
            });
          });
        });

        // ── sun Cook-Torrance specular, soft-clipped (lit.js:875-881) ────────
        const D = D_GGX(NoH, a);
        const Vis = V_SmithGGX(NoV, NoL, a);
        const F = F_Schlick(VoH, f0, clamp(rough.oneMinus(), 0.0, 1.0));
        const specCol = F.mul(D.mul(Vis)).mul(vec3(U.sunColor)).mul(litNoL).toVar();
        specCol.assign(specCol.div(specCol.add(1.0)));
        color.addAssign(specCol);

        // ── clearcoat specular AA variance of Ngeo (lit.js:890-894) — gated
        //    on the UNIFORM so the derivative sits in uniform control flow ────
        const ccSaaVar = float(0.0).toVar();
        If(matU.clearcoat.greaterThan(0.001), () => {
          const ccDx = dFdx(Ngeo), ccDy = dFdy(Ngeo);
          ccSaaVar.assign(dot(ccDx, ccDx).add(dot(ccDy, ccDy)));
        });

        // ── clearcoat sun lobe (lit.js:901-926) ──────────────────────────────
        If(clearcoat.greaterThan(0.001), () => {
          const Hg = normalize(L.add(V));
          const NoHg = max(dot(Ngeo, Hg), 0.0);
          const NoVg = max(dot(Ngeo, V), 1e-4);
          const NoLg = max(dot(Ngeo, L), 0.0);
          const ccA = min(sqrt(ccSaaVar.mul(0.25).add(0.035 * 0.035)), 0.30);
          const Dc = D_GGX(NoHg, ccA);
          const Vc = V_SmithGGX(NoVg, NoLg, ccA);
          const Fc = F_Schlick(max(dot(V, Hg), 0.0), vec3(0.05), float(1.0)).x;
          const ccCol = vec3(U.sunColor).mul(Dc.mul(Vc).mul(Fc)).mul(NoLg)
            .mul(shadow).mul(U.keyMul).mul(clearcoat).toVar();
          ccCol.assign(ccCol.mul(2.6).div(ccCol.add(2.6)));   // 2.6 HDR ceiling
          color.addAssign(ccCol);
        });

        // ── analytic clearcoat ENV mirror (lit.js:939-990). uEnvStr stays 0 in
        //    M3 so only the analytic sky-gradient path runs. TODO M9: live env
        //    cube fetch (textureLod(uEnvCube, Rg, rough*2.5)) + uEnvStr fade. ──
        If(envSurface, () => {
          const Rg = reflect(V.negate(), Ngeo).toVar();
          const NoVc = max(dot(Ngeo, V), 1e-4);
          const ccFb = NoVc.oneMinus();
          const ccF = ccFb.mul(ccFb);                          // fresnel² (mul not pow: pow(0,2) NaNs on mobile)
          const probeLive = clamp(U.envStr, 0.0, 1.0);
          const baseRefl = mix(float(0.14), float(0.72), probeLive);
          const envW = clamp(clearcoat.mul(baseRefl.add(ccF.mul(0.28))).mul(rough.mul(0.25).oneMinus()), 0.0, 0.96);
          const horiz = smoothstep(-0.12, 0.30, Rg.y);
          const skyR = mix(vec3(U.skyHorizon).mul(1.2), vec3(U.skyZenith), sqrt(max(Rg.y, 0.0)));
          const envCC = mix(vec3(U.ambGround).mul(0.6), skyR, horiz).toVar();
          // sun disc in the mirror: pow-400 lobe widened by the AA variance
          const ccDiscA = sqrt(ccSaaVar.mul(0.25).add(0.0705 * 0.0705));
          const ccDiscExp = max(float(2.0).div(ccDiscA.mul(ccDiscA)).sub(2.0), 32.0);
          envCC.addAssign(vec3(U.sunColor)
            .mul(pow(max(dot(Rg, U.sunDir), 1e-4), ccDiscExp))
            .mul(U.carSunGlint).mul(shadow));
          color.mulAssign(envW.mul(0.94).oneMinus());          // absorb under the mirror
          const addCC = envCC.mul(envW);
          color.addAssign(addCC.div(addCC.mul(0.35).add(1.0)));  // gentle soft-clip
        });

        // ── metallic-flake sparkle (lit.js:997-1023) ─────────────────────────
        If(carPaint.greaterThan(0.001).and(litNoL.greaterThan(0.0)).and(matU.sparkle.greaterThan(0.001)), () => {
          const spFade = clamp(vd.sub(14.0).div(30.0).oneMinus(), 0.0, 1.0).mul(matU.sparkle).toVar();
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

        // ── environment sky reflection for glossy/wet surfaces (lit.js:1033-1070)
        const envBlend = clamp(float(0.40).sub(rough).div(0.30), 0.0, 1.0).mul(specular).toVar();
        envBlend.assign(max(envBlend, wet.mul(0.15)));
        If(envBlend.greaterThan(0.001), () => {
          const R = reflect(V.negate(), N).toVar();
          const skyT = pow(max(R.y, 1e-4), 0.40);
          const envColor = mix(vec3(U.skyHorizon), vec3(U.skyZenith), skyT).toVar();
          const envSunAlign = max(dot(R, U.sunDir), 0.0).toVar();
          envColor.assign(mix(envColor, envColor.mul(U.sunColor).mul(1.15),
            envSunAlign.mul(envSunAlign).mul(rough.oneMinus())));
          // dry glossy glass sun flash (WINDOW SUN FLASH knob)
          envColor.addAssign(vec3(U.sunColor).mul(pow(max(envSunAlign, 1e-4), 22.0))
            .mul(wet.oneMinus()).mul(envBlend).mul(0.6).mul(U.windowSunFlash));
          const roughDamp = rough.mul(0.7).oneMinus();
          const envFresnel = F_Schlick(max(dot(N, V), 0.0), vec3(0.04), float(1.0)).x.toVar();
          envFresnel.assign(mix(envFresnel, envFresnel.mul(envFresnel), wet));
          const envWet = envColor.mul(wet.mul(0.90).oneMinus());
          const envAdd = envWet.mul(envFresnel).mul(envBlend).mul(roughDamp).mul(metalness.oneMinus()).toVar();
          const envM = max(max(envAdd.r, envAdd.g), envAdd.b);
          color.addAssign(envAdd.div(envM.add(1.0)));           // Reinhard shoulder
        });

        // ── sky rim fresnel (lit.js:1075-1079) ───────────────────────────────
        {
          const rf = NoV.oneMinus();
          const rimFresnel = rf.mul(rf).mul(rf);
          const rimAmt = rimFresnel.mul(rough.mul(0.85).oneMinus()).mul(0.18).mul(U.skyRimGlow);
          color.addAssign(vec3(U.skyHorizon).mul(rimAmt));
        }

        // ── ambient contact darkening (lit.js:1086-1089) ─────────────────────
        {
          const ao = pow(max(N.y.mul(0.5).add(0.5), 1e-4), 0.35);
          color.mulAssign(mix(float(0.12).mul(U.ambContactDark).oneMinus(), float(1.0), ao));
        }

        // ── emissive + over-white hdrTag glow (lit.js:1095-1117). The hdrTag
        //    push is computed NOW so >1 albedos (neon/lenses) carry HDR energy;
        //    bloom consumes it in M8. ───────────────────────────────────────────
        If(emissive.greaterThan(0.0), () => {
          color.assign(mix(color, albedo, emissive));
          const bright = max(albedo.r, max(albedo.g, albedo.b));
          const glow = smoothstep(0.50, 0.95, bright).mul(emissive);
          const hdrTag = max(bright.sub(1.0), 0.0);
          color.addAssign(albedo.mul(glow).mul(U.glowAmp).mul(hdrTag.mul(U.bloomBoost).add(1.0)));
        });

        // ── fog stack (lit.js:1119-1170) ─────────────────────────────────────
        // squared-exponential height fog
        const heightAtten = select(U.fogHeight.greaterThan(0.0),
          exp(max(wp.y.sub(cameraPosition.y), 0.0).negate().mul(U.fogHeight)),
          float(1.0));
        const fd = vd.mul(U.fogDensity).mul(heightAtten);
        const f = exp(fd.mul(fd).negate()).oneMinus();
        // sun in-scatter: broad pow4 + tight pow16 core (FOG SUN CORE)
        const rd = V.negate();
        const sunAmount = max(dot(rd, U.sunDir), 0.0).toVar();
        const sunAmt = max(sunAmount, 1e-4);
        const fogCol = mix(vec3(U.fogColor), vec3(U.sunColor), pow(sunAmt, 4.0)).toVar();
        fogCol.addAssign(vec3(U.sunColor).mul(pow(sunAmt, 16.0)).mul(U.fogSunCore));
        // FOG WARM/COOL white-balance matrix
        fogCol.mulAssign(vec3(
          float(1.0).add(max(U.fogTint, 0.0).mul(0.25)).sub(max(U.fogTint.negate(), 0.0).mul(0.12)),
          float(1.0).sub(abs(U.fogTint).mul(0.02)),
          float(1.0).sub(max(U.fogTint, 0.0).mul(0.25)).add(max(U.fogTint.negate(), 0.0).mul(0.18))));
        // glowing fog: lamp in-scatter, Reinhard-clipped (FOG GLOW CLIP)
        const lampFogC = vec3(0.0).toVar();
        If(U.lampFog.greaterThan(0.0), () => {
          const lf = lampFogAcc.mul(U.lampFog);
          lampFogC.assign(lf.div(max(max(lf.r, lf.g), lf.b).mul(U.lampFogClip).add(1.0)));
          fogCol.addAssign(lampFogC);
        });
        color.assign(mix(color, fogCol, f));
        // low-lying ground mist: drifting 2-oct cloudFBM band
        If(U.groundMist.greaterThan(0.001), () => {
          const lowH = max(wp.y.sub(cameraPosition.y.sub(5.0)), 0.0);
          const band = exp(lowH.negate().mul(float(0.09).div(max(U.mistHeight, 0.05))));
          const mp = wp.xz.mul(0.020).add(vec2(U.time.mul(0.010), U.time.mul(0.006)));
          const dRamp = clamp(vd.sub(8.0).div(45.0), 0.0, 1.0);
          const mist = U.groundMist.mul(band).mul(smoothstep(0.35, 0.72, cloudFBM(mp))).mul(dRamp);
          const mistCol = mix(vec3(U.fogColor), vec3(U.sunColor), pow(max(sunAmount, 1e-4), 3.0))
            .add(lampFogC.mul(U.mistShare));
          color.assign(mix(color, mistCol, clamp(mist, 0.0, 0.45)));
        });

        // ── output alpha ──────────────────────────────────────────────────────
        // GLX tags car-paint pixels in alpha (0.35) for the composite SSR pass
        // (lit.js:1171-1174). TODO M8: emit `select(carPaint.greaterThan(0.001),
        // float(0.35), matU.alpha)` once the scene renders into the offscreen
        // HDR target — in M3 the target IS the composited canvas, where a 0.35
        // alpha would ghost the cars against the page. Until then: translucent
        // draws carry their real alpha (blending), opaque draws write 1.
        return vec4(color, matU.alpha);
      })();
    }

    /* ── FLAG cloth-wave vertex displacement (LIT_VS — lit.js:29-40) ─────────
     * mat in [15,16): fract(aMat)*2.5 = per-vertex wave weight; a travelling
     * two-sine ripple displaces along the face normal. U.time (frame.time) is
     * the clock — deterministic with the game. */
    function flagPositionNode() {
      const matA = attribute("mat", "float");
      const isFlag = matA.greaterThanEqual(15.0).and(matA.lessThan(16.0));
      const fw = fract(matA).mul(2.5);
      const ph = U.time.mul(5.5).add(positionGeometry.x.mul(1.9)).add(positionGeometry.z.mul(1.9));
      const wave = sin(ph).mul(0.085).add(sin(ph.mul(2.17).add(1.3)).mul(0.045)).mul(fw);
      return positionLocal.add(normalLocal.mul(select(isFlag, wave, float(0.0))));
    }

    /* ── material factory ─────────────────────────────────────────────────────
     * makeMaterial(opts) -> THREE.MeshBasicNodeMaterial with the full lit
     * fragment as colorNode/opacityNode. opts carries the GLX per-draw scalars
     * (defaults = glx.js litMaterial defaults) plus flags:
     *   doubleSided, depthBias:[factor,units], noAlphaWrite (M8), chunked
     * (drawChunked keeps depthWrite TRUE even when alpha<1 — GLX asymmetry).
     * The scalars become per-material uniform nodes, so every variant emits
     * the same program text (one real compile; tlx.js caches variants). */
    function makeMaterial(opts) {
      const o = opts || {};
      const val = (v, d) => (v !== undefined ? v : d);
      const matU = {
        emissive:  uniform(val(o.emissive, 0)),
        alpha:     uniform(val(o.alpha, 1)),
        roughness: uniform(val(o.roughness, 0.7)),
        metalness: uniform(val(o.metalness, 0.0)),
        specular:  uniform(val(o.specular, 0.5)),
        detail:    uniform(val(o.detail, 0.0)),
        clearcoat: uniform(val(o.clearcoat, 0.0)),
        carPaint:  uniform(val(o.carPaint, 0.0)),
        sparkle:   uniform(val(o.sparkle, 1.0)),
      };
      const alpha = val(o.alpha, 1);
      const m = new THREE.MeshBasicNodeMaterial();
      const packed = buildFragment(matU);
      m.colorNode = packed.rgb;
      m.opacityNode = packed.a;
      m.positionNode = flagPositionNode();
      m.transparent = alpha < 1;
      // GLX: draw() -> depthMask(alpha>=1); drawChunked() -> depthMask(true).
      m.depthWrite = o.chunked ? true : alpha >= 1;
      m.side = o.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
      if (o.depthBias) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = o.depthBias[0];
        m.polygonOffsetUnits = o.depthBias[1];
      }
      // noAlphaWrite (GLX colorMask RGB-only): moot while opaque alpha is
      // pinned to 1 (see the output-alpha note above). TODO M8: honour it on
      // the offscreen target (three has no per-channel colorWrite — mask the
      // tag in the shader instead: alpha = noAlphaWrite ? 1 : tag).
      m.__tlxMatU = matU;   // per-draw uniform handles (tlx.js refresh path)
      return m;
    }

    /* ── viz materials (?viz= / apex26.tlxViz — the spike's bisect tooling) ──
     *   'mat'    paint the mat attribute as colour (id -> hashed palette)
     *   'normal' paint N*0.5+0.5
     *   'lamp'   paint RAW lamp-loop output (diffuse pool only, albedo 0.25) */
    function makeViz(mode) {
      const m = new THREE.MeshBasicNodeMaterial();
      if (mode === "normal") {
        m.colorNode = Fn(() => {
          const N = vec3(normalWorld).toVar();     // anchor
          return normalize(N).mul(0.5).add(0.5);
        })();
      } else if (mode === "lamp") {
        m.colorNode = Fn(() => {
          const wp = vec3(positionWorld).toVar();  // anchors
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
              const beam = smoothstep(geo.z, geo.y, dot(Ld.negate(), U.lampDir.element(i)));
              const NoLl = max(dot(normalize(N), Ld), 0.0);
              sum.addAssign(U.lampCol.element(i).mul(att.mul(mix(geo.w, float(1.0), beam))).mul(NoLl).mul(0.25));
            });
          });
          return sum;
        })();
      } else {   // 'mat' (default): hashed per-id palette
        m.colorNode = Fn(() => {
          const matA = float(attribute("mat", "float")).toVar();   // anchor
          const id = floor(matA.add(0.5));
          return vec3(fract(id.mul(0.6180339)).mul(0.8).add(0.2),
                      fract(id.mul(0.3819660).add(0.33)).mul(0.8).add(0.2),
                      fract(id.mul(0.2360679).add(0.67)).mul(0.8).add(0.2));
        })();
      }
      m.side = THREE.DoubleSide;
      return m;
    }

    return { makeMaterial, makeViz, uniforms: U, updateFrame, MAX_LIGHTS };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { lit });
})();
