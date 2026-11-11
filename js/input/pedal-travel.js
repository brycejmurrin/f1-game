/* PedalTravel — stamp-then-ease thumb travel, one home for both pedals.
   The on-screen GAS/BRAKE (js/input/hold-buttons.js) and the phone wheel
   (js/input/phone-pad-page.js) share these numbers: a touch is full travel,
   12 px of slop, then 90 px of slide to a 0.12 floor. Sliding back past the
   landing point stays full. controller.html loads this file and not the
   hold-button factory; the game page loads it before hold-buttons.js. */
"use strict";

const PedalTravel = (function () {
  const DEAD_PX = 12;     // slop first, so a thumb tremor is not a lift
  const TRAVEL_PX = 90;   // finger travel from full press to the light end
  const MIN = 0.12;       // never quite zero: sliding off is not releasing

  // Vertical pedal: up the screen (decreasing clientY) eases off. The
  // horizontal steer-button path keeps its own axis and uses the constants.
  function ease(anchor, pos) {
    const up = Math.max(0, anchor - pos - DEAD_PX);
    return Math.max(MIN, Math.min(1, 1 - up / TRAVEL_PX));
  }

  return { DEAD_PX, TRAVEL_PX, MIN, ease };
})();
Object.freeze(PedalTravel);
