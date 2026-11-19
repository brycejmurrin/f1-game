const SceneryLandforms = (function () {
  "use strict";

  function create(ctx) {
    const { out, MAT, addPyramid, addFrustum, addMountain, addPrism, onTrack, hash } = ctx;
    const ROAD_SKIRT = 2.6;
    const peak = (x, z, baseY, w, h, col) => {
      if (onTrack(x, z, w * 1.061 + ROAD_SKIRT)) {
        ctx.noteSuppressed("peak", `peak SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      ctx.note("peak", [x, baseY + h / 2, z], [w, h, w]);
      out._mat = MAT.ROCK;
      addPyramid(out, [x, baseY, z], [w, h, w], col, null);
      addPyramid(out, [x, baseY - 2, z], [w * 1.5, h * 0.45, w * 1.5], [col[0] * 0.9, col[1] * 0.92, col[2] * 0.9], null);
      const pj = hash(x * 0.17 + z * 0.19), pa = pj * 6.2832, so = w * (0.25 + pj * 0.13);
      addPyramid(out, [x + Math.cos(pa) * so, baseY - 0.6, z + Math.sin(pa) * so],
        [w * 0.6, h * (0.5 + pj * 0.25), w * 0.72], [col[0] * 0.94, col[1] * 0.95, col[2] * 0.96], null);
      out._mat = 0;
    };
    const mountain = (x, z, baseY, w, h, opts) => {
      opts = opts || {};
      const rough = opts.rough != null ? opts.rough : 0.34;
      const reach = (ww) =>
        ROAD_SKIRT +
        Math.max(ww * 0.62, ww * 0.5 * (1 + 0.7 * rough) * (1 + 0.35 * rough));
      let fit = w;
      for (let i = 0; i < 6 && onTrack(x, z, reach(fit)); i++) fit *= 0.88;
      if (onTrack(x, z, reach(fit))) {
        ctx.noteSuppressed("mountain", `mountain SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      if (fit < w) h *= Math.sqrt(fit / w);
      w = fit;
      ctx.note("mountain", [x, baseY + h / 2, z], [w, h, w]);
      addFrustum(out, [x, baseY - 2, z], w * 0.62, w * 0.42, h * 0.18,
                 opts.forest || [0.20, 0.34, 0.20], 9, null);
      addMountain(out, [x, baseY, z], w * 0.5, h, opts);
    };
    const ridge = (x, z, baseY, ang, len, w, h, col, opts) => {
      const hill = opts && opts.profile;
      if (onTrack(x, z, Math.max(len, w) * 0.5 * (hill ? 1.3 : 1) + ROAD_SKIRT)) {
        ctx.noteSuppressed("ridge", `ridge SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: len=${len} w=${w}`);
        return;
      }
      ctx.note("ridge", [x, baseY + h / 2, z], [w, h, len]);
      const f = [Math.cos(ang), 0, Math.sin(ang)], r = [-f[2], 0, f[0]];
      const SINK = 2;
      if (hill) {
        addMountain(out, [x, baseY - SINK, z], w * 0.5, h + SINK, {
          profile: opts.profile, stretch: len / w, right: r, fwd: f, seed: Math.round(x * 0.37 + z * 0.29),
          rough: opts.rough != null ? opts.rough : 0.22, crest: opts.crest != null ? opts.crest : 0.35,
          forest: col, rock: col, snow: col, snowline: 9 });
        return;
      }
      addPrism(out, [x, baseY - SINK, z], [w, h + SINK, len], col, [r, [0, 1, 0], f]);
      const jr = hash(x * 0.13 + z * 0.11 + ang);
      const a2 = ang + (jr - 0.5) * 0.6;
      const f2 = [Math.cos(a2), 0, Math.sin(a2)], r2 = [-f2[2], 0, f2[0]];
      const off = (0.06 + jr * 0.06) * len, dY = 1.0;
      addPrism(out,
        [x + f[0] * off, baseY - SINK - dY, z + f[2] * off],
        [w * 0.7, h * (0.42 + jr * 0.22) + SINK + dY, len * 0.4],
        col, [r2, [0, 1, 0], f2]);
    };
    return { peak, mountain, ridge };
  }

  return { create };
})();
Object.freeze(SceneryLandforms);
