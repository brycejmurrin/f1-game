/* Apex 26 — C2 visual suspension: cosmetic body attitude (pitch / roll / heave).

   Makes the chassis look ALIVE — it pitches forward under braking, squats under
   acceleration, rolls into corners, and bobs over crests/kerbs — WITHOUT ever
   touching the driving model. Every value produced here is a small, clamped
   RENDER offset applied to the car BODY mesh transform only; the grounded basis
   (_groundMat) that carries the wheels, contact patch and shadow is untouched,
   so the tyres never leave the road.

   Contract with the bespoke physics (sacred, do not renegotiate here):
     - render-only: nothing in this module writes to any car's px/pz/head, to
       (s, x), speed, or any physics authority. It READS existing per-frame
       state (axEstSm, speed, yawRateCur, kCur) plus the road-surface height the
       render loop already computed, and writes back only c.baPitch/baRoll/baHeave.
     - deterministic: no Date.now / Math.random anywhere. Identical per-frame
       state + dt → identical offsets, so replays and time-trial ghosts (which
       replay the physics, not these cosmetics) are bitwise unaffected.
     - default ON: disable with localStorage apex26.bodyAttitude = "0" or
       __apex.bodyAttitude(false); when off, all three offsets are forced to 0
       (a rigid chassis) and the springs idle.

   Spring model (per car, state stashed on c._ba):
     - pitch ← longitudinal accel (axEstSm). Braking (axEstSm<0) lifts the tail
       cue; throttle squats it — the SAME sign the ad-hoc pitchVis used before.
       Critically-damped analytic step (unconditionally stable), stiff + subtle.
     - roll  ← lateral accel. Player uses real centripetal accel speed·yawRate;
       AI (no world heading) uses -speed²·curvature. Critically-damped analytic.
     - heave ← road-surface height under the car. A base-excited spring-mass:
       the wheels track the ground exactly, the body lags through the (virtual)
       suspension, so only vertical ACCELERATION (crests, dips, kerb edges) makes
       a lasting deflection — steady slopes produce none, so the body never sinks
       into a long climb. Reseeds instantly on a teleport (jump/reset).

   Created with the G ctx façade from game.js (BodyAttitude.create(G));
   must load BEFORE js/game.js (see index.html / tools/manifest.cjs). */
const BodyAttitude = (function () {
  "use strict";

let G = null;                          // game.js ctx façade (live getters: cars, player)
const LS_KEY = "apex26.bodyAttitude";
let enabled = true;                    // resolved from localStorage in create()

// ── tunables (stiff-suspension feel: small travel, fast settle) ──────────────
const PITCH_OMEGA = 9;                 // rad/s spring rate — brake dive / squat
const PITCH_GAIN  = 0.00095;           // rad per (m/s²) of longitudinal accel
const PITCH_MAX   = 0.024;             // ≈1.4° cap
const ROLL_OMEGA  = 7;                 // rad/s spring rate — cornering lean
const ROLL_MAX    = 0.055;             // ≈3.1° cap at full lateral grip
const LAT_MAX     = 22;                // m/s² cornering grip (mirrors game.js)
const HEAVE_OMEGA = 12;                // rad/s — stiff vertical bob
const HEAVE_MAX   = 0.05;              // ±5 cm cap
const TELEPORT_DY = 1.5;               // m ground jump that means "teleport, reseed"
const MAX_DT      = 0.033;             // clamp dt so a stalled frame can't blow up

const ZERO = Object.freeze({ pitch: 0, roll: 0, heave: 0 });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Critically-damped (ζ=1) analytic step toward `to`. Exact closed form of
// x'' = -ω²(x-to) - 2ω x'  — unconditionally stable at any dt. Math.exp is
// deterministic (no Date/random), so replays stay identical.
function crit(s, to, omega, dt) {
  const c1 = s.x - to;
  const c2 = s.v + omega * c1;
  const e = Math.exp(-omega * dt);
  const t = c1 + c2 * dt;
  s.x = to + t * e;
  s.v = (c2 - omega * t) * e;
}

function seed(c) {
  c._ba = { p: { x: 0, v: 0 }, r: { x: 0, v: 0 }, yb: 0, ybV: 0, prevYg: null };
  c.baPitch = 0; c.baRoll = 0; c.baHeave = 0;
  return c._ba;
}

// Advance the springs for car `c` this frame and stash the offsets on it.
// groundY = the road-surface world-Y the render loop already placed the car at.
// Returns { pitch, roll, heave } (also mirrored to c.baPitch/baRoll/baHeave).
function update(c, groundY, dt) {
  if (!c) return ZERO;
  const s = c._ba || seed(c);
  if (!enabled) {
    s.p.x = s.p.v = s.r.x = s.r.v = s.ybV = 0;
    s.yb = groundY; s.prevYg = groundY;
    c.baPitch = 0; c.baRoll = 0; c.baHeave = 0;
    return ZERO;
  }
  dt = Math.max(0, Math.min(dt || 0, MAX_DT));

  // pitch ← longitudinal accel. axEstSm<0 under braking → nose-up cue (+),
  // axEstSm>0 under throttle → squat (−): the pre-existing sign convention.
  const pitchT = clamp(-(c.axEstSm || 0) * PITCH_GAIN, -PITCH_MAX, PITCH_MAX);
  crit(s.p, pitchT, PITCH_OMEGA, dt);

  // roll ← lateral accel. Player: real centripetal speed·yawRate. AI has no
  // world heading, so use curvature·speed² (negated to lean OUTWARD like the
  // player — curvature sign is opposite the yaw-rate sign).
  const aLat = c.isPlayer ? (c.speed || 0) * (c.yawRateCur || 0)
                          : -(c.speed || 0) * (c.speed || 0) * (c.kCur || 0);
  const rollT = clamp(aLat / LAT_MAX, -1, 1) * ROLL_MAX;
  crit(s.r, rollT, ROLL_OMEGA, dt);

  // heave ← base-excited spring over the ground height. Reseed on a teleport so
  // jump()/reset() don't fire a huge transient.
  if (s.prevYg == null || Math.abs(groundY - s.prevYg) > TELEPORT_DY) {
    s.yb = groundY; s.ybV = 0; s.prevYg = groundY;
  }
  const ygV = dt > 0 ? (groundY - s.prevYg) / dt : 0;      // ground vertical velocity
  const acc = -HEAVE_OMEGA * HEAVE_OMEGA * (s.yb - groundY) - 2 * HEAVE_OMEGA * (s.ybV - ygV);
  s.ybV += acc * dt;
  s.yb  += s.ybV * dt;
  s.prevYg = groundY;
  const heave = clamp(s.yb - groundY, -HEAVE_MAX, HEAVE_MAX);

  c.baPitch = s.p.x; c.baRoll = s.r.x; c.baHeave = heave;
  return c._ba && { pitch: c.baPitch, roll: c.baRoll, heave: c.baHeave };
}

// Clear spring state. reset(c) for one car; reset() for the whole field — call
// from __apex.reset so a fresh episode starts from a settled chassis.
function reset(c) {
  if (c) { seed(c); return; }
  const cars = (G && G.cars) || [];
  for (const cc of cars) seed(cc);
}

function offsets(c) {
  c = c || (G && G.player);
  if (!c) return { pitch: 0, roll: 0, heave: 0, enabled };
  return { pitch: c.baPitch || 0, roll: c.baRoll || 0, heave: c.baHeave || 0, enabled };
}

function setEnabled(v) {
  enabled = !!v;
  try { localStorage.setItem(LS_KEY, enabled ? "1" : "0"); } catch (e) {}
  if (!enabled) reset();               // settle everything to rigid immediately
  return status();
}

function active() { return enabled; }
function status() { return { enabled, offsets: offsets() }; }

function create(ctx) {
  G = ctx;
  try { enabled = localStorage.getItem(LS_KEY) !== "0"; } catch (e) { enabled = true; }
  return { update, reset, offsets, setEnabled, active, status };
}

return { create, update, reset, offsets, setEnabled, active, status };
})();
