/* Apex 26 — TLXShaders.chunks: shared TSL leaves for the three.js backend.
 *
 * The TSL sibling of js/render/shaders/chunks.js (GLXChunks) — the SURFACE-
 * family noise (hash21 + vnoise, the 123.34/456.21/45.32 constant set every
 * procedural material is welded to; NOT the sky family's 127.1/311.7/34.5)
 * plus the Jimenez interleaved-gradient noise used for shadow dither (M4).
 * Chunk names match the GLSL side (hash21/vnoise/ignoise) so a change to the
 * shared math stays "edit two small leaves".
 *
 * SHAPE CONTRACT (see tlx.js header): this file publishes a FACTORY,
 *     TLXShaders.chunks = (THREE, TSL) => ({ hash21, vnoise, ignoise })
 * and must NEVER touch THREE/TSL at script eval — the vendored three build is
 * an ES module reached by a dynamic import() inside TLX.create(); at classic-
 * script eval time it does not exist. The factory runs inside create() with
 * the resolved modules.
 *
 * The returned members are TSL Fn nodes: shareable across every material the
 * lit factory builds (Fn instances are stateless descriptors — each material
 * build instantiates them into its own program; the emitted GLSL/WGSL function
 * is deduplicated per shader).
 */
"use strict";

(function () {
  function chunks(THREE, TSL) {
    const { Fn, float, vec2, fract, floor, dot, mix } = TSL;

    // ── hash21: surface-family value hash (GLXChunks.surfaceNoise hash21) ──
    // fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); fract(p.x*p.y)
    const hash21 = Fn(([p2]) => {
      const p = fract(p2.mul(vec2(123.34, 456.21))).toVar();
      p.addAssign(dot(p, p.add(45.32)));
      return fract(p.x.mul(p.y));
    });

    // ── vnoise: surface-family value noise over hash21 (bilinear, smooth-
    //    stepped f*f*(3-2f) fade — identical to the GLSL leaf) ──
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

    // ── ignoise: interleaved-gradient noise (Jimenez) — texel-grid shadow
    //    dither / ray-march start jitter. Consumed from M4 (sun-shadow PCF
    //    rotation); published now so the chunk set matches GLXChunks. ──
    const ignoise = Fn(([p]) => {
      return fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));
    });

    return { hash21, vnoise, ignoise };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { chunks });
})();
