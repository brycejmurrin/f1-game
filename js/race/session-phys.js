const SessionPhys = (function () {
  "use strict";

  const PHYS = ["PACE", "DRIFT", "FRONT_GRIP", "PLAYER_GRIP", "ROAD_FOLLOW", "STEER_EXPO", "STEER_MAX_SLIP", "STEER_SPEED_REF", "WHEELBASE", "YAW_DAMP", "YAW_INERTIA", "raceLineAssist"];

  function assists() {
    const out = {};
    if (typeof GripSteer !== "undefined" && GripSteer.level() > 1) out.gripSteer = GripSteer.level();
    if (typeof WheelState !== "undefined" && WheelState.enabled()) out.wheelState = "on";
    return out;
  }
  function controls(base) { return Object.assign(base, assists()); }

  return { PHYS, assists, controls };
})();
Object.freeze(SessionPhys);
