"use strict";
const RaceInsights = (function () {
  const DRILLS = Object.freeze({ free: "Free practice", sector: "Finish this sector cleanly", corner: "Drive through the next corner",
    lap: "One full lap from the line", cooling: "Measure a cooling lap on this tyre set", braking: "Brake to a controlled stop", trail: "Release the brake into a turn",
    slalom: "Six clean direction changes", launch: "Standing start to racing speed",
    start: "Gain a place off the line",
    slipstream: "Close on the car ahead in its wake", overtake: "Pass the car ahead",
    defend: "Hold your place under attack",
    backmarkers: "Clear three slower cars without contact" });
  const needsRivals = mode => ["start", "slipstream", "overtake", "defend", "backmarkers"].includes(mode);
  const TURN_ACCEL = 3;
  const FIRM_BRAKE = 0.5;
  const HELD_FRACTION = 0.8;
  const CORNER_IN = 3, CORNER_OUT = 5;
  const TOW_RANGE = 34, ATTACK_M = 12, SIDE_M = 2.4, WAKE_DONE_M = 8, LANE_M = 4;
  const PARITY = 0.04, PARITY_MIN = 10;
  const THREAT = 0.02;
  const HOLD_CAP = 30;
  const SLOW = 0.06, TRAFFIC_N = 3;
  const CLEAR_S = 1.5;
  const kmhOf = (dash, v) => {
    const k = dash ? dash(Math.abs(v)) : Math.abs(v) * 3.6;
    return typeof AppearanceOpts !== "undefined" ? AppearanceOpts.speed(k) : Math.round(k);
  };
  const unit = () => (typeof AppearanceOpts !== "undefined" && AppearanceOpts.units() === "mph" ? " mph" : " km/h");
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const boundedPush = (a, v, n) => { a.push(v); if (a.length > n) a.shift(); };
  function create(G) {
    const kmh = (v) => kmhOf(G.dashKph, v);
    let previous = null, events = [], sequence = 0, laps = [], sector = null, energy = [[], [], []];
    let lapEnergy = null, lastLapEnergy = null;
    let tyreStart = null, drill = null, lastDrill = null, distance = 0, lapClean = false, weather = null, attempts = {};
    let paceRef = null, paceWin = [];
    function event(kind, text) {
      boundedPush(events, { seq: ++sequence, time: G.raceT || 0, lap: G.player ? G.player.lap : 0, kind, text }, 128);
    }
    let runId = null, runs = 0;
    function reset() { lapEnergy = lastLapEnergy = null; runId = null; previous = sector = tyreStart = drill = lastDrill = null; events = []; sequence = distance = 0; lapClean = false; weather = null; laps = []; energy = [[], [], []]; attempts = {}; }
    function startDrill(mode) {
      if (!Object.hasOwn(DRILLS, mode)) mode = "free";
      const c = G.player;
      if (!c) return false;
      if (mode === "cooling" && (!G.practice || !G.tyres || !G.tyres.on() || !coolingSample(c))) {
        G.announce("COOLING LAP NEEDS UNSCORED PRACTICE AND TYRE WEAR", 3, "practice"); return false;
      }
      if (["braking", "trail"].includes(mode) && Math.abs(c.speed) < G.vTop() * .3) {
        G.announce("BUILD SPEED BEFORE SETTING THIS DRILL", 2, "practice"); return false;
      }
      if (["launch", "start"].includes(mode) && Math.abs(c.speed) > 1) { G.announce(mode === "start" ? "SET THIS ON THE GRID, BEFORE THE LIGHTS" : "STOP THE CAR BEFORE SETTING THIS DRILL", 2, "practice"); return false; }
      if (mode === "start" && placeOf(c) === 0) { G.announce("A START DRILL NEEDS OTHER CARS ON THE GRID", 2, "practice"); return false; }
      let rival = null;
      if (mode !== "start" && needsRivals(mode)) {
        if (placeOf(c) === 0) { G.announce("THIS DRILL NEEDS OTHER CARS ON TRACK", 2, "practice"); return false; }
        if (G.cautionInfo && G.cautionInfo().level > 0) { G.announce("NO RACING UNDER A CAUTION", 2, "practice"); return false; }
        if (mode === "backmarkers") {
          const slower = (G.cars || []).filter(o => o !== c && !o.retired && !o.finished
            && (gapTo(o, c) || 0) > 0 && isBackmarker(o, c));
          if (!slower.length) { G.announce("NO SLOWER TRAFFIC AHEAD TO PASS", 2, "practice"); return false; }
          rival = slower[0];
        } else rival = mode === "defend" ? nearestBehind(c) : nearestAhead(c);
        const gap = rival ? Math.abs(gapTo(rival, c)) : Infinity;
        if (mode === "backmarkers") {  }
        else if (mode === "defend") {
          if (!rival || gap > ATTACK_M) { G.announce("NOBODY IS ATTACKING YOU YET", 2, "practice"); return false; }
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
        rival, rivalCode: rival ? rival.code || "RIVAL" : "", rivalX0: rival ? rival.x || 0 : 0,
        gap0: rival ? Math.abs(gapTo(rival, c)) : 0, gapMin: Infinity, gapNow: 0,
        towS: 0, wakeS: 0, closed: 0, pressT: 0, escapeT: 0, clearT: 0, phase2: 0, lastT: null,
        attacked: false, conceded: false, gifted: false, gaveUp: false, cleared: 0,
        passing: new Set(), clearedIds: new Set(),
        clean: true, reason: "", done: false };
      if (mode === "cooling") drill.cooling = { car: c, track: G.track, tyre: c.tyre,
        stint: c.tyreStints || 0, compound: c.tyre && c.tyre.id, wet: G.trackWetness ? G.trackWetness() : 0, start: null };
      event("practice", DRILLS[mode] + " — unscored");
      return true;
    }
    function failDrill(reason) { if (drill && !drill.done && drill.clean) { drill.clean = false; drill.reason = reason; } }
    function placeOf(c) {
      const cars = G.cars;
      if (!c || !Array.isArray(cars) || cars.length < 2) return 0;
      let ahead = 0;
      for (const o of cars) if (o !== c && !o.retired && (o.prog || 0) > (c.prog || 0)) ahead++;
      return ahead + 1;
    }
    const masteryKey = (mode, sectorIdx) => {
      const key = G.records.key() + ":" + mode + ":" + (mode === "sector" ? sectorIdx : "all");
      if (mode !== "sector") return key;
      const splits = G.track && G.track.def && G.track.def.sectors || [1 / 3, 2 / 3];
      return key + ":splits:" + JSON.stringify(splits);
    };
    function gapTo(o, c) {
      const L = G.track && G.track.total;
      if (!o || !c || !(L > 0)) return null;
      const d = (o.prog || 0) - (c.prog || 0);
      return ((d + L / 2) % L + L) % L - L / 2;
    }
    const isBackmarker = (o, c) => (o._vmaxNow || 0) > 0 && (c._vmaxNow || 0) > 0 && (o._vmaxNow / c._vmaxNow) < 1 - SLOW;
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
      const lapTime = Number.isFinite(c._lapTimeAtLine) && c._lapTimeAtLine > 0 ? c._lapTimeAtLine : drill.lapStart == null ? seconds : G.raceT - drill.lapStart;
      const placed = (drill.place0 || 0) - (drill.placeNow || 0);
      const score = mode === "braking" ? stop : mode === "launch" && drill.launchT != null ? G.raceT - drill.launchT
        : mode === "lap" ? lapTime : mode === "start" ? -placed
        : mode === "slipstream" ? -Math.max(0, drill.closed)
        : mode === "defend" ? -Math.min(HOLD_CAP, drill.pressT) : seconds;
      const limit = mode === "braking" && drill.peakDecel > 1 && drill.brakeSpeed > 1
        ? (drill.brakeSpeed * drill.brakeSpeed) / (2 * drill.peakDecel) : null;
      const slack = limit == null ? null : Math.max(0, stop - limit);
      const text = mode === "braking" ? "stopped " + stop.toFixed(0) + " m after braking from " + kmh(drill.brakeSpeed) + unit()
          + (slack >= 1 ? " · " + slack.toFixed(0) + " m of it below your hardest braking" : "")
        : mode === "slalom" ? seconds.toFixed(1) + "s · " + drill.changes + " direction changes"
        : mode === "corner" ? seconds.toFixed(1) + "s · min " + kmh(drill.minSpeed) + unit() + " · exit " + kmh(drill.exitSpeed) + unit()
        : mode === "launch" ? "0 to " + kmh(G.vTop() * .5) + unit() + " in " + score.toFixed(2) + "s"
        : mode === "start" ? (placed > 0 ? "gained " + placed + (placed === 1 ? " place" : " places") : placed < 0 ? "lost " + (-placed) + (placed === -1 ? " place" : " places") : "held position")
          + " — P" + drill.place0 + " to P" + drill.placeNow
        : mode === "slipstream" ? "closed " + Math.max(0, drill.closed).toFixed(0) + " m in " + drill.towS.toFixed(1) + "s of tow · nearest " + (Number.isFinite(drill.gapMin) ? drill.gapMin.toFixed(0) : "—") + " m"
        : mode === "overtake" ? "passed " + drill.rivalCode + " in " + seconds.toFixed(1) + "s · closed from " + drill.gap0.toFixed(0) + " m" + (drill.gifted ? " · he moved over" : "")
        : mode === "defend" ? "held P" + drill.place0 + " for " + Math.min(HOLD_CAP, drill.pressT).toFixed(1) + "s under attack"
          + (drill.attacked ? "" : " — he never committed") + (drill.gaveUp ? " · he gave up the move" : "")
        : mode === "backmarkers" ? "cleared " + drill.cleared + " of " + TRAFFIC_N + " in " + seconds.toFixed(1) + "s"
        : mode === "lap" ? "lap " + G.fmtTime(score) : seconds.toFixed(1) + "s";
      lastDrill = { mode, seconds, clean: drill.clean, changes: drill.changes, reason: drill.reason, score, text,
        limit: limit == null ? null : +limit.toFixed(1), slack: slack == null ? null : +slack.toFixed(1) };
      boundedPush(attempts[mode] || (attempts[mode] = []), { time: G.raceT, clean: drill.clean, score, text, reason: drill.reason }, 10);
      let improved = false;
      if (drill.clean && mode !== "free") {
        const entries = masteryEntries(), key = masteryKey(mode, drill.sector);
        const found = entries.find(e => e.key === key);
        improved = !!(found && Number.isFinite(found.best) && score < found.best);
        const best = found && Number.isFinite(found.best) ? Math.min(found.best, score) : score;
        G.store.set("circuitMastery", { version: 1, entries: entries.filter(e => e.key !== key).concat({ key, best, completed: Math.min(9999, (found && Number.isFinite(found.completed) ? Math.max(0, Math.floor(found.completed)) : 0) + 1) }) });
      }
      event("practice", (drill.clean ? "Completed: " : "Retry suggested: ") + DRILLS[mode] + " · " + (drill.clean ? text : drill.reason + " · " + text));
      G.announce(drill.clean ? "PRACTICE DONE — " + text.toUpperCase() + (improved ? " · NEW BEST" : "")
        : "PRACTICE — TRY AGAIN: " + drill.reason.toUpperCase(), 3, "practice");
    }
    function coolingSample(c) {
      const grip = G.tyres && G.tyres.gripMul && G.tyres.gripMul(c);
      return Number.isFinite(c.tyreGrain) && Number.isFinite(c.tyreBlister) && Number.isFinite(grip) && grip > 0
        ? { grain: c.tyreGrain, blister: c.tyreBlister, grip } : null;
    }
    function finishCooling(current, c) {
      const a = drill.cooling.start, b = coolingSample(c);
      if (!a || !b) failDrill("tyre measurement unavailable");
      const recovery = drill.clean ? { grainStart: a.grain, grainEnd: b.grain, gripStart: a.grip, gripEnd: b.grip,
        grainChangePP: 100 * (b.grain - a.grain), gripChangePct: 100 * (b.grip / a.grip - 1),
        blisterStart: a.blister, blisterEnd: b.blister } : null;
      const signed = n => (n >= 0 ? "+" : "") + n.toFixed(1);
      const text = recovery ? (recovery.grainChangePP < -.05 && recovery.gripChangePct > .05 && b.blister <= b.grain ? "Measured recovery · " : "No recovery measured · ")
        + "Grain " + signed(recovery.grainChangePP) + "pp; grip " + signed(recovery.gripChangePct) + "%"
        + (b.blister > b.grain && b.blister > 0 ? " · Blistering remains" : "") : "No valid recovery measurement";
      drill.done = true;
      lastDrill = { mode: "cooling", seconds: Math.max(0, G.raceT - (drill.lapStart ?? drill.time)), clean: drill.clean,
        changes: 0, reason: drill.reason, score: null, text, recovery };
      boundedPush(attempts.cooling || (attempts.cooling = []), { time: G.raceT, clean: drill.clean, score: null, text, reason: drill.reason }, 10);
      event("practice", "Cooling lap · " + (drill.clean ? text : drill.reason));
      G.announce(drill.clean ? text.toUpperCase() : "COOLING LAP INVALID — " + drill.reason.toUpperCase(), 4, "practice");
    }
    function observeCooling(c, current) {
      const m = drill.cooling, wet = G.trackWetness ? G.trackWetness() : 0;
      if (!G.practice || !G.tyres || !G.tyres.on()) failDrill("practice or tyre wear ended");
      if (c !== m.car || G.track !== m.track) failDrill("session changed");
      if (c.tyre !== m.tyre || (c.tyre && c.tyre.id) !== m.compound || (c.tyreStints || 0) !== m.stint || (previous && current.wear < previous.wear)) failDrill("tyre set changed");
      if (!Number.isFinite(wet) || Math.abs(wet - m.wet) > .05) failDrill("weather changed");
      if (!coolingSample(c)) failDrill("tyre measurement unavailable");
      if (m.start && (current.contact || current.off || current.invalid || current.pit !== "track"
          || current.retired || c.finished || (G.cautionLevel && G.cautionLevel() > 0))) failDrill("lap interrupted");
      if (!drill.clean) { finishCooling(current, c); return; }
      if (current.lap > drill.lap) {
        if (current.lap !== drill.lap + 1) { failDrill("timing line skipped"); finishCooling(current, c); return; }
        drill.lap = current.lap;
        if (m.start) { finishCooling(current, c); return; }
        if (current.contact || current.off || current.invalid || current.pit !== "track" || current.retired || c.finished
            || (G.cautionLevel && G.cautionLevel() > 0)) return;
        m.start = coolingSample(c); drill.lapStart = G.raceT;
        G.announce("COOLING LAP MEASUREMENT STARTED", 2, "practice");
      } else if (current.lap < drill.lap) { failDrill("crossed the line backwards"); finishCooling(current, c); }
    }
    function observeDrill(c, current) {
      if (!drill || drill.done) return;
      if (drill.mode === "cooling") { observeCooling(c, current); return; }
      if (current.contact) failDrill("car contact");
      if (current.off) failDrill("left the track");
      if (current.retired) failDrill("car retired");
      const v = Math.abs(c.speed), brake = c.brakeDemand || 0, throttle = c.throttleDemand || 0, lat = c.lateralAccel || 0;
      const turning = Math.abs(lat) > TURN_ACCEL, moving = v > G.vTop() * .15, now = G.raceT;
      if (brake > FIRM_BRAKE && v > 1 && !drill.brakeSeen) { drill.brakeSeen = true; drill.brakeProg = current.prog; drill.brakeSpeed = v; }
      if (drill.brakeSeen && v > 1) {
        drill.slowing++; if (brake > FIRM_BRAKE) drill.held++;
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
        drill.placeNow = placeOf(c) || drill.placeNow;
        if (drill.phase === 2 && moving && current.prog - drill.startProg0 > 40) finishDrill(current, c);
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
    function observeRival(c, current, v, moving, now) {
      const r = drill.rival, mode = drill.mode;
      const step = Math.max(0, now - (drill.lastT != null ? drill.lastT : drill.time));
      drill.lastT = now;
      if (mode !== "backmarkers" && (r.retired || r.finished)) {
        failDrill("the rival dropped out"); finishDrill(current, c); return;
      }
      if (G.cautionInfo && G.cautionInfo().level > 0) { failDrill("a caution neutralised the fight"); finishDrill(current, c); return; }
      const gap = gapTo(r, c);
      if (gap == null) return;
      drill.gapNow = gap;
      drill.gapMin = Math.min(drill.gapMin, Math.abs(gap));
      drill.towS += step * (c.towing || 0);
      drill.wakeS += step * (c.wake || 0);
      if (mode === "slipstream") {
        drill.closed = drill.gap0 - Math.abs(gap);
        if (gap > 0 && Math.abs(gap) <= WAKE_DONE_M) { finishDrill(current, c); return; }
        if (gap < -SIDE_M) { finishDrill(current, c); return; }
        if (Math.abs(gap) > TOW_RANGE) { failDrill("dropped out of the wake"); finishDrill(current, c); return; }
        if (!moving) { failDrill("the car stopped"); finishDrill(current, c); return; }
        if (now - drill.time > 45) { failDrill("never closed the gap"); finishDrill(current, c); }
        return;
      }
      if (mode === "overtake") {
        const delay = 4.2 + (1.8 - 4.2) * (r.awareness != null ? r.awareness : 0.75);
        if ((r.letPassT || 0) > delay && !drill.conceded) { drill.conceded = true; failDrill("he let you through"); }
        if (drill.phase2 === 0 && Math.abs(gap) < SIDE_M) drill.phase2 = 1;
        if (drill.phase2 === 1 && Math.abs((r.x || 0) - drill.rivalX0) > 0.6) drill.gifted = true;
        if (gap < -SIDE_M) { drill.clearT += step; if (drill.clearT >= CLEAR_S) { finishDrill(current, c); return; } }
        else drill.clearT = 0;
        if (gap > TOW_RANGE) { drill.escapeT += step; if (drill.escapeT > 3) { failDrill("lost touch with the car ahead"); finishDrill(current, c); return; } }
        else drill.escapeT = 0;
        if (now - drill.time > 60) { failDrill("never got the move done"); finishDrill(current, c); }
        return;
      }
      if (mode === "backmarkers") {
        for (const o of (G.cars || [])) {
          if (o === c || o.retired || o.finished) continue;
          const g = gapTo(o, c);
          if (g == null) continue;
          if (g > SIDE_M) {
            if (isBackmarker(o, c) && !drill.clearedIds.has(o)) drill.passing.add(o);
          } else if (g < -SIDE_M && drill.passing.delete(o) && !drill.clearedIds.has(o)) {
            drill.clearedIds.add(o);
            drill.cleared++;
          }
        }
        if (drill.cleared >= TRAFFIC_N) { finishDrill(current, c); return; }
        if (now - drill.time > 90) { failDrill("ran out of time in traffic"); finishDrill(current, c); }
        return;
      }
      if (r.passOf === c) drill.attacked = true;
      if (r.passFailOf === c) drill.gaveUp = true;
      if (gap > -ATTACK_M) drill.pressT += step;
      drill.placeNow = placeOf(c) || drill.placeNow;
      if (drill.pressT >= HOLD_CAP) { finishDrill(current, c); return; }
      if (drill.placeNow > drill.place0) { finishDrill(current, c); return; }
      if (Math.abs(gap) > TOW_RANGE) { drill.escapeT += step; if (drill.escapeT > 3) { finishDrill(current, c); return; } }
      else drill.escapeT = 0;
      if (!drill.attacked && drill.pressT > 10) { failDrill("he never attacked"); finishDrill(current, c); }
    }
    function update(c) {
      if (!c || !G.track || G.state !== "race") return;
      const now = G.raceT, current = { time: now, prog: c.prog, lap: c.lap, sector: G.sectorIdx,
        energy: c.energy, wear: c.tyreWear || 0, stint: c.tyreStints || 0, tyre: c.tyre && c.tyre.id,
        penalty: c.penalty || 0, warnings: c.cutWarn || 0, invalid: !!c.incidentInvalidLap,
        pit: !c.pitState || c.pitState === "none" ? "track" : c.pitState, contact: (c.contactT || 0) > 0, off: !!c.offroad, retired: !!c.retired };
      if (previous && (now < previous.time || current.prog < previous.prog - 10)) { previous = null; sector = tyreStart = null; laps = []; energy = [[], [], []]; lapEnergy = lastLapEnergy = null; lapClean = false; failDrill("position jumped"); }
      if (!previous) {
        previous = current; tyreStart = current; sector = { ...current, valid: false };
        observeDrill(c, current); return;
      }
      const wet = G.trackWetness ? G.trackWetness() : 0;
      if (weather != null && Math.abs(wet - weather) > .05) { laps = []; energy = [[], [], []]; lapEnergy = lastLapEnergy = null; sector.valid = false; tyreStart = current; weather = wet; }
      if (weather == null) weather = wet;
      const dt = now - previous.time, ds = current.prog - previous.prog;
      if (dt <= 0) return;
      if (ds >= 0 && ds <= Math.max(20, Math.abs(c.speed) * dt * 2)) distance += ds;
      else { sector.valid = false; lapClean = false; lapEnergy = lastLapEnergy = null; tyreStart = current; failDrill("position jumped"); }
      if (current.penalty > previous.penalty) event("penalty", "+" + (current.penalty - previous.penalty) + "s time penalty");
      if (current.warnings > previous.warnings) event("limits", "Track-limits warning " + current.warnings);
      if (current.invalid && !previous.invalid) {
        const why = current.contact ? "car contact" : current.off ? "left the track" : current.warnings > previous.warnings ? "track limits"
          : current.penalty > previous.penalty ? "penalty" : "incident or practice reset";
        event("invalid", "Lap invalidated: " + why);
      }
      if (current.contact && !previous.contact) event("contact", "Car contact");
      if (current.off && !previous.off) event("surface", "Left the track");
      if (current.retired && !previous.retired) event("retirement", "Car retired");
      if (current.pit !== previous.pit) {
        event("pit", "Pit phase: " + current.pit);
        if (current.pit !== "track") { energy = [[], [], []]; lapEnergy = lastLapEnergy = null; sector.valid = false; }
      }
      if (current.tyre !== previous.tyre || current.stint !== previous.stint || current.wear < previous.wear) {
        tyreStart = current; laps = []; energy = [[], [], []]; lapEnergy = lastLapEnergy = null; sector = { ...current, valid: false }; event("tyres", "New stint: " + (current.tyre || "unknown compound"));
      }
      const underCaution = (G.cautionLevel ? G.cautionLevel() : 0) > 0;
      if (current.contact || current.off || current.invalid || current.pit !== "track" || underCaution) { sector.valid = false; lapClean = false; lapEnergy = lastLapEnergy = null; }
      if (current.sector !== previous.sector) {
        if (current.sector === (previous.sector + 1) % 3 && sector.valid && ds > 0 && now - sector.time > 1 && Number.isFinite(current.energy) && Number.isFinite(sector.energy)) {
          const used = sector.energy - current.energy;
          boundedPush(energy[previous.sector], { seconds: now - sector.time, used }, 6);
          if (!lapEnergy || lapEnergy.lap !== previous.lap) lapEnergy = { lap: previous.lap, sectors: [null, null, null] };
          lapEnergy.sectors[previous.sector] = used;
        } else lapEnergy = lastLapEnergy = null;
        sector = { ...current, valid: !current.invalid && !current.off && !current.contact && current.pit === "track" && !underCaution };
      }
      if (current.lap > previous.lap) {
        lastLapEnergy = current.lap === previous.lap + 1 && lapEnergy && lapEnergy.lap === previous.lap && lapEnergy.sectors.every(Number.isFinite)
          ? { lap: previous.lap, sectors: lapEnergy.sectors.slice(), netUsed: lapEnergy.sectors.reduce((a, b) => a + b, 0) } : null;
        lapEnergy = null;
        if (lapClean && c.lastLap > 0) boundedPush(laps, { seconds: c.lastLap, wear: current.wear, stint: current.stint }, 12);
        lapClean = !current.invalid && !current.off && current.pit === "track";
      }
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
        lastLapEnergy: lastLapEnergy ? { ...lastLapEnergy, sectors: lastLapEnergy.sectors.slice() } : null,
        energyLaps: lapUse > .001 ? Math.max(0, c.energy / lapUse) : null,
        confidence: same.length >= 5 && observed >= 2 ? "moderate" : "low" };
    }
    function network() {
      const n = G.netPlay && G.netPlay.status ? G.netPlay.status() : null;
      if (!n) return null;
      if (!n.active) return n.reason && n.reason !== "local" ? { text: "Disconnected — return to the lobby to reconnect", connected: false } : null;
      const timing = (n.remotes || []).map(r=>r.timing).filter(Boolean);
      const delay = timing.length ? Math.max(...timing.map(t=>t.delayMs || 0)) : null;
      const rtt = n.net && n.net.rtt;
      return { connected: !!(n.net && n.net.alive), rttMs: rtt, delayMs: delay,
        text: n.net && !n.net.alive ? "Connection lost — return to the lobby" : "Online" + (Number.isFinite(rtt) ? " · RTT " + Math.round(rtt) + "ms" : "") + (delay == null ? "" : " · buffer " + Math.round(delay) + "ms") };
    }
    const DEBRIEF = [["limits", "Track-limits warnings"], ["penalty", "Time penalties"],
      ["contact", "Car contact"], ["surface", "Off the track"], ["retirement", "Retired"]];
    function debrief() {
      const out = [];
      for (const [kind, label] of DEBRIEF) {
        const rows = events.filter((e) => e.kind === kind);
        if (!rows.length) continue;
        const laps = [...new Set(rows.map((e) => Math.max(1, e.lap | 0)))];
        out.push({ kind, label, count: rows.length, laps });
      }
      return out;
    }
    const LOG_KINDS = ["penalty", "limits", "invalid", "contact", "retirement"];
    function settle() {
      const rows = events.filter((e) => LOG_KINDS.includes(e.kind)).map((e) => ({ seq: e.seq, time: e.time, lap: e.lap, kind: e.kind, text: e.text }));
      if (!rows.length) return rows;
      if (!runId) runId = G.records.key() + "@" + Date.now() + "#" + (++runs);
      const raw = G.store.get("incidentLog", null);
      const kept = raw && Array.isArray(raw.sessions) ? raw.sessions.filter((x) => x && x.id !== runId) : [];
      G.store.set("incidentLog", { version: 1, sessions: kept.concat({ id: runId, entries: rows.slice(-40) }).slice(-5) });
      return rows;
    }
    function summary() { return { distance, drill: drill ? { mode: drill.mode, done: drill.done, clean: drill.clean, changes: drill.changes, reason: drill.reason, phase: drill.phase } : null, lastDrill: lastDrill ? { ...lastDrill, ...(lastDrill.recovery ? { recovery: { ...lastDrill.recovery } } : {}) } : null }; }
    return { update, reset, event, settle, startDrill, forecast, network, summary, mastery, debrief, journal: () => events.map(e=>({...e})),
      attempts: mode => (attempts[mode] || []).map(a => ({ ...a })) };
  }
  return Object.freeze({ create, DRILLS, needsRivals });
})();
Object.freeze(RaceInsights);
