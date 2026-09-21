/* Apex 26 — results / time-trial / championship-standings DOM builders for js/game.js. Pure DOM assembly from race + season state; no physics, no renderer. Live g… */
const GameResults = (function () {
  "use strict";

const PODIUM = [" p1", " p2", " p3"];   // indexed 0-based; 4th place on has none

// Race classification timing is deliberately derived from the same fields as
// RaceControl.finishOrder (game.js): completed laps, then finishT + penalty.
// Missing fields mean the source cannot support an official elapsed/gap, so the
// results sheet leaves that part out rather than manufacturing a value.
function correctedFinish(c) {
  if (!c || typeof c.finishT !== "number" || !isFinite(c.finishT) ||
      typeof c.penalty !== "number" || !isFinite(c.penalty) || c.finishT <= 0) return null;
  return c.finishT + c.penalty;
}

function raceClock(G, seconds) {
  if (!(typeof seconds === "number" && isFinite(seconds) && seconds > 0)) return null;
  if (G && typeof G.fmtTime === "function") return G.fmtTime(seconds);
  const m = Math.floor(seconds / 60), s = seconds - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
}

function timingSummary(G, order, dnfOf, sourceOf) {
  const winner = order && order[0];
  if (!winner || dnfOf(winner)) return null;
  const data = sourceOf ? sourceOf(winner) : winner;
  if (!data || data.retired) return null;
  const winnerTime = correctedFinish(data);
  if (winnerTime == null || typeof data.lap !== "number" || !isFinite(data.lap)) return null;
  return { winner, winnerTime, winnerLap: data.lap, text: raceClock(G, winnerTime) };
}

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

// The car's race as a proportional bar: one segment per set, width = its share
// of the laps that car ran. Returns NULL when TYRE WEAR is off or the car never
// got a set, so the row keeps its exact old shape — the strip is a thing the
// setting turns on, not a column that appears blank. Null rather than an empty
// fragment on purpose: every other builder in this file uses createElement and
// appendChild alone, and reaching for createDocumentFragment here would be the
// one DOM call the sheet audit's stub does not implement, for no gain.
function stintStrip(c) {
  const tyres = G.tyres;
  const list = tyres && tyres.on() ? tyres.stints(c) : [];
  if (list.length < 1) return null;
  // Denominator is the car's OWN total, not the leader's: a car that retired on
  // lap 3 shows a full bar of what it actually ran rather than a sliver of
  // somebody else's race.
  const total = list.reduce((n, s) => n + s.laps, 0);
  const strip = document.createElement("div");
  strip.className = "res-stints";
  // The bar is decoration for a sighted reader and the codes are the content,
  // so the accessible name carries the same thing in words.
  strip.setAttribute("role", "img");
  strip.setAttribute("aria-label", "tyres: " + list.map((s) =>
    `${s.code} ${s.laps} lap${s.laps === 1 ? "" : "s"}`).join(", "));
  list.forEach((s) => {
    const seg = document.createElement("div");
    seg.className = "res-stint";
    // An equal split while total is 0 (every car on lap 0 — a race abandoned
    // before a lap was completed) rather than a division by zero.
    seg.style.flex = String(total > 0 ? s.laps : 1);
    seg.style.background = G.cssCol(s.colour);
    seg.title = `${s.code} — laps ${s.lap0}-${s.lap1}`;
    strip.appendChild(seg);
  });
  return strip;
}

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
  const guest = np && np.active && np.active() && !np.ownsClassification();
  const verdict = guest && np.peerResult();
  // Element-guarded, like the adopt path in js/game.js: a wire payload of
  // [null] satisfies Array.isArray and throws on e.d.
  const hostRow = new Map(Array.isArray(verdict)
    ? verdict.filter((e) => e && e.d != null).map((e) => [e.d, e]) : []);
  const hasCanonicalHost = Array.isArray(verdict) && verdict.length === order.length && order.length > 0
    && hostRow.size === order.length && order.every((c, i) => verdict[i] && verdict[i].d === c.driverId);
  const dnfOf = (c) => {
    const e = hostRow.get(c.driverId);
    const local = c.retired ? (c.dnf || "dnf") : null;
    if (!e) return local;
    if (e.r != null) return e.r || null;
    return e.t > 0 ? null : local;
  };
  // A guest's order and verdict are host-owned. Use those same timing, penalty,
  // and lap fields for the official summary; local reliability can classify a
  // different car and must never leak into the host's result arithmetic.
  const sourceOf = (c) => {
    if (!hasCanonicalHost) return c;
    const e = hostRow.get(c.driverId);
    if (!e) return null;
    const data = Object.assign({}, c);
    data.finishT = typeof e.t === "number" && isFinite(e.t) ? e.t : null;
    data.penalty = typeof e.p === "number" && isFinite(e.p) ? e.p : null;
    data.lap = typeof e.lap === "number" && isFinite(e.lap) ? e.lap : null;
    data.retired = !!e.r;
    return data;
  };
  const timing = guest && !hasCanonicalHost ? null : timingSummary(G, order, dnfOf, sourceOf);
  if (timing) {
    const box = document.createElement("div");
    box.className = "sel-label";
    box.setAttribute("role", "status");
    box.textContent = `OFFICIAL WINNER ELAPSED — ${timing.winner.code || "WINNER"}  ${timing.winner.name || ""}: ${timing.text}`;
    els.resultsTable.appendChild(box);
  }
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
    const winnerData = order[0] ? sourceOf(order[0]) : null;
    const carData = sourceOf(c) || {};
    const down = !dnf && winnerData && typeof winnerData.lap === "number" &&
      isFinite(winnerData.lap) && typeof carData.lap === "number" && isFinite(carData.lap)
      ? Math.max(0, (winnerData.lap | 0) - (carData.lap | 0)) : 0;
    const suffix = dnf ? `  (${dnf})` : carData.penalty ? `  (+${carData.penalty}s)` : "";
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
    row.append(pos, sw, nm);
    if (timing && !dnf && c !== timing.winner && typeof carData.lap === "number" &&
        isFinite(carData.lap) && carData.lap === timing.winnerLap) {
      const official = correctedFinish(carData);
      const gap = official == null ? null : official - timing.winnerTime;
      if (gap != null && isFinite(gap) && gap >= 0) {
        const gapText = "+" + gap.toFixed(3) + "s";
        const gapEl = document.createElement("span");
        gapEl.className = "q-time"; gapEl.textContent = gapText;
        gapEl.setAttribute("aria-label", gapText + " behind winner");
        nm.appendChild(gapEl);
      }
    }
    const strip = stintStrip(c);
    if (strip) row.appendChild(strip);
    row.appendChild(pt);
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
    // Craft pays reputation, never money, so it sits BELOW the balance line and
    // outside the credit column — a percentage there would read as an unpaid fee.
    // A bare percentage is a score with no explanation, which is the thing this
    // sheet already got wrong once, so the round debrief follows it: the same
    // events RaceInsights logged all race, condensed to the ones that cost craft,
    // with the laps to go and look at. Nothing when the race was faultless.
    if (typeof st.craft === "number") {
      addRow("res-settle-row rep", "Race craft", `${Math.round(st.craft * 100)}%`);
      const debrief = G.coach && G.coach.insights ? G.coach.insights.debrief() : [];
      for (const d of debrief) {
        addRow("res-settle-row craft", `${d.label} × ${d.count}`,
          `lap ${d.laps.slice(0, 4).join(", ")}${d.laps.length > 4 ? "…" : ""}`);
      }
    }
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

  // A shared guest is the active rival on its circuit; otherwise keep the
  // personal-best path exactly as before.
  const guestGhost = GhostShare.hasGuest();
  const replayGhost = guestGhost ? GhostShare : Ghost;
  if ((guestGhost || Ghost.hasGhost()) && isFinite(best)) {
    const ghostBest = replayGhost.bestTime();
    if (isFinite(ghostBest)) {
      const delta = best - ghostBest;
      const gr = document.createElement("div");
      gr.className = "res-row";
      const gl = document.createElement("span"); gl.className = "res-name";
      gl.textContent = guestGhost ? "RIVAL GHOST" : "YOUR PB";
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
  lbHead.textContent = `MATCHING SETUP & CONDITIONS — ${track.def.name}`;
  els.resultsTable.appendChild(lbHead);

  const board = G.records.board(track.def.id);
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

  // Portable PB export. The guest slot is deliberately not exported here:
  // results share the lap this player owns, and installGuest never writes it.
  const shareGhost = Ghost.snapshot();
  if (shareGhost) {
    const activeDaily = G.daily && G.daily.isActive() && G.daily.current ? G.daily.current() : null;
    const shareOpts = {
      track: track.def.id,
      context: Ghost.context(),
      day: activeDaily && activeDaily.day ? activeDaily.day : null,
    };
    const encoded = GhostShare.encode(shareGhost, shareOpts);
    const fallback = (btn, value, label) => {
      const box = document.createElement("textarea");
      box.id = "res-ghost-copy-fallback";
      box.className = "sel-chip";
      box.readOnly = true;
      box.value = value;
      box.setAttribute("aria-label", label + " — select and copy");
      btn.insertAdjacentElement ? btn.insertAdjacentElement("afterend", box) : els.resultsTable.appendChild(box);
      if (box.focus) box.focus();
      if (box.select) box.select();
      try { if (document.execCommand) document.execCommand("copy"); } catch (_) { /* selection remains visible */ }
      btn.textContent = "SELECT & COPY";
    };
    const copy = async (btn, field, label) => {
      const shared = await encoded;
      if (!shared.ok) {
        btn.textContent = shared.reason === "too-large" ? "TOO LARGE — DOWNLOAD" : "UNAVAILABLE";
        return;
      }
      const value = shared[field];
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(value);
        btn.textContent = "COPIED";
      } catch (_) { fallback(btn, value, label); }
    };
    const action = (id, text) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "sel-chip"; btn.id = id; btn.textContent = text;
      els.resultsTable.appendChild(btn);
      return btn;
    };
    const link = action("res-ghost-copy-link", "COPY LINK");
    link.onclick = () => copy(link, "url", "Ghost link");
    const code = action("res-ghost-copy-code", "COPY CODE");
    code.onclick = () => copy(code, "code", "Ghost code");
    const download = action("res-ghost-download", "DOWNLOAD");
    download.onclick = () => {
      const file = GhostShare.fileExport(shareGhost, shareOpts);
      if (!file.ok) { download.textContent = "UNAVAILABLE"; return; }
      const href = URL.createObjectURL(new Blob([file.text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = href; a.download = file.name; a.hidden = true;
      document.body.appendChild(a); a.click(); a.remove();
      // 10 s, the house idiom — see js/ui/settings-export.js. A 0 ms revoke can
      // kill the object URL before the browser has finished reading it.
      setTimeout(() => URL.revokeObjectURL(href), 10000);
      download.textContent = "DOWNLOADED";
    };
  }

  // Ghost clear link
  if (guestGhost || Ghost.hasGhost()) {
    const clrBtn = document.createElement("button");
    clrBtn.type = "button";
    clrBtn.className = "sel-chip";
    clrBtn.id = "res-ghost-clear";
    clrBtn.textContent = guestGhost ? "✕ CLEAR RIVAL GHOST" : "✕ CLEAR GHOST";
    clrBtn.onclick = () => {
      if (guestGhost) GhostShare.clearGuest();
      else Ghost.clear(track.def.id);
      const remaining = G.records.board(track.def.id);
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
  // A ONE-OFF RACE HAS NO CHAMPIONSHIP. The pause menu still offers STANDINGS,
  // and this used to return with the body empty — a title, a CLOSE button and
  // nothing between them, which reads as a broken screen rather than as "there
  // is nothing to stand on". `.dh-empty` is the house empty state (css/data.css)
  // so this costs no new class.
  if (!season) {
    const note = document.createElement("div");
    note.className = "dh-empty";
    note.textContent = "No championship is running — standings appear in a Season or a Career.";
    body.appendChild(note);
    return;
  }
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
