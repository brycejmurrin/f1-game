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
