/* Apex 26 — PER-CAMERA-MODE framing offsets (the CAMERA TUNER's data layer): the knob registry (CAM_TUNE_DEFS), the per-mode override store (localStorage apex26.c… */
const CamTune = (function () {
  "use strict";

const { store } = GameStore;
const KEY = "camTune";
const DEG = Math.PI / 180;
const clamp = M4.clamp;                       // shared scalar helper (js/core/mat4.js)

// The six knobs, in panel order. `def` is 0 for all of them by construction:
// zero MUST mean "the framing js/game/cameras.js shipped", so RESET is exact
// and a value only ever needs storing when the player actually moved it.
const CAM_TUNE_DEFS = [
  { id: "height", label: "HEIGHT",   min: -6,  max: 10, step: 0.025, def: 0, unit: "m",
    help: "Raise or lower the camera eye. The aim stays on the car, so raising it looks further down over the nose." },
  { id: "dist",   label: "DISTANCE", min: -12, max: 24, step: 0.025, def: 0, unit: "m",
    help: "Pull the eye back (+) or push it in (−) along the view direction. On the onboard cams this slides the seat fore/aft." },
  { id: "side",   label: "SIDE",     min: -12, max: 12, step: 0.025, def: 0, unit: "m",
    help: "Offset the eye right (+) or left (−) of the view axis for a three-quarter angle on the car." },
  { id: "pitch",  label: "PITCH",    min: -45, max: 45, step: 0.25, def: 0, unit: "°",
    help: "Tilt the aim up (+) or down (−). Positive shows more sky and horizon, negative more road." },
  { id: "yaw",    label: "YAW",      min: -90, max: 90, step: 0.25, def: 0, unit: "°",
    help: "Pan the aim right (+) or left (−) without moving the eye." },
  { id: "fov",    label: "FOV",      min: -35, max: 35, step: 0.25, def: 0, unit: "°",
    help: "Widen (+) or tighten (−) the field of view on top of the mode's own speed-scaled FOV. Solved FOV is clamped 20–110°: a tight onboard (~36°) clips the last −16° of this slider, and a wide chase (~81°) clips the last few + degrees." },
  // CORNER LEAD is not a geometric offset like the six above — CamTune.apply()
  // never touches it. js/game/cameras.js reads it directly in the chase/far
  // branch and blends the rig toward the classic road-frame chase (eye back
  // along the road, aim at the curved centreline ahead), so the camera leads
  // and swings INTO turns. 0 = locked to the car (the shipped free-world rig);
  // 1 = the old corner-following chase. Only chase/far read it — `modes` gates
  // which cameras show the slider.
  { id: "cornerLead", label: "CORNER LEAD", min: 0, max: 1, step: 0.02, def: 0, unit: "", modes: ["chase", "far"],
    help: "Let the chase camera lead and swing INTO corners like the classic chase. 0 stays locked behind the car; higher follows the bend. Purely visual — never affects the car." },
];
const DEF_BY_ID = {};
for (const d of CAM_TUNE_DEFS) DEF_BY_ID[d.id] = d;

const FOV_MIN = 20, FOV_MAX = 110;

let _store = {};
let _any = false;            // fast path: skip apply() entirely when nothing is tuned

function sanitize(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const mode of Object.keys(raw)) {
    const src = raw[mode];
    if (!src || typeof src !== "object") continue;
    const prof = {};
    for (const d of CAM_TUNE_DEFS) {
      const v = src[d.id];
      if (typeof v === "number" && isFinite(v) && v !== d.def) prof[d.id] = clamp(v, d.min, d.max);
    }
    if (Object.keys(prof).length) out[mode] = prof;
  }
  return out;
}
function refreshAny() { _any = Object.keys(_store).length > 0; }
function load(raw) { _store = sanitize(raw); refreshAny(); return _store; }
load(store.get(KEY, null));

function persist() {
  if (Object.keys(_store).length) store.set(KEY, _store);
  else store.set(KEY, {});
}

// Resolved knob values for one mode — every id present, defaults filled in.
function values(mode) {
  const prof = _store[mode] || null;
  const out = {};
  for (const d of CAM_TUNE_DEFS) out[d.id] = prof && typeof prof[d.id] === "number" ? prof[d.id] : d.def;
  return out;
}
function get(mode, id) {
  const d = DEF_BY_ID[id];
  if (!d) return 0;
  const prof = _store[mode];
  return prof && typeof prof[id] === "number" ? prof[id] : d.def;
}
// How many knobs this mode has moved off default (drives the panel's "(3 tuned)").
function count(mode) { return _store[mode] ? Object.keys(_store[mode]).length : 0; }
function tunedModes() { return Object.keys(_store).filter((m) => count(m) > 0); }

function set(mode, id, v) {
  const d = DEF_BY_ID[id];
  if (!d || !mode || typeof v !== "number" || !isFinite(v)) return false;
  v = clamp(v, d.min, d.max);
  const prof = _store[mode] || (_store[mode] = {});
  if (v === d.def) delete prof[id]; else prof[id] = v;
  if (!Object.keys(prof).length) delete _store[mode];
  refreshAny();
  return true;
}
function reset(mode) { Log.info("game", "CamTune.reset " + mode); delete _store[mode]; refreshAny(); }
function resetAll() { Log.info("game", "CamTune.resetAll"); _store = {}; refreshAny(); }
function all() { return _store; }

function apply(mode, eye, tgt, fov) {
  if (!_any) return fov;
  const prof = _store[mode];
  if (!prof) return fov;
  const h = prof.height || 0, d = prof.dist || 0, sd = prof.side || 0;
  const pi = prof.pitch || 0, ya = prof.yaw || 0, fo = prof.fov || 0;
  // Horizontal view direction, and the right vector perpendicular to it.
  // RIGHT of forward (fx, fz) in this Y-up world is (-fz, fx) — measured:
  // (fz, -fx) dotted against the track's own right vector reads -0.99, i.e.
  // it is the LEFT vector. This code shipped with (fz, -fx) copied from a
  // mislabelled physics comment, so the SIDE knob moved the eye LEFT while
  // its help text said right (and YAW panned left, below).
  let fx = tgt[0] - eye[0], fz = tgt[2] - eye[2];
  let fl = Math.hypot(fx, fz);
  if (fl < 1e-4) { fx = 0; fz = 1; fl = 1; }   // straight-down aim (overhead): fall back to +Z
  fx /= fl; fz /= fl;
  const rx = -fz, rz = fx;
  if (h || d || sd) {
    eye[0] += -fx * d + rx * sd;
    eye[1] += h;
    eye[2] += -fz * d + rz * sd;
  }
  if (ya || pi) {
    let dx = tgt[0] - eye[0], dy = tgt[1] - eye[1], dz = tgt[2] - eye[2];
    if (ya) {
      const c = Math.cos(ya * DEG), s = Math.sin(ya * DEG);
      const nx = dx * c - dz * s, nz = dz * c + dx * s;
      dx = nx; dz = nz;
    }
    if (pi) {
      const L = Math.hypot(dx, dz), len = Math.hypot(L, dy) || 1;
      const el = clamp(Math.atan2(dy, L) + pi * DEG, -1.45, 1.45);
      const nl = Math.cos(el) * len;
      dy = Math.sin(el) * len;
      if (L > 1e-6) { const k = nl / L; dx *= k; dz *= k; }
      else { dx = fx * nl; dz = fz * nl; }   // was aiming straight up/down — re-seat on the view axis
    }
    tgt[0] = eye[0] + dx; tgt[1] = eye[1] + dy; tgt[2] = eye[2] + dz;
  }
  return fo ? clamp(fov + fo, FOV_MIN, FOV_MAX) : fov;
}

return { CAM_TUNE_DEFS, FOV_MIN, FOV_MAX,
         apply, values, get, set, reset, resetAll, count, tunedModes, all, load, persist,
         defs: () => CAM_TUNE_DEFS, active: () => _any };
})();
