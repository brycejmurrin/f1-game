/* Apex 26 — UI wiring: car-setup panel, select screen, track detail, menus,
 * pause menu, steering presets & sliders, sound/music toggles, lighting-tuner
 * panel. Function declarations live at module level; ALL eval-time event
 * wiring runs inside AXUi.init(deps), called once from game.js's boot block
 * (DOM is ready and every game.js function the handlers close over is passed
 * in via deps). */
"use strict";

const AXUi = (function () {
"use strict";

const { CAM_MODES, GAME_LAPS, TT_LAPS, naturalGear } = AXC;
const { store, ttBoard } = AX;
const { scheduleFlybyTrack } = AXTrack;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// game.js closures, handed over via init(deps) at boot:
let els, announce, buildStandings, cssCol, fmtTime, gearsManual, getTeamParts,
    hexToRgb, loadCustomTeam, quitToMenu, recomputePlayerMods, rgbToHex,
    saveTeamParts, showTouchControls, startRace, syncCustomTeam,
    LT, TUNE_DEFS, _ltStore, ltKey, setLightTune, persistLightTune, applyLightTune;

// ---------- car setup panel ----------
const CS_STATS = [
  { key: "speed",     label: "SPEED" },
  { key: "accel",     label: "ACCEL" },
  { key: "cornering", label: "CORNERING" },
  { key: "braking",   label: "BRAKING" },
];

// Render the four stat bars (base + part boost overlay) for a team into a
// container. Shared by the select screen (always-on) and the setup panel.
function renderStatBars(container, team) {
  const stats = team.stats || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const mods = Parts.getMods(getTeamParts(team.id), team.engine);
  container.textContent = "";
  for (const { key, label } of CS_STATS) {
    const base = stats[key] || 75;
    const effective = Math.round(Math.min(110, base * mods[key]));
    const delta = effective - base;

    const row = document.createElement("div");
    row.className = "cs-stat-row";

    const lbl = document.createElement("span");
    lbl.className = "cs-stat-label";
    lbl.textContent = label;

    const barWrap = document.createElement("div");
    barWrap.className = "cs-stat-bar-wrap";

    const baseBar = document.createElement("div");
    baseBar.className = "cs-stat-base";
    baseBar.style.width = Math.min(base, 100) + "%";

    const boostBar = document.createElement("div");
    boostBar.className = "cs-stat-boost" + (delta < 0 ? " penalty" : "");
    if (delta >= 0) {
      boostBar.style.left = Math.min(base, 100) + "%";
      boostBar.style.width = Math.min(delta, 10) + "%";
    } else {
      boostBar.style.left = Math.max(0, base + delta) + "%";
      boostBar.style.width = Math.min(-delta, base) + "%";
    }

    barWrap.append(baseBar, boostBar);

    const val = document.createElement("span");
    val.className = "cs-stat-val" + (delta > 0 ? " up" : delta < 0 ? " down" : "");
    val.textContent = effective;

    row.append(lbl, barWrap, val);
    container.appendChild(row);
  }
}

function buildSetup() {
  const team = Teams.LIST[AX.teamIdx];
  const parts = getTeamParts(team.id);

  // Drop any saved exclusive option the current team can't use
  let partsChanged = false;
  for (const cat of Parts.CATALOG) {
    const selId = parts[cat.id];
    if (selId) {
      const opt = cat.options.find((o) => o.id === selId);
      if (opt && opt.supplier && opt.supplier !== team.engine) {
        delete parts[cat.id];
        partsChanged = true;
      }
    }
  }
  if (partsChanged) saveTeamParts(team.id, parts);

  const spent = Parts.getCost(parts, team.engine);
  const remaining = Parts.BUDGET - spent;

  $("cs-team").textContent = team.name.toUpperCase();

  const budgetEl = $("cs-budget");
  const budgetFill = $("cs-budget-fill");
  const unlimitedBtn = $("cs-unlimited");
  if (budgetEl) {
    if (AX.unlimitedBudget) {
      budgetEl.textContent = "FREE BUILD — no budget limit";
      budgetEl.className = "unlimited";
    } else {
      budgetEl.textContent = "BUDGET: " + remaining + " / " + Parts.BUDGET + " cr remaining";
      budgetEl.className = remaining < 0 ? "over" : remaining < 100 ? "tight" : "";
    }
  }
  if (budgetFill) {
    budgetFill.style.transform = AX.unlimitedBudget ? "scaleX(0)" : "scaleX(" + Math.max(0, Math.min(1, spent / Parts.BUDGET)) + ")";
  }
  if (unlimitedBtn) {
    unlimitedBtn.textContent = AX.unlimitedBudget ? "∞ FREE BUILD: ON" : "∞ FREE BUILD";
    unlimitedBtn.className = "cs-unlimited-btn" + (AX.unlimitedBudget ? " on" : "");
  }

  const body = $("cs-body");
  body.textContent = "";

  for (const cat of Parts.CATALOG) {
    const section = document.createElement("div");
    section.className = "cs-cat-section";

    const catLbl = document.createElement("div");
    catLbl.className = "cs-cat";
    catLbl.textContent = cat.label;
    section.appendChild(catLbl);

    const desc = document.createElement("div");
    desc.className = "cs-desc";
    const curId = parts[cat.id] || Parts.DEFAULTS[cat.id];
    // Resolve active option respecting supplier lock
    const curOpt = cat.options.find((o) => o.id === curId && (!o.supplier || o.supplier === team.engine))
                || cat.options.find((o) => o.id === Parts.DEFAULTS[cat.id]);
    desc.textContent = curOpt ? curOpt.desc : "";
    section.appendChild(desc);

    const chips = document.createElement("div");
    chips.className = "cs-chips";
    for (const opt of cat.options) {
      // Hide exclusive options belonging to other suppliers
      if (opt.supplier && opt.supplier !== team.engine) continue;

      const active = curOpt && curOpt.id === opt.id;
      const curCost = curOpt ? (curOpt.cost || 0) : 0;
      const costDelta = (opt.cost || 0) - curCost;
      const wouldExceed = !active && !AX.unlimitedBudget && (spent + costDelta > Parts.BUDGET);

      const chip = document.createElement("button");
      chip.className = "cs-chip"
        + (active ? " active" : "")
        + (wouldExceed ? " over-budget" : "")
        + (opt.tag ? " exclusive" : "");

      const labelSpan = document.createElement("span");
      labelSpan.textContent = opt.label;
      chip.appendChild(labelSpan);

      if (opt.tag) {
        const tagBadge = document.createElement("span");
        tagBadge.className = "cs-chip-tag";
        tagBadge.textContent = opt.tag;
        chip.appendChild(tagBadge);
      } else if (opt.cost > 0) {
        const badge = document.createElement("span");
        badge.className = "cs-chip-cost";
        badge.textContent = opt.cost + "cr";
        chip.appendChild(badge);
      }

      chip.addEventListener("mouseenter", () => { desc.textContent = opt.desc; });
      chip.addEventListener("focus",      () => { desc.textContent = opt.desc; });
      chip.addEventListener("mouseleave", () => {
        const c = cat.options.find((o) => o.id === (getTeamParts(team.id)[cat.id] || Parts.DEFAULTS[cat.id]));
        desc.textContent = c ? c.desc : "";
      });
      chip.addEventListener("blur", () => {
        const c = cat.options.find((o) => o.id === (getTeamParts(team.id)[cat.id] || Parts.DEFAULTS[cat.id]));
        desc.textContent = c ? c.desc : "";
      });

      chip.onclick = () => {
        const p = getTeamParts(team.id);
        const co = cat.options.find((o) => o.id === (p[cat.id] || Parts.DEFAULTS[cat.id]));
        const cc = co ? (co.cost || 0) : 0;
        if (!AX.unlimitedBudget && (Parts.getCost(p, team.engine) - cc + (opt.cost || 0)) > Parts.BUDGET) {
          chip.classList.add("budget-reject");
          chip.addEventListener("animationend", () => chip.classList.remove("budget-reject"), { once: true });
          if (AX.soundOn) GameAudio.uiTick();
          return;
        }
        p[cat.id] = opt.id;
        saveTeamParts(team.id, p);
        if (AX.soundOn) GameAudio.uiTick();
        buildSetup();
      };

      chips.appendChild(chip);
    }
    section.appendChild(chips);
    body.appendChild(section);
  }
  renderStatBars($("cs-stats-inner"), team);
}

function openSetup() {
  buildSetup();
  $("carsetup").hidden = false;
}

// ---------- UI wiring ----------
function buildSelect() {
  els.selTitle.textContent = AX.seasonMode ? "SEASON — ROUND " + ((AX.season && AX.season.round || 0) + 1)
    : AX.timeTrial ? "TIME TRIAL" : "GRAND PRIX";
  // Track section: interactive circuit picker in GP/TT; read-only NEXT RACE preview in season
  els.selTrackSection.hidden = false;
  if (els.selCircuitLabel) els.selCircuitLabel.textContent = AX.seasonMode ? "NEXT RACE" : "CIRCUIT";
  els.selDiffSection.hidden = AX.timeTrial;       // no AI in a time trial
  els.selTeams.textContent = "";
  Teams.LIST.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === AX.teamIdx ? " active" : "");
    const sw = document.createElement("span"); sw.className = "swatch"; sw.style.background = cssCol(t.color);
    b.append(sw, document.createTextNode(t.short));
    b.onclick = () => { AX.teamIdx = i; AX.driverIdx = 0; store.set("team", i); buildSelect(); tickUi(); };
    els.selTeams.appendChild(b);
  });
  const team = Teams.LIST[AX.teamIdx];
  els.selDriver.textContent = "";
  team.drivers.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === AX.driverIdx ? " active" : "");
    b.textContent = "#" + d.num + " " + d.name;
    b.onclick = () => { AX.driverIdx = i; store.set("driver", i); buildSelect(); tickUi(); };
    els.selDriver.appendChild(b);
  });
  renderStatBars($("sel-stats"), team);
  if (AX.seasonMode) {
    // Non-interactive preview of the upcoming season circuit
    els.selTracks.textContent = "";
    updateTrackPreview();
    const rnd = (AX.season && AX.season.round || 0) + 1;
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
      row.className = "track-row" + (i === AX.trackIdx ? " active" : "");
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

      if (AX.timeTrial) {
        const board = ttBoard(t.id);
        const rec = board.length ? board[0].t : Infinity;
        const recEl = document.createElement("span");
        recEl.className = "track-row-rec";
        recEl.textContent = isFinite(rec) ? "★ " + fmtTime(rec) : "—";
        row.appendChild(recEl);
      }

      row.onclick = () => { AX.trackIdx = i; store.set("track", i); buildSelect(); tickUi(); scheduleFlybyTrack(); };
      els.selTracks.appendChild(row);
    });
    updateTrackPreview();
  }
  els.selDiff.textContent = "";
  ["easy", "normal", "hard"].forEach((d) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (d === AX.difficulty ? " active" : "");
    b.textContent = d.toUpperCase();
    b.onclick = () => { AX.difficulty = d; store.set("difficulty", d); buildSelect(); tickUi(); };
    els.selDiff.appendChild(b);
  });
}

// large preview of the currently-selected circuit: sector-coloured outline,
// DRS zones, numbered corners, name / GP / length / turn count, track facts.
function updateTrackPreview() {
  if (!els.selPreviewMap) return;
  const t = Tracks.LIST[AX.trackIdx];
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
  if (AX.timeTrial) {
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
  const t = Tracks.LIST[AX.trackIdx];
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

  modal.hidden = false;
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

function tickUi() { if (AX.soundOn) GameAudio.uiTick(); }

function steerLabel() {
  if (AX.steerMode === "buttons") return "STEER: BUTTONS";
  if (AX.steerMode === "touch") return "STEER: TOUCH";
  // Only warn when the gyro is genuinely unavailable/denied — not in the brief
  // window before the first sensor reading arrives (which would falsely show
  // "(NO GYRO)" on phones that have a working gyro).
  return "STEER: TILT" + (Input.gyroDenied ? " (NO GYRO)" : "");
}

function enableTilt() {
  // Must run inside a user gesture for the iOS permission prompt.
  Input.requestGyro().then((ok) => {
    if (ok) {
      Input.calibrate();
    } else if (Input.gyroDenied) {
      // Permission denied — fall back to buttons so the player can still steer.
      // (Staying in tilt mode with no sensor data leaves steer locked at 0 and
      // the car just follows ROAD_FOLLOW, appearing to "auto-drive" the racing line.)
      setSteerMode("buttons");
    }
    $("pm-steer").textContent = steerLabel();
    els.audiostate.textContent = ok && Input.tiltActive() ? "tilt steering ready"
      : (Input.gyroDenied ? "motion access denied — switched to buttons" : "");
  });
}

function firstGesture() {
  GameAudio.init();
  GameAudio.setEnabled(AX.soundOn);
  GameAudio.setMusicEnabled(AX.musicEnabled);
  // Tilt permission is requested at race start (rs-go click), not here — so the
  // gyro prompt and button fallback don't appear on the title screen.
  if (AX.soundOn) GameAudio.startMusic(-1);
}
function setSound(b) {
  AX.soundOn = b; store.set("sound", b);
  GameAudio.setEnabled(b);
  els.soundbtn.textContent = b ? "♪ ON" : "♪ OFF";
  $("pm-sound").textContent = "SOUND: " + (b ? "ON" : "OFF");
  if (!b) { GameAudio.stopMusic(); GameAudio.stopEngine(); }
  else { if (AX.state === "menu") GameAudio.startMusic(-1); }
}

// Music on/off, independent of the master sound toggle: engine + SFX keep
// playing with music off.
function setMusic(b) {
  AX.musicEnabled = b; store.set("music", b);
  GameAudio.setMusicEnabled(b);
  $("pm-music").textContent = "MUSIC: " + (b ? "ON" : "OFF");
}
// ── LIGHTING TUNER ── opened from the pause menu; the pause menu hides while
// it's open so the live preview is unobstructed (tick() keeps render() running
// with physics paused), and DONE returns to the pause menu. Rows are generated
// once from TUNE_DEFS; values persist via localStorage (apex26.lightTune).
function fmtTune(d, v) {
  if (d.fmt === "auto" && v < 0) return "AUTO";
  const dec = (String(d.step).split(".")[1] || "").length;
  const s = v.toFixed(Math.min(dec, 3));
  return d.fmt === "signed" && v > 0 ? "+" + s : s;
}
// PREVIEW conditions: the tuner tunes GLOBAL values that only take visible
// effect under the right conditions (night sliders do nothing on a day track,
// wet reflections need a wet road). So a track with a FIXED time/weather could
// hide half the controls. These buttons flip the live session's time-of-day and
// weather so every value can be dialled in on any circuit; the original race
// settings are captured on open and restored on DONE, so previewing never
// changes the race you go back to.
let _ltPrevTOD = null, _ltPrevWx = null;
const LT_TODS = ["dawn", "day", "dusk", "night", "default"];
const LT_WX = ["dry", "wet", "rain", "fog", "overcast"];
function refreshLtPreviewActive() {
  const tod = __apex.setTimeOfDay(), wx = __apex.weather();
  for (const t of LT_TODS) { const el = $("lt-tod-" + t); if (el) el.classList.toggle("on", t === tod); }
  for (const w of LT_WX) { const el = $("lt-wx-" + w); if (el) el.classList.toggle("on", w === wx); }
}
// Show which per-condition profile is being edited, e.g. "MONZA · NIGHT · WET".
function updateLtProfileLabel() {
  const host = $("lt-profile"); if (!host) return;
  const key = ltKey();
  if (!key) { host.textContent = ""; return; }
  const [id, tod, wx] = key.split("|");
  const name = (AX.track && AX.track.def && AX.track.def.name) || id;
  const nOver = _ltStore[key] ? Object.keys(_ltStore[key]).length : 0;
  host.textContent = name.toUpperCase() + " · " + tod.toUpperCase() + " · " + wx.toUpperCase() +
    (nOver ? "  (" + nOver + " tuned)" : "  (defaults)");
}
function buildLtPreview() {
  const host = $("lt-preview");
  if (host.dataset.built) return;
  host.dataset.built = "1";
  const mkGroup = (title, ids, labels, onPick, prefix) => {
    const sec = document.createElement("h3");
    sec.className = "adv-sec"; sec.textContent = title;
    host.appendChild(sec);
    const row = document.createElement("div");
    row.className = "opt-row lt-preview-row";
    ids.forEach((id, i) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn"; btn.id = prefix + id; btn.textContent = labels[i];
      // Switching a condition re-applies that condition's profile (via
      // applyRaceSettings→applyLightTune), so reload the sliders + label too.
      btn.onclick = () => { onPick(id); refreshLtPreviewActive(); refreshLightTunePanel(); };
      row.appendChild(btn);
    });
    host.appendChild(row);
  };
  mkGroup("PREVIEW TIME", LT_TODS, ["DAWN", "DAY", "DUSK", "NIGHT", "TRACK"],
    (t) => __apex.setTimeOfDay(t), "lt-tod-");
  mkGroup("PREVIEW WEATHER", LT_WX, ["DRY", "WET", "RAIN", "FOG", "CLOUD"],
    (w) => __apex.weather(w), "lt-wx-");
  const note = document.createElement("p");
  note.className = "adv-help"; note.style.display = "block";
  note.textContent = "Switch conditions to tune each one — your edits save to that track+time+weather. The live view snaps back to the race's own conditions on DONE.";
  host.appendChild(note);
}
function buildLightTunePanel() {
  buildLtPreview();
  const host = $("lt-rows");
  if (!host.dataset.built) {
    host.dataset.built = "1";
    let group = null;
    for (const d of TUNE_DEFS) {
      if (d.group !== group) {
        group = d.group;
        const h = document.createElement("h3");
        h.className = "adv-sec"; h.textContent = group;
        host.appendChild(h);
      }
      const item = document.createElement("div");
      item.className = "adv-item";
      const lab = document.createElement("label"); lab.className = "tune-row";
      const span = document.createElement("span"); span.className = "tune-label";
      span.textContent = d.label + " ";
      const b = document.createElement("b"); b.id = "lt-v-" + d.id;
      span.appendChild(b);
      const inp = document.createElement("input");
      inp.type = "range"; inp.min = d.min; inp.max = d.max; inp.step = d.step;
      inp.id = "lt-in-" + d.id;
      inp.setAttribute("aria-label", d.label);
      inp.oninput = () => {
        setLightTune(d.id, parseFloat(inp.value));
        b.textContent = fmtTune(d, LT[d.id]);
        persistLightTune();
      };
      lab.appendChild(span); lab.appendChild(inp);
      item.appendChild(lab);
      if (d.help) { const p = document.createElement("p"); p.className = "adv-help"; p.textContent = d.help; item.appendChild(p); }
      host.appendChild(item);
    }
  }
  document.getElementById("lighting-inner").classList.toggle("lt-show-help", $("lt-help-on").checked);
  refreshLightTunePanel();
}
function refreshLightTunePanel() {
  for (const d of TUNE_DEFS) {
    const inp = $("lt-in-" + d.id), b = $("lt-v-" + d.id);
    if (inp) inp.value = LT[d.id];
    if (b) b.textContent = fmtTune(d, LT[d.id]);
  }
  updateLtProfileLabel();
}

function buildRaceSettings() {
  const lapOpts = AX.timeTrial ? [3, 5, 8] : [3, 5, 10, 25, 57];
  const lapsEl = $("rs-laps");
  lapsEl.innerHTML = "";
  for (const n of lapOpts) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (AX.raceLaps === n ? " active" : "");
    b.textContent = n === 57 ? "57 (FULL)" : String(n);
    b.onclick = () => { AX.raceLaps = n; buildRaceSettings(); if (AX.soundOn) GameAudio.uiTick(); };
    lapsEl.appendChild(b);
  }
  const weatherEl = $("rs-weather");
  weatherEl.innerHTML = "";
  for (const [id, label, icon] of [["dry", "DRY", "☀"], ["wet", "WET", "💧"], ["rain", "RAIN", "🌧"], ["overcast", "CLOUDY", "☁"], ["fog", "FOG", "🌫"]]) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (AX.raceWeather === id ? " active" : "");
    b.textContent = icon + " " + label;
    b.onclick = () => { AX.raceWeather = id; buildRaceSettings(); if (AX.soundOn) GameAudio.uiTick(); };
    weatherEl.appendChild(b);
  }
  const timeEl = $("rs-time");
  timeEl.innerHTML = "";
  for (const [id, label] of [["default", "DEFAULT"], ["dawn", "DAWN"], ["day", "DAY"], ["dusk", "DUSK"], ["night", "NIGHT"]]) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (AX.raceTimeOfDay === id ? " active" : "");
    b.textContent = label;
    b.onclick = () => { AX.raceTimeOfDay = id; buildRaceSettings(); if (AX.soundOn) GameAudio.uiTick(); };
    timeEl.appendChild(b);
  }
}

// ---- customize my team ----
function czPreview() {
  $("cz-swatch1").style.background = $("cz-color").value;
  $("cz-swatch2").style.background = $("cz-color2").value;
  const code = ($("cz-code").value || "YOU").toUpperCase();
  $("cz-pvtext").textContent = "#" + ($("cz-num").value || "99") + " " + code + " · " + ($("cz-short").value || "YOU").toUpperCase();
  $("cz-pvtext").style.color = $("cz-color").value;
}
function openCustomize() {
  const ct = loadCustomTeam();
  $("cz-name").value = ct.name;
  $("cz-short").value = ct.short;
  $("cz-color").value = rgbToHex(ct.color);
  $("cz-color2").value = rgbToHex(ct.color2);
  $("cz-driver").value = ct.drivers[0].name;
  $("cz-code").value = ct.drivers[0].code;
  $("cz-num").value = ct.drivers[0].num;
  czPreview();
  els.customize.hidden = false;
}

function setPaused(p) {
  if (AX.state !== "race" && AX.state !== "count") return;
  AX.paused = p;
  els.pausemenu.hidden = !p;
  if (els.pmStandings) els.pmStandings.hidden = !(AX.seasonMode && AX.season && AX.season.round > 0);
  if (!p) { $("advanced").hidden = true; $("lighting").hidden = true; }   // never leave the overlays up after resume
  if (p) { GameAudio.stopEngine(); GameAudio.setSkid(0); }
  else if (AX.soundOn) GameAudio.startEngine();
  AX.lastFrame = performance.now();
}

// ---- player camera modes (CAM button / C key) ----
function refreshCamBtn() {
  const b = $("btn-cam");
  if (b) b.textContent = CAM_MODES[AX.camMode].label;
  // Cockpit view: the gear/speed/rpm live ON the wheel LCD — hide the floating
  // HUD duplicates (CSS keys off this class).
  document.body.classList.toggle("cockpit-cam", CAM_MODES[AX.camMode].id === "cockpit");
}
function setCamMode(m) {
  const prev = AX.camMode;
  AX.camMode = ((m % CAM_MODES.length) + CAM_MODES.length) % CAM_MODES.length;
  store.set("camMode", AX.camMode);
  if (AX.camMode !== prev) AX.camCutT = 0.35;   // brief eased glide into the new angle
  refreshCamBtn();   // the CAM button label is the only mode indicator (no big announce)
  return CAM_MODES[AX.camMode].id;
}
function cycleCam() { return setCamMode(AX.camMode + 1); }
// CAM button: quick tap cycles (muscle memory preserved); press-and-hold (or
// right-click) opens a PICKER GRID of all modes — cycling one-by-one through
// 14 cameras to reach the one you want was the worst switch in the game.
const camPicker = (() => {
  let el = null;
  const build = () => {
    el = document.createElement("div");
    el.id = "campicker";
    el.hidden = true;
    for (let i = 0; i < CAM_MODES.length; i++) {
      const b = document.createElement("button");
      b.textContent = CAM_MODES[i].label;
      b.dataset.idx = i;
      b.onclick = (e) => { e.stopPropagation(); setCamMode(+b.dataset.idx); hide(); };
      el.appendChild(b);
    }
    document.body.appendChild(el);
  };
  const sync = () => {
    for (const b of el.children) b.classList.toggle("active", +b.dataset.idx === AX.camMode);
  };
  const show = () => { if (!el) build(); sync(); el.hidden = false; };
  const hide = () => { if (el) el.hidden = true; };
  const visible = () => !!el && !el.hidden;
  return { show, hide, visible };
})();

// One STEER button cycles the single mode: TILT -> BUTTONS -> TOUCH.
const STEER_MODES = ["tilt", "buttons", "touch"];
function setSteerMode(mode) {
  AX.steerMode = mode;
  store.set("steerMode", mode);
  Input.setSteerMode(mode);
  if (mode === "tilt") enableTilt();   // (re)request motion permission within this gesture
  $("pm-steer").textContent = steerLabel();
  $("pm-calib").hidden = mode !== "tilt";
  refreshGearsBtn();   // manual is tilt-only, so the GEARS toggle hides off-tilt
  // Only refresh touch buttons when in an active race — don't bleed controls onto
  // the title/select screen (e.g. when gyro denial auto-switches to buttons mode).
  if (AX.state === "race" || AX.state === "count" || AX.state === "pause") showTouchControls(true);
}

// ---- steering tuning sliders (pause menu) ----
// Every slider is an integer 1..10 (racing line is -5..5) that maps to a
// physical value. Each maps so the DEFAULT value reproduces the original
// hand-tuned feel. Higher slider = the direction named in the label.
//
//  pm-rate     RESPONSE       WHEELBASE m (inverted) — high slider = shorter
//                             wheelbase = less yaw inertia = snappier turn-in.
//  pm-expo     LINEARITY      STEER_EXPO — high slider = more linear/direct,
//                             low = gentle near centre. (affects tilt + keys)
//  pm-smooth   STEER SMOOTHING One-Euro min-cutoff (Hz) — higher slider = lower
//                             cutoff = steadier/smoother tilt (kills jitter).
//  pm-tiltdeg  TILT RANGE     MAX_TILT — degrees of tilt for full lock (the one
//                             tilt-sensitivity knob; dead zone is fixed at 2.5°).
//  pm-lock     STEER LOCK     STEER_MAX_SLIP — max road-wheel steer angle (rad).
//  pm-speedsteer SPEED STEER  STEER_SPEED_REF — high slider = keeps more steering
//                             at speed (sharper); low = calmer/stabler at speed.
//  pm-line     RACING LINE    assist: 0 off, +pull to line, -push wide.
// The car is planted (understeer-only): DRIFT defaults to 0 so the rear never
// steps out — overcooking a corner washes the front wide, it never snaps round.
// The simplified default-view controls (STEERING / TILT / DRIVING HELP / RACING
// LINE) bundle these for players who don't want the detail — see refreshMacros().
function tiltDegFromRange(v) { return Math.round(50 + (18 - 50) * (v - 1) / 9); }
// SMOOTHING -> One-Euro min-cutoff (Hz). Higher slider = LOWER cutoff = smoother.
// v6 = 1.2 Hz (the original feel); v1 = 2.2 (snappy), v10 = 0.4 (very steady).
function cutoffFromSmooth(v) { return 2.2 + (0.4 - 2.2) * (v - 1) / 9; }
// High slider = SHORTER wheelbase = snappier; v5 ≈ 3.2 m (the original feel).
function wheelbaseFromSlider(v) { return 4.3 + (1.9 - 4.3) * (v - 1) / 9; } // 4.3..1.9
function expoFromSlider(v)   { return 3.5 + (1.0 - 3.5) * (v - 1) / 9; } // 3.5..1.0
function lockFromSlider(v)   { return 0.18 + (0.42 - 0.18) * (v - 1) / 9; } // rad, .18..0.42, v5≈0.29
function speedRefFromSlider(v) { return 44 + (124 - 44) * (v - 1) / 9; } // 44..124, v5≈80
function paceFromSlider(v)   { return v <= 5 ? 0.5 + (v - 1) * 0.125 : 1.0 + (v - 5) * 0.06; } // 0.50..1.30, v5=1.0
// DRIVING HELP = ROAD_FOLLOW: how much of each corner the car tracks for you.
// v6 ≈ 0.70 (the original feel); higher = the car does more of the steering.
function helpFromSlider(v)   { return 0.25 + (v - 1) / 9 * 0.45; }      // 0.25..0.70 assist gain, v6≈0.50
                                                                       // (gentle: the snappy/grippy car
                                                                       // over-steers if the assist is too strong)
function lineLabel(v) { return v === 0 ? "OFF" : (v > 0 ? "PULL " + v : "PUSH " + (-v)); }

// ---- presets ----
// Three named bundles drive all the handling sliders at once so a player never
// has to understand the underlying knobs. STANDARD reproduces the original
// hand-tuned defaults; RELAX stacks every forgiveness lever (on-rails grip,
// heavy corner help, racing-line pull, smooth/wide tilt) without maxing any one;
// PRO sharpens response and frees up the slide for skilled play. PACE is left
// out — it's a race-wide setting, not a handling feel.
const PRESETS = {
  relax:    { tiltDeg: 4, steerSmooth: 8, steerRate: 4,
              steerExpo: 4, steerLock: 5, steerSpeed: 4, drivingHelp: 9, raceLine: 2 },
  standard: { tiltDeg: 6, steerSmooth: 6, steerRate: 5,
              steerExpo: 5, steerLock: 5, steerSpeed: 5, drivingHelp: 6, raceLine: 0 },
  pro:      { tiltDeg: 7, steerSmooth: 3, steerRate: 7,
              steerExpo: 6, steerLock: 7, steerSpeed: 7, drivingHelp: 3, raceLine: 0 },
};
const PRESET_STORE = {  // slider store-key  ->  preset field
  tiltDeg: "tiltDeg", steerSmooth: "steerSmooth",
  steerRate: "steerRate", steerExpo: "steerExpo", steerLock: "steerLock",
  steerSpeed: "steerSpeed", drivingHelp: "drivingHelp", raceLine: "raceLine",
};

// ---- simplified ("macro") controls ----
// The default view exposes a handful of plain-language controls; each fans out to
// the granular store keys above, so presets, the Advanced sliders and the macros
// all stay in sync. STEER_LEVELS bundle the four cornering-feel knobs into named
// steps that line up with the presets (RELAX→easy, STANDARD→normal, PRO→sim).
const STEER_LEVELS = {
  easy:   { steerRate: 4, steerExpo: 4, steerLock: 5, steerSpeed: 4 },
  assist: { steerRate: 5, steerExpo: 5, steerLock: 5, steerSpeed: 4 },
  normal: { steerRate: 5, steerExpo: 5, steerLock: 5, steerSpeed: 5 },
  sim:    { steerRate: 7, steerExpo: 6, steerLock: 7, steerSpeed: 7 },
};
const STEER_LEVEL_ORDER = ["easy", "assist", "normal", "sim"];
const STEER_DEFAULTS = { steerRate: 5, steerExpo: 5, steerLock: 5, steerSpeed: 5 };
const HELP_LEVELS = { low: 3, med: 6, high: 9 };
const LINE_LEVELS = { off: 0, corner: 3, full: 5 };
function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  for (const storeKey of Object.keys(PRESET_STORE)) store.set(storeKey, p[storeKey]);
  store.set("preset", name);
  applySteerTuning();      // pushes the new values into both the live sim and the UI
  refreshPresetButtons();
}
// A manual slider edit means the settings no longer match a named preset.
function clearPreset() { if (store.get("preset", null)) { store.set("preset", "custom"); refreshPresetButtons(); } }
function refreshPresetButtons() {
  const active = store.get("preset", "standard");
  for (const name of ["relax", "standard", "pro"]) {
    const btn = $("pm-preset-" + name);
    if (btn) btn.classList.toggle("active", name === active);
  }
}

// Which named steering step (if any) the current granular values correspond to.
function matchSteerLevel() {
  for (const n of STEER_LEVEL_ORDER) {
    const L = STEER_LEVELS[n];
    if (Object.keys(L).every((k) => store.get(k, STEER_DEFAULTS[k]) === L[k])) return n;
  }
  return null;
}
// Mirror the granular store values back onto the simplified controls so the two
// views never disagree (presets, Advanced edits and macros all stay in sync).
function refreshMacros() {
  const ts = store.get("tiltDeg", 6);
  if ($("pm-tiltsimple")) { $("pm-tiltsimple").value = ts; $("pm-tiltsimple-v").textContent = ts; }
  const lvl = matchSteerLevel();
  for (const n of STEER_LEVEL_ORDER) {
    const b = $("pm-steer-" + n); if (b) b.classList.toggle("active", n === lvl);
  }
  const dh = store.get("drivingHelp", 6);
  const hb = dh <= 4 ? "low" : dh <= 7 ? "med" : "high";
  for (const n of ["low", "med", "high"]) {
    const b = $("pm-help-" + n); if (b) b.classList.toggle("active", n === hb);
  }
  const rl = store.get("raceLine", 0);
  const lb = rl <= 0 ? "off" : rl >= 5 ? "full" : "corner";
  for (const n of ["off", "corner", "full"]) {
    const b = $("pm-line-" + n); if (b) b.classList.toggle("active", n === lb);
  }
}

function applySteerTuning() {
  const rate    = store.get("steerRate",  5);
  const expo    = store.get("steerExpo",  5);
  const smooth  = store.get("steerSmooth", 6);
  const tiltdeg = store.get("tiltDeg",    6);   // 6→32° for full lock (tuner optimum)
  const lock    = store.get("steerLock",  5);
  const spdsteer = store.get("steerSpeed", 5);
  const help    = store.get("drivingHelp", 6);
  const pace    = store.get("pace",       5);
  const line    = store.get("raceLine",   0);
  AXC.PACE           = paceFromSlider(pace);
  AXC.WHEELBASE      = wheelbaseFromSlider(rate);
  AXC.STEER_EXPO     = expoFromSlider(expo);
  AXC.STEER_MAX_SLIP = lockFromSlider(lock);
  AXC.STEER_SPEED_REF = speedRefFromSlider(spdsteer);
  AXC.ROAD_FOLLOW    = helpFromSlider(help);
  Input.setTiltSmoothing(cutoffFromSmooth(smooth));
  Input.setTiltSensitivity(tiltDegFromRange(tiltdeg));
  AX.raceLineAssist = line / 5;
  $("pm-rate").value    = rate;    $("pm-rate-v").textContent    = rate;
  $("pm-expo").value    = expo;    $("pm-expo-v").textContent    = expo;
  $("pm-smooth").value  = smooth;  $("pm-smooth-v").textContent  = smooth;
  $("pm-tiltdeg").value = tiltdeg; $("pm-tiltdeg-v").textContent = tiltdeg;
  $("pm-lock").value    = lock;    $("pm-lock-v").textContent    = lock;
  $("pm-speedsteer").value = spdsteer; $("pm-speedsteer-v").textContent = spdsteer;
  $("pm-help").value    = help;    $("pm-help-v").textContent    = help;
  $("pm-pace").value    = pace;    $("pm-pace-v").textContent    = pace;
  $("pm-line").value    = line;    $("pm-line-v").textContent    = lineLabel(line);
  refreshPresetButtons();
  refreshMacros();
}
function applySteerLevel(name) {
  const L = STEER_LEVELS[name]; if (!L) return;
  for (const k in L) store.set(k, L[k]);
  clearPreset(); applySteerTuning();
  if (AX.soundOn) GameAudio.uiSelect();
}
// GEARS toggle: show when thumbs are free (tilt or desktop keyboard).
function refreshGearsBtn() {
  $("pm-gears").hidden = Input.touchControlsNeeded() && AX.steerMode !== "tilt";
  $("pm-gears").textContent = "GEARS: " + (AX.manualMode ? "MANUAL" : "AUTO");
}

function init(deps) {
  ({ els, announce, buildStandings, cssCol, fmtTime, gearsManual, getTeamParts,
     hexToRgb, loadCustomTeam, quitToMenu, recomputePlayerMods, rgbToHex,
     saveTeamParts, showTouchControls, startRace, syncCustomTeam,
     LT, TUNE_DEFS, _ltStore, ltKey, setLightTune, persistLightTune, applyLightTune } = deps);

AX.gestured = false;
document.addEventListener("pointerdown", () => {
  if (AX.gestured) return; AX.gestured = true; firstGesture();
}, { once: false, capture: true });

els.soundbtn.hidden = false;
els.soundbtn.onclick = () => setSound(!AX.soundOn);
$("pm-music").onclick = () => setMusic(!AX.musicEnabled);


$("mb-race").onclick = () => {
  AX.seasonMode = false; AX.timeTrial = false;
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (AX.soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-tt").onclick = () => {
  AX.seasonMode = false; AX.timeTrial = true;
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (AX.soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-season").onclick = () => {
  AX.seasonMode = true; AX.timeTrial = false;
  if (!AX.season || AX.season.round >= Tracks.LIST.length) {
    AX.season = { round: 0, pts: {}, teamPts: {} };
    store.set("season", AX.season);
  }
  AX.trackIdx = AX.season.round;
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (AX.soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-standings").onclick = () => { buildStandings(); $("standings").hidden = false; if (AX.soundOn) GameAudio.uiSelect(); };
$("standings-close").onclick = () => { $("standings").hidden = true; };
$("mb-data").onclick = () => { DataHub.open(); if (AX.soundOn) GameAudio.uiSelect(); };
$("mb-help").onclick = () => { els.howtoplay.hidden = false; };
$("htp-close").onclick = () => { els.howtoplay.hidden = true; };
// Advanced steering: opened from the pause menu, closes back to it.
$("pm-advanced").onclick = () => { $("advanced").hidden = false; };
$("adv-close").onclick = () => { $("advanced").hidden = true; };
$("pm-lighting").onclick = () => {
  buildLightTunePanel();
  _ltPrevTOD = __apex.setTimeOfDay();   // capture the race's real conditions
  _ltPrevWx = __apex.weather();
  refreshLtPreviewActive();
  $("lt-json").hidden = true;
  $("lighting").hidden = false;
  els.pausemenu.hidden = true;      // unobstructed live preview
};
$("lt-close").onclick = () => {
  // Restore the race's real time & weather (preview was transient).
  if (_ltPrevTOD != null && __apex.setTimeOfDay() !== _ltPrevTOD) __apex.setTimeOfDay(_ltPrevTOD);
  if (_ltPrevWx != null && __apex.weather() !== _ltPrevWx) __apex.weather(_ltPrevWx);
  $("lighting").hidden = true;
  if (AX.paused) els.pausemenu.hidden = false;
};
$("lt-help-on").onchange = (e) => {
  document.getElementById("lighting-inner").classList.toggle("lt-show-help", e.target.checked);
};
$("lt-reset").onclick = () => {
  // Drop this condition's LOCAL edits so it falls back to the shipped file /
  // defaults (leaves other conditions and the file untouched).
  const key = ltKey();
  if (key && _ltStore[key]) delete _ltStore[key];
  persistLightTune();
  applyLightTune();
  refreshLightTunePanel();
  $("lt-json").hidden = true;
};
$("lt-copy").onclick = () => {
  // Export the FULL set (shipped file merged with every local edit, local
  // winning) as the paste-ready body for js/light-presets.js — replace that
  // file's `window.LightPresets = {…}` literal with this to bake it in.
  const merged = {};
  const F = window.LightPresets || {};
  for (const k in F) merged[k] = Object.assign({}, F[k]);
  for (const k in _ltStore) merged[k] = Object.assign(merged[k] || {}, _ltStore[k]);
  // Drop any now-empty condition maps for a clean file.
  for (const k in merged) if (!Object.keys(merged[k]).length) delete merged[k];
  const json = "window.LightPresets = " + JSON.stringify(merged, null, 2) + ";";
  const ta = $("lt-json");
  ta.value = json; ta.hidden = false;
  ta.focus(); ta.select(); ta.setSelectionRange(0, json.length);   // iOS needs the explicit range
  const btn = $("lt-copy");
  const flash = (ok) => {
    btn.textContent = ok ? "COPIED ✓" : "SELECT & COPY ↑";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
  };
  // Auto-copy: prefer the async Clipboard API (the button click is the required
  // user gesture); fall back to execCommand on the selected textarea for older
  // mobile / installed-PWA webviews where navigator.clipboard is unavailable or
  // rejects. The textarea stays visible either way as a manual fallback.
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(() => flash(true), () => {
      let ok = false; try { ok = document.execCommand && document.execCommand("copy"); } catch (e) {}
      flash(ok);
    });
  } else {
    let ok = false; try { ok = document.execCommand && document.execCommand("copy"); } catch (e) {}
    flash(ok);
  }
};
els.selBack.onclick = () => { els.select.hidden = true; els.overlay.hidden = false; };
els.selPreviewMap.onclick = openTrackDetail;
$("track-detail-close").onclick = () => { $("track-detail").hidden = true; };

els.selGo.onclick = () => {
  if (AX.soundOn) GameAudio.uiSelect();
  AX.raceLaps = AX.timeTrial ? TT_LAPS : GAME_LAPS;
  AX.raceWeather = "dry";
  AX.raceTimeOfDay = "default";
  buildRaceSettings();
  els.select.hidden = true;
  $("race-settings").hidden = false;
};
$("rs-cancel").onclick = () => {
  $("race-settings").hidden = true;
  els.select.hidden = false;
};
$("rs-go").onclick = () => {
  if (AX.soundOn) GameAudio.uiSelect();
  $("race-settings").hidden = true;
  if (AX.steerMode === "tilt") enableTilt();
  startRace();
};
["cz-name", "cz-short", "cz-color", "cz-color2", "cz-code", "cz-num"].forEach((id) => {
  $(id).addEventListener("input", czPreview);
});
els.selCustomize.onclick = () => { if (AX.soundOn) GameAudio.uiSelect(); openCustomize(); };
$("sel-setup").onclick = () => { if (AX.soundOn) GameAudio.uiSelect(); openSetup(); };
$("cs-done").onclick = () => {
  $("carsetup").hidden = true;
  recomputePlayerMods(); buildSelect();
};
$("cs-unlimited").onclick = () => {
  AX.unlimitedBudget = !AX.unlimitedBudget;
  store.set("unlimitedBudget", AX.unlimitedBudget);
  buildSetup();
};
$("cz-cancel").onclick = () => { els.customize.hidden = true; };
$("cz-save").onclick = () => {
  const clean = (v, fb, n) => { v = (v || "").trim(); return v ? v.slice(0, n) : fb; };
  const ct = {
    id: "custom", engine: "Custom", tier: 2, custom: true,
    name: clean($("cz-name").value, "My Team", 22),
    short: clean($("cz-short").value, "YOU", 4).toUpperCase(),
    color: hexToRgb($("cz-color").value),
    color2: hexToRgb($("cz-color2").value),
    drivers: [{
      name: clean($("cz-driver").value, "Your Name", 22),
      code: clean($("cz-code").value, "YOU", 3).toUpperCase(),
      num: clamp(parseInt($("cz-num").value, 10) || 99, 0, 99),
    }],
  };
  store.set("customTeam", ct);
  syncCustomTeam();
  AX.teamIdx = Teams.LIST.findIndex((t) => t.id === "custom");
  AX.driverIdx = 0;
  store.set("team", AX.teamIdx); store.set("driver", 0);
  els.customize.hidden = true;
  buildSelect();
  if (AX.soundOn) GameAudio.uiSelect();
};
els.resMenu.onclick = () => quitToMenu();
els.resNext.onclick = () => {
  if (AX.seasonMode) {
    if (AX.season.round >= Tracks.LIST.length) {
      if (els.resNext.textContent !== "MAIN MENU") {
        // First click: build champion panel, stay on results screen
        const sorted = AX.cars.slice().sort((a, b) => (AX.season.pts[b.code] || 0) - (AX.season.pts[a.code] || 0));
        const champ = sorted[0];
        const champColor = cssCol(champ.team.color);
        els.resultsTitle.textContent = "WORLD CHAMPION";
        els.resultsTitle.style.color = champColor;
        els.resultsTable.textContent = "";
        // Big champion row
        const banner = document.createElement("div");
        banner.style.cssText = "text-align:center;padding:18px 0 10px;font-weight:900;font-style:italic;font-size:1.4em;color:" + champColor;
        banner.textContent = champ.code + "  " + champ.name;
        const teamBanner = document.createElement("div");
        teamBanner.style.cssText = "text-align:center;font-size:0.8em;color:#aaa;margin-bottom:14px;letter-spacing:2px";
        teamBanner.textContent = champ.team.name.toUpperCase();
        els.resultsTable.append(banner, teamBanner);
        // Full standings
        const head = document.createElement("div");
        head.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin-bottom:4px;font-size:0.85em";
        head.textContent = "FINAL STANDINGS";
        els.resultsTable.appendChild(head);
        sorted.forEach((c, i) => {
          const row = document.createElement("div"); row.className = "res-row";
          const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
          const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = cssCol(c.team.color);
          const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = c.code;
          const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (AX.season.pts[c.code] || 0) + " pts";
          row.append(pos, sw, nm, pt);
          els.resultsTable.appendChild(row);
        });
        els.resNext.textContent = "MAIN MENU";
        announce(champ.code + " IS WORLD CHAMPION!", 4);
        if (AX.soundOn) GameAudio.finish();
        return;
      }
      // Second click: go to menu, reset season
      AX.season = null; store.set("season", null);
      els.resultsTitle.style.color = "";
      quitToMenu();
      return;
    }
    AX.trackIdx = AX.season.round;
  }
  els.results.hidden = true;
  startRace();
};
els.pausebtn.onclick = () => setPaused(true);
(() => {
  const b = $("btn-cam");
  if (!b) return;
  let holdT = 0, held = false;
  const HOLD_MS = 340;
  b.addEventListener("pointerdown", () => {
    held = false;
    holdT = setTimeout(() => { held = true; camPicker.show(); }, HOLD_MS);
  });
  b.addEventListener("pointerup", () => clearTimeout(holdT));
  b.addEventListener("pointerleave", () => clearTimeout(holdT));
  b.addEventListener("contextmenu", (e) => { e.preventDefault(); camPicker.show(); });
  // Cycle on CLICK (not pointerup): synthetic .click() from tests/assistive tech
  // works unchanged, and a real tap fires it after pointerup anyway. When the
  // hold already opened the picker, swallow that one trailing click.
  b.onclick = () => {
    if (held) { held = false; return; }
    if (camPicker.visible()) { camPicker.hide(); return; }
    cycleCam();
  };
  // Tap anywhere outside the grid closes it.
  document.addEventListener("pointerdown", (e) => {
    if (camPicker.visible() && e.target !== b && !e.target.closest("#campicker")) camPicker.hide();
  });
})();
refreshCamBtn();

$("pm-resume").onclick = () => setPaused(false);
$("pm-restart").onclick = () => { els.pausemenu.hidden = false; setPaused(false); startRace(); };
$("pm-quit").onclick = () => quitToMenu();
els.pmStandings && (els.pmStandings.onclick = () => { buildStandings(); $("standings").hidden = false; });
$("pm-sound").onclick = () => setSound(!AX.soundOn);
$("pm-steer").onclick = () => {
  setSteerMode(STEER_MODES[(STEER_MODES.indexOf(AX.steerMode) + 1) % STEER_MODES.length]);
};
$("pm-calib").onclick = () => { Input.calibrate(); setPaused(false); };
$("pm-rate").oninput = (e) => {
  const v = +e.target.value; store.set("steerRate", v);
  AXC.WHEELBASE = wheelbaseFromSlider(v); $("pm-rate-v").textContent = v; clearPreset();
};
$("pm-expo").oninput = (e) => {
  const v = +e.target.value; store.set("steerExpo", v);
  AXC.STEER_EXPO = expoFromSlider(v); $("pm-expo-v").textContent = v; clearPreset();
};
$("pm-smooth").oninput = (e) => {
  const v = +e.target.value; store.set("steerSmooth", v);
  Input.setTiltSmoothing(cutoffFromSmooth(v)); $("pm-smooth-v").textContent = v; clearPreset();
};
$("pm-tiltdeg").oninput = (e) => {
  const v = +e.target.value; store.set("tiltDeg", v);
  Input.setTiltSensitivity(tiltDegFromRange(v)); $("pm-tiltdeg-v").textContent = v; clearPreset();
};
$("pm-lock").oninput = (e) => {
  const v = +e.target.value; store.set("steerLock", v);
  AXC.STEER_MAX_SLIP = lockFromSlider(v); $("pm-lock-v").textContent = v; clearPreset();
};
$("pm-speedsteer").oninput = (e) => {
  const v = +e.target.value; store.set("steerSpeed", v);
  AXC.STEER_SPEED_REF = speedRefFromSlider(v); $("pm-speedsteer-v").textContent = v; clearPreset();
};
$("pm-help").oninput = (e) => {
  const v = +e.target.value; store.set("drivingHelp", v);
  AXC.ROAD_FOLLOW = helpFromSlider(v); $("pm-help-v").textContent = v; clearPreset();
};
$("pm-pace").oninput = (e) => {
  const v = +e.target.value; store.set("pace", v);
  AXC.PACE = paceFromSlider(v); $("pm-pace-v").textContent = v;
};
$("pm-line").oninput = (e) => {
  const v = +e.target.value; store.set("raceLine", v);
  AX.raceLineAssist = v / 5; $("pm-line-v").textContent = lineLabel(v); clearPreset();
};
$("pm-preset-relax").onclick    = () => { applyPreset("relax");    if (AX.soundOn) GameAudio.uiSelect(); };
$("pm-preset-standard").onclick = () => { applyPreset("standard"); if (AX.soundOn) GameAudio.uiSelect(); };
$("pm-preset-pro").onclick      = () => { applyPreset("pro");      if (AX.soundOn) GameAudio.uiSelect(); };

// ---- simplified controls: each fans out to the granular store keys ----
$("pm-tiltsimple").oninput = (e) => {
  store.set("tiltDeg", +e.target.value); clearPreset(); applySteerTuning();
};
for (const n of STEER_LEVEL_ORDER) $("pm-steer-" + n).onclick = () => applySteerLevel(n);
for (const n of ["low", "med", "high"]) $("pm-help-" + n).onclick = () => {
  store.set("drivingHelp", HELP_LEVELS[n]); clearPreset(); applySteerTuning();
  if (AX.soundOn) GameAudio.uiSelect();
};
for (const n of ["off", "corner", "full"]) $("pm-line-" + n).onclick = () => {
  store.set("raceLine", LINE_LEVELS[n]); clearPreset(); applySteerTuning();
  if (AX.soundOn) GameAudio.uiSelect();
};
$("adv-more").onclick = () => {
  const open = $("adv-extra").hidden;        // currently hidden → about to open
  $("adv-extra").hidden = !open;
  $("adv-more").setAttribute("aria-expanded", String(open));
  $("adv-more").innerHTML = open ? "ADVANCED &#9652;" : "ADVANCED &#9662;";
  if (AX.soundOn) GameAudio.uiSelect();
};
// Any granular Advanced edit refreshes the simplified controls (events bubble up).
$("advanced-inner").addEventListener("input", refreshMacros);
applySteerTuning();
$("pm-gears").onclick = () => {
  AX.manualMode = !AX.manualMode;
  store.set("manual", AX.manualMode);
  refreshGearsBtn();
  if (AX.player && !gearsManual()) AX.player.gear = naturalGear(AX.player.speed);
  showTouchControls(true);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && AX.state === "race") setPaused(true);
});


}

return { init, CS_STATS, renderStatBars, buildSetup, openSetup, buildSelect, updateTrackPreview, openTrackDetail, tickUi, steerLabel, enableTilt, firstGesture, setSound, setMusic, fmtTune, refreshLtPreviewActive, updateLtProfileLabel, buildLtPreview, buildLightTunePanel, refreshLightTunePanel, buildRaceSettings, czPreview, openCustomize, setPaused, refreshCamBtn, setCamMode, cycleCam, STEER_MODES, setSteerMode, tiltDegFromRange, cutoffFromSmooth, wheelbaseFromSlider, expoFromSlider, lockFromSlider, speedRefFromSlider, paceFromSlider, helpFromSlider, lineLabel, PRESETS, PRESET_STORE, STEER_LEVELS, STEER_LEVEL_ORDER, STEER_DEFAULTS, HELP_LEVELS, LINE_LEVELS, applyPreset, clearPreset, refreshPresetButtons, matchSteerLevel, refreshMacros, applySteerTuning, applySteerLevel, refreshGearsBtn };
})();
