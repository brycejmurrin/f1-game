/* Apex 26 — defer menu prep while an interactive menu sheet is open.

   WHY (D·IP2, iPhone 15 BrowserStack 2026-10-21/22). Opening Settings from the
   title painted in ~150–299 ms, then overlapped post-boot menu prep
   (menuIdle → warmPrograms / flyby plan / GaragePrebuild car+room). That
   overlap was the 3.7 s freeze; the same prep caused 0.7–1.2 s title hitches
   on the way back from race select. The sheet itself was fine — the warm and
   garage CPU work was not.

   WHAT. One gate used by game.js menuIdle/menuSlice and GaragePrebuild:
     - open()  — #pmsettings visible (door focus alone is not open; see open())
     - idle()  — MENU_IDLE_MS quiet AND no open sheet (yields while the sheet
       is up so warmPrograms / garage prewarm do not start on top of it)
     - parkWarm(gate) / resumeWarm(gate) — hold `_menuGate.warm` and
       `garageWarm` counters while the sheet is open so hidden warm presents
       do not compile on the same frames as the sheet interaction (does not
       touch tlx.js; only pauses the menu's own present countdown)
     - watch(gate, { noisy }) — MutationObserver on #pmsettings; parks on
       open, resumes on close, and resets the caller's quiet clock

   OFF the critical path for RACE!: race-settings prewarm still runs under its
   own surface; this gate only blocks speculative title work and in-flight
   menu warm frames while Settings (or its door focus) is hot. */
const MenuSheetGate = (function () {
  "use strict";

  const parked = new WeakMap(); // gate → { warm, garageWarm }

  function mark(name) {
    try {
      if (typeof performance !== "undefined" && performance.mark) performance.mark(name);
    } catch (_) { /* User Timing optional */ }
  }

  /** Settings hub visible. Door focus alone is NOT open: closeSettings() often
   *  returns focus to #mb-settings / #pm-settings while #pmsettings stays
   *  hidden, and treating that as open parked warm/garage forever (review F4).
   *  openSettings() unhides the sheet synchronously on the click, so the door
   *  bridge is unnecessary for the player path. */
  function open(doc) {
    try {
      const d = doc || (typeof document !== "undefined" ? document : null);
      if (!d || typeof d.getElementById !== "function") return false;
      const pm = d.getElementById("pmsettings");
      return !!(pm && !pm.hidden);
    } catch (_) { /* detached */ }
    return false;
  }

  function slice(ms) {
    const wait = ms == null ? 32 : ms;
    return new Promise((r) => setTimeout(r, wait));
  }

  /** Resolves true once `idleMs` has passed without input AND no sheet is open.
   *  While a sheet is open, yields (does not burn the idle clock) so menuFinish
   *  and GaragePrebuild wait instead of compiling on top of the interaction. */
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

  /** Observe #pmsettings; park warm frames on open, resume on close. */
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
    return () => { try { mo.disconnect(); } catch (_) { /* already gone */ } };
  }

  return { open, slice, idle, parkWarm, resumeWarm, parkedWarm, watch };
})();
Object.freeze(MenuSheetGate);
