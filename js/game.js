/* Apex 26 — main game: state machine, physics, AI, race logic.
   Contract: docs/ARCHITECTURE.md. Depends on globals M4,V3,GLX,Teams,Tracks,
   Car3D,Input,GameAudio,F1API,DataHub; Gfx selects the opt-in TLX (three.js)
   or WGX (WebGPU) backends, injected at boot — GLX otherwise. */
(async function () {
"use strict";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const els = {
  hud: $("hud"), pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"),
  best: $("hud-best"), speed: $("hud-speed-n"), energy: $("hud-energy-fill"),
  ot: $("hud-ot"), aero: $("hud-aero"),
  gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"),
  hudSectors: $("hud-sectors"),
  flag: $("hud-flag"), minimap: $("minimap"),
  lights: $("lights"), announce: $("announce"),
  overlay: $("overlay"), subtitle: $("subtitle"), audiostate: $("audiostate"),
  lighting: $("lighting"), camtune: $("camtune"),
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

// Renderer selection. TWO opt-in backends behind the Gfx seam: TLX (three.js/
// TSL) when apex26.gfxBackend="three", WGX (WebGPU, frozen) when ="webgpu" AND
// the browser exposes WebGPU. Anything else — and ANY opt-in init failure —
// uses the WebGL2 backend (GLX) exactly as before, so the default path stays
// byte-for-byte identical (this async IIFE only actually awaits when opted
// into a deferred backend, or when the lazy __apex surface loads — localhost
// / tests / ?apex=1). `gfx` is the handle every later
// renderer call goes through; on the default path gfx===GLX.
let gfx = null;
let _backendProved = false;   // boot-canary latch, set on the first world present
// The two DEFERRED renderer groups (tools/manifest.cjs DEFERRED). Array order
// is the documented toposort; loadBackendScripts starts every file whose
// BACKEND_EDGES predecessors have evaluated (six TLX IIFEs in the first wave).
const BACKEND_FILES = {
  webgpu: [
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js",
    "js/render/webgpu/wgsl-fx.js",
    "js/render/webgpu/wgx.js",
  ],
  three: [
    "js/render/three/tsl-chunks.js",
    "js/render/three/tsl-lit.js",
    "js/render/three/tsl-sky.js",
    "js/render/three/tsl-fx.js",
    "js/render/three/tsl-post.js",
    "js/render/three/tlx-shadow.js",
    "js/render/three/tlx-chunked.js",
    "js/render/three/tlx-post.js",
    "js/render/three/tlx.js",
  ],
};
// Same pairs as tools/manifest.cjs DEFERRED_EDGES — load-order.test.mjs asserts
// equality. A load error RESOLVES: missing global is already the fallback.
const BACKEND_EDGES = [
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-post.js"],
  ["js/render/webgpu/wgsl-chunks.js", "js/render/webgpu/wgsl-fx.js"],
  ["js/render/webgpu/wgsl-post.js", "js/render/webgpu/wgx.js"],
  ["js/render/webgpu/wgsl-fx.js", "js/render/webgpu/wgx.js"],
  ["js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"],
  ["js/render/three/tsl-lit.js", "js/render/three/tlx.js"],
  ["js/render/three/tsl-sky.js", "js/render/three/tlx.js"],
  ["js/render/three/tsl-fx.js", "js/render/three/tlx.js"],
  ["js/render/three/tlx-shadow.js", "js/render/three/tlx.js"],
  ["js/render/three/tlx-chunked.js", "js/render/three/tlx.js"],
  ["js/render/three/tsl-post.js", "js/render/three/tlx-post.js"],
  ["js/render/three/tlx-post.js", "js/render/three/tlx.js"],
];
function loadBackendScripts(files, edges) {
  const pending = new Set(files), done = new Set(), inflight = new Set();
  const preds = new Map(files.map((f) => [f, []]));
  for (const [a, b] of (edges || BACKEND_EDGES)) {
    if (preds.has(a) && preds.has(b)) preds.get(b).push(a);
  }
  const inject = (src) => new Promise((resolve) => {
    const el = document.createElement("script");
    el.src = src + "?v=" + (window.__APEX_BUILD || 0);
    el.crossOrigin = "anonymous";
    el.onload = el.onerror = () => resolve();
    document.head.appendChild(el);
  });
  return new Promise((finish) => {
    const pump = () => {
      if (!pending.size && !inflight.size) { finish(); return; }
      for (const src of files) {
        if (!pending.has(src)) continue;
        if (!preds.get(src).every((p) => done.has(p))) continue;
        pending.delete(src);
        inflight.add(src);
        inject(src).then(() => { inflight.delete(src); done.add(src); pump(); });
      }
    };
    pump();
  });
}
// LAZY_AGENT (tools/manifest.cjs). Same files / edges as AGENT_FILES below —
// load-order.test.mjs asserts equality. Not SW-optional (V8 full-compiles
// install puts). Players on github.io skip this; tests and localhost inject.
const AGENT_FILES = [
  "js/game/agentview-raster.js",
  "js/game/agentview.js",
  "js/game/apex.js",
];
const AGENT_EDGES = [
  ["js/game/agentview-raster.js", "js/game/agentview.js"],
];
function wantAgentSurface() {
  if (typeof window !== "undefined" && window.__TEST_MODE) return true;
  try { if (localStorage.getItem("apex26.devApi") === "1") return true; } catch (_) { /* blocked */ }
  const q = typeof location !== "undefined" ? location.search : "";
  if (/[?&](apex|debug|report)(=|&|$)/.test(q)) return true;
  if (typeof navigator !== "undefined" && navigator.webdriver) return true;
  const h = typeof location !== "undefined" ? location.hostname : "";
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]";
}
function preloadThreeVendor() {
  for (const href of ["vendor/three-0.185.1/three.webgpu.min.js", "vendor/three-0.185.1/three.tsl.min.js"]) {
    const el = document.createElement("link");
    el.rel = "modulepreload";
    el.href = href;
    el.crossOrigin = "anonymous";
    document.head.appendChild(el);
  }
}
try {
  let pref = null;
  try { pref = localStorage.getItem("apex26.gfxBackend"); } catch (_) {}
  // Last load claimed the canvas then died — skip opt-in THIS tab only
  // (sessionStorage). Do not wipe the user's THREE/WEBGPU pick: Safari's
  // navigator.gpu is on, WGX/TLX still refuse, and writing webgl2 made the
  // RENDERER button bounce back every refresh.
  let skipClaim = false;
  try { skipClaim = sessionStorage.getItem("apex26.gfxClaimFail") === "1";
    if (skipClaim) sessionStorage.removeItem("apex26.gfxClaimFail"); } catch (_) { skipClaim = true; /* cannot persist a skip: never claim the canvas */ }
  // THE BOOT CANARY — what lets a PHONE hold a non-default backend. Both were
  // refused whenever GLX.isMobile, after TLX on iOS rendered a flat pale ground
  // with the lower half black. But the menu is DOM over the canvas: it survives a
  // garbage frame, so the RENDERER button undoes that in one tap. An iOS jetsam
  // kill it can NOT undo (no JS error, no contextlost; the recovery below fires
  // only when GLX.init FAILS) — hence a probe armed before handing over the canvas
  // and cleared once the alternate is bound (title SETTINGS never presents a
  // world frame; leaving it armed until present() reverted every menu refresh).
  // Re-armed around the first world present() so a jetsam on that frame still
  // reverts; armed at the NEXT boot = never got through create() or present().
  const PROBE_KEY = "apex26.gfxBackendProbe";
  let armed = null;
  try { armed = localStorage.getItem(PROBE_KEY); } catch (_) { /* blocked storage: no probe, so nothing to revert */ }
  // skipClaim = this tab already claimed-and-died; the probe is leftover from
  // that load. Do not persist webgl2 over the pick — attach GLX this boot and
  // retry the alternate on the next cold start.
  if (armed && !skipClaim) { pref = "webgl2"; Log.warn("gfx", "backend", armed, "never presented a frame — reverting to WebGL2");
    try { localStorage.setItem("apex26.gfxBackend", "webgl2"); localStorage.removeItem(PROBE_KEY); } catch (_) { /* the in-memory revert above still holds for this load */ } }
  // "webgpu" -> WGX (frozen, needs navigator.gpu); "three" -> TLX (three.js/TSL,
  // self-falls-back to WebGL2 inside three so no capability gate here).
  const optIn = !skipClaim && (pref === "three" || (pref === "webgpu" && navigator.gpu));
  if (optIn && typeof Gfx !== "undefined") {
    // Armed HERE, not at `optIn`: no Gfx = the canvas is never handed over.
    try { localStorage.setItem(PROBE_KEY, pref); } catch (_) { /* no probe means no auto-revert; the button is still the way back */ }
    // FETCH THE BACKEND ONLY NOW. Neither alternate has a <script> tag any more:
    // together they are ~550 KB that every visitor downloaded, parsed and
    // evaluated so that almost none of them could use it. `optIn` above is
    // resolved synchronously from localStorage, so the default GLX path never
    // reaches this line and never awaits anything.
    //
    // The list is DEFERRED in tools/manifest.cjs (load-order.test.mjs asserts
    // this loader and that manifest name exactly the same files, and that sw.js
    // precaches them). Eval-time edges (BACKEND_EDGES === DEFERRED_EDGES) are
    // the only waits — independent IIFEs fetch and evaluate together.
    //
    // No error path is needed beyond this: if a fetch fails, the backend global
    // is simply absent, and Gfx.create already treats that as "unavailable"
    // (`typeof TLX === "undefined"`) and returns null, which falls through to
    // GLX below exactly as an unsupported browser always has.
    if (pref === "three") preloadThreeVendor();
    await loadBackendScripts(pref === "three" ? BACKEND_FILES.three : BACKEND_FILES.webgpu);
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
      // Bound and live. Title has no track yet (deferred flyby), so present()
      // will not run — disarm here or a refresh on SETTINGS reverts the pick.
      if (gfx) { try { localStorage.removeItem(PROBE_KEY); } catch (_) { /* blocked storage: nothing to disarm */ } }
    }
  }
} catch (_) { gfx = null; }
if (!gfx) {
  if (!GLX.init(canvas)) {
    // A failed backend opt-in (WGX or TLX) may have already CLAIMED the canvas
    // (getContext "webgpu"/"webgl2" succeeded before init died) — then
    // getContext("webgl2") can never attach on this load. Reload once with a
    // session skip so THIS tab attaches GLX; keep the pick and disarm the
    // canary or the next boot writes webgl2 (Safari WebGPU's usual path).
    let backendTried = false;
    try { const p = localStorage.getItem("apex26.gfxBackend"); backendTried = p === "webgpu" || p === "three"; } catch (_) {}
    let skipped = false;
    if (backendTried) {
      // READ THE SKIP BACK before reloading (with sessionStorage blocked the
      // write fails silently and the reload replays this claim-and-die boot
      // forever; the ARMED probe then lets the next boot revert to webgl2 —
      // the wgx.js device-lost idiom). And reload ONCE: a latch already set
      // when THIS boot started means the previous reload's GLX.init failed
      // too — WebGL2 is gone from this tab, and reloading again loops forever
      // (measured 236 reloads/64 s, Vulkan-only config). Fall through to #nogl.
      try { const prev = sessionStorage.getItem("apex26.gfxClaimFail");
        sessionStorage.setItem("apex26.gfxClaimFail", "1");
        skipped = prev !== "1" && sessionStorage.getItem("apex26.gfxClaimFail") === "1"; } catch (_) { /* blocked storage: no skip, no reload */ }
    }
    if (skipped) {
      try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {}
      try { location.reload(); } catch (_) {}
      return;
    }
    $("nogl").hidden = false; return;
  }
  gfx = GLX;
  // Live tab, create() refused. Keep the pick and disarm the canary so a
  // refresh retries instead of reverting to WEBGL2. Jetsam during create()
  // never reaches here — the probe stays armed and the next boot reverts.
  try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* blocked storage */ }
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
const { store, ttBoard, ttBoardAdd, hexToRgb, rgbToHex, seasonDriverId } = GameStore;

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
  invalidateCustomMeshCache(teamBodies);
  invalidateCustomMeshCache(playerBodies, playerBodyOrder);
  invalidateCustomMeshCache(cockpitBodies, cockpitBodyOrder);
}
let teamIdx = store.get("team", 2);          // default McLaren
let driverIdx = store.get("driver", 0);
function storedTrackIndex() {
  const id = store.get("trackId", null);
  const stable = typeof id === "string" ? Tracks.LIST.findIndex((t) => t.id === id) : -1;
  return stable >= 0 ? stable : store.get("track", 0); // legacy positional save
}
let trackIdx = storedTrackIndex();
function restoreFreePlaySelection() {
  trackIdx = storedTrackIndex(); teamIdx = store.get("team", 2); driverIdx = store.get("driver", 0);
  if (!(trackIdx >= 0 && trackIdx < Tracks.LIST.length)) trackIdx = 0;
  if (!(teamIdx >= 0 && teamIdx < Teams.LIST.length)) teamIdx = 2;
  if (!(driverIdx >= 0 && driverIdx < Teams.LIST[teamIdx].drivers.length)) driverIdx = 0;
}
let difficulty = store.get("difficulty", "normal");
// RELIABILITY — "off" | "low" | "real" (js/game/reliability.js). A standing
// preference like difficulty, so it persists. Ships OFF: store.get returns the
// stored value whenever the key exists, so a new default only ever reaches a
// fresh install — and this key is new for EVERY save, which means the default is
// what every existing player gets. OFF is therefore the only choice that does not
// silently start retiring cars in a game somebody was already halfway through.
let raceReliability = store.get("reliability", "off");
// ACTIVE AERO usage — "manual" (the driver's own switch, the default) or
// "auto". Inside an activation zone X-mode has no cost and no downside, so the
// optimal play is unconditionally "on" — which is exactly what the AI does, in
// one line. Manual therefore asks the player to keep pace with cars that pay no
// attention tax, and anyone who forgets concedes X_VMAX_GAIN of top speed on
// every straight. AUTO hands the player the same deal the AI gets. It stays
// OPT-IN because pressing the button is the mechanic, and taking that away by
// default would remove the one thing there is to do with the system.
let raceAeroMode = store.get("aeroMode", "manual");
if (!Reliability.isLevel(raceReliability)) raceReliability = "off";
let soundOn = store.get("sound", true);
let musicEnabled = store.get("music", true);    // music on/off, independent of sound
let manualMode = store.get("manual", false);   // manual gearbox preference (player shifts)
let unlimitedBudget = store.get("unlimitedBudget", false); // removes credit cap in car setup
// how the player steers: "tilt" | "buttons" | "touch" (migrates the old buttonSteer flag)
let steerMode = store.get("steerMode", store.get("buttonSteer", false) ? "buttons" : "tilt");
// Manual gears: tilt (thumbs free) or desktop keyboard. BUTTONS already owns
// both thumbs (arrows + pedals); TOUCH auto-throttles — neither has a free
// hand for a shifter.
function gearsManual() {
  return manualMode && (steerMode === "tilt" || !Input.touchControlsNeeded());
}
// Auto-throttle: TOUCH mode only (the canvas drag occupies the thumb).
function autoThrottle() { return Input.touchControlsNeeded() && steerMode === "touch"; }
let season = store.get("season", null);      // {round, pts:{driverId:n}, teamPts:{id:n}, driverCodes:{driverId:code}}
function migrateSeasonPoints() { season = GameStore.migrateSeasonPoints(season); }

// ---------- physics constants ----------
// The immutable numbers live in js/game/physics-consts.js (global PhysicsConsts)
// together with the rationale that tuned them; game.js destructures them once
// here. Everything slider- or harness-tunable stays a `let` below.
const { VMAX, ACCEL, BRAKE, REVERSE_MAX, REVERSE_ACCEL, COAST_DRAG,
        GRAVITY_SLOPE, LAT_MAX, STEER_VMAX, FRONT_WEIGHT, CS_FRONT, CS_REAR,
        WT_LONG, DOWNFORCE, X_VMAX_GAIN_LO, X_VMAX_GAIN_HI, X_DF_LOSS_LO,
        X_DF_LOSS_HI, X_COAST_CUT_LO, X_COAST_CUT_HI, X_OPEN_RATE, X_CLOSE_RATE,
        X_MIN_SPEED, OT_MIN_SPEED, OFF_GRIP, ASSIST_KUS, LINE_PURSUIT,
        LONG_GRIP, WHEEL_R, WHEEL_STEER_VIS, GRASS_V, KERB_SHAKE, KERB_CUE_HOLD,
        DEPLOY_A, TAPER_LO, TAPER_HI, TAPER_FLOOR, DRAIN_LO, DRAIN_HI,
        REGEN_LO, REGEN_HI, OT_TIME_LO, OT_TIME_HI, OT_COOL_LO, OT_COOL_HI,
        OT_GAP } = PhysicsConsts;
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
// outside the driving loop needs this, not the bare constant — js/game/quali.js
// took `G.ACCEL` and so simulated a field that accelerated at pace-5 rates into
// a pace-scaled vTop() ceiling, which is exactly the mismatch the G façade's own
// comment promises does not exist ("off the SAME numbers the driving model
// uses"). Floored like vTop(): standingLoss() divides by it.
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
// that never had parts resolved behaves like the old single constant did.
function aeroLoadOf(c) { return c && c.aeroLoad != null ? c.aeroLoad : 0.5; }
function xVmaxGain(c) { return lerp(X_VMAX_GAIN_LO, X_VMAX_GAIN_HI, aeroLoadOf(c)); }
function xDfLoss(c) { return lerp(X_DF_LOSS_LO, X_DF_LOSS_HI, aeroLoadOf(c)); }
function xCoastCut(c) { return lerp(X_COAST_CUT_LO, X_COAST_CUT_HI, aeroLoadOf(c)); }
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
function otTimeFor(c) { return lerp(OT_TIME_LO, OT_TIME_HI, ersDeployOf(c)); }
function otCoolFor(c) { return lerp(OT_COOL_HI, OT_COOL_LO, ersDeployOf(c)); }

let aeroZ = null;   // AeroZones.create(G), assigned once G exists (below)
// -- ACTIVE AERO: ACTIVATION ZONES -------------------------------------------
// The zone GEOMETRY lives in js/game/aerozones.js (AeroZones.create(G), wired
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
function xStraightAhead(c) { return !!aeroZ.at(wrapS(c.s)); }
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
// 8-speed gearbox with realistic PROGRESSIVE ratios (research: real/F1 gearboxes
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
// B1 — RACE CONTROL (local yellow / VSC / safety car) lives in
// js/game/racecontrol.js. A READ-ONLY race-logic layer: it consumes
// DebrisWorld.hazards() and drives the HUD flag, and NEVER writes speed, px,
// pz, head or (s, x). The five below are thin passes through to it, kept as
// hoisted function declarations so the G façade below can name them directly.
let raceCtl = null;   // RaceControl.create(G), assigned once G exists (below)
function setCautionEnabled(on) { return raceCtl.setEnabled(on); }
function updateCaution(dt) { raceCtl.update(dt); }
function applyCaution(d) { return raceCtl.apply(d); }
function cautionInfo() { return raceCtl.info(); }
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
// js/game/photomode.js). null when nothing is dragging.
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
// Does the grid come from a qualifying classification? A championship does
// unless its FORMAT switched qualifying off (quali() is true for a career and a
// friend race, so only a standalone season can); a one-off does when the player
// asked for it. Both startRace() (which reads quali.order) and the race-settings
// GO button ask this, and they must agree — a race that qualified and then
// gridded up P12 would throw the session away, and one that gridded from a
// classification it never ran would read a stale one.
const gridFromQuali = () => (isChampionship() && SeasonCal.quali()) || (raceQuali && !isTimeTrial());
// The ONE way `flow` is written. Career's save is loaded at boot and stays loaded,
// so js/game/career.js has to be told whether its rules apply to the session that
// is running — otherwise a Grand Prix would quietly inherit the career's team
// development and its garage. Funnelling every write through here means that flag
// can never drift out of step with the mode.
function setFlow(v) { flow = v; Career.engage(v === "career"); SeasonCal.engage(v); }
const isTimeTrial = () => session === "tt";
const isQuali = () => session === "quali";
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
// Whether a one-off race decides its grid by QUALIFYING rather than dropping the
// player at P12. A championship always qualifies — that is what a weekend is —
// so this is the switch for everything that is not one. A standing preference
// like DIFFICULTY and RELIABILITY, not a per-race reset: someone who wants to
// qualify wants to qualify next time too.
let raceQuali = store.get("raceQuali", false);
// A friend race has TWO humans on the grid, and both of their qualifying laps
// are real. The rival's arrives over the wire (NetPlay EV.QUALI) as
// driverId -> seconds; quali.simulate() takes the map and stops caring which of
// them is "the player". Cleared with the classification.
// driverId -> seconds, one entry per rival who has driven. A map rather than a
// single record because three rivals report three laps and the second arrival
// must not erase the first — qualiDriven() already built a driverId map, so
// this is the shape the model always wanted.
let qualiPeers = new Map();
// Everything anyone actually drove, in the one shape the model wants.
// The rival's driven lap has arrived. Store it, and redraw whatever is showing:
// if the sheet is up it must now list their real time instead of the model's
// guess, and if the classification was already built it has to be rebuilt or the
// grid would be assembled from a lap that has been superseded.
// Whoever currently holds the connection carries it. NetPlay owns the session
// once the race is built; before that — which is exactly when qualifying runs —
// the lobby still does.
// Publish our own lap as we drive it, a couple of times a second. Rate-limited
// here rather than at the call site so every caller cannot forget: the reliable
// channel would happily carry sixty of these a second and none of them would be
// worth the bytes.
let qualiLiveAt = 0;
function netReportQualiLive(driverId, t, frac) {
  const now = performance.now();
  if (now - qualiLiveAt < 400) return false;
  qualiLiveAt = now;
  if (netPlay && netPlay.active && netPlay.active() && netPlay.reportQualiLive) {
    return netPlay.reportQualiLive(driverId, t, frac);
  }
  if (netLobby && netLobby.reportQualiLive) return netLobby.reportQualiLive(driverId, t, frac);
  return false;
}

function netReportQuali(driverId, t) {
  if (netPlay && netPlay.active && netPlay.active() && netPlay.reportQuali) return netPlay.reportQuali(driverId, t);
  if (netLobby && netLobby.reportQuali) return netLobby.reportQuali(driverId, t);
  return false;
}

// A friend race waits for BOTH laps before it will grid up. Racing someone
// whose qualifying time never arrived would put them wherever the model
// guessed, which is the one thing a qualifying session is supposed to stop.
let qualiNetDone = null, qualiHadRivals = false; // lobby finish-start + rival-ever-existed
function qualiRivalDriverIds() {
  const fromNet = netPlay.rivalDriverIds();
  if (fromNet.length) return fromNet;
  // Before NetPlay hands off, remotes is empty even though the lobby already
  // knows who is in the room — read the peer profiles instead of opening the
  // grid after the first lap while two rivals are still out.
  if (!netLobby || !netLobby.roomState) return [];
  const peers = netLobby.roomState().peers || [];
  return peers.map((p) => p.team + ":" + (p.driver || 0)).filter((id) => id !== ":");
}
function qualiNetWaiting() {
  if (!qualiNetDone) return false;
  // EVERY rival, not "a rival". With one peer this is the boolean it always
  // was; with three it stops the grid forming off one arrived lap and two
  // guesses. rivalDriverIds() is the roster NetPlay actually holds slots for,
  // so somebody who dropped during qualifying stops being waited on.
  const rivals = qualiRivalDriverIds();
  if (rivals.length) qualiHadRivals = true; if (!rivals.length) return false;
  return rivals.some((id) => !(qualiPeers.get(id) > 0));
}

// Say WHY the grid is not available yet, on the button itself.
//
// This used to be an announce() banner. That is the wrong instrument twice
// over: the banner is a full-width overlay across the middle of the screen, so
// it physically covers the sheet foot — the very button it is talking about —
// and it fades, so a player who looks away has no way to find out why nothing
// happened. A disabled button with its reason written on it cannot cover
// itself, cannot expire, and cannot be clicked by mistake.
function refreshQualiGate() {
  const b = $("q-go");
  if (!b) return;
  const waiting = qualiNetWaiting();
  b.disabled = waiting;
  // "THEIR LAP" is wrong the moment there are three rivals, and it never said
  // how many were outstanding — so a room of four sat on an unexplained
  // disabled button. The count is already knowable from the same two things
  // the gate itself reads.
  if (!waiting) { b.textContent = (qualiNetDone && qualiHadRivals && !qualiRivalDriverIds().length) ? "RIVAL LEFT — TO THE GRID" : "TO THE GRID"; return; }
  const rivals = qualiRivalDriverIds();
  const outstanding = rivals.filter((id) => !(qualiPeers.get(id) > 0));
  const left = outstanding.length;
  // SHOW THE LAP AS IT HAPPENS. "Waiting" with no clock is the same screen
  // whether somebody is two corners in or has walked away, and it is the one
  // moment in a friend race where everyone else has nothing to do. A live time
  // is only ever drawn for a lap still running, and goes stale-safe: if the
  // last packet is more than three seconds old we stop pretending to know.
  const live = [];
  for (const id of outstanding) {
    const l = qualiLive.get(id);
    if (l && performance.now() - l.at < 3000) {
      const c = cars.find((x) => x.driverId === id);
      live.push((c ? c.code : "") + " " + fmtTime(l.t));
    }
  }
  if (live.length) { b.textContent = live.join("   ") + "…"; return; }
  b.textContent = left > 1 ? "WAITING FOR " + left + " LAPS…" : "WAITING FOR THEIR LAP…";
}

// Stage a qualifying session for a FRIEND race. Same session the solo path
// runs; the difference is only what happens when it ends — the lobby has to
// build the race and hand its connection to NetPlay, and it cannot do that
// until the players leave the sheet.
function openQualiForNet(done) {
  openQuali(true);                // fresh sim — do not restore a career grid
  qualiNetDone = done || null;
  refreshQualiGate();
}

// A rival's lap IN PROGRESS, so the wait has a clock on it. Deliberately
// separate from qualiPeers: that map is what the classification is built from
// and must only ever hold COMPLETED laps, or a grid could be assembled from a
// time somebody was still driving.
let qualiLive = new Map();        // driverId -> {t, frac, at}
function onPeerQualiLive(d) {
  if (!d || d.driverId == null) return;
  qualiLive.set(d.driverId, { t: +d.t || 0, frac: +d.frac || 0, at: performance.now() });
  refreshQualiGate();
}

function onPeerQuali(d) {
  // The lap is done; the live clock for it is now noise.
  if (d && d.driverId != null) qualiLive.delete(d.driverId);
  if (d && d.driverId != null && d.t > 0) qualiPeers.set(d.driverId, d.t);
  if (!isQuali()) return;
  const mine = player && player.lastLap > 0 ? player.lastLap : (player && player.best < Infinity ? player.best : 0);
  quali.simulate(qualiDriven(mine));
  if (!$("quali").hidden) quali.build();
  refreshQualiGate();
}
function qualiDriven(myTime) {
  const m = new Map();
  if (myTime > 0 && player) m.set(player.driverId, myTime);
  for (const [id, t] of qualiPeers) if (t > 0) m.set(id, t);
  return m.size ? m : 0;
}
let raceWeather = "dry";       // "dry" | "wet" | "rain" | "overcast" | "fog"
let raceTimeOfDay = "default"; // "default" | "dawn" | "day" | "dusk" | "night"
let ttRecord = Infinity;    // best lap on the current TT track's leaderboard (seconds)
let ttNewRecord = false;    // set when the player takes provisional pole this session
let ttLaps = [];            // completed lap times this time-trial session
let ttSessionTs = 0;        // session start stamp; entries at/after it are "yours, just now"
let sectorStartT = 0;        // lapTime when current sector started
let sectorIdx = 0, sectorValid = true;   // current sector + "entered it FORWARD" flag
let sectorBests = [Infinity, Infinity, Infinity];  // best S1/S2/S3 times ever
let sectorLast = [null, null, null];               // last lap's S1/S2/S3 times
let frameSky = {}, frame = {};
// ---------- sky / weather animation state ----------
// Continuously increasing render clock (seconds) fed to the sky shader each
// frame so clouds drift and stars twinkle even when the physics are frozen.
let _skyT = 0;
// Lightning state: base ambient colours saved from applyRaceSettings(), current
// flash intensity, remaining flash bright time, and next-flash countdown.
let _ltBase = null;           // { ambientSky, ambientGround, exposure } saved at race start
let _ltFlash = 0;             // 0..1 current flash intensity (decays each frame)
let _ltNextT = 0;             // seconds until the next lightning strike
let _thunderT = -1;          // seconds until queued thunder fires (<0 = none)
// Cloud cover target for the current session: set once in applyRaceSettings()
// and held constant so the sky doesn't shift mid-race (only the shader animates).
let _cloudBase = 0.4;
const teamMeshes = {}, teamMeshOrder = [];   // factory full mesh (shadows / ghost / glb)
const teamBodies = {}, teamBodyOrder = [];   // factory body-only (visible AI — wheels drawn planted)
const TEAM_MESH_CACHE_MAX = 24, DECAL_TEX_CACHE_MAX = 48;   // > the concurrently drawn set, or eviction thrashes rebuilds
let shake = 0;          // 0..1 trauma; camera offset scales with shake²
let camRoll = 0;        // radians; lean into corners (decays back to 0)
let camSlipSm = 0;      // smoothed slip input for camRoll (raw vLat/speed is 60 Hz-stepped)
let camCutT = 0;        // s; >0 just after a camera-mode cut → eased glide to the new vantage
let hitStop = 0;        // seconds of remaining sim slow-mo after a hard hit
let startHold = 0;      // randomised lights-out delay after the 5th light (F1-style)
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
// A human car with no controls yet (a networked rival before its first input
// packet lands): coast, don't inherit whatever the local keyboard is doing.
const NEUTRAL_INPUT = Object.freeze({ steer: 0, throttle: false, brake: false });
// Where a human car's controls come from. The LOCAL car reads the real Input —
// returning null here is the signal to do that, which preserves the existing
// "_testInput ?? Input" precedence exactly. A non-local human car reads the
// inputs its owner sent us. Same shape as _testInput throughout, so
// __apex.setInput()/act() can drive either car and the netcode adds no new
// vocabulary. Edge-triggered controls (shift, overtake) stay explicit at their
// call sites because Input.consume*() may only be read once per frame.
function inputOf(c) {
  if (c.local) return _testInput;              // null => live Input
  return c.netInput || NEUTRAL_INPUT;
}
// The human the AI rubber-bands against — recomputed once per update() rather
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
let announceT = 0;
let skids = null;   // SkidMarks.create(G), assigned once G exists (below)
// Tyre marks (the 120-entry ring buffer, its batched vertex build and the
// per-mark fallback draw) live in js/game/skidmarks.js — SkidMarks.create(G),
// wired after the G façade as `skids`. Nothing outside that module reads its
// state, which is what made it liftable.
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

// ---------- helpers ----------
const clamp = M4.clamp, lerp = M4.lerp;   // shared scalar helpers (js/mat4.js) — ALIASED, not called through M4, so every hot-path site keeps its old call shape
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
  const d = M4.wrapDelta(cur - prev, L);   // shortest way round (js/mat4.js)
  return wrapS(prev + d * a);
}
// Every car is drawn from interpolated world px/pz when that mirror exists.
// The player integrates px/pz; AI and remotes derive it from (s, x) at the
// end of the step. A leftover xVis low-pass used to lag the field toward
// the road frame (16/s on AI, 30/s on the player) — gone. Render interpolates
// the last two physics poses only (renderAlpha).
// Writes world X/Z into _rp; the caller still samples the road for HEIGHT.
const _rp = { x: 0, z: 0, world: false };
function renderPosOf(c, cS, renderX) {
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
// Unified render anchor. Returns the (s, x) the camera, the car body's
// height/orientation, and banking should all sample — derived from the SAME
// interpolated WORLD position the body is drawn at (renderPosOf): project that
// world point ONCE via trackFrom. World interpolation is smooth, so this s is
// smooth AND identical across all three consumers. Deriving each consumer
// independently from the arc read-back lerpS(rPrevS, s) diverged — that
// read-back is non-monotonic (js/game.js), which showed as a backwards jolt
// (camera), a speed-dependent fore/aft slide (car vs camera), and residual
// height/orientation jitter at speed. Cars with no world pose yet fall back to
// the arc interpolation.
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
// yawVis is produced in the physics step; render it interpolated like position,
// or the mesh orientation leads the interpolated position by one full physics
// step (16.7 ms) — a small orientation-vs-position judder during yaw transients.
// yawVis USED to be a damped residual clamped well inside ±π, which is what made
// a plain lerp safe. It is not any more: the player branch below assigns the raw
// psi (`c.yawVis = psi`, normalised to (-π, π]) precisely so a spin renders as a
// spin instead of a 40 deg crab. So yawVis now crosses the ±π branch cut once per
// revolution, and a plain lerp across it sweeps the drawn basis through zero —
// the car snaps to facing straight down the road and back, mid-spin, which is
// exactly when the player is looking at it. Same wrap-safe delta headInterp uses
// two functions down, for the same reason.
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
const _upVS = new Float32Array(3);   // the ROAD PLANE's normal in view space (wet-road SSR)
const _smpRoad = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };   // its own scratch: smp/smp2 are live elsewhere in the frame
const _camUp = [0, 0, 0];   // scratch camera up-vector (rebuilt each render frame)
const _upX = [1, 0, 0], _upY = [0, 1, 0];   // shadow-basis up choices (read-only)
let _shadowSnapX = null, _shadowSnapZ = null, _shadowBox = null;
let _shadowSunX = null, _shadowSunY = null, _shadowSunZ = null;
// Lamp-spot shadow snap: skip full rebuild when nearest flood + eye cell hold.
// Props dominate the cost; freezing the map for a 12 m eye cell is the night twin
// of the sun snap cache (cars already one-frame lag on AI mats).
let _lampShBest = -1, _lampShSX = null, _lampShSZ = null;
const _shadowCtr = [0, 0, 0];   // unsnapped shadow anchor (glides) — the shader fades by distance from this

// ---------- parts / player mods ----------
// The single funnel every parts consumer goes through (setup-ui, recomputePlayerMods,
// makeCars, partsVisualKey, renderStatBars). Branching HERE is what keeps a career
// build fully isolated from the free-play garage: your career car and your Grand
// Prix car for the same team are separate objects that can never leak into one
// another, and career's own build is the only one subject to the R&D gate.
// inCareer(), NOT Career.data(). data() is "a save exists on disk", and the save
// is LOADED AT BOOT so the title screen can offer CONTINUE — so this branch used
// to fire in a Grand Prix and a Time Trial too, for anyone who had ever started a
// career with that team. That broke the isolation described above in both
// directions, and the garage UI made it costly: setup-ui gates its rules on
// G.careerOwned() (Career.owned(), which IS inCareer()-gated), so a GP garage
// correctly offered FREE BUILD, the flat 600 cr cap and no R&D lock — and then
// wrote the result straight into career.fitted. Fitting every top option under
// FREE BUILD therefore maxed out the CAREER car for nothing: no credits spent, no
// parts researched, the fitted cap bypassed, and nothing ever re-validates a
// fitted build afterwards (Parts.resolveSetup deliberately trusts this funnel).
// Merely opening the GP garage was also enough to mutate the save, since
// buildSetup() deletes unusable categories out of the object it is handed.
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
             fin: l.fin || null, finArt: l.finArt || null, logo: l.logo || null,
             noseStripe: l.noseStripe || null, finish: l.finish || null };
  }
  const c = _livResolveCache.get(team.id);
  if (c && c.rev === store.rev) return c.val;
  const liv = getLiveries(team).find((l) => l.id === getLiveryId(team.id));
  // Optional livery detail colours (nose cap, sidepod panel, wing flaps, halo tint)
  // — additive, so an unmodified livery still resolves to today's exact object shape.
  const val = liv ? { c1: liv.c1, c2: liv.c2, stripe: liv.stripe || null, accent: liv.accent || null,
                      nose: liv.nose || null, pod: liv.pod || null, wing: liv.wing || null, halo: liv.halo || null,
                      fin: liv.fin || null, finArt: liv.finArt || null, logo: liv.logo || null,
                      noseStripe: liv.noseStripe || null, finish: liv.finish || null }
                  : { c1: team.color, c2: team.color2, stripe: null, accent: null };
  _livResolveCache.set(team.id, { val, rev: store.rev });
  return val;
}

// The colour a team's WING FLAP elements are painted — the same fallback chain
// Car3D uses for `wingC` when it builds the baked front/rear wing planes, so the
// moveable active-aero flap drawn over the crown matches the wing it belongs to
// instead of being a differently-coloured bolt-on.
function wingColorOf(team) {
  const liv = resolveLivery(team);
  // The moveable elements ARE the wing's own top flaps, so they take the wing's
  // own colour — Car3D paints the baked cascade with exactly this fallback
  // chain (`wingC`). Tinting them to stand out (an earlier attempt, back when
  // they were extra parts laid over the wing) would now make the car two-tone
  // at rest, which is a regression against a wing that used to be one colour.
  return liv.wing || liv.c2 || team.color2;
}

// Draw a car's two MOVEABLE wing elements (active aero) at flap blend `blend`
// (0 = Z-mode, 1 = X-mode), given that car's world model matrix. Shared by the
// in-race draw loop and the GARAGE preview turntable, so the wings a player
// inspects in the garage are the same geometry at the same angles as the ones
// that open on track.
const _flapWorld = new Float32Array(16);
// `only` limits the draw to one wing ("front"/"rear") — the COCKPIT body build
// skips the rear assembly entirely, so drawing the rear plane there would hang
// it in mid-air behind a car that has no rear wing.
function drawAeroFlaps(team, aLvl, blend, modelMat, mat, style, only) {
  const col = wingColorOf(team), b = clamp(blend, 0, 1);
  // The moveable flaps are drawn OUTSIDE the baked mesh, so Car3D.build()'s
  // finish remap never reached them — a chrome/satin car kept glossy top flaps.
  // Thread the livery finish through so getAeroFlap remaps the flap material too.
  const finish = resolveLivery(team).finish || null;
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
}

// partsVisualKey(teamId) -> cheap cache key for the resolved cosmetic tiers
// (e.g. "111111111111" = every category at its default/neutral tier). Used by the
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
// Full 12-char cosmetic key for the PLAYER's body/cockpit mesh caches — computed
// once here (parts only change from the setup screen, which calls this on close)
// so the render loop reads a cached string instead of rebuilding it via
// partsVisualKey() → getVisualTiers() every frame. Overwritten before the first
// race render by startRace()'s recomputePlayerMods() call.
let playerVisualKey = "111111111111";

// Performance multipliers for ONE car, from its team's base stats and its own
// parts setup. Factored out of recomputePlayerMods because these numbers are a
// property of a CAR, not of "the player": while exactly one car was ever human
// a module-level `playerMods` was indistinguishable from a per-car field, but
// the moment a second human exists the singleton is silently wrong — a remote
// driver would accelerate, brake and (via muBase) CORNER on the local player's
// upgrades. Human cars carry the result as c.mods; AI cars have none and keep
// running on c.tierV * c.skill.
function modsFor(team, setup) {
  // teamStats() folds in career development; outside career it hands back the
  // team's own literal untouched, so this is the same object it always was.
  const stats = Career.teamStats(team) || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const mods = Parts.getMods(setup, team);
  return {
    speed:     Parts.statMult(stats.speed)     * mods.speed,
    accel:     Parts.statMult(stats.accel)     * mods.accel,
    cornering: Parts.statMult(stats.cornering) * mods.cornering,
    braking:   Parts.statMult(stats.braking)   * mods.braking,
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
// cars[] index is not an identity. makeCars() drops the custom team unless the
// player selected it (the filter above) and walks Career.gridDrivers(), so the
// grid's LENGTH and ORDER differ between two screens in the same race. That is
// why onState used to ignore the id on the wire and take cars[0]: the id was
// the sender's own index and meant nothing to the receiver.
//
// driverId ("redbull:1") is content-derived and IS stable, but the snapshot's
// per-car id is one byte, so the string cannot go on the wire. This is the same
// fact as a number: Teams.LIST is eleven fixed teams plus exactly one appended
// custom entry (syncCustomTeam), so a team's INDEX is identical on every peer
// even when the custom team's contents are not. Two seats each puts the whole
// grid inside 0..23.
//
// Only meaningful once no two humans share a seat — which is what the seat
// exclusivity in js/net/lobby.js guarantees, and why it had to land first.
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
  const setup = getTeamParts(team.id);
  playerMods = modsFor(team, setup);
  if (player) player.mods = playerMods;
  // How much wing this car is carrying (0..1), which sets how much active aero
  // trades — see X_VMAX_GAIN_LO/HI. Cached here rather than resolved per physics
  // step: it only changes when the parts do.
  playerAeroLoad = Parts.aeroLoad(setup, team);
  if (player) player.aeroLoad = playerAeroLoad;
  // The ERS part's two axes — deployment and recovery — which run the battery
  // and the overtake window (see drainFor/regenFor/otTimeFor).
  playerErs = Parts.ersProfile(setup, team);
  if (player) { player.ersDeploy = playerErs.deploy; player.ersRegen = playerErs.regen; }
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
// The AI speed multiplier for one driver. Ratings apply in EVERY mode — the grid
// has personality in a one-off Grand Prix too, not only in a career, which is
// where career layers its own development deltas on top.
//
// The simRnd() draw is UNCONDITIONAL and comes FIRST. The stream position after
// makeCars() must be identical whatever the ratings say: move the draw inside a
// branch and a career's mere existence shifts every subsequent seeded result,
// silently breaking tests/specs/agent-determinism.spec.js, tests/specs/autopilot.spec.js and
// the seeded visual baselines. DriverRatings.skill() takes the sample rather than
// drawing its own for exactly this reason.
function driverSkill(team, d, di) {
  const roll = simRnd();
  const r = DriverRatings.get(d.code, team.tier, Career.devFor(team.id, di));
  // The pace-skill scalar PLUS the racecraft axes (0..1) the driving loop reads
  // for attack/defence/OT/ERS/lane (see updateCar + js/game/ai-drive.js). Still
  // exactly ONE simRnd() draw — the stream-position contract reliability.js and
  // career.spec.js depend on.
  return {
    skill: DriverRatings.skill(r, roll),
    craft: (r.craft || 75) / 100, awareness: (r.awareness || 75) / 100,
    experience: (r.experience || 75) / 100, consistency: (r.consistency || 75) / 100,
  };
}

// The pace an AI car gets from running a DEVELOPED build instead of its team's
// works car — MY TEAM's hire, and nothing else on the grid (every other AI runs
// its works car, which is exactly what `tier` already says).
//
// It rides in `tierV`, the number the tier has always contributed, so the
// per-car update at `c.tierV * c.skill * dd.ai` is unchanged in shape and no AI
// gains a parts branch on the physics path. The mean of the four axes because a
// human car spends its mods across four channels (speed, accel, cornering,
// braking) and an AI has exactly one scalar — one axis alone would rate a
// cornering upgrade as no upgrade at all. Pure: consumes no RNG, so the
// stream-position contract makeCars() lives under is untouched.
function buildPace(built, works) {
  const b = built.mods, w = works.mods;
  let sum = 0;
  for (const k of ["speed", "accel", "cornering", "braking"]) sum += (b[k] || 1) / (w[k] || 1);
  return sum / 4;
}

function makeCars() {
  cars = [];
  // the custom team only enters the grid when the player has selected it
  const grid = Teams.LIST.filter((t, ti) => !t.custom || ti === teamIdx);
  // Counted through the same accessor the loop below iterates, or MY TEAM's second
  // car would be missing from the lane spread it feeds.
  const total = grid.reduce((s, t) => s + Career.gridDrivers(t).length, 0);
  let idx = 0;
  grid.forEach((team) => {
    const ti = Teams.LIST.indexOf(team);
    const factoryParts = Parts.resolveSetup(Parts.getFactorySetup(team), team);
    const savedParts = ti === teamIdx ? Parts.resolveSetup(getTeamParts(team.id), team) : factoryParts;
    // MY TEAM enters TWO cars — you and the driver you hired — where the custom
    // team ships with one. gridDrivers() returns team.drivers unchanged in every
    // other case, so free play and driver careers are untouched.
    Career.gridDrivers(team).forEach((dSeat, di) => {
      const isP = ti === teamIdx && di === driverIdx;
      // MY TEAM's second car is YOUR car. `team.custom` plus a seat that is not
      // yours is the hire by construction: the custom team fields one entry
      // everywhere except a MY TEAM career (see gridDrivers), so free play and
      // driver careers cannot reach this. It fixes a guide that was lying —
      // js/game/career-ui.js says "Both cars run your build" — and a
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
      const lane = clamp(((idx / Math.max(1, total - 1)) * 2 - 1) * 0.78
        + (simRnd() - 0.5) * 0.12, -0.85, 0.85);
      idx++;
      cars.push({
        team, name: d.name, code: d.code, driverId: seasonDriverId(team.id, di), num: d.num,
        // Role flags — see setCarRole. Today the only human IS the local player,
        // so all three agree; a networked rival is human without being local.
        human: isP, local: isP, isPlayer: isP,
        // Per-car performance multipliers (human cars only — see modsFor).
        // startRace()'s recomputePlayerMods() refreshes the local player's.
        mods: isP ? modsFor(team, getTeamParts(team.id)) : null,
        // AI runs the works wing/ERS (SIGNATURE equivalents already differ).
        // MY TEAM + hire share the saved build; everyone else uses factory.
        aeroLoad: (isP || mate) ? Parts.aeroLoad(getTeamParts(team.id), team) : Parts.aeroLoad(factoryParts.setup, team),
        ersDeploy: (isP || mate) ? Parts.ersProfile(getTeamParts(team.id), team).deploy : Parts.ersProfile(factoryParts.setup, team).deploy,
        ersRegen: (isP || mate) ? Parts.ersProfile(getTeamParts(team.id), team).regen : Parts.ersProfile(factoryParts.setup, team).regen,
        color: team.color, tier: team.tier, seat: di, houseStats: Career.teamStats(team),
        // Baked once here rather than looked up per physics step. Career team
        // development rides along in the same number the tier always contributed,
        // so the per-car update below is unchanged in shape. paceMult() is exactly
        // 1 outside career, making GP/TT bit-identical.
        tierV: TIER_V[team.tier] * Career.paceMult(team.id) * (mate ? buildPace(savedParts, factoryParts) : 1),
        fuelId: resolvedParts.ids.fuel,
        fuelVisual: resolvedParts.visual.fuel,
        s: 0, x: 0, speed: 0, prog: 0, lap: 0,
        gear: 1, rpm: IDLE_RPM, shiftT: 0, boostOn: false,
        energy: 1, otT: 0, otCool: 0, deploying: false,
        // active aero: commanded mode, the 0..1 flap blend, and whether the
        // road ahead currently allows X-mode at all (see xStraightAhead).
        xOn: false, aeroX: 0, xArmed: false,
        lapStart: 0, lapTime: 0, best: Infinity, totalT: 0,
        finished: false, finishT: 0, finPos: 0,
        // Retirement (js/game/reliability.js). `retired`/`dnf` are the record;
        // dnfAt/dnfWhy are the plan Reliability.arm() draws at the green light.
        // Declared here so every car has the shape whether or not a race arms it.
        retired: false, dnf: null, dnfAt: null, dnfWhy: null,
        offroad: false, offT: 0, cuts: 0, penalty: 0,
        yawVis: 0, steerVis: 0, collideT: 0,
        ...driverSkill(team, d, di),   // skill + craft + awareness + experience
        // lanePref is the grid home line; adaptLane biases around it and must
        // not accumulate forever into ±0.85 under pack traffic.
        lane, lanePref: lane,
      });
    });
  });
  player = cars.find((c) => c.isPlayer) || null;   // find() yields undefined; G.player's contract is CarState | null
}

// `preOrder` is an explicit grid, fastest first — a qualifying classification.
// Without one: sort by tier, player dropped into P12 for a climb. GP keeps that
// on purpose; only a session that held a qualifying hour sets its own grid.
function gridUp(preOrder) {
  const order = preOrder && preOrder.length === cars.length ? preOrder.slice() : (() => {
    // grid jitter: ONE simRnd() draw per car, BEFORE the sort — a random
    // comparator is inconsistent and its draw count engine-defined.
    const jit = new Map(cars.map((c) => [c, simRnd()]));
    const o = cars.slice().sort((a, b) => (a.tier - b.tier) || (jit.get(a) - jit.get(b)));
    const pi = o.indexOf(player);
    o.splice(pi, 1);
    o.splice(Math.min(11, o.length), 0, player);
    return o;
  })();
  order.forEach((c, i) => {
    // Where this car STARTED — the only record: `order` is discarded here and the
    // flag classification is built from finishing times. Career's "out-qualify
    // your team-mate" objective reads it; correct for both branches above.
    c.gridPos = i + 1;
    c.s = wrapS(track.total - 14 - i * 8);
    c.x = (i % 2 === 0 ? -1 : 1) * Math.min(smpHw(c.s) * 0.4, 3);
    c.xVis = c.x;   // dump/net field; render no longer damps this
    {
      const w = worldFromTrack(c.s, c.x, smp);
      c.px = w.x; c.pz = w.z;
      c.rPrevPx = c.px; c.rPrevPz = c.pz;
      c.rPrevS = c.s; c.rPrevX = c.x;
    }
    c.head = 0; c.yawVis = 0;   // straight ahead on the grid (heading model)
    c.speed = 0; c.prog = -(14 + i * 8); c.lap = 0; c.energy = 1;
    c.otT = 0; c.otCool = 0; c.lapTime = 0; c.best = Infinity; c.totalT = 0;
    c.xOn = false; c.aeroX = 0; c.xArmed = false;   // flaps shut on the grid
    c.finished = false; c.finishT = 0; c.cuts = 0; c.cutWarn = 0; c.penalty = 0; c.offT = 0;
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

function buildCarData(team, extra) {
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
    noWheels: !!(extra && extra.noWheels),
    field: !!(extra && extra.noWheels),   // factory body — probe vs playerBodies
  });
}

// Memoized per team.id, invalidated by store.rev — same pattern as
// _livResolveCache above, and for the same reason. This key is rebuilt from
// getLiveryId (a store read, itself two string concatenations) plus
// Parts.factoryKey (a fresh 12-element array and a ~60-char join), and teamMesh
// is called for EVERY drawn car in the body pass, again in the dynamic car-shadow
// pass and again in the night lamp-shadow pass — up to ~66 times a frame for a
// value that cannot change unless something was written to the store.
const _teamMeshKeyCache = new Map();
function teamMeshKey(team) {
  const c = _teamMeshKeyCache.get(team.id);
  if (c && c.rev === store.rev) return c.val;
  const val = team.id + ":" + getLiveryId(team.id) + ":" + Parts.factoryKey(team);
  _teamMeshKeyCache.set(team.id, { val, rev: store.rev });
  return val;
}
function teamMesh(team) {
  return putBoundedMesh(teamMeshes, teamMeshOrder, teamMeshKey(team), () => gfx.createMesh(buildCarData(team)), TEAM_MESH_CACHE_MAX);
}
function teamBodyMesh(team) {
  return putBoundedMesh(teamBodies, teamBodyOrder, teamMeshKey(team), () => gfx.createMesh(buildCarData(team, { noWheels: true })), TEAM_MESH_CACHE_MAX);
}

// Car decal / effect-quad / cockpit-instrument geometry lives in
// js/game/carmesh.js (CarMesh; renderer handle injected below at boot).
CarMesh.init(gfx);
// The garage/setup-preview environment — js/game/garage-scene.js, same pattern.
GarageScene.init(gfx);
// Transient FX particle pool (tyre smoke / sparks / kickup / rain spray) —
// js/game/particles.js; same injected-renderer pattern as CarMesh above.
Particles.init(gfx);
const { carDecalData, getCarDecalMesh, getCockpitDecalMesh,
        getBrakeRing, getRainLight, getExhaustFlame, getErsLight,
        getCockpitWheel, getLedStrip, getGearDigit, getSpeedDigit,
        getErsBar, getOtLamp, drawWheelExtras } = CarMesh;
const _decalTexCache = {}, _decalTexFail = {}, _decalTexOrder = [];
function invalidateDecalTextures(teamId) {
  const prefix = teamId + ":";
  Object.keys(_decalTexCache).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    const tex = _decalTexCache[key];
    if (tex && gfx.freeTexture) gfx.freeTexture(tex);
    delete _decalTexCache[key]; delete _decalTexFail[key];
    const oi = _decalTexOrder.indexOf(key); if (oi >= 0) _decalTexOrder.splice(oi, 1);
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
    catch (e) {
      // Swallowed AND cached as null before: one transient miss stripped that
      // team's numbers/sponsors for the session, unlogged. Log and retry — but
      // this runs per drawn car per FRAME, so cache the null after 3 tries.
      const n = _decalTexFail[key] = (_decalTexFail[key] || 0) + 1;
      if (n === 1) Log.warn("gfx", "decal atlas build failed for " + key, e);
      if (n < 3) return null;
    }
    _decalTexCache[key] = t; _decalTexOrder.push(key);
    while (_decalTexOrder.length > DECAL_TEX_CACHE_MAX) {   // FIFO: browsing liveries minted page-lifetime ~5 MB atlases
      const old = _decalTexOrder.shift(), ot = _decalTexCache[old];
      if (ot && gfx.freeTexture) gfx.freeTexture(ot);
      delete _decalTexCache[old]; delete _decalTexFail[old];
    }
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
// to draw. getVisualTiers is a small 12-category loop and the resulting mesh is
// cached per level, so resolving this per car/frame is negligible.
const _aeroLevelCache = new Map();   // "player|factory:team.id" -> {val, rev}
function teamDecalState(team, usePlayerSetup) {
  const key = (usePlayerSetup ? "player:" : "factory:") + team.id;
  const rev = usePlayerSetup ? store.rev : -1;
  const c = _aeroLevelCache.get(key);
  if (c && c.rev === rev) return c;
  const setup = usePlayerSetup ? getTeamParts(team.id) : Parts.getFactorySetup(team);
  const parts = Parts.getVisualTiers(setup, team);
  // aero: the resolved RECIPE, resolved once here for every flap consumer.
  // parts.aero is the tier NUMBER — passing that to Car3D.aeroFlaps() NaN'd
  // every flap vertex and made the moveable wings invisible (see aeroStyleOf).
  const state = { val: Car3D.aeroLevelOf ? Car3D.aeroLevelOf(parts) : 2,
                  aero: Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null,
                  parts, rev };
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
// Argument scratch for DebrisWorld.tyreMarble — called per car per physics step
// from both the player and AI paths. Read-only at the callee (and spawnMarble
// retains nothing), so one shared object is safe.
const _marbleArg = { lock: 0, slip: 0, speed: 0 };
// ...and a third for the camera, which asks once per frame from render() and
// was the one call site still letting banking() allocate.
const _bankScratchCam = { dy: 0, roll: 0 };
// Pooled camVantage extras + damp anchors — vantage() reads synchronously, keeps no reference.
const _vantCarPos = [0, 0];
const _vantExtra = { bankDy: 0, deploy: false, slipLat: 0, att: null, carPos: null, carHead: 0 };
const _camAP = [0, 0, 0], _camAN = [0, 0, 0];

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
  const key = team.id + ":" + playerVisualKey + (CockpitOpts.halo() ? ":H" : "");   // halo keys the cache: toggling rebuilds, no reload
  return putBoundedMesh(cockpitBodies, cockpitBodyOrder, key, () => {
    const liv = resolveLivery(team);
    return gfx.createMesh(Car3D.build(liv.c1, liv.c2,
      { livery: liv, teamId: team.id, noWheels: true, noDriver: true, cockpit: true, halo: CockpitOpts.halo(), num: team.drivers && team.drivers[0] && team.drivers[0].num,
        parts: Parts.getVisualTiers(getTeamParts(team.id), team) }));
  }, COCKPIT_BODY_CACHE_MAX);
}
// Hub transform (translate + upscale) + scratch matrices for the steering roll
// and per-element LCD offsets. The rig z is NOT cosmetic: the cockpit near
// plane is 0.30 m (_nearM below) and the eye sits at car-local z -0.20, so any
// hub nearer than z ~0.14 puts the whole dash INSIDE it — measured at z 0.10
// the wheel projected at w 0.276 and EVERY instrument at 0.274: LCD, LED strip,
// digits and aero lamp all clipped, the wheel a washed-out near-clipped shell.
const _rigT = new Float32Array([0.80,0,0,0, 0,0.80,0,0, 0,0,0.80,0, 0,0.63,0.26,1]);
const _rigR = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _rigA = new Float32Array(16), _rigB = new Float32Array(16);
const _digT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _digM = new Float32Array(16);
const _rigFx = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true }, _rigFxA = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 1 };
function drawCockpitRig(c, base, dt, paint) {
  const nite = raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night);
  _cockpitOpts.emissive = nite ? 0.16 : 0;
  const opt = _cockpitOpts;
  // The actual car around you: body (minus helmet) with the real paint, plus
  // the steering/spinning FRONT wheels (the rears sit right beside the camera
  // in the wide FOV and blob the bottom corners — skipped). Nudged 0.30 m
  // forward of their real physics position so they read further out ahead of
  // the driver instead of hugging the cockpit edge (cosmetic-only offset —
  // the actual wheel/contact-patch physics is untouched).
  gfx.draw(cockpitBodyMesh(c.team), base, paint);
  // The cockpit body includes the FRONT wing, whose top elements are active
  // aero and therefore not baked into it — draw them, or the driver looks out
  // over a wing that is missing its flaps. The rear assembly is not part of
  // this build at all, hence "front" only.
  if (!carModelBuf) {
    const aSt = teamDecalState(c.team, c.isPlayer);
    drawAeroFlaps(c.team, aSt.val, c.aeroX || 0, base, paint, aSt.aero, "front");
  }
  // Forward decal: the driver number on the nose plate ahead of the driver (the
  // nose is identical to the chase build, so this lands exactly on the plate).
  // Queued with the field's decals and flushed after the car loop. The player
  // cockpit is the one queued decal that renders the PLAYER's setup parts.
  queueCarDecals(c.team, base, carDecalNum(c.team, c), true, true);
  _cockpitWheelOpts.emissive = nite ? 0.12 : 0;
  drawPlayerWheels(c, base, dt, _cockpitWheelOpts, true, 0.30, 1.4);
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
  gfx.draw(getCockpitWheel(resolveLivery(c.team)), _rigB, opt);   // livery-keyed: team grips/marker/gloves
  // Live telemetry ON the wheel (all ride the wheel matrix, like the real LCD):
  // gear (auto or manual — c.gear is maintained by both paths), RPM shift
  // lights, speed, pedal bars, ERS energy.
  const fx = _rigFx;
  gfx.draw(getGearDigit(clamp(c.gear || 1, 0, 9)), _rigB, fx);
  const rpmF = clamp(((c.rpm || IDLE_RPM) - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  gfx.draw(getLedStrip(rpmF > 0.965 ? (raceT * 14 % 1 < 0.5 ? 9 : 0) : Math.round(rpmF * 8)), _rigB, fx);
  drawWheelExtras(_rigB, c, raceT);   // ACTIVE AERO lamp + flap-travel bar (carmesh.js)
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
    gfx.draw(getErsBar(), _digM, c.deploying ? (_rigFxA.alpha = 0.75 + 0.25 * Math.sin(raceT * 22), _rigFxA) : fx);
  }
  // OVERTAKE lamp on the wheel: white when armed, pulsing purple while active
  // (the floating HUD OVERTAKE text is hidden in cockpit view).
  if (c.otT > 0) {
    gfx.draw(getOtLamp(true), _rigB, (_rigFxA.alpha = 0.7 + 0.3 * Math.sin(raceT * 18), _rigFxA));
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
// Factory tyre/brake/rim per team — the old baked AI wheel look — but as a
// planted spinning pair, not glued to the chassis. Own cache so garage swaps
// cannot evict the field (WHEEL_MESH_CACHE_MAX is a player-parts bound).
const fieldWheelCache = {};
function getFieldWheelMeshes(team) {
  const vt = teamDecalState(team, false).parts;   // permanently cached factory resolve — was ~1260 resolveSetup/s across the drawn field
  const key = "field:" + (vt._ids ? vt._ids.tyres + ":" + vt._ids.brakes + ":" + vt._ids.wheels : "1:1:1");
  let mesh = fieldWheelCache[key];
  if (mesh) return mesh;
  const tyre = vt._visual && vt._visual.tyres;
  const brake = vt._visual && vt._visual.brakes;
  const wheel = vt._visual && vt._visual.wheels;
  const band = (tyre && tyre.band) || Car3D.TYRE_BAND[vt.tyres] || Car3D.TYRE_BAND[1];
  const caliper = brake ? brake.cal : Car3D.BRAKE_CALIPER[vt.brakes];
  const rim = brake && brake.rim;
  const grooved = !!(tyre && tyre.grooved);
  const front = Car3D.buildWheelLayers(0.32, band, caliper, rim, grooved, tyre, brake, wheel);
  const rear = Car3D.buildWheelLayers(0.38, band, caliper, rim, grooved, tyre, brake, wheel);
  mesh = {
    F: gfx.createMesh(front.rotating),
    R: gfx.createMesh(rear.rotating),
    FFixed: gfx.createMesh(front.fixed),
    RFixed: gfx.createMesh(rear.fixed),
  };
  fieldWheelCache[key] = mesh;
  return mesh;
}
function drawPlayerWheels(c, base, dt, opt, frontsOnly, fwdOffset, wScale) {
  const wm = c.isPlayer ? getPlayerWheelMeshes() : getFieldWheelMeshes(c.team);
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
    let ringOk = heat > 0.05;
    if (ringOk && !c.isPlayer) {
      const dx = base[12] - camEye[0], dy = base[13] - camEye[1], dz = base[14] - camEye[2];
      ringOk = dx * dx + dy * dy + dz * dz < 40 * 40;
    }
    if (ringOk) {
      const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.025);
      const W = _ringWorld;
      W.set(_wheelWorld);
      W[12] += W[0] * tx; W[13] += W[1] * tx; W[14] += W[2] * tx;
      // Pooled, like the AI ring path: this allocated a literal per hot wheel.
      const ro = _ringOpts;
      ro.emissive = 0.30 + 0.70 * heat; ro.alpha = Math.min(1, 0.25 + heat * 0.9);
      gfx.draw(getBrakeRing(), W, ro);
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
    for (const k in teamBodies) { if (gfx.freeMesh) gfx.freeMesh(teamBodies[k]); delete teamBodies[k]; }
    for (const k in playerBodies) { if (gfx.freeMesh) gfx.freeMesh(playerBodies[k]); delete playerBodies[k]; }
    playerBodyOrder.length = 0;
    for (const k in cockpitBodies) { if (gfx.freeMesh) gfx.freeMesh(cockpitBodies[k]); delete cockpitBodies[k]; }
    cockpitBodyOrder.length = 0;
    for (const k in wheelMeshCache) { freeWheelPair(wheelMeshCache[k]); delete wheelMeshCache[k]; }
    wheelMeshOrder.length = 0;
    for (const k in fieldWheelCache) { freeWheelPair(fieldWheelCache[k]); delete fieldWheelCache[k]; }
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
  _lampShBest = -1; _lampShSX = _lampShSZ = null;
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
      if (track.meshes.roadChunked && gfx.freeChunkedMesh) gfx.freeChunkedMesh(track.meshes.roadChunked);
      if (track.meshes.terrainChunked && gfx.freeChunkedMesh) gfx.freeChunkedMesh(track.meshes.terrainChunked);
      if (gfx.freeChunkedMesh) gfx.freeChunkedMesh(track.meshes.props); else gfx.freeMesh(track.meshes.props);
      if (track.meshes.propBatches && gfx.freeInstancedBatch) {
        for (let i = 0; i < track.meshes.propBatches.length; i++) gfx.freeInstancedBatch(track.meshes.propBatches[i]);
        track.meshes.propBatches = null;
      }
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
    track = Tracks.build(def, { night: sessionDark, gfx, chunkRibbons: PerfGov.tier() < 3 });
    // Rapier debris side-world: register the circuit's near-apex clippable cones
    // (A3). Cheap pure derivation from track.def.turns; stores the list even when
    // the side-world is disabled/loading so it's ready once rapier is live.
    DebrisWorld.registerFurniture(track);
    builtTrackId = def.id;
    builtTrackNight = sessionDark;
    aeroZ.build();              // fixed ACTIVATION ZONES for this circuit
    // Env probe still holds the previous circuit — fall back to the analytic
    // sky until a fresh 6-face cycle has captured the new one.
    if (gfx.envProbeReset) gfx.envProbeReset();
    Ghost.setTrack(def.id);
    hud.invalidateMap();        // force minimap redraw for new track
  }
  const pal = def.palette;
  frame = {
    viewProj: M4.ident(), eye: camEye,
    sunDir: V3.norm(pal.sunDir), sunColor: pal.sunColor,
    ambientGround: pal.ambientGround, ambientSky: pal.ambientSky,
    fogColor: pal.fog, fogDensity: pal.fogDensity,
    skyZenith:  pal.zenith,
    skyHorizon: pal.horizon,
    // exposure: applyRaceSettings() is its ONLY writer and runs at startRace(), so the
    // MENU FLYBY had none — po.exposure went NaN, blacking it out (meanLum 1.06/255).
    fogHeight:  pal.fogHeight != null ? pal.fogHeight : 0.018, exposure: 1,
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
  // Never hand loadTrack a negative index (exhausted career/season calendar).
  if (!(trackIdx >= 0)) return;
  flybyBuildTimer = setTimeout(() => {
    if (state === "menu" && trackIdx >= 0) loadTrack(trackIdx);
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

// Lamps (street posts + flood banks, one list) fire at night/dusk/dawn, plus a
// night-default track in default mode. Shared by applyRaceSettings (pre-build)
// and the render loop (per-frame) so the two can't drift out of sync.
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
  const bankCam = Tracks.banking(track, player.s, player.x, _bankScratch, true);  // smooth lift: match render()
  const mode = CAM_MODES[camMode].id;
  const v = camVantage(mode, player.s, player.x, player.speed || 0, 0, {
    bankDy: bankCam ? bankCam.dy : 0, deploy: player.deploying, slipLat: player.vLat || 0, att: player,
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
  try { if (gfx && gfx.invalidateSoftPresent) gfx.invalidateSoftPresent(); } catch (_) { /* GLX */ }
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
// Nothing here draws from simRnd: see js/game/reliability.js.
function armReliability(field) {
  const c = Career.data();
  const team = player ? player.team : Teams.LIST[teamIdx];
  Reliability.arm(field, {
    level: raceReliability,
    seed: Career.inCareer() && c ? c.seed : simSeed(),
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

// Put the player on the LINE, AT REST — a standing qualifying lap.
//
// This used to launch at racing speed, because the simulated field is modelled
// on a flying lap and timing a driven lap from a standstill against it would
// lose you the launch every weekend by construction. The answer to that is not
// to fake the player's start, though: it is to charge the MODEL the same
// standing start (see STANDING_LOSS in js/game/quali.js), so both sides of the
// comparison begin from rest and the two remain on one scale.
//
// Written in TRACK coordinates and pushed back out through worldFromTrack,
// exactly as rescuePlayer() and retireCar() do.
function launchFlyingLap() {
  if (!player || !track) return;
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
  announce("QUALIFYING LAP", 1.6);
}

// SCREEN WAKE LOCK for a race; browsers release it whenever the page hides.
let raceWake = null;
let raceWakePending = null;
let raceWakeWanted = false;
function holdRaceWake() {
  raceWakeWanted = true;
  try {
    if (!navigator.wakeLock || raceWake || raceWakePending) return;
    const pending = navigator.wakeLock.request("screen");
    raceWakePending = pending;
    pending.then((lock) => {
      if (raceWakePending === pending) raceWakePending = null;
      if (!raceWakeWanted || document.hidden) {
        try { lock.release(); } catch (e) { Log.info("game", "late wake-lock release failed"); }
        return;
      }
      raceWake = lock;
      // An old sentinel may release after a replacement exists: compare identity.
      lock.addEventListener("release", () => { if (raceWake === lock) raceWake = null; });
    }).catch(() => { if (raceWakePending === pending) raceWakePending = null; });
  } catch (e) { /* unsupported or refused: the screen just sleeps as normal */ }
}
function dropRaceWake() {
  raceWakeWanted = false;
  const held = raceWake;
  raceWake = null;
  try { if (held) held.release(); } catch (e) { Log.info("game", "wake lock was already released"); }
}

function startRace() {
  // Completed seasons are readable, never raceable (also guarded by award()).
  if ((flow === "season" && !SeasonCal.canRace(season)) || (isCareer() && Career.conflicted())) {
    state = "menu"; $("race-settings").hidden = true;
    isCareer() && Career.conflicted() ? announce("SAVE CONFLICT — reload career", 3) : (buildSelect(), els.select.hidden = false);
    return false;
  }
  // Drop ownership of the previous race's car indexes before makeCars replaces them.
  IncidentSim.reset();
  raceCtl.reset();   // and the caution machine — no stale flag/capHoldT into this race
  // …and the debris side-world. prime() below only REBUILDS when the track or
  // car count changed, so a restart on the same circuit kept last race's
  // shards, marbles and knocked-over cones — visible on the grid, and
  // RaceControl can fly a caution for debris nobody produced this race.
  DebrisWorld.reset();
  loadTrack(trackIdx);
  makeCars();
  // Qualifying keeps the full field for simulation, then drives one standing lap.
  if (isQuali()) {
    qualiField = cars;
    cars = [player];
    lapsTarget = 1;
  } else if (isTimeTrial()) {
    cars = [player];          // solo against the clock — no AI on track
    lapsTarget = raceLaps;
    const board = ttBoard(track.def.id);
    ttRecord = board.length ? board[0].t : Infinity;
    ttNewRecord = false;
    ttLaps = [];
    ttSessionTs = Date.now();
  } else {
    // raceLaps stays the one source of truth for distance; lapsFor() only ever
    // DIVIDES it, and only on the sprint leg of a sprint weekend.
    lapsTarget = SeasonCal.lapsFor(raceLaps, season);
  }
  applyRaceSettings();
  if (isWetRoad()) {           // "rain" = storm; "wet" = the DRIZZLE tier —
    initRainDrops();           // initRainDrops seeds sparse/short/slow streaks
    Particles.rainShow(true);  // per the drizzle* TUNE_DEFS. Gating this on
  } else {                     // isRaining() made the whole shipped tier (three
    Particles.rainShow(false); // sliders + rainSeed(drizzle)) unreachable.
  }
  if (!isQuali() && gridFromQuali() && !quali.order(cars)) { openQuali(); return false; }
  gridUp(gridFromQuali() ? quali.order(cars) : SeasonCal.grid(cars, season));
  recomputePlayerMods();
  // THE ENVELOPE THIS RACE WILL BE DRIVEN IN, recorded once at the green light.
  //
  // js/game.js held ZERO Log calls before this one, despite `game` being the
  // namespace js/log.js defines for exactly this file. That mattered more than
  // it sounds: the buffer retains at `info` whether or not it prints, and
  // tests/helpers/fixtures.js attaches the ring to EVERY failure — so a physics spec
  // that failed on "speed was 43, expected > 50" had nothing in its attachment
  // saying what the car's top speed even was that run. One line makes the whole
  // class of pace/parts/weather failures self-explaining, which is what the
  // logging section of AGENTS.md asks for and what nothing here was doing.
  // (It sits BELOW recomputePlayerMods() so the mods/aeroLoad it reports are
  // this session's, not the previous one's — __apex.race()/tt() reach here
  // with no garage pass to have refreshed them.)
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
  // player can be null (roster/team resolution miss) — don't let startRace throw.
  sectorIdx = player ? sectorAt(player.s) : 0; sectorStartT = 0; sectorValid = true;
  // The SPLITS reset here, with the rest of the session — not in loadTrack.
  // They used to sit inside loadTrack's `builtTrackId !== def.id ||
  // builtTrackNight !== sessionDark` rebuild gate, so racing the same circuit
  // twice at the same time of day skipped the reset entirely: session two
  // opened with session one's bests already in the HUD, and its lap-1 deltas
  // were measured against a race that had already finished. Changing the time
  // of day cleared them, which made two otherwise identical sessions differ on
  // an unrelated setting. Session state belongs to the session.
  sectorBests = [Infinity, Infinity, Infinity];
  sectorLast = [null, null, null];
  // Arm the crash sentinel (mobile only) and, after a strike, start the
  // session pre-scaled-down — the governor may restore upward, but only under
  // the clear sustained headroom that proves the device can afford it.
  PerfGov.sentinelArm(true);
  if (PerfGov.strikes() > 0 && PerfGov.autoRes() && gfx.setRenderScale && gfx.getRenderScale)
    gfx.setRenderScale(Math.min(gfx.getRenderScale(), PerfGov.strikes() >= 2 ? 0.7 : 0.85));
  state = "count"; countT = 0; lightsLit = 0; raceT = 0; startHold = 0; paused = false; frozen = false; skyViewOverride = null;
  skids.reset();
  Particles.clear();   // no stale smoke/spray teleporting into the new session
  clearMenuScreens();
  els.hud.hidden = false; els.lights.hidden = false; els.pausebtn.hidden = false;
  if (els.btnCam) els.btnCam.hidden = false;
  setHudUserHidden(false);   // start every race with the HUD shown (+ resets the toggle label)
  // Hidden during a session: the HUD stays clean and the two switches that
  // matter (MUSIC, SOUND EFFECTS) live in SETTINGS > MUSIC & SOUND. Turning
  // both off is silence, so the master needs no mid-race button of its own —
  // and setMusic/setSfx lift it if it is off, so it can never strand you.
  // (#soundbtn rides #overlay now — see css/overlays.css for why.)
  document.body.classList.add("in-race");
  syncRotateBlocker(true);
  holdRaceWake();
  for (const l of els.lights.children) l.classList.remove("on");
  showTouchControls(true);
  dbgCam = null;              // fresh race — drop any leftover debug free-cam
  snapGameCam();              // frame the grid correctly on the very first render
  Input.calibrate();
  // RESUME's latch bug (see Input.clearEdges) at the menu→race seam: edges
  // mashed on the title (navOpen() false) would fire at lights-out.
  Input.clearEdges();
  if (soundOn) { GameAudio.setVoice(player && player.team && player.team.engine); GameAudio.startEngine(); GameAudio.startMusic(trackIdx); }
  if (soundOn && isRaining()) GameAudio.startRain();   // rain patter — a damp "wet" track is silent
  DebrisWorld.prime(); updateHud(true);   // prime: build the side-world HERE, not on the lights-out frame (see DebrisWorld.prime)
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

// Fill the two thumb docks. This is the ONE thing the flex bar cannot express
// on its own: a control genuinely changes SIDE between modes — pedals are
// left-thumb in tilt AUTO, right-thumb in tilt MANUAL and in buttons (arrows
// own the left) — and CSS cannot move an element to a different
// parent. Everything else (spacing, wrapping, centring, never overlapping) is
// the flex row's job, and there is deliberately not one coordinate here.
//
// It moves GROUPS, never single buttons. A dock is a wrapping flex row, so a
// dock holding five loose buttons breaks them apart wherever the width runs
// out — which is how a DN button ended up sitting above its own UP. A group is
// indivisible and carries its own shape (pedals and shifts are vertical pairs,
// steer and taps are rows), so wrapping can only ever reorder whole groups and
// a pair can never come apart or invert.
//
// Lists are in VISUAL left-to-right order, which for a normal flex row is just
// DOM order. Each thumb's home is the screen edge it sits at, so what is held
// continuously goes OUTERMOST — leftmost on the left, rightmost on the right —
// and the discretionary taps sit inboard of it.
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
    // Keyed by driverId, NOT by cars.indexOf. The old comment here claimed
    // "indices are stable: both grids are built from the same settings" and it
    // was simply untrue — makeCars() drops the custom team unless the local
    // player selected it, so the two grids differ in length and order and the
    // guest was re-reading the host's indices against its own array. A close
    // finish is exactly when that matters and exactly when nobody would notice
    // it had gone wrong.
    netPlay.reportResult(order.map((c) => ({
      d: c.driverId, t: c.finishT, p: c.penalty, lap: c.lap,
    })));
    return order;
  }
  const verdict = netPlay.peerResult();
  // Array.isArray, not just a truthy .length: this is the HOST's payload off
  // the wire, and `{length:1}` passes the old test then throws on .map —
  // straight into index.html's error overlay, which eats the classification
  // the guest is waiting on.
  if (!Array.isArray(verdict) || !verdict.length) return order;   // never arrived
  const byId = new Map(cars.map((c) => [c.driverId, c]));
  const sorted = verdict.map((e) => byId.get(e.d)).filter(Boolean);
  // Only adopt an order accounting for the WHOLE grid; a partial one would
  // silently drop cars off the results screen. An order we cannot fully resolve
  // now fails this the same way a truncated one always did.
  if (sorted.length !== cars.length) return order;
  verdict.forEach((e) => {
    const c = byId.get(e.d);
    if (!c) return;
    if (e.t != null) c.finishT = e.t;
    if (e.p != null) c.penalty = e.p;
  });
  return sorted;
}

function endRace(forcedOrder) {
  PerfGov.cleanRace();   // finished cleanly — disarm + pay a crash strike down
  // raceCtl.update's own not-in-race reset is unreachable (update() only calls
  // it in state "race"), so without this a flying flag survives into results
  // for anything reading raceCtl.info()/level between races.
  raceCtl.reset();
  // The flag can fall while the player is PAUSED — a networked guest is ended
  // by the host's RESULT, not by their own input. Leaving `paused` set stranded
  // the pause dialog on top of the results with a RESUME that resolves to
  // nothing, because resuming is only reachable from state "race".
  paused = false; els.pausemenu.hidden = true;
  state = "results";
  document.body.classList.remove("in-race");
  dropRaceWake();
  els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  if (soundOn) GameAudio.finish();
  // Qualifying ends in its own sheet: the player's flying lap is measured
  // against the simulated field and becomes the grid. Mirrors the TT return
  // below — first branch out, before any race classification is built.
  if (isQuali()) {
    cars = qualiField || cars;
    const myLap = player.lastLap > 0 ? player.lastLap : (player.best < Infinity ? player.best : 0);
    // Tell the other player what we set BEFORE building the sheet: their side
    // needs it to draw the same classification ours will.
    if (myLap > 0) netReportQuali(player.driverId, myLap);
    quali.simulate(qualiDriven(myLap));
    $("quali").classList.add("q-done");   // the session is run: only TO THE GRID now
    quali.open();
    refreshQualiGate();
    return;
  }
  if (isTimeTrial()) { buildTTResults(); els.results.hidden = false; return; }
  careerSettlement = null;   // whatever the last career round paid is not this race's news
  // classification: finished by time(+penalty), still running by progress, and
  // RETIREMENTS below both — ordered among themselves by how far they got, which
  // is the only thing that separates two cars that never saw the flag.
  const fin = cars.filter((c) => c.finished && !c.retired).sort((a, b) => (a.finishT + a.penalty) - (b.finishT + b.penalty));
  const run = cars.filter((c) => !c.finished && !c.retired).sort((a, b) => b.prog - a.prog);
  const out = cars.filter((c) => c.retired).sort((a, b) => b.prog - a.prog);
  // THE CLASSIFICATION IS THE HOST'S — see netOrder(), which is the inline
  // block that used to live here, unchanged in behaviour.
  const order = netOrder(forcedOrder || fin.concat(run, out));
  order.forEach((c, i) => { c.finPos = i + 1; });
  if (isChampionship()) {
    // POINTS, and whether the WEEKEND is over — js/game/season-cal.js owns both:
    // a season may sprint before the Grand Prix, and only the second of those two
    // scoring sessions closes the round. A career never sprints, so award() there
    // is the old block verbatim.
    const settles = SeasonCal.award(season, order) === "race";
    // In career `season` IS career.season (same object, same shape — which is what
    // lets buildResults/buildStandings/the HUD work in career untouched), so it
    // persists through the career save or this would overwrite the standalone
    // SEASON save with career's standings. KEEP the settlement: prize money,
    // salary, the bonus, the brief and the wage bill all resolve here, and
    // buildResults() is where the economy is legible as it moves.
    if (isCareer()) { if (settles) careerSettlement = Career.settleRound(order, player); }
    else store.set("season", season);   // the sprint's points AND its stage, one write
  }
  dbgCam = null;
  buildResults(order);
  els.results.hidden = false;
}

let ltStore = null;   // LightStore.create(G), assigned once G exists (below)

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
  get careerSettlement() { return careerSettlement; },
  openCareer: (...a) => openCareer(...a),
  get seasonMode() { return isChampionship(); },
  set seasonMode(v) { setFlow(v ? "season" : "gp"); },
  // The stateless-draw round, resolved EXACTLY as armReliability() does: the
  // championship round in a season/career, else the per-session race counter.
  // quali.js reads this so a non-career season's qualifying execution draw varies
  // round to round instead of being frozen at a hardcoded 0.
  get seasonRound() { return isChampionship() && season ? season.round : raceIndex; },
  get ttNewRecord() { return ttNewRecord; },
  get ttSessionTs() { return ttSessionTs; },
  get ttRecord() { return ttRecord; }, set ttRecord(v) { ttRecord = v; },
  get timeTrial() { return isTimeTrial(); },
  set timeTrial(v) { session = v ? "tt" : "race"; },
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
  retireCar: (c, reason) => retireCar(c, reason),
  get ranked() { return ranked; },
  get sectorLast() { return sectorLast; },
  // Setting the seed also rewinds the stream, so seeding then rebuilding the
  // grid reproduces a scenario exactly. See simSeed. (simRnd itself is NOT
  // exported: the physics stream stays private to this file — every module
  // that could draw from it documents that it deliberately must not.)
  get seed() { return simSeed(); }, set seed(v) { simSeed(v); },
  simSeed,
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
  get camCutT() { return camCutT; }, set camCutT(v) { camCutT = v; },   // for cam-modes.js
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
  // Read-only garage-camera state for __apex.garageCam().
  get setupPreviewSpin() { return setupPreviewSpin; },
  get setupPreviewAz() { return setupPreviewAz; },
  get setupPreviewEl() { return setupPreviewEl; },
  get setupPreviewDist() { return setupPreviewDist; },
  get setupPreviewPan() { return setupPreviewPan; },
  get setupPreviewAeroX() { return setupPreviewAeroX; },
  get raceAeroMode() { return raceAeroMode; },
  // Repaint the pause-menu button too: __apex.aeroMode() and the button are two
  // doors onto one value, and a stale label is a lie about the car's behaviour.
  set raceAeroMode(v) { raceAeroMode = v; store.set("aeroMode", v); refreshAeroBtn(); },
  get aeroZones() { return aeroZ ? aeroZ.zones : []; },
  aeroZoneAt: (s) => aeroZ.at(s),
  aeroZoneAhead: (s) => aeroZ.ahead(s),
  stepSetupAero: (dt) => stepSetupAero(dt),
  // Exactly what drawAeroFlaps() is handed in the garage — the resolved aero
  // LEVEL and STYLE from the player's own parts, not the defaults. Probing with
  // a null style tests a car nobody is driving.
  setupFlapArgs: () => {
    const aSt = teamDecalState(Teams.LIST[teamIdx], true);
    return { aLvl: aSt.val, style: aSt.aero || null };
  },
  setSetupAero: (on) => setSetupAero(on),
  get setupPreviewXOn() { return setupPreviewXOn; },
  get soundOn() { return soundOn; }, set soundOn(v) { soundOn = v; },
  get musicEnabled() { return musicEnabled; }, set musicEnabled(v) { musicEnabled = v; },
  get unlimitedBudget() { return unlimitedBudget; }, set unlimitedBudget(v) { unlimitedBudget = v; },
  get teamIdx() { return teamIdx; }, set teamIdx(v) { teamIdx = v; },
  // Stable helpers consumed by js/game/setup-ui.js.
  arrToHex, hexToArr, getTeamParts, saveTeamParts, getLiveryId, saveLiveryId,
  getCustomLiveries, setCustomLiveries, getLiveries, invalidateDecalTextures,
  armConfirm,
  // Mutable state + helpers consumed by js/game/menus.js.
  get driverIdx() { return driverIdx; }, set driverIdx(v) { driverIdx = v; },
  get difficulty() { return difficulty; }, set difficulty(v) { difficulty = v; },
  store, tickUi, scheduleFlybyTrack,
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
  // SEASON SETUP: menus.js draws the button, season-ui.js owns the screen, and
  // both need the OTHER one's entry point — hence the pair.
  openSeasonSetup: () => seasonUi.open(),
  buildSelect: (...a) => buildSelect(...a),
  updateTrackPreview: (...a) => updateTrackPreview(...a),
  // Read-only qualifying model for the CURRENT track (__apex.qualiSim).
  qualiSim: (playerTime) => quali.preview(playerTime || 0),
  refreshCareerButton: (...a) => refreshCareerButton(...a),
  // The R&D gate for the garage LISTING: the option ids the team on screen may fit,
  // or null. Career.owned() answers "career rules apply AND this is the career
  // team" by itself, so outside a career this is a no-op the garage can ignore.
  // Read per rebuild rather than held, so a part researched mid-session shows up.
  careerOwned: () => Career.owned(Teams.LIST[teamIdx] && Teams.LIST[teamIdx].id),
  // Mutable state + helpers consumed by js/game/photomode.js.
  get photoMode() { return photoMode; }, set photoMode(v) { photoMode = v; },
  get _photoPrevScale() { return _photoPrevScale; }, set _photoPrevScale(v) { _photoPrevScale = v; },
  get photoAlt() { return photoAlt; }, set photoAlt(v) { photoAlt = v; },
  get photoVertT() { return photoVertT; }, set photoVertT(v) { photoVertT = v; },
  // The live profile object owned by js/game/light-store.js — photomode.js
  // deletes a key out of it for the tuner's RESET and merges it for COPY VALUES.
  get _ltStore() { return ltStore.profiles; }, set _ltStore(v) { ltStore.profiles = v; },
  photoCam, photoKeys, photoMouse, photoMove, photoLook,
  applyResMode: (...a) => applyResMode(...a),   // const from UiScale.create(G) below — defer
  ltKey: (...a) => ltKey(...a),
  // (setLightTune is a hoisted function, exposed as a plain shorthand below —
  // the deferred-arrow copy that used to sit here was a dead duplicate key.)
  exitPhotoMode: (...a) => exitPhotoMode(...a),   // const initialised below — defer
  // Stable helpers consumed by js/game/atmosphere.js.
  clamp: (v, a, b) => clamp(v, a, b),
  satAdjust: (rgb, amt) => satAdjust(rgb, amt),
  isRaining: () => isRaining(),
  isWetRoad: () => isWetRoad(),
  initRainDrops: () => initRainDrops(),
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
  GAME_LAPS, TT_LAPS, LONG_GRIP, COUNTDOWN_S,
  // The friction-circle constants, for js/game/quali.js: it runs a quasi-steady
  // lap simulation off the SAME numbers the driving model uses, so a simulated
  // qualifying time and a driven one are on one scale by construction.
  // LAT_MAX and BRAKE are absolute in the driving model (cornering grip and
  // braking do not scale with pace — only acceleration and top speed do), so
  // they pass through as constants; acceleration goes through aTop().
  LAT_MAX, BRAKE,   // ACCEL is deliberately NOT here — reading it was the bug aTop() fixed
  vTop: () => vTop(),
  aTop: () => aTop(),
  applyRaceSettings: () => applyRaceSettings(),   // const initialised below — defer
  announce, applyCaution, camVantage, endRace, gridUp, gripMult, isErsDeploying, cautionInfo,
  aeroDfMult, xVmaxGain, xDfLoss, drainFor, regenFor, otTimeFor, otCoolFor,
  setCautionEnabled, otEnabled,
  get netPlay() { return netPlay; },
  get netStart() { return netStart; }, set netStart(v) { netStart = v; },
  // DECLARED, not an expando. js/net/netplay.js and js/game/apex.js write
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
  loadCarModel, loadTrack, persistLightTune, copyLightTune, restoreLightTune,
  refreshLightTunePanel: (...a) => refreshLightTunePanel(...a),   // const initialised below — defer
  setCamMode: (...a) => setCamMode(...a),   // const from CamModes.create(G) below — defer
  rescuePlayer, setLightTune, setWeatherLive, setTimeOfDay, weather, snapGameCam,
  setCarRole, modsFor, swapGridSlots,   // multiplayer seam — see setCarRole
  wireId,                               // stable cross-peer car identity
  setScale: (...a) => setScale(...a),   // const from UiScale.create(G) below — defer
  // Debug teleports can run while a headless/SwiftShader frame is starved.
  // Let apex.js synchronise its observable HUD state without waiting for rAF.
  refreshHud: (...a) => updateHud(...a),   // const initialised below — defer
  // The waiting room reuses the real menus rather than reimplementing them.
  setNetRoom, openRaceSetup, get netRoom() { return netRoom; },
  // Seats held by the OTHER players, so the garage can refuse to hand out one
  // that is taken. An array today of at most one entry; up to three when the
  // room grows past two. Empty off-line, which is what keeps every solo mode
  // exactly as it was.
  peerSeats: () => (netLobby && netLobby.peerSeats ? netLobby.peerSeats() : []),
  onPeerQuali, onPeerQualiLive, openQualiForNet, refreshQualiGate,
  get raceQuali() { return raceQuali; }, set raceQuali(v) { raceQuali = !!v; },
  openGarageFrom: (from) => openGarage(from),
  startRace, startWeatherArc, update, wrapS, quitToMenu,
};

// Lighting profile resolution + persistence (js/game/light-store.js). FIRST of
// the module wires: it reads the saved profiles at construction, and
// Atmosphere's applyRaceSettings — created a few lines down — calls into it.
ltStore = LightStore.create(G);
// Race control: the caution flag state machine (js/game/racecontrol.js).
raceCtl = RaceControl.create(G);
// Results / TT-leaderboard / standings DOM builders (js/game/results.js).
const { buildResults, buildTTResults, buildStandings, buildChampion } = GameResults.create(G);
// In-race HUD + minimap (js/game/hud.js).
const hud = GameHud.create(G);
const updateHud = hud.updateHud;
// Session atmosphere: applyRaceSettings + per-track bias (js/game/atmosphere.js).
const applyRaceSettings = Atmosphere.create(G).applyRaceSettings;
// CAR SETUP panel UI (js/game/setup-ui.js).
const { buildSetup, openSetup } = SetupUI.create(G);
// Select-screen UI (js/game/menus.js).
const { buildSelect, updateTrackPreview, openTrackDetail, closeTrackDetail, setTeamPicker, teamSwatch, vt } = Menus.create(G);
// UI SIZE / HUD SIZE + RESOLUTION (js/game/ui-scale.js). After Menus so the
// first applyUiScale can refresh an already-built select preview.
const { setScale, applyResMode } = UiScale.create(G);
// CAREER screen — new-career setup + season hub (js/game/career-ui.js). The rules
// and the save live in js/game/career.js, which is a plain global and needs no ctx.
const careerUi = CareerUI.create(G);
// SEASON SETUP screen (js/game/season-ui.js) — the calendar and weekend format.
// Same split: the rules and the save live in js/game/season-cal.js.
const seasonUi = SeasonUI.create(G);
// QUALIFYING (js/game/quali.js) — the flying lap plus the simulated field it is
// measured against. Holds the classification between the session and the grid.
const quali = Quali.create(G);
// ACTIVE AERO activation zones (js/game/aerozones.js) — pure circuit geometry.
aeroZ = AeroZones.create(G);
// Tyre marks (js/game/skidmarks.js) — self-contained ring buffer + batched draw.
skids = SkidMarks.create(G);
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
// Two-player racing (js/net/netplay.js). Wholly inert until a session starts:
// owns() is an identity check against a null, and tick() returns immediately.
const netPlay = NetPlay.create(G);
// The VS FRIEND lobby (js/net/lobby.js) — owns the #vsfriend screen and the
// two code pastes that stand in for a signalling server.
const netLobby = NetLobby.create(G);
// C2 visual suspension (js/game/bodyattitude.js) — render-only cosmetic chassis
// pitch/roll/heave springs; DEFAULT ON, disable via apex26.bodyAttitude/__apex.bodyAttitude.
const bodyAttitude = BodyAttitude.create(G);
// MUSIC & SOUND panel (js/game/audio-panel.js) — the mixer screen, the ♪
// master button and the audio-settings persistence. create() wires the DOM;
// init() runs at the boot-restore position near the end of this file.
const audioPanel = AudioPanel.create(G);

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
  if (!btn.dataset.armed) {
    btn.dataset.armed = "1";
    btn.textContent = armedText;
    btn.classList.add("armed");
    return false;
  }
  delete btn.dataset.armed;
  btn.classList.remove("armed");
  action();
  return true;
}

// Every menu layer, gone. Until multiplayer, startRace() could name the three
// screens a race is reachable FROM (#overlay, #select, #results), because the
// player pressing GO was standing on one of them. In a VS FRIEND race the HOST
// owns lights-out, so the guest can be anywhere when it lands — in the garage,
// in the waiting room, reading the rules — and each of those stayed up over a
// running race with the HUD and the pedals showing through it.
//
// So this asks the DOM which layers exist instead of keeping a list that the
// next screen silently falls off. `.screen` is what every full-screen menu and
// modal is marked with; #overlay (the title screen) and the two tuner panels
// predate the class and are named individually.
function clearMenuScreens() {
  for (const el of document.querySelectorAll(".screen")) el.hidden = true;
  for (const id of ["overlay", "lighting", "camtune"]) { const el = $(id); if (el) el.hidden = true; }
  // The garage's 3D turntable keeps rendering while #carsetup is up; a race
  // starting under it must stop that, or the preview draws over the track.
  setupPreviewOn = false;
  // Nothing to go back TO any more — the room this came from is now a race.
  netRoom = false;
  garageReturn = "select";
}

// The mql is only the CHANGE TRIGGER; ACTIVE is read off computed display so
// css/responsive.css owns the whole condition once — the duplicated 743px
// query here could drift (blocker painting while aria-hidden). Cheap call rate.
const rotateBlockMql = window.matchMedia ? window.matchMedia("(orientation: portrait) and (pointer: coarse) and (max-width: 743px)") : { matches: false };
function syncRotateBlocker(moveFocus) {
  const box = $("rotate-device"); if (!box) return false;
  const active = getComputedStyle(box).display !== "none";
  box.setAttribute("aria-hidden", active ? "false" : "true");
  // The pause CARD and an active blocker never share the screen. #pausemenu is
  // a modal <dialog> (TopModal), so left open it sits in the top layer ABOVE
  // the z-9000 blocker — visually over it, and refusing focus to anything
  // outside itself: the OPEN CONTROLS roundtrip landed on RESUME instead of
  // back on the blocker's button. `paused` survives; the card returns the
  // moment the blocker leaves (rotate to landscape mid-pause and it is there).
  if (paused) els.pausemenu.hidden = active;
  if (active && moveFocus) requestAnimationFrame(() => {
    const first = $("rotate-controls"); if (first && getComputedStyle(box).display !== "none") first.focus();
  }); return active;
}
if (rotateBlockMql.addEventListener) rotateBlockMql.addEventListener("change", () => syncRotateBlocker(true));
else if (rotateBlockMql.addListener) rotateBlockMql.addListener(() => syncRotateBlocker(true));

function quitToMenu() {
  PerfGov.sentinelArm(false); if (netPlay.active()) netPlay.stop("local"); hideCamPicker();
  closeLightTuner(false);
  closeCamTuner(false); exitPhotoMode();
  state = "menu"; paused = false;
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
  els.pausemenu.hidden = true; els.results.hidden = true; els.announce.hidden = true;
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
  setFlow("gp"); session = "race";
  quali.clear();   // memory only — persist stays until award/abort so CONTINUE keeps the grid
  qualiPeers.clear();
  // Title QUIT leaves the session: cancel() tears RTC down; q-back keeps abortQuali().
  qualiNetDone ? (qualiNetDone = null, qualiHadRivals = false, qualiLive.clear(), netLobby.cancel()) : (qualiNetDone = null, qualiLive.clear(), qualiHadRivals = false);
  // …and drop the career championship alias with it, so STANDINGS on the title
  // screen describes the standalone season again.
  season = store.get("season", null);
  // Standings once an active season has scored. hasProgress(), not `round > 0`:
  // a sprint banks points while its round is still open (js/game/season-cal.js).
  const hasSeason = SeasonCal.hasProgress(season) && season.round < SeasonCal.rounds();
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
  if (isWetRoad()) {   // rain = storm, wet = drizzle tier (see applyRaceSettings)
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

// Live time-of-day + weather for player UI (lighting tuner) and __apex. The
// agent surface is absent on GitHub Pages, so anything player-facing must go
// through G — not window.__apex.
function setTimeOfDay(tod) {
  if (tod === undefined) return raceTimeOfDay;
  const valid = ["default", "dawn", "day", "dusk", "night"];
  raceTimeOfDay = valid.indexOf(tod) >= 0 ? tod : "default";
  loadTrack(trackIdx);
  applyRaceSettings();
  return raceTimeOfDay;
}
function weather(w) {
  if (w === undefined) return raceWeather;
  return setWeatherLive(w);
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

const _engArg = { slip: 1, ax: 0, onKerb: false, wet: false,
                  deploy: 0, energy: 1, ersDeploy: 0.5 };  // setEngine reads synchronously
function update(dt) {
  // Camera cycling works during the countdown and the race (set your view before
  // lights-out). Edge-triggered via the C key or the CAM button.
  if ((state === "race" || state === "count") && Input.consumeCameraCycle()) cycleCam();
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
      if (announceT <= 0) announce("WAITING FOR PLAYERS…", 1);
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
      for (let i = lightsLit; i < lit; i++) els.lights.children[i].classList.add("on");
      lightsLit = lit;
      if (soundOn) GameAudio.lightOn(lit - 1);
      if (lit === 1) Input.calibrate();
      // all five lit — hold for a randomised beat, as in real F1, so the
      // start can't be timed and lights-out is a genuine reaction moment.
      if (lit === COUNTDOWN_S && !netStart) startHold = 0.2 + simRnd() * 1.8;
    }
    if (lightsLit === COUNTDOWN_S && countT > COUNTDOWN_S + startHold) {
      state = "race"; raceT = 0;
      els.lights.hidden = true;
      for (const l of els.lights.children) l.classList.remove("on");
      netStart = null;              // consumed; never carry it into the next race
      announce("LIGHTS OUT!", 1.4);
      if (soundOn) GameAudio.lightsOut();
      cars.forEach((c) => { c.lapStart = 0; });
      // ONE STANDING LAP, from the line. It used to launch at racing speed
      // because the simulated field is modelled on a flying lap, and timing a
      // standing lap against a flying one loses you the launch by construction.
      // That is fixed on the other side now — quali.js charges every modelled
      // lap the same standing start — so both begin from rest and stay on one
      // scale, and the session reads like the thing it is named after.
      if (isQuali()) launchFlyingLap();
    }
    return;
  }
  if (state !== "race") return;
  raceT += dt;
  tickWeatherArc(dt);   // dynamic weather progression (no-op unless an arc is armed)
  checkRetirements();
  // ranks by progress (reuse module-scope buffer, no per-step allocation).
  // RETIREMENTS ARE NOT IN THE FIELD. Dropping them here is one exclusion that
  // does four jobs: the HUD position stops counting a parked car, the AI stops
  // treating it as a blocker, resolveCollisions leaves it where it was put, and
  // the overtake target walks past it — all of which would otherwise need their
  // own `c.retired` check and one of them would eventually be forgotten.
  ranked.length = 0;
  for (const c of cars) if (!c.retired) ranked.push(c);
  ranked.sort((a, b) => b.prog - a.prog);
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i + 1;
  }

  // Leading human, for the AI rubber-band. Once per step, not once per AI car.
  _leadHuman = null;
  // !finished: a flagged human coasts on advancing prog — don't rubber-band toward it.
  for (const c of cars) if (c.human && !c.retired && !c.finished && (!_leadHuman || c.prog > _leadHuman.prog)) _leadHuman = c;

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

  // Race-control owns the finish policy as well as neutralisation rules. In a
  // human race an AI/other player crossing first must NOT start a 3.5 s result
  // countdown while somebody is still driving. The hard time cap remains the
  // bounded escape hatch for an unfinished or stale participant.
  if (resultT === 0) {
    resultT = RaceControl.finishDelay(cars, raceT, lapsTarget);
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

  if (soundOn) {
    const revFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
    _engArg.slip = player.slipFactor ?? 1; _engArg.ax = player.axEstSm ?? 0;
    _engArg.onKerb = !!player.onKerb; _engArg.wet = isWetRoad();
    // ERS state for the deploy whine: continuous, charge-scaled, part-flavoured.
    _engArg.deploy = player.deploying ? 1 : 0; _engArg.energy = player.energy ?? 1;
    _engArg.ersDeploy = player.ersDeploy ?? 0.5;
    GameAudio.setEngine(revFrac, player.deploying ? 1 : 0, player.offroad,
      clamp(player.speed / vTop(), 0, 1), player.gear, _engArg);
    // Squeal from the CAR's slip, via the same skidIntensity the marks and smoke
    // use. This was a SECOND, independent copy of the old curvature formula
    // (|k| * speed), so the tyres you HEAR still screamed at the road's arc —
    // every corner squealed whether or not the car was actually sliding, and a
    // genuine slide down a straight was silent. Fixing the visual copy alone left
    // the most audible arc-coupling in the game untouched.
    GameAudio.setSkid(player.skidIntensity || 0, isWetRoad());
  }
}

// Shift a car along the track. Both s and prog advance together so multi-pass
// pairContact (which keys on prog) sees the push immediately — skipping human
// prog left penLong stale across relaxation passes. _prevS advances by the same
// d so the next updateCar's human ds = s − _prevS does not double-count the push
// into prog (AI prog is speed*dt anyway; keeping _prevS locked is harmless).
function shiftLong(c, d) {
  c.s = wrapS(c.s + d);
  c.prog += d;
  if (c._prevS != null) c._prevS = wrapS(c._prevS + d);
  _colShifted = true;
}

// Collision masses AND separation shares for one pair.
//
// The two are NOT the same, and that is the whole point. `iA`/`iB` are the
// momentum masses: a human car is "heavier" (0.5) so the AI cannot shove it
// around, and between two humans they are equal so neither out-muscles the
// other. The SPEED exchange uses those, because both cars are real and both
// genuinely slow down.
//
// `sA`/`sB` are how much of the POSITIONAL correction each car absorbs, and a
// car posed from the network takes none of it. Its owner integrates it on
// their machine and we re-pose it from their next packet, so any push we apply
// is discarded a frame later — splitting 50/50 with a car whose half is thrown
// away leaves the pair still overlapping, frame after frame. The car we own
// absorbs all of it. That is the ownership rule made concrete: contact moves
// YOUR car, based on where you see the other one.
//
// Returns a shared scratch object; every call site destructures it immediately,
// so nothing aliases across a pair and the relaxation loop stays allocation-free.
const _sep = { iA: 1, iB: 1, iSum: 2, sA: 0.5, sB: 0.5 };
const _ct = { dProg: 0, dX: 0, penLong: 0, penLat: 0, iA: 1, iB: 1, iSum: 2, sA: 0.5, sB: 0.5, aSp: 0, bSp: 0, sideContact: false };  // shared like _sep: both pairContact call sites destructure at once, keeping the relaxation loop allocation-free as its own comment promises
// Reused AiDrive ctxs — updateCar used to pass a fresh object literal to
// wantBoost / otShouldFire / brakeDecision / wantX / adaptLane / otPull /
// defendPull / isBoxed every physics step (~8 × 20 cars × 60 Hz). Same
// read-before-next-call contract as _ct / AiDrive.traits.
const _aiBoost = { traits: null, energy: 0, otActive: false, kAhead60: 0, towCar: false, towGap: 0, towSpeed: 0, speed: 0, chaser: false, chaserGap: 0, chaserSpeed: 0, team: null, seat: 0, stats: null, ersDeploy: 0, ersRegen: 0 };
const _aiOtFire = { traits: null, blockerGap: 0, gapAhead: 0, roomL: 0, roomR: 0, speed: 0, aheadSpeed: 0, kAhead: 0, street: false, team: null, seat: 0, stats: null, other: null };
const _aiBr = { traits: null, samples: null, latMax: 0, aeroLoad: 0, brake: 0, grip: 0, speed: 0, blocker: false, blockerGap: 0, blockerSpeed: 0, roomL: 0, roomR: 0, team: null, seat: 0, stats: null };
const _aiLane = { traits: null, nearby: 0, roomL: 0, roomR: 0, street: false, baseLane: 0 };
const _aiWantX = { armed: true, team: null, seat: 0, stats: null, energy: 0, catching: false, otActive: false };
const _aiOtPull = { street: false, traits: null, speed: 0, team: null, seat: 0, stats: null, blockerSpeed: 0, blockerGap: 0, roomL: 0, roomR: 0, other: null };
const _aiDefend = { street: false, traits: null, speed: 0, team: null, seat: 0, stats: null, chaser: false, chaserGap: 0, chaserSpeed: 0, kA: 0, roomL: 0, roomR: 0, other: null, blocker: null };
const _aiBoxed = { contactT: 0, roomL: 0, roomR: 0, blocker: null, blockerGap: 0, street: false };
const LCAR = 4.8, WCAR = 2.0;
// Arc-bucket broadphase for resolveCollisions. Bucket width = LCAR so any
// contacting pair shares a bucket or sits in adjacent ones (wrap-aware).
const COL_BUCKET_M = LCAR;
const _colBuckets = [];   // sparse: bucketId → car[]
const _colBucketIds = []; // compact list of occupied bucket ids this pass
let _colShifted = false;  // shiftLong this step — skip idle re-buckets

function _colClearBuckets() {
  for (let i = 0; i < _colBucketIds.length; i++) {
    const id = _colBucketIds[i];
    const arr = _colBuckets[id];
    if (arr) arr.length = 0;
  }
  _colBucketIds.length = 0;
}

function _colFillBuckets(ranked) {
  _colClearBuckets();
  const L = track.total || 1;
  // floor, not ceil: ceil made the LAST bucket a sliver (L mod width < LCAR),
  // so a touching pair straddling the seam could sit two buckets apart and the
  // (id+1)%nB neighbour walk never met them — no contact resolution right at
  // the line. floor folds the tail into bucket 0 (the trailing %nB below),
  // keeping every bucket >= a car length and the seam pair adjacent.
  const nB = Math.max(1, Math.floor(L / COL_BUCKET_M) | 0);
  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    const prog = c._nOk ? c._nProg : c.prog;
    let b = Math.floor((((prog % L) + L) % L) / COL_BUCKET_M) % nB;
    if (b < 0) b += nB;
    let arr = _colBuckets[b];
    if (!arr) { arr = _colBuckets[b] = []; }
    if (arr.length === 0) _colBucketIds.push(b);
    arr.push(c);
  }
  return nB;
}
// Soft-saturating lateral tyre force (accel units) — hoisted out of updateCar so
// the human path does not allocate a closure every physics step (~60/s).
const _tyreSat = (cs, a, mu) => -mu * Math.tanh(cs * a / mu);
const _floodRGB = [0, 0, 0];   // reused floodScale vector (was a fresh [r,g,b] each frame)
function sepShares(a, b) {
  const hum = AiDrive.humanInvMass(!!track.street);
  const iA = a.human ? hum : 1, iB = b.human ? hum : 1;
  const netA = netPlay.owns(a), netB = netPlay.owns(b);
  _sep.iA = iA; _sep.iB = iB; _sep.iSum = iA + iB;
  _sep.sA = netA ? 0 : (netB ? 1 : iA / _sep.iSum);
  _sep.sB = netB ? 0 : (netA ? 1 : iB / _sep.iSum);
  return _sep;
}

// Bucket-pair callbacks + per-pass inputs in module state — no closure per pass.
let _colCbLast = false, _colCbRub = 1;
const COL_SLOP = 0.05;   // separation slop — small, avoids a hard per-frame snap
function _colResolveCB(a, b) { _colResolvePair(a, b, _colCbLast, _colCbRub); }
function _colSepCB(a, b) { _colSepPair(a, b, COL_SLOP); }

// Wrap-aware (prog, x) overlap + rear-vs-side decision. Hoisted out of
// resolveCollisions so each phys step does not allocate a nested function.
// Exact cheap-reject before wrap: |dProg| in (LCAR, L-LCAR) cannot contact.
function pairContact(a, b) {
  // Net remotes draw from delayed sample() but contact must use predict()
  // (netplay tick writes _nOk/_nProg/_nX/_nSpd). Local cars keep prog/x/speed.
  const aProg = a._nOk ? a._nProg : a.prog;
  const bProg = b._nOk ? b._nProg : b.prog;
  const aX = a._nOk ? a._nX : a.x;
  const bX = b._nOk ? b._nX : b.x;
  const aSp = a._nOk ? a._nSpd : a.speed;
  const bSp = b._nOk ? b._nSpd : b.speed;
  let dProg = aProg - bProg;
  if (!Number.isFinite(dProg)) return null;
  const L = track.total;
  const adProg = dProg < 0 ? -dProg : dProg;
  if (adProg > LCAR && adProg < L - LCAR) return null;
  dProg = ((dProg + L / 2) % L + L) % L - L / 2;
  if (Math.abs(dProg) > LCAR) return null;
  const dX = aX - bX;
  if (!Number.isFinite(dX)) return null;
  const penLong = LCAR - Math.abs(dProg);
  const penLat = WCAR - Math.abs(dX);
  if (penLong <= 0 || penLat <= 0) return null;
  const { iA, iB, iSum, sA, sB } = sepShares(a, b);
  const closing = (dProg >= 0 ? bSp - aSp : aSp - bSp) > 0.5;
  const nestEdge = closing && penLong > 1.0 && penLat < 0.5;
  const forceRear = nestEdge && ((dProg >= 0 && b.human) || (dProg < 0 && a.human));
  _ct.dProg = dProg; _ct.dX = dX; _ct.penLong = penLong; _ct.penLat = penLat;
  _ct.iA = iA; _ct.iB = iB; _ct.iSum = iSum; _ct.sA = sA; _ct.sB = sB;
  _ct.aSp = aSp; _ct.bSp = bSp;
  _ct.sideContact = penLat < penLong && !forceRear;
  return _ct;
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
  if (navigator.vibrate) { try { navigator.vibrate(Math.round(18 + impact * 50)); } catch (e) { void e; } }
  Input.rumble(0.4 + impact * 0.6, 120);
}

// Frenet-frame collisions: (prog, x) is treated as a 2D plane. Each car is a
// capsule ~4.8 m long and ~2.0 m wide (combined extents). We pick the axis of
// least penetration as the contact normal — lateral penetration => a side rub
// (separate on x, scrub speed); longitudinal => a rear-end (separate along the
// track, transfer speed rear->front). Mass-weighted, several relaxation passes
// to settle clusters, then a hard min-separation pass so cars can never render
// merged. The player is "heavier" (AiDrive.humanInvMass) so the AI can't shove them off.
function _colResolvePair(a, b, last, rubScrub) {
  if (incidentSim.owns(a) || incidentSim.owns(b)) return;
  const ct = pairContact(a, b);
  if (!ct) return;
  const { dProg, dX, penLong, penLat, iA, iB, iSum, sA, sB, sideContact, aSp, bSp } = ct;
  if (sideContact) {
    // side-by-side contact: separate laterally, scrub a little speed. Mark
    // both cars "in contact" so the AI eases off steering this way and
    // stops fighting the push (the cause of the side-by-side vibration).
    const sgn = dX >= 0 ? 1 : -1;
    const corr = Math.max(penLat - 0.05, 0) * 0.35;   // gentler push -> rub, not bounce
    a.x += sgn * corr * sA;
    b.x -= sgn * corr * sB;
    // Skip scrub when corr≈0 (nest-edge / at-slop) — perpetual zero-corr
    // side contact was draining speed without separating the cars.
    if (corr > 0) { a.speed *= rubScrub; b.speed *= rubScrub; }
    a.contactT = b.contactT = 0.22;   // "rubbing" — AI eases off steering
    if (last) collideFx(a, b, Math.abs(aSp - bSp) * 0.02 + 0.18);
  } else {
    // rear-end: separate along the track and nudge speeds together (gentle,
    // so hitting a car ahead doesn't slam you to a stop — you bump and tuck in)
    const sgn = dProg >= 0 ? 1 : -1;
    const corr = Math.max(penLong - 0.05, 0) * 0.4;
    shiftLong(a, sgn * corr * sA);
    shiftLong(b, -sgn * corr * sB);
    const relV = sgn >= 0 ? bSp - aSp : aSp - bSp;   // >0 means the rear car is closing
    if (relV > 0) {
      // Soft momentum exchange (was 1.15). Skip only cars Rapier already
      // owns — a relV≥15 skip used to drop jImp even when promoteCarDynamic
      // failed later, leaving the pair with no resolver. owns() cars are
      // also skipped in _colSepPair; this is the same rule at the impulse.
      // notifyCar still queues a shunt; below threshold it no-ops (C3).
      if (!(incidentSim.owns(a) || incidentSim.owns(b))) {
        const jImp = 0.5 * relV / iSum;
        if (sgn >= 0) {
          b.speed = Math.max(0, b.speed - iB * jImp);
          a.speed += iA * jImp * 0.8;
        } else {
          a.speed = Math.max(0, a.speed - iA * jImp);
          b.speed += iB * jImp * 0.8;
        }
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

function _colSepPair(a, b, SLOP) {
  if (incidentSim.owns(a) || incidentSim.owns(b)) return;
  const ct = pairContact(a, b);
  if (!ct) return;
  const { dProg, dX, penLong, penLat, sA, sB, sideContact } = ct;
  if (sideContact) {
    const c = Math.max(penLat - SLOP, 0) * 0.6;
    if (c <= 0) return;
    const sgn = dX >= 0 ? 1 : -1;
    a.x += sgn * c * sA;
    b.x -= sgn * c * sB;
  } else {
    const c = Math.max(penLong - SLOP, 0) * 0.6;
    if (c <= 0) return;
    const sgn = dProg >= 0 ? 1 : -1;
    shiftLong(a, sgn * c * sA);
    shiftLong(b, -sgn * c * sB);
  }
}

// Walk each occupied bucket against itself and the next bucket (mod nB).
// Bucket width = LCAR → any contacting pair is co-bucketed or adjacent.
// Each unordered pair is visited once (within-bucket i<j; across only b→b+1).
function _colForBucketPairs(nB, fn) {
  for (let bi = 0; bi < _colBucketIds.length; bi++) {
    const id = _colBucketIds[bi];
    const A = _colBuckets[id];
    if (!A || !A.length) continue;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      for (let j = i + 1; j < A.length; j++) fn(a, A[j]);
    }
    // Forward neighbour only — each undirected cross edge is visited once,
    // including the wrap edge (nB-1 → 0).
    if (nB < 2) continue;
    const id2 = (id + 1) % nB;
    const B = _colBuckets[id2];
    if (!B || !B.length) continue;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      for (let j = 0; j < B.length; j++) fn(a, B[j]);
    }
  }
}

function resolveCollisions(ranked, dt) {
  const PASSES = 4;
  // Snapshot the player's road coords so the writeback at the end can tell
  // whether this pass actually shoved it (see there for why that matters).
  const _preColS = player ? player.s : 0, _preColX = player ? player.x : 0;
  // Side-rub speed scrub as a RATE: 0.995/frame was authored at the fixed
  // 1/60 step (identical there: 0.995^1), but the headless harness steps at
  // arbitrary dt — unscaled, a rub scrubbed per CALL, not per second.
  const rubScrub = Math.pow(0.995, (dt || 1 / 60) * 60);
  // Tiny fields: all-pairs is fine and avoids bucket rebuild cost. Larger
  // fields (MP / expanded AI) use arc buckets so pairContact stays O(n·k).
  const useBuckets = ranked.length > 12;
  let nB = 0;
  if (useBuckets) { nB = _colFillBuckets(ranked); _colShifted = false; }
  else if (Log.enabled("game", Log.DEBUG)) {
    Log.debug("game", "resolveCollisions all-pairs n=" + ranked.length);
  }
  for (let pass = 0; pass < PASSES; pass++) {
    const last = pass === PASSES - 1;
    if (useBuckets) {
      // Re-bucket only when shiftLong moved someone — idle passes keep the grid.
      if (pass > 0 && _colShifted) { nB = _colFillBuckets(ranked); _colShifted = false; }
      _colCbLast = last; _colCbRub = rubScrub;
      _colForBucketPairs(nB, _colResolveCB);
    } else {
      const fwd = (pass & 1) === 0;
      for (let ii = 0; ii < ranked.length; ii++) {
        const i = fwd ? ii : ranked.length - 1 - ii;
        const a = ranked[i];
        if (incidentSim.owns(a)) continue;
        for (let j = i + 1; j < ranked.length; j++) {
          _colResolvePair(a, ranked[j], last, rubScrub);
        }
      }
    }
  }
  // separation pass: enforce the car boundary firmly so they don't visibly
  // overlap. A small slop is kept to avoid a hard per-frame snap (the proactive
  // steering separation now keeps cars spaced, so collisions rarely fire and a
  // tighter boundary no longer causes the old vibration).
  if (useBuckets) {
    if (_colShifted) nB = _colFillBuckets(ranked);
    _colForBucketPairs(nB, _colSepCB);
  } else {
    for (let i = 0; i < ranked.length; i++) {
      const a = ranked[i];
      if (incidentSim.owns(a)) continue;   // Rapier owns this car's separation
      for (let j = i + 1; j < ranked.length; j++) {
        _colSepPair(a, ranked[j], COL_SLOP);
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
  // A retirement is out of the race: no driving model, no coast, no lap timing.
  // It stays exactly where retireCar() parked it until the flag.
  if (c.retired) { c._prevS = c.s; return; }
  if (c.finished) { coast(c, dt); c._prevS = c.s; return; }
  // Incident-sim takeover (R2/R3/C1): while Rapier owns this car's 6-DoF body,
  // the bespoke integration + wall clamp + collision writeback are SKIPPED —
  // postStep drives px/pz/head/(s,x) from the dynamic body instead. Bounded and
  // fallback-guarded; outside the window this early-out is never taken.
  if (incidentSim.owns(c)) { c._prevS = c.s; return; }
  // Same contract for a networked rival: its owner is integrating it on their
  // machine and we replicate the result, so running the driving model here
  // would only fight the pose NetPlay writes. See js/net/netplay.js.
  if (netPlay.owns(c)) { c._prevS = c.s; return; }
  Tracks.sample(track, c.s, smp);
  const hw = smp.hw;
  const slopeSin = smp.t[1] || 0;   // road pitch at the car (+uphill / -downhill)
  const k = Tracks.curvature(track, c.s);
  c.kCur = k;   // cache for the render loop's body-lean (avoids a 2nd curvature calc/car/frame)
  const dd = DIFF[difficulty];
  // This car's own performance multipliers. Every site below that used to read
  // the module-level `playerMods` reads this instead — see modsFor. AI cars
  // never reach the branches that use it; the neutral fallback only guards a
  // human car whose setup failed to resolve.
  const mods = c.mods || NEUTRAL_MODS;
  // This car's control source (human cars only — see inputOf).
  const inp = inputOf(c);

  // --- speed targets ---
  let vmax = VMAX * PACE * (c.human ? mods.speed : c.tierV * c.skill * dd.ai);
  // asymmetric rubber band — boost only when player is ahead; no artificial slow-down when behind
  // Rubber-band against the LEADING human, not "the" player: with a second
  // driver on track, banding off whoever happens to be the local car would let
  // the slower human drag the whole field back. One human => identical.
  if (!c.human && _leadHuman) {
    const gap = _leadHuman.prog - c.prog;
    const bandFactor = gap > 0 ? Math.min(gap / 700, 1) * dd.band : 0;
    vmax *= 1 + bandFactor;
  }
  // Caution: under VSC / safety car the whole field runs to a delta pace, not
  // racing speed — humans used to keep race pace while the AI was capped.
  // Cautions default ON (RaceControl store default true); a race with them
  // disabled never hits lvl≥2. Fraction of pace-scaled top speed, so it rides
  // OVERALL SPEED like the rest.
  if (raceCtl) {
    const lvl = raceCtl.level;   // cheap getter, no per-frame allocation
    if (lvl >= 2) vmax = Math.min(vmax, vTop() * (lvl === 3 ? 0.45 : 0.6));
  }

  // --- AI traffic awareness: clearance on each side, the nearest blocker ahead
  // in our lane, and a "stuck" timer. Shared by the braking and steering logic
  // so the AI can pick the open side, commit to a pass, and dig itself out when
  // wedged — instead of grinding to a halt against a car or wall. Rating axes
  // (js/game/ai-drive.js) scale how quickly they dig out and how much space they
  // leave when following.
  let roomL = Infinity, roomR = Infinity, blocker = null, blockerGap = Infinity, unstuckActive = false;
  let towCar = null, towGap = Infinity;   // nearest car ahead in the slipstream (wider than the blocker box)
  let chaser = null, chaserGap = Infinity; // nearest car close BEHIND in our lane (for defending)
  let nearbyN = 0, sep = 0;                // sep-window density + lateral-separation pull (traffic scan)
  const aiT = c.human ? null : AiDrive.traits(c);
  if (!c.human) {
    // AI keeps a tuned racing margin to the edge (not the hard barrier, so it
    // flows through barrier-lined corners instead of treating them as boxed-in).
    const edge = track.street ? hw - 0.8 : hw + 5;
    roomL = edge + c.x;            // clearance to the left edge from our position
    roomR = edge - c.x;            // clearance to the right edge
    // FULL FIELD, and it has to be: `ranked` sorts by CUMULATIVE prog while the
    // window below is on the WRAPPED delta — a lapped car is a whole lap away in
    // rank yet right beside us on the road, so any rank-neighbour walk breaks
    // long before reaching it (the same miss resolveCollisions calls out).
    // The O(n) pass is the price of seeing lapped traffic.
    const L = track.total;
    // sep (consumer below) is fused into this scan — its window is a subset of [-13,+34].
    const MIN_GAP = AiDrive.minLatGap(hw, !!track.street);
    for (let i = 0; i < ranked.length; i++) {
      const o = ranked[i];
      if (o === c || o.finished) continue;
      let dprog = o.prog - c.prog;
      if (!Number.isFinite(dprog)) continue;
      // Cheap reject before wrap — same pattern as pairContact (PERF-FINDINGS Δprog 5.01%).
      const ad = dprog < 0 ? -dprog : dprog;
      if (ad > 34.1 && ad < L - 34.1) continue;
      dprog = ((dprog + L / 2) % L + L) % L - L / 2;
      if (dprog < -13 || dprog > 34) continue;   // extended both ways: slipstream ahead, chaser behind
      const dx = o.x - c.x;
      const adp = dprog < 0 ? -dprog : dprog;
      if (adp < 5.5) {            // alongside: eats the room on its side
        if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
        else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
      }
      if (adp < 6.5) {
        nearbyN++;
        const deficit = MIN_GAP - (dx < 0 ? -dx : dx);
        if (deficit > 0) sep += (dx <= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);   // push AWAY from o
      }
      if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < 2.2) { blocker = o; blockerGap = dprog; }
      if (dprog > 0.5 && dprog < towGap && Math.abs(dx) < 4) { towCar = o; towGap = dprog; }   // wake giver
      if (dprog < -0.5 && -dprog < chaserGap && Math.abs(dx) < 3) { chaser = o; chaserGap = -dprog; }  // attacker behind
    }
    roomL = Math.max(0, roomL); roomR = Math.max(0, roomR);
    _aiBoxed.contactT = c.contactT; _aiBoxed.roomL = roomL; _aiBoxed.roomR = roomR;
    _aiBoxed.blocker = blocker; _aiBoxed.blockerGap = blockerGap; _aiBoxed.street = !!track.street;
    const boxed = AiDrive.isBoxed(_aiBoxed);
    if (state === "race" && c.speed < 7 && boxed) c.stuckT = (c.stuckT || 0) + dt;
    else c.stuckT = Math.max(0, (c.stuckT || 0) - dt * 1.5);
    unstuckActive = c.stuckT > AiDrive.stuckThreshold(aiT);
  }

  // --- electric deploy ---
  let deploy = 0;
  c.otCool = Math.max(0, c.otCool - dt);
  if (c.otT > 0) c.otT -= dt;
  if (c.isPlayer && Input.consumeBoostToggle()) c.boostOn = !c.boostOn;   // BOOST is a toggle
  // Short-circuit empty battery before the LUT sample AiDrive would ignore anyway.
  let aiWantsBoost = false;
  if (!c.human && c.energy > 0.02) {
    _aiBoost.traits = aiT; _aiBoost.energy = c.energy; _aiBoost.otActive = c.otT > 0;
    _aiBoost.kAhead60 = Tracks.curvature(track, wrapS(c.s + 60));
    _aiBoost.towCar = !!towCar; _aiBoost.towGap = towGap; _aiBoost.towSpeed = towCar ? towCar.speed : 0; _aiBoost.speed = c.speed;
    _aiBoost.chaser = !!chaser; _aiBoost.chaserGap = chaserGap; _aiBoost.chaserSpeed = chaser ? chaser.speed : 0;
    _aiBoost.team = c.team; _aiBoost.seat = c.seat; _aiBoost.stats = c.houseStats;
    _aiBoost.ersDeploy = c.ersDeploy; _aiBoost.ersRegen = c.ersRegen;
    aiWantsBoost = AiDrive.wantBoost(_aiBoost);
  }
  const wantBoost = (c.human ? c.boostOn : aiWantsBoost)
    || c.otT > 0;   // OVERTAKE deploys on its own — even with BOOST toggled off
  // OVERTAKE IS FREE. Its push does not come out of the battery, so an OT burst
  // costs nothing, fires on a flat ERS, and never competes with BOOST for charge.
  // It is already rationed by its own OT_GAP / cooldown window, which is what
  // makes it a tactical move rather than a second BOOST — the energy bar was a
  // second, redundant limiter, and at a ~0.2/s drain over a ~4 s push a single
  // press emptied 80% of the battery, so using the overtake button left you
  // slower for the rest of the lap than if you had never pressed it.
  const otFree = c.otT > 0;
  if (otFree || (wantBoost && c.energy > 0)) {
    deploy = DEPLOY_A * deployTaper(c);
    // BOOST alone still pays: deploy always produces thrust while held (see
    // deployTaper), so it always costs energy. The battery and the push are the
    // same switch — a BOOST that drains nothing is a BOOST that does nothing.
    if (!otFree) {
      c.energy = Math.max(0, c.energy - drainFor(c) * dt);
      if (c.energy <= 0) c.boostOn = false;   // auto-release the toggle when drained
    }
    c.deploying = deploy > 0.4;
  } else c.deploying = false;

  // --- overtake mode ---
  const ahead = (c.rank || 1) > 1 ? ranked[(c.rank || 1) - 2] : null;
  const gapAhead = ahead && c.speed > 1 ? (ahead.prog - c.prog) / c.speed : Infinity;
  // vStd, not a bare c.speed: this is a THRESHOLD, and a threshold compared
  // against real m/s means something different at every OVERALL SPEED setting.
  // The active-aero floor thirty lines below already gets this right
  // (vStd(c.speed) > X_MIN_SPEED) — so the two straight-line aids in this same
  // function disagreed about what a speed is. Measured as a fraction of the
  // car's own envelope, X-mode armed at a constant 35 % at every pace while
  // overtake armed at 42 % of top speed at pace 0.5 and 16 % at pace 1.3.
  // The error ran the wrong way for the player it reached: the slower you set
  // the game, the more of the lap you could not use overtake at all — and a
  // slower setting is what you reach for when the car is already getting away
  // from you. Same class as the beached-rescue gate (A5 in the review).
  c.otArmed = otEnabled() && gapAhead < OT_GAP && c.otCool <= 0 && c.otT <= 0
              && !c.finished && vStd(c.speed) > OT_MIN_SPEED;
  const fire = c.human ? (c.local ? Input.consumeOvertake() : !!inp.overtake)
                      : (c.otArmed && (_aiOtFire.traits = aiT,
                          _aiOtFire.blockerGap = blocker ? blockerGap : gapAhead * (c.speed || 1),
                          _aiOtFire.gapAhead = gapAhead * (c.speed || 1),
                          _aiOtFire.roomL = roomL, _aiOtFire.roomR = roomR, _aiOtFire.speed = c.speed,
                          _aiOtFire.aheadSpeed = blocker ? blocker.speed : (ahead ? ahead.speed : c.speed),
                          _aiOtFire.kAhead = Tracks.curvature(track, wrapS(c.s + 40)),
                          _aiOtFire.street = !!track.street, _aiOtFire.team = c.team, _aiOtFire.seat = c.seat,
                          _aiOtFire.stats = c.houseStats, _aiOtFire.other = blocker,
                          AiDrive.otShouldFire(simRnd(), dt, _aiOtFire)));
  if (fire && c.otArmed) {
    c.otT = otTimeFor(c); c.otCool = otCoolFor(c) + c.otT;
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
  // THROTTLE travel, the other half of the same idea — and until now nothing in
  // the game read it. Input.throttleLevel() has always existed and always been
  // dead: the pad's analog right trigger was thresholded to a boolean and the
  // travel thrown away, so a controller could only floor it or lift, and the
  // on-screen pedal had nothing to report at all. Scaling engine accel by it is
  // what makes a part-open throttle mean something — a measured exit instead of
  // full power the instant you touch it.
  //
  // DEPLOY IS DELIBERATELY OUTSIDE THIS. ERS is its own button; metering the
  // throttle should not quietly meter the battery too.
  let throttleLvl = 1;
  if (c.human) {
    braking = inp ? !!inp.brake : Input.braking();
    brakeLvl = inp ? 1 : Math.max(0.15, Input.brakeLevel());
    // A replicated or scripted input is a boolean by construction, so it means
    // FULL travel unless it says otherwise — which keeps every __apex.setInput
    // caller (and every physics spec built on one) exactly as it was.
    throttleLvl = inp ? (inp.throttleLevel ?? 1) : (autoThrottle() ? 1 : Math.max(0, Input.throttleLevel()));
  } else {
    // AI: multi-sample brake target (compound corners) + soft pedal + craft
    // late-brake when a pass is on — see js/game/ai-drive.js.
    const look = clamp(c.speed * 1.7, 30, 160);
    AiDrive.beginLook();
    let kMax = 0;
    for (let d = 12; d < look; d += 14) {
      const ss = wrapS(c.s + d);
      const kk = Tracks.curvature(track, ss);
      const ak = Math.abs(kk);
      if (ak > kMax) kMax = ak;
      AiDrive.pushLook(d, kk, Tracks.bankAngle(track, ss));
    }
    _aiBr.traits = aiT; _aiBr.samples = AiDrive.endLook(); _aiBr.latMax = LAT_MAX;
    _aiBr.aeroLoad = c.aeroLoad; _aiBr.brake = BRAKE; _aiBr.grip = gripMult();
    _aiBr.speed = c.speed; _aiBr.blocker = !!blocker; _aiBr.blockerGap = blockerGap;
    _aiBr.blockerSpeed = blocker ? blocker.speed : 0;
    _aiBr.roomL = roomL; _aiBr.roomR = roomR; _aiBr.team = c.team; _aiBr.seat = c.seat; _aiBr.stats = c.houseStats;
    const br = AiDrive.brakeDecision(_aiBr);
    braking = br.braking;
    brakeLvl = br.brakeLvl;
    // Slipstream: in the wake ahead on a straight, shed drag and gain top speed —
    // what lets a following car CLOSE and pull out to pass instead of queueing.
    // Applied BEFORE the queue cap, so it never rams the car directly ahead (the
    // cap bounds it) but surges the instant we draw out of that car's box. Fades
    // with gap + lateral offset; straight only (the wake is behind the car).
    if (towCar && !braking && kMax < 0.006) {
      const tow = clamp((34 - towGap) / 28, 0, 1) * clamp(1 - Math.abs(towCar.x - c.x) / 4, 0, 1);
      vmax *= 1 + AiDrive.towGain(!!track.street) * tow;
    }
    // queue behind the car blocking our lane (prog-based, immune to rank swaps):
    // cap our pace to it, braking if closing fast, so we tuck behind not ram.
    // Streets tuck at followBase 8 m (was 12). Awareness pads (AiDrive.followPad).
    if (blocker && blockerGap < 16) {
      const follow = AiDrive.followBase(!!track.street) + AiDrive.followPad(aiT, !!track.street, c.team, c.seat, blocker, c.houseStats);
      vmax = Math.min(vmax, blocker.speed + clamp(blockerGap - follow, -6, 8));
      const qb = AiDrive.queueBrake(c.speed, blocker.speed, !!track.street);
      if (qb) { braking = true; brakeLvl = qb; }
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
  c.xArmed = !c.offroad && !braking && vStd(c.speed) > X_MIN_SPEED
    && !c.finished && state === "race" && xStraightAhead(c);
  if (c.human && raceAeroMode === "auto") {
    // Same rule the AI runs: take every zone the circuit offers.
    c.xOn = c.xArmed;
  } else if (c.human) {
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

  // --- gearbox (player) ---
  let gearMult = 1, speedCap = vmax + 14 * Math.max(PACE, 0.05);   // ERS overspeed margin — a speed, so it rides the pace scale
  if (c.human) {
    c.shiftT = Math.max(0, c.shiftT - dt);
    const up = c.local ? Input.consumeShiftUp() : !!inp.shiftUp,
          down = c.local ? Input.consumeShiftDown() : !!inp.shiftDown;
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
  const wallPinned = c.human && (c.wallT || 0) > 0;
  const onThrottle = c.human
    ? (inp ? !!inp.throttle : ((autoThrottle() && !wallPinned) || Input.throttle()))
    : true;
  if (braking) {
    if (c.speed > 0) {
      c.speed = Math.max(0, c.speed - BRAKE * (c.human ? mods.braking * brakeLvl : brakeLvl) * dt);
    } else if (c.human && state === "race") {
      // Stopped and still braking: crawl backwards so the player can ease off a
      // wall or re-aim after a spin. Capped slow; throttle drives forward again.
      c.speed = Math.max(REVERSE_MAX, c.speed - REVERSE_ACCEL * dt);
    }
    c.energy = Math.min(1, c.energy + regenFor(c) * 1.6 * dt);
  } else if (!onThrottle) {
    // coasting: gentle engine-braking/drag both ways (don't snap reverse to 0).
    // X-mode sheds part of that drag — a lift-and-coast in the low-drag wing
    // carries further, which is the whole point of opening it.
    const cd = COAST_DRAG * (1 - xCoastCut(c) * (c.aeroX || 0));
    if (c.speed > 0) c.speed = Math.max(0, c.speed - cd * dt);
    else if (c.speed < 0) c.speed = Math.min(0, c.speed + cd * dt);
    c.energy = Math.min(1, c.energy + regenFor(c) * dt);
  } else {
    const a = (ACCEL * PACE * (c.human ? mods.accel * throttleLvl : 1) * clamp(1 - c.speed / Math.max(vmax, 1), 0, 1) * gearMult + deploy) * (state === "race" ? 1 : 0);
    c.speed = Math.min(speedCap, c.speed + a * dt);
    if (c.speed < vmax * 0.5) c.energy = Math.min(1, c.energy + regenFor(c) * dt);
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
  if (c.human) {
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
      // THREE WARNINGS, ONE PENALTY, RESET — the real ladder. This used to add
      // +5s for EVERY cut from the fourth on and stop announcing the count past
      // three, so a driver who cut eight times paid 25s having been told nothing
      // since the third. `cutWarn` is the counter that resets; `cuts` stays the
      // LIFETIME total because the career `clean` objective and the archive read
      // it (js/game/career.js) and "no cuts at all" must not become satisfiable
      // by cutting four more times.
      c.cutWarn = (c.cutWarn | 0) + 1;
      if (c.cutWarn >= 4) {
        c.cutWarn = 0;
        c.penalty += 5;
        if (c.isPlayer) { announce("+5s TRACK LIMITS PENALTY", 2); if (soundOn) GameAudio.penalty(); }
      } else if (c.isPlayer) {
        announce("TRACK LIMITS " + c.cutWarn + "/4", 1.2);
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
  if (c.onKerb) {
    c.speed = Math.sign(c.speed) * Math.max(0, Math.abs(c.speed) - 6 * dt);
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
    if ((c.kerbHapT = (c.kerbHapT || 0) - dt) <= 0) { if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { void e; } } Input.rumble(0.25, 90); c.kerbHapT = 0.12; }
  }

  // --- lateral ---
  let steer;
  if (c.human) {
    steer = inp ? (inp.steer ?? 0) : Input.steer();
  }
  else {
    // Adaptive preferred lane: under traffic density, slowly bias toward the
    // freer side so midfield trains fan out instead of locking one line forever.
    _aiLane.traits = aiT; _aiLane.nearby = nearbyN; _aiLane.roomL = roomL; _aiLane.roomR = roomR;
    _aiLane.street = !!track.street; _aiLane.baseLane = c.lanePref != null ? c.lanePref : c.lane;
    c.lane = AiDrive.adaptLane(c.lane, _aiLane, dt);
    const kA = Tracks.curvature(track, wrapS(c.s + clamp(c.speed * 0.7, 18, 70)));
    // partly follow the racing line, partly hold the car's own lane, so the
    // field fans out across the track rather than collapsing onto one line.
    // Apex is on the INSIDE = -sign(k) (k>0 curves toward screen-left, so the
    // inside is -x); the racing line aims there.
    const racingLine = clamp(-kA * 130, -0.62, 0.62) * hw;
    const targetX = clamp(racingLine * AiDrive.racingLineMix(!!track.street, AiDrive.houseStyle(c.team, c.seat, c.houseStats).hold) + c.lane * (hw - 1.2), -(hw - 1.0), hw - 1.0);
    // Overtake: if a slower car is blocking our lane ahead, ease toward the side
    // with more room to pass. Collision-aware — the move is scaled down if that
    // side is also tight (a car alongside or a wall), so we don't dive into a
    // gap that isn't there. Uses the prog-based blocker, immune to rank swaps.
    let overtake = 0;
    // OT / defend pulls live in AiDrive (craft on permanents, awareness + open
    // inside-room on streets). Tow is no longer permanent-only.
    if (blocker) {
      _aiOtPull.street = !!track.street; _aiOtPull.traits = aiT; _aiOtPull.speed = c.speed;
      _aiOtPull.team = c.team; _aiOtPull.seat = c.seat; _aiOtPull.stats = c.houseStats;
      _aiOtPull.blockerSpeed = blocker.speed; _aiOtPull.blockerGap = blockerGap;
      _aiOtPull.roomL = roomL; _aiOtPull.roomR = roomR; _aiOtPull.other = blocker;
      overtake = AiDrive.otPull(_aiOtPull);
    }
    let defend = 0;
    if (chaser && !blocker) {
      _aiDefend.street = !!track.street; _aiDefend.traits = aiT; _aiDefend.speed = c.speed;
      _aiDefend.team = c.team; _aiDefend.seat = c.seat; _aiDefend.stats = c.houseStats;
      _aiDefend.chaser = true; _aiDefend.chaserGap = chaserGap; _aiDefend.chaserSpeed = chaser.speed;
      _aiDefend.kA = kA; _aiDefend.roomL = roomL; _aiDefend.roomR = roomR; _aiDefend.other = chaser;
      defend = AiDrive.defendPull(_aiDefend);
    }
    // Stuck recovery: if we've been wedged/slow, commit hard to dig out. Pick the
    // clearly-freer side, but when both sides are similar fall back to the car's
    // own lane sign so a piled-up group fans out BOTH ways instead of all diving
    // the same direction (and off the track). Experience softens the panic pull.
    const freer = roomR - roomL;
    const unstuckSide = Math.abs(freer) > 1 ? (freer > 0 ? 1 : -1) : (c.lane >= 0 ? 1 : -1);
    const unstuck = unstuckActive ? unstuckSide * AiDrive.unstuckPull(aiT, !!track.street) : 0;
    // Proactive lateral separation, accumulated in the traffic scan above: push
    // toward a minimum side-by-side gap, proportional to the deficit, fading to
    // zero once spaced — the fused loop also excludes self by IDENTITY, where
    // the old rank-index form could skip the leader on a stale c.rank.
    const sepMax = AiDrive.sepClamp(!!track.street);
    sep = clamp(sep, -sepMax, sepMax);
    // clamp the combined target to the drivable surface so overtake/unstuck/
    // separation biases can never steer the AI off the track or into a wall.
    const desiredX = clamp(targetX + overtake + defend + sep + unstuck, -(hw - 0.5), hw - 0.5);
    let err = desiredX - c.x;
    // Soft deadzone near the target: fade the correction out as the error gets
    // small so the AI stops making tiny frame-to-frame steering corrections
    // around its target — those micro-twitches are what made the nose wobble
    // side to side. Larger errors still get full response.
    if (Math.abs(err) < 0.3) err *= Math.abs(err) / 0.3;
    steer = clamp(err * 0.9, -1, 1);
    // Low-pass the AI steering command itself so it can't reverse frame to frame
    // (the residual "switchiness"). A sustained turn-in passes through; a
    // one-frame flip is filtered. Experience raises the damp rate (smoother).
    if (c.steerSm === undefined) c.steerSm = steer;
    c.steerSm = damp(c.steerSm, steer, AiDrive.steerDamp(aiT), dt);
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
    // (speedRefFromSlider in js/game/steer-tuning.js) moved with this formula —
    // see its comment.
    // HYPERBOLIC, not clamped-linear: `1 - v/ref` goes negative at any real
    // racing speed, so the old Math.max(0.4, …) floor was not a safety net, it
    // was the operating point — every notch from 1 to 9 was bit-for-bit
    // identical at 72 m/s (docs/research/PHASE-C-SLIDER-DESIGN.md §2). 1/(1+x)
    // is never negative by construction, so the floor is gone entirely rather
    // than restored: a floor is what broke this control the first time.
    const lockTaper = 1 / (1 + vStd(Math.abs(c.speed)) / STEER_SPEED_REF);
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
    const axEstTarget = braking ? -BRAKE * brakeLvl * (c.human ? (mods.braking || 1) : 1)
      : (onThrottle
          ? ACCEL * PACE * (c.human ? mods.accel * throttleLvl : 1) * clamp(1 - c.speed / Math.max(vmax, 1), 0, 1) * gearMult + deploy
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
    // ACTIVE AERO pays for its straight-line speed HERE, and only here: the
    // aero-load term is scaled by aeroDfMult (1 in Z-mode, 0.45 with the flaps
    // fully open). Carrying X-mode into a fast corner is therefore a genuine
    // loss of grip at exactly the speed where aero load is doing the most work.
    const aeroGrip = 1 + DOWNFORCE * aeroDfMult(c) * Math.min(1, (Math.abs(c.speed) / vTop())) ** 2;
    c._aeroGrip = aeroGrip;          // see c._vmaxNow — the other half of the trade
    const offDepth = clamp((Math.abs(c.x) - hw) / 1.5, 0, 1);
    const surfMu = c.onKerb ? 1 : lerp(1, OFF_GRIP, offDepth);
    // B3 (marbles-affect-grip, flag apex26.marbleGrip): an EXTERNAL grip scalar
    // for a player sitting on a settled off-line marble cluster, fed in ALONGSIDE
    // gripMult()/kerbGrip/bankMu here — the existing mu-scaling seam. It NEVER
    // touches LONG_GRIP or slipFactor (computed above, untouched) and never moves
    // the car; it is a pure function of deterministic marble positions and returns
    // 1.0 (a true no-op) off-path. Subtle by construction (≤7% via MARBLE_GRIP_MIN).
    const marbleMu = DebrisWorld.active() ? DebrisWorld.marbleGrip(c) : 1;
    const muBase = LAT_MAX * PLAYER_GRIP * aeroGrip * surfMu * kerbGrip * gripMult() * mods.cornering * bankMu * (1 + vertLoad) * slipFactor * marbleMu;
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
    // Pooled scratch, not a literal: this ran per car per physics step (20 cars
    // x 60 Hz = ~1200 short-lived objects/s) and tyreMarble discards it on the
    // speed gate, the hot gate, or the 0.25 rate limit -- so nearly all of them
    // at cruising speed. It is read-only inside tyreMarble/spawnMarble (which
    // reads m.speed and retains nothing), so pooling is provably safe. Same
    // idiom as _ringOpts/_bankScratch/_decalOpts above.
    if (DebrisWorld.active()) {
      _marbleArg.lock = axFrac;
      _marbleArg.slip = Math.max(Math.abs(slipF), Math.abs(slipR));
      _marbleArg.speed = c.speed;
      DebrisWorld.tyreMarble(c, _marbleArg);
    }
    // Soft-saturating lateral tyre force (accel units): linear slope = stiffness
    // near centre, smoothly capped at the friction limit — how real tyres behave
    // and far more controllable on a noisy tilt signal than a hard clamp.
    const Fyf = _tyreSat(CS_FRONT, slipF, muF) * sp;
    const Fyr = _tyreSat(csR, slipR, muR) * sp;
    const cosD = Math.cos(delta);
    // --- UNDERSTEER CUE. The car's defining failure mode is washing wide, and
    // until now the only feedback was visual (a nose that will not point where
    // you asked) plus tyre squeal, both of which arrive AFTER you have already
    // lost the corner. A real wheel goes LIGHT as the front lets go — the
    // self-aligning torque collapses — which is the canonical way a driver
    // feels this. On a phone or a pad there is no wheel to go light, and sim
    // racers report that force feedback fails to deliver it even on
    // direct-drive hardware, so nothing communicates it at all here.
    //
    // This is SIGNALLING, NOT SIMULATING. We are not modelling self-aligning
    // torque; we are telling the player a fact about front-tyre saturation
    // that they have no other channel for. `sat` is how far the front slip has
    // pushed past the tanh knee — 1 is the friction limit — so the cue fires
    // exactly when the tyre stops answering more steering with more grip.
    // Gated on the LOCAL human (a replicated rival's tyres are not in your
    // hands), on actually asking for steering, and rate-limited the same way
    // the kerb haptic is, so it cannot machine-gun.
    if (c.isPlayer && !c.offroad && sp > 0.5) {
      const sat = Math.abs(CS_FRONT * slipF) / Math.max(muF, 1e-3);
      const asking = Math.abs(steer) > 0.15;
      if (sat > 1.15 && asking && (c.uslipHapT = (c.uslipHapT || 0) - dt) <= 0) {
        const bite = clamp((sat - 1.15) / 0.85, 0, 1);   // 0 at onset, 1 well past
        // Safari throws from vibrate() outside a user gesture and some engines
        // throw on an out-of-range pattern. A cue the driver may not even feel
        // is not worth interrupting the physics frame for, so it is ignored on
        // purpose — the same call is retried a tenth of a second later anyway.
        if (navigator.vibrate) { try { navigator.vibrate(10 + (bite * 18) | 0); } catch (e) { /* haptics are advisory */ } }
        Input.rumble(0.18 + bite * 0.32, 70);
        c.uslipHapT = 0.16 - bite * 0.06;                // firmer slide = tighter pulse
      }
    }
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
    // world velocity = forward + lateral slip. NOTE the perp (fz, -fx) is the
    // LEFT vector (right of forward is (-fz, fx) — measured against the track's
    // own right vector), so +vLat is leftward slip. The model is self-consistent
    // with that sign; only this label was ever wrong, but cam-tune.js copied it
    // into real knob directions once — check there before reusing this basis.
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
    // Awareness scales how much they yield (AiDrive.contactGive).
    const give = AiDrive.contactGive((c.contactT || 0) > 0, aiT, !!track.street);
    // Same off-track lateral fade the player gets via surfMu — AI used to keep
    // full STEER_VMAX authority on grass, skating wide while the human path
    // was already grip-thinned. Continuous in |x| past the edge (player idiom).
    const aiOffDepth = clamp((Math.abs(c.x) - hw) / 1.5, 0, 1);
    const aiSurfMu = c.onKerb ? 1 : lerp(1, OFF_GRIP, aiOffDepth);
    c.x += steer * STEER_VMAX * latFac * gripScale * kerbGrip * gripMult() * bankMu * give * aiSurfMu * dt;
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
    if (c.human) {
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
      const dW = 3, wSd = into > 0 ? 1 : -1;   // ±wallAt(side) folded to a sign — no per-contact closure
      const wSlope = clamp((Tracks.wallAt(track, wrapS(c.s + dW), wSd)
                          - Tracks.wallAt(track, wrapS(c.s - dW), wSd)) * wSd / (2 * dW), -2, 2);
      const wtx = smp.t[0] + smp.r[0] * wSlope, wtz = smp.t[2] + smp.r[2] * wSlope;
      const tHead = Math.atan2(wtx, wtz);
      let rel = c.head - tHead;
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      // Sign per the file's own psi convention ("+ = nose turned right (+x)",
      // psi = tHead − head, so rel = −psi): nose toward the +x wall ⟺ rel < 0.
      // The old `into > 0 ? rel > 0 : rel < 0` was inverted on BOTH sides —
      // measured live (30° nose-in at 47 m/s, either wall): no first-frame
      // incidence scrub, no straightening; the car ground along pinned at
      // speed. Flipped and re-measured: the
      // ~14% bite at the pin frame and the nose walks onto the wall tangent,
      // on both walls.
      const noseIn = into > 0 ? rel < 0 : rel > 0;        // nose pointing into wall?
      const incidence = Math.min(1, Math.abs(Math.sin(rel)));  // 0 graze … 1 head-on
      // Kill the slip while scraping a barrier, in BOTH directions.
      //
      // A previous pass made this directional — zeroing only slip heading INTO
      // the wall — reasoning that erasing slip away from it stopped the car
      // rotating out of a scrape. Sound in isolation, wrong in effect: a car at
      // full lock washes wide into the barrier, and letting it keep lateral
      // velocity there means the slide never decays. Bisected to this line:
      // tests/specs/drift.spec.js went 6/0 -> 4/2, with "full lock washes wide, never
      // spins" reaching 82 deg of slip against its 45 deg limit, and "slide
      // self-aligns" failing alongside it. The wall is a hard constraint; slip
      // against it is not something the car gets to keep.
      if (c.vLat) c.vLat = 0;
      if (noseIn) {
        // first-frame impact: lose only the normal component — a graze is nearly
        // free, a head-on hit bites hard.
        if (!c.wasOnWall) c.speed *= 1 - incidence * AiDrive.wallHitLoss(!!track.street);
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
        const scrub = pushIn * AiDrive.wallSteerScrub(!!track.street) * dt;
        if (c.speed > 0) c.speed = Math.max(0, c.speed - scrub);
        else if (c.speed < 0) c.speed = Math.min(0, c.speed + scrub);
        c.wallT = 0.35;     // brief auto-throttle suppress
      }
      // Nose/steer pointing AWAY = peeling off: speed and heading left alone so
      // the player just drives off the barrier — no sticky pin, no auto-rescue.
    } else {
      // AI has no world-space heading to slide; clamp + gentle scrub.
      c.speed = Math.max(0, c.speed - AiDrive.wallAiScrub(!!track.street) * dt);
    }
    c.wasOnWall = true;
  } else {
    c.wasOnWall = false;
    if (c.human) c.wallT = Math.max(0, (c.wallT || 0) - dt);
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
  if (c.human && c.px != null) {
    if (xPinned) {
      const w = worldFromTrack(c.s, c.x, smp);   // exact inverse of trackFrom
      c.px = w.x;
      c.pz = w.z;
    } else {
      Tracks.sample(track, c.s, smp);            // yawVis below needs the tangent
    }
  } else {
    Tracks.sample(track, c.s, smp);              // yawVis below needs the tangent
  }
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
  // bob) now live in the C2 visual-suspension springs (js/game/bodyattitude.js),
  // advanced per car in the render loop from axEstSm/speed/yawRateCur/kCur +
  // road height. Render-only — see BodyAttitude.
  // Brake-disc heat (render-only): glows up while braking at speed, cools after.
  // Drives the emissive brake-glow rings on the player's wheels.
  {
    // ALL cars (the AI brake into corners too — a field of glowing discs).
    const heating = braking && vStd(c.speed) > 12;   // vStd: a threshold, not a force — see OT_MIN_SPEED
    c.brakeHeat = clamp((c.brakeHeat || 0) + (heating ? dt * 1.6 : -dt * 0.9), 0, 1);
  }
  if (c.human) {
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
  if (!c.human) c.s = wrapS(c.s + c.speed * dt);
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

  if (c.human) {
    c.prog += ds;
  } else {
    ds = c.speed * dt;
    c.prog += ds;
  }
  c.totalT += dt;
  c.lapTime += dt;
  // OUR QUALIFYING LAP, AS IT HAPPENS. Everyone else in a friend race is
  // sitting on a disabled button while this runs, and a clock is the whole
  // difference between watching somebody and waiting for them. Rate-limited
  // inside netReportQualiLive, gated to the one car it can be about, and
  // purely cosmetic — nothing downstream reads it, so a dropped packet costs a
  // flicker rather than a grid slot.
  if (c.isPlayer && isQuali() && state === "race" && c.lapTime > 0) {
    netReportQualiLive(c.driverId, c.lapTime, track && track.total ? (c.s || 0) / track.total : 0);
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
      sectorValid = fwd;   // the NEXT split is trustworthy only after a forward entry
      sectorIdx = newSector;
      sectorStartT = c.lapTime;
    }
  }

  // Line crossing. `ds > 0` stops a backward crossing INCREMENTING the lap, but
  // for a long time nothing undid one either — there was no `lap--` anywhere in
  // js/, while `c.prog` was symmetric. So crossing the line, being shoved back
  // over it by shiftLong (contact resolution moves a car up to ~4-5 m along the
  // road) and crossing again added a SECOND lap, and `c.finished` could fire a
  // full lap early. The backward branch below restores the symmetry `prog`
  // already had.
  if (ds > 0 && oldS > track.total * 0.5 && c.s < track.total * 0.5) {
    c.lap++;
    // Retained so the backward branch can put the clock back. Without it a
    // re-crossing records the few tenths since the reset as a completed lap —
    // which is not just a wrong readout, it beats `c.best` and becomes the
    // stored ghost.
    c._lapTimeAtLine = c.lapTime;
    // A takeover (R2/R3/C1) during this lap invalidates it EXPLICITLY: the car
    // was moved by Rapier, so the lap is not a legitimate timed lap. Don't let it
    // set a personal best or become the stored ghost; just start the next lap
    // clean. The flag is set by IncidentSim and cleared here at the line.
    const lapValid = !c.incidentInvalidLap;
    if (c.lap > 1) {
      const lapDone = c.lapTime;
      if (lapValid) c.lastLap = lapDone;
      if (lapValid && lapDone < c.best) c.best = lapDone;
      if (c.isPlayer && soundOn) GameAudio.lap();
      // Tell the rival about our lap. Times are authored by whoever OWNS the
      // car — nobody else can time it — and go over the reliable channel,
      // because a dropped lap time is a wrong RESULT, not a momentary glitch.
      if (lapValid && c.local && netPlay.active()) {
        netPlay.reportLap({ lap: c.lap, time: lapDone, best: isFinite(c.best) ? c.best : null, code: c.code });
      }
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
  } else if (ds < 0 && oldS < track.total * 0.5 && c.s > track.total * 0.5) {
    // Backward over the line: give the lap back and put the clock where it was,
    // so the next forward crossing re-times the SAME lap rather than a sliver.
    // Only the player can get here — updateCar overwrites `ds` with
    // `c.speed * dt` for every AI car, so their `ds` is never negative.
    if (c.lap > 0) {
      c.lap--;
      c.lapTime = c._lapTimeAtLine != null ? c._lapTimeAtLine : c.lapTime;
      // (A finished car cannot get here — updateCar early-outs it long before
      // the crossing logic — so no `c.finished` undo is needed.)
      if (c.isPlayer) { sectorIdx = sectorAt(c.s); sectorStartT = c.lapTime; }
      // Crossing back over the line wraps c.s from ~0 to ~track.total, breaking the
      // monotonic-distance domain the ghost recorder assumes. Ghost.record only
      // rejects DECREASING s, so the next forward-jump sample would be appended and
      // at() would interpolate the replay ghost crawling across the whole lap.
      // Restart the recording so the re-timed lap records cleanly from here.
      if (c.isPlayer && isTimeTrial()) Ghost.startLap();
    }
  }
  // Skip ghost recording while the current lap is incident-invalidated (a
  // takeover jumps s/x — recording it would corrupt the ghost trace).
  if (isTimeTrial() && c.isPlayer && !c.incidentInvalidLap) Ghost.record(c.lapTime, c.s, c.x);

  // --- wrong-way + auto-rescue (player only) ---
  if (c.human && state === "race" && !c.finished) {
    // Moving backwards along the track at speed = going the wrong way. (A slow
    // reverse crawl to recover off a wall is fine and does NOT trip this.)
    if (ds < -0.03 && vStd(c.speed) > 15) c.wrongT = Math.min(2, (c.wrongT || 0) + dt);
    else c.wrongT = Math.max(0, (c.wrongT || 0) - dt * 2);
    c.wrongWay = c.wrongWay ? c.wrongT > 0.15 : c.wrongT > 0.4;
    if (c.wrongWay && (c.wrongCueT = (c.wrongCueT || 0) - dt) <= 0) {
      if (c.local) announce("WRONG WAY", 1.0);
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
    //
    // PACE-SCALED, exactly like the floor it sits above. The floor itself is
    // `GRASS_V * 0.6 * max(PACE, 0.05)` (see the grass-drag clause), so a bare
    // `GRASS_V * 0.6 + 1.5` only clears it at PACE = 1 — the one setting the
    // invariant above was measured at. Above ~1.14 the floor climbs past the
    // gate and a beached car is never rescued; below ~0.57 the gate climbs past
    // ordinary run-off speeds and a driver in full control is teleported to
    // x = 0 after 3 s. Both are precisely the bugs this comment says were
    // fixed, reintroduced through the OVERALL SPEED slider.
    const beached = c.offroad && c.speed < GRASS_V * 0.6 * Math.max(PACE, 0.05) + 1.5;
    const stuck = beached || c.wrongWay || (c.speed < 4 && (c.wallT || 0) > 0) || stoppedOnTrack;
    // 4-second grace period AFTER a rescue prevents rapid re-rescue on marginal
    // stuck conditions. Only applies once a rescue has actually happened —
    // (c.rescueLastT || 0) defaulted to 0 and blocked rescue for the first 4 s of
    // every race, so a car stuck from the start was never recovered.
    const rescueGrace = c.rescueLastT != null && raceT < c.rescueLastT + 4;
    if (stuck && !rescueGrace) c.rescueT = (c.rescueT || 0) + dt;
    else c.rescueT = Math.max(0, (c.rescueT || 0) - dt * 1.5);
    if (c.rescueT > 3) { rescuePlayer(c); c.rescueT = 0; }
  } else if (!c.human && state === "race" && !c.finished) {
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
      // Pace-scaled restore floor (same shape as coast()); never above vTop().
      c.speed = Math.min(vTop(), Math.max(c.speed, 14 * Math.max(PACE, 0.05)));
      c.rescueT = 0; c.offT = 0; c.stuckT = 0;
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

// Put the player back on the racing line at its CURRENT progress, facing forward
// at a modest speed — for recovering from a spin, a beached off-track moment, or
// being pinned to a wall. Progress (s/prog/lap) is preserved; only the lateral
// position, heading and slip are reset, and a little speed restored.
function rescuePlayer(c) {
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
  c.boostOn = false; c.deploying = false;
  c.xOn = false; c.aeroX = 0; c.xArmed = false;   // rescue drops back to Z-mode
  c.wrongT = 0; c.wrongWay = false; c.offT = 0; c.wallT = 0; c.wasOnWall = false; c.rescueT = 0;
  c.rescueLastT = raceT;
  // Cues are for the driver at THIS screen — a rival being recovered elsewhere
  // on track must not announce itself here.
  if (c.local) {
    announce("RECOVERED", 1.2);
    if (soundOn) GameAudio.offtrack();
  }
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
  c.speed = 0; c.vLat = 0; c.yawRateCur = 0; c.yawVis = 0; c.steerVis = 0;
  c.gear = 1; c.rpm = IDLE_RPM;
  c.boostOn = false; c.deploying = false; c.otT = 0; c.otArmed = false;
  // The broadcast call. Every retirement is announced, not only the player's:
  // losing a rival is race information, and it is the only way a DNF that
  // happened half a lap away is visible at all.
  announce("RETIREMENT — " + c.code, 2);
  if (c.local && soundOn) GameAudio.offtrack();
}

// Retirements arrive by race DISTANCE, not by clock: the moment was drawn as a
// fraction of the full race at the green light (see armReliability), so a 3-lap
// blast and a 25-lap race lose their cars at the same points of the story.
function checkRetirements() {
  const dist = Math.max(1, lapsTarget * track.total);
  for (const c of cars) {
    if (c.dnfAt == null || c.retired || c.finished) continue;
    if (c.prog / dist >= c.dnfAt) retireCar(c, c.dnfWhy);
  }
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
  // Same shape as the grass-drag floor (see updateCar): a bare Math.max(24, …)
  // RAISES a car that finished slower than 24 m/s, and 24 sits above vTop() below
  // pace ~0.55. Pace-scale the floor, and never speed the car up. If already
  // below the floor (finished crawling), keep scrubbing toward 0 — the old
  // Math.min(speed, max(floor, …)) left cars stuck at their finish speed.
  const floor = GRASS_V * 0.6 * Math.max(PACE, 0.05);
  const next = c.speed - 20 * dt;
  c.speed = c.speed > floor ? Math.max(floor, next) : Math.max(0, next);
  c.s = wrapS(c.s + c.speed * dt);
  c.prog += c.speed * dt;
  Tracks.sample(track, c.s, smp);
  const kA = Tracks.curvature(track, wrapS(c.s + 30));
  // Finished cars cruise the inside line (-sign(k)), same convention as the AI.
  c.x = damp(c.x, clamp(-kA * 130, -0.5, 0.5) * smp.hw, 2, dt);
  // Finished cars are kinematic in (s, x). Mirror world metres or renderPosOf
  // keeps the last racing px/pz and the mesh freezes on the line while s walks
  // away (~2 s until results). Heading follows the road — nothing steers.
  {
    const w = worldFromTrack(c.s, c.x, smp);
    c.px = w.x; c.pz = w.z;
    c.head = Math.atan2(smp.t[0], smp.t[2]);
  }
}

// Lighting tuner registry (TUNE_DEFS), the live LT values, floodColor and
// the track light builder live in js/game/lighting.js. LT is a plain object
// mutated in place, so the profile-resolution code below and the sliders/
// __apex.lightTune keep every LT.x call site unchanged.
const { TUNE_DEFS, LT, buildTrackLights } = LightTune;
// The PROFILE STORE — which layer of (default / shipped preset / player edit)
// wins for the conditions on screen — lives in js/game/light-store.js
// (LightStore.create(G), assigned with the other modules below). These six are
// thin passes through to it, kept so every call site here reads unchanged.
function ltKey() { return ltStore.key(); }
function applyLightTune(fromApplyRace) { ltStore.apply(fromApplyRace); }
function setLightTune(id, v) {
  // A deliberate re-enable of PER-CHUNK LAMPS clears the crash latch. It is set
  // on a real context loss (js/render/glx.js) and persisted so a reboot into the
  // same config cannot crash-loop — but nothing else cleared it, so one transient
  // display reset disabled the feature forever and the slider silently did
  // nothing. Here at the EDIT (not in the render loop, which only runs the
  // per-chunk path at night) a RISING EDGE from 0 to a positive value is the
  // player choosing to switch it back on — informed, one gesture at a time — so
  // it is the honest reset. The tier gate still protects a governed device.
  if (id === "perChunkLights" && +v > 0 && !(+LT[id] > 0) && _perChunkOff) {
    _perChunkOff = false;
    try { localStorage.removeItem("apex26.perChunkOff"); } catch (_) { /* no storage: the in-memory clear stands for this session */ }
  }
  return ltStore.set(id, v);
}
function persistLightTune() { ltStore.persist(); }
// Spread the on-screen condition to every other track at the same time+weather
// ("edits" = this profile's overrides only, "look" = every live value), and the
// one-step revert for it. The tuner panel and __apex.lightCopy are the callers.
function copyLightTune(mode) { return ltStore.copyToTracks(mode); }
function restoreLightTune(undo) { return ltStore.restore(undo); }
// LAMP_KINDS + buildTrackLights(track) live in js/game/lighting.js (LightTune).

// Per-frame light assembly (nearest-N flood cull + car tail lights) lives in
// js/game/lighting.js (LightTune.setFrameLights / appendCarTailLights).
const _rainLightOpts = { emissive: 1, roughness: 0.9, specular: 0, noAlphaWrite: true };
const _wheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };
const _ersLightOpts = { emissive: 1.0, roughness: 1, specular: 0, noAlphaWrite: true, alpha: 1 };
const _flameOpts = { emissive: 1.0, roughness: 1, specular: 0, alpha: 1, noAlphaWrite: true };
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
// Preview CAMERA state. The turntable used to be the only way to see the car:
// one fixed height, one fixed distance, spinning left whether you wanted it to
// or not, so inspecting the part you just bought meant waiting for it to come
// back around. az/el/dist are now a real orbit the player drives (drag on the
// canvas, wheel/pinch to zoom, preset chips in #cs-view), and SPIN is a toggle
// over the top of it rather than the whole interaction.
// Defaults reproduce the previous framing exactly: eye y 2.0 at dist 8.5 over a
// target at y 0.35 is an elevation of atan2(1.65, 8.5).
const SP_EL_DEF = Math.atan2(1.65, 8.5), SP_DIST_DEF = 8.5;
// Half the car's BROADSIDE footprint (~5.95 m drawn, measured on screen at
// 1440x900) plus ~12% margin. renderSetupPreview holds the auto-turntable at
// whatever distance keeps this inside the visible half-width.
const SP_FIT_HALF_W = 3.35;
// The garage environment — bay shell, truss, LED fixtures, pit equipment, team
// dress, floor and light rig — lives in js/game/garage-scene.js. It owns the
// frame clear colour too: every surface in there fades to exactly BACKDROP at
// its far edge, so the room has no silhouette against the void.
let setupPreviewEl = SP_EL_DEF, setupPreviewDist = SP_DIST_DEF;
let setupPreviewSpin = true;
// GARAGE active-aero demo. `setupPreviewXOn` is the button; `setupPreviewAeroX`
// is the flap TRAVEL that the draw reads, eased toward it at the same rates the
// car uses on track — so the garage shows the wings MOVING, at the real speed,
// rather than snapping between two poses.
let setupPreviewXOn = false, setupPreviewAeroX = 0;
// Orbit limits: never underneath the floor plane, never past straight down, and
// close enough to read a decal without clipping into the nose.
const SP_EL_MIN = 0, SP_EL_MAX = 1.30, SP_DIST_MIN = 4.6, SP_DIST_MAX = 15;
// az 0 = ahead of the nose (+Z), PI = behind the wing; see the eye vector below.
// Distances are per-view because the car is 5.4 m long and 1.9 m wide, and the
// sheet takes the right ~40% of the canvas: head-on it fits close, broadside it
// does not. SIDE and TOP get the extra pull-back their aspect actually needs
// rather than one nominal distance that crops the nose off two of the five.
const SP_VIEWS = {
  hero:  { az: Math.PI * 0.78, el: 0.30, dist: 8.5 },   // rear three-quarter
  front: { az: 0,              el: 0.20, dist: 8.2 },
  side:  { az: Math.PI * 0.5,  el: 0.10, dist: 11.2 },
  rear:  { az: Math.PI,        el: 0.22, dist: 8.4 },
  top:   { az: Math.PI * 0.5,  el: 1.20, dist: 11.5 },
  // WING views: framed for watching the active-aero flaps travel. Both are
  // deliberately three-quarter, never head-on — the flaps rotate about the
  // car's X axis, so the dead-on FRONT and REAR presets look straight down that
  // axis and hide the one thing these views exist to show. `aim` names the wing
  // whose flap the camera orbits (see setSetupView), and `minDist` lets them sit
  // closer than the whole-car floor without letting the other views clip inside
  // the bodywork.
  // Distances are set from the frustum, not by eye: the preview runs a 36 deg
  // VERTICAL fov and the docked sheet leaves ~60% of the canvas, so the usable
  // width at the target is ~0.62*dist. That frustum floor put the 1.66 m front
  // wing at ~4.5 m and the narrower 1.0 m rear wing at ~3.6 m; the shipped 3.6
  // and 2.8 then tightened both by ~20% — the flap travel is the subject here,
  // and a little wing-tip crop reads better than a flap a few pixels tall.
  wingFront: { az: Math.PI * 0.30, el: 0.34, dist: 3.6, aim: "front", minDist: 2.0 },
  wingRear:  { az: Math.PI * 0.72, el: 0.36, dist: 2.8, aim: "rear",  minDist: 1.8 },
};
// The point the preview camera ORBITS and LOOKS AT. The defaults reproduce the
// previous hard-coded numbers exactly (eye was offset -1.0 in z from a target at
// z 0), so every existing view is unchanged; only the wing presets move them.
// ORBIT AND AIM ARE THE SAME POINT, AND IT IS THE CAR'S CENTRE. These were
// [0, 0.35, -1.0] and [0, 0.35, 0]: the camera circled a point 1 m BEHIND the
// one it looked at, so the turntable swung the car across the frame instead of
// rotating it in place — at some angles the nose left the visible region
// entirely. Both were also behind the car: the drawn body spans z -2.69..3.18
// (measured), so its centre is z +0.245, not 0 and not -1.
const SP_CAR_CTR = [0, 0.45, 0.245];
const SP_ORBIT_DEF = SP_CAR_CTR.slice(), SP_TGT_DEF = SP_CAR_CTR.slice();
let setupPreviewOrbit = SP_ORBIT_DEF.slice(), setupPreviewTgt = SP_TGT_DEF.slice();
let setupPreviewMinDist = 0;   // 0 = use the global SP_DIST_MIN
// PAN — a translation of the whole rig (orbit centre AND look-at) in car-local
// metres. Orbit and zoom alone can only ever circle the same point, so there is
// no way to walk along the car and study one end of it up close; you can only
// back off until the whole car fits. Pan is what makes the preview a camera you
// move rather than a turntable you watch.
let setupPreviewPan = [0, 0, 0];
const _spAim = [0, 0, 0];
// Bounds are a box around the car (~5.4 m long, ~1.9 m wide), sized so you can
// reach past either end and either flank but not lose the car off screen.
const SP_PAN_X = 2.2, SP_PAN_Z = 3.4;
// Mid-chord of one flap, in car-local metres — what a wing view aims at. Read
// from the same Car3D anchors the flaps are drawn from, so the framing follows
// the player's own AERO part instead of a fixed guess.
function flapAimPoint(which) {
  const aSt = teamDecalState(Teams.LIST[teamIdx], true);
  return Car3D.aeroFlapAim(aSt.val, which, aSt.aero);
}
function setSetupView(name) {
  const v = SP_VIEWS[name];
  if (!v) return;
  setupPreviewAz = v.az; setupPreviewEl = v.el; setupPreviewDist = v.dist;
  // A preset is an absolute framing, so it also drops any pan the player had
  // walked in — otherwise "show me the rear wing" shows them the rear wing plus
  // whatever two metres of offset they were still carrying.
  setupPreviewPan[0] = setupPreviewPan[1] = setupPreviewPan[2] = 0;
  if (v.aim) {
    // Orbit AND look at the flap itself, so the wing stays centred at every
    // turntable angle instead of swinging out of frame the way a car-centred
    // orbit does once you are 2.5 m away.
    const p = flapAimPoint(v.aim);
    setupPreviewOrbit = p.slice(); setupPreviewTgt = p.slice();
    setupPreviewMinDist = v.minDist || 0;
  } else {
    setupPreviewOrbit = SP_ORBIT_DEF.slice(); setupPreviewTgt = SP_TGT_DEF.slice();
    setupPreviewMinDist = 0;
  }
  // Picking a view means "hold it there" — leaving the turntable running would
  // immediately rotate away from the angle that was just asked for.
  setSetupSpin(false);
}
function setSetupSpin(on) {
  setupPreviewSpin = !!on;
  const b = $("cs-view-spin");
  // `active` drives the lit style (and is what AriaState reads); the attribute
  // is set here too so the state is correct before AriaState's observer fires.
  if (b) {
    b.classList.toggle("active", setupPreviewSpin);
    b.setAttribute("aria-pressed", String(setupPreviewSpin));
  }
}
// Ease the garage flaps at the SAME asymmetric rates the car uses on track (see
// X_OPEN_RATE / X_CLOSE_RATE) — the snap-shut is half the character of the
// system, and a garage that opened and closed at one speed would missell it.
// Its own function so the frame loop and __apex.garageStep() cannot drift: the
// preview animation was previously reachable ONLY from inside the rAF render,
// which made it untestable, and an untested animation is one you find out about
// from a player.
function stepSetupAero(dt) {
  const want = setupPreviewXOn ? 1 : 0;
  const rate = want > setupPreviewAeroX ? X_OPEN_RATE : X_CLOSE_RATE;
  const step = rate * Math.min(dt, 1 / 20);
  setupPreviewAeroX = clamp(setupPreviewAeroX + Math.sign(want - setupPreviewAeroX) * step,
                            Math.min(setupPreviewAeroX, want), Math.max(setupPreviewAeroX, want));
}
function setSetupAero(on) {
  const was = setupPreviewXOn;
  setupPreviewXOn = !!on;
  // Switching X-mode ON from the untouched turntable AIMS at the rear wing.
  // The flaps rotate about the car's X axis, so the turntable's own three-quarter
  // sweep and the FRONT/REAR presets all look very nearly along that axis, where
  // a 36-degree sweep projects to almost nothing. Pressing the button and seeing
  // the car not move is the single most common way to conclude this feature is
  // broken — and it is what happened. `spin` is the "I have not aimed anything"
  // state, so a player who HAS chosen an angle keeps it.
  // The threshold is DISTANCE, not just the turntable. At the whole-car framing
  // (8.5 m) the rear wing's 135 mm of travel projects to about TEN PIXELS on a
  // landscape phone — the motion is real and simply cannot be seen, which is
  // indistinguishable from a broken feature and was reported as one. The wing
  // preset sits at 2.8 m, where the same travel is ~30 px and the slot visibly
  // opens. A player already close in on something has aimed deliberately, so
  // they keep their shot.
  if (setupPreviewXOn && !was && (setupPreviewSpin || setupPreviewDist > 5)) setSetupView("wingRear");
  const b = $("cs-aero");
  if (b) {
    // `active` drives the lit style (and is what AriaState reads); the attribute
    // is set here too so the state is correct before AriaState's observer fires.
    b.classList.toggle("active", setupPreviewXOn);
    b.setAttribute("aria-pressed", String(setupPreviewXOn));
    const v = b.querySelector(".cs-aero-val");
    if (v) v.textContent = setupPreviewXOn ? "X-MODE" : "Z-MODE";
  }
}
function setupZoom(mul) {
  setupPreviewDist = clamp(setupPreviewDist * mul,
    setupPreviewMinDist || SP_DIST_MIN, SP_DIST_MAX);
}
// Move the rig sideways / along the car, in the SCREEN's frame rather than the
// car's: "left" has to mean left as seen, or the control inverts itself as soon
// as the turntable carries you past the nose. At azimuth `az` the camera's
// horizontal right vector is (cos az, 0, -sin az) and its forward is
// (-sin az, 0, -cos az); strafe and dolly ride those.
function setupPan(strafe, dolly) {
  if (!strafe && !dolly) return;
  const ca = Math.cos(setupPreviewAz), sa = Math.sin(setupPreviewAz);
  setupPreviewPan[0] = clamp(setupPreviewPan[0] + strafe * ca - dolly * sa, -SP_PAN_X, SP_PAN_X);
  setupPreviewPan[2] = clamp(setupPreviewPan[2] - strafe * sa - dolly * ca, -SP_PAN_Z, SP_PAN_Z);
  // Panning is aiming. Leaving the turntable running would immediately carry the
  // camera away from whatever was just framed, exactly as picking a view does.
  setSetupSpin(false);
}
// One discrete step of the on-screen orbit controls (keyboard activation).
function nudgeSetupCam(dAz, dEl, zoom) {
  if (dAz) { setupPreviewAz += dAz; setSetupSpin(false); }
  if (dEl) { setupPreviewEl = clamp(setupPreviewEl + dEl, SP_EL_MIN, SP_EL_MAX); setSetupSpin(false); }
  if (zoom) setupZoom(zoom);
}
// A HELD control, as per-second rates applied by the frame loop. This started as
// a setInterval and read as a stutter: the render loop saturates the main thread
// under software GL, so a 55 ms timer was only serviced every ~240 ms. Rates on
// the frame clock are smooth at any frame rate and correct on a fast machine
// too, where a fixed timer would instead have moved in visible jumps.
let spHeld = null;   // {az, el, zoom, strafe, dolly} — per second
const SP_RATE = { az: 1.8, el: 1.0, zoom: 2.4, pan: 1.5 };
function applyHeldSetupCam(dt) {
  if (!spHeld) return;
  if (spHeld.az) { setupPreviewAz += spHeld.az * dt; setSetupSpin(false); }
  if (spHeld.el) {
    setupPreviewEl = clamp(setupPreviewEl + spHeld.el * dt, SP_EL_MIN, SP_EL_MAX);
    setSetupSpin(false);
  }
  if (spHeld.zoom) setupZoom(Math.pow(spHeld.zoom, dt));
  if (spHeld.strafe || spHeld.dolly)
    setupPan((spHeld.strafe || 0) * dt, (spHeld.dolly || 0) * dt);
}
function resetSetupCam() {
  setupPreviewAz = 0.6;
  setupPreviewEl = SP_EL_DEF;
  setupPreviewDist = SP_DIST_DEF;
  setupPreviewPan[0] = setupPreviewPan[1] = setupPreviewPan[2] = 0;
  setSetupSpin(true);
}
// Rebuild-on-change only (not per-frame): keyed by team + resolved parts tiers,
// mirroring the playerBodyMesh/cockpitBodyMesh cache-key pattern. gfx.freeMesh
// releases the previous mesh's GL buffers so repeated chip clicks don't leak.
let _spMesh = null, _spMeshKey = "", _spHull = null;
function getSetupPreviewMesh() {
  const team = Teams.LIST[teamIdx];
  const key = team.id + ":" + partsVisualKey(team.id);
  if (key !== _spMeshKey) {
    if (_spMesh) gfx.freeMesh(_spMesh);
    const liv = resolveLivery(team);
    const spData = Car3D.build(liv.c1, liv.c2, {
      livery: liv,
      teamId: team.id,   // per-team chassis style shows in the setup turntable too
      num: team.drivers && team.drivers[0] && team.drivers[0].num,
      parts: Parts.getVisualTiers(getTeamParts(team.id), team),
    });
    _spHull = GarageScene.framingHull(spData);   // silhouette proxy for the turntable re-centre
    _spMesh = gfx.createMesh(spData);
    _spMeshKey = key;
  }
  return _spMesh;
}
const _spProj = new Float32Array(16), _spView = new Float32Array(16), _spVP = new Float32Array(16);
const _spInvProj = new Float32Array(16);
const _spLiv = () => resolveLivery(Teams.LIST[teamIdx]);   // memoised on store.rev
// Bloom lower and hotter than the race default: the ceiling panels ARE the
// subject. ssao needs the proj/invProj pair passed to begin(); contact shadows
// would additionally need sunViewDir, and the sun is now only a fill.
const SP_PRESENT = { exposure: 1.28, bloom: 0.70, threshold: 0.62, contact: 0 };
function renderSetupPreview(dt) {
  gfx.resize();
  applyHeldSetupCam(dt);                               // held on-screen controls
  if (setupPreviewSpin) setupPreviewAz += dt * 0.35;   // slow turntable
  stepSetupAero(dt);
  // The orbit radius is horizontal, so raising the camera does not walk it away
  // from the car: at el 0 this is the old fixed ring, at el 1.2 it is overhead.
  const spCe = Math.cos(setupPreviewEl), spSe = Math.sin(setupPreviewEl);
  // The docked #cs-inner panel covers the right portion of the canvas, so the
  // car only ever gets (1 - panelFrac) of the frustum. Read the panel's live
  // pixel width so this tracks every breakpoint/viewport automatically.
  // WHICH WAY DOES THE PANEL LEAVE ROOM? It docks to the RIGHT on a wide screen
  // and to the TOP on a tall one, because a portrait phone has no width to give
  // and plenty of height — so the gap the car gets is either beside the panel or
  // below it. Measure both and shift along the axis that actually has the room;
  // shifting the wrong one is what left the car invisible behind a full-width
  // sheet in portrait.
  const canvasEl = $("game"), panelEl = $("cs-inner");
  let panelFrac = 0, panelFracY = 0;
  if (canvasEl && panelEl && canvasEl.clientWidth > 0 && canvasEl.clientHeight > 0) {
    // Visual coverage vs the unzoomed canvas (A13). viewportRect scales up on
    // engines where gBCR is still local under CSS zoom.
    const pr = (window.CssZoom && CssZoom.viewportRect(panelEl)) || panelEl.getBoundingClientRect();
    const cw = canvasEl.clientWidth, ch = canvasEl.clientHeight;
    if (cw - pr.width >= ch - pr.height) panelFrac = clamp(pr.width / cw, 0, 0.85);
    else panelFracY = clamp(pr.bottom / ch, 0, 0.85);
  }
  // FIT THE VISIBLE REGION, NOT THE WHOLE CANVAS. SP_DIST_DEF was chosen so the
  // car cleared the full frustum — but a third of that frustum is behind the
  // panel, so the turntable put the front wing off the left edge and the rear
  // wing under the panel every time it swung broadside (measured at 1440x900).
  // Two numbers in the old note were wrong: the drawn car is ~5.95 m across at
  // broadside, not 5.4 m (the wings are the wide part), and the margin has to
  // come out of the VISIBLE half-width. Hold the turntable at whatever distance
  // keeps that inside it. Only the AUTOMATIC view self-frames — picking a preset
  // or zooming clears setupPreviewSpin, and from there the distance is theirs.
  const spFitD = SP_FIT_HALF_W / Math.max(Math.tan(18 * Math.PI / 180) * gfx.aspect * (1 - panelFrac), 0.05);
  const spDist = setupPreviewSpin
    ? clamp(Math.max(setupPreviewDist, spFitD), SP_DIST_MIN, SP_DIST_MAX) : setupPreviewDist;
  // PAN shifts the orbit centre and the look-at together, so strafing tracks
  // along the car instead of swinging the aim off it — the difference between
  // "walk down the flank" and "turn your head at the far end of the pit box".
  const eye = [setupPreviewOrbit[0] + setupPreviewPan[0] + Math.sin(setupPreviewAz) * spDist * spCe,
               setupPreviewOrbit[1] + setupPreviewPan[1] + spDist * spSe,
               setupPreviewOrbit[2] + setupPreviewPan[2] + Math.cos(setupPreviewAz) * spDist * spCe];
  M4.perspectiveTo(_spProj, 36 * Math.PI / 180, gfx.aspect, 0.1, 60);
  // An on-axis camera centers the car behind the panel, half-cropped. Shift the
  // frustum (off-axis / "lens shift") so the car renders centered in the VISIBLE
  // region instead — sideways when the panel is docked to an edge, downwards
  // when it sits across the top. col2 row0 shifts NDC.x, col2 row1 shifts NDC.y;
  // in both cases a positive value moves the image the OTHER way, which is why
  // the car ends up at -frac, the centre of the gap the panel is not covering.
  _spProj[8] = panelFrac;
  _spProj[9] = panelFracY;
  _spAim[0] = setupPreviewTgt[0] + setupPreviewPan[0];
  _spAim[1] = setupPreviewTgt[1] + setupPreviewPan[1];
  _spAim[2] = setupPreviewTgt[2] + setupPreviewPan[2];
  M4.lookAtTo(_spView, eye, _spAim, [0, 1, 0]);
  M4.mulTo(_spVP, _spProj, _spView);
  GarageScene.recentre(_spProj, _spView, _spVP, panelFrac, setupPreviewSpin, _spHull);
  M4.invertTo(_spInvProj, _spProj);
  if (gfx.begin({
    // Sun with NO sideways component. The shark fin is a thin blade whose two
    // flanks carry opposite normals (+X and -X), so any X in the sun direction
    // lights one face and leaves the other on ambient — the same badge came out
    // two different shades depending on which side you orbited to. On a thick
    // body that asymmetry is correct; on a blade being inspected in a showroom
    // it just reads as a bug. Front-and-above keeps the modelling (the ring of
    // studio lamps below is already symmetric) without favouring a side.
    // The sun is now a SKYLIGHT — a soft roof fill, not the key. See
    // GarageScene.SKYLIGHT: no lamp can contribute more than 1/17 of albedo, so
    // as long as the sun stayed at full white it owned the picture and the bay's
    // ten fixtures were decoration. proj/invProj are what unlock SSAO in
    // present(), and an interior lives or dies on its corner darkening.
    viewProj: _spVP, eye, sunDir: [0, 0.86, 0.51], sunColor: GarageScene.SKYLIGHT,
    ambientSky: GarageScene.AMB_SKY, ambientGround: GarageScene.AMB_GROUND,
    fogColor: GarageScene.BACKDROP, fogDensity: 0, lights: GarageScene.lights(_spLiv()),
    proj: _spProj, invProj: _spInvProj,
    noEnv: true,   // probe-less preview: matte paint, never mirror a stale race cube
  }) === false) return;
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
  GarageScene.draw(Teams.LIST[teamIdx], _spLiv(), eye, getTeamParts, driverIdx);
  gfx.draw(getSetupPreviewMesh(), MAT_REFLECT_X, spMat);
  // The moveable wings, so a player can watch active aero work before ever
  // driving — and see what their own AERO parts choice did to the flap size.
  {
    const aSt = teamDecalState(Teams.LIST[teamIdx], true);
    drawAeroFlaps(Teams.LIST[teamIdx], aSt.val, setupPreviewAeroX, MAT_REFLECT_X, spMat,
      aSt.aero);
  }
  // `night` here means "the sun is not the key" — which in a garage it is not.
  // The decal shader is sun + ambient + glow only, so without this the liveries'
  // logos and numbers would darken with the skylight and nothing would lift them.
  drawCarDecals(Teams.LIST[teamIdx], MAT_REFLECT_X, true,
    carDecalNum(Teams.LIST[teamIdx], null), false, true);
  // AFTER the car: glare billboards are additive with depth-write off, so drawn
  // any earlier the opaque car would paint straight over them — and at high
  // elevation the ceiling fixtures sit between the eye and the car.
  gfx.drawGlow(GarageScene.lights(_spLiv()), GarageScene.glareStr());
  gfx.present(SP_PRESENT);
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
// Same latch for PER-CHUNK LAMPS, set by the same webglcontextlost handler. It
// is the loop-breaker the crash sentinel cannot be: that ledger is mobile-only
// (js/game/perf.js gates it on gfx.isMobile so the desktop suite never enters
// safe mode), so on desktop a GPU reset leaves nothing behind and the knob —
// which IS persisted, in the tuner store — comes straight back on at the next
// boot into the same configuration that just killed the context.
let _perChunkOff = false;
try { _perChunkOff = localStorage.getItem("apex26.perChunkOff") === "1"; } catch (_) { /* No storage (Safari private mode): the latch is unreadable, so the feature stays governed by the tier gate alone — the same fallback _envProbeOff takes two lines up. */ }
// Hoisted material-option objects for drawWorldMeshes — the function runs up to
// 2×/frame (main pass + env probe) and previously allocated ~9 literals each call.
// Pure night/wet variants are constants; the few with live-tunable fields (detail
// from LT.surfDetail, roughness from LT.roadRough, emissive from floodEmit) are
// per-variant reused objects mutated in place each call (never a stale key).
const _wmFloorN = { emissive: 0.14, roughness: 0.98, specular: 0.05, depthBias: [4, 8], buryRibbon: true };
const _wmFloorD = { roughness: 0.98, specular: 0.05, depthBias: [4, 8], buryRibbon: true };
const _wmTerrainN = { emissive: 0.18, roughness: 0.97, specular: 0.06, detail: 0, buryRibbon: true };
const _wmTerrainD = { roughness: 0.97, specular: 0.06, detail: 0, buryRibbon: true };
const _wmRoadWetN = { emissive: 0.06, roughness: 0.14, specular: 0.85, detail: 0, surfaceId: 16, depthBias: [-8, -16], doubleSided: true };
const _wmRoadWetD = { roughness: 0.14, specular: 0.85, detail: 0, surfaceId: 16, depthBias: [-8, -16], doubleSided: true };
const _wmRoadDryN = { emissive: 0.09, roughness: 0, specular: 0.20, detail: 0, surfaceId: 16, depthBias: [-8, -16], doubleSided: true };
const _wmRoadDryD = { roughness: 0, specular: 0.20, detail: 0, surfaceId: 16, depthBias: [-8, -16], doubleSided: true };
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
// Pooled frustum planes + draw-opt bags (makeFrustumPlanes(vp, out) / GC).
const _pbPlanes = [0,0,0,0,0,0].map(() => new Float32Array(4));
const _cockpitOpts = { roughness: 0.55, metalness: 0.15, specular: 0.40, emissive: 0 };
const _cockpitWheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };
const _ghostOpts = { emissive: 0.80, roughness: 0.20, metalness: 0.08, specular: 0.35, alpha: 0.35, noAlphaWrite: true };
const _wmGlass = { roughness: 0.13, specular: 0.82, metalness: 0.12, clearcoat: 1.0 };
const _wmWaterWet = { roughness: 0.16, specular: 0.85, metalness: 0.05 };
const _wmWaterDry = { roughness: 0.10, specular: 0.92, metalness: 0.05 };
const _wmGateWet = { roughness: 0.32, metalness: 0.35, specular: 0.65 };
const _wmGateDry = { roughness: 0.45, metalness: 0.30, specular: 0.50 };
// Instanced prop shadow cast: cull to the active light frustum (sun ortho or
// lamp cone via gfx.shadowCullVP) before castShadowInstanced — shared by the
// snap-cached sun pass and the per-frame lamp pass.
function _castPropBatchesShadow(cadence) {
  const _pb = track.meshes.propBatches;
  if (!_pb || !gfx.castShadowInstanced) return;
  if (cadence && PerfGov.tier() >= 1 && (_frameNo & 1) === 1) return;
  // Sharing _pbPlanes with the camera cull is safe: backends snapshot CONTENTS.
  const planes = (gfx.shadowCullVP && gfx.makeFrustumPlanes)
    ? gfx.makeFrustumPlanes(gfx.shadowCullVP, _pbPlanes) : null;
  for (let i = 0; i < _pb.length; i++) {
    if (planes && gfx.cullInstances) {
      // TLX: CPU-pack only (own shadow mesh). GLX/WGX ignore the 3rd arg.
      gfx.castShadowInstanced(_pb[i], gfx.cullInstances(_pb[i], planes, { upload: false }));
    } else gfx.castShadowInstanced(_pb[i]);
  }
}
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
    if (_tChunked) gfx.drawChunked(_tMesh, MAT_IDENT, m);
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
    // debrisworld.js + __apex.geo() both still read track.roadGeo.
    let _roadMesh = track.meshes.road || track.meshes.roadChunked, _roadChunked = !!(_roadMesh && _roadMesh.chunks && _roadMesh.chunks.length);
    // RESOLVED per-chunk state, not the raw knob (frame.perChunkLights holds the
    // same expression but is only assigned under _floodActive, so it is unset by
    // day). Without the tier/latch terms this built a second GPU copy of the road
    // wherever per-chunk lamps are held off, while chunked.js bound the global 32.
    // Prefer per-chunk road when lamp knobs ask for it, OR whenever the
    // env-probe radial cull is live (frustum + 300 m reach — counted ~70%
    // index drop). Lamp path still needs tier < 1; the cull-only path keeps
    // chunking through tier 2 so SSR/shadow sheds do not re-fuse the road.
    const _wantRoadChunk = gfx.chunkedTrackCoords !== false && ((LT.roadChunkLamps && LT.perChunkLights && gfx.hasPerChunkLights && !_perChunkOff && PerfGov.tier() < 1)
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
    if (_roadChunked) gfx.drawChunked(_roadMesh, MAT_IDENT, m);
    else gfx.draw(_roadMesh, MAT_IDENT, m);
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
    const _pb = track.meshes.propBatches;
    if (_pb && _pb.length && gfx.drawInstanced) {
      const planes = gfx.makeFrustumPlanes ? gfx.makeFrustumPlanes(frame.viewProj, _pbPlanes) : null;
      for (let i = 0; i < _pb.length; i++) {
        if (planes && gfx.cullInstances) gfx.cullInstances(_pb[i], planes);
        gfx.drawInstanced(_pb[i], m);
      }
    }
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
// ---------- render ----------
function render(dt) {
  if (headlessMode) return;
  if (setupPreviewOn) { renderSetupPreview(dt); return; }
  gfx.resize();
  // No track yet — live only since boot deferred the flyby build (scheduleFlybyTrack(),
  // end of file). DRAW NOTHING rather than present the old, dead fogColor clear:
  // alpha:false makes an undrawn canvas composite as opaque BLACK, which is what the
  // blessed menu baselines already encode — corners read 4-9/255, i.e. #overlay's
  // 0.55-alpha wash over black, not the tens a lit flyby would push through it.
  if (!track) return;
  _frameNo++;

  // camera
  let eyeT, tgtT, fovT, roadCamRoll = 0;
  if (state === "menu") {
    _plOk = false; _plBodyOk = false;
    const s = wrapS((performance.now() * 0.012) % track.total);
    const bankCam = Tracks.banking(track, s, 0, _bankScratchCam, true);
    _vantExtra.bankDy = bankCam ? bankCam.dy : 0; _vantExtra.deploy = false;
    _vantExtra.slipLat = 0; _vantExtra.att = null; _vantExtra.carPos = null; _vantExtra.carHead = 0;
    const vant = camVantage("cinematic", s, 0, (40 / VMAX) * vTop(), performance.now(), _vantExtra);
    eyeT = vant.eye; tgtT = vant.tgt; fovT = vant.fov; camAncNX = null;
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
    camAncNX = rpCam.world ? rpCam.x : null; camAncNZ = rpCam.world ? rpCam.z : 0;   // anchor for the car-frame camera damping below
    _vantExtra.bankDy = bankDy; _vantExtra.deploy = player.deploying;
    _vantExtra.slipLat = player.vLat || 0; _vantExtra.att = player;
    // the car's real world pose, so the chase rig can follow the CAR
    _vantExtra.carPos = rpCam.world ? (_vantCarPos[0] = rpCam.x, _vantCarPos[1] = rpCam.z, _vantCarPos) : null;
    _vantExtra.carHead = headInterp(player);
    const vant = camVantage(mode, pS, px, player.speed, performance.now(), _vantExtra);
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
  const gentleHead = onboard && (camId === "cockpit" || camId === "hood") && (typeof CockpitOpts === "undefined" || CockpitOpts.turnChase());   // gentle easing is ONLY for a curved aim; a nose-locked aim must not lag
  const lT = gentleHead ? 7 : onboard ? 400 : (racing ? 16 : 10) * cutEase;
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
    camRoll = damp(camRoll, roadCamRoll + camSlipSm * 0.07 + (onboard && player ? (player.baRoll || 0) * 0.85 : 0), 7, dt);   // + chassis roll: a bolted-on camera leans with the car (cameras.js onboardAttitude)
  }

  // Debug free camera (set via __apex.view) overrides the chase cam — instant
  // (no damping), uncapped FOV, far plane and fog pushed out — for inspecting
  // whole-track layouts and trackside scenery from any angle.
  // RENDER DISTANCE knob: scales the far clip plane (and, below, the chunked-
  // scenery draw-distance cull that derives from it). dbgCam overwrites
  // farPlane with its own value right below, so debug/photo-mode is untouched.
  let fovY, farPlane = 900 * (LT.renderDistMul != null ? LT.renderDistMul : 1);
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
  // Radial draw-distance cull for chunked scenery.
  // Free/debug camera: mobile caps at 700 m (the pushed-out photo-mode far
  // plane can frame a whole ~5 M-vert city and jetsam-kill the tab); desktop
  // keeps the full vista (gfx.begin also thins the fog under dbgCam, so a
  // fog-derived cull would visibly pop there).
  // Normal play: fog-wall radial cull — past ~95% fog opacity (3/density) a
  // chunk is invisible anyway, so skip it. Only kicks in when that distance is
  // inside the far plane (900 m as-shipped, scaled by the RENDER DISTANCE
  // knob; night city 0.004 -> 750 m, fog/rain closer); clear day (0.0012 ->
  // 2.5 km) stays uncapped — zero visual change there.
  // Feature-shedding tier 3+ also caps the radius at the far plane: scenery
  // vertex/draw load is the one big cost class the resolution scale and shed
  // passes don't touch, and by tier 3 the device has proven it can't afford
  // the full vista (the fog wall hides most of the cut).
  // Cull off the density the SHADER renders — glx.js uploads frame.fogDensity *
  // FOG DENSITY. Off the raw base, FOG DENSITY 0 ("off") still culled scenery at
  // 250 m with no fog drawn. (FOG BOOST bakes in upstream; it was unaffected.)
  const _fogDens = (frame.fogDensity || 0) * (LT.fogDensityMul != null ? LT.fogDensityMul : 1);
  const _fogCull = _fogDens > 3 / farPlane ? Math.ceil(3 / _fogDens) : 0;
  // Sphere that contains the perspective frustum (far-plane corners sit
  // farther from the eye than farPlane). Look-identical pre-reject; not 300 m.
  const _farCull = farPlane * Math.hypot(1, Math.tan(fovY * 0.5) * Math.hypot(1, gfx.aspect || 1));
  frame.cullDist = dbgCam ? (gfx.isMobile ? 700 : 0)
    : (PerfGov.tier() >= 3 ? Math.min(farPlane, _fogCull || farPlane) : (_fogCull || _farCull));

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

  // Resolve the moving player before any shadow-map pass. AI keeps using the
  // pooled matrices from the preceding frame; only the player's high-speed,
  // chase-camera shadow makes that latency visible.
  const _hasLivePlayerShadow = !!(player && state !== "menu");
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
    const up = Math.abs(sd[1]) > 0.98 ? _upX : _upY;
    // Light basis exactly as lookAtTo derives it: z = sd, x = norm(up×z), y = z×x.
    const zx = sd[0], zy = sd[1], zz = sd[2];
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    // SHADOW DISTANCE knob: re-render the map when the box size changes too (not
    // only on the position snap), so the slider responds without driving.
    const sBox = LT.shadowRange != null ? LT.shadowRange : 80;
    const step = sBox / 4;
    // Forward-biased CAMERA anchor, not the raw player position: the box budget
    // goes where you look. Centred on the car, up to sBox/8 of snap slack plus
    // the ~10 m chase-cam offset sat BEHIND the camera, so the shader's fade had
    // to dissolve shadows by 0.72·range (≈58 m at the default 80) to stay inside
    // the worst-case border — the "shadow horizon" ~58 m ahead. Anchoring at
    // camera + a forward bias makes the safe radius symmetric around the view
    // (0.875·sBox from the anchor), letting the fade reach ~0.84·range — shadows
    // hold ~67 m ahead of the camera at the same texel density. Height comes from
    // the LOOK TARGET (subject/ground level — right for chase, cockpit, TV and
    // orbit/aerial debug cams alike), NOT the camera eye: fading by eye distance
    // erased ALL shadows from any high/aerial camera (vDist ≥ altitude).
    // THE BIAS DIRECTION IS THE CAR'S HEADING, NOT THE VIEW. Biasing along the look
    // direction made the FADE camera-ORIENTATION dependent: uShadowCtr swings around
    // a 2·fBias circle on a pure yaw and sampleShadow dissolves shadows by distance
    // from it, so a stationary shadow changed strength when the player only turned.
    // Measured (bahrain/day, eye pinned, aim swept ±40°): a shadow 70 m ahead swung
    // edgeFade 0.625..0.986 — 58% of its strength — while 40 m and 60 m were flat.
    // Same class as the night lamp-cull bug, and the same rule MJP's shadow notes
    // state: a stabilised map must not change as the camera rotates. Heading is
    // invariant under a camera-only rotation and still points where the car is
    // going, so the reach the bias buys is unchanged; |bias| and therefore the
    // 0.875·sBox coverage guarantee are untouched. No player (menu flyby) falls
    // back to the look direction, which is the only direction that exists there.
    let fbx = camTgt[0] - camEye[0], fbz = camTgt[2] - camEye[2];
    if (player && player.head != null) { fbx = Math.sin(player.head); fbz = Math.cos(player.head); }
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
    // PRODUCER/CONSUMER GATE. lit.js's sampleShadow opens with
    // `if (uShadowStr <= 0.0) return 1.0;` — so when the key has faded out
    // (overcast, wet or foggy night) NOTHING reads this map: the god-ray march
    // is the only other reader and it is gated on uStr > 0.0, which is 0 below
    // the same key. The consumer side of that was already taken; the PRODUCER
    // was not, so the frame still paid a 2048² depth clear, the full terrain and
    // road ribbons cast unchunked (44,826 verts on vegas), and shadowEnd's 512²
    // PCSS blocker downsample — for a texture with zero readers, once per 20 m
    // snap cell, i.e. 300+ times a lap.
    //
    // The predicate is NOT new: it is the identical expression already used
    // below to gate the props cast and again at the car sun pass. Hoisted here
    // so all three agree. When it closes, the snap cache is INVALIDATED rather
    // than left alone — otherwise weather clearing mid-race would re-open the
    // gate onto a stale map and hold it until the next cell crossing.
    const _shKeyG = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
    const _shadowsRead = _shKeyG > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01);
    if (!_shadowsRead) {
      _shadowSnapX = _shadowSnapZ = _shadowBox = null;
      _shadowSunX = _shadowSunY = _shadowSunZ = null;
    } else if (lu !== _shadowSnapX || lv !== _shadowSnapZ || sBox !== _shadowBox ||
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
      // Shadow ribbons: chunk + frustum-cull against the ±shadow-box ortho
      // (castShadowChunked). PERF-FINDINGS: ~89% of tris sit outside the box;
      // depth half is bit-identical. Independent of LT.roadChunkLamps (lit pass).
      // Lazy-build shares roadChunked with the lamp draw path.
      const _castRibbonSh = (geo, key, plain, allow = true) => {
        if (track.meshes[key] === undefined) {
          track.meshes[key] = null;
          if (allow && geo && gfx.createChunkedMesh) {
            geo._keepPositions = true;
            track.meshes[key] = gfx.createChunkedMesh(geo, 72);
          }
        }
        const ch = track.meshes[key];
        if (ch && ch.chunks) gfx.castShadowChunked(ch, MAT_IDENT);
        else gfx.castShadow(plain, MAT_IDENT);
      };
      _castRibbonSh(track.terrainGeo, "terrainChunked", track.meshes.terrain);
      _castRibbonSh(track.roadGeo, "roadChunked", track.meshes.road, gfx.chunkedTrackCoords !== false);
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
      const _shKey = _shKeyG;   // hoisted above; same expression, one source
      // Clear-night moon shadows re-open the gate: props must be in the map for
      // the moonlight floor to have anything to cast (snap-cached, so the night
      // saving only goes when MOON SHADOWS is active and the sky is clear — or,
      // above 0.5, the knob itself forces the gate open regardless of weather;
      // see frame.moonGate above).
      if (_shKey > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01)) {
        gfx.castShadowChunked(track.meshes.props, MAT_IDENT);
        // Cull instanced props to the light ortho before cast — same frustum
        // castShadowChunked already uses (shadowCullVP || sun lightVP).
        _castPropBatchesShadow(true);
      }
      gfx.shadowEnd();
    }
    // Dynamic CAR shadow pass — every frame (cars move, so they can't live in
    // the snap-cached static map above; that's why cars only had blob shadows).
    // AI casts use the preceding frame's pooled transforms; the player is
    // rebuilt above from the current interpolation state. Reusing its old matrix
    // trailed the shadow by speed × frame time (6–12 m on low-FPS devices).
    // ±42 m box (at the default 80 m SHADOW DISTANCE — a car shadow beyond that
    // is sub-pixel) on the same gliding anchor, scaled proportionally with
    // SHADOW DISTANCE above its default so the slider also reaches the car's
    // own shadow, same depth program and key-luminance gate as the props above.
    // WGX mobile tiers may no-op the pass (blob fallback); menu/select skip
    // because the car loop doesn't run and its pooled AI matrices would be
    // stale race positions.
    // Car shadow pass: skip odd frames at low speed — the 1024² map persists
    // one frame and parked/slow driving does not need 60 Hz updates.
    const _carSpd = player ? Math.abs(player.speed) : 0;
    const _carShadowFrame = (_frameNo & 1) === 0 || vStd(_carSpd) > 0.15;
    if (gfx.carShadowBegin && LT.carShadow && PerfGov.tier() < 3 && _carShadowFrame &&
        (_hasLivePlayerShadow || _shadowCount > 0) && player && state !== "menu") {
      const _ck = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
      // Same clear-night MOON SHADOWS relaxation as the prop gate above: with
      // the moonlight floor (or the knob's above-0.5 override) active, cars
      // keep casting so they throw faint moon shadows too instead of popping
      // to blob-only.
      if (_ck > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01)) {
        M4.lookAtTo(_mCView,
          [_shadowCtr[0] + sd[0] * 150, _shadowCtr[1] + sd[1] * 150, _shadowCtr[2] + sd[2] * 150],
          _shadowCtr, up);
        const cBox = 42 * Math.max(1, sBox / 80);
        M4.orthoTo(_mCProj, -cBox, cBox, -cBox, cBox, 1.0, 320);
        M4.mulTo(_mCVP, _mCProj, _mCView);
        // The depth-comparison bias baked into lit.js's biasTerm was tuned for the
        // map's texel size at the DEFAULT ±42m box; cBox growing with SHADOW DISTANCE
        // grows the car map's real-world texel size at the same fixed 1024² resolution,
        // so the bias needs to grow proportionally or the car self-shadows into acne
        // (uCarBiasScale, applied in lit.js). cBox/42 == 1 at the default, matching the
        // originally-tuned bias exactly.
        gfx.carShadowBegin(_mCVP, cBox / 42);
        if (_hasLivePlayerShadow) gfx.castShadow(teamMesh(player.team), _livePlayerShadowMat);
        // Skip casters that CANNOT reach the shadow volume. gfx.castShadow does
        // no culling of its own (js/render/glx/shadow.js): it binds the VAO,
        // uploads uModel and draws, ~11k verts per car, so a caster outside the
        // volume costs a full mesh for zero texels — and at night the field pays
        // it twice, once here and once in the lamp pass.
        //
        // The radius is the volume's CORNER distance, not cBox. The ortho above
        // is ±cBox PERPENDICULAR to the sun, but spans depth 1..320 from an eye
        // at _shadowCtr + sd*150 — so it reaches ~170 m along the sun axis. A
        // car far away but nearly aligned with the sun has a small perpendicular
        // offset, and at a low sun its stretched shadow legitimately lands in
        // frame; culling at cBox would delete exactly those. hypot(cBox, 170) is
        // the furthest any point of the box can be from the anchor, so beyond it
        // a caster is provably outside — no visible change, only skipped draws.
        const _csR = Math.hypot(cBox, 170) + 8;   // +8: car length + mesh extent
        const _csR2 = _csR * _csR;
        for (let i = 0; i < _shadowCount; i++) {
          const _sm2 = _shadowMats[i];
          const _sdx = _sm2[12] - _shadowCtr[0], _sdz = _sm2[14] - _shadowCtr[2];
          if (_sdx * _sdx + _sdz * _sdz > _csR2) continue;
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
  frame.allLights = null; frame.perChunkLights = 0; frame.roadChunkLamps = 0; frame.tailStart = 0; frame.tailCount = 0;
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
    // RESOLVED BEFORE setFrameLights, not after: setFrameLights now builds the
    // scaled full-set for the per-chunk path, and it can only know to do that
    // if the resolved value is already on the frame. The field is cleared every
    // frame above, so reading it there before this ran always saw 0.
    frame.perChunkLights = (!gfx.hasPerChunkLights || _perChunkOff || PerfGov.tier() >= 1) ? 0 : (+LT.perChunkLights || 0);
    frame.roadChunkLamps = (frame.perChunkLights > 0 && LT.roadChunkLamps) ? 1 : 0;
    setFrameLights(camEye, _floodRGB, _lightFwd);
    // PER-CHUNK LAMPS (experimental): hand the renderer the FULL baked lamp list
    // alongside the globally-culled frame.lights, so GLXChunked can bind each
    // chunk its own nearest-24 instead of every chunk sharing this one set.
    // frame.lights stays authoritative for the car and everything non-chunked.
    // setFrameLights fills frame.allLights with the SCALED full set whenever
    // per-chunk lamps are on (so every LAMPS control reaches chunked geometry).
    // Off, nothing consumes it — leave it null rather than handing out the raw
    // baked list, which is what used to make the sliders look broken.
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
    // MEASURED, by accident, 2026-08-14: every camera mode rendered 20 frames
    // in seconds, then cockpit + night + perChunkLights=1 held 380% CPU for 22
    // MINUTES on 40 frames in the same harness. On real hardware a frame that
    // cannot finish inside the driver's watchdog is a GPU reset — context lost,
    // page dead, which a player reports as a crash rather than as slowness.
    // (Distinct from the merged-draw watchdog theory considered and dismissed
    // earlier: that was ONE large draw, single-digit ms. This is sustained
    // per-fragment cost across the whole frame.)
    //
    // Composes with the crash sentinel in js/game/perf.js: a player who has
    // already hit a hard failure comes back at a floored tier, which now has
    // the feature off, so the sentinel can actually rescue this case instead of
    // watching it repeat.
    // (frame.perChunkLights and frame.roadChunkLamps are resolved above, before
    // setFrameLights — PER-CHUNK ROAD keeps the road on the global lamp set
    // while it still culls by chunk.)
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
      setFrameLights(camEye, [_al, _al, _al], _lightFwd, track._alwaysLights);
    } else frame.lights = null;
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
  // the lamp frustum (barriers, grandstands, buildings). Desktop only — all
  // three backends expose lampShadowBegin; the mobile tier never creates the map.
  if (gfx.lampShadowBegin && LT.lampShadow && PerfGov.tier() < 2 && frame.lights && !_studioRig &&
      player && state !== "menu") {
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
        // Snap: 12 m eye cell + same flood index → keep previous lamp map
        // (props are static for that cell; AI cars already one-frame lag).
        const _lsx = Math.round(camEye[0] / 12), _lsz = Math.round(camEye[2] / 12);
        if (flBest === _lampShBest && _lsx === _lampShSX && _lsz === _lampShSZ) {
          // Map from last rebuild still bound; skip the 512² props pass.
        } else if ((_frameNo & 1) !== 0 && flBest === _lampShBest) {
          // Defer a cell-only rebuild one frame — props are static; the prior
          // map stays valid while the eye crosses a 12 m snap cell.
        } else {
        _lampShBest = flBest; _lampShSX = _lsx; _lampShSZ = _lsz;
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
        // Distance-cull the casters, the twin of the sun pass's _csR above — the
        // comment there notes the field pays the caster cost TWICE at night, and
        // this is the second half. Only 1-3 cars are ever under a lamp, so this
        // skips ~18-20 full ~11k-vert car meshes per night frame.
        //
        // The bound is the LAMP RADIUS, and the argument is not the frustum (a
        // 149-degree cone's far corners reach ~5x its far plane) but the light
        // itself: shadow rays travel outward from the lamp, so a caster at
        // distance D can only occlude receivers at distance > D. Both readers of
        // this map reject beyond rad — the lit shader's lamp loop
        // (`if (d2 > rad*rad) continue`) and the god-ray beam march — so a
        // caster beyond rad occludes only fragments that already receive zero
        // light from this lamp. +8 covers the car's own half-extent, so a car
        // whose CENTRE clears the bound has no vertex inside rad.
        const _lsR = rad + 8, _lsR2 = _lsR * _lsR;
        for (let i = 0; i < _shadowCount; i++) {
          const _lm = _shadowMats[i];
          const _ldx = _lm[12] - L[o], _ldy = _lm[13] - L[o + 1], _ldz = _lm[14] - L[o + 2];
          if (_ldx * _ldx + _ldy * _ldy + _ldz * _ldz > _lsR2) continue;
          if (_shadowCars[i] !== player) gfx.castShadow(teamMesh(_shadowTeams[i]), _shadowMats[i]);
        }
        gfx.castShadowChunked(track.meshes.props, MAT_IDENT);
        // Lamp pass: cull against the lamp perspective frustum (castCullVP).
        _castPropBatchesShadow(false);
        gfx.lampShadowEnd();
        } // end lamp-shadow snap rebuild
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
  const _floodEmit = Math.min(1, LT.floodEmitMul * (   // min(1): lit.js mix() EXTRAPOLATES past 1
    (raceTimeOfDay === "night" || (raceTimeOfDay === "default" && track.def.night)) ? 0.78
      : (raceTimeOfDay === "dusk" || raceTimeOfDay === "dawn")
        ? Math.min(0.70, 0.05 + 0.58 * Math.max(0.30, clamp(1 - _sunY * 6, 0, 1)))
        : 0));
  _lastFloodEmit = _floodEmit;   // exposed via __apex.lightState()
  frameSky.lightning = _ltFlash || 0;
  // ── Live env probe: render ONE 64px cubemap face of the world around the
  // player car every fourth frame on a live race (full refresh every 24 frames). The car-paint clearcoat
  // samples it for REAL reflections of the surroundings — trees, buildings,
  // track, sky — including everything behind the camera that SSR can't see.
  // CAR tuner ENV REFLECTION (carEnvCube) = 0 skips the pass entirely.
  // Skip it under a free/debug camera (dbgCam): the probe re-draws the whole world
  // a second time each frame and is anchored to the player car, which isn't the
  // subject while flying the lighting-tuner free camera — dropping it here removes
  // the biggest per-frame load multiplier during the exact mode that OOM-crashes.
  // Advance one face every FOURTH frame on a live race — a full 6-face cube
  // cycle then takes 24 frames instead of 6, cutting the probe's whole-world
  // re-draw cost by ~75% (imperceptible on a 64px blurred reflection probe).
  // park() freezes physics for shots/tests — then one face per frame so a
  // parked M9 cube goes ready in 6 presents, not 24 (SwiftShader is
  // seconds-per-frame).
  if (player && !_envProbeOff && PerfGov.tier() < 1 && !paused && !dbgCam && (frozen || (_frameNo & 3) === 0) && gfx.envFaceBegin && LT.carEnvCube > 0.001 && !hideMeshes.cars) {
    _envFace = (_envFace + 1) % 6;
    Tracks.sample(track, player.s, smp2);
    const _pex = smp2.p[0] + smp2.r[0] * player.x,
          _pez = smp2.p[2] + smp2.r[2] * player.x;
    const _envInv = gfx.envFaceBegin(_envFace, [_pex, smp2.p[1] + 0.9, _pez], frame);
    if (_envInv) {
      frameSky.invViewProj = _envInv;
      // Same early-Z order as the main camera (opaque → sky). The 64² face
      // is ~200× smaller, but the sky still filled every pixel the world
      // then overwrote. Glow stays off on the probe (`false` below).
      drawWorldMeshes(frame, night, wet, _floodEmit, false);
      gfx.drawSky(frameSky);
      gfx.envFaceEnd(_envFace);
    }
  } else if (PerfGov.tier() >= 1 && gfx.envProbeReady && gfx.envProbeReady()) gfx.envProbeReset();   // tier 1 sheds the PRODUCER, but envReady LATCHES — without this the paint mirrors a frozen cube. See glx.js envProbeReset.
  let _b;
  if (dbgCam) {
    const bf = frame.fogDensity;
    frame.fogDensity = bf * (dbgCam.fog != null ? dbgCam.fog : 0.15);
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
  if (frame.lights && !_studioRig && PerfGov.tier() < 3) gfx.drawGlow(frame.lights, LT.glareStr);

  // skid marks — one batched draw for the whole live trail (rebuilt only when a
  // mark is added/evicted). Was up to 120 per-mark draws every frame once the
  // ring buffer filled. Falls back to per-mark draws if the batch path is
  // unavailable (older GPU where the batch program failed to link).
  skids.draw(gfx, camEye);

  // cars — skip AI cars more than 550 m of track arc from the player (past fog)
  // Cockpit view doesn't draw the car you're sitting in: a first-person RIG
  // (wheel/halo/mirrors) + the car's shadow instead, body mesh skipped. Was two
  // always-equal booleans, so the `hide && !rig` skip they guarded never fired.
  const cockpitRigOnly = !dbgCam && (state === "race" || state === "count") && CAM_MODES[camMode].id === "cockpit";
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
  _shadowCount = 0;   // accumulate car shadows, flush in one batch after the loop
  _decalCount = 0;    // accumulate car decals, flush in one batch after the loop
  for (const c of cars) {
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
    const rp = renderPosOf(c, cS, renderX);
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
      // (no mirrors). Near-eye: origin within ~3.4 m fills the near plane — skip.
      // Local player is never culled. Y without bank is fine for the near-eye test.
      // Side frustum is applied AFTER the car is queued for the shadow map —
      // a rival just off a ~60° chase FOV can still throw a sun/car shadow
      // onto the visible road (the car map is a ±42 m ortho around the player).
      if (!c.isPlayer) {
        const dx = tmpP[0] - camEye[0], dz = tmpP[2] - camEye[2];
        if (dx * _camFwdX + dz * _camFwdZ < -6) continue;   // 6 m grace behind the eye
        const dy = tmpP[1] - camEye[1];
        if (dx * dx + dy * dy + dz * dz < 3.4 * 3.4) continue;
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
    // ygV = speed × road slope (smp2.t normalized above): the ground's vertical
    // velocity under the car, analytic — bodyattitude never differentiates height.
    const _ba = bodyAttitude.update(c, tmpP[1], dt, (c.speed || 0) * smp2.t[1], aeroDfMult(c) * Math.min(1, Math.abs(c.speed || 0) / vTop()) ** 2);
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
    // Side frustum: 8 m sphere, same planes as propBatches. After the
    // shadow enqueue so an off-camera rival still casts. Player never culled.
    if (!c.isPlayer && _carCullPlanes) {
      const x = tmpP[0], y = tmpP[1], z = tmpP[2], r = 8;
      let _out = false;
      for (let i = 0; i < 6; i++) {
        const p = _carCullPlanes[i];
        if (p[0] * x + p[1] * y + p[2] * z + p[3] < -r) { _out = true; break; }
      }
      if (_out) continue;
    }
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
    // ~4° of climb that closes the proven 0.46 m eye-to-fascia gap past the 0.3 m
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
    // Body-only mesh + planted wheels for every procedural car. Attitude
    // (tmpMat) is chassis-only; wheels stay on _groundMat. A glb is one piece.
    const body = carModelBuf ? null : (c.isPlayer ? playerBodyMesh(c.team) : teamBodyMesh(c.team));
    if (body) {
      gfx.draw(body, tmpMat, paint);
      queueCarDecals(c.team, tmpMat, carDecalNum(c.team, c), false, c.isPlayer);
      _wheelOpts.emissive = night ? 0.12 : 0;
      drawPlayerWheels(c, _groundMat, dt, _wheelOpts);
    } else {
      const wholeCarMat = c.isPlayer ? _groundMat : tmpMat;
      gfx.draw(teamMesh(c.team), wholeCarMat, paint);
      queueCarDecals(c.team, wholeCarMat, carDecalNum(c.team, c), false, c.isPlayer);
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
    // Distance-gated for RIVALS, exactly as the brake rings above are and for
    // the same reason — a wing element is ~1 m x 0.15 m, and 4 flaps x 21 AI is
    // ~84 draws a frame, every one a VAO bind + drawElements (each flap is its
    // own mesh, so the bind never hits the cache). The cue this exists to sell
    // is the car AHEAD of you opening its wings, not one two straights away.
    // 150 m is deliberately generous next to the rings' 40 m: the rings are a
    // glow that genuinely goes sub-pixel, whereas a rear wing swinging is still
    // legible at distance. The player is never gated — it is the car you are
    // looking at.
    if (!carModelBuf) {
      let drawFlaps = true;
      if (!c.isPlayer) {
        const fdx = tmpP[0] - camEye[0], fdy = tmpP[1] - camEye[1], fdz = tmpP[2] - camEye[2];
        drawFlaps = fdx * fdx + fdy * fdy + fdz * fdz < 150 * 150;
      }
      if (drawFlaps) {
        const aSt = teamDecalState(c.team, c.isPlayer);
        drawAeroFlaps(c.team, aSt.val, c.aeroX || 0, tmpMat, paint, aSt.aero);
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
      // Rivals: 40 m gate like brake rings. Player always draws.
      const ldx = tmpP[0] - camEye[0], ldy = tmpP[1] - camEye[1], ldz = tmpP[2] - camEye[2];
      if (c.isPlayer || ldx * ldx + ldy * ldy + ldz * ldz < 40 * 40) {
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
      skids.stamp(tmpMat, (skid > 0.25 || c.offroad) && c.speed > 10);
    }
    // ── Transient particle FX emitters (visual-only: they READ car state and
    // write none of it, so headless physics is untouched). They live HERE
    // because the car's world basis (tmpMat / tmpP / tmpF / tmpR) is already
    // computed. Emission is rate-gated with Math.random() < rate·dt so it is
    // framerate-independent; far cars are skipped (sub-pixel puffs would only
    // starve the shared pool).
    if (state !== "menu") {
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
        // wheelspin (hard accel at crawling speed; peak engine ax is ~7 m/s² on
        // the STANDARD scale, so the 4.5 floor only fires on genuine
        // full-throttle getaways). aStd, not a bare c.axEstSm: PACE multiplies
        // the accel curve, so at pace 0.5 the peak is 3.5 m/s² and a raw 4.5
        // floor is unreachable — the effect simply did not exist at the bottom
        // of the OVERALL SPEED slider (A16).
        let smokeI = (c.isPlayer && !c.offroad) ? (c.skidIntensity || 0) : 0;
        if (c.isPlayer && !c.offroad) {
          const _pax = c.axEstSm || 0, _pvl = Math.abs(c.vLat || 0);
          if (c.speed > 10) smokeI = Math.max(smokeI, clamp((_pvl - 3) / 5, 0, 1));
          if (c.speed > 0.5 && c.speed < 12)
            smokeI = Math.max(smokeI, clamp((aStd(_pax) - 4.5) / 2.5, 0, 1) * clamp((12 - c.speed) / 9, 0, 1));
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
        // vStd on BOTH halves: 15 and the /45 span describe a fraction of the
        // car's envelope (spray starts at ~21 % of top speed and is full at
        // ~83 %), so fed a raw ground speed they moved with the OVERALL SPEED
        // slider — at pace 0.5 the strength could never exceed (36-15)/45 = 0.47
        // and full spray was unreachable, at pace 1.3 it was pinned at 1 down
        // every straight. The particle VELOCITY below stays real m/s: it is
        // world-space motion, not a threshold (A16).
        if (wet && vStd(c.speed) > 15) {
          const str = clamp((vStd(c.speed) - 15) / 45, 0, 1) * (raceWeather === "rain" ? 1 : 0.6);
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
      gfx.draw(teamMesh(player.team), tmpMat, _ghostOpts);
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
  // FADE the horizon cutoff, don't step it: the old `_grSunY > 0.02 ? … : 0`
  // switched the pass off from 2.26x its own midday strength, so one 0.1-deg
  // notch of SUN ELEVATION deleted full shafts in a frame. Still 0 below.
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
  const _spd = LT.speedBlur > 0 ? LT.speedBlur * clamp((((player && player.speed) || 0) / vTop() - 0.4) / 0.5, 0, 1) : 0;
  const po = _presentOpts;
  // Bloom joins the last MEASURED shed (autoTier, not GRAPHICS: LOW): bloomAmt
  // 0 skips the ~9-pass bright+mip chain — the biggest post-chain saving left
  // after env/SSR/shadows. Look post stays live for the lighting tuner.
  po.exposure = frame.exposure * LT.exposureMul; po.bloom = PerfGov.autoTier() >= 4 ? 0 : _bloom * LT.bloomMul;
  po.threshold = clamp(_thresh + LT.threshOff, 0.4, 1.2); po.grade = _grade;
  // Feature-shedding tiers (see perfGovernor): resolution scaling can't rescue
  // passes whose cost doesn't shrink with the render target, so a device still
  // slow at the scale floor sheds those instead. Tier 2 (user+auto) drops SSR;
  // autoTier 4 drops SSAO (+2 blurs) and god-ray — not GRAPHICS: LOW alone.
  po.ssao = PerfGov.autoTier() >= 4 ? 0 : _ao;
  po.godray = PerfGov.autoTier() >= 4 ? 0 : _gr;
  // lampVol sheds at tier 4 with its god-ray siblings: haveGR is `sunGR || lampVol > 0`, so leaving it set kept the whole march alive past po.godray = 0.
  // contact is the SSAO half of exactly that bug, missed when lampVol's was fixed:
  // haveAO is `aoStr > 0 || contactStr > 0`, so a tier-4 DAYTIME frame (_cs is
  // non-zero whenever the key is bright) still ran the SSAO pass and both of its
  // blurs after po.ssao had already gone to 0. Shedding contact shadows is what
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
  // Re-arm around the first world present so a jetsam mid-frame still reverts.
  // Title already disarmed after bind; this window is only the first flyby/race.
  if (!_backendProved) {
    try { const p = localStorage.getItem("apex26.gfxBackend");
      if (p === "three" || p === "webgpu") localStorage.setItem("apex26.gfxBackendProbe", p); }
    catch (_) { /* no probe: first-frame jetsam will not auto-revert */ }
  }
  gfx.present(po);
  // Boot canary disarmed — a real world frame landed, so the next boot keeps it.
  if (!_backendProved) { _backendProved = true; try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* nothing was armed if storage is blocked */ } }
  if (isWetRoad() && Particles.rainActive()) {
    // Falling-streak precipitation, identical in every camera: full storm
    // streaks when raining, the sparse DRIZZLE tier when merely WET (the
    // storm flag below picks which). Open-cockpit cars have no windscreen,
    // so onboard views get the same streaks as the chase cam — no
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
  try { tickBody(now); requestAnimationFrame(tick); }
  catch (e) {
    // Report the REAL error once (cross-origin window.onerror shows only a bare
    // "Script error."). A deterministic fault stops instead of repeating at 60 Hz.
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
  Input.poll(); BrakeCue.tick();   // pad + brake-cue; before pause so Start can un-pause
  // Multiplayer runs BEFORE the paused gate, and the gate below lets it through,
  // because a shared world cannot be stopped by one player opening a menu: the
  // rival keeps driving whatever this screen is doing. Inert solo.
  netPlay.tick(now);
  if (paused && !netPlay.active()) {
    // Nothing downstream reads the pad's edge latches while we are parked here,
    // so drop them rather than let a pause-menu button-mash queue up and fire
    // in one burst on the first frame after RESUME (see Input.clearEdges).
    Input.clearEdges();
    // LIGHTING / CAMERA TUNER live preview: keep RENDERING (physics stays
    // paused) while either panel is open so every slider change shows on the
    // held frame — a camera angle is unjudgeable on a frozen picture.
    // THIS IS THE ONLY updatePhotoCam CALL SITE, and that is on purpose: the
    // free camera is a sub-mode OF the tuner, only reachable from it, and the
    // tuner is only reachable from the pause menu. Resuming tears it down
    // (setPaused -> closeLightTuner -> exitPhotoMode), so there is no unpaused
    // state in which it should still be flying.
    if ((state === "race" || state === "count") && (!els.lighting.hidden || !els.camtune.hidden)) {
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
  GameAudio.setEnabled(soundOn);
  GameAudio.setMusicEnabled(musicEnabled);
  // Tilt permission is requested at race start (rs-go click), not here — so the
  // gyro prompt and button fallback don't appear on the title screen.
  if (soundOn) { GameAudio.init(); GameAudio.startMusic(-1); }
}
let gestured = false;
document.addEventListener("pointerdown", () => {
  if (gestured) return; gestured = true; firstGesture();
}, { once: false, capture: true });


// UI SIZE / HUD SIZE + RESOLUTION live in js/game/ui-scale.js (UiScale.create(G)
// — wired after Menus). Bug-explaining comments moved with the block.

// RENDERER cycle lives in js/game/gfx-quality.js with GRAPHICS — wired at
// DOMContentLoaded so SETTINGS shows it during (and after) a deferred backend load.

// GRAPHICS presets + RENDERER cycle live in js/game/gfx-quality.js — it owns
// #pm-gfx and #pm-renderer for EVERY device, and wires the preset's tier floor
// into PerfGov.
// It self-inits at DOMContentLoaded, so there is nothing to call from here.


$("mb-race").onclick = () => {
  setFlow("gp"); session = "race";
  restoreFreePlaySelection();
  buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
// Optional markup must not turn one missing screen into a whole-app boot failure.
if ($("mb-vs")) $("mb-vs").onclick = () => {
  // The peer-to-peer lobby starts the race once both sides agree.
  setFlow("gp"); session = "race";
  restoreFreePlaySelection();
  netLobby.open();
  if (soundOn) GameAudio.uiSelect();
};
$("mb-tt").onclick = () => {
  setFlow("gp"); session = "tt";
  restoreFreePlaySelection();
  buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
$("mb-season").onclick = () => {
  setFlow("season"); session = "race";
  // Replace any career alias with the repaired standalone save; finished stays readable.
  season = SeasonCal.resume(store.get("season", null));
  store.set("season", season);
  // Finished championship: trackIndex(rounds()) is -1 — park the flyby on the
  // last raced circuit instead of crashing loadTrack.
  let ti = SeasonCal.trackIndex(season.round);
  if (ti < 0) {
    const last = SeasonCal.rounds() - 1;
    ti = last >= 0 ? SeasonCal.trackIndex(last) : 0;
  }
  trackIdx = ti;
  buildSelect();
  vt(() => { els.overlay.hidden = true; els.select.hidden = false; });
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
};
// Career's calendar is fixed, so its hub replaces the circuit picker.
function openCareer() {
  setFlow("career"); session = "race";
  const c = Career.data() || Career.load();
  if (c) {
    season = c.season;               // the SAME object — see endRace()
    trackIdx = Career.trackIndex();
    // Point the shared car UI at the contract without overwriting GP preferences.
    const ti = Teams.LIST.findIndex((t) => t.id === c.team);
    if (ti >= 0) teamIdx = ti;
    driverIdx = c.seat;
    recomputePlayerMods();
  }
  careerUi.openHub();
  els.overlay.hidden = true;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
}
// The same entry, stopping at the slot picker. Deliberately does NOT engage the
// career flow: nothing has been chosen yet, so a save's rules must not be live —
// the picker's own handler calls openCareer() once a slot is taken.
function openCareerSlots() {
  careerUi.openSlots();
  els.overlay.hidden = true;
  if (soundOn) GameAudio.uiSelect();
  scheduleFlybyTrack();
}
// The title-screen button reads CONTINUE once a career exists, so the player can
// tell at a glance whether pressing it resumes or starts something.
function refreshCareerButton() {
  seasonUi.refreshTitle();
  const btn = $("mb-career");
  if (!btn) return;
  const c = Career.data() || Career.load();
  const label = btn.querySelector(".mb-label");
  const used = Career.slots().filter((s) => s.used).length;
  // ONE door, always the same words. It used to read CONTINUE CAREER once
  // anything was saved and go straight into that save — which meant a player
  // with one driver career had no way in to MY TEAM, to their other saves, or to
  // the delete that makes room. The button opens the modes screen now, and the
  // line under it says what is behind it.
  if (label) label.textContent = "CAREER MODES";
  // The second line says WHICH career, because with up to three saved,
  // "CONTINUE" on its own does not answer the only question that matters. Blank
  // when there is nothing to continue — #mb-career-sub:empty collapses, so a first-time
  // title screen is unchanged.
  const sub = $("mb-career-sub");
  if (!sub) return;
  if (!c) { sub.textContent = "DRIVER CAREER  ·  MY TEAM"; return; }
  const team = Teams.LIST.find((t) => t.id === c.team);
  const who = c.flavour === "myteam" ? "MY TEAM" : (c.driver ? c.driver.code : "YOU");
  sub.textContent = who + " · " + (team ? team.name : c.team).toUpperCase()
    + " · " + c.year + " R" + Math.min(c.season.round + 1, Tracks.SEASON.length)
    + (used > 1 ? "  ·  " + used + " SAVED" : "");
}
$("mb-career").onclick = () => openCareerSlots();
$("mb-standings").onclick = () => { buildStandings(); $("standings").hidden = false; if (soundOn) GameAudio.uiSelect(); };
$("standings-close").onclick = () => { $("standings").hidden = true; };
$("mb-data").onclick = () => { DataHub.open(); if (soundOn) GameAudio.uiSelect(); };
$("mb-help").onclick = () => { els.howtoplay.hidden = false; };
// Same sheet from the pause menu's SETTINGS page — the controls reference is
// most wanted mid-session, not on the title screen. #howtoplay outranks
// #pmsettings in z-index, so it lays over the settings menu and DONE returns
// there with nothing else to restore.
$("pm-howto").onclick = () => { els.howtoplay.hidden = false; if (soundOn) GameAudio.uiSelect(); };
$("htp-close").onclick = () => {
  els.howtoplay.hidden = true; const fromRotate = document.body.classList.contains("rotate-help-open");
  document.body.classList.remove("rotate-help-open"); if (fromRotate) syncRotateBlocker(true);
};
$("rotate-controls").onclick = () => {
  setPaused(true); document.body.classList.add("rotate-help-open");
  syncRotateBlocker(false); els.howtoplay.hidden = false;
  const close = $("htp-close"); if (close) close.focus();
};
$("rotate-exit").onclick = () => quitToMenu();
// Team picker: opened by the garage's TEAM & DRIVER tab (js/game/setup-ui.js).
// Closing without choosing leaves the current team as-is. Nothing to rebuild —
// the garage is still underneath, unchanged.
$("tp-close").onclick = () => { $("teampicker").hidden = true; };
// BACK + the tappable circuit preview. Both lookups existed in `els` but no
// handler was ever attached on this branch — the select screen's BACK button
// was simply dead (surfaced by the button-walk audit; the wiring lived on an
// unmerged branch).
els.selBack.onclick = () => {
  vt(() => {
    els.select.hidden = true;
    if (netRoom) $("vsfriend").hidden = false; else els.overlay.hidden = false;
  });
  if (soundOn) GameAudio.uiSelect();
};
// The button wrapper carries the semantics now (focusable, labelled); the
// chip is the same door on tiny sheets where the canvas is display:none.
$("sel-map-btn").onclick = openTrackDetail;
$("sel-detail-chip").onclick = openTrackDetail;
$("track-detail-close").onclick = closeTrackDetail;
// ── SETTINGS sub-menu ── keeps the pause screen down to RESUME/RESTART/QUIT;
// every tuning + toggle control lives on this page. Opening it hides the pause
// menu (one panel at a time); BACK (or resume) returns to it.
// Some settings only mean anything with a race on screen: HIDE HUD toggles a
// HUD that does not exist yet (and the state would carry into the next race,
// which starts with no HUD and no clue why), and both tuners preview a scene
// that is not being rendered. Disabled rather than hidden — the same rule the
// mode-dependent driving controls follow, so the grid never reflows under a
// thumb mid-tap.
const settingsNav = SettingsNav.create(store, () => { if (soundOn) GameAudio.uiSelect(); });
function syncSettingsAvailability() {
  const inRace = state === "race";
  $("pm-hidehud").disabled = !inRace;
  $("pm-lighting").disabled = !inRace;
  $("pm-camtune").disabled = !inRace;
}
function openSettings() {
  syncSettingsAvailability(); settingsNav.showCurrent();
  els.pmsettings.hidden = false; els.pausemenu.hidden = true;
}
function closeSettings() { els.pmsettings.hidden = true; if (paused) els.pausemenu.hidden = false; syncRotateBlocker(false); }
$("pm-settings").onclick = openSettings;
$("pm-settings-close").onclick = closeSettings;
// The same settings screen from the TITLE menu, so steering, audio and the
// tuners are reachable without starting a race first. closeSettings() already
// only returns to the pause menu when actually paused, so from here it just
// closes back to the title.
$("mb-settings").onclick = () => { if (soundOn) GameAudio.init(); settingsNav.show("more", false); openSettings(); };
// Advanced steering: opened from the settings menu, closes back to it.
$("pm-advanced").onclick = () => { $("advanced").hidden = false; };
$("adv-close").onclick = () => { $("advanced").hidden = true; };
// ── LIGHTING TUNER ── opened from the settings sub-menu; that menu hides while
// it's open so the live preview is unobstructed (tick() keeps render() running
// with physics paused), and DONE returns to it. Rows are generated
// once from TUNE_DEFS; values persist via localStorage (apex26.lightTune).
// The LIGHTING TUNER panel UI lives in js/game/tuner.js
// (TunerPanel.create(G) — wired after the G façade).

// ---------- pre-race screens ----------
// RACE SETTINGS, QUALIFYING, CUSTOM TEAM and the GARAGE wiring. Everything from
// here to the button wiring below is screen flow, not simulation.
//
// This banner used to read "Photo mode (free-fly camera)" and had done since
// photo mode was extracted to js/game/photomode.js — ~780 lines of unrelated
// screen code sitting under a heading naming a file that no longer holds any of
// it. A section banner is the only navigation this file has; one that lies is
// worse than none.

function buildRaceSettings() {
  // In the room this screen confirms the host's choice and hands it to the
  // other player — it does not drop the lights. A button saying RACE! there is
  // a lie about what the next tap does.
  $("rs-go").textContent = netRoom ? "CONFIRM" : "RACE!";
  // TT list includes 4 because TT_LAPS = 4 is the openRaceSettings default —
  // without it the screen opened with no LAPS chip highlighted.
  // FULL is this CIRCUIT's grand prix distance (def.gpLaps — the real
  // regulation, derived in js/track/tracks.js), not a flat 57 offered on all
  // forty. Monaco is 78 laps and Spa is 44; one number could only ever be right
  // for one of them, and 57 was not right for either. Filtered so the ladder
  // stays strictly increasing on a short circuit-free layout.
  const full = (Tracks.LIST[trackIdx] && Tracks.LIST[trackIdx].gpLaps) || 57;
  const lapOpts = isTimeTrial() ? [3, 4, 5, 8]
                                : [3, 5, 10, 25].filter((n) => n < full).concat(full);
  // FULL now MOVES with the circuit, so a selection made at Monaco (78) is off
  // the ladder at Spa (44) and would leave no chip lit — the same defect the
  // TT comment above records. Clamp instead of silently deselecting.
  if (!isTimeTrial() && raceLaps > full) raceLaps = full;
  const lapsEl = $("rs-laps");
  lapsEl.innerHTML = "";
  for (const n of lapOpts) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (raceLaps === n ? " active" : "");
    b.textContent = !isTimeTrial() && n === full ? full + " (FULL)" : String(n);
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
  // RELIABILITY — same idiom, same persistence, and hidden alongside DIFFICULTY
  // in a time trial for the same reason: neither has anything to act on there.
  // (ACTIVE AERO used to sit here. It is a CONTROL preference, not a property of
  // the event, so it lives in pause > SETTINGS > DRIVING next to GEARS — where
  // it can also be changed mid-race, which is when a player discovers they want
  // it. See refreshAeroBtn.)
  // Hidden in a time trial (no grid). A championship weekend decides the grid,
  // so the chips go away and the label carries ON/OFF — dead chips looked live
  // enough to tap and did nothing. Qualifying IS offered in a friend race.
  const champ = isChampionship();
  $("rs-quali-section").hidden = isTimeTrial();
  const qEl = $("rs-quali");
  qEl.innerHTML = "";
  const qForced = champ ? SeasonCal.quali() : null;
  $("rs-quali-label").textContent = "QUALIFYING LAP" + (qForced == null ? "" : " · " + (qForced ? "ON" : "OFF"));
  qEl.hidden = qForced != null;
  if (qForced == null) for (const [on, label] of [[false, "OFF"], [true, "ON"]]) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (raceQuali === on ? " active" : "");
    b.setAttribute("aria-pressed", raceQuali === on ? "true" : "false");
    b.textContent = label;
    b.onclick = () => {
      raceQuali = on; store.set("raceQuali", on);
      buildRaceSettings(); if (soundOn) GameAudio.uiTick();
    };
    qEl.appendChild(b);
  }
  // CAUTIONS — the flag layer. Hidden in a time trial for the same reason
  // RELIABILITY is: alone on an empty track there is nothing to caution.
  $("rs-caution-section").hidden = isTimeTrial();
  const cauEl = $("rs-caution");
  cauEl.innerHTML = "";
  const cautionOn = raceCtl.enabled;
  for (const [on, label] of [[false, "OFF"], [true, "ON"]]) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (cautionOn === on ? " active" : "");
    b.setAttribute("aria-pressed", cautionOn === on ? "true" : "false");
    b.textContent = label;
    b.onclick = () => {
      setCautionEnabled(on);
      buildRaceSettings(); if (soundOn) GameAudio.uiTick();
    };
    cauEl.appendChild(b);
  }
  $("rs-reliab-section").hidden = isTimeTrial();
  const relEl = $("rs-reliab");
  relEl.innerHTML = "";
  for (const [id, label] of [["off", "OFF"], ["low", "LOW"], ["real", "REAL"]]) {
    const b = document.createElement("button");
    b.className = "sel-chip" + (raceReliability === id ? " active" : "");
    b.setAttribute("aria-pressed", raceReliability === id ? "true" : "false");
    b.textContent = label;
    b.onclick = () => {
      raceReliability = id; store.set("reliability", id);
      buildRaceSettings(); if (soundOn) GameAudio.uiTick();
    };
    relEl.appendChild(b);
  }
}

// RACE SETTINGS is reachable from #select and (in career) from #career, so it
// records which screen to restore on cancel — the same return-path pattern
// openGarage(from)/garageReturn uses, and for the same reason: unhiding #select
// unconditionally used to drop the player on the wrong screen.
let rsReturn = "select";
// True while two connected players are sitting in the VS FRIEND waiting room.
// It changes what the TERMINAL action of #select / #race-settings / #carsetup
// means: normally those screens end in a race, but in the room they end by
// returning to the lobby with a choice made. Reusing the real screens is what
// gives the room custom teams, liveries and the parts budget for nothing.
let netRoom = false;
function setNetRoom(on) { netRoom = !!on; }
// The host picking the race: the ordinary #select screen (circuit + team),
// which chains to #race-settings on START and lands back in the lobby.
function openRaceSetup() {
  $("vsfriend").hidden = true;
  buildSelect();
  els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
}
function openRaceSettings(from) {
  rsReturn = from || "select";
  // Defaults on every visit is right when this screen is the last step before
  // a race. In the VS FRIEND room the host may come back to change one thing,
  // and resetting the other three would silently undo choices the guest has
  // already been shown.
  if (!netRoom) {
    // A season's DISTANCE PRESELECTS the chip rather than overriding it: the
    // player can still change this weekend's race from here.
    raceLaps = isTimeTrial() ? TT_LAPS : SeasonCal.formatLaps(GAME_LAPS);
    raceWeather = "dry";
    raceTimeOfDay = "default";
  }
  buildRaceSettings();
  $(rsReturn).hidden = true;
  $("race-settings").hidden = false;
}
els.selGo.onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  if (els.selGo.dataset.seasonComplete === "1") {
    buildStandings(); $("standings").hidden = false; return;
  }
  // Solo flows go through the garage; VS FRIEND owns a separate garage step.
  if (netRoom) { openRaceSettings("select"); return; }
  openGarage("select");
};
$("rs-cancel").onclick = () => {
  $("race-settings").hidden = true;
  $(rsReturn).hidden = false;
};
$("rs-go").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  $("race-settings").hidden = true;
  // In a VS FRIEND waiting room this screen is the host CHOOSING the race, not
  // starting it — the other player is still picking a car, and lights-out is
  // the room's START button. So confirm here and go back, publishing the choice
  // so the guest sees it immediately.
  if (netRoom) {
    $("vsfriend").hidden = false;
    netLobby.roomChanged("race");
    return;
  }
  if (steerMode === "tilt") enableTilt();
  // Championship GO follows qualiNext (sprint GP legs skip a second quali).
  // One-off GO still follows gridFromQuali / the QUALIFYING chip.
  if ((isChampionship() && SeasonCal.qualiNext(season) && !quali.results()) || (!isChampionship() && gridFromQuali() && !quali.results())) openQuali();
  else startRace();
};

// ── qualifying ───────────────────────────────────────────────────────────────
// The sheet opens BEFORE the session with the field already simulated, so the
// player can see what they have to beat and choose whether to drive it or take
// the simulated time. `q-done` flips the foot from DRIVE/SIMULATE to TO THE GRID.
function openQuali(fresh) {
  session = "quali";
  // Reached from race settings this is already "menu"; reached from the results
  // screen it would still say "results". No race is running while the sheet is
  // up, so both paths say the same thing.
  state = "menu";
  quali.clear();
  qualiPeers.clear();
  qualiNetDone = null; qualiLive.clear(); qualiHadRivals = false;   // abandoned friend-race gate — openQualiForNet re-arms it AFTER this
  loadTrack(trackIdx);
  makeCars();
  if (fresh) quali.simulate(0); else quali.begin();
  $("quali").classList.remove("q-done");
  quali.open();
}
function closeQualiToGrid() {
  quali.close();
  session = "race";
  startRace();                    // gridUp() reads quali.order()
}
$("q-drive").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  quali.close();
  session = "quali";
  startRace();                    // one out-lap + one flying lap, alone
};
$("q-sim").onclick = () => {
  if (soundOn) GameAudio.uiSelect();
  // Keep the model's time for us — but a rival who has already driven theirs
  // does not lose it because we could not be bothered to drive ours.
  quali.simulate(qualiDriven(0));
  $("quali").classList.add("q-done");
  quali.build();
  refreshQualiGate();
};
$("q-go").onclick = () => {
  // Guarded as well as disabled: the button is the only way out of this sheet,
  // and a stale enabled state would grid up without the rival's lap.
  if (qualiNetWaiting()) { refreshQualiGate(); return; }
  if (soundOn) GameAudio.uiSelect();
  // In a friend race the lobby, not this handler, builds the race: it still
  // holds the connection and has to hand it to NetPlay once the grid exists.
  if (qualiNetDone) {
    const go = qualiNetDone;
    qualiNetDone = null;
    quali.close();
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
      go.addEventListener("animationend", () => go.classList.remove("budget-reject"), { once: true });
    }
    return;
  }
  if (soundOn) GameAudio.uiSelect();
  quali.close();
  quali.clear();          // nothing was run; the next visit draws its own sheet
  session = "race";
  qualiNetDone ? (qualiNetDone = null, qualiHadRivals = false, qualiPeers.clear(), qualiLive.clear(), netLobby.abortQuali()) : ($("race-settings").hidden = false);
};

// ---- customize my team ----
// Optional extra-paint rows: DOM colour-input id -> livery key. Saved onto the
// custom team as ct.livery, which Liveries.forTeam folds into its default paint.
const CZ_LIV_FIELDS = [
  ["cz-stripe", "stripe"], ["cz-nosestripe", "noseStripe"], ["cz-detail", "accent"],
  ["cz-nose", "nose"], ["cz-pod", "pod"], ["cz-wing", "wing"],
  ["cz-fin", "fin"], ["cz-finart", "finArt"], ["cz-logo", "logo"],
  ["cz-halo", "halo"],
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
  // Live 3D parity with the garage's livery creator, one tab over: that
  // editor repaints the real car per colour-input event via livDraftOverride;
  // this one committed blind against two 22px swatches. Same override, keyed
  // "custom" — it shows on the turntable behind the dialog whenever MY TEAM
  // is the selected team, exactly like the sibling editor.
  livDraftOverride = { teamId: "custom", liv: { c1: hexToArr($("cz-color").value), c2: hexToArr($("cz-color2").value) } };
  _spMeshKey = "";
}
function czClearPreview() { livDraftOverride = null; _spMeshKey = ""; }
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
  refreshCustomLogoUi(loadCustomLogo());
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

// ---- garage preview camera ----
// The chips in #cs-view, plus orbit-by-drag and zoom on the canvas itself. All
// of it is gated on setupPreviewOn, so none of these listeners can touch the
// camera during a race — the canvas is shared with the track render and, on
// touch, with the steering.
// ---- the CAMERA disclosure ----
// The panel holds the whole camera set; only CAMERA and ACTIVE AERO show at
// rest. Closing is driven by INTENT, not by "a click happened": a preset is an
// aim-and-leave choice so it closes, while MOVE/zoom/SPIN repeat and must not
// pull the panel out from under the finger mid-adjustment.
function setSetupCamPanel(open) {
  const b = $("cs-cam"), p = $("cs-cam-panel");
  if (!b || !p) return;
  p.hidden = !open;
  b.setAttribute("aria-expanded", open ? "true" : "false");
}
const setupCamPanelOpen = () => !$("cs-cam-panel").hidden;
$("cs-cam").onclick = () => {
  setSetupCamPanel(!setupCamPanelOpen());
  if (soundOn) GameAudio.uiTick();
};
// Outside-click and Escape, the two ways every disclosure is expected to shut.
// Pointerdown rather than click so a drag STARTING on the car closes the panel
// before the orbit begins, instead of leaving it hanging over the car you are
// now turning.
document.addEventListener("pointerdown", (e) => {
  if (!setupPreviewOn || !setupCamPanelOpen()) return;
  if (!e.target.closest || !e.target.closest("#cs-stack")) setSetupCamPanel(false);
}, true);
// AN INNER DISCLOSURE CLAIMS ESCAPE BEFORE ITS SCREEN DOES. This listener is on
// document/capture and registers at script-eval time, i.e. before the generic
// layer handler in js/game/topmodal.js (which registers on DOMContentLoaded and
// therefore runs second on the same node) — and that handler bails on an event
// already marked handled. stopPropagation alone did NOT mark it: it stops the
// event descending but says nothing to a sibling listener on this same node, so
// preventDefault is what actually keeps Escape from ALSO pressing the GARAGE's
// BACK button and closing the screen behind the panel.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && setupPreviewOn && setupCamPanelOpen()) {
    setSetupCamPanel(false);
    e.preventDefault();
    e.stopPropagation();   // don't also close the GARAGE behind it
  }
}, true);

for (const btn of document.querySelectorAll("#cs-stack [data-cs-view]")) {
  btn.onclick = () => {
    setSetupView(btn.dataset.csView);
    setSetupCamPanel(false);
    if (soundOn) GameAudio.uiTick();
  };
}
$("cs-view-spin").onclick = () => { setSetupSpin(!setupPreviewSpin); if (soundOn) GameAudio.uiTick(); };
$("cs-view-reset").onclick = () => { resetSetupCam(); if (soundOn) GameAudio.uiTick(); };
// Hold a control to move continuously; the frame loop reads spHeld. A camera
// control that only moves on click is one you have to jab at twenty times to get
// round the car, so press-and-hold is the primary interaction and the discrete
// step is what a keyboard activation gets.
function holdSetupCtl(id, rates, step) {
  const el = $(id);
  if (!el) return;
  const release = () => { if (spHeld === rates) spHeld = null; };
  el.addEventListener("pointerdown", (e) => {
    if (!setupPreviewOn) return;
    e.preventDefault();
    // Capture so a finger sliding off the chip still releases here. NOT
    // pointerleave for the release: setPointerCapture fires a boundary event as
    // it retargets, which would stop the motion on its very first frame.
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    // One discrete step up front, THEN the held rate. Without the step a quick
    // tap moved by whatever fraction of a frame it happened to span — i.e.
    // visibly nothing — so the buttons only worked if you knew to hold them.
    step();
    spHeld = rates;
    if (soundOn) GameAudio.uiTick();
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, release);
  window.addEventListener("pointerup", release);
  // Enter/Space activate as a click with detail 0 and never send a pointerdown,
  // so the keyboard gets a discrete nudge rather than nothing at all.
  el.addEventListener("click", (e) => { if (e.detail === 0) step(); });
}
holdSetupCtl("cs-view-in",    { zoom: 1 / SP_RATE.zoom }, () => nudgeSetupCam(0, 0, 1 / 1.12));
holdSetupCtl("cs-view-out",   { zoom: SP_RATE.zoom },     () => nudgeSetupCam(0, 0, 1.12));
holdSetupCtl("cs-view-left",  { az: -SP_RATE.az },        () => nudgeSetupCam(-0.18, 0, 0));
holdSetupCtl("cs-view-right", { az: SP_RATE.az },         () => nudgeSetupCam(0.18, 0, 0));
holdSetupCtl("cs-view-up",    { el: SP_RATE.el },         () => nudgeSetupCam(0, 0.12, 0));
holdSetupCtl("cs-view-down",  { el: -SP_RATE.el },        () => nudgeSetupCam(0, -0.12, 0));
holdSetupCtl("cs-pan-left",   { strafe: -SP_RATE.pan },   () => setupPan(-0.15, 0));
holdSetupCtl("cs-pan-right",  { strafe: SP_RATE.pan },    () => setupPan(0.15, 0));
holdSetupCtl("cs-pan-fwd",    { dolly: SP_RATE.pan },     () => setupPan(0, 0.15));
holdSetupCtl("cs-pan-back",   { dolly: -SP_RATE.pan },    () => setupPan(0, -0.15));
$("cs-aero").onclick = () => { setSetupAero(!setupPreviewXOn); if (soundOn) GameAudio.uiTick(); };
{
  const canvas = $("game");
  // Live pointers by id, so a two-finger pinch is separable from a one-finger
  // orbit without a separate touch-event path.
  const spPtr = new Map();
  let spPinch = 0;
  const pinchGap = () => {
    const p = [...spPtr.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  };
  if (canvas) {
    canvas.addEventListener("pointerdown", (e) => {
      if (!setupPreviewOn) return;
      spPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      spPinch = pinchGap();
      // Taking hold of the car is itself the instruction to stop the turntable —
      // dragging against a rotation that keeps adding to your input is horrible.
      if (spPtr.size === 1) setSetupSpin(false);
    });
    window.addEventListener("pointermove", (e) => {
      if (!setupPreviewOn || !spPtr.has(e.pointerId)) return;
      const p = spPtr.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (spPtr.size >= 2) {
        // Pinch: the gap between the two fingers drives distance directly.
        const gap = pinchGap();
        if (spPinch > 0 && gap > 0) setupZoom(spPinch / gap);
        spPinch = gap;
        return;
      }
      // Drag: horizontal spins, vertical raises/lowers. Scaled by viewport width
      // so the same swipe travels the same arc on a phone and on a desktop.
      const span = Math.max(1, canvas.clientWidth);
      setupPreviewAz -= dx * (Math.PI * 1.6) / span;
      setupPreviewEl = clamp(setupPreviewEl + dy * (Math.PI * 0.9) / span, SP_EL_MIN, SP_EL_MAX);
    });
    const release = (e) => {
      spPtr.delete(e.pointerId);
      spPinch = pinchGap();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    canvas.addEventListener("wheel", (e) => {
      if (!setupPreviewOn) return;
      e.preventDefault();
      setupZoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
  }
}
// The GARAGE is reachable from the title AND from the select screen's car card,
// so DONE has to go back where it came from. It used to unhide #select
// unconditionally, which dropped you on the track picker after opening the
// garage from the menu.
let garageReturn = "select";
// The one way in. Everything that opens the garage goes through here so the
// return path can never be left stale — including menus.js, via G.openGarage.
function openGarage(from) {
  if (from === "menu" && soundOn) GameAudio.init();
  else if (soundOn) GameAudio.uiSelect();
  garageReturn = from;
  // Fresh camera every visit: a garage that reopened on the last angle someone
  // dragged to — nose-down, zoomed into a wheel — reads as broken rather than
  // as remembered. The turntable is the front door; the controls are there for
  // anyone who wants off it.
  setupPreviewAz = 0.6;
  setupPreviewEl = SP_EL_DEF;
  setupPreviewDist = SP_DIST_DEF;
  setSetupSpin(true);
  setSetupCamPanel(false);   // same reasoning: the front door is the turntable
  // vt at the CALL site: SetupUI.create runs before Menus.create at boot, so
  // the module cannot hold the helper itself. The build runs inside the
  // transition callback — vt's 60 ms drop-safety applies it directly if the
  // page is not compositing.
  vt(openSetup);
}
$("mb-garage").onclick = () => openGarage("menu");
// Leaving the GARAGE, shared by DONE and BACK: the screen's own teardown plus
// the part maths, which both exits owe the rest of the game.
function leaveGarage() {
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
  leaveGarage();
  if (garageReturn === "vsfriend") {
    $("vsfriend").hidden = false;
    netLobby.roomChanged("car");
    return;
  }
  if (garageReturn === "career") { careerUi.openHub(); return; }
  if (garageReturn === "select") { buildSelect(); vt(() => { $("select").hidden = false; }); return; }
  buildSelect();
  vt(() => { els.overlay.hidden = false; });   // came in from the title screen's GARAGE button
}
$("cs-back").onclick = garageBack;
$("cs-done").onclick = () => {
  leaveGarage();
  // Back to the waiting room, and tell the other player what you are driving —
  // a room that only synced on START would have two people spend a minute each
  // choosing a car neither can see.
  if (garageReturn === "vsfriend") {
    $("vsfriend").hidden = false;
    netLobby.roomChanged("car");
    return;
  }
  if (garageReturn === "career") { careerUi.openHub(); return; }
  // Reached from the circuit picker's START, so DONE goes FORWARD to the race
  // settings, not back to a screen whose question is already answered. Race
  // settings' own BACK still returns to #select, so the circuit stays two taps
  // away if you change your mind.
  if (garageReturn === "select") { openRaceSettings("select"); return; }
  buildSelect();
  els.overlay.hidden = false;   // only the title screen's GARAGE button gets here
};
$("cs-unlimited").onclick = () => {
  unlimitedBudget = !unlimitedBudget;
  store.set("unlimitedBudget", unlimitedBudget);
  buildSetup();
};
$("cz-cancel").onclick = () => { czClearPreview(); els.customize.hidden = true; };
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
  czClearPreview();   // the saved team supersedes the live draft
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
    if (season.round >= SeasonCal.rounds()) {
      // First click: build the champion panel and STAY on the results screen. The
      // panel's own DOM lives in js/game/results.js with every other results
      // builder; "MAIN MENU" on the button is the sentinel that it is already up.
      if (els.resNext.textContent !== "MAIN MENU") { buildChampion(); return; }
      // Second click: go to menu, reset season
      season = null; store.set("season", null);
      els.resultsTitle.style.color = "";
      quitToMenu();
      return;
    }
    // After a SPRINT the round has not advanced, so this re-selects the circuit
    // the weekend is already at — the Grand Prix is its second half.
    trackIdx = SeasonCal.trackIndex(season.round);
  }
  els.results.hidden = true;
  // A championship weekend qualifies ONCE, at its start — every round, not just
  // the one entered through race settings. openQuali() also clears the previous
  // round's classification, which is what stops this grid being last week's. Two
  // things skip it: a season with qualifying off, and the GP leg of a sprint
  // weekend (which grids off the session the sprint already ran) — but NOT if
  // that classification has since been dropped. quitToMenu() clears it, so a
  // resumed weekend re-qualifies instead of silently gridding the player P12 out
  // of gridUp()'s tier fallback.
  if (isChampionship() && (SeasonCal.qualiNext(season) || (SeasonCal.quali() && !quali.results()))) openQuali();
  else startRace();
};

function setPaused(p) {
  if (state !== "race" && state !== "count") return; hideCamPicker();
  paused = p;
  if (!p) { closeLightTuner(false); closeCamTuner(false); exitPhotoMode(); }
  els.pausemenu.hidden = !p;
  if (!p) els.pmsettings.hidden = true;   // never leave the settings sub-menu up after resume
  if (els.pmStandings) els.pmStandings.hidden = !(isChampionship() && SeasonCal.hasProgress(season) && season.round < SeasonCal.rounds());
  // never leave an overlay up after resume
  if (!p) { $("advanced").hidden = true; els.howtoplay.hidden = true; $("audioset").hidden = true; $("standings").hidden = true; $("track-detail").hidden = true; $("quali").hidden = true; els.results.hidden = true; }
  if (p) { GameAudio.stopEngine(); GameAudio.setSkid(0); $("pm-restart").disabled = !!(netPlay.active() || qualiNetDone); }
  else if (soundOn) { GameAudio.setVoice(player && player.team && player.team.engine); GameAudio.startEngine(); }
  lastFrame = performance.now(); syncRotateBlocker(false);   // the pause card yields to an active rotate blocker on EVERY entry
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
  if (v) { const p = $("campicker"); if (p) p.hidden = true; }
}
$("pm-hidehud").onclick = () => {
  const willHide = !document.body.classList.contains("hud-hidden");
  setHudUserHidden(willHide);
  if (willHide) setPaused(false);   // clean screen — drop the menu so you can actually see it
};
$("hud-restore").onclick = () => setHudUserHidden(false);

// ---- player camera modes (CAM button / C key) ----
// The CAM button + picker grid + mode-cycle wiring live in js/game/cam-modes.js
// (broadcast-only — no physics). game.js keeps `camMode`/`camCutT` as closure
// state (the render loop reads them); the module mutates them through G. The
// façade exposes setCamMode as a deferred arrow (const initialised here), and
// the update loop's `cycleCam()` closes over this const.
const { setCamMode, cycleCam, hideCamPicker } = CamModes.create(G);

$("pm-resume").onclick = () => setPaused(false);
$("pm-restart").onclick = () => { if (netPlay.active() || qualiNetDone) return; els.pausemenu.hidden = false; setPaused(false); startRace(); };
$("pm-quit").onclick = () => quitToMenu();
els.pmStandings && (els.pmStandings.onclick = () => { buildStandings(); $("standings").hidden = false; });

// BUILD NUMBER in the pause menu. index.html is the one file with no ?v= of its
// own, so a stale shell (or a service worker serving a cached generation) can run
// old JS with nothing on screen to say so — during one camera-bug hunt a fix was
// deployed three times while the reporter kept testing the previous build, and
// neither side could tell. Read from the stylesheet's ?v=, which is the build
// whose assets ACTUALLY loaded, rather than a constant compiled into the markup:
// a string in the HTML would go stale with the HTML and confirm the wrong thing.
{
  const tag = $("pm-build");
  if (tag) {
    const meta = document.querySelector('meta[name="apex-build"]');
    const build = meta && meta.content;
    tag.textContent = build ? `build ${build}` : "build unknown";
  }
}

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
  if (state === "race" || state === "count") showTouchControls(true);
}
$("pm-steer").onclick = () => {
  setSteerMode(STEER_MODES[(STEER_MODES.indexOf(steerMode) + 1) % STEER_MODES.length]);
};
$("pm-calib").onclick = () => { Input.calibrate(); setPaused(false); };

// Steering-tuning sliders, presets + macro levels live in
// js/game/steer-tuning.js (SteerTuning.create(G) — wired after the G façade).

// GEARS toggle: usable when thumbs are free (tilt or desktop keyboard).
// Disabled — not hidden — on BUTTONS/TOUCH (see the pm-calib note in setSteerMode).
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

// ACTIVE AERO: MANUAL / AUTO. Same shape as GEARS and for the same reason —
// both answer "how much of the car do you operate yourself?". Takes effect
// immediately, so a player who flips it mid-race sees it on the next zone; the
// HUD's AERO button greys out under AUTO (see hud.js hToggle "dead").
// Also re-lays the dock, because AUTO REMOVES the AERO button rather than
// greying it and the survivors have to close ranks. Without this the change
// only appeared at the next steering-mode switch — i.e. it looked broken
// exactly when a player flipped the setting to see what it did.
function refreshAeroBtn() {
  const b = $("pm-aero");
  if (b) b.textContent = "ACTIVE AERO: " + (raceAeroMode === "auto" ? "AUTO" : "MANUAL");
  if (state === "race" || state === "count") showTouchControls(true);
}
$("pm-aero").onclick = () => {
  raceAeroMode = raceAeroMode === "auto" ? "manual" : "auto";
  store.set("aeroMode", raceAeroMode);
  refreshAeroBtn();
  // Dropping out of AUTO must not leave the wing latched open — the switch is
  // the player's again from this instant.
  if (raceAeroMode !== "auto" && player) player.xOn = false;
  if (soundOn) GameAudio.uiTick();
};
refreshAeroBtn();
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state === "race" || state === "count")) setPaused(true);
  // Sentinel: a hidden tab that never comes back was killed in the BACKGROUND —
  // normal iOS housekeeping, not our crash. Disarm while hidden, re-arm on
  // return to a live session.
  if (document.hidden) PerfGov.sentinelArm(false);
  else if (state === "race" || state === "count") PerfGov.sentinelArm(true);
  // The platform releases a wake lock on every hide and does not give it
  // back — re-request it here rather than a fourth listener elsewhere.
  if (!document.hidden && raceWakeWanted) holdRaceWake();
});
window.addEventListener("pagehide", () => { PerfGov.sentinelArm(false); });

// ---------- boot ----------
// (A `window.__APEX` bridge lived here, gated on a `window.__APEX_DEBUG` flag
// that nothing in js/, tests/, tools/ or index.html has ever set. The harness
// it was written for is window.__apex, in js/game/apex.js.)

// MY TEAM's own emblem. Stored as a downscaled data URL under apex26.customLogo
// so it survives a reload without touching the asset pipeline — LiveryTex takes
// it through exactly the same slot as the shipped marks.
const CUSTOM_LOGO_KEY = "customLogo";
const CUSTOM_LOGO_MAX = 384;      // matches the shipped marks
function loadCustomLogo() { try { return store.get(CUSTOM_LOGO_KEY, null); } catch (_) { return null; } }
function applyCustomLogo(dataUrl) {
  if (typeof LiveryTex === "undefined" || !LiveryTex.setTeamLogo) return;
  LiveryTex.setTeamLogo("custom", dataUrl || null);
}
// Downscale to at most CUSTOM_LOGO_MAX on the long edge before storing: a phone
// photo is several MB and localStorage would simply throw.
function readLogoFile(file, done) {
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, CUSTOM_LOGO_MAX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * sc));
      const h = Math.max(1, Math.round(img.height * sc));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      try { done(c.toDataURL("image/png")); } catch (_) { done(null); }
    };
    img.onerror = () => done(null);
    img.src = fr.result;
  };
  fr.onerror = () => done(null);
  fr.readAsDataURL(file);
}
function refreshCustomLogoUi(dataUrl) {
  const prev = $("cz-logo-prev");
  if (!prev) return;
  prev.hidden = !dataUrl;
  if (dataUrl) prev.src = dataUrl;
}
$("cz-logofile").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  readLogoFile(f, (dataUrl) => {
    if (!dataUrl) return;
    try { store.set(CUSTOM_LOGO_KEY, dataUrl); } catch (_) {}
    applyCustomLogo(dataUrl);
    refreshCustomLogoUi(dataUrl);
    invalidateDecalTextures("custom");
    _spMeshKey = "";
    if (soundOn) GameAudio.uiSelect();
  });
  e.target.value = "";       // let the same file be re-picked after a CLEAR
});
$("cz-logo-clear").onclick = () => {
  try { store.set(CUSTOM_LOGO_KEY, null); } catch (_) {}
  applyCustomLogo(null);
  refreshCustomLogoUi(null);
  invalidateDecalTextures("custom");
  _spMeshKey = "";
  if (soundOn) GameAudio.uiTick();
};

// Real team marks (assets/logos/<id>.png). Optional and async: every atlas built
// before they land uses the hand-drawn vector crest, so this drops those cached
// textures once the images arrive and the cars repaint with the real emblems.
// Prefetch is deferred off module-eval sand — ensureLogos() (also kicked by the
// first buildAtlas) starts the loads; we only subscribe for cache invalidation.
if (typeof LiveryTex !== "undefined" && LiveryTex.ensureLogos) {
  LiveryTex.ensureLogos();
  LiveryTex.onLogosReady(() => {
    for (const t of Teams.LIST) invalidateDecalTextures(t.id);
    _spMeshKey = "";   // force the garage turntable to repaint too
  });
  applyCustomLogo(loadCustomLogo());
}
syncCustomTeam();   // inject "MY TEAM" so saved selections and chips resolve
migrateSeasonPoints();
if (teamIdx < 0 || teamIdx >= Teams.LIST.length) teamIdx = 2;
if (driverIdx < 0 || driverIdx >= Teams.LIST[teamIdx].drivers.length) driverIdx = 0;
// Clamp a legacy positional selection before migrating it to stable identity.
if (!(trackIdx >= 0 && trackIdx < Tracks.LIST.length)) trackIdx = 0;
// Stable ID is authoritative; keep the legacy index for an older cached build.
if (Tracks.LIST[trackIdx]) {
  store.set("trackId", Tracks.LIST[trackIdx].id); store.set("track", trackIdx);
}
{ const hasSeason = SeasonCal.hasProgress(season) && season.round < SeasonCal.rounds();
  $("mb-standings").hidden = !hasSeason; }
Career.load();            // resolve + migrate the career save once at boot
refreshCareerButton();
// `state` is closure-local, and js/game/uilayers.js is what decides whether
// Escape means PAUSE or BACK — hand it the answer rather than have it guess one
// from the DOM. Same pair setPaused() gates on.
UiLayers.setRaceGetter(() => state === "race" || state === "count");
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
// The subtitle is DERIVED on both paths. It used to be hardcoded "24 real
// circuits" in index.html and rewritten on desktop only, from Tracks.LIST.length
// — which counts the 16 retired classics too, so the same build claimed 24
// circuits on a phone and 40 on a desktop. Both now read the championship
// calendar (Tracks.SEASON), and the desktop, which has the room, names the
// classics rather than silently folding them into the season count.
/* body.desktop IS A LIVE ANSWER, NOT A BOOT-TIME ONE. It used to be set once,
   here, and never revisited — but `(pointer: coarse)` flips whenever an iPad is
   docked to or undocked from a keyboard, and showTouchControls() reads the LIVE
   query. So the un-docked iPad un-hid GAS/BRAKE/BOOST while body.desktop was
   still on, and every rule that gives those buttons their tap size and their
   `pointer-events: auto` is `body:not(.desktop)` (css/overlays.css) — real
   buttons, correctly laid out, that could not be pressed, with #pm-steer and
   #pm-calib hidden by css/responsive.css so there was no way back either.
   Re-run everything that reads the query, in the order boot does. */
function syncPointerKind() {
  document.body.classList.toggle("desktop", !Input.touchControlsNeeded());
  if (state === "race" || state === "count") showTouchControls(true);
  refreshGearsBtn();   // GEARS is enabled by thumbs being free, i.e. by this
}
syncPointerKind();
Input.onPointerKindChange(syncPointerKind);
{
  const rounds = Tracks.SEASON.length, classics = Tracks.LIST.length - rounds;
  els.subtitle.textContent = "2026 grid · " + rounds + " real circuits · "
    + (Input.touchControlsNeeded() ? ({buttons:"tap arrows to steer",touch:"drag to steer"}[steerMode] || "tilt to steer") : classics + " classics");
}
Input.setSteerMode(steerMode);
DataHub.init(els.datahub);
$("pm-steer").textContent = steerLabel();
$("pm-calib").disabled = steerMode !== "tilt";
refreshGearsBtn();
audioPanel.init();
// THE BOOT PATH TAKES THE SAME DEFERRAL EVERY OTHER MENU TRACK CHANGE TAKES.
// This was `loadTrack(trackIdx)` as the last statement of the IIFE — a
// synchronous Tracks.build() inside DOMContentLoaded, measured at 938 ms
// (monaco) to 3284 ms (vegas), mean ~2.1 s over 8 circuits, against a measured
// DCL of 4712 ms. Nothing on the menu needs it (the picker and detail modal
// draw from Tracks.LIST defs via TrackMaps; startRace()/openQuali() build the
// real track themselves), so it is only ever the background flyby — which is
// what scheduleFlybyTrack() exists for. __apex forces the build on first use
// (lazyTrackEnsure, js/game/apex.js) so the test harness keeps the synchronous
// world every spec written before this assumed.
scheduleFlybyTrack();
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
// Injected only when wantAgentSurface() — Pages players never download it.
// game.js eval-assigns window.__apex (the one-global the registry pins on this
// file) and bootAgentSurface fills it after the lazy inject. ApexApi itself is
// a call-time read: an eval-time ApexApi.create is a ReferenceError on the
// player path and a FULL toposort miss in scan-globals.
window.__apex = null;
async function bootAgentSurface() {
  if (!wantAgentSurface()) return;
  await loadBackendScripts(AGENT_FILES, AGENT_EDGES);
  if (typeof ApexApi !== "undefined") window.__apex = ApexApi.create(G);
}
await bootAgentSurface();

// Lobby buttons + the #vs= invite-link handler. Last, so every element it
// binds to exists and the G facade is fully built.
netLobby.wire();

})();
