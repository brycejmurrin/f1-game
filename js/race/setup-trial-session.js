/* Fresh solo setup trials use normal race construction; never restore a world checkpoint. */
const SetupTrialSession = (() => {
  "use strict";
  // Match SessionRecords.PHYS, but read the boot-time facade directly: the
  // lazy session records stub has no config until normal start loads its bundle.
  const PHYS = ["PACE", "DRIFT", "FRONT_GRIP", "PLAYER_GRIP", "ROAD_FOLLOW", "STEER_EXPO", "STEER_MAX_SLIP", "STEER_SPEED_REF", "WHEELBASE", "YAW_DAMP", "YAW_INERTIA", "raceLineAssist"];
  const STATIC = ["physics", "car", "parts", "track", "weather", "assists"];
  const copy = value => JSON.parse(JSON.stringify(value));
  const key = value => JSON.stringify(value, (_k, v) => v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  const same = (a, b) => key(a) === key(b);
  function create(G) {
    let generation = 0, operation = null, initial = null;
    const current = op => operation === op && op.generation === generation && op.isCurrent();
    const restricted = () => G.flow !== "gp" || G.session === "quali" || G.duel ||
      G.daily.isActive() || G.netRoom || G.netPlay.active() || (G.realRace && G.realRace.status().active);
    const stable = () => !G.raceChangeable && !G.weatherArc;
    const physics = () => ({ revision: PhysicsConsts.REVISION, tuners: PHYS.map(k => G[k]) });
    function staticContext() {
      const c = G.player, t = G.track, phys = physics();
      const parts = c && c.team && G.getTeamParts(c.team.id), controls = G.recordControls();
      if (!c || !c.team || !(c.driverId || c.code) || !Number.isInteger(c.seat) ||
          !t || !t.def || !t.def.id || !Number.isFinite(t.total) || !Number.isFinite(t.n) ||
          !parts || typeof parts !== "object" || !controls || typeof controls !== "object" ||
          phys.revision == null || phys.tuners.some(v => !Number.isFinite(v))) return null;
      return copy({ physics: phys,
        car: { team: c.team.id, driver: c.driverId || c.code, seat: c.seat, tier: c.team.tier },
        parts, track: { id: t.def.id, revision: t.def.revision || 1, samples: t.n, length: t.total },
        weather: { selected: G.raceWeather, timeOfDay: G.raceTimeOfDay, changeable: G.raceChangeable, arc: G.weatherArc },
        assists: { controls, difficulty: G.difficulty } });
    }
    function staging(teamId) {
      const phys = physics();
      return copy({ team: G.teamIdx, driver: G.driverIdx, track: G.trackIdx, flow: G.flow, session: G.session,
        laps: G.raceLaps, physics: phys, parts: G.getTeamParts(teamId),
        tune: SetupTune.get(teamId), controls: G.recordControls(), difficulty: G.difficulty,
        weather: G.raceWeather, timeOfDay: G.raceTimeOfDay, changeable: G.raceChangeable });
    }
    function context() {
      if (!operation || !initial || !current(operation)) return null;
      const live = staticContext();
      if (!live) return null;
      const result = copy(initial);
      for (const field of STATIC) result[field] = live[field];
      result.unscored = !!G.practice && G.flow === "gp" && G.session === "tt" && G.cars.length === 1 && !restricted();
      result.stableWeather = stable();
      return result;
    }
    function cancel() { generation++; operation = null; initial = null; }
    async function restart(options) {
      const o = options || {};
      if (o.mode !== "launch" || typeof o.isCurrent !== "function" || !o.isCurrent()) return { ok: false, reason: "Setup trial no longer owns this request." };
      const continuing = operation && initial && current(operation) && G.practice && G.session === "tt";
      if (restricted() || (G.state !== "menu" && !(continuing && ["count", "race"].includes(G.state))))
        return { ok: false, reason: "Start setup trials from the solo menu or an existing setup trial." };
      if (!stable()) return { ok: false, reason: "Setup trials require stable selected weather." };
      const team = Teams.LIST.findIndex(t => t.id === o.teamId);
      if (team < 0 || !same(SetupTune.get(o.teamId), o.tune)) return { ok: false, reason: "The proposed team or setup changed." };
      const op = { generation: ++generation, isCurrent: o.isCurrent, pending: true };
      operation = op; initial = null;
      G.teamIdx = team; G.flow = "gp"; G.session = "tt";
      const fail = reason => { if (operation === op) { operation = null; initial = null; } return { ok: false, reason }; };
      try {
        if (!current(op)) return fail("Setup trial was cancelled.");
        const before = staging(o.teamId);
        const request = G.startRace();
        const outcome = request && request.outcome ? await request.outcome : await request;
        if (!current(op)) return fail("Setup trial was superseded.");
        if (outcome === false || (outcome && outcome.kind && outcome.kind !== "committed")) return fail("The fresh session did not start.");
        if (G.flow !== "gp" || G.session !== "tt") return fail("Another session now owns the game.");
        // Even a rejected comparison owns an unscored TT, never a leaderboard attempt.
        G.practice = true; G.records.invalidate();
        if (!same(before, staging(o.teamId)) || restricted() || !stable()) return fail("Setup, parts or session settings changed while starting.");
        const c = G.player, info = c && G.tyres.info(c), base = staticContext();
        if (!base || !c || c.team.id !== o.teamId || G.cars.length !== 1 || G.cars[0] !== c ||
            !["count", "race"].includes(G.state) || !Number.isFinite(c.speed) || Math.abs(c.speed) > 1 ||
            ![c.s, c.x, c.prog, c.lap, c.energy, c.tyreWear, c.fuelLap, c.fuelRestartLaps].every(Number.isFinite) ||
            !c.tyre || !c.tyre.id || !c.fuelId || !info || !Number.isFinite(info.fuel) || G.tyres.level() !== "off")
          return fail("Fresh standing grid, tyres or fuel could not be verified.");
        initial = copy({ ...base, point: { s: c.s, x: c.x, prog: c.prog, lap: c.lap, speed: c.speed },
          tyres: { level: G.tyres.level(), compound: c.tyre.id, tread: c.tread, wear: c.tyreWear,
            front: c.tyreWearF, rear: c.tyreWearR, surfaceTemperature: c.tyreTs, bulkTemperature: c.tyreTb,
            grain: c.tyreGrain, blister: c.tyreBlister, fittedLap: c.tyreLap0, stints: c.tyreStints },
          fuel: { id: c.fuelId, fraction: info.fuel, crossings: c.fuelLap, restarted: c.fuelRestartLaps, laps: G.lapsTarget },
          energy: { charge: c.energy, boost: c.boostOn, overtake: c.otE, overtakeTime: c.otT, aero: c.aeroX },
          assists: base.assists, unscored: true, stableWeather: true });
        if (!current(op) || !G.coach.beginSetupTrial()) return fail("The unscored launch drill could not be armed.");
        op.pending = false;
        return { ok: true, context: context() };
      } catch (_) { return fail("The setup trial could not start safely."); }
    }
    return Object.freeze({ restart, context, cancel,
      pending: () => !!(operation && operation.pending && current(operation)),
      active: () => !!(operation && initial && current(operation)) });
  }
  return Object.freeze({ create });
})();
