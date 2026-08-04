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
  let pref = null;
  try { pref = localStorage.getItem("apex26.gfxBackend"); } catch (_) {}
  // "webgpu" -> WGX (frozen, needs navigator.gpu); "three" -> TLX (three.js/TSL,
  // self-falls-back to WebGL2 inside three so no capability gate here).
  const optIn = pref === "three" || (pref === "webgpu" && navigator.gpu);
  if (optIn && typeof Gfx !== "undefined") {
    const backend = await Gfx.create(canvas, {});
    if (backend) {
      // Route EVERY renderer call site onto the selected backend. game.js and
      // tracks.js already take the backend by injection (game.js via the `gfx`
      // handle; tracks.js via Tracks.build's opts.gfx), so they need no patch.
      // The descriptor-copy below exists ONLY for the ~8 spec files that
      // monkey-patch GLX.* by OBJECT IDENTITY (webgl-probes, parts-mesh-cache,
      // custom-team, lighting-ab, …) and read the page-scope GLX global
      // directly — identity IS the compatibility contract. Copy the backend's
      // methods + live getters (width/height/aspect) onto the GLX object so
      // `GLX.foo()` anywhere delegates. GLX's own WebGL context is never
      // initialised here. (liverytex/ghost/car3d do NOT call GLX — they build
      // raw {pos,nrm,col,idx} geometry that game.js uploads via the gfx handle.)
      try { Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend)); gfx = GLX; }
      catch (_) { gfx = null; }
    }
  }
} catch (_) { gfx = null; }
if (!gfx) {
  if (!GLX.init(canvas)) {
    // A failed backend opt-in (WGX or TLX) may have already CLAIMED the canvas
    // (getContext "webgpu"/"webgl2" succeeded before init died) — then
    // getContext("webgl2") can never attach on this load and the old path
    // dead-ended at "needs WebGL2" forever. Clear the opt-in and reload once,
    // the same recovery WGX's device-lost handler uses; the reset flag
    // guarantees no reload loop.
    let backendTried = false;
    try { const p = localStorage.getItem("apex26.gfxBackend"); backendTried = p === "webgpu" || p === "three"; } catch (_) {}
    if (backendTried) {
      try { localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) {}
      try { location.reload(); } catch (_) {}
      return;
    }
    $("nogl").hidden = false; return;
  }
  gfx = GLX;
}
// Baked asset pack (js/render/assets.js). Bind the resolved backend, then kick
// the material-array load WITHOUT awaiting it: a pack is optional, the load is
// feature-detected per backend, and every failure path inside leaves the game
// on its procedural materials. Boot must never wait on, or fail for, assets.
if (typeof Assets !== "undefined") {
  Assets.init(gfx);
  // Loaded unconditionally at boot. A lazy "only fetch when matTexMix > 0" path
  // was tried and removed: with the knob ON by default nobody can turn it off
  // BEFORE their first load, so the pack is always fetched at least once, and
  // from then on sw.js serves it from cache. The guard could not save anyone
  // anything — it was complexity with no beneficiary.
  Assets.load();
  // Models also prefetch, but for a different reason: prop placement is SYNCHRONOUS
  // (buildProps -> the circuit's scenery() callback), so it must not depend on
  // network timing — a circuit that asks for a model that has not landed gets
  // nothing placed rather than a differently-built track. The manifest is a
  // single small fetch and resolves to nothing when no models are baked.
  Assets.loadModels();
}

// ---------- rain overlay ----------
// The 2D falling-streak overlay lives in js/game/particles.js (Particles.rain*).
// game.js decides the weather tier and hands booleans/speed in.
let _lastFloodEmit = 0;   // prop-emissive ramp actually used this frame (debug: lightState)
function initRainDrops() {
  // DRIZZLE tier: "wet" (damp track, no storm) — sparse/short/slow streaks.
  Particles.rainSeed(isWetRoad() && !isRaining());
}

// ---------- settings ----------
// Persistence lives in js/game/store.js (GameStore): the cached localStorage
// wrapper, the TT leaderboard, season identity/migration, hex<->rgb.
const { store, ttBoard, ttBoardAdd, hexToRgb, rgbToHex, seasonDriverId, seasonRoster } = GameStore;

const { DEFAULT_CUSTOM } = GameTables;
function loadCustomTeam() { return store.get("customTeam", DEFAULT_CUSTOM); }
function invalidateCustomMeshCache(cache, order) {
  Object.keys(cache).forEach((key) => {
    if (key.indexOf("custom:") !== 0) return;
    if (cache[key] && gfx.freeMesh) gfx.freeMesh(cache[key]);
    delete cache[key];
    if (order) {
      const i = order.indexOf(key);
      if (i >= 0) order.splice(i, 1);
    }
  });
}
// Bound a key→mesh cache to `max` most-recent entries. Evicted meshes are freed
// via gfx.freeMesh exactly once (deleted from the map before free). `freeOne`
// optional — defaults to freeMesh(mesh); wheel pairs pass a custom freer.
function putBoundedMesh(cache, order, key, create, max, freeOne) {
  if (cache[key]) {
    if (order[order.length - 1] !== key) {
      const i = order.indexOf(key);
      if (i >= 0) order.splice(i, 1);
      order.push(key);
    }
    return cache[key];
  }
  const mesh = create();
  cache[key] = mesh;
  order.push(key);
  const free = freeOne || ((m) => { if (m && gfx.freeMesh) gfx.freeMesh(m); });
  while (order.length > max) {
    const old = order.shift();
    const victim = cache[old];
    delete cache[old];
    free(victim);
  }
  return mesh;
}
function syncCustomTeam() {
  const i = Teams.LIST.findIndex((t) => t.id === "custom");
  if (i >= 0) Teams.LIST.splice(i, 1);
  Teams.LIST.push(loadCustomTeam());
  invalidateDecalTextures("custom");
  invalidateCustomMeshCache(teamMeshes);
  invalidateCustomMeshCache(playerBodies, playerBodyOrder);
  invalidateCustomMeshCache(cockpitBodies, cockpitBodyOrder);
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
function migrateSeasonPoints() { season = GameStore.migrateSeasonPoints(season); }

// ---------- physics constants ----------
const VMAX = 72;            // m/s base (~259 km/h) — F1 race pace; scales all speeds
const ACCEL = 7;            // m/s^2 at low speed
// Global pace multiplier on top speed AND acceleration, applied to EVERY car
// (player + AI) so the whole field speeds up/slows down together and the racing
// stays competitive. 1.0 = stock. Driven by the OVERALL SPEED slider.
let PACE = 1.0;
// PACE scales the car's real GROUND speed and nothing else. It used to shrink the
// whole envelope the player sees along with it, because every threshold and
// normaliser in here was written against the bare VMAX: at pace 2 the top speed is
// ~45 m/s, which sits inside 6th gear's band, so 7th and 8th were unreachable, the
// tach never left the middle of its sweep and the dial topped out at ~162 km/h.
// (Symmetrically, above pace ~1.02 the MANUAL gearbox's top-gear limiter pinned the
// car at gearHi(8) + 1.5 = 73.5 m/s and swallowed the slider entirely.)
//
// So: vTop() is where the envelope actually tops out in m/s, and vStd() re-expresses
// a real speed on the STANDARD (pace-5) scale. Normalisers divide by vTop();
// hard-coded speed thresholds compare against vStd(speed). Every constant below —
// VMAX, GEAR_TOP, TAPER_LO/HI, GRASS_V, STEER_SPEED_REF, the bare 20/18 literals —
// keeps exactly the value and meaning it has always had, and the gearbox, tach,
// dial and speed-driven effects span their full range at any setting. The slider
// changes what each of those speeds MEANS on the ground, not the range.
// PACE is floored so a setPhysics({pace:0}) can't divide by zero.
function vTop()  { return VMAX * Math.max(PACE, 0.05); }
function vStd(v) { return v * VMAX / vTop(); }
function dashKph(v) { return vStd(v) * 3.6; }
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
// AERODYNAMIC DOWNFORCE. Grip used to FALL with speed (gripScale: 1.00 at 10 m/s
// down to 0.72 at VMAX) — an arcade understeer taper, and backwards for a car
// with wings. Aero load rises with v², so a real F1 car pulls roughly 2 g in a
// slow corner and 5 g in a fast one; this model did the opposite, which is why
// quick corners felt vague and slow ones felt sharp. Lateral grip is now
// 1 + DOWNFORCE·(v/VMAX)², so high-speed cornering firms up the way it should.
const DOWNFORCE = 0.65;     // extra grip fraction at VMAX (0 = no wings)
// Lateral grip OFF the racing surface. muBase had no off-track term at all, so
// grass and gravel cornered exactly like tarmac and only scrubbed forward speed —
// you could take a run-off at full lateral grip. Faded in over the first ~1.5 m
// past the edge so the transition is continuous, not a step.
const OFF_GRIP = 0.42;      // fraction of tarmac lateral grip on grass/gravel
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
//
// DEFAULT 0 — OPT-IN. This used to ship at 0.7, with a slider that bottomed out
// at 0.25, so a quarter to a half of every corner was steered for you and there
// was no way to turn it off. At 50 m/s through a 100 m corner that is ~20 % of
// your available lock applied by the game; in a slow corner nearer 40 %. You felt
// it as a car that resisted your inputs and pulled toward the road — driving
// against an invisible hand. The assist still exists, and RELAX still turns it
// on, but nothing steers the car by default except the driver.
let ROAD_FOLLOW = 0;
// Gain on the RACING LINE assist's pure-pursuit steer term (see the assist block
// in updateCar). 1 = textbook pursuit — reach the line in exactly one look-ahead
// distance; a little over that so the slider's top notch has real authority
// without the assist ever outrunning the front tyre.
const LINE_PURSUIT = 2.6;
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
// Tracks.project() search used to do, and why this code once integrated in the
// road frame instead. Keeping the search local buys the robustness of the road
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
// (chassis cornering-lean cap now lives in js/game/bodyattitude.js as ROLL_MAX)
const WHEEL_R = 0.34;         // wheel radius (m) — matches Car3D geometry, for spin rate
const WHEEL_STEER_VIS = 0.5;  // rad of visible front-wheel steer at full lock
const GRASS_V = 18;         // crawl speed on grass
const KERB_SHAKE = 0.22;    // sustained kerb rumble trauma (was inline 0.3): amt =
                            //   shake²·0.9 drops 0.081 → 0.044 m of random eye jitter;
                            //   crash-shake writers are untouched.
const KERB_CUE_HOLD = 0.10; // s — bridges the ~20 Hz per-node flicker of the raw
                            //   onKerb flag (~2 node periods at 300 km/h) so the
                            //   rumble/shake/haptic cue can't machine-gun on/off.
const DEPLOY_A = 3.0;       // extra accel from electric deploy
const TAPER_LO = 41, TAPER_HI = 53;  // deploy tapers to 0 across this speed band
                                     //   (a vStd() band — pace-normalised, so the
                                     //   taper sits at the same place on the dial)
// Deploy strength 0..1 for a car holding BOOST (or running OVERTAKE). The taper
// makes deploy strongest out of slow corners, but it is FLOORED: it used to
// reach exactly 0 above TAPER_HI, which is only 191 km/h, so on any straight
// BOOST produced no thrust — and because the drain was gated on `deploy > 0`,
// it also cost nothing. Holding BOOST at speed did literally nothing, while
// OVERTAKE (which bypasses the taper) worked and drained. Real ERS deploys all
// the way down the straight; so does this now, at reduced strength.
const TAPER_FLOOR = 0.35;
function deployTaper(c) {
  if (c.otT > 0) return 1;
  const t = clamp(1 - (vStd(c.speed) - TAPER_LO) / (TAPER_HI - TAPER_LO), 0, 1);
  return TAPER_FLOOR + (1 - TAPER_FLOOR) * t;
}
function isErsDeploying(c) {
  if (!c || c.energy <= 0 || !(c.boostOn || c.otT > 0)) return false;
  return DEPLOY_A * deployTaper(c) > 0.4;
}
const DRAIN = 0.20, REGEN = 0.115;   // energy per second
const OT_TIME = 4, OT_COOL = 12, OT_GAP = 1.0;

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
function simSeed(v) {
  if (v !== undefined) {
    _simSeed = (v >>> 0) || 1;
    _simRngState = _simSeed;
  }
  return _simSeed;
}
// uniform [0,1) — the drop-in for Math.random() on sim paths
function simRnd() {
  _simRngState = (Math.imul(_simRngState, 1103515245) + 12345) >>> 0;
  return _simRngState / 0x100000000;
}
const { TIER_V } = GameTables;
// 6-speed gearbox with realistic PROGRESSIVE ratios (research: real/F1 gearboxes
// space the ratios so the steps shrink in the higher gears). So an upshift drops
// the revs a lot in the low gears and less up top, and every shift lands back in
// the ~8.7-11.3k power band (F1's optimal ~8-12k) before climbing to the limit —
// rather than dropping to idle or barely dropping at all. Top speed fraction of VMAX.
// F1-authentic 8 gears.
const { GEARS, GEAR_TOP, IDLE_RPM, MAX_RPM } = GameTables;
// GEAR_TOP is a fraction of the speed ENVELOPE, so these track vTop() rather than
// the bare VMAX: all eight gears stay reachable at any OVERALL SPEED setting, the
// tach sweeps its whole band, and the manual top-gear limiter (which caps speedCap
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
// B1 — debris caution (local yellow / VSC / safety car). A READ-ONLY race-logic
// layer: it consumes DebrisWorld.hazards() (settled debris/broken panels resting
// ON the racing surface) and drives the HUD flag. It NEVER slows or moves a car
// — no writes to speed/px/pz/head/(s,x). DEFAULT ON; disable apex26.caution="0".
let _cautionOn = true;
try { _cautionOn = (localStorage.getItem("apex26.caution") || "1") !== "0"; } catch (e) {}
// level: 0 GREEN · 1 local YELLOW (sector) · 2 VSC · 3 SAFETY CAR.
let caution = { level: 0, sector: -1, frac: 0, total: 0, sectors: [0, 0, 0], sinceT: 0, cause: "" };
let _cautionQT = 0;   // hazard-query throttle accumulator (s) — query at ~4 Hz
const CAUTION_YELLOW_MIN = 3;   // settled hazards in ONE sector → local yellow
const CAUTION_VSC_MIN = 6;      // total settled hazards on the surface → VSC
const CAUTION_SC_MIN = 10;      // a big pile → full safety car
const CAUTION_MIN_HOLD = 6;     // s a caution holds once raised (anti-flicker)
const CAUTION_YELLOW_MAX = 30;  // s hard cap on a local yellow
const CAUTION_SC_MAX = 90;      // s hard cap on VSC/SC — bounded, ~a lap or two
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
// The game mode, on TWO axes. `flow` is what the run is FOR and survives a whole
// championship; `session` is what this one visit to the track IS. They are genuinely
// independent — a career weekend qualifies and then races, so a single flat enum
// cannot say "career" and "qualifying" at once.
// `seasonMode` and `timeTrial` are no longer state: they are DERIVED views handed
// out through the G façade, so every downstream module and the __apex.info()
// contract keep their exact meaning. CAREER is a championship too — same 24-round
// calendar, same points, same standings — it just carries a save across seasons.
let flow = "gp";            // "gp" | "season" | "career"
let session = "race";       // "race" | "tt" (solo against the clock) | "quali"
const isChampionship = () => flow === "season" || flow === "career";
// The ONE way `flow` is written. Career's save is loaded at boot and stays loaded,
// so js/game/career.js has to be told whether its rules apply to the session that
// is running — otherwise a Grand Prix would quietly inherit the career's team
// development and its garage. Funnelling every write through here means that flag
// can never drift out of step with the mode.
function setFlow(v) { flow = v; Career.engage(v === "career"); }
const isTimeTrial = () => session === "tt";
const isCareer = () => flow === "career";
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
let camSlipSm = 0;      // smoothed slip input for camRoll (raw vLat/speed is 60 Hz-stepped)
let camCutT = 0;        // s; >0 just after a camera-mode cut → eased glide to the new vantage
let hitStop = 0;        // seconds of remaining sim slow-mo after a hard hit
let startHold = 0;      // randomised lights-out delay after the 5th light (F1-style)
let paused = false;
// Player racing-line assist, set by the pause-menu slider. -1..1: 0 = pure
// manual (default), >0 gently pulls toward the racing line through corners,
// <0 pushes the car wide. Always an added bias the driver can steer against.
let raceLineAssist = 0;
// Tilt used to be multiplied by a fixed 0.7 here "so it trims on top of the
// road-follow assist rather than throwing full lock". That rationale is gone —
// the assist ships at 0 — and the multiply was worse than it looked: it landed
// BEFORE the expo curve, so at the default STEER_EXPO 2.389 the real authority
// was 0.7^2.389 = 0.43. A tilt driver could not reach even half of STEER_MAX_SLIP
// at any lean, on any slider setting, and no knob exposed it. That is the
// "I lean the phone to the stop and the car won't turn" feeling.
// Tilt now gets the same lock range as every other input. Sensitivity (how far
// you tilt for a given steer) is still MAX_TILT, and jitter is still the
// One-Euro SMOOTHING slider — two knobs that a player can actually see.
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
// The PLAYER is drawn where it actually is. Its world position is exact and
// already smooth (world-space integration), so render interpolates px/pz
// directly and never round-trips through the road frame.
//
// Every one of these call sites used to rebuild the drawn position from a lerped
// (s, x) PLUS a 30 Hz low-pass on the lateral coordinate. That damping was a
// workaround for Frenet-projection noise back when (s, x) was the authority —
// its own comment said so. Against a car that is now exact in world space it
// only adds a first-order lag TOWARD THE ROAD FRAME: steer, and the mesh trails
// sideways then catches up. That is a "pulled and oscillating about the centre
// line" feel baked into the presentation, and it would survive any amount of
// physics work. AI cars keep the old path — they have no world position, their
// motion IS road-frame by construction.
// Writes world X/Z into _rp; the caller still samples the road for HEIGHT.
const _rp = { x: 0, z: 0, world: false };
function renderPosOf(c, cS, renderX) {
  if (c.isPlayer && c.px != null && c.rPrevPx !== undefined) {
    _rp.x = c.rPrevPx + (c.px - c.rPrevPx) * renderAlpha;
    _rp.z = c.rPrevPz + (c.pz - c.rPrevPz) * renderAlpha;
    _rp.world = true;
  } else if (c.isPlayer && c.px != null) {
    _rp.x = c.px; _rp.z = c.pz; _rp.world = true;
  } else {
    _rp.world = false;
  }
  return _rp;
}
// Unified player render anchor. Returns the (s, x) the camera, the car body's
// height/orientation, and banking should all sample — derived, for the player,
// from the SAME interpolated WORLD position the body is drawn at (renderPosOf):
// project that world point ONCE via trackFrom. World interpolation is smooth,
// so this s is smooth AND identical across all three consumers. Deriving each
// consumer independently from the arc read-back lerpS(rPrevS, s) diverged —
// that read-back is non-monotonic (game.js:2573), which showed as a backwards
// jolt (camera), a speed-dependent fore/aft slide (car vs camera), and
// residual height/orientation jitter at speed. AI cars (no world position)
// fall back to the arc interpolation unchanged.
const _pa = { world: false, cS: 0, cX: 0 };
function playerAnchor(c) {
  if (c.isPlayer && c.px != null) {
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
// yawVis is produced in the physics step; render it interpolated like position,
// or the mesh orientation leads the interpolated position by one full physics
// step (16.7 ms) — a small orientation-vs-position judder during yaw transients.
// yawVis is a damped residual clamped well inside ±π, so a plain lerp is safe.
function yawVisInterp(c) {
  const y1 = c.yawVis || 0;
  return c.rPrevYawVis === undefined ? y1 : c.rPrevYawVis + (y1 - c.rPrevYawVis) * renderAlpha;
}
// c.head is the player's real WORLD heading (full wrapping angle, unlike the
// small clamped yawVis residual) — read raw by the free-world chase/onboard
// camera rig (extra.carHead) to look "down the car's nose". Read raw at
// render time it snaps a full physics step (16.7 ms) every frame instead of
// gliding with renderAlpha like the position does: at speed that is a
// held-then-jump stutter whose size scales with speed × dt — "vibrates more
// as I speed up". Interpolate it exactly like position, with a wrap-safe
// shortest-path delta since head crosses ±π every lap.
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
const _mLView = new Float32Array(16), _mLProj = new Float32Array(16), _mLVP = new Float32Array(16);
// Dynamic car shadow pass scratches (per-frame car-only depth map).
const _mCView = new Float32Array(16), _mCProj = new Float32Array(16), _mCVP = new Float32Array(16);
// Nearest-floodlight spot-shadow pass scratches (per-frame 512² lamp depth map).
const _mFlView = new Float32Array(16), _mFlProj = new Float32Array(16), _mFlVP = new Float32Array(16);
const _mInvVP = new Float32Array(16);
const _mInvProj = new Float32Array(16);
const _sunVS = new Float32Array(3);
const _upVS = new Float32Array(3);   // world-up expressed in view space (wet-road SSR)
const _camUp = [0, 0, 0];   // scratch camera up-vector (rebuilt each render frame)
let _shadowSnapX = null, _shadowSnapZ = null, _shadowBox = null;
let _shadowSunX = null, _shadowSunY = null, _shadowSunZ = null;
const _shadowCtr = [0, 0, 0];   // unsnapped shadow anchor (glides) — the shader fades by distance from this

// ---------- parts / player mods ----------
// The single funnel every parts consumer goes through (setup-ui, recomputePlayerMods,
// makeCars, partsVisualKey, renderStatBars). Branching HERE is what keeps a career
// build fully isolated from the free-play garage: your career car and your Grand
// Prix car for the same team are separate objects that can never leak into one
// another, and career's own build is the only one subject to the R&D gate.
function getTeamParts(teamId) {
  const c = Career.data();
  if (c && teamId === c.team) return c.fitted;
  return store.get("parts." + teamId, {});
}
function saveTeamParts(teamId, parts) {
  const c = Career.data();
  if (c && teamId === c.team) { c.fitted = parts; Career.save(); return; }
  store.set("parts." + teamId, parts);
}

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
             fin: l.fin || null, finArt: l.finArt || null,
             noseStripe: l.noseStripe || null, finish: l.finish || null };
  }
  const c = _livResolveCache.get(team.id);
  if (c && c.rev === store.rev) return c.val;
  const liv = getLiveries(team).find((l) => l.id === getLiveryId(team.id));
  // Optional livery detail colours (nose cap, sidepod panel, wing flaps, halo tint)
  // — additive, so an unmodified livery still resolves to today's exact object shape.
  const val = liv ? { c1: liv.c1, c2: liv.c2, stripe: liv.stripe || null, accent: liv.accent || null,
                      nose: liv.nose || null, pod: liv.pod || null, wing: liv.wing || null, halo: liv.halo || null,
                      fin: liv.fin || null, finArt: liv.finArt || null,
                      noseStripe: liv.noseStripe || null, finish: liv.finish || null }
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
  const vt = Parts.getVisualTiers(getTeamParts(teamId), team);
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
let playerTyreVisual = null, playerBrakeVisual = null;
// WHEELS rides along with the other two wheel-facing categories.
let playerWheelId = "standard", playerWheelVisual = null;
// Full 8-char cosmetic key for the PLAYER's body/cockpit mesh caches — computed
// once here (parts only change from the setup screen, which calls this on close)
// so the render loop reads a cached string instead of rebuilding it via
// partsVisualKey() → getVisualTiers() every frame. Overwritten before the first
// race render by startRace()'s recomputePlayerMods() call.
let playerVisualKey = "11111111";

function recomputePlayerMods() {
  const team = player ? player.team : Teams.LIST[teamIdx];
  // teamStats() folds in career development; outside career it hands back the
  // team's own literal untouched, so this is the same object it always was.
  const stats = Career.teamStats(team) || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const setup = getTeamParts(team.id);
  const mods = Parts.getMods(setup, team);
  playerMods = {
    speed:     Parts.statMult(stats.speed)     * mods.speed,
    accel:     Parts.statMult(stats.accel)     * mods.accel,
    cornering: Parts.statMult(stats.cornering) * mods.cornering,
    braking:   Parts.statMult(stats.braking)   * mods.braking,
  };
  const vt = Parts.getVisualTiers(setup, team);
  playerTyreTier = vt.tyres; playerBrakesTier = vt.brakes;
  playerTyreId = vt._ids ? vt._ids.tyres : "medium";
  playerBrakeId = vt._ids ? vt._ids.brakes : "standard";
  playerTyreVisual = vt._visual && vt._visual.tyres || null;
  playerBrakeVisual = vt._visual && vt._visual.brakes || null;
  playerWheelId = vt._ids ? vt._ids.wheels : "standard";
  playerWheelVisual = vt._visual && vt._visual.wheels || null;
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
    const factoryParts = Parts.resolveSetup(Parts.getFactorySetup(team), team);
    const savedParts = ti === teamIdx ? Parts.resolveSetup(getTeamParts(team.id), team) : factoryParts;
    team.drivers.forEach((dSeat, di) => {
      const isP = ti === teamIdx && di === driverIdx;
      const resolvedParts = isP ? savedParts : factoryParts;
      // In a driver career YOU take one of the team's two real seats; the driver
      // you replaced steps aside and your team-mate stays put as the benchmark
      // every objective is measured against. Null outside career.
      const d = Career.driverOverride(team.id, di) || dSeat;
      // Spread the field's preferred lanes evenly across the track width (with a
      // little jitter) so the AI fan out instead of all stacking on the racing
      // line. Used as a fraction of half-width in updateCar.
      const lane = clamp(((idx / Math.max(1, total - 1)) * 2 - 1) * 0.78
        + (simRnd() - 0.5) * 0.12, -0.85, 0.85);
      idx++;
      cars.push({
        team, name: d.name, code: d.code, driverId: seasonDriverId(team.id, di), num: d.num, isPlayer: isP,
        color: team.color, tier: team.tier, seat: di,
        // Baked once here rather than looked up per physics step. Career team
        // development rides along in the same number the tier always contributed,
        // so the per-car update below is unchanged in shape. paceMult() is exactly
        // 1 outside career, making GP/TT bit-identical.
        tierV: TIER_V[team.tier] * Career.paceMult(team.id),
        fuelId: resolvedParts.ids.fuel,
        fuelVisual: resolvedParts.visual.fuel,
        s: 0, x: 0, speed: 0, prog: 0, lap: 0,
        gear: 1, rpm: IDLE_RPM, shiftT: 0, boostOn: false,
        energy: 1, otT: 0, otCool: 0, deploying: false,
        lapStart: 0, lapTime: 0, best: Infinity, totalT: 0,
        finished: false, finishT: 0, finPos: 0,
        offroad: false, offT: 0, cuts: 0, penalty: 0,
        yawVis: 0, steerVis: 0, collideT: 0,
        skill: Math.min(1.0, 0.92 + simRnd() * 0.1),
        aiBrakeT: 0, lane,
      });
    });
  });
  player = cars.find((c) => c.isPlayer);
}

function gridUp() {
  // grid order: by tier then random-ish; player at P12 for a fun climb
  const order = cars.slice().sort((a, b) => (a.tier - b.tier) || (simRnd() - 0.5));
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
    c.vLat = 0; c.yawRateCur = 0; c.steerVis = 0; c.yawVis = 0; c.rPrevYawVis = 0;
    c.rPrevHead = 0;
    c.kerbGripSm = 1; c.kerbCueT = 0;
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
  if (player) {
    const w0 = worldFromTrack(player.s, player.x, smp);
    player.px = w0.x; player.pz = w0.z;
    // Match the render-interpolation snapshot too, or the first frame blends
    // from whatever world point the PREVIOUS session left in rPrevPx.
    player.rPrevPx = player.px; player.rPrevPz = player.pz;
    // Along the track, not world +Z: `head = 0` above is the AI/heading-model
    // placeholder and is only correct where the start straight happens to point
    // down +Z. update() derives it from the tangent — do the same here.
    player.head = Math.atan2(smp.t[0], smp.t[2]);
    player.rPrevHead = player.head;
    player.vLat = 0; player.yawRateCur = 0;
  }
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
  const factorySetup = Parts.getFactorySetup(team);
  return Car3D.build(liv.c1, liv.c2, {
    livery: liv,
    teamId: team.id,   // per-team chassis style (nose/airbox/fin/mirrors/inlet)
    num: team.drivers && team.drivers[0] && team.drivers[0].num,
    parts: Parts.getVisualTiers(factorySetup, team),
  });
}

function teamMesh(team) {
  const key = team.id + ":" + getLiveryId(team.id) + ":" + Parts.factoryKey(team);
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
        getBrakeRing, getRainLight, getExhaustFlame, getErsLight,
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
function getCarDecalTexture(team, num, isPlayer) {
  if (typeof LiveryTex === "undefined" || !gfx.createTexture) return null;
  // isPlayer is part of the key: on the mobile tier the player's atlas uploads
  // at 512² and AI atlases at 256², so a team the player later switches to
  // must not reuse a cached AI-resolution atlas (and vice versa).
  const key = team.id + ":" + getLiveryId(team.id) + ":" + (num == null ? "_" : num) + (isPlayer ? ":P" : "");
  if (!(key in _decalTexCache)) {
    let t = null;
    try { t = gfx.createTexture(LiveryTex.buildAtlas(team.id, resolveLivery(team), num, !!isPlayer)); }
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
const _aeroLevelCache = new Map();   // "player|factory:team.id" -> {val, rev}
function teamDecalState(team, usePlayerSetup) {
  const key = (usePlayerSetup ? "player:" : "factory:") + team.id;
  const rev = usePlayerSetup ? store.rev : -1;
  const c = _aeroLevelCache.get(key);
  if (c && c.rev === rev) return c;
  const setup = usePlayerSetup ? getTeamParts(team.id) : Parts.getFactorySetup(team);
  const parts = Parts.getVisualTiers(setup, team);
  const state = { val: Car3D.aeroLevelOf ? Car3D.aeroLevelOf(parts) : 2, parts, rev };
  _aeroLevelCache.set(key, state);
  return state;
}
function drawCarDecals(team, modelMat, night, num, cockpit, usePlayerSetup) {
  const state = teamDecalState(team, usePlayerSetup);
  // A loaded GLB is a static body and does not consume procedural part recipes;
  // keep its overlay on stable default/legacy anchors as setup options change.
  const legacyBody = !!carModelBuf;
  const mesh = cockpit ? getCockpitDecalMesh(legacyBody ? null : state.parts, team.id) :
    getCarDecalMesh(state.val, state.parts, legacyBody, team.id);
  const tex = getCarDecalTexture(team, num, usePlayerSetup);
  if (mesh && tex) { _decalOpts.glow = night ? 0.35 : 0; gfx.drawDecal(mesh, modelMat, tex, _decalOpts); }
}
// Pooled decal opts — drawCarDecals runs once per drawn car per frame; a fresh
// literal there was ~20 allocations/frame feeding the night-track GC jitter.
const _decalOpts = { glow: 0 };

// Player car gets animated wheels: a body-only mesh + four separate wheel meshes
// the render layer spins (∝ speed) and steers (fronts). Only for the procedural
// car — a loaded glb model is one piece, so playerBodyMesh returns null and the
// player falls back to the full static mesh. Wheel meshes are cached per
// TYRES/BRAKES visual tier below (getPlayerWheelMeshes), not team-keyed.
// Bounded to the latest N visual keys so parts-expansion doesn't leak GPU meshes.
const PLAYER_BODY_CACHE_MAX = 3;
const COCKPIT_BODY_CACHE_MAX = 3;
const WHEEL_MESH_CACHE_MAX = 8;
const playerBodies = {};
const playerBodyOrder = [];
const WHEELS = [
  { x: -0.79, y: 0.34, z:  1.7, front: true,  rear: false },
  { x:  0.79, y: 0.34, z:  1.7, front: true,  rear: false },
  { x: -0.76, y: 0.34, z: -1.6, front: false, rear: true },
  { x:  0.76, y: 0.34, z: -1.6, front: false, rear: true },
];
const _wheelLocal = new Float32Array(16);
const _wheelWorld = new Float32Array(16);
const _fixedWheelLocal = new Float32Array(16);
const _fixedWheelWorld = new Float32Array(16);
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
const _shadowCars = [];   // parallel refs: the live player transform replaces its stale pooled entry
const _livePlayerShadowMat = new Float32Array(16);
let _shadowCount = 0;
// Deferred car-decal batch (same pattern as the blob shadows above): the car
// loop used to interleave gfx.draw(body) with gfx.drawDecal per car — ~2
// program+state flips per car, ~44/frame with a full field. Record each drawn
// car's decal params here and flush them in ONE decal-program block right
// after the loop. Decals are depth-tested but write neither depth nor alpha,
// so drawing them after the bodies/wheels/rings resolves identically.
const _decalMats = [];    // pool of Float32Array(16), reused across frames
const _decalTeams = [];
const _decalNums = [];
const _decalCockpit = [];
const _decalSetup = [];
let _decalCount = 0;
function queueCarDecals(team, modelMat, num, cockpit, usePlayerSetup) {
  let m = _decalMats[_decalCount];
  if (!m) { m = new Float32Array(16); _decalMats[_decalCount] = m; }
  m.set(modelMat);
  _decalTeams[_decalCount] = team;
  _decalNums[_decalCount] = num;
  _decalCockpit[_decalCount] = !!cockpit;
  _decalSetup[_decalCount] = !!usePlayerSetup;
  _decalCount++;
}
// Reusable { dy, roll } scratches for Tracks.banking — one for the physics step,
// one for the render loop (both called once per car per frame) so banking() no
// longer allocates a fresh object ~23×/frame.
const _bankScratch = { dy: 0, roll: 0 };
const _bankScratchP = { dy: 0, roll: 0 };

function cameraFollowsBank(mode) {
  return mode === "chase" || mode === "far" || mode === "drift" ||
         mode === "cockpit" || mode === "hood" || mode === "reverse" ||
         mode === "low" || mode === "tcam" || mode === "rear";
}

// Build the grounded transform needed by the pre-scene car-shadow pass. The main
// car loop runs later, after shadow maps are already consumed by the lit shader,
// so the player matrix must be resolved here instead of reusing last frame's
// pooled transform (which trails by speed × frame time on slower devices).
function currentCarGroundMat(c, out, dt) {
  const pa = playerAnchor(c);   // player: (s,x) from the drawn world point; AI: arc interp
  const cS = pa.cS, cX = pa.cX;
  // Predict the same damping step the later body loop will apply, without
  // mutating xVis twice. Shadow and body therefore share one lateral position.
  const renderX = c.xVis === undefined ? cX : damp(c.xVis, cX, 30, dt);
  Tracks.sample(track, cS, smp2);
  // Normalize the lerped tangent/right — same fix as the body loop: raw they
  // scale the shadow-caster basis at the 4 m node rate (see the note there).
  { const t = smp2.t, r = smp2.r;
    let l = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
    l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l; }
  const bankC = Tracks.banking(track, cS, renderX, _bankScratch);
  const rp = renderPosOf(c, cS, renderX);   // player: exact world position
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

// The cockpit body: the REAL car (livery, nose, mirrors, number board) minus
// the driver helmet the camera sits inside. Cached per team like playerBodies.
const cockpitBodies = {};
const cockpitBodyOrder = [];
function cockpitBodyMesh(team) {
  // Player-only (drawCockpitRig runs on c.isPlayer), so the cached playerVisualKey
  // is always this team's key — no per-frame partsVisualKey() rebuild.
  const key = team.id + ":" + playerVisualKey;
  return putBoundedMesh(cockpitBodies, cockpitBodyOrder, key, () => {
    const liv = resolveLivery(team);
    return gfx.createMesh(Car3D.build(liv.c1, liv.c2,
      { livery: liv, teamId: team.id, noWheels: true, noDriver: true, cockpit: true, num: team.drivers && team.drivers[0] && team.drivers[0].num,
        parts: Parts.getVisualTiers(getTeamParts(team.id), team) }));
  }, COCKPIT_BODY_CACHE_MAX);
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
  // Queued with the field's decals and flushed after the car loop. The player
  // cockpit is the one queued decal that renders the PLAYER's setup parts.
  queueCarDecals(c.team, base, carDecalNum(c.team, c), true, true);
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
  const kmh = Math.max(0, Math.min(999, Math.round(dashKph(c.speed || 0))));
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
  return putBoundedMesh(playerBodies, playerBodyOrder, key, () => gfx.createMesh(Car3D.build(liv.c1, liv.c2,
    { livery: liv, teamId: team.id, noWheels: true, num: team.drivers && team.drivers[0] && team.drivers[0].num,
      parts: Parts.getVisualTiers(getTeamParts(team.id), team) })), PLAYER_BODY_CACHE_MAX);
}
// Player wheel meshes, keyed by the resolved TYRES/BRAKES visual tier (band
// colour + caliper accent) so a parts change rebuilds the right mesh instead
// of drawing stale geometry. Tier "1:1" (both default) matches today's shared
// wheelMeshF/wheelMeshR exactly — same team-independent, dark-tyre meshes.
// Bounded to the latest WHEEL_MESH_CACHE_MAX tyre:brake pairs.
const wheelMeshCache = {};
const wheelMeshOrder = [];
function freeWheelPair(m) {
  if (!m) return;
  if (gfx.freeMesh) {
    if (m.F) gfx.freeMesh(m.F);
    if (m.R) gfx.freeMesh(m.R);
    if (m.FFixed) gfx.freeMesh(m.FFixed);
    if (m.RFixed) gfx.freeMesh(m.RFixed);
  }
}
function getPlayerWheelMeshes() {
  const key = playerTyreId + ":" + playerBrakeId + ":" + playerWheelId;
  return putBoundedMesh(wheelMeshCache, wheelMeshOrder, key, () => {
    const band = playerTyreVisual && playerTyreVisual.band || Car3D.TYRE_BAND[playerTyreTier];
    const caliper = playerBrakeVisual ? playerBrakeVisual.cal : Car3D.BRAKE_CALIPER[playerBrakesTier];
    const rim = playerBrakeVisual && playerBrakeVisual.rim;
    const grooved = !!(playerTyreVisual && playerTyreVisual.grooved);
    const front = Car3D.buildWheelLayers(0.32, band, caliper, rim, grooved,
      playerTyreVisual, playerBrakeVisual, playerWheelVisual);
    const rear = Car3D.buildWheelLayers(0.38, band, caliper, rim, grooved,
      playerTyreVisual, playerBrakeVisual, playerWheelVisual);
    return {
      F: gfx.createMesh(front.rotating),
      R: gfx.createMesh(rear.rotating),
      FFixed: gfx.createMesh(front.fixed),
      RFixed: gfx.createMesh(rear.fixed),
    };
  }, WHEEL_MESH_CACHE_MAX, freeWheelPair);
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
    const F = _fixedWheelLocal;
    F[0] = cs*ws; F[1] = 0; F[2] = -ss*ws; F[3] = 0;
    F[4] = 0; F[5] = 1; F[6] = 0; F[7] = 0;
    F[8] = ss; F[9] = 0; F[10] = cs; F[11] = 0;
    F[12] = L[12]; F[13] = L[13]; F[14] = L[14]; F[15] = 1;
    M4.mulTo(_fixedWheelWorld, base, F);
    gfx.draw(wd.rear ? wm.RFixed : wm.FFixed, _fixedWheelWorld, opt);
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
    playerBodyOrder.length = 0;
    for (const k in cockpitBodies) { if (gfx.freeMesh) gfx.freeMesh(cockpitBodies[k]); delete cockpitBodies[k]; }
    cockpitBodyOrder.length = 0;
    for (const k in wheelMeshCache) { freeWheelPair(wheelMeshCache[k]); delete wheelMeshCache[k]; }
    wheelMeshOrder.length = 0;
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
      if (track.meshes.glass) { if (gfx.freeChunkedMesh) gfx.freeChunkedMesh(track.meshes.glass); else gfx.freeMesh(track.meshes.glass); }
      if (track.meshes.water) gfx.freeMesh(track.meshes.water);
      gfx.freeMesh(track.meshes.gate);
      gfx.freeMesh(track.meshes.startline);
    }
    // Drop the old track object BEFORE building the new one: the build's
    // transient peak (plain-JS geometry arrays for up to ~5 M verts) is the
    // moment a near-limit phone gets jetsam-killed, and holding the previous
    // track's terrainGeo/_lights/mesh handles through it stacks old + new
    // resident at once. loadTrack is synchronous, so nothing can observe the
    // null between here and the assignment below.
    track = null;
    // Pass the active backend so tracks.js builds its meshes through the façade
    // (opts.gfx) instead of reaching the GLX global directly. On the default
    // path gfx===GLX; on a TLX/WGX opt-in it's that backend (descriptor-copied
    // onto GLX, so object identity is preserved either way).
    track = Tracks.build(def, { night: sessionDark, gfx });
    // Rapier debris side-world: register the circuit's near-apex clippable cones
    // (A3). Cheap pure derivation from track.def.turns; stores the list even when
    // the side-world is disabled/loading so it's ready once rapier is live.
    DebrisWorld.registerFurniture(track);
    builtTrackId = def.id;
    builtTrackNight = sessionDark;
    // Env probe still holds the previous circuit — fall back to the analytic
    // sky until a fresh 6-face cycle has captured the new one.
    if (gfx.envProbeReset) gfx.envProbeReset();
    Ghost.setTrack(def.id);
    hud.invalidateMap();        // force minimap redraw for new track
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
// applyRaceSettings() (session lighting/weather/time-of-day) and the
// per-track atmosphere bias live in js/game/atmosphere.js
// (Atmosphere.create(G) — wired after the G façade below).

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
  const mode = CAM_MODES[camMode].id;
  const v = camVantage(mode, player.s, player.x, player.speed || 0, 0, {
    bankDy: bankCam ? bankCam.dy : 0, deploy: player.deploying, slipLat: player.vLat || 0,
    // Same car pose the live rig uses. Without it snapCam() silently fell back to
    // the road-frame framing, so the snapped view disagreed with the live one —
    // which the comment above says they must not do.
    carPos: player.px != null ? [player.px, player.pz] : null,
    carHead: player.head || 0,
  });
  camEye[0] = v.eye[0]; camEye[1] = v.eye[1]; camEye[2] = v.eye[2];
  camTgt[0] = v.tgt[0]; camTgt[1] = v.tgt[1]; camTgt[2] = v.tgt[2];
  camFov = v.fov;
  camRoll = bankCam && cameraFollowsBank(mode) ? -bankCam.roll : 0;
}

function startRace() {
  loadTrack(trackIdx);
  makeCars();
  if (isTimeTrial()) {
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
  if (isRaining()) {           // only "rain" precipitates; "wet" is a damp track
    initRainDrops();
    Particles.rainShow(true);
  } else {
    Particles.rainShow(false);
  }
  gridUp();
  recomputePlayerMods();
  resultT = 0;
  camRoll = 0; camSlipSm = 0;
  sectorIdx = sectorAt(player.s); sectorStartT = 0;
  // Arm the crash sentinel (mobile only) and, after a strike, start the
  // session pre-scaled-down — the governor may restore upward, but only under
  // the clear sustained headroom that proves the device can afford it.
  PerfGov.sentinelArm(true);
  if (PerfGov.strikes() > 0 && PerfGov.autoRes() && gfx.setRenderScale && gfx.getRenderScale)
    gfx.setRenderScale(Math.min(gfx.getRenderScale(), PerfGov.strikes() >= 2 ? 0.7 : 0.85));
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
  if (soundOn && isRaining()) GameAudio.startRain();   // rain patter — a damp "wet" track is silent
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
  PerfGov.cleanRace();   // finished cleanly — disarm + pay a crash strike down
  state = "results";
  document.body.classList.remove("in-race");
  els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  if (soundOn) GameAudio.finish();
  if (isTimeTrial()) { buildTTResults(); els.results.hidden = false; return; }
  // classification: finished by time(+penalty), rest by progress
  const fin = cars.filter((c) => c.finished).sort((a, b) => (a.finishT + a.penalty) - (b.finishT + b.penalty));
  const run = cars.filter((c) => !c.finished).sort((a, b) => b.prog - a.prog);
  const order = forcedOrder || fin.concat(run);
  order.forEach((c, i) => { c.finPos = i + 1; });
  if (isChampionship()) {
    order.forEach((c, i) => {
      const pts = Teams.POINTS[i] || 0;
      season.pts[c.driverId] = (season.pts[c.driverId] || 0) + pts;
      season.driverCodes[c.driverId] = c.code;
      season.teamPts[c.team.id] = (season.teamPts[c.team.id] || 0) + pts;
    });
    season.round++;
    // In career `season` IS career.season (same object, same shape — which is what
    // lets buildResults/buildStandings/the HUD work in career untouched). Persist
    // through the career save, or this would overwrite the standalone SEASON save
    // with career's standings.
    if (isCareer()) { Career.save(); Career.settleRound(order, player); }
    else store.set("season", season);
  }
  dbgCam = null;
  buildResults(order);
  els.results.hidden = false;
}

// ── The shared ctx façade over game.js closure state ─────────────────────────
// Extracted modules (js/game/results.js, hud.js, apex.js, …) can't reach the
// closure `let`s in this file, so game.js hands them ONE object of live
// getters/setters + stable helpers. Getters read the current value at call
// time; setters write back into the closure. Grown as extractions need it —
// add a getter here rather than passing state ad hoc.
const G = {
  $, els,
  fmtTime: (t) => fmtTime(t),
  // The DASH number for a real ground speed — km/h on the pace-5 scale, so the
  // HUD/LCD span the same range at every OVERALL SPEED setting. Debug hooks
  // deliberately keep reporting raw m/s; see vTop/vStd.
  dashKph: (v) => dashKph(v),
  ttBoard, teamById: (id) => teamById(id), cssCol: (c) => cssCol(c),
  get state() { return state; }, set state(v) { state = v; },
  get track() { return track; },
  get cars() { return cars; },
  get player() { return player; },
  get season() { return season; }, set season(v) { season = v; },
  // flow/session are the authority; seasonMode/timeTrial are DERIVED views kept so
  // the __apex.info() contract and every module that reads them are unchanged.
  // __apex.race()/tt() write the legacy names to mean "leave whatever mode this is",
  // which is exactly what the setters below do.
  get flow() { return flow; }, set flow(v) { setFlow(v); },
  get session() { return session; }, set session(v) { session = v; },
  // The career SAVE lives in js/game/career.js, which owns it outright — this is a
  // read-through so there is exactly one copy, never a stale mirror in a closure.
  get career() { return Career.data(); },
  openCareer: (...a) => openCareer(...a),
  get seasonMode() { return isChampionship(); },
  set seasonMode(v) { setFlow(v ? "season" : "gp"); },
  get ttNewRecord() { return ttNewRecord; },
  get ttSessionTs() { return ttSessionTs; },
  get ttRecord() { return ttRecord; }, set ttRecord(v) { ttRecord = v; },
  get timeTrial() { return isTimeTrial(); },
  set timeTrial(v) { session = v ? "tt" : "race"; },
  get lapsTarget() { return lapsTarget; },
  get ranked() { return ranked; },
  get sectorLast() { return sectorLast; },
  // Setting the seed also rewinds the stream, so seeding then rebuilding the
  // grid reproduces a scenario exactly. See simSeed/simRnd.
  get seed() { return simSeed(); }, set seed(v) { simSeed(v); },
  simSeed, simRnd,
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
  get camRoll() { return camRoll; }, set camRoll(v) { camRoll = v; },
  get camTgt() { return camTgt; }, set camTgt(v) { camTgt = v; },
  get dbgCam() { return dbgCam; }, set dbgCam(v) { dbgCam = v; },
  get frame() { return frame; }, set frame(v) { frame = v; },
  get frameSky() { return frameSky; }, set frameSky(v) { frameSky = v; },
  get frozen() { return frozen; }, set frozen(v) { frozen = v; },
  get headlessMode() { return headlessMode; }, set headlessMode(v) { headlessMode = v; },
  get hideMeshes() { return hideMeshes; }, set hideMeshes(v) { hideMeshes = v; },
  get paused() { return paused; }, set paused(v) { paused = v; },
  get raceLaps() { return raceLaps; }, set raceLaps(v) { raceLaps = v; },
  get raceT() { return raceT; }, set raceT(v) { raceT = v; },
  // The RENDER clock (sky/cloud drift, FLAG cloth wave). It accumulates real
  // frame dt, so its value depends on how many frames happened to render — which
  // makes any pixel comparison across runs non-deterministic. Exposed so a
  // visual-regression capture can pin it; see __apex.renderClock().
  get skyT() { return _skyT; }, set skyT(v) { _skyT = v; },
  get raceTimeOfDay() { return raceTimeOfDay; }, set raceTimeOfDay(v) { raceTimeOfDay = v; },
  get raceWeather() { return raceWeather; }, set raceWeather(v) { raceWeather = v; },
  get renderAlpha() { return renderAlpha; }, set renderAlpha(v) { renderAlpha = v; },
  get sectorBests() { return sectorBests; }, set sectorBests(v) { sectorBests = v; },
  get sectorIdx() { return sectorIdx; }, set sectorIdx(v) { sectorIdx = v; },
  get sectorStartT() { return sectorStartT; }, set sectorStartT(v) { sectorStartT = v; },
  get skyViewOverride() { return skyViewOverride; }, set skyViewOverride(v) { skyViewOverride = v; },
  get trackIdx() { return trackIdx; }, set trackIdx(v) { trackIdx = v; },
  get ttLaps() { return ttLaps; }, set ttLaps(v) { ttLaps = v; },
  get weatherArc() { return weatherArc; }, set weatherArc(v) { weatherArc = v; },
  // Mutable state consumed by js/game/atmosphere.js.
  get _cloudBase() { return _cloudBase; }, set _cloudBase(v) { _cloudBase = v; },
  get _ltBase() { return _ltBase; }, set _ltBase(v) { _ltBase = v; },
  get _ltFlash() { return _ltFlash; }, set _ltFlash(v) { _ltFlash = v; },
  get _ltNextT() { return _ltNextT; }, set _ltNextT(v) { _ltNextT = v; },
  // Mutable state consumed by js/game/setup-ui.js.
  get livDraftOverride() { return livDraftOverride; }, set livDraftOverride(v) { livDraftOverride = v; },
  get _spMeshKey() { return _spMeshKey; }, set _spMeshKey(v) { _spMeshKey = v; },
  get setupPreviewOn() { return setupPreviewOn; }, set setupPreviewOn(v) { setupPreviewOn = v; },
  get soundOn() { return soundOn; }, set soundOn(v) { soundOn = v; },
  get unlimitedBudget() { return unlimitedBudget; }, set unlimitedBudget(v) { unlimitedBudget = v; },
  get teamIdx() { return teamIdx; }, set teamIdx(v) { teamIdx = v; },
  // Stable helpers consumed by js/game/setup-ui.js.
  arrToHex, hexToArr, getTeamParts, saveTeamParts, getLiveryId, saveLiveryId,
  getCustomLiveries, setCustomLiveries, getLiveries, invalidateDecalTextures,
  // Mutable state + helpers consumed by js/game/menus.js.
  get driverIdx() { return driverIdx; }, set driverIdx(v) { driverIdx = v; },
  get difficulty() { return difficulty; }, set difficulty(v) { difficulty = v; },
  store, tickUi, scheduleFlybyTrack,
  renderStatBars: (...a) => renderStatBars(...a),   // const initialised below — defer
  // Same deferred-arrow trick for the garage <-> select plumbing: setup-ui.js is
  // created before menus.js, and openGarage/openCustomize are declared further
  // down this file, so none of these can be referenced directly at create time.
  buildSetup: (...a) => buildSetup(...a),
  setTeamPicker: (...a) => setTeamPicker(...a),
  teamSwatch: (...a) => teamSwatch(...a),
  openGarage: (...a) => openGarage(...a),
  openCustomize: (...a) => openCustomize(...a),
  // Career plumbing — same deferred-arrow reason as the block above.
  openRaceSettings: (...a) => openRaceSettings(...a),
  refreshCareerButton: (...a) => refreshCareerButton(...a),
  updateTrackPreview: (...a) => updateTrackPreview(...a),
  // Mutable state + helpers consumed by js/game/photomode.js.
  get photoMode() { return photoMode; }, set photoMode(v) { photoMode = v; },
  get _photoPrevScale() { return _photoPrevScale; }, set _photoPrevScale(v) { _photoPrevScale = v; },
  get photoAlt() { return photoAlt; }, set photoAlt(v) { photoAlt = v; },
  get photoVertT() { return photoVertT; }, set photoVertT(v) { photoVertT = v; },
  get _ltStore() { return _ltStore; }, set _ltStore(v) { _ltStore = v; },
  photoCam, photoKeys, photoMouse, photoMove, photoLook,
  applyResMode: (...a) => applyResMode(...a),
  setPaused: (...a) => setPaused(...a),
  ltKey: (...a) => ltKey(...a),
  // Stable helpers consumed by js/game/tuner.js.
  setLightTune: (...a) => setLightTune(...a),
  exitPhotoMode: (...a) => exitPhotoMode(...a),   // const initialised below — defer
  // Stable helpers consumed by js/game/atmosphere.js.
  clamp: (v, a, b) => clamp(v, a, b),
  satAdjust: (rgb, amt) => satAdjust(rgb, amt),
  isRaining: () => isRaining(),
  isWetRoad: () => isWetRoad(),
  isFloodActiveSession: () => isFloodActiveSession(),
  _nightAmbientBand: () => _nightAmbientBand(),
  applyLightTune: (fromApplyRace) => applyLightTune(fromApplyRace),
  // Stable bindings consumed by js/game/apex.js (functions hoist; consts are
  // initialised before ApexApi.create(G) runs at the end of boot).
  smp, smp2, canvas,
  get gfx() { return gfx; },
  // Local (s,x)↔world helpers for the incident sim's guarded handover writeback
  // (js/game/incidentsim.js). trackFrom is the LOCAL predictor+Newton read (never
  // a global search — see its comment), worldFromTrack its exact inverse.
  trackFrom: (px, pz, sp) => trackFrom(px, pz, sp),
  worldFromTrack: (s, x) => worldFromTrack(s, x, smp2),
  GAME_LAPS, TT_LAPS, LONG_GRIP,
  applyRaceSettings: () => applyRaceSettings(),   // const initialised below — defer
  camVantage, endRace, gridUp, gripMult, isErsDeploying, cautionInfo,
  loadCarModel, loadTrack, persistLightTune,
  refreshLightTunePanel: (...a) => refreshLightTunePanel(...a),   // const initialised below — defer
  rescuePlayer, setCamMode, setLightTune, setWeatherLive, snapGameCam,
  startRace, startWeatherArc, update, wrapS,
};

// Results / TT-leaderboard / standings DOM builders (js/game/results.js).
const { buildResults, buildTTResults, buildStandings } = GameResults.create(G);
// In-race HUD + minimap (js/game/hud.js).
const hud = GameHud.create(G);
const updateHud = hud.updateHud;
// Session atmosphere: applyRaceSettings + per-track bias (js/game/atmosphere.js).
const applyRaceSettings = Atmosphere.create(G).applyRaceSettings;
// CAR SETUP panel UI (js/game/setup-ui.js).
const { buildSetup, openSetup, renderStatBars } = SetupUI.create(G);
// Select-screen UI (js/game/menus.js).
const { buildSelect, updateTrackPreview, openTrackDetail, setTeamPicker, teamSwatch } = Menus.create(G);
// CAREER screen — new-career setup + season hub (js/game/career-ui.js). The rules
// and the save live in js/game/career.js, which is a plain global and needs no ctx.
const careerUi = CareerUI.create(G);
// Photo mode (js/game/photomode.js).
const { initPhotoCam, updatePhotoCam, enterPhotoMode, exitPhotoMode } = Photomode.create(G);
// LIGHTING TUNER panel UI (js/game/tuner.js).
const { buildLightTunePanel, refreshLightTunePanel, closeLightTuner } = TunerPanel.create(G);
// CAMERA TUNER panel UI (js/game/cam-tuner.js) — per-camera-mode framing offsets.
const { closeCamTuner } = CamTunerPanel.create(G);
// Steering-tuning sliders + presets (js/game/steer-tuning.js).
const { applySteerTuning } = SteerTuning.create(G);
// Rapier debris side-world (js/game/debrisworld.js) — render-only, opt-in,
// inert (a single boolean check) unless enabled via apex26.debris/__apex.debris.
DebrisWorld.create(G);
// R2/R3/C1 bounded-takeover incident sim (js/game/incidentsim.js) — the ONLY
// additive-Rapier layer allowed to move a car, and only inside a bounded,
// flagged, fallback-guarded window (extends the sacred xPinned + (prog,x)
// exceptions). Inert (owns() is a Set read) unless a flag is on AND the debris
// side-world is live. DEFAULT ON per feature (apex26.r2Airborne/r3Contact/c1Pileup).
const incidentSim = IncidentSim.create(G);
// C2 visual suspension (js/game/bodyattitude.js) — render-only cosmetic chassis
// pitch/roll/heave springs; DEFAULT ON, disable via apex26.bodyAttitude/__apex.bodyAttitude.
const bodyAttitude = BodyAttitude.create(G);

function teamById(id) { return Teams.LIST.find((t) => t.id === id); }
function cssCol(c) { return "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")"; }
// Convert between an <input type=color> hex string and a [r,g,b] 0..1 array.
function hexToArr(h) { const n = parseInt(String(h).slice(1), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function arrToHex(a) { const f = (v) => ("0" + Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16)).slice(-2); return "#" + f(a[0]) + f(a[1]) + f(a[2]); }

function quitToMenu() {
  PerfGov.sentinelArm(false);   // deliberate exit — not a crash
  closeLightTuner(false);
  closeCamTuner(false);
  state = "menu"; paused = false;
  document.body.classList.remove("in-race");
  setHudUserHidden(false);   // clear clean-screen mode on exit
  els.hud.hidden = true; els.lights.hidden = true; els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  els.pausemenu.hidden = true; els.results.hidden = true; els.announce.hidden = true;
  $("advanced").hidden = true; $("lighting").hidden = true; $("audioset").hidden = true;
  els.overlay.hidden = false;
  $("race-settings").hidden = true;
  Particles.rainShow(false);
  els.soundbtn.hidden = false;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  if (soundOn) GameAudio.startMusic(-1);
  // Back at the title screen no session is running, so drop back to the neutral
  // mode. Every entry point (#mb-race/#mb-tt/#mb-season/#mb-career) sets flow and
  // session for itself, so this only stops a half-finished career leaking into the
  // next thing the player presses. The championship SAVES are untouched — what
  // makes the CONTINUE buttons appear is `season`/`career`, not the mode.
  setFlow("gp"); session = "race";
  // …and drop the career championship alias with it, so STANDINGS on the title
  // screen describes the standalone season again.
  season = store.get("season", null);
  // Show standings button when an active season is in progress
  const hasSeason = season && season.round > 0 && season.round < Tracks.SEASON.length;
  $("mb-standings").hidden = !hasSeason;
  refreshCareerButton();
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
  if (isRaining()) {
    initRainDrops();
    Particles.rainShow(true);
  } else {
    Particles.rainShow(false);
  }
  if (soundOn) { if (isRaining()) GameAudio.startRain(); else GameAudio.stopRain(); }
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
      if (lit === 5) startHold = 0.2 + simRnd() * 1.8;
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
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i + 1;
  }

  for (const c of cars) updateCar(c, dt, ranked);

  resolveCollisions(ranked, dt);

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

  // B1 — debris caution: consume hazards() and drive the local-yellow / VSC / SC
  // flag state (READ-ONLY; never slows or moves a car). Self-guarding + throttled.
  updateCaution(dt);

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
    GameAudio.setEngine(revFrac, player.deploying ? 1 : 0, player.offroad, clamp(player.speed / vTop(), 0, 1), player.gear);
    // Squeal from the CAR's slip, via the same skidIntensity the marks and smoke
    // use. This was a SECOND, independent copy of the old curvature formula
    // (|k| * speed), so the tyres you HEAR still screamed at the road's arc —
    // every corner squealed whether or not the car was actually sliding, and a
    // genuine slide down a straight was silent. Fixing the visual copy alone left
    // the most audible arc-coupling in the game untouched.
    GameAudio.setSkid(player.skidIntensity || 0);
  }
}

// Shift a car along the track. AI prog and s advance together. Player prog is
// derived from Δs each frame after collisions, so only move s here — otherwise
// the push is counted twice (shiftLong.prog + next-tick ds).
function shiftLong(c, d) {
  c.s = wrapS(c.s + d);
  if (!c.isPlayer) c.prog += d;
}

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
  // Snapshot the player's road coords so the writeback at the end can tell
  // whether this pass actually shoved it (see there for why that matters).
  const _preColS = player ? player.s : 0, _preColX = player ? player.x : 0;
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
      // Incident-sim takeover owns this car's contacts in Rapier — the (prog,x)
      // plane must not fight the 6-DoF body.
      if (incidentSim.owns(a)) continue;
      // Full field: next-10 race ranks miss leader↔backmarker pairs that wrap
      // to |dProg|≈0 at the same s. 22 cars × LCAR cull is cheap.
      for (let j = i + 1; j < ranked.length; j++) {
        const b = ranked[j];
        if (incidentSim.owns(b)) continue;
        let dProg = a.prog - b.prog;
        if (!Number.isFinite(dProg)) continue;   // never let a corrupt car spread NaN
        const L = track.total;
        dProg = ((dProg + L / 2) % L + L) % L - L / 2;
        if (Math.abs(dProg) > LCAR) continue;
        const dX = a.x - b.x;
        if (!Number.isFinite(dX)) continue;
        const penLong = LCAR - Math.abs(dProg);
        const penLat = WCAR - Math.abs(dX);
        if (penLong <= 0 || penLat <= 0) continue;
        const iA = a.isPlayer ? 0.5 : 1, iB = b.isPlayer ? 0.5 : 1, iSum = iA + iB;
        // Closing into a nest at the lateral slop must be rear-end. Least-
        // penetration alone picks "side" once |dx|≈WCAR (tiny penLat, deep
        // penLong), then scrubs speed forever with corr≈0 — the stuck feel.
        // Only when the PLAYER is the rear car closing: applying this to every
        // player↔AI touch (e.g. grid pack with throttle held) drained the field.
        const closing = (dProg >= 0 ? b.speed - a.speed : a.speed - b.speed) > 0.5;
        const nestEdge = closing && penLong > 1.0 && penLat < 0.5;
        const forceRear = nestEdge && ((dProg >= 0 && b.isPlayer) || (dProg < 0 && a.isPlayer));
        const sideContact = penLat < penLong && !forceRear;
        if (sideContact) {
          // side-by-side contact: separate laterally, scrub a little speed. Mark
          // both cars "in contact" so the AI eases off steering this way and
          // stops fighting the push (the cause of the side-by-side vibration).
          const sgn = dX >= 0 ? 1 : -1;
          const corr = Math.max(penLat - 0.05, 0) * 0.35;   // gentler push -> rub, not bounce
          a.x += sgn * corr * (iA / iSum);
          b.x -= sgn * corr * (iB / iSum);
          // Skip scrub when corr≈0 (nest-edge / at-slop) — perpetual zero-corr
          // side contact was draining speed without separating the cars.
          if (corr > 0) { a.speed *= rubScrub; b.speed *= rubScrub; }
          a.contactT = b.contactT = 0.22;   // "rubbing" — AI eases off steering
          if (last) collideFx(a, b, Math.abs(a.speed - b.speed) * 0.02 + 0.18);
        } else {
          // rear-end: separate along the track and nudge speeds together (gentle,
          // so hitting a car ahead doesn't slam you to a stop — you bump and tuck in)
          const sgn = dProg >= 0 ? 1 : -1;
          const corr = Math.max(penLong - 0.05, 0) * 0.4;
          shiftLong(a, sgn * corr * (iA / iSum));
          shiftLong(b, -sgn * corr * (iB / iSum));
          const relV = sgn >= 0 ? b.speed - a.speed : a.speed - b.speed;   // >0 means the rear car is closing
          if (relV > 0) {
            const jImp = 0.5 * relV / iSum;   // soft momentum exchange (was 1.15)
            if (sgn >= 0) {
              b.speed = Math.max(0, b.speed - iB * jImp);
              a.speed += iA * jImp * 0.8;
            } else {
              a.speed = Math.max(0, a.speed - iA * jImp);
              b.speed += iB * jImp * 0.8;
            }
            a.contactT = b.contactT = 0.22;
            if (last) collideFx(a, b, clamp(relV * 0.03 + penLong * 0.05, 0.15, 1));
            // Debris hook (render-only side-world): closing speed = severity.
            if (last && DebrisWorld.active()) DebrisWorld.carImpact(a, b, relV);
            // Incident sim (R3/C3 + C1): a hard closing contact queues a
            // candidate. Only clears the R3 threshold for a real shunt (see
            // incidentsim); below it the cheap (prog,x) plane above stays the
            // resolver — THAT event-scoping is C3. Self-guarding no-op otherwise.
            if (last) incidentSim.notifyCar(a, b, relV);
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
    if (incidentSim.owns(a)) continue;   // Rapier owns this car's separation
    for (let j = i + 1; j < ranked.length; j++) {
      const b = ranked[j];
      if (incidentSim.owns(b)) continue;
      let dProg = a.prog - b.prog;
      if (!Number.isFinite(dProg)) continue;
      const L = track.total;
      dProg = ((dProg + L / 2) % L + L) % L - L / 2;
      if (Math.abs(dProg) > LCAR) continue;
      const dX = a.x - b.x;
      if (!Number.isFinite(dX)) continue;
      const penLong = LCAR - Math.abs(dProg);
      const penLat = WCAR - Math.abs(dX);
      if (penLong <= 0 || penLat <= 0) continue;
      const iA = a.isPlayer ? 0.5 : 1, iB = b.isPlayer ? 0.5 : 1, iSum = iA + iB;
      // Match the relaxation pass for player-as-rear nest-edge contacts.
      const closing = (dProg >= 0 ? b.speed - a.speed : a.speed - b.speed) > 0.5;
      const nestEdge = closing && penLong > 1.0 && penLat < 0.5;
      const forceRear = nestEdge && ((dProg >= 0 && b.isPlayer) || (dProg < 0 && a.isPlayer));
      const sideContact = penLat < penLong && !forceRear;
      if (sideContact) {
        const c = Math.max(penLat - SLOP, 0) * 0.6;
        if (c <= 0) continue;
        const sgn = dX >= 0 ? 1 : -1;
        a.x += sgn * c * (iA / iSum);
        b.x -= sgn * c * (iB / iSum);
      } else {
        const c = Math.max(penLong - SLOP, 0) * 0.6;
        if (c <= 0) continue;
        const sgn = dProg >= 0 ? 1 : -1;
        shiftLong(a, sgn * c * (iA / iSum));
        shiftLong(b, -sgn * c * (iB / iSum));
      }
    }
  }
  // keep everyone inside the per-side barriers after being shoved around
  for (const c of ranked) {
    if (incidentSim.owns(c)) continue;   // Rapier owns the clamp for this car
    const wr = Tracks.wallAt(track, c.s, 1), wl = Tracks.wallAt(track, c.s, -1);
    if (c.x > wr) c.x = wr; else if (c.x < -wl) c.x = -wl;
  }
  // The player runs world-space physics; if this pass actually MOVED its (s, x)
  // — a bump, a shove, a barrier clamp — feed that back into px/pz, or the next
  // frame's integration would overwrite the push and cars would slide through
  // each other. Heading is unchanged by a bump.
  //
  // ONLY when it moved. This used to run every frame unconditionally, which
  // quietly turned world → (s, x) → world into a per-frame feedback loop; with a
  // reconstruction that wasn't quite the inverse of the read (see
  // worldFromTrack) the loop had gain < 1 and dragged the car onto the
  // centreline. Untouched frames must leave the car's own integration alone.
  if (player && player.px != null && !player.finished && !incidentSim.owns(player) &&
      (player.s !== _preColS || player.x !== _preColX)) {
    const w = worldFromTrack(player.s, player.x, smp);
    player.px = w.x;
    player.pz = w.z;
  }
}

function updateCar(c, dt, ranked) {
  if (c.finished) { coast(c, dt); c._prevS = c.s; return; }
  // Incident-sim takeover (R2/R3/C1): while Rapier owns this car's 6-DoF body,
  // the bespoke integration + wall clamp + collision writeback are SKIPPED —
  // postStep drives px/pz/head/(s,x) from the dynamic body instead. Bounded and
  // fallback-guarded; outside the window this early-out is never taken.
  if (incidentSim.owns(c)) { c._prevS = c.s; return; }
  Tracks.sample(track, c.s, smp);
  const hw = smp.hw;
  const slopeSin = smp.t[1] || 0;   // road pitch at the car (+uphill / -downhill)
  const k = Tracks.curvature(track, c.s);
  c.kCur = k;   // cache for the render loop's body-lean (avoids a 2nd curvature calc/car/frame)
  const dd = DIFF[difficulty];

  // --- speed targets ---
  let vmax = VMAX * PACE * (c.isPlayer ? playerMods.speed : c.tierV * c.skill * dd.ai);
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
    const L = track.total;
    for (let i = 0; i < ranked.length; i++) {
      const o = ranked[i];
      if (o === c) continue;
      let dprog = o.prog - c.prog;
      if (!Number.isFinite(dprog)) continue;
      dprog = ((dprog + L / 2) % L + L) % L - L / 2;
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
  const wantBoost = (c.isPlayer ? c.boostOn
    : (Math.abs(Tracks.curvature(track, wrapS(c.s + 60))) < 0.006 && c.energy > 0.25))
    || c.otT > 0;   // OVERTAKE deploys on its own — even with BOOST toggled off
  if (wantBoost && c.energy > 0) {
    deploy = DEPLOY_A * deployTaper(c);
    // Deploy always produces thrust while held (see deployTaper), so it always
    // costs energy. The battery and the push are the same switch — a BOOST that
    // drains nothing is a BOOST that does nothing.
    c.energy = Math.max(0, c.energy - DRAIN * dt);
    c.deploying = deploy > 0.4;
    if (c.energy <= 0) c.boostOn = false;   // auto-release the toggle when drained
  } else c.deploying = false;

  // --- overtake mode ---
  const ahead = ranked[(c.rank || 1) - 2];
  const gapAhead = ahead && c.speed > 1 ? (ahead.prog - c.prog) / c.speed : Infinity;
  c.otArmed = gapAhead < OT_GAP && c.otCool <= 0 && c.otT <= 0 && !c.finished && c.speed > 15;
  const fire = c.isPlayer ? Input.consumeOvertake() : (c.otArmed && simRnd() < 1 - Math.exp(-0.7 * dt));
  if (fire && c.otArmed) {
    c.otT = OT_TIME; c.otCool = OT_COOL + OT_TIME;
    if (c.isPlayer && soundOn) GameAudio.deployBoost();
  }
  if (c.isPlayer && c.otArmed && !c.wasArmed && soundOn) GameAudio.overtakeReady();
  c.wasArmed = c.otArmed;

  // --- braking / target speed ---
  let braking = false;
  // Pedal travel 0..1 (analog on a pad trigger, 1 on any digital source). The
  // brake force and the longitudinal-accel estimate that feeds the friction
  // ellipse both scale by it, so easing off the brake actually hands grip back
  // to the front tyres — trail-braking you can modulate, not just stamp/lift.
  let brakeLvl = 1;
  if (c.isPlayer) {
    braking = _testInput ? !!_testInput.brake : Input.braking();
    brakeLvl = _testInput ? 1 : Math.max(0.15, Input.brakeLevel());
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
  let gearMult = 1, speedCap = vmax + 14 * Math.max(PACE, 0.05);   // ERS overspeed margin — a speed, so it rides the pace scale
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
  const onThrottle = c.isPlayer
    ? (_testInput ? !!_testInput.throttle : ((autoThrottle() && !wallPinned) || Input.throttle()))
    : true;
  if (braking) {
    if (c.speed > 0) {
      c.speed = Math.max(0, c.speed - BRAKE * (c.isPlayer ? playerMods.braking * brakeLvl : 1) * dt);
    } else if (c.isPlayer && state === "race") {
      // Stopped and still braking: crawl backwards so the player can ease off a
      // wall or re-aim after a spin. Capped slow; throttle drives forward again.
      c.speed = Math.max(REVERSE_MAX, c.speed - REVERSE_ACCEL * dt);
    }
    c.energy = Math.min(1, c.energy + REGEN * 1.6 * dt);
  } else if (!onThrottle) {
    // coasting: gentle engine-braking/drag both ways (don't snap reverse to 0)
    if (c.speed > 0) c.speed = Math.max(0, c.speed - COAST_DRAG * dt);
    else if (c.speed < 0) c.speed = Math.min(0, c.speed + COAST_DRAG * dt);
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
    // Grass DRAG: slows you toward a crawl, and never speeds you up. The floor
    // used to be a bare Math.max, so any time you were off-track below 10.8 m/s
    // it RAISED your speed to 10.8 — you could not brake below 39 km/h on the
    // grass (BRAKE removes 0.37 m/s per frame and this put it straight back),
    // could not stop at all, and crawling out of a gravel trap at 3 m/s snapped
    // you to 10.8 in a single frame. It also runs after the accel/brake/slope
    // integration, so it overrode all of them.
    // The floor is a SPEED, so it rides the pace scale — otherwise the crawl sits
    // at 24% of top speed at pace 2 and 15% at pace 5, i.e. the grass would let you
    // off progressively lighter the faster the field runs. The scrub RATE is a
    // force and stays absolute, like BRAKE.
    const grassFloor = GRASS_V * 0.6 * Math.max(PACE, 0.05);
    if (c.speed > grassFloor) {
      c.speed = Math.max(grassFloor, c.speed - (20 + offDepth * 28) * dt);
    }
    c.offT += dt;
    if (c.offT > 1.2) {
      c.offT = -2;   // grace before next count
      c.cuts++;
      // Penalty applies to EVERY car (it feeds race classification) so the AI
      // can't cut corners for free; only the player gets the on-screen cues.
      if (c.cuts >= 4) {
        c.penalty += 5;
        if (c.isPlayer) { announce("+5s TRACK LIMITS PENALTY", 2); if (soundOn) GameAudio.penalty(); }
      } else if (c.isPlayer) {
        announce("TRACK LIMITS " + c.cuts + "/4", 1.2);
        if (soundOn) GameAudio.offtrack();
      }
    }
  } else if (c.offT > 0) c.offT = Math.max(0, c.offT - dt);

  // --- kerbs (drivable, unlike walls): riding one rumbles and costs a little
  // grip + speed, but you can stay on it. Distinct from going off into grass.
  if (c.onKerb) {
    c.speed -= 6 * dt;                       // slight scrub (raw contact only)
    if (c.isPlayer) c.kerbCueT = KERB_CUE_HOLD;
  }
  // The raw onKerb flag is a floor-indexed per-node lookup (TrackMesh.onKerb)
  // and flickers at the ~4 m node rate at speed (≈20 Hz at 300 km/h) when the
  // car straddles the kerb line. Run the CUES on a short sticky hold so
  // rumble/shake/haptics read as one continuous kerb strike instead of a
  // machine-gun re-arm of the trauma shake every node.
  if (c.isPlayer && (c.kerbCueT = Math.max(0, (c.kerbCueT || 0) - dt)) > 0) {
    shake = Math.max(shake, KERB_SHAKE);     // continuous light rumble via shake
    c.kerbSndT = (c.kerbSndT || 0) - dt;
    if (soundOn && c.kerbSndT <= 0) { GameAudio.rumble(); c.kerbSndT = 0.07; }
    if ((c.kerbHapT = (c.kerbHapT || 0) - dt) <= 0) { if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} } Input.rumble(0.25, 90); c.kerbHapT = 0.12; }
  }

  // --- lateral ---
  let steer;
  if (c.isPlayer) {
    steer = _testInput ? (_testInput.steer ?? 0) : Input.steer();
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
    // Full field with wrapped Δprog — rank-neighbour walks miss lapped cars
    // that share the same stretch of track.
    const ci2 = (c.rank || 1) - 1;
    const Ltrk = track.total;
    for (let k = 0; k < ranked.length; k++) {
      if (k === ci2) continue;
      const o = ranked[k];
      let dp = o.prog - c.prog;
      if (!Number.isFinite(dp)) continue;
      dp = ((dp + Ltrk / 2) % Ltrk + Ltrk) % Ltrk - Ltrk / 2;
      const adp = Math.abs(dp);
      if (adp > 6.5) continue;
      const dx = c.x - o.x, adx = Math.abs(dx);
      const deficit = MIN_GAP - adx;
      if (deficit <= 0) continue;
      sep += (dx >= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);
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
  const latFac = clamp(vStd(Math.abs(c.speed)) / 18, 0, 1);
  const gripScale = 1 - clamp((vStd(c.speed) - 20) / (VMAX - 20), 0, 1) * 0.28;
  // Riding a kerb loses a little grip — damped continuous instead of a binary
  // 1↔0.7 flip: the raw flag flickers at the ~4 m node rate at speed, and a
  // 30% lateral-grip square wave at ~20 Hz was genuine yaw dither in the
  // physics. λ=12 (τ≈83 ms): a solid kerb ride reaches the full 0.7 penalty in
  // ~0.25 s (handling penalty preserved); a one-tick flicker moves grip <2%.
  // Deterministic (damp is exp-based, dt here is the fixed PHYS_DT).
  const kerbGrip = (c.kerbGripSm = damp(c.kerbGripSm ?? 1, c.onKerb ? 0.7 : 1, 12, dt));
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
    // (speedRefFromSlider in js/game/steer-tuning.js) is untouched.
    const lockTaper = Math.max(0.4, 1 - vStd(Math.abs(c.speed)) / STEER_SPEED_REF);
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
    // --- the car drives ITS OWN line, not the centreline (see frenetH).
    // Everything below that used to read the centreline's curvature k now reads
    // kPath: the curvature of the arc the car is ACTUALLY on, `x` metres to the
    // side of it. Outside of a corner = bigger radius = less curvature; inside =
    // tighter. Feeding the centreline's k to a car that isn't on the centreline
    // is what made the middle of the road feel "sticky": the assist always asked
    // for the centreline's radius, so it over-steered you whenever you ran wide
    // and under-steered you whenever you took an apex, quietly herding the car
    // back to the middle and fighting any line of your own.
    const hFrenet = frenetH(c.s, c.x);
    const kPath = k / hFrenet;
    let yawEase = 1;
    const rNeed = c.speed * kPath;
    if (rNeed !== 0) {
      const ratio = (c.yawRateCur || 0) / rNeed;   // >1 = rotating faster than needed
      if (ratio > 1) yawEase = clamp(1 - (ratio - 1) * 0.6, 0.3, 1);
    }
    const assistDelta = -ROAD_FOLLOW * (WHEELBASE + ASSIST_KUS * c.speed * c.speed * brakeFade) * kPath * yawEase * offAssistFade;
    // --- RACING LINE assist (pause-menu slider; 0 = off, the default). Two
    // things deliberately set it apart from the line the AI drives.
    //   1. It is the PLAYER's line. The AI aims at `-k·130` — the inside of
    //      whichever corner it is in right now — so it sits mid-track on entry
    //      and exit and only ever finds the apex. This samples the corner AHEAD
    //      and the one just BEHIND as well, so the car is opened out wide before
    //      turn-in and allowed to run wide on exit: the out-in-out arc, which the
    //      AI's formula cannot express.
    //   2. It acts through the FRONT TYRE like every other steering input. The
    //      old version added straight to c.x, sliding the car across the road
    //      without turning it — the chassis crabbed, and the assist could drag
    //      the car sideways through grip it did not have (or into a wall).
    let lineDelta = 0;
    if (raceLineAssist !== 0) {
      const look = clamp(Math.abs(c.speed) * 0.9, 25, 90);
      const kAhead = Tracks.curvature(track, wrapS(c.s + look));
      const kBehind = Tracks.curvature(track, wrapS(c.s - look * 0.7));
      // k > 0 curves toward screen-left, so the inside is -x: -k pulls to the
      // apex of this corner, +kAhead/+kBehind push wide for the next/last one.
      const lineX = clamp(-k * 170 + (kAhead + kBehind) * 85, -0.72, 0.72) * Math.max(0, hw - 0.6);
      // Pure pursuit: closing a lateral error e over a look-ahead distance Ld
      // needs a path curvature of about 2e/Ld², and a road-wheel angle of
      // WHEELBASE × that. Speed-scaling falls out of Ld, so the correction stays
      // gentle at 300 km/h and still finds the line in a slow corner.
      const Ld = clamp(Math.abs(c.speed) * 1.2, 22, 70);
      lineDelta = raceLineAssist * LINE_PURSUIT * WHEELBASE * 2 * (lineX - c.x) / (Ld * Ld) * offAssistFade;
    }
    const delta = clamp(driverDelta + assistDelta + lineDelta, -0.7, 0.7);
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
    const axEstTarget = braking ? -BRAKE * brakeLvl
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
    // Aero load (rises with v²) replaces the old speed taper, and the surface the
    // car is actually on now scales lateral grip — see DOWNFORCE / OFF_GRIP.
    const aeroGrip = 1 + DOWNFORCE * Math.min(1, (Math.abs(c.speed) / vTop())) ** 2;
    const offDepth = clamp((Math.abs(c.x) - hw) / 1.5, 0, 1);
    const surfMu = c.onKerb ? 1 : lerp(1, OFF_GRIP, offDepth);
    // B3 (marbles-affect-grip, flag apex26.marbleGrip): an EXTERNAL grip scalar
    // for a player sitting on a settled off-line marble cluster, fed in ALONGSIDE
    // gripMult()/kerbGrip/bankMu here — the existing mu-scaling seam. It NEVER
    // touches LONG_GRIP or slipFactor (computed above, untouched) and never moves
    // the car; it is a pure function of deterministic marble positions and returns
    // 1.0 (a true no-op) off-path. Subtle by construction (≤7% via MARBLE_GRIP_MIN).
    const marbleMu = DebrisWorld.active() ? DebrisWorld.marbleGrip(c) : 1;
    const muBase = LAT_MAX * PLAYER_GRIP * aeroGrip * surfMu * kerbGrip * gripMult() * playerMods.cornering * bankMu * (1 + vertLoad) * slipFactor * marbleMu;
    const muF = Math.max(0.5, muBase * loadF * FRONT_GRIP);
    const muR = Math.max(0.5, muBase * loadR * (1 - DRIFT * 0.55));
    const csR = CS_REAR * (1 - DRIFT * 0.40);            // looser rear also softens its stiffness
    // --- slip angles: each axle's lateral travel (body frame) vs its forward
    // travel, minus the steer it's pointed at. vx is floored so the atan stays
    // well-conditioned at low speed.
    // Signed longitudinal speed (floored away from 0) so reverse slip angles
    // stay well-conditioned instead of collapsing to +4 m/s forward.
    const vx = (c.speed < 0 ? -1 : 1) * Math.max(Math.abs(c.speed), 4);
    const slipF = Math.atan2((c.vLat || 0) + af * (c.yawRateCur || 0), vx) - delta;
    const slipR = Math.atan2((c.vLat || 0) - ar * (c.yawRateCur || 0), vx);
    // Debris side-world (A2): shed tyre marbles under lock-up / slide. Reads the
    // already-computed combined-slip signals READ-ONLY; cosmetic, never grip.
    if (DebrisWorld.active())
      DebrisWorld.tyreMarble(c, { lock: axFrac, slip: Math.max(Math.abs(slipF), Math.abs(slipR)), speed: c.speed });
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
    // …and MOVE THE CAR, in world metres. This is the whole model: a rigid body
    // going where its own tyres point. The road is not in this equation.
    //
    // (s, x) used to be the authority here, with the world position rebuilt from
    // it every frame — so the car lived inside the road's coordinate chart and
    // inherited every kink and stretch in it. Now the arrow points the other way:
    // px/pz/head are the truth, and (s, x) is READ BACK off them below purely so
    // the rest of the game (lap timing, walls, kerbs, race position, the HUD) can
    // ask "where on the track is that?".
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
    const give = (c.contactT > 0) ? 0.4 : 1;
    c.x += steer * STEER_VMAX * latFac * gripScale * kerbGrip * gripMult() * bankMu * give * dt;
    // Debris side-world (A2): AI cars don't run the slip model, so estimate a
    // slide from lateral-g demand (|k|·v²/g) and treat hard braking at speed as
    // lock-up. READ-ONLY, cosmetic — matches the player marble hook.
    if (DebrisWorld.active()) {
      const latG = Math.abs(k) * c.speed * c.speed / 9.8;   // ~lateral g demand
      DebrisWorld.tyreMarble(c, {
        lock: (braking && c.speed > 30) ? 0.95 : 0,
        slip: Math.max(0, Math.min(1, latG - 1.6)) * 0.14,   // → ~slip-angle rad at the limit
        speed: c.speed });
    }
  }
  // set skid intensity once per frame (used by audio and by visual marks)
  if (c.isPlayer) {
    // Squeal from the CAR's own slip, not from the road's curvature. This used to
    // be |k| * speed — so the tyres screamed because the ROAD bent, even if you
    // were driving dead straight through the corner with the tyres perfectly
    // stuck, and stayed silent while you were genuinely sliding down a straight.
    // With the assists off the arc must not reach the driver at all, and that
    // includes what they hear. Body slip angle: ~6 deg starts to talk, ~17 deg is
    // a full slide.
    const slipAng = Math.abs(Math.atan2(c.vLat || 0, Math.max(4, Math.abs(c.speed))));
    c.skidIntensity = c.offroad ? 0.5
      : clamp((slipAng - 0.10) / 0.20, 0, 1);
  }
  // wall
  // The driving boundary is per-side and derived from where solid barriers were
  // actually placed (Tracks.wallAt), so the car always stops just before a model
  // instead of clipping through it — consistent across street and open circuits.
  const wallR = Tracks.wallAt(track, c.s, 1);
  const wallL = Tracks.wallAt(track, c.s, -1);
  let xPinned = false;   // did the barrier clamp c.x? (see the writeback below)
  if (c.x > wallR || c.x < -wallL) {
    const into = c.x > wallR ? 1 : -1;          // +1 = hit right wall, -1 = left
    // Debris hook (render-only side-world): the pre-clamp overshoot is the
    // lateral speed into the wall × dt — the impact severity. First frame only.
    if (!c.wasOnWall && DebrisWorld.active()) {
      const xOver = into > 0 ? c.x - wallR : -wallL - c.x;
      DebrisWorld.wallImpact(c, into, xOver);
      // B2 (breakable barriers, flag apex26.breakBarriers): a hard hit promotes
      // nearby BARRIER panels to jointed Rapier bodies that scatter. COSMETIC —
      // the bespoke xPinned clamp below is UNCHANGED; broken panels are never a
      // collision surface for the car (that would be R3). promoteBarrier gates
      // on its own severity minimum and is a no-op when the flag is off.
      const _wallSev = xOver * 60 + Math.abs(c.speed || 0) * 0.15;
      DebrisWorld.promoteBarrier(c, into, _wallSev);
      // Incident sim (R2 airborne): a GENUINELY hard wall strike launches this
      // car into a bounded 6-DoF Rapier tumble (queued now, promoted in preStep).
      // Only clears R2_WALL_SEV — ordinary scrapes never trigger. The bespoke
      // xPinned clamp below still runs this trigger frame; the takeover begins
      // next tick from the resulting pose. Self-guarding no-op otherwise.
      incidentSim.notifyWall(c, into, _wallSev);
    }
    c.x = into > 0 ? wallR : -wallL;
    xPinned = true;
    if (c.isPlayer) {
      // Slide along the barrier instead of stopping dead. Decompose the car's
      // heading into the part running ALONG the wall (kept) and the part driving
      // INTO it (killed): a shallow scrape barely slows you and you keep sliding,
      // a head-on hit scrubs hard. The nose is rotated toward the wall tangent so
      // the car runs parallel rather than re-pinning every frame.
      Tracks.sample(track, c.s, smp);
      // The BARRIER's own tangent, not the centreline's. This used to measure
      // against the road tangent while the comment claimed it was the wall — so
      // anywhere the barrier diverges from the road (a run-off funnel, an escape
      // road, a pit entry) the car was straightened to a direction the wall does
      // not actually run in. wallAt() gives the boundary's lateral offset, so its
      // slope in s IS the barrier's heading in the road frame.
      const wallXAt = (ss) => into > 0 ? Tracks.wallAt(track, ss, 1)
                                       : -Tracks.wallAt(track, ss, -1);
      const dW = 3;
      const wSlope = clamp((wallXAt(wrapS(c.s + dW)) - wallXAt(wrapS(c.s - dW))) / (2 * dW), -2, 2);
      const wtx = smp.t[0] + smp.r[0] * wSlope, wtz = smp.t[2] + smp.r[2] * wSlope;
      const tHead = Math.atan2(wtx, wtz);
      let rel = c.head - tHead;
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      const noseIn = into > 0 ? rel > 0 : rel < 0;        // nose pointing into wall?
      const incidence = Math.min(1, Math.abs(Math.sin(rel)));  // 0 graze … 1 head-on
      // Kill the slip while scraping a barrier, in BOTH directions.
      //
      // A previous pass made this directional — zeroing only slip heading INTO
      // the wall — reasoning that erasing slip away from it stopped the car
      // rotating out of a scrape. Sound in isolation, wrong in effect: a car at
      // full lock washes wide into the barrier, and letting it keep lateral
      // velocity there means the slide never decays. Bisected to this line:
      // tests/drift.spec.js went 6/0 -> 4/2, with "full lock washes wide, never
      // spins" reaching 82 deg of slip against its 45 deg limit, and "slide
      // self-aligns" failing alongside it. The wall is a hard constraint; slip
      // against it is not something the car gets to keep.
      if (c.vLat) c.vLat = 0;
      if (noseIn) {
        // first-frame impact: lose only the normal component — a graze is nearly
        // free, a head-on hit bites hard.
        if (!c.wasOnWall) c.speed *= 1 - incidence * (track.street ? 0.5 : 0.28);
        // straighten the nose toward the wall tangent so the car slides along it
        // Exponential, not a raw rate*dt: Math.min(1, ...) SNAPPED the heading
        // exactly onto the tangent in a single step at any dt >= 0.083 s (a 12 fps
        // frame, or a headless step()), making the rotation frame-rate dependent.
        // Scaled by speed as well — a car sitting still against a barrier has no
        // velocity to justify being turned, and the old form spun a stopped or
        // spun car parallel in ~0.2 s regardless.
        const wallAlign = (1 - Math.exp(-(4 + incidence * 8) * dt))
                        * clamp(Math.abs(c.speed) / 8, 0, 1);
        c.head -= rel * wallAlign;
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
        const scrub = pushIn * (track.street ? 40 : 16) * dt;
        if (c.speed > 0) c.speed = Math.max(0, c.speed - scrub);
        else if (c.speed < 0) c.speed = Math.min(0, c.speed + scrub);
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
  // Re-sample at the NEW c.s — the yawVis block below reads the tangent here.
  //
  // The barrier is the ONE thing allowed to move the player in ROAD coordinates,
  // because it is a hard constraint rather than a suggestion: when it clamps c.x,
  // that has to be pushed back into the authoritative world position. Every other
  // frame the arrow points the other way (world → (s, x)), so this rebuild is now
  // CONDITIONAL. It used to be unconditional — correct back when (s, x) was the
  // authority, but fatal now: it would overwrite the car's own integration with a
  // point reconstructed from the road every single frame, quietly putting the car
  // straight back onto the road's rails.
  if (c.isPlayer && c.px != null) {
    if (xPinned) {
      const w = worldFromTrack(c.s, c.x, smp);   // exact inverse of trackFrom
      c.px = w.x;
      c.pz = w.z;
    } else {
      Tracks.sample(track, c.s, smp);            // yawVis below needs the tangent
    }
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
  if (!(c.isPlayer && c.head != null)) c.yawVis = damp(c.yawVis, yawTarget, 6, dt);
  // Chassis pitch/roll/heave (brake dive, throttle squat, cornering lean, kerb
  // bob) now live in the C2 visual-suspension springs (js/game/bodyattitude.js),
  // advanced per car in the render loop from axEstSm/speed/yawRateCur/kCur +
  // road height. Render-only — see BodyAttitude.
  // Brake-disc heat (render-only): glows up while braking at speed, cools after.
  // Drives the emissive brake-glow rings on the player's wheels.
  {
    // ALL cars (the AI brake into corners too — a field of glowing discs).
    const heating = braking && c.speed > 12;
    c.brakeHeat = clamp((c.brakeHeat || 0) + (heating ? dt * 1.6 : -dt * 0.9), 0, 1);
  }
  if (c.isPlayer) {
    // Combustion after-fire is a short throttle-lift transient, not a continuous
    // arcade torch. ERS deployment is electric and never feeds this state.
    const lifted = !!c.wasOnThrottle && !onThrottle && c.speed > 8;
    c.exhaustPop = lifted ? 1 : Math.max(0, (c.exhaustPop || 0) - dt * 5);
    c.wasOnThrottle = !!onThrottle;
  }
  c.collideT = Math.max(0, c.collideT - dt);
  c.contactT = Math.max(0, (c.contactT || 0) - dt);

  // --- advance along track ---
  // Player s was advanced by velocity·tangent above; AI advances by speed*dt in Frenet.
  let oldS = c._prevS ?? c.s;
  if (!c.isPlayer) c.s = wrapS(c.s + c.speed * dt);
  // Progress is the cumulative arc-length. For the PLAYER, derive it from the
  // actual (signed, wrap-aware) change in s — NOT speed*dt — so prog stays exactly
  // coupled to s, and going backwards (a spin/reverse) correctly DECREASES prog
  // instead of cheating progress forward.
  const L = track.total;
  let ds = c.s - oldS;
  if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;   // signed wrap
  
  // If ds is huge, the car was teleported (jump/park). Reset to prevent glitches.
  if (Math.abs(ds) > 20) {
    ds = c.speed * dt;
    oldS = wrapS(c.s - ds);
  }

  if (c.isPlayer) {
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
    // A takeover (R2/R3/C1) during this lap invalidates it EXPLICITLY: the car
    // was moved by Rapier, so the lap is not a legitimate timed lap. Don't let it
    // set a personal best or become the stored ghost; just start the next lap
    // clean. The flag is set by IncidentSim and cleared here at the line.
    const lapValid = !c.incidentInvalidLap;
    if (c.lap > 1) {
      const lapDone = c.lapTime;
      c.lastLap = lapDone;
      if (lapValid && lapDone < c.best) c.best = lapDone;
      if (c.isPlayer && soundOn) GameAudio.lap();
      if (c.isPlayer && isTimeTrial()) { if (lapValid) onTTLap(lapDone); else Ghost.startLap(); }
    } else if (c.isPlayer && isTimeTrial()) {
      Ghost.startLap();
    }
    c.incidentInvalidLap = false;   // the new lap starts clean
    c.lapTime = 0;
    if (c.isPlayer) { sectorIdx = 0; sectorStartT = 0; }
    if (c.isPlayer && c.lap === lapsTarget) announce("FINAL LAP", 1.6);
    if (c.lap > lapsTarget) {
      c.finished = true;
      c.finishT = raceT;
      if (c.isPlayer) announce("FINISH!", 2);
    }
  }
  // Skip ghost recording while the current lap is incident-invalidated (a
  // takeover jumps s/x — recording it would corrupt the ghost trace).
  if (isTimeTrial() && c.isPlayer && !c.incidentInvalidLap) Ghost.record(c.lapTime, c.s, c.x);

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
    // Being OFF-TRACK is not the same as being stuck. The driving boundary sits
    // ~9 m beyond the road edge, so a driver can be metres into a wide run-off,
    // fully in control and steering back to the track — and the bare c.offroad
    // clause used to teleport them anyway after 3 s: to x = 0, heading force-
    // aligned to the tangent, and speed RAISED to 16 m/s. Rescue is for being
    // beached, so it now needs the car to actually be going nowhere. Same
    // principle the stoppedOnTrack clause above already applies to a parked car.
    // (Reachable now that grass drag no longer pins you at 10.8 m/s.)
    // Threshold sits just ABOVE the off-track speed floor, not below it. Grass drag
    // bottoms the car out at GRASS_V * 0.6 = 10.8 m/s, so the old `< 8` could never
    // be reached by a car stuck in the run-off — it idles along at the floor
    // forever, above the gate, and never counts as beached. Measured: a wrong-way
    // car sat at 10.8 m/s and x = -10.9 while its rescue timer decayed back to 0.
    const beached = c.offroad && c.speed < GRASS_V * 0.6 + 1.5;
    const stuck = beached || c.wrongWay || (c.speed < 4 && (c.wallT || 0) > 0) || stoppedOnTrack;
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
  c._prevS = c.s;
}

// B1 — debris caution state machine. Consumes the deterministic
// DebrisWorld.hazards() picture (settled debris/broken panels ON the racing
// surface, bucketed per sector) at ~4 Hz and resolves the flag state with
// hysteresis: a caution raises immediately but only lowers after CAUTION_MIN_HOLD
// (or a hard time cap), so it can't flicker as debris despawns. READ-ONLY: it
// sets flag state + drives the HUD; it never touches any car's motion. Inert
// unless the debris side-world is live AND apex26.caution is on AND we're racing.
const _CAUTION_LBL = ["GREEN", "YELLOW", "VSC", "SAFETY CAR"];
function resetCaution() {
  caution = { level: 0, sector: -1, frac: 0, total: 0, sectors: [0, 0, 0], sinceT: 0, cause: "" };
  _cautionQT = 0;
}
function updateCaution(dt) {
  if (!_cautionOn || !DebrisWorld.active() || state !== "race") {
    if (caution.level !== 0) resetCaution();
    return;
  }
  if (caution.level !== 0) caution.sinceT += dt;
  _cautionQT += dt;
  if (_cautionQT < 0.25) return;   // query hazards at ~4 Hz
  _cautionQT = 0;
  const hz = DebrisWorld.hazards();
  let desired = 0, dsector = -1, dfrac = 0, dcause = "";
  if (hz.total >= CAUTION_SC_MIN) { desired = 3; dcause = "SAFETY CAR"; }
  else if (hz.total >= CAUTION_VSC_MIN) { desired = 2; dcause = "VSC"; }
  else if (hz.worst.count >= CAUTION_YELLOW_MIN) {
    desired = 1; dsector = hz.worst.sector; dfrac = hz.worst.frac; dcause = "YELLOW";
  }
  caution.total = hz.total;
  caution.sectors = hz.sectors.slice();
  if (desired > caution.level) {
    caution.level = desired; caution.sector = dsector; caution.frac = dfrac;
    caution.cause = dcause; caution.sinceT = 0;
  } else if (desired < caution.level) {
    const cap = caution.level >= 2 ? CAUTION_SC_MAX : CAUTION_YELLOW_MAX;
    if (caution.sinceT >= CAUTION_MIN_HOLD || caution.sinceT >= cap) {
      caution.level = desired;
      caution.sector = desired === 1 ? (dsector >= 0 ? dsector : caution.sector) : -1;
      caution.frac = dfrac; caution.cause = dcause; caution.sinceT = 0;
    }
  } else if (desired === 1 && dsector >= 0) {
    caution.sector = dsector; caution.frac = dfrac;   // track the worst sector
  }
}
function cautionInfo() {
  return {
    level: caution.level, label: _CAUTION_LBL[caution.level] || "GREEN",
    sector: caution.sector, frac: caution.frac, total: caution.total,
    sectors: caution.sectors, sinceT: +caution.sinceT.toFixed(2), cause: caution.cause,
    enabled: _cautionOn,
  };
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
  // A finished car is driven kinematically in (s, x) — so the PLAYER's world
  // position has to be carried along with it. Without this the car is rendered
  // from a px/pz that stopped updating at the finish line (renderPosOf) while the
  // camera, anchored to s/x, drives away down the track: the car sits frozen on
  // the line for the ~2 s until the results screen. Heading follows the road
  // because nothing is steering any more.
  if (c.isPlayer && c.px != null) {
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x; c.pz = w.z;
    c.head = Math.atan2(smp.t[0], smp.t[2]);
  }
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
const _APPLY_RACE_IDS = new Set(["sunTemp", "sunElev", "sunAzim", "cloudCover", "moonBright", "cityGlowMul", "cityGlowTint", "ambTemp", "ambBalance", "skyColorSat", "fogColorSat"]);
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

// Per-frame light assembly (nearest-N flood cull + car tail lights) lives in
// js/game/lighting.js (LightTune.setFrameLights / appendCarTailLights).
const _rainLightOpts = { emissive: 1, roughness: 0.9, specular: 0, noAlphaWrite: true };
const _wheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };
const _ersLightOpts = { emissive: 1.0, roughness: 1, specular: 0, noAlphaWrite: true, alpha: 1 };
const _flameOpts = { emissive: 1.0, roughness: 1, specular: 0, alpha: 1, noAlphaWrite: true };
const _lightFwd = [0, 0, 0];   // camera-forward scratch for the ahead-biased cull
function setFrameLights(eye, scale, fwd) {
  LightTune.setFrameLights(frame, track, cars, eye, scale, fwd, gfx.mobileTier);
}
function appendCarTailLights() {
  LightTune.appendCarTailLights(frame, track, cars, player);
}

// ---------- render ----------
// Reusable camera-vantage solver — lives in js/game/cameras.js (GameCams).
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
      teamId: team.id,   // per-team chassis style shows in the setup turntable too
      num: team.drivers && team.drivers[0] && team.drivers[0].num,
      parts: Parts.getVisualTiers(getTeamParts(team.id), team),
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
  // Matte preview: the glossy clear-coat + sharp speculars from the studio ring
  // lights bloom across the bodywork and wash the livery out to a pale sheen.
  // Soften them here so the setup screen shows the TRUE livery colour. This is a
  // preview-only override — the in-race PAINT_* materials are untouched, so the
  // car still reads glossy on track.
  spMat.clearcoat = 0.1;
  spMat.specular = 0.22;
  spMat.roughness = clamp(spMat.roughness * 2.4, 0.02, 1);   // spread + dim the speculars
  spMat.metalness = Math.min(spMat.metalness, 0.05);
  gfx.draw(getSetupPreviewMesh(), MAT_REFLECT_X, spMat);
  drawCarDecals(Teams.LIST[teamIdx], MAT_REFLECT_X, false,
    carDecalNum(Teams.LIST[teamIdx], null), false, true);
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
// depthBias [factor, units]: the start line is a DECAL laid on the asphalt, so
// bias its depth toward the camera rather than relying on the small geometric
// lift alone — that lift is fixed in metres and loses to depth quantisation at
// range, which is what makes a decal shimmer and drop out as you approach.
const _startBias = [-1, -2];
const _wmStartWet = { roughness: 0.16, specular: 0.80, detail: 0, depthBias: _startBias };
const _wmStartN = { emissive: 0.10, roughness: 0.80, specular: 0.22, detail: 0, depthBias: _startBias };
const _wmStartD = { roughness: 0.80, specular: 0.22, detail: 0, depthBias: _startBias };
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
  if (!hideMeshes.props && track.meshes.glass) gfx.drawChunked(track.meshes.glass, MAT_IDENT, _wmGlass);
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
  let eyeT, tgtT, fovT, roadCamRoll = 0;
  if (state === "menu" || state === "select") {
    // slow flyby
    const s = wrapS((performance.now() * 0.012) % track.total);
    Tracks.sample(track, s, smp);
    eyeT = [smp.p[0] + smp.r[0] * 26 , smp.p[1] + 17, smp.p[2] + smp.r[2] * 26];
    tgtT = [smp.p[0] + smp.t[0] * 40, smp.p[1] + 2, smp.p[2] + smp.t[2] * 40];
    fovT = 58;
  } else {
    if (!player) return;
    // Anchor the camera to the SAME (s, x) the car body samples — playerAnchor
    // derives it from the drawn WORLD position, shared with currentCarGroundMat
    // and the body loop, so camera and car move as one (no fore/aft slide, no
    // backwards jolt, no height/orientation jitter). Pre-jump/menu → arc interp.
    const pa = playerAnchor(player);
    const pS = pa.cS, px = pa.cX;
    Tracks.sample(track, pS, smp);
    // NOTE: the camera rig is still built from (pS, px) inside camVantage(). That
    // is a much smaller coupling than the body had — (s, x) is now an exact
    // reading of the world position, so the rebuilt anchor lands within a
    // centimetre of the car, versus the 0.1 s lateral LAG the mesh carried. Left
    // alone deliberately rather than reworked blind.
    // ride the bank with the car so the camera doesn't sink into the banked road
    const bankCam = Tracks.banking(track, pS, px);
    const bankDy = bankCam ? bankCam.dy : 0;
    const mode = CAM_MODES[camMode].id;
    roadCamRoll = bankCam && cameraFollowsBank(mode) ? -bankCam.roll : 0;
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
    const rpCam = renderPosOf(player, pS, px);
    const vant = camVantage(mode, pS, px, player.speed, performance.now(), {
      bankDy, deploy: player.deploying, slipLat: player.vLat || 0,
      // the car's real world pose, so the chase rig can follow the CAR
      carPos: rpCam.world ? [rpCam.x, rpCam.z] : null,
      carHead: headInterp(player),
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
    // "the car is alive under you" cue. DISABLED on a wet road: it jitters the
    // eye/target ~10-18 Hz every frame, and the wet-road SSR is a screen-space,
    // camera-dependent reflection — so the buzz flipped the reflection's
    // hit/miss pattern each frame and the wet road FLICKERED in patches from
    // the cockpit. On a dry road there's no such reflection, so the buzz stays
    // for feel; on a wet road we drop it to keep the reflection stable. Also
    // fades in with speed so it never jitters a slow/standing car.
    const _buzzWet = 1.0 - clamp((frame.wetness || 0) * 2.0, 0.0, 1.0);
    if (state === "race" && _buzzWet > 0.01 && (mode === "cockpit" || mode === "hood" || mode === "tcam")) {
      const spV = clamp(player.speed / vTop(), 0, 1);
      const vAmp = (spV * spV * 0.022 + (player.deploying ? 0.008 : 0)) * _buzzWet;
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

  // Car-follow cameras counter-rotate by the road bank so the car and asphalt
  // read level while the horizon carries the banking cue. Slip adds a small
  // dynamic lean on top; broadcast/debug cameras remain world-level.
  if (dbgCam) {
    camRoll = 0;
  } else {
    // Slip source smoothed at λ10 (τ≈0.1 s): vLat/speed are RAW 60 Hz-stepped
    // physics values, and feeding them straight into screen roll printed every
    // physics step onto the horizon — the most visible jitter class. λ7 on the
    // roll itself matches the old linear dt/0.15 blend at 60 fps
    // (1−e^(−7/60) ≈ 0.110 ≈ (1/60)/0.15) but is frame-rate independent, so
    // 30 and 120 Hz devices converge at the same real-time rate.
    const slipRaw = player && player.speed > 1 ? (player.vLat || 0) / player.speed : 0;
    camSlipSm = damp(camSlipSm, clamp(slipRaw, -1, 1), 10, dt);
    camRoll = damp(camRoll, roadCamRoll + camSlipSm * 0.07, 7, dt);
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
  // Per-camera near plane. Depth precision is governed by the near:far RATIO,
  // and a 0.3 m near against a 900 m far spends almost all of it in the first
  // few metres — which is why distant coplanar geometry z-fights. The near
  // plane CANNOT simply be raised globally: the cockpit rig sits 0.39 m from
  // the eye (see _rigT), so anything above ~0.35 slices the steering wheel and
  // fascia out of frame. Only cockpit/hood views have geometry that close, so
  // they keep 0.3 and every other view takes a near plane that buys back a lot
  // of depth resolution for free.
  const _projMode = CAM_MODES[camMode] ? CAM_MODES[camMode].id : "chase";
  const _nearM = (_projMode === "cockpit" || _projMode === "hood") ? 0.3 : 0.9;
  M4.perspectiveTo(_mProj, fovY, gfx.aspect, dbgCam ? 0.3 : _nearM, farPlane);
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
  // Radial draw-distance cull for chunked scenery.
  // Free/debug camera: mobile caps at 700 m (the pushed-out photo-mode far
  // plane can frame a whole ~5 M-vert city and jetsam-kill the tab); desktop
  // keeps the full vista (gfx.begin also thins the fog under dbgCam, so a
  // fog-derived cull would visibly pop there).
  // Normal play: fog-wall radial cull — past ~95% fog opacity (3/density) a
  // chunk is invisible anyway, so skip it. Only kicks in when that distance is
  // inside the 900 m far plane (night city 0.004 -> 750 m, fog/rain closer);
  // clear day (0.0012 -> 2.5 km) stays uncapped — zero visual change there.
  // Feature-shedding tier 3+ also caps the radius at the far plane: scenery
  // vertex/draw load is the one big cost class the resolution scale and shed
  // passes don't touch, and by tier 3 the device has proven it can't afford
  // the full vista (the fog wall hides most of the cut).
  const _fogCull = frame.fogDensity > 3 / 900 ? Math.ceil(3 / frame.fogDensity) : 0;
  frame.cullDist = dbgCam ? (gfx.isMobile ? 700 : 0)
    : (PerfGov.tier() >= 3 ? Math.min(900, _fogCull || 900) : _fogCull);

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

  // Resolve the moving player before any shadow-map pass. AI keeps using the
  // pooled matrices from the preceding frame; only the player's high-speed,
  // chase-camera shadow makes that latency visible.
  const _hasLivePlayerShadow = !!(player && state !== "menu" && state !== "select");
  if (_hasLivePlayerShadow) currentCarGroundMat(player, _livePlayerShadowMat, dt);

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
    // AI casts use the preceding frame's pooled transforms; the player is
    // rebuilt above from the current interpolation state. Reusing its old matrix
    // trailed the shadow by speed × frame time (6–12 m on low-FPS devices).
    // ±42 m box on the same gliding anchor (a car shadow beyond that is
    // sub-pixel), same
    // depth program and key-luminance gate as the props above. WGX mobile tiers
    // may no-op the pass (blob fallback); menu/select skip because the car loop
    // doesn't run and its pooled AI matrices would be stale race positions.
    if (gfx.carShadowBegin && LT.carShadow && PerfGov.tier() < 3 && (_hasLivePlayerShadow || _shadowCount > 0) && player &&
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
        if (_hasLivePlayerShadow) gfx.castShadow(teamMesh(player.team), _livePlayerShadowMat);
        for (let i = 0; i < _shadowCount; i++) {
          if (_shadowCars[i] !== player) gfx.castShadow(teamMesh(_shadowTeams[i]), _shadowMats[i]);
        }
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
  // ── Nearest-floodlight SPOT shadow pass ─────────────────────────────────
  // Night only: ONE lamp — the nearest/strongest to the camera — gets a real
  // per-frame 512² depth map (perspective, looking down its beam) so the car
  // driving under it throws a radial shadow away from the mast and walls carve
  // its pool + volumetric shaft. The other 31 lamps stay cone-shaped (no
  // per-light shadow cost). Casters: last frame's pooled car matrices (same
  // one-frame lag as the car sun-shadow pass) + the props/city chunks inside
  // the lamp frustum (barriers, grandstands, buildings). Desktop only — WGX
  // has no lampShadowBegin, the mobile tier never creates the map.
  if (gfx.lampShadowBegin && LT.lampShadow && PerfGov.tier() < 2 && frame.lights && !_studioRig &&
      player && state !== "menu" && state !== "select") {
    // Gate on the KEY being dim (true night): by day/dusk the sun owns the
    // shadows, and a daytime-floods pool shadow would fight the sun's.
    const _flk = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
    if (_flk <= 0.30) {
      const L = frame.lights, nRec = (L.length / 15) | 0;
      let flBest = -1, flScore = Infinity;
      for (let i = 0; i < nRec; i++) {
        const o = i * 15;
        if (L[o + 6] < 12) continue;   // skip small movers (car tail-lights, washers)
        const dx = L[o] - camEye[0], dy = L[o + 1] - camEye[1], dz = L[o + 2] - camEye[2];
        // Nearest-strongest: distance² over luminance, so a bright flood bank
        // beats a dim work lamp at similar range.
        const s = (dx * dx + dy * dy + dz * dz) /
                  Math.max(Math.max(L[o + 3], L[o + 4], L[o + 5]), 1);
        if (s < flScore) { flScore = s; flBest = i; }
      }
      if (flBest >= 0) {
        const o = flBest * 15;
        const rad = L[o + 6];
        // Perspective frustum down the beam: fov spans the OUTER cone (plus
        // margin for the soft skirt), capped where 512² texel density and
        // perspective-depth precision still hold up; far = the lamp radius
        // (nothing beyond it receives this light anyway).
        const fov = Math.min(2.6, 2 * Math.acos(clamp(L[o + 11], -0.999, 0.999)) * 1.1 + 0.15);
        const up = Math.abs(L[o + 8]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
        M4.lookAtTo(_mFlView, [L[o], L[o + 1], L[o + 2]],
          [L[o] + L[o + 7], L[o + 1] + L[o + 8], L[o + 2] + L[o + 9]], up);
        // Near plane 2.5 m: the light sits INSIDE its own fixture geometry (the
        // lamp position IS the visible lens box, with the head/arm right beside
        // it, all part of the props caster mesh) — a closer near plane renders
        // the fixture into the map and it eclipses its own beam, blacking out
        // the whole pool. 2.5 m clips the fixture; every real occluder (cars,
        // walls, the mast pole below the head) is farther out than that.
        M4.perspectiveTo(_mFlProj, fov, 1, 2.5, Math.max(rad, 10));
        M4.mulTo(_mFlVP, _mFlProj, _mFlView);
        gfx.lampShadowBegin(_mFlVP, flBest);
        if (_hasLivePlayerShadow) gfx.castShadow(teamMesh(player.team), _livePlayerShadowMat);
        for (let i = 0; i < _shadowCount; i++) {
          if (_shadowCars[i] !== player) gfx.castShadow(teamMesh(_shadowTeams[i]), _shadowMats[i]);
        }
        gfx.castShadowChunked(track.meshes.props, MAT_IDENT);
        gfx.lampShadowEnd();
      }
    }
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
  if (player && !_envProbeOff && PerfGov.tier() < 1 && !paused && !dbgCam && (_frameNo & 1) === 0 && gfx.envFaceBegin && LT.carEnvCube > 0.001 && !hideMeshes.cars) {
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
  // _mInvVP still holds this frame's inverse (computed once, right after _mVP,
  // for the god-rays); only frameSky's POINTER needs restoring — the env-probe
  // pass above may have swapped it to the probe face's inverse.
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
  _decalCount = 0;    // accumulate car decals, flush in one batch after the loop
  for (const c of cars) {
    if (c.isPlayer && hidePlayerCar && !cockpitRigOnly) continue;
    if (!c.isPlayer && player) {
      const ds = Math.abs(c.s - player.s);
      if (Math.min(ds, track.total - ds) > 550) continue;
    }
    // Interpolate between the last two physics steps so the car renders smoothly
    // between fixed steps (no judder on high-refresh). PLAYER derives (s,x) from
    // its drawn WORLD position (playerAnchor) so its height/orientation sample
    // the same smooth s as the camera; AI uses the arc interp.
    const pa = playerAnchor(c);
    const cS = pa.cS, cX = pa.cX;
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
    // Smooth RENDERED lateral position. Physics c.x stays exact (used for walls,
    // collisions, racing-line assist). Only the mesh position is low-passed so
    // Frenet-projection noise doesn't appear as visible left-right wobble.
    // Player rate 30 (≈0.1 s lag) is fast enough to feel instant but cuts the
    // per-frame projection noise; AI rate 16 kills the harsher collision jitter.
    if (c.xVis === undefined) c.xVis = cX;
    else c.xVis = damp(c.xVis, cX, c.isPlayer ? 30 : 16, dt);
    let renderX = c.xVis;
    // The player is placed from its own world position below; xVis is kept up to
    // date only because the surface/bank lookup and the AI path still read it.
    const rp = renderPosOf(c, cS, renderX);
    // banking: sit the car ON the banked surface (raise it by the local lift)
    // instead of the flat centreline, so it doesn't float/sink in the corner.
    const bankC = Tracks.banking(track, cS, renderX, _bankScratch);
    tmpP[0] = rp.world ? rp.x : smp2.p[0] + smp2.r[0] * renderX;
    tmpP[1] = smp2.p[1] + (bankC ? bankC.dy : 0);   // road SURFACE height: legit
    tmpP[2] = rp.world ? rp.z : smp2.p[2] + smp2.r[2] * renderX;
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
    // ygV = speed × road slope (smp2.t normalized above): the ground's vertical
    // velocity under the car, analytic — bodyattitude never differentiates height.
    const _ba = bodyAttitude.update(c, tmpP[1], dt, (c.speed || 0) * smp2.t[1]);
    const _baPitch = _ba.pitch, _baRoll = _ba.roll, _baHeave = _ba.heave;
    // Pitch: rotate forward+up around the right axis (positive = nose up). This
    // gives throttle-squat (nose lifts) and brake-dive (nose dips) without moving
    // the contact point — it's purely a mesh animation.
    if (_baPitch) {
      const cp = Math.cos(_baPitch), sp = Math.sin(_baPitch);
      for (let i = 0; i < 3; i++) {
        const f = tmpF[i], u = tmpU[i];
        tmpF[i] = f * cp + u * sp;
        tmpU[i] = u * cp - f * sp;
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
    let _sm = _shadowMats[_shadowCount];
    if (!_sm) { _sm = new Float32Array(16); _shadowMats[_shadowCount] = _sm; }
    _sm.set(_groundMat);
    _shadowTeams[_shadowCount] = c.team;   // for next frame's AI car-shadow caster pass
    _shadowCars[_shadowCount] = c;
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
    //
    // The offset MUST be subtracted along the rig's own axes — it is the exact
    // inverse of the basisMat below. Subtracting it on WORLD axes instead
    // (sF.x/sF.z for forward, +Y for up) only inverts the basis when the road is
    // FLAT: sF is the full 3-D tangent, so on a gradient θ the 0.99 m up-offset
    // leaks into forward and the eye creeps to rig z = FWD·cos²θ + UP·sinθ. At
    // ~4° of climb that closes the proven 0.39 m eye-to-fascia gap past the 0.3 m
    // near plane and the plane eats the wheel face — the instrument slab (LEDs,
    // LCD, digits, buttons) is 3-12 mm thin and sits at the driver-facing extreme,
    // so it vanished whole while the 25-62 mm body boxes behind it kept drawing.
    // Downhill the same term pushed the wheel ~15 cm too far away instead.
    if (c.isPlayer && cockpitRigOnly) {
      const sR = smp2.r, sF = smp2.t;
      _cockU[0] = sR[1]*sF[2] - sR[2]*sF[1];
      _cockU[1] = sR[2]*sF[0] - sR[0]*sF[2];
      _cockU[2] = sR[0]*sF[1] - sR[1]*sF[0];
      for (let i = 0; i < 3; i++)
        _cockP[i] = camEye[i] - _cockU[i] * COCKPIT_EYE_UP - sF[i] * COCKPIT_EYE_FWD;
      basisMat(sR, _cockU, sF, _cockP, _cockMat);
      drawCockpitRig(c, _cockMat, dt, paint);
      continue;
    }
    // Player: body-only mesh + animated (spinning/steering) wheels. Others (and
    // the player when a glb model is loaded) draw the full mesh with baked wheels.
    const body = c.isPlayer ? playerBodyMesh(c.team) : null;
    if (body) {
      gfx.draw(body, tmpMat, paint);
      queueCarDecals(c.team, tmpMat, carDecalNum(c.team, c), false, true);
      _wheelOpts.emissive = night ? 0.12 : 0;
      drawPlayerWheels(c, _groundMat, dt, _wheelOpts);
    } else {
      const wholeCarMat = c.isPlayer ? _groundMat : tmpMat;
      gfx.draw(teamMesh(c.team), wholeCarMat, paint);
      queueCarDecals(c.team, wholeCarMat, carDecalNum(c.team, c), false, c.isPlayer);
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
            W.set(wholeCarMat);
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
    const _ledDeploy = isErsDeploying(c);
    if ((wet && _ledStrobe) || (!wet && night && (!_ledDeploy || _ledStrobe))) {
      const W = _ringWorld;
      W.set(tmpMat);
      // 15 mm behind the baked LED face (z -2.60) — coplanar quads z-fight.
      W[12] += W[4] * 0.50 - W[8] * 2.615;
      W[13] += W[5] * 0.50 - W[9] * 2.615;
      W[14] += W[6] * 0.50 - W[10] * 2.615;
      // Brightness by ERS charge: 0.45 (flat) → 1.0 (full). Wet safety strobe
      // stays full-bright regardless — a rain light must not dim with battery.
      _rainLightOpts.emissive = wet ? 1.0 : (0.45 + 0.55 * clamp(c.energy || 0, 0, 1));
      gfx.draw(getRainLight(), W, _rainLightOpts);
    }
    // Electric ERS deployment has a pulsing status strip, never an exhaust flame.
    if (c.isPlayer && isErsDeploying(c)) {
      const W = _ringWorld;
      W.set(tmpMat);
      W[12] += W[4] * 0.605 - W[8] * 2.615;
      W[13] += W[5] * 0.605 - W[9] * 2.615;
      W[14] += W[6] * 0.605 - W[10] * 2.615;
      _ersLightOpts.alpha = 0.5 + 0.5 * (Math.sin(raceT * 28.0) > 0 ? 1 : 0.2);
      gfx.draw(getErsLight(), W, _ersLightOpts);
    }
    // Brief fuel-coloured throttle-lift after-fire, visible at any time of day.
    if (c.isPlayer && (c.exhaustPop || 0) > 0.05) {
      const fl = 0.6 + 0.4 * Math.sin(raceT * 41.0 + Math.sin(raceT * 23.0) * 3.0);
      const W = _ringWorld;
      W.set(tmpMat);
      // 3 cm forward of the boost quad in the same clear pocket (see above) —
      // the old z -2.24 was hidden behind the rain-light housing from chase cam.
      W[12] += W[4] * 0.40 - W[8] * 2.63;
      W[13] += W[5] * 0.40 - W[9] * 2.63;
      W[14] += W[6] * 0.40 - W[10] * 2.63;
      _flameOpts.alpha = (0.30 + 0.55 * fl) * c.exhaustPop;
      gfx.draw(getExhaustFlame(c.fuelVisual && c.fuelVisual.fxFlame), W, _flameOpts);
    }
    // EXHAUST HEAT HAZE: remember the player tailpipe's world position + plume
    // strength for this frame (projected to screen UV just before present()).
    // Any time of day, throttle-driven via exhaustPop, strongest under active
    // boost. Skipped on memory-limited phones (mobileTier — same gate as the
    // other post extras). Anchor is pushed well behind/above the body so the
    // composite warp (which already skips car-paint pixels) sits in the air
    // wake rather than on the rear wing from chase cam.
    if (c.isPlayer) {
      const _hzDep = isErsDeploying(c);
      _hazeStr = gfx.mobileTier ? 0 : (c.exhaustPop || 0) * (_hzDep ? 1.0 : 0.45);
      if (_hazeStr > 0.02) {
        // Behind/above the tailpipe (up +0.85, fwd −3.5 on the car frame).
        _hazeWorld[0] = tmpMat[12] + tmpMat[4] * 0.85 - tmpMat[8] * 3.5;
        _hazeWorld[1] = tmpMat[13] + tmpMat[5] * 0.85 - tmpMat[9] * 3.5;
        _hazeWorld[2] = tmpMat[14] + tmpMat[6] * 0.85 - tmpMat[10] * 3.5;
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
  // Flush all accumulated car decals in one decal-program block — previously
  // interleaved with the lit body draws (~2 program+state flips per car).
  for (let i = 0; i < _decalCount; i++)
    drawCarDecals(_decalTeams[i], _decalMats[i], night, _decalNums[i], _decalCockpit[i], _decalSetup[i]);
  // Flush all accumulated car shadows in one pass — shadowProg+shadowVAO+blend+
  // depthMask are set once for the whole field instead of ping-ponging with the
  // lit body program every car.
  for (let i = 0; i < _shadowCount; i++) gfx.drawShadow(_shadowMats[i], 2.4, 5.8);
  // Ghost car (time trial): replay best-lap position as a bright emissive silhouette
  if (isTimeTrial() && player && (state === "race" || state === "count")) {
    const g = Ghost.at(player.lapTime);
    // Skip the ghost while it overlaps the player — at the lap start it sits on
    // your exact grid position, and in the cockpit/onboard cams its bodywork
    // fills the camera as a black box until you pull away ("starts dark, clears
    // after throttle"). Once there's real separation it draws normally.
    let gDs = Infinity;
    if (g && !g.done) { const d = Math.abs(g.s - player.s); gDs = Math.min(d, track.total - d); }
    if (g && !g.done && gDs > 3.0) {
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
      gfx.draw(teamMesh(player.team), tmpMat, { emissive: 0.80, roughness: 0.20, metalness: 0.08, specular: 0.35, alpha: 0.35, noAlphaWrite: true });
      }
    }
  }

  // Rapier debris shards (render-only side-world; poses stepped in update()).
  if (DebrisWorld.active()) DebrisWorld.draw();

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
  let _gr = (_grSunY > 0.02 ? (_grBase + _grLowBoost * _grLow) : 0) * (1 + 0.25 * _mist) * _sunGateGR * LT.grMul;
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
  // DAYTIME FLOODS knob also sets frame.lights) would read as odd haze shafts.
  // Mobile tier sheds the beams entirely: any non-zero value keeps the whole
  // god-ray block alive every night frame (volumetric march with a per-step
  // lamp loop + 4 blur passes + a nearest-lamp re-sort) — a top GPU cost on
  // the phones that overheat/jetsam at night. Shedding it up-front beats
  // waiting for the perf governor to watch the device struggle to tier 4.
  // Same hard gate as the exhaust-haze pass above (gfx.mobileTier).
  const _lampVol = (frame.lights && _sunLumGR < 0.45 && !gfx.mobileTier)
    ? clamp(LT.lampVolBase + LT.lampVolHaze * _mist, 0, LT.lampVolCap) : 0;
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
  // smear only appears at speed (zero when parked; ramps in above ~40% of vTop()).
  const _spd = LT.speedBlur > 0 ? LT.speedBlur * clamp(((player.speed || 0) / vTop() - 0.4) / 0.5, 0, 1) : 0;
  const po = _presentOpts;
  // Bloom joins the last shedding tier: bloomAmt 0 skips the whole ~9-pass
  // bright+mip chain in present() — the single biggest post-chain saving left
  // on a device that has already shed everything else.
  po.exposure = frame.exposure * LT.exposureMul; po.bloom = PerfGov.tier() >= 4 ? 0 : _bloom * LT.bloomMul;
  po.threshold = clamp(_thresh + LT.threshOff, 0.4, 1.2); po.grade = _grade;
  // Feature-shedding tiers (see perfGovernor): resolution scaling can't rescue
  // passes whose cost doesn't shrink with the render target, so a device still
  // slow at the scale floor sheds those instead. Tier 2 drops the wet-road SSR
  // march, tier 4 the SSAO (+2 blurs) and god-ray passes.
  po.ssao = PerfGov.tier() >= 4 ? 0 : _ao;
  po.godray = PerfGov.tier() >= 4 ? 0 : _gr;
  po.contact = _cs; po.reflect = PerfGov.tier() >= 2 ? 0 : _ssr; po.lampVol = _lampVol; po.mist = _mist;
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
  if (isRaining() && Particles.rainActive()) {
    // Falling-streak rain, identical in every camera. Only "rain" precipitates;
    // "wet" is a damp track with no rain in the air. Open-cockpit cars have no
    // windscreen, so onboard views get the same streaks as the chase cam — no
    // water-on-glass beading and no wiper (there is nothing to wipe).
    Particles.rainDraw(dt, (player && player.speed) || 0, isRaining());
    // Lightning veil: drawn on top of rain drops so it bleaches the rain too.
    // Stronger bleach (was 0.18) so a strike is a real concussive sky-flash.
    if (_ltFlash > 0.001) Particles.rainFlash(Math.min(0.55, _ltFlash * 0.40));
  }
}

// ---------- HUD ----------
// HUD + minimap live in js/game/hud.js (GameHud.create(G) below).

// ---------- main loop ----------
let physAcc = 0;                 // leftover sim time carried between frames
let renderAlpha = 1;             // leftover-step fraction (0..1) for render interpolation
// Adaptive-resolution governor + feature-shedding tiers + mobile crash
// sentinel live in js/game/perf.js (PerfGov, initialised at boot with gfx).
// render() gates features on PerfGov.tier(); tickBody feeds PerfGov.tick(ms).
PerfGov.init(gfx);
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
  if (!paused && (state === "race" || state === "count")) PerfGov.tick(_dtMs);
  Input.poll();   // refresh gamepad state once per frame (before the paused gate
                  // so the Start/Menu button can also un-pause)
  if (paused) {
    // LIGHTING / CAMERA TUNER live preview: keep RENDERING (physics stays
    // paused) while either panel is open so every slider change shows on the
    // held frame — a camera angle is unjudgeable on a frozen picture.
    if ((state === "race" || state === "count") && (!$("lighting").hidden || !$("camtune").hidden)) {
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
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i]; c.rPrevS = c.s; c.rPrevX = c.x;
        c.rPrevPx = c.px; c.rPrevPz = c.pz;   // player renders from WORLD space
        c.rPrevYawVis = c.yawVis;             // orientation interpolates like position
        c.rPrevHead = c.head;                 // world heading interpolates like position too
      }
      update(PHYS_DT); physAcc -= PHYS_DT; steps++;
    }
    if (steps === 5) physAcc = 0;             // fell badly behind — drop the backlog
  }
  renderAlpha = clamp(physAcc / PHYS_DT, 0, 1);   // 0..1 leftover fraction for render interp
  render(Math.min(dt, 1 / 20));               // camera/visual damping at (clamped) frame dt
  if (state === "race" || state === "count") updateHud(false);
}

// ---------- car setup panel ----------
// The CAR SETUP panel UI (stat bars, tabs, options, livery creator) lives in
// js/game/setup-ui.js (SetupUI.create(G) — wired after the G façade).

// ---------- UI wiring ----------
// Select-screen UI (team/track grids, preview, circuit detail modal) lives in
// js/game/menus.js (Menus.create(G) — wired after the G façade).

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
  // SOUND is the master, so the MUSIC & SOUND panel's music controls follow it
  if (typeof syncAudioPanel === "function") syncAudioPanel();
}
els.soundbtn.onclick = () => setSound(!soundOn);

// Music on/off, independent of the master sound toggle: engine + SFX keep
// playing with music off.
function setMusic(b) {
  musicEnabled = b; store.set("music", b);
  GameAudio.setMusicEnabled(b);
  syncAudioPanel();
}

/* ---------------- MUSIC & SOUND panel ----------------
   The mixer lives on its own screen: two sliders and a now-playing readout do
   not fit the settings grid, which is one control per line. Levels persist. */
let musicVol = store.get("volMusic", 0.5);
let sfxVol = store.get("volSfx", 1);
let sfxOn = store.get("sfx", true);
GameAudio.setMusicVolume(musicVol);
GameAudio.setSfxVolume(sfxVol);
GameAudio.setSfxEnabled(sfxOn);

// SOUND EFFECTS on/off. Only the sfx bus is muted, so the soundtrack keeps
// playing — the sources stay alive at zero gain rather than being torn down, so
// there is nothing to rebuild when it comes back on.
function setSfx(b) {
  sfxOn = b; store.set("sfx", b);
  GameAudio.setSfxEnabled(b);
  syncAudioPanel();
}

/* ---------------- MUSIC SOURCE ----------------
   ALL / DEFAULT / MY TRACKS pick which part of the local library plays;
   SPOTIFY hands the music role to js/game/spotify.js. It is a four-way choice
   rather than a Spotify on/off switch because "my uploads only" and "the
   shipped songs only" are both things people actually want. */
let musicSrc = store.get("musicSource", "all");

function spotifyReady() {
  return typeof SpotifyMusic !== "undefined" && SpotifyMusic.inUse &&
    SpotifyMusic.status().state === "connected";
}

function setMusicSrc(v) {
  if (v === "spotify") {
    if (!spotifyReady()) { syncAudioPanel(); return; }   // not connected: ignore, the note says why
    musicSrc = "spotify";
    store.set("musicSource", musicSrc);
    SpotifyMusic.useAsMusic(true);
    syncAudioPanel();
    return;
  }
  // Leaving Spotify releases the music role but keeps the session, so coming
  // back does not cost another sign-in.
  if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.useAsMusic) SpotifyMusic.useAsMusic(false);
  const applied = GameAudio.setMusicSource(v);
  musicSrc = applied;                        // refused (nothing in that set) -> keep the old one
  store.set("musicSource", musicSrc);
  syncAudioPanel();
}

function syncMusicSrcRow() {
  const counts = GameAudio.sourceCounts ? GameAudio.sourceCounts() : { builtin: 0, user: 0 };
  const spot = spotifyReady();
  const on = (typeof SpotifyMusic !== "undefined" && SpotifyMusic.inUse && SpotifyMusic.inUse())
    ? "spotify" : GameAudio.musicSource();
  [["as-src-all", "all"], ["as-src-builtin", "builtin"],
   ["as-src-user", "user"], ["as-src-spotify", "spotify"]].forEach(([id, v]) => {
    const b = $(id);
    if (!b) return;
    b.classList.toggle("active", on === v);
    b.disabled = v === "user" ? counts.user === 0 : v === "spotify" ? !spot : false;
  });
  const note = $("as-src-note");
  if (note) {
    note.textContent = on === "spotify"
        ? "Spotify is driving the music. The controls above drive it too."
      : counts.user === 0
        ? "Add your own files under YOUR TRACKS to use MY TRACKS."
      : on === "user" ? "Playing your " + counts.user + " uploaded track" + (counts.user === 1 ? "" : "s") + " only."
      : on === "builtin" ? "Playing the " + counts.builtin + " shipped tracks only."
      : "Playing everything: " + counts.builtin + " shipped + " + counts.user + " of yours.";
  }
}

function syncAudioPanel() {
  // The two switches are INDEPENDENT — music with no sound effects is a normal
  // way to play. Each only follows its own switch and the master (the ♪ button /
  // SOUND in the settings grid), which mutes everything.
  const musicLive = musicEnabled && soundOn;
  const sfxLive = sfxOn && soundOn;
  $("as-music-on").classList.toggle("active", musicEnabled);
  $("as-music-off").classList.toggle("active", !musicEnabled);
  $("as-sound-on").classList.toggle("active", sfxOn);
  $("as-sound-off").classList.toggle("active", !sfxOn);
  // Disabled, not hidden: the row keeps its slot so nothing reflows under a
  // thumb mid-tap, and .tune-row greys to say the control is inert.
  $("as-mvol").disabled = !musicLive;
  $("as-skip").disabled = !musicLive;
  $("as-svol").disabled = !sfxLive;
  $("as-mvol").closest(".tune-row").classList.toggle("tune-off", !musicLive);
  $("as-svol").closest(".tune-row").classList.toggle("tune-off", !sfxLive);
  $("as-mvol").value = String(Math.round(musicVol * 10));
  $("as-mvol-v").textContent = String(Math.round(musicVol * 10));
  $("as-svol").value = String(Math.round(sfxVol * 10));
  $("as-svol-v").textContent = String(Math.round(sfxVol * 10));
  $("as-now").textContent = musicLive ? (GameAudio.trackName() || "—") : "off";
  // The uploaded-track rows carry a "playing" marker, so they have to be
  // re-rendered whenever the panel is opened or the track changes — MusicLib
  // owns the list, we only tell it the picture is stale.
  if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
  syncMusicSrcRow();
}

$("pm-audio").onclick = () => { syncAudioPanel(); $("audioset").hidden = false; };
// The SPOTIFY entry is owned by js/game/spotify.js — it knows whether there is
// anything to control, and keeps its own button's disabled state in sync.
// Spotify's state changes on its own schedule (a redirect completing, a device
// dropping); the source row has to follow it, not just panel-open events.
if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.onChange) {
  SpotifyMusic.onChange(() => { if (!$("audioset").hidden) syncMusicSrcRow(); });
}
$("as-src-all").onclick = () => { setMusicSrc("all"); if (soundOn) GameAudio.uiTick(); };
$("as-src-builtin").onclick = () => { setMusicSrc("builtin"); if (soundOn) GameAudio.uiTick(); };
$("as-src-user").onclick = () => { setMusicSrc("user"); if (soundOn) GameAudio.uiTick(); };
$("as-src-spotify").onclick = () => { setMusicSrc("spotify"); if (soundOn) GameAudio.uiTick(); };
$("pm-spotify").onclick = () => {
  if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.openPanel) SpotifyMusic.openPanel();
};
$("as-close").onclick = () => { $("audioset").hidden = true; };
$("as-music-on").onclick = () => { setMusic(true); if (soundOn) GameAudio.uiTick(); };
$("as-music-off").onclick = () => { setMusic(false); if (soundOn) GameAudio.uiTick(); };
$("as-sound-on").onclick = () => { setSfx(true); GameAudio.uiTick(); };
$("as-sound-off").onclick = () => { GameAudio.uiTick(); setSfx(false); };
// `input` not `change`: the level should follow the thumb while it is dragged.
$("as-mvol").oninput = (e) => {
  musicVol = GameAudio.setMusicVolume((+e.target.value || 0) / 10);
  store.set("volMusic", musicVol);
  $("as-mvol-v").textContent = String(Math.round(musicVol * 10));
};
$("as-svol").oninput = (e) => {
  sfxVol = GameAudio.setSfxVolume((+e.target.value || 0) / 10);
  store.set("volSfx", sfxVol);
  $("as-svol-v").textContent = String(Math.round(sfxVol * 10));
};
$("as-skip").onclick = () => {
  const name = GameAudio.skipTrack();
  if (name) $("as-now").textContent = name;
  if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
  if (soundOn) GameAudio.uiTick();
};

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
  if (m.v != null) { PerfGov.setAutoRes(false); if (gfx.setRenderScale) gfx.setRenderScale(m.v); }
  else PerfGov.setAutoRes(true);   // governor takes over from wherever the scale sits now
}
$("pm-res").onclick = () => {
  resMode = RES_MODES[(RES_MODES.findIndex((r) => r.id === resMode) + 1) % RES_MODES.length].id;
  store.set("resMode", resMode);
  applyResMode();
  if (soundOn) GameAudio.uiSelect();
};
applyResMode();

// RENDERER cycle (WEBGL2 → THREE → WEBGPU-if-available) — shown always now:
// TLX ("THREE", the three.js/TSL backend, in-progress migration) needs no
// WebGPU, so the toggle no longer hides without navigator.gpu; the WGX
// "WEBGPU" stop is skipped on browsers that can't run it. Both alternates
// are opt-in and the default stays WebGL2; flipping writes apex26.gfxBackend
// (the raw key gfx.js reads) and reloads so Gfx.create() re-runs backend
// selection at boot.
{
  const rb = $("pm-renderer");
  if (rb) {
    const read = () => {
      try {
        const v = localStorage.getItem("apex26.gfxBackend");
        return v === "webgpu" || v === "three" ? v : "webgl2";
      } catch (_) { return "webgl2"; }
    };
    const label = (v) => v === "three" ? "THREE" : v.toUpperCase();
    rb.hidden = false;
    rb.textContent = "RENDERER: " + label(read());
    rb.onclick = () => {
      if (soundOn) GameAudio.uiSelect();
      const cur = read();
      const hasGpu = typeof navigator !== "undefined" && !!navigator.gpu;
      const next = cur === "webgl2" ? "three"
                 : cur === "three" ? (hasGpu ? "webgpu" : "webgl2")
                 : "webgl2";
      try { localStorage.setItem("apex26.gfxBackend", next); } catch (_) {}
      rb.textContent = "RENDERER: " + label(next) + " — RELOADING…";
      setTimeout(() => location.reload(), 350);
    };
  }
}

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
  setFlow("gp"); session = "race";
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-tt").onclick = () => {
  setFlow("gp"); session = "tt";
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-season").onclick = () => {
  setFlow("season"); session = "race";
  // Re-read the STANDALONE save. In career `season` is an alias of the career
  // championship (see openCareer), so without this a player who opened a career
  // and then pressed SEASON would carry on the career's points here.
  season = store.get("season", null);
  if (!season || season.round >= Tracks.SEASON.length) {
    season = { round: 0, pts: {}, teamPts: {}, driverCodes: {} };
    store.set("season", season);
  }
  trackIdx = Tracks.seasonIndex(season.round);
  buildSelect();
  els.overlay.hidden = true; els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
// CAREER. Unlike the other three entry points this one does not go to #select:
// the calendar decides where you race, so the hub replaces that whole screen.
// A save with no career yet opens the hub in its new-career state.
function openCareer() {
  setFlow("career"); session = "race";
  const c = Career.data() || Career.load();
  if (c) {
    season = c.season;               // the SAME object — see endRace()
    trackIdx = Career.trackIndex();
    // Career owns WHO you drive for; the garage's team/driver pickers do not apply
    // while a contract is running, so point the existing indices at the contract.
    const ti = Teams.LIST.findIndex((t) => t.id === c.team);
    if (ti >= 0) { teamIdx = ti; store.set("team", ti); }
    driverIdx = c.seat;
    recomputePlayerMods();
  }
  careerUi.openHub();
  els.overlay.hidden = true;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
}
// The title-screen button reads CONTINUE once a career exists, so the player can
// tell at a glance whether pressing it resumes or starts something.
function refreshCareerButton() {
  const btn = $("mb-career");
  if (!btn) return;
  const c = Career.data() || Career.load();
  const label = btn.querySelector(".mb-label");
  if (label) label.textContent = c ? "CONTINUE CAREER" : "CAREER";
}
$("mb-career").onclick = () => openCareer();
$("mb-standings").onclick = () => { buildStandings(); $("standings").hidden = false; if (soundOn) GameAudio.uiSelect(); };
$("standings-close").onclick = () => { $("standings").hidden = true; };
$("mb-data").onclick = () => { DataHub.open(); if (soundOn) GameAudio.uiSelect(); };
$("mb-help").onclick = () => { els.howtoplay.hidden = false; };
// Same sheet from the pause menu's SETTINGS page — the controls reference is
// most wanted mid-session, not on the title screen. #howtoplay outranks
// #pmsettings in z-index, so it lays over the settings menu and DONE returns
// there with nothing else to restore.
$("pm-howto").onclick = () => { els.howtoplay.hidden = false; if (soundOn) GameAudio.uiSelect(); };
$("htp-close").onclick = () => { els.howtoplay.hidden = true; };
// Team picker: opened by the garage's TEAM & DRIVER tab (js/game/setup-ui.js).
// Closing without choosing leaves the current team as-is. Nothing to rebuild —
// the garage is still underneath, unchanged.
$("tp-close").onclick = () => { $("teampicker").hidden = true; };
// BACK + the tappable circuit preview. Both lookups existed in `els` but no
// handler was ever attached on this branch — the select screen's BACK button
// was simply dead (surfaced by the button-walk audit; the wiring lived on an
// unmerged branch).
els.selBack.onclick = () => { els.select.hidden = true; els.overlay.hidden = false; if (soundOn) GameAudio.uiSelect(); };
els.selPreviewMap.onclick = openTrackDetail;
$("track-detail-close").onclick = () => { $("track-detail").hidden = true; };
// ── SETTINGS sub-menu ── keeps the pause screen down to RESUME/RESTART/QUIT;
// every tuning + toggle control lives on this page. Opening it hides the pause
// menu (one panel at a time); BACK (or resume) returns to it.
// Some settings only mean anything with a race on screen: HIDE HUD toggles a
// HUD that does not exist yet (and the state would carry into the next race,
// which starts with no HUD and no clue why), and both tuners preview a scene
// that is not being rendered. Disabled rather than hidden — the same rule the
// mode-dependent driving controls follow, so the grid never reflows under a
// thumb mid-tap.
function syncSettingsAvailability() {
  const inRace = state === "race";
  $("pm-hidehud").disabled = !inRace;
  $("pm-lighting").disabled = !inRace;
  $("pm-camtune").disabled = !inRace;
}
function openSettings() {
  syncSettingsAvailability();
  els.pmsettings.hidden = false; els.pausemenu.hidden = true;
}
function closeSettings() { els.pmsettings.hidden = true; if (paused) els.pausemenu.hidden = false; }
$("pm-settings").onclick = openSettings;
$("pm-settings-close").onclick = closeSettings;
// The same settings screen from the TITLE menu, so steering, audio and the
// tuners are reachable without starting a race first. closeSettings() already
// only returns to the pause menu when actually paused, so from here it just
// closes back to the title.
$("mb-settings").onclick = () => { GameAudio.init(); openSettings(); };
// Advanced steering: opened from the settings menu, closes back to it.
$("pm-advanced").onclick = () => { $("advanced").hidden = false; };
$("adv-close").onclick = () => { $("advanced").hidden = true; };
// ── LIGHTING TUNER ── opened from the settings sub-menu; that menu hides while
// it's open so the live preview is unobstructed (tick() keeps render() running
// with physics paused), and DONE returns to it. Rows are generated
// once from TUNE_DEFS; values persist via localStorage (apex26.lightTune).
// The LIGHTING TUNER panel UI lives in js/game/tuner.js
// (TunerPanel.create(G) — wired after the G façade).

// ---------- Photo mode (free-fly camera) ----------
// Seed the fly-cam from the camera currently on screen so it starts exactly
// where the user was, then let them fly. yaw/pitch use view()'s convention:
// dir = (sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch).
// Photo mode (free-fly camera + enter/exit + DOM wiring) lives in
// js/game/photomode.js (Photomode.create(G) — wired after the G façade).

function buildRaceSettings() {
  const lapOpts = isTimeTrial() ? [3, 5, 8] : [3, 5, 10, 25, 57];
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
  // DIFFICULTY — a race setting like the rest, so it is built here rather than
  // on the select screen. Unlike laps/weather/time it PERSISTS (store), because
  // it is a standing preference rather than a per-race choice.
  $("rs-diff-section").hidden = isTimeTrial();  // no AI to rate in a time trial
  const diffEl = $("rs-diff");
  diffEl.innerHTML = "";
  for (const d of ["easy", "normal", "hard"]) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (difficulty === d ? " active" : "");
    b.setAttribute("aria-pressed", difficulty === d ? "true" : "false");
    b.textContent = d.toUpperCase();
    b.onclick = () => { difficulty = d; store.set("difficulty", d); buildRaceSettings(); if (soundOn) GameAudio.uiTick(); };
    diffEl.appendChild(b);
  }
}

// RACE SETTINGS is reachable from #select and (in career) from #career, so it
// records which screen to restore on cancel — the same return-path pattern
// openGarage(from)/garageReturn uses, and for the same reason: unhiding #select
// unconditionally used to drop the player on the wrong screen.
let rsReturn = "select";
function openRaceSettings(from) {
  rsReturn = from || "select";
  raceLaps = isTimeTrial() ? TT_LAPS : GAME_LAPS;
  raceWeather = "dry";
  raceTimeOfDay = "default";
  buildRaceSettings();
  $(rsReturn).hidden = true;
  $("race-settings").hidden = false;
}
els.selGo.onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  openRaceSettings("select");
};
$("rs-cancel").onclick = () => {
  $("race-settings").hidden = true;
  $(rsReturn).hidden = false;
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
  ["cz-nose", "nose"], ["cz-pod", "pod"], ["cz-wing", "wing"],
  ["cz-fin", "fin"], ["cz-finart", "finArt"], ["cz-halo", "halo"],
];
// The custom team's paint FINISH ("gloss" = the default clearcoat car paint, so
// it is never written to ct.livery). Held here rather than read off the DOM so
// the three buttons behave as one radio group.
let czFinish = "gloss";
function czSetFinish(value) {
  czFinish = value || "gloss";
  for (const btn of document.querySelectorAll("#cz-finish [data-cz-finish]")) {
    btn.classList.toggle("active", btn.dataset.czFinish === czFinish);
  }
}
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
  czSetFinish(liv.finish);
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
for (const btn of document.querySelectorAll("#cz-finish [data-cz-finish]")) {
  btn.onclick = () => { czSetFinish(btn.dataset.czFinish); if (soundOn) GameAudio.uiTick(); };
}
// The GARAGE is reachable from the title AND from the select screen's car card,
// so DONE has to go back where it came from. It used to unhide #select
// unconditionally, which dropped you on the track picker after opening the
// garage from the menu.
let garageReturn = "select";
// The one way in. Everything that opens the garage goes through here so the
// return path can never be left stale — including menus.js, via G.openGarage.
function openGarage(from) {
  if (from === "menu") GameAudio.init();
  else if (soundOn) GameAudio.uiSelect();
  garageReturn = from;
  openSetup();
}
$("sel-setup").onclick = () => openGarage("select");
$("mb-garage").onclick = () => openGarage("menu");
$("cs-done").onclick = () => {
  $("carsetup").hidden = true;
  setupPreviewOn = false;
  recomputePlayerMods();
  if (garageReturn === "career") { careerUi.openHub(); return; }
  buildSelect();
  if (garageReturn === "menu") els.overlay.hidden = false;
  else els.select.hidden = false;
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
  if (czFinish && czFinish !== "gloss") liv.finish = czFinish;
  if (Object.keys(liv).length) ct.livery = liv;
  store.set("customTeam", ct);
  syncCustomTeam();
  teamIdx = Teams.LIST.findIndex((t) => t.id === "custom");
  driverIdx = 0;
  store.set("team", teamIdx); store.set("driver", 0);
  els.customize.hidden = true;
  // MY TEAM is reachable from the garage now, so refresh that too — saving a
  // team switches you to it, and the garage is showing its car in 3D.
  buildSelect();
  if (!$("carsetup").hidden) buildSetup();
  if (soundOn) GameAudio.uiSelect();
};
els.resMenu.onclick = () => quitToMenu();
els.resNext.onclick = () => {
  // Career never jumps straight into the next round: the weekend is one step of a
  // longer loop, and the hub is where you spend what you just earned.
  if (isCareer()) {
    els.results.hidden = true;
    trackIdx = Career.trackIndex();
    openCareer();
    return;
  }
  if (isChampionship()) {
    if (season.round >= Tracks.SEASON.length) {
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
    trackIdx = Tracks.seasonIndex(season.round);
  }
  els.results.hidden = true;
  startRace();
};

function setPaused(p) {
  if (state !== "race" && state !== "count") return;
  paused = p;
  if (!p) { closeLightTuner(false); closeCamTuner(false); }
  els.pausemenu.hidden = !p;
  if (!p) els.pmsettings.hidden = true;   // never leave the settings sub-menu up after resume
  if (els.pmStandings) els.pmStandings.hidden = !(isChampionship() && season && season.round > 0);
  // never leave an overlay up after resume
  if (!p) { $("advanced").hidden = true; els.howtoplay.hidden = true; $("audioset").hidden = true; }
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
  // The CAMERA TUNER edits whichever mode you are looking through, so a mode
  // change from anywhere (C key, CAM picker, __apex.camera) must re-point its
  // sliders. Reached through the module global, not the create() const — this
  // function also runs at boot, before that const is initialised.
  CamTunerPanel.refresh();
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
    // 13 modes in a 3-wide grid leaves REAR CAM alone on the last line; the
    // no-orphan rule (css/components.css) widens it across the row instead.
    el.className = "no-orphan-3";
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
  // DISABLE (don't hide): hiding reflowed the settings grid mid-tap, so the
  // next tap landed on whatever button slid under the finger (worst case
  // HIDE HUD, which closes the whole menu). Same for the GEARS toggle below.
  $("pm-calib").disabled = mode !== "tilt";
  refreshGearsBtn();   // manual is tilt-only, so the GEARS toggle disables off-tilt
  // Only refresh touch buttons when in an active race — don't bleed controls onto
  // the title/select screen (e.g. when gyro denial auto-switches to buttons mode).
  if (state === "race" || state === "count" || state === "pause") showTouchControls(true);
}
$("pm-steer").onclick = () => {
  setSteerMode(STEER_MODES[(STEER_MODES.indexOf(steerMode) + 1) % STEER_MODES.length]);
};
$("pm-calib").onclick = () => { Input.calibrate(); setPaused(false); };

// Steering-tuning sliders, presets + macro levels live in
// js/game/steer-tuning.js (SteerTuning.create(G) — wired after the G façade).

// GEARS toggle: usable when thumbs are free (tilt or desktop keyboard).
// Disabled — not hidden — otherwise (see the pm-calib note in setSteerMode).
function refreshGearsBtn() {
  $("pm-gears").disabled = Input.touchControlsNeeded() && steerMode !== "tilt";
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
  // Sentinel: a hidden tab that never comes back was killed in the BACKGROUND —
  // normal iOS housekeeping, not our crash. Disarm while hidden, re-arm on
  // return to a live session.
  if (document.hidden) PerfGov.sentinelArm(false);
  else if (state === "race" || state === "count") PerfGov.sentinelArm(true);
});
window.addEventListener("pagehide", () => { PerfGov.sentinelArm(false); });

// ---------- boot ----------
// Inert in production; only attaches when a test harness pre-sets the flag.
if (typeof window !== "undefined" && window.__APEX_DEBUG) {
  window.__APEX = { cars: () => cars, player: () => player, state: () => state, track: () => track };
}

syncCustomTeam();   // inject "MY TEAM" so saved selections and chips resolve
migrateSeasonPoints();
if (teamIdx < 0 || teamIdx >= Teams.LIST.length) teamIdx = 2;
if (driverIdx < 0 || driverIdx >= Teams.LIST[teamIdx].drivers.length) driverIdx = 0;
// `apex26.track` is a POSITIONAL index into Tracks.LIST, so a reordered or
// shortened circuit list would leave it dangling and crash loadTrack on the
// undefined def. Clamp it the same way teamIdx/driverIdx are clamped above.
if (!(trackIdx >= 0 && trackIdx < Tracks.LIST.length)) trackIdx = 0;
{ const hasSeason = season && season.round > 0 && season.round < Tracks.SEASON.length;
  $("mb-standings").hidden = !hasSeason; }
Career.load();            // resolve + migrate the career save once at boot
refreshCareerButton();
// Pause key: when the settings sub-menu is open it acts as a BACK to the pause
// menu; otherwise it toggles pause as usual.
Input.init(canvas, { onPause: () => {
  // Innermost sheet first: HOW TO PLAY lays OVER the settings menu, so a pause
  // press there has to close the help sheet, not the menu underneath it (which
  // would leave the help sheet floating over the race with no way back). Reached
  // via the pause BUTTON / gamepad Start — a keyboard Esc never gets here while a
  // menu sheet is up (onKey returns early on menuOverlayOpen(), js/game/input.js).
  if (paused && els.howtoplay && !els.howtoplay.hidden) { els.howtoplay.hidden = true; return; }
  if (paused && els.pmsettings && !els.pmsettings.hidden) { closeSettings(); return; }
  setPaused(!paused);
} });
if (!Input.touchControlsNeeded()) { document.body.classList.add("desktop"); els.subtitle.textContent = "2026 grid · " + Tracks.LIST.length + " real circuits"; }
Input.setSteerMode(steerMode);
DataHub.init(els.datahub);
$("pm-steer").textContent = steerLabel();
$("pm-calib").disabled = steerMode !== "tilt";
refreshGearsBtn();
setSound(soundOn);
setMusic(musicEnabled);
// Restore the saved source once the uploaded tracks are in the playlist —
// "MY TRACKS" is refused while the library looks empty, which it does until
// MusicLib's IndexedDB read lands.
if (musicSrc && musicSrc !== "spotify") {
  const applySrc = () => { musicSrc = GameAudio.setMusicSource(musicSrc); syncMusicSrcRow(); };
  if (typeof MusicLib !== "undefined" && MusicLib.init) MusicLib.init().then(applySrc, applySrc);
  else applySrc();
}
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
// The __apex dev/test API lives in js/game/apex.js (ApexApi.create(G)).
window.__apex = ApexApi.create(G);

})();
