/* Apex 26 — the select-screen UI for js/game.js: team/driver/difficulty grids,
   the track picker with live preview map + elevation canvases, and the
   fullscreen circuit-detail modal. Pure DOM; live selection state comes
   through the ctx façade G handed to Menus.create(G). Consumes globals
   Teams, Tracks, TrackMaps. Must load BEFORE js/game.js (see index.html). */
const Menus = (function () {
  "use strict";

function create(G) {
// Stable helpers from the game.js closure.
const { $, els, store, cssCol, fmtTime, ttBoard, tickUi, scheduleFlybyTrack } = G;
const renderStatBars = (...a) => G.renderStatBars(...a);

// Progressive-enhancement screen swap: run a DOM change inside a native
// same-document View Transition when the browser supports it (Baseline 2025)
// for a free crossfade, else run it plainly. Zero dependency, purely visual —
// the swap always happens; only the animation is enhanced. Reduced-motion is
// honoured by the ::view-transition CSS in css/tokens.css.
const vt = (fn) => {
  if (document.startViewTransition) document.startViewTransition(fn);
  else fn();
};

function buildSelect() {
  els.selTitle.textContent = G.seasonMode ? "SEASON — ROUND " + ((G.season && G.season.round || 0) + 1)
    : G.timeTrial ? "TIME TRIAL" : "GRAND PRIX";
  // Track section: interactive circuit picker in GP/TT; read-only NEXT RACE preview in season
  els.selTrackSection.hidden = false;
  if (els.selCircuitLabel) els.selCircuitLabel.textContent = G.seasonMode ? "NEXT RACE" : "CIRCUIT";
  els.selDiffSection.hidden = G.timeTrial;       // no AI in a time trial
  els.selTeams.textContent = "";
  Teams.LIST.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === G.teamIdx ? " active" : "");
    const sw = document.createElement("span"); sw.className = "swatch"; sw.style.background = cssCol(t.color);
    b.append(sw, document.createTextNode(t.short));
    b.onclick = () => { G.teamIdx = i; G.driverIdx = 0; store.set("team", i); vt(() => { buildSelect(); tickUi(); }); };
    els.selTeams.appendChild(b);
  });
  const team = Teams.LIST[G.teamIdx];
  els.selDriver.textContent = "";
  team.drivers.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === G.driverIdx ? " active" : "");
    b.textContent = "#" + d.num + " " + d.name;
    b.onclick = () => { G.driverIdx = i; store.set("driver", i); vt(() => { buildSelect(); tickUi(); }); };
    els.selDriver.appendChild(b);
  });
  renderStatBars($("sel-stats"), team);
  if (G.seasonMode) {
    // Non-interactive preview of the upcoming season circuit
    els.selTracks.textContent = "";
    updateTrackPreview();
    const rnd = (G.season && G.season.round || 0) + 1;
    els.selPreviewRec.textContent = "Round " + rnd + " of " + Tracks.LIST.length;
    // Upcoming rounds list (next 5 circuits after current)
    const upcoming = [];
    for (let i = rnd; i < Math.min(rnd + 5, Tracks.LIST.length); i++) upcoming.push({ n: i + 1, t: Tracks.LIST[i] });
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
    Tracks.LIST.forEach((t, i) => {
      const row = document.createElement("button");
      row.className = "track-row" + (i === G.trackIdx ? " active" : "");
      row.setAttribute("aria-label", t.name);

      const nm = document.createElement("span");
      nm.className = "track-row-name";
      nm.textContent = t.name;
      if (t.night) { const b = document.createElement("span"); b.className = "trb trb-night"; b.textContent = "NIGHT"; nm.appendChild(b); }
      if (t.street) { const b = document.createElement("span"); b.className = "trb trb-street"; b.textContent = "STREET"; nm.appendChild(b); }
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
  els.selDiff.textContent = "";
  ["easy", "normal", "hard"].forEach((d) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (d === G.difficulty ? " active" : "");
    b.textContent = d.toUpperCase();
    b.onclick = () => { G.difficulty = d; store.set("difficulty", d); vt(() => { buildSelect(); tickUi(); }); };
    els.selDiff.appendChild(b);
  });
}

// large preview of the currently-selected circuit: sector-coloured outline,
// DRS zones, numbered corners, name / GP / length / turn count, track facts.
function updateTrackPreview() {
  if (!els.selPreviewMap) return;
  const t = Tracks.LIST[G.trackIdx];
  if (!t) return;
  TrackMaps.draw(els.selPreviewMap, t, {
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
  const elevCv = document.getElementById("sel-preview-elev");
  if (elevCv) {
    const py = TrackMaps.elevProfile(t);
    const elevR = TrackMaps.elevRange(t);
    if (py && py.length > 2 && elevR > 2) {
      elevCv.hidden = false;
      const ew = elevCv.width, eh = elevCv.height;
      const eg = elevCv.getContext("2d");
      eg.clearRect(0, 0, ew, eh);
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < py.length; i++) { if (py[i] < mn) mn = py[i]; if (py[i] > mx) mx = py[i]; }
      const span = mx - mn || 1;
      const pad = 3;
      function yNorm(v) { return eh - pad - ((v - mn) / span) * (eh - 2 * pad); }
      eg.beginPath();
      for (let i = 0; i <= py.length; i++) {
        const px = (i / py.length) * ew;
        i === 0 ? eg.moveTo(px, yNorm(py[0])) : eg.lineTo(px, yNorm(py[i % py.length]));
      }
      eg.lineTo(ew, eh); eg.lineTo(0, eh); eg.closePath();
      eg.fillStyle = "rgba(57,183,240,0.18)";
      eg.fill();
      eg.strokeStyle = "rgba(57,183,240,0.7)"; eg.lineWidth = 1.5;
      eg.beginPath();
      for (let i = 0; i <= py.length; i++) {
        const px = (i / py.length) * ew;
        i === 0 ? eg.moveTo(px, yNorm(py[0])) : eg.lineTo(px, yNorm(py[i % py.length]));
      }
      eg.stroke();
      // Y-axis elevation labels (top = max, bottom = min)
      eg.font = "8px monospace";
      eg.fillStyle = "rgba(57,183,240,0.75)";
      eg.textAlign = "right";
      eg.fillText("+" + Math.round(mx) + "m", ew - 2, 9);
      eg.fillText(Math.round(mn) + "m", ew - 2, eh - 1);
    } else {
      elevCv.hidden = true;
    }
  }
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

  // Elevation sparkline
  var elevWrap = document.getElementById("track-detail-elev-wrap");
  var elevCv = document.getElementById("track-detail-elev");
  if (elevWrap && elevCv) {
    const py = TrackMaps.elevProfile(t);
    const elevR = TrackMaps.elevRange(t);
    if (py && py.length > 2 && elevR > 2) {
      elevWrap.hidden = false;
      const ew = elevCv.width, eh = elevCv.height;
      const eg = elevCv.getContext("2d");
      eg.clearRect(0, 0, ew, eh);
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < py.length; i++) { if (py[i] < mn) mn = py[i]; if (py[i] > mx) mx = py[i]; }
      const span = mx - mn || 1;
      const pad = 3;
      function yNorm(v) { return eh - pad - ((v - mn) / span) * (eh - 2 * pad); }
      eg.beginPath();
      for (let i = 0; i <= py.length; i++) {
        const ex = (i / py.length) * ew;
        i === 0 ? eg.moveTo(ex, yNorm(py[0])) : eg.lineTo(ex, yNorm(py[i % py.length]));
      }
      eg.lineTo(ew, eh); eg.lineTo(0, eh); eg.closePath();
      eg.fillStyle = "rgba(57,183,240,0.18)"; eg.fill();
      eg.strokeStyle = "rgba(57,183,240,0.7)"; eg.lineWidth = 1.5;
      eg.beginPath();
      for (let i = 0; i <= py.length; i++) {
        const ex = (i / py.length) * ew;
        i === 0 ? eg.moveTo(ex, yNorm(py[0])) : eg.lineTo(ex, yNorm(py[i % py.length]));
      }
      eg.stroke();
      eg.font = "8px monospace"; eg.fillStyle = "rgba(57,183,240,0.75)"; eg.textAlign = "right";
      eg.fillText("+" + Math.round(mx) + "m", ew - 2, 9);
      eg.fillText(Math.round(mn) + "m", ew - 2, eh - 1);
    } else {
      elevWrap.hidden = true;
    }
  }

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

  // Turns list
  const list = document.getElementById("track-detail-list");
  list.innerHTML = crns.map(function (c) {
    const cls = c.v > 0.025 ? "tdc-hairpin" : c.v > 0.013 ? "tdc-slow" : c.v > 0.008 ? "tdc-medium" : "tdc-fast";
    const lbl = c.v > 0.025 ? "HAIRPIN" : c.v > 0.013 ? "SLOW" : c.v > 0.008 ? "MEDIUM" : "FAST";
    return '<div class="tdc-corner"><span class="tdc-num">T' + c.n + '</span><span class="' + cls + '">' + lbl + '</span></div>';
  }).join("");

  // Crossfade into the full-screen circuit-detail modal (progressive
  // enhancement; the content above is already populated while hidden).
  vt(() => { modal.hidden = false; });
  const cv = document.getElementById("track-detail-canvas");
  requestAnimationFrame(function () {
    // Compute the track's natural aspect ratio from its outline points so the
    // canvas matches the circuit shape instead of being CSS-stretched.
    let trackAspect = 1.2;
    const pts = TrackMaps.outline(t);
    if (pts && pts.length > 2) {
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][0] < minx) minx = pts[i][0]; if (pts[i][0] > maxx) maxx = pts[i][0];
        if (pts[i][1] < miny) miny = pts[i][1]; if (pts[i][1] > maxy) maxy = pts[i][1];
      }
      trackAspect = Math.max(0.5, Math.min(2.5, (maxx - minx) / ((maxy - miny) || 1)));
    }
    const wrap = document.getElementById("track-detail-canvas-wrap");
    const wrapW = wrap ? wrap.clientWidth : (window.innerWidth - 24);
    const wrapH = wrap ? wrap.clientHeight : (window.innerHeight - 80);
    let canvW, canvH;
    if (wrapH > 0 && wrapW > 0) {
      // Fit canvas within wrapper preserving track aspect ratio
      canvH = wrapH;
      canvW = Math.round(canvH * trackAspect);
      if (canvW > wrapW) { canvW = wrapW; canvH = Math.round(canvW / trackAspect); }
    } else {
      canvW = Math.min(window.innerWidth - 24, 600);
      canvH = Math.round(canvW / trackAspect);
    }
    cv.width = Math.max(200, Math.round(canvW));
    cv.height = Math.max(150, Math.round(canvH));
    cv.style.width = cv.width + "px";
    cv.style.height = cv.height + "px";
    TrackMaps.draw(cv, t, {
      color: TrackMaps.themeColor(t), startColor: "#e10600",
      width: 5, pad: 30, corners: true, cornerR: 12, cornerFont: 13,
      sectors: true, drs: true
    });
  });
}
return { buildSelect, updateTrackPreview, openTrackDetail };
}

return { create };
})();
