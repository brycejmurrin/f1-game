/* Apex 26 — deferred quit-to-menu tail (js/game.js quitToMenu after #overlay is up). */
const MenuQuitTail = (function () {
  "use strict";
  let d = null, kept = null;
  function wire(deps) { d = deps; }
  // One-shot flow/session for the next quit instead of gp/race (Aero Lab drill, #6713).
  function keepFlow(flow, session) { kept = { flow, session }; }
  // forgetGp (and several wire() fields from quitToMenu) are unused here:
  // quali.clear(forgetGp) and the flyby/FX/audio/tuner closes already ran in
  // quitToMenu before the deferred tail. Extra call args are ignored.
  function afterOverlay() {
    if (!d) return;
    const run = (label, fn) => (typeof MenuTeardown !== "undefined" && MenuTeardown.runSync)
      ? MenuTeardown.runSync(label, fn) : fn();
    run("quit-mirror", () => d.mirrorPass.cancelPreparation());
    run("quit-tuners", () => {
      d.stormFx._ltNextT = 0; d.stormFx._thunderT = -1;
    });
    run("quit-session", () => {
      const keep = kept; kept = null;
      d.setFlow(keep ? keep.flow : "gp"); d.session = keep ? keep.session : "race"; d.tyres.setLevel(d.raceTyreWear);
      try { d.IncidentSim.reset(); } catch (_) { /* module absent */ }
      try { d.DebrisWorld.reset(); } catch (_) { /* module absent */ }
      try { delete document.documentElement.dataset.team; } catch (_) { /* no DOM */ }
      d.season = d.SeasonCal.load();
      d.refreshCareerButton();   // TitleMenu.refresh repaints #mb-standings from it
    });
    d.CustomTracks.consumeTrackHash();
    if (/[#&]vs=/.test(location.hash)) d.ensureNet().then((ok) => { if (ok) d.netLobby.openFromUrl(); });
  }
  return { wire, keepFlow, afterOverlay };
})();
Object.freeze(MenuQuitTail);
