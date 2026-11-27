/* Apex 26 — __apex.drill*: drive a LEARN drill without its dialog (#7067, #6559 step 0).
   The LEARN door path is lesson door → lab iframe → apex-learn-scenario message → G.drills().launch(id);
   these hooks call the same host (js/learn-drills/registry.js) from the menu, so a VM test or an agent
   reaches a drill's race in one call. FLAT names through ApexPlay.def() (js/agent/apex-play.js): the
   phone bridge reaches only flat names, so the #6559 `drill.{list,launch,…}` namespace is drillList,
   drillLaunch, drillState, drillRetry, drillFinish and drillEnd. Every one is readOnly: none builds the
   picked circuit first (a launch builds the drill's own). LAZY_AGENT, before apex.js (manifest edge). */
const ApexDrill = (function () {
  "use strict";

  const learnLoaded = () => typeof DrillRegistry !== "undefined" && typeof LearnDoor !== "undefined";
  // LAZY_LEARN on demand, as the LEARN door loads it (js/ui/title-menu.js); then the lazily-defined drills.
  async function ensureLearn() {
    if (!learnLoaded()) await ScriptLoader.create().load(ApexRoster.LAZY_LEARN, [], { strict: true }).catch(() => false);
    if (!learnLoaded()) return false;
    LearnDoor.defineDrills();
    return true;
  }
  const host = (G) => (learnLoaded() ? G.drills() : null);

  function state(G) {
    const h = host(G), d = h && h.state(), p = G.player;
    if (!d) return { active: false, state: G.state };
    return { active: true, id: d.id, staging: d.staging, state: G.state, cars: G.cars.length,
      lap: p ? p.lap : null, s: p ? +p.s.toFixed(2) : null, speed: p ? +p.speed.toFixed(3) : null };
  }

  function end(G, reason) {
    const h = host(G), d = h && h.state();
    if (!d) return { ok: false, error: "no_drill" };
    G.quitToMenu();   // its drills.end("quit") restores every setting the drill wrote
    return { ok: !h.active(), id: d.id, reason, state: G.state };
  }

  ApexPlay.def("drillList", { readOnly: true, doc: "LEARN drills: [{id, lesson, track, flow, session}]; [] until LAZY_LEARN loads (drillLaunch loads it).",
    fn: () => (learnLoaded() ? (LearnDoor.defineDrills(), DrillRegistry.ids().map((id) => {
      const d = DrillRegistry.get(id);
      return { id, lesson: d.lesson, track: d.setup.track, flow: d.setup.flow, session: d.setup.session };
    })) : []) });
  ApexPlay.def("drillLaunch", { readOnly: true, args: "id = \"aero\", variant?",
    doc: "From the menu, start a drill's race as the LEARN door does (loads LAZY_LEARN). Promise of {ok, id, variant, state}; the race is up once drillState().state is \"race\". variant is echoed only: no drill has one yet.",
    fn: async (G, id = "aero", variant = null) => {
      if (!(await ensureLearn())) return { ok: false, error: "learn_unavailable" };
      if (!DrillRegistry.get(id)) return { ok: false, error: "unknown_drill", ids: DrillRegistry.ids() };
      if (G.state !== "menu") return { ok: false, error: "not_menu", state: G.state };
      const ok = G.drills().launch(id);
      return ok ? { ok, id, variant, state: G.state } : { ok, error: "refused", id };
    } });
  ApexPlay.def("drillState", { readOnly: true, doc: "The active drill: {active, id, staging, state, cars, lap, s, speed}, or {active:false, state}.", fn: state });
  ApexPlay.def("drillRetry", { readOnly: true, doc: "The coach's RETRY LAP inside the active drill: {ok}.",
    fn: (G) => { const h = host(G); return h && h.state() ? { ok: !!h.retry() } : { ok: false, error: "no_drill" }; } });
  ApexPlay.def("drillFinish", { readOnly: true,
    doc: "End the active drill as finished: {ok, id, reason:\"finish\", state}. No drill scores a finish yet (#6559 step 2), so it ends as drillEnd does.",
    fn: (G) => end(G, "finish") });
  ApexPlay.def("drillEnd", { readOnly: true, doc: "Quit the active drill to the menu and restore the player's settings: {ok, id, reason:\"quit\", state}.",
    fn: (G) => end(G, "quit") });

  return { ensureLearn };
})();
Object.freeze(ApexDrill);
