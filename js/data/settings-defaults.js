/* Global factory preferences. GameStore uses these on a storage miss and
   SettingsExport compares against them when creating a changes-only backup.
   Device-dependent defaults and the driving model live with their subsystems.
   The November 20 owner export supplies the audio, garage and cockpit choices.
   Generate this table with node tools/gen/settings-defaults.mjs <export.json>.
   Review subsystem changes explicitly with --include. */
const SettingsDefaults = (function () {
  "use strict";

  // @gen-settings-defaults start
  const DEF = {
    // DRIVING (js/game.js, js/race/*)
    "difficulty": "hard",
    "tyreWear": "real",
    "raceGrid": "quali",
    "drivingCoach": false,
    "caution": false,
    "unlimitedBudget": true,
    // AUDIO (js/audio/panel.js)
    "volMusic": 0.7,
    "volSfx": 0.4,
    "spotter": false,
    "sound": false,
    "music": false,
    // DISPLAY / METRICS (raw lane — bare strings, not JSON)
    "debris": "0",
    "gfxGodrays": "1",
    "metricsPos": "left",
    // CAMERA
    "camMode": 19,
    "cockpitHalo": "fairing",
    "cockpitBody": "sculpted",
    "cockpitInterior": "team",
    "helmetVisorColor": "amber",
    "helmetVisorIntensity": "medium",
    "cockpitSeat": "fwd",
    // APPEARANCE
    "menuAccent": "ember",
    "textSize": "normal",
    "uiContrast": "off",
    "homeScene": "static",
    "backgroundMotion": "ambient",
    "homeCamera": "side",
    "garageLook": "flood",
    "crewLook": "pitstop",
  };
  // @gen-settings-defaults end

  return Object.freeze({
    has: (k) => Object.prototype.hasOwnProperty.call(DEF, k),
    get: (k) => DEF[k],
    keys: () => Object.keys(DEF),
  });
})();
