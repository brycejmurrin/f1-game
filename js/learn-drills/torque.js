/* Apex 26 — TORQUE FILL EXIT: LEARN's brake-blend drill on track (#6559 step 12, #6550 D3b). A solo Monza Time Trial
   placed 20 m past the line at 18 m/s standard pace, the slow exit of a corner, with 2 Apex MJ in the store. Flat out;
   the run ends the instant the car reaches TAPER_LO (vStd 41 m/s), where the deploy taper begins. Apex has no turbo
   lag, so what BOOST adds here is the taper's low-speed peak: full push, 3 m/s², the whole way. The player presses
   BOOST as the throttle goes down; the stopwatch shows what it bought.
   SCORE: the seconds BOOST took off the run, against NO_BOOST_S (the VM's unboosted run at the default pace, pinned by
   tests/unit/drill-torque-vm.test.mjs and tests/data/learn-drill-refs.json "torque"); higher is better. Clean = flat out,
   no brake. The card also shows the exit time and how long BOOST ran. Medals: 40 / 70 / 90 % of the best VM gain.
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the guide read speed, pedals, energy and the deploy flag, never
   curvature or the racing line; begin() is the only write (placement and the store, as the Taper Hunt places its car).
   LAZY_LEARN: defined at eval when the registry is up, else by LearnDoor.defineDrills. */
const TorqueDrill = (function () {
  "use strict";

  const START_M = 20;        // arc metres past the line
  const START_VS = 18;       // m/s standard pace at the start (a slow corner exit)
  const STORE = 0.5;         // c.energy at the start: 2 Apex MJ, about 2.5 s of BOOST at the default deploy
  const LIFT_S = 0.3;        // throttle under 90 % this long is a lift
  const NO_BOOST_S = 5.9;    // the VM's unboosted exit time, s (tests/data/learn-drill-refs.json "torque" base)
  const MEDALS = Object.freeze({ bronze: 0.96, silver: 1.68, gold: 2.16, goldClean: true });

  /** Read-only accumulator, one call per host tick. */
  function sample(G, acc) {
    const c = G.player;
    if (!c) return;
    const dt = acc.t == null ? 0 : Math.max(0, G.raceT - acc.t);
    acc.t = G.raceT;
    if (acc.liftS == null) Object.assign(acc, { depS: 0, liftS: 0, fail: "" });
    if (c.deploying) acc.depS += dt;
    acc.liftS = (c.throttleDemand || 0) < 0.9 ? acc.liftS + dt : 0;
    if (!acc.fail && (c.brakeDemand || 0) > 0.05) acc.fail = "braked before the taper";
    if (!acc.fail && acc.liftS > LIFT_S) acc.fail = "lifted before the taper";
  }

  /** The result: seconds gained on the unboosted run, one verdict. last is RaceInsights' lastDrill. */
  function score(G, last, acc, base = NO_BOOST_S) {
    const seconds = +(last.seconds || 0);
    const value = base > 0 ? +Math.max(0, base - seconds).toFixed(2) : 0;
    const reason = acc.fail || last.reason;
    const clean = !!last.clean && !acc.fail;
    const verdict = !(acc.depS > 0) ? "No BOOST: Apex has no turbo lag, so the electric push is the whole fill. Press BOOST as you pick up the throttle."
      : !clean ? "The run ended: " + reason + ". Stay flat out until the taper begins."
      : "BOOST took " + value.toFixed(2) + " s off the exit: below the taper the push is full, the engine alone is at its weakest.";
    return {
      value, unit: "s", better: "high", clean, reason: clean ? "" : reason, straightS: +seconds.toFixed(2),
      metrics: [
        ["Time gained", value.toFixed(2), "s"],
        ["Exit time", seconds.toFixed(2), "s"],
        ["BOOST ran", (acc.depS || 0).toFixed(1), "s"],
        ["Run", clean ? "clean" : reason, ""],
      ],
      verdict,
    };
  }

  function begin(G) {
    const track = G.track, player = G.player;
    if (!player || !track || G.state !== "count") return false;
    const s = G.wrapS(START_M);
    player.s = player._prevS = player.prog = player.rPrevS = s;
    player.lap = 1;
    player.x = player.xVis = player.rPrevX = TrackLine.at(track, s).x;
    player.speed = START_VS * G.vTop() / PhysicsConsts.VMAX;
    player.gear = 3;
    player.energy = STORE;
    player.boostOn = false;
    RealRace.seatOnRoad(track, player);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("torque");
    return G.coach.mark();
  }

  /** The live card: one instruction line, the store and the push, and RETRY. Render-only. */
  function guide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-torque-guide";
    root.hidden = true;
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-torque-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => port.retry());
    const copy = document.createElement("div");
    copy.append(task, readout, retry);
    root.append(copy);
    document.body.append(root);
    let next = 0;
    function draw() {
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = performance.now();
      if (now < next) return false;
      next = now + 66;
      const c = G.player;
      if (!c) return false;
      root.hidden = false;
      task.textContent = c.deploying ? "BOOST is filling the exit." : "Flat out. Press BOOST as you pick up the throttle.";
      const vs = Math.abs(c.speed) * PhysicsConsts.VMAX / Math.max(1e-6, G.vTop());
      const status = Math.round(vs) + " of " + PhysicsConsts.TAPER_LO + " m/s · " + (c.energy * (PhysicsConsts.ES_MJ || 4)).toFixed(2) + " MJ left";
      if (readout.textContent !== status) readout.textContent = status;
      return false;   // no road markings
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;
    return DrillRegistry.define({
      id: "torque", lesson: "brake-blend", title: "Monza Torque Fill Exit",
      setup: { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      begin, guide, goal: "torque", sample,
      score: (G, last, acc) => score(G, last, acc, NO_BOOST_S),
      medals: MEDALS,
    });
  }
  define();

  return Object.freeze({ define, sample, score, begin, MEDALS, STORE, START_VS, START_M, NO_BOOST_S });
})();
