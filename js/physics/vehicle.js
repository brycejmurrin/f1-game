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

  return Object.freeze({ grip, wheel });
})();
