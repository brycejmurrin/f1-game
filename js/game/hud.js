/* Apex 26 — in-race HUD + minimap for js/game.js. Write-cached DOM setters
   (the panel ticks ~10 Hz but most fields hold steady), cached sector-row
   nodes, and the minimap with its pre-rendered track-outline blit. Live game
   state comes through the ctx façade handed to GameHud.create(ctx) (the `G`
   object in game.js): els, player, cars, ranked, track, timeTrial, lapsTarget,
   sectorLast, ttRecord, fmtTime, cssCol. Consumes globals Ghost, TrackMaps,
   GameTables. Must load BEFORE js/game.js (see index.html). */
const GameHud = (function () {
  "use strict";

const { IDLE_RPM, MAX_RPM } = GameTables;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function create(G) {

const els = G.els;
const mm = els.minimap.getContext("2d");
let hudT = 0;
let minimapBg = null;         // offscreen canvas with pre-rendered track shape

// HUD write-caches: skip the DOM mutation when the value hasn't changed (the panel
// ticks ~10Hz but most fields hold steady between updates). Keyed per element.
const _hudTxt = new WeakMap();   // el -> last textContent
const _hudSty = new WeakMap();   // el -> { prop: lastVal }
const _hudCls = new WeakMap();   // el -> last className
const _hudTog = new WeakMap();   // el -> { cls: lastBool }
function hText(el, v) { if (!el) return; if (_hudTxt.get(el) !== v) { _hudTxt.set(el, v); el.textContent = v; } }
function hStyle(el, prop, v) { if (!el) return; let m = _hudSty.get(el); if (!m) { m = {}; _hudSty.set(el, m); } if (m[prop] !== v) { m[prop] = v; el.style[prop] = v; } }
function hClass(el, v) { if (!el) return; if (_hudCls.get(el) !== v) { _hudCls.set(el, v); el.className = v; } }
function hToggle(el, cls, on) { if (!el) return; let m = _hudTog.get(el); if (!m) { m = {}; _hudTog.set(el, m); } if (m[cls] !== on) { m[cls] = on; el.classList.toggle(cls, on); } }

// Sector row: cached span nodes (built once), textContent-updated each tick — no
// per-tick innerHTML re-parse.
let _secRows = null;
function buildSecRows() {
  const SC = ["#c084fc", "#e10600", "#a3e635"], labels = ["S1", "S2", "S3"];
  els.hudSectors.textContent = "";
  _secRows = [];
  for (let i = 0; i < 3; i++) {
    const row = document.createElement("div"); row.className = "sec-row";
    const lbl = document.createElement("span"); lbl.className = "sec-lbl"; lbl.style.color = SC[i]; lbl.textContent = labels[i];
    const val = document.createElement("span"); val.className = "sec-val"; val.textContent = "--";
    row.appendChild(lbl); row.appendChild(val); els.hudSectors.appendChild(row);
    _secRows.push(val);
  }
}

function updateHud(force) {
  const player = G.player, cars = G.cars, timeTrial = G.timeTrial;
  if (!player) return;
  hudT -= 1;
  if (!force && hudT > 0) return;
  hudT = 6; // ~10Hz at 60fps
  hText(els.pos, timeTrial ? "TT" : (player.rank || "-") + "/" + cars.length);
  hText(els.lap, Math.min(player.lap || 1, G.lapsTarget) + "/" + G.lapsTarget);
  hText(els.time, G.fmtTime(player.lapTime));
  hText(els.best, isFinite(player.best) ? G.fmtTime(player.best) : "-");
  hText(els.speed, "" + Math.round(player.speed * 3.6));
  hStyle(els.energy, "width", (player.energy * 100).toFixed(0) + "%");
  // gear + tachometer
  hText(els.gear, "" + player.gear);
  const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  hStyle(els.rpmFill, "width", (rpmFrac * 100).toFixed(0) + "%");
  hToggle(els.tach, "redline", player.rpm > MAX_RPM * 0.92);
  // toggle-button states
  hToggle(els.btnBoost, "on", player.boostOn);
  hToggle(els.btnOT, "on", player.otT > 0);
  hToggle(els.btnOT, "armed", player.otArmed && player.otT <= 0);
  const ot = player.otT > 0 ? "ot-active" : player.otArmed ? "ot-armed" : player.otCool > 0 ? "ot-cool" : "ot-off";
  hClass(els.ot, ot);
  hText(els.ot, player.otT > 0 ? "OVERTAKE " + player.otT.toFixed(1) : "OVERTAKE");
  if (timeTrial) {
    // no rivals — show ghost delta (or last lap) and the record to chase instead of gaps
    if (Ghost.hasGhost()) {
      const ghostT = Ghost.timeAt(player.s);
      if (ghostT !== null) {
        const delta = player.lapTime - ghostT;
        const sign = delta >= 0 ? "+" : "";
        hText(els.gapA, "GHOST " + sign + delta.toFixed(3) + "s");
        hStyle(els.gapA, "color", delta <= 0 ? "#a3e635" : "#e10600");
      } else {
        hText(els.gapA, player.lastLap ? "LAST " + G.fmtTime(player.lastLap) : "");
        hStyle(els.gapA, "color", "");
      }
    } else {
      hText(els.gapA, player.lastLap ? "LAST " + G.fmtTime(player.lastLap) : "");
      hStyle(els.gapA, "color", "");
    }
    hText(els.gapB, isFinite(G.ttRecord) ? "REC " + G.fmtTime(G.ttRecord) : "REC —");
  } else {
    // gaps — reuse the module-scope prog-sorted field from the update loop
    const ranked = G.ranked;
    const i = ranked.indexOf(player);
    const a = ranked[i - 1], b = ranked[i + 1];
    hText(els.gapA, a ? "▲ " + a.code + " +" + ((a.prog - player.prog) / Math.max(player.speed, 25)).toFixed(1) + "s" : "");
    hText(els.gapB, b ? "▼ " + b.code + " +" + ((player.prog - b.prog) / Math.max(player.speed, 25)).toFixed(1) + "s" : "");
  }
  // Sector split display (top-right) — cached span nodes, textContent per tick
  if (els.hudSectors) {
    if (!_secRows) buildSecRows();
    for (let i = 0; i < 3; i++) {
      const t = G.sectorLast[i];
      hText(_secRows[i], t == null ? "--" : t.toFixed(3));
    }
  }
  drawMinimap();
}

function drawMinimap() {
  const player = G.player, cars = G.cars, track = G.track, timeTrial = G.timeTrial;
  const W = els.minimap.width, H = els.minimap.height;
  // pre-render the static track outline once; reuse as a cheap blit every HUD frame
  if (!minimapBg || minimapBg.width !== W || minimapBg.height !== H) {
    minimapBg = document.createElement("canvas");
    minimapBg.width = W; minimapBg.height = H;
    const mc = minimapBg.getContext("2d");
    const map = track.map, n = map.length;
    mc.lineWidth = 2; mc.lineJoin = "round"; mc.lineCap = "round";
    const SC = ["rgba(192,132,252,0.8)", "rgba(225,6,0,0.8)", "rgba(163,230,53,0.8)"];
    // Same CircuitMarkings splits as TrackMaps.draw / sectorAt (thirds if missing).
    const sec = track.def && track.def.sectors;
    const splits = (sec && sec.length === 2) ? [0, sec[0], sec[1], 1] : [0, 1 / 3, 2 / 3, 1];
    for (let s = 0; s < 3; s++) {
      const from = Math.floor(splits[s] * n);
      const to = s === 2 ? n - 1 : Math.max(from, Math.floor(splits[s + 1] * n));
      mc.strokeStyle = SC[s];
      mc.beginPath();
      for (let i = from; i <= to; i++) {
        const p = map[i % n];
        const x = 8 + p[0] * (W - 16), y = 8 + p[1] * (H - 16);
        i === from ? mc.moveTo(x, y) : mc.lineTo(x, y);
      }
      if (s === 2) {
        const p0 = map[0];
        mc.lineTo(8 + p0[0] * (W - 16), 8 + p0[1] * (H - 16));
      }
      mc.stroke();
    }
    // DRS zone highlight (cyan, slightly thicker)
    const zones = TrackMaps.drsZones(track.def);
    if (zones && zones.length) {
      mc.strokeStyle = "rgba(0,220,180,0.85)"; mc.lineWidth = 3;
      for (const z of zones) {
        const from2 = Math.floor(z.a * n), to2 = Math.min(n - 1, Math.floor(z.b * n));
        mc.beginPath();
        for (let i = from2; i <= to2; i++) {
          const p = map[i % n];
          mc.lineTo(8 + p[0] * (W - 16), 8 + p[1] * (H - 16));
        }
        mc.stroke();
      }
    }
  }
  mm.clearRect(0, 0, W, H);
  mm.drawImage(minimapBg, 0, 0);
  const map = track.map, n = map.length;
  for (const c of cars) {
    if (c === player) continue;
    const p = map[Math.floor(c.s / track.total * n) % n];
    mm.fillStyle = c.team._cssColor || (c.team._cssColor = G.cssCol(c.team.color));   // team colours are static — compute once
    mm.fillRect(6 + p[0] * (W - 16), 6 + p[1] * (H - 16), 4, 4);
  }
  // ghost replay marker (time trial): where your best lap is right now
  if (timeTrial && Ghost.hasGhost()) {
    const gh = Ghost.at(player.lapTime);
    if (gh && !gh.done) {
      const gp = map[Math.floor((gh.s / track.total) * n) % n];
      mm.fillStyle = "rgba(120, 220, 255, 0.95)";
      mm.beginPath();
      mm.arc(8 + gp[0] * (W - 16), 8 + gp[1] * (H - 16), 3.4, 0, 7);
      mm.fill();
    }
  }
  const p = map[Math.floor(player.s / track.total * n) % n];
  mm.fillStyle = "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (W - 16), 8 + p[1] * (H - 16), 4, 0, 7);
  mm.fill();
}

// loadTrack() calls this so the outline re-renders for the new circuit.
function invalidateMap() { minimapBg = null; }

return { updateHud, invalidateMap };
}

return { create };
})();
