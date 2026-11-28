/* Apex 26 — TYRE THERMAL LAB: LEARN's tyre-heat lesson on track (#6559 step 8, #6551 §1). A Monza race on REAL
   tyre wear (the only level where TyreModel runs temperatures), the player on a fresh MEDIUM set out of the blankets
   (T_BLANKET 70 °C) and rolling just past the line; the run is RaceInsights' "thermal" goal and ends at a gate 150 m
   before the line. The lesson it makes playable: heat comes from load x speed, the surface reacts in seconds and the
   core in half a minute, and a cold tyre that slides grains. The widget is a 280x148 strip chart of the surface
   (orange) and the core (blue) against the window band optTemp +- T_WINDOW, the lab's palette.
   SCORE: the share of the run with the surface inside its window, in % (higher is better). The card also gives the
   time the window was first reached, the core's peak against the blistering point (optTemp + T_WINDOW + BLIST_OVER)
   and the graining the run added. Medal tiers come from VM rollouts (tests/data/learn-drill-refs.json "tyre-heat",
   pinned by tests/unit/drill-tyre-heat-vm.test.mjs).
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the widget read only the player's tyre fields (tyreTs,
   tyreTb, tyreGrain, tyreBlister, tyre.life), TyreModel's constants and the race clock. No curvature, no racing line,
   nothing written to a car outside begin()'s placement and fresh set. stage() turns tyre wear to REAL for the drill
   and its undo puts the player's level back. LAZY_LEARN: defined at eval when the registry is already up, else by
   LearnDoor.defineDrills (bundle order is not evaluation order). */
const TyreHeatDrill = (function () {
  "use strict";

  const START_S = 100;          // arc metres: just past the line, the whole lap ahead
  const RIVAL_AHEAD = 1500;     // the drill race's one other car, placed well up the road and quicker: no traffic
  const COMPOUND = "medium";
  const SERIES_DT = 1;          // s between the card's chart samples
  const HISTORY = 240;          // the widget's strip: 60 s at 4 Hz
  const SLIDE = 0.2;            // c.skidIntensity that counts as a slide (the graining input)
  const T_LO = 50, T_HI = 150;  // the strip's temperature axis, °C
  // Medal tiers in % of the run with the surface in its window: the VM-derived tiers
  // (tests/data/learn-drill-refs.json "tyre-heat"; regenerate with node tests/helpers/tyre-heat-drill-vm.mjs --write).
  const MEDALS = Object.freeze({ bronze: 56, silver: 85.7, gold: 90.3, goldClean: true });

  /** The window for this set: {opt, lo, hi, blister} in °C (TyreModel's own optTemp, T_WINDOW and BLIST_OVER). */
  function windowOf(c) {
    const opt = TyreModel.optTemp(c && c.tyre ? c.tyre.life : null), w = TyreModel.T_WINDOW;
    return { opt, lo: opt - w, hi: opt + w, blister: opt + w + TyreModel.BLIST_OVER };
  }

  /** Read-only accumulator, one call per host tick (registry.js tick): time in the window, the first entry, the
   *  core's peak, the graining added and the slides on a cold surface, and a 1 Hz series for the card. */
  function sample(G, acc) {
    const p = G.player;
    if (!p || !p.tyre || !Number.isFinite(p.tyreTs) || !Number.isFinite(p.tyreTb)) return;
    const w = windowOf(p), now = G.raceT;
    if (acc.t0 == null) {
      Object.assign(acc, { t0: now, t: now, runS: 0, inS: 0, firstIn: null, tbMax: p.tyreTb, tsMax: p.tyreTs,
        grain0: p.tyreGrain || 0, grain: p.tyreGrain || 0, blister: p.tyreBlister || 0, coldSlideS: 0, slides: 0,
        sliding: false, nextS: now, surface: [], core: [], w });
    }
    const dt = Math.max(0, now - acc.t);
    acc.t = now;
    acc.runS += dt;
    const inWindow = p.tyreTs >= w.lo && p.tyreTs <= w.hi;
    if (inWindow) { acc.inS += dt; if (acc.firstIn == null) acc.firstIn = now - acc.t0; }
    acc.tbMax = Math.max(acc.tbMax, p.tyreTb);
    acc.tsMax = Math.max(acc.tsMax, p.tyreTs);
    acc.grain = p.tyreGrain || 0;
    acc.blister = p.tyreBlister || 0;
    const sliding = (p.skidIntensity || 0) > SLIDE && p.tyreTs < w.lo;
    if (sliding) { acc.coldSlideS += dt; if (!acc.sliding) acc.slides++; }
    acc.sliding = sliding;
    if (now >= acc.nextS) {
      acc.nextS = now + SERIES_DT;
      acc.surface.push(+p.tyreTs.toFixed(1));
      acc.core.push(+p.tyreTb.toFixed(1));
    }
  }

  /** The result: % of the run in the window, measured metrics only, one verdict sentence. last is lastDrill. */
  function score(G, last, acc) {
    const w = acc.w || windowOf(G.player), run = acc.runS || 0;
    const value = run > 0 ? +(100 * acc.inS / run).toFixed(1) : 0;
    const grainPP = 100 * Math.max(0, (acc.grain || 0) - (acc.grain0 || 0));
    const p = G.player, lag = p && Number.isFinite(p.tyreTs) ? p.tyreTs - p.tyreTb : 0;
    const band = w.lo.toFixed(0) + "–" + w.hi.toFixed(0) + " °C";
    const reached = acc.firstIn == null ? "never" : acc.firstIn.toFixed(0);
    const verdict = !last.clean
      ? "The run ended: " + last.reason + ". The surface sat in its " + band + " window " + value.toFixed(0) + " % of the run."
      : (acc.firstIn == null ? "The surface never reached its " + band + " window: carry more speed and load to build heat."
        : "The surface was in its " + band + " window " + value.toFixed(0) + " % of the run, first at " + reached + " s; the core "
          + (lag > 0 ? "still lagged it by " + lag.toFixed(0) + " °C at the gate." : "had caught it by the gate."))
        + (grainPP >= 0.05 ? " Sliding on a cold surface grained it +" + grainPP.toFixed(1) + " pp." : "");
    return {
      value, unit: "%", better: "high", clean: !!last.clean, reason: last.reason || "",
      metrics: [
        ["In the window", value.toFixed(0), "%"],
        ["Window (" + band + ")", reached, acc.firstIn == null ? "" : "s"],
        ["Core peak", (acc.tbMax || 0).toFixed(0) + " of " + w.blister.toFixed(0) + " (blisters)", "°C"],
        ["Grain", "+" + grainPP.toFixed(1) + (acc.slides ? " · " + acc.slides + " cold slides" : ""), "pp"],
        ["Run time", (last.seconds || 0).toFixed(1), "s"],
        ["Run", last.clean ? "clean" : last.reason, ""],
      ],
      verdict,
      series: { surface: (acc.surface || []).slice(), core: (acc.core || []).slice(), lo: w.lo, hi: w.hi, dt: SERIES_DT },
    };
  }

  /** Run `apply` (a G.raceTyreWear write, whose setter persists) without changing the SAVED tyreWear option: a tab
   *  closed mid-drill must not leave the player's setting at "real" (LobbySettings.roomOnly's pattern). */
  function keepSaved(G, apply) {
    const st = G.store, had = st && st.get ? st.get("tyreWear", undefined) : undefined;
    apply();
    if (!st) return;
    if (had === undefined) { if (st.rawDel) st.rawDel("tyreWear"); } else if (st.set) st.set("tyreWear", had);
  }

  /** Tyre wear REAL for the drill's race (TyreModel runs temperatures only when wear is on), live only, never
   *  saved; the undo restores it. */
  function stage(G) {
    const previous = G.raceTyreWear;
    if (previous !== "real") keepSaved(G, () => { G.raceTyreWear = "real"; });
    return () => { if (G.raceTyreWear !== previous) keepSaved(G, () => { G.raceTyreWear = previous; }); };
  }

  function begin(G) {
    const track = G.track, player = G.player, rival = G.cars.find(c => c !== player);
    if (!track || !player || G.state !== "count" || !G.tyres || !G.tyres.on()) return false;
    const place = (c, s, speed, gear) => {
      c.s = c._prevS = c.prog = c.rPrevS = s;
      c.lap = 1;
      c.x = c.xVis = c.rPrevX = TrackLine.at(track, s).x;
      c.speed = speed;
      c.gear = gear;
      RealRace.seatOnRoad(track, c);
    };
    place(player, START_S, G.vTop() * 0.5, 4);
    if (rival) place(rival, START_S + RIVAL_AHEAD, G.vTop() * 0.8, 6);
    G.tyres.fit(player, G.tyres.classRecord(COMPOUND));   // a fresh set, out of the blankets
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("thermal");
    return G.coach.mark();
  }

  /** The live widget: the surface and core strip chart against the window band, the readouts and RETRY. Render-only. */
  function guide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-tyre-heat-guide";
    root.hidden = true;
    const scope = document.createElement("canvas");
    scope.width = 280;
    scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    task.textContent = "Bring the surface into its window and keep it there to the line";
    const readout = document.createElement("span");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-tyre-heat-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => { if (port) port.retry(); });
    const copy = document.createElement("div");
    copy.append(task, readout);
    root.append(scope, copy, retry);
    document.body.append(root);
    const surf = new Float32Array(HISTORY), core = new Float32Array(HISTORY);
    let head = 0, filled = 0, next = 0, lastT = -1;
    const yOf = t => scope.height - 4 - (Math.max(T_LO, Math.min(T_HI, t)) - T_LO) / (T_HI - T_LO) * (scope.height - 8);
    function trace(buf, colour) {
      const step = scope.width / (HISTORY - 1);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < filled; k++) {
        const i = (head - filled + k + HISTORY) % HISTORY, x = scope.width - (filled - 1 - k) * step;
        if (k) ctx.lineTo(x, yOf(buf[i])); else ctx.moveTo(x, yOf(buf[i]));
      }
      ctx.stroke();
    }
    function paint(w, p) {
      ctx.clearRect(0, 0, scope.width, scope.height);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.fillRect(0, yOf(w.hi), scope.width, yOf(w.lo) - yOf(w.hi));
      trace(core, "#368ec7");
      trace(surf, "#e58342");
      // the defect pip: grain (surface damage) amber, blister (bulk damage) red
      const pip = (p.tyreBlister || 0) > 0.001 ? "#ff3b30" : (p.tyreGrain || 0) > 0.001 ? "#ffcc00" : null;
      if (pip) { ctx.fillStyle = pip; ctx.beginPath(); ctx.arc(scope.width - 8, 8, 5, 0, Math.PI * 2); ctx.fill(); }
    }
    function draw() {
      const p = G.player;
      if (G.state !== "race" || !p || !p.tyre || !Number.isFinite(p.tyreTs)) { root.hidden = true; return false; }
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now < next) return false;
      next = now + 250;   // 4 Hz: the surface moves in seconds, the core in tens of seconds
      if (G.raceT < lastT) filled = 0;   // RETRY or a rewind: a fresh strip
      lastT = G.raceT;
      surf[head] = p.tyreTs;
      core[head] = p.tyreTb;
      head = (head + 1) % HISTORY;
      filled = Math.min(HISTORY, filled + 1);
      const w = windowOf(p);
      paint(w, p);
      root.hidden = false;
      const grip = G.tyres && G.tyres.gripMul ? G.tyres.gripMul(p) : 1, lag = p.tyreTs - p.tyreTb;
      const text = "Surface " + p.tyreTs.toFixed(0) + " °C · core " + p.tyreTb.toFixed(0) + " °C · window "
        + w.lo.toFixed(0) + "–" + w.hi.toFixed(0) + " · grip ×" + grip.toFixed(2)
        + (lag > 3 ? " · core lags " + lag.toFixed(0) + " °C" : "");
      if (readout.textContent !== text) readout.textContent = text;
      return false;   // no road markings: the replay ghost keeps the road
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;
    return DrillRegistry.define({
      id: "tyre-heat", lesson: "tyre-heat", title: "Monza Tyre Thermal Lab",
      setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      stage, begin, guide, goal: "thermal", sample, score, medals: MEDALS,
    });
  }
  define();

  return Object.freeze({ define, windowOf, sample, score, stage, MEDALS, COMPOUND, START_S });
})();
