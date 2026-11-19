const CarFields = (function () {
  "use strict";

  const GROUPS = [
    ["standings and per-step snapshots (rank, last-step progress/lateral/speed)",
      ["rank", "_snapProg", "_snapX", "_snapSpeed"]],
    ["curvature, tyre-load telemetry, applied speed band, last along-track delta (_alPrevDp), overtake-armed edge (wasArmed), vmax",
      ["kCur", "_tyreLoad", "_bandNow", "_alPrevDp", "wasArmed", "_vmaxNow"]],
    ["surface/pit flags and the driver's own turn-in/steer state (the steerSm seed MUST stay undefined)",
      ["onKerb", "inPitLane", "kTurn", "wheelLock", "steerSm", "aiHeadV", "brakeDemand", "throttleDemand", "steerCommand"]],
    ["brake heat, exhaust pop, throttle edge and the last push distance (audio/fx and Collide)",
      ["brakeHeat", "exhaustPop", "wasOnThrottle", "_pushD"]],
    ["sector timing and the pre-collision snapshot Collide restores from",
      ["_secValid", "_secIdx", "_secT0", "_prevS", "_preColS", "_preColX", "_preColSpd"]],
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

  const WARM_GROUPS = [
    ["spawned or re-gridded as an integer (0, 1, a grid slot) and later fractional: Smi -> Double",
      ["tyreWear", "x", "speed", "prog", "rpm", "energy", "aeroX", "lapTime", "totalT", "finishT", "offT", "yawVis",
      "steerVis", "collideT", "xVis", "rPrevX", "accSm", "corridorAccel", "hitSev", "rPrevYawVis", "aiHead", "aiFam",
      "contactT", "kerbGripSm", "kerbCueT", "towing", "wake", "passT", "passCool", "passFailT", "errT", "pressT",
      "queueT", "trailT", "_trYT", "calm", "sbsT", "runT", "tyreWearF", "tyreWearR", "tyreTs", "tyreTb", "otT", "otE", "rescueT",
      "stuckT", "pitT", "pitOutT", "vLat", "yawRateCur", "hYieldT", "flatSpot", "axEstSm", "paceF", "tyreGrain"]],
    ["pre-declared undefined (or makeCars null) and later a number: HeapObject -> Tagged",
      ["rank", "_snapProg", "_snapX", "_snapSpeed", "kCur", "_tyreLoad", "_bandNow", "_alPrevDp", "_vmaxNow", "kTurn",
      "wheelLock", "steerSm", "aiHeadV", "brakeDemand", "throttleDemand", "steerCommand", "brakeHeat", "exhaustPop", "_pushD",
      "_secIdx", "_secT0", "_prevS", "_preColS", "_preColX", "_preColSpd", "skidIntensity", "passSide", "passBest",
      "_lapTimeAtLine", "fxSparkI", "kerbSndT", "kerbHapT", "pitWorked", "_otS", "_otLap", "aiBias", "holdOff",
      "_planLap", "_recutLap", "_stuckFrom", "vertLoad", "axFrac", "axFracF", "axFracR", "_dirtyAirMul", "_aeroGrip", "slipFactor",
      "lateralAccel", "slipFront", "slipRear", "steerAngle", "gripFront", "gripRear", "forceFront", "forceRear",
      "frontUtil", "rearUtil", "uslipDwell", "brakeStab", "oslipHapT", "lastLap", "uslipHapT", "lockHapT",
      "_cueConditionGrip", "_cueCornering", "_cueBraking", "vwF", "vwR", "kappaF", "kappaR", "_wsV", "stallT"]],
  ];
  const WARM = [];
  for (const g of WARM_GROUPS) for (const k of g[1]) WARM.push(k);
  Object.freeze(WARM);

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

  function warmShape(c) {
    for (let i = 0; i < WARM.length; i++) {
      const k = WARM[i];
      if (!(k in c)) continue;
      const v = c[k];
      c[k] = 0.5;
      c[k] = v;
    }
    for (let i = 0; i < MUTABLE.length; i++) {
      const k = MUTABLE[i];
      if (k in c) c[k] = c[k];
    }
    return c;
  }

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
