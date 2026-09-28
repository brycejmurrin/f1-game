/* Apex 26 — REAL RACE (RealRace.create(G)) Replays a real Grand Prix from a timing script (js/data/real-race-tab.js builds one from OpenF1): the real grid, every AI car steered lap by lap to its real pace and gaps, its real stops and compounds, its retirement lap, the race's safety-car windows and its rain — with the player in one real driver's seat, from the start or dropped into any lap of the race as it stood. */
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
  // OpenF1 compound names -> js/physics/tyre-model.js AI_CLASS keys, and back.
  const COMPOUND = { SOFT: "soft", MEDIUM: "medium", HARD: "hard", INTERMEDIATE: "inter", WET: "wet" };
  const CLASSES = new Set(Object.keys(COMPOUND).map((k) => COMPOUND[k]));
  const DNS_AT = 0.002;   // a game seat with no real driver retires on the first metres: "did not start"
  const K_FALLBACK = 1.4;   // sim seconds per real second when no reference lap can be modelled (measured: this box runs ~1.5x real)
  const JUMP_SPEED = 0.55;  // of vTop(): the speed a car is dropped in at mid-race, below any corner it can meet
  const JUMP_MAX_WEAR = 0.9;   // a set older than its life is fitted worn, never past the cliff
  const RAIN_ARC_S = 60;    // s the sky takes to turn when the real race's rain starts or stops

  // ── Pure helpers (test-frozen in tests/unit/real-race.test.mjs) ──────────
  const clamp = M4.clamp;   // js/core/mat4.js — bound at eval (HARD_EDGES pair in tools/manifest.cjs)

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
    let best = Infinity;
    for (const d of drivers) {
      const row = new Array(laps + 1).fill(null);
      for (let lap = 1; lap <= laps; lap++) {
        const t = clean(d, lap);
        if (t == null || ref[lap] == null) continue;
        if (t < best) best = t;
        const r = t / ref[lap];
        row[lap] = r >= REL_MIN && r <= REL_MAX ? r : null;
      }
      rel[d.num] = row;
    }
    return { ref, rel, best: isFinite(best) ? best : 0 };
  }

  /** Cumulative real race time per driver per lap (index = laps completed; 0 at
   *  the start). A lap OpenF1 left untimed (a red-flag lap, a pit-lane quirk)
   *  for a driver who went on is filled with the field's median for that lap;
   *  the row ends only where the driver's race did — the last lap they are
   *  classified with, or the last lap they have a time for. */
  function cumTable(script) {
    const out = {};
    const ref = paceTable(script).ref;
    for (const d of script.drivers || []) {
      const laps = d.laps || [];
      let last = -1;
      for (let i = 0; i < laps.length; i++) if (laps[i] > 0) last = i;
      const end = Math.max(last + 1, Math.min(laps.length, d.dnf ? d.lapsDone | 0 : laps.length));
      const row = [0];
      let t = 0, fill = 0;
      for (let i = 0; i < laps.length; i++) if (laps[i] > 0) { fill = laps[i]; break; }
      for (let i = 0; i < end; i++) {
        const v = laps[i] > 0 ? laps[i] : (ref[i + 1] > 0 ? ref[i + 1] : fill);
        if (!(v > 0)) break;
        if (laps[i] > 0) fill = laps[i];
        t += v; row.push(t);
      }
      out[d.num] = row;
    }
    return out;
  }

  const classOf = (s) => (s ? COMPOUND[s.c] || (CLASSES.has(s.c) ? s.c : null) : null);

  /** The pit plan js/race/pit-lane.js executes for an AI car (think() reads
   *  stops/lapsAt/seq), cut from the real stints. Stop laps are the in-laps,
   *  mapped onto the sim distance and kept strictly increasing inside it. */
  function planFor(driver, simLaps, realLaps, pitLossLaps) {
    const stints = (driver.stints || []).filter(classOf);
    if (!stints.length) return null;
    const seq = [classOf(stints[0])];
    const lapsAt = [];
    for (let i = 1; i < stints.length; i++) {
      const inLap = simLapFor(stints[i].from - 1, simLaps, realLaps);
      const prev = lapsAt.length ? lapsAt[lapsAt.length - 1] : 0;
      // No stop on the last lap and never two in one lap: drop the stop, keep the compound sequence honest.
      if (inLap <= prev || inLap >= simLaps) continue;
      lapsAt.push(inLap); seq.push(classOf(stints[i]));
    }
    const stintLens = [];
    let prev = 0;
    for (const at of lapsAt) { stintLens.push(at - prev); prev = at; }
    stintLens.push(simLaps - prev);
    return { start: seq[0], seq, stints: stintLens, stops: lapsAt.length, lapsAt, cost: 0,
             pitLossLaps: pitLossLaps > 0 ? pitLossLaps : 0.18 };
  }

  /** The retirement fraction js/game.js checkRetirements reads: half a lap into the lap after the last one completed. */
  function dnfAtFor(driver, realLaps) {
    if (!driver || !driver.dnf || !(realLaps > 0)) return null;
    const done = Math.max(0, driver.lapsDone | 0);
    if (done >= realLaps) return null;   // saw the flag: a DSQ, or a car classified as running
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
      out.push({ level: Math.min(4, w.level | 0), from, to, cause: w.cause || (w.level >= 4 ? "RED FLAG" : w.level === 3 ? "SAFETY CAR" : "VSC"), done: false });
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

  /** The race as it stood at the START of real lap L — the instant the real
   *  leader completed lap L-1 (t0). Per driver: the lap in progress, how far
   *  round it the car was (by time, so a slow car is placed where it was, not
   *  where a fast one would be), the set on the car and its age, the stops
   *  made, or `retired` when the data ended before t0. Null at lap 1 (the grid). */
  function fieldAt(script, startLap) {
    const laps = script.laps | 0;
    const L = clamp(startLap | 0, 1, Math.max(1, laps));
    if (L <= 1) return null;
    const cum = cumTable(script);
    let t0 = Infinity;
    for (const d of script.drivers || []) { const row = cum[d.num]; if (row.length > L - 1 && row[L - 1] < t0) t0 = row[L - 1]; }
    if (!isFinite(t0)) return null;
    const by = {};
    for (const d of script.drivers || []) {
      const row = cum[d.num];
      let k = 0;
      while (k + 1 < row.length && row[k + 1] <= t0) k++;   // laps completed by t0
      // The car had stopped when its row ends before t0 (cumTable fills a
      // finisher's untimed laps, so a short row is a retirement, not a gap).
      const retired = row.length <= k + 1 || (d.dnf && k >= (d.lapsDone | 0));
      const dur = retired ? 0 : row[k + 1] - row[k];   // the lap in progress: its full duration
      const frac = retired ? 0 : clamp((t0 - row[k]) / dur, 0, 0.98);
      const lap = k + 1;
      let stint = 0;
      const stints = d.stints || [];
      for (let i = 0; i < stints.length; i++) if (stints[i].from <= lap) stint = i;
      const s = stints[stint];
      const age = s ? Math.max(0, lap - s.from) + (s.age | 0) : 0;
      by[d.num] = { lap, frac, retired, stint, compound: classOf(s), age, into: retired ? 0 : t0 - row[k] };
    }
    return { lap: L, t0, by };
  }

  /** The closed loop: the multiplier the car runs next lap. `err` is the
   *  sim gap minus the scaled real gap (positive = further back than it
   *  should be), `lapS` the sim lap the reference car runs, `rel` the real
   *  relative pace. */
  function paceMul(err, lapS, rel) {
    const open = rel > 0 ? 1 / rel : 1;
    const corr = lapS > 0 && Number.isFinite(err) ? 1 + KP * err / lapS : 1;
    return clamp(open * corr, MUL_MIN, MUL_MAX);
  }

  let live = null;   // the instance game.js created — the hub and the dev hooks reach it through the statics below

  function create(G) {
    Log.info("game", "RealRace.create");
    let active = null;    // {script, laps, startLap, seat, seatMap, saved}
    let armed = false, placed = false;
    let field = null;     // Map car -> {d, lap, mul, err, base}
    let tables = null;    // {pace, cum, refNum, wins, at}
    let K = 0;            // sim seconds per real second, measured off the reference car
    let heldLevel = 0;
    let redFired = new Set();
    let simRef = [];      // sim race time of the reference car at each completed lap
    let rainWant = null;  // the weather the script last asked for (mid-race rain)
    const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };   // a reusable Tracks.sample slot

    function stage(script, opts = {}) {
      if (!script || !Array.isArray(script.drivers) || !script.drivers.length) return null;
      const idx = Tracks.LIST.findIndex((t) => t.id === script.trackId);
      if (idx < 0) { Log.warn("game", "RealRace.stage: no circuit for " + script.trackId); return null; }
      const laps = clamp(opts.laps | 0 || script.laps | 0, 1, 99);
      // The seat: a real driver's code -> the roster seat mapField gives it. A
      // driver with no seat is refused rather than seated in someone else's car.
      const seatMap = mapField(script, Teams.LIST);
      const want = opts.seat ? script.drivers.find((d) => d.code === opts.seat) : script.drivers.find((d) => seatMap.some((s) => s.num === d.num));
      const seat = want && seatMap.find((s) => s.num === want.num);
      if (!seat) { Log.warn("game", "RealRace.stage: no roster seat for " + (opts.seat || "the field")); return null; }
      const ti = Teams.LIST.findIndex((t) => t.id === seat.teamId);
      const startLap = clamp(opts.startLap | 0 || 1, 1, script.laps | 0 || 1);
      if (!active) {
        active = { saved: { teamIdx: G.teamIdx, driverIdx: G.driverIdx, raceLaps: G.raceLaps, raceWeather: G.raceWeather,
                            raceTimeOfDay: G.raceTimeOfDay, duel: G.duel, raceTyreWear: G.raceTyreWear, raceChangeable: G.raceChangeable,
                            trackIdx: G.trackIdx, flow: G.flow } };
      }
      active.script = script; active.laps = laps; active.startLap = startLap; active.seat = seat; active.seatCode = want.code; active.seatMap = seatMap;
      G.flow = "gp"; G.session = "race"; G.timeTrial = false; G.duel = false;
      G.trackIdx = idx;
      G.teamIdx = ti; G.driverIdx = seat.di;
      G.raceLaps = laps;
      G.raceWeather = weatherAt(script, startLap);
      G.raceTimeOfDay = script.tod || "default";
      G.raceChangeable = false;
      if (G.raceTyreWear === "off") G.raceTyreWear = "real";   // the stops are the story
      if (G.resetRaceDraft) G.resetRaceDraft();
      armed = false; placed = false;
      Log.info("game", "RealRace.stage " + script.name + " " + script.trackId + " laps=" + laps + "/" + script.laps + " from=" + startLap + " seat=" + want.code);
      return { trackId: script.trackId, laps, seat: want.code, startLap };
    }

    /** The chip for a real lap: the rain flags when the script has them (lap by lap), else the race's one weather. */
    function weatherAt(script, realLap) {
      const rain = Array.isArray(script.rain) && script.rain.some(Boolean) ? script.rain : null;
      if (!rain) return script.weather || "dry";
      return rain[realLap] ? "rain" : "dry";
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
      G.trackIdx = s.trackIdx; if (s.flow && G.flow !== s.flow) G.flow = s.flow;
      disarm();
      active = null;
      Log.info("game", "RealRace.stop");
    }

    function disarm() {
      if (heldLevel && G.holdCaution) G.holdCaution(0);
      heldLevel = 0; armed = false; placed = false; field = null; tables = null; K = 0; simRef = []; redFired = new Set(); rainWant = null;
    }

    // The first frame of the countdown: the field is gridded and armed (the
    // game's own grid, plans and reliability draws ran in startRaceBody), so
    // everything scripted is laid over it here — one re-grid, no RNG draw.
    function arm() {
      const script = active.script, cars = G.cars;
      const realLaps = script.laps | 0, simLaps = active.laps;
      const byId = new Map(active.seatMap.map((s) => [s.driverId, s]));
      const byNum = new Map(script.drivers.map((d) => [d.num, d]));
      field = new Map();
      for (const c of cars) {
        const s = byId.get(c.driverId);
        const d = s ? byNum.get(s.num) : null;
        field.set(c, { d, lap: 0, mul: 1, err: 0, base: c.skill });
      }
      const gridOf = (c) => { const f = field.get(c); return f.d && f.d.grid > 0 ? f.d.grid : 99; };
      const order = cars.slice().sort((a, b) => gridOf(a) - gridOf(b));
      // A RESTART from the results re-enters here with the sky wherever a rain
      // arc left it: the start lap's weather is the script's, not the last frame's.
      const wx = weatherAt(script, active.startLap);
      if (G.raceWeather !== wx && G.setWeatherLive) G.setWeatherLive(wx);
      G.gridUp(order);
      if (G.snapGameCam) G.snapGameCam();
      // Pace: one base for the whole field; the data supplies the differences.
      const ai = cars.filter((c) => !c.human);
      const base = ai.length ? ai.reduce((s, c) => s + c.tierV * c.skill, 0) / ai.length : 1;
      const tierV = ai.length ? ai.reduce((s, c) => s + c.tierV, 0) / ai.length : 1;
      const cum = cumTable(script);
      // ONE reference car for the whole race: the AI seat whose real data runs
      // longest (a finisher, best classified first). Its crossings pin K; every
      // gap is measured against it, so a lap-by-lap change of leader cannot
      // shift the target the field is chasing.
      let refNum = null, refLen = -1, refPos = Infinity;
      for (const c of ai) {
        const f = field.get(c);
        const row = f.d && cum[f.d.num];
        if (!row) continue;
        const pos = f.d.pos != null ? f.d.pos : Infinity;
        if (row.length > refLen || (row.length === refLen && pos < refPos)) { refLen = row.length; refPos = pos; refNum = f.d.num; }
      }
      tables = { pace: paceTable(script), cum, refNum, wins: cautionsFor(script, simLaps), at: fieldAt(script, active.startLap) };
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
            refit(c, plan.start, 1);
          }
        }
      }
      armed = true;
      if (G.announce) G.announce("REAL RACE · " + String(script.name || script.circuit || "").toUpperCase() + (active.startLap > 1 ? " · LAP " + active.startLap : ""), 2.5, "info");
      Log.info("game", "RealRace.arm field=" + field.size + " mapped=" + byId.size + " ref=" + refNum + " from=" + active.startLap);
    }

    // The real set on the car, in place of the one gridUp fitted: one entry in
    // the stint log (the results strip draws it), never a phantom lap-0 stint.
    function refit(c, cls, stints) {
      if (!cls || !G.tyres.classRecord || !G.tyres.fit) return;
      G.tyres.fit(c, G.tyres.classRecord(cls));
      if (Array.isArray(c.tyreLog) && c.tyreLog.length) { c.tyreLog = c.tyreLog.slice(-1); c.tyreLog[0].lap0 = c.lap || 0; c.tyreLog[0].lap1 = null; }
      c.tyreStints = stints;
    }

    // A car dropped in mid-race: js/agent/apex.js aiPlace()/jump() field for
    // field, minus the agent-view anchors (the render anchors are set here).
    function placeCar(c, s, x, speed) {
      const track = G.track;
      c.s = G.wrapS(s); c.x = x; c.xVis = x; c.speed = speed;
      Tracks.sample(track, c.s, smp);
      const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;
      c.px = smp.p[0] + smp.r[0] / rl * c.x; c.pz = smp.p[2] + smp.r[2] / rl * c.x;
      c.head = Math.atan2(smp.t[0], smp.t[2]);
      c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevHead = c.head; c.rPrevYawVis = 0;
      c.vLat = 0; c.yawRateCur = 0; c.yawVis = 0; c.steerVis = 0;
      c.rescueT = 0; c.wallT = 0; c.wasOnWall = false; c.wrongT = 0; c.wrongWay = false; c.offT = 0;
    }
    // A car that had already retired: parked at the wall the way js/game.js
    // retireCar() parks one, without the broadcast (seven of them at once said nothing).
    function parkCar(c, why, lap) {
      const track = G.track;
      c.retired = true; c.dnf = why || "accident"; c.dnfAt = null;
      // Where it stopped: half way round the lap it was on, so the retirements
      // classify in the order they happened and line the wall out on the circuit.
      if (lap > 0) { c.lap = lap; c.s = G.wrapS(0.5 * track.total); c.prog = (lap - 1) * track.total + 0.5 * track.total; }
      Tracks.sample(track, c.s, smp);
      const side = c.x >= 0 ? 1 : -1;
      const wall = Tracks.wallAt(track, c.s, side);
      placeCar(c, c.s, side * clamp(Math.max(smp.hw * 0.85, wall - 1.6), 0, Math.max(0, wall - 0.6)), 0);
      c.gear = 1; c.boostOn = false; c.deploying = false; c.otT = 0;
    }

    // The first GREEN frame of a mid-race jump-in: every car goes to where it
    // was at the start of the chosen real lap, on the set it had, with the
    // race clock and the director's reference seeded to that instant.
    function place() {
      const script = active.script, at = tables.at;
      const realLaps = script.laps | 0, simLaps = active.laps, total = G.track.total;
      const pole = G.referencePole ? G.referencePole() : 0;
      const K0 = pole > 0 && tables.pace.best > 0 ? pole / tables.pace.best : K_FALLBACK;
      K = K0;
      const Ls = simLapFor(at.lap, simLaps, realLaps);
      const refRow = tables.cum[tables.refNum] || [];
      for (let n = 1; n < Ls; n++) { const rl = realLapFor(n, simLaps, realLaps); if (refRow[rl] != null) simRef[n] = K0 * refRow[rl]; }
      G.raceT = K0 * at.t0;
      const wearOn = G.tyres && G.tyres.on && G.tyres.on();
      const speed = JUMP_SPEED * (G.vTop ? G.vTop() : 80);
      let side = 0, parked = 0, dropped = 0;
      for (const c of G.cars) {
        const f = field.get(c);
        const a = f && f.d ? at.by[f.d.num] : null;
        if (!a) { if (!c.human) { parkCar(c, "dns", 0); parked++; } continue; }
        if (a.retired) { parkCar(c, "accident", simLapFor(a.lap, simLaps, realLaps)); parked++; f.lap = c.lap; continue; }
        const ls = simLapFor(a.lap, simLaps, realLaps);
        const s = a.frac * total;
        c.lap = ls; c.prog = (ls - 1) * total + s;
        c.fuelLap = ls;   // crossings driven: the tank is ls - 1 laps down (js/physics/tyre-model.js fuelFrac)
        c.totalT = K0 * at.t0; c.lapTime = K0 * a.into;
        placeCar(c, s, (side++ % 2 ? 1.5 : -1.5), speed);
        c.gear = 5; c.energy = 0.7;
        if (wearOn && a.compound) {
          // The plan's arrays hold only the stops that fit the sim distance, so
          // the stops "made" are the kept stops before this lap — never the real
          // stint index, which the dropped stops would put out of step.
          const made = c.pitPlan && Array.isArray(c.pitPlan.lapsAt) ? c.pitPlan.lapsAt.filter((l) => l < ls).length : a.stint;
          refit(c, a.compound, made + 1);
          c.pitStops = made;
          const ageSim = a.age * simLaps / realLaps;
          const life = typeof TyreModel !== "undefined" && TyreModel.AI_CLASS[a.compound] && G.tyres.planLaps
            ? G.tyres.planLaps(TyreModel.AI_CLASS[a.compound].life, simLaps) : 0;
          if (life > 0) c.tyreWear = clamp(ageSim / life, 0, JUMP_MAX_WEAR);
          c.tyreLap0 = ls - Math.round(ageSim);
        }
        f.lap = c.lap; dropped++;
      }
      if (G.snapGameCam) G.snapGameCam();
      if (G.refreshHud) G.refreshHud(true);
      placed = true;
      Log.info("game", "RealRace.place lap=" + at.lap + " simLap=" + Ls + " K0=" + K0.toFixed(3) + " t0=" + at.t0.toFixed(1) + " dropped=" + dropped + " parked=" + parked);
    }

    function tickPace() {
      const realLaps = active.script.laps | 0, simLaps = active.laps;
      const { pace, cum, refNum } = tables;
      const refCum = refNum != null ? cum[refNum] : null;
      for (const c of G.cars) {
        const f = field.get(c);
        if (!f || c.human || !f.d || c.retired || c.finished) continue;
        if (c.lap === f.lap) continue;
        // A red-flag restart rewinds the lap counter: nothing to measure, just follow it.
        if (c.lap < f.lap) { f.lap = c.lap; continue; }
        f.lap = c.lap;
        const done = c.lap - 1;   // laps completed at this crossing
        if (done < 1) continue;
        const rl = realLapFor(done, simLaps, realLaps);
        const realCum = cum[f.d.num];
        // The reference car's own FIRST crossing of a lap pins the scale: sim seconds per real second.
        if (refNum === f.d.num && refCum && refCum[rl] > 0 && simRef[done] == null) { simRef[done] = c.totalT; K = c.totalT / refCum[rl]; }
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
        // The gain is per SIM lap: K carries the distance compression (a tenth-
        // distance race pins K at a tenth of the full-race value), so the real
        // reference lap is scaled back up to the sim lap it stands for.
        const lapS = K > 0 && pace.ref[rl] > 0 ? K * pace.ref[rl] * realLaps / simLaps : (c.lastLap > 0 ? c.lastLap : 0);
        f.err = err;
        f.mul = paceMul(err, lapS, rel);
        c.skill = f.base * f.mul;
      }
    }

    // The leader's lap is the highest lap any running car is on (ranked[] is by progress, which a red-flag re-grid rewinds).
    function leaderLap() {
      let lap = 0;
      for (const c of G.cars) if (!c.retired && (c.lap | 0) > lap) lap = c.lap | 0;
      return lap;
    }

    function tickCautions(lap) {
      const wins = tables.wins;
      if (!wins.length) return;
      let want = 0, cause = "";
      for (const w of wins) {
        if (w.done) continue;
        if (lap > w.to) { w.done = true; continue; }   // left behind: a red-flag rewind of the lap counter must not fly it again
        if (lap < w.from) continue;
        if (w.level >= 4) {
          const key = w.from;
          if (!redFired.has(key) && G.applyCaution) { redFired.add(key); G.applyCaution({ level: 4, cause: w.cause, phase: "stopping" }); }
          continue;
        }
        if (w.level > want) { want = w.level; cause = w.cause; }
      }
      if (want !== heldLevel && G.holdCaution) { G.holdCaution(want, cause); heldLevel = want; }
    }

    // Rain that started or stopped in the real race turns the sky here over an arc.
    function tickWeather(lap) {
      const script = active.script;
      if (!Array.isArray(script.rain) || !script.rain.some(Boolean) || lap < 1) return;
      const want = weatherAt(script, realLapFor(lap, active.laps, script.laps | 0));
      if (want === rainWant) return;
      rainWant = want;
      if (G.raceWeather !== want && G.startWeatherArc) G.startWeatherArc(G.raceWeather, want, RAIN_ARC_S);
    }

    function update(dt) {
      if (!active) return;
      const st = G.state;
      if (st === "menu" || st === "results") { if (armed) disarm(); return; }
      if (!armed) { if ((st === "count" || st === "race") && G.cars && G.cars.length && G.track) arm(); return; }
      if (st !== "race") return;
      if (!placed) { placed = true; if (tables.at) place(); }
      tickPace();
      const lap = leaderLap();
      tickCautions(lap);
      tickWeather(lap);
    }

    function status() {
      if (!active) return { active: false };
      const cars = [];
      if (field) for (const [c, f] of field) cars.push({ code: c.code, num: f.d ? f.d.num : null, human: !!c.human, grid: c.gridPos, lap: c.lap, retired: !!c.retired,
        s: c.s != null ? +c.s.toFixed(1) : null, mul: +f.mul.toFixed(4), err: +f.err.toFixed(2), dnfAt: c.dnfAt, stops: c.pitPlan ? c.pitPlan.lapsAt : null,
        start: c.pitPlan ? c.pitPlan.start : null, tyre: c.tyre ? c.tyre.cls || c.tyre.code || null : null, wear: c.tyreWear != null ? +c.tyreWear.toFixed(3) : null, pitStops: c.pitStops | 0 });
      return { active: true, armed, placed, name: active.script.name, trackId: active.script.trackId, laps: active.laps, realLaps: active.script.laps,
               startLap: active.startLap, seat: active.seatCode, K: +K.toFixed(4), caution: heldLevel, weather: rainWant, cars };
    }

    live = { stage, launch, stop, update, status, isActive: () => !!active, current: () => active && active.script };
    return live;
  }

  // Call-time delegates for code with no G (js/data/real-race-tab.js, page probes).
  const launch = (script, opts) => (live ? live.launch(script, opts) : null);
  const status = () => (live ? live.status() : { active: false });

  return { create, launch, status, realLapFor, simLapFor, paceTable, cumTable, planFor, dnfAtFor, cautionsFor, mapField, fieldAt, paceMul, COMPOUND, KP, MUL_MIN, MUL_MAX };
})();
Object.freeze(RealRace);
