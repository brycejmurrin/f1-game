const SteerTuning = (function () {
  "use strict";

const PACE_MIN = 1, PACE_MAX = 19, PACE_REF = 14, PACE_DEF = 11, PACE_STEP = 1.06;
function paceFromSlider(v)   { return Math.pow(PACE_STEP, v - PACE_REF); }
const STEER_SCHEMA = 5;

function paceFromSliderV2(v) { return v <= 5 ? 0.5 + (v - 1) * 0.125 : 1.0 + (v - 5) * 0.06; }

const PACE_V2_TO_V3 = (() => {
  const m = {};
  for (let o = 1; o <= 10; o++) {
    let best = PACE_MIN, bd = Infinity;
    for (let n = PACE_MIN; n <= PACE_MAX; n++) {
      const d = Math.abs(Math.log(paceFromSlider(n) / paceFromSliderV2(o)));
      if (d < bd) { bd = d; best = n; }
    }
    m[o] = best;
  }
  return m;
})();

function migSet(st, to, key, value, why) {
  const had = st.get(key, null);
  st.set(key, value);
  if (had === value) return;
  Log.info("game", `steer schema v${to}: ${key} ${had === null ? "(unset)" : had} -> ${value}${why ? " — " + why : ""}`);
}

const STEER_MIGRATIONS = [
  { to: 2, apply(st) {
      migSet(st, 2, "drivingHelp", 1, "assist OFF: the rescale gave the slider a true zero, so the old number no longer denotes what it did");
      migSet(st, 2, "raceLine", 0, "no line pull by default: the mechanism changed with it");
  } },

  { to: 3, apply(st) {
      const from = st.get("pace", null);
      if (from === null) return;
      const to = PACE_V2_TO_V3[from];
      if (to === undefined) return;
      const err = (paceFromSlider(to) / paceFromSliderV2(from) - 1) * 100;
      migSet(st, 3, "pace", to,
        `RACE PACE regrid 1..10 -> 1..19: ${paceFromSliderV2(from).toFixed(3)} -> ${paceFromSlider(to).toFixed(3)} (${err >= 0 ? "+" : ""}${err.toFixed(2)} %)`);
      const shared = Object.keys(PACE_V2_TO_V3).filter((o) => PACE_V2_TO_V3[o] === to);
      if (shared.length > 1) {
        Log.warn("game", `steer schema v3: old pace notches ${shared.join(" and ")} both land on ${to} — the top of the old grid was finer than the new even-6 % one, so those two settings are no longer distinguishable (this one moved ${err >= 0 ? "+" : ""}${err.toFixed(2)} %)`);
      }
  } },

  { to: 4, apply(st) {
      const from = st.get("adaptiveButtons", null);
      if (from === 0) migSet(st, 4, "adaptiveButtons", 1, "OFF stays OFF on the 1..10 strength slider");
      else if (from === 1) migSet(st, 4, "adaptiveButtons", 6, "old ON becomes mid strength");
  } },

  { to: 5, apply(st) {
      const from = st.get("gripSteer", null);
      if (from !== null && !(typeof from === "number" && isFinite(from)))
        migSet(st, 5, "gripSteer", 1, "grip steer OFF: non-number store cleared");
  } },
];


function migrateValues(from, values) {
  const out = Object.assign({}, values);
  if (!(Number.isInteger(from) && from >= 1 && from < STEER_SCHEMA)) return out;
  const has = (k) => Object.prototype.hasOwnProperty.call(out, k) && out[k] !== null && out[k] !== undefined;
  const st = { get: (k, d) => (has(k) ? out[k] : d), set: (k, v) => { if (has(k)) out[k] = v; } };
  for (const step of STEER_MIGRATIONS) if (from < step.to) step.apply(st);
  return out;
}

function create(G) {
Log.info("input", "SteerTuning.create");
const { $, store, clamp } = G;
if ((typeof BrakeCue !== "undefined") && BrakeCue.create) BrakeCue.create(G);
if ((typeof DrivingCues !== "undefined") && DrivingCues.create) DrivingCues.create(G);

(function ensureGripSteerRow() {
  if ($("pm-gripsteer")) return;
  const help = $("pm-help");
  const host = help && help.closest ? help.closest(".adv-item") : null;
  if (!host || typeof document === "undefined") return;
  const row = document.createElement("label");
  row.className = "tune-row";
  row.innerHTML = '<span class="tune-label">GRIP STEER <b id="pm-gripsteer-v">OFF</b></span>'
    + '<input id="pm-gripsteer" type="range" min="1" max="10" step="1" value="1" aria-label="Grip steer assist">';
  const tipEl = host.querySelector(".adv-help");
  if (tipEl) host.insertBefore(row, tipEl);
  else host.appendChild(row);
})();

(function ensureTouchDragSpeedRow() {
  if ($("pm-touchdragspeed")) return;
  const sens = $("pm-touchrange");
  const host = sens && sens.closest ? sens.closest(".adv-item") : null;
  if (!host || !host.parentNode || typeof document === "undefined") return;
  const item = document.createElement("div");
  item.className = "adv-item";
  item.innerHTML = '<label class="tune-row"><span class="tune-label">DRAG AT SPEED <b id="pm-touchdragspeed-v">OFF</b></span>'
    + '<input id="pm-touchdragspeed" type="range" min="1" max="10" step="1" value="1" aria-label="Drag at speed"></label>'
    + '<p class="adv-help">Widens the drag as you go faster, by the same fraction ADAPTIVE BUTTONS slows keys and arrows. The travel that is full lock at a standstill is less lock at speed. 1 is OFF, the fixed range (the default). 10 matches that assist in full. Low speed is unchanged.</p>';
  host.parentNode.insertBefore(item, host.nextSibling);
})();

let hapRepaintWired = false;
let trigHapWired = false;
const SLIDER_MIN = 1, SLIDER_MAX = 10;
const LINE_MIN = -5, LINE_MAX = 5;

function tiltDegFromRange(v) { return Math.round(56.5 - 4.5 * (v - 1)); }
const SMOOTH_LAG_LO = 55, SMOOTH_LAG_HI = 195;
function lagFromSmooth(v) { return SMOOTH_LAG_LO + (SMOOTH_LAG_HI - SMOOTH_LAG_LO) * (v - 1) / 9; }
function cutoffFromSmooth(v) { return 1000 / (2 * Math.PI * lagFromSmooth(v)); }
function wheelbaseFromSlider(v) { return 4.4 + (2.6 - 4.4) * (v - 1) / 9; }
function expoFromSlider(v)   { return 3.5 + (1.0 - 3.5) * (v - 1) / 9; }
function weightFromSlider(v) {
  return v <= 5 ? 0.50 + (0.58 - 0.50) * (v - 1) / 4
                : 0.58 + (1.00 - 0.58) * (v - 5) / 5;
}
function yawDampFromSlider(v) {
  return v <= 5 ? 0.90 + (1.00 - 0.90) * (v - 1) / 4
                : 1.00 + (1.40 - 1.00) * (v - 5) / 5;
}
function lockFromSlider(v)   { return 0.18 + (0.435 - 0.18) * (v - 1) / 9; }
function speedRefFromSlider(v) { return 15 + (75 - 15) * (v - 1) / 9; }
function paceLabel(v) { return Math.round(paceFromSlider(v) * 100) + "%"; }
function helpFromSlider(v)   { return (v - 1) / 9 * 0.70; }
function lineLabel(v) { return v === 0 ? "OFF" : (v > 0 ? "PULL " + v : "PUSH " + (-v)); }
function adaptMixFromSlider(v) { return (v - 1) / 9; }
function adaptLabel(v) { return v <= 1 ? "OFF" : String(v); }

function curveTrimFromSlider(v) {
  return v <= 5 ? 0.6 + (1.0 - 0.6) * (v - 1) / 4
                : 1.0 + (1.7 - 1.0) * (v - 5) / 5;
}
function touchRangeFromSlider(v) {
  return v <= 5 ? 0.24 + (0.12 - 0.24) * (v - 1) / 4
                : 0.12 + (0.06 - 0.12) * (v - 5) / 5;
}
function touchSpeedFromSlider(v) { return (v - 1) / 9; }
function dragCutoffFromSlider(v) { return v <= 1 ? 0 : 6.5 + (1.2 - 6.5) * (v - 2) / 8; }
function dragSmoothLabel(v) { return v <= 1 ? "OFF" : String(v); }
function steerRateFromSlider(v) {
  return v <= 5 ? 2.5 + (4.0 - 2.5) * (v - 1) / 4
                : 4.0 + (7.0 - 4.0) * (v - 5) / 5;
}
function analogSpeedFromSlider(v) { return (v - 1) / 9; }
function pctLabel(v) { return v + "%"; }

const PRESETS = {
  rookie:   { tiltDeg: 4, steerSmooth: 9, steerRate: 2,
              steerExpo: 4, steerLock: 5, steerSpeed: 5, drivingHelp: 9, raceLine: 4,
              adaptiveButtons: 9, brakeCue: 9, audioCues: 7, gripSteer: 8 },
  relax:    { tiltDeg: 4, steerSmooth: 8, steerRate: 2,
              steerExpo: 4, steerLock: 5, steerSpeed: 5, drivingHelp: 8, raceLine: 2,
              adaptiveButtons: 8, brakeCue: 8, audioCues: 6, gripSteer: 6 },
  standard: { tiltDeg: 8, steerSmooth: 3, steerRate: 2,
              steerExpo: 6, steerLock: 7, steerSpeed: 7, drivingHelp: 1, raceLine: 0,
              adaptiveButtons: 5, brakeCue: 1, audioCues: 1, gripSteer: 1 },
  pro:      { tiltDeg: 7, steerSmooth: 3, steerRate: 7,
              steerExpo: 6, steerLock: 7, steerSpeed: 7, drivingHelp: 1, raceLine: 0,
              adaptiveButtons: 4, brakeCue: 4, audioCues: 1, gripSteer: 1 },
};
const PRESET_STORE = {
  tiltDeg: "tiltDeg", steerSmooth: "steerSmooth",
  steerRate: "steerRate", steerExpo: "steerExpo", steerLock: "steerLock",
  steerSpeed: "steerSpeed", drivingHelp: "drivingHelp", raceLine: "raceLine",
  adaptiveButtons: "adaptiveButtons", brakeCue: "brakeCue", audioCues: "audioCues", gripSteer: "gripSteer",
};

const STEER_LEVELS = {
  easy:   { steerRate: 2, steerExpo: 4, steerLock: 5, steerSpeed: 5 },
  assist: { steerRate: 2, steerExpo: 5, steerLock: 6, steerSpeed: 6 },
  normal: { steerRate: 2, steerExpo: 6, steerLock: 7, steerSpeed: 7 },
  sim:    { steerRate: 7, steerExpo: 6, steerLock: 7, steerSpeed: 7 },
};
const STEER_LEVEL_ORDER = ["easy", "assist", "normal", "sim"];
const STEER_LEVEL_LABEL = { easy: "SUPER EASY", assist: "ASSISTED", normal: "NORMAL", sim: "SIM" };
const STEER_DEFAULTS = { steerRate: 2, steerExpo: 6, steerLock: 7, steerSpeed: 7 };
const HELP_LEVELS = { low: 1, med: 5, high: 9 };
const HELP_LABEL = { low: "OFF", med: "MEDIUM", high: "HIGH" };
const LINE_LEVELS = { off: 0, corner: 3, full: 5 };
const LINE_FOLD = { off: "STEER OFF", corner: "CORNERS", full: "FULL", custom: "CUSTOM" };
const FEEL_VALUES = STEER_LEVEL_ORDER.map((n) => [n, STEER_LEVEL_LABEL[n]]).concat([["custom", "CUSTOM", true]]);
const HELP_VALUES = ["low", "med", "high"].map((n) => [n, HELP_LABEL[n]]);
const LINE_VALUES = [["off", "OFF"], ["corner", "CORNERS"], ["full", "FULL"], ["custom", "CUSTOM", true]];
function helpBand() {
  const dh = clamp(store.get("drivingHelp", 1), SLIDER_MIN, SLIDER_MAX);
  return dh <= 3 ? "low" : dh <= 7 ? "med" : "high";
}
function lineBand() {
  const rl = clamp(store.get("raceLine", 0), LINE_MIN, LINE_MAX);
  if (rl === LINE_LEVELS.off) return "off";
  if (rl === LINE_LEVELS.full) return "full";
  if (rl === LINE_LEVELS.corner) return "corner";
  return "custom";
}

function paintRow(id, v, label) {
  const el = $(id), out = $(id + "-v");
  if (el) el.value = v;
  if (out) out.textContent = label === undefined ? String(v) : label;
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  for (const storeKey of Object.keys(PRESET_STORE)) store.set(storeKey, p[storeKey]);
  store.set("preset", name);
  applySteerTuning();
  refreshPresetButtons();
}
function clearPreset() { store.set("preset", "custom"); refreshPresetButtons(); }
function clearPresetFor(key) { if (Object.prototype.hasOwnProperty.call(PRESET_STORE, key)) clearPreset(); }
function matchPreset() {
  for (const name of ["rookie", "relax", "standard", "pro"]) {
    const p = PRESETS[name];
    if (Object.keys(PRESET_STORE).every((k) => store.get(k, PRESETS.standard[k]) === p[k])) return name;
  }
  return null;
}
function refreshPresetButtons() {
  const matched = matchPreset();
  const claimed = store.get("preset", "standard");
  if (matched) {
    if (claimed !== matched) store.set("preset", matched);
  } else if (claimed !== "custom") {
    store.set("preset", "custom");
  }
  const active = matched;
  for (const name of ["rookie", "relax", "standard", "pro"]) {
    const btn = $("pm-preset-" + name);
    if (btn) btn.classList.toggle("active", name === active);
  }
}

function matchSteerLevel() {
  for (const n of STEER_LEVEL_ORDER) {
    const L = STEER_LEVELS[n];
    if (Object.keys(L).every((k) => store.get(k, STEER_DEFAULTS[k]) === L[k])) return n;
  }
  return null;
}
function refreshMacros() {
  const ts = clamp(store.get("tiltDeg", 8), SLIDER_MIN, SLIDER_MAX);
  if ($("pm-tiltsimple")) { $("pm-tiltsimple").value = ts; $("pm-tiltsimple-v").textContent = ts; }
  const lvl = matchSteerLevel();
  SettingRow.paint($("pm-feel"), lvl || "custom", FEEL_VALUES);
  const hb = helpBand();
  SettingRow.paint($("pm-helplevel"), hb, HELP_VALUES);
  const lb = lineBand();
  SettingRow.paint($("pm-linemode"), lb, LINE_VALUES);
  Dom.paintFold($("adv-feel-sum"), [
    ["k", "FEEL"],
    ["val", STEER_LEVEL_LABEL[lvl] || "CUSTOM"],
    ["val", "TILT " + ts],
  ]);
  Dom.paintFold($("adv-aids-sum"), [
    ["k", "AIDS"],
    [hb === "low" ? "off" : "val", HELP_LABEL[hb]],
    [lb === "off" ? "off" : "val", LINE_FOLD[lb]],
  ]);
  Dom.paintFold($("adv-more"), [["k", "ADVANCED"]]);
}

function migrateSteerStore() {
  const from = store.get("steerSchema", 1);
  if (from >= STEER_SCHEMA) return;
  for (const step of STEER_MIGRATIONS) if (from < step.to) step.apply(store);
  store.set("steerSchema", STEER_SCHEMA);
}

function applySteerTuning() {
  migrateSteerStore();
  const rate    = clamp(store.get("steerRate",  2), SLIDER_MIN, SLIDER_MAX);
  const expo    = clamp(store.get("steerExpo",  6), SLIDER_MIN, SLIDER_MAX);
  const smooth  = clamp(store.get("steerSmooth", 3), SLIDER_MIN, SLIDER_MAX);
  const tiltdeg = clamp(store.get("tiltDeg",    8), SLIDER_MIN, SLIDER_MAX);
  const lock    = clamp(store.get("steerLock",  7), SLIDER_MIN, SLIDER_MAX);
  const spdsteer = clamp(store.get("steerSpeed", 7), SLIDER_MIN, SLIDER_MAX);
  const help    = clamp(store.get("drivingHelp", 1), SLIDER_MIN, SLIDER_MAX);
  const pace    = clamp(store.get("pace", PACE_DEF), PACE_MIN, PACE_MAX);
  const line    = clamp(store.get("raceLine",   0), LINE_MIN, LINE_MAX);
  const adapt   = clamp(store.get("adaptiveButtons", 5), SLIDER_MIN, SLIDER_MAX);
  const heavyDefault = (function () {
    try { return (typeof window !== "undefined" && window.matchMedia &&
                  window.matchMedia("(pointer: coarse)").matches) ? 10 : 5; }
    catch (_) { return 5; }
  })();
  const weight  = clamp(store.get("carWeight", heavyDefault), SLIDER_MIN, SLIDER_MAX);
  G.PACE           = paceFromSlider(pace);
  G.WHEELBASE      = wheelbaseFromSlider(rate);
  G.STEER_EXPO     = expoFromSlider(expo);
  G.STEER_MAX_SLIP = lockFromSlider(lock);
  G.STEER_SPEED_REF = speedRefFromSlider(spdsteer);
  G.ROAD_FOLLOW    = helpFromSlider(help);
  const gripRaw = store.get("gripSteer", 1);
  const grip = clamp(typeof gripRaw === "number" && isFinite(gripRaw) ? gripRaw : 1, SLIDER_MIN, SLIDER_MAX);
  if ((typeof GripSteer !== "undefined") && GripSteer.setLevel) GripSteer.setLevel(grip);
  G.YAW_INERTIA    = weightFromSlider(weight);
  G.YAW_DAMP       = yawDampFromSlider(weight);
  Input.setTiltSmoothing(cutoffFromSmooth(smooth));
  Input.setTiltSensitivity(tiltDegFromRange(tiltdeg));
  Input.setAdaptiveButtons(adaptMixFromSlider(adapt));
  Input.setSteerSpeedRef(G.STEER_SPEED_REF);
  if (Input.setSteerExpo) Input.setSteerExpo(G.STEER_EXPO);
  const tiltCurve   = clamp(store.get("tiltCurve", 5), SLIDER_MIN, SLIDER_MAX);
  const touchCurve  = clamp(store.get("touchCurve", 5), SLIDER_MIN, SLIDER_MAX);
  const padCurve    = clamp(store.get("padCurve", 5), SLIDER_MIN, SLIDER_MAX);
  const touchRange  = clamp(store.get("touchRange", 5), SLIDER_MIN, SLIDER_MAX);
  const touchDrag   = clamp(store.get("touchDragSpeed", 1), SLIDER_MIN, SLIDER_MAX);
  const dragSmooth  = clamp(store.get("dragSmooth", 1), SLIDER_MIN, SLIDER_MAX);
  const steerRate2  = clamp(store.get("digitalRate", 5), SLIDER_MIN, SLIDER_MAX);
  const analogSpd   = clamp(store.get("analogSpeedSteer", 1), SLIDER_MIN, SLIDER_MAX);
  const haptics     = clamp(store.get("haptics", 6), SLIDER_MIN, SLIDER_MAX);
  const padDz       = clamp(store.get("padDeadzone", 5), 0, 30);
  const padSat      = clamp(store.get("padSaturation", 0), 0, 30);
  Input.setAnalogTrim("tilt", curveTrimFromSlider(tiltCurve));
  Input.setAnalogTrim("touch", curveTrimFromSlider(touchCurve));
  Input.setAnalogTrim("pad", curveTrimFromSlider(padCurve));
  Input.setTouchRange(touchRangeFromSlider(touchRange));
  if (Input.setTouchSpeedMix) Input.setTouchSpeedMix(touchSpeedFromSlider(touchDrag));
  Input.setDragSmoothing(dragCutoffFromSlider(dragSmooth));
  Input.setKeyRampIn(steerRateFromSlider(steerRate2));
  Input.setAnalogSpeedMix(analogSpeedFromSlider(analogSpd));
  Input.setHaptics(haptics <= 1 ? 0 : (haptics - 1) / 9);
  const trigHap = store.get("triggerHaptics", true) !== false;
  if (Input.setTriggerHaptics) Input.setTriggerHaptics(trigHap);
  Input.setPadDeadzone(padDz / 100);
  Input.setPadSaturation(padSat / 100);
  G.raceLineAssist = line / 5;
  const cueRaw = store.get("brakeCue", 1);
  const cue = clamp(typeof cueRaw === "number" && isFinite(cueRaw) ? cueRaw : 1, SLIDER_MIN, SLIDER_MAX);
  if ((typeof BrakeCue !== "undefined")) BrakeCue.setLevel(cue);
  const audioRaw = store.get("audioCues", 1);
  const audioCues = clamp(typeof audioRaw === "number" && isFinite(audioRaw) ? audioRaw : 1, SLIDER_MIN, SLIDER_MAX);
  if ((typeof DrivingCues !== "undefined")) DrivingCues.setLevel(audioCues);
  $("pm-rate").value    = rate;    $("pm-rate-v").textContent    = rate;
  $("pm-expo").value    = expo;    $("pm-expo-v").textContent    = expo;
  $("pm-smooth").value  = smooth;  $("pm-smooth-v").textContent  = smooth;
  $("pm-lock").value    = lock;    $("pm-lock-v").textContent    = lock;
  $("pm-speedsteer").value = spdsteer; $("pm-speedsteer-v").textContent = spdsteer;
  if ($("pm-weight")) { $("pm-weight").value = weight; $("pm-weight-v").textContent = weight; }
  if ($("pm-adaptbtn")) { $("pm-adaptbtn").value = adapt; $("pm-adaptbtn-v").textContent = adaptLabel(adapt); }
  if ($("pm-brakecue")) { $("pm-brakecue").value = cue; $("pm-brakecue-v").textContent = ((typeof BrakeCue !== "undefined") && BrakeCue.labelOf) ? BrakeCue.labelOf(cue) : (cue <= 1 ? "OFF" : "CUE " + cue); }
  if ($("pm-gripsteer")) {
    $("pm-gripsteer").value = grip;
    $("pm-gripsteer-v").textContent = ((typeof GripSteer !== "undefined") && GripSteer.labelOf) ? GripSteer.labelOf(grip) : (grip <= 1 ? "OFF" : "GRIP " + grip);
  }
  if ($("pm-audiocues")) {
    $("pm-audiocues").value = audioCues;
    $("pm-audiocues-v").textContent = ((typeof DrivingCues !== "undefined") && DrivingCues.labelOf)
      ? DrivingCues.labelOf(audioCues) : (audioCues <= 1 ? "OFF" : "CUES " + audioCues);
  }
  $("pm-help").value    = help;    $("pm-help-v").textContent    = help;
  $("pm-pace").value    = pace;    $("pm-pace-v").textContent    = paceLabel(pace);
  $("pm-line").value    = line;    $("pm-line-v").textContent    = lineLabel(line);
  paintRow("pm-tiltcurve", tiltCurve);
  paintRow("pm-touchcurve", touchCurve);
  paintRow("pm-padcurve", padCurve);
  paintRow("pm-touchrange", touchRange);
  paintRow("pm-touchdragspeed", touchDrag, adaptLabel(touchDrag));
  paintRow("pm-dragsmooth", dragSmooth, dragSmoothLabel(dragSmooth));
  paintRow("pm-steerrate", steerRate2);
  paintRow("pm-analogspeed", analogSpd, adaptLabel(analogSpd));
  paintRow("pm-haptics", haptics, adaptLabel(haptics));
  const hapItem = $("pm-haptics-item");
  if (hapItem && (typeof Input !== "undefined") && Input.hapticsSupported) {
    hapItem.hidden = !Input.hapticsSupported();
    if (!hapRepaintWired && typeof window.addEventListener === "function") {
      hapRepaintWired = true;
      const repaintHaptics = () => {
        hapItem.hidden = !Input.hapticsSupported();
        paintTriggerHapRow();
      };
      for (const event of ["gamepadconnected", "gamepaddisconnected", "apexhapticschange"]) window.addEventListener(event, repaintHaptics);
    }
  }
  paintTriggerHapRow();
  paintRow("pm-paddz", padDz, pctLabel(padDz));
  paintRow("pm-padsat", padSat, pctLabel(padSat));
  refreshPresetButtons();
  refreshMacros();
}
$("pm-rate").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("steerRate", v);
  G.WHEELBASE = wheelbaseFromSlider(v); $("pm-rate-v").textContent = v; clearPreset();
};
$("pm-expo").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("steerExpo", v);
  G.STEER_EXPO = expoFromSlider(v);
  if (Input.setSteerExpo) Input.setSteerExpo(G.STEER_EXPO);
  $("pm-expo-v").textContent = v; clearPreset();
};
$("pm-smooth").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("steerSmooth", v);
  Input.setTiltSmoothing(cutoffFromSmooth(v)); $("pm-smooth-v").textContent = v; clearPreset();
};
$("pm-lock").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("steerLock", v);
  G.STEER_MAX_SLIP = lockFromSlider(v); $("pm-lock-v").textContent = v; clearPreset();
};
$("pm-speedsteer").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("steerSpeed", v);
  G.STEER_SPEED_REF = speedRefFromSlider(v);
  Input.setSteerSpeedRef(G.STEER_SPEED_REF);
  $("pm-speedsteer-v").textContent = v; clearPreset();
};
if ($("pm-weight")) $("pm-weight").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("carWeight", v);
  G.YAW_INERTIA = weightFromSlider(v);
  G.YAW_DAMP = yawDampFromSlider(v);
  $("pm-weight-v").textContent = v; clearPresetFor("carWeight");
};
if ($("pm-adaptbtn")) $("pm-adaptbtn").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("adaptiveButtons", v);
  Input.setAdaptiveButtons(adaptMixFromSlider(v));
  $("pm-adaptbtn-v").textContent = adaptLabel(v);
  clearPreset();
};
if ($("pm-brakecue")) $("pm-brakecue").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("brakeCue", v);
  if ((typeof BrakeCue !== "undefined")) BrakeCue.setLevel(v);
  $("pm-brakecue-v").textContent = ((typeof BrakeCue !== "undefined") && BrakeCue.labelOf) ? BrakeCue.labelOf(v) : (v <= 1 ? "OFF" : "CUE " + v);
  clearPreset();
};
if ($("pm-gripsteer")) $("pm-gripsteer").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("gripSteer", v);
  if ((typeof GripSteer !== "undefined") && GripSteer.setLevel) GripSteer.setLevel(v);
  $("pm-gripsteer-v").textContent = ((typeof GripSteer !== "undefined") && GripSteer.labelOf) ? GripSteer.labelOf(v) : (v <= 1 ? "OFF" : "GRIP " + v);
  clearPreset();
};
$("advanced-inner").addEventListener("input", (e) => {
  if (e.target && e.target.id === "pm-audiocues") clearPresetFor("audioCues");
});
$("pm-help").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("drivingHelp", v);
  G.ROAD_FOLLOW = helpFromSlider(v); $("pm-help-v").textContent = v; clearPreset();
};
$("pm-pace").oninput = (e) => {
  const v = clamp(+e.target.value, PACE_MIN, PACE_MAX); store.set("pace", v);
  G.PACE = paceFromSlider(v); $("pm-pace-v").textContent = paceLabel(v);
};
$("pm-line").oninput = (e) => {
  const v = clamp(+e.target.value, LINE_MIN, LINE_MAX); store.set("raceLine", v);
  G.raceLineAssist = v / 5; $("pm-line-v").textContent = lineLabel(v); clearPreset();
};
if ($("pm-preset-rookie")) $("pm-preset-rookie").onclick = () => {
  store.set("autoThrottle", true);
  applyPreset("rookie");
  if (G.onAssistBundle) G.onAssistBundle();
  if (G.soundOn) GameAudio.uiSelect();
};
const handBackPreset = (name) => () => {
  const handBack = store.get("autoThrottle", false) === true;
  if (handBack) store.set("autoThrottle", false);
  applyPreset(name);
  if (handBack && G.onAssistBundle) G.onAssistBundle();
  if (G.soundOn) GameAudio.uiSelect();
};
$("pm-preset-relax").onclick = handBackPreset("relax");
$("pm-preset-standard").onclick = handBackPreset("standard");
$("pm-preset-pro").onclick = handBackPreset("pro");

function wireTune(id, key, def, lo, hi, push, label) {
  const el = $(id);
  if (!el) return;
  el.oninput = (e) => {
    const v = clamp(+e.target.value, lo, hi);
    store.set(key, v);
    push(v);
    paintRow(id, v, label ? label(v) : undefined);
    clearPresetFor(key);
  };
}
wireTune("pm-tiltcurve", "tiltCurve", 5, SLIDER_MIN, SLIDER_MAX, (v) => Input.setAnalogTrim("tilt", curveTrimFromSlider(v)));
wireTune("pm-touchcurve", "touchCurve", 5, SLIDER_MIN, SLIDER_MAX, (v) => Input.setAnalogTrim("touch", curveTrimFromSlider(v)));
wireTune("pm-padcurve", "padCurve", 5, SLIDER_MIN, SLIDER_MAX, (v) => Input.setAnalogTrim("pad", curveTrimFromSlider(v)));
wireTune("pm-touchrange", "touchRange", 5, SLIDER_MIN, SLIDER_MAX, (v) => Input.setTouchRange(touchRangeFromSlider(v)));
wireTune("pm-touchdragspeed", "touchDragSpeed", 1, SLIDER_MIN, SLIDER_MAX, (v) => {
  if (Input.setTouchSpeedMix) Input.setTouchSpeedMix(touchSpeedFromSlider(v));
}, adaptLabel);
wireTune("pm-dragsmooth", "dragSmooth", 1, SLIDER_MIN, SLIDER_MAX, (v) => Input.setDragSmoothing(dragCutoffFromSlider(v)), dragSmoothLabel);
wireTune("pm-steerrate", "digitalRate", 5, SLIDER_MIN, SLIDER_MAX, (v) => Input.setKeyRampIn(steerRateFromSlider(v)));
wireTune("pm-analogspeed", "analogSpeedSteer", 1, SLIDER_MIN, SLIDER_MAX, (v) => Input.setAnalogSpeedMix(analogSpeedFromSlider(v)), adaptLabel);
wireTune("pm-haptics", "haptics", 6, SLIDER_MIN, SLIDER_MAX, (v) => Input.setHaptics(v <= 1 ? 0 : (v - 1) / 9), adaptLabel);
wireTune("pm-paddz", "padDeadzone", 5, 0, 30, (v) => Input.setPadDeadzone(v / 100), pctLabel);
wireTune("pm-padsat", "padSaturation", 0, 0, 30, (v) => Input.setPadSaturation(v / 100), pctLabel);

function paintTriggerHapRow() {
  const item = $("pm-triggerhap-item");
  if (!item || typeof Input === "undefined") return;
  const ok = !!(Input.triggerRumbleSupported && Input.triggerRumbleSupported());
  item.hidden = !ok;
  if (!ok || typeof SettingRow === "undefined") return;
  const on = store.get("triggerHaptics", true) !== false;
  SettingRow.paint($("pm-triggerhap"), on ? "on" : "off", SettingRow.labels(["off", "on"]));
  if (!trigHapWired) {
    trigHapWired = true;
    SettingRow.wire("pm-triggerhap", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (store.get("triggerHaptics", true) !== false ? "on" : "off"),
      write: (v) => {
        const want = v === "on";
        store.set("triggerHaptics", want);
        if (Input.setTriggerHaptics) Input.setTriggerHaptics(want);
        if (G.soundOn) GameAudio.uiSelect();
      },
    });
  }
}

const wheelAnchor = typeof WheelState !== "undefined" && $("pm-linemode-jump");
if (wheelAnchor && wheelAnchor.parentNode && wheelAnchor.parentNode.parentNode && typeof document !== "undefined") {
  const WHEEL_VALUES = [["off", "OFF"], ["on", "WHEELS"], ["medium", "ABS/TC MED"], ["full", "ABS/TC FULL"]];
  const built = SettingRow.build("pm-wheelmodel", "WHEEL LOCK & ABS", WHEEL_VALUES);
  const item = document.createElement("div"), help = document.createElement("p");
  item.className = "adv-item"; help.className = "adv-help";
  help.textContent = "OFF is the classic feel. WHEELS models each axle\u2019s wheel speed, so slicks in the wet really lock or spin; dry driving feels the same. ABS/TC MED and FULL add brake and traction control: FULL keeps the wheels turning most.";
  item.append(built.row, help);
  wheelAnchor.parentNode.after(item);
  SettingRow.wire("pm-wheelmodel", { values: WHEEL_VALUES, read: WheelState.mode, write: (m) => { WheelState.setMode(m); if (G.soundOn) GameAudio.uiSelect(); } });
  SettingRow.paint(built.row, WheelState.mode(), WHEEL_VALUES);
}
$("pm-tiltsimple").oninput = (e) => {
  store.set("tiltDeg", clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX)); clearPreset(); applySteerTuning();
};
function applySteerLevel(name) {
  const L = STEER_LEVELS[name]; if (!L) return;
  for (const k in L) store.set(k, L[k]);
  clearPreset(); applySteerTuning();
  if (G.soundOn) GameAudio.uiSelect();
}
SettingRow.wire("pm-feel", { values: FEEL_VALUES, read: () => matchSteerLevel() || "custom", write: applySteerLevel });
SettingRow.wire("pm-helplevel", { values: HELP_VALUES, read: helpBand, write: (n) => {
  store.set("drivingHelp", HELP_LEVELS[n]); clearPreset(); applySteerTuning();
  if (G.soundOn) GameAudio.uiSelect();
} });
SettingRow.wire("pm-linemode", { values: LINE_VALUES, read: lineBand, write: (n) => {
  if (n === "custom" || LINE_LEVELS[n] == null) return;
  store.set("raceLine", LINE_LEVELS[n]); clearPreset(); applySteerTuning();
  if (G.soundOn) GameAudio.uiSelect();
} });
Input.setSpeedProvider(function () {
  const p = G.player;
  if (!p) return 0;
  return Math.abs(p.speed || 0) / Math.max(G.PACE || 1, 0.05);
});
const advDetails = $("adv-details");
advDetails.addEventListener("toggle", () => {
  $("adv-more").setAttribute("aria-expanded", advDetails.open ? "true" : "false");
  if (G.soundOn) GameAudio.uiSelect();
});
$("advanced-inner").addEventListener("input", refreshMacros);
applySteerTuning();
return { applySteerTuning };
}

return { create, migrateValues, STEER_SCHEMA };
})();
Object.freeze(SteerTuning);
