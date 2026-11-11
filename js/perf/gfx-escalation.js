/* Apex 26 — GfxEscalation: when a backend exhausts its ctx-lost reload budget,
   decide between the terminal Graphics unavailable panel and an in-tab title-menu
   recovery during race entry (RaceEntryProfile armed). Backends call
   onReloadBudgetExceeded; game.js registers the menu recover hook. */
const GfxEscalation = (function () {
  "use strict";

  // One recovery episode spans renderer switches and reloads. window.name is
  // the per-tab fallback when either storage operation is denied. Preserve its
  // caller-owned prefix, and reset only at explicit clean-race / user boundaries.
  const LOSS_KEY = "apex26.ctxLostReloads";
  const LOSS_MARKER = /(?:^|\n)apex26\.ctxLostReloads=(\d+)$/;
  const BUDGET_BUILD_KEY = "apex26.ctxLostBudgetBuild";
  let _reloadCount = 0;
  let _menuBootSynced = false;
  function reloadCount() {
    let n = 0, marker = null;
    try { marker = String(window.name || "").match(LOSS_MARKER); } catch (_) { /* no window */ }
    // A zero fallback marker records a clean boundary even if stale storage
    // could not be cleared. Prefer it to those old bytes after storage recovers.
    if (marker) n = parseInt(marker[1], 10) || 0;
    else try { n = parseInt(sessionStorage.getItem(LOSS_KEY), 10) || 0; } catch (_) { /* memory fallback */ }
    return Math.max(_reloadCount, n);
  }
  function rememberReloadCount(n) {
    try {
      const name = String(window.name || "").replace(LOSS_MARKER, "");
      window.name = name + (name ? "\n" : "") + LOSS_KEY + "=" + n;
    } catch (_) { /* storage / memory still bound same-document losses */ }
  }
  function nextReloadCount() {
    _reloadCount = reloadCount() + 1;
    try { sessionStorage.setItem(LOSS_KEY, String(_reloadCount)); } catch (_) { /* fallback below */ }
    // Keep both stores coherent even when reads and writes recover separately.
    rememberReloadCount(_reloadCount);
    return _reloadCount;
  }
  function resetReloadBudget() {
    _reloadCount = 0;
    let cleared = false;
    try { sessionStorage.removeItem(LOSS_KEY); cleared = true; } catch (_) { /* retain zero marker */ }
    if (cleared) {
      try { window.name = String(window.name || "").replace(LOSS_MARKER, ""); } catch (_) { /* no window */ }
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
        if (build) try { sessionStorage.setItem(BUDGET_BUILD_KEY, build); } catch (_) { /* blocked storage */ }
      }
    } catch (_) { /* harness */ }
  }

  /** Once per document: drop a stale budget after a deploy reload in the same tab. */
  function noteCleanMenuBoot() {
    if (_menuBootSynced) return;
    _menuBootSynced = true;
    try {
      const build = currentBuildId();
      let bound = "";
      try { bound = sessionStorage.getItem(BUDGET_BUILD_KEY) || ""; } catch (_) { /* blocked storage */ }
      if (build && bound && build !== bound) resetReloadBudget();
      if (build) try { sessionStorage.setItem(BUDGET_BUILD_KEY, build); } catch (_) { /* blocked storage */ }
    } catch (_) { /* harness */ }
  }

  function stashInPageRecoverFlags() {
    try {
      sessionStorage.setItem("apex26.ctxLostNeedReload", "1");
      sessionStorage.setItem("apex26.ctxLostExhausted", "1");
    } catch (_) { /* Retry + card copy */ }
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
