/* Legacy race-session entry point; the first-visit garage renderer lives in CarWheels. */
const GarageDepartureWheels = (function () {
  "use strict";
  function create(gfx) { return CarWheels.createGarage(gfx); }
  return Object.freeze({ create });
})();
