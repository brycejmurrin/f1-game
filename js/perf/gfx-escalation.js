const GfxEscalation = (function () {
  "use strict";

  const LOSS_KEY = "apex26.ctxLostReloads";
  const LOSS_MARKER = /(?:^|\n)apex26\.ctxLostReloads=(\d+)$/;
  const BUDGET_BUILD_KEY = "apex26.ctxLostBudgetBuild";
  let _reloadCount = 0;
  let _menuBootSynced = false;
  function reloadCount() {
    let n = 0, marker = null;
    try { marker = String(window.name || "").match(LOSS_MARKER); } catch (_) {  }
    if (marker) n = parseInt(marker[1], 10) || 0;
    else try { n = parseInt(sessionStorage.getItem(LOSS_KEY), 10) || 0; } catch (_) {  }
    return Math.max(_reloadCount, n);
  }
  function rememberReloadCount(n) {
    try {
      const name = String(window.name || "").replace(LOSS_MARKER, "");
      window.name = name + (name ? "\n" : "") + LOSS_KEY + "=" + n;
    } catch (_) {  }
  }
  function nextReloadCount() {
    _reloadCount = reloadCount() + 1;
    try { sessionStorage.setItem(LOSS_KEY, String(_reloadCount)); } catch (_) {  }
    rememberReloadCount(_reloadCount);
    return _reloadCount;
  }
  function resetReloadBudget() {
    _reloadCount = 0;
    let cleared = false;
    try { sessionStorage.removeItem(LOSS_KEY); cleared = true; } catch (_) {  }
    if (cleared) {
      try { window.name = String(window.name || "").replace(LOSS_MARKER, ""); } catch (_) {  }
    } else rememberReloadCount(0);
  }

  function currentBuildId() {
    try {
      const m = typeof document !== "undefined" && document.querySelector && document.querySelector('meta[name="apex-build"]');
      return (m && m.content) || "";
    } catch (_) { return ""; }
  }

  function initReloadBudgetSession() {
    try {
      const entry = typeof performance !== "undefined" && performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (entry && entry.type === "navigate") {
        resetReloadBudget();
        const build = currentBuildId();
        if (build) try { sessionStorage.setItem(BUDGET_BUILD_KEY, build); } catch (_) {  }
      }
    } catch (_) {  }
  }

  function noteCleanMenuBoot() {
    if (_menuBootSynced) return;
    _menuBootSynced = true;
    try {
      const build = currentBuildId();
      let bound = "";
      try { bound = sessionStorage.getItem(BUDGET_BUILD_KEY) || ""; } catch (_) {  }
      if (build && bound && build !== bound) resetReloadBudget();
      if (build) try { sessionStorage.setItem(BUDGET_BUILD_KEY, build); } catch (_) {  }
    } catch (_) {  }
  }

  function stashInPageRecoverFlags() {
    try {
      sessionStorage.setItem("apex26.ctxLostNeedReload", "1");
      sessionStorage.setItem("apex26.ctxLostExhausted", "1");
    } catch (_) {  }
  }

  initReloadBudgetSession();

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

  let _soften = null;
  function registerRaceEntrySoften(fn) {
    _soften = typeof fn === "function" ? fn : null;
  }
  function softenRaceEntry(gfx) {
    try {
      if (_soften) _soften(gfx);
    } catch (_) {  }
  }

  function maybeRecoverRaceEntry(isLost, recover) {
    if (_raceEntryCtxRecover || !raceEntryActive() || !isLost || !isLost()) return;
    _raceEntryCtxRecover = true;
    queueMicrotask(() => {
      _raceEntryCtxRecover = false;
      if (isLost()) recover();
    });
  }

  function onReloadBudgetExceeded(n, deps) {
    const msg = "The graphics device keeps getting lost (" + n + " times) — reload to try again, or pick another RENDERER in settings.";
    const record = deps && deps.recordGfxBudgetExhausted;
    const show = deps && deps.showUnavailable;
    const panel = deps && deps.panel;
    if (raceEntryActive()) {
      try { sessionStorage.setItem("apex26.ctxLostNotice", "1"); } catch (_) {  }
      if (_menuRecover) {
        try { _menuRecover(); return "menu"; } catch (_) {  }
      }
      if (record) try { record("gfx", new Error(msg)); } catch (_) {  }
      return "menu";
    }
    if (record) try { record("gfx", new Error(msg)); } catch (_) {  }
    try {
      if (typeof show === "function") show({ panel: panel || (typeof document !== "undefined" && document.getElementById && document.getElementById("nogl")) });
      else if (typeof RendererPicker !== "undefined" && RendererPicker.showUnavailable) {
        RendererPicker.showUnavailable({ panel: panel || (typeof document !== "undefined" && document.getElementById && document.getElementById("nogl")) });
      }
    } catch (_) {  }
    return "unavailable";
  }

  return {
    reloadCount,
    nextReloadCount,
    resetReloadBudget,
    noteCleanMenuBoot,
    stashInPageRecoverFlags,
    raceEntryActive,
    registerMenuRecover,
    registerRaceEntrySoften,
    softenRaceEntry,
    maybeRecoverRaceEntry,
    onReloadBudgetExceeded,
  };
})();

Object.freeze(GfxEscalation);
