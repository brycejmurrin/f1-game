/* Apex 26 — C2 visual suspension: cosmetic body attitude (pitch / roll / heave). Makes the chassis look ALIVE — it pitches forward under braking, squats under acc… */
const BodyAttitude = (function () {
  "use strict";

let G = null;                          // game.js ctx façade (live getters: cars, player)
const LS_KEY = "apex26.bodyAttitude";
let enabled = true;                    // resolved from localStorage in create()

// tunables (stiff-suspension feel: small travel, fast settle)
const PITCH_OMEGA = 9;                 // rad/s spring rate — brake dive / squat
const PITCH_GAIN  = 0.00095;           // rad per (m/s²) of longitudinal accel
const PITCH_MAX   = 0.024;             // ≈1.4° cap
const ROLL_OMEGA  = 7;                 // rad/s spring rate — cornering lean
const ROLL_MAX    = 0.055;             // ≈3.1° cap at full lateral grip
const ROLL_LIM    = 0.075;             // ≈4.3° — the lean PLUS a kerb strike's kick, never more
const LAT_MAX     = PhysicsConsts.LAT_MAX;  // m/s² cornering grip — the model's own
const HEAVE_OMEGA = 20;                // rad/s (≈3.2 Hz natural freq). Was 12 (≈1.9 Hz) —
const HEAVE_GAIN  = 0.55;              // gain on ground-velocity impulses. ζ=1 relative
const HEAVE_AERO_FLOOR = 0.35;         // gain multiplier at FULL downforce. A real car
const HEAVE_MAX   = 0.05;              // ±5 cm ceiling — a tanh soft knee, not a hard rail
const TELEPORT_DY = 1.5;               // m ground jump that means "teleport, reseed"
const MAX_DT      = 0.05;              // ONE dt clamp, matching render()'s Math.min(dt, 1/20)

// PITCH SIGN: c.baPitch > 0 is a DIVE (nose down) — braking, since game.js's
// axEstSm is negative under braking. js/camera/vantage.js reads it that way
// ("baPitch > 0 = nose-down = braking"), and since 2026-10-02 game.js's body
// rotation does too (it rotated +pitch nose-UP, so every car lifted its nose
// on the brakes while the chase camera dollied in for a dive).
//
// RIDE HEIGHT AT SPEED. The aero load sits the car down on its springs: the
// body is AERO_DROP lower and AERO_RAKE nose-down at full load. Driven by the
// same dimensionless load term (dfFrac) that stiffens heave, so it grows with
// v² and falls away with the flaps open — no speed literal reaches here.
const AERO_DROP   = 0.012;             // m lower at full downforce load (a real car: 15-25 mm)
const AERO_RAKE   = 0.003;             // rad nose-down at full load (floor nose ~4 mm down, tail ~6 mm up)

// THE PLANK. The floor's underside in car-local metres (Car3D CHASSIS.floor:
// cy 0.07, sy 0.06 → 0.04 m off the road, z −1.9 … 1.3; the pivot is the
// contact plane at z 0). The plank — a ~10 mm board with titanium skid blocks
// that the mesh does not draw — hangs under it, so its blocks reach the road
// with the FLOOR still PLANK_TOUCH up. Dive, heave and the aero drop all lower
// the floor; at PLANK_STOP the plank bottoms out and CARRIES the body (the stop
// lifts the heave), so the floor never sinks through the tarmac. How far past
// PLANK_TOUCH it was pushed is published as c.baScrape (0..1) — the spark
// emitter's input (js/fx/car-fx.js). Measured in the game VM (scratch probe,
// AI field, Spa): floor clearance under 14 mm on ~1 % of car-frames — the
// first metres of a braking zone from top speed and the deepest compressions.
const PLANK_Y = 0.04, PLANK_FRONT_Z = 1.3, PLANK_REAR_Z = 1.9;
const PLANK_STOP  = 0.008;             // m of floor clearance where the plank bottoms out
const PLANK_TOUCH = 0.014;             // m of floor clearance where the blocks start to rub (scrape 0)
const PLANK_RANGE = 0.02;              // m further to a full scrape (1)

// KERB STRIKES. c.onKerb is a floor-indexed node lookup that flickers at the
// ~4 m node rate when a car straddles the kerb line (game.js's kerb cue note),
// so it is held for KERB_HOLD_M of travel: one strike on, one drop off, never
// a re-arm per node. A strike kicks the heave spring UP and the roll spring
// kerb-side up (+roll lifts the RIGHT side, +x is right), both scaled by the
// speed fraction; leaving drops it back by KERB_OFF of that. Riding the kerb
// adds a SHIVER, a per-ridge jitter keyed on the metres ridden (deterministic,
// no clock). The shiver goes on the returned body offsets only — c.baHeave /
// c.baRoll stay smooth, because js/camera/vantage.js reads them and runs its
// own spatial kerb rib (and drops it under REDUCE MOTION).
const KERB_HOLD_M = 6;                 // m of travel the kerb state outlives the flag (> one 4 m node)
const KERB_HEAVE_V = 1.2;              // m/s body kick at full speed: peak ≈ v/(ω·e) ≈ 2.2 cm at ω 20
const KERB_ROLL_V = 0.6;               // rad/s at full speed: peak ≈ 0.6/(7e) ≈ 0.032 rad ≈ 1.8°
const KERB_OFF = 0.45;                 // the drop off the kerb, as a share of the strike, the other way
const KERB_RIDGE_M = 0.35;             // m per shiver sample (a new jitter every ridge ridden)
const KERB_SHIVER_H = 0.004;           // m of heave jitter at full speed
const KERB_SHIVER_R = 0.004;           // rad of roll jitter at full speed

const ZERO = Object.freeze({ pitch: 0, roll: 0, heave: 0 });
const clamp = M4.clamp;                       // shared scalar helper (js/core/mat4.js)

function crit(s, to, omega, dt) {
  const c1 = s.x - to;
  const c2 = s.v + omega * c1;
  const e = Math.exp(-omega * dt);
  const t = c1 + c2 * dt;
  s.x = to + t * e;
  s.v = (c2 - omega * t) * e;
}

// Hash noise in [-1, 1] for the kerb shiver: a pure function of the ridge index.
function ridge(i) {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return 2 * (h - Math.floor(h)) - 1;
}

function seed(c) {
  c._ba = { p: { x: 0, v: 0 }, r: { x: 0, v: 0 }, z: { x: 0, v: 0 }, ygV0: 0, prevYg: null, kerbM: 0, sh: 0 };
  c.baPitch = 0; c.baRoll = 0; c.baHeave = 0; c.baScrape = 0;
  return c._ba;
}

// Advance the springs for car `c` this frame and stash the offsets on it.
// groundY = the road-surface world-Y the render loop already placed the car at.
// ygV = the ground's vertical velocity under the car, ANALYTIC (speed × road
// slope) — never a finite difference of groundY (see the heave note above).
// dfFrac = the downforce load term (stiffens heave, sits the car down); vFrac =
// |speed| / vTop(), 0..1 (scales the kerb strikes; absent ⇒ 0, no strikes).
// Returns { pitch, roll, heave } (also mirrored to c.baPitch/baRoll/baHeave, less
// the kerb shiver — see KERB STRIKES). The returned object is a reused module
// scratch — read it immediately, don't retain it (offsets() builds a fresh
// object for the debug hooks).
const _out = { pitch: 0, roll: 0, heave: 0 };
function update(c, groundY, dt, ygV, dfFrac, vFrac) {
  if (!c) return ZERO;
  const s = c._ba || seed(c);
  const ygVSafe = ygV || 0;
  if (!enabled) {
    s.p.x = s.p.v = s.r.x = s.r.v = s.z.x = s.z.v = 0;
    s.ygV0 = ygVSafe; s.prevYg = groundY; s.kerbM = 0;
    c.baPitch = 0; c.baRoll = 0; c.baHeave = 0; c.baScrape = 0;
    return ZERO;
  }
  const dtc = Math.max(0, Math.min(dt || 0, MAX_DT));
  const vF = vFrac > 0 ? (vFrac < 1 ? vFrac : 1) : 0;
  const spd = Math.abs(c.speed || 0);

  if (s.prevYg == null || Math.abs(groundY - s.prevYg) > TELEPORT_DY) {
    s.z.x = 0; s.z.v = 0; s.ygV0 = ygVSafe;
    s.kerbM = c.onKerb ? KERB_HOLD_M : 0;          // placed ON a kerb is not a strike
  }
  // Kerb strike / drop-off: an impulse on the heave and roll springs (above).
  const wasOn = s.kerbM > 0;
  if (c.onKerb) s.kerbM = KERB_HOLD_M;
  else if (wasOn) s.kerbM = Math.max(0, s.kerbM - spd * dtc);
  const onKerb = s.kerbM > 0;
  if (onKerb !== wasOn && vF > 0) {
    const kick = (onKerb ? 1 : -KERB_OFF) * vF;
    s.z.v += KERB_HEAVE_V * kick;
    s.r.v += KERB_ROLL_V * kick * ((c.x || 0) < 0 ? -1 : 1);
  }

  // pitch ← longitudinal accel (PITCH SIGN above: braking, ax < 0, dives +).
  // AI cars carry no axEstSm (the player's friction-ellipse estimate) and so
  // never dived; corridorAccel is every car's signed observed accel (game.js,
  // updateCar), so since 2026-10-02 the field dives into braking zones too.
  const ax = c.human ? (c.axEstSm || 0) : (c.corridorAccel || 0);
  const pitchT = clamp(-ax * PITCH_GAIN, -PITCH_MAX, PITCH_MAX);
  crit(s.p, pitchT, PITCH_OMEGA, dtc);

  // roll ← lateral accel. HUMAN cars: real centripetal speed·yawRate (only they
  // run the slip model that produces yawRateCur). AI has no world heading, so
  // use curvature·speed² (negated to lean OUTWARD like a human car — curvature
  // sign is opposite the yaw-rate sign).
  const aLat = c.human ? (c.speed || 0) * (c.yawRateCur || 0)
                          : -(c.speed || 0) * (c.speed || 0) * (c.kCur || 0);
  const rollT = clamp(aLat / LAT_MAX, -1, 1) * ROLL_MAX;
  crit(s.r, rollT, ROLL_OMEGA, dtc);

  // Downforce stiffens the (virtual) suspension: the caller passes the same
  // dimensionless load term the grip model uses, aeroDfMult(c)·(|v|/vTop())²,
  // so PACE and the flap state stay owned by game.js and no speed literal
  // reaches this module (tools/check/vstd-lint.mjs). Null/absent ⇒ unscaled, which
  // is the pre-existing behaviour for any caller that has not been updated.
  const df = dfFrac > 0 ? (dfFrac < 1 ? dfFrac : 1) : 0;
  s.z.v -= (ygVSafe - s.ygV0) * HEAVE_GAIN * (1 - (1 - HEAVE_AERO_FLOOR) * df);
  s.ygV0 = ygVSafe;
  crit(s.z, 0, HEAVE_OMEGA, dtc);
  s.prevYg = groundY;
  // soft saturation: approaches ±HEAVE_MAX asymptotically instead of flat-topping
  let heave = HEAVE_MAX * Math.tanh(s.z.x / HEAVE_MAX) - AERO_DROP * df;
  const pitch = clamp(s.p.x + AERO_RAKE * df, -PITCH_MAX, PITCH_MAX);
  const roll = clamp(s.r.x, -ROLL_LIM, ROLL_LIM);

  // The plank: lowest point of the floor (front on a dive, tail on a squat).
  const clear = PLANK_Y + heave + Math.min(-PLANK_FRONT_Z * pitch, PLANK_REAR_Z * pitch);
  const scrape = clamp((PLANK_TOUCH - clear) / PLANK_RANGE, 0, 1);
  if (clear < PLANK_STOP) heave += PLANK_STOP - clear;

  let shH = 0, shR = 0;
  if (onKerb && vF > 0) {
    s.sh = (s.sh + spd * dtc) % 1e4;               // metres ridden; wrapped, the hash does not care
    const i = Math.floor(s.sh / KERB_RIDGE_M);
    shH = KERB_SHIVER_H * vF * ridge(i);
    shR = KERB_SHIVER_R * vF * ridge(i + 7919);
  }

  c.baPitch = pitch; c.baRoll = roll; c.baHeave = heave; c.baScrape = scrape;
  _out.pitch = pitch; _out.roll = roll + shR; _out.heave = heave + shH;
  return _out;
}

function reset(c) {
  if (c) { seed(c); return; }
  const cars = (G && G.cars) || [];
  for (const cc of cars) seed(cc);
}

function offsets(c) {
  c = c || (G && G.player);
  if (!c) return { pitch: 0, roll: 0, heave: 0, enabled };
  return { pitch: c.baPitch || 0, roll: c.baRoll || 0, heave: c.baHeave || 0, scrape: c.baScrape || 0, enabled };
}

function setEnabled(v) {
  enabled = !!v;
  GameStore.store.rawSet(LS_KEY, enabled ? "1" : "0");
  if (!enabled) reset();               // settle everything to rigid immediately
  return status();
}

function active() { return enabled; }
function status() { return { enabled, offsets: offsets() }; }

function create(ctx) {
  Log.info("game", "BodyAttitude.create");
  G = ctx;
  enabled = GameStore.store.raw(LS_KEY) !== "0";   // raw() is null when storage is blocked: enabled
  return { update, reset, offsets, setEnabled, active, status };
}

return { create, update, reset, offsets, setEnabled, active, status };
})();
Object.freeze(BodyAttitude);
