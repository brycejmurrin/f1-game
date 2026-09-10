"use strict";
/* Apex 26 — DebrisOpts: the DEBRIS switch as a player setting.

   The Rapier side-world (js/physics/debris-world.js) has always been
   reachable, but only through `apex26.debris = "0"` or `__apex.debris(false)`
   — a console, not a settings row. That is fine for an escape hatch and wrong
   for a PERF LEVER, which is what it turned out to be: it runs a WASM physics
   world every frame for spall, marbles and trackside furniture, and on a
   handset that is real budget. A player watching frames fall should be able to
   spend it without a debugger.

   WHY ITS OWN FILE, and not a few lines in js/ui/scale.js. That module says
   what it is in its first line — UI SIZE / HUD SIZE / BUTTON SIZE plus the
   RESOLUTION pin — and UPSCALE has already crept in beside them. A second
   unrelated row is how a scoped module becomes a junk drawer. DrivingLineOpts
   and CockpitOpts are the shape the tree already uses for exactly this: one
   feature's player preference, self-contained, needing nothing from the G
   façade.

   LOAD ORDER IS FREE, so this sits with the other opts modules rather than
   wedged into the physics block: nothing here touches DebrisWorld at eval. The
   row is wired on DOM ready and every read/write runs from a click, both of
   which are long after the last tag has run.

   THE KEY IS THE ONE DebrisWorld ALREADY READS: `apex26.debris`, raw lane,
   "1"/"0", and its create() reads it once at boot to decide whether to start
   the 2.2 MB Rapier import at all. So the switch has two halves that are NOT
   the same: setEnabled() takes effect on the spot, and the key decides the
   next boot. Turning it off frees the live world now; turning it back on
   re-arms the lazy load. */
const DebrisOpts = (function () {
  "use strict";

  const KEY = "debris";          // apex26.debris — raw lane, "1"/"0", default ON
  const store = GameStore.store;

  /* Stored value, else the shipped default (ON) — and DELIBERATELY not
     DebrisWorld.status().enabled, which is the reading that looks more honest
     and is wrong half the time. `_enabled` is false until game.js calls
     create(), and this row is wired on DOMContentLoaded, which can come first:
     asking the world then paints OFF for a player whose debris is about to
     switch itself on. The key is what create() reads and what the player set,
     so the key is the answer.

     Matched to create() EXACTLY, which is `getItem("apex26.debris") || "1"`
     and then `=== "1"`: null and "" fall to the default, and every other
     spelling is off. A `!== "0"` here would read the same for the two values
     anyone actually writes and disagree with the world for the rest. */
  function on() {
    const raw = store.raw("apex26." + KEY);   // raw() is null when storage is blocked
    return raw === null || raw === "" || raw === "1";
  }

  function set(want) {
    const v = !!want;
    // rawSet swallows a blocked write itself (and records store.broken), so a
    // failure here costs the next boot, never this session's live half below.
    store.rawSet("apex26." + KEY, v ? "1" : "0");
    // Live half. setEnabled(false) destroys the world; setEnabled(true) starts
    // the lazy Rapier load if this boot never did.
    try {
      if (typeof DebrisWorld !== "undefined" && DebrisWorld.setEnabled) DebrisWorld.setEnabled(v);
    } catch (_) { /* the stored half still reaches the next boot */ }
    return v;
  }

  function initUI() {
    if (typeof SettingRow === "undefined") return;
    // DEBRIS — spall, marbles and trackside furniture, simulated in a Rapier
    // side-world. OFF is a frame budget the player gets back; the race is
    // unchanged otherwise (no lap, penalty or physics difference to the car).
    SettingRow.wire("pm-debris", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (on() ? "on" : "off"),
      // NO GameAudio.uiSelect() on the write, unlike the RESOLUTION row next to
      // it. uiSelect() blips unconditionally — every call site in the tree
      // supplies the `if (G.soundOn)` gate itself — and this module has no G,
      // which is the property that let it be its own file. Clicking would
      // therefore make a noise for a player who turned sound off. DrivingLineOpts
      // is G-less for the same reason and is likewise silent.
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
