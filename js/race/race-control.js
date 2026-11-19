const RaceControl = (function () {
  "use strict";

  const POST_FINISH_CAP = 75;
  function finishPending(cars, raceT, lapsTarget, raceT0) {
    if (raceT - (raceT0 > 0 ? raceT0 : 0) > 360 * lapsTarget) return false;
    let running = false, pending = false;
    for (const c of cars || []) {
      if (!c) continue;
      if (!c.finished && !c.retired) running = true;
      if (c.finished && !c.retired && raceT < (c.finishT || 0) + (c.penalty || 0)) pending = true;
    }
    return running && pending;
  }
  function finishDelay(cars, raceT, lapsTarget, raceT0, post) {
    const ran = raceT - (raceT0 > 0 ? raceT0 : 0);
    let anyHuman = false, allHumansDone = true, anyFinished = false, running = false;
    for (const c of cars || []) {
      if (!c) continue;
      if (c.finished) anyFinished = true;
      else if (!c.retired) running = true;
      if (!c.human && !c._nHuman) continue;
      anyHuman = true;
      if (!c.finished && !c.retired) allHumansDone = false;
    }
    if (finishPending(cars, raceT, lapsTarget, raceT0)) return 0;
    if (post) { if (!(anyHuman && allHumansDone)) post.since = -1; else if (post.since < 0) post.since = raceT; }
    if (anyHuman && allHumansDone && post && post.solo && running) return raceT - post.since < POST_FINISH_CAP ? 0 : 0.1;
    if (anyHuman && allHumansDone) return 2.2;
    if (!anyHuman && anyFinished) return 3.5;
    if (ran > 360 * lapsTarget) return 0.1;
    return 0;
  }

  function flagOut(cars, at = Infinity) {
    for (const c of cars || []) if (c && c.finished && !c.retired && (c.finishT || 0) <= at) return true;
    return false;
  }

  let lineCars = null;
  const lineEntries = [];
  function beginLineStep(cars) { lineCars = cars; lineEntries.length = 0; ringCars = cars; ringTotal = NaN; }
  function settleLine(e) {
    const { c, cross, time, target, cars } = e;
    cross.flagged = !c._nFallback && target > 0 && (c.lap > target || (c.lap > 1 && flagOut(cars, time)));
    if (cross.flagged) {
      if (!c.finished && typeof SportingRegs !== "undefined") c.compoundShortAtFinish = SportingRegs.compoundShort(c.tyreLog);
      c.finished = true; c.finishT = time;
    }
  }
  function deferLine(c, cross, newS, callback) {
    if (!lineCars || !cross || cross.direction < 0) return false;
    const e = lineEntries.find((e) => e.cross === cross);
    if (!e) return false;
    e.callback = callback; e.newS = newS;
    return true;
  }
  const byCrossing = (a, b) => (a.time - b.time) || ((b.c.lap > b.target) - (a.c.lap > a.target));
  function settleLineStep() {
    if (lineEntries.length > 1) lineEntries.sort(byCrossing);
    for (const e of lineEntries) settleLine(e);
  }
  function endLineStep() {
    lineCars = null;
    settleLineStep();
    for (const e of lineEntries) if (e.callback) e.callback(e.c, e.cross, e.newS);
    lineEntries.length = 0;
  }

  function lineTransition(c, oldS, newS, ds, total, lapsTarget, cars, raceT, dt) {
    if (!c || c.finished || !(total > 0)) return null;
    if (ds > 0 && oldS > total * 0.5 && newS < total * 0.5) {
      let over = 0;
      if (dt > 0 && Number.isFinite(dt)) {
        const frac = (total - oldS) / ds;
        if (Number.isFinite(frac)) over = dt * (1 - Math.min(1, Math.max(0, frac)));
      }
      const lapDone = Math.max(0, (c.lapTime || 0) - over);
      const recross = !!c._recross;
      c._recross = false;
      c.lap = (c.lap || 0) + 1;
      c.fuelLap = Math.max(c.fuelLap || 0, c.lap + (c.fuelRestartLaps || 0));
      c._lapTimeAtLine = lapDone;
      c.lapTime = (c.lapTime || 0) - lapDone;
      const cross = { direction: 1, changed: true, lapDone, flagged: false, recross };
      const e = { c, cross, target: Number(lapsTarget), cars,
        time: Number.isFinite(raceT) ? Math.max(0, raceT - over) : 0 };
      if (lineCars === cars) lineEntries.push(e);
      else settleLine(e);
      return cross;
    }
    if (ds < 0 && oldS < total * 0.5 && newS > total * 0.5) {
      if (!(c.lap > 0)) return { direction: -1, changed: false, lapDone: null, flagged: false };
      c.lap--;
      c.lapTime = c._lapTimeAtLine != null ? c._lapTimeAtLine : c.lapTime;
      c._recross = true;
      return { direction: -1, changed: true, lapDone: null, flagged: false };
    }
    return null;
  }
  function finishOrder(a, b) {
    const clock = (c) => {
      const t = c && c.finishT;
      return Number.isFinite(t) ? t + (c.penalty || 0) : Infinity;
    };
    return ((b.lap || 0) - (a.lap || 0)) || (clock(a) - clock(b));
  }

  function runOrder(vRef) {
    return (a, b) => (b.prog - (b.penalty || 0) * vRef) - (a.prog - (a.penalty || 0) * vRef);
  }

  function classify(cars, fin, run, out) {
    const flagLap = fin.length ? Math.max(...fin.map((c) => c.lap || 0)) : Infinity;
    const lapsAt = (c) => (c.finished ? (c.lap || 0)
      : Math.min((c.lap || 0) + 1, c.retired ? flagLap : Infinity));
    const done = (c) => (c.retired ? (c.lap || 0) - 1 : lapsAt(c) - 1);
    const ref = fin.length ? fin : run.length ? run : out.filter((c) => !c.dsq);
    const winDone = ref.length ? Math.max(...ref.map((c) => c.lap || 0)) - 1 : 0;
    const cut = Math.floor(0.9 * winDone);
    for (const c of cars) c.classified = !c.dsq && (winDone > 0 ? done(c) >= cut : !c.retired);
    const all = fin.concat(run, out);
    return all.filter((c) => c.classified).sort((a, b) => lapsAt(b) - lapsAt(a))
      .concat(fin.concat(run, out).filter((c) => !c.classified && !c.dsq)
        .sort((a, b) => (lapsAt(b) - lapsAt(a)) || ((b.prog || 0) - (a.prog || 0))));
  }

  function shortRun(cars, lapsTarget) {
    if (!(lapsTarget > 0) || !cars || cars.some((c) => c.finished && !c.retired)) return null;
    const live = cars.filter((c) => !c.retired);
    const ref = live.length ? live : cars.filter((c) => !c.dsq);
    return { laps: ref.length ? Math.max(0, Math.max(...ref.map((c) => c.lap || 0)) - 1) : 0, of: lapsTarget };
  }

  const LABEL = ["GREEN", "YELLOW", "VSC", "SAFETY CAR", "RED FLAG"];
  const YELLOW_MIN = 3;
  const VSC_MIN = 6;
  const SC_MIN = 10;
  const RED_MIN = 16;
  const RED_STOP = 8;
  const RED_HOLD = 6;
  const MIN_HOLD = 6;
  const YELLOW_MAX = 30;
  const SC_MAX = 90;
  const CAP_REARM_HOLD = 45;
  const QUERY_EVERY = 0.25;

  const NO_HAZARDS = { total: 0, redTotal: 0, sectors: [0, 0, 0], worst: { sector: -1, count: 0, frac: 0 } };
  function blank() {
    return { level: 0, sector: -1, frac: 0, total: 0, sectors: [0, 0, 0], sinceT: 0, cause: "", phase: "" };
  }

  function logFlag(prev, next) {
    if (prev === next) return;
    Log.info("game", "RaceControl flag " + LABEL[prev] + " -> " + LABEL[next]);
  }

  function create(G) {
    const { store } = G;
    let /** @type {ReturnType<typeof StoppedCars.create> | null} */ stopSrc = null;
    return createControl(Object.freeze({
      get state() { return G.state; }, get session() { return G.session; },
      get timeTrial() { return G.timeTrial; }, get _s8Stamp() { return G._s8Stamp; },
      get raceT() { return G.raceT; }, get raceWeather() { return G.raceWeather; },
      get leaderLap() { const leader = G.ranked && G.ranked[0]; return leader ? leader.lap : null; },
      readCaution: () => store.get("caution", false), writeCaution: (on) => { store.set("caution", on); },
      networkActive: () => G.netPlay.active(), ownsRaceControl: () => G.netPlay.ownsRaceControl(),
      reportCaution: (d) => G.netPlay.reportCaution(d),
      announce: (text, seconds, kind) => typeof G.announce === "function" ? G.announce(text, seconds, kind) : false,
      wetness: () => typeof G.trackWetness === "function" ? G.trackWetness() : undefined,
      stopped: (step) => (typeof StoppedCars !== "undefined" ? stopSrc || (stopSrc = StoppedCars.create()) : null)?.picture(G.cars, G.track, step) ?? null,
      stoppedReset: () => { if (stopSrc) stopSrc.reset(); },
      playerWait: () => { if (typeof RetiredCard !== "undefined") RetiredCard.tickG(G); },
    }));
  }


  function createControl(port) {
    Log.info("game", "RaceControl.create");
    let caution = blank();
    let queryT = 0;
    let stopQueryT = 0, stopPic = null, stopOwned = false;
    let capHoldT = 0;
    let capHoldLevel = 0;
    let flagAgeT = 0, flagPeak = 0;
    function episode(level) {
      if (level > flagPeak) { flagPeak = level; flagAgeT = 0; }
    }
    let replayOwned = false;
    let restartWanted = false;
    let otHoldLap = null;
    let lowGripNoted = false;
    let held = 0, heldCause = "";
    let scriptHeld = 0, scriptCause = "", wxHeld = 0;
    let stormSince = null, stormAtStart = false, stormLastT = 0;
    let sent = "";
    const savedCaution = port.readCaution();
    let enabled = !(savedCaution === false || savedCaution === 0 || savedCaution === "0");

    function reset() {
      caution = blank(); replayOwned = false;
      held = 0; heldCause = "";
      scriptHeld = 0; scriptCause = ""; wxHeld = 0; stormSince = null; stormAtStart = false; stormLastT = 0;
      queryT = 0;
      if (port.stoppedReset) port.stoppedReset();
      stopQueryT = 0; stopPic = null; stopOwned = false;
      capHoldT = 0; capHoldLevel = 0;
      flagAgeT = 0; flagPeak = 0;
      restartWanted = false;
      otHoldLap = null;
      lowGripNoted = false;
      sent = "";
    }

    function flag(prev, next) {
      logFlag(prev, next);
      if (prev >= 3 && next < 3) {
        const lap = port.leaderLap;
        otHoldLap = lap === null ? null : (lap | 0);
      }
    }

    function setEnabled(on) {
      enabled = !!on;
      port.writeCaution(enabled);
      if (!enabled) reset();
      return enabled;
    }

    function publish() {
      if (!port.networkActive() || !port.ownsRaceControl()) return;
      const key = caution.level + "|" + caution.sector + "|" + caution.cause + "|" + caution.phase +
        "|" + caution.total + "|" + (caution.sectors ? caution.sectors.join(",") : "");
      if (key === sent) return;
      sent = key;
      port.reportCaution({
        level: caution.level, sector: caution.sector, frac: caution.frac,
        cause: caution.cause, total: caution.total, sectors: caution.sectors,
        sinceT: caution.sinceT, phase: caution.phase,
      });
    }

    function dropToGreen() {
      const prev = caution.level;
      caution.level = 0; caution.sector = -1; caution.frac = 0;
      caution.cause = ""; caution.sinceT = 0; caution.phase = "";
      flagAgeT = 0; flagPeak = 0;
      stopOwned = false;
      flag(prev, 0);
    }


    function capDropIfExpired() {
      if (caution.level === 0 || caution.level === 4) return false;
      const cap = Math.max(flagPeak, caution.level) >= 2 ? SC_MAX : YELLOW_MAX;
      if (Math.max(flagAgeT, caution.sinceT) < cap) return false;
      capHoldLevel = Math.max(flagPeak, caution.level);
      dropToGreen();
      capHoldT = CAP_REARM_HOLD;
      publish();
      return true;
    }

    let _s8Done = null;
    function update(dt) {
      const stamp = port._s8Stamp;
      if (stamp != null && stamp === _s8Done) return;
      if (stamp != null) _s8Done = stamp;
      if (typeof port.playerWait === "function") port.playerWait();
      if ((port.state !== "race" && !(replayOwned && port.state === "count")) || port.timeTrial || port.session === "quali") {
        if (caution.level !== 0 || capHoldT || replayOwned) reset();
        lowGripNoted = false;
        return;
      }
      if (replayOwned) return;
      if (!lowGripNoted && lowGrip()) {
        lowGripNoted = port.announce("LOW GRIP — OVERTAKE OFF", 3, "warning") !== false;
        if (lowGripNoted) Log.info("race", "Overtake disabled why=low-grip raceT=" + (+port.raceT || 0).toFixed(1));
      }
      if (!port.ownsRaceControl()) return;
      if (enabled) stormTick();
      if (held > caution.level && caution.level !== 4) {
        const prev = caution.level;
        caution.level = held; caution.sector = -1; caution.frac = 0;
        caution.cause = heldCause; caution.sinceT = 0; caution.phase = "";
        episode(held);
        flag(prev, held);
        publish();
      }
      if (caution.level !== 0) { caution.sinceT += dt; flagAgeT += dt; }
      if (caution.level === 4) {
        caution.phase = caution.sinceT < RED_STOP ? "stopping" : "held";
        if (caution.sinceT >= RED_STOP + RED_HOLD) {
          restartWanted = true;
          capHoldLevel = 4; capHoldT = CAP_REARM_HOLD;
          dropToGreen();
        }
        publish();
        return;
      }
      if (!enabled) {
        if (!(held && caution.level <= held)) capDropIfExpired();
        return;
      }
      stopQueryT += dt;
      if (stopQueryT >= QUERY_EVERY) { stopQueryT -= QUERY_EVERY; stopPic = port.stopped ? port.stopped(QUERY_EVERY) : null; }
      const debrisOn = DebrisWorld.active();
      if (!debrisOn && !stopPic && !stopOwned) {
        if (!(held && caution.level <= held)) capDropIfExpired();
        return;
      }
      queryT += dt;
      if (queryT < QUERY_EVERY) return;
      queryT -= QUERY_EVERY;

      const hz = debrisOn ? DebrisWorld.hazards() : NO_HAZARDS;
      const redTotal = hz.redTotal == null ? hz.total : hz.redTotal;
      let desired = 0, dsector = -1, dfrac = 0, dcause = "";
      if (redTotal >= RED_MIN) { desired = 4; dcause = "RED FLAG"; }
      else if (hz.total >= SC_MIN) { desired = 3; dcause = "SAFETY CAR"; }
      else if (hz.total >= VSC_MIN) { desired = 2; dcause = "VSC"; }
      else if (hz.worst.count >= YELLOW_MIN) {
        desired = 1; dsector = hz.worst.sector; dfrac = hz.worst.frac; dcause = "YELLOW";
      }
      const fromStop = !!stopPic && stopPic.level > desired;
      if (fromStop) { desired = stopPic.level; dsector = stopPic.sector; dfrac = stopPic.frac; dcause = stopPic.cause; }
      caution.total = hz.total + (stopPic ? stopPic.n : 0);
      caution.sectors = hz.sectors.slice();
      if (desired === 4 && port.networkActive()) { desired = 3; dcause = "SAFETY CAR"; }

      if (held && desired < held) { desired = held; dsector = -1; dfrac = 0; dcause = heldCause; }
      if (!(held && caution.level <= held) && capDropIfExpired()) return;
      if (capHoldT > 0) {
        capHoldT = Math.max(0, capHoldT - QUERY_EVERY);
        if (capHoldT === 0) capHoldLevel = 0;
      }

      if (desired > caution.level) {
        if (capHoldT > 0 && desired <= capHoldLevel && desired !== held) { publish(); return; }
        const prev = caution.level;
        caution.level = desired; caution.sector = dsector; caution.frac = dfrac;
        caution.cause = dcause; caution.sinceT = 0;
        caution.phase = desired === 4 ? "stopping" : "";
        episode(desired);
        stopOwned = fromStop;
        flag(prev, desired);
      } else if (desired < caution.level) {
        if (caution.sinceT >= MIN_HOLD) {
          const prev = caution.level;
          caution.level = desired;
          if (desired !== 1) caution.sector = -1;
          else if (dsector >= 0) caution.sector = dsector;
          else if (hz.worst && hz.worst.sector >= 0) caution.sector = hz.worst.sector;
          else caution.sector = 0;
          caution.frac = dfrac; caution.cause = dcause; caution.sinceT = 0;
          stopOwned = fromStop && desired > 0;
          flag(prev, desired);
        }
      } else if (desired === 1 && dsector >= 0) {
        caution.sector = dsector; caution.frac = dfrac;
      }
      publish();
    }

    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    function apply(d) {
      if (!d || typeof d !== "object") return false;
      replayOwned = d.replay === true;
      const prev = caution.level;
      caution.level = Math.max(0, Math.min(4, d.level | 0));
      caution.sector = Number.isInteger(d.sector) && d.sector >= -1 ? d.sector : -1;
      caution.frac = num(d.frac);
      caution.cause = typeof d.cause === "string" ? d.cause.slice(0, 64) : "";
      caution.total = Math.max(0, num(d.total));
      if (Array.isArray(d.sectors)) caution.sectors = d.sectors.slice(0, 3).map(num);
      caution.sinceT = Math.max(0, num(d.sinceT));
      caution.phase = typeof d.phase === "string" ? d.phase.slice(0, 16) : "";
      if (caution.level === 0 || prev === 0) { flagAgeT = 0; flagPeak = 0; }
      if (caution.level > flagPeak) flagPeak = caution.level;
      flagAgeT = Math.max(flagAgeT, caution.sinceT);
      flag(prev, caution.level);
      return true;
    }

    function hold(level, cause) {
      scriptHeld = Math.max(0, Math.min(3, level | 0));
      scriptCause = scriptHeld ? (typeof cause === "string" && cause ? cause.slice(0, 64) : LABEL[scriptHeld]) : "";
      if (scriptHeld) Log.info("game", "RaceControl hold " + LABEL[scriptHeld] + " (" + scriptCause + ")");
      rehold();
      return scriptHeld;
    }
    function rehold() {
      const prevHeld = held;
      held = Math.max(scriptHeld, wxHeld);
      heldCause = !held ? "" : scriptHeld >= wxHeld ? scriptCause : "STORM";
      if (held < caution.level && caution.level <= prevHeld && caution.level < 4) {
        if (held === 0) dropToGreen();
        else {
          const prev = caution.level;
          caution.level = held; caution.sector = -1; caution.frac = 0;
          caution.cause = heldCause; caution.sinceT = 0; caution.phase = "";
          flag(prev, held);
        }
        publish();
      }
      return held;
    }

    function stormTick() {
      const S = typeof Storm !== "undefined" ? Storm : null;
      const t = typeof port.raceT === "number" && Number.isFinite(port.raceT) ? port.raceT : 0;
      if (stormSince != null && t < stormLastT - 0.5) stormSince -= stormLastT - t;
      stormLastT = t;
      if (!S || !S.is(port.raceWeather)) {
        if (stormSince != null) Log.info("race", "storm eased raceT=" + t.toFixed(1));
        stormSince = null;
        if (wxHeld) { wxHeld = 0; rehold(); port.announce("STORM EASING — SAFETY CAR IN THIS LAP", 3, "info"); }
        return;
      }
      if (stormSince == null) {
        stormSince = t; stormAtStart = t < 2;
        wxHeld = 3; rehold();
        Log.info("race", "storm SC deployed start=" + stormAtStart + " raceT=" + t.toFixed(1));
        port.announce(stormAtStart ? "STORM — START BEHIND THE SAFETY CAR" : "STORM — SAFETY CAR DEPLOYED", 3, "warning");
        return;
      }
      if (wxHeld && t - stormSince >= (stormAtStart ? S.SC_START_S : S.SC_ROLL_S)) {
        wxHeld = 0; rehold();
        Log.info("race", "storm SC in (visibility window over) raceT=" + t.toFixed(1));
      }
    }

    function takeRestart() { const r = restartWanted; restartWanted = false; return r; }

    function clearHold() { capHoldT = 0; capHoldLevel = 0; if (port.stoppedReset) port.stoppedReset(); stopQueryT = 0; stopPic = null; stopOwned = false; }
    function rewound() { if (otHoldLap != null) otHoldLap -= 1; }

    function lowGrip() {
      if (typeof TyreModel === "undefined" || port.raceWeather == null) return false;
      return TyreModel.treadFor(port.raceWeather, port.wetness()) > 0;
    }
    function otDetectOpen() { return caution.level < 3 && !lowGrip(); }
    function otEnabled() {
      if (caution.level >= 3 || lowGrip()) return false;
      const lap = port.leaderLap;
      if (!(lap > 1)) return false;
      return otHoldLap == null || lap > otHoldLap;
    }

    function info() {
      return {
        level: caution.level, label: LABEL[caution.level] || "GREEN",
        sector: caution.sector, frac: caution.frac, total: caution.total,
        sectors: caution.sectors, sinceT: +caution.sinceT.toFixed(2),
        cause: caution.cause, phase: caution.phase, enabled, lowGrip: lowGrip(),
      };
    }

    return {
      update, apply, reset, setEnabled, otEnabled, otDetectOpen, lowGrip, info, hold,
      get level() { return caution.level; },
      takeRestart, clearHold, rewound,
      get enabled() { return enabled; },
    };
  }
  const SC_PACE = 0.45, SC_CATCH = 0.6, SC_QUEUE_GAP = 1.0;
  const snapProg = (o) => (Number.isFinite(o._snapProg) ? o._snapProg : o.prog);
  const snapSpeed = (o) => (Number.isFinite(o._snapSpeed) ? o._snapSpeed : o.speed);
  const isOut = (o, skip) => o.finished || o.retired || (skip && skip(o));
  const RING_EPS = 1e-6;
  let ringCars = null, ringTotal = NaN, ringOk = false;
  const ring = [], ringKey = [];
  const lapPlace = (p, total) => ((p % total) + total) % total;
  function ringFor(cars, total) {
    if (cars !== ringCars) return false;
    if (ringTotal === total) return ringOk;
    ringTotal = total; ringOk = false; ring.length = 0; ringKey.length = 0;
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i], k = Number.isFinite(o._snapProg) ? lapPlace(o._snapProg, total) : NaN;
      if (!Number.isFinite(k)) return false;
      let j = ring.length;
      while (j > 0 && ringKey[j - 1] > k) { ring[j] = ring[j - 1]; ringKey[j] = ringKey[j - 1]; j--; }
      ring[j] = o; ringKey[j] = k;
    }
    return (ringOk = true);
  }
  function scQueueFrac(c, cars, total, leader, vTop, skip) {
    if (leader && isOut(leader, skip)) {
      leader = null;
      for (const o of cars) if (!isOut(o, skip) && (!leader || snapProg(o) > snapProg(leader))) leader = o;
    }
    if (!c || c === leader || !(total > 0)) return SC_PACE;
    let gap = Infinity;
    if (ringFor(cars, total)) {
      const n = ring.length, kc = lapPlace(c.prog, total), from = kc - RING_EPS;
      let lo = 0, hi = n;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ringKey[m] < from) lo = m + 1; else hi = m; }
      for (let m = 0; m < n; m++) {
        const j = lo + m < n ? lo + m : lo + m - n;
        const w = ringKey[j] - kc + (lo + m < n ? 0 : total);
        if (w - RING_EPS >= gap) break;
        const o = ring[j];
        if (o === c || isOut(o, skip)) continue;
        const d = ((snapProg(o) - c.prog) % total + total) % total;
        if (d > 0 && d < gap) gap = d;
      }
    } else {
      for (const o of cars) {
        if (o === c || isOut(o, skip)) continue;
        const d = ((snapProg(o) - c.prog) % total + total) % total;
        if (d > 0 && d < gap) gap = d;
      }
    }
    if (!Number.isFinite(gap)) return SC_PACE;
    const gapS = gap / Math.max(1, SC_PACE * vTop);
    const t = Math.min(1, Math.max(0, gapS - SC_QUEUE_GAP));
    return SC_PACE + (SC_CATCH - SC_PACE) * t;
  }

  const HOLD_M = 12;
  function holdCap(c, ranked, fair) {
    const i = !ranked ? -1 : ranked[c.rank - 1] === c ? c.rank - 1 : ranked.indexOf(c);
    for (let j = i - 1; j >= 0; j--) {
      const o = ranked[j];
      if (o.finished || o.retired || (fair && fair(o))) continue;
      const gap = snapProg(o) - c.prog;
      if (!(gap < HOLD_M)) return Infinity;
      return Math.max(0, (snapSpeed(o) || 0) * (gap < HOLD_M / 2 ? 0.9 : 1));
    }
    return Infinity;
  }

  return { create, finishDelay, finishPending, flagOut, beginLineStep, deferLine, settleLineStep, endLineStep, lineTransition, finishOrder, runOrder, classify, shortRun, scQueueFrac, holdCap };
})();
Object.freeze(RaceControl);
