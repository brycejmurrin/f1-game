/* Apex 26 — native-shell detect (Electron preload + Capacitor). Call-time only. */
const Native = (function () {
  "use strict";

  function win() {
    return typeof window !== "undefined" ? window : null;
  }

  function nativeFlag() {
    try {
      const w = win();
      return !!(w && w.__APEX_NATIVE__ && w.__APEX_NATIVE__.desktop);
    } catch (e) { return false; }
  }

  function capacitorNative() {
    try {
      const w = win();
      const cap = w && w.Capacitor;
      return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
    } catch (e) { return false; }
  }

  function capacitorPlatform() {
    try {
      const w = win();
      const cap = w && w.Capacitor;
      if (!cap || typeof cap.getPlatform !== "function") return "";
      return String(cap.getPlatform() || "").toLowerCase();
    } catch (e) { return ""; }
  }

  function isNative() {
    return nativeFlag() || capacitorNative();
  }

  /** @returns {"web"|"desktop"|"android"|"ios"} */
  function platform() {
    if (nativeFlag()) return "desktop";
    if (capacitorNative()) {
      const p = capacitorPlatform();
      if (p === "ios") return "ios";
      if (p === "android") return "android";
      return p || "android";
    }
    return "web";
  }

  function canonicalOrigin() {
    const p = platform();
    if (p === "desktop") return "app://apex";
    if (p === "android") return "https://localhost";
    if (p === "ios") return "capacitor://localhost";
    try {
      const w = win();
      if (w && w.location && w.location.origin) return String(w.location.origin);
    } catch (e) { /* location may be absent in a Node VM */ }
    return "";
  }

  function plugins() {
    try {
      const w = win();
      const cap = w && w.Capacitor;
      return (cap && cap.Plugins) || null;
    } catch (e) { return null; }
  }

  return { isNative, platform, canonicalOrigin, plugins };
})();
Object.freeze(Native);
