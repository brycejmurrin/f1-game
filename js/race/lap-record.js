/* Apex 26 — LapRecord: time-trial record and sector-clock state moved out of game.js.
   The bag is mutable; game.js reads and writes the same fields it used to own. */
const LapRecord = (function () {
  "use strict";

  function create() {
    return {
      ttRecord: Infinity,
      ttNewRecord: false,
      ttLaps: [],
      ttSessionTs: 0,
      sectorStartT: 0,
      sectorIdx: 0,
      sectorValid: true,
      sectorBests: [Infinity, Infinity, Infinity],
      fieldSectorBests: [Infinity, Infinity, Infinity],
      sectorLast: [null, null, null],
    };
  }

  return { create };
})();
Object.freeze(LapRecord);
