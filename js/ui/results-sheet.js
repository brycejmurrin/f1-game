/* Apex 26 — results / time-trial / championship-standings DOM builders for js/game.js. Pure DOM assembly from race + season state; no physics, no renderer. Live g… */
const GameResults = (function () {
  "use strict";

const PODIUM = [" p1", " p2", " p3"];   // indexed 0-based; 4th place on has none

// One POS / SWATCH / NAME / PTS row, the shape every ranking list on this
// screen shares (results top-10, constructors, standings, the champion
// panel). `extraClass` appends to "res-row" (e.g. " you").
function rankRow(container, i, color, name, ptsText, extraClass) {
  const row = document.createElement("div");
  row.className = `res-row${extraClass || ""}`;
  const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
  const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = color;
  const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = name;
  const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = ptsText;
  row.append(pos, sw, nm, pt);
  container.appendChild(row);
  return row;
}

function create(G) {
Log.info("ui", "GameResults.create");

function buildResults(order) {
  Log.info("ui", `GameResults.buildResults n=${order && order.length}`);
  const els = G.els;
  const season = G.season;
  const track = G.track;
  const cars = G.cars;
  els.resultsTable.textContent = "";
  els.resultsTitle.style.color = "";   // buildChampion tints it; #res-menu never reset it
  const sprint = G.seasonMode && SeasonCal.scored() === "sprint";
  els.resultsTitle.textContent = sprint ? `SPRINT — ${track.def.name}`
    : G.seasonMode ? `ROUND ${season.round} — ${track.def.name}`
    : `${track.def.name} RESULT`;
  // On a GUEST the order is the host's (game.js netOrder) but `retired`/`dnf`
  // were still this peer's own: each peer arms reliability off its OWN seed
  // and race counter (game.js armReliability), so the guest parked different
  // AI cars than the host and its sheet said "(dnf)" / "DNF" beside cars the
  // host had classified as finishers, and points beside ones it had retired.
  // The verdict is the only source: a car the host timed (`t` > 0) finished
  // whatever this peer saw; `r` (the reason, when the host sends one) names
  // the retirements among the untimed. An untimed car with no `r` keeps the
  // local flag — the best a guest can do until the payload says.
  const np = G.netPlay;
  const verdict = np && np.active && np.active() && !np.ownsClassification() && np.peerResult();
  const hostRow = new Map(Array.isArray(verdict) ? verdict.map((e) => [e.d, e]) : []);
  const dnfOf = (c) => {
    const e = hostRow.get(c.driverId);
    const local = c.retired ? (c.dnf || "dnf") : null;
    if (!e) return local;
    if (e.r != null) return e.r || null;
    return e.t > 0 ? null : local;
  };
  order.forEach((c, i) => {
    const dnf = dnfOf(c);
    const row = document.createElement("div");
    const podium = PODIUM[i] || "";
    const other = c.human && !c.local ? " q-real" : "";
    row.className = `res-row${podium}${c.isPlayer ? " you" : ""}${other}`;
    row.style.setProperty("--i", i);   // settle stagger, css/components.css
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = G.cssCol(c.team.color);
    const nm = document.createElement("span"); nm.className = "res-name";
    // A retirement says WHY in the place a penalty would say how much: the two
    // never co-occur (a car that stopped was not given time back).
    // Set textContent FIRST — it replaces ALL children, so the PLAYER tag must
    // append after it (appending first silently destroyed the tag every race).
    // A lapped finisher is flagged at its next crossing (RaceControl.flagOut),
    // so its lap count is what separates it from the winner — say so.
    const down = !dnf && order[0] ? Math.max(0, (order[0].lap | 0) - (c.lap | 0)) : 0;
    const suffix = dnf ? `  (${dnf})` : c.penalty ? `  (+${c.penalty}s)` : "";
    const downSuffix = down ? `  (+${down}${down > 1 ? " LAPS)" : " LAP)"}` : "";
    nm.textContent = `${c.code}  ${c.name}${suffix}${downSuffix}`;
    if (other) {
      // Text as well as colour, for the same reason the quali sheet does it.
      const tag = document.createElement("span");
      tag.className = "q-real-tag"; tag.textContent = " PLAYER";
      nm.appendChild(tag);
    }
    const pt = document.createElement("span"); pt.className = "res-pts";
    const table = sprint ? SeasonCal.SPRINT_POINTS
      : G.seasonMode ? SeasonCal.pointsTable() : Teams.POINTS;
    // "+FL": this round's fastest-lap point (SeasonCal.award sets lastFl only
    // when the format pays it, and only to a top-ten finisher).
    const fl = !sprint && G.seasonMode && season && season.lastFl === c.driverId && !dnf ? 1 : 0;
    pt.textContent = dnf ? "DNF" : `${(table[i] || 0) + fl} pts${fl ? " +FL" : ""}`;
    row.append(pos, sw, nm, pt);
    els.resultsTable.appendChild(row);
  });
  // THE ROUND'S EARNINGS. Career only, and only for a round that just settled.
  // Every figure here comes straight off Career.settleRound()'s return, which
  // used to be computed and discarded — so the balance moved and the player was
  // never told by how much or for what.
  const st = G.careerSettlement;
  if (st) {
    const box = document.createElement("div");
    box.className = "res-settle";
    // The balance moved: say so to a screen reader too (polite live region).
    box.setAttribute("role", "status");
    const h = document.createElement("div");
    h.className = "res-settle-head";
    h.textContent = st.dnf ? `ROUND SETTLED — DNF (${st.dnf})` : "ROUND SETTLED";
    box.appendChild(h);
    // One label/value settlement row, appended straight to `box`.
    const addRow = (cls, label, valueText) => {
      const r = document.createElement("div");
      r.className = cls;
      const a = document.createElement("span"); a.textContent = label;
      const b = document.createElement("span"); b.className = "res-settle-v"; b.textContent = valueText;
      r.append(a, b);
      box.appendChild(r);
    };
    // Signed, and only when non-zero: a driver career has no wage bill and a
    // missed brief pays nothing, and a column of zeroes reads as a bug.
    const line = (k, v, cls) => {
      if (!v) return;
      addRow(`res-settle-row${cls ? ` ${cls}` : ""}`, k, `${v > 0 ? "+" : "\u2212"}${Math.abs(v).toLocaleString()} cr`);
    };
    line(`Prize money — P${st.pos}`, st.prize);
    line("Salary", st.salary);
    line(`Points bonus — ${st.pts} pts`, st.bonus);
    if (st.obj) {
      line(Career.objectiveLabel(st.obj), st.obj.done ? Career.OBJ_BONUS : 0);
      if (!st.obj.done) addRow("res-settle-row missed", Career.objectiveLabel(st.obj), "MISSED");
    }
    line("Sponsor bonus", st.sponsorPay);
    line("Driver wages", -st.wages);
    addRow("res-settle-row total", "BALANCE", `${st.money.toLocaleString()} cr`);
    addRow("res-settle-row rep", "Reputation", `${Math.round(st.rep)} / 100`);
    if (st.unsaved) {
      const unsaved = document.createElement("div");
      unsaved.id = "res-settle-unsaved";
      unsaved.textContent = "SESSION ONLY — this result has not been saved to this device.";
      box.appendChild(unsaved);
    }
    els.resultsTable.appendChild(box);
  }

  if (G.seasonMode) {
    // Driver championship (top 10)
    const head = document.createElement("div");
    head.className = "sel-label";
    head.textContent = sprint ? "DRIVERS — AFTER THE SPRINT" : `DRIVERS — AFTER ROUND ${season.round}`;
    els.resultsTable.appendChild(head);
    // SeasonCal.rank, not a bare points sort: equal points fall to countback
    // there and the STANDINGS sheet already used it — this list put whoever
    // was earlier in the field order first and the two screens disagreed.
    const all = cars.slice().sort((a, b) => SeasonCal.rank(season, a.driverId, b.driverId)).slice(0, 10);
    all.forEach((c, i) => {
      rankRow(els.resultsTable, i, G.cssCol(c.team.color), `${c.code}  ${c.name}`,
        `${season.pts[c.driverId] || 0} pts`, c.isPlayer ? " you" : "");
    });
    // Team championship (top 5)
    const tmHead = document.createElement("div");
    tmHead.className = "sel-label";
    tmHead.textContent = "CONSTRUCTORS";
    els.resultsTable.appendChild(tmHead);
    const tmList = Object.entries(season.teamPts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    tmList.forEach(([teamId, pts], i) => {
      const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
      rankRow(els.resultsTable, i, G.cssCol(team.color), team.name || teamId, `${pts} pts`);
    });
    // Never "MAIN MENU" for a sprint: the champion panel at the end of a season
    // uses that exact string as its first-click sentinel (js/game.js resNext).
    els.resNext.textContent = sprint ? "TO THE GRAND PRIX"
      : season.round >= SeasonCal.rounds() ? "FINISH SEASON" : "NEXT ROUND";
  } else {
    els.resNext.textContent = "RACE AGAIN";
  }
}

function buildTTResults() {
  const els = G.els;
  const track = G.track;
  els.resultsTable.textContent = "";
  els.resultsTitle.style.color = "";
  els.resultsTitle.textContent = `${track.def.name} — TIME TRIAL`;
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
      gv.style.color = delta <= 0 ? "var(--faster)" : "var(--slower)";
      gv.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}s`;
      gr.append(gl, gv);
      els.resultsTable.appendChild(gr);
    }
  }

  // MEDAL. Thresholds from the model's pole for this circuit at this pace and
  // difficulty (Quali.referencePole): gold beats it, silver within 3 %, bronze
  // within 7 %. The medal held is the GHOST lap's (Ghost.medal), so it is
  // always the lap the player can race against.
  const pole = G.referencePole ? G.referencePole() : 0;
  if (pole > 0) {
    const held = Ghost.medal();
    const mr = document.createElement("div");
    mr.className = "res-row";
    const ml = document.createElement("span"); ml.className = "res-name";
    ml.textContent = `MEDAL — ${held ? held.toUpperCase() : "NONE YET"}`;
    if (held) ml.style.color = `var(--${held})`;
    const mv = document.createElement("span"); mv.className = "res-pts"; mv.style.width = "auto";
    const next = Quali.MEDALS.slice().reverse().find(([m]) => !held || Quali.MEDAL_RANK[m] > Quali.MEDAL_RANK[held]);
    mv.textContent = next ? `NEXT ${next[0].toUpperCase()} ≤ ${G.fmtTime(pole * next[1])}` : `POLE ${G.fmtTime(pole)}`;
    mr.append(ml, mv);
    els.resultsTable.appendChild(mr);
  }

  // leaderboard header
  const lbHead = document.createElement("div");
  lbHead.className = "sel-label";
  lbHead.id = "res-tt-board";
  lbHead.textContent = `LEADERBOARD — ${track.def.name}`;
  els.resultsTable.appendChild(lbHead);

  const board = G.ttBoard(track.def.id);
  board.forEach((e, i) => {
    const team = G.teamById(e.teamId);
    const name = `${e.code}  ${e.name}${team ? `  · ${team.short}` : ""}`;
    const row = rankRow(els.resultsTable, i, G.cssCol(team ? team.color : [0.5, 0.5, 0.5]), name,
      G.fmtTime(e.t), e.ts >= G.ttSessionTs ? " you" : "");
    row.querySelector(".res-pts").style.width = "auto";
  });

  // DAILY: the shareable line, copied on tap (clipboard needs a secure
  // context; the fallback shows the text where the button was).
  if (G.daily && G.daily.isActive()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sel-chip";
    btn.id = "res-daily-share";
    btn.textContent = "COPY DAILY RESULT";
    btn.onclick = () => {
      const text = G.daily.shareText(Ghost.medal());
      const ok = typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText;
      if (ok) navigator.clipboard.writeText(text).then(() => { btn.textContent = "COPIED"; }, () => { btn.textContent = text; });
      else btn.textContent = text;
    };
    els.resultsTable.appendChild(btn);
  }

  // Ghost clear link
  if (Ghost.hasGhost()) {
    const clrBtn = document.createElement("button");
    clrBtn.type = "button";
    clrBtn.className = "sel-chip";
    clrBtn.id = "res-ghost-clear";
    clrBtn.textContent = "✕ CLEAR GHOST";
    clrBtn.onclick = () => {
      Ghost.clear(track.def.id);
      const remaining = G.ttBoard(track.def.id);
      G.ttRecord = remaining.length ? remaining[0].t : Infinity;
      buildTTResults();
    };
    els.resultsTable.appendChild(clrBtn);
  }

  els.resNext.textContent = "TRY AGAIN";
}

function buildStandings() {
  const season = G.season;
  const cars = G.cars;
  const body = G.$("standings-body");
  body.textContent = "";
  if (!season) return;
  const round = season.round;
  // Mid-weekend the sprint has scored but the round has not advanced, so
  // "AFTER ROUND r" would name the previous round while showing this one's
  // sprint points. Say which half of the weekend the table is standing on.
  const midWeekend = SeasonCal.midWeekend(season);
  const rounds = SeasonCal.rounds();
  G.$("standings-title").textContent = round >= rounds
    ? "FINAL CHAMPIONSHIP"
    : midWeekend ? `CHAMPIONSHIP — AFTER THE SPRINT, ROUND ${round + 1} / ${rounds}`
    : `CHAMPIONSHIP — AFTER ROUND ${round} / ${rounds}`;

  // Driver standings — all cars sorted by pts
  const drHead = document.createElement("div");
  drHead.className = "sel-label";
  drHead.textContent = "DRIVERS";
  body.appendChild(drHead);

  const drList = Object.entries(season.pts)
    .sort((a, b) => SeasonCal.rank(season, a[0], b[0]));   // points, then countback
  drList.forEach(([driverId, pts], i) => {
    const c = cars.find((x) => x.driverId === driverId);
    const code = c ? c.code : ((season.driverCodes && season.driverCodes[driverId]) || driverId);
    // Dropped scores: the COUNTING total, with the gross beside it.
    const net = SeasonCal.netPts(season, driverId);
    const ptsText = net === pts ? `${pts} pts` : `${net} (${pts}) pts`;
    rankRow(body, i, c ? G.cssCol(c.team.color) : "#555", `${code}${c ? `  ${c.name}` : ""}`,
      ptsText, c && c.isPlayer ? " you" : "");
  });

  // Team standings
  const tmHead = document.createElement("div");
  tmHead.className = "sel-label";
  tmHead.textContent = "CONSTRUCTORS";
  body.appendChild(tmHead);

  const tmList = Object.entries(season.teamPts)
    .sort((a, b) => b[1] - a[1]);
  tmList.forEach(([teamId, pts], i) => {
    const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
    rankRow(body, i, G.cssCol(team.color), team.name || teamId, `${pts} pts`);
  });

  // Next round info
  if (round < rounds) {
    const nextTrack = SeasonCal.track(round);
    const info = document.createElement("div");
    info.style.cssText = "margin-top:12px;font-size:12px;color:#9a9aa5;text-align:center";
    // From the pause menu this round is the one being driven, not the next.
    const live = G.state === "race" || G.state === "count";
    const lead = live ? "IN PROGRESS: ROUND " : midWeekend ? "NEXT: GRAND PRIX, ROUND " : "NEXT: ROUND ";
    info.textContent = `${lead}${round + 1} — ${nextTrack.name} (${nextTrack.gp})`;
    body.appendChild(info);
  }
}

function buildChampion() {
  const els = G.els;
  const season = G.season;
  // Countback decides a tie for the title (SeasonCal.rank); a points-only sort
  // crowned whichever tied driver came first in the field order.
  const sorted = G.cars.slice().sort((a, b) => SeasonCal.rank(season, a.driverId, b.driverId));
  const champ = sorted[0];
  const champColor = G.cssCol(champ.team.color);
  els.resultsTitle.textContent = "WORLD CHAMPION";
  els.resultsTitle.style.color = champColor;
  els.resultsTable.textContent = "";
  const banner = document.createElement("div");
  banner.style.cssText = `text-align:center;padding:18px 0 10px;font-weight:900;font-style:italic;font-size:1.4em;color:${champColor}`;
  banner.textContent = `${champ.code}  ${champ.name}`;
  const teamBanner = document.createElement("div");
  teamBanner.style.cssText = "text-align:center;font-size:0.8em;color:#aaa;margin-bottom:14px;letter-spacing:2px";
  teamBanner.textContent = champ.team.name.toUpperCase();
  els.resultsTable.append(banner, teamBanner);
  const head = document.createElement("div");
  head.className = "sel-label";
  head.textContent = "FINAL STANDINGS";
  els.resultsTable.appendChild(head);
  sorted.forEach((c, i) => {
    rankRow(els.resultsTable, i, G.cssCol(c.team.color), c.code, `${season.pts[c.driverId] || 0} pts`);
  });
  els.resNext.textContent = "MAIN MENU";
  G.announce(`${champ.code} IS WORLD CHAMPION!`, 4);
  if (G.soundOn) GameAudio.finish();
}

return { buildResults, buildTTResults, buildStandings, buildChampion };
}

return { create };
})();
