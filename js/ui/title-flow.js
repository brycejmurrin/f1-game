const TitleFlow = (function () {
"use strict";
function create(G, deps) {
const { $, els } = G;
const { restoreFreePlaySelection, careerUi, refreshTitle, ensureNet } = deps;
let titleTransition = 0, titleTransitionSerial = 0;
let lobbyRequest = 0;
els.overlay.addEventListener?.("click", (event) => {
  const door = event.target.closest?.("button, a");
  if (door && (door.id.startsWith("mb-") || door.tagName === "A")) lobbyRequest++;
}, true);
function vt(fn) {
  const mine = ++titleTransitionSerial;
  titleTransition = mine;
  try {
    deps.vt(() => {
      if (titleTransition !== mine) return;
      try { fn(); }
      finally { if (titleTransition === mine) titleTransition = 0; }
    });
  } catch (error) {
    if (titleTransition === mine) titleTransition = 0;
    throw error;
  }
}
function titleIsLive(top = UiLayers.top()) {
  return !titleTransition && !UiLayers.inRace() && !els.overlay.hidden && (!top || top.id === "overlay");
}
$("mb-race").onclick = () => {
  G.flow = "gp"; G.session = "race";
  restoreFreePlaySelection();
  G.buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);
};
if ($("mb-vs")) $("mb-vs").onclick = () => {
  const navigation = titleTransitionSerial;
  const request = ++lobbyRequest;
  Promise.resolve(ensureNet()).then((ok) => ok, () => false).then((ok) => {
    if (request !== lobbyRequest || navigation !== titleTransitionSerial || !titleIsLive()) return;
    if (!ok) { G.announce("COULD NOT LOAD — CHECK YOUR CONNECTION OR RELOAD", 4, "warning"); return; }
    G.flow = "gp"; G.session = "race";
    restoreFreePlaySelection();
    G.netLobby.open();
  });
  if (G.soundOn) GameAudio.uiSelect();
};
function openTimeTrial(selectDaily) {
  G.flow = "gp"; G.session = "tt";
  if (selectDaily) G.daily.select();
  else restoreFreePlaySelection();
  G.buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);
}
$("mb-tt").onclick = () => openTimeTrial(false);
async function consumeGhostHash() {
  const titleLive = () => {
    if (UiLayers.inRace()) { Log.info("game", "ghost link deferred: racing"); return false; }
    const top = els.overlay.hidden ? null : UiLayers.top();
    if (titleIsLive(top)) return true;
    Log.info("game", "ghost link deferred: title not live");
    if (typeof MutationObserver === "function" && /(?:^#|&)(?:ghost|share)=/.test(location.hash) && !els.overlay._apexLinkWatch) {
      const watch = els.overlay._apexLinkWatch = new MutationObserver(() => {
        watch.disconnect(); els.overlay._apexLinkWatch = null; setTimeout(consumeGhostHash, 0);
      });
      for (const el of [els.overlay, top]) if (el) watch.observe(el, { attributes: true, attributeFilter: ["hidden", "open"] });
    }
    return false;
  };
  if (!titleLive()) return null;
  const shared = await GhostShare.consumeHash({ valid: titleLive,
    notify: (message, result) => G.announce(message, result && result.ok ? 3 : 4, result && result.ok ? "info" : "warning"),
  });
  if (shared && shared.ok) {
    G.flow = "gp"; G.session = "tt";
    const today = DailyChallenge.dayKey();
    if (shared.day && shared.day === today) {
      G.daily.select(shared.day);
    } else {
      G.daily.stop();
      restoreFreePlaySelection();
      const idx = Tracks.LIST.findIndex((entry) => entry.id === shared.track);
      if (idx < 0) return shared;
      G.trackIdx = idx;
    }
    G.buildSelect();
    vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
    G.scheduleFlybyTrack(true);
  }
  if (typeof ShareCode !== "undefined" && titleLive()) {
    const started = { n: 0 };
    await ShareCode.consumeHash({
      valid: titleLive,
      apply: (decoded) => ShareCode.apply(decoded, {
        store: G.store,
        startRace: () => { started.n++; },
        selectTeam: (teamId) => {
          const ti = Teams.LIST.findIndex((t) => t.id === teamId);
          if (ti >= 0) G.teamIdx = ti;
        },
        openGarage: (from) => { if (G.openGarage) G.openGarage(from || "share"); },
        openDaily: (decoded) => {
          G.flow = "gp"; G.session = "tt";
          const today = DailyChallenge.dayKey();
          if (decoded.day === today) G.daily.select(decoded.day);
          else G.daily.select(today);
          G.buildSelect();
          vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
          G.scheduleFlybyTrack(true);
        },
        today: DailyChallenge.dayKey(),
        openTrack: (decoded) => {
          const idx = Tracks.LIST.findIndex((entry) => entry.id === decoded.track);
          if (idx < 0) return;
          G.flow = "gp"; G.session = "tt";
          G.daily.stop();
          restoreFreePlaySelection();
          G.trackIdx = idx;
          G.buildSelect();
          vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
          G.scheduleFlybyTrack(true);
        },
      }),
      notify: (message, result) => {
        if (started.n) Log.warn("game", "share apply tried startRace — ignored");
        G.announce(message, result && result.ok ? 3 : 4, result && result.ok ? "info" : "warning");
      },
    });
  }
  return shared;
}
consumeGhostHash();
DeepLink.create(G);
window.addEventListener("hashchange", consumeGhostHash);
const htpClose = $("htp-close");
if (htpClose) {
  htpClose.addEventListener("click", () => {
    if (/^#htp-/.test(location.hash || "")) {
      try { history.replaceState(history.state, "", location.pathname + location.search); } catch (_) {  }
    }
  });
}
$("mb-season").onclick = () => {
  G.flow = "season"; G.session = "race";
  G.season = SeasonCal.load();
  let ti = SeasonCal.trackIndex(G.season.round);
  if (ti < 0) {
    const last = SeasonCal.rounds() - 1;
    ti = last >= 0 ? SeasonCal.trackIndex(last) : 0;
  }
  G.trackIdx = ti;
  G.buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);
};
function openCareer() {
  G.flow = "career"; G.session = "race";
  deps.selectCareer();
  vt(() => { careerUi.openHub(); els.overlay.hidden = true; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);
}
function openCareerSlots() {
  vt(() => { careerUi.openSlots("title"); els.overlay.hidden = true; });
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
