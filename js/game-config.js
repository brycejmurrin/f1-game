/* Apex 26 — game configuration: physics constants, gear table, difficulty
 * tiers, camera-mode list, and the live-tunable physics knobs (AXC.PACE,
 * AXC.WHEELBASE, ... — mutated by __apex.setPhysics and the pause sliders).
 * Pure constants are exposed as AXC properties; consumer files destructure
 * them into locals at module-eval time. Loads before game-state.js/game.js. */
"use strict";

const AXC = {};
window.AXC = AXC;   // reachable for tools & the game-* module split

(function () {
"use strict";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;   // local copy (used by rpmFor)

// ---------- physics constants ----------
const VMAX = 72;            // m/s base (~259 km/h) — F1 race pace; scales all speeds
const ACCEL = 7;            // m/s^2 at low speed
// Global pace multiplier on top speed AND acceleration, applied to EVERY car
// (player + AI) so the whole field speeds up/slows down together and the racing
// stays competitive. 1.0 = stock. Driven by the OVERALL SPEED slider.
AXC.PACE = 1.0;
const BRAKE = 22;
const REVERSE_MAX = -5;     // m/s — top reverse crawl speed (brake held at a stop)
const REVERSE_ACCEL = 5;    // m/s^2 — how quickly the reverse crawl builds
const COAST_DRAG = 6;       // m/s^2 deceleration when off the throttle
const GRAVITY_SLOPE = 9;    // m/s^2 along-slope pull on elevation (~g, arcade-tuned)
const LAT_MAX = 22;         // m/s^2 cornering grip
const STEER_VMAX = 15;      // lateral m/s at full lock, full speed (AI)
// Player steering inputs into the dynamic model below. WHEELBASE is the real
// axle spacing — a SHORTER wheelbase has a smaller yaw inertia so it turns in
// harder/faster (the RESPONSE slider). STEER_EXPO shapes the input: >1 = gentle
// near centre (fine, non-twitchy corrections) while keeping full lock at the
// stops. STEER_MAX_SLIP is the max road-wheel steer ANGLE (radians) the driver
// can command; STEER_SPEED_REF tapers that lock a little at speed for stability.
// All four are tuned live by the pause-menu sliders, so they're `let`.
AXC.WHEELBASE = 3.2;        // m; shorter = snappier turn-in (RESPONSE slider)
AXC.STEER_EXPO = 2.4;       // input shaping: higher = much gentler near centre
AXC.STEER_MAX_SLIP = 0.32;  // rad — max road-wheel steer angle (~18°), STEER LOCK
AXC.STEER_SPEED_REF = 60;   // m/s reference for the speed-sensitive lock taper:
                            // higher = keeps more steering at speed (SPEED STEER slider)
// Dynamic single-track ("bicycle") tyre model for the player. Each axle makes a
// lateral force from its SLIP ANGLE (how far its travel differs from where it
// points), soft-saturating at a friction limit (the grip circle). Cornering
// force — not a kinematic "rotate the car and it follows" rule — curves the
// path, so the car can never rotate faster than the tyres can grip: overcook a
// corner and the FRONT washes wide (understeer); loosen the rear and it steps
// out (oversteer). Both emerge from the same equations instead of being faked.
//   c.yawRateCur  yaw rate r (rad/s, + = nose swinging right)
//   c.vLat        body lateral velocity (m/s, + = sliding right)
// DRIFT/ROAD_FOLLOW etc. stay `let` so the pause sliders can tune them live.
AXC.DRIFT = 0;             // rear looseness 0..1: 0 = planted (no oversteer). Slide was
                          // removed as a player control; left settable for the debug bridge.
const FRONT_WEIGHT = 0.47;  // static front-axle load fraction (F1 is rear-biased)
const CS_FRONT = 130;       // front cornering stiffness (accel per rad of slip)
const CS_REAR  = 175;       // rear stiffer than front → understeer in the linear range too
const WT_LONG = 0.22;       // longitudinal load transfer (braking loads the front axle)
// These four are `let` so the emulation/tuning harness (setPhysics) can sweep them
// — they are the core feel levers found by emulating real drivers, not pause-menu
// sliders. FRONT_GRIP: front friction bias (<1) for an understeer-safe default.
// YAW_DAMP: yaw damping for arcade stability. YAW_INERTIA: rotational inertia
// scale (<1 = snappier turn-in). PLAYER_GRIP: forgiveness headroom over the AI.
AXC.FRONT_GRIP = 0.89;
AXC.YAW_DAMP = 1.0;
AXC.YAW_INERTIA = 0.7;      // scales the car's rotational inertia: <1 = snappier turn-in
                            // (quicker direction changes through chicanes) without
                            // touching steady-state grip. Too low over-rotates into slip
                            // (washes wide); 0.7 keeps turn-in lively but settled.
AXC.PLAYER_GRIP = 1.15;     // player-only grip headroom over the AI's LAT_MAX baseline:
                            // keeps the dynamic model's character but forgiving enough
                            // that a tidy line holds the road (neutral-simcade target)
const ASSIST_KUS = 0.0008;  // s²/m — speed² term in the DRIVING-HELP steer assist so
                            // it keeps tracking the road as speed rises. Kept modest:
                            // the grippy car understeers little, so a large term would
                            // OVER-steer and cut the car to the inside of the corner.
// Steering-assist ("DRIVING HELP"): adds road-wheel steer toward the upcoming
// curvature so the car helps drive each corner — but the assist goes THROUGH the
// tyres (grip-limited) like the driver's own steering, it can't teleport the
// heading. 0 = pure manual (the car runs straight off at corners), 0.9 = the
// car nearly steers the corner for you. The driver always adds on top.
AXC.ROAD_FOLLOW = 0.7;
// Combined-slip friction ellipse: grip used braking/accelerating is taken out of
// the cornering budget. LONG_GRIP is the longitudinal axis of the ellipse (m/s²),
// set a little above BRAKE (27) so straight-line braking keeps most grip, but
// braking hard WHILE turning washes the front wide; easing off the brake as you
// turn in (trail-braking) hands grip back to cornering. Higher = more forgiving.
const LONG_GRIP = 34;
// Visual animation (render-only, never touches physics): the chassis leans into
// corners (roll ∝ lateral g) and pitches to the road gradient, and the wheels
// spin with speed + steer with input — all on a smoothed visual layer, the way
// SuperTuxKart keeps a rigid physics body and animates only the model.
const BODY_ROLL_MAX = 0.06;   // rad (~3.4°) max chassis lean at full lateral grip
const WHEEL_R = 0.34;         // wheel radius (m) — matches Car3D geometry, for spin rate
const WHEEL_STEER_VIS = 0.5;  // rad of visible front-wheel steer at full lock
const GRASS_V = 18;         // crawl speed on grass
const DEPLOY_A = 3.0;       // extra accel from electric deploy
const TAPER_LO = 41, TAPER_HI = 53;  // deploy tapers to 0 across this speed band
const DRAIN = 0.20, REGEN = 0.115;   // energy per second
const OT_TIME = 4, OT_COOL = 12, OT_GAP = 1.0;
const TIER_V = [1.0, 0.988, 0.973, 0.958, 0.942];
// 6-speed gearbox with realistic PROGRESSIVE ratios (research: real/F1 gearboxes
// space the ratios so the steps shrink in the higher gears). So an upshift drops
// the revs a lot in the low gears and less up top, and every shift lands back in
// the ~8.7-11.3k power band (F1's optimal ~8-12k) before climbing to the limit —
// rather than dropping to idle or barely dropping at all. Top speed fraction of VMAX.
// F1-authentic 8 gears.
const GEARS = 8;
const GEAR_TOP = [0.095, 0.16, 0.25, 0.36, 0.50, 0.66, 0.83, 1.0];
const IDLE_RPM = 5000, MAX_RPM = 15000;   // F1 V6 turbo: idle ~5k, rev limit 15k
function gearLo(g) { return g > 1 ? VMAX * GEAR_TOP[g - 2] : 0; }
function gearHi(g) { return VMAX * GEAR_TOP[g - 1]; }
function naturalGear(speed) {
  for (let g = 1; g <= GEARS; g++) if (speed <= gearHi(g) + 0.01) return g;
  return GEARS;
}
function rpmFor(gear, speed) {
  // RPM is proportional to speed / this gear's top speed: a higher gear turns the
  // engine slower at a given speed. So an upshift drops RPM only PARTIALLY — more
  // in the low gears (wide ratios) than the high gears (close ratios), as in a
  // real car — instead of dropping to idle on every shift. Floored at idle,
  // capped just past redline. (This also drives the engine pitch and the tach.)
  const hi = gearHi(gear);
  const rpm = MAX_RPM * (speed / Math.max(hi, 1));
  return clamp(rpm, IDLE_RPM, MAX_RPM * 1.04);
}
const DIFF = {
  easy:   { ai: 0.86, band: 0.18 },
  normal: { ai: 0.92, band: 0.08 },
  hard:   { ai: 0.99, band: 0.03 },
};
const GAME_LAPS = 3;
const TT_LAPS = 4;          // time trial: one standing out-lap + flying laps

// Player camera modes, cycled with the CAM button / C key and persisted. Each is
// a distinct vantage computed in render(): a close action chase, a higher/wider
// chase for race-craft, an in-cockpit eye, and a nose/hood cam. Index into CAM_MODES.
const CAM_MODES = [
  { id: "chase",     label: "CHASE" },
  { id: "far",       label: "FAR" },
  { id: "drift",     label: "DRIFT" },
  { id: "cockpit",   label: "COCKPIT" },
  { id: "hood",      label: "HOOD" },
  { id: "overhead",  label: "OVERHEAD" },
  { id: "heli",      label: "HELI" },
  { id: "reverse",   label: "REVERSE" },
  { id: "side",      label: "TV SIDE" },
  { id: "cinematic", label: "CINEMATIC" },
  { id: "low",       label: "LOW" },
  { id: "tcam",      label: "T-CAM" },
  { id: "rear",      label: "REAR CAM" },
];

Object.assign(AXC, {
  VMAX, ACCEL, BRAKE, REVERSE_MAX, REVERSE_ACCEL, COAST_DRAG, GRAVITY_SLOPE,
  LAT_MAX, STEER_VMAX, FRONT_WEIGHT, CS_FRONT, CS_REAR, WT_LONG, ASSIST_KUS,
  LONG_GRIP, BODY_ROLL_MAX, WHEEL_R, WHEEL_STEER_VIS, GRASS_V, DEPLOY_A,
  TAPER_LO, TAPER_HI, DRAIN, REGEN, OT_TIME, OT_COOL, OT_GAP, TIER_V, GEARS,
  GEAR_TOP, IDLE_RPM, MAX_RPM, DIFF, GAME_LAPS, TT_LAPS, CAM_MODES,
  gearLo, gearHi, naturalGear, rpmFor,
});
})();
