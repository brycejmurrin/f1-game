/* Apex 26 — TLXShaders.chunks: shared TSL leaves for the three.js backend. The TSL sibling of js/render/shaders/chunks.js (GLXChunks) — the SURFACE- family noise … */
"use strict";

(function () {
  function chunks(THREE, TSL) {
    const { Fn, float, vec2, fract, floor, dot, mix } = TSL;

    const hash21 = Fn(([p2]) => {
      const p = fract(p2.mul(vec2(123.34, 456.21))).toVar();
      p.addAssign(dot(p, p.add(45.32)));
      return fract(p.x.mul(p.y));
    });

    const vnoise = Fn(([pIn]) => {
      const i = floor(pIn);
      const f = fract(pIn).toVar();
      f.assign(f.mul(f).mul(f.mul(-2.0).add(3.0)));   // f*f*(3-2f)
      const a = hash21(i);
      const b = hash21(i.add(vec2(1, 0)));
      const c = hash21(i.add(vec2(0, 1)));
      const d = hash21(i.add(vec2(1, 1)));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    });

    const ignoise = Fn(([p]) => {
      return fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));
    });

    return { hash21, vnoise, ignoise };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { chunks });
})();
