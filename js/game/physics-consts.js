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

  X_VMAX_GAIN_LO: 0.055,  // top-speed gain at full X-mode, smallest wing
  X_VMAX_GAIN_HI: 0.155,  // ...and the biggest (more drag to shed)
  X_DF_LOSS_LO: 0.42,     // fraction of the DOWNFORCE term given up, smallest wing
  X_DF_LOSS_HI: 0.78,     // ...and the biggest (more downforce to lose)
  X_COAST_CUT_LO: 0.28,   // fraction of COAST_DRAG shed while coasting, smallest wing
  X_COAST_CUT_HI: 0.55,   // ...and the biggest

  X_OPEN_RATE: 2.6,    // aeroX per second opening (~0.385 s, inside the 400 ms cap)
  X_CLOSE_RATE: 8.0,   // aeroX per second closing (~0.125 s back to Z — well inside the cap)
  X_MIN_SPEED: 25,     // m/s (a vStd() threshold) — no X-mode at crawl speed
  // Overtake's own crawl floor, and a vStd() threshold for exactly the same
  // reason X_MIN_SPEED is one. Named rather than inline so the next reader can
  // see it is the sibling of the constant above and is measured on the same scale.
  OT_MIN_SPEED: 15,    // m/s (a vStd() threshold) — no overtake at crawl speed
  OFF_GRIP: 0.42,      // fraction of tarmac lateral grip on grass/gravel

  ASSIST_KUS: 0.0008,  // s²/m — speed² term in the DRIVING-HELP steer assist so

  // Gain on the RACING LINE assist's pure-pursuit steer term (see the assist block
  // in updateCar). 1 = textbook pursuit — reach the line in exactly one look-ahead
  // distance; a little over that so the slider's top notch has real authority
  // without the assist ever outrunning the front tyre.
  LINE_PURSUIT: 2.6,

  LONG_GRIP: 34,

  // Road grip in the wet, by TYRE TREAD CLASS: [slick, intermediate, full wet],
  // indexed by the fitted compound's `wetTread` in the Parts catalog (absent = 0
  // = slick). Read by gripMult() in game.js; dry, overcast and fog have no row,
  // so the lookup misses and grip stays 1 as it always did.
  //
  // THE SLICK COLUMN IS THE OLD WEATHER-ONLY gripMult() VERBATIM. That is the
  // point: before this table the model read the weather and never the tyre, so
  // the two wet compounds were a pure penalty — you paid ~10% of the car to fit
  // a full wet and the rain treated you exactly like a slick. Keeping 0.82/0.72
  // makes the fix purely additive: wets gain, nothing else moves, and the
  // characterization baselines stay honest instead of being re-cut.
  //
  // A full wet in a storm (0.97) is worth 1.35x a slick's grip, so a correct
  // call roughly matches the AI field and a wrong one costs about a quarter of
  // your cornering. These are a design choice, not a measurement.
  WET_GRIP: {
    wet:  [0.82, 0.94, 0.99],
    rain: [0.72, 0.86, 0.97],
  },

  // Visual animation (render-only, never touches physics): the chassis leans into
  // corners (roll ∝ lateral g) and pitches to the road gradient, and the wheels
  // spin with speed + steer with input — all on a smoothed visual layer, the way
  // SuperTuxKart keeps a rigid physics body and animates only the model.
  // (chassis cornering-lean cap now lives in js/game/bodyattitude.js as ROLL_MAX)
  WHEEL_R: 0.34,         // wheel radius (m) — matches Car3D geometry, for spin rate
  WHEEL_STEER_VIS: 0.5,  // rad of visible front-wheel steer at full lock

  GRASS_V: 18,         // crawl speed on grass
  KERB_SHAKE: 0.22,    // sustained kerb rumble trauma (was inline 0.3): amt =
  KERB_CUE_HOLD: 0.10, // s — bridges the ~20 Hz per-node flicker of the raw

  DEPLOY_A: 3.0,       // extra accel from electric deploy
  TAPER_LO: 41, TAPER_HI: 53,  // deploy tapers to 0 across this speed band
                                       //   (a vStd() band — pace-normalised, so the
                                       //   taper sits at the same place on the dial)

  TAPER_FLOOR: 0.35,   // deploy never tapers below this — see deployTaper() in game.js

  DRAIN_LO: 0.14, DRAIN_HI: 0.26,    // energy/s while boosting: best -> worst deploy
  REGEN_LO: 0.085, REGEN_HI: 0.155,  // energy/s recovered: worst -> best regen
  OT_TIME_LO: 3.2, OT_TIME_HI: 5.2,  // overtake push, seconds
  OT_COOL_LO: 9, OT_COOL_HI: 14,     // ...and its lockout, best -> worst deploy
  OT_GAP: 1.0,
};
