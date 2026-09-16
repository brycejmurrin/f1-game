/* Comparable time-trial classes and lap configuration continuity. */
"use strict";
const SessionRecords = (function () {
  const PHYS = ["PACE", "DRIFT", "FRONT_GRIP", "PLAYER_GRIP", "ROAD_FOLLOW", "STEER_EXPO", "STEER_MAX_SLIP", "STEER_SPEED_REF", "WHEELBASE", "YAW_DAMP", "YAW_INERTIA", "raceLineAssist"];
  function create(G) {
    let key = null, revision = -1, spoiled = false, dailyRestore = null;
    const STANDARD = { PACE: 0.84, DRIFT: 0, FRONT_GRIP: 0.94, PLAYER_GRIP: 1.15, ROAD_FOLLOW: 0,
      STEER_EXPO: 2.4, STEER_MAX_SLIP: 0.29, STEER_SPEED_REF: 41.7, WHEELBASE: 3.6, YAW_DAMP: 1, YAW_INERTIA: 0.58, raceLineAssist: 0 };
    function prepareDaily() {
      if (!dailyRestore) dailyRestore = Object.fromEntries([...PHYS, "teamIdx", "driverIdx", "difficulty"].map(k => [k, G[k]]));
      for (const [k, v] of Object.entries(STANDARD)) G[k] = v;
      G.teamIdx = Math.max(0, Teams.LIST.findIndex(t => t.id === "mclaren")); G.driverIdx = 0; G.difficulty = "normal";
      Input.setSteerSpeedRef(G.STEER_SPEED_REF);
    }
    function restoreDaily() {
      if (!dailyRestore) return;
      for (const [k, v] of Object.entries(dailyRestore)) G[k] = v;
      dailyRestore = null;
      Input.setSteerSpeedRef(G.STEER_SPEED_REF);
    }
    function config() {
      const c = G.player, t = G.track;
      return { physics: PhysicsConsts.REVISION, circuit: t && t.def.id, layout: t && [t.def.revision || 1, t.n, t.total],
        car: c && [c.team.id, c.tierV, c.mods, c.aeroLoad, c.ersDeploy, c.ersRegen, c.tread, c.brakeBias, c.rollBalance],
        tune: PHYS.map(k => G[k]), controls: G.recordControls(), weather: G.weatherArc ? G.weatherArc.from : G.raceWeather,
        weatherPlan: G.weatherArc ? [G.weatherArc.from, G.weatherArc.to, G.weatherArc.dur] : null,
        tyreWear: G.raceTyreWear, difficulty: G.difficulty, tod: G.raceTimeOfDay };
    }
    function current() { return Ghost.contextKey(config()); }
    function begin() {
      key = current(); revision = G.store.rev; spoiled = false;
      Ghost.setTrack(G.track.def.id, key);
      const b = GameStore.ttBoard(G.track.def.id, key);
      G.ttRecord = b.length ? b[0].t : Infinity;
      return key;
    }
    // G.practice, not G.timeTrial. This was the reason checkpoints could not
    // leave Time Trial: outside one this was a NO-OP, so a rewound lap stayed
    // eligible for the ghost and the board. Practice spoils the session by
    // definition, whatever the session is.
    function invalidate() { if (G.practice) spoiled = true; }
    function sample(c) {
      if (revision !== G.store.rev) {
        revision = G.store.rev;
        if (current() !== key) spoiled = true;
      }
      if (!spoiled && !c.incidentInvalidLap) Ghost.record(c.lapTime, c.s, c.x);
    }
    function accept() {
      const daily = G.daily.current();
      if (daily && daily.class === "standard" && PHYS.some(k => G[k] !== STANDARD[k])) {
        spoiled = true;
        G.announce("STANDARD DAILY SETTINGS CHANGED — RESTART DAILY", 3, "info");
        return false;
      }
      if (!spoiled && current() === key) return true;
      G.announce("SETTINGS CHANGED — NEXT LAP STARTS A NEW CLASS", 3, "info");
      begin(); Ghost.startLap(); return false;
    }
    function finish(lapTime, laps, pole) {
      if (!accept()) return;
      laps.push(lapTime);
      const c = G.player;
      GameStore.ttBoardAdd(G.track.def.id, { t: lapTime, teamId: c.team.id, code: c.code, name: c.name, ts: Date.now(), context: key });
      const medal = Quali.medalFor(lapTime, pole), held = Ghost.medal();
      const up = Ghost.finishLap(lapTime, { medal, pole: +pole.toFixed(3), context: key,
        pace: G.PACE, difficulty: G.difficulty, weather: G.raceWeather });
      Ghost.startLap();
      if (up && medal && medal !== held) G.announce(medal.toUpperCase() + " MEDAL", 2, "info");
      if (G.daily.isActive()) G.daily.record(lapTime, key);
      if (lapTime < G.ttRecord) {
        G.ttRecord = lapTime; G.ttNewRecord = true;
        G.announce("NEW RECORD " + G.fmtTime(lapTime), 2, "info");
      }
    }
    function board(id) { return GameStore.ttBoard(id, id === Ghost.track() ? Ghost.context() : undefined); }
    return { begin, current, config, sample, accept, board, invalidate, finish, prepareDaily, restoreDaily, key: () => key };
  }
  return { create, PHYS };
})();
Object.freeze(SessionRecords);
