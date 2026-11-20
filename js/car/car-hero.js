/* Apex 26 — CarHero: the desktop EXTREME car detail (GfxQuality feature "heroCar" and the detail-2 tessellation).
 * LAZY_GFX_HI (tools/manifest.cjs): RendererBoot.start fetches it beside the backend only when
 * GfxQuality.detail() >= 2, so a phone and ULTRA and below never load it; CarGeometry / Car3D keep today's mesh
 * while it is absent. */
const CarHero = (function () {
  "use strict";
  return {};
})();
if (typeof window !== "undefined") window.CarHero = CarHero;
