const CareerUI = (function () {
"use strict";

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
  }).catch((e) => {
    _load = null;
    Log.warn("ui", "the career UI bundle did not load: " + (e && e.message || e));
    return false;
  });
  return _load;
}

function create(G) {
  Log.info("ui", "CareerUI.create");
  const { $ } = G;
  let /** @type {ReturnType<typeof CareerScreen.create> | null} */ real = null;
  let entryGeneration = 0;
  let goGeneration = 0;
  let entryFailed = false;
  function ensure() {
    if (real) return Promise.resolve(real);
    const writer = typeof GameStore !== "undefined" && GameStore.store && GameStore.store.careerWriter;
    const loaded = ensureScreen();
    return (writer ? writer.ready.then(() => loaded) : loaded).then((ok) => {
      if (!ok) return null;
      if (!real) real = CareerScreen.create(G);
      return real;
    });
  }
  ensureScreen();
  function defer(fn) {
    return () => { ensure().then((r) => { if (r) fn(r); }); };
  }
  function openEntry(method, origin) {
    if (entryFailed && G.refreshCareerButton) G.refreshCareerButton();
    entryFailed = false;
    const generation = ++entryGeneration;
    return ensure().then((r) => {
      if (generation !== entryGeneration) return;
      const cs = $("carsetup");
      if (cs && !cs.hidden) return;
      if (r) { r[method](origin); return; }
      if (typeof UiLayers !== "undefined") {
        if (UiLayers.inRace()) return;
        const top = UiLayers.top();
        if (top && top.id !== "overlay" && top.id !== "career") return;
      }
      if (G.els && G.els.overlay) G.els.overlay.hidden = false;
      entryFailed = true;
      const sub = $("mb-career-sub"), button = $("mb-career");
      if (sub) sub.textContent = "COULD NOT LOAD · TRY AGAIN";
      if (button) button.setAttribute("aria-label", "Career modes — could not load. Try again.");
      if (G.announce) G.announce("CAREER COULD NOT LOAD — PLEASE TRY AGAIN", 4, "warning");
    });
  }
  if ($("cr-garage")) $("cr-garage").onclick = defer((r) => {
    if (r.close) r.close();
    G.openGarage("career");
  });
  if ($("cr-back")) $("cr-back").onclick = defer((r) => {
    if (r.close) r.close();
    if (G.els && G.els.overlay) G.els.overlay.hidden = false;
  });
  if ($("cr-go")) $("cr-go").onclick = () => {
    const generation = ++goGeneration;
    ensure().then((r) => {
      if (!r || generation !== goGeneration) return;
      const n = $("cr-go");
      if (n && n.onclick) n.onclick();
    });
  };

  return {
    build: () => ensure().then((r) => { if (r && r.build) r.build(); }),
    openHub: () => openEntry("openHub"),
    openSlots: (origin) => openEntry("openSlots", origin),
    close: () => { ++entryGeneration; if (real) real.close(); else { const n = $("career"); if (n) n.hidden = true; } },
    openOffers: () => ensure().then((r) => { if (r && r.openOffers) r.openOffers(); }),
    closeOffers: () => { if (real && real.closeOffers) real.closeOffers(); },
    openHistory: () => ensure().then((r) => { if (r && r.openHistory) r.openHistory(); }),
    closeHistory: () => { if (real && real.closeHistory) real.closeHistory(); },
    openGuide: () => ensure().then((r) => { if (r && r.openGuide) r.openGuide(); }),
    closeGuide: () => { if (real && real.closeGuide) real.closeGuide(); },
  };
}

function ensureBackup() {
  if (typeof CareerBackup !== "undefined") return Promise.resolve(true);
  return ensureScreen().then((ok) => !!ok && typeof CareerBackup !== "undefined");
}
return { create, ensureBackup };
})();
Object.freeze(CareerUI);
