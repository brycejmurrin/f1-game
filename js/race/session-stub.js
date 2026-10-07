/* Apex 26 — race-session stub for the title script wall.
   Real modules are LAZY_RACE_SESSION (tools/manifest.cjs); ensureRaceSession()
   loads them and reassigns these bindings via top-level `var`. Title/menus
   must not throw. One file, many globals — MULTI_GLOBAL + SHARED_GLOBALS
   (cap 2) in tests/unit/global-registry.test.mjs document the reinjection. */
"use strict";

var Reliability = {
  _stub: true,
  TIER_RISK: [0.04, 0.055, 0.075, 0.10, 0.12],
  REASONS: ["engine", "gearbox", "accident"],
  isLevel: (v) => v === "off" || v === "low" || v === "real",
  arm: (cars) => cars,
  plan: () => [],
  buildQuality: () => 0,
};

var Damage = {
  _stub: true,
  SHOW: 0.08,
  ZONE_FRONT: "front", ZONE_REAR: "rear", ZONE_SIDE: "side",
  blank: () => ({ fwL: 0, fwR: 0, rw: 0, floor: 0, knock: 0, hits: 0, cool: 0, onWall: false, served: false, spd: 0, yaw: 0 }),
  reset: function () {}, contact: function () {}, observe: function () {}, apply: function () {},
  get: () => null, state: () => null, worst: () => 0, zoneOf: () => null,
};

var Duel = {
  _stub: true,
  BUMP: 1.04, LEGEND_BUMP: 1.06, LEGEND_CAR: 1.02,
  bump: function () {}, pick: () => null, asLegend: function () {},
};

var RadioLines = {
  _stub: true,
  POOLS: {}, WHY: {},
  create: () => ({ pick: () => "", reset: function () {} }),
  fill: function () {}, gapText: () => "", timeText: () => "",
  surname: (c) => (c && (c.code || c.name)) || "",
};

var RaceFacts = {
  _stub: true,
  K: {}, HOLD_S: 0, BATTLE_GAP: 0,
  create: () => ({ update: function () {}, reset: function () {}, snapshot: () => ({}) }),
};

var Spotter = {
  _stub: true,
  KEYS: {}, OVERLAP_ARC: 0, SIDE_MIN: 0, SIDE_MAX: 0, DEBOUNCE_S: 0, CLEAR_S: 0, STILL_S: 0, GAP_S: 0,
  create: () => ({ update: function () {}, occupied: () => false, status: () => ({}) }),
  step: function () {}, occupancy: () => 0, fresh: () => false,
};

var PitLane = {
  _stub: true,
  create: () => ({
    _stub: true,
    zoneOf: () => null, limit: () => 999, toBox: () => Infinity,
    approachV: () => 999, entryV: () => 999, exitV: () => 999,
    stopAnim: () => ({ lift: 0, off: 0, u: 0 }),
    inLane: () => false, held: () => false, roadOf: () => null, inWindow: () => false,
    update: function () {}, think: function () {}, clearArm: function () {}, reset: function () {},
    planFor: () => null, planInfo: () => null, twoCompoundApplies: () => false,
    // RaceSettings paintPlan/wire reads these before ensureRaceSession (CI #1180).
    pinnedStops: () => null, setPinnedStops: function () {}, lossS: () => 0,
    compoundDue: () => false, nextCode: () => "", nextFor: () => null, replan: function () {},
    laneX: (_c, _hw, x) => x, laneUniform: () => null, boxUniform: () => null,
    lastCue: () => null, canWork: () => false, addWork: () => 0,
    cue: () => null, windowOf: () => null, worthStopping: () => false,
    estimate: () => ({ lossS: 0, gapS: null, marginS: null, caution: false, estimated: true }),
    status: () => ({}), info: () => ({}), arm: function () {}, setNext: function () {},
    serviceCar: function () {}, boxSquare: () => false, boxThroughFor: () => -1,
    cueM: 0, boxCueM: 0, moveM: 0, boxTol: 0, squareByM: 0, squareLat: 0,
    servedS: 0, mergeS: 0,
  }),
  zoneOf: () => null, inWindow: () => false, throughM: () => 0,
  ENTRY_M: 0, EXIT_M: 0, BOX_M: 0, LIMIT_FRAC: 0, BOX_S: 0, PIT_SIDE: 1,
};

var RaceEngineer = {
  _stub: true,
  WEAR_STEPS: [], AXLE_SPLIT: 0.5, GRAIN_CALL: 0, BLISTER_CALL: 0, COLD_CALL: 0, QUIET_S: 0,
  DIRECTIONAL: {}, BOX_CALLS: {},
  create: () => ({ update: function () {}, reset: function () {}, callFor: function () {}, senseOf: () => null }),
};

var RaceRadio = {
  _stub: true,
  CHAT: ["off", "key", "normal", "chatty"],
  COMM: ["off", "tv", "on"],
  GAP_S: [Infinity, 18, 9, 5],
  TV_CAMS: ["heli", "side", "cinematic", "low", "overhead"],
  // AudioPanel.init() (and its sync) reads chat()/comm() while the stub is still
  // live if ensureAudio races ensureRaceSession — match the real create() surface.
  create: () => ({
    _stub: true,
    update: function () {}, reset: function () {}, request: function () {},
    replayEvent: function () {}, setWatching: function () {},
    setChat: function (v) { return v || "normal"; }, setComm: function (v) { return v || "tv"; },
    setSpotter: () => false, spotter: () => false,
    chat: () => "normal", comm: () => "tv", commentates: () => true,
    callsResult: () => false, callsLastLap: () => false,
    trafficBusy: () => false, spotterDebug: () => null,
    status: () => ({}), tick: function () {}, debug: () => ({}),
  }),
  durFor: () => 0,
};

var SessionRecords = {
  _stub: true,
  PHYS: "",
  create: () => ({
    _stub: true,
    begin: function () {}, current: () => null, config: () => ({}), sample: function () {},
    accept: () => false, board: () => [], invalidate: function () {}, finish: function () {},
    prepareDaily: function () {}, restoreDaily: function () {}, key: () => "",
  }),
};

var StartLights = {
  _stub: true,
  create: () => ({ update: function () {}, lampsFor: () => [] }),
};

var MarshalPanels = {
  _stub: true,
  create: () => ({ update: function () {}, postsFor: () => [], showing: () => false }),
};

var FlyingStart = {
  _stub: true,
  HANDOVER_S: 0, MARGIN_S: 0, MIN_RUN_M: 0, MAX_RUN_FRAC: 0,
  create: () => ({ update: function () {}, stop: function () {}, owns: () => false, active: () => false }),
  runUpMetres: () => 0,
};
