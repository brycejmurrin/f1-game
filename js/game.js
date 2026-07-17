/* Apex 26 — main game: state machine, physics, AI, race logic, HUD.
   Contract: docs/ARCHITECTURE.md. Depends on globals M4,V3,GLX,Teams,Tracks,
   Car3D,Input,GameAudio,F1API,DataHub; optionally Gfx/WGX for WebGPU. */
(async function () {
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

// Renderer selection. WebGPU is OPT-IN: only tried when the user set
// apex26.gfxBackend=webgpu AND the browser exposes WebGPU. Anything else — and
// ANY WebGPU init failure — uses the WebGL2 backend (GLX) exactly as before, so
// the default path stays byte-for-byte identical (this async IIFE only actually
// awaits when opted in; otherwise it runs fully synchronously). `gfx` is the
// handle every later renderer call goes through; on the default path gfx===GLX.
let gfx = null;
try {
  let optIn = false;
  try { optIn = localStorage.getItem("apex26.gfxBackend") === "webgpu"; } catch (_) {}
  if (optIn && typeof Gfx !== "undefined" && navigator.gpu) {
    const wgx = await Gfx.create(canvas, {});
    if (wgx) {
      // Route EVERY renderer call site onto the WebGPU backend — not just game.js
      // but the other modules that call the GLX global directly (tracks.js mesh
      // build, car3d.js, liverytex.js, ghost.js). Copy WGX's methods + live
      // getters (width/height/aspect) onto the GLX object so `GLX.foo()` anywhere
      // delegates to WebGPU. GLX's own WebGL context is never initialised here.
      try { Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(wgx)); gfx = GLX; }
      catch (_) { gfx = null; }
    }
  }
} catch (_) { gfx = null; }
if (!gfx) { if (!GLX.init(canvas)) { $("nogl").hidden = false; return; } gfx = GLX; }

// ---------- rain overlay ----------
const rainCanvas = document.createElement("canvas");
rainCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;display:none;";
document.body.appendChild(rainCanvas);
const rainCtx2d = rainCanvas.getContext("2d");
let rainDrops = [];
let _lastFloodEmit = 0;   // prop-emissive ramp actually used this frame (debug: lightState)
function initRainDrops() {
  rainCanvas.width = window.innerWidth;
  rainCanvas.height = window.innerHeight;
  // DRIZZLE tier: "wet" (damp track, no storm) gets a sparse, shorter, slower
  // field — light precipitation that reads as drizzle, not a downpour. "rain"
  // keeps the full storm density.
  const drizzle = isWetRoad() && !isRaining();
  rainDrops = Array.from({ length: Math.round(LT.rainCount * (drizzle ? 0.3 : 1)) }, () => ({
    x: Math.random() * rainCanvas.width,
    y: Math.random() * rainCanvas.height,
    len: (14 + Math.random() * 22) * LT.rainStreak * (drizzle ? 0.5 : 1),
    speed: (380 + Math.random() * 360) * (drizzle ? 0.6 : 1),
    opacity: 0.16 + Math.random() * 0.34,
  }));
}
function drawRain(dt) {
  const w = rainCanvas.width, h = rainCanvas.height;
  rainCtx2d.clearRect(0, 0, w, h);
  rainCtx2d.lineWidth = 1;
  // Constant colour + a single averaged alpha so every drop rides ONE batched path
  // (one beginPath/stroke instead of one per drop). The blur/motion of a rain field
  // hides that the per-drop opacity is now uniform. Drizzle draws fainter.
  rainCtx2d.strokeStyle = "#afc8e8";
  rainCtx2d.globalAlpha = isRaining() ? 0.25 : 0.16;   // ~mean of the 0.16..0.50 per-drop range
  // SPEED-REACTIVE streaks: at speed the rain shears toward the camera's motion
  // and stretches into driving streaks (apparent velocity = fall + car speed).
  // Render-only — reads player.speed, never writes physics state.
  const vk = clamp(((player && player.speed) || 0) / 90, 0, 1);
  const wind = LT.rainWind + vk * 0.9;
  const lenMul = 1 + vk * 2;
  rainCtx2d.beginPath();
  for (const d of rainDrops) {
    d.y += d.speed * dt;
    d.x += d.speed * dt * wind;
    if (d.y - d.len > h || d.x > w || d.x < 0) { d.y = -d.len; d.x = Math.random() * w; }
    rainCtx2d.moveTo(d.x, d.y);
    rainCtx2d.lineTo(d.x + d.len * lenMul * wind, d.y + d.len * lenMul);
  }
  rainCtx2d.stroke();
  rainCtx2d.globalAlpha = 1;
}

// ---------- visor / windscreen rain (cockpit + hood cams) ----------
// In the onboard views the falling-streak field reads as "outside the car";
// what sells rain from the driver's seat is water ON the glass: beading
// droplets that cling and slowly slide, cleared by a periodic wiper sweep.
// Drawn on the same rainCanvas 2D ctx, replacing the streak field there.
const visorDrops = [];
let _visorSpawn = 0;      // fractional spawn accumulator
let _wiperPhase = 999;    // seconds into the current wiper cycle (starts parked)
function drawVisorRain(dt) {
  const w = rainCanvas.width, h = rainCanvas.height;
  const ctx = rainCtx2d;
  ctx.clearRect(0, 0, w, h);
  const storm = isRaining();
  const vk = clamp(((player && player.speed) || 0) / 90, 0, 1);
  const scale = Math.min(w, h) / 390;           // device-independent drop sizes
  // ── spawn: heavier in a storm, more hits at speed ──
  const maxDrops = storm ? 90 : 28;
  const mkDrop = () => visorDrops.push({
    x: Math.random() * w,
    y: Math.random() * h * 0.9,
    r: (1.4 + Math.random() * 3.0) * scale,
    wob: Math.random() * 6.28,
  });
  // First wet frame in an onboard view: pre-seed part of the field so the glass
  // doesn't start bone-dry and trickle in one bead at a time.
  if (!visorDrops.length) for (let i = 0; i < maxDrops * 0.4; i++) mkDrop();
  _visorSpawn += (storm ? 30 : 5.5) * (0.55 + 0.45 * vk) * dt;
  while (_visorSpawn >= 1) {
    _visorSpawn -= 1;
    if (visorDrops.length < maxDrops) mkDrop();
  }
  // ── wiper cycle: sweep out-and-back, then park ──
  const period = storm ? 2.4 : 5.5;
  _wiperPhase += dt;
  if (_wiperPhase >= period) _wiperPhase = 0;
  const sweepT = 1.1;
  const swing = _wiperPhase < sweepT
    ? (_wiperPhase < sweepT * 0.5 ? _wiperPhase / (sweepT * 0.5) : 2 - _wiperPhase / (sweepT * 0.5))
    : -1;                                        // parked
  const pvx = w * 0.5, pvy = h * 1.25, R = h * 1.05;
  const a0 = -Math.PI / 2 - 0.85;                // sweep start (left)
  const bladeAng = a0 + swing * 1.7;             // → right and back
  // ── update + draw droplets (beads slide slowly; big drops run faster) ──
  ctx.fillStyle = "rgba(175,200,232,0.42)";
  for (let i = visorDrops.length - 1; i >= 0; i--) {
    const d = visorDrops[i];
    d.wob += dt * 3;
    d.y += (d.r * 6 + 4) * (0.4 + vk * 1.6) * dt * (scale || 1);
    d.x += Math.sin(d.wob) * 2 * dt;
    if (d.y > h + 4) { visorDrops.splice(i, 1); continue; }
    // wiper clearance: inside the blade's swept sector this frame → gone
    if (swing >= 0) {
      const ang = Math.atan2(d.y - pvy, d.x - pvx);
      const rr = Math.hypot(d.x - pvx, d.y - pvy);
      if (rr < R && Math.abs(ang - bladeAng) < 0.09) { visorDrops.splice(i, 1); continue; }
    }
    // bead: a soft disc with a short slide-trail and a bright crown highlight
    ctx.globalAlpha = 0.30;
    ctx.fillRect(d.x - d.r * 0.35, d.y - d.r * 4, d.r * 0.7, d.r * 4);   // trail
    ctx.globalAlpha = 0.42;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.32, 0, 6.2832);
    ctx.fillStyle = "rgba(235,244,255,0.75)"; ctx.fill();
    ctx.fillStyle = "rgba(175,200,232,0.42)";
  }
  // ── draw the wiper blade mid-sweep ──
  if (swing >= 0) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(16,20,26,0.9)";
    ctx.lineWidth = Math.max(4, 5 * scale);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pvx + Math.cos(bladeAng) * R * 0.35, pvy + Math.sin(bladeAng) * R * 0.35);
    ctx.lineTo(pvx + Math.cos(bladeAng) * R, pvy + Math.sin(bladeAng) * R);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- settings ----------
const store = {
  _cache: new Map(),   // full-key -> parsed value; kills per-frame getItem + JSON.parse in the render loop
  rev: 0,              // bumped on every set — memo caches key off this to self-invalidate
  get(k, d) {
    const key = "apex26." + k;
    let v = this._cache.get(key);
    if (v === undefined && !this._cache.has(key)) {
      try { const raw = localStorage.getItem(key); v = raw === null ? undefined : JSON.parse(raw); }
      catch (e) { return d; }
      this._cache.set(key, v);
    }
    // Callers treat hot-path results as read-only; menu callers that mutate a
    // returned object always saveTeamParts()/store.set() after, re-caching the ref.
    return v === undefined ? d : v;
  },
  set(k, v) {
    const key = "apex26." + k;
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
    this._cache.set(key, v);
    this.rev++;
  },
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

const { DEFAULT_CUSTOM } = GameTables;
function loadCustomTeam() { return store.get("customTeam", DEFAULT_CUSTOM); }
function invalidateCustomMeshCache(cache) {
  Object.keys(cache).forEach((key) => {
    if (key.indexOf("custom:") !== 0) return;
    if (cache[key] && gfx.freeMesh) gfx.freeMesh(cache[key]);
    delete cache[key];
  });
}
function syncCustomTeam() {
  const i = Teams.LIST.findIndex((t) => t.id === "custom");
  if (i >= 0) Teams.LIST.splice(i, 1);
  Teams.LIST.push(loadCustomTeam());
  invalidateDecalTextures("custom");
  invalidateCustomMeshCache(teamMeshes);
  invalidateCustomMeshCache(playerBodies);
  invalidateCustomMeshCache(cockpitBodies);
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
let season = store.get("season", null);      // {round, pts:{driverId:n}, teamPts:{id:n}, driverCodes:{driverId:code}}
function seasonDriverId(teamId, driverIndex) { return teamId + ":" + driverIndex; }
function seasonRoster() {
  const roster = [];
  Teams.LIST.forEach((team) => team.drivers.forEach((driver, driverIndex) => {
    roster.push({
      id: seasonDriverId(team.id, driverIndex),
      code: driver.code,
    });
  }));
  return roster;
}
function migrateSeasonPoints() {
  if (!season) return;
  const oldPts = season.pts && typeof season.pts === "object" ? season.pts : {};
  const roster = seasonRoster();
  const nextPts = {};
  const codes = Object.assign({}, season.driverCodes || {});
  // Legacy display-code keys cannot be disambiguated after historical code collisions, so migration is best-effort.
  Object.entries(oldPts).forEach(([key, value]) => {
    const driver = roster.find((candidate) => candidate.id === key || candidate.code === key);
    const id = driver ? driver.id : key;
    nextPts[id] = (nextPts[id] || 0) + (Number(value) || 0);
    if (driver) codes[id] = driver.code;
    else if (!codes[id]) codes[id] = key;
  });
  roster.forEach((driver) => {
    if (Object.prototype.hasOwnProperty.call(nextPts, driver.id)) codes[driver.id] = driver.code;
  });
  season.pts = nextPts;
  season.driverCodes = codes;
  season.teamPts = season.teamPts && typeof season.teamPts === "object" ? season.teamPts : {};
  store.set("season", season);
}

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
// set a little above BRAKE (22) so straight-line braking keeps most grip, but
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
const { TIER_V } = GameTables;
// 6-speed gearbox with realistic PROGRESSIVE ratios (research: real/F1 gearboxes
// space the ratios so the steps shrink in the higher gears). So an upshift drops
// the revs a lot in the low gears and less up top, and every shift lands back in
// the ~8.7-11.3k power band (F1's optimal ~8-12k) before climbing to the limit —
// rather than dropping to idle or barely dropping at all. Top speed fraction of VMAX.
// F1-authentic 8 gears.
const { GEARS, GEAR_TOP, IDLE_RPM, MAX_RPM } = GameTables;
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
const { DIFF } = GameTables;
const GAME_LAPS = 3;
const TT_LAPS = 4;          // time trial: one standing out-lap + flying laps
// Weather predicates. "wet" = damp/wet track (wet road, no falling rain);
// "rain" = active storm (wet road + falling rain + lightning). Both wet the road.
function isWetRoad() { return raceWeather === "wet" || raceWeather === "rain"; }
function isRaining() { return raceWeather === "rain"; }
// A streaming-wet track is slightly more slippery than a merely damp one.
function gripMult() { return raceWeather === "rain" ? 0.72 : raceWeather === "wet" ? 0.82 : 1; }

// ---------- state ----------
let state = "menu";
let track = null, builtTrackId = null, builtTrackNight = null;
let cars = [], player = null;
let raceT = 0, countT = 0, lightsLit = 0, resultT = 0;
let camEye = [0, 6, -10], camTgt = [0, 0, 0], camFov = 62;
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
const photoMouse = { dx: 0, dy: 0, drag: false, px: 0, py: 0 };
let photoAlt = 0;                    // touch up/down buttons: +1 up, −1 down
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
      R.radius, ax, ay, az, 0.88, 0.60, 0.12, 0);
  }
  // Overhead key: straight-down softbox above the car.
  const ek = R.intensity * 0.55 * 1.4;
  _studioBuf.push(cx, cy + R.h + 3, cz,
    R.color[0] * ek, R.color[1] * ek, R.color[2] * ek,
    R.radius, 0, -1, 0, 0.80, 0.45, 0.15, 0);
  return _studioBuf;
}
let headlessMode = false;  // skip render() when true (headless control loop)
const { CAM_MODES } = GameTables;  // player camera modes (see js/game/tables.js)
let camMode = Math.min(Math.max(store.get("camMode", 0) | 0, 0), CAM_MODES.length - 1);
let seasonMode = false;
let timeTrial = false;      // solo run against the clock, no AI
let lapsTarget = GAME_LAPS; // laps before the session ends (GAME_LAPS or TT_LAPS)
let raceLaps = GAME_LAPS;      // user-selected lap count
let raceWeather = "dry";       // "dry" | "wet" | "rain" | "overcast" | "fog"
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
let _thunderT = -1;          // seconds until queued thunder fires (<0 = none)
// Cloud cover target for the current session: set once in applyRaceSettings()
// and held constant so the sky doesn't shift mid-race (only the shader animates).
let _cloudBase = 0.4;
const teamMeshes = {};   // teamId -> renderer mesh handle
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
// Batched skid trail: all live marks baked into one world-space vertex buffer
// (pos3 + uv2 per vertex, 6 verts/mark) drawn in a single call. Rebuilt only
// when a mark is added/evicted (at most every ~5 frames while sliding) instead
// of issuing up to 120 per-mark draws every frame.
const _skidVerts = new Float32Array(MAX_SKID * 6 * 5);
let _skidVertCount = 0;
let _skidBatchDirty = false;
const _SKID_W = 0.6, _SKID_L = 2.2;
// 6 verts (two tris) — matches the shadowVAO quad winding [0,1,2, 0,2,3].
const _SKID_CORNERS = [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5];
function rebuildSkidBatch() {
  const full = skidActive >= MAX_SKID, cnt = full ? MAX_SKID : skidActive;
  let o = 0;
  for (let i = 0; i < cnt; i++) {
    const M = full ? skidMarks[(skidIdx + i) % MAX_SKID] : skidMarks[i];
    const m0 = M[0], m1 = M[1], m2 = M[2], m4 = M[4], m5 = M[5], m6 = M[6],
          m8 = M[8], m9 = M[9], m10 = M[10], m12 = M[12], m13 = M[13], m14 = M[14];
    for (let v = 0; v < 6; v++) {
      const ax = _SKID_CORNERS[v * 2], ay = _SKID_CORNERS[v * 2 + 1];
      const lx = ax * _SKID_W, lz = ay * _SKID_L;
      _skidVerts[o++] = m0 * lx + m4 * 0.02 + m8 * lz + m12;
      _skidVerts[o++] = m1 * lx + m5 * 0.02 + m9 * lz + m13;
      _skidVerts[o++] = m2 * lx + m6 * 0.02 + m10 * lz + m14;
      _skidVerts[o++] = ax * 2;
      _skidVerts[o++] = ay * 2;
    }
  }
  _skidVertCount = cnt * 6;
  _skidBatchDirty = false;
}

const { PAINT_WET_NIGHT, PAINT_WET_DAY, PAINT_DRY_NIGHT, PAINT_DRY_DAY } = GameTables;  // car paint materials (see js/game/tables.js)
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
const mm = els.minimap.getContext("2d");
const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // reusable sample
const smp2 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const smpC = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // camera anchor

// ---------- helpers ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
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
// Curated CircuitMarkings splits when present; equal thirds only as fallback.
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
const _cockMat = new Float32Array(16), _cockU = [0, 1, 0];   // stabilized cockpit-interior basis
const _cockP = [0, 0, 0];   // camera-anchored rig origin (see the cockpit branch)
const tmpR = [0, 0, 0], tmpF = [0, 0, 0], tmpU = [0, 1, 0], tmpP = [0, 0, 0];
// Pre-allocated scratch matrices — zero-GC hot-path matrix math.
const MAT_IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
// The in-race car model matrix is a REFLECTION (det −1, see basisMat/tmpU). The
// setup-preview car is otherwise drawn at identity (det +1), which would render
// the U-pre-flipped decal text mirrored. Draw the preview through this X-reflection
// so its handedness matches in-race and the flipped-U decals read correctly (the
// symmetric body is visually unchanged).
const MAT_REFLECT_X = new Float32Array([-1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _mProj = new Float32Array(16), _mView = new Float32Array(16), _mVP = new Float32Array(16);
const _mLView = new Float32Array(16), _mLProj = new Float32Array(16), _mLVP = new Float32Array(16);
// Dynamic car shadow pass scratches (per-frame car-only depth map).
const _mCView = new Float32Array(16), _mCProj = new Float32Array(16), _mCVP = new Float32Array(16);
const _mInvVP = new Float32Array(16);
const _mInvProj = new Float32Array(16);
const _sunVS = new Float32Array(3);
const _upVS = new Float32Array(3);   // world-up expressed in view space (wet-road SSR)
const _camUp = [0, 0, 0];   // scratch camera up-vector (rebuilt each render frame)
let _shadowSnapX = null, _shadowSnapZ = null, _shadowBox = null;
let _shadowSunX = null, _shadowSunY = null, _shadowSunZ = null;
const _shadowCtr = [0, 0, 0];   // unsnapped shadow anchor (glides) — the shader fades by distance from this

// ---------- parts / player mods ----------
function getTeamParts(teamId) { return store.get("parts." + teamId, {}); }
function saveTeamParts(teamId, parts) { store.set("parts." + teamId, parts); }

// ---------- liveries (custom paint jobs) ----------
function getLiveryId(teamId) { return store.get("livery." + teamId, "default"); }
function saveLiveryId(teamId, id) { store.set("livery." + teamId, id); }
// Player-created liveries, stored per team as [{id,name,c1,c2,stripe?}].
function getCustomLiveries(teamId) { return store.get("livery.custom." + teamId, []); }
function setCustomLiveries(teamId, arr) { store.set("livery.custom." + teamId, arr); }
// Full paint-job list for a team: catalog (default + specials + universal) + the
// player's own creations.
function getLiveries(team) { return Liveries.forTeam(team).concat(getCustomLiveries(team.id)); }
// Resolve a team's chosen paint job -> { c1, c2, stripe } bodywork colours (its
// own team colours for "default"). Everything that builds a car mesh paints with
// these.
// Transient un-saved paint job previewed live in the creator: { teamId, liv }.
// Overrides the resolved livery for that one team while the creator is open.
let livDraftOverride = null;
// Memoized per team.id, invalidated by store.rev — during a race this resolves to
// a cached object with zero localStorage access and zero per-frame allocation.
const _livResolveCache = new Map();
function resolveLivery(team) {
  if (livDraftOverride && livDraftOverride.teamId === team.id) {
    const l = livDraftOverride.liv;
    return { c1: l.c1, c2: l.c2, stripe: l.stripe || null, accent: l.accent || null,
             nose: l.nose || null, pod: l.pod || null, wing: l.wing || null, halo: l.halo || null,
             noseStripe: l.noseStripe || null };
  }
  const c = _livResolveCache.get(team.id);
  if (c && c.rev === store.rev) return c.val;
  const liv = getLiveries(team).find((l) => l.id === getLiveryId(team.id));
  // Optional livery detail colours (nose cap, sidepod panel, wing flaps, halo tint)
  // — additive, so an unmodified livery still resolves to today's exact object shape.
  const val = liv ? { c1: liv.c1, c2: liv.c2, stripe: liv.stripe || null, accent: liv.accent || null,
                      nose: liv.nose || null, pod: liv.pod || null, wing: liv.wing || null, halo: liv.halo || null,
                      noseStripe: liv.noseStripe || null }
                  : { c1: team.color, c2: team.color2, stripe: null, accent: null };
  _livResolveCache.set(team.id, { val, rev: store.rev });
  return val;
}

// partsVisualKey(teamId) -> cheap cache key for the resolved cosmetic tiers
// (e.g. "11111111" = every category at its default/neutral tier). Used by the
// setup-screen live preview (getSetupPreviewMesh), which re-keys its mesh every
// frame so the turntable updates as parts are picked (parts change live there,
// with no recomputePlayerMods() call). The in-race player/cockpit meshes instead
// read the cached playerVisualKey (refreshed in recomputePlayerMods) below.
function partsVisualKey(teamId) {
  const team = teamById(teamId);
  const vt = Parts.getVisualTiers(getTeamParts(teamId), team ? team.engine : null);
  // Key on the resolved OPTION id per category — the option fully determines the
  // visual (engine airbox, aero package, brake ducts/caliper, tyre compound all
  // vary per option now, not just per tier), so the mesh cache rebuilds whenever
  // any choice changes.
  const parts = vt._ids ? Parts.CATALOG.map((c) => vt._ids[c.id]).join("|")
                        : Parts.CATALOG.map((c) => vt[c.id]).join("");
  return parts + "|L:" + getLiveryId(teamId);   // livery repaints the mesh too
}

// Resolved tyre/brake visual tiers for the PLAYER's wheel meshes (drawPlayerWheels
// reads these directly — cheap per-frame variable reads, not a per-frame
// Parts.getVisualTiers() call). Refreshed whenever parts change (below).
let playerTyreTier = 1, playerBrakesTier = 1, playerTyreId = "medium", playerBrakeId = "standard";
// Full 8-char cosmetic key for the PLAYER's body/cockpit mesh caches — computed
// once here (parts only change from the setup screen, which calls this on close)
// so the render loop reads a cached string instead of rebuilding it via
// partsVisualKey() → getVisualTiers() every frame. Overwritten before the first
// race render by startRace()'s recomputePlayerMods() call.
let playerVisualKey = "11111111";

function recomputePlayerMods() {
  const team = player ? player.team : Teams.LIST[teamIdx];
  const stats = team.stats || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const setup = getTeamParts(team.id);
  const mods = Parts.getMods(setup, team.engine);
  playerMods = {
    speed:     Parts.statMult(stats.speed)     * mods.speed,
    accel:     Parts.statMult(stats.accel)     * mods.accel,
    cornering: Parts.statMult(stats.cornering) * mods.cornering,
    braking:   Parts.statMult(stats.braking)   * mods.braking,
  };
  const vt = Parts.getVisualTiers(setup, team.engine);
  playerTyreTier = vt.tyres; playerBrakesTier = vt.brakes;
  playerTyreId = vt._ids ? vt._ids.tyres : "medium";
  playerBrakeId = vt._ids ? vt._ids.brakes : "standard";
  // Key on the full set of resolved option ids + the chosen livery (see partsVisualKey).
  playerVisualKey = (vt._ids ? Parts.CATALOG.map((c) => vt._ids[c.id]).join("|")
                             : Parts.CATALOG.map((c) => vt[c.id]).join(""))
                    + "|L:" + getLiveryId(team.id);
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
        team, name: d.name, code: d.code, driverId: seasonDriverId(team.id, di), num: d.num, isPlayer: isP,
        color: team.color, tier: team.tier,
        fuelId: getTeamParts(team.id).fuel || "standard",   // tints the exhaust flame
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
  const liv = resolveLivery(team);   // chosen paint job (else team colours)
  if (carModelBuf) {
    try { return GLTF.toMesh(carModelBuf, { scale: CAR_MODEL_SCALE, tint: liv.c1 }); }
    catch (e) { /* any parse trouble: fall through to the procedural car */ }
  }
  return Car3D.build(liv.c1, liv.c2, { livery: liv, num: team.drivers && team.drivers[0] && team.drivers[0].num });
}

function teamMesh(team) {
  const key = team.id + ":" + getLiveryId(team.id);   // rebuild when the paint job changes
  if (!teamMeshes[key]) teamMeshes[key] = gfx.createMesh(buildCarData(team));
  return teamMeshes[key];
}

// Car decal / effect-quad / cockpit-instrument geometry lives in
// js/game/carmesh.js (CarMesh; renderer handle injected below at boot).
CarMesh.init(gfx);
// Transient FX particle pool (tyre smoke / sparks / kickup / rain spray) —
// js/game/particles.js; same injected-renderer pattern as CarMesh above.
Particles.init(gfx);
const { carDecalData, getCarDecalMesh, getCockpitDecalMesh,
        getBrakeRing, getRainLight, getExhaustFlame, getBoostFlame, getErsLight,
        getCockpitWheel, getLedStrip, getGearDigit, getSpeedDigit,
        getErsBar, getOtLamp, getPedalBar } = CarMesh;
const _decalTexCache = {};
function invalidateDecalTextures(teamId) {
  const prefix = teamId + ":";
  Object.keys(_decalTexCache).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    const tex = _decalTexCache[key];
    if (tex && gfx.freeTexture) gfx.freeTexture(tex);
    delete _decalTexCache[key];
  });
}
function getCarDecalTexture(team, num) {
  if (typeof LiveryTex === "undefined" || !gfx.createTexture) return null;
  const key = team.id + ":" + getLiveryId(team.id) + ":" + (num == null ? "_" : num);
  if (!(key in _decalTexCache)) {
    let t = null;
    try { t = gfx.createTexture(LiveryTex.buildAtlas(team.id, resolveLivery(team), num)); }
    catch (e) { t = null; }
    _decalTexCache[key] = t;
  }
  return _decalTexCache[key];
}
// Driver number for a car's decal atlas: the car's own number if present, else
// the team's primary driver (so the setup preview / any numberless call still
// shows a sensible number).
function carDecalNum(team, car) {
  if (car && car.num != null) return car.num;
  return (team.drivers && team.drivers[0] && team.drivers[0].num != null) ? team.drivers[0].num : null;
}
// Draw a car's logo/sponsor decals with the same model matrix as its body.
// A team's rear-wing downforce level (0..4), driving which endplate-number mesh
// to draw. getVisualTiers is a small 8-category loop and the resulting mesh is
// cached per level, so resolving this per car/frame is negligible.
const _aeroLevelCache = new Map();   // team.id -> {val, rev}; invalidated by store.rev
function teamAeroLevel(team) {
  if (!Car3D.aeroLevelOf) return 2;   // stale-bundle guard → medium-DF board
  const c = _aeroLevelCache.get(team.id);
  if (c && c.rev === store.rev) return c.val;
  const val = Car3D.aeroLevelOf(Parts.getVisualTiers(getTeamParts(team.id), team.engine));
  _aeroLevelCache.set(team.id, { val, rev: store.rev });
  return val;
}
function drawCarDecals(team, modelMat, night, num, cockpit) {
  // Cockpit build draws only the forward (nose) number — the rear wing is behind
  // the camera — so aero level is irrelevant there.
  const mesh = cockpit ? getCockpitDecalMesh() : getCarDecalMesh(teamAeroLevel(team));
  const tex = getCarDecalTexture(team, num);
  if (mesh && tex) gfx.drawDecal(mesh, modelMat, tex, { glow: night ? 0.35 : 0 });
}

// Player car gets animated wheels: a body-only mesh + four separate wheel meshes
// the render layer spins (∝ speed) and steers (fronts). Only for the procedural
// car — a loaded glb model is one piece, so playerBodyMesh returns null and the
// player falls back to the full static mesh. Wheel meshes are cached per
// TYRES/BRAKES visual tier below (getPlayerWheelMeshes), not team-keyed.
const playerBodies = {};
const WHEELS = [
  { x: -0.79, y: 0.34, z:  1.7, front: true,  rear: false },
  { x:  0.79, y: 0.34, z:  1.7, front: true,  rear: false },
  { x: -0.76, y: 0.34, z: -1.6, front: false, rear: true },
  { x:  0.76, y: 0.34, z: -1.6, front: false, rear: true },
];
const _wheelLocal = new Float32Array(16);
const _wheelWorld = new Float32Array(16);
const _ringWorld = new Float32Array(16);
// Scratch opts for AI brake rings — mutated in place per frame so the car loop
// doesn't allocate a fresh literal per ring (up to ~40/frame in a braking pack).
const _ringOpts = { emissive: 0, roughness: 0.9, specular: 0, alpha: 1, noAlphaWrite: true };
// Deferred blob-shadow batch: instead of interleaving shadow↔body per car (which
// flips program+VAO+blend+depthMask twice each car), accumulate every drawn car's
// shadow matrix and flush them all in one state block after the body loop. Shadows
// are depth-tested but write no depth, so drawing them last is visually identical.
const _shadowMats = [];   // pool of Float32Array(16), reused across frames
const _shadowTeams = [];  // parallel: each car's team, for the dynamic car-shadow caster pass
let _shadowCount = 0;
// Reusable { dy, roll } scratches for Tracks.banking — one for the physics step,
// one for the render loop (both called once per car per frame) so banking() no
// longer allocates a fresh object ~23×/frame.
const _bankScratch = { dy: 0, roll: 0 };
const _bankScratchP = { dy: 0, roll: 0 };


// The cockpit body: the REAL car (livery, nose, mirrors, number board) minus
// the driver helmet the camera sits inside. Cached per team like playerBodies.
const cockpitBodies = {};
function cockpitBodyMesh(team) {
  // Player-only (drawCockpitRig runs on c.isPlayer), so the cached playerVisualKey
  // is always this team's key — no per-frame partsVisualKey() rebuild.
  const key = team.id + ":" + playerVisualKey;
  if (!cockpitBodies[key]) {
    const liv = resolveLivery(team);
    cockpitBodies[key] = gfx.createMesh(Car3D.build(liv.c1, liv.c2,
      { livery: liv, noWheels: true, noDriver: true, cockpit: true, num: team.drivers && team.drivers[0] && team.drivers[0].num,
        parts: Parts.getVisualTiers(getTeamParts(team.id), team.engine) }));
  }
  return cockpitBodies[key];
}
// Hub transform (translate + slight upscale) and scratch matrices for the
// steering roll + per-element LCD offsets.
// Wheel/dash hub at z 0.71: the cockpit eye moved fwd 0.02 → 0.32 (past the
// shoulder fairing), so the rig moves with it to keep the proven eye-to-wheel
// distance of 0.39 m — at the old z 0.41 the fascia sat 9 cm from the eye and
// filled the frame as an unfocused black mass.
const _rigT = new Float32Array([0.80,0,0,0, 0,0.80,0,0, 0,0,0.80,0, 0,0.83,0.71,1]);
const _rigR = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _rigA = new Float32Array(16), _rigB = new Float32Array(16);
const _digT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _digM = new Float32Array(16);
function drawCockpitRig(c, base, dt, paint) {
  const nite = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night);
  const opt = { roughness: 0.55, metalness: 0.15, specular: 0.40, emissive: nite ? 0.16 : 0 };
  // The actual car around you: body (minus helmet) with the real paint, plus
  // the steering/spinning FRONT wheels (the rears sit right beside the camera
  // in the wide FOV and blob the bottom corners — skipped). Nudged 0.35 m
  // forward of their real physics position so they read further out ahead of
  // the driver instead of hugging the cockpit edge (cosmetic-only offset —
  // the actual wheel/contact-patch physics is untouched).
  gfx.draw(cockpitBodyMesh(c.team), base, paint);
  // Forward decal: the driver number on the nose plate ahead of the driver (the
  // nose is identical to the chase build, so this lands exactly on the plate).
  drawCarDecals(c.team, base, nite, carDecalNum(c.team, c), true);
  drawPlayerWheels(c, base, dt, { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: nite ? 0.12 : 0, doubleSided: true }, true, 0.30, 1.4);
  // Roll the wheel about the (car-local) column axis by the smoothed steering —
  // works identically for tilt / buttons / touch (steerVis is the resolved,
  // damped steering whatever the input mode). A second, slower damping stage
  // gives the wheel visual WEIGHT (it settles rather than flicking), the lock
  // is modest (~±46°), and the sign is flipped — it was rotating backwards.
  c._whlVis = damp(c._whlVis == null ? 0 : c._whlVis, clamp(c.steerVis || 0, -1, 1), 6, dt);
  const a = -c._whlVis * 0.80;
  const ca = Math.cos(a), sa = Math.sin(a);
  _rigR[0] = ca; _rigR[1] = sa; _rigR[4] = -sa; _rigR[5] = ca;
  M4.mulTo(_rigA, base, _rigT);
  M4.mulTo(_rigB, _rigA, _rigR);
  gfx.draw(getCockpitWheel(), _rigB, opt);
  // Live telemetry ON the wheel (all ride the wheel matrix, like the real LCD):
  // gear (auto or manual — c.gear is maintained by both paths), RPM shift
  // lights, speed, pedal bars, ERS energy.
  const fx = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true };
  gfx.draw(getGearDigit(clamp(c.gear || 1, 0, 9)), _rigB, fx);
  const rpmF = clamp(((c.rpm || IDLE_RPM) - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  gfx.draw(getLedStrip(Math.round(rpmF * 8)), _rigB, fx);
  // Clamp to 0: a negative c.speed (e.g. hard braking to a near-stop, or a
  // reversing glitch) would otherwise stringify with a "-" character that
  // getSpeedDigit can't parse (+"-" is NaN -> SEG7[NaN] -> crash every frame).
  const kmh = Math.max(0, Math.min(999, Math.round((c.speed || 0) * 3.6)));
  const ds = String(kmh);
  for (let i = 0; i < ds.length; i++) {
    _digT[12] = -0.034 + (i - (ds.length - 1) / 2) * 0.0135; _digT[13] = 0.022; _digT[14] = -0.0335;
    M4.mulTo(_digM, _rigB, _digT);
    gfx.draw(getSpeedDigit(+ds[i]), _digM, fx);
  }
  // ERS charge fill in the slot under the LCD; pulses while deploying.
  const en = clamp(c.energy || 0, 0, 1);
  if (en > 0.01) {
    _digT[12] = 0.048; _digT[13] = 0.001; _digT[14] = -0.0315;
    M4.mulTo(_digM, _rigB, _digT);
    _digM[4] *= en; _digM[5] *= en; _digM[6] *= en;
    gfx.draw(getErsBar(), _digM, c.deploying
      ? { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 0.75 + 0.25 * Math.sin(raceT * 22) }
      : fx);
  }
  // OVERTAKE lamp on the wheel: white when armed, pulsing purple while active
  // (the floating HUD OVERTAKE text is hidden in cockpit view).
  if (c.otT > 0) {
    gfx.draw(getOtLamp(true), _rigB, { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true,
      alpha: 0.7 + 0.3 * Math.sin(raceT * 18) });
  } else if (c.otArmed) {
    gfx.draw(getOtLamp(false), _rigB, fx);
  }
  _digT[12] = _digT[13] = _digT[14] = 0;
}

function playerBodyMesh(team) {
  if (carModelBuf) return null;   // glb model: single piece, no wheel split
  // Player-only draw path, so the cached playerVisualKey is always this team's
  // key — no per-frame partsVisualKey() rebuild.
  const key = team.id + ":" + playerVisualKey;
  const liv = resolveLivery(team);
  if (!playerBodies[key]) playerBodies[key] = gfx.createMesh(Car3D.build(liv.c1, liv.c2,
    { livery: liv, noWheels: true, num: team.drivers && team.drivers[0] && team.drivers[0].num,
      parts: Parts.getVisualTiers(getTeamParts(team.id), team.engine) }));
  return playerBodies[key];
}
// Player wheel meshes, keyed by the resolved TYRES/BRAKES visual tier (band
// colour + caliper accent) so a parts change rebuilds the right mesh instead
// of drawing stale geometry. Tier "1:1" (both default) matches today's shared
// wheelMeshF/wheelMeshR exactly — same team-independent, dark-tyre meshes.
const wheelMeshCache = {};
function getPlayerWheelMeshes() {
  const key = playerTyreId + ":" + playerBrakeId;
  let m = wheelMeshCache[key];
  if (!m) {
    const band = (Car3D.TYRE_PIRELLI && Car3D.TYRE_PIRELLI[playerTyreId]) || Car3D.TYRE_BAND[playerTyreTier];
    const bs = Car3D.BRAKE_STYLE && Car3D.BRAKE_STYLE[playerBrakeId];
    const caliper = bs ? bs.cal : Car3D.BRAKE_CALIPER[playerBrakesTier];
    const rim = bs && bs.rim;
    const grooved = playerTyreId === "intermediate";
    m = wheelMeshCache[key] = {
      F: gfx.createMesh(Car3D.buildWheel(0.32, band, caliper, rim, grooved)),
      R: gfx.createMesh(Car3D.buildWheel(0.38, band, caliper, rim, grooved)),
    };
  }
  return m;
}
// Spin each wheel about its axle ∝ speed and steer the fronts by the smoothed
// driver input. local = translate(corner) ∘ rotY(steer) ∘ rotX(spin), composed
// straight into a scratch matrix (no per-frame allocation), then into world.
function drawPlayerWheels(c, base, dt, opt, frontsOnly, fwdOffset, wScale) {
  const wm = getPlayerWheelMeshes();
  c.wheelSpin = ((c.wheelSpin || 0) + (c.speed / WHEEL_R) * dt) % (Math.PI * 2);
  const sp = Math.sin(c.wheelSpin), cp = Math.cos(c.wheelSpin);
  const steerA = clamp(c.steerVis || 0, -1, 1) * WHEEL_STEER_VIS;
  const ws = wScale || 1;   // widen the tyre along its axle (cockpit view)
  for (let w = 0; w < WHEELS.length; w++) {
    const wd = WHEELS[w];
    if (frontsOnly && wd.rear) continue;   // cockpit: rears sit beside the camera and blob the corners
    const yaw = wd.front ? steerA : 0;
    const ss = Math.sin(yaw), cs = Math.cos(yaw);
    const L = _wheelLocal;
    // Local X is the wheel axle (tyre width); scale that column by ws to widen.
    L[0] = cs*ws;    L[1] = 0;      L[2] = -ss*ws;    L[3] = 0;
    L[4] = ss*sp;    L[5] = cp;     L[6] = cs*sp;     L[7] = 0;
    L[8] = ss*cp;    L[9] = -sp;    L[10] = cs*cp;    L[11] = 0;
    // Push the widened wheels outward so they don't intersect the tub.
    L[12] = wd.x + (wd.x < 0 ? -1 : 1) * (ws - 1) * 0.16; L[13] = wd.y; L[14] = wd.z + (fwdOffset || 0); L[15] = 1;
    M4.mulTo(_wheelWorld, base, L);
    gfx.draw(wd.rear ? wm.R : wm.F, _wheelWorld, opt);
    // Hot brake discs: an emissive ring floating just off the outer wheel face,
    // ramping with the render-only brakeHeat (bright orange → blooms when hot).
    const heat = c.brakeHeat || 0;
    if (heat > 0.05) {
      const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.025);
      const W = _ringWorld;
      W.set(_wheelWorld);
      W[12] += W[0] * tx; W[13] += W[1] * tx; W[14] += W[2] * tx;
      gfx.draw(getBrakeRing(), W, {
        emissive: 0.30 + 0.70 * heat, roughness: 0.9, specular: 0,
        alpha: Math.min(1, 0.25 + heat * 0.9), noAlphaWrite: true,
      });
    }
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
    for (const k in teamMeshes) { if (gfx.freeMesh) gfx.freeMesh(teamMeshes[k]); delete teamMeshes[k]; }  // free old GPU buffers, then rebuild from model
    for (const k in playerBodies) { if (gfx.freeMesh) gfx.freeMesh(playerBodies[k]); delete playerBodies[k]; }
    return true;
  } catch (e) { return false; }
}

// ---------- track loading ----------
function loadTrack(idx) {
  const def = Tracks.LIST[idx];
  // Invalidate the sun-shadow snap cache: it's only ever written inside the
  // re-render gate, so a new track whose first snapped cell + sunDir happen to
  // match the old track's last values would keep the PREVIOUS track's shadow
  // silhouette until the camera moved a cell (~16 m).
  _shadowSnapX = _shadowSnapZ = _shadowBox = null;
  _shadowSunX = _shadowSunY = _shadowSunZ = null;
  // Buildings light up for the chosen SESSION time, not the track's default:
  // night/dusk/dawn (or a night-default track in "default") → lit windows. Props
  // are rebuilt when this flips so a day-default circuit raced at night gets a
  // glowing skyline, and a night-default circuit raced by day looks like daytime.
  const sessionDark = raceTimeOfDay === "night" || raceTimeOfDay === "dusk" ||
    raceTimeOfDay === "dawn" || (raceTimeOfDay === "default" && def.night);
  if (builtTrackId !== def.id || builtTrackNight !== sessionDark) {
    if (track && track.meshes) {
      gfx.freeMesh(track.meshes.floor);
      gfx.freeMesh(track.meshes.road);
      gfx.freeMesh(track.meshes.terrain);
      if (gfx.freeChunkedMesh) gfx.freeChunkedMesh(track.meshes.props); else gfx.freeMesh(track.meshes.props);
      if (track.meshes.glass) gfx.freeMesh(track.meshes.glass);
      if (track.meshes.water) gfx.freeMesh(track.meshes.water);
      gfx.freeMesh(track.meshes.gate);
      gfx.freeMesh(track.meshes.startline);
    }
    track = Tracks.build(def, { night: sessionDark });
    builtTrackId = def.id;
    builtTrackNight = sessionDark;
    // Env probe still holds the previous circuit — fall back to the analytic
    // sky until a fresh 6-face cycle has captured the new one.
    if (gfx.envProbeReset) gfx.envProbeReset();
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

// Night ambient band: floor/cap the (up-facing-dominant) hemisphere ambient into
// a moody-night range, then hue it toward the city glow. Applied for BOTH the
// default-night path AND explicit setTimeOfDay("night") — previously this lived
// only in the default branch, so explicit-night rendered ~5× darker with no neon
// cast than the same track at default-night (they even share a tuner profile).
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

// Floodlights are used on ANY track at night/dusk/dawn, plus a night-default
// track in default mode. Shared by applyRaceSettings (pre-build) and the render
// loop (per-frame) so the two can't drift out of sync.
function isFloodActiveSession() {
  return raceTimeOfDay === "night" || raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn" ||
    (raceTimeOfDay === "default" && track && track.def && track.def.night);
}

// ---------- race flow ----------
function applyRaceSettings() {
  // Load the lighting-tuner profile for the current (track, time, weather) so
  // the right per-condition values are live. Cheap (a few dozen assignments);
  // applyRaceSettings only fires on track load / time / weather change.
  // `true` = called from inside applyRaceSettings: suppresses applyLightTune's
  // own reapply-on-change call back into this function (this run derives from
  // the fresh LT values anyway — the re-entrant call ran everything twice).
  if (typeof applyLightTune === "function") applyLightTune(true);
  const isNightSession = raceTimeOfDay === "night" ||
    (raceTimeOfDay === "default" && track && track.def && track.def.night);
  // City light-pollution SKYGLOW: at night the lit circuit domes the horizon —
  // strong + tinted over neon cities, a faint warm haze over flood-lit open
  // circuits. Cleared here so day/dusk skies never inherit it.
  if (isNightSession && track && track.def) {
    const _ct = track.def.theme === "street_night" || track.def.theme === "modern";
    frameSky.cityGlow = _ct ? [0.050, 0.038, 0.055] : [0.024, 0.018, 0.012];
    // SKYGLOW WARMTH knob: white-balance the glow dome (and, via _nightAmbientBand's
    // hue-mix, the warm cast it throws into the night ambient). + warm sodium,
    // − cool LED/mercury. Unclamped-style mix, floored at 0.
    const _cgw = LT.cityGlowWarm || 0;
    if (_cgw) {
      const g = frameSky.cityGlow;
      frameSky.cityGlow = [
        Math.max(0, g[0] * (1 + 0.20 * _cgw)),
        Math.max(0, g[1] * (1 - 0.02 * Math.abs(_cgw))),
        Math.max(0, g[2] * (1 - 0.30 * _cgw)),
      ];
    }
  } else {
    frameSky.cityGlow = null;
  }
  // Pre-build the floodlight set at race start so the first dark-session frame is
  // never unlit (the render path rebuilds it if empty as a fallback). Floodlights
  // are used on ANY track at night/dusk/dawn, so build whenever the scene is dark.
  const floodActive = isFloodActiveSession();
  if (floodActive && track && (!track._lights || !track._lights.length)) track._lights = buildTrackLights(track);
  if (raceTimeOfDay !== "default") {
    const night = raceTimeOfDay === "night";
    frameSky.stars = night ? 1 : 0;
    if (night) {
      frameSky.zenith = [0.01, 0.02, 0.05];
      frameSky.horizon = [0.04, 0.03, 0.06];
      frame.sunColor = [0.12, 0.14, 0.22];   // faint cool moonlight key (unified w/ default-night)
      // MOON key-light direction: reset from the shipped palette (or a fixed
      // high default) EVERY call. This branch previously never set sunDir, so it
      // inherited whatever direction the previous time-of-day left behind — and
      // the sunElev/sunAzim tuner offsets applied further down COMPOUNDED on
      // each re-run (applyRaceSettings fires on every slider tick) instead of
      // offsetting a stable baseline, so the moon ran away while dragging.
      const _npal = track && track.def && track.def.palette;
      frame.sunDir = V3.norm(_npal && _npal.sunDir ? _npal.sunDir.slice() : [0.42, 0.66, 0.36]);
      frameSky.sunDir = frame.sunDir;
      // Re-derive the SKY sun tint from a stable base EVERY call (like dawn/dusk/
      // day do). This branch never set it, so the wet/overcast/fog multipliers
      // below (frameSky.sunColor *= 0.8/0.7) compounded on their own previous
      // output — dragging any night slider in a wet/foggy night race decayed the
      // moon/cloud/horizon tint toward black. Same palette base loadTrack uses.
      frameSky.sunColor = _npal && _npal.sun ? _npal.sun.slice() : [1.0, 0.95, 0.84];
      // NEAR-BLACK cool ambient: the world is genuinely dark, the LIGHT SOURCES
      // (lamps, neon, lit windows) do all the lifting. A high ambient here is the
      // #1 cause of a flat-grey "night that looks like dim day".
      frame.ambientGround = [0.0012, 0.0015, 0.0045];
      frame.ambientSky = [0.0034, 0.0046, 0.0110];
      // Same moody-night floor/cap + city-glow hue the default-night path applies,
      // so explicit setTimeOfDay("night") matches default-night (was ~5× darker,
      // no neon cast). cityGlow is already set above (before this branch).
      _nightAmbientBand();
      frame.fogColor = [0.015, 0.017, 0.035];
      frame.fogDensity = 0.004;
      // When raceTimeOfDay !== "default", sync sky colours to frame too
      frame.skyZenith  = frameSky.zenith;
      frame.skyHorizon = frameSky.horizon;
      // Moon: high visibility at night to give soft blue fill light
      frameSky.moon = 0.85;
      // Night skies: few scattered clouds (don't block stars)
      _cloudBase = 0.22;
      // Night: low exposure keeps the dark dark under ACES so the bright lamp
      // pools and lit windows punch through (raising exposure re-greys the night).
      // Theme-aware to MATCH the default-night path: neon cities carry their own
      // light (0.86); open/desert circuits lean on the floods alone, so they get
      // the same gentle lift default mode gives them (0.90).
      frame.exposure = (track && track.def && track.def.theme === "street_night") ? 0.86 : 0.90;
    } else if (raceTimeOfDay === "dawn") {
      // Pre-sunrise: deep teal-indigo zenith fading to a warm peach/rose horizon.
      // Sun is barely above the horizon — very low elevation, coming from the east.
      // Richer pre-sunrise: a deeper teal-indigo zenith over a luminous
      // pink/coral-magenta horizon (the defining first-light colour), not a muddy
      // brown-orange. Warm sun, with the DIRECT sun slightly warmer/stronger than
      // the sky tint (sky is always a touch cooler/dimmer than the key light).
      // Per-track variety (same clr/ovc pattern as the day branch): clear/arid
      // circuits get the vivid coral-magenta first light and crisp air; overcast
      // ones (Spa, Silverstone) a paler, mistier, grey-rose daybreak.
      const _dwBias = track && track.def ? _trackAtmoBias(track.def) : 0;
      const _dwClr = Math.max(0, -_dwBias);   // 0 … 0.55 clearness
      const _dwOvc = Math.max(0, _dwBias);    // 0 … 0.85 overcast
      frameSky.zenith  = [0.07 + _dwOvc * 0.09, 0.12 + _dwOvc * 0.09, 0.27 + _dwOvc * 0.04 - _dwClr * 0.03];
      frameSky.horizon = [0.88 - _dwOvc * 0.26 + _dwClr * 0.08, 0.50 - _dwOvc * 0.06, 0.40 + _dwOvc * 0.12 - _dwClr * 0.06];
      frameSky.sunColor = [1.0, 0.74 - _dwClr * 0.06 + _dwOvc * 0.10, 0.44 - _dwClr * 0.08 + _dwOvc * 0.16];
      // Sun rising in the east; azimuth varies per circuit (mirrors _duskAz) so
      // the low raking light doesn't strike every track from the same angle.
      const _dawnAz = track && track.def ? ((_trackAtmoBias(track.def) * 0.28) - 0.14) : 0;
      frameSky.sunDir  = V3.norm([-0.62 - _dawnAz, 0.08, 0.28]);
      frame.sunDir     = frameSky.sunDir;
      frame.sunColor   = [1.0 - _dwOvc * 0.10, 0.80 - _dwClr * 0.04 + _dwOvc * 0.06, 0.50 - _dwClr * 0.08 + _dwOvc * 0.16];
      // Cool teal fill from the sky, soft warm rose bounce from the ground
      frame.ambientGround = [0.20 - _dwOvc * 0.03, 0.13 + _dwOvc * 0.02, 0.10 + _dwOvc * 0.04];
      frame.ambientSky    = [0.22 + _dwOvc * 0.05, 0.26 + _dwOvc * 0.05, 0.40 + _dwOvc * 0.03];
      // Fog: overcast dawns wake up under a thick grey-rose mist bank; clear
      // desert dawns are crisp with only a thin warm haze at the horizon.
      frame.fogColor      = [0.52 + _dwOvc * 0.06 - _dwClr * 0.02, 0.36 + _dwOvc * 0.10, 0.34 + _dwOvc * 0.14 - _dwClr * 0.04];
      frame.fogDensity    = 0.0028 + _dwOvc * 0.0018 - _dwClr * 0.0012;
      frame.skyZenith     = frameSky.zenith;
      frame.skyHorizon    = frameSky.horizon;
      frameSky.moon = 0.30;   // fading moon still visible in the pre-dawn sky
      // Dawn: lingering cloud banks catch the first pink/gold light
      _cloudBase = 0.56;
      // Low sun + low ambient → lift exposure so the scene reads (kept moderate for
      // a realistic, un-washed dawn).
      frame.exposure = 1.08;
    } else if (raceTimeOfDay === "dusk") {
      // Richer golden hour: deeper indigo zenith, warmer coral/amber horizon,
      // a sun closer to the deck for that low-angle drama.
      // Per-track variety (same clr/ovc pattern as the day/dawn branches):
      // clear circuits burn a saturated amber-orange sunset; overcast ones cool
      // and grey it toward a muted rose-slate evening.
      const _dkBias = track && track.def ? _trackAtmoBias(track.def) : 0;
      const _dkClr = Math.max(0, -_dkBias);   // 0 … 0.55 clearness
      const _dkOvc = Math.max(0, _dkBias);    // 0 … 0.85 overcast
      frameSky.zenith  = [0.08 + _dkOvc * 0.08, 0.10 + _dkOvc * 0.08, 0.28 + _dkOvc * 0.03];
      frameSky.horizon = [0.72 - _dkOvc * 0.20 + _dkClr * 0.10, 0.34 + _dkOvc * 0.02, 0.08 + _dkOvc * 0.14 - _dkClr * 0.02];
      frameSky.sunColor = [1.0, 0.55 + _dkOvc * 0.10 - _dkClr * 0.05, 0.18 + _dkOvc * 0.16 - _dkClr * 0.05];
      // Sun low in the west; vary azimuth slightly per track so not every
      // circuit has identical low-angle raking light.
      const _duskAz = track && track.def ? ((_trackAtmoBias(track.def) * 0.28) - 0.14) : 0;
      frameSky.sunDir  = V3.norm([0.50 + _duskAz, 0.10, 0.22]);
      frame.sunDir     = frameSky.sunDir;
      frame.sunColor   = [1.0 - _dkOvc * 0.12, 0.62 + _dkOvc * 0.04 - _dkClr * 0.05, 0.22 + _dkOvc * 0.14 - _dkClr * 0.06];
      // Warm amber ground bounce, cool sky fill from the blue zenith overhead
      frame.ambientGround = [0.28 - _dkOvc * 0.05, 0.16 + _dkOvc * 0.01, 0.06 + _dkOvc * 0.05];
      frame.ambientSky    = [0.32 + _dkOvc * 0.03, 0.22 + _dkOvc * 0.04, 0.28 + _dkOvc * 0.04];
      // Fog: overcast evenings thicken into a grey-mauve murk; clear ones keep
      // a thin amber haze hugging the horizon.
      frame.fogColor      = [0.58 - _dkOvc * 0.08, 0.28 + _dkOvc * 0.06, 0.10 + _dkOvc * 0.14];
      frame.fogDensity    = 0.0022 + _dkOvc * 0.0014 - _dkClr * 0.0008;
      frame.skyZenith     = frameSky.zenith;
      frame.skyHorizon    = frameSky.horizon;
      frameSky.moon = 0;
      // Dusk: plenty of cloud to catch the orange light and set the sky alight
      _cloudBase = 0.58;
      // Low sun energy but rich colour — slightly lifted exposure (kept moderate
      // so golden hour reads filmic, not washed).
      frame.exposure = 1.03;
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
      frameSky.zenith  = [0.09 - clr * 0.04 + ovc * 0.28, 0.26 - clr * 0.10 + ovc * 0.26, 0.95 - ovc * 0.24];
      frameSky.horizon = [0.54 + ovc * 0.22, 0.68 + ovc * 0.12, 0.90 - clr * 0.02];
      // A lower, raking afternoon sun — high overhead light gave almost no shadow
      // modelling, which is what read "flat". Dropping the elevation casts long
      // building shadows for depth; azimuth varies per track so shadows fall
      // differently circuit to circuit. (Track palettes may ship a low/odd sun
      // tuned for their default ambience — override it for a clean day session.)
      // Circuits with a real-world sun geography carry an explicit
      // def.sunAzimBias (radians-ish horizontal offset, ±0.5 = strong tilt);
      // everything else falls back to the atmosphere-bias heuristic.
      const _dayAz = (track && track.def && track.def.sunAzimBias != null)
        ? track.def.sunAzimBias : _bias * 0.6;
      frameSky.sunDir = V3.norm([0.46 + _dayAz, 0.58, 0.42]);
      frame.sunDir    = frameSky.sunDir;
      // Strong WARM sun vs a cooler, slightly darker sky-fill: neutral concrete
      // then reads with a warm sunlit side and a cool shadow side (chiaroscuro),
      // which is what lifts a grey city out of "dull/flat". Overcast neutralises
      // the split toward a flat even grey.
      // Clear days drop the blue channel → warmer key against the cool sky fill
      // (stronger warm/cool chiaroscuro); overcast lifts blue back toward neutral.
      frame.sunColor   = [1.13 + clr * 0.04, 0.95 - ovc * 0.05, 0.72 - clr * 0.12 + ovc * 0.12];
      frameSky.sunColor = [1.0, 0.95, 0.84];
      // Warm low ground bounce; cool, restrained sky fill so shadows keep depth
      // (high flat ambient was washing the modelling out).
      frame.ambientGround = [0.24 + clr * 0.04, 0.19, 0.12];
      frame.ambientSky    = [0.26 + ovc * 0.12, 0.33 + ovc * 0.10, 0.50 + ovc * 0.06];
      // Fog: clearer (lower density, sky-matched colour) so distance reads crisp
      // instead of a flat grey wash; overcast hazes it back up.
      frame.fogColor      = [0.66 + ovc * 0.08, 0.74 + ovc * 0.05, 0.88 - clr * 0.05];
      frame.fogDensity    = 0.0008 + ovc * 0.0012;
      frame.skyZenith     = frameSky.zenith;
      frame.skyHorizon    = frameSky.horizon;
      frameSky.moon = 0;
      _cloudBase = 0.44 + ovc * 0.42;     // modest broken cloud (sky shader adds the cumulus richness); overcast → heavy deck
      // Brighter, punchier midday (was a flat 0.92). Clear days run a touch
      // hotter; overcast pulled back so the grey doesn't glare.
      frame.exposure = 0.99 + clr * 0.05 - ovc * 0.08;
    }
  } else {
    // "default" — the base sun/ambient come from the track palette (set ONCE at
    // load). Re-derive them from the palette HERE, every call, so the live tuner
    // offsets applied further down (sunElev/sunAzim/sunTemp/ambTemp/ambBalance/
    // cloudCover) never COMPOUND: applyRaceSettings fires on every slider input
    // event, and without this reset each event stacked its offset on the previous
    // result, so those knobs ran away in one direction regardless of drag
    // direction. The explicit-time branches above already rebuild their base.
    if (track && track.def && track.def.palette) {
      const _bp = track.def.palette;
      if (_bp.sunDir)        { frame.sunDir = V3.norm(_bp.sunDir); frameSky.sunDir = frame.sunDir; }
      if (_bp.sunColor)      frame.sunColor = _bp.sunColor.slice();
      if (_bp.ambientSky)    frame.ambientSky = _bp.ambientSky.slice();
      if (_bp.ambientGround) frame.ambientGround = _bp.ambientGround.slice();
      if (_bp.sun)           frameSky.sunColor = _bp.sun.slice();
      // Sky dome zenith/horizon too: the overcast/fog weather branches below
      // OVERWRITE frameSky.horizon to grey, and nothing restored it on the way
      // back to clear (only loadTrack set it) — so a clear→fog→clear cycle left
      // the horizon band + every reflection (frame.skyHorizon at 1603 feeds the
      // LIT env mirror / SSR fallback) stuck fog-grey under a correct blue
      // zenith. Re-derive from the palette each call, same base loadTrack uses.
      if (_bp.zenith)        frameSky.zenith  = _bp.zenith.slice();
      if (_bp.horizon)       frameSky.horizon = _bp.horizon.slice();
      frameSky.cloud = _bp.cloud !== undefined ? _bp.cloud : (isNightSession ? 0.22 : 0.4);
      // Fog too (mirrors the sun/ambient reset above): the weather branches below
      // MULTIPLY frame.fogDensity in place, so without a fresh base HERE every
      // weather() flip or _APPLY_RACE_IDS slider drag compounded it (fog raced to
      // white after a few ticks) and it stayed STUCK tripled after switching back
      // to dry. Re-derive from the palette each call — same base loadTrack sets.
      if (_bp.fog) frame.fogColor = _bp.fog.slice();
      frame.fogDensity = _bp.fogDensity != null ? _bp.fogDensity : (isNightSession ? 0.004 : 0.0012);
    }
    // Keep the REFLECTED sky (frame.skyZenith/Horizon → LIT env/rim/SSR fallback)
    // in sync with the sky dome so glass/wet-road/clearcoat mirror the sky the
    // player actually sees (the weather post-modifiers below re-sync on their side).
    frame.skyZenith = frameSky.zenith; frame.skyHorizon = frameSky.horizon;
    // "default" — driven by the track palette; set moon + stars for night tracks.
    // stars must be reset here symmetrically with moon: only the explicit-TOD
    // branch used to write it, so a live explicit-night → default flip (any
    // applyRaceSettings re-run without a track reload) kept stars in a day sky.
    frameSky.moon = isNightSession ? 0.85 : 0;
    frameSky.stars = isNightSession ? 1 : 0;
    // Dim the SCENE sun to soft moonlight at night. Many night palettes ship a
    // bright, near-overhead sun (it drives the sky glow) — left undimmed it lit
    // the road/scenery like daytime, which is why night looked washed (Singapore).
    // frameSky.sunColor is left alone so the warm sky/dusk glow survives; the
    // floodlights (buildTrackLights) now carve out the actually-lit areas.
    if (isNightSession) frame.sunColor = [0.12, 0.14, 0.22];   // unified moonlight key (matches explicit-night)
    _cloudBase = frameSky.cloud !== undefined ? frameSky.cloud
               : (isNightSession ? 0.22 : 0.44);   // modest cover; the sky shader carries the richer cumulus look

    // Global night ambient FLOOR: some night tracks ship very dark palette
    // ambients and rely entirely on per-mesh emissive to stay legible. Lift
    // any night track up to a baseline so the road and scenery always read,
    // without touching tracks that are already brighter (a floor, not a
    // multiply — brilliantly-lit street circuits keep their tuned values).
    // Moody-night ambient floor/cap + city-glow hue (shared with explicit-night
    // via _nightAmbientBand so the two night paths match).
    if (isNightSession) _nightAmbientBand();

    // ── Per-track atmosphere (default mode only) ──────────────────────────
    // Nudge cloud cover and fog to give circuits a characteristic sky
    // without overriding any explicit raceWeather or raceTimeOfDay choice.
    if (track && track.def) {
      const _def  = track.def;
      const _pal  = _def.palette || {};   // built def carries `palette` (not `pal`);
                                          // the old `_def.pal` was always undefined,
                                          // silently disabling the fog/sunDir nudges below.
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
        // Low night exposure so the dark stays dark and the neon/floodlights punch.
        frame.exposure = (_def.theme === "street_night") ? 0.86 : 0.90;
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
        // def.sunAzimBias (real-world sun geography) wins; otherwise a mild
        // tilt proportional to the atmosphere bias.
        const _azOffset = _def.sunAzimBias != null ? _def.sunAzimBias * 0.2 : _bias * 0.12;
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
  // Wet / rain: overcast the sky and flatten the light (soft, diffuse, fewer
  // shadows) — clouds roll in and the sun is muted while ambient lifts. A full
  // storm ("rain") rolls in heavier cloud and mutes the sun more than a merely
  // damp track ("wet"), which sits between clear and storm.
  // WEATHER SUN MUTE knob: scale how deeply bad weather dims the direct sun.
  // Each branch below mutes the sun by a fixed factor f (<1); _mute reshapes that
  // as 1−(1−f)·knob so 0 = weather never mutes the sun, 1 = as-shipped, >1 = deeper
  // murk (floored at 0). No-op in clear/dry weather (branches skipped).
  const _wsm = LT.weatherSunMute != null ? LT.weatherSunMute : 1;
  const _mute = (f) => Math.max(0, 1 - (1 - f) * _wsm);
  if (isWetRoad()) {
    const _storm = isRaining();
    // Heavier cloud cover in the rain; cap at 0.96 to let the shader still vary
    _cloudBase = Math.min(0.96, _cloudBase + (_storm ? 0.52 : 0.32));
    frameSky.cloud = _cloudBase;
    frame.sunColor = frame.sunColor.map((v) => v * _mute(_storm ? 0.5 : 0.68));
    frameSky.sunColor = frameSky.sunColor.map((v) => v * _mute(_storm ? 0.65 : 0.80));
    frame.ambientSky = frame.ambientSky.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    frame.ambientGround = frame.ambientGround.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    // Wet + overcast: lift exposure to keep the scene moody but readable — BUT a
    // wet NIGHT must stay dark (lifting it to 1.10 greys out the night and kills
    // the lamp-pool contrast), so dark sessions only get a whisker of lift.
    const _wetDark = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && isNightSession);
    frame.exposure = _wetDark
      ? Math.max(frame.exposure != null ? frame.exposure : 0.90, 0.95)
      : Math.max(frame.exposure != null ? frame.exposure : 1.0, _storm ? 1.03 : 1.00);
  } else if (raceWeather === "overcast") {
    // Dry but heavy grey cloud: flat, soft, shadow-light. No rain, dry grip.
    _cloudBase = Math.min(0.90, _cloudBase + 0.50);
    frameSky.cloud = _cloudBase;
    frame.sunColor = frame.sunColor.map((v) => v * _mute(0.7));
    frameSky.sunColor = frameSky.sunColor.map((v) => v * _mute(0.8));
    frame.ambientSky = frame.ambientSky.map((v) => Math.min(1, v * 1.06));
    frame.ambientGround = frame.ambientGround.map((v) => Math.min(1, v * 1.06));
    // Moody haze: thicker fog + a warm yellow-grey horizon (the "about to rain"
    // light) so heavy overcast reads atmospheric, not just a flat grey dim.
    frame.fogDensity = (frame.fogDensity || 0.0016) * 1.7;
    if (raceTimeOfDay === "default") { frameSky.horizon = [0.74, 0.73, 0.74]; frame.skyHorizon = frameSky.horizon; }
    // A night session must stay dark under overcast too — same guard the wet/fog
    // branches use. Without it the 0.86/0.90 night exposure was forced up to 1.0,
    // greying out the night and killing lamp-pool contrast.
    const _ovcDark = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && isNightSession);
    const _ovcFloor = _ovcDark ? 0.95 : 1.0;
    if (frame.exposure == null || frame.exposure < _ovcFloor) frame.exposure = _ovcFloor;
  } else if (raceWeather === "fog") {
    // Low-visibility mist: dense pale fog, muted sun, moderate cloud. No rain, dry grip.
    frameSky.cloud = Math.min(0.85, _cloudBase + 0.35);
    frame.fogDensity = (frame.fogDensity || 0.0017) * 3.0;
    const fc = [0.74, 0.76, 0.78];
    frame.fogColor = fc;
    // Don't erase an explicit twilight horizon (dawn magenta / dusk coral) — only
    // flatten the horizon to fog-grey in default mode. Sync frame.skyHorizon so
    // reflections (glass/wet road/clearcoat) match the grey dome, not a stale blue.
    if (raceTimeOfDay === "default") { frameSky.horizon = fc.slice(); frame.skyHorizon = frameSky.horizon; }
    frame.sunColor = frame.sunColor.map((v) => v * _mute(0.6));
    frameSky.sunColor = frameSky.sunColor.map((v) => v * _mute(0.7));
    frame.ambientSky = frame.ambientSky.map((v) => Math.min(1, v * 1.05));
    frame.ambientGround = frame.ambientGround.map((v) => Math.min(1, v * 1.05));
    // Lift for visibility in the murk — but a NIGHT fog must stay night: forcing
    // 1.08 over the 0.86-0.90 night base (+25%) grey-washed the dark and killed
    // the lamp-glow-in-fog mood. Dark sessions get a smaller floor.
    const _fogDark = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && isNightSession);
    const _fogFloor = _fogDark ? 0.95 : 1.08;
    if (frame.exposure == null || frame.exposure < _fogFloor) frame.exposure = _fogFloor;
  } else {
    frameSky.cloud = _cloudBase;
    // Guarantee frame.exposure always has a value (default = 1.0 if nothing set above)
    if (frame.exposure == null) frame.exposure = 1.0;
  }
  // Low-lying ground mist: rolling morning mist at dawn, atmospheric haze in
  // wet/overcast/fog, a touch at night for mood; a clear day has none. Plus a
  // per-track lean — humid circuits hold mist, arid deserts stay crisp.
  {
    let gm = 0;
    if (raceTimeOfDay === "dawn") gm = 0.40;
    else if (raceTimeOfDay === "dusk") gm = 0.22;
    else if (raceTimeOfDay === "night" || (raceTimeOfDay === "default" && isNightSession)) gm = 0.16;
    if (isWetRoad()) gm = Math.max(gm, isRaining() ? 0.18 : 0.12);
    else if (raceWeather === "overcast") gm = Math.max(gm, 0.34);
    else if (raceWeather === "fog") gm = Math.max(gm, 0.58);
    const _mb = track && track.def ? _trackAtmoBias(track.def) : 0;   // +overcast/humid, -arid
    gm *= 1.0 + clamp(_mb, -0.6, 0.6) * 0.5;
    frame.groundMist = clamp(gm, 0, 0.7);
  }
  // ── Live lighting-tuner overrides on the CONDITION-derived values ──
  // Re-derived fresh from the branch values every call (applyRaceSettings re-runs
  // whenever one of these knobs changes — see _APPLY_RACE_IDS), so they never
  // compound. All default to a no-op.
  {
    // SUN / MOON WARMTH — white-balance the final direct key colour.
    const st = LT.sunTemp || 0;
    if (st && frame.sunColor) {
      const sr = 1 + Math.max(0, -st) * 0.18 - Math.max(0, st) * 0.12;
      const sb = 1 - Math.max(0, -st) * 0.30 + Math.max(0, st) * 0.20;
      frame.sunColor = [frame.sunColor[0] * sr, frame.sunColor[1] * (1 - Math.abs(st) * 0.02), frame.sunColor[2] * sb];
    }
    // SUN ELEVATION / AZIMUTH offset — rebuild sunDir from the default direction.
    if ((LT.sunElev || LT.sunAzim) && frame.sunDir) {
      const d = frame.sunDir;
      let el = Math.asin(clamp(d[1], -1, 1)) + (LT.sunElev || 0) * Math.PI / 180;
      let az = Math.atan2(d[0], d[2]) + (LT.sunAzim || 0) * Math.PI / 180;
      el = clamp(el, -1.54, 1.54);
      const ce = Math.cos(el), nd = [ce * Math.sin(az), Math.sin(el), ce * Math.cos(az)];
      frame.sunDir = nd; frameSky.sunDir = nd;
    }
    // CLOUD COVER offset (also drives cloud shadows via uCloudCover).
    if (LT.cloudCover) frameSky.cloud = clamp((frameSky.cloud != null ? frameSky.cloud : 0) + LT.cloudCover, 0, 1);
    // MOON BRIGHTNESS.
    if (frameSky.moon) frameSky.moon *= LT.moonBright;
    // CITY SKYGLOW (fresh array — never mutate the palette in place).
    if (frameSky.cityGlow && LT.cityGlowMul !== 1) frameSky.cityGlow = frameSky.cityGlow.map((v) => v * LT.cityGlowMul);
    // AMBIENT WARMTH + SKY/GROUND FILL BALANCE — white-balance the hemisphere
    // fill and tip its energy toward sky dome (+) or ground bounce (−). Fresh
    // arrays; both default to a no-op.
    const at = LT.ambTemp || 0, ab = LT.ambBalance || 0;
    if ((at || ab) && frame.ambientSky && frame.ambientGround) {
      const ar = 1 + Math.max(0, -at) * 0.16 - Math.max(0, at) * 0.10;
      const ag = 1 - Math.abs(at) * 0.02;
      const abb = 1 - Math.max(0, -at) * 0.24 + Math.max(0, at) * 0.16;
      const skyG = 1 + Math.max(0, ab) * 0.5, grdG = 1 + Math.max(0, -ab) * 0.5;
      frame.ambientSky = [frame.ambientSky[0] * ar * skyG, frame.ambientSky[1] * ag * skyG, frame.ambientSky[2] * abb * skyG];
      frame.ambientGround = [frame.ambientGround[0] * ar * grdG, frame.ambientGround[1] * ag * grdG, frame.ambientGround[2] * abb * grdG];
    }
  }
  // Save base ambient + exposure so the lightning system can restore them each
  // frame. Exposure matters: the flash SETS frame.exposure from this base — the
  // old `frame.exposure +=` compounded ~+1.65 per strike and never restored, so
  // every strike left the whole scene permanently brighter (a stormy race washed
  // out to white over a few minutes).
  _ltBase = {
    ambientSky:    frame.ambientSky.slice(),
    ambientGround: frame.ambientGround.slice(),
    exposure:      frame.exposure != null ? frame.exposure : 1.0,
  };
  // Arm lightning timing (first strike after a random 3-8 s delay) — but only
  // when no countdown is already pending: applyRaceSettings re-runs on EVERY
  // tuner drag tick for the _APPLY_RACE_IDS knobs, and unconditionally
  // re-arming here kept pushing the strike 3-8 s away, so lightning never
  // fired while a sun/ambient slider was being dragged in the rain.
  if (!(_ltNextT > 0)) { _ltFlash = 0; _ltNextT = 3 + Math.random() * 5; }
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

// Snap the live camera straight to the current mode's vantage (no damping), so
// the first rendered frame is already framed correctly. Without this the camera
// damps out of whatever stale eye/target/fov the previous screen (menu flyby)
// left behind — and for the onboard cams the slow target/fov damping (λ7/λ4)
// takes a second-plus to converge, during which a broken projection renders the
// cockpit bodywork as a black box across the frame at the start ("clips until I
// throttle past the start"). Shared by startRace() and __apex.snapCam().
function snapGameCam() {
  if (!player || !track) return;
  const bankCam = Tracks.banking(track, player.s, player.x, _bankScratch);
  const v = camVantage(CAM_MODES[camMode].id, player.s, player.x, player.speed || 0, 0, {
    bankDy: bankCam ? bankCam.dy : 0, deploy: player.deploying, slipLat: player.vLat || 0,
  });
  camEye[0] = v.eye[0]; camEye[1] = v.eye[1]; camEye[2] = v.eye[2];
  camTgt[0] = v.tgt[0]; camTgt[1] = v.tgt[1]; camTgt[2] = v.tgt[2];
  camFov = v.fov;
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
  if (isWetRoad()) {           // "rain" = storm field; "wet" = sparse drizzle tier
    initRainDrops();
    rainCanvas.style.display = "block";
  } else {
    rainCanvas.style.display = "none";
  }
  gridUp();
  recomputePlayerMods();
  resultT = 0;
  camRoll = 0;
  sectorIdx = sectorAt(player.s); sectorStartT = 0;
  state = "count"; countT = 0; lightsLit = 0; raceT = 0; startHold = 0; paused = false; frozen = false; skyViewOverride = null;
  skidActive = 0; skidIdx = 0; skidFrameT = 0; _skidBatchDirty = true;
  Particles.clear();   // no stale smoke/spray teleporting into the new session
  els.overlay.hidden = true; els.select.hidden = true; els.results.hidden = true;
  els.hud.hidden = false; els.lights.hidden = false; els.pausebtn.hidden = false;
  if (els.btnCam) els.btnCam.hidden = false;
  setHudUserHidden(false);   // start every race with the HUD shown (+ resets the toggle label)
  els.soundbtn.hidden = true;   // sound is toggled from the pause menu during a race
  document.body.classList.add("in-race");
  for (const l of els.lights.children) l.classList.remove("on");
  showTouchControls(true);
  dbgCam = null;              // fresh race — drop any leftover debug free-cam
  snapGameCam();              // frame the grid correctly on the very first render
  Input.calibrate();
  if (soundOn) { GameAudio.startEngine(); GameAudio.startMusic(trackIdx); }
  if (soundOn && isWetRoad()) GameAudio.startRain(isRaining() ? undefined : 0.022);   // drizzle = low-gain patter
  updateHud(true);
}

function showTouchControls(show) {
  const t = show && Input.touchControlsNeeded();
  const manual = gearsManual();   // only ever true in tilt mode
  // GAS pedal whenever throttle is manual (tilt/button); touch auto-throttle hides it
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

function endRace(forcedOrder) {
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
  const order = forcedOrder || fin.concat(run);
  order.forEach((c, i) => { c.finPos = i + 1; });
  if (seasonMode) {
    order.forEach((c, i) => {
      const pts = Teams.POINTS[i] || 0;
      season.pts[c.driverId] = (season.pts[c.driverId] || 0) + pts;
      season.driverCodes[c.driverId] = c.code;
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
    const all = cars.slice().sort((a, b) => (season.pts[b.driverId] || 0) - (season.pts[a.driverId] || 0)).slice(0, 10);
    all.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "res-row" + (c.isPlayer ? " you" : "");
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
      const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = cssCol(c.team.color);
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = c.code + "  " + c.name;
      const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (season.pts[c.driverId] || 0) + " pts";
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
    clrBtn.onclick = () => {
      Ghost.clear(track.def.id);
      const remaining = ttBoard(track.def.id);
      ttRecord = remaining.length ? remaining[0].t : Infinity;
      buildTTResults();
    };
    clrRow.appendChild(clrBtn);
    els.resultsTable.appendChild(clrRow);
  }

  els.resNext.textContent = "TRY AGAIN";
}
function teamById(id) { return Teams.LIST.find((t) => t.id === id); }
function cssCol(c) { return "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")"; }
// Convert between an <input type=color> hex string and a [r,g,b] 0..1 array.
function hexToArr(h) { const n = parseInt(String(h).slice(1), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function arrToHex(a) { const f = (v) => ("0" + Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16)).slice(-2); return "#" + f(a[0]) + f(a[1]) + f(a[2]); }

function quitToMenu() {
  closeLightTuner(false);
  state = "menu"; paused = false;
  document.body.classList.remove("in-race");
  setHudUserHidden(false);   // clear clean-screen mode on exit
  els.hud.hidden = true; els.lights.hidden = true; els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  els.pausemenu.hidden = true; els.results.hidden = true; els.announce.hidden = true;
  $("advanced").hidden = true; $("lighting").hidden = true;
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
  drList.forEach(([driverId, pts], i) => {
    const c = cars.find((x) => x.driverId === driverId);
    const code = c ? c.code : ((season.driverCodes && season.driverCodes[driverId]) || driverId);
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
// ── Live weather switch (shared path) ────────────────────────────────────────
// The single way weather changes mid-session: sets raceWeather, re-seeds the
// rain overlay, flips the rain audio and re-applies the frame lighting. Used by
// __apex.weather() and the dynamic weather-arc progression below, so every
// consumer (rain layer, audio, lighting, AI grip, wetness ramp target) follows
// no matter who initiated the change.
function setWeatherLive(w) {
  raceWeather = (w === "wet" || w === "rain" || w === "overcast" || w === "fog") ? w : "dry";
  if (isWetRoad()) {
    initRainDrops();   // always re-seed: the drizzle↔storm tiers differ in density
    if (rainCanvas) rainCanvas.style.display = "block";
  } else if (rainCanvas) {
    rainCanvas.style.display = "none";
  }
  if (soundOn) { if (isWetRoad()) GameAudio.startRain(isRaining() ? undefined : 0.022); else GameAudio.stopRain(); }
  // Re-apply the frame lighting NOW: without this a live weather change only
  // moved the wetness ramp / rain overlay — the cloud cover, muted sun,
  // ambient lift, fog density and exposure branches in applyRaceSettings
  // silently kept the previous weather (fog looked like a clear day).
  if (track) applyRaceSettings();
  return raceWeather;
}

// ── Dynamic weather progression (weather arc) ────────────────────────────────
// Optional scripted per-race weather transition — OFF by default (no arc unless
// started via __apex.weatherArc(from, to, secs); a race-settings surface can
// hook in later). The arc walks the dry↔wet↔rain ladder stage by stage over its
// duration (lateral conditions like fog/overcast jump direct), flipping each
// stage through setWeatherLive() so the rain overlay/audio/lighting/AI grip all
// follow, and frame.wetness ramps via the existing per-frame ramp. Ticked from
// update() on the fixed physics clock, so it also runs under __apex.headless.
let weatherArc = null;   // { from, to, t, dur, seq }
const _WX_LADDER = ["dry", "wet", "rain"];
const _WX_VALID = ["dry", "wet", "rain", "overcast", "fog"];
function weatherArcSeq(from, to) {
  const a = _WX_LADDER.indexOf(from), b = _WX_LADDER.indexOf(to);
  if (a >= 0 && b >= 0 && a !== b) {
    const seq = [];
    for (let i = a; (a < b) ? i <= b : i >= b; i += (a < b) ? 1 : -1) seq.push(_WX_LADDER[i]);
    return seq;   // e.g. dry→rain = [dry, wet, rain]; rain→dry = [rain, wet, dry]
  }
  return [from, to];
}
function startWeatherArc(from, to, dur) {
  if (_WX_VALID.indexOf(from) < 0 || _WX_VALID.indexOf(to) < 0 || from === to) return null;
  weatherArc = { from, to, t: 0, dur: Math.max(1, dur || 60), seq: weatherArcSeq(from, to) };
  if (raceWeather !== from) setWeatherLive(from);
  return weatherArc;
}
function tickWeatherArc(dt) {
  if (!weatherArc) return;
  weatherArc.t += dt;
  const f = Math.min(1, weatherArc.t / weatherArc.dur);
  const seq = weatherArc.seq;
  const want = seq[Math.min(seq.length - 1, Math.floor(f * seq.length))];
  if (raceWeather !== want) setWeatherLive(want);
  if (f >= 1) {
    if (raceWeather !== weatherArc.to) setWeatherLive(weatherArc.to);
    weatherArc = null;   // arc complete — weather stays at `to`
  }
}

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
      cars.forEach((c) => { c.lapStart = 0; });
    }
    return;
  }
  if (state !== "race") return;
  raceT += dt;
  tickWeatherArc(dt);   // dynamic weather progression (no-op unless an arc is armed)
  // ranks by progress (reuse module-scope buffer, no per-step allocation)
  ranked.length = 0;
  for (const c of cars) ranked.push(c);
  ranked.sort((a, b) => b.prog - a.prog);
  ranked.forEach((c, i) => { c.rank = i + 1; });

  for (const c of cars) updateCar(c, dt, ranked);

  resolveCollisions(ranked, dt);

  // race ends when the player finishes, or shortly after the winner does, or
  // at a hard time cap so it can never hang
  if (resultT === 0) {
    if (player.finished) resultT = 2.2;
    else if (cars.some((c) => c.finished)) resultT = 3.5;
    else if (raceT > 360 * lapsTarget) resultT = 0.1;
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
  // Visual-only spark cue: render() consumes this flag and fires a Particles
  // burst at the car's world position (collideFx has no world coords here).
  // Never read by physics — headless runs are unaffected.
  pc.fxSparkI = Math.max(pc.fxSparkI || 0, impact);
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
function resolveCollisions(ranked, dt) {
  const LCAR = 4.8, WCAR = 2.0, PASSES = 4;
  // Side-rub speed scrub as a RATE: 0.995/frame was authored at the fixed
  // 1/60 step (identical there: 0.995^1), but the headless harness steps at
  // arbitrary dt — unscaled, a rub scrubbed per CALL, not per second.
  const rubScrub = Math.pow(0.995, (dt || 1 / 60) * 60);
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
          a.speed *= rubScrub; b.speed *= rubScrub;   // barely scrub speed on a side rub
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
  c.kCur = k;   // cache for the render loop's body-lean (avoids a 2nd curvature calc/car/frame)
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
    // Walk OUTWARD from our rank in the prog-sorted field, breaking once the prog
    // delta leaves the [-6, +18] window — same neighbours as scanning all of ranked,
    // without the O(n) per-car pass (mirrors resolveCollisions' break pattern).
    const ci = (c.rank || 1) - 1;
    for (let up = ci - 1; up >= 0; up--) {    // ahead of us: prog rises, dprog rises
      const o = ranked[up];
      const dprog = o.prog - c.prog;          // >0 = ahead of us
      if (dprog > 18) break;
      const dx = o.x - c.x;
      if (Math.abs(dprog) < 5.5) {            // alongside: eats the room on its side
        if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
        else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
      }
      if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < 2.2) { blocker = o; blockerGap = dprog; }
    }
    for (let dn = ci + 1; dn < ranked.length; dn++) {   // behind us: prog falls, dprog falls
      const o = ranked[dn];
      const dprog = o.prog - c.prog;          // <0 = behind us
      if (dprog < -6) break;
      const dx = o.x - c.x;
      if (Math.abs(dprog) < 5.5) {            // alongside: eats the room on its side
        if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
        else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
      }
      // (no blocker test here — dprog <= 0 for everything behind us)
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
  const wantBoost = (c.isPlayer ? c.boostOn
    : (Math.abs(Tracks.curvature(track, wrapS(c.s + 60))) < 0.006 && c.energy > 0.25))
    || c.otT > 0;   // OVERTAKE deploys on its own — even with BOOST toggled off
  if (wantBoost && c.energy > 0) {
    const taper = c.otT > 0 ? 1 : clamp(1 - (c.speed - TAPER_LO) / (TAPER_HI - TAPER_LO), 0, 1);
    deploy = DEPLOY_A * taper;
    // Only drain the battery when deploy actually produces thrust. Above the taper
    // band (with no OT active) deploy is 0, so holding BOOST there must not silently
    // waste ERS for zero benefit.
    if (deploy > 0) c.energy = Math.max(0, c.energy - DRAIN * dt);
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
    // Bank sampled mid-LOOKAHEAD (the corner being braked for), via the same
    // wrap-safe helper the grip model uses — not a raw node read at the car.
    const bankMu = 1 + Math.sin(Tracks.bankAngle(track, wrapS(c.s + look * 0.5))) * 0.8;
    // gripMult(): the AI's lateral authority is weather-cut (see the c.x +=
    // step below), so its corner-speed decision must budget for the same wet
    // grip — otherwise it carries dry entry speed and runs wide in the rain.
    const vCorner = Math.sqrt(LAT_MAX * bankMu * gripMult() / Math.max(kMax, 1e-5)) * c.skill;
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
    // Walk OUTWARD from our rank; break once |prog delta| exceeds 6.5 (prog-sorted,
    // so the window is a contiguous index range — same neighbours, no full-field scan).
    const ci2 = (c.rank || 1) - 1;
    for (let up = ci2 - 1; up >= 0; up--) {   // ahead of us
      const o = ranked[up];
      const dp = o.prog - c.prog;             // >0
      if (dp > 6.5) break;                    // only cars roughly alongside
      const dx = c.x - o.x, adx = Math.abs(dx);
      const deficit = MIN_GAP - adx;
      if (deficit <= 0) continue;             // already spaced — leave alone
      sep += (dx >= 0 ? 1 : -1) * deficit * (1 - dp / 6.5);
    }
    for (let dn = ci2 + 1; dn < ranked.length; dn++) {   // behind us
      const o = ranked[dn];
      const dpr = o.prog - c.prog;            // <0
      if (dpr < -6.5) break;                  // only cars roughly alongside
      const dp = -dpr;                        // |prog delta|
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
  const bankPhys = Tracks.banking(track, c.s, 0, _bankScratchP);
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
    // right / toward the turn"). Full assist on tarmac, tapering to zero ~3 m
    // past the road edge. CONTINUOUS in |x| — the old form gated on c.offroad
    // (which excludes the kerb), so leaving the kerb outer edge started the
    // ramp partway down: a step loss of ~kerbWidth/3 of the steering help in a
    // single tick, felt as a snap. Now the ramp begins at the road edge and
    // crosses the kerb smoothly (slightly less assist ON the kerb — more
    // manual authority there, which kerb-riding wants anyway).
    const offAssistFade = Math.max(0, 1 - Math.max(0, Math.abs(c.x) - hw) / 3);
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
      : (onThrottle
          ? ACCEL * PACE * (c.isPlayer ? playerMods.accel : 1) * clamp(1 - c.speed / Math.max(vmax, 1), 0, 1) * gearMult + deploy
          : -COAST_DRAG);
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
    // NOTE (deliberate asymmetry): the on-throttle axEst uses the DEPLOY_A-scale
    // accel, not the full engine ACCEL, so power-on costs far less cornering
    // grip than braking does — arcade forgiveness on corner exits. Making the
    // circle symmetric (power-limited exits) is a feel/design change, not a fix.
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
    // Floored: setPhysics({yawInertia:0}) would otherwise make the rdot below
    // divide by zero and NaN the whole car state.
    const kz2 = Math.max(1e-3, af * ar * YAW_INERTIA);   // yaw inertia / mass (scaled)
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
  // Brake-disc heat (render-only): glows up while braking at speed, cools after.
  // Drives the emissive brake-glow rings on the player's wheels.
  {
    // ALL cars (the AI brake into corners too — a field of glowing discs).
    const heating = braking && c.speed > 12;
    c.brakeHeat = clamp((c.brakeHeat || 0) + (heating ? dt * 1.6 : -dt * 0.9), 0, 1);
  }
  if (c.isPlayer) {
    // Exhaust glow (render-only): rises on throttle, dies quickly off it.
    c.exhaustPop = clamp((c.exhaustPop || 0) + (onThrottle && c.speed > 8 ? dt * 5 : -dt * 7), 0, 1);
  }
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
  c.wheelAngle = (c.wheelAngle || 0) + c.speed / 0.34 * dt;

  // Sector detection (curated splits via sectorAt). Must run before finish-line
  // timing resets so a forward S3→S1 crossing records the completed S3 split.
  if (c.isPlayer && state === "race" && track) {
    const newSector = sectorAt(c.s);
    if (newSector !== sectorIdx) {
      if (ds > 0 && (sectorIdx < newSector || (sectorIdx === 2 && newSector === 0))) {
        // Grid sits just before the line (in S3). The first start/finish crossing
        // only starts the flying lap (lap 0→1) — do NOT stamp that formation
        // segment as an S3 split/best, or the HUD shows a bogus ~few-second S3
        // the moment the race begins.
        if (c.lap >= 1) {
          const elapsed = c.lapTime - sectorStartT;
          const prevSector = sectorIdx;
          const prevBest = sectorBests[prevSector];
          sectorLast[prevSector] = elapsed;
          // Delta is measured against the PREVIOUS best, before this split updates it,
          // so a new personal best shows the actual improvement (not 0.000).
          const delta = elapsed - (prevBest < Infinity ? prevBest : elapsed);
          if (elapsed < prevBest) sectorBests[prevSector] = elapsed;
          if (elapsed >= 2) {
            const sign = delta <= 0 ? "▼ S" : "▲ S";
            announce(sign + (prevSector + 1) + " " + elapsed.toFixed(3), 1.5);
          }
        }
      }
      sectorIdx = newSector;
      sectorStartT = c.lapTime;
    }
  }

  // line crossing (forward only: ds > 0 prevents backward crossings from incrementing lap)
  if (ds > 0 && oldS > track.total * 0.5 && c.s < track.total * 0.5) {
    c.lap++;
    if (c.lap > 1) {
      const lapDone = c.lapTime;
      c.lastLap = lapDone;
      if (lapDone < c.best) c.best = lapDone;
      if (c.isPlayer && soundOn) GameAudio.lap();
      if (c.isPlayer && timeTrial) onTTLap(lapDone);
    } else if (c.isPlayer && timeTrial) {
      Ghost.startLap();
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
  if (timeTrial && c.isPlayer) Ghost.record(c.lapTime, c.s, c.x);

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

// Lighting tuner registry (TUNE_DEFS), the live LT values, floodColor and
// the track light builder live in js/game/lighting.js. LT is a plain object
// mutated in place, so the profile-resolution code below and the sliders/
// __apex.lightTune keep every LT.x call site unchanged.
const { TUNE_DEFS, LT, floodColor, LAMP_KINDS, buildTrackLights } = LightTune;
// Profile store shape: { "monza|night|wet": {lampLevel:0.4,…}, "*": {…legacy} }.
let _ltStore = {};
{
  const saved = store.get("lightTune", null);
  if (saved && typeof saved === "object") {
    const vals = Object.values(saved);
    // Legacy flat format was {id:number}. New format nests {key:{id:number}}.
    if (vals.length && vals.every((v) => typeof v === "number")) _ltStore = { "*": saved };
    else _ltStore = saved;
  }
}
// The profile key for the CURRENT session conditions ("default" TOD resolves to
// the track's actual day/night look so it shares one profile with an explicit
// pick of the same look).
function ltKey() {
  if (!track || !track.def) return null;
  let tod = raceTimeOfDay;
  if (tod === "default") tod = track.def.night ? "night" : "day";
  return track.def.id + "|" + tod + "|" + raceWeather;
}
// The resolution layers for the current condition, LOWEST precedence first:
//   TUNE_DEFS default → file "*" → file "track|tod|wx"
//     → localStorage "*" → localStorage "track|tod|wx"
// So a committed js/light-presets.js is the shipped baseline, and a player's
// local (localStorage) edits always win over it. A missing layer is skipped.
function ltLayers() {
  const F = window.LightPresets || null;
  const key = ltKey();
  return [
    F && F["*"], F && key && F[key],
    _ltStore["*"], key && _ltStore[key],
  ];
}
// What the current knob would resolve to WITHOUT the current condition's local
// profile — i.e. the value RESET falls back to. Used to decide whether a slider
// edit needs storing (store only when it differs from this fallback).
function ltFallback(id) {
  const d = TUNE_DEFS.find((t) => t.id === id);
  let v = d.def;
  const F = window.LightPresets || null, key = ltKey();
  if (F && F["*"] && typeof F["*"][id] === "number") v = F["*"][id];
  if (F && key && F[key] && typeof F[key][id] === "number") v = F[key][id];
  if (_ltStore["*"] && typeof _ltStore["*"][id] === "number") v = _ltStore["*"][id];
  return clamp(v, d.min, d.max);
}
// Rebuild LT for the current conditions. Called whenever the track/time/weather
// changes (via applyRaceSettings) so the right profile is live for both the
// tuner panel and actual racing.
// Knobs whose effect is baked into frame.*/frameSky.* by applyRaceSettings()
// (not read per-frame in render). Changing one re-runs applyRaceSettings so it
// updates live — safe because that function re-derives from the branch values.
const _APPLY_RACE_IDS = new Set(["sunTemp", "sunElev", "sunAzim", "cloudCover", "moonBright", "cityGlowMul", "cityGlowTint", "ambTemp", "ambBalance"]);
function applyLightTune(fromApplyRace) {
  const layers = ltLayers();
  let rebuilt = false, reapply = false, reinit = false;
  for (const d of TUNE_DEFS) {
    let v = d.def;
    for (const L of layers) if (L && typeof L[d.id] === "number") v = L[d.id];
    v = clamp(v, d.min, d.max);
    if (LT[d.id] !== v) { LT[d.id] = v; if (d.rebuild) rebuilt = true; if (d.reinitRain) reinit = true; if (_APPLY_RACE_IDS.has(d.id)) reapply = true; }
  }
  if (rebuilt && track) track._lights = null;
  // Skip the reapply when applyRaceSettings itself invoked us (it derives from
  // the fresh LT values right after this returns) — re-entering ran the whole
  // sky/ambient/fog derivation twice per track/time/weather transition.
  if (reapply && !fromApplyRace && track && state !== "menu" && state !== "select") applyRaceSettings();
  if (reinit && isWetRoad()) initRainDrops();
}
function setLightTune(id, v) {
  const d = TUNE_DEFS.find((t) => t.id === id);
  if (!d || typeof v !== "number" || !isFinite(v)) return false;
  v = clamp(v, d.min, d.max);
  LT[id] = v;
  const key = ltKey();
  if (key) {
    const prof = _ltStore[key] || (_ltStore[key] = {});
    // Store only when the value differs from what it would resolve to anyway
    // (default / file / legacy global). Storing an explicit value IS required
    // when it matches the default but the file/global would otherwise win —
    // that's how a local edit overrides a shipped value back down.
    if (v === ltFallback(id)) delete prof[id]; else prof[id] = v;
    if (!Object.keys(prof).length) delete _ltStore[key];
  }
  if (d.rebuild && track) track._lights = null;   // re-bake per-track light records next frame
  if (d.reinitRain && isWetRoad()) initRainDrops();   // re-seed the rain field with the new count/length
  if (_APPLY_RACE_IDS.has(id) && track && state !== "menu" && state !== "select") applyRaceSettings();
  return true;
}
function persistLightTune() { store.set("lightTune", _ltStore); }
// LAMP_KINDS + buildTrackLights(track) live in js/game/lighting.js (LightTune).

// Car rain lights as REAL light sources after dark: the nearest few cars carry a
// small red point light at the tail, so traffic reads as moving light sources —
// a red glow trailing each car on the road surface.
const _tlSmp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _tlSel = [];
function appendCarTailLights() {
  const L = frame.lights;
  // frame.lights is always the per-frame copy (flicker copies every frame), so
  // appending here never mutates the cached track set.
  if (!L || L === track._lights || !player) return;
  _tlSel.length = 0;
  const tlRange = LT.tailRange != null ? LT.tailRange : 160;   // TAIL-LIGHT RANGE knob
  for (const c of cars) {
    const ds = Math.abs(c.s - player.s);
    const d = Math.min(ds, track.total - ds);
    if (d < tlRange) _tlSel.push({ c, d });
  }
  _tlSel.sort((a, b) => a.d - b.d);
  const nT = Math.min(_tlSel.length, 5);
  if (nT <= 0) return;
  // Reserve up to nT slots for the nearest cars' tail-lights. On a dense night
  // grid the floodlights alone can fill the shader's 32-light cap (or the tighter
  // lampCull CAP from setFrameLights), so appending overflowed and the shader
  // dropped the tail-lights. Evict that many of the FARTHEST floods instead
  // (setFrameLights sorts ascending by distance, so the tail end is farthest).
  const room = 32 - ((L.length / 15) | 0);
  if (room < nT && L.length >= nT * 15) L.length -= (nT - room) * 15;
  // TAIL-LIGHT FADE: ease the glow out over the last `tailFade` m before the range
  // cutoff so a car doesn't pop in/out abruptly as it drifts past the limit. 0 =
  // hard cutoff (as-shipped), so the fade term is 1 for every selected car.
  const tlFade = LT.tailFade != null ? LT.tailFade : 0;
  for (let j = 0; j < nT; j++) {
    const sel = _tlSel[j], c = sel.c;
    Tracks.sample(track, c.s, _tlSmp);
    const tx = _tlSmp.t[0], tz = _tlSmp.t[2];
    // rear-facing, tilted down: the glow lands on the road behind the car
    let dx = -tx * 0.87, dy = -0.5, dz = -tz * 0.87;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    // BRAKE FLARE: the tail glow surges while the car is braking. brakeHeat is
    // the render-only 0..1 disc-heat ramp every car already tracks (rises under
    // braking, cools after) — read-only here, physics untouched.
    const bAmt = clamp(c.brakeHeat || 0, 0, 1) * LT.brakeGlowMul;
    const fadeF = tlFade > 0 ? clamp((tlRange - sel.d) / tlFade, 0, 1) : 1;
    const tlm = LT.tailLightMul * (1 + bAmt * 1.6) * fadeF;
    L.push(
      _tlSmp.p[0] + _tlSmp.r[0] * c.x - tx * 2.4,
      _tlSmp.p[1] + 0.55,
      _tlSmp.p[2] + _tlSmp.r[2] * c.x - tz * 2.4,
      4.5 * tlm, 0.14 * tlm, 0.10 * tlm,
      8 * (1 + bAmt * 0.45), dx, dy, dz, 0.5, -0.2, 0.12, 0.25, 0.4);
  }
}

// Cull the track light set to the nearest CAP lamps (shader max 32; traffic uses
// LT.lampCull, def 28, leaving room for car tail lights) and flatten into
// `frame.lights`. Called each frame only when floodlights are lit.
const _lightCullBuf = [];
const _lightFwd = [0, 0, 0];   // camera-forward scratch for the ahead-biased cull
const _lightScaleBuf = [];
const _lightHeap = [];         // pooled max-heap (≤CAP entries) for nearest-N selection
let _lampWarmT0 = -1e9;        // wall-clock (s) when the floods last switched ON (warmup ramp origin)
let _lampLastT = -1e9;         // last frame we copied lights — a gap means the floods were off
const _flScr = [1, 1, 1];      // per-lamp rgb factor scratch (flicker × breathe × warmup tint)
function setFrameLights(eye, scale, fwd) {
  const src = track._lights;
  if (!src || !src.length) { frame.lights = null; return; }
  // Reserve slots for car tail lights: appendCarTailLights fills AFTER this
  // cull. With traffic, CAP defaults to lampCull (28) so ~4 of the 32 shader
  // slots stay free; solo runs use the full 32.
  const CAP = cars.length > 1 ? Math.round(LT.lampCull != null ? LT.lampCull : 28) : 32;
  // scale may be a scalar (uniform dim) or a [r,g,b] vector (time-of-day brightness
  // + warmth: dim & warm at twilight, full & neutral at deep night).
  const sr = Array.isArray(scale) ? scale[0] : (scale == null ? 1 : scale);
  const sg = Array.isArray(scale) ? scale[1] : sr;
  const sb = Array.isArray(scale) ? scale[2] : sr;
  const count = src.length / 15;
  const out = _lightScaleBuf;
  // Per-lamp FLICKER, computed CPU-side each frame (zero shader cost): healthy
  // lamps barely breathe (±2%), the occasional aging tube visibly pulses (±10%).
  // Hash on the lamp's stable source offset so the same lamp always flickers the
  // same way — the night stops being a frozen still.
  const tNow = performance.now() * 0.001;
  // WARMUP: when the floods switch on (race start on a night track, a live
  // day→night flip) discharge lamps don't snap to full — they run slightly dim
  // and sodium-warm and settle to their true colour over a few seconds, each
  // lamp on its own stagger. A >1 s gap since the last copy means the floods
  // were off, so this frame is a fresh switch-on. Per-frame copy only — the
  // baked track records are never touched.
  if (tNow - _lampLastT > 1.0) _lampWarmT0 = tNow;
  _lampLastT = tNow;
  const fl = (o) => {
    const x = Math.sin((o + 13) * 91.17) * 43758.5453;
    const hsh = x - Math.floor(x);
    const amp = hsh > 0.90 ? LT.lampFlicker : LT.lampFlicker * 0.2;
    // Fast flicker (the odd aging tube) + a slow BREATHE every lamp carries
    // (mains/arc drift, ~±1.5% at the default knob). Both scale with the LAMP
    // FLICKER knob so 0 still means rock-steady.
    let f = 1 + amp * Math.sin(tNow * (6 + hsh * 9) + hsh * 40)
              + LT.lampFlicker * 0.15 * Math.sin(tNow * (0.35 + hsh * 0.5) + hsh * 20);
    // LAMP WARM-UP knob scales the strike-to-full duration (def 1 = the 4+hsh*4 s
    // ramp). 0 = instant on (wu pinned to 1, no dip/warmth); higher = a longer,
    // more staggered warm-up. WARM-UP DIP sets how dim the strike starts, WARM-UP
    // WARMTH how orange it glows before settling.
    const warmDur = (4 + hsh * 4) * (LT.lampWarmup != null ? LT.lampWarmup : 1);
    const wu = warmDur > 0 ? Math.min(1, Math.max(0, (tNow - _lampWarmT0) / warmDur)) : 1;
    const dip = LT.lampWarmupDim != null ? LT.lampWarmupDim : 0.30;
    f *= (1 - dip) + dip * wu;
    const cold = (1 - wu) * (LT.lampWarmupWarm != null ? LT.lampWarmupWarm : 1);   // 1 = just struck (dim, sodium-orange), 0 = settled
    _flScr[0] = f * (1 + cold * 0.22);
    _flScr[1] = f * (1 - cold * 0.10);
    _flScr[2] = f * (1 - cold * 0.38);
    return _flScr;
  };
  // Cheap unsorted copy ONLY when every lamp fits with the full 5-slot tail-light
  // reserve to spare. It used to run for any count ≤ 32, which broke two promises
  // downstream: appendCarTailLights evicts overflow from the array TAIL on the
  // assumption the set is sorted farthest-last (it wasn't — on a 29-32-lamp track
  // it could snap off the nearest floods instead), and the CAP reservation was
  // silently ignored. 24+-lamp tracks now take the sorted heap path below.
  if (count + 5 <= CAP) {
    // Copy + scale rgb (time-of-day scale × flicker); geometry params pass through.
    out.length = 0;
    for (let i = 0; i < src.length; i += 15) {
      const f = fl(i);
      out.push(src[i], src[i+1], src[i+2],
        src[i+3] * sr * f[0], src[i+4] * sg * f[1], src[i+5] * sb * f[2], src[i+6],
        src[i+7], src[i+8], src[i+9], src[i+10], src[i+11], src[i+12], src[i+13], src[i+14]);
    }
    frame.lights = out;
    return;
  }
  // Distance-rank: select the nearest CAP. Reuse a pooled object array + the
  // output buffer so a dense night grid doesn't allocate fresh garbage every
  // frame (was the main source of Minor-GC jitter on Vegas/Singapore).
  // Lights BEHIND the camera rank farther: a purely radial nearest-N wastes
  // half the budget on lamps you can't see, ending the lit road in a hard dark
  // boundary ahead. The forward bias (LT.lampBehindBias) pushes that boundary
  // further out — past the night fog wall.
  const fx = fwd ? fwd[0] : 0, fz = fwd ? fwd[2] : 0;
  const flen = Math.hypot(fx, fz) || 1;
  const buf = _lightCullBuf;
  for (let i = 0; i < count; i++) {
    const o = i * 15, dx = src[o] - eye[0], dy = src[o + 1] - eye[1], dz = src[o + 2] - eye[2];
    let d = dx * dx + dy * dy + dz * dz;
    // Behind-camera penalty RAMPED in over ~14° past the camera plane (was a hard
    // sign test ×6.25: the instant a lamp crossed the plane its rank leapt several
    // places in ONE frame, stepping its pool's brightness — and a fast chase-cam
    // yaw flipped the half-space for many lamps at once, a whole-field shudder).
    const b = dx * fx + dz * fz;
    if (b < 0) {
      const dl = Math.sqrt(dx * dx + dz * dz) || 1;
      // BEHIND-CAM BIAS knob scales how hard rearward lamps are pushed down the
      // nearest-N rank (def 5.25 = as-shipped forward push).
      d *= 1 + (LT.lampBehindBias != null ? LT.lampBehindBias : 5.25) * Math.min(1, (-b) / (flen * dl * 0.25));
    }
    const e = buf[i];
    if (e) { e.d = d; e.o = o; } else buf[i] = { d: d, o: o };
  }
  buf.length = count;
  // Partial selection: keep only the nearest CAP in a max-heap instead of sorting
  // all ~count entries every frame (O(count·log CAP) vs O(count·log count)).
  const heap = _lightHeap; heap.length = 0;
  for (let i = 0; i < count; i++) {
    const e = buf[i];
    if (heap.length < CAP) {
      let ci = heap.length; heap.push(e);
      while (ci > 0) { const pi = (ci - 1) >> 1; if (heap[pi].d < heap[ci].d) { const t = heap[pi]; heap[pi] = heap[ci]; heap[ci] = t; ci = pi; } else break; }
    } else if (e.d < heap[0].d) {
      heap[0] = e;
      let pi = 0;
      for (;;) { const l = pi * 2 + 1, rr = l + 1; let lg = pi; if (l < CAP && heap[l].d > heap[lg].d) lg = l; if (rr < CAP && heap[rr].d > heap[lg].d) lg = rr; if (lg === pi) break; const t = heap[pi]; heap[pi] = heap[lg]; heap[lg] = t; pi = lg; }
    }
  }
  // Sort just those 32 ascending so the tail fade eases the farthest of the set.
  heap.sort((a, b) => a.d - b.d);
  // DISTANCE-based tail fade (was rank-quantised in 1/6 steps: a lamp entered the
  // set at an instant 16.7% and its brightness stepped by 16.7% every rank churn —
  // visible stepping as the set shifted at speed). Fading by closeness to the set
  // boundary is continuous: 0 exactly at the boundary, full by ~35% inside it, so
  // membership changes are invisible.
  const dEdge = heap[heap.length - 1].d || 1;
  // The boundary fade only makes sense when lamps were actually culled — if the
  // whole baked set fit inside CAP (the 24-32-lamp tracks that now take this
  // path for its sorting), there is no set boundary, and fading "the farthest
  // of the set" would black out a real lamp that used to be lit.
  const truncated = count > CAP;
  const _cullBand = dEdge * (LT.lampCullFade != null ? LT.lampCullFade : 0.35);   // LAMP CULL FADE knob
  out.length = 0;
  for (let i = 0; i < heap.length; i++) {
    const e = heap[i], o = e.o;
    const cullF = truncated ? Math.max(0, Math.min(1, (dEdge - e.d) / _cullBand)) : 1;
    const f = fl(o);
    out.push(src[o], src[o+1], src[o+2],
      src[o+3] * sr * f[0] * cullF, src[o+4] * sg * f[1] * cullF, src[o+5] * sb * f[2] * cullF,
      src[o+6], src[o+7], src[o+8], src[o+9], src[o+10], src[o+11], src[o+12], src[o+13],
      // glareW fades with the cull too: drawGlow normalises the lamp colour, so a
      // colour-only fade barely dims the halo — it blinked off at ~full brightness
      // when the lamp left the set.
      src[o+14] * cullF);
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
// Cockpit eye offsets from the car origin (fwd along tangent, up in metres).
// Shared by camVantage() and the camera-anchored cockpit-rig draw in render() —
// the rig origin is derived by SUBTRACTING these from the live camEye, so the
// two must stay identical or the driver's eye drifts out of the cockpit.
const COCKPIT_EYE_FWD = 0.32, COCKPIT_EYE_UP = 0.99;
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
  // Street-circuit camera corridor: city tracks run a continuous building wall a
  // few metres past the barriers, and the wide broadcast offsets (15-25 m) put
  // the eye INSIDE the towers — the whole view fills with a glowing facade
  // interior. The verge strip just outside the barriers is no better: it's where
  // the trees and lamp masts stand, so a camera there stares into foliage.
  // Instead, on street tracks the broadcast cams stay over the ROAD EDGE itself
  // (furniture is never on the tarmac) and trade the lost width for extra
  // height — a crane-over-the-circuit shot. Open circuits keep the full framing.
  const corr = track.def && track.def.street ? Math.max(cvA.hw - 1.0, 4) : Infinity;
  let eye, tgt, fov;
  if (mode === "cockpit" || mode === "hood") {
    // COCKPIT: at the DRIVER's eye — the helmet dome sits at z -0.08 with its
    // top at ~0.73 m, so the eye rides just above it (0.98) and fractionally
    // behind the car origin, instead of floating 1.15 m up over the monocoque
    // ahead of the driver. Low + at the seat = the authentic "barely see over
    // the nose" F1 sensation, and the ground genuinely rushes.
    // HOOD: pulled back onto the chassis spine just ahead of the cockpit (was
    // 1.9 m out — past most of the bodywork, so no car was in frame). From
    // 0.85 m the nose and front wing read at the bottom of the frame, which
    // is what makes it a hood cam rather than a floating drone.
    // Cockpit eye: pulled back to z -0.18 (still IN FRONT of the airbox front
    // at z -0.28, so the roll hoop / rear structure never wraps into frame —
    // that was the "seeing the tail" bug) and raised to 1.06 m, so the forward
    // wheels sit further ahead and the view looks down over them enough to see
    // where they meet the track.
    // Cockpit eyeFwd nudged from 0.02 (almost co-located with the shoulder
    // fairing's tallest point at z 0.12) to 0.32 — fully past the fairing, so
    // it recedes into the periphery like a real onboard instead of looming
    // right next to the camera. The wheel/dash rig moves forward WITH the eye
    // (_rigT z 0.71, keeping the proven 0.39 m eye-to-wheel gap and clearing
    // the 0.1 near-clip plane that swallowed the wheel at the old z 0.41).
    // Value lives in COCKPIT_EYE_FWD/UP — shared with the camera-anchored
    // cockpit-rig draw, which derives the rig origin from the live camEye
    // minus these offsets.
    const eyeFwd = mode === "cockpit" ? COCKPIT_EYE_FWD : 0.55;
    const eyeUp  = mode === "cockpit" ? COCKPIT_EYE_UP : 0.95;
    eye = [p[0] + t[0] * eyeFwd, p[1] + eyeUp, p[2] + t[2] * eyeFwd];
    if (mode === "cockpit") {
      // Face straight FORWARD down the car's own heading (the tangent at the
      // car, not the curved centreline ahead) — the driver looks where the
      // NOSE points, so the view doesn't swing toward the apex on corner
      // entry. A tiny fraction of the curved look-ahead is kept so it still
      // gently leads into a bend rather than staring rigidly at a fixed point.
      // Look height at eye level (tilt slightly DOWN vs the old +0.4) so the
      // raised hood / nose deck ahead fills the lower-centre of the frame,
      // while the horizon still sits high enough to read the track ahead.
      const straight = [p[0] + t[0] * 30, p[1] + eyeUp - 0.15, p[2] + t[2] * 30];
      const lead = aheadPt(30, eyeUp - 0.15, x * 0.4);
      tgt = [straight[0] * 0.85 + lead[0] * 0.15,
             straight[1] * 0.85 + lead[1] * 0.15,
             straight[2] * 0.85 + lead[2] * 0.15];
    } else {
      tgt = aheadPt(30, eyeUp + 1.2, x * 0.6);
    }
    fov = lerp(64, 78, spN) + dep * 3;               // wider = faster feel
  } else if (mode === "overhead") {
    eye = [p[0] - t[0] * 9, p[1] + 42, p[2] - t[2] * 9];
    tgt = [p[0] + t[0] * 12, p[1], p[2] + t[2] * 12];
    fov = 46;
  } else if (mode === "heli") {
    // Broadcast helicopter — now corner-aware: hovers on the OUTSIDE of the
    // upcoming bend so it looks across the apex (was always camera-right).
    Tracks.sample(track, wrapS(s - 26), cvB);
    const sgn = kA > 0.001 ? -1 : kA < -0.001 ? 1 : 1;
    const hl = Math.min(18, corr);              // stay inside the street canyon
    eye = [cvB.p[0] + cvB.r[0] * hl * sgn, cvB.p[1] + 21 + (18 - hl) * 0.6 + bankDy, cvB.p[2] + cvB.r[2] * hl * sgn];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = 36 + dep * 2;
  } else if (mode === "reverse") {
    eye = [p[0] + t[0] * 5.5, p[1] + 1.35, p[2] + t[2] * 5.5];
    tgt = [p[0] - t[0] * 26, p[1] + 0.9, p[2] - t[2] * 26];
    fov = lerp(60, 72, spN);
  } else if (mode === "side") {
    // TV trackside: sits on the OUTSIDE of the bend looking across the apex.
    const sgn = kA > 0.002 ? 1 : kA < -0.002 ? -1 : 1;
    const sl = Math.min(25, corr);              // stay inside the street canyon
    eye = [p[0] + r[0] * sgn * sl, p[1] + 5.5 + (25 - sl) * 0.30, p[2] + r[2] * sgn * sl];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = 44 + (25 - sl) * 0.5;                 // closer eye → widen so framing holds
  } else if (mode === "cinematic") {
    // Outside-of-corner cinematic that gently breathes its angle instead of doing
    // full disorienting loops. Auto-picks the outside of the bend; on a straight it
    // slowly drifts a three-quarter angle. Angle is measured around the car from
    // the track tangent, so the framing reads consistently corner to corner.
    const base = kA === 0 ? 0.6 : (kA > 0 ? -1 : 1) * 1.15;
    const a = base + Math.sin(now * 0.00022) * 0.5;
    // Cap the WHOLE orbit radius at the street-canyon corridor — capping only
    // the lateral (|sin a|·od) component left the TANGENT-axis reach unbounded:
    // whenever the breathing angle drifted near a multiple where sin(a) was
    // small, od grew toward its 15 m ceiling almost entirely along the tangent
    // axis, which the corridor was never designed to constrain. On a tight,
    // twisty street circuit (Monaco, Madrid) that reach was enough to put the
    // eye geometrically INSIDE a building's solid wall — its near face then
    // culls as backfacing (you're now behind it) while the far interior face
    // doesn't, reading as "the wall is translucent, windows fine." Since
    // |cos a|,|sin a| ≤ 1, capping od itself bounds BOTH axes by the corridor.
    const od = Math.min(15, corr);
    const dir = [Math.cos(a) * t[0] + Math.sin(a) * r[0], 0, Math.cos(a) * t[2] + Math.sin(a) * r[2]];
    eye = [p[0] + dir[0] * od, p[1] + 6.5 + (15 - od) * 0.45, p[2] + dir[2] * od];
    tgt = [p[0], p[1] + 0.8, p[2]];
    fov = lerp(50, 60, spN);
  } else if (mode === "low") {
    Tracks.sample(track, wrapS(s - 10), cvB);
    const cx = x * 0.3;
    eye = [cvB.p[0] + cvB.r[0] * cx, cvB.p[1] + 0.45 + bankDy, cvB.p[2] + cvB.r[2] * cx];
    tgt = [p[0], p[1] + 0.6, p[2]];
    fov = lerp(55, 68, spN);
  } else if (mode === "tcam") {
    // Broadcast T-cam: perched on the T-bar above/behind the driver, tilted
    // DOWN enough that the helmet, airbox and nose fill the lower frame — the
    // signature F1 onboard. (The old mount looked level 25 m ahead, so none of
    // the car was in frame and it read as a floating drone.)
    eye = [p[0] - t[0] * 0.52, p[1] + 1.46, p[2] - t[2] * 0.52];
    tgt = aheadPt(20, 0.35, x * 0.5);
    fov = 46 + dep * 2;
  } else if (mode === "rear") {
    // Onboard rear-view, remounted: the old eye (0.5 m back at 0.85 up) sat
    // INSIDE the engine cover with the rear wing (elements 0.8-1.1 m at
    // z -2.3..-2.6) filling the whole lens. Now perched above the airbox
    // looking back OVER the wing — wing at the bottom of frame, the road and
    // the chasing pack actually visible.
    eye = [p[0] - t[0] * 0.95, p[1] + 1.38, p[2] - t[2] * 0.95];
    tgt = [p[0] - t[0] * 26, p[1] + 0.7, p[2] - t[2] * 26];
    fov = lerp(58, 70, spN) + dep * 2;
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

// ---------- car-setup live preview ----------
// A standalone, non-track, non-player render path for the #carsetup screen:
// openSetup() has no `player`/`cars` yet (makeCars() only runs at race-start),
// so the studio() rig (buildStudioRig, above) can't be reused — it hard-depends
// on player.px/track. This is the same ring-of-lamps energy math, anchored at
// the world origin instead of the player's track position.
let setupPreviewOn = false, setupPreviewAz = 0.6;
const _spLights = [];
function buildSetupPreviewLights() {
  _spLights.length = 0;
  const n = 6, dist = 6, h = 3.2, intensity = 1.6, radius = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lx = Math.cos(a) * dist, lz = Math.sin(a) * dist, ly = h;
    let ax = -lx, ay = 0.5 - ly, az = -lz;
    const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
    const e = intensity * 0.55;   // same physical energy factor as track lamps
    _spLights.push(lx, ly, lz, e, e, e, radius, ax, ay, az, 0.88, 0.60, 0.12, 0, 1);
  }
  const ek = intensity * 0.55 * 1.4;   // overhead key: straight-down softbox
  _spLights.push(0, h + 2.5, 0, ek, ek, ek, radius, 0, -1, 0, 0.80, 0.45, 0.15, 0, 1);
  return _spLights;
}
// Rebuild-on-change only (not per-frame): keyed by team + resolved parts tiers,
// mirroring the playerBodyMesh/cockpitBodyMesh cache-key pattern. gfx.freeMesh
// releases the previous mesh's GL buffers so repeated chip clicks don't leak.
let _spMesh = null, _spMeshKey = "";
function getSetupPreviewMesh() {
  const team = Teams.LIST[teamIdx];
  const key = team.id + ":" + partsVisualKey(team.id);
  if (key !== _spMeshKey) {
    if (_spMesh) gfx.freeMesh(_spMesh);
    const liv = resolveLivery(team);
    _spMesh = gfx.createMesh(Car3D.build(liv.c1, liv.c2, {
      livery: liv,
      num: team.drivers && team.drivers[0] && team.drivers[0].num,
      parts: Parts.getVisualTiers(getTeamParts(team.id), team.engine),
    }));
    _spMeshKey = key;
  }
  return _spMesh;
}
const _spProj = new Float32Array(16), _spView = new Float32Array(16), _spVP = new Float32Array(16);
function renderSetupPreview(dt) {
  gfx.resize();
  setupPreviewAz += dt * 0.35;   // slow turntable
  // Pulled back + a touch wider than a "hero shot" distance so the whole
  // ~5.4 m car (nose to rear wing) clears the frustum at any turntable angle.
  const eye = [Math.sin(setupPreviewAz) * 8.5, 2.0, Math.cos(setupPreviewAz) * 8.5 - 1.0];
  M4.perspectiveTo(_spProj, 36 * Math.PI / 180, gfx.aspect, 0.1, 60);
  // The docked #cs-inner panel covers the right portion of the canvas — an
  // on-axis camera centers the car behind it, half-cropped. Shift the
  // frustum horizontally (off-axis / "lens shift") so the car renders
  // centered in the VISIBLE left region instead. Read the panel's live
  // pixel width so this tracks every breakpoint/viewport automatically.
  const canvasEl = $("game"), panelEl = $("cs-inner");
  if (canvasEl && panelEl && canvasEl.clientWidth > 0) {
    const panelFrac = clamp(panelEl.getBoundingClientRect().width / canvasEl.clientWidth, 0, 0.85);
    _spProj[8] = panelFrac;   // see mat4 perspectiveTo layout: col2 row0 shifts NDC.x
  }
  M4.lookAtTo(_spView, eye, [0, 0.35, 0], [0, 1, 0]);
  M4.mulTo(_spVP, _spProj, _spView);
  gfx.begin({
    viewProj: _spVP, eye, sunDir: [0.4, 0.8, 0.3], sunColor: [1, 1, 1],
    ambientSky: [0.28, 0.30, 0.34], ambientGround: [0.18, 0.17, 0.16],
    fogColor: [0.05, 0.05, 0.07], fogDensity: 0, lights: buildSetupPreviewLights(),
    noEnv: true,   // probe-less preview: matte paint, never mirror a stale race cube
  });
  const spMat = carPaintMat(PAINT_DRY_DAY);
  spMat.sparkle = 0.12;   // near-kill the metallic-flake glitter so the slow turntable doesn't "twinkle"
  // Menu car reads as team livery, not the in-race chrome mirror. The frame's
  // noEnv flag (above) drops the probe-less env term to a gentle sheen even
  // when a stale race cube lingers (per-draw material opts carry no env knob).
  // The wheels are baked into this single mesh (Car3D.build) and drawn with the
  // SAME paint material — the env/clearcoat sheen reads as an ugly grey gloss on
  // the near-black tyres. Kill clearcoat entirely (no reflective lacquer coat in
  // the menu preview) and drop specular so the rubber goes matte; the bodywork
  // still reads as painted via its base colour + the reduced specular.
  spMat.clearcoat = 0; spMat.specular = 0.35;
  // clearcoat isn't the only reflection source: the lit shader has a SEPARATE
  // analytic sky-mirror gated purely by roughness (glx.js envBlend, active
  // below ~0.40) — PAINT_DRY_DAY's 0.22 sails right through it regardless of
  // clearcoat/carEnvCube, which is what kept reading as a residual sheen. Push
  // roughness past that cutoff so this preview has NO reflection source at all.
  spMat.roughness = 0.55;
  gfx.draw(getSetupPreviewMesh(), MAT_REFLECT_X, spMat);
  drawCarDecals(Teams.LIST[teamIdx], MAT_REFLECT_X, false, carDecalNum(Teams.LIST[teamIdx], null));
  gfx.present();
}

// Static world draws (floor → terrain → road → startline → [lamp glow] → props
// → glass → water → gate), shared verbatim by the MAIN camera pass and the
// live env-probe faces (which re-render the world around the player car so the
// paint mirrors the real surroundings). Cars/skids/rain are main-pass only.
let _envFace = -1;   // probe face cursor: one of the 6 cube faces per frame
let _frameNo = 0;    // render frame counter (env-probe cadence, etc.)
// Set by GLX's webglcontextlost handler (persisted) — once a device has lost the
// context we skip the extra per-frame env-probe pass on every subsequent load so
// the reflection feature can't keep exhausting a memory-constrained GPU.
let _envProbeOff = false;
try { _envProbeOff = localStorage.getItem("apex26.envProbeOff") === "1"; } catch (_) {}
// Hoisted material-option objects for drawWorldMeshes — the function runs up to
// 2×/frame (main pass + env probe) and previously allocated ~9 literals each call.
// Pure night/wet variants are constants; the few with live-tunable fields (detail
// from LT.surfDetail, roughness from LT.roadRough, emissive from floodEmit) are
// per-variant reused objects mutated in place each call (never a stale key).
const _wmFloorN = { emissive: 0.14, roughness: 0.98, specular: 0.05 };
const _wmFloorD = { roughness: 0.98, specular: 0.05 };
const _wmTerrainN = { emissive: 0.18, roughness: 0.97, specular: 0.06, detail: 0 };
const _wmTerrainD = { roughness: 0.97, specular: 0.06, detail: 0 };
const _wmRoadWetN = { emissive: 0.06, roughness: 0.14, specular: 0.85, detail: 0 };
const _wmRoadWetD = { roughness: 0.14, specular: 0.85, detail: 0 };
const _wmRoadDryN = { emissive: 0.09, roughness: 0, specular: 0.20, detail: 0 };
const _wmRoadDryD = { roughness: 0, specular: 0.20, detail: 0 };
const _wmStartWet = { roughness: 0.16, specular: 0.80, detail: 0 };
const _wmStartN = { emissive: 0.10, roughness: 0.80, specular: 0.22, detail: 0 };
const _wmStartD = { roughness: 0.80, specular: 0.22, detail: 0 };
const _wmPropsWetN = { emissive: 0, roughness: 0.55, specular: 0.38 };
const _wmPropsWetD = { roughness: 0.55, specular: 0.38 };
const _wmPropsDryN = { emissive: 0, roughness: 0.85, specular: 0.20 };
const _wmPropsDryD = { roughness: 0.85, specular: 0.20 };
const _wmGlass = { roughness: 0.13, specular: 0.82, metalness: 0.12, clearcoat: 1.0 };
const _wmWaterWet = { roughness: 0.16, specular: 0.85, metalness: 0.05 };
const _wmWaterDry = { roughness: 0.10, specular: 0.92, metalness: 0.05 };
const _wmGateWet = { roughness: 0.32, metalness: 0.35, specular: 0.65 };
const _wmGateDry = { roughness: 0.45, metalness: 0.30, specular: 0.50 };
function drawWorldMeshes(frame, night, wet, floodEmit, withGlow) {
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
    gfx.draw(track.meshes.terrain, MAT_IDENT, m);
  }
  if (!hideMeshes.road) {
    let m;
    if (wet) { m = night ? _wmRoadWetN : _wmRoadWetD; m.detail = 0.06 * _sd; }
    else { m = night ? _wmRoadDryN : _wmRoadDryD; m.detail = 0.22 * _sd; m.roughness = clamp(0.85 * _rr, 0.04, 1); }
    gfx.draw(track.meshes.road, MAT_IDENT, m);
  }
  if (!hideMeshes.startline && track.meshes.startline) gfx.draw(track.meshes.startline, MAT_IDENT,
    wet ? _wmStartWet : (night ? _wmStartN : _wmStartD));
  // Per-lamp lens CORONAS: soft additive billboards at every active lamp — each
  // light gets a visible halo (colored per lamp) without inflating bloom.
  // (Skipped for the studio rig — its lamps have no fixtures, and floating
  // glow-cone billboards ringing the car read as artifacts. Skipped in the env
  // probe too: 64px additive halos just smear the reflection.)
  if (withGlow && frame.lights && !_studioRig) gfx.drawGlow(frame.lights, LT.glareStr);
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
    gfx.drawChunked(track.meshes.props, MAT_IDENT, m);
  }
  // Building glass: a low-roughness reflective pass so the lit shader mirrors the
  // sky in the windows (real, view-dependent reflection). Only populated for day
  // builds; empty at night (lit windows live in the emissive props mesh).
  if (!hideMeshes.props && track.meshes.glass) gfx.draw(track.meshes.glass, MAT_IDENT, _wmGlass);
  // Water (lakes/marina/sea): low roughness so the lit shader's env term mirrors
  // the live sky + sun glint — reflective by day, warm at dusk, dark by night.
  // A touch glossier (calmer) when not raining; a little rougher in the wet.
  if (!hideMeshes.props && track.meshes.water) gfx.draw(track.meshes.water, MAT_IDENT,
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
// ── Exhaust heat haze (composite post) ───────────────────────────────────────
// The player-car draw loop records the tailpipe's world position + plume
// strength; render() projects it to screen UV just before present() and hands
// {u, v, str} to the composite pass, which UV-warps a small rising region
// (COMPOSITE_FS uHaze*). Off on memory-limited phones (mobileTier).
const _hazeWorld = [0, 0, 0];
let _hazeStr = 0;
const _hazeOpts = { u: 0, v: 0, str: 0 };
function render(dt) {
  if (headlessMode) return;
  if (setupPreviewOn) { renderSetupPreview(dt); return; }
  gfx.resize();
  if (!track) { gfx.begin({ viewProj: M4.ident(), eye: [0,0,0], sunDir: [0,1,0], sunColor: [1,1,1], ambientGround: [0.2,0.2,0.2], ambientSky: [0.4,0.4,0.5], fogColor: [0.04,0.04,0.06], fogDensity: 0.002 }); gfx.present(); return; }
  _frameNo++;

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
    // Onboard speed vibration: a subtle high-frequency buzz on the rigid-mounted
    // cams (cockpit/hood/tcam) that grows with speed² — the visceral
    // "the car is alive under you" cue every onboard broadcast has. Two mixed
    // sine bands (not random) so it reads as vibration, not noise; tiny target
    // jitter so the whole frame trembles slightly rather than swimming.
    if (state === "race" && (mode === "cockpit" || mode === "hood" || mode === "tcam")) {
      const spV = clamp(player.speed / VMAX, 0, 1);
      const vAmp = spV * spV * 0.022 + (player.deploying ? 0.008 : 0);
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
  const onboard = racing && (camId === "cockpit" || camId === "hood" || camId === "tcam");
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
  const lE = onboard ? 400 : (racing ? 14 : 1.6) * cutEase;
  const gentleHead = onboard && (camId === "cockpit" || camId === "hood");
  const lT = gentleHead ? 7 : onboard ? 400 : (racing ? 16 : 10) * cutEase;
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
    const fovYCap = 2 * Math.atan(Math.tan(HFOV_MAX / 2) / Math.max(gfx.aspect, 0.0001));
    fovY = Math.min(fovY, fovYCap);
  }

  // Near plane 0.3 (was 0.2): pushing the near distance out sharpens depth-buffer
  // precision across the scene — the biggest single lever against z-fighting /
  // shadow flicker. Capped at 0.3 (not higher): the cockpit rig keeps the wheel /
  // dash fascia a proven 0.39 m from the eye (COCKPIT_EYE_FWD + _rigT), so 0.3
  // still clears it with ~9 cm to spare while raising the far/near precision
  // floor ~1.5x vs 0.2.
  M4.perspectiveTo(_mProj, fovY, gfx.aspect, 0.3, farPlane);
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
  M4.invertTo(_mInvProj, _mProj);   // for view-space reconstruction in SSAO
  M4.invertTo(_mInvVP, _mVP);       // for world-space reconstruction in god-rays
  // Sun direction in VIEW space (for screen-space contact shadows): mat3(view)·sunDir.
  {
    const sd = frame.sunDir || [0, 1, 0];
    let x = _mView[0]*sd[0] + _mView[4]*sd[1] + _mView[8]*sd[2];
    let y = _mView[1]*sd[0] + _mView[5]*sd[1] + _mView[9]*sd[2];
    let z = _mView[2]*sd[0] + _mView[6]*sd[1] + _mView[10]*sd[2];
    const l = Math.hypot(x, y, z) || 1;
    _sunVS[0] = x/l; _sunVS[1] = y/l; _sunVS[2] = z/l;
  }
  // World-up (0,1,0) in VIEW space: the second column of mat3(view). Used by the
  // wet-road screen-space reflection to pick out up-facing road pixels.
  {
    const l = Math.hypot(_mView[4], _mView[5], _mView[6]) || 1;
    _upVS[0] = _mView[4]/l; _upVS[1] = _mView[5]/l; _upVS[2] = _mView[6]/l;
  }
  frame.viewProj = _mVP;
  frame.proj = _mProj;
  frame.invProj = _mInvProj;
  frame.invViewProj = _mInvVP;
  frame.sunViewDir = _sunVS;
  frame.upViewDir = _upVS;
  frame.eye = camEye;
  // Mobile free-cam draw-distance cap: the far plane is the chunked scenery's ONLY
  // distance cull, so an altitude/wide vantage with the pushed-out photo-mode far
  // plane can frame an entire street circuit's ~5 M-vert city in one frame and
  // jetsam-kill the tab. Cap the RADIAL draw distance on mobile (fog hides the
  // edge) so the chunk count stays bounded no matter how high or wide the free
  // camera flies. 0 = disabled (normal play + desktop keep the full vista).
  frame.cullDist = (dbgCam && gfx.isMobile) ? 700 : 0;

  // Clear-night moon factor for cast shadows (0..1): 1 under a bright clear
  // moon, fading out as cloud rolls in or the road gets wet, forced 0 in fog.
  // glx.js floors its key-dim shadow fade with LT.moonShadow * frame.moonK, so
  // moonlight casts soft shadows on clear nights only — fog/overcast/rain
  // nights stay shadowless. Computed BEFORE the shadow pass because the prop
  // and car caster gates below feed the snap-cached map from it. Mirrors the
  // frameSky.moon / frame.cloud plumbing further down (values persist across
  // frames, so first-frame staleness only delays the gate by one recentre).
  {
    const _mAmt = (raceTimeOfDay === "default" && track && track.def && track.def.night)
      ? 0.85 * LT.moonBright : (frameSky.moon || 0);
    const _mCl = frameSky.cloud !== undefined ? frameSky.cloud : _cloudBase;
    let _cf = (_mCl - 0.35) / 0.25;                    // smoothstep(0.35, 0.6, cloud)
    _cf = _cf < 0 ? 0 : _cf > 1 ? 1 : _cf;
    _cf = _cf * _cf * (3 - 2 * _cf);
    frame.moonK = raceWeather === "fog" ? 0
      : clamp(_mAmt / 0.85, 0, 1) * (1 - _cf) * (1 - clamp((frame.wetness || 0) * 2, 0, 1));
  }

  // Shadow pass — render terrain + road from sun's perspective.
  // Snap the frustum centre on the LIGHT's right/up axes to a step of sBox/4
  // (20 m at the default 80 m box) so the map only re-renders when the camera
  // moves a cell — and so each recentre shifts the box by an exact whole number
  // of shadow texels (sBox/4 is SHADOW_SIZE/8 texels for any pow-2 map size).
  // The old snap was on a world-XZ grid with an unsnapped camera HEIGHT: those
  // axes don't match the sun-rotated texel grid, so every recentre re-rasterised
  // all shadow edges at a new sub-texel phase — a visible shimmer/jump of every
  // shadow edge each 16 m of driving.
  if (track) {
    const sd = frame.sunDir;
    const up = Math.abs(sd[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
    // Light basis exactly as lookAtTo derives it: z = sd, x = norm(up×z), y = z×x.
    const zx = sd[0], zy = sd[1], zz = sd[2];
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    // SHADOW DISTANCE knob: re-render the map when the box size changes too (not
    // only on the position snap), so the slider responds without driving.
    const sBox = LT.shadowRange || 64;
    const step = sBox / 4;
    // Forward-biased CAMERA anchor, not the raw player position: the box budget
    // goes where you look. Centred on the car, up to sBox/8 of snap slack plus
    // the ~10 m chase-cam offset sat BEHIND the camera, so the shader's fade had
    // to dissolve shadows by 0.72·range (≈46 m at the default 64) to stay inside
    // the worst-case border — the "shadow horizon" ~46 m ahead. Anchoring at
    // camera + a forward bias makes the safe radius symmetric around the view
    // (0.875·sBox from the anchor), letting the fade reach ~0.84·range — shadows
    // hold ~74 m ahead of the camera at the same texel density. Height comes from
    // the LOOK TARGET (subject/ground level — right for chase, cockpit, TV and
    // orbit/aerial debug cams alike), NOT the camera eye: fading by eye distance
    // erased ALL shadows from any high/aerial camera (vDist ≥ altitude).
    let fbx = camTgt[0] - camEye[0], fbz = camTgt[2] - camEye[2];
    const fbl = Math.hypot(fbx, fbz), fBias = Math.min(20, sBox * 0.3);
    if (fbl > 1e-6) { fbx = fbx / fbl * fBias; fbz = fbz / fbl * fBias; } else { fbx = 0; fbz = 0; }
    _shadowCtr[0] = camEye[0] + fbx; _shadowCtr[1] = camTgt[1]; _shadowCtr[2] = camEye[2] + fbz;
    frame.shadowCtr = _shadowCtr;
    const cx = _shadowCtr[0], cy = _shadowCtr[1], cz = _shadowCtr[2];
    const lu = Math.round((xx * cx + xy * cy + xz * cz) / step) * step;
    const lv = Math.round((yx * cx + yy * cy + yz * cz) / step) * step;
    // Sun direction is part of the gate: a sunDir change (SUN ELEVATION/AZIMUTH
    // sliders, a time-of-day flip) previously left the map STALE until the next
    // cell crossing — shadows looked dead while dragging, then all jumped at once.
    if (lu !== _shadowSnapX || lv !== _shadowSnapZ || sBox !== _shadowBox ||
        sd[0] !== _shadowSunX || sd[1] !== _shadowSunY || sd[2] !== _shadowSunZ) {
      _shadowSnapX = lu; _shadowSnapZ = lv; _shadowBox = sBox;
      _shadowSunX = sd[0]; _shadowSunY = sd[1]; _shadowSunZ = sd[2];
      // Rebuild the snapped centre in world space. The along-sun component needs
      // no snap — it only shifts depth values, which the bias absorbs.
      const lw = zx * cx + zy * cy + zz * cz;
      const wx = xx * lu + yx * lv + zx * lw;
      const wy = xy * lu + yy * lv + zy * lw;
      const wz = xz * lu + yz * lv + zz * lw;
      M4.lookAtTo(_mLView, [wx + sd[0] * 150, wy + sd[1] * 150, wz + sd[2] * 150], [wx, wy, wz], up);
      // Half-size box (default ±80 m / 160 m) snapped around the anchor;
      // sampleShadow fades shadows out by ANCHOR distance (uShadowCtr) well
      // inside its border. Bigger = more reach, smaller = crisper contacts
      // (texel density = 2048/box).
      M4.orthoTo(_mLProj, -sBox, sBox, -sBox, sBox, 1.0, 320);
      M4.mulTo(_mLVP, _mLProj, _mLView);
      gfx.shadowBegin(_mLVP);
      gfx.castShadow(track.meshes.terrain, MAT_IDENT);
      gfx.castShadow(track.meshes.road, MAT_IDENT);
      // Perf: skip casting the (heavy, up to ~5 M-vert) props/city into the shadow
      // map at NIGHT — directional sun shadows are invisible under the dim
      // moonlight, so this is the biggest night saving. Gate on the KEY's actual
      // BRIGHTNESS, not sunDir.y: the night moon-key is deliberately held high
      // (sunDir.y ≈ 0.97) to drive the sky glow, so an elevation test never fired
      // at night and the whole city rasterised into the shadow map every recentre.
      // Cutoff 0.28 = the BOTTOM of the renderer's key-luminance strength fade
      // (uShadowStr ramps over key 0.28→0.42): props only leave the map once the
      // whole shadow pass has faded to zero strength. The old 0.35 cutoff sat in
      // the MIDDLE of that band, so prop shadows popped out at ~50% strength on
      // a dusk→night flip / SUN ELEVATION drag while terrain shadows lingered.
      const _shKey = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
      // Clear-night moon shadows re-open the gate: props must be in the map for
      // the moonlight floor to have anything to cast (snap-cached, so the night
      // saving only goes when MOON SHADOWS is active and the sky is clear).
      if (_shKey > 0.28 || (LT.moonShadow > 0 && (frame.moonK || 0) > 0.01)) gfx.castShadowChunked(track.meshes.props, MAT_IDENT);
      gfx.shadowEnd();
    }
    // Dynamic CAR shadow pass — every frame (cars move, so they can't live in
    // the snap-cached static map above; that's why cars only had blob shadows).
    // Casts LAST frame's pooled car matrices (_shadowMats/_shadowTeams fill
    // during the car draw loop later this frame): a one-frame lag, ≤1.3 m at
    // top speed, on a shadow that moves with its caster — invisible. ±42 m box
    // on the same gliding anchor (a car shadow beyond that is sub-pixel), same
    // depth program and key-luminance gate as the props above. Guards: WGX has
    // no carShadowBegin yet (blob-only there); menu/select skip (the car loop
    // doesn't run, so the pooled matrices would be stale race positions).
    if (gfx.carShadowBegin && LT.carShadow && _shadowCount > 0 && player &&
        state !== "menu" && state !== "select") {
      const _ck = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
      // Same clear-night MOON SHADOWS relaxation as the prop gate above: with
      // the moonlight floor active (game.js frame.moonK), cars keep casting so
      // they throw faint moon shadows too instead of popping to blob-only.
      if (_ck > 0.28 || (LT.moonShadow > 0 && (frame.moonK || 0) > 0.01)) {
        M4.lookAtTo(_mCView,
          [_shadowCtr[0] + sd[0] * 150, _shadowCtr[1] + sd[1] * 150, _shadowCtr[2] + sd[2] * 150],
          _shadowCtr, up);
        M4.orthoTo(_mCProj, -42, 42, -42, 42, 1.0, 320);
        M4.mulTo(_mCVP, _mCProj, _mCView);
        gfx.carShadowBegin(_mCVP);
        for (let i = 0; i < _shadowCount; i++) gfx.castShadow(teamMesh(_shadowTeams[i]), _shadowMats[i]);
        gfx.carShadowEnd();
      }
    }
  }

  // ── Sky animation & weather FX ──────────────────────────────────────────
  // Advance the render clock regardless of physics freeze so the sky always
  // animates (cloud drift, star twinkle).
  _skyT += dt;
  frameSky.time = _skyT;
  // STAR BRIGHTNESS / CLOUD SPEED tuner knobs ride on the sky object.
  frameSky.starBright = LT.starBright;
  frameSky.cloudSpeed = LT.cloudSpeed;
  // SKY GRADIENT / STAR DENSITY / DAY SKY BLUE knobs also ride the sky object.
  frameSky.skyGrad     = LT.skyGrad;
  frameSky.starDensity = LT.starDensity;
  frameSky.daySkyBlue  = LT.daySkyBlue;
  // Feed the same clock + cloud cover to the lit shader for drifting cloud shadows.
  frame.time = _skyT;
  frame.cloud = frameSky.cloud !== undefined ? frameSky.cloud : _cloudBase;
  // Same cloud-speed knob the SKY uses, so the ground cloud-shadow dapple + the
  // godray shafts freeze/slow in lockstep with the visible sky (0 = frozen sky).
  frame.cloudSpeed = LT.cloudSpeed;
  // Wet-road material (rain): ramp wetness in/out smoothly so the surface
  // darkens and starts mirroring lamps/sky over ~1s rather than popping.
  if (LT.wetness >= 0) {
    // Tuner override: pin the road wetness directly (skips the auto ramp, which
    // saturates a few seconds after a weather flip — rate 0.8/s below).
    frame.wetness = LT.wetness;
  } else {
    const wetTarget = isWetRoad() ? 1.0 : 0.0;
    const cur = frame.wetness || 0;
    frame.wetness = cur + (wetTarget - cur) * Math.min(1, dt * 0.8);
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
      _thunderT = 0.3 + Math.random() * 1.7;
    }
    if (_thunderT >= 0) {
      _thunderT -= dt;
      if (_thunderT < 0 && typeof GameAudio !== "undefined" && GameAudio.thunder) {
        GameAudio.thunder(clamp(1.0 - (_thunderT + dt) / 2.0, 0.15, 1.0));
      }
    }
    if (_ltFlash > 0.001) {
      // Decay: fast leading edge, then slow dying glow
      _ltFlash *= Math.exp(-8 * dt);
      if (_ltFlash < 0.001) _ltFlash = 0;
    }
    if (_ltFlash > 0) {
      // Spike ambient to a cool blue-white; the decay reads as a natural flash.
      // A brief exposure lift too, so the whole frame bleaches for the strike.
      // Written IN PLACE (no per-frame array allocation — this ran every rain
      // frame, exactly when the frame is already heaviest).
      const f = _ltFlash, aS = frame.ambientSky, aG = frame.ambientGround;
      for (let i = 0; i < 3; i++) {
        aS[i] = Math.min(1, _ltBase.ambientSky[i] + 0.55 * f);
        aG[i] = Math.min(1, _ltBase.ambientGround[i] + 0.40 * f);
      }
      // SET from the saved base (was `+=`: it accumulated every frame of the
      // ~0.9 s flash and was never restored — each strike permanently brightened
      // the scene by ~+1.65 exposure, washing a stormy race out to white).
      frame.exposure = _ltBase.exposure + 0.22 * f;
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
    _ltFlash *= Math.exp(-8 * dt);
    if (_ltFlash < 0.001) _ltFlash = 0;
  }

  // Floodlights: EVERY track has them (see buildTrackLights); they're fed to the
  // shader whenever the scene is dark enough to read them — night, dusk, or dawn
  // on any circuit, or a night-default track in default mode. In bright day the
  // sun dominates so they're normally left off (no washed-out daylight pools) —
  // UNLESS the DAYTIME FLOODS knob (LT.floodDay) is turned up, which lights the
  // pools under a blue sky for a lit-stadium look (handled in the else-branch).
  const _floodActive = isFloodActiveSession();
  // Daytime floods: only when the session isn't already a dark one AND the knob is
  // up. Brightness = floodDay × LAMP LEVEL (neutral white, no twilight warmth ramp).
  const _floodDayLvl = (!_floodActive && LT.floodDay > 0) ? LT.floodDay : 0;
  if (_floodActive || _floodDayLvl > 0) {
    // Rebuild if empty (not just undefined): a light set built before the track
    // centreline finished is empty; retry until it yields lights. Tracks always
    // produce a full set once complete, so this self-heals in a frame.
    if (!track._lights || track._lights.length === 0) track._lights = buildTrackLights(track);
    // Time-dependent floodlights: brightness + COLOUR ramp with sun elevation.
    // At twilight (sun near/just below horizon) the lamps are dim and WARM, as if
    // freshly switched on / still warming up; by deep night they reach full
    // brightness and cool to their neutral tint. Smooth, no hard dusk/night step.
    // The dusk sky sits at a near-constant ~10-20 degree sun elevation for the
    // WHOLE session (see the dusk sunDir above) — the old (0.07-sy)/0.22 ramp
    // pinned at nightF=0 the entire time, floundering at a fixed 0.34 floor no
    // matter how bright that golden-hour sky still was. Lamps that bright, fed
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
    let floodScale;
    if (_floodActive) {
      const _sy = frame.sunDir ? frame.sunDir[1] : -1;
      // Floor the twilight ramp at 0.30: the dusk sunDir sits slightly higher than
      // dawn's, so a bare `clamp(1 - _sy*6, 0)` pinned dusk floods at the 5% floor
      // for the whole session (the FLOODLIGHTS sliders had no authority at dusk).
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
      // TWILIGHT WARMTH knob scales the amber cast of the "just switched on" floods
      // (def 1 = as-shipped 0.14 red boost / 0.22 blue cut).
      const warmth = (1 - nightF) * (LT.twilightWarm != null ? LT.twilightWarm : 1);   // 1 at twilight → 0 deep night
      floodScale = [lvl * (1 + warmth * 0.14) * _ltr, lvl * _ltg, lvl * (1 - warmth * 0.22) * _ltb];
    } else {
      // DAYTIME FLOODS: pools lit under a blue sky. No twilight warmth ramp (the
      // "just switched on" amber glow is a dusk cue) — neutral white scaled by
      // DAYTIME FLOODS × LAMP LEVEL, still honouring LAMP TEMPERATURE.
      const lvl = _floodDayLvl * LT.lampLevel;
      floodScale = [lvl * _ltr, lvl * _ltg, lvl * _ltb];
    }
    // camera forward (xz) for the ahead-biased light cull — sign only, no normalize
    _lightFwd[0] = camTgt[0] - camEye[0]; _lightFwd[2] = camTgt[2] - camEye[2];
    setFrameLights(camEye, floodScale, _lightFwd);
    // Car tail-lights are an after-dark cue only — skip them under daytime floods.
    if (_floodActive) appendCarTailLights();
  } else {
    frame.lights = null;
  }
  // Studio rig override: replaces the session lamps with the inspection ring.
  if (_studioRig) {
    const rig = buildStudioRig();
    if (rig) frame.lights = rig;
  }
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
  // Prop emissive (lit windows / signage / neon) drives how strongly the
  // buildings glow after dark. A full night session goes to full emissive
  // REGARDLESS of the palette's sun elevation — many night palettes keep the sun
  // above the horizon for the sky glow (sunY≈0.25), which previously pinned the
  // ramp near 0.10 and left the glowing-glass towers reading as dark boxes.
  // Dusk/dawn ramp by the (genuinely low) sun elevation; day stays dark.
  // (Hoisted above the env probe so both world passes share it.)
  const _sunY = frame.sunDir ? frame.sunDir[1] : (night ? -1 : 1);
  const _floodEmit = LT.floodEmitMul * (
    (raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night)) ? 0.78
      : (raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn")
        ? Math.min(0.70, 0.05 + 0.58 * Math.max(0.30, clamp(1 - _sunY * 6, 0, 1)))
        : 0);
  _lastFloodEmit = _floodEmit;   // exposed via __apex.lightState()
  frameSky.lightning = _ltFlash || 0;
  // ── Live env probe: render ONE 64px cubemap face of the world around the
  // player car per frame (full refresh every 6 frames). The car-paint clearcoat
  // samples it for REAL reflections of the surroundings — trees, buildings,
  // track, sky — including everything behind the camera that SSR can't see.
  // CAR tuner ENV REFLECTION (carEnvCube) = 0 skips the pass entirely.
  // Skip it under a free/debug camera (dbgCam): the probe re-draws the whole world
  // a second time each frame and is anchored to the player car, which isn't the
  // subject while flying the lighting-tuner free camera — dropping it here removes
  // the biggest per-frame load multiplier during the exact mode that OOM-crashes.
  // Advance one face only every OTHER frame — a full 6-face cube cycle then takes
  // 12 frames instead of 6, halving the probe's whole-world re-draw cost (imperceptible
  // for a 64px blurred reflection probe).
  if (player && !_envProbeOff && !paused && !dbgCam && (_frameNo & 1) === 0 && gfx.envFaceBegin && LT.carEnvCube > 0.001 && !hideMeshes.cars) {
    _envFace = (_envFace + 1) % 6;
    Tracks.sample(track, player.s, smp2);
    const _pex = smp2.p[0] + smp2.r[0] * player.x,
          _pez = smp2.p[2] + smp2.r[2] * player.x;
    const _envInv = gfx.envFaceBegin(_envFace, [_pex, smp2.p[1] + 0.9, _pez], frame);
    if (_envInv) {
      frameSky.invViewProj = _envInv;
      gfx.drawSky(frameSky);
      drawWorldMeshes(frame, night, wet, _floodEmit, false);
      gfx.envFaceEnd(_envFace);
    }
  }
  if (dbgCam) {
    const bf = frame.fogDensity;
    frame.fogDensity = bf * (dbgCam.fog != null ? dbgCam.fog : 0.15);
    gfx.begin(frame);
    frame.fogDensity = bf;
  } else gfx.begin(frame);
  M4.invertTo(_mInvVP, _mVP);
  frameSky.invViewProj = _mInvVP;
  gfx.drawSky(frameSky);
  // (`wet` is already declared above in the sky/lightning block)
  // Per-surface materials drive the GGX specular term.
  // Wet weather: rain films lower effective roughness dramatically — road becomes
  // mirror-like, cars and barriers pick up sharper reflections.
  // (Floor → gate draws live in drawWorldMeshes, shared with the env probe.
  //  Corona strength note: the lens-glare halos are drawn from frame.lights
  //  COLOURS (already time-of-day scaled); the LENS GLARE tuner slider is
  //  LT.glareStr, default 0.12.)
  drawWorldMeshes(frame, night, wet, _floodEmit, true);

  // skid marks — one batched draw for the whole live trail (rebuilt only when a
  // mark is added/evicted). Was up to 120 per-mark draws every frame once the
  // ring buffer filled. Falls back to per-mark draws if the batch path is
  // unavailable (older GPU where the batch program failed to link).
  {
    let rebuilt = false;
    if (_skidBatchDirty) { rebuildSkidBatch(); rebuilt = true; }
    if (!gfx.drawSkidBatch(_skidVerts, _skidVertCount, rebuilt)) {
      const ex = camEye[0], ez = camEye[2], SKID_CULL = 170 * 170;
      const full = skidActive >= MAX_SKID, cnt = full ? MAX_SKID : skidActive;
      for (let i = 0; i < cnt; i++) {
        const m = full ? skidMarks[(skidIdx + i) % MAX_SKID] : skidMarks[i];
        const dx = m[12] - ex, dz = m[14] - ez;
        if (dx * dx + dz * dz > SKID_CULL) continue;
        gfx.drawMark(m, 0.6, 2.2);
      }
    }
  }

  // cars — skip AI cars more than 550 m of track arc from the player (past fog)
  const hidePlayerCar = !dbgCam && (state === "race" || state === "count") &&
    CAM_MODES[camMode].id === "cockpit";   // don't draw the car you're sitting in
  // Cockpit view still draws a first-person RIG (wheel/halo/mirrors) + the car's
  // shadow — only the body mesh is skipped. Bumper hides everything as before.
  const cockpitRigOnly = hidePlayerCar && CAM_MODES[camMode].id === "cockpit";
  // Camera forward (horizontal) for the behind-camera AI cull below.
  let _camFwdX = camTgt[0] - camEye[0], _camFwdZ = camTgt[2] - camEye[2];
  { const l = Math.hypot(_camFwdX, _camFwdZ) || 1; _camFwdX /= l; _camFwdZ /= l; }
  // Glossy automotive paint is identical for every car this frame (depends only
  // on wet/night), and carPaintMat returns a shared scratch — so compute it ONCE
  // instead of 22× per frame. Wet adds a water film (sharper highlights).
  const paint = carPaintMat(wet
    ? (night ? PAINT_WET_NIGHT : PAINT_WET_DAY)
    : (night ? PAINT_DRY_NIGHT : PAINT_DRY_DAY));
  _shadowCount = 0;   // accumulate car shadows, flush in one batch after the loop
  for (const c of cars) {
    if (c.isPlayer && hidePlayerCar && !cockpitRigOnly) continue;
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
    const bankC = Tracks.banking(track, cS, renderX, _bankScratch);
    tmpP[0] = smp2.p[0] + smp2.r[0] * renderX;
    tmpP[1] = smp2.p[1] + (bankC ? bankC.dy : 0);
    tmpP[2] = smp2.p[2] + smp2.r[2] * renderX;
    // Behind-camera cull: AI cars strictly behind the view direction are never
    // visible in ANY camera mode (no mirrors), so skip all their draws (mesh +
    // shadow + brake rings + rain light). ~half the field sits behind you
    // mid-race. Uses the real camera forward, so reverse/side cams are correct.
    // Near-eye cull: a car whose origin is within ~3.4 m of the camera eye has
    // geometry reaching THROUGH the near plane (nose is 2.95 m long) — it can
    // only render as screen-filling clipped black fragments. Grid starts put
    // the chase eye ~5.5 m behind the player, right at the next row's nose,
    // and the launch concertina closes the rest ("black clipping at the start
    // even in chase"). Skip the car entirely until there's real separation.
    if (!c.isPlayer) {
      const dx = tmpP[0] - camEye[0], dz = tmpP[2] - camEye[2];
      if (dx * _camFwdX + dz * _camFwdZ < -6) continue;   // 6 m grace behind the eye
      const dy = tmpP[1] - camEye[1];
      if (dx * dx + dy * dy + dz * dz < 3.4 * 3.4) continue;
    }
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
                            : -c.speed * c.speed * (c.kCur || 0);
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
    let _sm = _shadowMats[_shadowCount];
    if (!_sm) { _sm = new Float32Array(16); _shadowMats[_shadowCount] = _sm; }
    _sm.set(tmpMat);
    _shadowTeams[_shadowCount] = c.team;   // for next frame's car-shadow caster pass
    _shadowCount++;
    // Cockpit view: the interior is a VIEWMODEL — anchored to the CAMERA, not to
    // the car's rendered position. Orientation is the stabilized track basis
    // (plain tangent/right at the car, no visual yaw/pitch/roll/lean), but the
    // ORIGIN is derived by subtracting the cockpit eye offsets from the live,
    // final camEye. The eye therefore sits at exactly (COCKPIT_EYE_FWD,
    // COCKPIT_EYE_UP) in rig space EVERY frame, by construction. Previously the
    // rig sat at the car's render position while the eye carried collision
    // SHAKE (±0.45 m on pack contact — race starts, being tapped under braking),
    // speed vibration, and the damped-lateral (xVis) vs raw-lateral mismatch on
    // corner entry — any of which shoved the eye inside the black carbon
    // bodywork ("black box at the start / when braking"). Anchoring the rig to
    // the eye makes that entire class of clipping impossible: whatever moves
    // the camera moves the cockpit with it. (Shadow above still uses the real
    // animated tmpMat at the car's true position.)
    if (c.isPlayer && cockpitRigOnly) {
      const sR = smp2.r, sF = smp2.t;
      _cockU[0] = sR[1]*sF[2] - sR[2]*sF[1];
      _cockU[1] = sR[2]*sF[0] - sR[0]*sF[2];
      _cockU[2] = sR[0]*sF[1] - sR[1]*sF[0];
      _cockP[0] = camEye[0] - sF[0] * COCKPIT_EYE_FWD;
      _cockP[1] = camEye[1] - COCKPIT_EYE_UP;
      _cockP[2] = camEye[2] - sF[2] * COCKPIT_EYE_FWD;
      basisMat(sR, _cockU, sF, _cockP, _cockMat);
      drawCockpitRig(c, _cockMat, dt, paint);
      continue;
    }
    // Player: body-only mesh + animated (spinning/steering) wheels. Others (and
    // the player when a glb model is loaded) draw the full mesh with baked wheels.
    const body = c.isPlayer ? playerBodyMesh(c.team) : null;
    if (body) {
      gfx.draw(body, tmpMat, paint);
      drawCarDecals(c.team, tmpMat, night, carDecalNum(c.team, c));
      drawPlayerWheels(c, tmpMat, dt, { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: night ? 0.12 : 0, doubleSided: true });
    } else {
      gfx.draw(teamMesh(c.team), tmpMat, paint);
      drawCarDecals(c.team, tmpMat, night, carDecalNum(c.team, c));
      // AI brake glow: rings at the four baked wheel positions (outer face).
      // Sub-pixel past ~40 m, so distance-gate — a pack braking into a corner
      // was 10 cars × 4 = ~40 ring draws, most of them off in the distance.
      const aiHeat = c.brakeHeat || 0;
      if (aiHeat > 0.08) {
        const rdx = tmpP[0] - camEye[0], rdy = tmpP[1] - camEye[1], rdz = tmpP[2] - camEye[2];
        if (rdx * rdx + rdy * rdy + rdz * rdz < 40 * 40) {
          const ro = _ringOpts;
          ro.emissive = 0.30 + 0.70 * aiHeat;
          ro.alpha = Math.min(1, 0.25 + aiHeat * 0.9);
          for (let w = 0; w < WHEELS.length; w++) {
            const wd = WHEELS[w];
            const tx = wd.x + (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.025);
            const W = _ringWorld;
            W.set(tmpMat);
            W[12] += W[0] * tx + W[4] * wd.y + W[8] * wd.z;
            W[13] += W[1] * tx + W[5] * wd.y + W[9] * wd.z;
            W[14] += W[2] * tx + W[6] * wd.y + W[10] * wd.z;
            gfx.draw(getBrakeRing(), W, ro);
          }
        }
      }
    }
    // Rear LED: FIA rain-light strobe in the wet (~4 Hz, 55% duty), and STEADY
    // at night — a car's rear/vertical faces receive none of the downward-aimed
    // floodlight beams, so from the cockpit a car directly ahead at night was a
    // pitch-black void filling the windscreen (the "black box at the start /
    // when braking" — you sit 2 m behind the P11 gearbox on the grid, and you
    // close right up on the car ahead under braking). The steady red LED gives
    // every rear an anchor light, like a real night race.
    // Real-F1 touches: the LED brightness tracks the car's live ERS charge (dim
    // when flat, bright when full — but never fully dark, so it stays an anchor),
    // and it FLASHES the same ~4 Hz FIA pattern while harvesting/deploying (OT or
    // active boost), exactly like the real rear light on a push lap.
    const _ledStrobe = ((raceT * 4.4) % 1) < 0.55;
    const _ledDeploy = (c.otT > 0) || (c.boostOn && c.energy > 0.01);
    if ((wet && _ledStrobe) || (!wet && night && (!_ledDeploy || _ledStrobe))) {
      const W = _ringWorld;
      W.set(tmpMat);
      // 15 mm behind the baked LED face (z -2.60) — coplanar quads z-fight.
      W[12] += W[4] * 0.50 - W[8] * 2.615;
      W[13] += W[5] * 0.50 - W[9] * 2.615;
      W[14] += W[6] * 0.50 - W[10] * 2.615;
      // Brightness by ERS charge: 0.45 (flat) → 1.0 (full). Wet safety strobe
      // stays full-bright regardless — a rain light must not dim with battery.
      const _ledEmis = wet ? 1.0 : (0.45 + 0.55 * clamp(c.energy || 0, 0, 1));
      gfx.draw(getRainLight(), W, { emissive: _ledEmis, roughness: 0.9, specular: 0, noAlphaWrite: true });
    }
    // BOOST: blue-white plasma flame + strobing rear ERS strip while deploying
    // (any time of day); the strip glows steady dim while boost is armed.
    if (c.isPlayer && c.boostOn) {
      const dep = c.energy > 0.01;
      const fl = 0.65 + 0.35 * Math.sin(raceT * 47.0 + Math.sin(raceT * 19.0) * 4.0);
      const W = _ringWorld;
      if (dep && c.speed > 5) {
        // In the clear "pocket" between the rain-light LED plane (z -2.60) and
        // the diffuser rear face (z -2.70): nothing occludes it from any rear
        // camera — the housing/pipe are all forward of it, the diffuser is a
        // backdrop behind it.
        W.set(tmpMat);
        W[12] += W[4] * 0.40 - W[8] * 2.66;
        W[13] += W[5] * 0.40 - W[9] * 2.66;
        W[14] += W[6] * 0.40 - W[10] * 2.66;
        gfx.draw(getBoostFlame(), W, { emissive: 1.0, roughness: 1, specular: 0, alpha: 0.45 + 0.5 * fl, noAlphaWrite: true });
      }
      W.set(tmpMat);
      W[12] += W[4] * 0.605 - W[8] * 2.615;
      W[13] += W[5] * 0.605 - W[9] * 2.615;
      W[14] += W[6] * 0.605 - W[10] * 2.615;
      gfx.draw(getErsLight(), W, { emissive: 1.0, roughness: 1, specular: 0, noAlphaWrite: true,
        alpha: dep ? (0.5 + 0.5 * (Math.sin(raceT * 28.0) > 0 ? 1 : 0.2)) : 0.35 });
    }
    // Exhaust heat glow: night-only flicker behind the tailpipe on throttle.
    if (night && c.isPlayer && (c.exhaustPop || 0) > 0.05) {
      const fl = 0.6 + 0.4 * Math.sin(raceT * 41.0 + Math.sin(raceT * 23.0) * 3.0);
      const W = _ringWorld;
      W.set(tmpMat);
      // 3 cm forward of the boost quad in the same clear pocket (see above) —
      // the old z -2.24 was hidden behind the rain-light housing from chase cam.
      W[12] += W[4] * 0.40 - W[8] * 2.63;
      W[13] += W[5] * 0.40 - W[9] * 2.63;
      W[14] += W[6] * 0.40 - W[10] * 2.63;
      gfx.draw(getExhaustFlame(c.fuelId), W, { emissive: 1.0, roughness: 1, specular: 0, alpha: (0.30 + 0.55 * fl) * c.exhaustPop, noAlphaWrite: true });
    }
    // EXHAUST HEAT HAZE: remember the player tailpipe's world position + plume
    // strength for this frame (projected to screen UV just before present()).
    // Any time of day, throttle-driven via exhaustPop, strongest under active
    // boost. Skipped on memory-limited phones (mobileTier — same gate as the
    // other post extras).
    if (c.isPlayer) {
      const _hzDep = c.boostOn && c.energy > 0.01 && c.speed > 5;
      _hazeStr = gfx.mobileTier ? 0 : (c.exhaustPop || 0) * (_hzDep ? 1.0 : 0.45);
      if (_hazeStr > 0.02) {
        // Just behind/above the tailpipe (up +0.55, fwd −2.9 on the car frame).
        _hazeWorld[0] = tmpMat[12] + tmpMat[4] * 0.55 - tmpMat[8] * 2.9;
        _hazeWorld[1] = tmpMat[13] + tmpMat[5] * 0.55 - tmpMat[9] * 2.9;
        _hazeWorld[2] = tmpMat[14] + tmpMat[6] * 0.55 - tmpMat[10] * 2.9;
      }
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
          _skidBatchDirty = true;   // rebuild the batched trail next render
        }
      } else {
        skidFrameT = 0;
      }
    }
    // ── Transient particle FX emitters (visual-only: they READ car state and
    // write none of it, so headless physics is untouched). They live HERE
    // because the car's world basis (tmpMat / tmpP / tmpF / tmpR) is already
    // computed. Emission is rate-gated with Math.random() < rate·dt so it is
    // framerate-independent; far cars are skipped (sub-pixel puffs would only
    // starve the shared pool).
    if (state !== "menu" && state !== "select") {
      const fdx = tmpP[0] - camEye[0], fdz = tmpP[2] - camEye[2];
      if (fdx * fdx + fdz * fdz < 110 * 110) {
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
        // wheelspin (hard accel at crawling speed; peak engine ax is ~7 m/s²,
        // so the 4.5 floor only fires on genuine full-throttle getaways).
        let smokeI = (c.isPlayer && !c.offroad) ? (c.skidIntensity || 0) : 0;
        if (c.isPlayer && !c.offroad) {
          const _pax = c.axEstSm || 0, _pvl = Math.abs(c.vLat || 0);
          if (c.speed > 10) smokeI = Math.max(smokeI, clamp((_pvl - 3) / 5, 0, 1));
          if (c.speed > 0.5 && c.speed < 12)
            smokeI = Math.max(smokeI, clamp((_pax - 4.5) / 2.5, 0, 1) * clamp((12 - c.speed) / 9, 0, 1));
        }
        if (smokeI > 0.25) {
          const wd = WHEELS[2 + ((Math.random() * 2) | 0)];   // one rear wheel per event
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
          const wd = WHEELS[2 + ((Math.random() * 2) | 0)];
          const dirt = Math.random() < 0.5;   // mix dusty-earth and grass tints
          Particles.kickup(
            tmpMat[12] + tmpMat[0] * wd.x + tmpMat[8] * wd.z,
            tmpMat[13] + tmpMat[1] * wd.x + tmpMat[9] * wd.z,
            tmpMat[14] + tmpMat[2] * wd.x + tmpMat[10] * wd.z,
            -tmpF[0] * c.speed * 0.35, -tmpF[2] * c.speed * 0.35,
            dirt ? 0.46 : 0.30, dirt ? 0.40 : 0.36, dirt ? 0.26 : 0.15,
            dt * 30);
        }
        // Rain spray: every car at speed on a wet road drags a rooster tail —
        // lighter on "wet" (drying line) than under full "rain".
        if (wet && c.speed > 15) {
          const str = clamp((c.speed - 15) / 45, 0, 1) * (raceWeather === "rain" ? 1 : 0.6);
          if (str > 0) {
            const sxo = Math.random() < 0.5 ? -0.6 : 0.6;   // behind either rear tyre
            Particles.spray(
              tmpMat[12] + tmpMat[0] * sxo - tmpF[0] * 2.1,
              tmpMat[13] + 0.28,
              tmpMat[14] + tmpMat[2] * sxo - tmpF[2] * 2.1,
              -tmpF[0] * c.speed * 0.28, -tmpF[2] * c.speed * 0.28, str,
              dt * (14 + 34 * str));
          }
        }
      }
    }
  }
  // Flush all accumulated car shadows in one pass — shadowProg+shadowVAO+blend+
  // depthMask are set once for the whole field instead of ping-ponging with the
  // lit body program every car.
  for (let i = 0; i < _shadowCount; i++) gfx.drawShadow(_shadowMats[i], 2.4, 5.8);
  // Ghost car (time trial): replay best-lap position as a bright emissive silhouette
  if (timeTrial && player && (state === "race" || state === "count")) {
    const g = Ghost.at(player.lapTime);
    // Skip the ghost while it overlaps the player — at the lap start it sits on
    // your exact grid position, and in the cockpit/onboard cams its bodywork
    // fills the camera as a black box until you pull away ("starts dark, clears
    // after throttle"). Once there's real separation it draws normally.
    let gDs = Infinity;
    if (g && !g.done) { const d = Math.abs(g.s - player.s); gDs = Math.min(d, track.total - d); }
    if (g && !g.done && gDs > 3.0) {
      Tracks.sample(track, g.s, smp2);
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
      gfx.draw(teamMesh(player.team), tmpMat, { emissive: 0.80, roughness: 0.20, metalness: 0.08, specular: 0.35, alpha: 0.35, noAlphaWrite: true });
      }
    }
  }

  // Transient FX particles (tyre smoke / sparks / kickup / spray): advanced
  // with the RENDER dt and drawn into the HDR scene before present, so smoke
  // and spray tone-map with the world and the HDR spark tints feed bloom.
  // Render-path only — headless physics never touches the pool.
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
  const _mist = clamp((frame.groundMist || 0) * LT.mistDensity * 0.9 + (frame.wetness || 0) * 0.22
                      + (frame.cloud || 0) * 0.12, 0, 1);
  // Gate by the sun's actual BRIGHTNESS too: at night the key is dim moonlight
  // held above the horizon for sky glow, and ungated it marched faint stripey
  // "moon rays" through the cloud gaps.
  const _sunLumGR = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
  const _sunGateGR = clamp((_sunLumGR - 0.35) / 0.45, 0, 1);
  const _gr = (_grSunY > 0.02 ? (0.38 + 0.55 * _grLow) : 0) * (1 + 0.25 * _mist) * _sunGateGR * LT.grMul;
  // Night lamp volumetrics: visible light beams in the air from the lamps when
  // floodlights are on (frame.lights) and there's haze to catch them. Scales with
  // haze — subtle on a near-dry night, dramatic in fog/rain. Additive + mist-gated
  // in the shader, so it never greys out the dark night.
  // Always a subtle beam glow whenever lamps are on (clear night air still
  // scatters a little), swelling with haze/rain into full volumetric shafts —
  // and coloured per lamp, so neon-spill lights throw coloured beams.
  // Gated to dark sessions (key below ~0.45): visible lamp beams in daylight (the
  // DAYTIME FLOODS knob also sets frame.lights) would read as odd haze shafts.
  const _lampVol = (frame.lights && _sunLumGR < 0.45) ? clamp(LT.lampVolBase + LT.lampVolHaze * _mist, 0, LT.lampVolCap) : 0;
  // Resolve the HDR scene (bloom + tonemap + grade + vignette) to the screen.
  // SSAO grounds the scene (creases/contacts) at every time of day.
  // Contact shadows only when the KEY is bright enough to cast them (day/dusk/dawn).
  // Gate on key brightness, not sunDir.y — the night moon-key sits high (y≈0.97)
  // so the old elevation test ran contact shadows all night for a black-ambient
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
  // the night moon-key is held high (y≈0.97), so the old elevation test kept SSAO
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
  // smear only appears at speed (zero when parked; ramps in above ~40% of VMAX).
  const _spd = LT.speedBlur > 0 ? LT.speedBlur * clamp(((player.speed || 0) / VMAX - 0.4) / 0.5, 0, 1) : 0;
  const po = _presentOpts;
  po.exposure = frame.exposure * LT.exposureMul; po.bloom = _bloom * LT.bloomMul;
  po.threshold = clamp(_thresh + LT.threshOff, 0.4, 1.2); po.grade = _grade; po.ssao = _ao;
  po.godray = _gr; po.contact = _cs; po.reflect = _ssr; po.lampVol = _lampVol; po.mist = _mist;
  po.flareMul = LT.flareMul; po.speedBlur = _spd; po.tune = LT;
  // EXHAUST HEAT HAZE: project the recorded tailpipe position through the
  // frame's view-proj to a screen UV for the composite warp. Near-field only —
  // fades out past ~45 m so TV/orbit long shots stay clean.
  po.haze = null;
  if (_hazeStr > 0.02) {
    const m = _mVP, hx = _hazeWorld[0], hy = _hazeWorld[1], hz = _hazeWorld[2];
    const cw = m[3] * hx + m[7] * hy + m[11] * hz + m[15];
    if (cw > 0.1) {
      const cu = (m[0] * hx + m[4] * hy + m[8] * hz + m[12]) / cw * 0.5 + 0.5;
      const cv = (m[1] * hx + m[5] * hy + m[9] * hz + m[13]) / cw * 0.5 + 0.5;
      if (cu > -0.2 && cu < 1.2 && cv > -0.2 && cv < 1.2) {
        _hazeOpts.u = cu; _hazeOpts.v = cv;
        _hazeOpts.str = _hazeStr * clamp(1.4 - cw / 40, 0, 1);
        if (_hazeOpts.str > 0.02) po.haze = _hazeOpts;
      }
    }
  }
  gfx.present(po);
  if (isWetRoad() && rainDrops.length) {
    // Onboard views get water ON the glass (beading drops + wiper) instead of
    // the outside-the-car falling-streak field.
    const _rainCam = CAM_MODES[camMode].id;
    if (_rainCam === "cockpit" || _rainCam === "hood") drawVisorRain(dt);
    else drawRain(dt);
    // Lightning veil: drawn on top of rain drops so it bleaches the rain too.
    // Stronger bleach (was 0.18) so a strike is a real concussive sky-flash.
    if (_ltFlash > 0.001) {
      rainCtx2d.save();
      rainCtx2d.globalAlpha = Math.min(0.55, _ltFlash * 0.40);
      rainCtx2d.fillStyle = "#dcecff";
      rainCtx2d.fillRect(0, 0, rainCanvas.width, rainCanvas.height);
      rainCtx2d.restore();
    }
  }
}

// ---------- HUD ----------
// HUD write-caches: skip the DOM mutation when the value hasn't changed (the panel
// ticks ~10Hz but most fields hold steady between updates). Keyed per element.
const _hudTxt = new WeakMap();   // el -> last textContent
const _hudSty = new WeakMap();   // el -> { prop: lastVal }
const _hudCls = new WeakMap();   // el -> last className
const _hudTog = new WeakMap();   // el -> { cls: lastBool }
function hText(el, v) { if (!el) return; if (_hudTxt.get(el) !== v) { _hudTxt.set(el, v); el.textContent = v; } }
function hStyle(el, prop, v) { if (!el) return; let m = _hudSty.get(el); if (!m) { m = {}; _hudSty.set(el, m); } if (m[prop] !== v) { m[prop] = v; el.style[prop] = v; } }
function hClass(el, v) { if (!el) return; if (_hudCls.get(el) !== v) { _hudCls.set(el, v); el.className = v; } }
function hToggle(el, cls, on) { if (!el) return; let m = _hudTog.get(el); if (!m) { m = {}; _hudTog.set(el, m); } if (m[cls] !== on) { m[cls] = on; el.classList.toggle(cls, on); } }
// Sector row: cached span nodes (built once), textContent-updated each tick — no
// per-tick innerHTML re-parse.
let _secRows = null;
function buildSecRows() {
  const SC = ["#c084fc", "#e10600", "#a3e635"], labels = ["S1", "S2", "S3"];
  els.hudSectors.textContent = "";
  _secRows = [];
  for (let i = 0; i < 3; i++) {
    const row = document.createElement("div"); row.className = "sec-row";
    const lbl = document.createElement("span"); lbl.className = "sec-lbl"; lbl.style.color = SC[i]; lbl.textContent = labels[i];
    const val = document.createElement("span"); val.className = "sec-val"; val.textContent = "--";
    row.appendChild(lbl); row.appendChild(val); els.hudSectors.appendChild(row);
    _secRows.push(val);
  }
}
function updateHud(force) {
  if (!player) return;
  hudT -= 1;
  if (!force && hudT > 0) return;
  hudT = 6; // ~10Hz at 60fps
  hText(els.pos, timeTrial ? "TT" : (player.rank || "-") + "/" + cars.length);
  hText(els.lap, Math.min(player.lap || 1, lapsTarget) + "/" + lapsTarget);
  hText(els.time, fmtTime(player.lapTime));
  hText(els.best, isFinite(player.best) ? fmtTime(player.best) : "-");
  hText(els.speed, "" + Math.round(player.speed * 3.6));
  hStyle(els.energy, "width", (player.energy * 100).toFixed(0) + "%");
  // gear + tachometer
  hText(els.gear, "" + player.gear);
  const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  hStyle(els.rpmFill, "width", (rpmFrac * 100).toFixed(0) + "%");
  hToggle(els.tach, "redline", player.rpm > MAX_RPM * 0.92);
  // toggle-button states
  hToggle(els.btnBoost, "on", player.boostOn);
  hToggle(els.btnOT, "on", player.otT > 0);
  hToggle(els.btnOT, "armed", player.otArmed && player.otT <= 0);
  const ot = player.otT > 0 ? "ot-active" : player.otArmed ? "ot-armed" : player.otCool > 0 ? "ot-cool" : "ot-off";
  hClass(els.ot, ot);
  hText(els.ot, player.otT > 0 ? "OVERTAKE " + player.otT.toFixed(1) : "OVERTAKE");
  if (timeTrial) {
    // no rivals — show ghost delta (or last lap) and the record to chase instead of gaps
    if (Ghost.hasGhost()) {
      const ghostT = Ghost.timeAt(player.s);
      if (ghostT !== null) {
        const delta = player.lapTime - ghostT;
        const sign = delta >= 0 ? "+" : "";
        hText(els.gapA, "GHOST " + sign + delta.toFixed(3) + "s");
        hStyle(els.gapA, "color", delta <= 0 ? "#a3e635" : "#e10600");
      } else {
        hText(els.gapA, player.lastLap ? "LAST " + fmtTime(player.lastLap) : "");
        hStyle(els.gapA, "color", "");
      }
    } else {
      hText(els.gapA, player.lastLap ? "LAST " + fmtTime(player.lastLap) : "");
      hStyle(els.gapA, "color", "");
    }
    hText(els.gapB, isFinite(ttRecord) ? "REC " + fmtTime(ttRecord) : "REC —");
  } else {
    // gaps — reuse the module-scope prog-sorted field from the update loop
    const i = ranked.indexOf(player);
    const a = ranked[i - 1], b = ranked[i + 1];
    hText(els.gapA, a ? "▲ " + a.code + " +" + ((a.prog - player.prog) / Math.max(player.speed, 25)).toFixed(1) + "s" : "");
    hText(els.gapB, b ? "▼ " + b.code + " +" + ((player.prog - b.prog) / Math.max(player.speed, 25)).toFixed(1) + "s" : "");
  }
  // Sector split display (top-right) — cached span nodes, textContent per tick
  if (els.hudSectors) {
    if (!_secRows) buildSecRows();
    for (let i = 0; i < 3; i++) {
      const t = sectorLast[i];
      hText(_secRows[i], t == null ? "--" : t.toFixed(3));
    }
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
    // Same CircuitMarkings splits as TrackMaps.draw / sectorAt (thirds if missing).
    const sec = track.def && track.def.sectors;
    const splits = (sec && sec.length === 2) ? [0, sec[0], sec[1], 1] : [0, 1 / 3, 2 / 3, 1];
    for (let s = 0; s < 3; s++) {
      const from = Math.floor(splits[s] * n);
      const to = s === 2 ? n - 1 : Math.max(from, Math.floor(splits[s + 1] * n));
      mc.strokeStyle = SC[s];
      mc.beginPath();
      for (let i = from; i <= to; i++) {
        const p = map[i % n];
        const x = 8 + p[0] * (W - 16), y = 8 + p[1] * (H - 16);
        i === from ? mc.moveTo(x, y) : mc.lineTo(x, y);
      }
      if (s === 2) {
        const p0 = map[0];
        mc.lineTo(8 + p0[0] * (W - 16), 8 + p0[1] * (H - 16));
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
    mm.fillStyle = c.team._cssColor || (c.team._cssColor = cssCol(c.team.color));   // team colours are static — compute once
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
// ── Adaptive-resolution governor ─────────────────────────────────────────────
// Holds framerate by scaling the 3D render resolution (gfx.setRenderScale) when
// frames run slow, restoring sharpness when there's headroom. Conservative:
// only downscales when clearly missing 60 fps (>19 ms EMA) so a healthy
// vsync-capped display never degrades; upscales slowly to avoid oscillation.
let _frameEMA = 16.7, _govT = 0, _govCool = 0, _autoRes = true;
function perfGovernor(dtMs) {
  if (!_autoRes) return;
  // Ignore huge spikes (tab resume, GC): they'd yank the scale.
  if (dtMs < 100) _frameEMA += (dtMs - _frameEMA) * 0.1;
  if (_govCool > 0) { _govCool--; return; }
  if (++_govT < 45) return;   // evaluate ~every 45 frames
  _govT = 0;
  const cur = gfx.getRenderScale ? gfx.getRenderScale() : 1;
  if (_frameEMA > 19 && cur > 0.5) {          // <~53 fps: drop resolution
    if (gfx.setRenderScale(cur - 0.1)) _govCool = 30;
  } else if (_frameEMA < 14 && cur < 1) {     // >~71 fps headroom: restore
    if (gfx.setRenderScale(Math.min(1, cur + 0.06))) _govCool = 30;
  }
}
const PHYS_DT = 1 / 60;          // fixed physics step
function tick(now) {
  requestAnimationFrame(tick);
  try { tickBody(now); }
  catch (e) {
    // Report the REAL error once (cross-origin window.onerror shows only a bare
    // "Script error."). rAF above already re-scheduled, so this won't spin-crash.
    if (!tick._reported && typeof window.__apexReportError === "function") {
      tick._reported = true; window.__apexReportError("tick", e);
    }
    throw e;
  }
}
function tickBody(now) {
  let dt = Math.min((now - lastFrame) / 1000, 1 / 4);   // clamp big gaps (tab resume)
  const _dtMs = now - lastFrame;
  lastFrame = now;
  // Adaptive resolution: only govern while actively rendering a race.
  if (!paused && (state === "race" || state === "count")) perfGovernor(_dtMs);
  Input.poll();   // refresh gamepad state once per frame (before the paused gate
                  // so the Start/Menu button can also un-pause)
  if (paused) {
    // LIGHTING TUNER live preview: keep RENDERING (physics stays paused) while
    // the panel is open so every slider change shows on the held frame.
    if ((state === "race" || state === "count") && !$("lighting").hidden) {
      // NO governor here: paused preview frames are vsync-cheap, so the governor
      // only ever stepped the scale UP toward full res — each step a complete
      // render-target reallocation. The scale simply stays where the race left it
      // (and photo mode pins its own — see enterPhotoMode).
      if (photoMode) updatePhotoCam(Math.min(dt, 1 / 20));   // fly-cam integrates before the held frame
      render(Math.min(dt, 1 / 20));
    }
    return;
  }
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

let csActiveCat = null;   // id of the category tab currently open in CAR SETUP
let csLivCreating = false; // livery creator panel open?
let csLivDraft = null;     // { name, c1, c2, stripe } while editing a new paint job
let csLivEditId = null;    // id of the custom livery being edited in-place (null = creating new)
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

  // Which category tab is open — persisted across rebuilds; default to the first.
  // "livery" is a valid pseudo-category (the paint-job picker).
  if (!csActiveCat || (csActiveCat !== "livery" && !Parts.CATALOG.some((c) => c.id === csActiveCat))) csActiveCat = Parts.CATALOG[0].id;
  const activeCat = Parts.CATALOG.find((c) => c.id === csActiveCat);

  // Resolve the currently-fitted option for a category (respecting supplier lock).
  const resolveOpt = (cat) => {
    const id = parts[cat.id] || Parts.DEFAULTS[cat.id];
    return cat.options.find((o) => o.id === id && (!o.supplier || o.supplier === team.engine))
        || cat.options.find((o) => o.id === Parts.DEFAULTS[cat.id]);
  };

  // ---- Category tabs (one row, horizontally scrollable) ----
  const tabs = $("cs-tabs");
  tabs.textContent = "";
  for (const cat of Parts.CATALOG) {
    const cur = resolveOpt(cat);
    const upgraded = cur && cur.id !== Parts.DEFAULTS[cat.id];
    const tab = document.createElement("button");
    tab.className = "cs-tab" + (cat.id === csActiveCat ? " active" : "") + (upgraded ? " upgraded" : "");
    const lbl = document.createElement("span"); lbl.className = "cs-tab-lbl"; lbl.textContent = cat.label;
    const sub = document.createElement("span"); sub.className = "cs-tab-cur"; sub.textContent = cur ? cur.label : "";
    tab.append(lbl, sub);
    tab.onclick = () => {
      if (csActiveCat === cat.id) return;
      csActiveCat = cat.id;
      if (soundOn) GameAudio.uiTick();
      buildSetup();
      const t = $("cs-options"); if (t) t.scrollTop = 0;
    };
    tabs.appendChild(tab);
  }
  // LIVERY pseudo-tab (paint jobs) — appended after the parts categories.
  {
    const curLiv = getLiveries(team).find((l) => l.id === getLiveryId(team.id));
    const painted = getLiveryId(team.id) !== "default";
    const tab = document.createElement("button");
    tab.className = "cs-tab" + (csActiveCat === "livery" ? " active" : "") + (painted ? " upgraded" : "");
    const lbl = document.createElement("span"); lbl.className = "cs-tab-lbl"; lbl.textContent = "LIVERY";
    const sub = document.createElement("span"); sub.className = "cs-tab-cur"; sub.textContent = curLiv ? curLiv.name : "Team";
    tab.append(lbl, sub);
    tab.onclick = () => {
      if (csActiveCat === "livery") return;
      csActiveCat = "livery";
      if (soundOn) GameAudio.uiTick();
      buildSetup();
      const t = $("cs-options"); if (t) t.scrollTop = 0;
    };
    tabs.appendChild(tab);
  }

  // ---- Options list for the active category ----
  const optsEl = $("cs-options");
  optsEl.textContent = "";
  if (csActiveCat === "livery") { buildLiveryOptions(optsEl, team); renderStatBars($("cs-stats-inner"), team); return; }
  const curOpt = resolveOpt(activeCat);
  const curCost = curOpt ? (curOpt.cost || 0) : 0;
  for (const opt of activeCat.options) {
    if (opt.supplier && opt.supplier !== team.engine) continue;   // hide other suppliers' exclusives
    const active = curOpt && curOpt.id === opt.id;
    const costDelta = (opt.cost || 0) - curCost;
    const wouldExceed = !active && !unlimitedBudget && (spent + costDelta > Parts.BUDGET);

    const row = document.createElement("button");
    row.className = "cs-opt" + (active ? " active" : "") + (wouldExceed ? " over-budget" : "") + (opt.tag ? " exclusive" : "");

    const dot = document.createElement("span"); dot.className = "cs-opt-dot"; row.appendChild(dot);

    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name";
    nameRow.appendChild(document.createTextNode(opt.label));
    if (opt.tag) { const tg = document.createElement("span"); tg.className = "cs-opt-tag"; tg.textContent = opt.tag; nameRow.appendChild(tg); }
    main.appendChild(nameRow);
    const deltas = statDeltaChips(opt);
    if (deltas) main.appendChild(deltas);
    if (active && opt.desc) { const d = document.createElement("div"); d.className = "cs-opt-desc"; d.textContent = opt.desc; main.appendChild(d); }
    row.appendChild(main);

    const cost = document.createElement("span");
    cost.className = "cs-opt-cost" + (opt.cost > 0 ? "" : " free");
    cost.textContent = opt.cost > 0 ? opt.cost + " cr" : "FREE";
    row.appendChild(cost);

    row.onclick = () => {
      if (active) return;
      const p = getTeamParts(team.id);
      const co = activeCat.options.find((o) => o.id === (p[activeCat.id] || Parts.DEFAULTS[activeCat.id]));
      const cc = co ? (co.cost || 0) : 0;
      if (!unlimitedBudget && (Parts.getCost(p, team.engine) - cc + (opt.cost || 0)) > Parts.BUDGET) {
        row.classList.add("budget-reject");
        row.addEventListener("animationend", () => row.classList.remove("budget-reject"), { once: true });
        if (soundOn) GameAudio.uiTick();
        return;
      }
      p[activeCat.id] = opt.id;
      saveTeamParts(team.id, p);
      if (soundOn) GameAudio.uiSelect();
      buildSetup();
    };
    optsEl.appendChild(row);
  }

  renderStatBars($("cs-stats-inner"), team);
}

// Small ▲/▼ stat-effect chips for an option row — reads the raw physics
// multipliers off the option (absent field = no change). Purely informational.
const CS_DELTA_DEFS = [
  { key: "speed",     label: "TOP" },
  { key: "accel",     label: "ACCEL" },
  { key: "cornering", label: "GRIP" },
  { key: "braking",   label: "BRAKE" },
];
function statDeltaChips(opt) {
  const wrap = document.createElement("div");
  wrap.className = "cs-opt-deltas";
  let any = false;
  for (const d of CS_DELTA_DEFS) {
    const v = opt[d.key];
    if (v == null || v === 1) continue;
    any = true;
    const chip = document.createElement("span");
    chip.className = "cs-delta " + (v > 1 ? "up" : "down");
    chip.textContent = (v > 1 ? "▲" : "▼") + d.label;
    wrap.appendChild(chip);
  }
  return any ? wrap : null;
}

// A livery swatch: two-tone base + an optional centre racing-stripe band so the
// picker previews exactly what renders on the car.
function livSwatch(liv) {
  const sw = document.createElement("span"); sw.className = "cs-liv-swatch";
  sw.style.background = "linear-gradient(120deg, " + cssCol(liv.c1) + " 0 56%, " + cssCol(liv.c2) + " 56% 100%)";
  if (liv.stripe) {
    const st = document.createElement("span"); st.className = "cs-liv-stripe";
    st.style.background = cssCol(liv.stripe);
    sw.appendChild(st);
  }
  return sw;
}

// Render the paint-job picker into the options list — each livery as a two-tone
// (optionally striped) swatch + name; clicking repaints the live car preview
// instantly. Player-created liveries get a delete affordance; a CREATE row opens
// the inline creator.
function buildLiveryOptions(container, team) {
  if (csLivCreating) { buildLiveryCreator(container, team); return; }
  const cur = getLiveryId(team.id);
  const customIds = new Set(getCustomLiveries(team.id).map((l) => l.id));

  // ＋ CREATE row (top so it's always reachable without scrolling the list)
  {
    const row = document.createElement("button");
    row.className = "cs-opt cs-liv cs-liv-create";
    const dot = document.createElement("span"); dot.className = "cs-opt-dot"; row.appendChild(dot);
    const sw = document.createElement("span"); sw.className = "cs-liv-swatch cs-liv-plus"; sw.textContent = "＋"; row.appendChild(sw);
    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name"; nameRow.textContent = "Create livery";
    main.appendChild(nameRow);
    row.appendChild(main);
    const tag = document.createElement("span"); tag.className = "cs-opt-cost free"; tag.textContent = "NEW"; row.appendChild(tag);
    row.onclick = () => {
      csLivDraft = { name: "", c1: arrToHex(team.color), c2: arrToHex(team.color2), stripe: "", accent: "",
                     noseStripe: "", nose: "", pod: "", wing: "", halo: "" };
      csLivEditId = null;
      csLivCreating = true;
      if (soundOn) GameAudio.uiSelect();
      buildSetup();
    };
    container.appendChild(row);
  }

  for (const liv of getLiveries(team)) {
    const active = liv.id === cur;
    const isCustom = customIds.has(liv.id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cs-opt cs-liv" + (active ? " active" : "") + (isCustom ? " cs-liv-custom" : "");
    row.setAttribute("aria-label", "Select " + liv.name + " livery");
    const rowWrap = isCustom ? document.createElement("div") : null;
    if (rowWrap) {
      rowWrap.className = "cs-liv-row";
      rowWrap.appendChild(row);
    }

    const dot = document.createElement("span"); dot.className = "cs-opt-dot"; row.appendChild(dot);
    row.appendChild(livSwatch(liv));

    const main = document.createElement("div"); main.className = "cs-opt-main";
    const nameRow = document.createElement("div"); nameRow.className = "cs-opt-name";
    nameRow.appendChild(document.createTextNode(liv.name));
    if (isCustom) { const tg = document.createElement("span"); tg.className = "cs-opt-tag"; tg.textContent = "MINE"; nameRow.appendChild(tg); }
    main.appendChild(nameRow);
    row.appendChild(main);

    if (isCustom) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "cs-liv-edit"; edit.textContent = "✎";
      edit.title = "Edit this livery";
      edit.setAttribute("aria-label", "Edit " + liv.name + " livery");
      edit.onclick = () => {
        csLivDraft = {
          name: liv.name || "", c1: arrToHex(liv.c1), c2: arrToHex(liv.c2),
          stripe: liv.stripe ? arrToHex(liv.stripe) : "", noseStripe: liv.noseStripe ? arrToHex(liv.noseStripe) : "",
          accent: liv.accent ? arrToHex(liv.accent) : "", nose: liv.nose ? arrToHex(liv.nose) : "",
          pod: liv.pod ? arrToHex(liv.pod) : "", wing: liv.wing ? arrToHex(liv.wing) : "", halo: liv.halo ? arrToHex(liv.halo) : "",
        };
        csLivEditId = liv.id;
        csLivCreating = true;
        if (soundOn) GameAudio.uiSelect();
        buildSetup();
      };
      rowWrap.appendChild(edit);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cs-liv-del"; del.textContent = "✕";
      del.title = "Delete this livery";
      del.setAttribute("aria-label", "Delete " + liv.name + " livery");
      del.onclick = () => {
        setCustomLiveries(team.id, getCustomLiveries(team.id).filter((l) => l.id !== liv.id));
        if (active) saveLiveryId(team.id, "default");
        if (soundOn) GameAudio.uiTick();
        buildSetup();
      };
      rowWrap.appendChild(del);
    } else {
      const tag = document.createElement("span");
      tag.className = "cs-opt-cost free";
      tag.textContent = active ? "FITTED" : "PAINT";
      row.appendChild(tag);
    }

    row.onclick = () => {
      if (active) return;
      saveLiveryId(team.id, liv.id);
      if (soundOn) GameAudio.uiSelect();
      buildSetup();
    };
    container.appendChild(rowWrap || row);
  }
}

// Inline paint-job creator: three colour wells (primary / accent / stripe) + a
// name field, previewing live on the car as the player drags. SAVE appends to
// the team's custom list and fits it; CANCEL/back returns to the picker.
function buildLiveryCreator(container, team) {
  const d = csLivDraft;   // colours held as hex strings; "" stripe = none
  const wrap = document.createElement("div");
  wrap.className = "cs-liv-editor";

  const head = document.createElement("div"); head.className = "cs-liv-ed-head"; head.textContent = csLivEditId ? "EDIT PAINT JOB" : "NEW PAINT JOB";
  wrap.appendChild(head);

  // Live swatch preview of the current draft (built from hex strings directly).
  const prev = document.createElement("span"); prev.className = "cs-liv-swatch cs-liv-ed-prev";
  wrap.appendChild(prev);

  const applyPreview = () => {
    prev.style.background = "linear-gradient(120deg, " + d.c1 + " 0 56%, " + d.c2 + " 56% 100%)";
    prev.textContent = "";
    if (d.stripe) { const st = document.createElement("span"); st.className = "cs-liv-stripe"; st.style.background = d.stripe; prev.appendChild(st); }
    livePreviewDraft(team, d);
  };

  const colorRow = (label, key, allowNone) => {
    const r = document.createElement("label"); r.className = "cs-liv-ed-row";
    const lb = document.createElement("span"); lb.className = "cs-liv-ed-lbl"; lb.textContent = label; r.appendChild(lb);
    const inp = document.createElement("input"); inp.type = "color";
    inp.value = /^#[0-9a-fA-F]{6}$/.test(d[key]) ? d[key] : "#000000";
    if (allowNone && !d[key]) inp.classList.add("cs-liv-off");
    inp.oninput = () => { d[key] = inp.value; inp.classList.remove("cs-liv-off"); applyPreview(); };
    r.appendChild(inp);
    if (allowNone) {
      const off = document.createElement("button"); off.type = "button"; off.className = "cs-liv-ed-none"; off.textContent = "NONE";
      off.onclick = () => { d[key] = ""; inp.classList.add("cs-liv-off"); applyPreview(); };
      r.appendChild(off);
    }
    return r;
  };
  wrap.appendChild(colorRow("PRIMARY", "c1", false));
  wrap.appendChild(colorRow("ACCENT", "c2", false));
  wrap.appendChild(colorRow("BODY STRIPE", "stripe", true));      // full spine: nose → engine cover
  wrap.appendChild(colorRow("NOSE STRIPE", "noseStripe", true));  // nose crown only: tip → bulkhead
  wrap.appendChild(colorRow("DETAIL", "accent", true));   // tertiary paint on flashes/trim/pinstripe
  // Optional detail-part colours (see liveries.js header): nose-tip cap, sidepod
  // panel, wing flap elements, halo hoop tint. NONE = today's default look.
  wrap.appendChild(colorRow("NOSE CAP", "nose", true));
  wrap.appendChild(colorRow("SIDEPOD", "pod", true));
  wrap.appendChild(colorRow("WINGS", "wing", true));
  wrap.appendChild(colorRow("HALO", "halo", true));

  const nameRow = document.createElement("label"); nameRow.className = "cs-liv-ed-row";
  const nlb = document.createElement("span"); nlb.className = "cs-liv-ed-lbl"; nlb.textContent = "NAME"; nameRow.appendChild(nlb);
  const name = document.createElement("input"); name.type = "text"; name.className = "cs-liv-ed-name";
  name.maxLength = 18; name.placeholder = "My Livery"; name.value = d.name;
  name.oninput = () => { d.name = name.value; };
  nameRow.appendChild(name);
  wrap.appendChild(nameRow);

  const btns = document.createElement("div"); btns.className = "cs-liv-ed-btns";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "cs-liv-ed-cancel"; cancel.textContent = "CANCEL";
  cancel.onclick = () => { csLivCreating = false; csLivDraft = null; csLivEditId = null; livDraftOverride = null; _spMeshKey = ""; if (soundOn) GameAudio.uiTick(); buildSetup(); };
  const save = document.createElement("button"); save.type = "button"; save.className = "cs-liv-ed-save"; save.textContent = "SAVE & FIT";
  save.onclick = () => {
    const id = csLivEditId || ("custom_" + livIdCounter());
    const liv = { id, name: (d.name || "").trim() || "Custom", c1: hexToArr(d.c1), c2: hexToArr(d.c2) };
    if (d.stripe) liv.stripe = hexToArr(d.stripe);
    if (d.noseStripe) liv.noseStripe = hexToArr(d.noseStripe);
    if (d.accent) liv.accent = hexToArr(d.accent);
    if (d.nose) liv.nose = hexToArr(d.nose);
    if (d.pod)  liv.pod  = hexToArr(d.pod);
    if (d.wing) liv.wing = hexToArr(d.wing);
    if (d.halo) liv.halo = hexToArr(d.halo);
    const existing = getCustomLiveries(team.id);
    // Edit-in-place replaces the matching entry (same id); create appends.
    setCustomLiveries(team.id, csLivEditId ? existing.map((l) => (l.id === id ? liv : l)) : existing.concat([liv]));
    saveLiveryId(team.id, id);
    csLivCreating = false; csLivDraft = null; csLivEditId = null; livDraftOverride = null; _spMeshKey = "";
    if (soundOn) GameAudio.uiSelect();
    buildSetup();
  };
  btns.append(cancel, save);
  wrap.appendChild(btns);

  container.appendChild(wrap);
  applyPreview();
}

// Monotonic id source for custom liveries (Date.now is fine; avoids collisions
// within a session even if the clock is coarse).
let _livSeq = 0;
function livIdCounter() { _livSeq = (_livSeq + 1) % 1000; return String(Date.now()) + _livSeq; }

// Paint the live 3D preview with an uncommitted draft via the transient
// override (no localStorage writes), then force a mesh rebuild.
function livePreviewDraft(team, d) {
  livDraftOverride = { teamId: team.id, liv: { c1: hexToArr(d.c1), c2: hexToArr(d.c2), stripe: d.stripe ? hexToArr(d.stripe) : null, accent: d.accent ? hexToArr(d.accent) : null,
    nose: d.nose ? hexToArr(d.nose) : null, pod: d.pod ? hexToArr(d.pod) : null, wing: d.wing ? hexToArr(d.wing) : null, halo: d.halo ? hexToArr(d.halo) : null,
    noseStripe: d.noseStripe ? hexToArr(d.noseStripe) : null } };
  _spMeshKey = "";   // bust the setup-preview mesh cache so it repaints
}

function openSetup() {
  buildSetup();
  // #select sits directly under #carsetup and is nearly opaque (blocks the
  // live 3D preview behind the now-transparent, docked setup panel) — hide it
  // while setup is open, same as #overlay is already hidden by the time #select
  // itself is reached. Restored in the cs-done handler below.
  els.select.hidden = true;
  $("carsetup").hidden = false;
  setupPreviewOn = true;
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
  else {
    if (state === "menu") GameAudio.startMusic(-1);
    else if (state === "race") GameAudio.startMusic(trackIdx);
  }
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

// Render resolution setting: AUTO = the frame-time governor adapts the scale;
// LOW/MED/HIGH pin a fixed scale (and disable the governor so it can't fight
// the choice). LOW is also the safe pick on older phones — smaller render
// targets mean more GPU-memory headroom, not just more fps. Persisted.
const RES_MODES = [
  { id: "auto", label: "AUTO" },
  { id: "low",  label: "LOW",  v: 0.5  },
  { id: "med",  label: "MED",  v: 0.75 },
  { id: "high", label: "HIGH", v: 1.0  },
];
let resMode = store.get("resMode", "auto");
function applyResMode() {
  const m = RES_MODES.find((r) => r.id === resMode) || RES_MODES[0];
  const btn = $("pm-res"); if (btn) btn.textContent = "RESOLUTION: " + m.label;
  if (m.v != null) { _autoRes = false; if (gfx.setRenderScale) gfx.setRenderScale(m.v); }
  else _autoRes = true;   // governor takes over from wherever the scale sits now
}
$("pm-res").onclick = () => {
  resMode = RES_MODES[(RES_MODES.findIndex((r) => r.id === resMode) + 1) % RES_MODES.length].id;
  store.set("resMode", resMode);
  applyResMode();
  if (soundOn) GameAudio.uiSelect();
};
applyResMode();

// RENDERER toggle (WebGL2 / WebGPU) — shown only when the browser exposes
// WebGPU. WebGPU is opt-in and browser-untested, so the default stays WebGL2;
// flipping writes apex26.gfxBackend (the raw key gfx.js reads) and reloads so
// Gfx.create() re-runs the backend selection at boot.
(function () {
  const rb = $("pm-renderer");
  if (!rb || typeof navigator === "undefined" || !navigator.gpu) return;
  const read = () => { try { return localStorage.getItem("apex26.gfxBackend") === "webgpu" ? "webgpu" : "webgl2"; } catch (_) { return "webgl2"; } };
  rb.hidden = false;
  rb.textContent = "RENDERER: " + read().toUpperCase();
  rb.onclick = () => {
    if (soundOn) GameAudio.uiSelect();
    const next = read() === "webgpu" ? "webgl2" : "webgpu";
    try { localStorage.setItem("apex26.gfxBackend", next); } catch (_) {}
    rb.textContent = "RENDERER: " + next.toUpperCase() + " — RELOADING…";
    setTimeout(() => location.reload(), 350);
  };
})();

// GRAPHICS quality tier (mobile only). STANDARD keeps the memory-safe mobile
// defaults (half-res liveries, no MSAA, capped DPR); HIGH restores desktop-grade
// quality for capable phones. These are decided at renderer INIT, so the toggle
// persists and reloads. Shown only on mobile — desktop is always full quality.
if (gfx.isMobile) {
  const gfxBtn = $("pm-gfx");
  if (gfxBtn) {
    gfxBtn.hidden = false;
    const gfxHigh = () => { try { return localStorage.getItem("apex26.gfxHigh") === "1"; } catch (_) { return false; } };
    gfxBtn.textContent = "GRAPHICS: " + (gfxHigh() ? "HIGH" : "STANDARD");
    gfxBtn.onclick = () => {
      const next = !gfxHigh();
      try { localStorage.setItem("apex26.gfxHigh", next ? "1" : "0"); } catch (_) {}
      gfxBtn.textContent = "GRAPHICS: " + (next ? "HIGH" : "STANDARD") + " — reloading…";
      if (soundOn) GameAudio.uiSelect();
      // Reload so the renderer re-inits at the new tier (context AA, target
      // formats, atlas sizes are all fixed at startup).
      setTimeout(() => { try { location.reload(); } catch (_) {} }, 260);
    };
  }
}


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
    season = { round: 0, pts: {}, teamPts: {}, driverCodes: {} };
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
// ── LIGHTING TUNER ── opened from the pause menu; the pause menu hides while
// it's open so the live preview is unobstructed (tick() keeps render() running
// with physics paused), and DONE returns to the pause menu. Rows are generated
// once from TUNE_DEFS; values persist via localStorage (apex26.lightTune).
function fmtTune(d, v) {
  if (d.fmt === "auto" && v < 0) return "AUTO";
  const dec = (String(d.step).split(".")[1] || "").length;
  const s = v.toFixed(Math.min(dec, 3));
  return d.fmt === "signed" && v > 0 ? "+" + s : s;
}
// PREVIEW conditions: the tuner tunes GLOBAL values that only take visible
// effect under the right conditions (night sliders do nothing on a day track,
// wet reflections need a wet road). So a track with a FIXED time/weather could
// hide half the controls. These buttons flip the live session's time-of-day and
// weather so every value can be dialled in on any circuit; the original race
// settings are captured on open and restored on DONE, so previewing never
// changes the race you go back to.
let _ltPrevTOD = null, _ltPrevWx = null;
const LT_TODS = ["dawn", "day", "dusk", "night", "default"];
const LT_WX = ["dry", "wet", "rain", "fog", "overcast"];
function refreshLtPreviewActive() {
  const tod = __apex.setTimeOfDay(), wx = __apex.weather();
  for (const t of LT_TODS) { const el = $("lt-tod-" + t); if (el) el.classList.toggle("on", t === tod); }
  for (const w of LT_WX) { const el = $("lt-wx-" + w); if (el) el.classList.toggle("on", w === wx); }
}
// Show which per-condition profile is being edited, e.g. "MONZA · NIGHT · WET".
function updateLtProfileLabel() {
  const host = $("lt-profile"); if (!host) return;
  const key = ltKey();
  if (!key) { host.textContent = ""; return; }
  const [id, tod, wx] = key.split("|");
  const name = (track && track.def && track.def.name) || id;
  const nOver = _ltStore[key] ? Object.keys(_ltStore[key]).length : 0;
  host.textContent = name.toUpperCase() + " · " + tod.toUpperCase() + " · " + wx.toUpperCase() +
    (nOver ? "  (" + nOver + " tuned)" : "  (defaults)");
}
function buildLtPreview() {
  const host = $("lt-preview");
  if (host.dataset.built) return;
  host.dataset.built = "1";
  // Compact one-line-each preset rows: a small inline label + tight chips, so the
  // condition switchers don't eat the top of the panel.
  const mkGroup = (title, ids, labels, onPick, prefix) => {
    const row = document.createElement("div");
    row.className = "lt-preview-row";
    const lb = document.createElement("span"); lb.className = "lt-preview-lbl"; lb.textContent = title;
    row.appendChild(lb);
    ids.forEach((id, i) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn lt-preview-btn"; btn.id = prefix + id; btn.textContent = labels[i];
      // Switching a condition re-applies that condition's profile (via
      // applyRaceSettings→applyLightTune), so reload the sliders + label too.
      btn.onclick = () => { onPick(id); refreshLtPreviewActive(); refreshLightTunePanel(); };
      row.appendChild(btn);
    });
    host.appendChild(row);
  };
  mkGroup("TIME", LT_TODS, ["DAWN", "DAY", "DUSK", "NIGHT", "TRACK"],
    (t) => __apex.setTimeOfDay(t), "lt-tod-");
  mkGroup("WEATHER", LT_WX, ["DRY", "WET", "RAIN", "FOG", "CLOUD"],
    (w) => __apex.weather(w), "lt-wx-");
}
let _ltActiveGroup = null;   // currently-shown tuner category (tab)
// Show one tuner category at a time (tab click). Toggles the .active class on the
// matching group wrapper + its tab chip so only that group's sliders render —
// the panel was an 82-slider scroll before this split it into 12 tabs.
function setLtTab(group) {
  _ltActiveGroup = group;
  const rows = $("lt-rows"), tabs = $("lt-tabs");
  if (rows) for (const g of rows.children) g.classList.toggle("active", g.dataset.group === group);
  if (tabs) for (const t of tabs.children) {
    const on = t.dataset.group === group;
    t.classList.toggle("on", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  }
  if (rows) rows.scrollTop = 0;
}
function buildLightTunePanel() {
  buildLtPreview();
  const host = $("lt-rows"), tabs = $("lt-tabs");
  if (!host.dataset.built) {
    host.dataset.built = "1";
    const groups = [];      // ordered distinct group names
    let group = null, wrap = null;
    for (const d of TUNE_DEFS) {
      if (d.group !== group) {
        group = d.group; groups.push(group);
        wrap = document.createElement("div");
        wrap.className = "lt-group"; wrap.dataset.group = group;
        const h = document.createElement("h3");
        h.className = "adv-sec"; h.textContent = group;
        wrap.appendChild(h);
        host.appendChild(wrap);
      }
      const item = document.createElement("div");
      item.className = "adv-item";
      const lab = document.createElement("label"); lab.className = "tune-row";
      const span = document.createElement("span"); span.className = "tune-label";
      span.textContent = d.label + " ";
      const b = document.createElement("b"); b.id = "lt-v-" + d.id;
      span.appendChild(b);
      const inp = document.createElement("input");
      inp.type = "range"; inp.min = d.min; inp.max = d.max; inp.step = d.step;
      inp.id = "lt-in-" + d.id;
      inp.setAttribute("aria-label", d.label);
      inp.oninput = () => {
        setLightTune(d.id, parseFloat(inp.value));
        b.textContent = fmtTune(d, LT[d.id]);
        persistLightTune();
      };
      lab.appendChild(span); lab.appendChild(inp);
      item.appendChild(lab);
      if (d.help) { const p = document.createElement("p"); p.className = "adv-help"; p.textContent = d.help; item.appendChild(p); }
      wrap.appendChild(item);
    }
    // Build one tab chip per group.
    if (tabs) {
      tabs.textContent = "";
      for (const g of groups) {
        const t = document.createElement("button");
        t.type = "button"; t.className = "lt-tab"; t.dataset.group = g;
        t.textContent = g; t.setAttribute("role", "tab");
        t.onclick = () => setLtTab(g);
        tabs.appendChild(t);
      }
    }
    _ltActiveGroup = groups[0];
  }
  document.getElementById("lighting-inner").classList.toggle("lt-show-help", $("lt-help-on").checked);
  // Restore the last-viewed category (or default to the first).
  setLtTab(_ltActiveGroup || (TUNE_DEFS[0] && TUNE_DEFS[0].group));
  refreshLightTunePanel();
}
function refreshLightTunePanel() {
  for (const d of TUNE_DEFS) {
    const inp = $("lt-in-" + d.id), b = $("lt-v-" + d.id);
    if (inp) inp.value = LT[d.id];
    if (b) b.textContent = fmtTune(d, LT[d.id]);
  }
  updateLtProfileLabel();
}
$("pm-lighting").onclick = () => {
  buildLightTunePanel();
  _ltPrevTOD = __apex.setTimeOfDay();   // capture the race's real conditions
  _ltPrevWx = __apex.weather();
  refreshLtPreviewActive();
  $("lt-json").hidden = true;
  $("lighting").hidden = false;
  document.body.classList.add("lt-open");   // hide race HUD + touch controls underneath
  els.pausemenu.hidden = true;      // unobstructed live preview
};
function closeLightTuner(showPauseMenu) {
  if (photoMode) exitPhotoMode();
  // Restore the race's real time & weather (preview was transient).
  if (_ltPrevTOD != null && __apex.setTimeOfDay() !== _ltPrevTOD) __apex.setTimeOfDay(_ltPrevTOD);
  if (_ltPrevWx != null && __apex.weather() !== _ltPrevWx) __apex.weather(_ltPrevWx);
  _ltPrevTOD = null; _ltPrevWx = null;
  $("lighting").hidden = true;
  document.body.classList.remove("lt-open");   // restore race HUD + touch controls
  if (showPauseMenu && paused) els.pausemenu.hidden = false;
}
$("lt-close").onclick = () => closeLightTuner(true);

// ---------- Photo mode (free-fly camera) ----------
// Seed the fly-cam from the camera currently on screen so it starts exactly
// where the user was, then let them fly. yaw/pitch use view()'s convention:
// dir = (sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch).
function initPhotoCam() {
  photoCam.pos[0] = camEye[0]; photoCam.pos[1] = camEye[1]; photoCam.pos[2] = camEye[2];
  let dx = camTgt[0] - camEye[0], dy = camTgt[1] - camEye[1], dz = camTgt[2] - camEye[2];
  const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  photoCam.pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  photoCam.yaw = Math.atan2(dx, -dz);
  photoCam.fov = camFov;
  const fv = $("pc-fov"); if (fv) fv.value = Math.round(camFov);
  photoMove.x = photoMove.y = photoLook.x = photoLook.y = 0;
  photoMouse.dx = photoMouse.dy = 0; photoMouse.drag = false; photoAlt = 0;
  for (const k in photoKeys) photoKeys[k] = false;
}
// Integrate held input into the fly-cam each paused frame and publish dbgCam.
function updatePhotoCam(dt) {
  const spd = photoKeys.boost ? 95 : 34;          // m/s (Shift = boost)
  const lookRate = 1.7;                           // rad/s for key/stick look
  // Look: arrow keys + touch look stick + mouse drag delta.
  const yawIn   = (photoKeys.yr ? 1 : 0) - (photoKeys.yl ? 1 : 0) + photoLook.x;
  const pitchIn = (photoKeys.pu ? 1 : 0) - (photoKeys.pd ? 1 : 0) - photoLook.y;
  photoCam.yaw   += yawIn * lookRate * dt + photoMouse.dx * 0.0032;
  photoCam.pitch += pitchIn * lookRate * dt - photoMouse.dy * 0.0032;
  photoMouse.dx = 0; photoMouse.dy = 0;
  photoCam.pitch = Math.max(-1.45, Math.min(1.45, photoCam.pitch));
  const cp = Math.cos(photoCam.pitch), sp = Math.sin(photoCam.pitch);
  const fwd = [Math.sin(photoCam.yaw) * cp, sp, -Math.cos(photoCam.yaw) * cp];
  const rgt = [Math.cos(photoCam.yaw), 0, Math.sin(photoCam.yaw)];
  // Move: WASD + touch move stick (forward follows the look pitch); R/F + up/down
  // buttons ride the WORLD vertical so you can climb straight up.
  const mf = (photoKeys.w ? 1 : 0) - (photoKeys.s ? 1 : 0) - photoMove.y;   // stick UP (dy<0) = forward
  const ms = (photoKeys.d ? 1 : 0) - (photoKeys.a ? 1 : 0) + photoMove.x;
  const mv = (photoKeys.up ? 1 : 0) - (photoKeys.dn ? 1 : 0) + photoAlt;
  const k = spd * dt;
  photoCam.pos[0] += (fwd[0] * mf + rgt[0] * ms) * k;
  photoCam.pos[1] += (fwd[1] * mf + mv) * k;
  photoCam.pos[2] += (fwd[2] * mf + rgt[2] * ms) * k;
  const e = photoCam.pos;
  // far: the far plane is the game's ONLY distance cull (chunk AABBs test against
  // the frustum incl. far; fog never culls). 2500 m from altitude framed EVERY
  // chunk of a street circuit — ~1.1 M tris / ~970 draw calls per frame on Vegas,
  // which overflows a mobile TBDR tiler and gets the web app jetsam-killed. Keep
  // 1100 m on mobile (fog hides the edge); desktop can afford the full vista.
  // fog: 1.0 — the 0.15× default at the dbgCam branch was meant for the dev
  // view() hook; the tuner preview should show the REAL race fog anyway.
  dbgCam = { eye: [e[0], e[1], e[2]], target: [e[0] + fwd[0] * 100, e[1] + fwd[1] * 100, e[2] + fwd[2] * 100],
             fov: photoCam.fov, far: gfx.isMobile ? 1100 : 2500, fog: 1.0 };   // not 8000 — a huge far plane wrecks depth precision → z-fighting/flicker
}
// Free-cam is a sub-mode OF the lighting tuner: the tuner panel stays open (docked
// right) so sliders can be adjusted while the camera flies, and the effect is seen
// from any angle. Only the race HUD is hidden (body.photo-mode) to declutter.
function enterPhotoMode() {
  if (photoMode) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  photoMode = true;
  // Lock resolution while flying (no governor stepping — every scale change
  // reallocates the whole post chain). The previous scale is restored on exit
  // (NOT a snap to full res, which was a reallocation burst at the worst moment).
  // Follows the user's RESOLUTION setting as-is — no forced downgrade; the
  // far-plane clamp in updatePhotoCam is what bounds draw volume/GPU cost.
  _autoRes = false;
  _photoPrevScale = gfx.getRenderScale ? gfx.getRenderScale() : 1;
  initPhotoCam();
  document.body.classList.add("photo-mode");
  $("photo-controls").hidden = false;
  const t = $("pc-toggle"); if (t) { t.classList.add("on"); t.innerHTML = "● FREE CAMERA"; }
  window.addEventListener("keydown", photoKeyHandler, true);
  window.addEventListener("keyup", photoKeyHandler, true);
}
function exitPhotoMode() {
  if (!photoMode) return;
  photoMode = false;
  dbgCam = null;                          // hand the game camera back
  document.body.classList.remove("photo-mode", "pc-nopanel", "pc-uihidden");
  $("photo-controls").hidden = true;
  $("lighting-inner").hidden = false;     // un-hide the tuner if it was tucked away
  const pb = $("pc-panel"); if (pb) pb.textContent = "HIDE PANEL";
  const t = $("pc-toggle"); if (t) { t.classList.remove("on"); t.innerHTML = "📷 FREE CAMERA"; }
  window.removeEventListener("keydown", photoKeyHandler, true);
  window.removeEventListener("keyup", photoKeyHandler, true);
  // Restore the pre-photo scale, then re-apply the user's RESOLUTION setting
  // (fixed modes re-pin their scale + keep the governor off; AUTO re-enables it).
  if (gfx.setRenderScale) gfx.setRenderScale(_photoPrevScale || 1);
  applyResMode();
}
// Temporarily tuck the tuner panel away for an unobstructed scene, still flying.
// With the panel gone the right half of the screen frees up, so body.pc-nopanel
// relocates the LOOK stick + up/down column to the bottom-right corner (classic
// dual-stick ergonomics); showing the panel again moves them back left.
function togglePhotoPanel() {
  const p = $("lighting-inner"); if (!p) return;
  const hide = !p.hidden;
  p.hidden = hide;
  document.body.classList.toggle("pc-nopanel", hide);
  const pb = $("pc-panel"); if (pb) pb.textContent = hide ? "SHOW PANEL" : "HIDE PANEL";
  if (soundOn) GameAudio.uiTick();
}
// Photo-mode HIDE HUD: hide every control (bar, sticks, tuner panel) for a
// clean frame; the tiny top-right eye brings it all back. Keys keep flying.
function setPhotoUiHidden(hide) {
  document.body.classList.toggle("pc-uihidden", hide);
  if (soundOn) GameAudio.uiTick();
}
// Dedicated key handler (not Input.onKey) so photo controls never touch driving.
function photoKeyHandler(e) {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (e.code !== "Escape" && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;  // typing in a slider
  const down = e.type === "keydown";
  let hit = true;
  switch (e.code) {
    case "KeyW": photoKeys.w = down; break;
    case "KeyS": photoKeys.s = down; break;
    case "KeyA": photoKeys.a = down; break;
    case "KeyD": photoKeys.d = down; break;
    case "KeyR": case "Space": photoKeys.up = down; break;
    case "KeyF": photoKeys.dn = down; break;
    case "ArrowUp": photoKeys.pu = down; break;
    case "ArrowDown": photoKeys.pd = down; break;
    case "ArrowLeft": photoKeys.yl = down; break;
    case "ArrowRight": photoKeys.yr = down; break;
    case "ShiftLeft": case "ShiftRight": photoKeys.boost = down; break;
    case "Escape": if (down) setPaused(false); hit = true; break;
    default: hit = false;
  }
  if (hit) { e.preventDefault(); e.stopPropagation(); }
}
// Virtual thumbstick: pointer offset from centre → normalised (−1..1) vector.
function wirePhotoStick(id, vec) {
  const el = $(id); if (!el) return;
  const nub = el.querySelector(".pc-nub");
  let pid = null;
  const set = (cx, cy) => {
    const r = el.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (cx - (r.left + rad)) / rad, dy = (cy - (r.top + rad)) / rad;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    vec.x = dx; vec.y = dy;
    if (nub) nub.style.transform = "translate(" + (dx * rad * 0.6) + "px," + (dy * rad * 0.6) + "px)";
  };
  const end = () => { vec.x = 0; vec.y = 0; pid = null; if (nub) nub.style.transform = "translate(0,0)"; };
  el.addEventListener("pointerdown", (e) => { pid = e.pointerId; el.setPointerCapture(pid); set(e.clientX, e.clientY); e.preventDefault(); });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === pid) { set(e.clientX, e.clientY); e.preventDefault(); } });
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
function wirePhotoHold(id, on, off) {
  const el = $(id); if (!el) return;
  el.addEventListener("pointerdown", (e) => { on(); e.preventDefault(); });
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  el.addEventListener("pointerleave", off);
}
wirePhotoStick("pc-move", photoMove);
wirePhotoStick("pc-look", photoLook);
wirePhotoHold("pc-up", () => photoAlt = 1, () => photoAlt = 0);
wirePhotoHold("pc-down", () => photoAlt = -1, () => photoAlt = 0);
// Drag anywhere on the scene (outside the sticks) to look — mouse or a spare finger.
{
  const canvas = $("game");
  if (canvas) {
    canvas.addEventListener("pointerdown", (e) => {
      if (!photoMode) return;
      photoMouse.drag = true; photoMouse.px = e.clientX; photoMouse.py = e.clientY;
    });
    window.addEventListener("pointermove", (e) => {
      if (!photoMode || !photoMouse.drag) return;
      photoMouse.dx += e.clientX - photoMouse.px; photoMouse.dy += e.clientY - photoMouse.py;
      photoMouse.px = e.clientX; photoMouse.py = e.clientY;
    });
    window.addEventListener("pointerup", () => { photoMouse.drag = false; });
  }
}
$("pc-toggle").onclick = () => { if (soundOn) GameAudio.uiSelect(); photoMode ? exitPhotoMode() : enterPhotoMode(); };
$("pc-exit").onclick = () => { if (soundOn) GameAudio.uiTick(); exitPhotoMode(); };
$("pc-panel").onclick = togglePhotoPanel;
$("pc-hud").onclick = () => setPhotoUiHidden(true);
$("pc-restore").onclick = () => setPhotoUiHidden(false);
$("pc-fov").oninput = (e) => { photoCam.fov = +e.target.value; };
$("lt-help-on").onchange = (e) => {
  document.getElementById("lighting-inner").classList.toggle("lt-show-help", e.target.checked);
};
$("lt-reset").onclick = () => {
  // Drop this condition's LOCAL edits so it falls back to the shipped file /
  // defaults (leaves other conditions and the file untouched).
  const key = ltKey();
  if (key && _ltStore[key]) delete _ltStore[key];
  persistLightTune();
  applyLightTune();
  refreshLightTunePanel();
  $("lt-json").hidden = true;
};
$("lt-copy").onclick = () => {
  // Export the FULL set (shipped file merged with every local edit, local
  // winning) as the paste-ready body for js/light-presets.js — replace that
  // file's `window.LightPresets = {…}` literal with this to bake it in.
  const merged = {};
  const F = window.LightPresets || {};
  for (const k in F) merged[k] = Object.assign({}, F[k]);
  for (const k in _ltStore) merged[k] = Object.assign(merged[k] || {}, _ltStore[k]);
  // Drop any now-empty condition maps for a clean file.
  for (const k in merged) if (!Object.keys(merged[k]).length) delete merged[k];
  const json = "window.LightPresets = " + JSON.stringify(merged, null, 2) + ";";
  const ta = $("lt-json");
  ta.value = json; ta.hidden = false;
  ta.focus(); ta.select(); ta.setSelectionRange(0, json.length);   // iOS needs the explicit range
  const btn = $("lt-copy");
  const flash = (ok) => {
    btn.textContent = ok ? "COPIED ✓" : "SELECT & COPY ↑";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
  };
  // Auto-copy: prefer the async Clipboard API (the button click is the required
  // user gesture); fall back to execCommand on the selected textarea for older
  // mobile / installed-PWA webviews where navigator.clipboard is unavailable or
  // rejects. The textarea stays visible either way as a manual fallback.
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(() => flash(true), () => {
      let ok = false; try { ok = document.execCommand && document.execCommand("copy"); } catch (e) {}
      flash(ok);
    });
  } else {
    let ok = false; try { ok = document.execCommand && document.execCommand("copy"); } catch (e) {}
    flash(ok);
  }
};
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
  for (const [id, label, icon] of [["dry", "DRY", "☀"], ["wet", "WET", "💧"], ["rain", "RAIN", "🌧"], ["overcast", "CLOUDY", "☁"], ["fog", "FOG", "🌫"]]) {
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
// Optional extra-paint rows: DOM colour-input id -> livery key. Saved onto the
// custom team as ct.livery, which Liveries.forTeam folds into its default paint.
const CZ_LIV_FIELDS = [
  ["cz-stripe", "stripe"], ["cz-nosestripe", "noseStripe"], ["cz-detail", "accent"],
  ["cz-nose", "nose"], ["cz-pod", "pod"], ["cz-wing", "wing"], ["cz-halo", "halo"],
];
// A field is "NONE" when its colour input carries the cz-off class.
function czSetLivField(domId, arr) {
  const inp = $(domId), none = $(domId + "-none");
  if (arr) { inp.value = rgbToHex(arr); inp.classList.remove("cz-off"); none.classList.remove("active"); }
  else { inp.value = inp.value && /^#[0-9a-fA-F]{6}$/.test(inp.value) ? inp.value : "#ffffff"; inp.classList.add("cz-off"); none.classList.add("active"); }
}
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
  const liv = ct.livery || {};
  CZ_LIV_FIELDS.forEach(([domId, key]) => czSetLivField(domId, liv[key] || null));
  czPreview();
  els.customize.hidden = false;
}
["cz-name", "cz-short", "cz-color", "cz-color2", "cz-code", "cz-num"].forEach((id) => {
  $(id).addEventListener("input", czPreview);
});
// Extra-paint rows: editing the swatch re-enables the field; NONE clears it.
CZ_LIV_FIELDS.forEach(([domId]) => {
  $(domId).addEventListener("input", () => { $(domId).classList.remove("cz-off"); $(domId + "-none").classList.remove("active"); });
  $(domId + "-none").onclick = () => { $(domId).classList.add("cz-off"); $(domId + "-none").classList.add("active"); if (soundOn) GameAudio.uiTick(); };
});
els.selCustomize.onclick = () => { if (soundOn) GameAudio.uiSelect(); openCustomize(); };
$("sel-setup").onclick = () => { if (soundOn) GameAudio.uiSelect(); openSetup(); };
$("cs-done").onclick = () => {
  $("carsetup").hidden = true;
  els.select.hidden = false;
  setupPreviewOn = false;
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
  const prev = loadCustomTeam();
  const ct = {
    id: "custom", engine: "Custom", tier: 2, custom: true,
    name: clean($("cz-name").value, "My Team", 22),
    short: clean($("cz-short").value, "YOU", 4).toUpperCase(),
    color: hexToRgb($("cz-color").value),
    color2: hexToRgb($("cz-color2").value),
    stats: prev.stats || DEFAULT_CUSTOM.stats,
    drivers: [{
      name: clean($("cz-driver").value, "Your Name", 22),
      code: clean($("cz-code").value, "YOU", 3).toUpperCase(),
      num: clamp(parseInt($("cz-num").value, 10) || 99, 0, 99),
    }],
  };
  // Optional extra paint -> ct.livery (only the fields that aren't NONE).
  const liv = {};
  CZ_LIV_FIELDS.forEach(([domId, key]) => { if (!$(domId).classList.contains("cz-off")) liv[key] = hexToRgb($(domId).value); });
  if (Object.keys(liv).length) ct.livery = liv;
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
        const sorted = cars.slice().sort((a, b) => (season.pts[b.driverId] || 0) - (season.pts[a.driverId] || 0));
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
          const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (season.pts[c.driverId] || 0) + " pts";
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
  if (!p) closeLightTuner(false);
  els.pausemenu.hidden = !p;
  if (els.pmStandings) els.pmStandings.hidden = !(seasonMode && season && season.round > 0);
  if (!p) $("advanced").hidden = true;   // never leave an overlay up after resume
  if (p) { GameAudio.stopEngine(); GameAudio.setSkid(0); }
  else if (soundOn) GameAudio.startEngine();
  lastFrame = performance.now();
}
els.pausebtn.onclick = () => setPaused(true);

// ---- Hide-HUD (clean-screen) mode ----
// "HIDE HUD" (pause menu) strips every overlay via a body class (see style.css)
// for a cinematic/clean view; the small #hud-restore eye is the only thing left
// and brings it all back. Session-only — reset to shown on each race start.
function setHudUserHidden(v) {
  document.body.classList.toggle("hud-hidden", !!v);
  const btn = $("pm-hidehud");
  if (btn) btn.textContent = v ? "SHOW HUD" : "HIDE HUD";
}
$("pm-hidehud").onclick = () => {
  const willHide = !document.body.classList.contains("hud-hidden");
  setHudUserHidden(willHide);
  if (willHide) setPaused(false);   // clean screen — drop the menu so you can actually see it
};
$("hud-restore").onclick = () => setHudUserHidden(false);

// ---- player camera modes (CAM button / C key) ----
function refreshCamBtn() {
  const b = $("btn-cam");
  if (b) b.textContent = CAM_MODES[camMode].label;
  // Cockpit view: the gear/speed/rpm live ON the wheel LCD — hide the floating
  // HUD duplicates (CSS keys off this class).
  document.body.classList.toggle("cockpit-cam", CAM_MODES[camMode].id === "cockpit");
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
// CAM button: quick tap cycles (muscle memory preserved); press-and-hold (or
// right-click) opens a PICKER GRID of all modes — cycling one-by-one through
// 14 cameras to reach the one you want was the worst switch in the game.
const camPicker = (() => {
  let el = null;
  const build = () => {
    el = document.createElement("div");
    el.id = "campicker";
    el.hidden = true;
    for (let i = 0; i < CAM_MODES.length; i++) {
      const b = document.createElement("button");
      b.textContent = CAM_MODES[i].label;
      b.dataset.idx = i;
      b.onclick = (e) => { e.stopPropagation(); setCamMode(+b.dataset.idx); hide(); };
      el.appendChild(b);
    }
    document.body.appendChild(el);
  };
  const sync = () => {
    for (const b of el.children) b.classList.toggle("active", +b.dataset.idx === camMode);
  };
  const show = () => { if (!el) build(); sync(); el.hidden = false; };
  const hide = () => { if (el) el.hidden = true; };
  const visible = () => !!el && !el.hidden;
  return { show, hide, visible };
})();
(() => {
  const b = $("btn-cam");
  if (!b) return;
  let holdT = 0, held = false;
  const HOLD_MS = 340;
  b.addEventListener("pointerdown", () => {
    held = false;
    holdT = setTimeout(() => { held = true; camPicker.show(); }, HOLD_MS);
  });
  b.addEventListener("pointerup", () => clearTimeout(holdT));
  b.addEventListener("pointerleave", () => clearTimeout(holdT));
  b.addEventListener("contextmenu", (e) => { e.preventDefault(); camPicker.show(); });
  // Cycle on CLICK (not pointerup): synthetic .click() from tests/assistive tech
  // works unchanged, and a real tap fires it after pointerup anyway. When the
  // hold already opened the picker, swallow that one trailing click.
  b.onclick = () => {
    if (held) { held = false; return; }
    if (camPicker.visible()) { camPicker.hide(); return; }
    cycleCam();
  };
  // Tap anywhere outside the grid closes it.
  document.addEventListener("pointerdown", (e) => {
    if (camPicker.visible() && e.target !== b && !e.target.closest("#campicker")) camPicker.hide();
  });
})();
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
migrateSeasonPoints();
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
window.addEventListener("resize", () => gfx.resize());
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
    // Normalize frac to [0,1) so s (wrapped) and prog stay coupled even if the
    // caller passes a value outside the unit range.
    const f01 = (((frac || 0) % 1) + 1) % 1;
    player.s = wrapS(f01 * track.total);
    player.prog = f01 * track.total;
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
    dbgCam = null;   // snapping the game camera clears any view() free-cam override
    snapGameCam();
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
  // sectors: [s1End, s2End] racing-lap fractions; turns: curated FIA turn count.
  info: () => ({
    state, track: (state === "race" || state === "count") ? (track && track.def.id) : null,
    n: track && track.n, total: track && track.total, timeTrial, seasonMode,
    sectors: track && track.def && track.def.sectors ? track.def.sectors.slice() : null,
    turns: track && track.def && track.def.turns ? track.def.turns.length : null,
  }),
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
  // studio(opts?) — summon a studio light rig around the player car for paint /
  // reflection inspection on any track at any time of day. Follows the car.
  //   studio()                         → default 6-lamp ring + overhead key
  //   studio({ n, dist, h, intensity, color: [r,g,b], radius, spin })
  //   studio(false)                    → off (session lamps restored)
  // Pair with carOrbit(0, az, el, 4) to walk around the lit car.
  studio(arg = true) {
    if (arg === false || arg === 0) {
      if (_studioRig && _studioRig._ambStash) {   // restore the session ambient
        frame.ambientSky = _studioRig._ambStash[0];
        frame.ambientGround = _studioRig._ambStash[1];
      }
      _studioRig = null;
      return false;
    }
    const o = typeof arg === "object" && arg ? arg : {};
    if (_studioRig && _studioRig._ambStash) {     // re-config: restore before re-stash
      frame.ambientSky = _studioRig._ambStash[0];
      frame.ambientGround = _studioRig._ambStash[1];
    }
    _studioRig = {
      n: o.n || 6, dist: o.dist || 7, h: o.h != null ? o.h : 4.5,
      intensity: o.intensity != null ? o.intensity : 1.6,
      color: o.color || [1, 1, 1], radius: o.radius || 18, spin: o.spin || 0,
      fill: o.fill != null ? o.fill : 0.5,
    };
    // FILL: lift the scene ambient toward a neutral studio level while the rig
    // is up — at night the ambient is near-black and an unlit car body reads as
    // a silhouette no matter how many rig lamps hit it. Stashed + restored by
    // studio(false). (setTimeOfDay() while active rebuilds ambient — call
    // studio() again after switching time of day.)
    const f = _studioRig.fill;
    if (f > 0) {
      _studioRig._ambStash = [frame.ambientSky, frame.ambientGround];
      const mixv = (a, b) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      frame.ambientSky = mixv(frame.ambientSky || [0, 0, 0], [0.30, 0.31, 0.35]);
      frame.ambientGround = mixv(frame.ambientGround || [0, 0, 0], [0.20, 0.19, 0.18]);
    }
    return _studioRig;
  },
  carOrbit(idx = 0, az = 180, el = 14, dist = 25, h = 1.0, opts = {}) {
    // idx 0 (or negative) = THE PLAYER, as documented — cars[] is built in
    // team-list order, so raw index 0 is actually a Mercedes AI; orbiting it
    // while the player parks elsewhere framed the wrong car entirely.
    if (!track || !cars || !cars.length) return false;
    const c = (idx <= 0 || !cars[idx]) ? (player || cars[0]) : cars[idx];
    if (!c) return false;
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
    // az 0 = camera BEHIND the car (eye along -forward), az 180 = head-on,
    // az 90 = off the car's right side — matches the documented convention
    // (the pre-fix implementation had az 0 ahead of the car).
    const dir = [-Math.cos(a) * fwdX + Math.sin(a) * rtX, 0, -Math.cos(a) * fwdZ + Math.sin(a) * rtZ];
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
    if (ai.length < 2) return false;   // needs ≥2 AI cars — unavailable in time trial
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
  // Lap fractions of curvature-peak apexes (local maxima of |curvature|).
  // Distinct from curated FIA turns on track.def.turns / info().turns — use those
  // for official turn counts; this hook is for physics/parking at sharp bends.
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
  // ("dry" | "wet" | "rain" | "overcast" | "fog"). "wet" = damp road, no rain;
  // "rain" = wet road + falling rain. Skips menus so a harness can render any track.
  race(trackRef, timeOfDay, weather) {
    const i = typeof trackRef === "number"
      ? trackRef
      : Tracks.LIST.findIndex((t) => t.id === trackRef);
    if (i == null || i < 0 || i >= Tracks.LIST.length) return false;
    trackIdx = i;
    seasonMode = false;
    timeTrial = false;
    raceLaps = GAME_LAPS;
    raceWeather = (weather === "wet" || weather === "rain" || weather === "overcast" || weather === "fog") ? weather : "dry";
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
    for (let i = 0; i < count; i++) {
      // Keep the render-interpolation anchors in sync (the render-driven loop
      // snapshots these before each step; a manual pump must too, or a frozen
      // render afterwards lerps toward a stale pre-teleport position).
      for (let j = 0; j < cars.length; j++) { const c = cars[j]; c.rPrevS = c.s; c.rPrevX = c.x; }
      update(d);
    }
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
  finishRace() {
    if (!track || state === "results" || state === "menu") return false;
    const order = cars.slice().sort((a, b) => b.prog - a.prog);
    cars.forEach((c) => { if (!c.finished) { c.finished = true; c.finishT = raceT; } });
    endRace(order);
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

  // Get or set race weather ("dry" | "wet" | "rain" | "overcast" | "fog").
  // "wet" = damp track (wet road, no falling rain); "rain" = wet road + falling
  // rain + lightning. Toggles the rain layer + audio live for mid-race changes.
  weather(w) {
    if (w === undefined) return raceWeather;
    return setWeatherLive(w);   // shared live path (rain layer, audio, lighting)
  },

  // Dynamic weather progression: weatherArc(from, to, seconds) arms a scripted
  // transition that walks the dry↔wet↔rain ladder over `seconds` of race time
  // (fog/overcast jump direct), flipping each stage through the same live
  // weather path as weather(w). weatherArc() → current arc snapshot or null;
  // weatherArc(null) cancels an armed arc (weather stays wherever it got to).
  weatherArc(from, to, seconds) {
    if (from === undefined) {
      return weatherArc ? { from: weatherArc.from, to: weatherArc.to, t: weatherArc.t,
                            dur: weatherArc.dur, weather: raceWeather, wetness: frame.wetness || 0 } : null;
    }
    if (from === null || from === false) { weatherArc = null; return null; }
    const arc = startWeatherArc(from, to, seconds);
    return arc ? { from: arc.from, to: arc.to, t: arc.t, dur: arc.dur, weather: raceWeather } : null;
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
      energy: +(c.energy || 0).toFixed(3), boostOn: !!c.boostOn,
      brakeHeat: +(c.brakeHeat || 0).toFixed(2), gear: c.gear || 1,
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
    numLights: frame.lights ? frame.lights.length / 15 : 0,
    sunY: frame.sunDir ? frame.sunDir[1] : null,
    builtNight: builtTrackNight, trackNight: track && track._night,
    floodEmit: _lastFloodEmit,   // actual prop-emissive ramp value this frame
    envProbe: (gfx && gfx.envProbeReady) ? gfx.envProbeReady() : null,  // live env-cube captured?
    fogDensity: frame.fogDensity,
    fogColor: frame.fogColor && frame.fogColor.slice(),
    skyHorizon: frame.skyHorizon && frame.skyHorizon.slice(),
    frameSkyHorizon: frameSky.horizon && frameSky.horizon.slice(),
    skySunColor: frameSky.sunColor && frameSky.sunColor.slice(),
    skySunDir: frameSky.sunDir && frameSky.sunDir.slice(),
    skyStars: frameSky.stars, skyMoon: frameSky.moon,
  }),
  // GPU frame-time probe (Chrome/Android only; iOS Safari lacks the timer
  // extension). gpuTimer(true) starts timing, gpuTimer(false) stops, gpuTimer()
  // reads the latest sample: { supported, on, ms } where ms is the GPU cost of a
  // recent frame (-1 until a result lands, a few frames after enabling). This is
  // the GPU-side counterpart to the CPU flame chart — use it to tell whether
  // night-track spikes are GPU-bound (fragment/fill) before deciding on
  // instancing vs shader work vs WebGPU.
  gpuTimer: (on) => {
    if (!gfx || !gfx.gpuTimer) return { supported: false, on: false, ms: -1 };
    const st = gfx.gpuTimer(on);
    return { supported: st.supported, on: st.on, ms: gfx.gpuMs ? gfx.gpuMs() : -1 };
  },
  // lightTune(o?) — get or set the live lighting-tuner values (same registry as
  // the pause-menu LIGHTING TUNER panel). No args: returns {id: value} for every
  // tunable. With an object: merges valid entries (clamped to each slider's
  // range), persists, invalidates baked light records where needed, and returns
  // the updated set. lightTune({wetness: 0.8}) pins road wetness instantly;
  // lightTune({wetness: -0.05}) returns it to the weather-driven ramp.
  lightTune(o) {
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) setLightTune(k, o[k]);
      persistLightTune();
      if (typeof refreshLightTunePanel === "function") refreshLightTunePanel();
    }
    const out = {};
    for (const d of TUNE_DEFS) out[d.id] = LT[d.id];
    return out;
  },
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

  // renderScale(v?) — adaptive-resolution control. No arg: report current state
  // { scale, fps, auto }. Number: pin the 3D render scale (0.5–1) and disable
  // the auto-governor. true: re-enable the governor. Lower scale = big fill-rate
  // win (softer 3D view; HUD stays crisp).
  renderScale(v) {
    if (v === undefined) return { scale: gfx.getRenderScale(), fps: +(1000 / Math.max(1, _frameEMA)).toFixed(1), auto: _autoRes };
    if (v === true) { _autoRes = true; return this.renderScale(); }
    _autoRes = false; gfx.setRenderScale(+v); return this.renderScale();
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
    // A rescue teleport resets rescueT to 0 the instant it fires (threshold >3), so
    // the old rescueT>8 test could never trip. Signal "done" briefly after a rescue.
    const done = !!player.wrongWay ||
      (player.rescueLastT != null && (raceT - player.rescueLastT) < 0.5);

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
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < cars.length; j++) { const c = cars[j]; c.rPrevS = c.s; c.rPrevX = c.x; }
      update(d);
    }
    return this.obs();
  },

  // ── Timing & field hooks ──────────────────────────────────────────────────

  // sectorState() — live S1/S2/S3 timing (boundaries from CircuitMarkings via
  // sectorAt). idx: current sector (0=S1, 1=S2, 2=S3). elapsed: seconds into it.
  // bests: PB per sector (null until that sector is completed with lap ≥ 1).
  // last: times from the most recently completed sector crossings.
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
    const f01 = ((((frac != null ? frac : 0)) % 1) + 1) % 1;   // keep s and prog coupled
    c.s    = wrapS(f01 * track.total);
    c.prog = (c.lap || 0) * track.total + f01 * track.total;
    if (x     !== undefined) { c.x = x; c.xVis = x; }
    if (speed !== undefined) c.speed = speed;
    c.vLat = 0; c.yawRateCur = 0;
    Tracks.sample(track, c.s, smp2);
    c.head = Math.atan2(smp2.t[0], smp2.t[2]);
    return { id: idx, frac: +(c.s / track.total).toFixed(4), speed: +c.speed.toFixed(2), x: +c.x.toFixed(3) };
  },

  // setEnergy(v) — set player ERS charge (0..1). Clamps silently.
  // setBoost(on) — toggle the player's ERS boost (for tests/screenshots).
  setBoost(on) { if (player) player.boostOn = !!on; return player ? player.boostOn : false; },
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
    const f01 = ((((frac != null ? frac : 0)) % 1) + 1) % 1;   // keep s and prog coupled
    player.s     = wrapS(f01 * track.total);
    player.prog  = f01 * track.total;
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
    player.rPrevS = player.s; player.rPrevX = player.x;   // sync render anchors (see jump)
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
