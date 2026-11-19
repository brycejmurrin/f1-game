"use strict";

var GameAudioToneModel = (function () {
  const ENGINE_VOICES = {
    "default":       { rateTrim: 1.00, detune: 0,   formantHz: 0,    formantGain: 0, cutTrim: 1.00, whineHz: 1500, whineLvl: 1.0, synthSpread: 1.009, subLvl: 1.0 },
    "Mercedes":      { rateTrim: 1.00, detune: 0,   formantHz: 1250, formantGain: 3, cutTrim: 1.05, whineHz: 1600, whineLvl: 0.9, synthSpread: 1.007, subLvl: 0.9 },
    "Ferrari":       { rateTrim: 1.03, detune: 25,  formantHz: 1900, formantGain: 5, cutTrim: 1.12, whineHz: 1500, whineLvl: 0.8, synthSpread: 1.013, subLvl: 0.8 },
    "Red Bull Ford": { rateTrim: 0.99, detune: -15, formantHz: 800,  formantGain: 4, cutTrim: 0.96, whineHz: 1350, whineLvl: 0.7, synthSpread: 1.018, subLvl: 1.2 },
    "Honda":         { rateTrim: 1.01, detune: 10,  formantHz: 1500, formantGain: 2, cutTrim: 1.04, whineHz: 1750, whineLvl: 1.1, synthSpread: 1.005, subLvl: 0.95 },
    "Audi":          { rateTrim: 0.98, detune: -20, formantHz: 950,  formantGain: 3, cutTrim: 0.92, whineHz: 2100, whineLvl: 1.5, synthSpread: 1.010, subLvl: 1.1 },
  };

  const TUNE_DEF = Object.freeze({
    pitch: 0.85, idle: 1, revRange: 1.3, curve: 1, detune: 0, brightness: 1, gravel: 1, sub: 0.25,
    limiter: 2.25, limRate: 0.8, limPitch: 0, boost: 1.12, boostPitch: 1,
    whine: 0.62, harvest: 1, wind: 1, screech: 1, brakes: 1, shift: 1, rivals: 1, reverb: 1, overrun: 1,
  });
  const TUNE_RANGE = Object.freeze({
    pitch:      [0.60, 1.80], idle:  [0.50, 1.60], revRange: [0.20, 4.00], curve: [0.40, 2.50],
    detune:     [0, 4],       brightness: [0.30, 2.50], gravel: [0, 4],    sub: [0, 4],
    limiter:    [0, 3],       limRate: [0.40, 3.00], limPitch: [0, 4],
    boost:      [0, 4],       boostPitch: [0, 4],
    whine:      [0, 4],       harvest: [0, 4],     wind:     [0, 4],    screech: [0, 4],
    brakes:     [0, 4],       shift: [0, 3],       rivals:   [0, 4],    reverb:  [0, 4],   overrun: [0, 4],
  });

  const LAYER_DEF = Object.freeze({ whine: true, harvest: true, ers: true, wind: true, limiter: true, screech: true, sub: true, gravel: true, brakes: true, rivals: true, reverb: true, overrun: true });

  const SOUND_PROFILES = Object.freeze({
    team:      null,
    broadcast: { pitch: 1.02, detune: 0.9, revRange: 1.05, brightness: 1.18, whine: 1.30, sub: 0.80, limiter: 1.00, gravel: 0.60, brakes: 0.90, shift: 1.10, boost: 1.20, rivals: 1.20, wind: 0.80 },
    trackside: { pitch: 0.99, detune: 1.3, revRange: 1.00, brightness: 0.82, whine: 0.65, sub: 1.15, limiter: 0.85, idle: 0.95, gravel: 1.40, brakes: 1.20, shift: 0.90, wind: 1.40, screech: 1.30, rivals: 1.50, limPitch: 0.70 },
    cockpit:   { pitch: 1.00, detune: 1.0, revRange: 0.92, brightness: 0.68, whine: 0.85, sub: 1.60, limiter: 1.35, curve: 0.95, gravel: 1.30, brakes: 1.50, shift: 1.40, limPitch: 1.30, harvest: 1.20, wind: 0.70, boost: 1.10 },
    v10:       { pitch: 1.07, detune: 2.2, revRange: 1.60, brightness: 1.28, whine: 0.10, sub: 0.70, limiter: 1.15, idle: 0.85, curve: 1.25, gravel: 0.30, brakes: 0.80, shift: 1.20, limRate: 1.30, limPitch: 1.50, boost: 0.15, boostPitch: 0.50, harvest: 0.20 },
  });

  function patchTune(tune, patch) {
    if (patch) for (const k of Object.keys(TUNE_DEF)) {
      const v = patch[k];
      if (typeof v !== "number" || !isFinite(v)) continue;
      const [lo, hi] = TUNE_RANGE[k];
      tune[k] = Math.max(lo, Math.min(hi, v));
    }
  }
  function nameForTune(tune, profileName) {
    const fits = (name) => {
      if (!Object.prototype.hasOwnProperty.call(SOUND_PROFILES, name)) return false;
      const want = Object.assign({}, TUNE_DEF, SOUND_PROFILES[name] || {});
      return Object.keys(TUNE_DEF).every((k) => Math.abs(tune[k] - want[k]) < 1e-9);
    };
    if (fits(profileName)) return profileName;
    return Object.keys(SOUND_PROFILES).find(fits) || "custom";
  }

  return { ENGINE_VOICES, TUNE_DEF, TUNE_RANGE, LAYER_DEF, SOUND_PROFILES, patchTune, nameForTune };
})();
Object.freeze(GameAudioToneModel);
