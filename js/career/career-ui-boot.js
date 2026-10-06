/* Apex 26 — CAREER screen boot stub (FULL). The #career sheet body is
   CareerScreen in LAZY_CAREER_UI; game.js still calls CareerUI.create. */
const CareerUI = (function () {
"use strict";

const STARTER_TIER_MIN = 3;
let _load = null;

function ensureScreen() {
  if (typeof CareerScreen !== "undefined") return Promise.resolve(true);
  if (_load) return _load;
  const files = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_CAREER_UI) || [];
  const edges = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_CAREER_UI_EDGES) || [];
  if (!files.length || typeof ScriptLoader === "undefined") {
    Log.warn("ui", "career UI bundle is not in this build");
    return Promise.resolve(false);
  }
  _load = ScriptLoader.create().load(files, edges, { strict: true }).then((ok) => {
    if (!ok || typeof CareerScreen === "undefined") {
      _load = null;
      Log.warn("ui", "the career UI bundle did not load");
      return false;
    }
    return true;
  });
  return _load;
}

function create(G) {
  Log.info("ui", "CareerUI.create");
  const { $ } = G;
  let real = null;
  function ensure() {
    if (real) return Promise.resolve(real);
    return ensureScreen().then((ok) => {
      if (!ok) return null;
      if (!real) real = CareerScreen.create(G);
      return real;
    });
  }
  function show() { const n = $("career"); if (n) n.hidden = false; }
  return {
    build: () => ensure().then((r) => { if (r && r.build) r.build(); }),
    openHub: () => { show(); return ensure().then((r) => { if (r) r.openHub(); }); },
    openSlots: (origin) => { show(); return ensure().then((r) => { if (r) r.openSlots(origin); }); },
    close: () => { if (real) real.close(); else { const n = $("career"); if (n) n.hidden = true; } },
    openOffers: () => ensure().then((r) => { if (r && r.openOffers) r.openOffers(); }),
    closeOffers: () => { if (real && real.closeOffers) real.closeOffers(); },
    openHistory: () => ensure().then((r) => { if (r && r.openHistory) r.openHistory(); }),
    closeHistory: () => { if (real && real.closeHistory) real.closeHistory(); },
    openGuide: () => ensure().then((r) => { if (r && r.openGuide) r.openGuide(); }),
    closeGuide: () => { if (real && real.closeGuide) real.closeGuide(); },
  };
}

return { create, STARTER_TIER_MIN, ensureScreen };
})();
Object.freeze(CareerUI);
