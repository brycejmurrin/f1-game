/* Measured stint/energy advice, unscored drills and ordered race explanations. */
"use strict";
const RaceInsights = (function () {
  const DRILLS = Object.freeze({ free: "Free practice", sector: "Finish this sector cleanly", corner: "Drive through the next corner",
    lap: "One full lap from the line", braking: "Brake to a controlled stop", trail: "Release the brake into a turn",
    slalom: "Six clean direction changes", launch: "Standing start to racing speed",
    start: "Gain a place off the line",
    // THE RIVAL DRILLS. Every drill above judges the car against the road; these
    // three judge it against another car, which is a different and harder thing
    // to measure honestly — see PARITY and the notes on each branch below.
    slipstream: "Close on the car ahead in its wake", overtake: "Pass the car ahead",
    defend: "Hold your place under attack",
    // BACKMARKERS IS NOT AN OVERTAKING DRILL, and the goal text says so. A car
    // you are 6% quicker than is BY DEFINITION inside letPassCase's margin, so
    // it will concede on its own timer — which is a read of its awareness
    // rating, not of your racecraft. Scoring "did you out-drive him" would
    // therefore score the AI's stat sheet. What it scores instead is the thing
    // lapping traffic actually costs you in a race: TIME, with any contact
    // failing the attempt. That needs no per-pair identity (the engine has
    // none — c.contactT is a 0.22 s scalar with no idea whose fault it was),
    // because "I touched somebody while threading traffic" is the failure
    // whoever it was.
    backmarkers: "Clear three slower cars without contact" });
  // A drill judges what the CAR did, never the stick. Lateral acceleration says
  // the car changed direction: a pad deflection of 0.35 reads 0.11 after the
  // steer expo, so the old stick thresholds silently failed every analog driver
  // (measured on monza: 7.2 m/s² of lateral accel at 0.11 of command). A stop
  // counts only when the brake did the slowing: a tap followed by a 10 s coast
  // used to pass as a controlled stop and bank mastery.
  const TURN_ACCEL = 3;        // m/s² (~0.3 g): the car is cornering, not twitching
  const FIRM_BRAKE = 0.5;      // pedal travel that counts as firm braking
  const HELD_FRACTION = 0.8;   // share of the slowing samples that must carry a firm brake
  // A corner opens after 0.3 s of sustained cornering and closes after 0.5 s
  // without it, so the brief unload through a chicane's flip stays one corner.
  const CORNER_IN = 3, CORNER_OUT = 5;
  // ── the rival drills' constants ────────────────────────────────────────────
  // Metres, all of them. The PACE rule governs SPEEDS — a metre is a metre at
  // every PACE — and these match the numbers the engine already races by:
  // TOW_RANGE 34 is where the wake starts (js/physics/consts.js), 12 is the
  // window an AI defends in and 9 the one it concedes in (js/game.js
  // letPassCase), 2.4 is AiDrive.sideLevel(), and 8 is inside the 6 m where the
  // wake saturates, so "you have the whole tow" is true rather than nearly true.
  const TOW_RANGE = 34, ATTACK_M = 12, SIDE_M = 2.4, WAKE_DONE_M = 8, LANE_M = 4;
  // PARITY IS NOT A FAIRNESS GESTURE — it is what makes the overtake real. An AI
  // concedes (js/game.js letPassCase) once a chaser holds +2.5·PACE m/s inside
  // 9 m for letPassDelay = lerp(4.2, 1.8, awareness) — 2.4 s at the default.
  // Against a rival within 4% of your own _vmaxNow you cannot hold that margin
  // for 2.4 continuous seconds, so the concession never fires and the drill
  // measures your move instead of the rival's awareness RATING. Delete this and
  // OVERTAKE quietly becomes a readout of an AI stat. Dimensionless: it is a
  // ratio of two _vmaxNow values, so PACE cancels top and bottom.
  const PARITY = 0.04, PARITY_MIN = 10;
  // DEFEND arms only against a car that could actually pass: a fraction of
  // vTop(), the same shape AiDrive.otWant uses for its own margin.
  const THREAT = 0.02;
  const HOLD_CAP = 30;         // seconds of pressure that count as a full defence
  const SLOW = 0.06, TRAFFIC_N = 3;   // a "backmarker" is 6% down on your own _vmaxNow; three of them is a stint through traffic
  const CLEAR_S = 1.5;         // held clear before a pass is a pass
  const kmh = v => Math.round(Math.abs(v) * 3.6);
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const boundedPush = (a, v, n) => { a.push(v); if (a.length > n) a.shift(); };
  function create(G) {
    let previous = null, events = [], sequence = 0, laps = [], sector = null, energy = [[], [], []];
    let tyreStart = null, drill = null, lastDrill = null, distance = 0, lapClean = false, weather = null, attempts = {};
    let paceRef = null, paceWin = [];   // the car ahead, and the rolling pace read on it (samplePace)
    function event(kind, text) {
      boundedPush(events, { seq: ++sequence, time: G.raceT || 0, lap: G.player ? G.player.lap : 0, kind, text }, 128);
    }
    function reset() { previous = sector = tyreStart = drill = lastDrill = null; events = []; sequence = distance = 0; lapClean = false; weather = null; laps = []; energy = [[], [], []]; attempts = {}; }
    function startDrill(mode) {
      if (!Object.hasOwn(DRILLS, mode)) mode = "free";
      const c = G.player;
      if (!c) return false;
      if (["braking", "trail"].includes(mode) && Math.abs(c.speed) < G.vTop() * .3) {
        G.announce("BUILD SPEED BEFORE SETTING THIS DRILL", 2, "practice"); return false;
      }
      // ONE stopped-car test for both standing-start goals, so the absolute
      // speed literal is written once and carries one approval in
      // tests/unit/vstd-invariant.test.mjs rather than one per drill.
      if (["launch", "start"].includes(mode) && Math.abs(c.speed) > 1) { G.announce(mode === "start" ? "SET THIS ON THE GRID, BEFORE THE LIGHTS" : "STOP THE CAR BEFORE SETTING THIS DRILL", 2, "practice"); return false; }
      // …and a start drill also needs somebody to gain a place on.
      if (mode === "start" && placeOf(c) === 0) { G.announce("A START DRILL NEEDS OTHER CARS ON THE GRID", 2, "practice"); return false; }
      // ── the rival drills refuse loudly, because every refusal names the thing
      // the driver has to go and do before the drill means anything ───────────
      let rival = null;
      if (["slipstream", "overtake", "defend", "backmarkers"].includes(mode)) {
        if (placeOf(c) === 0) { G.announce("THIS DRILL NEEDS OTHER CARS ON TRACK", 2, "practice"); return false; }
        // A caution neutralises the whole field to a delta pace, so nothing
        // rival-relative measured under one means anything.
        if (G.cautionInfo && G.cautionInfo().level > 0) { G.announce("NO RACING UNDER A CAUTION", 2, "practice"); return false; }
        if (mode === "backmarkers") {
          // Any slower car up the road, not just the one in our lane — traffic
          // is traffic wherever it sits.
          const slower = (G.cars || []).filter(o => o !== c && !o.retired && !o.finished
            && (gapTo(o, c) || 0) > 0 && (o._vmaxNow || 0) > 0 && (c._vmaxNow || 0) > 0
            && (o._vmaxNow / c._vmaxNow) < 1 - SLOW);
          if (!slower.length) { G.announce("NO SLOWER TRAFFIC AHEAD TO PASS", 2, "practice"); return false; }
          rival = slower[0];
        } else rival = mode === "defend" ? nearestBehind(c) : nearestAhead(c);
        const gap = rival ? Math.abs(gapTo(rival, c)) : Infinity;
        if (mode === "backmarkers") { /* the target list is the precondition; no gap test */ }
        else if (mode === "defend") {
          if (!rival || gap > ATTACK_M) { G.announce("NOBODY IS ATTACKING YOU YET", 2, "practice"); return false; }
          // "Could actually pass" as a fraction of top speed — the AiDrive.otWant
          // shape. NOT a c.speed-against-a-literal compare, which would be a
          // PACE-rule violation (tests/unit/vstd-invariant.test.mjs) and wrong.
          if (!((rival._vmaxNow || 0) >= (c._vmaxNow || 0) + THREAT * G.vTop())) {
            G.announce("HE IS NOT QUICK ENOUGH TO DEFEND FROM", 2, "practice"); return false;
          }
        } else {
          if (placeOf(c) === 1) { G.announce("YOU ARE LEADING — THERE IS NOBODY TO PASS", 2, "practice"); return false; }
          if (!rival || gap > TOW_RANGE) { G.announce(mode === "overtake" ? "CLOSE ON THE CAR AHEAD FIRST" : "GET INTO THE WAKE OF THE CAR AHEAD", 2, "practice"); return false; }
        }
        if (mode === "slipstream" && gap < WAKE_DONE_M) { G.announce("ALREADY THERE — DROP BACK FIRST", 2, "practice"); return false; }
        if (mode === "overtake") {
          const par = paceParity();
          if (par == null) { G.announce("HOLD THIS GAP A MOMENT LONGER", 2, "practice"); return false; }
          if (Math.abs(par - 1) > PARITY) { G.announce("NOT ON YOUR PACE — NOT A FAIR FIGHT", 2, "practice"); return false; }
        }
      }
      previous = sector = tyreStart = null; laps = []; energy = [[], [], []]; lapClean = false;
      drill = { mode, time: G.raceT, sector: G.sectorIdx, startProg: c.prog, lap: c.lap,
        changes: 0, side: 0, brakeSeen: false, brakeProg: c.prog, brakeSpeed: 0, slowing: 0, held: 0, turnSeen: false,
        phase: 0, turnRun: 0, straightRun: 0, minSpeed: Infinity, exitSpeed: 0, peakDecel: 0, launchT: null, lapStart: null, lapDone: false,
        place0: placeOf(c), placeNow: placeOf(c), startProg0: c.prog,
        // THE RIVAL FIELDS. `rival` is the car OBJECT, not an index: restoreWorld
        // mutates the cars in place and G.cars order never changes, so the
        // reference survives a rewind and still points at the right car.
        rival, rivalCode: rival ? rival.code || "RIVAL" : "", rivalX0: rival ? rival.x || 0 : 0,
        gap0: rival ? Math.abs(gapTo(rival, c)) : 0, gapMin: Infinity, gapNow: 0,
        towS: 0, wakeS: 0, closed: 0, pressT: 0, escapeT: 0, clearT: 0, phase2: 0, lastT: null,
        attacked: false, conceded: false, gifted: false, gaveUp: false, cleared: 0, passing: new Set(),
        clean: true, reason: "", done: false };
      event("practice", DRILLS[mode] + " — unscored");
      return true;
    }
    // The first failure is the one the driver needs to hear; later ones follow from it.
    function failDrill(reason) { if (drill && !drill.done && drill.clean) { drill.clean = false; drill.reason = reason; } }
    // THE PLAYER'S PLACE, counted the way the classification counts it: by
    // cumulative arc, so a car a lap down is behind rather than alongside. The
    // first drill to look past G.player — every other one judges the car alone
    // against the road. Same sort js/agent/apex.js uses for its gap readouts.
    // Returns 1-based position, or 0 when there is no field to have a place in.
    function placeOf(c) {
      const cars = G.cars;
      if (!c || !Array.isArray(cars) || cars.length < 2) return 0;
      let ahead = 0;
      for (const o of cars) if (o !== c && !o.retired && (o.prog || 0) > (c.prog || 0)) ahead++;
      return ahead + 1;
    }
    const masteryKey = (mode, sectorIdx) => G.records.key() + ":" + mode + ":" + (mode === "sector" ? sectorIdx : "all");
    // METRES UP THE ROAD, signed: + is ahead of us, − is behind. placeOf() sorts
    // by CUMULATIVE arc and is right for a POSITION; it is useless for a gap,
    // because a car a lap down sorts behind while sitting on your gearbox. Same
    // wrap the AI's own traffic scan uses.
    function gapTo(o, c) {
      const L = G.track && G.track.total;
      if (!o || !c || !(L > 0)) return null;
      const d = (o.prog || 0) - (c.prog || 0);
      return ((d + L / 2) % L + L) % L - L / 2;
    }
    // Nearest car in our lane, one direction. Positions only — no curvature, no
    // racing line, nothing the arc rule forbids reaching the driver.
    function nearestIn(c, sign) {
      const cars = G.cars;
      if (!c || !Array.isArray(cars)) return null;
      let best = null, bestGap = Infinity;
      for (const o of cars) {
        if (o === c || o.retired || o.finished) continue;
        if (Math.abs((o.x || 0) - (c.x || 0)) > LANE_M) continue;
        const g = gapTo(o, c);
        if (g == null || Math.sign(g) !== sign || Math.abs(g) >= bestGap) continue;
        best = o; bestGap = Math.abs(g);
      }
      return best;
    }
    const nearestAhead = (c) => nearestIn(c, 1);
    const nearestBehind = (c) => nearestIn(c, -1);
    // The rolling pace read on whoever is in front. _vmaxNow is stashed for every
    // car after every pace multiplier (js/game.js), which is the same cross-car
    // comparison the AI itself makes. MEDIAN, not mean: one frame of tow or one
    // caution sample must not move the verdict.
    function samplePace(c) {
      const ah = nearestAhead(c);
      if (ah !== paceRef) { paceRef = ah; paceWin = []; }
      if (ah && ah._vmaxNow > 0 && c._vmaxNow > 0) boundedPush(paceWin, ah._vmaxNow / c._vmaxNow, 20);
    }
    const paceParity = () => (paceWin.length >= PARITY_MIN ? median(paceWin) : null);
    function masteryEntries() {
      const raw = G.store.get("circuitMastery", null);
      return raw && raw.version === 1 && Array.isArray(raw.entries) ? raw.entries.filter(e => e && typeof e.key === "string").slice(-63) : [];
    }
    function mastery(mode) {
      const found = masteryEntries().find(e => e.key === masteryKey(mode, G.sectorIdx));
      return found && Number.isFinite(found.best) ? { best: found.best, completed: Math.max(0, Math.floor(found.completed) || 0) } : null;
    }
    function finishDrill(current, c) {
      drill.done = true;
      const seconds = Math.max(0, G.raceT - drill.time), stop = Math.max(0, current.prog - drill.brakeProg), mode = drill.mode;
      // Each goal is scored by the number the driver can act on: braking by the
      // stopping distance from the first firm brake and launch by the time from
      // the first throttle (both repeat from a restored checkpoint, so they
      // compare); a lap by the timed lap itself (the line keeps the exact time
      // even though practice laps never enter the records); the rest by time.
      const lapTime = Number.isFinite(c._lapTimeAtLine) && c._lapTimeAtLine > 0 ? c._lapTimeAtLine : drill.lapStart == null ? seconds : G.raceT - drill.lapStart;
      // PLACES GAINED IS THE ONE SCORE WHERE MORE IS BETTER. Every other drill
      // scores a time or a distance and mastery keeps the MINIMUM, so this is
      // stored NEGATED — gaining two places scores -2, which the same Math.min
      // ranks above -1. The sign is undone once, at the display edge, so
      // nothing else in the ledger needs a per-mode "which way is better".
      const placed = (drill.place0 || 0) - (drill.placeNow || 0);
      // …and the rival drills add two more of the same shape: metres CLOSED and
      // seconds HELD are both "more is better", so both are stored negated.
      // OVERTAKE is the one that needs no sign work — it scores the time the
      // move took, and less of that is better, like every drill above.
      const score = mode === "braking" ? stop : mode === "launch" && drill.launchT != null ? G.raceT - drill.launchT
        : mode === "lap" ? lapTime : mode === "start" ? -placed
        : mode === "slipstream" ? -Math.max(0, drill.closed)
        : mode === "defend" ? -Math.min(HOLD_CAP, drill.pressT) : seconds;
      // v²/2a at the hardest deceleration the car actually produced: the distance
      // this stop WOULD have taken had the driver held that from the first brake.
      // The gap is what modulation cost, in metres, and it is the one number a
      // braking drill can give that a stopwatch cannot.
      const limit = mode === "braking" && drill.peakDecel > 1 && drill.brakeSpeed > 1
        ? (drill.brakeSpeed * drill.brakeSpeed) / (2 * drill.peakDecel) : null;
      const slack = limit == null ? null : Math.max(0, stop - limit);
      const text = mode === "braking" ? "stopped " + stop.toFixed(0) + " m after braking from " + kmh(drill.brakeSpeed) + " km/h"
          + (slack >= 1 ? " · " + slack.toFixed(0) + " m of it below your hardest braking" : "")
        : mode === "slalom" ? seconds.toFixed(1) + "s · " + drill.changes + " direction changes"
        : mode === "corner" ? seconds.toFixed(1) + "s · min " + kmh(drill.minSpeed) + " km/h · exit " + kmh(drill.exitSpeed) + " km/h"
        : mode === "launch" ? "0 to " + kmh(G.vTop() * .5) + " km/h in " + score.toFixed(2) + "s"
        : mode === "start" ? (placed > 0 ? "gained " + placed + (placed === 1 ? " place" : " places") : placed < 0 ? "lost " + (-placed) + (placed === -1 ? " place" : " places") : "held position")
          + " — P" + drill.place0 + " to P" + drill.placeNow
        // SLIPSTREAM reports tow-seconds beside the metres rather than scoring
        // them: the tow is a vmax multiplier, so below vmax it reads 1.0 and
        // buys nothing. Metres closed is the EFFECT, and it is zero when the
        // tow is inert. A run with 12 m closed and 0.4 s of tow is visibly not
        // a slipstream, which is exactly what the pairing is for.
        : mode === "slipstream" ? "closed " + Math.max(0, drill.closed).toFixed(0) + " m in " + drill.towS.toFixed(1) + "s of tow · nearest " + (Number.isFinite(drill.gapMin) ? drill.gapMin.toFixed(0) : "—") + " m"
        : mode === "overtake" ? "passed " + drill.rivalCode + " in " + seconds.toFixed(1) + "s · closed from " + drill.gap0.toFixed(0) + " m" + (drill.gifted ? " · he moved over" : "")
        // "he gave up the move", never "you forced him to": the AI's commitment
        // also decays on its own cooldown, so the wording is the honest hedge.
        : mode === "defend" ? "held P" + drill.place0 + " for " + Math.min(HOLD_CAP, drill.pressT).toFixed(1) + "s under attack"
          + (drill.attacked ? "" : " — he never committed") + (drill.gaveUp ? " · he gave up the move" : "")
        : mode === "backmarkers" ? "cleared " + drill.cleared + " of " + TRAFFIC_N + " in " + seconds.toFixed(1) + "s"
        : mode === "lap" ? "lap " + G.fmtTime(score) : seconds.toFixed(1) + "s";
      lastDrill = { mode, seconds, clean: drill.clean, changes: drill.changes, reason: drill.reason, score, text,
        limit: limit == null ? null : +limit.toFixed(1), slack: slack == null ? null : +slack.toFixed(1) };
      boundedPush(attempts[mode] || (attempts[mode] = []), { time: G.raceT, clean: drill.clean, score, text, reason: drill.reason }, 10);
      let improved = false;
      if (drill.clean && mode !== "free") {
        // Mastery is separate from lap records and never awards career currency.
        const entries = masteryEntries(), key = masteryKey(mode, drill.sector);
        const found = entries.find(e => e.key === key);
        improved = !!(found && Number.isFinite(found.best) && score < found.best);
        const best = found && Number.isFinite(found.best) ? Math.min(found.best, score) : score;
        G.store.set("circuitMastery", { version: 1, entries: entries.filter(e => e.key !== key).concat({ key, best, completed: Math.min(9999, (found && Number.isFinite(found.completed) ? Math.max(0, Math.floor(found.completed)) : 0) + 1) }) });
      }
      event("practice", (drill.clean ? "Completed: " : "Retry suggested: ") + DRILLS[mode] + " · " + (drill.clean ? text : drill.reason + " · " + text));
      // The verdict goes on screen where the drive happened, not only in the pause menu.
      G.announce(drill.clean ? "PRACTICE DONE — " + text.toUpperCase() + (improved ? " · NEW BEST" : "")
        : "PRACTICE — TRY AGAIN: " + drill.reason.toUpperCase(), 3, "practice");
    }
    function observeDrill(c, current) {
      if (!drill || drill.done) return;
      if (current.contact) failDrill("car contact");
      if (current.off) failDrill("left the track");
      if (current.retired) failDrill("car retired");
      const v = Math.abs(c.speed), brake = c.brakeDemand || 0, throttle = c.throttleDemand || 0, lat = c.lateralAccel || 0;
      const turning = Math.abs(lat) > TURN_ACCEL, moving = v > G.vTop() * .15, now = G.raceT;
      if (brake > FIRM_BRAKE && v > 1 && !drill.brakeSeen) { drill.brakeSeen = true; drill.brakeProg = current.prog; drill.brakeSpeed = v; }
      if (drill.brakeSeen && v > 1) {
        drill.slowing++; if (brake > FIRM_BRAKE) drill.held++;
        // The car's OWN hardest braking this attempt, measured rather than
        // modelled: tyres, weather, car mods and the surface are all already in
        // it, so the reference needs no constant and cannot drift from the sim.
        if (brake > FIRM_BRAKE) drill.peakDecel = Math.max(drill.peakDecel, -(c.axEstSm || 0));
      }
      if (drill.brakeSeen && brake > .05 && turning) drill.turnSeen = true;
      if (turning && moving) { const side = Math.sign(lat); if (drill.side && side !== drill.side) drill.changes++; drill.side = side; }
      if (turning) { drill.turnRun++; drill.straightRun = 0; } else { drill.straightRun++; drill.turnRun = 0; }
      if (drill.phase === 0 && drill.turnRun >= CORNER_IN) drill.phase = 1;
      if (drill.phase === 1) { drill.minSpeed = Math.min(drill.minSpeed, v); if (drill.straightRun >= CORNER_OUT) { drill.phase = 2; drill.exitSpeed = v; } }
      if (throttle > .5 && drill.launchT == null) drill.launchT = now;
      if (current.lap > drill.lap) {
        drill.lap = current.lap;
        if (drill.lapStart != null) drill.lapDone = true;
        else { drill.lapStart = now; if (drill.mode === "lap") { event("practice", "Lap timing started at the line"); G.announce("LAP TIMING STARTED", 1.5, "practice"); } }
      } else if (current.lap < drill.lap) { drill.lap = current.lap; failDrill("crossed the line backwards"); }
      if (drill.mode === "sector") {
        if (current.sector !== drill.sector && current.prog - drill.startProg > 10) finishDrill(current, c);
      } else if (drill.mode === "corner") {
        if (drill.phase === 2 && moving) finishDrill(current, c);
        else if (v < 1) { failDrill(drill.phase ? "stopped in the corner" : "stopped before the corner"); finishDrill(current, c); }
      } else if (drill.mode === "lap") {
        if (drill.lapDone) finishDrill(current, c);
      } else if (drill.mode === "launch") {
        if (v >= G.vTop() * .5) finishDrill(current, c);
      } else if (drill.mode === "start") {
        // Tracked every sample, so the result is where you ARE when the run
        // ends, not a single late reading that a shuffle could flatter.
        drill.placeNow = placeOf(c) || drill.placeNow;
        // THE RUN ENDS AT THE FIRST CORNER, which is what a start IS: the drag
        // to the braking zone and the place you hold through it. Phase 2 is the
        // corner-drill's own "through it and out the other side" detector, so
        // the two agree on where a corner ends rather than inventing a second
        // rule. The distance floor keeps a twitch on the grid from ending it.
        if (drill.phase === 2 && moving && current.prog - drill.startProg0 > 40) finishDrill(current, c);
        // A start that never starts is not a result. The launch drill has the
        // same shape (it waits for speed); this one also has to survive the car
        // simply stopping — a stall, or a first-corner shunt that ends the run.
        else if (v < 1 && now - drill.time > 6) { failDrill("the car never got away"); finishDrill(current, c); }
      } else if (drill.mode === "braking") {
        if (v < 1) {
          if (!drill.brakeSeen) failDrill("stopped without firm braking");
          else if (drill.held < HELD_FRACTION * drill.slowing) failDrill("brake released before the stop");
          finishDrill(current, c);
        }
      } else if (drill.mode === "trail") {
        if (drill.turnSeen && brake < .05 && turning && moving) finishDrill(current, c);
        else if (v < 1) { failDrill("stopped before releasing the brake"); finishDrill(current, c); }
      } else if (drill.mode === "slalom" && drill.changes >= 6) finishDrill(current, c);
      else if (drill.rival) observeRival(c, current, v, moving, now);
    }
    // THE RIVAL BRANCHES. Two rules bind all three: everything read here is a
    // car POSITION, a car SPEED or a stashed field another system already wrote
    // (towing, wake, letPassT, passOf) — never Tracks.curvature and never the
    // racing line, so no part of a drill's verdict can reach the player's
    // physics. And nothing here writes to a car: drills only read.
    function observeRival(c, current, v, moving, now) {
      const r = drill.rival, mode = drill.mode;
      // REAL elapsed seconds, not a per-tick constant. update() is driven at
      // roughly 10 Hz today, but an accumulator that assumed it would silently
      // score a tenth of the truth the day that cadence changed — and would be
      // wrong by the same factor in any test that ticks at its own rate.
      const step = Math.max(0, now - (drill.lastT != null ? drill.lastT : drill.time));
      drill.lastT = now;
      if (r.retired || r.finished) { failDrill("the rival dropped out"); finishDrill(current, c); return; }
      if (G.cautionInfo && G.cautionInfo().level > 0) { failDrill("a caution neutralised the fight"); finishDrill(current, c); return; }
      const gap = gapTo(r, c);
      if (gap == null) return;
      drill.gapNow = gap;
      drill.gapMin = Math.min(drill.gapMin, Math.abs(gap));
      // c.towing is the tow the player is ACTUALLY getting: js/game.js already
      // gates it on driver state (not braking, not steering) rather than on
      // curvature, so reading it here inherits that argument instead of asking
      // "am I on a straight?" — which would drag the arc toward the driver.
      drill.towS += step * (c.towing || 0);
      drill.wakeS += step * (c.wake || 0);
      if (mode === "slipstream") {
        drill.closed = drill.gap0 - Math.abs(gap);
        if (gap > 0 && Math.abs(gap) <= WAKE_DONE_M) { finishDrill(current, c); return; }
        if (gap < -SIDE_M) { finishDrill(current, c); return; }   // went by: not the goal, not a failure
        if (Math.abs(gap) > TOW_RANGE) { failDrill("dropped out of the wake"); finishDrill(current, c); return; }
        if (!moving) { failDrill("the car stopped"); finishDrill(current, c); return; }
        if (now - drill.time > 45) { failDrill("never closed the gap"); finishDrill(current, c); }
        return;
      }
      if (mode === "overtake") {
        // THE GIFT WATCH. letPassT is the AI's own concession timer; past its
        // delay it has decided to move over, and a pass handed to you is not a
        // pass. Parity makes this nearly unreachable, which is the point — this
        // catches the case where it happens anyway.
        const delay = 4.2 + (1.8 - 4.2) * (r.awareness != null ? r.awareness : 0.75);
        if ((r.letPassT || 0) > delay && !drill.conceded) { drill.conceded = true; failDrill("he let you through"); }
        if (drill.phase2 === 0 && Math.abs(gap) < SIDE_M) drill.phase2 = 1;
        // A lateral proxy, and a deliberately WEAK one. js/game.js concedes room
        // to a human at the aim point with no timer and no trace on the car, so
        // this cannot be detected exactly — only suspected. It annotates the
        // result instead of failing it, because a drill that refused every pass
        // the player really earned would be worse than one that occasionally
        // credits a gift.
        if (drill.phase2 === 1 && Math.abs((r.x || 0) - drill.rivalX0) > 0.6) drill.gifted = true;
        if (gap < -SIDE_M) { drill.clearT += step; if (drill.clearT >= CLEAR_S) { finishDrill(current, c); return; } }
        else drill.clearT = 0;
        if (gap > TOW_RANGE) { drill.escapeT += step; if (drill.escapeT > 3) { failDrill("lost touch with the car ahead"); finishDrill(current, c); return; } }
        else drill.escapeT = 0;
        if (now - drill.time > 60) { failDrill("never got the move done"); finishDrill(current, c); }
        return;
      }
      if (mode === "backmarkers") {
        // Count a car as cleared when it goes from ahead of us to behind us and
        // stays there. `passing` latches the one being worked on so a car
        // weaving either side of the boundary cannot be counted twice.
        // A SET, not a single latch: you are past one car while alongside the
        // next, which is what makes traffic traffic. A car counts once, when it
        // goes from clearly ahead to clearly behind — the SIDE_M band between
        // the two keeps a car weaving either side of the line from scoring
        // twice, and dropping it from the set keeps it from scoring again if it
        // re-passes you.
        for (const o of (G.cars || [])) {
          if (o === c || o.retired || o.finished) continue;
          const g = gapTo(o, c);
          if (g == null) continue;
          if (g > SIDE_M) drill.passing.add(o);
          else if (g < -SIDE_M && drill.passing.delete(o)) drill.cleared++;
        }
        if (drill.cleared >= TRAFFIC_N) { finishDrill(current, c); return; }
        if (now - drill.time > 90) { failDrill("ran out of time in traffic"); finishDrill(current, c); }
        return;
      }
      // DEFEND. passOf is the identity of the car an AI has committed to passing
      // and passFailOf the one it gave up on — the only per-pair identity in the
      // engine, and the difference between "I defended" and "nobody tried".
      if (r.passOf === c) drill.attacked = true;
      if (r.passFailOf === c) drill.gaveUp = true;
      if (gap > -ATTACK_M) drill.pressT += step;   // time with the rival out of range does not count as pressure survived
      drill.placeNow = placeOf(c) || drill.placeNow;
      if (drill.pressT >= HOLD_CAP) { finishDrill(current, c); return; }
      // Losing the place to a genuinely faster car is a RESULT, not a failure:
      // the seconds you survived still bank.
      if (drill.placeNow > drill.place0) { finishDrill(current, c); return; }
      if (Math.abs(gap) > TOW_RANGE) { drill.escapeT += step; if (drill.escapeT > 3) { finishDrill(current, c); return; } }
      else drill.escapeT = 0;
      // A defence against a car that never tried is not a result. Same shape as
      // the start drill's "the car never got away".
      if (!drill.attacked && drill.pressT > 10) { failDrill("he never attacked"); finishDrill(current, c); }
    }
    function update(c) {
      if (!c || !G.track || G.state !== "race") return;
      const now = G.raceT, current = { time: now, prog: c.prog, lap: c.lap, sector: G.sectorIdx,
        energy: c.energy, wear: c.tyreWear || 0, stint: c.tyreStints || 0, tyre: c.tyre && c.tyre.id,
        penalty: c.penalty || 0, warnings: c.cutWarn || 0, invalid: !!c.incidentInvalidLap,
        pit: !c.pitState || c.pitState === "none" ? "track" : c.pitState, contact: (c.contactT || 0) > 0, off: !!c.offroad, retired: !!c.retired };
      if (previous && (now < previous.time || current.prog < previous.prog - 10)) { previous = null; sector = tyreStart = null; laps = []; energy = [[], [], []]; lapClean = false; failDrill("position jumped"); }
      if (!previous) {
        previous = current; tyreStart = current; sector = { ...current, valid: false };
        // The first sample cannot measure a sector, but its inputs and contact
        // still belong to the attempt; discarding it could award dirty mastery.
        observeDrill(c, current); return;
      }
      const wet = G.roadWetness ? G.roadWetness() : 0;
      if (weather != null && Math.abs(wet - weather) > .05) { laps = []; energy = [[], [], []]; sector.valid = false; weather = wet; }
      if (weather == null) weather = wet;
      const dt = now - previous.time, ds = current.prog - previous.prog;
      if (dt <= 0) return;
      if (ds >= 0 && ds <= Math.max(20, Math.abs(c.speed) * dt * 2)) distance += ds;
      else { sector.valid = false; lapClean = false; tyreStart = current; failDrill("position jumped"); }
      if (current.penalty > previous.penalty) event("penalty", "+" + (current.penalty - previous.penalty) + "s time penalty");
      if (current.warnings > previous.warnings) event("limits", "Track-limits warning " + current.warnings);
      if (current.invalid && !previous.invalid) event("invalid", "Lap invalidated by an incident or practice reset");
      if (current.contact && !previous.contact) event("contact", "Car contact");
      if (current.off && !previous.off) event("surface", "Left the track");
      if (current.retired && !previous.retired) event("retirement", "Car retired");
      if (current.pit !== previous.pit) event("pit", "Pit phase: " + current.pit);
      if (current.tyre !== previous.tyre || current.stint !== previous.stint || current.wear < previous.wear) {
        tyreStart = current; laps = []; event("tyres", "New stint: " + (current.tyre || "unknown compound"));
      }
      if (current.contact || current.off || current.invalid || current.pit !== "track") { sector.valid = false; lapClean = false; }
      if (current.sector !== previous.sector) {
        if (current.sector === (previous.sector + 1) % 3 && sector.valid && ds > 0 && now - sector.time > 1 && Number.isFinite(current.energy) && Number.isFinite(sector.energy))
          boundedPush(energy[previous.sector], { seconds: now - sector.time, used: sector.energy - current.energy }, 6);
        sector = { ...current, valid: !current.invalid && !current.off && !current.contact && current.pit === "track" };
      }
      if (current.lap > previous.lap) {
        if (lapClean && c.lastLap > 0) boundedPush(laps, { seconds: c.lastLap, wear: current.wear, stint: current.stint }, 12);
        lapClean = !current.invalid && !current.off && current.pit === "track";
      }
      // The pace read runs whether or not a drill is armed — OVERTAKE needs a
      // second of history on the car ahead BEFORE it can judge whether the
      // fight is fair, and asking for it at arming time would be too late.
      samplePace(c);
      observeDrill(c, current);
      previous = current;
    }
    function forecast() {
      const c = G.player, total = G.track && G.track.total;
      if (!c || !(total > 0)) return null;
      const observed = tyreStart ? (c.prog - tyreStart.prog) / total : 0;
      const wearOn = G.tyres && G.tyres.on();
      const wearRate = wearOn && observed >= .5 ? ((c.tyreWear || 0) - tyreStart.wear) / observed : null;
      const lapsLeft = Math.max(0, G.lapsTarget - (c.prog / total));
      const remaining = wearRate > 0 ? Math.max(0, (1 - (c.tyreWear || 0)) / wearRate) : null;
      const estimate = G.pits && G.pits.estimate(c);
      // Fit degradation from completed laps of this stint, never from a guessed compound offset.
      const same = laps.filter(l => l.stint === (c.tyreStints || 0)), first = same[0], last = same[same.length - 1];
      const degradation = wearOn && same.length >= 3 && last.wear - first.wear > .01
        ? Math.max(0, (last.seconds - first.seconds) / (last.wear - first.wear)) : null;
      const saving = degradation == null ? null : degradation * (c.tyreWear || 0);
      const sectorForecast = energy.map(a => a.length ? { samples: a.length, used: a.reduce((s,v)=>s+v.used,0)/a.length,
        spread: Math.max(...a.map(v=>v.used))-Math.min(...a.map(v=>v.used)) } : null);
      const lapUse = sectorForecast.every(Boolean) ? sectorForecast.reduce((s,v)=>s+v.used,0) : null;
      return { observedLaps: Math.max(0, observed), remainingLaps: remaining, lapsLeft,
        reachesFinish: remaining == null ? null : remaining >= lapsLeft,
        pitLossS: estimate ? estimate.lossS : null, freshTyreGainS: saving,
        paybackLaps: saving > .05 && estimate ? estimate.lossS / saving : null,
        sectors: sectorForecast, energyPerLap: lapUse,
        energyLaps: lapUse > .001 ? Math.max(0, c.energy / lapUse) : null,
        confidence: same.length >= 5 && observed >= 2 ? "moderate" : "low" };
    }
    function network() {
      const n = G.netPlay && G.netPlay.status ? G.netPlay.status() : null;
      if (!n) return null;
      if (!n.active) return n.reason ? { text: "Disconnected — return to the lobby to reconnect", connected: false } : null;
      const timing = (n.remotes || []).map(r=>r.timing).filter(Boolean);
      const delay = timing.length ? Math.max(...timing.map(t=>t.delayMs || 0)) : null;
      const rtt = n.net && n.net.rtt;
      return { connected: !!(n.net && n.net.alive), rttMs: rtt, delayMs: delay,
        text: n.net && !n.net.alive ? "Connection lost — return to the lobby" : "Online" + (Number.isFinite(rtt) ? " · RTT " + Math.round(rtt) + "ms" : "") + (delay == null ? "" : " · buffer " + Math.round(delay) + "ms") };
    }
    // THE ROUND DEBRIEF. `journal()` is the full event stream — up to 128 rows,
    // useful to a tool and useless on a results sheet. This condenses it to the
    // few kinds a driver can act on, each with a count and the laps it happened
    // on, so the career's race-craft percentage is shown next to WHAT COST IT
    // rather than as a bare number. Ordered by how much craft the kind is worth
    // (js/career/career.js), not by when it happened: the biggest cause first.
    // `pit`, `tyres` and `invalid` are deliberately absent — a stop is strategy,
    // not craft, and an invalidated lap is already counted as whatever caused it.
    const DEBRIEF = [["limits", "Track-limits warnings"], ["penalty", "Time penalties"],
      ["contact", "Car contact"], ["surface", "Off the track"], ["retirement", "Retired"]];
    function debrief() {
      const out = [];
      for (const [kind, label] of DEBRIEF) {
        const rows = events.filter((e) => e.kind === kind);
        if (!rows.length) continue;
        // `c.lap` IS the lap number the driver saw: the HUD prints
        // `Math.min(player.lap || 1, lapsTarget)` (js/ui/hud.js), so the only
        // adjustment is the same floor of 1 for an event before the first
        // crossing. De-duplicated, because three warnings on one lap is still
        // one lap to go and look at.
        const laps = [...new Set(rows.map((e) => Math.max(1, e.lap | 0)))];
        out.push({ kind, label, count: rows.length, laps });
      }
      return out;
    }
    function summary() { return { distance, drill: drill ? { mode: drill.mode, done: drill.done, clean: drill.clean, changes: drill.changes, reason: drill.reason, phase: drill.phase } : null, lastDrill: lastDrill ? { ...lastDrill } : null }; }
    return { update, reset, event, startDrill, forecast, network, summary, mastery, debrief, journal: () => events.map(e=>({...e})),
      attempts: mode => (attempts[mode] || []).map(a => ({ ...a })) };
  }
  return Object.freeze({ create, DRILLS });
})();
Object.freeze(RaceInsights);
