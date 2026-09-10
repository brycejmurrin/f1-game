"use strict";
/* Apex 26 — DebrisOpts: the DEBRIS switch as a player setting. The Rapier
   side-world (js/physics/debris-world.js) is a perf lever — a WASM physics
   world every frame — so it gets a settings row, not only a console flag.
   Its own file (like DrivingLineOpts / CockpitOpts) because it needs nothing
   from the G façade and js/ui/scale.js is scoped to size/resolution rows.
   Load order is free: nothing here touches DebrisWorld at eval.

   The key is the one DebrisWorld already reads: `apex26.debris`, raw lane,
   "1"/"0". Its create() reads the key once at boot to decide whether to start
   the 2.2 MB Rapier import, so the switch has two halves: setEnabled() takes
   effect now, the key decides the next boot. */
const DebrisOpts = (function () {
  "use strict";

  const KEY = "debris";          // apex26.debris — raw lane, "1"/"0", default ON
  const store = GameStore.store;

  // The stored value, else the shipped default (ON) — deliberately NOT
  // DebrisWorld.status().enabled: `_enabled` is false until game.js calls
  // create(), and this row wires on DOMContentLoaded, which can come first, so
  // asking the world painted OFF for a player whose debris was about to start.
  // Matched to create() EXACTLY (`getItem("apex26.debris") || "1"`, then
  // `=== "1"`): null and "" fall to the default, every other spelling is off.
  // A `!== "0"` here would disagree with the world on everything but "0"/"1".
  function on() {
    const raw = store.raw(`apex26.${KEY}`);   // raw() is null when storage is blocked
    return raw === null || raw === "" || raw === "1";
  }

  function set(want) {
    const v = !!want;
    // rawSet swallows a blocked write itself (and records store.broken), so a
    // failure here costs the next boot, never this session's live half.
    store.rawSet(`apex26.${KEY}`, v ? "1" : "0");
    // Live half: setEnabled(false) destroys the world; setEnabled(true) starts
    // the lazy Rapier load if this boot never did.
    try {
      if (typeof DebrisWorld !== "undefined" && DebrisWorld.setEnabled) DebrisWorld.setEnabled(v);
    } catch (_) { /* the stored half still reaches the next boot */ }
    return v;
  }

  function initUI() {
    if (typeof SettingRow === "undefined") return;
    // OFF is a frame budget the player gets back; the race is unchanged
    // otherwise (no lap, penalty or physics difference to the car).
    SettingRow.wire("pm-debris", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (on() ? "on" : "off"),
      // No GameAudio.uiSelect() on the write: uiSelect() blips unconditionally,
      // every call site supplies its own `if (G.soundOn)` gate, and this module
      // has no G — clicking would make a noise for a player who turned sound
      // off. DrivingLineOpts is silent for the same reason.
      write: (v) => set(v === "on"),
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }

  return { KEY, on, set, initUI };
})();
Object.freeze(DebrisOpts);
