"use strict";
// ── SHIPPED LIGHTING PROFILES ────────────────────────────────────────────────
// Per-condition lighting-tuner values baked into the game — the look everyone
// sees on the deployed build. Bake these from the in-game LIGHTING TUNER panel:
// tune under a condition, press COPY VALUES, and paste the exported object here
// (it replaces this whole literal). Keys are "trackId|timeOfDay|weather"; each
// value is a partial map of TUNE_DEFS ids → value (only non-default knobs).
//
//   window.LightPresets = {
//     "monaco|night|wet": { lampLevel: 0.34, ssrWetMul: 1.1, tint: 0.1 },
//     "*":                 { vibrance: 0.24 },   // optional global baseline
//   };
//
// Resolution order (later wins): TUNE_DEFS default → file "*" → file
// "track|tod|wx" → your localStorage global → your localStorage condition.
// So a player's live edits always override the shipped file (RESET clears the
// local edit and falls back to whatever is baked here). timeOfDay is one of
// dawn|day|dusk|night (the session "default" resolves to the track's day/night
// look); weather is dry|wet|rain|fog|overcast.
window.LightPresets = {
  "redbull|dusk|wet": {
    "lampLevel": 0.2,
    "glareStr": 0.08,
    "ssrWetMul": 0.8
  },
  "redbull|dusk|rain": {
    "lampLevel": 0.2,
    "glareStr": 0.08,
    "ssrWetMul": 0.8
  },
  "redbull|day|dry": {
    "keyMul": 1.55,
    "lampVolHaze": 0.9,
    "lampVolBase": 0.21,
    "lampFogHaze": 0.45,
    "glareStr": 0.64,
    "bleedMul": 1.6,
    "lampRadiusMul": 1.35,
    "glowAmp": 1.2,
    "threshOff": -0.14,
    "exposureMul": 1.02
  }
};
