/* Apex 26 — AUTO COMFORT camera preset. On first boot, when a touch screen
 * is detected and the player has never chosen a comfort
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

  /** True when comfort should silence shake / buzz (after boot / user choice).
   *  An explicit SETTINGS › ACCESSIBILITY › REDUCE MOTION: OFF (apex26.motion
   *  = "off") is the player asking for full motion, and wins over the touch
   *  auto-pick. Legacy MOTION: ON stored as "on" is treated as AUTO (not OFF). */
  // render() asks every frame and raw() is a localStorage read, so the answer is
  // memoised on the store's revisions: `rev` (set(), a foreign tab's write, a
  // mirror restore) and `rawRev` (rawSet / rawDel — boot(), set(), a settings
  // import). A hand edit of localStorage in devtools is the one writer that
  // bumps neither; it is seen on the next store write or reload.
  let _mS = null, _mRev = -1, _mRaw = -1, _mVal = false;
  function active(store) {
    const s = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!s || typeof s.raw !== "function") return false;
    const memo = typeof s.rev === "number" && typeof s.rawRev === "number";
    if (memo && s === _mS && s.rev === _mRev && s.rawRev === _mRaw) return _mVal;
    const v = !(typeof s.get === "function" && s.get("motion", null) === "off") && s.raw(KEY) === "on";
    if (memo) { _mS = s; _mRev = s.rev; _mRaw = s.rawRev; _mVal = v; }
    return v;
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
    const touch = detectTouch(nav, win);
    // navigator.xr exists in desktop Chrome/Edge with no headset, so the old
    // touch-OR-XR pick silenced shake for every desktop Chromium player, for
    // good (nothing in the UI writes this key). A headset session is already
    // comfort via XrBoot.camComfort; drop that auto value off non-touch boots.
    if (s.raw(KEY) === "on" && !touch && typeof s.rawDel === "function") { s.rawDel(KEY); return null; }
    if (s.raw(KEY) != null) return null;          // already chose / already auto'd
    if (touch) {
      if (typeof s.rawSet === "function") s.rawSet(KEY, "on");
      if (typeof Log !== "undefined" && Log.info) Log.info("game", "CamComfort.boot auto on (touch)");
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
