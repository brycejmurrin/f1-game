/* Apex 26 — CAR FIELDS: pre-declare the fields a car only gains once the frame loop is running.
 *
 * makeCars() (js/game.js) spawns a car with ~176 own fields. The frame loop then
 * adds ~68 more, each the first time some branch runs (a pass plan, a kerb strike,
 * the first lap line, a render-side wheel spin ...), so WHICH field arrives first
 * depends on the car and the race. V8 gives every distinct add-order its own hidden
 * class: the 22 cars drifted into 4-5 maps ([10,7,1,3,1] after 60 frames), every
 * hot function that touches a car (updateCar, sweepContacts, extLong, observe,
 * followGap ...) went polymorphic, and "wrong map" deopts and boxed doubles
 * followed. Measured (scratch/hunt-consolidate/round2-perf.md PERF-1, same sim
 * hash): ~504 -> ~291 KB/frame of garbage, post-warm-up deopts 137 -> 53, steps
 * over 10 ms 229 -> 44. Declaring the whole set up front, in one fixed order, puts
 * every car in ONE map from frame 0.
 *
 * The value is `undefined`, NEVER 0 and never a "real" default: an absent field and
 * an `undefined` one read the same everywhere (`=== undefined`, `|| 0`, `?? x`,
 * `!= null`), and several readers are behaviour-bearing on exactly that —
 * game.js `if (c.steerSm === undefined) c.steerSm = steer;` seeds the steering
 * smoother from the first live input, so a 0 there changed the sim hash. No reader
 * in js/ uses `in` / hasOwnProperty on these names (driving-coach's KEEP_FORWARD
 * list is disjoint), and `delete`/Object.keys sweeps only act on primitives.
 *
 * Fields a car gains on a RARE path (a pit stop, a DSQ, an online guest) are not
 * listed: they are not in the frame loop's steady state and adding them would only
 * widen every car for nothing. Add one here when a probe shows it in a plain race.
 *
 * Re-derive the table with scratch/b13/disc.cjs-style probe: run a race for ~1500
 * frames and list Object.keys(car) minus the spawn keys, in first-seen order.
 * tests/unit/car-fields-vm.test.mjs fails when a plain race adds a key not listed.
 */
const CarFields = (function () {
  "use strict";

  // One data table: [group comment, [keys...]]. Order is the order of first assignment in a
  // real race, so a car that never reaches a late branch still shares its prefix shape.
  const GROUPS = [
    // game.js updateCar bookkeeping the physics step writes on every car (AI and player).
    ["standings and per-step snapshots (rank, last-step progress/lateral/speed)",
      ["rank", "_snapProg", "_snapX", "_snapSpeed"]],
    ["curvature, tyre-load telemetry, applied speed band, last along-track delta (_alPrevDp), overtake-armed edge (wasArmed), vmax",
      ["kCur", "_tyreLoad", "_bandNow", "_alPrevDp", "wasArmed", "_vmaxNow"]],
    ["surface/pit flags and the driver's own turn-in/steer state (the steerSm seed MUST stay undefined)",
      ["onKerb", "inPitLane", "kTurn", "wheelLock", "steerSm", "brakeDemand", "throttleDemand", "steerCommand"]],
    ["brake heat, exhaust pop, throttle edge and the last push distance (audio/fx and Collide)",
      ["brakeHeat", "exhaustPop", "wasOnThrottle", "_pushD"]],
    ["sector timing and the pre-collision snapshot Collide restores from",
      ["_secValid", "_secIdx", "_secT0", "_prevS", "_preColS", "_preColX", "_preColSpd"]],
    ["body attitude springs (js/physics/body-attitude.js seed())",
      ["_ba", "baPitch", "baRoll", "baHeave", "baScrape"]],
    ["render side: LOD tier, wheel spin, wheel visibility",
      ["_lodTier", "wheelSpin", "wheelSpinF", "_whlVis"]],
    ["player force model (js/physics/player-forces.js) and its HUD/coach readouts",
      ["vertLoad", "axFrac", "axFracF", "axFracR", "_aeroGrip", "slipFactor", "lateralAccel", "slipFront", "slipRear",
        "steerAngle", "gripFront", "gripRear", "forceFront", "forceRear", "frontUtil", "rearUtil", "skidIntensity"]],
    ["AI overtake planner (game.js ai-drive pass plan/side/best)",
      ["passPlan", "passSide", "passBest"]],
    ["player under-/over-slip dwell timer (player-forces.js)",
      ["uslipDwell"]],
    ["lap-line bookkeeping (race-control.js crossing, invalid-lap marker)",
      ["_recross", "_lapTimeAtLine", "incidentInvalidLap"]],
    ["player feedback timers: kerb sparks, understeer haptics, kerb sound + haptic",
      ["fxSparkI", "oslipHapT", "kerbSndT", "kerbHapT"]],
    ["pit work time accrued in the box (pit-lane.js) and the player's brake-bias setup (startRace)",
      ["pitWorked", "brakeBias"]],
  ];

  const KEYS = [];
  for (const g of GROUPS) for (const k of g[1]) KEYS.push(k);
  Object.freeze(KEYS);

  /** Give car `c` every late-added field as `undefined` (a no-op for one it already has). Returns `c`. */
  function predeclare(c) {
    for (let i = 0; i < KEYS.length; i++) if (!(KEYS[i] in c)) c[KEYS[i]] = undefined;
    return c;
  }

  return { predeclare, KEYS, GROUPS };
})();
