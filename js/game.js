/* Apex 26 — main game: state machine, physics, AI, race logic, HUD.
   Contract: docs/ARCHITECTURE.md. Depends on globals M4,V3,GLX,Teams,Tracks,
   Car3D,Input,GameAudio,F1API,DataHub. */
(function () {
"use strict";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const els = {
  hud: $("hud"), pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"),
  best: $("hud-best"), speed: $("hud-speed-n"), energy: $("hud-energy-fill"),
  ot: $("hud-ot"), gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"),
  hudSectors: $("hud-sectors"),
  flag: $("hud-flag"), minimap: $("minimap"),
  lights: $("lights"), announce: $("announce"),
  overlay: $("overlay"), subtitle: $("subtitle"), audiostate: $("audiostate"),
  select: $("select"), selTitle: $("select-title"), selTeams: $("sel-teams"),
  selDriver: $("sel-driver"), selTracks: $("sel-tracks"),
  selPreviewMap: $("sel-preview-map"), selPreviewName: $("sel-preview-name"),
  selPreviewGp: $("sel-preview-gp"), selPreviewMeta: $("sel-preview-meta"),
  selPreviewRec: $("sel-preview-rec"),
  selTrackSection: $("sel-track-section"), selCircuitLabel: $("sel-circuit-label"), selDiff: $("sel-diff"),
  selDiffSection: $("sel-diff-section"), selCustomize: $("sel-customize"),
  selBack: $("sel-back"), selGo: $("sel-go"),
  customize: $("customize"),
  results: $("results"), resultsTitle: $("results-title"),
  resultsTable: $("results-table"), resMenu: $("res-menu"), resNext: $("res-next"),
  pmStandings: $("pm-standings"),
  pausebtn: $("pausebtn"), pausemenu: $("pausemenu"), btnCam: $("btn-cam"),
  howtoplay: $("howtoplay"), datahub: $("datahub"), soundbtn: $("soundbtn"),
  btnBoost: $("btn-boost"), btnOT: $("btn-ot"), btnBrake: $("btn-brake"),
  btnThrottle: $("btn-throttle"),
  btnSteerLeft: $("btn-steer-left"), btnSteerRight: $("btn-steer-right"),
  shiftUp: $("shift-up"), shiftDown: $("shift-down"),
  gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
};

if (!GLX.init(canvas)) { $("nogl").hidden = false; return; }

// ---------- rain overlay ----------
const rainCanvas = document.createElement("canvas");
rainCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;display:none;";
document.body.appendChild(rainCanvas);
const rainCtx2d = rainCanvas.getContext("2d");
let rainDrops = [];
function initRainDrops() {
  rainCanvas.width = window.innerWidth;
  rainCanvas.height = window.innerHeight;
  rainDrops = Array.from({ length: 220 }, () => ({
    x: Math.random() * rainCanvas.width,
    y: Math.random() * rainCanvas.height,
    len: 12 + Math.random() * 18,
    speed: 300 + Math.random() * 250,
    opacity: 0.18 + Math.random() * 0.30,
  }));
}
function drawRain(dt) {
  const w = rainCanvas.width, h = rainCanvas.height;
  rainCtx2d.clearRect(0, 0, w, h);
  rainCtx2d.lineWidth = 1;
  for (const d of rainDrops) {
    d.y += d.speed * dt;
    d.x += d.speed * dt * 0.18;
    if (d.y - d.len > h || d.x > w) { d.y = -d.len; d.x = Math.random() * w; }
    rainCtx2d.globalAlpha = d.opacity;
    rainCtx2d.strokeStyle = "#afc8e8";
    rainCtx2d.beginPath();
    rainCtx2d.moveTo(d.x, d.y);
    rainCtx2d.lineTo(d.x + d.len * 0.18, d.y + d.len);
    rainCtx2d.stroke();
  }
  rainCtx2d.globalAlpha = 1;
}

// ---------- settings ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("apex26." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("apex26." + k, JSON.stringify(v)); } catch (e) {} },
};

/// Per-track time-trial leaderboard: top 10 laps ever, each tagged with the
// team + driver that set it. Stored sorted ascending by lap time.
const TT_BOARD_MAX = 10;
function ttBoard(trackId) {
  const b = store.get("ttlb." + trackId, []);
  return Array.isArray(b) ? b : [];
}
function ttBoardAdd(trackId, entry) {
  if (!isFinite(entry.t) || entry.t <= 0) return ttBoard(trackId);
  const b = ttBoard(trackId);
  b.push(entry);
  b.sort((a, z) => a.t - z.t);
  if (b.length > TT_BOARD_MAX) b.length = TT_BOARD_MAX;
  store.set("ttlb." + trackId, b);
  return b;
}

// Custom "MY TEAM": a player-defined team injected into Teams.LIST. It only
// joins the grid when the player actually selects it (see makeCars).
const DEFAULT_CUSTOM = {
  id: "custom", name: "My Team", short: "YOU", engine: "Custom", tier: 2, custom: true,
  color: [0.13, 0.79, 0.85], color2: [0.96, 0.86, 0.0],
  stats: { speed: 84, accel: 82, cornering: 83, braking: 81 },
  drivers: [{ name: "Your Name", code: "YOU", num: 99 }],
};
function loadCustomTeam() { return store.get("customTeam", DEFAULT_CUSTOM); }
function syncCustomTeam() {
  const i = Teams.LIST.findIndex((t) => t.id === "custom");
  if (i >= 0) Teams.LIST.splice(i, 1);
  Teams.LIST.push(loadCustomTeam());
  delete teamMeshes.custom;   // force the mesh to rebuild with the latest colours
  delete playerBodies.custom; // and the body-only (animated-wheel) variant
}
function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
}
function rgbToHex(c) {
  const f = (v) => ("0" + Math.round(clamp(v, 0, 1) * 255).toString(16)).slice(-2);
  return "#" + f(c[0]) + f(c[1]) + f(c[2]);
}

let teamIdx = store.get("team", 2);          // default McLaren
let driverIdx = store.get("driver", 0);
let trackIdx = store.get("track", 0);
let difficulty = store.get("difficulty", "normal");
let soundOn = store.get("sound", true);
let musicEnabled = store.get("music", true);    // music on/off, independent of sound
let manualMode = store.get("manual", false);   // manual gearbox preference (player shifts)
let unlimitedBudget = store.get("unlimitedBudget", false); // removes credit cap in car setup
// how the player steers: "tilt" | "buttons" | "touch" (migrates the old buttonSteer flag)
let steerMode = store.get("steerMode", store.get("buttonSteer", false) ? "buttons" : "tilt");
// Manual gears: available in tilt mode (thumbs free) or on desktop keyboard
// (no thumbs involved). Touch/button modes on mobile force auto to free thumbs.
function gearsManual() {
  return manualMode && (steerMode === "tilt" || !Input.touchControlsNeeded());
}
// Auto-throttle: enabled only in touch steering mode (screen-half taps occupy
// the thumb). Button mode now exposes an explicit GAS button so the thumb is free.
function autoThrottle() { return Input.touchControlsNeeded() && steerMode === "touch"; }
let season = store.get("season", null);      // {round, pts:{code:n}, teamPts:{id:n}}

// ---------- physics constants ----------
const VMAX = 72;            // m/s base (~259 km/h) — F1 race pace; scales all speeds
const ACCEL = 7;            // m/s^2 at low speed
// Global pace multiplier on top speed AND acceleration, applied to EVERY car
// (player + AI) so the whole field speeds up/slows down together and the racing
// stays competitive. 1.0 = stock. Driven by the OVERALL SPEED slider.
let PACE = 1.0;
const BRAKE = 22;
const REVERSE_MAX = -5;     // m/s — top reverse crawl speed (brake held at a stop)
const REVERSE_ACCEL = 5;    // m/s^2 — how quickly the reverse crawl builds
const COAST_DRAG = 6;       // m/s^2 deceleration when off the throttle
const GRAVITY_SLOPE = 9;    // m/s^2 along-slope pull on elevation (~g, arcade-tuned)
const LAT_MAX = 22;         // m/s^2 cornering grip
const STEER_VMAX = 15;      // lateral m/s at full lock, full speed (AI)
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
const FRONT_WEIGHT = 0.47;  // static front-axle load fraction (F1 is rear-biased)
const CS_FRONT = 130;       // front cornering stiffness (accel per rad of slip)
const CS_REAR  = 175;       // rear stiffer than front → understeer in the linear range too
const WT_LONG = 0.22;       // longitudinal load transfer (braking loads the front axle)
// These four are `let` so the emulation/tuning harness (setPhysics) can sweep them
// — they are the core feel levers found by emulating real drivers, not pause-menu
// sliders. FRONT_GRIP: front friction bias (<1) for an understeer-safe default.
// YAW_DAMP: yaw damping for arcade stability. YAW_INERTIA: rotational inertia
// scale (<1 = snappier turn-in). PLAYER_GRIP: forgiveness headroom over the AI.
let FRONT_GRIP = 0.89;
let YAW_DAMP = 1.0;
let YAW_INERTIA = 0.7;      // scales the car's rotational inertia: <1 = snappier turn-in
                            // (quicker direction changes through chicanes) without
                            // touching steady-state grip. Too low over-rotates into slip
                            // (washes wide); 0.7 keeps turn-in lively but settled.
let PLAYER_GRIP = 1.15;     // player-only grip headroom over the AI's LAT_MAX baseline:
                            // keeps the dynamic model's character but forgiving enough
                            // that a tidy line holds the road (neutral-simcade target)
const ASSIST_KUS = 0.0008;  // s²/m — speed² term in the DRIVING-HELP steer assist so
                            // it keeps tracking the road as speed rises. Kept modest:
                            // the grippy car understeers little, so a large term would
                            // OVER-steer and cut the car to the inside of the corner.
// Steering-assist ("DRIVING HELP"): adds road-wheel steer toward the upcoming
// curvature so the car helps drive each corner — but the assist goes THROUGH the
// tyres (grip-limited) like the driver's own steering, it can't teleport the
// heading. 0 = pure manual (the car runs straight off at corners), 0.9 = the
// car nearly steers the corner for you. The driver always adds on top.
let ROAD_FOLLOW = 0.7;
// Combined-slip friction ellipse: grip used braking/accelerating is taken out of
// the cornering budget. LONG_GRIP is the longitudinal axis of the ellipse (m/s²),
// set a little above BRAKE (27) so straight-line braking keeps most grip, but
// braking hard WHILE turning washes the front wide; easing off the brake as you
// turn in (trail-braking) hands grip back to cornering. Higher = more forgiving.
const LONG_GRIP = 34;
// Visual animation (render-only, never touches physics): the chassis leans into
// corners (roll ∝ lateral g) and pitches to the road gradient, and the wheels
// spin with speed + steer with input — all on a smoothed visual layer, the way
// SuperTuxKart keeps a rigid physics body and animates only the model.
const BODY_ROLL_MAX = 0.06;   // rad (~3.4°) max chassis lean at full lateral grip
const WHEEL_R = 0.34;         // wheel radius (m) — matches Car3D geometry, for spin rate
const WHEEL_STEER_VIS = 0.5;  // rad of visible front-wheel steer at full lock
const GRASS_V = 18;         // crawl speed on grass
const DEPLOY_A = 3.0;       // extra accel from electric deploy
const TAPER_LO = 41, TAPER_HI = 53;  // deploy tapers to 0 across this speed band
const DRAIN = 0.20, REGEN = 0.115;   // energy per second
const OT_TIME = 4, OT_COOL = 12, OT_GAP = 1.0;
const TIER_V = [1.0, 0.988, 0.973, 0.958, 0.942];
// 6-speed gearbox with realistic PROGRESSIVE ratios (research: real/F1 gearboxes
// space the ratios so the steps shrink in the higher gears). So an upshift drops
// the revs a lot in the low gears and less up top, and every shift lands back in
// the ~8.7-11.3k power band (F1's optimal ~8-12k) before climbing to the limit —
// rather than dropping to idle or barely dropping at all. Top speed fraction of VMAX.
// F1-authentic 8 gears.
const GEARS = 8;
const GEAR_TOP = [0.095, 0.16, 0.25, 0.36, 0.50, 0.66, 0.83, 1.0];
const IDLE_RPM = 5000, MAX_RPM = 15000;   // F1 V6 turbo: idle ~5k, rev limit 15k
function gearLo(g) { return g > 1 ? VMAX * GEAR_TOP[g - 2] : 0; }
function gearHi(g) { return VMAX * GEAR_TOP[g - 1]; }
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
const DIFF = {
  easy:   { ai: 0.86, band: 0.18 },
  normal: { ai: 0.92, band: 0.08 },
  hard:   { ai: 0.99, band: 0.03 },
};
const GAME_LAPS = 3;
const TT_LAPS = 4;          // time trial: one standing out-lap + flying laps
function gripMult() { return raceWeather === "wet" ? 0.72 : 1; }

// ---------- state ----------
let state = "menu";
let track = null, builtTrackId = null, builtTrackNight = null;
let cars = [], player = null;
let raceT = 0, countT = 0, lightsLit = 0, resultT = 0;
let camEye = [0, 6, -10], camTgt = [0, 0, 0], camFov = 62;
let hideMeshes = {};   // debug: per-mesh visibility toggle (set via __apex.meshToggle)
let dbgCam = null;   // debug free camera override (set via __apex.view); null = chase
let headlessMode = false;  // skip render() when true (headless control loop)
// Player camera modes, cycled with the CAM button / C key and persisted. Each is
// a distinct vantage computed in render(): a close action chase, a higher/wider
// chase for race-craft, an in-cockpit eye, and a nose/hood cam. Index into CAM_MODES.
const CAM_MODES = [
  { id: "chase",     label: "CHASE" },
  { id: "far",       label: "FAR" },
  { id: "drift",     label: "DRIFT" },
  { id: "cockpit",   label: "COCKPIT" },
  { id: "hood",      label: "HOOD" },
  { id: "bumper",    label: "BUMPER" },
  { id: "overhead",  label: "OVERHEAD" },
  { id: "heli",      label: "HELI" },
  { id: "reverse",   label: "REVERSE" },
  { id: "side",      label: "TV SIDE" },
  { id: "cinematic", label: "CINEMATIC" },
  { id: "low",       label: "LOW" },
  { id: "tcam",      label: "T-CAM" },
  { id: "rear",      label: "REAR CAM" },
];
let camMode = Math.min(Math.max(store.get("camMode", 0) | 0, 0), CAM_MODES.length - 1);
let seasonMode = false;
let timeTrial = false;      // solo run against the clock, no AI
let lapsTarget = GAME_LAPS; // laps before the session ends (GAME_LAPS or TT_LAPS)
let raceLaps = GAME_LAPS;      // user-selected lap count
let raceWeather = "dry";       // "dry" | "wet"
let raceTimeOfDay = "default"; // "default" | "dawn" | "day" | "dusk" | "night"
let ttRecord = Infinity;    // best lap on the current TT track's leaderboard (seconds)
let ttNewRecord = false;    // set when the player takes provisional pole this session
let ttLaps = [];            // completed lap times this time-trial session
let ttSessionTs = 0;        // session start stamp; entries at/after it are "yours, just now"
let sectorStartT = 0;        // lapTime when current sector started
let sectorIdx = 0;           // 0, 1, 2 (current sector)
let sectorBests = [Infinity, Infinity, Infinity];  // best S1/S2/S3 times ever
let sectorLast = [null, null, null];               // last lap's S1/S2/S3 times
let frameSky = {}, frame = {};
// ---------- sky / weather animation state ----------
// Continuously increasing render clock (seconds) fed to the sky shader each
// frame so clouds drift and stars twinkle even when the physics are frozen.
let _skyT = 0;
// Lightning state: base ambient colours saved from applyRaceSettings(), current
// flash intensity, remaining flash bright time, and next-flash countdown.
let _ltBase = null;           // { ambientSky, ambientGround } saved at race start
let _ltFlash = 0;             // 0..1 current flash intensity (decays each frame)
let _ltNextT = 0;             // seconds until the next lightning strike
// Cloud cover target for the current session: set once in applyRaceSettings()
// and held constant so the sky doesn't shift mid-race (only the shader animates).
let _cloudBase = 0.4;
const teamMeshes = {};   // teamId -> GLX mesh
let shake = 0;          // 0..1 trauma; camera offset scales with shake²
let camRoll = 0;        // radians; lean into corners (decays back to 0)
let camCutT = 0;        // s; >0 just after a camera-mode cut → eased glide to the new vantage
let hitStop = 0;        // seconds of remaining sim slow-mo after a hard hit
let startHold = 0;      // randomised lights-out delay after the 5th light (F1-style)
let paused = false;
// Player racing-line assist, set by the pause-menu slider. -1..1: 0 = pure
// manual (default), >0 gently pulls toward the racing line through corners,
// <0 pushes the car wide. Always an added bias the driver can steer against.
let raceLineAssist = 0;
// Fixed tilt-authority gain, applied after Input.steer() when tilt is active so
// tilt steering is a touch gentler than keys/pad (it trims on top of the road-
// follow assist rather than throwing full lock). Sensitivity proper — how far you
// tilt for a given steer — is the single MAX_TILT knob in the Input module.
const TILT_OUTPUT_SCALE = 0.7;
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
let playerMods = { speed: 1, accel: 1, cornering: 1, braking: 1 };
let lastFrame = 0;
let announceT = 0;
let hudT = 0;
let minimapBg = null;         // offscreen canvas with pre-rendered track shape
const MAX_SKID = 120;
const skidMarks = Array.from({ length: MAX_SKID }, () => new Float32Array(16));
let skidActive = 0;           // how many marks are live (grows to MAX_SKID then stays)
let skidIdx = 0;
let skidFrameT = 0;           // frame countdown between stamp placements

// Car paint materials, hoisted to module scope so the render loop reads a shared
// const per (wet/dry × night/day) combo instead of allocating a fresh object for
// every car every frame.
const PAINT_WET_NIGHT = { emissive: 0.20, roughness: 0.22, metalness: 0.12, specular: 0.70 };
const PAINT_WET_DAY   = { roughness: 0.22, metalness: 0.12, specular: 0.70 };
const PAINT_DRY_NIGHT = { emissive: 0.20, roughness: 0.38, metalness: 0.10, specular: 0.55 };
const PAINT_DRY_DAY   = { roughness: 0.38, metalness: 0.10, specular: 0.55 };
const mm = els.minimap.getContext("2d");
const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // reusable sample
const smp2 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const smpC = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // camera anchor

// ---------- helpers ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));
function fmtTime(t) {
  if (!isFinite(t) || t <= 0) return "-";
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
}
function announce(msg, dur) {
  els.announce.textContent = msg;
  els.announce.hidden = false;
  announceT = dur || 1.6;
}
function wrapS(s) { const L = track.total; s %= L; return s < 0 ? s + L : s; }
// Render interpolation: blend a car's arc position between its previous and
// current fixed-physics-step values by the leftover-accumulator fraction, so
// motion stays smooth between steps (no judder on 120/144 Hz or uneven frames).
// Wrap-safe: takes the short way around the start/finish line.
function lerpS(prev, cur, a) {
  if (prev === undefined || a >= 1) return cur;
  const L = track.total;
  let d = cur - prev;
  if (d > L * 0.5) d -= L; else if (d < -L * 0.5) d += L;
  return wrapS(prev + d * a);
}
function basisMat(r, u, f, p, out) {
  out[0] = r[0]; out[1] = r[1]; out[2] = r[2]; out[3] = 0;
  out[4] = u[0]; out[5] = u[1]; out[6] = u[2]; out[7] = 0;
  out[8] = f[0]; out[9] = f[1]; out[10] = f[2]; out[11] = 0;
  out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
  return out;
}
const tmpMat = new Float32Array(16);
const tmpR = [0, 0, 0], tmpF = [0, 0, 0], tmpU = [0, 1, 0], tmpP = [0, 0, 0];
// Pre-allocated scratch matrices — zero-GC hot-path matrix math.
const MAT_IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _mProj = new Float32Array(16), _mView = new Float32Array(16), _mVP = new Float32Array(16);
const _mLView = new Float32Array(16), _mLProj = new Float32Array(16), _mLVP = new Float32Array(16);
const _mInvVP = new Float32Array(16);
const _camUp = [0, 0, 0];   // scratch camera up-vector (rebuilt each render frame)
let _shadowSnapX = null, _shadowSnapZ = null;

// ---------- parts / player mods ----------
function getTeamParts(teamId) { return store.get("parts." + teamId, {}); }
function saveTeamParts(teamId, parts) { store.set("parts." + teamId, parts); }

function recomputePlayerMods() {
  const team = player ? player.team : Teams.LIST[teamIdx];
  const stats = team.stats || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const mods = Parts.getMods(getTeamParts(team.id), team.engine);
  playerMods = {
    speed:     Parts.statMult(stats.speed)     * mods.speed,
    accel:     Parts.statMult(stats.accel)     * mods.accel,
    cornering: Parts.statMult(stats.cornering) * mods.cornering,
    braking:   Parts.statMult(stats.braking)   * mods.braking,
  };
}

// ---------- car setup ----------
function makeCars() {
  cars = [];
  // the custom team only enters the grid when the player has selected it
  const grid = Teams.LIST.filter((t, ti) => !t.custom || ti === teamIdx);
  const total = grid.reduce((s, t) => s + t.drivers.length, 0);
  let idx = 0;
  grid.forEach((team) => {
    const ti = Teams.LIST.indexOf(team);
    team.drivers.forEach((d, di) => {
      const isP = ti === teamIdx && di === driverIdx;
      // Spread the field's preferred lanes evenly across the track width (with a
      // little jitter) so the AI fan out instead of all stacking on the racing
      // line. Used as a fraction of half-width in updateCar.
      const lane = clamp(((idx / Math.max(1, total - 1)) * 2 - 1) * 0.78
        + (Math.random() - 0.5) * 0.12, -0.85, 0.85);
      idx++;
      cars.push({
        team, name: d.name, code: d.code, num: d.num, isPlayer: isP,
        color: team.color, tier: team.tier,
        s: 0, x: 0, speed: 0, prog: 0, lap: 0,
        gear: 1, rpm: IDLE_RPM, shiftT: 0, boostOn: false,
        energy: 1, otT: 0, otCool: 0, deploying: false,
        lapStart: 0, lapTime: 0, best: Infinity, totalT: 0,
        finished: false, finishT: 0, finPos: 0,
        offroad: false, offT: 0, cuts: 0, penalty: 0,
        yawVis: 0, steerVis: 0, collideT: 0,
        skill: Math.min(1.0, 0.92 + Math.random() * 0.1),
        aiBrakeT: 0, lane,
      });
    });
  });
  player = cars.find((c) => c.isPlayer);
}

function gridUp() {
  // grid order: by tier then random-ish; player at P12 for a fun climb
  const order = cars.slice().sort((a, b) => (a.tier - b.tier) || (Math.random() - 0.5));
  const pi = order.indexOf(player);
  order.splice(pi, 1);
  order.splice(Math.min(11, order.length), 0, player);
  order.forEach((c, i) => {
    c.s = wrapS(track.total - 14 - i * 8);
    c.x = (i % 2 === 0 ? -1 : 1) * Math.min(smpHw(c.s) * 0.4, 3);
    c.xVis = c.x;   // reset smoothed render position so the grid doesn't slide
    c.head = 0; c.yawVis = 0;   // straight ahead on the grid (heading model)
    c.speed = 0; c.prog = -(14 + i * 8); c.lap = 0; c.energy = 1;
    c.otT = 0; c.otCool = 0; c.lapTime = 0; c.best = Infinity; c.totalT = 0;
    c.finished = false; c.finishT = 0; c.cuts = 0; c.penalty = 0; c.offT = 0;
    c.wrongT = 0; c.wrongWay = false; c.rescueT = 0; c.rescueLastT = null; c.wallT = 0; c.wasOnWall = false;
    c.vLat = 0; c.yawRateCur = 0; c.steerVis = 0; c.yawVis = 0;
  });
}
function smpHw(s) { Tracks.sample(track, s, smp); return smp.hw; }

// Optional imported car model (binary glTF / .glb). When loaded, team meshes are
// built from it — tinted to each livery — instead of the procedural Car3D.
// null => procedural (the shipped default; there is no bundled model).
let carModelBuf = null;
const CAR_MODEL_SCALE = 1;

function buildCarData(team) {
  if (carModelBuf) {
    try { return GLTF.toMesh(carModelBuf, { scale: CAR_MODEL_SCALE, tint: team.color }); }
    catch (e) { /* any parse trouble: fall through to the procedural car */ }
  }
  return Car3D.build(team.color, team.color2);
}

function teamMesh(team) {
  if (!teamMeshes[team.id]) teamMeshes[team.id] = GLX.createMesh(buildCarData(team));
  return teamMeshes[team.id];
}

// Player car gets animated wheels: a body-only mesh + four separate wheel meshes
// the render layer spins (∝ speed) and steers (fronts). Only for the procedural
// car — a loaded glb model is one piece, so playerBodyMesh returns null and the
// player falls back to the full static mesh. Wheels are team-independent (dark
// tyres), so the two wheel meshes (narrow front, wide rear) are shared/global.
const playerBodies = {};
let wheelMeshF = null, wheelMeshR = null;
const WHEELS = [
  { x: -0.79, y: 0.34, z:  1.7, front: true,  rear: false },
  { x:  0.79, y: 0.34, z:  1.7, front: true,  rear: false },
  { x: -0.76, y: 0.34, z: -1.6, front: false, rear: true },
  { x:  0.76, y: 0.34, z: -1.6, front: false, rear: true },
];
const _wheelLocal = new Float32Array(16);
const _wheelWorld = new Float32Array(16);
function playerBodyMesh(team) {
  if (carModelBuf) return null;   // glb model: single piece, no wheel split
  if (!playerBodies[team.id]) playerBodies[team.id] = GLX.createMesh(Car3D.build(team.color, team.color2, { noWheels: true }));
  return playerBodies[team.id];
}
// Spin each wheel about its axle ∝ speed and steer the fronts by the smoothed
// driver input. local = translate(corner) ∘ rotY(steer) ∘ rotX(spin), composed
// straight into a scratch matrix (no per-frame allocation), then into world.
function drawPlayerWheels(c, base, dt, opt) {
  if (!wheelMeshF) { wheelMeshF = GLX.createMesh(Car3D.buildWheel(0.32)); wheelMeshR = GLX.createMesh(Car3D.buildWheel(0.38)); }
  c.wheelSpin = ((c.wheelSpin || 0) + (c.speed / WHEEL_R) * dt) % (Math.PI * 2);
  const sp = Math.sin(c.wheelSpin), cp = Math.cos(c.wheelSpin);
  const steerA = clamp(c.steerVis || 0, -1, 1) * WHEEL_STEER_VIS;
  for (let w = 0; w < WHEELS.length; w++) {
    const wd = WHEELS[w];
    const yaw = wd.front ? steerA : 0;
    const ss = Math.sin(yaw), cs = Math.cos(yaw);
    const L = _wheelLocal;
    L[0] = cs;    L[1] = 0;   L[2] = -ss;    L[3] = 0;
    L[4] = ss*sp; L[5] = cp;  L[6] = cs*sp;  L[7] = 0;
    L[8] = ss*cp; L[9] = -sp; L[10] = cs*cp; L[11] = 0;
    L[12] = wd.x; L[13] = wd.y; L[14] = wd.z; L[15] = 1;
    M4.mulTo(_wheelWorld, base, L);
    GLX.draw(wd.rear ? wheelMeshR : wheelMeshF, _wheelWorld, opt);
  }
}

// Load an optional .glb car model at runtime. On success, rebuilds every team
// mesh from it; on any failure (missing file, bad data) silently keeps the
// procedural car. Returns Promise<boolean>. Not auto-called — so a missing asset
// never logs a 404 during normal startup. Drop in a model then call this (e.g.
// from the console or __apex.loadCarModel) once a CC-licensed .glb is available.
async function loadCarModel(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    GLTF.toMesh(buf, { scale: CAR_MODEL_SCALE });   // validate before adopting
    carModelBuf = buf;
    for (const k in teamMeshes) delete teamMeshes[k];  // force rebuild from model
    for (const k in playerBodies) delete playerBodies[k];
    return true;
  } catch (e) { return false; }
}

// ---------- track loading ----------
function loadTrack(idx) {
  const def = Tracks.LIST[idx];
  // Buildings light up for the chosen SESSION time, not the track's default:
  // night/dusk/dawn (or a night-default track in "default") → lit windows. Props
  // are rebuilt when this flips so a day-default circuit raced at night gets a
  // glowing skyline, and a night-default circuit raced by day looks like daytime.
  const sessionDark = raceTimeOfDay === "night" || raceTimeOfDay === "dusk" ||
    raceTimeOfDay === "dawn" || (raceTimeOfDay === "default" && def.night);
  if (builtTrackId !== def.id || builtTrackNight !== sessionDark) {
    if (track && track.meshes) {
      GLX.freeMesh(track.meshes.floor);
      GLX.freeMesh(track.meshes.road);
      GLX.freeMesh(track.meshes.terrain);
      GLX.freeMesh(track.meshes.props);
      if (track.meshes.glass) GLX.freeMesh(track.meshes.glass);
      GLX.freeMesh(track.meshes.gate);
      GLX.freeMesh(track.meshes.startline);
    }
    track = Tracks.build(def, { night: sessionDark });
    builtTrackId = def.id;
    builtTrackNight = sessionDark;
    Ghost.setTrack(def.id);
    minimapBg = null;           // force minimap redraw for new track
    sectorIdx = 0; sectorStartT = 0;
    sectorBests = [Infinity, Infinity, Infinity];
    sectorLast = [null, null, null];
  }
  const pal = def.palette;
  frame = {
    viewProj: M4.ident(), eye: camEye,
    sunDir: V3.norm(pal.sunDir), sunColor: pal.sunColor,
    ambientGround: pal.ambientGround, ambientSky: pal.ambientSky,
    fogColor: pal.fog, fogDensity: pal.fogDensity,
    skyZenith:  pal.zenith,
    skyHorizon: pal.horizon,
    fogHeight:  pal.fogHeight != null ? pal.fogHeight : 0.018,
  };
  frameSky = {
    invViewProj: M4.ident(), zenith: pal.zenith, horizon: pal.horizon,
    sunDir: frame.sunDir, sunColor: pal.sun, stars: def.night ? 1 : 0,
    // procedural cloud coverage 0..1 (night skies stay clearer to show stars)
    cloud: pal.cloud !== undefined ? pal.cloud : (def.night ? 0.22 : 0.4),
  };
}

// The full 3D track build (loadTrack -> Tracks.build) is heavy. On the menu it's
// only needed for the background flyby, so don't run it synchronously inside a
// click handler — defer + debounce it to the final selection so browsing the
// grid (and entering the GP screen) stays instant. startRace() builds the real
// track when the race actually starts, so racing never depends on this.
let flybyBuildTimer = 0;
function scheduleFlybyTrack() {
  clearTimeout(flybyBuildTimer);
  flybyBuildTimer = setTimeout(() => {
    if (state === "menu" || state === "select") loadTrack(trackIdx);
  }, 120);
}

// ---------- race flow ----------
function applyRaceSettings() {
  const isNightSession = raceTimeOfDay === "night" ||
    (raceTimeOfDay === "default" && track && track.def && track.def.night);
  // Pre-build the floodlight set at race start so the first dark-session frame is
  // never unlit (the render path rebuilds it if empty as a fallback). Floodlights
  // are used on ANY track at night/dusk/dawn, so build whenever the scene is dark.
  const floodActive = raceTimeOfDay === "night" || raceTimeOfDay === "dusk" ||
    raceTimeOfDay === "dawn" || (raceTimeOfDay === "default" && track && track.def && track.def.night);
  if (floodActive && track && (!track._lights || !track._lights.length)) track._lights = buildTrackLights(track);
  if (raceTimeOfDay !== "default") {
    const night = raceTimeOfDay === "night";
    frameSky.stars = night ? 1 : 0;
    if (night) {
      frameSky.zenith = [0.01, 0.02, 0.05];
      frameSky.horizon = [0.04, 0.03, 0.06];
      frame.sunColor = [0.16, 0.18, 0.26];   // dim moonlight scene sun (floodlights light the track)
      frame.ambientGround = [0.03, 0.03, 0.06];
      frame.ambientSky = [0.08, 0.08, 0.14];
      frame.fogColor = [0.03, 0.03, 0.06];
      frame.fogDensity = 0.004;
      // When raceTimeOfDay !== "default", sync sky colours to frame too
      frame.skyZenith  = frameSky.zenith;
      frame.skyHorizon = frameSky.horizon;
      // Moon: high visibility at night to give soft blue fill light
      frameSky.moon = 0.85;
      // Night skies: few scattered clouds (don't block stars)
      _cloudBase = 0.22;
      // Night: lift exposure slightly — otherwise shadow detail is lost
      frame.exposure = 1.15;
    } else if (raceTimeOfDay === "dawn") {
      // Pre-sunrise: deep teal-indigo zenith fading to a warm peach/rose horizon.
      // Sun is barely above the horizon — very low elevation, coming from the east.
      frameSky.zenith  = [0.06, 0.10, 0.22];
      frameSky.horizon = [0.72, 0.40, 0.22];
      frameSky.sunColor = [1.0, 0.72, 0.38];
      frameSky.sunDir  = V3.norm([-0.62, 0.08, 0.28]);
      frame.sunDir     = frameSky.sunDir;
      frame.sunColor   = [1.0, 0.70, 0.36];
      // Cool teal fill from the sky, very soft warm bounce from the ground
      frame.ambientGround = [0.18, 0.12, 0.08];
      frame.ambientSky    = [0.22, 0.26, 0.38];
      frame.fogColor      = [0.42, 0.30, 0.20];
      frame.fogDensity    = 0.0028;
      frame.skyZenith     = frameSky.zenith;
      frame.skyHorizon    = frameSky.horizon;
      frameSky.moon = 0.30;   // fading moon still visible in the pre-dawn sky
      // Dawn: a few lingering thin clouds catch the first pink light
      _cloudBase = 0.50;
      // Low sun + low ambient → lift exposure so the scene reads
      frame.exposure = 1.18;
    } else if (raceTimeOfDay === "dusk") {
      // Richer golden hour: deeper indigo zenith, warmer coral/amber horizon,
      // a sun closer to the deck for that low-angle drama.
      frameSky.zenith  = [0.08, 0.10, 0.28];
      frameSky.horizon = [0.72, 0.34, 0.08];
      frameSky.sunColor = [1.0, 0.55, 0.18];
      // Sun low in the west; vary azimuth slightly per track so not every
      // circuit has identical low-angle raking light.
      const _duskAz = track && track.def ? ((_trackAtmoBias(track.def) * 0.28) - 0.14) : 0;
      frameSky.sunDir  = V3.norm([0.50 + _duskAz, 0.10, 0.22]);
      frame.sunDir     = frameSky.sunDir;
      frame.sunColor   = [1.0, 0.62, 0.22];
      // Warm amber ground bounce, cool sky fill from the blue zenith overhead
      frame.ambientGround = [0.28, 0.16, 0.06];
      frame.ambientSky    = [0.32, 0.22, 0.28];
      frame.fogColor      = [0.58, 0.28, 0.10];
      frame.fogDensity    = 0.0022;
      frame.skyZenith     = frameSky.zenith;
      frame.skyHorizon    = frameSky.horizon;
      frameSky.moon = 0;
      // Dusk: moderate cloud to catch the orange light nicely
      _cloudBase = 0.45;
      // Low sun energy but rich colour — slightly lifted exposure
      frame.exposure = 1.10;
    } else {
      // Bright day — a deep, saturated sky with PER-TRACK atmosphere so no two
      // circuits share the same flat blue. `bias` runs -0.55 (clear desert) …
      // +0.85 (overcast Spa): clear days get a deep saturated zenith, crisp low
      // haze, a warm punchy sun and long shadows; humid/overcast days pale out,
      // haze up and flatten. (The old single flat blue at exposure 0.92 is what
      // read "washed/flat".)
      const _bias = track && track.def ? _trackAtmoBias(track.def) : 0;
      const clr = Math.max(0, -_bias);    // 0 … 0.55 clearness
      const ovc = Math.max(0, _bias);     // 0 … 0.85 overcast
      // Zenith: a DEEP saturated blue when clear (the visible sky strip read pale
      // and flat before), washing to flat grey when overcast.
      frameSky.zenith  = [0.10 - clr * 0.05 + ovc * 0.28, 0.28 - clr * 0.04 + ovc * 0.24, 0.92 - ovc * 0.22];
      frameSky.horizon = [0.54 + ovc * 0.22, 0.68 + ovc * 0.12, 0.90 - clr * 0.02];
      // A lower, raking afternoon sun — high overhead light gave almost no shadow
      // modelling, which is what read "flat". Dropping the elevation casts long
      // building shadows for depth; azimuth varies per track so shadows fall
      // differently circuit to circuit. (Track palettes may ship a low/odd sun
      // tuned for their default ambience — override it for a clean day session.)
      const _dayAz = _bias * 0.6;
      frameSky.sunDir = V3.norm([0.46 + _dayAz, 0.58, 0.42]);
      frame.sunDir    = frameSky.sunDir;
      // Strong WARM sun vs a cooler, slightly darker sky-fill: neutral concrete
      // then reads with a warm sunlit side and a cool shadow side (chiaroscuro),
      // which is what lifts a grey city out of "dull/flat". Overcast neutralises
      // the split toward a flat even grey.
      frame.sunColor   = [1.12, 0.95 - ovc * 0.05, 0.72 - clr * 0.04 + ovc * 0.10];
      frameSky.sunColor = [1.0, 0.95, 0.84];
      // Warm low ground bounce; cool, restrained sky fill so shadows keep depth
      // (high flat ambient was washing the modelling out).
      frame.ambientGround = [0.30 + clr * 0.04, 0.24, 0.15];
      frame.ambientSky    = [0.32 + ovc * 0.14, 0.40 + ovc * 0.11, 0.58 + ovc * 0.06];
      // Fog: clearer (lower density, sky-matched colour) so distance reads crisp
      // instead of a flat grey wash; overcast hazes it back up.
      frame.fogColor      = [0.66 + ovc * 0.08, 0.74 + ovc * 0.05, 0.88 - clr * 0.05];
      frame.fogDensity    = 0.0008 + ovc * 0.0012;
      frame.skyZenith     = frameSky.zenith;
      frame.skyHorizon    = frameSky.horizon;
      frameSky.moon = 0;
      _cloudBase = 0.22 + ovc * 0.48;     // clear → few clouds; overcast → heavy deck
      // Brighter, punchier midday (was a flat 0.92). Clear days run a touch
      // hotter; overcast pulled back so the grey doesn't glare.
      frame.exposure = 1.06 + clr * 0.05 - ovc * 0.08;
    }
  } else {
    // "default" — driven by the track palette; set moon for night tracks
    frameSky.moon = isNightSession ? 0.85 : 0;
    // Dim the SCENE sun to soft moonlight at night. Many night palettes ship a
    // bright, near-overhead sun (it drives the sky glow) — left undimmed it lit
    // the road/scenery like daytime, which is why night looked washed (Singapore).
    // frameSky.sunColor is left alone so the warm sky/dusk glow survives; the
    // floodlights (buildTrackLights) now carve out the actually-lit areas.
    if (isNightSession) frame.sunColor = [0.16, 0.18, 0.26];
    _cloudBase = frameSky.cloud !== undefined ? frameSky.cloud
               : (isNightSession ? 0.22 : 0.4);

    // Global night ambient FLOOR: some night tracks ship very dark palette
    // ambients and rely entirely on per-mesh emissive to stay legible. Lift
    // any night track up to a baseline so the road and scenery always read,
    // without touching tracks that are already brighter (a floor, not a
    // multiply — brilliantly-lit street circuits keep their tuned values).
    if (isNightSession && frame.ambientSky && frame.ambientGround) {
      // Floor: lift very-dark night palettes so the road/scenery always read.
      // Ceiling: pull DOWN over-bright night palettes so a night race actually
      // looks like night — the road is up-facing so it's lit mostly by ambSky,
      // and a value like 0.55 renders it daylight-gray. Neon/floodlights survive
      // because lit windows etc. use emissive (sun/ambient-independent). Result:
      // a consistent moody-night ambient band regardless of per-track tuning.
      // Dark, moody base now that floodlights/street lights carve out the lit
      // areas (see buildTrackLights). Floor keeps the unlit scene barely legible;
      // the low cap stops over-bright palettes from washing the night to daylight.
      const floorSky = [0.045, 0.05, 0.09], floorGnd = [0.02, 0.02, 0.045];
      const capSky   = [0.13, 0.14, 0.20], capGnd   = [0.06, 0.06, 0.10];
      // Replace (not mutate) — frame.ambient* alias the shared palette arrays.
      frame.ambientSky    = frame.ambientSky.map((v, i)    => Math.min(capSky[i], Math.max(v, floorSky[i])));
      frame.ambientGround = frame.ambientGround.map((v, i) => Math.min(capGnd[i], Math.max(v, floorGnd[i])));
    }

    // ── Per-track atmosphere (default mode only) ──────────────────────────
    // Nudge cloud cover and fog to give circuits a characteristic sky
    // without overriding any explicit raceWeather or raceTimeOfDay choice.
    if (track && track.def) {
      const _def  = track.def;
      const _pal  = _def.pal || {};
      const _bias = _trackAtmoBias(_def);   // -1 (clear) … +1 (overcast)

      // Cloud cover: start from the existing base then nudge by the bias.
      // Bias +1 = +0.20 cloud; bias -1 = -0.18 cloud. Cap so stars remain.
      const _cloudNudge = _bias > 0 ? _bias * 0.20 : _bias * 0.18;
      _cloudBase = Math.max(0.10, Math.min(isNightSession ? 0.45 : 0.80,
                            _cloudBase + _cloudNudge));

      // Fog density: cloudy/misty circuits get a touch more atmospheric haze.
      if (_bias > 0.2 && _pal.fogDensity != null) {
        frame.fogDensity = Math.min(0.005, _pal.fogDensity * (1 + _bias * 0.30));
      }

      // Exposure: night tracks already bright with floodlights; desert night
      // tracks get a gentle lift; daytime green tracks sit near neutral.
      if (isNightSession) {
        // Street-night circuits (Las Vegas, Singapore, Baku, Jeddah) are
        // brilliantly lit — pull exposure down slightly to keep neon readable.
        frame.exposure = (_def.theme === "street_night") ? 1.05 : 1.18;
      } else if (_def.theme === "desert") {
        // Daytime desert: very bright, slight exposure pull-back
        frame.exposure = 0.88;
      } else if (_bias > 0.3) {
        // Overcast / grey-sky circuits: lift exposure so the scene isn't muddy
        frame.exposure = 1.08;
      } else {
        frame.exposure = 1.0;
      }

      // Per-track sun azimuth variation: rotate the default sun direction
      // horizontally by a small per-circuit offset so the raking shadows
      // fall at a slightly different angle on each track. This is a purely
      // cosmetic tweak applied only when the palette supplies a sunDir.
      if (_pal.sunDir && !isNightSession) {
        const _sd = _pal.sunDir.slice();
        // Derive a stable per-track hash in -1..+1 from the track id chars
        const _azOffset = _bias * 0.12;   // mild tilt proportional to bias
        // Rotate the horizontal (X,Z) components by _azOffset radians
        const _sx = _sd[0], _sz = _sd[2];
        const _cos = Math.cos(_azOffset), _sin = Math.sin(_azOffset);
        _sd[0] = _sx * _cos - _sz * _sin;
        _sd[2] = _sx * _sin + _sz * _cos;
        const _sdn = V3.norm(_sd);
        frame.sunDir = _sdn;
        frameSky.sunDir = _sdn;
      }
    }
  }
  // Wet weather: overcast the sky and flatten the light (soft, diffuse, fewer
  // shadows) — clouds roll in and the sun is muted while ambient lifts.
  if (raceWeather === "wet") {
    // Heavier cloud cover in the rain; cap at 0.96 to let the shader still vary
    _cloudBase = Math.min(0.96, _cloudBase + 0.52);
    frameSky.cloud = _cloudBase;
    frame.sunColor = frame.sunColor.map((v) => v * 0.5);
    frameSky.sunColor = frameSky.sunColor.map((v) => v * 0.65);
    frame.ambientSky = frame.ambientSky.map((v) => Math.min(1, v * 1.18));
    frame.ambientGround = frame.ambientGround.map((v) => Math.min(1, v * 1.18));
    // Wet + overcast: lift exposure to keep the scene moody but readable.
    // Only override exposure if the time-of-day branch didn't already set a
    // specific wet value (it only sets exposure for dry scenarios, so this is safe).
    if (frame.exposure == null || frame.exposure <= 1.0) {
      frame.exposure = Math.max(frame.exposure != null ? frame.exposure : 1.0, 1.10);
    }
  } else if (raceWeather === "overcast") {
    // Dry but heavy grey cloud: flat, soft, shadow-light. No rain, dry grip.
    _cloudBase = Math.min(0.90, _cloudBase + 0.50);
    frameSky.cloud = _cloudBase;
    frame.sunColor = frame.sunColor.map((v) => v * 0.7);
    frameSky.sunColor = frameSky.sunColor.map((v) => v * 0.8);
    frame.ambientSky = frame.ambientSky.map((v) => Math.min(1, v * 1.12));
    frame.ambientGround = frame.ambientGround.map((v) => Math.min(1, v * 1.12));
    if (frame.exposure == null || frame.exposure < 1.05) frame.exposure = 1.05;
  } else if (raceWeather === "fog") {
    // Low-visibility mist: dense pale fog, muted sun, moderate cloud. No rain, dry grip.
    frameSky.cloud = Math.min(0.85, _cloudBase + 0.35);
    frame.fogDensity = (frame.fogDensity || 0.0017) * 3.0;
    const fc = [0.74, 0.76, 0.78];
    frame.fogColor = fc;
    frameSky.horizon = fc.slice();
    frame.sunColor = frame.sunColor.map((v) => v * 0.6);
    frameSky.sunColor = frameSky.sunColor.map((v) => v * 0.7);
    frame.ambientSky = frame.ambientSky.map((v) => Math.min(1, v * 1.10));
    frame.ambientGround = frame.ambientGround.map((v) => Math.min(1, v * 1.10));
    if (frame.exposure == null || frame.exposure < 1.08) frame.exposure = 1.08;
  } else {
    frameSky.cloud = _cloudBase;
    // Guarantee frame.exposure always has a value (default = 1.0 if nothing set above)
    if (frame.exposure == null) frame.exposure = 1.0;
  }
  // Save base ambient values so the lightning system can restore them each frame
  _ltBase = {
    ambientSky:    frame.ambientSky.slice(),
    ambientGround: frame.ambientGround.slice(),
  };
  // Reset lightning timing: first strike after a random 3-8 s delay
  _ltFlash = 0;
  _ltNextT = 3 + Math.random() * 5;
}

// ── Per-track atmosphere bias ─────────────────────────────────────────────────
// Returns a value in roughly -1 (clear/arid) to +1 (overcast/misty) for the
// given track def, based on known geographic/meteorological character.
// Used by applyRaceSettings() to nudge _cloudBase and fog density.
function _trackAtmoBias(def) {
  if (!def) return 0;
  const id = def.id;
  // Specific well-known circuits first (highest priority)
  const _specific = {
    // Notoriously overcast / changeable
    spa:        0.85,
    silverstone: 0.70,
    zandvoort:  0.60,
    interlagos: 0.55,
    // High-altitude / hazy
    mexico:    -0.10,
    // Crisp mountain air
    redbull:    0.10,
    // Mediterranean / sunny
    monaco:    -0.25,
    imola:     -0.20,
    // Asian circuits — moderate humidity but generally good visibility
    suzuka:     0.05,
    shanghai:   0.15,
    // Street circuits in sunny climates
    baku:      -0.10,
    jeddah:    -0.20,
    singapore:  0.10,   // humid but the night keeps it dark regardless
    vegas:     -0.30,   // desert night, very clear
    miami:     -0.05,
    madrid:    -0.15,
    montreal:   0.20,
    albert_park: 0.05,
    // Pure desert / very clear skies
    bahrain:   -0.50,
    qatar:     -0.55,
    abudhabi:  -0.45,
    cota:       0.10,
    hungaroring: 0.15,
  };
  if (_specific[id] !== undefined) return _specific[id];
  // Fall back to theme
  if (def.theme === "desert") return -0.45;
  if (def.theme === "street_night") return -0.10;
  return 0;
}

function startRace() {
  loadTrack(trackIdx);
  makeCars();
  if (timeTrial) {
    cars = [player];          // solo against the clock — no AI on track
    lapsTarget = raceLaps;
    const board = ttBoard(track.def.id);
    ttRecord = board.length ? board[0].t : Infinity;
    ttNewRecord = false;
    ttLaps = [];
    ttSessionTs = Date.now();
  } else {
    lapsTarget = raceLaps;
  }
  applyRaceSettings();
  if (raceWeather === "wet") {
    initRainDrops();
    rainCanvas.style.display = "block";
  } else {
    rainCanvas.style.display = "none";
  }
  gridUp();
  recomputePlayerMods();
  resultT = 0;
  camRoll = 0;
  sectorIdx = 0; sectorStartT = 0;
  state = "count"; countT = 0; lightsLit = 0; raceT = 0; startHold = 0; paused = false; frozen = false; skyViewOverride = null;
  skidActive = 0; skidIdx = 0; skidFrameT = 0;
  els.overlay.hidden = true; els.select.hidden = true; els.results.hidden = true;
  els.hud.hidden = false; els.lights.hidden = false; els.pausebtn.hidden = false;
  if (els.btnCam) els.btnCam.hidden = false;
  els.soundbtn.hidden = true;   // sound is toggled from the pause menu during a race
  document.body.classList.add("in-race");
  for (const l of els.lights.children) l.classList.remove("on");
  showTouchControls(true);
  Input.calibrate();
  if (soundOn) { GameAudio.startEngine(); GameAudio.startMusic(trackIdx); }
  if (soundOn && raceWeather === "wet") GameAudio.startRain();
  updateHud(true);
}

function showTouchControls(show) {
  const t = show && Input.touchControlsNeeded();
  const manual = gearsManual();   // only ever true in tilt mode
  // GAS pedal whenever throttle is manual (tilt); auto-throttle (touch/button) hides it
  els.btnThrottle.hidden = !(t && !autoThrottle());
  els.btnBrake.hidden = !t;
  els.btnBoost.hidden = !t; els.btnOT.hidden = !t;
  els.shiftUp.hidden = !(t && manual);
  els.shiftDown.hidden = !(t && manual);
  const steerBtns = t && steerMode === "buttons";
  els.btnSteerLeft.hidden = !steerBtns;
  els.btnSteerRight.hidden = !steerBtns;
  // manual mode => shifts take the right column, boost/OT move to centre (CSS).
  // button/touch modes => boost/OT pull in next to the steering thumb (CSS).
  document.body.classList.toggle("manual", manual);
  document.body.classList.toggle("steer-buttons", steerBtns);
  document.body.classList.toggle("steer-touch", t && steerMode === "touch");
}

function endRace() {
  state = "results";
  document.body.classList.remove("in-race");
  els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  if (soundOn) GameAudio.finish();
  if (timeTrial) { buildTTResults(); els.results.hidden = false; return; }
  // classification: finished by time(+penalty), rest by progress
  const fin = cars.filter((c) => c.finished).sort((a, b) => (a.finishT + a.penalty) - (b.finishT + b.penalty));
  const run = cars.filter((c) => !c.finished).sort((a, b) => b.prog - a.prog);
  const order = fin.concat(run);
  order.forEach((c, i) => { c.finPos = i + 1; });
  if (seasonMode) {
    order.forEach((c, i) => {
      const pts = Teams.POINTS[i] || 0;
      season.pts[c.code] = (season.pts[c.code] || 0) + pts;
      season.teamPts[c.team.id] = (season.teamPts[c.team.id] || 0) + pts;
    });
    season.round++;
    store.set("season", season);
  }
  dbgCam = null;
  buildResults(order);
  els.results.hidden = false;
}

function buildResults(order) {
  els.resultsTable.textContent = "";
  els.resultsTitle.textContent = seasonMode
    ? "ROUND " + season.round + (season.round > 1 ? "" : "") + " — " + track.def.name
    : track.def.name + " RESULT";
  order.forEach((c, i) => {
    const row = document.createElement("div");
    const podium = i === 0 ? " p1" : i === 1 ? " p2" : i === 2 ? " p3" : "";
    row.className = "res-row" + podium + (c.isPlayer ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = cssCol(c.team.color);
    const nm = document.createElement("span"); nm.className = "res-name";
    nm.textContent = c.code + "  " + c.name + (c.penalty ? "  (+" + c.penalty + "s)" : "");
    const pt = document.createElement("span"); pt.className = "res-pts";
    pt.textContent = (Teams.POINTS[i] || 0) + " pts";
    row.append(pos, sw, nm, pt);
    els.resultsTable.appendChild(row);
  });
  if (seasonMode) {
    // Driver championship (top 10)
    const head = document.createElement("div");
    head.style.cssText = "margin-top:14px;color:#e10600;font-weight:800;font-style:italic";
    head.textContent = "DRIVERS — AFTER ROUND " + season.round;
    els.resultsTable.appendChild(head);
    const all = cars.slice().sort((a, b) => (season.pts[b.code] || 0) - (season.pts[a.code] || 0)).slice(0, 10);
    all.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "res-row" + (c.isPlayer ? " you" : "");
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
      const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = cssCol(c.team.color);
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = c.code + "  " + c.name;
      const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (season.pts[c.code] || 0) + " pts";
      row.append(pos, sw, nm, pt);
      els.resultsTable.appendChild(row);
    });
    // Team championship (top 5)
    const tmHead = document.createElement("div");
    tmHead.style.cssText = "margin-top:10px;color:#e10600;font-weight:800;font-style:italic";
    tmHead.textContent = "CONSTRUCTORS";
    els.resultsTable.appendChild(tmHead);
    const tmList = Object.entries(season.teamPts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    tmList.forEach(([teamId, pts], i) => {
      const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
      const row = document.createElement("div");
      row.className = "res-row";
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
      const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = cssCol(team.color);
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = team.name || teamId;
      const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
      row.append(pos, sw, nm, pt);
      els.resultsTable.appendChild(row);
    });
    els.resNext.textContent = season.round >= Tracks.LIST.length ? "FINISH SEASON" : "NEXT ROUND";
  } else {
    els.resNext.textContent = "RACE AGAIN";
  }
}

function buildTTResults() {
  els.resultsTable.textContent = "";
  els.resultsTitle.textContent = track.def.name + " — TIME TRIAL";
  const best = player.best;

  // headline: your best lap this session (green if it set a new track record)
  const head = document.createElement("div");
  head.className = "res-row you";
  head.style.fontSize = "18px";
  const hl = document.createElement("span"); hl.className = "res-name";
  hl.textContent = ttNewRecord ? "★ NEW RECORD" : "YOUR BEST";
  const hv = document.createElement("span"); hv.className = "res-pts"; hv.style.width = "auto";
  hv.textContent = isFinite(best) ? fmtTime(best) : "-";
  head.append(hl, hv);
  els.resultsTable.appendChild(head);

  // Ghost delta row (shows gap to ghost best)
  if (Ghost.hasGhost() && isFinite(best)) {
    const ghostBest = Ghost.bestTime();
    if (isFinite(ghostBest)) {
      const delta = best - ghostBest;
      const gr = document.createElement("div");
      gr.className = "res-row";
      const gl = document.createElement("span"); gl.className = "res-name"; gl.textContent = "vs Ghost";
      const gv = document.createElement("span"); gv.className = "res-pts"; gv.style.width = "auto";
      gv.style.color = delta <= 0 ? "#a3e635" : "#e10600";
      gv.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(3) + "s";
      gr.append(gl, gv);
      els.resultsTable.appendChild(gr);
    }
  }

  // leaderboard header
  const lbHead = document.createElement("div");
  lbHead.style.cssText = "margin-top:12px;color:#e10600;font-weight:800;font-style:italic";
  lbHead.textContent = "LEADERBOARD — " + track.def.name;
  els.resultsTable.appendChild(lbHead);

  // top laps ever on this track, each tagged with the team + driver that set it.
  // Entries from this session (ts >= session start) are highlighted.
  const board = ttBoard(track.def.id);
  board.forEach((e, i) => {
    const team = teamById(e.teamId);
    const row = document.createElement("div");
    row.className = "res-row" + (e.ts >= ttSessionTs ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = cssCol(team ? team.color : [0.5, 0.5, 0.5]);
    const nm = document.createElement("span"); nm.className = "res-name";
    nm.textContent = e.code + "  " + e.name + (team ? "  · " + team.short : "");
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.style.width = "auto";
    pt.textContent = fmtTime(e.t);
    row.append(pos, sw, nm, pt);
    els.resultsTable.appendChild(row);
  });

  // Ghost clear link
  if (Ghost.hasGhost()) {
    const clrRow = document.createElement("div");
    clrRow.style.cssText = "margin-top:10px;text-align:center";
    const clrBtn = document.createElement("button");
    clrBtn.style.cssText = "font-size:11px;padding:4px 10px;opacity:0.6";
    clrBtn.textContent = "✕ CLEAR GHOST";
    clrBtn.onclick = () => { Ghost.clear(track.def.id); ttRecord = Infinity; buildTTResults(); };
    clrRow.appendChild(clrBtn);
    els.resultsTable.appendChild(clrRow);
  }

  els.resNext.textContent = "TRY AGAIN";
}
function teamById(id) { return Teams.LIST.find((t) => t.id === id); }
function cssCol(c) { return "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")"; }

function quitToMenu() {
  state = "menu"; paused = false;
  document.body.classList.remove("in-race");
  els.hud.hidden = true; els.lights.hidden = true; els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  els.pausemenu.hidden = true; els.results.hidden = true; els.announce.hidden = true;
  $("advanced").hidden = true;
  els.overlay.hidden = false;
  $("race-settings").hidden = true;
  rainCanvas.style.display = "none";
  els.soundbtn.hidden = false;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  if (soundOn) GameAudio.startMusic(-1);
  // Show standings button when an active season is in progress
  const hasSeason = season && season.round > 0 && season.round < Tracks.LIST.length;
  $("mb-standings").hidden = !hasSeason;
}

function buildStandings() {
  const body = $("standings-body");
  body.textContent = "";
  if (!season) return;
  const round = season.round;
  $("standings-title").textContent = round >= Tracks.LIST.length
    ? "FINAL CHAMPIONSHIP" : "CHAMPIONSHIP — AFTER ROUND " + round + " / " + Tracks.LIST.length;

  // Driver standings — all cars sorted by pts
  const drHead = document.createElement("div");
  drHead.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin-bottom:6px";
  drHead.textContent = "DRIVERS";
  body.appendChild(drHead);

  const drList = Object.entries(season.pts)
    .sort((a, b) => b[1] - a[1]);
  drList.forEach(([code, pts], i) => {
    const c = cars.find((x) => x.code === code);
    const row = document.createElement("div");
    row.className = "res-row" + (c && c.isPlayer ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = c ? cssCol(c.team.color) : "#555";
    const nm = document.createElement("span"); nm.className = "res-name";
    nm.textContent = code + (c ? "  " + c.name : "");
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
    row.append(pos, sw, nm, pt);
    body.appendChild(row);
  });

  // Team standings
  const tmHead = document.createElement("div");
  tmHead.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin:14px 0 6px";
  tmHead.textContent = "CONSTRUCTORS";
  body.appendChild(tmHead);

  const tmList = Object.entries(season.teamPts)
    .sort((a, b) => b[1] - a[1]);
  tmList.forEach(([teamId, pts], i) => {
    const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
    const row = document.createElement("div");
    row.className = "res-row";
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = cssCol(team.color);
    const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = team.name || teamId;
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
    row.append(pos, sw, nm, pt);
    body.appendChild(row);
  });

  // Next round info
  if (round < Tracks.LIST.length) {
    const nextTrack = Tracks.LIST[round];
    const info = document.createElement("div");
    info.style.cssText = "margin-top:12px;font-size:12px;color:#9a9aa5;text-align:center";
    info.textContent = "NEXT: ROUND " + (round + 1) + " — " + nextTrack.name + " (" + nextTrack.gp + ")";
    body.appendChild(info);
  }
}

// ---------- per-frame update ----------
// Reusable rank buffer — refilled and sorted each physics step (up to 5x per
// rendered frame) so we don't allocate a fresh array via cars.slice() each time.
const ranked = [];
function update(dt) {
  // Camera cycling works during the countdown and the race (set your view before
  // lights-out). Edge-triggered via the C key or the CAM button.
  if ((state === "race" || state === "count") && Input.consumeCameraCycle()) cycleCam();
  if (state === "count") {
    countT += dt;
    const lit = Math.min(5, Math.floor(countT));
    if (lit > lightsLit) {
      lightsLit = lit;
      els.lights.children[lit - 1].classList.add("on");
      if (soundOn) GameAudio.lightOn(lit - 1);
      if (lit === 1) Input.calibrate();
      // all five lit — hold for a randomised beat, as in real F1, so the
      // start can't be timed and lights-out is a genuine reaction moment.
      if (lit === 5) startHold = 0.2 + Math.random() * 1.8;
    }
    if (lightsLit === 5 && countT > 5 + startHold) {
      state = "race"; raceT = 0;
      els.lights.hidden = true;
      for (const l of els.lights.children) l.classList.remove("on");
      announce("LIGHTS OUT!", 1.4);
      if (soundOn) GameAudio.lightsOut();
      if (timeTrial) Ghost.startLap();
      cars.forEach((c) => { c.lapStart = 0; });
    }
    return;
  }
  if (state !== "race") return;
  raceT += dt;
  // ranks by progress (reuse module-scope buffer, no per-step allocation)
  ranked.length = 0;
  for (const c of cars) ranked.push(c);
  ranked.sort((a, b) => b.prog - a.prog);
  ranked.forEach((c, i) => { c.rank = i + 1; });

  for (const c of cars) updateCar(c, dt, ranked);

  resolveCollisions(ranked);

  // race ends when the player finishes, or shortly after the winner does, or
  // at a hard time cap so it can never hang
  if (resultT === 0) {
    if (player.finished) resultT = 2.2;
    else if (cars.some((c) => c.finished)) resultT = 3.5;
    else if (raceT > 360) resultT = 0.1;
  }
  if (resultT > 0) { resultT -= dt; if (resultT <= 0) { resultT = 0; endRace(); } }

  if (soundOn) {
    const revFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
    GameAudio.setEngine(revFrac, player.deploying ? 1 : 0, player.offroad, clamp(player.speed / VMAX, 0, 1), player.gear);
    GameAudio.setSkid(player.offroad ? 0.4 : clamp(Math.abs(Tracks.curvature(track, player.s)) * player.speed * 0.05 - 0.35, 0, 1));
  }
}

// Shift a car along the track. prog (cumulative) and s (wrapped, used for
// rendering/curvature) advance together, so a longitudinal collision push must
// move BOTH or the visible car won't budge.
function shiftLong(c, d) { c.prog += d; c.s = wrapS(c.s + d); }

// Collision feedback when the player is involved, scaled by impact (0..1).
function collideFx(a, b, impact) {
  if (!a.isPlayer && !b.isPlayer) return;
  const pc = a.isPlayer ? a : b;
  if (pc.collideT > 0) return;
  impact = clamp(impact, 0.12, 1);
  if (soundOn) GameAudio.collision();
  shake = Math.min(1, shake + impact * 0.45);
  hitStop = Math.max(hitStop, impact * 0.015);   // barely any freeze, so contact doesn't feel like a stop
  pc.collideT = 0.35;
  if (navigator.vibrate) { try { navigator.vibrate(Math.round(18 + impact * 50)); } catch (e) {} }
  Input.rumble(0.4 + impact * 0.6, 120);
}

// Frenet-frame collisions: (prog, x) is treated as a 2D plane. Each car is a
// capsule ~4.8 m long and ~2.0 m wide (combined extents). We pick the axis of
// least penetration as the contact normal — lateral penetration => a side rub
// (separate on x, scrub speed); longitudinal => a rear-end (separate along the
// track, transfer speed rear->front). Mass-weighted, several relaxation passes
// to settle clusters, then a hard min-separation pass so cars can never render
// merged. The player is "heavier" (invMass 0.5) so the AI can't shove them off.
function resolveCollisions(ranked) {
  const LCAR = 4.8, WCAR = 2.0, PASSES = 4;
  for (let pass = 0; pass < PASSES; pass++) {
    const last = pass === PASSES - 1;
    const fwd = (pass & 1) === 0;
    for (let ii = 0; ii < ranked.length; ii++) {
      const i = fwd ? ii : ranked.length - 1 - ii;
      const a = ranked[i];
      for (let j = i + 1; j < ranked.length && j <= i + 10; j++) {
        const b = ranked[j];               // a is ahead (higher prog), b behind
        const dProg = a.prog - b.prog;
        if (!Number.isFinite(dProg)) continue;   // never let a corrupt car spread NaN
        if (dProg > LCAR) break;            // sorted by prog: the rest are farther
        const dX = a.x - b.x;
        if (!Number.isFinite(dX)) continue;
        const penLong = LCAR - Math.abs(dProg);
        const penLat = WCAR - Math.abs(dX);
        if (penLong <= 0 || penLat <= 0) continue;
        const iA = a.isPlayer ? 0.5 : 1, iB = b.isPlayer ? 0.5 : 1, iSum = iA + iB;
        if (penLat < penLong) {
          // side-by-side contact: separate laterally, scrub a little speed. Mark
          // both cars "in contact" so the AI eases off steering this way and
          // stops fighting the push (the cause of the side-by-side vibration).
          const sgn = dX >= 0 ? 1 : -1;
          const corr = Math.max(penLat - 0.05, 0) * 0.35;   // gentler push -> rub, not bounce
          a.x += sgn * corr * (iA / iSum);
          b.x -= sgn * corr * (iB / iSum);
          a.speed *= 0.995; b.speed *= 0.995;   // barely scrub speed on a side rub
          a.contactT = b.contactT = 0.22;   // "rubbing" — AI eases off steering
          if (last) collideFx(a, b, Math.abs(a.speed - b.speed) * 0.02 + 0.18);
        } else {
          // rear-end: separate along the track and nudge speeds together (gentle,
          // so hitting a car ahead doesn't slam you to a stop — you bump and tuck in)
          const corr = Math.max(penLong - 0.05, 0) * 0.4;
          shiftLong(a, corr * (iA / iSum));
          shiftLong(b, -corr * (iB / iSum));
          const relV = b.speed - a.speed;   // >0 means the rear car is closing
          if (relV > 0) {
            const jImp = 0.5 * relV / iSum;   // soft momentum exchange (was 1.15)
            b.speed = Math.max(0, b.speed - iB * jImp);
            a.speed += iA * jImp * 0.8;
            a.contactT = b.contactT = 0.22;
            if (last) collideFx(a, b, clamp(relV * 0.03 + penLong * 0.05, 0.15, 1));
          }
        }
      }
    }
  }
  // separation pass: enforce the car boundary firmly so they don't visibly
  // overlap. A small slop is kept to avoid a hard per-frame snap (the proactive
  // steering separation now keeps cars spaced, so collisions rarely fire and a
  // tighter boundary no longer causes the old vibration).
  const SLOP = 0.05;
  for (let i = 0; i < ranked.length; i++) {
    const a = ranked[i];
    for (let j = i + 1; j < ranked.length && j <= i + 10; j++) {
      const b = ranked[j];
      const dProg = a.prog - b.prog;
      if (!Number.isFinite(dProg)) continue;
      if (dProg > LCAR) break;
      const dX = a.x - b.x;
      if (!Number.isFinite(dX)) continue;
      const penLong = LCAR - Math.abs(dProg);
      const penLat = WCAR - Math.abs(dX);
      if (penLong <= 0 || penLat <= 0) continue;
      const iA = a.isPlayer ? 0.5 : 1, iB = b.isPlayer ? 0.5 : 1, iSum = iA + iB;
      if (penLat < penLong) {
        const c = Math.max(penLat - SLOP, 0) * 0.6;
        if (c <= 0) continue;
        const sgn = dX >= 0 ? 1 : -1;
        a.x += sgn * c * (iA / iSum);
        b.x -= sgn * c * (iB / iSum);
      } else {
        const c = Math.max(penLong - SLOP, 0) * 0.6;
        if (c <= 0) continue;
        shiftLong(a, c * (iA / iSum));
        shiftLong(b, -c * (iB / iSum));
      }
    }
  }
  // keep everyone inside the per-side barriers after being shoved around
  for (const c of ranked) {
    const wr = Tracks.wallAt(track, c.s, 1), wl = Tracks.wallAt(track, c.s, -1);
    if (c.x > wr) c.x = wr; else if (c.x < -wl) c.x = -wl;
  }
  // The player runs world-space physics; collisions just moved its (s, x), so
  // feed that back into px/pz or the next frame's integration would overwrite the
  // push (cars would slide through each other). Heading is unchanged by a bump.
  if (player && player.px != null && !player.finished) {
    Tracks.sample(track, player.s, smp);
    player.px = smp.p[0] + smp.r[0] * player.x;
    player.pz = smp.p[2] + smp.r[2] * player.x;
  }
}

function updateCar(c, dt, ranked) {
  if (c.finished) { coast(c, dt); return; }
  Tracks.sample(track, c.s, smp);
  const hw = smp.hw;
  const slopeSin = smp.t[1] || 0;   // road pitch at the car (+uphill / -downhill)
  const k = Tracks.curvature(track, c.s);
  const dd = DIFF[difficulty];

  // --- speed targets ---
  let vmax = VMAX * PACE * (c.isPlayer ? playerMods.speed : TIER_V[c.tier] * c.skill * dd.ai);
  // asymmetric rubber band — boost only when player is ahead; no artificial slow-down when behind
  if (!c.isPlayer) {
    const gap = player.prog - c.prog;
    const bandFactor = gap > 0 ? Math.min(gap / 700, 1) * dd.band : 0;
    vmax *= 1 + bandFactor;
  }

  // --- AI traffic awareness: clearance on each side, the nearest blocker ahead
  // in our lane, and a "stuck" timer. Shared by the braking and steering logic
  // so the AI can pick the open side, commit to a pass, and dig itself out when
  // wedged — instead of grinding to a halt against a car or wall.
  let roomL = Infinity, roomR = Infinity, blocker = null, blockerGap = Infinity, unstuckActive = false;
  if (!c.isPlayer) {
    // AI keeps a tuned racing margin to the edge (not the hard barrier, so it
    // flows through barrier-lined corners instead of treating them as boxed-in).
    const edge = track.street ? hw - 0.8 : hw + 5;
    roomL = edge + c.x;            // clearance to the left edge from our position
    roomR = edge - c.x;            // clearance to the right edge
    for (let j = 0; j < ranked.length; j++) {
      const o = ranked[j];
      if (o === c) continue;
      const dprog = o.prog - c.prog;          // >0 = ahead of us
      if (dprog < -6 || dprog > 18) continue;
      const dx = o.x - c.x;
      if (Math.abs(dprog) < 5.5) {            // alongside: eats the room on its side
        if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
        else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
      }
      if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < 2.2) { blocker = o; blockerGap = dprog; }
    }
    roomL = Math.max(0, roomL); roomR = Math.max(0, roomR);
    const boxed = (c.contactT || 0) > 0 || (roomL < 1.3 && roomR < 1.3) || (blocker && blockerGap < 6);
    if (state === "race" && c.speed < 7 && boxed) c.stuckT = (c.stuckT || 0) + dt;
    else c.stuckT = Math.max(0, (c.stuckT || 0) - dt * 1.5);
    unstuckActive = c.stuckT > 0.7;
  }

  // --- electric deploy ---
  let deploy = 0;
  c.otCool = Math.max(0, c.otCool - dt);
  if (c.otT > 0) c.otT -= dt;
  if (c.isPlayer && Input.consumeBoostToggle()) c.boostOn = !c.boostOn;   // BOOST is a toggle
  const wantBoost = c.isPlayer ? c.boostOn
    : (Math.abs(Tracks.curvature(track, wrapS(c.s + 60))) < 0.006 && c.energy > 0.25);
  if (wantBoost && c.energy > 0) {
    const taper = c.otT > 0 ? 1 : clamp(1 - (c.speed - TAPER_LO) / (TAPER_HI - TAPER_LO), 0, 1);
    deploy = DEPLOY_A * taper;
    c.energy = Math.max(0, c.energy - DRAIN * dt);
    c.deploying = deploy > 0.4;
    if (c.energy <= 0) c.boostOn = false;   // auto-release the toggle when drained
  } else c.deploying = false;

  // --- overtake mode ---
  const ahead = ranked[(c.rank || 1) - 2];
  const gapAhead = ahead && c.speed > 1 ? (ahead.prog - c.prog) / c.speed : Infinity;
  c.otArmed = gapAhead < OT_GAP && c.otCool <= 0 && c.otT <= 0 && !c.finished && c.speed > 15;
  const fire = c.isPlayer ? Input.consumeOvertake() : (c.otArmed && Math.random() < 1 - Math.exp(-0.7 * dt));
  if (fire && c.otArmed) {
    c.otT = OT_TIME; c.otCool = OT_COOL + OT_TIME;
    if (c.isPlayer && soundOn) GameAudio.deployBoost();
  }
  if (c.isPlayer && c.otArmed && !c.wasArmed && soundOn) GameAudio.overtakeReady();
  c.wasArmed = c.otArmed;

  // --- braking / target speed ---
  let braking = false;
  if (c.isPlayer) {
    braking = _testInput ? !!_testInput.brake : Input.braking();
  } else {
    // AI: brake for upcoming curvature
    const look = clamp(c.speed * 1.7, 30, 160);
    let kMax = 0;
    for (let d = 12; d < look; d += 14) kMax = Math.max(kMax, Math.abs(Tracks.curvature(track, wrapS(c.s + d))));
    const _bkIdx = Math.floor(c.s / track.total * track.n) % track.n;
    const bankMu = 1 + Math.sin(track.bank[_bkIdx] || 0) * 0.8;
    const vCorner = Math.sqrt(LAT_MAX * bankMu / Math.max(kMax, 1e-5)) * c.skill;
    braking = c.speed > vCorner + 2;
    // queue behind the car blocking our lane (prog-based, so it's immune to the
    // frame-to-frame rank swapping of near-even cars): cap our pace to it and
    // brake if closing fast, so we tuck in behind instead of ramming.
    if (blocker && blockerGap < 16) {
      vmax = Math.min(vmax, blocker.speed + clamp(blockerGap - 6, -6, 8));
      if (c.speed > blocker.speed + 3) braking = true;
    }
    // when wedged in/stopped, power out instead of braking
    if (unstuckActive) braking = false;
  }

  // --- gearbox (player) ---
  let gearMult = 1, speedCap = vmax + 14;
  if (c.isPlayer) {
    c.shiftT = Math.max(0, c.shiftT - dt);
    const up = Input.consumeShiftUp(), down = Input.consumeShiftDown();
    if (gearsManual()) {
      if (up && c.gear < GEARS && c.shiftT <= 0) { c.gear++; c.shiftT = 0.1; if (soundOn) GameAudio.shift(true); }
      if (down && c.gear > 1 && c.shiftT <= 0) { c.gear--; c.shiftT = 0.1; if (soundOn) GameAudio.shift(false); }
      const hi = gearHi(c.gear), lo = gearLo(c.gear);
      const frac = (c.speed - lo) / Math.max(hi - lo, 1);
      if (c.speed >= hi) { gearMult = 0.08; speedCap = Math.min(speedCap, hi + 1.5); }  // limiter: upshift to go faster
      else if (frac < 0.25) gearMult = clamp(0.7 + frac * 1.2, 0, 1);   // mild bog at low revs: downshift for best punch
    }
  }

  // --- integrate speed ---
  // AI always drives; the player holds GAS unless auto-throttle is on (then the
  // car accelerates on its own and braking still takes over below).
  // Suppress auto-throttle while wallT > 0 (just bounced off a wall) so the car
  // doesn't immediately re-pin itself: the player has to steer clear first.
  const wallPinned = c.isPlayer && (c.wallT || 0) > 0;
  const onThrottle = c.isPlayer ? ((autoThrottle() && !wallPinned) || (_testInput ? !!_testInput.throttle : Input.throttle())) : true;
  if (braking) {
    if (c.speed > 0) {
      c.speed = Math.max(0, c.speed - BRAKE * (c.isPlayer ? playerMods.braking : 1) * dt);
    } else if (c.isPlayer && state === "race") {
      // Stopped and still braking: crawl backwards so the player can ease off a
      // wall or re-aim after a spin. Capped slow; throttle drives forward again.
      c.speed = Math.max(REVERSE_MAX, c.speed - REVERSE_ACCEL * dt);
    }
    c.energy = Math.min(1, c.energy + REGEN * 1.6 * dt);
  } else if (!onThrottle) {
    // coasting: gentle engine-braking/drag, plus a little energy recovery
    c.speed = Math.max(0, c.speed - COAST_DRAG * dt);
    c.energy = Math.min(1, c.energy + REGEN * dt);
  } else {
    const a = (ACCEL * PACE * (c.isPlayer ? playerMods.accel : 1) * clamp(1 - c.speed / vmax, 0, 1) * gearMult + deploy) * (state === "race" ? 1 : 0);
    c.speed = Math.min(speedCap, c.speed + a * dt);
    if (c.speed < vmax * 0.5) c.energy = Math.min(1, c.energy + REGEN * dt);
  }
  // --- slope gravity: climbs gently bleed speed, descents gently feed it back.
  // slopeSin is the road tangent's vertical component (+uphill / -downhill).
  // Two guards so elevation never feels wrong: a descent can NEVER push you past
  // your own top speed (uncapped overspeed used to fling the car off at the bottom
  // of a hill), and the pull is magnitude-capped so a steep ramp can't act like an
  // invisible wall. Race-only so the grid doesn't creep during the countdown.
  if (state === "race" && slopeSin) {
    const a = clamp(-GRAVITY_SLOPE * slopeSin, -ACCEL * 0.5, ACCEL * 0.5);   // m/s^2
    if (a < 0) {                                   // uphill: gentle bleed
      if (c.speed > 0) c.speed = Math.max(0, c.speed + a * dt);
    } else {                                        // downhill: feed, with a small
      // overspeed margin so a long descent actually gives you something (a hard
      // clamp to vmax made steep downhills feel inert once at pace).
      c.speed = Math.min(vmax * 1.06, c.speed + a * dt);
    }
  }
  if (c.isPlayer) {
    const gearSpeed = Math.max(0, c.speed);   // gearbox readout ignores reverse crawl
    if (!gearsManual()) {
      const ng = naturalGear(gearSpeed);
      // auto upshift/downshift cue: same shift sound as manual when the box changes
      if (ng !== c.gear && state === "race" && soundOn) GameAudio.shift(ng > c.gear);
      c.gear = ng;
    }
    c.rpm = rpmFor(c.gear, gearSpeed);
  }

  // Kerb vs off-track: a kerb sits just outside the road edge and is DRIVABLE
  // (rumble + a little grip loss), whereas going past the edge with no kerb is
  // grass/run-off. So detect the kerb first and exclude it from "offroad".
  c.onKerb = Tracks.onKerb(track, c.s, c.x) > 0;

  // --- offroad ---
  c.offroad = Math.abs(c.x) > hw && !c.onKerb;
  if (c.offroad) {
    const offDepth = clamp((Math.abs(c.x) - hw) / 5, 0, 1);
    if (c.speed > 0) c.speed = Math.max(GRASS_V * 0.6, c.speed - (20 + offDepth * 28) * dt);
    c.offT += dt;
    if (c.offT > 1.2) {
      c.offT = -2;   // grace before next count
      c.cuts++;
      // Penalty applies to EVERY car (it feeds race classification) so the AI
      // can't cut corners for free; only the player gets the on-screen cues.
      if (c.cuts >= 4 && c.penalty === 0) {
        c.penalty = 5;
        if (c.isPlayer) { announce("+5s TRACK LIMITS PENALTY", 2); if (soundOn) GameAudio.penalty(); }
      } else if (c.cuts < 4 && c.isPlayer) {
        announce("TRACK LIMITS " + c.cuts + "/4", 1.2);
        if (soundOn) GameAudio.offtrack();
      }
    }
  } else if (c.offT > 0) c.offT = Math.max(0, c.offT - dt);

  // --- kerbs (drivable, unlike walls): riding one rumbles and costs a little
  // grip + speed, but you can stay on it. Distinct from going off into grass.
  if (c.onKerb) {
    c.speed -= 6 * dt;                       // slight scrub
    if (c.isPlayer) {
      shake = Math.max(shake, 0.3);          // continuous light rumble via shake
      c.kerbSndT = (c.kerbSndT || 0) - dt;
      if (soundOn && c.kerbSndT <= 0) { GameAudio.rumble(); c.kerbSndT = 0.07; }
      if ((c.kerbHapT = (c.kerbHapT || 0) - dt) <= 0) { if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} } Input.rumble(0.25, 90); c.kerbHapT = 0.12; }
    }
  }

  // --- lateral ---
  let steer;
  if (c.isPlayer) {
    steer = _testInput ? (_testInput.steer ?? 0) : Input.steer();
    if (!_testInput && Input.tiltActive()) steer *= TILT_OUTPUT_SCALE;
  }
  else {
    const kA = Tracks.curvature(track, wrapS(c.s + clamp(c.speed * 0.7, 18, 70)));
    // partly follow the racing line, partly hold the car's own lane, so the
    // field fans out across the track rather than collapsing onto one line.
    // Apex is on the INSIDE = -sign(k) (k>0 curves toward screen-left, so the
    // inside is -x); the racing line aims there.
    const racingLine = clamp(-kA * 130, -0.62, 0.62) * hw;
    const targetX = clamp(racingLine * 0.55 + c.lane * (hw - 1.2), -(hw - 1.0), hw - 1.0);
    // Overtake: if a slower car is blocking our lane ahead, ease toward the side
    // with more room to pass. Collision-aware — the move is scaled down if that
    // side is also tight (a car alongside or a wall), so we don't dive into a
    // gap that isn't there. Uses the prog-based blocker, immune to rank swaps.
    let overtake = 0;
    if (blocker && blocker.speed < c.speed + 4 && blockerGap < 14) {
      const side = roomR >= roomL ? 1 : -1;
      const need = side > 0 ? roomR : roomL;
      overtake = side * lerp(0.6, 2.2, clamp(1 - blockerGap / 14, 0, 1)) * clamp(need / 2.4, 0, 1);
    }
    // Stuck recovery: if we've been wedged/slow, commit hard to dig out. Pick the
    // clearly-freer side, but when both sides are similar fall back to the car's
    // own lane sign so a piled-up group fans out BOTH ways instead of all diving
    // the same direction (and off the track).
    const freer = roomR - roomL;
    const unstuckSide = Math.abs(freer) > 1 ? (freer > 0 ? 1 : -1) : (c.lane >= 0 ? 1 : -1);
    const unstuck = unstuckActive ? unstuckSide * 2.6 : 0;
    // Proactive lateral separation: drive toward a minimum side-by-side gap so
    // the field settles into clean, non-overlapping spacing instead of pulling
    // onto one line, overlapping, and bouncing (the side-to-side vibration).
    // Push is proportional to how far INSIDE the min gap a neighbour is, so it
    // ramps up only when too close and fades to nothing once spaced — stable, no
    // oscillation, and it doesn't fight the collision push (same direction).
    const MIN_GAP = 2.8;
    let sep = 0;
    for (let j = 0; j < ranked.length; j++) {
      const o = ranked[j];
      if (o === c) continue;
      const dp = Math.abs(o.prog - c.prog);
      if (dp > 6.5) continue;                 // only cars roughly alongside
      const dx = c.x - o.x, adx = Math.abs(dx);
      const deficit = MIN_GAP - adx;
      if (deficit <= 0) continue;             // already spaced — leave alone
      sep += (dx >= 0 ? 1 : -1) * deficit * (1 - dp / 6.5);
    }
    sep = clamp(sep, -2.6, 2.6);              // metres of separation bias
    // clamp the combined target to the drivable surface so overtake/unstuck/
    // separation biases can never steer the AI off the track or into a wall.
    const desiredX = clamp(targetX + overtake + sep + unstuck, -(hw - 0.5), hw - 0.5);
    let err = desiredX - c.x;
    // Soft deadzone near the target: fade the correction out as the error gets
    // small so the AI stops making tiny frame-to-frame steering corrections
    // around its target — those micro-twitches are what made the nose wobble
    // side to side. Larger errors still get full response.
    if (Math.abs(err) < 0.3) err *= Math.abs(err) / 0.3;
    steer = clamp(err * 0.9, -1, 1);
    // Low-pass the AI steering command itself so it can't reverse frame to frame
    // (the residual "switchiness"). A sustained turn-in passes through; a
    // one-frame flip is filtered. Used for both motion and the visual yaw below.
    if (c.steerSm === undefined) c.steerSm = steer;
    c.steerSm = damp(c.steerSm, steer, 9, dt);
    steer = c.steerSm;
  }
  // Lateral authority scales with speed and is ZERO at a standstill: a car
  // that isn't moving can't be steered sideways, so tilting while stopped no
  // longer slides you around. Full authority by ~65 km/h.
  // At high speed, grip tapers off slightly to model understeer.
  const latFac = clamp(c.speed / 18, 0, 1);
  const gripScale = 1 - clamp((c.speed - 20) / (VMAX - 20), 0, 1) * 0.28;
  const kerbGrip = c.onKerb ? 0.7 : 1;   // riding a kerb loses a little grip
  // Banking: computed once, shared between player and AI so both get grip boost.
  const bankPhys = Tracks.banking(track, c.s, 0);
  const bankRoll = Math.max(bankPhys ? Math.abs(bankPhys.roll) : 0,
                            Math.abs(Tracks.bankAngle(track, c.s)));
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
  if (c.isPlayer) {
    if (c.px == null) {   // init world pos from current Frenet state (first frame)
      c.px = smp.p[0] + smp.r[0] * c.x;
      c.pz = smp.p[2] + smp.r[2] * c.x;
      c.head = Math.atan2(smp.t[0], smp.t[2]);
      c.vLat = 0;
      c.yawRateCur = 0;
    }
    // Fade the lateral model out toward a standstill so a parked car can't be
    // spun by steering (slip angle is undefined at zero speed).
    const sp = clamp(c.speed / 3, 0, 1);
    const shaped = Math.sign(steer) * Math.pow(Math.abs(steer), STEER_EXPO);
    // --- road-wheel steer angle: driver lock (eased a little at speed) + the
    // DRIVING-HELP assist that steers toward the road curvature for you. Both
    // act through the front tyre below, so neither can exceed available grip.
    const lockTaper = Math.max(0.4, 1 - c.speed / STEER_SPEED_REF);
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
    // right / toward the turn"). Full assist on tarmac and kerbs; tapering to
    // zero ~3 m into the grass.
    const offAssistFade = c.offroad ? Math.max(0, 1 - (Math.abs(c.x) - hw) / 3) : 1;
    let yawEase = 1;
    const rNeed = c.speed * k;
    if (rNeed !== 0) {
      const ratio = (c.yawRateCur || 0) / rNeed;   // >1 = rotating faster than needed
      if (ratio > 1) yawEase = clamp(1 - (ratio - 1) * 0.6, 0.3, 1);
    }
    const assistDelta = -ROAD_FOLLOW * (WHEELBASE + ASSIST_KUS * c.speed * c.speed * brakeFade) * k * yawEase * offAssistFade;
    const delta = clamp(driverDelta + assistDelta, -0.7, 0.7);
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
    const axEstTarget = braking ? -BRAKE
      : (onThrottle ? DEPLOY_A * clamp(1 - c.speed / Math.max(vmax, 1), 0, 1) : -COAST_DRAG);
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
    // --- combined slip (traction circle): grip already spent braking or
    // accelerating is unavailable for cornering. axEstSm is the smoothed
    // longitudinal accel (m/s²) computed above for weight transfer; the friction
    // ellipse drops lateral grip by sqrt(1 - (axUsed/LONG_GRIP)²). So braking
    // hard mid-corner understeers wide, while trail-braking (easing off as you
    // turn in) progressively returns grip to the front tyres and rotates the car.
    // Weather thins the longitudinal budget too, so braking bites grip in the wet.
    const axFrac = Math.min(1, Math.abs(c.axEstSm ?? 0) / (LONG_GRIP * gripMult()));
    const slipFactor = Math.sqrt(Math.max(0, 1 - axFrac * axFrac));
    // --- friction limit per axle (the grip circle). Everything scales with the
    // same surface/weather grip the rest of the sim uses.
    const muBase = LAT_MAX * PLAYER_GRIP * gripScale * kerbGrip * gripMult() * playerMods.cornering * bankMu * (1 + vertLoad) * slipFactor;
    const muF = Math.max(0.5, muBase * loadF * FRONT_GRIP);
    const muR = Math.max(0.5, muBase * loadR * (1 - DRIFT * 0.55));
    const csR = CS_REAR * (1 - DRIFT * 0.40);            // looser rear also softens its stiffness
    // --- slip angles: each axle's lateral travel (body frame) vs its forward
    // travel, minus the steer it's pointed at. vx is floored so the atan stays
    // well-conditioned at low speed.
    const vx = Math.max(c.speed, 4);
    const slipF = Math.atan2((c.vLat || 0) + af * (c.yawRateCur || 0), vx) - delta;
    const slipR = Math.atan2((c.vLat || 0) - ar * (c.yawRateCur || 0), vx);
    // Soft-saturating lateral tyre force (accel units): linear slope = stiffness
    // near centre, smoothly capped at the friction limit — how real tyres behave
    // and far more controllable on a noisy tilt signal than a hard clamp.
    const tyre = (cs, a, mu) => -mu * Math.tanh(cs * a / mu);
    const Fyf = tyre(CS_FRONT, slipF, muF) * sp;
    const Fyr = tyre(csR, slipR, muR) * sp;
    const cosD = Math.cos(delta);
    // --- rigid-body equations of motion (per unit mass). kz2 = yaw inertia/mass.
    const ay = Fyf * cosD + Fyr;                         // body lateral accel
    const kz2 = af * ar * YAW_INERTIA;                   // yaw inertia / mass (scaled)
    // Under hard braking the front axle is heavily loaded and the rear goes light,
    // so the yaw moment (af·Fyf − ar·Fyr) drives the nose into the corner faster
    // than the baseline damping can check — that's the "snap to the inside" on a
    // high-speed stop. Scale yaw damping up with braking effort so the rotation is
    // arrested at the limit; gentle/trail braking (small decel) is barely affected,
    // preserving the rotation that helps the car turn in.
    const brakeYawDamp = 1 + 1.4 * clamp(-(c.axEstSm ?? 0) / BRAKE, 0, 1);
    const rdot = (af * Fyf * cosD - ar * Fyr) / kz2 - YAW_DAMP * brakeYawDamp * (c.yawRateCur || 0);
    c.vLat = clamp((c.vLat || 0) + (ay - c.speed * (c.yawRateCur || 0)) * dt, -40, 40);
    c.yawRateCur = clamp((c.yawRateCur || 0) + rdot * dt, -4, 4);
    // Increasing head = CCW / left; +yaw rate = nose right, so SUBTRACT.
    c.head -= c.yawRateCur * dt;
    const fx = Math.sin(c.head), fz = Math.cos(c.head);
    // world velocity = forward + lateral slip (perp = (fz, -fx) = +right)…
    const vWx = c.speed * fx + c.vLat * fz;
    const vWz = c.speed * fz - c.vLat * fx;
    // …advance (s, x) by projecting that velocity straight onto the local road
    // frame: tangent → arc-length progress, right → lateral. Same first-order step
    // the old code took, minus the world-point round-trip — no Tracks.project()
    // search to snap progress onto the wrong leg at a hairpin, and (s, x) can never
    // desync from a separate world position.
    let tX = smp.t[0], tZ = smp.t[2]; const tL = Math.hypot(tX, tZ) || 1; tX /= tL; tZ /= tL;
    let rX = smp.r[0], rZ = smp.r[2]; const rL = Math.hypot(rX, rZ) || 1; rX /= rL; rZ /= rL;
    c._prevS = c.s;
    c.s = wrapS(c.s + (vWx * tX + vWz * tZ) * dt);   // progress = velocity · tangent
    c.x += (vWx * rX + vWz * rZ) * dt;               // lateral  = velocity · right
    steer = clamp(shaped, -1, 1);   // steer vis = driver input only, not assist
    if (raceLineAssist !== 0) {
      const sLook = wrapS(c.s + clamp(c.speed * 0.6, 12, 50));
      // Racing line is on the inside = -sign(k); PULL eases the car toward it.
      const lineX = clamp(-Tracks.curvature(track, sLook) * 130, -0.62, 0.62) * hw;
      c.x += (lineX - c.x) * raceLineAssist * 2.2 * latFac * dt;
    }
  } else {
    // While rubbing another car (contactT>0) the AI goes compliant: it stops
    // driving hard back to its racing line, so a player leaning on it can
    // actually move it sideways instead of bouncing off a rigid, on-rails line.
    const give = (c.contactT > 0) ? 0.4 : 1;
    c.x += steer * STEER_VMAX * latFac * gripScale * kerbGrip * gripMult() * bankMu * give * dt;
  }
  // set skid intensity once per frame (used by audio and by visual marks)
  if (c.isPlayer) {
    c.skidIntensity = c.offroad ? 0.5
      : clamp(Math.abs(k) * c.speed * 0.05 - 0.35, 0, 1);
  }
  // wall
  // The driving boundary is per-side and derived from where solid barriers were
  // actually placed (Tracks.wallAt), so the car always stops just before a model
  // instead of clipping through it — consistent across street and open circuits.
  const wallR = Tracks.wallAt(track, c.s, 1);
  const wallL = Tracks.wallAt(track, c.s, -1);
  if (c.x > wallR || c.x < -wallL) {
    const into = c.x > wallR ? 1 : -1;          // +1 = hit right wall, -1 = left
    c.x = into > 0 ? wallR : -wallL;
    if (c.isPlayer) {
      // Slide along the barrier instead of stopping dead. Decompose the car's
      // heading into the part running ALONG the wall (kept) and the part driving
      // INTO it (killed): a shallow scrape barely slows you and you keep sliding,
      // a head-on hit scrubs hard. The nose is rotated toward the wall tangent so
      // the car runs parallel rather than re-pinning every frame.
      Tracks.sample(track, c.s, smp);
      const tHead = Math.atan2(smp.t[0], smp.t[2]);
      let rel = c.head - tHead;
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      const noseIn = into > 0 ? rel > 0 : rel < 0;        // nose pointing into wall?
      const incidence = Math.min(1, Math.abs(Math.sin(rel)));  // 0 graze … 1 head-on
      if (c.vLat) c.vLat = 0;                             // slip into the wall is gone
      if (noseIn) {
        // first-frame impact: lose only the normal component — a graze is nearly
        // free, a head-on hit bites hard.
        if (!c.wasOnWall) c.speed *= 1 - incidence * (track.street ? 0.5 : 0.28);
        // straighten the nose toward the wall tangent so the car slides along it
        c.head -= rel * Math.min(1, (4 + incidence * 8) * dt);
        if (track.street && c.collideT <= 0 && incidence > 0.12 && !c.wasOnWall) {
          shake = Math.min(1, shake + 0.1 + incidence * 0.3); c.collideT = 0.35;
          if (soundOn) GameAudio.collision();
          if (navigator.vibrate) { try { navigator.vibrate(Math.round(15 + incidence * 35)); } catch (e) {} }
          if (c.isPlayer) Input.rumble(0.35 + incidence * 0.5, 100);
        }
      }
      // Steering held INTO the barrier while pinned = the wall denies that turn,
      // which scrubs speed — you can't ride the wall for free. `steer` is the
      // driver input (sign = turn direction); `into` is ±1 for the wall side.
      const pushIn = Math.max(0, into * steer);
      if (pushIn > 0.02) {
        c.speed = Math.max(0, c.speed - pushIn * (track.street ? 40 : 16) * dt);
        c.wallT = 0.35;     // brief auto-throttle suppress
      }
      // Nose/steer pointing AWAY = peeling off: speed and heading left alone so
      // the player just drives off the barrier — no sticky pin, no auto-rescue.
    } else {
      // AI has no world-space heading to slide; clamp + gentle scrub.
      c.speed = Math.max(0, c.speed - (track.street ? 24 : 12) * dt);
    }
    c.wasOnWall = true;
  } else {
    c.wasOnWall = false;
    if (c.isPlayer) c.wallT = Math.max(0, (c.wallT || 0) - dt);
  }
  // Re-sample at the NEW c.s and refresh the debug px/pz mirror from the
  // authoritative (s, x); also gives the yawVis below the tangent at the car's
  // current position.
  if (c.isPlayer && c.px != null) {
    Tracks.sample(track, c.s, smp);
    c.px = smp.p[0] + smp.r[0] * c.x;
    c.pz = smp.p[2] + smp.r[2] * c.x;
  }
  c.steerVis = damp(c.steerVis, steer, 10, dt);
  // Visual nose yaw. The player uses its REAL heading relative to the track
  // tangent, so the body visibly points where the car is actually aimed (turn-in,
  // understeer, a slide) instead of just echoing the stick. AI cars have no world
  // heading, so they lean from steer input + corner curvature (k>0 curves toward
  // screen-left, nose yaws toward -x — hence the negative sign).
  let yawTarget;
  if (c.isPlayer && c.head != null) {
    let psi = Math.atan2(smp.t[0], smp.t[2]) - c.head;   // + = nose turned right (+x)
    while (psi > Math.PI) psi -= 2 * Math.PI;
    while (psi < -Math.PI) psi += 2 * Math.PI;
    yawTarget = clamp(psi, -0.7, 0.7);
  } else {
    yawTarget = c.steerVis * 0.35 + clamp(-k * c.speed * 0.14, -0.28, 0.28);
  }
  c.yawVis = damp(c.yawVis, yawTarget, 6, dt);
  // Pitch animation: nose lifts under throttle (rear squat), dives under braking.
  // Stored so the render loop can apply it without re-evaluating throttle/brake state.
  const pitchTarget = c.isPlayer
    ? (braking ? 0.018 : (onThrottle ? -0.010 : 0))
    : (clamp(-k * c.speed * 0.002, -0.012, 0.012));   // AI: subtle pitch through corners
  c.pitchVis = damp(c.pitchVis ?? 0, pitchTarget, 5, dt);
  c.collideT = Math.max(0, c.collideT - dt);
  c.contactT = Math.max(0, (c.contactT || 0) - dt);

  // --- advance along track ---
  // Player s was advanced by velocity·tangent above; AI advances by speed*dt in Frenet.
  const oldS = c.isPlayer ? (c._prevS ?? c.s) : c.s;
  if (!c.isPlayer) c.s = wrapS(c.s + c.speed * dt);
  // Progress is the cumulative arc-length. For the PLAYER, derive it from the
  // actual (signed, wrap-aware) change in s — NOT speed*dt — so prog stays exactly
  // coupled to s, and going backwards (a spin/reverse) correctly DECREASES prog
  // instead of cheating progress forward.
  const L = track.total;
  let ds;
  if (c.isPlayer) {
    ds = c.s - oldS;
    if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;   // signed wrap
    c.prog += ds;
  } else {
    ds = c.speed * dt;
    c.prog += ds;
  }
  c.totalT += dt;
  c.lapTime += dt;
  if (timeTrial && c.isPlayer) Ghost.record(c.lapTime, c.s, c.x);
  c.wheelAngle = (c.wheelAngle || 0) + c.speed / 0.34 * dt;
  // line crossing (forward only: ds > 0 prevents backward crossings from incrementing lap)
  if (ds > 0 && oldS > track.total * 0.5 && c.s < track.total * 0.5) {
    c.lap++;
    if (c.lap > 1) {
      const lapDone = c.lapTime;
      c.lastLap = lapDone;
      if (lapDone < c.best) c.best = lapDone;
      if (c.isPlayer && soundOn) GameAudio.lap();
      if (c.isPlayer && timeTrial) onTTLap(lapDone);
    }
    c.lapTime = 0;
    if (c.isPlayer) { sectorIdx = 0; sectorStartT = 0; }
    if (c.isPlayer && c.lap === lapsTarget) announce("FINAL LAP", 1.6);
    if (c.lap > lapsTarget) {
      c.finished = true;
      c.finishT = raceT;
      if (c.isPlayer) announce("FINISH!", 2);
    }
  }

  // Sector detection: thirds of track
  if (c.isPlayer && state === "race" && track) {
    const sFrac = c.s / track.total;
    const newSector = sFrac < 1/3 ? 0 : sFrac < 2/3 ? 1 : 2;
    if (newSector !== sectorIdx) {
      if (sectorIdx < newSector || (sectorIdx === 2 && newSector === 0)) {
        // completed the current sector
        const elapsed = c.lapTime - sectorStartT;
        const prevSector = sectorIdx;
        sectorLast[prevSector] = elapsed;
        if (elapsed < sectorBests[prevSector]) sectorBests[prevSector] = elapsed;
        const delta = elapsed - (sectorBests[prevSector] < Infinity ? sectorBests[prevSector] : elapsed);
        if (elapsed >= 2) {
          const sign = delta <= 0 ? "▼ S" : "▲ S";
          announce(sign + (prevSector + 1) + " " + elapsed.toFixed(3), 1.5);
        }
      }
      sectorIdx = newSector;
      sectorStartT = c.lapTime;
    }
  }

  // --- wrong-way + auto-rescue (player only) ---
  if (c.isPlayer && state === "race" && !c.finished) {
    // Moving backwards along the track at speed = going the wrong way. (A slow
    // reverse crawl to recover off a wall is fine and does NOT trip this.)
    if (ds < -0.03 && c.speed > 15) c.wrongT = Math.min(2, (c.wrongT || 0) + dt);
    else c.wrongT = Math.max(0, (c.wrongT || 0) - dt * 2);
    c.wrongWay = c.wrongWay ? c.wrongT > 0.15 : c.wrongT > 0.4;
    if (c.wrongWay && (c.wrongCueT = (c.wrongCueT || 0) - dt) <= 0) {
      announce("WRONG WAY", 1.0); c.wrongCueT = 1.0;
    }
    // Auto-rescue: stuck off-track, wrong-way, pinned to a wall, or simply
    // crawling/stopped on-track for too long. The last clause is the catch-all
    // for being WEDGED against a corner barrier (e.g. an inside tyre wall on an
    // incline): on open circuits wall contact doesn't set wallT and a car pinned
    // at |x| < hw isn't "offroad", so without it the car could sit at 0 forever.
    // Only rescue if throttle is actively pressed but the car isn't moving —
    // that's the wedged-against-a-wall case. A player who deliberately parks
    // (lets off gas) is never rescued, regardless of how long they sit still.
    const stoppedOnTrack = onThrottle && c.speed < 3 && raceT > 2 && !(braking && ds < -0.01);
    const stuck = c.offroad || c.wrongWay || (c.speed < 4 && (c.wallT || 0) > 0) || stoppedOnTrack;
    // 4-second grace period AFTER a rescue prevents rapid re-rescue on marginal
    // stuck conditions. Only applies once a rescue has actually happened —
    // (c.rescueLastT || 0) defaulted to 0 and blocked rescue for the first 4 s of
    // every race, so a car stuck from the start was never recovered.
    const rescueGrace = c.rescueLastT != null && raceT < c.rescueLastT + 4;
    if (stuck && !rescueGrace) c.rescueT = (c.rescueT || 0) + dt;
    else c.rescueT = Math.max(0, (c.rescueT || 0) - dt * 1.5);
    if (c.rescueT > 3) { rescuePlayer(c); c.rescueT = 0; }
  } else if (!c.isPlayer && state === "race" && !c.finished) {
    // Lightweight AI rescue: an AI beached in the grass or pinned against a
    // barrier (and NOT just shuffling in a pack — contactT/unstuckActive exclude
    // that) gets put back on the drivable surface after a few seconds, so it
    // can't crawl in a run-off for the rest of the race. AI is kinematic, so the
    // reset just clamps lateral position onto the track and restores some speed.
    const aiStuck = (c.offroad && c.offT > 0.5) ||
      (c.speed < 5 && raceT > 2 && (c.contactT || 0) === 0 && !unstuckActive);
    if (aiStuck) c.rescueT = (c.rescueT || 0) + dt;
    else c.rescueT = Math.max(0, (c.rescueT || 0) - dt * 1.5);
    if (c.rescueT > 4) {
      Tracks.sample(track, c.s, smp);
      c.x = clamp(c.x, -(smp.hw - 1.5), smp.hw - 1.5);   // back onto the track
      c.speed = Math.max(c.speed, 14);
      c.rescueT = 0; c.offT = 0; c.stuckT = 0;
    }
  }
}

// Put the player back on the racing line at its CURRENT progress, facing forward
// at a modest speed — for recovering from a spin, a beached off-track moment, or
// being pinned to a wall. Progress (s/prog/lap) is preserved; only the lateral
// position, heading and slip are reset, and a little speed restored.
function rescuePlayer(c) {
  Tracks.sample(track, c.s, smp);
  c.x = 0; c.xVis = 0;
  c.head = Math.atan2(smp.t[0], smp.t[2]);   // aligned with the track ahead
  c.vLat = 0; c.yawRateCur = 0;
  c.speed = Math.max(c.speed, 16);
  c.px = smp.p[0]; c.pz = smp.p[2];
  c.boostOn = false; c.deploying = false;
  c.wrongT = 0; c.wrongWay = false; c.offT = 0; c.wallT = 0; c.wasOnWall = false; c.rescueT = 0;
  c.rescueLastT = raceT;
  announce("RECOVERED", 1.2);
  if (soundOn) GameAudio.offtrack();
}

// Record a completed time-trial lap: add it to the track's leaderboard tagged
// with the car used, and flag a new record if it takes provisional pole. The
// board persists, so it survives quitting and reloads.
function onTTLap(lapTime) {
  ttLaps.push(lapTime);
  ttBoardAdd(track.def.id, {
    t: lapTime, teamId: player.team.id, code: player.code, name: player.name, ts: Date.now(),
  });
  Ghost.finishLap(lapTime);
  Ghost.startLap();
  if (lapTime < ttRecord) {
    ttRecord = lapTime;
    ttNewRecord = true;
    announce("NEW RECORD " + fmtTime(lapTime), 2);
  }
}

function coast(c, dt) {
  c.speed = Math.max(24, c.speed - 20 * dt);
  c.s = wrapS(c.s + c.speed * dt);
  c.prog += c.speed * dt;
  Tracks.sample(track, c.s, smp);
  const kA = Tracks.curvature(track, wrapS(c.s + 30));
  // Finished cars cruise the inside line (-sign(k)), same convention as the AI.
  c.x = damp(c.x, clamp(-kA * 130, -0.5, 0.5) * smp.hw, 2, dt);
}

// Floodlight set for ANY track (every circuit gets them; the caller only feeds
// them to the shader when the scene is dark — night/dusk/dawn). A light roughly
// every ~24 m (alternating sides) at mast height, capped to the nearest 48 by the
// per-frame cull. Flat [x,y,z, r,g,b, rad, …] septets. Colour, brightness, pool
// size and mast style all vary by circuit character (see floodColor). HDR (>1)
// so the pools bloom.
function floodColor(theme) {
  // tint (relative RGB), HDR intensity, pool radius (m), and `street` = slim
  // lamp-post masts (vs tall flood banks). Per-theme so each circuit reads right.
  switch (theme) {
    case "street_night": return { tint: [0.92, 0.96, 1.08], intensity: 7.6, radius: 30, street: true };  // cool LED white, city
    case "modern":       return { tint: [1.00, 0.98, 0.92], intensity: 7.6, radius: 32, street: true };  // warm-white LED
    case "street_day":   return { tint: [1.10, 1.00, 0.80], intensity: 7.2, radius: 30, street: true };  // warm street lamps (Monaco/Madrid)
    case "desert":       return { tint: [1.28, 1.00, 0.60], intensity: 8.0, radius: 42, street: false }; // warm sodium flood banks
    default:             return { tint: [1.14, 1.06, 0.84], intensity: 8.8, radius: 44, street: false }; // green/classic warm-white
  }
}
function buildTrackLights(track) {
  const lights = [];
  const n = track.n, total = track.total;
  // Guard against a not-yet-complete track (centreline arrays missing): return
  // empty so the caller's rebuild-if-empty retries next frame rather than caching
  // a bad empty result.
  if (!n || !total || !track.px || !track.rx) return lights;
  const ds = total / n;
  const stride = Math.max(1, Math.round(34 / ds));   // denser than before so corners don't fall dark
  const { tint, intensity, radius, street } = floodColor(track.def.theme);
  const height = street ? 9 : 13;   // at the mast-top lens (buildProps masts)
  // Deterministic per-lamp hash in [0,1) so a circuit's lamp pattern is stable.
  const lh = (j) => { const x = Math.sin((j + 1) * 127.13) * 43758.5453; return x - Math.floor(x); };
  let i = 0;
  for (let k = 0; k < n; k += stride, i++) {
    const side = (i % 2 === 0) ? 1 : -1;
    const off = (track.hw[k] + 6) * side;   // matches the floodlight masts (buildProps)
    // Per-lamp VARIANCE: warmth jitter (some sodium-orange, some cool white) and a
    // brightness jitter, so a row of lamps isn't a uniform clone — reads like real
    // street lighting where bulbs age/differ. Deterministic per lamp index.
    const warm = (lh(i) - 0.5) * 0.42;          // -0.21 … +0.21 warm/cool shift
    const bri  = 0.80 + lh(i + 97) * 0.40;      // 0.80 … 1.20 brightness
    const e = intensity * bri;
    lights.push(
      track.px[k] + track.rx[k] * off,
      track.py[k] + height,
      track.pz[k] + track.rz[k] * off,
      Math.max(0, (tint[0] + warm)) * e,
      tint[1] * e,
      Math.max(0, (tint[2] - warm)) * e,
      radius,
    );
  }
  return lights;
}

// Cull the track light set to the nearest 48 to the camera and flatten into
// `frame.lights`. Called each frame only when the session is at night.
const _lightCullBuf = [];
const _lightScaleBuf = [];
function setFrameLights(eye, scale) {
  const src = track._lights;
  if (!src || !src.length) { frame.lights = null; return; }
  // scale may be a scalar (uniform dim) or a [r,g,b] vector (time-of-day brightness
  // + warmth: dim & warm at twilight, full & neutral at deep night).
  const sr = Array.isArray(scale) ? scale[0] : (scale == null ? 1 : scale);
  const sg = Array.isArray(scale) ? scale[1] : sr;
  const sb = Array.isArray(scale) ? scale[2] : sr;
  const count = src.length / 7;
  if (count <= 32) {
    if (sr === 1 && sg === 1 && sb === 1) { frame.lights = src; return; }
    // Scale without mutating the cached set: copy and scale only the rgb channels.
    _lightScaleBuf.length = 0;
    for (let i = 0; i < src.length; i += 7) {
      _lightScaleBuf.push(src[i], src[i+1], src[i+2],
        src[i+3] * sr, src[i+4] * sg, src[i+5] * sb, src[i+6]);
    }
    frame.lights = _lightScaleBuf;
    return;
  }
  // distance-rank: cheap partial selection of the nearest 32
  _lightCullBuf.length = 0;
  for (let i = 0; i < count; i++) {
    const o = i * 7, dx = src[o] - eye[0], dy = src[o + 1] - eye[1], dz = src[o + 2] - eye[2];
    _lightCullBuf.push({ d: dx * dx + dy * dy + dz * dz, o });
  }
  _lightCullBuf.sort((a, b) => a.d - b.d);
  const out = [];
  for (let i = 0; i < 32; i++) {
    const o = _lightCullBuf[i].o;
    out.push(src[o], src[o+1], src[o+2], src[o+3] * sr, src[o+4] * sg, src[o+5] * sb, src[o+6]);
  }
  frame.lights = out;
}

// ---------- render ----------
// Reusable camera-vantage solver. For a player camera `mode` with the car at arc
// position `s`, lateral `x`, speed `spd` (m/s) and wall-clock `now` (ms, for the
// orbiting cinematic cam), returns { eye, tgt, fov } — the exact framing render()
// drives the live camera with. Centralising it means snapCam() (clean first frame)
// and the previewCam() debug hook frame EVERY mode the same way, not just the three
// chase/cockpit/hood cases the old snapCam hand-rolled. `extra` carries player-only
// spice — { bankDy (banking lift), deploy (ERS FOV kick), slipLat (lateral slip m/s,
// for the drift cam) } — all optional and treated as 0 when absent.
const cvA = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const cvB = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
function camVantage(mode, s, x, spd, now, extra) {
  extra = extra || {};
  const bankDy = extra.bankDy || 0;
  const dep = extra.deploy ? 1 : 0;
  const spN = clamp(spd / VMAX, 0, 1);
  Tracks.sample(track, wrapS(s), cvA);
  const p = [cvA.p[0] + cvA.r[0] * x, cvA.p[1] + bankDy, cvA.p[2] + cvA.r[2] * x];
  const t = cvA.t, r = cvA.r;
  // Curved look-ahead: aim at the actual centreline `d` m up the road — it bends
  // with the corner — instead of a straight tangent extrapolation, so the chase
  // and onboard cams look INTO the bend rather than out the side of it. `lat`
  // keeps a fraction of the car's offset so the aim still leads where it's headed.
  const aheadPt = (d, h, lat) => {
    Tracks.sample(track, wrapS(s + d), cvB);
    const lx = lat || 0;
    return [cvB.p[0] + cvB.r[0] * lx, cvB.p[1] + (h || 0), cvB.p[2] + cvB.r[2] * lx];
  };
  // Curvature of the bend we're approaching (speed-scaled look-ahead) — drives the
  // broadcast cams to the OUTSIDE of the corner so they shoot across the apex.
  const kA = Tracks.curvature(track, wrapS(s + lerp(15, 45, spN)));
  let eye, tgt, fov;
  if (mode === "cockpit" || mode === "hood") {
    const eyeFwd = mode === "cockpit" ? 0.2 : 1.9;   // hood sits out on the nose
    const eyeUp  = mode === "cockpit" ? 1.15 : 0.78;
    eye = [p[0] + t[0] * eyeFwd, p[1] + eyeUp, p[2] + t[2] * eyeFwd];
    tgt = aheadPt(30, eyeUp + 1.5, x * 0.6);
    fov = lerp(64, 78, spN) + dep * 3;               // wider = faster feel
  } else if (mode === "bumper") {
    // Road-level splitter cam: mounted at the very front wing, ahead of the
    // bodywork, skimming the tarmac. Lower and wider than HOOD — a visceral
    // ground-rush view. (Eye sits forward of the nose so the car never occludes;
    // the player car is also not drawn for this mode — see hidePlayerCar.)
    eye = [p[0] + t[0] * 2.7, p[1] + 0.33 + bankDy, p[2] + t[2] * 2.7];
    tgt = aheadPt(24, 0.65, x * 0.5);
    fov = lerp(72, 88, spN) + dep * 3;
  } else if (mode === "overhead") {
    eye = [p[0] - t[0] * 9, p[1] + 42, p[2] - t[2] * 9];
    tgt = [p[0] + t[0] * 12, p[1], p[2] + t[2] * 12];
    fov = 46;
  } else if (mode === "heli") {
    // Broadcast helicopter — now corner-aware: hovers on the OUTSIDE of the
    // upcoming bend so it looks across the apex (was always camera-right).
    Tracks.sample(track, wrapS(s - 26), cvB);
    const sgn = kA > 0.001 ? -1 : kA < -0.001 ? 1 : 1;
    eye = [cvB.p[0] + cvB.r[0] * 18 * sgn, cvB.p[1] + 21 + bankDy, cvB.p[2] + cvB.r[2] * 18 * sgn];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = 36 + dep * 2;
  } else if (mode === "reverse") {
    eye = [p[0] + t[0] * 5.5, p[1] + 1.35, p[2] + t[2] * 5.5];
    tgt = [p[0] - t[0] * 26, p[1] + 0.9, p[2] - t[2] * 26];
    fov = lerp(60, 72, spN);
  } else if (mode === "side") {
    // TV trackside: sits on the OUTSIDE of the bend looking across the apex.
    const sgn = kA > 0.002 ? 1 : kA < -0.002 ? -1 : 1;
    eye = [p[0] + r[0] * sgn * 25, p[1] + 5.5, p[2] + r[2] * sgn * 25];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = 44;
  } else if (mode === "cinematic") {
    // Outside-of-corner cinematic that gently breathes its angle instead of doing
    // full disorienting loops. Auto-picks the outside of the bend; on a straight it
    // slowly drifts a three-quarter angle. Angle is measured around the car from
    // the track tangent, so the framing reads consistently corner to corner.
    const base = kA === 0 ? 0.6 : (kA > 0 ? -1 : 1) * 1.15;
    const a = base + Math.sin(now * 0.00022) * 0.5;
    const od = 15;
    const dir = [Math.cos(a) * t[0] + Math.sin(a) * r[0], 0, Math.cos(a) * t[2] + Math.sin(a) * r[2]];
    eye = [p[0] + dir[0] * od, p[1] + 6.5, p[2] + dir[2] * od];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = lerp(50, 60, spN);
  } else if (mode === "low") {
    Tracks.sample(track, wrapS(s - 10), cvB);
    const cx = x * 0.3;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + 0.45 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.6, p[2]];
    fov = lerp(55, 68, spN);
  } else if (mode === "tcam") {
    eye = [p[0] - t[0] * 0.15, p[1] + 1.3, p[2] - t[2] * 0.15];
    tgt = aheadPt(25, 0.9, x * 0.5);
    fov = 40 + dep * 2;
  } else if (mode === "rear") {
    eye = [p[0] - t[0] * 0.5, p[1] + 0.85, p[2] - t[2] * 0.5];
    tgt = [p[0] - t[0] * 22, p[1] + 0.8, p[2] - t[2] * 22];
    fov = lerp(62, 76, spN) + dep * 2;
  } else if (mode === "drift") {
    // Action chase that swings to the OUTSIDE of the slide so the car's flank faces
    // camera under oversteer, then settles directly behind once the car hooks up.
    const slipN = clamp((extra.slipLat || 0) / 8, -1, 1);
    Tracks.sample(track, wrapS(s - 6.2), cvB);
    const cx = x * 0.5 - slipN * 5.5;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + 2.4 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.75, p[2]];
    fov = lerp(55, 70, spN) + dep * 3;
  } else {
    // chase / far — anchored a FIXED arc-distance behind so the car stays a constant
    // readable size; the target leads into the curved road ahead.
    const far = mode === "far";
    const back  = far ? 10.5 : 5.8;
    const eyeUp = far ? 4.2 : 2.1;
    Tracks.sample(track, wrapS(s - back), cvB);
    const cx = x * 0.5;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + eyeUp + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = aheadPt(far ? 9 : 6, far ? 1.0 : 0.7, x * 0.4);
    fov = lerp(52, 66, spN) + (far ? 4 : 0) + dep * 3;
  }
  return { eye, tgt, fov };
}

function render(dt) {
  if (headlessMode) return;
  GLX.resize();
  if (!track) { GLX.begin({ viewProj: M4.ident(), eye: [0,0,0], sunDir: [0,1,0], sunColor: [1,1,1], ambientGround: [0.2,0.2,0.2], ambientSky: [0.4,0.4,0.5], fogColor: [0.04,0.04,0.06], fogDensity: 0.002 }); GLX.present(); return; }

  // camera
  let eyeT, tgtT, fovT;
  if (state === "menu" || state === "select") {
    // slow flyby
    const s = wrapS((performance.now() * 0.012) % track.total);
    Tracks.sample(track, s, smp);
    eyeT = [smp.p[0] + smp.r[0] * 26 , smp.p[1] + 17, smp.p[2] + smp.r[2] * 26];
    tgtT = [smp.p[0] + smp.t[0] * 40, smp.p[1] + 2, smp.p[2] + smp.t[2] * 40];
    fovT = 58;
  } else {
    if (!player) return;
    // Interpolated arc/lateral position so the chase anchor tracks the car
    // smoothly between physics steps (no high-refresh judder).
    const pS = lerpS(player.rPrevS, player.s, renderAlpha);
    const px = (player.rPrevX === undefined) ? player.x
             : player.rPrevX + (player.x - player.rPrevX) * renderAlpha;
    Tracks.sample(track, pS, smp);
    // ride the bank with the car so the camera doesn't sink into the banked road
    const bankCam = Tracks.banking(track, pS, px);
    const bankDy = bankCam ? bankCam.dy : 0;
    const mode = CAM_MODES[camMode].id;
    // All per-mode framing lives in camVantage() so the live cam, snapCam() and the
    // previewCam() debug hook stay identical. bankDy keeps the eye riding the bank.
    const vant = camVantage(mode, pS, px, player.speed, performance.now(), {
      bankDy, deploy: player.deploying, slipLat: player.vLat || 0,
    });
    eyeT = vant.eye; tgtT = vant.tgt; fovT = vant.fov;
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.6);
      const amt = shake * shake * 0.9;   // squared: grazes barely move, crashes slam
      eyeT[0] += (Math.random() - 0.5) * amt; eyeT[1] += (Math.random() - 0.5) * amt * 0.7;
      tgtT[0] += (Math.random() - 0.5) * amt * 0.6; tgtT[1] += (Math.random() - 0.5) * amt * 0.6;
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
  // Onboard cams ride ON the car (cockpit/hood/bumper/tcam), so they need very high
  // lambda or the eye lags behind/into the bodywork at speed.
  const racing = state === "race" || state === "count";
  const camId = CAM_MODES[camMode].id;
  const onboard = racing && (camId === "cockpit" || camId === "hood" || camId === "bumper" || camId === "tcam");
  // Just after a cut, ease the external cams in with a gentler lambda so the angle
  // sweeps to its new vantage instead of snapping. Onboard cams ignore it (must lock).
  const cutEase = camCutT > 0 ? (camCutT = Math.max(0, camCutT - dt), 0.4) : 1;
  const lE = onboard ? 40 : (racing ? 14 : 1.6) * cutEase;
  const lT = onboard ? 40 : (racing ? 16 : 10) * cutEase;
  for (let i = 0; i < 3; i++) {
    camEye[i] = damp(camEye[i], eyeT[i], lE, dt);
    camTgt[i] = damp(camTgt[i], tgtT[i], lT, dt);
  }
  camFov = damp(camFov, fovT, onboard ? 4 : 4 * cutEase, dt);

  // Camera roll: lean ~2-4° into corners proportional to lateral slip, like Codemasters F1/GRID
  {
    const slip = player && player.speed > 1 ? (player.vLat || 0) / player.speed : 0;
    camRoll += (clamp(slip, -1, 1) * 0.07 - camRoll) * Math.min(1, dt / 0.15);
  }

  // Debug free camera (set via __apex.view) overrides the chase cam — instant
  // (no damping), uncapped FOV, far plane and fog pushed out — for inspecting
  // whole-track layouts and trackside scenery from any angle.
  let fovY, farPlane = 900;
  if (dbgCam) {
    camEye[0] = dbgCam.eye[0]; camEye[1] = dbgCam.eye[1]; camEye[2] = dbgCam.eye[2];
    camTgt[0] = dbgCam.target[0]; camTgt[1] = dbgCam.target[1]; camTgt[2] = dbgCam.target[2];
    fovY = dbgCam.fov * Math.PI / 180;
    farPlane = dbgCam.far;
  } else {
    // camFov is a vertical FOV. On a wide (landscape) screen a fixed vertical FOV
    // blows the horizontal field out past ~100°, which makes the car look tiny and
    // far away. Cap the horizontal FOV so wide screens zoom in and the car stays a
    // readable size; portrait (narrow) is unaffected.
    fovY = camFov * Math.PI / 180;
    const HFOV_MAX = 86 * Math.PI / 180;
    const fovYCap = 2 * Math.atan(Math.tan(HFOV_MAX / 2) / Math.max(GLX.aspect, 0.0001));
    fovY = Math.min(fovY, fovYCap);
  }

  M4.perspectiveTo(_mProj, fovY, GLX.aspect, 0.1, farPlane);
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
  frame.viewProj = _mVP;
  frame.eye = camEye;

  // Shadow pass — render terrain + road from sun's perspective.
  // Snap the frustum centre to a 15 m grid so the shadow map only re-renders
  // when the camera moves enough to shift the snapped cell.
  if (track) {
    const sd = frame.sunDir;
    const up = Math.abs(sd[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
    const cx = smp.p[0], cy = smp.p[1], cz = smp.p[2];
    const snapX = Math.round(cx / 15) * 15, snapZ = Math.round(cz / 15) * 15;
    if (snapX !== _shadowSnapX || snapZ !== _shadowSnapZ) {
      _shadowSnapX = snapX; _shadowSnapZ = snapZ;
      M4.lookAtTo(_mLView, [snapX + sd[0] * 150, cy + sd[1] * 150, snapZ + sd[2] * 150], [snapX, cy, snapZ], up);
      M4.orthoTo(_mLProj, -70, 70, -70, 70, 1.0, 320);
      M4.mulTo(_mLVP, _mLProj, _mLView);
      GLX.shadowBegin(_mLVP);
      GLX.castShadow(track.meshes.terrain, MAT_IDENT);
      GLX.castShadow(track.meshes.road, MAT_IDENT);
      GLX.castShadow(track.meshes.props, MAT_IDENT);
      GLX.shadowEnd();
    }
  }

  // ── Sky animation & weather FX ──────────────────────────────────────────
  // Advance the render clock regardless of physics freeze so the sky always
  // animates (cloud drift, star twinkle).
  _skyT += dt;
  frameSky.time = _skyT;

  // Moon: use the value set by applyRaceSettings; pass through for default
  // night tracks that didn't go through the explicit raceTimeOfDay branch.
  // (frameSky.moon is already set in applyRaceSettings for non-default modes;
  // here we make sure default+track.night also gets a moon each frame.)
  if (raceTimeOfDay === "default" && track && track.def && track.def.night) {
    frameSky.moon = 0.85;
  }

  // ── Lightning (wet weather only) ─────────────────────────────────────────
  const wet = raceWeather === "wet";
  if (wet && _ltBase) {
    // Count down to the next strike
    _ltNextT -= dt;
    if (_ltNextT <= 0) {
      // Trigger a new flash: intensity 1 → decays at ~8×/s
      _ltFlash = 1.0;
      // Next strike in 4–12 seconds
      _ltNextT = 4 + Math.random() * 8;
    }
    if (_ltFlash > 0.001) {
      // Decay: fast leading edge, then slow dying glow
      _ltFlash *= Math.exp(-8 * dt);
      if (_ltFlash < 0.001) _ltFlash = 0;
    }
    if (_ltFlash > 0) {
      // Spike ambient to a cool blue-white; the decay reads as a natural flash
      const f = _ltFlash;
      frame.ambientSky    = _ltBase.ambientSky.map((v)    => Math.min(1, v + 0.55 * f));
      frame.ambientGround = _ltBase.ambientGround.map((v) => Math.min(1, v + 0.40 * f));
    } else {
      // Restore base ambient so normal ticks aren't tinted
      frame.ambientSky    = _ltBase.ambientSky.slice();
      frame.ambientGround = _ltBase.ambientGround.slice();
    }
  }

  // Floodlights: EVERY track has them (see buildTrackLights); they're fed to the
  // shader whenever the scene is dark enough to read them — night, dusk, or dawn
  // on any circuit, or a night-default track in default mode. In bright day the
  // sun dominates so they're left off (no washed-out daylight pools).
  const _floodActive = raceTimeOfDay === "night" || raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn" ||
    (raceTimeOfDay === "default" && track.def.night);
  if (_floodActive) {
    // Rebuild if empty (not just undefined): a light set built before the track
    // centreline finished is empty; retry until it yields lights. Tracks always
    // produce a full set once complete, so this self-heals in a frame.
    if (!track._lights || track._lights.length === 0) track._lights = buildTrackLights(track);
    // Time-dependent floodlights: brightness + COLOUR ramp with sun elevation.
    // At twilight (sun near/just below horizon) the lamps are dim and WARM, as if
    // freshly switched on / still warming up; by deep night they reach full
    // brightness and cool to their neutral tint. Smooth, no hard dusk/night step.
    const _sy = frame.sunDir ? frame.sunDir[1] : -1;
    const nightF = clamp((0.07 - _sy) / 0.22, 0, 1);   // 0 = sun up, 1 = well below horizon
    const lvl  = 0.34 + 0.66 * nightF;                 // brightness ramp
    const warmth = (1 - nightF);                       // 1 at twilight → 0 deep night
    const floodScale = [lvl * (1 + warmth * 0.14), lvl, lvl * (1 - warmth * 0.22)];
    setFrameLights(camEye, floodScale);
  } else {
    frame.lights = null;
  }

  if (dbgCam) {
    const bf = frame.fogDensity;
    frame.fogDensity = bf * (dbgCam.fog != null ? dbgCam.fog : 0.15);
    GLX.begin(frame);
    frame.fogDensity = bf;
  } else GLX.begin(frame);
  M4.invertTo(_mInvVP, _mVP);
  frameSky.invViewProj = _mInvVP;
  frameSky.lightning = _ltFlash || 0;
  GLX.drawSky(frameSky);

  const night = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night);
  // (`wet` is already declared above in the sky/lightning block)
  // Per-surface materials drive the GGX specular term.
  // Wet weather: rain films lower effective roughness dramatically — road becomes
  // mirror-like, cars and barriers pick up sharper reflections.
  // Base floor first (under everything) — fills the void on street circuits (no
  // terrain ribbon) and the far infield/horizon on open circuits. No detail noise
  // so the huge plane stays flat and recedes into fog.
  if (!hideMeshes.terrain && track.meshes.floor) GLX.draw(track.meshes.floor, MAT_IDENT,
    night ? { emissive: 0.14, roughness: 0.98, specular: 0.05 }
          : { roughness: 0.98, specular: 0.05 });
  if (!hideMeshes.terrain) GLX.draw(track.meshes.terrain, MAT_IDENT,
    night ? { emissive: 0.18, roughness: 0.97, specular: 0.06, detail: 0.35 }
          : { roughness: 0.97, specular: 0.06, detail: 0.35 });
  if (!hideMeshes.road) GLX.draw(track.meshes.road, MAT_IDENT,
    wet   ? (night ? { emissive: 0.06, roughness: 0.14, specular: 0.85, detail: 0.06 }
                   : { roughness: 0.14, specular: 0.85, detail: 0.06 })
          : (night ? { emissive: 0.09, roughness: 0.85, specular: 0.20, detail: 0.22 }
                   : { roughness: 0.85, specular: 0.20, detail: 0.22 }));
  if (!hideMeshes.startline && track.meshes.startline) GLX.draw(track.meshes.startline, MAT_IDENT,
    wet   ? { roughness: 0.16, specular: 0.80, detail: 0 }
          : (night ? { emissive: 0.10, roughness: 0.80, specular: 0.22, detail: 0 }
                   : { roughness: 0.80, specular: 0.22, detail: 0 }));
  // Prop emissive (lit windows / signage / neon) drives how strongly the
  // buildings glow after dark. A full night session goes to full emissive
  // REGARDLESS of the palette's sun elevation — many night palettes keep the sun
  // above the horizon for the sky glow (sunY≈0.25), which previously pinned the
  // ramp near 0.10 and left the glowing-glass towers reading as dark boxes.
  // Dusk/dawn ramp by the (genuinely low) sun elevation; day stays dark.
  const _sunY = frame.sunDir ? frame.sunDir[1] : (night ? -1 : 1);
  const _floodEmit =
    (raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night)) ? 0.55
      : (raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn")
        ? Math.min(0.55, 0.12 + 0.45 * clamp(1 - _sunY * 4, 0, 1))
        : 0;
  if (!hideMeshes.props) GLX.draw(track.meshes.props, MAT_IDENT,
    wet   ? (night ? { emissive: Math.min(0.40, _floodEmit), roughness: 0.55, specular: 0.38 }
                   : { roughness: 0.55, specular: 0.38 })
          : (night ? { emissive: _floodEmit, roughness: 0.85, specular: 0.20 }
                   : { roughness: 0.85, specular: 0.20 }));
  // Building glass: a low-roughness reflective pass so the lit shader mirrors the
  // sky in the windows (real, view-dependent reflection). Only populated for day
  // builds; empty at night (lit windows live in the emissive props mesh).
  if (!hideMeshes.props && track.meshes.glass) GLX.draw(track.meshes.glass, MAT_IDENT,
    { roughness: 0.18, specular: 0.68, metalness: 0.10 });
  if (!hideMeshes.gate) GLX.draw(track.meshes.gate, MAT_IDENT,
    wet ? { roughness: 0.32, metalness: 0.35, specular: 0.65 }
        : { roughness: 0.45, metalness: 0.30, specular: 0.50 });

  // skid marks drawn oldest-first (newest on top). When buffer is full the
  // oldest entry is at skidIdx; before that all live entries are 0..skidActive-1.
  if (skidActive < MAX_SKID) {
    for (let i = 0; i < skidActive; i++) GLX.drawMark(skidMarks[i], 0.6, 2.2);
  } else {
    for (let i = 0; i < MAX_SKID; i++) GLX.drawMark(skidMarks[(skidIdx + i) % MAX_SKID], 0.6, 2.2);
  }

  // cars — skip AI cars more than 550 m of track arc from the player (past fog)
  const hidePlayerCar = !dbgCam && (state === "race" || state === "count") &&
    (CAM_MODES[camMode].id === "cockpit" || CAM_MODES[camMode].id === "bumper");   // don't draw the car you're sitting on/in
  for (const c of cars) {
    if (c.isPlayer && hidePlayerCar) continue;
    if (!c.isPlayer && player) {
      const ds = Math.abs(c.s - player.s);
      if (Math.min(ds, track.total - ds) > 550) continue;
    }
    // Interpolate the arc/lateral position between the last two physics steps so
    // the car renders smoothly between fixed steps (no judder on high-refresh).
    const cS = lerpS(c.rPrevS, c.s, renderAlpha);
    const cX = (c.rPrevX === undefined) ? c.x
             : c.rPrevX + (c.x - c.rPrevX) * renderAlpha;
    Tracks.sample(track, cS, smp2);
    // Smooth RENDERED lateral position. Physics c.x stays exact (used for walls,
    // collisions, racing-line assist). Only the mesh position is low-passed so
    // Frenet-projection noise doesn't appear as visible left-right wobble.
    // Player rate 30 (≈0.1 s lag) is fast enough to feel instant but cuts the
    // per-frame projection noise; AI rate 16 kills the harsher collision jitter.
    if (c.xVis === undefined) c.xVis = cX;
    else c.xVis = damp(c.xVis, cX, c.isPlayer ? 30 : 16, dt);
    let renderX = c.xVis;
    // banking: sit the car ON the banked surface (raise it by the local lift)
    // instead of the flat centreline, so it doesn't float/sink in the corner.
    const bankC = Tracks.banking(track, cS, renderX);
    tmpP[0] = smp2.p[0] + smp2.r[0] * renderX;
    tmpP[1] = smp2.p[1] + (bankC ? bankC.dy : 0);
    tmpP[2] = smp2.p[2] + smp2.r[2] * renderX;
    // yaw the forward/right around up by yawVis
    const cy = Math.cos(c.yawVis || 0), sy = Math.sin(c.yawVis || 0);
    for (let i = 0; i < 3; i++) {
      tmpF[i] = smp2.t[i] * cy + smp2.r[i] * sy;
      tmpR[i] = smp2.r[i] * cy - smp2.t[i] * sy;
    }
    tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
    tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
    tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
    // Pitch: rotate forward+up around the right axis by pitchVis (positive = nose up).
    // This gives throttle-squat (nose lifts) and brake-dive (nose dips) without
    // moving the contact point — it's purely a mesh animation.
    if (c.pitchVis) {
      const cp = Math.cos(c.pitchVis), sp = Math.sin(c.pitchVis);
      for (let i = 0; i < 3; i++) {
        const f = tmpF[i], u = tmpU[i];
        tmpF[i] = f * cp + u * sp;
        tmpU[i] = u * cp - f * sp;
      }
    }
    // Cornering lean (render-only): roll the chassis toward the OUTSIDE of the
    // corner, proportional to lateral g, so the car visibly leans into turns like
    // a real F1 car. The body already follows the road slope via the tangent
    // basis, so only roll (not gradient pitch) is added here. Player uses its real
    // centripetal accel (speed·yawRate); AI uses curvature·speed².
    // (curvature sign is opposite the yaw-rate sign — see the racing-line code,
    // racingLine = -k·130 toward the inside — so the AI term is negated to lean
    // outward like the player.)
    const aLat = c.isPlayer ? c.speed * (c.yawRateCur || 0)
                            : -c.speed * c.speed * Tracks.curvature(track, c.s);
    const rollTgt = clamp(aLat / LAT_MAX, -1, 1) * BODY_ROLL_MAX;
    c.rollVis = (c.rollVis === undefined) ? rollTgt : damp(c.rollVis, rollTgt, 6, dt);
    // roll the right/up basis about the forward axis: road bank + cornering lean.
    const rollTot = (bankC && bankC.roll ? bankC.roll : 0) + (c.rollVis || 0);
    if (rollTot) {
      const cr = Math.cos(rollTot), sr = Math.sin(rollTot);
      for (let i = 0; i < 3; i++) {
        const r = tmpR[i], u = tmpU[i];
        tmpR[i] = r * cr + u * sr;
        tmpU[i] = u * cr - r * sr;
      }
    }
    basisMat(tmpR, tmpU, tmpF, tmpP, tmpMat);
    GLX.drawShadow(tmpMat, 2.4, 5.8);
    // Glossy automotive paint; wet adds a water film (sharper highlights, lower roughness).
    const paint = wet
      ? (night ? PAINT_WET_NIGHT : PAINT_WET_DAY)
      : (night ? PAINT_DRY_NIGHT : PAINT_DRY_DAY);
    // Player: body-only mesh + animated (spinning/steering) wheels. Others (and
    // the player when a glb model is loaded) draw the full mesh with baked wheels.
    const body = c.isPlayer ? playerBodyMesh(c.team) : null;
    if (body) {
      GLX.draw(body, tmpMat, paint);
      drawPlayerWheels(c, tmpMat, dt, { roughness: 0.85, metalness: 0.0, specular: 0.12, emissive: night ? 0.12 : 0 });
    } else {
      GLX.draw(teamMesh(c.team), tmpMat, paint);
    }
    if (c.isPlayer && state === "race") {
      const skid = c.skidIntensity || 0;
      if ((skid > 0.25 || c.offroad) && c.speed > 10) {
        skidFrameT--;
        if (skidFrameT <= 0) {
          skidFrameT = 5;
          skidMarks[skidIdx].set(tmpMat);
          skidIdx = (skidIdx + 1) % MAX_SKID;
          if (skidActive < MAX_SKID) skidActive++;
        }
      } else {
        skidFrameT = 0;
      }
    }
  }
  // Ghost car (time trial): replay best-lap position as a bright emissive silhouette
  if (timeTrial && player && (state === "race" || state === "count")) {
    const g = Ghost.at(player.lapTime);
    if (g && !g.done) {
      Tracks.sample(track, g.s, smp2);
      tmpP[0] = smp2.p[0] + smp2.r[0] * g.x;
      tmpP[1] = smp2.p[1];
      tmpP[2] = smp2.p[2] + smp2.r[2] * g.x;
      for (let i = 0; i < 3; i++) { tmpF[i] = smp2.t[i]; tmpR[i] = smp2.r[i]; }
      tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
      tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
      tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
      basisMat(tmpR, tmpU, tmpF, tmpP, tmpMat);
      GLX.draw(teamMesh(player.team), tmpMat, { emissive: 0.60, roughness: 0.20, metalness: 0.08, specular: 0.35 });
    }
  }

  // Per-time cinematic grade + bloom. DRAMATIC = high contrast, deep shadows,
  // bloom ONLY on genuinely bright sources (floodlights, sun disc, neon) against
  // a darker frame — not a low-threshold wash that milks the whole image. Strong
  // teal-orange split-tone gives cinematic colour separation without brightening.
  let _grade, _bloom = 0.55, _thresh = 0.78;
  if (raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night)) {
    _grade = { shadow: [0.86, 0.94, 1.14], hi: [1.07, 1.00, 0.92], str: 0.30 };
    // Strong bloom so the lit windows + neon edges glow brightly across the dense
    // skyline, with a mid threshold so only the bright lit elements bloom.
    _bloom = 0.92; _thresh = 0.62;
  } else if (raceTimeOfDay === "dusk") {
    _grade = { shadow: [0.88, 0.97, 1.12], hi: [1.13, 1.02, 0.84], str: 0.36 };
    _bloom = 0.62; _thresh = 0.68;
  } else if (raceTimeOfDay === "dawn") {
    _grade = { shadow: [0.90, 0.96, 1.10], hi: [1.12, 1.00, 0.90], str: 0.30 };
    _bloom = 0.62; _thresh = 0.68;
  } else {
    // Bright day: a punchier teal-shadow / warm-highlight split with real bloom
    // on highlights so chrome, kerbs, glass and bright sky sparkle instead of
    // reading flat. (Old str 0.15 / bloom 0.50 was the washed-out look.)
    _grade = { shadow: [0.90, 0.98, 1.13], hi: [1.13, 1.04, 0.87], str: 0.34 };
    _bloom = 0.74; _thresh = 0.72;
  }
  // Resolve the HDR scene (bloom + tonemap + grade + vignette) to the screen.
  GLX.present({ exposure: frame.exposure, bloom: _bloom, threshold: _thresh, grade: _grade });
  if (raceWeather === "wet" && rainDrops.length) {
    drawRain(dt);
    // Lightning veil: drawn on top of rain drops so it bleaches the rain too
    if (_ltFlash > 0.001) {
      rainCtx2d.save();
      rainCtx2d.globalAlpha = _ltFlash * 0.18;
      rainCtx2d.fillStyle = "#d8ecff";
      rainCtx2d.fillRect(0, 0, rainCanvas.width, rainCanvas.height);
      rainCtx2d.restore();
    }
  }
}

// ---------- HUD ----------
function updateHud(force) {
  if (!player) return;
  hudT -= 1;
  if (!force && hudT > 0) return;
  hudT = 6; // ~10Hz at 60fps
  els.pos.textContent = timeTrial ? "TT" : (player.rank || "-") + "/" + cars.length;
  els.lap.textContent = Math.min(player.lap || 1, lapsTarget) + "/" + lapsTarget;
  els.time.textContent = fmtTime(player.lapTime);
  els.best.textContent = isFinite(player.best) ? fmtTime(player.best) : "-";
  els.speed.textContent = Math.round(player.speed * 3.6);
  els.energy.style.width = (player.energy * 100).toFixed(0) + "%";
  // gear + tachometer
  els.gear.textContent = player.gear;
  const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  els.rpmFill.style.width = (rpmFrac * 100).toFixed(0) + "%";
  els.tach.classList.toggle("redline", player.rpm > MAX_RPM * 0.92);
  // toggle-button states
  els.btnBoost.classList.toggle("on", player.boostOn);
  els.btnOT.classList.toggle("on", player.otT > 0);
  els.btnOT.classList.toggle("armed", player.otArmed && player.otT <= 0);
  const ot = player.otT > 0 ? "ot-active" : player.otArmed ? "ot-armed" : player.otCool > 0 ? "ot-cool" : "ot-off";
  els.ot.className = ot;
  els.ot.textContent = player.otT > 0 ? "OVERTAKE " + player.otT.toFixed(1) : "OVERTAKE";
  if (timeTrial) {
    // no rivals — show ghost delta (or last lap) and the record to chase instead of gaps
    if (Ghost.hasGhost()) {
      const ghostT = Ghost.timeAt(player.s);
      if (ghostT !== null) {
        const delta = player.lapTime - ghostT;
        const sign = delta >= 0 ? "+" : "";
        els.gapA.textContent = "GHOST " + sign + delta.toFixed(3) + "s";
        els.gapA.style.color = delta <= 0 ? "#a3e635" : "#e10600";
      } else {
        els.gapA.textContent = player.lastLap ? "LAST " + fmtTime(player.lastLap) : "";
        els.gapA.style.color = "";
      }
    } else {
      els.gapA.textContent = player.lastLap ? "LAST " + fmtTime(player.lastLap) : "";
      els.gapA.style.color = "";
    }
    els.gapB.textContent = isFinite(ttRecord) ? "REC " + fmtTime(ttRecord) : "REC —";
  } else {
    // gaps
    const ranked = cars.slice().sort((a, b) => b.prog - a.prog);
    const i = ranked.indexOf(player);
    const a = ranked[i - 1], b = ranked[i + 1];
    els.gapA.textContent = a ? "▲ " + a.code + " +" + ((a.prog - player.prog) / Math.max(player.speed, 25)).toFixed(1) + "s" : "";
    els.gapB.textContent = b ? "▼ " + b.code + " +" + ((player.prog - b.prog) / Math.max(player.speed, 25)).toFixed(1) + "s" : "";
  }
  // Sector split display (top-right)
  if (els.hudSectors) {
    const SC = ["#c084fc", "#e10600", "#a3e635"]; // S1 purple, S2 red, S3 green
    const labels = ["S1", "S2", "S3"];
    els.hudSectors.innerHTML = labels.map((lbl, i) => {
      const t = sectorLast[i];
      const val = t == null ? "--" : t.toFixed(3);
      return `<div class="sec-row"><span class="sec-lbl" style="color:${SC[i]}">${lbl}</span><span class="sec-val">${val}</span></div>`;
    }).join("");
  }
  drawMinimap();
}

function drawMinimap() {
  const W = els.minimap.width, H = els.minimap.height;
  // pre-render the static track outline once; reuse as a cheap blit every HUD frame
  if (!minimapBg || minimapBg.width !== W || minimapBg.height !== H) {
    minimapBg = document.createElement("canvas");
    minimapBg.width = W; minimapBg.height = H;
    const mc = minimapBg.getContext("2d");
    const map = track.map, n = map.length;
    mc.lineWidth = 2; mc.lineJoin = "round"; mc.lineCap = "round";
    const SC = ["rgba(192,132,252,0.8)", "rgba(225,6,0,0.8)", "rgba(163,230,53,0.8)"];
    for (let s = 0; s < 3; s++) {
      const from = Math.floor((s / 3) * n), to = Math.floor(((s + 1) / 3) * n);
      mc.strokeStyle = SC[s];
      mc.beginPath();
      for (let i = from; i <= to; i++) {
        const p = map[i % n];
        const x = 8 + p[0] * (W - 16), y = 8 + p[1] * (H - 16);
        i === from ? mc.moveTo(x, y) : mc.lineTo(x, y);
      }
      mc.stroke();
    }
    // DRS zone highlight (cyan, slightly thicker)
    const zones = TrackMaps.drsZones(track.def);
    if (zones && zones.length) {
      mc.strokeStyle = "rgba(0,220,180,0.85)"; mc.lineWidth = 3;
      for (const z of zones) {
        const from2 = Math.floor(z.a * n), to2 = Math.min(n - 1, Math.floor(z.b * n));
        mc.beginPath();
        for (let i = from2; i <= to2; i++) {
          const p = map[i % n];
          mc.lineTo(8 + p[0] * (W - 16), 8 + p[1] * (H - 16));
        }
        mc.stroke();
      }
    }
  }
  mm.clearRect(0, 0, W, H);
  mm.drawImage(minimapBg, 0, 0);
  const map = track.map, n = map.length;
  for (const c of cars) {
    if (c === player) continue;
    const p = map[Math.floor(c.s / track.total * n) % n];
    mm.fillStyle = cssCol(c.team.color);
    mm.fillRect(6 + p[0] * (W - 16), 6 + p[1] * (H - 16), 4, 4);
  }
  // ghost replay marker (time trial): where your best lap is right now
  if (timeTrial && Ghost.hasGhost()) {
    const gh = Ghost.at(player.lapTime);
    if (gh && !gh.done) {
      const gp = map[Math.floor((gh.s / track.total) * n) % n];
      mm.fillStyle = "rgba(120, 220, 255, 0.95)";
      mm.beginPath();
      mm.arc(8 + gp[0] * (W - 16), 8 + gp[1] * (H - 16), 3.4, 0, 7);
      mm.fill();
    }
  }
  const p = map[Math.floor(player.s / track.total * n) % n];
  mm.fillStyle = "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (W - 16), 8 + p[1] * (H - 16), 4, 0, 7);
  mm.fill();
}

// ---------- main loop ----------
let physAcc = 0;                 // leftover sim time carried between frames
let renderAlpha = 1;             // leftover-step fraction (0..1) for render interpolation
const PHYS_DT = 1 / 60;          // fixed physics step
function tick(now) {
  requestAnimationFrame(tick);
  let dt = Math.min((now - lastFrame) / 1000, 1 / 4);   // clamp big gaps (tab resume)
  lastFrame = now;
  Input.poll();   // refresh gamepad state once per frame (before the paused gate
                  // so the Start/Menu button can also un-pause)
  if (paused) return;
  if (announceT > 0) { announceT -= dt; if (announceT <= 0) els.announce.hidden = true; }
  // hit-stop: slow the simulation to a crawl for a few frames after a hard
  // crash so the impact reads, but keep the camera (render) at full dt so the
  // shake still plays out.
  let simTime = dt;
  if (hitStop > 0) { hitStop = Math.max(0, hitStop - dt); simTime = dt * 0.15; }
  // Fixed-step physics: advance the sim in constant 1/60 s chunks regardless of
  // the display framerate, so handling is identical on a 30 fps phone, a 120 fps
  // desktop, and a janky frame — a long frame can never enlarge the integration
  // step (which would change the slip/grip behaviour). Leftover time carries to
  // the next frame; cap the substeps so a stall can't trigger a spiral of death.
  if (!frozen) {
    physAcc += simTime;
    let steps = 0;
    while (physAcc >= PHYS_DT && steps < 5) {
      // snapshot each car's pre-step arc/lateral position so render can interpolate
      // between the last two physics steps (snapshotting every step leaves rPrev*
      // holding the state just before the final step taken this frame).
      for (let i = 0; i < cars.length; i++) { const c = cars[i]; c.rPrevS = c.s; c.rPrevX = c.x; }
      update(PHYS_DT); physAcc -= PHYS_DT; steps++;
    }
    if (steps === 5) physAcc = 0;             // fell badly behind — drop the backlog
  }
  renderAlpha = clamp(physAcc / PHYS_DT, 0, 1);   // 0..1 leftover fraction for render interp
  render(Math.min(dt, 1 / 20));               // camera/visual damping at (clamped) frame dt
  if (state === "race" || state === "count") updateHud(false);
}

// ---------- car setup panel ----------
const CS_STATS = [
  { key: "speed",     label: "SPEED" },
  { key: "accel",     label: "ACCEL" },
  { key: "cornering", label: "CORNERING" },
  { key: "braking",   label: "BRAKING" },
];

// Render the four stat bars (base + part boost overlay) for a team into a
// container. Shared by the select screen (always-on) and the setup panel.
function renderStatBars(container, team) {
  const stats = team.stats || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const mods = Parts.getMods(getTeamParts(team.id), team.engine);
  container.textContent = "";
  for (const { key, label } of CS_STATS) {
    const base = stats[key] || 75;
    const effective = Math.round(Math.min(110, base * mods[key]));
    const delta = effective - base;

    const row = document.createElement("div");
    row.className = "cs-stat-row";

    const lbl = document.createElement("span");
    lbl.className = "cs-stat-label";
    lbl.textContent = label;

    const barWrap = document.createElement("div");
    barWrap.className = "cs-stat-bar-wrap";

    const baseBar = document.createElement("div");
    baseBar.className = "cs-stat-base";
    baseBar.style.width = Math.min(base, 100) + "%";

    const boostBar = document.createElement("div");
    boostBar.className = "cs-stat-boost" + (delta < 0 ? " penalty" : "");
    if (delta >= 0) {
      boostBar.style.left = Math.min(base, 100) + "%";
      boostBar.style.width = Math.min(delta, 10) + "%";
    } else {
      boostBar.style.left = Math.max(0, base + delta) + "%";
      boostBar.style.width = Math.min(-delta, base) + "%";
    }

    barWrap.append(baseBar, boostBar);

    const val = document.createElement("span");
    val.className = "cs-stat-val" + (delta > 0 ? " up" : delta < 0 ? " down" : "");
    val.textContent = effective;

    row.append(lbl, barWrap, val);
    container.appendChild(row);
  }
}

function buildSetup() {
  const team = Teams.LIST[teamIdx];
  const parts = getTeamParts(team.id);

  // Drop any saved exclusive option the current team can't use
  let partsChanged = false;
  for (const cat of Parts.CATALOG) {
    const selId = parts[cat.id];
    if (selId) {
      const opt = cat.options.find((o) => o.id === selId);
      if (opt && opt.supplier && opt.supplier !== team.engine) {
        delete parts[cat.id];
        partsChanged = true;
      }
    }
  }
  if (partsChanged) saveTeamParts(team.id, parts);

  const spent = Parts.getCost(parts, team.engine);
  const remaining = Parts.BUDGET - spent;

  $("cs-team").textContent = team.name.toUpperCase();

  const budgetEl = $("cs-budget");
  const budgetFill = $("cs-budget-fill");
  const unlimitedBtn = $("cs-unlimited");
  if (budgetEl) {
    if (unlimitedBudget) {
      budgetEl.textContent = "FREE BUILD — no budget limit";
      budgetEl.className = "unlimited";
    } else {
      budgetEl.textContent = "BUDGET: " + remaining + " / " + Parts.BUDGET + " cr remaining";
      budgetEl.className = remaining < 0 ? "over" : remaining < 100 ? "tight" : "";
    }
  }
  if (budgetFill) {
    budgetFill.style.transform = unlimitedBudget ? "scaleX(0)" : "scaleX(" + Math.max(0, Math.min(1, spent / Parts.BUDGET)) + ")";
  }
  if (unlimitedBtn) {
    unlimitedBtn.textContent = unlimitedBudget ? "∞ FREE BUILD: ON" : "∞ FREE BUILD";
    unlimitedBtn.className = "cs-unlimited-btn" + (unlimitedBudget ? " on" : "");
  }

  const body = $("cs-body");
  body.textContent = "";

  for (const cat of Parts.CATALOG) {
    const section = document.createElement("div");
    section.className = "cs-cat-section";

    const catLbl = document.createElement("div");
    catLbl.className = "cs-cat";
    catLbl.textContent = cat.label;
    section.appendChild(catLbl);

    const desc = document.createElement("div");
    desc.className = "cs-desc";
    const curId = parts[cat.id] || Parts.DEFAULTS[cat.id];
    // Resolve active option respecting supplier lock
    const curOpt = cat.options.find((o) => o.id === curId && (!o.supplier || o.supplier === team.engine))
                || cat.options.find((o) => o.id === Parts.DEFAULTS[cat.id]);
    desc.textContent = curOpt ? curOpt.desc : "";
    section.appendChild(desc);

    const chips = document.createElement("div");
    chips.className = "cs-chips";
    for (const opt of cat.options) {
      // Hide exclusive options belonging to other suppliers
      if (opt.supplier && opt.supplier !== team.engine) continue;

      const active = curOpt && curOpt.id === opt.id;
      const curCost = curOpt ? (curOpt.cost || 0) : 0;
      const costDelta = (opt.cost || 0) - curCost;
      const wouldExceed = !active && !unlimitedBudget && (spent + costDelta > Parts.BUDGET);

      const chip = document.createElement("button");
      chip.className = "cs-chip"
        + (active ? " active" : "")
        + (wouldExceed ? " over-budget" : "")
        + (opt.tag ? " exclusive" : "");

      const labelSpan = document.createElement("span");
      labelSpan.textContent = opt.label;
      chip.appendChild(labelSpan);

      if (opt.tag) {
        const tagBadge = document.createElement("span");
        tagBadge.className = "cs-chip-tag";
        tagBadge.textContent = opt.tag;
        chip.appendChild(tagBadge);
      } else if (opt.cost > 0) {
        const badge = document.createElement("span");
        badge.className = "cs-chip-cost";
        badge.textContent = opt.cost + "cr";
        chip.appendChild(badge);
      }

      chip.addEventListener("mouseenter", () => { desc.textContent = opt.desc; });
      chip.addEventListener("focus",      () => { desc.textContent = opt.desc; });
      chip.addEventListener("mouseleave", () => {
        const c = cat.options.find((o) => o.id === (getTeamParts(team.id)[cat.id] || Parts.DEFAULTS[cat.id]));
        desc.textContent = c ? c.desc : "";
      });
      chip.addEventListener("blur", () => {
        const c = cat.options.find((o) => o.id === (getTeamParts(team.id)[cat.id] || Parts.DEFAULTS[cat.id]));
        desc.textContent = c ? c.desc : "";
      });

      chip.onclick = () => {
        const p = getTeamParts(team.id);
        const co = cat.options.find((o) => o.id === (p[cat.id] || Parts.DEFAULTS[cat.id]));
        const cc = co ? (co.cost || 0) : 0;
        if (!unlimitedBudget && (Parts.getCost(p, team.engine) - cc + (opt.cost || 0)) > Parts.BUDGET) {
          chip.classList.add("budget-reject");
          chip.addEventListener("animationend", () => chip.classList.remove("budget-reject"), { once: true });
          if (soundOn) GameAudio.uiTick();
          return;
        }
        p[cat.id] = opt.id;
        saveTeamParts(team.id, p);
        if (soundOn) GameAudio.uiTick();
        buildSetup();
      };

      chips.appendChild(chip);
    }
    section.appendChild(chips);
    body.appendChild(section);
  }
  renderStatBars($("cs-stats-inner"), team);
}

function openSetup() {
  buildSetup();
  $("carsetup").hidden = false;
}

// ---------- UI wiring ----------
function buildSelect() {
  els.selTitle.textContent = seasonMode ? "SEASON — ROUND " + ((season && season.round || 0) + 1)
    : timeTrial ? "TIME TRIAL" : "GRAND PRIX";
  // Track section: interactive circuit picker in GP/TT; read-only NEXT RACE preview in season
  els.selTrackSection.hidden = false;
  if (els.selCircuitLabel) els.selCircuitLabel.textContent = seasonMode ? "NEXT RACE" : "CIRCUIT";
  els.selDiffSection.hidden = timeTrial;       // no AI in a time trial
  els.selTeams.textContent = "";
  Teams.LIST.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === teamIdx ? " active" : "");
    const sw = document.createElement("span"); sw.className = "swatch"; sw.style.background = cssCol(t.color);
    b.append(sw, document.createTextNode(t.short));
    b.onclick = () => { teamIdx = i; driverIdx = 0; store.set("team", i); buildSelect(); tickUi(); };
    els.selTeams.appendChild(b);
  });
  const team = Teams.LIST[teamIdx];
  els.selDriver.textContent = "";
  team.drivers.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === driverIdx ? " active" : "");
    b.textContent = "#" + d.num + " " + d.name;
    b.onclick = () => { driverIdx = i; store.set("driver", i); buildSelect(); tickUi(); };
    els.selDriver.appendChild(b);
  });
  renderStatBars($("sel-stats"), team);
  if (seasonMode) {
    // Non-interactive preview of the upcoming season circuit
    els.selTracks.textContent = "";
    updateTrackPreview();
    const rnd = (season && season.round || 0) + 1;
    els.selPreviewRec.textContent = "Round " + rnd + " of " + Tracks.LIST.length;
    // Upcoming rounds list (next 5 circuits after current)
    const upcoming = [];
    for (let i = rnd; i < Math.min(rnd + 5, Tracks.LIST.length); i++) upcoming.push({ n: i + 1, t: Tracks.LIST[i] });
    if (upcoming.length) {
      const upHead = document.createElement("div");
      upHead.className = "season-upcoming-head";
      upHead.textContent = "UPCOMING";
      els.selTracks.appendChild(upHead);
      upcoming.forEach(({ n, t }) => {
        const row = document.createElement("div");
        row.className = "season-upcoming-row";
        const rndEl = document.createElement("span"); rndEl.className = "sur-rnd"; rndEl.textContent = "R" + n;
        const nmEl = document.createElement("span"); nmEl.className = "sur-name"; nmEl.textContent = t.name;
        const ctEl = document.createElement("span"); ctEl.className = "sur-country"; ctEl.textContent = t.country || "";
        row.append(rndEl, nmEl, ctEl);
        els.selTracks.appendChild(row);
      });
    }
  } else {
    els.selTracks.textContent = "";
    Tracks.LIST.forEach((t, i) => {
      const row = document.createElement("button");
      row.className = "track-row" + (i === trackIdx ? " active" : "");
      row.setAttribute("aria-label", t.name);

      const nm = document.createElement("span");
      nm.className = "track-row-name";
      nm.textContent = t.name;
      if (t.night) { const b = document.createElement("span"); b.className = "trb trb-night"; b.textContent = "NIGHT"; nm.appendChild(b); }
      if (t.street) { const b = document.createElement("span"); b.className = "trb trb-street"; b.textContent = "STREET"; nm.appendChild(b); }
      row.appendChild(nm);

      const mt = document.createElement("span");
      mt.className = "track-row-meta";
      mt.textContent = [t.country, t.lengthKm ? t.lengthKm.toFixed(1) + " km" : ""].filter(Boolean).join(" · ");
      row.appendChild(mt);

      if (timeTrial) {
        const board = ttBoard(t.id);
        const rec = board.length ? board[0].t : Infinity;
        const recEl = document.createElement("span");
        recEl.className = "track-row-rec";
        recEl.textContent = isFinite(rec) ? "★ " + fmtTime(rec) : "—";
        row.appendChild(recEl);
      }

      row.onclick = () => { trackIdx = i; store.set("track", i); buildSelect(); tickUi(); scheduleFlybyTrack(); };
      els.selTracks.appendChild(row);
    });
    updateTrackPreview();
  }
  els.selDiff.textContent = "";
  ["easy", "normal", "hard"].forEach((d) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (d === difficulty ? " active" : "");
    b.textContent = d.toUpperCase();
    b.onclick = () => { difficulty = d; store.set("difficulty", d); buildSelect(); tickUi(); };
    els.selDiff.appendChild(b);
  });
}

// large preview of the currently-selected circuit: sector-coloured outline,
// DRS zones, numbered corners, name / GP / length / turn count, track facts.
function updateTrackPreview() {
  if (!els.selPreviewMap) return;
  const t = Tracks.LIST[trackIdx];
  if (!t) return;
  TrackMaps.draw(els.selPreviewMap, t, {
    color: TrackMaps.themeColor(t), startColor: "#e10600",
    width: 4, pad: 24, corners: true, cornerR: 9, cornerFont: 11,
    sectors: true, drs: true
  });
  els.selPreviewName.textContent = t.name + (t.night ? " ☾" : "");
  els.selPreviewGp.textContent = t.gp || "";
  const crns = TrackMaps.corners(t);
  const turns = crns.length;
  els.selPreviewMeta.textContent = [
    t.country,
    t.lengthKm ? t.lengthKm.toFixed(1) + " km" : "",
    turns ? turns + " turns" : ""
  ].filter(Boolean).join("  ·  ");
  if (timeTrial) {
    const board = ttBoard(t.id);
    const rec = board.length ? board[0].t : Infinity;
    els.selPreviewRec.textContent = isFinite(rec) ? "Best  ★ " + fmtTime(rec) : "No time set";
  } else {
    els.selPreviewRec.textContent = "";
  }
  // Track facts: direction arrow, elevation badge, slowest corner callout
  const factsEl = document.getElementById("sel-preview-facts");
  if (factsEl) {
    const dir = TrackMaps.direction(t);
    const elev = TrackMaps.elevRange(t);
    const facts = [];
    const dz = TrackMaps.drsZones(t);
    if (dir) facts.push('<span class="spf-fact spf-dir">' + (dir === "CW" ? "↻ Clockwise" : "↺ Anti-clockwise") + "</span>");
    if (elev > 2) facts.push('<span class="spf-fact spf-elev">&#9650; ' + elev + " m elevation</span>");
    if (dz && dz.length) facts.push('<span class="spf-fact spf-drs">' + dz.length + " DRS zone" + (dz.length > 1 ? "s" : "") + "</span>");
    if (crns.length) {
      const slowest = crns.reduce(function (a, b) { return b.v > a.v ? b : a; });
      facts.push('<span class="spf-fact spf-corner">T' + slowest.n + " slowest</span>");
    }
    factsEl.innerHTML = facts.join("");
  }

  // Elevation profile chart (shown only when there is meaningful elevation data)
  const elevCv = document.getElementById("sel-preview-elev");
  if (elevCv) {
    const py = TrackMaps.elevProfile(t);
    const elevR = TrackMaps.elevRange(t);
    if (py && py.length > 2 && elevR > 2) {
      elevCv.hidden = false;
      const ew = elevCv.width, eh = elevCv.height;
      const eg = elevCv.getContext("2d");
      eg.clearRect(0, 0, ew, eh);
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < py.length; i++) { if (py[i] < mn) mn = py[i]; if (py[i] > mx) mx = py[i]; }
      const span = mx - mn || 1;
      const pad = 3;
      function yNorm(v) { return eh - pad - ((v - mn) / span) * (eh - 2 * pad); }
      eg.beginPath();
      for (let i = 0; i <= py.length; i++) {
        const px = (i / py.length) * ew;
        i === 0 ? eg.moveTo(px, yNorm(py[0])) : eg.lineTo(px, yNorm(py[i % py.length]));
      }
      eg.lineTo(ew, eh); eg.lineTo(0, eh); eg.closePath();
      eg.fillStyle = "rgba(57,183,240,0.18)";
      eg.fill();
      eg.strokeStyle = "rgba(57,183,240,0.7)"; eg.lineWidth = 1.5;
      eg.beginPath();
      for (let i = 0; i <= py.length; i++) {
        const px = (i / py.length) * ew;
        i === 0 ? eg.moveTo(px, yNorm(py[0])) : eg.lineTo(px, yNorm(py[i % py.length]));
      }
      eg.stroke();
      // Y-axis elevation labels (top = max, bottom = min)
      eg.font = "8px monospace";
      eg.fillStyle = "rgba(57,183,240,0.75)";
      eg.textAlign = "right";
      eg.fillText("+" + Math.round(mx) + "m", ew - 2, 9);
      eg.fillText(Math.round(mn) + "m", ew - 2, eh - 1);
    } else {
      elevCv.hidden = true;
    }
  }
}
function openTrackDetail() {
  const t = Tracks.LIST[trackIdx];
  if (!t) return;
  const modal = document.getElementById("track-detail");
  if (!modal) return;
  const crns = TrackMaps.corners(t);
  document.getElementById("track-detail-name").textContent = t.name + (t.gp ? "  ·  " + t.gp : "");
  const dz = TrackMaps.drsZones(t);
  const dir = TrackMaps.direction(t);
  const elev = TrackMaps.elevRange(t);
  const meta = [
    t.country,
    t.lengthKm ? t.lengthKm.toFixed(1) + " km" : "",
    crns.length + " turns",
    dir ? (dir === "CW" ? "Clockwise" : "Anti-clockwise") : "",
    elev > 2 ? "+" + elev + " m elev" : "",
    dz && dz.length ? dz.length + " DRS" : ""
  ].filter(Boolean).join("  ·  ");
  document.getElementById("track-detail-meta").textContent = meta;

  // Circuit type flags
  var nightEl = document.getElementById("tdf-night");
  var streetEl = document.getElementById("tdf-street");
  var bankedEl = document.getElementById("tdf-banked");
  if (nightEl) nightEl.hidden = !t.night;
  if (streetEl) streetEl.hidden = !t.street;
  if (bankedEl) bankedEl.hidden = !t.banked;

  // Elevation sparkline
  var elevWrap = document.getElementById("track-detail-elev-wrap");
  var elevCv = document.getElementById("track-detail-elev");
  if (elevWrap && elevCv) {
    const py = TrackMaps.elevProfile(t);
    const elevR = TrackMaps.elevRange(t);
    if (py && py.length > 2 && elevR > 2) {
      elevWrap.hidden = false;
      const ew = elevCv.width, eh = elevCv.height;
      const eg = elevCv.getContext("2d");
      eg.clearRect(0, 0, ew, eh);
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < py.length; i++) { if (py[i] < mn) mn = py[i]; if (py[i] > mx) mx = py[i]; }
      const span = mx - mn || 1;
      const pad = 3;
      function yNorm(v) { return eh - pad - ((v - mn) / span) * (eh - 2 * pad); }
      eg.beginPath();
      for (let i = 0; i <= py.length; i++) {
        const ex = (i / py.length) * ew;
        i === 0 ? eg.moveTo(ex, yNorm(py[0])) : eg.lineTo(ex, yNorm(py[i % py.length]));
      }
      eg.lineTo(ew, eh); eg.lineTo(0, eh); eg.closePath();
      eg.fillStyle = "rgba(57,183,240,0.18)"; eg.fill();
      eg.strokeStyle = "rgba(57,183,240,0.7)"; eg.lineWidth = 1.5;
      eg.beginPath();
      for (let i = 0; i <= py.length; i++) {
        const ex = (i / py.length) * ew;
        i === 0 ? eg.moveTo(ex, yNorm(py[0])) : eg.lineTo(ex, yNorm(py[i % py.length]));
      }
      eg.stroke();
      eg.font = "8px monospace"; eg.fillStyle = "rgba(57,183,240,0.75)"; eg.textAlign = "right";
      eg.fillText("+" + Math.round(mx) + "m", ew - 2, 9);
      eg.fillText(Math.round(mn) + "m", ew - 2, eh - 1);
    } else {
      elevWrap.hidden = true;
    }
  }

  // DRS zones with metre positions
  var drsWrap = document.getElementById("track-detail-drs-wrap");
  var drsList = document.getElementById("track-detail-drs-list");
  if (drsWrap && drsList) {
    if (dz && dz.length) {
      const trackLen = (t.lengthKm || 5) * 1000;
      drsList.innerHTML = dz.map(function (z, i) {
        return '<div class="tdd-zone">Zone ' + (i + 1) + ': ' + Math.round(z.a * trackLen) + ' m &ndash; ' + Math.round(z.b * trackLen) + ' m</div>';
      }).join("");
      drsWrap.hidden = false;
    } else {
      drsWrap.hidden = true;
    }
  }

  // Turns list
  const list = document.getElementById("track-detail-list");
  list.innerHTML = crns.map(function (c) {
    const cls = c.v > 0.025 ? "tdc-hairpin" : c.v > 0.013 ? "tdc-slow" : c.v > 0.008 ? "tdc-medium" : "tdc-fast";
    const lbl = c.v > 0.025 ? "HAIRPIN" : c.v > 0.013 ? "SLOW" : c.v > 0.008 ? "MEDIUM" : "FAST";
    return '<div class="tdc-corner"><span class="tdc-num">T' + c.n + '</span><span class="' + cls + '">' + lbl + '</span></div>';
  }).join("");

  modal.hidden = false;
  const cv = document.getElementById("track-detail-canvas");
  requestAnimationFrame(function () {
    // Compute the track's natural aspect ratio from its outline points so the
    // canvas matches the circuit shape instead of being CSS-stretched.
    let trackAspect = 1.2;
    const pts = TrackMaps.outline(t);
    if (pts && pts.length > 2) {
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][0] < minx) minx = pts[i][0]; if (pts[i][0] > maxx) maxx = pts[i][0];
        if (pts[i][1] < miny) miny = pts[i][1]; if (pts[i][1] > maxy) maxy = pts[i][1];
      }
      trackAspect = Math.max(0.5, Math.min(2.5, (maxx - minx) / ((maxy - miny) || 1)));
    }
    const wrap = document.getElementById("track-detail-canvas-wrap");
    const wrapW = wrap ? wrap.clientWidth : (window.innerWidth - 24);
    const wrapH = wrap ? wrap.clientHeight : (window.innerHeight - 80);
    let canvW, canvH;
    if (wrapH > 0 && wrapW > 0) {
      // Fit canvas within wrapper preserving track aspect ratio
      canvH = wrapH;
      canvW = Math.round(canvH * trackAspect);
      if (canvW > wrapW) { canvW = wrapW; canvH = Math.round(canvW / trackAspect); }
    } else {
      canvW = Math.min(window.innerWidth - 24, 600);
      canvH = Math.round(canvW / trackAspect);
    }
    cv.width = Math.max(200, Math.round(canvW));
    cv.height = Math.max(150, Math.round(canvH));
    cv.style.width = cv.width + "px";
    cv.style.height = cv.height + "px";
    TrackMaps.draw(cv, t, {
      color: TrackMaps.themeColor(t), startColor: "#e10600",
      width: 5, pad: 30, corners: true, cornerR: 12, cornerFont: 13,
      sectors: true, drs: true
    });
  });
}

function tickUi() { if (soundOn) GameAudio.uiTick(); }

function steerLabel() {
  if (steerMode === "buttons") return "STEER: BUTTONS";
  if (steerMode === "touch") return "STEER: TOUCH";
  // Only warn when the gyro is genuinely unavailable/denied — not in the brief
  // window before the first sensor reading arrives (which would falsely show
  // "(NO GYRO)" on phones that have a working gyro).
  return "STEER: TILT" + (Input.gyroDenied ? " (NO GYRO)" : "");
}

function enableTilt() {
  // Must run inside a user gesture for the iOS permission prompt.
  Input.requestGyro().then((ok) => {
    if (ok) {
      Input.calibrate();
    } else if (Input.gyroDenied) {
      // Permission denied — fall back to buttons so the player can still steer.
      // (Staying in tilt mode with no sensor data leaves steer locked at 0 and
      // the car just follows ROAD_FOLLOW, appearing to "auto-drive" the racing line.)
      setSteerMode("buttons");
    }
    $("pm-steer").textContent = steerLabel();
    els.audiostate.textContent = ok && Input.tiltActive() ? "tilt steering ready"
      : (Input.gyroDenied ? "motion access denied — switched to buttons" : "");
  });
}

function firstGesture() {
  GameAudio.init();
  GameAudio.setEnabled(soundOn);
  GameAudio.setMusicEnabled(musicEnabled);
  // Tilt permission is requested at race start (rs-go click), not here — so the
  // gyro prompt and button fallback don't appear on the title screen.
  if (soundOn) GameAudio.startMusic(-1);
}
let gestured = false;
document.addEventListener("pointerdown", () => {
  if (gestured) return; gestured = true; firstGesture();
}, { once: false, capture: true });

els.soundbtn.hidden = false;
function setSound(b) {
  soundOn = b; store.set("sound", b);
  GameAudio.setEnabled(b);
  els.soundbtn.textContent = b ? "♪ ON" : "♪ OFF";
  $("pm-sound").textContent = "SOUND: " + (b ? "ON" : "OFF");
  if (!b) { GameAudio.stopMusic(); GameAudio.stopEngine(); }
  else { if (state === "menu") GameAudio.startMusic(-1); }
}
els.soundbtn.onclick = () => setSound(!soundOn);

// Music on/off, independent of the master sound toggle: engine + SFX keep
// playing with music off.
function setMusic(b) {
  musicEnabled = b; store.set("music", b);
  GameAudio.setMusicEnabled(b);
  $("pm-music").textContent = "MUSIC: " + (b ? "ON" : "OFF");
}
$("pm-music").onclick = () => setMusic(!musicEnabled);


$("mb-race").onclick = () => {
  seasonMode = false; timeTrial = false;
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-tt").onclick = () => {
  seasonMode = false; timeTrial = true;
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-season").onclick = () => {
  seasonMode = true; timeTrial = false;
  if (!season || season.round >= Tracks.LIST.length) {
    season = { round: 0, pts: {}, teamPts: {} };
    store.set("season", season);
  }
  trackIdx = season.round;
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-standings").onclick = () => { buildStandings(); $("standings").hidden = false; if (soundOn) GameAudio.uiSelect(); };
$("standings-close").onclick = () => { $("standings").hidden = true; };
$("mb-data").onclick = () => { DataHub.open(); if (soundOn) GameAudio.uiSelect(); };
$("mb-help").onclick = () => { els.howtoplay.hidden = false; };
$("htp-close").onclick = () => { els.howtoplay.hidden = true; };
// Advanced steering: opened from the pause menu, closes back to it.
$("pm-advanced").onclick = () => { $("advanced").hidden = false; };
$("adv-close").onclick = () => { $("advanced").hidden = true; };
els.selBack.onclick = () => { els.select.hidden = true; els.overlay.hidden = false; };
els.selPreviewMap.onclick = openTrackDetail;
$("track-detail-close").onclick = () => { $("track-detail").hidden = true; };

function buildRaceSettings() {
  const lapOpts = timeTrial ? [3, 5, 8] : [3, 5, 10, 25, 57];
  const lapsEl = $("rs-laps");
  lapsEl.innerHTML = "";
  for (const n of lapOpts) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (raceLaps === n ? " active" : "");
    b.textContent = n === 57 ? "57 (FULL)" : String(n);
    b.onclick = () => { raceLaps = n; buildRaceSettings(); if (soundOn) GameAudio.uiTick(); };
    lapsEl.appendChild(b);
  }
  const weatherEl = $("rs-weather");
  weatherEl.innerHTML = "";
  for (const [id, label, icon] of [["dry", "DRY", "☀"], ["wet", "WET", "🌧"], ["overcast", "CLOUDY", "☁"], ["fog", "FOG", "🌫"]]) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (raceWeather === id ? " active" : "");
    b.textContent = icon + " " + label;
    b.onclick = () => { raceWeather = id; buildRaceSettings(); if (soundOn) GameAudio.uiTick(); };
    weatherEl.appendChild(b);
  }
  const timeEl = $("rs-time");
  timeEl.innerHTML = "";
  for (const [id, label] of [["default", "DEFAULT"], ["dawn", "DAWN"], ["day", "DAY"], ["dusk", "DUSK"], ["night", "NIGHT"]]) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (raceTimeOfDay === id ? " active" : "");
    b.textContent = label;
    b.onclick = () => { raceTimeOfDay = id; buildRaceSettings(); if (soundOn) GameAudio.uiTick(); };
    timeEl.appendChild(b);
  }
}

els.selGo.onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  raceLaps = timeTrial ? TT_LAPS : GAME_LAPS;
  raceWeather = "dry";
  raceTimeOfDay = "default";
  buildRaceSettings();
  els.select.hidden = true;
  $("race-settings").hidden = false;
};
$("rs-cancel").onclick = () => {
  $("race-settings").hidden = true;
  els.select.hidden = false;
};
$("rs-go").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  $("race-settings").hidden = true;
  if (steerMode === "tilt") enableTilt();
  startRace();
};

// ---- customize my team ----
function czPreview() {
  $("cz-swatch1").style.background = $("cz-color").value;
  $("cz-swatch2").style.background = $("cz-color2").value;
  const code = ($("cz-code").value || "YOU").toUpperCase();
  $("cz-pvtext").textContent = "#" + ($("cz-num").value || "99") + " " + code + " · " + ($("cz-short").value || "YOU").toUpperCase();
  $("cz-pvtext").style.color = $("cz-color").value;
}
function openCustomize() {
  const ct = loadCustomTeam();
  $("cz-name").value = ct.name;
  $("cz-short").value = ct.short;
  $("cz-color").value = rgbToHex(ct.color);
  $("cz-color2").value = rgbToHex(ct.color2);
  $("cz-driver").value = ct.drivers[0].name;
  $("cz-code").value = ct.drivers[0].code;
  $("cz-num").value = ct.drivers[0].num;
  czPreview();
  els.customize.hidden = false;
}
["cz-name", "cz-short", "cz-color", "cz-color2", "cz-code", "cz-num"].forEach((id) => {
  $(id).addEventListener("input", czPreview);
});
els.selCustomize.onclick = () => { if (soundOn) GameAudio.uiSelect(); openCustomize(); };
$("sel-setup").onclick = () => { if (soundOn) GameAudio.uiSelect(); openSetup(); };
$("cs-done").onclick = () => {
  $("carsetup").hidden = true;
  recomputePlayerMods(); buildSelect();
};
$("cs-unlimited").onclick = () => {
  unlimitedBudget = !unlimitedBudget;
  store.set("unlimitedBudget", unlimitedBudget);
  buildSetup();
};
$("cz-cancel").onclick = () => { els.customize.hidden = true; };
$("cz-save").onclick = () => {
  const clean = (v, fb, n) => { v = (v || "").trim(); return v ? v.slice(0, n) : fb; };
  const ct = {
    id: "custom", engine: "Custom", tier: 2, custom: true,
    name: clean($("cz-name").value, "My Team", 22),
    short: clean($("cz-short").value, "YOU", 4).toUpperCase(),
    color: hexToRgb($("cz-color").value),
    color2: hexToRgb($("cz-color2").value),
    drivers: [{
      name: clean($("cz-driver").value, "Your Name", 22),
      code: clean($("cz-code").value, "YOU", 3).toUpperCase(),
      num: clamp(parseInt($("cz-num").value, 10) || 99, 0, 99),
    }],
  };
  store.set("customTeam", ct);
  syncCustomTeam();
  teamIdx = Teams.LIST.findIndex((t) => t.id === "custom");
  driverIdx = 0;
  store.set("team", teamIdx); store.set("driver", 0);
  els.customize.hidden = true;
  buildSelect();
  if (soundOn) GameAudio.uiSelect();
};
els.resMenu.onclick = () => quitToMenu();
els.resNext.onclick = () => {
  if (seasonMode) {
    if (season.round >= Tracks.LIST.length) {
      if (els.resNext.textContent !== "MAIN MENU") {
        // First click: build champion panel, stay on results screen
        const sorted = cars.slice().sort((a, b) => (season.pts[b.code] || 0) - (season.pts[a.code] || 0));
        const champ = sorted[0];
        const champColor = cssCol(champ.team.color);
        els.resultsTitle.textContent = "WORLD CHAMPION";
        els.resultsTitle.style.color = champColor;
        els.resultsTable.textContent = "";
        // Big champion row
        const banner = document.createElement("div");
        banner.style.cssText = "text-align:center;padding:18px 0 10px;font-weight:900;font-style:italic;font-size:1.4em;color:" + champColor;
        banner.textContent = champ.code + "  " + champ.name;
        const teamBanner = document.createElement("div");
        teamBanner.style.cssText = "text-align:center;font-size:0.8em;color:#aaa;margin-bottom:14px;letter-spacing:2px";
        teamBanner.textContent = champ.team.name.toUpperCase();
        els.resultsTable.append(banner, teamBanner);
        // Full standings
        const head = document.createElement("div");
        head.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin-bottom:4px;font-size:0.85em";
        head.textContent = "FINAL STANDINGS";
        els.resultsTable.appendChild(head);
        sorted.forEach((c, i) => {
          const row = document.createElement("div"); row.className = "res-row";
          const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
          const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = cssCol(c.team.color);
          const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = c.code;
          const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (season.pts[c.code] || 0) + " pts";
          row.append(pos, sw, nm, pt);
          els.resultsTable.appendChild(row);
        });
        els.resNext.textContent = "MAIN MENU";
        announce(champ.code + " IS WORLD CHAMPION!", 4);
        if (soundOn) GameAudio.finish();
        return;
      }
      // Second click: go to menu, reset season
      season = null; store.set("season", null);
      els.resultsTitle.style.color = "";
      quitToMenu();
      return;
    }
    trackIdx = season.round;
  }
  els.results.hidden = true;
  startRace();
};

function setPaused(p) {
  if (state !== "race" && state !== "count") return;
  paused = p;
  els.pausemenu.hidden = !p;
  if (els.pmStandings) els.pmStandings.hidden = !(seasonMode && season && season.round > 0);
  if (!p) $("advanced").hidden = true;   // never leave the overlay up after resume
  if (p) { GameAudio.stopEngine(); GameAudio.setSkid(0); }
  else if (soundOn) GameAudio.startEngine();
  lastFrame = performance.now();
}
els.pausebtn.onclick = () => setPaused(true);

// ---- player camera modes (CAM button / C key) ----
function refreshCamBtn() {
  const b = $("btn-cam");
  if (b) b.textContent = CAM_MODES[camMode].label;
}
function setCamMode(m) {
  const prev = camMode;
  camMode = ((m % CAM_MODES.length) + CAM_MODES.length) % CAM_MODES.length;
  store.set("camMode", camMode);
  if (camMode !== prev) camCutT = 0.35;   // brief eased glide into the new angle
  refreshCamBtn();   // the CAM button label is the only mode indicator (no big announce)
  return CAM_MODES[camMode].id;
}
function cycleCam() { return setCamMode(camMode + 1); }
$("btn-cam") && ($("btn-cam").onclick = () => cycleCam());
refreshCamBtn();

$("pm-resume").onclick = () => setPaused(false);
$("pm-restart").onclick = () => { els.pausemenu.hidden = false; setPaused(false); startRace(); };
$("pm-quit").onclick = () => quitToMenu();
els.pmStandings && (els.pmStandings.onclick = () => { buildStandings(); $("standings").hidden = false; });
$("pm-sound").onclick = () => setSound(!soundOn);

// One STEER button cycles the single mode: TILT -> BUTTONS -> TOUCH.
const STEER_MODES = ["tilt", "buttons", "touch"];
function setSteerMode(mode) {
  steerMode = mode;
  store.set("steerMode", mode);
  Input.setSteerMode(mode);
  if (mode === "tilt") enableTilt();   // (re)request motion permission within this gesture
  $("pm-steer").textContent = steerLabel();
  $("pm-calib").hidden = mode !== "tilt";
  refreshGearsBtn();   // manual is tilt-only, so the GEARS toggle hides off-tilt
  // Only refresh touch buttons when in an active race — don't bleed controls onto
  // the title/select screen (e.g. when gyro denial auto-switches to buttons mode).
  if (state === "race" || state === "count" || state === "pause") showTouchControls(true);
}
$("pm-steer").onclick = () => {
  setSteerMode(STEER_MODES[(STEER_MODES.indexOf(steerMode) + 1) % STEER_MODES.length]);
};
$("pm-calib").onclick = () => { Input.calibrate(); setPaused(false); };

// ---- steering tuning sliders (pause menu) ----
// Every slider is an integer 1..10 (racing line is -5..5) that maps to a
// physical value. Each maps so the DEFAULT value reproduces the original
// hand-tuned feel. Higher slider = the direction named in the label.
//
//  pm-rate     RESPONSE       WHEELBASE m (inverted) — high slider = shorter
//                             wheelbase = less yaw inertia = snappier turn-in.
//  pm-expo     LINEARITY      STEER_EXPO — high slider = more linear/direct,
//                             low = gentle near centre. (affects tilt + keys)
//  pm-smooth   STEER SMOOTHING One-Euro min-cutoff (Hz) — higher slider = lower
//                             cutoff = steadier/smoother tilt (kills jitter).
//  pm-tiltdeg  TILT RANGE     MAX_TILT — degrees of tilt for full lock (the one
//                             tilt-sensitivity knob; dead zone is fixed at 2.5°).
//  pm-lock     STEER LOCK     STEER_MAX_SLIP — max road-wheel steer angle (rad).
//  pm-speedsteer SPEED STEER  STEER_SPEED_REF — high slider = keeps more steering
//                             at speed (sharper); low = calmer/stabler at speed.
//  pm-line     RACING LINE    assist: 0 off, +pull to line, -push wide.
// The car is planted (understeer-only): DRIFT defaults to 0 so the rear never
// steps out — overcooking a corner washes the front wide, it never snaps round.
// The simplified default-view controls (STEERING / TILT / DRIVING HELP / RACING
// LINE) bundle these for players who don't want the detail — see refreshMacros().
function tiltDegFromRange(v) { return Math.round(50 + (18 - 50) * (v - 1) / 9); }
// SMOOTHING -> One-Euro min-cutoff (Hz). Higher slider = LOWER cutoff = smoother.
// v6 = 1.2 Hz (the original feel); v1 = 2.2 (snappy), v10 = 0.4 (very steady).
function cutoffFromSmooth(v) { return 2.2 + (0.4 - 2.2) * (v - 1) / 9; }
// High slider = SHORTER wheelbase = snappier; v5 ≈ 3.2 m (the original feel).
function wheelbaseFromSlider(v) { return 4.3 + (1.9 - 4.3) * (v - 1) / 9; } // 4.3..1.9
function expoFromSlider(v)   { return 3.5 + (1.0 - 3.5) * (v - 1) / 9; } // 3.5..1.0
function lockFromSlider(v)   { return 0.18 + (0.42 - 0.18) * (v - 1) / 9; } // rad, .18..0.42, v5≈0.29
function speedRefFromSlider(v) { return 44 + (124 - 44) * (v - 1) / 9; } // 44..124, v5≈80
function paceFromSlider(v)   { return v <= 5 ? 0.5 + (v - 1) * 0.125 : 1.0 + (v - 5) * 0.06; } // 0.50..1.30, v5=1.0
// DRIVING HELP = ROAD_FOLLOW: how much of each corner the car tracks for you.
// v6 ≈ 0.70 (the original feel); higher = the car does more of the steering.
function helpFromSlider(v)   { return 0.25 + (v - 1) / 9 * 0.45; }      // 0.25..0.70 assist gain, v6≈0.50
                                                                       // (gentle: the snappy/grippy car
                                                                       // over-steers if the assist is too strong)
function lineLabel(v) { return v === 0 ? "OFF" : (v > 0 ? "PULL " + v : "PUSH " + (-v)); }

// ---- presets ----
// Three named bundles drive all the handling sliders at once so a player never
// has to understand the underlying knobs. STANDARD reproduces the original
// hand-tuned defaults; RELAX stacks every forgiveness lever (on-rails grip,
// heavy corner help, racing-line pull, smooth/wide tilt) without maxing any one;
// PRO sharpens response and frees up the slide for skilled play. PACE is left
// out — it's a race-wide setting, not a handling feel.
const PRESETS = {
  relax:    { tiltDeg: 4, steerSmooth: 8, steerRate: 4,
              steerExpo: 4, steerLock: 5, steerSpeed: 4, drivingHelp: 9, raceLine: 2 },
  standard: { tiltDeg: 6, steerSmooth: 6, steerRate: 5,
              steerExpo: 5, steerLock: 5, steerSpeed: 5, drivingHelp: 6, raceLine: 0 },
  pro:      { tiltDeg: 7, steerSmooth: 3, steerRate: 7,
              steerExpo: 6, steerLock: 7, steerSpeed: 7, drivingHelp: 3, raceLine: 0 },
};
const PRESET_STORE = {  // slider store-key  ->  preset field
  tiltDeg: "tiltDeg", steerSmooth: "steerSmooth",
  steerRate: "steerRate", steerExpo: "steerExpo", steerLock: "steerLock",
  steerSpeed: "steerSpeed", drivingHelp: "drivingHelp", raceLine: "raceLine",
};

// ---- simplified ("macro") controls ----
// The default view exposes a handful of plain-language controls; each fans out to
// the granular store keys above, so presets, the Advanced sliders and the macros
// all stay in sync. STEER_LEVELS bundle the four cornering-feel knobs into named
// steps that line up with the presets (RELAX→easy, STANDARD→normal, PRO→sim).
const STEER_LEVELS = {
  easy:   { steerRate: 4, steerExpo: 4, steerLock: 5, steerSpeed: 4 },
  assist: { steerRate: 5, steerExpo: 5, steerLock: 5, steerSpeed: 4 },
  normal: { steerRate: 5, steerExpo: 5, steerLock: 5, steerSpeed: 5 },
  sim:    { steerRate: 7, steerExpo: 6, steerLock: 7, steerSpeed: 7 },
};
const STEER_LEVEL_ORDER = ["easy", "assist", "normal", "sim"];
const STEER_DEFAULTS = { steerRate: 5, steerExpo: 5, steerLock: 5, steerSpeed: 5 };
const HELP_LEVELS = { low: 3, med: 6, high: 9 };
const LINE_LEVELS = { off: 0, corner: 3, full: 5 };
function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  for (const storeKey of Object.keys(PRESET_STORE)) store.set(storeKey, p[storeKey]);
  store.set("preset", name);
  applySteerTuning();      // pushes the new values into both the live sim and the UI
  refreshPresetButtons();
}
// A manual slider edit means the settings no longer match a named preset.
function clearPreset() { if (store.get("preset", null)) { store.set("preset", "custom"); refreshPresetButtons(); } }
function refreshPresetButtons() {
  const active = store.get("preset", "standard");
  for (const name of ["relax", "standard", "pro"]) {
    const btn = $("pm-preset-" + name);
    if (btn) btn.classList.toggle("active", name === active);
  }
}

// Which named steering step (if any) the current granular values correspond to.
function matchSteerLevel() {
  for (const n of STEER_LEVEL_ORDER) {
    const L = STEER_LEVELS[n];
    if (Object.keys(L).every((k) => store.get(k, STEER_DEFAULTS[k]) === L[k])) return n;
  }
  return null;
}
// Mirror the granular store values back onto the simplified controls so the two
// views never disagree (presets, Advanced edits and macros all stay in sync).
function refreshMacros() {
  const ts = store.get("tiltDeg", 6);
  if ($("pm-tiltsimple")) { $("pm-tiltsimple").value = ts; $("pm-tiltsimple-v").textContent = ts; }
  const lvl = matchSteerLevel();
  for (const n of STEER_LEVEL_ORDER) {
    const b = $("pm-steer-" + n); if (b) b.classList.toggle("active", n === lvl);
  }
  const dh = store.get("drivingHelp", 6);
  const hb = dh <= 4 ? "low" : dh <= 7 ? "med" : "high";
  for (const n of ["low", "med", "high"]) {
    const b = $("pm-help-" + n); if (b) b.classList.toggle("active", n === hb);
  }
  const rl = store.get("raceLine", 0);
  const lb = rl <= 0 ? "off" : rl >= 5 ? "full" : "corner";
  for (const n of ["off", "corner", "full"]) {
    const b = $("pm-line-" + n); if (b) b.classList.toggle("active", n === lb);
  }
}

function applySteerTuning() {
  const rate    = store.get("steerRate",  5);
  const expo    = store.get("steerExpo",  5);
  const smooth  = store.get("steerSmooth", 6);
  const tiltdeg = store.get("tiltDeg",    6);   // 6→32° for full lock (tuner optimum)
  const lock    = store.get("steerLock",  5);
  const spdsteer = store.get("steerSpeed", 5);
  const help    = store.get("drivingHelp", 6);
  const pace    = store.get("pace",       5);
  const line    = store.get("raceLine",   0);
  PACE           = paceFromSlider(pace);
  WHEELBASE      = wheelbaseFromSlider(rate);
  STEER_EXPO     = expoFromSlider(expo);
  STEER_MAX_SLIP = lockFromSlider(lock);
  STEER_SPEED_REF = speedRefFromSlider(spdsteer);
  ROAD_FOLLOW    = helpFromSlider(help);
  Input.setTiltSmoothing(cutoffFromSmooth(smooth));
  Input.setTiltSensitivity(tiltDegFromRange(tiltdeg));
  raceLineAssist = line / 5;
  $("pm-rate").value    = rate;    $("pm-rate-v").textContent    = rate;
  $("pm-expo").value    = expo;    $("pm-expo-v").textContent    = expo;
  $("pm-smooth").value  = smooth;  $("pm-smooth-v").textContent  = smooth;
  $("pm-tiltdeg").value = tiltdeg; $("pm-tiltdeg-v").textContent = tiltdeg;
  $("pm-lock").value    = lock;    $("pm-lock-v").textContent    = lock;
  $("pm-speedsteer").value = spdsteer; $("pm-speedsteer-v").textContent = spdsteer;
  $("pm-help").value    = help;    $("pm-help-v").textContent    = help;
  $("pm-pace").value    = pace;    $("pm-pace-v").textContent    = pace;
  $("pm-line").value    = line;    $("pm-line-v").textContent    = lineLabel(line);
  refreshPresetButtons();
  refreshMacros();
}
$("pm-rate").oninput = (e) => {
  const v = +e.target.value; store.set("steerRate", v);
  WHEELBASE = wheelbaseFromSlider(v); $("pm-rate-v").textContent = v; clearPreset();
};
$("pm-expo").oninput = (e) => {
  const v = +e.target.value; store.set("steerExpo", v);
  STEER_EXPO = expoFromSlider(v); $("pm-expo-v").textContent = v; clearPreset();
};
$("pm-smooth").oninput = (e) => {
  const v = +e.target.value; store.set("steerSmooth", v);
  Input.setTiltSmoothing(cutoffFromSmooth(v)); $("pm-smooth-v").textContent = v; clearPreset();
};
$("pm-tiltdeg").oninput = (e) => {
  const v = +e.target.value; store.set("tiltDeg", v);
  Input.setTiltSensitivity(tiltDegFromRange(v)); $("pm-tiltdeg-v").textContent = v; clearPreset();
};
$("pm-lock").oninput = (e) => {
  const v = +e.target.value; store.set("steerLock", v);
  STEER_MAX_SLIP = lockFromSlider(v); $("pm-lock-v").textContent = v; clearPreset();
};
$("pm-speedsteer").oninput = (e) => {
  const v = +e.target.value; store.set("steerSpeed", v);
  STEER_SPEED_REF = speedRefFromSlider(v); $("pm-speedsteer-v").textContent = v; clearPreset();
};
$("pm-help").oninput = (e) => {
  const v = +e.target.value; store.set("drivingHelp", v);
  ROAD_FOLLOW = helpFromSlider(v); $("pm-help-v").textContent = v; clearPreset();
};
$("pm-pace").oninput = (e) => {
  const v = +e.target.value; store.set("pace", v);
  PACE = paceFromSlider(v); $("pm-pace-v").textContent = v;
};
$("pm-line").oninput = (e) => {
  const v = +e.target.value; store.set("raceLine", v);
  raceLineAssist = v / 5; $("pm-line-v").textContent = lineLabel(v); clearPreset();
};
$("pm-preset-relax").onclick    = () => { applyPreset("relax");    if (soundOn) GameAudio.uiSelect(); };
$("pm-preset-standard").onclick = () => { applyPreset("standard"); if (soundOn) GameAudio.uiSelect(); };
$("pm-preset-pro").onclick      = () => { applyPreset("pro");      if (soundOn) GameAudio.uiSelect(); };

// ---- simplified controls: each fans out to the granular store keys ----
$("pm-tiltsimple").oninput = (e) => {
  store.set("tiltDeg", +e.target.value); clearPreset(); applySteerTuning();
};
function applySteerLevel(name) {
  const L = STEER_LEVELS[name]; if (!L) return;
  for (const k in L) store.set(k, L[k]);
  clearPreset(); applySteerTuning();
  if (soundOn) GameAudio.uiSelect();
}
for (const n of STEER_LEVEL_ORDER) $("pm-steer-" + n).onclick = () => applySteerLevel(n);
for (const n of ["low", "med", "high"]) $("pm-help-" + n).onclick = () => {
  store.set("drivingHelp", HELP_LEVELS[n]); clearPreset(); applySteerTuning();
  if (soundOn) GameAudio.uiSelect();
};
for (const n of ["off", "corner", "full"]) $("pm-line-" + n).onclick = () => {
  store.set("raceLine", LINE_LEVELS[n]); clearPreset(); applySteerTuning();
  if (soundOn) GameAudio.uiSelect();
};
$("adv-more").onclick = () => {
  const open = $("adv-extra").hidden;        // currently hidden → about to open
  $("adv-extra").hidden = !open;
  $("adv-more").setAttribute("aria-expanded", String(open));
  $("adv-more").innerHTML = open ? "ADVANCED &#9652;" : "ADVANCED &#9662;";
  if (soundOn) GameAudio.uiSelect();
};
// Any granular Advanced edit refreshes the simplified controls (events bubble up).
$("advanced-inner").addEventListener("input", refreshMacros);
applySteerTuning();
// GEARS toggle: show when thumbs are free (tilt or desktop keyboard).
function refreshGearsBtn() {
  $("pm-gears").hidden = Input.touchControlsNeeded() && steerMode !== "tilt";
  $("pm-gears").textContent = "GEARS: " + (manualMode ? "MANUAL" : "AUTO");
}
$("pm-gears").onclick = () => {
  manualMode = !manualMode;
  store.set("manual", manualMode);
  refreshGearsBtn();
  if (player && !gearsManual()) player.gear = naturalGear(player.speed);
  showTouchControls(true);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "race") setPaused(true);
});

// ---------- boot ----------
// Inert in production; only attaches when a test harness pre-sets the flag.
if (typeof window !== "undefined" && window.__APEX_DEBUG) {
  window.__APEX = { cars: () => cars, player: () => player, state: () => state, track: () => track };
}

syncCustomTeam();   // inject "MY TEAM" so saved selections and chips resolve
if (teamIdx < 0 || teamIdx >= Teams.LIST.length) teamIdx = 2;
if (driverIdx < 0 || driverIdx >= Teams.LIST[teamIdx].drivers.length) driverIdx = 0;
{ const hasSeason = season && season.round > 0 && season.round < Tracks.LIST.length;
  $("mb-standings").hidden = !hasSeason; }
Input.init(canvas, { onPause: () => setPaused(!paused) });
if (!Input.touchControlsNeeded()) { document.body.classList.add("desktop"); els.subtitle.textContent = "2026 grid · 24 real circuits"; }
Input.setSteerMode(steerMode);
DataHub.init(els.datahub);
$("pm-steer").textContent = steerLabel();
$("pm-calib").hidden = steerMode !== "tilt";
refreshGearsBtn();
setSound(soundOn);
setMusic(musicEnabled);
loadTrack(trackIdx);
window.addEventListener("resize", () => GLX.resize());
lastFrame = performance.now();
requestAnimationFrame(tick);

// --- debug / test hook (no effect unless explicitly called) ---
// Lets a test harness stage the camera anywhere on the track without having to
// drive there in real time (the software renderer used for screenshots is far
// too slow to reach distant corners). Examples, from page.evaluate:
//   __apex.park(0.25)              -> jump to 25% of the lap, field cleared, still
//   __apex.jump(0.5, 60, 2)        -> 50% of lap, 60 m/s, 2 m right of centre
window.__apex = {
  // place the player at fraction [0,1) of the lap; optional speed (m/s), x (m)
  jump(frac, speed, lateral) {
    if (!player || !track) return false;
    player.s = wrapS(frac * track.total);
    player.prog = frac * track.total;
    player.angle = 0;   // teleport aligns the car with the track (deterministic)
    if (lateral !== undefined) player.x = lateral;
    if (speed !== undefined) player.speed = speed;
    // Reset the world-space physics state to the new (s, x), heading aligned with
    // the track tangent. Done immediately (not lazily) so the car is deterministic
    // and probe() reads a correct heading offset right after a teleport.
    Tracks.sample(track, player.s, smp);
    player.px = smp.p[0] + smp.r[0] * player.x;
    player.pz = smp.p[2] + smp.r[2] * player.x;
    player.head = Math.atan2(smp.t[0], smp.t[2]);
    player.vLat = 0; player.yawRateCur = 0;
    // Sync render-interpolation anchors so lerpS(rPrevS, s, alpha) == s regardless
    // of renderAlpha — ensures the hood/cockpit camera is at exactly this position.
    player.rPrevS = player.s; player.rPrevX = player.x;
    return { s: player.s, total: track.total };
  },
  // skip the countdown straight into racing, shove the AI pack out of frame,
  // and park the (stationary) player at a fraction of the lap for a clean shot.
  park(frac, lateral) {
    if (!player || !track) return false;
    skyViewOverride = null;   // clear any sky override so normal chase cam resumes
    state = "race"; raceT = Math.max(raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    cars.forEach((c) => { if (!c.isPlayer) { c.prog -= 600; c.s = wrapS(c.s - 600); c.speed = 0; } });
    const r = this.jump(frac, 0, lateral !== undefined ? lateral : 0);
    frozen = true;   // hold the scene still for a deterministic screenshot
    return r;
  },
  // Like park(), but orients the camera toward the horizon so clouds and sky
  // gradient are clearly visible. Eye sits 7 m above track; target is 25 m ahead
  // and 14 m higher — giving ~24° upward tilt, centred in the FOV-75 frustum.
  // Returns the same value as park(), or false when the track isn't loaded yet.
  sky(frac, lateral) {
    const r = this.park(frac, lateral);
    if (!r) return false;
    dbgCam = null;   // sky uses skyViewOverride, which a live view()/orbit() free-cam would otherwise mask
    Tracks.sample(track, player.s, smp);
    // Stand low and aim STEEPLY up the road so the horizon drops to the lower third
    // and the frame fills with sky/clouds (was only ~15° up — barely any sky).
    const e = [smp.p[0], smp.p[1] + 3.5, smp.p[2]];
    const t = [
      smp.p[0] + smp.t[0] * 20,
      smp.p[1] + 34,            // ~58° up over 20 m → horizon low, sky dominant
      smp.p[2] + smp.t[2] * 20,
    ];
    skyViewOverride = { eye: e, tgt: t, fov: 78 };
    // snap immediately so the very first rendered frame is correct
    camEye[0] = e[0]; camEye[1] = e[1]; camEye[2] = e[2];
    camTgt[0] = t[0]; camTgt[1] = t[1]; camTgt[2] = t[2];
    camFov = 75;
    return r;
  },
  // Get or set the player camera mode (CHASE / FAR / COCKPIT / HOOD). Called with
  // no argument it returns the current mode; with a mode id ("cockpit"), label, or
  // index it switches and persists. Mirrors the in-game CAM button / C key.
  camera(m) {
    if (m == null) return { mode: CAM_MODES[camMode].id, index: camMode, modes: CAM_MODES.map((c) => c.id) };
    let i = typeof m === "number" ? m : CAM_MODES.findIndex((c) => c.id === String(m).toLowerCase());
    if (i < 0 || i >= CAM_MODES.length) return false;
    dbgCam = null;   // switching to a game camera mode leaves any view() free-cam
    setCamMode(i);
    return { mode: CAM_MODES[camMode].id, index: camMode };
  },
  // Instantly snap the camera to the correct position for the current camera mode,
  // bypassing exponential damping. Call after park()/jump() so the very first
  // rendered frame shows a clean view. Handles every mode (cockpit/chase/heli/…)
  // via the shared camVantage() solver.
  snapCam() {
    if (!player || !track) return;
    dbgCam = null;   // snapping the game camera leaves any view() free-cam override
    const bankCam = Tracks.banking(track, player.s, player.x);
    const v = camVantage(CAM_MODES[camMode].id, player.s, player.x, player.speed, 0, {
      bankDy: bankCam ? bankCam.dy : 0, deploy: player.deploying, slipLat: player.vLat || 0,
    });
    camEye[0] = v.eye[0]; camEye[1] = v.eye[1]; camEye[2] = v.eye[2];
    camTgt[0] = v.tgt[0]; camTgt[1] = v.tgt[1]; camTgt[2] = v.tgt[2];
    camFov = v.fov;
  },
  // previewCam(mode, frac, speed, lat) — set the debug free-cam to EXACTLY how the
  // in-game camera `mode` (any of camera().modes: chase/heli/drift/cinematic/…)
  // would frame the car at lap-fraction `frac`, doing `speed` m/s (default 60),
  // `lat` m off centre (default 0). Non-destructive: it only positions the debug
  // cam — the car isn't moved — so you can preview or screenshot any mode's framing
  // anywhere without driving there. Cleared by camera()/snapCam() like other debug
  // cams. Returns { eye, target, fov, mode }. e.g. previewCam("drift", 0.21, 65).
  previewCam(mode, frac = 0, speed = 60, lat = 0) {
    if (!track) return false;
    const m = String(mode).toLowerCase();
    if (!CAM_MODES.some((c) => c.id === m)) return false;
    const s = (((frac % 1) + 1) % 1) * track.total;
    const v = camVantage(m, s, lat, speed, 0, {});
    dbgCam = { eye: v.eye.slice(), target: v.tgt.slice(), fov: v.fov, far: 6000 };
    return { eye: v.eye, target: v.tgt, fov: +v.fov.toFixed(1), mode: m };
  },
  // track reflects the ACTIVE race track — null at the menu/select even though a
  // track is loaded for the background flyby (matches the documented contract).
  info: () => ({ state, track: (state === "race" || state === "count") ? (track && track.def.id) : null, n: track && track.n, total: track && track.total, timeTrial, seasonMode }),
  // Reports the camera ACTUALLY being rendered: the view() debug free-cam when
  // one is active, otherwise the game camera. `debug` flags which. (Previously
  // this always returned the game cam, masking an active view() override.)
  camState: () => dbgCam
    ? { eye: Array.from(dbgCam.eye), tgt: Array.from(dbgCam.target), fov: dbgCam.fov, debug: true }
    : { eye: Array.from(camEye), tgt: Array.from(camTgt), fov: camFov, debug: false },
  // Debug: hide/show individual track meshes. e.g. meshToggle({props:true}) hides props.
  meshToggle(o) { hideMeshes = Object.assign({}, hideMeshes, o || {}); return hideMeshes; },
  // Return all track nodes within radius r of world position (wx, wz).
  // Useful for finding self-intersecting sections and locating nearby geometry.
  nodesNear(wx, wz, r) {
    if (!track) return [];
    const r2 = r * r, out = [];
    for (let i = 0; i < track.n; i++) {
      const dx = track.px[i] - wx, dz = track.pz[i] - wz;
      if (dx * dx + dz * dz < r2)
        out.push({ i, frac: +(i / track.n).toFixed(4), x: +track.px[i].toFixed(2), y: +track.py[i].toFixed(2), z: +track.pz[i].toFixed(2) });
    }
    return out;
  },
  // World position and orientation of a track node by fraction (0-1).
  nodeAt(frac) {
    if (!track) return null;
    const k = Math.round(frac * track.n) % track.n;
    return { k, frac: +(k / track.n).toFixed(4), x: +track.px[k].toFixed(3), y: +track.py[k].toFixed(3), z: +track.pz[k].toFixed(3), tx: +track.tx[k].toFixed(3), tz: +track.tz[k].toFixed(3), rx: +track.rx[k].toFixed(3), rz: +track.rz[k].toFixed(3) };
  },
  // Player telemetry for steering tests: lateral offset x (m, +=right of centre),
  // heading offset angle (rad, relative to track tangent), local curvature k
  // (rad/m, +=right turn), half-width hw (m), speed (m/s) and arc position s.
  probe() {
    if (!player || !track) return null;
    Tracks.sample(track, player.s, smp);
    // Heading offset = how far the car points off the track tangent, + = turned
    // right (toward +x). In world space head is subtracted from the tangent, so
    // (tangentAngle - head) recovers the same +right convention as the old model.
    let angle = 0;
    if (player.head != null) {
      const tAng = Math.atan2(smp.t[0], smp.t[2]);
      angle = tAng - player.head;
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
    }
    return {
      x: player.x, angle,
      k: Tracks.curvature(track, player.s),
      hw: smp.hw,
      speed: player.speed, s: player.s,
    };
  },
  // Look-ahead road sampler for closed-loop driving (the autopilot harness):
  // curvature k (rad/m, +=right) and half-width hw at distAhead metres in front of
  // the player. Pass an array of distances to get one reading each, e.g. for
  // picking the sharpest corner inside a braking window. Pure read — no state change.
  scan(distAhead) {
    if (!player || !track) return null;
    const one = (d) => {
      const s = wrapS(player.s + (d || 0));
      Tracks.sample(track, s, smp);
      return { s, k: Tracks.curvature(track, s), hw: smp.hw, slope: smp.t[1] || 0 };
    };
    return Array.isArray(distAhead) ? distAhead.map(one) : one(distAhead);
  },
  // Phase-1 migration check: take a track point (s, lateral), build its world
  // position the same way the renderer/physics do (centre + right*lateral), then
  // project that world point back with Tracks.project and report both, so a test
  // can verify the world<->(s,x) round-trip before we move physics to world space.
  projTest(frac, lateral) {
    if (!track) return null;
    const s = wrapS((frac || 0) * track.total);
    const lat = lateral || 0;
    Tracks.sample(track, s, smp);
    const wx = smp.p[0] + smp.r[0] * lat;
    const wz = smp.p[2] + smp.r[2] * lat;
    const p = Tracks.project(track, wx, wz, s);
    let ds = p.s - s; const L = track.total;
    while (ds > L / 2) ds -= L; while (ds < -L / 2) ds += L;
    return { s, lat, world: [wx, wz], got: { s: p.s, lat: p.lat, dist: p.dist },
             err: { s: ds, lat: p.lat - lat } };
  },
  // Console health-check for the world-space migration.
  // Run window.__apex.wsInfo() while driving to see live position/heading.
  wsInfo() {
    if (!player || player.px == null) return "world-space not yet initialized";
    return { pos: [+player.px.toFixed(1), +player.pz.toFixed(1)],
             head: +(player.head * 180 / Math.PI).toFixed(1) + "°",
             s: +player.s.toFixed(1), x: +player.x.toFixed(2) };
  },
  // Live values the steering sliders map to — for tests/diagnostics. Each slider
  // moving should move its value here (and the car's behaviour).
  tuning() {
    return {
      wheelbase: WHEELBASE,            // RESPONSE (shorter = snappier)
      expo: STEER_EXPO,                // LINEARITY
      maxSlip: STEER_MAX_SLIP,         // STEER LOCK
      speedRef: STEER_SPEED_REF,       // SPEED STEER (higher = sharper at speed)
      drift: DRIFT,                    // SLIDE (rear looseness)
      roadFollow: ROAD_FOLLOW,         // DRIVING HELP steer-assist gain
      playerGrip: PLAYER_GRIP,         // forgiveness headroom over AI grip
      frontGrip: FRONT_GRIP,           // front friction bias (understeer-safety)
      yawDamp: YAW_DAMP,               // yaw damping
      yawInertia: YAW_INERTIA,         // rotational-inertia scale (turn-in speed)
      pace: PACE,                      // OVERALL SPEED (player + AI)
      raceLineAssist,                  // RACING LINE
      maxTilt: Input.maxTilt,          // TILT SENSITIVITY (deg for full lock)
      deadzone: Input.deadzone,        // fixed dead zone (deg) — no longer a slider
      tiltCutoff: Input.minCutoff,     // STEER SMOOTHING (One-Euro min-cutoff, Hz)
    };
  },
  // Richer player physics readout for drift/grip tests: world heading + the
  // lateral slip velocity and slip angle the tier-b model produces.
  physState() {
    if (!player || player.px == null) return null;
    const slip = Math.atan2(player.vLat || 0, Math.max(1, player.speed));
    Tracks.sample(track, player.s, smp);
    const axFrac = Math.min(1, Math.abs(player.axEstSm ?? 0) / (LONG_GRIP * gripMult()));
    return {
      s: player.s, x: player.x, speed: player.speed, prog: player.prog,
      head: player.head, vLat: player.vLat || 0,
      slipDeg: slip * 180 / Math.PI, slope: smp.t[1] || 0,
      wrongWay: !!player.wrongWay, rescueT: player.rescueT || 0, lap: player.lap,
      axEstSm: +(player.axEstSm ?? 0).toFixed(2),
      axFrac: +axFrac.toFixed(3),
      slipFactor: +Math.sqrt(Math.max(0, 1 - axFrac * axFrac)).toFixed(3),
    };
  },
  // Driving-boundary stats for the current track (both sides, all nodes): the
  // tightest/widest lateral limit and the closest-to-the-edge any barrier sits.
  // For verifying every track keeps the car off the models and is recoverable.
  wallStats() {
    if (!track || !track.barR) return null;
    let minB = Infinity, maxB = -Infinity, minOverHw = Infinity, anyNaN = false;
    for (let k = 0; k < track.n; k++) {
      const r = track.barR[k], l = track.barL[k];
      if (!Number.isFinite(r) || !Number.isFinite(l)) anyNaN = true;
      minB = Math.min(minB, r, l); maxB = Math.max(maxB, r, l);
      minOverHw = Math.min(minOverHw, r - track.hw[k], l - track.hw[k]);
    }
    return { minB, maxB, minOverHw, anyNaN, street: !!track.street, n: track.n };
  },
  // Largest amount any (non-finished) car is currently OUTSIDE its per-side
  // barrier — should stay ~0, proving nothing (player or AI) clips through a wall.
  maxWallOvershoot() {
    if (!track || !track.barR) return null;
    let m = 0;
    for (const c of cars) {
      if (c.finished) continue;
      const wr = Tracks.wallAt(track, c.s, 1), wl = Tracks.wallAt(track, c.s, -1);
      m = Math.max(m, c.x - wr, -wl - c.x, 0);
    }
    return m;
  },
  // Set physics params directly (bypassing the sliders) for deterministic A/B
  // tests and on-device tuning. Any omitted field is left unchanged.
  setPhysics(o) {
    o = o || {};
    if (o.drift != null) DRIFT = o.drift;
    if (o.pace != null) PACE = o.pace;
    if (o.speedRef != null) STEER_SPEED_REF = o.speedRef;
    if (o.wheelbase != null) WHEELBASE = o.wheelbase;
    if (o.expo != null) STEER_EXPO = o.expo;
    if (o.maxSlip != null) STEER_MAX_SLIP = o.maxSlip;
    if (o.roadFollow != null) ROAD_FOLLOW = o.roadFollow;
    // core dynamic-model feel levers (swept by the emulation/tuning harness)
    if (o.playerGrip != null) PLAYER_GRIP = o.playerGrip;
    if (o.frontGrip != null) FRONT_GRIP = o.frontGrip;
    if (o.yawDamp != null) YAW_DAMP = o.yawDamp;
    if (o.yawInertia != null) YAW_INERTIA = o.yawInertia;
    // Tilt sliders (routed to the Input module): sensitivity (MAX_TILT, deg for
    // full lock), dead zone (deg) and smoothing (slew, units/s). Lets the tilt
    // tuner sweep them the same way as the handling params.
    if (o.maxTilt != null) Input.setTiltSensitivity(o.maxTilt);
    if (o.deadzone != null) Input.setTiltDeadzone(o.deadzone);
    if (o.tiltCutoff != null) Input.setTiltSmoothing(o.tiltCutoff);
    return this.tuning();
  },

  // setSpeed(v) — instantly set the player's forward speed (m/s, clamped 0–200).
  // Handy for scripted scenarios: drive into a corner at a specific entry speed,
  // test overspeed physics, or freeze the car for a screenshot without cutting
  // the throttle (which would coast). Does not affect heading or yaw rate.
  setSpeed(v) {
    if (!player || player.px == null) return false;
    player.speed = Math.max(0, Math.min(200, v));
    return { speed: player.speed };
  },

  // spin(deg) — add a heading offset to the player (degrees, +CW viewed from above).
  // Simulates a snap-oversteer or a scripted orientation change. Zeroes lateral
  // velocity and yaw rate after rotating so the car doesn't immediately un-spin.
  // Use spin(180) to face the wrong way, spin(-45) for a 45° drift setup.
  spin(deg) {
    if (!player || player.px == null) return false;
    player.head = player.head + deg * Math.PI / 180;
    player.vLat = 0;
    player.yawRateCur = 0;
    return { head: +(player.head * 180 / Math.PI).toFixed(1) + "°" };
  },

  // nudge(dLat, dSpeed) — add an instantaneous lateral impulse (m/s, +right of
  // travel) and/or a forward speed delta (m/s).  Good for scripted track
  // position tests: push the car toward a barrier, simulate a kerb hop, or give
  // a standing-start bump without calling jump().  Both args default to 0.
  nudge(dLat = 0, dSpeed = 0) {
    if (!player || player.px == null) return false;
    if (dLat)   player.vLat  = (player.vLat || 0) + dLat;
    if (dSpeed) player.speed = Math.max(0, (player.speed || 0) + dSpeed);
    return { speed: +(player.speed || 0).toFixed(2), vLat: +(player.vLat || 0).toFixed(2) };
  },

  // Debug free camera for surveying track layouts/scenery — look at anything.
  // Call with no args (or "chase") to restore the chase cam. Option forms:
  //   {}                                       aerial of the whole track
  //   { s, radius }                            focus a lap-fraction s
  //   { azimuth, elevation, zoom, fov, fog }   aerial/focus framing (degrees)
  //   { s, side, dist, height, look }          stand TRACKSIDE at s, look outward
  //                                            (side "L"/"R"/±1; look:"in" faces track)
  //   { eye:[x,y,z], yaw, pitch, fov }         free-look from a point (degrees)
  //   { eye:[x,y,z], target:[x,y,z], fov }     fully explicit
  // Returns the resolved {eye, target, ...}.
  view(opts) {
    if (!track) return false;
    // Only an explicit "chase" restores the game camera. view() with NO args is the
    // documented whole-track aerial — fall through to the bbox branch below (it was
    // wrongly short-circuiting to chase, so view() framed the road instead).
    if (opts === "chase" || (opts && opts.mode === "chase")) { dbgCam = null; return { mode: "chase" }; }
    opts = opts || {};
    // free-look: explicit eye, aimed by yaw (0 = -Z, +90 = +X) and pitch (deg)
    if (opts.eye && (opts.yaw != null || opts.pitch != null)) {
      const yaw = (opts.yaw || 0) * Math.PI / 180, pit = Math.min(80, Math.max(-80, opts.pitch || 0)) * Math.PI / 180;
      const d = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
      const e = opts.eye;
      dbgCam = { eye: e.slice(), target: [e[0] + d[0] * 100, e[1] + d[1] * 100, e[2] + d[2] * 100], fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
      return { eye: e.slice(), yaw: opts.yaw || 0, pitch: opts.pitch || 0 };
    }
    if (opts.eye && opts.target) {
      dbgCam = { eye: opts.eye.slice(), target: opts.target.slice(), fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
      return dbgCam;
    }
    // trackside survey: stand beside the track at fraction s, look out at the
    // scenery on `side` (or back at the track with look:"in")
    if (opts.s != null && opts.side != null) {
      Tracks.sample(track, opts.s * track.total, smp);
      const side = opts.side === "L" ? -1 : opts.side === "R" ? 1 : (opts.side || 1);
      const dist = opts.dist != null ? opts.dist : 14, height = opts.height != null ? opts.height : 9;
      const p = smp.p, r = smp.r;
      const eye = [p[0] + r[0] * side * dist, p[1] + height, p[2] + r[2] * side * dist];
      const target = opts.look === "in"
        ? [p[0], p[1] + 1, p[2]]
        : [p[0] + r[0] * side * (dist + 80), p[1] + height * 0.4, p[2] + r[2] * side * (dist + 80)];
      dbgCam = { eye, target, fov: Math.min(170, Math.max(1, opts.fov || 62)), far: opts.far || 6000, fog: opts.fog };
      return { eye, target };
    }
    // centre + span: a focus point at lap-fraction s, or the whole-track bbox
    let cx, cy, cz, span;
    if (opts.s != null) {
      Tracks.sample(track, opts.s * track.total, smp);
      cx = smp.p[0]; cy = smp.p[1]; cz = smp.p[2];
      span = Math.max(10, opts.radius || 180);
    } else {
      let nx = Infinity, xx = -Infinity, nz = Infinity, xz = -Infinity, ny = Infinity, xy = -Infinity;
      for (let i = 0; i < track.n; i++) {
        const x = track.px[i], z = track.pz[i], y = track.py[i];
        if (x < nx) nx = x; if (x > xx) xx = x; if (z < nz) nz = z; if (z > xz) xz = z;
        if (y < ny) ny = y; if (y > xy) xy = y;
      }
      cx = (nx + xx) / 2; cy = (ny + xy) / 2; cz = (nz + xz) / 2;
      span = Math.max(xx - nx, xz - nz);
    }
    const az = (opts.azimuth != null ? opts.azimuth : 35) * Math.PI / 180;
    const el = Math.min(85, Math.max(5, opts.elevation != null ? opts.elevation : 55)) * Math.PI / 180;
    const dist = span * (opts.zoom != null ? opts.zoom : 1.0) * 0.95 + 60;
    const eye = [
      cx + Math.cos(el) * Math.sin(az) * dist,
      cy + Math.sin(el) * dist,
      cz + Math.cos(el) * Math.cos(az) * dist,
    ];
    dbgCam = { eye, target: [cx, cy, cz], fov: Math.min(170, Math.max(1, opts.fov || 55)), far: Math.max(6000, dist * 4), fog: opts.fog };
    return { eye, target: [cx, cy, cz], span: Math.round(span) };
  },
  // Place the debug free-cam at a track-relative point and aim it at another —
  // far easier than hand-computing world coords for view({eye,target}). The eye
  // sits at lap-fraction `f`, `lat` m off the centreline (+right), `h` m up; it
  // looks at lap-fraction `lookF` (default f+0.01), `lookLat` off centre, `lookH`
  // up (default 1). Ideal for inspecting roadside geometry — verges, barriers,
  // berms — at eye level. e.g. eyeAt(0.116, 0, 2.5) ≈ a driver's-eye look ahead;
  // eyeAt(0.116, 40, 3, 0.116, 0) stands out in the scenery looking back at the
  // track edge.
  eyeAt(f, lat = 0, h = 2.5, lookF, lookLat = 0, lookH = 1) {
    if (!track) return false;
    Tracks.sample(track, ((f % 1) + 1) % 1 * track.total, smp);
    const eye = [smp.p[0] + smp.r[0] * lat, smp.p[1] + h, smp.p[2] + smp.r[2] * lat];
    const lf = lookF == null ? f + 0.01 : lookF;
    Tracks.sample(track, ((lf % 1) + 1) % 1 * track.total, smp2);
    const tgt = [smp2.p[0] + smp2.r[0] * lookLat, smp2.p[1] + lookH, smp2.p[2] + smp2.r[2] * lookLat];
    dbgCam = { eye, target: tgt, fov: 60, far: 6000 };
    return { eye, target: tgt };
  },
  // Orbit the debug free-cam around a track point at lap-fraction `f`: `az`
  // degrees around (0 = looking from +s/ahead), `el` degrees elevation, `dist` m
  // out, aimed `h` m above the point. Sweep `az` to inspect a spot (a prop, a
  // berm, a suspected gap) from every side without per-shot coord math.
  orbit(f, az = 35, el = 18, dist = 30, h = 1.5, opts = {}) {
    if (!track) return false;
    Tracks.sample(track, ((f % 1) + 1) % 1 * track.total, smp);
    const cx = smp.p[0], cy = smp.p[1] + h, cz = smp.p[2];
    const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
    // basis: track tangent = "ahead", right = smp.r
    const fwd = [smp.t[0], 0, smp.t[2]], rt = [smp.r[0], 0, smp.r[2]];
    const dir = [Math.cos(a) * fwd[0] + Math.sin(a) * rt[0], 0, Math.cos(a) * fwd[2] + Math.sin(a) * rt[2]];
    const eye = [cx + dir[0] * Math.cos(e) * dist, cy + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
    // Never let a low/negative elevation sink the eye under the ground (which
    // renders the track's underside through the terrain). Floor it just above road.
    eye[1] = Math.max(eye[1], smp.p[1] + 1.2);
    const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
    dbgCam = { eye, target: [cx, cy, cz], fov, far: opts.far || 6000, fog: opts.fog };
    return { eye, target: [cx, cy, cz], fov };
  },

  // cinematic(frac, opts) — auto outside-of-corner camera.  Reads the local track
  // curvature to put the camera on the outside of the bend so the car fills the
  // frame naturally.  Straight sections use a three-quarter chase angle.
  //   opts.dist  (default 60)   orbit radius
  //   opts.el    (default 18)   elevation degrees
  //   opts.h     (default 1.5)  look-at height above road
  //   opts.fov   (default 52)   field of view degrees
  //   opts.azOff (default 0)    extra azimuth twist on top of auto angle
  // Returns the same {eye, target, fov, az} object as orbit() plus the curvature k.
  cinematic(frac, opts = {}) {
    if (!track) return false;
    const fr = ((frac % 1) + 1) % 1;
    const k = Tracks.curvature(track, fr * track.total);
    // Outside of a right-hand (k>0) corner is the left side → az negative (cam left)
    // Outside of a left-hand (k<0) corner is the right side → az positive (cam right)
    // Strength scales with |k| up to a tight-hairpin cap so the angle doesn't over-rotate.
    const kAbs = Math.min(Math.abs(k), 0.05);
    const baseAz = k === 0 ? 35 : -(Math.sign(k)) * (70 + 40 * kAbs / 0.05);
    const az = baseAz + (opts.azOff || 0);
    const dist = opts.dist != null ? opts.dist : 60;
    const el   = opts.el   != null ? opts.el   : 18;
    const h    = opts.h    != null ? opts.h    : 1.5;
    const fov  = opts.fov  != null ? opts.fov  : 52;
    const res  = this.orbit(fr, az, el, dist, h, { fov, far: opts.far, fog: opts.fog });
    return res ? Object.assign(res, { az: +az.toFixed(1), k: +k.toFixed(5) }) : false;
  },

  // carOrbit(idx, az, el, dist, h, opts) — orbit the debug free-cam around any
  // car on the grid (0 = player).  `idx` indexes the same array as __apex.cars().
  // az/el/dist/h/opts are identical to orbit() but the basis is the car's own
  // heading rather than the track tangent, so az=0 is always behind the car,
  // az=180 is head-on.  Returns {eye, target, fov, carIdx, speed}.
  carOrbit(idx = 0, az = 180, el = 14, dist = 25, h = 1.0, opts = {}) {
    if (!track || !cars || !cars[idx]) return false;
    const c = cars[idx];
    // Derive world position from Frenet coords (s, x) — AI cars don't carry px/pz,
    // only the player does. This works for all cars.
    const s = ((c.s % track.total) + track.total) % track.total;
    Tracks.sample(track, s, smp);
    const cx = (c.isPlayer && c.px != null) ? c.px : smp.p[0] + smp.r[0] * (c.x || 0);
    const cz = (c.isPlayer && c.pz != null) ? c.pz : smp.p[2] + smp.r[2] * (c.x || 0);
    const cyf = smp.p[1] + h;
    // Heading basis: player has a real yaw (c.head); AI cars use the track tangent.
    const hd = (c.isPlayer && c.head != null) ? c.head : Math.atan2(smp.t[0], smp.t[2]);
    const fwdX = Math.sin(hd), fwdZ = Math.cos(hd);
    const rtX  = Math.cos(hd), rtZ  = -Math.sin(hd);
    const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
    const dir = [Math.cos(a) * fwdX + Math.sin(a) * rtX, 0, Math.cos(a) * fwdZ + Math.sin(a) * rtZ];
    const eye = [cx + dir[0] * Math.cos(e) * dist, cyf + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
    eye[1] = Math.max(eye[1], smp.p[1] + 1.2);   // keep the eye above ground (see orbit)
    const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
    dbgCam = { eye, target: [cx, cyf, cz], fov, far: opts.far || 4000, fog: opts.fog };
    return { eye, target: [cx, cyf, cz], fov, carIdx: idx, speed: +(c.speed || 0).toFixed(1) };
  },
  // dolly(f, fwd, right, up, opts) — place the debug free-cam at a track-relative
  // offset from the centreline at fraction f: `fwd` m along the track tangent
  // (negative = behind), `right` m across (+right of travel), `up` m above the road
  // surface. Looks toward opts.lookF (default f+0.015) at opts.lookLat m off centre
  // (default 0) and opts.lookH m up (default 1.5). opts.fov (default 58).
  // Example: dolly(0.22, -25, 18, 4) — 25 m behind Casino entry, 18 m to the right,
  // 4 m up, looking forward toward the corner apex.
  dolly(f, fwd = 0, right = 0, up = 5, opts = {}) {
    if (!track) return false;
    const fr = ((f % 1) + 1) % 1;
    Tracks.sample(track, fr * track.total, smp);
    const p = smp.p, t = smp.t, r = smp.r;
    const eye = [
      p[0] + t[0] * fwd + r[0] * right,
      p[1] + up,
      p[2] + t[2] * fwd + r[2] * right,
    ];
    const lf = ((((opts.lookF != null ? opts.lookF : f + 0.015) % 1) + 1) % 1);
    Tracks.sample(track, lf * track.total, smp2);
    const lr = opts.lookLat || 0, lh = opts.lookH != null ? opts.lookH : 1.5;
    const tgt = [smp2.p[0] + smp2.r[0] * lr, smp2.p[1] + lh, smp2.p[2] + smp2.r[2] * lr];
    dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
    return { eye, target: tgt };
  },

  // roadside(f, side, dist, h, opts) — camera standing beside the track at
  // fraction f, `dist` m from the centreline on `side` (+1 = right of travel,
  // -1 = left), `h` m above the road surface. opts.look controls aim:
  //   "fwd"  (default) — look forward in direction of travel
  //   "back"           — face oncoming traffic
  //   "in"             — look inward across the track
  //   "out"            — look outward into the scenery
  // opts.lookAhead: m ahead (or behind for "back") of the eye position that the
  //   camera aims at along the track (default 30). opts.fov (default 58).
  // Example: roadside(0.33, -1, 6, 2, { look:"in" }) — stand 6 m left of the
  // hairpin entry, 2 m up, looking across at the Armco.
  roadside(f, side = 1, dist = 10, h = 2.5, opts = {}) {
    if (!track) return false;
    const fr = ((f % 1) + 1) % 1;
    Tracks.sample(track, fr * track.total, smp);
    const p = smp.p, t = smp.t, r = smp.r;
    const eye = [p[0] + r[0] * side * dist, p[1] + h, p[2] + r[2] * side * dist];
    const la = opts.lookAhead != null ? opts.lookAhead : 30;
    const look = opts.look || "fwd";
    let tgt;
    if (look === "in") {
      tgt = [p[0] - r[0] * side * dist * 0.5, p[1] + 1, p[2] - r[2] * side * dist * 0.5];
    } else if (look === "out") {
      tgt = [p[0] + r[0] * side * (dist + 60), p[1] + h * 0.6, p[2] + r[2] * side * (dist + 60)];
    } else {
      const sign = look === "back" ? -1 : 1;
      const lf = ((fr + sign * la / track.total % 1) + 1) % 1;
      Tracks.sample(track, lf * track.total, smp2);
      tgt = [smp2.p[0], smp2.p[1] + 1, smp2.p[2]];
    }
    dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
    return { eye, target: tgt, look };
  },

  // tourShots(n, opts) — returns n orbit shot descriptors covering the circuit,
  // ready to pass straight to orbit(). Each entry: { frac, az, el, dist, label }.
  // opts.dist (default 80), opts.el (default 20), opts.azOffset (default 35)
  // rotates all azimuths by a fixed angle — useful to swing every shot to one side
  // to face a specific stand or feature.
  // opts.atCorners: true → place the shots ON the detected corner apexes (not even
  //   spacing) and frame each from the OUTSIDE of the bend, so a tour reads like a
  //   broadcast corner-by-corner rather than arbitrary slices. `n` then caps how
  //   many corners (sharpest first, replayed in lap order); omit n for all of them.
  // Example: for (const s of __apex.tourShots(16)) __apex.orbit(s.frac, s.az, s.el, s.dist)
  tourShots(n = 12, opts = {}) {
    if (!track) return [];
    const dist    = opts.dist     != null ? opts.dist     : 80;
    const el      = opts.el       != null ? opts.el       : 20;
    const azOff   = opts.azOffset != null ? opts.azOffset : 35;
    const shots   = [];
    if (opts.atCorners) {
      // Detect apexes (local curvature maxima) and frame each from the outside.
      const tn = track.n, total = track.total, kv = [];
      for (let k = 0; k < tn; k++) kv.push(Tracks.curvature(track, k / tn * total));
      let apex = [];
      for (let k = 0; k < tn; k++) {
        const a = (k - 1 + tn) % tn, b = (k + 1) % tn, ak = Math.abs(kv[k]);
        if (ak > 0.006 && ak >= Math.abs(kv[a]) && ak > Math.abs(kv[b])) apex.push({ k, ak });
      }
      apex.sort((p, q) => q.ak - p.ak);               // sharpest first
      if (n && apex.length > n) apex = apex.slice(0, n);
      apex.sort((p, q) => p.k - q.k);                 // then back into lap order
      apex.forEach((c, i) => {
        const k = kv[c.k];
        // Outside of a right-hander (k>0) is camera-left (az<0); left-hander → az>0.
        // Auto-angle ignores azOffset (the corner geometry dictates the side).
        const az = -(Math.sign(k)) * (70 + 40 * Math.min(Math.abs(k), 0.05) / 0.05);
        shots.push({ frac: +(c.k / tn).toFixed(4), az: +az.toFixed(1), el, dist, label: `corner-${String(i + 1).padStart(2, "0")}` });
      });
      return shots;
    }
    for (let i = 0; i < n; i++) {
      const frac = i / n;
      // Alternate azimuth side each shot so consecutive frames show the track
      // from opposite sides — avoids monotonous single-angle tours.
      const side  = i % 2 === 0 ? 1 : -1;
      const az    = azOff * side;
      shots.push({ frac: +frac.toFixed(4), az, el, dist, label: `shot-${String(i).padStart(2, "0")}` });
    }
    return shots;
  },

  // Ground/gap probe: the rendered terrain height at a track-relative point
  // (lap-fraction `f`, `lat` m off centre), plus the road surface height and the
  // gap between them. `terrainY` is null if no terrain covers the point. Use it
  // to find where the carved terrain leaves a prop floating: compare a barrier's
  // base height (≈ road grade + groundYAt) against terrainY just under it.
  groundY(f, lat = 0) {
    if (!track) return false;
    Tracks.sample(track, ((f % 1) + 1) % 1 * track.total, smp);
    const x = smp.p[0] + smp.r[0] * lat, z = smp.p[2] + smp.r[2] * lat;
    const ty = Tracks.terrainY(track, x, z);
    return { x: +x.toFixed(2), z: +z.toFixed(2), roadY: +smp.p[1].toFixed(3), terrainY: ty == null ? null : +ty.toFixed(3), gap: ty == null ? null : +(ty - smp.p[1]).toFixed(3) };
  },
  // Controlled side-by-side test: race state, two AI cars placed dead-even at a
  // mid-track straight with overlapping lateral positions and equal speed; every
  // other car (incl. the player) is shoved far away. Returns the two test ids.
  // Lets a harness measure pure side-by-side jitter without pack chaos.
  pair(frac, speed) {
    if (!track) return false;
    state = "race"; raceT = Math.max(raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    const f = frac == null ? 0.3 : frac, v = speed == null ? 55 : speed;
    const prog = f * track.total, s = wrapS(prog);
    const ai = cars.filter((c) => !c.isPlayer);
    const a = ai[0], b = ai[1];
    [a, b].forEach((c, i) => {
      c.prog = prog; c.s = s; c.speed = v;
      c.x = i === 0 ? 0.6 : -0.6;   // overlap within the ~2 m car width
      c.xVis = c.x; c.lap = 0; c.finished = false;
    });
    cars.forEach((c) => { if (c !== a && c !== b) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return { a: cars.indexOf(a), b: cars.indexOf(b) };
  },
  // Deliberate jam: pile N AI cars on top of each other at near-zero speed at a
  // mid-track point, rest of field shoved away. Used to test stuck-recovery —
  // a healthy AI should dig out and resume speed within a couple of seconds.
  jam(n) {
    if (!track) return false;
    state = "race"; raceT = Math.max(raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    const ai = cars.filter((c) => !c.isPlayer), m = Math.min(n || 5, ai.length);
    const prog = 0.5 * track.total;
    const ids = [];
    ai.forEach((c, i) => {
      if (i < m) {
        c.prog = prog + (i - m / 2) * 0.4;     // tightly stacked longitudinally
        c.s = wrapS(c.prog); c.speed = 2; c.x = (i - m / 2) * 0.3;  // and laterally
        c.xVis = c.x; c.lap = 0; c.finished = false; c.stuckT = 0;
        ids.push(cars.indexOf(c));
      } else { c.prog -= 800; c.s = wrapS(c.s - 800); }
    });
    cars.forEach((c) => { if (c.isPlayer) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return ids;
  },
  // Place ONE AI rival relative to the player for driver-vs-AI collision tests:
  // dProg metres ahead(+)/behind(−), dx metres to the right(+), matching the
  // player's speed. All other AI are shoved away so only this pair interacts.
  rival(dProg, dx) {
    if (!player || !track) return false;
    const ai = cars.find((c) => !c.isPlayer);
    if (!ai) return false;
    ai.prog = player.prog + (dProg || 0);
    ai.s = wrapS(player.s + (dProg || 0));
    ai.x = player.x + (dx || 0);
    ai.xVis = ai.x; ai.speed = player.speed; ai.finished = false; ai.lap = player.lap;
    cars.forEach((c) => { if (c !== ai && !c.isPlayer) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return { rival: cars.indexOf(ai) };
  },
  // Place several AI rivals relative to the player for multi-car collision tests:
  // list = [{ dProg, dx, speed }]. Unused AI are shoved far away. Returns indices.
  rivals(list) {
    if (!player || !track) return false;
    const ai = cars.filter((c) => !c.isPlayer);
    const used = [];
    (list || []).forEach((spec, i) => {
      const c = ai[i];
      if (!c) return;
      c.prog = player.prog + (spec.dProg || 0);
      c.s = wrapS(player.s + (spec.dProg || 0));
      c.x = player.x + (spec.dx || 0);
      c.xVis = c.x; c.speed = spec.speed != null ? spec.speed : player.speed;
      c.finished = false; c.lap = player.lap;
      used.push(c);
    });
    ai.forEach((c) => { if (!used.includes(c)) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return used.map((c) => cars.indexOf(c));
  },
  // Point the player relDeg degrees off the track tangent (180 = backwards) for
  // wrong-way / spin / rescue tests. Position/progress unchanged.
  aim(relDeg) {
    if (!player || !track || player.px == null) return false;
    Tracks.sample(track, player.s, smp);
    player.head = Math.atan2(smp.t[0], smp.t[2]) + (relDeg || 0) * Math.PI / 180;
    player.vLat = 0;
    return { head: player.head };
  },
  // skip the countdown but keep the grid intact, so the field races and packs
  // up normally — for observing pack behaviour (e.g. collision vibration).
  go() {
    state = "race"; raceT = Math.max(raceT, 0.5);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    return state;
  },
  // telemetry snapshot of every car, sorted by prog (leader first): lateral x,
  // arc-progress, speed and the in-contact timer. For measuring jitter.
  cars: () => cars.map((c, i) => ({
    id: i, x: +c.x.toFixed(3), xv: +((c.xVis !== undefined ? c.xVis : c.x)).toFixed(3),
    yaw: +(c.yawVis || 0).toFixed(4),
    prog: +c.prog.toFixed(2), speed: +c.speed.toFixed(2), lap: c.lap,
    ct: +(c.contactT || 0).toFixed(2), kerb: !!c.onKerb, p: !!c.isPlayer,
  })),
  // lap fractions of corner apexes (local maxima of |curvature|), for parking
  corners() {
    if (!track) return [];
    const n = track.n, total = track.total, kv = [];
    for (let k = 0; k < n; k++) kv.push(Math.abs(Tracks.curvature(track, k / n * total)));
    const res = [];
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      if (kv[k] > 0.006 && kv[k] >= kv[a] && kv[k] > kv[b]) res.push(+(k / n).toFixed(4));
    }
    return res;
  },
  // Load any circuit (by index or id, e.g. "monza") and start a normal race,
  // optionally forcing time of day ("day" | "night" | "default") and weather
  // ("dry" | "wet"). Skips the menus so a harness can grab a render of any track.
  race(trackRef, timeOfDay, weather) {
    const i = typeof trackRef === "number"
      ? trackRef
      : Tracks.LIST.findIndex((t) => t.id === trackRef);
    if (i == null || i < 0 || i >= Tracks.LIST.length) return false;
    trackIdx = i;
    seasonMode = false;
    timeTrial = false;
    raceLaps = GAME_LAPS;
    raceWeather = (weather === "wet" || weather === "overcast" || weather === "fog") ? weather : "dry";
    raceTimeOfDay = timeOfDay || "default";
    startRace();
    return { track: Tracks.LIST[i].id, timeOfDay: raceTimeOfDay, weather: raceWeather };
  },
  tt(trackRef, timeOfDay) {
    const i = typeof trackRef === "number"
      ? trackRef
      : Tracks.LIST.findIndex((t) => t.id === trackRef);
    if (i == null || i < 0 || i >= Tracks.LIST.length) return false;
    trackIdx = i;
    seasonMode = false;
    timeTrial = true;
    raceLaps = TT_LAPS;
    raceWeather = "dry";
    raceTimeOfDay = timeOfDay || "default";
    startRace();
    return { track: Tracks.LIST[i].id, timeTrial: true };
  },
  // Load an optional .glb car model at runtime (team meshes rebuild from it,
  // tinted per livery); resolves false and keeps the procedural car on failure.
  loadCarModel: (url) => loadCarModel(url),
  // Test helpers: override Input and pump physics at fixed dt.
  // setInput({ steer, throttle, brake }) — values held until clearInput().
  // step(dt, n) — run n physics ticks of dt seconds each (default 1 tick, 1/60 s).
  setInput(v) { _testInput = v || null; },
  clearInput() { _testInput = null; },
  step(dt, n) {
    const d = dt != null ? dt : 1 / 60, count = n != null ? n : 1;
    for (let i = 0; i < count; i++) update(d);
  },
  // Deterministic tilt emulation for the autopilot harness. `step(deg, dt)` runs a
  // raw tilt angle (deg) through the real tilt pipeline (One-Euro filter + dead
  // zone + MAX_TILT map + slew limiter) at an explicit timestep and returns the
  // resulting steer (-1..1); `steerToAngle(cmd)` inverts the map (steer→tilt deg)
  // so a controller can convert its steer command into a tilt; `reset()` clears the
  // filter/slew state between runs. Tilt params come from the sliders (tuning()).
  tiltSim: {
    step: (deg, dt) => Input.simTilt(deg, dt),
    reset: () => Input.simTiltReset(),
    steerToAngle: (cmd) => Input.steerToTilt(cmd),
  },

  // ── New dev / test helpers ─────────────────────────────────────────────────

  // Trigger the race-results screen cleanly, as if all cars crossed the line.
  // Fixes the fallback-DOM-hack in ui-audit.spec.js (finishRace was missing).
  finishRace() {
    if (!track || state === "results" || state === "menu") return false;
    cars.forEach((c) => { if (!c.finished) { c.finished = true; c.finishT = raceT; } });
    endRace();
    return { state };
  },

  // Get or set the frozen flag (true = physics paused, scene held still).
  // park() sets this automatically; expose it so tests can freeze/unfreeze.
  freeze(v) {
    if (v === undefined) return frozen;
    frozen = !!v;
    return frozen;
  },

  // Get or set HUD visibility. Returns current visible state.
  hud(show) {
    if (show === undefined) return !els.hud.hidden;
    els.hud.hidden = !show;
    if (show) { els.pausebtn.hidden = (state !== "race"); } else { els.pausebtn.hidden = true; }
    return !els.hud.hidden;
  },

  // Get or set race weather ("dry" | "wet" | "overcast" | "fog"). Wet drives rain.
  weather(w) {
    if (w === undefined) return raceWeather;
    raceWeather = (w === "wet" || w === "overcast" || w === "fog") ? w : "dry";
    if (soundOn) { if (raceWeather === "wet") GameAudio.startRain(); else GameAudio.stopRain(); }
    return raceWeather;
  },

  // Live time-of-day change without reloading assets. Sets the session time and
  // re-applies lighting; loadTrack() only rebuilds geometry when the night/day
  // state actually flips (dawn/dusk/night share one build; day is the other), so
  // switching among the three dark times is near-instant. Fast path for sweeps.
  setTimeOfDay(tod) {
    if (tod === undefined) return raceTimeOfDay;
    const valid = ["default", "dawn", "day", "dusk", "night"];
    raceTimeOfDay = valid.indexOf(tod) >= 0 ? tod : "default";
    loadTrack(trackIdx);
    applyRaceSettings();
    return raceTimeOfDay;
  },

  // Force-rescue the player immediately (same as auto-rescue after 3 s stuck).
  // Returns updated physState so the test can confirm repositioning.
  resetPlayer() {
    if (!player) return false;
    rescuePlayer(player);
    return this.physState();
  },

  // Detailed telemetry for a single car by index (from cars() list).
  carAt(idx) {
    const c = typeof idx === "number" ? cars[idx] : cars.find((x) => x.isPlayer);
    if (!c) return null;
    return {
      id: cars.indexOf(c), isPlayer: !!c.isPlayer, team: c.team && c.team.id,
      x: +c.x.toFixed(3), speed: +c.speed.toFixed(2),
      prog: +c.prog.toFixed(2), s: +c.s.toFixed(2), lap: c.lap,
      finished: !!c.finished, finishT: c.finishT != null ? +c.finishT.toFixed(2) : null,
      contactT: +(c.contactT || 0).toFixed(3),
      wrongWay: !!c.wrongWay, rescueT: +(c.rescueT || 0).toFixed(2),
    };
  },

  // List all available circuit IDs and names (for iterating in test harnesses).
  tracks: () => Tracks.LIST.map((t, i) => ({ id: t.id, name: t.name, i })),

  // List all teams with engine supplier (for factory-parts and setup tests).
  teams: () => Teams.LIST.map((t, i) => ({ id: t.id, name: t.name, engine: t.engine, i })),

  // Reset mesh-visibility overrides (companion to meshToggle).
  clearMeshes() { hideMeshes = {}; return hideMeshes; },

  // Combined debug snapshot: camera mode, frozen, dbgCam active, weather.
  // Lighting snapshot — ambient (sky/ground), the scene sun colour, exposure, and
  // how many point lights (floodlights) are active this frame. Handy for checking
  // whether a night scene is correctly dark + lit by floodlights vs washed out.
  lightState: () => ({
    ambientSky: frame.ambientSky && frame.ambientSky.slice(),
    ambientGround: frame.ambientGround && frame.ambientGround.slice(),
    sunColor: frame.sunColor && frame.sunColor.slice(),
    exposure: frame.exposure != null ? frame.exposure : 1,
    numLights: frame.lights ? frame.lights.length / 7 : 0,
    sunY: frame.sunDir ? frame.sunDir[1] : null,
    builtNight: builtTrackNight, trackNight: track && track._night,
    floodEmit: track && track._night ? "dark-session" : "day-session",
  }),
  viewState() {
    return {
      camMode: CAM_MODES[camMode].id, camIndex: camMode,
      frozen, dbgCamActive: dbgCam !== null, skyOverride: skyViewOverride !== null,
      weather: raceWeather, state,
      ...this.camState(),
    };
  },

  // ── Headless / RL control loop ─────────────────────────────────────────────

  // headless(on?) — get or set headless mode. When on, render() exits immediately
  // so physics can be stepped at uncapped speed via act() without GPU overhead.
  headless(on) {
    if (on === undefined) return headlessMode;
    headlessMode = !!on;
    return headlessMode;
  },

  // obs() — full debug observation of the current game state. Superset of
  // physState() and probe() with track context, barrier clearances, lookahead
  // scan, nearest rivals, reward components, and episode terminal flag.
  obs() {
    if (!player || player.px == null || !track) return null;
    Tracks.sample(track, player.s, smp);
    const axFrac = Math.min(1, Math.abs(player.axEstSm ?? 0) / (LONG_GRIP * gripMult()));
    const slipFactor = Math.sqrt(Math.max(0, 1 - axFrac * axFrac));
    const slip = Math.atan2(player.vLat || 0, Math.max(1, player.speed));
    const kNow = Tracks.curvature(track, player.s);
    const hwNow = smp.hw, slopeNow = smp.t[1] || 0;

    // barrier distances: wallAt() always returns a positive absolute distance from
    // centreline; the left wall sits at x = -wallLAbs (negative), right at +wallRAbs.
    const wallRAbs = Tracks.wallAt(track, player.s, 1);
    const wallLAbs = Tracks.wallAt(track, player.s, -1);
    const wallR =  wallRAbs;   // signed: right wall is at +wallR
    const wallL = -wallLAbs;   // signed: left  wall is at  wallL (negative)

    // lookahead scan at [10, 30, 60] m ahead
    const scanDists = [10, 30, 60];
    const scanAhead = scanDists.map((d) => {
      const ss = wrapS(player.s + d);
      Tracks.sample(track, ss, smp);
      const sR = Tracks.wallAt(track, ss, 1), sLA = Tracks.wallAt(track, ss, -1);
      return { d, k: +Tracks.curvature(track, ss).toFixed(5), hw: +smp.hw.toFixed(2),
               wallR: +sR.toFixed(2), wallL: +(-sLA).toFixed(2),
               width: +(sR + sLA).toFixed(2) };
    });
    // restore smp to player position
    Tracks.sample(track, player.s, smp);

    // nearest rivals by progress (leader-first order)
    const sorted = cars.slice().sort((a, b) => b.prog - a.prog);
    const pi = sorted.findIndex((c) => c.isPlayer);
    const rivalAhead  = pi > 0 ? sorted[pi - 1] : null;
    const rivalBehind = pi < sorted.length - 1 ? sorted[pi + 1] : null;

    const inp = _testInput || {};
    const done = !!player.wrongWay || (player.rescueT || 0) > 8;

    return {
      // ── position & progress ──
      s:       +player.s.toFixed(3),
      x:       +player.x.toFixed(3),
      prog:    +(player.prog || 0).toFixed(4),
      lap:      player.lap || 0,
      raceT:   +raceT.toFixed(3),

      // ── motion ──
      speed:     +(player.speed || 0).toFixed(2),
      speedKph:  +((player.speed || 0) * 3.6).toFixed(1),
      head:      +(player.head || 0).toFixed(4),
      vLat:      +(player.vLat || 0).toFixed(3),

      // ── combined-slip physics ──
      axEstSm:    +(player.axEstSm ?? 0).toFixed(2),
      axFrac:     +axFrac.toFixed(3),
      slipFactor: +slipFactor.toFixed(3),
      slipDeg:    +(slip * 180 / Math.PI).toFixed(2),

      // ── track context at player position ──
      k:     +kNow.toFixed(5),
      hw:    +hwNow.toFixed(2),
      slope: +slopeNow.toFixed(4),
      gripMult: gripMult(),
      weather: raceWeather,

      // ── barrier clearances (both in metres, positive = clear) ──
      wallR:  +wallR.toFixed(2),
      wallL:  +wallL.toFixed(2),
      clearR: +(wallR - player.x).toFixed(2),
      clearL: +(player.x - wallL).toFixed(2),

      // ── energy / ERS ──
      energy: +(player.energy || 0).toFixed(3),
      gear: player.gear || 1,

      // ── episode state flags ──
      wrongWay: !!player.wrongWay,
      offT:     +(player.offT || 0).toFixed(2),
      rescueT:  +(player.rescueT || 0).toFixed(2),
      done,

      // ── currently applied input (null fields = real device input) ──
      input: {
        steer:    inp.steer    !== undefined ? inp.steer    : null,
        throttle: inp.throttle !== undefined ? !!inp.throttle : null,
        brake:    inp.brake    !== undefined ? !!inp.brake    : null,
      },

      // ── rival proximity ──
      posInField: pi + 1,
      gapAhead:  rivalAhead  ? +(rivalAhead.prog  - (player.prog || 0)).toFixed(2) : null,
      gapBehind: rivalBehind ? +((player.prog || 0) - rivalBehind.prog).toFixed(2) : null,

      // ── lookahead ──
      scan: scanAhead,

      // ── reward components (combine as you see fit) ──
      reward: {
        speed:    +(player.speed || 0).toFixed(2),          // m/s forward — maximise
        offTrack: +(player.offT  || 0).toFixed(2),          // seconds off-track
        wallDist: +Math.min(wallR - player.x, player.x - wallL).toFixed(2), // m to nearer wall
        wrongWay: !!player.wrongWay,
      },
    };
  },

  // act(input, dt, n) — set input, step n ticks of dt seconds, return obs().
  // Single round-trip replaces three separate evaluate() calls in a control loop.
  // input: { steer: -1..1, throttle: bool, brake: bool }; pass null to keep current.
  act(input, dt, n) {
    if (!track || !player) return null;
    // auto-enter race state so physics advances even if called during countdown
    if (state === "count") {
      state = "race"; raceT = 0;
      els.lights.hidden = true;
      for (const l of els.lights.children) l.classList.remove("on");
    }
    if (input !== undefined) _testInput = input || null;
    const d = dt != null ? dt : 1 / 60, count = n != null ? n : 1;
    for (let i = 0; i < count; i++) update(d);
    return this.obs();
  },

  // ── Timing & field hooks ──────────────────────────────────────────────────

  // sectorState() — live S1/S2/S3 timing.
  // idx: current sector (0=S1, 1=S2, 2=S3). elapsed: seconds into it.
  // bests: personal-best times per sector (null until first completed lap).
  // last: sector times from the most recently completed lap.
  sectorState() {
    if (!player || !track) return null;
    const elapsed = (player.lapTime || 0) - sectorStartT;
    return {
      idx: sectorIdx,
      elapsed: +elapsed.toFixed(3),
      bests: sectorBests.map((v) => v === Infinity ? null : +v.toFixed(3)),
      last:  sectorLast.map((v) => v == null     ? null : +v.toFixed(3)),
    };
  },

  // lapHistory() — completed lap times for this session.
  // TT mode returns a full array via ttLaps[]; race mode returns only lastLap.
  lapHistory() {
    if (!player) return null;
    return {
      mode: timeTrial ? "tt" : "race",
      laps: timeTrial
        ? ttLaps.map((t, i) => ({ lap: i + 1, time: +t.toFixed(3) }))
        : [],
      best:    isFinite(player.best)  ? +player.best.toFixed(3)    : null,
      lastLap: player.lastLap != null ? +player.lastLap.toFixed(3) : null,
    };
  },

  // timing() — compact race-clock + ERS snapshot.
  // One call replaces physState() + obs() for lightweight telemetry consumers.
  timing() {
    if (!player || !track) return null;
    const sorted = cars.slice().sort((a, b) => b.prog - a.prog);
    const pi = sorted.findIndex((c) => c.isPlayer);
    const ahead  = pi > 0               ? sorted[pi - 1] : null;
    const behind = pi < sorted.length - 1 ? sorted[pi + 1] : null;
    return {
      raceT:         +raceT.toFixed(3),
      lapTime:       +(player.lapTime  || 0).toFixed(3),
      best:          isFinite(player.best) ? +player.best.toFixed(3) : null,
      lastLap:       player.lastLap != null ? +player.lastLap.toFixed(3) : null,
      lap:            player.lap || 0,
      pos:            pi + 1,
      total:          cars.length,
      gapAhead:      ahead  ? +(ahead.prog  - (player.prog || 0)).toFixed(2) : null,
      gapBehind:     behind ? +((player.prog || 0) - behind.prog).toFixed(2) : null,
      energy:        +(player.energy || 0).toFixed(3),
      gear:           player.gear || 1,
      sector:         sectorIdx + 1,
      sectorElapsed: +((player.lapTime || 0) - sectorStartT).toFixed(3),
    };
  },

  // fieldState() — full field sorted by race position (leader first).
  // gap: metres of track-arc behind the leader (0 for leader).
  fieldState() {
    if (!track || !cars.length) return null;
    const sorted = cars.slice().sort((a, b) => b.prog - a.prog);
    const leader = sorted[0];
    return sorted.map((c, pos) => ({
      pos:      pos + 1,
      id:       cars.indexOf(c),
      name:     c.name,
      code:     c.code,
      team:     c.team && c.team.id,
      isPlayer: !!c.isPlayer,
      lap:      c.lap || 0,
      frac:     +(c.s / track.total).toFixed(4),
      speed:    +c.speed.toFixed(2),
      gap:      +(leader.prog - c.prog).toFixed(2),
      finished: !!c.finished,
      finishT:  c.finishT != null ? +c.finishT.toFixed(2) : null,
    }));
  },

  // aiPlace(idx, frac, speed?, x?) — teleport an AI car (by cars[] index) to
  // the given lap fraction. Cannot move the player car; use jump() for that.
  // Returns the car's new state, or false on invalid input.
  aiPlace(idx, frac, speed, x) {
    if (!track || !cars[idx]) return false;
    const c = cars[idx];
    if (c.isPlayer) return false;
    c.s    = wrapS((frac != null ? frac : 0) * track.total);
    c.prog = (c.lap || 0) * track.total + (frac != null ? frac : 0) * track.total;
    if (x     !== undefined) { c.x = x; c.xVis = x; }
    if (speed !== undefined) c.speed = speed;
    c.vLat = 0; c.yawRateCur = 0;
    Tracks.sample(track, c.s, smp2);
    c.head = Math.atan2(smp2.t[0], smp2.t[2]);
    return { id: idx, frac: +(c.s / track.total).toFixed(4), speed: +c.speed.toFixed(2), x: +c.x.toFixed(3) };
  },

  // setEnergy(v) — set player ERS charge (0..1). Clamps silently.
  setEnergy(v) {
    if (!player) return false;
    player.energy = Math.max(0, Math.min(1, +v || 0));
    return { energy: +player.energy.toFixed(3) };
  },

  // setLap(n) — override the player's lap counter (for testing end-of-race
  // logic and results screen). Does not reset lapTime or sector state.
  setLap(n) {
    if (!player) return false;
    player.lap = Math.max(0, Math.floor(+n || 0));
    return { lap: player.lap };
  },

  // trackShape(n?) — returns n evenly-spaced 2D centerline points {frac,x,z,k}
  // normalised so the bounding box fits in [-1,1]×[-1,1]. Useful for comparing
  // the rendered track outline against a real-world circuit map.
  // Positive k = left curve, negative k = right curve (matches physics sign).
  trackShape(n) {
    if (!track) return null;
    const steps = Math.max(4, Math.min(2000, n != null ? Math.floor(+n) : 200));
    const xs = [], zs = [], ks = [], fracs = [];
    for (let i = 0; i < steps; i++) {
      const frac = i / steps;
      const s = frac * track.total;
      Tracks.sample(track, s, smp2);
      xs.push(smp2.p[0]);
      zs.push(smp2.p[2]);
      ks.push(Tracks.curvature(track, s));
      fracs.push(frac);
    }
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const scaleX = maxX - minX || 1, scaleZ = maxZ - minZ || 1;
    const scale = Math.max(scaleX, scaleZ);
    const ox = (scale - scaleX) / scale / 2, oz = (scale - scaleZ) / scale / 2;
    return fracs.map((f, i) => ({
      frac: +f.toFixed(4),
      x: +(ox + (xs[i] - minX) / scale).toFixed(4),
      z: +(oz + (zs[i] - minZ) / scale).toFixed(4),
      k: +ks[i].toFixed(5),
    }));
  },

  // trackProfile(n?) — sample the circuit at n evenly-spaced points (default 100,
  // max 1 000). Returns {frac, y, k, hw, slope} per point — useful for
  // elevation visualisation and curvature analysis without a live race.
  trackProfile(n) {
    if (!track) return null;
    const steps = Math.max(2, Math.min(1000, n != null ? Math.floor(+n) : 100));
    const out = [];
    for (let i = 0; i < steps; i++) {
      const frac = i / steps;
      const s = frac * track.total;
      Tracks.sample(track, s, smp2);
      out.push({
        frac:  +frac.toFixed(4),
        y:     +smp2.p[1].toFixed(3),
        k:     +Tracks.curvature(track, s).toFixed(5),
        hw:    +smp2.hw.toFixed(2),
        slope: +(smp2.t[1] || 0).toFixed(4),
      });
    }
    return out;
  },

  // mapPts() — returns the normalised [0,1] centerline pts stored in track.map
  // (the same array used by the minimap and track-selector canvas). Each entry
  // is [x, y] where x=0..1 east and y=0..1 with 0=north (top of map).
  // Useful for asserting minimap orientation without relying on screenshots.
  mapPts() {
    return track ? track.map.slice() : null;
  },

  // trackBounds() — bounding box of the loaded circuit in world metres plus the
  // frac closest to the geographic centre. Handy for framing top-down orbit()
  // shots: __apex.orbit(__apex.trackBounds().centerFrac, 0, 85, dist).
  trackBounds() {
    if (!track) return null;
    const px = track.px, pz = track.pz, n = track.n;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      if (px[i] < minX) minX = px[i]; if (px[i] > maxX) maxX = px[i];
      if (pz[i] < minZ) minZ = pz[i]; if (pz[i] > maxZ) maxZ = pz[i];
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    let bestD = Infinity, bestI = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(px[i] - cx, pz[i] - cz);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return {
      minX: +minX.toFixed(1), maxX: +maxX.toFixed(1),
      minZ: +minZ.toFixed(1), maxZ: +maxZ.toFixed(1),
      spanX: +(maxX - minX).toFixed(1), spanZ: +(maxZ - minZ).toFixed(1),
      centerFrac: +(bestI / n).toFixed(4),
    };
  },

  // reset(frac, speed, x) — fast episode reset reusing the loaded track.
  // Reinitialises the grid, repositions the player at lap-fraction frac (0..1),
  // sets state="race" and raceT=0 without reloading assets. Returns initial obs().
  // Call __apex.race() first to load the desired track.
  reset(frac, speed, x) {
    if (!track || !player) return false;
    gridUp();
    state = "race"; raceT = 0;
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    player.s     = wrapS((frac  != null ? frac  : 0) * track.total);
    player.prog  = (frac != null ? frac : 0) * track.total;
    player.speed = speed != null ? speed : 0;
    player.x     = x     != null ? x     : 0;
    player.xVis  = player.x;
    player.vLat  = 0; player.yawRateCur = 0;
    player.lap   = 0; player.axEstSm = 0;
    // seed world-space position + heading from (s, x) immediately, same as jump()
    Tracks.sample(track, player.s, smp);
    player.px   = smp.p[0] + smp.r[0] * player.x;
    player.pz   = smp.p[2] + smp.r[2] * player.x;
    player.head = Math.atan2(smp.t[0], smp.t[2]);
    _testInput = null;
    return this.obs();
  },

  // f1api — raw access to the F1API module (Jolpica + OpenF1) used by the
  // data hub. Call e.g. __apex.f1api.schedule() or __apex.f1api.lastRace()
  // from the console; all methods return Promises.
  f1api: typeof F1API !== "undefined" ? F1API : null,

  // openf1(path) — direct OpenF1 fetch, returns parsed JSON.
  // Example: __apex.openf1("/sessions?circuit_short_name=Monaco&year=2024")
  //          __apex.openf1("/location?session_key=9149&driver_number=1")
  openf1(path) {
    return fetch("https://api.openf1.org/v1" + path).then(r => r.json());
  },

  // jolpica(path) — direct Jolpica (Ergast-compatible) fetch, returns parsed JSON.
  // Example: __apex.jolpica("/circuits/monaco.json")
  //          __apex.jolpica("/2024/5/results.json")  (round 5 = Monaco 2024)
  jolpica(path) {
    return fetch("https://api.jolpi.ca/ergast/f1" + path).then(r => r.json());
  },

  // fetchTrackOutline(sessionKey, driverNumber?) — fetches OpenF1 location data
  // for a session and returns normalised {x,z}[] track outline points (≤400 pts).
  // Find sessionKey via: __apex.openf1("/sessions?circuit_short_name=Monaco&year=2024")
  async fetchTrackOutline(sessionKey, driverNumber) {
    const drv = driverNumber || 1;
    const rows = await fetch(
      "https://api.openf1.org/v1/location?session_key=" + sessionKey + "&driver_number=" + drv
    ).then(r => r.json());
    if (!Array.isArray(rows) || !rows.length) return null;
    const xs = rows.map(r => r.x), zs = rows.map(r => r.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const scale = Math.max(maxX - minX, maxZ - minZ) || 1;
    // Downsample to ≤400 points for readability
    const step = Math.max(1, Math.floor(rows.length / 400));
    return rows
      .filter((_, i) => i % step === 0)
      .map(r => ({
        x: +((r.x - minX) / scale).toFixed(4),
        z: +((r.y - minZ) / scale).toFixed(4),
      }));
  },
};

})();
