const SettingsDefaults = (function () {
  "use strict";

  const DEF = {
    "difficulty": "hard",
    "tyreWear": "real",
    "raceGrid": "random",
    "drivingCoach": false,
    "caution": false,
    "unlimitedBudget": true,
    "volMusic": 0.6,
    "volSfx": 0.2,
    "spotter": false,
    "debris": "0",
    "gfxSsao": "1",
    "gfxGodrays": "1",
    "metricsPos": "left",
    "camMode": 19,
    "cockpitHalo": "fairing",
    "cockpitBody": "sculpted",
    "cockpitInterior": "team",
    "menuAccent": "ember",
    "textSize": "large",
    "uiContrast": "high",
    "homeScene": "photo",
    "backgroundMotion": "ambient",
    "homeCamera": "side",
  };

  return Object.freeze({
    has: (k) => Object.prototype.hasOwnProperty.call(DEF, k),
    get: (k) => DEF[k],
    keys: () => Object.keys(DEF),
  });
})();
