/* Apex 26 — the select-screen UI for js/game.js: the track picker with its live
   preview map + elevation canvases, and the fullscreen circuit-detail modal.
   The screen answers WHERE you race and nothing else — who you are and what you
   drive belong to the garage (js/game/setup-ui.js), which START opens on the
   way to the race. It used to carry a YOUR CAR summary card and a GARAGE button
   as well, and won at neither job.
   Also owns the shared team-picker sheet (#teampicker) that the garage opens.
   Pure DOM; live selection state comes through the ctx façade G handed to
   Menus.create(G). Consumes globals Teams, Tracks, TrackMaps.
   Must load BEFORE js/game.js (see index.html). */
const Menus = (function () {
  "use strict";

function create(G) {
// Stable helpers from the game.js closure.
const { $, els, store, cssCol, fmtTime, ttBoard, tickUi, scheduleFlybyTrack } = G;

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

// ---- full-screen team picker ----------------------------------------------
// The twelve-way team choice, opened from the garage's TEAM & DRIVER tab. It
// used to be reachable from a summary card on the select screen too; that card
// is gone, and the garage is the one place a team is chosen.
const teamPicker = () => $("teampicker");
// Which screen opened the picker, so picking a team rebuilds the right one.
// The sheet is shared; without this, choosing a team in the garage would
// silently rebuild the select screen behind it and leave the garage stale.
let pickerHost = "select";

function teamSwatch(t) {
  const sw = document.createElement("span");
  sw.className = "tm-colour";
  // Two-tone: the livery's primary with its accent as a stripe, which is what
  // makes teams distinguishable at a glance (several 2026 cars are near-black).
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
      // The old team's driver index means nothing here, so this used to reset
      // to seat 0 flat. In a friend race seat 0 may be the seat the other
      // player is in, which dropped you straight into a taken seat with a
      // disabled chip underneath you. Take the first seat nobody holds; the
      // seat-clash rule in js/net/lobby.js catches the simultaneous case.
      let seat = 0;
      while (seat < t.drivers.length - 1 && isTaken(seat)) seat++;
      G.teamIdx = i; G.driverIdx = seat; store.set("team", i);
      store.set("driver", seat);
      setTeamPicker(false);
      // Rebuild whichever screen opened the sheet. The garage repaints its own
      // 3D car for free — getSetupPreviewMesh() is keyed on the team id.
      if (pickerHost === "garage") { G.buildSetup(); tickUi(); }
      else vt(() => { buildSelect(); tickUi(); });
    };
    els.selTeams.appendChild(b);
  });
}

// Panes only measure themselves when something tells them to; opening a sheet
// is exactly such a moment (see js/game/scrollfade.js).
const ScrollFadeRefresh = () => { if (window.ScrollFade) window.ScrollFade.refresh(); };

// Circuit list filter: all / championship calendar / retired classics.
// Persisted so a player who only races classics does not re-tap every open.
let trackFilter = store.get("trackFilter", "all");
if (trackFilter !== "all" && trackFilter !== "season" && trackFilter !== "classic") trackFilter = "all";

function trackFilterBar() {
  const bar = document.createElement("div");
  bar.id = "sel-track-filter";
  bar.className = "sel-chip-row";
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Circuit filter");
  [["all", "ALL"], ["season", "SEASON"], ["classic", "CLASSICS"]].forEach(([id, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sel-chip" + (trackFilter === id ? " active" : "");
    b.dataset.filter = id;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", trackFilter === id ? "true" : "false");
    b.textContent = label;
    b.onclick = (e) => {
      e.stopPropagation();
      trackFilter = id;
      store.set("trackFilter", id);
      if (G.soundOn && window.GameAudio) GameAudio.uiSelect();
      vt(() => { buildSelect(); tickUi(); });
    };
    bar.appendChild(b);
  });
  return bar;
}

function buildSelect() {
  // ONE QUESTION: WHERE. The car summary and its GARAGE button that used to
  // share this screen are gone (index.html) — WHO and WHAT are chosen in the
  // garage, which START now opens on the way to the race. So the only thing
  // that differs between modes here is what the screen is called and what the
  // foot button promises next.
  const room = !!G.netRoom;
  els.selGo.textContent = room ? "NEXT" : "START";
  els.selTitle.textContent = room ? "THE RACE"
    : G.seasonMode ? "SEASON — ROUND " + ((G.season && G.season.round || 0) + 1)
    : G.timeTrial ? "TIME TRIAL" : "GRAND PRIX";
  // Track section: interactive circuit picker in GP/TT; read-only NEXT RACE preview in season
  els.selTrackSection.hidden = false;
  if (els.selCircuitLabel) els.selCircuitLabel.textContent = G.seasonMode ? "NEXT RACE" : "CIRCUIT";
  if (G.seasonMode) {
    // Non-interactive preview of the upcoming season circuit
    els.selTracks.textContent = "";
    updateTrackPreview();
    const rnd = (G.season && G.season.round || 0) + 1;
    els.selPreviewRec.textContent = "Round " + rnd + " of " + Tracks.SEASON.length;
    // Upcoming rounds list (next 5 circuits after current). Indexes SEASON, not
    // LIST — classics are playable but never a championship round.
    const upcoming = [];
    for (let i = rnd; i < Math.min(rnd + 5, Tracks.SEASON.length); i++) upcoming.push({ n: i + 1, t: Tracks.SEASON[i] });
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
    // Two groups: the championship calendar, then the retired circuits. Only the
    // header changes — every row is a normal, selectable track either way.
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
        head.textContent = g;
        els.selTracks.appendChild(head);
      }
      const row = document.createElement("button");
      row.className = "track-row" + (i === G.trackIdx ? " active" : "");
      row.setAttribute("aria-label", t.name);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", i === G.trackIdx ? "true" : "false");

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

      row.onclick = () => { G.trackIdx = i; store.set("track", i); vt(() => { buildSelect(); tickUi(); }); scheduleFlybyTrack(); };
      els.selTracks.appendChild(row);
    });
    updateTrackPreview();
  }
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

// large preview of the currently-selected circuit: sector-coloured outline,
// DRS zones, numbered corners, name / GP / length / turn count, track facts.
function updateTrackPreview() {
  if (!els.selPreviewMap) return;
  const t = Tracks.LIST[G.trackIdx];
  if (!t) return;
  // Size the bitmap to the circuit's own aspect inside the CSS slot. A fixed
  // 520×300 canvas displayed under max-height caps (or UI zoom reshaping the
  // card) was getting CSS-squashed; fitCanvas + object-fit:contain keep the
  // outline true while --ui-scale zoom still enlarges the whole sheet.
  const map = els.selPreviewMap;
  const a = TrackMaps.aspect(t);
  // Clear prior pins so the stylesheet width / max-height slot can be measured.
  map.style.width = "";
  map.style.height = "";
  map.style.maxWidth = "";
  map.style.maxHeight = "";
  map.style.aspectRatio = String(a);
  void map.offsetWidth;
  const slotW = Math.max(120, map.clientWidth || 260);
  let slotH = Math.max(72, map.clientHeight || Math.round(slotW / a));
  // Mirror the CSS max-height caps in JS. Percentage max-height often fails to
  // bind while height is `auto` (indefinite containing-block height), then
  // clamps AFTER we pin a definite height — which is the stretch. Fitting
  // against the same cap the stylesheet intends keeps aspect and the facts.
  const card = map.closest("#sel-track-preview");
  const inner = document.getElementById("sel-inner");
  if (card && inner) {
    const cardH = card.clientHeight;
    if (cardH > 0) {
      if (inner.getAttribute("data-pair") === "on" && inner.getAttribute("data-shape") !== "tall") {
        slotH = Math.min(slotH, Math.max(72, Math.floor(cardH * 0.5)));
      } else if (inner.getAttribute("data-shape") === "tall") {
        // css: max-height: calc(100% - 9.5rem) — 9.5rem ≈ caption block.
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        slotH = Math.min(slotH, Math.max(72, Math.floor(cardH - 9.5 * rem)));
      }
    }
  }
  TrackMaps.fitCanvas(map, slotW, slotH, t, true);
  TrackMaps.draw(map, t, {
    color: TrackMaps.themeColor(t), startColor: "#e10600",
    width: 4, pad: 24, corners: true, cornerR: 9, cornerFont: 11,
    sectors: true, drs: true
  });
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
  } else {
    els.selPreviewRec.textContent = "";
  }
  // Track facts: direction arrow, elevation badge, slowest corner callout
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

  // Elevation profile chart (shown only when there is meaningful elevation data)
  drawElevProfile(document.getElementById("sel-preview-elev"), t);
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
  vt(() => { modal.hidden = false; });
  const cv = document.getElementById("track-detail-canvas");
  requestAnimationFrame(function () {
    // Fit the canvas to the wrap in local (pre-zoom) CSS pixels. clientWidth
    // is correct inside `zoom: var(--ui-scale)` sheets; gBCR would mix visual
    // pixels and re-introduce stretch at UI SIZE ≠ 100%.
    const wrap = document.getElementById("track-detail-canvas-wrap");
    const wrapW = wrap ? wrap.clientWidth : (window.innerWidth - 24);
    const wrapH = wrap ? wrap.clientHeight : (window.innerHeight - 80);
    const maxW = Math.max(200, wrapW > 0 ? wrapW : Math.min(window.innerWidth - 24, 600));
    const maxH = Math.max(150, wrapH > 0 ? wrapH : Math.round(maxW / 1.2));
    TrackMaps.fitCanvas(cv, maxW, maxH, t, true);
    TrackMaps.draw(cv, t, {
      color: TrackMaps.themeColor(t), startColor: "#e10600",
      width: 5, pad: 42, corners: true, cornerR: 6, cornerFont: 12,
      sectors: true, drs: true
    });
  });
}
return { buildSelect, updateTrackPreview, openTrackDetail, setTeamPicker, teamSwatch };
}

return { create };
})();
