/* Apex 26 — GradeTint: car-paint bases, the tuner scratch, and sky grade hue/sat.
   Moved out of game.js (#1654). carPaint reuses one scratch; gfx.draw reads it
   synchronously, so one object is still safe across every car in the frame. */
const GradeTint = (function () {
  "use strict";

  const PAINT_WET_NIGHT = { emissive: 0.20, roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };
  const PAINT_WET_DAY   = { roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 0.8, carPaint: 1.0 };
  const PAINT_DRY_NIGHT = { emissive: 0.20, roughness: 0.22, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };
  const PAINT_DRY_DAY   = { roughness: 0.22, metalness: 0.12, specular: 0.85, clearcoat: 0.9, carPaint: 1.0 };
  const _carPaintScratch = {};

  function carPaint(base, LT) {
    const m = _carPaintScratch;
    m.roughness = M4.clamp((base.roughness != null ? base.roughness : 0.4) / LT.carGloss, 0.02, 1);
    m.metalness = M4.clamp((base.metalness || 0) * LT.carMetal, 0, 1);
    m.specular  = (base.specular  || 0) * LT.carSpecular;
    m.clearcoat = (base.clearcoat || 0) * LT.carClearcoat;
    m.emissive  = (base.emissive  || 0) * LT.carGlow;
    m.carPaint  = base.carPaint != null ? base.carPaint : 0;
    m.sparkle   = base.sparkle  != null ? base.sparkle  : 1;
    m.doubleSided = true;
    return m;
  }

  function hue(rgb, deg) {
    if (!deg || !rgb) return rgb;
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const m = rgb[0] * 0.213 + rgb[1] * 0.715 + rgb[2] * 0.072;
    const r = rgb[0] - m, g = rgb[1] - m, b = rgb[2] - m;
    return [
      m + (r * (0.213 + c * 0.787 - s * 0.213) + g * (0.715 - c * 0.715 - s * 0.715) + b * (0.072 - c * 0.072 + s * 0.928)),
      m + (r * (0.213 - c * 0.213 + s * 0.143) + g * (0.715 + c * 0.285 + s * 0.140) + b * (0.072 - c * 0.072 - s * 0.283)),
      m + (r * (0.213 - c * 0.213 - s * 0.787) + g * (0.715 - c * 0.715 + s * 0.715) + b * (0.072 + c * 0.928 + s * 0.072)),
    ];
  }

  function sat(rgb, amt) {
    if (!rgb || amt === 1) return rgb;
    const m = rgb[0] * 0.213 + rgb[1] * 0.715 + rgb[2] * 0.072;
    return [Math.max(0, m + (rgb[0] - m) * amt),
            Math.max(0, m + (rgb[1] - m) * amt),
            Math.max(0, m + (rgb[2] - m) * amt)];
  }

  return { PAINT_WET_NIGHT, PAINT_WET_DAY, PAINT_DRY_NIGHT, PAINT_DRY_DAY, carPaint, hue, sat };
})();
Object.freeze(GradeTint);
