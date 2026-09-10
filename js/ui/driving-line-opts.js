/* Apex 26 — DrivingLineOpts: the DRIVING LINE's player PREFERENCES — LINE
   COLOUR, LINE OPACITY and BRAKE CUE, the three that persist per player rather
   than per race. The mode itself (OFF / CORNERS / FULL) is a property of the
   session, so it lives in RACE SETTINGS and game.js owns it. Self-contained:
   needs DrivingLine, SettingRow and the store, nothing from the G façade.

   The stored values are READ AT EVAL, not on DOMContentLoaded: the first frame
   must not draw a default the player did not choose. Only the UI wiring waits
   for the DOM. */
const DrivingLineOpts = (function () {
  "use strict";

  const K_PALETTE = "drivingLinePalette";
  const K_OPACITY = "drivingLineOpacity";
  // NOT "brakeCue" — that key belongs to the steering panel's 1-10 slider
  // (js/input/steer-tuning.js). Both modules owned it with incompatible types
  // and the store JSON-parses, so each read the other's write back: the slider
  // dropped "on" on its number guard and never restored, and this flag read OFF
  // the moment the slider was touched.
  const K_CUE = "lineBrakeCue";
  const K_CUE_LEGACY = "brakeCue";

  const store = GameStore.store;

  // BRAKE CUE is a plain flag here rather than a DrivingLine member: the shared
  // module builds the ribbon and knows nothing about audio. A player who set
  // this before the rename has it under the old shared key — carried over only
  // when it is still a STRING, because a number there is the slider's notch.
  let cueOn = (() => {
    const v = store.get(K_CUE, null);
    if (v !== null) return v === "on";
    return store.get(K_CUE_LEGACY, null) === "on";
  })();

  DrivingLine.setPalette(store.get(K_PALETTE, "f1"));
  DrivingLine.setOpacity(store.get(K_OPACITY, "normal"));

  function brakeCue() { return cueOn; }
  function setBrakeCue(on) {
    cueOn = !!on;
    store.set(K_CUE, cueOn ? "on" : "off");
    return cueOn;
  }

  function initUI() {
    if (typeof SettingRow === "undefined") return;
    // LINE COLOUR — F1's green/amber/red puts the two ends of the speed cue on
    // the pair red-green deficiencies cannot separate; COLOUR-BLIND swaps in
    // the IBM safe triple. Every backend's shader mixes on one flag.
    SettingRow.wire("pm-linecolor", {
      values: [["f1", "F1"], ["safe", "COLOUR-BLIND"]],
      read: () => DrivingLine.palette(),
      write: (v) => { DrivingLine.setPalette(v); store.set(K_PALETTE, DrivingLine.palette()); },
    });
    // LINE OPACITY — the complaint runs both ways (intrusive in cockpit view,
    // invisible on a bright road). NORMAL is the line as shipped.
    SettingRow.wire("pm-lineopacity", {
      values: [["subtle", "SUBTLE"], ["normal", "NORMAL"], ["solid", "SOLID"]],
      read: () => DrivingLine.opacity(),
      write: (v) => { DrivingLine.setOpacity(v); store.set(K_OPACITY, DrivingLine.opacity()); },
    });
    // BRAKE CUE — the CUE rung of the assist ladder (docs/research/DRIVING-CONTROLS-RESEARCH.md),
    // its own preference because the players who need it most run the line OFF.
    // Id is pm-linebrakecue, NOT pm-brakecue: the steering panel's 1-10 range
    // owns that id, and a shared id made getElementById return the set-row div,
    // so the slider's .value / oninput never reached the input.
    SettingRow.wire("pm-linebrakecue", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (cueOn ? "on" : "off"),
      write: (v) => setBrakeCue(v === "on"),
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }

  return { K_PALETTE, K_OPACITY, K_CUE, brakeCue, setBrakeCue, initUI };
})();
Object.freeze(DrivingLineOpts);
