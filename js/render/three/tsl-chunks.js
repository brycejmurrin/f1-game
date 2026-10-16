/* Apex 26 — TLXShaders.chunks: shared TSL leaves for the three.js backend.
 * The TSL sibling of js/render/glx/shaders/glsl-chunks.js (GLXChunks):
 * hash21/vnoise/vnoiseGrad/ignoise, each with a setLayout (load-bearing — see below). */
"use strict";

(function () {
  function chunks(THREE, TSL) {
    const { Fn, float, vec2, vec3, fract, floor, dot, mix } = TSL;

    // LAYOUTS ARE LOAD-BEARING, NOT STYLE. An unlayouted TSL Fn is inlined at
    // every call: the lit graph calls vnoise ~50 times, so three declared 1,597
    // node variables for one fragment (1,256 of them the floor/fract pairs
    // below). r185 emits those as module-scope var<private> and WebKit caps
    // that space at 8,192 bytes per module — every lit pipeline was refused on
    // an iPhone and only the sky drew. Dawn never checks
    // the sum, so no Chromium run can see it. With a layout each helper
    // compiles once as a real function (vendor PATCHES.md §4 moves the rest to
    // function scope), which also keeps the ANGLE-Metal first-frame compile short.
    const hash21 = Fn(([p2]) => {
      const p = fract(p2.mul(vec2(123.34, 456.21))).toVar();
      p.addAssign(dot(p, p.add(45.32)));
      return fract(p.x.mul(p.y));
    }).setLayout({ name: "apexHash21", type: "float", inputs: [{ name: "p2", type: "vec2" }] });

    const vnoise = Fn(([pIn]) => {
      const i = floor(pIn);
      const f = fract(pIn).toVar();
      f.assign(f.mul(f).mul(f.mul(-2.0).add(3.0)));   // f*f*(3-2f)
      const a = hash21(i);
      const b = hash21(i.add(vec2(1, 0)));
      const c = hash21(i.add(vec2(0, 1)));
      const d = hash21(i.add(vec2(1, 1)));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }).setLayout({ name: "apexVnoise", type: "float", inputs: [{ name: "pIn", type: "vec2" }] });

    // vnoise plus its ANALYTIC gradient from the same 4 hashes: (value, d/dx,
    // d/dy) in lattice units. tsl-lit's road/terrain micro-normal used three
    // vnoise per octave for a finite difference; one of these replaces them.
    const vnoiseGrad = Fn(([pIn]) => {
      const i = floor(pIn);
      const f = fract(pIn).toVar();
      const u = f.mul(f).mul(f.mul(-2.0).add(3.0)).toVar();   // f*f*(3-2f), as vnoise
      const du = f.mul(f.oneMinus()).mul(6.0).toVar();          // its derivative
      const a = hash21(i).toVar();
      const b = hash21(i.add(vec2(1, 0))).toVar();
      const c = hash21(i.add(vec2(0, 1))).toVar();
      const d = hash21(i.add(vec2(1, 1))).toVar();
      const k = a.sub(b).sub(c).add(d).toVar();
      return vec3(mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
        du.x.mul(b.sub(a).add(k.mul(u.y))), du.y.mul(c.sub(a).add(k.mul(u.x))));
    }).setLayout({ name: "apexVnoiseGrad", type: "vec3", inputs: [{ name: "pIn", type: "vec2" }] });

    const ignoise = Fn(([p]) => {
      return fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));
    }).setLayout({ name: "apexIgnoise", type: "float", inputs: [{ name: "p", type: "vec2" }] });

    return { hash21, vnoise, vnoiseGrad, ignoise };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { chunks });
})();
