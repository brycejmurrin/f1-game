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
 *         ({ node, fallbackNode, uniforms, update })
 * fallbackNode is a zenith→horizon screen-Y mix (no ray reconstruction).
 * tlx.js arms it on software GL: the full SKY_FS node either misses
 * (fog Color → beige void) or reconstructs rays badly against the HDR
 * target. Real GPUs keep `node`.
 * ctx = { chunks } (TLXShaders.chunks(THREE, TSL); optional — ignoise falls
 * back to a local copy). NEVER touches THREE/TSL at script eval — three
 * exists only inside TLX.create().
 *
 * STANDING RULE (tsl-lit.js header): every shared varying-derived node gets
 * an unconditional Fn-body .toVar() anchor before any conditional use —
 * here screenUV and the whole dir chain anchor at the top of the Fn.
 */
"use strict";

(function () {
  function sky(THREE, TSL, ctx) {
    const {
      Fn, If, uniform,
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
    };
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
        const f = fbm(cp1).toVar();
        // Base coverage; fade in just above the horizon.
        const cov = smoothstep(D.covLo, 0.84, f)
          .mul(smoothstep(0.013, 0.05, up)).toVar();
        // Cloudscape enrichments — bright DAY *and* TWILIGHT; night untouched.
        const cloudRich = D.cloudRich;
        If(cloudRich.greaterThan(0.001), () => {
          // Billow: higher-frequency octave carves lumpy cumulus definition.
          const billow = fbm(cp1.mul(2.3).add(vec2(11.7, 4.3)));
          const defined = smoothstep(0.42, 0.80, f.mul(0.6).add(billow.mul(0.45)))
            .mul(smoothstep(0.013, 0.05, up));
          // CLOUD DEFINITION knob (0.85 = as-shipped blend).
          cov.assign(mix(cov, max(cov, defined), D.defMix));
          // Horizon cloud-bank on the compressed *0.16 plane, banded ~1-9°.
          const bp = dir.xz.div(max(up, 0.02)).mul(0.16).add(D.bankDrift);
          const bankThresh = D.bankThresh;
          const bankCov = smoothstep(bankThresh, 0.80, fbm(bp))
            .mul(smoothstep(0.013, 0.030, up))
            .mul(smoothstep(0.10, 0.26, up).oneMinus());
          cov.assign(max(cov, bankCov.mul(D.bankK)));
          // Firmer edges so cumulus look solid, not gauzy.
          cov.assign(mix(cov, smoothstep(0.18, 0.82, cov), cloudRich.mul(0.5)));
        });
        // Second FBM gives per-cloud thickness (thin = backlit, thick = dark).
        const thick = clamp(fbm(cp2.mul(0.55).add(D.thickOff))
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

    return { node, fallbackNode, uniforms: U, update };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { sky });
})();
