/* Apex 26 — TLXShaders.chunks: shared TSL leaves for the three.js backend. The TSL sibling of js/render/glx/shaders/glsl-chunks.js (GLXChunks) — the SURFACE- family noise … */
"use strict";

(function () {
  function chunks(THREE, TSL) {
    const { Fn, float, vec2, fract, floor, dot, mix } = TSL;

    // LAYOUTS ARE LOAD-BEARING, NOT STYLE. A TSL Fn without setLayout is
    // INLINED at every call: the lit graph calls vnoise ~50 times across its
    // material families and each copy brings its own temporaries, so three's
    // WGSL builder declared 1,597 node variables for one fragment shader —
    // 1,256 of them the vec2 floor/fract pairs below (12.4 KB by natural
    // size). r185 emits node variables as module-scope var<private>, and
    // WebKit caps the private address space at 8,192 bytes per module:
    // "Render pipeline creation failed (…MeshBasicNodeMaterial_41): The
    // combined byte size of all variables in the private address space
    // exceeds 8192 bytes" — every lit pipeline refused on the iPhone, the
    // small sky pipeline survived, and only the sky drew (2026-09-03, the
    // owner's phone, first evidence after the uncapturederror listener fix).
    // Dawn never checks the sum, so no Chromium run could see it. With a
    // layout each helper compiles ONCE as a real WGSL/GLSL function and a
    // call is a call. vendor PATCHES.md §4 moves the remaining variables
    // to function scope; this keeps the shader small enough to compile
    // fast on ANGLE-Metal as well (the 16 s first frame in the census).
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

    const ignoise = Fn(([p]) => {
      return fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));
    }).setLayout({ name: "apexIgnoise", type: "float", inputs: [{ name: "p", type: "vec2" }] });

    return { hash21, vnoise, ignoise };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { chunks });
})();
