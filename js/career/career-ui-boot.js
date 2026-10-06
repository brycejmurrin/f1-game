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
  // Kick the fetch at boot (not on the title paint path — create is sync). A
  // harness that __apex.career()s then taps #cr-garage in the same turn used
  // to no-op: CareerScreen.create wires the sheet buttons, and until LAZY
  // landed those nodes had no onclick (CI oversize-career #carsetup hidden).
  ensureScreen();
  // Defer the sheet controls the stub shares with CareerScreen.create so a
  // click during the fetch is queued on ensure() rather than dropped. create()
  // rebinds these once the real screen mounts.
  function defer(fn) {
    return () => { ensure().then((r) => { if (r) fn(r); }); };
  }
  if ($("cr-garage")) $("cr-garage").onclick = defer((r) => {
    if (r.close) r.close();
    G.openGarage("career");
  });
  if ($("cr-back")) $("cr-back").onclick = defer((r) => {
    // CareerScreen.create overwrites this with the full MAIN MENU path; until
    // then a tap just closes the empty shell so Esc cannot stick on a blank
    // #career that show()-ed before the bundle landed.
    if (r.close) r.close();
    if (G.els && G.els.overlay) G.els.overlay.hidden = false;
  });
  if ($("cr-go")) $("cr-go").onclick = defer((r) => {
    // Re-fire on the real binding CareerScreen.create installs.
    const n = $("cr-go");
    if (n && n.onclick) n.onclick();
  });

  return {
    build: () => ensure().then((r) => { if (r && r.build) r.build(); }),
    // Do not reveal #career until CareerScreen has built — a premature show()
    // made the shell visible with no slots/title while the fetch was in flight.
    openHub: () => ensure().then((r) => {
      if (!r) return;
      // A racy #cr-garage tap may already have opened the garage; do not cover it.
      const cs = $("carsetup");
      if (cs && !cs.hidden) return;
      r.openHub();
    }),
    openSlots: (origin) => ensure().then((r) => {
      if (!r) return;
      const cs = $("carsetup");
      if (cs && !cs.hidden) return;
      r.openSlots(origin);
    }),
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
