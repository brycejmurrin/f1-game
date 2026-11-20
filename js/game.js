(async function () {
"use strict";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const els = {
  hud: $("hud"), pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"),
  best: $("hud-best"), speed: $("hud-speed-n"), energy: $("hud-energy-fill"),
  ot: $("hud-ot"), aero: $("hud-aero"),
  tyre: $("hud-tyre"), tyreCode: $("hud-tyre-code"), tyreFill: $("hud-tyre-fill"), plan: $("hud-plan"),
  pitCue: $("hud-pit"), pitCueArrow: $("hud-pit-arrow"), pitCueText: $("hud-pit-text"), workBtn: $("hud-work"),
  gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"),
  hudSectors: $("hud-sectors"),
  hudLimits: $("hud-limits"),
  flag: $("hud-flag"), minimap: $("minimap"),
  lights: $("lights"), announce: $("announce"), announceNum: $("announce-num"),
  announceWho: $("announce-who"), announceText: $("announce-text"), announceLive: $("announce-live"),
  overlay: $("overlay"), audiostate: $("audiostate"),
  lighting: $("lighting"), camtune: $("camtune"), flyby: $("flyby"),
  select: $("select"), selTitle: $("select-title"), selTeams: $("sel-teams"),
  selTracks: $("sel-tracks"),
  selPreviewMap: $("sel-preview-map"), selPreviewName: $("sel-preview-name"),
  selPreviewGp: $("sel-preview-gp"), selPreviewMeta: $("sel-preview-meta"),
  selPreviewRec: $("sel-preview-rec"),
  selTrackSection: $("sel-track-section"), selCircuitLabel: $("sel-circuit-label"),
  selBack: $("sel-back"), selGo: $("sel-go"),
  customize: $("customize"),
  results: $("results"), resultsTitle: $("results-title"),
  resultsTable: $("results-table"), resMenu: $("res-menu"), resNext: $("res-next"),
  pmStandings: $("pm-standings"),
  pausebtn: $("pausebtn"), pausemenu: $("pausemenu"), pmsettings: $("pmsettings"), btnCam: $("btn-cam"),
  howtoplay: $("howtoplay"), datahub: $("datahub"), soundbtn: $("soundbtn"),
  btnBoost: $("btn-boost"), btnOT: $("btn-ot"), btnAero: $("btn-aero"), btnBrake: $("btn-brake"),
  btnThrottle: $("btn-throttle"),
  btnSteerLeft: $("btn-steer-left"), btnSteerRight: $("btn-steer-right"),
  shiftUp: $("shift-up"), shiftDown: $("shift-down"),
  gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
};

let gfx = null;
let _backendProved = false;
const PROVE_FRAMES = 300;
let _provedFrames = 0;
let _probeArmed = false;
let _backendBound = false;
const { load: loadBackendScripts } = ScriptLoader.create();
const lazyBundles = LazyBundles.create({
  els, loadBackendScripts, getContext: () => G,
  applyLightTuneIfReady: () => { if (ltStore) applyLightTune(); },
  createNetwork: () => { netPlay = NetPlay.create(G); netLobby = NetLobby.create(G); return netLobby; },
  bindAgent: () => { if (typeof ApexApi !== "undefined") { window.__apex = ApexApi.create(G); if (typeof VisorOptics !== "undefined") window.__apex.visorScene = () => VisorOptics.sceneFromG(G); } },
  onAudioReady: (once = (k, f) => f()) => {
    once("radio", () => { radioVoice = RadioVoice.create(G); });
    once("announcer", () => { announcer = Announcer.create(G); });
    once("rivals", () => { rivalAudio = RivalAudio.create(G); });
    once("carSfx", () => { carSfx = CarSfx.create(G); });
    once("panel", () => { audioPanel = AudioPanel.create(G); });
    once("panelInit", () => { if (audioPanel && audioPanel.init) audioPanel.init(); });
    once("cues", () => { if (typeof DrivingCues !== "undefined" && DrivingCues.create) DrivingCues.create(G); });
  },
  onRaceSessionReady: () => {
    pits = PitLane.create(G);
    engineer = RaceEngineer.create(G);
    startLights = StartLights.create(G);
    marshalPanels = MarshalPanels.create(G);
    records = SessionRecords.create(G);
    if (G.daily.isActive() && G.daily.current().class === "standard") records.prepareDaily();
    raceRadio = RaceRadio.create(G); RaceCeremony.create(G, { duelOn, isWatch: () => realRace.isWatch(), resultsCam: () => resultsCam });
    flyingStart = FlyingStart.create(G, {
      realRace: () => !!(typeof realRace !== "undefined" && realRace && realRace.isActive()) || !!(setupTrialSession && (setupTrialSession.pending() || setupTrialSession.active())),
    });
    jumpStartPenalty = JumpStartPenalty.create(G, {
      autoThrottle, inputOf, launchT0: () => launchT0, soundOn: () => soundOn, isQuali, isTimeTrial,
    });
  },
});
const { ensureGarageExterior, SCENERY_DIR, sceneryResident, ensureCircuit, ensureScenery, ensureTrackBuild, ensureDataHub, ensureNet, ensureAudio, ensureRaceSession, ensureLightPresets, ensureGarageData, wantAgentSurface, loadAgentSurface, bootAgentSurface } = lazyBundles;
if (typeof AudioPanel !== "undefined") AudioPanel._ensure = ensureAudio;
const rendererBoot = RendererBoot.create({ $, els, canvas, ensureDataHub, loadBackendScripts });
const { backendPreference } = rendererBoot;
const backendBoot = await rendererBoot.start();
if (!backendBoot) return;
gfx = backendBoot.gfx;
_backendBound = backendBoot.bound;
if (typeof Assets !== "undefined") {
  Assets.init(gfx);
  const kickPack = () => { const s = Assets.state(); if (s.tier === null && !s.uploaded) Assets.load(); };
  if (typeof requestIdleCallback === "function") requestIdleCallback(kickPack, { timeout: 3000 }); else setTimeout(kickPack, 1500);
}

let _lastFloodEmit = 0;
function initRainDrops() {
  Particles.rainSeed(!(wxArc && wxArc.arc) && isWetRoad() && !isRaining());
}

const { store, ttBoard, hexToRgb, rgbToHex, seasonDriverId } = GameStore;

const { DEFAULT_CUSTOM, TIER_V } = Teams;
let teamIdx = store.get("team", 2);
let driverIdx = store.get("driver", 0);
function storedTrackIndex() {
  const id = store.get("trackId", null);
  const stable = typeof id === "string" ? Tracks.LIST.findIndex((t) => t.id === id) : -1;
  return stable >= 0 ? stable : store.get("track", 0);
}
let trackIdx = storedTrackIndex();
function driverSeatCount(ti) {
  const team = Teams.LIST[ti];
  if (!team) return 1;
  const seats = (typeof Career !== "undefined" && Career.gridDrivers)
    ? Career.gridDrivers(team) : team.drivers;
  return (seats && seats.length) || 1;
}
function setDriverIdxAt(v) {
  driverIdx = v;
  const t = Teams.LIST[teamIdx];
  if (t && t.legends && customTeam && customTeam.syncLegendsTeam) customTeam.syncLegendsTeam(v);
}
function idxOr(v, len, dflt) {
  return (Number.isInteger(v) && v >= 0 && v < len) ? v : dflt;
}
function clampDriverIdx() {
  driverIdx = idxOr(driverIdx, driverSeatCount(teamIdx), 0);
}
function restoreFreePlaySelection() {
  trackIdx = idxOr(storedTrackIndex(), Tracks.LIST.length, 0);
  teamIdx = idxOr(store.get("team", 2), Teams.LIST.length, 2);
  driverIdx = store.get("driver", 0);
  clampDriverIdx();
}
let difficulty = store.get("difficulty", "hard");
AiBand.setMode(store.get("aiPace", "scripted"));
let raceReliability = store.get("reliability", "off");
let raceTyreWear = store.get("tyreWear", "real");
let raceDirtyAir = store.get("dirtyAir", PhysicsConsts.DirtyAir.defaultLevel);
let raceAeroMode = store.get("aeroMode", "manual");
if (!Reliability.isLevel(raceReliability)) raceReliability = "off";
if (!TyreModel.isLevel(raceTyreWear)) raceTyreWear = "real";
Wind.setLevel(store.get("wind", "real"));
if (!PhysicsConsts.DirtyAir.isLevel(raceDirtyAir)) raceDirtyAir = PhysicsConsts.DirtyAir.defaultLevel;
let soundOn = store.get("sound", true);
let musicEnabled = store.get("music", true);
let manualMode = store.get("manual", false);
let unlimitedBudget = store.get("unlimitedBudget", true);
const STEER_MODES = ["tilt", "buttons", "touch"];
let steerMode = store.get("steerMode", "buttons"); if (!STEER_MODES.includes(steerMode)) steerMode = "buttons";
const HUD_PROFILES = ["minimal", "standard", "broadcast"];
let hudProfile = store.get("hudProfile", "standard");
if (HUD_PROFILES.indexOf(hudProfile) < 0) hudProfile = "standard";
const HUD_MET_LAYOUTS = ["auto", "full", "timing", "driver", "compact"];
let hudMetricsLayout = store.get("hudMetricsLayout", "full");
if (HUD_MET_LAYOUTS.indexOf(hudMetricsLayout) < 0) hudMetricsLayout = "full";
function hudLayoutNote() {
  const base = "AUTO is the full set, scaled to fit. TIMING keeps sectors and gaps, DRIVER the car-state chips, COMPACT neither.";
  if (hudMetricsLayout !== "auto") return base;
  const m = document.body.className.match(/hud-met-([a-z]+)/);
  return base + (m ? " Here AUTO is " + m[1].toUpperCase() + "." : "");
}
const HUD_VIS_MODES = ["auto", "on", "off"];
let hudMapVis = store.get("hudMapVis", "on");
let hudGapsVis = store.get("hudGapsVis", "on");
if (HUD_VIS_MODES.indexOf(hudMapVis) < 0) hudMapVis = "on";
if (HUD_VIS_MODES.indexOf(hudGapsVis) < 0) hudGapsVis = "on";
function paintHudDetailsSummary() {
  const on = !document.body.classList.contains("hud-hidden");
  SettingRow.paint($("pm-hidehud"), on ? "on" : "off");
  SettingRow.paint($("pm-hudprofile"), hudProfile);
  SettingRow.paint($("pm-hudmetrics"), hudMetricsLayout);
  SettingRow.paint($("pm-hudmap"), hudMapVis);
  SettingRow.paint($("pm-hudgaps"), hudGapsVis);
  const hudMirror = MirrorPass.MODES.indexOf(store.get("hudMirror", "auto")) < 0 ? "auto" : store.get("hudMirror", "auto");
  SettingRow.paint($("pm-hudmirror"), hudMirror);
  const note = $("pm-hudmetrics-note");
  if (note) note.textContent = hudLayoutNote();
  const sum = $("pm-hud-details-sum");
  if (!sum) return;
  const bits = [["k", "HUD"], [on ? "on" : "off", on ? "ON" : "OFF"],
    ["val", hudProfile.toUpperCase()], ["val", hudMetricsLayout.toUpperCase()],
    [hudMapVis === "off" ? "off" : "on", hudMapVis === "off" ? "NO MAP" : "MAP"],
    [hudGapsVis === "off" ? "off" : "on", hudGapsVis === "off" ? "NO GAPS" : "GAPS"],
    [hudMirror === "off" ? "off" : "on", hudMirror === "off" ? "NO MIRROR" : "MIRROR"]];
  sum.innerHTML = bits.map((p, i) => (i ? '<span data-fold="sep"> · </span>' : "") +
    '<span data-fold="' + p[0] + '">' + p[1] + "</span>").join("");
}
function syncMetricsOverlayCompact() {
  const metrics = document.getElementById("game-metrics");
  if (!metrics) return;
  const compact = hudProfile === "minimal" || hudMetricsLayout === "compact";
  if (compact) metrics.dataset.compact = "1";
  else delete metrics.dataset.compact;
}
function gearsManual() {
  return manualMode && (steerMode === "tilt" || !Input.touchControlsNeeded());
}
let autoThrottleOpt = store.get("autoThrottle", false);
let throttleLatchOpt = store.get("throttleLatch", false);
function autoThrottle() { return autoThrottleOpt || (Input.touchControlsNeeded() && steerMode === "touch"); }
let mirrorControls = store.get("mirrorControls", false);
function applyMirrorControls() { document.body.classList.toggle("mirror-controls", mirrorControls); }
let season = SeasonCal.load();

const { VMAX, ACCEL, BRAKE, REVERSE_MAX, REVERSE_ACCEL, COAST_DRAG,
        GRAVITY_SLOPE, LAT_MAX, STEER_VMAX, FRONT_WEIGHT,
        WT_LONG, DOWNFORCE, X_OPEN_RATE, X_CLOSE_RATE,
        X_MIN_SPEED, OT_MIN_SPEED, OFF_GRIP, ASSIST_KUS, LINE_PURSUIT,
        LONG_GRIP, GRASS_V, KERB_SHAKE, KERB_CUE_HOLD,
        DEPLOY_A, TAPER_LO, TAPER_HI, TAPER_FLOOR, REGEN_FULL_V,
        OT_GAP, GEARS, GEAR_TOP, IDLE_RPM, MAX_RPM, DIFF, BAND_CEIL,
        TOW_RANGE, TOW_FADE, TOW_HALF_W } = PhysicsConsts;
const driveTune = DriveTune.create();
const {
  vTop, vStd, aStd, xVmaxGain, paceRef, xCoastCut, xDfLoss,
  isErsDeploying, drainFor, regenFor, otTimeFor, aeroDfMult, gearHi, rpmFor,
} = PaceMath.create({
  getPACE: () => driveTune.PACE,
  getVMAX: () => VMAX,
  getCars: () => cars,
  getTrack: () => track,
  getRaceCtl: () => raceCtl,
});
function beachedAt(c) { return c.offroad && c.speed < GRASS_V * 0.6 * Math.max(driveTune.PACE, 0.05) + 1.5 * Math.max(driveTune.PACE, 0.05); }
function dashKph(v) { return vStd(v) * 3.6; }
function aTop()  { return ACCEL * Math.max(driveTune.PACE, 0.05); }
function paceVmax(o) { return (o._vmaxNow || (o.human ? vTop() : 0)) / (1 + xVmaxGain(o) * (o.aeroX || 0)) * (o.human ? (o.paceF || 1) : 1); }
function scriptPace(o) { return (o && o.tierV > 0 && o.skill > 0) ? o.tierV * o.skill : 0; }
const H_D = 2;
const _hA = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _hB = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _trk = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _tf = { s: 0, x: 0 };
const _tfSamp = { track: null, s: NaN };
function trackFrom(px, pz, sPredicted) {
  let s = wrapS(sPredicted), aPrev = 0, dPrev = 0, fresh = false;
  for (let i = 0; i < 6; i++) {
    Tracks.sample(track, s, _trk);
    let tx = _trk.t[0], tz = _trk.t[2];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const along = (px - _trk.p[0]) * tx + (pz - _trk.p[2]) * tz;
    if (Math.abs(along) < (i < 2 ? 1e-3 : 0.05)) { fresh = true; break; }
    const h = i < 2 ? 1 : (aPrev - along) / dPrev, d = clamp(along / clamp(Number.isFinite(h) ? h : 1, 0.1, 2.5), -12, 12); s = wrapS(s + d); aPrev = along; dPrev = d;
  }
  if (!fresh) Tracks.sample(track, s, _trk);
  let rx = _trk.r[0], rz = _trk.r[2];
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  _tf.s = s;
  _tf.x = (px - _trk.p[0]) * rx + (pz - _trk.p[2]) * rz;
  _tfSamp.track = track; _tfSamp.s = s;
  return _tf;
}
function sampleAt(s, out) {
  if (s !== _tfSamp.s || track !== _tfSamp.track) return Tracks.sample(track, s, out);
  const a = _trk, p = out.p, t = out.t, r = out.r;
  p[0] = a.p[0]; p[1] = a.p[1]; p[2] = a.p[2]; t[0] = a.t[0]; t[1] = a.t[1]; t[2] = a.t[2];
  r[0] = a.r[0]; r[1] = a.r[1]; r[2] = a.r[2]; out.hw = a.hw;
  return out;
}
const _wf = { x: 0, z: 0 };
function worldFromTrack(s, x, out) {
  Tracks.sample(track, s, out);
  let rx = out.r[0], rz = out.r[2];
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  _wf.x = out.p[0] + rx * x;
  _wf.z = out.p[2] + rz * x;
  return _wf;
}
function frenetH(s, x) {
  TrackSpline.sampleXZ(track, wrapS(s - H_D), _hA);
  TrackSpline.sampleXZ(track, wrapS(s + H_D), _hB);
  const cx = _hB.p[0] - _hA.p[0], cz = _hB.p[2] - _hA.p[2];
  const ox = cx + (_hB.r[0] - _hA.r[0]) * x, oz = cz + (_hB.r[2] - _hA.r[2]) * x;
  const cLen = Math.hypot(cx, cz);
  if (!(cLen > 1e-4)) return 1;
  return clamp(Math.hypot(ox, oz) / cLen, 0.45, 1.8);
}
function deployTaper(c) {
  if (c.otT > 0) return 1;
  const t = clamp(1 - (vStd(c.speed) - TAPER_LO) / (TAPER_HI - TAPER_LO), 0, 1);
  return TAPER_FLOOR + (1 - TAPER_FLOOR) * t;
}
function regenSpeedK(c) { return clamp(vStd(c.speed) / REGEN_FULL_V, 0, 1); }

let /** @type {ReturnType<typeof AeroZones.create> | null} */ aeroZ = null;
function inAeroZone(c) { return !!aeroZ.at(wrapS(c.s)); }

let _simSeed = 1;
let _simRngState = 1 >>> 0;
function simSeed(v, stream) {
  if (v !== undefined) {
    _simSeed = (v >>> 0) || 1;
    _simRngState = typeof stream === "number" ? stream >>> 0 : _simSeed;
  }
  return stream === true ? _simRngState : _simSeed;
}
(function bootSeed() {
  try {
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search || "").get("seed") : null;
    if (q) { simSeed(+q); return; }
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    const a = new Uint32Array(1);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(a); else a[0] = Math.random() * 4294967296;
    simSeed(a[0]);
  } catch (_) {  }
})();
function simRnd() {
  _simRngState = (Math.imul(_simRngState, 1103515245) + 12345) >>> 0;
  return _simRngState / 0x100000000;
}
function gearLo(g) { return g > 1 ? vTop() * GEAR_TOP[g - 2] : 0; }
function naturalGear(speed) {
  for (let g = 1; g <= GEARS; g++) if (speed <= gearHi(g) + 0.01) return g;
  return GEARS;
}
const GAME_LAPS = 3;
const TT_LAPS = 4;
function isWetRoad() { return trackWetness() >= 0.25; }
function isRaining() { return trackWetness() >= 0.72; }
function trackWetness() { return wxArc ? wxArc.wetness() : TyreModel.wetness(raceWeather, null); } function roadWetness() { return trackWetness(); }
function gripMult(c) { return TyreModel.carGrip(c, raceWeather, trackWetness(), c && wxArc ? wxArc.wetnessAt(c.s, c.x) : trackWetness()); }

function restartTTRecorders() {
  Ghost.startLap();
  if (typeof InputGhost !== "undefined") {
    InputGhost.startLap({
      seed: simSeed(),
      physRev: PhysicsConsts.REVISION,
      build: (typeof window !== "undefined" && window.__APEX_BUILD) || 0,
      dt: PhysicsConsts.FIXED_DT,
    });
  }
}

function onCarLineFinish(c, cross) {
  if (RaceControl.deferLine(c, cross, c.s, onCarLineFinish)) return;
  if ((cross.lapValid || cross.flagged) && c.local && netPlay.active()) {
    netPlay.reportLap(cross.lapValid
      ? { lap: c.lap, time: cross.lapDone, best: isFinite(c.best) ? c.best : null, code: c.code, fin: cross.flagged ? c.finishT : undefined }
      : { lap: c.lap, time: null, best: isFinite(c.best) ? c.best : null, code: c.code, fin: c.finishT, invalid: true });
  }
  if (cross.flagged && c.isPlayer && !raceRadio.callsResult()) announce("FINISH!", 2, "race");
}

function onIncidentLineCross(c, cross, newS) {
  if (!c || !cross || RaceControl.deferLine(c, cross, newS, onIncidentLineCross)) return;
  if (cross.direction < 0) {
    if (cross.changed) c._secValid = false;
    if (cross.changed && c.isPlayer) {
      lapRec.sectorIdx = sectorAt(newS); lapRec.sectorStartT = c.lapTime; lapRec.sectorValid = false;
      if (isTimeTrial()) restartTTRecorders();
    }
    return;
  }
  c._secT0 = 0;
  if (c.isPlayer) { lapRec.sectorIdx = 0; lapRec.sectorStartT = 0; }
  if (c.isPlayer && c.lap === lapsTarget && lapsTarget > 1 && !raceRadio.callsLastLap()) announce("FINAL LAP", 1.6, "race");
  if (cross.flagged) {
    if (c.local && netPlay.active()) {
      netPlay.reportLap({ lap: c.lap, time: null, best: null, code: c.code, fin: raceT, invalid: true });
    }
    if (c.isPlayer && !raceRadio.callsResult()) announce("FINISH!", 2, "race");
  }
}

const CAUTION_BRAKE = 0.5;
const _towWin = { range: TOW_RANGE, fade: TOW_FADE, halfW: TOW_HALF_W };
function wakeOf(gap, dx) { return PhysicsConsts.DirtyAir.wakeOf(gap, dx, raceDirtyAir, _towWin); }
function dirtyAirMul(wake, speed) {
  return PhysicsConsts.DirtyAir.mul(wake, speed, raceDirtyAir, DOWNFORCE, vTop());
}

let state = "menu", titleVisit = 0;
function setState(next, why) { if (next !== state) Log.info("game", "State " + state + "->" + next + " why=" + why + " raceT=" + (+raceT || 0).toFixed(1)); if (next !== state) titleVisit++; state = next; }
let /** @type {ReturnType<typeof Tracks.build> | null} */ track = null, builtTrackId = null, builtTrackNight = null;
let gridPreOrdered = false;
let builtGridSlots = null, builtTrackBare = false;
const bareStale = () => builtTrackBare && !!builtTrackId && sceneryResident(builtTrackId);
let cars = [], player = null;
let raceT = 0, countT = 0, lightsLit = 0, resultT = 0, netGreen = null;
let pendingFinishQuit = false;
const postFinish = { solo: false, since: -1 };
const _gridIdleOpts = { soundOn: false, wet: false, step: true };
let launchT0 = 0;
let /** @type {ReturnType<typeof RaceControl.create> | null} */ raceCtl = null;
let /** @type {ReturnType<typeof WeatherArc.create> | null} */ wxArc = null;
let /** @type {ReturnType<typeof TyreModel.create> | null} */ tyres = null;
let /** @type {ReturnType<typeof PitLane.create> | null} */ pits = null;
let _pitCrewDrawn = () => 0;
const postLim = { r: 0, l: 0, minOut: 0, side: 0 };
const stricken = (o) => incidentSim.owns(o) || (o.rescueT || 0) > 0.25 || (!!o.offroad && (o.offT || 0) > 0.5)
  || (!(o.pitState && o.pitState !== "none") && (o.speed || 0) < vTop() * 0.05);
const cautionFair = (o) => SportingRegs.exempt(o) || stricken(o);
const scWatch = SportingRegs.createPassWatch(0, stricken);
const blueWatch = SportingRegs.createBlueFlagWatch(stricken);
function notePenaltyWhy(c, why) { if (!c.penaltyWhy) c.penaltyWhy = why; else if (c.penaltyWhy.indexOf(why) < 0) c.penaltyWhy += "; " + why; }
function scPassCall(ev) {
  if (!ev || !player) return; Log.info("game", "Caution pass " + ev.type + " n=" + (ev.n || 0) + (ev.sec ? " pen=+" + ev.sec + "s" : "") + " lap=" + player.lap + " level=" + raceCtl.level); if (ev.type === "cleared") { announce("POSITION RETURNED — NO PENALTY", 1.5, "penalty-warn"); return; }
  if (ev.type === "warn") { announce("GIVE THE POSITION BACK" + (ev.n > 1 ? " — " + ev.n + " PLACES" : ""), 2.5, "penalty-warn", () => scWatch.info().owed > 0); return; }
  player.penalty += ev.sec; notePenaltyWhy(player, "overtaking under caution");
  resultT = 0;
  announce("+" + ev.sec + "s PENALTY — OVERTAKING UNDER CAUTION", 3, "penalty-hit");
  if (soundOn) GameAudio.penalty();
}
function blueFlagCall(ev) {
  if (!ev || !player) return;
  Log.info("game", "Blue flag " + ev.type + (ev.code ? " code=" + ev.code : "") + (ev.sec ? " pen=+" + ev.sec + "s" : "") + " lap=" + player.lap);
  if (ev.type === "warn") { announce("BLUE FLAG WARNING", 2, "penalty-warn"); return; }
  player.penalty += ev.sec; notePenaltyWhy(player, "ignoring blue flags");
  resultT = 0;
  announce("+" + ev.sec + "s IGNORING BLUE FLAGS", 3, "penalty-hit");
  if (soundOn) GameAudio.penalty();
}
const PIT_LAMP_GREEN = ["near", "enter", "armed", "lane", "keep", "near-box", "square", "stop", "box"];
let /** @type {ReturnType<typeof RaceEngineer.create> | null} */ engineer = null;
function setCautionEnabled(on) { return raceCtl.setEnabled(on); }
function updateCaution(dt) { raceCtl.update(dt); }
function applyCaution(d) { return raceCtl.apply(d); }
function cautionInfo() { const i = raceCtl.info(), w = scWatch.info(); i.owed = w.owed; i.owedT = w.t; i.owedCode = w.code; return i; }
function cautionLevel() { return raceCtl.level; }
function otEnabled() { return raceCtl.otEnabled(); }
let camEye = [0, 6, -10], camTgt = [0, 0, 0], camFov = 62, camFovBoost = 0;
let camAncX = null, camAncZ = 0;
let camAncNX = null, camAncNZ = 0;
let hideMeshes = {};
let dbgCam = null;
let photoMode = false;
let _photoPrevScale = 1;
const photoCam = { pos: [0, 6, 0], yaw: 0, pitch: 0, fov: 60 };
const photoKeys = { w: false, s: false, a: false, d: false, up: false, dn: false,
                    pu: false, pd: false, yl: false, yr: false, boost: false };
const photoMove = { x: 0, y: 0 };
const photoLook = { x: 0, y: 0 };
const photoMouse = { dx: 0, dy: 0, drag: false, px: 0, py: 0, pid: null };
let photoAlt = 0;
let photoVertT = 0;
let _studioRig = null;
const _studioBuf = [];
function buildStudioRig() {
  const R = _studioRig;
  if (!player || player.px == null || !track) return null;
  const cx = player.px, cz = player.pz;
  Tracks.sample(track, ((player.s % track.total) + track.total) % track.total, smp);
  const cy = smp.p[1];
  _studioBuf.length = 0;
  for (let i = 0; i < R.n; i++) {
    const a = (i / R.n) * Math.PI * 2 + (R.spin || 0);
    const lx = cx + Math.cos(a) * R.dist, lz = cz + Math.sin(a) * R.dist, ly = cy + R.h;
    let ax = cx - lx, ay = (cy + 0.5) - ly, az = cz - lz;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const e = R.intensity * 0.55;
    _studioBuf.push(lx, ly, lz,
      R.color[0] * e, R.color[1] * e, R.color[2] * e,
      R.radius, ax, ay, az, 0.88, 0.60, 0.12, 0, 1);
  }
  const ek = R.intensity * 0.55 * 1.4;
  _studioBuf.push(cx, cy + R.h + 3, cz,
    R.color[0] * ek, R.color[1] * ek, R.color[2] * ek,
    R.radius, 0, -1, 0, 0.80, 0.45, 0.15, 0, 1);
  return _studioBuf;
}
let headlessMode = false;
const { CAM_MODES } = CamModes;
let camMode = Math.min(Math.max(store.get("camMode", 19) | 0, 0), CAM_MODES.length - 1);
let flow = "gp";
let session = "race";
const isChampionship = () => flow === "season" || flow === "career";
const gridFromQuali = () => (isChampionship() ? SeasonCal.quali() : (qualiGrid() && !isTimeTrial() && !realRace.status().active));
function setFlow(v) { flow = v; Career.engage(v === "career"); SeasonCal.engage(v); }
const isTimeTrial = () => session === "tt";
const isQuali = () => session === "quali";
let practiceMode = false;
const isPractice = () => practiceMode || isTimeTrial();
let duelMode = false;
const duelOn = () => duelMode && !isChampionship() && !isTimeTrial() && !isQuali();
const duelSetting = () => duelMode;
let duelLegend = "";
let qualiField = null;
let careerSettlement = null;
const isCareer = () => flow === "career";
let lapsTarget = GAME_LAPS;
let raceLaps = GAME_LAPS;
const GRID_RULES = ["tier", "quali", "rev10", "revchamp", "random"];
let raceGrid = store.get("raceGrid", "random");
if (GRID_RULES.indexOf(raceGrid) < 0) raceGrid = "tier";
const qualiGrid = () => raceGrid === "quali" || raceGrid === "rev10";
const CHAMP_GRID_RULES = ["champ", "tier", "revchamp", "random"];
let champGrid = store.get("champGrid", raceGrid === "revchamp" ? "revchamp" : "champ");
if (CHAMP_GRID_RULES.indexOf(champGrid) < 0) champGrid = "champ";
let /** @type {ReturnType<typeof QualiNet.create> | null} */ qualiNet = null;
let raceWeather = "dry";
let raceTimeOfDay = "default";
const lapRec = LapRecord.create();
let frameSky = {}, frame = {};
let _skyT = 0, _skyHold = false;
const stormFx = StormFlash.create();
const feel = { shake: 0, camRoll: 0, hitStop: 0, startHold: 0, restartPending: false };
let _cloudBase = 0.4;
const _mq = (typeof window !== "undefined" && window.matchMedia)
  ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function motionReduced() {
  return typeof TitleFx !== "undefined" && typeof TitleFx.mode === "function" ? TitleFx.mode() === "reduce" : !!(_mq && _mq.matches)
    || (typeof document !== "undefined" && document.documentElement && document.documentElement.dataset.motion === "reduce");
}
function camComfort() { return XrBoot.camComfort(motionReduced()) || (typeof CamComfort !== "undefined" && CamComfort.active()); }
let camSlipSm = 0;
let camCutT = 0;
const COUNTDOWN_S = 5;
let paused = false;
let raceLineAssist = 0;
let frozen = false, raceRestarting = false;
let skyViewOverride = null;
let _testInput = null;
const NEUTRAL_INPUT = Object.freeze({ steer: 0, throttle: false, brake: false });
const PAUSED_NET_INPUT = Object.freeze({ steer: 0, throttle: false, throttleLevel: 0, brake: true });
function inputOf(c) {
  if (c.local && paused && netPlay.active()) return PAUSED_NET_INPUT;
  if (c.local) return _testInput;
  return c.netInput || NEUTRAL_INPUT;
}
let _leadHuman = null;
let netStart = null;
let netNow = null;
let playerMods = { speed: 1, accel: 1, cornering: 1, braking: 1 };
let playerAeroLoad = 0.5;
let playerErs = { deploy: 0.5, regen: 0.5 };
const NEUTRAL_MODS = Object.freeze({ speed: 1, accel: 1, cornering: 1, braking: 1 });
let lastFrame = 0, /** @type {ReturnType<typeof RaceMessageHistory.create> | null} */ raceMessageHistory = null, /** @type {ReturnType<typeof ControllerProfileControls.create> | null} */ controllerProfileUi = null, /** @type {ReturnType<typeof RaceMixControls.create> | null} */ raceMixUi = null, /** @type {ReturnType<typeof SetupTrialSession.create> | null} */ setupTrialSession = null;
const banner = AnnounceBanner.create({
  els: () => els, player: () => player, state: () => state, hudProfile: () => hudProfile,
  camMode: () => camMode, camModes: () => CAM_MODES, radioVoice: () => radioVoice,
  history: () => raceMessageHistory,
});
let radioVoice = RadioVoice.inert();
function announce(msg, dur, kind, still, quiet) { return banner.announce(msg, dur, kind, still, quiet); }
let announcer = Announcer.inert();
let /** @type {ReturnType<typeof SkidMarks.create> | null} */ skids = null;
const { PAINT_WET_NIGHT, PAINT_WET_DAY, PAINT_DRY_NIGHT, PAINT_DRY_DAY } = GradeTint;
function carPaintMat(base) { return GradeTint.carPaint(base, LT); }
function hueRotateTint(rgb, deg) { return GradeTint.hue(rgb, deg); }
function satAdjust(rgb, amt) { return GradeTint.sat(rgb, amt); }
const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const smp2 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };

const clamp = M4.clamp, lerp = M4.lerp;
const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));
function fmtTime(t) {
  if (!isFinite(t) || t <= 0) return "-";
  const cs = Math.round(t * 100), m = Math.floor(cs / 6000), s = (cs - m * 6000) / 100;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
}
function wrapS(s) { const L = track.total; s %= L; return s < 0 ? s + L : s; }
function sectorAt(s) {
  const frac = wrapS(s) / track.total;
  const sec = track.def && track.def.sectors;
  if (sec && sec.length === 2) {
    return frac < sec[0] ? 0 : frac < sec[1] ? 1 : 2;
  }
  return frac < 1 / 3 ? 0 : frac < 2 / 3 ? 1 : 2;
}
function lerpS(prev, cur, a) {
  if (prev === undefined || a >= 1) return cur;
  const L = track.total;
  const d = M4.wrapDelta(cur - prev, L);
  return wrapS(prev + d * a);
}
const _rp = { x: 0, z: 0, world: false };
function renderPosOf(c) {
  if (c.px != null && c.rPrevPx !== undefined) {
    _rp.x = c.rPrevPx + (c.px - c.rPrevPx) * renderAlpha;
    _rp.z = c.rPrevPz + (c.pz - c.rPrevPz) * renderAlpha;
    _rp.world = true;
  } else if (c.px != null) {
    _rp.x = c.px; _rp.z = c.pz; _rp.world = true;
  } else {
    _rp.world = false;
  }
  return _rp;
}
const _pa = { world: false, cS: 0, cX: 0 };
let _plCS = 0, _plCX = 0, _plOk = false, _plBodyOk = false;
const _smpPlayer = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _bankPlayer = { dy: 0, roll: 0 };
function playerAnchor(c) {
  if (c.px != null) {
    const wx = (c.rPrevPx === undefined) ? c.px : c.rPrevPx + (c.px - c.rPrevPx) * renderAlpha;
    const wz = (c.rPrevPz === undefined) ? c.pz : c.rPrevPz + (c.pz - c.rPrevPz) * renderAlpha;
    const tf = trackFrom(wx, wz, c.s);
    _pa.world = true; _pa.cS = tf.s; _pa.cX = tf.x;
  } else {
    _pa.world = false;
    _pa.cS = lerpS(c.rPrevS, c.s, renderAlpha);
    _pa.cX = (c.rPrevX === undefined) ? c.x : c.rPrevX + (c.x - c.rPrevX) * renderAlpha;
  }
  return _pa;
}
function yawVisInterp(c) {
  const y1 = c.yawVis || 0;
  if (c.rPrevYawVis === undefined) return y1;
  let dy = y1 - c.rPrevYawVis;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  return c.rPrevYawVis + dy * renderAlpha;
}
const _dirPos = [0, 0], _dirPose = { s: 0, x: 0, carPos: null, carHead: 0 };
const _dirSmp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
function camPoseOf(c) {
  const pa = playerAnchor(c), rp = renderPosOf(c);
  _dirPose.s = pa.cS; _dirPose.x = pa.cX; _dirPose.carHead = headInterp(c);
  if (!c.human && !netPlay.owns(c) && !incidentSim.owns(c)) {
    Tracks.sample(track, pa.cS, _dirSmp);
    const t = _dirSmp.t, r = _dirSmp.r, yv = yawVisInterp(c);
    const cy = Math.cos(yv) / (Math.hypot(...t) || 1), sy = Math.sin(yv) / (Math.hypot(...r) || 1);
    _dirPose.carHead = Math.atan2(t[0] * cy + r[0] * sy, t[2] * cy + r[2] * sy);
  }
  _dirPose.carPos = rp.world ? (_dirPos[0] = rp.x, _dirPos[1] = rp.z, _dirPos) : null; return _dirPose;
}
function headInterp(c) {
  const h1 = c.head || 0;
  if (c.rPrevHead === undefined) return h1;
  let dh = h1 - c.rPrevHead;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  return c.rPrevHead + dh * renderAlpha;
}
function basisMat(r, u, f, p, out) {
  out[0] = r[0]; out[1] = r[1]; out[2] = r[2]; out[3] = 0;
  out[4] = u[0]; out[5] = u[1]; out[6] = u[2]; out[7] = 0;
  out[8] = f[0]; out[9] = f[1]; out[10] = f[2]; out[11] = 0;
  out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
  return out;
}
const tmpMat = new Float32Array(16);
const _groundMat = new Float32Array(16);
const _cockMat = new Float32Array(16), _cockU = [0, 1, 0];
const _cockP = [0, 0, 0];
const tmpR = [0, 0, 0], tmpF = [0, 0, 0], tmpU = [0, 1, 0], tmpP = [0, 0, 0];
const _groundR = [0, 0, 0], _groundF = [0, 0, 0], _groundU = [0, 1, 0];
const MAT_IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const MAT_REFLECT_X = new Float32Array([-1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _mProj = new Float32Array(16), _mView = new Float32Array(16), _mVP = new Float32Array(16);
const _mInvVP = new Float32Array(16);
const _mInvProj = new Float32Array(16);
const _sunVS = new Float32Array(3);
const _upVS = new Float32Array(3);
const _smpRoad = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _camUp = [0, 0, 0];

function careerFitted(teamId) {
  const c = Career.inCareer() ? Career.data() : null;
  return c && teamId === c.team ? c : null;
}
function getTeamParts(teamId) {
  const c = careerFitted(teamId);
  if (c) return { ...c.fitted };
  return store.get("parts." + teamId, {});
}
function saveTeamParts(teamId, parts) {
  const c = careerFitted(teamId);
  if (c) { if (Career.conflicted && Career.conflicted()) return false; c.fitted = parts; Career.save(); return true; }
  store.set("parts." + teamId, parts); return true;
}

const customLiv = CustomLiveries.create({ store });
const {
  getLiveryId, saveLiveryId, getCustomLiveries, setCustomLiveries,
  getLiveries, resolveLivery, factoryLivery, wingColorOfLivery,
} = customLiv;

const _flapWorld = new Float32Array(16);
function drawAeroFlaps(team, aLvl, blend, modelMat, mat, style, only, still, viewLivery) {
  const own = team.peerLivery || resolveLivery(team), col = wingColorOfLivery(own, team), b = clamp(blend, 0, 1);
  const livery = viewLivery || own, finish = CarMaterials.finishOf(livery, "wingFinish");
  const surface = livery.wingCarbon === "carbon" ? "carbon" : "paint";
  const rearCol = surface === "carbon" ? col : (livery.rearWing || livery.c2 || team.color2);
  const co = typeof CarDraw !== "undefined" ? CarDraw.coOpt(mat) : mat;
  if (still || b === 0 || b === 1) {
    const set = CarMesh.getAeroFlapSet(aLvl, col, style, finish, b >= 0.5, only, surface, rearCol);
    if (set) gfx.draw(set, modelMat, co);
    if (b >= 0.5 && CarMesh.drawAeroEdge) CarMesh.drawAeroEdge(modelMat, aLvl, style, 1);
    return;
  }
  const flaps = Car3D.aeroFlaps(aLvl, style);
  for (let i = 0; i < flaps.length; i++) {
    const fg = flaps[i];
    if (only && fg.wing !== only) continue;
    const ang = fg.zAngle + (fg.xAngle - fg.zAngle) * b;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const W = _flapWorld;
    W.set(modelMat);
    for (let k = 0; k < 3; k++) {
      const uu = modelMat[4 + k], ff = modelMat[8 + k];
      W[4 + k] = uu * ca + ff * sa;
      W[8 + k] = -uu * sa + ff * ca;
      W[12 + k] += uu * fg.y + ff * fg.z;
    }
    const mesh = CarMesh.getAeroFlap(aLvl, fg.paint ? rearCol : col, i, style, fg, finish, surface);
    if (mesh) gfx.draw(mesh, W, co);
  }
  if (CarMesh.drawAeroEdge) CarMesh.drawAeroEdge(modelMat, aLvl, style, b);
}

function partsVisualKey(teamId) {
  const team = teamById(teamId);
  const vt = Parts.getVisualTiers(getTeamParts(teamId), team);
  const parts = vt._ids ? Parts.CATALOG.map((c) => vt._ids[c.id]).join("|")
                        : Parts.CATALOG.map((c) => vt[c.id]).join("");
  return parts + "|L:" + getLiveryId(teamId);
}

function modsFor(team, setup, tune) {
  const stats = Career.teamStats(team) || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const mods = Parts.getMods(setup, team, tune || null);
  return {
    speed:     Parts.statMult(stats.speed)     * mods.speed,
    accel:     Parts.statMult(stats.accel)     * mods.accel,
    cornering: Parts.statMult(stats.cornering) * mods.cornering,
    braking:   Parts.statMult(stats.braking)   * mods.braking,
  };
}

function tyreBaseModsFor(team, setup, tune) {
  const full = modsFor(team, setup, tune);
  const tyre = Parts.resolveSetup(setup, team).options.tyres;
  return {
    speed: full.speed / (tyre.speed == null ? 1 : tyre.speed),
    accel: full.accel / (tyre.accel == null ? 1 : tyre.accel),
    cornering: full.cornering / (tyre.cornering == null ? 1 : tyre.cornering),
    braking: full.braking / (tyre.braking == null ? 1 : tyre.braking),
  };
}

function setCarRole(c, human, local) {
  c.human = !!human;
  c.local = !!local;
  c.isPlayer = !!local;
}

function wireId(c) {
  if (!c || !c.team) return -1;
  if (c._wireId !== undefined) return c._wireId;
  const ti = Teams.LIST.findIndex((t) => t.id === c.team.id);
  return (c._wireId = ti < 0 ? -1 : ti * 2 + (c.seat || 0));
}

function swapGridSlots(a, b) {
  if (!a || !b || a === b) return false;
  for (const k of ["s", "x", "xVis", "gridPos", "prog", "lap"]) {
    const t = a[k]; a[k] = b[k]; b[k] = t;
  }
  for (const c of [a, b]) {
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x; c.pz = w.z;
    c.rPrevPx = c.px; c.rPrevPz = c.pz;
    c.rPrevS = c.s; c.rPrevX = c.x;
    c._prevS = c.s;
  }
  return true;
}

function recomputePlayerMods() {
  const team = player ? player.team : Teams.LIST[teamIdx];
  const standard = daily.isActive() && daily.current().class === "standard";
  const setup = standard ? Parts.getFactorySetup(team) : getTeamParts(team.id);
  const tune = standard ? undefined : SetupTune.mods(team.id);
  playerMods = modsFor(team, setup, tune);
  if (player) {
    player.tyreBaseMods = tyreBaseModsFor(team, setup, tune);
    player.mods = playerMods;
    tyres.applyCompound(player, player.tyre || tyres.optionRecord(Parts.resolveSetup(setup, team).options.tyres));
    playerMods = player.mods;
    player.brakeBias = standard ? SetupTune.BB_REF : SetupTune.brakeBias(team.id);
    player.rollBalance = standard ? 0 : SetupTune.balance(team.id);
  }
  playerAeroLoad = Parts.aeroLoad(setup, team, standard ? undefined : SetupTune.aero(team.id));
  if (player) player.aeroLoad = playerAeroLoad;
  playerErs = Parts.ersProfile(setup, team);
  if (player) { player.ersDeploy = playerErs.deploy; player.ersRegen = playerErs.regen; }
  const vt = Parts.getVisualTiers(setup, team);
  carDraw.setPlayerParts(vt, (vt._ids ? Parts.CATALOG.map((c) => vt._ids[c.id]).join("|")
                                      : Parts.CATALOG.map((c) => vt[c.id]).join(""))
                             + "|L:" + getLiveryId(team.id));
}

function driverSkill(team, d, di) {
  const roll = simRnd();
  const r = DriverRatings.get(d.code, team.tier, Career.devFor(team.id, di));
  return {
    skill: DriverRatings.skill(r, roll),
    craft: (r.craft || 75) / 100, awareness: (r.awareness || 75) / 100,
    experience: (r.experience || 75) / 100, consistency: (r.consistency || 75) / 100,
    aggression: DriverRatings.style01(r.aggression), optimism: DriverRatings.style01(r.optimism), composure: DriverRatings.style01(r.composure),
    tyreCare: DriverRatings.style01(r.tyreCare), ersBias: DriverRatings.style01(r.ersBias),
  };
}
const buildPace = DriverRatings.buildPace;

function gridTeams() {
  return Teams.LIST.filter((t, ti) => Teams.isReal(t) || ti === teamIdx);
}
function seatsFor(team) {
  if (!team || !team.legends) return Career.gridDrivers(team);
  const d = team.drivers || [];
  if (!d.length) return [];
  return [d[Math.min(Math.max(driverIdx | 0, 0), d.length - 1)]];
}
function fieldSize() {
  return gridTeams().reduce((s, t) => s + seatsFor(t).length, 0);
}

function makeCars() {
  cars = []; clampDriverIdx();
  const grid = gridTeams();
  const total = grid.reduce((s, t) => s + seatsFor(t).length, 0);
  let idx = 0;
  grid.forEach((team) => {
    const ti = Teams.LIST.indexOf(team);
    const worksParts = Parts.resolveSetup(Parts.getFactorySetup(team), team);
    const aiSetup = Career.inCareer() && Career.aiSetup && Career.aiSetup(team);
    const factoryParts = aiSetup ? Parts.resolveSetup(aiSetup, team) : worksParts;
    const catalogPace = aiSetup ? buildPace(Parts.resolveSetup({ ...factoryParts.setup,
      aero: worksParts.setup.aero, ers: worksParts.setup.ers }, team), worksParts) : 1;
    const savedParts = ti === teamIdx && !(daily.isActive() && daily.current().class === "standard") ? Parts.resolveSetup(getTeamParts(team.id), team) : factoryParts;
    const matePace = ti === teamIdx ? DriverRatings.ladderPace(buildPace(Parts.resolveSetup({ ...savedParts.setup, aero: factoryParts.setup.aero, ers: factoryParts.setup.ers }, team), factoryParts), team.tier, TIER_V) : 1;
    seatsFor(team).forEach((dSeat, di) => {
      const isP = ti === teamIdx && (team.legends ? true : di === driverIdx);
      const mate = !isP && ti === teamIdx && !!team.custom;
      const resolvedParts = isP || mate ? savedParts : factoryParts;
      const d = Career.driverOverride(team.id, di) || dSeat;
      const half = Math.max(1, (total - 1) >> 1);
      const lane = clamp((idx % 2 ? 1 : -1) * ((idx >> 1) / half) * 0.78
        + (simRnd() - 0.5) * 0.12, -0.85, 0.85);
      idx++;
      cars.push({
        team, name: d.name, code: d.code, driverId: seasonDriverId(team.id, di), num: d.num,
        human: isP, local: isP, isPlayer: isP,
        mods: isP ? modsFor(team, getTeamParts(team.id), SetupTune.mods(team.id)) : null,
        tyreBaseMods: isP ? tyreBaseModsFor(team, getTeamParts(team.id), SetupTune.mods(team.id)) : null,
        rollBalance: isP ? SetupTune.balance(team.id) : 0,
        aeroLoad: (isP || mate) ? Parts.aeroLoad(getTeamParts(team.id), team, isP ? SetupTune.aero(team.id) : undefined) : Parts.aeroLoad(factoryParts.setup, team),
        ersDeploy: (isP || mate) ? Parts.ersProfile(getTeamParts(team.id), team).deploy : Parts.ersProfile(factoryParts.setup, team).deploy,
        ersRegen: (isP || mate) ? Parts.ersProfile(getTeamParts(team.id), team).regen : Parts.ersProfile(factoryParts.setup, team).regen,
        color: team.color, tier: team.tier, seat: di, houseStats: Career.teamStats(team),
        tierV: TIER_V[team.tier] * Career.paceMult(team.id) * (mate ? matePace : isP ? 1 : catalogPace),
        tread: (isP || mate) ? (resolvedParts.options.tyres.wetTread || 0) : null,
        tyreOpt: (isP || mate) ? resolvedParts.options.tyres : null,
        tyre: null, tyreWear: 0, tyreLap0: 0, tyreLapAdj: 0, tyrePhysicalOffset: null, tyreStints: 0,
        fuelId: resolvedParts.ids.fuel,
        fuelVisual: resolvedParts.visual.fuel,
        ...CarDraw.carVisual(team, d.num, isP || mate, getTeamParts),
        s: 0, x: 0, speed: 0, prog: 0, lap: 0,
        gear: 1, rpm: IDLE_RPM, shiftT: 0, boostOn: false,
        energy: 1, otT: 0, otE: 0, deploying: false,
        xOn: false, aeroX: 0, xArmed: false,
        lapTime: 0, best: Infinity, totalT: 0,
        finished: false, finishT: 0, finPos: 0, compoundShortAtFinish: null,
        retired: false, dnf: null, dnfAt: null, dnfWhy: null,
        offroad: false, offT: 0, cuts: 0, penalty: 0,
        yawVis: 0, steerVis: 0, collideT: 0,
        ...driverSkill(team, d, di),
        lane, lanePref: lane,
      });
      if (typeof CarFields !== "undefined") CarFields.predeclare(cars[cars.length - 1]);
    });
  });
  player = cars.find((c) => c.isPlayer) || null;
}

function gridRule() {
  const rule0 = isTimeTrial() ? "tier" : isChampionship() ? (SeasonCal.quali() ? "quali" : champGrid) : raceGrid;
  return (rule0 === "random" && netPlay.active()) ? "tier" : rule0;
}
function gridOrderFor(base) {
  const rule = gridRule();
  if (rule === "rev10" && base && base.length === cars.length) {
    return base.slice(0, 10).reverse().concat(base.slice(10));
  }
  if (rule === "revchamp" && isChampionship() && season && !base && Object.values(season.pts || {}).some((p) => p > 0)) {
    for (let i = 0; i < cars.length; i++) simRnd();
    return cars.slice().sort((a, b) => SeasonCal.rank(season, a.driverId, b.driverId)).reverse();
  }
  const champ = rule === "champ" && isChampionship() && season && !base
    ? SportingRegs.champOrder(cars, (a, b) => SeasonCal.rank(season, a, b), (id) => season.pts[id] || 0) : null;
  if (champ) { for (let i = 0; i < cars.length; i++) simRnd(); return champ; }
  if (rule === "random" && !base) {
    const jit = new Map(cars.map((c) => [c, simRnd()]));
    return cars.slice().sort((a, b) => jit.get(a) - jit.get(b));
  }
  return base;
}
function redFlagRestart() {
  if (state !== "race" || !track || cars.some((c) => c.finished)) return false;
  IncidentSim.reset(); DebrisWorld.reset(); DebrisWorld.prime();
  const L = track.total;
  const order = cars.filter((c) => !c.retired).sort((a, b) => b.prog - a.prog);
  const lead = order[0];
  const leadProg = lead ? lead.prog : 0, leadLap = lead ? Math.max(0, lead.lap - 1) : 0;
  order.forEach((c, i) => {
    const slot = TrackMesh.gridSlot(track, i);
    c.s = wrapS(slot.s); c.x = slot.x; c.xVis = c.x;
    c._recross = false;
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x; c.pz = w.z; c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c._prevS = c.s;
    const progWas = c.prog, lapWas = c.lap;
    const down = Math.max(0, Math.floor((leadProg - progWas) / L));
    const lapNew = c === lead ? leadLap : Math.min(lapWas, Math.max(0, leadLap - down));
    if (lapNew < lapWas) {
      c.fuelLap = Math.max(c.fuelLap || 0, lapWas + (c.fuelRestartLaps || 0));
      c.fuelRestartLaps = (c.fuelRestartLaps || 0) + (lapWas - lapNew);
    }
    c.lap = lapNew;
    c.prog = c.lap * L - (L - c.s);
    c._progGift = (c._progGift || 0) + (c.prog - progWas);
    c.head = 0; c.yawVis = 0; c.rPrevHead = 0; c.rPrevYawVis = 0;
    c.speed = 0; c.accSm = 0; c.corridorAccel = 0; c.vLat = 0; c.yawRateCur = 0; c.steerVis = 0; c.aiHead = 0; c.aiBias = null; c.aiFam = 0; c.hYieldT = 0; c.lane = c.lanePref;
    c.gear = 1; c.rpm = IDLE_RPM;
    c.xOn = false; c.aeroX = 0; c.xArmed = false; c.towing = 0; c.wake = 0; c.wheelLock = 0;
    clearRacingScratch(c);
    c.contactT = 0; c.wrongWay = false; c.wrongT = 0; c.rescueT = 0; c.rescueLastT = null; c.digEscHeld = false;
    c.offT = 0; c.wallT = 0; c.wasOnWall = false; OvertakeMode.reset(c);
    c.kerbGripSm = 1; c.kerbCueT = 0; c.brakeStab = null; c.axEstSm = 0;
    pits.clearArm(c);
    const rh = DriverRatings.hash32(simSeed() + ":restart:" + i + ":" + c.skill);
    c.launch = c.human ? null : AiDrive.launchPlan(AiDrive.traits(c), (rh & 0xffff) / 65536);
    c.launchOn = !c.human;
    c.jumpStartFined = false;
    c.incidentInvalidLap = true;
  });
  seedPlayerPose();
  raceCtl.rewound();
  feel.restartPending = true; replayBuf.breakTimeline();
  resultT = 0; postFinish.since = -1;
  scWatch.reset(); blueWatch.reset();
  feel.camRoll = 0; camSlipSm = 0; feel.shake = 0; feel.hitStop = 0; stormFx._thunderT = -1;
  setState("count", "red-flag-restart"); countT = 0; lightsLit = 0; feel.startHold = 0;
  els.lights.hidden = false;
  for (const l of els.lights.children) l.classList.remove("on");
  lapRec.sectorIdx = player ? sectorAt(player.s) : 0; lapRec.sectorStartT = player ? player.lapTime : 0; lapRec.sectorValid = false;
  snapGameCam();
  announce("RED FLAG — STANDING RESTART", 3, "warning");
  Log.info("game", "red flag: standing restart, " + order.length + " cars re-gridded at raceT " + raceT.toFixed(1));
  return true;
}
function gridUp(preOrder) {
  gridPreOrdered = !!(preOrder && preOrder.length === cars.length);
  scWatch.reset();
  blueWatch.reset();
  const order = preOrder && preOrder.length === cars.length ? preOrder.slice() : (() => {
    const jit = new Map(cars.map((c) => [c, simRnd()]));
    const o = cars.slice().sort((a, b) => (a.tier - b.tier) || (jit.get(a) - jit.get(b)));
    const pi = o.indexOf(player);
    if (pi >= 0) {
      o.splice(pi, 1);
      o.splice(Math.min(11, o.length), 0, player);
    }
    return o;
  })();
  tyres.setLevel(isTimeTrial() ? "off" : raceTyreWear);
  order.forEach((c, i) => {
    c.gridPos = i + 1;
    const slot = TrackMesh.gridSlot(track, i);
    c.s = wrapS(slot.s); c.x = slot.x;
    c.xVis = c.x;
    {
      const w = worldFromTrack(c.s, c.x, smp);
      c.px = w.x; c.pz = w.z;
      c.rPrevPx = c.px; c.rPrevPz = c.pz;
      c.rPrevS = c.s; c.rPrevX = c.x;
    }
    c.head = 0; c.yawVis = 0;
    c.speed = 0; c.accSm = 0; c.corridorAccel = 0; c.prog = -(14 + i * 8); c.lap = 0; c.fuelLap = 0; c.fuelRestartLaps = 0; c.energy = 1; c._progGift = 0;
    OvertakeMode.reset(c); c.lapTime = 0; c.best = Infinity; c.totalT = 0;
    c.xOn = false; c.aeroX = 0; c.xArmed = false;
    c.finPos = 0; c.retired = false; c.dnf = null; c.dnfAt = null; c.dnfWhy = null; c._coastHeld = undefined;
    c.finished = false; c.finishT = 0; c.cuts = 0; c.cutWarn = 0; c.qualiCut = false; c.penalty = 0; c.penaltyWhy = null; c.jumpStartFined = false; c.offT = 0; c.hits = 0; c.hitSev = 0; c.wallHits = 0; c.errCount = 0; Damage.reset(c);
    c.wrongT = 0; c.wrongWay = false; c.rescueT = 0; c.rescueLastT = null; c.digEscHeld = false; c.wallT = 0; c.wasOnWall = false;
    c.vLat = 0; c.yawRateCur = 0; c.steerVis = 0; c.yawVis = 0; c.rPrevYawVis = 0; c.aiHead = 0; c.aiBias = null; c.aiFam = 0; c.hYieldT = 0; c.contactT = 0; c.lane = c.lanePref;
    c.rPrevHead = 0;
    c.kerbGripSm = 1; c.kerbCueT = 0; c.towing = 0; c.wake = 0; c.flatSpot = 0; c.brakeStab = null; c.axEstSm = 0;
    clearRacingScratch(c);
    const hSeed = luckSeed();
    const hRound = isChampionship() ? SeasonCal.drawRound(season) : raceIndex;
    const h = DriverRatings.hash32(hSeed + ":" + hRound + ":" + i + ":" + c.skill);
    c.launch = c.human ? null : AiDrive.launchPlan(AiDrive.traits(c), (h & 0xffff) / 65536);
    c.launchOn = !c.human; c.phaseRoll = (h >>> 16) / 65536; c.raceHash = h;
    c.tyreClass = c.human ? null : AiDrive.tyreClass(((h >>> 8) & 0xffff) / 65536, lapsTarget);
    c.tyreStints = 0; c.tyreLog = null; c.compoundShortAtFinish = null;
    pits.reset(c); engineer.reset(c);
    c.pitPlan = tyres.on() ? pits.planFor(c.human ? 0.5 : DriverRatings.hash32(hSeed + ":" + hRound + ":" + (c.driverId || c.code || i) + ":strategy") / 4294967296, !!c.human, 0, c) : null;
    if (c.pitPlan && !c.human) c.tyreClass = c.pitPlan.start;
    tyres.fit(c, tyres.startRecord(c, TyreModel.treadFor(raceWeather, roadWetness())));
  });
  seedPlayerPose();
  if (typeof CarFields !== "undefined") for (const c of cars) CarFields.warmShape(c);
}
function seedPlayerPose() {
  if (!player || player.retired) return;
  const w0 = worldFromTrack(player.s, player.x, smp);
  player.px = w0.x; player.pz = w0.z;
  player.rPrevPx = player.px; player.rPrevPz = player.pz;
  player.head = Math.atan2(smp.t[0], smp.t[2]);
  player.rPrevHead = player.head;
  player.vLat = 0; player.yawRateCur = 0;
}
function clearRacingScratch(c) {
  c.stuckT = 0; c.letPassT = 0; c.passOf = null; c.passT = 0; c.passCool = 0; c.holdOff = null;
  c.defendSide = 0; c.passFailOf = null; c.passFailT = 0; c.errT = 0; c.pressT = 0; c.zoneKey = -1; c.queueT = 0; c._qOf = null; c.trailT = 0; c._trOf = null; c._trYT = 0; c._trYS = 0;
  c.calmUntil = 0; c.calm = 0; c.sbsT = 0; c.atkOn = c.atkWant = false; c.runT = 0; c._alPrev = null; c.paceF = 0;
}

CarMesh.init(gfx);
GarageScene.init(gfx);
Particles.init(gfx);
const { getCarDecalMesh, drawRearLights, drawMirrorLights } = CarMesh;
const _bankScratch = { dy: 0, roll: 0 };
const _bankScratchP = { dy: 0, roll: 0 };
const _marbleArg = { lock: 0, slip: 0, speed: 0 };
const _bankScratchCam = { dy: 0, roll: 0 };
const _vantCarPos = [0, 0];
const _vantExtra = { bankDy: 0, deploy: false, slipLat: 0, att: null, carPos: null, carHead: 0, reduceMotion: false,
  rival: null, playerProg: 0, snap: false, frameSubject: false };
const _camAP = [0, 0, 0], _camAN = [0, 0, 0];

function cameraBankScale(mode) {
  return mode === "heli" || mode === "side" || mode === "cinematic" || mode === "overhead" ? 0.35
       : mode === "pitwall" || mode === "trackside" ? 0 : 1;
}

function currentCarGroundMat(c, out) {
  let cS, cX;
  if (_plOk && c.isPlayer) { cS = _plCS; cX = _plCX; }
  else { const pa = playerAnchor(c); cS = pa.cS; cX = pa.cX; }
  const renderX = cX;
  sampleAt(cS, smp2);
  { const t = smp2.t, r = smp2.r;
    let l = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
    l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l; }
  const bankC = Tracks.banking(track, cS, renderX, _bankScratch);
  if (c.isPlayer) {
    const S = _smpPlayer, p = smp2.p, t = smp2.t, r = smp2.r;
    S.p[0] = p[0]; S.p[1] = p[1]; S.p[2] = p[2]; S.t[0] = t[0]; S.t[1] = t[1]; S.t[2] = t[2];
    S.r[0] = r[0]; S.r[1] = r[1]; S.r[2] = r[2]; S.hw = smp2.hw;
    _bankPlayer.dy = bankC ? bankC.dy : 0; _bankPlayer.roll = bankC ? bankC.roll : 0; _plBodyOk = true;
  }
  const rp = renderPosOf(c);
  tmpP[0] = rp.world ? rp.x : smp2.p[0] + smp2.r[0] * renderX;
  tmpP[1] = smp2.p[1] + (bankC ? bankC.dy : 0);
  tmpP[2] = rp.world ? rp.z : smp2.p[2] + smp2.r[2] * renderX;
  const yv = yawVisInterp(c);
  const cy = Math.cos(yv), sy = Math.sin(yv);
  for (let i = 0; i < 3; i++) {
    _groundF[i] = smp2.t[i] * cy + smp2.r[i] * sy;
    _groundR[i] = smp2.r[i] * cy - smp2.t[i] * sy;
  }
  _groundU[0] = _groundR[1] * _groundF[2] - _groundR[2] * _groundF[1];
  _groundU[1] = _groundR[2] * _groundF[0] - _groundR[0] * _groundF[2];
  _groundU[2] = _groundR[0] * _groundF[1] - _groundR[1] * _groundF[0];
  if (bankC && bankC.roll) {
    const cr = Math.cos(bankC.roll), sr = Math.sin(bankC.roll);
    for (let i = 0; i < 3; i++) {
      const r = _groundR[i], u = _groundU[i];
      _groundR[i] = r * cr + u * sr;
      _groundU[i] = u * cr - r * sr;
    }
  }
  return basisMat(_groundR, _groundU, _groundF, tmpP, out);
}

const sessionDarkFor = (def) => raceTimeOfDay === "night" || raceTimeOfDay === "dusk" ||
  raceTimeOfDay === "dawn" || (raceTimeOfDay === "default" && !!def.night);
const builtWorldFits = (def) => builtTrackId === def.id && builtTrackNight === sessionDarkFor(def) &&
  builtGridSlots === fieldSize() && !bareStale();
const trackBuildOpts = (night, gridSlots) => ({ night, gfx, chunkRibbons: PerfGov.tier() < 3, gridSlots, retainGraph: wantAgentSurface() });
function dropTrackWorld() {
  _menuGate.track = null; _menuGate.ready = ""; _menuGate.warm = 0; _menuFly = null;
  shadowPass.reset(); freeTrackMeshes(track);
  track = null; builtTrackId = null; if (gfx && gfx.flushTexPool) gfx.flushTexPool();
  if (typeof LampBake !== "undefined") LampBake.reset();
}
function raceArmedSentinel() { return state === "race" || state === "count"; }
const RACE_BUILD_PACE = { budgetMs: 16, rafEvery: 3 };
async function loadTrackStepped(idx, live) {
  await Promise.all([ensureCircuit(idx), ensureTrackBuild()]);
  if (!live()) return false;
  const def = Tracks.LIST[idx], sessionDark = sessionDarkFor(def), wantSlots = fieldSize();
  if (builtWorldFits(def)) { loadTrack(idx); return true; }
  const prevId = builtTrackId;
  try { if (raceArmedSentinel()) PerfGov.sentinelArm(true); } catch (_) {  }
  let built = null;
  try {
    if (typeof gfx !== "undefined" && gfx && gfx.warmSettled) { await gfx.warmSettled(); if (gfx.cancelWarmRetry) gfx.cancelWarmRetry(); if (!live()) return false; } dropTrackWorld();
    const opts = trackBuildOpts(sessionDark, wantSlots);
    const switchInSession = (state === "race" || state === "count");
    const msg = switchInSession && typeof TrackBuildClient !== "undefined"
      && await TrackBuildClient.build(idx, def, opts, gfx, sceneryResident(def.id) ? SCENERY_DIR + "/" + def.id + ".js" : null, live);
    if (track !== null || !live()) return false;
    if (msg) try { built = await TrackBuildClient.replay(msg, def, gfx, undefined, live); } catch (e) { Log.warn("track", "build worker replay failed (" + (e && e.message) + "); building in steps"); }
    if (msg && built && (track !== null || !live())) { freeTrackMeshes(built); return false; }
    const pace = () => (loadingScreen.phase() ? RACE_BUILD_PACE : null);
    if (!built) { if (track !== null || !live()) return false; built = await Tracks.buildPaced(def, opts, live, freeTrackMeshes, undefined, pace); }
  } finally {
    try { if (!raceArmedSentinel()) PerfGov.sentinelArm(false); } catch (_) {  }
  }
  if (!built) return false;
  if (track !== null || !live()) { freeTrackMeshes(built); return false; }
  _loadTrackBody(idx, def, built, prevId);
  return true;
}
async function raceTrackStepped(idx, stale) {
  for (let tries = 0; tries < 2; tries++) {
    if (await loadTrackStepped(idx, () => !stale() && !gfxContextLost())) return true;
    if (stale()) return false;
    if (gfxContextLost()) { quitToMenuAfterCtxLost(); return false; }
  }
  throw new Error("track build superseded twice");
}
function loadTrack(idx) {
  _menuGate.track = null; _menuGate.ready = ""; _menuGate.warm = 0;
  const def = Tracks.LIST[idx];
  if (def && !def.custom && !(Tracks.circuitPayloadResident
      ? Tracks.circuitPayloadResident(def)
      : (def.path && def.path.pts && def.path.pts.length && !def._metaOnly))) {
    throw new Error("loadTrack: circuit \"" + (def && def.id) + "\" still meta-only — await ensureCircuit(idx) first");
  }
  try { if (raceArmedSentinel()) PerfGov.sentinelArm(true); } catch (_) {  }
  try {
    return _loadTrackBody(idx, def);
  } finally {
    try { if (!raceArmedSentinel()) PerfGov.sentinelArm(false); } catch (_) {  }
  }
}
function freeTrackMeshes(t) {
  _dlApi.track = _dlApi.sample = _dlApi.curvature = _dlApi.lineAt = null;
  if (!t || !t.meshes) return;
  Tracks.free(t, gfx);
  if (typeof PitSigns !== "undefined") PitSigns.free(gfx, t);
}
function _loadTrackBody(idx, def, built, builtPrevId) {
  shadowPass.reset(); FrameLights.release();
  const sessionDark = sessionDarkFor(def);
  const wantSlots = fieldSize();
  if (built || !builtWorldFits(def)) {
    freeTrackMeshes(track);
    const prevTrackId = built ? builtPrevId : builtTrackId;
    track = null; builtTrackId = null;
    if (typeof LampBake !== "undefined") LampBake.reset();
    track = built || Tracks.build(def, trackBuildOpts(sessionDark, wantSlots));
    DebrisWorld.registerFurniture(track);
    const sameCircuit = prevTrackId === def.id;
    builtTrackId = def.id;
    builtTrackNight = sessionDark;
    builtGridSlots = wantSlots;
    builtTrackBare = !def.scenery && !sceneryResident(def.id);
    aeroZ.build();
    if (gfx.envProbeReset) gfx.envProbeReset();
    _envHold = false; _envFace = -1; _envLatchTod = null;
    _envLatch.fill(NaN); _envLatch[7] = -1;
    if (!sameCircuit) Ghost.setTrack(def.id);
    hud.invalidateMap();
  }
  const pal = def.palette;
  frame = {
    viewProj: M4.ident(), eye: camEye,
    sunDir: V3.norm(pal.sunDir), sunColor: pal.sunColor,
    ambientGround: pal.ambientGround.slice(), ambientSky: pal.ambientSky.slice(),
    fogColor: pal.fog, fogDensity: pal.fogDensity,
    skyZenith:  pal.zenith,
    skyHorizon: pal.horizon,
    fogHeight:  pal.fogHeight != null ? pal.fogHeight : 0.018, exposure: 1,
  };
  const skyNight = raceTimeOfDay === "night" ||
    (raceTimeOfDay === "default" && def.night);
  frameSky = {
    invViewProj: M4.ident(), zenith: pal.zenith, horizon: pal.horizon,
    sunDir: frame.sunDir, sunColor: pal.sun, stars: skyNight ? 1 : 0,
    cloud: pal.cloud !== undefined ? pal.cloud : (skyNight ? 0.22 : 0.4),
  };
}

let camSnapNext = false;
function flybyProgress() {
  const p = (loadingScreen && loadingScreen.progress) ? loadingScreen.progress() : 0;
  if (loadingScreen && loadingScreen.active && loadingScreen.active()) return p;
  if (state === "menu" && _menuGate.warm > 0 && typeof FlybySeq !== "undefined" && FlybySeq.warmProgress)
    return FlybySeq.warmProgress(flybyShots);
  return p;
}

let flybyShots = null;
function reloadFlybyShots() {
  try { flybyShots = flybyPanel.loadSaved(); }
  catch (e) { flybyShots = null; Log.warn("game", "flyby shots did not load", e); }
}

const _menuGate = { warm: 0, generation: 0, ready: "", track: null, garageWarm: 0, garageReady: false, garageKey: "", done: "" };
const menuKey = (idx) => [idx, raceTimeOfDay, raceWeather, fieldSize()].join("|");
const buildKey = (idx) => { const d = Tracks.LIST[idx]; return d ? [idx, sessionDarkFor(d), fieldSize(), PerfGov.tier() < 3].join("|") : ""; };
const menuWorld = () => !!track && _menuGate.track === track && _menuGate.ready === menuKey(trackIdx) && !bareStale();
let flybyBuildTimer = 0;
const MENU_IDLE_MS = 1200;
let _menuInputAt = 0;
for (const ev of ["pointerdown", "keydown"])
  addEventListener(ev, () => { _menuInputAt = performance.now(); }, { capture: true, passive: true });
const menuSlice = () => MenuSheetGate.slice();
async function menuIdle(current) {
  return MenuSheetGate.idle(current, MENU_IDLE_MS, () => _menuInputAt, menuSlice);
}
async function menuLampBake(current) {
  const step = current() && _atmo.prebakeLamps();
  while (step && current() && !step(8)) await new Promise((r) => setTimeout(r, 8));
  return !!step;
}
let _menuFly = null;
let _warmKey = "";
const _carWarm = { busy: false };
const _warmed = new Set();
const warmPrograms = (tag = "") => { try { if (gfx.warm) { const k = menuKey(trackIdx); _warmKey = k; let fresh = false; if (!_warmed.has(k + tag)) { _warmed.add(k + tag); gfx.warm(); fresh = true; } carDraw.warmCockpitTelemetry(); return fresh; } } catch (_) {  } return false; };
async function menuFinish(current, key) {
  await prepareMenuCarAssets(current);
  if (!current()) return;
  if (await menuIdle(current)) { warmPrograms(); FlybySeq.reset(); _menuGate.warm = 2; }
  const lit = await menuLampBake(current);
  if (!current()) return;
  FlybySeq.setDuration(loadingScreen.nextFlyMs());
  const fly = { key, track, shots: FlybySeq.vary(FlybySeq.DEFAULT, (Date.now() ^ (trackIdx * 2654435761)) >>> 0, false) }, step = FlybySeq.planSteps(track, fly.shots);
  let yielded = false;
  for (let slice = 0; current();) {
    const at = performance.now(), done = step();
    slice += performance.now() - at;
    if (done) break;
    if (slice >= 3) { await menuSlice(); slice = 0; yielded = true; }
  }
  if (!yielded && current() && _menuGate.warm > 0) await menuSlice();
  if (current()) _menuFly = fly;
  if (lit && await menuIdle(current)) { warmPrograms("|lit"); FlybySeq.reset(); _menuGate.warm = 2; }
  if (current()) _menuGate.done = key;
}
function menuPrep() {
  const key = trackIdx >= 0 ? menuKey(trackIdx) : "", p = _menuGate.prep, def = Tracks.LIST[trackIdx];
  return { state, trackId: def ? def.id : null, key, world: menuWorld(), building: !!(p && p.building), done: !!key && _menuGate.done === key,
    warmable: !!gfx.warm, warmKey: _warmKey, warmed: !!key && _warmKey === key, warmFrames: _menuGate.warm, warming: !!(gfx.warming && gfx.warming()),
    garageReady: !!_menuGate.garageReady, cars: carDraw.menuCarAssets || null };
}
async function garagePrewarm(current) { await garagePre.run(current, $("race-settings").hidden ? "title" : "settings"); }
function scheduleFlybyTrack(settle) {
  const p = _menuGate.prep;
  if (p && p.building && trackIdx === p.want && p.bkey === buildKey(trackIdx)) {
    const was = [p.tod, p.weather, p.key];
    p.tod = raceTimeOfDay; p.weather = raceWeather; p.key = menuKey(p.want);
    if (p.current()) return;
    [p.tod, p.weather, p.key] = was;
  }
  clearTimeout(flybyBuildTimer);
  const generation = ++_menuGate.generation;
  _menuGate.warm = 0;
  if (!(trackIdx >= 0)) return;
  if (!(gfx.warming && gfx.warming()) && state === "menu" && track && Tracks.LIST[trackIdx] && builtTrackId !== Tracks.LIST[trackIdx].id) dropTrackWorld();
  const want = trackIdx;
  const prep = _menuGate.prep = { want, tod: raceTimeOfDay, weather: raceWeather, key: menuKey(want), bkey: buildKey(want), building: false, owner: null, step: null };
  const current = prep.current = () => generation === _menuGate.generation && state === "menu" &&
    !setupPreviewOn && trackIdx === want && raceTimeOfDay === prep.tod && raceWeather === prep.weather &&
    (!els.select.hidden || !$("race-settings").hidden || (uiExperience && uiExperience.wantsTrack()) || (typeof titleWarm !== "undefined" && titleWarm.wants()));
  const prepare = async () => {
    if (!current()) return;
    try {
      if (!els.select.hidden || !$("race-settings").hidden) kickRaceBundles(false);
      await ensureScenery(want);
      if (!current()) return;
      if (gfx.warming && gfx.warming()) { flybyBuildTimer = setTimeout(prepare, 100); return; }
      if (_menuGate.ready === prep.key && _menuGate.track === track && !bareStale()) {
        await menuFinish(current, prep.key); await garagePrewarm(current); return;
      }
      prep.building = true;
      prep.step = loadTrackStepped(want, () => (prep.owner ? prep.owner() : current())).finally(() => { prep.building = false; });
      if (!(await prep.step) || !current()) return;
      const key = prep.key;
      _menuGate.ready = key; _menuGate.track = track; if (!$("race-settings").hidden) raceSettings.repaintPlan();
      await menuSlice();
      if (current() && track.meshes && track.meshes.pitSignTex && typeof gfx.uploadTexture === "function")
        gfx.uploadTexture(track.meshes.pitSignTex);
      await menuFinish(current, key);
      await garagePrewarm(current);
    } catch (e) { if (current()) Log.warn("gfx", "track preparation failed", e); }
  };
  flybyBuildTimer = setTimeout(prepare, settle ? 400 : 120);
}

function _nightAmbientBand() {
  if (!frame.ambientSky || !frame.ambientGround) return;
  const _neonAmb = track && track.def &&
    (track.def.theme === "street_night" || track.def.theme === "modern");
  const _naL = LT.nightAmbLift != null ? LT.nightAmbLift : 1;
  const floorSky = (_neonAmb ? [0.017, 0.017, 0.026] : [0.006, 0.0075, 0.016]).map((v) => v * _naL);
  const floorGnd = (_neonAmb ? [0.009, 0.008, 0.013] : [0.0026, 0.0032, 0.0085]).map((v) => v * _naL);
  const capSky   = (_neonAmb ? [0.048, 0.048, 0.068] : [0.020, 0.023, 0.042]).map((v) => v * _naL);
  const capGnd   = (_neonAmb ? [0.022, 0.020, 0.030] : [0.0085, 0.0098, 0.019]).map((v) => v * _naL);
  frame.ambientSky    = frame.ambientSky.map((v, i)    => Math.min(capSky[i], Math.max(v, floorSky[i])));
  frame.ambientGround = frame.ambientGround.map((v, i) => Math.min(capGnd[i], Math.max(v, floorGnd[i])));
  const _cgA = frameSky.cityGlow;
  if (_cgA) {
    const _cgm = Math.max(_cgA[0], _cgA[1], _cgA[2]) || 1;
    const _cgMix = (LT.cityGlowTint != null ? LT.cityGlowTint : 0.28) / 0.28;
    frame.ambientSky    = frame.ambientSky.map((v, i) => v * (1 + _cgMix * (0.82 + 0.28 * _cgA[i] / _cgm - 1)));
    frame.ambientGround = frame.ambientGround.map((v, i) => v * (1 + _cgMix * (0.82 + 0.28 * _cgA[i] / _cgm - 1)));
  }
}

function isFloodActiveSession() {
  return raceTimeOfDay === "night" || raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn" ||
    (raceTimeOfDay === "default" && track && track.def && track.def.night);
}


function snapGameCam(paint) {
  if (!player || !track) return;
  const bankCam = Tracks.banking(track, player.s, player.x, _bankScratch, true);
  const mode = CAM_MODES[camMode].id;
  if (typeof ExtraRigs !== "undefined") ExtraRigs.reset(mode);
  if (typeof CamFeel !== "undefined") { CamFeel.resetFollow(); CamFeel.resetFreeLook(); CamFeel.resetLatch(); } GameCams.resetSmoothing(); if (typeof TracksideCams !== "undefined") TracksideCams.reset(track);
  const v = camVantage(mode, player.s, player.x, player.speed || 0, 0, {
    bankDy: bankCam ? bankCam.dy : 0, deploy: player.deploying, slipLat: player.vLat || 0, att: player,
    carPos: player.px != null ? [player.px, player.pz] : null,
    carHead: player.head || 0,
    rival: (typeof ExtraRigs !== "undefined") ? ExtraRigs.pickRival(cars, player) : null,
    playerProg: player.prog || 0,
    snap: true, reduceMotion: camComfort(), frameSubject: realRace.isWatch(),
  });
  camEye[0] = v.eye[0]; camEye[1] = v.eye[1]; camEye[2] = v.eye[2];
  camTgt[0] = v.tgt[0]; camTgt[1] = v.tgt[1]; camTgt[2] = v.tgt[2];
  camFov = v.fov; camFovBoost = v.fovBoost || 0;
  feel.camRoll = bankCam ? -bankCam.roll * cameraBankScale(mode) : 0;
  camAncX = null;
  try { if (gfx && gfx.invalidateSoftPresent) gfx.invalidateSoftPresent(); if (paint) { headlessMode = false; render(paint === true ? 1 / 60 : Math.min(+paint || 1 / 60, 1 / 20)); } } catch (_) {  }
}

let raceIndex = 0, raceDrawRound = 0;
const luckSeed = () => (Career.inCareer() ? Career.seasonSeed() : flow === "season" && season ? SeasonCal.luckSeed(season, simSeed()) : simSeed());
function armReliability(field) {
  const team = player ? player.team : Teams.LIST[teamIdx];
  if (!isChampionship()) raceDrawRound = raceIndex;
  Reliability.arm(field, {
    level: raceReliability,
    seed: luckSeed(),
    round: isChampionship() ? SeasonCal.drawRound(season) : raceIndex,
    build: Reliability.buildQuality(getTeamParts(team.id), team),
    networked: !!(netPlay && netPlay.active && netPlay.active()),
  });
  return field;
}

function launchFlyingLap() {
  if (!player || !track) return;
  player.s = wrapS(-0.3); player._prevS = player.s; player.prog = -0.3;
  player.x = 0;
  player.xVis = 0;
  const w = worldFromTrack(player.s, player.x, smp);
  player.px = w.x; player.pz = w.z;
  player.head = Math.atan2(smp.t[0], smp.t[2]);
  player.speed = 0;
  player.vLat = 0; player.yawRateCur = 0; player.yawVis = 0; player.steerVis = 0;
  player.rPrevPx = player.px; player.rPrevPz = player.pz;
  player.rPrevS = player.s; player.rPrevX = player.x;
  player.rPrevHead = player.head; player.rPrevYawVis = 0;
  announce("QUALIFYING LAP", 1.6, "info");
}

const raceWakeLock = RaceWakeLock.create();
const { hold: holdRaceWake, drop: dropRaceWake } = raceWakeLock;

function raceProfile() { return RaceEntryProfile.legs(); }
async function startRaceBody() {
  const rlap = (n) => RaceEntryProfile.lap(n), stale = () => !!arguments[0] && !arguments[0]();
  const vmNoFramePump = typeof navigator !== "undefined" && /apex-game-vm/.test(navigator.userAgent || "");
  const yieldMain = () => (typeof scheduler !== "undefined" && scheduler.yield)
    ? scheduler.yield() : new Promise((r) => setTimeout(r, 0));
  if (!vmNoFramePump) {
    if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.mark) RaceEntryProfile.mark("body:yield");
    await yieldMain();
  }
  if (stale()) return false;
  rlap("scenery");
  let sessionOk = await ensureRaceSession(); while (!sessionOk && !stale() && await LoadingScreen.failed() === "retry") sessionOk = await ensureRaceSession(); if (stale()) return false;
  if (!sessionOk) { loadingScreen.stop(); quitToMenu(); announce("RACE MODULES FAILED TO LOAD — RETRY", 3, "info"); return false; }
  await Promise.all([ensureAudio(), lazyBundles.ensureResultsSheet()]); if (stale()) return false;
  if (!window.LightPresets) { await ensureLightPresets(); if (stale()) return false; }
  radioVoice.prepare();
  const careerSaveConflict = isCareer() && Career.conflicted();
  const seasonSaveConflict = flow === "season" && SeasonCal.conflicted();
  if ((flow === "season" && !SeasonCal.canRace(season)) || careerSaveConflict || seasonSaveConflict) {
    loadingScreen.stop();
    if (careerSaveConflict || seasonSaveConflict) {
      quitToMenu();
      announce("SAVE CONFLICT — reload " + (careerSaveConflict ? "career" : "season"), 3, "info");
      return false;
    }
    quitToMenu();
    return false;
  }
  resultsCam.reset(); RaceCeremony.resetLive();
  _roadReflectionTransition.value = NaN;
  IncidentSim.reset();
  raceCtl.reset();
  wxArc.restoreBase();
  DebrisWorld.reset();
  banner.clear();
  if (raceMessageHistory) raceMessageHistory.clear();
  if (announcer.stop) announcer.stop();
  if (hud.resetRace) hud.resetRace();
  rlap("resets");
  if (_menuGate.join) { const step = _menuGate.join; _menuGate.join = null; await step.catch(() => false); if (stale()) return false; }
  if (typeof GfxEscalation !== "undefined" && GfxEscalation.softenRaceEntry) GfxEscalation.softenRaceEntry(gfx);
  if (vmNoFramePump) loadTrack(trackIdx);
  else if (!(await raceTrackStepped(trackIdx, stale))) return false;
  if (stale()) return false; rlap("loadTrack");
  if (!vmNoFramePump) await yieldMain(); if (stale()) return false;
  if (gfxContextLost()) { quitToMenuAfterCtxLost(); return false; } if (isCareer()) Career.markWeekendStarted();
  practiceMode = false;
  releaseFieldScratch(); makeCars(); rlap("makeCars");
  coach.reset(); PerfGov.resetFrameStats();
  if (isQuali()) {
    qualiField = cars;
    cars = [player];
    lapsTarget = 1;
  } else if (duelOn()) {
    const rival = Duel.pick(cars);
    if (rival) {
      const lg = (duelLegend && typeof Legends !== "undefined") ? Legends.byId(duelLegend) : null;
      if (lg) Duel.asLegend(rival, { id: lg.id, name: lg.name, code: lg.code, ratings: Legends.ratings(lg.id), team: Legends.raceTeam(lg.id) }, DriverRatings);
      else Duel.bump(rival, DriverRatings);
      cars = [player, rival];
    }
    lapsTarget = raceLaps;
  } else if (isTimeTrial()) {
    cars = [player];
    lapsTarget = raceLaps;
    lapRec.ttNewRecord = false;
    lapRec.ttLaps = [];
    lapRec.ttSessionTs = Date.now();
  } else {
    lapsTarget = SeasonCal.lapsFor(raceLaps, season);
  }
  applyRaceSettings();
  rlap("settings");
  if (isWetRoad()) {
    initRainDrops();
    Particles.rainShow(true);
  } else {
    Particles.rainShow(false);
  }
  if (!isQuali() && gridFromQuali() && !quali.order(cars)) { loadingScreen.stop(); await openQuali(); return false; }
  RaceEntryProfile.mark("gridCountdown:start");
  gridUp(gridOrderFor(gridFromQuali() ? quali.order(cars) : null));
  rlap("gridUp");
  wxArc.startChangeable(0);
  recomputePlayerMods();
  rlap("finish");
  if (isTimeTrial()) { records.begin(); Ghost.startLap();  }
  Log.info("game", `race ${track.def.id} ${session} laps=${lapsTarget} ` +
    `pace=${driveTune.PACE.toFixed(3)} vTop=${vTop().toFixed(1)}m/s ` +
    `grip=${gripMult().toFixed(2)} weather=${raceWeather} tod=${raceTimeOfDay} ` +
    `mods=${playerMods ? `s${playerMods.speed.toFixed(2)}/a${playerMods.accel.toFixed(2)}/` +
      `c${playerMods.cornering.toFixed(2)}/b${playerMods.braking.toFixed(2)}` : "none"} ` +
    `aeroLoad=${(playerAeroLoad ?? 0.5).toFixed(2)} assists=` +
    `help${driveTune.ROAD_FOLLOW.toFixed(2)}/line${raceLineAssist.toFixed(2)}`);
  const bumpRaceIndex = session === "race"; if (bumpRaceIndex) armReliability(cars);
  resultT = 0; postFinish.since = -1;
  feel.camRoll = 0; camSlipSm = 0;
  feel.shake = 0; feel.hitStop = 0; stormFx._thunderT = -1; announce._waitAt = NaN;
  lapRec.sectorIdx = player ? sectorAt(player.s) : 0; lapRec.sectorStartT = 0; lapRec.sectorValid = true;
  lapRec.sectorBests = [Infinity, Infinity, Infinity]; lapRec.fieldSectorBests = [Infinity, Infinity, Infinity];
  lapRec.sectorLast = [null, null, null];
  PerfGov.sentinelArm(true);
  if (PerfGov.strikes() > 0 && PerfGov.autoRes() && gfx.setRenderScale && gfx.getRenderScale)
    gfx.setRenderScale(Math.min(gfx.getRenderScale(), PerfGov.strikes() >= 2 ? 0.7 : 0.85));
  const handoff = (loadingScreen.active() || loadingScreen.phase() === "build" || loadingScreen.phase() === "busy") && !!player;
  clearMenuScreens(); garagePre.release();
  if (handoff) RaceEntryProfile.raiseHandoff(loadingScreen);
  _carWarm.busy = true;
  try { await RaceEntryProfile.spanAsync("warmCarAssets", () => warmCarAssetsAsync(() => !stale(), vmNoFramePump ? Infinity : 8, { deferRear: !headlessMode })); } finally { _carWarm.busy = false; }
  if (stale()) return false;
  RaceEntryProfile.span("debrisPrime", () => DebrisWorld.prime());
  setState("count", "race-start"); countT = 0; lightsLit = 0; raceT = 0; feel.startHold = 0; feel.restartPending = false; paused = false; frozen = false; raceRestarting = false; skyViewOverride = null;
  RaceEntryProfile.mark("gridCountdown:end");
  if (typeof Assets !== "undefined" && Assets.retry && PerfGov.softwareRaster()) {
    const run = () => { try { Assets.retry(); } catch (_) {  } };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 120000 });
    else setTimeout(run, 0);
  }
  {
    const settled = loadingScreen.packSettled || LoadingScreen.packSettled;
    const packState = (typeof Assets !== "undefined" && Assets.state) ? Assets.state() : null;
    const tlxEarly = gfx.backend === "three" && (() => { try { return localStorage.getItem("apex26.tlxWarmBeforePack") !== "0"; } catch (_) { return true; } })();
    if (!settled || settled(packState) || tlxEarly) {
      try { RaceEntryProfile.requestWarm(gfx, _warmKey === menuKey(trackIdx)); } catch (_) {  }
    }
  }
  skids.reset();
  Particles.clear();
  els.hud.hidden = false; els.lights.hidden = false; els.pausebtn.hidden = false;
  if (els.btnCam) els.btnCam.hidden = false;
  setHudUserHidden(false);
  document.body.classList.add("in-race");
  for (const l of els.lights.children) l.classList.remove("on");
  els.lights.classList.remove("count");
  showTouchControls(true); updateHud(true);
  dbgCam = null; director.reset(); replayBuf.onRaceStart(cars); if (typeof CamFeel !== "undefined") { CamFeel.resetLatch(); CamFeel.resetFreeLook(); }
  snapGameCam();
  Input.calibrate();
  Input.clearEdges();
  if (Input.dropLatch) Input.dropLatch();
  if (soundOn) { GameAudio.setVoice(player && player.team && player.team.engine); GameAudio.setVenue(track.def); GameAudio.startEngine(); GameAudio.startMusic(trackIdx); }
  if (soundOn) { if (wxArc.viewRainfall() > 0.01) GameAudio.startRain(); else GameAudio.stopRain(); }
  holdRaceWake(); syncRotateBlocker(true);
  if (!vmNoFramePump) await yieldMain(); if (stale()) return false;
  if (gfxContextLost()) { quitToMenuAfterCtxLost(); return false; }

  if (!headlessMode && !document.hidden && player) { const nite = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night), wet = isWetRoad();
    await RaceEntryProfile.spanAsync("rigWarm", () => carDraw.warmCockpitRig(player, carPaintMat(wet ? (nite ? PAINT_WET_NIGHT : PAINT_WET_DAY) : (nite ? PAINT_DRY_NIGHT : PAINT_DRY_DAY)), _warmKey === menuKey(trackIdx) ? _warmKey : null)); }
  if (stale()) return false;
  const entryPlayer = player;
  if (!headlessMode && !document.hidden)
    await RaceEntryProfile.spanAsync("mirrorPrepare", () => mirrorPass.prepareRace());
  if (stale()) return false; if (gfxContextLost()) { quitToMenuAfterCtxLost(); return false; }
  if (player !== entryPlayer || (state !== "count" && state !== "race")) return false;
  clearRaceEntrySoften(); if (bumpRaceIndex) raceIndex++;

  if (document.hidden) setPaused(true, "hidden-tab");
}
const sessionEntry = SessionEntry.create();
const _seasonEntryIds = new WeakMap();
let _nextSeasonEntryId = 0;
function entrySettings() {
  if (season && !_seasonEntryIds.has(season)) _seasonEntryIds.set(season, ++_nextSeasonEntryId);
  return JSON.stringify([trackIdx, flow, session, raceWeather, raceTimeOfDay, raceLaps,
    teamIdx, driverIdx, difficulty, raceGrid, champGrid, duelSetting(), duelLegend, raceTyreWear,
    raceReliability, raceDirtyAir, raceAeroMode, simSeed(),
    wxArc.changeable, wxArc.plan && [wxArc.plan.to, wxArc.plan.dur],
    netPlay.active(), raceSettings && raceSettings.netRoom,
    season ? _seasonEntryIds.get(season) : null, season && season.round,
    season && season.stage, SeasonCal.quali()]);
}
const _customTrackStarts = new WeakSet();
function kickRaceBundles(audio) { if (typeof setupCam !== "undefined" && setupCam.prewarmExterior) setupCam.prewarmExterior(); for (const p of [ensureRaceSession(), ensureLightPresets(), ensureGarageData(), lazyBundles.ensureResultsSheet(), audio && ensureAudio()]) if (p && p.catch) p.catch(() => false); }
function startRace() {
  pendingFinishQuit = false; titleVisit++;
  if (setupTrialSession && !setupTrialSession.pending()) { setupTrialSession.cancel(); SetupTrials.invalidate("Session restarted"); }
  const rs = $("race-settings");
  if (rs) {
    rs.hidden = true;
    try { if (rs.open && typeof rs.close === "function") rs.close(); } catch (_) {  }
  }
  practiceMode = false;
  if (!loadingScreen.phase()) { loadingScreen.building(loadingInfo()) || loadingScreen.busy("Starting race"); }
  if (photoStudio) photoStudio.close(false); if (uiExperience) uiExperience.stopHome();
  if (typeof Assets !== "undefined" && Assets.retry && !PerfGov.softwareRaster()) Assets.retry();
  if (steerMode === "tilt" && !enableTilt.asked && !Input.gyroSeen) enableTilt();
  if (document.fullscreenElement) Input.lockLandscape();
  const key = entrySettings(), idx = trackIdx;
  kickRaceBundles(true);
  const mp = _menuGate.prep, join = !!(mp && mp.building && mp.want === idx && mp.bkey === buildKey(idx));
  const prior = mp && mp.step ? mp.step : null;
  if (join) mp.owner = () => key === entrySettings();
  clearTimeout(flybyBuildTimer); _menuGate.generation++;
  _menuGate.join = join ? mp.step : (prior ? prior.catch(() => false) : null);
  const request = RaceEntryProfile.runSession(sessionEntry, key, () => Promise.all([ensureScenery(idx), DebrisWorld.ready()]),
    (current) => startRaceBody(current), () => key === entrySettings(),
    (e) => { if (e) Log.error("game", "startRace failed", e); quitToMenu(); if (e) announce("COULD NOT LOAD CIRCUIT — CHECK CONNECTION", 3, "info"); });
  if (!_customTrackStarts.has(request)) {
    _customTrackStarts.add(request);
    request.outcome.then((r) => { if (r.kind === "committed" && sessionEntry.owns(r)) CustomTracks.afterStart(); });
  }
  request.catch((e) => Log.debug("game", "startRace rejected (handled by onFail): " + (e && e.message || e)));
  return request;
}

function showTouchControls(show) {
  const t = show && Input.touchControlsNeeded();
  const manual = gearsManual();
  els.btnThrottle.hidden = !(t && !autoThrottle());
  els.btnBrake.hidden = !t;
  els.btnBoost.hidden = !t; els.btnOT.hidden = !t;
  if (els.btnAero) els.btnAero.hidden = !t || raceAeroMode === "auto";
  els.shiftUp.hidden = !(t && manual);
  els.shiftDown.hidden = !(t && manual);
  const steerBtns = t && steerMode === "buttons";
  els.btnSteerLeft.hidden = !steerBtns;
  els.btnSteerRight.hidden = !steerBtns;
  document.body.classList.toggle("manual", manual);
  document.body.classList.toggle("steer-buttons", steerBtns);
  document.body.classList.toggle("steer-touch", t && steerMode === "touch");
  layoutDocks(steerBtns, manual);
}

function layoutDocks(steerBtns, manual) {
  const left = $("dock-left"), right = $("dock-right");
  if (!left || !right) return;
  const pedals = $("grp-pedals"), shifts = $("grp-shifts"),
        steer = $("grp-steer"), taps = $("grp-taps");
  const L = [], R = [];
  if (steerBtns) {
    L.push(steer);
    R.push(taps, pedals);
  } else if (manual) {
    L.push(shifts, taps); R.push(pedals);
  } else {
    L.push(pedals); R.push(taps);
  }
  for (const g of [pedals, shifts, steer, taps]) {
    if (!g) continue;
    g.hidden = !(L.includes(g) || R.includes(g)) ||
               ![...g.children].some((b) => !b.hidden);
  }
  for (const [dock, list] of [[left, L], [right, R]]) {
    for (const el of list) if (el) dock.appendChild(el);
  }
}

function netOrder(order) {
  const kept = netPlay.active() ? null : netPlay.lastResult(); if (!netPlay.active() && !kept) return order;
  if (!kept && netPlay.ownsClassification()) {
    netPlay.reportResult(order.map((c) => ({
      d: c.driverId, t: c.finishT, p: c.penalty, lap: c.lap, classified: c.classified, r: c.retired ? (c.dnf || "dnf") : c.dsq ? "DSQ — " + c.dsq : 0,
    })));
    return order;
  }
  const verdict = kept || netPlay.peerResult();
  if (!Array.isArray(verdict) || !verdict.length) return order;
  const byId = new Map(cars.map((c) => [c.driverId, c]));
  if (verdict.length !== byId.size) return order;
  const seen = new Set();
  for (const e of verdict) {
    if (!e || !byId.has(e.d) || seen.has(e.d) ||
        (e.t != null && (!Number.isFinite(e.t) || e.t < 0)) ||
        (e.p != null && (!Number.isFinite(e.p) || e.p < 0)) ||
        (e.lap != null && (!Number.isInteger(e.lap) || e.lap < 0 || e.lap > 255)) ||
        (e.classified != null && typeof e.classified !== "boolean")) return order;
    seen.add(e.d);
  }
  const sorted = verdict.map((e) => byId.get(e.d));
  verdict.forEach((e) => {
    const c = byId.get(e.d);
    if (!c) return;
    if (e.t != null) c.finishT = e.t;
    if (e.p != null) c.penalty = e.p;
    if (e.lap != null) c.lap = e.lap;
    if (typeof e.classified === "boolean") c.classified = e.classified;
  });
  return sorted;
}

function endRace(forcedOrder) { if (state !== "race" && state !== "count") return;
  Ghost.flush(); if (typeof InputGhost !== "undefined") InputGhost.flush();
  if (replayBuf.isScrubbing()) return;
  GfxEscalation.resetReloadBudget();
  PerfGov.cleanRace(); if (paused) { closeLightTuner(false); closeCamTuner(false); flybyPanel.closeFlyby(false); exitPhotoMode(); closeSettings(); }
  const suspended = raceCtl.level === 4;
  const cmpApplies = pits.twoCompoundApplies();
  raceCtl.reset(); wxArc.endSession();
  cars.forEach((c) => tyres.closeStints(c));
  paused = false; els.pausemenu.hidden = true;
  Droplets.clear();
  setState("results", isQuali() ? "quali-end" : forcedOrder ? "forced-order" : "flag");
  document.body.classList.remove("in-race");
  dropRaceWake();
  els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  GameAudio.stopMusic();
  Particles.rainShow(false);
  if (soundOn) GameAudio.finish();
  if (isQuali()) {
    cars = qualiField || cars; qualiField = null;
    const myLap = player.lastLap > 0 ? player.lastLap : (player.best < Infinity ? player.best : 0);
    if (myLap > 0) qualiNet.reportQuali(player.driverId, myLap);
    quali.simulate(qualiNet.driven(myLap > 0 ? myLap : player.qualiCut ? Infinity : 0));
    if (!(myLap > 0)) reportModelQuali();
    $("quali").classList.add("q-done");
    qualiNet.markDone(); $("q-back").textContent = "MENU";
    qualiSheet.open(quali.rows());
    qualiNet.refreshQualiGate();
    return;
  }
  if (isTimeTrial()) { buildTTResults(); els.results.hidden = false; return; }
  careerSettlement = null;
  if (!netPlay.active() && !cars.some((c) => c.human && c.finished)) {
    const dist = Math.max(1, lapsTarget * track.total);
    for (const c of cars) {
      if (c.human || c.finished || c.retired || c.dnfAt == null || (c.prog - (c._progGift || 0)) / dist < c.dnfAt) continue;
      c.retired = true; c.dnf = c.dnfWhy || "mechanical"; c.dnfAt = null;
    }
  }
  const cmpOn = !netPlay.active() && !isPractice() && !duelOn() && (suspended || cars.some((c) => c.finished && !c.retired)) && cmpApplies;
  const dsq = realRace.status().watch ? cars.filter((c) => c.dsq) : SportingRegs.applyCompoundRule(cars, { applies: cmpOn, suspended });
  for (const c of dsq) Log.info("game", "DSQ car=" + c.code + " why=" + c.dsq);
  const fin = cars.filter((c) => c.finished && !c.retired && !c.dsq).sort(RaceControl.finishOrder);
  const run = cars.filter((c) => !c.finished && !c.retired && !c.dsq);
  const leadProg = Math.max(0, ...fin.concat(run).map((c) => c.prog || 0));
  run.sort(RaceControl.runOrder(Math.max(0.25 * vTop(), leadProg / Math.max(1, raceT))));
  const out = cars.filter((c) => c.retired).sort((a, b) => b.prog - a.prog);
  const order = netOrder(forcedOrder || RaceControl.classify(cars, fin, run, out).concat(dsq));
  order.forEach((c, i) => { c.finPos = i + 1; });
  Log.info("game", "Race finished track=" + (track && track.def.id) + " session=" + session + " laps=" + lapsTarget + " pos=" + (player ? player.finPos : "-") + " time=" + (player && player.finished ? (+player.finishT).toFixed(3) : "-") + " pen=" + ((player && player.penalty) || 0) + "s" + (player && player.dsq ? " dsq=" + player.dsq : "") + " retired=" + out.length + " dsqs=" + dsq.length + (suspended ? " suspended" : ""));
  const wasSprint = isChampionship() && SeasonCal.stage(season) === "sprint";
  if (isChampionship()) {
    let fastest = null, fastestT = Infinity;
    for (const c of cars) if (!c.retired && !c.dsq && c.best < fastestT) { fastestT = c.best; fastest = c.driverId; }
    const careerScoring = isCareer();
    const scored = careerScoring
      ? Career.scoreRound(order, player, fastest, RaceControl.shortRun(cars, lapsTarget))
      : SeasonCal.award(season, order, fastest, RaceControl.shortRun(cars, lapsTarget));
    const settles = careerScoring ? !!scored : scored === "race";
    if (settles) quali.clear();
    else if (scored === "sprint") quali.clear();
    if (careerScoring) careerSettlement = scored;
    else SeasonCal.save(season);
  }
  dbgCam = null; resultsCam.onFlag();
  buildResults(order, { sprint: wasSprint, duel: duelOn() });
  RaceCeremony.afterClassify(G, order, { sprint: wasSprint, duel: duelOn(), watch: realRace.isWatch() });
  setupCam.noteResult(order, { sprint: wasSprint, duel: duelOn(), watch: realRace.isWatch() });
  announcer.wrapUp(order, Object.assign(loadingInfo(), { sprint: wasSprint }));
}

let /** @type {ReturnType<typeof LightStore.create> | null} */ ltStore = null;

let /** @type {ReturnType<typeof RaceSettings.create> | null} */ raceSettings = null, /** @type {ReturnType<typeof CustomTeam.create> | null} */ customTeam = null, /** @type {ReturnType<typeof TitleMenu.create> | null} */ titleMenu = null, /** @type {ReturnType<typeof UiExperience.create> | null} */ uiExperience = null, /** @type {ReturnType<typeof PhotoStudio.create> | null} */ photoStudio = null;

const G = {
  $, els,
  fmtTime: (t) => fmtTime(t),
  dashKph: (v) => dashKph(v),
  ttBoard, teamById: (id) => teamById(id), cssCol: (c) => cssCol(c),
  get state() { return state; }, set state(v) { setState(v, "api"); },
  get track() { return track; },
  get cars() { return cars; },
  get player() { return player; },
  get flyingStart() { return flyingStart; },
  get season() { return season; }, set season(v) { season = v; },
  get flow() { return flow; }, set flow(v) { setFlow(v); },
  get session() { return session; }, set session(v) { session = v; },
  get career() { return Career.data(); },
  get careerSettlement() { return careerSettlement; },
  openCareer: (...a) => openCareer(...a),
  openCareerSlots: (...a) => openCareerSlots(...a),
  openDailyPicker: () => openTimeTrial(true),
  closeSettings: () => closeSettings(),
  get seasonMode() { return isChampionship(); },
  set seasonMode(v) { setFlow(v ? "season" : "gp"); },
  get seasonRound() { return isChampionship() && season ? season.round : raceIndex; },
  get ttNewRecord() { return lapRec.ttNewRecord; }, set ttNewRecord(v) { lapRec.ttNewRecord = v; },
  get ttSessionTs() { return lapRec.ttSessionTs; },
  get records() { return records; },
  get coach() { return coach; },
  get realRace() { return realRace; },
  setupTrialRestart: (options) => setupTrialSession.restart(options),
  setupTrialContext: () => setupTrialSession.context(),
  setupTrialCancel: () => { if (setupTrialSession && (setupTrialSession.pending() || setupTrialSession.active())) quitToMenu(); },
  openCoachDetails: () => { openSettings(); settingsNav.show("driving", true); },
  get radio() { return radioVoice; },
  get announcer() { return announcer; },
  get raceRadio() { return raceRadio; },
  recordControls: () => SessionPhys.controls({ autoThrottle: autoThrottle(), gearsManual: gearsManual(), steerMode, aero: raceAeroMode }),
  get ttRecord() { return lapRec.ttRecord; }, set ttRecord(v) { lapRec.ttRecord = v; },
  get timeTrial() { return isTimeTrial(); },
  set timeTrial(v) { session = v ? "tt" : "race"; },
  get practice() { return isPractice(); },
  set practice(v) { practiceMode = !!v; },
  get duel() { return duelMode; }, set duel(v) { duelMode = !!v; },
  get duelLegend() { return duelLegend; }, set duelLegend(v) { duelLegend = v || ""; },
  get lapsTarget() { return lapsTarget; },
  get raceReliability() { return raceReliability; },
  set raceReliability(v) {
    if (!Reliability.isLevel(v)) return;
    raceReliability = v; store.set("reliability", v);
  },
  armReliability: (field) => armReliability(field || cars),
  get raceTyreWear() { return raceTyreWear; },
  set raceTyreWear(v) {
    if (!TyreModel.isLevel(v)) return;
    raceTyreWear = v; store.set("tyreWear", v);
    tyres.setLevel(isTimeTrial() ? "off" : v);
  },
  get raceDirtyAir() { return raceDirtyAir; },
  set raceDirtyAir(v) {
    if (!PhysicsConsts.DirtyAir.isLevel(v)) return;
    raceDirtyAir = v; store.set("dirtyAir", v);
  },
  get tyres() { return tyres; },
  get pits() { return pits; },
  pitCrewDrawn: () => _pitCrewDrawn(),
  retireCar: (c, reason) => retireCar(c, reason),
  get ranked() { return ranked; },
  get sectorLast() { return lapRec.sectorLast; },
  get seed() { return simSeed(); }, set seed(v) { simSeed(v); },
  simSeed,
  get raceRound() { return raceIndex; }, set raceRound(v) { raceIndex = Math.max(0, v | 0); },
  get DRIFT() { return driveTune.DRIFT; }, set DRIFT(v) { driveTune.DRIFT = v; },
  get FRONT_GRIP() { return driveTune.FRONT_GRIP; }, set FRONT_GRIP(v) { driveTune.FRONT_GRIP = v; },
  get PACE() { return driveTune.PACE; }, set PACE(v) { driveTune.PACE = v; GameCams.init({ vmax: vTop() }); },
  get PLAYER_GRIP() { return driveTune.PLAYER_GRIP; }, set PLAYER_GRIP(v) { driveTune.PLAYER_GRIP = v; },
  get ROAD_FOLLOW() { return driveTune.ROAD_FOLLOW; }, set ROAD_FOLLOW(v) { driveTune.ROAD_FOLLOW = v; },
  get STEER_EXPO() { return driveTune.STEER_EXPO; }, set STEER_EXPO(v) { driveTune.STEER_EXPO = v; },
  get STEER_MAX_SLIP() { return driveTune.STEER_MAX_SLIP; }, set STEER_MAX_SLIP(v) { driveTune.STEER_MAX_SLIP = v; },
  get STEER_SPEED_REF() { return driveTune.STEER_SPEED_REF; }, set STEER_SPEED_REF(v) { driveTune.STEER_SPEED_REF = v; },
  get WHEELBASE() { return driveTune.WHEELBASE; }, set WHEELBASE(v) { driveTune.WHEELBASE = v; },
  get YAW_DAMP() { return driveTune.YAW_DAMP; }, set YAW_DAMP(v) { driveTune.YAW_DAMP = v; },
  get YAW_INERTIA() { return driveTune.YAW_INERTIA; }, set YAW_INERTIA(v) { driveTune.YAW_INERTIA = v; },
  get raceLineAssist() { return raceLineAssist; }, set raceLineAssist(v) { raceLineAssist = v; },
  get _lastFloodEmit() { return _lastFloodEmit; }, set _lastFloodEmit(v) { _lastFloodEmit = v; },
  get _studioRig() { return _studioRig; }, set _studioRig(v) { _studioRig = v; },
  get _s8Stamp() { return _s8Stamp; },
  set _s8Stamp(v) { _s8Stamp = v == null ? null : (v | 0); },
  get _testInput() { return _testInput; }, set _testInput(v) { _testInput = v; },
  get builtTrackNight() { return builtTrackNight; }, set builtTrackNight(v) { builtTrackNight = v; },
  get camEye() { return camEye; }, set camEye(v) { camEye = v; },
  get camFov() { return camFov; }, set camFov(v) { camFov = v; },
  get camMode() { return camMode; }, set camMode(v) { camMode = v; },
  get camCutT() { return camCutT; }, set camCutT(v) { camCutT = v; },
  get hudProfile() { return hudProfile; },
  set hudProfile(v) {
    if (HUD_PROFILES.indexOf(v) < 0) v = "standard";
    hudProfile = v;
    store.set("hudProfile", hudProfile);
  },
  get hudMetricsLayout() { return hudMetricsLayout; },
  set hudMetricsLayout(v) {
    if (HUD_MET_LAYOUTS.indexOf(v) < 0) v = "full";
    hudMetricsLayout = v;
    store.set("hudMetricsLayout", hudMetricsLayout);
  },
  get hudMapVis() { return hudMapVis; },
  set hudMapVis(v) {
    if (HUD_VIS_MODES.indexOf(v) < 0) v = "on";
    hudMapVis = v;
    store.set("hudMapVis", hudMapVis);
  },
  get hudGapsVis() { return hudGapsVis; },
  set hudGapsVis(v) {
    if (HUD_VIS_MODES.indexOf(v) < 0) v = "on";
    hudGapsVis = v;
    store.set("hudGapsVis", hudGapsVis);
  },
  get camRoll() { return feel.camRoll; }, set camRoll(v) { feel.camRoll = v; },
  get camTgt() { return camTgt; }, set camTgt(v) { camTgt = v; },
  get dbgCam() { return dbgCam; }, set dbgCam(v) { dbgCam = v; },
  get frame() { return frame; }, set frame(v) { frame = v; },
  get frameSky() { return frameSky; }, set frameSky(v) { frameSky = v; },
  get frozen() { return frozen; }, set frozen(v) { frozen = v; },
  get headlessMode() { return headlessMode; }, set headlessMode(v) { headlessMode = v; },
  get hideMeshes() { return hideMeshes; }, set hideMeshes(v) { hideMeshes = v; },
  get paused() { return paused; }, set paused(v) { paused = v; },
  get raceLaps() { return raceLaps; }, set raceLaps(v) { raceLaps = v; wxArc && wxArc.plan === wxArc._derived && (wxArc.plan = null); },
  get raceT() { return raceT; }, set raceT(v) { raceT = v; },
  get resultT() { return resultT; }, set resultT(v) { resultT = v; },
  get skyT() { return _skyT; }, set skyT(v) { _skyT = v; },
  get skyHold() { return _skyHold; }, set skyHold(v) { _skyHold = !!v; },
  get raceTimeOfDay() { return raceTimeOfDay; }, set raceTimeOfDay(v) { raceTimeOfDay = v; },
  get flybyShots() { return flybyShots; },
  get gridPreOrdered() { return gridPreOrdered; },
  get lens() { return _lens; },
  get raceWeather() { return raceWeather; }, set raceWeather(v) { raceWeather = v; wxArc && wxArc.plan === wxArc._derived && (wxArc.plan = null); },
  get sectorBests() { return lapRec.sectorBests; }, set sectorBests(v) { lapRec.sectorBests = v; },
  get fieldSectorBests() { return lapRec.fieldSectorBests; },
  get sectorIdx() { return lapRec.sectorIdx; }, set sectorIdx(v) { lapRec.sectorIdx = v; },
  get sectorStartT() { return lapRec.sectorStartT; }, set sectorStartT(v) { lapRec.sectorStartT = v; },
  get skyViewOverride() { return skyViewOverride; }, set skyViewOverride(v) { skyViewOverride = v; },
  get trackIdx() { return trackIdx; }, set trackIdx(v) { trackIdx = v; wxArc && wxArc.plan === wxArc._derived && (wxArc.plan = null); },
  get ttLaps() { return lapRec.ttLaps; }, set ttLaps(v) { lapRec.ttLaps = v; },
  get weatherArc() { return wxArc.arc; }, set weatherArc(v) { wxArc.arc = v; },
  get _cloudBase() { return _cloudBase; }, set _cloudBase(v) { _cloudBase = v; },
  get _ltBase() { return stormFx._ltBase; }, set _ltBase(v) { stormFx._ltBase = v; },
  get _ltFlash() { return stormFx._ltFlash; }, set _ltFlash(v) { stormFx._ltFlash = v; },
  get _ltNextT() { return stormFx._ltNextT; }, set _ltNextT(v) { stormFx._ltNextT = v; },
  get livDraftOverride() { return customLiv.livDraftOverride; }, set livDraftOverride(v) { customLiv.livDraftOverride = v; },
  get _spMeshKey() { return setupCam.meshKey; }, set _spMeshKey(v) { setupCam.meshKey = v; },
  get setupPreviewOn() { return setupPreviewOn; }, set setupPreviewOn(v) { setupPreviewOn = v; },
  get setupPreviewSpin() { return setupCam.spin; },
  get setupPreviewAz() { return setupCam.az; },
  get setupPreviewEl() { return setupCam.el; },
  get setupPreviewDist() { return setupCam.dist; },
  get spEffDist() { return setupCam.effDist; },
  get spEffFit() { return setupCam.effFit; },
  get spEffPanel() { return setupCam.effPanel; },
  get setupPreviewPan() { return setupCam.pan; },
  get setupPreviewAeroX() { return setupCam.aeroX; },
  get raceAeroMode() { return raceAeroMode; },
  set raceAeroMode(v) { raceAeroMode = v; store.set("aeroMode", v); refreshAeroBtn(); },
  get aeroZones() { return aeroZ ? aeroZ.zones : []; },
  aeroZoneAt: (s) => aeroZ.at(s),
  aeroZoneAhead: (s) => aeroZ.ahead(s),
  stepSetupAero: (dt) => setupCam.stepSetupAero(dt),
  setSetupView: (...a) => setupCam.setSetupView(...a),
  setSetupAim: (p) => setupCam.setSetupAim(p),
  setSetupFree: (on) => setupCam.setSetupFree(on),
  setupPan: (...a) => setupCam.setupPan(...a),
  nudgeSetupCam: (...a) => setupCam.nudgeSetupCam(...a),
  nudgeSetupZoom: (mul) => setupCam.nudgeSetupCam(0, 0, mul),
  setSetupAero: (on, opts) => setupCam.setSetupAero(on, opts),
  get setupPreviewXOn() { return setupCam.xOn; },
  get soundOn() { return soundOn; }, set soundOn(v) { soundOn = v; },
  onAssistBundle() {
    autoThrottleOpt = store.get("autoThrottle", autoThrottleOpt);
    throttleLatchOpt = store.get("throttleLatch", throttleLatchOpt);
    Input.setThrottleLatch(throttleLatchOpt);
    paintThrottleMode();
    refreshGearsBtn();
    if (state === "race" || state === "count") showTouchControls(true);
    if (autoThrottleOpt) announce("ROOKIE — the car brakes, steers and accelerates with you. Turn it down in SETTINGS as you get quicker.", 4, "coach");
  },
  get musicEnabled() { return musicEnabled; }, set musicEnabled(v) { musicEnabled = v; },
  get unlimitedBudget() { return unlimitedBudget; }, set unlimitedBudget(v) { unlimitedBudget = v; },
  get teamIdx() { return teamIdx; }, set teamIdx(v) { teamIdx = v; clampDriverIdx(); },
  arrToHex, hexToArr, getTeamParts, saveTeamParts, recomputePlayerMods, getLiveryId, saveLiveryId,
  getCustomLiveries, setCustomLiveries, getLiveries,
  invalidateDecalTextures: (id) => carDraw.invalidateDecalTextures(id),
  invalidateFactoryMeshCaches: () => carDraw.invalidateFactoryMeshCaches(),
  armConfirm,
  get driverIdx() { return driverIdx; }, set driverIdx(v) { setDriverIdxAt(v); },
  get difficulty() { return difficulty; }, set difficulty(v) { difficulty = v; },
  get aiPace() { return AiBand.mode(); },
  set aiPace(v) { store.set("aiPace", AiBand.setMode(v)); },
  store, tickUi, scheduleFlybyTrack,
  ensureCircuit: (idx) => ensureCircuit(idx),
  buildSetup: (...a) => buildSetup(...a),
  setTeamPicker: (...a) => setTeamPicker(...a),
  teamSwatch: (...a) => teamSwatch(...a),
  openGarage: (...a) => openGarage(...a),
  openCustomize: (...a) => customTeam.openCustomize(...a),
  openRaceSettings: (...a) => raceSettings.openRaceSettings(...a),
  openSeasonSetup: () => seasonUi.open(),
  buildSelect: (...a) => buildSelect(...a),
  updateTrackPreview: (...a) => updateTrackPreview(...a),
  qualiSim: (playerTime) => quali.preview(playerTime || 0),
  qualiClear: () => quali.clear(),
  refreshCareerButton: (...a) => refreshCareerButton(...a),
  careerOwned: () => Career.owned(Teams.LIST[teamIdx] && Teams.LIST[teamIdx].id),
  get photoMode() { return photoMode; }, set photoMode(v) { photoMode = v; },
  get _photoPrevScale() { return _photoPrevScale; }, set _photoPrevScale(v) { _photoPrevScale = v; },
  get photoAlt() { return photoAlt; }, set photoAlt(v) { photoAlt = v; },
  get photoVertT() { return photoVertT; }, set photoVertT(v) { photoVertT = v; },
  get _ltStore() { return ltStore.profiles; }, set _ltStore(v) { ltStore.profiles = v; },
  photoCam, photoKeys, photoMouse, photoMove, photoLook,
  applyResMode: (...a) => applyResMode(...a),
  ltKey: (...a) => ltKey(...a),
  exitPhotoMode: (...a) => exitPhotoMode(...a),
  openWatchPhoto: () => openExperiencePhoto("watch"),
  clamp: (v, a, b) => clamp(v, a, b),
  satAdjust: (rgb, amt) => satAdjust(rgb, amt),
  viewRainfall: () => wxArc ? wxArc.viewRainfall() : 0,
  isWetRoad: () => isWetRoad(),
  initRainDrops: () => initRainDrops(),
  isFloodActiveSession: () => isFloodActiveSession(),
  _nightAmbientBand: () => _nightAmbientBand(),
  applyLightTune: (fromApplyRace, opts) => applyLightTune(fromApplyRace, opts),
  smp, smp2, canvas,
  get gfx() { return gfx; },
  trackFrom: (px, pz, sp) => trackFrom(px, pz, sp),
  worldFromTrack: (s, x, out) => worldFromTrack(s, x, out || smp2),
  GAME_LAPS, TT_LAPS, LONG_GRIP, COUNTDOWN_S,
  raceProfile,
  LAT_MAX, BRAKE,
  vTop: () => vTop(),
  aTop: () => aTop(),
  applyRaceSettings: (blendS) => applyRaceSettings(blendS),
  announce, applyCaution, camVantage, camPoseOf, endRace, gridUp, gripMult, trackWetness, isErsDeploying, cautionInfo, cautionLevel,
  aeroDfMult, xVmaxGain, xDfLoss, drainFor, regenFor, otTimeFor,
  setCautionEnabled, otEnabled,
  get netPlay() { return netPlay; },
  get netStart() { return netStart; }, set netStart(v) { netStart = v; },
  get netRaceT() { const t = state === "race" && netGreen ? (netGreen.now() - netGreen.base) / 1000 : raceT; return Number.isFinite(t) ? Math.max(raceT, t) : raceT; },
  get netNow() { return netNow; }, set netNow(v) { netNow = v; },
  get countT() { return countT; }, set countT(v) { countT = v; },
  get lightsLit() { return lightsLit; }, set lightsLit(v) { lightsLit = v; },
  get netLobby() { return netLobby; },
  loadCarModel: (url) => carDraw.loadCarModel(url),
  loadTrack, persistLightTune, copyLightTune, restoreLightTune,
  refreshLightTunePanel: (...a) => refreshLightTunePanel(...a),
  setCamMode: (...a) => setCamMode(...a),
  rescuePlayer, setLightTune, snapGameCam,
  onIncidentLineCross,
  setWeatherLive: (w) => wxArc.setWeatherLive(w),
  setTimeOfDay: (tod) => wxArc.setTimeOfDay(tod),
  weather: (w) => wxArc.weather(w),
  loadingInfo,
  menuPrep,
  get loadingScreen() { return loadingScreen; },
  setCarRole, modsFor, swapGridSlots,
  followCar: (c) => { cars.forEach((o) => setCarRole(o, false, o === c)); player = c; },
  setPip: (c, m) => mirrorPass.setSubject(c, m),
  goRolling: () => { if (state !== "count") return false; GfxEscalation.resetReloadBudget(); setState("race", "rolling-start"); launchT0 = raceT; els.lights.hidden = true; for (const l of els.lights.children) l.classList.remove("on"); lightsLit = COUNTDOWN_S; cars.forEach((c) => { c.launchOn = false; }); return true; },
  handoverCount: (v) => { const on = v != null; els.lights.classList.toggle("count", on); if (on) els.lights.dataset.count = String(v); else delete els.lights.dataset.count; els.lights.hidden = !on; },
  wireId,
  setScale: (...a) => setScale(...a),
  refreshHud: (...a) => updateHud(...a),
  setNetRoom: (...a) => raceSettings.setNetRoom(...a),
  resetRaceDraft: () => raceSettings.resetDraft(),
  openRaceSetup: (...a) => raceSettings.openRaceSetup(...a),
  enableTilt: () => enableTilt(),
  getSteerMode: () => steerMode,
  get netRoom() { return raceSettings.netRoom; },
  peerSeats: () => (netLobby && netLobby.peerSeats ? netLobby.peerSeats() : []),
  onPeerQuali: (...a) => qualiNet.onPeerQuali(...a),
  onPeerQualiLive: (...a) => qualiNet.onPeerQualiLive(...a),
  openQualiForNet: (...a) => qualiNet.openQualiForNet(...a),
  refreshQualiGate: (...a) => qualiNet.refreshQualiGate(...a),
  get raceQuali() { return qualiGrid(); }, set raceQuali(v) { if (!!v !== qualiGrid()) raceGrid = v ? "quali" : "tier"; },
  get raceGrid() { return raceGrid; }, set raceGrid(v) { if (GRID_RULES.indexOf(v) >= 0) raceGrid = v; },
  get champGrid() { return champGrid; }, set champGrid(v) { if (CHAMP_GRID_RULES.indexOf(v) >= 0) champGrid = v; },
  referencePole: () => quali.referencePole(),
  redFlagRestart,
  get daily() { return daily; },
  holdCaution: (level, cause) => raceCtl.hold(level, cause),
  resetEpisodeOwners() { IncidentSim.reset(); raceCtl.reset(); DebrisWorld.reset(); },
  cameraDampingState() {
    return { eye: camEye.slice(), target: camTgt.slice(), fov: camFov,
      previousAnchor: [camAncX, camAncZ], nextAnchor: [camAncNX, camAncNZ],
      renderFrame: _frameNo, simulationTime: raceT, renderTime: _skyT,
      warming: !!((gfx.warming && (gfx.warming() || (gfx.warmQueued && gfx.warmQueued()))) || mirrorPass.preparing()), liveTicks: PerfGov.ticks() };
  },
  get ttDistance() { return TT_LAPS; },
  get raceChangeable() { return wxArc.changeable; }, set raceChangeable(v) { wxArc.changeable = !!v; wxArc && wxArc.plan === wxArc._derived && (wxArc.plan = null); },
  get announceBusy() { return banner.t > 0; },
  get wxArcPlan() { return wxArc.plan || (wxArc.changeable ? (wxArc.plan = wxArc._derived = wxArc.planFor()) : null); },
  set wxArcPlan(v) { wxArc.plan = v && typeof v === "object" ? { to: v.to, dur: v.dur } : null; },
  openGarageFrom: (from) => openGarage(from),
  startWeatherArc: (from, to, dur) => wxArc.startArc(from, to, dur),
  endWeatherSession: () => wxArc.endSession(true),
  startRace, update, wrapS, quitToMenu,
  raceIntro,
};

ltStore = LightStore.create(G);
if (typeof VisorOptics !== "undefined" && VisorOptics.setSource) VisorOptics.setSource(() => G.frame ? VisorOptics.sceneFromG(G) : null);
raceCtl = RaceControl.create(G);
wxArc = WeatherArc.create(G, { isTimeTrial, isQuali });
tyres = TyreModel.create(G);
lazyBundles.bootPerfRig(() => { SoakRun.create(G); BenchRun.create(G); });
const playerForces = PlayerForces.create(G);
pits = PitLane.create(G);
let startLights = StartLights.create(G);
let marshalPanels = MarshalPanels.create(G);
engineer = RaceEngineer.create(G);
radioVoice = RadioVoice.create(G);
announcer = Announcer.create(G);
let records = SessionRecords.create(G);
const coach = DrivingCoach.create(G);
setupTrialSession = SetupTrialSession.create(G);
let raceRadio = RaceRadio.create(G);
const daily = DailyChallenge.create(G);
const realRace = RealRace.create(G);
let flyingStart = FlyingStart.create(G, { realRace: () => realRace.isActive() || !!(setupTrialSession && (setupTrialSession.pending() || setupTrialSession.active())) });
var jumpStartPenalty = JumpStartPenalty.create(G, {
  autoThrottle, inputOf, launchT0: () => launchT0, soundOn: () => soundOn, isQuali, isTimeTrial,
});
titleMenu = TitleMenu.create(G);
const onboard = Onboard.create(G),
  director = Director.create(G, () => !realRace.isWatch() && !replayBuf.isScrubbing()),
  replayBuf = ReplayBuf.create(G, () => !realRace.isWatch()),
  resultsCam = ResultsCam.create(G, () => !realRace.isWatch()); resultsCam.attachReplay(replayBuf);
const { buildResults, buildTTResults, buildStandings, buildChampion } = GameResults.create(G);
const hud = GameHud.create(G);
const updateHud = hud.updateHud;
const _atmo = Atmosphere.create(G), applyRaceSettings = _atmo.applyRaceSettings;
const { buildSetup, openSetup, lookRowSpecs } = SetupUI.create(G);
raceMessageHistory = typeof RaceMessageHistory !== "undefined" ? RaceMessageHistory.create(G) : null;
if (typeof HudInputs !== "undefined") HudInputs.mountReview();
const { buildSelect, updateTrackPreview, openTrackDetail, closeTrackDetail, setTeamPicker, teamSwatch, vt, showCtxLostNotice, restoreMenuAfterGraphicsReset } = Menus.create(G);
const carDraw = CarDraw.create(G, { resolveLivery, factoryLivery, partsVisualKey, drawAeroFlaps, damp, isTimeTrial, isQuali });
const { teamMesh, teamBodyMesh, playerBodyMesh, teamDecalState, carDecalNum,
        drawCarDecals, queueCarDecals, drawPlayerWheels, drawPitCrew, pitCrewDrawn, drawCockpitRig,
        warmCarAssetsAsync, prepareMenuCarAssets } = carDraw;
_pitCrewDrawn = pitCrewDrawn;

const setupCam = SetupCamera.create(G, { resolveLivery, partsVisualKey, drawAeroFlaps,
  prepareExterior: async (id) => {
    const idx = Tracks.LIST.findIndex((t) => t.id === id); if (idx < 0) return null;
    const ok = await Promise.all([ensureGarageExterior(), ensureScenery(idx)]);
    return ok[0] && ok[1] && Tracks.LIST[idx].id === id ? Tracks.LIST[idx] : null;
  },
  teamDecalState, carDecalNum, drawCarDecals, carPaintMat, PAINT_DRY_DAY, MAT_REFLECT_X, render,
  previewDecalMesh: (team) => { const decal = teamDecalState(team, true), liv = resolveLivery(team);
    return getCarDecalMesh(decal.val, decal.parts, !!carDraw.modelBuf, team.id, liv.finShape, liv.spineHeight, liv.bodyStyle); } });
const { resetSetupCam, setSetupCamPanel, spMeshBust } = setupCam;
const garagePre = GaragePrebuild.create(G, { gate: _menuGate, setupCam, menuIdle, menuSlice,
  ui: () => uiExperience, studio: () => _studio, worldReady: () => menuWorld() });
const renderSetupPreview = garagePre.timed(setupCam.renderSetupPreview);
garagePre.start();
const titleWarm = TitleWarm.create(G, { $, ui: () => uiExperience, schedule: () => scheduleFlybyTrack(true), idleMs: MENU_IDLE_MS,
  warmable: () => !!gfx.warm, prepReady: () => { const p = menuPrep(); return p.world && p.done && p.warmed && p.warmFrames === 0 && !p.warming; } });
titleWarm.start();
const shadowPass = ShadowPass.create(G, { teamMesh, vStd, cockpitCaster: carDraw.cockpitCaster });
const mirrorPass = MirrorPass.create(G, { drawWorldMeshes, drawCar: carDraw.drawMirrorCar, renderPosOf, playerAnchor, yawVisInterp, basisMat,
  carPaint: (wet, night) => carPaintMat(wet ? (night ? PAINT_WET_NIGHT : PAINT_WET_DAY) : (night ? PAINT_DRY_NIGHT : PAINT_DRY_DAY)),
  onModeChange: () => paintHudDetailsSummary() });

customTeam = CustomTeam.create({
  $, store, Teams, DEFAULT_CUSTOM, hexToRgb, rgbToHex, hexToArr, clamp,
  invalidateDecalTextures: (id) => carDraw.invalidateDecalTextures(id),
  invalidateCustomMeshCaches: () => carDraw.invalidateCustomMeshCaches(),
  spMeshBust,
  getLivDraftOverride: () => customLiv.livDraftOverride,
  setLivDraftOverride: (v) => { customLiv.livDraftOverride = v; },
  getSoundOn: () => soundOn,
  GameAudio, announce,
  getEls: () => els,
  getTeamIdx: () => teamIdx,
  setTeamIdx: (v) => { teamIdx = v; },
  getDriverIdx: () => driverIdx,
  setDriverIdx: setDriverIdxAt,
  buildSelect,
  buildSetup,
  isCarsetupVisible: () => !$("carsetup").hidden,
});
const uiScale = UiScale.create(G), { setScale, applyResMode } = uiScale; if (typeof DockLayout !== "undefined" && DockLayout.create) DockLayout.create(G); if (typeof HudArrange !== "undefined" && HudArrange.create) HudArrange.create(G);
const careerUi = CareerUI.create(G);
const seasonUi = SeasonUI.create(G);
const quali = Quali.create(G), qualiSheet = QualiSheet.create(G);
qualiNet = QualiNet.create({
  $, fmtTime, isQuali,
  getPlayer: () => player,
  getCars: () => cars,
  getNetPlay: () => netPlay,
  getNetLobby: () => netLobby,
  openQuali,
  applyPeerQuali(mine) {
    quali.simulate(qualiNet.driven(mine));
    if (!$("quali").hidden) qualiSheet.build(quali.rows());
  },
});
raceSettings = RaceSettings.create(G, {
  GameAudio, Tracks, SettingRow, DrivingLine, SeasonCal,
  qualiResults: () => quali.results(), openQuali, enableTilt,
  getSteerMode: () => steerMode, buildStandings, raceIntro: raceIntroFromSheet,
  previewWxPlan: (o) => wxArc.previewArc(o),
});
const loadingScreen = LoadingScreen.create({ $, Tracks, TrackMaps, Flags, store, announcer: () => announcer, radio: () => radioVoice });
function menuGridCars() {
  if (!track || headlessMode || typeof TrackMesh === "undefined") return;
  const rng = _simRngState;
  try {
    makeCars();
    const order = flybyGridOrder();
    cars = order || cars;
    FlybySeq.setPlayerSlot(order ? order.indexOf(player) : null, cars.length);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], slot = TrackMesh.gridSlot(track, i);
      c.s = wrapS(slot.s); c.x = slot.x; c.xVis = c.x;
      const w = worldFromTrack(c.s, c.x, smp);
      c.px = w.x; c.pz = w.z;
      c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x;
      c.head = 0; c.yawVis = 0; c.rPrevHead = 0; c.steerVis = 0;
      c.speed = 0; c.lap = 0; c.prog = -(14 + i * 8);
    }
  } catch (e) {
    cars = [];
    Log.warn("gfx", "menu grid failed", e);
  }
  _simRngState = rng;
}

function flybyGridOrder() {
  if (!player) return null;
  if (isQuali() || isTimeTrial()) return [player];
  if (duelOn()) {
    const r = Duel.pick(cars);
    const lg = r && duelLegend && typeof Legends !== "undefined" ? Legends.byId(duelLegend) : null;
    if (lg) Duel.asLegend(r, { id: lg.id, name: lg.name, code: lg.code, ratings: Legends.ratings(lg.id), team: Legends.raceTeam(lg.id) }, DriverRatings);
    cars = r ? [player, r] : [player];
  }
  const base = gridFromQuali() ? quali.order(cars) : null;
  if (gridRule() === "random" && !base) return null;
  const pre = gridOrderFor(base);
  if (pre && pre.length === cars.length) return pre.slice();
  const o = cars.filter((c) => c !== player).sort((a, b) => a.tier - b.tier);
  o.splice(Math.min(11, o.length), 0, player);
  return o;
}

let _introKey = "", _introRun = 0, _introSkip = 0;
function cancelIntro() { if (_studio) studioClose(_studio.n); _introRun++; _introKey = ""; _introSkip = 0; sheetRelease(false); }
const _hidden = { ms: 0, at: 0 };
function introNow() {
  const now = performance.now(), hid = typeof document !== "undefined" && !!document.hidden;
  if (hid && !_hidden.at) _hidden.at = now;
  else if (!hid && _hidden.at) { _hidden.ms += now - _hidden.at; _hidden.at = 0; }
  return now - _hidden.ms - (_hidden.at ? now - _hidden.at : 0);
}
async function awaitIntroWarm(current) {
  return RaceEntryProfile.spanAsync("awaitIntroWarm", async () => {
    const at = introNow();
    while (current() && gfx.warming && (gfx.warming() || (gfx.warmQueued && gfx.warmQueued()))) {
      if (introNow() - at >= 30000) throw new Error("Shader preparation timed out");
      await menuSlice();
    }
    return current();
  });
}
let _studio = null;
let _introSheet = null;
function sheetRelease(hide) {
  const h = _introSheet; if (!h) return;
  _introSheet = null;
  if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.setProgressSink) RaceEntryProfile.setProgressSink(null);
  h.btn.disabled = false; if (h.back) h.back.disabled = false;
  if (h.btn.textContent === "PREPARING…" || String(h.btn.textContent).startsWith("PREPARING…")) h.btn.textContent = h.label;
  if (hide) h.sheet.hidden = true;
}
function introCover(info, n) {
  const sheetPrep = _introSheet && typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.softwareRaster && RaceEntryProfile.softwareRaster();
  if (!_introSheet || sheetPrep) loadingScreen.prep(info, () => studioSkip(n));
}
function afterGarageOut(n, key, go, prepared, live, stage) {
  studioClose(n);
  if (n !== _introRun) return;
  if (!prepared || !live()) {
    Log.warn("game", "intro released without a garage-out", { stage: stage || "", prepared, state, keyMoved: key !== menuKey(trackIdx), track: !!track }); loadingScreen.stop();
    if (!prepared && live()) announce("PREPARATION FAILED — please retry", 5, "info");
    titleIfBare(); return;
  }
  try { _introKey = key; raceIntro(go); } catch (e) { Log.warn("gfx", "loading screen failed", e); loadingScreen.stop(); go(); }
}
function studioOpen(n, info) {
  if (_studio) studioClose(_studio.n);
  const real = info && info.real;
  const off = (real && (real.watch || real.startLap > 1)) || headlessMode || document.hidden;
  const ms = off ? 0 : setupCam.startDriveOut();
  if (ms > 0) {
    const at = introNow();
    _studio = { at, openAt: at, ms: Math.max(1, ms), n, info, cardUp: true };
    setupPreviewOn = true;
    if (typeof PerfGov !== "undefined" && PerfGov.softwareGaragePreviewBegin) PerfGov.softwareGaragePreviewBegin(gfx);
  }
  if (_studio && gfx.softPresent && gfx.softPresent() && gfx.awaitSoftPresent) {
    const studio = _studio; studio.softReady = false;
    if (gfx.invalidateSoftPresent) gfx.invalidateSoftPresent();
    gfx.awaitSoftPresent(30000).then(() => { if (_studio === studio) studio.softReady = true; }, (e) => { if (_studio === studio) studio.error = e; });
  }
  introCover(info, n);
}
function studioShown() {
  if (!_studio || !_studio.cardUp) return;
  const soft = gfx.softPresentState && gfx.softPresentState();
  if (soft && soft.shownGen < soft.sceneGen) return;
  const n = _studio.n;
  _studio.cardUp = false; _studio.at = introNow();
  sheetRelease(true);
  loadingScreen.garage(_studio.info, () => studioSkip(n));
}
function studioSkip(n) {
  if (n !== _introRun) return;
  _introSkip = n;
  if (_studio && _studio.n === n) _studio.skip = true;
}
function studioClose(n) {
  if (!_studio || _studio.n !== n) return;
  const info = _studio.info;
  setupCam.stopDriveOut(); setupPreviewOn = false; _studio = null;
  if (typeof PerfGov !== "undefined" && PerfGov.softwareGaragePreviewEnd) PerfGov.softwareGaragePreviewEnd(gfx);
  if (loadingScreen.phase() === "garage") loadingScreen.building(info);
}
async function studioDone(live, n) {
  while (_studio && _studio.n === n && !_studio.skip && live() && (_studio.cardUp || setupCam.driveOutLeft() > 0)) {
    if (_studio.error) throw _studio.error;
    const driveCap = Math.max(_studio.ms, _studio.ms * 3);
    const elapsed = introNow() - _studio.at;
    const sinceOpen = introNow() - (_studio.openAt || _studio.at);
    const cap = _studio.cardUp ? 30000 : driveCap;
    if (elapsed >= cap || sinceOpen >= 30000 + driveCap) {
      if (_studio.cardUp) throw new Error("Garage preparation timed out");
      break;
    }
    await menuSlice();
  }
  if (_studio && _studio.n === n && gfx.warm && !_studio.skip && live()) _studio.held = true;
  else studioClose(n);
}
async function introPlan(live, key, info, n) {
  if (!live()) return null;
  reloadFlybyShots();
  if (!flybyShots && _menuFly && _menuFly.key === key && _menuFly.track === track) return _menuFly;
  FlybySeq.setDuration(loadingScreen.nextFlyMs(info.readMs));
  const fly = { key, track, shots: flybyShots || FlybySeq.vary(FlybySeq.DEFAULT, (Date.now() ^ (trackIdx * 2654435761)) >>> 0, false) }, step = FlybySeq.planSteps(track, fly.shots);
  for (let spent = 0, slice = 0; live() && spent < 800;) {
    const at = performance.now(), done = step(), elapsed = performance.now() - at;
    spent += elapsed; slice += elapsed;
    if (done || spent >= 800) break;
    if (slice >= 3) { await menuSlice(); slice = 0; }
  }
  return live() ? fly : null;
}
async function introPrepare(live, key, info, n, cold) {
  return RaceEntryProfile.spanAsync("introPrepare", async () => {
    let failed = false;
    const current = () => !failed && live();
    if (gfx.warming && (gfx.warming() || (gfx.warmQueued && gfx.warmQueued())) && !(await awaitIntroWarm(current))) return null;
    if (!current()) return null;
    const lamps = _atmo.prebakeLamps();
    const plan = RaceEntryProfile.spanAsync("introPlan", () => introPlan(current, key, info, n))
      .catch((e) => { failed = true; throw e; });
    try {
      const [fly] = await Promise.all([plan, (async () => {
        await RaceEntryProfile.spanAsync("introWarmPrograms", async () => {
          await Promise.resolve();
          if (!current()) return;
          if (cold) {
            FlybySeq.reset(); warmPrograms(); _menuGate.warm = 2;
            for (let f = 0; f < 3 && current() && _menuGate.warm > 0; f++) await new Promise((r) => requestAnimationFrame(r));
          }
          if (await awaitIntroWarm(current) && cold && current()) _menuGate.warm = 0;
        });
      })(), (async () => {
        await RaceEntryProfile.spanAsync("lampBake", async () => {
          await Promise.resolve();
          const lampAt = introNow();
          while (lamps && current() && !lamps(3)) {
            if (introNow() - lampAt >= 30000) break;
            await new Promise((r) => setTimeout(r, 8));
          }
        });
      })()]);
      return current() ? { fly } : null;
    } catch (e) { failed = true; throw e; }
  });
}
function introGarage(go) {
  const key = menuKey(trackIdx), n = ++_introRun, settings = entrySettings(), info = loadingInfo();
  const live = () => n === _introRun && state === "menu" && settings === entrySettings() && key === menuKey(trackIdx);
  studioOpen(n, info);
  if (!_studio) { loadingScreen.stop(); return false; }
  let prepared = false;
  (async () => {
    try {
      await RaceEntryProfile.spanAsync("introGarage", async () => {
        const prepP = introPrepare(live, key, info, n, false); prepP.catch(() => {});
        await RaceEntryProfile.spanAsync("studioDone", () => studioDone(live, n));
        const ready = await prepP;
        if (!ready) return;
        if (live() && ready.fly) _menuFly = ready.fly;
        prepared = true;
      });
    }
    catch (e) { if (live()) { Log.warn("gfx", "intro garage failed", e); quitToMenu(); announce("PREPARATION FAILED — please retry", 5, "info"); } }
    finally { afterGarageOut(n, key, go, prepared, live, "garage"); }
  })();
  return true;
}
function introBuild(go) {
  const idx = trackIdx, key = menuKey(idx), n = ++_introRun;
  const settings = entrySettings(), live = () => n === _introRun && state === "menu" && settings === entrySettings();
  if (!(idx >= 0)) return false;
  const mp = _menuGate.prep, join = !!(mp && mp.building && mp.want === idx && mp.bkey === buildKey(idx));
  const prior = mp && mp.step ? mp.step : null;
  if (join) mp.owner = live;
  clearTimeout(flybyBuildTimer); _menuGate.generation++;
  const info0 = loadingInfo();
  introCover(info0, n);
  let prepared = false, stage = "build:scenery";
  (async () => {
    try {
      if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.afterPaint) await RaceEntryProfile.afterPaint();
      await RaceEntryProfile.spanAsync("introBuild", async () => {
        await RaceEntryProfile.spanAsync("ensureScenery", () => ensureScenery(idx));
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        stage = "build:warm"; if (!(await awaitIntroWarm(live)) || !live()) return;
        stage = join ? "build:join" : "build:prior"; if (join) await mp.step;
        else if (prior) await prior.catch(() => false);
        stage = "build:load"; if (!(await RaceEntryProfile.spanAsync("loadTrackStepped", () => loadTrackStepped(idx, live))) || !live()) return;
        stage = "build:prepare"; _menuGate.ready = key; _menuGate.track = track;
        const t1 = performance.now();
        await RaceEntryProfile.spanAsync("prepareMenuCarAssets", () => prepareMenuCarAssets(() => live() && performance.now() - t1 < 1500));
        const ready = await introPrepare(live, key, info0, n, true);
        if (!ready) return;
        const fly = ready.fly;
        if (live() && fly) _menuFly = fly;
        _menuGate.warm = 0;
        if (_introSkip !== n) { RaceEntryProfile.mark("studioOpen:start"); studioOpen(n, info0); await RaceEntryProfile.spanAsync("studioDone", () => studioDone(live, n)); RaceEntryProfile.mark("studioOpen:end"); }
        prepared = true;
      });
    } catch (e) {
      if (live()) { Log.warn("gfx", "intro build failed", e); quitToMenu(); announce("PREPARATION FAILED — please retry", 5, "info"); }
    }
    finally { afterGarageOut(n, key, go, prepared, live, stage); }
  })();
  return true;
}
function introWarm(go) {
  const key = menuKey(trackIdx);
  if (!gfx.warm || (_warmKey === key && !(gfx.warming && gfx.warming()))) return false;
  const n = ++_introRun, settings = entrySettings();
  const live = () => n === _introRun && state === "menu" && settings === entrySettings() && key === menuKey(trackIdx);
  const info = loadingInfo(), cold = _warmKey !== key;
  if (cold) introCover(info, n); else studioOpen(n, info);
  let prepared = false;
  (async () => { try {
      await RaceEntryProfile.spanAsync("introWarm", async () => {
        if (cold) {
          const ready = await introPrepare(live, key, info, n, true);
          if (!ready) return;
          if (ready.fly) _menuFly = ready.fly;
          _menuGate.warm = 0;
          if (_introSkip !== n) { RaceEntryProfile.mark("studioOpen:start"); studioOpen(n, info); await RaceEntryProfile.spanAsync("studioDone", () => studioDone(live, n)); RaceEntryProfile.mark("studioOpen:end"); }
        } else {
          const prepP = introPrepare(live, key, info, n, false); prepP.catch(() => {});
          await RaceEntryProfile.spanAsync("studioDone", () => studioDone(live, n));
          const ready = await prepP;
          if (!ready) return;
          if (ready.fly) _menuFly = ready.fly;
          _menuGate.warm = 0;
        }
        if (!live()) return;
        prepared = true;
      });
    } catch (e) { if (live()) { Log.warn("gfx", "intro warm failed", e); quitToMenu(); announce("PREPARATION FAILED — please retry", 5, "info"); } else if (n === _introRun) loadingScreen.stop(); }
    finally { afterGarageOut(n, key, go, prepared, live, "warm"); }
  })();
  return true;
}
function startRaceCovered() {
  if (!loadingScreen.phase()) loadingScreen.building(loadingInfo());
  return startRace();
}
function startRaceFromSheet() {
  if (headlessMode || document.hidden || netPlay.active() || qualiNet.hasArmed()) return startRaceCovered();
  try {
    resultsCam.reset(); RaceCeremony.resetLive(); els.results.hidden = true; clearTimeout(flybyBuildTimer); _menuGate.generation++;
    setState("menu", "sheet-start");
    const def = Tracks.LIST[trackIdx];
    if (track && def && builtWorldFits(def)) { _menuGate.track = track; _menuGate.ready = menuKey(trackIdx); }
    raceIntro(startRace);
  } catch (e) { Log.warn("game", "pre-race screen failed — starting straight away", e); cancelIntro(); loadingScreen.stop(); return startRaceCovered(); }
}
function titleIfBare() { sheetRelease(false); if (state === "menu" && els.overlay.hidden && ![...document.querySelectorAll(".screen")].some((el) => !el.hidden)) els.overlay.hidden = false; }
function raceIntroFromSheet(go, sheet, btn) {
  if (_introSheet) return;
  if (!sheet || !btn) { if (sheet) sheet.hidden = true; raceIntro(go); return; }
  const back = $("rs-cancel"), owner = _introSheet = { sheet, btn, back, label: btn.textContent };
  const practice = typeof UiExperience !== "undefined" && UiExperience.isPracticePick && UiExperience.isPracticePick();
  const entryTag = practice ? "practice" : (isTimeTrial() ? "tt" : "race");
  RaceEntryProfile.beginUi(entryTag);
  RaceEntryProfile.setProgressSink((label) => {
    if (_introSheet === owner && owner.btn) owner.btn.textContent = "PREPARING… " + label;
  });
  btn.disabled = true; btn.textContent = "PREPARING…"; if (back) back.disabled = true;
  clearTimeout(flybyBuildTimer); _menuGate.generation++;
  const failed = (e) => {
    if (_introSheet !== owner) return;
    Log.warn("game", "pre-race preparation failed", e); cancelIntro(); loadingScreen.stop();
    announce("PREPARATION FAILED — please retry", 5, "info");
  };
  const intro = () => { try { raceIntro(go); } catch (e) { failed(e); } };
  const sessionLate = typeof GarageDepartureMotion === "undefined" || typeof GarageDepartureWheels === "undefined"
    || (typeof daily !== "undefined" && daily.isActive() && daily.current().class === "standard" && !!(records && records._stub));
  try { if (!sessionLate && !(gfx.warming && (gfx.warming() || (gfx.warmQueued && gfx.warmQueued())))) { intro(); return; } } catch (e) { failed(e); return; }
  const n = ++_introRun;
  let settings = entrySettings();
  const live = () => n === _introRun && state === "menu" && settings === entrySettings();
  (async () => { try {
    if (sessionLate) { if (!(await ensureRaceSession())) throw new Error("Race session preparation failed"); if (_introSheet !== owner || n !== _introRun) return; settings = entrySettings(); }
    if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.afterPaint) await RaceEntryProfile.afterPaint();
    if (await awaitIntroWarm(live)) intro(); else if (_introSheet === owner) { Log.warn("game", "intro released without a garage-out", { stage: "sheet:warm", state }); sheetRelease(false); }
  } catch (e) { failed(e); } })();
}
function raceIntro(go) {
  els.overlay.hidden = true;
  const built = _introKey; _introKey = "";
  if (!built && !menuWorld() && introBuild(go)) return;
  if (!built && menuWorld() && introWarm(go)) return;
  if (!built && introGarage(go)) return;
  if (_studio) {
    const n = _studio.n, key = menuKey(trackIdx);
    const live = () => n === _introRun && state === "menu";
    (async () => {
      try { await RaceEntryProfile.spanAsync("studioDone", () => studioDone(live, n)); afterGarageOut(n, key, go, true, live); }
      catch (e) { if (live()) { Log.warn("gfx", "garage-out wait failed", e); quitToMenu(); announce("PREPARATION FAILED — please retry", 5, "info"); } }
    })();
    return;
  }
  sheetRelease(true);
  if (built && _introSkip === _introRun) _introSkip = 0;
  const world = menuWorld();
  if (world) menuGridCars();
  const real = realRace.intro();
  if (real) FlybySeq.setPlayerSlot(null, (cars || []).length);
  if (world) applyRaceSettings();
  reloadFlybyShots();
  const planned = world && _menuFly && _menuFly.track === track && _menuFly.key === _menuGate.ready ? _menuFly.shots : null;
  if (planned && flybyShots && JSON.stringify(planned) === JSON.stringify(flybyShots)) flybyShots = planned;
  _menuFly = null;
  if (!flybyShots) flybyShots = planned || FlybySeq.vary(FlybySeq.DEFAULT, (Date.now() ^ (trackIdx * 2654435761)) >>> 0);
  if (flybyShots) flybyShots = FlybySeq.withoutSlot(flybyShots);
  if (flybyShots && real && (real.watch || real.startLap > 1)) flybyShots = FlybySeq.withoutGrid(flybyShots);
  const info = loadingInfo();
  const flyMs = loadingScreen.nextFlyMs(info.readMs, info.warmReady = !(gfx && gfx.warming && gfx.warming()));
  FlybySeq.setDuration(flyMs);
  if (world) FlybySeq.warm(track, flybyShots);
  FlybySeq.reset();
  let forceSoftwareFlyby = false;
  try { forceSoftwareFlyby = typeof DevFlags !== "undefined" && !!DevFlags.get("swFlyby"); } catch (_) {  }
  if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.softwareRaster && RaceEntryProfile.softwareRaster() && !forceSoftwareFlyby) info.hasWorld = false;
  (async () => {
    try {
      await RaceEntryProfile.spanAsync("flyby", async () => {
        await new Promise((resolve) => { loadingScreen.run(info, () => { resolve(); go(); }); });
      });
    } catch (e) { Log.warn("gfx", "flyby handoff failed", e); go(); }
  })();
}
function loadingInfo() {
  const real = realRace.intro();
  const out = {
    track: Tracks.LIST[trackIdx], laps: raceLaps,
    gp: real ? real.title : SeasonCal.gpName ? SeasonCal.gpName(Tracks.LIST[trackIdx]) : undefined,
    real,
    weather: raceWeather, tod: raceTimeOfDay,
    session, practice: isPractice(), duel: duelOn(), duelLegend, flow,
    hasWorld: menuWorld(), shots: flybyShots, grid: (cars || []).map((c) => ({ code: c.code, colour: c.color, isPlayer: c === player && FlybySeq.slotKnown() })),
    readMs: 0,
  };
  if (real && announcer.readMs) out.readMs = announcer.readMs(out);
  return out;
}
aeroZ = AeroZones.create(G);
skids = SkidMarks.create();
const carFx = CarFx.create(G, { skids });
DrivingLine.setMode(store.get("drivingLine", "full"));
const _dlApi = { id: null, total: 0, track: null, sample: null, curvature: null, latMax: 0, brake: 0, accel: 0, vTop: 0, grip: 1 };
function drivingLineApi(trk) {
  if (_dlApi.track !== trk || _dlApi.vTop !== vTop()) {
    _dlApi.id = trk.def.id; _dlApi.total = trk.total; _dlApi.track = trk;
    _dlApi.sample = (s, out) => Tracks.sample(trk, s, out);
    _dlApi.curvature = (s) => Tracks.curvature(trk, s);
    _dlApi.lineAt = trk.line ? (s) => TrackLine.at(trk, s) : null;
    _dlApi.latMax = PhysicsConsts.LAT_MAX; _dlApi.brake = PhysicsConsts.BRAKE; _dlApi.accel = aTop();
    _dlApi.vTop = vTop(); _dlApi.grip = 1; DrivingLine.reset();
  }
  return _dlApi;
}
let rivalAudio = RivalAudio.create(G);
let carSfx = CarSfx.create(G);
const photomode = Photomode.create(G), { updatePhotoCam, exitPhotoMode } = photomode, { refreshLightTunePanel, closeLightTuner } = TunerPanel.create(G);
CamTune.bindContext(() => ({ track: G.track?.def?.id, car: ((G.state === "race" || G.state === "count") && G.player?.team?.id) || Teams.LIST[G.teamIdx]?.id }));
const { closeCamTuner } = CamTunerPanel.create(G);
const flybyPanel = FlybyPanel.create(G);
reloadFlybyShots();
SteerTuning.create(G);
DebrisWorld.create(G);
const incidentSim = IncidentSim.create(G);
const collide = Collide.create(G, collideFx, (c) => realRace.owns(c));
let netPlay = {
  active: () => false, owns: () => false, role: () => null,
  ownsRaceControl: () => true, ownsClassification: () => true,
  awaitingStart: () => false, awaitingResult: () => false,
  rivalDriverIds: () => [], peerLaps: () => [], peerResult: () => null, lastResult: () => null,
  predict: () => null, status: () => ({ active: false, role: null }),
  tick: () => {}, stop: () => {}, hostStart: () => {},
  start: () => ({ ok: false, error: "no_net", message: "Multiplayer is not loaded." }),
  reportLap: () => {}, reportResult: () => {}, reportCaution: () => {},
  reportQuali: () => {}, reportQualiLive: () => {},
  sendEvent: () => false, onEvent: () => false,
};
let netLobby = {
  wire: () => {}, open: () => {}, close: () => {}, cancel: () => {},
  abortQuali: () => {}, qualifying: () => false, roomChanged: () => {}, setReady: () => {},
  peerSeats: () => [], roomState: () => ({ open: false, role: null, peers: [] }),
  status: () => ({ role: null, connected: false }),
  reportQuali: () => {}, reportQualiLive: () => {}, openFromUrl: () => false,
};
const bodyAttitude = BodyAttitude.create(G);
let audioPanel = AudioPanel.create(G);

function teamById(id) { return Teams.LIST.find((t) => t.id === id); }
function cssCol(c) { return "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")"; }
function hexToArr(h) { const n = parseInt(String(h).slice(1), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function arrToHex(a) { const f = (v) => ("0" + Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16)).slice(-2); return "#" + f(a[0]) + f(a[1]) + f(a[2]); }
function armConfirm(btn, armedText, action) {
  const name = btn.getAttribute("aria-label");
  if (!btn.dataset.armed) {
    btn.dataset.armed = "1";
    btn.textContent = armedText;
    btn.classList.add("armed");
    if (name) { btn.dataset.name = name; btn.setAttribute("aria-label", "Confirm: " + name + ". Press again"); }
    return false;
  }
  delete btn.dataset.armed;
  btn.classList.remove("armed");
  if (btn.dataset.name) { btn.setAttribute("aria-label", btn.dataset.name); delete btn.dataset.name; }
  action();
  return true;
}

function closeRaceSheets() {
  SettingsNav.invalidate();
  if (typeof Captions !== "undefined") Captions.clear();
  if (keyBinds) keyBinds.disarmAll();
  for (const el of document.querySelectorAll(".screen")) if (el.id !== "loading") el.hidden = true;
  for (const id of ["pm-settings-index", "advanced", "audioset", "lighting", "camtune", "flyby"]) { const el = $(id); if (el) el.hidden = true; }
  setupCam.cancelArrival(); setupPreviewOn = false; pitWorkSpec = null; garageReturn = "select";
}
function clearMenuScreens() {
  cancelIntro();
  loadingScreen.stop();
  FlybySeq.cancelWarm();
  closeRaceSheets(); els.overlay.hidden = true;
  raceSettings.setNetRoom(false);
}

const rotateBlockMql = window.matchMedia ? window.matchMedia("(orientation: portrait) and (pointer: coarse) and (max-width: 743px)") : { matches: false };
function syncRotateBlocker(moveFocus) {
  const box = $("rotate-device"); if (!box) return false;
  const body = typeof document !== "undefined" ? document.body : null;
  if (body) body.classList.add("rotate-measure");
  const active = getComputedStyle(box).display !== "none";
  if (body) body.classList.remove("rotate-measure");
  box.setAttribute("aria-hidden", active ? "false" : "true");
  if (active && rotateBlockMql.matches && !paused && (state === "race" || state === "count") && !netPlay.active()) setPaused(true, "rotate-block");
  if (paused && !(garageReturn === "pit" && !$("carsetup").hidden)) {
    const hide = active || photoMode || els.pmsettings?.hidden === false, was = els.pausemenu.hidden, ae = body && document.activeElement;
    if (hide && !was && ae && els.pausemenu.contains(ae)) els.pausemenu._back = ae;
    els.pausemenu.hidden = hide;
    const el = !hide && was && els.pausemenu._back; if (el) { els.pausemenu._back = null; requestAnimationFrame(() => { if (!els.pausemenu.hidden && el.isConnected && !el.disabled && !el.closest("[hidden]")) el.focus(); }); }
  }
  if (active && moveFocus) requestAnimationFrame(() => {
    const first = $("rotate-controls"); if (first && getComputedStyle(box).display !== "none") first.focus();
  }); return active;
}
if (rotateBlockMql.addEventListener) rotateBlockMql.addEventListener("change", () => syncRotateBlocker(true));
else if (rotateBlockMql.addListener) rotateBlockMql.addListener(() => syncRotateBlocker(true));

const CTX_LOST_NOTICE_KEY = "apex26.ctxLostNotice";
const CTX_LOST_NOTICE_MSG = "Graphics reset — retrying with lighter settings";
function stashCtxLostNotice() {
  try { sessionStorage.setItem(CTX_LOST_NOTICE_KEY, "1"); } catch (_) {  }
}
function quitToMenuAfterCtxLost() {
  clearRaceEntrySoften();
  stashCtxLostNotice();
  if (gfxContextLost() && typeof GfxEscalation !== "undefined" && GfxEscalation.stashInPageRecoverFlags) GfxEscalation.stashInPageRecoverFlags();
  loadingScreen.stop();
  quitToMenu();
  try {
    resetSetupCam();
    spMeshBust();
    garagePre.release();
    _menuGate.warm = 0;
    _menuGate.garageWarm = 0;
    _menuGate.garageReady = false;
    _carWarm.busy = false;
    if (gfx && gfx.invalidateSoftPresent) gfx.invalidateSoftPresent();
    if (canvas) canvas.style.visibility = "";
    if (!_softEl && gfx && gfx.softPresent && gfx.softPresent()) _softEl = document.getElementById("game-soft");
    if (_softEl) _softEl.style.visibility = "";
  } catch (_) {  }
  if (typeof restoreMenuAfterGraphicsReset === "function") restoreMenuAfterGraphicsReset();
  if (typeof showCtxLostNotice === "function") showCtxLostNotice();
  else if (typeof announce === "function") announce(CTX_LOST_NOTICE_MSG, 5, "info");
}
if (typeof GfxEscalation !== "undefined" && GfxEscalation.registerMenuRecover) {
  GfxEscalation.registerMenuRecover(quitToMenuAfterCtxLost);
  installRaceEntrySoften();
}
function quitToMenu() {
  if (!frozen && !gfxContextLost() && soloPlayerDone() && !postFinishWait()) {
    if (!pendingFinishQuit) announce("SETTLING FINISH — RETURNING TO MENU", 4, "info");
    pendingFinishQuit = true;
    setPaused(false, "restart");
    if (!paused && !document.hidden) return;
  }
  pendingFinishQuit = false;
  clearRaceEntrySoften();
  Ghost.flush();
  cancelIntro();
  if (typeof MenuTeardown !== "undefined") MenuTeardown.beginQuit();
  els.pausemenu.hidden = true;
  Input.unlockLandscape();
  _menuGate.warm = 0; _menuGate.garageWarm = 0; _menuGate.track = null; _menuGate.ready = ""; _menuFly = null;
  resultsCam.reset(); RaceCeremony.resetLive(); replayBuf.clear();
  if (raceMessageHistory) raceMessageHistory.clear();
  if (typeof InputGhost !== "undefined") InputGhost.flush();
  if (photoStudio) photoStudio.close(false); if (uiExperience) uiExperience.stopHome();
  sessionEntry.cancel();
  qualiSheet.close();
  if (announcer.stop) announcer.stop();
  feel.shake = 0; feel.hitStop = 0;
  PerfGov.sentinelArm(false); netPlay.stop("local"); hideCamPicker();
  if (setupTrialSession) setupTrialSession.cancel();
  if (typeof SetupTrials !== "undefined") SetupTrials.invalidate("Session ended before attempt completed");
  if (garageReturn === "pit") { setupCam.cancelArrival(); $("carsetup").hidden = true; setupPreviewOn = false; pitWorkSpec = null; garageReturn = "select"; }
  if (typeof ExtraRigs !== "undefined" && ExtraRigs.resetAuto) ExtraRigs.resetAuto();
  if (qualiField) { try { IncidentSim.reset(); } catch (_) {  } cars = qualiField; qualiField = null; }
  const forgetGp = !isChampionship() && !!season && season.qualiMode === "gp";
  closeLightTuner(false); closeCamTuner(false); flybyPanel.closeFlyby(false); exitPhotoMode();
  quali.clear(forgetGp);
  qualiNet.clearPeers();
  qualiNet.hasArmed() ? qualiNet.resetOnQuitWithCancel() : qualiNet.resetSoft();
  stormFx._ltBase = null; stormFx._ltFlash = 0;
  loadingScreen.stop();
  if (skipToResults()) { resultsCam.reset(); RaceCeremony.resetLive(); replayBuf.clear(); announcer.stop && announcer.stop(); }
  setState("menu", "quit"); paused = false; releaseFieldScratch(true); raceCtl.reset(); wxArc.endSession(); daily.stop(); realRace.stop(); flyingStart.stop();
  netStart = null;
  $("quali").classList.remove("q-done"); document.body.classList.remove("in-race", "rotate-help-open");
  syncRotateBlocker(false);
  dropRaceWake();
  setHudUserHidden(false);
  els.hud.hidden = true; els.lights.hidden = true; els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  if (garageReturn === "pit" && !$("carsetup").hidden) { leaveGarage(); pitWorkSpec = null; garageReturn = "select"; }
  closeRaceSheets(); banner.clear();
  radioVoice.halt(); radioVoice.flushDecoded();
  GameAudio.radioStingStop();
  $("advanced").hidden = true; $("lighting").hidden = true; $("audioset").hidden = true;
  els.overlay.hidden = false;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  practiceMode = false;
  Particles.rainShow(false); Particles.clear(); Droplets.clear();
  if (soundOn) GameAudio.startMusic(-1);
  consumeGhostHash();
  if (typeof MenuTeardown !== "undefined" && MenuTeardown.deferQuitTail(() => MenuQuitTail.afterOverlay(forgetGp))) return;
  MenuQuitTail.afterOverlay(forgetGp);
  if (typeof MenuTeardown !== "undefined") MenuTeardown.endQuit();
}


const ranked = [], parked = [], stillCars = [], _colField = [];
const STILL_V = 1.0, STILL_HAZARD_S = 1.5;
function rankByProg(a) {
  for (let i = 1; i < a.length; i++) { const c = a[i], p = c.prog; let j = i - 1; while (j >= 0 && a[j].prog < p) { a[j + 1] = a[j]; j--; } a[j + 1] = c; }
}
const _finRanked = [];
function rankFinishers() {
  _finRanked.length = 0;
  for (let i = 0; i < ranked.length; i++) if (ranked[i].finished) _finRanked.push(ranked[i]);
  _finRanked.sort(RaceControl.finishOrder);
  for (let i = 0, k = 0; i < ranked.length; i++) if (ranked[i].finished) _finRanked[k++].rank = i + 1;
}
function releaseFieldScratch(quit) {
  ranked.length = 0; parked.length = 0; _colField.length = 0; _finRanked.length = 0; Collide.releaseArcBuckets(); collide.releaseTrack(); mirrorPass.releaseTrack(quit); pits.releaseTrack();
  _wallCtx.track = null; _tfSamp.track = null; _tfSamp.s = NaN;
  for (let i = 0; i < cars.length; i++) if (cars[i] && cars[i]._lk) cars[i]._lk.track = null;
}

const _engArg = { slip: 1, ax: 0, onKerb: false, wet: false, tow: 0,
                  deploy: 0, energy: 1, ersDeploy: 0.5, throttle: 1, brake: 0, regen: 0.5 };
let _audioParamStep = true;
const _engAcc = { dt: 0 };
const _s8Pres = { dt: 0 }; let _s8Stamp = null;
function update(dt) {
  if (!track) return;
  if ((state === "race" || state === "count") && Input.consumeCameraCycle()) cycleCam();
  realRace.update(dt);
  flyingStart.update(dt);
  if (state === "race" && Input.consumeRecover() && player && !player.retired && !realRace.owns(player)) {
    if (!coach.retry() && !playerForces.recoverBlocked(player, pits.inLane(player))) rescuePlayer(player);
    Log.info("game", "manual recover");
  }
  if (state === "count") {
    if (netStart) {
      feel.startHold = netStart.hold;
      countT = (COUNTDOWN_S + feel.startHold) - (netStart.at - netStart.now()) / 1000;
    } else if (netPlay && netPlay.awaitingStart && netPlay.awaitingStart()) {
      if (banner.t <= 0) { const t = performance.now(), loud = !(t - announce._waitAt < 30000); if (loud) announce._waitAt = t; announce("WAITING FOR PLAYERS…", 1, "info", null, !loud); }
    } else {
      countT += dt;
    }
    const lit = Math.min(COUNTDOWN_S, Math.floor(countT));
    if (lit > lightsLit) {
      for (let i = lightsLit; i < lit; i++) if (els.lights.children[i]) els.lights.children[i].classList.add("on");
      lightsLit = lit;
      if (soundOn) GameAudio.lightOn(lit - 1);
      if (lit === 1) Input.calibrate();
      if (lit === COUNTDOWN_S && !netStart) feel.startHold = 0.2 + simRnd() * 1.8;
    }
    if (lightsLit === COUNTDOWN_S && countT > COUNTDOWN_S + feel.startHold) {
      setState("race", feel.restartPending ? "restart-green" : "lights-out");
      GfxEscalation.resetReloadBudget();
      if (!feel.restartPending) raceT = 0;
      launchT0 = raceT;
      netGreen = netStart ? { base: netStart.at - raceT * 1000, now: netStart.now } : null;
      els.lights.hidden = true;
      for (const l of els.lights.children) l.classList.remove("on");
      netStart = null;
      const wasRestart = feel.restartPending;
      feel.restartPending = false;
      for (const c of cars) jumpStartPenalty.tickAtGreen(c);
      Input.clearDriveEdges();
      announce("LIGHTS OUT!", 1.4, "race");
      if (soundOn) GameAudio.lightsOut();
      if (isQuali() && !wasRestart) launchFlyingLap();
    }
    _gridIdleOpts.soundOn = soundOn; _gridIdleOpts.wet = isWetRoad(); _gridIdleOpts.step = _audioParamStep;
    GameAudio.setGridIdle(player, _gridIdleOpts); return;
  }
  if (state !== "race") return;
  if (!realRace.owns(player)) raceT += dt;
  if (netGreen && !netPlay.active()) netGreen = null;
  if (netGreen) {
    const w = (netGreen.now() - netGreen.base) / 1000;
    if (Number.isFinite(w) && w > raceT) raceT = w;
  }
  if (raceCtl.takeRestart()) {
    raceCtl.clearHold();
    if (redFlagRestart()) return;
    IncidentSim.reset(); DebrisWorld.reset(); DebrisWorld.prime();
  }
  wxArc.tick(dt);
  _atmo.tick(dt);
  checkRetirements(dt);
  ranked.length = 0;
  for (let i = 0; i < cars.length; i++) if (!cars[i].retired) ranked.push(cars[i]);
  rankByProg(ranked);
  let nFin = 0;
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i + 1;
    if (ranked[i].finished) nFin++;
  }
  if (nFin > 1) rankFinishers();
  if (!isPractice() && !isQuali() && !realRace.owns(player)) {
    scPassCall(scWatch.tick(player, ranked, raceCtl.level, 0));
    if (session === "race" && track) {
      _blueCtx.total = track.total; _blueCtx.vRef = vTop(); _blueCtx.caution = raceCtl.level;
      blueFlagCall(blueWatch.tick(player, ranked, _blueCtx, dt));
    }
  }

  _leadHuman = null;
  for (let i = 0; i < cars.length; i++) { const c = cars[i]; if (c.human && !c.retired && !c.finished && (!_leadHuman || c.prog > _leadHuman.prog)) _leadHuman = c; }

  for (let i = 0; i < cars.length; i++) {
    const s = cars[i];
    s._snapProg = s.prog; s._snapX = s.x; s._snapSpeed = s.speed;
  }
  if (track && ranked.length) Collide.fillArcBuckets(ranked, track.total, TRAFFIC_BUCKET_M, _snapProgOf);
  RaceControl.beginLineStep(cars); pits.stepBegin();
  parked.length = 0; stillCars.length = 0;
  for (let i = 0; i < cars.length; i++) {
    const o = cars[i];
    if (o.retired) { if (o.parkedOnRoad) parked.push(o); continue; }
    o.stillT = state === "race" && !o.finished && !o.inPit && !o.inPitLane && Math.abs(o.speed) < STILL_V ? (o.stillT || 0) + dt : 0;
    if (o.stillT >= STILL_HAZARD_S) stillCars.push(o);
  }
  _windStep.st = null;
  if (aiLod) aiLod.step(cars, state === "race" && session === "race" && !isPractice() && !netPlay.active(), raceCtl.level, raceT, player, track ? track.total : 0);
  PerfSpans.begin("ai"); for (let i = 0; i < cars.length; i++) updateCar(cars[i], dt, ranked); PerfSpans.end("ai");
  pits.stepEnd();
  if (jumpStartPenalty.reactWindowOpen()) {
    for (const c of cars) jumpStartPenalty.tickReaction(c);
  }
  RaceControl.settleLineStep();

  PerfSpans.begin("collide"); let field = ranked; if (parked.length) { field = _colField; field.length = 0; for (let i = 0; i < ranked.length; i++) field.push(ranked[i]); for (let i = 0; i < parked.length; i++) field.push(parked[i]); }
  collide.resolveCollisions(field, dt); PerfSpans.end("collide");

  if (DebrisWorld.active()) {
    incidentSim.preStep(dt);
    DebrisWorld.step(dt);
  }
  incidentSim.postStep(dt);
  RaceControl.endLineStep();
  if (!isPractice() && !isQuali() && !realRace.owns(player)) scPassCall(scWatch.tick(player, ranked, raceCtl.level, dt));
  if (pendingFinishQuit && postFinishWait()) { quitToMenu(); return; }

  _s8Pres.dt += dt;
  if (_audioParamStep) {
    _s8Stamp = (_s8Stamp == null ? 0 : _s8Stamp) + 1;
    updateCaution(_s8Pres.dt); coach.update(_s8Pres.dt); raceRadio.update(_s8Pres.dt);
    _s8Pres.dt = 0;
  }

  if (raceCtl.level === 4 && !cars.some((c) => c.finished)) resultT = 0;
  else if (resultT === 0) {
    postFinish.solo = session === "race" && !netPlay.active() && !realRace.isWatch();
    resultT = RaceControl.finishDelay(cars, raceT, lapsTarget, realRace.raceT0(), postFinish);
    if (resultT === 0 && netPlay.active() && !netPlay.ownsClassification() && player && (player.finished || player.retired) && netPlay.peerResult()) resultT = 0.5;
  }
  if (resultT > 0) {
    resultT -= dt;
    if (resultT <= 0) {
      if (netPlay.awaitingResult()) resultT = 0.05;
      else { resultT = 0; RaceCeremony.want(true); G.endRace(); return; }
    }
  }

  PerfSpans.begin("audio"); if (soundOn && player && _audioParamStep) {
    const revFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
    _engArg.slip = player.slipFactor ?? 1; _engArg.ax = player.axEstSm ?? 0; _engArg.axStd = aStd(_engArg.ax);
    _engArg.onKerb = !!player.onKerb; _engArg.wet = isWetRoad(); _engArg.tow = player.towing || 0;
    _engArg.deploy = player.deploying ? 1 : 0; _engArg.energy = player.energy ?? 1;
    _engArg.ersDeploy = player.ersDeploy ?? 0.5;
    _engArg.throttle = player.throttleDemand ?? 0; _engArg.brake = player.brakeDemand ?? 0;
    _engArg.regen = player.ersRegen ?? 0.5;
    GameAudio.setEngine(revFrac, player.deploying ? 1 : 0, player.offroad,
      clamp(player.speed / vTop(), 0, 1), player.gear, _engArg);
    GameAudio.setSkid(player.skidIntensity || 0, isWetRoad());
    if (DrivingLineOpts.brakeCue() && !BrakeCue.on()) GameAudio.brakeCue(track ? DrivingLine.cue(Math.abs(player.speed), player.s) || 0 : 0);
    GameAudio.setRivals(rivalAudio.collect(player));
    if (rivalAudio.emitFieldSfx) rivalAudio.emitFieldSfx(player);
  } PerfSpans.end("audio");
  if (soundOn && player) carSfx.update(player);
}

const _aiBoost = CarFields.warmDoubles({ traits: null, energy: 0, otActive: false, kAhead60: 0, towCar: false, towGap: 0, towSpeed: 0, speed: 0, chaser: false, chaserGap: 0, chaserSpeed: 0, team: null, seat: 0, stats: null, ersDeploy: 0, ersRegen: 0, vTop: 0, trailT: 0, street: false, towVmax: 0, ourVmax: 0, ourPace: 0, towPace: 0 }, ["chaserSpeed", "trailT", "towVmax", "ourVmax", "ourPace", "towPace"]);
const _aiOtFire = CarFields.warmDoubles({ traits: null, blockerGap: 0, gapAhead: 0, roomL: 0, roomR: 0, speed: 0, aheadSpeed: 0, kAhead: 0, street: false, team: null, seat: 0, stats: null, other: null, vTop: 0, queueT: 0, blockerVmax: 0, ourVmax: 0, ourPace: 0, blockerPace: 0 }, ["blockerGap", "gapAhead", "roomL", "roomR", "speed", "aheadSpeed", "kAhead", "vTop", "queueT", "blockerVmax", "ourVmax", "ourPace", "blockerPace"]);
const AI_PASS_LATCH_M = 16;
const AI_HEAD_VMIN = 6;
const AI_XTRACK_GAIN = 2.5;
const AI_HEAD_MAX = 0.45;
const AI_HEAD_JUMP = 4;
const AI_YAW_LAT = 0.6;
const AI_YAW_MAX = 1.2;
const AI_BIAS_SLEW = 3.0;
const AI_LOOK_CAP = 64;
const _wallCtx = { track: null, dt: 0, steer: 0, postLim, smp, wrapS, worldFromTrack, soundOn: false, incidentSim, vStd, addShake(d) { feel.shake = Math.min(1, feel.shake + d); } };
const _blueCtx = { total: 0, vRef: 0, caution: 0, race: true };
const _aiBr = CarFields.warmDoubles({ traits: null, samples: null, latMax: 0, aeroLoad: 0, brake: 0, grip: 0, speed: 0, blocker: false, blockerGap: 0, blockerSpeed: 0, roomL: 0, roomR: 0, team: null, seat: 0, stats: null, errMul: 1, diffCorner: 0, pace: 0, vmax: 0 }, ["errMul", "diffCorner", "pace", "vmax"]);
const _aiLane = CarFields.warmDoubles({ traits: null, nearby: 0, roomL: 0, roomR: 0, street: false, baseLane: 0, queueT: 0 }, ["queueT"]);
const _aiWantX = { armed: true, team: null, seat: 0, stats: null, energy: 0, catching: false, otActive: false };
const _pfCtx = { dt: 0, driverDelta: 0, assistDelta: 0, lineDelta: 0, onThrottle: false, throttleLvl: 0, gearMult: 0, deploy: 0, braking: false, axTarget: 0,
  surfaceMu: 0, kerbGrip: 0, bankMu: 0, modsCornering: 0, modsBraking: 1, loadF: 0, loadR: 0, vertLoad: 0, af: 0, ar: 0, sp: 0, steer: 0,
  weatherGrip: 0, aeroDf: 0, dirtyMul: 0, coastCut: 0, vTopNow: 0, tyres: null, damage: null };
const _aiOtPull = CarFields.warmDoubles({ street: false, traits: null, speed: 0, team: null, seat: 0, stats: null, blockerSpeed: 0, blockerGap: 0, roomL: 0, roomR: 0, other: null, kAhead: 0, lane: 0, freeSpeed: 0, blockerVmax: 0, vTop: 0, blockerAccel: 0, attackQ: 0, toTurnIn: 0, kTurn: 0, calm: 0, roll: 0.5, queueT: 0, trailT: 0, roadL: 0, roadR: 0, ourVmax: 0, ourPace: 0, blockerPace: 0 }, ["freeSpeed", "queueT", "kTurn", "trailT", "roadL", "roadR", "ourVmax", "ourPace", "blockerPace"]);
const _aiDefend = CarFields.warmDoubles({ street: false, traits: null, speed: 0, team: null, seat: 0, stats: null, chaser: false, chaserGap: 0, chaserSpeed: 0, kA: 0, roomL: 0, roomR: 0, other: null, blocker: null, blockerGap: 0, kTurn: 0, toTurnIn: 0, roadL: 0, roadR: 0, x: 0, vTop: 0, chaserVmax: 0, ourVmax: 0, chaserPace: 0, ourPace: 0 }, ["speed", "chaserGap", "chaserSpeed", "kA", "roomL", "roomR", "x", "vTop", "blockerGap", "kTurn", "toTurnIn", "roadL", "roadR", "chaserVmax", "ourVmax", "chaserPace", "ourPace"]);
const _aiBoxed = { contactT: 0, roomL: 0, roomR: 0, blocker: null, blockerGap: 0, street: false };
const _aiDefOnce = { defend: 0, side: 0 };
const LCAR = Collide.LCAR, WCAR = Collide.WCAR;
const TRAFFIC_BUCKET_M = TOW_RANGE;
function _snapProgOf(c) { return c._snapProg; }
function _otSkipLane(o) { return pits.inLane(o); }
const _floodRGB = [0, 0, 0];
const _alRGB = [0, 0, 0];
function collideFx(a, b, impact) {
  Damage.contact(a, b, impact, track.total);
  if (!a.isPlayer && !b.isPlayer) {
    if (soundOn && state === "race" && !paused && GameAudio.fieldContact) {
      const wx = (a.px != null && b.px != null) ? (a.px + b.px) * 0.5 : (a.px != null ? a.px : b.px);
      const wz = (a.pz != null && b.pz != null) ? (a.pz + b.pz) * 0.5 : (a.pz != null ? a.pz : b.pz);
      const ia = cars.indexOf(a), ib = cars.indexOf(b), key = ia >= 0 && ib >= 0 ? (ia < ib ? ia * 64 + ib : ib * 64 + ia) : (ia >= 0 ? ia : ib);
      GameAudio.fieldContact("bump", impact, wx, wz, key);
    }
    return;
  }
  const pc = a.isPlayer ? a : b;
  if (pc.collideT > 0) return;
  impact = clamp(impact, 0.12, 1);
  if (soundOn) {
    const other = a.isPlayer ? b : a;
    const lat = (other.x != null ? other.x : 0) - (pc.x != null ? pc.x : 0);
    const side = Math.abs(lat) > 0.08 ? Math.max(-1, Math.min(1, lat / 3.5)) : 0;
    GameAudio.collision(impact, false, side);
  }
  feel.shake = Math.min(1, feel.shake + impact * 0.45);
  feel.hitStop = Math.max(feel.hitStop, impact * 0.015);
  pc.collideT = 0.35;
  pc.hits = (pc.hits | 0) + 1;
  pc.hitSev = Math.max(pc.hitSev || 0, impact);
  pc.fxSparkI = Math.max(pc.fxSparkI || 0, impact);
  Input.vibrate(18 + impact * 50);
  Input.rumble(0.4 + impact * 0.6, 120, "handles");
}

const _ucS = CarFields.warmDoubles({ recordInput: null, tyreGrip: 0.5, vT: 0, inp: 0, roomL: 0, roomR: 0, unstuckActive: 0, queued: 0, aiT: 0, braking: 0, hw: 0, slopeSin: 0, k: 0, mods: 0, gmC: 0, perfMul: 0, vmax: 0, alongO: 0, alongDx: 0, deploy: 0, throttleLvl: 0, gearMult: 0, surfaceMu: 0, brakeDecel: 0, onThrottle: 0, steer: 0, gripScale: 0, latFac: 0, kerbGrip: 0, bankMu: 0, dd: 0, blocker: 0, blockerGap: 0, letPass: 0, aiFreeSpeed: 0, squeezed: 0, roadL: 0, roadR: 0, alongDprog: 0, chaser: 0, chaserGap: 0, nearbyN: 0, sep: 0, slopeNose: 0, trMul: 0, gm0: 0, pitV: 0, cautionV: 0, otFree: 0, brakeLvl: 0, accelCeil: 0, towCar: 0, towGap: 0, pvA: 0, pvB: 0 }, ["alongDx", "alongDprog", "sep", "surfaceMu", "pitV", "aiFreeSpeed", "brakeLvl", "pvA", "pvB"]);
const _windStep = { st: null };
const _bandCtx = { leadProg: 0.5, carProg: 0.5, trackTotal: 0.5, raceT: 0.5, launchT0: 0.5, bandAuth: 0.5 }, _bandOut = { vmax: 0.5, bandNow: 0.5 };
const aiLod = (() => { try { return new URLSearchParams(location.search).get("lab").split(",").includes("aiLod") ? AiDrive.lodLab() : null; } catch (_) { return null; } })();
const _ttRec = { native: false, initialState: undefined, boost: undefined, overtake: undefined, aeroToggle: undefined, shiftUp: undefined, shiftDown: undefined, steer: undefined, throttle: undefined, brake: undefined, throttleLevel: undefined, brakeLevel: undefined, aero: undefined };
function updateCar(c, dt, ranked) {
  const S = _ucS;
  if (isTimeTrial() && c.isPlayer && !c.retired && !c.finished) {
    const r = _ttRec; r.native = !inputOf(c); r.initialState = r.boost = r.overtake = r.aeroToggle = r.shiftUp = r.shiftDown = r.steer = r.throttle = r.brake = r.throttleLevel = r.brakeLevel = r.aero = undefined;
    S.recordInput = r;
  } else S.recordInput = null;
  if (S.recordInput && InputGhost.needsState()) {
    const state = {};
    for (const key of Object.keys(c)) if ((typeof c[key] === "number" && Number.isFinite(c[key])) || ["boolean", "string"].includes(typeof c[key]) || c[key] === null) state[key] = c[key];
    S.recordInput.initialState = { car: state, seed: simSeed(), rngState: simSeed(undefined, true), raceT: raceT - dt };
  }
  if (c.retired) { c._prevS = c.s; c.skidIntensity = c.wheelLock = c.brakeDemand = c.throttleDemand = c.towing = c.wake = 0; c.deploying = false; c.collideT = Math.max(0, c.collideT - dt); return; }
  if (c.finished && !netPlay.owns(c)) { pits.update(c, dt); if (c === player && cooldownDrives()) cooldownDrive(c, dt); else coast(c, dt); c.rpm = rpmFor(c.gear || 1, Math.max(0, c.speed || 0)); c._prevS = c.s; c.skidIntensity = c.wheelLock = c.brakeDemand = c.throttleDemand = c.towing = c.wake = 0; c.deploying = false; c.collideT = Math.max(0, c.collideT - dt); return; }
  if (incidentSim.owns(c)) { c.rpm = rpmFor(c.gear || 1, Math.max(0, c.speed || 0)); c._prevS = c.s; return; }
  if (netPlay.owns(c)) { c.rpm = rpmFor(c.gear || 1, Math.max(0, c.speed || 0)); c._prevS = c.s; return; }
  if (realRace.owns(c)) { const v = Math.max(0, c.speed || 0) * (c.replayRate || 1); c.rpm = rpmFor(naturalGear(v), v); c._prevS = c.s; return; }
  Tracks.sample(track, c.s, smp);
  const hw = smp.hw;
  const slopeSin = smp.t[1] || 0;
  const slopeNose = c.human && Math.cos(Math.atan2(smp.t[0], smp.t[2]) - (c.head || 0)) < 0 ? -slopeSin : slopeSin;
  const k = Tracks.curvature(track, c.s);
  c.kCur = k;
  const dd = DIFF[difficulty] || DIFF.normal;
  const mods = c.mods || NEUTRAL_MODS;
  tyres.update(c, dt);
  pits.update(c, dt);
  if (c.local) { _engAcc.dt += dt; if (_audioParamStep) { engineer.update(c, _engAcc.dt); _engAcc.dt = 0; } }
  const aq = TyreModel.aquaInto(c, vStd(Math.abs(c.speed)), raceWeather, wxArc ? wxArc.wetnessAt(c.s, c.x) : trackWetness());
  const vT = vTop(), tyreGrip = tyres.gripMul(c), trMul = 1 - (1 - tyreGrip) * TyreModel.LONG_SHARE, gmC = gripMult(c) * aq.mul, gm0 = gripMult();
  const perfMul = trMul * tyres.fuelAccelMul(c);
  const inp = inputOf(c);


  let vmax = VMAX * driveTune.PACE * (c.human ? mods.speed : c.tierV * c.skill * dd.ai);
  vmax *= Wind.carInto(_windStep.st || (_windStep.st = Wind.sync(simSeed(), raceWeather, track.def && track.def.id, raceT)), c.human ? (c.head || 0) : Math.atan2(smp.t[0], smp.t[2]) - (c.aiHead || 0), vStd(Math.abs(c.speed))).vmaxMul;
  if (!c.human && aq.safeV < Infinity) vmax = Math.min(vmax, aq.safeV * vT / VMAX);
  if (!c.human && _leadHuman && AiBand.mode() === "catchup") {
    const bc = _bandCtx; bc.leadProg = _leadHuman.prog; bc.carProg = c.prog; bc.trackTotal = track.total; bc.raceT = raceT; bc.launchT0 = launchT0; bc.bandAuth = dd.band;
    const applied = AiBand.applyVmax(vmax, AiBand.factor(bc), c.tierV * c.skill * dd.ai, BAND_CEIL, _bandOut);
    vmax = applied.vmax; c._bandNow = applied.bandNow;
  } else c._bandNow = 0;
  let pitV = -1;
  if (pits.inLane(c)) {
    pitV = pits.limit();
    if (!c.human) pitV = Math.min(pitV, pits.approachV(c));
    vmax = Math.min(vmax, pitV);
  } else if (!c.human && c.pitArmed) {
    pitV = pits.entryV(c);
    vmax = Math.min(vmax, pitV);
  } else if (!c.human && c.pitState === "out") {
    pitV = pits.exitV(c);
    vmax = Math.min(vmax, pitV);
  }
  let cautionV = -1;
  if (raceCtl) {
    const lvl = raceCtl.level;
    if (lvl >= 2) cautionV = vmax = Math.min(vmax, vTop() * (lvl >= 4 ? 0.02
      : lvl === 3 ? RaceControl.scQueueFrac(c, cars, track.total, ranked[0], vTop(), pits.inLane) : 0.6));
    if ((lvl === 2 || lvl === 3) && !c.human && !(c.pitState && c.pitState !== "none")) {
      const h = RaceControl.holdCap(c, ranked, cautionFair);
      if (h < cautionV) cautionV = vmax = h;
    }
  }

  let roomL = Infinity, roomR = Infinity, blocker = null, blockerGap = Infinity, unstuckActive = false, letPass = false, aiFreeSpeed = 0, squeezed = false, roadL = Infinity, roadR = Infinity, queued = false;
  let alongO = null, alongDx = 0, alongDprog = 0, alongAdx = Infinity;
  let towCar = null, towGap = Infinity;
  let chaser = null, chaserGap = Infinity;
  let nearbyN = 0, sep = 0;
  const aiT = c.human ? null : AiDrive.traits(c);
  if (!c.human) vmax *= AiDrive.pacePhase(raceT, aiT.consistency, c.phaseRoll) * AiDrive.trailStep(c, c.rank > 1 ? ranked[c.rank - 2] : null, state === "race" && session === "race" && !isPractice() && pitV < 0 && raceCtl.level < 2, !!track.street, dt);
  if (!c.human && tyres.on() && state === "race") pits.think(c);
  if (!c.human && AiDrive.mistakePhase(c.errT) === 2) vmax *= AiDrive.mistakeGatherMul();
  if (!c.human && c.tyreClass) {
    vmax *= tyres.on() ? (1 + (c.tyre ? c.tyre.off : 0)) * trMul
                       : AiDrive.tyrePace(c.tyreClass, Math.max(0, c.lap - 1));
  } else if (c.human) vmax *= trMul;
  vmax *= tyres.fuelVmaxMul(c);
  if (!c.human) {
    const edge = track.street ? hw - 0.8 : hw + 5;
    roadL = c.x + hw - 0.5; roadR = hw - 0.5 - c.x;
    roomL = edge + c.x;
    roomR = edge - c.x;
    const L = track.total;
    const BACK = AiDrive.mirrorReach(aiT, c.speed), REJ = Math.max(34.1, BACK + 0.1);
    const MIN_GAP = AiDrive.minLatGap(hw, !!track.street);
    const ts = Collide.scanTraffic(c, L, BACK, REJ, MIN_GAP, !!track.street, roomL, roomR);
    roomL = ts.roomL; roomR = ts.roomR; nearbyN = ts.nearbyN; sep = ts.sep;
    blocker = ts.blocker; blockerGap = ts.blockerGap; towCar = ts.towCar; towGap = ts.towGap;
    chaser = ts.chaser; chaserGap = ts.chaserGap;
    alongO = ts.alongO; alongDx = ts.alongDx; alongDprog = ts.alongDprog; alongAdx = ts.alongAdx;
    _aiBoxed.contactT = c.contactT; _aiBoxed.roomL = roomL; _aiBoxed.roomR = roomR;
    _aiBoxed.blocker = blocker; _aiBoxed.blockerGap = blockerGap; _aiBoxed.street = !!track.street;
    const boxed = AiDrive.isBoxed(_aiBoxed);
    if (state === "race" && vStd(c.speed) < 7 && boxed && raceCtl.level < 4) c.stuckT = (c.stuckT || 0) + dt;
    else c.stuckT = Math.max(0, (c.stuckT || 0) - dt * 1.5);
    unstuckActive = c.stuckT > AiDrive.stuckThreshold(aiT);
    const letPassCase = AiDrive.letPassCase(state === "race", blocker, chaser, chaserGap, chaser ? chaser._snapSpeed : 0,
      c.speed, vT / VMAX, !!chaser && chaser._snapProg - c.prog > track.total * 0.5);
    if (letPassCase) c.letPassT = (c.letPassT || 0) + dt;
    else c.letPassT = Math.max(0, (c.letPassT || 0) - dt * 1.5);
    if (AiDrive.trailYieldStep(c, ranked[c.rank], !!track.street)) { letPass = true; vmax *= AiDrive.trailYieldEase(c._trYT, aiT); } else letPass = (c.letPassT || 0) > AiDrive.letPassDelay(aiT);
    if (alongO && alongO === c._alPrev && c._alPrevDp < 0 && alongDprog >= 0) { c.passFailOf = alongO; c.passFailT = Math.max(c.passFailT || 0, AiDrive.repassLock(aiT, (vmax - paceVmax(alongO)) / vT)); }
    c._alPrev = alongO; c._alPrevDp = alongDprog;
  }

  let deploy = 0;
  const boostToggle = c.isPlayer && !!(EnergyPlan.toggleFor(c, isTimeTrial()) | Input.consumeBoostToggle());
  if (S.recordInput) S.recordInput.boost = !!boostToggle;
  if (boostToggle) c.boostOn = !c.boostOn && c.energy > 0;
  const pitHeld = pits.held(c);
  const ersHeld = pitHeld || cautionV >= 0 || c.pitState === "box"; let aiWantsBoost = false;
  S.pvA = paceVmax(c);
  if (!c.human && c.energy > 0.02 && !ersHeld) {
    _aiBoost.traits = aiT; _aiBoost.energy = c.energy; _aiBoost.otActive = c.otT > 0;
    _aiBoost.kAhead60 = Tracks.curvature(track, wrapS(c.s + 60));
    _aiBoost.towCar = !!towCar; _aiBoost.towGap = towGap; _aiBoost.towSpeed = towCar ? towCar._snapSpeed : 0; _aiBoost.speed = c.speed;
    _aiBoost.chaser = !!chaser; _aiBoost.chaserGap = chaserGap; _aiBoost.chaserSpeed = chaser ? chaser._snapSpeed : 0;
    _aiBoost.team = c.team; _aiBoost.seat = c.seat; _aiBoost.stats = c.houseStats;
    _aiBoost.ersDeploy = c.ersDeploy; _aiBoost.ersRegen = c.ersRegen; _aiBoost.vTop = vT; _aiBoost.trailT = c.trailT || 0;
    _aiBoost.street = !!track.street; _aiBoost.towVmax = towCar ? paceVmax(towCar) : 0;
    _aiBoost.ourVmax = S.pvA; _aiBoost.ourPace = scriptPace(c); _aiBoost.towPace = towCar ? scriptPace(towCar) : 0;
    aiWantsBoost = AiDrive.wantBoost(_aiBoost);
  }
  const wantBoost = ((c.human ? c.boostOn : aiWantsBoost) && !ersHeld)
    ;
  let otFree = false;


  const otSpeed = Math.max(0, c.speed);
  let ahead = null, gapAhead = Infinity; const otL = track.total, otW = OT_GAP * otSpeed + 1;
  if (c._otLap == null || c._otS == null) { c._otLap = c.lap | 0; c._otS = c.s; }
  const otOpen = raceCtl.otDetectOpen();
  const otNeedAhead = (c.otE > 0 || c.otOn) ||
    (!!track && otOpen && OvertakeMode.crossed(c._otS, c.s, OvertakeMode.detectS(track), otL));
  if (otNeedAhead) {
    const ot = Collide.scanOtAhead(c, otL, otW, _otSkipLane);
    ahead = ot.ahead; gapAhead = ot.gapAhead;
  }
  gapAhead = ahead && c.speed > 1 ? gapAhead / c.speed : Infinity;
  OvertakeMode.lines(c, track, gapAhead, otOpen && !pitHeld);
  const otGate = otEnabled() && !c.finished && !pitHeld, otFast = vStd(c.speed) > OT_MIN_SPEED;
  OvertakeMode.arm(c, otGate, otFast);
  const fire = c.human ? (c.local ? Input.consumeOvertake() : !!inp.overtake)
                      : (c.otArmed && raceCtl.level < 2 && gapAhead < OT_GAP && (_aiOtFire.traits = aiT,
                          _aiOtFire.blockerGap = blocker ? blockerGap : gapAhead * (c.speed || 1),
                          _aiOtFire.gapAhead = gapAhead * (c.speed || 1),
                          _aiOtFire.roomL = roomL, _aiOtFire.roomR = roomR, _aiOtFire.speed = c.speed, _aiOtFire.vTop = vT,
                          _aiOtFire.aheadSpeed = blocker ? blocker._snapSpeed : (ahead ? ahead._snapSpeed : c.speed),
                          _aiOtFire.kAhead = Tracks.curvature(track, wrapS(c.s + 40)),
                          _aiOtFire.street = !!track.street, _aiOtFire.team = c.team, _aiOtFire.seat = c.seat,
                          _aiOtFire.stats = c.houseStats, _aiOtFire.other = blocker,
                          _aiOtFire.queueT = c.queueT || 0,
                          _aiOtFire.blockerVmax = blocker ? paceVmax(blocker) : (ahead ? paceVmax(ahead) : 0),
                          _aiOtFire.ourVmax = S.pvA, _aiOtFire.ourPace = scriptPace(c),
                          _aiOtFire.blockerPace = blocker ? scriptPace(blocker) : (ahead ? scriptPace(ahead) : 0),
                          AiDrive.otShouldFire(simRnd(), dt, _aiOtFire)));
  if (S.recordInput) S.recordInput.overtake = !!fire;
  if (OvertakeMode.prepare(c, fire, otGate, otFast, otTimeFor(c)) && c.isPlayer && soundOn) GameAudio.deployBoost();
  otFree = c.otT > 0;
  if (otFree || (wantBoost && c.energy > 0)) deploy = DEPLOY_A * Math.max(driveTune.PACE, 0.05) * deployTaper(c);
  if (c.isPlayer && c.otArmed && !c.wasArmed && soundOn) GameAudio.overtakeReady();
  c.wasArmed = c.otArmed;

  let braking; let brakeLvl; let throttleLvl; S.tyreGrip = tyreGrip; S.hw = hw; S.dd = dd; S.vT = vT; S.trMul = trMul; S.gmC = gmC; S.gm0 = gm0; S.inp = inp; S.vmax = vmax; S.pitV = pitV; S.roomL = roomL; S.roomR = roomR; S.blocker = blocker; S.blockerGap = blockerGap; S.unstuckActive = unstuckActive; S.letPass = letPass; S.aiFreeSpeed = aiFreeSpeed; S.squeezed = squeezed; S.roadL = roadL; S.roadR = roadR; S.queued = queued; S.alongO = alongO; S.alongDx = alongDx; S.alongDprog = alongDprog; S.towCar = towCar; S.towGap = towGap; S.aiT = aiT;
  updateCarBrakePlan(c, dt, ranked, S); vmax = S.vmax, aiFreeSpeed = S.aiFreeSpeed, squeezed = S.squeezed, queued = S.queued, braking = S.braking, brakeLvl = S.brakeLvl, throttleLvl = S.throttleLvl;

  c.xArmed = !c.offroad && !braking && vStd(c.speed) > X_MIN_SPEED
    && !c.finished && !pitHeld && state === "race" && inAeroZone(c);
  if (c.human && raceAeroMode === "auto") {
    c.xOn = c.xArmed;
  } else if (c.human) {
    if (c.local) { const toggle = Input.consumeAeroToggle(); if (S.recordInput) S.recordInput.aeroToggle = !!toggle; if (toggle) c.xOn = !c.xOn; }
    else c.xOn = !!(inp && inp.aero);
  } else {
    _aiWantX.armed = true; _aiWantX.team = c.team; _aiWantX.seat = c.seat; _aiWantX.stats = c.houseStats;
    _aiWantX.energy = c.energy; _aiWantX.catching = !!(towCar && towGap < 28); _aiWantX.otActive = c.otT > 0;
    c.xOn = c.xArmed && AiDrive.wantX(_aiWantX);
  }
  {
    const want = (c.xOn && c.xArmed) ? 1 : 0;
    if (c.human && c.local && soundOn && want !== (c._xSndWant ?? 0)) {
      GameAudio.xMode(want === 1);
      c._xSndWant = want;
    }
    const rate = want > (c.aeroX || 0) ? X_OPEN_RATE : X_CLOSE_RATE;
    c.aeroX = clamp((c.aeroX || 0) + Math.sign(want - (c.aeroX || 0)) * rate * dt,
                    Math.min(c.aeroX || 0, want), Math.max(c.aeroX || 0, want));
    if (!c.xArmed) c.xOn = false;
  }
  vmax *= 1 + xVmaxGain(c) * c.aeroX;
  c._vmaxNow = vmax;
  if (state === "race" && cautionLevel() < 2 && !pits.inLane(c)) AiDrive.paceSample(paceRef(), Math.floor(c.s / track.total * track.n) % track.n, c, vmax, !blocker || blockerGap > 30, dt);

  let gearMult = 1, accelCeil = vmax + 14 * Math.max(driveTune.PACE, 0.05);
  if (!c.human && aq.safeV < Infinity) accelCeil = Math.min(accelCeil, aq.safeV * vT / VMAX);
  if (c.human) {
    c.shiftT = Math.max(0, c.shiftT - dt);
    const up = c.local ? Input.consumeShiftUp() : !!inp.shiftUp,
          down = c.local ? Input.consumeShiftDown() : !!inp.shiftDown;
    if (S.recordInput) { S.recordInput.shiftUp = !!up; S.recordInput.shiftDown = !!down; }
    if (gearsManual()) {
      if (up && c.gear < GEARS && c.shiftT <= 0) { c.gear++; c.shiftT = 0.1; if (soundOn && c.local) GameAudio.shift(true); }
      if (down && c.gear > 1 && c.shiftT <= 0) { c.gear--; c.shiftT = 0.1; if (soundOn && c.local) GameAudio.shift(false); }
      const hi = gearHi(c.gear), lo = gearLo(c.gear);
      const frac = (c.speed - lo) / Math.max(hi - lo, 1);
      if (c.speed >= hi && c.gear < GEARS) { gearMult = 0.08; accelCeil = Math.min(accelCeil, hi + 1.5); }
      else if (frac < 0.25) gearMult = clamp(0.7 + frac * 1.2, 0, 1);
      if (c.speed < 0) gearMult = Math.max(gearMult, 0.7);
    }
  }

  let surfaceMu; let brakeDecel; let onThrottle; S.hw = hw; S.slopeSin = slopeSin; S.slopeNose = slopeNose; S.mods = mods; S.trMul = trMul; S.gmC = gmC; S.gm0 = gm0; S.perfMul = perfMul; S.inp = inp; S.vmax = vmax; S.pitV = pitV; S.cautionV = cautionV; S.deploy = deploy; S.otFree = otFree; S.braking = braking; S.brakeLvl = brakeLvl; S.throttleLvl = throttleLvl; S.gearMult = gearMult; S.accelCeil = accelCeil;
  updateCarLongitudinal(c, dt, ranked, S); deploy = S.deploy, surfaceMu = S.surfaceMu, brakeDecel = S.brakeDecel, onThrottle = S.onThrottle;
  const ri = S.recordInput; if (ri) { ri.throttle = onThrottle; ri.brake = !!braking; ri.throttleLevel = throttleLvl; ri.brakeLevel = brakeLvl; ri.aero = !!c.xOn; }

  let steer, gripScale; let latFac; let kerbGrip; let bankMu; S.hw = hw; S.k = k; S.dd = dd; S.vT = vT; S.inp = inp; S.vmax = vmax; S.roomL = roomL; S.roomR = roomR; S.blocker = blocker; S.blockerGap = blockerGap; S.unstuckActive = unstuckActive; S.letPass = letPass; S.aiFreeSpeed = aiFreeSpeed; S.squeezed = squeezed; S.roadL = roadL; S.roadR = roadR; S.alongO = alongO; S.alongDx = alongDx; S.alongDprog = alongDprog; S.chaser = chaser; S.chaserGap = chaserGap; S.nearbyN = nearbyN; S.sep = sep; S.aiT = aiT; S.braking = braking;
  updateCarLateral(c, dt, ranked, S); steer = S.steer, gripScale = S.gripScale, latFac = S.latFac, kerbGrip = S.kerbGrip, bankMu = S.bankMu;
  updateCarBicycle(c, dt, ranked, S); steer = S.steer;
  _wallCtx.track = track; _wallCtx.dt = dt; _wallCtx.steer = steer; _wallCtx.soundOn = soundOn;
  WallClamp.apply(c, _wallCtx);
  Damage.observe(c, dt, vT);
  c.brakeDemand = braking ? brakeLvl : 0; c.throttleDemand = onThrottle && !braking ? throttleLvl : 0; c.steerCommand = steer;
  c.steerVis = damp(c.steerVis, steer, 10, dt);
  let yawTarget;
  if (c.human && c.head != null) {
    let psi = Math.atan2(smp.t[0], smp.t[2]) - c.head;
    while (psi > Math.PI) psi -= 2 * Math.PI;
    while (psi < -Math.PI) psi += 2 * Math.PI;
    c.yawVis = psi;
    yawTarget = psi;
  } else {
    yawTarget = c.steerVis * 0.35 + clamp(-k * c.speed * 0.14, -0.28, 0.28);
  }
  if (!(c.human && c.head != null)) c.yawVis = damp(c.yawVis, yawTarget, 6, dt);
  {
    const heating = braking && vStd(c.speed) > 12;
    c.brakeHeat = clamp((c.brakeHeat || 0) + (heating ? dt * 1.6 : -dt * 0.9), 0, 1);
  }
  {
    const thr = c.human ? onThrottle : !braking;
    const lifted = !!c.wasOnThrottle && !thr && c.speed > 8;
    c.exhaustPop = lifted ? 1 : Math.max(0, (c.exhaustPop || 0) - dt * 5);
    c.wasOnThrottle = !!thr;
  }
  if (c.retired || c.finished) { c.towing = 0; c.wake = 0; }
  c.collideT = Math.max(0, c.collideT - dt);
  c.contactT = Math.max(0, (c.contactT || 0) - dt);

  if (S.recordInput) records.sampleInput(c, S.recordInput);
  updateCarAdvance(c, dt, ranked, S);
}
function updateCarBrakePlan(c, dt, ranked, S) {
  const hw = S.hw; const dd = S.dd; const vT = S.vT; const trMul = S.trMul; const gmC = S.gmC; const gm0 = S.gm0; const inp = S.inp; let vmax = S.vmax; const pitV = S.pitV; const roomL = S.roomL; const roomR = S.roomR; const blocker = S.blocker; const blockerGap = S.blockerGap; const unstuckActive = S.unstuckActive; const letPass = S.letPass; let aiFreeSpeed = S.aiFreeSpeed; let squeezed = S.squeezed; const roadL = S.roadL; const roadR = S.roadR; let queued = S.queued; const alongO = S.alongO; const alongDx = S.alongDx; const alongDprog = S.alongDprog; const towCar = S.towCar; const towGap = S.towGap; const aiT = S.aiT;
  let braking = false;
  let brakeLvl = 1;
  let throttleLvl = 1;
  if (c.human) {
    braking = inp ? !!inp.brake : Input.braking();
    brakeLvl = inp ? (inp.brakeLevel ?? 1) : Input.brakeLevel();
    throttleLvl = inp ? (inp.throttleLevel ?? 1) : (autoThrottle() ? 1 : Math.max(0, Input.throttleLevel()));
    c.towing = 0; c.wake = 0;
    if (track) {
      const tw = Collide.scanTow(c, track.total);
      const tc = tw.tc, tg = tw.tg;
      if (tc) c.wake = wakeOf(tg, tc._snapX - c.x);
      if (tc && !braking && Math.abs(c.steerVis || 0) < 0.12) {
        c.towing = c.wake;
        vmax *= 1 + AiDrive.towGain(!!track.street) * c.towing;
      }
    }
  } else {
    const look = clamp(c.speed * 1.7, 30, 160);
    AiDrive.beginLook();
    let kMax = 0;
    if (aiLod && aiLod.skip(c, player, pits.inLane(c), blockerGap, unstuckActive)) { braking = aiLod.braking(c); brakeLvl = aiLod.level(c); kMax = aiLod.kMax(c); } else {
    const onLine = Math.abs(TrackLine.at(track, c.s).x - c.x) < 1.5;
    const dsN = track.total / track.n;
    const directLook = look / dsN + 2 <= AI_LOOK_CAP;
    const node0 = Math.ceil(c.s / dsN), ss0 = node0 * dsN;
    const lk = c._lk || (c._lk = { node: -1, on: false, track: null, n: 0, v: new Float64Array(AI_LOOK_CAP), a: new Float64Array(AI_LOOK_CAP), b: new Float64Array(AI_LOOK_CAP), m: new Float64Array(AI_LOOK_CAP) });
    if (lk.node !== node0 || lk.on !== onLine || lk.track !== track) { lk.node = node0; lk.on = onLine; lk.track = track; lk.n = 0; }
    let lkI = 0;
    for (let ss = ss0, d = ss0 - c.s; d < look; ss += dsN, d += dsN, lkI++) {
      if (lkI < lk.n) {
        if (lk.a[lkI] > kMax) kMax = lk.a[lkI];
        if (!directLook) AiDrive.pushLook(d, lk.v[lkI], lk.b[lkI], lk.m[lkI]);
        continue;
      }
      const kk = Tracks.curvature(track, ss);
      const ak = Math.abs(kk);
      if (ak > kMax) kMax = ak;
      const lkV = onLine ? TrackLine.pathK(track, ss) : kk, lkB = Math.abs(Tracks.bankAngle(track, ss));
      const lkM = AiDrive.bankGrip(lkB);
      if (!directLook) AiDrive.pushLook(d, lkV, lkB, lkM);
      if (lkI < AI_LOOK_CAP) { lk.v[lkI] = lkV; lk.a[lkI] = ak; lk.b[lkI] = lkB; lk.m[lkI] = lkM; lk.n = lkI + 1; }
    }
    _aiBr.traits = aiT; _aiBr.samples = directLook ? AiDrive.lookWindow(lk.v, lk.m, lkI, ss0 - c.s, dsN) : AiDrive.endLook(); _aiBr.latMax = LAT_MAX; _aiBr.diffCorner = Math.min(1, dd.corner * (1 + (c._bandNow || 0))) * (c._trYT ? AiDrive.trailYieldCorner(c._trYT) : 1);
    _aiBr.aeroLoad = c.aeroLoad; _aiBr.brake = BRAKE * trMul * (gmC / gm0); _aiBr.pace = driveTune.PACE; _aiBr.vmax = VMAX;
    _aiBr.grip = gmC * S.tyreGrip * dirtyAirMul(c.wake || 0, c.speed);
    _aiBr.speed = c.speed; _aiBr.blocker = !!blocker; _aiBr.blockerGap = blockerGap;
    _aiBr.blockerSpeed = blocker ? blocker._snapSpeed : 0;
    _aiBr.roomL = roomL; _aiBr.roomR = roomR; _aiBr.team = c.team; _aiBr.seat = c.seat; _aiBr.stats = c.houseStats;
    _aiBr.errMul = AiDrive.mistakePhase(c.errT) === 1 ? AiDrive.mistakeBrakeMul() : 1;
    const br = AiDrive.brakeDecision(_aiBr);
    braking = br.braking;
    brakeLvl = br.brakeLvl;
    if (aiLod) aiLod.put(c, braking, brakeLvl, kMax);
    }
    c.wake = towCar ? wakeOf(towGap, towCar._snapX - c.x) : 0;
    c.towing = (towCar && !braking && kMax < 0.006) ? c.wake : 0;
    if (c.towing > 0) {
      const towH = AiDrive.hungerOf(!!track.street, aiT, vT, c.queueT || 0, paceVmax(towCar), S.pvA, scriptPace(towCar), scriptPace(c));
      vmax *= 1 + AiDrive.towGain(!!track.street, towH) * c.towing;
    }
    if (pitV >= 0) vmax = Math.min(vmax, pitV);
    const followR = blocker ? AiDrive.followGap(aiT, !!track.street, c.speed, c.passOf || c.atkOn || c.towing > 0 ? 1 : c.atkWant ? 0.6 : 0, c.team, c.seat, blocker, c.houseStats, (c.runT || 0) + AiDrive.startGapT(c.calm = AiDrive.startCalm(c.launchOn, c.calmUntil, raceT))) : 0;
    const qWin = AiDrive.queueReach(Math.max(16, followR + 6), c.speed, blocker ? blocker._snapSpeed : 0, BRAKE, vT / VMAX);
    const capBlocks = blocker && blockerGap < qWin &&
      !(blocker === c.passOf && Math.abs(c.x - blocker._snapX) >= 1.8);
    if (blocker && blockerGap < qWin) aiFreeSpeed = vmax;
    c.queueT = AiDrive.queueTime(c.queueT, capBlocks && blocker === c._qOf && cautionLevel() < 2, dt); c._qOf = capBlocks ? blocker : null;
    if (capBlocks) {
      queued = pits.inLane(blocker);
      const onLane = queued && pits.held(c);
      const follow = onLane ? AiDrive.laneFollow() : followR;
      const q = blocker._snapSpeed + clamp(blockerGap - follow, -6, 8);
      const crawl = onLane ? 0 : Math.min(AiDrive.queueFloor(!!track.street) * Math.max(driveTune.PACE, 0.05), vmax);
      vmax = Math.min(vmax, Math.max(q, crawl));
      const qb = AiDrive.queueBrake(c.speed, blocker._snapSpeed, !!track.street, blockerGap, follow, BRAKE, vT / VMAX);
      if (qb) { braking = true; brakeLvl = qb; }
    }
    if (letPass && !c._trYT) vmax *= AiDrive.letPassEase(aiT);
    if (alongO && c.sbsT > AiDrive.SBS_COMMIT_MIN) {
      const sb = AiDrive.sbsArgs(!!track.street, aiT, vT, alongO, S.pvA, scriptPace(c), paceVmax(alongO), scriptPace(alongO)), sbl = AiDrive.sbsLimits(sb);
      if (c.sbsT > sbl.commitT && c.passOf !== alongO && alongO._snapSpeed >= c.speed - 0.5 * vT / VMAX) vmax = Math.min(vmax, alongO._snapSpeed * sbl.ease);
    }
    squeezed = (c.contactT || 0) > 0 && !!alongO && AiDrive.sideYieldsA(-alongDprog, c.x, alongO._snapX, c.kTurn) &&
        (alongDx <= 0 ? Math.min(roomR, roadR) : Math.min(roomL, roadL)) < AiDrive.minLatGap(hw, !!track.street);
    if (squeezed) {
      vmax = Math.min(vmax, alongO._snapSpeed * AiDrive.squeezeEase(!!track.street));
      if (!unstuckActive) { braking = true; brakeLvl = Math.max(brakeLvl, AiDrive.squeezeBrake()); }
    }
    if (unstuckActive) { braking = false; brakeLvl = 0; }
  }
  S.vmax = vmax; S.aiFreeSpeed = aiFreeSpeed; S.squeezed = squeezed; S.queued = queued; S.braking = braking; S.brakeLvl = brakeLvl; S.throttleLvl = throttleLvl;
}
function updateCarLongitudinal(c, dt, ranked, S) {
  const hw = S.hw; const slopeSin = S.slopeSin; const slopeNose = S.slopeNose; const mods = S.mods; const trMul = S.trMul; const gmC = S.gmC; const gm0 = S.gm0; const perfMul = S.perfMul; const inp = S.inp; const vmax = S.vmax; const pitV = S.pitV; const cautionV = S.cautionV; let deploy = S.deploy; const otFree = S.otFree; const braking = S.braking; const brakeLvl = S.brakeLvl; const throttleLvl = S.throttleLvl; const gearMult = S.gearMult; const accelCeil = S.accelCeil;
  c.onKerb = Tracks.onKerb(track, c.s, c.x) > 0;
  c.inPitLane = Math.abs(c.x) > hw && Tracks.inPitLane(track, c.s, c.x);
  c.offroad = Math.abs(c.x) > hw && !c.onKerb && !c.inPitLane;
  const surfaceMu = c.offroad ? lerp(1, OFF_GRIP, clamp((Math.abs(c.x) - hw) / 1.5, 0, 1)) : 1;
  const roadBrake = BRAKE * trMul * (c.human ? mods.braking : 1) * (gmC / gm0);
  const grassDrag = Math.min((1 - surfaceMu) * 24, roadBrake * .75);
  const surfaceBrake = c.offroad
    ? Math.min(roadBrake * surfaceMu, Math.max(0, roadBrake * .95 - grassDrag)) : roadBrake;
  const brakeDecel = c.human && !inp ? Math.max(surfaceBrake * brakeLvl, COAST_DRAG) : surfaceBrake * brakeLvl;
  const longitudinalSpeed = c.speed;

  const wallPinned = c.human && (c.wallT || 0) > 0;
  const onThrottle = c.human
    ? (inp ? !!inp.throttle : ((autoThrottle() && !wallPinned) || Input.throttle()))
    : true;
  if (otFree) deploy *= OvertakeMode.consume(c, dt, onThrottle && !braking && deploy > 0, otTimeFor(c));
  if (!onThrottle || braking) deploy = 0;
  if (deploy > 0 && !otFree) { c.energy = Math.max(0, c.energy - drainFor(c) * dt); if (c.energy <= 0) c.boostOn = false; }
  c.deploying = deploy > 0;
  if (braking) {
    if (c.speed > 0) {
      c.speed = Math.max(0, c.speed - brakeDecel * dt);
    } else if (c.human && state === "race") {
      c.speed = Math.max(REVERSE_MAX, c.speed - REVERSE_ACCEL * surfaceMu * dt);
    }
    c.energy = Math.min(1, c.energy + regenFor(c) * 1.6 * regenSpeedK(c) * dt);
  } else if (!onThrottle) {
    const cd = COAST_DRAG * (1 - xCoastCut(c) * (c.aeroX || 0));
    if (c.speed > 0) c.speed = Math.max(0, c.speed - cd * dt);
    else if (c.speed < 0) c.speed = Math.min(0, c.speed + cd * dt);
    c.energy = Math.min(1, c.energy + regenFor(c) * regenSpeedK(c) * dt);
  } else {
    const launch = c.launchOn ? AiDrive.launchMul(raceT - launchT0, c.launch) : 1;
    if (c.launchOn && AiDrive.launchDone(raceT - launchT0, c.launch)) { c.launchOn = false; c.calmUntil = launchT0 + AiDrive.startCalmS(); }
    const a = (ACCEL * driveTune.PACE * perfMul * (c.human ? mods.accel * throttleLvl : launch) * clamp(1 - c.speed / Math.max(vmax, 1), 0, 1) * gearMult + deploy) * surfaceMu * (state === "race" ? 1 : 0);
    if (!c.human) c.accSm = damp(c.accSm ?? 0, a, 6, dt);
    c.speed = c.speed > accelCeil ? Math.max(accelCeil, c.speed - COAST_DRAG * dt)
                                 : Math.min(accelCeil, c.speed + a * dt);
    if (c.speed < vmax * 0.5 && !(deploy > 0)) c.energy = Math.min(1, c.energy + regenFor(c) * regenSpeedK(c) * dt);
  }
  if (state === "race" && slopeNose) {
    const a = clamp(-GRAVITY_SLOPE * slopeNose, -ACCEL * 0.5, ACCEL * 0.5);
    if (a < 0) {
      if (c.speed > 0) c.speed = Math.max(0, c.speed + a * dt);
    } else {
      const cap = c.human ? vmax * 1.06 : Math.min(vmax * 1.06, accelCeil);
      if (c.speed < cap && !(braking && c.speed <= a * dt)) c.speed = Math.min(cap, c.speed + a * dt);
    }
  }
  if (pitV >= 0 && c.speed > pitV) c.speed = Math.max(pitV, c.speed - BRAKE * CAUTION_BRAKE * dt);
  if (c.pitState === "box") c.speed = 0;
  if (cautionV >= 0 && c.speed > cautionV) c.speed = Math.max(cautionV, c.speed - BRAKE * CAUTION_BRAKE * dt);
  if (state === "race" && c.speed > vmax * 1.06 && slopeSin >= -0.03) {
    c.speed = Math.max(vmax * 1.06, c.speed - COAST_DRAG * 0.35 * dt);
  }
  const gearSpeed = Math.max(0, c.speed);
  if (c.human && !gearsManual()) {
    const ng = naturalGear(gearSpeed);
    if (ng !== c.gear && state === "race" && soundOn && c.local) GameAudio.shift(ng > c.gear);
    c.gear = ng;
  } else if (!c.human) c.gear = naturalGear(gearSpeed);
  c.rpm = rpmFor(c.gear, gearSpeed);

  if (c.offroad) {
    const grassFloor = GRASS_V * 0.6 * Math.max(driveTune.PACE, 0.05);
    if (c.speed > grassFloor) c.speed = Math.max(grassFloor, c.speed - grassDrag * dt);
    c.offT += dt;
    if (c.offT > 1.2) {
      c.offT = -2;
      c.cuts++;
      c.incidentInvalidLap = true;
      if (c.isPlayer && isQuali()) c.qualiCut = true;
      const priced = !isTimeTrial() && !isQuali();
      c.cutWarn = (c.cutWarn | 0) + 1;
      if (!priced) {
        if (c.cutWarn >= 4) c.cutWarn = 0;
        if (c.isPlayer) { announce("LAP INVALIDATED", 1.2, "penalty-warn"); if (soundOn) GameAudio.offtrack(); }
      } else if (c.cutWarn >= 4) {
        c.penalty += 5; Log[c.isPlayer ? "info" : "debug"]("game", "Penalty track-limits car=" + c.code + " +5s total=" + c.penalty + "s lap=" + c.lap);
        if (!c.penaltyWhy) c.penaltyWhy = "track limits"; else if (c.penaltyWhy.indexOf("track limits") < 0) c.penaltyWhy += "; track limits";
        if (c.isPlayer) { announce("+5s TRACK LIMITS PENALTY", 2, "penalty-hit"); if (soundOn) GameAudio.penalty(); }
      } else if (c.isPlayer) {
        announce("TRACK LIMITS " + c.cutWarn + "/4" + (c.cutWarn === 3 ? " — BLACK & WHITE FLAG" : ""), 1.2, "penalty-warn");
        if (soundOn) GameAudio.offtrack();
      }
    }
  } else if (c.offT !== 0) {
    c.offT = c.offT > 0 ? Math.max(0, c.offT - dt) : Math.min(0, c.offT + dt);
  }

  c.kerbGripSm = damp(c.kerbGripSm ?? 1, c.onKerb ? 0.7 : 1, 12, dt);
  if (c.kerbGripSm < 0.999) c.speed = Math.sign(c.speed) * Math.max(0, Math.abs(c.speed) - 6 * (1 - c.kerbGripSm) / 0.3 * dt);
  if (c.onKerb && c.isPlayer) c.kerbCueT = KERB_CUE_HOLD;
  if (c.isPlayer && (c.kerbCueT = Math.max(0, (c.kerbCueT || 0) - dt)) > 0) {
    feel.shake = Math.max(feel.shake, KERB_SHAKE);
    c.kerbSndT = (c.kerbSndT || 0) - dt;
    if (soundOn && c.kerbSndT <= 0) { GameAudio.rumble(); c.kerbSndT = 0.07; }
    if ((c.kerbHapT = (c.kerbHapT || 0) - dt) <= 0) { Input.vibrate(15); Input.rumble(0.25, 90, "handles"); c.kerbHapT = 0.12; }
  }

  c.corridorAccel = damp(c.corridorAccel || 0, (c.speed - longitudinalSpeed) / Math.max(dt, 1e-6), 6, dt);
  S.deploy = deploy; S.surfaceMu = surfaceMu; S.brakeDecel = brakeDecel; S.onThrottle = onThrottle;
}
function updateCarLateral(c, dt, ranked, S) {
  const hw = S.hw; const k = S.k; const dd = S.dd; const vT = S.vT; const inp = S.inp; const vmax = S.vmax; const roomL = S.roomL; const roomR = S.roomR; const blocker = S.blocker; const blockerGap = S.blockerGap; const unstuckActive = S.unstuckActive; const letPass = S.letPass; const aiFreeSpeed = S.aiFreeSpeed; const squeezed = S.squeezed; const roadL = S.roadL; const roadR = S.roadR; const alongO = S.alongO; const alongDx = S.alongDx; const alongDprog = S.alongDprog; const chaser = S.chaser; const chaserGap = S.chaserGap; const nearbyN = S.nearbyN; let sep = S.sep; const aiT = S.aiT; const braking = S.braking;
  let steer, gripScale;
  S.pvB = paceVmax(c);
  if (c.human) {
    steer = inp ? clamp(+inp.steer || 0, -1, 1) : Input.steer(dt);
    if (S.recordInput) S.recordInput.steer = steer;
  }
  else {
    _aiLane.traits = aiT; _aiLane.nearby = nearbyN; _aiLane.roomL = roomL; _aiLane.roomR = roomR;
    _aiLane.street = !!track.street; _aiLane.baseLane = c.lanePref != null ? c.lanePref : c.lane;
    _aiLane.queueT = c.queueT || 0;
    c.lane = AiDrive.adaptLane(c.lane, _aiLane, dt);
    const kA = Tracks.curvature(track, wrapS(c.s + clamp(c.speed * 0.7, 18, 70)));
    const famWant = c.passOf ? (c.passSide * -(kA >= 0 ? 1 : -1) > 0 ? 1 : -1) : (c.defendSide ? 1 : 0);
    c.aiFam = damp(c.aiFam || 0, famWant, 1.5, dt);
    const lead = clamp(c.speed * 0.3, 8, 25);
    const follow = AiDrive.lineFollow(!!track.street, AiDrive.houseStyle(c.team, c.seat, c.houseStats).hold);
    const laneX = c.lane * (hw - 1.2);
    const ln = TrackLine.at(track, wrapS(c.s + lead), c.aiFam);
    let targetX = clamp(lerp(laneX, ln.x, ln.w * follow), -(hw - 1.0), hw - 1.0);
    const ln2 = TrackLine.at(track, wrapS(c.s + lead + 4), c.aiFam);
    let tanT = (clamp(lerp(laneX, ln2.x, ln2.w * follow), -(hw - 1.0), hw - 1.0) - targetX) / 4;
    if (AiDrive.mistakePhase(c.errT) === 1 && Math.abs(kA) > 0.004) targetX = lerp(targetX, Math.sign(kA) * (hw - 0.9), 0.7);
    let overtake = 0;
    const CLEAR = AiDrive.minLatGap(hw, !!track.street);
    c.passCool = Math.max(0, (c.passCool || 0) - dt);
    c.passFailT = Math.max(0, (c.passFailT || 0) - dt);
    const _atk = TrackLine.attackAt(track, c.s);
    c.kTurn = _atk.toTurnIn < 400 ? AiDrive.cornerK(Tracks.curvature(track, wrapS(c.s + _atk.toTurnIn + 10)), Tracks.curvature(track, wrapS(c.s + _atk.toTurnIn + 30)), Tracks.curvature(track, wrapS(c.s + _atk.toTurnIn + 55))) : 0;
    const _passH = blocker ? AiDrive.hungerOf(!!track.street, aiT, vT, c.queueT || 0, paceVmax(blocker), S.pvB, scriptPace(blocker), scriptPace(c)) : 1;
    c.runT = blocker && blockerGap < 40 ? AiDrive.runExtra(k, track.attackQ ? track.attackQ[Math.floor(wrapS(c.s + _atk.toTurnIn - 2) / track.total * track.n) % track.n] : 0, c.atkWant, !!track.street, _passH) : 0;
    c.pressT = clamp((c.pressT || 0) + (chaser && chaserGap < 0.6 * Math.max(c.speed, 10) ? dt : -dt * 0.5), 0, 6);
    c.errT = Math.max(0, (c.errT || 0) - dt);
    if (_atk.toTurnIn < Math.max(c.speed, 10) * 1.2) {
      const zk = Math.round(wrapS(c.s + _atk.toTurnIn));
      if (zk !== c.zoneKey) {
        c.zoneKey = zk;
        if (!c.errT && !alongO && DriverRatings.hash32(luckSeed() + ":" + (isChampionship() ? SeasonCal.drawRound(season) : raceDrawRound) + ":" + c.gridPos + ":" + c.lap + ":" + zk) / 4294967296 < AiDrive.mistakeChance(aiT, c.pressT / 6, dd.err)) { c.errT = AiDrive.mistakeTotal(); c.errCount = (c.errCount || 0) + 1; }
      }
    } else c.zoneKey = -1;
    c.wheelLock = AiDrive.mistakePhase(c.errT) === 1 && braking ? 1 : 0;
    if (c.passOf) {
      const po = c.passOf;
      let dp = po._snapProg - c.prog;
      dp = ((dp + track.total / 2) % track.total + track.total) % track.total - track.total / 2;
      const sideRoom = c.passSide > 0 ? Math.min(roomR, roadR) : Math.min(roomL, roadL);
      if (po.finished || po.retired || cautionLevel() >= 2 || dp > AI_PASS_LATCH_M || !Number.isFinite(dp)) { c.passOf = null; }
      else if (dp < -(LCAR + 1.5)) {
        c.passOf = null;
        if (!po.human && !po.retired) {
          po.passFailOf = c;
          const poCool = AiDrive.repassLock(AiDrive.traits(po), (paceVmax(po) - S.pvB) / vT);
          if (!c.human) AiDrive.traits(c);
          po.passFailT = Math.max(po.passFailT || 0, poCool);
          if (po.passOf === c) { po.passOf = null; po.passCool = po.passFailT; }
        }
      }
      else if (AiDrive.passSideClosed(sideRoom, c.passSide * (AiDrive.passTarget(po._snapX, c.passSide, CLEAR, hw) - c.x), WCAR)) { c.passOf = null; c.passCool = AiDrive.passCooldown(aiT); }
      else if (squeezed) { c.passOf = null; c.passCool = AiDrive.passCooldown(aiT); }
      else if (_atk.toTurnIn < 6 && dp > AiDrive.sideLevel() && Math.max(aiFreeSpeed, blocker === po ? 0 : vmax) < paceVmax(po) + 0.12 * vT) { c.passOf = null; c.passCool = AiDrive.passCooldown(aiT); c.passFailOf = po; c.passFailT = 2 * AiDrive.passCooldown(aiT); }
      else {
        if (dp < c.passBest - 0.3) { c.passBest = dp; c.passT = AiDrive.passHold(aiT); }
        else c.passT -= dt;
        if (c.passT <= 0) { c.passOf = null; c.passCool = AiDrive.passCooldown(aiT); }
      }
    }
    if (blocker) {
      _aiOtPull.street = !!track.street; _aiOtPull.traits = aiT; _aiOtPull.speed = c.speed;
      _aiOtPull.team = c.team; _aiOtPull.seat = c.seat; _aiOtPull.stats = c.houseStats;
      _aiOtPull.blockerSpeed = blocker._snapSpeed; _aiOtPull.blockerGap = blockerGap;
      _aiOtPull.roomL = roomL; _aiOtPull.roomR = roomR; _aiOtPull.other = blocker; _aiOtPull.roadL = roadL; _aiOtPull.roadR = roadR;
      _aiOtPull.kAhead = kA; _aiOtPull.lane = c.lane; _aiOtPull.freeSpeed = aiFreeSpeed;
      _aiOtPull.blockerVmax = paceVmax(blocker); _aiOtPull.vTop = vT; _aiOtPull.queueT = c.queueT || 0; _aiOtPull.trailT = c._trOf === blocker ? c.trailT : 0;
      _aiOtPull.ourVmax = S.pvB; _aiOtPull.ourPace = scriptPace(c); _aiOtPull.blockerPace = scriptPace(blocker);
      _aiOtPull.blockerAccel = blocker.human ? (blocker.axEstSm || 0) : (blocker.accSm || 0);
      _aiOtPull.attackQ = _atk.q; _aiOtPull.toTurnIn = _atk.toTurnIn; _aiOtPull.kTurn = c.kTurn; _aiOtPull.calm = c.calm || 0;
      _aiOtPull.roll = AiDrive.attemptRoll(c.raceHash, c.lap, Math.round(wrapS(c.s + _atk.toTurnIn)));
      c.atkWant = AiDrive.otWant(_aiOtPull);
      const sameCar = blocker === c.passFailOf && (c.passFailT || 0) > 0;
      const moveOn = c.atkOn = raceCtl.level < 2 && !sameCar && c.atkWant && AiDrive.attackOK(_aiOtPull);
      if (!c.passOf && c.passCool <= 0 && moveOn && blockerGap <= AI_PASS_LATCH_M && AiDrive.latchLate(_aiOtPull)) {
        const side = AiCorridor.choose(_aiOtPull, c, blocker, cars, track.total, CLEAR, c.passPlan || (c.passPlan = {})).side;
        if (side && (side > 0 ? Math.min(roomR, roadR) : Math.min(roomL, roadL)) >= CLEAR) {
          c.passOf = blocker; c.passSide = side; c.passBest = blockerGap; c.passT = AiDrive.passHold(aiT);
        }
      }
      if (!c.passOf) overtake = moveOn && AiCorridor.planAllows(c.passPlan, blocker) ? AiDrive.otPull(_aiOtPull) : 0;
    }
    else c.atkOn = c.atkWant = false;
    if (c.passOf && raceCtl.level >= 2) c.passOf = null;
    if (c.passOf) overtake = AiDrive.passTarget(c.passOf._snapX, c.passSide, CLEAR, hw) - targetX;
    let yieldPull = 0;
    if (letPass) {
      const freeSide = c._trYT ? c._trYS : AiDrive.letPassSide(roomL, roomR, chaser ? c.x - chaser._snapX : 0);
      const freeRoom = freeSide > 0 ? roomR : roomL;
      if (freeRoom > 1.6) yieldPull = freeSide * AiDrive.letPassPull(aiT, !!track.street) * clamp(freeRoom / 2.4, 0, 1);
    }
    let defend = 0;
    const caution = raceCtl.level >= 2;
    if (chaser && !caution && (!blocker || chaserGap < blockerGap) && !letPass && !c.passOf) {
      _aiDefend.street = !!track.street; _aiDefend.traits = aiT; _aiDefend.speed = c.speed;
      _aiDefend.team = c.team; _aiDefend.seat = c.seat; _aiDefend.stats = c.houseStats;
      _aiDefend.chaser = true; _aiDefend.chaserGap = chaserGap; _aiDefend.chaserSpeed = chaser._snapSpeed;
      _aiDefend.kA = kA; _aiDefend.roomL = roomL; _aiDefend.roomR = roomR; _aiDefend.other = chaser; _aiDefend.x = c.x; _aiDefend.vTop = vT;
      _aiDefend.blocker = blocker; _aiDefend.blockerGap = blockerGap; _aiDefend.kTurn = c.kTurn; _aiDefend.toTurnIn = _atk.toTurnIn; _aiDefend.roadL = roadL; _aiDefend.roadR = roadR;
      _aiDefend.chaserVmax = paceVmax(chaser); _aiDefend.ourVmax = S.pvB;
      _aiDefend.chaserPace = scriptPace(chaser); _aiDefend.ourPace = scriptPace(c); defend = AiDrive.defendPull(_aiDefend);
    }
    if (braking || caution) { c.defendSide = 0; defend = 0; }
    else { AiDrive.defendOnce(defend, c.defendSide || 0, _aiDefOnce); defend = _aiDefOnce.defend; c.defendSide = _aiDefOnce.side; }
    const freer = roomR - roomL;
    const unstuckSide = Math.abs(freer) > 1 ? (freer > 0 ? 1 : -1)
      : (Math.abs(c.x) > 1.5 ? (c.x > 0 ? -1 : 1) : (c.lane >= 0 ? 1 : -1));
    const unstuck = unstuckActive ? unstuckSide * AiDrive.unstuckPull(aiT, !!track.street) : 0;
    const sepMax = AiDrive.sepClamp(!!track.street);
    sep = clamp(sep, -sepMax, sepMax);
    const biasWant = overtake + defend + yieldPull + sep;
    c.aiBias = c.aiBias == null ? biasWant : c.aiBias + clamp(biasWant - c.aiBias, -AI_BIAS_SLEW * dt, AI_BIAS_SLEW * dt);
    let desiredX = clamp(targetX + c.aiBias + unstuck, -(hw - 0.5), hw - 0.5);
    const holdLine = braking && chaser && !c.passOf && !unstuckActive && chaserGap < AiDrive.holdLineGap(c.speed);
    if (holdLine) {
      if (c.holdOff == null) c.holdOff = desiredX - targetX;
      desiredX = clamp(targetX + c.holdOff, -(hw - 0.5), hw - 0.5);
    } else c.holdOff = null;
    const pk = (parked.length ? Collide.parkedAhead(c, parked, track.total, 30 + 1.5 * c.speed) : null)
      || (stillCars.length ? Collide.parkedAhead(c, stillCars, track.total, AiDrive.hazardReach(c.speed)) : null);
    const hz = pk || (blocker && blockerGap < AiDrive.hazardReach(c.speed) && AiDrive.stoppedHazard(blocker, vT) ? blocker : null);
    const hzClear = AiDrive.hazardClear(CLEAR);
    if (hz !== c._hzOf) { c._hzOf = hz; c._hzSide = hz ? AiDrive.hazardSide(c.x, hz.x) : 0; }
    if (hz && (c._hzSide < 0 ? desiredX > hz.x - hzClear : desiredX < hz.x + hzClear)) desiredX = clamp(hz.x + c._hzSide * hzClear, -(hw - 0.5), hw - 0.5);
    let rubClamp = false;
    const alongClose = !!alongO && Math.abs(alongDx) < CLEAR;
    const aimClose = !!alongO && !alongClose && !!alongO.human && AiDrive.aimIntrudes(desiredX, c.x, alongO._snapX, CLEAR);
    let yieldMine = alongClose && AiDrive.sideYieldsA(-alongDprog, c.x, alongO._snapX, AiDrive.cornerK(c.kTurn, alongO.kTurn));
    const inBand = alongClose && Math.abs(alongDx) < CLEAR - AiDrive.humanYieldBand();
    const intruding = inBand && (alongDx <= 0 ? desiredX < c.x : desiredX > c.x);
    c.hYieldT = AiDrive.humanYieldT(c.hYieldT, !!alongO && Math.abs(alongDx) < CLEAR + 1, yieldMine, !!(alongO && alongO.human), intruding, dt, inBand);
    if (!yieldMine && AiDrive.humanYieldTakes(c.hYieldT)) yieldMine = true;
    if (!yieldMine && aimClose && alongO.human) yieldMine = true;
    c.sbsT = yieldMine ? (c.sbsT || 0) + dt : 0;
    if (yieldMine) {
      const preYield = desiredX;
      desiredX = alongDx <= 0 ? Math.max(desiredX, alongO._snapX + CLEAR) : Math.min(desiredX, alongO._snapX - CLEAR);
      desiredX = clamp(desiredX, -(hw - 0.5), hw - 0.5);
      if (hz && !alongO.human && (c._hzSide < 0 ? desiredX > hz.x - hzClear : desiredX < hz.x + hzClear)) desiredX = preYield;
      rubClamp = alongClose;
    }
    if (pits) {
      const lx = pits.laneX(c, hw, desiredX);
      if (lx !== desiredX) { desiredX = lx; tanT = 0; }
    }
    const err = desiredX - c.x;
    const vAbs = Math.abs(c.speed);
    const emergency = unstuckActive || rubClamp || (c.contactT || 0) > 0;
    if (emergency || vStd(vAbs) < AI_HEAD_VMIN) {
      let e = err;
      if (Math.abs(e) < 0.3) e *= Math.abs(e) / 0.3;
      steer = clamp(e * 0.9, -1, 1);
      if (c.steerSm === undefined) c.steerSm = steer;
      c.steerSm = damp(c.steerSm, steer, AiDrive.steerDamp(aiT), dt);
      steer = c.steerSm;
      const vl = steer * STEER_VMAX * clamp(vStd(vAbs) / 18, 0, 1);
      c.aiHead = vAbs > 1 ? clamp(Math.asin(clamp(vl / vAbs, -1, 1)), -AI_HEAD_MAX, AI_HEAD_MAX) : 0; c.aiHeadV = vAbs;
    } else {
      const steeringGrip = S.gmC * S.tyreGrip * dirtyAirMul(c.wake || 0, c.speed);
      const ls = AiDrive.lateralScales(c.speed, c.aeroLoad, steeringGrip, driveTune.PACE, VMAX, aeroDfMult(c));
      const yawMax = Math.min(AI_YAW_MAX, AI_YAW_LAT * LAT_MAX * ls.yaw / vAbs);
      const headWant = AiDrive.hazardHead(AiDrive.edgeHead(clamp(Math.atan(tanT) + Math.atan(AI_XTRACK_GAIN * err / Math.max(vAbs, 1)), -AI_HEAD_MAX, AI_HEAD_MAX), c.x, hw, desiredX, vAbs, yawMax), c.x, hz, hzClear, desiredX, vAbs, yawMax, c._hzSide);
      const head0 = c.aiHeadV != null && vStd(Math.abs(vAbs - c.aiHeadV)) > AI_HEAD_JUMP ? 0 : c.aiHead || 0;
      c.aiHead = head0 + clamp(headWant - head0, -yawMax * dt, yawMax * dt); c.aiHeadV = vAbs;
      gripScale = ls.lat;
      steer = clamp(vAbs * Math.sin(c.aiHead) / Math.max(STEER_VMAX * clamp(vStd(vAbs) / 18, 0, 1) * gripScale, 1), -1, 1);
      c.steerSm = steer;
    }
  }
  const latFac = clamp(vStd(Math.abs(c.speed)) / 18, 0, 1);
  if (gripScale === undefined) gripScale = c.human ? 1 : AiDrive.lateralScale(c.speed, c.aeroLoad, S.gmC * S.tyreGrip * dirtyAirMul(c.wake || 0, c.speed), driveTune.PACE, VMAX, aeroDfMult(c));
  const kerbGrip = c.kerbGripSm ?? 1;
  const bankPhys = Tracks.banking(track, c.s, 0, _bankScratchP);
  const bankRoll = bankPhys ? Math.abs(bankPhys.roll) : 0;
  const bankMu = 1 + Math.sin(bankRoll) * 0.8;
  S.steer = steer; S.gripScale = gripScale; S.latFac = latFac; S.kerbGrip = kerbGrip; S.bankMu = bankMu;
}
function updateCarBicycle(c, dt, ranked, S) {
  const hw = S.hw; const slopeSin = S.slopeSin; const k = S.k; const mods = S.mods; const vT = S.vT; const gmC = S.gmC; const perfMul = S.perfMul; const vmax = S.vmax; const unstuckActive = S.unstuckActive; const alongO = S.alongO; const alongDx = S.alongDx; const aiT = S.aiT; const deploy = S.deploy; const braking = S.braking; const throttleLvl = S.throttleLvl; const gearMult = S.gearMult; const surfaceMu = S.surfaceMu; const brakeDecel = S.brakeDecel; const onThrottle = S.onThrottle; let steer = S.steer; const gripScale = S.gripScale; const latFac = S.latFac; const kerbGrip = S.kerbGrip; const bankMu = S.bankMu;
  if (c.human) {
    if (c.px == null) {
      const w0 = worldFromTrack(c.s, c.x, smp);
      c.px = w0.x;
      c.pz = w0.z;
      c.head = Math.atan2(smp.t[0], smp.t[2]);
      c.vLat = 0;
      c.yawRateCur = 0;
    }
    const sp = clamp(Math.abs(c.speed) / 3, 0, 1);
    const shaped = Math.sign(steer) * Math.pow(Math.abs(steer), driveTune.STEER_EXPO);
    const vs = vStd(Math.abs(c.speed)), raw = 1 / (1 + vs / driveTune.STEER_SPEED_REF), lockTaper = vs <= 15 ? 1.06 : (vs >= 30 ? raw : 1.06 + (raw - 1.06) * (vs - 15) / 15);
    const driverDelta = shaped * driveTune.STEER_MAX_SLIP * lockTaper;
    const brakeFade = 1 - 0.8 * clamp(-(c.axEstSm ?? 0) / BRAKE, 0, 1);
    const offAssistFade = Math.max(0, 1 - Math.max(0, Math.abs(c.x) - hw) / 3);
    const hFrenet = frenetH(c.s, c.x);
    const kPath = k / hFrenet;
    const yawEase = playerForces.assistYawEase(c.yawRateCur, c.speed * kPath);
    const assistDelta = -driveTune.ROAD_FOLLOW * (driveTune.WHEELBASE + ASSIST_KUS * c.speed * c.speed * brakeFade) * kPath * yawEase * offAssistFade;
    let lineDelta = 0;
    if (raceLineAssist !== 0 && track.line) {
      const look = clamp(Math.abs(c.speed) * 0.9, 25, 90);
      const ln = TrackLine.at(track, wrapS(c.s + look));
      const edge = Math.max(0, hw - 0.6);
      const lineX = clamp(ln.x, -edge, edge);
      const Ld = clamp(Math.abs(c.speed) * 1.2, 22, 70);
      lineDelta = raceLineAssist * LINE_PURSUIT * driveTune.WHEELBASE * 2 * ln.w * (lineX - c.x) / (Ld * Ld) * offAssistFade;
    }
    const L = Math.max(2, driveTune.WHEELBASE);
    const ar = FRONT_WEIGHT * L, af = L - ar;
    const axEstTarget = braking ? (c.speed > 0 ? -brakeDecel : (c.speed > REVERSE_MAX ? -REVERSE_ACCEL * surfaceMu : 0))
      : (onThrottle
          ? (ACCEL * driveTune.PACE * perfMul * (c.human ? mods.accel * throttleLvl : 1) * clamp(1 - c.speed / Math.max(vmax, 1), 0, 1) * gearMult + deploy) * surfaceMu
          : -COAST_DRAG * (1 - xCoastCut(c) * (c.aeroX || 0)));
    c.axEstSm = damp(c.axEstSm ?? axEstTarget, axEstTarget, 10, dt);
    const wt = clamp(-c.axEstSm / LAT_MAX * WT_LONG, -0.16, 0.18);
    const loadF = FRONT_WEIGHT + wt, loadR = (1 - FRONT_WEIGHT) - wt;
    Tracks.sample(track, wrapS(c.s + 12), smp2);
    const kv = ((smp2.t[1] || 0) - slopeSin) / 12;
    const vtRaw = clamp(kv * c.speed * c.speed / 9.8, -0.20, 0.20);
    c.vertLoad = damp(c.vertLoad ?? vtRaw, vtRaw, 4, dt);
    const vertLoad = c.vertLoad;
    const pf = _pfCtx;
    pf.dt = dt; pf.driverDelta = driverDelta; pf.assistDelta = assistDelta; pf.lineDelta = lineDelta; pf.onThrottle = onThrottle;
    pf.throttleLvl = throttleLvl; pf.gearMult = gearMult; pf.deploy = deploy; pf.braking = braking; pf.axTarget = axEstTarget;
    pf.surfaceMu = surfaceMu; pf.kerbGrip = kerbGrip; pf.bankMu = bankMu; pf.modsCornering = mods.cornering; pf.modsBraking = mods.braking;
    pf.loadF = loadF; pf.loadR = loadR; pf.vertLoad = vertLoad; pf.af = af; pf.ar = ar; pf.sp = sp; pf.steer = steer;
    pf.weatherGrip = gmC; pf.aeroDf = aeroDfMult(c); pf.dirtyMul = dirtyAirMul(c.wake || 0, c.speed);
    pf.coastCut = xCoastCut(c); pf.vTopNow = vT; pf.tyres = tyres; pf.damage = typeof DamageHandling !== "undefined" ? DamageHandling.forCar(c) : null;
    playerForces.step(c, pf);
    if (Wind.latA()) c.vLat += Wind.latA() * vT / VMAX * dt;
    const fx = Math.sin(c.head), fz = Math.cos(c.head);
    const vWx = c.speed * fx - c.vLat * fz;
    const vWz = c.speed * fz + c.vLat * fx;
    c.px += vWx * dt;
    c.pz += vWz * dt;
    let tX = smp.t[0], tZ = smp.t[2]; const tL = Math.hypot(tX, tZ) || 1; tX /= tL; tZ /= tL;
    const tf = trackFrom(c.px, c.pz, c.s + (vWx * tX + vWz * tZ) * dt / hFrenet);
    c.s = tf.s;
    c.x = tf.x;
    steer = clamp(shaped, -1, 1);
  } else {
    const toward = !alongO || Math.sign(steer) === Math.sign(alongDx);
    const give = AiDrive.contactGive((c.contactT || 0) > 0 && toward, aiT, !!track.street);
    const aiSurfMu = surfaceMu;
    const aiLat = unstuckActive ? Math.max(latFac, AiDrive.unstuckLatFloor(!!track.street)) : latFac;
    const vlOwn = steer * STEER_VMAX * aiLat * gripScale * kerbGrip * bankMu * give * aiSurfMu;
    c.x += vlOwn * dt;
    if (Wind.latA()) c.x += Wind.latA() * vT / VMAX * Wind.AI_TAU * dt;
    if (DebrisWorld.active()) {
      _marbleArg.lock = (braking && vStd(c.speed) > 30) ? 0.95 : (c.wheelLock || 0);
      _marbleArg.slip = Math.abs(Math.atan2(vlOwn, Math.max(4, Math.abs(c.speed))));
      _marbleArg.speed = c.speed;
      DebrisWorld.tyreMarble(c, _marbleArg);
    }
  }
  if (c.human) {
    const slipAng = Math.abs(Math.atan2(c.vLat || 0, Math.max(4, Math.abs(c.speed))));
    c.skidIntensity = c.offroad ? 0.5
      : Math.max(clamp((slipAng - 0.10) / 0.20, 0, 1), (c.wheelLock || 0) * 0.9);
  }
  S.steer = steer;
}
function updateCarAdvance(c, dt, ranked, S) {
  const vT = S.vT; const inp = S.inp; const roomL = S.roomL; const roomR = S.roomR; const unstuckActive = S.unstuckActive; const queued = S.queued; const aiT = S.aiT; const braking = S.braking;
  let oldS = c._prevS ?? c.s;
  const hAi = c.human ? 1 : frenetH(c.s, c.x);
  if (!c.human) c.s = wrapS(c.s + c.speed * dt / hAi);
  const L = track.total;
  let ds = c.s - oldS;
  if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;

  if (Math.abs(ds) > 20) {
    ds = c.speed * dt;
    oldS = wrapS(c.s - ds);
  }

  const dLine = ds;
  if (c.human) c.prog += ds - (c._pushD || 0);
  else c.prog += (ds = c.speed * dt / hAi);
  c._pushD = 0; c.totalT += dt;
  c.lapTime += dt;
  if (c.isPlayer && isQuali() && state === "race" && c.lapTime > 0) {
    qualiNet.reportLive(c.driverId, c.lapTime, track && track.total ? (c.s || 0) / track.total : 0);
  }

  const s3Past = dLine > 0 && oldS > L * 0.5 && c.s < L * 0.5 && dt > 0 ? dt * (1 - Math.min(1, Math.max(0, (L - oldS) / dLine))) : 0;
  if (state === "race" && track) {
    const ns = sectorAt(c.s);
    if (ns !== c._secIdx) {
      const fwd = ds > 0 && c._secIdx != null && (c._secIdx < ns || (c._secIdx === 2 && ns === 0));
      if (fwd && c._secValid !== false && c.lap >= 1 && !c.incidentInvalidLap && c._secT0 != null) {
        const e = c.lapTime - (ns === 0 ? s3Past : 0) - c._secT0;
        if (e >= 2 && e < lapRec.fieldSectorBests[c._secIdx]) lapRec.fieldSectorBests[c._secIdx] = e;
      }
      if (c.isPlayer) EnergyPlan.sectorExit(c, fwd, isTimeTrial()); c._secValid = fwd || c._secIdx == null; c._secIdx = ns; c._secT0 = c.lapTime;
    }
  }
  if (c.isPlayer && state === "race" && track) {
    const newSector = sectorAt(c.s);
    if (newSector !== lapRec.sectorIdx) {
      const fwd = ds > 0 && (lapRec.sectorIdx < newSector || (lapRec.sectorIdx === 2 && newSector === 0));
      if (fwd) {
        if (c.lap >= 1 && !c.incidentInvalidLap && lapRec.sectorValid) {
          const elapsed = c.lapTime - (newSector === 0 ? s3Past : 0) - lapRec.sectorStartT;
          const prevSector = lapRec.sectorIdx;
          const prevBest = lapRec.sectorBests[prevSector];
          lapRec.sectorLast[prevSector] = elapsed;
          if (elapsed < prevBest) lapRec.sectorBests[prevSector] = elapsed;
          if (elapsed >= 2 && c.isPlayer) hud.flashSector(prevSector);
        }
      }
      lapRec.sectorValid = fwd;
      lapRec.sectorIdx = newSector;
      lapRec.sectorStartT = c.lapTime;
    }
  }

  const lineCross = RaceControl.lineTransition(c, oldS, c.s, dLine, track.total,
    lapsTarget, cars, raceT, dt);
  if (lineCross && lineCross.direction > 0) {
    let lapValid = !c.incidentInvalidLap && !(c.isPlayer && coach.practiceActive());
    lineCross.lapValid = lapValid && c.lap > 1 && !lineCross.recross;
    if (c.lap > 1 && !lineCross.recross) {
      const lapDone = lineCross.lapDone;
      if (c.isPlayer && isTimeTrial()) {
        if (lapValid) lapValid = onTTLap(lapDone);
        else restartTTRecorders();
        lineCross.lapValid = lapValid;
      }
      if (lapValid) c.lastLap = lapDone;
      else if (c.isPlayer && isQuali()) c.qualiCut = true;
      if (lapValid && lapDone < c.best) c.best = lapDone;
      if (c.isPlayer && soundOn) GameAudio.lap();
    } else if (c.isPlayer && isTimeTrial()) {
      restartTTRecorders();
    }
    c.incidentInvalidLap = false;
    c._secT0 = 0;
    if (c.isPlayer) { lapRec.sectorIdx = 0; lapRec.sectorStartT = 0; }
    if (c.isPlayer && c.lap === lapsTarget && lapsTarget > 1 && !raceRadio.callsLastLap()) announce("FINAL LAP", 1.6, "race");
    onCarLineFinish(c, lineCross);
  } else if (lineCross && lineCross.direction < 0) {
    if (lineCross.changed) {
      if (c.isPlayer) { lapRec.sectorIdx = sectorAt(c.s); lapRec.sectorStartT = c.lapTime; lapRec.sectorValid = false; }
      if (c.isPlayer && isTimeTrial()) restartTTRecorders();
    }
  }
  if (isTimeTrial() && c.isPlayer) records.sample(c, inp, true);

  if (c.human && state === "race" && !c.finished) {
    if (ds < -0.03 && vStd(c.speed) > 15) c.wrongT = Math.min(2, (c.wrongT || 0) + dt);
    else c.wrongT = Math.max(0, (c.wrongT || 0) - dt * 2);
    c.wrongWay = c.wrongWay ? c.wrongT > 0.15 : c.wrongT > 0.4;
    if (c.wrongWay && (c.wrongCueT = (c.wrongCueT || 0) - dt) <= 0) {
      if (c.local) announce("WRONG WAY", 1.0, "warning");
      c.wrongCueT = 1.0;
    }
    const autoGas = autoThrottle() && (c.contactT || 0) === 0 && vStd(c.speed) < 3;
    const gasPressed = inp ? !!inp.throttle : (autoGas || Input.throttle());
    const stoppedOnTrack = gasPressed && c.speed < 3 && raceT > 2 && !(braking && ds < -0.01);
    const redHeld = raceCtl.level >= 4;
    const beached = beachedAt(c);
    const stuck = !playerForces.recoverBlocked(c, pits.inLane(c)) &&
      (beached || c.wrongWay || (c.speed < 4 && (c.wallT || 0) > 0) || stoppedOnTrack);
    const rescueGrace = c.rescueLastT != null && raceT < c.rescueLastT + 4;
    const redOnly = redHeld && stoppedOnTrack && !beached && !c.wrongWay && !((c.wallT || 0) > 0);
    if (stuck && !redOnly && !rescueGrace) c.rescueT = (c.rescueT || 0) + dt;
    else c.rescueT = Math.max(0, (c.rescueT || 0) - dt * 1.5);
    if (c.rescueT > 3) { rescuePlayer(c); c.rescueT = 0; }
  } else if (!c.human && state === "race" && !c.finished) {
    c.digEscHeld = AiDrive.digOutHeld(c.digEscHeld, AiDrive.digOutEscalated(c.stuckT, aiT, !!track.street), unstuckActive);
    const digEsc = c.digEscHeld;
    const laneQueueOk = !(queued && pits.inLane(c)) || digEsc;
    const aiStuck = c.pitState !== "box" && (beachedAt(c) ||
      (c.speed < 5 && raceT > 2 && (!unstuckActive || digEsc) && laneQueueOk));
    const aiRedHeld = raceCtl.level >= 4 && !beachedAt(c);
    if (c.pitState === "box") c.rescueT = 0;
    else if (aiStuck && !aiRedHeld) c.rescueT = (c.rescueT || 0) + dt;
    else c.rescueT = Math.max(0, (c.rescueT || 0) - dt * 1.5);
    if (c.rescueT > AiDrive.aiRescueDelay((c.contactT || 0) > 0, digEsc)) {
      Tracks.sample(track, c.s, smp);
      if ((c.contactT || 0) > 0) c.x += (roomR >= roomL ? 1 : -1) * 1.2;
      if (pits.inLane(c)) {
        c.x = pits.laneX(c, smp.hw, c.x);
        c.speed = Math.min(pits.limit(), Math.max(c.speed, 8 * Math.max(driveTune.PACE, 0.05)));
      } else {
        c.x = clamp(c.x, -(smp.hw - 1.5), smp.hw - 1.5);
        c.speed = Math.min(vT, Math.max(c.speed, 14 * Math.max(driveTune.PACE, 0.05)));
      }
      c.rescueT = 0; c.offT = 0; c.stuckT = 0; c.contactT = 0; c.digEscHeld = false;
    }
  }
  if (!c.human) {
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x;
    c.pz = w.z;
  }
  c._prevS = c.s;
}

function rescuePlayer(c) {
  if (c.human && (isTimeTrial() || isQuali())) { c.incidentInvalidLap = true; if (c.isPlayer && isQuali() && c.lap >= 1) c.qualiCut = true; }
  incidentSim.release(c);
  Tracks.sample(track, c.s, smp);
  c.x = 0; c.xVis = 0;
  c.head = Math.atan2(smp.t[0], smp.t[2]);
  c.vLat = 0; c.yawRateCur = 0;
  c.speed = Math.min(vTop(), 16 * Math.max(driveTune.PACE, 0.05));
  c.px = smp.p[0]; c.pz = smp.p[2];
  c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevHead = c.head;
  c.boostOn = false; c.deploying = false;
  c.xOn = false; c.aeroX = 0; c.xArmed = false;
  c.wrongT = 0; c.wrongWay = false; c.offT = 0; c.wallT = 0; c.wasOnWall = false; c.rescueT = 0;
  c.rescueLastT = raceT;
  if (c.local && soundOn) GameAudio.offtrack(); if (c === player) snapGameCam();
}

function retireCar(c, reason) {
  incidentSim.release(c);
  c.retired = true;
  c.dnf = reason || "mechanical";
  c.dnfAt = null;
  if ((c.local || (!c.human && netPlay.ownsRaceControl())) && netPlay.active()) netPlay.reportLap({ lap: c.lap, time: null, best: null, code: c.code, driverId: c.driverId, retired: c.dnf, invalid: true });
  Tracks.sample(track, c.s, smp);
  const side = c.x >= 0 ? 1 : -1;
  const wall = Tracks.wallAt(track, c.s, side);
  const halfW = Collide.WCAR / 2;
  c.x = side * clamp(Math.max(smp.hw + halfW + 0.1, wall - 1.6), 0, Math.max(0, wall - 0.6));
  c.parkedOnRoad = Math.abs(c.x) - halfW < smp.hw - 0.3;
  c.xVis = c.x;
  const w = worldFromTrack(c.s, c.x, smp);
  c.px = w.x; c.pz = w.z;
  c.head = Math.atan2(smp.t[0], smp.t[2]);
  c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x;
  c.rPrevHead = c.head; c.rPrevYawVis = 0;
  c.speed = 0; c.vLat = 0; c.yawRateCur = 0; c.yawVis = 0; c.steerVis = 0; c.skidIntensity = 0;
  c.gear = 1; c.rpm = IDLE_RPM;
  c.boostOn = false; c.deploying = false; OvertakeMode.reset(c); pits.clearArm(c);
  announce("RETIREMENT — " + c.code, 2, "info");
  if (c.local && soundOn) GameAudio.offtrack();
}

function checkRetirements(dt) {
  const dist = Math.max(1, lapsTarget * track.total);
  AiDrive.stallSweep(cars, dt, state === "race" && !paused && raceCtl.level < 3 && raceT > 0 && !isTimeTrial() && !isQuali(), c => { retireCar(c, "stationary"); announce("RETIRED — CAR STATIONARY FOR 60 s", 3, "penalty-hit"); });
  for (const c of cars) {
    if (c.dnfAt == null || c.retired || c.finished) continue;
    if (netPlay.owns(c) || realRace.owns(c)) continue;
    if ((c.prog - (c._progGift || 0)) / dist >= c.dnfAt) retireCar(c, c.dnfWhy);
  }
}

function onTTLap(lapTime) { return records.finish(lapTime, lapRec.ttLaps, quali.referencePole()); }

function cooldownDrives() { const rc = RaceCeremony.get(); return state === "results" && !!rc && rc.status().inputOwner === "player"; }
function cooldownDrive(c, dt) {
  const inp = inputOf(c), thr = inp ? !!inp.throttle : Input.throttle(), brk = inp ? !!inp.brake : Input.brakeLevel() > 0;
  const steer = inp ? clamp(+inp.steer || 0, -1, 1) : Input.steer(dt), vMax = vTop() * 0.55;
  c.speed = clamp(c.speed + (thr ? 18 : brk ? -40 : -6) * dt, 0, vMax); c._coastHeld = false;
  c.s = wrapS(c.s + c.speed * dt); c.prog += c.speed * dt;
  Tracks.sample(track, c.s, smp);
  c.x = clamp(c.x + steer * Math.min(c.speed, 20) * 0.25 * dt, -smp.hw * 0.9, smp.hw * 0.9);
  const w = worldFromTrack(c.s, c.x, smp);
  c.px = w.x; c.pz = w.z; c.head = Math.atan2(smp.t[0], smp.t[2]);
}
function coast(c, dt) {
  const floor = GRASS_V * 0.6 * Math.max(driveTune.PACE, 0.05);
  const next = c.speed - 20 * dt;
  if (c.speed > floor) { c.speed = Math.max(floor, next); if (c.speed === floor) c._coastHeld = true; }
  else c.speed = c._coastHeld ? floor : Math.max(0, next);
  const onLane = pits.held(c);
  if (c.pitState === "box") c.speed = 0;
  else if (onLane) c.speed = Math.min(c.speed, pits.limit());
  c.s = wrapS(c.s + c.speed * dt);
  c.prog += c.speed * dt;
  Tracks.sample(track, c.s, smp);
  const kA = Tracks.curvature(track, wrapS(c.s + 30));
  c.x = onLane ? damp(c.x, pits.laneX(c, smp.hw, c.x), 3, dt)
               : damp(c.x, clamp(-kA * 130, -0.5, 0.5) * smp.hw, 2, dt);
  {
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x; c.pz = w.z;
    c.head = Math.atan2(smp.t[0], smp.t[2]);
  }
}

const { TUNE_DEFS, LT, buildTrackLights } = LightTune;
function ltKey() { return ltStore.key(); }
function applyLightTune(fromApplyRace, opts) { ltStore.apply(fromApplyRace, opts); }
function setLightTune(id, v) {
  return LightTuneEdit.set(id, v, {
    LT, ltStore, gfx,
    get perChunkOff() { return _perChunkOff; }, set perChunkOff(v) { _perChunkOff = v; },
    get envProbeOff() { return _envProbeOff; }, set envProbeOff(v) { _envProbeOff = v; },
  });
}
function persistLightTune() { ltStore.persist(); }
function copyLightTune(mode) { return ltStore.copyToTracks(mode); }
function restoreLightTune(undo) { return ltStore.restore(undo); }

const _wheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };
const _lightFwd = [0, 0, 0];
function setFrameLights(eye, scale, fwd, srcSet) {
  LightTune.setFrameLights(frame, track, cars, eye, scale, fwd, gfx.mobileTier, srcSet);
}
function appendCarTailLights() {
  LightTune.appendCarTailLights(frame, track, cars, player, gfx.mobileTier);
}

GameCams.init({ vmax: vTop() });
const { COCKPIT_EYE_FWD, COCKPIT_EYE_UP } = GameCams;
function camVantage(mode, s, x, spd, now, extra) {
  return GameCams.vantage(track, mode, s, x, spd, now, extra);
}

let setupPreviewOn = false;

let _envFace = -1, _frameNo = 0, _envHold = false, _envLatchTod = null;
const _envLatch = [NaN, NaN, NaN, NaN, NaN, NaN, NaN, -1], ENV_HOLD_MOVE_M = 4, _envEye = [0, 0, 0], _envUp = [0, 1, 0];
let _envProbeOff = false;
try { _envProbeOff = localStorage.getItem("apex26.envProbeOff") === "1"; } catch (_) {}
let _raceEntryEnvProbeSession = false;
function clearRaceEntrySoften() {
  _raceEntryEnvProbeSession = false;
  if (typeof PerfGov !== "undefined" && PerfGov.softwareGaragePreviewEnd) PerfGov.softwareGaragePreviewEnd(gfx);
  try { if (gfx && gfx.envProbeOptOut) gfx.envProbeOptOut = false; } catch (_) {  }
}
function installRaceEntrySoften() {
  if (typeof GfxEscalation === "undefined" || !GfxEscalation.registerRaceEntrySoften) return;
  GfxEscalation.registerRaceEntrySoften((g) => {
    if (typeof RaceEntryProfile === "undefined" || !RaceEntryProfile.softwareRaster || !RaceEntryProfile.softwareRaster()) return;
    _raceEntryEnvProbeSession = true;
    try { if (g) g.envProbeOptOut = true; } catch (_) {  }
  });
}
const _ssrDayGate = (() => { try { return localStorage.getItem("apex26.ssrDayGate") === "1"; } catch (_) { return false; } })();
let _perChunkOff = false;
try { _perChunkOff = localStorage.getItem("apex26.perChunkOff") === "1"; } catch (_) {  }
const _terrainBias = [2, 10];
const _wmFloorN = { emissive: 0.14, roughness: 0.98, specular: 0.05, depthBias: [4, 16], buryRibbon: true };
const _wmFloorD = { roughness: 0.98, specular: 0.05, depthBias: [4, 16], buryRibbon: true };
const _wmTerrainN = { emissive: 0.18, roughness: 0.97, specular: 0.06, detail: 0, buryRibbon: true, depthBias: _terrainBias };
const _wmTerrainD = { roughness: 0.97, specular: 0.06, detail: 0, buryRibbon: true, depthBias: _terrainBias };
const _wmRoadWetN = { emissive: 0.06, roughness: 0.14, specular: 0.85, detail: 0, surfaceId: 16, doubleSided: true };
const _wmRoadWetD = { roughness: 0.14, specular: 0.85, detail: 0, surfaceId: 16, doubleSided: true };
const _wmRoadDryN = { emissive: 0.09, roughness: 0, specular: 0.20, detail: 0, surfaceId: 16, doubleSided: true };
const _wmRoadDryD = { roughness: 0, specular: 0.20, detail: 0, surfaceId: 16, doubleSided: true };
const _startBias = [-2, -4];
const _wmStartWet = { roughness: 0.16, specular: 0.80, detail: 0, depthBias: _startBias };
const _wmStartN = { emissive: 0.10, roughness: 0.80, specular: 0.22, detail: 0, depthBias: _startBias };
const _wmStartD = { roughness: 0.80, specular: 0.22, detail: 0, depthBias: _startBias };
const _wmPropsWetN = { emissive: 0, roughness: 0.55, specular: 0.38 };
const _wmPropsWetD = { roughness: 0.55, specular: 0.38 };
const _wmPropsDryN = { emissive: 0, roughness: 0.85, specular: 0.20 };
const _wmPropsDryD = { roughness: 0.85, specular: 0.20 };
const _pbPlanes = [0,0,0,0,0,0].map(() => new Float32Array(4));
const _ghostOpts = { emissive: 0.80, roughness: 0.20, metalness: 0.08, specular: 0.35, alpha: 0.35, noAlphaWrite: true };
const _wmGlass = { roughness: 0.13, specular: 0.82, metalness: 0.12, clearcoat: 1.0 };
const _wmWaterWet = { roughness: 0.16, specular: 0.85, metalness: 0.05 };
const _wmWaterDry = { roughness: 0.10, specular: 0.92, metalness: 0.05 };
const _wmGateWet = { roughness: 0.32, metalness: 0.35, specular: 0.65 };
const _wmGateDry = { roughness: 0.45, metalness: 0.30, specular: 0.50 };
function drawWorldMeshes(frame, night, wet, floodEmit, withGlow, envProbe) {
  if (!hideMeshes.terrain && track.meshes.floor) gfx.draw(track.meshes.floor, MAT_IDENT,
    night ? _wmFloorN : _wmFloorD);
  const _rr = LT.roadRough, _sd = LT.surfDetail;
  if (!hideMeshes.terrain) {
    const m = night ? _wmTerrainN : _wmTerrainD; m.detail = 0.42 * _sd;
    let _tMesh = track.meshes.terrain || track.meshes.terrainChunked, _tChunked = !!(_tMesh && _tMesh.chunks && _tMesh.chunks.length);
    if (PerfGov.tier() < 3) {
      if (track.meshes.terrainChunked === undefined) {
        track.meshes.terrainChunked = null;
        if (track.terrainGeo && gfx.createChunkedMesh) {
          track.terrainGeo._keepPositions = true;
          track.meshes.terrainChunked = gfx.createChunkedMesh(track.terrainGeo, 72);
          if (typeof Tracks !== "undefined" && Tracks.dropRibbonCpuIfReady) Tracks.dropRibbonCpuIfReady(track);
        }
      }
      const _tc = track.meshes.terrainChunked;
      if (_tc && _tc.chunks) { _tMesh = _tc; _tChunked = true; }
    }
    if (_tChunked) { if (!envProbe) gfx.drawChunked(_tMesh, MAT_IDENT, m); }
    else gfx.draw(_tMesh, MAT_IDENT, m);
  }
  if (!hideMeshes.road) {
    let m;
    if (wet) { m = night ? _wmRoadWetN : _wmRoadWetD; m.detail = 0.06 * _sd; }
    else { m = night ? _wmRoadDryN : _wmRoadDryD; m.detail = 0.22 * _sd; m.roughness = clamp(0.85 * _rr, 0.04, 1); }
    let _roadMesh = track.meshes.road || track.meshes.roadChunked, _roadChunked = !!(_roadMesh && _roadMesh.chunks && _roadMesh.chunks.length);
    const _wantRoadChunk = gfx.chunkedTrackCoords !== false && ((LT.roadChunkLamps && LT.perChunkLights && gfx.hasPerChunkLights && !_perChunkOff && PerfGov.autoShed() < 2)
      || (PerfGov.tier() < 3));
    if (_wantRoadChunk) {
      if (track.meshes.roadChunked === undefined) {
        track.meshes.roadChunked = null;
        if (track.roadGeo && gfx.createChunkedMesh) {
          track.roadGeo._keepPositions = true;
          track.meshes.roadChunked = gfx.createChunkedMesh(track.roadGeo, 72);
          if (typeof Tracks !== "undefined" && Tracks.dropRibbonCpuIfReady) Tracks.dropRibbonCpuIfReady(track);
        }
      }
      const _rc = track.meshes.roadChunked;
      if (_rc && _rc.chunks && _rc.chunks.length) { _roadMesh = _rc; _roadChunked = true; }
    }
    if (_roadChunked) { if (!envProbe) gfx.drawChunked(_roadMesh, MAT_IDENT, m); }
    else gfx.draw(_roadMesh, MAT_IDENT, m);
  }
  if (!hideMeshes.startline && track.meshes.startline) gfx.draw(track.meshes.startline, MAT_IDENT,
    wet ? _wmStartWet : (night ? _wmStartN : _wmStartD));
  if (withGlow && frame.lights && !_studioRig) gfx.drawGlow(frame.glowLights || frame.lights, PostCommon.softwareGlowScale(LT.glareStr));
  if (!hideMeshes.props) {
    let m;
    const _lit = floodEmit > 0;
    if (wet) { if (_lit) { m = _wmPropsWetN; m.emissive = Math.min(0.80, floodEmit); } else m = _wmPropsWetD; }
    else { if (_lit) { m = _wmPropsDryN; m.emissive = floodEmit; } else m = _wmPropsDryD; }
    const _pb = track.meshes.propBatches;
    if (_pb && _pb.length && gfx.drawInstanced && !frame.mirrorLite && !envProbe) {
      const planes = gfx.makeFrustumPlanes ? gfx.makeFrustumPlanes(frame.viewProj, _pbPlanes) : null;
      const pp = !!gfx.instPerPass, freeze = !pp && !!frame.mirrorFreezeInstanced, rec = !pp && frame.mirrorLite === false;
      for (let i = 0; i < _pb.length; i++) {
        const b = _pb[i];
        if (freeze && b._mirN > 0 && b._mirMats && gfx.updateInstances) {
          gfx.updateInstances(b, b._mirMats, b._mirN, b._mirCols || null);
        } else {
          if (planes && gfx.cullInstances) gfx.cullInstances(b, planes);
          const n = b.visible | 0;
          if (rec && n > 0 && b.packMatrices) {
            if (!b._mirMats || b._mirMats.length < n * 16) b._mirMats = new Float32Array(n * 16);
            b._mirMats.set(b.packMatrices.subarray(0, n * 16));
            const nc = n * 3;
            if (!b._mirCols || b._mirCols.length < nc) b._mirCols = new Float32Array(nc);
            if (b.packColors) b._mirCols.set(b.packColors.subarray(0, nc));
            else if (b._instPacked) for (let j = 0; j < n; j++) { const s = j * 20 + 16, d = j * 3; b._mirCols[d] = b._instPacked[s]; b._mirCols[d + 1] = b._instPacked[s + 1]; b._mirCols[d + 2] = b._instPacked[s + 2]; }
            b._mirN = n;
          } else if (rec) b._mirN = 0;
        }
        gfx.drawInstanced(b, m);
      }
    }
    if (!envProbe) gfx.drawChunked(track.meshes.props, MAT_IDENT, m);
  }
  if (!hideMeshes.props && track.meshes.glass && frame.mirrorLite === undefined && !envProbe) gfx.drawChunked(track.meshes.glass, MAT_IDENT, _wmGlass);
  if (!hideMeshes.props && track.meshes.water && frame.mirrorLite === undefined) gfx.draw(track.meshes.water, MAT_IDENT,
    wet ? _wmWaterWet : _wmWaterDry);
  if (!hideMeshes.gate) gfx.draw(track.meshes.gate, MAT_IDENT,
    wet ? _wmGateWet : _wmGateDry);
}

const _gradeNight = { shadow: [0.86, 0.94, 1.14], hi: [1.07, 1.00, 0.92], str: 0.30 };
const _gradeDusk  = { shadow: [0.88, 0.97, 1.12], hi: [1.13, 1.02, 0.84], str: 0.36 };
const _gradeDawn  = { shadow: [0.90, 0.96, 1.10], hi: [1.12, 1.00, 0.90], str: 0.30 };
const _gradeDay   = { shadow: [0.90, 0.98, 1.13], hi: [1.13, 1.04, 0.87], str: 0.34 };
const _gradeOut = { shadow: null, hi: null, str: 0 };
const _presentOpts = {};
const _roadReflectionTransition = { value: NaN, target: 1, time: 0, gfx: null };
let _softEl = null;
const _lens = { near: 0, far: 0, fovY: 0, fog: null, cull: 0, cine: false };
function armBackendProbe() {
  if (!_backendProved && _backendBound && !_probeArmed) {
    try { const p = backendPreference();
      if (p === "three" || p === "webgpu") { localStorage.setItem("apex26.gfxBackendProbe", p); _probeArmed = true; } }
    catch (_) {  }
  }
}
function renderLightingPrep(dt, hasLivePlayerShadow) {
  if (!_skyHold) _skyT += dt;
  frameSky.time = _skyT;
  frameSky.starBright = LT.starBright;
  frameSky.cloudSpeed = LT.cloudSpeed;
  frameSky.skyGrad     = LT.skyGrad;
  frameSky.starDensity = LT.starDensity;
  frameSky.daySkyBlue  = LT.daySkyBlue;
  frameSky.mieScatter    = LT.mieScatter;
  frameSky.cloudSilver   = LT.cloudSilver;
  frameSky.coronaAureole = LT.coronaAureole;
  frameSky.sunDiscSize   = LT.sunDiscSize;
  frameSky.starSize      = LT.starSize;
  frameSky.starTwinkle   = LT.starTwinkle;
  frameSky.moonDiscSize  = LT.moonDiscSize;
  frameSky.moonHalo      = LT.moonHalo;
  frameSky.sunCorona     = LT.sunCorona;
  frameSky.sunSquash     = LT.sunSquash;
  frameSky.cityGlowReach = LT.cityGlowReach;
  frameSky.cloudDef      = LT.cloudDef;
  frame.time = _skyT;
  frame.cloud = frameSky.cloud !== undefined ? frameSky.cloud : _cloudBase;
  frame.cloudSpeed = LT.cloudSpeed;
  frame.pitLane = pits.laneUniform();
  frame.pitBox = pits.boxUniform();
  if (wxArc) wxArc.syncWetness(dt);
  {
    const rainfall = wxArc ? wxArc.viewRainfall() : 0;
    const rainTarget = Math.min(1, rainfall);
    const cur = frame.rain || 0;
    frame.rain = cur + (rainTarget - cur) * Math.min(1, dt * 0.8);
  }
  if (raceTimeOfDay === "default" && track && track.def && track.def.night) {
    frameSky.moon = 0.85 * LT.moonBright;
  }
  const wet = isWetRoad();
  const raining = isRaining();
  stormFx.step(dt, {
    raining, state, raceT, skyT: _skyT, seed: simSeed(), weather: raceWeather,
    reduced: motionReduced(), frame, LT, clamp,
    audio: typeof GameAudio !== "undefined" ? GameAudio : null,
  });
  const _floodActive = isFloodActiveSession();
  const _floodDayLvl = (!_floodActive && LT.floodDay > 0) ? LT.floodDay : 0;
  frame.allLights = null; frame.lampBake = null; frame.perChunkLights = 0; frame.roadChunkLamps = 0; frame.tailStart = 0; frame.tailCount = 0;
  if (_floodActive || _floodDayLvl > 0) {
    if (!track._lights || track._lights.length === 0) track._lights = buildTrackLights(track);
    const _lt = LT.lampTemp || 0;
    const _ltr = 1 + Math.max(0, -_lt) * 0.18 - Math.max(0, _lt) * 0.12;
    const _ltg = 1 - Math.abs(_lt) * 0.02;
    const _ltb = 1 - Math.max(0, -_lt) * 0.30 + Math.max(0, _lt) * 0.20;
    frame.glowLights = null;
    frame.lampBake = null;
    if (_floodActive) {
      const _sy = frame.sunDir ? frame.sunDir[1] : -1;
      const nightF = (raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn")
        ? Math.max(LT.twilightFloor != null ? LT.twilightFloor : 0.30,
                   clamp(1 - _sy * (LT.twilightRamp != null ? LT.twilightRamp : 6), 0, 1))
        : 1;
      const lvl  = (0.05 + 0.95 * nightF) * LT.lampLevel;
      const warmth = (1 - nightF) * (LT.twilightWarm != null ? LT.twilightWarm : 1);
      _floodRGB[0] = lvl * (1 + warmth * 0.14) * _ltr;
      _floodRGB[1] = lvl * _ltg;
      _floodRGB[2] = lvl * (1 - warmth * 0.22) * _ltb;
    } else {
      const lvl = _floodDayLvl * LT.lampLevel;
      _floodRGB[0] = lvl * _ltr; _floodRGB[1] = lvl * _ltg; _floodRGB[2] = lvl * _ltb;
    }
    _lightFwd[0] = camTgt[0] - camEye[0]; _lightFwd[2] = camTgt[2] - camEye[2];
    const _pcShed = PerfGov.autoShed();
    const _pcWet = gfx.mobileTier && (frame.wetness || 0) > 0.75 ? 0.6 : 0;
    frame.perChunkLights = (!gfx.hasPerChunkLights || _perChunkOff || _pcShed >= 2) ? 0
      : (_pcShed >= 1 ? Math.min(0.3, Math.max(_pcWet, +LT.perChunkLights || 0)) : Math.max(_pcWet, +LT.perChunkLights || 0));
    frame.roadChunkLamps = (frame.perChunkLights > 0 && (LT.roadChunkLamps || _pcWet > 0)) ? 1 : 0;
    setFrameLights(camEye, _floodRGB, _lightFwd);
    if (LT.lampBake > 0 && gfx.hasLampBake && !(LT.tailLightEmit > 0)) {
      frame.lampBake = LampBake.forTrack(track, track._lights, LT.lampNearClamp, undefined, false, LampBake.budget(gfx));
      frame.lampBakeScale = _floodRGB;
    }
    if (!(frame.perChunkLights > 0)) { frame.allLights = null; frame.allLightsGen = 0; }
    if (_floodActive) appendCarTailLights();
  } else if (track.hasAlwaysLamps) {
    if (!track._alwaysLights || track._alwaysLights.length === 0)
      track._alwaysLights = buildTrackLights(track, true);
    if (track._alwaysLights.length) {
      const _al = LT.lampLevel;
      _lightFwd[0] = camTgt[0] - camEye[0]; _lightFwd[2] = camTgt[2] - camEye[2];
      _alRGB[0] = _alRGB[1] = _alRGB[2] = _al;
      setFrameLights(camEye, _alRGB, _lightFwd, track._alwaysLights);
    } else frame.lights = null;
  } else {
    frame.lights = null;
  }
  if (_studioRig) {
    const rig = buildStudioRig();
    if (rig) { frame.lights = rig; frame.lampBake = null; }
  }
  if (!XrBoot.comfort()) shadowPass.lampPass(frame, _frameNo, hasLivePlayerShadow);
  const _lfSun = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
  const _lfGate = clamp((0.55 - _lfSun) / 0.30, 0, 1);
  frame.lampFog = frame.lights ? Math.min(0.9, LT.lampFogBase + LT.lampFogHaze * (frame.groundMist || 0) * LT.mistDensity) * _lfGate : 0;
  frame.tune = LT;
  return wet;
}

function gfxContextLost() {
  try { if (gfx && gfx.ctxLost) return !!gfx.ctxLost(); const s = gfx && gfx.backendState && gfx.backendState(); return !!(s && s.ctxLost); }
  catch (_) { return false; }
}
function render(dt) {
  if (headlessMode) { mirrorPass.cancelPreparation(); loadingScreen.lowerWaitPlate(); return; }
  if (state === "race" && !raceRestarting) loadingScreen.lowerWaitPlate();
  if (gfxContextLost()) {
    try { mirrorPass.cancelPreparation(); } catch (_) {  }
    if (loadingScreen.phase() === "handoff") loadingScreen.stop();
    if (typeof GfxEscalation !== "undefined" && GfxEscalation.maybeRecoverRaceEntry) GfxEscalation.maybeRecoverRaceEntry(gfxContextLost, quitToMenuAfterCtxLost);
    return;
  }
  if ((gfx.warming && gfx.warming()) || _carWarm.busy) {
    if (setupPreviewOn && !(_studio && _studio.cardUp)) {
      if (canvas.style.visibility !== "hidden") canvas.style.visibility = "hidden";
      if (!_softEl && gfx.softPresent && gfx.softPresent()) _softEl = document.getElementById("game-soft");
      if (_softEl && _softEl.style.visibility !== "hidden") _softEl.style.visibility = "hidden";
    }
    return;
  }
  try { if (!setupPreviewOn && state !== "results" && typeof MenuTeardown !== "undefined" && MenuTeardown.quitRenderHold && MenuTeardown.quitRenderHold() && typeof PerfGov !== "undefined" && PerfGov.softwareRaster && PerfGov.softwareRaster()) return; } catch (_) {  }
  if (uiExperience && uiExperience.renderHome(dt)) { if (loadingScreen.phase() === "busy" && els.overlay && els.overlay.dataset.homeReady) loadingScreen.stop(); return; }
  if (loadingScreen.phase() === "busy" && !setupPreviewOn && els.overlay && !els.overlay.hidden) loadingScreen.stop();
  const homeTrack = !!(uiExperience && uiExperience.trackActive());
  const menuBlank = (state === "menu" && !setupPreviewOn && !homeTrack && (!track || !loadingScreen.active() || !menuWorld() || (typeof MenuTeardown !== "undefined" && MenuTeardown.cover && MenuTeardown.cover())))
    || ((loadingScreen.phase() === "build" || loadingScreen.phase() === "busy") && !setupPreviewOn);
  const garageWarmVeil = setupPreviewOn && !(_studio && _studio.cardUp) &&
    ((gfx.warming && gfx.warming()) || (gfx.warmQueued && gfx.warmQueued()));
  const vis = menuBlank || (_studio && _studio.cardUp) || garageWarmVeil ? "hidden" : "";
  if (canvas.style.visibility !== vis) canvas.style.visibility = vis;
  if (!_softEl && gfx.softPresent && gfx.softPresent()) _softEl = document.getElementById("game-soft");
  if (_softEl && _softEl.style.visibility !== vis) _softEl.style.visibility = vis;
  if (menuBlank && _menuGate.garageWarm > 0 && state === "menu") { const owed = _menuGate.garageWarm; _menuGate.garageWarm--; if (renderSetupPreview(dt)) _menuGate.garageReady = true; else if (gfx.warming && gfx.warming()) _menuGate.garageWarm = owed; return; }
  const warmQueuedHere = !!(track && menuWorld() && gfx.warmQueued && gfx.warmQueued());
  if (menuBlank && !(track && _menuGate.warm > 0) && !warmQueuedHere) return;
  if (menuBlank && !(gfx.warmQueued && gfx.warmQueued()) && --_menuGate.warm === 0) Log.info("gfx", "menu warm drawn " + (track.def && track.def.id));
  if (state === "results" && !resultsCam.live()) return;
  const heldWarm = !!(_studio && _studio.held && track && _menuGate.warm > 0); if (heldWarm) _menuGate.warm--;
  if (setupPreviewOn && !heldWarm) {
    if (renderSetupPreview(dt, !!(_studio && _studio.cardUp))) {
      _menuGate.garageReady = true;
      if (!_studio || _studio.softReady !== false) studioShown();
      if (!_studio || !_studio.cardUp) { canvas.style.visibility = ""; if (_softEl) _softEl.style.visibility = ""; }
    } else if (setupPreviewOn && !(_studio && _studio.cardUp) &&
      ((gfx.warming && gfx.warming()) || (gfx.warmQueued && gfx.warmQueued()))) {
      canvas.style.visibility = "hidden"; if (_softEl) _softEl.style.visibility = "hidden";
    }
    return;
  }
  setupCam.endGarageRes();
  gfx.resize();
  if (!track) return;
  _frameNo++;
  let eyeT, tgtT, fovT, fovBoostT = 0, roadCamRoll = 0;
  let cine = false;
  const comfort = camComfort();
  if (state === "menu") {
    _plOk = false; _plBodyOk = false;
    const fb = (homeTrack && uiExperience.trackCamera(dt)) || FlybySeq.solve(track, flybyProgress(), flybyShots);
    eyeT = fb.eye; tgtT = fb.tgt; fovT = fb.fov; camAncNX = null;
    if (fb.cut) camSnapNext = true;
    cine = true;
  } else {
    if (!player) return;
    { const pa = playerAnchor(player); _plCS = pa.cS; _plCX = pa.cX; _plOk = true; _plBodyOk = false; }
    const pS = _plCS, px = _plCX;
    sampleAt(pS, smp);
    const bankCam = Tracks.banking(track, pS, px, _bankScratchCam, true);
    const bankDy = bankCam ? bankCam.dy : 0;
    if (typeof ExtraRigs !== "undefined") ExtraRigs.tickPitAuto(G);
    const mode = CAM_MODES[camMode].id;
    roadCamRoll = bankCam ? -bankCam.roll * cameraBankScale(mode) : 0;
    const rpCam = renderPosOf(player);
    camAncNX = rpCam.world ? rpCam.x : null; camAncNZ = rpCam.world ? rpCam.z : 0;
    _vantExtra.bankDy = bankDy; _vantExtra.deploy = player.deploying; _vantExtra.reduceMotion = comfort;
    _vantExtra.slipLat = player.vLat || 0; _vantExtra.att = player;
    _vantExtra.carPos = rpCam.world ? (_vantCarPos[0] = rpCam.x, _vantCarPos[1] = rpCam.z, _vantCarPos) : null;
    _vantExtra.carHead = headInterp(player); _vantExtra.dt = dt; _vantExtra.frameSubject = realRace.isWatch();
    if (typeof CamFeel !== "undefined") {
      CamFeel.tickRace(mode, dt, comfort, state === "race" || state === "count",
        clamp(player.speed / vTop(), 0, 1));
    }
    if (typeof ExtraRigs !== "undefined") {
      _vantExtra.rival = (mode === "rival") ? ExtraRigs.pickRival(cars, player) : null;
      _vantExtra.playerProg = player.prog || 0;
      _vantExtra.snap = false;
    }
    const vant = camVantage(mode, pS, px, player.speed, performance.now(), _vantExtra);
    eyeT = vant.eye; tgtT = vant.tgt; fovT = vant.fov; fovBoostT = vant.fovBoost || 0; if (vant.cut) camSnapNext = true;
    if (feel.shake > 0) {
      feel.shake = Math.max(0, feel.shake - dt * 1.6);
      if (typeof CamFeel !== "undefined") CamFeel.shake(eyeT, tgtT, CamTune.shakeOffset(feel.shake, comfort), performance.now() * 0.001, CamFeel.isBuzzMode(mode));
    }
    const _buzzWet = 1.0 - clamp((frame.wetness || 0) * 2.0, 0.0, 1.0);
    if (state === "race" && _buzzWet > 0.01
        && (typeof CamFeel !== "undefined" ? CamFeel.isBuzzMode(mode)
          : (mode === "cockpit" || mode === "hood" || mode === "visor" || mode === "tcam"))) {
      const spV = clamp(player.speed / vTop(), 0, 1);
      const vAmp = CamTune.buzzAmp(spV, player.deploying, comfort, _buzzWet);
      if (vAmp > 0.001) {
        const tv = performance.now() * 0.001;
        const j1 = Math.sin(tv * 61.0) * 0.6 + Math.sin(tv * 97.0 + 1.7) * 0.4;
        const j2 = Math.sin(tv * 73.0 + 0.9) * 0.6 + Math.sin(tv * 111.0 + 2.3) * 0.4;
        eyeT[0] += j1 * vAmp; eyeT[1] += j2 * vAmp * 0.7;
        tgtT[0] += j1 * vAmp * 0.35; tgtT[1] += j2 * vAmp * 0.25;
      }
    }
  }
  if (frozen && skyViewOverride) {
    eyeT = skyViewOverride.eye;
    tgtT = skyViewOverride.tgt;
    fovT = skyViewOverride.fov;
  }
  const racing = state === "race" || state === "count";
  const camId = CAM_MODES[camMode].id;
  const onboard = racing && (camId === "cockpit" || camId === "hood" || camId === "visor" || camId === "helmet" || camId === "tcam");
  const cutEase = camCutT > 0 ? (camCutT = Math.max(0, camCutT - dt), 0.4) : 1;
  const softCam = camId === "drone" || camId === "rival" || camId === "pitwall";
  const raceLam = softCam ? (comfort ? 6 : (camId === "drone" ? 12 : 14)) : ((camId === "heli" || camId === "side" || camId === "cinematic" || camId === "overhead" || camId === "low" || camId === "trackside") ? 9 : 18);
  const lE = onboard ? 400 : (racing ? raceLam : 1.6) * cutEase;
  const gentleHead = !comfort && onboard && (camId === "cockpit" || camId === "hood" || camId === "visor" || camId === "helmet") && (typeof CockpitOpts === "undefined" || CockpitOpts.turnChase());
  const lT = gentleHead ? 7 : onboard ? 400 : (racing ? raceLam + (softCam ? 1 : 2) : 10) * cutEase;
  const ancX = camAncNX, ancZ = camAncNZ;
  if (ancX === null || camAncX === null) { camAncX = ancX; camAncZ = ancZ; }
  const aP = _camAP, aN = _camAN;
  aP[0] = camAncX === null ? 0 : camAncX; aP[2] = camAncZ;
  aN[0] = ancX === null ? 0 : ancX; aN[2] = ancZ;
  const fixedEye = camId === "trackside" || camId === "pitwall";
  for (let i = 0; i < 3; i++) {
    camEye[i] = fixedEye ? damp(camEye[i], eyeT[i], lE, dt) : aN[i] + damp(camEye[i] - aP[i], eyeT[i] - aN[i], lE, dt);
    camTgt[i] = aN[i] + damp(camTgt[i] - aP[i], tgtT[i] - aN[i], lT, dt);
  }
  camAncX = ancX; camAncZ = ancZ;
  camFov = damp(camFov, fovT, onboard ? 4 : 4 * cutEase, dt); camFovBoost = damp(camFovBoost, fovBoostT, onboard ? 4 : 4 * cutEase, dt);
  if (typeof CamFeel !== "undefined" && CamFeel.consumeAimSnap()) { for (let i = 0; i < 3; i++) camTgt[i] = tgtT[i]; feel.camRoll = -feel.camRoll; }
  if (camSnapNext) {
    for (let i = 0; i < 3; i++) { camEye[i] = eyeT[i]; camTgt[i] = tgtT[i]; }
    camFov = fovT; camFovBoost = fovBoostT;
    camSnapNext = false;
  }
  if (dbgCam && dbgCam.cine) cine = true;
  if (dbgCam || cine || comfort) {
    feel.camRoll = (dbgCam && dbgCam.roll) || 0;
  } else {
    const slipRaw = player && player.speed > 1 ? (player.vLat || 0) / player.speed : 0;
    camSlipSm = damp(camSlipSm, clamp(slipRaw, -1, 1), 10, dt);
    feel.camRoll = damp(feel.camRoll, (typeof CamFeel !== "undefined" && CamFeel.lookingBackNow() ? -1 : 1) * CamTune.rollTarget(roadCamRoll, camSlipSm, (onboard && player ? (player.baRoll || 0) * 0.85 : 0), false), 7, dt);
  }
  let fovY, farPlane = 900 * (LT.renderDistMul != null ? LT.renderDistMul : 1);
  if (cine) farPlane = FlybySeq.FAR;
  if (dbgCam) {
    GameCams.applyFreeCam(dbgCam, camEye, camTgt);
    fovY = dbgCam.fov * Math.PI / 180;
    if (!cine) farPlane = dbgCam.far;
  } else {
    fovY = CamFovFit.fitFovY(camFov * Math.PI / 180, gfx.aspect, { cine, boost: camFovBoost * Math.PI / 180 });
  }
  const _projMode = CAM_MODES[camMode] ? CAM_MODES[camMode].id : "chase";
  const _nearM = (_projMode === "cockpit" || _projMode === "hood" || _projMode === "visor" || _projMode === "helmet") ? 0.3 : 0.9;
  const _near = cine ? FlybySeq.NEAR : (dbgCam ? 0.3 : _nearM);
  M4.perspectiveTo(_mProj, fovY, gfx.aspect, _near, farPlane);
  if (homeTrack && !dbgCam) { const view = uiExperience.trackCamera(); _mProj[8] = view.shiftX; _mProj[9] = view.shiftY; }
  {
    let bx = camEye[0] - camTgt[0], by = camEye[1] - camTgt[1], bz = camEye[2] - camTgt[2];
    let bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
    let rx = 1 * bz - 0 * by, ry = 0 * bx - 0 * bz, rz = 0 * by - 1 * bx;
    let rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    const s = Math.sin(feel.camRoll);
    let ux = rx * s, uy = 1 + ry * s, uz = rz * s;
    let ul = Math.hypot(ux, uy, uz) || 1;
    _camUp[0] = ux / ul; _camUp[1] = uy / ul; _camUp[2] = uz / ul;
  }
  M4.lookAtTo(_mView, camEye, camTgt, _camUp);
  M4.mulTo(_mVP, _mProj, _mView);
  M4.invertTo(_mInvVP, _mVP);
  M4.invertTo(_mInvProj, _mProj);
  {
    const sd = frame.sunDir || [0, 1, 0];
    let x = _mView[0]*sd[0] + _mView[4]*sd[1] + _mView[8]*sd[2];
    let y = _mView[1]*sd[0] + _mView[5]*sd[1] + _mView[9]*sd[2];
    let z = _mView[2]*sd[0] + _mView[6]*sd[1] + _mView[10]*sd[2];
    const l = Math.hypot(x, y, z) || 1;
    _sunVS[0] = x/l; _sunVS[1] = y/l; _sunVS[2] = z/l;
  }
  {
    let nx = 0, ny = 1, nz = 0;
    if (track && player && player.s != null) {
      Tracks.sample(track, player.s, _smpRoad);
      const t = _smpRoad.t, r = _smpRoad.r;
      const ux = r[1]*t[2] - r[2]*t[1],
            uy = r[2]*t[0] - r[0]*t[2],
            uz = r[0]*t[1] - r[1]*t[0];
      const ul = Math.hypot(ux, uy, uz);
      if (ul > 1e-6) { nx = ux/ul; ny = uy/ul; nz = uz/ul; }
    }
    const x = _mView[0]*nx + _mView[4]*ny + _mView[8]*nz,
          y = _mView[1]*nx + _mView[5]*ny + _mView[9]*nz,
          z = _mView[2]*nx + _mView[6]*ny + _mView[10]*nz;
    const l = Math.hypot(x, y, z) || 1;
    _upVS[0] = x/l; _upVS[1] = y/l; _upVS[2] = z/l;
  }
  frame.viewProj = _mVP;
  frame.proj = _mProj;
  frame.invProj = _mInvProj;
  frame.invViewProj = _mInvVP;
  frame.sunViewDir = _sunVS;
  frame.upViewDir = _upVS;
  frame.eye = camEye;
  const _xrEyes = XrBoot.applyEyes(frame, camEye, camTgt, _camUp);
  const _fogMul = cine ? FlybySeq.FOG
    : (dbgCam ? (dbgCam.fog != null ? dbgCam.fog : 0.15) : null);
  const _cullFog = frame.cullFog || (frame.cullFog = [0, 0]);
  _cullFog[0] = (dbgCam || cine) ? 0 : (frame.fogDensity || 0) * (LT.fogDensityMul != null ? LT.fogDensityMul : 1);
  _cullFog[1] = LT.fogHeight != null ? LT.fogHeight : (frame.fogHeight || 0);
  const _farCull = farPlane * Math.hypot(1, Math.tan(fovY * 0.5) * Math.hypot(1, gfx.aspect || 1));
  frame.cullDist = (dbgCam || cine) ? (gfx.isMobile ? 700 : 0) : (PerfGov.tier() >= 3 ? farPlane : _farCull);
  _lens.near = _near; _lens.far = farPlane; _lens.fovY = fovY;
  _lens.fog = _fogMul; _lens.cull = frame.cullDist; _lens.cine = cine;
  {
    const _mAmt = (raceTimeOfDay === "default" && track && track.def && track.def.night)
      ? 0.85 * LT.moonBright : (frameSky.moon || 0);
    const _mCl = frameSky.cloud !== undefined ? frameSky.cloud : _cloudBase;
    let _cf = (_mCl - 0.35) / 0.25;
    _cf = _cf < 0 ? 0 : _cf > 1 ? 1 : _cf;
    _cf = _cf * _cf * (3 - 2 * _cf);
    frame.moonK = raceWeather === "fog" ? 0
      : clamp(_mAmt / 0.85, 0, 1) * (1 - _cf) * (1 - clamp((frame.wetness || 0) * 2, 0, 1));
    const _msh = LT.moonShadow != null ? LT.moonShadow : 0.25;
    frame.moonGate = Math.max(frame.moonK, clamp((_msh - 0.5) * 2, 0, 1));
  }
  const _hasLivePlayerShadow = !!(player && state !== "menu");
  if (_hasLivePlayerShadow) { currentCarGroundMat(player, shadowPass.livePlayerMat); shadowPass.resolvePlayer(_smpPlayer, yawVisInterp(player)); }
  if (!XrBoot.comfort()) shadowPass.sunPass(frame, _frameNo, _hasLivePlayerShadow);
  const wet = renderLightingPrep(dt, _hasLivePlayerShadow);


  const night = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night);
  const preGrid = state === "count";
  const gridFlash = preGrid && CarMesh.gridStrobe(countT);
  const _floodEmit = _atmo.floodEmit(frame.sunDir ? frame.sunDir[1] : null);
  _lastFloodEmit = _floodEmit;
  frameSky.lightning = stormFx._ltFlash || 0;
  const _envMask = (!frozen && (
    (gfx.getRenderScale && gfx.getRenderScale() < 0.98) ||
    (PerfGov.autoShed && PerfGov.autoShed() > 0)
  )) ? 7 : 3;
  if (player && (state === "race" || state === "count") && !_envProbeOff && !_raceEntryEnvProbeSession && PerfGov.tier() < 1 && !paused && !dbgCam && (frozen || (_frameNo & _envMask) === 0) && gfx.envFaceBegin && gfx.envProbeOptOut !== true && LT.carEnvCube > 0.001 && !hideMeshes.cars) {
    Tracks.sample(track, player.s, smp2);
    const _pex = smp2.p[0] + smp2.r[0] * player.x, _pey = smp2.p[1] + 0.9, _pez = smp2.p[2] + smp2.r[2] * player.x;
    const _es = frame.sunDir || _envUp, _ew = frame.wetness || 0, _elg = frame.lampSetGen || 0;
    if (_envHold) {
      const dx = _pex - _envLatch[0], dy = _pey - _envLatch[1], dz = _pez - _envLatch[2];
      if (dx * dx + dy * dy + dz * dz > ENV_HOLD_MOVE_M * ENV_HOLD_MOVE_M
        || Math.abs(_es[0] - _envLatch[3]) > 1e-4 || Math.abs(_es[1] - _envLatch[4]) > 1e-4 || Math.abs(_es[2] - _envLatch[5]) > 1e-4
        || Math.abs(_ew - _envLatch[6]) > 1e-3 || raceTimeOfDay !== _envLatchTod || _elg !== _envLatch[7])
        { _envHold = false; _envFace = -1; }
    }
    if (!_envHold) {
      _envFace = (_envFace + 1) % 6;
      _envEye[0] = _pex; _envEye[1] = _pey; _envEye[2] = _pez;
      const _envInv = gfx.envFaceBegin(_envFace, _envEye, frame);
      if (_envInv) {
        frameSky.invViewProj = _envInv;
        try { drawWorldMeshes(frame, night, wet, _floodEmit, false, true); gfx.drawSky(frameSky); }
        finally { gfx.envFaceEnd(_envFace); }
      }
      if (_envFace === 5) {
        _envHold = true; _envLatchTod = raceTimeOfDay;
        _envLatch[0] = _pex; _envLatch[1] = _pey; _envLatch[2] = _pez; _envLatch[3] = _es[0];
        _envLatch[4] = _es[1]; _envLatch[5] = _es[2]; _envLatch[6] = _ew; _envLatch[7] = _elg;
      }
    }
  } else if (PerfGov.tier() >= 1 && gfx.envProbeReady && gfx.envProbeReady()) {
    gfx.envProbeReset(); _envHold = false; _envFace = -1;
  }
  carDraw.advanceWheelPhases(dt);
  mirrorPass.render(frame, frameSky, night, wet, _floodEmit);
  let _b;
  if (_fogMul != null) {
    const bf = frame.fogDensity;
    frame.fogDensity = bf * _fogMul;
    _b = gfx.begin(frame);
    frame.fogDensity = bf;
  } else _b = gfx.begin(frame);
  if (_b === false) return;
  frameSky.invViewProj = _mInvVP;
  drawWorldMeshes(frame, night, wet, _floodEmit, false);
  gfx.drawSky(frameSky);
  if (typeof PitSigns !== "undefined") {
    const cue = pits && pits.lastCue ? pits.lastCue() : null;
    PitSigns.draw(gfx, track, MAT_IDENT, frame.eye, night, hideMeshes.pitSigns,
                  !!cue && PIT_LAMP_GREEN.indexOf(cue.phase) >= 0);
  }
  if (state !== "menu") skids.draw(gfx, camEye);
  if (state !== "menu" && !cine && track && player) DrivingLine.draw(gfx, drivingLineApi(track), Math.abs(player.speed));
  const cockpitRigOnly = !dbgCam && (state === "race" || state === "count") && (CAM_MODES[camMode].id === "cockpit" || CAM_MODES[camMode].id === "helmet");
  const visorEye = !dbgCam && (state === "race" || state === "count") && CAM_MODES[camMode].id === "visor";
  let _camFwdX = camTgt[0] - camEye[0], _camFwdZ = camTgt[2] - camEye[2];
  { const l = Math.hypot(_camFwdX, _camFwdZ) || 1; _camFwdX /= l; _camFwdZ /= l; }
  const _carCullPlanes = (gfx.makeFrustumPlanes && frame.viewProj)
    ? gfx.makeFrustumPlanes(frame.viewProj, _pbPlanes) : null;
  const paint = carPaintMat(wet
    ? (night ? PAINT_WET_NIGHT : PAINT_WET_DAY)
    : (night ? PAINT_DRY_NIGHT : PAINT_DRY_DAY));
  carFx.haze.pick(cars, player, onboard, track ? track.total : 0, dt); shadowPass.beginFrame();
  carDraw.beginDecals(); carDraw.primeRace(paint, night);
  const _fxCullR = 110 / (1 + ((typeof PerfGov !== "undefined" && PerfGov.autoShed) ? (PerfGov.autoShed() | 0) : 0));
  const _fxCullR2 = _fxCullR * _fxCullR;
  for (const c of cars) {
    if (state === "menu" && !loadingScreen.active() && !(photoStudio && photoStudio.hasCar())) break;
    if (!c.isPlayer && player && !dbgCam) {
      const ds = Math.abs(c.s - player.s);
      if (Math.min(ds, track.total - ds) > 550) continue;
    }
    const rp = renderPosOf(c);
    if (!c.isPlayer && rp.world && (rp.x - camEye[0]) * _camFwdX + (rp.z - camEye[2]) * _camFwdZ < -6) continue;
    let cS, cX;
    if (c.isPlayer && _plOk) { cS = _plCS; cX = _plCX; }
    else { const pa = playerAnchor(c); cS = pa.cS; cX = pa.cX; }
    c.xVis = cX;
    const renderX = cX;
    let bankC;
    if (c.isPlayer && _plBodyOk) {
      const S = _smpPlayer, p = smp2.p, t = smp2.t, r = smp2.r;
      p[0] = S.p[0]; p[1] = S.p[1]; p[2] = S.p[2]; t[0] = S.t[0]; t[1] = S.t[1]; t[2] = S.t[2];
      r[0] = S.r[0]; r[1] = S.r[1]; r[2] = S.r[2]; smp2.hw = S.hw; bankC = _bankPlayer;
      tmpP[0] = rp.world ? rp.x : p[0] + r[0] * renderX;
      tmpP[1] = p[1] + bankC.dy;
      tmpP[2] = rp.world ? rp.z : p[2] + r[2] * renderX;
    } else {
      sampleAt(cS, smp2);
      { const t = smp2.t, r = smp2.r;
        let l = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
        l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l; }
      tmpP[0] = rp.world ? rp.x : smp2.p[0] + smp2.r[0] * renderX;
      tmpP[2] = rp.world ? rp.z : smp2.p[2] + smp2.r[2] * renderX;
      tmpP[1] = smp2.p[1];
      if (!c.isPlayer) {
        const dx = tmpP[0] - camEye[0], dz = tmpP[2] - camEye[2];
        if (dx * _camFwdX + dz * _camFwdZ < -6) continue;
        const dy = tmpP[1] - camEye[1];
        if (GameCams.eyeInsideCar(-(dx * smp2.t[0] + dz * smp2.t[2]), -(dx * smp2.r[0] + dz * smp2.r[2]), -dy, _nearM + 0.3)) continue;
      }
      bankC = Tracks.banking(track, cS, renderX, _bankScratch);
      tmpP[1] = smp2.p[1] + (bankC ? bankC.dy : 0);
    }
    const yv = yawVisInterp(c);
    const cy = Math.cos(yv), sy = Math.sin(yv);
    for (let i = 0; i < 3; i++) {
      tmpF[i] = smp2.t[i] * cy + smp2.r[i] * sy;
      tmpR[i] = smp2.r[i] * cy - smp2.t[i] * sy;
    }
    tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
    tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
    tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
    for (let i = 0; i < 3; i++) {
      _groundR[i] = tmpR[i]; _groundF[i] = tmpF[i]; _groundU[i] = tmpU[i];
    }
    if (bankC && bankC.roll) {
      const cr = Math.cos(bankC.roll), sr = Math.sin(bankC.roll);
      for (let i = 0; i < 3; i++) {
        const r = _groundR[i], u = _groundU[i];
        _groundR[i] = r * cr + u * sr;
        _groundU[i] = u * cr - r * sr;
      }
    }
    basisMat(_groundR, _groundU, _groundF, tmpP, _groundMat);
    const _vF = Math.min(1, Math.abs(c.speed || 0) / vTop());
    const _ba = bodyAttitude.update(c, tmpP[1], dt, (c.speed || 0) * smp2.t[1], aeroDfMult(c) * _vF * _vF, _vF);
    const _baPitch = _ba.pitch, _baRoll = _ba.roll, _baHeave = _ba.heave;
    if (_baPitch) {
      const cp = Math.cos(_baPitch), sp = Math.sin(_baPitch);
      for (let i = 0; i < 3; i++) {
        const f = tmpF[i], u = tmpU[i];
        tmpF[i] = f * cp - u * sp;
        tmpU[i] = u * cp + f * sp;
      }
    }
    const rollTot = (bankC && bankC.roll ? bankC.roll : 0) + (_baRoll || 0);
    if (rollTot) {
      const cr = Math.cos(rollTot), sr = Math.sin(rollTot);
      for (let i = 0; i < 3; i++) {
        const r = tmpR[i], u = tmpU[i];
        tmpR[i] = r * cr + u * sr;
        tmpU[i] = u * cr - r * sr;
      }
    }
    basisMat(tmpR, tmpU, tmpF, tmpP, tmpMat);
    if (_baHeave) tmpMat[13] += _baHeave;
    if (c.pitState === "box") { const a = pits.stopAnim(c); if (a.lift) tmpMat[13] += a.lift; }
    if (!FieldLod.on) shadowPass.pushCaster(_groundMat, c.team, c);
    carFx.marks(c, _groundMat, dt, state);
    carFx.haze.mark(c, tmpMat);
    const _lodD2 = FieldLod.d2(tmpP, camEye, c.isPlayer), _lod = FieldLod.tier(_lodD2, fovY, c);
    if (!c.isPlayer && _carCullPlanes) {
      const x = tmpP[0], y = tmpP[1], z = tmpP[2], r = 8;
      let _out = false;
      for (let i = 0; i < 6; i++) {
        const p = _carCullPlanes[i];
        if (p[0] * x + p[1] * y + p[2] * z + p[3] < -r) { _out = true; break; }
      }
      if (_out) continue;
    }
    if (FieldLod.on) shadowPass.pushCaster(_groundMat, c.team, c, FieldLod.castsShadow(_lodD2));
    if (c.isPlayer && state === "race") {
      const skid = c.skidIntensity || 0;
      skids.stamp(_groundMat, (skid > 0.25 || c.offroad) && c.speed > 10, dt);
    }
    if (state !== "menu") {
      const fdx = tmpP[0] - camEye[0], fdz = tmpP[2] - camEye[2];
      if (fdx * fdx + fdz * fdz < _fxCullR2) {
        if (c.fxSparkI) {
          Particles.sparks(tmpMat[12], tmpMat[13] + 0.18, tmpMat[14],
            -tmpF[0], -tmpF[2], 4 + c.fxSparkI * 10, 6 + Math.round(c.fxSparkI * 14));
          c.fxSparkI = 0;
        }
        if (c.isPlayer && c.speed > 14 && Math.random() < dt * 22) {
          const side = c.x > Tracks.wallAt(track, c.s, 1) - 0.12 ? 1
                     : c.x < -Tracks.wallAt(track, c.s, -1) + 0.12 ? -1 : 0;
          if (side) {
            Particles.sparks(tmpMat[12] + tmpR[0] * side * 0.95, tmpMat[13] + 0.12,
              tmpMat[14] + tmpR[2] * side * 0.95, -tmpF[0], -tmpF[2], 4 + c.speed * 0.22, 5);
          }
        }
        let smokeI = (c.isPlayer && !c.offroad) ? (c.skidIntensity || 0) : 0;
        const locked = !c.offroad && vStd(c.speed) > 8 && (c.wheelLock || 0) > 0.3;
        if (locked) smokeI = Math.max(smokeI, c.wheelLock);
        if (c.isPlayer && !c.offroad) {
          const _pax = c.axEstSm || 0, _pvl = Math.abs(c.vLat || 0);
          if (c.speed > 10) smokeI = Math.max(smokeI, clamp((_pvl - 3) / 5, 0, 1));
          if (c.speed > 0.5 && c.speed < 12)
            smokeI = Math.max(smokeI, clamp((aStd(_pax) - 4.5) / 2.5, 0, 1) * clamp((12 - c.speed) / 9, 0, 1));
        }
        if (smokeI > 0.25) {
          const wd = carDraw.WHEELS[(locked ? 0 : 2) + ((Math.random() * 2) | 0)];
          Particles.tyreSmoke(
            tmpMat[12] + tmpMat[0] * wd.x + tmpMat[8] * wd.z,
            tmpMat[13] + tmpMat[1] * wd.x + tmpMat[9] * wd.z + 0.10,
            tmpMat[14] + tmpMat[2] * wd.x + tmpMat[10] * wd.z,
            -tmpF[0] * (1.5 + c.speed * 0.12), -tmpF[2] * (1.5 + c.speed * 0.12),
            Math.min(smokeI, 1),
            dt * (16 + 44 * Math.min(smokeI, 1)));
        }
        if (c.offroad && c.speed > 10) {
          const wd = carDraw.WHEELS[2 + ((Math.random() * 2) | 0)];
          const dirt = Math.random() < 0.5;
          Particles.kickup(
            tmpMat[12] + tmpMat[0] * wd.x + tmpMat[8] * wd.z,
            tmpMat[13] + tmpMat[1] * wd.x + tmpMat[9] * wd.z,
            tmpMat[14] + tmpMat[2] * wd.x + tmpMat[10] * wd.z,
            -tmpF[0] * c.speed * 0.35, -tmpF[2] * c.speed * 0.35,
            dirt ? 0.46 : 0.30, dirt ? 0.40 : 0.36, dirt ? 0.26 : 0.15,
            dt * 30);
        }
        const _sdx = tmpMat[12] - camEye[0], _sdz = tmpMat[14] - camEye[2];
        if (wet && vStd(c.speed) > 15 && Particles.sprayAdmit(_sdx * _sdx + _sdz * _sdz)) {
          const str = Particles.sprayStr(vStd(c.speed), Storm.sprayK(raceWeather), frame.wetness);
          const sxo = (((Math.random() * 3) | 0) - 1) * 0.6;
          Particles.spray(
            tmpMat[12] + tmpMat[0] * sxo - tmpF[0] * 2.1,
            tmpMat[13] + 0.28,
            tmpMat[14] + tmpMat[2] * sxo - tmpF[2] * 2.1,
            -tmpF[0] * c.speed * 0.28, -tmpF[2] * c.speed * 0.28, str,
            dt * Particles.sprayRate(str));
        }
        carFx.emit(c, _groundMat, dt, state);
      }
    }
    if (c.isPlayer && (cockpitRigOnly || visorEye)) {
      GameCams.cockpitViewmodelAxes(smp2.r, smp2.t, yv, camEye, tmpR, _cockU, tmpF, _cockP,
        GameCams.seatFwd(visorEye ? "visor" : "cockpit"), GameCams.seatUp(visorEye ? "visor" : "cockpit"));
      basisMat(tmpR, _cockU, tmpF, _cockP, _cockMat);
      drawCockpitRig(c, _cockMat, dt, paint, visorEye);
      if (c.pitState === "box") {
        _wheelOpts.emissive = night ? 0.12 : 0;
        drawPitCrew(c, _groundMat, _wheelOpts);
      }
      continue;
    }
    const pt = carDraw.paintTeam(c);
    const sharedBody = FieldLod.on && !c.isPlayer && _lod >= 2;
    const body = carDraw.modelBuf ? null : (c.isPlayer ? playerBodyMesh(c.team, c)
      : (sharedBody ? carDraw.sharedRivalBodyMesh(FieldLod.farBody(_lodD2, fovY, c)) : teamBodyMesh(c.team, c)));
    if (body) {
      gfx.draw(body, tmpMat, sharedBody ? carDraw.coOpt(paint) : paint);
      if (_lod < 2) queueCarDecals(pt, tmpMat, carDecalNum(c.team, c), false, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
      _wheelOpts.emissive = night ? 0.12 : 0;
      drawPlayerWheels(c, _groundMat, dt, _wheelOpts);
      if (c.pitState === "box") drawPitCrew(c, _groundMat, _wheelOpts);
    } else {
      const wholeCarMat = c.isPlayer ? _groundMat : tmpMat;
      gfx.draw(teamMesh(c.team, c), wholeCarMat, paint);
      queueCarDecals(pt, wholeCarMat, carDecalNum(c.team, c), false, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
      if (c.pitState === "box") drawPitCrew(c, _groundMat, _wheelOpts);
    }
    if (!carDraw.modelBuf) {
      const fdx = tmpP[0] - camEye[0], fdy = tmpP[1] - camEye[1], fdz = tmpP[2] - camEye[2];
      const aSt = teamDecalState(pt, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
      drawAeroFlaps(pt, aSt.val, c.aeroX || 0, tmpMat, paint, aSt.aero, null,
        !c.isPlayer && fdx * fdx + fdy * fdy + fdz * fdz >= FieldLod.flapsM() ** 2);
    }
    const _ledStrobe = ((raceT * 4.4) % 1) < 0.55;
    const ersCode = preGrid ? -1 : CarMesh.ersLightCode(c, raceT);
    if (preGrid ? gridFlash
                : ersCode >= 0 ? ersCode === 1
                : ((wet && _ledStrobe) || (!wet && night))) {
      const ldx = tmpP[0] - camEye[0], ldy = tmpP[1] - camEye[1], ldz = tmpP[2] - camEye[2], lGate = preGrid ? 200 : wet ? 150 : 40;
      if (c.isPlayer || ldx * ldx + ldy * ldy + ldz * ldz < lGate * lGate) {
        drawRearLights(tmpMat, (wet || preGrid || ersCode === 1) ? 1.0 : (0.45 + 0.55 * clamp(c.energy || 0, 0, 1)));
      }
    }
    if (frame.glowLights && frame.glowLights !== frame.lights) {
      const tgR = LT.tailRange != null ? LT.tailRange : 160;
      const tgd = Math.hypot(tmpP[0] - camEye[0], tmpP[2] - camEye[2]);
      const tgF = c.isPlayer ? 1 : clamp((tgR - tgd) / (tgR * 0.4), 0, 1);
      if (tgF > 0) CarMesh.drawTailGlow(_groundMat, tgF * LT.tailLightMul * (1 + clamp(c.brakeHeat || 0, 0, 1) * LT.brakeGlowMul * 1.6), track, c.s);
    }
    if (!carDraw.modelBuf && vStd(c.speed) < 5.56) {
      const mdx = tmpP[0] - camEye[0], mdy = tmpP[1] - camEye[1], mdz = tmpP[2] - camEye[2];
      if (c.isPlayer || mdx * mdx + mdy * mdy + mdz * mdz < 40 * 40) {
        const mSt = teamDecalState(pt, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
        const cm = mSt.parts && mSt.parts._visual && mSt.parts._visual.cockpit;
        drawMirrorLights(tmpMat, Car3D.mirrorLightAnchors(Car3D.bodyStyleKey(c.team.id, carDraw.livOf(pt).bodyStyle), cm && cm.mirror));
      }
    }
    carDraw.drawExhaustFx(c, tmpMat, c.isPlayer && isErsDeploying(c), FieldLod.flame(_lodD2));
  }
  CarMesh.flushTailGlows();
  carDraw.flushDecals(night);
  shadowPass.flushBlobs();
  if (isTimeTrial() && player && (state === "race" || state === "count")) {
    const replayGhost = GhostShare.hasGuest() ? GhostShare : Ghost;
    const g = (player.lap | 0) >= 1 ? replayGhost.at(player.lapTime) : null;
    let gDs = Infinity;
    if (g) { const d = Math.abs(g.s - player.s); gDs = Math.min(d, track.total - d); }
    if (g && gDs > 3.0) {
      Tracks.sample(track, g.s, smp2);
      { const t = smp2.t, r = smp2.r;
        let l = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
        l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l; }
      tmpP[0] = smp2.p[0] + smp2.r[0] * g.x;
      tmpP[1] = smp2.p[1];
      tmpP[2] = smp2.p[2] + smp2.r[2] * g.x;
      const gdx = tmpP[0] - camEye[0], gdy = tmpP[1] - camEye[1], gdz = tmpP[2] - camEye[2];
      if (gdx * gdx + gdy * gdy + gdz * gdz < 3.4 * 3.4) {  } else {
      for (let i = 0; i < 3; i++) { tmpF[i] = smp2.t[i]; tmpR[i] = smp2.r[i]; }
      tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
      tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
      tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
      basisMat(tmpR, tmpU, tmpF, tmpP, tmpMat);
      gfx.draw(teamMesh(player.team, player), tmpMat, _ghostOpts);
      }
    }
  }

  const _glowF = FrameLights.glowFade();
  if (frame.lights && !_studioRig && _glowF > 0) gfx.drawGlow(frame.glowLights || frame.lights, PostCommon.softwareGlowScale(LT.glareStr * _glowF));
  if (DebrisWorld.active()) DebrisWorld.draw();

  if (Particles.rainActive()) Particles.rainUpdate(dt, camEye, wxArc.viewRainfall());
  startLights.update();
  marshalPanels.update(dt);
  Particles.update(dt);
  Particles.draw();
  Droplets.tick(paused ? 0 : dt, onboard && !photoMode, frame.rain || 0, Storm.is(raceWeather), player ? vStd(player.speed) : 0, motionReduced());

  let _grade, _bloom = 0.55, _thresh = 0.78;
  if (raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night)) {
    _grade = _gradeNight;
    const _neonCity = track.def.theme === "street_night" || track.def.theme === "modern";
    _bloom = _neonCity ? 0.48 : 0.55;
    _thresh = 0.97;
  } else if (raceTimeOfDay === "dusk") {
    _grade = _gradeDusk;
    _bloom = 0.52; _thresh = 0.82;
  } else if (raceTimeOfDay === "dawn") {
    _grade = _gradeDawn;
    _bloom = 0.52; _thresh = 0.82;
  } else {
    _grade = _gradeDay;
    _bloom = 0.60; _thresh = 0.82;
  }
  const _grSunY = frame.sunDir ? frame.sunDir[1] : -1;
  const _grLow = clamp(1 - _grSunY * 1.4, 0, 1);
  const _hazeWet   = LT.hazeWetShare   != null ? LT.hazeWetShare   : 0.22;
  const _hazeCloud = LT.hazeCloudShare != null ? LT.hazeCloudShare : 0.12;
  const _mist = clamp((frame.groundMist || 0) * LT.mistDensity * 0.9 + (frame.wetness || 0) * _hazeWet
                      + (frame.cloud || 0) * _hazeCloud, 0, 1);
  const _sunLumGR = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
  const _sunGateGR = clamp((_sunLumGR - 0.35) / 0.45, 0, 1);
  const _grLowBoost = LT.godrayLowBoost != null ? LT.godrayLowBoost : 0.55;
  const _grBase     = LT.godrayBase != null ? LT.godrayBase : 0.38;
  let _gr = (_grBase + _grLowBoost * _grLow) * clamp(_grSunY / 0.02, 0, 1) * (1 + 0.25 * _mist) * _sunGateGR * LT.grMul;
  const _lampVol = (frame.lights && _sunLumGR < 0.45 && !gfx.mobileTier)
    ? clamp(LT.lampVolBase + LT.lampVolHaze * _mist, 0, LT.lampVolCap) : 0;
  const _cs = _sunLumGR > 0.35 ? clamp(0.5 * LT.contactStr, 0, 1.5) : 0;
  const _ssr = ((frame.wetness || 0) > 0.01) ? frame.wetness * LT.ssrWetMul
             : (frame.lights ? LT.ssrDryNight : LT.ssrDryDay);
  const _ssrPo = (_ssr * 0.204 < 1 / 64 && (PerfGov.tier() >= 2 || (_ssrDayGate && !frame.lights && (frame.wetness || 0) <= 0.01))) ? 0 : _ssr;
  const _ao = _sunLumGR > 0.35 ? 0.95 * LT.aoStr : 0;
  if (_grade) {
    _gradeOut.str = (_grade.str || 0) * LT.gradeStr;
    _gradeOut.shadow = LT.shadowHue ? hueRotateTint(_grade.shadow, LT.shadowHue) : _grade.shadow;
    _gradeOut.hi     = LT.hiHue     ? hueRotateTint(_grade.hi, LT.hiHue)         : _grade.hi;
    _grade = _gradeOut;
  }
  const _spd = LT.speedBlur > 0 ? LT.speedBlur * clamp((((player && player.speed) || 0) / vTop() - 0.4) / 0.5, 0, 1) : 0;
  const po = _presentOpts;
  po.exposure = frame.exposure * LT.exposureMul;
  po.threshold = clamp(_thresh + LT.threshOff, 0.4, 1.2) * frame.exposure; po.grade = _grade;
  PostFxOpts.applyLookShed(po, { bloom: _bloom * LT.bloomMul, ssao: _ao, godray: _gr, contact: _cs, lampVol: _lampVol, flareMul: LT.flareMul });
  if (_roadReflectionTransition.gfx !== gfx) {
    _roadReflectionTransition.value = NaN;
    _roadReflectionTransition.gfx = gfx;
  }
  PostCommon.roadReflection(po, frame.wetness || 0, _ssrPo, PerfGov.tier(), PerfGov.autoTier(),
    _roadReflectionTransition, performance.now(), PerfGov.tierFloor() >= 4);
  po.carReflect = PerfGov.tier() >= 2 ? 0 : undefined; po.mist = _mist;
  PostFxOpts.gate(po);
  const _ssrLow = onboard;
  po.ssrTopUV = _ssrLow ? 0.82 : 0.62;
  po.ssrNear  = _ssrLow ? -1.0 : -2.5;
  po.speedBlur = _spd; po.tune = LT;
  {
    const _ut = PerfGov.userTier(), _as = PerfGov.autoShed();
    po.bloomLevels = (_as >= 3 || _ut >= 4) ? 2 : ((_as >= 1 || _ut >= 2) ? 3 : 0);
    po.grLite = _ut >= 2 || _as >= 1;
  }
  po.haze = gfx.mobileTier ? null : carFx.haze.at(_mVP);
  armBackendProbe();
  if (!XrBoot.present(gfx, _xrEyes, po)) gfx.present(po);
  if (homeTrack && !(gfx.warming && gfx.warming())) uiExperience.didRenderTrack();
  RaceEntryProfile.afterPresent(loadingScreen, gfx, mirrorPass.preparing());
  if (!_backendProved && ++_provedFrames >= PROVE_FRAMES) {
    _backendProved = true;
    if (_probeArmed) { _probeArmed = false; try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {  } }
    rendererBoot.proved();
  }
}


let physAcc = 0;
let _poseAt = null;
let renderAlpha = 1;
PerfGov.init(gfx);
RenderRate.init({ isMobile: !!GLX.isMobile });
const PHYS_DT = PhysicsConsts.FIXED_DT;
function tick(now) {
  PerfSpans.begin("frame");
  try {
    tickBody(now); LoopHealth.clean();
    XrBoot.afterTick(tick);
  }
  catch (e) {
    if (LoopHealth.fault(e)) { XrBoot.afterTick(tick); return; }
    if (!tick._reported && typeof window.__apexReportError === "function") {
      tick._reported = true; window.__apexReportError("tick", e);
    }
    if (_backendBound && !_backendProved) armBackendProbe();
    throw e;
  }
  finally { PerfSpans.end("frame"); }
}
function tickBody(now) {
  let dt = Math.max(0, Math.min((now - lastFrame) / 1000, 1 / 4));
  const _dtMs = now - lastFrame;
  lastFrame = now;
  if (!paused && !raceRestarting && !mirrorPass.preparing() && !(gfx.warming && gfx.warming()) && (state === "race" || state === "count")) PerfGov.tick(_dtMs, RenderRate.drew());
  PerfSpans.begin("input"); Input.poll(); BrakeCue.tick(); if (typeof DrivingCues !== "undefined") DrivingCues.tick(); PerfSpans.end("input");
  onboard.tick(dt);
  netPlay.tick(now, _poseAt); if (gfx.warming && gfx.warming()) { Input.clearEdges(); return; }
  if (mirrorPass.preparing()) {
    Input.clearEdges(); render(0);
    lastFrame = Math.max(now, performance.now());
    return;
  }
  if ((paused || UiExperience.resumeHolding(dt)) && !netPlay.active()) {
    director.tick(0);
    if (paused) Input.clearEdges();
    if (XrBoot.comfort() || setupPreviewOn || replayBuf.isScrubbing() || ((state === "race" || state === "count") &&
        (!paused || !els.lighting.hidden || !els.camtune.hidden || !els.flyby.hidden || photoMode || !els.pmsettings.hidden))) {
      if (photoMode) updatePhotoCam(Math.min(dt, 1 / 20)); replayBuf.tickScrub(dt);
      const settingsOnly = paused && !setupPreviewOn && !replayBuf.isScrubbing() && !photoMode &&
        els.lighting.hidden && els.camtune.hidden && els.flyby.hidden && !els.pmsettings.hidden;
      if (settingsOnly) RenderRate.observe(_dtMs);
      if (settingsOnly ? RenderRate.settle(dt, _dtMs, XrBoot.comfort()) : RenderRate.force(dt, _dtMs))
        render(Math.min(RenderRate.dt(), setupPreviewOn ? 0.1 : 1 / 20));
    }
    GameAudio.feedReplayScrub(soundOn && player, replayBuf.isScrubbing(), cars, naturalGear, rpmFor, rivalAudio, isWetRoad, vTop); return;
  }
  replayBuf.onTick(raceT, cars, state);
  banner.tick(dt);
  let simTime = dt;
  if (feel.hitStop > 0) {
    const held = Math.min(dt, feel.hitStop);
    feel.hitStop = Math.max(0, feel.hitStop - dt);
    if (!netPlay.active()) simTime = dt - held * 0.85;
  }
  Input.setTimeScale(dt > 0 ? simTime / dt : 1);
  if (!frozen && track && (state === "race" || state === "count" || (state === "results" && RaceCeremony.get()?.status().inputOwner === "player"))) {
    physAcc += simTime;
    let steps = 0;
    PerfSpans.begin("physics");
    while (physAcc >= PHYS_DT && steps < 5) {
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i]; c.rPrevS = c.s; c.rPrevX = c.x;
        c.rPrevPx = c.px; c.rPrevPz = c.pz;
        c.rPrevYawVis = c.yawVis;
        c.rPrevHead = c.head;
      }
      _audioParamStep = physAcc - PHYS_DT < PHYS_DT || steps === 4;
      if (state === "results") { for (let i = 0; i < cars.length; i++) if (cars[i].finished || cars[i].retired) updateCar(cars[i], PHYS_DT, cars); } else update(PHYS_DT);
      physAcc -= PHYS_DT; steps++;
    }
    PerfSpans.end("physics");
    _audioParamStep = true;
    const dropped = steps === 5 && physAcc >= PHYS_DT ? physAcc - physAcc % PHYS_DT : 0;
    PerfGov.recordSimulation(steps, dropped);
    if (dropped) physAcc %= PHYS_DT;
    if (state === "count" && typeof carDraw !== "undefined") carDraw.drainDeferredCarWarm(4);
    if (state === "count" && !netStart && !(netPlay && netPlay.awaitingStart && netPlay.awaitingStart())) countT += startLights.countCredit(_dtMs / 1000, dt, dropped);
    _poseAt = now - physAcc * 1000;
  } else _poseAt = null;
  renderAlpha = clamp(physAcc / PHYS_DT, 0, 1);
  PerfSpans.begin("camera"); director.tick(dt); PerfSpans.end("camera");
  if (photoMode && paused && netPlay.active()) updatePhotoCam(Math.min(dt, 1 / 20));
  if (state === "results") { resultsCam.tick(dt); const rc = RaceCeremony.get(); if (rc) rc.tick(Math.min(dt, 1 / 20)); }
  if (state !== "race" && state !== "count") GameAudio.feedReplayScrub(soundOn && player, state === "results" && replayBuf.isScrubbing(), cars, naturalGear, rpmFor, rivalAudio, isWetRoad, vTop);
  RenderRate.observe(_dtMs);
  if (RenderRate.gate(dt, _dtMs, XrBoot.comfort(), state === "race" && !paused)) {
    dt = RenderRate.dt();
    PerfSpans.begin("render"); render(Math.min(dt, setupPreviewOn ? 0.1 : 1 / 20)); PerfSpans.end("render");
    if (state === "race" || state === "count") { PerfSpans.begin("hud"); updateHud(false, RenderRate.ms()); PerfSpans.end("hud"); }
  }
}



function tickUi() { if (soundOn) GameAudio.uiTick(); }

function paintThrottleMode() {
  const mode = autoThrottleOpt ? "auto" : (throttleLatchOpt ? "latch" : "hold");
  SettingRow.paint($("pm-throttlemode"), mode);
  const note = $("pm-throttle-note");
  if (note) note.textContent = {
    hold: "HOLD: keep your thumb on GAS.",
    latch: "LATCH: tap GAS to accelerate; tap again to lift.",
    auto: "AUTO: steer and brake; throttle is automatic.",
  }[mode];
}

function paintSteer() {
  SettingRow.paint($("pm-steer"), steerMode);
  const note = $("pm-steer-note");
  if (!note) return;
  note.textContent = Input.gyroDenied
    ? "Motion access is denied on this device, so TILT cannot steer here — pick BUTTONS or TOUCH."
    : "TILT leans the phone. BUTTONS adds on-screen arrows. TOUCH drags a finger on the track.";
}

function enableTilt() {
  enableTilt.asked = true;
  const request = Input.requestGyro(), attempt = Input.gyroRequestId();
  request.then((ok) => {
    if (steerMode !== "tilt" || attempt !== Input.gyroRequestId()) return;
    if (!ok && !Input.gyroHardDenied) enableTilt.asked = false;
    if (ok) {
      Input.calibrate();
      setTimeout(() => {
        if (steerMode !== "tilt" || attempt !== Input.gyroRequestId() || Input.gyroSeen || headlessMode) return;
        setSteerMode("buttons"); paintSteer();
        tiltSay("no motion sensor — switched to buttons");
      }, 1500);
    } else if (Input.gyroHardDenied && !headlessMode) {
      setSteerMode("buttons");
    }
    paintSteer();
    if (ok && Input.tiltActive()) els.audiostate.textContent = "tilt steering ready";
    else tiltSay(Input.gyroHardDenied ? "motion access denied — switched to buttons" : Input.gyroDenied ? "tap again to allow motion access" : "");
  });
}
function tiltSay(msg) { els.audiostate.textContent = msg; if (msg) announce(msg.toUpperCase(), 3, "info"); }

const platformSession = PlatformSession.create(G, {
  canvas, raceWakeLock, disarmProbeOnLeave: () => _disarmProbeOnLeave(),
  cancelMirrorPrep: () => mirrorPass.cancelPreparation(),
  setPaused, ensureNet, settingsBack: () => settingsNav.back(), closeSettings, showTouchControls, refreshGearsBtn,
});
platformSession.wireFirstGesture();





const { openTimeTrial, consumeGhostHash, openCareer, openCareerSlots, refreshCareerButton } = TitleFlow.create(G, {
  vt, restoreFreePlaySelection, careerUi, ensureNet,
  refreshTitle: () => { seasonUi.refreshTitle(); titleMenu.refresh(); },
  selectCareer: () => {
  const c = Career.data() || Career.load();
  if (c) {
    season = c.season;
    trackIdx = Career.trackIndex();
    const ti = Teams.LIST.findIndex((t) => t.id === c.team);
    if (ti >= 0) teamIdx = ti;
    driverIdx = c.seat; clampDriverIdx();
    recomputePlayerMods();
  }
  },
});
if (typeof MenuQuitTail !== "undefined" && MenuQuitTail.wire) {
  MenuQuitTail.wire({ mirrorPass, stormFx, flybyPanel, quali, qualiNet, netLobby, Particles, Droplets, GameAudio, SeasonCal, CustomTracks, IncidentSim, DebrisWorld, closeLightTuner, closeCamTuner, exitPhotoMode, consumeGhostHash, ensureNet, refreshCareerButton, setFlow, tyres, $, get soundOn() { return soundOn; }, set session(v) { session = v; }, get session() { return session; }, practiceMode, get raceTyreWear() { return raceTyreWear; }, get season() { return season; }, set season(v) { season = v; } });
}
$("mb-standings").onclick = () => { buildStandings(); $("standings").hidden = false; if (soundOn) GameAudio.uiSelect(); };
$("standings-close").onclick = () => { $("standings").hidden = true; };
const openDataHub = (tab) => {
  const visit = titleVisit;
  return ensureDataHub().then((ok) => {
    if (state !== "menu" || visit !== titleVisit) return;
    if (ok) DataHub.open(tab); else announce("COULD NOT LOAD — CHECK YOUR CONNECTION OR RELOAD", 4, "warning");
  });
};
$("mb-data").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  const door = $("mb-data"), tab = door.dataset.openTab; delete door.dataset.openTab;
  openDataHub(tab);
};
CustomTracks.create(G, { load: loadBackendScripts, door: $("mb-designer") });
$("mb-help").onclick = () => { els.howtoplay.hidden = false; if (soundOn) GameAudio.uiSelect(); };
const goPhonePad = () => { if (soundOn) GameAudio.uiSelect(); location.assign(new URL("controller.html", location.href).href); };
$("mb-phonepad").onclick = goPhonePad;
$("pm-phonepad-go").onclick = goPhonePad;
$("pm-howto").onclick = () => { els.howtoplay.hidden = false; if (soundOn) GameAudio.uiSelect(); };
$("htp-close").onclick = () => {
  els.howtoplay.hidden = true; const fromRotate = document.body.classList.contains("rotate-help-open");
  document.body.classList.remove("rotate-help-open"); if (fromRotate) syncRotateBlocker(true);
};
$("rotate-controls").onclick = () => {
  setPaused(true, "rotate-help"); document.body.classList.add("rotate-help-open");
  syncRotateBlocker(false); els.howtoplay.hidden = false;
  const close = $("htp-close"); if (close) close.focus();
};
$("rotate-exit").onclick = () => quitToMenu();
const portraitUi = { row: null };
function setPortraitOk(on) {
  document.body.classList.toggle("rotate-ok", on);
  try { localStorage.setItem("apex26.portraitOk", on ? "1" : "0"); } catch (_) {  }
  if (portraitUi.row) SettingRow.paint(portraitUi.row, on ? "on" : "off");
  syncRotateBlocker(true);
}
$("rotate-race").onclick = () => { document.body.classList.add("rotate-ok"); setPortraitOk(true); };
try {
  if (localStorage.getItem("apex26.portraitOk") === "1") document.body.classList.add("rotate-ok");
} catch (_) {  }
{
  const note = $("pm-fullscreen-note"), r = note && note.after && SettingRow.build("pm-portrait", "RACE IN PORTRAIT");
  if (r) {
    const help = document.createElement("p");
    help.className = "adv-help";
    help.textContent = "ON races with the phone upright. OFF asks you to rotate to landscape when a race starts.";
    note.after(r.row, help); portraitUi.row = r.row;
    SettingRow.wire(r.row, { values: SettingRow.labels(["off", "on"]),
      read: () => (document.body.classList.contains("rotate-ok") ? "on" : "off"), write: (v) => setPortraitOk(v === "on") });
  }
}
$("tp-close").onclick = () => { $("teampicker").hidden = true; };
els.selBack.onclick = () => {
  if (daily.isActive()) daily.stop();
  vt(() => {
    els.select.hidden = true;
    if (raceSettings.netRoom) $("vsfriend").hidden = false; else { els.overlay.hidden = false; consumeGhostHash(); }
  });
  if (soundOn) GameAudio.uiSelect();
};
$("sel-map-btn").onclick = openTrackDetail;
$("sel-detail-chip").onclick = openTrackDetail;
$("track-detail-close").onclick = closeTrackDetail;
SettingsNav.onEnter((page) => {
  if (page === "display") HudElements.refreshVisibility();
  if (page === "controls" && !controllerProfileUi && typeof ControllerProfileControls !== "undefined" && Input.controllerProfile) {
    controllerProfileUi = ControllerProfileControls.create({ host: $("pm-panel-controls"), input: Input, afterReset: () => { if (keyBinds) keyBinds.render(); } });
  }
  if (page === "audio" && !raceMixUi && typeof RaceMixControls !== "undefined") raceMixUi = RaceMixControls.create(G, $("audioset"));
});
if (typeof ConditionCueControls !== "undefined") ConditionCueControls.create(store, $("pm-panel-driving"));
SettingsNav.onLeave((page) => { if (page === "audio" && raceMixUi) raceMixUi.stop(); });
const settingsNav = SettingsNav.create(store, () => { if (soundOn) GameAudio.uiSelect(); });
EditorWorkspace.init();
SettingsSearch.register("race-settings", [{ id: "tyre-wear", label: "Tyre wear", page: "race-settings", target: "rs-tyres-sel",
  aliases: "tires degradation pit stops", options: "off light real",
  unavailableReason: "Tyre wear is chosen in Race Settings before starting a solo race.",
  navigate: (arrived) => { settingsNav.invalidate(); return raceSettings.openSettingSearch(() => settingsNav.returnToSearch(), arrived); },
}]);
const revealHudRequirement = (target) => SettingsSearch.reveal(target === "rs-tyres-sel" ? $("rs-tyres-sel") : target === "pm-hudprofile-sel" ? $("pm-hudprofile-sel") : null);
HudElements.configure({ context: () => ({ state, hasPlayer: !!player, profile: hudProfile,
  timeTrial: isTimeTrial(), practice: isPractice(), session, tyreWear: !!(tyres && tyres.on()), carCount: cars.length }),
  navigate: (page, target) => { if (page === "race-settings") { const row = SettingsSearch.find("tyre wear").find((r) => r.id === "tyre-wear"), opener = document.activeElement;
      settingsNav.invalidate();
      if (row && raceSettings.openSettingSearch(() => { settingsNav.show("display", false); SettingsSearch.reveal(opener); }, () => revealHudRequirement(target)) === false) {
        const host = $("pm-panel-display"); let note = host.querySelector("[data-hud-nav-status]");
        if (!note) { note = document.createElement("p"); note.dataset.hudNavStatus = ""; note.className = "adv-help"; note.setAttribute("role", "status"); host.prepend(note); }
        note.textContent = row.unavailableReason; LiveRegion.say(row.unavailableReason, "hud"); } }
    else { settingsNav.show(page, true); revealHudRequirement(target); } },
});
photoStudio = PhotoStudio.create(G, { freeCam: photomode.freeCam, ltStore, renderFrame: () => render(0),
  borrowCar: () => {
    const before = { cars, player }, rng = _simRngState;
    try { makeCars(); cars = player ? [player] : []; }
    catch (e) { cars = before.cars; player = before.player; throw e; }
    finally { _simRngState = rng; }
    return () => { cars = before.cars; player = before.player; };
  }, garage: {
  snapshot: () => setupCam.captureCamera(), restore: (v) => setupCam.restoreCamera(v), shot: (id) => setupCam.setSetupView(id),
  looks: lookRowSpecs, looked: () => { if (!$("carsetup").hidden) buildSetup(); } } });
function openExperiencePhoto(source) { return UiExperience.openPhoto(G, { source, photoStudio, setPaused,
  trackHome: state === "menu" && uiExperience && ["track", "pitlane"].includes(uiExperience.state().scene.mode), trackReady: menuWorld(),
  photoView: () => uiExperience.photoView(), onWaiting: () => AppearanceStudio.notify("Return Home to finish loading this scene, then open Photo Studio."),
  photoSubject: (m) => uiExperience.photoSubject(m), reopen: () => openExperiencePhoto("home"), onDone: () => uiExperience.photoSubject(null) }); }
uiExperience = UiExperience.create(G, { setupCam, coach, openPhoto: openExperiencePhoto, openPractice: () => openTimeTrial(false),
  prepareTrack: scheduleFlybyTrack, trackReady: menuWorld, trackKey: () => menuKey(trackIdx), updateTrackPhoto: updatePhotoCam,
  captureTrackCamera: () => ({ eye: camEye.slice(), tgt: camTgt.slice(), fov: camFov }),
  restoreTrackCamera: (v) => { if (v) { camEye.splice(0, 3, ...v.eye); camTgt.splice(0, 3, ...v.tgt); camFov = v.fov; } },
  openWatch: () => openDataHub("race"),
  openSettingsPage: (page, fold) => { openSettings(); settingsNav.showDirect(page, true); const f = fold && $(fold); if (f) { if (f.tagName === "DETAILS") f.open = true; else if (f.parentElement.tagName === "DETAILS") f.parentElement.open = true; f.scrollIntoView({ block: "start" }); f.focus(); } },
});
AppearanceStudio.attach({ previewScene: (s) => uiExperience.previewScene(s), openPhoto: () => openExperiencePhoto(state === "menu" ? "home" : "race"), openDisplay: () => settingsNav.show("display", true),
  applyVisuals: (v) => { uiScale.applyUiScale(); uiScale.applyHudScale(); uiScale.applyBtnScale(); uiScale.applyBtnOpacity(); uiScale.applyPanelOpacity(); G.hudProfile = v.hudProfile; G.hudMetricsLayout = v.hudMetricsLayout; G.hudMapVis = v.hudMapVis; G.hudGapsVis = v.hudGapsVis; if (v.hudMirror) mirrorPass.setMode(v.hudMirror); paintHudDetailsSummary(); syncMetricsOverlayCompact(); },
});
function syncSettingsAvailability() {
  const inRace = state === "race"; try { if (inRace) document.body.dataset.race = "1"; else delete document.body.dataset.race; } catch (_) {  }
  SettingRow.disable($("pm-hidehud"), !inRace);
  $("pm-lighting").disabled = !inRace;
  $("pm-camtune").disabled = !inRace;
  $("pm-flyby").disabled = !inRace;
}
function focusSettingsHub() {
  const hub = $("pm-settings-index");
  if (!hub || hub.hidden) return;
  for (const el of hub.querySelectorAll("button:not([disabled])")) {
    try { el.focus({ preventScroll: true }); return; } catch (_) {  }
  }
}
function openSettings() {
  ensureAudio(); ensureGarageData(); paintHudDetailsSummary();
  syncSettingsAvailability(); settingsNav.showCurrent();
  els.pmsettings.hidden = false; els.pausemenu.hidden = true;
  requestAnimationFrame(() => requestAnimationFrame(() => focusSettingsHub()));
}
let /** @type {ReturnType<typeof KeyBinds.create> | null} */ keyBinds = null;
function closeSettings() { settingsNav.invalidate(); if (keyBinds) keyBinds.disarmAll(); els.pmsettings.hidden = true; $("pm-settings-index").hidden = true; if (paused) els.pausemenu.hidden = false; syncRotateBlocker(false); }
$("pm-settings").onclick = openSettings;
$("pm-settings-close").onclick = () => { if (settingsNav.back()) closeSettings(); };
$("mb-settings").onclick = () => { ensureAudio().then(() => { if (soundOn) GameAudio.init(); }); openSettings(); };



function openQuali(fresh, netDone) {
  const key = entrySettings() + "|" + !!fresh, idx = trackIdx;
  if (!loadingScreen.phase()) loadingScreen.building(loadingInfo());
  return sessionEntry.begin("quali", key, () => { qualiNet.clearPeers(); return ensureScenery(idx); },
    () => openQualiBody(fresh, netDone), () => key === entrySettings() + "|" + !!fresh,
    (e) => { if (e) Log.error("game", "openQuali failed", e); qualiSheet.close(); if (netDone) qualiNet.arm(netDone); quitToMenu(); })
    .catch((e) => Log.debug("game", "openQuali rejected (handled by onFail): " + (e && e.message || e)));
}
function openQualiBody(fresh, netDone) {
  session = "quali";
  setState("menu", "quali-sheet");
  closeRaceSheets(); els.hud.hidden = true; els.lights.hidden = true;
  quali.clear();
  qualiNet.arm(netDone);
  loadTrack(trackIdx);
  makeCars();
  if (fresh) quali.simulate(0); else quali.begin();
  $("quali").classList.remove("q-done");
  $("q-back").textContent = "BACK"; delete $("q-back").dataset.armed; $("quali").toggleAttribute("data-net", !!netDone);
  loadingScreen.stop();
  qualiSheet.open(quali.rows());
  qualiNet.refreshQualiGate();
}
function closeQualiToGrid() {
  qualiSheet.close();
  session = "race";
  startRaceFromSheet();
}
$("q-drive").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  qualiSheet.close();
  session = "quali";
  startRaceFromSheet();
};
function reportModelQuali() {
  const r = (quali.rows() || []).find((x) => x.driverId === player.driverId);
  if (r && r.t > 0) qualiNet.reportQuali(player.driverId, r.noTime ? Infinity : r.t);
}
$("q-sim").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  if (isCareer()) Career.markWeekendStarted();
  quali.simulate(qualiNet.driven(player && player.qualiCut ? Infinity : 0));
  reportModelQuali();
  $("quali").classList.add("q-done");
  qualiNet.markDone(); $("q-back").textContent = "MENU";
  qualiSheet.build(quali.rows());
  qualiNet.refreshQualiGate();
  if (!$("q-go").disabled) $("q-go").focus();
};
$("q-go").onclick = () => {
  if (qualiNet.waiting()) { qualiNet.refreshQualiGate(); return; }
  if (soundOn) GameAudio.uiSelect();
  const go = qualiNet.takeGoCallback();
  if (go) {
    qualiSheet.close();
    go();
    return;
  }
  closeQualiToGrid();
};
function qGoShakeEnd(e) { e.currentTarget.classList.remove("budget-reject"); }
$("q-back").onclick = () => {
  if ($("quali").classList.contains("q-done")) {
    if (!qualiNet.hasArmed() || qualiNet.canLeave() || $("q-back").dataset.armed) { if (soundOn) GameAudio.uiSelect(); delete $("q-back").dataset.armed; quitToMenu(); return; }
    if (qualiNet.hasArmed()) { $("q-back").dataset.armed = "1"; $("q-back").textContent = "PRESS AGAIN TO LEAVE"; }
    if (soundOn) GameAudio.uiTick();
    const go = $("q-go");
    if (go) {
      go.classList.add("budget-reject");
      go.addEventListener("animationend", qGoShakeEnd, { once: true });
    }
    return;
  }
  if (soundOn) GameAudio.uiSelect();
  qualiSheet.close();
  quali.clear();
  session = "race";
  qualiNet.hasArmed() ? qualiNet.resetOnBackWithAbort() : (raceSettings.buildRaceSettings(), $("race-settings").hidden = false);
};



let garageReturn = "select";
function openGarage(from) {
  loadingScreen.stop(); garagePre.markOpen(from); ensureGarageData();
  if (from === "menu" && soundOn) ensureAudio().then(() => GameAudio.init());
  else if (soundOn) GameAudio.uiSelect();
  garageReturn = from;
  $("cs-done").textContent = from === "select" ? "RACE SETUP" :
    from === "pit" ? "RETURN TO RACE" : from === "career" ? "RETURN TO CAREER" :
    from === "vsfriend" ? "RETURN TO LOBBY" : "CLOSE GARAGE";
  resetSetupCam();
  setSetupCamPanel(false);
  const revealGarageCanvas = () => {
    if (canvas) canvas.style.visibility = "";
    if (!_softEl && gfx.softPresent && gfx.softPresent()) _softEl = document.getElementById("game-soft");
    if (_softEl) _softEl.style.visibility = "";
  };
  const enterGarage = () => {
    openSetup(); setupCam.startHome(from);
    try { if (gfx.invalidateSoftPresent) gfx.invalidateSoftPresent(); } catch (_) {  }
    try { if (renderSetupPreview(0)) revealGarageCanvas(); } catch (_) {  }
  };
  const presentIsSlow = () => { try { const s = gfx.backendState && gfx.backendState(); return !!(s && (s.softwareGL || s.softAdapter)); } catch (_) { return false; } };
  if (from === "pit") { enterGarage(); setupCam.startArrival(); }
  else if (presentIsSlow()) enterGarage();
  else vt(enterGarage);
}
$("mb-garage").onclick = () => openGarage("menu");
let pitWorkSpec = null;
function carSpecKey() {
  const team = player ? player.team : Teams.LIST[teamIdx];
  try { return JSON.stringify([getTeamParts(team.id), SetupTune.get(team.id)]); } catch (e) { return null; }
}
function openPitWork() {
  if (!pits || !pits.canWork(player)) return;
  pitWorkSpec = carSpecKey();
  paused = true;
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain(); radioVoice.halt();
  openGarage("pit");
}
function closePitWork() {
  leaveGarage();
  const changed = pitWorkSpec != null && carSpecKey() !== pitWorkSpec;
  pitWorkSpec = null;
  const added = changed ? pits.addWork(player) : 0;
  if (added > 0 && typeof announce === "function") announce("WORK DONE — +" + added + "s", 1.8, "race");
  paused = false;
  if (!netPlay.active()) holdRaceWake();
  lastFrame = performance.now();
  if (soundOn) { GameAudio.setVoice(player && player.team && player.team.engine); GameAudio.startEngine(); if (wxArc.viewRainfall() > 0.01) GameAudio.startRain(); }
  setTimeout(() => { if ($("carsetup").hidden && !setupPreviewOn) garagePre.release(); }, 0);
}
function leaveGarage() {
  setupCam.cancelArrival();
  if (typeof MenuTeardown !== "undefined") MenuTeardown.beginGarageClose();
  if (garageReturn !== "pit" && !loadingScreen.phase()) loadingScreen.busy("Returning");
  if (garageReturn !== "pit" && !loadingScreen.phase() && typeof MenuTeardown !== "undefined" && !MenuTeardown.garageBusyPlate()) loadingScreen.lowerWaitPlate();
  $("carsetup").hidden = true;
  setupPreviewOn = false;
  recomputePlayerMods();
  if (typeof MenuTeardown !== "undefined") {
    const release = () => MenuTeardown.endGarageClose();
    if (garageReturn === "menu" && MenuTeardown.deferUi) MenuTeardown.deferUi(release);
    else release();
  }
}
function garageBack() {
  if (soundOn) GameAudio.uiTick();
  if (garageReturn === "pit") { if (!setupCam.skipPitOut()) setupCam.startPitOut(closePitWork); return; }
  leaveGarage();
  if (garageReturn === "vsfriend") { $("vsfriend").hidden = false; netLobby.roomChanged("car"); }
  else if (garageReturn === "career") careerUi.openHub();
  else if (garageReturn === "select") { buildSelect(); $("select").hidden = false; }
  else {
    const finish = () => { buildSelect(); els.overlay.hidden = false; loadingScreen.stop(); }
    if (typeof MenuTeardown !== "undefined" && MenuTeardown.deferUi) MenuTeardown.deferUi(finish);
    else finish();
  }
  if (garageReturn !== "menu") loadingScreen.stop();
}
$("cs-back").onclick = garageBack;
$("cs-done").onclick = () => {
  if (garageReturn === "pit") { if (!setupCam.skipPitOut()) setupCam.startPitOut(closePitWork); return; }
  leaveGarage();
  if (garageReturn === "vsfriend") { $("vsfriend").hidden = false; netLobby.roomChanged("car"); }
  else if (garageReturn === "career") careerUi.openHub();
  else if (garageReturn === "select") raceSettings.openRaceSettings("select");
  else {
    const finish = () => { buildSelect(); els.overlay.hidden = false; loadingScreen.stop(); }
    if (typeof MenuTeardown !== "undefined" && MenuTeardown.deferUi) MenuTeardown.deferUi(finish);
    else finish();
  }
  if (garageReturn !== "menu") loadingScreen.stop();
};
$("cs-unlimited").onclick = () => {
  unlimitedBudget = !unlimitedBudget;
  store.set("unlimitedBudget", unlimitedBudget);
  buildSetup();
};
els.resMenu.onclick = () => {
  const room = els.resMenu.dataset.friend === "1";
  quitToMenu();
  if (room && $("mb-vs")) $("mb-vs").click();
};
els.resNext.onclick = () => {
  resultsCam.reset(); RaceCeremony.resetLive();
  if (announcer.stop) announcer.stop();
  if (isCareer()) {
    quitToMenu();
    trackIdx = Career.trackIndex();
    openCareer();
    return;
  }
  if (isChampionship()) {
    if (season.round >= SeasonCal.rounds()) {
      if (!(els.results.dataset.resultsView === "champion" || (els.results.dataset.resultsView === undefined && els.resNext.textContent === "MAIN MENU"))) { buildChampion(); return; }
      const cleared = SeasonCal.clear();
      season = cleared.ok ? null : SeasonCal.load();
      els.resultsTitle.style.color = "";
      quitToMenu();
      return;
    }
    trackIdx = SeasonCal.trackIndex(season.round);
    raceLaps = SeasonCal.roundLaps(raceLaps, season, Tracks.LIST[trackIdx] && Tracks.LIST[trackIdx].gpLaps);
  }
  els.results.hidden = true;
  netPlay.stop("local");
  wxArc.endSession();
  if (isChampionship() && (SeasonCal.qualiNext(season) || (SeasonCal.quali() && !quali.results()))) openQuali();
  else if (isChampionship()) startRaceFromSheet();
  else startRaceCovered();
};

function setPaused(p, why) {
  if (state !== "race" && state !== "count") return; hideCamPicker();
  if (p) { Ghost.flush(); if (typeof InputGhost !== "undefined") InputGhost.flush(); clearTimeout($("pm-calib")._t); }
  if (!p && garageReturn === "pit" && !$("carsetup").hidden) { els.pausemenu.hidden = true; return; }
  if (p && garageReturn === "pit" && !$("carsetup").hidden) { paused = true; return; }
  if (paused !== !!p) Log.info("game", "Race " + (p ? "paused" : "resumed") + " why=" + (why || "button") + " state=" + state + " raceT=" + raceT.toFixed(1));
  paused = p; GameAudio.resetReplayScrub(); replayBuf.onPause(!!p);
  if (!netPlay.active()) { if (p) dropRaceWake(); else holdRaceWake(); UiExperience.resumeArm(G, !p && why !== "restart" && state === "race" && !realRace.isWatch()); }
  if (!p) {
    closeLightTuner(false); closeCamTuner(false); flybyPanel.closeFlyby(false); exitPhotoMode();
    closeSettings();
  }
  els.pausemenu.hidden = !p; $("pm-skip-results").hidden = !(p && postFinishWait());
  if (els.pmStandings) els.pmStandings.hidden = !(isChampionship() && SeasonCal.hasProgress(season) && season.round < SeasonCal.rounds());
  if (!p) closeRaceSheets();
  if (p) { GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain(); radioVoice.halt(); $("pm-restart").disabled = !!(netPlay.active() || qualiNet.hasArmed()); }
  else if (soundOn) { GameAudio.setVoice(player && player.team && player.team.engine); GameAudio.startEngine(); GameAudio.startMusic(trackIdx); if (wxArc.viewRainfall() > 0.01) GameAudio.startRain(); }
  lastFrame = performance.now(); syncRotateBlocker(false);
}
els.pausebtn.onclick = () => setPaused(true);
function soloPlayerDone() { return state === "race" && session === "race" && !netPlay.active() && !realRace.isWatch() && player && (player.finished || player.retired); }
function postFinishWait() { return soloPlayerDone() && !RaceControl.finishPending(cars, raceT, lapsTarget, realRace.raceT0()); }
function skipToResults() { if (!postFinishWait()) return false; resultT = 0; G.endRace(); return true; }
$("pm-skip-results").onclick = () => skipToResults();
addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.repeat && !paused && postFinishWait() && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target && e.target.tagName) || "")) skipToResults(); });
els.workBtn.onclick = openPitWork;

function setHudUserHidden(v) {
  document.body.classList.toggle("hud-hidden", !!v);
  paintHudDetailsSummary(); if (v) hideCamPicker();
}

SettingRow.wire("pm-hidehud", {
  values: SettingRow.labels(["on", "off"]),
  read: () => (document.body.classList.contains("hud-hidden") ? "off" : "on"),
  write: (v) => {
    const willHide = v === "off";
    setHudUserHidden(willHide);
    if (willHide) setPaused(false, "hud-off");
  },
});
$("hud-restore").onclick = () => setHudUserHidden(false);

const { setCamMode, cycleCam, hideCamPicker } = CamModes.create(G);

$("pm-resume").onclick = () => setPaused(false); $("pm-quick-doors").insertBefore(Object.assign(document.createElement("button"), { id: "pm-recover", type: "button", textContent: "RECOVER CAR", onclick: () => { setPaused(false); Input.requestRecover(); } }), $("pm-checkpoint"));
$("pm-restart").onclick = () => { if (netPlay.active() || qualiNet.hasArmed()) return; els.pausemenu.hidden = false; setPaused(false, "restart"); frozen = true; raceRestarting = true; startRace().then(() => { raceRestarting = false; if (state === "race") frozen = false; }, () => { raceRestarting = false; }); };
$("pm-quit").onclick = () => quitToMenu();
els.pmStandings && (els.pmStandings.onclick = () => { buildStandings(); $("standings").hidden = false; });

platformSession.paintBuild();

function setSteerMode(mode) {
  if (STEER_MODES.indexOf(mode) < 0) mode = "buttons";
  steerMode = mode;
  store.set("steerMode", mode);
  Input.setSteerMode(mode);
  if (mode === "tilt") enableTilt();
  paintSteer();
  $("pm-calib").disabled = mode !== "tilt";
  refreshGearsBtn();
  if (state === "race" || state === "count") showTouchControls(true);
}
SettingRow.wire("pm-steer", { values: SettingRow.labels(STEER_MODES), read: () => steerMode,
  write: (v) => { if (STEER_MODES.indexOf(v) >= 0) setSteerMode(v); } });
SettingRow.wire("pm-throttlemode", { values: SettingRow.labels(["hold", "latch", "auto"]),
  read: () => (autoThrottleOpt ? "auto" : (throttleLatchOpt ? "latch" : "hold")),
  write: (v) => {
    autoThrottleOpt = v === "auto";
    throttleLatchOpt = v === "latch";
    store.set("autoThrottle", autoThrottleOpt);
    store.set("throttleLatch", throttleLatchOpt);
    Input.setThrottleLatch(throttleLatchOpt);
    paintThrottleMode();
    refreshGearsBtn();
    if (state === "race" || state === "count") showTouchControls(true);
  } });
paintThrottleMode();
SettingRow.wire("pm-mirror", { values: SettingRow.labels(["off", "on"]),
  read: () => (mirrorControls ? "on" : "off"),
  write: (v) => { mirrorControls = v === "on"; store.set("mirrorControls", mirrorControls); applyMirrorControls(); } });
platformSession.wireInstall();
applyMirrorControls();
$("pm-calib").onclick = () => { const b = $("pm-calib"); clearTimeout(b._t); b._t = setTimeout(() => { if (!paused || document.hidden) return; Input.calibrate(); setPaused(false, "recalibrate"); }, 300); };
platformSession.wirePhone();
keyBinds = KeyBinds.create(G);
window.addEventListener("apexcontrollerprofilechange", () => { if (keyBinds) keyBinds.render(); if (controllerProfileUi) controllerProfileUi.refresh(); });
SettingsExport.create(G);


function refreshGearsBtn() {
  SettingRow.disable($("pm-gears"), Input.touchControlsNeeded() && steerMode !== "tilt");
  SettingRow.paint($("pm-gears"), manualMode ? "manual" : "auto");
}
SettingRow.wire("pm-gears", { values: SettingRow.labels(["auto", "manual"]), read: () => (manualMode ? "manual" : "auto"), write: (v) => {
  manualMode = v === "manual";
  store.set("manual", manualMode);
  refreshGearsBtn();
  if (player && !gearsManual()) player.gear = naturalGear(player.speed);
  showTouchControls(true);
} });
function wireHudChips(id, list, read, write, after) {
  SettingRow.wire(id, { values: SettingRow.labels(list), read, write: (v) => {
    if (list.indexOf(v) < 0) return;
    write(v);
    paintHudDetailsSummary();
    if (after) after();
    updateHud(true);
  } });
}
wireHudChips("pm-hudprofile", HUD_PROFILES, () => hudProfile,
  (v) => { hudProfile = v; store.set("hudProfile", hudProfile); }, syncMetricsOverlayCompact);
wireHudChips("pm-hudmetrics", HUD_MET_LAYOUTS, () => hudMetricsLayout,
  (v) => { hudMetricsLayout = v; store.set("hudMetricsLayout", hudMetricsLayout); }, syncMetricsOverlayCompact);
wireHudChips("pm-hudmap", HUD_VIS_MODES, () => hudMapVis, (v) => { hudMapVis = v; store.set("hudMapVis", hudMapVis); });
wireHudChips("pm-hudgaps", HUD_VIS_MODES, () => hudGapsVis, (v) => { hudGapsVis = v; store.set("hudGapsVis", hudGapsVis); });
wireHudChips("pm-hudmirror", MirrorPass.MODES, () => mirrorPass.mode(), (v) => mirrorPass.setMode(v));

function refreshAeroBtn() {
  SettingRow.paint($("pm-aero"), raceAeroMode === "auto" ? "auto" : "manual");
  if (state === "race" || state === "count") showTouchControls(true);
}
SettingRow.wire("pm-aero", { values: SettingRow.labels(["manual", "auto"]), read: () => (raceAeroMode === "auto" ? "auto" : "manual"), write: (v) => {
  raceAeroMode = v === "auto" ? "auto" : "manual";
  store.set("aeroMode", raceAeroMode);
  refreshAeroBtn();
  if (raceAeroMode !== "auto" && player) player.xOn = false;
  if (soundOn) GameAudio.uiTick();
} });
refreshAeroBtn();
function _disarmProbeOnLeave() {
  if (!_probeArmed) return;
  _probeArmed = false;
  try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {  }
}
platformSession.wireLifecycle();


customTeam.init();
raceSettings.wireButtons();
customTeam.syncCustomTeam();
if (season && store.get("season", null)) { season = GameStore.migrateSeasonPoints(season); if (!SeasonCal.lastLoadLossy()) SeasonCal.save(season, { migration: true }); }
teamIdx = idxOr(teamIdx, Teams.LIST.length, 2);
clampDriverIdx();
trackIdx = idxOr(trackIdx, Tracks.LIST.length, 0);
if (Tracks.LIST[trackIdx]) {
  store.set("trackId", Tracks.LIST[trackIdx].id); store.set("track", trackIdx);
}
{ const hasSeason = SeasonCal.hasProgress(season) && season.round < SeasonCal.rounds();
  $("mb-standings").hidden = !hasSeason; }
const loadBootCareer = () => { Career.load(); clampDriverIdx(); refreshCareerButton(); };
if (store.careerWriter && store.careerWriter.ready) store.careerWriter.ready.then(loadBootCareer);
else loadBootCareer();
platformSession.initInput({ steerMode, throttleLatchOpt });
paintSteer();
paintHudDetailsSummary();
syncMetricsOverlayCompact();
$("pm-calib").disabled = steerMode !== "tilt";
refreshGearsBtn();
audioPanel.init();
function scheduleGfxResize() { if (scheduleGfxResize._raf) return; const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0); scheduleGfxResize._raf = raf(() => { scheduleGfxResize._raf = 0; gfx.resize(); }); } window.addEventListener("resize", scheduleGfxResize);
lastFrame = performance.now();
XrBoot.bind({ gfx, tickBody, windowTick: tick, getCamMode: () => camMode,
  setCamMode: (i, opts) => { if (typeof setCamMode === "function") setCamMode(i, opts); },
  pause: (why) => { if (!netPlay.active()) setPaused(true, why); } });
XrBoot.mountUi();
XrBoot.afterTick(tick);

window.__apex = null;
await bootAgentSurface();
if (typeof GameMetrics !== "undefined" && GameMetrics.setTelemetryLoader)
  GameMetrics.setTelemetryLoader(loadAgentSurface);
if (flybyPanel && flybyPanel.setApiLoader) flybyPanel.setApiLoader(loadAgentSurface);

lazyBundles.raceAssets();
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => { ensureAudio(); }, { once: true, capture: true });
  const keyKick = (e) => { if (e && e.key === "Escape") return; window.removeEventListener("keydown", keyKick, true); ensureAudio(); };
  window.addEventListener("keydown", keyKick, true);
}

netLobby.wire();
if (typeof location !== "undefined" && /[#&]vs=/.test(location.hash)) ensureNet();
if (typeof window !== "undefined") window.addEventListener("hashchange", () => { if (/[#&]vs=/.test(location.hash)) ensureNet(); }); if (typeof SurveyHud !== "undefined") SurveyHud.boot({ $, els, document, loadingScreen, canvas });

})();
