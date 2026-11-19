const MenuSheetGate = (function () {
  "use strict";

  const parked = new WeakMap();

  function mark(name) {
    try {
      if (typeof performance !== "undefined" && performance.mark) performance.mark(name);
    } catch (_) {  }
  }

  function open(doc) {
    try {
      const d = doc || (typeof document !== "undefined" ? document : null);
      if (!d || typeof d.getElementById !== "function") return false;
      const pm = d.getElementById("pmsettings");
      return !!(pm && !pm.hidden);
    } catch (_) {  }
    return false;
  }

  function slice(ms) {
    const wait = ms == null ? 32 : ms;
    return new Promise((r) => setTimeout(r, wait));
  }

  async function idle(current, idleMs, inputAt, sliceFn) {
    const pause = sliceFn || (() => slice(32));
    for (;;) {
      if (!current()) return false;
      if (open()) {
        mark("apex:menu-prep:deferred");
        await pause();
        continue;
      }
      const wait = idleMs - (performance.now() - inputAt());
      if (wait <= 0) return current();
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  function parkWarm(gate) {
    if (!gate) return false;
    const p = parked.get(gate) || { warm: 0, garageWarm: 0 };
    let moved = false;
    if (gate.warm > 0) { p.warm += gate.warm; gate.warm = 0; moved = true; }
    if (gate.garageWarm > 0) { p.garageWarm += gate.garageWarm; gate.garageWarm = 0; moved = true; }
    if (moved) {
      parked.set(gate, p);
      mark("apex:menu-prep:parked");
    }
    return moved;
  }

  function resumeWarm(gate) {
    if (!gate) return false;
    const p = parked.get(gate);
    if (!p) return false;
    if (p.warm) gate.warm = (gate.warm || 0) + p.warm;
    if (p.garageWarm) gate.garageWarm = (gate.garageWarm || 0) + p.garageWarm;
    parked.delete(gate);
    mark("apex:menu-prep:resume");
    return true;
  }

  function parkedWarm(gate) {
    const p = gate && parked.get(gate);
    return p ? { warm: p.warm, garageWarm: p.garageWarm } : null;
  }

  function watch(gate, opts) {
    const o = opts || {};
    const d = o.document || (typeof document !== "undefined" ? document : null);
    if (!d || typeof MutationObserver === "undefined") return () => {};
    const el = d.getElementById("pmsettings");
    if (!el) return () => {};
    let was = open(d);
    const sync = () => {
      const now = open(d);
      if (now === was) return;
      was = now;
      if (now) {
        if (typeof o.noisy === "function") o.noisy();
        parkWarm(gate);
      } else {
        resumeWarm(gate);
      }
    };
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["hidden", "inert"] });
    if (was) parkWarm(gate);
    return () => { try { mo.disconnect(); } catch (_) {  } };
  }

  return { open, slice, idle, parkWarm, resumeWarm, parkedWarm, watch };
})();
Object.freeze(MenuSheetGate);
