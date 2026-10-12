/* Apex 26 — TLXShaders.sky: the procedural sky for the TLX backend (M5).
 *
 * A 1:1 port of js/render/glx/shaders/glsl-sky.js (SKY_VS/SKY_FS — the GLSL source of
 * truth) into three.js TSL nodes: gradient dome (overcast flattening, day
 * deep-blue band + azimuthal life, golden-hour + low-sun horizon band,
 * below-horizon earth), the full procedural cloud pass (two drift vectors +
 * evo warp, coverage, billow definition octave, the *0.16-plane horizon
 * cloud-bank, thickness FBM, cloudTop/Bot model, silver lining, twilight
 * wash, moon tint, lightning bleach), Mie forward scatter, the sun compass
 * horizon glow, corona + aureole + squashed HDR disc, the round-point star
 * field (spawn window, giants, twinkle, cloud occlusion), moon disc + halo,
 * the city light-pollution dome with cloud-belly pickup, and the 1/255
 * time-stepped IGN output dither. Constants verbatim from glsl-sky.js — the
 * structural gates included: nightSky = step(0.5, uStars) zeroes daytime/
 * twilight AND damps the corona (at night uSunDir is the MOON key pointing
 * high — without the gate a daytime sun disc paints among the stars).
 *
 * DELIVERY: instead of GLX's fullscreen triangle at far depth, the factory
 * returns a NODE for three's scene.backgroundNode — three renders it on its
 * internal camera-following background mesh (depthTest/Write off, drawn
 * first, vertex z pinned to w == the far plane), which is exactly the GLX
 * draw order. The RAY MATH stays identical to SKY_VS: per-pixel NDC from
 * screenUV, unprojected through uInvViewProj on both z planes (frameSky
 * carries invViewProj each frame — the env-probe pass in game.js swaps it
 * per face, so update() must NOT derive the ray from three's camera nodes).
 * screenUV is top-left origin on BOTH backends (three normalises the WebGL
 * gl_FragCoord to the WebGPU convention), hence the 1-y in the NDC build.
 *
 * NOISE FAMILY: the SKY-family hash/vnoise/fbm (GLXChunks.hash + .vnoise —
 * hash2's 127.1/311.7/34.5 constants, hash3, 4-octave fbm) live HERE, not in
 * tsl-chunks.js: tsl-chunks holds the SURFACE family (hash21 123.34/456.21)
 * whose vnoise would collide by name, and the sky is this family's only TSL
 * consumer. ignoise is shared from ctx.chunks (the one genuinely common leaf).
 *
 * SHAPE CONTRACT (see tlx.js header): publishes a FACTORY,
 *     TLXShaders.sky = (THREE, TSL, ctx) =>
 *         ({ node, fallbackNode, uniforms, update,
 *            cacheStep, cacheWarm, cacheState, dispose })   // the cache four: no-ops without ctx.cache
 * fallbackNode is a zenith→horizon screen-Y mix (no ray reconstruction).
 * tlx.js arms it on software GL: the full SKY_FS node either misses
 * (fog Color → beige void) or reconstructs rays badly against the HDR
 * target. Real GPUs keep `node`.
 * ctx = { chunks, cache, cacheSize } (TLXShaders.chunks(THREE, TSL); optional —
 * ignoise falls back to a local copy; cache: build the E1 cloud cache). NEVER touches THREE/TSL at script eval — three
 * exists only inside TLX.create().
 *
 * STANDING RULE (tsl-lit.js header): every shared varying-derived node gets
 * an unconditional Fn-body .toVar() anchor before any conditional use —
 * here screenUV and the whole dir chain anchor at the top of the Fn.
 *
 * CLOUD NOISE CACHE (TLX perf hunt E1; ctx.cache, apex26.tlxSkyCache): see
 * makeCache() below. The four cloud FBMs are a pure function of the cloud-
 * plane point cp = dir.xz / up * 0.42 plus a per-channel drift TRANSLATION,
 * so they are baked once into a 2-D cp-plane texture and looked up at
 * cp + (drift now - drift at bake): the clouds keep moving every frame with
 * no staleness, and the texture is re-baked (in bands, into a second target)
 * only when that offset nears the window's margin. Everything else in the
 * sky stays per pixel. glsl-sky.js keeps the per-pixel FBMs (the cache is a
 * TLX-only cost change; the parity bound is in makeCache's header).
 */
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

    /* SKY-family noise (GLXChunks.hash + GLXChunks.vnoise, verbatim) */
    const hash3 = Fn(([pIn]) => {
      const p = fract(vec3(pIn).mul(0.3183099).add(vec3(0.1, 0.2, 0.3))).mul(17.0).toVar();
      return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
    }).setLayout({ name: "apexSkyHash3", type: "float", inputs: [{ name: "pIn", type: "vec3" }] });
    const hash2 = Fn(([pIn]) => {
      const p = fract(vec2(pIn).mul(vec2(127.1, 311.7))).toVar();
      p.addAssign(dot(p, p.add(34.5)));
      return fract(p.x.mul(p.y));
      // LAYOUTS, not style. Unlayouted, three inlines every Fn at every call:
      // fbm(4 vnoise) × 4 calls + 1 direct = 17 vnoise = 68 hash2 copies, and
      // the sky fragment carried 171 node variables for them. The names stay
      // apexSky* because this is a DIFFERENT noise family from tsl-chunks'
      // (127.1/311.7 here, 123.34/456.21 there) and the two must not read as
      // one at the WGSL level. All four are pure functions of their arguments.
    }).setLayout({ name: "apexSkyHash2", type: "float", inputs: [{ name: "pIn", type: "vec2" }] });
    const vnoise = Fn(([pIn]) => {
      const i = floor(pIn);
      const f = fract(pIn).toVar();
      f.assign(f.mul(f).mul(f.mul(-2.0).add(3.0)));   // f*f*(3-2f)
      const a = hash2(i), b = hash2(i.add(vec2(1, 0)));
      const c = hash2(i.add(vec2(0, 1))), d = hash2(i.add(vec2(1, 1)));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }).setLayout({ name: "apexSkyVnoise", type: "float", inputs: [{ name: "pIn", type: "vec2" }] });
    // 4-octave fbm (glsl-chunks.js: s += a*vnoise(p); p *= 2.02; a *= 0.5) unrolled.
    const fbm = Fn(([pIn]) => {
      const p = vec2(pIn).toVar();
      const s = vnoise(p).mul(0.5).toVar();
      p.mulAssign(2.02); s.addAssign(vnoise(p).mul(0.25));
      p.mulAssign(2.02); s.addAssign(vnoise(p).mul(0.125));
      p.mulAssign(2.02); s.addAssign(vnoise(p).mul(0.0625));
      return s;
    }).setLayout({ name: "apexSkyFbm", type: "float", inputs: [{ name: "pIn", type: "vec2" }] });
    // ignoise: the shared leaf from tsl-chunks (local fallback keeps the
    // factory self-sufficient if ctx.chunks is absent).
    const ignoise = (ctx && ctx.chunks && ctx.chunks.ignoise) || Fn(([p]) => {
      return fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));
    });

    /* the 28 uniforms (drawSky upload in js/render/glx/glx.js) */
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

    /* UNIFORM-ONLY TERMS, hoisted (TLX perf hunt E5). Every value below is a
     * pure function of the U uniforms, so the GPU used to evaluate it once per
     * uncovered sky pixel (~0.5 M a frame at 1080p, again in the mirror). They
     * are derived ONCE per update() in derive(), in the same arithmetic as the
     * per-pixel graph did (glsl-sky.js SKY_FS still spells them per pixel and
     * stays the source of truth; only float rounding may differ in the last
     * ulp). The noise, the ray and every per-pixel term are untouched. */
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
      mieDamp: uniform(0.0), mieK: uniform(0.0),
      sunHLen: uniform(0.0), sunHn: v2(), hGlowCol: v3(),
      coronaDamp: uniform(0.0), golden: uniform(0.0), sunWarm: v3(), aurExp: uniform(0.0),
      aurCol: v3(), squash: uniform(0.0), discOut: uniform(0.0), discIn: uniform(0.0),
      discCore: v3(), starThresh: uniform(0.0), dthOff: uniform(0.0),
      // E1 cache lookup: on/off and the per-channel cp offset since the bake.
      cacheOn: uniform(0.0), cD1: v2(), cD3: v2(), cDb: v2(),
    };
    const C = ctx && ctx.cache ? makeCache() : null;
    const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const set3 = (u, x, y, z) => u.value.set(x, y, z);
    function derive() {
      const sd = U.sunDir.value, sc = U.sunColor.value, ze = U.zenith.value, ho = U.horizon.value;
      const cloud = U.cloud.value;
      // Sun elevation, the day / twilight / night gates and overcast (SKY_FS head).
      const sunE = clamp01(sd.y * 1.4);
      const night = U.stars.value >= 0.5 ? 1 : 0;   // step(0.5, uStars)
      const day0 = sstep(0.35, 0.60, sunE);
      const daytime = day0 * (1 - night);
      const twilight = sstep(0.02, 0.22, sunE) * (1 - day0) * (1 - night);
      const overcast = sstep(0.5, 1.0, cloud);
      D.sunE.value = sunE; D.daytime.value = daytime; D.twilight.value = twilight;
      D.nightSky.value = night; D.overcast.value = overcast;
      // Gradient: the overcast-flattened zenith / horizon (night lid = (z+h)*1.25).
      const kz = overcast * 0.75, kh = overcast * 0.60;
      const lid = (a, b) => (a + b) * 1.25;
      const gz = [lerp(0.55, lid(ze.x, ho.x), night), lerp(0.56, lid(ze.y, ho.y), night), lerp(0.58, lid(ze.z, ho.z), night)];
      const gh = [lerp(0.58, lid(ze.x, ho.x), night), lerp(0.58, lid(ze.y, ho.y), night), lerp(0.60, lid(ze.z, ho.z), night)];
      set3(D.zenithO, lerp(ze.x, gz[0], kz), lerp(ze.y, gz[1], kz), lerp(ze.z, gz[2], kz));
      set3(D.horizonO, lerp(ho.x, gh[0], kh), lerp(ho.y, gh[1], kh), lerp(ho.z, gh[2], kh));
      D.dayClear.value = daytime * (1 - overcast);
      // Golden hour + low-sun band: the sun-only factors and colours.
      D.goldenK.value = (1 - sstep(0.0, 0.72, sunE)) * (1 - overcast * 0.9);
      const gc = clamp01(sunE * 2.5);
      set3(D.goldenColor, lerp(0.70, 0.92, gc), lerp(0.22, 0.55, gc), lerp(0.04, 0.16, gc));
      D.lowK.value = (1 - sstep(0.0, 0.60, sunE)) * (1 - overcast * 0.85);
      const lc = clamp01(sunE * 3.0);
      set3(D.lowColor, lerp(0.90, 1.0, lc), lerp(0.26, 0.66, lc), lerp(0.03, 0.12, lc));
      // Clouds: drift, coverage window, enrichment gates, the lit model's colours.
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
      const golden = 1 - sstep(0.0, 0.45, sunE);   // goldenC == golden (the same expression)
      D.golden.value = golden;
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
      // Mie + the horizon glow in the sun's compass direction.
      const mieDamp = 1 - overcast * 0.85;
      D.mieDamp.value = mieDamp;
      D.mieK.value = 0.22 * mieDamp * U.mieScatter.value;
      const hLen = Math.hypot(sd.x, sd.z);
      D.sunHLen.value = hLen;
      if (hLen > 0.05) D.sunHn.value.set(sd.x / hLen, sd.z / hLen); else D.sunHn.value.set(0, 0);
      const hk = 0.22 * hLen * mieDamp;
      set3(D.hGlowCol, sc.x * hk, sc.y * hk, sc.z * hk);
      // Corona, aureole and disc.
      const cd = (1 - overcast * 0.92) * (1 - night);
      D.coronaDamp.value = cd;
      const sw = [lerp(sc.x, sc.x * 1.18, golden), lerp(sc.y, sc.y * 0.52, golden), lerp(sc.z, sc.z * 0.24, golden)];
      set3(D.sunWarm, sw[0], sw[1], sw[2]);
      D.aurExp.value = lerp(20.0, 8.0, golden);
      const ak = (golden * 0.55 + 0.55) * cd * U.coronaAureole.value;
      set3(D.aurCol, sw[0] * ak, sw[1] * ak, sw[2] * ak);
      D.squash.value = lerp(1.0, lerp(1.0, 1.6, golden), U.sunSquash.value);
      D.discOut.value = lerp(0.018, 0.028, golden) * U.sunDiscSize.value;
      D.discIn.value = U.sunDiscSize.value * 0.006;
      set3(D.discCore, lerp(2.3, sw[0] * 2.8, golden), lerp(2.2, sw[1] * 2.8, golden), lerp(1.9, sw[2] * 2.8, golden));
      // Star spawn window; the dither's time step (float32 like the GPU's floor).
      D.starThresh.value = Math.min(0.9994, 1.0 - U.starDensity.value * (1.0 - 0.9968));
      const step60 = Math.floor(Math.fround(Math.fround(U.time.value) * 60.0));
      D.dthOff.value = (step60 - 64 * Math.floor(step60 / 64)) * 5.588238;   // GLSL mod(): never negative
      if (C) cacheSync();
    }

    /* THE CLOUD NOISE CACHE (TLX perf hunt E1).
     *
     * WHAT IS CACHED: the four raw FBM values of the cloud block, which are all
     * of its noise (16 of the 17 vnoise per day sky pixel; `az` stays):
     *   R f      = fbm(cp + drift1)          G billow = fbm((cp + drift1)*2.3 + c)
     *   B thick  = fbm((cp + drift2)*0.55 + thickOff)
     *   A bank   = fbm(cp*AB + bankDrift)    (AB = 0.16/0.42; equal to the per-
     *              pixel dir.xz/max(up,0.02)*0.16 wherever up >= 0.02)
     * Every uniform-dependent step after them (coverage window, cloudRich,
     * defMix, bank threshold, the lit colour, moon, lightning, city glow) stays
     * per pixel, so weather, time of day and a lightning flash need no re-bake.
     *
     * KEYED BY THE CLOUD PLANE, not by direction: texel (s, t) of an S x S
     * RGBA16F target holds the channels at cp_t = (screenUV*2-1)*W, baked with
     * the drift values of the moment (F.o*). Each channel's argument is
     * A_k*cp + o_k(time), so its value NOW is the baked texel at
     * cp + (o_k(now) - o_k(bake))/A_k: D.cD1 (f, billow), D.cD3 (thick), D.cDb
     * (bank), recomputed every update(). The look is never stale; only the
     * WINDOW ages. W = R + MARGIN + 2 texels, R = the cp radius of the lowest
     * cached elevation (up = U0). When an offset passes MARGIN/2 a re-bake
     * starts into the back target, N_BANDS row bands a frame, then the two
     * swap; past MARGIN (a time jump, a CLOUD SPEED edit, a new session) the
     * sky takes the per-pixel FBMs until the swap. Below U0 (the last 3.4 deg
     * above the horizon, where 1/up^2 packs the most noise per degree) the
     * sky is always per pixel.
     *
     * NUMBERS (scratch/skycache/sim.mjs: the cloud block in float64 against a
     * bilinear, fp16-quantised bake; 960x540, vfov 55, pitch -4, 4 yaws, ACES +
     * sRGB luma): S 768, U0 0.06 -> R 6.99, W 7.53, texel h 0.0196 cp. The
     * highest octave is billow's 4th, 2.3 * 2.02^3 = 18.95 cells per cp, so
     * 2.7 texels per noise cell. Day (cloud 0.44): 0.011 LSB mean |diff| over
     * the sky, max 0.8, signed mean -0.003. Night (0.22): 0.075 mean, max 1.8,
     * signed -0.013. 87.5 % of the sky pixels (up > 0.012) take the cache.
     * Drift compensation checked at dt 30 s, CLOUD SPEED 2.5 (0.065 mean).
     * Re-bake cadence: the bank offset grows fastest (3.7x drift1, 0.011 cp/s
     * at CLOUD SPEED 1), so MARGIN/2 = 0.25 cp comes every ~23 s (9 s at 2.5);
     * a re-bake is 768^2 texels x 16 vnoise over 16 frames (36,864 texels a
     * frame, ~7 % of one day 1080p sky frame's noise, for 16 frames). */
    function makeCache() {
      const S = (ctx.cacheSize | 0) > 0 ? ctx.cacheSize | 0 : 768, U0 = 0.06, MARGIN = 0.5, N_BANDS = 16;
      const AB = 0.16 / 0.42;
      const R = 0.42 * Math.sqrt(1 - U0 * U0) / U0;
      const W = (R + MARGIN) * (1 + 4 / S);   // + 2 texels for the bilinear edge
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
      // The bake's drift origins (read by the fill pass) and the band's rows.
      const F = { o1: v2(), o2: v2(), oT: v2(), ob: v2(), y0: uniform(-1.0), y1: uniform(1.0) };
      // The four channels at this texel's cp. sample(uv) returns the texel
      // written at screenUV == uv on both of three's backends (GLSL flips both
      // screenCoordinate and render-target uvs; WGSL flips neither).
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
      // One band: x -1..1, y 0..1 (the vertex node maps y onto [y0, y1]).
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
    // The front bake's offsets for THIS update's drifts, and whether they fit.
    function cacheSync() {
      const d1 = D.drift1.value, d2 = D.drift2.value, to = D.thickOff.value, bd = D.bankDrift.value;
      const ax = d1.x - C.fo1[0], ay = d1.y - C.fo1[1];
      const tx = (d2.x - C.fo2[0]) + (to.x - C.foT[0]) / 0.55, ty = (d2.y - C.fo2[1]) + (to.y - C.foT[1]) / 0.55;
      const bx = (bd.x - C.fob[0]) / C.AB, by = (bd.y - C.fob[1]) / C.AB;
      D.cD1.value.set(ax, ay); D.cD3.value.set(tx, ty); D.cDb.value.set(bx, by);
      C.maxOff = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(tx), Math.abs(ty), Math.abs(bx), Math.abs(by));
      D.cacheOn.value = C.valid && !C.dead && C.maxOff <= C.MARGIN ? 1 : 0;
    }
    /** Once a frame (tlx.js present, before the scene pass): bake one band of
     * the back target when a re-bake is due. A no-op with no cloud (the block
     * is skipped), with the cache off or after a failure. Leaves the
     * renderer's target, MRT and autoClear as it found them. */
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
        renderer.autoClear = false;   // the other bands stay: no clear, loadOp "load"
        renderer.setRenderTarget(C.rts[1 - C.front]);
        renderer.render(C.scene, C.cam);
      } catch (e) {
        C.dead = true; C.filling = false; D.cacheOn.value = 0;
        throw e;
      } finally {
        renderer.autoClear = ac;
        renderer.setRenderTarget(t);
        if (mrt) renderer.setMRT(mrt);
      }
      C.bands++;
      if (++C.band < N) return;
      // Complete: swap, adopt the bake's origins, re-derive the lookup now —
      // this frame's scene pass already samples the new front.
      C.front = 1 - C.front; C.filling = false; C.valid = true; C.fills++;
      C.tex.value = C.rts[C.front].texture;
      const F = C.F;
      C.fo1[0] = F.o1.value.x; C.fo1[1] = F.o1.value.y; C.fo2[0] = F.o2.value.x; C.fo2[1] = F.o2.value.y;
      C.foT[0] = F.oT.value.x; C.foT[1] = F.oT.value.y; C.fob[0] = F.ob.value.x; C.fob[1] = F.ob.value.y;
      cacheSync();
    }
    /** The warm (tlx.js): compile the fill program against its own target.
     * The caller owns and restores the render target and MRT (null here). */
    async function cacheWarm(renderer) {
      if (!C || C.dead || !renderer || !renderer.compileAsync) return;
      renderer.setRenderTarget(C.rts[1 - C.front]);
      await renderer.compileAsync(C.scene, C.cam);
    }
    function cacheState() {
      return C ? { size: C.S, u0: C.U0, on: D.cacheOn.value, valid: C.valid, filling: C.filling, band: C.band,
        fills: C.fills, bands: C.bands, maxOff: +C.maxOff.toFixed(4), dead: C.dead } : null;
    }
    function dispose() {
      if (!C) return;
      C.dead = true; D.cacheOn.value = 0;
      for (const rt of C.rts) { try { rt.dispose(); } catch (_) { /* already gone */ } }
      try { C.geo.dispose(); C.mat.dispose(); } catch (_) { /* already gone */ }
    }
    derive();

    /** drawSky(frameSky) -> uniform values. Field names + defaults mirror the
     * js/render/glx/glx.js upload exactly (each frameSky field maps to the same-
     * named uniform; stars is the bool->float night flag). Takes whatever
     * invViewProj the frame carries — the env-probe pass (M9) swaps it. */
    function update(sky) {
      if (!sky) return;
      const s3 = (u, a) => { if (a) u.value.set(a[0], a[1], a[2]); };
      const s1 = (u, v, def) => { u.value = v !== undefined ? v : def; };
      if (sky.invViewProj) U.invViewProj.value.fromArray(sky.invViewProj);
      s3(U.zenith, sky.zenith);
      s3(U.horizon, sky.horizon);
      s3(U.sunDir, sky.sunDir);
      s3(U.sunColor, sky.sunColor);
      U.stars.value = sky.stars ? 1 : 0;
      s1(U.cloud, sky.cloud, 0);
      s1(U.time, sky.time, 0);
      s1(U.moon, sky.moon, 0);
      s3(U.cityGlow, sky.cityGlow || [0, 0, 0]);
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

    /* the fragment (SKY_VS ray math + SKY_FS in js/render/glx/shaders/glsl-sky.js) */
    const node = Fn(() => {
      // ANCHORS: screenUV + the whole ray chain, unconditional
      const suv = vec2(screenUV).toVar();
      // NDC: screenUV is top-left origin -> flip y (SKY_VS's p covers -1..1).
      const p = vec2(suv.x.mul(2.0).sub(1.0), float(1.0).sub(suv.y).mul(2.0).sub(1.0)).toVar();
      // SKY_VS: unproject both z planes through uInvViewProj, dir = far - near.
      const a4 = U.invViewProj.mul(vec4(p, -1.0, 1.0)).toVar();
      const b4 = U.invViewProj.mul(vec4(p, 1.0, 1.0)).toVar();
      const dir = normalize(b4.xyz.div(b4.w).sub(a4.xyz.div(a4.w))).toVar();

      const up = dir.y.toVar();
      const sd = max(dot(dir, U.sunDir), 0.0).toVar();

      // Sun-elevation factor: 0 = sun on/below horizon, 1 = overhead noon.
      // All five gates are derive()d uniforms (SKY_FS spells them per pixel).
      const sunE = D.sunE;
      // Bright-DAY gate (sun well up, ~25°+) + TWILIGHT gate (dawn/dusk).
      // NIGHT gate: at night uSunDir points HIGH (it doubles as the moon key
      // light) which reads as midday to sunE — derive() zeroes the sun-driven
      // day/twilight ENRICHMENTS so no daytime sun/cumulus paint among the stars.
      const daytime = D.daytime, twilight = D.twilight, nightSky = D.nightSky;
      // Overcast factor: grey-shift + corona damping under heavy cloud.
      const overcast = D.overcast;

      // --- Sky gradient ---
      const c = vec3(0.0).toVar();
      If(up.greaterThanEqual(0.0), () => {
        // Under heavy overcast, flatten zenith/horizon toward a uniform grey.
        // NIGHT-GATED, like daytime/twilight above: this target is a DAYLIGHT
        // overcast ceiling, and overcast was the one cloud term the nightSky gate
        // never covered — a night+rain sky painted a pale grey lid ~20x the
        // authored zenith. One common target at night so it stays a FLATTEN.
        // Mirrors js/render/glx/shaders/glsl-sky.js (zenithO / horizonO: derive()).
        const zenithO = D.zenithO, horizonO = D.horizonO;
        // SKY GRADIENT knob (def 0.35 = as-shipped).
        c.assign(mix(horizonO, zenithO, pow(up, U.skyGrad)));
        // Day gradient LIFE: deep saturated-blue low/mid band + faint
        // azimuthal variation. Day-only, faded under overcast.
        // GATED ON daytime (GLX SKY_FS): the atan + vnoise below are
        // multiplied by daytime, which is 0 on every night frame and
        // every dawn/dusk frame with the sun under ~14.5°.
        If(daytime.greaterThan(0.0), () => {
          const bandLM = smoothstep(0.06, 0.55, up).oneMinus().mul(smoothstep(0.0, 0.06, up));
          const deepBlue = vec3(0.10, 0.30, 0.72);
          c.assign(mix(c, mix(c, deepBlue, 0.30),
            clamp(D.dayClear.mul(bandLM).mul(U.daySkyBlue), 0.0, 1.0)));
          const az = vnoise(vec2(atan(dir.z, dir.x).mul(2.2), up.mul(6.0))).sub(0.5);
          c.mulAssign(az.mul(0.05).mul(D.dayClear)
            .mul(smoothstep(0.0, 0.5, up).oneMinus()).add(1.0));
        });
        // Golden-hour + low-sun band: both amounts are 0 when sunE >= 0.72
        // (GLX SKY_FS). Default day / night moon-key skip; dawn/dusk still enter.
        If(sunE.lessThan(0.72), () => {
        // Golden-hour: warm overlay near the horizon when the sun is low.
        const goldenAmt = D.goldenK.mul(smoothstep(0.0, 0.32, up).oneMinus());
        const goldenColor = D.goldenColor;
        c.assign(mix(c, c.mul(0.45).add(goldenColor.mul(0.55)), goldenAmt.mul(0.80)));
        // Low-sun horizon band: extra warm band just above the horizon.
        const lowBand = D.lowK.mul(smoothstep(0.0, 0.18, up).oneMinus())
          .mul(smoothstep(0.01, 0.06, up));
        const lowColor = D.lowColor;
        c.assign(mix(c, lowColor, lowBand.mul(0.70)));
        });
      }).Else(() => {
        // Below the horizon: dark earth tone blended from the horizon colour.
        const gnd = clamp(up.negate().mul(5.0), 0.0, 1.0);
        c.assign(mix(U.horizon.mul(0.85), vec3(0.035, 0.030, 0.022), gnd.mul(gnd)));
      });

      // --- Procedural cloud layer ---
      // Coverage/thickness along this ray, hoisted for the city-glow cloud
      // pickup + star occlusion below.
      const cityCov = float(0.0).toVar();
      const cityThick = float(0.0).toVar();
      If(U.cloud.greaterThan(0.001).and(up.greaterThan(0.012)), () => {
        const cp = dir.xz.div(up).mul(0.42);
        // Two independent slow drift vectors; CLOUD SPEED scales the rate
        // (time * cloudSpeed, derive()); evolution warps the second octave.
        const cp1 = cp.add(D.drift1).toVar();
        const cp2 = cp.add(D.drift2);
        // E1 (C): the four FBMs from the cache above U0 while its window holds
        // (D.cacheOn), else per pixel exactly as before. Without C the graph is
        // the pre-cache one, node for node.
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
        // Base coverage; fade in just above the horizon.
        const cov = smoothstep(D.covLo, 0.84, f)
          .mul(smoothstep(0.013, 0.05, up)).toVar();
        // Cloudscape enrichments — bright DAY *and* TWILIGHT; night untouched.
        const cloudRich = D.cloudRich;
        If(cloudRich.greaterThan(0.001), () => {
          // Billow: higher-frequency octave carves lumpy cumulus definition.
          // Cached: billow came with f; the bank tap only where its band is
          // non-zero (the (1 - smoothstep(0.10, 0.26, up)) factor below is
          // exactly 0 from up 0.26, so bankN = 0 there is the same product).
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
          // CLOUD DEFINITION knob (0.85 = as-shipped blend).
          cov.assign(mix(cov, max(cov, defined), D.defMix));
          // Horizon cloud-bank on the compressed *0.16 plane, banded ~1-9°.
          const bp = dir.xz.div(max(up, 0.02)).mul(0.16).add(D.bankDrift);
          const bankThresh = D.bankThresh;
          const bankCov = smoothstep(bankThresh, 0.80, C ? bankN : fbm(bp))
            .mul(smoothstep(0.013, 0.030, up))
            .mul(smoothstep(0.10, 0.26, up).oneMinus());
          cov.assign(max(cov, bankCov.mul(D.bankK)));
          // Firmer edges so cumulus look solid, not gauzy.
          cov.assign(mix(cov, smoothstep(0.18, 0.82, cov), cloudRich.mul(0.5)));
        });
        // Second FBM gives per-cloud thickness (thin = backlit, thick = dark).
        const thick = clamp((C ? thickN : fbm(cp2.mul(0.55).add(D.thickOff)))
          .mul(2.0).sub(0.55), 0.0, 1.0).toVar();
        const sl = pow(sd, 2.0).toVar();
        // Under heavy overcast even a bright sun gives grey clouds (effSunBright,
        // goldenC == golden: derive()).
        // Sunlit tops: white in daylight, warm/red at golden hour.
        const cloudTop = mix(vec3(0.58, 0.62, 0.70), vec3(1.0, 0.97, 0.91), sl).toVar();
        cloudTop.mulAssign(D.topK);
        cloudTop.assign(mix(cloudTop, cloudTop.mul(D.topTint), sl.mul(D.topWarm)));
        cloudTop.assign(mix(cloudTop, vec3(0.62, 0.63, 0.65), overcast.mul(0.65)));
        // Dark undersides: cooler/dimmer, warm pink under-glow at sunset —
        // no per-pixel input at all, so the whole colour is derive()d.
        const cloudBot = D.cloudBot;
        const capf = clamp(thick.oneMinus().mul(0.75).add(0.18), 0.0, 1.0).toVar();
        const lit = mix(cloudBot, cloudTop, capf).toVar();
        // Day: widen the top-bottom contrast (gated; twilight keeps soft grading).
        lit.assign(mix(lit, mix(cloudBot.mul(0.80), cloudTop.mul(1.14), capf), daytime.mul(0.45)));
        // Silver lining: thin sun-facing edges glow (backlit forward scatter).
        const silver = pow(sd, 6.0).mul(thick.oneMinus()).mul(D.silverK);
        lit.addAssign(D.silverCol.mul(silver));
        // Twilight: broad warm wash. twilight is a uniform — 0 on default
        // day / night (GLX SKY_FS). Dawn/dusk still enter.
        If(twilight.greaterThan(0.001), () => {
        lit.addAssign(D.washCol.mul(pow(sd, 2.5)));
        });
        // Moon tints nearby clouds faintly blue-silver.
        If(U.moon.greaterThan(0.0), () => {
          const moonLit = U.moon.mul(cov).mul(thick.mul(0.6).oneMinus()).mul(0.18);
          lit.assign(mix(lit, lit.add(vec3(0.08, 0.10, 0.16)), moonLit));
        });
        // LIGHTNING: the deck flares — thick bellies brightest (bolt inside/
        // behind the deck), cool blue-white, HDR >1 so it blooms.
        If(U.lightning.greaterThan(0.001), () => {
          const ltFlash = vec3(0.82, 0.94, 1.30).mul(thick.mul(1.2).add(1.0));
          lit.assign(mix(lit, ltFlash, clamp(U.lightning.mul(thick.mul(0.60).add(0.40)), 0.0, 1.0)));
        });
        c.assign(mix(c, lit, cov));
        cityCov.assign(cov);
        cityThick.assign(thick);
      });

      // LIGHTNING sky-gradient lift: the clear dome between the clouds picks
      // up a gentler cool bleach, weighted DOWN where the deck already flared.
      If(U.lightning.greaterThan(0.001).and(up.greaterThan(0.0)), () => {
        c.addAssign(vec3(0.10, 0.13, 0.20).mul(U.lightning).mul(cityCov.mul(0.6).oneMinus()));
      });

      // --- Mie forward scatter: glow toward the sun, strongest near horizon ---
      const upPos = max(up, 0.0).toVar();
      c.assign(mix(c, U.sunColor, clamp(pow(sd, 5.0)
        .mul(max(upPos.mul(1.5).oneMinus(), 0.0)).mul(D.mieK), 0.0, 1.0)));

      // --- Horizon glow in the sun's compass direction ---
      // sunHLen, the unit compass direction and the glow colour: derive().
      If(D.sunHLen.greaterThan(0.05), () => {
        const dirH = vec2(dir.x, dir.z);
        const dirHLen = length(dirH).toVar();
        // select() compiles to a real ternary; the max() guards the unselected
        // divide (a 0-length dirH would put NaN in the dead branch on strict
        // drivers that evaluate both sides).
        const hdot = dirHLen.greaterThan(0.05)
          .select(max(dot(dirH.div(max(dirHLen, 1e-5)), D.sunHn), 0.0), float(0.0));
        const hband = max(abs(up).mul(5.0).oneMinus(), 0.0);
        c.addAssign(D.hGlowCol.mul(pow(hdot, 6.0)).mul(hband).mul(hband));
      });

      // --- Sun corona + disc (damped under overcast; nightSky gate folded in
      //     so a night session can never paint a sun disc among the stars) ---
      // SKIP THE WHOLE BLOCK ON A NIGHT FRAME (GLX SKY_FS). coronaDamp's
      // second factor is (1 - nightSky), so every addAssign below is * 0
      // when nightSky == 1. 2 pow + length + smoothstep on every uncovered
      // sky pixel. nightSky is a uniform (uStars) — no divergence.
      If(nightSky.lessThan(0.5), () => {
        const coronaDamp = D.coronaDamp;   // golden, sunWarm and the aureole's colour too: derive()
        const sunWarm = D.sunWarm;
        // Wide aureole: broader (lower exponent) + stronger at golden hour.
        c.addAssign(D.aurCol.mul(pow(sd, D.aurExp)).mul(cityCov.mul(0.6).oneMinus()));
        // Tight inner ring.
        // Behind the cloud deck (GLX sunClear): cityCov hides disc + ring, most of the aureole.
        c.addAssign(sunWarm.mul(pow(sd, 300.0)).mul(0.95).mul(U.sunCorona).mul(coronaDamp).mul(cityCov.oneMinus()));
        // Disc, vertically squashed near the horizon (atmospheric refraction).
        const dd = dir.sub(U.sunDir.mul(sd)).toVar();
        const perp = length(vec2(length(dd.xz), dd.y.mul(D.squash))).toVar();
        const disc = smoothstep(D.discOut, D.discIn, perp).mul(coronaDamp).mul(cityCov.oneMinus()).toVar();
        // Bright HDR core (>1) so it blooms; warm-white high, deep amber low.
        const discCore = D.discCore;
        c.addAssign(discCore.mul(disc));
      });

      // --- Stars (night tracks): round anti-aliased point discs, brightness
      //     capped below the bloom threshold (no streak smear) ---
      If(U.stars.greaterThan(0.5).and(up.greaterThan(0.05)), () => {
        const SC = 180.0;
        const cell = floor(dir.mul(SC)).toVar();
        const h = hash3(cell).toVar();
        // STAR DENSITY scales the spawn window, capped below 1.
        If(h.greaterThan(D.starThresh), () => {
          const jit = vec3(hash3(cell.add(7.1)), hash3(cell.add(13.7)), hash3(cell.add(29.3))).sub(0.5);
          const sdir = normalize(cell.add(0.5).add(jit.mul(0.8)).div(SC));
          const d = length(dir.sub(sdir));
          const bright = hash3(cell.add(43.0)).mul(0.55).add(0.30);
          const phase = hash3(cell.add(31.0)).mul(6.2832);
          // STAR TWINKLE: ±0.20 oscillation around the 0.80 base.
          const twinkle = U.starTwinkle.mul(0.20).mul(sin(U.time.mul(1.4).add(phase))).add(0.80);
          const giant = step(0.9995, h);                       // rare brighter star
          const srad = mix(float(0.0016), float(0.0028), giant).mul(U.starSize);
          const star = smoothstep(srad, srad.mul(0.35), d)
            .mul(min(0.88, bright.mul(twinkle).mul(giant.mul(0.6).add(1.0))));
          // Cloud occlusion: stars sit BEHIND the deck (cityCov hoisted above).
          c.addAssign(vec3(star).mul(U.starBright).mul(cityCov.oneMinus()));
        });
      });

      // --- Moon disc + halo (night tracks). The disc hangs on sunDir, which at
      // night IS the moon key light (GLX parity: the shadows fall toward it) ---
      If(U.moon.greaterThan(0.0).and(U.stars.greaterThan(0.5)), () => {
        const moonDir = normalize(U.sunDir);
        const md = dot(dir, moonDir).toVar();
        const moonPerp = length(dir.sub(moonDir.mul(max(md, 0.0)))).toVar();
        const moonDisc = smoothstep(U.moonDiscSize.mul(0.025), U.moonDiscSize.mul(0.010), moonPerp)
          .mul(U.moon);
        const moonHalo = exp(moonPerp.mul(moonPerp)
          .mul(float(140.0).div(max(U.moonHalo, 0.001))).negate())
          .mul(0.28).mul(U.moonHalo).mul(U.moon);
        const moonCol = vec3(0.82, 0.88, 1.00);
        If(up.greaterThan(0.0).and(md.greaterThan(0.0)), () => {
          // Cloud occlusion: the moon sits BEHIND the deck exactly as the
          // stars do (SKY_FS in js/render/glx/shaders/glsl-sky.js). Without this a
          // stormy/foggy night painted a crisp moon ON TOP of the clouds
          // while the stars behind it were correctly hidden.
          c.addAssign(moonCol.mul(moonDisc.mul(1.10).add(moonHalo)).mul(cityCov.oneMinus()));
        });
      });

      // CITY SKYGLOW: light-pollution dome hugging the horizon + a hint of
      // cloud-belly pickup (clouds over a lit city glow from below).
      If(U.cityGlow.x.add(U.cityGlow.y).add(U.cityGlow.z).greaterThan(0.001), () => {
        const horiz = pow(clamp(max(dir.y, 0.0).mul(2.4).oneMinus(), 0.0, 1.0),
          U.cityGlowReach.mul(3.0));
        c.addAssign(U.cityGlow.mul(horiz));
        const pickup = cityCov.mul(cityThick.mul(0.65).add(0.35))
          .mul(clamp(dir.y.mul(1.6).oneMinus(), 0.0, 1.0));
        c.addAssign(U.cityGlow.mul(pickup).mul(0.45));
      });

      // ~1/255 time-stepped IGN dither: the night gradient spans a handful of
      // 8-bit steps and the quantisation happens right here at scene write.
      const skyDth = ignoise(screenCoordinate.xy.add(D.dthOff));   // mod(floor(time*60), 64)*5.588238: derive()
      c.addAssign(skyDth.sub(0.5).mul(1.0 / 255.0));

      return vec4(c, 1.0);
    })();

    // Cheap miss-path for software GL (tlx.js drawSky). No invViewProj ray —
    // a SwiftShader HDR target collapses the full node to fog beige
    // or a flat zenith lid. Mix the same zenith/horizon uniforms the full
    // node reads, keyed on screen Y (top-left origin on both backends).
    const fallbackNode = Fn(() => {
      const t = smoothstep(0.08, 0.88, screenUV.y);
      return vec4(mix(U.zenith, U.horizon, t), 1.0);
    })();

    return { node, fallbackNode, uniforms: U, update, cacheStep, cacheWarm, cacheState, dispose };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { sky });
})();
