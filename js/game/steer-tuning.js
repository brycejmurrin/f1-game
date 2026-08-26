/* Apex 26 — steering-tuning sliders, presets and macro levels for js/game.js (the ADVANCED pause-menu page). Writes the live physics tunables through the ctx faça… */
const SteerTuning = (function () {
  "use strict";

function create(G) {
Log.info("input", "SteerTuning.create");
// Stable helpers from the game.js closure.
const { $, store, clamp } = G;
if (window.BrakeCue && BrakeCue.create) BrakeCue.create(G);

const SLIDER_MIN = 1, SLIDER_MAX = 10;
const LINE_MIN = -5, LINE_MAX = 5;               // index.html #pm-line min/max

// Every slider is an integer 1..10 (racing line is -5..5) that maps to a
// physical value. Each maps so the DEFAULT value reproduces the original
// hand-tuned feel. Higher slider = the direction named in the label.
//
//  pm-rate     RESPONSE       WHEELBASE m (inverted) — high slider = shorter
//                             wheelbase = less yaw inertia = snappier turn-in.
//  pm-expo     LINEARITY      STEER_EXPO — high slider = more linear/direct,
//                             low = gentle near centre. Applied to the UNIFIED
//                             steer command in updateCar, so it shapes EVERY
//                             source alike — pad and canvas touch as much as
//                             tilt and keys. (The old note said "tilt + keys",
//                             which would mislead anyone tuning for a gamepad.)
//  pm-smooth   STEER SMOOTHING One-Euro min-cutoff, set as LAG in ms — higher
//                             slider = more lag = steadier/smoother tilt.
//  pm-tiltdeg  TILT RANGE     MAX_TILT — degrees of tilt for full lock (the one
//                             tilt-sensitivity knob; dead zone is fixed at 2.5°).
//  pm-lock     STEER LOCK     STEER_MAX_SLIP — max road-wheel steer angle (rad).
//  pm-speedsteer SPEED STEER  STEER_SPEED_REF — high slider = keeps more steering
//                             at speed (sharper); low = calmer/stabler at speed.
//  pm-adaptbtn ADAPTIVE BUTTONS 1..10 mix of the digital-steer rate half of
//                             SPEED STEER + analog travel. v1 = OFF, default 6.
//  pm-brakecue BRAKE CUE      1 = OFF; 2..10 = pulse-rate cue + lookahead.
//  pm-line     RACING LINE    assist: 0 off, +pull to line, -push wide.
// The car is planted (understeer-only): DRIFT defaults to 0 so the rear never
// steps out — overcooking a corner washes the front wide, it never snaps round.
// The simplified default-view controls (STEERING / TILT / DRIVING HELP / RACING
// LINE) bundle these for players who don't want the detail — see refreshMacros().
function tiltDegFromRange(v) { return Math.round(50 + (18 - 50) * (v - 1) / 9); }
const SMOOTH_LAG_LO = 55, SMOOTH_LAG_HI = 195;   // ms of lag at notch 1 / notch 10
function lagFromSmooth(v) { return SMOOTH_LAG_LO + (SMOOTH_LAG_HI - SMOOTH_LAG_LO) * (v - 1) / 9; }
function cutoffFromSmooth(v) { return 1000 / (2 * Math.PI * lagFromSmooth(v)); }
// RESPONSE -> WHEELBASE m (inverted; high slider = shorter = snappier turn-in).
// 4.4..2.6 m, recentred on a REAL car: a 2026 F1 car is ~3.6 m between the axles,
// which the old 4.3..1.9 m range put at notch 5.9 — so notches 6-10 (2.97..1.9 m)
// were go-kart geometry, and a player "ending up on the lower end" was correctly
// finding the only part of the range that corresponded to an actual car. v5 is
// now exactly 3.60 m (today's default was already 3.23 m, shorter than any F1
// car), so the travel that used to sit below 2.6 m is redistributed across the
// range people actually use. Moves the shipped default — see
// docs/research/PHASE-C-SLIDER-DESIGN.md §3.
function wheelbaseFromSlider(v) { return 4.4 + (2.6 - 4.4) * (v - 1) / 9; } // 4.4..2.6, v5=3.60
function expoFromSlider(v)   { return 3.5 + (1.0 - 3.5) * (v - 1) / 9; } // 3.5..1.0
function lockFromSlider(v)   { return 0.18 + (0.42 - 0.18) * (v - 1) / 9; } // rad, .18..0.42, v5≈0.29
// SPEED STEER -> STEER_SPEED_REF, the reference speed for the lock taper in
// js/game.js. That taper is now `1 / (1 + v/ref)` (hyperbolic — see the comment
// at lockTaper in game.js), so ref only needs to be in the same NEIGHBOURHOOD as
// real speeds to matter; the old 44..124 m/s range was tuned for the retired
// `1 - v/ref` line, which needed a much bigger ref for the same amount of taper.
// 15..75 m/s is the hyperbolic-law range: every notch now does something at
// every speed, where the old law was bit-for-bit identical across notches 1-9
// at 72 m/s (the floor, not the slider, was doing the work). Moves the shipped
// default — see docs/research/PHASE-C-SLIDER-DESIGN.md §2.
function speedRefFromSlider(v) { return 15 + (75 - 15) * (v - 1) / 9; } // 15..75, v5≈41.7
// RACE PACE -> the ground-speed scale G.PACE. GEOMETRIC: a fixed 6.0 % per notch
// over 19 notches. Pace is a MULTIPLIER on ground speed, so a ratio is its
// natural unit; the old piecewise-linear grid (0.5 + 0.125/notch below the
// default, 1.0 + 0.06/notch above) made one notch worth 14-25 % on the low half
// and 4.8-6 % on the high half — so the half a player who wants a calmer car has
// to use was the half with almost no resolution. That asymmetry is the mapping's,
// not the player's.
//
// PACE_REF = 14 is the anchor and 1.06^0 is EXACTLY 1.0 there. That is not a
// tidy round number by accident: it is the reference scale vTop()/vStd() are
// defined against, several specs pin it, and __apex.setPhysics({pace:1}) must
// keep meaning what it means. An anchored grid gets that for free.
// The DEFAULT drops to notch 11 = 0.840, which is the change the player asked
// for and is now independent of the grid's shape.
const PACE_MIN = 1, PACE_MAX = 19, PACE_REF = 14, PACE_DEF = 11, PACE_STEP = 1.06;
function paceFromSlider(v)   { return Math.pow(PACE_STEP, v - PACE_REF); }   // 0.469..1.338, v14 = 1.0
// The readout is a PERCENTAGE OF REFERENCE PACE, and deliberately NOT km/h:
// dashKph divides PACE back out on purpose, so the dial reads 0 -> ~259 km/h at
// EVERY setting and a km/h label here would contradict the instrument beside it.
// A bare notch number is no better — "some sliders I don't even understand" is
// what a unitless 1..19 buys you. 100 % is the reference, 84 % is the default.
function paceLabel(v) { return Math.round(paceFromSlider(v) * 100) + "%"; }
// DRIVING HELP = ROAD_FOLLOW: how much of each corner the car tracks for you.
// v1 is a true ZERO — the car does exactly, and only, what the driver asks.
// This used to bottom out at 0.25, so the assist was always steering a quarter of
// every corner and there was no way to switch it off; you were permanently
// driving against a hand you could not see or disable. That is the "forced" feel.
// It is now opt-IN: the default is v1 (off), and the range runs 0 .. 0.70.
function helpFromSlider(v)   { return (v - 1) / 9 * 0.70; }            // 0..0.70 assist gain, v1 = OFF
function lineLabel(v) { return v === 0 ? "OFF" : (v > 0 ? "PULL " + v : "PUSH " + (-v)); }
function adaptMixFromSlider(v) { return (v - 1) / 9; }   // 0..1, v1 = OFF
function adaptLabel(v) { return v <= 1 ? "OFF" : String(v); }

// Three named bundles drive all the handling sliders at once so a player never
// has to understand the underlying knobs. STANDARD reproduces the original
// hand-tuned defaults; RELAX stacks every forgiveness lever (on-rails grip,
// heavy corner help, racing-line pull, smooth/wide tilt) without maxing any one;
// PRO sharpens response and frees up the slide for skilled play. PACE is left
// out — it's a race-wide setting, not a handling feel.
const PRESETS = {
  relax:    { tiltDeg: 4, steerSmooth: 8, steerRate: 4,
              steerExpo: 4, steerLock: 5, steerSpeed: 4, drivingHelp: 8, raceLine: 2,
              adaptiveButtons: 8, brakeCue: 8 },
  standard: { tiltDeg: 6, steerSmooth: 6, steerRate: 5,
              steerExpo: 5, steerLock: 5, steerSpeed: 5, drivingHelp: 1, raceLine: 0,
              adaptiveButtons: 6, brakeCue: 6 },
  pro:      { tiltDeg: 7, steerSmooth: 3, steerRate: 7,
              steerExpo: 6, steerLock: 7, steerSpeed: 7, drivingHelp: 1, raceLine: 0,
              adaptiveButtons: 4, brakeCue: 4 },
};
const PRESET_STORE = {  // slider store-key  ->  preset field
  tiltDeg: "tiltDeg", steerSmooth: "steerSmooth",
  steerRate: "steerRate", steerExpo: "steerExpo", steerLock: "steerLock",
  steerSpeed: "steerSpeed", drivingHelp: "drivingHelp", raceLine: "raceLine",
  adaptiveButtons: "adaptiveButtons", brakeCue: "brakeCue",
};

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
function clearPreset() { store.set("preset", "custom"); refreshPresetButtons(); }
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
  const ts = clamp(store.get("tiltDeg", 6), SLIDER_MIN, SLIDER_MAX);
  if ($("pm-tiltsimple")) { $("pm-tiltsimple").value = ts; $("pm-tiltsimple-v").textContent = ts; }
  const lvl = matchSteerLevel();
  for (const n of STEER_LEVEL_ORDER) {
    const b = $("pm-steer-" + n); if (b) b.classList.toggle("active", n === lvl);
  }
  const dh = clamp(store.get("drivingHelp", 1), SLIDER_MIN, SLIDER_MAX);
  const hb = dh <= 3 ? "low" : dh <= 7 ? "med" : "high";
  for (const n of ["low", "med", "high"]) {
    const b = $("pm-help-" + n); if (b) b.classList.toggle("active", n === hb);
  }
  const rl = clamp(store.get("raceLine", 0), LINE_MIN, LINE_MAX);
  const lb = rl === 0 ? "off" : rl >= 5 ? "full" : "corner";
  for (const n of ["off", "corner", "full"]) {
    const b = $("pm-line-" + n); if (b) b.classList.toggle("active", n === lb);
  }
}

//
// This is the only code in the game that OVERWRITES a setting the player chose,
// which is why it is written as a ladder and not as a flag. `store.get(k, d)`
// returns the stored value whenever the key exists, so changing a DEFAULT reaches
// a fresh install and nobody else; a migration is the only way to reach a store
// that already has the key. Two different acts, and doing only one of them
// reaches either nobody who has played or nobody at all.
//
// The guard used to be a single `store.get("steerSchema", 1) >= STEER_SCHEMA`
// gate. That is correct with exactly one version to migrate to and becomes DATA
// LOSS with two: a store already at 2 falls straight through it on the way to 3
// and receives V2'S RESET A SECOND TIME, silently discarding a drivingHelp or
// raceLine the player deliberately set AFTER v2 ran. Hence the ladder — each step
// declares the schema it brings the store UP TO, and a store at N runs only the
// steps above N. Same shape as CAREER_MIGRATIONS in js/game/store.js.
//
// Every key a step rewrites goes through migSet(), so the rewrite lands in the
// Log ring buffer whether or not anyone was watching. A migration that quietly
// changes a player's stored settings and leaves no record is indistinguishable
// from a bug, both to them and to us.
const STEER_SCHEMA = 4;

// The v2 pace grid. Kept for ONE reader — v3's regrid, which has to know what a
// stored notch used to mean. Nothing else may call it.
function paceFromSliderV2(v) { return v <= 5 ? 0.5 + (v - 1) * 0.125 : 1.0 + (v - 5) * 0.06; }

// old notch (1..10) -> the new notch whose pace is nearest in ABSOLUTE
// ground-speed terms. Derived from the two mappings rather than typed out, so it
// cannot drift from either: {1:2, 2:6, 3:9, 4:12, 5:14, 6:15, 7:16, 8:17, 9:18,
// 10:18}. Worst error is -2.89 % at old 10, under half a new notch, so nobody's
// car changes character (docs/research/PHASE-C-SLIDER-DESIGN.md has the table).
// Old 9 and old 10 BOTH land on 18: the top of the v2 range was finer than the
// even 6 % grid, which is the asymmetry being removed and the one lossy pair.
// NEAREST IN LOG SPACE, not in absolute pace, and that is not a detail. The new
// grid is geometric BECAUSE pace is a multiplicative scale on ground speed, so
// the distance between two settings is the RATIO between them — |ln(a/b)| — and
// measuring it in absolute m/s would be using the very unit the regrid exists to
// stop using. Measured, it changes exactly one row and removes the only defect
// in the table: old notch 10 (1.300) sits 0.0007 of pace nearer to notch 18 than
// to 19, so absolute distance sends it to 18 where old 9 already is — two
// settings collapsed into one. In log terms 1.300 is +2.94 % from 18 and −2.86 %
// from 19, so it lands on 19, the map is INJECTIVE, and no player loses the
// distinction between the two fastest settings they could previously pick. The
// price is that the worst-case error over all ten notches goes from 2.89 % to
// 2.94 % — five hundredths of a percentage point, against a slider whose steps
// are 6 %.
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

function migSet(to, key, value, why) {
  const had = store.get(key, null);
  store.set(key, value);
  if (had === value) return;
  Log.info("game", `steer schema v${to}: ${key} ${had === null ? "(unset)" : had} -> ${value}${why ? " — " + why : ""}`);
}

const STEER_MIGRATIONS = [
  //
  // Changing the drivingHelp default from 6 to 1 only reached a FRESH install, so
  // every player who had ever opened the settings kept the old always-on assist —
  // the exact behaviour the rescale was meant to remove, still steering ~0.39 of
  // every corner for them.
  //
  // The slider's MEANING changed too (it used to bottom out at 0.25 and now
  // bottoms out at a true 0), so an old stored number does not carry over: 6 no
  // longer denotes what it denoted when it was written. That makes a reset the
  // honest migration rather than an attempt to rescale the number.
  //
  // raceLine is reset for the same reason. It is the other thing that steers the
  // car toward a line, its mechanism changed too (a positional shove on c.x
  // became a pure-pursuit steer angle), and the RELAX preset writes raceLine: 2 —
  // so every player who so much as tried RELAX has a 0.4 line-pull saved and
  // would keep it forever.
  //
  // Both grew with SPEED, which is why the old build felt like holding the gas
  // made the car adjust itself onto the line: ROAD_FOLLOW carries an
  // ASSIST_KUS*v^2 term (2.6x stronger at 80 m/s than at rest) and the old racing
  // line pull scaled by latFac = |speed|/18. Off by default now means off.
  { to: 2, apply() {
      migSet(2, "drivingHelp", 1, "assist OFF: the rescale gave the slider a true zero, so the old number no longer denotes what it did");
      migSet(2, "raceLine", 0, "no line pull by default: the mechanism changed with it");
  } },

  //
  // The notch numbers stopped meaning what they meant: 1..10 on a piecewise-linear
  // 0.50..1.30 grid became 1..19 on an even 6 %/notch geometric one. A stored 3
  // meant 0.750 and now means 0.527, so leaving it alone would hand a quarter of
  // the player's ground speed away without saying anything.
  //
  // A store with NO pace key is left alone on purpose: it has never been chosen,
  // so the new default (notch 11 = 0.840) applies through store.get() and there is
  // nothing to migrate. Writing 11 here would be indistinguishable on disk from a
  // deliberate choice and would pin that player to today's default forever.
  //
  // steerSmooth is deliberately NOT touched: SMOOTHING keeps its 1..10 notches and
  // only what each notch MEANS moved (Hz-linear -> lag-linear), with the default
  // preserved to a rounding error. A number that still denotes the same position
  // on the same slider needs no migration.
  { to: 3, apply() {
      const from = store.get("pace", null);
      if (from === null) return;                 // never chosen -> the new default stands
      const to = PACE_V2_TO_V3[from];
      if (to === undefined) return;              // outside the v2 grid: not ours to reinterpret
      const err = (paceFromSlider(to) / paceFromSliderV2(from) - 1) * 100;
      migSet(3, "pace", to,
        `RACE PACE regrid 1..10 -> 1..19: ${paceFromSliderV2(from).toFixed(3)} -> ${paceFromSlider(to).toFixed(3)} (${err >= 0 ? "+" : ""}${err.toFixed(2)} %)`);
      // A collision, named rather than swallowed — a clamp nobody can see is how
      // a player's settings get quietly changed. With log-nearest above there is
      // no such pair today and this never fires; it stays because the guard is
      // cheap and the next person to re-derive the grid may reintroduce one.
      const shared = Object.keys(PACE_V2_TO_V3).filter((o) => PACE_V2_TO_V3[o] === to);
      if (shared.length > 1) {
        Log.warn("game", `steer schema v3: old pace notches ${shared.join(" and ")} both land on ${to} — the top of the old grid was finer than the new even-6 % one, so those two settings are no longer distinguishable (this one moved ${err >= 0 ? "+" : ""}${err.toFixed(2)} %)`);
      }
  } },

  { to: 4, apply() {
      const from = store.get("adaptiveButtons", null);
      if (from === 0) migSet(4, "adaptiveButtons", 1, "OFF stays OFF on the 1..10 strength slider");
      else if (from === 1) migSet(4, "adaptiveButtons", 6, "old ON becomes mid strength");
  } },
];

function migrateSteerStore() {
  const from = store.get("steerSchema", 1);
  if (from >= STEER_SCHEMA) return;
  for (const step of STEER_MIGRATIONS) if (from < step.to) step.apply();
  store.set("steerSchema", STEER_SCHEMA);
}

function applySteerTuning() {
  migrateSteerStore();
  // Clamped on the way OUT of storage, not just on the way in from a slider —
  // wheelbaseFromSlider/lockFromSlider/speedRefFromSlider/etc. are plain linear
  // interpolations with no floor or ceiling of their own, and this function
  // feeds them straight into G.WHEELBASE/G.STEER_MAX_SLIP/G.PACE. A store value
  // outside a knob's range (an edited apex26.steerRate, a downgrade from a build
  // with a wider range) would EXTRAPOLATE rather than clamp — a steerRate of 50
  // computes a negative wheelbase, not an error. The ten oninput handlers below
  // are DOM-clamped by the range input's own min/max and never take this path;
  // this is the one that runs on every boot, reading whatever localStorage holds.
  const rate    = clamp(store.get("steerRate",  5), SLIDER_MIN, SLIDER_MAX);
  const expo    = clamp(store.get("steerExpo",  5), SLIDER_MIN, SLIDER_MAX);
  const smooth  = clamp(store.get("steerSmooth", 6), SLIDER_MIN, SLIDER_MAX);
  const tiltdeg = clamp(store.get("tiltDeg",    6), SLIDER_MIN, SLIDER_MAX);   // 6→32° for full lock (tuner optimum)
  const lock    = clamp(store.get("steerLock",  5), SLIDER_MIN, SLIDER_MAX);
  const spdsteer = clamp(store.get("steerSpeed", 5), SLIDER_MIN, SLIDER_MAX);
  const help    = clamp(store.get("drivingHelp", 1), SLIDER_MIN, SLIDER_MAX);   // default: assist OFF
  const pace    = clamp(store.get("pace", PACE_DEF), PACE_MIN, PACE_MAX);   // 11 -> 0.840 (14 is the 1.0 reference)
  const line    = clamp(store.get("raceLine",   0), LINE_MIN, LINE_MAX);
  const adapt   = clamp(store.get("adaptiveButtons", 6), SLIDER_MIN, SLIDER_MAX);
  G.PACE           = paceFromSlider(pace);
  G.WHEELBASE      = wheelbaseFromSlider(rate);
  G.STEER_EXPO     = expoFromSlider(expo);
  G.STEER_MAX_SLIP = lockFromSlider(lock);
  G.STEER_SPEED_REF = speedRefFromSlider(spdsteer);
  G.ROAD_FOLLOW    = helpFromSlider(help);
  Input.setTiltSmoothing(cutoffFromSmooth(smooth));
  Input.setTiltSensitivity(tiltDegFromRange(tiltdeg));
  Input.setAdaptiveButtons(adaptMixFromSlider(adapt));
  Input.setSteerSpeedRef(G.STEER_SPEED_REF);
  G.raceLineAssist = line / 5;
  const cue = clamp(store.get("brakeCue", 6), SLIDER_MIN, SLIDER_MAX);
  if (window.BrakeCue) BrakeCue.setLevel(cue);
  $("pm-rate").value    = rate;    $("pm-rate-v").textContent    = rate;
  $("pm-expo").value    = expo;    $("pm-expo-v").textContent    = expo;
  $("pm-smooth").value  = smooth;  $("pm-smooth-v").textContent  = smooth;
  $("pm-tiltdeg").value = tiltdeg; $("pm-tiltdeg-v").textContent = tiltdeg;
  $("pm-lock").value    = lock;    $("pm-lock-v").textContent    = lock;
  $("pm-speedsteer").value = spdsteer; $("pm-speedsteer-v").textContent = spdsteer;
  if ($("pm-adaptbtn")) { $("pm-adaptbtn").value = adapt; $("pm-adaptbtn-v").textContent = adaptLabel(adapt); }
  if ($("pm-brakecue")) { $("pm-brakecue").value = cue; $("pm-brakecue-v").textContent = (window.BrakeCue && BrakeCue.labelOf) ? BrakeCue.labelOf(cue) : (cue <= 1 ? "OFF" : "CUE " + cue); }
  $("pm-help").value    = help;    $("pm-help-v").textContent    = help;
  $("pm-pace").value    = pace;    $("pm-pace-v").textContent    = paceLabel(pace);
  $("pm-line").value    = line;    $("pm-line-v").textContent    = lineLabel(line);
  refreshPresetButtons();
  refreshMacros();
}
$("pm-rate").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("steerRate", v);
  G.WHEELBASE = wheelbaseFromSlider(v); $("pm-rate-v").textContent = v; clearPreset();
};
$("pm-expo").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("steerExpo", v);
  G.STEER_EXPO = expoFromSlider(v); $("pm-expo-v").textContent = v; clearPreset();
};
$("pm-smooth").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("steerSmooth", v);
  Input.setTiltSmoothing(cutoffFromSmooth(v)); $("pm-smooth-v").textContent = v; clearPreset();
};
$("pm-tiltdeg").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("tiltDeg", v);
  Input.setTiltSensitivity(tiltDegFromRange(v)); $("pm-tiltdeg-v").textContent = v; clearPreset();
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
if ($("pm-adaptbtn")) $("pm-adaptbtn").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("adaptiveButtons", v);
  Input.setAdaptiveButtons(adaptMixFromSlider(v));
  $("pm-adaptbtn-v").textContent = adaptLabel(v);
  clearPreset();   // preset-owned (PRESET_STORE) — the chip must stop claiming PRO
};
if ($("pm-brakecue")) $("pm-brakecue").oninput = (e) => {
  const v = clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX); store.set("brakeCue", v);
  if (window.BrakeCue) BrakeCue.setLevel(v);
  $("pm-brakecue-v").textContent = (window.BrakeCue && BrakeCue.labelOf) ? BrakeCue.labelOf(v) : (v <= 1 ? "OFF" : "CUE " + v);
  clearPreset();   // preset-owned (PRESET_STORE), same as every sibling slider
};
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
$("pm-preset-relax").onclick    = () => { applyPreset("relax");    if (G.soundOn) GameAudio.uiSelect(); };
$("pm-preset-standard").onclick = () => { applyPreset("standard"); if (G.soundOn) GameAudio.uiSelect(); };
$("pm-preset-pro").onclick      = () => { applyPreset("pro");      if (G.soundOn) GameAudio.uiSelect(); };

$("pm-tiltsimple").oninput = (e) => {
  store.set("tiltDeg", clamp(+e.target.value, SLIDER_MIN, SLIDER_MAX)); clearPreset(); applySteerTuning();
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
// vStd(v) = v * VMAX / vTop() = v / max(PACE, 0.05). Same identity, no
// game.js growth — adaptive digital rate must track the pace-5 scale the
// SPEED STEER reference is written on.
Input.setSpeedProvider(function () {
  const p = G.player;
  if (!p) return 0;
  return Math.abs(p.speed || 0) / Math.max(G.PACE || 1, 0.05);
});
$("adv-details").addEventListener("toggle", () => {
  if (G.soundOn) GameAudio.uiSelect();
});
// Any granular Advanced edit refreshes the simplified controls (events bubble up).
$("advanced-inner").addEventListener("input", refreshMacros);
applySteerTuning();
return { applySteerTuning };
}

return { create };
})();
