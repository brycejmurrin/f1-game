/* Apex 26 — stable renderer handle and the device tier required at script evaluation.
   The WebGL2 implementation is loaded only when selected or needed as fallback. */
"use strict";

var GLX = (typeof window !== "undefined" && window.GLX) || (function () {
  let forceMobile = false, gfxHigh = false;
  try {
    forceMobile = localStorage.getItem("apex26.forceMobileTier") === "1";
    gfxHigh = localStorage.getItem("apex26.gfxHigh") === "1";
  } catch (_) { /* storage may be blocked */ }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const touch = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
  const isMobile = forceMobile || /iPhone|iPad|iPod|Android/i.test(ua) ||
    (touch > 1 && /Mac/.test(ua));
  return {
    isMobile,
    mobileTier: isMobile && !gfxHigh,
    // Install by descriptors: getters (width/height/aspect) stay live, and the
    // object read by eval-time consumers stays the same throughout boot.
    install(backend) {
      Object.defineProperties(this, Object.getOwnPropertyDescriptors(backend));
      return this;
    },
  };
})();
