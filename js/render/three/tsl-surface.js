/* Apex 26 — TLXSurface: close-up road surfaces for the TLX lit program (#6509 items 1 + 2; GfxQuality features
 * `closeLayers` and `wearMask`, FEATURES level 2: desktop EXTREME). LAZY_GFX_HI (tools/manifest.cjs): a phone, ULTRA
 * and below never load it. tsl-lit.js calls nodes() ONCE at factory time when tlx.js passed either flag; absent (or
 * both flags off) no node is created and the lit program is today's, byte for byte (tests/unit/tlx-mat-detail.test.mjs).
 *
 * closeLayers (0 B on the wire, procedural):
 *   kerb ribbon (trk hw 0): paint chips, denser toward the inner lip, and tyre rubber on the lip in corners;
 *   tarmac aggregate: grain and sparse bright chips, gone once a pixel spans ~3 cm;
 *   line paint: worn spots where the tarmac shows through roadMarkings' paint, close range only.
 * wearMask: the rubbered-in racing line (~1.1 m sigma, darker, a little glossier), braking-zone streaks, marbles
 *   2.5-4.5 m off line in corners. One level-0 tap per road / kerb pixel of the wear strip below.
 *
 * The WEAR STRIP (wearMask(track)): the lap as 2048 RGBA8 texels along s. R = the racing line's lateral offset,
 * (x + 16) / 32; G = rubber, 0.55 on a straight rising to 1 in a corner window (lineW); B = braking, ramping up to
 * each corner's turn-in over a zone that lengthens with its curvature, held to the apex; A = road half-width / 20.
 * A circuit opts in with `surfaceDetail: true` in its def (js/circuits/monza.js is the pilot); tracks.js hands the
 * built track to gfx.setTrackWear, and a circuit without the flag hands null (surfOn 0: today's pixels).
 * RENDER-ONLY: a texture read in the fragment shader; nothing here reaches grip (AGENTS.md §Physics).
 * Every term scales by matTexMix, so __apex.matTex(0) is the A/B on the same build. GLX and WGX have no
 * setTrackWear: they draw today's road. */
const TLXSurface = (function () {
  "use strict";
  const W = 2048;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
  const wrap = (L, s) => { s %= L; return s < 0 ? s + L : s; };

  function wearMask(track) {
    const n = track && track.n, L = track && track.total, ln = track && track.line;
    if (!ln || !(n > 0) || !(L > 0)) return null;
    const out = new Uint8Array(W * 4), brake = new Float32Array(W);
    for (const c of track.lineCorners || []) {
      const sev = clamp(Math.abs(c.k) * 25, 0, 1), len = 40 + 120 * sev, run = wrap(L, c.sApex - c.s0) + len;
      for (let d = 0; d <= run; d += L / W) {
        const j = Math.floor(wrap(L, c.s0 - len + d) / L * W) % W, v = sev * (d < len ? d / len : 1);
        if (v > brake[j]) brake[j] = v;
      }
    }
    const b8 = (v) => Math.round(clamp(v, 0, 1) * 255);
    for (let j = 0; j < W; j++) {
      const fi = (j + 0.5) / W * n, i = Math.floor(fi) % n, k = (i + 1) % n, f = fi - Math.floor(fi);
      out[j * 4] = b8((lerp(ln[i], ln[k], f) + 16) / 32);
      out[j * 4 + 1] = b8(0.55 + 0.45 * lerp(track.lineW[i], track.lineW[k], f));
      out[j * 4 + 2] = b8(brake[j]);
      out[j * 4 + 3] = b8(lerp(track.hw[i], track.hw[k], f) / 20);
    }
    return { data: out, width: W, length: L };
  }

  // flags: { closeLayers, wearMask }; texGroup: tsl-lit's shared-group wrapper; chunks: { hash21, vnoise }.
  function nodes(THREE, TSL, flags, texGroup, chunks) {
    const { If, uniform, texture, float, vec2, vec3, floor, abs, max, mix, clamp: cl, smoothstep, step, exp, dot, fwidth } = TSL;
    const { hash21, vnoise } = chunks;
    const down = (hi, lo, x) => smoothstep(lo, hi, x).oneMinus();
    const tex = new THREE.DataTexture(new Uint8Array(W * 4), W, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
    const node = texGroup(texture(tex));
    const uniforms = { surfOn: uniform(0.0), surfLen: uniform(1.0) };

    // A built track (or a ready strip, for tests), or null for a circuit without surfaceDetail.
    function setTrackWear(track) {
      const m = track && track.data ? track : track && track.def && track.def.surfaceDetail ? wearMask(track) : null;
      if (!m || m.width !== W || !m.data || m.data.length !== W * 4) { uniforms.surfOn.value = 0; return false; }
      tex.image.data.set(m.data); tex.needsUpdate = true;
      uniforms.surfLen.value = m.length; uniforms.surfOn.value = 1;
      return true;
    }
    // Top level of the Fn body (uniform control flow): the footprint the fades read.
    const begin = (trkA) => ({ trkA, pix: max(fwidth(trkA.xy), vec2(1e-4)).toVar() });

    function apply(sf, { albedo, rough, matA, wp, k }) {
      If(uniforms.surfOn.greaterThan(0.5), () => {
        const t = sf.trkA, s = t.x, x = t.y, hw = t.z, fp = max(sf.pix.x, sf.pix.y);
        const wm = node.sample(vec2(s.div(uniforms.surfLen), 0.5)).level(0).toVar();
        const terr = floor(matA.add(0.5)).toVar();
        const corner = cl(wm.y.sub(0.55).mul(2.2), 0.0, 1.0).toVar();
        If(terr.equal(16.0).and(hw.greaterThan(0.5)).and(abs(x).lessThan(hw)), () => {
          if (flags.wearMask) {
            const d = abs(x.sub(wm.x.mul(32.0).sub(16.0))).toVar();
            const brk = wm.z.mul(exp(d.mul(d).mul(-1.4))).mul(vnoise(vec2(s.mul(0.04), x.mul(2.5))).mul(0.8).add(0.4));
            const rub = cl(exp(d.mul(d).mul(-0.8)).mul(wm.y).mul(0.75).add(brk.mul(0.6)), 0.0, 1.0).mul(k).toVar();
            albedo.mulAssign(float(1.0).sub(rub.mul(0.24)));
            rough.assign(mix(rough, rough.mul(0.78), rub));
            const marb = smoothstep(2.2, 3.2, d).mul(down(5.0, 3.8, d)).mul(corner);
            const grit = smoothstep(0.5, 0.8, vnoise(wp.xz.mul(3.1))).mul(marb).mul(k).toVar();
            albedo.assign(mix(albedo, vec3(0.06, 0.055, 0.05), grit.mul(0.35)));
            rough.assign(mix(rough, float(0.95), grit));
          }
          if (flags.closeLayers) {
            const near = down(0.03, 0.006, fp).mul(k).toVar();
            const chip = step(0.955, hash21(floor(wp.xz.mul(42.0)))).mul(near).toVar();
            albedo.mulAssign(vnoise(wp.xz.mul(19.0)).sub(0.5).mul(near).mul(0.16).add(1.0));
            albedo.addAssign(vec3(chip.mul(0.07)));
            rough.assign(mix(rough, float(0.32), chip.mul(0.7)));
          }
        });
        if (flags.closeLayers) {
          If(terr.equal(0.0).and(hw.equal(0.0)).and(abs(x).greaterThan(2.0)), () => {
            const lip = max(abs(x).sub(wm.w.mul(20.0)), 0.0).toVar();
            const chips = smoothstep(0.62, 0.70, vnoise(vec2(s.mul(3.2), x.mul(7.0))))
              .mul(down(1.4, 0.0, lip).mul(0.6).add(0.4)).mul(down(0.65, 0.15, fp)).mul(k).toVar();
            albedo.assign(mix(albedo, vec3(0.42, 0.41, 0.39), chips.mul(0.8)));
            const rubK = down(0.9, 0.0, lip).mul(corner).mul(vnoise(vec2(s.mul(0.6), lip.mul(3.0))).mul(0.7).add(0.3)).mul(k).toVar();
            albedo.assign(mix(albedo, vec3(0.05, 0.05, 0.05), rubK.mul(0.55)));
            rough.assign(mix(rough, float(0.85), max(chips, rubK.mul(0.5))));
          });
        }
      });
      // closeLayers: the albedo before roadMarkings, for paint() to find the paint by.
      if (!flags.closeLayers) return null;
      const pre = vec3(0.0).toVar();
      pre.assign(albedo);
      return pre;
    }
    // After roadMarkings: where it lifted the albedo is paint; let the tarmac show through, close range only.
    function paint(sf, pre, { albedo, wp, k }) {
      if (!pre) return;
      If(uniforms.surfOn.greaterThan(0.5), () => {
        const lift = cl(dot(albedo.sub(pre), vec3(0.333)).mul(3.0), 0.0, 1.0);
        const worn = smoothstep(0.45, 0.8, vnoise(wp.xz.mul(9.0))).mul(lift).mul(down(0.05, 0.01, max(sf.pix.x, sf.pix.y))).mul(k);
        albedo.assign(mix(albedo, pre, worn.mul(0.45)));
      });
    }
    return { uniforms, setTrackWear, begin, apply, paint };
  }

  return { W, wearMask, nodes };
})();
if (typeof window !== "undefined") window.TLXSurface = TLXSurface;
