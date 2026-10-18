/* Apex 26 — DriveTune: the live driving-feel lets (PACE, wheelbase, steer, grip).
   Pure state bag. game.js keeps the G getters; sliders write the same fields. */
const DriveTune = (function () {
  "use strict";

  function create() {
    return {
      PACE: 1.0,
      WHEELBASE: 3.2,
      STEER_EXPO: 2.4,
      STEER_MAX_SLIP: 0.32,
      STEER_SPEED_REF: 60,
      DRIFT: 0,
      FRONT_GRIP: 0.94,
      YAW_DAMP: 1.0,
      YAW_INERTIA: 0.58,
      PLAYER_GRIP: 1.15,
      ROAD_FOLLOW: 0,
    };
  }

  return { create };
})();
Object.freeze(DriveTune);
