/* Apex 26 — SESSION PHYS (SessionPhys): the physics keys a comparable session records, shared by SessionRecords and setup trials. */
const SessionPhys = (function () {
  "use strict";

  // One list. Setup trials read it at eval on the title, before the lazy
  // SessionRecords bundle replaces its stub. SessionRecords reads this array.
  const PHYS = ["PACE", "DRIFT", "FRONT_GRIP", "PLAYER_GRIP", "ROAD_FOLLOW", "STEER_EXPO", "STEER_MAX_SLIP", "STEER_SPEED_REF", "WHEELBASE", "YAW_DAMP", "YAW_INERTIA", "raceLineAssist"];

  // #5024 (Bryce, 2026-11-11: "Yes, separate key"): GRIP STEER above OFF and WheelState ON
  // (the slip-ratio tyre model) each make their own record/ghost class. Added only when not
  // OFF, so every key recorded before them stays valid. docs/PHYSICS.md §Record keys.
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
