"use strict";
const FlybyPanel = (function () {

const EASES = ["linear", "in", "out", "inOut"];
const AT_KINDS = ["start", "pole", "grid", "slot", "pitexit", "corner", "centre", "landmark"];
const SLOTS = [
  { key: "eye0", arr: "eye", i: 0, label: "EYE FROM" },
  { key: "eye1", arr: "eye", i: 1, label: "EYE TO" },
  { key: "look0", arr: "look", i: 0, label: "LOOK FROM" },
  { key: "look1", arr: "look", i: 1, label: "LOOK TO" },
];
const POSE_FIELDS = {
  start: ["off", "x", "y"],
  pole: ["off", "x", "y"],
  grid: ["off", "x", "y"],
  slot: ["off", "x", "y"],
  pitexit: ["off", "x", "y"],
  corner: ["off", "x", "y"],
  centre: ["bear", "distR", "yR", "y"],
  landmark: ["bear", "distK", "yK", "y"],
};
const FIELD = {
  off: { label: "ARC OFFSET", min: -400, max: 400, step: 1, unit: " m", def: 0 },
  x: { label: "LATERAL (+ OUTSIDE AT A CORNER)", min: -60, max: 60, step: 0.5, unit: " m", def: 0 },
  y: { label: "HEIGHT", min: -5, max: 200, step: 0.05, unit: " m", def: 5 },
  bear: { label: "BEARING (0 = TRACK SIDE)", min: -3.15, max: 3.15, step: 0.01, unit: " rad", def: 0 },
  distR: { label: "DISTANCE (LAP RADII)", min: 0, max: 3, step: 0.01, unit: "", def: 1.2 },
  yR: { label: "HEIGHT (LAP RADII)", min: 0, max: 1.5, step: 0.01, unit: "", def: 0.4 },
  distK: { label: "DISTANCE (LANDMARK SIZES)", min: 0, max: 6, step: 0.05, unit: "", def: 1.8 },
  yK: { label: "HEIGHT (LANDMARK HEIGHTS)", min: -1, max: 3, step: 0.05, unit: "", def: 0.4 },
};
const FIELD_IDS = Object.keys(FIELD);
const RANKS = [0, 1, 2, 3, 4, 5];
const CORNER_NS = ["first", "mid", "late", "slowest", "fastest", "lore", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];

const DUR = { min: 0.01, max: 1, step: 0.005, unit: "" };
const FOV = { min: 15, max: 90, step: 0.5, unit: "°" };


function clone(v) { return JSON.parse(JSON.stringify(v)); }

function poseFields(pose) { return POSE_FIELDS[pose && pose.at] || POSE_FIELDS.start; }
function fieldLabel(at, f) {
  return (f === "y" && (at === "centre" || at === "landmark")) ? "HEIGHT OFFSET" : FIELD[f].label;
}
function metricValue(f, v, radius) {
  return (f === "distR" || f === "yR") && radius > 0 && typeof v === "number"
    ? Math.round(v * radius) + " m" : null;
}

function switchPoseAt(pose, at) {
  if (AT_KINDS.indexOf(at) === -1) return clone(pose);
  const next = { at: at };
  if (at === "corner") next.n = (pose && pose.n !== undefined) ? pose.n : "first";
  if (at === "slot") next.n = "player";
  if (at === "landmark") next.rank = (pose && typeof pose.rank === "number") ? pose.rank : 0;
  for (const f of POSE_FIELDS[at]) {
    const carried = (pose && typeof pose[f] === "number") ? pose[f] : undefined;
    next[f] = (carried === undefined) ? FIELD[f].def : carried;
  }
  return next;
}

function uniqueId(list, base) {
  const taken = {};
  for (const s of (list || [])) taken[s && s.id] = true;
  if (!taken[base]) return base;
  for (let n = 2; n < 999; n++) if (!taken[base + "-" + n]) return base + "-" + n;
  return base + "-" + Date.now();
}

function blankShot(list) {
  return {
    id: uniqueId(list, "shot"), dur: 0.125, ease: "inOut",
    eye: [{ at: "start", off: -60, x: 10, y: 6 }, { at: "start", off: 20, x: 8, y: 5 }],
    look: [{ at: "start", off: 0, x: 0, y: 0.8 }, { at: "start", off: 60, x: 0, y: 0.8 }],
    fov: [38, 42],
  };
}

function addShot(list, index) {
  const out = clone(list || []);
  const at = Math.max(-1, Math.min(out.length - 1, index === undefined ? out.length - 1 : index));
  out.splice(at + 1, 0, blankShot(out));
  return out;
}

function duplicateShot(list, index) {
  const out = clone(list || []);
  if (!out.length) return addShot(out, -1);
  const i = Math.max(0, Math.min(out.length - 1, index || 0));
  const copy = clone(out[i]);
  copy.id = uniqueId(out, String(out[i].id || "shot"));
  out.splice(i + 1, 0, copy);
  return out;
}

function deleteShot(list, index) {
  if (!list || list.length <= 1) return clone(list || []);
  const out = clone(list);
  out.splice(Math.max(0, Math.min(out.length - 1, index || 0)), 1);
  return out;
}

function moveShot(list, index, delta) {
  const out = clone(list || []);
  const from = index | 0, to = from + (delta | 0);
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}

function normaliseDurs(list) {
  const out = clone(list || []);
  if (!out.length) return out;
  let sum = 0;
  for (const s of out) sum += (typeof s.dur === "number" && isFinite(s.dur) && s.dur > 0) ? s.dur : 0;
  if (!(sum > 0)) { for (const s of out) s.dur = +(1 / out.length).toFixed(6); return out; }
  for (const s of out) {
    const d = (typeof s.dur === "number" && isFinite(s.dur) && s.dur > 0) ? s.dur : 0;
    s.dur = +(d / sum).toFixed(6);
  }
  return out;
}

function poseErrors(p) {
  const bad = [];
  for (const f of POSE_FIELDS[p.at]) {
    const v = p[f];
    if (v === undefined) continue;
    if (typeof v !== "number" || !isFinite(v) || v < FIELD[f].min || v > FIELD[f].max) {
      bad.push(f + " must be a number from " + FIELD[f].min + " to " + FIELD[f].max + ", not " + JSON.stringify(v));
    }
  }
  const int = (v, lo) => typeof v === "number" && isFinite(v) && v === Math.floor(v) && v >= lo;
  if (p.at === "corner" && p.n !== undefined && CORNER_NS.indexOf(p.n) === -1 && !int(p.n, 1)) bad.push("n is not a corner: " + JSON.stringify(p.n));
  if (p.at === "slot" && p.n !== undefined && p.n !== "player" && !int(p.n, 0)) bad.push("n is not a grid slot: " + JSON.stringify(p.n));
  if (p.at === "landmark" && p.rank !== undefined && RANKS.indexOf(p.rank) === -1) bad.push("rank must be one of " + RANKS.join(", ") + ", not " + JSON.stringify(p.rank));
  return bad;
}

function shotErrors(list) {
  const bad = [];
  if (!Array.isArray(list) || !list.length) return ["the shot list must be a non-empty array"];
  list.forEach((s, i) => {
    const at = "shot " + i + " (" + ((s && s.id) || "?") + ")";
    if (!s || typeof s !== "object" || Array.isArray(s)) { bad.push(at + " is not an object"); return; }
    if (typeof s.id !== "string" || !s.id) bad.push(at + " has no string id");
    if (typeof s.dur !== "number" || !isFinite(s.dur) || s.dur <= 0) bad.push(at + " has no finite positive dur");
    if (EASES.indexOf(s.ease) === -1) bad.push(at + " ease must be one of " + EASES.join(", "));
    for (const k of ["eye", "look"]) {
      if (!Array.isArray(s[k]) || s[k].length !== 2) { bad.push(at + " " + k + " must be a [from, to] pair"); continue; }
      s[k].forEach((p, j) => {
        if (!p || typeof p !== "object") { bad.push(at + " " + k + "[" + j + "] is not a pose"); return; }
        if (AT_KINDS.indexOf(p.at) === -1) { bad.push(at + " " + k + "[" + j + "] has unknown at: " + JSON.stringify(p.at)); return; }
        poseErrors(p).forEach((e) => bad.push(at + " " + k + "[" + j + "] " + e));
      });
    }
    if (!Array.isArray(s.fov) || s.fov.length !== 2 ||
        !s.fov.every((n) => typeof n === "number" && isFinite(n))) bad.push(at + " fov must be [from, to] numbers");
    else if (!s.fov.every((n) => n >= FOV.min && n <= FOV.max)) bad.push(at + " fov must be from " + FOV.min + " to " + FOV.max + ", not " + JSON.stringify(s.fov));
  });
  return bad;
}

function validateShots(list) {
  const bad = shotErrors(list);
  if (bad.length) return bad;
  let sum = 0;
  for (const s of list) sum += s.dur;
  if (Math.abs(sum - 1) > 0.01) bad.push("durations sum to " + sum.toFixed(4) + ", not 1 — press NORMALISE");
  return bad;
}

function toBlob(list) {
  const body = (list || []).map((s) => {
    const pose = (p) => JSON.stringify(p);
    return "  {\n" +
      "    id: " + JSON.stringify(s.id) + ", dur: " + s.dur + ", ease: " + JSON.stringify(s.ease) + ",\n" +
      "    eye: [" + pose(s.eye[0]) + ",\n          " + pose(s.eye[1]) + "],\n" +
      "    look: [" + pose(s.look[0]) + ",\n           " + pose(s.look[1]) + "],\n" +
      "    fov: [" + s.fov[0] + ", " + s.fov[1] + "],\n" +
      "  }";
  }).join(",\n");
  return "window.FlybyShots = [\n" + body + "\n];";
}

const SHOTS_VERSION = 2;
function savedForm(list) { return { v: SHOTS_VERSION, shots: list }; }
function fromSaved(saved) {
  const list = (saved && !Array.isArray(saved) && saved.v === SHOTS_VERSION) ? saved.shots : null;
  const num = (n) => typeof n === "number" && isFinite(n);
  return !Array.isArray(list) ? list : list.map((s) => (s && Array.isArray(s.fov) && s.fov.every(num))
    ? Object.assign({}, s, { fov: s.fov.map((n) => Math.min(FOV.max, Math.max(FOV.min, n))) }) : s);
}

const ops = {
  EASES, AT_KINDS, POSE_FIELDS, FIELD, FIELD_IDS, FOV, SLOTS, CORNER_NS, RANKS, SHOTS_VERSION, DUR,
  clone, poseFields, fieldLabel, metricValue, switchPoseAt, uniqueId, blankShot, savedForm, fromSaved,
  addShot, duplicateShot, deleteShot, moveShot, normaliseDurs, shotErrors, validateShots, toBlob,
};

let _camEdLoad = null;
const _camEdLoaded = new Set();
function ensureCamEditor() {
  if (typeof FlybyEditor !== "undefined" && typeof CamTunerEditor !== "undefined") return Promise.resolve(true);
  if (_camEdLoad) return _camEdLoad;
  const files = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_CAM_EDITOR) || [];
  const edges = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_CAM_EDITOR_EDGES) || [];
  if (!files.length || typeof ScriptLoader === "undefined") {
    Log.warn("game", "camera editor bundle is not in this build");
    return Promise.resolve(false);
  }
  _camEdLoad = ScriptLoader.create().load(files, edges, { strict: true, loaded: _camEdLoaded }).then((ok) => {
    if (!ok || typeof FlybyEditor === "undefined" || typeof CamTunerEditor === "undefined") {
      _camEdLoad = null;
      Log.warn("game", "the camera editor bundle did not load");
      return false;
    }
    return true;
  });
  return _camEdLoad;
}

let _pendingUiOpen = null;
function createEditorOpener(G, buttonId, ensure, method) {
  let pending = null;
  function cancel() {
    const request = pending;
    pending = null;
    if (request && request.observer) request.observer.disconnect();
    if (_pendingUiOpen === request) _pendingUiOpen = null;
  }
  function bind() {
    const button = G.$(buttonId);
    if (button) button.onclick = () => open(true);
  }
  function open(fromUi) {
    cancel();
    const settings = G.$("pmsettings"), button = G.$(buttonId), host = button && button.closest('[id^="pm-panel-"]');
    const visible = () => !!(settings && !settings.hidden && host && !host.hidden);
    if (fromUi && !visible()) return Promise.resolve();
    if (fromUi && _pendingUiOpen) _pendingUiOpen.cancel();
    const request = { cancel, state: G.state, paused: G.paused, observer: null };
    pending = request;
    if (fromUi) {
      _pendingUiOpen = request;
      if (typeof MutationObserver !== "undefined") {
        request.observer = new MutationObserver(() => { if (pending === request) cancel(); });
        request.observer.observe(settings, { attributes: true, attributeFilter: ["hidden"] });
        request.observer.observe(host, { attributes: true, attributeFilter: ["hidden"] });
      }
    }
    return Promise.resolve().then(ensure).then((real) => {
      if (pending !== request) return;
      const changed = request.observer && request.observer.takeRecords().length > 0;
      const allowed = !fromUi || (!changed && visible() && G.state === request.state && G.paused === request.paused);
      cancel();
      if (allowed && real && typeof real[method] === "function") real[method]();
    }, (error) => {
      if (pending === request) cancel();
      Log.warn("game", "camera editor did not open", error);
    });
  }
  bind();
  return { open: () => open(false), cancel, bind };
}

let _refresh = null;
function create(G) {
  Log.info("game", "FlybyPanel.create");
  const { store } = G;
  let real = null, _apiLoader = null;
  function loadSaved() {
    let saved = null;
    try { saved = store.get("flybyShots", null); } catch (_) { return null; }
    if (!saved) return null;
    const list = fromSaved(saved);
    if (!list) { Log.warn("game", "saved flyby shots predate the current pose meaning — playing the shipped sequence"); return null; }
    const bad = shotErrors(list);
    if (bad.length) { Log.warn("game", "saved flyby shots unusable: " + bad[0]); return null; }
    return clone(list);
  }
  function ensure() {
    if (real) return Promise.resolve(real);
    return ensureCamEditor().then((ok) => {
      if (!ok) return null;
      if (!real) {
        real = FlybyEditor.create(G);
        opener.bind();
        if (_apiLoader && real.setApiLoader) real.setApiLoader(_apiLoader);
      }
      return real;
    });
  }
  const opener = createEditorOpener(G, "pm-flyby", ensure, "openFlyby");
  return {
    openFlyby: opener.open,
    closeFlyby: (show) => { opener.cancel(); if (real) real.closeFlyby(show); },
    isOpen: () => !!(real && real.isOpen && real.isOpen()),
    setApiLoader: (fn) => { _apiLoader = fn; if (real && real.setApiLoader) real.setApiLoader(fn); },
    loadSaved,
    list: () => real && real.list ? real.list() : [],
  };
}

return Object.assign({ create, ensureCamEditor, createEditorOpener, refresh: () => { if (_refresh) _refresh(); } }, ops);
})();
Object.freeze(FlybyPanel);
