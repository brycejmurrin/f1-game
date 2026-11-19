const RealRace = (function () {
  "use strict";

  const LOOK_M = 220;
  const LOOK_STEP = 10;
  const V_DROP_MIN = 0.3;
  const clamp = M4.clamp;

  function seatOnRoad(track, c) {
    const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    Tracks.sample(track, c.s, smp);
    const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;
    c.px = smp.p[0] + smp.r[0] / rl * c.x; c.pz = smp.p[2] + smp.r[2] / rl * c.x;
    c.head = Math.atan2(smp.t[0], smp.t[2]);
    c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevHead = c.head; c.rPrevYawVis = 0;
    c.vLat = 0; c.yawRateCur = 0; c.yawVis = 0;
  }

  function dropSpeed(track, s, vTop, wrapS) {
    const AD = typeof AiDrive !== "undefined" ? AiDrive : null, PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : null;
    if (!AD || !PC || !track || !Tracks.curvature) return V_DROP_MIN * vTop;
    let v = vTop;
    for (let d = 0; d <= LOOK_M; d += LOOK_STEP) {
      const k = Math.abs(Tracks.curvature(track, wrapS(s + d)));
      const vC = AD.cornerSpeed(k, PC.LAT_MAX, 1, vTop);
      v = Math.min(v, Math.sqrt(vC * vC + 2 * PC.BRAKE * 0.85 * d));
    }
    return clamp(v, V_DROP_MIN * vTop, vTop);
  }

  let live = null;
  let newest = null;

  function create(G) {
    Log.info("game", "RealRace.create (boot stub)");
    let mine = null;
    const body = () => {
      if (mine || typeof RealRaceBody === "undefined") return mine;
      mine = RealRaceBody.create(G);
      if (newest === body) live = mine;
      return mine;
    };
    newest = body; live = null;
    body();
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

  const latest = () => live || (newest && newest());
  const launch = (script, opts) => { const b = latest(); return b ? b.launch(script, opts) : null; };
  const status = () => { const b = latest(); return b ? b.status() : { active: false }; };
  const isWatch = () => !!live && live.isWatch();
  const replay = () => { const b = latest(); return b ? b.replay : null; };
  const loaded = () => typeof RealRaceBody !== "undefined";

  const api = { create, launch, status, isWatch, replay, dropSpeed, seatOnRoad, loaded, V_DROP_MIN };
  for (const k of ["realLapFor", "simLapFor", "paceTable", "cumTable", "planFor", "dnfAtFor", "cautionsFor", "mapField", "fieldAt",
                   "situation", "properName", "paceMul", "KP", "MUL_MIN", "MUL_MAX"]) {
    Object.defineProperty(api, k, { enumerable: true, get: () => (typeof RealRacePace !== "undefined" ? RealRacePace[k] : undefined) });
  }
  return api;
})();
Object.freeze(RealRace);
