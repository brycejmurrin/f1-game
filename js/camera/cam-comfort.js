/* Apex 26 — AUTO COMFORT camera preset. On first boot, when a touch screen or
 * WebXR capability is detected and the player has never chosen a comfort
 * preference, turn comfort ON (shake / kerb shiver / onboard buzz off via the
 * existing camComfort() path). A stored choice always wins. */
const CamComfort = (function () {
  "use strict";

  // Bare string on the raw lane (same pattern as CockpitOpts flags).
  const KEY = "camComfortPref";   // "on" | "off" | unset

  function detectTouch(nav, win) {
    const n = nav || (typeof navigator !== "undefined" ? navigator : null);
    const w = win || (typeof window !== "undefined" ? window : null);
    if (!n) return false;
    if ((n.maxTouchPoints | 0) > 0) return true;
    return !!(w && "ontouchstart" in w);
  }

  function detectXr(nav) {
    const n = nav || (typeof navigator !== "undefined" ? navigator : null);
    return !!(n && n.xr);
  }

  /** True when comfort should silence shake / buzz (after boot / user choice). */
  function active(store) {
    const s = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!s || typeof s.raw !== "function") return false;
    return s.raw(KEY) === "on";
  }

  function choice(store) {
    const s = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!s || typeof s.raw !== "function") return null;
    return s.raw(KEY);
  }

  /**
   * First-run auto pick. No-op when the key is already set (player chose, or a
   * previous auto write). Returns the applied value, or null when untouched.
   */
  function boot(store, nav, win) {
    const s = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!s || typeof s.raw !== "function") return null;
    if (s.raw(KEY) != null) return null;          // already chose / already auto'd
    if (detectTouch(nav, win) || detectXr(nav)) {
      if (typeof s.rawSet === "function") s.rawSet(KEY, "on");
      if (typeof Log !== "undefined" && Log.info) Log.info("game", "CamComfort.boot auto on (touch/XR)");
      return "on";
    }
    return null;
  }

  function set(store, on) {
    const s = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!s || typeof s.rawSet !== "function") return false;
    s.rawSet(KEY, on ? "on" : "off");
    return true;
  }

  return Object.freeze({
    KEY, detectTouch, detectXr, active, choice, boot, set,
  });
})();
