/* Apex 26 — GfxEscalation: when a backend exhausts its ctx-lost reload budget,
   decide between the terminal Graphics unavailable panel and an in-tab title-menu
   recovery during race entry (RaceEntryProfile armed). Backends call
   onReloadBudgetExceeded; game.js registers the menu recover hook. */
const GfxEscalation = (function () {
  "use strict";

  let _menuRecover = null;
  let _raceEntryCtxRecover = false;

  function raceEntryActive() {
    try {
      return typeof RaceEntryProfile !== "undefined" && typeof RaceEntryProfile.armed === "function" && RaceEntryProfile.armed();
    } catch (_) { return false; }
  }

  function registerMenuRecover(fn) {
    _menuRecover = typeof fn === "function" ? fn : null;
  }

  function softenRaceEntry(gfx) {
    try {
      if (typeof RaceEntryProfile === "undefined" || !RaceEntryProfile.softwareRaster || !RaceEntryProfile.softwareRaster()) return;
      if (gfx && gfx.setRenderScale && gfx.getRenderScale && gfx.getRenderScale() > 0.72) gfx.setRenderScale(0.72);
      try { localStorage.setItem("apex26.envProbeOff", "1"); } catch (_) { /* software cold build */ }
    } catch (_) { /* harness */ }
  }

  function maybeRecoverRaceEntry(isLost, recover) {
    if (_raceEntryCtxRecover || !raceEntryActive() || !isLost || !isLost()) return;
    _raceEntryCtxRecover = true;
    queueMicrotask(() => {
      _raceEntryCtxRecover = false;
      if (isLost()) recover();
    });
  }

  /** @returns {"menu"|"unavailable"} */
  function onReloadBudgetExceeded(n, deps) {
    const msg = "The graphics device keeps getting lost (" + n + " times) — reload to try again, or pick another RENDERER in settings.";
    const record = deps && deps.recordGfxBudgetExhausted;
    const show = deps && deps.showUnavailable;
    const panel = deps && deps.panel;
    if (raceEntryActive()) {
      try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) { /* menu still loads */ }
      if (_menuRecover) {
        try { _menuRecover(); return "menu"; } catch (_) { /* fall through */ }
      }
      if (record) try { record("gfx", new Error(msg)); } catch (_) { /* ring optional */ }
      return "menu";
    }
    if (record) try { record("gfx", new Error(msg)); } catch (_) { /* ring optional */ }
    try {
      if (typeof show === "function") show({ panel: panel || (typeof document !== "undefined" && document.getElementById && document.getElementById("nogl")) });
      else if (typeof RendererPicker !== "undefined" && RendererPicker.showUnavailable) {
        RendererPicker.showUnavailable({ panel: panel || (typeof document !== "undefined" && document.getElementById && document.getElementById("nogl")) });
      }
    } catch (_) { /* harness */ }
    return "unavailable";
  }

  return {
    raceEntryActive,
    registerMenuRecover,
    softenRaceEntry,
    maybeRecoverRaceEntry,
    onReloadBudgetExceeded,
  };
})();

Object.freeze(GfxEscalation);
