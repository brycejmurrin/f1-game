"use strict";

var GLX = (typeof window !== "undefined" && window.GLX) || (function () {
  let forceMobile = false;
  try {
    forceMobile = localStorage.getItem("apex26.forceMobileTier") === "1";
  } catch (_) {  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const touch = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
  const isMobile = forceMobile || /iPhone|iPad|iPod|Android/i.test(ua) ||
    (touch > 1 && /Mac/.test(ua));
  return {
    isMobile,
    mobileTier: isMobile,
    install(backend) {
      Object.defineProperties(this, Object.getOwnPropertyDescriptors(backend));
      return this;
    },
  };
})();
