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
     - heave ← a base-excited spring in the RELATIVE coordinate z = body − ground
       (z'' = −ω²z − 2ωz' − yg''): the wheels track the ground exactly, the body
       lags through the (virtual) suspension. The ground's vertical velocity
       arrives ANALYTIC from the caller (speed × road slope) — groundY is never
       numerically differentiated, so frame-time jitter and the 4 m piecewise
       lerp of the height profile cannot alias into body bob. The per-frame
       forcing integral (−ΔygV) is applied as a velocity impulse and the spring
       advances through the same closed-form crit() as pitch/roll — stable at
       any dt. Steady slopes deflect nothing (constant ygV ⇒ zero impulse);
       output saturates on a tanh soft knee (no hard-clamp flat-topping).
       Reseeds instantly on a teleport (jump/reset) with zero transient.

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
const LAT_MAX     = PhysicsConsts.LAT_MAX;  // m/s² cornering grip — the model's own
                                       //   number (physics-consts loads first), so a
                                       //   retune can't desync the visual roll model
const HEAVE_OMEGA = 20;                // rad/s (≈3.2 Hz natural freq). Was 12 (≈1.9 Hz) —
                                       //   dead on the road ripple's 1.6-2.8 Hz band at
                                       //   racing speed (tracks.js undulate, 30-52 m short
                                       //   harmonic), so the body resonated against its own
                                       //   wheels and railed the clamp ("the car shakes").
const HEAVE_GAIN  = 0.55;              // gain on ground-velocity impulses. ζ=1 relative
                                       //   response is |H| = Ω²/(ω²+Ω²): Spa's worst ripple
                                       //   band now lands ~2 cm instead of demanding 9+ cm.
                                       //   Feel knob: 0.4 (calmer) .. 0.7 (livelier).
const HEAVE_AERO_FLOOR = 0.35;         // gain multiplier at FULL downforce. A real car
                                       //   gains load with v² and gets stiffer, so it
                                       //   should heave LESS at speed — this model did
                                       //   the opposite: replayed against the shipped
                                       //   road, Spa's peak grew 8.4x from 80 to 259 km/h
                                       //   (0.27 -> 2.26 cm) because the 30-52 m undulate
                                       //   harmonic climbs toward HEAVE_OMEGA's 3.2 Hz as
                                       //   speed rises. Scaling the forcing by downforce
                                       //   flattens that to 0.25 -> 0.85 cm and leaves the
                                       //   low-speed kerb/crest response alone (0.27 ->
                                       //   0.25 at 80 km/h). Feel knob: 0.5 (livelier at
                                       //   speed) .. 0.25 (calmer).
const HEAVE_MAX   = 0.05;              // ±5 cm ceiling — a tanh soft knee, not a hard rail
const TELEPORT_DY = 1.5;               // m ground jump that means "teleport, reseed"
const MAX_DT      = 0.05;              // ONE dt clamp, matching render()'s Math.min(dt, 1/20)
                                       //   — the old 0.033 disagreed with the caller and
                                       //   inflated dt-sensitive terms 1.5× on slow frames

const ZERO = Object.freeze({ pitch: 0, roll: 0, heave: 0 });
const clamp = M4.clamp;                       // shared scalar helper (js/mat4.js)

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
  c._ba = { p: { x: 0, v: 0 }, r: { x: 0, v: 0 }, z: { x: 0, v: 0 }, ygV0: 0, prevYg: null };
  c.baPitch = 0; c.baRoll = 0; c.baHeave = 0;
  return c._ba;
}

// Advance the springs for car `c` this frame and stash the offsets on it.
// groundY = the road-surface world-Y the render loop already placed the car at.
// ygV = the ground's vertical velocity under the car, ANALYTIC (speed × road
// slope) — never a finite difference of groundY (see the heave note above).
// Returns { pitch, roll, heave } (also mirrored to c.baPitch/baRoll/baHeave).
// The returned object is a reused module scratch — read it immediately, don't
// retain it (offsets() builds a fresh object for the debug hooks).
const _out = { pitch: 0, roll: 0, heave: 0 };
function update(c, groundY, dt, ygV, dfFrac) {
  if (!c) return ZERO;
  const s = c._ba || seed(c);
  ygV = ygV || 0;
  if (!enabled) {
    s.p.x = s.p.v = s.r.x = s.r.v = s.z.x = s.z.v = 0;
    s.ygV0 = ygV; s.prevYg = groundY;
    c.baPitch = 0; c.baRoll = 0; c.baHeave = 0;
    return ZERO;
  }
  dt = Math.max(0, Math.min(dt || 0, MAX_DT));

  // pitch ← longitudinal accel. axEstSm<0 under braking → nose-up cue (+),
  // axEstSm>0 under throttle → squat (−): the pre-existing sign convention.
  const pitchT = clamp(-(c.axEstSm || 0) * PITCH_GAIN, -PITCH_MAX, PITCH_MAX);
  crit(s.p, pitchT, PITCH_OMEGA, dt);

  // roll ← lateral accel. HUMAN cars: real centripetal speed·yawRate (only they
  // run the slip model that produces yawRateCur). AI has no world heading, so
  // use curvature·speed² (negated to lean OUTWARD like a human car — curvature
  // sign is opposite the yaw-rate sign).
  const aLat = c.human ? (c.speed || 0) * (c.yawRateCur || 0)
                          : -(c.speed || 0) * (c.speed || 0) * (c.kCur || 0);
  const rollT = clamp(aLat / LAT_MAX, -1, 1) * ROLL_MAX;
  crit(s.r, rollT, ROLL_OMEGA, dt);

  // heave ← the base-excited spring in the RELATIVE coordinate z = body − ground:
  // z'' = −ω²z − 2ωz' − yg''. The forcing integral over a frame is exactly −ΔygV,
  // applied as a velocity impulse; the homogeneous part then advances through the
  // same closed-form crit() as pitch/roll — unconditionally stable at any dt.
  // A teleport reseeds both z and ygV0 so jump()/reset() fire no transient.
  if (s.prevYg == null || Math.abs(groundY - s.prevYg) > TELEPORT_DY) {
    s.z.x = 0; s.z.v = 0; s.ygV0 = ygV;
  }
  // Downforce stiffens the (virtual) suspension: the caller passes the same
  // dimensionless load term the grip model uses, aeroDfMult(c)·(|v|/vTop())²,
  // so PACE and the flap state stay owned by game.js and no speed literal
  // reaches this module (tools/vstd-lint.mjs). Null/absent ⇒ unscaled, which
  // is the pre-existing behaviour for any caller that has not been updated.
  const df = dfFrac > 0 ? (dfFrac < 1 ? dfFrac : 1) : 0;
  s.z.v -= (ygV - s.ygV0) * HEAVE_GAIN * (1 - (1 - HEAVE_AERO_FLOOR) * df);
  s.ygV0 = ygV;
  crit(s.z, 0, HEAVE_OMEGA, dt);
  s.prevYg = groundY;
  // soft saturation: approaches ±HEAVE_MAX asymptotically instead of flat-topping
  const heave = HEAVE_MAX * Math.tanh(s.z.x / HEAVE_MAX);

  c.baPitch = s.p.x; c.baRoll = s.r.x; c.baHeave = heave;
  _out.pitch = s.p.x; _out.roll = s.r.x; _out.heave = heave;
  return _out;
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
  Log.info("game", "BodyAttitude.create");
  G = ctx;
  try { enabled = localStorage.getItem(LS_KEY) !== "0"; } catch (e) { enabled = true; }
  return { update, reset, offsets, setEnabled, active, status };
}

return { create, update, reset, offsets, setEnabled, active, status };
})();
