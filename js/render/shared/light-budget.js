"use strict";

const LightBudget = (function () {
  const MAX = 48;
  const MOBILE = 24;
  const LITE = 16;
  const CHUNK = 24;
  const MIRROR = 8;
  const TAIL_RESERVE = 5;
  let _slots = MAX;

  function setSlots(n) {
    const v = n | 0;
    _slots = v > 0 ? Math.min(v, MAX) : MAX;
    return _slots;
  }
  function slots() { return _slots; }

  return { MAX, MOBILE, LITE, CHUNK, MIRROR, TAIL_RESERVE, setSlots, slots };
})();
Object.freeze(LightBudget);
