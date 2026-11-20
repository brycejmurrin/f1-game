const SetupCamera = (function () {
  "use strict";

const { X_OPEN_RATE, X_CLOSE_RATE } = PhysicsConsts;

function panelCover(pr, cr, cw, ch, camTop) {
  const lim = (v) => (v < 0 ? 0 : v > 0.85 ? 0.85 : v);
  if (cw - pr.width >= ch - pr.height) {
    const f = lim(pr.width / cw);
    return { x: f > 0 && pr.left + pr.right < cr.left + cr.right ? -f : f, y: 0 };
  }
  return { x: 0, y: lim((pr.bottom + Math.min(camTop(), ch) - ch) / ch) };
}

const SP_EXPOSURE = 1.04;
const SP_BLOOM = 0.20;
const SP_THRESH = 0.86;
const RACE_GLARE_DEF = 0.12;
function liveTune() {
  if (typeof LightTune !== "undefined" && LightTune.LT) return LightTune.LT;
  if (typeof LightKnobs !== "undefined" && LightKnobs.LT) return LightKnobs.LT;
  return null;
}
function _tuneNum(T, id, fallback) {
  return T && Number.isFinite(T[id]) ? T[id] : fallback;
}
const _presentOpts = {
  exposure: 0, bloom: 0, threshold: 0, contact: 0, reflect: 0, carReflect: 0,
  ssao: 0, godray: 0, bloomLevels: 0, flareMul: 0, tune: null,
};
const _presentTune = { sunShaftMul: 0 };
function garagePhone() {
  return typeof GLX !== "undefined" && !!(GLX && (GLX.isMobile || GLX.mobileTier));
}
const NO_MOOD = Object.freeze({ exposure: 1, bloom: 1, glare: 1, sun: null });
const moodDef = () => (typeof GarageScene !== "undefined" && GarageScene.moodDef && GarageScene.moodDef()) || NO_MOOD;

function presentOpts(tune) {
  const T = tune === undefined ? liveTune() : tune;
  const exposureMul = _tuneNum(T, "exposureMul", 1);
  const bloomMul = _tuneNum(T, "bloomMul", 1);
  const threshOff = _tuneNum(T, "threshOff", 0);
  const phone = garagePhone();
  const shed = phone || (typeof PerfGov !== "undefined" && PerfGov.lookPostShed && PerfGov.lookPostShed());
  const t = SP_THRESH + threshOff;
  const threshold = (t < 0.4 ? 0.4 : t > 1.2 ? 1.2 : t) * SP_EXPOSURE;
  Object.setPrototypeOf(_presentTune, T && typeof T === "object" ? T : null);
  _presentTune.sunShaftMul = 0;
  _presentOpts.flareMul = 0;
  const md = (typeof GarageScene !== "undefined" && GarageScene.moodDef && GarageScene.moodDef()) || { exposure: 1, bloom: 1 };
  _presentOpts.exposure = SP_EXPOSURE * exposureMul * md.exposure;
  _presentOpts.bloom = shed ? 0 : SP_BLOOM * bloomMul * md.bloom;
  _presentOpts.threshold = threshold;
  _presentOpts.contact = 0;
  _presentOpts.reflect = 0;
  _presentOpts.carReflect = 0;
  _presentOpts.ssao = 0;
  _presentOpts.godray = 0;
  let levels = 0;
  if (!shed && typeof PerfGov !== "undefined" && PerfGov.userTier) {
    const ut = PerfGov.userTier() | 0, as = PerfGov.autoShed ? PerfGov.autoShed() | 0 : 0;
    levels = (as >= 3 || ut >= 4) ? 2 : ((as >= 1 || ut >= 2) ? 3 : 0);
  }
  _presentOpts.bloomLevels = levels;
  _presentOpts.tune = _presentTune;
  return _presentOpts;
}
function glareScale(tune) {
  const T = tune === undefined ? liveTune() : tune;
  return _tuneNum(T, "glareStr", RACE_GLARE_DEF) / RACE_GLARE_DEF;
}

const SP_HULL_GEOM_FIELDS = ["stripe", "noseStripe", "nose", "pod", "finShape", "coverVents", "spineHeight", "spineSide", "spineLogo", "bodyStyle", "aeroShape", "floorShape", "engineShape", "suspensionShape", "brakesShape", "tyresShape", "ersShape", "gearboxShape", "fuelShape", "exhaustShape", "cockpitShape", "wheelsShape"];
function hullKeyOf(teamId, partsKey, seat, liv) {
  const at = partsKey.indexOf("|L:");
  return teamId + ":" + (at < 0 ? partsKey : partsKey.slice(0, at)) + ":" + seat + "|"
    + SP_HULL_GEOM_FIELDS.map((f) => (typeof liv[f] === "string" ? liv[f] : liv[f] ? 1 : 0)).join(",");
}

function create(G, deps) {
Log.info("game", "SetupCamera.create");
const { $, gfx, clamp, getTeamParts } = G;
const { resolveLivery, partsVisualKey, drawAeroFlaps, teamDecalState, carDecalNum,
        drawCarDecals, carPaintMat, PAINT_DRY_DAY, MAT_REFLECT_X, render } = deps;
const surfaceOutline = typeof GarageSurfaceOutline !== "undefined" ? GarageSurfaceOutline.create(gfx) : null;

const reducedMotion = () => {
  const mv = G.store.get("motion", null);
  if (mv === "off") return false;
  if (mv === "reduce") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
const arrival = GarageArrival.create($, reducedMotion, GarageArrival.bindSettings($, G.store, { preview: startArrivalPreview, changed: () => refreshPreview() }));
let driveOut = null;
function startDriveOut() {
  const cfg = GarageArrival.settings(G.store.get("garageArrival", null));
  endHome();
  driveOutEngine(false);
  if (typeof clearSetupGestures === "function") clearSetupGestures();
  driveOut = null;
  if (!GarageArrival.plays(cfg, "raceStart")) return 0;
  if (typeof LoadingScreen !== "undefined" && LoadingScreen.isAutomation && LoadingScreen.isAutomation()) return 0;
  const play = Object.assign({}, cfg, { enabled: true });
  driveOut = { t: 0, cfg: play, motion: { eye: [0, 0, 0], aim: [0, 0, 0] } };
  driveOutEngine(true);
  return Math.round(GarageArrival.wallSeconds(play, "out") * 1000 / play.speed);
}
function driveOutLeft() {
  return driveOut ? Math.max(0, GarageArrival.wallLeft(driveOut.cfg, "out", driveOut.t) * 1000 / driveOut.cfg.speed) : 0;
}
function stepDriveOut(held = false) {
  const now = performance.now(), gap = driveOut.last ? (now - driveOut.last) / 1000 : 0;
  driveOut.last = now;
  if (!held) driveOut.t += Math.min(0.1, Math.max(0, gap)) * driveOut.cfg.speed * GarageArrival.rate(driveOut.cfg, "out", driveOut.t);
  const pose = Object.assign(GarageArrival.poseOut(driveOut.t, driveOut.cfg, reducedMotion()), { active: true });
  if (typeof GarageDepartureWheels !== "undefined" && GarageDepartureWheels.samplePose) {
    const motion = GarageDepartureWheels.samplePose(pose, driveOut.t, driveOut.cfg, driveOut.motion, { calm: reducedMotion() });
    if (motion) driveOut.motion = motion;
  } else if (typeof GarageDepartureMotion !== "undefined" && driveOut.cfg.angle === "cut") {
    const T = GarageArrival.timeline(driveOut.cfg, "out"), delay = GarageArrival.duration(driveOut.cfg, "out") - T.base;
    const go = T.door + T.hold + delay, rolling = T.settle - T.door - T.hold;
    const u = Math.max(0, Math.min(1, (driveOut.t - go) / rolling));
    const motion = GarageDepartureMotion.sample(u, pose.side, driveOut.motion);
    pose.x = motion.x; pose.z = motion.z; pose.yaw = motion.yaw;
    pose.distance = motion.distance;
    if (reducedMotion()) {
      motion.eye[0] = -4 * pose.side; motion.eye[1] = 3.2; motion.eye[2] = 15.7;
      motion.aim[0] = 3.5 * pose.side; motion.aim[1] = .65; motion.aim[2] = 7;
      pose.eye = motion.eye; pose.aim = motion.aim; pose.fov = 75;
    } else {
      pose.eye = motion.eye; pose.aim = motion.aim; pose.fov = motion.fov + driveOut.cfg.fov - 54;
    }
    driveOut.motion = motion;
  }
  driveOutSound(pose, gap);
  return pose;
}
let _outEngine = false, _outPrev = null;
function driveOutEngine(on) {
  if (on && G.soundOn && typeof GameAudio !== "undefined" && GameAudio.startEngine) {
    try {
      const team = Teams.LIST[G.teamIdx];
      if (GameAudio.setVoice) GameAudio.setVoice(team && team.engine);
      GameAudio.startEngine(); _outEngine = true; _outPrev = null;
    } catch (e) { _outEngine = false; Log.warn("audio", "garage engine failed", e); }
  } else if (!on && _outEngine) {
    _outEngine = false; _outPrev = null;
    try { GameAudio.stopEngine(); if (GameAudio.setSkid) GameAudio.setSkid(0, false); } catch (_) {  }
  }
}
function driveOutSound(pose, gap) {
  const p = _outPrev, dx = p ? pose.x - p.x : 0, dz = p ? pose.z - p.z : 0;
  if (!p) _outPrev = { x: pose.x, z: pose.z };
  else { p.x = pose.x; p.z = pose.z; }
  if (!_outEngine || !(gap > 0) || !p) return;
  const v = Math.hypot(dx, dz) / Math.min(0.1, gap);
  const s01 = Math.min(1, v / 12), rolling = v > 0.2;
  try {
    GameAudio.setEngine(rolling ? 0.22 + 0.35 * s01 : 0.12, 0, false, s01 * 0.2, 1,
      { throttle: rolling ? 0.45 : 0, brake: 0, slip: 0, wet: false });
    if (GameAudio.setSkid) GameAudio.setSkid(rolling && v < 2.5 ? 0.35 : 0, false);
  } catch (_) {  }
}
const FRAME_S = 1 / 24;
let preview = null;
const previewCfg = () => Object.assign(GarageArrival.settings(G.store.get("garageArrival", null)), { enabled: true });
const previewLen = (p) => GarageArrival.duration(p.cfg, p.dir);
function previewPose(p) {
  const t = Math.min(p.t, previewLen(p));
  const pose = GarageArrival.poseFor(p.dir)(t, p.cfg, reducedMotion());
  if (p.dir === "out" || p.dir === "home") {
    if (typeof GarageDepartureWheels !== "undefined" && GarageDepartureWheels.samplePose) {
      const motion = GarageDepartureWheels.samplePose(pose, t, p.cfg, p.motion || (p.motion = { eye: [0, 0, 0], aim: [0, 0, 0] }), { calm: reducedMotion() });
      if (motion) p.motion = motion;
    } else if (typeof GarageDepartureMotion !== "undefined" && p.cfg.angle === "cut") {
      const T = GarageArrival.timeline(p.cfg, "out"), delay = GarageArrival.duration(p.cfg, "out") - T.base;
      const go = T.door + T.hold + delay, rolling = Math.max(1e-9, T.settle - T.door - T.hold);
      const u = Math.max(0, Math.min(1, (t - go) / rolling));
      const motion = GarageDepartureMotion.sample(u, pose.side, p.motion || (p.motion = { eye: [0, 0, 0], aim: [0, 0, 0] }));
      pose.x = motion.x; pose.z = motion.z; pose.yaw = motion.yaw; pose.distance = motion.distance;
      if (reducedMotion()) {
        motion.eye[0] = -4 * pose.side; motion.eye[1] = 3.2; motion.eye[2] = 15.7;
        motion.aim[0] = 3.5 * pose.side; motion.aim[1] = .65; motion.aim[2] = 7;
        pose.eye = motion.eye; pose.aim = motion.aim; pose.fov = 75;
      } else {
        pose.eye = motion.eye; pose.aim = motion.aim; pose.fov = motion.fov + p.cfg.fov - 54;
      }
      p.motion = motion;
    }
  }
  return pose;
}
function previewPhases(p) {
  const T = GarageArrival.timeline(p.cfg, p.dir), len = previewLen(p), extra = len - T.base;
  const marks = p.dir === "out"
    ? [["door", "SHUTTER", 0], ["hold", extra > 0 ? "CREW CLEAR" : "HOLD", T.door], ["run", "ROLL OUT", T.door + T.hold + extra], ["gone", "EMPTY LANE", T.settle + extra]]
    : [["door", "SHUTTER", 0], ["lane", "LANE RUN", T.door], ["pause", "PAUSE", T.door + T.lane], ["back", "BACK IN", T.door + T.lane + T.pause],
      ["park", "PARKED", T.park], ["crew", "CREW", T.base]];
  return marks.map(([id, name, t]) => ({ id, name, t }))
    .filter((m, i, a) => m.t < len - 1e-3 && !(a[i + 1] && a[i + 1].t - m.t < 1e-3));
}
const phaseAt = (marks, t) => marks.reduce((on, m) => (m.t <= t + 1e-6 ? m : on), marks[0]);
function transport() {
  const stop = $("ga-preview-stop");
  if (typeof document === "undefined" || !stop || !stop.insertAdjacentHTML || $("ga-transport")) return;
  stop.insertAdjacentHTML("beforebegin", '<div id="ga-transport" role="group" aria-label="Preview playback" hidden>'
    + '<button id="ga-play" type="button" aria-pressed="false">PAUSE</button>'
    + '<button id="ga-back" type="button" aria-label="Back one frame">&lsaquo;</button>'
    + '<span id="ga-scrubber"><input id="ga-scrub" type="range" min="0" max="1000" step="1" value="0" aria-label="Preview time">'
    + '<span id="ga-marks" aria-hidden="true"></span></span>'
    + '<button id="ga-fwd" type="button" aria-label="Forward one frame">&rsaquo;</button>'
    + '<output id="ga-time"></output>'
    + '<select id="ga-phase" aria-label="Jump to phase" hidden></select>'
    + '<button id="ga-loop" type="button" aria-pressed="false">LOOP</button>'
    + '<button id="ga-edit" type="button" aria-pressed="false">EDIT</button></div>');
  $("ga-transport").appendChild(stop);
  $("ga-play").onclick = () => previewPause(!(preview && preview.paused));
  $("ga-back").onclick = () => previewSeek(preview ? preview.t - FRAME_S : 0);
  $("ga-fwd").onclick = () => previewSeek(preview ? preview.t + FRAME_S : 0);
  $("ga-scrub").oninput = (e) => previewSeek(preview ? Number(e.target.value) / 1000 * previewLen(preview) : 0);
  $("ga-phase").onchange = (e) => previewPhase(e.target.value);
  $("ga-loop").onclick = () => { if (preview) { preview.loop = !preview.loop; previewSync(); } };
  $("ga-edit").onclick = () => previewEdit(!(preview && preview.editing));
}
function previewSync() {
  const p = preview;
  if (!p) return;
  const len = previewLen(p), t = Math.min(p.t, len), set = (el, k, v) => { if (el && el[k] !== v) el[k] = v; };
  const press = (el, on) => { if (el && el.setAttribute) el.setAttribute("aria-pressed", String(on)); };
  const play = $("ga-play");
  set(play, "textContent", p.paused ? "PLAY" : "PAUSE"); press(play, p.paused);
  press($("ga-loop"), p.loop); press($("ga-edit"), p.editing);
  set($("ga-scrub"), "value", String(Math.round(t / (len || 1) * 1000)));
  set($("ga-time"), "textContent", t.toFixed(1) + " / " + len.toFixed(1) + " s \u00b7 " + previewPose(p).label);
  const marks = previewPhases(p), on = phaseAt(marks, t), key = p.dir + marks.map((m) => m.id + m.t.toFixed(3)).join();
  if (p.marked !== key) {
    p.marked = key;
    set($("ga-marks"), "innerHTML", marks.map((m) => '<i data-phase="' + m.id + '" style="left:'
      + (m.t / (len || 1) * 100).toFixed(2) + '%"></i>').join(""));
    set($("ga-phase"), "innerHTML", marks.map((m) => '<option value="' + m.id + '">' + m.name + " \u00b7 " + m.t.toFixed(1) + " s</option>").join(""));
  }
  set($("ga-phase"), "value", on.id);
  set($("ga-phase"), "hidden", !p.editing);
  const bar = $("ga-transport"); if (bar && bar.toggleAttribute) bar.toggleAttribute("data-editing", p.editing);
}
function previewPhase(id) {
  if (!preview) return;
  const m = previewPhases(preview).find((x) => x.id === id);
  if (m) previewSeek(m.t);
}
function previewPause(on) {
  if (!preview) return;
  preview.paused = !!on;
  if (!on) { if (preview.t >= previewLen(preview)) preview.t = 0; if (preview.editing) previewEdit(false); }
  previewSync();
}
function previewSeek(t) {
  if (!preview) return;
  preview.paused = true;
  preview.t = Math.max(0, Math.min(previewLen(preview), Number.isFinite(t) ? t : 0));
  if (typeof GarageDepartureWheels !== "undefined" && GarageDepartureWheels.resetTravel) GarageDepartureWheels.resetTravel(preview);
  else if (preview.travel) preview.travel.primed = false;
  previewSync();
}
function previewEdit(on) {
  if (!preview) return;
  preview.editing = !!on;
  if (on) preview.paused = true;
  const inner = $("garrival-inner");
  if (inner) inner.hidden = !on;
  previewSync();
}
function refreshPreview() {
  if (!preview) return;
  preview.cfg = previewCfg();
  preview.t = Math.min(preview.t, previewLen(preview));
  previewSync();
}
function startArrivalPreview(dir, btn) {
  if (!dir) return stopPreview();
  const d = dir === "out" || dir === "home" ? dir : "in";
  if (preview && preview.editing) {
    Object.assign(preview, { dir: d, t: 0, btn: btn || preview.btn });
    previewEdit(false); previewPause(false);
    return true;
  }
  endHome();
  const cs = $("carsetup");
  if (preview || driveOut || (cs && !cs.hidden)) return false;
  transport();
  preview = { t: 0, cfg: previewCfg(), dir: d, was: G.setupPreviewOn, btn, paused: false, loop: false, editing: false, marked: null };
  Log.info("game", "SetupCamera.preview " + preview.dir);
  G.setupPreviewOn = true;
  const inner = $("garrival-inner");
  if (inner) inner.hidden = true;
  const bar = $("ga-transport");
  if (bar) bar.hidden = false;
  const stop = $("ga-preview-stop");
  if (stop) { stop.hidden = false; if (stop.focus) stop.focus(); }
  previewSync();
  return true;
}
function stepPreview(dt) {
  const p = preview;
  if (!p.paused) p.t += Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0)) * p.cfg.speed * GarageArrival.rate(p.cfg, p.dir, p.t);
  if (p.loop && !p.paused && p.t >= previewLen(p)) {
    p.t = 0;
    if (typeof GarageDepartureWheels !== "undefined" && GarageDepartureWheels.resetTravel) GarageDepartureWheels.resetTravel(p);
    else if (p.travel) p.travel.primed = false;
  }
  const pose = previewPose(p);
  previewSync();
  if (pose.active) return pose;
  if (!p.paused) stopPreview();
  return p.paused ? Object.assign(pose, { active: true }) : Object.assign(pose, { active: true, mood: null, bars: false });
}
function stopPreview() {
  if (!preview) return false;
  const p = preview;
  preview = null;
  sequenceLook(null);
  G.setupPreviewOn = p.was;
  const inner = $("garrival-inner");
  if (inner) inner.hidden = false;
  const stop = $("ga-preview-stop");
  if (stop) stop.hidden = true;
  const bar = $("ga-transport");
  if (bar) bar.hidden = true;
  if (p.btn && p.btn.focus) p.btn.focus();
  if (!p.was && typeof requestAnimationFrame === "function") requestAnimationFrame(() => render(0));
  return true;
}
const previewStop = $("ga-preview-stop");
if (previewStop) previewStop.onclick = stopPreview;
window.addEventListener("keydown", (e) => {
  if (!preview) return;
  const own = e.target && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName || "");
  if (e.key === " " && !own) previewPause(!preview.paused);
  else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !own && !preview.editing) previewSeek(preview.t + (e.key === "ArrowLeft" ? -FRAME_S : FRAME_S));
  else if (e.key === "Escape") stopPreview();
  else return;
  e.preventDefault();
  e.stopPropagation();
}, true);
let pendingHome = null;
function noteResult(order, meta) {
  const pl = G.player;
  pendingHome = null;
  if (!pl || !Array.isArray(order) || typeof RaceCeremony === "undefined" || !RaceCeremony.eligible(G, meta)) return null;
  const pos = order.indexOf(pl) + 1;
  let fast = null;
  for (const c of order) if (c && !c.retired && !c.dsq && Number.isFinite(c.best) && c.best > 0 && (!fast || c.best < fast.best)) fast = c;
  const t = typeof Tracks !== "undefined" && Tracks.LIST ? Tracks.LIST[G.trackIdx] : null, night = G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && !!(t && t.night));
  pendingHome = { result: GarageArrival.resultKind(pos, !!(pl.retired || pl.dsq), !!(meta && meta.sprint)), pos, at: performance.now(),
    driver: String(pl.name || pl.code || ""), fastest: fast === pl, wet: /rain|wet|storm/.test(String(G.raceWeather || "")), night,
    grid: Number.isFinite(pl.gridPos) ? pl.gridPos : null, sprint: !!(meta && meta.sprint),
    scene: { track: t, weather: G.raceWeather || "dry", tod: G.raceTimeOfDay || "default" } };
  return pendingHome;
}
function startHome(from) {
  const p = pendingHome;
  if (!p || from === "pit" || from === "vsfriend") return false;
  pendingHome = null;
  const cfg = GarageArrival.settings(G.store.get("garageArrival", null));
  if (!GarageArrival.plays(cfg, "afterRace") || performance.now() - p.at > 30 * 60e3) return false;
  if (typeof LoadingScreen !== "undefined" && LoadingScreen.isAutomation && LoadingScreen.isAutomation()) return false;
  endHome();
  homeScene = p.scene || null;
  arrival.start({ home: p });
  return true;
}
let handoff = null;
const auto = () => typeof LoadingScreen !== "undefined" && LoadingScreen.isAutomation && LoadingScreen.isAutomation();
function fireHandoff() { const p = handoff; handoff = null; if (p) p.done(); }
function startPitOut(done) {
  handoff = { done };
  if (!GarageArrival.plays(GarageArrival.settings(G.store.get("garageArrival", null)), "pitOut") || reducedMotion() || auto()) { fireHandoff(); return false; }
  endHome(); homeScene = null; arrival.start({ out: true, rate: 1.6 });
  return true;
}
function skipPitOut() { if (!handoff) return false; arrival.finish(); fireHandoff(); return true; }
function startPitIn(done) {
  handoff = { done };
  if (!GarageArrival.plays(GarageArrival.settings(G.store.get("garageArrival", null)), "pitIn") || reducedMotion() || auto()) { fireHandoff(); return false; }
  endHome(); homeScene = null; arrival.start({ skip: "SKIP TO RESULTS" });
  return true;
}
const arrivalCar = new Float32Array(MAT_REFLECT_X);
let setupPreviewAz = 0.6;
const SP_EL_DEF = Math.atan2(1.65, 8.5), SP_DIST_DEF = 8.35;
const SP_FIT_HALF_W = 3.10;
const SP_FIT_DIST_MAX = 11;
let setupPreviewEl = SP_EL_DEF, setupPreviewDist = SP_DIST_DEF;
let setupPreviewSpin = true;
let setupPreviewXOn = false, setupPreviewAeroX = 0;
const SP_EL_MIN = 0, SP_EL_MAX = 1.30, SP_DIST_MIN = 4.6, SP_DIST_MAX = 15, SP_DIST_FREE_MIN = 0.3;
const SP_VIEWS = {
  hero:  { az: Math.PI * 0.78, el: 0.30, dist: 8.35 },
  front: { az: 0,              el: 0.20, dist: 8.2 },
  side:  { az: Math.PI * 0.5,  el: 0.10, dist: 11.2 },
  rear:  { az: Math.PI,        el: 0.22, dist: 8.4 },
  top:   { az: Math.PI * 0.5,  el: 1.20, dist: 11.5 },
  wingFront: { az: Math.PI * 0.30, el: 0.34, dist: 3.6, aim: "front", minDist: 2.0 },
  wingRear:  { az: Math.PI * 0.72, el: 0.50, dist: 4.6, aim: "rear",  minDist: 2.4 },
};
const SP_CAR_CTR = [0, 0.45, 0.245];
const SP_ORBIT_DEF = SP_CAR_CTR.slice(), SP_TGT_DEF = SP_CAR_CTR.slice();
let setupPreviewOrbit = SP_ORBIT_DEF.slice(), setupPreviewTgt = SP_TGT_DEF.slice();
let setupPreviewMinDist = 0, setupPreviewFree = false;
let setupPreviewLens = null;
const spElMin = () => (setupPreviewFree ? -SP_EL_MAX : SP_EL_MIN);
const spDistMin = () => (setupPreviewFree ? SP_DIST_FREE_MIN : (setupPreviewMinDist || SP_DIST_MIN));
let _spEffDist = 0, _spEffFit = 0, _spEffPanel = 0;
const ambientClock = GarageExperience.clock(performance.now());
function garageNow() {
  return G.skyHold ? G.skyT * 1000 : ambientClock.step(performance.now(), !document.hidden && !reducedMotion() && (!home.active || home.moving));
}
let setupPreviewPan = [0, 0, 0];
const _spAim = [0, 0, 0];
const SP_PAN_X = 2.2, SP_PAN_Z = 3.4;
function flapAimPoint(which) {
  const aSt = teamDecalState(Teams.LIST[G.teamIdx], true);
  return Car3D.aeroFlapAim(aSt.val, which, aSt.aero);
}
let setupPreviewView = "hero";
function setSetupView(name) {
  const v = SP_VIEWS[name];
  if (!v) return;
  setupPreviewView = name;
  GarageScene.spot(name);
  setupPreviewFree = false;
  setupPreviewLens = null;
  setupPreviewAz = v.az; setupPreviewEl = v.el; setupPreviewDist = v.dist;
  setupPreviewPan[0] = setupPreviewPan[1] = setupPreviewPan[2] = 0;
  if (v.aim) {
    const p = flapAimPoint(v.aim);
    setupPreviewOrbit = p.slice(); setupPreviewTgt = p.slice();
    setupPreviewMinDist = v.minDist || 0;
  } else {
    setupPreviewOrbit = SP_ORBIT_DEF.slice(); setupPreviewTgt = SP_TGT_DEF.slice();
    setupPreviewMinDist = 0;
  }
  setSetupSpin(false);
}
function setSetupSpin(on) {
  setupPreviewSpin = !!on;
  const b = $("cs-view-spin");
  if (b) {
    b.classList.toggle("active", setupPreviewSpin);
    b.setAttribute("aria-pressed", String(setupPreviewSpin));
  }
}
function stepSetupAero(dt) {
  const want = setupPreviewXOn ? 1 : 0;
  const rate = want > setupPreviewAeroX ? X_OPEN_RATE : X_CLOSE_RATE;
  const step = rate * Math.min(dt, 0.1);
  setupPreviewAeroX = clamp(setupPreviewAeroX + Math.sign(want - setupPreviewAeroX) * step,
                            Math.min(setupPreviewAeroX, want), Math.max(setupPreviewAeroX, want));
}
function setSetupAero(on, opts) {
  setupPreviewXOn = !!on;
  const b = $("cs-aero");
  if (b) {
    b.classList.toggle("active", setupPreviewXOn);
    b.setAttribute("aria-pressed", String(setupPreviewXOn));
    const v = b.querySelector(".cs-aero-val");
    if (v) v.textContent = setupPreviewXOn ? "STRAIGHT MODE" : "CORNER MODE";
  }
}
function setupZoom(mul) {
  if (setupPreviewSpin && !home.active) { if (_spEffDist > 0) setupPreviewDist = _spEffDist; setSetupSpin(false); }
  setupPreviewDist = clamp(setupPreviewDist * mul, spDistMin(), SP_DIST_MAX);
}
function setupPan(strafe, dolly) {
  if (!strafe && !dolly) return;
  const ca = Math.cos(setupPreviewAz), sa = Math.sin(setupPreviewAz);
  setupPreviewPan[0] = clamp(setupPreviewPan[0] + strafe * ca - dolly * sa, -SP_PAN_X, SP_PAN_X);
  setupPreviewPan[2] = clamp(setupPreviewPan[2] - strafe * sa - dolly * ca, -SP_PAN_Z, SP_PAN_Z);
  setSetupSpin(false);
}
function nudgeSetupCam(dAz, dEl, zoom) {
  if (dAz) { setupPreviewAz += dAz; setSetupSpin(false); }
  if (dEl) { setupPreviewEl = clamp(setupPreviewEl + dEl, spElMin(), SP_EL_MAX); setSetupSpin(false); }
  if (zoom) setupZoom(zoom);
}
let spHeld = null;
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
  clearSetupGestures();
  endHome();
  arrival.cancel();
  setupPreviewAz = 0.6;
  setupPreviewEl = SP_EL_DEF;
  setupPreviewDist = SP_DIST_DEF;
  setupPreviewPan[0] = setupPreviewPan[1] = setupPreviewPan[2] = 0;
  setupPreviewOrbit = SP_ORBIT_DEF.slice();
  setupPreviewTgt = SP_TGT_DEF.slice();
  setupPreviewMinDist = 0;
  setupPreviewFree = false;
  setSetupSpin(true);
}
let _spMesh = null, _spMeshKey = "", _spHull = null, _spBase = null, /** @type {ReturnType<typeof GarageDepartureWheels.create> | null} */ departureWheels = null;
let _spWheelDistance = 0, _spWheelSteer = 0;
let _flapBustAt = 0;
const _pk = { now: [], was: [], val: null };
function spMeshBust() {
  _spMeshKey = ""; _pk.val = null; GarageScene.dropPreviewMeshes();
  if (departureWheels) departureWheels.release();
  _flapBustAt = typeof performance !== "undefined" ? performance.now() : 0;
}
function garageSeat() {
  const team = Teams.LIST[G.teamIdx];
  if (typeof GarageScene !== "undefined" && GarageScene.seatDriverAt)
    return GarageScene.seatDriverAt(team, G.driverIdx);
  const seats = (typeof Career !== "undefined" && Career.gridDrivers)
    ? (Career.gridDrivers(team) || team.drivers) : team.drivers;
  return (seats && seats[G.driverIdx]) || (seats && seats[0]) || null;
}
function seatTag(team, seat) { return (seat && seat.num) + (team.legends && seat ? ":" + seat.code : ""); }
function previewKey() {
  const team = Teams.LIST[G.teamIdx], seat = garageSeat(), st = _pk.now;
  st.length = 0;
  st.push(team, team.id, team.engine, team.legends, G.getLiveryId(team.id), seat && seat.num, seat && seat.code,
    Parts.legalityKey ? Parts.legalityKey() : "", typeof GameStore !== "undefined" && GameStore.store ? GameStore.store.rev : 0,
    Career.inCareer() ? Career.data() : null, G.livDraftOverride);
  const parts = getTeamParts(team.id) || {};
  for (const k in parts) st.push(k, parts[k]);
  if (_pk.val !== null && st.length === _pk.was.length) {
    let same = true;
    for (let i = 0; i < st.length; i++) if (st[i] !== _pk.was[i]) { same = false; break; }
    if (same) return _pk.val;
  }
  _pk.was.length = st.length;
  for (let i = 0; i < st.length; i++) _pk.was[i] = st[i];
  _pk.val = team.id + ":" + partsVisualKey(team.id) + ":" + seatTag(team, seat);
  return _pk.val;
}
function getSetupPreviewMesh() {
  const team = Teams.LIST[G.teamIdx];
  const seat = garageSeat();
  const split = (typeof GarageDepartureWheels !== "undefined" && typeof GarageDepartureWheels.create === "function")
    || (typeof CarWheels !== "undefined" && typeof CarWheels.createGarage === "function");
  const key = previewKey() + (split ? "|wheels" : "");
  if (key !== _spMeshKey) {
    const liv = resolveLivery(team);
    const hullKey = hullKeyOf(team.id, partsVisualKey(team.id), seatTag(team, seat), liv) + (split ? "|wheels" : "");
    const skip = new Set(Car3D.FINISH_FIELDS), baseKey = key + "|" + (typeof CarShade !== "undefined" && CarShade.on(team.id)) + "|" + JSON.stringify(liv, function (k, v) { return this === liv && skip.has(k) ? undefined : v; });
    const ent = GarageScene.previewMesh(key, hullKey, () => _spBase && _spBase.key === baseKey ? Car3D.refinish(_spBase.data, liv)
      : (_spBase = { key: baseKey, hullKey, data: Car3D.build(liv.c1, liv.c2, {
        livery: liv, refinish: true, noWheels: split,
        shadeKeep: _spBase && _spBase.hullKey === hullKey && _spBase.data._refinish ? _spBase.data._refinish.keep : undefined,
        teamId: team.id,
        num: seat && seat.num,
        helmetKey: team.legends && seat ? seat.code : undefined,
        parts: Parts.getVisualTiers(getTeamParts(team.id), team),
      }) }).data);
    if (split) {
      if (!departureWheels) {
        departureWheels = (typeof GarageDepartureWheels !== "undefined" && GarageDepartureWheels.create)
          ? GarageDepartureWheels.create(gfx) : CarWheels.createGarage(gfx);
      }
      departureWheels.prepare(key, liv, Parts.getVisualTiers(getTeamParts(team.id), team));
    }
    _spMesh = ent.mesh; _spHull = ent.hull;
    _spMeshKey = key;
  }
  return _spMesh;
}
let /** @type {ReturnType<typeof GarageExterior.create> | null} */ exterior = null, exteriorBoot = null, exteriorBootKey = "", exteriorEpoch = 0, exteriorDrawn = false;
let exteriorSelection = null, exteriorRequested = null, exteriorHeld = null, exteriorSequence = false, exteriorVisible = false, exteriorLight = null, exteriorAnchor = null;
const exteriorSkyInv = new Float32Array(16);
let homeScene = null;
function exteriorPick(ctx, session) {
  const arriving = !driveOut && !!(arrival.state && arrival.state.active), seq = !!driveOut || arriving, pin = arriving && homeScene;
  const t = pin ? pin.track : (session || seq) && Tracks.LIST[G.trackIdx] || ctx.track, team = Teams.LIST[G.teamIdx];
  const tod = pin ? pin.tod : home.active && home.mode === "night" ? "night" : G.raceTimeOfDay || "default", weather = pin ? pin.weather : G.raceWeather || "dry";
  const night = tod === "night" || (tod === "default" && !!(t && t.night));
  const p = exteriorSelection;
  if (!p || p.trackId !== (t && t.id) || p.teamId !== (team && team.id) || p.weather !== weather || p.tod !== tod || p.night !== night)
    exteriorSelection = { trackId: t && t.id, teamId: team && team.id, def: t, weather, tod, night };
  return exteriorSelection;
}
function prepareExterior(ctx, pose, session) {
  if (!deps.prepareExterior || ctx.studio) return false;
  const selection = exteriorPick(ctx, session), sequence = !!(pose && pose.active);
  if (sequence && !exteriorSequence) { exteriorHeld = selection; exteriorVisible = !!(exterior && exterior.ready(selection)); }
  if (!sequence) { exteriorHeld = null; exteriorVisible = true; }
  exteriorSequence = sequence;
  const pick = exteriorHeld || selection;
  if (!exterior && !exteriorBoot && exteriorBootKey !== pick.trackId) {
    const generation = ++exteriorEpoch; exteriorBootKey = pick.trackId;
    exteriorBoot = deps.prepareExterior(pick.trackId).then((def) => {
      if (generation !== exteriorEpoch || !def || typeof GarageExterior === "undefined") return;
      exterior = GarageExterior.create({ gfx, load: (choice) => deps.prepareExterior(choice.trackId), sliceMs: exteriorSliceMs,
        onChange: (state) => { exteriorLight = null; exteriorAnchor = state.anchor || null; if (state.status === "failed") Log.warn("game", "garage exterior unavailable: " + state.error); } });
      exteriorRequested = exteriorHeld || exteriorSelection; exterior.request(exteriorRequested);
    }).catch((e) => { Log.warn("game", "garage exterior preparation failed: " + e.message); })
      .finally(() => { if (generation === exteriorEpoch) exteriorBoot = null; });
  }
  if (exterior && exteriorRequested !== pick) { exteriorRequested = pick; exteriorLight = null; exterior.request(pick); }
  if (sequence && pose.door < .02 && exterior && exterior.ready()) exteriorVisible = true;
  return !!(exterior && exterior.ready() && exteriorVisible);
}
const EXTERIOR_WAIT_MS = 12000;
let exteriorWait = { pick: null, at: 0 }, exteriorWaitSeen = -Infinity;
function exteriorSliceMs() { return performance.now() - exteriorWaitSeen < 250 ? 6 : 0; }
function exteriorSettled() {
  const ctx = deps.prepareExterior ? garageCtx() : null;
  if (!ctx || ctx.studio) return true;
  const pick = exteriorHeld || exteriorPick(ctx), st = exterior ? exterior.state() : null;
  const dead = st ? st.trackId === pick.trackId && (st.status === "unsupported" || st.status === "failed")
    : !exteriorBoot && exteriorBootKey === pick.trackId;
  if (dead || (exterior && exterior.ready(pick))) { exteriorWait.pick = null; return true; }
  const now = performance.now();
  if (exteriorWait.pick !== pick) exteriorWait = { pick, at: now };
  if (now - exteriorWait.at < EXTERIOR_WAIT_MS) { exteriorWaitSeen = now; return false; }
  if (exteriorWait.at > 0) { exteriorWait.at = -Infinity; Log.warn("game", "garage exterior not ready: the sequence plays without it", st); }
  return true;
}
function driveOutCovered(hold) { return !!(hold && driveOut) && !exteriorSettled(); }
function exteriorLighting() {
  if (exteriorLight) return exteriorLight;
  const light = exterior.lighting(), yaw = exteriorAnchor ? exteriorAnchor.yaw : 0;
  const c = Math.cos(yaw), s = Math.sin(yaw), x = light.sunDir[0], z = light.sunDir[2];
  light.sunDir[0] = x * c - z * s; light.sunDir[2] = x * s + z * c;
  light.sky.sunDir = light.sunDir;
  for (let i = 0; i < 3; i++) { light.sunColor[i] *= .55; light.ambientSky[i] *= .55; light.ambientGround[i] *= .55; }
  return exteriorLight = light;
}
function releaseExterior() {
  exteriorEpoch++; exteriorBoot = null; exteriorBootKey = ""; exteriorDrawn = false;
  if (exterior) exterior.release();
  exteriorRequested = null; exteriorHeld = null; exteriorSequence = false; exteriorVisible = false; exteriorLight = null; exteriorAnchor = null;
}
const _garageCtx = {
  track: null, weather: null, tod: null, night: false, wins: 0, last: null,
  sponsor: null, career: false, round: 0, spin: false, achievements: null,
  sceneNow: 0, ambient: true, studio: false, unlimited: false,
};
let _winsCacheRef = null, _winsCacheN = -1, _winsCacheV = 0;
let _cmRev = -1, _cmC = null, _cmN = -1, _cmH = -1, _cmRound = -1, _cmSponsor = null, _cmAch = null;
function garageCtx(asSetup = false) {
  const c = Career.inCareer() ? Career.data() : null, h = home.active && !asSetup;
  const t = c ? (Career.calendar ? Career.calendar() : Tracks.SEASON)[c.season.round % (Career.calendar ? Career.calendar() : Tracks.SEASON).length]
          : (G.seasonMode && G.season) ? SeasonCal.track(G.season.round) : Tracks.LIST[G.trackIdx];
  const ctx = _garageCtx;
  ctx.track = t;
  ctx.weather = G.raceWeather;
  ctx.tod = G.raceTimeOfDay;
  ctx.night = h ? home.mode === "night"
    : (G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && !!(t && t.night)));
  ctx.bayNight = ctx.night;
  if (c) {
    const n = c.results.length;
    if (n !== _winsCacheN || c.results !== _winsCacheRef) {
      let w = 0;
      for (let i = 0; i < n; i++) if (c.results[i].p === 1) w++;
      _winsCacheRef = c.results; _winsCacheN = n; _winsCacheV = w;
    }
    ctx.wins = _winsCacheV;
    ctx.last = n ? c.results[n - 1] : null;
    const hn = Array.isArray(c.history) ? c.history.length : 0;
    if (G.store.rev !== _cmRev || c !== _cmC || n !== _cmN || hn !== _cmH || c.season.round !== _cmRound) {
      _cmRev = G.store.rev; _cmC = c; _cmN = n; _cmH = hn; _cmRound = c.season.round;
      _cmSponsor = Career.sponsor();
      _cmAch = typeof CareerExperience !== "undefined" ? CareerExperience.garageMetadata() : null;
    }
    ctx.sponsor = _cmSponsor;
    ctx.career = true;
    ctx.round = c.season.round;
  } else {
    ctx.wins = 0; ctx.last = null; ctx.sponsor = null; ctx.career = false; ctx.round = 0;
  }
  ctx.spin = setupPreviewSpin;
  ctx.achievements = c ? _cmAch : typeof CareerExperience !== "undefined" ? CareerExperience.garageMetadata() : null;
  ctx.sceneNow = asSetup ? ambientClock.value : garageNow();
  ctx.ambient = !reducedMotion() && (!h || home.moving);
  ctx.studio = !!(h && home.mode === "studio");
  ctx.unlimited = !!G.unlimitedBudget;
  return typeof GarageScene !== "undefined" && GarageScene.moodCtx ? GarageScene.moodCtx(ctx) : ctx;
}
function captureCamera() {
  return { az: setupPreviewAz, el: setupPreviewEl, dist: setupPreviewDist, spin: setupPreviewSpin,
    orbit: setupPreviewOrbit.slice(), target: setupPreviewTgt.slice(), pan: setupPreviewPan.slice(),
    minDist: setupPreviewMinDist, free: setupPreviewFree, xOn: setupPreviewXOn, aeroX: setupPreviewAeroX, view: setupPreviewView };
}
function restoreCamera(s) {
  if (!s) return;
  setupPreviewAz = s.az; setupPreviewEl = s.el; setupPreviewDist = s.dist;
  setupPreviewOrbit = s.orbit.slice(); setupPreviewTgt = s.target.slice(); setupPreviewPan = s.pan.slice();
  setupPreviewMinDist = s.minDist; setupPreviewFree = s.free; setupPreviewAeroX = s.aeroX;
  setSetupAero(s.xOn);
  setupPreviewView = s.view; GarageScene.spot(s.view); setSetupSpin(s.spin);
}
function setHomeView(name, pose) {
  setSetupView(name);
  setupPreviewAz = pose.az; setupPreviewEl = pose.el; setupPreviewDist = pose.dist;
}
const home = GarageExperience.homeSession({ capture: captureCamera, restore: restoreCamera, view: setHomeView }, reducedMotion);
function beginHome(mode, opts) {
  if (preview || driveOut || ($("carsetup") && !$("carsetup").hidden)) return false;
  return home.begin(mode, opts);
}
function endHome() { return home.end(); }
const _spProj = new Float32Array(16), _spView = new Float32Array(16), _spVP = new Float32Array(16);
const _spInvProj = new Float32Array(16);
const _spEye = [0, 0, 0], _spUp = [0, 1, 0], _spSun = [0, 0.86, 0.51];
const _spLiv = () => resolveLivery(Teams.LIST[G.teamIdx]);
const GARAGE_PHONE_SCALE = 0.72;
let _resPinned = false, _resPrev = 1;
function pinGarageRes() {
  if (_resPinned || !(gfx.isMobile || gfx.mobileTier) || !gfx.setRenderScale || !gfx.getRenderScale) return;
  const cur = gfx.getRenderScale();
  _resPrev = cur;
  _resPinned = true;
  if (cur > GARAGE_PHONE_SCALE + 0.02) gfx.setRenderScale(GARAGE_PHONE_SCALE);
}
function endGarageRes() {
  if (!_resPinned) return;
  _resPinned = false;
  if (gfx.setRenderScale) gfx.setRenderScale(_resPrev || 1);
}
const _covPr = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
const _covCr = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
const _covNow = [], _covWas = [];
let _covX = 0, _covY = 0, _covPanel = null, _covCanvas = null, _covCam = null;
function _stampRect(out, r) {
  out.left = r.left; out.top = r.top; out.width = r.width; out.height = r.height;
  out.right = r.right; out.bottom = r.bottom;
  return out;
}
const BAY_MIN_MS = 24, BAY_GAP_MS = 250;
let _bayAt = 0, _bayAcc = 0, _bayBusy = true;
let _seqMoodWas = null, _seqBars = false, _seqSound = false, _seqSoundAt = 0;
const _seqCue = { id: null, t: 0 };
function sequenceLook(p) {
  const on = !!(p && p.active), want = on && p.mood;
  if (!on) { exteriorHeld = null; exteriorSequence = false; exteriorVisible = false; }
  const sound = on && !!p.sound && p.engine !== false && !driveOut && !(preview && G.state === "race");
  if (sound && !_seqSound && !_outEngine) { driveOutEngine(true); _seqSound = _outEngine; _seqSoundAt = 0; }
  else if (!sound && _seqSound) { _seqSound = false; driveOutEngine(false); }
  if (sound && _seqSound) { const now = performance.now(); driveOutSound(p, _seqSoundAt ? (now - _seqSoundAt) / 1000 : 0); _seqSoundAt = now; }
  if (typeof GarageScene !== "undefined" && GarageScene.mood) {
    if (want && GarageScene.mood() !== want) { if (_seqMoodWas === null) _seqMoodWas = GarageScene.mood(); GarageScene.mood(want); }
    else if (!want && _seqMoodWas !== null) { GarageScene.mood(_seqMoodWas); _seqMoodWas = null; }
  }
  const bars = on && !!p.bars;
  if (bars !== _seqBars && typeof document !== "undefined" && document.body) { _seqBars = bars; document.body.toggleAttribute("data-ga-bars", bars); }
}
function drawDepartureReflection(matrix, material) {
  if (departureWheels) departureWheels.draw(matrix, _spWheelDistance, _spWheelSteer, material);
}
function renderSetupPreview(dt, holdDriveOut = false) {
  exteriorDrawn = false;
  if (G.setupPreviewOn && !home.active && typeof GaragePrebuild !== "undefined" && GaragePrebuild.packSettled) {
    const pack = typeof Assets !== "undefined" && Assets.state ? Assets.state() : null;
    if (!GaragePrebuild.packSettled(pack)) return false;
  }
  if (G.setupPreviewOn && dt > 0 && (gfx.isMobile || gfx.mobileTier)) {
    const t = performance.now(), gap = t - _bayAt;
    if (gap < BAY_GAP_MS) {
      if (!_bayBusy && !holdDriveOut && gap < BAY_MIN_MS) { _bayAcc += dt; return false; }
      dt += _bayAcc;
    }
    _bayAcc = 0; _bayAt = t;
  }
  if (typeof MirrorPass !== "undefined" && MirrorPass.instance()) MirrorPass.instance().standDown();
  if (home.active && $("photo-studio") && !$("photo-studio").hidden) endGarageRes();
  else pinGarageRes();
  gfx.resize();
  const arrivalHeld = () => typeof exteriorSettled === "function" && !!(arrival.state && arrival.state.active) && !exteriorSettled();
  const arriving = home.active ? null : driveOut ? stepDriveOut(holdDriveOut) : preview ? stepPreview(dt) : arrival.step(dt, arrivalHeld());
  if (handoff && !driveOut && !preview && !home.active && !(arriving && arriving.active)) fireHandoff();
  const context = garageCtx(), sceneTime = context.sceneNow;
  context.realExterior = typeof prepareExterior === "function" && prepareExterior(context, arriving);
  if (context.realExterior && arriving && typeof GarageExterior.fitPose === "function") {
    GarageExterior.fitPose(arriving, exteriorAnchor, !!driveOut && driveOut.cfg.angle === "cut");
    if (arriving.exteriorUnsupported) context.realExterior = false;
    else exterior.groundPose(arriving, !!driveOut && driveOut.cfg.angle === "cut" && !reducedMotion());
  }
  if (arriving) {
    const owner = driveOut || ((preview && (preview.dir === "out" || preview.dir === "home")) ? preview : null);
    if (owner && !Number.isFinite(arriving.distance)) {
      if (typeof GarageDepartureWheels !== "undefined" && GarageDepartureWheels.accumulateTravel) {
        arriving.distance = GarageDepartureWheels.accumulateTravel(owner, arriving);
      } else {
        const tr = owner.travel || (owner.travel = { x: arriving.x, z: arriving.z, distance: 0, primed: false });
        if (!tr.primed) { tr.x = arriving.x; tr.z = arriving.z; tr.distance = 0; tr.primed = true; }
        else { tr.distance += Math.hypot(arriving.x - tr.x, arriving.z - tr.z); tr.x = arriving.x; tr.z = arriving.z; }
        arriving.distance = tr.distance;
      }
    }
    if (driveOut && driveOut.motion) {
      if (Number.isFinite(arriving.distance)) driveOut.motion.distance = arriving.distance;
      driveOut.motion.yaw = arriving.yaw;
    }
  }
  _spWheelDistance = arriving && Number.isFinite(arriving.distance) ? arriving.distance : 0;
  _spWheelSteer = arriving ? -.45 * Math.sin(2 * (arriving.yaw || 0)) : 0;
  sequenceLook(arriving);
  if (typeof GarageScene !== "undefined" && GarageScene.moodCtx) GarageScene.moodCtx(context);
  _bayBusy = home.active || !!driveOut || !!preview || !!(arriving && arriving.active);
  if (!home.active && (!arriving || !arriving.active)) applyHeldSetupCam(dt);
  if ((home.active ? home.moving : setupPreviewSpin) && !(arriving && arriving.active)) setupPreviewAz += dt * (home.active ? 0.035 : 0.35);
  if (!home.active) stepSetupAero(dt);
  const spCe = Math.cos(setupPreviewEl), spSe = Math.sin(setupPreviewEl);
  const canvasEl = $("game"), panelEl = home.active ? home.panel : $("cs-inner");
  const photoOpen = home.active && $("photo-studio") && !$("photo-studio").hidden;
  const autoFrame = !photoOpen && (setupPreviewSpin || home.active);
  let homePane = null;
  if (home.active) getSetupPreviewMesh();
  let panelFrac = 0, panelFracY = 0;
  if (!(arriving && arriving.active) && canvasEl && panelEl && canvasEl.clientWidth > 0 && canvasEl.clientHeight > 0) {
    const cam = home.active ? null : $("cs-cam-panel");
    const camOn = !!(cam && !cam.hidden && cam.offsetParent !== null);
    const zP = window.CssZoom ? CssZoom.of(panelEl) : 1;
    const zC = window.CssZoom ? CssZoom.of(canvasEl) : 1;
    const st = _covNow;
    st[0] = canvasEl.clientWidth; st[1] = canvasEl.clientHeight; st[2] = panelEl.clientWidth; st[3] = panelEl.clientHeight;
    st[4] = camOn ? cam.clientWidth : -1; st[5] = camOn ? cam.clientHeight : -1; st[6] = zP; st[7] = zC; st[8] = home.active;
    st[9] = document.documentElement.getAttribute("data-look-garage-side");
    let same = _covWas.length === st.length;
    for (let i = 0; same && i < st.length; i++) if (st[i] !== _covWas[i]) same = false;
    if (!same || panelEl !== _covPanel || canvasEl !== _covCanvas || cam !== _covCam) {
      for (let i = 0; i < st.length; i++) _covWas[i] = st[i];
      _covPanel = panelEl; _covCanvas = canvasEl; _covCam = cam;
      const pr = _stampRect(_covPr, (window.CssZoom && CssZoom.viewportRect(panelEl)) || panelEl.getBoundingClientRect());
      const cr = _stampRect(_covCr, canvasEl.getBoundingClientRect());
      const camTop = () => camOn
        ? ((window.CssZoom && CssZoom.viewportRect(cam)) || cam.getBoundingClientRect()).top
        : canvasEl.clientHeight;
      const cover = panelCover(pr, cr, canvasEl.clientWidth, canvasEl.clientHeight, camTop);
      _covX = cover.x; _covY = cover.y;
    }
    if (home.active) homePane = GarageExperience.freePane(_covPr, _covCr);
    panelFrac = _covX; panelFracY = _covY;
  }
  const spFitD = Math.min(SP_FIT_DIST_MAX,
    SP_FIT_HALF_W / Math.max(Math.tan(18 * Math.PI / 180) * gfx.aspect * (1 - Math.abs(panelFrac)), 0.05));
  const homeFov = homePane && gfx.aspect < 1 ? 72 : (home.lens && home.lens.fov) || 36;
  const homeFit = !photoOpen && homePane && GarageExperience.fitHome(_spHull, { az: setupPreviewAz, el: setupPreviewEl,
    center: setupPreviewTgt, aspect: gfx.aspect, fov: homeFov, minDist: SP_DIST_MIN, maxDist: home.lens.maxDist || SP_FIT_DIST_MAX }, homePane);
  const spDist = homeFit ? homeFit.dist : autoFrame
    ? clamp(Math.max(setupPreviewDist, spFitD), SP_DIST_MIN, SP_DIST_MAX) : setupPreviewDist;
  _spEffDist = spDist; _spEffFit = homeFit ? homeFit.dist : spFitD; _spEffPanel = panelFrac;
  const eye = _spEye;
  eye[0] = setupPreviewOrbit[0] + setupPreviewPan[0] + Math.sin(setupPreviewAz) * spDist * spCe;
  eye[1] = setupPreviewOrbit[1] + setupPreviewPan[1] + spDist * spSe;
  eye[2] = setupPreviewOrbit[2] + setupPreviewPan[2] + Math.cos(setupPreviewAz) * spDist * spCe;
  const lens = setupPreviewLens;
  M4.perspectiveTo(_spProj, (lens && lens.fov || homeFov) * Math.PI / 180, gfx.aspect, 0.1, 800);
  _spProj[8] = panelFrac;
  _spProj[9] = panelFracY;
  if (homeFit) { _spProj[8] = homeFit.shiftX; _spProj[9] = homeFit.shiftY; }
  if (lens && lens.centre) { _spProj[8] = 0; _spProj[9] = 0; }
  _spAim[0] = setupPreviewTgt[0] + setupPreviewPan[0];
  _spAim[1] = setupPreviewTgt[1] + setupPreviewPan[1];
  _spAim[2] = setupPreviewTgt[2] + setupPreviewPan[2];
  if (arriving && arriving.active) {
    eye[0] = arriving.eye[0]; eye[1] = arriving.eye[1]; eye[2] = arriving.eye[2];
    _spAim[0] = arriving.aim[0]; _spAim[1] = arriving.aim[1]; _spAim[2] = arriving.aim[2];
    M4.perspectiveTo(_spProj, (gfx.aspect < 1 ? Math.min(85, arriving.fov + 14) : arriving.fov) * Math.PI / 180, gfx.aspect, 0.1, 800);
  }
  M4.lookAtTo(_spView, eye, _spAim, _spUp);
  M4.mulTo(_spVP, _spProj, _spView);
  GarageScene.recentre(_spProj, _spView, _spVP, panelFrac, !homeFit && autoFrame && !(lens && lens.centre) && !(arriving && arriving.active), _spHull);
  M4.invertTo(_spInvProj, _spProj);
  const outside = context.realExterior ? exteriorLighting() : null;
  context.door = arriving && arriving.active ? arriving.door : 1;
  context.swell = arriving && arriving.active && Number.isFinite(arriving.swell) ? arriving.swell : 1;
  if (arriving && arriving.active && arriving.cue) { _seqCue.id = arriving.cue; _seqCue.t = arriving.seconds || 0; context.cue = _seqCue; }
  else context.cue = null;
  const liv = _spLiv();
  const lightsRig = GarageScene.live(liv, sceneTime, context);
  if (gfx.begin({
    viewProj: _spVP, view: _spView, eye, sunDir: outside ? outside.sunDir : (GarageScene.moodDef && GarageScene.moodDef().sun) || _spSun, sunColor: outside ? outside.sunColor : GarageScene.SKYLIGHT,
    ambientSky: outside ? outside.ambientSky : GarageScene.AMB_SKY, ambientGround: outside ? outside.ambientGround : GarageScene.AMB_GROUND,
    fogColor: outside ? outside.fogColor : GarageScene.BACKDROP, fogDensity: outside ? outside.fogDensity : 0, lights: lightsRig,
    proj: _spProj, invProj: _spInvProj,
    noEnv: true,
  }) === false) return false;
  if (context.realExterior) exteriorDrawn = exterior.draw();
  const spMat = carPaintMat(PAINT_DRY_DAY);
  spMat.sparkle = 0.12;
  const ay = (arriving && arriving.yaw) || 0, ac = Math.cos(ay), as = Math.sin(ay);
  arrivalCar[0] = -ac; arrivalCar[2] = as; arrivalCar[8] = as; arrivalCar[10] = ac;
  arrivalCar[12] = (arriving && arriving.x) || 0; arrivalCar[14] = arriving ? arriving.z : 0;
  arrivalCar[1] = arrivalCar[4] = arrivalCar[6] = arrivalCar[9] = arrivalCar[13] = 0; arrivalCar[5] = 1;
  if (context.realExterior && arriving) GarageExterior.poseMatrix(arriving, arrivalCar);
  const team = Teams.LIST[G.teamIdx];
  const carMesh = getSetupPreviewMesh();
  context.departureWheels = departureWheels ? drawDepartureReflection : null;
  GarageScene.draw(team, liv, eye, getTeamParts, G.driverIdx, context, carMesh, arriving, arrivalCar);
  gfx.draw(carMesh, arrivalCar, spMat);
  drawDepartureReflection(arrivalCar, spMat);
  if (arriving && arriving.active && GarageArrival.rearLightOn(arriving, context.night || /rain|wet|storm/.test(String(context.weather || ""))) && CarMesh.drawRearLights)
    CarMesh.drawRearLights(arrivalCar, 1);
  {
    const aSt = teamDecalState(team, true);
    drawAeroFlaps(team, aSt.val, setupPreviewAeroX, arrivalCar, spMat,
      aSt.aero);
    if (_flapBustAt && typeof CarMesh !== "undefined" && CarMesh.releaseIdleFlaps) {
      CarMesh.releaseIdleFlaps(Math.max(0, performance.now() - _flapBustAt));
      _flapBustAt = 0;
    }
  }
  const gSeat = garageSeat();
  drawCarDecals(team, arrivalCar, true,
    (gSeat && gSeat.num) || carDecalNum(team, null), false, true);
  if (surfaceOutline && typeof GarageSurfaceInspection !== "undefined" && GarageSurfaceInspection.field()) {
    const mesh = deps.previewDecalMesh ? deps.previewDecalMesh(team) : null;
    if (mesh) surfaceOutline.draw(mesh, arrivalCar);
  }
  gfx.drawGlow(lightsRig, PostCommon.softwareGlowScale(GarageScene.glareStr() * glareScale() * moodDef().glare));
  if (outside && gfx.drawSky) {
    M4.invertTo(exteriorSkyInv, _spVP); outside.sky.invViewProj = exteriorSkyInv; outside.sky.time = sceneTime / 1000; gfx.drawSky(outside.sky);
    if (exterior.drawWeather) exterior.drawWeather(sceneTime, reducedMotion());
  }
  gfx.present(presentOpts());
  return !(gfx.warming && gfx.warming());
}

function setSetupCamPanel(open) {
  const b = $("cs-cam"), p = $("cs-cam-panel");
  if (!b || !p) return;
  p.hidden = !open;
  b.setAttribute("aria-expanded", open ? "true" : "false");
}
const setupCamPanelOpen = () => !$("cs-cam-panel").hidden;
$("cs-cam").onclick = () => {
  setSetupCamPanel(!setupCamPanelOpen());
  if (G.soundOn) GameAudio.uiTick();
};
document.addEventListener("pointerdown", (e) => {
  if (!G.setupPreviewOn || !setupCamPanelOpen()) return;
  if (!e.target.closest || !e.target.closest("#cs-stack")) setSetupCamPanel(false);
}, true);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && G.setupPreviewOn && setupCamPanelOpen()
      && !document.querySelector("dialog[open], dialog.screen:not([hidden])")) {
    setSetupCamPanel(false);
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

for (const btn of document.querySelectorAll("#cs-stack [data-cs-view]")) {
  btn.onclick = () => {
    setSetupView(btn.dataset.csView);
    setSetupCamPanel(false);
    if (G.soundOn) GameAudio.uiTick();
  };
}
$("cs-view-spin").onclick = () => { setSetupSpin(!setupPreviewSpin); if (G.soundOn) GameAudio.uiTick(); };
$("cs-view-reset").onclick = () => { resetSetupCam(); if (G.soundOn) GameAudio.uiTick(); };
const setupGestureResets = [];
function clearSetupGestures() {
  spHeld = null;
  for (const reset of setupGestureResets) reset();
}
function holdSetupCtl(id, rates, step) {
  const el = $(id);
  if (!el) return;
  let pointerId = null;
  const release = (e) => {
    if (e && e.type !== "blur" && e.pointerId !== pointerId) return;
    pointerId = null;
    if (spHeld === rates) spHeld = null;
  };
  setupGestureResets.push(() => release());
  el.addEventListener("pointerdown", (e) => {
    if (!G.setupPreviewOn || driveOut || preview || (arrival.state && arrival.state.active)) return;
    if (pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch (_) {  }
    step();
    spHeld = rates;
    if (G.soundOn) GameAudio.uiTick();
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, release);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  window.addEventListener("blur", release);
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
$("cs-aero").onclick = () => { setSetupAero(!setupPreviewXOn); if (G.soundOn) GameAudio.uiTick(); };
{
  const canvas = $("game");
  const spPtr = new Map();
  let spPinch = 0;
  setupGestureResets.push(() => { spPtr.clear(); spPinch = 0; });
  const pinchGap = () => {
    const p = [...spPtr.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  };
  function canPointerOrbit(e) {
    const photo = $("photo-studio"), photoOpen = !!photo && !photo.hidden;
    const panel = photoOpen && $("ps-panel");
    const r = panel && ((window.CssZoom && CssZoom.viewportRect(panel)) || panel.getBoundingClientRect());
    const inPanel = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    return GarageExperience.canOrbit(G.setupPreviewOn, home.active, photoOpen,
      !!driveOut || !!preview || !!(arrival.state && arrival.state.active) || !!inPanel
        || !!(e.target && e.target.closest && e.target.closest("#ps-panel")));
  }
  if (canvas) {
    canvas.addEventListener("pointerdown", (e) => {
      if (!canPointerOrbit(e)) return;
      spPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      spPinch = pinchGap();
      if (spPtr.size === 1) setSetupSpin(false);
    });
    window.addEventListener("pointermove", (e) => {
      if (!spPtr.has(e.pointerId)) return;
      const p = spPtr.get(e.pointerId);
      if (!canPointerOrbit(e)) {
        p.x = e.clientX; p.y = e.clientY; spPinch = pinchGap(); return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (spPtr.size >= 2) {
        const gap = pinchGap();
        if (spPinch > 0 && gap > 0) setupZoom(spPinch / gap);
        spPinch = gap;
        return;
      }
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
    canvas.addEventListener("lostpointercapture", release);
    canvas.addEventListener("wheel", (e) => {
      if (!canPointerOrbit(e)) return;
      e.preventDefault();
      setupZoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
  }
}
window.addEventListener("blur", clearSetupGestures);
window.addEventListener("pagehide", clearSetupGestures);
document.addEventListener("visibilitychange", () => { if (document.hidden) clearSetupGestures(); });
if (typeof MutationObserver === "function") {
  for (const surface of [$("carsetup"), $("photo-studio")]) {
    if (surface) new MutationObserver(() => { if (surface.hidden) { clearSetupGestures(); if (!home.active && !driveOut && typeof releaseExterior === "function") releaseExterior(); } })
      .observe(surface, { attributes: true, attributeFilter: ["hidden"] });
  }
}

if (typeof GarageSurfaceInspection !== "undefined") GarageSurfaceInspection.bind({
  capture: captureCamera, restore: restoreCamera, show: setSetupView,
  highlight(field) {
    if (!surfaceOutline) return false;
    if (!field) { surfaceOutline.clear(); return false; }
    if (!deps.previewDecalMesh) return false;
    const team = Teams.LIST[G.teamIdx], seat = garageSeat();
    return surfaceOutline.set(field, team, resolveLivery(team), (seat && seat.num) || carDecalNum(team, null));
  },
  eligible: () => !!$("carsetup") && !$("carsetup").hidden,
});

return {
  beginHome, endHome, renderHome(dt) { return home.active && renderSetupPreview(dt); }, homeState: () => home.state(),
  captureCamera, restoreCamera,
  startArrival(...args) { endHome(); homeScene = null; return arrival.start(...args); }, cancelArrival() { handoff = null; arrival.cancel(); sequenceLook(null); }, startPitOut, startPitIn, skipPitOut, noteResult, startHome,
  startDriveOut, driveOutLeft, stopDriveOut() { driveOut = null; driveOutEngine(false); clearSetupGestures(); if (departureWheels) departureWheels.release(); _spMeshKey = ""; sequenceLook(null); },
  renderSetupPreview: (dt, hold) => renderSetupPreview(dt, hold) && !driveOutCovered(hold), resetSetupCam, setSetupCamPanel, spMeshBust, endGarageRes,
  stepSetupAero, setSetupView, setSetupAero, setupPan, nudgeSetupCam,
  setSetupAim(p) { setupPreviewOrbit = p.slice(); setupPreviewTgt = p.slice(); },
  setSetupFree(on) { setupPreviewFree = !!on; setupPreviewLens = on && typeof on === "object" ? on : null; },
  get spin() { return setupPreviewSpin; },
  get az() { return setupPreviewAz; },
  get el() { return setupPreviewEl; },
  get dist() { return setupPreviewDist; },
  get pan() { return setupPreviewPan; },
  get aeroX() { return setupPreviewAeroX; },
  get xOn() { return setupPreviewXOn; },
  get effDist() { return _spEffDist; },
  get effFit() { return _spEffFit; },
  get effPanel() { return _spEffPanel; },
  prewarmExterior() { if (typeof prepareExterior === "function" && !driveOut && !(arrival.state && arrival.state.active)) prepareExterior(garageCtx(true), null, true); },
  exteriorState: () => exterior ? Object.assign(exterior.state(), { visible: exteriorDrawn }) : { status: exteriorBoot ? "loading" : "idle", visible: false },
  previewKey, prebuildKey: () => previewKey() + "|" + GarageScene.ctxKey(garageCtx(true)),
  prebuild(part) {
    if (part === "car") return !!getSetupPreviewMesh();
    const team = Teams.LIST[G.teamIdx], ctx = garageCtx(true), rs = $("race-settings");
    prepareExterior(ctx, null, !!(rs && !rs.hidden));
    return GarageScene.prepare(team, _spLiv(), getTeamParts, G.driverIdx, ctx);
  },
  roomReady() { return GarageScene.prepared(Teams.LIST[G.teamIdx], _spLiv(), getTeamParts, G.driverIdx, garageCtx(true)); },
  release() {
    if (G.setupPreviewOn) return false;
    if (departureWheels) departureWheels.release();
    if (typeof releaseExterior === "function") releaseExterior(); GarageScene.release(); _spMesh = null; _spMeshKey = ""; _spBase = null;
    return true;
  },
  get meshKey() { return _spMeshKey.endsWith("|wheels") ? _spMeshKey.slice(0, -7) : _spMeshKey; },
  set meshKey(v) { if (v === "") spMeshBust(); else _spMeshKey = v; },
};
}

return { create, panelCover, presentOpts, glareScale, hullKeyOf };
})();
Object.freeze(SetupCamera);
