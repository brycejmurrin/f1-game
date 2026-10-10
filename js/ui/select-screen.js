/* Apex 26 — the select-screen UI for js/game.js: the circuit picker as a flag
   strip over a hero (the in-game still of the chosen circuit with its lap
   outline drawn on top and its numbers beside it), plus the fullscreen
   circuit-detail modal. The screen answers WHERE you race and nothing else —
   who you are and what you drive belong to the garage (js/garage/setup-sheet.js),
   opened from YOUR CAR. NEXT goes to race settings.
   Also owns the shared team-picker sheet (#teampicker) that the garage opens.
   Pure DOM; live selection state comes through the ctx façade G handed to
   Menus.create(G). Consumes globals Teams, Tracks, TrackMaps, Flags, SeasonCal
   (the season's calendar is the PLAYER's now — length, circuits and order).
   Must load BEFORE js/game.js (see index.html). */
const Menus = (function () {
  "use strict";

function create(G) {
Log.info("ui", "Menus.create");
// Stable helpers from the game.js closure.
// No tickUi: every handler here already plays uiSelect, and a tickUi after it
// was a second blip on one click (the track and team tiles).
const { $, els, store, cssCol, fmtTime, ttBoard, scheduleFlybyTrack } = G;

// localStorage can be unavailable even while the game remains fully playable.
// Surface that distinction globally: the in-memory cache preserves this
// session, but the player must know a reload will discard it and must have a
// recovery path that never exports credentials or unrelated preferences.
// The banner is static shell DOM (index.html #save-warning). It answers ONE
// question — did a WRITE fail? — through store.writeFailed(): a corrupt key
// that fails to parse also sets store.broken, and that used to raise a
// session-long SESSION ONLY banner over a save that was writing fine.
const saveWarning = $("save-warning");
const saveWarningDetail = $("save-warning-detail");
const saveDismiss = $("save-dismiss");
// store.writeFailed() (js/core/store.js, lane L3): the latest failed write whose
// key has not since been written durably, or null. Before it exists, the old
// `broken` flag is the only signal there is.
const writeFailed = () => (store.writeFailed ? store.writeFailed() : store.broken);
// Spoken ONCE per failure through #announce-live, the always-present polite
// region — via LiveRegion (js/ui/live-region.js), its ONE writer, at SAVE
// priority: a radio call or a flag in the same tick queues behind or ahead of
// it instead of overwriting it. A bare write only where that module is absent.
let saveSpoken = false;
const sayOnce = (text) => {
  const live = $("announce-live");
  if (saveSpoken || !live) return;
  saveSpoken = true;
  if (typeof LiveRegion !== "undefined") LiveRegion.say(text, "save");
  else live.textContent = text;
};
const setSaveCollapsed = (on) => {
  if (!saveWarning) return;
  if (on) saveWarning.dataset.collapsed = ""; else delete saveWarning.dataset.collapsed;
  if (saveDismiss) {
    saveDismiss.setAttribute("aria-expanded", on ? "false" : "true");
    saveDismiss.textContent = on ? "NOT SAVING" : "DISMISS";
  }
};
const showSaveWarning = (reason) => {
  if (!saveWarning) return;
  saveWarning.hidden = false;
  saveWarningDetail.textContent = "Progress will be lost when this page closes or reloads"
    + (reason ? " (" + reason + ")." : ".");
  sayOnce("Saving unavailable. Progress will be lost when this page closes or reloads.");
};
const hideSaveWarning = () => {
  if (!saveWarning) return;
  saveWarning.hidden = true;
  setSaveCollapsed(false);   // a LATER failure is new news: it opens in full
  saveSpoken = false;
};
if (saveDismiss) saveDismiss.onclick = () => setSaveCollapsed(saveDismiss.getAttribute("aria-expanded") === "true");
if (writeFailed()) showSaveWarning(writeFailed());
store.subscribe((change) => {
  if (change && change.local && change.durable === false) showSaveWarning(change.reason);
});

const retrySave = () => {
  const results = [];
  if (typeof Career !== "undefined" && Career.data && Career.data()) results.push(Career.saveStatus());
  if (G.season && !(typeof Career !== "undefined" && Career.inCareer && Career.inCareer()))
    results.push(SeasonCal.save(G.season));
  // Career/season above re-save their CURRENT state; whatever else the outage
  // refused (garage, settings, leaderboards) is rewritten from the store's own
  // record of failed writes, after them so a stale value never lands on top.
  const rest = store.retryFailed();
  if (rest.retried) results.push(rest);
  // With no active championship and nothing else pending, use a harmless probe
  // so Settings-only users can still verify that storage became available again.
  if (!results.length) results.push(store.write("saveProbe", { at: Date.now() }));
  const durable = results.every((r) => r && r.durable);
  if (durable) {
    // Every failed key just landed durably (a write that lands drops its entry
    // from store.writeFailed()), so RETRY only has `broken` left to clear.
    store.broken = null;
    hideSaveWarning();
    if (G.announce) G.announce("SAVE RESTORED");
  } else showSaveWarning((results.find((r) => r && r.reason) || {}).reason || store.broken);
};
const exportRecovery = () => {
  const payload = {
    format: "apex26-recovery-v1",
    exportedAt: new Date().toISOString(),
    build: (window.__APEX_BUILD || null),
    career: typeof Career !== "undefined" && Career.data ? Career.data() : null,
    season: G.season || null,
    persistence: { durable: false, reason: writeFailed() || store.broken || "unknown" },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "apex26-recovery-" + Date.now() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  // 10 s, matching js/ui/settings-export.js and js/agent/apex.js. A 0 ms revoke
  // races the browser's own fetch of the blob it was just handed: Safari and
  // several Android browsers read the href asynchronously after click(), so the
  // URL can be dead before the save starts. This is SAVE RECOVERY — the one
  // export path a player whose localStorage has failed still has — so losing
  // the download here loses the save.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  if (G.announce) G.announce("RECOVERY EXPORTED");
};
if ($("save-retry")) $("save-retry").onclick = retrySave;
if ($("save-export")) $("save-export").onclick = exportRecovery;

// Progressive-enhancement screen swap: run a DOM change inside a native
// same-document View Transition when the browser supports it (Baseline 2025)
// for a free crossfade, else run it plainly. Zero dependency, purely visual —
// the swap always happens; only the animation is enhanced. Reduced-motion is
// honoured by the ::view-transition CSS in css/tokens.css.
//
// The `applied` guard + timeout are not decoration: a fire-and-forget
// startViewTransition can DROP its update callback when the page is not actively
// compositing (reproduced opening the track-detail modal from the static select
// screen, where no game-loop frames are running — the modal simply never
// appeared). The safety net applies the DOM change directly if the transition
// has not run it within a couple of frames; the guard makes a double-fire a
// no-op if the transition callback later runs after all.
//
// Reduced-motion skips the whole mechanism, not just the animation. The CSS in
// css/tokens.css already cancels the crossfade, but startViewTransition still
// SNAPSHOTS the page either way — and on a software rasteriser that capture
// blocks the main thread for seconds (measured 3.2 s per swap on SwiftShader;
// even the 60 ms direct-apply net below can't fire while the thread is held).
// Under reduce the transition would contribute nothing visual anyway, so the
// swap goes direct. The test suite pins reducedMotion:"reduce" and rides this.
// So does MOTION: REDUCED (html[data-motion], js/ui/title-fx.js).
const vtReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const vt = (fn) => {
  if (!document.startViewTransition || vtReduce.matches
    || document.documentElement.dataset.motion === "reduce") { fn(); return; }
  let applied = false;
  const run = () => { if (applied) return; applied = true; fn(); };
  try {
    const t = document.startViewTransition(run);
    // Skipped or timed-out snapshots reject ready/finished independently.
    // Animation failure must not raise the app's full-screen crash overlay.
    if (t) for (const p of [t.ready, t.finished, t.updateCallbackDone]) if (p) p.catch(() => {});
  } catch (_) { run(); return; }
  setTimeout(run, 60);
};

// Full-screen team picker: the twelve-way team choice. Its ONE host is the
// garage's TEAM & DRIVER tab — the garage is the one place a team is chosen.
const teamPicker = () => $("teampicker");
// After TopModal's mirror (a MutationObserver microtask queued by the `hidden`
// write) has run showModal()/close(): FIFO, so a later microtask sees its result.
const afterMirror = (fn) => (typeof queueMicrotask === "function" ? queueMicrotask(fn) : Promise.resolve().then(fn));
let previewOpenRaf = 0;

function fittedLivery(t) {
  const id = store.get("livery." + t.id, "default");
  const custom = store.get("livery.custom." + t.id, []) || [];
  const list = ((typeof Liveries !== "undefined" && Liveries.forTeam) ? Liveries.forTeam(t) : []).concat(custom);
  return list.find((l) => l.id === id) || list[0] || null;
}

// "#12 Senna", or just "Senna" where the number is not a fact.
//
// ONLY for legends. Ten of the twelve have no SOURCED racing number — only
// Senna's 12 and Mansell's 5 are — and js/data/legends.js parks the rest at 1
// as a neutral placeholder rather than inventing one, so the tile printed "#1"
// ten times as if it meant something. A real driver's number IS a fact and is
// always shown: #1 Norris is the reigning champion, not a missing value, and an
// `n > 1` rule applied to everyone would have quietly hidden it.
function driverLabel(d, placeholderNum) {
  const last = d.name.split(" ").pop();
  return (placeholderNum && !(d.num > 1)) ? last : "#" + d.num + " " + last;
}

function teamSwatch(t) {
  const sw = document.createElement("span");
  sw.className = "tm-colour";
  const liv = fittedLivery(t);
  // A team may wear a crest that is not its own id: a LEGENDS car carries the
  // marque badge of the car it is (Ferrari for Schumacher, McLaren for Senna),
  // and legends whose marque has no crest in js/car/crest-paths.js carry none
  // rather than a borrowed one. `crest` is absent on every other team, so they
  // keep resolving by id exactly as before.
  const crestId = t.crest || t.id;
  const c1 = (liv && liv.c1) || t.color;
  const c2 = (liv && liv.c2) || t.color2 || t.color;
  // Fitted scheme, not the factory pair: a player who painted the car should
  // see that paint on the TEAM tile. The lockup is the same crest the garage
  // wall and the car share.
  if (typeof LiveryTex !== "undefined" && LiveryTex.paintSwatch) {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 48;
    c.setAttribute("aria-hidden", "true");
    LiveryTex.paintSwatch(c.getContext("2d"), crestId, liv || { c1, c2 }, c.width, c.height);
    sw.appendChild(c);
  } else {
    sw.style.background = "linear-gradient(135deg," + cssCol(c1) + " 62%," + cssCol(c2) + " 62%)";
  }
  sw.setAttribute("aria-hidden", "true");
  return sw;
}

/* Open/close the team picker (the garage's TEAM tab is its one caller). */
function setTeamPicker(open) {
  // Build on open, not in buildSelect(): opened from the garage straight off
  // the title screen, buildSelect has never run and the sheet would be empty.
  Log.info("ui", "Menus.setTeamPicker " + (open ? "open" : "close"));
  if (open) buildTeamPicker();
  teamPicker().hidden = !open;
  if (open) {
    ScrollFadeRefresh();
    // FOCUS THE CURRENT TEAM, not CLOSE (#tp-close carries the sheet's
    // autofocus): the keyboard and pad start where the player already is, as
    // the duel picker does. A microtask, so it runs after TopModal's mirror
    // has called showModal() (which applies autofocus).
    afterMirror(() => {
      const target = els.selTeams.querySelector(".team-tile.active");
      if (target && !teamPicker().hidden) target.focus();
    });
  }
}

function buildTeamPicker() {
  els.selTeams.textContent = "";
  Teams.LIST.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "team-tile" + (i === G.teamIdx ? " active" : "");
    // A visual outline is not a state a screen reader can see; role=option +
    // aria-selected is what makes the current team announce as current.
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", i === G.teamIdx ? "true" : "false");
    const body = document.createElement("span");
    body.className = "tm-body";
    const name = document.createElement("span");
    name.className = "tm-name"; name.textContent = t.name;
    const sub = document.createElement("span");
    sub.className = "tm-sub";
    // Whose seats are already spoken for, so it reads BEFORE you tap rather
    // than only on the driver chips one screen later. Empty off-line, which is
    // what keeps every solo mode exactly as it was.
    const taken = G.peerSeats ? G.peerSeats() : [];
    const isTaken = (si) => taken.some((s) => s.team === t.id && s.driver === si);
    // ONE LINE, and a team with a long roster must not be allowed to write a
    // paragraph into it. LEGENDS carries all twelve drivers so the driver picker
    // can offer them, and joining all twelve here overflowed the tile and pushed
    // the card over its neighbour (seen on a real screen, 2026-09-17): the grid
    // is built for the two names every other team has.
    //
    // So the Legends tile says WHO YOU ARE and WHAT YOU ARE IN, which is the
    // useful thing anyway — the roster lives one tap away in the driver picker.
    const seatName = (d, si) => driverLabel(d, !!t.legends) + (isTaken(si) ? " (TAKEN)" : "");
    if (t.legends) {
      const seat = Math.min(Math.max(G.teamIdx === i ? (G.driverIdx | 0) : 0, 0), t.drivers.length - 1);
      const d = t.drivers[seat];
      sub.textContent = d ? seatName(d, seat) + "  ·  " + (t.engine || "") : "";
    } else {
      sub.textContent = t.drivers.map(seatName).join("  ·  ");
    }
    body.append(name, sub);
    b.append(teamSwatch(t), body);
    b.onclick = () => {
      // Same as the circuit row: the decision this sheet exists for clicked
      // silently while the card that OPENED it did not.
      if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiSelect();
      // The old team's driver index means nothing here, and a flat seat 0 may
      // be the other player's seat in a friend race. Take the first seat nobody holds; the
      // seat-clash rule in js/net/lobby.js catches the simultaneous case.
      let seat = 0;
      while (seat < t.drivers.length - 1 && isTaken(seat)) seat++;
      G.teamIdx = i; G.driverIdx = seat; store.set("team", i);
      // The team-accent skin (--accent) was only ever written by the HUD's
      // first race tick, so the garage kept the LAST race's colours.
      try { document.documentElement.dataset.team = t.id; } catch (_) { /* no DOM */ }
      store.set("driver", seat);
      setTeamPicker(false);
      // The garage (the one host) repaints its own 3D car for free —
      // getSetupPreviewMesh() is keyed on the team id.
      G.buildSetup();
      // buildSetup() replaced #cs-team-card, the control that opened this
      // sheet, so the dialog's close() focus restore aims at a dead node and
      // lands on <body>. Put focus on the NEW card once the close has run
      // (TopModal's mirror closes in a microtask queued before this one).
      afterMirror(() => {
        const card = $("cs-team-card");
        if (card && card.isConnected && !card.disabled && teamPicker().hidden) card.focus();
      });
    };
    els.selTeams.appendChild(b);
  });
}

// Panes only measure themselves when something tells them to; opening a sheet
// is exactly such a moment (see js/ui/scroll-fade.js).
// The track-detail map's size observer (openTrackDetail). Module-scoped so a
// re-open disconnects the previous one instead of stacking a fresh observer —
// and a stale closure over the PREVIOUS circuit — on every visit.
let detailRO = null;

const ScrollFadeRefresh = () => { if (window.ScrollFade) window.ScrollFade.refresh(); };

// Circuit list filter: all / championship calendar / retired classics.
// Persisted so a player who only races classics does not re-tap every open.
// FAVOURITE CIRCUITS (apex26.favTracks, an array of track ids) are HIDDEN UNTIL
// USED: no chip, no badge and nothing written until a circuit is starred in
// CIRCUIT DETAIL (or with F on a tile), so the shipped #select pixels hold.
// Ids, not indices — Tracks.LIST reorders; an id no longer in it is ignored.
const favList = () => {
  const v = store.get("favTracks", null);
  return Array.isArray(v) ? v.filter((id) => Tracks.LIST.some((t) => t.id === id)) : [];
};
let trackFilter = store.get("trackFilter", "all");
if (trackFilter !== "all" && trackFilter !== "season" && trackFilter !== "classic" && trackFilter !== "daily-open" && trackFilter !== "custom" && trackFilter !== "fav") trackFilter = "all";
// MY CIRCUITS: the player's own designs (js/editor/custom-tracks.js, `custom: true`,
// appended after the 52). Like FAVOURITES the chip exists only once there is one.
const trackFilters = [["all", "ALL"], ["season", "SEASON"], ["classic", "CLASSICS"], ["custom", "MY CIRCUITS"], ["fav", "♥ FAVOURITES"], ["daily-open", "DAILY OPEN"]];
let trackQuery = "";
const hasCustom = () => Tracks.LIST.some((t) => t.custom);
const practicePick = () => typeof UiExperience !== "undefined" && UiExperience.isPracticePick && UiExperience.isPracticePick();
const leavePracticePick = () => {
  if (typeof UiExperience !== "undefined" && UiExperience.leavePracticePick) UiExperience.leavePracticePick();
};
const ttChrome = () => G.timeTrial && !practicePick();
const visibleTrackFilter = () => {
  if (((!G.timeTrial || practicePick()) && trackFilter === "daily-open") || (trackFilter === "fav" && !favList().length) || (trackFilter === "custom" && !hasCustom())) return "all";
  // The ACTIVE tile is never filtered out: RACE from the designer lands here on
  // a custom circuit whatever chip the player last left pressed.
  const cur = Tracks.LIST[G.trackIdx];
  if (cur && cur.custom && trackFilter !== "all" && trackFilter !== "custom") return "all";
  return trackFilter;
};

/** Star or unstar a circuit; the strip and its filter bar are rebuilt so the
 *  badge and the FAVOURITES chip follow. The last one out deletes the key (and
 *  drops a FAVOURITES filter back to ALL): an empty list is the shipped state. */
function toggleFav(id) {
  const list = favList();
  const on = !list.includes(id);
  const next = on ? list.concat(id) : list.filter((x) => x !== id);
  if (next.length) store.set("favTracks", next);
  else {
    // undefined removes the key through write() (rev + notify). rawDel skipped
    // both, so subscribers / rev-memoized UI never heard "favourites emptied".
    store.set("favTracks", undefined);
    if (trackFilter === "fav") { trackFilter = "all"; store.set("trackFilter", "all"); }
  }
  if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiSelect();
  if (els.select && !els.select.hidden) buildSelect();
  return on;
}

// F on a focused circuit tile stars it — the keyboard's way to the CIRCUIT
// DETAIL toggle. Keydown on the strip, so the search field (on the shelf, not
// in the strip) never sees it; the season calendar's tiles are not buttons.
els.selTracks.addEventListener("keydown", (e) => {
  if ((e.key !== "f" && e.key !== "F") || e.ctrlKey || e.metaKey || e.altKey) return;
  const row = e.target && e.target.closest ? e.target.closest(".track-row") : null;
  if (!row || row.tagName !== "BUTTON" || els.selTracks.dataset.mode === "season") return;
  const t = Tracks.LIST[+row.dataset.trackIdx];
  if (!t) return;
  e.preventDefault();
  // A HELD F is one star: its auto-repeat flipped the favourite back and forth
  // and re-announced on every repeat.
  if (e.repeat) return;
  const on = toggleFav(t.id);
  if (G.announce) G.announce(on ? t.name.toUpperCase() + " ♥ FAVOURITE" : t.name.toUpperCase() + " REMOVED FROM FAVOURITES");
  const again = els.selTracks.querySelector('.track-row[data-track-idx="' + row.dataset.trackIdx + '"]')
    || els.selTracks.querySelector(".track-row");
  if (again) again.focus();
});

// ESCAPE IN THE SEARCH FIELD CLEARS THE SEARCH FIRST. TopModal's Escape
// (js/ui/modal.js, document/capture) presses #select's BACK door, so with text
// typed it threw away the whole picker instead of the query. Window CAPTURE,
// not a listener on the input: document-capture runs before anything at the
// target, so only window-capture is early enough. An empty field (or an IME
// composition, where Escape cancels the candidate) lets the key through.
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.isComposing || e.defaultPrevented) return;
  const t = e.target;
  if (!t || t.id !== "sel-track-search" || !t.value) return;
  t.value = "";
  applyTrackSearch("");
  e.preventDefault();
  e.stopPropagation();
}, true);

function applyTrackSearch(value) {
  trackQuery = String(value || "").trim().toLocaleLowerCase();
  const rows = Array.from(els.selTracks.querySelectorAll(".track-row"));
  for (const row of rows) row.hidden = !!trackQuery && !row.dataset.search.includes(trackQuery);
  // A divider introduces the RUN of tiles that follows it (Tracks.LIST interleaves
  // the groups, so one group owns several dividers): show it only while a tile in
  // ITS run survives. Testing the whole group left every SEASON divider standing
  // as an orphan whenever any season circuit matched ("spa" also finds Spain).
  for (const head of els.selTracks.querySelectorAll(".track-group-head")) {
    let live = false;
    for (let el = head.nextElementSibling; el && !el.classList.contains("track-group-head"); el = el.nextElementSibling) {
      if (el.classList.contains("track-row") && !el.hidden) { live = true; break; }
    }
    head.hidden = !live;
  }
  const empty = document.getElementById("sel-track-empty");
  if (empty) empty.hidden = rows.some((row) => !row.hidden);
  ScrollFadeRefresh();
}

function trackInFilter(t, filter, favs) {
  if (!t) return false;
  if (filter === "season") return !(t.classic || t.custom);
  if (filter === "classic") return !!t.classic;
  if (filter === "custom") return !!t.custom;
  if (filter === "fav") return (favs || favList()).includes(t.id);
  if (filter === "daily-open") return !!(G.daily && t.id === G.daily.plan().trackId);
  return true;
}

// CLASSICS (and the other chips) hide tiles that are not in the group. The
// hero still read Tracks.LIST[G.trackIdx], so Bahrain stayed in the detail
// panel with nothing highlighted (apex10). Snap to the first tile that the
// chip actually shows.
function snapTrackToFilter() {
  const filter = visibleTrackFilter();
  const favs = favList();
  if (trackInFilter(Tracks.LIST[G.trackIdx], filter, favs)) return;
  const i = Tracks.LIST.findIndex((t) => trackInFilter(t, filter, favs));
  if (i < 0) return;
  G.trackIdx = i;
  store.set("trackId", Tracks.LIST[i].id);
  store.set("track", i);
}

function setTrackFilter(id, focus, keepDaily) {
  trackFilter = id;
  if (id !== "daily-open") store.set("trackFilter", id);
  if (!keepDaily && G.daily && G.daily.isActive()) G.daily.stop();
  if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiSelect();
  snapTrackToFilter();
  vt(() => {
    buildSelect();
    // THE BAR IS NOT INSIDE THE STRIP. mountToolbar puts it on the SHELF, as a
    // sibling of #sel-tracks and not a child, precisely so it does not scroll
    // sideways with the tiles — and this read searched the strip, found
    // nothing, and the `?.` swallowed it. Every arrow press therefore rebuilt
    // the bar and left focus on <body>: the filter changed, the keyboard user
    // lost their place, and the next arrow key had nothing to act on. Measured
    // before the fix: aria-pressed moved to "season" while document.activeElement
    // was BODY. Red since the assertion was written (menu-keyboard.spec.js,
    // "circuit filter tabs ... expose distinct semantics").
    if (focus) mountedToolbar()?.querySelector('[data-filter="' + id + '"]')?.focus();
  });
}

function trackFilterBar() {
  const bar = document.createElement("div");
  bar.id = "sel-track-filter";
  bar.className = "sel-chip-row";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Circuit list controls");
  const hasFav = favList().length > 0;
  const filters = trackFilters.filter(([id]) => (id !== "daily-open" || ttChrome()) && (id !== "fav" || hasFav) && (id !== "custom" || hasCustom()));
  filters.forEach(([id, label], index) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sel-chip" + (visibleTrackFilter() === id ? " active" : "");
    b.dataset.filter = id;
    // Mirror onto the attribute: setTrackFilter restores focus via
    // querySelector('[data-filter=…]'), and a plain dataset write is enough in
    // browsers but not in the mini-dom unit harness (no dataset↔attr sync).
    b.setAttribute("data-filter", id);
    b.setAttribute("aria-pressed", visibleTrackFilter() === id ? "true" : "false");
    b.tabIndex = visibleTrackFilter() === id ? 0 : -1;
    b.textContent = label;
    b.onclick = (e) => {
      e.stopPropagation();
      // buildSelect() replaces the bar, so the pressed chip is destroyed. Arrow
      // keys already pass focus:true; Enter/Space (and pointer click) used to
      // leave document.activeElement on <body>, killing the roving tabindex.
      // Always restore onto the rebuilt chip for this filter.
      if (id === "daily-open") {
        G.daily.select(undefined, "open");
        leavePracticePick();
        setTrackFilter(id, true, true);
      } else setTrackFilter(id, true, false);
    };
    b.onkeydown = (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = (index + 1) % filters.length;
      else if (e.key === "ArrowLeft") next = (index - 1 + filters.length) % filters.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = filters.length - 1;
      if (next == null) return;
      e.preventDefault(); e.stopPropagation();
      const nextId = filters[next][0];
      if (nextId === "daily-open") {
        G.daily.select(undefined, "open");
        leavePracticePick();
        setTrackFilter(nextId, true, true);
      } else setTrackFilter(nextId, true, false);
    };
    bar.appendChild(b);
  });
  // TODAY'S CHALLENGE — Time Trial only. Practice reuses the TT picker
  // under the hood but must not wear this chrome (or keep the Practice
  // brief up after a Daily arm). NEXT → settings → go is the start grammar.
  if (ttChrome() && G.daily) {
    const p = G.daily.plan();
    const done = G.daily.today();
    const b = document.createElement("button");
    b.type = "button";
    const current = G.daily.current();
    const selected = !!current && current.day === p.day && current.class === "standard";
    b.className = "sel-chip" + (selected ? " active" : "");
    b.id = "sel-daily";
    const extraBits = [p.weather.toUpperCase(), p.tod.toUpperCase()];
    if (done && done.best != null) extraBits.push("ALL SETUPS ★ " + fmtTime(done.best));
    b.textContent = (selected ? "DAILY STANDARD" : "TODAY'S CHALLENGE") + " · " + p.trackName.toUpperCase();
    const extra = document.createElement("span");
    extra.textContent = " · " + extraBits.join(" · ");
    b.appendChild(extra);
    b.setAttribute("aria-label", "Today: " + p.trackName + " · " + extraBits.join(" · "));
    b.setAttribute("aria-pressed", selected ? "true" : "false");
    b.title = "Today's challenge (" + p.day + " UTC): fixed McLaren works build and physics; input assists are recorded separately";
    b.onclick = (e) => {
      e.stopPropagation();
      G.daily.select();
      leavePracticePick();
      setTrackFilter("all", false, true);
    };
    bar.insertBefore(b, bar.firstChild);
  }
  const search = document.createElement("input");
  search.id = "sel-track-search";
  search.type = "search";
  search.value = trackQuery;
  // "Search circuit or country" truncated inside the pinned 12rem compact
  // width ("Search circuit or countr"). The short form fits every shape;
  // country search still works (data-search carries it) and the aria-label
  // below still says circuits.
  search.placeholder = "Search circuit";
  search.setAttribute("aria-label", "Search circuits");
  search.autocomplete = "off";
  search.oninput = () => applyTrackSearch(search.value);
  bar.appendChild(search);
  return bar;
}

// One tile per circuit: a flag over a name. `.track-row` is the picker's
// row contract (aria-label = the circuit name, aria-pressed = chosen, hidden
// when a search excludes it), so the keyboard walker, the gamepad and every
// spec that names it work on it. data-kind carries night/street/classic for the
// stylesheet; the .trb badges stay in the DOM (hidden in the strip) because the
// SEASON filter's "no classics shown" contract is asserted on them.
function trackTile(t, i, opts) {
  const row = document.createElement(opts && opts.readOnly ? "div" : "button");
  if (!(opts && opts.readOnly)) row.type = "button";
  row.className = "track-row" + (opts && opts.active ? " active" : "");
  row.dataset.trackIdx = String(i);
  row.dataset.kind = t.custom ? "custom" : t.classic ? "classic" : t.night ? "night" : t.street ? "street" : "season";
  row.setAttribute("aria-label", t.name);
  // The country is the tooltip: five USA tiles and three Italian ones need
  // it, and the strip has no room for a second line of text under each flag.
  // Season calendar tiles are read-only and packed: a native `title` pops
  // over the neighbour's name (Baku over Mexico). data-tip paints above.
  const tip = t.name + (t.country ? " · " + t.country : "");
  if (opts && opts.readOnly) row.dataset.tip = tip;
  else row.title = tip;
  const fl = document.createElement("span");
  fl.className = "track-row-meta";
  fl.innerHTML = Flags.svg(t.country);
  row.appendChild(fl);
  const nm = document.createElement("span");
  nm.className = "track-row-name";
  nm.textContent = t.name;
  if (t.night) { const b = document.createElement("span"); b.className = "trb trb-night"; b.textContent = "NIGHT"; nm.appendChild(b); }
  if (t.street) { const b = document.createElement("span"); b.className = "trb trb-street"; b.textContent = "STREET"; nm.appendChild(b); }
  if (t.classic) { const b = document.createElement("span"); b.className = "trb trb-classic"; b.textContent = "CLASSIC"; nm.appendChild(b); }
  if (t.custom) { const b = document.createElement("span"); b.className = "trb trb-custom"; b.textContent = "CUSTOM"; nm.appendChild(b); }
  row.appendChild(nm);
  return row;
}

// The toolbar lives on the SHELF, before the strip — a sibling of #sel-tracks,
// not a child, because the strip scrolls sideways and the filter must not.
/** The live toolbar, wherever mountToolbar put it — see setTrackFilter. */
function mountedToolbar() {
  return els.selTracks.parentNode.querySelector("#sel-track-filter");
}

function mountToolbar(bar) {
  const shelf = els.selTracks.parentNode;
  const old = shelf.querySelector("#sel-track-filter");
  if (old) old.remove();
  if (bar) shelf.insertBefore(bar, els.selTracks);
}

// Bring the chosen tile into the strip's viewport — on open (the strip has no
// box yet, hence the caller's rAF), on a filter change, on a season advance.
function revealActiveTile() {
  const on = els.selTracks.querySelector(".track-row.active");
  if (on && on.scrollIntoView) on.scrollIntoView({ inline: "center", block: "nearest" });
}

function buildSelect() {
  // ONE QUESTION: WHERE. WHO and WHAT are chosen in the garage via YOUR CAR.
  // NEXT opens race settings. The only thing that differs between modes here
  // is what the screen is called and what the foot button promises next.
  const room = !!G.netRoom;
  const seasonComplete = !room && G.seasonMode && G.season && !SeasonCal.canRace(G.season);
  const practice = practicePick();
  // NEXT opens race settings. YOUR CAR is the garage door beside it.
  els.selGo.textContent = seasonComplete ? "VIEW FINAL STANDINGS"
    : practice ? "PRACTICE SETUP"
    : G.timeTrial ? "SESSION SETUP"
    : "RACE SETUP";
  els.selGo.dataset.seasonComplete = seasonComplete ? "1" : "";
  const selCar = $("sel-car");
  if (selCar) {
    selCar.hidden = seasonComplete || room;
    const current = $("sel-car-current"), team = Teams.LIST[G.teamIdx];
    if (current) current.textContent = team ? team.name.toUpperCase() : "CURRENT CAR";
    selCar.setAttribute("aria-label", "Change car" + (team ? ": " + team.name : ""));
  }
  const count = $("sel-track-count");
  if (count) count.textContent = G.seasonMode ? "SWIPE ROUNDS →" : Tracks.LIST.length + " CIRCUITS · MORE →";
  els.selTitle.textContent = room ? "THE RACE"
    : seasonComplete ? "SEASON COMPLETE"
    : G.seasonMode ? "SEASON — ROUND " + ((G.season && G.season.round || 0) + 1)
    : practice ? "PRACTICE"
    : G.timeTrial ? "TIME TRIAL" : "GRAND PRIX";
  els.selTrackSection.hidden = false;
  if (els.selCircuitLabel) els.selCircuitLabel.textContent = G.seasonMode ? "NEXT RACE" : "CIRCUIT";
  els.selTracks.textContent = "";
  els.selTracks.dataset.mode = G.seasonMode ? "season" : "pick";
  if (G.seasonMode) {
    // THE STRIP IS THE CALENDAR: every round as a flag, raced rounds dimmed,
    // the next race lit. Read-only — the calendar decides where you race, so
    // the tiles are not buttons. The way in to SEASON SETUP is the one control
    // on the shelf. Built here rather than put in index.html so it exists ONLY
    // in the season branch — #select's pixel golden is captured through GRAND
    // PRIX (tests/specs/menu-baseline.spec.js), and a button in the shell
    // would have moved it.
    const bar = document.createElement("div");
    bar.id = "sel-track-filter";
    bar.className = "sel-chip-row";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Season controls");
    if (seasonComplete) {
      const done = document.createElement("div");
      done.className = "season-upcoming-head";
      done.textContent = "ALL " + SeasonCal.rounds() + " ROUNDS COMPLETE";
      bar.appendChild(done);
    }
    const custom = document.createElement("button");
    custom.id = "sel-customise";
    custom.className = "sel-chip";
    custom.type = "button";
    custom.textContent = seasonComplete ? "START NEW SEASON" : "CUSTOMISE SEASON";
    custom.onclick = (e) => { e.stopPropagation(); G.openSeasonSetup(); };
    bar.appendChild(custom);
    mountToolbar(bar);
    const rnd = (G.season && G.season.round || 0);
    for (let r = 0; r < SeasonCal.rounds(); r++) {
      const t = SeasonCal.track(r);
      if (!t) continue;
      const i = Tracks.LIST.indexOf(t);
      const row = trackTile(t, i, { readOnly: true, active: !seasonComplete && r === rnd });
      if (r < rnd || seasonComplete) row.dataset.done = "1";
      if (!seasonComplete && r === rnd) row.setAttribute("aria-current", "step");
      const rn = document.createElement("span");
      rn.className = "sur-rnd";
      rn.textContent = "R" + (r + 1);
      row.insertBefore(rn, row.firstChild);
      els.selTracks.appendChild(row);
    }
    updateTrackPreview();       // …which also writes the "Round n of N" caption
  } else {
    mountToolbar(trackFilterBar());
    // Two groups: the championship calendar, then the retired circuits. Only the
    // divider changes — every tile is a normal, selectable circuit either way.
    // Filter chips (ALL / SEASON / CLASSICS) hide a group rather than renumber
    // Tracks.LIST — selection still indexes into the full list.
    snapTrackToFilter();
    const favs = favList();
    const filter = visibleTrackFilter();
    Tracks.LIST.forEach((t, i) => {
      if (!trackInFilter(t, filter, favs)) return;
      const g = t.custom ? "MY CIRCUITS" : t.classic ? "CLASSIC CIRCUITS" : "CURRENT SEASON";
      // Filter chips name the view. A vertical CLASSICS/SEASON divider squeezed
      // the ~500 strip, ate end slack, and clipped the last flag (apex7/11).
      const row = trackTile(t, i, { active: i === G.trackIdx });
      row.dataset.trackGroup = g;
      row.dataset.search = [t.name, t.country, t.custom ? "custom mine" : t.classic ? "classic" : "season", t.street ? "street" : "", t.night ? "night" : ""]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      row.setAttribute("aria-pressed", i === G.trackIdx ? "true" : "false");
      if (favs.includes(t.id)) row.dataset.fav = "1";   // the ♥ badge (css/menus.css) — no DOM of its own
      if (ttChrome()) {
        const board = ttBoard(t.id);
        const rec = board.length ? board[0].t : Infinity;
        const recEl = document.createElement("span");
        recEl.className = "track-row-rec"; recEl.title = "Best across setups and conditions";
        recEl.textContent = isFinite(rec) ? "★ " + fmtTime(rec) : "—";
        row.appendChild(recEl);
      }
      row.onclick = () => {
        // The headline choice of this screen was the one silent control on it
        // (the filter chips beside it click) — a soundless tap reads as a miss.
        if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiSelect();
        const armedDaily = G.daily && G.daily.current();
        if (armedDaily && armedDaily.trackId !== t.id) {
          G.daily.stop();
          const dailyChip = mountedToolbar() && mountedToolbar().querySelector("#sel-daily");
          if (dailyChip) {
            dailyChip.classList.remove("active");
            dailyChip.setAttribute("aria-pressed", "false");
            dailyChip.firstChild.nodeValue = "TODAY'S CHALLENGE · " + G.daily.plan().trackName.toUpperCase();
          }
        }
        G.trackIdx = i;
        store.set("trackId", t.id);
        // Keep the legacy index warm for an older cached build opened after this
        // one; new builds resolve trackId first and survive list reordering.
        store.set("track", i);
        // In-place highlight — full buildSelect() was O(all tracks) + ScrollFade
        // + View Transition on every click.
        els.selTracks.querySelectorAll(".track-row").forEach((r) => {
          const on = r.dataset.trackIdx === String(i);
          r.classList.toggle("active", on);
          r.setAttribute("aria-pressed", on ? "true" : "false");
        });
        updateTrackPreview();
        // The still IS the preview — nothing is shown behind the sheet. But once
        // the player settles on a tile the circuit is PRE-BUILT hidden, so NEXT
        // opens race settings onto a ready world (js/game.js scheduleFlybyTrack).
        scheduleFlybyTrack(true);
      };
      els.selTracks.appendChild(row);
    });
    const empty = document.createElement("p");
    empty.id = "sel-track-empty";
    empty.className = "season-upcoming-head";
    empty.textContent = "NO CIRCUITS MATCH";
    empty.hidden = true;
    els.selTracks.appendChild(empty);
    applyTrackSearch(trackQuery);
    updateTrackPreview();
  }
  // Prepare the initial/current tile too, even when no tile is clicked.
  if (!seasonComplete) scheduleFlybyTrack(true);
  // buildSelect runs while #select is still hidden at every entry point, so
  // the synchronous preview pass can only draw against placeholder geometry.
  // Refit after two frames: the first exposes and classifies the sheet, the
  // second sees the settled box. ResizeObserver remains the ongoing resize
  // path, but first paint no longer depends on when a busy browser happens to
  // deliver its callback (the audit caught intermittent 1x1 maps when three
  // SwiftShader contexts competed). The strip has a box by then too, so the
  // chosen tile can be scrolled into view.
  // FIRST, A ZERO-DELAY TIMER. Anything heavy queued right after this screen
  // opens (a flyby build can hold the main thread for seconds on a slow
  // device) pushes the rAF pair and the hero's
  // ResizeObserver behind it, leaving the outline at its 520x300 attribute
  // size until then (measured 5 s on SwiftShader). A timer queued now runs
  // first, so a synchronous reveal (reduced motion, or a browser without view
  // transitions) fits on the first frame; the crossfade case still waits a
  // frame and is caught by the pair below.
  setTimeout(() => { if (els.select && !els.select.hidden) { updateTrackPreview(); revealActiveTile(); } }, 0);
  if (previewOpenRaf) cancelAnimationFrame(previewOpenRaf);
  previewOpenRaf = requestAnimationFrame(() => {
    previewOpenRaf = requestAnimationFrame(() => {
      previewOpenRaf = 0;
      if (els.select && !els.select.hidden) { updateTrackPreview(); revealActiveTile(); }
    });
  });
}

// The elevation profile chart, drawn identically in two places: the select
// screen's preview card and the TRACK DETAIL modal's sparkline. Both were
// hand-written canvas blocks that agreed line for line except for which element
// carries the hidden state and what the x variable was called — the shape where
// a fix lands in one copy and not the other (docs/ARCHITECTURE-REVIEW.md §8).
// LOCAL, not a new global: it is one screen's drawing, and Menus already owns it.
//   cv      the <canvas> to paint
//   t       the circuit def
//   showEl  the element whose `hidden` gates visibility (defaults to cv itself)
// A circuit with no profile, a degenerate one, or under 2 m of range hides the
// target and paints nothing — a flat sparkline reads as missing data either way.
function drawElevProfile(cv, t, showEl) {
  const target = showEl || cv;
  if (!cv || !target) return false;
  const py = TrackMaps.elevProfile(t);
  if (!(py && py.length > 2 && TrackMaps.elevRange(t) > 2)) { target.hidden = true; return false; }
  target.hidden = false;
  // The HTML attributes (280x36 / 240x48) were the backing store forever while
  // CSS stretched the element to width: 100% — a 600px panel scaled the buffer
  // 2.5x horizontally and 1.0x vertically, smearing the 8px labels wide. Size
  // the buffer to the measured box times the effective zoom x dpr (the house
  // minimap pattern, capped at 3), and keep drawing in CSS px via the
  // transform. Falls back to the attributes when hidden (zero box).
  const boxW = cv.clientWidth || cv.width, boxH = cv.clientHeight || cv.height;
  const ratio = Math.min(3, Math.max(1, (cv.currentCSSZoom || 1) * (window.devicePixelRatio || 1)));
  const bw = Math.max(1, Math.round(boxW * ratio)), bh = Math.max(1, Math.round(boxH * ratio));
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  const ew = boxW, eh = boxH;
  const eg = cv.getContext("2d");
  eg.setTransform(ratio, 0, 0, ratio, 0, 0);
  eg.clearRect(0, 0, ew, eh);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < py.length; i++) { if (py[i] < mn) mn = py[i]; if (py[i] > mx) mx = py[i]; }
  const span = mx - mn || 1;
  const pad = 3;
  const lo = Math.round(mn), hi = Math.round(mx);
  const fmtElev = (v) => (v > 0 ? "+" : "") + v + "m";
  const topLbl = fmtElev(hi), botLbl = fmtElev(lo);
  eg.font = "8px monospace";
  const gutter = Math.min(ew * 0.42, Math.max(28, Math.ceil(Math.max(
    eg.measureText(topLbl).width, eg.measureText(botLbl).width)) + 6));
  const plotW = Math.max(1, ew - gutter);
  const yNorm = (v) => eh - pad - ((v - mn) / span) * (eh - 2 * pad);
  // The trace is walked TWICE on purpose: once closed down to the baseline for
  // the fill, once open for the stroke, so the stroke does not draw the two
  // vertical closing edges. `i <= py.length` closes the lap back onto py[0].
  const trace = () => {
    eg.beginPath();
    for (let i = 0; i <= py.length; i++) {
      const ex = (i / py.length) * plotW;
      i === 0 ? eg.moveTo(ex, yNorm(py[0])) : eg.lineTo(ex, yNorm(py[i % py.length]));
    }
  };
  trace();
  eg.lineTo(plotW, eh); eg.lineTo(0, eh); eg.closePath();
  eg.fillStyle = "rgba(57,183,240,0.18)"; eg.fill();
  eg.strokeStyle = "rgba(57,183,240,0.7)"; eg.lineWidth = 1.5;
  trace();
  eg.stroke();
  // Signed min/max in a reserved gutter — on a short preview the two 8px
  // labels sat on the fill at the same x and the minus read as a plus
  // (Imola "+16m/+14m" for a −14 m trough).
  eg.fillStyle = "rgba(57,183,240,0.75)"; eg.textAlign = "right";
  if (eh < 28) eg.fillText(topLbl + " / " + botLbl, ew - 2, Math.max(9, eh - 2));
  else {
    eg.fillText(topLbl, ew - 2, 9);
    eg.fillText(botLbl, ew - 2, eh - 1);
  }
  return true;
}

// THE HERO: the in-game still of the chosen circuit with the lap outline over
// it, the flag + name + GP on the image, the type badges under them, and the
// numbers (location, turns, length, direction, elevation, DRS, record) beside.
/* THE HERO'S BOX IS NOT KNOWN WHEN THE SCREEN OPENS. A hidden element measures
 * 0x0, so the first useful measurement is the ResizeObserver callback after the
 * screen is shown, not the call that showed it. updateTrackPreview() runs on
 * that first (unmeasurable) pass and deliberately does not pin the canvas; the
 * observer refits once the hero has a box, and again whenever it changes — a UI
 * SIZE change, an orientation flip, js/ui/sheet-shape.js flipping data-shape — all of
 * which move the slot without changing the selected circuit.
 * TERMINATION: refit only when the box actually differs from the one last
 * fitted against (the refit pins the canvas, which cannot resize the hero — the
 * canvas is absolutely positioned — but the key guard costs nothing and keeps
 * the pattern identical to the track-detail modal's observer). */
let previewRo = null, previewHeroBox = "";
function watchHero(hero) {
  if (!hero || typeof ResizeObserver !== "function" || previewRo) return;
  previewRo = new ResizeObserver(() => {
    if (!els.select || els.select.hidden) return;
    const w = hero.clientWidth, h = hero.clientHeight;
    if (w <= 0 || h <= 0) return;
    const key = w + "x" + h;
    if (key === previewHeroBox) return;
    previewHeroBox = key;
    updateTrackPreview();
  });
  previewRo.observe(hero);
}
// OBSERVED FROM THE START, NOT AFTER A LUCKY FIRST MEASUREMENT. The old card
// attached its observer only from inside a pass that had already measured a
// box — so when the double-rAF pass below landed on a frame where the hero
// had none (measured 2026-09-05 on a compact 852x393 open: buffer still at
// its 520x300 attribute, no inline pin, until a UI SIZE change happened to
// refit it), nothing ever refitted. A ResizeObserver delivers its first
// notification when the element first has a box, which is exactly the event
// "the screen is now laid out" that a rAF only guesses at.
watchHero(document.getElementById("sel-hero"));

// The still: assets/stills/<id>.webp, one per circuit (tools/gen/track-stills.mjs).
// Hidden until decoded so a swap never flashes the previous circuit or a broken
// glyph; a circuit with no still keeps the hero's own gradient. The token
// guards a slow decode landing after the player has already moved on.
let stillToken = 0;
function showStill(t) {
  const img = document.getElementById("sel-still");
  if (!img) return;
  // A custom circuit has no still (nothing to fetch, nothing to 404): the hero
  // keeps its gradient and the outline carries the preview.
  if (t.custom) { img.hidden = true; img.dataset.id = t.id; stillToken++; return; }
  const src = "assets/stills/" + t.id + ".webp";
  if (img.dataset.id === t.id && !img.hidden) return;
  const token = ++stillToken;
  img.hidden = true;
  img.dataset.id = t.id;
  img.onload = () => { if (token === stillToken) img.hidden = false; };
  img.onerror = () => { if (token === stillToken) img.hidden = true; };
  img.src = src;
}

function updateTrackPreview() {
  if (!els.selPreviewMap) return;
  const t = Tracks.LIST[G.trackIdx];
  if (!t) return;
  // Meta stubs have no path — hydrate LAZY_CIRCUIT then redraw (caption paints now).
  if (t._metaOnly || !(t.path && t.path.pts && t.path.pts.length)) {
    if (G.ensureCircuit) {
      const idx = G.trackIdx;
      // ensureCircuit rejects when the circuit payload fails to load; unhandled,
      // index.html paints that as a full-screen "Promise rejection" overlay.
      G.ensureCircuit(idx).then(() => {
        if (G.trackIdx === idx) updateTrackPreview();
      }).catch((e) => Log.warn("track", "preview could not load circuit " + idx + ": " + ((e && e.message) || e)));
    }
  }
  const crns = TrackMaps.corners(t);
  const turns = crns.length;
  const dir = TrackMaps.direction(t);
  const elev = TrackMaps.elevRange(t);
  const dz = TrackMaps.drsZones(t);
  // Caption ON the still: flag, name, grand prix.
  const flagEl = document.getElementById("sel-preview-flag");
  if (flagEl) flagEl.innerHTML = Flags.svg(t.country);
  els.selPreviewName.textContent = t.name + (t.night ? " ☾" : "");
  els.selPreviewGp.textContent = t.gp || "";
  // The type badges under the name — the same .trb chips the tiles carry.
  const factsEl = document.getElementById("sel-preview-facts");
  if (factsEl) {
    const kinds = [];
    if (t.night) kinds.push(["trb trb-night", "NIGHT RACE"]);
    if (t.street) kinds.push(["trb trb-street", "STREET CIRCUIT"]);
    if (t.classic) kinds.push(["trb trb-classic", "CLASSIC"]);
    if (t.custom) kinds.push(["trb trb-custom", "CUSTOM CIRCUIT"]);
    if (t.banked) kinds.push(["trb", "BANKED"]);
    factsEl.textContent = "";
    for (const [cls, label] of kinds) {
      const b = document.createElement("span"); b.className = cls; b.textContent = label; factsEl.appendChild(b);
    }
    if (t.custom) {
      // Straight from the picker into the designer with THIS design; the
      // LAZY_EDITOR bundle loads on the first click (CustomTracks.ensureEditor).
      const e = document.createElement("button"); e.type = "button"; e.className = "sel-chip"; e.textContent = "EDIT IN DESIGNER";
      e.setAttribute("aria-label", "Edit " + t.name + " in the track designer");
      e.onclick = () => {
        if (G.soundOn) GameAudio.uiSelect();
        CustomTracks.ensureEditor().then((ok) => { if (ok && typeof TrackDesigner !== "undefined") TrackDesigner.open({ design: CustomTracks.get(t.id), originId: t.id }); });
      };
      factsEl.appendChild(e);
    }
  }
  // The numbers beside the still, as a definition list (label over value).
  const km = t.lengthKm || 0;
  const selInner = document.getElementById("sel-inner") || {};
  const narrowLen = ((selInner.dataset || {}).density === "compact") || ((selInner.clientWidth || 0) > 0 && selInner.clientWidth <= 520);
  const rows = [
    ["LOCATION", t.country || "—"],
    ["TURNS", turns ? String(turns) : "—"],
    ["CIRCUIT LENGTH", !km ? "—"
      : narrowLen
        ? km.toFixed(3) + " km"
        : km.toFixed(3) + " km / " + (km * 0.621371).toFixed(3) + " mi"],
    ["DIRECTION", dir ? (dir === "CW" ? "Clockwise" : "Anti-clockwise") : "—"],
    ["ELEVATION", elev > 2 ? "+" + elev + " m" : "Flat"],
    ["AERO ZONES", dz && dz.length ? String(dz.length) : "None"],
  ];
  if (crns.length) {
    const slowest = crns.reduce(function (a, b) { return b.v > a.v ? b : a; });
    rows.push(["SLOWEST CORNER", "T" + slowest.n]);
  }
  els.selPreviewMeta.textContent = "";
  for (const [k, v] of rows) {
    // <div> groups inside a <dl> are valid HTML and are what lets the grid
    // stack each label over its value instead of interleaving dt/dd cells.
    const pair = document.createElement("div");
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    pair.append(dt, dd);
    els.selPreviewMeta.appendChild(pair);
  }
  // The record line: the season's round, or the player's own lap record.
  if (G.seasonMode) {
    els.selPreviewRec.textContent = G.season && !SeasonCal.canRace(G.season)
      ? "Final standings · " + SeasonCal.rounds() + " rounds"
      : "Round " + ((G.season && G.season.round || 0) + 1) + " of " + SeasonCal.rounds();
  } else {
    const board = ttBoard(t.id);
    const rec = board.length ? board[0].t : Infinity;
    els.selPreviewRec.textContent = isFinite(rec) ? "Best across setups  ★ " + fmtTime(rec)
      : ttChrome() ? "No time set" : "";
  }
  showStill(t);
  // While #select is hidden (buildSelect's synchronous pass) the hero measures
  // 0×0 — every open is followed by the double-rAF / ResizeObserver refit
  // anyway. The captions above are written; the raster below is skipped.
  const hero = document.getElementById("sel-hero");
  const sheet = hero && hero.closest(".sheet");
  if (!hero || hero.clientWidth <= 0 || hero.clientHeight <= 0) return;
  drawElevProfile(document.getElementById("sel-preview-elev"), t);

  // THE OUTLINE OVER THE STILL: a plain white lap line with a dark casing —
  // sectors, corner numbers and DRS belong to CIRCUIT DETAIL, one tap away.
  // Fit the canvas to ~2/3 of the hero in the circuit's own aspect; it is
  // absolutely centred by the stylesheet, so pinning its box moves nothing.
  const map = els.selPreviewMap;
  // A compact hero is short and its caption sits along the bottom edge; the
  // outline is top-aligned there (css) and keeps clear of the caption.
  const compact = !!(sheet && sheet.dataset.density === "compact");
  const slotW = hero.clientWidth * 0.62, slotH = hero.clientHeight * (compact ? 0.6 : 0.64);
  const fit = TrackMaps.fitCanvas(map, slotW, slotH, t, true);
  // CRISP AT UI SIZE > 100% AND ON HiDPI: the buffer is the fitted CSS box times
  // the effective zoom x dpr (capped at 3 like the minimap); the draw params
  // are scaled by the same ratio so the line stays the same visual weight.
  const ratio = Math.min(3, Math.max(1, (map.currentCSSZoom || 1) * (window.devicePixelRatio || 1)));
  if (ratio > 1.01) {
    map.width = Math.round(fit.w * ratio);
    map.height = Math.round(fit.h * ratio);
  }
  const br = fit.w ? (map.width / fit.w) : 1;
  const lw = Math.max(2, Math.round(Math.min(fit.w, fit.h) / 42));
  TrackMaps.draw(map, t, {
    color: "#ffffff", casing: "rgba(0,0,0,0.55)", startColor: "#e10600",
    width: lw * br, pad: Math.round(lw * 1.5) * br,
    corners: false, sectors: false, drs: false
  });
  // Shown from the first draw on (css/select.css hides the shell's 520x300
  // default box until now, so the first open never flashes an empty canvas).
  map.dataset.drawn = "";
}
function openTrackDetail() {
  const t = Tracks.LIST[G.trackIdx];
  if (!t) return;
  const modal = document.getElementById("track-detail");
  if (!modal) return;
  const crns = TrackMaps.corners(t);
  document.getElementById("track-detail-name").textContent = t.name + (t.gp ? "  ·  " + t.gp : "");
  const dz = TrackMaps.drsZones(t);
  const dir = TrackMaps.direction(t);
  const elev = TrackMaps.elevRange(t);
  const meta = [
    t.country,
    t.lengthKm ? t.lengthKm.toFixed(1) + " km" : "",
    crns.length + " turns",
    dir ? (dir === "CW" ? "Clockwise" : "Anti-clockwise") : "",
    elev > 2 ? "+" + elev + " m elev" : "",
    dz && dz.length ? dz.length + (dz.length === 1 ? " aero zone" : " aero zones") : ""
  ].filter(Boolean).join("  ·  ");
  document.getElementById("track-detail-meta").textContent = meta;

  // Circuit type flags
  const nightEl = document.getElementById("tdf-night");
  const streetEl = document.getElementById("tdf-street");
  const bankedEl = document.getElementById("tdf-banked");
  if (nightEl) nightEl.hidden = !t.night;
  if (streetEl) streetEl.hidden = !t.street;
  if (bankedEl) bankedEl.hidden = !t.banked;

  // ☆ FAVOURITE — built here, not in index.html, so the shell carries no node
  // for it; created once and repainted per circuit.
  const panel = document.getElementById("track-detail-panel");
  let fav = panel && panel.querySelector("#track-detail-fav");
  if (!fav && panel) {
    fav = document.createElement("button");
    fav.type = "button";
    fav.id = "track-detail-fav";
    fav.className = "sel-chip";
    panel.insertBefore(fav, document.getElementById("track-detail-flags"));
  }
  if (fav) {
    const paintFav = () => {
      const on = favList().includes(t.id);
      fav.textContent = on ? "★ FAVOURITE" : "☆ FAVOURITE";
      fav.classList.toggle("active", on);
      fav.setAttribute("aria-pressed", on ? "true" : "false");
    };
    fav.onclick = () => { toggleFav(t.id); paintFav(); };
    paintFav();
  }

  // Legend is built once (like FAVOURITE) so the shell does not pay five
  // extra nodes. Fast/medium/slow/hairpin reuse tdc-* colour; Sector is the
  // grey S2 stroke that the 9px canvas key never named.
  const wrap = document.getElementById("track-detail-canvas-wrap");
  let legend = document.getElementById("track-detail-legend");
  if (!legend && wrap) {
    legend = document.createElement("ul");
    legend.id = "track-detail-legend";
    legend.setAttribute("aria-label", "Circuit map colours");
    const items = [
      ["tdc-fast", "Fastest"],
      ["tdc-medium", "Medium"],
      ["tdc-slow", "Slow"],
      ["tdc-hairpin", "Hairpin"],
      ["", "Sector"]
    ];
    for (let i = 0; i < items.length; i++) {
      const li = document.createElement("li");
      const sw = document.createElement("i");
      if (items[i][0]) sw.className = items[i][0];
      else li.setAttribute("data-leg", "sector");
      li.appendChild(sw);
      li.appendChild(document.createTextNode(" " + items[i][1]));
      legend.appendChild(li);
    }
    wrap.appendChild(legend);
  }

  // Elevation sparkline — same painter as the preview chart above; here the
  // canvas has a WRAPPER that carries the hidden state (the preview canvas
  // hides itself), which was the only real difference between the two blocks.
  drawElevProfile(document.getElementById("track-detail-elev"), t,
                  document.getElementById("track-detail-elev-wrap"));

  // Active-aero (straight-mode) zones with metre positions — the 2026 rules have no DRS
  const drsWrap = document.getElementById("track-detail-drs-wrap");
  const drsList = document.getElementById("track-detail-drs-list");
  if (drsWrap && drsList) {
    if (dz && dz.length) {
      const trackLen = (t.lengthKm || 5) * 1000;
      // A zone across the line: AeroZones leaves end > total (z.b > 1, z.wrap),
      // or a drawer already folded b into the next lap (z.b < z.a). Either way
      // "4870 m – 514 m" looked broken — name the S/F wrap. Place-keys stay on
      // Tracks / AeroZones; this is only the label.
      const lapM = function (f) { const m = Math.round(f * trackLen); return m > trackLen ? m - trackLen : m; };
      const wraps = function (z) { return !!(z.wrap || z.b > 1 || z.b < z.a); };
      drsList.innerHTML = dz.map(function (z, i) {
        const a = lapM(z.a), b = lapM(z.b);
        const range = wraps(z)
          ? (a + " m &ndash; past S/F &ndash; " + b + " m")
          : (a + " m &ndash; " + b + " m");
        return '<div class="tdd-zone">Zone ' + (i + 1) + ': ' + range + "</div>";
      }).join("");
      drsWrap.hidden = false;
    } else {
      drsWrap.hidden = true;
    }
  }

  // Turns list — class from TrackMaps (radius + heading sweep), not raw |k|.
  // Literal tdc-* class names kept here so docs/COMPONENTS.md inventory still
  // sees them (dynamic "tdc-" + x would look unused to the audit).
  const TDC_CLS = {
    HAIRPIN: "tdc-hairpin",
    SLOW: "tdc-slow",
    MEDIUM: "tdc-medium",
    FAST: "tdc-fast"
  };
  const list = document.getElementById("track-detail-list");
  list.innerHTML = crns.map(function (c) {
    const lbl = c.cls || "MEDIUM";
    const cls = TDC_CLS[lbl] || "tdc-medium";
    return '<div class="tdc-corner"><span class="tdc-num">T' + c.n + '</span><span class="' + cls + '">' + lbl + '</span></div>';
  }).join("");

  // Crossfade into the full-screen circuit-detail modal (progressive
  // enhancement; the content above is already populated while hidden).
  Log.info("ui", "Menus.open track-detail");
  vt(() => { modal.hidden = false; });
  const cv = document.getElementById("track-detail-canvas");
  // A TALL CIRCUIT CANNOT SPEND THE MODAL'S WIDTH, so give it to the panel.
  // The map fits by height here, and the layout audit measured what that
  // leaves: at 1280x800 the wrap is 982px wide and Jeddah's outline is 363 of
  // it — 37% fill, against Baku's 99% — with ~600px of empty wrap sitting
  // beside a turns list squeezed into a fixed 260px rail. Keyed on the
  // CIRCUIT'S ASPECT alone, deliberately: deciding from the measured fit would
  // feed the panel's own width back into the fit that chose it, through the
  // ResizeObserver below. A circuit's shape cannot oscillate.
  modal.setAttribute("data-map-tall", TrackMaps.aspect(t) < 1 ? "1" : "0");
  let lastFit = "";
  const drawDetail = function () {
    // A queued rAF/ResizeObserver delivery may arrive after CLOSE. Never
    // measure and redraw a hidden modal, and never retain its circuit closure.
    if (modal.hidden) return;
    // Fit the canvas to the wrap in local (pre-zoom) CSS pixels. clientWidth
    // is correct inside `zoom: var(--ui-scale)` sheets; gBCR would mix visual
    // pixels and re-introduce stretch at UI SIZE ≠ 100%.
    const wrapW = wrap ? wrap.clientWidth : (window.innerWidth - 24);
    const legendH = legend ? legend.offsetHeight : 0;
    const wrapH = wrap ? Math.max(0, wrap.clientHeight - legendH) : (window.innerHeight - 80);
    // Floors apply ONLY to the unmeasured fallbacks. Flooring a MEASURED wrap
    // at 200/150 pinned a canvas bigger than its box whenever the local wrap
    // was smaller than the floor — fitCanvas writes an inline max-width, which
    // beats the stylesheet's max-width:100% belt — so at UI SIZE 200% on a
    // landscape phone the map overflowed its wrap by 98px a side (2026-08-21
    // sweep). A measured wrap is the honest budget however small; fitCanvas's
    // own 40px transient floor still guards the degenerate frame.
    const maxW = wrapW > 0 ? wrapW : Math.max(200, Math.min(window.innerWidth - 24, 600));
    const maxH = wrapH > 0 ? wrapH : Math.max(150, Math.round(maxW / 1.2));
    // Zoom×dpr joins the KEY as well as the buffer: with a CSS-px-only key a
    // DPR change under an unchanged box (drag to another monitor, browser
    // zoom) produced an identical key and the early return skipped the refit.
    const ratio = Math.min(3, Math.max(1,
      (cv.currentCSSZoom || 1) * (window.devicePixelRatio || 1)));
    const key = maxW + "x" + maxH + "@" + ratio.toFixed(2);
    if (key === lastFit) return;   // the observer below also fires on our own pin
    lastFit = key;
    const fit = TrackMaps.fitCanvas(cv, maxW, maxH, t, true);
    // The biggest circuit diagram in the game had NO dpr/zoom term: inside
    // zoom: var(--ui-scale) at dpr 2 + 200% it painted at 4x its backing
    // store. Same buffer expansion + buffer-ratio param scaling as the
    // picker preview above; CSS size stays the local fit.
    if (ratio > 1.01) {
      cv.width = Math.round(fit.w * ratio);
      cv.height = Math.round(fit.h * ratio);
    }
    const mk = Math.min(1, fit.w / 520, fit.h / 300);
    const br = fit.w ? (cv.width / fit.w) : 1;
    TrackMaps.draw(cv, t, {
      color: TrackMaps.themeColor(t), startColor: "#e10600",
      width: Math.max(2 * br, Math.round(5 * mk * br)), pad: Math.max(12 * br, Math.round(42 * mk * br)),
      corners: true, cornerR: Math.max(4 * br, Math.round(6 * mk * br)), cornerFont: Math.max(8 * br, Math.round(12 * mk * br)),
      sectors: true, drs: true, legend: false
    });
  };
  requestAnimationFrame(drawDetail);
  // ONE rAF LANDS TOO EARLY. The modal opens through a view transition, so the
  // first frame measures the dialog mid-animation: 500px of an eventual 645px
  // wrap, a fifth of the map's height thrown away on every open, and the map
  // stayed that size because nothing re-measured afterwards. Re-fit whenever
  // the wrap's box actually changes — which also covers a UI SIZE change or a
  // rotation while the modal is open. Guarded by lastFit so pinning the canvas
  // cannot feed itself a second pass.
  if (wrap && typeof ResizeObserver === "function") {
    if (detailRO) detailRO.disconnect();
    detailRO = new ResizeObserver(drawDetail);
    detailRO.observe(wrap);
  }
}
function closeTrackDetail() {
  const modal = document.getElementById("track-detail");
  if (modal) modal.hidden = true;
  if (detailRO) detailRO.disconnect();
  detailRO = null;
}
return { buildSelect, updateTrackPreview, openTrackDetail, closeTrackDetail, setTeamPicker, teamSwatch, vt };
}

return { create };
})();
Object.freeze(Menus);
