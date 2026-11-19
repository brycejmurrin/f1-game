"use strict";

(function () {
  function chunks(THREE, TSL) {
    const { Fn, float, vec2, vec3, fract, floor, dot, mix } = TSL;

    const hash21 = Fn(([p2]) => {
      const p = fract(p2.mul(vec2(123.34, 456.21))).toVar();
      p.addAssign(dot(p, p.add(45.32)));
      return fract(p.x.mul(p.y));
    }).setLayout({ name: "apexHash21", type: "float", inputs: [{ name: "p2", type: "vec2" }] });

    const vnoise = Fn(([pIn]) => {
      const i = floor(pIn);
      const f = fract(pIn).toVar();
      f.assign(f.mul(f).mul(f.mul(-2.0).add(3.0)));
      const a = hash21(i);
      const b = hash21(i.add(vec2(1, 0)));
      const c = hash21(i.add(vec2(0, 1)));
      const d = hash21(i.add(vec2(1, 1)));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }).setLayout({ name: "apexVnoise", type: "float", inputs: [{ name: "pIn", type: "vec2" }] });

    const vnoiseGrad = Fn(([pIn]) => {
      const i = floor(pIn);
      const f = fract(pIn).toVar();
      const u = f.mul(f).mul(f.mul(-2.0).add(3.0)).toVar();
      const du = f.mul(f.oneMinus()).mul(6.0).toVar();
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
