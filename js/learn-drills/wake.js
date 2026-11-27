/* Apex 26 — WAKE FOOTPRINT: the Chassis X-Ray drill (#6559 step 7, #6555 §1). A Monza GP duel placed 18 m behind the
   rival on the run to the Curva Grande. The air behind a car is a footprint, strongest close and straight behind: follow
   through the corner keeping as much grip as you can while staying within 30 m. Stepping a car-width aside recovers
   most of the grip; staying in line keeps the tow.
   A run is RaceInsights' "corner" goal (race-insights.js: it ends at the corner's exit; contact or leaving the track
   fails it), so no eager code grows; this file adds the leash: over LEASH_M behind, or past the rival, fails the run. GRIP RETAINED, the score, is the time-weighted mean of
   c._dirtyAirMul (the multiplier player-forces actually applied) over the corner window, in %. Medal tiers: MEDALS
   below, from VM rollouts (tests/data/learn-drill-refs.json "wake", tests/unit/drill-wake-vm.test.mjs).
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the guide read car positions and the stashed wake fields;
   the corner is the curated track.def.turns, never the curvature table. Nothing is written to a car outside begin()'s
   placement, as the Aero drill places its cars. The guide reuses the Aero guide's ids and styles (css/overlays.css):
   one drill runs at a time. LAZY_LEARN: defined at eval when the registry is up, else by LearnDoor.defineDrills. */
const WakeDrill = (function () {
  "use strict";

  const TURN = 2;            // Monza def.turns[2]: the Curva Grande apex (js/circuits/monza.js T3)
  const LEAD_M = 220;        // the start, metres before the apex: on the Curva Grande entry
  const GAP_M = 18;          // the rival's lead at the start, inside TOW_RANGE 34
  const P_SPEED = 0.92, R_SPEED = 0.84;   // fractions of vTop() at the start
  const WIN_IN = 200, WIN_OUT = 250;   // the scored window around the apex, arc metres
  const LEASH_M = 30, SIDE_M = 2.4;   // m: the leash (TOW_RANGE 34 less a margin); past the rival (RaceInsights' SIDE_M)
  const WAKE_HOT = 0.5;      // "in the wake" for the time-in-wake metric
  // Grip retained, %. From 7 VM runs (tests/data/learn-drill-refs.json "wake", pinned by drill-wake-vm.test.mjs):
  // bronze = a centred follow, gold = 2 m (a car-width) to the side, silver = halfway; gold needs a clean run.
  const MEDALS = Object.freeze({ bronze: 92.2, silver: 94, gold: 95.8, goldClean: true });

  const rivalOf = G => G.cars.find(c => c !== G.player) || null;
  const apexS = G => G.track.def.turns[TURN] * G.track.total;

  /** Read-only accumulator, one call per host tick: the multiplier, the offset and the gap inside the window. */
  function sample(G, acc) {
    const p = G.player, r = rivalOf(G);
    if (!p || !r || !G.track) return;
    const dt = acc.t == null ? 0 : Math.max(0, G.raceT - acc.t), a = apexS(G);
    acc.t = G.raceT;
    if (acc.n == null) Object.assign(acc, { n: 0, sumS: 0, mul: 0, minMul: 1, hotS: 0, offS: 0, gapMin: Infinity, gapMax: 0, series: [] });
    if (p.s < a - WIN_IN || p.s > a + WIN_OUT || !dt) return;   // the leash binds inside the scored window
    const mul = Number.isFinite(p._dirtyAirMul) ? p._dirtyAirMul : 1, gap = r.prog - p.prog;
    if (!acc.fail) acc.fail = gap > LEASH_M ? "fell over " + LEASH_M + " m behind" : gap < -SIDE_M ? "went past the rival" : "";
    acc.n++;
    acc.sumS += dt;
    acc.mul += mul * dt;
    acc.minMul = Math.min(acc.minMul, mul);
    if ((p.wake || 0) > WAKE_HOT) acc.hotS += dt;
    acc.offS += Math.abs((p.x || 0) - (r.x || 0)) * dt;
    acc.gapMin = Math.min(acc.gapMin, gap);
    acc.gapMax = Math.max(acc.gapMax, gap);
    if (acc.n % 6 === 1) acc.series.push(+(100 * mul).toFixed(1));
  }

  /** The result: grip retained in %, measured metrics only, one verdict computed from them. */
  function score(G, last, acc) {
    const t = acc.sumS || 0, mean = t > 0 ? acc.mul / t : 1, pct = +(100 * mean).toFixed(1);
    const off = t > 0 ? acc.offS / t : 0, hot = acc.hotS || 0, clean = !!last.clean && t > 0 && !acc.fail;
    const value = clean ? pct : 0;   // a run that fails (or never reaches the corner) earns no medal
    const reason = acc.fail || last.reason || (t > 0 ? "" : "never reached the corner");
    const verdict = !clean ? "The run ended: " + reason + ". Stay within 30 m and follow the rival through the Curva Grande."
      : value >= MEDALS.silver ? "You kept " + pct.toFixed(0) + " % grip, " + off.toFixed(1) + " m off his line: a car-width aside the wake thins out."
      : "You kept " + pct.toFixed(0) + " % grip with " + hot.toFixed(1) + " s deep in the wake: step a car-width aside to get the grip back.";
    return {
      value, unit: "%", better: "high", clean, reason, series: acc.series || [],
      metrics: [
        ["Grip retained", pct.toFixed(1), "%"],
        ["Lowest grip", (100 * (acc.minMul ?? 1)).toFixed(0), "%"],
        ["Deep in wake", hot.toFixed(1), "s"],
        ["Mean offset", off.toFixed(1), "m"],
        ["Gap", Number.isFinite(acc.gapMin) ? acc.gapMin.toFixed(0) + "–" + acc.gapMax.toFixed(0) : "—", "m"],
        ["Run", clean ? "clean" : reason, ""],
      ],
      verdict,
    };
  }

  function begin(G) {
    const track = G.track, player = G.player, rival = rivalOf(G);
    if (!player || !rival || !track || !track.def.turns || track.def.turns.length <= TURN || G.state !== "count") return false;
    const start = G.wrapS(apexS(G) - LEAD_M), speed = G.vTop();
    const place = (c, s, v) => {
      c.s = c._prevS = c.prog = c.rPrevS = s;
      c.lap = 1;
      c.x = c.xVis = c.rPrevX = TrackLine.at(track, s).x;
      c.speed = v;
      c.gear = 7;
      RealRace.seatOnRoad(track, c);
    };
    // The player carries more speed than the rival, as the Aero drill does: the AI out-accelerates a car in its wake,
    // and the head start keeps a flat-out follower inside the leash through the whole corner.
    place(player, start, speed * P_SPEED);
    place(rival, start + GAP_M, speed * R_SPEED);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("corner");
    return G.coach.mark();
  }

  /** The live card: a top view of the footprint, the wake, grip and tow readout, RETRY. Render-only, 10 Hz. */
  function guide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-aero-guide";
    root.dataset.drill = "wake";
    root.hidden = true;
    const scope = document.createElement("canvas");
    scope.width = 280;
    scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    task.textContent = "Follow through the Curva Grande: keep your grip, stay within 30 m";
    const readout = document.createElement("span");
    const copy = document.createElement("div");
    copy.append(task, readout);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-aero-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => port.retry());
    root.append(scope, copy, retry);
    document.body.append(root);
    const X = 140, Y = 20, SX = 13, SY = 3.6;   // px per metre: lateral, longitudinal
    let next = 0;
    function paint(gap, dx) {
      if (!ctx) return;
      ctx.clearRect(0, 0, scope.width, scope.height);
      for (let d = 1; d < 34; d++) for (let k = -16; k <= 16; k++) {
        const w = PhysicsConsts.DirtyAir.wakeOf(d, k / 4, G.raceDirtyAir || "classic");
        if (w < 0.03) continue;
        ctx.fillStyle = "rgba(30,231,255," + w.toFixed(2) + ")";
        ctx.fillRect(X + (k / 4) * SX - SX / 8, Y + d * SY, SX / 4 + 0.5, SY + 0.5);
      }
      ctx.fillStyle = "#90f1ff";
      ctx.fillRect(X - 0.95 * SX, Y - 3.4 * SY, 1.9 * SX, 3.4 * SY);   // the rival to scale: 1.9 m by 3.4 m
      ctx.fillStyle = "#fff";
      const px = M4.clamp(X + dx * SX, 14, 266), py = M4.clamp(Y + gap * SY, 12, 140);
      ctx.fillRect(px - 0.95 * SX, py, 1.9 * SX, 3.4 * SY);
    }
    function draw() {
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = typeof performance !== "undefined" ? performance.now() : 0, p = G.player, r = rivalOf(G);
      if (now < next || !p || !r) return false;
      next = now + 100;
      const gap = r.prog - p.prog, dx = (p.x || 0) - (r.x || 0), grip = Number.isFinite(p._dirtyAirMul) ? p._dirtyAirMul : 1;
      paint(gap, -dx);   // +x is LEFT: draw the player on the screen side he sits
      readout.textContent = "Wake " + (p.wake || 0).toFixed(2) + " · grip −" + Math.max(0, Math.round(100 * (1 - grip)))
        + " % · tow " + (p.towing || 0).toFixed(2) + " · gap " + gap.toFixed(0) + " m";
      root.hidden = false;
      return false;   // no road markings
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;
    return DrillRegistry.define({
      id: "wake", lesson: "chassis", title: "Monza Wake Footprint Drill",
      setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      begin, guide, goal: "corner", sample, score, medals: MEDALS,
    });
  }
  define();

  return Object.freeze({ define, sample, score, MEDALS, LEAD_M, GAP_M, WIN_IN, WIN_OUT });
})();
Object.freeze(WakeDrill);
