/* Apex 26 — AUTO COMFORT camera preset. On first boot, when a touch screen
 * is detected and the player has never chosen a comfort
 * preference, turn comfort ON (shake / kerb shiver / onboard buzz off via the
 * existing camComfort() path). A stored choice always wins. */
const CamComfort = (function () {
  "use strict";

  // Bare string on the raw lane (same pattern as CockpitOpts flags).
  const KEY = "camComfortPref";   // "on" | "off" | unset
  const FX_DEFS = Object.freeze([
    Object.freeze({ id: "motionBlur", label: "MOTION BLUR", min: 1, max: 10, step: 1, def: 5, unit: "",
      help: "Motion-blur amount. Notch 1 is OFF. Stored now; renderers may bind the optional comfort-FX hook later." }),
    Object.freeze({ id: "speedLines", label: "SPEED LINES", min: 1, max: 10, step: 1, def: 5, unit: "",
      help: "Speed-line amount. Notch 1 is OFF. Stored now; renderers may bind the optional comfort-FX hook later." }),
  ]);
  const FX_BY_ID = {};
  for (const d of FX_DEFS) FX_BY_ID[d.id] = d;

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

  function reducedMotion(win) {
    const w = win || (typeof window !== "undefined" ? window : null);
    try { return !!(w && w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (_) { return false; }
  }

  function fxGet(store, id) {
    const d = FX_BY_ID[id];
    const s = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!d || !s || typeof s.get !== "function") return d ? d.def : 1;
    const v = s.get(id, d.def);
    return typeof v === "number" && isFinite(v) ? Math.max(d.min, Math.min(d.max, Math.round(v))) : d.def;
  }

  function fxSet(store, id, value) {
    const d = FX_BY_ID[id];
    const s = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!d || !s || typeof s.set !== "function" || typeof value !== "number" || !isFinite(value)) return false;
    return s.set(id, Math.max(d.min, Math.min(d.max, Math.round(value)))) !== false;
  }

  function fxValues(store) {
    const out = {};
    for (const d of FX_DEFS) out[d.id] = fxGet(store, d.id);
    return out;
  }

  /**
   * Renderer integration boundary. Backends intentionally have no FX path yet:
   * they may add setComfortFx(opts) later without changing storage or Settings
   * export. Returning opts keeps the hook observable in unit/dev harnesses.
   */
  function applyFx(G, store) {
    const opts = fxValues(store || (G && G.store));
    if (G && G.gfx && typeof G.gfx.setComfortFx === "function") G.gfx.setComfortFx(opts);
    return opts;
  }

  /**
   * First-run auto pick. No-op when the key is already set (player chose, or a
   * previous auto write). Returns the applied value, or null when untouched.
   */
  function boot(store, nav, win) {
    const s = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!s || typeof s.raw !== "function") return null;
    if (reducedMotion(win) && typeof s.get === "function" && typeof s.set === "function") {
      for (const d of FX_DEFS) if (s.get(d.id, null) == null) s.set(d.id, d.min);
    }
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
    KEY, FX_DEFS, detectTouch, detectXr, reducedMotion, active, choice, boot, set,
    fxGet, fxSet, fxValues, applyFx,
  });
})();
