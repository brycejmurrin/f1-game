/* Apex 26 — VSC: BOX OR STAY, the VSC Pit Strategy drill (#6559 step 17, design #6554 §1). A 12-lap Red Bull Ring
   race, wear on. Your car (the AI drives it: Bryce's decision 3) is just short of the pit entry when a VSC is called:
   BOX now, or STAY OUT and run the plan. A stop under the VSC is cheap because the road slows and the pit lane does
   not, but whether to take it depends on the set's life and the laps to go, not on the flag. Three rounds, each its
   own scenario: a fresh set near the end (stay), a half-worn set with a stop due anyway (box), a worn set with four
   laps to go (the branches decide).
   GROUND TRUTH IS THE BRANCHES. After the call, DrillFork (via SimDrill) runs BOTH calls from the same saved world to
   the flag, the VSC flown by script (RaceControl's hold through G.holdCaution, VSC_S of sim) inside each branch and
   released at its end. A round's number is your car's own race time to the flag in each branch; the right call is
   the faster one. Deterministic: the same world and stream replay byte-identically (#6567, #7169), so no "±" is
   printed (decision 4); a wrong call that cost under MARGINAL_S is still a miss, shown as marginal.
   Score = rounds called right (0-3); medals bronze 1, silver 2, gold 3 (#6554 §1.4). Per-round numbers:
   tests/data/learn-drill-refs.json "vsc" (tests/unit/drill-vsc-vm.test.mjs).
   Writes to a car only in the round staging (SimDrill.place) and the branch's own pit plan, set inside the branch
   (restored with it). THE ARC NEVER REACHES THE DRIVER: no curvature, no racing line; the AI's own law drives.
   NOT YET: "drive the out-lap" after bronze (decision 3) needs a player-driven branch: a follow-up.
   LAZY_LEARN: defined at eval when the registry is up, else by LearnDoor.defineDrills. */
const VscDrill = (function () {
  "use strict";

  const LAPS = 12;
  const VSC_S = 45;            // s of VSC in each branch: long enough to cover the whole stop
  const BEFORE_PIT_M = 300;    // the call comes this far short of the pit entry
  const MARGINAL_S = 0.5;
  const LAP_CAP_V = 30;        // m/s: a branch's seconds horizon is the laps to the flag at this floor speed
  const ROUNDS = Object.freeze([
    { id: "fresh", label: "Fresh set, 4 laps to go", lap: 9, wear: 0.1, stayStop: null },
    { id: "due", label: "Half-worn set, 7 laps to go, your stop is due on lap 8", lap: 6, wear: 0.55, stayStop: 8 },
    { id: "worn", label: "Worn set, 5 laps to go", lap: 8, wear: 0.85, stayStop: null },
  ]);
  const MEDALS = Object.freeze({ bronze: 1, silver: 2, gold: 3, goldClean: false });

  let run = null;   // the live drill: { G, port, sim, base, round, F, picks, results, phase }

  const youOf = (G) => G.cars.find((c) => c !== G.player) || null;
  const flagLaps = (r) => LAPS - r.lap + 1;   // lap-time entries to the flag: the part lap at the fork included
  const fmt = (s) => s.toFixed(1) + " s";

  function stage(G) {
    const previous = G.raceTyreWear;
    if (previous !== "real") G.raceTyreWear = "real";
    return () => {
      teardown(G);
      if (G.raceTyreWear !== previous) G.raceTyreWear = previous;
    };
  }
  function teardown(G) {
    const r = run;
    run = null;
    // Every step runs even when one throws (a quit mid-branch restores the world onto a torn-down session): the hold
    // and the freeze must always be released, and the registry's own restore runs after this.
    const safe = (f) => { try { f(); } catch (e) { Log.warn("ui", "vsc drill teardown: " + (e && e.message || e)); } };
    safe(() => SimDrill.hide());
    if (r && r.sim) safe(() => r.sim.cancel());
    safe(() => { if (G.holdCaution) G.holdCaution(0, "DRILL"); });
    safe(() => { if (G.agentCtl) G.agentCtl.freeze(false); });
  }

  /** A round that cannot go on (the what-if service did not load, a branch failed or missed the flag): never a held
   *  race with no way out. RETRY replays the rounds; QUIT ends the drill (game.js quitToMenu → end()). */
  function failed(r, why) {
    Log.warn("ui", "vsc drill: " + why);
    r.phase = "failed";
    try { r.sim.cancel(); } catch (_) { /* the panel below is the way out */ }
    SimDrill.panel({ title: "THE STRATEGY DRILL COULD NOT RUN THAT ROUND", lines: [why],
      buttons: [{ label: "RETRY", key: "r", side: "left", run: () => retry() }, { label: "QUIT", key: "q", side: "right", run: () => r.G.quitToMenu() }] });
  }

  function begin(G, port) {
    const you = youOf(G);
    if (!G.track || !you || G.state !== "count" || !G.tyres || !G.tyres.on() || !G.pits || !G.coach.captureWorld) return false;
    if (!G.goRolling()) return false;
    G.agentCtl.freeze(true);   // the live race is held: the branches are the only ticks
    const sim = SimDrill.create(G);
    run = { G, port, sim, base: sim.capture(), round: 0, F: null, picks: [], results: [], phase: "loading" };
    const r = run;
    sim.ready().then((ok) => {
      if (run !== r) return;
      if (!ok) { failed(r, "The what-if service (DrillFork) did not load."); return; }
      r.phase = "ready";
      startRound(0);
    }).catch((e) => { if (run === r) failed(r, "Could not start: " + (e && e.message || e)); });
    return true;
  }

  /** Round k: the base world, this round's staging, then the fork every branch of the round starts from. */
  function startRound(k) {
    const r = run, G = r.G, sc = ROUNDS[k], you = youOf(G);
    r.round = k;
    r.sim.restore(r.base);
    SimDrill.place(G, you, { lap: sc.lap, wear: sc.wear, beforePitM: BEFORE_PIT_M });
    r.F = r.sim.fork();
    r.phase = "decide";
    const left = G.tyres.lapsLeft(you), loss = G.pits.lossS();
    SimDrill.panel({
      title: "ROUND " + (k + 1) + "/" + ROUNDS.length + " · VSC! BOX OR STAY?",
      lines: [
        sc.label + " (" + (you.code || "your car") + ", the AI drives: you make the call).",
        "Tyres: " + Math.round(100 * G.tyres.spent(you)) + " % worn" + (left == null ? "" : ", about " + left.toFixed(1) + " laps left on the set") + ".",
        "Pit stop at green: about " + fmt(loss) + " lost. Under the VSC the road slows; the pit lane does not.",
      ],
      buttons: [
        { label: "BOX", key: "b", side: "left", run: () => choose("box") },
        { label: "STAY OUT", key: "s", side: "right", run: () => choose("stay") },
      ],
    });
  }

  /** The two branches of one round: your call is just which one you picked. */
  function branches(G, F, k) {
    const sc = ROUNDS[k], you = youOf(G), i = G.cars.indexOf(you);
    const until = { seconds: Math.ceil(flagLaps(sc) * G.track.total / LAP_CAP_V) };
    const drive = (stopAt) => () => {
      const plan = you.pitPlan || {};
      // The AI pit wall's own plan for this branch (written inside the branch, restored with it): scripted, so it
      // never replans, with the stop the STAY call runs (or none). BOX's stop is the decision below.
      you.pitPlan = Object.assign({}, plan, { scripted: true, stops: stopAt == null ? 0 : 1, lapsAt: stopAt == null ? [] : [stopAt],
        seq: [you.tyreClass || (plan.seq && plan.seq[0]) || "medium", "medium"] });
      let t = 0, level = -1;
      return { step(dt) {
        const want = t < VSC_S ? 2 : 0;
        if (want !== level) { G.holdCaution(want, "DRILL"); level = want; }
        t += dt;
        return SimDrill.PARK;
      } };
    };
    return [
      { key: "box", decisions: [{ car: i, lap: 0, action: "box" }], until, opts: { drive: drive(null) } },
      { key: "stay", decisions: [], until, opts: { drive: drive(sc.stayStop) } },
    ];
  }

  /** Your car's race time to the flag in one branch (null: it did not get there). */
  function timeToFlag(G, job, k) {
    if (!job || job.state !== "done") return null;
    const c = job.result.cars[G.cars.indexOf(youOf(G))], n = flagLaps(ROUNDS[k]);
    if (!c || !c.finished || c.lapTimes.length < n) return null;
    return { t: c.lapTimes.slice(0, n).reduce((a, x) => a + x, 0), stops: c.stops };
  }

  function choose(pick) {
    const r = run;
    if (!r || r.phase !== "decide") return false;
    r.phase = "running";
    r.picks[r.round] = pick;
    const k = r.round;
    SimDrill.panel({ title: "ROUND " + (k + 1) + " · YOU CALLED " + (pick === "box" ? "BOX" : "STAY OUT"),
      lines: ["Running both calls to the flag from this moment…"] });
    r.sim.run(r.F, branches(r.G, r.F, k), (jobs) => roundDone(r, k, jobs));
    return true;
  }

  function roundDone(r, k, jobs) {
    if (run !== r) return;
    const G = r.G, box = timeToFlag(G, jobs.box, k), stay = timeToFlag(G, jobs.stay, k);
    if (!box || !stay) {
      failed(r, "A branch did not reach the flag: " + JSON.stringify([jobs.box && jobs.box.state, jobs.stay && jobs.stay.state, jobs.box && jobs.box.error, jobs.stay && jobs.stay.error]));
      return;
    }
    r.sim.restore(r.base);   // the held race shows the start of the drill again, not a branch's last frame
    const pick = r.picks[k], best = box.t <= stay.t ? "box" : "stay";
    const lost = (pick === "box" ? box.t : stay.t) - Math.min(box.t, stay.t);
    const res = { id: ROUNDS[k].id, pick, best, box: +box.t.toFixed(2), stay: +stay.t.toFixed(2), lost: +lost.toFixed(2),
      right: lost < 1e-9 };
    r.results[k] = res;
    r.phase = "result";
    const name = (p) => (p === "box" ? "BOX" : "STAY OUT");
    const last = k === ROUNDS.length - 1;
    SimDrill.panel({
      title: "ROUND " + (k + 1) + ": " + (res.right ? "RIGHT CALL" : lost < MARGINAL_S ? "MARGINAL MISS" : "WRONG CALL"),
      lines: [
        "BOX: " + fmt(box.t) + " to the flag · STAY OUT: " + fmt(stay.t) + ".",
        name(best) + " was worth " + fmt(Math.abs(box.t - stay.t)) + (res.right ? ": you called it." : ": you lost " + fmt(lost) + "."),
      ],
      buttons: [{ label: last ? "RESULT" : "NEXT ROUND", key: "enter", side: "right", run: () => next() }],
    });
  }

  function next() {
    const r = run;
    if (!r || r.phase !== "result") return false;
    if (r.round + 1 < ROUNDS.length) { startRound(r.round + 1); return true; }
    r.phase = "done";
    SimDrill.hide();
    r.port.result(score(r.results));
    return true;
  }

  /** The drill's result from the three rounds: measured times only, one verdict from them. */
  function score(results) {
    const right = results.filter((x) => x.right).length, lost = results.reduce((a, x) => a + x.lost, 0);
    const name = (p) => (p === "box" ? "BOX" : "STAY");
    const metrics = results.map((x, k) => ["R" + (k + 1) + " " + ROUNDS[k].id, name(x.pick) + (x.right ? " ✓" : x.lost < MARGINAL_S ? " (marginal)" : " ✗") +
      " · " + name(x.best) + " by " + Math.abs(x.box - x.stay).toFixed(1), "s"]);
    metrics.push(["Time lost to calls", +lost.toFixed(1), "s"]);
    const verdict = right === results.length ? "Every call right: the flag is the same each time, the set's life and the laps to go decide."
      : "You lost " + lost.toFixed(1) + " s: a VSC makes a stop cheap, not free. Box when a stop is due anyway; stay when the set reaches the flag.";
    return { value: right, unit: "of " + results.length, better: "high", clean: true, metrics, verdict, rounds: results };
  }

  /** RETRY: the three rounds again from the drill's start. */
  function retry() {
    const r = run;
    if (!r || r.phase === "loading") return false;   // the first round has not been staged yet
    r.sim.cancel();
    r.picks = [];
    r.results = [];
    try { startRound(0); } catch (e) { failed(r, "Could not restart: " + (e && e.message || e)); }
    return true;
  }

  const state = () => (run ? { phase: run.phase, round: run.round, picks: run.picks.slice(), results: run.results.slice() } : null);

  function define() {
    if (typeof DrillRegistry === "undefined") return;
    DrillRegistry.define({
      id: "vsc", lesson: "vsc", kind: "sim", title: "VSC: BOX OR STAY",
      setup: { laps: LAPS, flow: "gp", session: "race", track: "redbull", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      stage, begin, retry, medals: MEDALS,
    });
  }
  define();

  /** Tests (SimDrill.sync(true)): run the round's queued branches now. */
  const drain = () => { if (run) run.sim.drain(); return state(); };
  /** Tests: one time slice of the round's first queued branch (a branch left running mid-way). */
  const slice = (ms) => { if (run) run.sim.slice(ms); return state(); };

  return Object.freeze({ define, choose, next, drain, slice, state, score, ROUNDS, MEDALS, VSC_S });
})();
