/* Apex 26 — results sheet boot stub (FULL). The DOM builders live in
   GameResultsSheet (LAZY_RESULTS_SHEET); game.js still calls GameResults.create. */
const GameResults = (function () {
"use strict";

let _load = null;

function ensureSheet() {
  if (typeof GameResultsSheet !== "undefined") return Promise.resolve(true);
  if (_load) return _load;
  const files = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_RESULTS_SHEET) || [];
  const edges = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_RESULTS_SHEET_EDGES) || [];
  if (!files.length || typeof ScriptLoader === "undefined") {
    Log.warn("ui", "results sheet bundle is not in this build");
    return Promise.resolve(false);
  }
  _load = ScriptLoader.create().load(files, edges, { strict: true }).then((ok) => {
    if (!ok || typeof GameResultsSheet === "undefined") {
      _load = null;
      Log.warn("ui", "the results sheet bundle did not load");
      return false;
    }
    return true;
  }).catch((e) => {
    _load = null;
    Log.warn("ui", "the results sheet bundle did not load: " + (e && e.message || e));
    return false;
  });
  return _load;
}

function create(G) {
  Log.info("ui", "GameResults.create");
  let real = null, quali = null;
  function readyReal() {
    if (!real && typeof GameResultsSheet !== "undefined") real = GameResultsSheet.create(G);
    return real;
  }
  // The #quali painter rides the same bundle: it only paints after a session ran.
  function readyQuali() {
    if (!quali && typeof QualiSheet !== "undefined") quali = QualiSheet.create(G);
    return quali;
  }
  // Prefetch at boot (sync create): startRace awaits ensureLoaded; menu taps
  // usually hit a warm bundle.
  ensureSheet();
  function wrap(name, ready = readyReal) {
    return (...args) => {
      const r = ready();
      if (r) return r[name](...args);
      ensureSheet().then((ok) => { const impl = ok && ready(); if (impl) impl[name](...args); });
    };
  }
  return {
    buildResults: wrap("buildResults"),
    buildTTResults: wrap("buildTTResults"),
    buildStandings: wrap("buildStandings"),
    buildChampion: wrap("buildChampion"),
    quali: { build: wrap("build", readyQuali), open: wrap("open", readyQuali), close: wrap("close", readyQuali) },
  };
}

return { create, ensureLoaded: ensureSheet };
})();
Object.freeze(GameResults);
