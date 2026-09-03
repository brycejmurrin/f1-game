/* Apex 26 — results / time-trial / championship-standings DOM builders for js/game.js. Pure DOM assembly from race + season state; no physics, no renderer. Live g… */
const GameResults = (function () {
  "use strict";

function create(G) {
Log.info("ui", "GameResults.create");

function buildResults(order) {
  Log.info("ui", "GameResults.buildResults n=" + (order && order.length));
  const els = G.els, season = G.season, track = G.track, cars = G.cars;
  els.resultsTable.textContent = "";
  els.resultsTitle.style.color = "";   // buildChampion tints it; #res-menu never reset it
  const sprint = G.seasonMode && SeasonCal.scored() === "sprint";
  els.resultsTitle.textContent = sprint ? "SPRINT — " + track.def.name
    : G.seasonMode ? "ROUND " + season.round + " — " + track.def.name
    : track.def.name + " RESULT";
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
    const podium = i === 0 ? " p1" : i === 1 ? " p2" : i === 2 ? " p3" : "";
    const other = c.human && !c.local ? " q-real" : "";
    row.className = "res-row" + podium + (c.isPlayer ? " you" : "") + other;
    row.style.setProperty("--i", i);   // settle stagger, css/components.css
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = G.cssCol(c.team.color);
    const nm = document.createElement("span"); nm.className = "res-name";
    // A retirement says WHY in the place a penalty would say how much: the two
    // never co-occur (a car that stopped was not given time back).
    // Set textContent FIRST — it replaces ALL children, so the PLAYER tag must
    // append after it (appending first silently destroyed the tag every race).
    nm.textContent = c.code + "  " + c.name
      + (dnf ? "  (" + dnf + ")" : c.penalty ? "  (+" + c.penalty + "s)" : "");
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
    pt.textContent = dnf ? "DNF" : ((table[i] || 0) + fl) + " pts" + (fl ? " +FL" : "");
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
    const h = document.createElement("div");
    h.className = "res-settle-head";
    h.textContent = st.dnf ? "ROUND SETTLED — DNF (" + st.dnf + ")" : "ROUND SETTLED";
    box.appendChild(h);
    // Signed, and only when non-zero: a driver career has no wage bill and a
    // missed brief pays nothing, and a column of zeroes reads as a bug.
    const line = (k, v, cls) => {
      if (!v) return;
      const r = document.createElement("div");
      r.className = "res-settle-row" + (cls ? " " + cls : "");
      const a2 = document.createElement("span"); a2.textContent = k;
      const b2 = document.createElement("span");
      b2.className = "res-settle-v";
      b2.textContent = (v > 0 ? "+" : "\u2212") + Math.abs(v).toLocaleString() + " cr";
      r.append(a2, b2);
      box.appendChild(r);
    };
    line("Prize money — P" + st.pos, st.prize);
    line("Salary", st.salary);
    line("Points bonus — " + st.pts + " pts", st.bonus);
    if (st.obj) {
      line(Career.objectiveLabel(st.obj), st.obj.done ? Career.OBJ_BONUS : 0);
      if (!st.obj.done) {
        const miss = document.createElement("div");
        miss.className = "res-settle-row missed";
        const a3 = document.createElement("span"); a3.textContent = Career.objectiveLabel(st.obj);
        const b3 = document.createElement("span");
        b3.className = "res-settle-v"; b3.textContent = "MISSED";
        miss.append(a3, b3);
        box.appendChild(miss);
      }
    }
    line("Sponsor bonus", st.sponsorPay);
    line("Driver wages", -st.wages);
    const tot = document.createElement("div");
    tot.className = "res-settle-row total";
    const ta = document.createElement("span"); ta.textContent = "BALANCE";
    const tb = document.createElement("span");
    tb.className = "res-settle-v"; tb.textContent = st.money.toLocaleString() + " cr";
    tot.append(ta, tb);
    box.appendChild(tot);
    const rep = document.createElement("div");
    rep.className = "res-settle-row rep";
    const ra = document.createElement("span"); ra.textContent = "Reputation";
    const rb = document.createElement("span");
    rb.className = "res-settle-v"; rb.textContent = Math.round(st.rep) + " / 100";
    rep.append(ra, rb);
    box.appendChild(rep);
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
    head.style.cssText = "margin-top:14px;color:#e10600;font-weight:800;font-style:italic";
    head.textContent = sprint ? "DRIVERS — AFTER THE SPRINT" : "DRIVERS — AFTER ROUND " + season.round;
    els.resultsTable.appendChild(head);
    // SeasonCal.rank, not a bare points sort: equal points fall to countback
    // there and the STANDINGS sheet already used it — this list put whoever
    // was earlier in the field order first and the two screens disagreed.
    const all = cars.slice().sort((a, b) => SeasonCal.rank(season, a.driverId, b.driverId)).slice(0, 10);
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
    // Never "MAIN MENU" for a sprint: the champion panel at the end of a season
    // uses that exact string as its first-click sentinel (js/game.js resNext).
    els.resNext.textContent = sprint ? "TO THE GRAND PRIX"
      : season.round >= SeasonCal.rounds() ? "FINISH SEASON" : "NEXT ROUND";
  } else {
    els.resNext.textContent = "RACE AGAIN";
  }
}

function buildTTResults() {
  const els = G.els, track = G.track;
  els.resultsTable.textContent = "";
  els.resultsTitle.style.color = "";
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
      gv.style.color = delta <= 0 ? "var(--faster)" : "var(--slower)";
      gv.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(3) + "s";
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
    ml.textContent = "MEDAL — " + (held ? held.toUpperCase() : "NONE YET");
    if (held) ml.style.color = "var(--" + held + ")";
    const mv = document.createElement("span"); mv.className = "res-pts"; mv.style.width = "auto";
    const next = Quali.MEDALS.slice().reverse().find(([m]) => !held || Quali.MEDAL_RANK[m] > Quali.MEDAL_RANK[held]);
    mv.textContent = next ? "NEXT " + next[0].toUpperCase() + " ≤ " + G.fmtTime(pole * next[1]) : "POLE " + G.fmtTime(pole);
    mr.append(ml, mv);
    els.resultsTable.appendChild(mr);
  }

  // leaderboard header
  const lbHead = document.createElement("div");
  lbHead.style.cssText = "margin-top:12px;color:#e10600;font-weight:800;font-style:italic";
  lbHead.textContent = "LEADERBOARD — " + track.def.name;
  els.resultsTable.appendChild(lbHead);

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

  // DAILY: the shareable line, copied on tap (clipboard needs a secure
  // context; the fallback shows the text where the button was).
  if (G.daily && G.daily.isActive()) {
    const row = document.createElement("div");
    row.style.cssText = "margin-top:10px;text-align:center";
    const btn = document.createElement("button");
    btn.style.cssText = "font-size:11px;padding:4px 10px";
    btn.textContent = "COPY DAILY RESULT";
    btn.onclick = () => {
      const text = G.daily.shareText(Ghost.medal());
      const ok = typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText;
      if (ok) navigator.clipboard.writeText(text).then(() => { btn.textContent = "COPIED"; }, () => { btn.textContent = text; });
      else btn.textContent = text;
    };
    row.appendChild(btn);
    els.resultsTable.appendChild(row);
  }

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
  // Mid-weekend the sprint has scored but the round has not advanced, so
  // "AFTER ROUND r" would name the previous round while showing this one's
  // sprint points. Say which half of the weekend the table is standing on.
  const midWeekend = SeasonCal.midWeekend(season);
  G.$("standings-title").textContent = round >= SeasonCal.rounds()
    ? "FINAL CHAMPIONSHIP"
    : midWeekend ? "CHAMPIONSHIP — AFTER THE SPRINT, ROUND " + (round + 1) + " / " + SeasonCal.rounds()
    : "CHAMPIONSHIP — AFTER ROUND " + round + " / " + SeasonCal.rounds();

  // Driver standings — all cars sorted by pts
  const drHead = document.createElement("div");
  drHead.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin-bottom:6px";
  drHead.textContent = "DRIVERS";
  body.appendChild(drHead);

  const drList = Object.entries(season.pts)
    .sort((a, b) => SeasonCal.rank(season, a[0], b[0]));   // points, then countback
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
    const pt = document.createElement("span"); pt.className = "res-pts";
    // Dropped scores: the COUNTING total, with the gross beside it.
    const net = SeasonCal.netPts(season, driverId);
    pt.textContent = net === pts ? pts + " pts" : net + " (" + pts + ") pts";
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
  if (round < SeasonCal.rounds()) {
    const nextTrack = SeasonCal.track(round);
    const info = document.createElement("div");
    info.style.cssText = "margin-top:12px;font-size:12px;color:#9a9aa5;text-align:center";
    // From the pause menu this round is the one being driven, not the next.
    const live = G.state === "race" || G.state === "count";
    info.textContent = (live ? "IN PROGRESS: ROUND " : midWeekend ? "NEXT: GRAND PRIX, ROUND " : "NEXT: ROUND ")
      + (round + 1) + " — " + nextTrack.name + " (" + nextTrack.gp + ")";
    body.appendChild(info);
  }
}

function buildChampion() {
  const els = G.els, season = G.season;
  // Countback decides a tie for the title (SeasonCal.rank); a points-only sort
  // crowned whichever tied driver came first in the field order.
  const sorted = G.cars.slice().sort((a, b) => SeasonCal.rank(season, a.driverId, b.driverId));
  const champ = sorted[0];
  const champColor = G.cssCol(champ.team.color);
  els.resultsTitle.textContent = "WORLD CHAMPION";
  els.resultsTitle.style.color = champColor;
  els.resultsTable.textContent = "";
  const banner = document.createElement("div");
  banner.style.cssText = "text-align:center;padding:18px 0 10px;font-weight:900;font-style:italic;font-size:1.4em;color:" + champColor;
  banner.textContent = champ.code + "  " + champ.name;
  const teamBanner = document.createElement("div");
  teamBanner.style.cssText = "text-align:center;font-size:0.8em;color:#aaa;margin-bottom:14px;letter-spacing:2px";
  teamBanner.textContent = champ.team.name.toUpperCase();
  els.resultsTable.append(banner, teamBanner);
  const head = document.createElement("div");
  head.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin-bottom:4px;font-size:0.85em";
  head.textContent = "FINAL STANDINGS";
  els.resultsTable.appendChild(head);
  sorted.forEach((c, i) => {
    const row = document.createElement("div"); row.className = "res-row";
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = G.cssCol(c.team.color);
    const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = c.code;
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (season.pts[c.driverId] || 0) + " pts";
    row.append(pos, sw, nm, pt);
    els.resultsTable.appendChild(row);
  });
  els.resNext.textContent = "MAIN MENU";
  G.announce(champ.code + " IS WORLD CHAMPION!", 4);
  if (G.soundOn) GameAudio.finish();
}

return { buildResults, buildTTResults, buildStandings, buildChampion };
}

return { create };
})();
