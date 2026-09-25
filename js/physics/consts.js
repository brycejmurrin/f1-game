"use strict";
// PhysicsConsts — the driving model's immutable numbers, moved out of
// js/game.js with the rationale that tunes them. Values only: everything a
// pause-menu slider or the setPhysics harness can change stays a `let` in
// game.js, and every function that reads these stays with the model it
// belongs to. game.js destructures this object once at the top of its
// physics block, so load order matters (a HARD_EDGES entry in
// tools/manifest.cjs).
window.PhysicsConsts = {
  REVISION: "2026-09-tyre-peak-1", // increment when comparable lap physics changes
  VMAX: 72,            // m/s base (~259 km/h) — F1 race pace; scales all speeds
                       //   (PACE and the vTop()/vStd() normalisers live in game.js)
  ACCEL: 7,            // m/s^2 at low speed
  BRAKE: 22,
  BB_REF: 0.56,        // brake bias (% front / 100) at which the friction-ellipse split is 1/1 — see SetupTune
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
  // TYRE PEAK: the lateral curve (peak, plateau, floor) lives in
  // js/physics/tyre-model.js as TyreModel.lateralCurve — see there.
  // LOAD SENSITIVITY. Axle friction used to scale linearly with axle load, so
  // weight transfer moved balance without ever costing total grip. A real tyre's
  // friction coefficient falls as its load rises: the loaded axle gains less
  // than its share, the unloaded one loses less, and the pair under full braking
  // has ~1.3 % less lateral grip than at rest. Static balance is untouched (the
  // factor is 1 at each axle's static load).
  LOAD_SENS: 0.10,

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

  // s²/m. The speed² term in the DRIVING-HELP steer assist, so the help grows
  // with speed rather than staying a constant nudge: it reads as an effective
  // wheelbase (WHEELBASE + ASSIST_KUS*v², game.js's assistDelta), 2.6x stronger
  // at 80 m/s than at rest. Assist OFF is the shipped default.
  ASSIST_KUS: 0.0008,

  // Gain on the RACING LINE assist's pure-pursuit steer term (see the assist block
  // in updateCar). 1 = textbook pursuit — reach the line in exactly one look-ahead
  // distance; a little over that so the slider's top notch has real authority
  // without the assist ever outrunning the front tyre.
  LINE_PURSUIT: 2.6,

  LONG_GRIP: 34,
  // Power-on friction-circle cost, charged to the DRIVEN (rear) axle only —
  // the undriven front spends nothing on the throttle, so a planted pedal on a
  // slow exit lightens the rear's lateral grip and the car rotates (power-on
  // oversteer), while the front keeps turning. The charge is a fraction of
  // LONG_GRIP: traction-limited at low speed (THR_CAP, reached at
  // vStd ≤ THR_VK / THR_CAP ≈ 23 m/s: 78 % of rear lateral grip left with the
  // pedal planted), power-limited above it (THR_VK / vStd, an engine's P/v),
  // never below THR_FLOOR so planting the throttle mid-corner spends grip even
  // when speed-limited (the old flat THR_ELLIPSE charge was 0.38 of LONG_GRIP
  // at every speed, on BOTH axles). Full brake is still the bigger bill
  // (BRAKE / LONG_GRIP ≈ 0.65, both axles by bias).
  THR_FLOOR: 0.34,
  THR_CAP: 0.62,
  THR_VK: 14,          // m/s (a vStd() scale) — charge = THR_VK / vStd above the cap

  // Road grip in the wet, by TYRE TREAD CLASS: [slick, intermediate, full wet],
  // indexed by the fitted compound's `wetTread` in the Parts catalog. Read by
  // gripMult(c) in game.js: a car with tread == null (every AI car except the
  // MY TEAM teammate) takes the FULL-WET column — "the field fitted the right
  // tyre" — and gripMult() with no car is the slick column. Dry, overcast and
  // fog have no row,
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
  // (chassis cornering-lean cap now lives in js/physics/body-attitude.js as ROLL_MAX)
  WHEEL_R: 0.34,         // wheel radius (m) — matches Car3D geometry, for spin rate
  WHEEL_STEER_VIS: 0.5,  // rad of visible front-wheel steer at full lock

  GRASS_V: 18,         // crawl speed on grass
  // Sustained kerb rumble trauma (was inline 0.3): the FLOOR the camera shake
  // is held at for as long as the cue hold below is running, so riding a kerb
  // is one continuous rumble rather than a per-node re-arm.
  KERB_SHAKE: 0.22,
  // s — bridges the ~20 Hz per-node flicker of the raw TrackMesh.onKerb flag
  // (a ~4 m node lookup, so it strobes at speed while the car straddles the
  // kerb line): rumble, shake and haptics run off this sticky hold instead.
  KERB_CUE_HOLD: 0.10,

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
  // The slipstream window, shared by the AI scan, the player scan and
  // game.js wakeOf(): a car 0.5–TOW_RANGE m ahead and within TOW_HALF_W m
  // laterally; the wake fades over the last TOW_FADE m of that range.
  // BLOCKER_HALF_W is the narrower lane box the AI queues behind.
  TOW_RANGE: 34, TOW_FADE: 28, TOW_HALF_W: 4,
  BLOCKER_HALF_W: 2.2,

  // GEARBOX. 8-speed with realistic PROGRESSIVE ratios (real F1 gearboxes space
  // the ratios so the steps shrink in the higher gears): GEAR_TOP is each
  // gear's top speed as a fraction of the speed ENVELOPE (game.js gearHi()
  // scales it by vTop(), so all eight stay reachable at any OVERALL SPEED).
  // F1 V6 turbo: idle ~5k, rev limit 15k. Read by game.js (rpmFor, the
  // limiter), js/ui/hud.js (the tach) and js/agent/apex.js (reset).
  GEARS: 8,
  GEAR_TOP: [0.095, 0.16, 0.25, 0.36, 0.50, 0.66, 0.83, 1.0],
  IDLE_RPM: 5000, MAX_RPM: 15000,

  // DIFFICULTY presets — the AI field's pace scale (`ai`, a ground-speed
  // multiplier on TIER_V) and the rubber-band tolerance (`band`). Keyed by the
  // settings value; read by game.js (makeCars), js/race/quali-model.js (the modelled
  // field's lap) and js/career/career-ui.js (the guide lists the keys).
  // 2026-09-08: the AI now reads the racing line's own curvature for its corner
  // speed when it is ON the line (js/track/core/line.js pathK), which measured
  // 1.2-1.3 % off a solo lap (monza 124.97 -> 123.30 s, monaco 86.05 -> 85.03).
  // The three scales come down 1 % so each difficulty's lap time holds; what
  // changed is WHERE the pace is — a car on the line gains in the corners and
  // pays on the straights, a car fighting off-line the reverse.
  // 2026-09-08 (later): re-measured after the relaxed racing line and the
  // heading-state lateral controller, solo flying laps per level, deterministic
  // (a repeat run reproduced to 0.01 s). NOT re-scaled, and the reason is that
  // the drift is CIRCUIT-DEPENDENT and a global multiplier cannot express it:
  //   monza  normal 123.67 -> 124.18 s (+0.4 %)   spa normal 149.70 -> 149.55 (-0.1 %)
  //   monaco normal  85.25 ->  84.10 s (-1.35 %)  — the controller, not the line
  // Monaco gained because a car that no longer overshoots its target carries
  // more speed through 22 corners; monza and spa are flat. Pulling `ai` down
  // 1.2 % to hold monaco would put monza and spa 1.2 % off the pace they are
  // calibrated to — one circuit fixed, two broken. The spread is also well
  // inside the separation between levels (1.8-3.5 % per step), so each level
  // still means what it meant. Evidence: docs/notes/RACING-LINE-RESEARCH.md §8.
  // 2026-09-09: adding the player's DOWNFORCE term to the AI's corner model was
  // tried and REVERTED — the AI's lateral actuator has no aero and its grip
  // FALLS with speed (game.js gripScale), so an aero planner outran it and cost
  // 0.60 m of apex depth at a short monza corner. Details and the lap-time
  // table it produced: docs/notes/AI-FIELD-RESEARCH.md. DIFF is unchanged.
  // 2026-09-24: done properly — AiDrive.lateralScale (planner AND actuator)
  // now carries DOWNFORCE, so the aero rise no longer outruns the car.
  // game.js's BAND_CEIL caps a rubber-banded AI at this table's top scale:
  // easy's 0.851 x 1.18 = 1.004 used to beat hard's own 0.980.
  // `corner` is the SECOND dimension of difficulty, added 2026-09-15 with the
  // brake-look fix. Until then difficulty was one number: every level braked,
  // defended, deployed and erred identically and differed only in top speed,
  // which is the one lever players can catch a same-spec car using. `corner`
  // scales the AI's corner-speed target, so an easier field genuinely drives
  // further from the limit instead of just being slower down the straight.
  // At or below 1.0 by policy: the AI never corners faster than its own grip
  // model says it can.
  // `err` scales AiDrive.mistakeChance (2026-09-22, by request): the shipped
  // rate was under one mistake for the WHOLE FIELD over a default 3-lap race
  // (docs/notes/AI-FIELD-RESEARCH.md), which reads as "the AI never messes
  // up" — true at every level including hard, where that low rate is
  // deliberate (docs/PHYSICS.md "F1 22's two or three lock-ups a race was
  // what players called too many"). TARGET: normal ~2-3 field mistakes per
  // 3-lap race, easy ~3-4, hard unchanged (~1) — measured before/after in
  // docs/PHYSICS.md. The rubber band (`band`, above) must NOT touch `err`:
  // mistakes are a difficulty-ladder axis on their own, not a banded one, so
  // this stays monotonic (easy >= normal >= hard = 1) independent of band.
  // EASY needed more than a straight ratio of its rank to NORMAL: a slower,
  // looser field (lower `ai`/`corner`) draws less following pressure, so its
  // PRE-scaling base rate measured lower than normal's even though both
  // rounded to the same 0.020/100s at n=5 (docs/PHYSICS.md's before/after
  // table) — 2.5x left EASY's median mistake count at n=15 exactly where
  // NORMAL's unscaled baseline sat, so EASY's multiplier compensates for that
  // lower base, not just for the same 1.4x gap NORMAL:HARD implies.
  DIFF: {
    easy:   { ai: 0.851, band: 0.18, corner: 0.93, err: 3.5 },
    normal: { ai: 0.911, band: 0.08, corner: 0.97, err: 1.8 },
    // 1.030 is a ceiling, not a taste: the fastest team's TIER_V is 0.9695 and
    // the best driver's skill clamps at 1.0, so 0.9695 x 1.030 = 0.9986 keeps
    // even the quickest AI just under the player's own top-speed scale. A
    // same-spec car out-dragging the player down a straight is the one cheat
    // players reliably catch, so the straight stays theirs.
    // ONE FORMAT OPTS OUT, by request: a LEGEND duel scales the rival's tierV
    // (js/race/duel.js LEGEND_CAR) so the benchmark can out-drag the player on
    // the straight too. It is scoped to that one rival — every other AI car on
    // every grid, including an ordinary duel's, still sits under the ceiling
    // this comment describes.
    hard:   { ai: 1.030, band: 0.02, corner: 1.00, err: 1.0 },  // band was 0.03 — smarter OT/ERS/brake cuts rubber-band need
  },
};
// The top of that ladder: the fastest pace scale ANY level reaches with its
// rubber band fully wound on. Derived rather than written down so it tracks the
// table above; game.js's band block caps a banded AI here so the difficulty dial
// stays monotonic. Lives with DIFF because it is a property of DIFF.
// The fixed physics step. game.js's accumulator (PHYS_DT) runs on it and the
// modules that step alongside the loop (collide, incident-sim, debris-world,
// brake-cue) fall back to it when handed no dt. ONE number: it was typed as
// `1 / 60` in seven places, which would have drifted apart the day a
// higher-rate mode changed the loop's step.
window.PhysicsConsts.FIXED_DT = 1 / 60;
window.PhysicsConsts.BAND_CEIL = (() => {
  const top = Object.values(window.PhysicsConsts.DIFF).reduce((a, d) => (d.ai > a.ai ? d : a));
  // …and never above the player's own scale. The ladder's top used to sit at
  // 0.9996 by arithmetic accident, so the clamp was invisible; once `ai` rose
  // past 1.0 with the brake-look fix, the derived value would have licensed a
  // rubber-banded easy car to out-run the player outright. The cap is the
  // property that was always intended, now written down.
  return Math.min(1, top.ai * (1 + top.band));
})();
