/* Apex 26 — VEHICLE tick scratch.
 *
 * PlayerForces.step hands GripSteer.forPlayer (every physics step) and
 * WheelState.stepPlayer (when that opt-in is on) a bag of numbers. Both
 * callees copy the fields before they return, so the bag is scratch, not a
 * new object. Owning the two bags here keeps the tick from allocating them.
 *
 * Contract: the caller writes every field on `grip` / `wheel` before the
 * call. The same object is reused for the life of the page.
 */
const Vehicle = (function () {
  "use strict";

  const grip = {
    muF: 0, csFront: 0, af: 0, ar: 0, braking: false, shaped: 0, dt: 0,
  };
  const wheel = {
    dt: 0, braking: false, thrOn: false,
    aReqF: 0, aReqR: 0, muLongF: 0, muLongR: 0,
    slipF: 0, slipR: 0, csFront: 0, csRear: 0, muLatF: 0, muLatR: 0,
  };

  function forPlayer(driverDelta, c) {
    if (typeof GripSteer === "undefined" || !GripSteer.forPlayer) return driverDelta;
    return GripSteer.forPlayer(driverDelta, c, grip);
  }

  function stepWheel(c) {
    return WheelState.stepPlayer(c, wheel);
  }

  return Object.freeze({ grip, wheel, forPlayer, stepWheel });
})();
