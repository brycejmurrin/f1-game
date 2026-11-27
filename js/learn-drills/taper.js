/* Apex 26 — TAPER HUNT: LEARN's deployment drill on track (#6559 step 6, #6550 D1). A solo Monza Time Trial placed
   just past the line at 42 % of top speed, with 1.0 Apex MJ in the store (a quarter: about 1.25 s of BOOST at the
   default deploy). Flat out to a gate 400 m down the straight (RaceInsights' "taper" goal); the player picks WHEN to
   press BOOST. Electric push is full below TAPER_LO (vStd 41 m/s, 148 km/h std) and fades to the 0.35 floor at
   TAPER_HI (53 m/s), so the same store buys almost three times the push early as late, and the stopwatch shows it.
   The widget plots that curve (PaceMath.taperAt, the very function the physics calls) with the car on it.
   SCORE: the speed BOOST bought, the integral of DEPLOY_A x taper while deploying, in dash km/h (standard pace, so
   the same at every PACE; higher is better). Below half speed the car also harvests as it accelerates (part-load),
   so the VM's best run presses BOOST about 1.5 s in, not at once: the store has topped up and the push is still
   ~85 %. That run is also the fastest down the straight. Clean = the store spent to empty, no lift and no brake
   before the gate. Medal tiers come from VM rollouts (tests/data/learn-drill-refs.json "taper",
   tests/unit/drill-taper-vm.test.mjs).
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the widget read the player's speed, energy, pedals and
   deploy flag, never curvature or the racing line. begin() is the only write (placement and the store), as the
   Aero drill places its cars. LAZY_LEARN: defined at eval when the registry is up, else by LearnDoor.defineDrills. */
const TaperDrill = (function () {
  "use strict";

  const START_M = 20;        // arc metres past the line: the whole run is one lap, no line crossing
  const START_K = 0.42;      // of vTop(): vStd ~30 m/s, below the taper band
  const STORE = 0.25;        // c.energy at the start: 1.0 Apex MJ of ES_MJ 4
  const LIFT_S = 0.3;        // throttle under 90 % this long is a lift
  // Speed-bought tiers (km/h) from 10 VM runs (tests/data/learn-drill-refs.json "taper", the rule in its "rule" field).
  const MEDALS = Object.freeze({ bronze: 14.8, silver: 19.5, gold: 22.4, goldClean: true });
  const MJ = v => (v * (PhysicsConsts.ES_MJ || 4)).toFixed(2);

  /** The car's standard-pace speed (vStd) and its taper right now: what game.js's deployTaper(c) returns. */
  function taperOf(G, c) {
    const vs = Math.abs(c.speed) * PhysicsConsts.VMAX / Math.max(1e-6, G.vTop());
    return { vs, taper: PaceMath.taperAt(vs, c.otT > 0) };
  }

  /** Read-only accumulator, one call per host tick (registry.js tick). */
  function sample(G, acc) {
    const c = G.player;
    if (!c) return;
    const dt = acc.t == null ? 0 : Math.max(0, G.raceT - acc.t);
    acc.t = G.raceT;
    if (acc.e == null) Object.assign(acc, { e: c.energy, depS: 0, taperS: 0, pushS: 0, spent: 0, liftS: 0, fail: "", emptied: false, vOn: null, vOff: null });
    const { vs, taper } = taperOf(G, c);
    if (c.deploying) {
      acc.depS += dt;
      acc.taperS += taper * dt;
      acc.pushS += PhysicsConsts.DEPLOY_A * taper * dt;   // std m/s the store bought (aStd of DEPLOY_A·PACE·taper)
      acc.spent += Math.max(0, acc.e - c.energy);
      if (acc.vOn == null) acc.vOn = c.speed;
      acc.vOff = c.speed;
      if (c.energy <= 1e-3) acc.emptied = true;
    }
    acc.e = c.energy;
    acc.liftS = (c.throttleDemand || 0) < 0.9 ? acc.liftS + dt : 0;
    if (!acc.fail && (c.brakeDemand || 0) > 0.05) acc.fail = "braked before the gate";
    if (!acc.fail && acc.liftS > LIFT_S) acc.fail = "lifted before the gate";
    acc.vGate = c.speed;
    acc.vsGate = vs;
  }

  /** The result: the speed the store bought, in dash km/h (standard pace), measured metrics only, one verdict.
   *  last is RaceInsights' lastDrill. */
  function score(G, last, acc) {
    const value = +(3.6 * (acc.pushS || 0)).toFixed(1);
    const taper = acc.depS > 0 ? 100 * acc.taperS / acc.depS : 0;
    const reason = acc.fail || last.reason || (acc.emptied ? "" : "store not spent");
    const clean = !!last.clean && !acc.fail && !!acc.emptied;
    const AO = AppearanceOpts;
    const kmh = v => { const k = G.dashKph ? G.dashKph(Math.abs(v)) : Math.abs(v) * 3.6; return (AO ? AO.speed(k) : Math.round(k)) + (AO && AO.units() === "mph" ? " mph" : " km/h"); };
    const fade = kmh(PhysicsConsts.TAPER_LO * G.vTop() / PhysicsConsts.VMAX);
    const verdict = acc.depS === 0 ? "No BOOST: the store went unspent. Press BOOST once on the straight and watch where the push lands."
      : !clean ? "The run ended: " + reason + ". Stay flat out to the gate and let BOOST run the store empty."
      : value >= MEDALS.gold ? "BOOST bought " + value.toFixed(1) + " km/h: the store had topped up and the push was still strong (" + taper.toFixed(0) + " % taper)."
      : taper >= 95 ? "Full push (" + taper.toFixed(0) + " %), but the store was still small: below half speed the car harvests as it accelerates. Wait a moment, then BOOST before " + fade + "."
      : "The push had faded to " + taper.toFixed(0) + " %: the same energy pushes hardest below " + fade + ". Press BOOST earlier.";
    return {
      value, unit: "km/h", better: "high", clean, reason: clean ? "" : reason, straightS: +(last.seconds || 0).toFixed(2),
      metrics: [
        ["Speed bought", value.toFixed(1), "km/h"],
        ["Taper while deploying", taper.toFixed(0), "%"],
        ["Store spent (Apex MJ)", MJ(acc.spent || 0), "MJ"],
        ["Straight time", (last.seconds || 0).toFixed(2), "s"],
        ["Trap speed", kmh(acc.vGate || 0), ""],
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
    player.speed = G.vTop() * START_K;
    player.gear = 5;
    player.energy = STORE;
    player.boostOn = false;
    RealRace.seatOnRoad(track, player);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("taper");
    return G.coach.mark();
  }

  /** The live widget: the taper curve over standard-pace speed, the car on it, a trail where BOOST ran. Render-only. */
  function guide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-taper-guide";
    root.hidden = true;
    const scope = document.createElement("canvas");
    scope.width = 280; scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-taper-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => port.retry());
    const copy = document.createElement("div");
    copy.append(task, readout, retry);
    root.append(scope, copy);
    document.body.append(root);
    const V0 = 20, V1 = 80, W = scope.width, H = scope.height, PAD = 10;
    const xOf = vs => PAD + (Math.min(V1, Math.max(V0, vs)) - V0) / (V1 - V0) * (W - 2 * PAD);
    const yOf = k => H - PAD - k * (H - 2 * PAD);
    const trail = [];
    let next = 0;
    function paint(vs, taper, on) {
      ctx.clearRect(0, 0, W, H);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const v of [PhysicsConsts.TAPER_LO, PhysicsConsts.TAPER_HI]) { ctx.moveTo(xOf(v), PAD); ctx.lineTo(xOf(v), H - PAD); }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let v = V0; v <= V1; v += 1) { const y = yOf(PaceMath.taperAt(v, false)); v === V0 ? ctx.moveTo(xOf(v), y) : ctx.lineTo(xOf(v), y); }
      ctx.stroke();
      ctx.fillStyle = "rgba(0,220,255,.55)";
      for (const [v, k] of trail) ctx.fillRect(xOf(v) - 1.5, yOf(k) - 1.5, 3, 3);
      ctx.fillStyle = on ? "#00dcff" : "#ffffff";
      ctx.beginPath(); ctx.arc(xOf(vs), yOf(taper), 6, 0, Math.PI * 2); ctx.fill();
    }
    function draw() {
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = performance.now();
      if (now < next) return false;
      next = now + 66;   // 15 Hz is enough for a gauge
      const c = G.player;
      if (!c) return false;
      const { vs, taper } = taperOf(G, c);
      if (c.deploying) { trail.push([vs, taper]); if (trail.length > 90) trail.shift(); }
      else if (c.energy >= STORE - 1e-6 && trail.length) trail.length = 0;   // RETRY refilled the store: a new run
      paint(vs, taper, !!c.deploying);
      root.hidden = false;
      task.textContent = c.energy > 1e-3 ? "Flat out. Press BOOST once: where does the push land?" : "Store spent. Stay flat to the gate.";
      const status = "Taper " + Math.round(100 * taper) + " % · +" + (PhysicsConsts.DEPLOY_A * taper).toFixed(1) + " m/s² · " + MJ(c.energy) + " MJ left";
      if (readout.textContent !== status) readout.textContent = status;
      return false;   // no road markings
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;   // LAZY_LEARN has no edges: js/ui/learn-door.js defines it again once the registry is up
    return DrillRegistry.define({
      id: "taper", lesson: "deployment", title: "Monza Taper Hunt",
      setup: { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      begin, guide, goal: "taper", sample, score,
      medals: MEDALS,
    });
  }
  define();

  return Object.freeze({ define, sample, score, begin, MEDALS, STORE, START_K, START_M });
})();
