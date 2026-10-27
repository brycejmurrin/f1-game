/* Apex 26 — deferred quit-to-menu tail (js/game.js quitToMenu after #overlay is up). */
const MenuQuitTail = (function () {
  "use strict";
  let d = null;
  function wire(deps) { d = deps; }
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
      d.setFlow("gp"); d.session = "race"; d.tyres.setLevel(d.raceTyreWear);
      try { d.IncidentSim.reset(); } catch (_) { /* module absent */ }
      try { d.DebrisWorld.reset(); } catch (_) { /* module absent */ }
      try { delete document.documentElement.dataset.team; } catch (_) { /* no DOM */ }
      d.season = d.SeasonCal.load();
      const hasSeason = d.SeasonCal.hasProgress(d.season) && d.season.round < d.SeasonCal.rounds();
      d.$("mb-standings").hidden = !hasSeason;
      d.refreshCareerButton();
    });
    d.CustomTracks.consumeTrackHash();
    if (/[#&]vs=/.test(location.hash)) d.ensureNet().then((ok) => { if (ok) d.netLobby.openFromUrl(); });
  }
  return { wire, afterOverlay };
})();
Object.freeze(MenuQuitTail);
