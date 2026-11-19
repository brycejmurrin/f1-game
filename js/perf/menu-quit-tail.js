const MenuQuitTail = (function () {
  "use strict";
  let d = null;
  function wire(deps) { d = deps; }
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
      try { d.IncidentSim.reset(); } catch (_) {  }
      try { d.DebrisWorld.reset(); } catch (_) {  }
      try { delete document.documentElement.dataset.team; } catch (_) {  }
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
