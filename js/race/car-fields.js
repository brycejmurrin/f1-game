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
 * One map is not the whole story: the map's FIELD REPRESENTATIONS still widen mid-race (an integer field takes a
 * fraction, an undefined one a number), and each widening deopts every hot function that checks a car. warmShape()
 * (below, run once per car by game.js gridUp) widens the probe-derived WARM list at the grid instead, values untouched.
 *
 * Re-derive the table with scratch/b13/disc.cjs-style probe: run a race for ~1500
 * frames and list Object.keys(car) minus the spawn keys, in first-seen order.
 * tests/unit/car-fields-vm.test.mjs fails when a plain race adds a key not listed.
 * Not Object.freeze'd: that test swaps `predeclare` for a no-op to prove the check
 * discriminates (a test seam, listed under `mutable` in tests/data/frozen-globals.json).
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
    ["lap-line bookkeeping (race-control.js crossing, invalid-lap marker, the last lap's time — game.js, first line crossing)",
      ["_recross", "_lapTimeAtLine", "incidentInvalidLap", "lastLap"]],
    ["player feedback timers: kerb sparks, understeer haptics, kerb sound + haptic, slide + lock-up haptics (player-forces.js)",
      ["fxSparkI", "oslipHapT", "kerbSndT", "kerbHapT", "uslipHapT", "lockHapT"]],
    ["pit work time accrued in the box (pit-lane.js) and the player's brake-bias setup (startRace)",
      ["pitWorked", "brakeBias"]],
    ["AI brake look-ahead cache (game.js updateCar, PERF-HUNT-2 S6): one object per AI car, keyed on its node window",
      ["_lk"]],
    ["race end, every race: coast() holding the speed floor after the flag (game.js), endRace's classification " +
      "(race-control.js). Added late, each turned a finished car into a DICTIONARY object for the rest of the race " +
      "(Node 22's V8 normalizes a named add once a map has > 128 mutable out-of-object fields; PERF-HUNT-4 B-F1b)",
      ["_coastHeld", "classified"]],
  ];

  const KEYS = [];
  for (const g of GROUPS) for (const k of g[1]) KEYS.push(k);
  Object.freeze(KEYS);

  // WARM: the fields whose V8 REPRESENTATION a race widens after the grid (PERF-HUNT-4 B-F1). The 22 cars share one
  // hidden class, so the FIRST car to store a fraction into a field that held an integer (Smi -> Double), or a
  // number into one that held undefined/null (HeapObject -> Tagged), changes that shared class, and every optimized
  // function that checks a car deopts ("wrong map") and recompiles, in bursts at the first lap line and the first
  // pit window. warmShape() makes those widenings happen once, at the grid, before anything is optimized. Node 22
  // game-vm, monza 12 laps, --trace-deopt: 1,414 -> 425 deopts ("wrong map" 1,209 -> 182), 2,119 -> 1,134 TurboFan
  // compiles, digest unchanged. PROBE-DERIVED, not guessed: a race in game-vm (monza 12 laps AI, montreal 10 and
  // spa 6 wet with a scripted player, 19-21 pit stops each) listing every field whose value kind at the grid
  // generalizes later (docs/notes/PERF-HUNT-4-2026-10-14.md §B F1). car-fields-vm.test.mjs fails when a lap plus a
  // pit stop widens a field this list does not name — add it here, in its group.
  const WARM_GROUPS = [
    ["spawned or re-gridded as an integer (0, 1, a grid slot) and later fractional: Smi -> Double",
      ["tyreWear", "x", "speed", "prog", "rpm", "energy", "aeroX", "lapTime", "totalT", "finishT", "offT", "yawVis",
      "steerVis", "collideT", "xVis", "rPrevX", "accSm", "corridorAccel", "hitSev", "rPrevYawVis", "aiHead", "aiFam",
      "contactT", "kerbGripSm", "kerbCueT", "towing", "wake", "passT", "passCool", "passFailT", "errT", "pressT",
      "queueT", "calm", "sbsT", "runT", "tyreWearF", "tyreWearR", "tyreTs", "tyreTb", "otT", "otE", "rescueT",
      "stuckT", "pitT", "pitOutT", "vLat", "yawRateCur", "hYieldT", "flatSpot", "axEstSm", "paceF", "tyreGrain"]],
    ["pre-declared undefined (or makeCars null) and later a number: HeapObject -> Tagged",
      ["rank", "_snapProg", "_snapX", "_snapSpeed", "kCur", "_tyreLoad", "_bandNow", "_alPrevDp", "_vmaxNow", "kTurn",
      "wheelLock", "steerSm", "brakeDemand", "throttleDemand", "steerCommand", "brakeHeat", "exhaustPop", "_pushD",
      "_secIdx", "_secT0", "_prevS", "_preColS", "_preColX", "_preColSpd", "skidIntensity", "passSide", "passBest",
      "_lapTimeAtLine", "fxSparkI", "kerbSndT", "kerbHapT", "pitWorked", "_otS", "_otLap", "aiBias", "holdOff",
      "_planLap", "_recutLap", "_stuckFrom", "vertLoad", "axFrac", "axFracF", "axFracR", "_aeroGrip", "slipFactor",
      "lateralAccel", "slipFront", "slipRear", "steerAngle", "gripFront", "gripRear", "forceFront", "forceRear",
      "frontUtil", "rearUtil", "uslipDwell", "brakeStab", "oslipHapT", "lastLap", "uslipHapT", "lockHapT"]],
  ];
  const WARM = [];
  for (const g of WARM_GROUPS) for (const k of g[1]) WARM.push(k);
  Object.freeze(WARM);

  // MUTABLE: fields whose representation never widens but whose CONSTNESS does (PERF-HUNT-4 B-F1b). V8 tracks a
  // field written once (at spawn) as `const`; TurboFan code that read it registers on that, and the first REWRITE of
  // the field — by any car, with any value, the same one included — flips the shared map's field to `mutable` in
  // place and deopts every such function ("marking dependent code ... code dependencies"). These are first rewritten
  // at the first pit window or later (Node 22 game-vm, %DebugPrint of a car per 1,500 steps: monza 12 laps AI,
  // montreal 10 and spa 6 wet scripted; monza --trace-generalization: pitState + pitArmed alone deopted 23 hot
  // functions at the first stop — updateCar, updateCarLongitudinal, updateCarAdvance, observe ...). warmShape()
  // writes each back unchanged at the grid. Fields first rewritten in the race's opening seconds (gear, offroad,
  // passOf ... ~40) are NOT listed: nothing is optimized yet, and Node 22's V8 (12.4) turns an object into a
  // dictionary on any later named ADD once its map has > 128 mutable out-of-object fields (--max-fast-properties;
  // the cars sit at ~86 at the grid, ~122 after the opening seconds) — this list keeps the grid at ~101.
  // https://v8.dev/blog/react-cliff (shapes and field tracking), V8 src/objects/lookup.cc CanStayConst,
  // src/objects/map-updater.cc GeneralizeField (kFieldConstGroup).
  const MUTABLE_GROUPS = [
    ["the first pit stop (pit-lane.js): its state machine, arming, reason, abort timer, commit, box slot, fitted set, " +
      "next plan, count, replans, the rival-stop note — and the boost flag the stop clears",
      ["pitState", "pitArmed", "pitWhy", "pitAbortT", "pitCommitted", "pitPos0", "pitFitted", "pitNext", "pitStops",
      "pitReplans", "_rivalStop", "boostOn"]],
    ["the first track-limits warning and the first AI mistake (laps in, not seconds)",
      ["cutWarn", "errCount"]],
  ];
  const MUTABLE = [];
  for (const g of MUTABLE_GROUPS) for (const k of g[1]) MUTABLE.push(k);
  Object.freeze(MUTABLE);

  /** Give car `c` every late-added field as `undefined` (a no-op for one it already has). Returns `c`.
   *
   * NAMED stores, one per key, in KEYS order — never a loop of keyed stores `c[KEYS[i]] = undefined`.
   * V8 caps the out-of-object fields a KEYED store may add at max(12, in-object count) before it
   * normalizes the object (Map::TooManyFastProperties), so the loop left all 22 cars in DICTIONARY mode
   * for the whole race (%HasFastProperties 0/22; %HaveSameMap stayed true because normalized maps are
   * shared). Named stores go through the map-transition path and keep the cars fast: game-vm, 1500
   * warm steps, -6 % per step, exact state digest unchanged (docs/notes/PERF-HUNT-2-2026-10-13.md S2).
   * No `new Function`/eval in the shipped page, so the list is written out; car-fields-vm.test.mjs
   * asserts it equals KEYS (order included) — regenerate it from GROUPS when the table changes. */
  function predeclare(c) {
    if (!("rank" in c)) c.rank = undefined;
    if (!("_snapProg" in c)) c._snapProg = undefined;
    if (!("_snapX" in c)) c._snapX = undefined;
    if (!("_snapSpeed" in c)) c._snapSpeed = undefined;
    if (!("kCur" in c)) c.kCur = undefined;
    if (!("_tyreLoad" in c)) c._tyreLoad = undefined;
    if (!("_bandNow" in c)) c._bandNow = undefined;
    if (!("_alPrevDp" in c)) c._alPrevDp = undefined;
    if (!("wasArmed" in c)) c.wasArmed = undefined;
    if (!("_vmaxNow" in c)) c._vmaxNow = undefined;
    if (!("onKerb" in c)) c.onKerb = undefined;
    if (!("inPitLane" in c)) c.inPitLane = undefined;
    if (!("kTurn" in c)) c.kTurn = undefined;
    if (!("wheelLock" in c)) c.wheelLock = undefined;
    if (!("steerSm" in c)) c.steerSm = undefined;
    if (!("brakeDemand" in c)) c.brakeDemand = undefined;
    if (!("throttleDemand" in c)) c.throttleDemand = undefined;
    if (!("steerCommand" in c)) c.steerCommand = undefined;
    if (!("brakeHeat" in c)) c.brakeHeat = undefined;
    if (!("exhaustPop" in c)) c.exhaustPop = undefined;
    if (!("wasOnThrottle" in c)) c.wasOnThrottle = undefined;
    if (!("_pushD" in c)) c._pushD = undefined;
    if (!("_secValid" in c)) c._secValid = undefined;
    if (!("_secIdx" in c)) c._secIdx = undefined;
    if (!("_secT0" in c)) c._secT0 = undefined;
    if (!("_prevS" in c)) c._prevS = undefined;
    if (!("_preColS" in c)) c._preColS = undefined;
    if (!("_preColX" in c)) c._preColX = undefined;
    if (!("_preColSpd" in c)) c._preColSpd = undefined;
    if (!("_ba" in c)) c._ba = undefined;
    if (!("baPitch" in c)) c.baPitch = undefined;
    if (!("baRoll" in c)) c.baRoll = undefined;
    if (!("baHeave" in c)) c.baHeave = undefined;
    if (!("baScrape" in c)) c.baScrape = undefined;
    if (!("_lodTier" in c)) c._lodTier = undefined;
    if (!("wheelSpin" in c)) c.wheelSpin = undefined;
    if (!("wheelSpinF" in c)) c.wheelSpinF = undefined;
    if (!("_whlVis" in c)) c._whlVis = undefined;
    if (!("vertLoad" in c)) c.vertLoad = undefined;
    if (!("axFrac" in c)) c.axFrac = undefined;
    if (!("axFracF" in c)) c.axFracF = undefined;
    if (!("axFracR" in c)) c.axFracR = undefined;
    if (!("_aeroGrip" in c)) c._aeroGrip = undefined;
    if (!("slipFactor" in c)) c.slipFactor = undefined;
    if (!("lateralAccel" in c)) c.lateralAccel = undefined;
    if (!("slipFront" in c)) c.slipFront = undefined;
    if (!("slipRear" in c)) c.slipRear = undefined;
    if (!("steerAngle" in c)) c.steerAngle = undefined;
    if (!("gripFront" in c)) c.gripFront = undefined;
    if (!("gripRear" in c)) c.gripRear = undefined;
    if (!("forceFront" in c)) c.forceFront = undefined;
    if (!("forceRear" in c)) c.forceRear = undefined;
    if (!("frontUtil" in c)) c.frontUtil = undefined;
    if (!("rearUtil" in c)) c.rearUtil = undefined;
    if (!("skidIntensity" in c)) c.skidIntensity = undefined;
    if (!("passPlan" in c)) c.passPlan = undefined;
    if (!("passSide" in c)) c.passSide = undefined;
    if (!("passBest" in c)) c.passBest = undefined;
    if (!("uslipDwell" in c)) c.uslipDwell = undefined;
    if (!("_recross" in c)) c._recross = undefined;
    if (!("_lapTimeAtLine" in c)) c._lapTimeAtLine = undefined;
    if (!("incidentInvalidLap" in c)) c.incidentInvalidLap = undefined;
    if (!("lastLap" in c)) c.lastLap = undefined;
    if (!("fxSparkI" in c)) c.fxSparkI = undefined;
    if (!("oslipHapT" in c)) c.oslipHapT = undefined;
    if (!("kerbSndT" in c)) c.kerbSndT = undefined;
    if (!("kerbHapT" in c)) c.kerbHapT = undefined;
    if (!("uslipHapT" in c)) c.uslipHapT = undefined;
    if (!("lockHapT" in c)) c.lockHapT = undefined;
    if (!("pitWorked" in c)) c.pitWorked = undefined;
    if (!("brakeBias" in c)) c.brakeBias = undefined;
    if (!("_lk" in c)) c._lk = undefined;
    if (!("_coastHeld" in c)) c._coastHeld = undefined;
    if (!("classified" in c)) c.classified = undefined;
    return c;
  }

  /** Settle car `c`'s field representations at the grid: for each WARM field it HAS, store a double and put the
   * original value straight back; for each MUTABLE field it HAS, store its own value. Values, sentinels (undefined,
   * null, -0, NaN) and key order are unchanged — only V8's field representation and constness move, once, where
   * the race would move them mid-lap. Never adds a key (a keyed ADD
   * is what normalized the cars in PERF-HUNT-2 S2; a keyed store to an existing field is a plain map update).
   * game.js gridUp() calls it for every car after the grid is laid out. Returns `c`. */
  function warmShape(c) {
    for (let i = 0; i < WARM.length; i++) {
      const k = WARM[i];
      if (!(k in c)) continue;
      const v = c[k];
      c[k] = 0.5;
      c[k] = v;
    }
    // MUTABLE: the same value back, so only the constness moves (a 0.5 would widen a Smi or string field too).
    for (let i = 0; i < MUTABLE.length; i++) {
      const k = MUTABLE[i];
      if (k in c) c[k] = c[k];
    }
    return c;
  }

  /** The same store-and-restore for a SCRATCH or CONTEXT object (PERF-HUNT-5): for each named field `o` has, store a
   * double and put the original value back, so a literal's integer default (`sep: 0`) is born a Double field and
   * the first fraction stored mid-race does not split the object's map and deopt every optimized reader. A literal
   * `0.0` would not do (V8 stores it as a Smi). Values, sentinels and key order unchanged; never adds a key. Returns `o`. */
  function warmDoubles(o, keys) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!(k in o)) continue;
      const v = o[k];
      o[k] = 0.5;
      o[k] = v;
    }
    return o;
  }

  return { predeclare, warmShape, warmDoubles, KEYS, GROUPS, WARM, WARM_GROUPS, MUTABLE, MUTABLE_GROUPS };
})();
