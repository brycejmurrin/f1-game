/* Apex 26 — TitleFlow: title-menu session entry and shared ghost links.
   Existing G flow/session slots stay authoritative; selectCareer preserves entry selection semantics. */
const TitleFlow = (function () {
"use strict";
function create(G, deps) {
const { $, els } = G;
const { vt, restoreFreePlaySelection, careerUi, refreshTitle, ensureNet } = deps;
$("mb-race").onclick = () => {
  G.flow = "gp"; G.session = "race";
  restoreFreePlaySelection();
  G.buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);   // pre-build the saved pick while the picker is read
};
// Optional markup must not turn one missing screen into a whole-app boot failure.
if ($("mb-vs")) $("mb-vs").onclick = () => {
  // The peer-to-peer lobby starts the race once both sides agree.
  G.flow = "gp"; G.session = "race";
  restoreFreePlaySelection();
  // The bundle lands before the screen does; ensureNet() wires the real lobby.
  ensureNet().then((ok) => { if (ok) G.netLobby.open(); });
  if (G.soundOn) GameAudio.uiSelect();
};
function openTimeTrial(selectDaily) {
  G.flow = "gp"; G.session = "tt";
  if (selectDaily) G.daily.select();
  else restoreFreePlaySelection();
  G.buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (G.soundOn) GameAudio.uiSelect();
  // Daily selection already names the exact circuit/weather/time. Do not first
  // arm a free-play scene that is immediately discarded.
  if (!selectDaily) G.scheduleFlybyTrack(true);
}
$("mb-tt").onclick = () => openTimeTrial(false);
async function consumeGhostHash() {
  // A ghost link landing MID-RACE waits, fragment intact, for the menu (quitToMenu re-reads it) — as #353's invite link does.
  if (UiLayers.inRace()) { Log.info("game", "ghost link deferred: racing"); return null; }
  const shared = await GhostShare.consumeHash({ valid: () => !UiLayers.inRace(),
    notify: (message, result) => G.announce(message, result && result.ok ? 3 : 4, result && result.ok ? "info" : "warning"),
  });
  if (!shared || !shared.ok) return shared;
  G.flow = "gp"; G.session = "tt";
  const today = DailyChallenge.dayKey();
  if (shared.day && shared.day === today) {
    G.daily.select(shared.day);
  } else {
    G.daily.stop();
    restoreFreePlaySelection();
    const idx = Tracks.LIST.findIndex((entry) => entry.id === shared.track);
    if (idx < 0) return shared;   // decode already guards this; retain a safe no-op
    G.trackIdx = idx;
  }
  G.buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  G.scheduleFlybyTrack(true);
  return shared;
}
consumeGhostHash();
window.addEventListener("hashchange", consumeGhostHash);
$("mb-season").onclick = () => {
  G.flow = "season"; G.session = "race";
  // Replace any career alias with the repaired standalone save; finished stays readable.
  G.season = SeasonCal.load();
  // Finished championship: trackIndex(rounds()) is -1 — park the flyby on the
  // last raced circuit instead of crashing loadTrack.
  let ti = SeasonCal.trackIndex(G.season.round);
  if (ti < 0) {
    const last = SeasonCal.rounds() - 1;
    ti = last >= 0 ? SeasonCal.trackIndex(last) : 0;
  }
  G.trackIdx = ti;
  G.buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);   // pre-build the saved pick while the picker is read
};
// Career's calendar is fixed, so its hub replaces the circuit picker.
function openCareer() {
  G.flow = "career"; G.session = "race";
  deps.selectCareer();
  // vt: the same crossfade RACE / SEASON / GARAGE already take off the title.
  vt(() => { careerUi.openHub(); els.overlay.hidden = true; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);   // the hub's next round, pre-built behind it
}
// The same entry, stopping at the slot picker. Deliberately does NOT engage the
// career flow: nothing has been chosen yet, so a save's rules must not be live —
// the picker's own handler calls openCareer() once a slot is taken.
function openCareerSlots() {
  vt(() => { careerUi.openSlots(); els.overlay.hidden = true; });
  if (G.soundOn) GameAudio.uiSelect();
}
function refreshCareerButton() {
  refreshTitle();
}

return { openTimeTrial, consumeGhostHash, openCareer, openCareerSlots, refreshCareerButton };
}
  return { create };
})();
Object.freeze(TitleFlow);
