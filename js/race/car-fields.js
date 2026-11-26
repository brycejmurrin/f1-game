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
      ["onKerb", "inPitLane", "kTurn", "wheelLock", "steerSm", "aiHeadV", "brakeDemand", "throttleDemand", "steerCommand"]],
    ["brake heat, exhaust pop, throttle edge and the last push distance (audio/fx and Collide)",
      ["brakeHeat", "exhaustPop", "wasOnThrottle", "_pushD"]],
    ["sector timing and the pre-collision snapshot Collide restores from",
      ["_secValid", "_secIdx", "_secT0", "_prevS", "_preColS", "_preColX", "_preColSpd", "_puntGot"]],
    ["the stopped-car hazard: seconds stationary, the hazard being passed and its committed side (clean-room 39/40)",
      ["stillT", "_hzOf", "_hzSide"]],
    ["body attitude springs (js/physics/body-attitude.js seed())",
      ["_ba", "baPitch", "baRoll", "baHeave", "baScrape"]],
    ["render side: LOD tier, wheel spin, wheel visibility",
      ["_lodTier", "wheelSpin", "_whlVis"]],
    ["player force model (js/physics/player-forces.js) and its HUD/coach readouts",
      ["vertLoad", "axFrac", "axFracF", "axFracR", "_dirtyAirMul", "_coachAssisted", "_aeroGrip", "slipFactor", "lateralAccel", "slipFront", "slipRear",
        "steerAngle", "gripFront", "gripRear", "forceFront", "forceRear", "frontUtil", "rearUtil", "skidIntensity",
        "_cueConditionGrip", "_cueCornering", "_cueBraking", "vwF", "vwR", "kappaF", "kappaR", "_wsV"]],
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
    ["netplay wire id: game.js wireId() caches it on the first G.wireId call, which a host makes for every car on its " +
      "first tick (perf hunt 9: a late add per car per online race)",
      ["_wireId"]],
    ["stationary-player retirement timer (game.js checkRetirements, AiDrive.stallStep; W26 row 5)",
      ["stallT"]],
    ["written only by __apex.reset() (incident-sim release → _incidentOwned, the slip read-out zero → slipDeg): " +
      "a reset that ADDED them was a late add on every car, and once stallT took one more slot it dropped all 22 " +
      "cars to dictionary mode (hunt-apex-aiplace-reset-vm)",
      ["_incidentOwned", "slipDeg"]],
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
      "queueT", "trailT", "_trYT", "calm", "sbsT", "runT", "tyreWearF", "tyreWearR", "tyreTs", "tyreTb", "otT", "otE", "rescueT",
      "stuckT", "pitT", "pitOutT", "vLat", "yawRateCur", "hYieldT", "flatSpot", "axEstSm", "paceF", "tyreGrain", "laneClr", "stillT"]],
    ["pre-declared undefined (or makeCars null) and later a number: HeapObject -> Tagged",
      ["rank", "_snapProg", "_snapX", "_snapSpeed", "kCur", "_tyreLoad", "_bandNow", "_alPrevDp", "_vmaxNow", "kTurn",
      "wheelLock", "steerSm", "aiHeadV", "brakeDemand", "throttleDemand", "steerCommand", "brakeHeat", "exhaustPop", "_pushD",
      "_secIdx", "_secT0", "_prevS", "_preColS", "_preColX", "_preColSpd", "_puntGot", "skidIntensity", "passSide", "passBest",
      "_lapTimeAtLine", "fxSparkI", "kerbSndT", "kerbHapT", "pitWorked", "_otS", "_otLap", "aiBias", "holdOff",
      "_planLap", "_recutLap", "_stuckFrom", "vertLoad", "axFrac", "axFracF", "axFracR", "_dirtyAirMul", "_aeroGrip", "slipFactor",
      "lateralAccel", "slipFront", "slipRear", "steerAngle", "gripFront", "gripRear", "forceFront", "forceRear",
      "frontUtil", "rearUtil", "uslipDwell", "brakeStab", "oslipHapT", "lastLap", "uslipHapT", "lockHapT",
      "_cueConditionGrip", "_cueCornering", "_cueBraking", "vwF", "vwR", "kappaF", "kappaR", "_wsV", "stallT", "_hzSide", "tyreFitProg"]],
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
    ["the latest human force application: coach assistance flag", ["_coachAssisted"]],
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

  // ── RESETS: the per-car reset table (#6945 U1.1 of #6920) ────────────────────────────────────────────────────────
  // Every field a reset path writes with a plain value is declared HERE, once: its lifetime, the ops that reset it,
  // the value each op writes, and why. CarFields.resetFor(c, op) applies it, so a new field cannot be missed by a
  // hand-kept inline list. game.js gridUp() is op "newRace"; rescuePlayer() (RECOVER, the auto-rescue, an incident
  // handback) is op "rescue"; redFlagRestart() is op "redFlag"; js/agent/apex.js reset() is op "episode" (#6946 U1.2).
  //
  // MEMBERSHIP IS EXPLICIT PER OP, never derived from the lifetime tag: the paths do not nest (rescuePlayer clears
  // boostOn and deploying, which gridUp leaves to makeCars; the red-flag re-grid writes gear and rpm, which gridUp
  // never does), and one field takes a different value per op. The tag is documentation:
  //   car — the car's identity; race — this race's counters and classification; stint — tyre/tow/brake state;
  //   lap — lap timing; incident — off-track, wall and rescue state; episode — motion the next step reads;
  //   render-anchor — what the renderer draws or interpolates from; keep — a field an op deliberately does NOT reset.
  // CALLER marks a field the op owns but whose value only the call site knows (a grid slot's head start, a rescue's
  // pace-scaled speed, raceT): resetFor skips it and the caller writes it, at the same point as before.
  // The table covers the fields these paths write (~60 of a car's ~270 keys), not the whole car: a whole-car
  // coverage guard is U1.4. SimState (js/core/sim-state.js) reads the car-state lists below (SNAPSHOT) from here.
  // tests/unit/car-fields-lifetimes-vm.test.mjs pins it, and pins every car field after gridUp, rescuePlayer, a red
  // flag and an episode reset against digests captured on the pre-migration code.
  const CALLER = Object.freeze({ caller: true });
  const NO = Object.freeze({ no: true });   // in a row: this op does not reset the field
  const U = undefined;   // the episode op's value for a field a cold car never had (absent reads as undefined)
  // Rows a cold car never had: only the episode op resets them, to undefined.
  const EPI = (keys) => keys.split(" ").map((k) => [k, NO, NO, NO, U]);
  const IDLE_RPM = 5000;   // PhysicsConsts.IDLE_RPM (car-fields-lifetimes-vm pins the two equal; this file loads standalone)
  const OPS = ["newRace", "rescue", "redFlag", "episode"];
  const LIVES = ["car", "race", "stint", "lap", "incident", "episode", "render-anchor", "keep"];
  // [why, life, [[key, newRace, rescue, redFlag, episode] ...]] — a value column per OP, NO where that op leaves the
  // field alone. Rows in gridUp's write order (the order declareNewRace adds a fresh car's missing ones in).
  //   redFlag — redFlagRestart's standing re-grid: the SAME race, so the race's counters, strategy, energy and tyres
  //             survive (energy, tyreClass, phaseRoll, pit strategy, flatSpot, errCount, cutWarn, cuts, penalty).
  //   episode — __apex.reset(), after gridUp(): the FINAL value each field held after the old hand block and the old
  //             EPISODE_TRANSIENTS loop (which ran last, so a field in both ended undefined). undefined is what a cold
  //             car reads for a field it never had: replaying a seed starts from a freshly loaded page's state.
  const RESET_GROUPS = [
    // apex.js reset() keeps the player's own speed; prog is -(14 + i * 8), the grid slot's head start (a red flag
    // re-runs the leader's lap, inline); a rescue keeps progress and sets its own pace-scaled speed (16 m/s x PACE,
    // never above vTop(); never the car's own, #5876). accSm is read cross-car one tick stale (the blocker's accel).
    ["a car on the grid is pulling nothing; prog and a rescue's speed are the caller's", "episode", [
      ["speed", 0, CALLER, 0, NO], ["accSm", 0, NO, 0, U], ["corridorAccel", 0, NO, 0, 0], ["prog", CALLER, NO, NO, NO]]],
    // A red flag rewinds lap/fuel/_progGift inline from the leader's lap; energy carries through (same race).
    ["this race's lap, fuel and battery counters", "race", [
      ["lap", 0, NO, NO, NO], ["fuelLap", 0, NO, NO, NO], ["fuelRestartLaps", 0, NO, NO, NO], ["energy", 1, NO, NO, NO],
      ["_progGift", 0, NO, NO, NO]]],
    ["a new race starts an untimed lap 0 with no best", "lap", [
      ["lapTime", 0, NO, NO, NO], ["best", Infinity, NO, NO, NO], ["totalT", 0, NO, NO, NO]]],
    ["flaps shut on the grid; a rescue drops back to Z-mode", "incident", [
      ["xOn", false, false, false, false], ["aeroX", 0, 0, 0, 0], ["xArmed", false, false, false, false]]],
    // makeCars' values; a race re-arms via armReliability. CarFields declares _coastHeld: a delete would make the car
    // a dictionary, so it is reset to undefined.
    ["last race's classification: makeCars' values", "race", [
      ["finPos", 0, NO, NO, NO], ["retired", false, NO, NO, NO], ["dnf", null, NO, NO, NO], ["dnfAt", null, NO, NO, NO],
      ["dnfWhy", null, NO, NO, NO], ["_coastHeld", undefined, NO, NO, U], ["finished", false, NO, NO, NO],
      ["finishT", 0, NO, NO, NO]]],
    // The instrument's denominator. A red-flag re-grid is the same race and keeps them; its jumpStartFined = false
    // (another launch can earn a fine) stays inline beside the launch re-plan. offCut on a red flag: current
    // behaviour, which U1.3 (#6877) revisits.
    ["mistakes THIS race: cleared only by a new race; a rescue and a red flag clear the off-track timer", "race", [
      ["cuts", 0, NO, NO, NO], ["cutWarn", 0, NO, NO, NO], ["qualiCut", false, NO, NO, NO], ["penalty", 0, NO, NO, NO],
      ["penaltyWhy", null, NO, NO, NO], ["jumpStartFined", false, NO, NO, NO], ["offT", 0, 0, 0, NO],
      ["offCut", false, false, false, NO], ["hits", 0, NO, NO, NO], ["hitSev", 0, NO, NO, NO], ["wallHits", 0, NO, NO, NO],
      ["errCount", 0, NO, NO, U]]],
    // rescueLastT = raceT is the auto-rescue cooldown stamp, which only rescuePlayer knows.
    ["wrong-way, rescue, dig-out and wall timers; a rescue stamps rescueLastT itself", "incident", [
      ["wrongT", 0, 0, 0, NO], ["wrongWay", false, false, false, NO], ["rescueT", 0, 0, 0, NO],
      ["rescueLastT", null, CALLER, null, NO], ["digEscHeld", false, NO, false, NO], ["wallT", 0, 0, 0, NO],
      ["wasOnWall", false, false, false, NO]]],
    // apex.js reset() zeroes the PLAYER's two inline in its pose block.
    ["slip and yaw settled on the grid and after a rescue (#6877 P4)", "episode", [
      ["vLat", 0, 0, 0, NO], ["yawRateCur", 0, 0, 0, NO]]],
    ["steering and yaw drawn straight", "render-anchor", [
      ["steerVis", 0, 0, 0, NO], ["yawVis", 0, 0, 0, NO], ["rPrevYawVis", 0, NO, 0, NO]]],
    // aiBias SNAPS to its target when null and slews when it is a number: a warm one breaks replay determinism.
    ["no AI heading target, bias, family or yield timer carried into a new race or episode", "race", [
      ["aiHead", 0, NO, 0, 0], ["aiBias", null, NO, null, null], ["aiFam", 0, NO, 0, 0], ["hYieldT", 0, NO, 0, NO]]],
    // BOTH sides of a real conflict: contactT DECAYS, and unlike the towing/wheelLock beside it a re-grid is the only
    // thing that clears it; lane is damped state, not a constant, so each path sets it from the car's own lanePref.
    ["contactT decays and only a re-grid clears it; lane is the caller's (the car's lanePref)", "race", [
      ["contactT", 0, NO, 0, U], ["lane", CALLER, NO, CALLER, CALLER], ["laneClr", 0, NO, 0, 0]]],
    // seedPlayerPose re-seeds the player's from the road tangent right after.
    ["heading render anchor: zero on the grid, a rescue copies its new heading", "render-anchor", [
      ["rPrevHead", 0, CALLER, 0, NO]]],
    // flatSpot: last race's tyre (car-draw wobble) — a red flag keeps it (same tyres); brakeStab null is brakeBeta's
    // cold seed. A red flag's disc temperatures go back to ambient in WheelState.resetThermal (#6877 P6), inline.
    ["kerb, tow and brake state; a rescue drops the tow (#6877 P4)", "stint", [
      ["kerbGripSm", 1, NO, 1, NO], ["kerbCueT", 0, NO, 0, NO], ["towing", 0, 0, 0, U], ["wake", 0, NO, 0, U],
      ["flatSpot", 0, NO, NO, U], ["brakeStab", null, NO, null, U], ["axEstSm", 0, NO, 0, 0]]],
    // gridUp leaves these to makeCars' spawn values.
    ["a rescue alone clears the skid cue (#6877 P4); rescue, red flag and episode the lock cue and boost/deploy", "incident", [
      ["skidIntensity", NO, 0, NO, U], ["wheelLock", NO, 0, 0, U], ["boostOn", NO, false, NO, false],
      ["deploying", NO, false, NO, false]]],
    // Was game.js clearRacingScratch (gridUp and redFlagRestart): racecraft state (AiDrive startCalm / sbs / runExtra /
    // repassLock / paceSample) that outlives the field it was made against runs from the grid box. A spawned car has
    // none of them: declareNewRace adds them. An episode resets the pass-latch run to the same values; the queue,
    // trail and alongside fields a cold car never had go back to undefined, and calm/sbs/run/pace it leaves alone.
    ["racecraft scratch a re-grid must drop: pass latch, defence and mistake phase", "race", [
      ["stuckT", 0, NO, 0, 0], ["letPassT", 0, NO, 0, 0], ["passOf", null, NO, null, null], ["passT", 0, NO, 0, 0],
      ["passCool", 0, NO, 0, 0], ["holdOff", null, NO, null, null], ["defendSide", 0, NO, 0, 0],
      ["passFailOf", null, NO, null, null], ["passFailT", 0, NO, 0, 0], ["errT", 0, NO, 0, 0], ["pressT", 0, NO, 0, 0],
      ["zoneKey", -1, NO, -1, -1]]],
    ["queue and trail followers and the swap-back lockout: a cold car has none", "race", [
      ["queueT", 0, NO, 0, U], ["_qOf", null, NO, null, U], ["trailT", 0, NO, 0, U], ["_trOf", null, NO, null, U],
      ["_trYT", 0, NO, 0, U], ["_trYS", 0, NO, 0, U]]],
    ["start calm, side-by-side, attack, run and pace sampling: an episode leaves them", "race", [
      ["calmUntil", 0, NO, 0, NO], ["calm", 0, NO, 0, NO], ["sbsT", 0, NO, 0, NO], ["atkWant", false, NO, false, NO],
      ["atkOn", false, NO, false, NO], ["runT", 0, NO, 0, NO], ["_alPrev", null, NO, null, U], ["paceF", 0, NO, 0, NO]]],
    // A standing start in 2nd+ has gearLo > 0, so manual drive is zero until a downshift. An episode also settles
    // the shift timer and the smoothed inputs: left alone, every later reset inherits the last run's gear and
    // steering (~1 m of divergence over a 4 s rollout at one seed). vertLoad is a CarFields key: undefined, never delete.
    ["drivetrain and smoothed-input state a standing start and an episode begin from", "episode", [
      ["gear", NO, NO, 1, 1], ["rpm", NO, NO, IDLE_RPM, IDLE_RPM], ["shiftT", NO, NO, NO, 0], ["steerSm", NO, NO, NO, 0],
      ["brakeHeat", NO, NO, NO, 0], ["slipDeg", NO, NO, NO, 0], ["wasOnThrottle", NO, NO, NO, false],
      ["vertLoad", NO, NO, NO, U]]],
    // The old EPISODE_TRANSIENTS list: fields a running episode CREATES, so a cold car reads undefined. Measured, not
    // guessed: every key that differed between consecutive post-reset snapshots at one seed (tools/check/episode-diff.mjs
    // names a leak; tests/unit/episode-transients.test.mjs and agent-determinism guard it). Several are read CROSS-CAR
    // one tick stale (_vmaxNow is the blocker's pace AiDrive.otWant decides passes on, towing its slipstream, rank its
    // position), and accSm, kCur, _vmaxNow, passBest and kerbHapT drift on EVERY episode, so no warm-up settles them.
    ["per-step physics, tyre-force and control-demand caches a cold car has not built", "episode", EPI(
      "rank kCur wasArmed _vmaxNow onKerb brakeTF brakeTR brakeFade _absF _tcR exhaustPop _pushD offroad " +
      "axFrac axFracF axFracR _dirtyAirMul _coachAssisted uslipDwell slipFactor _aeroGrip _bandNow " +
      "_cueConditionGrip _cueCornering _cueBraking stallT _tyreLoad brakeDemand throttleDemand steerCommand " +
      "steerAngle gripFront gripRear forceFront forceRear frontUtil rearUtil slipFront slipRear " +
      "lateralAccel inPitLane aiHeadV")],
    // #1628 wheel state: rim speeds and slip ratios re-seed from c.speed (WheelState.ensure) on the next step.
    ["wheel state: rim speeds and slip ratios re-seed from the car's speed", "episode", EPI(
      "vwF vwR kappaF kappaR _wsV")],
    // The lap-crossing test's previous s: a red flag and an episode set it to the car's new s, inline (CALLER).
    ["the previous step's s re-anchors on the car's new position", "lap", [
      ["_prevS", NO, NO, CALLER, CALLER]]],
    // Sector and lap-line latches, and the race-END lastLap a classified car would carry into the next episode.
    ["sector, lap-line and lap-validity latches of the last episode", "lap", EPI(
      "_secIdx _secT0 _secValid _lapTimeAtLine _recross incidentInvalidLap lastLap")],
    // passPlan is the lazy `c.passPlan || (c.passPlan = {})` cache: a warm one carries last episode's `.side`, which
    // can flip the next attempt's `!c.passPlan || c.passPlan.side` read. _lk is the AI brake look-ahead cache (perf
    // hunt 2 S6), refilled lazily. kTurn/_alPrevDp: side-by-side ownership and the swap-back lockout.
    ["racecraft plans and look-ahead caches a cold car has not made", "race", EPI(
      "passSide passBest passPlan _lk kTurn _alPrevDp pitWorked")],
    // Collide's pre-collision pose and per-step punt budget (#5894), the stopped-car hazard (clean-room 39/40), the
    // haptic and spark cue timers (several appear only on a STREET circuit with real contact), and game.js update()'s
    // field-step pose snapshots (a warm car would hand the next episode a stale sibling pose on frame 0).
    ["contact, hazard, cue-timer and field-snapshot state of the last episode", "incident", EPI(
      "_preColS _preColX _preColSpd collideT _puntGot stillT _hzOf _hzSide kerbSndT kerbHapT uslipHapT " +
      "oslipHapT lockHapT fxSparkI _snapProg _snapX _snapSpeed")],
  ];
  const RESETS = [];
  for (const [why, life, rows] of RESET_GROUPS) {
    for (const row of rows) {
      const ops = {};
      OPS.forEach((op, i) => { if (row[i + 1] !== NO) ops[op] = row[i + 1]; });
      RESETS.push(Object.freeze({ key: row[0], life, ops: Object.freeze(ops), why }));
    }
  }
  Object.freeze(RESETS);
  // Per op, the keys and values resetFor stores, CALLER rows left out: built once at load, so resetFor allocates nothing.
  const PLAN = {};
  for (const op of OPS) {
    const keys = [], vals = [];
    for (const r of RESETS) if (Object.hasOwn(r.ops, op) && r.ops[op] !== CALLER) { keys.push(r.key); vals.push(r.ops[op]); }
    PLAN[op] = { keys: Object.freeze(keys), vals: Object.freeze(vals) };
  }

  // ── SNAPSHOT: how SimState captures and restores a car (moved from js/core/sim-state.js, #6921 / #6860 B) ───────
  // EVERY OBJECT A CAR HOLDS IS ONE OF FOUR KINDS (tests/unit/sim-state-vm.test.mjs fails on an object field that is
  // none): DEEP (race data, JSON-faithful copy), STATE (per-car controller state the next step reads, cloned by
  // SimState's cloneState), a CAR (restored by identity) or STATIC (shared configuration that never changes in a race).
  const SNAPSHOT = Object.freeze({
    // pitPlan: pit-lane replan() rewrites it in place, so a retry/rewind must put the saved copy back.
    DEEP: Object.freeze(["tyre", "tyreLog", "pitNext", "pitPlan"]),
    // Body-attitude springs, the AI look-ahead cache, the pass plan: without them a rewound AI steers off a future
    // plan and the field diverges on the first step (#6860).
    STATE: Object.freeze(["_ba", "_lk", "passPlan"]),
    STATIC: Object.freeze(["team", "color", "houseStats", "fuelVisual", "launch", "mods", "tyreBaseMods", "tyreOpt"]),
    // RUNTIME OWNERSHIP IS NOT CAR STATE. `_incidentOwned` is IncidentSim's takeover flag: a sample taken
    // mid-takeover would set it again after the incident part reset the takeover list, and owns() — which reads only
    // the flag — would freeze the car for the rest of the session (#6862 P1). Neither captured nor deleted on
    // restore; the owning module's part decides.
    RUNTIME: Object.freeze(["_incidentOwned"]),
    // PENALTIES AND CUTS DO NOT REWIND FOR THE PLAYER (the practice rewind's keepForward policy). They are ordinary
    // primitives, so the generic sweep captures them and a naive restore hands them back — undoing a time penalty or
    // resetting the track-limits ladder by pressing a button. ONLY the player: an AI car is part of the world being
    // rewound. Nor do the player's ROLE flags: a sample taken during the flying-start hand-over
    // (js/race/flying-start.js, human=false for ~3 s) would otherwise hand the wheel to the AI for the session.
    KEEP_FORWARD: Object.freeze(["penalty", "cuts", "cutWarn", "hits", "wallHits", "hitSev", "human", "local", "isPlayer"]),
  });

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
    if (!("aiHeadV" in c)) c.aiHeadV = undefined;
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
    if (!("_puntGot" in c)) c._puntGot = undefined;
    if (!("stillT" in c)) c.stillT = undefined;
    if (!("_hzOf" in c)) c._hzOf = undefined;
    if (!("_hzSide" in c)) c._hzSide = undefined;
    if (!("_ba" in c)) c._ba = undefined;
    if (!("baPitch" in c)) c.baPitch = undefined;
    if (!("baRoll" in c)) c.baRoll = undefined;
    if (!("baHeave" in c)) c.baHeave = undefined;
    if (!("baScrape" in c)) c.baScrape = undefined;
    if (!("_lodTier" in c)) c._lodTier = undefined;
    if (!("wheelSpin" in c)) c.wheelSpin = undefined;
    if (!("_whlVis" in c)) c._whlVis = undefined;
    if (!("vertLoad" in c)) c.vertLoad = undefined;
    if (!("axFrac" in c)) c.axFrac = undefined;
    if (!("axFracF" in c)) c.axFracF = undefined;
    if (!("axFracR" in c)) c.axFracR = undefined;
    if (!("_dirtyAirMul" in c)) c._dirtyAirMul = undefined;
    if (!("_coachAssisted" in c)) c._coachAssisted = undefined;
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
    if (!("_cueConditionGrip" in c)) c._cueConditionGrip = undefined;
    if (!("_cueCornering" in c)) c._cueCornering = undefined;
    if (!("_cueBraking" in c)) c._cueBraking = undefined;
    if (!("vwF" in c)) c.vwF = undefined;
    if (!("vwR" in c)) c.vwR = undefined;
    if (!("kappaF" in c)) c.kappaF = undefined;
    if (!("kappaR" in c)) c.kappaR = undefined;
    if (!("_wsV" in c)) c._wsV = undefined;
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
    if (!("_wireId" in c)) c._wireId = undefined;
    if (!("stallT" in c)) c.stallT = undefined;
    if (!("_incidentOwned" in c)) c._incidentOwned = undefined;
    if (!("slipDeg" in c)) c.slipDeg = undefined;
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


  /** Apply op `op` ("newRace" | "rescue" | "redFlag" | "episode") of the RESETS table to car `c`: every row that names the op gets its
   * value, CALLER rows excepted (the call site writes those). Returns `c`.
   *
   * A KEYED store only to a field `c` already HAS: that is a plain map update (warmShape does the same). A keyed ADD
   * is what normalized the cars (PERF-HUNT-2 S2), so "newRace" then adds the fields a fresh car lacks through
   * declareNewRace's NAMED stores. Each field is written exactly ONCE: a second write at the grid would flip the
   * field's V8 constness to mutable (see MUTABLE above), and past 128 mutable fields a car turns dictionary. */
  function resetFor(c, op) {
    const p = PLAN[op];
    if (!p) throw new Error("CarFields.resetFor: unknown op " + op);
    const keys = p.keys, vals = p.vals;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k in c) c[k] = vals[i];
    }
    if (op === "newRace") declareNewRace(c);
    return c;
  }

  /** The "newRace" rows a freshly spawned car (makeCars + predeclare) does not have, ADDED by named stores with their
   * newRace value; a no-op for a field the car already has (resetFor stored those). Written out because the shipped
   * page has no eval; car-fields-lifetimes-vm pins this list to the table's values and to a real spawn's missing keys. */
  function declareNewRace(c) {
    if (!("accSm" in c)) c.accSm = 0;
    if (!("corridorAccel" in c)) c.corridorAccel = 0;
    if (!("fuelLap" in c)) c.fuelLap = 0;
    if (!("fuelRestartLaps" in c)) c.fuelRestartLaps = 0;
    if (!("_progGift" in c)) c._progGift = 0;
    if (!("cutWarn" in c)) c.cutWarn = 0;
    if (!("qualiCut" in c)) c.qualiCut = false;
    if (!("penaltyWhy" in c)) c.penaltyWhy = null;
    if (!("jumpStartFined" in c)) c.jumpStartFined = false;
    if (!("hits" in c)) c.hits = 0;
    if (!("hitSev" in c)) c.hitSev = 0;
    if (!("wallHits" in c)) c.wallHits = 0;
    if (!("errCount" in c)) c.errCount = 0;
    if (!("wrongT" in c)) c.wrongT = 0;
    if (!("wrongWay" in c)) c.wrongWay = false;
    if (!("rescueT" in c)) c.rescueT = 0;
    if (!("rescueLastT" in c)) c.rescueLastT = null;
    if (!("digEscHeld" in c)) c.digEscHeld = false;
    if (!("wallT" in c)) c.wallT = 0;
    if (!("wasOnWall" in c)) c.wasOnWall = false;
    if (!("vLat" in c)) c.vLat = 0;
    if (!("yawRateCur" in c)) c.yawRateCur = 0;
    if (!("rPrevYawVis" in c)) c.rPrevYawVis = 0;
    if (!("aiHead" in c)) c.aiHead = 0;
    if (!("aiBias" in c)) c.aiBias = null;
    if (!("aiFam" in c)) c.aiFam = 0;
    if (!("hYieldT" in c)) c.hYieldT = 0;
    if (!("contactT" in c)) c.contactT = 0;
    if (!("rPrevHead" in c)) c.rPrevHead = 0;
    if (!("kerbGripSm" in c)) c.kerbGripSm = 1;
    if (!("kerbCueT" in c)) c.kerbCueT = 0;
    if (!("towing" in c)) c.towing = 0;
    if (!("wake" in c)) c.wake = 0;
    if (!("flatSpot" in c)) c.flatSpot = 0;
    if (!("brakeStab" in c)) c.brakeStab = null;
    if (!("axEstSm" in c)) c.axEstSm = 0;
    if (!("stuckT" in c)) c.stuckT = 0;
    if (!("letPassT" in c)) c.letPassT = 0;
    if (!("passOf" in c)) c.passOf = null;
    if (!("passT" in c)) c.passT = 0;
    if (!("passCool" in c)) c.passCool = 0;
    if (!("holdOff" in c)) c.holdOff = null;
    if (!("defendSide" in c)) c.defendSide = 0;
    if (!("passFailOf" in c)) c.passFailOf = null;
    if (!("passFailT" in c)) c.passFailT = 0;
    if (!("errT" in c)) c.errT = 0;
    if (!("pressT" in c)) c.pressT = 0;
    if (!("zoneKey" in c)) c.zoneKey = -1;
    if (!("queueT" in c)) c.queueT = 0;
    if (!("_qOf" in c)) c._qOf = null;
    if (!("trailT" in c)) c.trailT = 0;
    if (!("_trOf" in c)) c._trOf = null;
    if (!("_trYT" in c)) c._trYT = 0;
    if (!("_trYS" in c)) c._trYS = 0;
    if (!("calmUntil" in c)) c.calmUntil = 0;
    if (!("calm" in c)) c.calm = 0;
    if (!("sbsT" in c)) c.sbsT = 0;
    if (!("atkWant" in c)) c.atkWant = false;
    if (!("atkOn" in c)) c.atkOn = false;
    if (!("runT" in c)) c.runT = 0;
    if (!("_alPrev" in c)) c._alPrev = null;
    if (!("paceF" in c)) c.paceF = 0;
    return c;
  }

  return { predeclare, warmShape, warmDoubles, KEYS, GROUPS, WARM, WARM_GROUPS, MUTABLE, MUTABLE_GROUPS,
    resetFor, declareNewRace, RESETS, RESET_GROUPS, OPS, LIVES, CALLER, SNAPSHOT };
})();
