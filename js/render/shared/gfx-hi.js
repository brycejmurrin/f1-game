/* Apex 26 — GfxHi: the desktop EXTREME / CINEMA render and perf extras (GfxQuality.detail() >= 2). LAZY_GFX_HI
 * (tools/manifest.cjs): RendererBoot.start fetches it beside the backend only on that tier, so a phone and ULTRA
 * and below never load it; every eager seam that reads it keeps the ULTRA path while it is absent. */
const GfxHi = (function () {
  "use strict";
  return {};
})();
if (typeof window !== "undefined") window.GfxHi = GfxHi;
