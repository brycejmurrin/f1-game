"use strict";
// PhysicsConsts — the driving model's immutable numbers, moved out of
// js/game.js with the rationale that tunes them. Values only: everything a
// pause-menu slider or the setPhysics harness can change stays a `let` in
// game.js, and every function that reads these stays with the model it
// belongs to. game.js destructures this object once at the top of its
// physics block, so load order matters (a HARD_EDGES entry in
// tools/manifest.cjs).
window.PhysicsConsts = {
  VMAX: 72,            // m/s base (~259 km/h) — F1 race pace; scales all speeds
                       //   (PACE and the vTop()/vStd() normalisers live in game.js)
  ACCEL: 7,            // m/s^2 at low speed
  BRAKE: 22,
  REVERSE_MAX: -5,     // m/s — top reverse crawl speed (brake held at a stop)
  REVERSE_ACCEL: 5,    // m/s^2 — how quickly the reverse crawl builds
  COAST_DRAG: 6,       // m/s^2 deceleration when off the throttle
  GRAVITY_SLOPE: 9,    // m/s^2 along-slope pull on elevation (~g, arcade-tuned)
  LAT_MAX: 22,         // m/s^2 cornering grip
  STEER_VMAX: 15,      // lateral m/s at full lock, full speed (AI)

  FRONT_WEIGHT: 0.47,  // static front-axle load fraction (F1 is rear-biased)
  CS_FRONT: 130,       // front cornering stiffness (accel per rad of slip)
  CS_REAR: 175,       // rear stiffer than front → understeer in the linear range too
  WT_LONG: 0.22,       // longitudinal load transfer (braking loads the front axle)

  // AERODYNAMIC DOWNFORCE. Grip used to FALL with speed (gripScale: 1.00 at 10 m/s
  // down to 0.72 at VMAX) — an arcade understeer taper, and backwards for a car
  // with wings. Aero load rises with v², so a real F1 car pulls roughly 2 g in a
  // slow corner and 5 g in a fast one; this model did the opposite, which is why
  // quick corners felt vague and slow ones felt sharp. Lateral grip is now
  // 1 + DOWNFORCE·(v/VMAX)², so high-speed cornering firms up the way it should.
  DOWNFORCE: 0.65,     // extra grip fraction at VMAX (0 = no wings)

  // ACTIVE AERO — the 2026 X-mode / Z-mode rules, and the THIRD member of the
  // straight-line toolkit alongside BOOST (spend battery) and OVERTAKE (a free
  // proximity-gated push). It is not a fourth kind of boost: it spends no energy
  // and adds no thrust. It TRADES downforce for drag.
  //   Z-mode (aeroX 0, the default) — flaps closed, full downforce, full drag.
  //   X-mode (aeroX 1)              — flaps open, low drag, MUCH less downforce.
  // The blend `c.aeroX` is what every consumer reads (top speed, coast drag,
  // lateral grip, the rear-wing flap angle the renderer draws).
  //
  // The FIA approves fixed ACTIVATION ZONES per circuit and the standard ECU
  // refuses to rotate the wings outside one — it is not a proximity window like
  // DRS, and it is not a rolling "is the road ahead clear" test either. A zone
  // only exists where a straight exceeds three seconds at racing speed, which is
  // why MONACO has none and runs no active aero at all. See js/game/aerozones.js.
  // Leaving the zone (or touching the brake) SLAMS the flap shut — X_CLOSE_RATE is deliberately several times
  // X_OPEN_RATE, so the downforce comes back faster than it left. Both directions
  // sit inside the FIA's 400 ms transition cap.
  // THE TRADE SCALES WITH THE WING, because that is the only way it can mean
  // anything. A single pair of constants gave a Monza-spec sliver and a
  // maximum-downforce floor exactly the same +7.5%/-55%, which is backwards: a
  // big wing has more drag to shed AND more downforce to lose, a small one has
  // neither. So the aero PART now picks where on each span the car sits, via
  // Parts.aeroLoad() (0 = `minimal`, 1 = `ground_effect`).
  //
  // It also matters MORE than it did. The old numbers made X-mode a rounding
  // error you could ignore for a whole race; at the top of the range it is now
  // worth ~+15.5% of top speed and costs ~78% of the aero load, which is a real
  // decision on every zone rather than a free press.
  //
  // A car with no parts (every AI) sits at the MIDPOINT of each span, so the
  // grid's behaviour stays a single well-defined thing rather than inheriting
  // whatever the catalog default happens to be this month.
  X_VMAX_GAIN_LO: 0.055,  // top-speed gain at full X-mode, smallest wing
  X_VMAX_GAIN_HI: 0.155,  // ...and the biggest (more drag to shed)
  X_DF_LOSS_LO: 0.42,     // fraction of the DOWNFORCE term given up, smallest wing
  X_DF_LOSS_HI: 0.78,     // ...and the biggest (more downforce to lose)
  X_COAST_CUT_LO: 0.28,   // fraction of COAST_DRAG shed while coasting, smallest wing
  X_COAST_CUT_HI: 0.55,   // ...and the biggest

  // The FIA caps the transition between the two wing positions at 400 ms, so the
  // OPENING rate is set by that regulation, not by feel: 2.6/s = 385 ms of travel.
  // Closing is deliberately faster (still inside the cap) — see X_CLOSE_RATE.
  X_OPEN_RATE: 2.6,    // aeroX per second opening (~0.385 s, inside the 400 ms cap)
  X_CLOSE_RATE: 8.0,   // aeroX per second closing (~0.125 s back to Z — well inside the cap)
  // (X_STRAIGHT_T and X_ZONE_K used to sit here. They belong to the zone SCAN, so
  // they live in js/game/aerozones.js now — along with the X_K_MAX / X_LOOK_MAX
  // story, which is about the rolling look-ahead the zone scan replaced.)
  X_MIN_SPEED: 25,     // m/s (a vStd() threshold) — no X-mode at crawl speed
  // Overtake's own crawl floor, and a vStd() threshold for exactly the same
  // reason X_MIN_SPEED is one. Named rather than inline so the next reader can
  // see it is the sibling of the constant above and is measured on the same scale.
  OT_MIN_SPEED: 15,    // m/s (a vStd() threshold) — no overtake at crawl speed
  // Lateral grip OFF the racing surface. muBase had no off-track term at all, so
  // grass and gravel cornered exactly like tarmac and only scrubbed forward speed —
  // you could take a run-off at full lateral grip. Faded in over the first ~1.5 m
  // past the edge so the transition is continuous, not a step.
  OFF_GRIP: 0.42,      // fraction of tarmac lateral grip on grass/gravel

  ASSIST_KUS: 0.0008,  // s²/m — speed² term in the DRIVING-HELP steer assist so
                              // it keeps tracking the road as speed rises. Kept modest:
                              // the grippy car understeers little, so a large term would
                              // OVER-steer and cut the car to the inside of the corner.

  // Gain on the RACING LINE assist's pure-pursuit steer term (see the assist block
  // in updateCar). 1 = textbook pursuit — reach the line in exactly one look-ahead
  // distance; a little over that so the slider's top notch has real authority
  // without the assist ever outrunning the front tyre.
  LINE_PURSUIT: 2.6,

  // Combined-slip friction ellipse: grip used braking/accelerating is taken out of
  // the cornering budget. LONG_GRIP is the longitudinal axis of the ellipse (m/s²),
  // set a little above BRAKE (22) so straight-line braking keeps most grip, but
  // braking hard WHILE turning washes the front wide; easing off the brake as you
  // turn in (trail-braking) hands grip back to cornering. Higher = more forgiving.
  LONG_GRIP: 34,

  // Visual animation (render-only, never touches physics): the chassis leans into
  // corners (roll ∝ lateral g) and pitches to the road gradient, and the wheels
  // spin with speed + steer with input — all on a smoothed visual layer, the way
  // SuperTuxKart keeps a rigid physics body and animates only the model.
  // (chassis cornering-lean cap now lives in js/game/bodyattitude.js as ROLL_MAX)
  WHEEL_R: 0.34,         // wheel radius (m) — matches Car3D geometry, for spin rate
  WHEEL_STEER_VIS: 0.5,  // rad of visible front-wheel steer at full lock

  GRASS_V: 18,         // crawl speed on grass
  KERB_SHAKE: 0.22,    // sustained kerb rumble trauma (was inline 0.3): amt =
                              //   shake²·0.9 drops 0.081 → 0.044 m of random eye jitter;
                              //   crash-shake writers are untouched.
  KERB_CUE_HOLD: 0.10, // s — bridges the ~20 Hz per-node flicker of the raw
                              //   onKerb flag (~2 node periods at 300 km/h) so the
                              //   rumble/shake/haptic cue can't machine-gun on/off.

  DEPLOY_A: 3.0,       // extra accel from electric deploy
  TAPER_LO: 41, TAPER_HI: 53,  // deploy tapers to 0 across this speed band
                                       //   (a vStd() band — pace-normalised, so the
                                       //   taper sits at the same place on the dial)

  TAPER_FLOOR: 0.35,   // deploy never tapers below this — see deployTaper() in game.js

  // THE ERS PART RUNS THE BATTERY, which until now it did not. The category's
  // options have always DESCRIBED battery behaviour — "harvests extra energy under
  // braking", "maximum recovery window", "immediate deployment" — while doing
  // nothing but move speed and accel like every other part, so the descriptions
  // were simply false. Parts.ersProfile() reads the bias the catalog already
  // encodes in each option's own stats (deploy <- accel, regen <- speed) and hands
  // back two 0..1 axes; deriving them rather than authoring new fields means the
  // SIGNATURE clones, which copy those stats, stay consistent for free.
  //
  // deploy buys BOOST DURATION (a lower drain) and a longer, sooner OVERTAKE.
  // regen buys RECHARGE. A car with no parts — every AI — sits at the midpoint.
  DRAIN_LO: 0.14, DRAIN_HI: 0.26,    // energy/s while boosting: best -> worst deploy
  REGEN_LO: 0.085, REGEN_HI: 0.155,  // energy/s recovered: worst -> best regen
  OT_TIME_LO: 3.2, OT_TIME_HI: 5.2,  // overtake push, seconds
  OT_COOL_LO: 9, OT_COOL_HI: 14,     // ...and its lockout, best -> worst deploy
  OT_GAP: 1.0,
};
