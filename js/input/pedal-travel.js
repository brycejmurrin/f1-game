"use strict";

const PedalTravel = (function () {
  const DEAD_PX = 12;
  const TRAVEL_PX = 90;
  const MIN = 0.12;

  function ease(anchor, pos) {
    const up = Math.max(0, anchor - pos - DEAD_PX);
    return Math.max(MIN, Math.min(1, 1 - up / TRAVEL_PX));
  }

  return { DEAD_PX, TRAVEL_PX, MIN, ease };
})();
Object.freeze(PedalTravel);
