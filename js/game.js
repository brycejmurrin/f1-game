/* Apex 26 — main game: state machine, physics, AI, race logic.
   Contract: docs/ARCHITECTURE.md. Depends on globals M4,V3,GLX,Teams,Tracks,
   Car3D,Input,GameAudio,F1API,DataHub; Gfx selects TLX (three.js) by default
   or the explicit WGX (WebGPU) pick, injected at boot — GLX on fallback. */
(async function () {
"use strict";

// ---------- DOM ----------
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

// Renderer selection: unset apex26.gfxBackend → TLX if requestAdapter() ok,
// else GLX (skip three.webgpu); ="three" forces TLX; ="webgpu" uses WGX when
// an adapter exists; ="webgl2" uses GLX. Deferred-backend init failure also
// falls back to GLX. This async IIFE awaits while loading the selected
// renderer, or when the lazy __apex surface loads (localhost / tests /
// ?apex=1). `gfx` is the handle every later renderer call goes through.
let gfx = null;
let _backendProved = false;   // boot-canary latch — see PROVE_FRAMES below
// One presented frame is not proof a backend works: disarming on the first
// world present missed a backend that bound, drew one frame, then died (the
// jetsam-mid-race case). Hold the probe across a run of frames instead — 300
// is ~5 s at 60 fps and longer on the slow devices this exists for. The
// counter runs per frame; storage is touched only on arm and on clear, so a
// per-frame write never lands in the render loop.
const PROVE_FRAMES = 300;
let _provedFrames = 0;
let _probeArmed = false;      // mirrors the stored probe, so the loop never reads storage
// Did a DEFERRED backend actually take the canvas this load? Re-arming from
// the saved PICK instead of this flag is wrong on paths that keep a pick while
// running GLX (a claimed-and-died tab, or a refused create()) — gfx === GLX
// on both, so identity alone cannot tell them apart; only the bind site knows.
let _backendBound = false;
// The rosters below are ApexRoster (js/roster.js), GENERATED from
// tools/manifest.cjs by tools/gen/gen-shell.mjs — one truth, no hand mirror.
// The three DEFERRED renderer groups, in documented toposort order:
// loadBackendScripts starts a file once its edges' predecessors have evaluated.
// Renderer/optional groups keep their graceful fallback; data's eval-time
// dependencies request strict loading so a failed predecessor never executes
// hub.js and poisons its top-level lexical binding for the entire page.
const { load: loadBackendScripts } = ScriptLoader.create();
const lazyBundles = LazyBundles.create({
  els, loadBackendScripts, getContext: () => G,
  applyLightTuneIfReady: () => { if (ltStore) applyLightTune(); },
  createNetwork: () => { netPlay = NetPlay.create(G); netLobby = NetLobby.create(G); return netLobby; },
  bindAgent: () => { if (typeof ApexApi !== "undefined") window.__apex = ApexApi.create(G); },
  // Recreate audio instances after LAZY_AUDIO reinjects the real `var` globals.
  onAudioReady: () => {
    radioVoice = RadioVoice.create(G);
    announcer = Announcer.create(G);
    rivalAudio = RivalAudio.create(G);
    carSfx = CarSfx.create(G);
    audioPanel = AudioPanel.create(G);
    if (audioPanel && audioPanel.init) audioPanel.init();
    if (typeof DrivingCues !== "undefined" && DrivingCues.create) DrivingCues.create(G);
  },
  // Recreate race-session instances after LAZY_RACE_SESSION reinjects real `var`s.
  onRaceSessionReady: () => {
    pits = PitLane.create(G);
    engineer = RaceEngineer.create(G);
    startLights = StartLights.create(G);
    marshalPanels = MarshalPanels.create(G);
    records = SessionRecords.create(G);
    raceRadio = RaceRadio.create(G);
    flyingStart = FlyingStart.create(G, {
      realRace: () => !!(typeof realRace !== "undefined" && realRace && realRace.status().active),
    });
  },
});
const { SCENERY_DIR, sceneryResident, ensureCircuit, ensureScenery, ensureDataHub, ensureNet, ensureAudio, ensureRaceSession, wantAgentSurface, loadAgentSurface, bootAgentSurface } = lazyBundles;
// Stub AudioPanel (js/audio/stub.js) pulls the real LAZY_AUDIO bundle via this hook.
if (typeof AudioPanel !== "undefined") AudioPanel._ensure = ensureAudio;
const rendererBoot = RendererBoot.create({ $, els, canvas, ensureDataHub, loadBackendScripts });
const { backendPreference } = rendererBoot;
const backendBoot = await rendererBoot.start();
if (!backendBoot) return;
gfx = backendBoot.gfx;
_backendBound = backendBoot.bound;
// Baked asset pack (js/render/shared/assets.js). Bind the resolved backend, then kick
// the material-array load WITHOUT awaiting it: a pack is optional, the load is
// feature-detected per backend, and every failure path inside leaves the game
// on its procedural materials. Boot must never wait on, or fail for, assets.
if (typeof Assets !== "undefined") {
  Assets.init(gfx);
  // Loaded unconditionally (a lazy "only when matTexMix > 0" path was removed:
  // the knob ships ON, so nobody could opt out before their first load), but
  // at the first IDLE slice after boot, not in it: the arrays are ~1.6 MB of
  // PNG that competed with the boot scripts for the wire and the decoder, and
  // boot never awaited them. Skipped when something already loaded, unloaded
  // (__apex.assetLoad(false)) or adopted a pack before the slice came round; a
  // FAILED load is retried once at race entry (startRace: Assets.retry()).
  // Baked MODELS: ensureScenery() loads each circuit's set (modelsReady, 4 s cap).
  const kickPack = () => { const s = Assets.state(); if (s.tier === null && !s.uploaded) Assets.load(); };
  if (typeof requestIdleCallback === "function") requestIdleCallback(kickPack, { timeout: 3000 }); else setTimeout(kickPack, 1500);
}

// ---------- rain ----------
// The falling-streak field lives in js/fx/particles.js (Particles.rain*): drops
// in a box around the camera, drawn through the alpha particle batch, depth-
// tested in the frame. game.js decides the weather tier and hands booleans in.
let _lastFloodEmit = 0;   // prop-emissive ramp actually used this frame (debug: lightState)
function initRainDrops() {
  // DRIZZLE tier: "wet" (damp track, no storm) — sparse/short/slow streaks.
  Particles.rainSeed(isWetRoad() && !isRaining());
}

// ---------- settings ----------
// Persistence lives in js/core/store.js (GameStore): the cached localStorage
// wrapper, the TT leaderboard, season identity/migration, hex<->rgb.
const { store, ttBoard, hexToRgb, rgbToHex, seasonDriverId } = GameStore;

const { DEFAULT_CUSTOM, TIER_V } = Teams;   // the custom-team seed + the tier pace ladder (js/data/teams.js)
let teamIdx = store.get("team", 2);          // default McLaren
let driverIdx = store.get("driver", 0);
function storedTrackIndex() {
  const id = store.get("trackId", null);
  const stable = typeof id === "string" ? Tracks.LIST.findIndex((t) => t.id === id) : -1;
  return stable >= 0 ? stable : store.get("track", 0); // legacy positional save
}
let trackIdx = storedTrackIndex();
function driverSeatCount(ti) {
  const team = Teams.LIST[ti];
  if (!team) return 1;
  // MY TEAM career can seat two drivers while team.drivers is still length 1.
  const seats = (typeof Career !== "undefined" && Career.gridDrivers)
    ? Career.gridDrivers(team) : team.drivers;
  return (seats && seats.length) || 1;
}
// THE one place driverIdx moves. On the LEGENDS team the driver picker is
// choosing a different legend, which changes that team's colours, stats, tier
// and livery, so the entry is rebuilt here. There are two ways in — the G
// accessor and the RaceSettings/CustomTeam hook — and when the rebuild lived in
// only one of them the picker silently kept painting the first legend.
function setDriverIdxAt(v) {
  driverIdx = v;
  const t = Teams.LIST[teamIdx];
  if (t && t.legends && customTeam && customTeam.syncLegendsTeam) customTeam.syncLegendsTeam(v);
}
// A STORED INDEX IS PLAYER INPUT, AND `x >= 0 && x < len` IS NOT AN INDEX CHECK.
// This file had it in both spellings and each leaks the opposite way: "abc"
// fails `< 0 || >= len`, "" passes `>= 0 && < len`. Either way the value reached
// Teams.LIST[…] as undefined and the first `team.id` threw — and `team`,
// `driver` and `track` all ride in a GARAGE FILE (js/ui/settings-export.js).
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
// The fallback below decides nothing: store.get's _def() answers a key listed
// in js/data/settings-defaults.js from that file, so the literal only mirrors
// it (tests/unit/settings-defaults.test.mjs fails the build if they disagree).
let difficulty = store.get("difficulty", "hard");
AiBand.setMode(store.get("aiPace", "scripted"));
// RELIABILITY — "off" | "low" | "real" (js/race/reliability.js), a standing
// preference like difficulty. Ships OFF: this key is new for every existing
// save, so OFF is the only default that does not silently start retiring cars
// in a game somebody was already halfway through.
let raceReliability = store.get("reliability", "off");
// TYRE WEAR — "off" | "light" | "real" (js/physics/tyre-model.js). SHIPS REAL,
// from js/data/settings-defaults.js like difficulty above — the literal here
// only mirrors it.
//
// It shipped OFF, and off is not a quiet default here the way RELIABILITY's is:
// it gates the ENTIRE pit feature — no lane, no box, no stop, no prompt, and the
// AI never pits either — so a player who never opened SETTINGS had a pit lane
// built into every circuit and no way to discover any of it existed.
//
// REAL is the full rate (a soft is spent near 37% of a race distance), so a stop
// is part of the plan. LIGHT scales wear by 0.55 — sets last ~1.8x as long, and
// a stop becomes a choice — and OFF is still there; a stored preference beats
// this default, so nobody who already chose is overridden.
//
// OFF's other job was being a true no-op through the grip seam, which kept
// tests/specs/physics-characterization.spec.js bit-identical. That is pinned
// where it belongs now: tests/helpers/fixtures.js sets this key "off" for every
// spec, so the baselines measure the DRIVING MODEL, not the current default.
let raceTyreWear = store.get("tyreWear", "real");
// DIRTY AIR — wake downforce loss on the car behind. CLASSIC is the linear
// fade + 0.35 loss that every characterization / AI-field measurement was
// taken on; CFD is the exponential SAE-shaped model (PhysicsConsts.DirtyAir).
// OFF zeroes the grip penalty while still recording c.wake for the tow HUD.
let raceDirtyAir = store.get("dirtyAir", PhysicsConsts.DirtyAir.defaultLevel);
// ACTIVE AERO usage — "manual" (the driver's own switch, the default) or
// "auto". Inside an activation zone X-mode has no cost or downside, so the
// optimal play is unconditionally on — which is what the AI does in one line.
// Manual asks the player to keep pace with cars that pay no attention tax, at
// the cost of X_VMAX_GAIN top speed if they forget; AUTO hands the player the
// AI's deal. Stays opt-in because pressing the button is the mechanic.
let raceAeroMode = store.get("aeroMode", "manual");
if (!Reliability.isLevel(raceReliability)) raceReliability = "off";
if (!TyreModel.isLevel(raceTyreWear)) raceTyreWear = "real";
if (!PhysicsConsts.DirtyAir.isLevel(raceDirtyAir)) raceDirtyAir = PhysicsConsts.DirtyAir.defaultLevel;
let soundOn = store.get("sound", true);
let musicEnabled = store.get("music", true);    // music on/off, independent of sound
let manualMode = store.get("manual", false);   // manual gearbox preference (player shifts)
let unlimitedBudget = store.get("unlimitedBudget", true); // removes credit cap in car setup (free play ships with the cap off)
// How the player steers: "tilt" | "buttons" | "touch". Defaults to buttons —
// not what a first-time phone player should be handed a tilt control for.
const STEER_MODES = ["tilt", "buttons", "touch"];
let steerMode = store.get("steerMode", "buttons"); if (!STEER_MODES.includes(steerMode)) steerMode = "buttons";   // a foreign stored value would leave Input in tilt with no motion permission
const HUD_PROFILES = ["minimal", "standard", "broadcast"];
let hudProfile = store.get("hudProfile", "standard");
if (HUD_PROFILES.indexOf(hudProfile) < 0) hudProfile = "standard";
const HUD_MET_LAYOUTS = ["auto", "full", "timing", "driver", "compact"];
let hudMetricsLayout = store.get("hudMetricsLayout", "full");
if (HUD_MET_LAYOUTS.indexOf(hudMetricsLayout) < 0) hudMetricsLayout = "full";   // the default above, not AUTO (settings-export def "full")
// AUTO is always the full set: fitHud scales / stacks / drops gaps instead of
// hiding a cluster. A FORCED name strips the half of the metrics the other
// half is named for (css/hud.css) — TIMING keeps sectors+gaps, DRIVER keeps
// the car-state chips, COMPACT neither. MAP and GAPS have their own controls.
// The help line under the LAYOUT chips names what AUTO resolved to.
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
  // One refresh for the whole HUD fold: the closed summary (a READOUT, so it
  // keeps its gold/red words) and the setting rows inside it (js/ui/setting-row.js).
  const on = !document.body.classList.contains("hud-hidden");
  SettingRow.paint($("pm-hidehud"), on ? "on" : "off");
  SettingRow.paint($("pm-hudprofile"), hudProfile);
  SettingRow.paint($("pm-hudmetrics"), hudMetricsLayout);
  SettingRow.paint($("pm-hudmap"), hudMapVis);
  SettingRow.paint($("pm-hudgaps"), hudGapsVis);
  // HUD > MIRROR is owned by js/render/shared/mirror-pass.js; the fold reads it back from the store.
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
// Manual gears: tilt (thumbs free) or desktop keyboard. BUTTONS already owns
// both thumbs (arrows + pedals); TOUCH auto-throttles — neither has a free
// hand for a shifter.
function gearsManual() {
  return manualMode && (steerMode === "tilt" || !Input.touchControlsNeeded());
}
/* AUTO-THROTTLE IS AN OPTION NOW, not only a consequence of TOUCH mode.
   XAG 107's worked example of an input barrier is literally a racing game's
   held accelerator — "holding down RT to keep the car accelerating throughout
   a 3-minute race" — and its point is that REMAPPING does not fix fatigue,
   only a toggle does. Forza ships throttle assist for the same reason.
   The TOUCH clause stays exactly as it was: there the drag already owns the
   thumb, so it is not a preference but a fact about the control scheme. */
let autoThrottleOpt = store.get("autoThrottle", false);
let throttleLatchOpt = store.get("throttleLatch", false);
function autoThrottle() { return autoThrottleOpt || (Input.touchControlsNeeded() && steerMode === "touch"); }
// Left/right-handed docks. F1 Mobile enumerates both as first-class control
// schemes rather than hiding a toggle; the whole feature here is which dock
// each thumb group lands in, so CSS does it (body.mirror-controls).
let mirrorControls = store.get("mirrorControls", false);
function applyMirrorControls() { document.body.classList.toggle("mirror-controls", mirrorControls); }
let season = SeasonCal.load();      // standalone owner adds score maps, config snapshot and revision guard

// ---------- physics constants ----------
// The immutable numbers live in js/physics/consts.js (global PhysicsConsts)
// together with the rationale that tuned them; game.js destructures them once
// here. Everything slider- or harness-tunable stays a `let` below.
const { VMAX, ACCEL, BRAKE, REVERSE_MAX, REVERSE_ACCEL, COAST_DRAG,
        GRAVITY_SLOPE, LAT_MAX, STEER_VMAX, FRONT_WEIGHT, CS_FRONT, CS_REAR,
        WT_LONG, LOAD_SENS, DOWNFORCE, X_VMAX_GAIN_LO, X_VMAX_GAIN_HI, X_DF_LOSS_LO,
        X_DF_LOSS_HI, X_COAST_CUT_LO, X_COAST_CUT_HI, X_OPEN_RATE, X_CLOSE_RATE,
        X_MIN_SPEED, OT_MIN_SPEED, OFF_GRIP, ASSIST_KUS, LINE_PURSUIT,
        LONG_GRIP, THR_FLOOR, THR_CAP, THR_VK, WHEEL_R, WHEEL_STEER_VIS, GRASS_V, KERB_SHAKE, KERB_CUE_HOLD,
        DEPLOY_A, TAPER_LO, TAPER_HI, TAPER_FLOOR, DRAIN_LO, DRAIN_HI,
        REGEN_LO, REGEN_HI, REGEN_FULL_V, OT_TIME_LO, OT_TIME_HI,
        OT_GAP, WET_GRIP, GEARS, GEAR_TOP, IDLE_RPM, MAX_RPM, DIFF, BAND_CEIL,
        TOW_RANGE, TOW_FADE, TOW_HALF_W, BLOCKER_HALF_W } = PhysicsConsts;
// Global pace multiplier on top speed AND acceleration, applied to EVERY car
// (player + AI) so the whole field speeds up/slows down together and the racing
// stays competitive. 1.0 = stock. Driven by the OVERALL SPEED slider.
let PACE = 1.0;
// PACE scales the car's real GROUND speed and nothing else. Every threshold and
// normaliser here is written against the bare VMAX, so comparing raw speeds would
// shrink the envelope with it: at pace 2 the top speed (~45 m/s) sits inside 6th
// gear's band and the tach and dial stall mid-sweep; above pace ~1.02 the MANUAL
// top-gear limiter (gearHi(8) + 1.5 = 73.5 m/s) would swallow the slider.
//
// So: vTop() is where the envelope actually tops out in m/s, and vStd() re-expresses
// a real speed on the STANDARD (pace-5) scale. Normalisers divide by vTop();
// hard-coded speed thresholds compare against vStd(speed). Every constant below —
// VMAX, GEAR_TOP, TAPER_LO/HI, GRASS_V, STEER_SPEED_REF, the bare 20/18 literals —
// keeps its value and meaning, and the gearbox, tach,
// dial and speed-driven effects span their full range at any setting. The slider
// changes what each of those speeds MEANS on the ground, not the range.
// PACE is floored so a setPhysics({pace:0}) can't divide by zero.
function vTop()  { return VMAX * Math.max(PACE, 0.05); }
// BEACHED: off the road and crawling at the grass-drag floor — the rescue gate
// for the player AND the AI (the AI's own `offT > 0.5` read the track-limits
// counter, which resets to -2 every 1.2 s, so its rescue could never fire).
function beachedAt(c) { return c.offroad && c.speed < GRASS_V * 0.6 * Math.max(PACE, 0.05) + 1.5 * Math.max(PACE, 0.05); }
function vStd(v) { return v * VMAX / vTop(); }
function dashKph(v) { return vStd(v) * 3.6; }
// The ACCELERATION curve carries the SAME PACE factor as the ground speed —
// axEstTarget is `ACCEL * PACE * …` — so an acceleration compared against a
// hard-coded number needs exactly the divisor a speed does. aStd() is vStd() for
// m/s^2, written as the divisor rather than the VMAX/vTop() round trip so that at
// pace 5 (PACE === 1) it is the identity to the bit. Measured: at pace 0.5 a
// full-throttle getaway peaks at ACCEL * 0.5 = 3.5 m/s^2, so the launch-wheelspin
// smoke's bare 4.5 floor could never fire at all — see A16.
function aStd(a) { return a / Math.max(PACE, 0.05); }
// And the other direction: what the car ACTUALLY pulls on the ground right now,
// as vTop() is what it actually tops out at. Anything modelling the car from
// outside the driving loop needs this, not the bare constant — js/race/quali-model.js
// took `G.ACCEL` and so simulated a field that accelerated at pace-5 rates into
// a pace-scaled vTop() ceiling, which is exactly the mismatch the G façade's own
// comment promises does not exist ("off the SAME numbers the driving model
// uses"). Floored like vTop().
function aTop()  { return ACCEL * Math.max(PACE, 0.05); }
// Player steering inputs into the dynamic model below. WHEELBASE is the real
// axle spacing — a SHORTER wheelbase has a smaller yaw inertia so it turns in
// harder/faster (the RESPONSE slider). STEER_EXPO shapes the input: >1 = gentle
// near centre (fine, non-twitchy corrections) while keeping full lock at the
// stops. STEER_MAX_SLIP is the max road-wheel steer ANGLE (radians) the driver
// can command; STEER_SPEED_REF tapers that lock a little at speed for stability.
// All four are tuned live by the pause-menu sliders, so they're `let`.
let WHEELBASE = 3.2;        // m; shorter = snappier turn-in (RESPONSE slider)
let STEER_EXPO = 2.4;       // input shaping: higher = much gentler near centre
let STEER_MAX_SLIP = 0.32;  // rad — max road-wheel steer angle (~18°), STEER LOCK
let STEER_SPEED_REF = 60;   // m/s reference for the speed-sensitive lock taper:
                            // higher = keeps more steering at speed (SPEED STEER slider)
// Dynamic single-track ("bicycle") tyre model for the player. Each axle makes a
// lateral force from its SLIP ANGLE (how far its travel differs from where it
// points), soft-saturating at a friction limit (the grip circle). Cornering
// force — not a kinematic "rotate the car and it follows" rule — curves the
// path, so the car can never rotate faster than the tyres can grip: overcook a
// corner and the FRONT washes wide (understeer); loosen the rear and it steps
// out (oversteer). Both emerge from the same equations instead of being faked.
//   c.yawRateCur  yaw rate r (rad/s, + = nose swinging right)
//   c.vLat        body lateral velocity (m/s, + = sliding right)
// DRIFT/ROAD_FOLLOW etc. stay `let` so the pause sliders can tune them live.
let DRIFT = 0;             // rear looseness 0..1: 0 = planted (no oversteer). Slide was
                          // removed as a player control; left settable for the debug bridge.
// Where THIS car sits on those spans, 0..1. Defaults to the midpoint so a car
// that never had parts resolved sits mid-span.
function aeroLoadOf(c) { return c && c.aeroLoad != null ? c.aeroLoad : 0.5; }
// LOW GRIP (FIA 2026 B7.1.2(b)): active aero is PARTIAL in the wet — half the
// trade each way. Exactly 1 on a slick track, so the dry car is untouched.
function aeroWetK() { return raceCtl && raceCtl.lowGrip() ? 0.5 : 1; }
function xVmaxGain(c) { return aeroWetK() * lerp(X_VMAX_GAIN_LO, X_VMAX_GAIN_HI, aeroLoadOf(c)); }
// A car's PACE as the AI judges it: vmax less its X-mode gain, and for a HUMAN x its paceF (AiDrive.paceSample). A net-owned human never reaches updateCar's stamp, so it reads vTop().
function paceVmax(o) { return (o._vmaxNow || (o.human ? vTop() : 0)) / (1 + xVmaxGain(o) * (o.aeroX || 0)) * (o.human ? (o.paceF || 1) : 1); }
// The per-node AI speed/vmax profile paceSample learns, one per field (kept on the function: no new top-level state).
function paceRef() { let r = paceRef.r; if (!r || r.cars !== cars) { r = paceRef.r = new Float32Array(track.n); r.cars = cars; } return r; }
function xDfLoss(c) { return aeroWetK() * lerp(X_DF_LOSS_LO, X_DF_LOSS_HI, aeroLoadOf(c)); }
function xCoastCut(c) { return aeroWetK() * lerp(X_COAST_CUT_LO, X_COAST_CUT_HI, aeroLoadOf(c)); }
// These four are `let` so the emulation/tuning harness (setPhysics) can sweep them
// — they are the core feel levers found by emulating real drivers, not pause-menu
// sliders. FRONT_GRIP: front friction bias (<1) for an understeer-safe default.
// YAW_DAMP: yaw damping for arcade stability. YAW_INERTIA: rotational inertia
// scale (<1 = snappier turn-in). PLAYER_GRIP: forgiveness headroom over the AI.
let FRONT_GRIP = 0.94;
let YAW_DAMP = 1.0;
let YAW_INERTIA = 0.58;     // scales the car's rotational inertia: <1 = snappier turn-in
                            // (quicker direction changes through chicanes) without
                            // touching steady-state grip. 0.89/0.7 washed the nose and
                            // lagged the body; 0.94/0.58 still understeers first.
let PLAYER_GRIP = 1.15;     // player-only grip headroom over the AI's LAT_MAX baseline:
                            // keeps the dynamic model's character but forgiving enough
                            // that a tidy line holds the road (neutral-simcade target)
// Steering-assist ("DRIVING HELP"): adds road-wheel steer toward the upcoming
// curvature so the car helps drive each corner — but the assist goes THROUGH the
// tyres (grip-limited) like the driver's own steering, it can't teleport the
// heading. 0 = pure manual (the car runs straight off at corners), 0.9 = the
// car nearly steers the corner for you. The driver always adds on top.
//
// DEFAULT 0 — OPT-IN. At 0.7, 50 m/s through a 100 m corner is ~20 % of your
// available lock applied by the game (nearer 40 % in a slow corner): a car that
// resists your inputs and pulls toward the road — driving against an invisible
// hand. The assist still exists, and RELAX still turns it
// on, but nothing steers the car by default except the driver.
let ROAD_FOLLOW = 0;
// FRENET SCALE FACTOR. The (s, x) road frame is not rigid: it stretches on the
// outside of a corner and compresses on the inside. A line running x metres to
// the side of a centreline of curvature k is itself an arc of curvature k/h and
// length h × (centreline length), where
//                              h = 1 + k·x
// (+x is right of the centreline; k > 0 curves toward screen-left, so its centre
// of curvature is on the -x side and moving to +x moves you AWAY from it — the
// radius grows from R = 1/k to R + x, hence h = 1 + k·x). Everything the player's
// physics does in the track frame needs it: arc-length progress divides by h, and
// the curvature the car actually has to steer is k/h.
//
// MEASURED, not modelled. h is read off the SAME sampler that rebuilds the car's
// world position from (s, x) — the ratio of the offset line's chord to the
// centreline's over a ±H_D window — so the two can never disagree. Using the
// closed form with Tracks.curvature() instead looks tidier but is wrong where it
// matters: that k is smoothed over a ±12 m window, and at the tight corners where
// h is furthest from 1 the smoothed value badly under-reads the real local
// geometry (measured error at Bahrain's hairpins: ~34 % modelled vs ~2 % here).
// The ±H_D window also gives the factor a little natural smoothing, so a
// curvature spike can't put a step in the car's progress rate.
//
// Clamped because the chart is only valid inside the centre of curvature
// (h → 0 at x = -1/k). The floor bites only where a curvature spike meets a wide
// road — on the shipped circuits the tightest real corner at the outermost
// drivable x lands near h ≈ 0.5, so 0.45 leaves the honest geometry untouched and
// only tames the singular case.
const H_D = 2;   // m — half-window of the central difference
const _hA = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _hB = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _trk = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
// READ (s, x) OFF the car's world position — a MEASUREMENT, not a constraint.
// The player is a rigid body in metres of world space (px, pz, head); the track
// is something it happens to be driving over. This is the timing loop, not the
// steering: nothing here may ever push the car around.
//
// Predictor + LOCAL refinement, deliberately never a global search:
//   - the predictor advances s by the distance travelled along the road, divided
//     by the Frenet stretch h, so it is already correct to first order;
//   - two Newton steps then pin s to the exact foot of the perpendicular
//     ((P - C(s))·t = 0), so the reading cannot drift away from the truth.
// Because s never moves more than a few metres from last frame's value, it
// cannot snap onto the wrong leg of a hairpin — which is exactly what a global
// Tracks.project() search does. Keeping the search local buys the robustness of the road
// frame without surrendering the car's independence to it.
// Writes into the module-scope _tf (no per-frame allocation, like the rest of
// the loop). Returns it for convenience.
const _tf = { s: 0, x: 0 };
function trackFrom(px, pz, sPredicted) {
  let s = wrapS(sPredicted);
  for (let i = 0; i < 2; i++) {
    Tracks.sample(track, s, _trk);
    let tx = _trk.t[0], tz = _trk.t[2];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const along = (px - _trk.p[0]) * tx + (pz - _trk.p[2]) * tz;
    if (Math.abs(along) < 1e-3) break;
    // Cap the step so one bad sample can't fling the reading down the track.
    s = wrapS(s + clamp(along, -12, 12));
  }
  Tracks.sample(track, s, _trk);
  let rx = _trk.r[0], rz = _trk.r[2];
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  _tf.s = s;
  _tf.x = (px - _trk.p[0]) * rx + (pz - _trk.p[2]) * rz;
  return _tf;
}
// The EXACT INVERSE of trackFrom's lateral step — same normalisation, so a
// world → (s, x) → world round-trip is the identity.
//
// This has to be exact, because the two are used in a loop: the car's world
// position produces (s, x), and the hard constraints (barrier, car-to-car
// contact) push (s, x) back into the world position. Reconstructing with the RAW
// sample.r instead makes that loop lossy. sample() lerps between adjacent unit
// node vectors, so |r| = cos(θ/2) < 1, and on a banked corner the horizontal
// part shrinks further to cos(bank) — about 0.95 through Zandvoort's banking.
// A loop with per-frame gain 0.95 drags x to 5 % of itself in one second: the
// car gets sucked onto the centreline and fights you the whole way there. That
// is precisely the "pulled and oscillating around the centre line" bug.
const _wf = { x: 0, z: 0 };   // world X/Z out-param (no per-frame allocation)
function worldFromTrack(s, x, out) {
  Tracks.sample(track, s, out);
  let rx = out.r[0], rz = out.r[2];
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  _wf.x = out.p[0] + rx * x;
  _wf.z = out.p[2] + rz * x;
  return _wf;
}
function frenetH(s, x) {
  Tracks.sample(track, wrapS(s - H_D), _hA);
  Tracks.sample(track, wrapS(s + H_D), _hB);
  const cx = _hB.p[0] - _hA.p[0], cz = _hB.p[2] - _hA.p[2];
  const ox = cx + (_hB.r[0] - _hA.r[0]) * x, oz = cz + (_hB.r[2] - _hA.r[2]) * x;
  const cLen = Math.hypot(cx, cz);
  if (!(cLen > 1e-4)) return 1;
  return clamp(Math.hypot(ox, oz) / cLen, 0.45, 1.8);
}
// Deploy strength 0..1 for a car holding BOOST (or running OVERTAKE). The taper
// makes deploy strongest out of slow corners, but it is FLOORED: it used to
// reach exactly 0 above TAPER_HI, which is only 191 km/h, so on any straight
// BOOST produced no thrust — and because the drain was gated on `deploy > 0`,
// it also cost nothing. Holding BOOST at speed did literally nothing, while
// OVERTAKE (which bypasses the taper) worked and drained. Real ERS deploys all
// the way down the straight; so does this now, at reduced strength.
function deployTaper(c) {
  if (c.otT > 0) return 1;
  const t = clamp(1 - (vStd(c.speed) - TAPER_LO) / (TAPER_HI - TAPER_LO), 0, 1);
  return TAPER_FLOOR + (1 - TAPER_FLOOR) * t;
}
function isErsDeploying(c) {
  if (!c) return false;
  // Live flag from the deploy block — covers human BOOST, AI wantBoost, and
  // free OVERTAKE. Do not re-derive from boostOn alone: AI never sets boostOn.
  return !!c.deploying;
}
function ersDeployOf(c) { return c && c.ersDeploy != null ? c.ersDeploy : 0.5; }
function ersRegenOf(c) { return c && c.ersRegen != null ? c.ersRegen : 0.5; }
// Better deployment DRAINS SLOWER — the same press lasts longer rather than
// pushing harder, because the push itself is what BOOST already scales.
function drainFor(c) { return lerp(DRAIN_HI, DRAIN_LO, ersDeployOf(c)); }
function regenFor(c) { return lerp(REGEN_LO, REGEN_HI, ersRegenOf(c)); }
// Recovery is kinetic: it needs the car moving. Full rate from REGEN_FULL_V (a
// standard-pace speed, so PACE does not move it) down to nothing at a stop, so
// braking or coasting in the pit box cannot refill the battery (it took ~10 s).
function regenSpeedK(c) { return clamp(vStd(c.speed) / REGEN_FULL_V, 0, 1); }   // reversing (the brake-held crawl) recovers nothing either
function otTimeFor(c) { return lerp(OT_TIME_LO, OT_TIME_HI, ersDeployOf(c)); }   // push a full Overtake allowance buys (js/race/overtake-mode.js)

let aeroZ = null;   // AeroZones.create(G), assigned once G exists (below)
// -- ACTIVE AERO: ACTIVATION ZONES -------------------------------------------
// The zone GEOMETRY lives in js/physics/aero-zones.js (AeroZones.create(G), wired
// after the G façade as `aeroZ`). It is pure circuit geometry — curvature in,
// arc-metre spans out — and knows nothing about a car. What stays here is the
// half that reads car state: whether THIS car is in a zone, and what opening
// the wing costs it.
//
// X_STRAIGHT_T / X_ZONE_K / X_ZONE_VREF / X_ZONE_MIN / X_ZONE_STEP live with the
// geometry. (The first two were COPIED rather than moved when this was
// extracted, so dead duplicates sat up at ~line 395 for a while with this
// comment asserting they had gone. An extraction is not done until the
// originals are deleted.)
function inAeroZone(c) { return !!aeroZ.at(wrapS(c.s)); }   // inside an activation zone (js/physics/aero-zones.js)
// Live downforce multiplier on the DOWNFORCE (aero-load) term. 1 in Z-mode,
// 1 - X_DF_LOSS with the flaps fully open. Nothing else in the grip model
// changes: mechanical grip, kerbs, weather and the friction ellipse are
// untouched, so opening the wing costs you exactly the wing.
function aeroDfMult(c) { return 1 - xDfLoss(c) * (c && c.aeroX || 0); }

// ── seeded simulation randomness ────────────────────────────────────────────
// Everything that FEEDS THE SIMULATION draws from here, never Math.random(), so
// a run can be reproduced: same seed + same inputs => same result. Without this
// two runs of one scenario diverge immediately (the AI overtake roll below is
// per-tick, per-car), which makes any A/B — physics tuning, an agent policy
// comparison, tests/agent-drive-bench — a comparison of runs that were never
// comparable.
//
// Cosmetic randomness (camera shake, lightning, particles, audio noise) stays on
// Math.random() DELIBERATELY. It must not consume this stream: drawing from it
// would shift every subsequent sim value, so whether a spark spawned would
// change where a car ends up. Visual-only code must not perturb the sim.
//
// LCG, same constants as glibc; matches the ten-line generator in the Luden.io
// agent template. Cheap, seedable, and long-period enough for a race.
let _simSeed = 1;
let _simRngState = 1 >>> 0;
function simSeed(v, stream) {   // stream: a number resumes the draw stream there instead of at the seed; `true` reads its position (DailyChallenge hands both back on stop)
  if (v !== undefined) {
    _simSeed = (v >>> 0) || 1;
    _simRngState = typeof stream === "number" ? stream >>> 0 : _simSeed;
  }
  return stream === true ? _simRngState : _simSeed;
}
// A PLAYER'S SESSION starts from a fresh seed: at a fixed 1 the first race after
// every page load was the same race (retirements, weather arc, mistakes,
// strategies). Kept at 1 under automation (navigator.webdriver: Playwright, the
// Chrome MCP), pinned by ?seed=N (the game-vm harness passes ?seed=1); daily,
// career and net play set their own. It resets the stream and draws nothing.
(function bootSeed() {
  try {
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search || "").get("seed") : null;
    if (q) { simSeed(+q); return; }
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    const a = new Uint32Array(1);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(a); else a[0] = Math.random() * 4294967296;
    simSeed(a[0]);
  } catch (_) { /* keep 1 */ }
})();
// uniform [0,1) — the drop-in for Math.random() on sim paths
function simRnd() {
  _simRngState = (Math.imul(_simRngState, 1103515245) + 12345) >>> 0;
  return _simRngState / 0x100000000;
}
// 8-speed gearbox with realistic PROGRESSIVE ratios (research: real/F1 gearboxes
// space the ratios so the steps shrink in the higher gears). So an upshift drops
// the revs a lot in the low gears and less up top, and every shift lands back in
// the ~8.7-11.3k power band (F1's optimal ~8-12k) before climbing to the limit —
// rather than dropping to idle or barely dropping at all. Top speed fraction of VMAX.
// F1-authentic 8 gears (GEARS / GEAR_TOP / IDLE_RPM / MAX_RPM: js/physics/consts.js).
// GEAR_TOP is a fraction of the speed ENVELOPE, so these track vTop() rather than
// the bare VMAX: all eight gears stay reachable at any OVERALL SPEED setting, the
// tach sweeps its whole band, and the manual top-gear limiter (which caps accelCeil
// at gearHi(8) + 1.5) stops swallowing the slider above pace ~1.02. PACE only —
// NOT playerMods.speed, so an engine upgrade still nudges you past 8th's top into
// the rev clamp exactly as before.
function gearLo(g) { return g > 1 ? vTop() * GEAR_TOP[g - 2] : 0; }
function gearHi(g) { return vTop() * GEAR_TOP[g - 1]; }
function naturalGear(speed) {
  for (let g = 1; g <= GEARS; g++) if (speed <= gearHi(g) + 0.01) return g;
  return GEARS;
}
function rpmFor(gear, speed) {
  // RPM is proportional to speed / this gear's top speed: a higher gear turns the
  // engine slower at a given speed. So an upshift drops RPM only PARTIALLY — more
  // in the low gears (wide ratios) than the high gears (close ratios), as in a
  // real car — instead of dropping to idle on every shift. Floored at idle,
  // capped just past redline. (This also drives the engine pitch and the tach.)
  const hi = gearHi(gear);
  const rpm = MAX_RPM * (speed / Math.max(hi, 1));
  return clamp(rpm, IDLE_RPM, MAX_RPM * 1.04);
}
const GAME_LAPS = 3;
const TT_LAPS = 4;          // time trial: four flying laps (a rolling start: js/race/flying-start.js)
// Weather predicates from continuous trackWetness (same 0.25 / 0.72 ladder as
// TyreModel.treadFor). Atmosphere profiles keep reading raceWeather enum.
function isWetRoad() { return trackWetness() >= 0.25; }
function isRaining() { return trackWetness() >= 0.72; }
// Road grip by weather AND fitted tyre (table WET_GRIP) — see docs/PHYSICS.md
// "Weather and tyres". No car => the slick column.
function trackWetness() { return TyreModel.wetness(raceWeather, wxArc && wxArc.arc); }
function roadWetness() { return trackWetness(); }   // alias — grip / pits / engineer
function gripMult(c) { return TyreModel.weatherGrip(c ? (c.tread == null ? 2 : c.tread) : 0, trackWetness()); }

// Pose Ghost + InputGhost start together on every TT lap arm so an incident /
// reverse-crossing / spoiled class cannot leave the input stream attached to a
// dead pose recorder (or the reverse).
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

// Finish-dependent effects wait for all motion owners' crossing timestamps.
// Lap clocks, bests and recorders still update immediately inside updateCar.
function onCarLineFinish(c, cross) {
  if (RaceControl.deferLine(c, cross, c.s, onCarLineFinish)) return;
  if ((cross.lapValid || cross.flagged) && c.local && netPlay.active()) {
    netPlay.reportLap(cross.lapValid
      ? { lap: c.lap, time: cross.lapDone, best: isFinite(c.best) ? c.best : null, code: c.code, fin: cross.flagged ? c.finishT : undefined }
      : { lap: c.lap, time: null, best: isFinite(c.best) ? c.best : null, code: c.code, fin: c.finishT, invalid: true });
  }
  if (cross.flagged && c.isPlayer && !raceRadio.callsResult()) announce("FINISH!", 2, "race");
}

// IncidentSim owns motion during a takeover, but the ordinary line-crossing
// presentation still belongs here. Core lap/clock/finish state is advanced by
// RaceControl.lineTransition for both callers; this hook handles only the local
// side effects that cannot live in a physics module.
function onIncidentLineCross(c, cross, newS) {
  if (!c || !cross || RaceControl.deferLine(c, cross, newS, onIncidentLineCross)) return;
  if (cross.direction < 0) {
    if (cross.changed) c._secValid = false;
    if (cross.changed && c.isPlayer) {
      sectorIdx = sectorAt(newS); sectorStartT = c.lapTime; sectorValid = false;
      if (isTimeTrial()) restartTTRecorders();
    }
    return;
  }
  c._secT0 = 0;
  if (c.isPlayer) { sectorIdx = 0; sectorStartT = 0; }
  if (c.isPlayer && c.lap === lapsTarget && lapsTarget > 1 && !raceRadio.callsLastLap()) announce("FINAL LAP", 1.6, "race");
  if (cross.flagged) {
    // The lap is incident-invalid, so do not publish it as a timed lap. A
    // finish stamp is still authoritative and must reach the other peer; null
    // time/best keep the invalid lap out of timing comparisons.
    if (c.local && netPlay.active()) {
      netPlay.reportLap({ lap: c.lap, time: null, best: null, code: c.code, fin: raceT, invalid: true });
    }
    if (c.isPlayer && !raceRadio.callsResult()) announce("FINISH!", 2, "race");
  }
}

// DIRTY AIR lives on PhysicsConsts.DirtyAir. SYMMETRIC: c.wake is
// positions-only for EVERY car; only the tow BENEFIT (c.towing) is gated.
const CAUTION_BRAKE = 0.5;       // fraction of BRAKE a car above the caution delta pace sheds at
const _towWin = { range: TOW_RANGE, fade: TOW_FADE, halfW: TOW_HALF_W };
function wakeOf(gap, dx) { return PhysicsConsts.DirtyAir.wakeOf(gap, dx, raceDirtyAir, _towWin); }
function dirtyAirMul(wake, speed) {
  return PhysicsConsts.DirtyAir.mul(wake, speed, raceDirtyAir, DOWNFORCE, vTop());
}

// ---------- state ----------
let state = "menu";
function setState(next, why) { if (next !== state) Log.info("game", "State " + state + "->" + next + " why=" + why + " raceT=" + (+raceT || 0).toFixed(1)); state = next; }   // THE one writer: every transition is logged
let track = null, builtTrackId = null, builtTrackNight = null;
let gridPreOrdered = false;   // set by gridUp(); read by js/net/netplay.js — see there
// The field size the painted grid was built for. In the rebuild guard with
// id and night because the box paint is baked into the start-line decal:
// racing the same circuit again with MY TEAM selected changes the field
// without changing either of the other two, and the paint would be stale.
let builtGridSlots = null;
let cars = [], player = null;
let raceT = 0, countT = 0, lightsLit = 0, resultT = 0, netGreen = null;
// Countdown setGridIdle opts — reused every frame (was a fresh {} on the
// countdown return path, ~60 allocs/s until lights-out).
const _gridIdleOpts = { soundOn: false, wet: false, step: true };
// THE LIGHTS-OUT INSTANT ON THE RACE CLOCK. AiDrive.launchMul/launchDone read
// their time as seconds since green, and raceT is that only for a first
// start — a red-flag restart resumes the clock the flag stopped, so without
// an origin launchDone() would go instantly true at raceT 600 and every AI
// would launch at a flat multiplier while the player reacts to the lights.
// 0 for a first start, where raceT is zeroed at green anyway.
let launchT0 = 0;
// B1 — RACE CONTROL (local yellow / VSC / safety car) lives in
// js/race/race-control.js. A READ-ONLY race-logic layer: it consumes
// DebrisWorld.hazards() and drives the HUD flag, and NEVER writes speed, px,
// pz, head or (s, x). The five below are thin passes through to it, kept as
// hoisted function declarations so the G façade below can name them directly.
let raceCtl = null;   // RaceControl.create(G), assigned once G exists (below)
let wxArc = null;     // WeatherArc.create(G, deps), same deferral — live weather
                      // and the dynamic arc (js/race/weather-arc.js)
let tyres = null;     // TyreModel.create(G), same deferral
let pits = null;      // PitLane.create(G), same deferral
let _pitCrewDrawn = () => 0;   // filled after CarDraw.create — __apex.pit() drains it
// NO PASSING UNDER THE SC / VSC, for the player (the AI holds station by
// construction): a place gained must go back inside the window, or it is priced
// at the flag (js/race/sporting-regs.js; FIA 2026 SR B5.12.2(c), B5.13.2(c)).
// A car slowed by an obvious problem may be passed under a caution
// mid-incident, being rescued as stuck, or beached in the run-off.
const postLim = { r: 0, l: 0, minOut: 0, side: 0 };   // Tracks.postLimits' reused out-param
// …or all but stopped on the track (a first-lap jam: passing a car at walking
// pace is passing a car with an obvious problem).
const stricken = (o) => incidentSim.owns(o) || (o.rescueT || 0) > 0.25 || (!!o.offroad && (o.offT || 0) > 0.5)
  || (!(o.pitState && o.pitState !== "none") && (o.speed || 0) < vTop() * 0.05);
const cautionFair = (o) => SportingRegs.exempt(o) || stricken(o);   // a car it is legal to pass under a caution
const scWatch = SportingRegs.createPassWatch(0, stricken);
function scPassCall(ev) {
  if (!ev || !player) return; Log.info("game", "Caution pass " + ev.type + " n=" + (ev.n || 0) + (ev.sec ? " pen=+" + ev.sec + "s" : "") + " lap=" + player.lap + " level=" + raceCtl.level); if (ev.type === "cleared") return;
  if (ev.type === "warn") { announce("GIVE THE POSITION BACK" + (ev.n > 1 ? " — " + ev.n + " PLACES" : ""), 2.5, "penalty-warn"); return; }
  player.penalty += ev.sec;
  // The results countdown may already be running (the player just finished):
  // re-read it so a time penalty that reorders the finish is served first.
  resultT = 0;
  announce("+" + ev.sec + "s PENALTY — OVERTAKING UNDER CAUTION", 3, "penalty-hit");
  if (soundOn) GameAudio.penalty();
}
// The cue phases that turn the pit ENTRANCE lamps green (SceneryPits): you are
// called in and still on your way to the box. Not `out`/`served`/`merge` — by
// then you are leaving, and not `missed`.
const PIT_LAMP_GREEN = ["near", "enter", "armed", "lane", "keep", "near-box", "square", "stop", "box"];
let engineer = null;  // RaceEngineer.create(G), same deferral
function setCautionEnabled(on) { return raceCtl.setEnabled(on); }
function updateCaution(dt) { raceCtl.update(dt); }
function applyCaution(d) { return raceCtl.apply(d); }
function cautionInfo() { return raceCtl.info(); }
function cautionLevel() { return raceCtl.level; }   // allocation-free, for per-tick readers
function otEnabled() { return raceCtl.otEnabled(); }
let camEye = [0, 6, -10], camTgt = [0, 0, 0], camFov = 62;
let camAncX = null, camAncZ = 0;      // last frame's car anchor — camera damps in the CAR's frame (see render())
let camAncNX = null, camAncNZ = 0;    // this frame's, published where renderPosOf() is in scope
let hideMeshes = {};   // debug: per-mesh visibility toggle (set via __apex.meshToggle)
let dbgCam = null;   // debug free camera override (set via __apex.view); null = chase
// ---- Photo mode: a free-fly camera launched from the LIGHTING TUNER so the
// scene can be inspected/photographed from anywhere, not just where the menu was
// opened. Feeds dbgCam every paused frame (see updatePhotoCam / tick()). ----
let photoMode = false;
let _photoPrevScale = 1;   // render scale to restore when leaving photo mode
const photoCam = { pos: [0, 6, 0], yaw: 0, pitch: 0, fov: 60 };
const photoKeys = { w: false, s: false, a: false, d: false, up: false, dn: false,
                    pu: false, pd: false, yl: false, yr: false, boost: false };
const photoMove = { x: 0, y: 0 };   // touch move stick: x=strafe, y=forward (−1..1)
const photoLook = { x: 0, y: 0 };   // touch look stick: x=yaw, y=pitch (−1..1)
// pid: the ONE pointer that owns a look-drag; every other one is ignored (see
// js/camera/photo-cam.js). null when nothing is dragging.
const photoMouse = { dx: 0, dy: 0, drag: false, px: 0, py: 0, pid: null };
let photoAlt = 0;                    // touch up/down buttons: +1 up, −1 down
let photoVertT = 0;                  // how long vertical input has been held (s) — ramps the climb rate
// Studio light rig (__apex.studio): a ring of test lamps that follows the player
// car — inspect paint/reflection response on any track at any time of day,
// independent of the session's real lamps. null = off.
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
    const e = R.intensity * 0.55;   // same physical energy factor as track lamps
    _studioBuf.push(lx, ly, lz,
      R.color[0] * e, R.color[1] * e, R.color[2] * e,
      R.radius, ax, ay, az, 0.88, 0.60, 0.12, 0, 1);
  }
  // Overhead key: straight-down softbox above the car.
  const ek = R.intensity * 0.55 * 1.4;
  _studioBuf.push(cx, cy + R.h + 3, cz,
    R.color[0] * ek, R.color[1] * ek, R.color[2] * ek,
    R.radius, 0, -1, 0, 0.80, 0.45, 0.15, 0, 1);
  return _studioBuf;
}
let headlessMode = false;  // skip render() when true (headless control loop)
const { CAM_MODES } = CamModes;  // player camera modes (js/camera/mode-switch.js; eval-time — a HARD_EDGES pair)
let camMode = Math.min(Math.max(store.get("camMode", 19) | 0, 0), CAM_MODES.length - 1);
// The game mode, on TWO axes. `flow` is what the run is FOR and survives a
// whole championship; `session` is what this one visit to the track IS. They
// are genuinely independent — a career weekend qualifies then races, so a
// single flat enum cannot say "career" and "qualifying" at once. `seasonMode`
// and `timeTrial` are DERIVED views handed out through the G façade, not
// state. CAREER is a championship too — same calendar, points and standings —
// it just carries a save across seasons.
let flow = "gp";            // "gp" | "season" | "career"
let session = "race";       // "race" | "tt" (solo against the clock) | "quali"
const isChampionship = () => flow === "season" || flow === "career";
// Does the grid come from a qualifying classification? A championship does
// unless its FORMAT switched qualifying off (quali() is true for a career and a
// friend race, so only a standalone season can); a one-off does when the player
// asked for it. Both startRace() (which reads quali.order) and the race-settings
// GO button ask this, and they must agree — a race that qualified and then
// gridded up P12 would throw the session away, and one that gridded from a
// classification it never ran would read a stale one.
const gridFromQuali = () => (isChampionship() ? SeasonCal.quali() : (qualiGrid() && !isTimeTrial() && !realRace.status().active));   // a one-off's rule never reaches a championship; a real race (Data Hub JUMP IN) has its own grid and never opens #quali (realRace: a later const, read at call time)
// The ONE way `flow` is written. Career's save is loaded at boot and stays loaded,
// so js/career/career.js has to be told whether its rules apply to the session that
// is running — otherwise a Grand Prix would quietly inherit the career's team
// development and its garage. Funnelling every write through here means that flag
// can never drift out of step with the mode.
function setFlow(v) { flow = v; Career.engage(v === "career"); SeasonCal.engage(v); }
const isTimeTrial = () => session === "tt";
const isQuali = () => session === "quali";
// PRACTICE is not a fourth `session` value, it is a flag ACROSS them: the point
// is to practise the session you are actually driving — a race start, a quali
// lap — not a separate mode that drives differently. It means exactly one
// thing: THIS SESSION IS UNSCORED. Everything that can rewind the player
// (checkpoints, rewind) is gated on it, because every one of them is a scoring
// exploit in a session that counts — `retry()` restores the car's own fields,
// and `penalty`/`cuts` are ordinary fields on that car.
// A Time Trial is always practisable, which is what the feature shipped as.
// Cleared by startRace() so it can never leak from one session into the next.
let practiceMode = false;
const isPractice = () => practiceMode || isTimeTrial();
// A DUEL is a practice race against ONE bumped rival. Same trim that Time Trial
// and Quali already do to `cars` after makeCars(); the rival's stats come from
// the deltas argument DriverRatings.get() already takes for career development.
let duelMode = false;
// The SETTING sticks (like difficulty), but a duel is a one-off practice race:
// never a championship round, a time trial (Daily included) or a quali lap.
const duelOn = () => duelMode && !isChampionship() && !isTimeTrial() && !isQuali();
const duelSetting = () => duelMode;   // sticky race SETTING for session keys; gated use goes through duelOn()
// WHICH legend the duel rival is, or "" for the ordinary fastest-car duel. A
// race SETTING like duelMode itself, so it survives a restart the same way.
let duelLegend = "";
// The full field as it was before startRace() narrowed `cars` to the lone
// qualifying car — Quali.simulate() needs every car to build a classification.
let qualiField = null;
// What the last career round paid, straight off Career.settleRound(). Null
// outside career and cleared at the top of every classification, so a Grand Prix
// can never inherit a career weekend's earnings panel.
let careerSettlement = null;
const isCareer = () => flow === "career";
let lapsTarget = GAME_LAPS; // laps before the session ends (GAME_LAPS or TT_LAPS)
let raceLaps = GAME_LAPS;      // user-selected lap count
// GRID RULE, for a one-off race (a championship always qualifies). A standing
// preference like DIFFICULTY and RELIABILITY, not a per-race reset. "tier" is
// the pace-order grid gridUp() has always built (player P12); "quali" grids
// off the qualifying session; "rev10" reverses the qualifying top ten
// (Formula 2's sprint-race rule); "revchamp" inverts the championship
// standings; "random" sorts on gridUp's own jitter draw. (The pre-rule boolean
// `raceQuali` key is no longer read: store.get returns SettingsDefaults first.)
const GRID_RULES = ["tier", "quali", "rev10", "revchamp", "random"];
let raceGrid = store.get("raceGrid", "random");
if (GRID_RULES.indexOf(raceGrid) < 0) raceGrid = "tier";
const qualiGrid = () => raceGrid === "quali" || raceGrid === "rev10";
// A CHAMPIONSHIP with qualifying off grids in championship order (FIA 2026 SR
// B2.5.4(a), B2.3.4(a)) — its own rule, apart from the one-off's. A saved
// REVERSED (championship-only) carries over; the rest was the one-off's.
const CHAMP_GRID_RULES = ["champ", "tier", "revchamp", "random"];
let champGrid = store.get("champGrid", raceGrid === "revchamp" ? "revchamp" : "champ");
if (CHAMP_GRID_RULES.indexOf(champGrid) < 0) champGrid = "champ";
// A friend race has TWO humans on the grid, and both of their qualifying laps
// are real. The rival's arrives over the wire (NetPlay EV.QUALI) as
// driverId -> seconds; quali.simulate() takes the map and stops caring which of
// them is "the player". Cleared with the classification.
// Friend-race qualifying sync (peer laps, q-go gate) lives in js/race/quali-net.js.
let qualiNet = null;
let raceWeather = "dry";       // "dry" | "wet" | "rain" | "overcast" | "fog"
let raceTimeOfDay = "default"; // "default" | "dawn" | "day" | "dusk" | "night"
let ttRecord = Infinity;    // best lap on the current TT track's leaderboard (seconds)
let ttNewRecord = false;    // set when the player takes provisional pole this session
let ttLaps = [];            // completed lap times this time-trial session
let ttSessionTs = 0;        // session start stamp; entries at/after it are "yours, just now"
let sectorStartT = 0;        // lapTime when current sector started
let sectorIdx = 0, sectorValid = true;   // current sector + "entered it FORWARD" flag
let sectorBests = [Infinity, Infinity, Infinity], fieldSectorBests = [Infinity, Infinity, Infinity];   // player's / the FIELD's (timing-screen purple)  // best S1/S2/S3 times ever
let sectorLast = [null, null, null];               // last lap's S1/S2/S3 times
let frameSky = {}, frame = {};
// ---------- sky / weather animation state ----------
// Continuously increasing render clock (seconds) fed to the sky shader each
// frame so clouds drift and stars twinkle even when the physics are frozen.
let _skyT = 0, _skyHold = false;   // hold: __apex.renderClock(t, true) freezes the sky for a reproducible capture
// Lightning state: base ambient colours saved from applyRaceSettings(), current
// flash intensity, remaining flash bright time, and next-flash countdown.
let _ltBase = null;           // { ambientSky, ambientGround, exposure } saved at race start
let _ltFlash = 0;             // 0..1 current flash intensity (decays each frame)
let _ltNextT = 0;             // seconds until the next lightning strike
let _thunderT = -1;          // seconds until queued thunder fires (<0 = none)
// …and the delay it was DRAWN with, which is what says how far away the strike
// was. _thunderT itself is ~0 at the tick thunder fires — that is what firing
// means — so deriving loudness from it gave every strike the same near-crack.
let _thunderDelay = 0;
// Cloud cover target for the current session: set once in applyRaceSettings()
// and held constant so the sky doesn't shift mid-race (only the shader animates).
let _cloudBase = 0.4;
let shake = 0;          // 0..1 trauma; camera offset scales with shake²
// OS REDUCE MOTION for GAME-WORLD motion, which no stylesheet can reach (the
// CSS already honours it for menus; the shake that causes trouble is the 3D
// camera at 300 km/h — XAG 117). Live: the OS toggle can flip mid-session.
const _mq = (typeof window !== "undefined" && window.matchMedia)
  ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
// SETTINGS › APPEARANCE › MOTION: REDUCED counts too (html[data-motion], which
// js/ui/title-fx.js sets from the OS flag OR the stored choice, live).
function motionReduced() {
  return !!(_mq && _mq.matches)
    || (typeof document !== "undefined" && document.documentElement && document.documentElement.dataset.motion === "reduce");
}
function camComfort() { return XrBoot.camComfort(motionReduced()) || (typeof CamComfort !== "undefined" && CamComfort.active()); }   // XR / OS reduce-motion / touch auto-comfort
let camRoll = 0;        // radians; lean into corners (decays back to 0)
let camSlipSm = 0;      // smoothed slip input for camRoll (raw vLat/speed is 60 Hz-stepped)
let camCutT = 0;        // s; >0 just after a camera-mode cut → eased glide to the new vantage
let hitStop = 0;        // seconds of remaining sim slow-mo after a hard hit
let startHold = 0;      // randomised lights-out delay after the 5th light (F1-style)
let restartPending = false;   // a red-flag standing restart: lights-out resumes the race clock
// The five red lamps, one per second. A CONSTANT rather than a literal because
// the networked start has to name an instant a whole countdown away — a lead
// shorter than the sequence means every peer joins it part-way through by
// construction — so js/net/netplay.js needs this number too, via G.countdownS.
// Three private copies of it is exactly how that drifts back apart.
const COUNTDOWN_S = 5;
let paused = false;
// Player racing-line assist, set by the pause-menu slider. -1..1: 0 = pure
// manual (default), >0 gently pulls toward the racing line through corners,
// <0 pushes the car wide. Always an added bias the driver can steer against.
let raceLineAssist = 0;
// No fixed tilt scale here: one landing BEFORE the expo curve compounds (0.7 at
// default STEER_EXPO is 0.7^2.389 = 0.43 real authority, so a tilt driver never
// reaches half of STEER_MAX_SLIP at any lean). Tilt gets the same lock range as
// every other input; sensitivity is MAX_TILT and jitter is the
// One-Euro SMOOTHING slider.
// Debug/screenshot freeze: skip the simulation (physics + AI) but keep rendering,
// so the camera still settles to a parked view yet nothing moves — giving the
// visual-regression harness a deterministic frame. Only set by __apex.park().
let frozen = false;
// When set by __apex.sky(), overrides the normal chase-cam with a horizon-facing
// view so clouds and the sky gradient are visible in screenshots.
let skyViewOverride = null;
// Test-only steer/throttle/brake overrides (null = use real Input). Set via
// __apex.setInput() so Playwright tests can pump physics at deterministic dt.
let _testInput = null;
// A human car with no controls yet (a networked rival before its first input
// packet lands): coast, don't inherit whatever the local keyboard is doing.
const NEUTRAL_INPUT = Object.freeze({ steer: 0, throttle: false, brake: false });
// Where a human car's controls come from. The LOCAL car reads the real Input
// (null here is that signal); a non-local human car reads the inputs its
// owner sent us, same shape as _testInput so __apex.setInput()/act() can
// drive either. Edge-triggered controls (shift, overtake) stay explicit at
// their call sites because Input.consume*() may only be read once per frame.
// A FRIEND RACE KEEPS RUNNING UNDER THE PAUSE MENU (the rival cannot be
// frozen), and the local car kept reading live input: on TOUCH auto-throttle it
// drove itself into the next wall behind the pause card. Paused, it brakes.
const PAUSED_NET_INPUT = Object.freeze({ steer: 0, throttle: false, throttleLevel: 0, brake: true });
function inputOf(c) {
  if (c.local && paused && netPlay.active()) return PAUSED_NET_INPUT;
  if (c.local) return _testInput;              // null => live Input
  return c.netInput || NEUTRAL_INPUT;
}
// The human AiBand catch-up (aiPace=catchup) bands toward — once per update().
// Scripted mode ignores it. Recomputed once per update() rather than once per AI car. Scripted mode ignores it.
// than per AI car. Null when the field has no human at all.
let _leadHuman = null;
// Set by NetPlay while a session's countdown is pending: {at, hold, now()}.
// `at` is lights-out on OUR clock; now() reads the same clock the session
// converted it into. Null solo, and cleared the moment the race starts.
let netStart = null;
// The SESSION's clock, not the page's — netplay nulls it between sessions so a
// deadline computed against a previous session's clock cannot fire instantly in
// the next one. Backing store for the G.netNow accessor below; it was written
// straight onto the facade as an undeclared property until this line existed.
let netNow = null;
let playerMods = { speed: 1, accel: 1, cornering: 1, braking: 1 };
let playerAeroLoad = 0.5;   // 0..1 wing size — how far active aero trades (see xVmaxGain)
let playerErs = { deploy: 0.5, regen: 0.5 };   // 0..1 ERS axes (see drainFor/otTimeFor)
// Shared neutral fallback for a human car with no resolved setup. Frozen and
// module-scope so updateCar's per-car binding never allocates.
const NEUTRAL_MODS = Object.freeze({ speed: 1, accel: 1, cornering: 1, braking: 1 });
let lastFrame = 0;
let announceT = 0, radioVoice = RadioVoice.inert();   // the real instance lands at the module wires; inert() means no call site needs a guard
let announcer = Announcer.inert();   // js/audio/announcer.js — the pre-race welcome; same inert() deal
// "box" is the engineer's PIT CALL and nothing else (js/race/engineer.js): an
// instruction the player has one lap to act on, where every other engineer line
// is a report. It ranks with the pit-lane messages it belongs to rather than
// under them — before this it was "info", so the confirmation that you HAD
// entered the pits outranked the call telling you to.
const ANN_PRI = { comm: 1, coach: 1, practice: 2, info: 2, warning: 3, "penalty-warn": 3, box: 4, race: 4, "penalty-hit": 5 };
// THE FLOOR. Every card gets ANN_MIN_S on screen, whatever its caller asked for
// and whatever arrives next. Callers passed durations from 1.4 s up, and 1.4 s
// is not a message — it is a flash you notice after it has gone. The floor is
// enforced at BOTH ends, which is the half easy to miss: showAnnounce lengthens
// a short card, and announce() below refuses to let even a HIGHER priority evict
// a card still inside its floor. A penalty therefore waits behind a wear report
// instead of blinking it away — bounded by the longest duration any caller
// passes, and a penalty the player could not read is worth less than one that
// arrives a beat late.
const ANN_MIN_S = 3;
// THE QUEUE, which _annQueue now IS rather than holds. One slot meant a THIRD
// message in a burst was dropped, and so was a second of EQUAL priority — a lap
// crossing that set a record and earned a medal showed one of them and silently
// ate the other. Two slots, highest priority first and arrival breaking ties,
// so a burst plays out in the order it mattered. Two and not more on purpose:
// under the floor above a third would arrive six seconds after the thing it
// describes, by which time it is a lie, not a message.
const ANN_QUEUE_MAX = 2;
// …and when a burst of warnings or penalties queues ahead of them anyway (the
// +3 depth below), an INFO-or-lower card that has waited ANN_STALE_MS is dropped
// at the drain rather than read out as a lie ("UP TO P5" after losing it).
// Warnings, box calls and penalties always play.
const ANN_STALE_MS = 8000;
// _annFloor is what is LEFT of the current card's floor, run down beside
// announceT in tickBody. One `let` statement on purpose: the ratchet counts
// column-0 declarations, so splitting these for a comment would raise it
// without adding any state.
let _annPri = 0, _annFloor = 0, _annQueue = [];
// THE RADIO. A banner is a radio message: the WHO line names the channel it
// came in on — race control for a penalty or a warning, the coach for a tip,
// otherwise the driver's own pit-wall channel under their name — the words sit
// under it in quotes, and the car NUMBER sits on the plate beside both
// (css/hud.css #announce-num), the way a broadcast captions team radio, not as
// dim micro type at the end of the WHO line. Every channel here is
// addressed TO the player, so the one number serves all three.
function radioWho(kind) {
  const label = { control: "RACE CONTROL", coach: "COACH", announcer: "COMMENTARY" }[RadioVoice.SPEAKERS[kind]];
  if (label) return label;
  const p = player;
  const who = p && p.name ? String(p.name).split(" ").pop().toUpperCase() : (p && p.code) || "";
  return (who ? who + " · " : "") + "RADIO";
}
const radioNum = () => (player && player.num != null ? String(player.num) : "");
function showAnnounce(msg, dur, kind, quiet) {
  kind = kind || "race";
  _annPri = ANN_PRI[kind] || 2;
  els.announceText.textContent = msg;
  els.announceWho.textContent = radioWho(kind);
  els.announceNum.textContent = radioNum();   // "" collapses the plate to a 3px stripe
  if (kind === "comm") els.announceNum.textContent = "";   // the broadcaster is not talking to the player's car
  els.announce.className = "";
  if (kind && kind !== "race") els.announce.dataset.kind = kind;
  else delete els.announce.dataset.kind;
  els.announce.hidden = false;
  // SCREEN READERS hear the card through #announce-live, an always-present polite
  // region (a region filled while hidden and unhidden in one step is missed by NVDA,
  // JAWS, VoiceOver: tetralogical.com/blog/2024/05/01). LiveRegion (js/ui/live-region.js)
  // is its ONE writer — it owns the clear-then-write beat, so a repeated line is still
  // a change and a flag or HUD line in the same tick cannot overwrite this; a QUIET
  // card (the caller's flag) is never spoken. game.js never times its own write
  // (hud-readouts.test.mjs pins that): without the module, a plain set.
  const said = els.announceWho.textContent + ": " + msg;
  if (!quiet) {
    if (typeof LiveRegion !== "undefined") LiveRegion.say(said, kind);
    else if (els.announceLive) els.announceLive.textContent = said;
  }
  // A card of small type takes a beat longer to read than a billboard did, and
  // ANN_MIN_S is the floor under every caller's number — the shortest asked for
  // was 1.4 s, which nobody reads at racing speed.
  announceT = Math.max(ANN_MIN_S, (dur || 1.6) + 0.5);
  _annFloor = ANN_MIN_S;
  // THE ONLY PLACE THE RADIO SPEAKS. showAnnounce is the one place a line
  // reaches the screen, so hooking it inherits the whole ANN_PRI / _annQueue
  // policy for free: a line the cinematic camera dropped never arrives here and
  // is never spoken, a queued line is spoken when its turn comes, and a preempt
  // interrupts. There is no second priority table anywhere in the voice.
  // announceT — the card's ACTUAL life, not a second copy of the expression
  // above — is the utterance's whole budget.
  const _annCh = RadioVoice.SPEAKERS[kind] || "radio";
  const _annLead = state === "race" || state === "count" ? GameAudio.radioLeadS(_annCh) : 0;
  if (quiet) return;   // a refresh of the card already up: no second voice, squelch or screen-reader line
  radioVoice.say(msg, announceT, kind, _annLead);
  // ...and the RADIO around it — click, hiss, squelch (engine.js radioSting).
  // On the CARD, not the utterance: the spoken radio ships off, and here it
  // inherits this function's ANN_PRI queue instead of needing a second one.
  // Gated on the session for the same reason plan() is: showAnnounce also draws
  // menu cards, and a squelch under "SAVE CONFLICT" on the title screen claims
  // a radio that is not running.
  if (state === "race" || state === "count") GameAudio.radioSting(_annCh, announceT);
}
let skids = null;   // SkidMarks.create(), assigned once G exists (below)
// Tyre marks (the 120-entry ring buffer, its batched vertex build and the
// per-mark fallback draw) live in js/fx/skidmarks.js — SkidMarks.create(),
// wired after the G façade as `skids`. Nothing outside that module reads its
// state, which is what made it liftable.
const PAINT_WET_NIGHT = { emissive: 0.20, roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };  // car paint by condition: night adds emissive, wet lowers roughness
const PAINT_WET_DAY   = { roughness: 0.16, metalness: 0.12, specular: 0.85, clearcoat: 0.8, carPaint: 1.0 };
const PAINT_DRY_NIGHT = { emissive: 0.20, roughness: 0.22, metalness: 0.12, specular: 0.85, clearcoat: 1.0, carPaint: 1.0 };
const PAINT_DRY_DAY   = { roughness: 0.22, metalness: 0.12, specular: 0.85, clearcoat: 0.9, carPaint: 1.0 };
// Apply the CAR tuner group (LT.car*) to a base paint constant, into a reused
// scratch object (gfx.draw consumes the material synchronously, so one scratch
// is safe across every car in the frame). GLOSS divides roughness (higher =
// sharper); the rest are straight multipliers. carPaint (the paint MODEL) is
// left intact — the CAR REFLECTION strength lives in the composite (uCarReflect).
const _carPaintScratch = {};
function carPaintMat(base) {
  const m = _carPaintScratch;
  m.roughness = clamp((base.roughness != null ? base.roughness : 0.4) / LT.carGloss, 0.02, 1);
  m.metalness = clamp((base.metalness || 0) * LT.carMetal, 0, 1);
  m.specular  = (base.specular  || 0) * LT.carSpecular;
  m.clearcoat = (base.clearcoat || 0) * LT.carClearcoat;
  m.emissive  = (base.emissive  || 0) * LT.carGlow;
  m.carPaint  = base.carPaint != null ? base.carPaint : 0;
  m.sparkle   = base.sparkle  != null ? base.sparkle  : 1;   // reset each call so a preview override can't leak in-race
  m.doubleSided = true;   // cars/wheels use single-winding faces — render both sides so tyres read opaque from every angle
  return m;
}
const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // reusable sample
const smp2 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };

// ---------- helpers ----------
const clamp = M4.clamp, lerp = M4.lerp;   // shared scalar helpers (js/core/mat4.js) — ALIASED, not called through M4, so every hot-path site keeps its old call shape
// Rotate an RGB grade-tint's HUE around the luminance axis by `deg`. Tints sit
// near [1,1,1]; we rotate the chroma OFFSET from grey so a neutral tint stays
// neutral. Standard NTSC-luma hue matrix. Used by SHADOW/HIGHLIGHT TINT HUE.
function hueRotateTint(rgb, deg) {
  if (!deg || !rgb) return rgb;
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const m = rgb[0] * 0.213 + rgb[1] * 0.715 + rgb[2] * 0.072;  // luma (grey anchor)
  const r = rgb[0] - m, g = rgb[1] - m, b = rgb[2] - m;        // chroma offset
  return [
    m + (r * (0.213 + c * 0.787 - s * 0.213) + g * (0.715 - c * 0.715 - s * 0.715) + b * (0.072 - c * 0.072 + s * 0.928)),
    m + (r * (0.213 - c * 0.213 + s * 0.143) + g * (0.715 + c * 0.285 + s * 0.140) + b * (0.072 - c * 0.072 - s * 0.283)),
    m + (r * (0.213 - c * 0.213 - s * 0.787) + g * (0.715 - c * 0.715 + s * 0.715) + b * (0.072 + c * 0.928 + s * 0.072)),
  ];
}
// Scale an RGB colour's SATURATION around its luma-grey anchor by `amt`
// (1 = unchanged, 0 = achromatic grey, >1 = more vivid). Same NTSC-luma grey
// anchor as hueRotateTint, so a neutral colour stays put. Returns a fresh array
// (never mutates the palette/frame source). Used by SKY/FOG COLOUR SATURATION.
function satAdjust(rgb, amt) {
  if (!rgb || amt === 1) return rgb;
  const m = rgb[0] * 0.213 + rgb[1] * 0.715 + rgb[2] * 0.072;   // luma (grey anchor)
  // Clamp to >=0: at amt>1 a channel below the grey anchor can overshoot past
  // black into negative radiance, which then subtracts in the additive sky/fog/
  // reflection mixes (skyZenith/Horizon + fogColor feed the dome, glass, wet
  // road and SSR fallback) and inverts hue. Default amt===1 early-returns above,
  // so this stays byte-identical at the shipped setting.
  return [Math.max(0, m + (rgb[0] - m) * amt),
          Math.max(0, m + (rgb[1] - m) * amt),
          Math.max(0, m + (rgb[2] - m) * amt)];
}
const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));
// HUD clock: two decimals and "-" when empty. Dom.fmtLap (three decimals,
// timing-sheet style) is the other formatter on purpose; do not merge them.
function fmtTime(t) {
  if (!isFinite(t) || t <= 0) return "-";
  // ROUND FIRST, then split: 119.9996 split first read "1:60.00" (and 69.9996
  // "1:010.00") — toFixed rounded the seconds up without carrying the minute.
  const cs = Math.round(t * 100), m = Math.floor(cs / 6000), s = (cs - m * 6000) / 100;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
}
// RETURNS WHETHER THE MESSAGE REACHED THE SCREEN — true shown, false dropped
// or queued. RaceEngineer marks a wear step CONSUMED only when it was shown, so
// a threshold crossed while the banner was busy waits for the next tick rather
// than being silently spent. Both early returns below are silent drops, and
// the camera one is permanent — see the note on it.
function announce(msg, dur, kind, still, quiet) {   // still(): false once a queued line is no longer true; quiet: card only
  kind = kind || "race";
  const pri = ANN_PRI[kind] || 2;
  if (hudProfile !== "broadcast") {
    const camId = CAM_MODES[camMode].id;
    if (camId === "heli" || camId === "side" || camId === "cinematic" || camId === "low" || camId === "overhead"
        || camId === "rival" || camId === "pitwall" || camId === "drone") {
      // The cinematic cameras drop the two quiet channels so a film shot is not
      // captioned. That is a LOOK choice, and it must not silence the engineer:
      // the engineer's REPORTS are "info", so before this returned a verdict a
      // player who pressed the camera button stopped hearing them for the rest
      // of the session — the call was consumed unseen and a wear step, once
      // advanced, never re-crosses. The PIT CALL is "box" and is not on this
      // list at all: a camera angle is a look, and a look must not cost a stop.
      if (kind === "info" || kind === "coach") return false;
    }
  }
  // `_annFloor > 0` is the other half of the floor: a card still inside its
  // three seconds is not evicted even by something that outranks it — the
  // arrival queues at the head instead and takes over the moment the current
  // one is done. Without this clause the floor would only be a promise to
  // callers, not to the player, because the very next penalty would break it.
  if (announceT > 0 && (pri <= _annPri || _annFloor > 0)) {
    // Into the queue, highest priority first, arrival breaking ties. Taking a
    // slot means the line still gets its turn, so that counts as accepted;
    // being pushed off the end means it is gone and the caller must offer it
    // again (RaceEngineer does, on its next tick).
    // A slot once given is NEVER taken back: evicting an accepted line told its
    // caller "said" for words nobody heard (RaceEngineer spends the wear step,
    // race-radio its cooldowns and the told position). A full queue refuses a
    // newcomer that outranks nothing waiting; one that does (a warning behind
    // two reports) queues deeper instead of pushing an accepted line out.
    const low = _annQueue.length ? _annQueue[_annQueue.length - 1].pri : 0;
    if (_annQueue.length >= (pri > low ? ANN_QUEUE_MAX + 3 : ANN_QUEUE_MAX)) return false;
    let at = _annQueue.length;
    while (at > 0 && _annQueue[at - 1].pri < pri) at--;
    _annQueue.splice(at, 0, { msg, dur, kind, pri, still, t: performance.now() });
    return true;
  }
  showAnnounce(msg, dur, kind, quiet);
  return true;
}
function wrapS(s) { const L = track.total; s %= L; return s < 0 ? s + L : s; }
// Curated def.sectors splits when present; equal thirds only as fallback.
function sectorAt(s) {
  const frac = wrapS(s) / track.total;
  const sec = track.def && track.def.sectors;
  if (sec && sec.length === 2) {
    return frac < sec[0] ? 0 : frac < sec[1] ? 1 : 2;
  }
  return frac < 1 / 3 ? 0 : frac < 2 / 3 ? 1 : 2;
}
// Render interpolation: blend a car's arc position between its previous and
// current fixed-physics-step values by the leftover-accumulator fraction, so
// motion stays smooth between steps (no judder on 120/144 Hz or uneven frames).
// Wrap-safe: takes the short way around the start/finish line.
function lerpS(prev, cur, a) {
  if (prev === undefined || a >= 1) return cur;
  const L = track.total;
  const d = M4.wrapDelta(cur - prev, L);   // shortest way round (js/core/mat4.js)
  return wrapS(prev + d * a);
}
// Every car is drawn from interpolated world px/pz when that mirror exists.
// The player integrates px/pz; AI and remotes derive it from (s, x) at the
// end of the step. Render interpolates the last two physics poses only
// (renderAlpha) — no xVis low-pass, which lagged the field toward the road frame.
// Writes world X/Z into _rp; the caller still samples the road for HEIGHT.
const _rp = { x: 0, z: 0, world: false };
// (c) only: `cS` and `renderX` were declared and never read — a signature
// that invites a caller to compute two values for nothing.
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
// Unified render anchor: the (s, x) the camera, the car body's
// height/orientation, and banking should all sample — derived from the SAME
// interpolated WORLD position renderPosOf draws the body at, projected ONCE
// via trackFrom, so all three consumers get an identical smooth s. Deriving
// each independently from the arc read-back lerpS(rPrevS, s) diverged (that
// read-back is non-monotonic) as a backwards camera jolt, a fore/aft car-vs-
// camera slide, and height/orientation jitter at speed. Cars with no world
// pose yet fall back to the arc interpolation.
const _pa = { world: false, cS: 0, cX: 0 };
// Per-render player (s,x) + body sample/bank — trackFrom/sample/banking once for cam/shadow/body.
let _plCS = 0, _plCX = 0, _plOk = false, _plBodyOk = false;
const _smpPlayer = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _bankPlayer = { dy: 0, roll: 0 };
function playerAnchor(c) {
  if (c.px != null) {
    const wx = (c.rPrevPx === undefined) ? c.px : c.rPrevPx + (c.px - c.rPrevPx) * renderAlpha;
    const wz = (c.rPrevPz === undefined) ? c.pz : c.rPrevPz + (c.pz - c.rPrevPz) * renderAlpha;
    const tf = trackFrom(wx, wz, c.s);   // read-only; never writes c.s
    _pa.world = true; _pa.cS = tf.s; _pa.cX = tf.x;
  } else {
    _pa.world = false;
    _pa.cS = lerpS(c.rPrevS, c.s, renderAlpha);
    _pa.cX = (c.rPrevX === undefined) ? c.x : c.rPrevX + (c.x - c.rPrevX) * renderAlpha;
  }
  return _pa;
}
// yawVis is produced in the physics step; render it interpolated like position
// or the mesh orientation leads by one full physics step (16.7 ms) — judder
// during yaw transients. A plain lerp is not safe here: the player branch
// assigns the raw psi (normalised to (-π, π]) so a spin renders as a spin, so
// yawVis crosses the ±π branch cut once per revolution and a plain lerp across
// it would snap the drawn basis through zero mid-spin. Same wrap-safe delta
// headInterp uses below, for the same reason.
function yawVisInterp(c) {
  const y1 = c.yawVis || 0;
  if (c.rPrevYawVis === undefined) return y1;
  let dy = y1 - c.rPrevYawVis;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  return c.rPrevYawVis + dy * renderAlpha;
}
// c.head is the player's real WORLD heading (full wrapping angle, unlike the
// small clamped yawVis residual) — read raw by the free-world chase/onboard
// camera rig (extra.carHead) to look "down the car's nose". Read raw at
// render time it snaps a full physics step (16.7 ms) every frame instead of
// gliding with renderAlpha like the position does: at speed that is a
// held-then-jump stutter whose size scales with speed × dt — "vibrates more
// as I speed up". Interpolate it exactly like position, with a wrap-safe
// shortest-path delta since head crosses ±π every lap.
// The TV director's subject (js/camera/director.js): the interpolated pose the body is drawn at. Pooled.
const _dirPos = [0, 0], _dirPose = { s: 0, x: 0, carPos: null, carHead: 0 };
const _dirSmp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
function camPoseOf(c) {
  const pa = playerAnchor(c), rp = renderPosOf(c);
  _dirPose.s = pa.cS; _dirPose.x = pa.cX; _dirPose.carHead = headInterp(c);
  // Ordinary AI never advances c.head. Match its drawn, interpolated basis;
  // human/network/incident owners retain their authoritative world heading.
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
const _cockMat = new Float32Array(16), _cockU = [0, 1, 0];   // stabilized cockpit-interior basis
const _cockP = [0, 0, 0];   // camera-anchored rig origin (see the cockpit branch)
const tmpR = [0, 0, 0], tmpF = [0, 0, 0], tmpU = [0, 1, 0], tmpP = [0, 0, 0];
const _groundR = [0, 0, 0], _groundF = [0, 0, 0], _groundU = [0, 1, 0];
// Pre-allocated scratch matrices — zero-GC hot-path matrix math.
const MAT_IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
// The in-race car model matrix is a REFLECTION (det −1, see basisMat/tmpU). The
// setup-preview car is otherwise drawn at identity (det +1), which would render
// the U-pre-flipped decal text mirrored. Draw the preview through this X-reflection
// so its handedness matches in-race and the flipped-U decals read correctly (the
// symmetric body is visually unchanged).
const MAT_REFLECT_X = new Float32Array([-1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _mProj = new Float32Array(16), _mView = new Float32Array(16), _mVP = new Float32Array(16);
const _mInvVP = new Float32Array(16);
const _mInvProj = new Float32Array(16);
const _sunVS = new Float32Array(3);
const _upVS = new Float32Array(3);   // the ROAD PLANE's normal in view space (wet-road SSR)
const _smpRoad = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };   // its own scratch: smp/smp2 are live elsewhere in the frame
const _camUp = [0, 0, 0];   // scratch camera up-vector (rebuilt each render frame)

// ---------- parts / player mods ----------
// The single funnel every parts consumer goes through (setup-ui, recomputePlayerMods,
// makeCars, partsVisualKey, renderStatBars). Branching HERE is what keeps a career
// build fully isolated from the free-play garage: your career car and your Grand
// Prix car for the same team are separate objects that can never leak into one
// another, and career's own build is the only one subject to the R&D gate.
// Gates on inCareer(), NOT Career.data() — data() is only "a save exists on
// disk" (loaded at boot for the title's CONTINUE), so gating on it would let a
// GP or TT garage's FREE BUILD write straight into career.fitted, maxing the
// career car for no credits or research (Parts.resolveSetup trusts this funnel
// and never re-validates). Merely opening the GP garage would mutate the save,
// since buildSetup() deletes unusable categories out of the object it is handed.
function careerFitted(teamId) {
  const c = Career.inCareer() ? Career.data() : null;
  return c && teamId === c.team ? c : null;
}
function getTeamParts(teamId) {
  const c = careerFitted(teamId);
  if (c) return c.fitted;
  return store.get("parts." + teamId, {});
}
function saveTeamParts(teamId, parts) {
  const c = careerFitted(teamId);
  if (c) { if (Career.conflicted && Career.conflicted()) return; c.fitted = parts; Career.save(); return; }
  store.set("parts." + teamId, parts);
}

// ---------- liveries (custom paint jobs) ----------
// Persist / resolve / live-draft — js/car/custom-liveries.js (CustomLiveries.create).
// Catalog entries stay in Liveries; drawAeroFlaps / partsVisualKey stay here and
// call through the destructured helpers.
const customLiv = CustomLiveries.create({ store });
const {
  getLiveryId, saveLiveryId, getCustomLiveries, setCustomLiveries,
  getLiveries, resolveLivery, wingColorOf,
} = customLiv;

// Draw a car's MOVEABLE wing elements (active aero) at flap blend `blend`
// (0 = Z-mode, 1 = X-mode), given that car's world model matrix. Shared by the
// in-race draw loop, the mirror / PiP (CarDraw.drawMirrorCar) and the GARAGE
// turntable, so the wings a player inspects are the ones that open on track.
// At rest (blend 0 or 1), or `still` (the nearer rest pose: a rival past
// FieldLod.flapsM(), the mirror / PiP), ONE baked set (CarMesh.getAeroFlapSet).
const _flapWorld = new Float32Array(16);
// `only` limits the draw to one wing ("front"/"rear") — the COCKPIT body build
// skips the rear assembly entirely, so drawing the rear plane there would hang
// it in mid-air behind a car that has no rear wing.
function drawAeroFlaps(team, aLvl, blend, modelMat, mat, style, only, still) {
  const col = wingColorOf(team), b = clamp(blend, 0, 1);
  // The moveable flaps are drawn OUTSIDE the baked mesh, so Car3D.build()'s
  // finish remap never reached them — a chrome/satin car kept glossy top flaps.
  // Thread the livery finish through so getAeroFlap remaps the flap material too.
  const finish = resolveLivery(team).finish || null;
  if (still || b === 0 || b === 1) {
    const set = CarMesh.getAeroFlapSet(aLvl, col, style, finish, b >= 0.5, only);
    if (set) gfx.draw(set, modelMat, mat);
    if (b >= 0.5 && CarMesh.drawAeroEdge) CarMesh.drawAeroEdge(modelMat, aLvl, style, 1);
    return;
  }
  const flaps = Car3D.aeroFlaps(aLvl, style);   // NOT `els` — that name is the
  for (let i = 0; i < flaps.length; i++) {      // file-wide DOM registry
    const fg = flaps[i];
    if (only && fg.wing !== only) continue;
    const ang = fg.zAngle + (fg.xAngle - fg.zAngle) * b;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const W = _flapWorld;
    W.set(modelMat);
    // Rotate the element about the car's local X (the `r` column) by `ang`, then
    // hang it at ITS OWN pivot. Columns are [r, u, f]: local +Y maps to
    // u*cos+f*sin and local +Z to -u*sin+f*cos, which lifts the trailing edge
    // (at local -z) as the angle grows. Handedness of [r,u,f] doesn't matter —
    // `u` is the real up vector either way, and the garage preview's x-REFLECTED
    // matrix works for the same reason.
    for (let k = 0; k < 3; k++) {
      const uu = modelMat[4 + k], ff = modelMat[8 + k];
      W[4 + k] = uu * ca + ff * sa;
      W[8 + k] = -uu * sa + ff * ca;
      W[12 + k] += uu * fg.y + ff * fg.z;
    }
    const mesh = CarMesh.getAeroFlap(aLvl, col, i, style, fg, finish);
    if (mesh) gfx.draw(mesh, W, mat);
  }
  if (CarMesh.drawAeroEdge) CarMesh.drawAeroEdge(modelMat, aLvl, style, b);
}

// partsVisualKey(teamId) -> cheap cache key for the resolved cosmetic tiers
// (e.g. "111111111111" = every category at its default/neutral tier). Used by the
// setup-screen live preview (getSetupPreviewMesh in js/garage/setup-camera.js),
// which re-keys its mesh every frame so the turntable updates as parts are
// picked (parts change live there, with no recomputePlayerMods() call). The
// in-race player/cockpit meshes instead read the cached playerVisualKey
// (refreshed in recomputePlayerMods) below.
function partsVisualKey(teamId) {
  const team = teamById(teamId);
  const vt = Parts.getVisualTiers(getTeamParts(teamId), team);
  // Key on the resolved OPTION id per category — the option fully determines the
  // visual (engine airbox, aero package, brake ducts/caliper, tyre compound all
  // vary per option now, not just per tier), so the mesh cache rebuilds whenever
  // any choice changes.
  const parts = vt._ids ? Parts.CATALOG.map((c) => vt._ids[c.id]).join("|")
                        : Parts.CATALOG.map((c) => vt[c.id]).join("");
  return parts + "|L:" + getLiveryId(teamId);   // livery repaints the mesh too
}

// Performance multipliers for ONE car, from its team's base stats and its own
// parts setup. Factored out of recomputePlayerMods because these numbers are a
// property of a CAR, not of "the player": while exactly one car was ever human
// a module-level `playerMods` was indistinguishable from a per-car field, but
// the moment a second human exists the singleton is silently wrong — a remote
// driver would accelerate, brake and (via muBase) CORNER on the local player's
// upgrades. Human cars carry the result as c.mods; AI cars have none and keep
// running on c.tierV * c.skill.
function modsFor(team, setup, tune) {
  // teamStats() folds in career development; outside career it hands back the
  // team's own literal untouched, so this is the same object it always was.
  const stats = Career.teamStats(team) || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  // `tune` is the SETUP SHEET's contribution and defaults to NONE. It is the
  // local player's sheet and nobody else's: js/net/lobby.js calls modsFor()
  // with a RIVAL's declared parts to show their stats, and folding in
  // SetupTune.mods(team.id) there scored a peer's car with this player's
  // anti-roll bars whenever the two happened to share a team.
  const mods = Parts.getMods(setup, team, tune || null);
  return {
    speed:     Parts.statMult(stats.speed)     * mods.speed,
    accel:     Parts.statMult(stats.accel)     * mods.accel,
    cornering: Parts.statMult(stats.cornering) * mods.cornering,
    braking:   Parts.statMult(stats.braking)   * mods.braking,
  };
}

// The garage resolves the tyre along with every other part. At runtime the
// fitted set can change, so retain the build with that one row divided out and
// let TyreModel.applyCompound put exactly one fitted row back in.
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

// Assign a car's ROLE. Three flags, deliberately not one:
//   human — driven by a person (local OR remote). Selects the full bicycle
//           model, a world-space pose, the heavier collision mass, and an input
//           source instead of the AI driver.
//   local — the car on THIS screen. Selects Input, the camera, the HUD, audio,
//           haptics, announcements and the particle FX.
//   isPlayer — RETAINED as an alias of `local`, because that is exactly what
//           every consumer outside this file already means by it (results.js's
//           "you" row, agentview's "self", apex.js's player lookup, the specs,
//           DEBUG-HOOKS.md). Keeping the name honest there is what lets this
//           split stay contained to game.js.
// A plain property, not a getter: these are read for every car on every tick.
function setCarRole(c, human, local) {
  c.human = !!human;
  c.local = !!local;
  c.isPlayer = !!local;
}

// ---- naming a car ACROSS peers ----------------------------------------------
// cars[] index is not an identity: makeCars() drops the custom team unless the
// player selected it and walks Career.gridDrivers(), so the grid's length and
// order differ between two screens in the same race — the id on the wire used
// to be ignored (take cars[0]) because a sender's own index meant nothing to
// the receiver.
//
// driverId ("redbull:1") is content-derived and stable, but the snapshot's
// per-car id is one byte, so the string can't go on the wire. A team's INDEX
// works as that number instead: Teams.LIST is eleven fixed teams plus exactly
// one appended custom entry, identical on every peer even when the custom
// team's contents differ. Two seats each puts the whole grid inside 0..23.
// Only meaningful once no two humans share a seat (js/net/lobby.js's seat
// exclusivity), which is why that had to land first.
function wireId(c) {
  if (!c || !c.team) return -1;
  // Per-car cache — team/seat are fixed for a car's life; makeCars rebuilds the objects each race.
  if (c._wireId !== undefined) return c._wireId;
  const ti = Teams.LIST.findIndex((t) => t.id === c.team.id);
  return (c._wireId = ti < 0 ? -1 : ti * 2 + (c.seat || 0));
}

// Swap where two cars START. Multiplayer needs this and nothing else does:
// gridUp() places THE local player at P12, and it runs on both peers, so two
// humans would otherwise line up in the SAME grid box — each player would find
// the rival posed inside their own car. NetPlay separates them after the grid
// is formed rather than teaching gridUp about a session that does not exist
// yet when it runs.
//
// Swapping (rather than assigning a position) is what keeps every other car on
// a distinct slot: the displaced car takes the one being vacated.
function swapGridSlots(a, b) {
  if (!a || !b || a === b) return false;
  for (const k of ["s", "x", "xVis", "gridPos", "prog", "lap"]) {
    const t = a[k]; a[k] = b[k]; b[k] = t;
  }
  // The world pose is the authority for a human car (see the physics notes in
  // AGENTS.md), so it has to be rebuilt from the new (s, x) — and the render
  // anchors pinned with it, or the car visibly slides from its old box to its
  // new one over the first frame.
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
  playerMods = modsFor(team, setup, tune);   // the local sheet, here and in makeCars only
  if (player) {
    player.tyreBaseMods = tyreBaseModsFor(team, setup, tune);
    player.mods = playerMods;
    tyres.applyCompound(player, player.tyre || tyres.optionRecord(Parts.resolveSetup(setup, team).options.tyres));
    playerMods = player.mods;
    player.brakeBias = standard ? SetupTune.BB_REF : SetupTune.brakeBias(team.id);
    player.rollBalance = standard ? 0 : SetupTune.balance(team.id);
  }
  // How much wing this car is carrying (0..1), which sets how much active aero
  // trades — see X_VMAX_GAIN_LO/HI. Cached here rather than resolved per physics
  // step: it only changes when the parts do.
  playerAeroLoad = Parts.aeroLoad(setup, team, standard ? undefined : SetupTune.aero(team.id));   // wing + the sheet's rake
  if (player) player.aeroLoad = playerAeroLoad;
  // The ERS part's two axes — deployment and recovery — which run the battery
  // and the overtake window (see drainFor/regenFor/otTimeFor).
  playerErs = Parts.ersProfile(setup, team);
  if (player) { player.ersDeploy = playerErs.deploy; player.ersRegen = playerErs.regen; }
  const vt = Parts.getVisualTiers(setup, team);
  // The resolved wheel spec + the full cosmetic key go to the car-draw module
  // (js/car/car-draw.js), which keys its player body / cockpit / wheel caches
  // on them. Key on the resolved option ids + the chosen livery (see partsVisualKey).
  carDraw.setPlayerParts(vt, (vt._ids ? Parts.CATALOG.map((c) => vt._ids[c.id]).join("|")
                                      : Parts.CATALOG.map((c) => vt[c.id]).join(""))
                             + "|L:" + getLiveryId(team.id));
}

// ---------- car setup ----------
// The AI speed multiplier for one driver. Ratings apply in EVERY mode — the
// grid has personality in a one-off Grand Prix too — and career layers its
// own development deltas on top.
//
// The simRnd() draw is UNCONDITIONAL and comes FIRST: the stream position
// after makeCars() must be identical whatever the ratings say, or a career's
// mere existence would shift every subsequent seeded result and silently
// break tests/specs/agent-determinism.spec.js and the seeded visual
// baselines. DriverRatings.skill() takes the sample rather than drawing its
// own for exactly this reason.
function driverSkill(team, d, di) {
  const roll = simRnd();
  const r = DriverRatings.get(d.code, team.tier, Career.devFor(team.id, di));
  // The pace-skill scalar PLUS the racecraft axes (0..1) the driving loop reads
  // for attack/defence/OT/ERS/lane (see updateCar + js/physics/ai-drive.js). Still
  // exactly ONE simRnd() draw — the stream-position contract reliability.js and
  // career.spec.js depend on.
  // Style −1..+1 (excluded from skill / overall / vmax product).
  return {
    skill: DriverRatings.skill(r, roll),
    craft: (r.craft || 75) / 100, awareness: (r.awareness || 75) / 100,
    experience: (r.experience || 75) / 100, consistency: (r.consistency || 75) / 100,
    aggression: DriverRatings.style01(r.aggression), optimism: DriverRatings.style01(r.optimism),
  };
}
const buildPace = DriverRatings.buildPace;

// The teams that will actually grid, and how many cars they field. Shared by
// makeCars() and the track build so the PAINT cannot disagree with the CARS —
// two independent constants let the grid outgrow the boxes.
function gridTeams() {
  // MY TEAM and LEGENDS are both "yours" — each enters the grid only when it is
  // the one you picked, so the field grows by one car, never by two teams.
  return Teams.LIST.filter((t, ti) => Teams.isReal(t) || ti === teamIdx);
}
// The seats a team actually GRIDS. Everything except LEGENDS is gridDrivers().
//
// The Legends team carries all twelve in `drivers` so the ordinary DRIVER picker
// doubles as the legend picker (js/data/legends.js team()), but it fields ONE —
// the one selected. Twelve legends on a single grid is a different game, and it
// would need eleven more boxes besides.
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
  cars = [];
  // the custom team only enters the grid when the player has selected it
  const grid = gridTeams();
  // Counted through the same accessor the loop below iterates, or MY TEAM's second
  // car would be missing from the lane spread it feeds.
  const total = grid.reduce((s, t) => s + seatsFor(t).length, 0);
  let idx = 0;
  grid.forEach((team) => {
    const ti = Teams.LIST.indexOf(team);
    const factoryParts = Parts.resolveSetup((Career.inCareer() && Career.aiSetup && Career.aiSetup(team)) || Parts.getFactorySetup(team), team);
    const savedParts = ti === teamIdx && !(daily.isActive() && daily.current().class === "standard") ? Parts.resolveSetup(getTeamParts(team.id), team) : factoryParts;
    // MY TEAM enters TWO cars — you and the driver you hired — where the custom
    // team ships with one. gridDrivers() returns team.drivers unchanged in every
    // other case, so free play and driver careers are untouched.
    seatsFor(team).forEach((dSeat, di) => {
      // The Legends team's single seat IS yours: driverIdx picked WHICH legend,
      // so it is not also a seat index here and `di === driverIdx` would put you
      // in nobody's car for any pick past the first.
      const isP = ti === teamIdx && (team.legends ? true : di === driverIdx);
      // MY TEAM's second car is YOUR car. `team.custom` plus a seat that is not
      // yours is the hire by construction: the custom team fields one entry
      // everywhere except a MY TEAM career (see gridDrivers), so free play and
      // driver careers cannot reach this. It fixes a guide that was lying —
      // js/career/career-ui.js says "Both cars run your build" — and a
      // constructors' championship your R&D only ever contested with one car.
      const mate = !isP && ti === teamIdx && !!team.custom;
      const resolvedParts = isP || mate ? savedParts : factoryParts;
      // In a driver career YOU take one of the team's two real seats; the driver
      // you replaced steps aside and your team-mate stays put as the benchmark
      // every objective is measured against. Null outside career.
      const d = Career.driverOverride(team.id, di) || dSeat;
      // Spread the field's preferred lanes evenly across the track width (with a
      // little jitter) so the AI fan out instead of all stacking on the racing
      // line. Used as a fraction of half-width in updateCar.
      // INTERLEAVED, not swept. A sweep in grid order gave the two cars that
      // will actually race each other — adjacent on the grid, adjacent on the
      // road — lines 0.48 m apart, and then the shared racing-line term pulled
      // both toward the same apex. Alternating sides with the magnitude
      // stepping every second slot puts grid neighbours ≥ 1.5 m apart at Monza,
      // the way a real grid staggers, while keeping the same overall spread.
      // ONE simRnd() per car as before, so the seeded stream is unchanged.
      const half = Math.max(1, (total - 1) >> 1);
      const lane = clamp((idx % 2 ? 1 : -1) * ((idx >> 1) / half) * 0.78
        + (simRnd() - 0.5) * 0.12, -0.85, 0.85);
      idx++;
      cars.push({
        team, name: d.name, code: d.code, driverId: seasonDriverId(team.id, di), num: d.num,
        // Role flags — see setCarRole. Today the only human IS the local player,
        // so all three agree; a networked rival is human without being local.
        human: isP, local: isP, isPlayer: isP,
        // Per-car performance multipliers (human cars only — see modsFor).
        // startRace()'s recomputePlayerMods() refreshes the local player's.
        mods: isP ? modsFor(team, getTeamParts(team.id), SetupTune.mods(team.id)) : null,
        tyreBaseMods: isP ? tyreBaseModsFor(team, getTeamParts(team.id), SetupTune.mods(team.id)) : null,
        // AI runs the works wing/ERS (SIGNATURE equivalents already differ).
        // MY TEAM + hire share the saved build; everyone else uses factory.
        rollBalance: isP ? SetupTune.balance(team.id) : 0,
        aeroLoad: (isP || mate) ? Parts.aeroLoad(getTeamParts(team.id), team, isP ? SetupTune.aero(team.id) : undefined) : Parts.aeroLoad(factoryParts.setup, team),   // the BUILD is shared, the SHEET is not: rollBalance/mods above are already isP-only, and an AI reads aeroLoad continuously (AiDrive.lateralScale), so the mate was the only car the player's rake moved
        ersDeploy: (isP || mate) ? Parts.ersProfile(getTeamParts(team.id), team).deploy : Parts.ersProfile(factoryParts.setup, team).deploy,
        ersRegen: (isP || mate) ? Parts.ersProfile(getTeamParts(team.id), team).regen : Parts.ersProfile(factoryParts.setup, team).regen,
        color: team.color, tier: team.tier, seat: di, houseStats: Career.teamStats(team),
        // Baked once here rather than looked up per physics step. Career team
        // development rides along in the same number the tier always contributed,
        // so the per-car update below is unchanged in shape. paceMult() is exactly
        // 1 outside career, making GP/TT bit-identical.
        tierV: TIER_V[team.tier] * Career.paceMult(team.id) * (mate ? buildPace(savedParts, factoryParts) : 1),
        // Tread class for gripMult(c); null on an AI car means "fits the right tyre" (wear off; a pit plan gets its set's tread in applyCompound).
        tread: (isP || mate) ? (resolvedParts.options.tyres.wetTread || 0) : null,
        // The fitted catalog row IS the compound (docs/research/TYRE-STRATEGY-DESIGN.md
        // §6) — one axis, not a compound axis multiplied by an upgrade tier.
        // gridUp fits a fresh set from it; an AI car gets one from its class draw.
        tyreOpt: (isP || mate) ? resolvedParts.options.tyres : null,
        tyre: null, tyreWear: 0, tyreLap0: 0, tyreStints: 0,
        fuelId: resolvedParts.ids.fuel,
        fuelVisual: resolvedParts.visual.fuel,
        ...CarDraw.carVisual(team, d.num, isP || mate, getTeamParts),   // visualSetup/visStamp/visPaint/visSh: the menu prep's cache keys too
        s: 0, x: 0, speed: 0, prog: 0, lap: 0,
        gear: 1, rpm: IDLE_RPM, shiftT: 0, boostOn: false,
        energy: 1, otT: 0, otE: 0, deploying: false,
        // active aero: commanded mode, the 0..1 flap blend, and whether the
        // road ahead currently allows X-mode at all (see inAeroZone).
        xOn: false, aeroX: 0, xArmed: false,
        lapTime: 0, best: Infinity, totalT: 0,
        finished: false, finishT: 0, finPos: 0,
        // Retirement (js/race/reliability.js). `retired`/`dnf` are the record;
        // dnfAt/dnfWhy are the plan Reliability.arm() draws at the green light.
        // Declared here so every car has the shape whether or not a race arms it.
        retired: false, dnf: null, dnfAt: null, dnfWhy: null,
        offroad: false, offT: 0, cuts: 0, penalty: 0,
        yawVis: 0, steerVis: 0, collideT: 0,
        ...driverSkill(team, d, di),   // skill + craft + awareness + experience
        // lanePref is the grid HOME LINE and never moves; adaptLane biases c.lane
        // around it (never accumulating into ±0.85), and every re-grid restores it.
        lane, lanePref: lane,
      });
    });
  });
  player = cars.find((c) => c.isPlayer) || null;   // find() yields undefined; G.player's contract is CarState | null
}

// `preOrder` is an explicit grid, fastest first — a qualifying classification.
// Without one, GP sorts by tier and drops the player at P12 on purpose. The
// GRID RULE applies to the order the session produced (null = gridUp's own
// pace-order build): rev10 reverses the qualifying top ten and leaves 11+ as
// they qualified (F2's sprint rule); revchamp inverts SeasonCal.rank; random
// sorts on ONE simRnd() per car — the same draw gridUp() would have spent, so
// the stream position after the grid is identical whichever rule ran
// (makeCars' stream contract).
function gridRule() {
  const rule0 = isTimeTrial() ? "tier" : isChampionship() ? (SeasonCal.quali() ? "quali" : champGrid) : raceGrid;
  return (rule0 === "random" && netPlay.active()) ? "tier" : rule0;
}
function gridOrderFor(base) {
  // RANDOM CANNOT BE DECIDED LOCALLY IN A ROOM. netplay's grid is
  // negotiation-free precisely because gridUp() runs identically on every peer
  // (js/net/netplay.js separateGrid) — but no seed crosses the wire, so each
  // peer would roll its own order and lay the humans into different boxes.
  // Fall back to the pace order every peer already agrees on.
  const rule = gridRule();
  if (rule === "rev10" && base && base.length === cars.length) {
    return base.slice(0, 10).reverse().concat(base.slice(10));
  }
  // Round 1 (nobody scored) falls through to gridUp's pace order, as STANDINGS does: the all-zero table sorted by driver id.
  if (rule === "revchamp" && isChampionship() && season && !base && Object.values(season.pts || {}).some((p) => p > 0)) {
    // SPEND THE JITTER ANYWAY. gridUp() draws one simRnd() per car when it
    // builds its own order, so a rule that returns a full order without
    // drawing leaves every later consumer (the AI overtake fire, the start
    // hold) reading a different point in the stream than the same seed would
    // have reached under PACE ORDER. Draw and discard: same count, same
    // position, order decided by the standings.
    for (let i = 0; i < cars.length; i++) simRnd();
    return cars.slice().sort((a, b) => SeasonCal.rank(season, a.driverId, b.driverId)).reverse();
  }
  const champ = rule === "champ" && isChampionship() && season && !base
    ? SportingRegs.champOrder(cars, (a, b) => SeasonCal.rank(season, a, b), (id) => season.pts[id] || 0) : null;
  if (champ) { for (let i = 0; i < cars.length; i++) simRnd(); return champ; }   // round 1 (nobody scored): gridUp's default
  if (rule === "random" && !base) {
    const jit = new Map(cars.map((c) => [c, simRnd()]));
    return cars.slice().sort((a, b) => jit.get(a) - jit.get(b));
  }
  return base;
}
// RED FLAG → STANDING RESTART (js/race/race-control.js level 4). The surface
// is cleared and the field re-gridded in RACE ORDER on the boxes — the 2026
// procedure once the track is clear — keeping laps, the race clock, best laps,
// grid positions and penalties. Lapped cars keep their lap count and grid
// behind (prog is cumulative). A race already at its flag stands as it is.
// Not modelled: the wet-race rolling restart, the pit-lane wait; a networked
// race never goes red (RaceControl holds a safety car instead).
// STREAM: the restart re-runs the countdown, so it draws one extra simRnd()
// for the new startHold. Deliberate — the lights are a real second start.
function redFlagRestart() {
  if (state !== "race" || !track || cars.some((c) => c.finished)) return false;
  IncidentSim.reset(); DebrisWorld.reset(); DebrisWorld.prime();
  const L = track.total;
  const order = cars.filter((c) => !c.retired).sort((a, b) => b.prog - a.prog);
  // THE REWIND IS THE LEADER'S. Stepping each car back its OWN lap would put a
  // car 150 m behind a leader that had just crossed (one lap number lower, not
  // lapped) a full lap down after the restart. The leader re-runs its lap; every
  // other car keeps the laps it was actually down at the flag, by distance.
  const lead = order[0];
  const leadProg = lead ? lead.prog : 0, leadLap = lead ? Math.max(0, lead.lap - 1) : 0;
  order.forEach((c, i) => {
    const slot = TrackMesh.gridSlot(track, i);
    c.s = wrapS(slot.s); c.x = slot.x; c.xVis = c.x;
    c._recross = false;   // a reverse just before the flag must not leave the first real crossing untimed
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x; c.pz = w.z; c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c._prevS = c.s;
    // The box sits BEHIND the line on the lap the car is on — the same prog
    // the opening grid uses (lap 0 → negative) — so the next crossing counts.
    // Bank what the teleport gave (or took): prog must follow the car to the
    // grid box, but no car DROVE that distance, and checkRetirements measures
    // the reliability draw against prog / (laps × length).
    // The lap the car was ON is re-run from the line: `lap` counts crossings,
    // so keeping it made the restart crossing lap n+1 — a leader on its last
    // lap was classified finished 14 m after the lights. Same lap/prog
    // relation as gridUp (lap 0 ↔ prog just under 0).
    const progWas = c.prog, lapWas = c.lap;
    const down = Math.max(0, Math.floor((leadProg - progWas) / L));
    const lapNew = c === lead ? leadLap : Math.min(lapWas, Math.max(0, leadLap - down));
    if (lapNew < lapWas) {
      // Fuel follows laps actually driven, not the scoring lap we replay from
      // the grid. A restart cannot put burned fuel back in the tank.
      c.fuelLap = Math.max(c.fuelLap || 0, lapWas + (c.fuelRestartLaps || 0));
      c.fuelRestartLaps = (c.fuelRestartLaps || 0) + (lapWas - lapNew);
    }
    c.lap = lapNew;
    c.prog = c.lap * L - (L - c.s);
    c._progGift = (c._progGift || 0) + (c.prog - progWas);
    c.head = 0; c.yawVis = 0; c.rPrevHead = 0; c.rPrevYawVis = 0;
    c.speed = 0; c.accSm = 0; c.corridorAccel = 0; c.vLat = 0; c.yawRateCur = 0; c.steerVis = 0; c.aiHead = 0; c.aiBias = null; c.aiFam = 0; c.hYieldT = 0; c.lane = c.lanePref;   // as gridUp
    c.gear = 1; c.rpm = IDLE_RPM;   // a standing start in 2nd+ has gearLo > 0, so manual drive is zero until a downshift
    c.xOn = false; c.aeroX = 0; c.xArmed = false; c.towing = 0; c.wake = 0; c.wheelLock = 0;
    clearRacingScratch(c);
    // A CAR ON A GRID BOX IS STATIONARY, ALONE AND ON CLEAN TARMAC. This path
    // reuses the SAME car objects (gridUp builds a race, makeCars is not
    // re-run), so anything the racing wrote survived onto the box: contactT
    // decays rather than being recomputed, so the AI ran its contact branch
    // from a standing start; wrongWay/rescue/off/wall said the car was in a
    // gravel trap; otT/otE held a move that ended when the flag flew.
    // Energy, tyreClass and phaseRoll are NOT cleared — same race, and the
    // strategy and the ERS state legitimately carry through a red flag.
    c.contactT = 0; c.wrongWay = false; c.wrongT = 0; c.rescueT = 0; c.rescueLastT = null; c.digEscHeld = false;
    c.offT = 0; c.wallT = 0; c.wasOnWall = false; OvertakeMode.reset(c);
    c.kerbGripSm = 1; c.kerbCueT = 0; c.brakeStab = null; c.axEstSm = 0;   // stationary: no brake-stability or longitudinal-accel history (flatSpot stays: same tyres)
    // A STOP IN FLIGHT IS SCRATCH, not strategy: the grid boxes sit INSIDE the
    // pit window on most circuits, so a car holding the lane when the flag flew
    // would restart still reading inLane() — pinned at the pit limiter for ~12 s
    // on Monza. pitStops/pitNext/pitPlan are untouched: same race. Ledger 2026-09-22.
    pits.clearArm(c);
    // AND IT IS A STANDING START: re-plan the launch. gridUp arms this once,
    // launchDone disarms it when the first getaway ends, and nothing re-armed
    // it — so the restart the countdown calls "a real second start" was the
    // one start no AI ever launched for. hash32, never simRnd: the stream's
    // draw count is a contract, and ":restart:" makes the plan its own.
    const rh = DriverRatings.hash32(simSeed() + ":restart:" + i + ":" + c.skill);
    c.launch = c.human ? null : AiDrive.launchPlan(AiDrive.traits(c), (rh & 0xffff) / 65536);
    c.launchOn = !c.human;
    c.incidentInvalidLap = true;   // a lap with a red flag in it is not a timed lap
  });
  seedPlayerPose();
  restartPending = true;
  setState("count", "red-flag-restart"); countT = 0; lightsLit = 0; startHold = 0;
  els.lights.hidden = false;
  for (const l of els.lights.children) l.classList.remove("on");
  sectorIdx = player ? sectorAt(player.s) : 0; sectorStartT = player ? player.lapTime : 0; sectorValid = false;
  snapGameCam();
  announce("RED FLAG — STANDING RESTART", 3, "warning");
  Log.info("game", "red flag: standing restart, " + order.length + " cars re-gridded at raceT " + raceT.toFixed(1));
  return true;
}
function gridUp(preOrder) {
  // WHERE THIS GRID CAME FROM, and the reason it is worth a variable: the
  // else-branch below SPLICES THE LOCAL PLAYER TO P12, which is a per-peer
  // adjustment — car X ends up at a different gridPos on each machine. A
  // pre-ordered grid (qualifying) takes no such step, so every car holds the
  // same slot everywhere. js/net/netplay.js's separateGrid() has to know which
  // it is: the collision it exists to fix can only happen on the P12 branch.
  gridPreOrdered = !!(preOrder && preOrder.length === cars.length);
  scWatch.reset();
  const order = preOrder && preOrder.length === cars.length ? preOrder.slice() : (() => {
    // grid jitter: ONE simRnd() draw per car, BEFORE the sort — a random
    // comparator is inconsistent and its draw count engine-defined.
    const jit = new Map(cars.map((c) => [c, simRnd()]));
    const o = cars.slice().sort((a, b) => (a.tier - b.tier) || (jit.get(a) - jit.get(b)));
    const pi = o.indexOf(player);
    if (pi >= 0) {   // an AI-only field (player null) has nobody to seat at P12
      o.splice(pi, 1);
      o.splice(Math.min(11, o.length), 0, player);
    }
    return o;
  })();
  // TYRE WEAR is a property of the session, so it is set at the one funnel every
  // armed race goes through rather than at each caller. A time trial is a lap
  // against the clock on a set nobody is asked to manage, so it is always off.
  tyres.setLevel(isTimeTrial() ? "off" : raceTyreWear);
  order.forEach((c, i) => {
    // Where this car STARTED — the only record: `order` is discarded here and the
    // flag classification is built from finishing times. Career's "out-qualify
    // your team-mate" objective reads it; correct for both branches above.
    c.gridPos = i + 1;
    // TrackMesh owns the slot geometry, so the painted boxes cannot drift off it.
    const slot = TrackMesh.gridSlot(track, i);
    c.s = wrapS(slot.s); c.x = slot.x;
    c.xVis = c.x;   // dump/net field; render no longer damps this
    {
      const w = worldFromTrack(c.s, c.x, smp);
      c.px = w.x; c.pz = w.z;
      c.rPrevPx = c.px; c.rPrevPz = c.pz;
      c.rPrevS = c.s; c.rPrevX = c.x;
    }
    c.head = 0; c.yawVis = 0;   // straight ahead on the grid (heading model)
    c.speed = 0; c.accSm = 0; c.corridorAccel = 0; c.prog = -(14 + i * 8); c.lap = 0; c.fuelLap = 0; c.fuelRestartLaps = 0; c.energy = 1; c._progGift = 0;   // a car on the grid is pulling nothing — apex.js reset() has the full list and why
    OvertakeMode.reset(c); c.lapTime = 0; c.best = Infinity; c.totalT = 0;
    c.xOn = false; c.aeroX = 0; c.xArmed = false;   // flaps shut on the grid
    c.finPos = 0; c.retired = false; c.dnf = null; c.dnfAt = null; c.dnfWhy = null; delete c._coastHeld;   // last race's classification: makeCars' values; a race re-arms via armReliability
    c.finished = false; c.finishT = 0; c.cuts = 0; c.cutWarn = 0; c.qualiCut = false; c.penalty = 0; c.offT = 0; c.hits = 0; c.hitSev = 0; c.wallHits = 0; c.errCount = 0; Damage.reset(c);   // mistakes THIS race — the instrument's denominator, cleared only by a NEW race
    c.wrongT = 0; c.wrongWay = false; c.rescueT = 0; c.rescueLastT = null; c.digEscHeld = false; c.wallT = 0; c.wasOnWall = false;
    c.vLat = 0; c.yawRateCur = 0; c.steerVis = 0; c.yawVis = 0; c.rPrevYawVis = 0; c.aiHead = 0; c.aiBias = null; c.aiFam = 0; c.hYieldT = 0; c.contactT = 0; c.lane = c.lanePref;   // BOTH sides of a real conflict: lane is damped state, not a constant, and contactT DECAYS — unlike the towing/wheelLock beside it, a re-grid is the only thing that clears it
    c.rPrevHead = 0;
    c.kerbGripSm = 1; c.kerbCueT = 0; c.towing = 0; c.wake = 0; c.flatSpot = 0; c.brakeStab = null; c.axEstSm = 0;   // flatSpot: last race's tyre (car-draw wobble); brakeStab null = brakeBeta's cold seed, as apex.js reset() leaves it
    clearRacingScratch(c);
    // The launch plan and the pace phase (AiDrive): one hash per car per race,
    // never a simRnd() draw — the stream's draw count is a contract. Season /
    // career round + seasonSeed match armReliability (docs/BUGS.md B6).
    const hSeed = luckSeed();
    const hRound = isChampionship() ? SeasonCal.drawRound(season) : raceIndex;
    const h = DriverRatings.hash32(hSeed + ":" + hRound + ":" + i + ":" + c.skill);
    c.launch = c.human ? null : AiDrive.launchPlan(AiDrive.traits(c), (h & 0xffff) / 65536);
    c.launchOn = !c.human; c.phaseRoll = (h >>> 16) / 65536; c.raceHash = h;
    c.tyreClass = c.human ? null : AiDrive.tyreClass(((h >>> 8) & 0xffff) / 65536, lapsTarget);   // the compound IS the strategy
    // A fresh set for the start. The player's comes from the fitted catalog row
    // (the row IS the compound); an AI car's from the class it just drew. No RNG
    // here — `h` is already the per-car race hash, so arming costs the sim
    // stream nothing, exactly as Reliability's retirement draw does.
    c.tyreStints = 0; c.tyreLog = null;   // a new race is a new strip, not an appended one
    pits.reset(c); engineer.reset(c);
    // STRATEGY (js/physics/ai-drive.js stintPlan). Drawn ONCE here from its own
    // hash of seed, round and DRIVER (not grid slot + skill: tier-adjacent cars
    // drew alike), so it consumes nothing from the sim RNG stream — the contract
    // js/race/reliability.js holds for retirements, held for strategy too.
    // An AI car's STARTING compound is the plan's, not the class draw's, when
    // wear is on; the class draw still stands in for the legacy fudge when it
    // is off. The player plans their own race.
    // The PLAYER gets a plan too — a REFERENCE, the one the pit wall would run
    // (PitLane.think never executes a human's; the HUD and the engineer read it).
    c.pitPlan = tyres.on() ? pits.planFor(c.human ? 0.5 : DriverRatings.hash32(hSeed + ":" + hRound + ":" + (c.driverId || c.code || i) + ":strategy") / 4294967296, !!c.human, 0, c) : null;
    if (c.pitPlan && !c.human) c.tyreClass = c.pitPlan.start;
    tyres.fit(c, tyres.startRecord(c, TyreModel.treadFor(raceWeather, roadWetness())));
  });
  // Seed the PLAYER's world pose HERE rather than leaving it to the first
  // physics tick (the `c.px == null` init in update()). The chase rig has two
  // branches — car-anchored when px/pz exist, road-frame when they don't — and
  // startRace() calls snapGameCam() right after this. With a null world pose the
  // grid was framed by the ROAD-frame fallback (no 3/4 side offset, half the
  // car's lateral offset), then the very first tick initialised px and the live
  // rig switched to the car-anchored framing: the eye damped ~1.2 m sideways
  // over the opening frames — the camera "snapping to the side" at the start.
  // These are exactly the values update() would have written a tick later, so
  // nothing downstream changes; it just happens before the first frame is shot.
  seedPlayerPose();
}
// The player's world pose from its grid (s, x) — shared by gridUp and the red
// flag re-grid. Heading follows the road tangent, not world +Z: `head = 0` is
// the AI/heading-model placeholder and is only right where the start straight
// happens to point down +Z.
function seedPlayerPose() {
  if (!player || player.retired) return;
  const w0 = worldFromTrack(player.s, player.x, smp);
  player.px = w0.x; player.pz = w0.z;
  // Match the render-interpolation snapshot too, or the first frame blends
  // from whatever world point the PREVIOUS session left in rPrevPx.
  player.rPrevPx = player.px; player.rPrevPz = player.pz;
  player.head = Math.atan2(smp.t[0], smp.t[2]);
  player.rPrevHead = player.head;
  player.vLat = 0; player.yawRateCur = 0;
}
// Racecraft scratch a re-grid must drop: a pass latch, a defensive move or a
// mistake phase that outlives the field it was made against runs from the
// grid box. Same list apex.js reset() clears.
function clearRacingScratch(c) {
  c.stuckT = 0; c.letPassT = 0; c.passOf = null; c.passT = 0; c.passCool = 0; c.holdOff = null;
  c.defendSide = 0; c.passFailOf = null; c.passFailT = 0; c.errT = 0; c.pressT = 0; c.zoneKey = -1; c.queueT = 0; c._qOf = null;
  c.calmUntil = 0; c.calm = 0; c.sbsT = 0; c.atkOn = c.atkWant = false; c.runT = 0; c._alPrev = null; c.paceF = 0;   // racecraft state (AiDrive startCalm / sbs / runExtra / repassLock / paceSample)
  // errCount is NOT cleared here — a red-flag re-grid is the SAME race, so the
  // mistakes counted before the flag stay on the car (as energy and tyreClass
  // do). gridUp zeroes it beside c.hits/c.cuts, where a new race's counters live.
}

// Car decal / effect-quad / cockpit-instrument geometry lives in
// js/car/car-mesh.js (CarMesh; renderer handle injected below at boot).
CarMesh.init(gfx);
// The garage/setup-preview environment — js/garage/scene.js, same pattern.
GarageScene.init(gfx);
// Transient FX particle pool (tyre smoke / sparks / kickup / rain spray) —
// js/fx/particles.js; same injected-renderer pattern as CarMesh above.
Particles.init(gfx);
const { carDecalData, getCarDecalMesh, getCockpitDecalMesh,
        getBrakeRing, drawRearLights, drawMirrorLights,
        getCockpitWheel, getLedStrip, getGearDigit, getSpeedDigit,
        getErsBar, getOtLamp, drawWheelExtras } = CarMesh;
// Reusable { dy, roll } scratches for Tracks.banking — one for the physics step,
// one for the render loop (both called once per car per frame) so banking() no
// longer allocates a fresh object ~23×/frame.
const _bankScratch = { dy: 0, roll: 0 };
const _bankScratchP = { dy: 0, roll: 0 };
// Argument scratch for DebrisWorld.tyreMarble — called per car per physics step
// from both the player and AI paths. Read-only at the callee (and spawnMarble
// retains nothing), so one shared object is safe.
const _marbleArg = { lock: 0, slip: 0, speed: 0 };
// ...and a third for the camera, which asks once per frame from render() and
// was the one call site still letting banking() allocate.
const _bankScratchCam = { dy: 0, roll: 0 };
// Pooled camVantage extras + damp anchors — vantage() reads synchronously, keeps no reference.
const _vantCarPos = [0, 0];
const _vantExtra = { bankDy: 0, deploy: false, slipLat: 0, att: null, carPos: null, carHead: 0, reduceMotion: false,
  rival: null, playerProg: 0, snap: false };
const _camAP = [0, 0, 0], _camAN = [0, 0, 0];

function cameraBankScale(mode) {
  return mode === "heli" || mode === "side" || mode === "cinematic" || mode === "overhead" ? 0.35
       : mode === "pitwall" || mode === "trackside" ? 0 : 1;
}

// Build the grounded transform needed by the pre-scene car-shadow pass. The main
// car loop runs later, after shadow maps are already consumed by the lit shader,
// so the player matrix must be resolved here instead of reusing last frame's
// pooled transform (which trails by speed × frame time on slower devices).
// No `dt`: it was declared and never read.
function currentCarGroundMat(c, out) {
  // Player (s,x) already resolved once this frame for the camera — reuse it.
  let cS, cX;
  if (_plOk && c.isPlayer) { cS = _plCS; cX = _plCX; }
  else { const pa = playerAnchor(c); cS = pa.cS; cX = pa.cX; }
  // Same interpolated lateral as the body pass — no extra xVis damp.
  const renderX = cX;
  Tracks.sample(track, cS, smp2);
  // Normalize the lerped tangent/right — same fix as the body loop: raw they
  // scale the shadow-caster basis at the 4 m node rate (see the note there).
  { const t = smp2.t, r = smp2.r;
    let l = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
    l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l; }
  const bankC = Tracks.banking(track, cS, renderX, _bankScratch);
  if (c.isPlayer) {   // stash for body draw (env probe may clobber smp2)
    const S = _smpPlayer, p = smp2.p, t = smp2.t, r = smp2.r;
    S.p[0] = p[0]; S.p[1] = p[1]; S.p[2] = p[2]; S.t[0] = t[0]; S.t[1] = t[1]; S.t[2] = t[2];
    S.r[0] = r[0]; S.r[1] = r[1]; S.r[2] = r[2]; S.hw = smp2.hw;
    _bankPlayer.dy = bankC ? bankC.dy : 0; _bankPlayer.roll = bankC ? bankC.roll : 0; _plBodyOk = true;
  }
  const rp = renderPosOf(c);   // player: exact world position
  tmpP[0] = rp.world ? rp.x : smp2.p[0] + smp2.r[0] * renderX;
  tmpP[1] = smp2.p[1] + (bankC ? bankC.dy : 0);   // road SURFACE height: legit
  tmpP[2] = rp.world ? rp.z : smp2.p[2] + smp2.r[2] * renderX;
  const yv = yawVisInterp(c);   // same interpolated yaw as the body loop
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

// ---------- track loading ----------
const sessionDarkFor = (def) => raceTimeOfDay === "night" || raceTimeOfDay === "dusk" ||
  raceTimeOfDay === "dawn" || (raceTimeOfDay === "default" && !!def.night);
const trackBuildOpts = (night, gridSlots) => ({ night, gfx, chunkRibbons: PerfGov.tier() < 3, gridSlots, retainGraph: wantAgentSurface() });
// The world freed: the old one before a stepped rebuild, or one the player picked away from (scheduleFlybyTrack).
function dropTrackWorld() {
  _menuGate.track = null; _menuGate.ready = ""; _menuGate.warm = 0; _menuFly = null;
  shadowPass.reset(); freeTrackMeshes(track);
  track = null; builtTrackId = null;
  if (typeof LampBake !== "undefined") LampBake.reset();
}
// THE BUILD IN STEPS (Tracks.buildPaced): loadTrack at ~8 ms per frame, so the garage
// drive-out keeps animating. Frees the old world first, adopts the new one whole; a
// newer build or live() going false abandons it and frees its partial uploads.
// Sentinel is race-start only (startRaceBody). Menu/flyby must not arm SENT_ACTIVE.
function raceArmedSentinel() { return state === "race" || state === "count"; }
async function loadTrackStepped(idx, live) {
  // LAZY_CIRCUIT: path/pal/sectors land via ensureCircuit before any build.
  // Callers (flyby / startRace / intro) already await ensureScenery (which
  // chains ensureCircuit); this gate covers a direct stepped load and races
  // the in-flight memo so a meta stub never reaches Tracks.buildPaced.
  await ensureCircuit(idx);
  if (!live()) return false;
  const def = Tracks.LIST[idx], sessionDark = sessionDarkFor(def), wantSlots = fieldSize();
  if (builtTrackId === def.id && builtTrackNight === sessionDark && builtGridSlots === wantSlots) { loadTrack(idx); return true; }
  const prevId = builtTrackId;
  try { if (raceArmedSentinel()) PerfGov.sentinelArm(true); } catch (_) { /* governor absent in a stub */ }
  let built = null;
  try {
    dropTrackWorld();
    // apex26.buildWorker (default ON when multi-core): off the main thread for
    // IN-SESSION track switches only (state race/count). Cold race entry from
    // the menu stays on the paced build — quiet A/B showed worker+replay
    // regressing race-entry maxBlock/loadTrack wall while cutting track-switch
    // longtasks (see PR #1175 table). null (off/failed) → stepped build.
    const opts = trackBuildOpts(sessionDark, wantSlots);
    const switchInSession = (state === "race" || state === "count");
    const msg = switchInSession && typeof TrackBuildClient !== "undefined"
      && await TrackBuildClient.build(idx, def, opts, gfx, sceneryResident(def.id) ? SCENERY_DIR + "/" + def.id + ".js" : null);
    if (track !== null || !live()) return false;   // a sync loadTrack, or the player backed out, meanwhile
    // A replay that throws (an upload fails) already freed its handles: build in steps instead of failing the preparation.
    if (msg) try { built = await TrackBuildClient.replay(msg, def, gfx); } catch (e) { Log.warn("track", "build worker replay failed (" + (e && e.message) + "); building in steps"); }
    if (msg && built && (track !== null || !live())) { freeTrackMeshes(built); return false; }   // superseded during the replay
    if (!built) { if (track !== null || !live()) return false; built = await Tracks.buildPaced(def, opts, live, freeTrackMeshes); }
  } finally {
    try { if (!raceArmedSentinel()) PerfGov.sentinelArm(false); } catch (_) { /* as above */ }
  }
  if (!built) return false;
  _loadTrackBody(idx, def, built, prevId);
  return true;
}
function loadTrack(idx) {
  // Every loader releases selector ownership before replacing the world.
  _menuGate.track = null; _menuGate.ready = ""; _menuGate.warm = 0;
  const def = Tracks.LIST[idx];
  // Sync build: caller must have awaited ensureCircuit (or game-vm hydrated).
  // A title meta stub has no path — refuse rather than throw deep in realPoints.
  if (def && !def.custom && !(Tracks.circuitPayloadResident
      ? Tracks.circuitPayloadResident(def)
      : (def.path && def.path.pts && def.path.pts.length && !def._metaOnly))) {
    throw new Error("loadTrack: circuit \"" + (def && def.id) + "\" still meta-only — await ensureCircuit(idx) first");
  }
  // Menu/flyby reaches here too; only a live race/count session arms the sentinel.
  try { if (raceArmedSentinel()) PerfGov.sentinelArm(true); } catch (_) { /* governor absent in a stub */ }
  try {
    return _loadTrackBody(idx, def);
  } finally {
    // Only disarm if a RACE is not the thing that armed it — a build during a
    // live race must not clear the race's own flag.
    try { if (!raceArmedSentinel()) PerfGov.sentinelArm(false); } catch (_) { /* as above */ }
  }
}
// Every GPU resource a built track owns (the old world before a rebuild, or a
// stepped build abandoned part-way: loadTrackStepped). Null-safe per handle.
function freeTrackMeshes(t) {
  _dlApi.track = _dlApi.sample = _dlApi.curvature = _dlApi.lineAt = null;   // drivingLineApi's closures pin the world being freed (~10 MB) through the next build
  if (!t || !t.meshes) return;
  Tracks.free(t, gfx);
  if (typeof PitSigns !== "undefined") PitSigns.free(gfx, t);
}
function _loadTrackBody(idx, def, built, builtPrevId) {
  // Invalidate the sun-shadow snap cache: it's only ever written inside the
  // re-render gate, so a new track whose first snapped cell + sunDir happen to
  // match the old track's last values would keep the PREVIOUS track's shadow
  // silhouette until the camera moved a cell (~16 m).
  shadowPass.reset();
  // Buildings light up for the chosen SESSION time, not the track's default:
  // night/dusk/dawn (or a night-default track in "default") → lit windows. Props
  // are rebuilt when this flips so a day-default circuit raced at night gets a
  // glowing skyline, and a night-default circuit raced by day looks like daytime.
  const sessionDark = sessionDarkFor(def);
  const wantSlots = fieldSize();
  // `built`: a track loadTrackStepped already built (it freed the old world first).
  if (built || builtTrackId !== def.id || builtTrackNight !== sessionDark || builtGridSlots !== wantSlots) {
    freeTrackMeshes(track);
    // Drop the old track object BEFORE building the new one: the build's
    // transient peak (plain-JS geometry arrays for up to ~5 M verts) is the
    // moment a near-limit phone gets jetsam-killed, and holding the previous
    // track's terrainGeo/_lights/mesh handles through it stacks old + new
    // resident at once. loadTrack is synchronous, so nothing can observe the
    // null between here and the assignment below.
    const prevTrackId = built ? builtPrevId : builtTrackId;   // read before the reset below: sameCircuit compares against it
    track = null; builtTrackId = null;   // a build that throws must not leave the old id claiming a freed world
    if (typeof LampBake !== "undefined") LampBake.reset();   // its cache holds the old track + atlas too
    // Pass the active backend so tracks.js builds its meshes through the façade
    // (opts.gfx) instead of reaching the GLX global directly. On the explicit
    // or fallback WebGL2 path gfx===GLX; on TLX/WGX it is that backend
    // (descriptor-copied onto GLX, so object identity is preserved either way).
    track = built || Tracks.build(def, trackBuildOpts(sessionDark, wantSlots));
    // Rapier debris side-world: register the circuit's near-apex clippable cones
    // (A3). Cheap pure derivation from track.def.turns; stores the list even when
    // the side-world is disabled/loading so it's ready once rapier is live.
    DebrisWorld.registerFurniture(track);
    const sameCircuit = prevTrackId === def.id;   // a day<->dark rebuild of the SAME circuit
    builtTrackId = def.id;
    builtTrackNight = sessionDark;
    builtGridSlots = wantSlots;
    aeroZ.build();              // fixed ACTIVATION ZONES for this circuit
    // Env probe still holds the previous circuit — fall back to the analytic
    // sky until a fresh 6-face cycle has captured the new one.
    if (gfx.envProbeReset) gfx.envProbeReset();
    _envHold = false; _envFace = -1; _envLatchTod = null;
    _envLatch.fill(NaN); _envLatch[7] = -1;
    // Only a NEW circuit re-keys the ghost. A tuner TIME preview flipping
    // day<->dark rebuilds the same one, and re-keying there dropped the lap
    // being recorded and filed later PBs under the context-less slot instead
    // of the Time Trial session's own (bug hunt 2026-09-22).
    if (!sameCircuit) Ghost.setTrack(def.id);
    hud.invalidateMap();        // force minimap redraw for new track
  }
  const pal = def.palette;
  frame = {
    viewProj: M4.ident(), eye: camEye,
    sunDir: V3.norm(pal.sunDir), sunColor: pal.sunColor,
    // COPIES: the lightning block writes these in place, and in the menu's
    // flyby warm frames (before applyRaceSettings swaps them) that wrote the
    // last race's ambient into def.palette — Tracks.LIST's, for the session.
    ambientGround: pal.ambientGround.slice(), ambientSky: pal.ambientSky.slice(),
    fogColor: pal.fog, fogDensity: pal.fogDensity,
    skyZenith:  pal.zenith,
    skyHorizon: pal.horizon,
    // exposure: applyRaceSettings() is its ONLY writer and runs at startRace(), so the
    // MENU FLYBY had none — po.exposure went NaN, blacking it out (meanLum 1.06/255).
    fogHeight:  pal.fogHeight != null ? pal.fogHeight : 0.018, exposure: 1,
  };
  const skyNight = raceTimeOfDay === "night" ||
    (raceTimeOfDay === "default" && def.night);
  frameSky = {
    invViewProj: M4.ident(), zenith: pal.zenith, horizon: pal.horizon,
    // The SESSION's night, not the circuit's authored default. applyRaceSettings
    // computes the same isNightSession and overwrites both — but it runs at
    // startRace(), and the MENU FLYBY never calls it (same gap as the exposure
    // note above), so previewing a night-def circuit with TIME OF DAY set to day
    // gave the flyby a full night sky: uStars is also the sky shader's NIGHT
    // GATE (nightSky in shaders/glsl-sky.js), which zeroes the day/twilight enrichments wholesale.
    sunDir: frame.sunDir, sunColor: pal.sun, stars: skyNight ? 1 : 0,
    // procedural cloud coverage 0..1 (night skies stay clearer to show stars)
    cloud: pal.cloud !== undefined ? pal.cloud : (skyNight ? 0.22 : 0.4),
  };
}

// Set by the flyby sequencer on a shot boundary; consumed by the camera damping
// one block later, which would otherwise smear the cut (see there).
let camSnapNext = false;
/** The loading screen's flyby progress, 0..1, or 0 when it is not running.
 *  Hidden picker warm-up frames (scheduleFlybyTrack, `_menuGate.warm`) used to
 *  sit on shot 0 so they were not arbitrary. Shot 0 is now the horizon-levelled
 *  `wide` establishing look (FlybySeq.level): those two presents no longer
 *  walk the road/prop batches the warm exists to compile. Use turn-first. */
function flybyProgress() {
  const p = (loadingScreen && loadingScreen.progress) ? loadingScreen.progress() : 0;
  if (loadingScreen && loadingScreen.active && loadingScreen.active()) return p;
  if (state === "menu" && _menuGate.warm > 0 && typeof FlybySeq !== "undefined" && FlybySeq.warmProgress)
    return FlybySeq.warmProgress(flybyShots);
  return p;
}

// The shot list the FLYBY SHOT EDITOR saved, or null for the shipped sequence.
// Read when a run STARTS, not per frame: solve() runs every frame and a store
// miss parses JSON. flybyPanel owns the reading and the validation (it owns the
// writing); this is the copy the render path is allowed to touch.
let flybyShots = null;
function reloadFlybyShots() {
  try { flybyShots = flybyPanel.loadSaved(); }
  catch (e) { flybyShots = null; Log.warn("game", "flyby shots did not load", e); }
}

// Keep one prepared track, never a cache of whole circuits. A generation
// prevents late scenery downloads (including A -> B -> A) from committing.
// garageWarm/garageReady/garageKey: the setup garage pre-built on race settings
// and the idle title (garagePrewarm, js/garage/prebuild.js), keyed per team/livery.
const _menuGate = { warm: 0, generation: 0, ready: "", track: null, garageWarm: 0, garageReady: false, garageKey: "" };
// The menu finished building THIS selection (circuit, time, weather): only then is
// `track` the world the loading screen may fly, light and grid. A fast tap to RACE!
// before the idle build ran left the OLD circuit in `track`.
// The menu build's identity: circuit, time, weather AND grid size (a team change
// to or from MY TEAM moves the grid slots, which loadTrack rebuilds for).
const menuKey = (idx) => [idx, raceTimeOfDay, raceWeather, fieldSize()].join("|");
const menuWorld = () => !!track && _menuGate.track === track && _menuGate.ready === menuKey(trackIdx);
let flybyBuildTimer = 0;
const MENU_IDLE_MS = 1200;
let _menuInputAt = 0;
for (const ev of ["pointerdown", "keydown"])
  addEventListener(ev, () => { _menuInputAt = performance.now(); }, { capture: true, passive: true });
// Resolves true once the menu has had MENU_IDLE_MS without a tap or key (false
// if the selection moved on meanwhile): the build and the warm frames each hold
// the main thread for seconds, so they wait for the player's hands to stop.
const menuSlice = () => new Promise((r) => setTimeout(r, 32));
async function menuIdle(current) {
  for (;;) {
    const wait = MENU_IDLE_MS - (performance.now() - _menuInputAt);
    if (wait <= 0) return current();
    await new Promise((r) => setTimeout(r, wait));
    if (!current()) return false;
  }
}
// Dark sessions: bake the lamp pools in 8 ms slices now, so RACE!'s sync bake hits the cache (lamp-bake.js prebake).
async function menuLampBake(current) {
  const step = current() && _atmo.prebakeLamps();
  while (step && current() && !step(8)) await new Promise((r) => setTimeout(r, 8));
  return !!step;
}
// AFTER THE BUILD, in this order: car assets; the warm frames (shader compile —
// before anything slow, or a RACE! tap mid-bake met cold shaders and the flyby
// froze on its first frames); the lamp pre-bake and this load's flyby, PLANNED
// here in slices so the loading screen plans nothing; then warm again for the lit
// world. `_menuFly` is the planned list, keyed like the build.
let _menuFly = null;
// THE PROGRAM WARM RUNS HERE, HIDDEN — not first at the lights. TLX compiles
// the race's programs when warm() has been requested and the next present()
// starts (tlx.js startProgramWarm), and it paints nothing until that is done.
// Requested only in startRaceBody, that was the held card AFTER the flyby:
// 17 s under SwiftShader with the world built and the flyby played
// (tools/shot/loading-probe.mjs, 2026-09-28), ~7 s on Metal cold (census
// 243). Requested before the hidden warm frames, the first of them starts it
// while the player is still reading the sheet, and the warm at the lights
// finds its programs built. GLX and WGX have no warm(): nothing to request.
// `_warmKey` is the world (menuKey) the request was for: startRaceBody skips
// its own request when it matches, because with every program already built
// the warm at the lights still walked the race scene's node graphs for 7.5 s
// (SwiftShader) and linked NOTHING — a held card for nothing
// (23 links, all in the menu and the flyby).
let _warmKey = "";
// ONE WARM PER WORLD PER SESSION (`_warmed`; "|lit" is a dark world's second one).
// Its programs stay built, and a repeat links nothing yet holds TLX's presents for
// seconds: on a phone, RACE! on a circuit already raced met it pending, so the
// garage drive-out waited behind the card and the flyby played instead.
const _warmed = new Set();
const warmPrograms = (tag = "") => { try { if (gfx.warm) { const k = menuKey(trackIdx); _warmKey = k; if (!_warmed.has(k + tag)) { _warmed.add(k + tag); gfx.warm(); return true; } } } catch (_) { /* optimisation only */ } return false; };
async function menuFinish(current, key) {
  await prepareMenuCarAssets(current);
  if (!current()) return;
  if (await menuIdle(current)) { warmPrograms(); FlybySeq.reset(); _menuGate.warm = 2; }   // reset: a new world's shot 0 snaps, never glides in from the last one
  const lit = await menuLampBake(current);
  if (!current()) return;   // a RACE! tap or a new selection owns the sequencer now
  FlybySeq.setDuration(loadingScreen.nextFlyMs());
  const fly = { key, track, shots: FlybySeq.vary(FlybySeq.DEFAULT, (Date.now() ^ (trackIdx * 2654435761)) >>> 0, false) }, step = FlybySeq.planSteps(track, fly.shots);
  let yielded = false;
  for (let slice = 0; current();) {
    const at = performance.now(), done = step();
    slice += performance.now() - at;
    if (done) break;
    if (slice >= 3) { await menuSlice(); slice = 0; yielded = true; }
  }
  // Even cheap plans give the world's queued warm a render opportunity before garage prewarm.
  if (!yielded && current() && _menuGate.warm > 0) await menuSlice();
  if (current()) _menuFly = fly;
  if (lit && await menuIdle(current)) { warmPrograms("|lit"); FlybySeq.reset(); _menuGate.warm = 2; }   // only a baked (dark) world changed the shaders
}
// THE GARAGE, PRE-BUILT ON RACE SETTINGS AND THE IDLE TITLE. RACE! opens on the
// garage drive-out and GARAGE on the garage, and an undrawn garage's first frame
// built the room and the car and compiled their programs, synchronously —
// measured 1.3-1.8 s of frozen screen under SwiftShader at the tap. Once the
// circuit is done and the menu is idle: car, room, then two hidden garage frames
// after one program-warm request (GaragePrebuild.create below; its title poll
// covers a title with no circuit build).
async function garagePrewarm(current) { await garagePre.run(current, $("race-settings").hidden ? "title" : "settings"); }
function scheduleFlybyTrack(settle) {
  clearTimeout(flybyBuildTimer);
  const generation = ++_menuGate.generation;
  _menuGate.warm = 0;
  if (!(trackIdx >= 0)) return;
  // Free a previous circuit immediately unless compilation still owns its scene.
  // The stepped loader releases it after that warm settles.
  if (!(gfx.warming && gfx.warming()) && state === "menu" && track && Tracks.LIST[trackIdx] && builtTrackId !== Tracks.LIST[trackIdx].id) dropTrackWorld();
  const want = trackIdx, tod = raceTimeOfDay, weather = raceWeather;
  const key = menuKey(want);
  const current = () => generation === _menuGate.generation && state === "menu" &&
    !setupPreviewOn && trackIdx === want && raceTimeOfDay === tod && raceWeather === weather &&
    (!els.select.hidden || !$("race-settings").hidden || (uiExperience && uiExperience.wantsTrack()));
  const prepare = async () => {
    if (!current()) return;
    try {
      // Download independently of the old world's compilation; only replacing
      // its scene/targets must wait. ensureScenery shares in-flight requests.
      await ensureScenery(want);
      if (!current()) return;
      if (gfx.warming && gfx.warming()) { flybyBuildTimer = setTimeout(prepare, 100); return; }
      // Car assets BEFORE the warm frames: prepareMenuCarAssets slices the
      // mesh/livery work; a warm frame drawn first
      // minted and uploaded all ~22 atlases in one 3-4 s task.
      if (_menuGate.ready === key && _menuGate.track === track) {
        await menuFinish(current, key); await garagePrewarm(current); return;
      }
      // AT ONCE, NOT AFTER MENU_IDLE_MS: the build is stepped (~8 ms a frame), so a
      // tap on the picker or RACE SETTINGS is answered mid-build, and RACE! finds the
      // world built sooner. The warms (menuFinish) still wait for idle: they block.
      if (!(await loadTrackStepped(want, current))) return;
      _menuGate.ready = key; _menuGate.track = track;
      // Its own slice, like each car below: the pit-sign atlas is a 1024^2 canvas.
      await menuSlice();
      if (current() && track.meshes && track.meshes.pitSignTex && typeof gfx.uploadTexture === "function")
        gfx.uploadTexture(track.meshes.pitSignTex);
      await menuFinish(current, key);
      await garagePrewarm(current);
    } catch (e) { if (current()) Log.warn("gfx", "track preparation failed", e); }
  };
  // THE SETTLE IS FOR THE SCENERY FETCH, NOT THE BUILD. The build is stepped,
  // so it starts at once; the blocking warms wait for MENU_IDLE_MS of quiet
  // (menuFinish -> menuIdle), off a player still tapping. A longer settle
  // (1.5 s) only delays the download and everything queued behind it, so a
  // RACE! tap soon after the picker meets the build card. 400 ms: a tile
  // browsed past in under half a second still fetches nothing.
  flybyBuildTimer = setTimeout(prepare, settle ? 400 : 120);
}

// Night ambient band: floor/cap the (up-facing-dominant) hemisphere ambient into
// a moody-night range, then hue it toward the city glow. Applied for BOTH the
// default-night path AND explicit setTimeOfDay("night"); applied only on the
// default branch, explicit-night renders ~5× darker with no neon cast than the
// same track at default-night (they even share a tuner profile).
// Mutates frame.ambientSky/Ground (already fresh arrays by call time).
function _nightAmbientBand() {
  if (!frame.ambientSky || !frame.ambientGround) return;
  const _neonAmb = track && track.def &&
    (track.def.theme === "street_night" || track.def.theme === "modern");
  // NIGHT AMBIENT knob scales the floor AND cap band directly — the "how dark is
  // night" master. 0 crushes the band to black (only lamps/neon read), 1 = as
  // shipped, >1 lifts the whole night. Applied to floor+cap together so the clamp
  // window slides as one.
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
    // SKYGLOW ON AMBIENT knob scales the shipped tint deviation (def 0.28): the
    // dominant glow channel is boosted, the others cut, so the night ambient picks
    // up the city's neon/sodium hue. _cgMix 1 = as-shipped, 0 = neutral ambient.
    const _cgMix = (LT.cityGlowTint != null ? LT.cityGlowTint : 0.28) / 0.28;
    frame.ambientSky    = frame.ambientSky.map((v, i) => v * (1 + _cgMix * (0.82 + 0.28 * _cgA[i] / _cgm - 1)));
    frame.ambientGround = frame.ambientGround.map((v, i) => v * (1 + _cgMix * (0.82 + 0.28 * _cgA[i] / _cgm - 1)));
  }
}

// Lamps (street posts + flood banks, one list) fire at night/dusk/dawn, plus a
// night-default track in default mode. Shared by applyRaceSettings (pre-build)
// and the render loop (per-frame) so the two can't drift out of sync.
function isFloodActiveSession() {
  return raceTimeOfDay === "night" || raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn" ||
    (raceTimeOfDay === "default" && track && track.def && track.def.night);
}

// ---------- race flow ----------
// applyRaceSettings() (session lighting/weather/time-of-day) and the
// per-track atmosphere bias live in js/lighting/atmosphere.js
// (Atmosphere.create(G) — wired after the G façade below).

// Snap the live camera straight to the current mode's vantage (no damping), so
// the first rendered frame is already framed correctly. Without this the camera
// damps out of whatever stale eye/target/fov the previous screen (menu flyby)
// left behind — and for the onboard cams the slow target/fov damping (λ7/λ4)
// takes a second-plus to converge, during which a broken projection renders the
// cockpit bodywork as a black box across the frame at the start ("clips until I
// throttle past the start"). Shared by startRace() and __apex.snapCam().
function snapGameCam(paint) {
  if (!player || !track) return;
  const bankCam = Tracks.banking(track, player.s, player.x, _bankScratch, true);  // smooth lift: match render()
  const mode = CAM_MODES[camMode].id;
  if (typeof ExtraRigs !== "undefined") ExtraRigs.reset(mode);
  // A snap is a CUT: no chase hang, speed-FOV kick, glance or latched look-back carries over.
  if (typeof CamFeel !== "undefined") { CamFeel.resetFollow(); CamFeel.resetFreeLook(); CamFeel.resetLatch(); } GameCams.resetSmoothing();
  const v = camVantage(mode, player.s, player.x, player.speed || 0, 0, {
    bankDy: bankCam ? bankCam.dy : 0, deploy: player.deploying, slipLat: player.vLat || 0, att: player,
    // Same car pose the live rig uses. Without it snapCam() silently fell back to
    // the road-frame framing, so the snapped view disagreed with the live one —
    // which the comment above says they must not do.
    carPos: player.px != null ? [player.px, player.pz] : null,
    carHead: player.head || 0,
    rival: (typeof ExtraRigs !== "undefined") ? ExtraRigs.pickRival(cars, player) : null,
    playerProg: player.prog || 0,
    snap: true, reduceMotion: camComfort(),
  });
  camEye[0] = v.eye[0]; camEye[1] = v.eye[1]; camEye[2] = v.eye[2];
  camTgt[0] = v.tgt[0]; camTgt[1] = v.tgt[1]; camTgt[2] = v.tgt[2];
  camFov = v.fov;
  camRoll = bankCam ? -bankCam.roll * cameraBankScale(mode) : 0;
  // Re-anchor too: render() damps the eye and target in the CAR's frame, from last frame's
  // anchor to this one. A car that was just moved (a mid-race JUMP IN drops it half a lap
  // from the grid) would otherwise carry the grid's look OFFSET across, so the cockpit
  // opened facing the way the grid faced and swung round over the next half second.
  camAncX = null;
  try { if (gfx && gfx.invalidateSoftPresent) gfx.invalidateSoftPresent(); if (paint) { headlessMode = false; render(paint === true ? 1 / 60 : Math.min(+paint || 1 / 60, 1 / 20)); } } catch (_) { /* GLX */ }
}

// Races started this session. It is the round number a one-off Grand Prix hashes
// its retirements on: without it every GP drawn off the same sim seed would lose
// the same two cars forever, because the reliability draw deliberately consumes
// nothing from the stream that would otherwise have moved on. Starting from zero
// on every load is what keeps a seeded run reproducible across reloads.
let raceIndex = 0;
// Draw the field's retirements for the race about to start (or the round about to
// be simulated). The seed is the CAREER's inside a career and the SIM seed
// outside one — the two places a run's reproducibility is already anchored.
// Nothing here draws from simRnd: see js/race/reliability.js.
// (seed, round, driver) luck: the career's per-season seed, a standalone Season's own (SeasonCal.luckSeed: a reload cannot re-roll it), else the session's.
const luckSeed = () => (Career.inCareer() ? Career.seasonSeed() : flow === "season" && season ? SeasonCal.luckSeed(season, simSeed()) : simSeed());
function armReliability(field) {
  const team = player ? player.team : Teams.LIST[teamIdx];
  Reliability.arm(field, {
    level: raceReliability,
    seed: luckSeed(),   // per season, not per career
    // drawRound(), not season.round: arm() hashes (seed, round, driver) and the
    // two legs of a sprint weekend share a round, so both would retire the same
    // cars. Career and no-sprint seasons get season.round back unchanged.
    round: isChampionship() ? SeasonCal.drawRound(season) : raceIndex,
    // The player's own build is the R&D economy's grip on this: an AI runs its
    // team's works car, which `tier` already says everything about.
    build: Reliability.buildQuality(getTeamParts(team.id), team),
    // In a friend race each peer arms the whole field but knows only its OWN
    // build, so build relief must be OFF or the two peers draw split thresholds
    // off the same shared hash and disagree on who retires.
    networked: !!(netPlay && netPlay.active && netPlay.active()),
  });
  return field;
}

// Put the player on the LINE, AT REST. The FALLBACK only: qualifying is a
// rolling start (js/race/flying-start.js), and js/race/quali-model.js models a
// flying lap to match. This runs when that start was declined. Written in TRACK
// coordinates and pushed back out through worldFromTrack, as rescuePlayer() does.
function launchFlyingLap() {
  if (!player || !track) return;
  // Just BEHIND the line, not on the P1 box (~14 m back): the timed lap begins
  // at the crossing, so any run-up is an untimed launch the model's
  // STANDING_LOSS never charged. _prevS seeded so the crossing fires from rest.
  player.s = wrapS(-0.3); player._prevS = player.s; player.prog = -0.3;
  player.x = 0;                       // on the line, not on the grid slot
  player.xVis = 0;
  const w = worldFromTrack(player.s, player.x, smp);   // also fills smp for head, below
  player.px = w.x; player.pz = w.z;
  player.head = Math.atan2(smp.t[0], smp.t[2]);
  player.speed = 0;               // standing start, like the real thing
  player.vLat = 0; player.yawRateCur = 0; player.yawVis = 0; player.steerVis = 0;
  // Seed the render-interpolation anchors, or the first frame smears the car
  // across the track from wherever the grid slot was.
  player.rPrevPx = player.px; player.rPrevPz = player.pz;
  player.rPrevS = player.s; player.rPrevX = player.x;
  player.rPrevHead = player.head; player.rPrevYawVis = 0;
  announce("QUALIFYING LAP", 1.6, "info");
}

const raceWakeLock = RaceWakeLock.create();
const { hold: holdRaceWake, drop: dropRaceWake } = raceWakeLock;

// ASYNC only to await ensureScenery() — see the LAZY_SCENERY note above. Every
// caller is a click handler that ignores the result and makes startRace() its
// last statement, and the specs already poll `__apex.info().track != null`
// rather than assuming race() returns built, so nothing downstream changes.
// Race-entry stopwatch + longtask ring: js/perf/race-entry-profile.js
// (PERF-OPTIONS-2026-09-16.md — build is ~23 % of the freeze; attribute the rest).
function raceProfile() { return RaceEntryProfile.legs(); }
// DEFECT-LEDGER's un-awaited-startRace family: six fire-and-forget callers
// (closeQualiToGrid, q-drive, pm-restart, the season/quali continue button,
// RaceSettings' RACE! route, DailyChallenge.open) never awaited this, so a double-click or a second
// trigger while a start was still in flight could re-enter it mid-build. The
// startRace() wrapper below latches concurrent calls onto the one in-flight
// promise instead of starting a second race build on top of the first.
async function startRaceBody() {
  // arguments[0] is SessionEntry's `current` (not a parameter: tests slice this declaration by its exact text). It drops on
  // quitToMenu() or a newer start; a stale body must neither commit a race nor quit over the newer one.
  const rlap = (n) => RaceEntryProfile.lap(n), stale = () => !!arguments[0] && !arguments[0]();
  // Plate already raised in startRace() / raceIntroFromSheet. Yield BEFORE
  // ensureAudio / resets so #loading can paint (TopModal's MutationObserver
  // close and the first frame) instead of sitting under a frozen dialog for
  // the whole LAZY_AUDIO + scenery task. game-vm has no frame pump.
  // https://developer.chrome.com/blog/use-scheduler-yield
  const vmNoFramePump = typeof navigator !== "undefined" && /apex-game-vm/.test(navigator.userAgent || "");
  const yieldMain = () => (typeof scheduler !== "undefined" && scheduler.yield)
    ? scheduler.yield() : new Promise((r) => setTimeout(r, 0));
  if (!vmNoFramePump) {
    if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.mark) RaceEntryProfile.mark("body:yield");
    await yieldMain();
  }
  if (stale()) return false; if (isCareer()) Career.markWeekendStarted();   // quali or the race is under way: the round's brief is locked
  rlap("scenery");
  const sessionOk = await ensureRaceSession(); if (stale()) return false;   // LAZY_RACE_SESSION — pit/radio/reliability before grid/pits + AudioPanel
  if (!sessionOk) { loadingScreen.stop(); quitToMenu(); announce("RACE MODULES FAILED TO LOAD — RETRY", 3, "info"); return false; }   // the stubs have no retirements or pit stops, and TT data would be lost silently
  await ensureAudio(); if (stale()) return false;   // LAZY_AUDIO — stub until first race/gesture; real engine before startEngine (false = silent race; the loader logged it)
  radioVoice.prepare();   // the recorded voices download over the loading screen, not under the first line
  // Completed seasons are readable, never raceable (also guarded by award()).
  const careerSaveConflict = isCareer() && Career.conflicted();
  const seasonSaveConflict = flow === "season" && SeasonCal.conflicted();
  if ((flow === "season" && !SeasonCal.canRace(season)) || careerSaveConflict || seasonSaveConflict) {
    // THE LOADING SCREEN IS STILL UP: only clearMenuScreens() (past this
    // return) and quitToMenu() lower it, so this arm left the menu behind a
    // z-36 pointer-events:auto scrim with an inert skip handler — reload only.
    loadingScreen.stop();
    // A conflict can surface on RESTART or the next round, with the race HUD,
    // in-race class and engine still up: tear all of it down to the title.
    if (careerSaveConflict || seasonSaveConflict) {
      quitToMenu();
      announce("SAVE CONFLICT — reload " + (careerSaveConflict ? "career" : "season"), 3, "info");
      return false;
    }
    setState("menu", "save-conflict"); $("race-settings").hidden = true;
    buildSelect(); els.select.hidden = false;
    return false;
  }
  resultsCam.reset();   // restore a montage before replacing the previous field
  // Drop ownership of the previous race's car indexes before makeCars replaces them.
  IncidentSim.reset();
  raceCtl.reset();   // and the caution machine — no stale flag/capHoldT into this race
  // Restore the CHIP's pick before re-arming — pm-restart re-enters startRace
  // from inside a running race, so a half-walked arc would otherwise become
  // the new race's starting weather AND get written back as the player's
  // standing choice. NOT endChangeable(): that also drops wxArcPlan, and a
  // host's plan for THIS race is set before startRace runs.
  wxArc.restoreBase();   // a leaked arc must not become this race's weather (startChangeable re-arms below)
  // …and the debris side-world. prime() below only REBUILDS when the track or
  // car count changed, so a restart on the same circuit kept last race's
  // shards, marbles and knocked-over cones — visible on the grid, and
  // RaceControl can fly a caution for debris nobody produced this race.
  DebrisWorld.reset();
  // …and the broadcast layer: queued cards ("RETIREMENT", "BOX BOX") and the
  // results commentary were cleared only by quitToMenu, so RESTART and NEXT
  // RACE played the last race's over this one's countdown.
  announceT = 0; _annPri = 0; _annFloor = 0; _annQueue.length = 0; els.announce.hidden = true;
  if (announcer.stop) announcer.stop();
  if (hud.resetRace) hud.resetRace();
  rlap("resets");
  // Pace the rebuild: sync loadTrack + warmCarAssets was one ≤3 s long task
  // (RaceEntryProfile 2026-10-05: loadTrack 1273 ms, warmCarAssets 1187 ms).
  // Already-built worlds short-circuit inside loadTrackStepped → loadTrack.
  // live() stays true: this session owns the build (menu prep uses a generation gate).
  // live() also drops on ctxLost so a CONTEXT_LOST mid-step does not wait forever.
  if (vmNoFramePump) loadTrack(trackIdx);
  else if (!(await loadTrackStepped(trackIdx, () => !gfxContextLost())) && !stale()) { loadingScreen.stop(); quitToMenu(); return false; }
  if (stale()) return false; rlap("loadTrack");
  // Break the remaining sync legs (settings → car meshes) into separate tasks.
  // Skip in game-vm: its setTimeout queue is only flushed by hand, not by settle().
  if (!vmNoFramePump) await yieldMain(); if (stale()) return false;
  if (gfxContextLost()) { loadingScreen.stop(); quitToMenu(); return false; }
  // PRACTICE IS PER-SESSION. Armed from the pause menu inside one session, it
  // must never survive into the next — a race that silently did not count
  // because the last one was practice is the worst possible failure here. A
  // Time Trial needs no flag: isPractice() derives it.
  // duelMode is NOT cleared: it is a race SETTING like difficulty or tyre wear,
  // chosen on the settings sheet and meant to stick until the player changes it.
  practiceMode = false;
  makeCars(); rlap("makeCars");
  coach.reset(); PerfGov.resetFrameStats();
  // Qualifying keeps the full field for simulation, then drives one flying lap.
  if (isQuali()) {
    qualiField = cars;
    cars = [player];
    lapsTarget = 1;
  } else if (duelOn()) {
    // ONE RIVAL, BUMPED — the same trim Quali and Time Trial do on either side
    // of this branch. js/race/duel.js owns what the format means.
    const rival = Duel.pick(cars);
    if (rival) {
      const lg = (duelLegend && typeof Legends !== "undefined") ? Legends.byId(duelLegend) : null;
      if (lg) Duel.asLegend(rival, { id: lg.id, name: lg.name, code: lg.code, ratings: Legends.ratings(lg.id), team: Legends.raceTeam(lg.id) }, DriverRatings);
      else Duel.bump(rival, DriverRatings);
      cars = [player, rival];
    }
    lapsTarget = raceLaps;
  } else if (isTimeTrial()) {
    cars = [player];          // solo against the clock — no AI on track
    lapsTarget = raceLaps;
    ttNewRecord = false;
    ttLaps = [];
    ttSessionTs = Date.now();
  } else {
    // raceLaps stays the one source of truth for distance; lapsFor() only ever
    // DIVIDES it, and only on the sprint leg of a sprint weekend.
    lapsTarget = SeasonCal.lapsFor(raceLaps, season);
  }
  applyRaceSettings();
  rlap("settings");
  if (isWetRoad()) {           // "rain" = storm; "wet" = the DRIZZLE tier —
    initRainDrops();           // initRainDrops seeds sparse/short/slow streaks
    Particles.rainShow(true);  // per the drizzle* TUNE_DEFS. Gating this on
  } else {                     // isRaining() made the whole shipped tier (three
    Particles.rainShow(false); // sliders + rainSeed(drizzle)) unreachable.
  }
  // Same early-return hazard as the completed-season arm above: this one only
  // self-heals because #quali is a <dialog> in the top layer, which draws over
  // the scrim. Lower it anyway rather than rely on that.
  // Awaited so startRace's latch spans the sheet's build; openQuali lands its own failure on the menu.
  if (!isQuali() && gridFromQuali() && !quali.order(cars)) { loadingScreen.stop(); await openQuali(); return false; }
  gridUp(gridOrderFor(gridFromQuali() ? quali.order(cars) : null));
  rlap("gridUp");
  wxArc.startChangeable();
  recomputePlayerMods();
  rlap("finish");
  if (isTimeTrial()) { records.begin(); Ghost.startLap(); /* InputGhost armed in records.begin */ }
  // THE ENVELOPE THIS RACE WILL BE DRIVEN IN, logged once at the green light: the ring is attached to every
  // failing spec, so a pace/parts/weather failure explains itself. Below recomputePlayerMods() so the mods/aeroLoad
  // it reports are this session's (race()/tt() reach here with no garage pass).
  Log.info("game", `race ${track.def.id} ${session} laps=${lapsTarget} ` +
    `pace=${PACE.toFixed(3)} vTop=${vTop().toFixed(1)}m/s ` +
    `grip=${gripMult().toFixed(2)} weather=${raceWeather} tod=${raceTimeOfDay} ` +
    `mods=${playerMods ? `s${playerMods.speed.toFixed(2)}/a${playerMods.accel.toFixed(2)}/` +
      `c${playerMods.cornering.toFixed(2)}/b${playerMods.braking.toFixed(2)}` : "none"} ` +
    `aeroLoad=${(playerAeroLoad ?? 0.5).toFixed(2)} assists=` +
    `help${ROAD_FOLLOW.toFixed(2)}/line${raceLineAssist.toFixed(2)}`);
  // Only a RACE can retire a car. A time trial is you against the clock and
  // qualifying is one flying lap — losing the car to a gearbox there would end
  // the session with nothing to show and no race to have lost it in.
  if (session === "race") { raceIndex++; armReliability(cars); }
  resultT = 0;
  camRoll = 0; camSlipSm = 0;
  shake = 0; hitStop = 0; _thunderT = -1; announce._waitAt = NaN;   // a crash's shake, a queued thunder or the WAITING card's quiet window from the last session must not reach this grid
  // player can be null (roster/team resolution miss) — don't let startRace throw.
  sectorIdx = player ? sectorAt(player.s) : 0; sectorStartT = 0; sectorValid = true;
  // The SPLITS reset here, with the rest of the session — not in loadTrack,
  // whose rebuild gate skips a same-circuit, same-time-of-day rerun and would
  // open session two with session one's bests in the HUD. Session state
  // belongs to the session.
  sectorBests = [Infinity, Infinity, Infinity]; fieldSectorBests = [Infinity, Infinity, Infinity];
  sectorLast = [null, null, null];
  // Arm the crash sentinel (mobile only) and, after a strike, start the
  // session pre-scaled-down — the governor may restore upward, but only under
  // the clear sustained headroom that proves the device can afford it.
  PerfGov.sentinelArm(true);
  if (PerfGov.strikes() > 0 && PerfGov.autoRes() && gfx.setRenderScale && gfx.getRenderScale)
    gfx.setRenderScale(Math.min(gfx.getRenderScale(), PerfGov.strikes() >= 2 ? 0.7 : 0.85));
  setState("count", "race-start"); countT = 0; lightsLit = 0; raceT = 0; startHold = 0; restartPending = false; paused = false; frozen = false; skyViewOverride = null;
  // TLX links programs synchronously on first draw — warm them during the LIGHTS,
  // unless the menu's warm already ran for this world (warmPrograms, _warmKey).
  // Optimisation only; GLX/WGX have no warm and no-op.
  try { RaceEntryProfile.requestWarm(gfx, _warmKey === menuKey(trackIdx)); } catch (_) { /* as above */ }
  skids.reset();
  Particles.clear();   // no stale smoke/spray teleporting into the new session
  // THE PRE-RACE SCREEN OUTLIVES THE SWEEP when it was up: the warm above paints
  // nothing until it is done, so it is raised again, disarmed, and render()
  // lowers it with the first frame the backend presents (LoadingScreen.handoff).
  const handoff = (loadingScreen.active() || loadingScreen.phase() === "build" || loadingScreen.phase() === "busy") && !!player;   // "build"/"busy": startRaceCovered + Start Race cover
  clearMenuScreens(); garagePre.release();  // garage GPU set is not the race's (js/garage/prebuild.js); next idle title rebuilds it
  if (handoff) RaceEntryProfile.raiseHandoff(loadingScreen);
  els.hud.hidden = false; els.lights.hidden = false; els.pausebtn.hidden = false;
  if (els.btnCam) els.btnCam.hidden = false;
  setHudUserHidden(false);   // start every race with the HUD shown (+ resets the toggle label)
  // Hidden during a session: the HUD stays clean and the two switches that
  // matter (MUSIC, SOUND EFFECTS) live in SETTINGS > MUSIC & SOUND. Turning
  // both off is silence, so the master needs no mid-race button of its own —
  // and setMusic/setSfx lift it if it is off, so it can never strand you.
  // (#soundbtn rides #overlay now — see css/overlays.css for why.)
  document.body.classList.add("in-race");
  for (const l of els.lights.children) l.classList.remove("on");
  els.lights.classList.remove("count");   // a jump-in's hand-over count (handoverCount) never outlives its race
  showTouchControls(true);
  dbgCam = null; director.reset(); replayBuf.onRaceStart(cars); if (typeof CamFeel !== "undefined") { CamFeel.resetLatch(); CamFeel.resetFreeLook(); } // fresh race — drop free-cam, TV director, look-back latch; arm solo replay ring
  snapGameCam();              // frame the grid correctly on the very first render
  Input.calibrate();
  // RESUME's latch bug (see Input.clearEdges) at the menu→race seam: edges
  // mashed on the title (navOpen() false) would fire at lights-out.
  Input.clearEdges();
  if (Input.dropLatch) Input.dropLatch();
  if (soundOn) { GameAudio.setVoice(player && player.team && player.team.engine); GameAudio.setVenue(track.def); GameAudio.startEngine(); GameAudio.startMusic(trackIdx); }
  // rain patter — a damp "wet" track is silent — and it must STOP too: a
  // restart after a changeable race had arced into rain kept playing it dry.
  if (soundOn) { if (isRaining()) GameAudio.startRain(); else GameAudio.stopRain(); }
  holdRaceWake(); syncRotateBlocker(true);   // AFTER the audio: on a portrait phone this pauses (stops engine/rain, drops the wake), and setPaused(false) on rotate restarts them
  if (!vmNoFramePump) await yieldMain(); if (stale()) return false;   // do not glue car-mesh warm onto the settings/grid sync stretch
  if (gfxContextLost()) { loadingScreen.stop(); quitToMenu(); return false; }
  RaceEntryProfile.span("warmCarAssets", () => warmCarAssets()); // meshes HERE, not first countdown frame
  RaceEntryProfile.span("debrisPrime", () => { DebrisWorld.prime(); updateHud(true); });

  // Warm the actual rear view at its HUD size while the grid is covered.
  // startRace's promise includes this so multiplayer cannot arm green early.
  const entryPlayer = player;
  if (!headlessMode && !document.hidden)
    await RaceEntryProfile.spanAsync("mirrorPrepare", () => mirrorPass.prepareRace());
  if (stale()) return false; if (gfxContextLost()) { loadingScreen.stop(); quitToMenu(); return false; }
  if (player !== entryPlayer || (state !== "count" && state !== "race")) return false;

  // A flyby timer can land this in a BACKGROUND tab, after the hide handler ran in "menu" state.
  if (document.hidden) setPaused(true, "hidden-tab");
}
const sessionEntry = SessionEntry.create();
const _seasonEntryIds = new WeakMap();
let _nextSeasonEntryId = 0;
function entrySettings() {
  if (season && !_seasonEntryIds.has(season)) _seasonEntryIds.set(season, ++_nextSeasonEntryId);
  return JSON.stringify([trackIdx, flow, session, raceWeather, raceTimeOfDay, raceLaps,
    teamIdx, driverIdx, difficulty, raceGrid, champGrid, duelSetting(), duelLegend, raceTyreWear,
    raceReliability, raceDirtyAir, raceAeroMode, simSeed(),   // not raceIndex: the body bumps it, and a repeat start would read as a new request
    wxArc.changeable, wxArc.plan && [wxArc.plan.to, wxArc.plan.dur],
    netPlay.active(), raceSettings && raceSettings.netRoom,
    season ? _seasonEntryIds.get(season) : null, season && season.round,
    season && season.stage, SeasonCal.quali()]);
}
function startRace() {
  // TopModal mirrors hidden→close via MutationObserver (next task). Sync-close
  // so #loading is not trapped under :modal for the rest of this long task.
  const rs = $("race-settings");
  if (rs) {
    rs.hidden = true;
    try { if (rs.open && typeof rs.close === "function") rs.close(); } catch (_) { /* already closed */ }
  }
  practiceMode = false;   // before loadingInfo() reads it: the body clears it only after several awaits
  if (!loadingScreen.phase()) { loadingScreen.building(loadingInfo()) || loadingScreen.busy("Starting race"); }
  if (photoStudio) photoStudio.close(false); if (uiExperience) uiExperience.stopHome(); if (typeof Assets !== "undefined") Assets.retry();
  const key = entrySettings(), idx = trackIdx;
  const request = RaceEntryProfile.runSession(sessionEntry, key, () => Promise.all([ensureScenery(idx), DebrisWorld.ready()]),
    (current) => startRaceBody(current), () => key === entrySettings(),
    (e) => { if (e) Log.error("game", "startRace failed", e); quitToMenu(); if (e) announce("COULD NOT LOAD CIRCUIT — CHECK CONNECTION", 3, "info"); });
  // Menu buttons fire and forget. Observe rejection on a separate branch so
  // those callers do not raise an unhandledrejection overlay; an awaiting agent
  // still receives the original rejecting promise and its original error.
  request.catch((e) => Log.debug("game", "startRace rejected (handled by onFail): " + (e && e.message || e)));
  return request;
}

function showTouchControls(show) {
  const t = show && Input.touchControlsNeeded();
  const manual = gearsManual();
  // GAS pedal whenever throttle is manual (tilt/button); touch auto-throttle hides it
  els.btnThrottle.hidden = !(t && !autoThrottle());
  els.btnBrake.hidden = !t;
  els.btnBoost.hidden = !t; els.btnOT.hidden = !t;
  // ON AUTO THE AERO BUTTON IS REMOVED, not greyed. The wing drives itself, so
  // the control has no job at all — and a dock of GROUPS can afford to drop it,
  // because the survivors just close ranks. That was not true of the old
  // absolutely-positioned stack, where hiding one button left a hole and every
  // "fix" moved a different control under the player's thumb; it is the reason
  // #pm-calib is disabled rather than hidden. Flex layout is what makes
  // removing the right answer here.
  // NO ZONES (Monaco) is deliberately NOT the same case: there the control still
  // exists, it is this CIRCUIT that cannot use it, and the struck-through
  // NO AERO ZONE chip beside a faded button says so. Removing it would silently
  // suggest the game has no such feature.
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

// Fill the two thumb docks. This is the one thing the flex bar cannot express
// on its own: a control genuinely changes SIDE between modes (pedals are
// left-thumb in tilt AUTO, right-thumb in tilt MANUAL and in buttons) and CSS
// cannot move an element to a different parent — everything else (spacing,
// wrapping, centring) is the flex row's job.
//
// It moves GROUPS, never single buttons: a dock holding loose buttons breaks
// them apart wherever the width runs out (how a DN button once ended up above
// its own UP). A group is indivisible and carries its own shape (pedals and
// shifts are vertical pairs, steer and taps are rows), so wrapping can only
// reorder whole groups.
//
// Lists are in VISUAL left-to-right order (DOM order for a normal flex row).
// Each thumb's home is the screen edge it sits at, so what is held
// continuously goes OUTERMOST and the discretionary taps sit inboard of it.
function layoutDocks(steerBtns, manual) {
  const left = $("dock-left"), right = $("dock-right");
  if (!left || !right) return;
  const pedals = $("grp-pedals"), shifts = $("grp-shifts"),
        steer = $("grp-steer"), taps = $("grp-taps");
  const L = [], R = [];
  if (steerBtns) {
    L.push(steer);                                // arrows own the left thumb
    R.push(taps, pedals);                         // pedals stay right
  } else if (manual) {
    L.push(shifts, taps); R.push(pedals);         // tilt+manual: gears L, pedals R
  } else {
    L.push(pedals); R.push(taps);                 // auto tilt/touch: pedals left
  }
  // An empty group must not hold a gap in the dock. Hiding it is the whole
  // reason `hidden` on every child is not enough: a flex parent of hidden
  // children is still a flex item with the dock's own gap around it.
  for (const g of [pedals, shifts, steer, taps]) {
    if (!g) continue;
    g.hidden = !(L.includes(g) || R.includes(g)) ||
               ![...g.children].some((b) => !b.hidden);
  }
  for (const [dock, list] of [[left, L], [right, R]]) {
    // Append unconditionally: it both moves a group that changed side and
    // rewrites the order, so a mode switch can never leave yesterday's sequence
    // half-applied.
    for (const el of list) if (el) dock.appendChild(el);
  }
}

// THE CLASSIFICATION IS THE HOST'S. Both peers can see both human cars, but
// only the host sees every AI finish first-hand, and two independently-sorted
// orders disagree exactly when it matters — a close finish. Early returns so
// every "keep our own order" reason is one visible line rather than a nest.
function netOrder(order) {
  if (!netPlay.active()) return order;
  if (netPlay.ownsClassification()) {
    // Keyed by driverId, NOT by cars.indexOf: indices are NOT stable across
    // peers — makeCars() drops the custom team unless the local player selected
    // it, so the two grids differ in length and order, and a guest would re-read
    // the host's indices against its own array. A close
    // finish is exactly when that matters and exactly when nobody would notice
    // it had gone wrong.
    netPlay.reportResult(order.map((c) => ({
      // `r`: the DNF reason (0 = not retired) — each peer draws its reliability
      // plan off its own seed, so a guest's labels must be the host's verdict.
      d: c.driverId, t: c.finishT, p: c.penalty, lap: c.lap, classified: c.classified, r: c.retired ? (c.dnf || "dnf") : c.dsq ? "DSQ — " + c.dsq : 0,
    })));
    return order;
  }
  const verdict = netPlay.peerResult();
  // Array.isArray, not just a truthy .length: this is the HOST's payload off
  // the wire, and `{length:1}` passes a length test then throws on .map —
  // straight into index.html's error overlay, which eats the classification
  // the guest is waiting on.
  if (!Array.isArray(verdict) || !verdict.length) return order;   // never arrived
  const byId = new Map(cars.map((c) => [c.driverId, c]));
  // …and each ELEMENT, not only the container. The Array.isArray note above is
  // about the payload's shape; `[null]` and `[{}]` both pass it and then throw
  // on e.d — into the same error overlay, eating the same classification.
  // Validate the complete bijection and timing fields BEFORE changing any car.
  // A duplicated id passes a length check and would draw the same car twice,
  // omitting another; a malformed late row could partially mutate times.
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

function endRace(forcedOrder) {
  Ghost.flush(); if (typeof InputGhost !== "undefined") InputGhost.flush();
  if (replayBuf.isScrubbing()) return; // scrub: no career settle / results
  try { sessionStorage.removeItem("apex26.ctxLostReloads"); } catch (_) { /* a clean race: the context-loss budget counts CONSECUTIVE losses, not the tab's lifetime */ }   // off-race: write a pending lap-record ghost now (js/car/ghost.js)
  PerfGov.cleanRace();   // finished cleanly — disarm + pay a crash strike down
  // raceCtl.update's own not-in-race reset is unreachable (update() only calls
  // it in state "race"), so without this a flying flag survives into results
  // for anything reading raceCtl.info()/level between races.
  const suspended = raceCtl.level === 4;   // ended under a red flag, never resumed: B6.3.6's 30 s, not a DSQ
  // Judged on the weather AT THE FLAG: endSession() below puts the starting weather back, and a MIXED race that
  // turned wet then disqualified every car on one slick for "one dry compound" (B6.3.6 is off in a wet race).
  const cmpApplies = pits.twoCompoundApplies();
  raceCtl.reset(); wxArc.endSession();   // an arc that outlives the race would override the next race's weather
  // Close every car's open stint so the results strip has an end lap. Done here
  // rather than in the sheet: a retired car stopped laps ago and its last stint
  // must end where the CAR did, not where the leader is when the flag falls.
  cars.forEach((c) => tyres.closeStints(c));
  // The flag can fall while the player is PAUSED — a networked guest is ended
  // by the host's RESULT, not by their own input. Leaving `paused` set stranded
  // the pause dialog on top of the results with a RESUME that resolves to
  // nothing, because resuming is only reachable from state "race".
  paused = false; els.pausemenu.hidden = true;
  setState("results", isQuali() ? "quali-end" : forcedOrder ? "forced-order" : "flag");
  document.body.classList.remove("in-race");
  dropRaceWake();
  els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  GameAudio.stopMusic();   // the race loop must not play under the results sheet
  // quitToMenu hides the rain field; endRace must too — otherwise it keeps
  // drawing into every frame behind the results sheet (audio alone stopped).
  // Particles.rainActive() is the seed gate, not the audio flag.
  Particles.rainShow(false);
  if (soundOn) GameAudio.finish();
  // Qualifying ends in its own sheet: the player's flying lap is measured
  // against the simulated field and becomes the grid. Mirrors the TT return
  // below — first branch out, before any race classification is built.
  if (isQuali()) {
    cars = qualiField || cars;
    const myLap = player.lastLap > 0 ? player.lastLap : (player.best < Infinity ? player.best : 0);
    // Tell the other player what we set BEFORE building the sheet: their side
    // needs it to draw the same classification ours will.
    if (myLap > 0) qualiNet.reportQuali(player.driverId, myLap);
    // Infinity = drove, but every lap was deleted: NO TIME, the back of the grid.
    quali.simulate(qualiNet.driven(myLap > 0 ? myLap : player.qualiCut ? Infinity : 0));
    if (!(myLap > 0)) reportModelQuali();   // no valid lap: the rival still needs OUR time, or their sheet waits forever
    $("quali").classList.add("q-done");   // the session is run: only TO THE GRID now
    qualiSheet.open(quali.rows());
    qualiNet.refreshQualiGate();
    return;
  }
  if (isTimeTrial()) { buildTTResults(); els.results.hidden = false; return; }
  careerSettlement = null;   // whatever the last career round paid is not this race's news
  // The only human RETIRED and the race ended early (RaceControl.finishDelay
  // counts a retired human as done). Every AI whose reliability failure was
  // already drawn would have met it before the flag, so it retires now rather
  // than scoring from a mid-race snapshot. Solo only: a networked field is the
  // host's classification.
  if (!netPlay.active() && !cars.some((c) => c.human && c.finished)) {
    for (const c of cars) {
      if (c.human || c.finished || c.retired || c.dnfAt == null) continue;
      c.retired = true; c.dnf = c.dnfWhy || "mechanical"; c.dnfAt = null;
    }
  }
  // classification: finished by time(+penalty), still running by progress, and
  // RETIREMENTS below both — ordered among themselves by how far they got, which
  // is the only thing that separates two cars that never saw the flag.
  // TWO DRY COMPOUNDS (FIA 2026 SR B6.3.6), every car: a finished Grand Prix the
  // rule covers (PitLane.twoCompoundApplies — the AI planner's own test). Not in
  // a room: a remote car's compound is not replicated.
  const cmpOn = !netPlay.active() && !isPractice() && !duelOn() && cars.some((c) => c.finished && !c.retired) && cmpApplies;
  // WATCH uses the published classification, not the simulated tyre log.
  const dsq = realRace.status().watch ? cars.filter((c) => c.dsq) : SportingRegs.applyCompoundRule(cars, { applies: cmpOn, suspended });
  for (const c of dsq) Log.info("game", "DSQ car=" + c.code + " why=" + c.dsq);   // B6.3.6: a suspended race pays +30 s instead, carried in c.penalty
  const fin = cars.filter((c) => c.finished && !c.retired && !c.dsq).sort(RaceControl.finishOrder);   // laps, then the clock
  // A running car's time penalty is served on the road: its seconds, at the
  // race's average speed, come off its progress (RaceControl.runOrder).
  const run = cars.filter((c) => !c.finished && !c.retired && !c.dsq);
  const leadProg = Math.max(0, ...fin.concat(run).map((c) => c.prog || 0));
  run.sort(RaceControl.runOrder(Math.max(0.25 * vTop(), leadProg / Math.max(1, raceT))));
  const out = cars.filter((c) => c.retired).sort((a, b) => b.prog - a.prog);
  // LAPS FIRST, then the 90 % line for every car, running or retired (RaceControl.classify).
  // THE CLASSIFICATION IS THE HOST'S — see netOrder().
  const order = netOrder(forcedOrder || RaceControl.classify(cars, fin, run, out).concat(dsq));   // DSQ: last, no points
  order.forEach((c, i) => { c.finPos = i + 1; });
  Log.info("game", "Race finished track=" + (track && track.def.id) + " session=" + session + " laps=" + lapsTarget + " pos=" + (player ? player.finPos : "-") + " time=" + (player && player.finished ? (+player.finishT).toFixed(3) : "-") + " pen=" + ((player && player.penalty) || 0) + "s" + (player && player.dsq ? " dsq=" + player.dsq : "") + " retired=" + out.length + " dsqs=" + dsq.length + (suspended ? " suspended" : ""));
  // Read BEFORE award() advances the stage, or the sprint is wrapped up as the Grand Prix.
  const wasSprint = isChampionship() && SeasonCal.stage(season) === "sprint";
  if (isChampionship()) {
    // A standalone season may sprint before the Grand Prix. A career scores
    // through its save owner, which checks the active slot revision before the
    // aliased championship is changed and settles its economy in the same call.
    // The fastest lap among the cars still in the race — finished OR running
    // at the flag (a retired car's quick lap is not the race's, as the
    // announcer and badges read it). award() pays the 2019–2024 point only
    // inside the top ten, and only when the season format asks for it.
    let fastest = null, fastestT = Infinity;
    for (const c of cars) if (!c.retired && !c.dsq && c.best < fastestT) { fastestT = c.best; fastest = c.driverId; }
    const careerScoring = isCareer();
    const scored = careerScoring
      ? Career.scoreRound(order, player, fastest, RaceControl.shortRun(cars, lapsTarget))
      : SeasonCal.award(season, order, fastest, RaceControl.shortRun(cars, lapsTarget));   // no flag: the shortened-race scale
    const settles = careerScoring ? !!scored : scored === "race";
    // award() deletes season.qualiOrder when the round scores; the IN-MEMORY
    // classification is that same weekend and goes with it. Left behind, it keeps
    // qualiResults() truthy for the rest of the championship, so every later
    // grid would come off round 1's times.
    if (settles) quali.clear();
    else if (scored === "sprint") quali.clear();   // SPRINT QUALIFYING is spent too: the GP qualifies again (B2.2.1)
    // The career owner persists points and settlement together; the standalone
    // season saves its sprint stage or completed round here.
    if (careerScoring) careerSettlement = scored;
    else SeasonCal.save(season);   // the sprint's points AND its stage, one guarded write
  }
  // A one-off GP's driven quali order stays persisted (quali-persist contract);
  // quali's qualiTrack + qualiMode stamps refuse it on another circuit or mode.
  dbgCam = null; resultsCam.onFlag();
  buildResults(order, { sprint: wasSprint, duel: duelOn() });   // endRace's own read: scored() is stale after a season save conflict
  els.results.hidden = false;
  announcer.wrapUp(order, Object.assign(loadingInfo(), { sprint: wasSprint }));   // js/audio/announcer.js — the broadcaster's read over the results
}

let ltStore = null;   // LightStore.create(G), assigned once G exists (below)

// ── The shared ctx façade over game.js closure state ─────────────────────────
// Extracted modules (js/ui/results-sheet.js, hud.js, apex.js, …) can't reach the
// closure `let`s in this file, so game.js hands them ONE object of live
// getters/setters + stable helpers. Getters read the current value at call
// time; setters write back into the closure. Grown as extractions need it —
// add a getter here rather than passing state ad hoc.
let raceSettings = null, customTeam = null, titleMenu = null, uiExperience = null, photoStudio = null;

const G = {
  $, els,
  fmtTime: (t) => fmtTime(t),
  // The DASH number for a real ground speed — km/h on the pace-5 scale, so the
  // HUD/LCD span the same range at every OVERALL SPEED setting. Debug hooks
  // deliberately keep reporting raw m/s; see vTop/vStd.
  dashKph: (v) => dashKph(v),
  ttBoard, teamById: (id) => teamById(id), cssCol: (c) => cssCol(c),
  get state() { return state; }, set state(v) { setState(v, "api"); },
  get track() { return track; },
  get cars() { return cars; },
  get player() { return player; },
  get flyingStart() { return flyingStart; },   // js/race/flying-start.js — __apex.go() hands the wheel back at once
  get season() { return season; }, set season(v) { season = v; },
  // flow/session are the authority; seasonMode/timeTrial are DERIVED views kept so
  // the __apex.info() contract and every module that reads them are unchanged.
  // __apex.race()/tt() write the legacy names to mean "leave whatever mode this is",
  // which is exactly what the setters below do.
  get flow() { return flow; }, set flow(v) { setFlow(v); },
  get session() { return session; }, set session(v) { session = v; },
  // The career SAVE lives in js/career/career.js, which owns it outright — this is a
  // read-through so there is exactly one copy, never a stale mirror in a closure.
  get career() { return Career.data(); },
  get careerSettlement() { return careerSettlement; },
  openCareer: (...a) => openCareer(...a),
  openCareerSlots: (...a) => openCareerSlots(...a),
  openDailyPicker: () => openTimeTrial(true),
  get seasonMode() { return isChampionship(); },
  set seasonMode(v) { setFlow(v ? "season" : "gp"); },
  // The bare championship round in a season/career, else the per-session race
  // counter. NOT armReliability()'s draw round — that is SeasonCal.drawRound(),
  // which splits a sprint weekend in two; js/race/quali-model.js calls drawRound
  // itself and reads this only as the fallback when SeasonCal is absent.
  get seasonRound() { return isChampionship() && season ? season.round : raceIndex; },
  get ttNewRecord() { return ttNewRecord; }, set ttNewRecord(v) { ttNewRecord = v; },
  get ttSessionTs() { return ttSessionTs; },
  get records() { return records; },
  get coach() { return coach; },
  openCoachDetails: () => { openSettings(); settingsNav.show("driving", true); },
  get radio() { return radioVoice; },   // js/audio/radio-voice.js — AudioPanel drives its toggle and volume
  get announcer() { return announcer; },   // js/audio/announcer.js — AudioPanel drives its switch and voice
  get raceRadio() { return raceRadio; },   // js/race/race-radio.js — AudioPanel drives chatter + commentary
  recordControls: () => ({ autoThrottle: autoThrottle(), gearsManual: gearsManual(), steerMode, aero: raceAeroMode }),
  get ttRecord() { return ttRecord; }, set ttRecord(v) { ttRecord = v; },
  get timeTrial() { return isTimeTrial(); },
  set timeTrial(v) { session = v ? "tt" : "race"; },
  // DERIVED, like timeTrial: a Time Trial is always practice, and any other
  // session becomes practice once the player arms it. The setter never turns
  // a Time Trial OFF — there is no scored state for it to return to.
  get practice() { return isPractice(); },
  set practice(v) { practiceMode = !!v; },
  get duel() { return duelMode; }, set duel(v) { duelMode = !!v; },
  get duelLegend() { return duelLegend; }, set duelLegend(v) { duelLegend = v || ""; },
  get lapsTarget() { return lapsTarget; },
  // RELIABILITY: the race setting, the shared arming path (so a simulated career
  // round draws its retirements exactly as a driven race does), and the manual
  // retire the debug hook exposes.
  get raceReliability() { return raceReliability; },
  set raceReliability(v) {
    if (!Reliability.isLevel(v)) return;
    raceReliability = v; store.set("reliability", v);
  },
  armReliability: (field) => armReliability(field || cars),
  // TYRE WEAR: the race setting and the live model (js/physics/tyre-model.js).
  get raceTyreWear() { return raceTyreWear; },
  set raceTyreWear(v) {
    if (!TyreModel.isLevel(v)) return;
    raceTyreWear = v; store.set("tyreWear", v);
    // Keep the live model in step, exactly as gridUp() sets it. Without this the
    // model kept the PREVIOUS race's level until the next grid, and the STRATEGY
    // stint bar on the race-settings sheet — which reads planLaps() — planned
    // against it: on a fresh boot (model "off") a full-length GP at REAL wear
    // previewed "NO STOP".
    tyres.setLevel(isTimeTrial() ? "off" : v);
  },
  // DIRTY AIR: wake downforce loss (PhysicsConsts.DirtyAir). Classic is
  // the safe default for characterization traces; CFD is the SAE-shaped model.
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
  get sectorLast() { return sectorLast; },
  // Setting the seed also rewinds the stream, so seeding then rebuilding the
  // grid reproduces a scenario exactly. See simSeed. (simRnd itself is NOT
  // exported: the physics stream stays private to this file — every module
  // that could draw from it documents that it deliberately must not.)
  get seed() { return simSeed(); }, set seed(v) { simSeed(v); },
  simSeed,
  // The race counter the reliability and weather draws hash on. A BARE
  // passthrough on purpose (unlike `seed`, whose setter rewinds the stream):
  // in VS FRIEND the host publishes it pre-increment and both peers then
  // increment in startRace, so the draws agree — js/net/lobby.js publishSettings.
  get raceRound() { return raceIndex; }, set raceRound(v) { raceIndex = Math.max(0, v | 0); },
  get DRIFT() { return DRIFT; }, set DRIFT(v) { DRIFT = v; },
  get FRONT_GRIP() { return FRONT_GRIP; }, set FRONT_GRIP(v) { FRONT_GRIP = v; },
  // Cameras normalise speed against an injected vmax, so re-inject on every pace
  // change — otherwise the FOV/shake speed feel would stay pinned to pace 5.
  get PACE() { return PACE; }, set PACE(v) { PACE = v; GameCams.init({ vmax: vTop() }); },
  get PLAYER_GRIP() { return PLAYER_GRIP; }, set PLAYER_GRIP(v) { PLAYER_GRIP = v; },
  get ROAD_FOLLOW() { return ROAD_FOLLOW; }, set ROAD_FOLLOW(v) { ROAD_FOLLOW = v; },
  get STEER_EXPO() { return STEER_EXPO; }, set STEER_EXPO(v) { STEER_EXPO = v; },
  get STEER_MAX_SLIP() { return STEER_MAX_SLIP; }, set STEER_MAX_SLIP(v) { STEER_MAX_SLIP = v; },
  get STEER_SPEED_REF() { return STEER_SPEED_REF; }, set STEER_SPEED_REF(v) { STEER_SPEED_REF = v; },
  get WHEELBASE() { return WHEELBASE; }, set WHEELBASE(v) { WHEELBASE = v; },
  get YAW_DAMP() { return YAW_DAMP; }, set YAW_DAMP(v) { YAW_DAMP = v; },
  get YAW_INERTIA() { return YAW_INERTIA; }, set YAW_INERTIA(v) { YAW_INERTIA = v; },
  get raceLineAssist() { return raceLineAssist; }, set raceLineAssist(v) { raceLineAssist = v; },
  get _lastFloodEmit() { return _lastFloodEmit; }, set _lastFloodEmit(v) { _lastFloodEmit = v; },
  get _studioRig() { return _studioRig; }, set _studioRig(v) { _studioRig = v; },
  get _testInput() { return _testInput; }, set _testInput(v) { _testInput = v; },
  get builtTrackNight() { return builtTrackNight; }, set builtTrackNight(v) { builtTrackNight = v; },
  get camEye() { return camEye; }, set camEye(v) { camEye = v; },
  get camFov() { return camFov; }, set camFov(v) { camFov = v; },
  get camMode() { return camMode; }, set camMode(v) { camMode = v; },
  get camCutT() { return camCutT; }, set camCutT(v) { camCutT = v; },   // for js/camera/mode-switch.js
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
  get camRoll() { return camRoll; }, set camRoll(v) { camRoll = v; },
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
  // The RENDER clock (sky/cloud drift, FLAG cloth wave). It accumulates real
  // frame dt, so its value depends on how many frames happened to render — which
  // makes any pixel comparison across runs non-deterministic. Exposed so a
  // visual-regression capture can pin it; see __apex.renderClock().
  get skyT() { return _skyT; }, set skyT(v) { _skyT = v; },
  get skyHold() { return _skyHold; }, set skyHold(v) { _skyHold = !!v; },
  get raceTimeOfDay() { return raceTimeOfDay; }, set raceTimeOfDay(v) { raceTimeOfDay = v; },
  // The FLYBY SHOT EDITOR's saved list, or null for the shipped sequence.
  // Read-only here: flybyPanel writes it, reloadFlybyShots() reads it back.
  get flybyShots() { return flybyShots; },
  // True when the last gridUp() laid the grid from a pre-order (qualifying) —
  // the same slots on every peer — rather than from the pace order, which seats
  // the LOCAL player at P12 and so differs per machine.
  get gridPreOrdered() { return gridPreOrdered; },
  get lens() { return _lens; },
  get raceWeather() { return raceWeather; }, set raceWeather(v) { raceWeather = v; wxArc && wxArc.plan === wxArc._derived && (wxArc.plan = null); },
  get sectorBests() { return sectorBests; }, set sectorBests(v) { sectorBests = v; },
  get fieldSectorBests() { return fieldSectorBests; },
  get sectorIdx() { return sectorIdx; }, set sectorIdx(v) { sectorIdx = v; },
  get sectorStartT() { return sectorStartT; }, set sectorStartT(v) { sectorStartT = v; },
  get skyViewOverride() { return skyViewOverride; }, set skyViewOverride(v) { skyViewOverride = v; },
  get trackIdx() { return trackIdx; }, set trackIdx(v) { trackIdx = v; wxArc && wxArc.plan === wxArc._derived && (wxArc.plan = null); },
  get ttLaps() { return ttLaps; }, set ttLaps(v) { ttLaps = v; },
  get weatherArc() { return wxArc.arc; }, set weatherArc(v) { wxArc.arc = v; },
  // Mutable state consumed by js/lighting/atmosphere.js.
  get _cloudBase() { return _cloudBase; }, set _cloudBase(v) { _cloudBase = v; },
  get _ltBase() { return _ltBase; }, set _ltBase(v) { _ltBase = v; },
  get _ltFlash() { return _ltFlash; }, set _ltFlash(v) { _ltFlash = v; },
  get _ltNextT() { return _ltNextT; }, set _ltNextT(v) { _ltNextT = v; },
  // Mutable state consumed by js/garage/setup-sheet.js.
  get livDraftOverride() { return customLiv.livDraftOverride; }, set livDraftOverride(v) { customLiv.livDraftOverride = v; },
  get _spMeshKey() { return setupCam.meshKey; }, set _spMeshKey(v) { setupCam.meshKey = v; },
  get setupPreviewOn() { return setupPreviewOn; }, set setupPreviewOn(v) { setupPreviewOn = v; },
  // Read-only garage-camera state for __apex.garageCam().
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
  // Repaint the pause-menu button too: __apex.aeroMode() and the button are two
  // doors onto one value, and a stale label is a lie about the car's behaviour.
  set raceAeroMode(v) { raceAeroMode = v; store.set("aeroMode", v); refreshAeroBtn(); },
  get aeroZones() { return aeroZ ? aeroZ.zones : []; },
  aeroZoneAt: (s) => aeroZ.at(s),
  aeroZoneAhead: (s) => aeroZ.ahead(s),
  stepSetupAero: (dt) => setupCam.stepSetupAero(dt),
  setSetupView: (...a) => setupCam.setSetupView(...a),
  setSetupAim: (p) => setupCam.setSetupAim(p),   // garageFrame target: orbit about and look at a car-space point
  setSetupFree: (on) => setupCam.setSetupFree(on),   // garageFrame clamp:false — lift the player's el/dist floors for a dev shot (until the next preset)
  setupPan: (...a) => setupCam.setupPan(...a),
  nudgeSetupCam: (...a) => setupCam.nudgeSetupCam(...a),
  nudgeSetupZoom: (mul) => setupCam.nudgeSetupCam(0, 0, mul),
  // Exactly what drawAeroFlaps() is handed in the garage — the resolved aero
  // LEVEL and STYLE from the player's own parts, not the defaults. Probing with
  // a null style tests a car nobody is driving.
  setupFlapArgs: () => {
    const aSt = teamDecalState(Teams.LIST[teamIdx], true);
    return { aLvl: aSt.val, style: aSt.aero || null };
  },
  setSetupAero: (on, opts) => setupCam.setSetupAero(on, opts),
  get setupPreviewXOn() { return setupCam.xOn; },
  get soundOn() { return soundOn; }, set soundOn(v) { soundOn = v; },
  // A preset that bundles assists (ROOKIE) may set keys game.js owns —
  // autoThrottle among them — so it calls this to re-read them and repaint.
  onAssistBundle() {
    autoThrottleOpt = store.get("autoThrottle", autoThrottleOpt);
    throttleLatchOpt = store.get("throttleLatch", throttleLatchOpt);
    Input.setThrottleLatch(throttleLatchOpt);
    SettingRow.paint($("pm-throttlemode"), autoThrottleOpt ? "auto" : (throttleLatchOpt ? "latch" : "hold"));
    refreshGearsBtn();
    if (state === "race" || state === "count") showTouchControls(true);
    announce("ROOKIE — the car brakes, steers and accelerates with you. Turn it down in SETTINGS as you get quicker.", 4, "coach");
  },
  get musicEnabled() { return musicEnabled; }, set musicEnabled(v) { musicEnabled = v; },
  get unlimitedBudget() { return unlimitedBudget; }, set unlimitedBudget(v) { unlimitedBudget = v; },
  get teamIdx() { return teamIdx; }, set teamIdx(v) { teamIdx = v; },
  // Stable helpers consumed by js/garage/setup-sheet.js.
  arrToHex, hexToArr, getTeamParts, saveTeamParts, recomputePlayerMods, getLiveryId, saveLiveryId,
  getCustomLiveries, setCustomLiveries, getLiveries,
  invalidateDecalTextures: (id) => carDraw.invalidateDecalTextures(id),   // const from CarDraw.create(G) below — defer
  // Drop every procedural body/wheel GPU cache (CarDraw). Specs that hook
  // Car3D.build call this via __apex.clearCarMeshCaches so a warm sharedTest
  // worker rebuilds through the probe.
  invalidateFactoryMeshCaches: () => carDraw.invalidateFactoryMeshCaches(),
  armConfirm,
  // Mutable state + helpers consumed by js/ui/select-screen.js.
  get driverIdx() { return driverIdx; }, set driverIdx(v) { setDriverIdxAt(v); },
  get difficulty() { return difficulty; }, set difficulty(v) { difficulty = v; },
  get aiPace() { return AiBand.mode(); },
  set aiPace(v) { store.set("aiPace", AiBand.setMode(v)); },
  store, tickUi, scheduleFlybyTrack,
  ensureCircuit: (idx) => ensureCircuit(idx),
  // Same deferred-arrow trick for the garage <-> select plumbing: js/garage/setup-sheet.js is
  // created before js/ui/select-screen.js, and openGarage/openCustomize are declared further
  // down this file, so none of these can be referenced directly at create time.
  buildSetup: (...a) => buildSetup(...a),
  setTeamPicker: (...a) => setTeamPicker(...a),
  teamSwatch: (...a) => teamSwatch(...a),
  openGarage: (...a) => openGarage(...a),
  openCustomize: (...a) => customTeam.openCustomize(...a),
  // Career plumbing — same deferred-arrow reason as the block above.
  openRaceSettings: (...a) => raceSettings.openRaceSettings(...a),
  // SEASON SETUP: js/ui/select-screen.js draws the button, season-ui.js owns the screen, and
  // both need the OTHER one's entry point — hence the pair.
  openSeasonSetup: () => seasonUi.open(),
  buildSelect: (...a) => buildSelect(...a),
  updateTrackPreview: (...a) => updateTrackPreview(...a),
  // Read-only qualifying model for the CURRENT track (__apex.qualiSim).
  qualiSim: (playerTime) => quali.preview(playerTime || 0),
  // Memory only, exactly as quitToMenu's — for a screen that hand-rolls its own
  // return to the title (CareerUI's cr-back) and must not leak a weekend on.
  qualiClear: () => quali.clear(),
  refreshCareerButton: (...a) => refreshCareerButton(...a),
  // The R&D gate for the garage LISTING: the option ids the team on screen may fit,
  // or null. Career.owned() answers "career rules apply AND this is the career
  // team" by itself, so outside a career this is a no-op the garage can ignore.
  // Read per rebuild rather than held, so a part researched mid-session shows up.
  careerOwned: () => Career.owned(Teams.LIST[teamIdx] && Teams.LIST[teamIdx].id),
  // Mutable state + helpers consumed by js/camera/photo-cam.js.
  get photoMode() { return photoMode; }, set photoMode(v) { photoMode = v; },
  get _photoPrevScale() { return _photoPrevScale; }, set _photoPrevScale(v) { _photoPrevScale = v; },
  get photoAlt() { return photoAlt; }, set photoAlt(v) { photoAlt = v; },
  get photoVertT() { return photoVertT; }, set photoVertT(v) { photoVertT = v; },
  // The live profile object owned by js/lighting/profiles.js — js/lighting/tuner-panel.js
  // deletes a key out of it for the tuner's RESET and merges it for COPY VALUES.
  get _ltStore() { return ltStore.profiles; }, set _ltStore(v) { ltStore.profiles = v; },
  photoCam, photoKeys, photoMouse, photoMove, photoLook,
  applyResMode: (...a) => applyResMode(...a),   // const from UiScale.create(G) below — defer
  ltKey: (...a) => ltKey(...a),
  // (setLightTune is a hoisted function, exposed as a plain shorthand below.)
  exitPhotoMode: (...a) => exitPhotoMode(...a),
  openWatchPhoto: () => openExperiencePhoto("watch"),   // const initialised below — defer
  // Stable helpers consumed by js/lighting/atmosphere.js.
  clamp: (v, a, b) => clamp(v, a, b),
  satAdjust: (rgb, amt) => satAdjust(rgb, amt),
  isRaining: () => isRaining(),
  isWetRoad: () => isWetRoad(),
  initRainDrops: () => initRainDrops(),
  isFloodActiveSession: () => isFloodActiveSession(),
  _nightAmbientBand: () => _nightAmbientBand(),
  applyLightTune: (fromApplyRace, opts) => applyLightTune(fromApplyRace, opts),
  // Stable bindings consumed by js/agent/apex.js (functions hoist; consts are
  // initialised before ApexApi.create(G) runs at the end of boot).
  smp, smp2, canvas,
  get gfx() { return gfx; },
  // Local (s,x)↔world helpers for the incident sim's guarded handover writeback
  // (js/physics/incident-sim.js). trackFrom is the LOCAL predictor+Newton read (never
  // a global search — see its comment), worldFromTrack its exact inverse.
  trackFrom: (px, pz, sp) => trackFrom(px, pz, sp),
  worldFromTrack: (s, x) => worldFromTrack(s, x, smp2),
  GAME_LAPS, TT_LAPS, LONG_GRIP, COUNTDOWN_S,
  raceProfile,   // the race-entry stopwatch (startRace), read by __apex.raceProfile()
  // The friction-circle constants, for js/race/quali-model.js: it runs a quasi-steady
  // lap simulation off the SAME numbers the driving model uses, so a simulated
  // qualifying time and a driven one are on one scale by construction.
  // LAT_MAX and BRAKE are absolute in the driving model (cornering grip and
  // braking do not scale with pace — only acceleration and top speed do), so
  // they pass through as constants; acceleration goes through aTop().
  LAT_MAX, BRAKE,   // ACCEL is deliberately NOT here — reading it was the bug aTop() fixed
  vTop: () => vTop(),
  aTop: () => aTop(),
  applyRaceSettings: (blendS) => applyRaceSettings(blendS),   // const initialised below — defer; blendS: see Atmosphere
  announce, applyCaution, camVantage, camPoseOf, endRace, gridUp, gripMult, trackWetness, isErsDeploying, cautionInfo, cautionLevel,
  aeroDfMult, xVmaxGain, xDfLoss, drainFor, regenFor, otTimeFor,
  setCautionEnabled, otEnabled,
  get netPlay() { return netPlay; },
  get netStart() { return netStart; }, set netStart(v) { netStart = v; },
  // DECLARED, not an expando. js/net/netplay.js and js/agent/apex.js write
  // G.netNow at four sites and read it at three, and it appeared NOWHERE in
  // this file — it existed only because JS lets you add a property to an
  // object. That is the countT shape all over again, and the whole premise of
  // this facade is that its members are declared in one place. It is also what
  // would make an Object.seal(G) throw rather than no-op, since every writer is
  // a strict-mode IIFE. A session's clock, not the page's: netplay nulls it
  // between sessions so a stale value cannot date a fresh session's deadlines.
  get netNow() { return netNow; }, set netNow(v) { netNow = v; },
  // The countdown clock and how many lamps are lit. netStartArm has always
  // written G.countT and, with no accessor here, it has always gone nowhere —
  // an expando on the façade that nothing reads. Invisible until now only
  // because the netStart branch overwrites countT every frame; a test asking
  // for the UNARMED hold gets no such rescue. lightsLit is worse: go()/reset()
  // clear the lamp DOM and leave the counter at 5, which silently disarms any
  // "did every lamp light?" assertion made after them.
  get countT() { return countT; }, set countT(v) { countT = v; },
  get lightsLit() { return lightsLit; }, set lightsLit(v) { lightsLit = v; },
  get netLobby() { return netLobby; },
  loadCarModel: (url) => carDraw.loadCarModel(url),   // const from CarDraw.create(G) below — defer
  loadTrack, persistLightTune, copyLightTune, restoreLightTune,
  refreshLightTunePanel: (...a) => refreshLightTunePanel(...a),   // const initialised below — defer
  setCamMode: (...a) => setCamMode(...a),   // const from CamModes.create(G) below — defer
  rescuePlayer, setLightTune, snapGameCam,
  onIncidentLineCross,
  // Live weather + time of day (js/race/weather-arc.js) — deferred, wxArc is created below.
  setWeatherLive: (w) => wxArc.setWeatherLive(w),
  setTimeOfDay: (tod) => wxArc.setTimeOfDay(tod),
  weather: (w) => wxArc.weather(w),
  loadingInfo,                          // what the loading card describes — the flyby editor previews it
  get loadingScreen() { return loadingScreen; },   // js/ui/loading-screen.js — the editor drives the card's geometry
  setCarRole, modsFor, swapGridSlots,   // multiplayer seam — see setCarRole
  followCar: (c) => { cars.forEach((o) => setCarRole(o, false, o === c)); player = c; },   // a replay: the camera, HUD and audio move to this car; nobody drives (js/race/real-replay.js)
  setPip: (c, m) => mirrorPass.setSubject(c, m),   // the broadcast PiP's car and shot (js/race/broadcast.js → js/render/shared/mirror-pass.js)
  goRolling: () => { if (state !== "count") return false; setState("race", "rolling-start"); launchT0 = raceT; els.lights.hidden = true; for (const l of els.lights.children) l.classList.remove("on"); lightsLit = COUNTDOWN_S; cars.forEach((c) => { c.launchOn = false; }); return true; },   // a mid-race jump-in: green at once, no gantry, no launch model — the field is already at speed (js/race/real-race.js)
  // …and its hand-over counts on the gantry's plate (4, 3, 2, 1, GO; null clears): a big number where the lights are, not a queued radio card.
  handoverCount: (v) => { const on = v != null; els.lights.classList.toggle("count", on); if (on) els.lights.dataset.count = String(v); else delete els.lights.dataset.count; els.lights.hidden = !on; },
  wireId,                               // stable cross-peer car identity
  setScale: (...a) => setScale(...a),   // const from UiScale.create(G) below — defer
  // Debug teleports can run while a headless/SwiftShader frame is starved.
  // Let apex.js synchronise its observable HUD state without waiting for rAF.
  refreshHud: (...a) => updateHud(...a),   // const initialised below — defer
  // The waiting room reuses the real menus rather than reimplementing them.
  setNetRoom: (...a) => raceSettings.setNetRoom(...a),
  resetRaceDraft: () => raceSettings.resetDraft(),
  openRaceSetup: (...a) => raceSettings.openRaceSetup(...a),
  // The lobby's buttons ask for TILT permission inside their own click: a
  // friend race starts from the network, with no gesture to ask in.
  enableTilt: () => enableTilt(),
  getSteerMode: () => steerMode,
  get netRoom() { return raceSettings.netRoom; },
  // Seats held by the OTHER players, so the garage can refuse to hand out one
  // that is taken. An array today of at most one entry; up to three when the
  // room grows past two. Empty off-line, which is what keeps every solo mode
  // exactly as it was.
  peerSeats: () => (netLobby && netLobby.peerSeats ? netLobby.peerSeats() : []),
  onPeerQuali: (...a) => qualiNet.onPeerQuali(...a),
  onPeerQualiLive: (...a) => qualiNet.onPeerQualiLive(...a),
  openQualiForNet: (...a) => qualiNet.openQualiForNet(...a),
  refreshQualiGate: (...a) => qualiNet.refreshQualiGate(...a),
  // raceQuali is a VIEW of the grid rule (quali | rev10). The setter keeps an
  // older peer's boolean meaningful: it only moves the rule across the
  // qualifying line, never off a finer rule that already agrees with it.
  get raceQuali() { return qualiGrid(); }, set raceQuali(v) { if (!!v !== qualiGrid()) raceGrid = v ? "quali" : "tier"; },
  get raceGrid() { return raceGrid; }, set raceGrid(v) { if (GRID_RULES.indexOf(v) >= 0) raceGrid = v; },
  get champGrid() { return champGrid; }, set champGrid(v) { if (CHAMP_GRID_RULES.indexOf(v) >= 0) champGrid = v; },
  referencePole: () => quali.referencePole(),
  redFlagRestart,
  get daily() { return daily; },
  holdCaution: (level, cause) => raceCtl.hold(level, cause),   // a scripted flag (js/race/real-race.js); 0 releases it
  resetEpisodeOwners() { IncidentSim.reset(); raceCtl.reset(); DebrisWorld.reset(); },
  cameraDampingState() {
    return { eye: camEye.slice(), target: camTgt.slice(), fov: camFov,
      previousAnchor: [camAncX, camAncZ], nextAnchor: [camAncNX, camAncNZ],
      renderFrame: _frameNo, simulationTime: raceT, renderTime: _skyT };
  },
  get ttDistance() { return TT_LAPS; },   // the time-trial distance a daily session stages (ttLaps is the session's lap list)
  // CHANGEABLE conditions: the weather walks from the chip's start to a
  // target the host decides (wxArcPlan) — see startRace / WeatherArc.planFor.
  get raceChangeable() { return wxArc.changeable; }, set raceChangeable(v) { wxArc.changeable = !!v; wxArc && wxArc.plan === wxArc._derived && (wxArc.plan = null); },   // a DERIVED plan (cached below) is dropped by every setting it reads; an assigned (host) one stays
  get announceBusy() { return announceT > 0; },   // a coach mark must never stomp a race message
  get wxArcPlan() { return wxArc.plan || (wxArc.changeable ? (wxArc.plan = wxArc._derived = wxArc.planFor()) : null); },   // cached: the plan lobby publishes IS the one startChangeable arms (planFor reads the previous session's laps/track)
  set wxArcPlan(v) { wxArc.plan = v && typeof v === "object" ? { to: v.to, dur: v.dur } : null; },
  openGarageFrom: (from) => openGarage(from),
  startWeatherArc: (from, to, dur) => wxArc.startArc(from, to, dur),
  startRace, update, wrapS, quitToMenu,
  raceIntro,   // the pre-race screen, for a launch that is not RACE! (js/race/real-race.js: the Data Hub's JUMP IN)
};

// Lighting profile resolution + persistence (js/lighting/profiles.js). FIRST of
// the module wires: it reads the saved profiles at construction, and
// Atmosphere's applyRaceSettings — created a few lines down — calls into it.
ltStore = LightStore.create(G);
// Race control: the caution flag state machine (js/race/race-control.js).
raceCtl = RaceControl.create(G);
// Live weather + the dynamic weather arc (js/race/weather-arc.js). The two
// session-format predicates come as deps rather than as new G members.
wxArc = WeatherArc.create(G, { isTimeTrial, isQuali });
// Tyre wear, the grip it costs and the fuel that argues with it
// (js/physics/tyre-model.js). Created before the first gridUp fits a compound.
tyres = TyreModel.create(G);
const playerForces = PlayerForces.create(G);
// The pit lane (js/race/pit-lane.js) — the thing that lets a driver DO something
// about a worn set. Reads the tyre model, so it is created after it.
pits = PitLane.create(G);   // stub until ensureRaceSession; recreated in onRaceSessionReady
let startLights = StartLights.create(G);   // LAZY_RACE_SESSION — recreated when the real bundle lands
let marshalPanels = MarshalPanels.create(G);
// The race engineer (js/race/engineer.js): the voice that makes all of the
// above legible to a driver who never opens a menu. Reads both, so it is last.
engineer = RaceEngineer.create(G);
// The radio's VOICE (js/audio/radio-voice.js) — speechSynthesis over the banner
// the engineer, the coach and race control already write. Off by default, and
// inert wherever the API, a voice or the setting is missing.
radioVoice = RadioVoice.create(G);
// The PRE-RACE ANNOUNCER (js/audio/announcer.js) — "Welcome to Apex 26…" over
// the loading screen's flyby. After the radio: it borrows that module's
// speakable() and per-channel tune, and nothing else.
announcer = Announcer.create(G);
let records = SessionRecords.create(G);   // LAZY_RACE_SESSION
const coach = DrivingCoach.create(G);     // FULL — UiExperience captures this instance
let raceRadio = RaceRadio.create(G);      // LAZY_RACE_SESSION — recreated on ensure
const daily = DailyChallenge.create(G);   // the day's time-trial plan (js/race/daily-challenge.js)
const realRace = RealRace.create(G);      // a real Grand Prix replayed from its timing script (js/race/real-race.js)
let flyingStart = FlyingStart.create(G, { realRace: () => realRace.status().active });   // LAZY_RACE_SESSION
titleMenu = TitleMenu.create(G);           // returning-player + daily doors (js/ui/title-menu.js)
const onboard = Onboard.create(G),
  director = Director.create(G, () => !realRace.isWatch() && !replayBuf.isScrubbing()),
  replayBuf = ReplayBuf.create(G, () => !realRace.isWatch()), // coach + live TV (solo only) + replay ring
  resultsCam = ResultsCam.create(G, () => !realRace.isWatch()); resultsCam.attachReplay(replayBuf); G.replayBuf = replayBuf;   // tests + pause UI (internal handle, not on the typed façade)
// Results / TT-leaderboard / standings DOM builders (js/ui/results-sheet.js).
const { buildResults, buildTTResults, buildStandings, buildChampion } = GameResults.create(G);
// In-race HUD + minimap (js/ui/hud.js).
const hud = GameHud.create(G);
const updateHud = hud.updateHud;
// Session atmosphere: applyRaceSettings + per-track bias (js/lighting/atmosphere.js).
const _atmo = Atmosphere.create(G), applyRaceSettings = _atmo.applyRaceSettings;
// CAR SETUP panel UI (js/garage/setup-sheet.js).
const { buildSetup, openSetup } = SetupUI.create(G);
// Select-screen UI (js/ui/select-screen.js).
const { buildSelect, updateTrackPreview, openTrackDetail, closeTrackDetail, setTeamPicker, teamSwatch, vt } = Menus.create(G);
// The car-drawing seam (js/car/car-draw.js): mesh / atlas caches, the player's
// wheel spec, decal queue, cockpit rig, planted wheels, warm-ups, GLB body.
// resolveLivery lives in CustomLiveries; partsVisualKey / drawAeroFlaps / damp
// stay here (the garage and the setup preview share them via deps).
const carDraw = CarDraw.create(G, { resolveLivery, partsVisualKey, drawAeroFlaps, damp, isTimeTrial, isQuali });
const { teamMesh, teamBodyMesh, playerBodyMesh, cockpitBodyMesh, teamDecalState, carDecalNum,
        drawCarDecals, queueCarDecals, drawPlayerWheels, drawPitCrew, pitCrewDrawn, drawCockpitRig,
        warmCarAssets, prepareMenuCarAssets } = carDraw;
_pitCrewDrawn = pitCrewDrawn;   // __apex.pit() reads G.pitCrewDrawn to prove the crew mesh submitted

// The garage setup-preview camera and its #cs-view controls
// (js/garage/setup-camera.js). Constructed HERE rather than with the other
// panels further down: CustomTeam.create() takes spMeshBust as a value, so
// the module has to exist by then.
const setupCam = SetupCamera.create(G, { resolveLivery, partsVisualKey, drawAeroFlaps,
  teamDecalState, carDecalNum, drawCarDecals, carPaintMat, PAINT_DRY_DAY, MAT_REFLECT_X, render });
const { resetSetupCam, setSetupCamPanel, spMeshBust } = setupCam;
// The garage pre-built while the menu idles (js/garage/prebuild.js); `timed` measures tap -> first garage frame.
const garagePre = GaragePrebuild.create(G, { gate: _menuGate, setupCam, menuIdle, menuSlice,
  ui: () => uiExperience, studio: () => _studio, worldReady: () => menuWorld() });
const renderSetupPreview = garagePre.timed(setupCam.renderSetupPreview);
garagePre.start();
// The three shadow-map passes (js/render/shared/shadow-pass.js): sun snap cache,
// per-frame car map, night lamp map, the caster pools and the blob flush.
const shadowPass = ShadowPass.create(G, { teamMesh, vStd, cockpitCaster: carDraw.cockpitCaster });
// The HUD rear-view mirror (js/render/shared/mirror-pass.js): a second camera, rendered in the env probe's slot below.
const mirrorPass = MirrorPass.create(G, { drawWorldMeshes, drawCar: carDraw.drawMirrorCar, renderPosOf, playerAnchor, yawVisInterp, basisMat,
  carPaint: (wet, night) => carPaintMat(wet ? (night ? PAINT_WET_NIGHT : PAINT_WET_DAY) : (night ? PAINT_DRY_NIGHT : PAINT_DRY_DAY)),
  onModeChange: () => paintHudDetailsSummary() });

// MY TEAM load/sync + customize dialog (js/career/custom-team.js).
customTeam = CustomTeam.create({
  $, store, Teams, DEFAULT_CUSTOM, hexToRgb, rgbToHex, hexToArr, clamp,
  invalidateDecalTextures: (id) => carDraw.invalidateDecalTextures(id),
  invalidateCustomMeshCaches: () => carDraw.invalidateCustomMeshCaches(),
  spMeshBust,
  getLivDraftOverride: () => customLiv.livDraftOverride,
  setLivDraftOverride: (v) => { customLiv.livDraftOverride = v; },
  getSoundOn: () => soundOn,
  GameAudio,
  getEls: () => els,
  getTeamIdx: () => teamIdx,
  setTeamIdx: (v) => { teamIdx = v; },
  getDriverIdx: () => driverIdx,
  setDriverIdx: setDriverIdxAt,
  buildSelect,
  buildSetup,
  isCarsetupVisible: () => !$("carsetup").hidden,
});
// UI SIZE / HUD SIZE + RESOLUTION (js/ui/scale.js). After Menus so the
// first applyUiScale can refresh an already-built select preview.
const uiScale = UiScale.create(G), { setScale, applyResMode } = uiScale; if (typeof DockLayout !== "undefined" && DockLayout.create) DockLayout.create(G);
// CAREER screen — new-career setup + season hub (js/career/career-ui.js). The rules
// and the save live in js/career/career.js, which is a plain global and needs no ctx.
const careerUi = CareerUI.create(G);
// SEASON SETUP screen (js/career/season-ui.js) — the calendar and weekend format.
// Same split: the rules and the save live in js/career/season-cal.js.
const seasonUi = SeasonUI.create(G);
// QUALIFYING — the model (js/race/quali-model.js: the flying lap plus the simulated field,
// holding the classification between session and grid) and its sheet (quali-sheet.js).
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
// RACE SETTINGS sheet (js/race/race-settings.js).
raceSettings = RaceSettings.create(G, {
  GameAudio, Tracks, SettingRow, DrivingLine, SeasonCal,
  qualiResults: () => quali.results(), openQuali, enableTilt,
  getSteerMode: () => steerMode, buildStandings, raceIntro: raceIntroFromSheet,
});
// PRE-RACE LOADING SCREEN (js/ui/loading-screen.js). It plays the cinematic
// over the world scheduleFlybyTrack() already warmed, and startRaceBody keeps
// its card up until the backend presents the grid — see that file for why.
const loadingScreen = LoadingScreen.create({ $, Tracks, TrackMaps, Flags, store, announcer: () => announcer, radio: () => radioVoice });
/** The RACE! button's route into a race. Not folded into startRace(): netplay
 *  and __apex.race() both AWAIT that function, and neither should gain two
 *  seconds of flourish. The button is the only place a human is watching. */
/** THE GRID, FOR THE FLYBY'S LAST SHOT. The menu builds a world but no field —
 *  prepareMenuCarAssets only warms the car MESHES — so the closing shot up the
 *  middle of the grid was an aisle of empty tarmac. This seats the cars for it.
 *
 *  IT MUST NOT COST THE SIM STREAM A SINGLE DRAW. makeCars() spends one simRnd()
 *  per car, and the seeded stream's draw count is a contract the whole race
 *  reproduces from (see gridUp, armReliability). So the state is snapshotted and
 *  restored around the call, and the cars are seated on TrackMesh's own slots
 *  directly rather than through gridUp(), which spends a draw per car of its own
 *  for the grid jitter. startRace() then builds the real field from an untouched
 *  stream moments later and throws this one away.
 *
 *  Only the fields the DRAW path reads are set: this is scenery, not a race. */
function menuGridCars() {
  if (!track || headlessMode || typeof TrackMesh === "undefined") return;
  const rng = _simRngState;
  try {
    makeCars();
    const order = flybyGridOrder();
    cars = order || cars;
    FlybySeq.setPlayerSlot(order ? order.indexOf(player) : null, cars.length);   // null: not knowable yet, so no grid-mine shot
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
    cars = [];                       // half a grid is worse than none
    Log.warn("gfx", "menu grid failed", e);
  }
  _simRngState = rng;
}

/** THE GRID THE RACE WILL FORM, seated before it exists so the flyby's
 *  grid-mine shot frames YOUR car: startRace's trims (quali/time trial: you
 *  alone; duel: you and the rival the race grids ahead of you) and the race grid's
 *  pre-orders (qualifying, sprint, rev10, revchamp) — else the pace order with
 *  you at P12. Null for a RANDOM grid: its draw belongs to the race. Any simRnd()
 *  spent here is rolled back by menuGridCars. */
function flybyGridOrder() {
  if (!player) return null;
  if (isQuali() || isTimeTrial()) return [player];
  if (duelOn()) {   // startRace's trim (and its legend swap); the pair is then gridded like any field
    const r = Duel.pick(cars);
    const lg = r && duelLegend && typeof Legends !== "undefined" ? Legends.byId(duelLegend) : null;
    if (lg) Duel.asLegend(r, { id: lg.id, name: lg.name, code: lg.code, ratings: Legends.ratings(lg.id), team: Legends.raceTeam(lg.id) }, DriverRatings);
    cars = r ? [player, r] : [player];
  }
  const base = gridFromQuali() ? quali.order(cars) : null;
  if (gridRule() === "random" && !base) return null;
  const pre = gridOrderFor(base);
  if (pre && pre.length === cars.length) return pre.slice();
  const o = cars.filter((c) => c !== player).sort((a, b) => a.tier - b.tier);   // gridUp's tier order (its jitter is the race's draw)
  o.splice(Math.min(11, o.length), 0, player);
  return o;
}

// RACE! before the menu's idle build: prepare under the card, then drive out
// and fly. The race reuses this build; its outgoing shot never waits for shaders.
let _introKey = "", _introRun = 0, _introSkip = 0;
function cancelIntro() { if (_studio) studioClose(_studio.n); _introRun++; _introKey = ""; _introSkip = 0; sheetRelease(false); }
async function awaitIntroWarm(current) {
  const at = performance.now();
  while (current() && gfx.warming && gfx.warming()) {
    if (performance.now() - at >= 30000) throw new Error("Shader preparation timed out");
    await menuSlice();
  }
  return current();
}
// THE STUDIO DRIVE-OUT: a prepared world plays the outgoing animation then cuts
// straight to the flyby. Cold builds/warmups stay behind the build card first:
// compilation owns the renderer, so it must finish before the car starts moving.
// A tap skips the cinematic once preparation settles. Only its intro run closes it.
let _studio = null;
// RACE SETTINGS COVERS ITS OWN START (raceIntroFromSheet): the sheet stays up, START
// reading PREPARING… and BACK (Escape's door) off, not the build card over a black canvas
// before the garage. studioShown or raceIntro lowers it; titleIfBare/cancelIntro give the buttons back.
let _introSheet = null;
function sheetRelease(hide) {
  const h = _introSheet; if (!h) return;
  _introSheet = null; h.btn.disabled = false; if (h.back) h.back.disabled = false;
  if (h.btn.textContent === "PREPARING…") h.btn.textContent = h.label;   // unless the sheet relabelled it meanwhile
  if (hide) h.sheet.hidden = true;
}
/** Cold preparation's cover: prep scrim (card hidden), unless race settings already covers it. */
function introCover(info, n) { if (!_introSheet) loadingScreen.prep(info, () => studioSkip(n)); }
/** Garage-out finished → race/session card. Every intro path ends here (strict sequence). */
function afterGarageOut(n, key, go, prepared, live) {
  studioClose(n);
  if (n !== _introRun) return;
  if (!prepared || !live()) { loadingScreen.stop(); titleIfBare(); return; }
  try { _introKey = key; raceIntro(go); } catch (e) { Log.warn("gfx", "loading screen failed", e); loadingScreen.stop(); go(); }
}
function studioOpen(n, info) {
  if (_studio) studioClose(_studio.n);
  const real = info && info.real;
  // None for: a race joined mid-way or watched (not your car leaving the garage), a
  // hidden tab or a headless run (no frames, so its clock would not run). EVERY
  // other RACE! plays it — a habitual skipper included: the skip streak shortens
  // the FLYBY, and a tap skips this too (it was dropped at 3 skips, which hid it
  // from exactly the players testing it).
  const off = (real && (real.watch || real.startLap > 1)) || headlessMode || document.hidden;
  const ms = off ? 0 : setupCam.startDriveOut();
  if (ms > 0) {
    const at = performance.now();
    // openAt is never reset: absolute hang ceiling = prep + 3× drive from studioOpen.
    _studio = { at, openAt: at, ms: Math.max(1, ms), n, info, cardUp: true };
    setupPreviewOn = true;
  }
  if (_studio && gfx.softPresent && gfx.softPresent() && gfx.awaitSoftPresent) {
    const studio = _studio; studio.softReady = false;
    if (gfx.invalidateSoftPresent) gfx.invalidateSoftPresent();   // discard readbacks from the previous camera
    gfx.awaitSoftPresent(30000).then(() => { if (_studio === studio) studio.softReady = true; }, (e) => { if (_studio === studio) studio.error = e; });
  }
  introCover(info, n);   // present() may start a queued warm: keep preparation covered
}
/** The garage's first drawn frame after a pending warm: the card gives way to it (render()). */
function studioShown() {
  if (!_studio || !_studio.cardUp) return;
  const soft = gfx.softPresentState && gfx.softPresentState();
  if (soft && soft.shownGen < soft.sceneGen) return;   // WGX's first readback may belong to the previous scene
  const n = _studio.n;
  _studio.cardUp = false; _studio.at = performance.now();
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
  if (loadingScreen.phase() === "garage") loadingScreen.building(info);   // the car is out and the build is not: the card covers the rest
}
async function studioDone(live, n) {
  // The car's own clock, not the wall's: a build stall must not cut it off in the doorway.
  // Safety fallback is bounded at 3× the animation's own duration (never shorter than ms),
  // from the garage's first frame — prep cover time is not the car's time (30 s ceiling).
  // Absolute ceiling from openAt still resolves if soft-present / prepare stalls the clock reset.
  while (_studio && _studio.n === n && !_studio.skip && live() && (_studio.cardUp || setupCam.driveOutLeft() > 0)) {
    if (_studio.error) throw _studio.error;
    const driveCap = Math.max(_studio.ms, _studio.ms * 3);
    const elapsed = performance.now() - _studio.at;
    const sinceOpen = performance.now() - (_studio.openAt || _studio.at);
    const cap = _studio.cardUp ? 30000 : driveCap;
    if (elapsed >= cap || sinceOpen >= 30000 + driveCap) {
      if (_studio.cardUp) throw new Error("Garage preparation timed out");
      break;   // only after ≥ animation duration (or absolute openAt ceiling)
    }
    await menuSlice();
  }
  // Keep the last pose until this run cuts to the flyby in the same async turn.
  // Preparation is already settled: no shader work follows the outgoing animation.
  if (_studio && _studio.n === n && gfx.warm && !_studio.skip && live()) _studio.held = true;
  else studioClose(n);
}
// Plan while the garage animates, rather than holding its last pose to plan the
// opening flyby. This only reads the circuit; shader work retains renderer ownership.
async function introPlan(live, key, info, n) {
  if (!live()) return null;   // a garage skip ends the drive-out only: the flyby still flies this plan
  reloadFlybyShots();
  if (!flybyShots && _menuFly && _menuFly.key === key && _menuFly.track === track) return _menuFly;
  FlybySeq.setDuration(loadingScreen.nextFlyMs(info.readMs));
  const fly = { key, track, shots: flybyShots || FlybySeq.vary(FlybySeq.DEFAULT, (Date.now() ^ (trackIdx * 2654435761)) >>> 0, false) }, step = FlybySeq.planSteps(track, fly.shots);
  // Compilation can delay a yielded timer for seconds; budget only planner CPU.
  for (let spent = 0, slice = 0; live() && spent < 800;) {
    const at = performance.now(), done = step(), elapsed = performance.now() - at;
    spent += elapsed; slice += elapsed;
    if (done || spent >= 800) break;
    // Cheap/cache-hit shots share a slice; one expensive shot still yields alone.
    if (slice >= 3) { await menuSlice(); slice = 0; }
  }
  return live() ? fly : null;
}
// Prepare lamp inputs before compilation owns the scene; their CPU-only
// slices and shot planning can then run alongside the hidden shader warm.
async function introPrepare(live, key, info, n, cold) {
  let failed = false;
  const current = () => !failed && live();
  if (gfx.warming && gfx.warming() && !(await awaitIntroWarm(current))) return null;
  if (!current()) return null;
  const lamps = _atmo.prebakeLamps();
  const plan = introPlan(current, key, info, n).catch((e) => { failed = true; throw e; });
  try {
    const [fly] = await Promise.all([plan, (async () => {
      // Let immediate planning failure/cancellation retire the request first.
      await Promise.resolve();
      if (!current()) return;
      if (cold) {
        FlybySeq.reset(); warmPrograms(); _menuGate.warm = 2;
        for (let f = 0; f < 3 && current() && _menuGate.warm > 0; f++) await new Promise((r) => requestAnimationFrame(r));
      }
      if (await awaitIntroWarm(current) && cold && current()) _menuGate.warm = 0;
    })(), (async () => {
      await Promise.resolve();
      // Same resumable bake as menuLampBake; smaller slices preserve input responsiveness.
      const lampAt = Date.now();
      while (lamps && current() && !lamps(3)) {
        if (Date.now() - lampAt >= 30000) break;   // never hang the Start Race sequence on a stuck bake
        await new Promise((r) => setTimeout(r, 8));
      }
    })()]);
    return current() ? { fly } : null;
  } catch (e) { failed = true; throw e; }
}
// A ready, warm world opens on the garage immediately; planning overlaps its motion.
// Reduce-motion plays the same drive-out at its tuned pace (setup-camera startDriveOut), never skips it.
// Await garage-out (studioDone) in parallel with prepare — never block the card on a
// stuck prepare while the car has already left the bay.
function introGarage(go) {
  const key = menuKey(trackIdx), n = ++_introRun, settings = entrySettings(), info = loadingInfo();
  const live = () => n === _introRun && state === "menu" && settings === entrySettings() && key === menuKey(trackIdx);
  studioOpen(n, info);
  if (!_studio) { loadingScreen.stop(); return false; }   // no drive-out (tuner off, a watched race): fly at once, as before
  let prepared = false;
  (async () => {
    try {
      const prepP = introPrepare(live, key, info, n, false);
      await studioDone(live, n);   // garage-out first (or its 3× / openAt safety cap)
      const ready = await prepP;
      if (!ready) return;
      if (live() && ready.fly) _menuFly = ready.fly;
      prepared = true;
    }
    catch (e) { if (live()) { Log.warn("gfx", "intro garage failed", e); quitToMenu(); announce("PREPARATION FAILED — please retry", 5, "info"); } }
    finally { afterGarageOut(n, key, go, prepared, live); }
  })();
  return true;
}
function introBuild(go) {
  const idx = trackIdx, key = menuKey(idx), n = ++_introRun;
  const settings = entrySettings(), live = () => n === _introRun && state === "menu" && settings === entrySettings();
  if (!(idx >= 0)) return false;   // reduce-motion still builds then plays the garage-out before the card and the flyby
  clearTimeout(flybyBuildTimer); _menuGate.generation++;   // the menu's own build stands down
  const info0 = loadingInfo();   // its readMs: a real race's flyby is planned for the length it will run (a 24 s plan is re-planned mid-flyby)
  introCover(info0, n);
  let prepared = false;
  (async () => {
    try {
      await ensureScenery(idx);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));   // the preparation card paints first
      if (!(await awaitIntroWarm(live)) || !live()) return;   // compilation retains ownership of its scene
      // In steps, a few ms per frame: the preparation card and skip remain responsive.
      if (!(await loadTrackStepped(idx, live)) || !live()) return;
      _menuGate.ready = key; _menuGate.track = track;
      // Assets, plans and shader warm all settle before the outgoing animation.
      const t1 = performance.now();
      await prepareMenuCarAssets(() => live() && performance.now() - t1 < 1500);
      const ready = await introPrepare(live, key, info0, n, true);
      if (!ready) return;
      const fly = ready.fly;
      // Publish only after compilation: cancellation cannot leave a stale plan.
      if (live() && fly) _menuFly = fly;
      _menuGate.warm = 0;
      if (_introSkip !== n) { studioOpen(n, info0); await studioDone(live, n); }
      prepared = true;
    } catch (e) {
      if (live()) { Log.warn("gfx", "intro build failed", e); quitToMenu(); announce("PREPARATION FAILED — please retry", 5, "info"); }
    }
    finally { afterGarageOut(n, key, go, prepared, live); }
  })();
  return true;
}
// RACE! WHILE THE MENU'S WARM IS STILL COMPILING: render() draws nothing until it
// ends, so a flyby begun now spent its opening shots, its clock and the voice on a
// black canvas (1-4 s on a real GPU; the whole flyby under SwiftShader). Hold the
// card over the warm, bounded as introBuild's is, then fly.
// The world is often BUILT but not yet warmed (menuFinish warms only once the menu
// goes idle), and then the flyby's first frame compiled everything itself: the
// same black, measured 1.4 s -> 19 s under SwiftShader with warming() false at
// RACE!. So an unwarmed world gets the warm introBuild runs, under the card.
function introWarm(go) {
  const key = menuKey(trackIdx);
  if (!gfx.warm || (_warmKey === key && !(gfx.warming && gfx.warming()))) return false;
  const n = ++_introRun, settings = entrySettings();
  const live = () => n === _introRun && state === "menu" && settings === entrySettings() && key === menuKey(trackIdx);
  const info = loadingInfo(), cold = _warmKey !== key;
  if (cold) introCover(info, n); else studioOpen(n, info);
  let prepared = false;
  (async () => { try {
      if (cold) {
        // Cold: compilation owns the renderer — prepare under the cover, then garage-out.
        const ready = await introPrepare(live, key, info, n, true);
        if (!ready) return;
        if (ready.fly) _menuFly = ready.fly;
        _menuGate.warm = 0;
        if (_introSkip !== n) { studioOpen(n, info); await studioDone(live, n); }
      } else {
        // Warm world: garage-out and prepare overlap; never wait on prepare before studioDone.
        const prepP = introPrepare(live, key, info, n, false);
        await studioDone(live, n);
        const ready = await prepP;
        if (!ready) return;
        if (ready.fly) _menuFly = ready.fly;
        _menuGate.warm = 0;
      }
      if (!live()) return;
      prepared = true;   // afterGarageOut closes the held garage, then the race/session card
    } catch (e) { if (live()) { Log.warn("gfx", "intro warm failed", e); quitToMenu(); announce("PREPARATION FAILED — please retry", 5, "info"); } else if (n === _introRun) loadingScreen.stop(); }
    finally { afterGarageOut(n, key, go, prepared, live); }
  })();
  return true;
}
/** A start from a sheet that is not RACE SETTINGS (qualifying's GRID and DRIVE, a
 *  season's NEXT RACE): no flyby, but the card covers the build and hands off to
 *  the first presented frame, as it does after one — not a black canvas, then the
 *  HUD and the gantry over a frame the backend has not drawn yet. */
function startRaceCovered() {
  if (!loadingScreen.phase()) loadingScreen.building(loadingInfo());
  return startRace();
}
/** The same start for the sheets that sit over a FINISHED session (qualifying's TO THE GRID and DRIVE, a
 *  championship NEXT RACE): the garage drive-out, then the flyby, as every other route plays. raceIntro's
 *  paths gate on state "menu" and menuWorld(), so the sheet's state ("results" after a driven lap or a race)
 *  becomes "menu" with qualifying's classification, the flow and the built circuit kept (quitToMenu would
 *  clear them). Kept on startRaceCovered: agent / dev callers, a hidden or headless page, VS FRIEND. */
function startRaceFromSheet() {
  if (headlessMode || document.hidden || netPlay.active() || qualiNet.hasArmed()) return startRaceCovered();
  try {
    resultsCam.reset(); els.results.hidden = true; clearTimeout(flybyBuildTimer); _menuGate.generation++;
    setState("menu", "sheet-start");
    const def = Tracks.LIST[trackIdx];
    if (track && def && builtTrackId === def.id && builtTrackNight === sessionDarkFor(def) && builtGridSlots === fieldSize()) { _menuGate.track = track; _menuGate.ready = menuKey(trackIdx); }
    raceIntro(startRace);
  } catch (e) { Log.warn("game", "pre-race screen failed — starting straight away", e); cancelIntro(); loadingScreen.stop(); return startRaceCovered(); }
}
// An intro abandoned in the menu (its request went stale) must not leave a bare page: raceIntro hid the title.
function titleIfBare() { sheetRelease(false); if (state === "menu" && els.overlay.hidden && ![...document.querySelectorAll(".screen")].some((el) => !el.hidden)) els.overlay.hidden = false; }
// START RACE / PRACTICE START FROM RACE SETTINGS (_introSheet). The sheet stays up
// with PREPARING… while a warm compiles or the first garage frame presents — then
// studioShown hides it for the drive-out. The race card arrives with the flyby,
// not before the garage leave. A warm compiling at the tap owns the renderer
// (TLX presents nothing, 1-4 s on a real GPU): waited out under the sheet, bounded
// as awaitIntroWarm is. The menu's own build and warms stand down, as when the
// sheet closed.
function raceIntroFromSheet(go, sheet, btn) {
  if (_introSheet) return;   // already preparing (START is disabled: a synthetic second press)
  if (!sheet || !btn) { if (sheet) sheet.hidden = true; raceIntro(go); return; }
  const back = $("rs-cancel"), owner = _introSheet = { sheet, btn, back, label: btn.textContent };
  btn.disabled = true; btn.textContent = "PREPARING…"; if (back) back.disabled = true;
  clearTimeout(flybyBuildTimer); _menuGate.generation++;
  const failed = (e) => {
    if (_introSheet !== owner) return;
    Log.warn("game", "pre-race preparation failed", e); cancelIntro(); loadingScreen.stop();
    announce("PREPARATION FAILED — please retry", 5, "info");
  };
  const intro = () => { try { raceIntro(go); } catch (e) { failed(e); } };
  try { if (!(gfx.warming && gfx.warming())) { intro(); return; } } catch (e) { failed(e); return; }
  const n = ++_introRun, settings = entrySettings();
  const live = () => n === _introRun && state === "menu" && settings === entrySettings();
  (async () => { try {
    if (await awaitIntroWarm(live)) intro(); else if (_introSheet === owner) sheetRelease(false);
  } catch (e) { failed(e); } })();
}
function raceIntro(go) {
  // The card is the whole screen: the Data Hub's JUMP IN closes a dialog that sat OVER the title, which then showed round the card.
  els.overlay.hidden = true;
  const built = _introKey; _introKey = "";
  if (!built && !menuWorld() && introBuild(go)) return;
  if (!built && menuWorld() && introWarm(go)) return;
  if (!built && introGarage(go)) return;   // reduce-motion too: the garage-out at its tuned pace, then card + flyby (never skip)
  // Strict: never raise the race/session card while a garage-out is still live.
  if (_studio) {
    const n = _studio.n, key = menuKey(trackIdx);
    const live = () => n === _introRun && state === "menu";
    (async () => {
      try { await studioDone(live, n); afterGarageOut(n, key, go, true, live); }
      catch (e) { if (live()) { Log.warn("gfx", "garage-out wait failed", e); quitToMenu(); announce("PREPARATION FAILED — please retry", 5, "info"); } }
    })();
    return;
  }
  sheetRelease(true);   // no drive-out to give way to (or it was skipped): the flyby or the race does
  if (built && _introSkip === _introRun) _introSkip = 0;   // skipped in the garage: only the drive-out ends — the card and the flyby (skippable itself) always follow
  const world = menuWorld();
  if (world) menuGridCars();
  // A REAL RACE grids from its script at the lights (RealRace.arm), not in the
  // order menuGridCars seats: no slot to frame, and a mid-race join or a replay
  // has no standing grid at all, so its grid shots go (withoutGrid below).
  const real = realRace.intro();
  if (real) FlybySeq.setPlayerSlot(null, (cars || []).length);
  // LIGHT THE FLYBY WITH WHAT THE MENU CHOSE, BEFORE IT STARTS. run() fires `go`
  // (startRace) "once the card is up", and startRace only reaches
  // applyRaceSettings() after loadTrack() and makeCars() — so the whole cinematic
  // played over a world nothing had lit for THIS session yet: pick dawn, watch a
  // day loading screen. The TIME chip only calls scheduleFlybyTrack(), which
  // rebuilds geometry and resolves no lighting at all. applyRaceSettings() is
  // idempotent by construction (every lighting-slider tick re-runs it), so this
  // costs one pass and startRace still re-applies after its rebuild.
  if (world) applyRaceSettings();
  // And fly the shots the EDITOR saved, for the same reason: a list edited in
  // the pause menu is only read here, so every run picks up the latest one.
  reloadFlybyShots();
  const planned = world && _menuFly && _menuFly.track === track && _menuFly.key === _menuGate.ready ? _menuFly.shots : null;   // planned in the menu (menuFinish)
  if (planned && flybyShots && JSON.stringify(planned) === JSON.stringify(flybyShots)) flybyShots = planned;   // loadSaved parses again: reuse identical authored shots and their plans
  _menuFly = null;   // one load's flyby: the next one varies again
  if (!flybyShots) flybyShots = planned || FlybySeq.vary(FlybySeq.DEFAULT, (Date.now() ^ (trackIdx * 2654435761)) >>> 0);   // a different flyby each load (never the sim RNG); an editor-saved list plays as authored
  if (flybyShots) flybyShots = FlybySeq.withoutSlot(flybyShots);   // nobody knows your slot on a random grid; a small grid has empty boxes
  if (flybyShots && real && (real.watch || real.startLap > 1)) flybyShots = FlybySeq.withoutGrid(flybyShots);
  const info = loadingInfo();   // before the duration: a real race's read (info.readMs) may stretch the flyby
  // Habitual short flyby only after the backend's warm is done — shortening into
  // a still-compiling first frame was a freeze under a shorter card.
  const flyMs = loadingScreen.nextFlyMs(info.readMs, info.warmReady = !(gfx && gfx.warming && gfx.warming()));
  FlybySeq.setDuration(flyMs);   // plan every pan for the seconds this run has
  if (world) FlybySeq.warm(track, flybyShots);   // plan the opening shots now, the rest in slices before their cuts
  FlybySeq.reset();   // this run's shot 0 is a cut, not a glide from wherever the camera was
  loadingScreen.run(info, go);
}
/** WHAT THE LOADING SCREEN DESCRIBES: the circuit about to be raced, this
 *  session's settings, and whether there is a built world to fly over. Named
 *  rather than inlined at the one call above because the FLYBY EDITOR asks for
 *  the same object to preview the card against — and a second literal there
 *  would be a second description of the same race, free to drift from this one
 *  the next time a row is added to the card. */
function loadingInfo() {
  const real = realRace.intro();
  const out = {
    track: Tracks.LIST[trackIdx], laps: raceLaps,
    gp: real ? real.title : SeasonCal.gpName ? SeasonCal.gpName(Tracks.LIST[trackIdx]) : undefined,   // the 2026 REAL calendar renames two rounds (season-cal.js); a real race is its own event
    real,   // the Data Hub's real race (RealRace.intro): the event, whose car, from which lap — the announcer reads it
    weather: raceWeather, tod: raceTimeOfDay,
    // WHAT SESSION THIS IS, for the announcer (js/audio/announcer.js). It read
    // the same paragraph before a qualifying hour, a duel with a legend and a
    // Grand Prix, because none of this reached it.
    session, practice: isPractice(), duel: duelOn(), duelLegend, flow,
    // Only fly over a world that is actually built. A missed pre-build (a
    // circuit switched a moment ago, scenery still downloading) would put a
    // black hold where the cinematic should be, which reads as a hang.
    hasWorld: menuWorld(), shots: flybyShots, grid: (cars || []).map((c) => ({ code: c.code, colour: c.color, isPlayer: c === player && FlybySeq.slotKnown() })),   // the card's grid graphic + radio check: menuGridCars() seated `cars` in grid order
    readMs: 0,
  };
  if (real && announcer.readMs) out.readMs = announcer.readMs(out);   // the race-so-far read: the flyby stretches to it (LoadingScreen.flyMsFor)
  return out;
}
// ACTIVE AERO activation zones (js/physics/aero-zones.js) — pure circuit geometry.
aeroZ = AeroZones.create(G);
// Tyre marks (js/fx/skidmarks.js) — self-contained ring buffer + batched draw.
skids = SkidMarks.create();
const carFx = CarFx.create(G, { skids });   // plank sparks + AI lock-up marks (js/fx/car-fx.js)
DrivingLine.setMode(store.get("drivingLine", "full"));
// What the ribbon builder needs from the engine: the centreline sampler and
// the STATIC curvature LUT (a render-only read — docs/PHYSICS.md §curvature
// reads), plus the same physics numbers the AI's brake targets use, so the
// braking zones it shows are the ones the field actually brakes in. Rebuilt on
// a circuit change AND on a PACE change — DrivingLine caches by circuit id
// alone, so a new vTop needs the explicit reset() (the brake cue reads that
// same LUT, and stayed pinned to the pace the line was built at).
const _dlApi = { id: null, total: 0, track: null, sample: null, curvature: null, latMax: 0, brake: 0, accel: 0, vTop: 0, grip: 1 };
function drivingLineApi(trk) {
  if (_dlApi.track !== trk || _dlApi.vTop !== vTop()) {
    _dlApi.id = trk.def.id; _dlApi.total = trk.total; _dlApi.track = trk;
    _dlApi.sample = (s, out) => Tracks.sample(trk, s, out);
    _dlApi.curvature = (s) => Tracks.curvature(trk, s);   // wraps s itself
    _dlApi.lineAt = trk.line ? (s) => TrackLine.at(trk, s) : null;   // the baked racing line the AI drives
    _dlApi.latMax = PhysicsConsts.LAT_MAX; _dlApi.brake = PhysicsConsts.BRAKE; _dlApi.accel = PhysicsConsts.ACCEL;
    _dlApi.vTop = vTop(); _dlApi.grip = 1; DrivingLine.reset();
  }
  return _dlApi;
}
let rivalAudio = RivalAudio.create(G);   // the field around you, for GameAudio.setRivals (recreated after ensureAudio)
let carSfx = CarSfx.create(G);           // tyre scrub, lock-up, surface, pit limiter (recreated after ensureAudio)
// Photo mode (js/camera/photo-cam.js).
const photomode = Photomode.create(G), { updatePhotoCam, enterPhotoMode, exitPhotoMode } = photomode;
// LIGHTING TUNER panel UI (js/lighting/tuner-panel.js).
const { refreshLightTunePanel, closeLightTuner } = TunerPanel.create(G);
// CAMERA TUNER panel UI (js/camera/tuner-panel.js) — per-camera-mode framing offsets.
const { closeCamTuner } = CamTunerPanel.create(G);
// FLYBY SHOT EDITOR panel UI (js/camera/flyby-panel.js) — authors the pre-race
// shot list; previews through __apex.flybyCam, touches no render-path state.
const flybyPanel = FlybyPanel.create(G);
reloadFlybyShots();          // the menu's warm-up frames fly the saved list too
// Steering-tuning sliders + presets (js/input/steer-tuning.js).
const { applySteerTuning } = SteerTuning.create(G);
// Rapier debris side-world (js/physics/debris-world.js) — render-only, opt-in,
// inert (a single boolean check) unless enabled via apex26.debris/__apex.debris.
DebrisWorld.create(G);
// R2/R3/C1 bounded-takeover incident sim (js/physics/incident-sim.js) — the ONLY
// additive-Rapier layer allowed to move a car, and only inside a bounded,
// flagged, fallback-guarded window (extends the sacred xPinned + (prog,x)
// exceptions). Inert (owns() is a Set read) unless a flag is on AND the debris
// side-world is live. DEFAULT ON per feature (apex26.r2Airborne/r3Contact/c1Pileup).
const incidentSim = IncidentSim.create(G);
// Car-to-car contact (js/physics/collide.js). collideFx stays here (shake /
// hit-stop are camera state) and rides in as the second argument, not a G member.
const collide = Collide.create(G, collideFx, (c) => realRace.owns(c));
// Two-player racing (js/net/netplay.js) and the VS FRIEND lobby
// (js/net/lobby.js) — LAZY_NET, so neither exists until ensureNet() runs.
// These are `let`, and every reader goes through the G.netPlay / G.netLobby
// GETTERS, so the swap below is invisible to all 25 call sites.
//
// THE STUBS ARE NOT PLACEHOLDERS, THEY ARE THE SOLO BEHAVIOUR. netPlay is
// called at 20 sites here and only three are `netPlay && …` guarded (tick() is
// in the frame loop), so an absent object is a crash mid-race — which is why
// this is a null object rather than 17 new guards. The values are the real
// module's answers with `active` false, and two of them are TRUE:
// ownsRaceControl/ownsClassification are `!active || role === "host"`, i.e. a
// game with no session owns everything. Returning false there would silently
// stop a solo race classifying its own result — the one mistake in this file
// that no crash would announce, and what net-stub-surface.test.mjs pins.
let netPlay = {
  active: () => false, owns: () => false, role: () => null,
  ownsRaceControl: () => true, ownsClassification: () => true,
  awaitingStart: () => false, awaitingResult: () => false,
  rivalDriverIds: () => [], peerLaps: () => [], peerResult: () => null,
  predict: () => null, status: () => ({ active: false, role: null }),
  tick: () => {}, stop: () => {}, hostStart: () => {},
  start: () => ({ ok: false, error: "no_net", message: "Multiplayer is not loaded." }),
  reportLap: () => {}, reportResult: () => {}, reportCaution: () => {},
  reportQuali: () => {}, reportQualiLive: () => {},
  sendEvent: () => false, onEvent: () => false,
};
let netLobby = {
  // wire() is called at boot and open() from VS FRIEND. Inert wire() is
  // correct: there is no #vsfriend handler to bind until the real lobby lands,
  // and ensureNet() calls the real wire() before it hands over.
  wire: () => {}, open: () => {}, close: () => {}, cancel: () => {},
  abortQuali: () => {}, qualifying: () => false, roomChanged: () => {}, setReady: () => {},
  peerSeats: () => [], roomState: () => ({ open: false, role: null, peers: [] }),
  status: () => ({ role: null, connected: false }),
  reportQuali: () => {}, reportQualiLive: () => {}, openFromUrl: () => false,
};
// C2 visual suspension (js/physics/body-attitude.js) — render-only cosmetic chassis
// pitch/roll/heave springs; DEFAULT ON, disable via apex26.bodyAttitude/__apex.bodyAttitude.
const bodyAttitude = BodyAttitude.create(G);
// MUSIC & SOUND panel (js/audio/panel.js) — the mixer screen, the ♪
// master button and the audio-settings persistence. create() wires the DOM;
// init() runs at the boot-restore position near the end of this file.
let audioPanel = AudioPanel.create(G);   // stub at boot; real panel after ensureAudio

function teamById(id) { return Teams.LIST.find((t) => t.id === id); }
function cssCol(c) { return "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")"; }
// Convert between an <input type=color> hex string and a [r,g,b] 0..1 array.
function hexToArr(h) { const n = parseInt(String(h).slice(1), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function arrToHex(a) { const f = (v) => ("0" + Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16)).slice(-2); return "#" + f(a[0]) + f(a[1]) + f(a[2]); }
// Arm-then-confirm for destructive buttons — the career slot DELETE→DELETE?
// pattern, lifted so the livery ✕ and a mid-season APPLY stop being the only
// irreversible actions in the app with no confirmation. First press arms the
// button in place (label swap + .armed, no modal, no reflow); the second runs
// the action. Returns true when the action ran. Disarm is the caller's rebuild
// or any other click path replacing the node.
function armConfirm(btn, armedText, action) {
  // An aria-label outranks the text, so a labelled button (the livery ✕) was
  // announced unchanged when armed; the armed state goes into the name too.
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

// Every menu layer, gone. Until multiplayer, startRace() could name the three
// screens a race is reachable FROM, because the player pressing GO was
// standing on one of them — but in a VS FRIEND race the HOST owns lights-out,
// so the guest can be anywhere when it lands, and any fixed list silently
// falls off the next screen. So this asks the DOM which layers exist: `.screen`
// is what every full-screen menu and modal is marked with; #overlay (the
// title screen) and the two tuner panels predate the class and are named
// individually.
function clearMenuScreens() {
  cancelIntro();
  // Disarm the loading screen BEFORE the sweep hides it: it holds a pending
  // timer that would otherwise fire its build callback into a running race.
  loadingScreen.stop();
  FlybySeq.cancelWarm();   // and the flyby's unplanned shots: they would only stall the countdown
  for (const el of document.querySelectorAll(".screen")) el.hidden = true;
  for (const id of ["overlay", "lighting", "camtune", "flyby"]) { const el = $(id); if (el) el.hidden = true; }
  // The garage's 3D turntable keeps rendering while #carsetup is up; a race
  // starting under it must stop that, or the preview draws over the track.
  setupPreviewOn = false;
  // Nothing to go back TO any more — the room this came from is now a race.
  raceSettings.setNetRoom(false);
  garageReturn = "select";
}

// The mql is only the CHANGE TRIGGER; ACTIVE is read off computed display so
// css/responsive.css owns the whole condition once — the duplicated 743px
// query here could drift (blocker painting while aria-hidden). Cheap call rate.
const rotateBlockMql = window.matchMedia ? window.matchMedia("(orientation: portrait) and (pointer: coarse) and (max-width: 743px)") : { matches: false };
function syncRotateBlocker(moveFocus) {
  const box = $("rotate-device"); if (!box) return false;
  // Measured WITHOUT css/responsive.css's pause-card rule (body.rotate-measure):
  // that rule hides the gate while the card is up, and the card is what this
  // function decides to hide — read through it, the gate could never return.
  // Guard when there is no document (node VM harnesses / photomode-hold).
  const body = typeof document !== "undefined" ? document.body : null;
  if (body) body.classList.add("rotate-measure");
  const active = getComputedStyle(box).display !== "none";
  if (body) body.classList.remove("rotate-measure");
  box.setAttribute("aria-hidden", active ? "false" : "true");
  // The pause CARD and an active blocker never share the screen. #pausemenu is
  // a modal <dialog> (TopModal), so left open it sits in the top layer ABOVE
  // the z-9000 blocker — visually over it, and refusing focus to anything
  // outside itself: the OPEN CONTROLS roundtrip landed on RESUME instead of
  // back on the blocker's button. `paused` survives; the card returns the
  // moment the blocker leaves (rotate to landscape mid-pause and it is there).
  // A live race does not run on behind the blocker: turning the phone upright
  // mid-race must not leave the field (and TOUCH's auto-throttle) racing on.
  // rotateBlockMql as well as the box: a DOM with no stylesheet (the node
  // game-vm harness) reads every display as shown, and would pause every race.
  if (active && rotateBlockMql.matches && !paused && (state === "race" || state === "count") && !netPlay.active()) setPaused(true, "rotate-block");
  if (paused) els.pausemenu.hidden = active || photoMode;
  if (active && moveFocus) requestAnimationFrame(() => {
    const first = $("rotate-controls"); if (first && getComputedStyle(box).display !== "none") first.focus();
  }); return active;
}
if (rotateBlockMql.addEventListener) rotateBlockMql.addEventListener("change", () => syncRotateBlocker(true));
else if (rotateBlockMql.addListener) rotateBlockMql.addListener(() => syncRotateBlocker(true));

function quitToMenu() {
  Ghost.flush(); resultsCam.reset(); replayBuf.clear(); cancelIntro();
  if (typeof InputGhost !== "undefined") InputGhost.flush();
  if (photoStudio) photoStudio.close(false); if (uiExperience) uiExperience.stopHome();
  sessionEntry.cancel();
  qualiSheet.close();
  _ltBase = null; _ltFlash = 0;   // the lightning's saved race base is not the menu's
  if (announcer.stop) announcer.stop();   // results commentary must not outlive the race
  shake = 0; hitStop = 0;
  PerfGov.sentinelArm(false); netPlay.stop("local"); hideCamPicker(); Input.unlockLandscape();   // inactive: forgets a stale disconnect reason
  mirrorPass.cancelPreparation();
  closeLightTuner(false); _ltNextT = 0; _thunderT = -1;   // a queued strike or thunder is not the menu's either
  closeCamTuner(false); flybyPanel.closeFlyby(false); exitPhotoMode();
  // THE PRE-RACE SCREEN OUTLIVES A FAILED START without this: its only other
  // stop is clearMenuScreens(), which startRaceBody() reaches near the END of
  // its work, so a throw before that lands in startRace()'s `.catch` here and
  // left the flyby active() for the session — capture listeners attached, and
  // menuBlank and the per-car draw break both gate on !active(). Idempotent.
  loadingScreen.stop();
  setState("menu", "quit"); paused = false; raceCtl.reset(); wxArc.endSession(); daily.stop(); realRace.stop(); flyingStart.stop();   // no SC/VSC (or a half-run weather arc) left flying for the next race
  // A netplay lights-out instant is consumed by the countdown (the
  // `netStart = null` at its end). Quitting BEFORE that consumption stranded
  // it, and the next SOLO race read an `at` already in the past: countT
  // jumped past the lamps and the race began with no countdown at all.
  netStart = null;
  $("quali").classList.remove("q-done"); document.body.classList.remove("in-race", "rotate-help-open");
  syncRotateBlocker(false);
  dropRaceWake();
  setHudUserHidden(false);   // clear clean-screen mode on exit
  els.hud.hidden = true; els.lights.hidden = true; els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  els.pausemenu.hidden = true; els.results.hidden = true; els.announce.hidden = true; announceT = 0; _annPri = 0; _annFloor = 0; _annQueue.length = 0;   // the announce drain has no state gate: a queued race message re-showed itself over the title screen
  // ...and the RADIO around that card. Its bed was stopped only by RadioVoice's
  // #announce observer, which is the VOICE's teardown and does not exist at all
  // on a browser with no speechSynthesis — so quitting mid-transmission left the
  // hiss running over the title screen. The sting is GameAudio's, so it ends here
  // with everything else rather than borrowing another module's lifetime.
  // Spotter pack is not RadioVoice.current — hiding #announce never pack.stop()s
  // it; update() never reaches raceRadio after state=menu. halt() cuts every channel.
  radioVoice.halt();
  GameAudio.radioStingStop();
  $("advanced").hidden = true; $("lighting").hidden = true; $("audioset").hidden = true;
  els.overlay.hidden = false;
  $("race-settings").hidden = true;
  Particles.rainShow(false);
  // (#soundbtn returns with #overlay above — no write needed.)
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  if (soundOn) GameAudio.startMusic(-1);
  // Back at the title screen no session is running, so drop back to the neutral
  // mode. Every entry point (#mb-race/#mb-tt/#mb-season/#mb-career) sets flow and
  // session for itself, so this only stops a half-finished career leaking into the
  // next thing the player presses. The championship SAVES are untouched — what
  // makes the CONTINUE buttons appear is `season`/`career`, not the mode.
  setFlow("gp"); session = "race"; practiceMode = false; tyres.setLevel(raceTyreWear);   // practice is per-session; a time trial / Daily left the tyre model "off" (gridUp)
  quali.clear();   // memory only — persist stays until award/abort so CONTINUE keeps the grid
  qualiNet.clearPeers();
  // Title QUIT leaves the session: cancel() tears RTC down; q-back keeps abortQuali().
  qualiNet.hasArmed() ? qualiNet.resetOnQuitWithCancel() : qualiNet.resetSoft();
  try { IncidentSim.reset(); } catch (_) { /* module absent */ }
  try { DebrisWorld.reset(); } catch (_) { /* module absent */ }
  try { delete document.documentElement.dataset.team; } catch (_) { /* no DOM */ }
  // …and drop the career championship alias with it, so STANDINGS on the title
  // screen describes the standalone season again.
  season = SeasonCal.load();
  // Standings once an active season has scored. hasProgress(), not `round > 0`:
  // a sprint banks points while its round is still open (js/career/season-cal.js).
  const hasSeason = SeasonCal.hasProgress(season) && season.round < SeasonCal.rounds();
  $("mb-standings").hidden = !hasSeason;
  refreshCareerButton();
  consumeGhostHash();   // a #ghost= link deferred while racing lands now (no-op without one)
  CustomTracks.consumeTrackHash();   // same for a #track= share link (opens the designer; no-op without one)
  // ...and so does a #vs= invite link the lobby deferred (racing / in a room).
  if (/[#&]vs=/.test(location.hash)) ensureNet().then((ok) => { if (ok) netLobby.openFromUrl(); });
}


// ---------- per-frame update ----------
// Reusable rank buffer — refilled and sorted each physics step (up to 5x per
// rendered frame) so we don't allocate a fresh array via cars.slice() each time.
const ranked = [], byProgDesc = (a, b) => b.prog - a.prog;   // hoisted: no comparator closure per step
// Live weather (setWeatherLive/setTimeOfDay) and the dynamic weather arc live in
// js/race/weather-arc.js — WeatherArc.create(G, deps), wired as `wxArc` above.

const _engArg = { slip: 1, ax: 0, onKerb: false, wet: false, tow: 0,
                  deploy: 0, energy: 1, ersDeploy: 0.5, throttle: 1, brake: 0, regen: 0.5 };  // setEngine reads synchronously
let _audioParamStep = true;   // tickBody clears it on all but a frame's last physics step
function update(dt) {
  // Camera cycling works during the countdown and the race (set your view before
  // lights-out). Edge-triggered via the C key or the CAM button.
  if ((state === "race" || state === "count") && Input.consumeCameraCycle()) cycleCam();
  realRace.update(dt);   // every state: it arms in the countdown, places a mid-race jump-in on the first green frame, steps the script in the race, and stands down at the results
  flyingStart.update(dt);   // qualifying and time trial: a rolling start in place of the gantry (js/race/flying-start.js)
  /* MANUAL RECOVER. The auto-rescue only fires on its own terms (held throttle
     and no movement, wrong way, off-track for long enough), so a car wedged
     somewhere it considers fine — nose-in against a barrier, facing the right
     way, technically moving — had no way out but RESTART. R is the near
     universal bind for this across Forza, PolyTrack and Slow Roads.
     Race only: there is nothing to recover from during the countdown, and the
     same call mid-count would hand the player a free re-place on the grid. */
  if (state === "race" && Input.consumeRecover() && player && !player.retired && !realRace.owns(player)) {
    // A saved practice checkpoint makes RECOVER the driver's TRY AGAIN; coach.retry() is false everywhere else.
    // No banner: rescuePlayer() is the one place a recovery is reported, so one
    // keypress never gets the same word from two speakers (COACH and RADIO).
    // Pit lane / box: x = 0 would strand the car on the racing surface, still pitState lane/box (as the auto-rescue refuses).
    if (!coach.retry() && !(pits.inLane(player) || player.pitState === "box")) rescuePlayer(player);
    Log.info("game", "manual recover");
  }
  if (state === "count") {
    // In a session the countdown is driven by the SHARED clock rather than by
    // accumulated dt, and the random hold is dictated by the host. Both matter
    // for fairness: accumulating dt independently lets the two grids drift
    // apart by however long the handshake took, and an independently rolled
    // hold would give one driver lights-out before the other. netStart pins
    // the exact moment both cars are released. Solo, this branch never runs.
    if (netStart) {
      startHold = netStart.hold;
      countT = (COUNTDOWN_S + startHold) - (netStart.at - netStart.now()) / 1000;
    } else if (netPlay && netPlay.awaitingStart && netPlay.awaitingStart()) {
      // NOBODY COUNTS DOWN UNTIL THE MOMENT IS NAMED.
      //
      // Falling through to `countT += dt` here meant a peer ran an entirely
      // independent countdown, with its own random hold, from whenever its own
      // lights appeared — which is precisely what netStart exists to prevent.
      //
      // Both roles hold, not just the guest. The host names the moment itself,
      // but not until every guest reports its circuit built, and a host that
      // free-ran until then would be SEVERAL LAMPS INTO the sequence when the
      // shared instant finally arrived. countT would drop backwards, lightsLit
      // is monotonic, and the gantry would sit frozen mid-count before
      // resuming. Deriving both sides from the one instant is the whole point.
      //
      // The wait is real on the host — it lasts as long as the slowest guest's
      // circuit build — so say so rather than showing a dead gantry. It decays
      // and hides itself once netStart lands.
      // The card refreshes every ANN_MIN_S; its squelch and speech only on the first show and then every 30 s.
      if (announceT <= 0) { const t = performance.now(), loud = !(t - announce._waitAt < 30000); if (loud) announce._waitAt = t; announce("WAITING FOR PLAYERS…", 1, "info", null, !loud); }
    } else {
      countT += dt;
    }
    const lit = Math.min(COUNTDOWN_S, Math.floor(countT));
    if (lit > lightsLit) {
      // Light EVERY lamp up to `lit`, not just the newest. countT can advance
      // by more than one second in a frame — a networked countdown is pinned to
      // a shared instant rather than accumulated from dt, so a peer that was
      // busy building its circuit rejoins the sequence part-way through — and
      // lighting only children[lit-1] left the earlier lamps dark forever. The
      // guest saw an unlit gantry and then, abruptly, a green track.
      for (let i = lightsLit; i < lit; i++) if (els.lights.children[i]) els.lights.children[i].classList.add("on");   // a harness gantry may be short
      lightsLit = lit;
      if (soundOn) GameAudio.lightOn(lit - 1);
      if (lit === 1) Input.calibrate();
      // all five lit — hold for a randomised beat, as in real F1, so the
      // start can't be timed and lights-out is a genuine reaction moment.
      if (lit === COUNTDOWN_S && !netStart) startHold = 0.2 + simRnd() * 1.8;
    }
    if (lightsLit === COUNTDOWN_S && countT > COUNTDOWN_S + startHold) {
      setState("race", restartPending ? "restart-green" : "lights-out");
      if (!restartPending) raceT = 0;   // a red-flag restart resumes the clock the flag stopped
      launchT0 = raceT;   // …so the launch model measures from THIS green, not the first one
      // A NETWORKED RACE KEEPS WALL TIME from the shared green (netStart.at is
      // that instant on OUR clock), offset by the clock a red-flag restart resumes
      // from. raceT only summed simulated dt, which loses time to a backgrounded
      // tab (no frames — developer.chrome.com/blog/timer-throttling-in-chrome-88),
      // the 0.25 s dt clamp and the 5-step cap: a guest who switched apps for 5 s
      // crossed the line 5 s behind on the road and was classified 5 s AHEAD,
      // because finish times from two drifting clocks were compared as one.
      netGreen = netStart ? { base: netStart.at - raceT * 1000, now: netStart.now } : null;
      els.lights.hidden = true;
      for (const l of els.lights.children) l.classList.remove("on");
      netStart = null;              // consumed; never carry it into the next race
      // LOWERED BEFORE THE THROWABLE WORK BELOW, read from a local afterwards:
      // lightsOut() builds WebAudio nodes behind a guard that checks `ctx`
      // exists but not `ctx.state`, so a context the browser closed under us
      // threw and latched the flag — and stuck true it skips `raceT = 0` on
      // every later race and suppresses quali flying laps. Ledger 2026-09-22.
      const wasRestart = restartPending;
      restartPending = false;
      // Nothing consumes RECOVER/shift/boost edges before green, so a tap on the grid fired at lights-out (a free ~58 km/h re-place, or 2nd gear with no drive).
      Input.clearDriveEdges();
      announce("LIGHTS OUT!", 1.4, "race");
      if (soundOn) GameAudio.lightsOut();
      // Qualifying normally never gets here: js/race/flying-start.js rolls the
      // car in at speed on the first countdown frame. Only a start it declined
      // reaches the gantry, and then the lap is driven from the line.
      if (isQuali() && !wasRestart) launchFlyingLap();
    }
    _gridIdleOpts.soundOn = soundOn; _gridIdleOpts.wet = isWetRoad(); _gridIdleOpts.step = _audioParamStep;
    GameAudio.setGridIdle(player, _gridIdleOpts); return;
  }
  if (state !== "race") return;
  if (!realRace.owns(player)) raceT += dt;   // WATCH's transport owns its clock, including paused seeks
  if (netGreen && !netPlay.active()) netGreen = null;   // the rival left: a solo pause must not add its wall time on resume
  if (netGreen) {   // never runs BEHIND the shared clock; never ahead of it (the sim cannot outrun wall time)
    const w = (netGreen.now() - netGreen.base) / 1000;
    if (Number.isFinite(w) && w > raceT) raceT = w;
  }
  // THE RED PROCEDURE ENDS EXACTLY ONCE, so its clean-up cannot ride on the
  // re-grid alone: takeRestart() consumes the request either way, and
  // redFlagRestart() declines once any car has finished — ordinary, not exotic.
  // That combination froze the field for RED_STOP+RED_HOLD, dropped to green
  // with the debris still there, and (finished never clears) raised the same
  // dead red every CAP_REARM_HOLD for the rest of the race. Ledger 2026-09-22.
  if (raceCtl.takeRestart()) {
    raceCtl.clearHold();            // both branches below clear the surface this tick
    if (redFlagRestart()) return;   // re-gridded, lights re-armed
    IncidentSim.reset(); DebrisWorld.reset(); DebrisWorld.prime();
  }
  wxArc.tick(dt);   // dynamic weather progression (no-op unless an arc is armed)
  _atmo.tick(dt);   // the lighting cross-fade a weather-arc step started (no-op otherwise)
  checkRetirements();
  // ranks by progress (reuse module-scope buffer, no per-step allocation).
  // RETIREMENTS ARE NOT IN THE FIELD. Dropping them here is one exclusion that
  // does four jobs: the HUD position stops counting a parked car, the AI stops
  // treating it as a blocker, resolveCollisions leaves it where it was put, and
  // the overtake target walks past it — all of which would otherwise need their
  // own `c.retired` check and one of them would eventually be forgotten.
  ranked.length = 0;
  for (const c of cars) if (!c.retired) ranked.push(c);
  ranked.sort(byProgDesc);
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i + 1;
  }
  if (!isPractice() && !isQuali() && !realRace.owns(player)) scPassCall(scWatch.tick(player, ranked, raceCtl.level, dt));

  // Leading human for AiBand catch-up (scripted mode ignores). Once per step.
  _leadHuman = null;
  // !finished: a flagged human coasts on advancing prog — don't band toward it.
  for (const c of cars) if (c.human && !c.retired && !c.finished && (!_leadHuman || c.prog > _leadHuman.prog)) _leadHuman = c;

  // Traffic scans read last step's poses. Writing prog/x/speed inside
  // updateCar and then scanning the next car made a side-by-side look like a
  // pass in array order.
  for (let i = 0; i < cars.length; i++) {
    const s = cars[i];
    s._snapProg = s.prog; s._snapX = s.x; s._snapSpeed = s.speed;
  }
  // One wrap-aware fill for the whole field; each updateCar walks adjacent
  // buckets (plus extra for mirrorReach / OT window). Not a rank-neighbour
  // walk: a lapped car is a lap away in ranked[] and beside you on the road.
  if (track && ranked.length) Collide.fillArcBuckets(ranked, track.total, TRAFFIC_BUCKET_M, _snapProgOf);
  RaceControl.beginLineStep(cars);
  for (const c of cars) updateCar(c, dt, ranked);
  RaceControl.settleLineStep();   // finishers cannot be promoted to a new incident

  collide.resolveCollisions(ranked, dt);

  // Rapier debris side-world: reads car poses (kinematic mirrors), owns only
  // its own shards, writes NOTHING back to gameplay. Inert unless enabled.
  //
  // Incident sim (R2/R3/C1): preStep promotes any triggered takeover to a Rapier
  // dynamic body BEFORE the world steps (DebrisWorld then skips posing it);
  // postStep reads the 6-DoF pose back into the owned car(s) and hands each back
  // once it settles. postStep runs unconditionally so an in-flight takeover is
  // always progressed / degraded to bespoke, even if the side-world was just
  // disabled mid-incident.
  if (DebrisWorld.active()) {
    incidentSim.preStep(dt);
    DebrisWorld.step(dt);
  }
  incidentSim.postStep(dt);
  RaceControl.endLineStep();

  // B1 — debris caution: consume hazards() and drive the local-yellow / VSC / SC
  // flag state (READ-ONLY; never slows or moves a car). Self-guarding + throttled.
  updateCaution(dt); coach.update(dt); raceRadio.update(dt);

  // Race-control owns the finish policy as well as neutralisation rules. In a
  // human race an AI/other player crossing first must NOT start a 3.5 s result
  // countdown while somebody is still driving. The hard time cap remains the
  // bounded escape hatch for an unfinished or stale participant.
  if (resultT === 0) {
    resultT = RaceControl.finishDelay(cars, raceT, lapsTarget, realRace.raceT0());
    // A GUEST holding the host's classification is done once ITS car is: its
    // view of the host's car can lag or disagree (a finish still in flight, a
    // pose lost to extrapolation), and waiting on that view meant the host's
    // race ended while the guest drove on to the 360 s/lap hard cap.
    if (resultT === 0 && netPlay.active() && !netPlay.ownsClassification() && player && (player.finished || player.retired) && netPlay.peerResult()) resultT = 0.5;
  }
  if (resultT > 0) {
    resultT -= dt;
    if (resultT <= 0) {
      // In a session the guest waits (briefly, and boundedly) for the host's
      // classification rather than publishing its own — see awaitingResult.
      if (netPlay.awaitingResult()) resultT = 0.05;
      else { resultT = 0; endRace(); }
    }
  }

  // `&& player`, and it is not defensive noise: startRace already documents that
  // player can be null ("roster/team resolution miss") and guards ITSELF, but
  // this block dereferenced it unguarded — and startRace is now async (it awaits
  // ensureScenery), so there is a real window where update() ticks before
  // makeCars has run. A throw here is not a dropped frame: it escapes tick()
  // before the requestAnimationFrame re-schedule, so the render loop dies for
  // the rest of the session. Measured: __apex.race() + go() left the canvas at
  // ZERO draws a frame, permanently. docs/PERF-FINDINGS.md 2i.
  // Continuous audio parameters (engine, skid, brake cue, rivals) are set on the
  // LAST physics step of a frame only: each call is a setTargetAtTime insertion
  // on the audio thread, and a 2-5 step frame on a slow device paid them 2-5x
  // for values only the last step's survive. carSfx keeps every step (edges).
  if (soundOn && player && _audioParamStep) {
    const revFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
    _engArg.slip = player.slipFactor ?? 1; _engArg.ax = player.axEstSm ?? 0;
    _engArg.onKerb = !!player.onKerb; _engArg.wet = isWetRoad(); _engArg.tow = player.towing || 0;
    // ERS state for the deploy whine: continuous, charge-scaled, part-flavoured.
    _engArg.deploy = player.deploying ? 1 : 0; _engArg.energy = player.energy ?? 1;
    _engArg.ersDeploy = player.ersDeploy ?? 0.5;
    _engArg.throttle = player.throttleDemand ?? 0; _engArg.brake = player.brakeDemand ?? 0;
    _engArg.regen = player.ersRegen ?? 0.5;
    GameAudio.setEngine(revFrac, player.deploying ? 1 : 0, player.offroad,
      clamp(player.speed / vTop(), 0, 1), player.gear, _engArg);
    // Squeal from the CAR's slip, via the same skidIntensity the marks and smoke
    // use, never the road's curvature (|k| * speed): that squeals every corner
    // whether or not the car is sliding and leaves a genuine slide down a
    // straight silent — the most audible arc-coupling in the game.
    GameAudio.setSkid(player.skidIntensity || 0, isWetRoad());
    // THE BRAKING CUE. Driven from the sim tick and not the draw, because it is
    // the one part of the driving line that has to work with the line OFF — a
    // player who cannot read the ribbon is exactly who it is for. DrivingLine
    // supplies the urgency from the same over = speed/lineSpeed the shaders
    // colour with, so the beep and the red arrive together.
    // ONE producer: the slider cue (BrakeCue.tick) owns the pulse while it is on.
    if (DrivingLineOpts.brakeCue() && !BrakeCue.on()) GameAudio.brakeCue(track ? DrivingLine.cue(Math.abs(player.speed), player.s) || 0 : 0);
    // The field around you: panned, distance-rolled and Doppler-shifted. Before
    // this there was no opponent audio at all, so a car alongside was silent.
    GameAudio.setRivals(rivalAudio.collect(player));
  }
  if (soundOn && player) carSfx.update(player);
}

const _aiBoost = { traits: null, energy: 0, otActive: false, kAhead60: 0, towCar: false, towGap: 0, towSpeed: 0, speed: 0, chaser: false, chaserGap: 0, chaserSpeed: 0, team: null, seat: 0, stats: null, ersDeploy: 0, ersRegen: 0 };
const _aiOtFire = { traits: null, blockerGap: 0, gapAhead: 0, roomL: 0, roomR: 0, speed: 0, aheadSpeed: 0, kAhead: 0, street: false, team: null, seat: 0, stats: null, other: null, vTop: 0 };
// AI lateral controller (updateCar, "--- lateral ---"): heading state, not a
// position P-loop. Tunables, not model numbers — see the block for the why.
const AI_PASS_LATCH_M = 16;    // m: the pass latch's window, read by BOTH ends. The release always
                               // dropped the latch past it; the engage had no gap term, so half of all
                               // engagements began already outside it (docs/notes/AI-FIELD-RESEARCH.md).
const AI_HEAD_VMIN = 6;        // vStd m/s: below this the position controller drives (dig-out, pit crawl)
const AI_XTRACK_GAIN = 2.5;    // 1/s: Stanley cross-track gain, ~0.4 s to close an error
const AI_HEAD_MAX = 0.45;      // rad: the heading a car may hold off the road tangent
const AI_YAW_LAT = 0.6;        // share of LAT_MAX·grip the heading change may spend (a_lat = v·yawRate)
const AI_YAW_MAX = 1.2;        // rad/s: yaw-rate cap at crawl speeds
const AI_BIAS_SLEW = 3.0;      // m/s: how fast a pass / defend / yield / separation bias may move the target
// WallClamp.apply's ctx, pooled like _aiBr: a fresh literal + addShake closure per car per tick was ~1,300 objects/s at 22 cars.
const _wallCtx = { track: null, dt: 0, steer: 0, postLim, smp, wrapS, worldFromTrack, soundOn: false, incidentSim, addShake(d) { shake = Math.min(1, shake + d); } };
const _aiBr = { traits: null, samples: null, latMax: 0, aeroLoad: 0, brake: 0, grip: 0, speed: 0, blocker: false, blockerGap: 0, blockerSpeed: 0, roomL: 0, roomR: 0, team: null, seat: 0, stats: null, errMul: 1 };
const _aiLane = { traits: null, nearby: 0, roomL: 0, roomR: 0, street: false, baseLane: 0, queueT: 0 };
const _aiWantX = { armed: true, team: null, seat: 0, stats: null, energy: 0, catching: false, otActive: false };
const _aiOtPull = { street: false, traits: null, speed: 0, team: null, seat: 0, stats: null, blockerSpeed: 0, blockerGap: 0, roomL: 0, roomR: 0, other: null, kAhead: 0, lane: 0, freeSpeed: 0, blockerVmax: 0, vTop: 0, blockerAccel: 0, attackQ: 0, toTurnIn: 0, kTurn: 0, calm: 0, roll: 0.5, queueT: 0 };
const _aiDefend = { street: false, traits: null, speed: 0, team: null, seat: 0, stats: null, chaser: false, chaserGap: 0, chaserSpeed: 0, kA: 0, roomL: 0, roomR: 0, other: null, blocker: null, blockerGap: 0, kTurn: 0, toTurnIn: 0, roadL: 0, roadR: 0, x: 0 };
const _aiBoxed = { contactT: 0, roomL: 0, roomR: 0, blocker: null, blockerGap: 0, street: false };
const _aiDefOnce = { defend: 0, side: 0 };
const LCAR = Collide.LCAR, WCAR = Collide.WCAR;   // car box (js/physics/collide.js)
const TRAFFIC_BUCKET_M = TOW_RANGE;
function _snapProgOf(c) { return c._snapProg; }
function _otSkipLane(o) { return pits.inLane(o); }
const _floodRGB = [0, 0, 0];   // reused floodScale vector (was a fresh [r,g,b] each frame)
const _alRGB = [0, 0, 0];   // always-on lights: the per-frame colour triple
// Collision feedback when the player is involved, scaled by impact (0..1).
function collideFx(a, b, impact) {
  Damage.contact(a, b, impact, track.total);   // every pair, before the player-only gate: DISPLAY ONLY (js/race/damage.js)
  if (!a.isPlayer && !b.isPlayer) return;
  const pc = a.isPlayer ? a : b;
  if (pc.collideT > 0) return;
  impact = clamp(impact, 0.12, 1);
  if (soundOn) GameAudio.collision(impact);
  shake = Math.min(1, shake + impact * 0.45);
  hitStop = Math.max(hitStop, impact * 0.015);   // barely any freeze, so contact doesn't feel like a stop
  pc.collideT = 0.35;
  // Career reads these at settlement. Counted HERE because this hook is already
  // player-only and already debounced at 0.35 s, so one shunt is one count
  // rather than one per relaxation pass. Nothing in physics reads them back.
  pc.hits = (pc.hits | 0) + 1;
  pc.hitSev = Math.max(pc.hitSev || 0, impact);
  // Visual-only spark cue: render() consumes this flag and fires a Particles
  // burst at the car's world position (collideFx has no world coords here).
  // Never read by physics — headless runs are unaffected.
  pc.fxSparkI = Math.max(pc.fxSparkI || 0, impact);
  Input.vibrate(18 + impact * 50);
  Input.rumble(0.4 + impact * 0.6, 120, "handles");
}

function updateCar(c, dt, ranked) {
  // A retirement is out of the race: no driving model, no coast, no lap timing.
  // It stays exactly where retireCar() parked it until the flag.
  if (c.retired) { c._prevS = c.s; c.skidIntensity = c.wheelLock = c.brakeDemand = c.throttleDemand = c.towing = c.wake = 0; c.deploying = false; c.collideT = Math.max(0, c.collideT - dt); return; }   // the cues below are about driving: zero them, or squeal / smoke / marks / the ERS whine freeze at the last value until the flag
  // A net-owned rival takes no local motion, finished or not: coasting it here
  // fought poseRemote every tick (jitter, prog drift). See js/net/netplay.js.
  // The revs follow the coast DOWN in the gear it crossed in (a lift, not a downshift ladder):
  // returning before `c.rpm = rpmFor(...)` below held the crossing's revs — flat out on the
  // limiter — while coast() bled the car to a crawl (setEngine / RivalAudio read c.rpm).
  if (c.finished && !netPlay.owns(c)) { pits.update(c, dt); coast(c, dt); c.rpm = rpmFor(c.gear || 1, Math.max(0, c.speed || 0)); c._prevS = c.s; c.skidIntensity = c.wheelLock = c.brakeDemand = c.throttleDemand = c.towing = c.wake = 0; c.deploying = false; c.collideT = Math.max(0, c.collideT - dt); return; }
  // Incident-sim takeover (R2/R3/C1): while Rapier owns this car's 6-DoF body,
  // the bespoke integration + wall clamp + collision writeback are SKIPPED —
  // postStep drives px/pz/head/(s,x) from the dynamic body instead. Bounded and
  // fallback-guarded; outside the window this early-out is never taken.
  if (incidentSim.owns(c)) { c.rpm = rpmFor(c.gear || 1, Math.max(0, c.speed || 0)); c._prevS = c.s; return; }
  // Same contract for a networked rival: its owner is integrating it on their
  // machine and we replicate the result, so running the driving model here
  // would only fight the pose NetPlay writes. See js/net/netplay.js.
  // ...but its ENGINE is heard here: rpm is never on the wire (poseRemote writes gear and
  // speed), and RivalAudio / setEngine read c.rpm, so a skipped car droned at makeCars'
  // IDLE_RPM all race. rpmFor is pure — the owner's own gear at the posed speed.
  if (netPlay.owns(c)) { c.rpm = rpmFor(c.gear || 1, Math.max(0, c.speed || 0)); c._prevS = c.s; return; }
  // A REAL REPLAY puppet: posed from the real positions (js/race/real-replay.js). Its gear is
  // the tacho's coarse 2/4/6/8 band, so the note follows the speed's natural gear instead.
  if (realRace.owns(c)) { const v = Math.max(0, c.speed || 0); c.rpm = rpmFor(naturalGear(v), v); c._prevS = c.s; return; }
  Tracks.sample(track, c.s, smp);
  const hw = smp.hw;
  const slopeSin = smp.t[1] || 0;   // road pitch at the car (+uphill / -downhill)
  // ...signed along the NOSE for a human (c.speed runs along it): spun past 90 deg on a climb it faces DOWNhill. The sign only, so
  // ordinary driving (nose within 90 deg of the tangent) is bit-identical to the characterization baseline. AI drive the tangent.
  const slopeNose = c.human && Math.cos(Math.atan2(smp.t[0], smp.t[2]) - (c.head || 0)) < 0 ? -slopeSin : slopeSin;
  const k = Tracks.curvature(track, c.s);
  c.kCur = k;   // cache for the render loop's body-lean (avoids a 2nd curvature calc/car/frame)
  const dd = DIFF[difficulty] || DIFF.normal;   // an imported settings file can carry any string; quali-model.js falls back the same way
  // This car's own performance multipliers. Every site below reads this, never
  // the module-level `playerMods` — see modsFor. AI cars
  // never reach the branches that use it; the neutral fallback only guards a
  // human car whose setup failed to resolve.
  const mods = c.mods || NEUTRAL_MODS;
  // TYRE WEAR (js/physics/tyre-model.js) is integrated ONCE per car per tick,
  // here, so every consumer below reads one consistent value for this frame.
  // `perfMul` is the longitudinal half — worn rubber and a full tank both cost
  // acceleration — and it is exactly 1 while the setting is off, which is what
  // keeps the characterization baseline bit-identical.
  tyres.update(c, dt);
  pits.update(c, dt);
  engineer.update(c, dt);   // local player only; the module gates on c.local
  const perfMul = tyres.tractionMul(c) * tyres.fuelAccelMul(c);
  // This car's control source (human cars only — see inputOf).
  const inp = inputOf(c);

  // --- speed targets ---
  let vmax = VMAX * PACE * (c.human ? mods.speed : c.tierV * c.skill * dd.ai);
  // Scripted AI pace (default): vmax stays on car/driver/difficulty. Catch-up
  // restores the reverse-only rubber band via AiBand (start + lapping gates).
  if (!c.human && _leadHuman && AiBand.mode() === "catchup") {   // scripted: factor() is 0 and applyVmax(0) the identity — skip both objects
    const applied = AiBand.applyVmax(vmax, AiBand.factor({
      leadProg: _leadHuman.prog, carProg: c.prog,
      trackTotal: track.total, raceT, launchT0, bandAuth: dd.band,
    }), c.tierV * c.skill * dd.ai, BAND_CEIL);
    vmax = applied.vmax; c._bandNow = applied.bandNow;
  } else c._bandNow = 0;
  // Caution: under VSC / safety car the whole field runs to a delta pace, not
  // racing speed — humans included, not only the AI.
  // Cautions default OFF (store.get("caution", false)); a race with them
  // disabled never hits lvl≥2. Fraction of pace-scaled top speed, so it rides
  // OVERALL SPEED like the rest.
  // PIT LANE SPEED LIMIT. Modelled exactly like the caution cap below — a
  // ceiling the car is bled toward — because they are the same kind of rule and
  // a second mechanism would be a second set of bugs. Expressed as a fraction of
  // vTop() inside PitLane, so it rides OVERALL SPEED and a player's measured pit
  // loss does not move when they change the pace slider.
  let pitV = -1;
  if (pits.inLane(c)) {
    pitV = pits.limit();
    // The AI brakes for its own box; a human does that themselves, and a game
    // that did it for them would be driving the one part of a stop the driver
    // actually does.
    if (!c.human) pitV = Math.min(pitV, pits.approachV(c));
    vmax = Math.min(vmax, pitV);
  } else if (!c.human && c.pitArmed) {
    // THE APPROACH: at the limit BY the entry line, not braking for it past
    // the line (AI-only by contract — PitLane.entryV; a driver brakes for
    // the line themselves).
    pitV = pits.entryV(c);
    vmax = Math.min(vmax, pitV);
  } else if (!c.human && c.pitState === "out") {
    // THE EXIT ROAD: the limit until the blend has the car inside the road
    // edge (PitLane.exitV) — a 30 m blend into a corner is not crossed at
    // racing speed.
    pitV = pits.exitV(c);
    vmax = Math.min(vmax, pitV);
  }
  let cautionV = -1;   // the delta pace a caution demands; -1 = green
  if (raceCtl) {
    const lvl = raceCtl.level;   // cheap getter, no per-frame allocation
    // RED: the field stops. A walking-pace floor rather than 0 keeps every
    // "approaches vmax" fade finite.
    // SC (3): the field QUEUES — RaceControl.scQueueFrac lets a car > 1 s off
    // the one ahead close up at a higher cap; the leader runs the SC pace.
    if (lvl >= 2) cautionV = vmax = Math.min(vmax, vTop() * (lvl >= 4 ? 0.02
      : lvl === 3 ? RaceControl.scQueueFrac(c, cars, track.total, ranked[0], vTop(), pits.inLane) : 0.6));
    // …and an AI car holds its place behind the car ahead (RaceControl.holdCap):
    // the cap alone let cars on different lines drive past each other.
    if ((lvl === 2 || lvl === 3) && !c.human && !(c.pitState && c.pitState !== "none")) {
      const h = RaceControl.holdCap(c, ranked, cautionFair);
      if (h < cautionV) cautionV = vmax = h;
    }
  }

  // --- AI traffic awareness: clearance on each side, the nearest blocker ahead
  // in our lane, and a "stuck" timer. Shared by the braking and steering logic
  // so the AI can pick the open side, commit to a pass, and dig itself out when
  // wedged — instead of grinding to a halt against a car or wall. Rating axes
  // (js/physics/ai-drive.js) scale how quickly they dig out and how much space they
  // leave when following.
  let roomL = Infinity, roomR = Infinity, blocker = null, blockerGap = Infinity, unstuckActive = false, letPass = false, aiFreeSpeed = 0, squeezed = false, roadL = Infinity, roadR = Infinity, queued = false;
  let alongO = null, alongDx = 0, alongDprog = 0, alongAdx = Infinity;   // the LATERALLY nearest car overlapping us longitudinally (see the side-rub constraint)
  let towCar = null, towGap = Infinity;   // nearest car ahead in the slipstream (wider than the blocker box)
  let chaser = null, chaserGap = Infinity; // nearest car close BEHIND in our lane (for defending)
  let nearbyN = 0, sep = 0;                // sep-window density + lateral-separation pull (traffic scan)
  const aiT = c.human ? null : AiDrive.traits(c);
  if (!c.human) vmax *= AiDrive.pacePhase(raceT, aiT.consistency, c.phaseRoll);   // a stint drifts; lockstep never passes
  if (!c.human && tyres.on() && state === "race") pits.think(c);   // strategy: does this car box?
  if (!c.human && AiDrive.mistakePhase(c.errT) === 2) vmax *= AiDrive.mistakeGatherMul();   // gathering it up after a mistake
  // TYRES. With TYRE WEAR off this is the shipped AiDrive fudge, untouched — a
  // ground-speed scale on an AI-only deg curve. With it on, the AI's pace comes
  // off the SAME wear model the player is driving (js/physics/tyre-model.js), so
  // a strategy fight is fought on one curve; the compound's own pace offset
  // stays separate because the player's already lives in mods.cornering.
  if (!c.human && c.tyreClass) {
    vmax *= tyres.on() ? (1 + (c.tyre ? c.tyre.off : 0)) * tyres.tractionMul(c)
                       : AiDrive.tyrePace(c.tyreClass, Math.max(0, c.lap - 1));   // laps DONE: c.lap counts line crossings (TyreModel lapsDone)
  } else if (c.human) vmax *= tyres.tractionMul(c);   // the same curve for the player: perfMul only slows the climb to vmax, never the cap (exactly 1 with wear off)
  // FUEL BURN, the counterweight that gives a stint its shape: the car gets
  // lighter and faster while the tyre goes off and gets slower, and where those
  // two cross is the pit window. Exactly 1 when the setting is off.
  vmax *= tyres.fuelVmaxMul(c);
  if (!c.human) {
    // AI keeps a tuned racing margin to the edge (not the hard barrier, so it
    // flows through barrier-lined corners instead of treating them as boxed-in).
    const edge = track.street ? hw - 0.8 : hw + 5;
    // Room to the ROAD edge, each side. roomL/R below measure to `edge`, which
    // on a permanent circuit is 5 m into the run-off so the AI flows past
    // barrier-lined corners; the pass latch and the squeeze test read THESE, or
    // an AI "passes" on the grass at x = hw + 0.5 for as long as the car ahead
    // holds its line (contact diagnostics, Lesmo: 1.5 s of rear-corner rub).
    roadL = c.x + hw - 0.5; roadR = hw - 0.5 - c.x;
    roomL = edge + c.x;            // clearance to the left edge from our position
    roomR = edge - c.x;            // clearance to the right edge
    // Adjacent arc buckets, wrap-aware: ranked[] is CUMULATIVE prog, the window
    // is the WRAPPED delta — a lapped car is a lap away in rank and beside us
    // on the road (the same miss resolveCollisions calls out). Cheap reject kept.
    const L = track.total;
    // sep (consumer below) is fused into this scan — its window is a subset of [-13,+34].
    // BACK: the mirrors reach (AiDrive.mirrorReach — a time behind, not a flat 13 m).
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
    if (state === "race" && c.speed < 7 && boxed && raceCtl.level < 4) c.stuckT = (c.stuckT || 0) + dt;
    else c.stuckT = Math.max(0, (c.stuckT || 0) - dt * 1.5);
    unstuckActive = c.stuckT > AiDrive.stuckThreshold(aiT);
    // LET PASS (AiDrive.letPass*): a quicker car on our gearbox with nothing
    // ahead of US holding it up is getting through whatever we do, and
    // defendPull was the only answer the AI had. Speeds compare to each other,
    // never to a literal, so the window holds at every OVERALL SPEED.
    // BLUE FLAGS ONLY (AiDrive.letPassCase): the chaser must be LAPPING us — a lap or more ahead in progress.
    const letPassCase = AiDrive.letPassCase(state === "race", blocker, chaser, chaserGap, chaser ? chaser._snapSpeed : 0,
      c.speed, vTop() / VMAX, !!chaser && chaser._snapProg - c.prog > track.total * 0.5);
    if (letPassCase) c.letPassT = (c.letPassT || 0) + dt;
    else c.letPassT = Math.max(0, (c.letPassT || 0) - dt * 1.5);
    letPass = (c.letPassT || 0) > AiDrive.letPassDelay(aiT);
    // PASSED: the car alongside went from behind to ahead — by a player or an AI, latched or not. The re-pass lockout (AiDrive.repassLock), shorter with a pace edge.
    if (alongO && alongO === c._alPrev && c._alPrevDp < 0 && alongDprog >= 0) { c.passFailOf = alongO; c.passFailT = Math.max(c.passFailT || 0, AiDrive.repassLock(aiT, (vmax - paceVmax(alongO)) / vTop())); }
    c._alPrev = alongO; c._alPrevDp = alongDprog;
  }

  // --- electric deploy ---
  let deploy = 0;
  if (c.isPlayer && Input.consumeBoostToggle()) c.boostOn = !c.boostOn;   // BOOST is a toggle
  // Short-circuit empty battery before the LUT sample AiDrive would ignore anyway.
  let aiWantsBoost = false;
  if (!c.human && c.energy > 0.02) {
    _aiBoost.traits = aiT; _aiBoost.energy = c.energy; _aiBoost.otActive = c.otT > 0;
    _aiBoost.kAhead60 = Tracks.curvature(track, wrapS(c.s + 60));
    _aiBoost.towCar = !!towCar; _aiBoost.towGap = towGap; _aiBoost.towSpeed = towCar ? towCar._snapSpeed : 0; _aiBoost.speed = c.speed;
    _aiBoost.chaser = !!chaser; _aiBoost.chaserGap = chaserGap; _aiBoost.chaserSpeed = chaser ? chaser._snapSpeed : 0;
    _aiBoost.team = c.team; _aiBoost.seat = c.seat; _aiBoost.stats = c.houseStats;
    _aiBoost.ersDeploy = c.ersDeploy; _aiBoost.ersRegen = c.ersRegen;
    aiWantsBoost = AiDrive.wantBoost(_aiBoost);
  }
  const wantBoost = (c.human ? c.boostOn : aiWantsBoost)
    || c.otT > 0;   // OVERTAKE deploys on its own — even with BOOST toggled off
  // OVERTAKE IS FREE. Its push does not come out of the battery, so an OT burst
  // costs nothing, fires on a flat ERS, and never competes with BOOST for charge.
  // It is already rationed by its own 0.5 MJ allowance per earned lap, which is what
  // makes it a tactical move rather than a second BOOST — the energy bar was a
  // second, redundant limiter, and at a ~0.2/s drain over a ~4 s push a single
  // press emptied 80% of the battery, so using the overtake button left you
  // slower for the rest of the lap than if you had never pressed it.
  const otFree = c.otT > 0;
  // PACE-scaled like every other accel term (docs/PHYSICS.md): unscaled it was 2.56x a pace-0.44 car's build-up but 1.54x a 1.34 one's.
  // The drain and `c.deploying` follow `onThrottle` below: the push only enters `a` on the throttle branch.
  if (otFree || (wantBoost && c.energy > 0)) deploy = DEPLOY_A * Math.max(PACE, 0.05) * deployTaper(c);

  // --- overtake mode --- (FIA 2026 B7.2.3(c), js/race/overtake-mode.js)
  // Under 1 s behind the car ahead AT THE DETECTION LINE earns a 0.5 MJ
  // allowance, granted at the timing line and spent at will over that lap.
  // The car ahead ON THE ROAD (docs/PHYSICS.md), not ranked[rank-2]: that is the
  // classification neighbour — a leader has none, it can sit a lap away, and a
  // finished car coasting right ahead would count.
  // Only a car inside OT_GAP·speed can earn (`ahead` is read only then): the traffic scan's cheap reject, +1 m margin.
  //
  // The O(n) ahead walk is only needed when a detection-line crossing can earn
  // OT (otDetectOpen + crossed since last tick), or the car already holds
  // allowance (AI fire / spend). Seed the crossing trackers the same way
  // OvertakeMode.lines does. Profiled Monza 22-car: the walk was ~17 % of
  // updateCar positionTicks and dragged inLane to ~2.6 % of all JS self-time.
  let ahead = null, gapAhead = Infinity; const otL = track.total, otW = OT_GAP * c.speed + 1;
  if (c._otLap == null || c._otS == null) { c._otLap = c.lap | 0; c._otS = c.s; }
  const otOpen = raceCtl.otDetectOpen();
  const otNeedAhead = (c.otE > 0 || c.otOn) ||
    (!!track && otOpen && OvertakeMode.crossed(c._otS, c.s, OvertakeMode.detectS(track), otL));
  if (otNeedAhead) {
    const ot = Collide.scanOtAhead(c, otL, otW, _otSkipLane);
    ahead = ot.ahead; gapAhead = ot.gapAhead;
  }
  gapAhead = ahead && c.speed > 1 ? gapAhead / c.speed : Infinity;
  // vStd, not a bare c.speed: a THRESHOLD in real m/s means something different
  // at every OVERALL SPEED setting (vstd-invariant A13). Never while the pit
  // limiter holds the car (pits.held: entry line to exit) — a queue in the lane
  // is inside OT_GAP (docs/research/PIT-NEXT-STEPS-2026-09.md §4e).
  const pitHeld = pits.held(c);
  OvertakeMode.lines(c, track, gapAhead, otOpen);
  const otGate = otEnabled() && !c.finished && !pitHeld, otFast = vStd(c.speed) > OT_MIN_SPEED;
  OvertakeMode.arm(c, otGate, otFast);
  const fire = c.human ? (c.local ? Input.consumeOvertake() : !!inp.overtake)
                      : (c.otArmed && gapAhead < OT_GAP && (_aiOtFire.traits = aiT,   // the AI spends it on a car it can attack
                          _aiOtFire.blockerGap = blocker ? blockerGap : gapAhead * (c.speed || 1),
                          _aiOtFire.gapAhead = gapAhead * (c.speed || 1),
                          _aiOtFire.roomL = roomL, _aiOtFire.roomR = roomR, _aiOtFire.speed = c.speed, _aiOtFire.vTop = vTop(),
                          _aiOtFire.aheadSpeed = blocker ? blocker._snapSpeed : (ahead ? ahead._snapSpeed : c.speed),
                          _aiOtFire.kAhead = Tracks.curvature(track, wrapS(c.s + 40)),
                          _aiOtFire.street = !!track.street, _aiOtFire.team = c.team, _aiOtFire.seat = c.seat,
                          _aiOtFire.stats = c.houseStats, _aiOtFire.other = blocker,
                          AiDrive.otShouldFire(simRnd(), dt, _aiOtFire)));
  if (OvertakeMode.spend(c, dt, fire, otGate, otFast, otTimeFor(c)) && c.isPlayer && soundOn) GameAudio.deployBoost();
  if (c.isPlayer && c.otArmed && !c.wasArmed && soundOn) GameAudio.overtakeReady();
  c.wasArmed = c.otArmed;

  // --- braking / target speed ---
  let braking = false;
  // Pedal travel 0..1 (analog on a pad trigger, 1 on any digital source). The
  // brake force and the longitudinal-accel estimate that feeds the friction
  // ellipse both scale by it, so easing off the brake actually hands grip back
  // to the front tyres — trail-braking you can modulate, not just stamp/lift.
  let brakeLvl = 1;
  // THROTTLE travel, the other half of the same idea. Input.throttleLevel()
  // existed but was dead: the pad's analog trigger was thresholded to a boolean,
  // so a controller could only floor it or lift. Scaling engine accel by it is
  // what makes a part-open throttle a measured exit. DEPLOY IS DELIBERATELY
  // OUTSIDE THIS: ERS is its own button; the throttle must not meter the battery.
  let throttleLvl = 1;
  if (c.human) {
    braking = inp ? !!inp.brake : Input.braking();
    // `?? 1`, symmetric with throttleLevel below (the rule the comment under it states).
    brakeLvl = inp ? (inp.brakeLevel ?? 1) : Input.brakeLevel();   // continuous from 0; the floor is in the braking branch
    // A replicated or scripted input is a boolean by construction, so it means
    // FULL travel unless it says otherwise — which keeps every __apex.setInput
    // caller (and every physics spec built on one) exactly as it was.
    throttleLvl = inp ? (inp.throttleLevel ?? 1) : (autoThrottle() ? 1 : Math.max(0, Input.throttleLevel()));
    // PLAYER SLIPSTREAM. The AI have towed since day one (the block after
    // brakeDecision below); the human never did — a whole racing mechanic was
    // AI-only. Same window (0.5–TOW_RANGE m ahead, |dx| < TOW_HALF_W), same gain
    // (AiDrive.towGain), same lateral fade. The AI gate it on their curvature
    // lookahead (kMax); the player's gate is DRIVER state — not braking, wheel
    // near straight — because nothing derived from the arc may reach the
    // driver (docs/PHYSICS.md). It reads car positions and nothing else, so it
    // has no curvature site to classify and belongs OUTSIDE that table — not in
    // its "surface" column, which means road geometry. One asymmetry worth
    // knowing: with DRIVING HELP non-zero the assist supplies lock the driver
    // does not, so an assisted car can hold the wheel near centre through a
    // corner and stay inside this gate where an unassisted one could not.
    // The WAKE (c.wake) is positions-only and always recorded — aeroGrip
    // charges it in the corners exactly as the AI is charged; only the tow
    // BENEFIT below sits behind the driver gate.
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
    // AI: multi-sample brake target (compound corners) + soft pedal + craft
    // late-brake when a pass is on — see js/physics/ai-drive.js.
    const look = clamp(c.speed * 1.7, 30, 160);
    AiDrive.beginLook();
    let kMax = 0;
    // ON THE LINE the brake target reads the PATH's curvature (TrackLine.pathK:
    // the larger radius the line buys), off it the road's — so a car fighting
    // off-line is slower through the corner, as a real one is.
    const onLine = Math.abs(TrackLine.at(track, c.s).x - c.x) < 1.5;
    // EVERY NODE, NODE-ALIGNED — not every 14 m from the car. A 14 m stride
    // anchored on c.s slid across the 4 m curvature nodes as the car moved, so
    // the sample set (and the min over it) changed every frame and the brake
    // target stepped: throttle/brake chatter at every corner entry. Anchored
    // on the nodes, the window gains one node ahead and drops one behind per
    // node travelled, and the target moves as smoothly as the LUT.
    const dsN = track.total / track.n;
    // FROM THE CAR, not 12 m ahead of it. The old floor meant the nearest
    // sample sat 12 m away, and brakeTarget's entry speed for a sample is
    // sqrt(vC² + 2·brake·0.85·d) — so the AI only ever had to be at
    // sqrt(vC² + 449) by the time the corner arrived, and never at vC. It was
    // free speed in every corner, worth more than the whole easy→hard range,
    // and it flattened skill and difficulty most in the slow corners where the
    // constraint should bite hardest (docs/notes/AI-FIELD-RESEARCH.md).
    const ss0 = Math.ceil(c.s / dsN) * dsN;
    for (let ss = ss0, d = ss0 - c.s; d < look; ss += dsN, d += dsN) {
      // Tracks.curvature / pathK / bankAngle all wrap s themselves.
      const kk = Tracks.curvature(track, ss);
      const ak = Math.abs(kk);
      if (ak > kMax) kMax = ak;
      // |bank|: the player's bankRoll (below) takes the absolute value, so a
      // signed/adverse bank must not boost the player while it cuts the AI.
      AiDrive.pushLook(d, onLine ? TrackLine.pathK(track, ss) : kk, Math.abs(Tracks.bankAngle(track, ss)));
    }
    _aiBr.traits = aiT; _aiBr.samples = AiDrive.endLook(); _aiBr.latMax = LAT_MAX; _aiBr.diffCorner = Math.min(1, dd.corner * (1 + (c._bandNow || 0)));   // the band lifts corner authority too, never past 1.0: a banded car drives like a better driver, not a faster car
    _aiBr.aeroLoad = c.aeroLoad; _aiBr.brake = BRAKE * tyres.tractionMul(c) * (gripMult(c) / gripMult()); _aiBr.pace = PACE; _aiBr.vmax = VMAX;   // the tread's braking credit (docs/PHYSICS.md §Braking): the planner must stop as the executor below does, or it corners on wets and brakes on slicks
    _aiBr.grip = gripMult(c) * tyres.gripMul(c) * dirtyAirMul(c.wake || 0, c.speed);   // the wake costs the AI its corner too
    _aiBr.speed = c.speed; _aiBr.blocker = !!blocker; _aiBr.blockerGap = blockerGap;
    _aiBr.blockerSpeed = blocker ? blocker._snapSpeed : 0;
    _aiBr.roomL = roomL; _aiBr.roomR = roomR; _aiBr.team = c.team; _aiBr.seat = c.seat; _aiBr.stats = c.houseStats;
    _aiBr.errMul = AiDrive.mistakePhase(c.errT) === 1 ? AiDrive.mistakeBrakeMul() : 1;   // a missed braking point
    const br = AiDrive.brakeDecision(_aiBr);
    braking = br.braking;
    brakeLvl = br.brakeLvl;
    // Slipstream: in the wake ahead on a straight, shed drag and gain top speed —
    // what lets a following car CLOSE and pull out to pass instead of queueing.
    // Applied BEFORE the queue cap, so it never rams the car directly ahead (the
    // cap bounds it) but surges the instant we draw out of that car's box. Fades
    // with gap + lateral offset; straight only (the wake is behind the car).
    // The WAKE is recorded whatever the corner does — dirty air is a property
    // of sitting behind a car, and it is in the CORNERS that it decides
    // anything. The tow keeps its own straight-only gate below: a slipstream
    // needs a straight, a wake does not.
    c.wake = towCar ? wakeOf(towGap, towCar._snapX - c.x) : 0;   // cleared in clear air, or dirtyAirMul sticks
    c.towing = (towCar && !braking && kMax < 0.006) ? c.wake : 0;
    if (c.towing > 0) {
      vmax *= 1 + AiDrive.towGain(!!track.street) * c.towing;
    }
    // THE LANE'S CAP, LAST: the phase, tyre, fuel and tow multipliers above
    // are pace, and a limit is not pace — the tow alone ran a queue down the
    // Bahrain lane at 91 km/h under an 80 limit (measured).
    if (pitV >= 0) vmax = Math.min(vmax, pitV);
    // queue behind the car blocking our lane (prog-based, immune to rank swaps):
    // cap our pace to it, braking if closing fast, so we tuck behind not ram.
    // The follow distance is a TIME HEADWAY (AiDrive.followGap: s0 + v·T),
    // tightened while a pass is latched or armed, or in a tow on a straight.
    // NOT against the car we are committed to passing once we are laterally
    // clear of it: the cap re-binding at |dx| < 2.2 is exactly what turned every
    // pull-out into a re-queue (the pass latch below owns that decision). 1.8 is
    // inside the 2.2 blocker box on purpose — hysteresis, so the two edges
    // cannot chatter against each other.
    // THE QUEUE WINDOW REACHES PAST THE FOLLOW GAP: a 16 m window under a 20-28 m
    // headway never held the car (it hovered at the edge, uncapped), so queue
    // pressure never built and a stuck car never got impatient.
    const followR = blocker ? AiDrive.followGap(aiT, !!track.street, c.speed, c.passOf || c.atkOn || c.towing > 0 ? 1 : c.atkWant ? 0.6 : 0, c.team, c.seat, blocker, c.houseStats, (c.runT || 0) + AiDrive.startGapT(c.calm = AiDrive.startCalm(c.launchOn, c.calmUntil, raceT))) : 0;
    const qWin = Math.max(16, followR + 6);
    const capBlocks = blocker && blockerGap < qWin &&
      !(blocker === c.passOf && Math.abs(c.x - blocker._snapX) >= 1.8);
    if (blocker && blockerGap < qWin) aiFreeSpeed = vmax;   // our pace with this car gone (AiDrive.otWant)
    c.queueT = AiDrive.queueTime(c.queueT, capBlocks && blocker === c._qOf && cautionLevel() < 2, dt); c._qOf = capBlocks ? blocker : null;   // held behind the SAME car (AiDrive.queuePress)
    if (capBlocks) {
      // Held behind a car SERVING A STOP (or queued for one), not by the ground
      // — the pit-lane rescue reads this. Only a lane car: a car welded to
      // anything else in there still gets its rescue.
      queued = pits.inLane(blocker);
      // ON THE LANE THE CARS QUEUE (AiDrive.laneFollow): a wider held gap, and
      // the crawl floor dropped so a car behind one on the jacks comes to REST
      // instead of being commanded into its gearbox. BOTH ends must be pit-held,
      // so nothing about racing traffic changes.
      const onLane = queued && pits.held(c);
      const follow = onLane ? AiDrive.laneFollow() : followR;
      // Floored (AiDrive.queueFloor): the cap may match the blocker's pace but
      // must never command a STANDSTILL — which it did behind a stopped car,
      // and a stopped AI can never steer out. The crawl is itself capped at the
      // vmax race control already granted, so VSC and red flag still win.
      const q = blocker._snapSpeed + clamp(blockerGap - follow, -6, 8);
      const crawl = onLane ? 0 : Math.min(AiDrive.queueFloor(!!track.street) * Math.max(PACE, 0.05), vmax);
      vmax = Math.min(vmax, Math.max(q, crawl));
      const qb = AiDrive.queueBrake(c.speed, blocker._snapSpeed, !!track.street, blockerGap, follow, BRAKE, vTop() / VMAX);
      if (qb) { braking = true; brakeLvl = qb; }
    }
    // The other half of LET PASS: stop accelerating away. A multiplier, not a
    // threshold, so it eases at every OVERALL SPEED by construction.
    if (letPass) vmax *= AiDrive.letPassEase(aiT);
    // SQUEEZED (AiDrive.squeezeEase / squeezeBrake): touching a car we must
    // yield to, with no lane to yield into — back out under its speed, brake
    // dabbed, until we are clear. The pass latch below reads it too.
    if (alongO && c.sbsT > AiDrive.sbsCommitT() && c.passOf !== alongO && alongO._snapSpeed >= c.speed - 0.5) vmax = Math.min(vmax, alongO._snapSpeed * AiDrive.sbsEase());   // COMMIT OR YIELD: tuck in behind
    squeezed = (c.contactT || 0) > 0 && !!alongO && AiDrive.sideYieldsA(-alongDprog, c.x, alongO._snapX, c.kTurn) &&
        (alongDx <= 0 ? Math.min(roomR, roadR) : Math.min(roomL, roadL)) < AiDrive.minLatGap(hw, !!track.street);
    if (squeezed) {
      vmax = Math.min(vmax, alongO._snapSpeed * AiDrive.squeezeEase(!!track.street));
      if (!unstuckActive) { braking = true; brakeLvl = Math.max(brakeLvl, AiDrive.squeezeBrake()); }
    }
    // when wedged in/stopped, power out instead of braking
    if (unstuckActive) { braking = false; brakeLvl = 0; }
  }

  // --- active aero (X-mode / Z-mode) ---
  // Runs AFTER `braking` is known (touching the brake shuts the flaps) and
  // BEFORE vmax is consumed by the gearbox and the speed integration, so the
  // low-drag top speed applies on the same frame the flap opens.
  //
  // Note the AI needs no separate "close before the corner" rule: its braking
  // scan looks 1.7 s ahead and the arming scan looks 3 s ahead, so the mode has
  // already un-armed by the time the AI decides to brake for a corner.
  // `!pitHeld`: no flaps in the lane. X_MIN_SPEED (25 vStd) already blocked
  // most of this by accident, the limit being 22.2 vStd at every pace; what
  // this closes is the bleed past the entry line, where a driver who merely
  // lifts is not `braking`. Small but not zero — §4e has the count.
  c.xArmed = !c.offroad && !braking && vStd(c.speed) > X_MIN_SPEED
    && !c.finished && !pitHeld && state === "race" && inAeroZone(c);
  if (c.human && raceAeroMode === "auto") {
    // Same rule the AI runs: take every zone the circuit offers.
    c.xOn = c.xArmed;
  } else if (c.human) {
    // Nothing may sit BETWEEN these two: a statement here once stole the `else`,
    // so any local car that had not pressed the (since removed) PIT key had
    // `c.xOn` overwritten from the raw input and the active-aero toggle stopped
    // working entirely (tests/unit/active-aero-vm.test.mjs, 7 red).
    if (c.local) { if (Input.consumeAeroToggle()) c.xOn = !c.xOn; }
    else c.xOn = !!(inp && inp.aero);
  } else {
    // AI takes X when armed unless wantX banks Z (hold/empty battery). Catch
    // and OT still force the open wing so a pass does not sit in high drag.
    _aiWantX.armed = true; _aiWantX.team = c.team; _aiWantX.seat = c.seat; _aiWantX.stats = c.houseStats;
    _aiWantX.energy = c.energy; _aiWantX.catching = !!(towCar && towGap < 28); _aiWantX.otActive = c.otT > 0;
    c.xOn = c.xArmed && AiDrive.wantX(_aiWantX);
  }
  {
    // The flap POSITION, not the switch, is what the physics reads: the mode
    // has to travel, and the travel is asymmetric (see X_CLOSE_RATE). Holding
    // the button through a corner therefore buys nothing — the flap is shut.
    const want = (c.xOn && c.xArmed) ? 1 : 0;
    // Audible latch for the LOCAL car only: the moment the flap command flips,
    // not the (slower) travel — the click is the switch, the drag is the flap.
    if (c.human && c.local && soundOn && want !== (c._xSndWant ?? 0)) {
      GameAudio.xMode(want === 1);
      c._xSndWant = want;
    }
    const rate = want > (c.aeroX || 0) ? X_OPEN_RATE : X_CLOSE_RATE;
    c.aeroX = clamp((c.aeroX || 0) + Math.sign(want - (c.aeroX || 0)) * rate * dt,
                    Math.min(c.aeroX || 0, want), Math.max(c.aeroX || 0, want));
    // Losing the arming window drops the SWITCH too, so the flap doesn't spring
    // back open at the exit of a corner the driver never re-armed for. Same as
    // the real system: it re-arms, it does not re-open.
    if (!c.xArmed) c.xOn = false;
  }
  // Low drag is worth top speed. This is the ONLY thrust-side effect — no
  // engine power is added, so X-mode out of a slow corner does nothing at all.
  vmax *= 1 + xVmaxGain(c) * c.aeroX;
  // Stashed for physState(): the two halves of the active-aero trade are
  // computed deep inside the per-car update and were otherwise unobservable, so
  // "does the wing actually do anything?" could only be answered by reading this
  // function. Driving the car to measure it does not work — full lock at 78 m/s
  // puts it 30 m into a field, which closes the flaps and measures nothing.
  c._vmaxNow = vmax;
  if (state === "race" && cautionLevel() < 2 && !pits.inLane(c)) AiDrive.paceSample(paceRef(), Math.floor(c.s / track.total * track.n) % track.n, c, vmax, !blocker || blockerGap > 30, dt);

  // --- gearbox (player) ---
  // accelCeil: the speed a car ABOVE it is bled toward (never a teleport) and
  // the one below it accelerates up to — vmax plus the ERS overspeed margin, a
  // speed, so it rides the pace scale.
  let gearMult = 1, accelCeil = vmax + 14 * Math.max(PACE, 0.05);
  if (c.human) {
    c.shiftT = Math.max(0, c.shiftT - dt);
    const up = c.local ? Input.consumeShiftUp() : !!inp.shiftUp,
          down = c.local ? Input.consumeShiftDown() : !!inp.shiftDown;
    if (gearsManual()) {
      if (up && c.gear < GEARS && c.shiftT <= 0) { c.gear++; c.shiftT = 0.1; if (soundOn && c.local) GameAudio.shift(true); }
      if (down && c.gear > 1 && c.shiftT <= 0) { c.gear--; c.shiftT = 0.1; if (soundOn && c.local) GameAudio.shift(false); }
      const hi = gearHi(c.gear), lo = gearLo(c.gear);
      const frac = (c.speed - lo) / Math.max(hi - lo, 1);
      if (c.speed >= hi && c.gear < GEARS) { gearMult = 0.08; accelCeil = Math.min(accelCeil, hi + 1.5); }  // limiter: upshift to go faster (8th has none: gearHi(8) IS vTop, so it pinned manual at vTop+1.5, short of X-mode / ERS overspeed)
      else if (frac < 0.25) gearMult = clamp(0.7 + frac * 1.2, 0, 1);   // mild bog at low revs: downshift for best punch
      // Brake-to-reverse sits below every forward gear band, so the bog above
      // reads negative speed as "infinitely low revs" and clamps gearMult to 0.
      // Throttle then cannot leave REVERSE_MAX until rescue (~1 s) jerks the
      // car — measured: 60 frames stuck at -5 m/s with a=0 in manual 1st, while
      // auto (gearMult=1) recovers in 0.5 s. Hold at least standstill 1st-gear
      // bog while reversing so "throttle drives forward again" is true.
      if (c.speed < 0) gearMult = Math.max(gearMult, 0.7);
    }
  }

  // Classify the visible surface BEFORE applying longitudinal forces. Kerbs
  // and the separate pit ribbon remain road, even outside the main half-width.
  c.onKerb = Tracks.onKerb(track, c.s, c.x) > 0;
  c.inPitLane = Math.abs(c.x) > hw && Tracks.inPitLane(track, c.s, c.x);
  c.offroad = Math.abs(c.x) > hw && !c.onKerb && !c.inPitLane;
  const surfaceMu = c.offroad ? lerp(1, OFF_GRIP, clamp((Math.abs(c.x) - hw) / 1.5, 0, 1)) : 1;
  const roadBrake = BRAKE * tyres.tractionMul(c) * (c.human ? mods.braking : 1) * (gripMult(c) / gripMult());
  // Rolling resistance and pedal braking share a budget below tarmac braking.
  // Reserve drag first so a throttle-on excursion still slows; the remaining
  // pedal force grows continuously with demand, even with weak or worn brakes.
  const grassDrag = Math.min((1 - surfaceMu) * 24, roadBrake * .75);
  const surfaceBrake = c.offroad
    ? Math.min(roadBrake * surfaceMu, Math.max(0, roadBrake * .95 - grassDrag)) : roadBrake;
  // `braking` skips the coast drag, so a LIVE pedal never slows less than lifting (the old max(0.15, level) step's job); scripted input is exact.
  // ONE value: the speed integration and the weight-transfer estimate (axEstTarget) both read it.
  const brakeDecel = c.human && !inp ? Math.max(surfaceBrake * brakeLvl, COAST_DRAG) : surfaceBrake * brakeLvl;
  const longitudinalSpeed = c.speed;

  // --- integrate speed ---
  // AI always drives; the player holds GAS unless auto-throttle is on (then the
  // car accelerates on its own and braking still takes over below).
  // Suppress auto-throttle while wallT > 0 (just bounced off a wall) so the car
  // doesn't immediately re-pin itself: the player has to steer clear first.
  const wallPinned = c.human && (c.wallT || 0) > 0;
  const onThrottle = c.human
    ? (inp ? !!inp.throttle : ((autoThrottle() && !wallPinned) || Input.throttle()))
    : true;
  if (!onThrottle || braking) deploy = 0;   // no thrust, so no drain and no "deploying" (BOOST held through a brake drained for nothing)
  // BOOST alone still pays: deploy always produces thrust while held (see deployTaper), so it always costs energy — a BOOST that drains nothing does nothing.
  if (deploy > 0 && !otFree) { c.energy = Math.max(0, c.energy - drainFor(c) * dt); if (c.energy <= 0) c.boostOn = false; }   // auto-release the toggle when drained
  c.deploying = deploy > 0;   // deploy is 0 or >= DEPLOY_A * TAPER_FLOOR * PACE
  if (braking) {
    if (c.speed > 0) {
      // Tread pays braking back in the wet — the ratio is exactly 1 on slicks and in the dry (docs/PHYSICS.md). The AI earns it too: its
      // `tread: null` resolves to the right compound for braking as well as cornering.
      c.speed = Math.max(0, c.speed - brakeDecel * dt);
    } else if (c.human && state === "race") {
      // Stopped and still braking: crawl backwards so the player can ease off a
      // wall or re-aim after a spin. Capped slow; throttle drives forward again.
      c.speed = Math.max(REVERSE_MAX, c.speed - REVERSE_ACCEL * surfaceMu * dt);
    }
    c.energy = Math.min(1, c.energy + regenFor(c) * 1.6 * regenSpeedK(c) * dt);
  } else if (!onThrottle) {
    // coasting: gentle engine-braking/drag both ways (don't snap reverse to 0).
    // X-mode sheds part of that drag — a lift-and-coast in the low-drag wing
    // carries further, which is the whole point of opening it.
    const cd = COAST_DRAG * (1 - xCoastCut(c) * (c.aeroX || 0));
    if (c.speed > 0) c.speed = Math.max(0, c.speed - cd * dt);
    else if (c.speed < 0) c.speed = Math.min(0, c.speed + cd * dt);
    c.energy = Math.min(1, c.energy + regenFor(c) * regenSpeedK(c) * dt);
  } else {
    // The AI's launch (AiDrive.launchPlan): no throttle before its reaction, then
    // its own getaway for three seconds. A grid that accelerated as one held its
    // 8 m pitch to T1 — see the start test in ai-racecraft-vm.
    const launch = c.launchOn ? AiDrive.launchMul(raceT - launchT0, c.launch) : 1;
    if (c.launchOn && AiDrive.launchDone(raceT - launchT0, c.launch)) { c.launchOn = false; c.calmUntil = launchT0 + AiDrive.startCalmS(); }
    const a = (ACCEL * PACE * perfMul * (c.human ? mods.accel * throttleLvl : launch) * clamp(1 - c.speed / Math.max(vmax, 1), 0, 1) * gearMult + deploy) * surfaceMu * (state === "race" ? 1 : 0);
    if (!c.human) c.accSm = damp(c.accSm ?? 0, a, 6, dt);   // what this car is pulling — AiDrive.otWant reads it on the blocker
    // A ceiling that drops under the car (VSC vmax cut, limiter downshift) bleeds
    // at coast drag rather than scrubbing up to 25 m/s in one step.
    c.speed = c.speed > accelCeil ? Math.max(accelCeil, c.speed - COAST_DRAG * dt)
                                 : Math.min(accelCeil, c.speed + a * dt);
    // Part-load harvest, never while the same motor is deploying, or BOOST out
    // of a slow corner would recharge the battery it is spending.
    if (c.speed < vmax * 0.5 && !(deploy > 0)) c.energy = Math.min(1, c.energy + regenFor(c) * regenSpeedK(c) * dt);
  }
  // --- slope gravity: climbs gently bleed speed, descents gently feed it back.
  // slopeSin is the road tangent's vertical component (+uphill / -downhill).
  // Two guards so elevation never feels wrong: a descent can NEVER push you past
  // your own top speed (uncapped overspeed flings the car off at the bottom
  // of a hill), and the pull is magnitude-capped so a steep ramp can't act like an
  // invisible wall. Race-only so the grid doesn't creep during the countdown.
  if (state === "race" && slopeNose) {
    const a = clamp(-GRAVITY_SLOPE * slopeNose, -ACCEL * 0.5, ACCEL * 0.5);   // m/s^2
    if (a < 0) {                                   // uphill: gentle bleed
      if (c.speed > 0) c.speed = Math.max(0, c.speed + a * dt);
    } else {                                        // downhill: feed, with a small
      // overspeed margin so a long descent actually gives you something (a hard
      // clamp to vmax made steep downhills feel inert once at pace).
      // Gravity may ADD up to the 6 % margin; it must not confiscate ERS/X
      // leftover already above it (that snap is what made hills clip).
      const cap = vmax * 1.06;
      // ...but not into a car the BRAKES are holding: at a standstill gravity's a·dt re-took the
      // `speed > 0` braking branch every step, so brake-to-reverse never engaged on any descent.
      if (c.speed < cap && !(braking && c.speed <= a * dt)) c.speed = Math.min(cap, c.speed + a * dt);
    }
  }
  // CAUTION: a cut vmax is only an acceleration ceiling above, so a car above
  // the delta pace bled at coast drag (and never on a descent, which skips the
  // bleed below) and was still rolling at the restart. Brake it down for real.
  if (pitV >= 0 && c.speed > pitV) c.speed = Math.max(pitV, c.speed - BRAKE * CAUTION_BRAKE * dt);
  // HELD IN THE BOX. The one moment the pit lane takes the car off the driver:
  // everything else about a stop is driven. Braking to a stop is the driver's
  // job (PitLane only latches `box` once the car is genuinely slow there), so
  // this holds rather than decelerates.
  if (c.pitState === "box") c.speed = 0;
  if (cautionV >= 0 && c.speed > cautionV) c.speed = Math.max(cautionV, c.speed - BRAKE * CAUTION_BRAKE * dt);
  // Flat / climb: bleed leftover overspeed toward the 6 % margin. Skip on a
  // real descent so gravity-kept ERS/X speed survives the hill.
  if (state === "race" && c.speed > vmax * 1.06 && slopeSin >= -0.03) {
    c.speed = Math.max(vmax * 1.06, c.speed - COAST_DRAG * 0.35 * dt);
  }
  // EVERY car, not just the human one: gated on `c.human`, an AI car's rpm never
  // leaves IDLE_RPM — dark rev lights, a gear digit stuck on 1, and every rival
  // engine droning at idle tape speed. rpmFor/naturalGear are pure functions of speed and nothing in
  // the AI physics reads c.gear, so this is a readout fix, not a handling one.
  // The SHIFT CUE stays human-only: it is your gearbox you hear, not theirs.
  const gearSpeed = Math.max(0, c.speed);   // gearbox readout ignores reverse crawl
  if (c.human && !gearsManual()) {
    const ng = naturalGear(gearSpeed);
    if (ng !== c.gear && state === "race" && soundOn && c.local) GameAudio.shift(ng > c.gear);   // your gearbox, not a VS FRIEND rival's
    c.gear = ng;
  } else if (!c.human) c.gear = naturalGear(gearSpeed);
  c.rpm = rpmFor(c.gear, gearSpeed);

  // Passive resistance never raises speed to the crawl floor or prevents a stop.
  if (c.offroad) {
    const grassFloor = GRASS_V * 0.6 * Math.max(PACE, 0.05);
    if (c.speed > grassFloor) c.speed = Math.max(grassFloor, c.speed - grassDrag * dt);
    c.offT += dt;
    if (c.offT > 1.2) {
      c.offT = -2;   // grace before next count
      c.cuts++;
      // A LAP WITH A COUNTED CUT IS NOT A TIMED LAP — in ANY session. A time
      // trial is a leaderboard (a lap run off-track replaced a 42 s record with
      // 5 s, 2026-09-22), qualifying grids on it, and in the race the FIA
      // deletes it too ("Lap Deleted / Strike", 2026 Penalty Guidelines): every
      // car, so a cut lap cannot be anyone's best or the fastest lap. Only the
      // TIME goes — the lap still counts for distance (lineTransition bumps
      // c.lap regardless). Reuses the cut the engine already counted (1.2 s off,
      // past the grace) and the latch the crossing already clears.
      c.incidentInvalidLap = true;
      // A cut quali lap is DELETED, not replaced: with no valid lap the sheet
      // gave the player the model's time, which could be pole (endRace).
      if (c.isPlayer && isQuali()) c.qualiCut = true;
      // THE RACE LADDER (FIA 2026 Penalty Guidelines): strikes 1-2 are
      // warnings, the 3rd is the black-and-white flag, the 4th AND EACH
      // ADDITIONAL one is +5 s — no reset, no +10 s step (that was a pre-2026
      // reading). EVERY car pays (it feeds classification) so the AI cannot cut
      // for free; only the player gets the cues. `cutWarn` is the race's strike
      // count (HUD dots, coach, agentview); `cuts` stays the LIFETIME total the
      // career `clean` objective and the archive read (js/career/career.js).
      // Time trial and qualifying have no classification to price, so their
      // count simply cycles (docs/BUGS.md B2 / defect ledger).
      const priced = !isTimeTrial() && !isQuali();
      c.cutWarn = (c.cutWarn | 0) + 1;
      if (!priced) {
        if (c.cutWarn >= 4) c.cutWarn = 0;
        if (c.isPlayer) { announce("LAP INVALIDATED", 1.2, "penalty-warn"); if (soundOn) GameAudio.offtrack(); }
      } else if (c.cutWarn >= 4) {
        c.penalty += 5; Log[c.isPlayer ? "info" : "debug"]("game", "Penalty track-limits car=" + c.code + " +5s total=" + c.penalty + "s lap=" + c.lap);
        if (c.isPlayer) {
          announce("+5s TRACK LIMITS PENALTY", 2, "penalty-hit");
          if (soundOn) GameAudio.penalty();
        }
      } else if (c.isPlayer) {
        announce("TRACK LIMITS " + c.cutWarn + "/4" + (c.cutWarn === 3 ? " — BLACK & WHITE FLAG" : ""), 1.2, "penalty-warn");
        if (soundOn) GameAudio.offtrack();
      }
    }
  } else if (c.offT !== 0) {
    // Relax offT toward 0 during clean running — from BOTH sides. A counted cut
    // parks it at the -2 grace sentinel; decaying only positive values (the old
    // `else if (c.offT > 0)`) froze that -2 the whole rest of the stint, so the
    // NEXT, separate excursion started from -2 and needed ~3.2 s off-track to
    // count instead of 1.2 s — an unintended free pass. The continuous-excursion
    // grace is unaffected: that path is the `if` branch above (offT += dt), not
    // this one, which only runs while the car is back on track.
    c.offT = c.offT > 0 ? Math.max(0, c.offT - dt) : Math.min(0, c.offT + dt);
  }

  // --- kerbs (drivable, unlike walls): riding one rumbles and costs a little
  // grip + speed, but you can stay on it. Distinct from going off into grass.
  // Speed cut follows kerbGripSm (λ=12), not raw onKerb — that flag flickers ~20 Hz.
  c.kerbGripSm = damp(c.kerbGripSm ?? 1, c.onKerb ? 0.7 : 1, 12, dt);
  if (c.kerbGripSm < 0.999) c.speed = Math.sign(c.speed) * Math.max(0, Math.abs(c.speed) - 6 * (1 - c.kerbGripSm) / 0.3 * dt);
  if (c.onKerb && c.isPlayer) c.kerbCueT = KERB_CUE_HOLD;
  // The raw onKerb flag is a floor-indexed per-node lookup (TrackMesh.onKerb)
  // and flickers at the ~4 m node rate at speed (≈20 Hz at 300 km/h) when the
  // car straddles the kerb line. Run the CUES on a short sticky hold so
  // rumble/shake/haptics read as one continuous kerb strike instead of a
  // machine-gun re-arm of the trauma shake every node.
  if (c.isPlayer && (c.kerbCueT = Math.max(0, (c.kerbCueT || 0) - dt)) > 0) {
    shake = Math.max(shake, KERB_SHAKE);     // continuous light rumble via shake
    c.kerbSndT = (c.kerbSndT || 0) - dt;
    if (soundOn && c.kerbSndT <= 0) { GameAudio.rumble(); c.kerbSndT = 0.07; }
    if ((c.kerbHapT = (c.kerbHapT || 0) - dt) <= 0) { Input.vibrate(15); Input.rumble(0.25, 90, "handles"); c.kerbHapT = 0.12; }
  }

  // Signed observed acceleration, including braking/grass, for AI lane
  // prediction. Keep the existing engine-pull accSm contract separate.
  c.corridorAccel = damp(c.corridorAccel || 0, (c.speed - longitudinalSpeed) / Math.max(dt, 1e-6), 6, dt);

  // --- lateral ---
  let steer, gripScale;
  if (c.human) {
    steer = inp ? (inp.steer ?? 0) : Input.steer(dt);   // dt: ramps advance per physics step
  }
  else {
    // Adaptive preferred lane: under traffic density, slowly bias toward the
    // freer side so midfield trains fan out instead of locking one line forever.
    _aiLane.traits = aiT; _aiLane.nearby = nearbyN; _aiLane.roomL = roomL; _aiLane.roomR = roomR;
    _aiLane.street = !!track.street; _aiLane.baseLane = c.lanePref != null ? c.lanePref : c.lane;
    _aiLane.queueT = c.queueT || 0;
    c.lane = AiDrive.adaptLane(c.lane, _aiLane, dt);
    const kA = Tracks.curvature(track, wrapS(c.s + clamp(c.speed * 0.7, 18, 70)));
    // THE LINE (TrackLine, baked at build): outside-inside-outside through every
    // corner, read a short way ahead so the lateral step's lag does not turn in
    // late. Its weight is 1 in a corner window and 0 on a straight, where the
    // car's own lane preference spreads the field instead. The old target was
    // `-kA * 130 * hw` mixed 55 % with the lane: an inside-hugging line that
    // entered corners already inside (measured on monza: entry +1..+3.6 m
    // inside, apex only +1.2 m inside), and a lane-biased car apexed on the
    // OUTSIDE all lap. AiDrive.lineFollow says how much of the line a driver
    // takes; the remainder is their lane, which is what makes the field two
    // lines wide into a corner instead of one.
    // LINE FAMILY (TrackLine.at's third argument): defending, or
    // passing on the inside of the next corner, reads the INNER line (inside
    // on entry); passing around the outside reads the OUTER one (wide through
    // the long corners). Damped, so a pass or a defence is one coherent line
    // change from entry to exit rather than a sideways push on the racing line.
    const famWant = c.passOf ? (c.passSide * -(kA >= 0 ? 1 : -1) > 0 ? 1 : -1) : (c.defendSide ? 1 : 0);
    c.aiFam = damp(c.aiFam || 0, famWant, 1.5, dt);
    const lead = clamp(c.speed * 0.3, 8, 25);
    const follow = AiDrive.lineFollow(!!track.street, AiDrive.houseStyle(c.team, c.seat, c.houseStats).hold);
    const laneX = c.lane * (hw - 1.2);
    const ln = TrackLine.at(track, wrapS(c.s + lead), c.aiFam);
    let targetX = clamp(lerp(laneX, ln.x, ln.w * follow), -(hw - 1.0), hw - 1.0);
    // The target path's TANGENT (m/m) 4 m further on: the feed-forward heading
    // the controller below steers to, so the line is followed, not chased.
    // (`ln` is TrackLine.at's shared object — targetX is read before this call.)
    const ln2 = TrackLine.at(track, wrapS(c.s + lead + 4), c.aiFam);
    let tanT = (clamp(lerp(laneX, ln2.x, ln2.w * follow), -(hw - 1.0), hw - 1.0) - targetX) / 4;
    // A missed braking point runs WIDE: the target goes most of the way to the outside edge.
    if (AiDrive.mistakePhase(c.errT) === 1 && Math.abs(kA) > 0.004) targetX = lerp(targetX, Math.sign(kA) * (hw - 0.9), 0.7);
    // Overtake: if a slower car is blocking our lane ahead, ease toward the side
    // with more room to pass. Collision-aware — the move is scaled down if that
    // side is also tight (a car alongside or a wall), so we don't dive into a
    // gap that isn't there. Uses the prog-based blocker, immune to rank swaps.
    let overtake = 0;
    const CLEAR = AiDrive.minLatGap(hw, !!track.street);
    c.passCool = Math.max(0, (c.passCool || 0) - dt);
    c.passFailT = Math.max(0, (c.passFailT || 0) - dt);
    const _atk = TrackLine.attackAt(track, c.s);   // where the move is on (baked attack zones)
    // THE NEXT CORNER (AI-only reads): its curvature just past the turn-in owns the pass side and the level side-by-side; its zone's quality says whether to get a run.
    c.kTurn = _atk.toTurnIn < 400 ? AiDrive.cornerK(Tracks.curvature(track, wrapS(c.s + _atk.toTurnIn + 10)), Tracks.curvature(track, wrapS(c.s + _atk.toTurnIn + 30)), Tracks.curvature(track, wrapS(c.s + _atk.toTurnIn + 55))) : 0;
    c.runT = blocker && blockerGap < 40 ? AiDrive.runExtra(k, track.attackQ ? track.attackQ[Math.floor(wrapS(c.s + _atk.toTurnIn - 2) / track.total * track.n) % track.n] : 0, c.atkWant, !!track.street) : 0;
    // MISTAKES (AiDrive.mistakeChance): pressure is the share of the last six
    // Slice 4: easy/normal visibility lift lives in AiDrive.mistakeChance (DIFF.err frozen).
    // seconds with a car within 0.6 s behind; the roll is once per braking
    // point, from a hash (never simRnd), and never while alongside a car.
    c.pressT = clamp((c.pressT || 0) + (chaser && chaserGap < 0.6 * Math.max(c.speed, 10) ? dt : -dt * 0.5), 0, 6);
    c.errT = Math.max(0, (c.errT || 0) - dt);
    if (_atk.toTurnIn < Math.max(c.speed, 10) * 1.2) {
      const zk = Math.round(wrapS(c.s + _atk.toTurnIn));
      if (zk !== c.zoneKey) {
        c.zoneKey = zk;
        if (!c.errT && !alongO && DriverRatings.hash32(luckSeed() + ":" + (isChampionship() ? SeasonCal.drawRound(season) : raceIndex) + ":" + c.gridPos + ":" + c.lap + ":" + zk) / 4294967296 < AiDrive.mistakeChance(aiT, c.pressT / 6, dd.err)) { c.errT = AiDrive.mistakeTotal(); c.errCount = (c.errCount || 0) + 1; }
      }
    } else c.zoneKey = -1;
    c.wheelLock = AiDrive.mistakePhase(c.errT) === 1 && braking ? 1 : 0;   // the render freezes the fronts
    // THE PASS LATCH. Once a pass is chosen it is held as a POSITION beside the
    // car being passed (AiDrive.passTarget) with the side FROZEN, and it is
    // released only on a real outcome: we are past, we lost the car, the side
    // closed, or patience ran out. The old bias recomputed from zero every frame
    // from a blocker classification the pass itself flips — see passTarget in
    // ai-drive.js for the measured chatter that produced.
    if (c.passOf) {
      const po = c.passOf;
      let dp = po._snapProg - c.prog;
      dp = ((dp + track.total / 2) % track.total + track.total) % track.total - track.total / 2;
      const sideRoom = c.passSide > 0 ? Math.min(roomR, roadR) : Math.min(roomL, roadL);   // the ROAD's room, not the run-off's
      if (po.finished || po.retired || cautionLevel() >= 2 || dp > AI_PASS_LATCH_M || !Number.isFinite(dp)) { c.passOf = null; }   // lost it, or a VSC / safety car came out: no penalty
      // PAST: done. The pass is complete, and the car we just cleared does not
      // get to counter-attack us on the same stretch — it takes the SAME
      // "threshold endured" lockout an abandoned pass gives its own attacker,
      // against us specifically (rFactor 2's term; Game AI Pro ch.38 calls it
      // hysteresis on the overtake state machine). Without it nothing at all
      // separated a completed pass from a re-pass, and 74 % of the field's
      // order changes at monza were the same PAIRS trading places over and
      // over rather than the field racing (tools/check/ai-field.mjs splits
      // settled passes from oscillation; docs/notes/AI-FIELD-RESEARCH.md).
      // Scaled by the PASSED car's own experience, not ours, and never written
      // onto a human — a player may re-pass whenever they like.
      else if (dp < -(LCAR + 1.5)) {
        c.passOf = null;
        if (!po.human && !po.retired) {
          po.passFailOf = c;
          /* traits() HANDS BACK A SHARED SCRATCH (ai-drive.js _traits), and the
             `aiT` bound at the top of this car's update still aliases it — so
             reading the PASSED car's ratings here overwrote this car's for the
             rest of the tick, and every AiDrive.passCooldown(aiT) below then
             cooled the overtaker on the overtaken driver's craft. The module's
             own comment states the contract ("callers must read fields before
             the next traits() call"); this was the one site that broke it.
             Take po's number, then put c's ratings back. */
          const poCool = AiDrive.repassLock(AiDrive.traits(po), (paceVmax(po) - paceVmax(c)) / vTop());
          if (!c.human) AiDrive.traits(c);
          po.passFailT = Math.max(po.passFailT || 0, poCool);
          if (po.passOf === c) { po.passOf = null; po.passCool = po.passFailT; }
        }
      }
      else if (AiDrive.passSideClosed(sideRoom, c.passSide * (AiDrive.passTarget(po._snapX, c.passSide, CLEAR, hw) - c.x), WCAR)) { c.passOf = null; c.passCool = AiDrive.passCooldown(aiT); }       // side closed: no room left to REACH the pass lane
      else if (squeezed) { c.passOf = null; c.passCool = AiDrive.passCooldown(aiT); }             // walked to the edge: abandon it
      // NOT ON: at the turn-in and still not half alongside — that is a lunge
      // (the FIA's inside-pass entitlement is the front axle past the mirror
      // at the apex). Abandon it, and remember the car: the same car is not
      // re-attacked for twice the cooldown (rFactor 2's "threshold endured").
      // A car with 12 % of pace in hand keeps the move: it will be alongside under braking.
      else if (_atk.toTurnIn < 6 && dp > AiDrive.sideLevel() && Math.max(aiFreeSpeed, blocker === po ? 0 : vmax) < paceVmax(po) + 0.12 * vTop()) { c.passOf = null; c.passCool = AiDrive.passCooldown(aiT); c.passFailOf = po; c.passFailT = 2 * AiDrive.passCooldown(aiT); }
      else {
        // Patience refreshes while we GAIN on the car; it runs down while we do not.
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
      // Side-pick + incentive inputs. kA is the same AI-only curvature read the
      // racing line above already makes — the arc reaches the AI's choice of
      // side, never the driver. blockerVmax is the car's PACE, not its speed
      // this instant (AiDrive.otWant says why that matters). A HUMAN's vmax is
      // only its CAR's, and its live speed is low in every corner — so it is
      // judged by its paceF against the field (paceVmax, AiDrive.paceSample).
      _aiOtPull.kAhead = kA; _aiOtPull.lane = c.lane; _aiOtPull.freeSpeed = aiFreeSpeed;
      // ...and with the blocker's X-mode gain taken back out: freeSpeed is read before our own flap opens, so a raw _vmaxNow hid up to 15 % of pace
      _aiOtPull.blockerVmax = paceVmax(blocker); _aiOtPull.vTop = vTop(); _aiOtPull.queueT = c.queueT || 0;
      _aiOtPull.blockerAccel = blocker.human ? (blocker.axEstSm || 0) : (blocker.accSm || 0);
      // Engage only with a reachable lane and no cooldown on this stretch.
      // ...and only where the move is ON (AiDrive.attackOK: a straight, or an
      // attack zone at its baked quality), and not on a car we just gave up on.
      _aiOtPull.attackQ = _atk.q; _aiOtPull.toTurnIn = _atk.toTurnIn; _aiOtPull.kTurn = c.kTurn; _aiOtPull.calm = c.calm || 0;
      _aiOtPull.roll = AiDrive.attemptRoll(c.raceHash, c.lap, Math.round(wrapS(c.s + _atk.toTurnIn)));   // a fresh roll per braking zone
      c.atkWant = AiDrive.otWant(_aiOtPull);
      const sameCar = blocker === c.passFailOf && (c.passFailT || 0) > 0;
      // No passing under the safety car or VSC (FIA Sporting Regs): the
      // caution capped speed but the pass logic ran on, 27 moves in 60 s.
      const moveOn = c.atkOn = raceCtl.level < 2 && !sameCar && c.atkWant && AiDrive.attackOK(_aiOtPull);
      if (!c.passOf && c.passCool <= 0 && moveOn && blockerGap <= AI_PASS_LATCH_M && AiDrive.latchLate(_aiOtPull)) {
        const side = AiCorridor.choose(_aiOtPull, c, blocker, cars, track.total, CLEAR, c.passPlan || (c.passPlan = {})).side;
        if (side && (side > 0 ? Math.min(roomR, roadR) : Math.min(roomL, roadL)) >= CLEAR) {
          c.passOf = blocker; c.passSide = side; c.passBest = blockerGap; c.passT = AiDrive.passHold(aiT);
        }
      }
      // Not on: FOLLOW, do not hang half alongside — the bias without the
      // commitment is what parked pairs side by side at monaco (standoffs
      // 0 -> 6 in the bench with the zone gate alone). Impatient equal-pace
      // passes go through otWant + the latch above once corridor finds a side.
      if (!c.passOf) overtake = moveOn && (!c.passPlan || c.passPlan.side) ? AiDrive.otPull(_aiOtPull) : 0;
    }
    else c.atkOn = c.atkWant = false;
    if (c.passOf && raceCtl.level >= 2) c.passOf = null;   // a move under way when the SC/VSC comes out is abandoned
    if (c.passOf) overtake = AiDrive.passTarget(c.passOf._snapX, c.passSide, CLEAR, hw) - targetX;
    // LET PASS moves aside instead of defending; the `!letPass` below is what
    // stops the AI covering a line it has already decided to concede.
    let yieldPull = 0;
    if (letPass) {
      const freeSide = roomR >= roomL ? 1 : -1;
      const freeRoom = freeSide > 0 ? roomR : roomL;
      if (freeRoom > 1.6) yieldPull = freeSide * AiDrive.letPassPull(aiT, !!track.street) * clamp(freeRoom / 2.4, 0, 1);
    }
    let defend = 0;
    if (chaser && (!blocker || chaserGap < blockerGap) && !letPass) {   // mid-train too, when the attack behind is nearer than the car ahead
      _aiDefend.street = !!track.street; _aiDefend.traits = aiT; _aiDefend.speed = c.speed;
      _aiDefend.team = c.team; _aiDefend.seat = c.seat; _aiDefend.stats = c.houseStats;
      _aiDefend.chaser = true; _aiDefend.chaserGap = chaserGap; _aiDefend.chaserSpeed = chaser._snapSpeed;
      _aiDefend.kA = kA; _aiDefend.roomL = roomL; _aiDefend.roomR = roomR; _aiDefend.other = chaser; _aiDefend.x = c.x;
      _aiDefend.blocker = blocker; _aiDefend.blockerGap = blockerGap; _aiDefend.kTurn = c.kTurn; _aiDefend.toTurnIn = _atk.toTurnIn; _aiDefend.roadL = roadL; _aiDefend.roadR = roadR;
      defend = AiDrive.defendPull(_aiDefend);
    }
    // One defensive move per straight (AiDrive.defendOnce); the side resets in
    // the braking zone, where defending is over anyway (holdLine below).
    if (braking) { c.defendSide = 0; defend = 0; }   // NO MOVE UNDER BRAKING (FIA), the cover included
    else { AiDrive.defendOnce(defend, c.defendSide || 0, _aiDefOnce); defend = _aiDefOnce.defend; c.defendSide = _aiDefOnce.side; }
    // Stuck recovery: if we've been wedged/slow, commit hard to dig out. Pick the
    // clearly-freer side; when both sides are gone (a wall pile), pull TOWARD the
    // centre of the road so a stacked group fans off the barrier instead of all
    // diving the same lane-sign way into each other; only when centred fall back
    // to the car's own lane so a mid-road pile still splits both ways.
    const freer = roomR - roomL;
    const unstuckSide = Math.abs(freer) > 1 ? (freer > 0 ? 1 : -1)
      : (Math.abs(c.x) > 1.5 ? (c.x > 0 ? -1 : 1) : (c.lane >= 0 ? 1 : -1));
    const unstuck = unstuckActive ? unstuckSide * AiDrive.unstuckPull(aiT, !!track.street) : 0;
    // Proactive lateral separation, accumulated in the traffic scan above: push
    // toward a minimum side-by-side gap, proportional to the deficit, fading to
    // zero once spaced — the fused loop excludes self by IDENTITY, since a
    // rank-index check could skip the leader on a stale c.rank.
    const sepMax = AiDrive.sepClamp(!!track.street);
    sep = clamp(sep, -sepMax, sepMax);
    // clamp the combined target to the drivable surface so overtake/unstuck/
    // separation biases can never steer the AI off the track or into a wall.
    // The biases are SLEWED (AI_BIAS_SLEW): a pass decision, a defence, a
    // yield or a separation becomes a lane change at a car's lateral pace, not
    // a step in the target for the controller to chase. The dig-out is not.
    const biasWant = overtake + defend + yieldPull + sep;
    c.aiBias = c.aiBias == null ? biasWant : c.aiBias + clamp(biasWant - c.aiBias, -AI_BIAS_SLEW * dt, AI_BIAS_SLEW * dt);
    let desiredX = clamp(targetX + c.aiBias + unstuck, -(hw - 0.5), hw - 0.5);
    // NO MOVING UNDER BRAKING (AiDrive.holdLineGap): braking with a car within a
    // second behind, and not ourselves attacking, the offset from the racing
    // line is frozen at what it was when the brakes went on — the line itself
    // still sweeps into the corner. Measured before: 128 line changes over
    // 1.5 m in half a second under braking with a chaser, per four minutes at
    // monza. The rub constraint below still overrides it (safety first).
    const holdLine = braking && chaser && !c.passOf && !unstuckActive && chaserGap < AiDrive.holdLineGap(c.speed);
    if (holdLine) {
      if (c.holdOff == null) c.holdOff = desiredX - targetX;
      desiredX = clamp(targetX + c.holdOff, -(hw - 0.5), hw - 0.5);
    } else c.holdOff = null;
    // SIDE RUB AS A CONSTRAINT, NOT A SUGGESTION. `sep` is proportional to the
    // deficit (≤ 0.8 m once touching) and the steering deadzone below drops
    // anything under 0.3 m, while the shared racing line pulls the outer car up
    // to 2.4 m INTO the pair — so two cars on lines half a metre apart settled
    // at |dx| 1.5-1.8 and rubbed every frame (closed form in the audit; measured
    // as every standoff in the bench sitting at dx ≈ 1.9). The car that yields
    // (AiDrive.sideYieldsA — behind on arc, or the outer car when level) is held
    // a full lane off the other on the side it is already on. A hard edge gives
    // the deadzone an error it cannot swallow.
    let rubClamp = false;
    const alongClose = !!alongO && Math.abs(alongDx) < CLEAR;
    // THE AIM, NOT THE CONTACT (AiDrive.aimIntrudes): is our aim point inside
    // the other car's clear gap and on their side of where we are? Asked of a
    // HUMAN neighbour only. Asked of every neighbour it also worked (Monza,
    // first touches with a scripted player 5.6 -> 3.1 per 100 s), but the
    // AI-only field paid for it: settled passes 40 -> 30 per 240 s, every seed
    // at or under the old minimum, and the field strung out 1091 -> 1238 m —
    // two AI cars both running the election at aim distance concede a
    // side-by-side neither has lost yet. Between AI cars the contact-time
    // election below stays; a human runs no election at all, which is why
    // the aim is the right moment there (AiDrive.aimIntrudes).
    const aimClose = !!alongO && !alongClose && !!alongO.human && AiDrive.aimIntrudes(desiredX, c.x, alongO._snapX, CLEAR);
    let yieldMine = alongClose && AiDrive.sideYieldsA(-alongDprog, c.x, alongO._snapX, c.kTurn);
    // ELECTING THE HUMAN IS ELECTING NOBODY — rule and measurement in
    // AiDrive.humanYieldGrace; this end only carries the per-car timer.
    // Are WE steering into them (aim vs where we already are), and is there
    // still room left to concede? Both halves matter — AiDrive.humanYieldT.
    const inBand = alongClose && Math.abs(alongDx) < CLEAR - AiDrive.humanYieldBand();
    const intruding = inBand && (alongDx <= 0 ? desiredX < c.x : desiredX > c.x);
    c.hYieldT = AiDrive.humanYieldT(c.hYieldT, !!alongO && Math.abs(alongDx) < CLEAR + 1, yieldMine, !!(alongO && alongO.human), intruding, dt, inBand);
    if (!yieldMine && AiDrive.humanYieldTakes(c.hYieldT)) yieldMine = true;
    // A HUMAN neighbour: an aim into their gap is conceded at once. Nobody else
    // in the pair will, and a clear gap held at the aim point IS the clean
    // side-by-side the grace protects — the grace stays for the contact case.
    if (!yieldMine && aimClose && alongO.human) yieldMine = true;
    c.sbsT = yieldMine ? (c.sbsT || 0) + dt : 0;   // read by COMMIT OR YIELD above, next frame
    if (yieldMine) {
      desiredX = alongDx <= 0 ? Math.max(desiredX, alongO._snapX + CLEAR) : Math.min(desiredX, alongO._snapX - CLEAR);
      desiredX = clamp(desiredX, -(hw - 0.5), hw - 0.5);
      // Only a car ALREADY inside the gap is an emergency for the controller
      // below; at aim distance the heading state bends the line in time.
      rubClamp = alongClose;
    }
    // PIT LANE, last so nothing can undo it: a car serving a stop drives the
    // LANE, not the racing line. pits.laneX returns its argument untouched for
    // every car that is not in there (PitLane, laneX — and the gap it closes).
    if (pits) {
      const lx = pits.laneX(c, hw, desiredX);
      // Guided: the heading follows the LANE's line, not the racing line's
      // slope (tanT) — which leaned a car in the fast lane on the platform
      // barrier the whole way down the Bahrain lane (traced, aiHead +0.15).
      if (lx !== desiredX) { desiredX = lx; tanT = 0; }
    }
    const err = desiredX - c.x;
    const vAbs = Math.abs(c.speed);
    // A contact, a rub clamp or a dig-out is an EMERGENCY: the position loop
    // keeps its full, immediate authority there (the collision bench pins that
    // a yielding AI is clear of the car it touched within a few frames —
    // collisions-deep-vm, collision-contact-vm); the heading state is re-synced
    // from the steer it produced so the hand-back is seamless.
    const emergency = unstuckActive || rubClamp || (c.contactT || 0) > 0;
    if (emergency || vStd(vAbs) < AI_HEAD_VMIN) {
      // Crawling or digging out: a heading means nothing without speed to carry
      // it, so the position controller drives — soft deadzone (no micro-twitch
      // around the target) and the experience-rated low-pass, as before.
      let e = err;
      if (Math.abs(e) < 0.3) e *= Math.abs(e) / 0.3;
      steer = clamp(e * 0.9, -1, 1);
      if (c.steerSm === undefined) c.steerSm = steer;
      c.steerSm = damp(c.steerSm, steer, AiDrive.steerDamp(aiT), dt);
      steer = c.steerSm;
      // The heading the lateral speed this steer produces would need at this speed.
      const vl = steer * STEER_VMAX * clamp(vStd(vAbs) / 18, 0, 1);
      c.aiHead = vAbs > 1 ? clamp(Math.asin(clamp(vl / vAbs, -1, 1)), -AI_HEAD_MAX, AI_HEAD_MAX) : 0;
    } else {
      // HEADING STATE. The old loop was proportional on POSITION:
      // steer = 0.9·err — 13.5 m/s of lateral speed per metre of error, the
      // same frame — so every target change was a lateral-velocity step and
      // the nose twitched (measured on a solo Monza lap: 5.4 steering
      // reversals/km, lateral jerk RMS 10 m/s²; tests/unit/ai-racecraft-vm).
      // Now the car carries a heading off the road tangent, steered toward the
      // target path's tangent plus a cross-track term atan(k·e/v) (Stanley),
      // and the heading may only change at the yaw rate the lateral grip
      // budget allows: a_lat = v·yawRate ≤ AI_YAW_LAT·LAT_MAX·grip. The
      // lateral speed is v·sin(heading); `steer` is that as a fraction of the
      // full-lock authority, so every existing multiplier on the step below
      // (grip taper, kerb, contact give, off-track fade) still applies.
      // These inputs stay fixed through the heading and lateral-authority calculations.
      const steeringGrip = gripMult(c) * tyres.gripMul(c) * dirtyAirMul(c.wake || 0, c.speed);
      const headWant = clamp(Math.atan(tanT) + Math.atan(AI_XTRACK_GAIN * err / Math.max(vAbs, 1)), -AI_HEAD_MAX, AI_HEAD_MAX);
      const yawMax = Math.min(AI_YAW_MAX, AI_YAW_LAT * LAT_MAX * AiDrive.yawScale(c.speed, c.aeroLoad, steeringGrip, PACE, VMAX) / vAbs);   // no wings in the yaw budget (AiDrive.yawScale)
      const head0 = c.aiHead || 0;
      c.aiHead = head0 + clamp(headWant - head0, -yawMax * dt, yawMax * dt);
      gripScale = AiDrive.lateralScale(c.speed, c.aeroLoad, steeringGrip, PACE, VMAX, aeroDfMult(c));   // X-mode costs the AI its wings too
      steer = clamp(vAbs * Math.sin(c.aiHead) / Math.max(STEER_VMAX * clamp(vStd(vAbs) / 18, 0, 1) * gripScale, 1), -1, 1);
      c.steerSm = steer;
    }
  }
  // Lateral authority scales with speed and is ZERO at a standstill: a car
  // that isn't moving can't be steered sideways, so tilting while stopped no
  // longer slides you around. Full authority by ~65 km/h.
  // At high speed, grip tapers off slightly to model understeer.
  const latFac = clamp(vStd(Math.abs(c.speed)) / 18, 0, 1);
  if (gripScale === undefined) gripScale = AiDrive.lateralScale(c.speed, c.aeroLoad, gripMult(c) * tyres.gripMul(c) * dirtyAirMul(c.wake || 0, c.speed), PACE, VMAX, aeroDfMult(c));
  // Riding a kerb loses a little grip — kerbGripSm already damped with the speed cut.
  const kerbGrip = c.kerbGripSm ?? 1;
  // Banking: computed once, shared between player and AI so both get grip boost.
  // bankAngle === banking().roll (mesh.js); no second lookup.
  const bankPhys = Tracks.banking(track, c.s, 0, _bankScratchP);
  const bankRoll = bankPhys ? Math.abs(bankPhys.roll) : 0;
  const bankMu = 1 + Math.sin(bankRoll) * 0.8;
  // Track-frame dynamic bicycle model for the player. c.head = real world
  // heading (rad); c.yawRateCur/c.vLat = yaw rate and body lateral velocity.
  // Per-axle tyre forces (from slip angles, grip-capped) drive yaw and lateral
  // accel exactly as before — the nose keeps a true world heading so it can point
  // off the tangent (understeer, a slide, leaning into a wall). The car's POSITION
  // then advances directly in the track frame: build the world velocity from the
  // heading and dot it onto the local tangent/right to step (c.s, c.x), instead of
  // integrating a separate world point and searching for it on the centreline.
  // No Tracks.project() round-trip means progress can't snap onto the wrong leg at
  // a hairpin and (s, x) can't desync from a world position. c.px/c.pz are kept
  // only as a derived mirror for debug/telemetry. See the constants block.
  if (c.human) {
    if (c.px == null) {   // init world pos from current Frenet state (first frame)
      const w0 = worldFromTrack(c.s, c.x, smp);   // exact inverse of trackFrom
      c.px = w0.x;
      c.pz = w0.z;
      c.head = Math.atan2(smp.t[0], smp.t[2]);
      c.vLat = 0;
      c.yawRateCur = 0;
    }
    // Fade the lateral model out toward a standstill so a parked car can't be
    // spun by steering (slip angle is undefined at zero speed).
    const sp = clamp(Math.abs(c.speed) / 3, 0, 1);
    const shaped = Math.sign(steer) * Math.pow(Math.abs(steer), STEER_EXPO);
    // --- road-wheel steer angle: driver lock (eased a little at speed) + the
    // DRIVING-HELP assist that steers toward the road curvature for you. Both
    // act through the front tyre below, so neither can exceed available grip.
    // vStd: the SPEED STEER slider's reference is a point on the dial, so the lock
    // taper reaches the same place at every pace. The slider's own mapping
    // (speedRefFromSlider in js/input/steer-tuning.js) moved with this formula —
    // see its comment.
    // HYPERBOLIC raw = 1/(1+vs/ref) (PHASE-C §2; never negative, no floor). Hold
    // full lock for vs≤15 (hairpin), blend 15→30, raw for vs≥30 so ≥60 m/s is
    // bit-identical to the old taper (vStd pace-cancels; SPEED STEER dial OK).
    const vs = vStd(Math.abs(c.speed)), raw = 1 / (1 + vs / STEER_SPEED_REF), lockTaper = vs <= 15 ? 1 : (vs >= 30 ? raw : 1 + (raw - 1) * (vs - 15) / 15);
    const driverDelta = shaped * STEER_MAX_SLIP * lockTaper;
    // DRIVING-HELP assist: the steer needed to track curvature k is the kinematic
    // term (L·k) PLUS a speed-squared understeer term — a car needs progressively
    // more lock to hold the same radius as speed rises. Supplying both is what
    // lets the assist actually keep the car on the road at racing speed (at low
    // speed the v² term vanishes and it's just gentle centring).
    // The speed² term compensates for understeer that grows with speed. But
    // braking hard into a corner loads the front axle (weight transfer below)
    // while you're still fast, so the v² assist spikes and over-rotates the car
    // onto the apex — the "snap to the inside" when braking for a corner. Fade
    // that compensation with braking effort, using the SMOOTHED longitudinal
    // accel so it eases in rather than toggling: trail-braking still rotates the
    // car, but the hard-braking turn-in spike is gone.
    const brakeFade = 1 - 0.8 * clamp(-(c.axEstSm ?? 0) / BRAKE, 0, 1);
    // Curb entry over-rotation generally (not just under braking): the assist
    // tracks curvature k, but if the car is ALREADY yawing into the corner
    // faster than k needs, adding more lock just cuts it to the apex. Ease the
    // assist by how far the current yaw rate exceeds the rate that follows the
    // road (rNeed = v·k). Same-sign only, so it does nothing at steady state
    // (yaw ≈ rNeed), on straights (k ≈ 0), or while countersteering a slide —
    // it only bites on the transient overshoot. This is the right answer to
    // "taper the assist at speed": tie it to actual over-rotation, not raw speed
    // (a blanket speed taper would just make the car understeer wide).
    // Off-track, fade out the road-following assist so the driver keeps full
    // manual authority to recover. On grass the car isn't on the racing line, so
    // steering toward the track's curvature just shoves it one way ("pushed
    // right / toward the turn"). Full assist on tarmac, tapering to zero ~3 m
    // past the road edge. CONTINUOUS in |x|, not gated on c.offroad (which
    // excludes the kerb and would drop ~kerbWidth/3 of the help in one tick at
    // the kerb's outer edge — a snap). The ramp begins at the road edge and
    // crosses the kerb smoothly (slightly less assist ON the kerb — more
    // manual authority there, which kerb-riding wants anyway).
    const offAssistFade = Math.max(0, 1 - Math.max(0, Math.abs(c.x) - hw) / 3);
    // --- the car drives ITS OWN line, not the centreline (see frenetH).
    // Everything below reads kPath, not the centreline's curvature k: the
    // curvature of the arc the car is ACTUALLY on, `x` metres to the side of it.
    // Outside of a corner = bigger radius = less curvature; inside = tighter.
    // The centreline's k makes the middle of the road feel "sticky": the assist
    // would over-steer you whenever you ran wide and under-steer you at every
    // apex, herding the car back to the middle and fighting any line of your own.
    const hFrenet = frenetH(c.s, c.x);
    const kPath = k / hFrenet;
    let yawEase = 1;
    const rNeed = c.speed * kPath;
    if (rNeed !== 0) {
      const ratio = (c.yawRateCur || 0) / rNeed;   // >1 = rotating faster than needed
      if (ratio > 1) yawEase = clamp(1 - (ratio - 1) * 0.6, 0.3, 1);
    }
    const assistDelta = -ROAD_FOLLOW * (WHEELBASE + ASSIST_KUS * c.speed * c.speed * brakeFade) * kPath * yawEase * offAssistFade;
    // Racing-line slider. TrackLine.at is the AI's line; lineW is 0 on a
    // straight so the raw offset there is not a target. Front tyre, not c.x.
    let lineDelta = 0;
    if (raceLineAssist !== 0 && track.line) {
      const look = clamp(Math.abs(c.speed) * 0.9, 25, 90);
      const ln = TrackLine.at(track, wrapS(c.s + look));
      const edge = Math.max(0, hw - 0.6);
      const lineX = clamp(ln.x * ln.w, -edge, edge);
      const Ld = clamp(Math.abs(c.speed) * 1.2, 22, 70);
      lineDelta = raceLineAssist * LINE_PURSUIT * WHEELBASE * 2 * (lineX - c.x) / (Ld * Ld) * offAssistFade;
    }
    // delta filled inside PlayerForces after muF (GripSteer caps driverDelta).
    // --- axle geometry and per-axle vertical load. Longitudinal weight transfer
    // shifts load to the front under braking (sharper turn-in) and the rear on
    // power (a touch of throttle-on looseness) — emergent, not a special case.
    const L = Math.max(2, WHEELBASE);
    const ar = FRONT_WEIGHT * L, af = L - ar;            // CG → rear / front axle
    // Smooth longitudinal accel estimate over ~0.25 s so weight transfer doesn't
    // snap instantly when throttle/brake state toggles — removes the twitchy
    // left-right twitch you'd otherwise see the moment you press the throttle.
    // Fade the throttle accel target toward 0 as the car approaches vmax: when
    // speed-limited the throttle is still held but real accel ≈ 0, so without
    // this the friction ellipse would shave cornering grip (and add rear weight
    // transfer) for an acceleration that isn't actually happening.
    // The SURFACE brakes you too — surfMu below scaled LATERAL grip alone, so a tyre on grass retarded the car as hard as one on tarmac. Same lerp, same depth.
    // Brake held at a standstill IS reverse (REVERSE_ACCEL above), not a 30+ m/s^2 stop: charging the pedal locked the fronts and grew a flat spot backing off a wall.
    const axEstTarget = braking ? (c.speed > 0 ? -brakeDecel : (c.speed > REVERSE_MAX ? -REVERSE_ACCEL * surfaceMu : 0))
      : (onThrottle
          ? (ACCEL * PACE * perfMul * (c.human ? mods.accel * throttleLvl : 1) * clamp(1 - c.speed / Math.max(vmax, 1), 0, 1) * gearMult + deploy) * surfaceMu
          : -COAST_DRAG * (1 - xCoastCut(c) * (c.aeroX || 0)));
    c.axEstSm = damp(c.axEstSm ?? axEstTarget, axEstTarget, 10, dt);
    const wt = clamp(-c.axEstSm / LAT_MAX * WT_LONG, -0.16, 0.18);
    const loadF = FRONT_WEIGHT + wt, loadR = (1 - FRONT_WEIGHT) - wt;
    // --- road-surface grip modifiers ---
    // bankMu computed above, shared with AI.
    // Vertical load: crests reduce normal force (car goes light, less grip);
    // valleys increase it (car feels planted). Estimated from slope change over
    // 12 m. Low-pass filtered so the v²·kv term doesn't oscillate as speed
    // builds on the throttle — the road curvature changes over hundreds of metres,
    // not per-frame.
    Tracks.sample(track, wrapS(c.s + 12), smp2);
    const kv = ((smp2.t[1] || 0) - slopeSin) / 12;
    const vtRaw = clamp(kv * c.speed * c.speed / 9.8, -0.20, 0.20);
    c.vertLoad = damp(c.vertLoad ?? vtRaw, vtRaw, 4, dt);
    const vertLoad = c.vertLoad;
    // PlayerForces (js/physics/player-forces.js): combined slip → axle µ →
    // soft tyre Fy → yaw/vLat/head. Explicit ctx bag — no new G members.
    // Frenet world writeback (px/pz → s,x) stays below.
    playerForces.step(c, {
      dt, driverDelta, assistDelta, lineDelta, onThrottle, throttleLvl, gearMult, deploy, braking,
      surfaceMu, kerbGrip, bankMu, modsCornering: mods.cornering,
      loadF, loadR, vertLoad, af, ar, sp, steer,
      weatherGrip: gripMult(c), aeroDf: aeroDfMult(c),
      dirtyMul: dirtyAirMul(c.wake || 0, c.speed),
      coastCut: xCoastCut(c), vTopNow: vTop(), tyres,
    });
    const fx = Math.sin(c.head), fz = Math.cos(c.head);
    // world velocity = forward + lateral slip along the car's RIGHT vector (-fz, fx),
    // the track's own right (tracks.js r = t×up). PlayerForces integrates +vLat as
    // RIGHT (axle slip vLat ± a·r, transport −u·r, +r = nose right); writing it back
    // along the LEFT vector (fz, −fx), as this did until 2026-10-04, mirrored the
    // body-slip angle in the world (β_world = −β_dyn, VM-measured) — docs/PHYSICS.md §Frame.
    const vWx = c.speed * fx - c.vLat * fz;
    const vWz = c.speed * fz + c.vLat * fx;
    // …and MOVE THE CAR, in world metres. This is the whole model: a rigid body
    // going where its own tyres point. The road is not in this equation.
    //
    // px/pz/head are the truth, and (s, x) is READ BACK off them below purely so
    // the rest of the game (lap timing, walls, kerbs, race position, the HUD) can
    // ask "where on the track is that?". Rebuilding the world position from
    // (s, x) instead would make the car inherit every kink in the road's chart.
    c.px += vWx * dt;
    c.pz += vWz * dt;
    // Predict s from the distance covered along the road (÷ h, the Frenet stretch
    // — see frenetH), then let trackFrom() pin it to the true perpendicular foot.
    // The predictor only has to be close; it exists so the refinement stays local.
    let tX = smp.t[0], tZ = smp.t[2]; const tL = Math.hypot(tX, tZ) || 1; tX /= tL; tZ /= tL;
    const tf = trackFrom(c.px, c.pz, c.s + (vWx * tX + vWz * tZ) * dt / hFrenet);
    c.s = tf.s;
    c.x = tf.x;
    steer = clamp(shaped, -1, 1);   // steer vis = driver input only, not assist
  } else {
    // While rubbing another car (contactT>0) the AI goes compliant: it stops
    // driving hard back to its racing line, so a player leaning on it can
    // actually move it sideways instead of bouncing off a rigid, on-rails line.
    // Awareness scales how much they yield (AiDrive.contactGive). TOWARD the
    // contact only: a yielder steering AWAY keeps its full authority, or the
    // compliance that lets a player move an AI also held the AI against the
    // player it was trying to leave (collision bench S5: a whole second of rub).
    const toward = !alongO || Math.sign(steer) === Math.sign(alongDx);
    const give = AiDrive.contactGive((c.contactT || 0) > 0 && toward, aiT, !!track.street);
    // Same off-track lateral fade the player gets via surfMu, so the AI does not
    // keep full STEER_VMAX authority on grass while the human is grip-thinned. Continuous in |x| past the edge (player idiom).
    const aiSurfMu = surfaceMu;
    // latFac is zero at a standstill — the exact state the dig-out exists for,
    // so the pull it computes could never be applied. Floored while
    // unstuckActive ONLY (AiDrive.unstuckLatFloor); slow running is untouched.
    const aiLat = unstuckActive ? Math.max(latFac, AiDrive.unstuckLatFloor(!!track.street)) : latFac;
    c.x += steer * STEER_VMAX * aiLat * gripScale * kerbGrip * bankMu * give * aiSurfMu * dt;
    // Debris side-world (A2): AI cars don't run the slip model, so estimate a
    // slide from lateral-g demand (|k|·v²/g) and treat hard braking at speed as
    // lock-up. READ-ONLY, cosmetic — matches the player marble hook.
    if (DebrisWorld.active()) {
      const latG = Math.abs(k) * c.speed * c.speed / 9.8;   // ~lateral g demand
      _marbleArg.lock = (braking && vStd(c.speed) > 30) ? 0.95 : 0;   // vStd: a threshold, not a force
      _marbleArg.slip = Math.max(0, Math.min(1, latG - 1.6)) * 0.14;   // → ~slip-angle rad at the limit
      _marbleArg.speed = c.speed;
      DebrisWorld.tyreMarble(c, _marbleArg);
    }
  }
  // set skid intensity once per frame (used by audio and by visual marks)
  if (c.human) {
    // Squeal from the CAR's own slip, not from the road's curvature. This used to
    // be |k| * speed — so the tyres screamed because the ROAD bent, even if you
    // were driving dead straight through the corner with the tyres perfectly
    // stuck, and stayed silent while you were genuinely sliding down a straight.
    // With the assists off the arc must not reach the driver at all, and that
    // includes what they hear. Body slip angle: ~6 deg starts to talk, ~17 deg is
    // a full slide.
    const slipAng = Math.abs(Math.atan2(c.vLat || 0, Math.max(4, Math.abs(c.speed))));
    // A locked front (c.wheelLock, player-forces / the AI mistake phase) is a
    // skid too: it squeals, marks and smokes like a slide, scaled by how locked.
    // Until 2026-10-01 a lock-up only froze the wheel's spin (car-draw).
    c.skidIntensity = c.offroad ? 0.5
      : Math.max(clamp((slipAng - 0.10) / 0.20, 0, 1), (c.wheelLock || 0) * 0.9);
  }
  // WallClamp (js/physics/wall-clamp.js): barrier / pit / gantry hard clamp +
  // human slide-along scrub + conditional road→world writeback when xPinned.
  // Collide keeps the post-contact soft clamp; peers editing walls own this file.
  _wallCtx.track = track; _wallCtx.dt = dt; _wallCtx.steer = steer; _wallCtx.soundOn = soundOn;
  WallClamp.apply(c, _wallCtx);
  Damage.observe(c, dt, vTop());   // DISPLAY-ONLY damage readout (js/race/damage.js): barrier strikes + pit repair; nothing reads it back
  c.brakeDemand = braking ? brakeLvl : 0; c.throttleDemand = onThrottle && !braking ? throttleLvl : 0; c.steerCommand = steer;
  c.steerVis = damp(c.steerVis, steer, 10, dt);
  // Visual nose yaw. The player uses its REAL heading relative to the track
  // tangent, so the body visibly points where the car is actually aimed (turn-in,
  // understeer, a slide) instead of just echoing the stick. AI cars have no world
  // heading, so they lean from steer input + corner curvature (k>0 curves toward
  // screen-left, nose yaws toward -x — hence the negative sign).
  let yawTarget;
  if (c.human && c.head != null) {
    let psi = Math.atan2(smp.t[0], smp.t[2]) - c.head;   // + = nose turned right (+x)
    while (psi > Math.PI) psi -= 2 * Math.PI;
    while (psi < -Math.PI) psi += 2 * Math.PI;
    // No clamp, no lag: the player's psi IS the real world heading relative to
    // the road, and it is already smooth (world-space integration). Clamping it
    // to +-0.7 rad meant the DRAWN car could never point more than 40 deg off the
    // track direction — a spin rendered as a 40 deg crab — and the damp below
    // added ~0.17 s of lag TOWARD the road. Both are the presentation quietly
    // re-orienting the driver to the arc, the same family as the render-position
    // and camera couplings. AI cars still damp (they have no real heading).
    c.yawVis = psi;
    yawTarget = psi;
  } else {
    yawTarget = c.steerVis * 0.35 + clamp(-k * c.speed * 0.14, -0.28, 0.28);
  }
  // Keep the deploy-side player-heading guard: for the player with a real
  // world heading, c.yawVis was already set to psi above — don't re-damp it
  // toward the road (that re-orients the driver to the arc). AI/no-head damp.
  if (!(c.human && c.head != null)) c.yawVis = damp(c.yawVis, yawTarget, 6, dt);
  // Chassis pitch/roll/heave (brake dive, throttle squat, cornering lean, kerb
  // bob) now live in the C2 visual-suspension springs (js/physics/body-attitude.js),
  // advanced per car in the render loop from axEstSm/speed/yawRateCur/kCur +
  // road height. Render-only — see BodyAttitude.
  // Brake-disc heat (render-only): glows up while braking at speed, cools after.
  // Drives the emissive brake-glow rings on the player's wheels.
  {
    // ALL cars (the AI brake into corners too — a field of glowing discs).
    const heating = braking && vStd(c.speed) > 12;   // vStd: a threshold, not a force — see OT_MIN_SPEED
    c.brakeHeat = clamp((c.brakeHeat || 0) + (heating ? dt * 1.6 : -dt * 0.9), 0, 1);
  }
  {
    // Combustion after-fire is a short throttle-lift transient, not a continuous
    // arcade torch. ERS deployment is electric and never feeds this state.
    // Every car: an AI's onThrottle is always true, so its lift is the moment
    // it starts braking — the car ahead spits on the way into the zone.
    const thr = c.human ? onThrottle : !braking;
    const lifted = !!c.wasOnThrottle && !thr && c.speed > 8;
    c.exhaustPop = lifted ? 1 : Math.max(0, (c.exhaustPop || 0) - dt * 5);
    c.wasOnThrottle = !!thr;
  }
  if (c.retired || c.finished) { c.towing = 0; c.wake = 0; }   // the cue is about driving; both exits skip the block that clears it
  c.collideT = Math.max(0, c.collideT - dt);
  c.contactT = Math.max(0, (c.contactT || 0) - dt);

  // --- advance along track ---
  // Player s was advanced by velocity·tangent above; AI advances by speed*dt in Frenet.
  let oldS = c._prevS ?? c.s;
  // AI arc = ground distance ÷ the Frenet stretch h, as trackFrom charges the player (AI-only
  // column). At speed·dt the AI got ~7 % free arc on the outside of a bend and nothing inside.
  const hAi = c.human ? 1 : frenetH(c.s, c.x);
  if (!c.human) c.s = wrapS(c.s + c.speed * dt / hAi);
  // Progress is the cumulative arc-length. For the PLAYER, derive it from the
  // actual (signed, wrap-aware) change in s — NOT speed*dt — so prog stays exactly
  // coupled to s, and going backwards (a spin/reverse) correctly DECREASES prog
  // instead of cheating progress forward.
  const L = track.total;
  let ds = c.s - oldS;
  if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;   // signed wrap == M4.wrapDelta(ds, L), kept INLINE: physics inner loop, and the characterization golden is a browser spec

  // If ds is huge, the car was teleported (jump/park). Reset to prevent glitches.
  if (Math.abs(ds) > 20) {
    ds = c.speed * dt;
    oldS = wrapS(c.s - ds);
  }

  const dLine = ds;   // signed change in s, contact shove INCLUDED — the lap-line test needs it
  if (c.human) c.prog += ds - (c._pushD || 0);   // the shove was already banked by shiftLong
  else c.prog += (ds = c.speed * dt / hAi);
  c._pushD = 0; c.totalT += dt;
  c.lapTime += dt;
  // OUR QUALIFYING LAP, AS IT HAPPENS. Everyone else in a friend race is
  // sitting on a disabled button while this runs, and a clock is the whole
  // difference between watching somebody and waiting for them. Rate-limited
  // inside netReportQualiLive, gated to the one car it can be about, and
  // purely cosmetic — nothing downstream reads it, so a dropped packet costs a
  // flicker rather than a grid slot.
  if (c.isPlayer && isQuali() && state === "race" && c.lapTime > 0) {
    qualiNet.reportLive(c.driverId, c.lapTime, track && track.total ? (c.s || 0) / track.total : 0);
  }

  // The FIELD's sector bests — the timing screen's purple is the session best
  // of ANY car, so every car's forward crossing is timed (a per-car index and
  // start stamp; the player's curated split logic below stays as it is).
  // S3 closes AT THE LINE, inside this step: take off the time past it, as
  // RaceControl.lineTransition does for the lap (or S1+S2+S3 ran a step long).
  const s3Past = dLine > 0 && oldS > L * 0.5 && c.s < L * 0.5 && dt > 0 ? dt * (1 - Math.min(1, Math.max(0, (L - oldS) / dLine))) : 0;
  if (state === "race" && track) {
    const ns = sectorAt(c.s);
    if (ns !== c._secIdx) {
      const fwd = ds > 0 && c._secIdx != null && (c._secIdx < ns || (c._secIdx === 2 && ns === 0));
      // _secValid is the player's sectorValid, per car: after a BACKWARD entry the next forward exit times a fragment.
      if (fwd && c._secValid !== false && c.lap >= 1 && !c.incidentInvalidLap && c._secT0 != null) {
        const e = c.lapTime - (ns === 0 ? s3Past : 0) - c._secT0;
        if (e >= 2 && e < fieldSectorBests[c._secIdx]) fieldSectorBests[c._secIdx] = e;
      }
      c._secValid = fwd || c._secIdx == null; c._secIdx = ns; c._secT0 = c.lapTime;
    }
  }
  // Sector detection (curated splits via sectorAt). Must run before finish-line
  // timing resets so a forward S3→S1 crossing records the completed S3 split.
  if (c.isPlayer && state === "race" && track) {
    const newSector = sectorAt(c.s);
    if (newSector !== sectorIdx) {
      const fwd = ds > 0 && (sectorIdx < newSector || (sectorIdx === 2 && newSector === 0));
      if (fwd) {
        // Grid sits just before the line (in S3): the first start/finish crossing
        // only starts the flying lap (lap 0→1), so don't stamp that formation
        // segment as an S3 split/best. Skip an incident-invalidated lap too — a
        // takeover freezes c.lapTime while Rapier walks c.s forward, making
        // `elapsed` impossibly short (the lap-best and ghost recorders guard the
        // same corruption with this flag). And sectorValid guards a REVERSED
        // entry: a backward crossing skips the record but resets sectorStartT,
        // so the next forward crossing times a fraction (measured: 0.217 s "S1").
        if (c.lap >= 1 && !c.incidentInvalidLap && sectorValid) {
          const elapsed = c.lapTime - (newSector === 0 ? s3Past : 0) - sectorStartT;
          const prevSector = sectorIdx;
          const prevBest = sectorBests[prevSector];
          sectorLast[prevSector] = elapsed;
          // A `delta` against the previous best was computed here and never
          // read by anything — the split it was meant to show was never wired
          // up. Removed rather than left looking like live plumbing; the
          // ordering note it carried still matters, so it stays: this compares
          // against the PREVIOUS best, before the line below updates it, which
          // is what would let a new personal best show a real improvement
          // rather than 0.000 if that readout is ever built.
          if (elapsed < prevBest) sectorBests[prevSector] = elapsed;
          if (elapsed >= 2 && c.isPlayer) hud.flashSector(prevSector);
        }
      }
      sectorValid = fwd;   // the NEXT split is trustworthy only after a forward entry
      sectorIdx = newSector;
      sectorStartT = c.lapTime;
    }
  }

  // Line crossing. `ds > 0` stops a backward crossing INCREMENTING the lap, and
  // the backward branch below UNDOES one, matching the symmetric `c.prog`:
  // otherwise crossing, being shoved back over the line by shiftLong (contact
  // moves a car up to ~4-5 m along the road) and crossing again adds a SECOND
  // lap, and `c.finished` can fire a full lap early.
  const lineCross = RaceControl.lineTransition(c, oldS, c.s, dLine, track.total,
    lapsTarget, cars, raceT, dt);   // dt: lapTime/raceT already hold this whole step — timed to the crossing inside it
  if (lineCross && lineCross.direction > 0) {
    // A takeover (R2/R3/C1) during this lap invalidates it EXPLICITLY: the car
    // was moved by Rapier, so it is not a timed lap — no personal best, no
    // stored ghost. The flag is set by IncidentSim and cleared here at the line.
    const lapValid = !c.incidentInvalidLap && !(c.isPlayer && coach.practiceActive());
    // The flag: the distance, or the leader already home (RaceControl.flagOut —
    // a lapped car is flagged at its next crossing, not after the full count).
    lineCross.lapValid = lapValid && c.lap > 1 && !lineCross.recross;
    if (c.lap > 1 && !lineCross.recross) {   // a re-crossing after a reverse was timed the first time
      const lapDone = lineCross.lapDone;
      if (lapValid) c.lastLap = lapDone;
      else if (c.isPlayer && isQuali()) c.qualiCut = true;   // ANY deleted quali lap (a takeover, a practice rewind — not only a cut) is NO TIME, never the model's
      if (lapValid && lapDone < c.best) c.best = lapDone;
      if (c.isPlayer && soundOn) GameAudio.lap();
      if (c.isPlayer && isTimeTrial()) { if (lapValid) onTTLap(lapDone); else restartTTRecorders(); }
    } else if (c.isPlayer && isTimeTrial()) {
      restartTTRecorders();
    }
    c.incidentInvalidLap = false;   // the new lap starts clean
    c._secT0 = 0;   // …and the FIELD's S1 reference, or it measures across the reset
    if (c.isPlayer) { sectorIdx = 0; sectorStartT = 0; }
    // Never on a 1-lap session: that crossing is the START crossing, and a qualifying flying lap is not a final lap.
    if (c.isPlayer && c.lap === lapsTarget && lapsTarget > 1 && !raceRadio.callsLastLap()) announce("FINAL LAP", 1.6, "race");
    onCarLineFinish(c, lineCross);
  } else if (lineCross && lineCross.direction < 0) {
    // Backward over the line: give the lap back and put the clock where it was,
    // so the next forward crossing re-times the SAME lap rather than a sliver.
    // (An AI car gets here only via a contact shove — dLine is the real move.)
    if (lineCross.changed) {
      // (A finished car cannot get here — updateCar early-outs it long before
      // the crossing logic — so no `c.finished` undo is needed.)
      if (c.isPlayer) { sectorIdx = sectorAt(c.s); sectorStartT = c.lapTime; sectorValid = false; }   // the next split is timed from a reversed entry — invalid, as at a sector line
      // Crossing back over the line wraps c.s from ~0 to ~track.total, breaking the
      // monotonic-distance domain the ghost recorder assumes. Ghost.record only
      // rejects DECREASING s, so the next forward-jump sample would be appended and
      // at() would interpolate the replay ghost crawling across the whole lap.
      // Restart the recording so the re-timed lap records cleanly from here.
      if (c.isPlayer && isTimeTrial()) restartTTRecorders();
    }
  }
  // Skip ghost recording while the current lap is incident-invalidated (a
  // takeover jumps s/x — recording it would corrupt the ghost trace).
  if (isTimeTrial() && c.isPlayer) records.sample(c, inp);

  // --- wrong-way + auto-rescue (player only) ---
  if (c.human && state === "race" && !c.finished) {
    // Moving backwards along the track at speed = going the wrong way. (A slow
    // reverse crawl to recover off a wall is fine and does NOT trip this.)
    if (ds < -0.03 && vStd(c.speed) > 15) c.wrongT = Math.min(2, (c.wrongT || 0) + dt);
    else c.wrongT = Math.max(0, (c.wrongT || 0) - dt * 2);
    c.wrongWay = c.wrongWay ? c.wrongT > 0.15 : c.wrongT > 0.4;
    if (c.wrongWay && (c.wrongCueT = (c.wrongCueT || 0) - dt) <= 0) {
      if (c.local) announce("WRONG WAY", 1.0, "warning");
      c.wrongCueT = 1.0;
    }
    // Auto-rescue: stuck off-track, wrong-way, pinned to a wall, or simply
    // crawling/stopped on-track for too long. The last clause is the catch-all
    // for being WEDGED against a corner barrier (e.g. an inside tyre wall on an
    // incline): on open circuits wall contact doesn't set wallT and a car pinned
    // at |x| < hw isn't "offroad", so without it the car could sit at 0 forever.
    // Only rescue if throttle is actively pressed but the car isn't moving —
    // that's the wedged-against-a-wall case. A player who deliberately parks
    // (lets off gas) is never rescued, regardless of how long they sit still.
    // The DRIVER's pedal, not onThrottle: on tilt that is autoThrottle() (always
    // true), which teleported a phone player who parked or was boxed in a pile-up
    // to x = 0 after 3 s — auto gas is not a driver asking.
    //
    // EXCEPT IN TOUCH STEERING, where the player has no pedal to release. The GAS
    // button is hidden exactly when auto-throttle is on (see els.btnThrottle.hidden
    // above), so on a phone in touch mode there is no key, no button and no pad for
    // Input.throttle() to read: gasPressed was permanently false and this rescue —
    // the ONLY one that covers being wedged against a barrier with |x| < hw, where
    // beached/wrongWay/wallT all stay false — became unreachable on exactly the
    // devices most likely to need it. There, auto gas IS the driver asking.
    // Two narrowings keep the original fix intact. contactT excludes a pile-up
    // shuffle: a car rubbing another car is not wedged against a barrier and must
    // not be teleported out of the pack. And the auto-gas branch tests the
    // PACE-NORMALISED speed, because the 3 m/s gate below is deliberately absolute
    // (a stopped detector on the scale REVERSE_MAX sets, per the vstd-lint reason)
    // — at a low OVERALL SPEED a car driving perfectly well sits under it, and a
    // driver who never touched a pedal must not be teleported for driving slowly.
    // vStd divides by PACE, so this reads "stopped for its own pace", which is the
    // question actually being asked.
    const autoGas = autoThrottle() && (c.contactT || 0) === 0 && vStd(c.speed) < 3;
    const gasPressed = inp ? !!inp.throttle : (autoGas || Input.throttle());
    const stoppedOnTrack = gasPressed && c.speed < 3 && raceT > 2 && !(braking && ds < -0.01);
    // Under a RED flag the whole field is HELD below that gate on purpose (the
    // red cap is ~2 % of vTop): stopped is the instruction, not being stuck.
    const redHeld = raceCtl.level >= 4;
    // Being OFF-TRACK is not the same as being stuck. The driving boundary sits
    // ~9 m beyond the road edge, so a driver can be metres into a wide run-off,
    // fully in control and steering back to the track; a bare c.offroad clause
    // would teleport them after 3 s (x = 0, heading force-aligned, speed RAISED
    // to 16 m/s). Rescue is for being beached, so it needs the car to actually
    // be going nowhere — the principle stoppedOnTrack applies to a parked car.
    // Threshold sits just ABOVE the off-track speed floor, not below it. Grass drag
    // bottoms the car out at GRASS_V * 0.6 = 10.8 m/s, so a `< 8` gate could never
    // be reached by a car stuck in the run-off — it idles along at the floor
    // forever, above the gate, and never counts as beached. Measured: a wrong-way
    // car sat at 10.8 m/s and x = -10.9 while its rescue timer decayed back to 0.
    //
    // PACE-SCALED, exactly like the floor it sits above. The floor itself is
    // `GRASS_V * 0.6 * max(PACE, 0.05)` (see the grass-drag clause), so a bare
    // `GRASS_V * 0.6 + 1.5` only clears it at PACE = 1 — the one setting the
    // invariant above was measured at. Above ~1.14 the floor climbs past the
    // gate and a beached car is never rescued; below ~0.57 the gate climbs past
    // ordinary run-off speeds and a driver in full control is teleported to
    // x = 0 after 3 s — both bugs above, through the OVERALL SPEED slider.
    const beached = beachedAt(c);
    // A car serving a stop is not stuck: it is held in its box at 0 with the
    // throttle down (touch auto-gas holds it for you), and creep-in plus the
    // 2.4 s hold crossed the 3 s gate — the rescue teleported it to x = 0
    // mid-stop, and the box then held it stationary on the racing line.
    const stuck = !(pits.inLane(c) || c.pitState === "box") &&
      (beached || c.wrongWay || (c.speed < 4 && (c.wallT || 0) > 0) || stoppedOnTrack);
    // 4-second grace period AFTER a rescue prevents rapid re-rescue on marginal
    // stuck conditions. Only applies once a rescue has actually happened —
    // (c.rescueLastT || 0) defaulted to 0 and blocked rescue for the first 4 s of
    // every race, so a car stuck from the start was never recovered.
    const rescueGrace = c.rescueLastT != null && raceT < c.rescueLastT + 4;
    // Held by the red and stuck for no OTHER reason: not stuck.
    const redOnly = redHeld && stoppedOnTrack && !beached && !c.wrongWay && !((c.wallT || 0) > 0);
    if (stuck && !redOnly && !rescueGrace) c.rescueT = (c.rescueT || 0) + dt;
    else c.rescueT = Math.max(0, (c.rescueT || 0) - dt * 1.5);
    if (c.rescueT > 3) { rescuePlayer(c); c.rescueT = 0; }
  } else if (!c.human && state === "race" && !c.finished) {
    // Lightweight AI rescue: an AI beached in the grass or pinned against a
    // barrier or another car gets put back on the drivable surface after a few
    // seconds, so it can't crawl in a run-off — or stay welded to the player —
    // for the rest of the race. AI is kinematic, so the reset just clamps
    // lateral position onto the track and restores some speed.
    //
    // contactT is a PATIENCE knob (AiDrive.aiRescueDelay), not a veto: a veto
    // leaves a car wedged against another — the commonest real stuck — never
    // rescued, while a pack shuffle clears in well under a second and never
    // reaches the longer contact timer.
    // Dig-out is the first recovery; when it fails (wall both sides, sandwich),
    // unstuckActive used to permanently veto rescue — cars crawled at 0 m/s
    // with stuckT climbing forever (monaco field: 7.6 s, rescueT = 0). Past
    // AiDrive.digOutBudget, rescue may arm even while dig-out is still on.
    // A car HELD in its box is parked on purpose, not stuck (every AI stop was
    // being rescued onto the racing line 1.5-2 s after the tyres went on).
    // A car QUEUED in the lane behind a stop (capBlocks, the crawl floor) is
    // held by a car, not stuck: rescuing it fired it at 8 m/s into the parked
    // car it was waiting for — unless dig-out has already failed (laneX
    // overwrite makes lateral dig-out useless in the pit), in which case the
    // escalate path still fires onto laneX below.
    // Escalation is HELD while dig-out stays on (AiDrive.digOutHeld): a partial
    // yank that dips stuckT under the line must not re-veto the rescue.
    c.digEscHeld = AiDrive.digOutHeld(c.digEscHeld, AiDrive.digOutEscalated(c.stuckT, aiT, !!track.street), unstuckActive);
    const digEsc = c.digEscHeld;
    const laneQueueOk = !(queued && pits.inLane(c)) || digEsc;
    const aiStuck = c.pitState !== "box" && (beachedAt(c) ||
      (c.speed < 5 && raceT > 2 && (!unstuckActive || digEsc) && laneQueueOk));
    // RED FLAG: the field is held under that low-speed gate on purpose — only a
    // car genuinely beached in the run-off still counts as stuck (as the player's).
    const aiRedHeld = raceCtl.level >= 4 && !beachedAt(c);
    // Parked on purpose: a timer that crossed the line in the queue must not
    // fire the moment the stop begins (it did, 0.2 s into a Monaco stop).
    if (c.pitState === "box") c.rescueT = 0;
    else if (aiStuck && !aiRedHeld) c.rescueT = (c.rescueT || 0) + dt;
    else c.rescueT = Math.max(0, (c.rescueT || 0) - dt * 1.5);
    // Once dig-out has failed, contact patience already ran during the dig-out
    // window — do not stack another 7 s on top (that left monaco crawls at 10 s).
    if (c.rescueT > AiDrive.aiRescueDelay((c.contactT || 0) > 0, digEsc)) {
      Tracks.sample(track, c.s, smp);
      // Break the weld SIDEWAYS first: a car pinned against another is stuck
      // laterally, and a bare speed restore re-loads the same contact next frame.
      if ((c.contactT || 0) > 0) c.x += (roomR >= roomL ? 1 : -1) * 1.2;
      if (pits.inLane(c)) {
        // Stuck IN THE LANE (a queue behind a parked car): back onto the lane's
        // own line at the limit, the stop still on — never onto the road.
        c.x = pits.laneX(c, smp.hw, c.x);
        c.speed = Math.min(pits.limit(), Math.max(c.speed, 8 * Math.max(PACE, 0.05)));
      } else {
        c.x = clamp(c.x, -(smp.hw - 1.5), smp.hw - 1.5);   // back onto the track
        // Pace-scaled restore floor (same shape as coast()); never above vTop().
        c.speed = Math.min(vTop(), Math.max(c.speed, 14 * Math.max(PACE, 0.05)));
      }
      c.rescueT = 0; c.offT = 0; c.stuckT = 0; c.contactT = 0; c.digEscHeld = false;
    }
  }
  // AI authority is (s, x). Mirror world metres AFTER this step's s/x writes
  // (advance, walls, rescue) so render interpolates the pose the step produced.
  if (!c.human) {
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x;
    c.pz = w.z;
  }
  c._prevS = c.s;
}

// Put the player back on the racing line at its CURRENT progress, facing forward at a modest speed — for a spin, a
// beach or a wall. Progress is kept; lateral position, heading and slip reset. In TT/QUALI the lap is DELETED (no free re-centre).
function rescuePlayer(c) {
  if (c.human && (isTimeTrial() || isQuali())) { c.incidentInvalidLap = true; if (c.isPlayer && isQuali()) c.qualiCut = true; }   // as a track-limits cut
  // A live incident takeover would re-impose the Rapier pose over this rescue
  // (same authority rule as __apex.jump) — hand the car back first.
  incidentSim.release(c);
  Tracks.sample(track, c.s, smp);
  c.x = 0; c.xVis = 0;
  c.head = Math.atan2(smp.t[0], smp.t[2]);   // aligned with the track ahead
  c.vLat = 0; c.yawRateCur = 0;
  // Pace-scaled restore floor (same shape as coast()); never above vTop().
  c.speed = Math.min(vTop(), Math.max(c.speed, 16 * Math.max(PACE, 0.05)));
  c.px = smp.p[0]; c.pz = smp.p[2];
  c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevHead = c.head;   // re-seed the render anchors (as retireCar does) or the car smears from the wall for a frame
  c.boostOn = false; c.deploying = false;
  c.xOn = false; c.aeroX = 0; c.xArmed = false;   // rescue drops back to Z-mode
  c.wrongT = 0; c.wrongWay = false; c.offT = 0; c.wallT = 0; c.wasOnWall = false; c.rescueT = 0;
  c.rescueLastT = raceT;
  // Cues are for the driver at THIS screen — a rival being recovered elsewhere
  // on track must not announce itself here.
  //
  // NO BANNER. A recovery is the most self-evident event in the game: the car
  // is back on the road, pointing the right way, at a sane speed. The player
  // just watched it happen, so a card saying RECOVERED spends the radio — and
  // the banner is a QUEUE (ANN_PRI / _annQueue), so a message that reports the
  // obvious can delay or mask one that does not. The sound still marks it.
  if (c.local && soundOn) GameAudio.offtrack();
}

// Retire a car. The counterpart of rescuePlayer above — same job, opposite
// intent: instead of putting the car back on the racing line it puts it as far
// off the racing line as the circuit allows, and leaves it there.
//
// WHERE IT GOES. A retirement that vanished would read as a bug and one left on
// the line would be a rolling roadblock, so it pulls over to the side it was
// already on, hard against the barrier. The lateral limit is the same
// Tracks.wallAt() the collision pass clamps every car to, and the world pose is
// written back through worldFromTrack exactly as rescuePlayer and coast do — a
// stopped car is not a new kind of physics, it is the existing placement with the
// speed taken out.
function retireCar(c, reason) {
  incidentSim.release(c);   // same as rescuePlayer — drop a live Rapier takeover
  c.retired = true;
  c.dnf = reason || "mechanical";
  c.dnfAt = null;
  // The owner's word, on the reliable channel: nothing else carries it and a
  // rival left "running" holds the other screen's result to the hard cap. The
  // HOST owns its AI too: a guest posed it running, raced into it, scored it.
  if ((c.local || (!c.human && netPlay.ownsRaceControl())) && netPlay.active()) netPlay.reportLap({ lap: c.lap, time: null, best: null, code: c.code, driverId: c.driverId, retired: c.dnf, invalid: true });
  Tracks.sample(track, c.s, smp);
  const side = c.x >= 0 ? 1 : -1;
  const wall = Tracks.wallAt(track, c.s, side);
  // Out past the verge if there is room, but never through the barrier — on a
  // street circuit "the far side of the runoff" is barely a car's width.
  c.x = side * clamp(Math.max(smp.hw * 0.85, wall - 1.6), 0, Math.max(0, wall - 0.6));
  c.xVis = c.x;
  const w = worldFromTrack(c.s, c.x, smp);
  c.px = w.x; c.pz = w.z;
  c.head = Math.atan2(smp.t[0], smp.t[2]);
  // Seed the render-interpolation anchors too, or the first frame after this
  // smears the car across the track from wherever it was a step ago.
  c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x;
  c.rPrevHead = c.head; c.rPrevYawVis = 0;
  c.speed = 0; c.vLat = 0; c.yawRateCur = 0; c.yawVis = 0; c.steerVis = 0; c.skidIntensity = 0;   // a stale slip keeps the screech loop on
  c.gear = 1; c.rpm = IDLE_RPM;
  c.boostOn = false; c.deploying = false; OvertakeMode.reset(c); pits.clearArm(c);   // PitLane.update skips a retirement, so a car dead in the lane / box kept its crew, jacks and lifted body until the flag
  // The broadcast call. Every retirement is announced, not only the player's:
  // losing a rival is race information, and it is the only way a DNF that
  // happened half a lap away is visible at all.
  announce("RETIREMENT — " + c.code, 2, "info");
  if (c.local && soundOn) GameAudio.offtrack();
}

// Retirements arrive by race DISTANCE, not by clock: the moment was drawn as a
// fraction of the full race at the green light (see armReliability), so a 3-lap
// blast and a 25-lap race lose their cars at the same points of the story.
function checkRetirements() {
  const dist = Math.max(1, lapsTarget * track.total);
  for (const c of cars) {
    if (c.dnfAt == null || c.retired || c.finished) continue;
    // The remote human's slot was still an AI when armReliability drew its
    // dnfAt (netPlay.start() re-roles it afterwards) — never park a car
    // another person is driving.
    if (netPlay.owns(c) || realRace.owns(c)) continue;
    if ((c.prog - (c._progGift || 0)) / dist >= c.dnfAt) retireCar(c, c.dnfWhy);
  }
}

// Results, ghosts and matching-class records share one settlement path.
function onTTLap(lapTime) { records.finish(lapTime, ttLaps, quali.referencePole()); }

function coast(c, dt) {
  // Same shape as the grass-drag floor (see updateCar): a bare Math.max(24, …)
  // RAISES a car that finished slower than 24 m/s, and 24 sits above vTop() below
  // pace ~0.55. Pace-scale the floor, and never speed the car up. A car that
  // FINISHED below the floor (crawling) keeps scrubbing toward 0 rather than
  // sticking at its finish speed. A car
  // that reached the floor HOLDS it (_coastHeld): scrubbing it on to 0 the next
  // step parked every finisher ~v²/40 m past the line on one shared line, where
  // the next car home rear-ended it at 14-29 m/s (bug hunt 2026-09-22).
  const floor = GRASS_V * 0.6 * Math.max(PACE, 0.05);
  const next = c.speed - 20 * dt;
  if (c.speed > floor) { c.speed = Math.max(floor, next); if (c.speed === floor) c._coastHeld = true; }
  else c.speed = c._coastHeld ? floor : Math.max(0, next);
  // A car the flag found in the pit lane finishes its stop and coasts out
  // down the LANE at the limit (pits.update still runs for it): held in the
  // box, on the lane's line to the exit road's end — the inside line runs it
  // straight through the wall and into the others.
  const onLane = pits.held(c);   // the lane plus the exit road — PitLane.held
  if (c.pitState === "box") c.speed = 0;
  else if (onLane) c.speed = Math.min(c.speed, pits.limit());
  c.s = wrapS(c.s + c.speed * dt);
  c.prog += c.speed * dt;
  Tracks.sample(track, c.s, smp);
  const kA = Tracks.curvature(track, wrapS(c.s + 30));
  // Finished cars cruise the inside line (-sign(k)), same convention as the AI.
  c.x = onLane ? damp(c.x, pits.laneX(c, smp.hw, c.x), 3, dt)
               : damp(c.x, clamp(-kA * 130, -0.5, 0.5) * smp.hw, 2, dt);
  // Finished cars are kinematic in (s, x). Mirror world metres or renderPosOf
  // keeps the last racing px/pz and the mesh freezes on the line while s walks
  // away (~2 s until results). Heading follows the road — nothing steers.
  {
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x; c.pz = w.z;
    c.head = Math.atan2(smp.t[0], smp.t[2]);
  }
}

// Lighting tuner registry + live LT values (js/lighting/knobs.js) and the
// track light builder (js/lighting/track-lights.js), via LightTune. LT is a plain object
// mutated in place, so the profile-resolution code below and the sliders/
// __apex.lightTune keep every LT.x call site unchanged.
const { TUNE_DEFS, LT, buildTrackLights } = LightTune;
// The PROFILE STORE — which layer of (default / shipped preset / player edit)
// wins for the conditions on screen — lives in js/lighting/profiles.js
// (LightStore.create(G), assigned with the other modules below). These six are
// thin passes through to it, kept so every call site here reads unchanged.
function ltKey() { return ltStore.key(); }
function applyLightTune(fromApplyRace, opts) { ltStore.apply(fromApplyRace, opts); }
function setLightTune(id, v) {
  // A deliberate re-enable of PER-CHUNK LAMPS clears the crash latch. It is set
  // on a real context loss (js/render/glx/glx.js) and persisted so a reboot into the
  // same config cannot crash-loop — but nothing else cleared it, so one transient
  // display reset disabled the feature forever and the slider silently did
  // nothing. Here at the EDIT (not in the render loop, which only runs the
  // per-chunk path at night) a RISING EDGE from 0 to a positive value is the
  // player choosing to switch it back on — informed, one gesture at a time — so
  // it is the honest reset. The tier gate still protects a governed device.
  // EITHER chunk knob, because js/lighting/tuner-panel.js gateNote() shows the "set to 0
  // and back on to retry" note on BOTH (its isChunk covers roadChunkLamps too).
  // Keyed on perChunkLights alone, a player who read that note on PER-CHUNK
  // ROAD and did exactly what it said cleared nothing, and the slider stayed
  // silently dead — the instruction only worked on the OTHER control.
  if ((id === "perChunkLights" || id === "roadChunkLamps") && +v > 0 && !(+LT[id] > 0) && _perChunkOff) {
    _perChunkOff = false;
    try { localStorage.removeItem("apex26.perChunkOff"); } catch (_) { /* no storage: the in-memory clear stands for this session */ }
  }
  // Same reset, same gesture, for the env-probe latch. All three backends write
  // apex26.envProbeOff on a VISIBLE context/device loss, and until this line the
  // only thing that cleared it was RESET RENDERER — which also throws away the
  // player's renderer pick. One transient glitch therefore removed live car
  // reflections on every future boot, on every backend, with no indication and
  // no proportionate way back. ENV REFLECTION 0 -> >0 is that way back.
  if (id === "carEnvCube" && +v > 0 && !(+LT[id] > 0) && _envProbeOff) {
    _envProbeOff = false;
    try { localStorage.removeItem("apex26.envProbeOff"); } catch (_) { /* same: the in-memory clear stands */ }
  }
  const r = ltStore.set(id, v);
  try { if (gfx && gfx.invalidateSoftPresent) gfx.invalidateSoftPresent(); } catch (_) { /* pre-boot */ }
  return r;
}
function persistLightTune() { ltStore.persist(); }
// Spread the on-screen condition to every other track at the same time+weather
// ("edits" = this profile's overrides only, "look" = every live value), and the
// one-step revert for it. The tuner panel and __apex.lightCopy are the callers.
function copyLightTune(mode) { return ltStore.copyToTracks(mode); }
function restoreLightTune(undo) { return ltStore.restore(undo); }
// LAMP_KINDS + buildTrackLights(track) live in js/lighting/track-lights.js (via LightTune).

// Per-frame light assembly (nearest-N flood cull + car tail lights) lives in
// js/lighting/frame-lights.js (LightTune.setFrameLights / appendCarTailLights).
const _wheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };
const _lightFwd = [0, 0, 0];   // camera-forward scratch for the ahead-biased cull
function setFrameLights(eye, scale, fwd, srcSet) {
  LightTune.setFrameLights(frame, track, cars, eye, scale, fwd, gfx.mobileTier, srcSet);
}
function appendCarTailLights() {
  LightTune.appendCarTailLights(frame, track, cars, player, gfx.mobileTier);
}

// ---------- cameras ----------
// (render() itself is further down, after the garage preview — see the
// `render` banner below it.)
// Reusable camera-vantage solver — lives in js/camera/vantage.js (GameCams).
// For a player camera `mode` at arc position `s`, lateral `x`, speed `spd`
// (m/s) and wall-clock `now` (ms), returns { eye, tgt, fov }. Centralised so
// the live camera in render(), snapCam() and the previewCam() debug hook frame
// EVERY mode identically. `extra` carries player-only spice — { bankDy,
// deploy, slipLat } — all optional. COCKPIT_EYE_* are shared with the
// camera-anchored cockpit-rig draw in render().
GameCams.init({ vmax: vTop() });   // re-injected by the PACE setter on a slider move
const { COCKPIT_EYE_FWD, COCKPIT_EYE_UP } = GameCams;
function camVantage(mode, s, x, spd, now, extra) {
  return GameCams.vantage(track, mode, s, x, spd, now, extra);
}

// ---------- car-setup live preview ----------
// The garage turntable — the orbit camera and its presets, pan/zoom, the
// active-aero demo, the preview mesh cache and the whole non-track render
// path the #carsetup screen draws through — is js/garage/setup-camera.js
// (SetupCamera.create above). The flag below stays here because render()'s
// gate is game.js's own; the module reads it back through G.
let setupPreviewOn = false;

// Static world draws (floor → terrain → road → startline → [lamp glow] → props
// → glass → water → gate), shared verbatim by the MAIN camera pass and the
// live env-probe faces (which re-render the world around the player car so the
// paint mirrors the real surroundings). Cars/skids/rain are main-pass only.
// _envFace cursor; after face 5, _envHold until move/sun/wet/tod/lights (audit 2026-10-05 #2).
let _envFace = -1, _frameNo = 0, _envHold = false, _envLatchTod = null;
const _envLatch = [NaN, NaN, NaN, NaN, NaN, NaN, NaN, -1], ENV_HOLD_MOVE_M = 4;
// Set by GLX's webglcontextlost handler (persisted) — once a device has lost the
// context we skip the extra per-frame env-probe pass on every subsequent load so
// the reflection feature can't keep exhausting a memory-constrained GPU.
let _envProbeOff = false;
try { _envProbeOff = localStorage.getItem("apex26.envProbeOff") === "1"; } catch (_) {}
// Same latch for PER-CHUNK LAMPS, set by the same webglcontextlost handler. It
// is the loop-breaker the crash sentinel cannot be: that ledger is mobile-only
// (js/perf/governor.js gates it on gfx.isMobile so the desktop suite never enters
// safe mode), so on desktop a GPU reset leaves nothing behind and the knob —
// which IS persisted, in the tuner store — comes straight back on at the next
// boot into the same configuration that just killed the context.
let _perChunkOff = false;
try { _perChunkOff = localStorage.getItem("apex26.perChunkOff") === "1"; } catch (_) { /* No storage (Safari private mode): the latch is unreadable, so the feature stays governed by the tier gate alone — the same fallback _envProbeOff takes two lines up. */ }
// Hoisted material-option objects for drawWorldMeshes — the function runs up to
// 2×/frame (main pass + env probe) and would otherwise allocate ~9 literals each call.
// Pure night/wet variants are constants; the few with live-tunable fields (detail
// from LT.surfDetail, roughness from LT.roadRough, emissive from floodEmit) are
// per-variant reused objects mutated in place each call (never a stale key).
// The ROAD carries NO depth bias; the terrain is pushed AWAY instead (WGX has done both
// since its port, wgx.js _litOpts). A slope-scaled bias on the road ([-8,-16]) pulled the
// asphalt BEHIND every car forward by 8 px of its own depth gradient: cars under ~8 px tall
// vanished (the whole grid, seen from past the line) and nearer ones sank. Push-away bias on
// terrain can never cover a car.
// Terrain [2, 10]: props that cross the terrain (faces both above and below it, so no
// geometric lift helps) otherwise fight it wherever they meet — 2.8k pairs on 48 circuits.
// [2, 10] cuts the fighting metres within 300 m by ~84 % (modelled) while a buried face
// shows through only ~2 cm at 100 m. The floor stays behind the terrain on BOTH terms: [4, 16].
const _terrainBias = [2, 10];
const _wmFloorN = { emissive: 0.14, roughness: 0.98, specular: 0.05, depthBias: [4, 16], buryRibbon: true };
const _wmFloorD = { roughness: 0.98, specular: 0.05, depthBias: [4, 16], buryRibbon: true };
const _wmTerrainN = { emissive: 0.18, roughness: 0.97, specular: 0.06, detail: 0, buryRibbon: true, depthBias: _terrainBias };
const _wmTerrainD = { roughness: 0.97, specular: 0.06, detail: 0, buryRibbon: true, depthBias: _terrainBias };
const _wmRoadWetN = { emissive: 0.06, roughness: 0.14, specular: 0.85, detail: 0, surfaceId: 16, doubleSided: true };
const _wmRoadWetD = { roughness: 0.14, specular: 0.85, detail: 0, surfaceId: 16, doubleSided: true };
const _wmRoadDryN = { emissive: 0.09, roughness: 0, specular: 0.20, detail: 0, surfaceId: 16, doubleSided: true };
const _wmRoadDryD = { roughness: 0, specular: 0.20, detail: 0, surfaceId: 16, doubleSided: true };
// depthBias [factor, units]: the start line is a DECAL laid on the asphalt, so
// bias its depth toward the camera rather than relying on the small geometric
// lift alone — that lift is fixed in metres and loses to depth quantisation at
// range, which is what makes a decal shimmer and drop out as you approach.
// KEEP IT SMALL: this mesh is opaque and the grid boxes lie under the cars, so a
// factor of -f hides the bottom f px of any car standing in front of the paint
// (at -12 it hid whole cars at range). The road is unbiased, so -2 beats it.
const _startBias = [-2, -4];
const _wmStartWet = { roughness: 0.16, specular: 0.80, detail: 0, depthBias: _startBias };
const _wmStartN = { emissive: 0.10, roughness: 0.80, specular: 0.22, detail: 0, depthBias: _startBias };
const _wmStartD = { roughness: 0.80, specular: 0.22, detail: 0, depthBias: _startBias };
const _wmPropsWetN = { emissive: 0, roughness: 0.55, specular: 0.38 };
const _wmPropsWetD = { roughness: 0.55, specular: 0.38 };
const _wmPropsDryN = { emissive: 0, roughness: 0.85, specular: 0.20 };
const _wmPropsDryD = { roughness: 0.85, specular: 0.20 };
// Pooled frustum planes + draw-opt bags (makeFrustumPlanes(vp, out) / GC).
const _pbPlanes = [0,0,0,0,0,0].map(() => new Float32Array(4));
const _ghostOpts = { emissive: 0.80, roughness: 0.20, metalness: 0.08, specular: 0.35, alpha: 0.35, noAlphaWrite: true };
const _wmGlass = { roughness: 0.13, specular: 0.82, metalness: 0.12, clearcoat: 1.0 };
const _wmWaterWet = { roughness: 0.16, specular: 0.85, metalness: 0.05 };
const _wmWaterDry = { roughness: 0.10, specular: 0.92, metalness: 0.05 };
const _wmGateWet = { roughness: 0.32, metalness: 0.35, specular: 0.65 };
const _wmGateDry = { roughness: 0.45, metalness: 0.30, specular: 0.50 };
function drawWorldMeshes(frame, night, wet, floodEmit, withGlow, envProbe) {
  // Base floor first (under everything) — fills the void on street circuits (no
  // terrain ribbon) and the far infield/horizon on open circuits. No detail noise
  // so the huge plane stays flat and recedes into fog.
  if (!hideMeshes.terrain && track.meshes.floor) gfx.draw(track.meshes.floor, MAT_IDENT,
    night ? _wmFloorN : _wmFloorD);
  // TARMAC ROUGHNESS / SURFACE DETAIL knobs: rr scales dry-tarmac roughness
  // (glossier asphalt); sd scales the procedural grain/relief (0 = flat).
  const _rr = LT.roadRough, _sd = LT.surfDetail;
  if (!hideMeshes.terrain) {
    const m = night ? _wmTerrainN : _wmTerrainD; m.detail = 0.42 * _sd;
    // Camera/probe terrain chunking — same envCull gate as the road ribbon.
    // Shadow path already lazy-builds terrainChunked; reuse that handle.
    let _tMesh = track.meshes.terrain || track.meshes.terrainChunked, _tChunked = !!(_tMesh && _tMesh.chunks && _tMesh.chunks.length);
    if (PerfGov.tier() < 3) {
      if (track.meshes.terrainChunked === undefined) {
        track.meshes.terrainChunked = null;
        if (track.terrainGeo && gfx.createChunkedMesh) {
          track.terrainGeo._keepPositions = true;
          track.meshes.terrainChunked = gfx.createChunkedMesh(track.terrainGeo, 72);
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
    // PER-CHUNK ROAD: the road is one mesh, so it can only ever carry the single
    // global set of 32 lamps — which the cull picks nearest the CAMERA, covering
    // the tarmac around the car and starving the road AHEAD (the original
    // "lamps switch on right in front of me"). Drawing it chunked gives each
    // stretch its own lamps via the same GLXChunked path as the props, and
    // frustum-culls the ribbon as a bonus. Built lazily on first use so the
    // second copy of the geometry costs nothing while the knob is off.
    // _keepPositions is REQUIRED: createChunkedMesh nulls its source arrays, and
    // js/physics/debris-world.js + __apex.geo() both still read track.roadGeo.
    let _roadMesh = track.meshes.road || track.meshes.roadChunked, _roadChunked = !!(_roadMesh && _roadMesh.chunks && _roadMesh.chunks.length);
    // RESOLVED per-chunk state, not the raw knob (frame.perChunkLights holds the
    // same expression but is only assigned under _floodActive, so it is unset by
    // day). Without the tier/latch terms this built a second GPU copy of the road
    // wherever per-chunk lamps are held off, while chunked.js bound the global 32.
    // Prefer per-chunk road when lamp knobs ask for it, OR whenever the
    // env-probe radial cull is live (frustum + 150 m reach — counted ~84%
    // index drop); the cull-only path keeps chunking through tier 2 so
    // SSR/shadow sheds do not re-fuse the road.
    //
    // THE LAMP CLAUSE USES autoShed(), AND IT MUST. With tier() it was DEAD
    // CODE — `(A && tier()<1) || (tier()<3)` is identically `tier()<3` — so
    // PER-CHUNK ROAD did nothing on LOW however the slider was set. autoTier()
    // fixed that and carried the same bug: it reads _perfTier, which ABSORBS
    // the preset floor on the first step and is never restored below it, so one
    // shed on MEDIUM held these lamps off for the session. autoShed() is the
    // measured shed alone (js/perf/governor.js `_autoShed`).
    const _wantRoadChunk = gfx.chunkedTrackCoords !== false && ((LT.roadChunkLamps && LT.perChunkLights && gfx.hasPerChunkLights && !_perChunkOff && PerfGov.autoShed() < 2)
      || (PerfGov.tier() < 3));
    if (_wantRoadChunk) {
      if (track.meshes.roadChunked === undefined) {
        track.meshes.roadChunked = null;
        if (track.roadGeo && gfx.createChunkedMesh) {
          track.roadGeo._keepPositions = true;
          track.meshes.roadChunked = gfx.createChunkedMesh(track.roadGeo, 72);
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
  // Per-lamp lens CORONAS: soft additive billboards at every active lamp — each
  // light gets a visible halo (colored per lamp) without inflating bloom.
  // (Skipped for the studio rig — its lamps have no fixtures, and floating
  // glow-cone billboards ringing the car read as artifacts. Skipped in the env
  // probe too: 64px additive halos just smear the reflection.)
  if (withGlow && frame.lights && !_studioRig) gfx.drawGlow(frame.glowLights || frame.lights, LT.glareStr);
  if (!hideMeshes.props) {
    let m;
    // Lit windows / signage / neon glow whenever the session is dark enough to
    // emit (night AND dusk/dawn — floodEmit>0), not only at full night. Gating on
    // `night` alone left the emissive (which the mesh WAS built with, via
    // sessionDark) discarded at dusk/dawn, so the LIT GEOMETRY slider did nothing
    // there. The *N props materials differ from *D only by this emissive field.
    const _lit = floodEmit > 0;
    if (wet) { if (_lit) { m = _wmPropsWetN; m.emissive = Math.min(0.80, floodEmit); } else m = _wmPropsWetD; }
    else { if (_lit) { m = _wmPropsDryN; m.emissive = floodEmit; } else m = _wmPropsDryD; }
    const _pb = track.meshes.propBatches;
    // mirrorLite skips batches; mirrorFreezeInstanced reuses last mirror mats+colours (main pass would overwrite at ~30 Hz).
    if (_pb && _pb.length && gfx.drawInstanced && !frame.mirrorLite && !envProbe) {
      const planes = gfx.makeFrustumPlanes ? gfx.makeFrustumPlanes(frame.viewProj, _pbPlanes) : null;
      const freeze = !!frame.mirrorFreezeInstanced, rec = frame.mirrorLite === false;
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
  // Building glass: a low-roughness reflective pass so the lit shader mirrors the
  // sky in the windows (real, view-dependent reflection). Only populated for day
  // builds; empty at night (lit windows live in the emissive props mesh).
  if (!hideMeshes.props && track.meshes.glass && !frame.mirrorLite && !envProbe) gfx.drawChunked(track.meshes.glass, MAT_IDENT, _wmGlass);
  // Water (lakes/marina/sea): low roughness so the lit shader's env term mirrors
  // the live sky + sun glint — reflective by day, warm at dusk, dark by night.
  // A touch glossier (calmer) when not raining; a little rougher in the wet.
  if (!hideMeshes.props && track.meshes.water && !frame.mirrorLite) gfx.draw(track.meshes.water, MAT_IDENT,
    wet ? _wmWaterWet : _wmWaterDry);
  if (!hideMeshes.gate) gfx.draw(track.meshes.gate, MAT_IDENT,
    wet ? _wmGateWet : _wmGateDry);
}

// Colour-grade split-tone bases per time-of-day (constant); the per-frame tuner
// mutation (gradeStr / hue rotation) writes into the reused _gradeOut so the base
// str never compounds across frames. Reused present-options object too — both
// avoid a fresh object literal every render frame.
const _gradeNight = { shadow: [0.86, 0.94, 1.14], hi: [1.07, 1.00, 0.92], str: 0.30 };
const _gradeDusk  = { shadow: [0.88, 0.97, 1.12], hi: [1.13, 1.02, 0.84], str: 0.36 };
const _gradeDawn  = { shadow: [0.90, 0.96, 1.10], hi: [1.12, 1.00, 0.90], str: 0.30 };
const _gradeDay   = { shadow: [0.90, 0.98, 1.13], hi: [1.13, 1.04, 0.87], str: 0.34 };
const _gradeOut = { shadow: null, hi: null, str: 0 };
const _presentOpts = {};
// ---------- render ----------
let _softEl = null;                    // #game-soft, the soft-present overlay canvas
// The lens the last frame was built with — see where it is filled, below.
const _lens = { near: 0, far: 0, fovY: 0, fog: null, cull: 0, cine: false };
// Extracted: tick()'s fatal catch also arms it when render() throws before
// reaching its own present() call below.
function armBackendProbe() {
  if (!_backendProved && _backendBound && !_probeArmed) {
    try { const p = backendPreference();
      if (p === "three" || p === "webgpu") { localStorage.setItem("apex26.gfxBackendProbe", p); _probeArmed = true; } }
    catch (_) { /* no probe: a jetsam in the arming window will not auto-revert */ }
  }
}
/** True when the bound backend reports a lost context/device (its cheap ctxLost(); backendState() is the diagnostic fallback). */
function gfxContextLost() {
  try { if (gfx && gfx.ctxLost) return !!gfx.ctxLost(); const s = gfx && gfx.backendState && gfx.backendState(); return !!(s && s.ctxLost); }
  catch (_) { return false; }
}
function render(dt) {
  // Headless presents nothing, so the handoff card (below, after present) would wait forever: down at once, as before it existed.
  if (headlessMode) { mirrorPass.cancelPreparation(); loadingScreen.lowerWaitPlate(); return; }
  if (state === "race") loadingScreen.lowerWaitPlate();   // busy/handoff must not hide HUD docks after lights-out (hud-layout / hud-audit)
  // Context / device loss: shadow+begin already no-op, but render used to return
  // before afterPresent (begin===false / stuck warm) and leave handoff up forever.
  // Inline the stop (not RaceEntryProfile) so tests/unit/garage-arrival's render
  // prefix extract stays self-contained; afterPresent still marks lower-lost when
  // a later present path reaches it.
  if (gfxContextLost()) {
    try { mirrorPass.cancelPreparation(); } catch (_) { /* harness */ }
    if (loadingScreen.phase() === "handoff") loadingScreen.stop();
    return;
  }
  // Warming used to return before the visibility pass. openGarage's Home→bay
  // gap hides #game via menuBlank; if a program warm then latched, the lid
  // stayed up until an unrelated present (a panel click) cleared warming.
  // Intro staging (_studio.cardUp) must keep both canvases hidden under
  // PREPARING until the first successful garage present (garage-arrival).
  if (gfx.warming && gfx.warming()) {
    if (setupPreviewOn && !(_studio && _studio.cardUp)) {
      if (canvas.style.visibility === "hidden") canvas.style.visibility = "";
      if (!_softEl && gfx.softPresent && gfx.softPresent()) _softEl = document.getElementById("game-soft");
      if (_softEl && _softEl.style.visibility === "hidden") _softEl.style.visibility = "";
    }
    return;
  }
  if (uiExperience && uiExperience.renderHome(dt)) { if (loadingScreen.phase() === "busy" && els.overlay && els.overlay.dataset.homeReady) loadingScreen.stop(); return; }
  if (loadingScreen.phase() === "busy" && !setupPreviewOn && els.overlay && !els.overlay.hidden) loadingScreen.stop();
  // The live Home garage returned above. Other menus hide undrawn canvases
  // so a previous garage/race frame cannot leak behind a new screen. Loading
  // cinematics and garage previews retain their existing covered warm-up.
  const homeTrack = !!(uiExperience && uiExperience.trackActive());
  const menuBlank = (state === "menu" && !setupPreviewOn && !homeTrack && (!track || !loadingScreen.active() || !menuWorld()))
    || ((loadingScreen.phase() === "build" || loadingScreen.phase() === "busy") && !setupPreviewOn);   // the no-world card must not show the LAST circuit; nor may a build card over the results (startRaceCovered)
  const vis = menuBlank || (_studio && _studio.cardUp) ? "hidden" : "";
  if (canvas.style.visibility !== vis) canvas.style.visibility = vis;
  // Soft-present #game-soft is a sibling overlay (GLX HeadlessChrome / TLX). Keep
  // its visibility in lockstep with #game or a blank menu still shows the last blit.
  if (!_softEl && gfx.softPresent && gfx.softPresent()) _softEl = document.getElementById("game-soft");   // only a soft-presenting backend creates it (at init); cached once found
  if (_softEl && _softEl.style.visibility !== vis) _softEl.style.visibility = vis;
  // A freshly pre-built world draws its first frames HIDDEN (scheduleFlybyTrack
  // owes them): shaders, textures and shadow maps warm up under the picker, not
  // in front of the player the instant race settings opens.
  // ...and the garage pre-warm (garagePrewarm): its frames drawn hidden too.
  if (menuBlank && _menuGate.garageWarm > 0 && state === "menu") { _menuGate.garageWarm--; if (renderSetupPreview(dt)) _menuGate.garageReady = true; return; }
  if (menuBlank && !(track && _menuGate.warm > 0)) return;
  // The last hidden warm frame is the one observable "this world has drawn":
  // tools/lib/mem-census.mjs waits on this record (a census taken before it read
  // 10 render objects on llvmpipe, CI run 37330132243), and __apex is off-limits
  // while a picker build is in flight (lazyTrackEnsure).
  if (menuBlank && --_menuGate.warm === 0) Log.info("gfx", "menu warm drawn " + (track.def && track.def.id));
  // RESULTS: physics and PerfGov already stop; the sheet is translucent over
  // #game by design (tokens.css). Re-drawing an identical frozen world every
  // frame (env probe, shadows, rain, debris upload) was unpaid work — keep the
  // last race present and return. Race-settings flyby and live race still draw.
  if (state === "results" && !resultsCam.live()) return; // ResultsCam owns chequered/orbit/highlights
  // HELD GARAGE (studioDone): a world frame that kicks TLX's program warm paints nothing, so the
  // garage's last frame stays up — no hidden canvas, no black card before the flyby.
  const heldWarm = !!(_studio && _studio.held && track && _menuGate.warm > 0);
  if (heldWarm) _menuGate.warm--;
  if (setupPreviewOn && !heldWarm) {
    if (renderSetupPreview(dt, !!(_studio && _studio.cardUp))) {
      _menuGate.garageReady = true;
      if (!_studio || _studio.softReady !== false) studioShown();
      if (_studio && !_studio.cardUp) { canvas.style.visibility = ""; if (_softEl) _softEl.style.visibility = ""; }
    }
    return;
  }
  gfx.resize();
  // No track yet (the menus build none — the flyby belongs to RACE SETTINGS, see
  // scheduleFlybyTrack): DRAW NOTHING. alpha:false composites an undrawn canvas
  // as opaque BLACK, which the blessed menu baselines encode (corners 4-9/255).
  if (!track) return;
  _frameNo++;
  // camera
  let eyeT, tgtT, fovT, roadCamRoll = 0;
  // Is THIS frame the pre-race cinematic? It is rendered like photo mode rather
  // than like gameplay — far plane out, fog thinned, scenery not culled to the
  // fog wall — because its shots are whole-circuit vistas from a few hundred
  // metres up. See FlybySeq.FAR / FlybySeq.FOG for why both numbers live there.
  let cine = false;
  if (state === "menu") {
    _plOk = false; _plBodyOk = false;
    // THE LOADING SCREEN'S FLYBY IS A SHOT SEQUENCE (js/camera/flyby-seq.js), not
    // a crawl down the centreline. The old path solved camVantage("cinematic")
    // around an `s` that advanced with the wall clock; that rig clamps its
    // lateral offset only on STREET circuits, so on an open circuit it sat 22 m
    // off the racing line with nothing checking what was standing there, and
    // flew through buildings. The sequencer places every eye against the props
    // registry instead. It is driven by PROGRESS through the flyby phase, so the
    // sequence keeps its shape whatever the phase is retuned to.
    const fb = (homeTrack && uiExperience.trackCamera(dt)) || FlybySeq.solve(track, flybyProgress(), flybyShots);
    eyeT = fb.eye; tgtT = fb.tgt; fovT = fb.fov; camAncNX = null;
    // A shot boundary is a CUT. Without this the λ1.6 menu damping below smears
    // the change of angle into a long swim between two vantages, which reads as
    // one broken move rather than two shots.
    if (fb.cut) camSnapNext = true;
    cine = true;
  } else {
    if (!player) return;
    // Anchor the camera to the SAME (s, x) the car body samples — playerAnchor
    // derives it from the drawn WORLD position, shared with currentCarGroundMat
    // and the body loop, so camera and car move as one (no fore/aft slide, no
    // backwards jolt, no height/orientation jitter). Pre-jump/menu → arc interp.
    // Resolve once per frame; shadow + body reuse _plCS/_plCX (no second trackFrom).
    { const pa = playerAnchor(player); _plCS = pa.cS; _plCX = pa.cX; _plOk = true; _plBodyOk = false; }
    const pS = _plCS, px = _plCX;
    Tracks.sample(track, pS, smp);
    // NOTE: the camera rig is still built from (pS, px) inside camVantage(). That
    // is a much smaller coupling than the body had — (s, x) is now an exact
    // reading of the world position, so the rebuilt anchor lands within a
    // centimetre of the car, versus the 0.1 s lateral LAG the mesh carried. Left
    // alone deliberately rather than reworked blind.
    // ride the bank with the car so the camera doesn't sink into the banked road
    const bankCam = Tracks.banking(track, pS, px, _bankScratchCam, true);  // true = SMOOTH lift, camera only (mesh.js banking)
    const bankDy = bankCam ? bankCam.dy : 0;
    // Optional pit-entry/exit auto-cut onto PIT WALL (ExtraRigs) — before we
    // read camMode so this frame's vantage matches the cut.
    if (typeof ExtraRigs !== "undefined") ExtraRigs.tickPitAuto(G);
    const mode = CAM_MODES[camMode].id;
    roadCamRoll = bankCam ? -bankCam.roll * cameraBankScale(mode) : 0;
    // All per-mode framing lives in camVantage() so the live cam, snapCam() and the
    // previewCam() debug hook stay identical. bankDy keeps the eye riding the bank.
    // The free-world chase/onboard rig needs the car's world pose too — but
    // INTERPOLATED like everything else here, not raw. Raw px/pz/head only
    // update once per 60 Hz physics tick, so reading them straight in a
    // per-frame render loop snaps a full tick every frame instead of gliding
    // by renderAlpha: on a display whose refresh doesn't line up 1:1 with the
    // physics rate (common — 90/120 Hz, or ordinary vsync jitter at 60), that
    // reads as a held-then-jump stutter whose size scales with speed × dt —
    // "vibrates, worse the faster I go". renderPosOf/headInterp are the same
    // interpolation the car body and playerAnchor already use.
    const rpCam = renderPosOf(player);
    camAncNX = rpCam.world ? rpCam.x : null; camAncNZ = rpCam.world ? rpCam.z : 0;   // anchor for the car-frame camera damping below
    _vantExtra.bankDy = bankDy; _vantExtra.deploy = player.deploying; _vantExtra.reduceMotion = camComfort();   // kerb shiver off (js/camera/vantage.js)
    _vantExtra.slipLat = player.vLat || 0; _vantExtra.att = player;
    // the car's real world pose, so the chase rig can follow the CAR
    _vantExtra.carPos = rpCam.world ? (_vantCarPos[0] = rpCam.x, _vantCarPos[1] = rpCam.z, _vantCarPos) : null;
    _vantExtra.carHead = headInterp(player); _vantExtra.dt = dt;
    // CamFeel (free-look / look-back latch / speed vignette) ticks BEFORE the
    // vantage solve so this frame's offsets land in the same eye/tgt.
    if (typeof CamFeel !== "undefined") {
      CamFeel.tickRace(mode, dt, camComfort(), state === "race" || state === "count",
        clamp(player.speed / vTop(), 0, 1));
    }
    if (typeof ExtraRigs !== "undefined") {
      _vantExtra.rival = (mode === "rival") ? ExtraRigs.pickRival(cars, player) : null;
      _vantExtra.playerProg = player.prog || 0;
      _vantExtra.snap = false;
    }
    const vant = camVantage(mode, pS, px, player.speed, performance.now(), _vantExtra);
    eyeT = vant.eye; tgtT = vant.tgt; fovT = vant.fov; if (vant.cut) camSnapNext = true;
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.6);
      // squared: grazes barely move, crashes slam. REDUCE MOTION zeroes the OFFSET, not the trauma
      // (cues keyed to it stay timed); CamTune.shakeOffset also applies COMFORT › HEAD BOB. SCOPE: every
      // race camera (docs/notes/CAMERA-FEEL.md). Real-time noise, fps-independent; onboard it stays in the tub.
      if (typeof CamFeel !== "undefined") CamFeel.shake(eyeT, tgtT, CamTune.shakeOffset(shake, camComfort()), performance.now() * 0.001, CamFeel.isBuzzMode(mode));
    }
    // Onboard speed buzz — CamFeel.BUZZ_MODES (cockpit/hood/visor/tcam). Amp via
    // CamTune.buzzAmp (REDUCE MOTION / COMFORT › HEAD BOB). Off when wet (SSR flicker).
    const _buzzWet = 1.0 - clamp((frame.wetness || 0) * 2.0, 0.0, 1.0);
    if (state === "race" && _buzzWet > 0.01
        && (typeof CamFeel !== "undefined" ? CamFeel.isBuzzMode(mode)
          : (mode === "cockpit" || mode === "hood" || mode === "visor" || mode === "tcam"))) {
      const spV = clamp(player.speed / vTop(), 0, 1);
      const vAmp = CamTune.buzzAmp(spV, player.deploying, camComfort(), _buzzWet);
      if (vAmp > 0.001) {
        const tv = performance.now() * 0.001;
        const j1 = Math.sin(tv * 61.0) * 0.6 + Math.sin(tv * 97.0 + 1.7) * 0.4;
        const j2 = Math.sin(tv * 73.0 + 0.9) * 0.6 + Math.sin(tv * 111.0 + 2.3) * 0.4;
        eyeT[0] += j1 * vAmp; eyeT[1] += j2 * vAmp * 0.7;
        tgtT[0] += j1 * vAmp * 0.35; tgtT[1] += j2 * vAmp * 0.25;
      }
    }
  }
  // Sky-view override: __apex.sky() positions the camera to show the horizon
  // and clouds instead of the normal low chase angle.
  if (frozen && skyViewOverride) {
    eyeT = skyViewOverride.eye;
    tgtT = skyViewOverride.tgt;
    fovT = skyViewOverride.fov;
  }
  // High lambda in-race: the anchor already follows the car along the track,
  // so we only smooth bumps — no speed lag. Low lambda for the menu flyby.
  // Onboard cams ride ON the car (cockpit/hood/tcam), so they need very high
  // lambda or the eye lags behind/into the bodywork at speed.
  const racing = state === "race" || state === "count";
  const camId = CAM_MODES[camMode].id;
  const onboard = racing && (camId === "cockpit" || camId === "hood" || camId === "visor" || camId === "helmet" || camId === "tcam");
  // Just after a cut, ease the external cams in with a gentler lambda so the angle
  // sweeps to its new vantage instead of snapping. Onboard cams ignore it (must lock).
  const cutEase = camCutT > 0 ? (camCutT = Math.max(0, camCutT - dt), 0.4) : 1;
  // Onboard cams LOCK to the car (λ400 ≈ instant): at λ40 the exponential
  // smoothing left a steady-state lag of ~0.7-1 m at top speed, which slid the
  // cockpit eye backwards INSIDE the engine cover / shark fin — the "black
  // rectangle fills the screen at sustained speed" bug. The EYE must stay
  // locked, but the look-AHEAD target (camVantage curves it toward upcoming
  // corners) locking too made the head "snap" toward every apex instead of
  // panning — cockpit/hood ease the target gently, like a driver's eyes
  // leading into a corner rather than their whole head whipping around.
  // DRONE carries its own tether smooth inside ExtraRigs; comfort softens the
  // outer damp further. Chase λ18, broadcast pans at 9, rival/pit wall calmer.
  const softCam = camId === "drone" || camId === "rival" || camId === "pitwall";
  const raceLam = softCam ? (camComfort() ? 6 : (camId === "drone" ? 12 : 14)) : ((camId === "heli" || camId === "side" || camId === "cinematic" || camId === "overhead" || camId === "low" || camId === "trackside") ? 9 : 18);
  const lE = onboard ? 400 : (racing ? raceLam : 1.6) * cutEase;
  const gentleHead = !camComfort() && onboard && (camId === "cockpit" || camId === "hood" || camId === "visor" || camId === "helmet") && (typeof CockpitOpts === "undefined" || CockpitOpts.turnChase());   // gentle easing is ONLY for a curved aim; a nose-locked aim must not lag; XR: HMD owns look
  const lT = gentleHead ? 7 : onboard ? 400 : (racing ? raceLam + (softCam ? 1 : 2) : 10) * cutEase;
  // Damp HORIZONTALLY in the CAR's frame, not the world's. Damping toward a
  // MOVING target lags ~v/lambda - v*dt/2, so the car-to-camera distance
  // breathes with frame time: MEASURED, a 16-38 ms vsync wobble swings it
  // 28.7 cm at 320 km/h, 4.7 cm at 150 — it scales with SPEED, hence "the car
  // vibrates, worse the faster I go", and a heavier resolution (longer,
  // jitterier frames) makes it worse. Damping the OFFSET cancels the velocity
  // term exactly: 0.0000 cm at every speed, and the chase distance stops
  // inflating (13.2 m back to the intended 8.0 m at 320). y stays world-frame.
  const ancX = camAncNX, ancZ = camAncNZ;
  if (ancX === null || camAncX === null) { camAncX = ancX; camAncZ = ancZ; }   // first frame / no world pose: no jump
  const aP = _camAP, aN = _camAN;   // pooled, filled in place
  aP[0] = camAncX === null ? 0 : camAncX; aP[2] = camAncZ;
  aN[0] = ancX === null ? 0 : ancX; aN[2] = ancZ;
  for (let i = 0; i < 3; i++) {
    camEye[i] = aN[i] + damp(camEye[i] - aP[i], eyeT[i] - aN[i], lE, dt);
    camTgt[i] = aN[i] + damp(camTgt[i] - aP[i], tgtT[i] - aN[i], lT, dt);
  }
  camAncX = ancX; camAncZ = ancZ;
  camFov = damp(camFov, fovT, onboard ? 4 : 4 * cutEase, dt);
  if (typeof CamFeel !== "undefined" && CamFeel.consumeAimSnap()) { for (let i = 0; i < 3; i++) camTgt[i] = tgtT[i]; camRoll = -camRoll; }   // LOOK BACK flipped: a cut for the AIM, roll mirrored (feel.js)
  // A CUT LANDS WHOLE. Damping exists to smooth a moving vantage; across a shot
  // boundary there is nothing to smooth — the two vantages are unrelated, and
  // easing between them turns a cut into a long swim through whatever lies
  // between. Set by the flyby sequencer at a shot boundary only.
  if (camSnapNext) {
    for (let i = 0; i < 3; i++) { camEye[i] = eyeT[i]; camTgt[i] = tgtT[i]; }
    camFov = fovT;
    camSnapNext = false;
  }
  // The EDITOR's preview is the same cinematic, parked (js/agent/apex.js stamps
  // `cine` on its dbgCam). From here down, everything gated on `cine` is a thing
  // the live screen and the preview have to do IDENTICALLY — that is the whole
  // point of the flag, and the reason it is widened here rather than read as two
  // separate conditions at four sites that can drift apart one at a time.
  if (dbgCam && dbgCam.cine) cine = true;
  // Car-follow cameras counter-rotate by the road bank so the car and asphalt
  // read level while the horizon carries the banking cue. Slip adds a small
  // dynamic lean on top; broadcast/debug and cinematic cameras stay world-level
  // (the flyby's own roll would otherwise be whatever the last race left behind,
  // decaying over the first half-second of a shot the editor showed level).
  if (dbgCam || cine || camComfort()) {
    camRoll = (dbgCam && dbgCam.roll) || 0;   // level unless the FREE CAMERA's ROLL dial set one; XR: HMD owns roll
  } else {
    // Slip source smoothed at λ10 (τ≈0.1 s): vLat/speed are RAW 60 Hz-stepped
    // physics values, and feeding them straight into screen roll printed every
    // physics step onto the horizon — the most visible jitter class. λ7 on the
    // roll itself matches the old linear dt/0.15 blend at 60 fps
    // (1−e^(−7/60) ≈ 0.110 ≈ (1/60)/0.15) but is frame-rate independent, so
    // 30 and 120 Hz devices converge at the same real-time rate. COMFORT › ROLL
    // LEAN scales via CamTune.rollTarget (camComfort still forces level above).
    const slipRaw = player && player.speed > 1 ? (player.vLat || 0) / player.speed : 0;
    camSlipSm = damp(camSlipSm, clamp(slipRaw, -1, 1), 10, dt);
    camRoll = damp(camRoll, (typeof CamFeel !== "undefined" && CamFeel.lookingBackNow() ? -1 : 1) * CamTune.rollTarget(roadCamRoll, camSlipSm, (onboard && player ? (player.baRoll || 0) * 0.85 : 0), false), 7, dt);
  }
  // Debug free camera (set via __apex.view) overrides the chase cam — instant
  // (no damping), uncapped FOV, far plane and fog pushed out — for inspecting
  // whole-track layouts and trackside scenery from any angle.
  // RENDER DISTANCE knob: scales the far clip plane (and, below, the chunked-
  // scenery draw-distance cull that derives from it). dbgCam overwrites
  // farPlane with its own value right below, so debug/photo-mode is untouched.
  let fovY, farPlane = 900 * (LT.renderDistMul != null ? LT.renderDistMul : 1);
  if (cine) farPlane = FlybySeq.FAR;   // flat, not scaled by RENDER DISTANCE: the editor previews ONE number
  if (dbgCam) {
    GameCams.applyFreeCam(dbgCam, camEye, camTgt);
    fovY = dbgCam.fov * Math.PI / 180;
    if (!cine) farPlane = dbgCam.far;
  } else {
    // camFov is a vertical FOV. On a wide (landscape) screen a fixed vertical FOV
    // blows the horizontal field out past ~100°, which makes the car look tiny and
    // far away. Cap the horizontal FOV so wide screens zoom in and the car stays a
    // readable size; portrait (narrow) is unaffected.
    fovY = camFov * Math.PI / 180;
    // The HFOV cap keeps the CAR a readable size on a wide screen. A crane shot
    // has no car in it, the editor previews the authored angle uncapped, and a
    // shot authored at 60° would arrive on a 21:9 screen squeezed to 45° — so
    // the cinematic takes the number it was framed at.
    if (!cine) {
      const HFOV_MAX = 86 * Math.PI / 180;
      const fovYCap = 2 * Math.atan(Math.tan(HFOV_MAX / 2) / Math.max(gfx.aspect, 0.0001));
      fovY = Math.min(fovY, fovYCap);
    }
  }
  // Near plane 0.3 (was 0.2): pushing the near distance out sharpens depth-buffer
  // precision across the scene — the biggest single lever against z-fighting /
  // shadow flicker. Capped at 0.3 (not higher): the cockpit rig keeps the wheel /
  // dash fascia a proven 0.46 m from the eye (COCKPIT_EYE_FWD + _rigT), so 0.3
  // still clears it with ~9 cm to spare while raising the far/near precision
  // floor ~1.5x vs 0.2.
  // Per-camera near plane. Depth precision is governed by the near:far RATIO,
  // and a 0.3 m near against a 900 m far spends almost all of it in the first
  // few metres — which is why distant coplanar geometry z-fights. The near
  // plane CANNOT simply be raised globally: the cockpit rig sits 0.46 m from
  // the eye (see _rigT), so anything above ~0.35 slices the steering wheel and
  // fascia out of frame. Only cockpit/hood views have geometry that close, so
  // they keep 0.3 and every other view takes a near plane that buys back a lot
  // of depth resolution for free.
  const _projMode = CAM_MODES[camMode] ? CAM_MODES[camMode].id : "chase";
  const _nearM = (_projMode === "cockpit" || _projMode === "hood" || _projMode === "visor" || _projMode === "helmet") ? 0.3 : 0.9;
  const _near = cine ? FlybySeq.NEAR : (dbgCam ? 0.3 : _nearM);
  M4.perspectiveTo(_mProj, fovY, gfx.aspect, _near, farPlane);
  if (homeTrack && !dbgCam) { const view = uiExperience.trackCamera(); _mProj[8] = view.shiftX; _mProj[9] = view.shiftY; }
  // Tilt the up vector by camRoll to roll the camera into corners. Inlined into
  // module-scope scratch vectors (no per-frame V3 array allocation); same math.
  {
    let bx = camEye[0] - camTgt[0], by = camEye[1] - camTgt[1], bz = camEye[2] - camTgt[2];
    let bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
    // right = normalize(worldUp × back), worldUp = (0,1,0)
    let rx = 1 * bz - 0 * by, ry = 0 * bx - 0 * bz, rz = 0 * by - 1 * bx;
    let rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    // up = normalize(worldUp + right*sin(roll))
    const s = Math.sin(camRoll);
    let ux = rx * s, uy = 1 + ry * s, uz = rz * s;
    let ul = Math.hypot(ux, uy, uz) || 1;
    _camUp[0] = ux / ul; _camUp[1] = uy / ul; _camUp[2] = uz / ul;
  }
  M4.lookAtTo(_mView, camEye, camTgt, _camUp);
  M4.mulTo(_mVP, _mProj, _mView);
  // inv VP: sky rays always; god-rays when live. inv Proj: SSAO only — both post
  // consumers shed at autoTier>=4 (see po.ssao/godray below).
  M4.invertTo(_mInvVP, _mVP);
  if (PerfGov.autoTier() < 4) M4.invertTo(_mInvProj, _mProj);
  // Sun direction in VIEW space (for screen-space contact shadows): mat3(view)·sunDir.
  {
    const sd = frame.sunDir || [0, 1, 0];
    let x = _mView[0]*sd[0] + _mView[4]*sd[1] + _mView[8]*sd[2];
    let y = _mView[1]*sd[0] + _mView[5]*sd[1] + _mView[9]*sd[2];
    let z = _mView[2]*sd[0] + _mView[6]*sd[1] + _mView[10]*sd[2];
    const l = Math.hypot(x, y, z) || 1;
    _sunVS[0] = x/l; _sunVS[1] = y/l; _sunVS[2] = z/l;
  }
  // The ROAD PLANE's normal in VIEW space. Used by the wet-road SSR to pick out
  // road pixels AND — the part that matters — as the plane its reflection ray is
  // flattened onto (post.js: Nr = mix(Nv, upVSn, 0.85)).
  //
  // This was world-up (0,1,0), i.e. mat3(view)'s second column, which is only the
  // road's normal ON THE FLAT. On a gradient θ the two differ by θ, the flatten
  // carries 0.85 of that error into the reflection normal, and a reflection
  // DOUBLES angular error — so a 10° climb threw the reflected ray ~17° off. At
  // grazing incidence that ray only leaves the surface at 2-5°, so being 17° out
  // either dives it into the tarmac (mirroring asphalt) or throws it clear over
  // the scene (a miss). That is why the wet road went patchy specifically on
  // elevation. Sampling the real road normal costs one track sample per frame.
  //
  // r is bank-rotated at build time (tracks.js), so n = r × t carries CAMBER too,
  // not just gradient — the same basis the cockpit rig builds.
  {
    let nx = 0, ny = 1, nz = 0;
    if (track && player && player.s != null) {
      Tracks.sample(track, player.s, _smpRoad);
      const t = _smpRoad.t, r = _smpRoad.r;
      const ux = r[1]*t[2] - r[2]*t[1],
            uy = r[2]*t[0] - r[0]*t[2],
            uz = r[0]*t[1] - r[1]*t[0];
      const ul = Math.hypot(ux, uy, uz);
      if (ul > 1e-6) { nx = ux/ul; ny = uy/ul; nz = uz/ul; }   // else keep world-up
    }
    // mat3(view) * n  (column-major: column j is elements 4j..4j+2)
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
  const _xrEyes = XrBoot.applyEyes(frame, camEye, camTgt, _camUp);   // null when flat
  // Radial draw-distance cull for chunked scenery, in two halves every backend's
  // chunk loop applies together (Frustum.radialCulled, js/render/shared/frustum.js).
  // frame.cullDist, the HARD radius. Free/debug camera and cinematic: mobile caps
  // at 700 m (a pushed-out photo-mode far plane frames a whole ~5 M-vert city and
  // jetsam-kills the tab; the cinematic runs seconds after the build's transient
  // peak), desktop keeps the full vista. Feature-shedding tier 3+ caps at the far
  // plane (scenery vertex/draw load is the one big cost class the resolution
  // scale and shed passes don't touch). Otherwise the sphere that contains the
  // frustum (far-plane corners sit farther than farPlane) — look-identical.
  // frame.cullFog, the FOG WALL: [density, height falloff] as the SHADER renders
  // them (frame.fogDensity * FOG DENSITY — off the raw base, FOG DENSITY 0 still
  // culled scenery at 250 m with no fog drawn). A chunk goes once even its
  // nearest point raised to its top is 99.99 % fogged: HEIGHT-AWARE, because one
  // eye-level radius (3/density, 750 m at night) culled floodlights, hotels and
  // hills while only 65-70 % fogged. Off (density 0) under dbgCam/cine: they
  // render a THINNED fog (_fogMul, read by gfx.begin() far below), and culling
  // at frame.fogDensity's unthinned wall is a hard edge of missing world.
  const _fogMul = cine ? FlybySeq.FOG
    : (dbgCam ? (dbgCam.fog != null ? dbgCam.fog : 0.15) : null);
  const _cullFog = frame.cullFog || (frame.cullFog = [0, 0]);
  _cullFog[0] = (dbgCam || cine) ? 0 : (frame.fogDensity || 0) * (LT.fogDensityMul != null ? LT.fogDensityMul : 1);
  _cullFog[1] = LT.fogHeight != null ? LT.fogHeight : (frame.fogHeight || 0);   // uFogHeight's own fallback
  const _farCull = farPlane * Math.hypot(1, Math.tan(fovY * 0.5) * Math.hypot(1, gfx.aspect || 1));
  frame.cullDist = (dbgCam || cine) ? (gfx.isMobile ? 700 : 0) : (PerfGov.tier() >= 3 ? farPlane : _farCull);
  // WHAT THIS FRAME WAS ACTUALLY BUILT WITH, for __apex.camState().lens. Not a
  // debug nicety: the live flyby and the EDITOR'S preview of the same shot ran
  // different lenses for months with nothing able to see it, because every hook
  // reported where the camera POINTED. Written after all five are resolved.
  _lens.near = _near; _lens.far = farPlane; _lens.fovY = fovY;
  _lens.fog = _fogMul; _lens.cull = frame.cullDist; _lens.cine = cine;
  // Clear-night moon factor for cast shadows (0..1): 1 under a bright clear
  // moon, fading out as cloud rolls in or the road gets wet, forced 0 in fog.
  // glx.js floors its key-dim shadow fade with LT.moonShadow * frame.moonGate, so
  // moonlight casts soft shadows on clear nights only — fog/overcast/rain
  // nights stay shadowless, UNLESS the MOON SHADOWS knob is pushed past 0.5 (see
  // moonGate below), a player-facing escape hatch. Computed BEFORE the shadow
  // pass because the prop and car caster gates below feed the snap-cached map
  // from it. Mirrors the frameSky.moon / frame.cloud plumbing further down
  // (values persist across frames, so first-frame staleness only delays the
  // gate by one recentre).
  {
    const _mAmt = (raceTimeOfDay === "default" && track && track.def && track.def.night)
      ? 0.85 * LT.moonBright : (frameSky.moon || 0);
    const _mCl = frameSky.cloud !== undefined ? frameSky.cloud : _cloudBase;
    let _cf = (_mCl - 0.35) / 0.25;                    // smoothstep(0.35, 0.6, cloud)
    _cf = _cf < 0 ? 0 : _cf > 1 ? 1 : _cf;
    _cf = _cf * _cf * (3 - 2 * _cf);
    frame.moonK = raceWeather === "fog" ? 0
      : clamp(_mAmt / 0.85, 0, 1) * (1 - _cf) * (1 - clamp((frame.wetness || 0) * 2, 0, 1));
    // MOON SHADOWS knob above 0.5 overrides the weather gate above (clear/dry/
    // no-fog) so a player who wants shadows at night through cloud/fog/wet can
    // have them — ramps from moonK (at 0.5, no change) to fully open (at 1.0).
    const _msh = LT.moonShadow != null ? LT.moonShadow : 0.25;
    frame.moonGate = Math.max(frame.moonK, clamp((_msh - 0.5) * 2, 0, 1));
  }
  // Resolve the moving player before any shadow-map pass (first-person views cast
  // the cockpit body where the car loop draws it). AI keeps the pooled matrices
  // from the preceding frame; only the player's shadow makes that latency visible.
  const _hasLivePlayerShadow = !!(player && state !== "menu");
  if (_hasLivePlayerShadow) { currentCarGroundMat(player, shadowPass.livePlayerMat); shadowPass.resolvePlayer(_smpPlayer, yawVisInterp(player)); }
  // Sun / car shadow maps: js/render/shared/shadow-pass.js (snap-cached static map,
  // per-frame car map). The live player matrix was resolved above.
  if (!XrBoot.comfort()) shadowPass.sunPass(frame, _frameNo, _hasLivePlayerShadow);   // XR: skip maps
  // ── Sky animation & weather FX ──────────────────────────────────────────
  // Advance the render clock regardless of physics freeze so the sky always
  // animates (cloud drift, star twinkle) — unless a capture holds it.
  if (!_skyHold) _skyT += dt;
  frameSky.time = _skyT;
  // STAR BRIGHTNESS / CLOUD SPEED tuner knobs ride on the sky object.
  frameSky.starBright = LT.starBright;
  frameSky.cloudSpeed = LT.cloudSpeed;
  // SKY GRADIENT / STAR DENSITY / DAY SKY BLUE knobs also ride the sky object.
  frameSky.skyGrad     = LT.skyGrad;
  frameSky.starDensity = LT.starDensity;
  frameSky.daySkyBlue  = LT.daySkyBlue;
  // MIE SCATTER / CLOUD SILVER / CORONA AUREOLE / SUN DISC SIZE knobs (sky pass).
  frameSky.mieScatter    = LT.mieScatter;
  frameSky.cloudSilver   = LT.cloudSilver;
  frameSky.coronaAureole = LT.coronaAureole;
  frameSky.sunDiscSize   = LT.sunDiscSize;
  // STAR SIZE / TWINKLE, MOON DISC SIZE / HALO, SUN CORONA / SQUASH, CITY GLOW
  // REACH and CLOUD DEFINITION knobs also ride the sky object (sky pass).
  frameSky.starSize      = LT.starSize;
  frameSky.starTwinkle   = LT.starTwinkle;
  frameSky.moonDiscSize  = LT.moonDiscSize;
  frameSky.moonHalo      = LT.moonHalo;
  frameSky.sunCorona     = LT.sunCorona;
  frameSky.sunSquash     = LT.sunSquash;
  frameSky.cityGlowReach = LT.cityGlowReach;
  frameSky.cloudDef      = LT.cloudDef;
  // Feed the same clock + cloud cover to the lit shader for drifting cloud shadows.
  frame.time = _skyT;
  frame.cloud = frameSky.cloud !== undefined ? frameSky.cloud : _cloudBase;
  // Same cloud-speed knob the SKY uses, so the ground cloud-shadow dapple + the
  // godray shafts freeze/slow in lockstep with the visible sky (0 = frozen sky).
  frame.cloudSpeed = LT.cloudSpeed;
  // THE PAINTED PIT LANE, as (entry s, window length, side, lap length). The
  // lane is a fragment-shader marking rather than geometry — one ribbon, one
  // arc coordinate, so a road that branches and rejoins cannot be built here
  // (js/race/pit-lane.js says what that cost). null until the tyre setting
  // arms a lane, and the shaders test the zero LENGTH, so nothing paints.
  frame.pitLane = pits.laneUniform();
  frame.pitBox = pits.boxUniform();   // where YOUR box is, for roadMarkings to draw
  // frame.wetness: WeatherArc.syncWetness (wxArc.tick stands in only when
  // headless, so it ramps once). LT.wetness ≥ 0 is the live tuner pin only — never a preset.
  if (wxArc) wxArc.syncWetness(dt);
  // Falling rain, for the puddle RIPPLES in the lit shaders (uRain / U.rain /
  // params4.z): 1 in a storm, a third under the DRIZZLE tier, 0 dry — ramped at
  // the same 0.8/s as wetness so the rings fade in and out rather than pop.
  {
    const rainTarget = isRaining() ? 1 : isWetRoad() ? 0.35 : 0;
    const cur = frame.rain || 0;
    frame.rain = cur + (rainTarget - cur) * Math.min(1, dt * 0.8);
  }
  // Moon: use the value set by applyRaceSettings; pass through for default
  // night tracks that didn't go through the explicit raceTimeOfDay branch.
  // (frameSky.moon is already set in applyRaceSettings for non-default modes;
  // here we make sure default+track.night also gets a moon each frame.)
  if (raceTimeOfDay === "default" && track && track.def && track.def.night) {
    frameSky.moon = 0.85 * LT.moonBright;
  }
  // ── Lightning (active rain only) ─────────────────────────────────────────
  const wet = isWetRoad();      // wet-road material applies to "wet" AND "rain"
  const raining = isRaining();  // falling rain, lightning + thunder only in "rain"
  if (raining && _ltBase && LT.lightning > 0) {
    // Count down to the next strike
    _ltNextT -= dt;
    if (_ltNextT <= 0) {
      // Trigger a new flash: intensity 1 → decays at ~8×/s
      _ltFlash = 1.0;
      // Next strike in 4–12 s, scaled by the LIGHTNING FREQ knob (higher = sooner).
      _ltNextT = (4 + Math.random() * 8) / LT.lightning;
      // Queue thunder to lag the flash (sound travels slower than light): a
      // near strike cracks ~0.3 s later, a distant one rumbles up to ~2 s later.
      _thunderT = _thunderDelay = 0.3 + Math.random() * 1.7;
    }
    if (_thunderT >= 0) {
      _thunderT -= dt;
      if (_thunderT < 0 && typeof GameAudio !== "undefined" && GameAudio.thunder) {
        // The DRAWN delay, not the countdown's remainder. `_thunderT + dt` is
        // whatever was left before this frame's decrement — between 0 and one
        // frame — so it would always give ~1.0 - 0.008 and clamp to full
        // volume: a 2 s distant rumble as loud as a 0.3 s overhead strike.
        GameAudio.thunder(clamp(1.0 - _thunderDelay / 2.0, 0.15, 1.0));
      }
    }
    if (_ltFlash > 0.001) {
      // Decay: fast leading edge, then slow dying glow (LIGHTNING DECAY, def 8).
      _ltFlash *= Math.exp(-(LT.lightningDecay != null ? LT.lightningDecay : 8) * dt);
      if (_ltFlash < 0.001) _ltFlash = 0;
    }
    if (_ltFlash > 0) {
      // Spike ambient to a cool blue-white; the decay reads as a natural flash.
      // A brief exposure lift too, so the whole frame bleaches for the strike.
      // Written IN PLACE (no per-frame array allocation — this ran every rain
      // frame, exactly when the frame is already heaviest). LIGHTNING FLASH (def
      // 1) scales the ambient spike + exposure lift together; def reproduces the
      // shipped 0.55/0.40/0.22 exactly.
      const lf = LT.lightningFlash != null ? LT.lightningFlash : 1;
      const f = _ltFlash, aS = frame.ambientSky, aG = frame.ambientGround;
      for (let i = 0; i < 3; i++) {
        aS[i] = Math.min(1, _ltBase.ambientSky[i] + 0.55 * f * lf);
        aG[i] = Math.min(1, _ltBase.ambientGround[i] + 0.40 * f * lf);
      }
      // SET from the saved base (was `+=`: it accumulated every frame of the
      // ~0.9 s flash and was never restored — each strike permanently brightened
      // the scene by ~+1.65 exposure, washing a stormy race out to white).
      frame.exposure = _ltBase.exposure + 0.22 * f * lf;
    } else {
      // Restore base ambient + exposure so normal ticks aren't tinted (in place).
      const aS = frame.ambientSky, aG = frame.ambientGround;
      for (let i = 0; i < 3; i++) { aS[i] = _ltBase.ambientSky[i]; aG[i] = _ltBase.ambientGround[i]; }
      frame.exposure = _ltBase.exposure;
    }
  } else if (_ltFlash > 0) {
    // Weather flipped dry mid-flash: the decay above is inside the raining gate,
    // so without this the flash froze >0 and frameSky.lightning (set uncondition-
    // ally each frame) kept the sky partially bleached until the next storm.
    _ltFlash *= Math.exp(-(LT.lightningDecay != null ? LT.lightningDecay : 8) * dt);
    if (_ltFlash < 0.001) _ltFlash = 0;
  }
  // Lamps: EVERY track has them (see buildTrackLights); they're fed to the
  // shader whenever the scene is dark enough to read them — night, dusk, or dawn
  // on any circuit, or a night-default track in default mode. In bright day the
  // sun dominates so they're normally left off (no washed-out daylight pools) —
  // UNLESS the DAYTIME LAMPS knob (LT.floodDay) is turned up, which lights the
  // pools under a blue sky for a lit-stadium look (handled in the else-branch).
  const _floodActive = isFloodActiveSession();
  // Daytime lamps: only when the session isn't already a dark one AND the knob is
  // up. Brightness = floodDay × LAMP LEVEL (neutral white, no twilight warmth ramp).
  const _floodDayLvl = (!_floodActive && LT.floodDay > 0) ? LT.floodDay : 0;
  // Cleared every frame, set only by the flood branch: `frame` outlives a
  // night->day time-of-day flip (rebuilt only in loadTrack), and a stale
  // allLights kept chunked geometry binding per-chunk night lamps in daylight.
  frame.allLights = null; frame.lampBake = null; frame.perChunkLights = 0; frame.roadChunkLamps = 0; frame.tailStart = 0; frame.tailCount = 0;
  if (_floodActive || _floodDayLvl > 0) {
    // Rebuild if empty (not just undefined): a light set built before the track
    // centreline finished is empty; retry until it yields lights. Tracks always
    // produce a full set once complete, so this self-heals in a frame.
    if (!track._lights || track._lights.length === 0) track._lights = buildTrackLights(track);
    // Time-dependent lamps: brightness + COLOUR ramp with sun elevation.
    // At twilight (sun near/just below horizon) the lamps are dim and WARM, as if
    // freshly switched on / still warming up; by deep night they reach full
    // brightness and cool to their neutral tint. Smooth, no hard dusk/night step.
    // The dusk sky sits at a near-constant ~10-20 degree sun elevation for the
    // WHOLE session (see the dusk sunDir above) — a (0.07-sy)/0.22 ramp pins
    // at nightF=0 the entire time, stuck at a fixed 0.34 floor no matter how
    // bright that golden-hour sky still is. Lamps that bright, fed
    // through the wet-road SSR mirror, blew out the whole reflected scene.
    // Full "night" sessions deliberately keep sunY slightly positive for the sky
    // glow (see _floodEmit below) — ramp by elevation ONLY for dusk/dawn, and
    // stay at full brightness for a real night session, same branching as
    // _floodEmit uses.
    // LAMP TEMPERATURE: a signed white-balance layered over each lamp's own
    // colour + the automatic twilight warmth ramp. −1 warm (sodium ~2700K),
    // +1 cool (LED/broadcast ~6500K). Green held near-constant; red↑/blue↓ warm.
    // Shared by the night and daytime-flood paths.
    const _lt = LT.lampTemp || 0;
    const _ltr = 1 + Math.max(0, -_lt) * 0.18 - Math.max(0, _lt) * 0.12;
    const _ltg = 1 - Math.abs(_lt) * 0.02;
    const _ltb = 1 - Math.max(0, -_lt) * 0.30 + Math.max(0, _lt) * 0.20;
    frame.glowLights = null;   // appendCarTailLights sets it; stale otherwise (TAIL-LIGHT EMIT 0)
    frame.lampBake = null;     // BAKED LAMP POOLS: set below whenever the flood set is lit (night or day floods)
    if (_floodActive) {
      const _sy = frame.sunDir ? frame.sunDir[1] : -1;
      // Floor the twilight ramp at 0.30: the dusk sunDir sits slightly higher than
      // dawn's, so a bare `clamp(1 - _sy*6, 0)` pinned dusk floods at the 5% floor
      // for the whole session (the LAMPS sliders had no authority at dusk).
      // The floor lands dusk at dawn's ~0.30 level so both twilights are usable.
      // TWILIGHT FLOOR + TWILIGHT RAMP knobs: the dawn/dusk floor level and how
      // steeply floods climb to full as the sun sets (def 0.30 / 6 = as-shipped).
      const nightF = (raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn")
        ? Math.max(LT.twilightFloor != null ? LT.twilightFloor : 0.30,
                   clamp(1 - _sy * (LT.twilightRamp != null ? LT.twilightRamp : 6), 0, 1))
        : 1;                                              // night / default-night: full ramp
      // Overall dimmer: the per-lamp base intensities (floodColor) are tuned as
      // raw physical HDR values (16-20) — at full ceiling they overpowered the
      // scene (blown-out wet-road SSR mirror, washed neon night city, blown-white
      // barrier walls beside close-mounted masts). Cap the ceiling well below 1.0,
      // on top of the twilight ramp above.
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
    // Resolved BEFORE setFrameLights: it builds the scaled full set for the
    // per-chunk path and needs these already on the frame (they are cleared
    // above, so reading them earlier always saw 0).
    // ADAPTIVE: autoShed() is the crash floor + the governor's MEASURED shed
    // WITHOUT the GRAPHICS user floor (js/perf/governor.js `_autoShed`), so LOW does
    // not disable this while a device missing frames still sheds it. A tier()>=1
    // gate locks out MEDIUM although the shipped 0.3 measured 18.6%/23.5% FASTER
    // (docs/PERF-FINDINGS.md §R5); autoTier() leaks the preset back in.
    // SHED TO THE CHEAP SETTING, NOT OFF. At autoShed 1 the knob is capped at
    // 0.3 (8 lamps a chunk) — the setting §R5 measured FASTER than off — and
    // only autoShed 2 turns it off. Switching it off at the first shed handed a
    // struggling phone the camera-culled set: slower, and the lamps ahead
    // popping on as they entered it.
    const _pcShed = PerfGov.autoShed();
    // Wet phone floor: on a wet road ~half a lamp's light is its live reflection,
    // and at a 16-24 slot cap 35-39 % of it comes from lamps outside the set
    // (docs/notes/LAMP-POPPING-PLAN-2026-09-24.md, b) — so they pop. Per-chunk
    // lamps, road included, cover them; the governor shed still wins.
    const _pcWet = gfx.mobileTier && (frame.wetness || 0) > 0.75 ? 0.6 : 0;   // 0.75: rain/wet only — dry sheen is ssrDryNight, not wetness
    frame.perChunkLights = (!gfx.hasPerChunkLights || _perChunkOff || _pcShed >= 2) ? 0
      : (_pcShed >= 1 ? Math.min(0.3, Math.max(_pcWet, +LT.perChunkLights || 0)) : Math.max(_pcWet, +LT.perChunkLights || 0));
    frame.roadChunkLamps = (frame.perChunkLights > 0 && (LT.roadChunkLamps || _pcWet > 0)) ? 1 : 0;
    setFrameLights(camEye, _floodRGB, _lightFwd);
    // BAKED LAMP POOLS (js/lighting/lamp-bake.js): the whole track set's ground
    // pools at base colour, scaled per frame by the same _floodRGB the live set gets.
    // Paint-mode tails only: emitting tails ride the live loop, whose diffuse
    // (lampSh - bakeW) would erase their unbaked pool on the road.
    if (LT.lampBake > 0 && gfx.hasLampBake && !(LT.tailLightEmit > 0)) {
      frame.lampBake = LampBake.forTrack(track, track._lights, LT.lampNearClamp, undefined, false, LampBake.budget(gfx));
      frame.lampBakeScale = _floodRGB;
    }
    // PER-CHUNK LAMPS (experimental): hand the renderer the FULL baked lamp list
    // alongside the globally-culled frame.lights, so GLXChunked can bind each
    // chunk its own nearest-24 instead of every chunk sharing this one set.
    // frame.lights stays authoritative for the car and everything non-chunked.
    // setFrameLights fills allLights with the SCALED full set when per-chunk is
    // on; off, nothing consumes it, so leave it null rather than the raw list.
    if (!(frame.perChunkLights > 0)) { frame.allLights = null; frame.allLightsGen = 0; }
    // Pass the knob's VALUE, not a flag. PER-CHUNK LAMPS is a 0..1 amount: > 0
    // turns per-chunk lamp sets on and doubles as the track-lamp intensity
    // scale, because the feature genuinely delivers more light per fragment
    // (each chunk gets up to 24 lamps that actually reach it instead of sharing
    // one global cull) and needs a dimmer to be usable at the shipped LAMP LEVEL.
    // SHEDS AT TIER 1 — the ladder every other expensive feature is already on
    // (SSR at 2, car shadows at 3, SSAO/god-rays/bloom/lampVol at 4). PER-CHUNK
    // LAMPS was the one discretionary renderer feature with NO tier gate at
    // all, so a device that could not afford it had no way out except the
    // player noticing.
    //
    // It needs the EARLIEST rung, not the latest, because its cost is
    // per-fragment and unbounded rather than a fixed pass. The lit shader loops
    // the bound lamp slots per fragment; without per-chunk most slots hold lamps
    // nowhere near it, so the range reject fires at once and they cost almost
    // nothing. Per-chunk deliberately fills those slots with lamps that DO
    // reach — the whole point of the feature — so far more iterations run the
    // full lighting path. Cockpit view compounds it: the camera sits against
    // near geometry and now carries reflective mirror surfaces.
    //
    // MEASURED, by accident: every camera mode rendered 20 frames
    // in seconds, then cockpit + night + perChunkLights=1 held 380% CPU for 22
    // MINUTES on 40 frames in the same harness. On real hardware a frame that
    // cannot finish inside the driver's watchdog is a GPU reset — context lost,
    // page dead, which a player reports as a crash rather than as slowness.
    // (Distinct from the merged-draw watchdog theory considered and dismissed
    // earlier: that was ONE large draw, single-digit ms. This is sustained
    // per-fragment cost across the whole frame.)
    //
    // Composes with the crash sentinel in js/perf/governor.js: a player who has
    // already hit a hard failure comes back at a floored tier, which now has
    // the feature off, so the sentinel can actually rescue this case instead of
    // watching it repeat.
    // (both resolved above, before setFrameLights.)
    // Car tail-lights are an after-dark cue only — skip them under daytime floods.
    // They are appended to frame.lights AFTER the static cull, so they sit
    // outside track._lights and a per-chunk set built from allLights would drop
    // them. Record the appended range so GLXChunked can add them to every chunk.
    if (_floodActive) appendCarTailLights();   // sets the real tailStart/tailCount range
  } else if (track.hasAlwaysLamps) {
    // ALWAYS-ON FIXTURES in a bright session. A circuit can register lamps that
    // burn regardless of the hour (lampPost({always:true}) — Monaco's tunnel
    // luminaires). Those live in a SEPARATE baked set, so a day race lights the
    // one place the sun cannot reach without switching the whole circuit's
    // street lighting on. Same cull, same knobs; no twilight ramp and no car
    // tail-lights, both of which are after-dark cues.
    if (!track._alwaysLights || track._alwaysLights.length === 0)
      track._alwaysLights = buildTrackLights(track, true);
    if (track._alwaysLights.length) {
      const _al = LT.lampLevel;
      _lightFwd[0] = camTgt[0] - camEye[0]; _lightFwd[2] = camTgt[2] - camEye[2];
      _alRGB[0] = _alRGB[1] = _alRGB[2] = _al;   // pooled — this ran once per frame
      setFrameLights(camEye, _alRGB, _lightFwd, track._alwaysLights);
    } else frame.lights = null;
  } else {
    frame.lights = null;
  }
  // Studio rig override: replaces the session lamps with the inspection ring.
  if (_studioRig) {
    const rig = buildStudioRig();
    if (rig) { frame.lights = rig; frame.lampBake = null; }   // the rig is not in the bake
  }
  // ── Nearest-floodlight SPOT shadow pass ─────────────────────────────────
  // Nearest-floodlight spot shadow map (night): js/render/shared/shadow-pass.js.
  if (!XrBoot.comfort()) shadowPass.lampPass(frame, _frameNo, _hasLivePlayerShadow);
  // GLOWING FOG driver: on whenever lamps are lit, swelling with haze so a
  // fog-weather night is the money shot while a clear night keeps only a hint.
  // Day / lights-off => 0, so daytime fog stays a pure sun tint. Faded by SUN
  // BRIGHTNESS (not elevation - the night key stays above the horizon for sky
  // glow): at dawn/dusk the sun in-scatter already lights the mist, and lamp
  // glow on top blew the dawn mist band out.
  const _lfSun = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
  const _lfGate = clamp((0.55 - _lfSun) / 0.30, 0, 1);
  // The GROUND MIST knob scales here too — the shader-side mist band already
  // rides uGroundMist * LT.mistDensity, so the lamp-fog swell must follow the
  // same tuned amount (reading the raw value left lamps glowing "in mist" with
  // the mist slider at 0, and refusing to swell with it turned up).
  frame.lampFog = frame.lights ? Math.min(0.9, LT.lampFogBase + LT.lampFogHaze * (frame.groundMist || 0) * LT.mistDensity) * _lfGate : 0;
  // Shader-side tunables ride along on the frame (glx begin() uploads them).
  frame.tune = LT;

  const night = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night);
  // Pre-race grid: rear lights strobe on the countdown clock. countT, NOT raceT
  // — update() returns before `raceT += dt` while state is "count", so every
  // raceT-keyed flash in this file is frozen at 0 until lights-out.
  const preGrid = state === "count";
  const gridFlash = preGrid && CarMesh.gridStrobe(countT);
  // Prop emissive (lit windows / signage / neon) — the ramp lives in
  // Atmosphere.floodEmit, which applyRaceSettings also resolves at once.
  // (Hoisted above the env probe so both world passes share it.)
  const _floodEmit = _atmo.floodEmit(frame.sunDir ? frame.sunDir[1] : null);
  _lastFloodEmit = _floodEmit;   // exposed via __apex.lightState()
  frameSky.lightning = _ltFlash || 0;
  // ── Live env probe: one 64px cubemap face / 4th race frame (full cube / 24);
  // clearcoat samples real surroundings SSR can't see. carEnvCube=0 skips; dbgCam
  // skips (OOM). Stage-1 renderScale<0.98 → every 8th frame (_envMask). park() →
  // 1 face/frame. After face 5: HOLD until move/sun/wet/tod/lights (audit 2026-10-05 #2).
  // Stage-1 scale drop OR any evidence-based shed → every 8th frame (was scale-only).
  const _envMask = (!frozen && (
    (gfx.getRenderScale && gfx.getRenderScale() < 0.98) ||
    (PerfGov.autoShed && PerfGov.autoShed() > 0)
  )) ? 7 : 3;
  if (player && (state === "race" || state === "count") && !_envProbeOff && PerfGov.tier() < 1 && !paused && !dbgCam && (frozen || (_frameNo & _envMask) === 0) && gfx.envFaceBegin && LT.carEnvCube > 0.001 && !hideMeshes.cars) {
    Tracks.sample(track, player.s, smp2);
    const _pex = smp2.p[0] + smp2.r[0] * player.x, _pey = smp2.p[1] + 0.9, _pez = smp2.p[2] + smp2.r[2] * player.x;
    const _es = frame.sunDir || [0, 1, 0], _ew = frame.wetness || 0, _elg = frame.allLightsGen || 0;
    if (_envHold) {
      const dx = _pex - _envLatch[0], dy = _pey - _envLatch[1], dz = _pez - _envLatch[2];
      if (dx * dx + dy * dy + dz * dz > ENV_HOLD_MOVE_M * ENV_HOLD_MOVE_M
        || Math.abs(_es[0] - _envLatch[3]) > 1e-4 || Math.abs(_es[1] - _envLatch[4]) > 1e-4 || Math.abs(_es[2] - _envLatch[5]) > 1e-4
        || Math.abs(_ew - _envLatch[6]) > 1e-3 || raceTimeOfDay !== _envLatchTod || _elg !== _envLatch[7])
        { _envHold = false; _envFace = -1; }
    }
    if (!_envHold) {
      _envFace = (_envFace + 1) % 6;
      const _envInv = gfx.envFaceBegin(_envFace, [_pex, _pey, _pez], frame);
      if (_envInv) {
        frameSky.invViewProj = _envInv;
        // THE `finally` IS LOAD-BEARING: envFaceBegin raises `_envActive`; envFaceEnd
        // is its ONLY lowering — a throw here froze the tab into a 64px cube (2026-09-22).
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
    gfx.envProbeReset(); _envHold = false; _envFace = -1;   // tier 1 sheds PRODUCER; envReady latches
  }
  // REAR-VIEW MIRROR: its own camera and target, BEFORE the main begin() like the probe above.
  mirrorPass.render(frame, frameSky, night, wet, _floodEmit);
  let _b;
  if (_fogMul != null) {
    // Restored immediately: frame.fogDensity is the SESSION's value, which
    // applyRaceSettings owns and every other reader expects unscaled.
    const bf = frame.fogDensity;
    frame.fogDensity = bf * _fogMul;
    _b = gfx.begin(frame);
    frame.fogDensity = bf;
  } else _b = gfx.begin(frame);
  if (_b === false) return;
  // _mInvVP still holds this frame's inverse (computed once, right after _mVP,
  // for the god-rays); only frameSky's POINTER needs restoring — the env-probe
  // pass above may have swapped it to the probe face's inverse.
  frameSky.invViewProj = _mInvVP;
  // Late sky: draw AFTER the opaque world so early-Z rejects the SKY_FS
  // fragments the world overwrites (SKY_VS at depth 1.0, depth writes off
  // under LEQUAL — result-invariant for the opaque half). Glow is additive
  // with depthMask off, so it must follow the sky: opaque → sky → glow.
  // (`wet` is already declared above in the sky/lightning block)
  // Per-surface materials drive the GGX specular term.
  // Wet weather: rain films lower effective roughness dramatically — road becomes
  // mirror-like, cars and barriers pick up sharper reflections.
  // (Floor → gate draws live in drawWorldMeshes, shared with the env probe.
  //  Corona strength note: the lens-glare halos are drawn from frame.lights
  //  COLOURS (already time-of-day scaled); the LENS GLARE tuner slider is
  //  LT.glareStr, default 0.12.)
  drawWorldMeshes(frame, night, wet, _floodEmit, false);
  gfx.drawSky(frameSky);
  // The pit bay signs: one decal after the sky (opaque → sky → decal; it depth-tests, never writes).
  // …and the entrance lamps go GREEN over their steady red once you are called
  // in and still on your way to the box (PitLane's own cue, so the lamps and
  // the radio never disagree).
  if (typeof PitSigns !== "undefined") {
    const cue = pits && pits.lastCue ? pits.lastCue() : null;
    PitSigns.draw(gfx, track, MAT_IDENT, frame.eye, night, hideMeshes.pitSigns,
                  !!cue && PIT_LAMP_GREEN.indexOf(cue.phase) >= 0);
  }
  // skid marks — one batched draw for the whole live trail (rebuilt only when a
  // mark is added/evicted). Was up to 120 per-mark draws every frame once the
  // ring buffer filled. Falls back to per-mark draws if the batch path is
  // unavailable (older GPU where the batch program failed to link).
  // Menu-gated for the same reason as the car loop below: skids.reset() runs
  // only from startRace, so the previous race's rubber was still being laid
  // under the title-screen flyby.
  if (state !== "menu") skids.draw(gfx, camEye);
  // The DRIVING LINE ribbon rides the same state as the skids (on the road, no
  // depth write). Drawn against the PLAYER's speed for the dynamic colour.
  // Never in a flyby frame (`cine`: the editor preview, flybyCam, free-cam's flyby lens).
  if (state !== "menu" && !cine && track && player) DrivingLine.draw(gfx, drivingLineApi(track), Math.abs(player.speed));
  // cars — skip AI cars more than 550 m of track arc from the player (past fog)
  // Cockpit view doesn't draw the car you're sitting in: a first-person RIG
  // (wheel/halo/mirrors) + the car's shadow instead, body mesh skipped. Was two
  // always-equal booleans, so the `hide && !rig` skip they guarded never fired.
  const cockpitRigOnly = !dbgCam && (state === "race" || state === "count") && (CAM_MODES[camMode].id === "cockpit" || CAM_MODES[camMode].id === "helmet");
  // VISOR is the cockpit WITHOUT ITS STEERING WHEEL (a phone in the hand is the
  // wheel): the same rig — tub, halo, mirrors, front wheels — around an eye
  // closer to the front and lower (js/camera/vantage.js VISOR_EYE_*); the player
  // body is skipped exactly as in cockpit.
  const visorEye = !dbgCam && (state === "race" || state === "count") && CAM_MODES[camMode].id === "visor";
  // Camera forward (horizontal) for the behind-camera AI cull below.
  let _camFwdX = camTgt[0] - camEye[0], _camFwdZ = camTgt[2] - camEye[2];
  { const l = Math.hypot(_camFwdX, _camFwdZ) || 1; _camFwdX /= l; _camFwdZ /= l; }
  const _carCullPlanes = (gfx.makeFrustumPlanes && frame.viewProj)
    ? gfx.makeFrustumPlanes(frame.viewProj, _pbPlanes) : null;
  // Glossy automotive paint is identical for every car this frame (depends only
  // on wet/night), and carPaintMat returns a shared scratch — so compute it ONCE
  // instead of 22× per frame. Wet adds a water film (sharper highlights).
  const paint = carPaintMat(wet
    ? (night ? PAINT_WET_NIGHT : PAINT_WET_DAY)
    : (night ? PAINT_DRY_NIGHT : PAINT_DRY_DAY));
  carFx.haze.pick(cars, player, onboard, track ? track.total : 0, dt); shadowPass.beginFrame();   // per-frame: the haze anchor is re-marked in the loop below (the menu flyby breaks before any car: nothing stale warps), car shadows flush in one batch after the loop
  carDraw.beginDecals();   // accumulate car decals, flush in one batch after the loop
  // Particle emit ball: 110 m at full quality; shrinks with PerfGov.autoShed so
  // a struggling device stops spawning sub-pixel puffs that only starve the pool.
  // Squared once per frame — same divisor spray/rain already use for density.
  const _fxCullR = 110 / (1 + ((typeof PerfGov !== "undefined" && PerfGov.autoShed) ? (PerfGov.autoShed() | 0) : 0));
  const _fxCullR2 = _fxCullR * _fxCullR;
  for (const c of cars) {
    // The title-screen flyby draws the WORLD, not the last race's grid.
    // quitToMenu() resets state to "menu" but never clears `cars`/`player` —
    // both are rebuilt only by makeCars() at the next race start — and the
    // only guard below is a 550 m cull against `player`, which every car
    // parked on the grid beside it passes. So after one race the menu was
    // paying the whole per-car path (body + wheels + rings + decal + flaps +
    // blob shadow, x22) for cars nobody can see. The tell that this was an
    // oversight rather than a choice: the car/lamp SHADOW producers a few
    // hundred lines up all gate on `state !== "menu"` already, and a FIRST
    // boot renders the same screen with cars === [] — the asymmetry.
    // The setup/garage preview is not affected: renderSetupPreview() returns
    // out of render() well before this loop.
    // …EXCEPT for the pre-race flyby, whose closing shot is the grid itself.
    // menuGridCars() seats the field deliberately for that shot, so here the
    // field is the SUBJECT rather than the leftovers the guard above describes.
    // Still nothing after quitToMenu: that leaves the loading screen inactive,
    // which is the same break as before.
    if (state === "menu" && !loadingScreen.active()) break;
    if (!c.isPlayer && player) {
      const ds = Math.abs(c.s - player.s);
      if (Math.min(ds, track.total - ds) > 550) continue;
    }
    // Player: reuse frame-cached (s,x). Field: playerAnchor (world px). Cull first.
    let cS, cX;
    if (c.isPlayer && _plOk) { cS = _plCS; cX = _plCX; }
    else { const pa = playerAnchor(c); cS = pa.cS; cX = pa.cX; }
    c.xVis = cX;   // dump/net field only — pose comes from interpolated px/pz
    const renderX = cX;
    const rp = renderPosOf(c);
    let bankC;
    if (c.isPlayer && _plBodyOk) {
      // Shadow already sampled/banked the player — restore (env probe may clobber smp2).
      const S = _smpPlayer, p = smp2.p, t = smp2.t, r = smp2.r;
      p[0] = S.p[0]; p[1] = S.p[1]; p[2] = S.p[2]; t[0] = S.t[0]; t[1] = S.t[1]; t[2] = S.t[2];
      r[0] = S.r[0]; r[1] = S.r[1]; r[2] = S.r[2]; smp2.hw = S.hw; bankC = _bankPlayer;
      tmpP[0] = rp.world ? rp.x : p[0] + r[0] * renderX;
      tmpP[1] = p[1] + bankC.dy;
      tmpP[2] = rp.world ? rp.z : p[2] + r[2] * renderX;
    } else {
      Tracks.sample(track, cS, smp2);
      // sample() lerps unit node vectors, so mid-segment |t|,|r| dip to cos(θ/2)
      // (up to ~4.7% on Spa's tightest) — used un-normalized they SCALE the drawn
      // car at the 4 m node rate (~21 Hz at speed): a visible width/length pulse
      // against a road mesh built at exact nodes (see worldFromTrack's comment on
      // this exact hazard). Normalize in place: smp2 is a scratch every consumer
      // re-samples before reading, so nothing downstream sees raw values.
      { const t = smp2.t, r = smp2.r;
        let l = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
        l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l; }
      // XZ before banking — hoist behind-camera / near-eye cull past sample+bank.
      tmpP[0] = rp.world ? rp.x : smp2.p[0] + smp2.r[0] * renderX;
      tmpP[2] = rp.world ? rp.z : smp2.p[2] + smp2.r[2] * renderX;
      tmpP[1] = smp2.p[1];
      // Behind-camera cull: AI cars strictly behind the view are never visible
      // (no mirrors). Near-eye: only an eye INSIDE the body box (GameCams.eyeInsideCar,
      // grown by the near plane) — a 3.4 m radius hid a rival ALONGSIDE in the onboard
      // views as the player drew level. Local player is never culled. Y without bank is
      // fine for the near-eye test.
      // Side frustum: AFTER the shadow enqueue with apex26.fieldLod=0 (an off-FOV
      // rival casting onto the visible road); FieldLod moves it after the test.
      if (!c.isPlayer) {
        const dx = tmpP[0] - camEye[0], dz = tmpP[2] - camEye[2];
        if (dx * _camFwdX + dz * _camFwdZ < -6) continue;   // 6 m grace behind the eye
        const dy = tmpP[1] - camEye[1];
        if (GameCams.eyeInsideCar(-(dx * smp2.t[0] + dz * smp2.t[2]), -(dx * smp2.r[0] + dz * smp2.r[2]), -dy, _nearM + 0.3)) continue;
      }
      bankC = Tracks.banking(track, cS, renderX, _bankScratch);
      tmpP[1] = smp2.p[1] + (bankC ? bankC.dy : 0);   // road SURFACE height: legit
    }
    // yaw the forward/right around up by yawVis (interpolated, like position)
    const yv = yawVisInterp(c);
    const cy = Math.cos(yv), sy = Math.sin(yv);
    for (let i = 0; i < 3; i++) {
      tmpF[i] = smp2.t[i] * cy + smp2.r[i] * sy;
      tmpR[i] = smp2.r[i] * cy - smp2.t[i] * sy;
    }
    tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
    tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
    tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
    // Grounded assembly basis: follows track slope, yaw, and road banking, but
    // excludes chassis-only brake dive/throttle squat and cornering lean. Those
    // animations must not lift a wheel centre away from its contact patch.
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
    // C2 visual suspension: advance the cosmetic chassis springs from existing
    // physics state + the road-surface height (tmpP[1]) and read back the small
    // clamped pitch/roll/heave offsets. Render-only — applied to the BODY basis
    // (tmpMat) below; _groundMat (wheels/contact/shadow) is already built and is
    // never touched. When disabled these all come back 0 (rigid chassis).
    // ygV = speed × road slope (smp2.t normalized above): the ground's vertical velocity
    // under the car, analytic (never a height difference). _vF = |v|/vTop(): kerb strikes.
    const _vF = Math.min(1, Math.abs(c.speed || 0) / vTop());
    const _ba = bodyAttitude.update(c, tmpP[1], dt, (c.speed || 0) * smp2.t[1], aeroDfMult(c) * _vF * _vF, _vF);
    const _baPitch = _ba.pitch, _baRoll = _ba.roll, _baHeave = _ba.heave;
    // Pitch: rotate forward+up around the right axis, POSITIVE = NOSE DOWN — the c.baPitch
    // sign (braking > 0; vantage.js reads it so). It rotated nose-UP until 2026-10-02, so
    // brake-dive lifted the nose; now the nose dips on the brakes and lifts on power.
    if (_baPitch) {
      const cp = Math.cos(_baPitch), sp = Math.sin(_baPitch);
      for (let i = 0; i < 3; i++) {
        const f = tmpF[i], u = tmpU[i];
        tmpF[i] = f * cp - u * sp;
        tmpU[i] = u * cp + f * sp;
      }
    }
    // Cornering lean (render-only) comes from the C2 visual-suspension roll
    // spring (_baRoll, computed above from lateral g). Combine it with the road
    // bank, which is geometry (the car must sit ON the banked surface) and stays
    // even when the cosmetic springs are disabled.
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
    // C2 visual suspension heave: bob the BODY up/down in world-Y only (kerb/crest
    // absorption). tmpMat carries the body mesh; _groundMat (wheels/contact/shadow)
    // was built from the un-offset tmpP, so the tyres stay planted on the road.
    if (_baHeave) tmpMat[13] += _baHeave;
    // On the jacks (PitLane.stopAnim): the body rises with the wheels, which
    // drawPlayerWheels lifts by the same number off _groundMat.
    if (c.pitState === "box") { const a = pits.stopAnim(c); if (a.lift) tmpMat[13] += a.lift; }
    if (!FieldLod.on) shadowPass.pushCaster(_groundMat, c.team, c);   // blob now; sun / lamp caster next frame
    const _lodD2 = FieldLod.d2(tmpP, camEye, c.isPlayer), _lod = FieldLod.tier(_lodD2, fovY, c);   // rival LOD by projected size: camera distance x lens, with hysteresis (js/car/field-lod.js)
    // Side frustum: 8 m sphere, same planes as propBatches. Player never culled.
    if (!c.isPlayer && _carCullPlanes) {
      const x = tmpP[0], y = tmpP[1], z = tmpP[2], r = 8;
      let _out = false;
      for (let i = 0; i < 6; i++) {
        const p = _carCullPlanes[i];
        if (p[0] * x + p[1] * y + p[2] * z + p[3] < -r) { _out = true; break; }
      }
      if (_out) continue;
    }
    if (FieldLod.on) shadowPass.pushCaster(_groundMat, c.team, c, FieldLod.castsShadow(_lodD2));   // visible cars only; rivals cast into the maps within 50 m
    // Cockpit view: the interior is a VIEWMODEL — anchored to the CAMERA, not to
    // the car's rendered position. Orientation is the same yawVis as the body
    // (heading vs road tangent) so the nose rotates when the car does. Pitch,
    // roll and lean stay off this basis — those shoved the eye into the carbon.
    // The ORIGIN is still camEye minus the cockpit eye offsets along the
    // YAWed axes, so the eye sits at (COCKPIT_EYE_FWD, COCKPIT_EYE_UP) in
    // rig space every frame. A road-locked basis made turn-chasing glance
    // the view while the halo and wheel sat still on the tangent.
    // WORLD STATE BEFORE THE COCKPIT `continue` — the skid stamp, the heat-haze
    // anchor and the particle emitters below. After the body draw, in cockpit view
    // (CAM_MODES[3], the shipped default) the player laid no mark and emitted no
    // smoke/sparks/kickup/spray. Camera-independent: none of these is a draw.
    if (c.isPlayer && state === "race") {
      const skid = c.skidIntensity || 0;
      skids.stamp(tmpMat, (skid > 0.25 || c.offroad) && c.speed > 10, dt);
    }
    carFx.haze.mark(c, tmpMat);   // EXHAUST HEAT HAZE: the anchor's wake (the player, or from an onboard eye the car ahead on power — js/fx/car-fx.js)
    // ── Transient particle FX emitters (visual-only: they READ car state and
    // write none of it, so headless physics is untouched). They live HERE
    // because the car's world basis (tmpMat / tmpP / tmpF / tmpR) is already
    // computed. Emission is rate-gated with Math.random() < rate·dt so it is
    // framerate-independent; far cars are skipped (sub-pixel puffs would only
    // starve the shared pool).
    if (state !== "menu") {
      const fdx = tmpP[0] - camEye[0], fdz = tmpP[2] - camEye[2];
      if (fdx * fdx + fdz * fdz < _fxCullR2) {
        // Collision sparks — flag set by collideFx during the physics step
        // (it has no world coords there); consumed once, at the car.
        if (c.fxSparkI) {
          Particles.sparks(tmpMat[12], tmpMat[13] + 0.18, tmpMat[14],
            -tmpF[0], -tmpF[2], 4 + c.fxSparkI * 10, 6 + Math.round(c.fxSparkI * 14));
          c.fxSparkI = 0;
        }
        // Player wall-scrape sparks: read-only proximity check against the
        // same solid-barrier boundary physics clamps to (Tracks.wallAt).
        if (c.isPlayer && c.speed > 14 && Math.random() < dt * 22) {
          const side = c.x > Tracks.wallAt(track, c.s, 1) - 0.12 ? 1
                     : c.x < -Tracks.wallAt(track, c.s, -1) + 0.12 ? -1 : 0;
          if (side) {
            Particles.sparks(tmpMat[12] + tmpR[0] * side * 0.95, tmpMat[13] + 0.12,
              tmpMat[14] + tmpR[2] * side * 0.95, -tmpF[0], -tmpF[2], 4 + c.speed * 0.22, 5);
          }
        }
        // Tyre smoke (player): cornering scrub via skidIntensity, real lateral
        // slip (vLat — drifts and trail-braking slides, since the friction
        // ellipse converts overdriven braking into lateral slip), and launch
        // wheelspin (hard accel at crawling speed; peak engine ax is ~7 m/s² on
        // the STANDARD scale, so the 4.5 floor only fires on genuine
        // full-throttle getaways). aStd, not a bare c.axEstSm: PACE multiplies
        // the accel curve, so at pace 0.5 the peak is 3.5 m/s² and a raw 4.5
        // floor is unreachable — the effect simply did not exist at the bottom
        // of the OVERALL SPEED slider (A16).
        let smokeI = (c.isPlayer && !c.offroad) ? (c.skidIntensity || 0) : 0;
        // A lock-up smokes from the LOCKED axle — the fronts — and for every
        // car: an AI's braking mistake (AiDrive.mistakePhase) is read as a
        // puff of white from its front wheel, which is how a lock-up is seen.
        const locked = !c.offroad && vStd(c.speed) > 8 && (c.wheelLock || 0) > 0.3;   // vStd: PACE scales speeds (vstd-invariant)
        if (locked) smokeI = Math.max(smokeI, c.wheelLock);
        if (c.isPlayer && !c.offroad) {
          const _pax = c.axEstSm || 0, _pvl = Math.abs(c.vLat || 0);
          if (c.speed > 10) smokeI = Math.max(smokeI, clamp((_pvl - 3) / 5, 0, 1));
          if (c.speed > 0.5 && c.speed < 12)
            smokeI = Math.max(smokeI, clamp((aStd(_pax) - 4.5) / 2.5, 0, 1) * clamp((12 - c.speed) / 9, 0, 1));
        }
        if (smokeI > 0.25) {
          const wd = carDraw.WHEELS[(locked ? 0 : 2) + ((Math.random() * 2) | 0)];   // one wheel per event: a front when locked, else a rear
          Particles.tyreSmoke(
            tmpMat[12] + tmpMat[0] * wd.x + tmpMat[8] * wd.z,
            tmpMat[13] + tmpMat[1] * wd.x + tmpMat[9] * wd.z + 0.10,
            tmpMat[14] + tmpMat[2] * wd.x + tmpMat[10] * wd.z,
            -tmpF[0] * (1.5 + c.speed * 0.12), -tmpF[2] * (1.5 + c.speed * 0.12),
            Math.min(smokeI, 1),
            dt * (16 + 44 * Math.min(smokeI, 1)));            // fractional rate·dt count
        }
        // Gravel/grass kickup: any off-track car at speed throws surface bits.
        if (c.offroad && c.speed > 10) {
          const wd = carDraw.WHEELS[2 + ((Math.random() * 2) | 0)];
          const dirt = Math.random() < 0.5;   // mix dusty-earth and grass tints
          Particles.kickup(
            tmpMat[12] + tmpMat[0] * wd.x + tmpMat[8] * wd.z,
            tmpMat[13] + tmpMat[1] * wd.x + tmpMat[9] * wd.z,
            tmpMat[14] + tmpMat[2] * wd.x + tmpMat[10] * wd.z,
            -tmpF[0] * c.speed * 0.35, -tmpF[2] * c.speed * 0.35,
            dirt ? 0.46 : 0.30, dirt ? 0.40 : 0.36, dirt ? 0.26 : 0.15,
            dt * 30);
        }
        // Rain spray: every car at speed on a wet road drags a lingering plume
        // (Particles.spray: ~1.5 s clouds, so 9-30/s here holds what 0.7 s puffs
        // at 14-48/s did) — lighter on "wet" (drying line) than under "rain".
        // vStd on BOTH halves: 15 and the /45 span describe a fraction of the
        // car's envelope (spray starts at ~21 % of top speed and is full at
        // ~83 %), so fed a raw ground speed they moved with the OVERALL SPEED
        // slider — at pace 0.5 the strength could never exceed (36-15)/45 = 0.47
        // and full spray was unreachable, at pace 1.3 it was pinned at 1 down
        // every straight. The particle VELOCITY stays real m/s (A16).
        if (wet && vStd(c.speed) > 15) {
          const str = clamp((vStd(c.speed) - 15) / 45, 0, 1) * (raceWeather === "rain" ? 1 : 0.6);
          const sxo = Math.random() < 0.5 ? -0.6 : 0.6;   // behind either rear tyre (str > 0: vStd > 15)
          Particles.spray(
            tmpMat[12] + tmpMat[0] * sxo - tmpF[0] * 2.1,
            tmpMat[13] + 0.28,
            tmpMat[14] + tmpMat[2] * sxo - tmpF[2] * 2.1,
            -tmpF[0] * c.speed * 0.28, -tmpF[2] * c.speed * 0.28, str,
            dt * (9 + 21 * str));
        }
        carFx.emit(c, _groundMat, dt, state);   // plank sparks + an AI lock-up's marks (js/fx/car-fx.js)
      }
    }
    if (c.isPlayer && (cockpitRigOnly || visorEye)) {
      // The rig stays on the car: its origin is the eye minus THIS mode's eye offsets.
      GameCams.cockpitViewmodelAxes(smp2.r, smp2.t, yv, camEye, tmpR, _cockU, tmpF, _cockP,
        GameCams.seatFwd(visorEye ? "visor" : "cockpit"), GameCams.seatUp(visorEye ? "visor" : "cockpit"));
      basisMat(tmpR, _cockU, tmpF, _cockP, _cockMat);
      drawCockpitRig(c, _cockMat, dt, paint, visorEye);   // VISOR: no steering wheel
      // THE STOP'S CREW still: cockpit/visor continue before the exterior path,
      // so without this the player's own stop drew no crew at all. Kit stands
      // on the grounded basis (not the camera-anchored viewmodel). The
      // viewmodel fronts already take stopAnim's axle slide inside drawCockpitRig.
      if (c.pitState === "box") {
        _wheelOpts.emissive = night ? 0.12 : 0;
        drawPitCrew(c, _groundMat, _wheelOpts);
      }
      continue;
    }
    // Body-only mesh + planted wheels for every procedural car. Attitude
    // (tmpMat) is chassis-only; wheels stay on _groundMat. A glb is one piece.
    const body = carDraw.modelBuf ? null : (c.isPlayer ? playerBodyMesh(c.team, c) : teamBodyMesh(c.team, c));
    if (body) {
      gfx.draw(body, tmpMat, paint);
      if (_lod < 2) queueCarDecals(c.team, tmpMat, carDecalNum(c.team, c), false, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);   // FieldLod: no decal past 120 m
      _wheelOpts.emissive = night ? 0.12 : 0;
      drawPlayerWheels(c, _groundMat, dt, _wheelOpts);
      if (c.pitState === "box") drawPitCrew(c, _groundMat, _wheelOpts);   // crew + kit, on the ground beside it
    } else {
      const wholeCarMat = c.isPlayer ? _groundMat : tmpMat;
      gfx.draw(teamMesh(c.team, c), wholeCarMat, paint);
      queueCarDecals(c.team, wholeCarMat, carDecalNum(c.team, c), false, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
      // A loaded glb is one piece (no separate wheels), but the crew still
      // stands in the box — and without this a glb stop was an empty bay.
      if (c.pitState === "box") drawPitCrew(c, _groundMat, _wheelOpts);
    }
    // ACTIVE AERO: the moveable upper wing elements, FRONT and REAR, swung
    // between their Z-mode and X-mode angles by this car's live `aeroX`. The
    // 2026 car moves both wings together, so both move here — the front is the
    // one a chase camera actually sees working, the rear is the one a car behind
    // sees. Drawn for EVERY car, not just the player: a rival's wings opening
    // down the straight is the single most readable "he is going for it" cue the
    // sport has, and they are the only parts of the car that move, so faking it
    // on the HUD alone would be a lie about what the physics is doing.
    // Skipped in cockpit view (that branch `continue`s well above this) and for
    // a loaded GLB body, whose wings are somebody else's geometry.
    // MOVING only for RIVALS within FieldLod.flapsM() (80 m; 150 m with
    // apex26.fieldLod=0) — the cue is the car AHEAD opening its wings. Past it
    // the whole set is ONE static mesh at the nearer rest pose, never dropped:
    // dropping it stripped every far rival's rear wing to its main plane. The
    // player is never gated — it is the car you are looking at.
    if (!carDraw.modelBuf) {
      const fdx = tmpP[0] - camEye[0], fdy = tmpP[1] - camEye[1], fdz = tmpP[2] - camEye[2];
      const aSt = teamDecalState(c.team, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
      drawAeroFlaps(c.team, aSt.val, c.aeroX || 0, tmpMat, paint, aSt.aero, null,
        !c.isPlayer && fdx * fdx + fdy * fdy + fdz * fdz >= FieldLod.flapsM() ** 2);
    }
    // Rear lights (CarMesh.drawRearLights: the centre RIS light plus the 2026
    // mirrored light on each rear wing endplate). FIA strobe in the wet (~4 Hz,
    // 55% duty) and STEADY at night — a car's rear faces receive none of the
    // downward-aimed floodlight beams, so a car directly ahead at night was a
    // pitch-black void filling the windscreen; the steady red gives every rear
    // an anchor light. Brightness still tracks live ERS charge; only the
    // BRIGHTNESS does, never the on/off — see the strobe note below.
    // ON THE GRID they strobe whatever the weather: a stationary 2026 car on
    // full charge shows the "MGU-K recharging" fast flash, which is the blinking
    // in every real pre-race grid shot.
    const _ledStrobe = ((raceT * 4.4) % 1) < 0.55;
    // Once racing, the ONLY thing that flashes is the wet rain light. The
    // MGU-K pattern is a STATIONARY-car signal — the note above says so — so
    // strobing it whenever the driver deploys ERS ran it through most of a
    // racing lap, and the pre-race blinking never appeared to stop. Night dry is
    // now steady whenever it draws, which is what the comment already claimed.
    // The 2026 ERS code (CarMesh.ersLightCode) takes the light over whenever
    // it applies — a short repeating flash at full deploy, a rapid one when a
    // full battery clips the harvest — and hands back to the weather / night
    // gate the moment it does not. Not on the grid: that is the recharging
    // strobe above, and the two must not fight over one lamp.
    const ersCode = preGrid ? -1 : CarMesh.ersLightCode(c, raceT);
    if (preGrid ? gridFlash
                : ersCode >= 0 ? ersCode === 1
                : ((wet && _ledStrobe) || (!wet && night))) {
      // Rivals: 40 m like the brake rings; 150 m WET (in spray the rain light IS the car
      // ahead); 200 m on the 22 x 8 m grid or the field ahead sits dark. Player always.
      const ldx = tmpP[0] - camEye[0], ldy = tmpP[1] - camEye[1], ldz = tmpP[2] - camEye[2], lGate = preGrid ? 200 : wet ? 150 : 40;
      if (c.isPlayer || ldx * ldx + ldy * ldy + ldz * ldz < lGate * lGate) {
        // Wet, grid and ERS-code lights stay full-bright — a status light must
        // not dim with battery. Otherwise 0.45 (flat) -> 1.0 (full).
        drawRearLights(tmpMat, (wet || preGrid || ersCode === 1) ? 1.0 : (0.45 + 0.55 * clamp(c.energy || 0, 0, 1)));
      }
    }
    // TAIL-LIGHT EMIT 0: the road spill is a painted decal standing in for the
    // tail light's glow on the road. Steady (the emitted light never strobed with
    // the rain light or the ERS codes) and faded out over the last 40% of TAIL-
    // LIGHT RANGE, not cut at the 40 m lens gate above.
    if (frame.glowLights && frame.glowLights !== frame.lights) {
      const tgR = LT.tailRange != null ? LT.tailRange : 160;
      const tgd = Math.hypot(tmpP[0] - camEye[0], tmpP[2] - camEye[2]);
      const tgF = c.isPlayer ? 1 : clamp((tgR - tgd) / (tgR * 0.4), 0, 1);
      if (tgF > 0) CarMesh.drawTailGlow(_groundMat, tgF * LT.tailLightMul * (1 + clamp(c.brakeHeat || 0, 0, 1) * LT.brakeGlowMul * 1.6), track, c.s);
    }
    // 2026 amber mirror lamps: under 20 km/h or stopped — the pit lane, the grid,
    // a spin. Same 40 m rival gate as the rear lights; the player always draws.
    // Anchors come cached per team from Car3D, so this allocates nothing.
    // vStd: "crawling" is relative to the car's envelope, so the lamp threshold
    // scales with the PACE slider like every other speed threshold here.
    if (!carDraw.modelBuf && vStd(c.speed) < 5.56) {
      const mdx = tmpP[0] - camEye[0], mdy = tmpP[1] - camEye[1], mdz = tmpP[2] - camEye[2];
      if (c.isPlayer || mdx * mdx + mdy * mdy + mdz * mdz < 40 * 40) {
        const mSt = teamDecalState(c.team, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
        const cm = mSt.parts && mSt.parts._visual && mSt.parts._visual.cockpit;
        drawMirrorLights(tmpMat, Car3D.mirrorLightAnchors(c.team.id, cm && cm.mirror));
      }
    }
    // The player's ERS strip and every car's throttle-lift after-fire (rivals
    // within 60 m, FieldLod): js/car/car-draw.js drawExhaustFx.
    carDraw.drawExhaustFx(c, tmpMat, c.isPlayer && isErsDeploying(c), FieldLod.flame(_lodD2));
  }
  // Flush all accumulated car decals in one decal-program block — not
  // interleaved with the lit body draws (~2 program+state flips per car).
  carDraw.flushDecals(night);
  // Flush all accumulated car shadows in one pass — shadowProg+shadowVAO+blend+
  // depthMask are set once for the whole field instead of ping-ponging with the
  // lit body program every car.
  shadowPass.flushBlobs();
  // Ghost car (time trial): replay best-lap position as a bright emissive silhouette
  if (isTimeTrial() && player && (state === "race" || state === "count")) {
    const replayGhost = GhostShare.hasGuest() ? GhostShare : Ghost;
    const g = replayGhost.at(player.lapTime);
    // Skip the ghost while it overlaps the player — at the lap start it sits on
    // your exact grid position, and in the cockpit/onboard cams its bodywork
    // fills the camera as a black box until you pull away ("starts dark, clears
    // after throttle"). Once there's real separation it draws normally.
    let gDs = Infinity;
    if (g) { const d = Math.abs(g.s - player.s); gDs = Math.min(d, track.total - d); }
    if (g && gDs > 3.0) {
      Tracks.sample(track, g.s, smp2);
      // Normalize the lerped basis — same node-rate scale-pulse fix as the cars.
      { const t = smp2.t, r = smp2.r;
        let l = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
        l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l; }
      tmpP[0] = smp2.p[0] + smp2.r[0] * g.x;
      tmpP[1] = smp2.p[1];
      tmpP[2] = smp2.p[2] + smp2.r[2] * g.x;
      // Near-eye cull, same as AI cars: a ghost trailing a few metres behind
      // the player sits right AT the chase eye — its geometry crosses the near
      // plane and fills the frame with clipped fragments.
      const gdx = tmpP[0] - camEye[0], gdy = tmpP[1] - camEye[1], gdz = tmpP[2] - camEye[2];
      if (gdx * gdx + gdy * gdy + gdz * gdz < 3.4 * 3.4) { /* skip */ } else {
      for (let i = 0; i < 3; i++) { tmpF[i] = smp2.t[i]; tmpR[i] = smp2.r[i]; }
      tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
      tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
      tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
      basisMat(tmpR, tmpU, tmpF, tmpP, tmpMat);
      // TRANSLUCENT, like every racing game's ghost. Opaque, it was a solid
      // car-sized wall: the ghost replays your best lap's position at the same
      // elapsed time, so it slides through/past you whenever your braking or
      // acceleration differs from the recorded lap — and side-on at 3-6 m its
      // carbon floor/tyres/wing filled most of the cockpit view as a black
      // slab ("black on screen when accelerating or braking" in TT). At 35%
      // alpha the track stays readable straight through it at any distance,
      // and the raised emissive keeps it reading as a bright spectre.
      gfx.draw(teamMesh(player.team, player), tmpMat, _ghostOpts);
      }
    }
  }

  // Rapier debris shards (render-only side-world; poses stepped in update()).
  const _glowF = FrameLights.glowFade();   // held-tier fade, not a tier-3 cut (frame-lights.js)
  if (frame.lights && !_studioRig && _glowF > 0) gfx.drawGlow(frame.glowLights || frame.lights, LT.glareStr * _glowF);   // AFTER the cars: depth-tested, no depth write — before them a halo in front of a body was overwritten
  if (DebrisWorld.active()) DebrisWorld.draw();

  // Transient FX particles (tyre smoke / sparks / kickup / spray): advanced
  // with the RENDER dt and drawn into the HDR scene before present, so smoke
  // and spray tone-map with the world and the HDR spark tints feed bloom.
  // Render-path only — headless physics never touches the pool.
  // Falling rain: the streak field around the camera, drawn inside the alpha
  // particle batch (depth-tested, fogged by nothing, in the frame — never an
  // overlay). Full storm streaks when raining, the sparse DRIZZLE tier when
  // merely WET (rainSeed picked which). Open-cockpit cars have no windscreen,
  // so onboard views get the same field as the chase cam — no water-on-glass
  // beading and no wiper (there is nothing to wipe).
  if (isWetRoad() && Particles.rainActive()) Particles.rainUpdate(dt, camEye, isRaining());
  startLights.update();   // the gantry's lit lamps: one-frame flares each count frame
  marshalPanels.update(dt);   // the posts' light panels: yellow / red / green from race control
  Particles.update(dt);
  Particles.draw();

  // Per-time cinematic grade + bloom. DRAMATIC = high contrast, deep shadows,
  // bloom ONLY on genuinely bright sources (floodlights, sun disc, neon) against
  // a darker frame — not a low-threshold wash that milks the whole image. Strong
  // teal-orange split-tone gives cinematic colour separation without brightening.
  let _grade, _bloom = 0.55, _thresh = 0.78;
  if (raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night)) {
    _grade = _gradeNight;
    // Moderate bloom, HIGH threshold: only the genuinely bright HDR sources
    // (lamps, neon, lit windows >1.0) bloom into halos — the dark scene between
    // them stays dark. Dialled back from the previous heavy bloom. Neon-heavy
    // city circuits (street/modern) get LESS bloom + a higher threshold so the
    // dense neon doesn't over-glow; open circuits keep more bloom for the lamps.
    const _neonCity = track.def.theme === "street_night" || track.def.theme === "modern";
    _bloom = _neonCity ? 0.48 : 0.55;
    _thresh = 0.97;
  } else if (raceTimeOfDay === "dusk") {
    _grade = _gradeDusk;
    // Higher threshold so the low sun + lifted exposure + stronger god-rays don't
    // bloom the whole hazy horizon into a wash — only the sun/glints glow.
    _bloom = 0.52; _thresh = 0.82;
  } else if (raceTimeOfDay === "dawn") {
    _grade = _gradeDawn;
    _bloom = 0.52; _thresh = 0.82;
  } else {
    // Bright day: a punchier teal-shadow / warm-highlight split with real bloom
    // on highlights so chrome, kerbs, glass and bright sky sparkle instead of
    // reading flat. (Old str 0.15 / bloom 0.50 was the washed-out look.)
    _grade = _gradeDay;
    _bloom = 0.60; _thresh = 0.82;
  }
  // (Lamp volumetric beam/halo cones removed — they read as hazy light shafts;
  // the lamps now carry the scene through brighter point-light pools instead,
  // and dropping the per-lamp glow draw saves frame time on dense night grids.)
  // Volumetric sun shafts: dramatic at dawn/dusk (low sun), moderate by day,
  // off at night (sun below horizon). Low-sun factor drives the big boost.
  const _grSunY = frame.sunDir ? frame.sunDir[1] : -1;
  const _grLow = clamp(1 - _grSunY * 1.4, 0, 1);     // ~1 at dawn/dusk, ~0.2 at noon
  // Stronger base so the low-sun god-ray shafts at dawn/dusk are a signature
  // dramatic cue (was 0.28); still tapers to a moderate amount by noon.
  // Atmospheric haze gate for volumetric in-scatter (ground mist dominates;
  // wet + cloud add). Sun shafts catch more in haze; lamp beams only show in it.
  // GROUND MIST knob applied here as well as at the uGroundMist upload, so the
  // god-ray / lamp-beam haze response tracks the mist the player actually sees.
  // WET / CLOUD HAZE SHARE knobs (def 0.22 / 0.12) set how much wet-road spray
  // and cloud cover feed the volumetric haze the god-rays / lamp-beams scatter
  // through, alongside the ground-mist term (GROUND MIST knob scales that).
  const _hazeWet   = LT.hazeWetShare   != null ? LT.hazeWetShare   : 0.22;
  const _hazeCloud = LT.hazeCloudShare != null ? LT.hazeCloudShare : 0.12;
  const _mist = clamp((frame.groundMist || 0) * LT.mistDensity * 0.9 + (frame.wetness || 0) * _hazeWet
                      + (frame.cloud || 0) * _hazeCloud, 0, 1);
  // Gate by the sun's actual BRIGHTNESS too: at night the key is dim moonlight
  // held above the horizon for sky glow, and ungated it marched faint stripey
  // "moon rays" through the cloud gaps.
  const _sunLumGR = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
  const _sunGateGR = clamp((_sunLumGR - 0.35) / 0.45, 0, 1);
  // GOD-RAY LOW-SUN DRAMA knob (def 0.55) scales only the low-sun boost added on
  // top of the flat GOD-RAY BASE (def 0.38); SUN GOD-RAYS (LT.grMul) scales the whole thing.
  const _grLowBoost = LT.godrayLowBoost != null ? LT.godrayLowBoost : 0.55;
  const _grBase     = LT.godrayBase != null ? LT.godrayBase : 0.38;
  // FADE the horizon cutoff, don't step it: a `_grSunY > 0.02 ? … : 0` step
  // switches the pass off from 2.26x its own midday strength, so one 0.1-deg
  // notch of SUN ELEVATION deletes full shafts in a frame. Still 0 below.
  let _gr = (_grBase + _grLowBoost * _grLow) * clamp(_grSunY / 0.02, 0, 1) * (1 + 0.25 * _mist) * _sunGateGR * LT.grMul;
  // NOTE: a sun-off-screen gate (project sunDir through the view-proj, zero _gr
  // when the sun is behind the camera or outside a 1.7-NDC margin) was reverted.
  // It saved the volumetric march when facing away from the sun, but it also
  // cut the world-space light shafts that legitimately streak ACROSS the scene
  // from a sun off to the side — so god-rays "only showed when the sun was in
  // frame". The march now runs by orientation-independent strength again.
  // Night lamp volumetrics: visible light beams in the air from the lamps when
  // floodlights are on (frame.lights) and there's haze to catch them. Scales with
  // haze — subtle on a near-dry night, dramatic in fog/rain. Additive + mist-gated
  // in the shader, so it never greys out the dark night.
  // Always a subtle beam glow whenever lamps are on (clear night air still
  // scatters a little), swelling with haze/rain into full volumetric shafts —
  // and coloured per lamp, so neon-spill lights throw coloured beams.
  // Gated to dark sessions (key below ~0.45): visible lamp beams in daylight (the
  // DAYTIME LAMPS knob also sets frame.lights) would read as odd haze shafts.
  // Mobile tier sheds the beams entirely: any non-zero value keeps the whole
  // god-ray block alive every night frame (volumetric march with a per-step
  // lamp loop + 4 blur passes + a nearest-lamp re-sort) — a top GPU cost on
  // the phones that overheat/jetsam at night. Shedding it up-front beats
  // waiting for the perf governor to watch the device struggle to tier 4.
  // Same hard gate as the exhaust haze (gfx.mobileTier, at present).
  const _lampVol = (frame.lights && _sunLumGR < 0.45 && !gfx.mobileTier)
    ? clamp(LT.lampVolBase + LT.lampVolHaze * _mist, 0, LT.lampVolCap) : 0;
  // Resolve the HDR scene (bloom + tonemap + grade + vignette) to the screen.
  // SSAO grounds the scene (creases/contacts) at every time of day.
  // Contact shadows only when the KEY is bright enough to cast them (day/dusk/dawn).
  // Gate on key brightness, not sunDir.y — the night moon-key sits high (y≈0.97)
  // so an elevation test runs contact shadows all night for a black-ambient
  // scene where they're invisible (wasted work). Matches _sunGateGR above.
  const _cs = _sunLumGR > 0.35 ? clamp(0.5 * LT.contactStr, 0, 1.5) : 0;
  // Wet-road screen-space reflection of the scene: runs at ALL times of day so a
  // wet road mirrors the world — buildings/barriers/cars by day, neon + glowing
  // lamp heads at night — on top of the in-shader sky env reflection. Driven purely
  // by wetness (road-mask + Fresnel + distance-fade in the shader guard it).
  // Wet: full mirror. Dry night: a subtle sheen — clean racing tarmac still
  // reflects the lamps/neon a little at grazing angles.
  // Wet: full mirror. Dry night: lamp/neon sheen. Dry DAY: a faint floor so
  // clean tarmac still mirrors towers and sky (real asphalt is never fully
  // matte at grazing angles).
  // Dry-night floor lowered 0.16 -> 0.08: at 0.16 the mirror substitution ran at
  // ~80% of full wet strength, so a DRY night road flanked by lit towers (Baku /
  // Vegas start straight) rendered as a bright silver mirror of the buildings —
  // the single biggest "night is too bright" driver on city circuits. 0.08 keeps
  // a subtle lamp/neon sheen (fade is quadratic below 0.20) without the mirror.
  // Now the DRY NIGHT SHEEN tuner slider (LT.ssrDryNight, default 0.08).
  const _ssr = ((frame.wetness || 0) > 0.01) ? frame.wetness * LT.ssrWetMul
             : (frame.lights ? LT.ssrDryNight : LT.ssrDryDay);
  // Perf: skip the SSAO pass (+ its two blur passes) at NIGHT. Night ambient is
  // near-black, so the AO darkening is invisible anyway — and night street grids
  // are where the frame budget is tightest. Gate on key BRIGHTNESS, not sunDir.y:
  // the night moon-key is held high (y≈0.97), so an elevation test keeps SSAO
  // (and its two blurs) running every night frame for no visible gain. Matches the
  // contact-shadow + god-ray brightness gates.
  const _ao = _sunLumGR > 0.35 ? 0.95 * LT.aoStr : 0;
  if (_grade) {
    // Read from the constant base, write to the reused output — the base str never
    // compounds frame-to-frame.
    _gradeOut.str = (_grade.str || 0) * LT.gradeStr;   // GRADE STRENGTH tuner slider
    // SHADOW / HIGHLIGHT TINT HUE knobs: rotate the split-tone colours (hueRotateTint
    // allocates only when a hue is set; otherwise share the base array, read-only).
    _gradeOut.shadow = LT.shadowHue ? hueRotateTint(_grade.shadow, LT.shadowHue) : _grade.shadow;
    _gradeOut.hi     = LT.hiHue     ? hueRotateTint(_grade.hi, LT.hiHue)         : _grade.hi;
    _grade = _gradeOut;
  }
  // SPEED BLUR: fold the car's velocity into the tuner amount so the radial
  // smear only appears at speed (zero when parked; ramps in above ~40% of vTop()).
  const _spd = LT.speedBlur > 0 ? LT.speedBlur * clamp((((player && player.speed) || 0) / vTop() - 0.4) / 0.5, 0, 1) : 0;
  const po = _presentOpts;
  // Bloom joins the last MEASURED shed (autoTier, not GRAPHICS: LOW): bloomAmt
  // 0 skips the ~9-pass bright+mip chain — the biggest post-chain saving left
  // after env/SSR/shadows. Look post stays live for the lighting tuner.
  po.exposure = frame.exposure * LT.exposureMul; po.bloom = PerfGov.autoTier() >= 4 ? 0 : _bloom * LT.bloomMul;
  po.threshold = clamp(_thresh + LT.threshOff, 0.4, 1.2) * frame.exposure; po.grade = _grade;   // exposed units (BRIGHT_FS): x the TOD exposure keeps the shipped bloom; EXPOSURE now moves it
  // Feature-shedding tiers (see perfGovernor): resolution scaling can't rescue
  // passes whose cost doesn't shrink with the render target, so a device still
  // slow at the scale floor sheds those instead. Tier 2 (user+auto) drops SSR;
  // autoTier 4 drops SSAO (+2 blurs) and god-ray — not GRAPHICS: LOW alone.
  po.ssao = PerfGov.autoTier() >= 4 ? 0 : _ao;
  po.godray = PerfGov.autoTier() >= 4 ? 0 : _gr;
  // lampVol sheds at tier 4 with its god-ray siblings: haveGR is `sunGR || lampVol > 0`, so leaving it set keeps the whole march alive past po.godray = 0.
  // contact is the SSAO half of the same trap: haveAO is `aoStr > 0 || contactStr > 0`,
  // so a tier-4 DAYTIME frame (_cs is non-zero whenever the key is bright) would
  // still run the SSAO pass and both of its blurs after po.ssao went to 0. Shedding contact shadows is what
  // tier 4 is FOR — it has already dropped bloom, god-rays and SSR by then.
  po.contact = PerfGov.autoTier() >= 4 ? 0 : _cs; po.reflect = PerfGov.tier() >= 2 ? 0 : _ssr; po.carReflect = PerfGov.tier() >= 2 ? 0 : undefined; po.lampVol = PerfGov.autoTier() >= 4 ? 0 : _lampVol; po.mist = _mist;
  // Camera-aware wet-road SSR extent. The shader confines SSR to a screen band
  // (top cutoff + a near-field view-Z fade) tuned for the chase eye: high and
  // ~6 m back, so the whole wet road sits inside the band and the near dead-zone
  // hides behind the car. A low ONBOARD eye (cockpit/hood/tcam) sits on the car
  // and looks along the road, so that near dead-zone IS the driver's main view
  // and the road climbs above the top cutoff — half the wet surface got no
  // reflection, and the onboard speed-buzz kept nudging that band edge, reading
  // as reflective patches flickering on and off. Raise the top cutoff and pull
  // the near fade in for those cams so the reflective region covers the visible
  // road with no live edge in frame; external cams keep the shipped values.
  const _ssrLow = onboard;
  po.ssrTopUV = _ssrLow ? 0.82 : 0.62;
  po.ssrNear  = _ssrLow ? -1.0 : -2.5;
  po.flareMul = LT.flareMul; po.speedBlur = _spd; po.tune = LT;
  // Avoidable post passes at lower GRAPHICS tiers / mid autoShed (perf frame r2):
  //   bloomLevels — drop the widest bloom octaves (2 FS passes each) on MEDIUM/LOW
  //   grLite — one godray blur pair even with sun shafts (MEDIUM+); ULTRA/HIGH keep two
  {
    const _ut = PerfGov.userTier(), _as = PerfGov.autoShed();
    po.bloomLevels = (_as >= 3 || _ut >= 4) ? 2 : ((_as >= 1 || _ut >= 2) ? 3 : 0);
    po.grLite = _ut >= 2 || _as >= 1;
  }
  // EXHAUST HEAT HAZE: the marked anchor through this frame's view-proj -> {u, v, str} for the composite warp (COMPOSITE_FS uHaze*). Off on memory-limited phones.
  po.haze = gfx.mobileTier ? null : carFx.haze.at(_mVP);
  armBackendProbe();
  if (!XrBoot.present(gfx, _xrEyes, po)) gfx.present(po);
  if (homeTrack && !(gfx.warming && gfx.warming())) uiExperience.didRenderTrack();
  RaceEntryProfile.afterPresent(loadingScreen, gfx, mirrorPass.preparing());
  // Boot canary disarmed once the backend has presented a RUN of world frames,
  // not one. Until then the probe stays armed in storage and a load that dies
  // reverts on the next boot, which is the whole point of it.
  if (!_backendProved && ++_provedFrames >= PROVE_FRAMES) {
    _backendProved = true;
    if (_probeArmed) { _probeArmed = false; try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* nothing was armed if storage is blocked */ } }
    rendererBoot.proved();   // clears an older crash strike — only when the PICK ran, not its GLX fallback
  }
}

// ---------- HUD ----------
// HUD + minimap live in js/ui/hud.js (GameHud.create(G) below).

// ---------- main loop ----------
let physAcc = 0;                 // leftover sim time carried between frames
// When the local car's pose IS, on the frame clock: the end of the last physics
// step. netPlay.tick runs BEFORE this frame's steps, so the pose it publishes is
// last frame's — stamping it `now` made every rival draw us 16–33 ms (a metre or
// more at speed) behind where we were. null = no race stepping: stamp `now`.
let _poseAt = null;
let renderAlpha = 1;             // leftover-step fraction (0..1) for render interpolation
// Adaptive-resolution governor + feature-shedding tiers + mobile crash
// sentinel live in js/perf/governor.js (PerfGov, initialised at boot with gfx).
// render() gates features on PerfGov.tier(); tickBody feeds PerfGov.tick(ms).
PerfGov.init(gfx);
const PHYS_DT = PhysicsConsts.FIXED_DT;   // fixed physics step — js/physics/consts.js
function tick(now) {
  try {
    tickBody(now); LoopHealth.clean();
    XrBoot.afterTick(tick);   // no-op while immersive-vr owns session.rAF; deduped on EXIT
  }
  catch (e) {
    // BOUNDED tolerance, policy in js/perf/loop-health.js: a transient fault
    // costs one frame and any clean frame pays the run back, because startRace
    // is async and update() can tick on a null player in the window before
    // makeCars runs — a condition that heals on the next frame. At the cap this
    // falls through to the fatal path, so a DETERMINISTIC fault still stops
    // instead of repainting the error overlay 60x/s.
    if (LoopHealth.fault(e)) { XrBoot.afterTick(tick); return; }
    // Report the REAL error once (cross-origin window.onerror shows only a bare
    // "Script error.").
    if (!tick._reported && typeof window.__apexReportError === "function") {
      tick._reported = true; window.__apexReportError("tick", e);
    }
    // Arm here too: a fatal render() may throw before its own present() call
    // ever reaches armBackendProbe().
    if (_backendBound && !_backendProved) armBackendProbe();
    throw e;
  }
}
function tickBody(now) {
  let dt = Math.max(0, Math.min((now - lastFrame) / 1000, 1 / 4));   // clamp big gaps (tab resume) and a non-monotonic rAF stamp
  const _dtMs = now - lastFrame;
  lastFrame = now;
  // Adaptive resolution: only govern while actively rendering a race.
  if (!paused && !mirrorPass.preparing() && !(gfx.warming && gfx.warming()) && (state === "race" || state === "count")) PerfGov.tick(_dtMs);
  Input.poll(); BrakeCue.tick(); if (typeof DrivingCues !== "undefined") DrivingCues.tick();
  onboard.tick(dt);   // coach marks; the TV director ticks after the physics step (below)
  // Multiplayer runs BEFORE the paused gate, and the gate below lets it through,
  // because a shared world cannot be stopped by one player opening a menu: the
  // rival keeps driving whatever this screen is doing. Inert solo.
  netPlay.tick(now, _poseAt); if (gfx.warming && gfx.warming()) { Input.clearEdges(); return; }
  // Preparation renders but charges neither the countdown nor physics/governor.
  if (mirrorPass.preparing()) {
    Input.clearEdges(); render(0);
    lastFrame = Math.max(now, performance.now());
    return;
  }
  if (paused && !netPlay.active()) {
    director.tick(0);   // holds its shot; a camera picked in the pause menu still releases it
    // Nothing downstream reads the pad's edge latches while we are parked here,
    // so drop them rather than let a pause-menu button-mash queue up and fire
    // in one burst on the first frame after RESUME (see Input.clearEdges).
    Input.clearEdges();
    // LIGHTING / CAMERA / FLYBY tuner live preview: keep RENDERING (physics
    // stays paused) while any of the three panels is open so every slider
    // change shows on the held frame — a camera angle is unjudgeable on a
    // frozen picture. The flyby editor is the sharpest case: its whole job is
    // to place shots in the world, and without this gate it parked dbgCam on a
    // frame nothing was redrawing, so the screen kept showing the race the
    // player paused out of.
    // Solo photo-camera integration; online sessions update it before rendering
    // below while the shared simulation keeps running. The free camera
    // (the lighting tuner's, or the FREE CAMERA panel's) is only reachable from
    // the pause menu, and its placements publish one zero-dt frame. Resuming tears
    // it down (setPaused -> exitPhotoMode -> FreeCam.onPhotoExit), so no unpaused
    // state in which it should still be flying.
    // SETTINGS open (SAVE SCREENSHOT / GFX toggles) also needs a live present — headed GLX has no preserved buffer.
    if (setupPreviewOn || replayBuf.isScrubbing() || ((state === "race" || state === "count") &&
        (!els.lighting.hidden || !els.camtune.hidden || !els.flyby.hidden || photoMode || !els.pmsettings.hidden))) {
      // NO governor here: paused preview frames are vsync-cheap, so the governor
      // only ever stepped the scale UP toward full res — each step a complete
      // render-target reallocation. The scale simply stays where the race left it
      // (and photo mode pins its own — see enterPhotoMode).
      if (photoMode) updatePhotoCam(Math.min(dt, 1 / 20)); replayBuf.tickScrub(Math.min(dt, 1 / 20)); // fly-cam + scrub
      render(Math.min(dt, 1 / 20));
    }
    GameAudio.feedReplayScrub(soundOn && player, replayBuf.isScrubbing(), cars, naturalGear, rpmFor, rivalAudio, isWetRoad, vTop); return;   // instant-replay engine/rivals while scrubbing; silence on scrub exit
  }
  replayBuf.onTick(raceT, cars, state); // 30 Hz solo ring — never under netplay / scrub
  if (announceT > 0) {
    announceT -= dt;
    if (_annFloor > 0) _annFloor -= dt;
    if (announceT <= 0) {
      els.announce.hidden = true;
      els.announce.className = "";
      delete els.announce.dataset.kind;
      _annPri = 0; _annFloor = 0;
      // showAnnounce re-arms both, so the card taken off the queue gets the
      // same floor the one before it did.
      while (_annQueue.length) {
        const q = _annQueue.shift();
        if (q.still && !q.still()) continue;   // the caller says it is no longer true
        if (q.pri <= ANN_PRI.info && performance.now() - q.t > ANN_STALE_MS) continue;   // no still(): too old to trust
        showAnnounce(q.msg, q.dur, q.kind); break;
      }
    }
  }
  // hit-stop: slow the simulation to a crawl for a few frames after a hard
  // crash so the impact reads, but keep the camera (render) at full dt so the
  // shake still plays out.
  let simTime = dt;
  if (hitStop > 0) { hitStop = Math.max(0, hitStop - dt); simTime = dt * 0.15; }
  // The steering ramps are part of the control loop, so they run on the SIM's
  // clock, not the wall's — otherwise hit-stop lets the wheel travel ~6.7x
  // further per simulated second and the car leaves a crash already turned. The
  // tilt SENSOR filter is deliberately left on the wall clock (see input.js).
  Input.setTimeScale(dt > 0 ? simTime / dt : 1);
  // Fixed-step physics: advance the sim in constant 1/60 s chunks regardless of
  // the display framerate, so handling is identical on a 30 fps phone, a 120 fps
  // desktop, and a janky frame — a long frame can never enlarge the integration
  // step (which would change the slip/grip behaviour). Leftover time carries to
  // the next frame; cap the substeps so a stall can't trigger a spiral of death.
  // Only where update() advances anyone — elsewhere it returns immediately.
  if (!frozen && (state === "race" || state === "count")) {
    physAcc += simTime;
    let steps = 0;
    while (physAcc >= PHYS_DT && steps < 5) {
      // snapshot each car's pre-step arc/lateral position so render can interpolate
      // between the last two physics steps (snapshotting every step leaves rPrev*
      // holding the state just before the final step taken this frame).
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i]; c.rPrevS = c.s; c.rPrevX = c.x;
        c.rPrevPx = c.px; c.rPrevPz = c.pz;   // every car interpolates world px/pz
        c.rPrevYawVis = c.yawVis;             // orientation interpolates like position
        c.rPrevHead = c.head;                 // world heading interpolates like position too
      }
      _audioParamStep = physAcc - PHYS_DT < PHYS_DT || steps === 4;   // this frame's last step
      update(PHYS_DT); physAcc -= PHYS_DT; steps++;
    }
    _audioParamStep = true;   // any other update() caller (the __apex step hooks) sets them
    PerfGov.recordSimulation(steps, steps === 5 && physAcc >= PHYS_DT ? physAcc - physAcc % PHYS_DT : 0);   // only what the line below drops; the sub-step remainder carries
    if (steps === 5 && physAcc >= PHYS_DT) physAcc %= PHYS_DT;   // fell badly behind — drop the backlog, keep the sub-step remainder (a clean 5-step frame lost up to a step: Fix Your Timestep)
    _poseAt = now - physAcc * 1000;   // the stepped pose lags this frame by the unspent remainder
  } else _poseAt = null;
  renderAlpha = clamp(physAcc / PHYS_DT, 0, 1);   // 0..1 leftover fraction for render interp
  director.tick(dt);   // TV director (dbgCam only): after the step, on the pose render draws (camPoseOf)
  if (photoMode && paused && netPlay.active()) updatePhotoCam(Math.min(dt, 1 / 20));
  if (state === "results") resultsCam.tick(Math.min(dt, 1 / 20));
  render(Math.min(dt, 1 / 20));               // camera/visual damping at (clamped) frame dt
  if (state === "race" || state === "count") updateHud(false, _dtMs);
}

// ---------- car setup panel ----------
// The CAR SETUP panel UI (stat bars, tabs, options, livery creator) lives in
// js/garage/setup-sheet.js (SetupUI.create(G) — wired after the G façade).

// ---------- UI wiring ----------
// Select-screen UI (team/track grids, preview, circuit detail modal) lives in
// js/ui/select-screen.js (Menus.create(G) — wired after the G façade).

function tickUi() { if (soundOn) GameAudio.uiTick(); }

// STEERING INPUT row (js/ui/setting-row.js) and the one-line note under it.
// The note is ALWAYS present — its text changes, it is never hidden — so a
// mode change cannot reflow the page under a finger; same rule that keeps
// RECALIBRATE and GEARS disabled rather than hidden.
function paintSteer() {
  SettingRow.paint($("pm-steer"), steerMode);
  const note = $("pm-steer-note");
  if (!note) return;
  // Only warn when the gyro is genuinely unavailable/denied — not in the brief
  // window before the first sensor reading arrives (which would falsely say
  // "no gyro" on phones that have a working gyro).
  note.textContent = Input.gyroDenied
    ? "Motion access is denied on this device, so TILT cannot steer here — pick BUTTONS or TOUCH."
    : "TILT leans the phone. BUTTONS adds on-screen arrows. TOUCH drags a finger on the track.";
}

function enableTilt() {
  // Must run inside a user gesture for the iOS permission prompt.
  Input.requestGyro().then((ok) => {
    if (ok) {
      Input.calibrate();
      // GRANTED IS NOT READING. A device with no motion sensor (a touch laptop, a
      // gyro-less tablet) fires deviceorientation with null angles, or never
      // (https://w3c.github.io/deviceorientation/): tilt stayed selected with the
      // steer at 0 and nothing said why. No reading in 1.5 s -> buttons, said.
      setTimeout(() => {
        if (steerMode !== "tilt" || Input.gyroSeen || headlessMode) return;
        setSteerMode("buttons"); paintSteer();
        tiltSay("no motion sensor — switched to buttons");
      }, 1500);
    } else if (Input.gyroHardDenied && !headlessMode) {   // a RESOLVED refusal, never a transient rejection (no user gesture)
      // Permission denied — fall back to buttons so the player can still steer.
      // (Staying in tilt mode with no sensor data leaves steer locked at 0 and
      // the car just follows ROAD_FOLLOW, appearing to "auto-drive" the racing line.)
      // headlessMode: specs assert pause-menu TILT chrome (#pm-calib enabled)
      // without a motion sensor — same gate as the 1.5 s no-reading fallback.
      setSteerMode("buttons");
    }
    paintSteer();
    if (ok && Input.tiltActive()) els.audiostate.textContent = "tilt steering ready";   // the title line only: not worth a card every race
    else tiltSay(Input.gyroDenied ? "motion access denied — switched to buttons" : "");
  });
}
// #audiostate is a TITLE-screen line, invisible from RACE!/lobby/pause — a steering
// fallback the player did not choose must also reach the banner.
function tiltSay(msg) { els.audiostate.textContent = msg; if (msg) announce(msg.toUpperCase(), 3, "info"); }

// Install at the original UI-wiring point; callbacks read live preferences through G.
const platformSession = PlatformSession.create(G, {
  canvas, raceWakeLock, disarmProbeOnLeave: () => _disarmProbeOnLeave(),
  cancelMirrorPrep: () => mirrorPass.cancelPreparation(),
  setPaused, ensureNet, settingsBack: () => settingsNav.back(), closeSettings, showTouchControls, refreshGearsBtn,
});
platformSession.wireFirstGesture();

// UI SIZE / HUD SIZE + RESOLUTION live in js/ui/scale.js (UiScale.create(G)
// — wired after Menus). Bug-explaining comments moved with the block.

// RENDERER cycle lives in js/perf/quality-preset.js with GRAPHICS — wired at
// DOMContentLoaded so SETTINGS shows it during (and after) a deferred backend load.

// GRAPHICS presets + RENDERER cycle live in js/perf/quality-preset.js — it owns
// #pm-gfx and #pm-renderer for EVERY device, and wires the preset's tier floor
// into PerfGov.
// It self-inits at DOMContentLoaded, so there is nothing to call from here.


const { openTimeTrial, consumeGhostHash, openCareer, openCareerSlots, refreshCareerButton } = TitleFlow.create(G, {
  vt, restoreFreePlaySelection, careerUi, ensureNet,
  refreshTitle: () => { seasonUi.refreshTitle(); titleMenu.refresh(); },
  selectCareer: () => {
  const c = Career.data() || Career.load();
  if (c) {
    season = c.season;               // the SAME object — see endRace()
    trackIdx = Career.trackIndex();
    // Point the shared car UI at the contract without overwriting GP preferences.
    const ti = Teams.LIST.findIndex((t) => t.id === c.team);
    if (ti >= 0) teamIdx = ti;
    driverIdx = c.seat; clampDriverIdx();   // a hand-edited or imported save can carry any seat
    recomputePlayerMods();
  }
  },
});
$("mb-standings").onclick = () => { buildStandings(); $("standings").hidden = false; if (soundOn) GameAudio.uiSelect(); };
$("standings-close").onclick = () => { $("standings").hidden = true; };
$("mb-data").onclick = () => {
  // The click sound fires immediately — the bundle is one network round trip
  // on a cold tap and the button must not feel dead while it lands.
  if (soundOn) GameAudio.uiSelect();
  ensureDataHub().then((ok) => { if (ok) DataHub.open(); });
};
CustomTracks.create(G, { load: loadBackendScripts, door: $("mb-designer") });   // TRACK DESIGNER door (LAZY_EDITOR) + the saved-circuit registry
$("mb-help").onclick = () => { els.howtoplay.hidden = false; if (soundOn) GameAudio.uiSelect(); };
// USE AS CONTROLLER (this phone): a plain navigation to the wheel page beside
// index.html — no net stack, no room; the code is typed there (or arrives by
// QR as controller.html#pad=CODE). Same door from Settings › CONTROLS.
const goPhonePad = () => { if (soundOn) GameAudio.uiSelect(); location.assign(new URL("controller.html", location.href).href); };
$("mb-phonepad").onclick = goPhonePad;
$("pm-phonepad-go").onclick = goPhonePad;
// Same sheet from the pause stack — the controls reference is most wanted
// mid-session. #howtoplay outranks #pausemenu in z-index, so CLOSE returns
// to the pause menu with nothing else to restore.
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
// RACE IN PORTRAIT — opt in, once. The blocker stays the default: it is the
// rotation-locked recovery path. docs/PERF-FINDINGS.md 5a.
$("rotate-race").onclick = () => {
  document.body.classList.add("rotate-ok");
  try { localStorage.setItem("apex26.portraitOk", "1"); } catch (_) { /* private: this session only */ }
  syncRotateBlocker(true);
};
try {
  if (localStorage.getItem("apex26.portraitOk") === "1") document.body.classList.add("rotate-ok");
} catch (_) { /* no storage: it asks again */ }
// Team picker: opened by the garage's TEAM & DRIVER tab (js/garage/setup-sheet.js).
// Closing without choosing leaves the current team as-is. Nothing to rebuild —
// the garage is still underneath, unchanged.
$("tp-close").onclick = () => { $("teampicker").hidden = true; };
// BACK + the tappable circuit preview. Both lookups existed in `els` but no
// handler was ever attached on this branch — the select screen's BACK button
// was simply dead (surfaced by the button-walk audit; the wiring lived on an
// unmerged branch).
els.selBack.onclick = () => {
  if (daily.isActive()) daily.stop();
  vt(() => {
    els.select.hidden = true;
    if (raceSettings.netRoom) $("vsfriend").hidden = false; else { els.overlay.hidden = false; consumeGhostHash(); }   // a #ghost= link deferred while the picker was up lands now (bug-hunt 2 H13)
  });
  if (soundOn) GameAudio.uiSelect();
};
// The button wrapper carries the semantics now (focusable, labelled); the
// chip is the same door on tiny sheets where the canvas is display:none.
$("sel-map-btn").onclick = openTrackDetail;
$("sel-detail-chip").onclick = openTrackDetail;
$("track-detail-close").onclick = closeTrackDetail;
// ── SETTINGS sub-menu ── separates preferences from pause actions;
// every tuning + toggle control lives on this page. Opening it hides the pause
// menu (one panel at a time); BACK (or resume) returns to it.
// Some settings only mean anything with a race on screen: HIDE HUD toggles a
// HUD that does not exist yet (and the state would carry into the next race,
// which starts with no HUD and no clue why), and all three visual tuners
// preview a scene that is not being rendered. Disabled rather than hidden —
// the same rule the mode-dependent driving controls follow, so the grid never
// reflows under a thumb mid-tap.
const settingsNav = SettingsNav.create(store, () => { if (soundOn) GameAudio.uiSelect(); });
photoStudio = PhotoStudio.create(G, { freeCam: photomode.freeCam, renderFrame: () => render(0), garage: {
  snapshot: () => setupCam.captureCamera(), restore: (v) => setupCam.restoreCamera(v), shot: (id) => setupCam.setSetupView(id), } });
function openExperiencePhoto(source) { return UiExperience.openPhoto(G, { source, photoStudio, setPaused,
  trackHome: state === "menu" && uiExperience && ["track", "pitlane"].includes(uiExperience.state().scene.mode), trackReady: menuWorld(),
  photoView: () => uiExperience.photoView(), onWaiting: () => AppearanceStudio.notify("Return Home to finish loading this scene, then open Photo Studio."),
  photoSubject: (m) => uiExperience.photoSubject(m), reopen: () => openExperiencePhoto("home"), onDone: () => uiExperience.photoSubject(null) }); }
uiExperience = UiExperience.create(G, { setupCam, coach, openPhoto: openExperiencePhoto, openPractice: () => openTimeTrial(false),
  prepareTrack: scheduleFlybyTrack, trackReady: menuWorld, trackKey: () => menuKey(trackIdx), updateTrackPhoto: updatePhotoCam,
  captureTrackCamera: () => ({ eye: camEye.slice(), tgt: camTgt.slice(), fov: camFov }),
  restoreTrackCamera: (v) => { if (v) { camEye.splice(0, 3, ...v.eye); camTgt.splice(0, 3, ...v.tgt); camFov = v.fov; } },
  openWatch: () => ensureDataHub().then((ok) => { if (ok) DataHub.open("race"); }),
  openSettingsPage: (page, fold) => { openSettings(); settingsNav.show(page, true); const f = fold && $(fold); if (f) { if (f.tagName === "DETAILS") f.open = true; else if (f.parentElement.tagName === "DETAILS") f.parentElement.open = true; f.scrollIntoView({ block: "start" }); f.focus(); } },
});
AppearanceStudio.attach({ previewScene: (s) => uiExperience.previewScene(s), openPhoto: () => openExperiencePhoto(state === "menu" ? "home" : "race"), openDisplay: () => settingsNav.show("display", true),
  applyVisuals: (v) => { uiScale.applyUiScale(); uiScale.applyHudScale(); uiScale.applyBtnOpacity(); uiScale.applyPanelOpacity(); G.hudProfile = v.hudProfile; G.hudMetricsLayout = v.hudMetricsLayout; G.hudMapVis = v.hudMapVis; G.hudGapsVis = v.hudGapsVis; if (v.hudMirror) mirrorPass.setMode(v.hudMirror); paintHudDetailsSummary(); syncMetricsOverlayCompact(); },
});
function syncSettingsAvailability() {
  const inRace = state === "race"; try { if (inRace) document.body.dataset.race = "1"; else delete document.body.dataset.race; } catch (_) { /* RendererPicker's reload buttons arm a two-tap confirm while this is set */ }
  SettingRow.disable($("pm-hidehud"), !inRace);
  $("pm-lighting").disabled = !inRace;
  $("pm-camtune").disabled = !inRace;
  $("pm-flyby").disabled = !inRace;
}
function openSettings() {
  // AUTO is always the full set; re-read the LAYOUT note on open so "Here
  // AUTO is FULL" is written after the first HUD tick, not only at boot.
  // LAZY_AUDIO: kick ensureAudio but reveal Settings sync — awaiting the
  // ~449 KB bundle before #pmsettings unhides broke ui-scale (probe ~400ms
  // after mb-settings click). MUSIC & SOUND waits in settings-tabs.js.
  ensureAudio(); paintHudDetailsSummary(); // pm-settings click is not a pointerdown
  syncSettingsAvailability(); settingsNav.showCurrent();
  els.pmsettings.hidden = false; els.pausemenu.hidden = true;
}
let keyBinds = null;   // KeyBinds.create(G), below
function closeSettings() { if (keyBinds) keyBinds.disarmAll(); els.pmsettings.hidden = true; $("pm-settings-index").hidden = true; if (paused) els.pausemenu.hidden = false; syncRotateBlocker(false); }   // index: openSettings()'s showCurrent() re-shows it unconditionally, so hiding it here is free
$("pm-settings").onclick = openSettings;
$("pm-settings-close").onclick = () => { if (settingsNav.back()) closeSettings(); };
// The same settings screen from the TITLE menu, so steering, audio and the
// tuners are reachable without starting a race first. Always opens on the
// door index. closeSettings() already only returns to the pause menu when
// actually paused, so from here it just closes back to the title.
$("mb-settings").onclick = () => { ensureAudio().then(() => { if (soundOn) GameAudio.init(); }); openSettings(); };
// STEERING and MUSIC are SettingsNav pages (js/ui/settings-tabs.js). Lighting
// and camera tuners open as their own docks from DISPLAY > ADVANCED VISUALS.
// ── LIGHTING TUNER ── opened from the settings sub-menu; that menu hides while
// it's open so the live preview is unobstructed (tick() keeps render() running
// with physics paused), and DONE returns to it. Rows are generated
// once from TUNE_DEFS; values persist via localStorage (apex26.lightTune).
// The LIGHTING TUNER panel UI lives in js/lighting/tuner-panel.js
// (TunerPanel.create(G) — wired after the G façade).

// ---------- pre-race screens ----------
// RACE SETTINGS, QUALIFYING, CUSTOM TEAM and the GARAGE wiring. Everything from
// here to the button wiring below is screen flow, not simulation. A section
// banner is the only navigation this file has; one that lies is worse than none.

// RACE SETTINGS — js/race/race-settings.js (RaceSettings.create above).

// ── qualifying ───────────────────────────────────────────────────────────────
// The sheet opens BEFORE the session with the field already simulated, so the
// player can see what they have to beat and choose whether to drive it or take
// the simulated time. `q-done` flips the foot from DRIVE/SIMULATE to TO THE GRID.
// Latched and caught like startRace, but never re-thrown: none of its callers
// await it, so a rejection reached the global error overlay with the settings
// screen already hidden and NO menu under it. The menu is where it lands.
function openQuali(fresh, netDone) {
  const key = entrySettings() + "|" + !!fresh, idx = trackIdx;
  // The scenery may download first: cover it as startRaceCovered does, or the
  // screen sits blank between RACE settings and the sheet.
  if (!loadingScreen.phase()) loadingScreen.building(loadingInfo());
  // Peer times clear in prepare (a NEW request only): a rival's one-shot QUALI
  // that lands during the scenery load must survive to the sheet.
  return sessionEntry.begin("quali", key, () => { qualiNet.clearPeers(); return ensureScenery(idx); },
    () => openQualiBody(fresh, netDone), () => key === entrySettings() + "|" + !!fresh,
    (e) => { if (e) Log.error("game", "openQuali failed", e); qualiSheet.close(); quitToMenu(); })
    .catch((e) => Log.debug("game", "openQuali rejected (handled by onFail): " + (e && e.message || e))); // menu callers fire and forget; recovery above already landed the failure
}
function openQualiBody(fresh, netDone) {
  session = "quali";
  // Reached from race settings this is already "menu"; reached from the results
  // screen it would still say "results". No race is running while the sheet is
  // up, so both paths say the same thing.
  setState("menu", "quali-sheet");
  quali.clear();
  qualiNet.arm(netDone);   // armed from the ARG: a caller's write lands before this line
  loadTrack(trackIdx);
  makeCars();
  if (fresh) quali.simulate(0); else quali.begin();
  $("quali").classList.remove("q-done");
  loadingScreen.stop();
  qualiSheet.open(quali.rows());
  qualiNet.refreshQualiGate();   // the gate's state is only knowable once netDone is armed
}
function closeQualiToGrid() {
  qualiSheet.close();
  session = "race";
  startRaceFromSheet();           // gridUp() reads quali.order()
}
$("q-drive").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  qualiSheet.close();
  session = "quali";
  startRaceFromSheet();           // one out-lap + one flying lap, alone
};
// FRIEND QUALIFYING WAITS FOR EVERY PLAYER'S TIME (qualiNet.waiting), and a
// SIMULATE or a lap with no valid time sent none: the other sheet read "WAITING
// FOR THEIR LAP…" forever with BACK blocked. The model's time is our time then.
function reportModelQuali() {
  const r = (quali.rows() || []).find((x) => x.driverId === player.driverId);
  if (r && r.t > 0) qualiNet.reportQuali(player.driverId, r.noTime ? Infinity : r.t);   // NO TIME crosses as a marker
}
$("q-sim").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  if (isCareer()) Career.markWeekendStarted();   // the briefs lock: the grid is known now
  // Keep the model's time for us — but a rival who has already driven theirs
  // does not lose it because we could not be bothered to drive ours.
  quali.simulate(qualiNet.driven(player && player.qualiCut ? Infinity : 0));   // a deleted lap is not traded for the model's
  reportModelQuali();
  $("quali").classList.add("q-done");
  qualiSheet.build(quali.rows());
  qualiNet.refreshQualiGate();
  // .q-done hides SIMULATE itself, which held focus; the next step is the grid.
  if (!$("q-go").disabled) $("q-go").focus();
};
$("q-go").onclick = () => {
  // Guarded as well as disabled: the button is the only way out of this sheet,
  // and a stale enabled state would grid up without the rival's lap.
  if (qualiNet.waiting()) { qualiNet.refreshQualiGate(); return; }
  if (soundOn) GameAudio.uiSelect();
  // In a friend race the lobby, not this handler, builds the race: it still
  // holds the connection and has to hand it to NetPlay once the grid exists.
  const go = qualiNet.takeGoCallback();
  if (go) {
    qualiSheet.close();
    go();
    return;
  }
  closeQualiToGrid();
};
// BACK goes ONE step, to the race settings the weekend was staged from — which
// has its own BACK to the hub or the select screen, so the two together are a
// real back-stack rather than a shortcut that skips a screen.
//
// `session` has to come back with it. openQuali() set it to "quali", and leaving
// the sheet without undoing that would leave the flow claiming a qualifying
// session is running while the player sits in a menu.
function qGoShakeEnd(e) { e.currentTarget.classList.remove("budget-reject"); }
$("q-back").onclick = () => {
  // After the session ran (.q-done) this button is CSS-hidden and only TO THE
  // GRID shows — but Escape still routes here via data-esc-close="q-back", and
  // clear() would silently throw the classification away. With a result on
  // the sheet, leaving is TO THE GRID's job — but a SILENT dead key read as
  // broken, so point the player at the door instead of ignoring them.
  if ($("quali").classList.contains("q-done")) {
    if (soundOn) GameAudio.uiTick();
    const go = $("q-go");
    if (go) {
      go.classList.add("budget-reject");
      go.addEventListener("animationend", qGoShakeEnd, { once: true });   // ONE reference: a re-add is a no-op (dom.spec.whatwg.org), never one listener per press
    }
    return;
  }
  if (soundOn) GameAudio.uiSelect();
  qualiSheet.close();
  quali.clear();          // nothing was run; the next visit draws its own sheet
  session = "race";
  // Rebuilt on the way back (laps/weather kept): after NEXT ROUND it still
  // held the previous circuit's lap chips and FULL value.
  qualiNet.hasArmed() ? qualiNet.resetOnBackWithAbort() : (raceSettings.buildRaceSettings(), $("race-settings").hidden = false);
};

// MY TEAM customize dialog — js/career/custom-team.js (CustomTeam.create above).

// The garage preview CAMERA — the #cs-view chips, the #cs-cam-panel disclosure,
// the held orbit/pan controls and orbit-by-drag on the canvas — is
// js/garage/setup-camera.js (SetupCamera.create above).

// The GARAGE is reachable from the title AND from the select screen's car card,
// so DONE has to go back where it came from, not unconditionally to #select.
let garageReturn = "select";
// The one way in. Everything that opens the garage goes through here so the
// return path can never be left stale — including js/career/career-ui.js, via G.openGarage.
function openGarage(from) {
  garagePre.markOpen(from);
  if (from === "menu" && soundOn) ensureAudio().then(() => GameAudio.init());
  else if (soundOn) GameAudio.uiSelect();
  garageReturn = from;
  $("cs-done").textContent = from === "select" ? "RACE SETUP" :
    from === "pit" ? "RETURN TO RACE" : from === "career" ? "RETURN TO CAREER" :
    from === "vsfriend" ? "RETURN TO LOBBY" : "CLOSE GARAGE";
  // Fresh camera every visit: a garage that reopened on the last angle someone
  // dragged to — nose-down, zoomed into a wheel — reads as broken rather than
  // as remembered. The turntable is the front door; the controls are there for
  // anyone who wants off it.
  // ONE reset, shared with #cs-view-reset, so the two doors to "fresh camera"
  // agree on all five fields.
  resetSetupCam();
  setSetupCamPanel(false);   // same reasoning: the front door is the turntable
  // vt at the CALL site: SetupUI.create runs before Menus.create at boot, so
  // the module cannot hold the helper itself. The build runs inside the
  // transition callback — vt's 60 ms drop-safety applies it directly if the
  // page is not compositing.
  // ENTRY FRAME: endHome() runs before setupPreviewOn flips, so render()'s
  // menuBlank path can hide #game for the Home→garage gap. startViewTransition
  // then defers the game loop; the bay stayed black until a panel click pumped
  // another present. Unhide and draw one garage frame inside the same vt
  // callback as openSetup — not a timer mask, the frame entry owes the player.
  const enterGarage = () => {
    openSetup();
    if (canvas) canvas.style.visibility = "";
    if (!_softEl && gfx.softPresent && gfx.softPresent()) _softEl = document.getElementById("game-soft");
    if (_softEl) _softEl.style.visibility = "";
    try { if (gfx.invalidateSoftPresent) gfx.invalidateSoftPresent(); } catch (_) { /* pre-boot */ }
    try { renderSetupPreview(0); } catch (_) { /* mesh/warm may still be settling */ }
  };
  if (from === "pit") { enterGarage(); setupCam.startArrival(); }
  else vt(enterGarage);
}
$("mb-garage").onclick = () => openGarage("menu");
// ── WORK ON CAR, from inside a pit stop ────────────────────────────────────
// The GARAGE is the same screen the menu opens; what differs is the way back
// and the price. `paused` freezes physics and the clock (the loop's own gate)
// WITHOUT the pause card, because the garage is the screen here — two stacked
// menus would each own the Escape key. `setupPreviewOn`, which openSetup sets,
// already makes the renderer draw the car instead of the race, so the frozen
// world costs nothing while you are in there.
let pitWorkSpec = null;
/** What the car IS, as one comparable string: the parts sheet and the set-up.
 *  A visit that changes neither is free — the stop is only charged for work
 *  that happened. */
function carSpecKey() {
  const team = player ? player.team : Teams.LIST[teamIdx];
  try { return JSON.stringify([getTeamParts(team.id), SetupTune.get(team.id)]); } catch (e) { return null; }
}
function openPitWork() {
  if (!pits || !pits.canWork(player)) return;
  pitWorkSpec = carSpecKey();
  paused = true;
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain(); radioVoice.halt();   // no pause card here, so RadioVoice's #pausemenu halt never fires (radio-voice.js halt)
  openGarage("pit");
}
/** Back to the race. Called by BOTH garage exits — there is no "cancel" here
 *  either (the garage keeps what you picked), so DONE and BACK do the same
 *  thing and only the price is conditional. */
function closePitWork() {
  leaveGarage();                       // …which is what recomputes the car's mods
  const changed = pitWorkSpec != null && carSpecKey() !== pitWorkSpec;
  pitWorkSpec = null;
  const added = changed ? pits.addWork(player) : 0;
  if (added > 0 && typeof announce === "function") announce("WORK DONE — +" + added + "s", 1.8, "race");
  paused = false;
  lastFrame = performance.now();       // or the frozen minutes arrive as one dt
  if (soundOn) { GameAudio.setVoice(player && player.team && player.team.engine); GameAudio.startEngine(); if (isRaining()) GameAudio.startRain(); }
}
// Leaving the GARAGE, shared by DONE and BACK: the screen's own teardown plus
// the part maths, which both exits owe the rest of the game.
function leaveGarage() {
  setupCam.cancelArrival();
  if (garageReturn !== "pit" && !loadingScreen.phase()) loadingScreen.busy("Returning");
  $("carsetup").hidden = true;
  setupPreviewOn = false;
  recomputePlayerMods();
}
/* BACK — the door DONE cannot be, because DONE goes FORWARD. From the circuit
   picker, DONE means "I have chosen a car, now set the race up" and lands on
   race settings; there was no way at all to change your mind and return to the
   picker, and no control on the screen that meant "back". So Escape could not
   be pointed at DONE either (see data-esc-close on #carsetup in index.html) —
   a back key that walks you further into a flow is worse than none.
   Selections are kept exactly as DONE keeps them: nothing here is a cancel. */
function garageBack() {
  if (soundOn) GameAudio.uiTick();
  if (garageReturn === "pit") { closePitWork(); return; }
  leaveGarage();
  if (garageReturn === "vsfriend") { $("vsfriend").hidden = false; netLobby.roomChanged("car"); }
  else if (garageReturn === "career") careerUi.openHub();
  else if (garageReturn === "select") { buildSelect(); $("select").hidden = false; }
  else { buildSelect(); els.overlay.hidden = false; }   // no vt: snapshot after hiding #carsetup is a black hold
  if (garageReturn !== "menu") loadingScreen.stop();
}
$("cs-back").onclick = garageBack;
$("cs-done").onclick = () => {
  if (garageReturn === "pit") { closePitWork(); return; }
  leaveGarage();
  // Back to the waiting room, and tell the other player what you are driving —
  // a room that only synced on START would have two people spend a minute each
  // choosing a car neither can see.
  if (garageReturn === "vsfriend") { $("vsfriend").hidden = false; netLobby.roomChanged("car"); }
  else if (garageReturn === "career") careerUi.openHub();
  // Reached from the circuit picker's START, so DONE goes FORWARD to the race
  // settings, not back to a screen whose question is already answered. Race
  // settings' own BACK still returns to #select, so the circuit stays two taps
  // away if you change your mind.
  else if (garageReturn === "select") raceSettings.openRaceSettings("select");
  else { buildSelect(); els.overlay.hidden = false; }   // no vt: snapshot after hiding #carsetup is a black hold
  if (garageReturn !== "menu") loadingScreen.stop();
};
$("cs-unlimited").onclick = () => {
  unlimitedBudget = !unlimitedBudget;
  store.set("unlimitedBudget", unlimitedBudget);
  buildSetup();
};
els.resMenu.onclick = () => quitToMenu();
els.resNext.onclick = () => {
  resultsCam.reset();
  if (announcer.stop) announcer.stop();   // a read-out still waiting on the radio must not start over the hub / quali sheet
  // Career never jumps straight into the next round: the weekend is one step of a
  // longer loop, and the hub is where you spend what you just earned.
  if (isCareer()) {
    // The full return-to-menu teardown first, then the hub on top of it (the
    // title's own CAREER path). Hiding the sheet alone left state "results":
    // the hub's GARAGE drew the frozen race frame, and a race started later
    // from MAIN MENU sat on PREPARING… forever (every intro gates on "menu").
    quitToMenu();
    trackIdx = Career.trackIndex();
    openCareer();
    return;
  }
  if (isChampionship()) {
    if (season.round >= SeasonCal.rounds()) {
      // First click: build the champion panel and STAY on the results screen. The
      // panel's own DOM lives in js/ui/results-sheet.js with every other results
      // builder; "MAIN MENU" on the button is the sentinel that it is already up.
      if (els.resNext.textContent !== "MAIN MENU") { buildChampion(); return; }
      // Second click: go to menu, reset season
      const cleared = SeasonCal.clear();
      season = cleared.ok ? null : SeasonCal.load();
      els.resultsTitle.style.color = "";
      quitToMenu();
      return;
    }
    // After a SPRINT the round has not advanced, so this re-selects the circuit
    // the weekend is already at — the Grand Prix is its second half.
    trackIdx = SeasonCal.trackIndex(season.round);
    raceLaps = SeasonCal.roundLaps(raceLaps, season, Tracks.LIST[trackIdx] && Tracks.LIST[trackIdx].gpLaps);
  }
  els.results.hidden = true;
  // Every championship SESSION that races qualifies first — every round, and on
  // a sprint weekend twice: SPRINT QUALIFYING, then qualifying again for the
  // Grand Prix (FIA 2026 SR B2.2.1, B2.4.1(b)); endRace dropped the sprint's
  // classification. openQuali() also clears the previous round's, which is what
  // stops this grid being last week's. Only a season with qualifying off skips
  // it — and a qualified weekend whose classification has since been dropped
  // (quitToMenu() clears it) re-qualifies instead of gridding the player P12
  // out of gridUp()'s tier fallback.
  // RACE AGAIN after a FRIEND race is a solo race: end the session first (BYE to
  // the rival, remotes handed back), or the new race runs with the old one's
  // NetPlay live — the guest adopts the PREVIOUS race's RESULT rows onto the
  // new cars (netOrder), LAP/STRATEGY keep going to the peer for cars no longer
  // in the grid, and pause no longer stops the world (the netPlay.active() gates).
  netPlay.stop("local");   // inactive after a mid-race drop: forgets the stale reason
  // endRace ran with NetPlay still live, so endChangeable() KEPT the host's
  // weather plan — this solo race would have replayed the host's {to, dur}.
  wxArc.endSession();
  if (isChampionship() && (SeasonCal.qualiNext(season) || (SeasonCal.quali() && !quali.results()))) openQuali();
  else if (isChampionship()) startRaceFromSheet();   // RACE AGAIN / TRY AGAIN (one-offs, trials) stay quick restarts
  else startRaceCovered();
};

function setPaused(p, why) {
  if (state !== "race" && state !== "count") return; hideCamPicker();
  if (p) { Ghost.flush(); if (typeof InputGhost !== "undefined") InputGhost.flush(); }   // paused: the frame budget is free for the ghost write
  // THE PIT GARAGE HOLDS THE PAUSE. openPitWork freezes the race behind
  // #carsetup; a Start/P press or RESUME on a pause card stacked over it
  // (hidden tab) must not run the race UNDER the garage, where the box timer
  // expires and DONE then charges nothing. Its own DONE/BACK are the only way out.
  if (!p && garageReturn === "pit" && !$("carsetup").hidden) { els.pausemenu.hidden = true; return; }
  if (paused !== !!p) Log.info("game", "Race " + (p ? "paused" : "resumed") + " why=" + (why || "button") + " state=" + state + " raceT=" + raceT.toFixed(1));
  paused = p; GameAudio.resetReplayScrub(); replayBuf.onPause(!!p); // REPLAY overlay while paused
  if (!netPlay.active()) { if (p) dropRaceWake(); else holdRaceWake(); }   // a paused screen may sleep; a networked race runs on under the card
  if (!p) {
    closeLightTuner(false); closeCamTuner(false); flybyPanel.closeFlyby(false); exitPhotoMode();
    // closeSettings disarms key/pad slots AND the wheel wizard (beginAxisCapture
    // zeroes the pad every frame while armed); hiding #pmsettings alone would
    // leave capture live after HUD OFF / RECALIBRATE / RESUME. The Escape path
    // closes the same way.
    closeSettings();
  }
  els.pausemenu.hidden = !p;
  if (els.pmStandings) els.pmStandings.hidden = !(isChampionship() && SeasonCal.hasProgress(season) && season.round < SeasonCal.rounds());
  // never leave an overlay up after resume
  if (!p) { $("advanced").hidden = true; els.howtoplay.hidden = true; $("audioset").hidden = true; $("standings").hidden = true; $("track-detail").hidden = true; $("quali").hidden = true; els.results.hidden = true; }
  if (p) { GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain(); radioVoice.halt(); $("pm-restart").disabled = !!(netPlay.active() || qualiNet.hasArmed()); }   // rotate-block / photo hide the card in this task, so the #pausemenu observer never sees it (#988's garage was the same miss)
  // Music + rain too, as startRaceBody does: SOUND turned ON under the pause card defers
  // all of it here (js/audio/panel.js). Rain is SFX (same bus as the engine) and
  // must not hiss over a frozen race; both starts are no-ops when already playing.
  else if (soundOn) { GameAudio.setVoice(player && player.team && player.team.engine); GameAudio.startEngine(); GameAudio.startMusic(trackIdx); if (isRaining()) GameAudio.startRain(); }
  lastFrame = performance.now(); syncRotateBlocker(false);   // the pause card yields to an active rotate blocker on EVERY entry
}
els.pausebtn.onclick = () => setPaused(true);
els.workBtn.onclick = openPitWork;

// ---- Hide-HUD (clean-screen) mode ----
// HUD: OFF (DISPLAY ▸ HUD fold) strips every overlay via a body class
// (css/overlays.css) for a cinematic view; the small #hud-restore eye is
// the only thing left and brings it all back. Session-only — reset on race start.
function setHudUserHidden(v) {
  document.body.classList.toggle("hud-hidden", !!v);
  paintHudDetailsSummary(); if (v) hideCamPicker();   // repaints the HUD row too; an OPEN picker must not survive the hide (css only display:none's it) and pop back on #hud-restore
}
// LINE COLOUR / LINE OPACITY / BRAKE CUE are js/ui/driving-line-opts.js: player
// PREFERENCES, self-contained, and three ratchet raises on this file in one day
// (docs/notes/CEILING-HISTORY.md) said they did not belong in the entry file.
// The MODE stays here — it is a property of the race, not of the player.

SettingRow.wire("pm-hidehud", {
  values: SettingRow.labels(["on", "off"]),
  read: () => (document.body.classList.contains("hud-hidden") ? "off" : "on"),
  write: (v) => {
    const willHide = v === "off";
    setHudUserHidden(willHide);
    if (willHide) setPaused(false, "hud-off");   // clean screen — drop the menu so you can actually see it
  },
});
$("hud-restore").onclick = () => setHudUserHidden(false);

// ---- player camera modes (CAM button / C key) ----
// The CAM button + picker grid + mode-cycle wiring live in js/camera/mode-switch.js
// (broadcast-only — no physics). game.js keeps `camMode`/`camCutT` as closure
// state (the render loop reads them); the module mutates them through G. The
// façade exposes setCamMode as a deferred arrow (const initialised here), and
// the update loop's `cycleCam()` closes over this const.
const { setCamMode, cycleCam, hideCamPicker } = CamModes.create(G);

$("pm-resume").onclick = () => setPaused(false);
$("pm-restart").onclick = () => { if (netPlay.active() || qualiNet.hasArmed()) return; els.pausemenu.hidden = false; setPaused(false, "restart"); frozen = true; startRace().then(() => { if (state === "race") frozen = false; }, () => {}); };   // frozen: the old race must not run (or be scored at its flag) through the async start; startRaceBody lifts it with its own paused = false, and a start that was cancelled (settings changed) hands the old race back
$("pm-quit").onclick = () => quitToMenu();
els.pmStandings && (els.pmStandings.onclick = () => { buildStandings(); $("standings").hidden = false; });

platformSession.paintBuild();

// STEERING INPUT: one row, ‹ TILT | BUTTONS | TOUCH › (was a button cycling the three).
function setSteerMode(mode) {
  if (STEER_MODES.indexOf(mode) < 0) mode = "buttons";
  steerMode = mode;
  store.set("steerMode", mode);
  Input.setSteerMode(mode);
  if (mode === "tilt") enableTilt();   // (re)request motion permission within this gesture
  paintSteer();
  // DISABLE (don't hide): hiding reflowed the settings grid mid-tap, so the
  // next tap landed on whatever button slid under the finger (worst case
  // HIDE HUD, which closes the whole menu). Same for the GEARS toggle below.
  $("pm-calib").disabled = mode !== "tilt";
  refreshGearsBtn();   // manual is tilt-only, so the GEARS toggle disables off-tilt
  // Only refresh touch buttons when in an active race — don't bleed controls onto
  // the title/select screen (e.g. when gyro denial auto-switches to buttons mode).
  if (state === "race" || state === "count") showTouchControls(true);
}
SettingRow.wire("pm-steer", { values: SettingRow.labels(STEER_MODES), read: () => steerMode,
  write: (v) => { if (STEER_MODES.indexOf(v) >= 0) setSteerMode(v); } });
// HOLD / LATCH / AUTO — the middle rung XAG 107 names; js/input/input.js owns it.
SettingRow.wire("pm-throttlemode", { values: SettingRow.labels(["hold", "latch", "auto"]),
  read: () => (autoThrottleOpt ? "auto" : (throttleLatchOpt ? "latch" : "hold")),
  write: (v) => {
    autoThrottleOpt = v === "auto";
    throttleLatchOpt = v === "latch";
    store.set("autoThrottle", autoThrottleOpt);
    store.set("throttleLatch", throttleLatchOpt);
    Input.setThrottleLatch(throttleLatchOpt);
    refreshGearsBtn();
    if (state === "race" || state === "count") showTouchControls(true);
  } });
SettingRow.wire("pm-mirror", { values: SettingRow.labels(["off", "on"]),
  read: () => (mirrorControls ? "on" : "off"),
  write: (v) => { mirrorControls = v === "on"; store.set("mirrorControls", mirrorControls); applyMirrorControls(); } });
platformSession.wireInstall();
applyMirrorControls();
$("pm-calib").onclick = () => { Input.calibrate(); setPaused(false, "recalibrate"); };
platformSession.wirePhone();
keyBinds = KeyBinds.create(G);   // the KEYBOARD rows: rebindable driving keys (js/ui/key-binds.js)
SettingsExport.create(G);   // SETTINGS FILE: download preferences as JSON (js/ui/settings-export.js)

// Steering-tuning sliders, presets + macro levels live in
// js/input/steer-tuning.js (SteerTuning.create(G) — wired after the G façade).

// GEARS toggle: usable when thumbs are free (tilt or desktop keyboard).
// Disabled — not hidden — on BUTTONS/TOUCH (see the pm-calib note in setSteerMode).
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
// HUD fold setting rows. Each write repaints the whole fold through
// paintHudDetailsSummary, so the summary and the chips can never disagree.
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

// ACTIVE AERO: MANUAL / AUTO. Same shape as GEARS and for the same reason —
// both answer "how much of the car do you operate yourself?". Takes effect
// immediately, so a player who flips it mid-race sees it on the next zone; the
// HUD's AERO button greys out under AUTO (see hud.js hToggle "dead").
// Also re-lays the dock, because AUTO REMOVES the AERO button rather than
// greying it and the survivors have to close ranks. Without this the change
// only appeared at the next steering-mode switch — i.e. it looked broken
// exactly when a player flipped the setting to see what it did.
function refreshAeroBtn() {
  SettingRow.paint($("pm-aero"), raceAeroMode === "auto" ? "auto" : "manual");
  if (state === "race" || state === "count") showTouchControls(true);
}
SettingRow.wire("pm-aero", { values: SettingRow.labels(["manual", "auto"]), read: () => (raceAeroMode === "auto" ? "auto" : "manual"), write: (v) => {
  raceAeroMode = v === "auto" ? "auto" : "manual";
  store.set("aeroMode", raceAeroMode);
  refreshAeroBtn();
  // Dropping out of AUTO must not leave the wing latched open — the switch is
  // the player's again from this instant.
  if (raceAeroMode !== "auto" && player) player.xOn = false;
  if (soundOn) GameAudio.uiTick();
} });
refreshAeroBtn();
// A HIDDEN OR CLOSING TAB IS NOT A CRASH, and the boot canary must not read
// one as a backend failure — the same rule PerfGov's sentinel encodes below.
// Holding the arm across PROVE_FRAMES widened the window from one frame to
// ~5 s, so a player who quits or navigates away inside that window would
// leave an armed probe and be silently reverted to WebGL2 on their next
// boot — a false positive the one-frame version never had. Disarming here
// leaves armed exactly the case the canary is for: a foreground, visible,
// actively-presenting tab that died. pagehide covers the clean exit that
// visibilitychange does not always precede.
function _disarmProbeOnLeave() {
  if (!_probeArmed) return;
  _probeArmed = false;
  try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* blocked storage: nothing was armed */ }
}
platformSession.wireLifecycle();

// ---------- boot ----------
// (A `window.__APEX` bridge lived here, gated on a `window.__APEX_DEBUG` flag
// that nothing in js/, tests/, tools/ or index.html has ever set. The harness
// it was written for is window.__apex, in js/agent/apex.js.)

customTeam.init();
raceSettings.wireButtons();
customTeam.syncCustomTeam();   // inject "MY TEAM" so saved selections and chips resolve
// LEGACY CODE-KEYED POINTS -> STABLE DRIVER IDS, here and not in SeasonCal.load
// (which runs at eval, before MY TEAM is in Teams.LIST, so "YOU" matched no
// roster entry). 6091fb859 dropped this call with the move to SeasonCal.load,
// whose comment still promised it; from then on an old save's points stayed
// under the display code and a custom-code edit split the player in two.
// Not over a season load() refused to write back (lossy: a circuit this build
// does not know) — saving it here erased that circuit, or blanked a finished season.
if (season && store.get("season", null)) { season = GameStore.migrateSeasonPoints(season); if (!SeasonCal.lastLoadLossy()) SeasonCal.save(season, { migration: true }); }
teamIdx = idxOr(teamIdx, Teams.LIST.length, 2);
clampDriverIdx();
// Clamp a legacy positional selection before migrating it to stable identity.
trackIdx = idxOr(trackIdx, Tracks.LIST.length, 0);
// Stable ID is authoritative; keep the legacy index for an older cached build.
if (Tracks.LIST[trackIdx]) {
  store.set("trackId", Tracks.LIST[trackIdx].id); store.set("track", trackIdx);
}
{ const hasSeason = SeasonCal.hasProgress(season) && season.round < SeasonCal.rounds();
  $("mb-standings").hidden = !hasSeason; }
Career.load();            // resolve + migrate the career save once at boot
clampDriverIdx();         // MY TEAM gridDrivers() is 2 after load; team.drivers may still be 1
refreshCareerButton();
platformSession.initInput({ steerMode, throttleLatchOpt });
// No DataHub.init here: js/data is LAZY_DATA, so ensureDataHub() (awaited by
// the DATA button) initialises it.
paintSteer();
paintHudDetailsSummary();
syncMetricsOverlayCompact();
$("pm-calib").disabled = steerMode !== "tilt";
refreshGearsBtn();
audioPanel.init();
// THE BOOT BUILDS NO WORLD. This was a synchronous Tracks.build() inside
// DOMContentLoaded (938–3284 ms), then a deferred title flyby. Nothing on the menu
// needs one: the picker draws from Tracks.LIST + the committed stills, startRace()/
// openQuali() build the real track, RACE SETTINGS schedules the one menu flyby
// (openRaceSettings), and __apex forces a build on first use (lazyTrackEnsure).
// One rAF per resize burst — GLX reallocates HDR/bloom on a real size change.
function scheduleGfxResize() { if (scheduleGfxResize._raf) return; const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0); scheduleGfxResize._raf = raf(() => { scheduleGfxResize._raf = 0; gfx.resize(); }); } window.addEventListener("resize", scheduleGfxResize);
lastFrame = performance.now();
XrBoot.bind({ gfx, tickBody, windowTick: tick, getCamMode: () => camMode,
  setCamMode: (i, opts) => { if (typeof setCamMode === "function") setCamMode(i, opts); } });
XrBoot.mountUi();
XrBoot.afterTick(tick);

// --- debug / test hook (no effect unless explicitly called) ---
// Lets a test harness stage the camera anywhere on the track without having to
// drive there in real time (the software renderer used for screenshots is far
// too slow to reach distant corners). Examples, from page.evaluate:
//   __apex.park(0.25)              -> jump to 25% of the lap, field cleared, still
//   __apex.jump(0.5, 60, 2)        -> 50% of lap, 60 m/s, 2 m right of centre
// The __apex dev/test API lives in js/agent/apex.js (ApexApi.create(G)).
// Injected only when wantAgentSurface() — Pages players never download it.
// game.js eval-assigns window.__apex (the one-global the registry pins on this
// file) and bootAgentSurface fills it after the lazy inject. ApexApi itself is
// a call-time read: an eval-time ApexApi.create is a ReferenceError on the
// player path and a FULL toposort miss in scan-globals.
window.__apex = null;
await bootAgentSurface();
// SETTINGS > DISPLAY > METRICS reads CAR and PHYS entirely through __apex, so
// on a Pages build — where wantAgentSurface() is false by design — those two
// pages painted "—" in every row for the only audience the panel exists for.
// Hand the overlay the loader rather than widening the gate: nothing is
// fetched until a player actually switches METRICS on.
if (typeof GameMetrics !== "undefined" && GameMetrics.setTelemetryLoader)
  GameMetrics.setTelemetryLoader(loadAgentSurface);
// The FLYBY SHOT EDITOR has exactly the same problem for exactly the same
// reason: it previews every edit through __apex.flybyCam, which is null on a
// Pages build until something asks. Same remedy — hand it the loader, and it
// fetches only when a player actually opens the panel.
if (flybyPanel && flybyPanel.setApiLoader) flybyPanel.setApiLoader(loadAgentSurface);

lazyBundles.raceAssets();
// First pointerdown also kicks LAZY_AUDIO so a later SOUND click still has a
// chance to unlock AudioContext on the same gesture chain (iOS).
// ...and the first KEY: platform-session's firstGesture (init + startMusic) takes a
// keydown too, but on the stub — with nothing pulling the bundle, restoreOnEngine's
// replay never ran and a keyboard-first title stayed silent. Escape is no activation.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => { ensureAudio(); }, { once: true, capture: true });
  const keyKick = (e) => { if (e && e.key === "Escape") return; window.removeEventListener("keydown", keyKick, true); ensureAudio(); };
  window.addEventListener("keydown", keyKick, true);
}

// Lobby buttons + the #vs= invite-link handler. Last, so every element it
// binds to exists and the G facade is fully built. This is the STUB's no-op
// now — there is nothing to bind until js/net lands, and ensureNet() calls the
// real wire() the moment it does. Kept as a call so the boot sequence still
// reads the same and re-eagering the lobby needs no edit here.
netLobby.wire();
// A #vs= invite link is the one way into multiplayer that is NOT a button
// press, so it has to pull the bundle itself — the stub's wire() cannot see it.
if (typeof location !== "undefined" && /[#&]vs=/.test(location.hash)) ensureNet();
// ...and a link pasted into a tab that is ALREADY running only fires
// hashchange. The lobby's own listener exists once the bundle is up; until
// then this is the only thing awake to pull it (wire() re-reads the fragment).
if (typeof window !== "undefined") window.addEventListener("hashchange", () => { if (/[#&]vs=/.test(location.hash)) ensureNet(); }); if (typeof SurveyHud !== "undefined") SurveyHud.boot({ $, els, document, loadingScreen, canvas });

})();
