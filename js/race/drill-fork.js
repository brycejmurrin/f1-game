/* Apex 26 — DrillFork: the what-if service for the strategy drills (#6559 step B2, §1d; design #6554 §0b).
 *
 * A strategy drill asks "what if I had boxed this lap?" and answers it by RUNNING the race that way, never by a
 * formula: fork() takes the world, branch() puts it back, applies the decisions through the production pit API and
 * steps the real sim headless to a horizon, and the live world comes back when the branch is done.
 *
 *   const df = DrillFork.create(G);
 *   const F = df.fork();                                   // the world now, plus where the seeded stream stands
 *   const job = df.branch(F, [{ lap: 1, car: 0, action: "box", compound: "hard" }], { laps: 3 }, { cull: true });
 *   while (!df.step(job, 6)) {}                            // time-sliced: ~6 ms of sim per call, from the frame loop
 *   job.result                                             // player {timeS, distM}; per car: lapTimes, pos, stops, tyre, fuel
 *   df.noise(F, decisions, until, opts, 2)                 // ± seconds: the same branch on n neighbouring seeds
 *
 * ONE SNAPSHOT LIST. Every capture and restore goes through the coach's captureWorld/restoreWorld, which go through
 * SimState (js/core/sim-state.js): the rewind's own list, so a branch can never restore less than a rewind does.
 * A branch restores EXACTLY ({ exact: true }: no keep-forward of the player's penalties, no invalidated lap), because
 * a branch is a replay, not a practice rewind. What SimState RESETS rather than restores (IncidentSim takeovers,
 * the debris world) is reset by a branch too; RaceControl is read (fork().rc) and not restored: the VSC drill
 * (step 17) registers its part with SimState rather than adding a list here.
 *
 * DETERMINISM. A branch is the fork's world plus the fork's stream position (the SimState "rng" part), stepped at a
 * fixed dt with a fixed input: re-running it is byte-identical (#6560 / #6567 pinned the replay to 60/90 s). The
 * time slice decides only how many ticks run per call, never what they compute, because nothing is swapped between
 * slices: the live world stays put away until the job ends. So the HOST must hold live play while a job runs (a sim
 * drill's fast-forward IS the screen), and call step() from the frame callback, never from inside G.update.
 *
 * THE CULL (#6554 §0b(a)). Cars that cannot reach the player (or a `keep` car) within the horizon are retired at the
 * branch start, identically in every branch of a fork that names the same cars: fewer cars to step on the phone. "Cannot reach" is measured
 * on the road: further than (pit loss + margin) seconds of track at the field's mean speed, either way round.
 *
 * THE HOST RUNS A SIM DRILL AS PRACTICE (as Aero Lab does): a branch drives real laps through the live lap code, and
 * only a practice session's records are spoiled by the restore (SessionRecords.invalidate), so a branch's laps never
 * reach the board. Announcements raised inside a branch are the host's to mute while it fast-forwards.
 * NOT HERE (step 16): freezing fuel or wear for a counterfactual. Nothing here reads or writes the tyre model.
 * LAZY: its own bundle (LAZY_DRILL_FORK; the drill host loads it with ScriptLoader), only for a kind:"sim" drill. Never read
 * by the physics step, and it adds no G member: the arc never reaches the driver (AGENTS.md §Physics).
 */
"use strict";
var DrillFork = (function () {
  const DT = 1 / 60;
  const HOLD_INPUT = Object.freeze({ steer: 0, throttle: true, brake: false });
  const MAX_SECONDS = 1800;          // a 3-lap horizon on the longest circuit is ~330 s; this is a runaway guard
  const CULL_PIT_LOSS_S = 22, CULL_MARGIN_S = 10, CULL_MIN_V = 20;

  function create(G) {
    const coach = () => G.coach;
    function need() {
      const c = coach();
      if (!c || typeof c.captureWorld !== "function" || typeof c.restoreWorld !== "function")
        throw new Error("DrillFork: the coach body is not loaded (LAZY_RACE_SESSION)");
      if (!G.track || !Array.isArray(G.cars) || !G.cars.length) throw new Error("DrillFork: no race to fork");
      return c;
    }
    const capture = () => { const w = need().captureWorld(); if (!w) throw new Error("DrillFork: captureWorld returned nothing"); return w; };
    const restore = (w) => { if (!need().restoreWorld(w, { exact: true })) throw new Error("DrillFork: restoreWorld refused the snapshot"); };

    /** The world now. `rc` is RaceControl's read-out, for the drill's own card; it is not restored (see header). */
    function fork() {
      const world = capture();
      const rc = typeof G.cautionInfo === "function" ? G.cautionInfo() : null;
      return Object.freeze({ world, seed: G.simSeed(), rng: G.simSeed(undefined, true), rc,
        clock: G.raceT, lap: G.player ? G.player.lap : 0, cars: G.cars.length });
    }

    // ── the cull ────────────────────────────────────────────────────────────
    const culls = new WeakMap();   // fork → { key, set }: the same cull in every branch of a fork
    // `decided`: the cars a decision names are kept too (a culled car could not take its stop).
    function cullSet(F, cull, until, decided) {
      if (!cull) return null;
      const o = cull === true ? {} : cull;
      const keep = new Set([...(o.keep || []), ...(decided || []), G.cars.indexOf(G.player)].filter((i) => Number.isInteger(i) && i >= 0 && i < G.cars.length));
      const windowS = (Number.isFinite(o.pitLossS) ? o.pitLossS : CULL_PIT_LOSS_S) + (Number.isFinite(o.marginS) ? o.marginS : CULL_MARGIN_S);
      const key = [...keep].sort((a, b) => a - b).join(",") + "|" + windowS + "|" + JSON.stringify(until);
      const had = culls.get(F);
      if (had && had.key === key) return had.set;
      // Read off the FORK's world, not whatever is live now: restore it first (the caller restores it again anyway).
      restore(F.world);
      const L = G.track.total, cars = G.cars;
      const running = cars.filter((c) => !c.retired && !c.finished);
      const vMean = Math.max(CULL_MIN_V, running.reduce((a, c) => a + Math.max(0, c.speed || 0), 0) / Math.max(1, running.length));
      const reach = windowS * vMean;
      const set = new Set();
      cars.forEach((c, i) => {
        if (keep.has(i) || c.retired || c.finished) return;
        let near = false;
        for (const k of keep) {
          const d = Math.abs((((cars[k].s - c.s) % L) + L) % L);
          if (Math.min(d, L - d) <= reach) { near = true; break; }
        }
        if (!near) set.add(i);
      });
      culls.set(F, { key, set });
      return set;
    }

    // ── a branch ────────────────────────────────────────────────────────────
    const decisionsOk = (ds) => Array.isArray(ds) && ds.every((d) => d && (d.action === "box" || d.action === "stay")
      && Number.isInteger(d.car) && (Number.isFinite(d.lap) || Number.isFinite(d.s)));
    function untilOk(u) { return u && ((Number.isFinite(u.laps) && u.laps > 0) || (Number.isFinite(u.seconds) && u.seconds > 0)); }

    /** A job: nothing runs until step(). `decisions`: [{ car, lap | s, action: "box"|"stay", compound? }] (lap is
     *  relative to the fork: 0 = the lap the car is on). `until`: { laps } of the PLAYER from the fork, or { seconds }.
     *  opts: { cull: true | { keep, pitLossS, marginS }, input (held all branch; default HOLD_INPUT),
     *  drive: () => { step(dt) → input } (a factory: SoakRun.policy("autopilot") is one, the AI-law seat of decision 3) } */
    function branch(F, decisions, until, opts) {
      if (!F || !F.world) throw new Error("DrillFork.branch: a fork() is required");
      if (!decisionsOk(decisions || [])) throw new Error("DrillFork.branch: decisions are [{ car, lap|s, action: box|stay }]");
      if (!untilOk(until)) throw new Error("DrillFork.branch: until is { laps } or { seconds }");
      const o = opts || {};
      return { F, decisions: (decisions || []).map((d) => Object.assign({}, d)), until: Object.assign({}, until),
        cull: o.cull || null, input: o.input === undefined ? HOLD_INPUT : o.input,
        drive: typeof o.drive === "function" ? o.drive : null, driver: null,
        seed: Number.isFinite(o.seed) ? o.seed : null,
        state: "queued", ticks: 0, live: null, run: null, result: null, error: null };
    }

    function begin(job) {
      job.live = capture();   // the live world, put back when the job ends (it may have moved on since the fork)
      const savedInput = G._testInput, savedHeadless = G.headlessMode;
      try { setUp(job, savedInput, savedHeadless); }
      catch (e) {   // a throw before the first tick (a caller's drive factory, a bad snapshot): the live world comes back
        G._testInput = savedInput; G.headlessMode = savedHeadless;
        const live = job.live; job.live = null;
        restore(live);
        throw e;
      }
    }
    function setUp(job, savedInput, savedHeadless) {
      const set = cullSet(job.F, job.cull, job.until, job.decisions.map((d) => d.car));
      restore(job.F.world);
      if (job.seed != null) G.simSeed(job.seed);   // noise(): a neighbouring stream from the same world
      job.driver = job.drive ? job.drive() : null;   // a FRESH policy per branch: a policy keeps state
      if (set) for (const i of set) { const c = G.cars[i]; c.retired = true; c.parkedOnRoad = false; c.speed = 0; }
      const cars = G.cars;
      job.run = { t0: G.raceT, lap0: cars.map((c) => c.lap || 0), lapAt: cars.map(() => [G.raceT]), done: new Set(),
        stops: cars.map(() => 0), pit: cars.map((c) => c.pitState || "none"),
        culled: set ? [...set] : [], prog0: G.player ? G.player.prog || 0 : 0, savedInput, savedHeadless,
        applied: job.decisions.map(() => null) };
      G.headlessMode = true;
      job.state = "running";
    }
    function applyDecisions(job) {
      const r = job.run;
      job.decisions.forEach((d, k) => {
        if (r.done.has(k)) return;
        const c = G.cars[d.car];
        if (!c) { r.done.add(k); r.applied[k] = { at: 0, armed: false, compound: null, error: "no-car" }; return; }
        const lapNow = (c.lap || 0) - r.lap0[d.car];
        const due = Number.isFinite(d.lap) ? lapNow >= d.lap : (lapNow > 0 || (c.s || 0) >= d.s);
        if (!due) return;
        r.done.add(k);
        // What the pit API said, per decision: a compound it refused or a closed lane is the card's to show.
        const comp = d.compound ? !!G.pits.selectNext(c, d.compound) : null;
        r.applied[k] = { at: G.raceT - r.t0, armed: !!G.pits.arm(c, d.action === "box"), compound: comp };
      });
    }
    function finished(job) {
      const r = job.run, p = G.player, pi = G.cars.indexOf(p);
      if (G.state !== "race") return "state:" + G.state;
      if (p && p.finished) return "finished";
      if (job.until.laps && p && (p.lap || 0) - r.lap0[pi] >= job.until.laps) return "laps";
      if (job.until.seconds && G.raceT - r.t0 >= job.until.seconds - 1e-9) return "seconds";
      if (G.raceT - r.t0 > MAX_SECONDS) return "runaway";
      return null;
    }
    function tick(job) {
      const r = job.run, cars = G.cars;
      applyDecisions(job);
      if (job.driver && typeof job.driver.step === "function") G._testInput = job.driver.step(DT) || null;
      else G._testInput = job.input;
      for (const c of cars) { c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevYawVis = c.yawVis; c.rPrevHead = c.head; }
      G.update(DT);
      job.ticks++;
      cars.forEach((c, i) => {
        const ps = c.pitState || "none";
        if (ps === "box" && r.pit[i] !== "box") r.stops[i]++;
        r.pit[i] = ps;
        const laps = (c.lap || 0) - r.lap0[i];
        while (r.lapAt[i].length - 1 < laps) r.lapAt[i].push(G.raceT);
      });
    }
    function readout(job, reason) {
      const r = job.run, cars = G.cars;
      // A CULLED car is not a retirement: it stands at its fork distance and ranks there, so the player's position
      // in a culled branch is not lifted by cars the cull parked ahead of it.
      const culled = new Set(r.culled), out = (i) => (cars[i].retired && !culled.has(i) ? 1 : 0);
      const order = cars.map((c, i) => i).sort((a, b) => (out(a) - out(b)) || (cars[b].prog - cars[a].prog));
      const pos = new Array(cars.length);
      order.forEach((i, k) => { pos[i] = k + 1; });
      const prims = (o) => { const out = {}; if (o && typeof o === "object") for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") out[k] = v; } return out; };
      const fuelOf = (c) => { const out = {}; for (const k of Object.keys(c)) if (/^fuel/.test(k) && typeof c[k] === "number") out[k] = c[k]; return out; };
      return {
        reason, ticks: job.ticks, seconds: G.raceT - r.t0, culled: r.culled.slice(), decisions: r.applied.slice(),
        player: G.player ? { timeS: G.raceT - r.t0, distM: (G.player.prog || 0) - r.prog0 } : null,
        cars: cars.map((c, i) => ({
          i, code: c.code, isPlayer: !!c.isPlayer, pos: pos[i], lap: c.lap || 0, prog: c.prog, s: c.s, speed: c.speed,
          lapTimes: r.lapAt[i].slice(1).map((t, k) => t - r.lapAt[i][k]),
          pitState: c.pitState || "none", stops: r.stops[i], culled: culled.has(i), retired: !!c.retired && !culled.has(i), finished: !!c.finished,
          tyre: prims(c.tyre), fuel: fuelOf(c),
        })),
      };
    }
    function end(job, reason) {
      const r = job.run;
      try { if (reason) job.result = readout(job, reason); }
      finally {
        G._testInput = r.savedInput;
        G.headlessMode = r.savedHeadless;
        const live = job.live;
        job.live = null;
        job.state = reason ? "done" : "cancelled";
        restore(live);   // the live world: every car, the clock, the stream position
      }
    }

    /** Run the job for about `budgetMs` of wall time (at least one tick). true once it is done (or failed). */
    function step(job, budgetMs) {
      if (!job || job.state === "done" || job.state === "cancelled" || job.state === "failed") return true;
      const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
      const until = now() + (Number.isFinite(budgetMs) ? Math.max(0, budgetMs) : 8);
      try {
        if (job.state === "queued") begin(job);
        do {
          const why = finished(job);
          if (why) { end(job, why); return true; }
          tick(job);
        } while (now() < until);
        return false;
      } catch (e) {
        job.error = String(e && e.message || e);
        if (job.run && job.live) { try { end(job, null); } catch (_) { /* the original error wins */ } }
        job.state = "failed";
        Log.warn("race", "DrillFork branch failed: " + job.error);
        return true;
      }
    }
    /** Stop a running job and put the live world back. */
    function cancel(job) { if (job && job.state === "running") end(job, null); return !!job; }
    /** Run a job to the end in one call (tests, tools; never on the phone's frame). */
    function run(job) { while (!step(job, Infinity)) { /* one call runs it all */ } return job; }

    /** The number a drill card shows for a { laps } branch: the seconds the player took to the horizon. A
     *  { seconds } branch reports distance instead (result.player.distM); noise() handles both. */
    function score(result) { return result.player ? result.player.timeS : NaN; }
    /** ± seconds: the same branch from the same world on n neighbouring streams; the spread of the player's time
     *  ({ laps }) or of its distance as seconds at its mean speed ({ seconds }). A replay of ONE stream is
     *  byte-identical, so the honest ± is how much the race's own randomness moves the number. */
    function noise(F, decisions, until, opts, n) {
      const k = Math.max(2, (n | 0) || 2), t = [], d = [];
      for (let j = 1; j <= k; j++) {
        const job = run(branch(F, decisions, until, Object.assign({}, opts, { seed: ((F.seed + j * 7919) >>> 0) || 1 })));
        if (job.state !== "done") throw new Error("DrillFork.noise: a branch failed: " + job.error);
        t.push(job.result.player.timeS); d.push(job.result.player.distM);
      }
      // Floored at one tick: a time the sim measures at DT cannot be known finer than DT.
      const spread = (a) => Math.max(DT, Math.max(...a) - Math.min(...a));
      if (until.laps) return spread(t);
      const v = d.reduce((a, x) => a + x, 0) / Math.max(1e-6, t.reduce((a, x) => a + x, 0));
      return Math.max(DT, (Math.max(...d) - Math.min(...d)) / Math.max(1, v));
    }

    return Object.freeze({ fork, branch, step, cancel, run, noise, score, cullSet });
  }

  return Object.freeze({ create, DT, HOLD_INPUT });
})();
