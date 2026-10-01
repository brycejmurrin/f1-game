/* Apex 26 — PER-CAMERA-MODE framing offsets (the CAMERA TUNER's data layer): the knob registry (CAM_TUNE_DEFS), the per-mode override store (localStorage apex26.camTune), a GLOBAL baseline layered under every mode, COMFORT multipliers independent of reduce-motion, built-in presets, and JSON / APXC1 share-code import. */
const CamTune = (function () {
  "use strict";

const { store } = GameStore;
const KEY = "camTune";
const KEY_GLOBAL = "camTuneGlobal";
const KEY_COMFORT = "camComfort";
const DEG = Math.PI / 180;
const clamp = M4.clamp;                       // shared scalar helper (js/core/mat4.js)
const GLOBAL_MODE = "_global";               // reserved id — never a real CAM_MODES entry

// The knobs, in panel order. `def` is what the mode ships with, and set() stores
// a knob only while it differs from that — so RESET is exact and an untouched
// install carries nothing. For the six GEOMETRIC offsets below that def is 0,
// because each is a DELTA on the rig js/camera/vantage.js solved: zero means
// "shipped framing". CORNER LEAD is the exception and its def is the shipped
// amount itself (0.54), because it is an ABSOLUTE blend, not a delta — see the
// note above it for what defaulting it to 0 cost.
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
  // never touches it. js/camera/vantage.js reads it directly in the chase/far
  // branch and blends the rig toward the classic road-frame chase (eye back
  // along the road, aim at the curved centreline ahead), so the camera leads
  // and swings INTO turns. 0 = locked to the car (the shipped free-world rig);
  // 1 = the full corner-following chase. Only chase/far read it — `modes` gates
  // which cameras show the slider.
  // def MUST equal CHASE_CORNER_LEAD_DEFAULT in js/camera/vantage.js (0.54), and
  // tests/unit/camera-defaults.test.mjs holds the two together. This is not cosmetic:
  // set() DELETES a knob whose value equals its def, and an unstored cornerLead
  // means "use the shipped default". With def 0 the two readings of zero
  // collided — dragging the slider to 0 deleted the key, so the rig fell back to
  // 0.54 and the ONE END OF THE RANGE THE HELP TEXT PROMISES ("0 locks flat
  // behind the car") was the one value unreachable. Defaulting to the shipped
  // amount also stops the panel opening on a lying 0 while 0.54 is live.
  { id: "cornerLead", label: "CORNER LEAD", min: 0, max: 1, step: 0.02, def: 0.54, unit: "", modes: ["chase", "far"],
    help: "Let the chase camera lead and swing INTO corners like the classic chase. Chase/far ship at 0.54; 0 locks the rig flat behind the car; 1 is the full corner-following chase. Purely visual — never affects the car." },
];
const DEF_BY_ID = {};
for (const d of CAM_TUNE_DEFS) DEF_BY_ID[d.id] = d;

const FOV_MIN = 20, FOV_MAX = 110;

// COMFORT — independent of OS prefers-reduced-motion / MOTION: REDUCED.
// camComfort() in game.js still hard-gates shake / buzz / roll when motion is
// reduced; these knobs scale the same effects when motion is allowed, and the
// FOV bias always applies (FOV was never part of the reduce-motion gate).
const COMFORT_DEFS = [
  { id: "fovBias",   label: "FOV BIAS",      min: -15, max: 15, step: 0.5, def: 0, unit: "°",
    help: "Widen (+) or tighten (−) every camera's field of view. Independent of MOTION: REDUCED — a comfort FOV without muting camera motion." },
  { id: "speedFov",  label: "SPEED FOV",     min: 0, max: 1, step: 0.05, def: 1, unit: "",
    help: "How strongly FOV widens with speed. 0 keeps the standing FOV at any pace; 1 is the shipped speed-FOV. Does not touch reduce-motion." },
  { id: "bob",       label: "HEAD BOB",      min: 0, max: 1, step: 0.05, def: 1, unit: "",
    help: "Strength of onboard speed buzz and collision shake. 0 is still; 1 is shipped. MOTION: REDUCED still zeroes these entirely." },
  { id: "rollLean",  label: "ROLL LEAN",     min: 0, max: 1, step: 0.05, def: 1, unit: "",
    help: "How far the horizon leans with bank and slip. 0 stays level; 1 is shipped. MOTION: REDUCED still forces a level horizon." },
];
const COMFORT_BY_ID = {};
for (const d of COMFORT_DEFS) COMFORT_BY_ID[d.id] = d;

// Built-in framing packs. Modes keyed like camTune; `global` is the baseline
// layered under every mode; `comfort` is optional. STOCK clears everything.
const PRESETS = Object.freeze({
  stock: Object.freeze({
    label: "STOCK",
    help: "Shipped framing on every camera — clears per-mode edits, the global baseline and comfort knobs.",
    modes: null, global: null, comfort: null,
  }),
  close: Object.freeze({
    label: "CLOSE UP",
    help: "Pull chase/far/hood in and drop the eye slightly for a tighter race.",
    modes: {
      chase: { dist: -2.5, height: -0.35, fov: -4 },
      far: { dist: -3, height: -0.25, fov: -3 },
      hood: { dist: 0.35, height: -0.08, fov: -2 },
      cockpit: { dist: 0.12, height: -0.04 },
    },
    global: null, comfort: null,
  }),
  wide: Object.freeze({
    label: "WIDE FOV",
    help: "A global FOV bias so every camera opens up without rewriting each mode.",
    modes: null,
    global: { fov: 8 },
    comfort: { fovBias: 2, speedFov: 0.85 },
  }),
  flat: Object.freeze({
    label: "FLAT CHASE",
    help: "Lock chase/far flat behind the car (corner lead 0) — no swing into bends.",
    modes: { chase: { cornerLead: 0 }, far: { cornerLead: 0 } },
    global: null, comfort: null,
  }),
  calm: Object.freeze({
    label: "CALM",
    help: "Dial back speed-FOV, head bob and roll lean without enabling MOTION: REDUCED.",
    modes: null, global: null,
    comfort: { speedFov: 0.35, bob: 0.2, rollLean: 0.25, fovBias: 0 },
  }),
});

let _store = {};
let _global = {};
let _comfort = {};
let _any = false;            // fast path: skip apply() entirely when nothing is tuned

function sanitizeProf(src) {
  const prof = {};
  if (!src || typeof src !== "object") return prof;
  for (const d of CAM_TUNE_DEFS) {
    const v = src[d.id];
    if (typeof v === "number" && isFinite(v) && v !== d.def) prof[d.id] = clamp(v, d.min, d.max);
  }
  return prof;
}
function sanitize(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const mode of Object.keys(raw)) {
    if (mode === GLOBAL_MODE) continue;   // global lives in its own store key
    const prof = sanitizeProf(raw[mode]);
    if (Object.keys(prof).length) out[mode] = prof;
  }
  return out;
}
function sanitizeComfort(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const d of COMFORT_DEFS) {
    const v = raw[d.id];
    if (typeof v === "number" && isFinite(v) && v !== d.def) out[d.id] = clamp(v, d.min, d.max);
  }
  return out;
}
function refreshAny() {
  _any = Object.keys(_store).length > 0 || Object.keys(_global).length > 0 ||
    (typeof _comfort.fovBias === "number" && _comfort.fovBias !== 0);
}
function load(raw) { _store = sanitize(raw); refreshAny(); return _store; }
function loadGlobal(raw) { _global = sanitizeProf(raw); refreshAny(); return _global; }
function loadComfort(raw) { _comfort = sanitizeComfort(raw); refreshAny(); return _comfort; }
load(store.get(KEY, null));
loadGlobal(store.get(KEY_GLOBAL, null));
loadComfort(store.get(KEY_COMFORT, null));

function persist() {
  if (Object.keys(_store).length) store.set(KEY, _store); else store.set(KEY, {});
  if (Object.keys(_global).length) store.set(KEY_GLOBAL, _global); else store.set(KEY_GLOBAL, {});
  if (Object.keys(_comfort).length) store.set(KEY_COMFORT, _comfort); else store.set(KEY_COMFORT, {});
}

function mergedProf(mode) {
  // Global baseline under per-mode: mode wins on a shared knob.
  const g = _global, m = _store[mode];
  if (!g && !m) return null;
  if (!g) return m;
  if (!m) return g;
  const out = {};
  for (const d of CAM_TUNE_DEFS) {
    if (typeof m[d.id] === "number") out[d.id] = m[d.id];
    else if (typeof g[d.id] === "number") out[d.id] = g[d.id];
  }
  return Object.keys(out).length ? out : null;
}

// Resolved knob values for one mode — every id present, defaults filled in.
// Includes the global baseline (mode overrides win).
function values(mode) {
  const prof = mergedProf(mode);
  const out = {};
  for (const d of CAM_TUNE_DEFS) out[d.id] = prof && typeof prof[d.id] === "number" ? prof[d.id] : d.def;
  return out;
}
function get(mode, id) {
  const d = DEF_BY_ID[id];
  if (!d) return 0;
  const m = _store[mode];
  if (m && typeof m[id] === "number") return m[id];
  if (typeof _global[id] === "number") return _global[id];
  return d.def;
}
function getModeOnly(mode, id) {
  const d = DEF_BY_ID[id];
  if (!d) return 0;
  const m = _store[mode];
  return m && typeof m[id] === "number" ? m[id] : d.def;
}
function getGlobal(id) {
  const d = DEF_BY_ID[id];
  if (!d) return 0;
  return typeof _global[id] === "number" ? _global[id] : d.def;
}
function stored(mode, id) {
  const prof = _store[mode];
  return !!(prof && typeof prof[id] === "number");
}
function storedGlobal(id) { return typeof _global[id] === "number"; }

// Resolved chase/far corner lead: null = use js/camera/vantage.js shipped default.
function cornerLead(mode) {
  if (mode !== "chase" && mode !== "far") return null;
  if (stored(mode, "cornerLead")) return clamp(getModeOnly(mode, "cornerLead"), 0, 1);
  if (storedGlobal("cornerLead")) return clamp(getGlobal("cornerLead"), 0, 1);
  return null;
}

function exportEdits() {
  const out = {};
  for (const mode of Object.keys(_store)) {
    const prof = _store[mode];
    if (prof && Object.keys(prof).length) out[mode] = { ...prof };
  }
  return out;
}
function exportGlobal() {
  return Object.keys(_global).length ? { ..._global } : {};
}
function exportComfort() {
  const out = {};
  for (const d of COMFORT_DEFS) out[d.id] = comfortGet(d.id);
  return out;
}
function exportPack() {
  const modes = exportEdits();
  const global = exportGlobal();
  const comfort = sanitizeComfort(_comfort);   // only non-defaults
  const pack = { v: 1 };
  if (Object.keys(modes).length) pack.modes = modes;
  if (Object.keys(global).length) pack.global = global;
  if (Object.keys(comfort).length) pack.comfort = comfort;
  return pack;
}

// How many knobs this mode has moved off default (drives the panel's "(3 tuned)").
function count(mode) { return _store[mode] ? Object.keys(_store[mode]).length : 0; }
function countGlobal() { return Object.keys(_global).length; }
function tunedModes() { return Object.keys(_store).filter((m) => count(m) > 0); }

function set(mode, id, v) {
  const d = DEF_BY_ID[id];
  if (!d || !mode || mode === GLOBAL_MODE || typeof v !== "number" || !isFinite(v)) return false;
  v = clamp(v, d.min, d.max);
  const prof = _store[mode] || (_store[mode] = {});
  if (v === d.def) delete prof[id]; else prof[id] = v;
  if (!Object.keys(prof).length) delete _store[mode];
  refreshAny();
  return true;
}
function setGlobal(id, v) {
  const d = DEF_BY_ID[id];
  if (!d || typeof v !== "number" || !isFinite(v)) return false;
  v = clamp(v, d.min, d.max);
  if (v === d.def) delete _global[id]; else _global[id] = v;
  refreshAny();
  return true;
}
function reset(mode) { Log.info("game", "CamTune.reset " + mode); delete _store[mode]; refreshAny(); }
function resetGlobal() { Log.info("game", "CamTune.resetGlobal"); _global = {}; refreshAny(); }
function resetAll() {
  Log.info("game", "CamTune.resetAll");
  _store = {}; _global = {}; _comfort = {};
  refreshAny();
}
function all() { return _store; }
function globalAll() { return _global; }

function comfortGet(id) {
  const d = COMFORT_BY_ID[id];
  if (!d) return 0;
  return typeof _comfort[id] === "number" ? _comfort[id] : d.def;
}
function comfortSet(id, v) {
  const d = COMFORT_BY_ID[id];
  if (!d || typeof v !== "number" || !isFinite(v)) return false;
  v = clamp(v, d.min, d.max);
  if (v === d.def) delete _comfort[id]; else _comfort[id] = v;
  refreshAny();
  return true;
}
function comfortReset() { _comfort = {}; refreshAny(); }
function fovBias() { return comfortGet("fovBias"); }
function speedFov() { return comfortGet("speedFov"); }
function bob() { return comfortGet("bob"); }
function rollLean() { return comfortGet("rollLean"); }

// Thin helpers game.js calls — keep camComfort() as the hard reduce-motion gate.
function shakeOffset(shake, reduceMotion) {
  if (reduceMotion) return 0;
  return shake * shake * 0.9 * bob();
}
function buzzAmp(spV, deploying, reduceMotion, wet) {
  if (reduceMotion) return 0;
  return (spV * spV * 0.022 + (deploying ? 0.008 : 0)) * wet * bob();
}
function rollTarget(roadCamRoll, slipSm, baRoll, reduceMotion) {
  if (reduceMotion) return 0;
  return (roadCamRoll + slipSm * 0.07 + baRoll) * rollLean();
}

function copyFrom(srcMode, dstMode) {
  if (!srcMode || !dstMode || srcMode === dstMode) return false;
  const src = _store[srcMode];
  if (!src || !Object.keys(src).length) {
    delete _store[dstMode];
    refreshAny();
    return true;
  }
  _store[dstMode] = { ...src };
  refreshAny();
  return true;
}
function applyToAllModes(srcMode) {
  if (!srcMode) return 0;
  const src = _store[srcMode] ? { ..._store[srcMode] } : null;
  let n = 0;
  const modes = (typeof CamModes !== "undefined" && CamModes.CAM_MODES)
    ? CamModes.CAM_MODES.map((c) => c.id)
    : Object.keys(_store);
  for (const m of modes) {
    if (m === srcMode || m === GLOBAL_MODE) continue;
    if (!src) delete _store[m];
    else _store[m] = { ...src };
    n++;
  }
  refreshAny();
  return n;
}

function applyPreset(id) {
  const p = PRESETS[id];
  if (!p) return false;
  Log.info("game", "CamTune.applyPreset " + id);
  if (p.modes === null) _store = {};
  else if (p.modes) {
    _store = {};
    for (const m of Object.keys(p.modes)) {
      const prof = sanitizeProf(p.modes[m]);
      if (Object.keys(prof).length) _store[m] = prof;
    }
  }
  if (p.global === null) _global = {};
  else if (p.global) _global = sanitizeProf(p.global);
  if (p.comfort === null) _comfort = {};
  else if (p.comfort) _comfort = sanitizeComfort(p.comfort);
  refreshAny();
  return true;
}

function importModes(raw) {
  const next = sanitize(raw);
  _store = next;
  refreshAny();
  return Object.keys(next).length;
}
function importGlobal(raw) {
  _global = sanitizeProf(raw);
  refreshAny();
  return Object.keys(_global).length;
}
function importComfort(raw) {
  _comfort = sanitizeComfort(raw);
  refreshAny();
  return Object.keys(_comfort).length;
}

// Accept a pack, a legacy CameraEdits object, or a bare modes map.
function importPack(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not an object" };
  let modes = null, global = null, comfort = null;
  if (raw.v === 1 || raw.modes || raw.global || raw.comfort) {
    modes = raw.modes || {};
    global = raw.global || {};
    comfort = raw.comfort || {};
  } else {
    // Legacy window.CameraEdits = { chase: {...}, ... } or a modes-only map.
    modes = raw;
  }
  const nModes = importModes(modes);
  const nGlobal = importGlobal(global);
  const nComfort = importComfort(comfort);
  return { ok: true, modes: nModes, global: nGlobal, comfort: nComfort };
}

// Compact share code: APXC1 + base64url(JSON). No compression — packs stay small.
const SHARE_MAGIC = "APXC1";
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToB64(bytes) {
  let out = "", i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2)] : "=";
    out += "=";
  }
  return out;
}
function b64ToBytes(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const len = clean.length;
  const bytes = [];
  for (let i = 0; i < len; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] === "=" ? 0 : B64.indexOf(clean[i + 2])) << 6) |
      (clean[i + 3] === "=" ? 0 : B64.indexOf(clean[i + 3]));
    bytes.push((n >> 16) & 255);
    if (clean[i + 2] !== "=") bytes.push((n >> 8) & 255);
    if (clean[i + 3] !== "=") bytes.push(n & 255);
  }
  return bytes;
}
function utf8Bytes(str) {
  if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(str));
  const a = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) a.push(c);
    else if (c < 2048) a.push(192 | (c >> 6), 128 | (c & 63));
    else a.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  return a;
}
function utf8String(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(Uint8Array.from(bytes));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 128) out += String.fromCharCode(b);
    else if (b >= 192 && b < 224 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 31) << 6) | (bytes[++i] & 63));
    } else if (i + 2 < bytes.length) {
      out += String.fromCharCode(((b & 15) << 12) | ((bytes[++i] & 63) << 6) | (bytes[++i] & 63));
    }
  }
  return out;
}
function b64urlEncode(str) {
  return bytesToB64(utf8Bytes(str)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return utf8String(b64ToBytes(b64));
}
function encodeShare(pack) {
  const body = JSON.stringify(pack && typeof pack === "object" ? pack : exportPack());
  return SHARE_MAGIC + "." + b64urlEncode(body);
}
function decodeShare(text) {
  if (typeof text !== "string") return { ok: false, reason: "not a string" };
  const t = text.trim();
  if (!t) return { ok: false, reason: "empty" };
  // Share code
  if (t.indexOf(SHARE_MAGIC + ".") === 0) {
    try {
      const json = b64urlDecode(t.slice(SHARE_MAGIC.length + 1));
      const obj = JSON.parse(json);
      return { ok: true, pack: obj, kind: "share" };
    } catch (e) {
      return { ok: false, reason: "bad share code" };
    }
  }
  // window.CameraEdits = {...};  or bare JSON
  let json = t;
  const m = /CameraEdits\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(t);
  if (m) json = m[1];
  try {
    const obj = JSON.parse(json);
    return { ok: true, pack: obj, kind: m ? "edits" : "json" };
  } catch (e) {
    return { ok: false, reason: "not JSON or APXC1 share code" };
  }
}
function importText(text) {
  const dec = decodeShare(text);
  if (!dec.ok) return dec;
  const r = importPack(dec.pack);
  if (!r.ok) return r;
  return { ok: true, kind: dec.kind, modes: r.modes, global: r.global, comfort: r.comfort };
}

function apply(mode, eye, tgt, fov) {
  const prof = mergedProf(mode);
  const bias = fovBias();
  if (!prof && !bias) return fov;
  const h = (prof && prof.height) || 0, d = (prof && prof.dist) || 0, sd = (prof && prof.side) || 0;
  const pi = (prof && prof.pitch) || 0, ya = (prof && prof.yaw) || 0;
  const fo = ((prof && prof.fov) || 0) + bias;
  // Horizontal view direction, and the right vector perpendicular to it.
  // RIGHT of forward (fx, fz) in this Y-up world is (-fz, fx) — measured:
  // (fz, -fx) dotted against the track's own right vector reads -0.99, i.e.
  // it is the LEFT vector. This code shipped with (fz, -fx) copied from a
  // mislabelled physics comment, so the SIDE knob moved the eye LEFT while
  // its help text said right (and YAW panned left, below).
  if (h || d || sd || ya || pi) {
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
  }
  return fo ? clamp(fov + fo, FOV_MIN, FOV_MAX) : fov;
}

return { CAM_TUNE_DEFS, COMFORT_DEFS, PRESETS, FOV_MIN, FOV_MAX, GLOBAL_MODE, SHARE_MAGIC,
         KEY, KEY_GLOBAL, KEY_COMFORT,
         apply, values, get, getModeOnly, getGlobal, stored, storedGlobal, cornerLead,
         exportEdits, exportGlobal, exportComfort, exportPack,
         set, setGlobal, reset, resetGlobal, resetAll,
         count, countGlobal, tunedModes, all, globalAll, load, loadGlobal, loadComfort, persist,
         comfortGet, comfortSet, comfortReset, fovBias, speedFov, bob, rollLean,
         shakeOffset, buzzAmp, rollTarget,
         copyFrom, applyToAllModes, applyPreset,
         importModes, importGlobal, importComfort, importPack, importText,
         encodeShare, decodeShare,
         defs: () => CAM_TUNE_DEFS, comfortDefs: () => COMFORT_DEFS,
         presets: () => PRESETS, active: () => _any };
})();
Object.freeze(CamTune);
