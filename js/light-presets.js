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
  // Red Bull Ring, dusk + wet: the floodlights + wet-road mirror read too bright
  // against the low golden-hour sky here (reported in tuning). Dim the lamp
  // ceiling and lens glare a touch and pull the wet mirror back from a full
  // reflection. Conservative starting point — refine live in the panel.
  "redbull|dusk|wet":  { lampLevel: 0.20, glareStr: 0.08, ssrWetMul: 0.8 },
  "redbull|dusk|rain": { lampLevel: 0.20, glareStr: 0.08, ssrWetMul: 0.8 },
};
