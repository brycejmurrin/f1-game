/* Apex 26 — REAL RACE boot stub (FULL, #4978 row 6). game.js still makes `RealRace.create(G)` at eval and reads
   update/owns/isWatch/status/raceT0 every frame; until a real race exists those answer "no real race". The body
   (RealRaceBody, js/race/real-race.js) with RealRacePace, RealReplay and WatchTransport is LAZY_REAL_RACE: the Data Hub
   (the only place a player starts one) and the agent surface load it before anything can launch, and the first call
   after it lands creates the body ONCE. dropSpeed / seatOnRoad stay here: FlyingStart reads them in every flying start. */
const RealRace = (function () {
  "use strict";

  const LOOK_M = 220;       // m: how far ahead a mid-race drop-in reads the road for the speed it can carry (AiDrive.brakeTarget's budget)
  const LOOK_STEP = 10;
  const V_DROP_MIN = 0.3;   // of vTop(): the least a car is ever dropped in at (a hairpin), the most is vTop() itself
  const clamp = M4.clamp;   // js/core/mat4.js — bound at eval (HARD_EDGES pair in tools/manifest.cjs)

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

  let live = null;     // the newest façade's body instance — the statics below reach it
  let newest = null;   // that façade's guarded creation

  function create(G) {
    Log.info("game", "RealRace.create (boot stub)");
    let mine = null;   // this G's body instance, made once the bundle has landed
    /** The guarded creation: the body, made ONCE, the first time anything asks after LAZY_REAL_RACE evaluated. */
    const body = () => {
      if (mine || typeof RealRaceBody === "undefined") return mine;
      mine = RealRaceBody.create(G);
      if (newest === body) live = mine;
      return mine;
    };
    newest = body; live = null;
    body();   // a shell or harness that evaluated the body already gets it now
    // Not frozen: the body's instance never was (probes swap a method on it).
    return {
      stage: (script, opts) => { const b = body(); return b ? b.stage(script, opts) : null; },
      launch: (script, opts) => { const b = body(); return b ? b.launch(script, opts) : null; },
      stop: () => { if (mine) mine.stop(); },
      update: (dt) => { const b = mine || body(); if (b) b.update(dt); },
      status: () => { const b = body(); return b ? b.status() : { active: false }; },
      intro: () => (mine ? mine.intro() : null),
      raceT0: () => (mine ? mine.raceT0() : 0),
      isActive: () => !!mine && mine.isActive(),
      isWatch: () => !!mine && mine.isWatch(),
      current: () => (mine ? mine.current() : null),
      owns: (c) => !!mine && mine.owns(c),
      get replay() { const b = body(); return b ? b.replay : null; },
    };
  }

  // Call-time delegates for code with no G (js/data/real-race-tab.js, page probes).
  const latest = () => live || (newest && newest());
  const launch = (script, opts) => { const b = latest(); return b ? b.launch(script, opts) : null; };
  const status = () => { const b = latest(); return b ? b.status() : { active: false }; };
  const isWatch = () => !!live && live.isWatch();   // hot audio guards need no formatted field snapshot
  const replay = () => { const b = latest(); return b ? b.replay : null; };   // the replay's controls (follow / setSpeed / seek / skip) for page probes
  const loaded = () => typeof RealRaceBody !== "undefined";

  const api = { create, launch, status, isWatch, replay, dropSpeed, seatOnRoad, loaded, V_DROP_MIN };
  // The pure timing-script helpers are RealRacePace's (LAZY_REAL_RACE): absent until it lands, as before a
  // caller's `RealRace.cumTable ? … : null` guard reads them.
  for (const k of ["realLapFor", "simLapFor", "paceTable", "cumTable", "planFor", "dnfAtFor", "cautionsFor", "mapField", "fieldAt",
                   "situation", "properName", "paceMul", "KP", "MUL_MIN", "MUL_MAX"]) {
    Object.defineProperty(api, k, { enumerable: true, get: () => (typeof RealRacePace !== "undefined" ? RealRacePace[k] : undefined) });
  }
  return api;
})();
Object.freeze(RealRace);
