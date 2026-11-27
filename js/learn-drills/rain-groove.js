/* Apex 26 — WET WEATHER LINES: find the groove (#6559 step 15, #6551 §5 variant A). Monza sector 3 (Ascari, Parabolica) on slicks over
   a road held at 0.18 wetness, a drying track just below the slick→inter crossover. The racing groove dries first
   (WeatherArc's drying line: up to DRYLINE_K of the water gone within ~2 m of a hashed wander), so the slick grips
   best there. The card scores the share of the sector driven on it.
   THE HOLD is the existing G.weatherArc setter, armed in begin(): a lap-wide arc from w0 = HOLD with a 1e9 s ramp,
   so the lag moves the road by ~1e-8 a minute (tests/unit/drill-rain-vm.test.mjs pins the hook). It is an ordinary
   live arc, the same water for every car; quitToMenu's endSession() clears it, the registry restores the weather.
   THE ARC NEVER REACHES THE DRIVER: the groove is SURFACE state (docs/PHYSICS.md §Curvature channels), a wander
   hashed from the lap fraction, never the racing line. sample() and score() read the player's s, x, speed and its
   grip through G.gripMult; nothing here reads curvature or TrackLine, and only begin() writes a car (placement).
   LAZY_LEARN with no edges: define() runs at eval when the registry is up, and again from LearnDoor.defineDrills. */
const RainDrill = (function () {
  "use strict";

  const HOLD = 0.18;                // road wetness: bestTread keeps the field on slicks below 0.20 (WET_GRIP)
  const START_IN = 30;              // metres into sector 3. The run is RaceInsights' sector timer, which reads the
                                    // sector index game.js last drew: the grid behind the line is sector 3 too.
  const IN_GROOVE = 0.5;            // dryLine at or above this: within ~1.8 m of the groove's centre
  const MEDALS = Object.freeze({ bronze: 65, silver: 74, gold: 84, goldClean: true });   // % in the groove: tests/data/learn-drill-refs.json "rain"

  const held = () => ({ from: "wet", to: "wet", w0: HOLD, i0: 0.5, seq: ["wet"], wetIn: null, t: 0, dur: 1e9 });

  function begin(G) {
    const p = G.player, rival = G.cars.find(c => c !== p);
    if (!p || G.state !== "count" || !G.track) return false;
    const place = (c, s, speed) => {
      c.s = c._prevS = c.prog = c.rPrevS = s;
      c.lap = 1;
      c.x = c.xVis = c.rPrevX = 0;
      c.speed = speed;
      c.gear = 5;
      RealRace.seatOnRoad(G.track, c);
    };
    const L = G.track.total, splits = G.track.def.sectors || [1 / 3, 2 / 3], start = splits[1] * L + START_IN;
    place(p, start, G.vTop() * 0.6);
    if (rival) place(rival, (start + L / 2) % L, G.vTop() * 0.5);   // half a lap away: a solo run
    G.weatherArc = held();
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("groove");
    return G.coach.mark();
  }

  /** Where the groove is from the player: metres to its centre (+ = right) and how much of it is under the car. */
  function grooveFrom(G, c) {
    const frac = c.s / G.track.total;
    return { off: WeatherArc.grooveX(frac) - c.x, under: WeatherArc.dryLine(frac, c.x) };
  }

  // Read-only, per frame of a live run (#6559 §1e rule 1).
  function sample(G, acc) {
    const p = G.player;
    if (!p || !G.track || !(G.track.total > 0)) return;
    const g = grooveFrom(G, p), grip = G.gripMult(p);
    if (acc.n == null) { acc.n = 0; acc.inG = 0; acc.grip = 0; acc.gripIn = 0; acc.gripOut = 0; acc.nOut = 0; }
    acc.n++;
    acc.grip += grip;
    if (g.under >= IN_GROOVE) { acc.inG++; acc.gripIn += grip; } else { acc.nOut++; acc.gripOut += grip; }
    acc.off = g.off;
    acc.under = g.under;
    acc.gripNow = grip;
  }

  /** Higher is better: % of the sector's frames in the groove. last is RaceInsights' lastDrill. */
  function score(G, last, acc) {
    const n = acc.n || 0, share = n ? (100 * acc.inG) / n : 0;
    const gIn = acc.inG ? acc.gripIn / acc.inG : null, gOut = acc.nOut ? acc.gripOut / acc.nOut : null;
    const pct = v => (v == null ? "—" : "×" + v.toFixed(3));
    const verdict = !last.clean ? "The run ended: " + last.reason + ". Stay on the road and steer for the drier groove."
      : share >= MEDALS.gold ? "You lived in the groove: on a drying road the rubbered-in line is where slicks grip."
      : "The groove grips " + (gIn != null && gOut != null ? ((gIn / gOut - 1) * 100).toFixed(1) + "% " : "")
        + "more than the wet road beside it. Follow its arrow to spend more of the sector on it.";
    return {
      value: share, unit: "%", better: "high", clean: !!last.clean, reason: last.reason || "",
      metrics: [
        ["In the groove", share.toFixed(0), "%"],
        ["Sector time", (last.seconds || 0).toFixed(2), "s"],
        ["Grip in groove", pct(gIn), ""],
        ["Grip off it", pct(gOut), ""],
        ["Road wetness", HOLD.toFixed(2), ""],
      ],
      verdict,
    };
  }

  /** The live task line (#learn-rain-guide, role=status): the groove's side and distance, and the grip under you. */
  function guide(G) {
    const root = document.createElement("div");
    root.id = "learn-rain-guide";
    root.hidden = true;
    root.setAttribute("role", "status");
    document.body.append(root);
    let last = "";
    return {
      draw() {
        const p = G.player;
        if (!p || !G.track || G.state !== "race") { root.hidden = true; return false; }
        const g = grooveFrom(G, p);
        const side = g.under >= IN_GROOVE ? "IN THE GROOVE" : "GROOVE " + (g.off > 0 ? "▶ " : "◀ ") + Math.abs(g.off).toFixed(1) + " m";
        const text = side + " · road " + HOLD.toFixed(2) + " wet · grip ×" + G.gripMult(p).toFixed(3);
        if (text !== last) { root.textContent = last = text; }
        root.hidden = false;
        return false;   // no road markings: the HUD line is the cue
      },
      hide() { root.hidden = true; },
      car() { return null; },
      remove() { root.remove(); },
    };
  }

  const DESC = Object.freeze({
    id: "rain", lesson: "rain", title: "Wet Weather Lines",
    setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "off", wind: "off" },
    begin, guide, goal: "groove", sample, score, medals: MEDALS,
  });
  function define() { return typeof DrillRegistry !== "undefined" ? DrillRegistry.define(DESC) : null; }
  define();

  return Object.freeze({ define, begin, sample, score, HOLD, MEDALS, IN_GROOVE });
})();
Object.freeze(RainDrill);
