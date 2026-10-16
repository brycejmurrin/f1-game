/* Apex 26 — TitleFlow: title-menu session entry and shared ghost links.
   Existing G flow/session slots stay authoritative; selectCareer preserves entry selection semantics. */
const TitleFlow = (function () {
"use strict";
function create(G, deps) {
const { $, els } = G;
const { restoreFreePlaySelection, careerUi, refreshTitle, ensureNet } = deps;
let titleTransition = 0, titleTransitionSerial = 0;
let lobbyRequest = 0;
// Settings/Help and other title doors live outside this module and may leave
// the title visible. Capture their activation before their handlers run: BACK
// must not revive a pending lobby request. The downloaded bundle stays cached.
els.overlay.addEventListener?.("click", (event) => {
  const door = event.target.closest?.("button, a");
  if (door && (door.id.startsWith("mb-") || door.tagName === "A")) lobbyRequest++;
}, true);
function vt(fn) {
  // Normal-motion snapshots defer the DOM swap. Claim the title now, before
  // an older async link/lobby load can mistake the still-visible title for idle.
  const mine = ++titleTransitionSerial;
  titleTransition = mine;
  try {
    deps.vt(() => {
      if (titleTransition !== mine) return;   // a newer navigation owns the swap
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
  // Root VT: old title snapshot fades out before the select sheet fades in
  // (css/tokens.css ::view-transition-old/new(root)); do not overlap them.
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);   // pre-build the saved pick while the picker is read
};
// Optional markup must not turn one missing screen into a whole-app boot failure.
if ($("mb-vs")) $("mb-vs").onclick = () => {
  // The peer-to-peer lobby starts the race once both sides agree. The bundle
  // lands before the screen does; ensureNet() wires the real lobby. Flow and
  // selection are written only once it has: a refused/offline load must leave
  // the title untouched and say so.
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
  // Warm the selected circuit under the picker. Daily already pinned
  // track/weather/tod via select(); skipping the warm left START on a cold
  // Shanghai FOG compile that can burn the sheet's 30 s shader-prep wait on CI
  // (garage-out-before-card DAILY, tip 7ba546, 2026-10-11).
  G.scheduleFlybyTrack(true);
}
$("mb-tt").onclick = () => openTimeTrial(false);
async function consumeGhostHash() {
  // Re-check the complete title state after decoding too: Settings leaves the
  // title visible underneath it. A rejected async completion must also re-arm
  // BACK's retry, otherwise its preserved fragment waits forever for a reload.
  const titleLive = () => {
    // MID-RACE links wait for quitToMenu, which re-reads the intact fragment.
    if (UiLayers.inRace()) { Log.info("game", "ghost link deferred: racing"); return false; }
    const top = els.overlay.hidden ? null : UiLayers.top();
    if (titleIsLive(top)) return true;
    Log.info("game", "ghost link deferred: title not live");
    // One-shot; a re-defer re-arms it on whatever layer is then on top.
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
      if (idx < 0) return shared;   // decode already guards this; retain a safe no-op
      G.trackIdx = idx;
    }
    G.buildSelect();
    vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
    G.scheduleFlybyTrack(true);
  }
  // Setup / livery / daily envelopes on #share= — stage only, never startRace.
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
DeepLink.create(G);   // installed-icon shortcuts: ?go=race|daily|nextgp|garage
window.addEventListener("hashchange", consumeGhostHash);
// HTP section links write #htp-*; CLOSE (and Esc via data-esc-close) must drop
// a stale hash so reopen does not jump mid-pane. Keep this off game.js: that
// file's pick-tests blast radius is circuits/physics and overflows the selected gate.
const htpClose = $("htp-close");
if (htpClose) {
  htpClose.addEventListener("click", () => {
    if (/^#htp-/.test(location.hash || "")) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (_) { /* file:/opaque */ }
    }
  });
}
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
  // vt: the same staggered root fade RACE / SEASON / GARAGE take off the title.
  vt(() => { careerUi.openHub(); els.overlay.hidden = true; });
  if (G.soundOn) GameAudio.uiSelect();
  G.scheduleFlybyTrack(true);   // the hub's next round, pre-built behind it
}
// The same entry, stopping at the slot picker. Deliberately does NOT engage the
// career flow: nothing has been chosen yet, so a save's rules must not be live —
// the picker's own handler calls openCareer() once a slot is taken.
// Pass "title" so Esc/BACK returns here, never to the CAREER hub (U01).
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
