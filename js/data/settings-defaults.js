/* Apex 26 — SettingsDefaults: the SHIPPED DEFAULT for any player preference,
   in one file, as data.

   WHY THIS EXISTS. Every preference is read as `store.get(key, literal)` or
   `store.raw(key)`, so the shipped default used to be a literal argument spread
   across js/game.js, js/audio/panel.js, js/input/steer-tuning.js,
   js/race/driving-coach.js, js/race/race-control.js, js/ui/debris-opts.js and
   js/perf/metrics-overlay.js. "Make my settings the defaults" was therefore a
   hunt through seven files for fourteen literals, with nothing checking that
   js/ui/settings-export.js's SPEC still agreed with any of them — and SPEC's
   agreement is what makes the CHANGED list in an exported settings file true.
   A default edited in one place and not the other does not fail anything; it
   just quietly starts lying to every player who exports their settings.

   So: a key named here OVERRIDES the call-site literal, GameStore consults this
   on every miss, and SPEC reports from here too. One edit, one place, and
   tests/unit/settings-defaults.test.mjs holds the three of them together.

   OPT-IN BY KEY, which is the whole safety story. `has(k)` is false for
   everything not listed, so an unlisted key behaves exactly as it did before —
   the call-site literal, untouched. That matters most on the RAW lane, where
   `store.raw()` answers null for "never set" and some call sites read null as
   meaningful; only a key written here ever gets a different answer.

   TO CHANGE A DEFAULT: play the game, set it how it should ship, export
   SETTINGS from SETTINGS › DISPLAY › RENDERER › FILES, then

     node tools/gen/settings-defaults.mjs <that-file.json>

   which rewrites the block below from the export's own CHANGED list. Do not
   hand-edit the block; the tool prints every edit it makes and refuses keys
   that are not in SPEC. Device-adaptive defaults (uiScale, resMode, gfxPreset —
   the ones SPEC declares as null or as a function of the device) are refused on
   purpose: pinning one device's number here makes every other device wrong. */
const SettingsDefaults = (function () {
  "use strict";

  // @gen-settings-defaults start
  const DEF = {
    // DRIVING (js/game.js, js/race/*)
    "difficulty": "hard",
    "tyreWear": "real",
    "raceGrid": "random",
    "drivingCoach": true,
    "caution": false,
    // STEERING (js/input/steer-tuning.js)
    "preset": "custom",
    "steerRate": 1,
    "tiltDeg": 7,
    "adaptiveButtons": 8,
    "pace": 7,
    // AUDIO (js/audio/panel.js)
    "volMusic": 0.6,
    "volSfx": 0.2,
    // DISPLAY / METRICS (raw lane — bare strings, not JSON)
    "debris": "0",
    "metricsPos": "left",
  };
  // @gen-settings-defaults end

  return Object.freeze({
    has: (k) => Object.prototype.hasOwnProperty.call(DEF, k),
    get: (k) => DEF[k],
    keys: () => Object.keys(DEF),
  });
})();
