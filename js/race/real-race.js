/* Apex 26 — REAL RACE (RealRace.create(G)) Replays a real Grand Prix from a timing script (js/data/real-race-tab.js builds one from OpenF1): the real grid, every AI car steered lap by lap to its real pace and gaps, its real stops and compounds, its retirement lap and the race's safety-car windows — with the player in one real driver's seat. */
const RealRace = (function () {
  "use strict";

  // ── The pace director's constants ────────────────────────────────────────
  // Per lap, each AI car's skill scalar (corners AND straights — js/game.js
  // reads c.skill in both vmax and the brake target) is the field mean times a
  // multiplier: the real lap's pace RELATIVE to the field that lap (open loop),
  // corrected by how far the car's sim gap to the reference car has drifted
  // from its real gap (closed loop). KP is the share of that drift recovered
  // over the next lap; the clamp keeps a blocked car from becoming a rocket.
  const KP = 0.6;
  const MUL_MIN = 0.90, MUL_MAX = 1.10;
  const REL_MIN = 0.90, REL_MAX = 1.12;   // a real lap this far off the field median is a pit lap, a spin or a caution — neutral
  // OpenF1 compound names -> js/physics/tyre-model.js AI_CLASS keys.
  const COMPOUND = { SOFT: "soft", MEDIUM: "medium", HARD: "hard", INTERMEDIATE: "inter", WET: "wet" };
  const DNS_AT = 0.002;   // a game seat with no real driver retires on the first metres: "did not start"

  // ── Pure helpers (test-frozen in tests/unit/real-race.test.mjs) ──────────
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** The real lap a condensed sim lap stands for (both 1-based; identity when the distances match). */
  function realLapFor(simLap, simLaps, realLaps) {
    if (!(simLaps > 0) || !(realLaps > 0)) return simLap;
    return clamp(Math.round(simLap * realLaps / simLaps), 1, realLaps);
  }
  /** The sim lap a real lap lands on (rounded to nearest; never below 1 or above the distance). */
  function simLapFor(realLap, simLaps, realLaps) {
    if (!(simLaps > 0) || !(realLaps > 0)) return realLap;
    return clamp(Math.round(realLap * simLaps / realLaps), 1, simLaps);
  }

  /** Per real lap: the field's reference lap (median of clean laps) and each
   *  driver's pace relative to it (1.02 = two per cent slower). Null where the
   *  lap is missing, a pit in/out lap, or too far off to be a racing lap. */
  function paceTable(script) {
    const laps = script.laps | 0;
    const drivers = script.drivers || [];
    const pitLap = new Map();   // num -> Set of laps touched by a stop (in-lap and out-lap)
    for (const d of drivers) {
      const set = new Set();
      for (const p of d.pits || []) { set.add(p); set.add(p + 1); }
      pitLap.set(d.num, set);
    }
    const clean = (d, lap) => {
      const t = d.laps && d.laps[lap - 1];
      return t > 0 && !pitLap.get(d.num).has(lap) ? t : null;
    };
    const ref = new Array(laps + 1).fill(null);
    for (let lap = 1; lap <= laps; lap++) {
      const ts = [];
      for (const d of drivers) { const t = clean(d, lap); if (t != null) ts.push(t); }
      if (!ts.length) continue;
      ts.sort((a, b) => a - b);
      ref[lap] = ts.length % 2 ? ts[(ts.length - 1) >> 1] : (ts[ts.length / 2 - 1] + ts[ts.length / 2]) / 2;
    }
    const rel = {};
    for (const d of drivers) {
      const row = new Array(laps + 1).fill(null);
      for (let lap = 1; lap <= laps; lap++) {
        const t = clean(d, lap);
        if (t == null || ref[lap] == null) continue;
        const r = t / ref[lap];
        row[lap] = r >= REL_MIN && r <= REL_MAX ? r : null;
      }
      rel[d.num] = row;
    }
    return { ref, rel };
  }

  /** Cumulative real race time per driver per lap (index = laps completed; 0 at the start).
   *  A missing lap duration ends the row — nothing after it is trusted. */
  function cumTable(script) {
    const out = {};
    for (const d of script.drivers || []) {
      const row = [0];
      let t = 0;
      for (let i = 0; i < (d.laps || []).length; i++) {
        const v = d.laps[i];
        if (!(v > 0)) break;
        t += v; row.push(t);
      }
      out[d.num] = row;
    }
    return out;
  }

  /** The pit plan js/race/pit-lane.js executes for an AI car (think() reads
   *  stops/lapsAt/seq), cut from the real stints. Stop laps are the in-laps,
   *  mapped onto the sim distance and kept strictly increasing inside it. */
  function planFor(driver, simLaps, realLaps, pitLossLaps) {
    const stints = (driver.stints || []).filter((s) => s && COMPOUND[s.c] || (s && s.c in invertCompound()));
    if (!stints.length) return null;
    const cls = (s) => COMPOUND[s.c] || s.c;
    const seq = [cls(stints[0])];
    const lapsAt = [];
    for (let i = 1; i < stints.length; i++) {
      const inLap = simLapFor(stints[i].from - 1, simLaps, realLaps);
      const prev = lapsAt.length ? lapsAt[lapsAt.length - 1] : 0;
      // No stop on the last lap and never two in one lap: drop the stop, keep the compound sequence honest.
      if (inLap <= prev || inLap >= simLaps) continue;
      lapsAt.push(inLap); seq.push(cls(stints[i]));
    }
    const stintLens = [];
    let prev = 0;
    for (const at of lapsAt) { stintLens.push(at - prev); prev = at; }
    stintLens.push(simLaps - prev);
    return { start: seq[0], seq, stints: stintLens, stops: lapsAt.length, lapsAt, cost: 0,
             pitLossLaps: pitLossLaps > 0 ? pitLossLaps : 0.18, real: true };
  }
  function invertCompound() { const o = {}; for (const k in COMPOUND) o[COMPOUND[k]] = k; return o; }

  /** The retirement fraction js/game.js checkRetirements reads: half a lap into the lap after the last one completed. */
  function dnfAtFor(driver, realLaps) {
    if (!driver || !driver.dnf || !(realLaps > 0)) return null;
    const done = Math.max(0, driver.lapsDone | 0);
    return clamp((done + 0.5) / realLaps, 0.001, 0.999);
  }

  /** Safety-car / VSC / red windows on the sim's lap axis (leader's lap, inclusive). */
  function cautionsFor(script, simLaps) {
    const realLaps = script.laps | 0;
    const out = [];
    for (const w of script.cautions || []) {
      if (!w || !(w.level >= 2)) continue;
      const from = simLapFor(w.from, simLaps, realLaps);
      const to = Math.max(from, simLapFor(w.to != null ? w.to : w.from, simLaps, realLaps));
      out.push({ level: Math.min(4, w.level | 0), from, to, cause: w.cause || (w.level >= 4 ? "RED FLAG" : w.level === 3 ? "SAFETY CAR" : "VSC") });
    }
    return out;
  }

  /** Which game seat each real driver takes: by driver code first, then any
   *  free seat of the real driver's team. Returns [{driverId, num}] for every
   *  seat that has a real driver; a seat left out has none (did not start). */
  function mapField(script, teams) {
    const list = Array.isArray(teams) ? teams : [];
    const seats = [];   // {driverId, teamId, di, code, num: null}
    for (const t of list) {
      if (!t || !t.drivers || t.custom || t.legends) continue;
      t.drivers.forEach((d, di) => seats.push({ driverId: t.id + ":" + di, teamId: t.id, di, code: d.code, num: null }));
    }
    const byCode = new Map(seats.map((s) => [s.code, s]));
    const pending = [];
    for (const d of script.drivers || []) {
      const s = byCode.get(d.code);
      if (s && s.num == null) s.num = d.num; else pending.push(d);
    }
    for (const d of pending) {
      const free = seats.find((s) => s.num == null && d.teamId && s.teamId === d.teamId);
      if (free) free.num = d.num;
    }
    return seats.filter((s) => s.num != null).map((s) => ({ driverId: s.driverId, num: s.num, teamId: s.teamId, di: s.di }));
  }

  /** The closed loop: the multiplier the car runs next lap. `err` is the
   *  sim gap minus the scaled real gap (positive = further back than it
   *  should be), `lapS` the reference sim lap, `rel` the real relative pace. */
  function paceMul(err, lapS, rel) {
    const open = rel > 0 ? 1 / rel : 1;
    const corr = lapS > 0 && Number.isFinite(err) ? 1 + KP * err / lapS : 1;
    return clamp(open * corr, MUL_MIN, MUL_MAX);
  }

  let live = null;   // the instance game.js created — the hub and the dev hooks reach it through the statics below

  function create(G) {
    Log.info("game", "RealRace.create");
    let active = null;    // {script, laps, seat, saved}
    let armed = false;
    let field = null;     // Map car -> {d, ps}
    let tables = null;    // {pace, cum, refNum[]}
    let K = 0;            // sim seconds per real second, measured off the reference car
    let heldLevel = 0;
    let redFired = new Set();
    let simRef = [];      // sim race time of the reference car at each completed lap

    function stage(script, opts = {}) {
      if (!script || !Array.isArray(script.drivers) || !script.drivers.length) return null;
      const idx = Tracks.LIST.findIndex((t) => t.id === script.trackId);
      if (idx < 0) { Log.warn("game", "RealRace.stage: no circuit for " + script.trackId); return null; }
      const laps = clamp(opts.laps | 0 || script.laps | 0, 1, 99);
      // The seat: a real driver's code -> the roster seat mapField gives it.
      const seatMap = mapField(script, Teams.LIST);
      const want = script.drivers.find((d) => d.code === opts.seat) || script.drivers[0];
      const seat = seatMap.find((s) => s.num === want.num) || seatMap[0];
      if (!seat) { Log.warn("game", "RealRace.stage: no roster seat for the field"); return null; }
      const ti = Teams.LIST.findIndex((t) => t.id === seat.teamId);
      if (!active) {
        active = { saved: { teamIdx: G.teamIdx, driverIdx: G.driverIdx, raceLaps: G.raceLaps, raceWeather: G.raceWeather,
                            raceTimeOfDay: G.raceTimeOfDay, duel: G.duel, raceTyreWear: G.raceTyreWear, raceChangeable: G.raceChangeable } };
      }
      active.script = script; active.laps = laps; active.seat = seat; active.seatCode = want.code;
      G.flow = "gp"; G.session = "race"; G.timeTrial = false; G.duel = false;
      G.trackIdx = idx;
      G.teamIdx = ti; G.driverIdx = seat.di;
      G.raceLaps = laps;
      G.raceWeather = script.weather || "dry";
      G.raceTimeOfDay = script.tod || "default";
      G.raceChangeable = false;
      if (G.raceTyreWear === "off") G.raceTyreWear = "real";   // the stops are the story
      if (G.resetRaceDraft) G.resetRaceDraft();
      armed = false;
      Log.info("game", "RealRace.stage " + script.name + " " + script.trackId + " laps=" + laps + "/" + script.laps + " seat=" + want.code);
      return { trackId: script.trackId, laps, seat: want.code };
    }

    function launch(script, opts) {
      const p = stage(script, opts);
      if (!p) return null;
      G.startRace();
      return p;
    }

    function stop() {
      if (!active) return;
      const s = active.saved;
      G.teamIdx = s.teamIdx; G.driverIdx = s.driverIdx; G.raceLaps = s.raceLaps;
      G.raceWeather = s.raceWeather; G.raceTimeOfDay = s.raceTimeOfDay; G.duel = s.duel;
      G.raceTyreWear = s.raceTyreWear; G.raceChangeable = s.raceChangeable;
      disarm();
      active = null;
      Log.info("game", "RealRace.stop");
    }

    function disarm() {
      if (heldLevel && G.holdCaution) G.holdCaution(0);
      heldLevel = 0; armed = false; field = null; tables = null; K = 0; simRef = []; redFired = new Set();
    }

    // The first frame of the countdown: the field is gridded and armed (the
    // game's own grid, plans and reliability draws ran in startRaceBody), so
    // everything scripted is laid over it here — one re-grid, no RNG draw.
    function arm() {
      const script = active.script, cars = G.cars;
      const realLaps = script.laps | 0, simLaps = active.laps;
      const byId = new Map(mapField(script, Teams.LIST).map((s) => [s.driverId, s]));
      const byNum = new Map(script.drivers.map((d) => [d.num, d]));
      field = new Map();
      for (const c of cars) {
        const s = byId.get(c.driverId);
        const d = s ? byNum.get(s.num) : null;
        field.set(c, { d, lap: 0, cum: [0], mul: 1, err: 0 });
      }
      const gridOf = (c) => { const f = field.get(c); return f.d && f.d.grid > 0 ? f.d.grid : 99; };
      const order = cars.slice().sort((a, b) => gridOf(a) - gridOf(b));
      G.gridUp(order);
      if (G.snapGameCam) G.snapGameCam();
      // Pace: one base for the whole field; the data supplies the differences.
      const ai = cars.filter((c) => !c.human);
      const base = ai.length ? ai.reduce((s, c) => s + c.tierV * c.skill, 0) / ai.length : 1;
      const tierV = ai.length ? ai.reduce((s, c) => s + c.tierV, 0) / ai.length : 1;
      tables = { pace: paceTable(script), cum: cumTable(script), refNum: [] };
      // The reference car per real lap: the real leader at that lap among the AI seats.
      for (let lap = 1; lap <= realLaps; lap++) {
        let best = null, bestT = Infinity;
        for (const c of ai) {
          const f = field.get(c);
          const row = f.d && tables.cum[f.d.num];
          if (row && row.length > lap && row[lap] < bestT) { bestT = row[lap]; best = f.d.num; }
        }
        tables.refNum[lap] = best;
      }
      const wearOn = G.tyres && G.tyres.on && G.tyres.on();
      for (const c of cars) {
        const f = field.get(c);
        if (!c.human) {
          c.tierV = tierV; c.skill = base / tierV; f.base = c.skill;
          c.dnfAt = f.d ? dnfAtFor(f.d, realLaps) : DNS_AT;
          c.dnfWhy = f.d ? "accident" : "dns";
        }
        if (!f.d) continue;
        if (wearOn) {
          const plan = planFor(f.d, simLaps, realLaps, c.pitPlan && c.pitPlan.pitLossLaps);
          if (plan) {
            c.pitPlan = plan;
            if (!c.human) c.tyreClass = plan.start;
            if (G.tyres.classRecord && G.tyres.fit) G.tyres.fit(c, G.tyres.classRecord(plan.start));
          }
        }
      }
      armed = true;
      if (G.announce) G.announce("REAL RACE · " + String(script.name || script.circuit || "").toUpperCase(), 2.5, "info");
      Log.info("game", "RealRace.arm field=" + field.size + " mapped=" + byId.size + " ref@1=" + tables.refNum[1]);
    }

    function tickPace() {
      const realLaps = active.script.laps | 0, simLaps = active.laps;
      const { pace, cum, refNum } = tables;
      for (const c of G.cars) {
        const f = field.get(c);
        if (!f || c.human || !f.d || c.retired || c.finished) continue;
        if (c.lap === f.lap) continue;
        f.lap = c.lap;
        const done = c.lap - 1;   // laps completed at this crossing
        if (done < 1) continue;
        f.cum[done] = c.totalT;
        const rl = realLapFor(done, simLaps, realLaps);
        const refN = refNum[rl];
        const realCum = cum[f.d.num];
        const refCum = refN != null ? cum[refN] : null;
        // The reference car's own crossing pins the scale: sim seconds per real second at this lap.
        if (refN === f.d.num && refCum && refCum[rl] > 0) { simRef[done] = c.totalT; K = c.totalT / refCum[rl]; }
        let err = 0;
        if (refCum && realCum && realCum.length > rl && refCum.length > rl && done >= 2) {
          let sRef = simRef[done];
          if (sRef == null && simRef[done - 1] != null && K > 0) {
            // Ahead of the reference car on the road: extrapolate its crossing from the last one.
            const rlPrev = realLapFor(done - 1, simLaps, realLaps);
            sRef = simRef[done - 1] + K * (refCum[rl] - refCum[rlPrev]);
          }
          if (sRef != null && K > 0) err = (c.totalT - sRef) - K * (realCum[rl] - refCum[rl]);
        }
        const relRow = pace.rel[f.d.num];
        const rlNext = realLapFor(c.lap, simLaps, realLaps);
        const rel = relRow && relRow[rlNext] != null ? relRow[rlNext] : 1;
        const lapS = K > 0 && pace.ref[rl] > 0 ? K * pace.ref[rl] : (c.lastLap > 0 ? c.lastLap : 0);
        f.err = err;
        f.mul = paceMul(err, lapS, rel);
        c.skill = f.base * f.mul;
      }
    }

    function tickCautions() {
      const wins = cautionsFor(active.script, active.laps);
      if (!wins.length) return;
      // The leader's lap is the highest lap any running car is on (ranked[] is by progress, which a red-flag re-grid rewinds).
      let lap = 0;
      for (const c of G.cars) if (!c.retired && (c.lap | 0) > lap) lap = c.lap | 0;
      let want = 0, cause = "";
      for (const w of wins) {
        if (lap < w.from || lap > w.to) continue;
        if (w.level >= 4) {
          const key = w.from;
          if (!redFired.has(key) && G.applyCaution) { redFired.add(key); G.applyCaution({ level: 4, cause: w.cause, phase: "stopping" }); }
          continue;
        }
        if (w.level > want) { want = w.level; cause = w.cause; }
      }
      if (want !== heldLevel && G.holdCaution) { G.holdCaution(want, cause); heldLevel = want; }
    }

    function update(dt) {
      if (!active) return;
      const st = G.state;
      if (st === "menu" || st === "results") { if (armed) disarm(); return; }
      if (!armed) { if ((st === "count" || st === "race") && G.cars && G.cars.length) arm(); return; }
      if (st !== "race") return;
      tickPace();
      tickCautions();
    }

    function status() {
      if (!active) return { active: false };
      const cars = [];
      if (field) for (const [c, f] of field) cars.push({ code: c.code, num: f.d ? f.d.num : null, human: !!c.human, grid: c.gridPos, lap: c.lap, mul: +f.mul.toFixed(4), err: +f.err.toFixed(2), dnfAt: c.dnfAt, stops: c.pitPlan ? c.pitPlan.lapsAt : null, start: c.pitPlan ? c.pitPlan.start : null });
      return { active: true, armed, name: active.script.name, trackId: active.script.trackId, laps: active.laps, realLaps: active.script.laps,
               seat: active.seatCode, K: +K.toFixed(4), caution: heldLevel, cars };
    }

    live = { stage, launch, stop, update, status, isActive: () => !!active, current: () => active && active.script };
    return live;
  }

  // Call-time delegates for code with no G (js/data/real-race-tab.js, page probes).
  const launch = (script, opts) => (live ? live.launch(script, opts) : null);
  const status = () => (live ? live.status() : { active: false });

  return { create, launch, status, realLapFor, simLapFor, paceTable, cumTable, planFor, dnfAtFor, cautionsFor, mapField, paceMul, COMPOUND, KP, MUL_MIN, MUL_MAX };
})();
Object.freeze(RealRace);
