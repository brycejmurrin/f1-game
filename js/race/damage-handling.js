var DamageHandling = (function () {
  "use strict";

  const KEY = "damageHandling";
  const FW_AERO = 0.6;
  const RW_AERO = 0.6;
  const FLOOR_AERO = 0.3;
  const KNOCK_GRIP = 0.05;

  let enabled = typeof DamageHandling !== "undefined" && !!DamageHandling && DamageHandling._stub === true && DamageHandling.isEnabled();
  const out = { aeroF: 1, aeroR: 1, grip: 1, axF: 1, axR: 1 };

  const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);

  function factors(r, o) {
    o = o || { aeroF: 1, aeroR: 1, grip: 1 };
    const fw = (clamp01(r && r.fwL) + clamp01(r && r.fwR)) / 2, rw = clamp01(r && r.rw), floor = clamp01(r && r.floor);
    o.aeroF = Math.max(0, 1 - FW_AERO * fw - FLOOR_AERO * floor);
    o.aeroR = Math.max(0, 1 - RW_AERO * rw - FLOOR_AERO * floor);
    o.grip = r && r.knock ? 1 - KNOCK_GRIP : 1;
    return o;
  }

  function forCar(c) {
    if (!enabled || !c || !c.local || typeof Damage === "undefined") return null;
    return factors(Damage.get(c), out);
  }

  const none = { f: 1, r: 1 }, applied = { f: 1, r: 1 };
  function axles() {
    if (!enabled) return none;
    applied.f = out.axF; applied.r = out.axR;
    return applied;
  }

  function setEnabled(on) { enabled = on === true; if (!enabled) { out.axF = 1; out.axR = 1; } }
  function isEnabled() { return enabled; }
  function fromStore(store) { setEnabled(!!store && store.get(KEY, false) === true); return enabled; }

  return Object.freeze({ KEY, FW_AERO, RW_AERO, FLOOR_AERO, KNOCK_GRIP, factors, forCar, axles, setEnabled, isEnabled, fromStore });
})();
Object.freeze(DamageHandling);
