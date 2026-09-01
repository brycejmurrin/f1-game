/* Apex 26 — TLXShaders.lit: the TSL lit-shader core for the TLX backend (M3).
 *
 * A 1:1 port of js/render/shaders/lit.js (the GLSL source of truth) into
 * three.js TSL nodes: all 15 procedural track materials + the car surface ids
 * (20-27, including MIRROR chrome), the FLAG cloth-wave vertex displacement, hemisphere ambient +
 * lambert sun + GGX specular (soft-clipped), the 32-lamp spot loop with GGX +
 * clearcoat lobes, cloud shadows, wetness, the analytic clearcoat env mirror,
 * metallic-flake sparkle, emissive/hdrTag over-white glow, and the full fog
 * stack (height fog + sun in-scatter + fogTint + lamp-fog Reinhard + ground
 * mist). Constants are lifted verbatim from lit.js — line refs in comments.
 *
 * M4: sun/car/lamp SHADOW-MAP sampling is live — a 1:1 port of lit.js
 * sampleShadow() + the in-loop lamp shadow (the uLampShadowOn branch), fed by
 * tlx-shadow.js depth targets through ctx.shadow. Depth taps compile to
 * hardware-compare sampler2DShadow on the WebGL backend via TSL's
 * texture(...).compare(z); shadow-map UVs are passed in three's WebGPU
 * convention (y flipped once here; the texture node's flipY re-flips on the
 * GL backend — the same double-flip three's own shadow code relies on).
 *
 * PCSS blocker search HAS landed on WebGPU (textureLoad depth) and desktop
 * WebGL2 (R16F TSL.depth color — texelFetch is legal on a color texture).
 * The sun branch scales R = mix(1.5, 6.0, pen) from the receiver-blocker
 * gap. Phones and software WebGL2 have no blocker — they scale that same
 * R=3 by pcssPen/80 (identity at the shipped def) so SHADOW SOFTEN stays
 * live. Not distance-based PCSS on that path.
 *
 * M9 (the live env CUBE probe) HAS landed and is no longer stubbed: tlx.js
 * builds the cube target and drives setEnvStr() from the probe-ready state,
 * and the clearcoat mirror below blends the real cube fetch.
 *   - SSR car-paint ALPHA TAG (M8): written when ctx.ssrTag is set — the
 *     post chain's offscreen HDR target carries it to the composite's SSR.
 *     Without a chain (direct to canvas) the tag stays off (the M3 rule).
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
  const MAX_LIGHTS_DEF = 48;
  // iOS Safari rendered NOTHING on the lit path at 48. WebGL2's fragment floor
  // is 224 vec4 ROWS and a uniform array is always VERTICAL — vec3[48] costs 48
  // rows, not 12 (webgl2fundamentals, "WebGL2 Cross Platform Issues"). So
  // lampPos/Col/Dir + lampGeo alone are 4 x 48 = 192 of 224, leaving 32 for
  // every matrix, fog, sun and material uniform (a mat4 is 4). glx.js records
  // the same 192 and squeaks under with a lean hand-written shader; three/TSL
  // adds its own block on top and goes OVER, so the shader fails to LINK and
  // every lit surface draws nothing — while textured/emissive ones still draw.
  // 16 lamps = 64 rows. Same _liteGpu gate as samples/outputType in tlx.js.
  const MAX_LIGHTS_LITE = 16;

  function lit(THREE, TSL, ctx) {
    // Read from ctx so the cap is decided at factory time, BEFORE the TSL graph
    // is built: the Loop bounds and the CPU-side arrays must agree, and both
    // read this one binding.
    const MAX_LIGHTS = (ctx && ctx.maxLights > 0) ? (ctx.maxLights | 0) : MAX_LIGHTS_DEF;
    const {
      Fn, If, Loop, Break, uniform, uniformArray, attribute, varying, texture, cubeTexture,
      float, int, vec2, vec3, vec4, mrt,
      positionWorld, positionGeometry, positionLocal, normalLocal, normalWorld,
      cameraPosition, frontFacing,
      fract, floor, mod, dot, cross, mix, smoothstep, clamp, pow, exp, sqrt,
      abs, max, min, normalize, length, reflect, select, sin, cos,
      dFdx, dFdy, fwidth, materialReference,
    } = TSL;
    const { hash21, vnoise, ignoise } = ctx.chunks;

    // r184 NodeMaterial.customProgramCacheKey() hashes child-node ids, and
    // MeshBasicNodeMaterial.lights defaults TRUE. setup() mints a fresh
    // wrapper graph on every NodeBuilder miss, the key changes, the next
    // mesh misses again — a Monza load compiled 593 unique vertex programs
    // whose GLSL differed only in `NodeUniforms<id>` names (measured
    // 2026-08-17, ~60 s inside getProgramParameter). We do not use three's
    // lights (colorNode is the whole shader). A stable key + lights=false
    // lets the node-builder cache hit across every mesh that shares a
    // program family (lit vs lit-chunked).
    const _pinKeys = Object.create(null);
    function pinProgram(m, key) {
      m.lights = false;
      // Lit already does its own fog / albedo. three's NodeMaterial fog
      // (default true) and vertexColors would run on top of colorNode and
      // double-darken bodywork; premultiply would then scale that by the
      // SSR tag if it ever leaked back into opacity.
      m.fog = false;
      m.vertexColors = false;
      m.premultipliedAlpha = false;
      // Key must change when mrtNode is armed: HDR writes 2 attachments,
      // env cube / canvas write 1. A pinned constant key would reuse the
      // wrong program and fail WebGPU validation on the cube.
      m.customProgramCacheKey = () => key + (m.mrtNode ? "-mrt" : "");
    }

    // ── M4: the tlx-shadow.js subsystem (null/absent -> no shadow code is
    //    built and uShadowStr stays 0, the M3 look). Sun sampling is gated on
    //    the sun map existing; car/lamp blocks on their (desktop-only) maps —
    //    the mobile tier never compiles them, mirroring GLX's always-bound-
    //    texture trick without needing dummy bindings. ─────────────────────
    const SHD = (ctx.shadow && ctx.shadow.S) ? ctx.shadow : null;
    // M8: the offscreen HDR target exists — write the SSR car-paint tag into
    // alpha (js/render/shaders/lit.js). False (no post chain) keeps the M3 behaviour:
    // the canvas is the target and a 0.35 alpha would ghost the cars.
    const SSR_TAG = !!ctx.ssrTag;
    // M9: the live env-probe cube (tlx.js CubeRenderTarget.texture), bound at
    // factory time. Null (no probe target) keeps the analytic-gradient mirror
    // ONLY — the pre-M9 look. A JS-level guard, so the cube fetch is absent
    // from the compiled program when there's no cube (no dummy binding needed).
    // ONE shared cube node across every material variant (like the U.* uniform
    // nodes): tlx.js swaps its .value to a black dummy cube while rendering
    // INTO the probe (the env pass draws glass, an envSurface — sampling the
    // live cube there would be a texture feedback loop; GLX's dummy-cube guard,
    // js/render/glx.js). cubeTexture(base, dir, lod) clones per use with
    // referenceNode = base (three.js CubeTextureNode), so the swap covers
    // every variant. CubeTextureNode has no .uv() — that is a 2D TextureNode
    // setter and threw on every chrome/env surface.
    const ENV_CUBE = ctx.envCube || null;
    const envCubeNode = ENV_CUBE ? cubeTexture(ENV_CUBE) : null;
    const shadowOn = !!(SHD && SHD.S.enabled && SHD.sunTex);
    const carShadowOn = !!(shadowOn && SHD.S.carEnabled && SHD.carTex);
    const lampShadowOn = !!(shadowOn && SHD.S.lampEnabled && SHD.lampTex);
    const PI = 3.14159265359;

    /* ── frame + tune uniforms ────────────────────────────────────────────────
     * One shared set across every material variant (uniform nodes are shared
     * descriptors; tlx.js calls updateFrame(frame) once per begin()).
     * Defaults MUST mirror LightTune.TUNE_DEFS (js/game/lighting.js) exactly
     * like js/render/glx.js — a missing tune object renders the shipped look. */
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
      envStr:         uniform(0.0),   // live env-probe strength; set by setEnvStr() from tlx.js begin()
      numLights:      uniform(0),
      // ── M4 shadow uniforms (the litU.uShadow* uploads in glx.js; defaults mirror TUNE_DEFS) ──
      // shadowStr is the EFFECTIVE strength: knob × key-luminance fade (with
      // the MOON SHADOWS floor), computed CPU-side in updateFrame like GLX.
      shadowStr:      uniform(0.0),   // SHADOW DARKNESS (def 1.15) × key fade; 0 until a frame arrives
      shadowRange:    uniform(80.0),  // SHADOW DISTANCE (box half-size, m)
      shadowBias:     uniform(0.001), // SHADOW BIAS
      shadowTexel:    uniform(1 / 2048),
      shadowCtr:      uniform(new THREE.Vector3()),   // gliding fade anchor (frame.shadowCtr)
      // SHADOW SOFTEN (uPcssPen parity). Consumed by the blocker-search branch
      // below when the shadow system built its WebGPU blocker map
      // (SHD.blockerTex, tlx-shadow.js header); phones / software GL have no
      // blocker map and keep the fixed radius `R = 3.0`. Desktop WebGL2 and
      // WebGPU compile the blocker-scaled branch. pcssOn is
      // the RUNTIME gate (glx.js uPcss 1:1): updateFrame re-reads
      // S.pcssEnabled each frame so a live blocker failure degrades cleanly.
      pcssPen:        uniform(80.0),
      pcssOn:         uniform(0.0),
      lightVP:        uniform(new THREE.Matrix4()),
      carLightVP:     uniform(new THREE.Matrix4()),
      carShadowOn:    uniform(0.0),
      carBiasScale:   uniform(1.0),   // car map box/texel ratio (lit.js uCarBiasScale parity)
      lampShadowVP:   uniform(new THREE.Matrix4()),
      lampShadowOn:   uniform(0.0),
      lampShadowIdx:  uniform(-1.0),  // float compare vs the loop index (small ints are exact)
    };
    // Lamp arrays: the flat stride-15 frame.lights record split by consumer,
    // exactly like js/render/glx.js / the spike. geo = (rad, cosInner, cosOuter,
    // bleed). volW/glareW are godray/glow-pass fields — not consumed here.
    const lampPos = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
    const lampCol = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
    const lampDir = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -1, 0));
    const lampGeo = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(1, 0.8, 0.5, 0));
    U.lampPos = uniformArray(lampPos);
    // BAKED MATERIALS (TUNE_DEFS matTexMix, shipped 1.0 — the pack ships ON)
    // + per-layer world tile size. 17 entries so the array is indexable by MAT
    // id directly; 0 means "this material has no baked layer" and every sample
    // site tests it first.
    // WAS 0.0, on both this declaration and the updateFrame fallback below,
    // while TUNE_DEFS and the glx.js bindMaterialMaps() call both defaulted to
    // 1.0. A frame arriving with no `tune` object — or with matTexMix absent
    // from it — therefore rendered pure procedural on TLX and baked on GLX
    // from the same input, breaking the rule stated in the `frame` contract of
    // js/render/gfx.js that a backend's defaults MUST mirror TUNE_DEFS.
    // Defaulting ON is safe with no pack: matTexScale stays all-zero and every
    // sample site gates on it (and MAT_MAPS absent compiles none of this in).
    U.matTexMix = uniform(1.0);
    U.matTexScale = uniformArray(new Array(17).fill(0));
    U.lampCol = uniformArray(lampCol);
    U.lampDir = uniformArray(lampDir);
    U.lampGeo = uniformArray(lampGeo);

    /** begin(frame) -> uniform values. Mirrors the semantics of glx.js begin():
     * ambient scaled CPU-side by tune.ambientMul; keyMul/fog/mist knobs applied
     * where glx.js applies them; every default = TUNE_DEFS def.
     * uf1: GLX `_litUf` parity — skip a scalar `.value` write when it already
     * equals the resolved number. First begin() writes (constructor defaults
     * differ, or the node is still the TUNE_DEFS seed); later frames skip
     * unchanged LIGHTING TUNER knobs. Factory-scoped: no alloc per frame.
     * Color / Vector3 / Matrix4 lanes stay on `u.value.set` / `.fromArray`. */
    function uf1(u, v) {
      if (u.value !== v) u.value = v;
    }
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
      uf1(U.fogHeight, T && T.fogHeight != null ? T.fogHeight
        : (frame.fogHeight != null ? frame.fogHeight : 0.0));
      U.groundMist.value = (frame.groundMist != null ? frame.groundMist : 0) * k("mistDensity", 1);
      U.lampFog.value = frame.lampFog != null ? frame.lampFog : 0;
      U.wetness.value = frame.wetness != null ? frame.wetness : 0;
      U.time.value = frame.time != null ? frame.time : 0;
      U.cloudCover.value = frame.cloud != null ? frame.cloud : 0;
      U.cloudSpeed.value = frame.cloudSpeed != null ? frame.cloudSpeed : 1;
      uf1(U.bounceK, k("bounceK", 0.04));
      uf1(U.mistShare, k("mistShare", 1.5));
      uf1(U.lampFogClip, k("fogClip", 0.7));
      uf1(U.glowAmp, k("glowAmp", 2.3));
      uf1(U.bloomBoost, k("neonBoost", 0.6));
      uf1(U.keyMul, k("keyMul", 1.0));
      uf1(U.fogTint, k("fogTint", 0.0));
      uf1(U.mistHeight, k("mistHeight", 0.30));
      uf1(U.shadowTintAmt, k("shadowTintAmt", 0.0));
      uf1(U.wetDark, k("wetDark", 1.0));
      uf1(U.matTexMix, k("matTexMix", 1.0));   // TUNE_DEFS def (was 0.0 — see the declaration)
      uf1(U.cloudShadowDim, k("cloudShadowDim", 0.80));
      uf1(U.carSunGlint, k("carSunGlint", 12.0));
      uf1(U.carSparkle, k("carSparkle", 1.6));
      uf1(U.fogSunCore, k("fogSunCore", 0.6));
      uf1(U.lampNearClamp, k("lampNearClamp", 4.0));
      uf1(U.windowSunFlash, k("windowSunFlash", 1.0));
      uf1(U.skyRimGlow, k("skyRimGlow", 1.0));
      uf1(U.ambContactDark, k("ambContactDark", 1.0));
      uf1(U.lampWallSpill, k("lampWallSpill", 1.0));
      U.envStr.value = 0;   // M9: overwritten by lit.setEnvStr() in tlx.js begin() from the probe-ready state
      // ── M4 shadow upload (1:1 with the litU.uShadow* block in glx.js) ──
      if (shadowOn) {
        uf1(U.shadowBias, k("shadowBias", 0.001));
        uf1(U.pcssPen, k("pcssPen", 80.0));
        U.pcssOn.value = SHD.S.pcssEnabled ? 1 : 0;
        // Key-luminance fade: cast shadows dissolve as the key dims toward
        // moonlight, floored by MOON SHADOWS × the clear-night factor
        // (frame.moonGate — clear-night moonK, or above 0.5 the knob itself
        // forcing the floor open regardless of weather) so bright clear moons
        // keep soft shadows.
        const _kl = frame.sunColor
          ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
        let _hf = (_kl - 0.28) / 0.14;
        _hf = _hf < 0 ? 0 : _hf > 1 ? 1 : _hf;
        _hf = _hf * _hf * (3 - 2 * _hf);
        const _mSh = k("moonShadow", 0.25) * (frame.moonGate || 0);
        if (_mSh > _hf) _hf = _mSh;
        U.shadowStr.value = k("shadowStr", 1.15) * _hf;
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
          U.lampShadowOn.value = SHD.S.lampArmed ? 1 : 0;
          U.lampShadowIdx.value = SHD.S.lampIdx;
        }
      }
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

    /* ── BRDF leaves (js/render/shaders/lit.js) — plain node composition, inlined ────── */
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

    /* ── cloud shadows (js/render/shaders/lit.js) ─────────────────────────────────────── */
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
        // divisor floored at 0.15 (grazing-sun stripe fix — see js/render/shaders/lit.js)
        const t = float(360.0).sub(wp.y).div(max(U.sunDir.y, 0.15));
        const cT = U.time.mul(U.cloudSpeed);
        const cp = wp.xz.add(U.sunDir.xz.mul(t)).mul(0.0052)
          .add(vec2(cT.mul(0.012), cT.mul(0.005)));
        const c = cloudFBM(cp);
        res.assign(smoothstep(float(0.54).sub(U.cloudCover.mul(0.40)), 0.92, c).mul(U.cloudCover));
      });
      return res;
    });

    /* ── M4 sun-shadow sampling (sampleShadow in js/render/shaders/lit.js) ───
     * Distance fade from eye XZ + look-target Y (yaw-invariant; the box still
     * recentres in 16 m jumps), slope-scale bias, boxK kernel compensation,
     * near/far LOD split (8-tap Poisson + 4-tap far — the GLX Poisson set
     * compiles clean in TSL), texel-grid-anchored IGN dither, car-map
     * min-combine (ortho — no perspective divide), and the PCSS-lite blocker
     * search when SHD.blockerTex exists (WebGPU backend, tlx-shadow.js
     * header) — R fixed at 3.0 otherwise, the GLX radius when uPcss is off.
     * Shadow-map UV convention: three's node system uses WebGPU texture
     * space, so sample at (x, 1-y); on the WebGL backend the texture node's
     * automatic flipY for depth textures flips it back to GL space — the same
     * double-flip three's own BasicShadowFilter relies on. */
    const flipUV = (u) => vec2(u.x, u.y.oneMinus());
    const sampleShadow = !shadowOn ? null : Fn(([wpIn, nrmIn]) => {
      const wp = vec3(wpIn).toVar();
      const nrm = vec3(nrmIn).toVar();
      const res = float(1.0).toVar();
      // GLX parity (js/render/shaders/lit.js sampleShadow): uShadowStr <= 0
      // collapses the whole function to 1.0 — mix(1, sh, 0) is identity — so
      // skip every PCF / car-map tap on overcast-night frames where the CPU
      // already drove strength to 0 via the key-luminance fade.
      If(U.shadowStr.greaterThan(0.0), () => {
        const lc = U.lightVP.mul(vec4(wp, 1.0)).toVar();
        const sc = lc.xyz.div(lc.w).mul(0.5).add(0.5).toVar();
        If(sc.z.lessThan(1.0), () => {
          // Yaw-invariant fade: eye XZ + look-target Y (js/render/shaders/lit.js).
          const fadeCtr = vec3(cameraPosition.x, U.shadowCtr.y, cameraPosition.z);
          const aDist = length(wp.sub(fadeCtr)).toVar();
          const edgeFade = smoothstep(U.shadowRange.mul(0.62), U.shadowRange.mul(0.84), aDist)
            .oneMinus().toVar();
          // Thin UV border safety feather (js/render/shaders/lit.js).
          const ef = smoothstep(vec2(0.0), vec2(0.03), sc.xy)
            .mul(smoothstep(vec2(0.97), vec2(1.0), sc.xy).oneMinus());
          edgeFade.mulAssign(ef.x.mul(ef.y));
          If(edgeFade.greaterThan(0.0), () => {
            const t = float(U.shadowTexel).toVar();
            // Slope-scale bias: tan(acos(c)) as sqrt(1-c²)/c (js/render/shaders/lit.js).
            const cosTheta = clamp(dot(normalize(nrm), U.sunDir), 0.05, 1.0);
            const slopeBias = t.mul(1.5).mul(sqrt(cosTheta.mul(cosTheta).oneMinus()).div(cosTheta));
            const biasTerm = clamp(slopeBias, 0.0005, 0.004).add(U.shadowBias.mul(0.5)).toVar();
            // SHADOW DISTANCE bias scaling (lit.js parity). biasTerm is clamped in
            // absolute depth units, but a shadow texel's world size sweeps 12.5x
            // across the SHADOW DISTANCE range — unscaled, the same push is ~25x
            // too much at the near end and barely covers acne at the far end.
            // STATIC map only: the car branch below multiplies the SAME biasTerm
            // by carBiasScale, so scaling the shared term would square it there.
            const z = sc.z.sub(biasTerm.mul(U.shadowRange.div(80.0))).toVar();
            // SHADOW DISTANCE kernel compensation (js/render/shaders/lit.js).
            const boxK = min(1.0, float(80.0).div(U.shadowRange)).toVar();
            // Distance LOD on the same gliding anchor (js/render/shaders/lit.js).
            const nearLod = aDist.lessThan(U.shadowRange.mul(0.80)).toVar();
            // PCSS-lite blocker search (js/render/shaders/lit.js): near the
            // camera the receiver-blocker gap scales the Poisson radius —
            // crisp at the contact point, soft where the caster is far.
            // Compiled only when the shadow system built its blocker map
            // (WebGPU or desktop WebGL2); gated at runtime on pcssOn like
            // GLX's uPcss. Fixed R = 3.0 otherwise — GLX's blocker-off radius.
            const R = float(3.0).toVar();
            if (SHD.blockerTex) {
              If(nearLod.and(U.pcssOn.greaterThan(0.5)), () => {
                const bt = float(1.5 / (SHD.blockerSize || 512)).mul(boxK).toVar();
                const btap = (px, py) =>
                  texture(SHD.blockerTex, flipUV(sc.xy.add(vec2(px, py).mul(bt)))).r;
                const zb = min(min(btap(-1.0, 1.0), btap(1.0, 1.0)),
                               min(btap(-1.0, -1.0), btap(1.0, -1.0)));
                const pen = clamp(z.sub(zb).mul(U.pcssPen), 0.0, 1.0);
                R.assign(mix(float(1.5), float(6.0), pen));
              }).Else(() => {
                // Desktop WebGL2 / WebGPU: blocker exists but PCSS is off
                // (far LOD, or S.pcssEnabled flipped false). Keep SHADOW
                // SOFTEN live — same R-scale as the no-blocker path.
                R.assign(float(3.0).mul(U.pcssPen.div(80.0)));
              });
            } else {
              // Phones / software WebGL2: no blocker (no TSL.depth sun RT).
              // Keep SHADOW SOFTEN live by scaling the fixed Poisson R.
              // Identity at TUNE_DEFS def 80. Same tap count — not PCSS.
              R.assign(float(3.0).mul(U.pcssPen.div(80.0)));
            }
            // Texel-grid-anchored IGN dither (js/render/shaders/lit.js): glued to the
            // ground, not screen-keyed — no penumbra boil while driving.
            const ign = ignoise(floor(sc.xy.div(t)));
            const ang = ign.mul(6.2831853);
            const cr = cos(ang).toVar(), sr = sin(ang).toVar();
            const rk = t.mul(R).mul(boxK).toVar();
            // mat2(cr,-sr,sr,cr) * v == (cr*x + sr*y, -sr*x + cr*y), scaled rk.
            const rot = (px, py) => vec2(
              cr.mul(px).add(sr.mul(py)),
              sr.negate().mul(px).add(cr.mul(py))).mul(rk);
            const tap = (px, py) =>
              texture(SHD.sunTex, flipUV(sc.xy.add(rot(px, py)))).compare(z);
            // 4 Poisson taps always; 4 more near the camera (js/render/shaders/lit.js).
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
            // Dynamic CAR map min-combine (js/render/shaders/lit.js): ortho, so no
            // perspective divide; same bias; fixed tight 4-tap PCF.
            if (carShadowOn) {
              If(U.carShadowOn.greaterThan(0.5), () => {
                const cc = U.carLightVP.mul(vec4(wp, 1.0));
                const cs = cc.xyz.mul(0.5).add(0.5).toVar();
                If(cs.x.greaterThan(0.0).and(cs.x.lessThan(1.0))
                  .and(cs.y.greaterThan(0.0)).and(cs.y.lessThan(1.0))
                  .and(cs.z.lessThan(1.0)), () => {
                  const cz = cs.z.sub(biasTerm.mul(U.carBiasScale)).toVar();
                  const ct = (1.0 / 1024.0) * 0.75;   // CAR_SHADOW_SIZE texel, tightened
                  const ctap = (px, py) =>
                    texture(SHD.carTex, flipUV(cs.xy.add(vec2(px, py)))).compare(cz);
                  const csh = ctap(-ct, -ct).add(ctap(ct, -ct))
                    .add(ctap(-ct, ct)).add(ctap(ct, ct)).mul(0.25);
                  sh.assign(min(sh, csh));
                });
              });
            }
            // Clamped: SHADOW DARKNESS extrapolates above t=1 (js/render/shaders/lit.js).
            res.assign(max(0.0, mix(float(1.0), sh, U.shadowStr.mul(edgeFade))));
          });
        });
      });
      return res;
    });

    /* ── matBumpHeight (js/render/shaders/lit.js): scalar relief height for material mid
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
      }).ElseIf(mid.equal(16.0), () => {  // ASPHALT: fine aggregate only (js/render/shaders/lit.js)
        // Two tight octaves and nothing below ~0.1 m. A low-frequency term here
        // would read as a rippled road under the car and crawl at speed.
        h.assign(vnoise(uv.mul(9.0)).mul(0.34).add(vnoise(uv.mul(26.0)).mul(0.16)));
      });
      return h;
    });

    // Per-MATERIAL coordinate classification, shared by the procedural bump and
    // the baked texture sample below (GLX: matWallLike in lit.js). Declared here
    // rather than next to the baked-texture block so it precedes its first use.
    const matWallLike = (mid) => mid.equal(1.0).or(mid.equal(2.0)).or(mid.equal(4.0))
      .or(mid.equal(5.0)).or(mid.equal(7.0)).or(mid.equal(12.0))
      .or(mid.equal(13.0)).or(mid.equal(14.0));

    /* ── applyMaterialNormal (js/render/shaders/lit.js): REAL bump — perturbs the shading
     *    normal before the lighting terms consume it. Wall-like materials key
     *    off (hc,y); organic ones off world (x,z). GLASS(3)/FLAG(15) flat.
     *    Returns the perturbed normal (TSL has no inout). ─────────────────── */
    const applyMaterialNormal = Fn(([mid, Nin, wpIn, vd]) => {
      const N = vec3(Nin).toVar();
      const wp = vec3(wpIn).toVar();
      const bumpFade = clamp(vd.sub(22.0).div(58.0).oneMinus(), 0.0, 1.0).toVar();
      // 1..14 plus ASPHALT(16); GLASS(3) and FLAG(15) are excluded, matching
      // GLX's `mid == 0 || mid == 3 || mid == 15` early-out. ASPHALT was
      // outside the old < 14.5 bound, so the road — the surface on screen for
      // the whole race — got NO procedural relief on this backend at all.
      const inRange = mid.greaterThan(0.5).and(mid.lessThan(16.5))
        .and(mid.notEqual(3.0)).and(mid.notEqual(15.0));
      // DERIVATIVES UNCONDITIONAL (roadMarkings / WGX fs_main pattern): fwidth
      // inside If(inRange)/If(matWallLike) is non-uniform CF → hard WGSL error
      // on TLX-WebGPU. Hoist footprints; branches only consume them.
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
            const T = normalize(cross(vec3(0.0, 1.0, 0.0), N).add(vec3(1e-5)));
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
          // Ground/road gets the SAME grazing-angle guard as the wall branch
          // (lit.js aaG, 0.10/0.55 on the xz footprint). It was missing here, so
          // the road — the one horizontal surface viewed almost edge-on at
          // 80 m/s — kept full relief where a pixel spans many times the 0.22
          // probe epsilon and the 3-tap gradient aliases into crawling moire.
          // The fade only ever REDUCES bump, so head-on grass/sand/rock are
          // unchanged.
          const aaG = clamp(fwGround.sub(0.10).div(0.55).oneMinus(), 0.0, 1.0).toVar();
          If(aaG.greaterThan(0.005), () => {
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
          });
        });
      });
      return N;
    });

    /* ── Baked PBR material arrays (js/render/assets.js) ─────────────────────
     * GLX counterpart: applyMaterialTexNormal() + the texture block at the end
     * of applyMaterial() in js/render/shaders/lit.js. The array's LAYER INDEX
     * IS THE MAT ID, sampled on the SAME triplanar convention the procedural
     * noise above uses — so a baked scan lands exactly where the noise it
     * augments lands, with no UV channel anywhere in the pipeline.
     *
     * The nodes bind DUMMY 1×1×17 arrays at factory time and tlx.js swaps
     * `.value` when a pack finishes loading. That is the same shared-node trick
     * ENV_CUBE uses above, and it is required here for the same reason: the
     * material variants are compiled once at init, the pack arrives
     * asynchronously, and a rebuild after init is not possible. U.matTexMix
     * (TUNE_DEFS `matTexMix`, shipped at 1.0 — ON, matching GLX; this comment
     * said "shipped at 0", which was true of the old TLX-only uniform default
     * and never of the knob) gates the whole thing.
     *
     * ctx.matMaps absent (an older tlx.js, or a boot where the arrays could not
     * be created) means NONE of this is compiled in and TLX renders exactly the
     * pre-existing procedural look. */
    const MAT_MAPS = ctx.matMaps || null;
    const matAlbedoNode = MAT_MAPS && MAT_MAPS.albedo ? texture(MAT_MAPS.albedo) : null;
    const matNormalNode = MAT_MAPS && MAT_MAPS.normal ? texture(MAT_MAPS.normal) : null;

    // Tile coordinate + this layer's world scale. Scale 0 = "no baked layer for
    // this material", which the callers test before sampling (GLASS and FLAG
    // are deliberately never baked — see tools/assets.mjs SCALES).
    //
    // Pack layers are MAT 1..16. Car surfaces are 20-27 (car3d.js SURFACES).
    // GLX matTexUV and WGX matTexUV both refuse mid>16 BEFORE indexing the
    // 17-layer array. TLX used to sample `.depth(int(mid))` and
    // `uMatTexScale[mid]` raw — OOB on every painted/tyre/carbon fragment.
    // SwiftShader/WebGL then returns black (or discards), so the whole car
    // vanishes while the road (MAT 16) still draws. Clamp the layer for the
    // hoisted sample (derivative_uniformity forbids an early-out around it)
    // and keep the apply-gate on the REAL id so cars stay procedural.
    const matTexLayer = (mid) => clamp(mid, float(0.0), float(16.0));
    const matTexInPack = (mid) => mid.greaterThanEqual(1.0).and(mid.lessThanEqual(16.0));
    const matTexScaleOf = (mid) => U.matTexScale.element(int(matTexLayer(mid)));
    const matTexUV = (mid, N, wp) => select(matWallLike(matTexLayer(mid)),
      vec2(select(abs(N).x.greaterThan(abs(N).z), wp.z, wp.x), wp.y),
      wp.xz).div(max(matTexScaleOf(mid), float(0.0001)));

    const applyMaterialTexNormal = matNormalNode ? Fn(([mid, Nin, wpIn, vd]) => {
      const N = vec3(Nin).toVar();
      const wp = vec3(wpIn).toVar();
      const fade = clamp(vd.sub(22.0).div(58.0).oneMinus(), 0.0, 1.0).toVar();
      const live = U.matTexMix.greaterThan(0.001)
        .and(matTexInPack(mid))
        .and(matTexScaleOf(mid).greaterThan(0.0));
      // UV + fwidth BEFORE the live/fade gate (non-uniform CF hazard on WGSL).
      const uv = matTexUV(mid, N, wp).toVar();
      const fp = max(fwidth(uv.x), fwidth(uv.y)).toVar();
      const aa = clamp(fp.sub(0.02).div(0.30).oneMinus(), 0.0, 1.0).toVar();
      // Sample BEFORE the live/fade/aa gates — implicit tex derivatives
      // inside those Ifs are the same WGSL derivative_uniformity error as
      // a hoisted-too-late fwidth (roadMarkings / WGX fs_main). Layer is
      // clamped: car ids 20-27 must not index past the 17-deep pack.
      const nt = matNormalNode.sample(uv).depth(int(matTexLayer(mid)));
      If(live.and(fade.greaterThan(0.005)), () => {
        If(aa.greaterThan(0.005), () => {
          const dxy = nt.xy.sub(0.5).mul(2.0).toVar();
          const T = normalize(cross(vec3(0.0, 1.0, 0.0), N).add(vec3(1e-5)));
          const B = cross(N, T);
          // ASPHALT stays the weakest — the road is viewed edge-on all race.
          const amt = select(mid.equal(16.0), float(0.10), float(0.55))
            .mul(U.matTexMix).mul(fade).mul(aa);
          N.assign(normalize(N.add(T.mul(dxy.x).add(B.mul(dxy.y)).mul(amt))));
        });
      });
      return N;
    }) : null;

    // Returns vec4(albedo, rough), matching applyMaterial's packing.
    const applyMaterialTex = matAlbedoNode ? Fn(([mid, albedoIn, roughIn, wpIn, nrmIn, vd]) => {
      const albedo = vec3(albedoIn).toVar();
      const rough = float(roughIn).toVar();
      const wp = vec3(wpIn).toVar();
      const far = clamp(vd.sub(90.0).div(170.0).oneMinus(), 0.0, 1.0).toVar();
      const live = U.matTexMix.greaterThan(0.001)
        .and(matTexInPack(mid))
        .and(matTexScaleOf(mid).greaterThan(0.0));
      // UV + sample BEFORE the live/far gate (implicit derivatives).
      const uv = matTexUV(mid, normalize(vec3(nrmIn)), wp).toVar();
      const t = matAlbedoNode.sample(uv).depth(int(matTexLayer(mid)));
      If(live.and(far.greaterThan(0.001)), () => {
        // Multiplicative, exactly as GLX: the per-track tarmac tint, the
        // racing-line rubber wear and the per-vertex grain all have to survive.
        const k = U.matTexMix.mul(far).toVar();
        albedo.assign(mix(albedo, albedo.mul(t.xyz).mul(2.0), k));
        rough.assign(clamp(mix(rough, t.w, k.mul(0.8)), 0.04, 1.0));
      });
      return vec4(albedo, rough);
    }) : null;

    /* ── roadMarkings (js/render/shaders/lit.js) — the painted lines ────────────────────
     * The white edge lines and the dashed centre line are NOT geometry and NOT
     * vertex colour: js/track/mesh.js stopped emitting them as colour and
     * the fragment shader now draws them analytically from the road's
     * track-space coords (arc-length s, signed lateral x, half-width), carried
     * by the `trk` attribute (js/render/glx.js, tlx.js buildGeometry). This port
     * did not exist, so every road on this backend rendered as bare tarmac.
     *
     * DERIVATIVES ARE UNCONDITIONAL. GLX opens with `if (hw <= 0.5) return;`
     * and takes fwidth() after it — legal in GLSL, but the same shape in TSL
     * puts a derivative inside non-uniform control flow, which is a HARD WGSL
     * compile error (and it is reported asynchronously, so the backend boots
     * clean and then draws wrong). Both fwidth() calls are therefore hoisted
     * above every branch and the road test becomes a MASK on the output, not a
     * branch around it — same result, no derivative hazard, and it stays
     * correct when this backend runs on real WebGPU rather than the WebGL2
     * fallback. For the same reason the body uses select()/arithmetic
     * throughout instead of If().
     * Returns vec4(albedo, rough), matching applyMaterial's packing. */
    const roadMarkings = Fn(([trkIn, albedoIn, roughIn]) => {
      const s = float(trkIn.x).toVar();
      const x = float(trkIn.y).toVar();
      const hw = float(trkIn.z).toVar();
      // Hoisted derivatives — see the note above. MIP uses the RAW
      // footprint (WGX/GLX roadMarkings) so a saturated 0.30 AA ceiling
      // keeps paint instead of erasing it.
      const fwX = max(fwidth(x), 1e-4).toVar();
      const aaX = min(fwX, 0.30).toVar();
      const aaS = clamp(fwidth(s).div(7.0), 1e-4, 0.24).toVar();
      const albedo = vec3(albedoIn).toVar();
      const rough = float(roughIn).toVar();

      // Edge lines — a 0.20 m band just inside each tarmac edge.
      const dEdge = abs(abs(x).sub(hw.sub(0.10))).toVar();
      const edge = smoothstep(aaX.mul(-1.0).add(0.10), aaX.add(0.10), dEdge).oneMinus().toVar();

      // Dashed centre line — 0.60 m wide, 7 m period, 50 % duty, measured from
      // the dash CENTRE so the band is symmetric and wraps at the period seam.
      const band = smoothstep(aaX.mul(-1.0).add(0.30), aaX.add(0.30), abs(x)).oneMinus().toVar();
      const ph = fract(s.div(7.0)).toVar();
      const dash = smoothstep(aaS.mul(-1.0).add(0.25), aaS.add(0.25), abs(ph.sub(0.25))).oneMinus().toVar();

      // Sub-pixel minification: fade amplitude rather than let a half-covered
      // band strobe. Soft knee on the RAW footprint (same 0.10/0.55 as WGX).
      const mip = clamp(fwX.sub(0.10).div(0.55).oneMinus(), 0.0, 1.0).toVar();
      // hw > 0.5 marks road SURFACE; every other mesh reads trk = (0,0,0), and
      // the kerb ribbon / edge skirt push hw 0 so they are skipped too.
      const onRoad = select(hw.greaterThan(0.5), float(1.0), float(0.0)).toVar();
      const m = max(edge, band.mul(dash)).mul(mip).mul(onRoad).toVar();

      albedo.assign(mix(albedo, vec3(0.95, 0.95, 0.97), m));
      rough.assign(mix(rough, 0.55, m));    // paint is smoother than tarmac
      return vec4(albedo, rough);
    });

    /* ── applyMaterial (js/render/shaders/lit.js): albedo + roughness modulation for the
     *    15 track materials. nrmIn = the RAW varying normal (vNrm), matching
     *    the GLSL call site. Returns vec4(albedo, rough). ─────────────────── */
    const applyMaterial = Fn(([mid, albedoIn, roughIn, wpIn, nrmIn, vd]) => {
      const albedo = vec3(albedoIn).toVar();
      const rough = float(roughIn).toVar();
      const wp = vec3(wpIn).toVar();
      const nrm = vec3(nrmIn).toVar();
      const far = clamp(vd.sub(90.0).div(170.0).oneMinus(), 0.0, 1.0).toVar();   // coarse: mid range
      const near = clamp(vd.sub(26.0).div(64.0).oneMinus(), 0.0, 1.0).toVar();   // fine: near field
      // Includes ASPHALT(16) — see the applyMaterialNormal note above.
      const inRange = mid.greaterThan(0.5).and(mid.lessThan(16.5)).and(mid.notEqual(15.0));
      // World footprints + fwidth BEFORE the inRange/far gate (varying CF).
      const an = abs(normalize(nrm)).toVar();
      const wall = an.y.lessThan(0.6);
      const hc = select(an.x.greaterThan(an.z), wp.z, wp.x).toVar();
      const y = wp.y.toVar();
      const fwHc = fwidth(hc).toVar();
      const fwY = fwidth(y).toVar();
      const fwY125 = fwidth(y.div(1.25)).toVar();
      const fwHcPw = fwidth(hc.div(1.6)).toVar();   // glass pw=1.6
      const fwYPh = fwidth(y.div(1.4)).toVar();     // glass ph=1.4
      const fwHc035 = fwidth(hc.div(0.35)).toVar();
      const fwHc13 = fwidth(hc.mul(1.3)).toVar();
      const fwY13 = fwidth(y.mul(1.3)).toVar();
      const fwTy = fwidth(fract(y.div(0.34))).toVar();
      const ridgePhase0 = hc.mul(7.5).toVar();
      const fwRidge = fwidth(ridgePhase0).toVar();
      If(inRange.and(far.greaterThan(0.001)), () => {
        If(mid.equal(1.0), () => {          // CONCRETE — panels + speckle + seams
          albedo.mulAssign(vnoise(wp.xz.mul(0.09).add(y.mul(0.05))).sub(0.5).mul(0.16).mul(far).add(1.0));
          albedo.mulAssign(vnoise(vec2(hc, y).mul(6.0)).sub(0.5).mul(0.10).mul(near).add(1.0));
          // fwidth-AA the seam on the PRE-fract coordinate (js/render/shaders/lit.js)
          const seam = smoothstep(max(float(0.05), fwY125), 0.0,
            abs(fract(y.div(1.25)).sub(0.5)).sub(0.46)).mul(0.14).mul(near);
          albedo.mulAssign(select(wall, seam.oneMinus(), float(1.0)));
          rough.assign(min(1.0, rough.add(far.mul(0.08))));
        }).ElseIf(mid.equal(2.0), () => {   // BRICK — courses + joints + tint
          const ch = 0.20, bl = 0.42, mort = 0.06;
          const row = floor(y.div(ch));
          const off = mod(row, 2.0).mul(0.5 * bl);
          const bx = fract(hc.add(off).div(bl)), by = fract(y.div(ch));
          // mort is WORLD-space — AA width = raw hc/y footprint (js/render/shaders/lit.js)
          const mortAA = max(float(mort), max(fwHc, fwY));
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
          // NORMALIZED-space AA: fwidth of the pre-fract pane fraction (js/render/shaders/lit.js)
          const mullAA = max(float(mull), max(fwHcPw, fwYPh));
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
          // normalized-space AA (as glass) — js/render/shaders/lit.js
          albedo.mulAssign(smoothstep(max(float(0.05), fwHc035), 0.0,
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
          const shadeAA = clamp(fwTy.mul(6.0).oneMinus(), 0.0, 1.0);   // ridge-sine AA (js/render/shaders/lit.js)
          const shade = sin(ty.mul(3.14159)).mul(shadeAA);
          albedo.mulAssign(shade.mul(0.16).add(0.88));
          albedo.mulAssign(vnoise(vec2(hc.mul(2.0), floor(y.div(0.34))).mul(3.0)).sub(0.5).mul(0.14).mul(near).add(1.0));
          rough.assign(min(1.0, rough.add(far.mul(0.10))));
        }).ElseIf(mid.equal(13.0), () => {  // STONE — jittered blocks, deep mortar
          const cell = floor(vec2(hc, y).mul(1.3));
          const f = fract(vec2(hc, y).mul(1.3)).sub(hash21(cell).mul(0.12));
          const d = min(min(f.x, f.x.oneMinus()), min(f.y, f.y.oneMinus()));
          // normalized-space AA in the *1.3 fract domain (js/render/shaders/lit.js)
          const jointAA = max(float(0.16), max(fwHc13, fwY13));
          const joint = smoothstep(0.0, jointAA, d);
          const block = albedo.mul(hash21(cell).mul(0.4).add(0.80));
          const mortar = mix(albedo, vec3(0.42, 0.40, 0.37), 0.65);
          albedo.assign(mix(mortar, block, joint.mul(near)));
          rough.assign(min(1.0, rough.add(far.mul(0.18))));
        }).ElseIf(mid.equal(14.0), () => {  // RUST/CORRUGATED — ridges + rust streaks
          const ridgePhase = hc.mul(7.5);
          const ridgeAA = clamp(fwRidge.mul(3.0).oneMinus(), 0.0, 1.0);  // corrugation AA (js/render/shaders/lit.js)
          const ridge = sin(ridgePhase).mul(ridgeAA);
          albedo.mulAssign(ridge.mul(0.18).add(0.85));
          const rust = smoothstep(0.55, 0.9, vnoise(vec2(hc.mul(0.8), y.mul(0.35)).add(5.0)));
          albedo.assign(mix(albedo, albedo.mul(vec3(0.62, 0.42, 0.28)), rust.mul(0.5).mul(far)));
          rough.assign(min(1.0, rough.add(far.mul(0.14))));
        }).ElseIf(mid.equal(16.0), () => {  // ASPHALT — aggregate speckle + wear patches (js/render/shaders/lit.js)
          // Deliberately understated: this is the surface under the car for the
          // whole race, so it gets tone variation rather than pattern. No
          // fract()/sin() term at all — nothing here can strobe, only soften.
          albedo.mulAssign(vnoise(wp.xz.mul(0.035)).sub(0.5).mul(0.10).mul(far).add(1.0));
          albedo.mulAssign(vnoise(wp.xz.mul(7.0)).sub(0.5).mul(0.13).mul(near).add(1.0));
          rough.assign(min(1.0, rough.add(far.mul(0.10))));
        });
      });
      return vec4(albedo, rough);
    });

    /* ── the fragment (main() in js/render/shaders/lit.js) per material variant ──
     * matU = the per-draw material scalars as uniform nodes (one set per
     * cached variant — every variant compiles to the SAME program text, so
     * three's program cache dedupes the actual GL compiles). */
    // `chunked` = this variant is only ever bound to createChunkedMesh
    // geometry (the city props / glass). Those never carry track coords, so
    // the variant omits BOTH the `trk` attribute read and roadMarkings(). That
    // is what lets tlx-chunked.js skip the attribute entirely: 12 B/vertex on
    // a multi-million-vertex street circuit is ~27 MB of zeros, on the one
    // buffer the whole chunked subsystem exists to keep small (see its header
    // — the staged-release mobile-OOM guard). GLX pays nothing there either:
    // its aTrk is per-mesh optional (js/render/glx.js trk attrib) and a disabled attrib
    // array reads a constant (0,0,0), which a node material cannot express.
    // Cost: one extra program. INVARIANT: a chunked mesh must only ever be
    // drawn through drawChunked/castShadowChunked (it is — js/game.js,4810).
    function buildFragment(matU, chunked, instanced) {
      return Fn(() => {
        // ── STANDING-RULE ANCHORS: unconditional Fn-body .toVar() on every
        //    shared varying-derived node BEFORE any conditional use. ──────────
        const wp = vec3(positionWorld).toVar();               // vWorldPos
        const Nvary = vec3(normalWorld).toVar();              // vNrm (raw varying)
        const objP = vec3(positionGeometry).toVar();          // vObjPos
        const vertexColor = vec3(attribute("color", "vec3")).toVar();
        const albedoIn = instanced
          ? vertexColor.mul(attribute("instanceTint", "vec3")).toVar()
          : vertexColor;                                             // vCol
        // Smooth attribute, same as before the garage-blank regression.
        // GLX is `flat out float vMat`; a TSL `varying().setInterpolation(FLAT)`
        // compiled but the garage turntable drew nothing (software GL / three
        // r185). FLAG wave still reads the per-vertex attribute in the VS.
        const matA = float(attribute("mat", "float")).toVar();       // vMat
        // vTrk — road track-space (s, x, halfWidth); (0,0,0) on every other
        // non-chunked mesh. Anchored here with the other varyings per the
        // standing rule, because roadMarkings() takes derivatives of it.
        const trkA = chunked ? null : vec3(attribute("trk", "vec3")).toVar();  // vTrk
        const vd = length(wp.sub(cameraPosition)).toVar();    // vDist
        const V = normalize(cameraPosition.sub(wp)).toVar();

        // Two-sided lighting: flip N toward the viewer on back fragments
        // (js/render/shaders/lit.js). Raw normalWorld carries no faceDirection flip.
        const N = select(frontFacing, Nvary, Nvary.negate()).toVar();
        N.assign(normalize(N));

        // ── ground micro-normal relief (uDetail — js/render/shaders/lit.js) ───────────
        // Hoist xz footprint before the detail If (uniform gate, but keep the
        // roadMarkings discipline so a future non-uniform gate cannot poison WGSL).
        const mnFp = max(fwidth(wp.x), fwidth(wp.z)).toVar();
        If(matU.detail.greaterThan(0.001), () => {
          const mnFade = clamp(vd.sub(25.0).div(70.0).oneMinus(), 0.0, 1.0)
            .mul(U.wetness.mul(0.75).oneMinus()).toVar();
          // footprint fade — grazing-angle crawl guard (0.15/0.70 constants)
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
        // AFTER the ground relief, BEFORE paint/material bumps (js/render/shaders/lit.js).
        const Ngeo = vec3(N).toVar();

        // ── car surface ids 20-27 (car3d.js SURFACES; js/render/shaders/lit.js) ───────
        const surfaceId = floor(matA.add(0.5)).toVar();
        const classifiedCar = surfaceId.greaterThanEqual(20.0).and(surfaceId.lessThanEqual(31.0)).toVar();
        const paintSurface = surfaceId.equal(20.0).toVar();
        const carbonSurface = surfaceId.equal(21.0).toVar();
        const rubberSurface = surfaceId.equal(22.0).toVar();
        const metalSurface = surfaceId.equal(23.0).toVar();
        const glassSurface = surfaceId.equal(24.0).toVar();
        const emissiveSurface = surfaceId.equal(25.0).toVar();
        const panelSurface = surfaceId.equal(26.0).toVar();
        // MIRROR: chrome livery finish (FINISH_SURFACE.chrome). Paint-like
        // (keeps clearcoat + env lobe) but metallic and nearly smooth.
        const mirrorSurface = surfaceId.equal(27.0).toVar();
        // Three more livery finishes, mirroring js/render/shaders/lit.js. A
        // finish costs a SURFACE ID, not a uniform: car3d.js FINISH_SURFACE
        // remaps a painted vertex. Carbon needs no id — 21 already exists.
        const matteSurface = surfaceId.equal(28.0).toVar();
        const satinMetalSurface = surfaceId.equal(29.0).toVar();
        const iriSurface = surfaceId.equal(30.0).toVar();
        const carbonFinish = surfaceId.equal(31.0).toVar();   // bare weave OVER the livery colour
        const paintLike = paintSurface.or(mirrorSurface).or(iriSurface).or(satinMetalSurface).toVar();
        const carPaint = select(classifiedCar,
          select(paintLike, matU.carPaint, float(0.0)), matU.carPaint).toVar();
        const clearcoat = select(classifiedCar,
          select(paintSurface, matU.clearcoat,
            select(mirrorSurface, max(matU.clearcoat, 0.85),
              select(iriSurface, max(matU.clearcoat, 0.70),
                select(satinMetalSurface, min(matU.clearcoat, 0.25),
                  select(matteSurface, float(0.0),
                    select(glassSurface, matU.clearcoat.mul(0.45), float(0.0))))))),
          matU.clearcoat).toVar();
        const metalness = select(classifiedCar,
          select(metalSurface, max(matU.metalness, 0.78),
            select(mirrorSurface, max(matU.metalness, 0.55),
              select(satinMetalSurface, max(matU.metalness, 0.60),
                select(matteSurface, float(0.0),
                  select(iriSurface, max(matU.metalness, 0.25),
              // PAINT gets metalness instead of falling through to 0.0 — mirrors
              // js/render/shaders/lit.js. tables.js sets 0.12 on every PAINT_*
              // and describes the flake it is meant to produce; the 0.0 discarded
              // it and made CAR METALLIC dead on every car pixel.
              select(carbonSurface, float(0.08),
                select(paintSurface, matU.metalness, float(0.0)))))))),
          matU.metalness).toVar();
        const specular = select(classifiedCar,
          select(rubberSurface, float(0.18),
            select(metalSurface.or(mirrorSurface), float(1.0),
              select(satinMetalSurface, float(0.82),
                select(matteSurface, float(0.16),
                  select(carbonSurface.or(carbonFinish), float(0.48),
                    select(panelSurface, float(0.35), matU.specular)))))),
          matU.specular).toVar();
        const emissive = select(classifiedCar,
          select(emissiveSurface, max(matU.emissive, 1.0),
            select(paintLike, matU.emissive, float(0.0))),
          matU.emissive).toVar();
        const envSurface = carPaint.greaterThan(0.001).or(glassSurface)
          .and(clearcoat.greaterThan(0.001)).toVar();

        // ── car-paint orange-peel micro normal (js/render/shaders/lit.js) ─────────────
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

        // SAA source: geo + peel, before wall/MAT bump (WGX saaVar mix).
        const Nsaa = vec3(N).toVar();

        // ── per-material procedural bump (before V/L/H/NoL — js/render/shaders/lit.js) ────
        N.assign(applyMaterialNormal(surfaceId, N, wp, vd));
        // Baked normal map composes on top (no-op at matTexMix 0 / no pack).
        if (applyMaterialTexNormal) N.assign(applyMaterialTexNormal(surfaceId, N, wp, vd));

        const L = vec3(U.sunDir).toVar();
        const H = normalize(L.add(V).add(vec3(1e-5))).toVar();   // +eps: V==-L NaN guard
        const NoL = max(dot(N, L), 0.0).toVar();
        const NoV = max(dot(N, V), 1e-4).toVar();
        const NoH = max(dot(N, H), 0.0).toVar();
        const VoH = max(dot(V, H), 0.0).toVar();

        const albedo = vec3(albedoIn).toVar();

        // ── procedural ground texture + patches + cracks (js/render/shaders/lit.js) ───
        const patchM = float(0.5).toVar();
        // fwidth(cr) BEFORE the detail If — same hoist as roadMarkings / WGX
        // fs_main. matU.detail is a uniform today; a per-fragment gate here
        // would be a derivative_uniformity compile error on TLX-WebGPU.
        const cr = abs(vnoise(wp.xz.mul(0.9).add(3.3)).mul(2.0).sub(1.0)).toVar();
        const crAA = max(float(0.075), fwidth(cr).add(0.015)).toVar();
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
            const crack = smoothstep(0.015, crAA, cr).oneMinus()
              .mul(smoothstep(0.40, 0.70, vnoise(gxz.mul(0.11).add(7.7))));
            albedo.mulAssign(crack.mul(0.30).mul(crackFade).mul(min(matU.detail.mul(4.0), 1.0)).oneMinus());
          });
          albedo.assign(max(albedo, vec3(0.0)));
        });

        // ── roughness resolution + car-surface clamps (js/render/shaders/lit.js) ──────
        const rough = clamp(matU.roughness, 0.04, 1.0).toVar();
        If(carbonSurface.or(carbonFinish), () => { rough.assign(max(rough, 0.56)); });
        If(rubberSurface, () => { rough.assign(max(rough, 0.90)); });
        If(metalSurface, () => { rough.assign(min(rough, 0.16)); });
        If(glassSurface, () => { rough.assign(min(rough, 0.13)); });
        If(emissiveSurface, () => { rough.assign(max(rough, 0.32)); });
        If(panelSurface, () => { rough.assign(max(rough, 0.72)); });
        If(mirrorSurface, () => { rough.assign(min(rough, 0.09)); });
        If(matteSurface, () => { rough.assign(max(rough, 0.88)); });
        If(satinMetalSurface, () => { rough.assign(clamp(rough, 0.24, 0.40)); });
        If(iriSurface, () => { rough.assign(min(rough, 0.22)); });
        // PEARLESCENT / FLIP PAINT (mirrors js/render/shaders/lit.js): rotate
        // albedo through a cosine palette driven by the Fresnel term, so the
        // panel flips colour with view angle and returns to the livery's own
        // colour face-on. No derivative, so it is safe in any control flow.
        // CARBON FINISH (mirrors js/render/shaders/lit.js).
        If(carbonFinish, () => {
          const wv = objP.xz.mul(190.0).add(objP.y.mul(190.0)).toVar();
          const weave = wv.x.sin().mul(wv.y.sin()).mul(0.5).add(0.5).toVar();
          albedo.assign(mix(albedo.mul(0.16).add(vec3(0.030, 0.031, 0.035)), albedo.mul(0.28), 0.25));
          albedo.assign(albedo.mul(weave.mul(0.28).add(0.86)));
        });
        If(iriSurface, () => {
          const fres = clamp(dot(N, V), 0.0, 1.0).oneMinus().toVar();
          const shift = vec3(0.0, 0.33, 0.67).add(fres.mul(1.4)).mul(6.2831853)
            .cos().mul(0.5).add(0.5).toVar();
          // MULTIPLY the base colour — a pearl coat tints what is under it.
          albedo.assign(albedo.mul(mix(vec3(1.0), shift.mul(0.80).add(0.60),
            smoothstep(0.30, 0.92, fres).mul(0.40))));
        });
        If(matU.detail.greaterThan(0.0), () => {   // glossier repair patches
          rough.assign(clamp(rough.add(patchM.sub(0.5).mul(0.16).mul(min(matU.detail.mul(4.0), 1.0))), 0.04, 1.0));
        });

        // ── procedural per-material albedo/roughness (js/render/shaders/lit.js) ───────────
        const packedMat = applyMaterial(surfaceId, albedo, rough, wp, Nvary, vd);
        albedo.assign(packedMat.xyz);
        rough.assign(packedMat.w);
        if (applyMaterialTex) {
          const packedTex = applyMaterialTex(surfaceId, albedo, rough, wp, Nvary, vd);
          albedo.assign(packedTex.xyz);
          rough.assign(packedTex.w);
        }

        // ── painted road markings (js/render/shaders/lit.js) ─────────────────────────────
        // AFTER the material grain and the baked texture, exactly as GLX
        // orders it, so the paint sits ON the tarmac rather than under it.
        // Called unconditionally: it carries its own hw mask and its
        // derivatives must not sit inside a branch (see roadMarkings above).
        if (trkA) {
          const packedPaint = roadMarkings(trkA, albedo, rough);
          albedo.assign(packedPaint.xyz);
          rough.assign(packedPaint.w);
        }

        // ── specular AA: widen roughness by the pre-material normal's
        //    screen-space variance (WGX geo+peel mix). dFdx(N) after the
        //    wall bump dulls brick/concrete vs WebGPU. ───────────
        const saaDx = dFdx(Nsaa), saaDy = dFdy(Nsaa);
        const saaVar = dot(saaDx, saaDx).add(dot(saaDy, saaDy)).toVar();
        rough.assign(min(1.0, sqrt(rough.mul(rough).add(saaVar.mul(0.35)))));
        const a = rough.mul(rough).toVar();
        const f0 = mix(vec3(specular.mul(0.08)), albedo, metalness).toVar();

        // ── wet surface (rain — js/render/shaders/lit.js) ─────────────────────────────
        // wet = "rained on"; wetSheen = the specular WATER FILM. Porous ground
        // (grass/foliage/rock/sand/snow) drinks the water: it darkens but never
        // polishes. Reflection-side terms must key off wetSheen, not wet —
        // otherwise soaked grass mirrors the lamps and the sky (the pre-fix
        // TLX port).
        const wet = float(0.0).toVar();
        const puddle = float(0.0).toVar();
        const wetSheen = float(0.0).toVar();
        If(U.wetness.greaterThan(0.001), () => {
          const upFace = smoothstep(0.50, 0.90, N.y);
          const wmid = surfaceId;
          const porous = select(
            wmid.equal(9.0).or(wmid.equal(6.0)).or(wmid.equal(10.0))
              .or(wmid.equal(8.0)).or(wmid.equal(11.0)),
            float(1.0), float(0.0));
          wet.assign(U.wetness.mul(upFace));
          const pn = vnoise(wp.xz.mul(0.13).add(4.7));
          puddle.assign(smoothstep(0.48, 0.88, pn).mul(wet).mul(porous.oneMinus()));
          // Porous as a FRACTION of the road result — mirrors js/render/shaders/lit.js.
          // The two coefficients were transposed here as they were in GLX: mix(a,b,t)
          // returns a for porous=0 (tarmac) and b for porous=1, so tarmac absorbed
          // 58% while soaked grass absorbed only 42%, leaving verges BRIGHTER than
          // the ribbon they border. As a fraction the two saturate together and
          // porous stays strictly darker across the whole wetDark range.
          const absorbRoad = clamp(U.wetDark.mul(0.58).oneMinus(), 0.0, 1.0);
          const absorb = mix(absorbRoad, absorbRoad.mul(0.66), porous);
          albedo.mulAssign(mix(float(1.0), absorb, wet));
          albedo.mulAssign(mix(float(1.0), float(0.50), puddle));
          wetSheen.assign(wet.mul(porous.oneMinus()));
          rough.assign(mix(rough, 0.30, wetSheen));
          rough.assign(mix(rough, 0.06, puddle));
          a.assign(rough.mul(rough));
          f0.assign(mix(f0, vec3(0.04), wetSheen.mul(0.6)));   // thin water film dielectric
        });

        const amb = mix(vec3(U.ambGround), vec3(U.ambSky), N.y.mul(0.5).add(0.5)).toVar();

        // ── shadow: hard sun/car map (M4) × soft drifting cloud shadows
        //    (js/render/shaders/lit.js). Nvary = the RAW varying normal, matching the GLSL
        //    sampleShadow's normalize(vNrm). ───────────────────────────────────
        // NoL GATE — js/render/shaders/lit.js: sampleShadow + cloudShadow are
        // thrown away on back-faces (litNoL *= NoL) except clearcoat, which
        // shades on Ngeo. Skip the taps when the result cannot contribute.
        const shadow = float(1.0).toVar();
        If(NoL.greaterThan(0.0).or(clearcoat.greaterThan(0.001)), () => {
          const sunSh = sampleShadow ? sampleShadow(wp, Nvary) : float(1.0);
          shadow.assign(sunSh.mul(cloudShadow(wp).mul(U.cloudShadowDim).oneMinus()));
        });
        const litNoL = NoL.mul(shadow).mul(U.keyMul).toVar();

        // Base diffuse + hemisphere ambient (js/render/shaders/lit.js).
        const color = albedo.mul(amb.add(vec3(U.sunColor).mul(litNoL).mul(metalness.oneMinus()))).toVar();
        // SHADOW COOLNESS (js/render/shaders/lit.js).
        If(U.shadowTintAmt.greaterThan(0.001), () => {
          color.mulAssign(mix(vec3(1.0), vec3(0.90, 0.96, 1.12),
            U.shadowTintAmt.mul(clamp(litNoL.oneMinus(), 0.0, 1.0))));
        });

        // ── the 32-lamp spot loop (js/render/shaders/lit.js) ───────────────────────────
        // Windowed inverse-square + aimed cone + bleed + bounce fill + GGX and
        // clearcoat lamp lobes with their soft-clips. The single mapped lamp
        // (i == uLampShadowIdx) gets a real 4-tap PCF from the 512² spot map
        // (M4) — direct terms only; bounce fill + fog in-scatter stay
        // unshadowed (they are indirect).
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
              const spotS = mix(mix(float(0.16), float(0.30), wetSheen).mul(U.lampWallSpill), float(1.0), beam);  // reflection floor
              // U.lampFog is 0 by day, so skip the accumulate (uniform CF —
              // safe for TSL→WGSL). Matches GLX lit.js / WGSL chunks.
              If(U.lampFog.greaterThan(0.0), () => {
                lampFogAcc.addAssign(U.lampCol.element(i).mul(att.mul(mix(float(0.35), float(1.0), beam))));
              });
              const NoLl = max(dot(N, Ld), 0.0).toVar();
              // Per-lamp shadow for the one mapped floodlight (js/render/shaders/lit.js):
              // perspective divide, slope-boosted constant bias (perspective
              // depth precision lives at the lens, the road receiver near the
              // far plane), 4-tap PCF at 1.5/512.
              const lampSh = float(1.0).toVar();
              if (lampShadowOn) {
                // NoLl GATE — js/render/shaders/lit.js: lampSh's only readers
                // are the NoLl-scaled diffuse and the specular block already
                // inside NoLl>0. A back-facing fragment paid 4 compare taps
                // for a result multiplied by zero.
                If(U.lampShadowOn.greaterThan(0.5).and(float(i).equal(U.lampShadowIdx)).and(NoLl.greaterThan(0.0)), () => {
                  const lpc = U.lampShadowVP.mul(vec4(wp, 1.0)).toVar();
                  If(lpc.w.greaterThan(0.0), () => {
                    const lps = lpc.xyz.div(lpc.w).mul(0.5).add(0.5).toVar();
                    If(lps.x.greaterThan(0.002).and(lps.x.lessThan(0.998))
                      .and(lps.y.greaterThan(0.002)).and(lps.y.lessThan(0.998))
                      .and(lps.z.lessThan(1.0)), () => {
                      const lpz = lps.z.sub(float(0.0012).add(float(0.004).mul(NoLl.oneMinus()))).toVar();
                      const lpt = 1.5 / 512.0;
                      const ltap = (px, py) =>
                        texture(SHD.lampTex, flipUV(lps.xy.add(vec2(px, py)))).compare(lpz);
                      lampSh.assign(ltap(-lpt, -lpt).add(ltap(lpt, -lpt))
                        .add(ltap(-lpt, lpt)).add(ltap(lpt, lpt)).mul(0.25));
                    });
                  });
                });
              }
              // diffuse pool — fades as the road wets (reflection takes over)
              color.addAssign(albedo.mul(U.lampCol.element(i))
                .mul(att.mul(spotD).mul(lampSh)).mul(NoLl)
                .mul(metalness.oneMinus()).mul(wetSheen.mul(0.85).oneMinus()));
              // bounce fill (uBounceK, def 0.04 — js/render/shaders/lit.js)
              If(U.bounceK.greaterThan(0.0), () => {
                color.addAssign(albedo.mul(U.lampCol.element(i))
                  .mul(att.mul(U.bounceK).mul(NoLl.mul(0.45).add(0.55)))
                  .mul(metalness.oneMinus()));
              });
              // GGX + clearcoat lamp speculars, NoLl-gated (js/render/shaders/lit.js)
              If(NoLl.greaterThan(0.0), () => {
                const Hl = normalize(Ld.add(V));
                const NoHl = max(dot(N, Hl), 0.0).toVar();
                const VoHl = max(dot(V, Hl), 0.0).toVar();
                const Dl = D_GGX(NoHl, a);
                const Vl = V_SmithGGX(NoV, NoLl, a);
                const Fll = F_Schlick(VoHl, f0, clamp(rough.oneMinus(), 0.0, 1.0));
                const radianceS = U.lampCol.element(i).mul(att.mul(spotS).mul(lampSh)).toVar();
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

        // ── sun Cook-Torrance specular, soft-clipped (js/render/shaders/lit.js) ────────
        If(NoL.greaterThan(0.0), () => {
          const D = D_GGX(NoH, a);
          const Vis = V_SmithGGX(NoV, NoL, a);
          const F = F_Schlick(VoH, f0, clamp(rough.oneMinus(), 0.0, 1.0));
          const specCol = F.mul(D.mul(Vis)).mul(vec3(U.sunColor)).mul(litNoL).toVar();
          specCol.assign(specCol.div(specCol.add(1.0)));
          color.addAssign(specCol);
        });

        // ── clearcoat specular AA variance of Ngeo (js/render/shaders/lit.js) — gated
        //    on the UNIFORM so the derivative sits in uniform control flow ────
        const ccSaaVar = float(0.0).toVar();
        If(matU.clearcoat.greaterThan(0.001), () => {
          const ccDx = dFdx(Ngeo), ccDy = dFdy(Ngeo);
          ccSaaVar.assign(dot(ccDx, ccDx).add(dot(ccDy, ccDy)));
        });

        // ── clearcoat sun lobe (js/render/shaders/lit.js) ──────────────────────────────
        If(clearcoat.greaterThan(0.001), () => {
          const Hg = normalize(L.add(V));
          const NoHg = max(dot(Ngeo, Hg), 0.0);
          const NoVg = max(dot(Ngeo, V), 1e-4);
          const NoLg = max(dot(Ngeo, L), 0.0);
          If(NoLg.greaterThan(0.0), () => {
            const ccA = min(sqrt(ccSaaVar.mul(0.25).add(0.035 * 0.035)), 0.30);
            const Dc = D_GGX(NoHg, ccA);
            const Vc = V_SmithGGX(NoVg, NoLg, ccA);
            const Fc = F_Schlick(max(dot(V, Hg), 0.0), vec3(0.05), float(1.0)).x;
            const ccCol = vec3(U.sunColor).mul(Dc.mul(Vc).mul(Fc)).mul(NoLg)
              .mul(shadow).mul(U.keyMul).mul(clearcoat).toVar();
            ccCol.assign(ccCol.mul(2.6).div(ccCol.add(2.6)));   // 2.6 HDR ceiling
            color.addAssign(ccCol);
          });
        });

        // ── clearcoat ENV mirror (the analytic-clearcoat-ENV block in lit.js).
        //    uEnvStr = 0 -> analytic
        //    sky-gradient path only; > 0 blends in the M9 live cube fetch
        //    (textureLod(uEnvCube, Rg, rough*2.5) × uEnvStr — glx.js parity). ──
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
          // M9: fetch the real surroundings from the probe cube along the
          // reflection vector and cross-fade the analytic mirror toward it by
          // the probe strength (uEnvStr, 0 off). envCC is already
          // .toVar()-anchored, so this unconditional reassign never strands
          // (STANDING RULE). .sample() shares the swappable base node.
          if (envCubeNode) {
            // textureLod(uEnvCube, Rg, rough*2.5) — js/render/shaders/lit.js.
            // Official TSL: cubeTexture(CubeTextureNode, uvNode, levelNode)
            // clones with referenceNode = this base (mrdoob/three.js
            // CubeTextureNode.js). Do not call .uv() on a cube node.
            const cubeRefl = cubeTexture(envCubeNode, Rg, rough.mul(2.5)).rgb;
            envCC.assign(mix(envCC, cubeRefl, probeLive));
          }
          // sun disc in the mirror: pow-400 lobe widened by the AA variance
          const ccDiscA = sqrt(ccSaaVar.mul(0.25).add(0.0705 * 0.0705));
          const ccDiscExp = max(float(2.0).div(ccDiscA.mul(ccDiscA)).sub(2.0), 32.0);
          envCC.addAssign(vec3(U.sunColor)
            .mul(pow(max(dot(Rg, U.sunDir), 1e-4), ccDiscExp))
            .mul(U.carSunGlint).mul(shadow).mul(U.keyMul));
          color.mulAssign(envW.mul(0.94).oneMinus());          // absorb under the mirror
          const addCC = envCC.mul(envW);
          color.addAssign(addCC.div(addCC.mul(0.35).add(1.0)));  // gentle soft-clip
        });

        // ── metallic-flake sparkle (js/render/shaders/lit.js) ─────────────────────────
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

        // ── environment sky reflection for glossy/wet surfaces (js/render/shaders/lit.js)
        const envBlend = clamp(float(0.40).sub(rough).div(0.30), 0.0, 1.0).mul(specular).toVar();
        envBlend.assign(max(envBlend, wetSheen.mul(0.55)));
        If(envBlend.greaterThan(0.001), () => {
          const R = reflect(V.negate(), N).toVar();
          const skyT = pow(max(R.y, 1e-4), 0.40);
          const envColor = mix(vec3(U.skyHorizon), vec3(U.skyZenith), skyT).toVar();
          const envSunAlign = max(dot(R, U.sunDir), 0.0).toVar();
          envColor.assign(mix(envColor, envColor.mul(U.sunColor).mul(1.15),
            envSunAlign.mul(envSunAlign).mul(rough.oneMinus())));
          // dry glossy glass sun flash (WINDOW SUN FLASH knob)
          // * (1-wetSheen): a fully-wet road paid pow(_,22) for a result of 0.
          If(wetSheen.oneMinus().mul(U.windowSunFlash).mul(U.keyMul).greaterThan(0.001), () => {
            envColor.addAssign(vec3(U.sunColor).mul(pow(max(envSunAlign, 1e-4), 22.0))
              .mul(wetSheen.oneMinus()).mul(envBlend).mul(0.6).mul(U.windowSunFlash).mul(U.keyMul));
          });
          const roughDamp = rough.mul(0.7).oneMinus();
          const envFresnel = F_Schlick(max(dot(N, V), 0.0), vec3(0.04), float(1.0)).x.toVar();
          envFresnel.assign(mix(envFresnel, envFresnel.mul(envFresnel), wetSheen.mul(0.35)));
          const envWet = envColor.mul(wetSheen.mul(0.45).oneMinus());
          const envAdd = envWet.mul(envFresnel).mul(envBlend).mul(roughDamp).mul(metalness.oneMinus()).toVar();
          const envM = max(max(envAdd.r, envAdd.g), envAdd.b);
          color.addAssign(envAdd.div(envM.add(1.0)));           // Reinhard shoulder
        });

        // ── sky rim fresnel (js/render/shaders/lit.js) ───────────────────────────────
        {
          const rf = NoV.oneMinus();
          const rimFresnel = rf.mul(rf).mul(rf);
          const rimAmt = rimFresnel.mul(rough.mul(0.85).oneMinus()).mul(0.18).mul(U.skyRimGlow);
          color.addAssign(vec3(U.skyHorizon).mul(rimAmt));
        }

        // ── ambient contact darkening (js/render/shaders/lit.js) ─────────────────────
        {
          const ao = pow(max(N.y.mul(0.5).add(0.5), 1e-4), 0.35);
          color.mulAssign(mix(float(0.12).mul(U.ambContactDark).oneMinus(), float(1.0), ao));
        }

        // ── emissive + over-white hdrTag glow (js/render/shaders/lit.js). The hdrTag
        //    push is computed NOW so >1 albedos (neon/lenses) carry HDR energy;
        //    bloom consumes it in M8. ───────────────────────────────────────────
        If(emissive.greaterThan(0.0), () => {
          color.assign(mix(color, albedo, emissive));
          const bright = max(albedo.r, max(albedo.g, albedo.b));
          const glow = smoothstep(0.50, 0.95, bright).mul(emissive);
          const hdrTag = max(bright.sub(1.0), 0.0);
          color.addAssign(albedo.mul(glow).mul(U.glowAmp).mul(hdrTag.mul(U.bloomBoost).add(1.0)));
        });

        // ── fog stack (js/render/shaders/lit.js) ─────────────────────────────────────
        // Skip pow/exp when density and mist are both off (setup / carview / tuner 0).
        If(U.fogDensity.greaterThan(0.0).or(U.groundMist.greaterThan(0.001)), () => {
          const rd = V.negate();
          const sunAmount = max(dot(rd, U.sunDir), 0.0).toVar();
          const lampFogC = vec3(0.0).toVar();
          If(U.lampFog.greaterThan(0.0), () => {
            const lf = lampFogAcc.mul(U.lampFog);
            lampFogC.assign(lf.div(max(max(lf.r, lf.g), lf.b).mul(U.lampFogClip).add(1.0)));
          });
          If(U.fogDensity.greaterThan(0.0), () => {
            // squared-exponential height fog
            const heightAtten = select(U.fogHeight.greaterThan(0.0),
              exp(max(wp.y.sub(cameraPosition.y), 0.0).negate().mul(U.fogHeight)),
              float(1.0));
            const fd = vd.mul(U.fogDensity).mul(heightAtten);
            const f = exp(fd.mul(fd).negate()).oneMinus();
            // sun in-scatter: broad pow4 + tight pow16 core (FOG SUN CORE)
            const sunAmt = max(sunAmount, 1e-4);
            const fogCol = mix(vec3(U.fogColor), vec3(U.sunColor), pow(sunAmt, 4.0)).toVar();
            fogCol.addAssign(vec3(U.sunColor).mul(pow(sunAmt, 16.0)).mul(U.fogSunCore));
            // FOG WARM/COOL white-balance matrix
            fogCol.mulAssign(vec3(
              float(1.0).add(max(U.fogTint, 0.0).mul(0.25)).sub(max(U.fogTint.negate(), 0.0).mul(0.12)),
              float(1.0).sub(abs(U.fogTint).mul(0.02)),
              float(1.0).sub(max(U.fogTint, 0.0).mul(0.25)).add(max(U.fogTint.negate(), 0.0).mul(0.18))));
            fogCol.addAssign(lampFogC);
            color.assign(mix(color, fogCol, f));
          });
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
        });

        // ── output alpha ──────────────────────────────────────────────────────
        // M8: car-paint pixels are TAGGED in alpha (0.35 — js/render/shaders/lit.js)
        // when the offscreen HDR target carries the frame; the composite's SSR
        // reads the road/car masks off it. Opaque draws write it directly;
        // translucent/noAlphaWrite draws preserve dst alpha through the blend
        // stage (Zero/One alpha factors in makeMaterial — GLX's colorMask).
        // Without the post chain (direct to canvas) the tag stays off.
        return vec4(color, SSR_TAG
          ? select(carPaint.greaterThan(0.001), float(0.35), matU.alpha)
          : matU.alpha);
      })();
    }

    /* ── FLAG cloth-wave vertex displacement (LIT_VS — js/render/shaders/lit.js) ─────────
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
     * fragment as colorNode + outputNode. opts carries the GLX per-draw scalars
     * (defaults = glx.js litMaterial defaults) plus flags:
     *   doubleSided, depthBias:[factor,units], noAlphaWrite (M8), chunked
     * (drawChunked keeps depthWrite TRUE even when alpha<1 — GLX asymmetry).
     *
     * SSR TAG ≠ OPACITY ≠ OUTPUT ALPHA. The fragment still computes the
     * 0.35 car-paint tag (js/render/shaders/lit.js) as packed.a, but that
     * channel must not reach three's output. NodeMaterial.setupDiffuseColor
     * multiplies diffuseColor.a by opacityNode, and r185 NodeBuilder.isOpaque()
     * is `transparent===false && blending===NormalBlending` — our NoBlending
     * opaque path (required so SrcAlpha does not ghost the body) makes
     * isOpaque() FALSE, so whatever sits in output.a is coverage. Putting
     * the tag there painted the body at 35% over the road. opacityNode and
     * output.a are both the real material alpha (tlxAlpha). The 0.35 tag
     * rides a second HDR attachment (`ssrTag`) via mrtNode, armed only
     * for the main scene pass — the env cube is a single-target RT.
     *
     * PROGRAM SHARING (the 90-second-track-load fix, measured 2026-08-17):
     * every variant must bind the SAME node-graph OBJECTS, not a fresh
     * buildFragment() per variant. A fresh graph never dedupes: three's
     * codegen derives GLSL identifiers from node ids, so each build emits
     * DIFFERENT program text — a Monza load minted 595 GL programs / 615
     * unique shader strings and spent ~60 s inside the synchronous
     * getProgramParameter(LINK_STATUS) that three only skips on its
     * compileAsync path. The scalars therefore become materialReference
     * nodes reading `material.userData.tlx*` — per-RENDER-OBJECT uniform
     * updates against ONE shared graph (exactly how three shares programs
     * between classic material instances). Three graphs total: chunked reads
     * no `trk` attribute, and instanced multiplies canonical vertex colour by
     * its placement tint (see buildFragment header). */
    const _sharedGraph = [null, null, null]; // [plain, chunked, instanced]
    const _mats = [];
    let _sharedPos = null;
    function sharedFragment(chunked, instanced) {
      const idx = instanced ? 2 : (chunked ? 1 : 0);
      let g = _sharedGraph[idx];
      if (!g) {
        const matU = {
          emissive:  materialReference("userData.tlxEmissive", "float"),
          alpha:     materialReference("userData.tlxAlpha", "float"),
          roughness: materialReference("userData.tlxRoughness", "float"),
          metalness: materialReference("userData.tlxMetalness", "float"),
          specular:  materialReference("userData.tlxSpecular", "float"),
          detail:    materialReference("userData.tlxDetail", "float"),
          clearcoat: materialReference("userData.tlxClearcoat", "float"),
          carPaint:  materialReference("userData.tlxCarPaint", "float"),
          sparkle:   materialReference("userData.tlxSparkle", "float"),
        };
        const packed = buildFragment(matU, chunked, instanced);
        // Swizzle ONCE: packed.rgb mints a new wrapper node per access, and a
        // fresh wrapper is a fresh cache key — the whole point is one graph.
        // `opacity` is the REAL material alpha (never the 0.35 SSR tag).
        // `out` is RGB + that real alpha. packed.a is the SSR tag on the
        // second HDR attachment; it must NOT be the vec4 written to output.
        // r185 NodeBuilder.isOpaque() is false for NoBlending, so output.a
        // is coverage: a 0.35 tag ghosts painted bodywork against the road
        // (GLX writes the tag with blending OFF and an opaque canvas).
        const out = vec4(packed.rgb, matU.alpha);
        g = _sharedGraph[idx] = {
          rgb: packed.rgb, a: packed.a, opacity: matU.alpha,
          out,
          // Named to match sceneRT.textures[1].name. Env / canvas RTs have
          // no such texture, so MRTNode.setup skips this output.
          mrt: (SSR_TAG && typeof mrt === "function")
            ? mrt({ output: out, ssrTag: packed.a })
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
      ud.tlxRoughness = val(o.roughness, 0.7);
      ud.tlxMetalness = val(o.metalness, 0.0);
      ud.tlxSpecular  = val(o.specular, 0.5);
      ud.tlxDetail    = val(o.detail, 0.0);
      ud.tlxClearcoat = val(o.clearcoat, 0.0);
      ud.tlxCarPaint  = val(o.carPaint, 0.0);
      ud.tlxSparkle   = val(o.sparkle, 1.0);
      ud.tlxChunked   = !!o.chunked;
      ud.tlxInstanced = !!o.instanced;
      const packed = sharedFragment(!!o.chunked, !!o.instanced);
      _mats.push(m);
      m.colorNode = packed.rgb;
      // Coverage only. packed.a is the SSR tag (0.35 on paint) — putting it
      // here is what made three.js cars invisible (see factory comment).
      m.opacityNode = packed.opacity;
      m.outputNode = packed.out;
      m.positionNode = _sharedPos || (_sharedPos = flagPositionNode());
      pinProgram(m, o.instanced ? "tlx-lit-instanced" : (o.chunked ? "tlx-lit-ch" : "tlx-lit"));
      m.transparent = alpha < 1;
      // GLX: draw() -> depthMask(alpha>=1); drawChunked() -> depthMask(true).
      m.depthWrite = o.chunked ? true : alpha >= 1;
      m.side = o.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
      if (o.depthBias) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = o.depthBias[0];
        m.polygonOffsetUnits = o.depthBias[1];
      }
      // M8 alpha discipline (GLX draw(): noAW = noAlphaWrite || alpha < 1 ->
      // colorMask(r,g,b,FALSE), js/render/glx.js — the SSR tag underneath must
      // survive). three has only a boolean colorWrite, so the mask maps to
      // the blend stage: blendSrcAlpha=Zero / blendDstAlpha=One preserves dst
      // alpha exactly (the tsl-fx.js particles/decals discipline). Colour
      // factors keep each path's GLX blend: classic alpha for translucent,
      // One/Zero overwrite for opaque noAlphaWrite draws (still sorted into
      // three's opaque list — transparent stays false there).
      if (alpha < 1 || o.noAlphaWrite) {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation;
        m.blendSrc = alpha < 1 ? THREE.SrcAlphaFactor : THREE.OneFactor;
        m.blendDst = alpha < 1 ? THREE.OneMinusSrcAlphaFactor : THREE.ZeroFactor;
        m.blendEquationAlpha = THREE.AddEquation;
        m.blendSrcAlpha = THREE.ZeroFactor;   // dst alpha preserved (SSR tag / canvas)
        m.blendDstAlpha = THREE.OneFactor;
      } else {
        // PLAIN OPAQUE — and it must say so explicitly. three defaults every
        // material to NormalBlending and applies it from `material.blending`
        // regardless of `transparent`; that flag only picks the render LIST.
        // So an opaque draw still goes through SrcAlpha/OneMinusSrcAlpha, which
        // was harmless only while opaque alpha was always 1. It stopped being 1
        // when the SSR car-paint tag (M8) began writing 0.35 into alpha: cars
        // rendered at 35% opacity and you could see the track through them.
        // Reported from an iPhone on the three backend, and worst on a DRY
        // race, where SSR never runs — so the tag was ghosting the cars while
        // nothing consumed it.
        // GLX's equivalent draw has blending OFF entirely (js/render/glx.js),
        // which writes colour AND the alpha tag verbatim. Match that.
        m.blending = THREE.NoBlending;
      }
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
      pinProgram(m, "tlx-viz-" + mode);
      return m;
    }

    // M9: live env-probe strength. tlx.js drives this each begin() from the
    // probe's ready state × the CAR ENV REFLECTION (carEnvCube) knob — 0 keeps
    // the analytic-gradient mirror only, >0 blends in the real cube fetch.
    function setEnvStr(v) { U.envStr.value = +v || 0; }
    // M9: swap the shared env-cube binding. tlx.js points it at a black dummy
    // cube while rendering INTO the probe (feedback-loop guard) and back at the
    // live cube for the main pass. No-op when there's no cube node.
    function setEnvCube(tex) { if (envCubeNode && tex) envCubeNode.value = tex; }
    // Arm the second HDR attachment (ssrTag) only for the main scene render.
    // Env faces and the canvas fallback must keep mrtNode null — same
    // material, one color target.
    function setSsrMrt(on) {
      if (!SSR_TAG) return;
      for (let i = 0; i < _mats.length; i++) {
        const m = _mats[i];
        const g = sharedFragment(!!m.userData.tlxChunked, !!m.userData.tlxInstanced);
        m.mrtNode = on && g.mrt ? g.mrt : null;
      }
    }

    // Adopt a loaded asset pack (js/render/assets.js). The texture nodes were
    // bound to the placeholders at factory time, so — exactly like setEnvCube
    // above — the swap is a `.value` assignment on the shared node, NOT a
    // rebuild. The scales are what the shader actually tests to decide whether
    // a material has a baked layer, so clearing them is what turns the feature
    // back off; passing a falsy `maps` does precisely that.
    function setMaterialMaps(maps) {
      if (matAlbedoNode && maps && maps.albedo) matAlbedoNode.value = maps.albedo;
      if (matNormalNode && maps && maps.normal) matNormalNode.value = maps.normal;
      // uniformArray exposes its backing store as .array; .value is the
      // fallback name on older three builds. Guard both — a wrong guess here
      // would silently leave every scale at 0, i.e. the feature would look
      // "loaded" and do nothing.
      const store = U.matTexScale.array || U.matTexScale.value;
      if (store) {
        for (let i = 0; i < 17; i++)
          store[i] = maps && maps.scales && maps.scales[i] > 0 ? maps.scales[i] : 0;
      }
      if (U.matTexScale.needsUpdate !== undefined) U.matTexScale.needsUpdate = true;
    }

    // Drop a material from the setSsrMrt registry so an evicted cache entry
    // can actually be released (JS-side; dispose() waits on the r186 upgrade
    // per the eviction comment in tlx.js).
    function releaseMaterial(m) {
      const i = _mats.indexOf(m);
      if (i >= 0) _mats.splice(i, 1);
    }

    return { makeMaterial, makeViz, releaseMaterial, uniforms: U, updateFrame, setEnvStr, setEnvCube,
             setSsrMrt, setMaterialMaps, hasMaterialMaps: !!matAlbedoNode, MAX_LIGHTS };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { lit });
})();
