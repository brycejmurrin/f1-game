/* Apex 26 — TLXCarSurf: EXTREME car-surface shading detail for the TLX lit program (GfxQuality feature `carSurf`).
 *
 * tsl-lit.js reads GfxQuality.feature("carSurf") ONCE at factory time. Off (HIGH and below, every phone, ULTRA,
 * apex26.gfxx.carSurf=0) it never calls nodes(): no node is created and the lit program is today's, node for node
 * (tests/unit/tlx-carsurf.test.mjs builds both and compares the generated WGSL/GLSL). On, the hooks call the
 * builders below inside the lit Fn body; only the plain (non-chunked, non-instanced) graphs get them — cars never
 * draw through the other two. Every effect has its own strength in K and a distance or footprint fade, so a car
 * at range costs a few compares. No textures, no new uniforms: the inputs are objP (the mesh's own coordinates),
 * the model matrix axes, and screen derivatives taken ONCE in begin() at the Fn body's top level (uniform control
 * flow, the WGSL derivative rule tsl-lit.js documents).
 *
 * The car body has no UVs (the livery is vertex colour; sponsors and numbers are separate decal meshes drawn over
 * the body), so the panel layout is object space in metres, not livery-UV space, and a decal covers whatever is
 * under it. The layout is generic (two section seams, one longitudinal cover seam, fastener rows), no real car's.
 * The EXTREME hero body's lofts also carry LOFT UVS on the trk attribute (js/car/car-geometry.js loftUv): there
 * the section seams sit on its developed station and the fastener rows on its section arc, so they follow the
 * body; every other surface keeps the object-space layout.
 *
 * Techniques and sources (read 2026-11-20; constants are ours unless stated):
 * - Detail normals combine by SURFACE-GRADIENT addition, N' = normalize(N - (g - N(N.g))) (Mikkelsen, "Surface
 *   Gradient-Based Bump Mapping Framework", JCGT 2020; docs/notes/MODEL-DETAIL-ALGORITHMS-2026-11-20.md item 8).
 * - Anisotropic GGX D and the height-correlated anisotropic Smith visibility as in Filament's material model
 *   (google.github.io/filament/Filament.html §4.8.2, "Anisotropic model"); the alpha split preserves the mean
 *   roughness, alpha_t = alpha*sqrt(2/(1+(1-a)^2)), alpha_b = (1-a)*alpha_t (OpenPBR, arXiv 2512.23696).
 * - Specular anti-aliasing: Kaplanyan et al. 2016 "Filtering Distributions of Normals for Shading Antialiasing"
 *   (HPG; research.nvidia.com) and Tokuyoshi & Kaplanyan 2019/2021 "Improved/Stable Geometric Specular
 *   Antialiasing" (I3D; JCGT 10(2)): alpha^2 += min(2*sigma^2*(|dN/dx|^2+|dN/dy|^2), kappa). Filament's normalFiltering
 *   uses variance 0.15 and threshold 0.2 (google.github.io/filament/main/materials.html, specularAntiAliasing*).
 *   The lit program already widens roughness by the variance of Nsaa; the panel and tyre normals below are added
 *   BEFORE that snapshot so they pay into it, and saaAlpha2() is the clamped form used for the anisotropic lobe.
 * - Car paint as base + flake layer + clearcoat: Günther et al. 2005 "Efficient Acquisition and Realistic
 *   Rendering of Car Paint" (VMV; sci.utah.edu/~wald/Publications/2005/CarPaint) and the mental ray / Stride layered
 *   paint docs; mental ray warns flakes alias once their density falls below a pixel, which is why the glint width
 *   here grows with flakes-per-pixel while the gain falls by the same ratio (the mean is kept, the variance goes).
 *   Flake normals are hashed per object-space cell and tilted in the panel's own frame (Redshift / 3Delight flake
 *   shaders: per-flake random orientation, 0 = the surface normal), so they do not crawl when the car moves; L and V
 *   refract through the lacquer (n 1.5) before the flake sees them, and the coat's Fresnel is taken out on both legs.
 * - SDFs (segment, rounded box, annulus) from Inigo Quilez, iquilezles.org/articles/distfunctions2d, with their
 *   analytic gradients, so the panel/tyre normals need no extra derivative.
 * - Rounded-edge catch: the per-pixel normal cone (|dN/dx|, |dN/dy|) of a smoothed low-poly crease is the range of
 *   normals a real fillet would show; the shading normal moves toward the sun half-vector by at most half that
 *   cone, so a crease the loft smoothed (< 55 deg, car-shade.js smooth()) catches its highlight. A split (hard)
 *   normal has no derivative across the triangle boundary, so this cannot bevel those (geometry's job).
 * - F1 slicks have no tread: the tyre gets sidewall micro-ribbing, a moulded segmented band, and shoulder graining
 *   only; the compound band and lettering stay vertex colour (normal detail never touches albedo there).
 * NOT built (unseen inputs, no pretend stubs): brake-disc glow (no disc temperature reaches the shader), drilled
 * holes (the disc shares the metal/carbon ids with other parts), vents/louvres (no reliable region on the loft).
 */
"use strict";
const TLXCarSurf = (function () {
  // Strengths (0 = off for that effect) and fade ranges in metres. Footprint fades are in units of the feature's
  // own size: 1 at px <= lo*size, 0 at px >= hi*size.
  const K = Object.freeze({
    edge: Object.freeze({ k: 0.55, cone: 0.35, lo: 0.004, hi: 0.04, near: 10, far: 30 }),
    weave: Object.freeze({ aniso: 0.75, cell: 0.0165, lo: 0.35, hi: 1.0 }),
    flake: Object.freeze({ freq: 300, tilt: 0.35, w0: 0.010, ior: 1.5, near: 25, far: 55, f0: 0.04 }),
    flakeAlbedo: Object.freeze({ cell: 1 / 140, lo: 0.5, hi: 1.5 }),
    coat: Object.freeze({ peel: 0.6 }),
    panel: Object.freeze({ tilt: 0.35, ao: 0.32, w: 0.0032, lo: 0.5, hi: 2.0, near: 6, far: 16,
      seamZ: Object.freeze([1.05, -0.45]), coverX: 0.28, coverZ0: 0.6, coverZ1: -1.5,
      fastStep: 0.10, fastOff: 0.022, fastR: 0.0055 }),
    tyre: Object.freeze({ R: 0.34, frontZ: 1.7, rearZ: -1.6, wheelY: 0.34, frontX: 0.79, rearX: 0.76, tread: 0.322,
      rib: 0.0025, ribTilt: 0.18, band: Object.freeze([0.262, 0.282]), bandSeg: 24, bandTilt: 0.40, bandEdge: 0.0015,
      grain: 0.005, grainTilt: 0.10, shoulder: 0.6, near: 3, far: 15 }),
    saa: Object.freeze({ variance: 0.15, kappa: 0.18 }),
  });

  // ── pure maths (node-tested; the TSL below is the same formula, constant for constant) ──
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  // 1 at d <= near, 0 at d >= far, linear between (the lit program's clamp(1 - (d-near)/(far-near)) form).
  function fade(d, near, far) { return clamp01(1 - (d - near) / (far - near)); }
  // Footprint fade: px metres per pixel against a feature of `size` metres. Monotone non-increasing in px.
  function footprintFade(px, size, lo, hi) { return 1 - smooth(lo * size, hi * size, px); }
  // Mean-preserving anisotropic split of GGX alpha (OpenPBR): a=0 gives (alpha, alpha); at^2+ab^2 = 2 alpha^2.
  function anisoAlphas(alpha, a) {
    const s = clamp01(a), at = alpha * Math.sqrt(2 / (1 + (1 - s) * (1 - s)));
    return [at, (1 - s) * at];
  }
  // Tokuyoshi-Kaplanyan clamped kernel on alpha^2.
  function saaAlpha2(alpha2, variance) {
    return Math.min(1, alpha2 + Math.min(2 * K.saa.variance * variance, K.saa.kappa));
  }
  const len2 = (x, y) => Math.sqrt(x * x + y * y);
  function sdSegment(px, py, ax, ay, bx, by) {
    const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
    const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
    return len2(pax - bax * h, pay - bay * h);
  }
  function sdRoundBox(px, py, bx, by, r) {
    const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r;
    return Math.min(Math.max(qx, qy), 0) + len2(Math.max(qx, 0), Math.max(qy, 0)) - r;
  }
  function sdAnnulus(px, py, r0) { return Math.abs(len2(px, py) - r0); }
  // Groove profile on a distance d, width w: depth 1 - (d/w)^2 inside, 0 outside; its slope 2d/w^2.
  function groove(d, w) { return d < w ? 1 - (d / w) * (d / w) : 0; }
  function grooveSlope(d, w) { return d < w ? 2 * d / (w * w) : 0; }
  // Surface-gradient perturbation: N - k (g - N (N.g)), normalised. k = 0 returns N unchanged.
  function perturb(N, g, k) {
    if (!k) return N.slice();
    const ng = N[0] * g[0] + N[1] * g[1] + N[2] * g[2];
    const v = [0, 1, 2].map((i) => N[i] - k * (g[i] - N[i] * ng));
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return v.map((x) => x / l);
  }
  // Edge catch: move N toward H by min(|t|, c), t = H's tangential part, c = k * min(cone/2, coneMax). k = 0 → N.
  function edgeBend(N, H, cone, k) {
    const c = k * Math.min(0.5 * cone, K.edge.cone);
    if (!(c > 0)) return N.slice();
    const nh = N[0] * H[0] + N[1] * H[1] + N[2] * H[2];
    const t = [0, 1, 2].map((i) => H[i] - N[i] * nh), tl = Math.hypot(t[0], t[1], t[2]);
    if (tl < 1e-6) return N.slice();
    const s = Math.min(tl, c) / tl, v = [0, 1, 2].map((i) => N[i] + t[i] * s), l = Math.hypot(v[0], v[1], v[2]);
    return v.map((x) => x / l);
  }
  // Flake glint width and gain at `cpp` flake cells per pixel: width grows with cpp^2, gain falls by the same ratio.
  function flakeLod(cpp) { const w = K.flake.w0 * Math.max(1, cpp * cpp); return { w, gain: K.flake.w0 / w }; }
  // Refract a unit outward direction d through a coat of index n about N (returned outward, inside the coat).
  function refractOut(d, N, n) {
    const c = N[0] * d[0] + N[1] * d[1] + N[2] * d[2], s2 = Math.max(0, 1 - c * c) / (n * n), ct = Math.sqrt(1 - s2);
    const v = [0, 1, 2].map((i) => N[i] * ct + (d[i] - N[i] * c) / n), l = Math.hypot(v[0], v[1], v[2]);
    return v.map((x) => x / l);
  }

  // ── TSL builders. Called by tsl-lit.js inside its fragment Fn body only. ──
  function nodes(TSL, chunks) {
    const { If, float, vec2, vec3, vec4, floor, fract, dot, cross, mix, smoothstep, clamp, sqrt, abs, max, min,
      normalize, length, select, sin, cos, sign, atan, dFdx, dFdy, fwidth, modelWorldMatrix, attribute } = TSL;
    const hash21 = chunks && chunks.hash21;
    if (!modelWorldMatrix || !atan || !sign || !hash21) throw new Error("TLXCarSurf: TSL lacks modelWorldMatrix/atan/sign");
    const fadeN = (d, near, far) => clamp(d.sub(near).div(far - near).oneMinus(), 0.0, 1.0);
    const fpN = (px, size, lo, hi) => smoothstep(lo * size, hi * size, px).oneMinus();
    // Surface-gradient add on a var: N.assign(normalize(N - (g - N(N.g)) * k)).
    const perturbN = (Nv, g, k) => { Nv.assign(normalize(Nv.sub(g.sub(Nv.mul(dot(Nv, g))).mul(k)))); };

    function begin(o) {
      const { objP, Ngeo, N, V, sunDir, vd, classifiedCar } = o;
      // Top-level anchors: derivatives in uniform control flow, model axes once.
      const px = max(length(fwidth(objP)), 1e-5).toVar();
      const dNx = dFdx(Ngeo).toVar(), dNy = dFdy(Ngeo).toVar();
      const ax = normalize(modelWorldMatrix.mul(vec4(1.0, 0.0, 0.0, 0.0)).xyz).toVar();
      const ay = normalize(modelWorldMatrix.mul(vec4(0.0, 1.0, 0.0, 0.0)).xyz).toVar();
      const az = normalize(modelWorldMatrix.mul(vec4(0.0, 0.0, 1.0, 0.0)).xyz).toVar();
      const an = float(0.0).toVar();      // carbon anisotropy, set by weave()
      const ao = float(1.0).toVar();      // panel-line occlusion, applied to albedo by applyAO()
      // LOFT UVS (heroCar, js/car/car-geometry.js loftUv): the body lofts carry (developed station s, section arc
      // t from the top, -1) in metres on the trk vec3 every plain mesh already has (zero on everything else; the
      // road keys on trk.z > 0.5). Read once here, at the top level, with the other varyings.
      const luv = attribute ? vec3(attribute("trk", "vec3")).toVar() : null;
      const toW = (v) => ax.mul(v.x).add(ay.mul(v.y)).add(az.mul(v.z));
      const toO = (v) => vec3(dot(v, ax), dot(v, ay), dot(v, az));
      // 3. ROUNDED-EDGE CATCH on the geometric normal (and so on N, still equal to it here).
      const cone = sqrt(dot(dNx, dNx).add(dot(dNy, dNy))).toVar();
      const eF = fadeN(vd, K.edge.near, K.edge.far).mul(smoothstep(K.edge.lo, K.edge.hi, cone)).mul(K.edge.k).toVar();
      If(classifiedCar.and(eF.greaterThan(0.001)), () => {
        const Hs = normalize(V.add(sunDir).add(vec3(1e-5)));
        const t = Hs.sub(Ngeo.mul(dot(Ngeo, Hs))).toVar();
        const tl = max(length(t), 1e-6);
        const c = min(cone.mul(0.5), K.edge.cone).mul(eF);
        const nb = normalize(Ngeo.add(t.mul(min(tl, c).div(tl))));
        Ngeo.assign(nb); N.assign(nb);
      });
      return { K, px, ax, ay, az, an, ao, objP, vd, toW, toO, luv };
    }

    // Footprint fade of the existing twill (multiply its wvFade) and the anisotropy it carries.
    // 1a. the twill (a carbon fragment's wvFade var): footprint fade, then the anisotropy it carries.
    function weave(cs, wvFade) {
      wvFade.mulAssign(fpN(cs.px, K.weave.cell, K.weave.lo, K.weave.hi));
      cs.an.assign(wvFade.mul(K.weave.aniso));
    }
    function flakeAlbedoFade(cs) { return fpN(cs.px, K.flakeAlbedo.cell, K.flakeAlbedo.lo, K.flakeAlbedo.hi); }

    // 4 + 5: panel lines / fasteners (body paint draws) and tyre detail, before the Nsaa snapshot.
    function detail(cs, o) {
      const { N, Ngeo, paintLike, carFinish, rubber, sidewall, classifiedCar } = o;
      const objP = cs.objP, P = K.panel, T = K.tyre;
      // Coat normal takes part of the orange peel (the peel is ON the lacquer).
      If(paintLike.and(carFinish.greaterThan(0.5)), () => { Ngeo.assign(normalize(mix(Ngeo, N, K.coat.peel))); });
      const pF = fadeN(cs.vd, P.near, P.far).mul(fpN(cs.px, P.w, P.lo, P.hi)).toVar();
      If(classifiedCar.and(paintLike).and(carFinish.greaterThan(0.5)).and(pF.greaterThan(0.001)), () => {
        const ax_ = abs(objP.x), sx = select(objP.x.lessThan(0.0), float(-1.0), float(1.0));
        // nearest feature: distance d and its object-space gradient g
        const d = float(1e3).toVar(), g = vec3(0.0).toVar();
        // On a loft that carries loft UVs the seams follow the body: z is its developed station and the fastener
        // row runs along its section arc |t|; anywhere else (and on every non-hero car) the object-space form.
        const onLoft = cs.luv ? cs.luv.z.lessThan(-0.5) : null;
        const zS = onLoft ? select(onLoft, cs.luv.x, objP.z) : objP.z;
        const sObj = ax_.sub(objP.y).mul(0.70710678);
        const sRow = onLoft ? select(onLoft, abs(cs.luv.y), sObj) : sObj;
        for (const z of P.seamZ) {   // section seams: planes z = const
          const dz = zS.sub(z);
          If(abs(dz).lessThan(d), () => { d.assign(abs(dz)); g.assign(vec3(0.0, 0.0, sign(dz))); });
          // fastener row behind the seam, along s = (|x| - y)/sqrt2 (top to side around the section)
          const s = sRow;
          const us = fract(s.div(P.fastStep)).sub(0.5).mul(P.fastStep), uz = dz.sub(P.fastOff);
          const rho = max(length(vec2(us, uz)), 1e-6);
          const dr = abs(rho.sub(P.fastR));
          If(dr.lessThan(d), () => {
            d.assign(dr);
            const gs = vec3(sx, -1.0, 0.0).mul(0.70710678);
            g.assign(gs.mul(us).add(vec3(0.0, 0.0, uz)).div(rho).mul(sign(rho.sub(P.fastR))));
          });
        }
        // engine-cover seam: a segment in (|x|, z), upper surfaces only (y above the sidepod shoulder)
        {
          const pz = clamp(objP.z, P.coverZ1, P.coverZ0);
          const qx = ax_.sub(P.coverX), qz = objP.z.sub(pz);
          const dc = max(length(vec2(qx, qz)), 1e-6);
          If(dc.lessThan(d).and(objP.y.greaterThan(0.45)), () => {
            d.assign(dc); g.assign(vec3(qx.mul(sx), 0.0, qz).div(dc));
          });
        }
        const slope = select(d.lessThan(P.w), d.mul(2.0 / (P.w * P.w)), float(0.0));
        const dep = select(d.lessThan(P.w), d.div(P.w).mul(d.div(P.w)).oneMinus(), float(0.0));
        // groove h = -depth (1 - (d/w)^2): grad h = +slope * depth * grad d, and N - grad h tilts toward the centre
        const gw = cs.toW(g).mul(slope.mul(P.w * P.tilt).mul(pF));
        perturbN(N, gw, 1.0); perturbN(Ngeo, gw, 1.0);
        cs.ao.assign(dep.mul(P.ao).mul(pF).oneMinus());
      });
      // TYRES: cylindrical coords about the axle (+X). Wheel-local meshes sit at the origin; planted wheels in the
      // car mesh sit at the AXLES stations (car3d.js), told apart by |z|.
      const tF = fadeN(cs.vd, T.near, T.far).toVar();
      If(classifiedCar.and(rubber.or(sidewall)).and(tF.greaterThan(0.001)), () => {
        const inCar = abs(objP.z).greaterThan(0.9);
        const zC = select(inCar, select(objP.z.greaterThan(0.0), float(T.frontZ), float(T.rearZ)), float(0.0));
        const yC = select(inCar, float(T.wheelY), float(0.0));
        const xC = select(inCar, sign(objP.x).mul(select(objP.z.greaterThan(0.0), float(T.frontX), float(T.rearX))), float(0.0));
        const dy = objP.y.sub(yC), dz = objP.z.sub(zC), xa = objP.x.sub(xC);
        const r = max(length(vec2(dy, dz)), 1e-4).toVar();
        const er = vec3(0.0, dy.div(r), dz.div(r)).toVar();      // radial
        const et = vec3(0.0, dz.negate().div(r), dy.div(r)).toVar();  // circumferential
        const g = vec3(0.0).toVar();
        If(r.lessThan(T.tread), () => {
          // sidewall micro-ribs: concentric, period T.rib (footprint-faded)
          const fr = fpN(cs.px, T.rib, 0.35, 1.0);
          g.addAssign(er.mul(cos(r.mul(6.2831853 / T.rib)).mul(T.ribTilt).mul(fr)));
          // moulded segmented band (lettering-like dashes) between T.band radii: rounded-box SDF in (arc, radial)
          const th = atan(dz, dy);
          const seg = 6.2831853 / T.bandSeg, arc = r.mul(seg);
          const u = fract(th.div(seg)).sub(0.5).mul(arc), v = r.sub((T.band[0] + T.band[1]) * 0.5);
          const bx = arc.mul(0.34), by = (T.band[1] - T.band[0]) * 0.5, rr = 0.002;
          const qx = abs(u).sub(bx).add(rr), qy = abs(v).sub(by).add(rr);
          const sd = min(max(qx, qy), 0.0).add(length(vec2(max(qx, 0.0), max(qy, 0.0)))).sub(rr);
          // gradient of the box SDF (outside: along max(q,0); inside: the dominant axis), signed by the quadrant
          const out = vec2(max(qx, 0.0), max(qy, 0.0));
          const gq = select(sd.greaterThan(0.0), out.div(max(length(out), 1e-6)),
            select(qx.greaterThan(qy), vec2(1.0, 0.0), vec2(0.0, 1.0)));
          const gu = gq.x.mul(sign(u)), gv = gq.y.mul(sign(v));
          const ramp = smoothstep(0.0, T.bandEdge, abs(sd)).oneMinus().mul(fpN(cs.px, T.bandEdge * 4.0, 0.35, 1.0));
          // raised dash: height rises inward (sd < 0), so grad h = -grad sd on the ramp
          g.addAssign(et.mul(gu).add(er.mul(gv)).mul(ramp).mul(-T.bandTilt));
        }).Else(() => {
          // tread: slicks have no tread blocks; shoulder graining ridges across the rolling direction only
          const sh = smoothstep(T.shoulder, 1.0, abs(xa).div(0.17)).toVar();
          const fg = fpN(cs.px, T.grain, 0.35, 1.0);
          const sArc = atan(dz, dy).mul(T.R);
          g.addAssign(et.mul(cos(sArc.mul(6.2831853 / T.grain).add(sin(xa.mul(90.0)).mul(1.7))).mul(T.grainTilt).mul(sh).mul(fg)));
        });
        perturbN(N, cs.toW(g).mul(tF), 1.0);
      });
    }

    function applyAO(cs, albedo) { albedo.mulAssign(cs.ao); }

    // 1. ANISOTROPIC sun lobe on carbon: returns D*Vis (isotropic DV where an == 0, exactly the same value).
    function anisoSun(cs, o) {
      const { DV, N, V, L, H, NoV, NoL, a } = o;
      const out = DV.toVar();
      If(cs.an.greaterThan(0.001), () => {   // an > 0 only on carbon fragments (weave())
        // tow direction from the twill cell: one set along object X, the other along object Z (wv = 190(x+y), 190(z+y))
        const wv = cs.objP.xz.mul(190.0).add(cs.objP.y.mul(190.0));
        const along = select(sin(wv.x).mul(sin(wv.y)).greaterThanEqual(0.0), cs.ax, cs.az);
        const tt = along.sub(N.mul(dot(N, along))).toVar();
        const ok = length(tt).greaterThan(1e-3);
        const t = normalize(tt.add(vec3(1e-6))), b = cross(N, t);
        const s = clamp(cs.an, 0.0, 1.0).mul(select(ok, float(1.0), float(0.0)));
        const at = a.mul(sqrt(float(2.0).div(s.oneMinus().mul(s.oneMinus()).add(1.0)))).toVar();
        const ab = s.oneMinus().mul(at).toVar();
        const ToH = dot(t, H), BoH = dot(b, H), NoH = max(dot(N, H), 0.0);
        const a2 = at.mul(ab);
        const vx = vec3(ab.mul(ToH), at.mul(BoH), a2.mul(NoH));
        const w2 = a2.div(max(dot(vx, vx), 1e-7));
        const D = a2.mul(w2).mul(w2).mul(1.0 / Math.PI);
        const ToV = dot(t, V), BoV = dot(b, V), ToL = dot(t, L), BoL = dot(b, L);
        const lv = NoL.mul(length(vec3(at.mul(ToV), ab.mul(BoV), NoV)));
        const ll = NoV.mul(length(vec3(at.mul(ToL), ab.mul(BoL), NoL)));
        const Vis = min(float(0.5).div(max(lv.add(ll), 1e-5)), 65504.0);
        out.assign(D.mul(Vis));
      });
      return out;
    }

    // 2. FLAKE SPARKLE under the coat (replaces the sparkle add when carSurf is on).
    function sparkleAdd(cs, o, spFade) {
      const { color, Ngeo, V, L, sunColor, litNoL, carSparkle, carPaint } = o;
      const F = K.flake;
      const n = normalize(Ngeo).toVar();
      // refract V and L into the lacquer (outward directions), coat transmission on both legs
      const refr = (d) => {
        const c = clamp(dot(n, d), 0.0, 1.0);
        const ct = sqrt(c.mul(c).oneMinus().div(F.ior * F.ior).oneMinus());
        return normalize(n.mul(ct).add(d.sub(n.mul(c)).div(F.ior)));
      };
      const Vt = refr(V), Lt = refr(L), Ht = normalize(Vt.add(Lt)).toVar();
      const fr = (c) => { const m = clamp(c, 0.0, 1.0).oneMinus(); const m2 = m.mul(m); return float(F.f0).add(m2.mul(m2).mul(m).mul(1.0 - F.f0)); };
      const trans = fr(dot(n, V)).oneMinus().mul(fr(dot(n, L)).oneMinus());
      // per-flake normal: hashed in object space, tilted in the panel's own (object-space) frame
      const cell = floor(cs.objP.mul(F.freq)).toVar();
      const h = vec3(hash21(cell.xy.add(cell.z.mul(19.7))), hash21(cell.yz.add(cell.x.mul(7.3))),
        hash21(cell.zx.add(cell.y.mul(3.1)))).mul(2.0).sub(1.0);
      const no = cs.toO(n);
      const ht = h.sub(no.mul(dot(no, h)));
      const gN = normalize(cs.toW(normalize(no.add(ht.mul(F.tilt)))));
      // footprint LOD: width grows with (flakes per pixel)^2, gain falls by the same ratio; beyond ~4 flakes per
      // pixel the expected value (w0/tilt^2 inside the tilt cone around the coat normal) replaces the cell glint
      const cpp = cs.px.mul(F.freq);
      const w = max(cpp.mul(cpp), 1.0).mul(F.w0);
      const gain = float(F.w0).div(w);
      const glint = smoothstep(w.oneMinus(), 1.0, dot(gN, Ht)).mul(gain);
      const nh = clamp(dot(n, Ht), 0.0, 1.0);
      const coneAng = sqrt(max(nh.mul(nh).oneMinus(), 0.0));
      const mean = smoothstep(F.tilt * 0.7, F.tilt, coneAng).oneMinus().mul(F.w0 / (F.tilt * F.tilt));
      const sp = mix(glint, mean, smoothstep(1.0, 4.0, cpp));
      color.addAssign(vec3(sunColor).mul(litNoL).mul(sp).mul(trans).mul(carSparkle).mul(carPaint).mul(spFade));
    }
    function sparkle(cs, o) {
      const { litNoL, carSparkle, carPaint, sparkleU, albedo } = o;
      If(carPaint.greaterThan(0.001).and(litNoL.greaterThan(0.0)).and(sparkleU.greaterThan(0.001))
        .and(carSparkle.notEqual(0.0)), () => {
        // the lit program's near (cockpit confetti) and dark-paint gates; the far fade is the footprint LOD below
        const spFade = smoothstep(1.5, 4.0, cs.vd).mul(sparkleU)
          .mul(smoothstep(0.06, 0.22, max(albedo.r, max(albedo.g, albedo.b)))).mul(fadeN(cs.vd, K.flake.near, K.flake.far)).toVar();
        If(spFade.greaterThan(0.01), () => { sparkleAdd(cs, o, spFade); });
      });
    }

    return { begin, weave, flakeAlbedoFade, detail, applyAO, anisoSun, sparkle };
  }

  // The seam gate tsl-lit.js reads once per factory (never throws).
  function enabled() {
    try { return typeof GfxQuality !== "undefined" && !!GfxQuality.feature("carSurf"); } catch (_) { return false; }
  }

  return {
    K, enabled, nodes,
    math: { fade, footprintFade, anisoAlphas, saaAlpha2, sdSegment, sdRoundBox, sdAnnulus, groove, grooveSlope,
      perturb, edgeBend, flakeLod, refractOut },
  };
})();
Object.freeze(TLXCarSurf);
