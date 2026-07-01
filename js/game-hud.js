/* Apex 26 — HUD: the live race overlay (position/lap/times/speed/energy/
 * sectors) and the minimap canvas. Reads AX/AXC; game.js hands over its DOM
 * cache and helpers via AXHud.init(deps) at boot. */
"use strict";

const AXHud = (function () {
"use strict";

const { IDLE_RPM, MAX_RPM } = AXC;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let els = null, mm = null, fmtTime = null, cssCol = null;
function init(d) { els = d.els; mm = d.mm; fmtTime = d.fmtTime; cssCol = d.cssCol; }

// ---------- HUD ----------
function updateHud(force) {
  if (!AX.player) return;
  AX.hudT -= 1;
  if (!force && AX.hudT > 0) return;
  AX.hudT = 6; // ~10Hz at 60fps
  els.pos.textContent = AX.timeTrial ? "TT" : (AX.player.rank || "-") + "/" + AX.cars.length;
  els.lap.textContent = Math.min(AX.player.lap || 1, AX.lapsTarget) + "/" + AX.lapsTarget;
  els.time.textContent = fmtTime(AX.player.lapTime);
  els.best.textContent = isFinite(AX.player.best) ? fmtTime(AX.player.best) : "-";
  els.speed.textContent = Math.round(AX.player.speed * 3.6);
  els.energy.style.width = (AX.player.energy * 100).toFixed(0) + "%";
  // gear + tachometer
  els.gear.textContent = AX.player.gear;
  const rpmFrac = clamp((AX.player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  els.rpmFill.style.width = (rpmFrac * 100).toFixed(0) + "%";
  els.tach.classList.toggle("redline", AX.player.rpm > MAX_RPM * 0.92);
  // toggle-button states
  els.btnBoost.classList.toggle("on", AX.player.boostOn);
  els.btnOT.classList.toggle("on", AX.player.otT > 0);
  els.btnOT.classList.toggle("armed", AX.player.otArmed && AX.player.otT <= 0);
  const ot = AX.player.otT > 0 ? "ot-active" : AX.player.otArmed ? "ot-armed" : AX.player.otCool > 0 ? "ot-cool" : "ot-off";
  els.ot.className = ot;
  els.ot.textContent = AX.player.otT > 0 ? "OVERTAKE " + AX.player.otT.toFixed(1) : "OVERTAKE";
  if (AX.timeTrial) {
    // no rivals — show ghost delta (or last lap) and the record to chase instead of gaps
    if (Ghost.hasGhost()) {
      const ghostT = Ghost.timeAt(AX.player.s);
      if (ghostT !== null) {
        const delta = AX.player.lapTime - ghostT;
        const sign = delta >= 0 ? "+" : "";
        els.gapA.textContent = "GHOST " + sign + delta.toFixed(3) + "s";
        els.gapA.style.color = delta <= 0 ? "#a3e635" : "#e10600";
      } else {
        els.gapA.textContent = AX.player.lastLap ? "LAST " + fmtTime(AX.player.lastLap) : "";
        els.gapA.style.color = "";
      }
    } else {
      els.gapA.textContent = AX.player.lastLap ? "LAST " + fmtTime(AX.player.lastLap) : "";
      els.gapA.style.color = "";
    }
    els.gapB.textContent = isFinite(AX.ttRecord) ? "REC " + fmtTime(AX.ttRecord) : "REC —";
  } else {
    // gaps
    const ranked = AX.cars.slice().sort((a, b) => b.prog - a.prog);
    const i = ranked.indexOf(AX.player);
    const a = ranked[i - 1], b = ranked[i + 1];
    els.gapA.textContent = a ? "▲ " + a.code + " +" + ((a.prog - AX.player.prog) / Math.max(AX.player.speed, 25)).toFixed(1) + "s" : "";
    els.gapB.textContent = b ? "▼ " + b.code + " +" + ((AX.player.prog - b.prog) / Math.max(AX.player.speed, 25)).toFixed(1) + "s" : "";
  }
  // Sector split display (top-right)
  if (els.hudSectors) {
    const SC = ["#c084fc", "#e10600", "#a3e635"]; // S1 purple, S2 red, S3 green
    const labels = ["S1", "S2", "S3"];
    els.hudSectors.innerHTML = labels.map((lbl, i) => {
      const t = AX.sectorLast[i];
      const val = t == null ? "--" : t.toFixed(3);
      return `<div class="sec-row"><span class="sec-lbl" style="color:${SC[i]}">${lbl}</span><span class="sec-val">${val}</span></div>`;
    }).join("");
  }
  drawMinimap();
}

function drawMinimap() {
  const W = els.minimap.width, H = els.minimap.height;
  // pre-render the static track outline once; reuse as a cheap blit every HUD frame
  if (!AX.minimapBg || AX.minimapBg.width !== W || AX.minimapBg.height !== H) {
    AX.minimapBg = document.createElement("canvas");
    AX.minimapBg.width = W; AX.minimapBg.height = H;
    const mc = AX.minimapBg.getContext("2d");
    const map = AX.track.map, n = map.length;
    mc.lineWidth = 2; mc.lineJoin = "round"; mc.lineCap = "round";
    const SC = ["rgba(192,132,252,0.8)", "rgba(225,6,0,0.8)", "rgba(163,230,53,0.8)"];
    for (let s = 0; s < 3; s++) {
      const from = Math.floor((s / 3) * n), to = Math.floor(((s + 1) / 3) * n);
      mc.strokeStyle = SC[s];
      mc.beginPath();
      for (let i = from; i <= to; i++) {
        const p = map[i % n];
        const x = 8 + p[0] * (W - 16), y = 8 + p[1] * (H - 16);
        i === from ? mc.moveTo(x, y) : mc.lineTo(x, y);
      }
      mc.stroke();
    }
    // DRS zone highlight (cyan, slightly thicker)
    const zones = TrackMaps.drsZones(AX.track.def);
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
  mm.drawImage(AX.minimapBg, 0, 0);
  const map = AX.track.map, n = map.length;
  for (const c of AX.cars) {
    if (c === AX.player) continue;
    const p = map[Math.floor(c.s / AX.track.total * n) % n];
    mm.fillStyle = cssCol(c.team.color);
    mm.fillRect(6 + p[0] * (W - 16), 6 + p[1] * (H - 16), 4, 4);
  }
  // ghost replay marker (time trial): where your best lap is right now
  if (AX.timeTrial && Ghost.hasGhost()) {
    const gh = Ghost.at(AX.player.lapTime);
    if (gh && !gh.done) {
      const gp = map[Math.floor((gh.s / AX.track.total) * n) % n];
      mm.fillStyle = "rgba(120, 220, 255, 0.95)";
      mm.beginPath();
      mm.arc(8 + gp[0] * (W - 16), 8 + gp[1] * (H - 16), 3.4, 0, 7);
      mm.fill();
    }
  }
  const p = map[Math.floor(AX.player.s / AX.track.total * n) % n];
  mm.fillStyle = "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (W - 16), 8 + p[1] * (H - 16), 4, 0, 7);
  mm.fill();
}


return { init, updateHud, drawMinimap };
})();
