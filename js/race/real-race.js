/* Apex 26 — REAL RACE (RealRace.create(G)) Replays a real Grand Prix from a timing script (js/data/real-race-tab.js builds one from OpenF1): the real grid, every AI car steered lap by lap to its real pace and gaps, its real stops and compounds, its retirement lap, the race's safety-car windows and its rain — with the player in one real driver's seat, from the start or dropped into any lap of the race as it stood — or WATCHED: with the real positions loaded the director hands the field to js/race/real-replay.js (every car where it really was, any lap, or the highlights cut together). */
const RealRace = (function () {
  "use strict";

  const DNS_AT = 0.002;   // a game seat with no real driver retires on the first metres: "did not start"
  // Watch mode (real-replay finish) and driven arm() share this reason so endRace
  // treats a script DSQ the same way (out of the timed order, last, no points).
  const SCRIPT_DSQ = "real race classification";
  const K_FALLBACK = 1.4;   // sim seconds per real second when no reference lap can be modelled (measured: this box runs ~1.5x real)
  const LOOK_M = 220;       // m: how far ahead a mid-race drop-in reads the road for the speed it can carry (AiDrive.brakeTarget's budget)
  const LOOK_STEP = 10;
  const JUMP_MAX_WEAR = 0.9;   // a set older than its life is fitted worn, never past the cliff
  const RAIN_ARC_S = 60;    // s the sky takes to turn when the real race's rain starts or stops
  const FEED_PER_LAP = 4;   // narration lines a lap at most (lap 1 at Baku held 18 passes)
  const HANDOVER_S = 4;     // a mid-race jump-in: the car is driven for you this long at racing speed before the wheel is yours
  const GO_HOLD_S = 1;      // …and the on-screen GO stays up this long once it is
  const V_DROP_MIN = 0.3;   // of vTop(): the least a car is ever dropped in at (a hairpin), the most is vTop() itself
  const REAL_VMAX = 95;     // m/s: a real top speed; the real trace's speed scales onto vTop() through it

  const clamp = M4.clamp;   // js/core/mat4.js — bound at eval (HARD_EDGES pair in tools/manifest.cjs)

  const {
    KP, MUL_MIN, MUL_MAX, COMPOUND,
    realLapFor, simLapFor, paceTable, cumTable, planFor, dnfAtFor, cautionsFor,
    properName, situation, mapField, fieldAt, paceMul, classOf,
  } = RealRacePace;


  /** The wheel changes hands (FlyingStart, RealRace.tickHandover): the AI never advances `c.head` (only the human
   *  integrator does), so the car would take the wheel facing the heading it was DROPPED with, up to ~90 deg off the
   *  road after the run-up's bends. Re-seed the pose from the road at the car's CURRENT s/x. */
  function seatOnRoad(track, c) {
    const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    Tracks.sample(track, c.s, smp);
    const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;
    c.px = smp.p[0] + smp.r[0] / rl * c.x; c.pz = smp.p[2] + smp.r[2] / rl * c.x;
    c.head = Math.atan2(smp.t[0], smp.t[2]);
    c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevHead = c.head; c.rPrevYawVis = 0;
    c.vLat = 0; c.yawRateCur = 0; c.yawVis = 0;
  }

  let live = null;   // the instance game.js created — the hub and the dev hooks reach it through the statics below

  /** The speed the AI would carry at `s` — a mid-race drop-in without a real trace starts at FULL speed
   *  for that piece of road, not a cruise. AI-ONLY (docs/PHYSICS.md §Curvature channels): the car it
   *  places is the AI's (the seat car too, until the hand-over), and it is the AI's own corner model,
   *  entry budget and braking credit (AiDrive.brakeTarget), read once at the drop, never per frame. */
  function dropSpeed(track, s, vTop, wrapS) {
    const AD = typeof AiDrive !== "undefined" ? AiDrive : null, PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : null;
    if (!AD || !PC || !track || !Tracks.curvature) return V_DROP_MIN * vTop;
    let v = vTop;
    for (let d = 0; d <= LOOK_M; d += LOOK_STEP) {
      const k = Math.abs(Tracks.curvature(track, wrapS(s + d)));
      const vC = AD.cornerSpeed(k, PC.LAT_MAX, 1, vTop);
      v = Math.min(v, Math.sqrt(vC * vC + 2 * PC.BRAKE * 0.85 * d));   // what can still be shed before that node
    }
    return clamp(v, V_DROP_MIN * vTop, vTop);
  }

  function create(G) {
    Log.info("game", "RealRace.create");
    let active = null;    // {script, laps, startLap, seat, seatMap, saved}
    let armed = false, placed = false;
    let field = null;     // Map car -> {d, lap, mul, err, base}
    let tables = null;    // {pace, cum, refNum, wins, at}
    let K = 0;            // sim seconds per real second, measured off the reference car
    let raceT0 = 0;       // the race clock a jump-in is seeded to: RaceControl.finishDelay's hard cap counts from here
    let heldLevel = 0;
    let redFired = new Set();
    let simRef = [];      // sim race time of the reference car at each completed lap
    let watchFlag = null;   // last recorded flag applied; unchanged frames allocate nothing
    let rainWant = null;  // the weather the script last asked for (mid-race rain)
    let fed = null;       // the narration lines already said (feed keys)
    let handover = null;  // {c, t, said}: the seat car driven by the AI until t runs out, then the player's
    let goHold = 0, plateUp = false;   // the hand-over's on-screen count: GO's remaining seconds, and whether the plate is up at all
    // Driven real race: endRace's compound-rule path deletes every c.dsq. Flip
    // status().watch for that call only so classification uses the published
    // markers arm() set (same path as WATCH). SportingRegs is frozen — cannot wrap it.
    let endRaceWrap = null, classifyPublished = false;
    const replay = typeof RealReplay !== "undefined" ? RealReplay.create(G) : null;   // WATCH / HIGHLIGHTS: the field posed from real positions
    const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };   // a reusable Tracks.sample slot

    function stage(script, opts = {}) {
      if (!script || !Array.isArray(script.drivers) || !script.drivers.length) return null;
      const idx = Tracks.LIST.findIndex((t) => t.id === script.trackId);
      if (idx < 0) { Log.warn("game", "RealRace.stage: no circuit for " + script.trackId); return null; }
      const watch = !!opts.watch && !!opts.traces && !!replay;
      const laps = watch ? clamp(script.laps | 0, 1, 99) : clamp(opts.laps | 0 || script.laps | 0, 1, 99);   // a replay is always the full distance
      // The seat: a real driver's code -> the roster seat mapField gives it. A
      // driver with no seat is refused rather than seated in someone else's car.
      const seatMap = mapField(script, Teams.LIST);
      const want = opts.seat ? script.drivers.find((d) => d.code === opts.seat) : script.drivers.find((d) => seatMap.some((s) => s.num === d.num));
      const seat = want && seatMap.find((s) => s.num === want.num);
      if (!seat) { Log.warn("game", "RealRace.stage: no roster seat for " + (opts.seat || "the field")); return null; }
      const ti = Teams.LIST.findIndex((t) => t.id === seat.teamId);
      // Never past the seat's own retirement: its car would be parked at the wall and the race over in 2 s.
      const lastRun = !watch && want.dnf ? Math.max(1, want.lapsDone | 0) : script.laps | 0 || 1;
      const startLap = clamp(opts.startLap | 0 || 1, 1, lastRun);
      if (!active) {
        active = { saved: { teamIdx: G.teamIdx, driverIdx: G.driverIdx, raceLaps: G.raceLaps, raceWeather: G.raceWeather,
                            raceTimeOfDay: G.raceTimeOfDay, duel: G.duel, raceTyreWear: G.raceTyreWear, raceChangeable: G.raceChangeable,
                            trackIdx: G.trackIdx, flow: G.flow } };
      }
      active.script = script; active.laps = laps; active.startLap = startLap; active.seat = seat; active.seatCode = want.code; active.seatMap = seatMap;
      active.camera = opts.camera;
      active.watch = watch; active.reel = watch && !!opts.reel; active.traces = opts.traces || null;
      G.flow = "gp"; G.session = "race"; G.timeTrial = false; G.duel = false;
      G.trackIdx = idx;
      G.teamIdx = ti; G.driverIdx = seat.di;
      G.raceLaps = laps;
      G.raceWeather = weatherAt(script, startLap);
      G.raceTimeOfDay = raceTod(script.tod, Tracks.LIST[idx]);
      G.raceChangeable = false;
      if (G.raceTyreWear === "off") G.raceTyreWear = "real";   // the stops are the story
      if (G.resetRaceDraft) G.resetRaceDraft();
      armed = false; placed = false;
      Log.info("game", "RealRace.stage " + script.name + " " + script.trackId + " laps=" + laps + "/" + script.laps + " from=" + startLap + " seat=" + want.code + (watch ? (active.reel ? " HIGHLIGHTS" : " WATCH") : ""));
      return watch ? { trackId: script.trackId, laps, seat: want.code, startLap, watch: true, reel: active.reel } : { trackId: script.trackId, laps, seat: want.code, startLap };
    }

    /** A real race — JUMP IN, WATCH or HIGHLIGHTS — runs at DAWN when it ran by day (or its hour
     *  is unknown): a night race — or a night circuit's default — keeps its night, a dusk race its dusk. */
    function raceTod(tod, def) {
      if (tod === "day" || ((!tod || tod === "default") && !(def && def.night))) return "dawn";
      return tod || "default";
    }

    /** The chip for a real lap: the rain flags when the script has them (lap by lap), else the race's one weather. */
    function weatherAt(script, realLap) {
      const rain = Array.isArray(script.rain) && script.rain.some(Boolean) ? script.rain : null;
      if (!rain) return script.weather || "dry";
      return rain[realLap] ? "rain" : "dry";
    }

    /* THE DATA HUB'S BUTTONS GO THROUGH THE PRE-RACE SCREEN (opts.intro): the
     * card, the flyby and the announcer, as RACE! does (G.raceIntro, which
     * builds the circuit under the card when the menu never pre-built it). The
     * screen runs startRace itself. Opt-in, so a page probe or a spec calling
     * launch() still gets the synchronous start it was written against. */
    function launch(script, opts) {
      const p = stage(script, opts);
      if (!p) return null;
      if (opts && opts.intro && G.raceIntro) {
        try { G.raceIntro(G.startRace); }
        catch (e) { Log.warn("game", "RealRace: the pre-race screen failed — starting straight away", e); G.startRace(); }
      } else G.startRace();
      return p;
    }

    /** What the pre-race screen says about this launch (js/game.js loadingInfo):
     *  the real event's title, whose car the player takes and from which lap.
     *  Null when nothing is staged or the race is already running. */
    function intro() {
      if (!active || armed) return null;
      const s = active.script, d = Array.isArray(s.drivers) ? s.drivers.find((x) => x.code === active.seatCode) : null;
      return { title: ((s.year ? s.year + " " : "") + String(s.name || "")).trim(), driver: properName(d && d.name) || active.seatCode || "",
               startLap: active.startLap, realLaps: s.laps | 0, watch: !!active.watch, reel: !!active.reel,
               story: situation(s, active.startLap, active.seatCode, active.laps) };   // the race so far, for the card and the announcer
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
      if (watchFlag && G.applyCaution) G.applyCaution({ level: 0 });
      else if (heldLevel && G.holdCaution) G.holdCaution(0);
      watchFlag = null;
      heldLevel = 0; armed = false; placed = false; raceT0 = 0; field = null; tables = null; K = 0; simRef = []; redFired = new Set(); rainWant = null; fed = null; handover = null;
      if (plateUp) count(null);
      goHold = 0;
      if (replay) replay.stop();
      if (endRaceWrap) {
        // Computed key: GameCtx marks endRace readonly; the façade is mutable at
        // runtime, and check-gctx only tracks non-computed G.<name> writes.
        G["endRace"] = endRaceWrap.orig;
        endRaceWrap = null;
      }
      classifyPublished = false;
    }

    // While a driven real race is armed, wrap G.endRace so status().watch reads
    // true for that call: endRace then keeps arm()'s SCRIPT_DSQ markers instead
    // of wiping them via SportingRegs.applyCompoundRule (#3287). isWatch() stays false.
    function installEndRacePreserve() {
      if (endRaceWrap || typeof G.endRace !== "function") return;
      const orig = G.endRace;
      G["endRace"] = function (forcedOrder) {
        classifyPublished = true;
        try { return orig.apply(this, arguments); }
        finally { classifyPublished = false; }
      };
      endRaceWrap = { orig };
    }

    // The first frame of the countdown: the field is gridded and armed (the
    // game's own grid, plans and reliability draws ran in startRaceBody), so
    // everything scripted is laid over it here — one re-grid, no RNG draw.
    function arm() {
      watchFlag = null;   // startRace reset race control, including a repeated WATCH launch
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
      const winner = script.drivers.find((d) => d.pos === 1) || script.drivers[0];
      tables = { pace: paceTable(script), cum, refNum, wins: cautionsFor(script, simLaps), at: fieldAt(script, active.startLap),
        watchStarts: winner && winner.lapStart || [], watchCautions: script.cautions || [] };
      const wearOn = G.tyres && G.tyres.on && G.tyres.on();
      if (!active.watch) installEndRacePreserve();
      for (const c of cars) {
        const f = field.get(c);
        if (!c.human) {
          c.tierV = tierV; c.skill = base / tierV; f.base = c.skill;
          // A real did-not-start is parked on the first metres like an empty seat, not half a lap out.
          // A DSQ that saw the flag (dnfAtFor → null) is not an accident retirement — mark c.dsq
          // like watch mode (real-replay finish) so classification keeps them out of the timed order.
          c.dnfAt = !f.d || f.d.dns ? DNS_AT : dnfAtFor(f.d, realLaps);
          c.dnfWhy = !f.d || f.d.dns ? "dns" : (f.d && f.d.dsq ? null : "accident");
          // Lap 1 at its real pace: the open loop starts at the line (the closed loop cannot measure
          // before the first crossing), so the run to turn 1 is the data's, not the launch draw's.
          const rel1 = f.d && tables.pace.rel[f.d.num] ? tables.pace.rel[f.d.num][realLapFor(1, simLaps, realLaps)] : null;
          if (rel1 > 0) { f.mul = paceMul(0, 0, rel1); c.skill = f.base * f.mul; }
        }
        if (f.d && f.d.dsq) c.dsq = SCRIPT_DSQ;
        else if (c.dsq === SCRIPT_DSQ) c.dsq = null;
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
      armed = true; fed = new Set();
      // A JUMP IN mid-race is a ROLLING start: the field is dropped in at speed on this
      // countdown frame and the race goes green at once — no gantry over a standing grid.
      // The seat car is driven for the player for HANDOVER_S (a flying lap into the wheel),
      // then control passes; tickHandover says when.
      if (!active.watch && active.startLap > 1 && tables.at && G.goRolling && G.setCarRole) {
        const me = cars.find((c) => c.human && c.local);
        // The seat is the AI's BEFORE the drop (its speed is the AI's read of the road);
        // said: the plate already shows HANDOVER_S (count below), so tickHandover's count starts one below it.
        if (me) { G.setCarRole(me, false, true); me.launch = null; me.launchOn = false; handover = { c: me, t: HANDOVER_S, said: HANDOVER_S }; }
        place();
        G.goRolling();
      }
      if (active.watch) {
        // WATCH: the whole field, the seat included, becomes the replay's puppets; nothing here steers.
        const seats = new Map();
        for (const [c2, f2] of field) seats.set(c2, f2.d);
        const ok = replay.start({ script, traces: active.traces, seats, startLap: active.startLap, follow: active.seatCode, camera: active.camera, reel: active.reel, onTimeline: watchTimeline });
        if (!ok) { active.watch = false; Log.warn("game", "RealRace.arm: the replay did not start — racing it instead"); }
        else placed = true;
      }
      if (G.announce) G.announce((active.watch ? (active.reel ? "HIGHLIGHTS · " : "REAL REPLAY · ") : "REAL RACE · ") + String(script.name || script.circuit || "").toUpperCase() + (active.startLap > 1 && !active.reel ? " · LAP " + active.startLap : ""), 2.5, "info");
      if (handover) count(HANDOVER_S);   // the count is ON SCREEN from the first frame (tickHandover)
      Log.info("game", "RealRace.arm field=" + field.size + " mapped=" + byId.size + " ref=" + refNum + " from=" + active.startLap);
    }

    // The real set on the car, in place of the one gridUp fitted: one entry in
    // the stint log (the results strip draws it), never a phantom lap-0 stint.
    // A car dropped in MID-RACE also carries the sets it already ran (`plan`,
    // `made`): the stint log is the one record SportingRegs judges, and
    // trimming it to the current set disqualified every car that had really
    // run two dry compounds before the jump-in lap.
    function refit(c, cls, stints, plan, made) {
      if (!cls || !G.tyres.classRecord || !G.tyres.fit) return;
      G.tyres.fit(c, G.tyres.classRecord(cls));
      if (Array.isArray(c.tyreLog) && c.tyreLog.length) {
        const cur = c.tyreLog[c.tyreLog.length - 1];
        const past = [];
        for (let i = 0; plan && i < (made || 0); i++) {
          const rec = typeof TyreModel !== "undefined" && TyreModel.AI_CLASS[plan.seq[i]];
          if (!rec) continue;
          const lap0 = i ? plan.lapsAt[i - 1] : 0, lap1 = plan.lapsAt[i];
          past.push({ code: rec.code, id: plan.seq[i], colour: rec.colour, lap0, lap1 });
        }
        cur.lap0 = past.length ? past[past.length - 1].lap1 : (c.lap || 0); cur.lap1 = null;
        c.tyreLog = past.concat(cur);
      }
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
      G.raceT = K0 * at.t0; raceT0 = G.raceT;
      const wearOn = G.tyres && G.tyres.on && G.tyres.on();
      const vTop = G.vTop ? G.vTop() : 80;
      // The real positions, when loaded and the distance is real: each car at the published jump instant.
      const built = active.traces && simLaps === realLaps && typeof RealReplay !== "undefined" ? RealReplay.buildTraces(G.track, script, active.traces) : null;
      const real = {};
      let side = 0, parked = 0, dropped = 0, exact = 0;
      for (const c of G.cars) {
        const f = field.get(c);
        const a = f && f.d ? at.by[f.d.num] : null;
        if (!a) { if (!c.human) { parkCar(c, "dns", 0); parked++; } continue; }
        if (a.retired) { parkCar(c, "accident", simLapFor(a.lap, simLaps, realLaps)); parked++; f.lap = c.lap; continue; }
        const tr = built ? built.byNum.get(f.d.num) : null;
        // Filled untimed laps and restart gaps can move the synthetic pace clock
        // away from the positions feed's published seconds from lights out.
        const r = tr ? RealReplay.sampleAt(tr, at.traceT0, real) : null;
        const onTrace = r && !r.before && !r.ended && r.prog > 0;
        const ls = onTrace ? Math.floor(r.prog / total) + 1 : simLapFor(a.lap, simLaps, realLaps);
        const s = onTrace ? r.prog - (ls - 1) * total : a.frac * total;
        if (onTrace) exact++;
        const progWas = c.prog;
        c.lap = ls; c.prog = (ls - 1) * total + s;
        // The SEAT's own reliability draw counts only the laps it drives: the dropped-in distance is a gift
        // (as a red-flag restart's is), or a failure point short of the join lap retired it on the first frame.
        // The AI's dnfAt is the script's real retirement point, measured on the whole race, so it gets none.
        if (c.local) c._progGift = (c._progGift || 0) + (c.prog - progWas);
        c.fuelLap = ls;   // crossings driven: the tank is ls - 1 laps down (js/physics/tyre-model.js fuelFrac)
        c.totalT = K0 * at.t0; c.lapTime = K0 * a.into;
        // FULL speed: the real car's when its trace says (as a fraction of a real top speed — vstd: never
        // an absolute m/s), else the speed the AI would carry through this piece of road (dropSpeed).
        const vf = onTrace ? real.speed / REAL_VMAX : 0;
        placeCar(c, s, onTrace ? clamp(real.x, -5, 5) : (side++ % 2 ? 1.5 : -1.5), vf > 0 ? clamp(vf, V_DROP_MIN, 1) * vTop : dropSpeed(G.track, s, vTop, G.wrapS));
        c.gear = 5; c.energy = 0.7;
        if (wearOn && a.compound) {
          // The plan's arrays hold only the stops that fit the sim distance, so
          // the stops "made" are the kept stops before this lap — never the real
          // stint index, which the dropped stops would put out of step.
          const made = c.pitPlan && Array.isArray(c.pitPlan.lapsAt) ? c.pitPlan.lapsAt.filter((l) => l < ls).length : a.stint;
          refit(c, a.compound, made + 1, c.pitPlan, made);
          c.pitStops = made;
          const ageSim = a.age * simLaps / realLaps;
          const life = typeof TyreModel !== "undefined" && TyreModel.AI_CLASS[a.compound] && G.tyres.planLaps
            ? G.tyres.planLaps(TyreModel.AI_CLASS[a.compound].life, simLaps) : 0;
          // BOTH AXLES TOO. fit() zeroed tyreWearF/R, and axleSplit reads them
          // as a ratio against tyreWear — 1/gripFor(wear) each, which cancelled
          // the worn set's whole grip loss for a dropped-in player.
          if (life > 0) { c.tyreWear = clamp(ageSim / life, 0, JUMP_MAX_WEAR); c.tyreWearF = c.tyreWear; c.tyreWearR = c.tyreWear; }
          c.tyreLap0 = ls - Math.round(ageSim); c.tyreLapAdj = 0;
        }
        f.lap = c.lap; dropped++;
      }
      if (G.snapGameCam) G.snapGameCam();
      if (G.refreshHud) G.refreshHud(true);
      placed = true;
      Log.info("game", "RealRace.place lap=" + at.lap + " simLap=" + Ls + " K0=" + K0.toFixed(3) + " t0=" + at.t0.toFixed(1) + " dropped=" + dropped + " parked=" + parked + " exact=" + exact);
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
        // The reference car's own FIRST crossing of a lap pins the scale: sim seconds per real second —
        // on a GREEN lap: a caution lap runs at the sim's cap against the real train's crawl, and the
        // ratio it gives would stretch every gap target in the field until the next clean crossing.
        if (refNum === f.d.num && refCum && refCum[rl] > 0 && simRef[done] == null) { simRef[done] = c.totalT; if (!(K > 0) || !cautionLap(rl)) K = c.totalT / refCum[rl]; }
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

    /** True when real lap rl ran inside a caution window. */
    function cautionLap(rl) {
      for (const w of active.script.cautions || []) if (w.level >= 2 && rl >= w.from && rl <= (w.to != null ? w.to : w.from)) return true;
      return false;
    }

    /** The narration: what the real race did on the lap the leader just reached — the passes for the
     *  places that matter, the stops (with the set), the retirements (with where), the fastest lap. */
    function tickFeed(lap) {
      if (!G.announce || !fed || lap < 1 || fed.has("L" + lap)) return;
      fed.add("L" + lap);
      const script = active.script, realLaps = script.laps | 0, simLaps = active.laps;
      const rl = realLapFor(lap, simLaps, realLaps), rlPrev = lap > 1 ? realLapFor(lap - 1, simLaps, realLaps) : 0;
      const lines = [];
      const code = (num) => { const d = script.drivers.find((x) => x.num === num); return d ? d.code : "#" + num; };
      for (const d of script.drivers) {
        if (d.dnf && !d.dns && (d.lapsDone | 0) < realLaps && (d.lapsDone | 0) + 1 > rlPrev && (d.lapsDone | 0) + 1 <= rl) lines.push({ p: 0, text: d.code + " OUT" + (d.outWhere ? " · " + d.outWhere : "") });
        (d.pits || []).forEach((pl) => { if (pl > rlPrev && pl <= rl) { const st = (d.stints || []).find((x) => x.from === pl + 1); lines.push({ p: 2, text: d.code + " PITS" + (st ? " · " + st.c : "") }); } });
      }
      for (const p of script.passes || []) if (p.lap > rlPrev && p.lap <= rl) lines.push({ p: 1 + (p.pos || 20) / 100, text: code(p.by) + " PASSES " + code(p.over) + (p.pos ? " FOR P" + p.pos : "") });
      if (script.fastest && script.fastest.lap > rlPrev && script.fastest.lap <= rl) lines.push({ p: 0.5, text: "FASTEST LAP · " + code(script.fastest.num) + " " + (RealReplay ? RealReplay.fmtLap(script.fastest.dur) : "") });
      lines.sort((a, b) => a.p - b.p);
      for (const l of lines.slice(0, FEED_PER_LAP)) G.announce("L" + rl + " · " + l.text, 2.5, "race");
    }

    function count(v) { plateUp = v != null; if (G.handoverCount) G.handoverCount(v); }

    /** The rolling hand-over: the seat car is the AI's for HANDOVER_S, counted down big on screen
     *  (G.handoverCount — the queued radio cards ran late behind the REAL RACE banner), then the player's. */
    function tickHandover(dt) {
      if (goHold > 0 && (goHold -= dt) <= 0) count(null);   // GO stays up a beat, then the plate goes
      if (!handover) return;
      handover.t -= dt;
      const left = Math.ceil(handover.t);
      if (left < handover.said && left > 0) { handover.said = left; count(left); }
      if (handover.t > 0) return;
      const c = handover.c;
      G.setCarRole(c, true, true);
      seatOnRoad(G.track, c);
      c.launch = null; c.launchOn = false;
      // Zero the tilt/stick NOW, as FlyingStart's hand-over does: a jump-in never passes the gantry's first lamp.
      if (typeof Input !== "undefined" && Input.calibrate) Input.calibrate();
      count("GO"); goHold = GO_HOLD_S;
      if (G.announce) G.announce("YOU HAVE CONTROL", 1.5, "race");
      Log.info("game", "RealRace.handover " + c.code + " lap=" + c.lap + " speed=" + (c.speed || 0).toFixed(1));
      handover = null;
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

    // WATCH reads a snapshot from recorded time, never the live-drive latches.
    // This also runs inside replay seeks/cuts, before the new picture is painted.
    function watchTimeline(T) {
      const script = active.script;
      const starts = tables.watchStarts;
      let lap = starts.length ? 1 : Math.max(1, leaderLap());
      for (let i = 1; i < starts.length; i++) if (starts[i] != null && starts[i] <= T) lap = i + 1;
      // Recorded sets are presentation metadata, with stint identity independent
      // of compound (two consecutive soft sets are still different stints).
      for (const [c, f] of field) {
        const d = f.d; if (!d) continue;
        const stints = d.stints || [], row = d.lapStart || [];
        let driverLap = 1;
        for (let i = 1; i < row.length; i++) if (row[i] != null && row[i] <= T) driverLap = i + 1;
        let idx = -1;
        for (let i = 0; i < stints.length; i++) if (stints[i].from <= driverLap) idx = i;
        if (idx < 0 || f.watchStint === idx) continue;
        const cls = classOf(stints[idx]);
        if (!cls || !G.tyres.classRecord) continue;
        c.tyre = G.tyres.classRecord(cls);
        c.tyreClass = cls; c.pitStops = idx; c.tyreStints = idx + 1; c.tyreLap0 = stints[idx].from; c.tyreLapAdj = 0;
        c.tyreLog = stints.slice(0, idx + 1).map((st, i) => {
          const rec = G.tyres.classRecord(classOf(st));
          return { code: rec.code, id: rec.id, colour: rec.colour, lap0: st.from, lap1: i < idx ? stints[i + 1].from : null };
        });
        f.watchStint = idx;
      }
      let level = 0, cause = "";
      for (const w of tables.watchCautions) {
        if (!w || !(w.level >= 2)) continue;
        const from = w.tFrom != null ? w.tFrom : starts[Math.max(0, (w.from | 0) - 1)];
        const to = w.tTo != null ? w.tTo : starts[w.to != null ? w.to | 0 : w.from | 0];
        const inside = from != null ? T >= from && (to != null ? T < to : lap <= (w.to || w.from))
          : lap >= w.from && lap <= (w.to != null ? w.to : w.from);
        if (inside && w.level > level) {
          level = Math.min(4, w.level | 0);
          cause = w.cause || (level === 4 ? "RED FLAG" : level === 3 ? "SAFETY CAR" : "VSC");
        }
      }
      if (!watchFlag || watchFlag.level !== level || watchFlag.cause !== cause) {
        if (G.applyCaution) G.applyCaution({ level, cause, phase: level === 4 ? "held" : "", replay: true });
        watchFlag = { level, cause }; heldLevel = level;
      }
      // The feed gives weather per lap. A recording cuts to that lap's sky,
      // including entry in the rain; only a driven race walks a live weather arc.
      const want = weatherAt(script, lap);
      if (G.weatherArc) G.weatherArc = null;
      if (G.raceWeather !== want && G.setWeatherLive) G.setWeatherLive(want);
      rainWant = want;
      if (G.frame && G.trackWetness) G.frame.wetness = G.trackWetness();
    }

    // Rain that started or stopped in the real race turns the sky here over an arc.
    function tickWeather(lap) {
      const script = active.script;
      if (!Array.isArray(script.rain) || !script.rain.some(Boolean) || lap < 1) return;
      const want = weatherAt(script, realLapFor(lap, active.laps, script.laps | 0));
      if (want === rainWant) return;
      rainWant = want;
      // Compare with where the sky is GOING, not the stage it shows: early in a
      // dry→rain arc raceWeather still reads "dry", so a script turning back to
      // dry was ignored and the storm arrived anyway. WeatherArc re-targets a
      // live arc from the road's current wetness, so grip does not jump.
      const dest = G.weatherArc ? G.weatherArc.to : G.raceWeather;
      if (dest !== want && G.startWeatherArc) G.startWeatherArc(G.raceWeather, want, RAIN_ARC_S);
    }

    function update(dt) {
      if (!active) return;
      const st = G.state;
      if (st === "menu" || st === "results") { if (armed) disarm(); return; }
      // RESTART and RACE AGAIN go race -> count (results -> count) with no menu frame between: a new
      // field means a new race, so it is armed afresh (grid, pace, stops, hand-over, the replay's camera).
      if (armed && field && G.cars && G.cars.length && !field.has(G.cars[0])) disarm();
      if (!armed) { if ((st === "count" || st === "race") && G.cars && G.cars.length && G.track) arm(); return; }
      if (active.watch) { replay.tick(dt); return; }
      if (st !== "race") return;
      if (!placed) { placed = true; if (tables.at) place(); }
      tickHandover(dt);
      tickPace();
      const lap = leaderLap();
      tickCautions(lap);
      tickWeather(lap);
      tickFeed(lap);
    }

    function status() {
      if (!active) return { active: false };
      const cars = [];
      if (field) for (const [c, f] of field) cars.push({ code: c.code, num: f.d ? f.d.num : null, human: !!c.human, grid: c.gridPos, lap: c.lap, retired: !!c.retired,
        s: c.s != null ? +c.s.toFixed(1) : null, speed: c.speed != null ? +c.speed.toFixed(1) : null, mul: +f.mul.toFixed(4), err: +f.err.toFixed(2), dnfAt: c.dnfAt, stops: c.pitPlan ? c.pitPlan.lapsAt : null,
        start: c.pitPlan ? c.pitPlan.start : null, tyre: c.tyre ? c.tyre.cls || c.tyre.code || null : null, wear: c.tyreWear != null ? +c.tyreWear.toFixed(3) : null, pitStops: c.pitStops | 0 });
      return { active: true, armed, placed, name: active.script.name, trackId: active.script.trackId, laps: active.laps, realLaps: active.script.laps,
               startLap: active.startLap, seat: active.seatCode, K: +K.toFixed(4), caution: heldLevel, weather: rainWant, cars,
               watch: !!(active.watch || classifyPublished), reel: !!active.reel, replay: replay ? replay.status() : null, handover: handover ? +handover.t.toFixed(2) : 0 };
    }

    live = { stage, launch, stop, update, status, intro, raceT0: () => raceT0, isActive: () => !!active, isWatch: () => !!active && !!active.watch, current: () => active && active.script,
             owns: (c) => !!replay && replay.owns(c), replay };
    return live;
  }

  // Call-time delegates for code with no G (js/data/real-race-tab.js, page probes).
  const launch = (script, opts) => (live ? live.launch(script, opts) : null);
  const status = () => (live ? live.status() : { active: false });
  const isWatch = () => !!live && live.isWatch();   // hot audio guards need no formatted field snapshot
  const replay = () => (live ? live.replay : null);   // the replay's controls (follow / setSpeed / seek / skip) for page probes

  return { create, launch, status, isWatch, replay, realLapFor, simLapFor, paceTable, cumTable, planFor, dnfAtFor, cautionsFor, mapField, fieldAt, situation, properName, paceMul, dropSpeed, seatOnRoad, COMPOUND, KP, MUL_MIN, MUL_MAX };
})();
Object.freeze(RealRace);
