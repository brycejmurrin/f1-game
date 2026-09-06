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
const { $, els, store, cssCol, fmtTime, ttBoard, tickUi, scheduleFlybyTrack } = G;

// localStorage can be unavailable even while the game remains fully playable.
// Surface that distinction globally: the in-memory cache preserves this
// session, but the player must know a reload will discard it and must have a
// recovery path that never exports credentials or unrelated preferences.
document.body.insertAdjacentHTML("afterbegin",
  '<aside id="save-warning" role="alert" hidden><strong>SESSION ONLY — SAVING UNAVAILABLE</strong>' +
  '<span id="save-warning-detail">Progress will be lost when this page closes or reloads.</span>' +
  '<button id="save-retry" type="button">RETRY SAVE</button>' +
  '<button id="save-export" type="button">EXPORT RECOVERY</button></aside>');
const saveWarning = $("save-warning");
const saveWarningDetail = $("save-warning-detail");
const showSaveWarning = (reason) => {
  if (!saveWarning) return;
  saveWarning.hidden = false;
  saveWarningDetail.textContent = "Progress will be lost when this page closes or reloads"
    + (reason ? " (" + reason + ")." : ".");
};
const hideSaveWarning = () => { if (saveWarning) saveWarning.hidden = true; };
if (store.broken) showSaveWarning(store.broken);
store.subscribe((change) => {
  if (change && change.local && change.durable === false) showSaveWarning(change.reason);
});

const retrySave = () => {
  const results = [];
  if (typeof Career !== "undefined" && Career.data && Career.data()) results.push(Career.saveStatus());
  if (G.season && !(typeof Career !== "undefined" && Career.inCareer && Career.inCareer()))
    results.push(store.write("season", G.season));
  // With no active championship, use a harmless probe so Settings-only users
  // can still verify that storage became available again.
  if (!results.length) results.push(store.write("saveProbe", { at: Date.now() }));
  const durable = results.every((r) => r && r.durable);
  if (durable) {
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
    persistence: { durable: false, reason: store.broken || "unknown" },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "apex26-recovery-" + Date.now() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
const vtReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const vt = (fn) => {
  if (!document.startViewTransition || vtReduce.matches) { fn(); return; }
  let applied = false;
  const run = () => { if (applied) return; applied = true; fn(); };
  try {
    const t = document.startViewTransition(run);
    if (t && t.updateCallbackDone) t.updateCallbackDone.catch(() => {});
  } catch (_) { run(); return; }
  setTimeout(run, 60);
};

// ---- full-screen team picker ----------------------------------------------
// The twelve-way team choice, opened from the garage's TEAM & DRIVER tab. It
// used to be reachable from a summary card on the select screen too; that card
// is gone, and the garage is the one place a team is chosen.
const teamPicker = () => $("teampicker");
// The picker's ONE host is the garage's TEAM tab (the select screen's card
// door was removed with the screen split). A pickerHost variable and a
// select-host rebuild branch survived that removal for a year with no caller
// able to reach them — removed 2026-08.
let previewOpenRaf = 0;

function fittedLivery(t) {
  const id = store.get("livery." + t.id, "default");
  const custom = store.get("livery.custom." + t.id, []) || [];
  const list = ((typeof Liveries !== "undefined" && Liveries.forTeam) ? Liveries.forTeam(t) : []).concat(custom);
  return list.find((l) => l.id === id) || list[0] || null;
}

function teamSwatch(t) {
  const sw = document.createElement("span");
  sw.className = "tm-colour";
  const liv = fittedLivery(t);
  const c1 = (liv && liv.c1) || t.color;
  const c2 = (liv && liv.c2) || t.color2 || t.color;
  // Fitted scheme, not the factory pair: a player who painted the car should
  // see that paint on the TEAM tile. The lockup is the same crest the garage
  // wall and the car share.
  if (typeof LiveryTex !== "undefined" && LiveryTex.paintSwatch) {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 48;
    c.setAttribute("aria-hidden", "true");
    LiveryTex.paintSwatch(c.getContext("2d"), t.id, liv || { c1, c2 }, c.width, c.height);
    sw.appendChild(c);
  } else {
    sw.style.background = "linear-gradient(135deg," + cssCol(c1) + " 62%," + cssCol(c2) + " 62%)";
  }
  sw.setAttribute("aria-hidden", "true");
  return sw;
}

/* Open/close the team picker (the garage's TEAM tab is its one caller). */
function setTeamPicker(open) {
  // Build on open, not on every buildSelect(). The tiles used to be filled in
  // by buildSelect alone, so opening the sheet from the garage straight off the
  // title screen — where buildSelect has never run — showed an empty sheet.
  Log.info("ui", "Menus.setTeamPicker " + (open ? "open" : "close"));
  if (open) buildTeamPicker();
  teamPicker().hidden = !open;
  if (open) ScrollFadeRefresh();
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
    sub.textContent = t.drivers
      .map((d, si) => "#" + d.num + " " + d.name.split(" ").pop() + (isTaken(si) ? " (TAKEN)" : ""))
      .join("  ·  ");
    body.append(name, sub);
    b.append(teamSwatch(t), body);
    b.onclick = () => {
      // Same as the circuit row: the decision this sheet exists for clicked
      // silently while the card that OPENED it did not.
      if (G.soundOn && window.GameAudio) GameAudio.uiSelect();
      // The old team's driver index means nothing here, so this used to reset
      // to seat 0 flat. In a friend race seat 0 may be the seat the other
      // player is in, which dropped you straight into a taken seat with a
      // disabled chip underneath you. Take the first seat nobody holds; the
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
      G.buildSetup(); tickUi();
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
let trackFilter = store.get("trackFilter", "all");
if (trackFilter !== "all" && trackFilter !== "season" && trackFilter !== "classic") trackFilter = "all";
const trackFilters = [["all", "ALL"], ["season", "SEASON"], ["classic", "CLASSICS"]];
let trackQuery = "";

function applyTrackSearch(value) {
  trackQuery = String(value || "").trim().toLocaleLowerCase();
  const rows = Array.from(els.selTracks.querySelectorAll(".track-row"));
  for (const row of rows) row.hidden = !!trackQuery && !row.dataset.search.includes(trackQuery);
  for (const head of els.selTracks.querySelectorAll(".track-group-head")) {
    head.hidden = !rows.some((row) => row.dataset.trackGroup === head.dataset.trackGroup && !row.hidden);
  }
  const empty = document.getElementById("sel-track-empty");
  if (empty) empty.hidden = rows.some((row) => !row.hidden);
  ScrollFadeRefresh();
}

function setTrackFilter(id, focus) {
  trackFilter = id;
  store.set("trackFilter", id);
  if (G.soundOn && window.GameAudio) GameAudio.uiSelect();
  vt(() => {
    buildSelect(); tickUi();
    if (focus) els.selTracks.querySelector('[data-filter="' + id + '"]')?.focus();
  });
}

function trackFilterBar() {
  const bar = document.createElement("div");
  bar.id = "sel-track-filter";
  bar.className = "sel-chip-row";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Circuit list controls");
  trackFilters.forEach(([id, label], index) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sel-chip" + (trackFilter === id ? " active" : "");
    b.dataset.filter = id;
    b.setAttribute("aria-pressed", trackFilter === id ? "true" : "false");
    b.tabIndex = trackFilter === id ? 0 : -1;
    b.textContent = label;
    b.onclick = (e) => {
      e.stopPropagation();
      setTrackFilter(id, false);
    };
    b.onkeydown = (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = (index + 1) % trackFilters.length;
      else if (e.key === "ArrowLeft") next = (index - 1 + trackFilters.length) % trackFilters.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = trackFilters.length - 1;
      if (next == null) return;
      e.preventDefault(); e.stopPropagation();
      setTrackFilter(trackFilters[next][0], true);
    };
    bar.appendChild(b);
  });
  // TODAY'S CHALLENGE — time trial only. The plan is the day's (UTC), the same
  // for every player; one tap stages it and starts. Dynamic: no shell nodes.
  if (G.timeTrial && G.daily) {
    const p = G.daily.plan();
    const done = G.daily.today();
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sel-chip";
    b.id = "sel-daily";
    const extraBits = [p.weather.toUpperCase(), p.tod.toUpperCase()];
    if (done && done.best != null) extraBits.push("★ " + fmtTime(done.best));
    b.textContent = "TODAY · " + p.trackName.toUpperCase();
    const extra = document.createElement("span");
    extra.textContent = " · " + extraBits.join(" · ");
    b.appendChild(extra);
    b.setAttribute("aria-label", "Today: " + p.trackName + " · " + extraBits.join(" · "));
    b.title = "Today's challenge (" + p.day + " UTC): the same circuit and conditions for everyone";
    b.onclick = (e) => { e.stopPropagation(); tickUi(); G.daily.open(); };
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
// when a search excludes it) — the same button the old vertical list was, so
// the keyboard walker, the gamepad and every spec that names it still work;
// only its shape changed. data-kind carries night/street/classic for the
// stylesheet; the .trb badges stay in the DOM (hidden in the strip) because the
// SEASON filter's "no classics shown" contract is asserted on them.
function trackTile(t, i, opts) {
  const row = document.createElement(opts && opts.readOnly ? "div" : "button");
  if (!(opts && opts.readOnly)) row.type = "button";
  row.className = "track-row" + (opts && opts.active ? " active" : "");
  row.dataset.trackIdx = String(i);
  row.dataset.kind = t.classic ? "classic" : t.night ? "night" : t.street ? "street" : "season";
  row.setAttribute("aria-label", t.name);
  // The country is the tooltip: five USA tiles and three Italian ones need
  // it, and the strip has no room for a second line of text under each flag.
  row.title = t.name + (t.country ? " · " + t.country : "");
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
  row.appendChild(nm);
  return row;
}

// The toolbar lives on the SHELF, before the strip — a sibling of #sel-tracks,
// not a child, because the strip scrolls sideways and the filter must not.
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
  // ONE QUESTION: WHERE. The car summary that used to share this screen is
  // gone (index.html) — WHO and WHAT are chosen in the garage via YOUR CAR.
  // NEXT opens race settings. The only thing that differs between modes here
  // is what the screen is called and what the foot button promises next.
  const room = !!G.netRoom;
  const seasonComplete = !room && G.seasonMode && G.season && !SeasonCal.canRace(G.season);
  // NEXT opens race settings. YOUR CAR is the garage door beside it.
  els.selGo.textContent = seasonComplete ? "VIEW FINAL STANDINGS" : "NEXT";
  els.selGo.dataset.seasonComplete = seasonComplete ? "1" : "";
  const selCar = $("sel-car");
  if (selCar) selCar.hidden = seasonComplete || room;
  els.selTitle.textContent = room ? "THE RACE"
    : seasonComplete ? "SEASON COMPLETE"
    : G.seasonMode ? "SEASON — ROUND " + ((G.season && G.season.round || 0) + 1)
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
    let group = null;
    Tracks.LIST.forEach((t, i) => {
      if (trackFilter === "season" && t.classic) return;
      if (trackFilter === "classic" && !t.classic) return;
      const g = t.classic ? "CLASSIC CIRCUITS" : "CURRENT SEASON";
      if (g !== group) {
        group = g;
        const head = document.createElement("div");
        head.className = "track-group-head";
        head.dataset.trackGroup = g;
        // Short, because the strip draws it as a VERTICAL rule between the two
        // groups: the full "CLASSIC CIRCUITS" stood taller than the tiles and
        // stretched the whole strip (measured 131px at 852x393). The filter
        // chips beside the strip carry the long names.
        head.textContent = t.classic ? "CLASSICS" : "SEASON";
        els.selTracks.appendChild(head);
      }
      const row = trackTile(t, i, { active: i === G.trackIdx });
      row.dataset.trackGroup = g;
      row.dataset.search = [t.name, t.country, t.classic ? "classic" : "season", t.street ? "street" : "", t.night ? "night" : ""]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      row.setAttribute("aria-pressed", i === G.trackIdx ? "true" : "false");
      if (G.timeTrial) {
        const board = ttBoard(t.id);
        const rec = board.length ? board[0].t : Infinity;
        const recEl = document.createElement("span");
        recEl.className = "track-row-rec";
        recEl.textContent = isFinite(rec) ? "★ " + fmtTime(rec) : "—";
        row.appendChild(recEl);
      }
      row.onclick = () => {
        // The headline choice of this screen was the one silent control on it
        // (the filter chips beside it click) — a soundless tap reads as a miss.
        if (G.soundOn && window.GameAudio) GameAudio.uiSelect();
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
        tickUi();
        scheduleFlybyTrack();
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
  // buildSelect runs while #select is still hidden at every entry point, so
  // the synchronous preview pass can only draw against placeholder geometry.
  // Refit after two frames: the first exposes and classifies the sheet, the
  // second sees the settled box. ResizeObserver remains the ongoing resize
  // path, but first paint no longer depends on when a busy browser happens to
  // deliver its callback (the audit caught intermittent 1x1 maps when three
  // SwiftShader contexts competed). The strip has a box by then too, so the
  // chosen tile can be scrolled into view.
  // FIRST, A ZERO-DELAY TIMER. scheduleFlybyTrack() builds the background
  // circuit 120 ms after this screen opens and holds the main thread for
  // seconds on a slow device — long enough that the rAF pair and the hero's
  // ResizeObserver below both land AFTER it, and the outline sits at its
  // 520x300 attribute size until then (measured 5 s on SwiftShader). A timer
  // queued now runs before that build, so a synchronous reveal (reduced
  // motion, or a browser without view transitions) fits on the first frame;
  // the crossfade case still waits a frame and is caught by the pair below.
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
  const yNorm = (v) => eh - pad - ((v - mn) / span) * (eh - 2 * pad);
  // The trace is walked TWICE on purpose: once closed down to the baseline for
  // the fill, once open for the stroke, so the stroke does not draw the two
  // vertical closing edges. `i <= py.length` closes the lap back onto py[0].
  const trace = () => {
    eg.beginPath();
    for (let i = 0; i <= py.length; i++) {
      const ex = (i / py.length) * ew;
      i === 0 ? eg.moveTo(ex, yNorm(py[0])) : eg.lineTo(ex, yNorm(py[i % py.length]));
    }
  };
  trace();
  eg.lineTo(ew, eh); eg.lineTo(0, eh); eg.closePath();
  eg.fillStyle = "rgba(57,183,240,0.18)"; eg.fill();
  eg.strokeStyle = "rgba(57,183,240,0.7)"; eg.lineWidth = 1.5;
  trace();
  eg.stroke();
  // Y-axis elevation labels (top = max, bottom = min)
  eg.font = "8px monospace"; eg.fillStyle = "rgba(57,183,240,0.75)"; eg.textAlign = "right";
  eg.fillText("+" + Math.round(mx) + "m", ew - 2, 9);
  eg.fillText(Math.round(mn) + "m", ew - 2, eh - 1);
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
 * SIZE change, an orientation flip, sheetshape.js flipping data-shape — all of
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
    if (t.banked) kinds.push(["trb", "BANKED"]);
    factsEl.textContent = "";
    for (const [cls, label] of kinds) {
      const b = document.createElement("span"); b.className = cls; b.textContent = label; factsEl.appendChild(b);
    }
  }
  // The numbers beside the still, as a definition list (label over value).
  const km = t.lengthKm || 0;
  const rows = [
    ["LOCATION", t.country || "—"],
    ["TURNS", turns ? String(turns) : "—"],
    ["CIRCUIT LENGTH", km ? km.toFixed(3) + " km / " + (km * 0.621371).toFixed(3) + " mi" : "—"],
    ["DIRECTION", dir ? (dir === "CW" ? "Clockwise" : "Anti-clockwise") : "—"],
    ["ELEVATION", elev > 2 ? "+" + elev + " m" : "Flat"],
    ["DRS ZONES", dz && dz.length ? String(dz.length) : "None"],
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
    els.selPreviewRec.textContent = isFinite(rec) ? "Lap record  ★ " + fmtTime(rec)
      : G.timeTrial ? "No time set" : "";
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
    dz && dz.length ? dz.length + " DRS" : ""
  ].filter(Boolean).join("  ·  ");
  document.getElementById("track-detail-meta").textContent = meta;

  // Circuit type flags
  var nightEl = document.getElementById("tdf-night");
  var streetEl = document.getElementById("tdf-street");
  var bankedEl = document.getElementById("tdf-banked");
  if (nightEl) nightEl.hidden = !t.night;
  if (streetEl) streetEl.hidden = !t.street;
  if (bankedEl) bankedEl.hidden = !t.banked;

  // Elevation sparkline — same painter as the preview chart above; here the
  // canvas has a WRAPPER that carries the hidden state (the preview canvas
  // hides itself), which was the only real difference between the two blocks.
  drawElevProfile(document.getElementById("track-detail-elev"), t,
                  document.getElementById("track-detail-elev-wrap"));

  // DRS zones with metre positions
  var drsWrap = document.getElementById("track-detail-drs-wrap");
  var drsList = document.getElementById("track-detail-drs-list");
  if (drsWrap && drsList) {
    if (dz && dz.length) {
      const trackLen = (t.lengthKm || 5) * 1000;
      drsList.innerHTML = dz.map(function (z, i) {
        return '<div class="tdd-zone">Zone ' + (i + 1) + ': ' + Math.round(z.a * trackLen) + ' m &ndash; ' + Math.round(z.b * trackLen) + ' m</div>';
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
  const wrap = document.getElementById("track-detail-canvas-wrap");
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
    const wrapH = wrap ? wrap.clientHeight : (window.innerHeight - 80);
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
      sectors: true, drs: true
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
