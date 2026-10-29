/* Apex 26 — SESSION PHYS (SessionPhys): the physics keys a comparable session records, shared by SessionRecords and setup trials. */
const SessionPhys = (function () {
  "use strict";

  // One list. Setup trials read it at eval on the title, before the lazy
  // SessionRecords bundle replaces its stub. SessionRecords reads this array.
  const PHYS = ["PACE", "DRIFT", "FRONT_GRIP", "PLAYER_GRIP", "ROAD_FOLLOW", "STEER_EXPO", "STEER_MAX_SLIP", "STEER_SPEED_REF", "WHEELBASE", "YAW_DAMP", "YAW_INERTIA", "raceLineAssist"];

  return { PHYS };
})();
Object.freeze(SessionPhys);
