/* Apex 26 — stable renderer handle and the device tier required at script evaluation.
   The WebGL2 implementation is loaded only when selected or needed as fallback. */
"use strict";

var GLX = (typeof window !== "undefined" && window.GLX) || (function () {
  let forceMobile = false;
  try {
    forceMobile = localStorage.getItem("apex26.forceMobileTier") === "1";
  } catch (_) { /* storage may be blocked */ }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const touch = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
  const isMobile = forceMobile || /iPhone|iPad|iPod|Android/i.test(ua) ||
    (touch > 1 && /Mac/.test(ua));
  // WebKit engine (every iOS browser, Mac Safari): the one UA sniff TLX and
  // GLX post read (#7434). wgx.js keeps its own copy (frozen, D-049).
  const isWebKit = /CriOS|FxiOS|EdgiOS/.test(ua) ||
    (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua));
  return {
    isMobile,
    isWebKit,
    // The phone preset ceiling is HIGH, whose memory tier is always mobile.
    // Do not let an imported legacy ULTRA bit escape that cap for one boot.
    mobileTier: isMobile,
    // Install by descriptors: getters (width/height/aspect) stay live, and the
    // object read by eval-time consumers stays the same throughout boot.
    install(backend) {
      Object.defineProperties(this, Object.getOwnPropertyDescriptors(backend));
      return this;
    },
  };
})();
