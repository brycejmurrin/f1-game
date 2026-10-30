/* Apex 26 — results / time-trial / championship-standings DOM builders for js/game.js. Pure DOM assembly from race + season state; no physics, no renderer. Live g… */
const GameResults = (function () {
  "use strict";

// I18n.t with English defaults; the bare fallback keeps VM tests that load this file alone working.
const tr = (key, vars, def) => typeof I18n !== "undefined" ? I18n.t(key, vars, def)
  : String(def).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));

const trN = (x) => typeof I18n !== "undefined" ? I18n.n(x) : x.toLocaleString();   // prose numbers localise; lap times and gaps stay "."-formatted

const medalName = (medal) => tr("results.medal." + medal, null, medal.toUpperCase());

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

// A CLASSIFICATION reads to the thousandth. G.fmtTime is the HUD clock (two
// decimals by design, js/game.js), and on these sheets two laps 0.004 s apart
// printed identically. Dom.fmtLap is the timing-sheet formatter (1:21.163).
function lapClock(G, t) {
  return typeof Dom !== "undefined" && Dom.fmtLap ? Dom.fmtLap(t, "-") : G.fmtTime(t);
}

// The ELAPSED race time: hours past the hour (a FULL-distance race read
// "92:14.53"), and thousandths like the gaps it is measured against.
function raceClock(G, seconds) {
  if (!(typeof seconds === "number" && isFinite(seconds) && seconds > 0)) return null;
  if (typeof Dom !== "undefined" && Dom.fmtRaceClock) return Dom.fmtRaceClock(seconds);
  if (G && typeof G.fmtTime === "function") return G.fmtTime(seconds);
  const cs = Math.round(seconds * 100), m = Math.floor(cs / 6000), s = (cs - m * 6000) / 100;   // round first (see game.js fmtTime)
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
// ONE points label for every standings list. The lists are ORDERED by
// SeasonCal.rank, which ranks the counting (net) total when scores are dropped;
// two of them printed the gross, so a driver could show more points than the
// one ranked above. The counting total, with the gross beside it when they differ.
function ptsLabel(season, driverId) {
  const pts = season.pts[driverId] || 0;
  const net = SeasonCal.netPts(season, driverId);
  return net === pts ? tr("results.points", { points: trN(pts) }, "{points} pts") : tr("results.netPoints", { net: trN(net), points: trN(pts) }, "{net} ({points}) pts");
}
// [teamId, pts] in SeasonCal.rankTeams order — the one constructors' rule
// Career.teamStandings uses too (points, countback, tier, id). A points-only
// sort left ties in teamPts insertion order, so on equal points this sheet
// could show the player's team P8 while Career settled the teamPos goal as P9.
function teamOrder(season) {
  const tp = season.teamPts || {};
  return Object.keys(tp).sort((a, b) => SeasonCal.rankTeams(season, a, b)).map((id) => [id, tp[id]]);
}
// THE CHAMPIONSHIP TABLE, NOT THE GRID. Season points are keyed by seat
// (team:index) and the grid holds only THIS race's teams, so a Season raced
// partly as MY TEAM / LEGENDS kept that seat's points after a team switch while
// the results list and the champion banner, sorted from G.cars, dropped it —
// and crowned the wrong driver while STANDINGS (season.pts) disagreed. Every
// seat in season.pts plus every grid car, in SeasonCal.rank order (points,
// then countback); an off-grid seat takes its code from driverCodes and its
// team from the id prefix, as buildStandings does.
function seasonTable(cars, season) {
  const ids = new Set(Object.keys(season.pts || {}));
  for (const c of cars) ids.add(c.driverId);
  return Array.from(ids).sort((a, b) => SeasonCal.rank(season, a, b)).map((id) => {
    const c = cars.find((x) => x.driverId === id);
    if (c) return c;
    const teamId = String(id).split(":")[0];
    const team = (typeof Teams !== "undefined" && Teams.LIST && Teams.LIST.find((t) => t.id === teamId)) || { id: teamId, name: teamId };
    return { driverId: id, code: (season.driverCodes && season.driverCodes[id]) || id, name: "", team, isPlayer: false };
  });
}
function seatColor(G, c) { return c.team && c.team.color ? G.cssCol(c.team.color) : "#555"; }

// OPEN AT THE TOP. This used to scrollIntoView the player's row, which on an
// 844x390 phone opened the sheet ~1260px down with the podium and the winner
// off-screen. The ranking list's .res-row.you sticks to BOTH edges of the
// scroller (css/overlays.css), so it shows once its list is in view without
// moving the sheet. Double-rAF: endRace shows #results after buildResults returns.
function resultsAtTop(table) {
  if (!table) return;
  const run = () => { table.scrollTop = 0; };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(run));
  else run();
}
// "P1 <CODE>" beside the title: in the head, outside the scroller, so the
// winner is on screen at open. Hidden on the TT and champion views.
function winnerChip(els, code) {
  const head = els.resultsTitle && els.resultsTitle.parentElement;
  if (!head) return;
  let chip = head.querySelector("#res-winner");
  if (!chip && code) {
    chip = document.createElement("span");
    chip.id = "res-winner";
    head.appendChild(chip);
  }
  if (!chip) return;
  chip.hidden = !code;
  chip.textContent = code ? tr("results.winnerChip", { code }, "P1 {code}") : "";
}

function rankingList(container, label) {
  const list = document.createElement("div");
  list.setAttribute("data-results-part", "ranking");
  list.setAttribute("role", "list"); list.setAttribute("aria-label", label);
  container.appendChild(list); return list;
}
function rankRow(container, i, color, name, ptsText, extraClass) {
  const row = document.createElement("div");
  row.className = `res-row${extraClass || ""}`;
  row.setAttribute("role", "listitem");
  const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = trN(i + 1);
  const sw = document.createElement("span"); sw.className = "res-swatch"; sw.setAttribute("aria-hidden", "true"); sw.style.background = color;
  const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = name;
  const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = ptsText;
  row.append(pos, sw, nm, pt);
  container.appendChild(row);
  return row;
}

// [data-say] cards are spoken once per result after the sheet shows (a pre-filled role=status is silent).
let saidFor = null;
function spokenText(n) {
  const kids = n.children ? Array.from(n.children) : [];
  return (kids.length ? kids.map(spokenText).join(" ") : String(n.textContent || "")).replace(/\s+/g, " ").trim();
}
function sayCards(sheet, table, key) {
  if (!table || typeof LiveRegion === "undefined" || key === saidFor) return;
  saidFor = key;
  const text = Array.from(table.querySelectorAll("[data-say]"), spokenText).filter(Boolean).join(". ");
  if (!text) return;
  const say = () => LiveRegion.say(text, "save");
  if (!sheet || !sheet.hidden || typeof MutationObserver === "undefined") { setTimeout(say, 0); return; }
  const mo = new MutationObserver(() => { if (!sheet.hidden) { mo.disconnect(); say(); } });
  mo.observe(sheet, { attributes: true, attributeFilter: ["hidden"] });
}

function create(G) {
Log.info("ui", "GameResults.create");
// LICENCE BADGES toast through the one banner (js/career/badges.js owns the rules).
if (typeof Badges !== "undefined") Badges.setNotifier((labels) =>
  G.announce && G.announce((labels.length > 1 ? tr("results.badgesUnlocked", null, "BADGES UNLOCKED") : tr("results.badgeUnlocked", null, "BADGE UNLOCKED")) + " — " + labels.join(" · "), 3, "race"));

// The player's classified result as Badges.forRace reads it. Never in a
// practice (unscored) session or a DUEL (two cars: P2 of 2 is not a podium —
// endRace passes its own duelOn(); fewer than three cars is the same race);
// a retirement earns nothing there anyway.
// Returns the newly unlocked ids — the toast is hidden behind this very sheet.
function awardBadges(order, duel) {
  const p = G.player;
  if (typeof Badges === "undefined" || !p || p.classified === false || G.practice || G.timeTrial || duel || order.length < 3) return [];
  let best = Infinity;
  for (const c of order) if (!c.retired && !c.dsq && c.best < best) best = c.best;   // finished or running at the flag, as endRace finds it
  return Badges.onRace({
    pos: order.indexOf(p) + 1, retired: !!p.retired || !!p.dsq, finished: !!p.finished,
    cuts: p.cuts | 0, penalty: p.penalty || 0, trackId: G.track && G.track.def && G.track.def.id,
    fastest: isFinite(best) && p.best === best,
  });
}

// The points column for a car that scored nothing: DSQ or DNF.
const outLabel = (why) => (String(why).indexOf("DSQ") === 0 ? "DSQ" : "DNF");

// New LICENCE BADGES as a card on the sheet that hides the banner toast.
function badgeCard(ids) {
  const card = document.createElement("div"); card.className = "res-personal";
  card.setAttribute("data-say", "");
  const heading = document.createElement("strong"); heading.textContent = ids.length > 1 ? tr("results.badgesUnlocked", null, "BADGES UNLOCKED") : tr("results.badgeUnlocked", null, "BADGE UNLOCKED");
  const detail = document.createElement("span"); detail.textContent = ids.map(Badges.labelOf).join(" · ");
  card.append(heading, detail);
  return card;
}

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
  const names = { S: tr("results.tyre.S", null, "Soft"), M: tr("results.tyre.M", null, "Medium"), H: tr("results.tyre.H", null, "Hard"), I: tr("results.tyre.I", null, "Intermediate"), W: tr("results.tyre.W", null, "Wet"), SS: tr("results.tyre.SS", null, "Super soft"), HS: tr("results.tyre.HS", null, "Hyper soft") };
  const description = list.map((s) => tr("results.stints.range", { compound: names[s.code] || s.code, from: trN(s.lap0), to: trN(s.lap1) }, "{compound} — completed laps {from}-{to}")).join("; ");
  strip.setAttribute("aria-label", tr("results.stints.label", { stints: description }, "Tyre stints: {stints}"));
  list.forEach((s) => {
    const seg = document.createElement("div");
    seg.className = "res-stint";
    // An equal split while total is 0 (every car on lap 0 — a race abandoned
    // before a lap was completed) rather than a division by zero.
    seg.style.flex = String(total > 0 ? s.laps : 1);
    seg.style.background = G.cssCol(s.colour);
    seg.title = tr("results.stints.tooltip", { code: s.code, from: trN(s.lap0), to: trN(s.lap1) }, "{code} — laps {from}-{to}");
    strip.appendChild(seg);
  });
  const details = document.createElement("details"); details.setAttribute("data-stint-details", "");
  const summary = document.createElement("summary"); summary.textContent = tr("results.stints.title", null, "TYRE STINTS");
  const text = document.createElement("div"); text.setAttribute("data-stint-text", ""); text.textContent = description;
  details.append(summary, text);
  return { strip, details };
}

// `race` is endRace's own read of the session ({ sprint, duel }). The sprint
// flag must not come from SeasonCal.scored() alone: award() returns early on a
// save conflict and leaves the weekend's sprint marker, so a Grand Prix read
// back as a sprint. Callers without it fall back to scored().
function noteLastSession(session) {
  if (typeof ShareCode === "undefined" || !ShareCode.recordSession || !G.store || !G.track) return;
  ShareCode.recordSession(G.store, {
    trackId: G.track.def.id,
    trackName: G.track.def.name,
    session: session === "tt" ? "tt" : "race",
    flow: G.flow || "gp",
  });
}

function buildResults(order, race) {
  Log.info("ui", `GameResults.buildResults n=${order && order.length}`);
  noteLastSession("race");
  const els = G.els;
  if (els.results) els.results.dataset.resultsView = "race";
  const season = G.season;
  const track = G.track;
  const cars = G.cars;
  els.resultsTable.textContent = "";
  els.resultsTitle.style.color = "";   // buildChampion tints it; #res-menu never reset it
  // A FRIEND race ends with the room still on screen but not alive: RACE AGAIN is a solo race and MENU
  // drops the connection (game.js resNext/resMenu stop NetPlay). Name both, and offer a fresh room.
  const friend = !!(G.netPlay && G.netPlay.active && G.netPlay.active());
  if (els.resMenu) els.resMenu.textContent = friend ? tr("results.newFriendRoom", null, "NEW FRIEND ROOM") : tr("results.menu", null, "MENU");
  const sprint = race && typeof race.sprint === "boolean" ? race.sprint
    : G.seasonMode && SeasonCal.scored() === "sprint";
  els.resultsTitle.textContent = sprint ? tr("results.sprintTitle", { track: track.def.name }, "SPRINT — {track}")
    : G.seasonMode ? tr("results.roundTitle", { round: trN(season.round), track: track.def.name }, "ROUND {round} — {track}")
    : tr("results.raceTitle", { track: track.def.name }, "{track} RESULT");
  // A WATCHED real race (REAL REPLAY / HIGHLIGHTS, js/race/real-race.js) ends here too, with the
  // followed car as G.player (G.followCar) — nobody drove it: no badge, no YOUR RACE card.
  const watched = typeof RealRace !== "undefined" && !!RealRace.status().watch;
  // The table SeasonCal.award / Career.scoreRound paid: a race nobody took the
  // flag in (the only human retired) pays the shortened-race scale.
  const table = SeasonCal.payTable(sprint ? SeasonCal.SPRINT_POINTS : G.seasonMode ? SeasonCal.pointsTable() : Teams.POINTS,
    sprint ? "sprint" : "race", RaceControl.shortRun(order, G.lapsTarget));
  const badges = sprint || watched ? [] : awardBadges(order, !!(race && race.duel));   // a sprint is not a Grand Prix result
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
  const kept = np && np.lastResult && np.lastResult();   // the host left after its RESULT (#2199)
  const guest = !!kept || (np && np.active && np.active() && !np.ownsClassification());
  const verdict = guest && (kept || np.peerResult());
  // Element-guarded, like the adopt path in js/game.js: a wire payload of
  // [null] satisfies Array.isArray and throws on e.d.
  const hostRow = new Map(Array.isArray(verdict)
    ? verdict.filter((e) => e && e.d != null).map((e) => [e.d, e]) : []);
  const hasCanonicalHost = Array.isArray(verdict) && verdict.length === order.length && order.length > 0
    && hostRow.size === order.length && order.every((c, i) => verdict[i] && verdict[i].d === c.driverId);
  const dnfOf = (c) => {
    const e = hostRow.get(c.driverId);
    // A DISQUALIFICATION says why in the same place (FIA 2026 SR B6.3.6: one dry compound).
    const local = c.retired ? (c.dnf || "dnf") : c.dsq ? "DSQ — " + c.dsq : null;
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
    box.setAttribute("data-say", "");
    box.textContent = tr("results.winnerElapsed", { code: timing.winner.code || tr("results.winner", null, "WINNER"), name: timing.winner.name || "", time: timing.text }, "OFFICIAL WINNER ELAPSED — {code}  {name}: {time}");
    els.resultsTable.appendChild(box);
  }
  if (typeof ResultsStory !== "undefined") {
    const story = ResultsStory.render(G, order, { dnfOf, watched, duel: race && race.duel,
      points: table,
      fastestLap: !sprint && G.seasonMode && season ? season.lastFl : null });
    if (story) els.resultsTable.appendChild(story);
  }
  if (!watched && !G.practice && order.length && typeof ShareCardChips !== "undefined" && ShareCardChips.available()) {
    // Plain data built now, not at tap: a chip closure over `order` (the cars) and G.track kept the
    // finished race's built track reachable after the next circuit was built (race-cycle-memory.spec.js).
    const raceCard = ShareCardData.fromRace(order, { dnfOf, points: table,
      title: sprint ? "SPRINT RESULT" : G.seasonMode ? "ROUND " + season.round + " RESULT" : "RACE RESULT",
      trackId: track.def.id, trackName: track.def.name, color: (c) => seatColor(G, c),
      fastestLap: !sprint && G.seasonMode && season ? season.lastFl : null });
    ShareCardChips.append(els.resultsTable, "res-race-card", () => raceCard, "race-" + raceCard.trackId);
  }
  const playerPlace = order.findIndex((c) => c.isPlayer);
  if (playerPlace >= 0 && !watched) {
    const self = order[playerPlace], verdict = sourceOf(self), elapsed = correctedFinish(verdict);
    const card = document.createElement("div"); card.className = "res-personal";
    const heading = document.createElement("strong"); heading.textContent = tr("results.yourRace", null, "YOUR RACE") + " · " + (dnfOf(self) ? outLabel(dnfOf(self)) : self.classified === false ? "NC" : "P" + (playerPlace + 1));
    const detail = document.createElement("span");
    // The card the player reads without scrolling to their row: where they
    // started (gridPos, game.js's grid build) and the places gained, their best
    // lap (★ when it is the race's fastest, the badge rule's field above) and
    // the penalty time the classification carried.
    const parts = [self.name];
    if (elapsed != null) parts.push(raceClock(G, elapsed));
    const classified = !dnfOf(self) && self.classified !== false;
    if (self.gridPos > 0) {
      const gained = classified ? self.gridPos - (playerPlace + 1) : 0;
      parts.push(tr("results.fromGrid", { pos: trN(self.gridPos) }, "FROM P{pos}") + (gained ? " (" + (gained > 0 ? "▲" : "▼") + Math.abs(gained) + ")" : ""));
    }
    if (isFinite(self.best) && self.best > 0) {
      let fl = Infinity;
      for (const c of order) if (!c.retired && !c.dsq && c.best < fl) fl = c.best;
      parts.push(tr("results.best", null, "BEST") + " " + lapClock(G, self.best) + (self.best === fl ? " ★" : ""));
    }
    const pen = verdict && verdict.penalty;
    const penWhy = verdict && verdict.penaltyWhy;
    if (pen > 0) parts.push("PEN +" + pen + "s" + (penWhy ? " (" + penWhy + ")" : ""));
    detail.textContent = parts.join(" · ");
    card.append(heading, detail); els.resultsTable.appendChild(card);
  }
  if (badges && badges.length) els.resultsTable.appendChild(badgeCard(badges));
  const incidents = G.coach && G.coach.insights && !watched ? G.coach.insights.settle() : [];
  if (incidents.length) {
    const card = document.createElement("div"); card.className = "res-personal"; card.id = "res-incidents";
    const heading = document.createElement("strong"); heading.textContent = tr("results.incidents", null, "INCIDENTS & PENALTIES");
    const detail = document.createElement("span");
    detail.textContent = incidents.slice(-8).map((e) => tr("results.lapN", { lap: trN(e.lap) }, "LAP {lap}") + " · " + e.text).join("  ·  ");
    card.append(heading, detail); els.resultsTable.appendChild(card);
  }
  const coaching = G.coach && G.coach.feedback && G.coach.feedback();
  if (coaching && coaching.enabled && coaching.latest) {
    const card = document.createElement("div"); card.className = "res-personal";
    const heading = document.createElement("strong"); heading.textContent = tr("results.coach", null, "COACH INSIGHT");
    const detail = document.createElement("span");
    detail.textContent = (coaching.latest.turn ? tr("results.turnN", { turn: trN(coaching.latest.turn) }, "Turn {turn}") + " · " : "") + coaching.latest.detail;
    const more = document.createElement("button"); more.type = "button";
    more.textContent = tr("results.viewCoach", null, "VIEW IN DRIVING SETTINGS");
    more.onclick = () => { if (G.openCoachDetails) G.openCoachDetails(); };
    card.append(heading, detail, more); els.resultsTable.appendChild(card);
  }
  const classification = rankingList(els.resultsTable, tr("results.raceClassification", null, "Race classification"));
  order.forEach((c, i) => {
    const dnf = dnfOf(c);
    const nc = c.classified === false && !dnf && !hostRow.has(c.driverId);   // a guest reads the host verdict
    const row = document.createElement("div");
    const podium = nc ? "" : PODIUM[i] || "";
    const other = c.human && !c.local ? " q-real" : "";
    row.className = `res-row${podium}${c.isPlayer ? " you" : ""}${other}`;
    row.setAttribute("role", "listitem");
    row.style.setProperty("--i", i);   // settle stagger, css/components.css
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = nc ? "NC" : i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch"; sw.setAttribute("aria-hidden", "true");
    sw.style.background = G.cssCol(c.team.color);
    const nm = document.createElement("div"); nm.className = "res-name";
    // A retirement says WHY in the place a penalty would say how much: the two
    // never co-occur (a car that stopped was not given time back).
    // Set textContent FIRST — it replaces ALL children, so the PLAYER tag must
    // append after it (appending first silently destroyed the tag every race).
    // A lapped finisher is flagged at its next crossing (RaceControl.flagOut),
    // so its lap count is what separates it from the winner — say so.
    const winnerData = order[0] ? sourceOf(order[0]) : null;
    const carData = sourceOf(c) || {};
    // Both sides take the same running discount (a car still running is flagged
    // at its NEXT crossing), as RaceControl.classify's lapsAt does — applied to
    // the car alone, a winner who never took the flag undercounted by one.
    const lapsAt = (d) => (d.lap | 0) + (d.finished ? 0 : 1);
    const down = !dnf && winnerData && typeof winnerData.lap === "number" &&
      isFinite(winnerData.lap) && typeof carData.lap === "number" && isFinite(carData.lap)
      ? Math.max(0, lapsAt(winnerData) - lapsAt(carData)) : 0;
    const suffix = dnf ? `  (${dnf})` : carData.penalty ? `  (+${carData.penalty}s${carData.penaltyWhy ? " " + carData.penaltyWhy : ""})` : "";
    const downSuffix = down ? "  (" + (down > 1 ? tr("results.lapsDown", { laps: trN(down) }, "+{laps} LAPS") : tr("results.lapDown", { laps: trN(down) }, "+{laps} LAP")) + ")" : "";
    nm.textContent = `${c.code}  ${c.name}${suffix}${downSuffix}`;
    if (other) {
      // Text as well as colour, for the same reason the quali sheet does it.
      const tag = document.createElement("span");
      tag.className = "q-real-tag"; tag.textContent = " " + tr("results.player", null, "PLAYER");
      nm.appendChild(tag);
    }
    const pt = document.createElement("span"); pt.className = "res-pts";
    // "+FL": this round's fastest-lap point (SeasonCal.award sets lastFl only
    // when the format pays it, and only to a top-ten finisher).
    const fl = !sprint && G.seasonMode && season && season.lastFl === c.driverId && !dnf ? 1 : 0;
    // A CLASSIFIED retirement (past 90 % of the winner's laps, endRace sets
    // c.classified) is paid by SeasonCal.award / Career.settleRound: the row
    // shows those points, and its reason stays in the name suffix above.
    // NOT CLASSIFIED: still running below 90 % of the winner's laps (RaceControl.classify).
    const paid = c.classified !== false && ((!dnf && !nc) || (c.classified && !c.dsq));
    pt.textContent = G.practice && !watched ? tr("results.unscored", null, "Unscored")
      : paid ? tr("results.points", { points: trN((table[i] || 0) + fl) }, "{points} pts") + (fl ? " +FL" : "") : nc ? tr("results.points", { points: trN(0) }, "{points} pts") : outLabel(dnf);
    row.append(pos, sw, nm);
    if (timing && !dnf && c !== timing.winner && typeof carData.lap === "number" &&
        isFinite(carData.lap) && carData.lap === timing.winnerLap) {
      const official = correctedFinish(carData);
      const gap = official == null ? null : official - timing.winnerTime;
      if (gap != null && isFinite(gap) && gap >= 0) {
        const gapText = "+" + gap.toFixed(3) + "s";
        const gapEl = document.createElement("span");
        gapEl.className = "q-time"; gapEl.textContent = gapText;
        gapEl.setAttribute("aria-label", tr("results.gapBehind", { gap: gapText }, "{gap} behind winner"));
        nm.appendChild(gapEl);
      }
    }
    const strip = stintStrip(c);
    if (strip) { row.appendChild(strip.strip); nm.appendChild(strip.details); }
    row.appendChild(pt);
    classification.appendChild(row);
  });
  // THE ROUND'S EARNINGS. Career only, and only for a round that just settled.
  // Every figure here comes straight off Career.settleRound()'s return, so the
  // player is told by how much the balance moved and for what.
  const st = G.careerSettlement;
  if (st) {
    const box = document.createElement("div");
    box.className = "res-settle";
    box.setAttribute("data-say", "");
    const h = document.createElement("div");
    h.className = "res-settle-head";
    h.textContent = st.dnf ? tr("results.roundSettledDNF", { reason: st.dnf }, "ROUND SETTLED — DNF ({reason})") : tr("results.roundSettled", null, "ROUND SETTLED");
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
      addRow(`res-settle-row${cls ? ` ${cls}` : ""}`, (typeof k === "function" ? k() : k), `${v > 0 ? "+" : "\u2212"}${trN(Math.abs(v))} cr`);
    };
    line(() => tr("results.prizeMoney", { position: trN(st.pos) }, "Prize money — P{position}"), st.prize);
    line(() => tr("results.matePrizeMoney", { position: trN(st.matePos) }, "Prize money — team-mate P{position}"), st.matePrize);   // MY TEAM owns both cars
    line(tr("results.salary", null, "Salary"), st.salary);
    line(() => tr("results.pointsBonus", { points: trN(st.pts) }, "Points bonus — {points} pts"), st.bonus);
    if (st.obj) {
      line(Career.objectiveLabel(st.obj), st.obj.done ? Career.OBJ_BONUS : 0);
      if (!st.obj.done) addRow("res-settle-row missed", Career.objectiveLabel(st.obj), tr("results.missed", null, "MISSED"));
    }
    line(tr("results.sponsorBonus", null, "Sponsor bonus"), st.sponsorPay);
    if (st.sponsorVerdict) {
      const v = st.sponsorVerdict;
      addRow("res-settle-row" + (v.met ? "" : " missed"), tr("results.sponsorTarget", { target: v.label }, "Sponsor target — {target}"),
        (v.met ? tr("results.met", null, "MET") : tr("results.missed", null, "MISSED")) + (v.reason ? " · " + v.reason : ""));
    }
    line(tr("results.driverWages", null, "Driver wages"), -st.wages);
    addRow("res-settle-row total", tr("results.balance", null, "BALANCE"), `${trN(st.money)} cr`);
    addRow("res-settle-row rep", tr("results.reputation", null, "Reputation"), `${trN(Math.round(st.rep))} / ${trN(100)}`);
    // Craft pays reputation, never money, so it sits BELOW the balance line and
    // outside the credit column — a percentage there would read as an unpaid fee.
    // A bare percentage is a score with no explanation, which is the thing this
    // sheet already got wrong once, so the round debrief follows it: the same
    // events RaceInsights logged all race, condensed to the ones that cost craft,
    // with the laps to go and look at. Nothing when the race was faultless.
    if (typeof st.craft === "number") {
      addRow("res-settle-row rep", tr("results.raceCraft", null, "Race craft"), `${trN(Math.round(st.craft * 100))}%`);
      const debrief = G.coach && G.coach.insights ? G.coach.insights.debrief() : [];
      for (const d of debrief) {
        addRow("res-settle-row craft", tr("results.craftCount", { label: d.label, count: trN(d.count) }, "{label} × {count}"),
          tr("results.craftLaps", { laps: d.laps.slice(0, 4).map(trN).join(", ") + (d.laps.length > 4 ? "…" : "") }, "lap {laps}"));
      }
    }
    if (st.unsaved) {
      const unsaved = document.createElement("div");
      unsaved.id = "res-settle-unsaved";
      unsaved.textContent = tr("results.sessionOnly", null, "SESSION ONLY — this result has not been saved to this device.");
      box.appendChild(unsaved);
    }
    els.resultsTable.appendChild(box);
  }

  if (G.seasonMode) {
    // Driver championship (top 10)
    const head = document.createElement("div");
    head.className = "sel-label";
    head.textContent = sprint ? tr("results.driversAfterSprint", null, "DRIVERS — AFTER THE SPRINT") : tr("results.driversAfterRound", { round: trN(season.round) }, "DRIVERS — AFTER ROUND {round}");
    els.resultsTable.appendChild(head);
    // SeasonCal.rank, not a bare points sort: equal points fall to countback
    // there and the STANDINGS sheet already used it — this list put whoever
    // was earlier in the field order first and the two screens disagreed.
    const driverRanking = rankingList(els.resultsTable, tr("results.driverStandings", null, "Driver standings"));
    const all = seasonTable(cars, season).slice(0, 10);
    all.forEach((c, i) => {
      rankRow(driverRanking, i, seatColor(G, c), c.name ? `${c.code}  ${c.name}` : c.code,
        ptsLabel(season, c.driverId), c.isPlayer ? " you" : "");
    });
    // Team championship (top 5)
    const tmHead = document.createElement("div");
    tmHead.className = "sel-label";
    tmHead.textContent = tr("results.constructors", null, "CONSTRUCTORS");
    els.resultsTable.appendChild(tmHead);
    const constructorRanking = rankingList(els.resultsTable, tr("results.constructorStandings", null, "Constructor standings"));
    const tmList = teamOrder(season).slice(0, 5);
    tmList.forEach(([teamId, pts], i) => {
      const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
      rankRow(constructorRanking, i, G.cssCol(team.color), team.name || teamId, tr("results.points", { points: trN(pts) }, "{points} pts"));
    });
    // The view marker distinguishes a race result from the champion panel;
    // navigation never depends on this translated action label.
    els.resNext.textContent = sprint ? tr("results.toGrandPrix", null, "TO THE GRAND PRIX")
      : season.round >= SeasonCal.rounds() ? tr("results.viewChampion", null, "VIEW CHAMPION") : tr("results.nextRound", null, "NEXT ROUND");
  } else {
    els.resNext.textContent = watched ? tr("results.watchAgain", null, "WATCH AGAIN") : friend ? tr("results.raceAgainSolo", null, "RACE AGAIN (SOLO)") : tr("results.raceAgain", null, "RACE AGAIN");   // a watched real race re-runs the replay, it is not a new race
    if (friend) {
      const hint = document.createElement("div");
      hint.className = "res-personal";
      hint.setAttribute("data-results-part", "room");
      const note = document.createElement("span");
      note.textContent = tr("results.friendRoomClosed", null, "The friend room closes when you leave. NEW FRIEND ROOM, or VS FRIEND on the title screen, starts another.");
      hint.appendChild(note);
      els.resultsTable.appendChild(hint);
    }
  }
  winnerChip(els, order.length && !dnfOf(order[0]) ? order[0].code || "" : "");
  resultsAtTop(els.resultsTable);
  sayCards(els.results, els.resultsTable, order);
}

function buildTTResults() {
  noteLastSession("tt");
  const els = G.els;
  if (els.results) els.results.dataset.resultsView = "tt";
  const track = G.track;
  els.resultsTable.textContent = "";
  els.resultsTitle.style.color = "";
  if (els.resMenu) els.resMenu.textContent = tr("results.menu", null, "MENU");   // a friend race's NEW FRIEND ROOM label must not outlive it
  els.resultsTitle.textContent = tr("results.ttTitle", { track: track.def.name }, "{track} — TIME TRIAL");
  winnerChip(els, "");
  const best = G.player.best;

  // headline: your best lap this session (green if it set a new track record)
  const head = document.createElement("div");
  head.className = "res-row you";
  head.style.fontSize = "18px";
  const hl = document.createElement("span"); hl.className = "res-name";
  hl.textContent = G.ttNewRecord ? tr("results.newRecord", null, "★ NEW RECORD") : tr("results.yourBest", null, "YOUR BEST");
  const hv = document.createElement("span"); hv.className = "res-pts"; hv.style.width = "auto";
  hv.textContent = isFinite(best) ? lapClock(G, best) : "-";
  head.append(hl, hv);
  els.resultsTable.appendChild(head);

  // A shared guest is the active rival on its circuit; otherwise keep the
  // personal-best path exactly as before.
  const guestGhost = GhostShare.hasGuest();
  const replayGhost = guestGhost ? GhostShare : Ghost;
  if (guestGhost) {
    const note = document.createElement("p");
    note.className = "res-row";
    note.textContent = GhostShare.contextNotice(GhostShare.guest().context, G.records.key());
    els.resultsTable.appendChild(note);
  }
  if ((guestGhost || Ghost.hasGhost()) && isFinite(best)) {
    const ghostBest = replayGhost.bestTime();
    if (isFinite(ghostBest)) {
      const delta = best - ghostBest;
      const gr = document.createElement("div");
      gr.className = "res-row";
      const gl = document.createElement("span"); gl.className = "res-name";
      gl.textContent = guestGhost ? tr("results.rivalGhost", null, "RIVAL GHOST") : tr("results.yourPB", null, "YOUR PB");
      const gv = document.createElement("span"); gv.className = "res-pts"; gv.style.width = "auto";
      gv.style.color = delta <= 0 ? "var(--faster)" : "var(--slower)";
      const shown = +delta.toFixed(3);   // sign from the rounded value: -0.0003 reads +0.000, not -0.000
      gv.textContent = `${shown >= 0 ? "+" : ""}${shown.toFixed(3)}s`;
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
    ml.textContent = tr("results.medal", { medal: held ? medalName(held) : tr("results.noMedal", null, "NONE YET") }, "MEDAL — {medal}");
    if (held) ml.style.color = `var(--${held})`;
    const mv = document.createElement("span"); mv.className = "res-pts"; mv.style.width = "auto";
    const next = Quali.MEDALS.slice().reverse().find(([m]) => !held || Quali.MEDAL_RANK[m] > Quali.MEDAL_RANK[held]);
    mv.textContent = next ? tr("results.nextMedal", { medal: medalName(next[0]), time: lapClock(G, pole * next[1]) }, "NEXT {medal} ≤ {time}") : tr("results.poleTime", { time: lapClock(G, pole) }, "POLE {time}");
    mr.append(ml, mv);
    els.resultsTable.appendChild(mr);
  }

  // leaderboard header
  const lbHead = document.createElement("div");
  lbHead.className = "sel-label";
  lbHead.id = "res-tt-board";
  lbHead.textContent = tr("results.matchingSetup", { track: track.def.name }, "MATCHING SETUP & CONDITIONS — {track}");
  els.resultsTable.appendChild(lbHead);

  const leaderboard = rankingList(els.resultsTable, tr("results.ttLeaderboard", null, "Time trial leaderboard"));
  const board = G.records.board(track.def.id);
  board.forEach((e, i) => {
    const team = G.teamById(e.teamId);
    const name = `${e.code}  ${e.name}${team ? `  · ${team.short}` : ""}`;
    const row = rankRow(leaderboard, i, G.cssCol(team ? team.color : [0.5, 0.5, 0.5]), name,
      lapClock(G, e.t), e.ts >= G.ttSessionTs ? " you" : "");
    row.querySelector(".res-pts").style.width = "auto";
  });

  // DAILY: the shareable line, copied on tap (clipboard needs a secure
  // context; the fallback shows the text where the button was).
  if (G.daily && G.daily.isActive()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sel-chip";
    btn.id = "res-daily-share";
    btn.textContent = tr("results.copyDailyResult", null, "COPY DAILY RESULT");
    btn.onclick = () => {
      const text = G.daily.shareText();   // today's medal, from today's best (daily-challenge.js)
      ApexClipboard.write(text).then((ok) => {
        btn.textContent = ok ? tr("results.copied", null, "COPIED") : text;
      }, () => { btn.textContent = text; });
    };
    els.resultsTable.appendChild(btn);
    if (typeof G.daily.card === "function" && typeof ShareCardChips !== "undefined") {
      let daily = null;   // one card() per tap: the builder and the share text read the same result
      ShareCardChips.append(els.resultsTable, "res-card-share", () => (daily = G.daily.card()).model,
        () => daily ? daily.name : "daily", () => daily ? daily.text : "");
    }
    if (typeof ShareCode !== "undefined" && ShareCode.encode) {
      const codeBtn = document.createElement("button");
      codeBtn.type = "button";
      codeBtn.className = "sel-chip";
      codeBtn.id = "res-daily-share-code";
      codeBtn.textContent = tr("results.copyDailyCode", null, "COPY DAILY CODE");
      codeBtn.onclick = () => {
        const encoded = ShareCode.encode("daily", G.daily.shareResult());
        if (!encoded.ok) { codeBtn.textContent = tr("results.unavailable", null, "UNAVAILABLE"); return; }
        ApexClipboard.write(encoded.code).then((ok) => {
          codeBtn.textContent = ok ? tr("results.copied", null, "COPIED") : encoded.code;
        }, () => { codeBtn.textContent = encoded.code; });
      };
      els.resultsTable.appendChild(codeBtn);
    }
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
    const trackId = track.def.id, trackName = track.def.name;   // strings: the chip must not hold G.track
    if (typeof ShareCardChips !== "undefined") ShareCardChips.append(els.resultsTable, "res-ghost-card", () => {
      const lap = typeof ShareCode !== "undefined" ? ShareCode.encode("lap", { track: trackId, day: shareOpts.day, time: shareGhost.time }) : {};
      return ShareCardData.fromGhost(shareGhost, guestGhost ? GhostShare.guest().ghost : null, { trackId,
        trackName, day: shareOpts.day, link: lap.ok ? lap.url : null, rivalName: guestGhost ? tr("results.rival", null, "RIVAL") : "" });
    }, "lap-" + trackId);
    const encoded = GhostShare.encode(shareGhost, shareOpts);
    let fallbackBox = null;   // ONE box per sheet: each refused tap reuses it (it stacked a duplicate id)
    const fallback = (btn, value, label) => {
      const box = fallbackBox || (fallbackBox = document.createElement("textarea"));
      box.id = "res-ghost-copy-fallback";
      box.className = "sel-chip";
      box.readOnly = true;
      box.value = value;
      box.setAttribute("aria-label", tr("results.selectCopyLabel", { label }, "{label} — select and copy"));
      btn.insertAdjacentElement ? btn.insertAdjacentElement("afterend", box) : els.resultsTable.appendChild(box);
      if (box.focus) box.focus();
      if (box.select) box.select();
      ApexClipboard.copySelection();
      btn.textContent = tr("results.selectCopy", null, "SELECT & COPY");
    };
    const copy = async (btn, field, label) => {
      const shared = await encoded;
      if (!shared.ok) {
        btn.textContent = shared.reason === "too-large" ? tr("results.tooLargeDownload", null, "TOO LARGE — DOWNLOAD") : tr("results.unavailable", null, "UNAVAILABLE");
        return;
      }
      const value = shared[field];
      const ok = await ApexClipboard.write(value);
      if (ok) btn.textContent = tr("results.copied", null, "COPIED");
      else fallback(btn, value, label);
    };
    const action = (id, text) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "sel-chip"; btn.id = id; btn.textContent = text;
      els.resultsTable.appendChild(btn);
      return btn;
    };
    const link = action("res-ghost-copy-link", tr("results.copyLink", null, "COPY LINK"));
    link.onclick = () => copy(link, "url", tr("results.ghostLink", null, "Ghost link"));
    const code = action("res-ghost-copy-code", tr("results.copyCode", null, "COPY CODE"));
    code.onclick = () => copy(code, "code", tr("results.ghostCode", null, "Ghost code"));
    const download = action("res-ghost-download", tr("results.download", null, "DOWNLOAD"));
    download.onclick = async () => {
      if (download.disabled) return;
      const file = GhostShare.fileExport(shareGhost, shareOpts);
      if (!file.ok) { download.textContent = tr("results.unavailable", null, "UNAVAILABLE"); return; }
      download.disabled = true;
      download.textContent = tr("results.saving", null, "SAVING…");
      try {
        const blob = new Blob([file.text], { type: "application/json" });
        if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) {
          await NativeDownload.saveBlob(blob, file.name);
        } else {
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href; a.download = file.name; a.hidden = true;
          document.body.appendChild(a); a.click(); a.remove();
          // 10 s, the house idiom — see js/ui/settings-export.js. A 0 ms revoke can
          // kill the object URL before the browser has finished reading it.
          setTimeout(() => URL.revokeObjectURL(href), 10000);
        }
        download.textContent = tr("results.downloaded", null, "DOWNLOADED");
      } catch (e) {
        download.textContent = typeof NativeDownload !== "undefined" && NativeDownload.isCancelled(e) ? tr("results.cancelled", null, "CANCELLED") : tr("results.downloadFailed", null, "DOWNLOAD FAILED");
      } finally { download.disabled = false; }
    };
  }

  // Ghost clear link
  if (guestGhost || Ghost.hasGhost()) {
    const clrBtn = document.createElement("button");
    clrBtn.type = "button";
    clrBtn.className = "sel-chip";
    clrBtn.id = "res-ghost-clear";
    clrBtn.textContent = guestGhost ? tr("results.clearRivalGhost", null, "✕ CLEAR RIVAL GHOST") : tr("results.clearGhost", null, "✕ CLEAR GHOST");
    clrBtn.onclick = () => {
      if (guestGhost) GhostShare.clearGuest();
      else Ghost.clear(track.def.id);
      const remaining = G.records.board(track.def.id);
      G.ttRecord = remaining.length ? remaining[0].t : Infinity;
      // The rebuild destroys this button: keep focus on its slot (js/ui/modal.js).
      if (typeof TopModal !== "undefined" && TopModal.keepFocus) TopModal.keepFocus(els.results, buildTTResults);
      else buildTTResults();
    };
    els.resultsTable.appendChild(clrBtn);
  }

  els.resNext.textContent = tr("results.tryAgain", null, "TRY AGAIN");
}

function buildStandings() {
  const season = G.season;
  const cars = G.cars;
  const body = G.$("standings-body");
  body.textContent = "";
  // A ONE-OFF RACE HAS NO CHAMPIONSHIP. The pause menu still offers STANDINGS,
  // and an empty body (a title, a CLOSE button, nothing between) reads as a
  // broken screen rather than as "there is nothing to stand on". `.dh-empty` is the house empty state (css/data.css)
  // so this costs no new class.
  if (!season) {
    const note = document.createElement("div");
    note.className = "dh-empty";
    note.textContent = tr("results.noChampionship", null, "No championship is running — standings appear in a Season or a Career.");
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
    ? tr("results.finalChampionship", null, "FINAL CHAMPIONSHIP")
    : midWeekend ? tr("results.championshipSprint", { round: trN(round + 1), rounds: trN(rounds) }, "CHAMPIONSHIP — AFTER THE SPRINT, ROUND {round} / {rounds}")
    : tr("results.championshipRound", { round: trN(round), rounds: trN(rounds) }, "CHAMPIONSHIP — AFTER ROUND {round} / {rounds}");

  // Driver standings — all cars sorted by pts
  const drHead = document.createElement("div");
  drHead.className = "sel-label";
  drHead.textContent = tr("results.drivers", null, "DRIVERS");
  body.appendChild(drHead);

  const driverRanking = rankingList(body, tr("results.driverStandings", null, "Driver standings"));
  const drList = Object.entries(season.pts)
    .sort((a, b) => SeasonCal.rank(season, a[0], b[0]));   // points, then countback
  const cardRows = [];
  drList.forEach(([driverId, pts], i) => {
    const c = cars.find((x) => x.driverId === driverId);
    const code = c ? c.code : ((season.driverCodes && season.driverCodes[driverId]) || driverId);
    const color = c ? G.cssCol(c.team.color) : "#555";
    cardRows.push({ code, name: c ? c.name : "", teamColor: color, value: ptsLabel(season, driverId), you: !!(c && c.isPlayer) });
    rankRow(driverRanking, i, color, `${code}${c ? `  ${c.name}` : ""}`,
      ptsLabel(season, driverId), c && c.isPlayer ? " you" : "");
  });
  if (typeof ShareCardChips !== "undefined") ShareCardChips.append(body, "standings-card",
    () => ShareCardData.fromSeason(cardRows, { round, rounds }), "standings-round-" + round);

  // Team standings
  const tmHead = document.createElement("div");
  tmHead.className = "sel-label";
  tmHead.textContent = tr("results.constructors", null, "CONSTRUCTORS");
  body.appendChild(tmHead);

  const constructorRanking = rankingList(body, tr("results.constructorStandings", null, "Constructor standings"));
  const tmList = teamOrder(season);
  tmList.forEach(([teamId, pts], i) => {
    const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
    rankRow(constructorRanking, i, G.cssCol(team.color), team.name || teamId, tr("results.points", { points: trN(pts) }, "{points} pts"));
  });

  // Next round info
  if (round < rounds) {
    const nextTrack = SeasonCal.track(round);
    const info = document.createElement("div");
    info.style.cssText = "margin-top:12px;font-size:12px;color:#9a9aa5;text-align:center";
    // From the pause menu this round is the one being driven, not the next.
    const live = G.state === "race" || G.state === "count";
    const lead = live ? tr("results.roundInProgress", { round: trN(round + 1) }, "IN PROGRESS: ROUND {round}") : midWeekend ? tr("results.nextGrandPrixRound", { round: trN(round + 1) }, "NEXT: GRAND PRIX, ROUND {round}") : tr("results.nextRoundN", { round: trN(round + 1) }, "NEXT: ROUND {round}");
    info.textContent = tr("results.nextRoundDetails", { round: lead, track: nextTrack.name, grandPrix: SeasonCal.gpName ? SeasonCal.gpName(nextTrack) : nextTrack.gp }, "{round} — {track} ({grandPrix})");
    body.appendChild(info);
  }
}

function buildChampion() {
  const els = G.els;
  if (els.results) els.results.dataset.resultsView = "champion";
  const season = G.season;
  // Countback decides a tie for the title (SeasonCal.rank); a points-only sort
  // crowned whichever tied driver came first in the field order.
  const sorted = seasonTable(G.cars, season);
  const champ = sorted[0];
  const champColor = seatColor(G, champ);
  els.resultsTitle.textContent = tr("results.worldChampion", null, "WORLD CHAMPION");
  winnerChip(els, "");
  els.resultsTitle.style.color = champColor;
  els.resultsTable.textContent = "";
  const banner = document.createElement("div");
  banner.style.cssText = `text-align:center;padding:18px 0 10px;font-weight:900;font-style:italic;font-size:1.4em;color:${champColor}`;
  banner.textContent = champ.name ? `${champ.code}  ${champ.name}` : champ.code;
  const teamBanner = document.createElement("div");
  // Theme tokens, not a hard-coded #aaa: the LIGHT theme drew grey on a light sheet.
  teamBanner.style.cssText = "text-align:center;font-size:0.8em;color:var(--dim);margin-bottom:14px;letter-spacing:var(--ls-5)";
  teamBanner.textContent = String(champ.team.name || "").toUpperCase();
  els.resultsTable.append(banner, teamBanner);
  const head = document.createElement("div");
  head.className = "sel-label";
  head.textContent = tr("results.finalStandings", null, "FINAL STANDINGS");
  els.resultsTable.appendChild(head);
  const driverRanking = rankingList(els.resultsTable, tr("results.finalDriverStandings", null, "Final driver standings"));
  sorted.forEach((c, i) => {
    rankRow(driverRanking, i, seatColor(G, c), c.code, ptsLabel(season, c.driverId), c.isPlayer ? " you" : "");
  });
  if (typeof ShareCardChips !== "undefined") {
    const champRows = sorted.map((c) => ({ code: c.code, name: c.name, teamColor: seatColor(G, c),
      value: ptsLabel(season, c.driverId), you: !!c.isPlayer }));   // plain rows: the chip must not hold the cars
    const champOpts = { round: season.round, rounds: SeasonCal.rounds(), headline: tr("results.championHeadline", { code: champ.code }, "{code} IS WORLD CHAMPION") };
    ShareCardChips.append(els.resultsTable, "res-champion-card", () => ShareCardData.fromSeason(champRows, champOpts), "champion");
  }
  els.resNext.textContent = tr("results.mainMenu", null, "MAIN MENU");
  G.announce(tr("results.championAnnouncement", { code: champ.code }, "{code} IS WORLD CHAMPION!"), 4);
  // endRace already played the finish fanfare; a second finish() here stacked blips on the season finale.
}

return { buildResults, buildTTResults, buildStandings, buildChampion };
}

return { create };
})();
Object.freeze(GameResults);
