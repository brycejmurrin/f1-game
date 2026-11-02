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
  let real = null;
  function ensure() {
    if (real) return Promise.resolve(real);
    return ensureSheet().then((ok) => {
      if (!ok) return null;
      if (!real) real = GameResultsSheet.create(G);
      return real;
    });
  }
  function readyReal() {
    if (!real && typeof GameResultsSheet !== "undefined") real = GameResultsSheet.create(G);
    return real;
  }
  // Prefetch at boot (sync create): startRace awaits ensureLoaded; menu taps
  // usually hit a warm bundle.
  ensureSheet();
  function wrap(name) {
    return (...args) => {
      const r = readyReal();
      if (r) return r[name](...args);
      ensure().then((impl) => { if (impl) impl[name](...args); });
    };
  }
  return {
    buildResults: wrap("buildResults"),
    buildTTResults: wrap("buildTTResults"),
    buildStandings: wrap("buildStandings"),
    buildChampion: wrap("buildChampion"),
  };
}

return { create, ensureLoaded: ensureSheet };
})();
Object.freeze(GameResults);
