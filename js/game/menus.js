/* Apex 26 — the select-screen UI for js/game.js: the track picker with its live preview map + elevation canvases, and the fullscreen circuit-detail modal. The scr… */
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
    build: (window.__APEX_BUILD__ || null),
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
const vt = (fn) => {
  if (!document.startViewTransition) { fn(); return; }
  let applied = false;
  const run = () => { if (applied) return; applied = true; fn(); };
  try {
    const t = document.startViewTransition(run);
    if (t && t.updateCallbackDone) t.updateCallbackDone.catch(() => {});
  } catch (_) { run(); return; }
  setTimeout(run, 60);
};

const teamPicker = () => $("teampicker");
let pickerHost = "select";
let previewOpenRaf = 0;

function teamSwatch(t) {
  const sw = document.createElement("span");
  sw.className = "tm-colour";
  sw.style.background = "linear-gradient(135deg," + cssCol(t.color) + " 62%," + cssCol(t.color2 || t.color) + " 62%)";
  sw.setAttribute("aria-hidden", "true");
  return sw;
}

/* Open/close the team picker. `host` is the screen that opened it (see
   pickerHost); omit it on close so the last host survives the rebuild. */
function setTeamPicker(open, host) {
  if (open && host) pickerHost = host;
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
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", i === G.teamIdx ? "true" : "false");
    const body = document.createElement("span");
    body.className = "tm-body";
    const name = document.createElement("span");
    name.className = "tm-name"; name.textContent = t.name;
    const sub = document.createElement("span");
    sub.className = "tm-sub";
    const taken = G.peerSeats ? G.peerSeats() : [];
    const isTaken = (si) => taken.some((s) => s.team === t.id && s.driver === si);
    sub.textContent = t.drivers
      .map((d, si) => "#" + d.num + " " + d.name.split(" ").pop() + (isTaken(si) ? " (TAKEN)" : ""))
      .join("  ·  ");
    body.append(name, sub);
    b.append(teamSwatch(t), body);
    b.onclick = () => {
      let seat = 0;
      while (seat < t.drivers.length - 1 && isTaken(seat)) seat++;
      G.teamIdx = i; G.driverIdx = seat; store.set("team", i);
      store.set("driver", seat);
      setTeamPicker(false);
      if (pickerHost === "garage") { G.buildSetup(); tickUi(); }
      else vt(() => { buildSelect(); tickUi(); });
    };
    els.selTeams.appendChild(b);
  });
}

let detailRO = null;

const ScrollFadeRefresh = () => { if (window.ScrollFade) window.ScrollFade.refresh(); };

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
  const search = document.createElement("input");
  search.id = "sel-track-search";
  search.type = "search";
  search.value = trackQuery;
  search.placeholder = "Search circuit or country";
  search.setAttribute("aria-label", "Search circuits");
  search.autocomplete = "off";
  search.oninput = () => applyTrackSearch(search.value);
  bar.appendChild(search);
  return bar;
}

function buildSelect() {
  const room = !!G.netRoom;
  const seasonComplete = !room && G.seasonMode && G.season && !SeasonCal.canRace(G.season);
  els.selGo.textContent = seasonComplete ? "VIEW FINAL STANDINGS" : room ? "NEXT" : "START";
  els.selGo.dataset.seasonComplete = seasonComplete ? "1" : "";
  els.selTitle.textContent = room ? "THE RACE"
    : seasonComplete ? "SEASON COMPLETE"
    : G.seasonMode ? "SEASON — ROUND " + ((G.season && G.season.round || 0) + 1)
    : G.timeTrial ? "TIME TRIAL" : "GRAND PRIX";
  // Track section: interactive circuit picker in GP/TT; read-only NEXT RACE preview in season
  els.selTrackSection.hidden = false;
  if (els.selCircuitLabel) els.selCircuitLabel.textContent = G.seasonMode ? "NEXT RACE" : "CIRCUIT";
  if (G.seasonMode) {
    // Non-interactive preview of the upcoming season circuit
    els.selTracks.textContent = "";
    updateTrackPreview();       // …which also writes the "Round n of N" caption
    if (seasonComplete) {
      const done = document.createElement("div");
      done.className = "season-upcoming-head";
      done.textContent = "ALL " + SeasonCal.rounds() + " ROUNDS COMPLETE";
      els.selTracks.appendChild(done);
    }
    const rnd = (G.season && G.season.round || 0) + 1;
    const custom = document.createElement("button");
    custom.id = "sel-customise";
    custom.className = "sel-chip";
    custom.type = "button";
    custom.textContent = seasonComplete ? "START NEW SEASON" : "CUSTOMISE SEASON";
    custom.onclick = (e) => { e.stopPropagation(); G.openSeasonSetup(); };
    els.selTracks.appendChild(custom);
    // Upcoming rounds list (next 5 circuits after current). Indexes SEASON, not
    // LIST — classics are playable but never a championship round.
    const upcoming = [];
    for (let i = rnd; i < Math.min(rnd + 5, SeasonCal.rounds()); i++) upcoming.push({ n: i + 1, t: SeasonCal.track(i) });
    if (upcoming.length) {
      const upHead = document.createElement("div");
      upHead.className = "season-upcoming-head";
      upHead.textContent = "UPCOMING";
      els.selTracks.appendChild(upHead);
      upcoming.forEach(({ n, t }) => {
        const row = document.createElement("div");
        row.className = "season-upcoming-row";
        const rndEl = document.createElement("span"); rndEl.className = "sur-rnd"; rndEl.textContent = "R" + n;
        const nmEl = document.createElement("span"); nmEl.className = "sur-name"; nmEl.textContent = t.name;
        const ctEl = document.createElement("span"); ctEl.className = "sur-country"; ctEl.textContent = t.country || "";
        row.append(rndEl, nmEl, ctEl);
        els.selTracks.appendChild(row);
      });
    }
  } else {
    els.selTracks.textContent = "";
    els.selTracks.appendChild(trackFilterBar());
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
        head.textContent = g;
        els.selTracks.appendChild(head);
      }
      const row = document.createElement("button");
      row.className = "track-row" + (i === G.trackIdx ? " active" : "");
      row.dataset.trackIdx = String(i);
      row.dataset.trackGroup = g;
      row.dataset.search = [t.name, t.country, t.classic ? "classic" : "season", t.street ? "street" : "", t.night ? "night" : ""]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      row.setAttribute("aria-label", t.name);
      row.setAttribute("aria-pressed", i === G.trackIdx ? "true" : "false");

      const nm = document.createElement("span");
      nm.className = "track-row-name";
      nm.textContent = t.name;
      if (t.night) { const b = document.createElement("span"); b.className = "trb trb-night"; b.textContent = "NIGHT"; nm.appendChild(b); }
      if (t.street) { const b = document.createElement("span"); b.className = "trb trb-street"; b.textContent = "STREET"; nm.appendChild(b); }
      if (t.classic) { const b = document.createElement("span"); b.className = "trb trb-classic"; b.textContent = "CLASSIC"; nm.appendChild(b); }
      row.appendChild(nm);

      const mt = document.createElement("span");
      mt.className = "track-row-meta";
      mt.textContent = [t.country, t.lengthKm ? t.lengthKm.toFixed(1) + " km" : ""].filter(Boolean).join(" · ");
      row.appendChild(mt);

      if (G.timeTrial) {
        const board = ttBoard(t.id);
        const rec = board.length ? board[0].t : Infinity;
        const recEl = document.createElement("span");
        recEl.className = "track-row-rec";
        recEl.textContent = isFinite(rec) ? "★ " + fmtTime(rec) : "—";
        row.appendChild(recEl);
      }

      row.onclick = () => {
        G.trackIdx = i;
        store.set("trackId", t.id);
        store.set("track", i);
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
  if (previewOpenRaf) cancelAnimationFrame(previewOpenRaf);
  previewOpenRaf = requestAnimationFrame(() => {
    previewOpenRaf = requestAnimationFrame(() => {
      previewOpenRaf = 0;
      if (els.select && !els.select.hidden) updateTrackPreview();
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
  const ew = cv.width, eh = cv.height;
  const eg = cv.getContext("2d");
  eg.clearRect(0, 0, ew, eh);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < py.length; i++) { if (py[i] < mn) mn = py[i]; if (py[i] > mx) mx = py[i]; }
  const span = mx - mn || 1;
  const pad = 3;
  const yNorm = (v) => eh - pad - ((v - mn) / span) * (eh - 2 * pad);
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

/* Refit the preview card once ResizeObserver reports a real box (hidden = 0×0
 * on first paint). Guard on last fitted dimensions — refit clears map pins and
 * can re-fire the observer without termination. */
let previewRo = null, previewCardBox = "";
function watchPreviewCard(card) {
  if (!card || typeof ResizeObserver !== "function") return;
  if (previewRo) return;
  previewRo = new ResizeObserver(() => {
    const w = card.clientWidth, h = card.clientHeight;
    if (w <= 0 || h <= 0) return;
    const key = w + "x" + h;
    if (key === previewCardBox) return;
    previewCardBox = key;
    updateTrackPreview();
  });
  previewRo.observe(card);
}

function updateTrackPreview() {
  if (!els.selPreviewMap) return;
  const t = Tracks.LIST[G.trackIdx];
  if (!t) return;
  /* Render the caption before measuring the map slot. planPreview subtracts
     #sel-preview-info's real height from the section budget; measuring an empty
     caption let the map claim the whole compact band, then the text written
     below it was clipped until some later resize happened to refit the card. */
  els.selPreviewName.textContent = t.name + (t.night ? " ☾" : "");
  els.selPreviewGp.textContent = t.gp || "";
  const crns = TrackMaps.corners(t);
  const turns = crns.length;
  els.selPreviewMeta.textContent = [
    t.country,
    t.lengthKm ? t.lengthKm.toFixed(1) + " km" : "",
    turns ? turns + " turns" : ""
  ].filter(Boolean).join("  ·  ");
  if (G.timeTrial) {
    const board = ttBoard(t.id);
    const rec = board.length ? board[0].t : Infinity;
    els.selPreviewRec.textContent = isFinite(rec) ? "Best  ★ " + fmtTime(rec) : "No time set";
  } else if (G.seasonMode) {
    els.selPreviewRec.textContent = G.season && !SeasonCal.canRace(G.season)
      ? "Final standings · " + SeasonCal.rounds() + " rounds"
      : "Round " + ((G.season && G.season.round || 0) + 1) + " of " + SeasonCal.rounds();
  } else {
    els.selPreviewRec.textContent = "";
  }
  const factsEl = document.getElementById("sel-preview-facts");
  if (factsEl) {
    const dir = TrackMaps.direction(t);
    const elev = TrackMaps.elevRange(t);
    const facts = [];
    const dz = TrackMaps.drsZones(t);
    if (dir) facts.push('<span class="spf-fact spf-dir">' + (dir === "CW" ? "↻ Clockwise" : "↺ Anti-clockwise") + "</span>");
    if (elev > 2) facts.push('<span class="spf-fact spf-elev">&#9650; ' + elev + " m elevation</span>");
    if (dz && dz.length) facts.push('<span class="spf-fact spf-drs">' + dz.length + " DRS zone" + (dz.length > 1 ? "s" : "") + "</span>");
    if (crns.length) {
      const slowest = crns.reduce(function (a, b) { return b.v > a.v ? b : a; });
      facts.push('<span class="spf-fact spf-corner">T' + slowest.n + " slowest</span>");
    }
    factsEl.innerHTML = facts.join("");
  }
  drawElevProfile(document.getElementById("sel-preview-elev"), t);

  const map = els.selPreviewMap;
  const a = TrackMaps.aspect(t);
  // Clear prior pins so the stylesheet width / max-height slot can be measured.
  map.style.width = "";
  map.style.height = "";
  map.style.maxWidth = "";
  map.style.maxHeight = "";
  map.style.aspectRatio = String(a);
  const card = map.closest("#sel-track-preview");
  const info = document.getElementById("sel-preview-info");
  const section = map.closest("#sel-track-section");
  const label = document.getElementById("sel-circuit-label");
  // THE ARRANGEMENT FOLLOWS THE CIRCUIT, NOT ONLY THE VIEWPORT.
  //
  // The caption used to sit UNDER the map in every wide-card layout, and the
  // map's height was capped by a `cardH - 9.5rem` guess at the caption's size.
  // That is right for a wide circuit and badly wrong for a tall one: fitting a
  // 2:1-TALL street circuit (Jeddah, aspect 0.5) into a full-width slot means
  // only its HEIGHT can be spent, so the outline came out a 128px sliver with
  // ~190px of dead card beside it and the numbers piled on top of each other.
  // Measured at 1280x720: 128x255 in a 406x416 card.
  //
  // So MEASURE the real budget instead of guessing it, and hand the numbers to
  // TrackMaps.planPreview — which owns the decision, and is unit-tested there
  // precisely because every bug this logic has had was an arithmetic bug that
  // a browser sweep took minutes to surface. This function's only job is to
  // report the card's geometry honestly and apply what comes back.
  if (card) card.removeAttribute("data-map-shape");
  void map.offsetWidth;
  const cardCS = card ? getComputedStyle(card) : null;
  const px = (v) => parseFloat(v) || 0;
  const padX = cardCS ? px(cardCS.paddingLeft) + px(cardCS.paddingRight) : 0;
  // offsetHeight / clientWidth, NOT getBoundingClientRect(): every box here
  // lives inside `zoom: var(--ui-scale)`, where gBCR reports VISUAL px while
  // these report LOCAL (pre-zoom) px. Mixing the two subtracted a 1.75x-sized
  // caption and label from a 1x-sized column budget at UI SIZE 175%, drove the
  // budget negative and collapsed every map onto its floor (measured 36x72).
  const sheet = card && card.closest(".sheet");
  const stacked = !!(sheet && sheet.dataset.pair !== "on");
  const compact = !!(sheet && sheet.dataset.density === "compact");
  const cardInnerW = card ? card.clientWidth - padX : 260;
  const chipH = sheet ? px(getComputedStyle(sheet).getPropertyValue("--chip-h")) || 40 : 40;
  /* In every stacked layout CSS makes the preview a thumbnail band beside its
     caption. planPreview's 120px floor belongs to a full preview column, so use
     the band's own token-based caps here and preserve the circuit aspect inside
     them. One-and-a-half chip rows stays useful at 100% without overrunning the
     band when a late density measurement switches a 200% sheet to compact. */
  const plan = stacked
    ? {
      shape: "beside",
      slotW: Math.min(cardInnerW * (compact ? 0.38 : 0.42), chipH * (compact ? 3.4 : 3)),
      slotH: chipH * 2.6
    }
    : TrackMaps.planPreview({
      aspect: a,
      cardInnerW: cardInnerW,
      sectionH: section ? section.clientHeight : 0,
      labelH: label ? label.offsetHeight : 0,
      infoH: info ? info.offsetHeight : 0,
      padY: cardCS ? px(cardCS.paddingTop) + px(cardCS.paddingBottom) : 0,
      gap: cardCS ? (px(cardCS.rowGap) || px(cardCS.gap)) : 0
    });
  if (card && plan.shape === "beside") {
    card.setAttribute("data-map-shape", "beside");
    void map.offsetWidth;
  }
  // MEASURABLE means the card is actually laid out. The FIRST call never is:
  // #select is opened by clearing `hidden`, so the card has no box yet and
  // planPreview takes its own documented "pre-layout first paint" fallback —
  // cardInnerW on its 80px floor, sectionH 0, height from the aspect alone.
  // Those are placeholders, not measurements.
  //
  // THAT IS WHY THE PIN IS CONDITIONAL. fitCanvas(pinCss=true) writes inline
  // width/height/max-width/max-height, and an inline style beats any stylesheet
  // rule — so a plan computed from placeholders freezes into the element and
  // nothing later undoes it. MEASURED at 852x393 from a cold load, before this
  // guard: 344px of map in a 260px card, 23px past the viewport bottom, with
  // the caption and all four track facts pushed out. It self-healed on the
  // first circuit click — the one route any probe that clicks before measuring
  // erases, which is why the audit matrix scored that cell green throughout.
  //
  // Unmeasurable: draw at the CSS slot and DO NOT pin, leaving the stylesheet's
  // own caps authoritative for that frame. watchPreviewCard refits with real
  // numbers as soon as the card has a box.
  const measurable = !!(card && card.clientWidth > 0);
  const fit = TrackMaps.fitCanvas(map, plan.slotW, plan.slotH, t, measurable);
  watchPreviewCard(card);
  // Corner markers/casing are drawn at ABSOLUTE canvas px (see TrackMaps.draw),
  // tuned for the canvas's old fixed 520x300 HTML size. fitCanvas now sizes the
  // drawing buffer itself to the measured CSS slot (so a narrow layout gets a
  // narrow buffer), and a fixed-radius marker on a shrunk buffer reads 3-4x
  // oversized relative to the track outline — measured on the live select
  // screen at normal desktop widths, markers overlapping into an unreadable
  // blob. Scale every absolute-px draw param by how far the fitted buffer sits
  // below that 520x300 reference so markers keep the same box-relative size
  // the old fixed-buffer-plus-CSS-shrink rendering always had.
  const mk = Math.min(1, fit.w / 520, fit.h / 300);
  TrackMaps.draw(map, t, {
    color: TrackMaps.themeColor(t), startColor: "#e10600",
    width: Math.max(2, Math.round(4 * mk)), pad: Math.max(10, Math.round(24 * mk)),
    corners: true, cornerR: Math.max(4, Math.round(9 * mk)), cornerFont: Math.max(8, Math.round(11 * mk)),
    sectors: true, drs: true
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
    const wrapW = wrap ? wrap.clientWidth : (window.innerWidth - 24);
    const wrapH = wrap ? wrap.clientHeight : (window.innerHeight - 80);
    const maxW = Math.max(200, wrapW > 0 ? wrapW : Math.min(window.innerWidth - 24, 600));
    const maxH = Math.max(150, wrapH > 0 ? wrapH : Math.round(maxW / 1.2));
    const key = maxW + "x" + maxH;
    if (key === lastFit) return;   // the observer below also fires on our own pin
    lastFit = key;
    const fit = TrackMaps.fitCanvas(cv, maxW, maxH, t, true);
    const mk = Math.min(1, fit.w / 520, fit.h / 300);
    TrackMaps.draw(cv, t, {
      color: TrackMaps.themeColor(t), startColor: "#e10600",
      width: Math.max(2, Math.round(5 * mk)), pad: Math.max(12, Math.round(42 * mk)),
      corners: true, cornerR: Math.max(4, Math.round(6 * mk)), cornerFont: Math.max(8, Math.round(12 * mk)),
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
return { buildSelect, updateTrackPreview, openTrackDetail, closeTrackDetail, setTeamPicker, teamSwatch };
}

return { create };
})();
