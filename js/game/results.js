/* Apex 26 — results / time-trial / championship-standings DOM builders for
   js/game.js. Pure DOM assembly from race + season state; no physics, no
   renderer. Live game state comes through the ctx façade handed to
   GameResults.create(ctx) at boot (see the `G` object in game.js): els, $,
   track, cars, player, season, seasonMode, TT session fields, fmtTime,
   ttBoard, teamById, cssCol. Consumes globals Teams, Tracks, Ghost.
   Must load BEFORE js/game.js (see index.html). */
const GameResults = (function () {
  "use strict";

function create(G) {

function buildResults(order) {
  const els = G.els, season = G.season, track = G.track, cars = G.cars;
  els.resultsTable.textContent = "";
  els.resultsTitle.textContent = G.seasonMode
    ? "ROUND " + season.round + (season.round > 1 ? "" : "") + " — " + track.def.name
    : track.def.name + " RESULT";
  order.forEach((c, i) => {
    const row = document.createElement("div");
    const podium = i === 0 ? " p1" : i === 1 ? " p2" : i === 2 ? " p3" : "";
    row.className = "res-row" + podium + (c.isPlayer ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = G.cssCol(c.team.color);
    const nm = document.createElement("span"); nm.className = "res-name";
    // A retirement says WHY in the place a penalty would say how much: the two
    // never co-occur (a car that stopped was not given time back).
    nm.textContent = c.code + "  " + c.name
      + (c.retired ? "  (" + (c.dnf || "dnf") + ")" : c.penalty ? "  (+" + c.penalty + "s)" : "");
    const pt = document.createElement("span"); pt.className = "res-pts";
    // Classified last and scoring nothing — the same rule endRace awards on, said
    // in the one word the sport uses for it.
    pt.textContent = c.retired ? "DNF" : (Teams.POINTS[i] || 0) + " pts";
    row.append(pos, sw, nm, pt);
    els.resultsTable.appendChild(row);
  });
  if (G.seasonMode) {
    // Driver championship (top 10)
    const head = document.createElement("div");
    head.style.cssText = "margin-top:14px;color:#e10600;font-weight:800;font-style:italic";
    head.textContent = "DRIVERS — AFTER ROUND " + season.round;
    els.resultsTable.appendChild(head);
    const all = cars.slice().sort((a, b) => (season.pts[b.driverId] || 0) - (season.pts[a.driverId] || 0)).slice(0, 10);
    all.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "res-row" + (c.isPlayer ? " you" : "");
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
      const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = G.cssCol(c.team.color);
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = c.code + "  " + c.name;
      const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (season.pts[c.driverId] || 0) + " pts";
      row.append(pos, sw, nm, pt);
      els.resultsTable.appendChild(row);
    });
    // Team championship (top 5)
    const tmHead = document.createElement("div");
    tmHead.style.cssText = "margin-top:10px;color:#e10600;font-weight:800;font-style:italic";
    tmHead.textContent = "CONSTRUCTORS";
    els.resultsTable.appendChild(tmHead);
    const tmList = Object.entries(season.teamPts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    tmList.forEach(([teamId, pts], i) => {
      const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
      const row = document.createElement("div");
      row.className = "res-row";
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
      const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = G.cssCol(team.color);
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = team.name || teamId;
      const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
      row.append(pos, sw, nm, pt);
      els.resultsTable.appendChild(row);
    });
    els.resNext.textContent = season.round >= Tracks.SEASON.length ? "FINISH SEASON" : "NEXT ROUND";
  } else {
    els.resNext.textContent = "RACE AGAIN";
  }
}

function buildTTResults() {
  const els = G.els, track = G.track;
  els.resultsTable.textContent = "";
  els.resultsTitle.textContent = track.def.name + " — TIME TRIAL";
  const best = G.player.best;

  // headline: your best lap this session (green if it set a new track record)
  const head = document.createElement("div");
  head.className = "res-row you";
  head.style.fontSize = "18px";
  const hl = document.createElement("span"); hl.className = "res-name";
  hl.textContent = G.ttNewRecord ? "★ NEW RECORD" : "YOUR BEST";
  const hv = document.createElement("span"); hv.className = "res-pts"; hv.style.width = "auto";
  hv.textContent = isFinite(best) ? G.fmtTime(best) : "-";
  head.append(hl, hv);
  els.resultsTable.appendChild(head);

  // Ghost delta row (shows gap to ghost best)
  if (Ghost.hasGhost() && isFinite(best)) {
    const ghostBest = Ghost.bestTime();
    if (isFinite(ghostBest)) {
      const delta = best - ghostBest;
      const gr = document.createElement("div");
      gr.className = "res-row";
      const gl = document.createElement("span"); gl.className = "res-name"; gl.textContent = "vs Ghost";
      const gv = document.createElement("span"); gv.className = "res-pts"; gv.style.width = "auto";
      gv.style.color = delta <= 0 ? "#a3e635" : "#e10600";
      gv.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(3) + "s";
      gr.append(gl, gv);
      els.resultsTable.appendChild(gr);
    }
  }

  // leaderboard header
  const lbHead = document.createElement("div");
  lbHead.style.cssText = "margin-top:12px;color:#e10600;font-weight:800;font-style:italic";
  lbHead.textContent = "LEADERBOARD — " + track.def.name;
  els.resultsTable.appendChild(lbHead);

  // top laps ever on this track, each tagged with the team + driver that set it.
  // Entries from this session (ts >= session start) are highlighted.
  const board = G.ttBoard(track.def.id);
  board.forEach((e, i) => {
    const team = G.teamById(e.teamId);
    const row = document.createElement("div");
    row.className = "res-row" + (e.ts >= G.ttSessionTs ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = G.cssCol(team ? team.color : [0.5, 0.5, 0.5]);
    const nm = document.createElement("span"); nm.className = "res-name";
    nm.textContent = e.code + "  " + e.name + (team ? "  · " + team.short : "");
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.style.width = "auto";
    pt.textContent = G.fmtTime(e.t);
    row.append(pos, sw, nm, pt);
    els.resultsTable.appendChild(row);
  });

  // Ghost clear link
  if (Ghost.hasGhost()) {
    const clrRow = document.createElement("div");
    clrRow.style.cssText = "margin-top:10px;text-align:center";
    const clrBtn = document.createElement("button");
    clrBtn.style.cssText = "font-size:11px;padding:4px 10px;opacity:0.6";
    clrBtn.textContent = "✕ CLEAR GHOST";
    clrBtn.onclick = () => {
      Ghost.clear(track.def.id);
      const remaining = G.ttBoard(track.def.id);
      G.ttRecord = remaining.length ? remaining[0].t : Infinity;
      buildTTResults();
    };
    clrRow.appendChild(clrBtn);
    els.resultsTable.appendChild(clrRow);
  }

  els.resNext.textContent = "TRY AGAIN";
}

function buildStandings() {
  const season = G.season, cars = G.cars;
  const body = G.$("standings-body");
  body.textContent = "";
  if (!season) return;
  const round = season.round;
  G.$("standings-title").textContent = round >= Tracks.SEASON.length
    ? "FINAL CHAMPIONSHIP" : "CHAMPIONSHIP — AFTER ROUND " + round + " / " + Tracks.SEASON.length;

  // Driver standings — all cars sorted by pts
  const drHead = document.createElement("div");
  drHead.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin-bottom:6px";
  drHead.textContent = "DRIVERS";
  body.appendChild(drHead);

  const drList = Object.entries(season.pts)
    .sort((a, b) => b[1] - a[1]);
  drList.forEach(([driverId, pts], i) => {
    const c = cars.find((x) => x.driverId === driverId);
    const code = c ? c.code : ((season.driverCodes && season.driverCodes[driverId]) || driverId);
    const row = document.createElement("div");
    row.className = "res-row" + (c && c.isPlayer ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = c ? G.cssCol(c.team.color) : "#555";
    const nm = document.createElement("span"); nm.className = "res-name";
    nm.textContent = code + (c ? "  " + c.name : "");
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
    row.append(pos, sw, nm, pt);
    body.appendChild(row);
  });

  // Team standings
  const tmHead = document.createElement("div");
  tmHead.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin:14px 0 6px";
  tmHead.textContent = "CONSTRUCTORS";
  body.appendChild(tmHead);

  const tmList = Object.entries(season.teamPts)
    .sort((a, b) => b[1] - a[1]);
  tmList.forEach(([teamId, pts], i) => {
    const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
    const row = document.createElement("div");
    row.className = "res-row";
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = G.cssCol(team.color);
    const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = team.name || teamId;
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
    row.append(pos, sw, nm, pt);
    body.appendChild(row);
  });

  // Next round info
  if (round < Tracks.SEASON.length) {
    const nextTrack = Tracks.SEASON[round];
    const info = document.createElement("div");
    info.style.cssText = "margin-top:12px;font-size:12px;color:#9a9aa5;text-align:center";
    info.textContent = "NEXT: ROUND " + (round + 1) + " — " + nextTrack.name + " (" + nextTrack.gp + ")";
    body.appendChild(info);
  }
}

return { buildResults, buildTTResults, buildStandings };
}

return { create };
})();
