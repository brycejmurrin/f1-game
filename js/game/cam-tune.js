/* Apex 26 — PER-CAMERA-MODE framing offsets (the CAMERA TUNER's data layer):
   the knob registry (CAM_TUNE_DEFS), the per-mode override store (localStorage
   apex26.camTune) and apply(), which nudges an already-solved {eye,tgt,fov}
   vantage. js/game/cameras.js calls apply() at the END of vantage(), just
   before the ground clamp, so the live camera, snapGameCam() and
   __apex.previewCam() all frame identically — and a lowered eye is still
   caught by the terrain floor.

   Values are stored PER CAMERA MODE ("chase", "hood", "cockpit", …): tuning
   CHASE never touches HOOD, which is the whole point — one player wants the
   chase cam further back and the hood cam a touch lower, and those are
   different rigs. Every knob defaults to 0 = the shipped framing, so an
   untuned install renders byte-identically to before this file existed.

   The rig model (why these six knobs and not a free 6-DOF camera):
     HEIGHT / DISTANCE / SIDE translate the EYE only, leaving the aim point on
     the car — raise the eye and the camera looks DOWN at the car rather than
     sliding it out of frame. PITCH / YAW then rotate the aim about the eye,
     and FOV trims the zoom. That ordering means you can never lose the car off
     screen with the translation knobs alone, which a naive "move the whole
     rig" model does immediately.

   Panel UI lives in js/game/cam-tuner.js (CamTunerPanel). Must load BEFORE
   js/game.js (see index.html); consumes GameStore at eval time. */
const CamTune = (function () {
  "use strict";

const { store } = GameStore;
const KEY = "camTune";
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// The six knobs, in panel order. `def` is 0 for all of them by construction:
// zero MUST mean "the framing js/game/cameras.js shipped", so RESET is exact
// and a value only ever needs storing when the player actually moved it.
const CAM_TUNE_DEFS = [
  { id: "height", label: "HEIGHT",   min: -3,  max: 5,  step: 0.05, def: 0, unit: "m",
    help: "Raise or lower the camera eye. The aim stays on the car, so raising it looks further down over the nose." },
  { id: "dist",   label: "DISTANCE", min: -6,  max: 12, step: 0.05, def: 0, unit: "m",
    help: "Pull the eye back (+) or push it in (−) along the view direction. On the onboard cams this slides the seat fore/aft." },
  { id: "side",   label: "SIDE",     min: -6,  max: 6,  step: 0.05, def: 0, unit: "m",
    help: "Offset the eye right (+) or left (−) of the view axis for a three-quarter angle on the car." },
  { id: "pitch",  label: "PITCH",    min: -25, max: 25, step: 0.5,  def: 0, unit: "°",
    help: "Tilt the aim up (+) or down (−). Positive shows more sky and horizon, negative more road." },
  { id: "yaw",    label: "YAW",      min: -45, max: 45, step: 0.5,  def: 0, unit: "°",
    help: "Pan the aim right (+) or left (−) without moving the eye." },
  { id: "fov",    label: "FOV",      min: -25, max: 25, step: 0.5,  def: 0, unit: "°",
    help: "Widen (+) or tighten (−) the field of view on top of the mode's own speed-scaled FOV." },
];
const DEF_BY_ID = {};
for (const d of CAM_TUNE_DEFS) DEF_BY_ID[d.id] = d;

// Solved FOV floor/ceiling after the offset — a slider that could drive the
// projection to 0° or past 180° would produce a degenerate matrix, not a look.
const FOV_MIN = 20, FOV_MAX = 110;

// Store shape: { chase: {height: 0.4, fov: -3}, hood: {…} } — sparse, only the
// knobs the player actually moved, only the modes they touched.
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
  // Only a value that differs from the shipped framing is worth storing — that
  // keeps the persisted blob to what the player actually changed and makes
  // "is this mode tuned?" a key count rather than a float comparison sweep.
  if (v === d.def) delete prof[id]; else prof[id] = v;
  if (!Object.keys(prof).length) delete _store[mode];
  refreshAny();
  return true;
}
function reset(mode) { delete _store[mode]; refreshAny(); }
function resetAll() { _store = {}; refreshAny(); }
function all() { return _store; }

// Nudge a solved vantage in place. eye/tgt are mutated; the (possibly clamped)
// FOV is RETURNED because it is a scalar. Called once per camera solve, so it
// allocates nothing.
function apply(mode, eye, tgt, fov) {
  if (!_any) return fov;
  const prof = _store[mode];
  if (!prof) return fov;
  const h = prof.height || 0, d = prof.dist || 0, sd = prof.side || 0;
  const pi = prof.pitch || 0, ya = prof.yaw || 0, fo = prof.fov || 0;
  // Horizontal view direction, and the right vector perpendicular to it. Same
  // (fz, -fx) right-hand convention the physics integrator and the chase rig
  // use, so +SIDE is the same "right" the driver would call right.
  let fx = tgt[0] - eye[0], fz = tgt[2] - eye[2];
  let fl = Math.hypot(fx, fz);
  if (fl < 1e-4) { fx = 0; fz = 1; fl = 1; }   // straight-down aim (overhead): fall back to +Z
  fx /= fl; fz /= fl;
  const rx = fz, rz = -fx;
  if (h || d || sd) {
    // Translate the EYE only — the aim point stays where the mode put it, so
    // the car cannot slide out of frame no matter how these are dialled.
    eye[0] += -fx * d + rx * sd;
    eye[1] += h;
    eye[2] += -fz * d + rz * sd;
  }
  if (ya || pi) {
    let dx = tgt[0] - eye[0], dy = tgt[1] - eye[1], dz = tgt[2] - eye[2];
    if (ya) {
      const c = Math.cos(ya * DEG), s = Math.sin(ya * DEG);
      const nx = dx * c + dz * s, nz = dz * c - dx * s;   // + = pan toward the right vector
      dx = nx; dz = nz;
    }
    if (pi) {
      const L = Math.hypot(dx, dz), len = Math.hypot(L, dy) || 1;
      // Clamp the elevation short of straight up/down: at ±90° the horizontal
      // component collapses and lookAt's up vector degenerates.
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
