/* Apex 26 — steering-tuning sliders, presets and macro levels for js/game.js
   (the ADVANCED pause-menu page). Writes the live physics tunables through
   the ctx façade G (the same getter/setter surface __apex.setPhysics uses),
   so slider changes hit the bicycle model exactly as before. Consumes globals
   GameAudio, Input. Must load BEFORE js/game.js (see index.html). */
const SteerTuning = (function () {
  "use strict";

function create(G) {
// Stable helpers from the game.js closure.
const { $, store } = G;

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
// v1 is a true ZERO — the car does exactly, and only, what the driver asks.
// This used to bottom out at 0.25, so the assist was always steering a quarter of
// every corner and there was no way to switch it off; you were permanently
// driving against a hand you could not see or disable. That is the "forced" feel.
// It is now opt-IN: the default is v1 (off), and the range runs 0 .. 0.70.
function helpFromSlider(v)   { return (v - 1) / 9 * 0.70; }            // 0..0.70 assist gain, v1 = OFF
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
              steerExpo: 4, steerLock: 5, steerSpeed: 4, drivingHelp: 8, raceLine: 2 },
  standard: { tiltDeg: 6, steerSmooth: 6, steerRate: 5,
              steerExpo: 5, steerLock: 5, steerSpeed: 5, drivingHelp: 1, raceLine: 0 },
  pro:      { tiltDeg: 7, steerSmooth: 3, steerRate: 7,
              steerExpo: 6, steerLock: 7, steerSpeed: 7, drivingHelp: 1, raceLine: 0 },
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
const HELP_LEVELS = { low: 1, med: 5, high: 9 };   // low = OFF (see helpFromSlider)
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
  const dh = store.get("drivingHelp", 1);
  const hb = dh <= 3 ? "low" : dh <= 7 ? "med" : "high";
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
  const help    = store.get("drivingHelp", 1);   // default: assist OFF
  const pace    = store.get("pace",       5);
  const line    = store.get("raceLine",   0);
  G.PACE           = paceFromSlider(pace);
  G.WHEELBASE      = wheelbaseFromSlider(rate);
  G.STEER_EXPO     = expoFromSlider(expo);
  G.STEER_MAX_SLIP = lockFromSlider(lock);
  G.STEER_SPEED_REF = speedRefFromSlider(spdsteer);
  G.ROAD_FOLLOW    = helpFromSlider(help);
  Input.setTiltSmoothing(cutoffFromSmooth(smooth));
  Input.setTiltSensitivity(tiltDegFromRange(tiltdeg));
  G.raceLineAssist = line / 5;
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
  G.WHEELBASE = wheelbaseFromSlider(v); $("pm-rate-v").textContent = v; clearPreset();
};
$("pm-expo").oninput = (e) => {
  const v = +e.target.value; store.set("steerExpo", v);
  G.STEER_EXPO = expoFromSlider(v); $("pm-expo-v").textContent = v; clearPreset();
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
  G.STEER_MAX_SLIP = lockFromSlider(v); $("pm-lock-v").textContent = v; clearPreset();
};
$("pm-speedsteer").oninput = (e) => {
  const v = +e.target.value; store.set("steerSpeed", v);
  G.STEER_SPEED_REF = speedRefFromSlider(v); $("pm-speedsteer-v").textContent = v; clearPreset();
};
$("pm-help").oninput = (e) => {
  const v = +e.target.value; store.set("drivingHelp", v);
  G.ROAD_FOLLOW = helpFromSlider(v); $("pm-help-v").textContent = v; clearPreset();
};
$("pm-pace").oninput = (e) => {
  const v = +e.target.value; store.set("pace", v);
  G.PACE = paceFromSlider(v); $("pm-pace-v").textContent = v;
};
$("pm-line").oninput = (e) => {
  const v = +e.target.value; store.set("raceLine", v);
  G.raceLineAssist = v / 5; $("pm-line-v").textContent = lineLabel(v); clearPreset();
};
$("pm-preset-relax").onclick    = () => { applyPreset("relax");    if (G.soundOn) GameAudio.uiSelect(); };
$("pm-preset-standard").onclick = () => { applyPreset("standard"); if (G.soundOn) GameAudio.uiSelect(); };
$("pm-preset-pro").onclick      = () => { applyPreset("pro");      if (G.soundOn) GameAudio.uiSelect(); };

// ---- simplified controls: each fans out to the granular store keys ----
$("pm-tiltsimple").oninput = (e) => {
  store.set("tiltDeg", +e.target.value); clearPreset(); applySteerTuning();
};
function applySteerLevel(name) {
  const L = STEER_LEVELS[name]; if (!L) return;
  for (const k in L) store.set(k, L[k]);
  clearPreset(); applySteerTuning();
  if (G.soundOn) GameAudio.uiSelect();
}
for (const n of STEER_LEVEL_ORDER) $("pm-steer-" + n).onclick = () => applySteerLevel(n);
for (const n of ["low", "med", "high"]) $("pm-help-" + n).onclick = () => {
  store.set("drivingHelp", HELP_LEVELS[n]); clearPreset(); applySteerTuning();
  if (G.soundOn) GameAudio.uiSelect();
};
for (const n of ["off", "corner", "full"]) $("pm-line-" + n).onclick = () => {
  store.set("raceLine", LINE_LEVELS[n]); clearPreset(); applySteerTuning();
  if (G.soundOn) GameAudio.uiSelect();
};
$("adv-more").onclick = () => {
  const open = $("adv-extra").hidden;        // currently hidden → about to open
  $("adv-extra").hidden = !open;
  $("adv-more").setAttribute("aria-expanded", String(open));
  $("adv-more").innerHTML = open ? "ADVANCED &#9652;" : "ADVANCED &#9662;";
  if (G.soundOn) GameAudio.uiSelect();
};
// Any granular Advanced edit refreshes the simplified controls (events bubble up).
$("advanced-inner").addEventListener("input", refreshMacros);
applySteerTuning();
// GEARS toggle: usable when thumbs are free (tilt or desktop keyboard).
return { applySteerTuning };
}

return { create };
})();
