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
  "*": {
    "carGloss": 0.35
  },
  "abudhabi|dawn|dry": {
    "sunElev": -20,
    "sunTemp": -0.35,
    "mistDensity": 1.4,
    "grMul": 1.3,
    "lampLevel": 0.18,
    "glowAmp": 2.1,
    "cityGlowMul": 0.6,
    "starBright": 0.3,
    "ambientMul": 0.95
  },
  "abudhabi|day|dry": {
    "keyMul": 1.25,
    "sunTemp": -0.4,
    "shadowTintAmt": 0.25,
    "tint": 0.15,
    "ambientMul": 1.05,
    "glareStr": 0.08
  },
  "abudhabi|day|overcast": {
    "keyMul": 0.85,
    "ambientMul": 1.2,
    "shadowStr": 0.65,
    "shadowTintAmt": 0.05,
    "cloudCover": 0.4,
    "tint": -0.05,
    "saturation": 0.95
  },
  "abudhabi|day|wet": {
    "keyMul": 1.2,
    "sunTemp": -0.35,
    "shadowTintAmt": 0.2,
    "ssrWetMul": 1.4,
    "wetDark": 1.15,
    "ambientMul": 1.05
  },
  "abudhabi|dusk|dry": {
    "sunElev": -15,
    "sunTemp": -0.6,
    "grMul": 1.5,
    "keyMul": 1.1,
    "lampLevel": 0.2,
    "glowAmp": 2.5,
    "cityGlowMul": 0.8,
    "tint": 0.1
  },
  "abudhabi|night|dry": {
    "lampLevel": 0.4,
    "poolEnergy": 0.7,
    "glowAmp": 2.8,
    "cityGlowMul": 1.4,
    "ambientMul": 0.75,
    "floodEmitMul": 1.4,
    "starBright": 0.75,
    "shadowStr": 0.65,
    "beamCone": 1.15
  },
  "abudhabi|night|fog": {
    "lampLevel": 0.35,
    "glowAmp": 2.2,
    "ambientMul": 0.7,
    "fogDensityMul": 2.3,
    "mistDensity": 1.8,
    "saturation": 0.75,
    "tint": -0.4,
    "starBright": 0.05
  },
  "abudhabi|night|overcast": {
    "lampLevel": 0.4,
    "glowAmp": 2.8,
    "cloudCover": 0.35,
    "starBright": 0.1,
    "moonBright": 0.4,
    "ambientMul": 0.8,
    "shadowStr": 0.55
  },
  "abudhabi|night|rain": {
    "lampLevel": 0.35,
    "poolEnergy": 0.65,
    "glowAmp": 2.4,
    "ambientMul": 0.6,
    "fogDensityMul": 1.6,
    "rainCount": 650,
    "lightning": 1.4,
    "tint": -0.35,
    "saturation": 0.85
  },
  "abudhabi|night|wet": {
    "lampLevel": 0.4,
    "poolEnergy": 0.75,
    "glowAmp": 2.8,
    "cityGlowMul": 1.4,
    "ambientMul": 0.8,
    "floodEmitMul": 1.4,
    "starBright": 0.75,
    "shadowStr": 0.6,
    "beamCone": 1.15,
    "ssrWetMul": 1.4,
    "wetDark": 1.2,
    "tint": -0.1
  },
  "albert_park|dawn|dry": {
    "sunTemp": -0.28,
    "sunElev": -11,
    "grMul": 1.35,
    "mistDensity": 1.45,
    "keyMul": 0.83,
    "ambTemp": -0.12,
    "mistHeight": 0.38,
    "shadowTintAmt": 0.08
  },
  "albert_park|day|dry": {
    "shadowTintAmt": 0.18,
    "tint": 0.04
  },
  "albert_park|day|fog": {
    "fogDensityMul": 1.85,
    "mistDensity": 1.82,
    "mistHeight": 0.42,
    "saturation": 0.76,
    "keyMul": 0.79,
    "shadowStr": 0.58,
    "tint": -0.18,
    "ambientMul": 1.12,
    "ambTemp": 0.12
  },
  "albert_park|day|overcast": {
    "keyMul": 0.78,
    "ambientMul": 1.16,
    "shadowStr": 0.84,
    "cloudCover": 0.22,
    "saturation": 0.91,
    "tint": -0.09,
    "ambTemp": 0.08
  },
  "albert_park|day|rain": {
    "keyMul": 0.8,
    "ambientMul": 1.1,
    "ssrWetMul": 1.22,
    "wetDark": 1.18,
    "fogDensityMul": 1.38,
    "mistDensity": 1.42,
    "saturation": 0.8,
    "tint": -0.22,
    "rainCount": 490,
    "lightning": 1.25
  },
  "albert_park|day|wet": {
    "ssrWetMul": 1.18,
    "wetDark": 1.12,
    "tint": -0.14,
    "mistDensity": 1.22,
    "contactStr": 1.06,
    "surfDetail": 1.1
  },
  "albert_park|dusk|dry": {
    "sunTemp": -0.38,
    "grMul": 1.52,
    "saturation": 1.12,
    "tint": 0.18,
    "ambTemp": -0.14,
    "glowAmp": 2.45,
    "lampLevel": 0.33,
    "bloomMul": 1.15
  },
  "albert_park|night|dry": {
    "keyMul": 0.09,
    "ambientMul": 0.41,
    "moonBright": 0.88,
    "lampLevel": 0.29,
    "poolEnergy": 0.59,
    "lampRadiusMul": 1.08,
    "glowAmp": 2.42,
    "cityGlowMul": 1.42,
    "starBright": 1.12,
    "shadowStr": 0.34,
    "lampTemp": -0.18
  },
  "albert_park|night|overcast": {
    "keyMul": 0.05,
    "ambientMul": 0.36,
    "moonBright": 0.32,
    "lampLevel": 0.33,
    "poolEnergy": 0.64,
    "lampRadiusMul": 1.12,
    "glowAmp": 2.65,
    "cityGlowMul": 1.82,
    "starBright": 0.12,
    "fogDensityMul": 1.18,
    "mistDensity": 1.2,
    "mistHeight": 0.36
  },
  "bahrain|dawn|dry": {
    "sunElev": -12,
    "sunTemp": -0.3,
    "keyMul": 0.85,
    "grMul": 1.8,
    "mistDensity": 1.4,
    "ambTemp": -0.25,
    "shadowStr": 0.85,
    "bloomMul": 1.3
  },
  "bahrain|day|dry": {
    "keyMul": 1.35,
    "sunElev": 6,
    "shadowTintAmt": 0.2,
    "tint": 0.25,
    "sunTemp": -0.2,
    "ambientMul": 0.75,
    "contrast": 1.2,
    "grMul": 0.3
  },
  "bahrain|dusk|dry": {
    "sunElev": -10,
    "sunTemp": -0.35,
    "keyMul": 0.9,
    "grMul": 2,
    "glowAmp": 2.9,
    "lampLevel": 0.28,
    "tint": 0.2,
    "saturation": 1.15,
    "bloomMul": 1.4
  },
  "bahrain|night|dry": {
    "lampLevel": 0.4,
    "poolEnergy": 0.68,
    "keyMul": 0.55,
    "starBright": 1.5,
    "glowAmp": 3,
    "tint": 0.15,
    "fogTint": 0.15,
    "bleedMul": 1.2,
    "shadowStr": 0.95
  },
  "bahrain|night|fog": {
    "fogDensityMul": 1.9,
    "mistDensity": 1.4,
    "fogTint": 0.3,
    "saturation": 0.82,
    "lampFogHaze": 1.3,
    "exposureMul": 0.88,
    "contrast": 1.25
  },
  "bahrain|night|overcast": {
    "cloudCover": 0.3,
    "ambientMul": 1.4,
    "keyMul": 0.48,
    "shadowStr": 0.65,
    "tint": -0.15,
    "pcssPen": 120,
    "glowAmp": 2.5
  },
  "bahrain|night|rain": {
    "rainCount": 500,
    "lightning": 1.6,
    "fogDensityMul": 1.4,
    "tint": -0.25,
    "saturation": 0.85,
    "lampVolHaze": 1,
    "exposureMul": 0.92
  },
  "bahrain|night|wet": {
    "ssrWetMul": 1.35,
    "wetDark": 1.2,
    "roadRough": 0.85,
    "tint": -0.05,
    "bloomMul": 1.3,
    "shadowStr": 0.88,
    "exposureMul": 0.96
  },
  "baku|dawn|dry": {
    "sunTemp": -0.4,
    "sunElev": -30,
    "grMul": 1.8,
    "mistDensity": 1.5,
    "ambientMul": 1.2,
    "tint": 0.3,
    "lampLevel": 0.18,
    "glowAmp": 1.8,
    "cityGlowMul": 0.5,
    "starBright": 0.5
  },
  "baku|day|dry": {
    "keyMul": 1.25,
    "sunTemp": -0.15,
    "sunElev": 30,
    "shadowTintAmt": 0.4,
    "ambientMul": 1.05,
    "cityGlowMul": 0.3,
    "tint": 0.2,
    "contrast": 1.2
  },
  "baku|dusk|dry": {
    "sunTemp": -0.3,
    "sunElev": -20,
    "grMul": 1.6,
    "lampLevel": 0.28,
    "glowAmp": 2.6,
    "ambientMul": 1.15,
    "tint": 0.15,
    "mistDensity": 1.2
  },
  "baku|night|dry": {
    "cityGlowMul": 1.5,
    "glowAmp": 2.8,
    "floodEmitMul": 1.2,
    "lampTemp": -0.5,
    "starBright": 0.3,
    "tint": 0.2,
    "ambientMul": 1.1
  },
  "baku|night|fog": {
    "fogDensityMul": 2.2,
    "mistDensity": 1.8,
    "tint": -0.4,
    "saturation": 0.75,
    "lampVolHaze": 1.2,
    "lampFogHaze": 1,
    "exposureMul": 0.92,
    "starBright": 0,
    "glowAmp": 2.5
  },
  "baku|night|overcast": {
    "cloudCover": 0.3,
    "keyMul": 0.85,
    "ambientMul": 1.2,
    "shadowStr": 0.8,
    "tint": -0.2,
    "saturation": 0.92,
    "lampLevel": 0.28
  },
  "baku|night|rain": {
    "ssrWetMul": 1.2,
    "fogDensityMul": 1.8,
    "lightning": 1.3,
    "rainCount": 450,
    "rainWind": 0.35,
    "tint": -0.5,
    "saturation": 0.8,
    "exposureMul": 0.95,
    "glowAmp": 2.4,
    "starBright": 0
  },
  "baku|night|wet": {
    "ssrWetMul": 1.3,
    "wetDark": 1.15,
    "tint": -0.3,
    "fogDensityMul": 1.1,
    "glowAmp": 2.6,
    "cityGlowMul": 1.2,
    "lampVolHaze": 0.8,
    "lampFogHaze": 0.7
  },
  "cota|dawn|dry": {
    "sunTemp": -0.35,
    "sunElev": -8,
    "keyMul": 0.85,
    "grMul": 1.6,
    "mistDensity": 1.8,
    "ambientMul": 1.12,
    "tint": 0.2,
    "exposureMul": 1.08
  },
  "cota|dawn|fog": {
    "fogDensityMul": 2,
    "mistDensity": 2.3,
    "keyMul": 0.7,
    "saturation": 0.8,
    "tint": -0.3,
    "ambientMul": 1.1,
    "grMul": 0.7
  },
  "cota|dawn|rain": {
    "sunTemp": -0.15,
    "keyMul": 0.75,
    "mistDensity": 2.2,
    "fogDensityMul": 1.6,
    "rainCount": 500,
    "grMul": 0.9,
    "tint": -0.2,
    "saturation": 0.88
  },
  "cota|dawn|wet": {
    "sunTemp": -0.3,
    "grMul": 1.5,
    "mistDensity": 2,
    "ssrWetMul": 1.25,
    "fogDensityMul": 1.15,
    "tint": 0.12,
    "keyMul": 0.8
  },
  "cota|day|dry": {
    "shadowTintAmt": 0.15,
    "tint": 0.08,
    "contrast": 1.18,
    "saturation": 1.02
  },
  "cota|day|fog": {
    "keyMul": 0.78,
    "fogDensityMul": 1.75,
    "mistDensity": 2.1,
    "saturation": 0.82,
    "tint": -0.28,
    "shadowStr": 0.8
  },
  "cota|day|overcast": {
    "keyMul": 0.82,
    "ambientMul": 1.15,
    "cloudCover": 0.3,
    "shadowStr": 0.75,
    "tint": -0.12,
    "saturation": 0.96
  },
  "cota|day|rain": {
    "keyMul": 0.88,
    "ssrWetMul": 1.4,
    "wetDark": 1.18,
    "fogDensityMul": 1.4,
    "rainCount": 450,
    "tint": -0.25,
    "saturation": 0.87,
    "contrast": 1.08
  },
  "cota|day|wet": {
    "ssrWetMul": 1.35,
    "wetDark": 1.15,
    "tint": -0.18,
    "saturation": 0.93,
    "ambientMul": 1.08
  },
  "cota|dusk|dry": {
    "sunTemp": -0.45,
    "sunElev": -15,
    "keyMul": 0.9,
    "grMul": 1.4,
    "tint": 0.25,
    "lampLevel": 0.35,
    "poolEnergy": 0.7,
    "bloomMul": 1.15,
    "exposureMul": 1.05
  },
  "cota|dusk|fog": {
    "sunTemp": -0.35,
    "fogDensityMul": 1.85,
    "mistDensity": 2,
    "keyMul": 0.75,
    "tint": -0.15,
    "saturation": 0.85,
    "lampLevel": 0.36,
    "bloomMul": 1.12
  },
  "cota|dusk|rain": {
    "sunTemp": -0.25,
    "keyMul": 0.82,
    "ssrWetMul": 1.38,
    "fogDensityMul": 1.35,
    "rainCount": 420,
    "tint": -0.1,
    "lampLevel": 0.38,
    "bloomMul": 1.08
  },
  "cota|dusk|wet": {
    "sunTemp": -0.4,
    "sunElev": -12,
    "ssrWetMul": 1.3,
    "wetDark": 1.1,
    "tint": 0.2,
    "lampLevel": 0.32,
    "poolEnergy": 0.68,
    "ambientMul": 1.05
  },
  "cota|night|dry": {
    "glowAmp": 1.4,
    "floodEmitMul": 1.25,
    "cityGlowMul": 1.55,
    "lampLevel": 0.38,
    "poolEnergy": 0.75,
    "bloomMul": 1.2,
    "glareStr": 0.18,
    "tint": -0.22,
    "moonBright": 1.15,
    "starBright": 0.65,
    "ambientMul": 0.85
  },
  "cota|night|fog": {
    "fogDensityMul": 2,
    "mistDensity": 2,
    "lampVolHaze": 1,
    "glowAmp": 1.25,
    "floodEmitMul": 1.15,
    "lampLevel": 0.4,
    "cityGlowMul": 1.2,
    "tint": -0.28,
    "starBright": 0.1,
    "ambientMul": 0.8
  },
  "cota|night|overcast": {
    "moonBright": 0.2,
    "starBright": 0.1,
    "cloudCover": 0.35,
    "glowAmp": 1.38,
    "lampLevel": 0.4,
    "poolEnergy": 0.76,
    "ambientMul": 0.78,
    "tint": -0.25,
    "bloomMul": 1.18
  },
  "cota|night|rain": {
    "fogDensityMul": 1.65,
    "rainCount": 700,
    "lightning": 1.8,
    "glowAmp": 1.35,
    "lampLevel": 0.45,
    "ssrWetMul": 1.5,
    "tint": -0.3,
    "ambientMul": 0.7,
    "starBright": 0.2,
    "bloomMul": 1.15
  },
  "cota|night|wet": {
    "glowAmp": 1.5,
    "floodEmitMul": 1.3,
    "cityGlowMul": 1.6,
    "ssrWetMul": 1.45,
    "lampLevel": 0.42,
    "poolEnergy": 0.8,
    "bloomMul": 1.3,
    "tint": -0.25,
    "starBright": 0.55
  },
  "hungaroring|dawn|dry": {
    "sunTemp": -0.25,
    "sunElev": -22,
    "grMul": 1.5,
    "mistDensity": 1.3,
    "ambTemp": 0.05,
    "ambientMul": 1.1,
    "tint": -0.08,
    "exposureMul": 0.96
  },
  "hungaroring|day|dry": {
    "shadowTintAmt": 0.12,
    "saturation": 1.06,
    "tint": -0.02
  },
  "hungaroring|day|fog": {
    "fogDensityMul": 2.4,
    "mistDensity": 1.8,
    "keyMul": 0.8,
    "tint": -0.25,
    "saturation": 0.85,
    "shadowStr": 0.5,
    "ambientMul": 1.2,
    "fogTint": -0.15
  },
  "hungaroring|day|overcast": {
    "keyMul": 0.85,
    "shadowStr": 0.55,
    "ambientMul": 1.3,
    "cloudCover": 0.25,
    "tint": -0.1,
    "saturation": 0.98,
    "contrast": 1.05
  },
  "hungaroring|day|rain": {
    "keyMul": 0.7,
    "fogDensityMul": 1.8,
    "rainCount": 600,
    "lightning": 1.6,
    "tint": -0.25,
    "saturation": 0.82,
    "ambientMul": 0.95,
    "exposureMul": 0.9
  },
  "hungaroring|day|wet": {
    "ssrWetMul": 1.2,
    "wetDark": 1.05,
    "keyMul": 0.9,
    "tint": -0.15,
    "saturation": 0.95,
    "shadowStr": 0.95
  },
  "hungaroring|dusk|dry": {
    "sunTemp": -0.35,
    "sunElev": -18,
    "grMul": 1.7,
    "ambTemp": -0.15,
    "exposureMul": 1.08,
    "tint": 0.12,
    "lampLevel": 0.18,
    "glowAmp": 2.4
  },
  "hungaroring|night|dry": {
    "keyMul": 0.5,
    "shadowStr": 0.6,
    "ambientMul": 1.25,
    "lampLevel": 0.38,
    "poolEnergy": 0.72,
    "glowAmp": 2.7,
    "floodEmitMul": 1.15,
    "starBright": 0.6,
    "cityGlowMul": 0.7,
    "lampTemp": 0.1
  },
  "hungaroring|night|rain": {
    "keyMul": 0.38,
    "fogDensityMul": 2.1,
    "rainCount": 680,
    "lightning": 1.7,
    "lampLevel": 0.48,
    "glowAmp": 3,
    "floodEmitMul": 1.25,
    "ambientMul": 1.15,
    "tint": -0.2,
    "starBright": 0.3
  },
  "hungaroring|night|wet": {
    "keyMul": 0.45,
    "ssrWetMul": 1.28,
    "lampLevel": 0.42,
    "poolEnergy": 0.75,
    "glowAmp": 2.8,
    "floodEmitMul": 1.2,
    "ambientMul": 1.3,
    "tint": -0.12,
    "starBright": 0.5
  },
  "imola|dawn|dry": {
    "sunElev": -10,
    "sunTemp": -0.3,
    "grMul": 1.6,
    "mistDensity": 1.6,
    "ambientMul": 0.95,
    "keyMul": 0.95,
    "exposureMul": 1.05
  },
  "imola|dawn|wet": {
    "sunElev": -10,
    "sunTemp": -0.28,
    "grMul": 1.7,
    "mistDensity": 2,
    "ssrWetMul": 1.2,
    "wetDark": 1.05,
    "keyMul": 0.93
  },
  "imola|day|dry": {
    "shadowTintAmt": 0.25,
    "sunTemp": -0.1
  },
  "imola|day|fog": {
    "fogDensityMul": 2.8,
    "mistDensity": 2.2,
    "tint": -0.25,
    "saturation": 0.75,
    "keyMul": 0.8,
    "shadowStr": 0.65,
    "ambientMul": 1.25,
    "exposureMul": 1.18
  },
  "imola|day|overcast": {
    "keyMul": 0.82,
    "cloudCover": 0.35,
    "ambientMul": 1.2,
    "shadowStr": 0.75,
    "tint": -0.12
  },
  "imola|day|rain": {
    "fogDensityMul": 1.6,
    "rainCount": 550,
    "tint": -0.3,
    "saturation": 0.9,
    "keyMul": 0.8,
    "ambientMul": 1.1,
    "cloudCover": 0.4,
    "ssrWetMul": 1.3,
    "wetDark": 1.2,
    "lightning": 1.5
  },
  "imola|day|wet": {
    "ssrWetMul": 1.25,
    "wetDark": 1.1,
    "tint": -0.15,
    "cloudCover": 0.2,
    "keyMul": 0.95
  },
  "imola|dusk|dry": {
    "sunElev": -12,
    "sunTemp": -0.25,
    "grMul": 1.5,
    "lampLevel": 0.38,
    "poolEnergy": 0.65,
    "glowAmp": 2.6,
    "floodEmitMul": 1.2,
    "keyMul": 0.87,
    "exposureMul": 1.08
  },
  "imola|dusk|overcast": {
    "sunElev": -12,
    "sunTemp": -0.12,
    "keyMul": 0.72,
    "cloudCover": 0.38,
    "lampLevel": 0.4,
    "ambientMul": 1.15,
    "shadowStr": 0.7,
    "exposureMul": 1.12
  },
  "imola|dusk|wet": {
    "sunElev": -12,
    "sunTemp": -0.26,
    "grMul": 1.6,
    "lampLevel": 0.4,
    "poolEnergy": 0.68,
    "glowAmp": 2.7,
    "ssrWetMul": 1.35,
    "wetDark": 1.1,
    "keyMul": 0.85,
    "exposureMul": 1.1
  },
  "imola|night|dry": {
    "ambientMul": 0.55,
    "keyMul": 0.35,
    "moonBright": 1.1,
    "lampLevel": 0.45,
    "poolEnergy": 0.75,
    "glowAmp": 3.2,
    "floodEmitMul": 1.4,
    "starBright": 1.4,
    "lampTemp": -0.15,
    "bleedMul": 1.3,
    "exposureMul": 1.18
  },
  "imola|night|fog": {
    "fogDensityMul": 2.9,
    "mistDensity": 2.3,
    "lampVolHaze": 1.5,
    "lampFogHaze": 1.5,
    "lampLevel": 0.55,
    "poolEnergy": 0.85,
    "glowAmp": 3.7,
    "exposureMul": 1.35,
    "ambientMul": 0.75,
    "shadowStr": 0.75,
    "tint": -0.15,
    "saturation": 0.8
  },
  "imola|night|overcast": {
    "cloudCover": 0.42,
    "starBright": 0.6,
    "lampLevel": 0.5,
    "poolEnergy": 0.8,
    "glowAmp": 3.4,
    "ambientMul": 0.65,
    "exposureMul": 1.22,
    "bleedMul": 1.5,
    "keyMul": 0.36
  },
  "imola|night|rain": {
    "fogDensityMul": 2.2,
    "rainCount": 700,
    "lampVolHaze": 1.4,
    "lampFogHaze": 1.5,
    "glowAmp": 3.3,
    "floodEmitMul": 1.6,
    "keyMul": 0.37,
    "ambientMul": 0.65,
    "exposureMul": 1.3,
    "lightning": 2.2,
    "ssrWetMul": 1.4,
    "cloudCover": 0.45
  },
  "imola|night|wet": {
    "ssrWetMul": 1.5,
    "wetDark": 1.15,
    "lampLevel": 0.48,
    "poolEnergy": 0.8,
    "glowAmp": 3.4,
    "ambientMul": 0.58,
    "keyMul": 0.38,
    "exposureMul": 1.25,
    "bleedMul": 1.35,
    "cloudCover": 0.15
  },
  "interlagos|dawn|dry": {
    "sunTemp": -0.22,
    "grMul": 1.5,
    "mistDensity": 1.6,
    "keyMul": 0.95,
    "sunElev": -8
  },
  "interlagos|dawn|wet": {
    "sunTemp": -0.18,
    "ssrWetMul": 1.2,
    "grMul": 1.3,
    "mistDensity": 1.4,
    "keyMul": 0.92
  },
  "interlagos|day|dry": {
    "sunTemp": -0.08,
    "shadowTintAmt": 0.18,
    "saturation": 1.08
  },
  "interlagos|day|fog": {
    "fogDensityMul": 1.9,
    "saturation": 0.82,
    "tint": -0.15,
    "keyMul": 0.88,
    "shadowStr": 0.65
  },
  "interlagos|day|overcast": {
    "keyMul": 0.78,
    "ambientMul": 1.25,
    "shadowStr": 0.72,
    "cloudCover": 0.32,
    "tint": -0.08
  },
  "interlagos|day|rain": {
    "ssrWetMul": 1.25,
    "wetDark": 1.2,
    "fogDensityMul": 1.3,
    "rainCount": 480,
    "tint": -0.18,
    "keyMul": 0.82
  },
  "interlagos|day|wet": {
    "ssrWetMul": 1.15,
    "wetDark": 1.1,
    "tint": -0.12,
    "keyMul": 0.92
  },
  "interlagos|dusk|dry": {
    "sunTemp": -0.28,
    "grMul": 1.7,
    "keyMul": 1.08,
    "exposureMul": 1.04,
    "sunElev": -12
  },
  "interlagos|dusk|overcast": {
    "sunTemp": -0.12,
    "keyMul": 0.75,
    "ambientMul": 1.2,
    "cloudCover": 0.28,
    "shadowStr": 0.7
  },
  "interlagos|dusk|wet": {
    "sunTemp": -0.22,
    "ssrWetMul": 1.2,
    "grMul": 1.4,
    "keyMul": 0.98,
    "mistDensity": 1.1
  },
  "interlagos|night|dry": {
    "keyMul": 0.45,
    "shadowStr": 0.6,
    "ambientMul": 1.15,
    "lampLevel": 0.36,
    "poolEnergy": 0.7,
    "glowAmp": 2.6,
    "floodEmitMul": 1.12,
    "starBright": 0.5,
    "cityGlowMul": 1.15,
    "lampTemp": 0.12
  },
  "jeddah|dawn|dry": {
    "keyMul": 0.75,
    "sunTemp": -0.35,
    "sunElev": -20,
    "grMul": 1.85,
    "ambientMul": 1.2,
    "ambTemp": -0.1,
    "lampLevel": 0.2,
    "floodEmitMul": 0.3,
    "cityGlowMul": 0.3,
    "mistDensity": 1.5,
    "starBright": 0.4,
    "tint": 0.1,
    "shadowStr": 0.85,
    "exposureMul": 0.95
  },
  "jeddah|day|dry": {
    "keyMul": 1.5,
    "sunTemp": -0.3,
    "sunElev": 35,
    "shadowTintAmt": 0.25,
    "ambientMul": 0.8,
    "lampLevel": 0.1,
    "floodEmitMul": 0.2,
    "cityGlowMul": 0,
    "glowAmp": 1.5,
    "starBright": 0,
    "tint": 0.2,
    "contrast": 1.15,
    "cloudCover": -0.2
  },
  "jeddah|day|wet": {
    "keyMul": 1.4,
    "sunTemp": -0.2,
    "sunElev": 35,
    "ambientMul": 0.85,
    "ssrWetMul": 1.25,
    "wetDark": 1.1,
    "floodEmitMul": 0.2,
    "cityGlowMul": 0,
    "glowAmp": 1.5,
    "tint": 0.1
  },
  "jeddah|dusk|dry": {
    "keyMul": 1.05,
    "sunTemp": -0.5,
    "sunElev": -15,
    "grMul": 1.8,
    "ambientMul": 1.1,
    "ambTemp": -0.2,
    "lampLevel": 0.3,
    "lampTemp": -0.3,
    "floodEmitMul": 0.9,
    "glowAmp": 2.7,
    "cityGlowMul": 0.7,
    "starBright": 0.2,
    "tint": 0.3,
    "flareMul": 1.15
  },
  "jeddah|dusk|wet": {
    "sunTemp": -0.45,
    "sunElev": -15,
    "grMul": 1.7,
    "ambientMul": 1.15,
    "ambTemp": -0.1,
    "lampLevel": 0.28,
    "lampTemp": -0.25,
    "floodEmitMul": 0.85,
    "glowAmp": 2.6,
    "cityGlowMul": 0.65,
    "starBright": 0.15,
    "ssrWetMul": 1.2,
    "wetDark": 1.05,
    "tint": 0.25
  },
  "jeddah|night|dry": {
    "keyMul": 0.9,
    "sunElev": -10,
    "moonBright": 0.6,
    "lampLevel": 0.35,
    "poolEnergy": 0.65,
    "lampTemp": -0.2,
    "floodEmitMul": 1.3,
    "glowAmp": 3,
    "cityGlowMul": 1.4,
    "bloomMul": 1.2,
    "starBright": 0.4,
    "ambientMul": 1.1,
    "tint": 0.15
  },
  "jeddah|night|fog": {
    "keyMul": 0.75,
    "moonBright": 0.45,
    "fogDensityMul": 1.8,
    "mistDensity": 1.3,
    "lampVolHaze": 1.3,
    "saturation": 0.85,
    "ambTemp": 0.2,
    "tint": -0.15
  },
  "jeddah|night|rain": {
    "keyMul": 0.7,
    "moonBright": 0.35,
    "fogDensityMul": 1.6,
    "lampVolHaze": 1.2,
    "ssrWetMul": 1.4,
    "wetDark": 1.2,
    "rainCount": 480,
    "lightning": 1.2,
    "saturation": 0.9,
    "ambTemp": 0.25,
    "tint": -0.25
  },
  "jeddah|night|wet": {
    "ssrWetMul": 1.3,
    "wetDark": 1.15,
    "lampVolHaze": 0.85,
    "ambTemp": 0.15,
    "tint": -0.1
  },
  "madrid|dawn|dry": {
    "sunTemp": -0.4,
    "sunElev": -18,
    "grMul": 1.6,
    "mistDensity": 1.5,
    "tint": 0.25,
    "exposureMul": 1.08,
    "shadowTintAmt": 0.08
  },
  "madrid|day|dry": {
    "shadowTintAmt": 0.15,
    "tint": -0.08,
    "contrast": 1.16,
    "vignette": 0.78
  },
  "madrid|day|overcast": {
    "keyMul": 0.88,
    "ambientMul": 1.2,
    "shadowStr": 0.75,
    "cloudCover": 0.35,
    "saturation": 0.92,
    "contrast": 1.08,
    "shadowTintAmt": 0.05
  },
  "madrid|dusk|dry": {
    "sunTemp": -0.5,
    "sunElev": -12,
    "grMul": 1.8,
    "floodEmitMul": 1.15,
    "glowAmp": 2.8,
    "lampLevel": 0.35,
    "tint": 0.3,
    "exposureMul": 1.05,
    "mistDensity": 0.8
  },
  "madrid|night|dry": {
    "ambientMul": 0.75,
    "cityGlowMul": 1.8,
    "glowAmp": 3,
    "floodEmitMul": 1.25,
    "lampLevel": 0.48,
    "poolEnergy": 0.7,
    "starBright": 0.5,
    "bloomMul": 1.35,
    "tint": 0.12,
    "exposureMul": 0.95
  },
  "madrid|night|overcast": {
    "ambientMul": 0.8,
    "cityGlowMul": 2,
    "glowAmp": 2.9,
    "floodEmitMul": 1.2,
    "lampLevel": 0.45,
    "cloudCover": 0.4,
    "starBright": 0.3,
    "bloomMul": 1.25
  },
  "mexico|dawn|dry": {
    "sunTemp": -0.2,
    "sunElev": -18,
    "grMul": 1.3,
    "mistDensity": 1.3,
    "saturation": 0.9,
    "tint": 0.01
  },
  "mexico|day|dry": {
    "keyMul": 1.15,
    "shadowTintAmt": 0.25,
    "saturation": 1.1
  },
  "mexico|day|fog": {
    "fogDensityMul": 2,
    "mistDensity": 1.5,
    "saturation": 0.75,
    "exposureMul": 0.9
  },
  "mexico|day|overcast": {
    "keyMul": 0.8,
    "ambientMul": 1.15,
    "shadowStr": 0.65,
    "saturation": 0.85
  },
  "mexico|day|rain": {
    "ssrWetMul": 1.25,
    "rainCount": 600,
    "tint": -0.2,
    "exposureMul": 0.92,
    "fogDensityMul": 1.3
  },
  "mexico|day|wet": {
    "ssrWetMul": 1.2,
    "wetDark": 1.1,
    "tint": -0.15,
    "exposureMul": 0.95
  },
  "mexico|dusk|dry": {
    "sunTemp": -0.3,
    "sunElev": -12,
    "grMul": 1.6,
    "tint": 0.2,
    "saturation": 1.1,
    "lampLevel": 0.18,
    "ambientMul": 1.1
  },
  "mexico|night|dry": {
    "ambientMul": 0.65,
    "cityGlowMul": 1.6,
    "glowAmp": 2.6,
    "lampLevel": 0.35,
    "starBright": 0.5,
    "floodEmitMul": 1.2,
    "tint": 0.12
  },
  "mexico|night|fog": {
    "fogDensityMul": 1.9,
    "mistDensity": 1.4,
    "ambientMul": 0.75,
    "cityGlowMul": 1.3,
    "lampLevel": 0.4,
    "bloomMul": 1.45,
    "glowAmp": 2.5
  },
  "mexico|night|rain": {
    "ambientMul": 0.7,
    "rainCount": 650,
    "lightning": 1.7,
    "glowAmp": 2.9,
    "ssrWetMul": 1.2,
    "bloomMul": 1.4,
    "tint": 0.05
  },
  "miami|dawn|dry": {
    "sunTemp": 0.2,
    "grMul": 1.45,
    "sunElev": -24,
    "mistDensity": 1.3,
    "lampLevel": 0.34,
    "tint": 0.1,
    "bloomMul": 1.1
  },
  "miami|day|dry": {
    "shadowTintAmt": 0.25,
    "tint": 0.12,
    "saturation": 1.08
  },
  "miami|day|fog": {
    "fogDensityMul": 2,
    "mistDensity": 1.4,
    "fogTint": -0.1,
    "keyMul": 0.8,
    "shadowStr": 0.65,
    "saturation": 0.9,
    "tint": -0.1,
    "exposureMul": 1.05
  },
  "miami|day|overcast": {
    "keyMul": 0.75,
    "ambientMul": 1.25,
    "cloudCover": 0.25,
    "shadowStr": 0.65,
    "shadowTintAmt": 0.1,
    "tint": -0.08,
    "saturation": 0.95,
    "contrast": 1
  },
  "miami|day|rain": {
    "fogDensityMul": 1.4,
    "rainCount": 550,
    "rainWind": 0.25,
    "lightning": 1.4,
    "keyMul": 0.7,
    "tint": -0.15,
    "ssrWetMul": 1.3,
    "wetDark": 1.15,
    "saturation": 0.9,
    "exposureMul": 0.92
  },
  "miami|day|wet": {
    "ssrWetMul": 1.25,
    "wetDark": 1.1,
    "tint": -0.05,
    "keyMul": 0.95,
    "cloudCover": 0.15
  },
  "miami|dusk|dry": {
    "sunElev": -10,
    "sunTemp": -0.35,
    "floodEmitMul": 1.1,
    "glowAmp": 2.6,
    "lampLevel": 0.33,
    "keyMul": 0.95,
    "grMul": 1.6,
    "tint": 0.22,
    "bloomMul": 1.15
  },
  "miami|dusk|fog": {
    "sunElev": -8,
    "sunTemp": -0.3,
    "fogDensityMul": 1.8,
    "mistDensity": 1.3,
    "fogTint": -0.08,
    "floodEmitMul": 1.15,
    "glowAmp": 2.7,
    "lampLevel": 0.32,
    "keyMul": 0.75,
    "shadowStr": 0.65,
    "tint": 0.2,
    "saturation": 0.9,
    "grMul": 1.5
  },
  "miami|dusk|rain": {
    "sunElev": -8,
    "sunTemp": -0.3,
    "rainCount": 480,
    "rainWind": 0.2,
    "lightning": 1.5,
    "fogDensityMul": 1.3,
    "keyMul": 0.6,
    "tint": 0.1,
    "ssrWetMul": 1.25,
    "wetDark": 1.12,
    "glowAmp": 2.6,
    "floodEmitMul": 1.1,
    "lampLevel": 0.3,
    "saturation": 0.9,
    "grMul": 1.5
  },
  "miami|dusk|wet": {
    "sunElev": -8,
    "sunTemp": -0.35,
    "ssrWetMul": 1.25,
    "wetDark": 1.1,
    "floodEmitMul": 1.15,
    "glowAmp": 2.7,
    "lampLevel": 0.33,
    "keyMul": 0.8,
    "tint": 0.25,
    "bloomMul": 1.25,
    "grMul": 1.6
  },
  "miami|night|dry": {
    "cityGlowMul": 1.1,
    "glowAmp": 2.45,
    "floodEmitMul": 1.15,
    "lampLevel": 0.4,
    "lampTemp": -0.1,
    "starBright": 0.45,
    "bloomMul": 1.05,
    "tint": 0.1
  },
  "miami|night|fog": {
    "fogDensityMul": 1.9,
    "mistDensity": 1.3,
    "fogTint": -0.05,
    "keyMul": 0.25,
    "moonBright": 0.8,
    "floodEmitMul": 1.25,
    "glowAmp": 2.85,
    "cityGlowMul": 2.2,
    "lampLevel": 0.4,
    "poolEnergy": 0.61,
    "lampFogBase": 0.6,
    "lampVolHaze": 0.75,
    "starBright": 0.2,
    "shadowStr": 0.55,
    "saturation": 0.9
  },
  "miami|night|rain": {
    "rainCount": 650,
    "rainWind": 0.3,
    "lightning": 1.8,
    "fogDensityMul": 1.6,
    "keyMul": 0.22,
    "moonBright": 0.6,
    "floodEmitMul": 1.2,
    "glowAmp": 2.7,
    "cityGlowMul": 1.5,
    "lampLevel": 0.4,
    "poolEnergy": 0.62,
    "starBright": 0.15,
    "exposureMul": 0.9,
    "ssrWetMul": 1.25,
    "saturation": 0.85,
    "shadowStr": 0.5
  },
  "miami|night|wet": {
    "ssrWetMul": 1.3,
    "wetDark": 1.15,
    "keyMul": 0.28,
    "floodEmitMul": 1.25,
    "glowAmp": 2.85,
    "cityGlowMul": 1.7,
    "lampLevel": 0.37,
    "poolEnergy": 0.59,
    "roadRough": 0.92,
    "bloomMul": 1.45
  },
  "monaco|dawn|dry": {
    "sunTemp": -0.28,
    "grMul": 1.6,
    "mistDensity": 1.4,
    "keyMul": 0.82,
    "ambientMul": 1.15,
    "tint": -0.15,
    "saturation": 1.12
  },
  "monaco|day|dry": {
    "shadowTintAmt": 0.12,
    "tint": -0.08,
    "saturation": 1.05
  },
  "monaco|day|fog": {
    "fogDensityMul": 2.1,
    "mistDensity": 1.6,
    "mistHeight": 0.45,
    "tint": -0.2,
    "saturation": 0.8,
    "keyMul": 0.82,
    "shadowStr": 0.75
  },
  "monaco|day|overcast": {
    "keyMul": 0.78,
    "ambientMul": 1.35,
    "cloudCover": 0.25,
    "shadowStr": 0.72,
    "tint": -0.1,
    "saturation": 0.92
  },
  "monaco|day|rain": {
    "fogDensityMul": 1.6,
    "rainCount": 500,
    "keyMul": 0.75,
    "tint": -0.25,
    "saturation": 0.78,
    "ssrWetMul": 1.3,
    "wetDark": 1.2,
    "lightning": 1.3
  },
  "monaco|day|wet": {
    "ssrWetMul": 1.25,
    "wetDark": 1.2,
    "tint": -0.15,
    "fogDensityMul": 1.15,
    "keyMul": 0.88,
    "saturation": 0.88
  },
  "monaco|dusk|dry": {
    "sunTemp": -0.25,
    "grMul": 1.7,
    "keyMul": 1.1,
    "lampLevel": 0.38,
    "glowAmp": 2.75,
    "floodEmitMul": 1.25,
    "saturation": 1.18,
    "tint": -0.18,
    "bloomMul": 1.25
  },
  "monaco|night|dry": {
    "keyMul": 0.12,
    "lampLevel": 0.42,
    "poolEnergy": 0.75,
    "glowAmp": 3,
    "floodEmitMul": 1.4,
    "cityGlowMul": 1.7,
    "starBright": 0.4,
    "moonBright": 0.7,
    "tint": 0.12,
    "saturation": 1.1
  },
  "monaco|night|fog": {
    "fogDensityMul": 2.6,
    "mistDensity": 1.9,
    "lampLevel": 0.47,
    "lampVolHaze": 1.4,
    "glowAmp": 3.1,
    "lampFogHaze": 1.3,
    "starBright": 0.25,
    "keyMul": 0.1,
    "saturation": 0.82
  },
  "monaco|night|rain": {
    "fogDensityMul": 1.9,
    "rainCount": 600,
    "lampLevel": 0.4,
    "lampVolHaze": 1.1,
    "glowAmp": 3,
    "lightning": 1.7,
    "keyMul": 0.08,
    "saturation": 0.87,
    "bloomSpread": 1.35
  },
  "monaco|night|wet": {
    "ssrWetMul": 1.45,
    "wetDark": 1.2,
    "lampLevel": 0.44,
    "glowAmp": 3.15,
    "floodEmitMul": 1.5,
    "bloomMul": 1.4,
    "fogDensityMul": 1.2,
    "saturation": 1.15
  },
  "montreal|dawn|dry": {
    "sunTemp": -0.6,
    "grMul": 1.8,
    "sunElev": -15,
    "keyMul": 0.8,
    "ambientMul": 1.1,
    "mistDensity": 1.8,
    "tint": 0.1,
    "ambTemp": -0.3
  },
  "montreal|dawn|wet": {
    "sunTemp": -0.5,
    "grMul": 1.6,
    "ssrWetMul": 1.15,
    "mistDensity": 1.5,
    "ambientMul": 1.15,
    "tint": 0.05
  },
  "montreal|day|dry": {
    "keyMul": 1.05,
    "shadowTintAmt": 0.18,
    "cloudCover": 0.1,
    "tint": -0.04,
    "saturation": 1.02
  },
  "montreal|day|fog": {
    "fogDensityMul": 2.2,
    "mistDensity": 1.5,
    "saturation": 0.75,
    "keyMul": 0.8,
    "ambientMul": 1.15,
    "tint": -0.25
  },
  "montreal|day|overcast": {
    "keyMul": 0.75,
    "ambientMul": 1.3,
    "shadowStr": 0.6,
    "cloudCover": 0.3,
    "tint": -0.2,
    "saturation": 0.9
  },
  "montreal|day|rain": {
    "keyMul": 0.7,
    "ambientMul": 1.2,
    "shadowStr": 0.5,
    "ssrWetMul": 1.25,
    "wetDark": 1.15,
    "tint": -0.25,
    "cloudCover": 0.4,
    "fogDensityMul": 1.3,
    "saturation": 0.85
  },
  "montreal|day|wet": {
    "ssrWetMul": 1.2,
    "wetDark": 1.1,
    "tint": -0.15,
    "cloudCover": 0.15,
    "keyMul": 0.9,
    "ambientMul": 1.05
  },
  "montreal|dusk|dry": {
    "sunTemp": -0.7,
    "sunElev": -20,
    "keyMul": 0.9,
    "grMul": 1.6,
    "glowAmp": 2.8,
    "floodEmitMul": 1.1,
    "lampLevel": 0.35,
    "bloomSpread": 1.2,
    "tint": 0.15
  },
  "montreal|dusk|overcast": {
    "sunElev": -15,
    "keyMul": 0.6,
    "cloudCover": 0.35,
    "ambientMul": 1.25,
    "shadowStr": 0.5,
    "lampLevel": 0.3,
    "tint": -0.1
  },
  "montreal|dusk|wet": {
    "sunTemp": -0.6,
    "sunElev": -18,
    "ssrWetMul": 1.25,
    "wetDark": 1.05,
    "glowAmp": 2.7,
    "bloomSpread": 1.3,
    "tint": 0.1,
    "lampLevel": 0.32
  },
  "montreal|night|dry": {
    "keyMul": 0.05,
    "ambientMul": 0.7,
    "lampLevel": 0.3,
    "glowAmp": 2.5,
    "cityGlowMul": 1.3,
    "starBright": 0.8,
    "bloomMul": 1.3
  },
  "montreal|night|rain": {
    "keyMul": 0.03,
    "ambientMul": 0.6,
    "fogDensityMul": 1.8,
    "lampVolHaze": 1,
    "rainCount": 600,
    "glowAmp": 2.2,
    "saturation": 0.75,
    "lightning": 1.5
  },
  "montreal|night|wet": {
    "keyMul": 0.05,
    "ambientMul": 0.7,
    "lampLevel": 0.32,
    "glowAmp": 2.6,
    "cityGlowMul": 1.4,
    "ssrWetMul": 1.35,
    "bloomMul": 1.4,
    "tint": -0.1
  },
  "monza|dawn|dry": {
    "sunElev": -15,
    "sunTemp": -0.4,
    "grMul": 1.6,
    "mistDensity": 1.8,
    "mistHeight": 0.45,
    "ambientMul": 0.85,
    "tint": -0.15,
    "exposureMul": 0.95
  },
  "monza|day|dry": {
    "keyMul": 1.12,
    "shadowTintAmt": 0.15,
    "tint": 0.08,
    "saturation": 1.04,
    "grMul": 1.25
  },
  "monza|day|fog": {
    "fogDensityMul": 2,
    "mistDensity": 2,
    "fogTint": -0.1,
    "tint": -0.2,
    "saturation": 0.75,
    "keyMul": 0.8,
    "shadowStr": 0.5,
    "exposureMul": 1.05
  },
  "monza|day|overcast": {
    "keyMul": 0.85,
    "ambientMul": 1.15,
    "cloudCover": 0.2,
    "shadowStr": 0.7,
    "tint": -0.05,
    "saturation": 0.95,
    "contrast": 1.08
  },
  "monza|day|rain": {
    "fogDensityMul": 1.4,
    "mistDensity": 1.2,
    "ssrWetMul": 1.2,
    "wetDark": 1.15,
    "keyMul": 0.85,
    "rainCount": 450,
    "lightning": 1.1,
    "tint": -0.2,
    "saturation": 0.9,
    "contrast": 1.05
  },
  "monza|day|wet": {
    "ssrWetMul": 1.2,
    "wetDark": 1.15,
    "tint": -0.15,
    "keyMul": 0.95,
    "shadowStr": 0.85
  },
  "monza|dusk|dry": {
    "sunElev": -10,
    "sunTemp": -0.35,
    "grMul": 1.5,
    "floodEmitMul": 0.8,
    "glowAmp": 2.5,
    "tint": -0.2,
    "cloudCover": 0.1,
    "exposureMul": 0.95
  },
  "monza|night|dry": {
    "keyMul": 0.15,
    "moonBright": 0.9,
    "ambientMul": 0.55,
    "ambBalance": -0.1,
    "floodEmitMul": 1.25,
    "glowAmp": 2.8,
    "cityGlowMul": 0.6,
    "lampLevel": 0.32,
    "poolEnergy": 0.6,
    "lampTemp": -0.15,
    "starBright": 0.9,
    "exposureMul": 0.9,
    "vignette": 0.75
  },
  "monza|night|wet": {
    "keyMul": 0.15,
    "moonBright": 0.9,
    "ambientMul": 0.5,
    "ambBalance": -0.1,
    "floodEmitMul": 1.35,
    "glowAmp": 3,
    "cityGlowMul": 0.6,
    "lampLevel": 0.32,
    "poolEnergy": 0.6,
    "ssrWetMul": 1.35,
    "wetDark": 0.95,
    "lampTemp": -0.15,
    "starBright": 0.6,
    "exposureMul": 0.87,
    "vignette": 0.75
  },
  "qatar|dawn|dry": {
    "keyMul": 0.75,
    "sunTemp": -0.4,
    "sunElev": -15,
    "grMul": 1.8,
    "mistDensity": 1.4,
    "tint": 0.25,
    "fogDensityMul": 1.2,
    "fogTint": 0.3,
    "shadowStr": 0.7,
    "ambientMul": 1.1,
    "exposureMul": 1.08,
    "vibrance": 0.3,
    "flareMul": 1.15
  },
  "qatar|day|dry": {
    "keyMul": 1.3,
    "sunTemp": -0.25,
    "sunElev": 8,
    "shadowTintAmt": 0.25,
    "gradeStr": 1.15,
    "tint": 0.2,
    "fogDensityMul": 1.25,
    "fogTint": 0.35,
    "flareMul": 1.25,
    "contrast": 1.22,
    "exposureMul": 0.95,
    "saturation": 1.1
  },
  "qatar|dusk|dry": {
    "keyMul": 0.8,
    "sunTemp": -0.35,
    "sunElev": -12,
    "grMul": 1.5,
    "tint": 0.25,
    "fogDensityMul": 1.1,
    "fogTint": 0.25,
    "glowAmp": 2.5,
    "lampLevel": 0.28,
    "exposureMul": 1.05,
    "vibrance": 0.28,
    "gradeStr": 1.1
  },
  "qatar|night|dry": {
    "tint": 0.15,
    "sunTemp": -0.15,
    "lampLevel": 0.34,
    "poolEnergy": 0.63,
    "glowAmp": 2.6,
    "glareStr": 0.17,
    "starBright": 1.4,
    "cityGlowMul": 0.5,
    "fogDensityMul": 1.15,
    "fogTint": 0.2,
    "ssrDryNight": 0.12,
    "exposureMul": 1.02
  },
  "qatar|night|fog": {
    "fogDensityMul": 2.2,
    "fogTint": -0.05,
    "fogHeight": 0.058,
    "mistDensity": 1.8,
    "starBright": 0.4,
    "saturation": 0.75,
    "ambientMul": 1.15,
    "lampFogBase": 0.7,
    "lampVolBase": 0.2,
    "lampVolHaze": 1.05,
    "tint": -0.08,
    "exposureMul": 1.05
  },
  "qatar|night|overcast": {
    "keyMul": 0.8,
    "cloudCover": 0.35,
    "ambientMul": 1.25,
    "shadowStr": 0.75,
    "tint": -0.1,
    "lampLevel": 0.31,
    "saturation": 0.9
  },
  "qatar|night|rain": {
    "tint": -0.15,
    "sunTemp": -0.3,
    "keyMul": 0.85,
    "ssrWetMul": 1.3,
    "wetDark": 1.2,
    "fogDensityMul": 1.7,
    "fogTint": -0.1,
    "mistDensity": 1.5,
    "lampVolHaze": 1.15,
    "lampFogHaze": 1,
    "rainCount": 560,
    "lightning": 1.5,
    "saturation": 0.8,
    "exposureMul": 0.95,
    "cloudCover": 0.4
  },
  "qatar|night|wet": {
    "tint": -0.1,
    "sunTemp": -0.25,
    "ssrWetMul": 1.2,
    "wetDark": 1.15,
    "fogDensityMul": 1.3,
    "lampVolHaze": 1,
    "lampFogHaze": 0.9,
    "mistDensity": 1.3,
    "saturation": 0.9,
    "cloudCover": 0.25
  },
  "redbull|dawn|dry": {
    "sunTemp": -0.28,
    "grMul": 1.5,
    "mistDensity": 1.4,
    "sunElev": -10,
    "keyMul": 0.82
  },
  "redbull|day|dry": {
    "keyMul": 1.55,
    "glowAmp": 1.2,
    "threshOff": -0.14,
    "exposureMul": 1.02
  },
  "redbull|day|fog": {
    "fogDensityMul": 2,
    "mistDensity": 1.6,
    "saturation": 0.88,
    "keyMul": 0.78,
    "ambientMul": 1.12,
    "shadowStr": 0.65
  },
  "redbull|day|overcast": {
    "keyMul": 0.88,
    "ambientMul": 1.18,
    "shadowStr": 0.75,
    "cloudCover": 0.35
  },
  "redbull|day|rain": {
    "fogDensityMul": 1.35,
    "ssrWetMul": 1.2,
    "rainCount": 480,
    "lightning": 1.25,
    "tint": -0.18,
    "contrast": 0.98
  },
  "redbull|day|wet": {
    "ssrWetMul": 1.15,
    "wetDark": 1.08,
    "tint": -0.12,
    "shadowStr": 0.92
  },
  "redbull|dusk|dry": {
    "sunTemp": -0.22,
    "grMul": 1.35,
    "floodEmitMul": 1.12,
    "glowAmp": 2.55,
    "lampLevel": 0.29,
    "keyMul": 0.92
  },
  "redbull|dusk|rain": {
    "lampLevel": 0.2,
    "glareStr": 0.08,
    "ssrWetMul": 0.8
  },
  "redbull|dusk|wet": {
    "lampLevel": 0.2,
    "glareStr": 0.08,
    "ssrWetMul": 0.8
  },
  "redbull|night|dry": {
    "lampLevel": 0.31,
    "poolEnergy": 0.62,
    "floodEmitMul": 1.25,
    "glowAmp": 2.95,
    "starBright": 1.75,
    "ambientMul": 0.52,
    "cityGlowMul": 0.58,
    "bloomMul": 1.28
  },
  "redbull|night|wet": {
    "ssrWetMul": 1.35,
    "lampLevel": 0.29,
    "poolEnergy": 0.68,
    "floodEmitMul": 1.2,
    "glowAmp": 2.75,
    "ambientMul": 0.54,
    "starBright": 1.4,
    "bloomMul": 1.35
  },
  "shanghai|dawn|dry": {
    "sunTemp": -0.28,
    "sunElev": -18,
    "grMul": 1.42,
    "mistDensity": 1.42,
    "tint": 0.12,
    "ambTemp": -0.2
  },
  "shanghai|dawn|fog": {
    "fogDensityMul": 1.95,
    "mistDensity": 2,
    "sunElev": -20,
    "keyMul": 0.7,
    "tint": 0.05,
    "saturation": 0.82
  },
  "shanghai|dawn|rain": {
    "sunTemp": -0.2,
    "grMul": 0.95,
    "rainCount": 480,
    "mistDensity": 1.3,
    "keyMul": 0.78,
    "tint": 0.05
  },
  "shanghai|dawn|wet": {
    "sunTemp": -0.24,
    "grMul": 1.2,
    "mistDensity": 1.6,
    "ssrWetMul": 1.18,
    "keyMul": 0.88,
    "tint": 0.08
  },
  "shanghai|day|dry": {
    "fogDensityMul": 1.2,
    "shadowTintAmt": 0.16,
    "ambTemp": -0.15,
    "mistDensity": 0.85,
    "tint": 0.05
  },
  "shanghai|day|fog": {
    "fogDensityMul": 2.25,
    "mistDensity": 1.8,
    "saturation": 0.78,
    "keyMul": 0.75,
    "tint": -0.1
  },
  "shanghai|day|overcast": {
    "keyMul": 0.8,
    "ambientMul": 1.3,
    "shadowStr": 0.72,
    "cloudCover": 0.2,
    "tint": -0.08,
    "contrast": 1.05
  },
  "shanghai|day|rain": {
    "fogDensityMul": 1.65,
    "rainCount": 560,
    "ssrWetMul": 1.3,
    "keyMul": 0.82,
    "tint": -0.15,
    "wetDark": 1.15
  },
  "shanghai|day|wet": {
    "ssrWetMul": 1.25,
    "wetDark": 1.1,
    "fogDensityMul": 1.3,
    "tint": -0.1,
    "keyMul": 0.92
  },
  "shanghai|dusk|dry": {
    "sunTemp": -0.2,
    "grMul": 1.35,
    "sunElev": -12,
    "tint": 0.18,
    "glowAmp": 2.52,
    "cityGlowMul": 0.5,
    "floodEmitMul": 0.45
  },
  "shanghai|dusk|fog": {
    "fogDensityMul": 1.75,
    "mistDensity": 1.55,
    "sunElev": -14,
    "keyMul": 0.72,
    "tint": 0.1,
    "glowAmp": 2.35
  },
  "shanghai|dusk|rain": {
    "sunTemp": -0.12,
    "grMul": 0.92,
    "rainCount": 520,
    "keyMul": 0.75,
    "tint": 0.08,
    "glowAmp": 2.45,
    "ssrWetMul": 1.2
  },
  "shanghai|dusk|wet": {
    "sunTemp": -0.16,
    "grMul": 1.15,
    "ssrWetMul": 1.24,
    "tint": 0.12,
    "glowAmp": 2.6,
    "keyMul": 0.88,
    "cityGlowMul": 0.4
  },
  "shanghai|night|dry": {
    "keyMul": 0.16,
    "glowAmp": 2.8,
    "floodEmitMul": 1.12,
    "cityGlowMul": 1.55,
    "starBright": 0.38,
    "lampLevel": 0.32,
    "ssrDryNight": 0.13
  },
  "shanghai|night|fog": {
    "fogDensityMul": 2.2,
    "lampVolHaze": 1.2,
    "cityGlowMul": 1.15,
    "glowAmp": 2.65,
    "keyMul": 0.13,
    "mistDensity": 1.5
  },
  "shanghai|night|rain": {
    "rainCount": 650,
    "glowAmp": 2.88,
    "lightning": 1.18,
    "lampVolHaze": 1.05,
    "keyMul": 0.12,
    "cityGlowMul": 1.2,
    "floodEmitMul": 1.08
  },
  "shanghai|night|wet": {
    "keyMul": 0.14,
    "glowAmp": 3,
    "ssrWetMul": 1.32,
    "floodEmitMul": 1.15,
    "cityGlowMul": 1.3,
    "lampVolHaze": 0.95
  },
  "silverstone|dawn|dry": {
    "sunTemp": -0.3,
    "grMul": 1.3,
    "mistDensity": 1.2,
    "tint": 0.05,
    "exposureMul": 0.9
  },
  "silverstone|day|dry": {
    "keyMul": 0.92,
    "ambientMul": 1.1,
    "shadowStr": 0.75,
    "cloudCover": 0.15,
    "tint": -0.1,
    "saturation": 0.96
  },
  "silverstone|day|fog": {
    "fogDensityMul": 2.2,
    "mistDensity": 1.6,
    "tint": -0.2,
    "saturation": 0.85,
    "keyMul": 0.65
  },
  "silverstone|day|overcast": {
    "keyMul": 0.85,
    "ambientMul": 1.15,
    "shadowStr": 0.75,
    "cloudCover": 0.3,
    "tint": -0.1,
    "saturation": 0.95
  },
  "silverstone|day|rain": {
    "ssrWetMul": 1.3,
    "fogDensityMul": 1.3,
    "wetDark": 1.2,
    "tint": -0.15,
    "keyMul": 0.8,
    "rainCount": 480
  },
  "silverstone|day|wet": {
    "ssrWetMul": 1.2,
    "wetDark": 1.1,
    "tint": -0.1,
    "keyMul": 0.9
  },
  "silverstone|dusk|dry": {
    "sunTemp": -0.4,
    "grMul": 1.5,
    "tint": 0.1,
    "lampLevel": 0.3,
    "exposureMul": 0.95
  },
  "silverstone|night|dry": {
    "lampLevel": 0.3,
    "glowAmp": 2.5,
    "starBright": 1.15,
    "ambientMul": 0.65,
    "keyMul": 0.15
  },
  "silverstone|night|overcast": {
    "cloudCover": 0.35,
    "lampLevel": 0.35,
    "starBright": 0.15,
    "glowAmp": 2.2,
    "ambientMul": 0.7
  },
  "silverstone|night|wet": {
    "lampLevel": 0.33,
    "ssrWetMul": 1.25,
    "glowAmp": 2.6,
    "starBright": 0.7,
    "ambientMul": 0.65
  },
  "singapore|night|dry": {
    "cityGlowMul": 1.4,
    "glowAmp": 2.8,
    "floodEmitMul": 1.15,
    "starBright": 0.3,
    "exposureMul": 1.08,
    "ambientMul": 1.15,
    "lampLevel": 0.3,
    "moonBright": 0.65,
    "mistDensity": 1.3,
    "tint": 0.15,
    "bloomMul": 1.2
  },
  "singapore|night|fog": {
    "fogDensityMul": 1.8,
    "mistDensity": 1.7,
    "lampFogBase": 0.75,
    "lampVolBase": 0.25,
    "cityGlowMul": 1.5,
    "glowAmp": 2.7,
    "saturation": 0.8,
    "tint": -0.1,
    "exposureMul": 1.15,
    "bloomMul": 1.35,
    "keyMul": 0.85,
    "starBright": 0.2
  },
  "singapore|night|overcast": {
    "cloudCover": 0.3,
    "keyMul": 0.85,
    "ambientMul": 1.2,
    "shadowStr": 0.85,
    "moonBright": 0.55,
    "cityGlowMul": 1.25,
    "glowAmp": 2.5,
    "mistDensity": 1.2,
    "saturation": 0.95,
    "tint": 0.08
  },
  "singapore|night|rain": {
    "fogDensityMul": 1.45,
    "rainCount": 510,
    "lightning": 1.4,
    "mistDensity": 1.4,
    "lampVolHaze": 1,
    "lampFogHaze": 0.85,
    "cityGlowMul": 1.2,
    "glowAmp": 2.5,
    "saturation": 0.85,
    "exposureMul": 1.1,
    "keyMul": 0.85
  },
  "singapore|night|wet": {
    "ssrWetMul": 1.25,
    "wetDark": 1.15,
    "fogDensityMul": 1.2,
    "mistDensity": 1.25,
    "tint": 0.12,
    "cityGlowMul": 1.3,
    "glowAmp": 2.6,
    "lampVolHaze": 0.8,
    "saturation": 0.9,
    "exposureMul": 1.06
  },
  "spa|dawn|dry": {
    "sunTemp": -0.3,
    "grMul": 1.4,
    "mistDensity": 1.5,
    "sunElev": -8
  },
  "spa|dawn|wet": {
    "sunTemp": -0.35,
    "grMul": 1.3,
    "mistDensity": 1.6,
    "ssrWetMul": 1.2,
    "keyMul": 0.9
  },
  "spa|day|dry": {
    "shadowTintAmt": 0.15,
    "tint": -0.1
  },
  "spa|day|fog": {
    "fogDensityMul": 2,
    "mistDensity": 1.8,
    "saturation": 0.85,
    "tint": -0.15,
    "keyMul": 0.8,
    "ambientMul": 1.2
  },
  "spa|day|overcast": {
    "keyMul": 0.75,
    "ambientMul": 1.25,
    "cloudCover": 0.3,
    "shadowStr": 0.7,
    "tint": -0.15,
    "saturation": 0.95
  },
  "spa|day|rain": {
    "fogDensityMul": 1.4,
    "rainCount": 500,
    "tint": -0.3,
    "keyMul": 0.85,
    "lightning": 1.5,
    "ssrWetMul": 1.4
  },
  "spa|day|wet": {
    "ssrWetMul": 1.3,
    "wetDark": 1.1,
    "tint": -0.2,
    "shadowTintAmt": 0.2
  },
  "spa|dusk|dry": {
    "sunTemp": -0.4,
    "grMul": 1.5,
    "sunElev": -10,
    "floodEmitMul": 1.1,
    "lampLevel": 0.3,
    "tint": 0.05
  },
  "spa|dusk|wet": {
    "sunTemp": -0.35,
    "grMul": 1.4,
    "sunElev": -8,
    "ssrWetMul": 1.35,
    "lampLevel": 0.35,
    "floodEmitMul": 1.15
  },
  "spa|night|dry": {
    "lampLevel": 0.4,
    "poolEnergy": 0.65,
    "starBright": 0.8,
    "cityGlowMul": 0.3,
    "keyMul": 0.2
  },
  "spa|night|rain": {
    "lampLevel": 0.35,
    "fogDensityMul": 1.5,
    "rainCount": 550,
    "lightning": 2,
    "lampVolHaze": 1.2,
    "keyMul": 0.1,
    "tint": -0.2
  },
  "spa|night|wet": {
    "lampLevel": 0.45,
    "poolEnergy": 0.7,
    "ssrWetMul": 1.25,
    "wetDark": 1.1,
    "keyMul": 0.15,
    "glowAmp": 2.6
  },
  "suzuka|dawn|dry": {
    "sunTemp": -0.4,
    "grMul": 1.6,
    "mistDensity": 1.6,
    "ambientMul": 0.9
  },
  "suzuka|day|dry": {
    "shadowTintAmt": 0.15
  },
  "suzuka|day|fog": {
    "fogDensityMul": 2.2,
    "mistDensity": 1.6,
    "tint": -0.3,
    "saturation": 0.75,
    "keyMul": 0.85,
    "cloudCover": 0.3,
    "exposureMul": 1.05
  },
  "suzuka|day|overcast": {
    "keyMul": 0.8,
    "ambientMul": 1.3,
    "shadowStr": 0.7,
    "cloudCover": 0.4,
    "tint": -0.1,
    "contrast": 1
  },
  "suzuka|day|rain": {
    "ssrWetMul": 1.3,
    "wetDark": 1.2,
    "tint": -0.25,
    "fogDensityMul": 1.6,
    "rainCount": 550,
    "lightning": 1.3,
    "saturation": 0.85
  },
  "suzuka|day|wet": {
    "ssrWetMul": 1.2,
    "wetDark": 1.1,
    "tint": -0.15,
    "shadowStr": 0.85
  },
  "suzuka|dusk|dry": {
    "sunTemp": -0.35,
    "grMul": 1.4,
    "lampLevel": 0.35,
    "tint": 0.1
  },
  "suzuka|night|dry": {
    "lampLevel": 0.45,
    "poolEnergy": 0.7,
    "glowAmp": 2.8,
    "cityGlowMul": 1.8,
    "floodEmitMul": 1.3,
    "starBright": 1.2,
    "lampTemp": -0.2,
    "vignette": 0.75
  },
  "suzuka|night|fog": {
    "fogDensityMul": 2.5,
    "mistDensity": 2,
    "lampLevel": 0.4,
    "glowAmp": 2.2,
    "cityGlowMul": 1.2,
    "lampVolHaze": 1.4,
    "exposureMul": 1.15,
    "starBright": 0,
    "vignette": 0.65
  },
  "suzuka|night|rain": {
    "lampLevel": 0.4,
    "glowAmp": 2.5,
    "cityGlowMul": 1.5,
    "fogDensityMul": 2,
    "ssrWetMul": 1.3,
    "rainCount": 800,
    "lightning": 2,
    "starBright": 0.2,
    "lampVolHaze": 1.2
  },
  "suzuka|night|wet": {
    "lampLevel": 0.45,
    "poolEnergy": 0.8,
    "glowAmp": 3,
    "cityGlowMul": 1.9,
    "ssrWetMul": 1.4,
    "floodEmitMul": 1.3,
    "starBright": 0.8,
    "tint": -0.1
  },
  "vegas|dawn|dry": {
    "sunTemp": 0.25,
    "grMul": 1.5,
    "sunElev": -28,
    "mistDensity": 1.5,
    "lampLevel": 0.38,
    "lampTemp": -0.15,
    "tint": -0.08
  },
  "vegas|day|dry": {
    "keyMul": 1.35,
    "sunTemp": 0.1,
    "shadowTintAmt": 0.18,
    "tint": 0.15,
    "ambientMul": 1.05
  },
  "vegas|day|overcast": {
    "keyMul": 0.88,
    "cloudCover": 0.35,
    "ambientMul": 1.25,
    "shadowStr": 0.7,
    "tint": -0.15
  },
  "vegas|dusk|dry": {
    "sunTemp": -0.45,
    "grMul": 1.9,
    "sunElev": -20,
    "lampLevel": 0.35,
    "tint": 0.12,
    "keyMul": 1.15
  },
  "vegas|night|dry": {
    "cityGlowMul": 1.3,
    "glowAmp": 2.6,
    "floodEmitMul": 1.25,
    "lampLevel": 0.45,
    "lampTemp": -0.18,
    "starBright": 0.3,
    "bloomMul": 1.1,
    "tint": 0.06
  },
  "vegas|night|fog": {
    "fogDensityMul": 2.8,
    "mistDensity": 2.2,
    "saturation": 0.75,
    "fogTint": -0.4,
    "glowAmp": 1.8,
    "cityGlowMul": 0.6,
    "lampVolHaze": 1.2,
    "starBright": 0.1
  },
  "vegas|night|overcast": {
    "cloudCover": 0.25,
    "keyMul": 0.85,
    "ambientMul": 1.2,
    "tint": -0.1,
    "cityGlowMul": 1.15,
    "starBright": 0.15
  },
  "vegas|night|rain": {
    "ssrWetMul": 1.35,
    "fogDensityMul": 2,
    "rainCount": 600,
    "lightning": 1.8,
    "mistDensity": 1.4,
    "tint": -0.25,
    "glowAmp": 2,
    "saturation": 0.85
  },
  "vegas|night|wet": {
    "ssrWetMul": 1.25,
    "fogDensityMul": 1.1,
    "wetDark": 1.15,
    "tint": -0.12
  },
  "zandvoort|dawn|dry": {
    "sunTemp": -0.45,
    "grMul": 1.45,
    "mistDensity": 1.4,
    "keyMul": 0.78,
    "sunElev": -12,
    "ambientMul": 0.88,
    "exposureMul": 1.12,
    "tint": 0.05
  },
  "zandvoort|day|dry": {
    "shadowTintAmt": 0.15
  },
  "zandvoort|day|fog": {
    "fogDensityMul": 2.3,
    "mistDensity": 2,
    "fogTint": -0.25,
    "saturation": 0.82,
    "keyMul": 0.7,
    "shadowStr": 0.55,
    "tint": -0.15,
    "exposureMul": 1.2,
    "ambientMul": 1.15
  },
  "zandvoort|day|overcast": {
    "keyMul": 0.65,
    "ambientMul": 1.35,
    "cloudCover": 0.35,
    "shadowStr": 0.5,
    "tint": -0.18,
    "saturation": 0.96,
    "exposureMul": 1.08,
    "contrast": 1.05
  },
  "zandvoort|day|rain": {
    "ssrWetMul": 1.45,
    "fogDensityMul": 1.4,
    "mistDensity": 1.5,
    "rainCount": 500,
    "tint": -0.3,
    "saturation": 0.88,
    "keyMul": 0.82,
    "exposureMul": 0.97,
    "cloudCover": 0.35
  },
  "zandvoort|day|wet": {
    "ssrWetMul": 1.35,
    "wetDark": 1.15,
    "tint": -0.2,
    "mistDensity": 1.3,
    "saturation": 0.95,
    "roadRough": 0.85,
    "shadowStr": 0.88
  },
  "zandvoort|dusk|dry": {
    "sunTemp": -0.4,
    "grMul": 1.6,
    "keyMul": 0.85,
    "sunElev": -18,
    "lampLevel": 0.45,
    "floodEmitMul": 1.3,
    "glowAmp": 2.95,
    "ambientMul": 0.92,
    "tint": 0.12,
    "exposureMul": 1.13
  },
  "zandvoort|night|dry": {
    "ambientMul": 0.55,
    "lampLevel": 0.48,
    "poolEnergy": 0.72,
    "glowAmp": 3.15,
    "cityGlowMul": 1.8,
    "floodEmitMul": 1.4,
    "starBright": 1.25,
    "keyMul": 0.35,
    "lampTemp": -0.05,
    "shadowStr": 0.75
  },
  "zandvoort|night|rain": {
    "ambientMul": 0.48,
    "fogDensityMul": 1.6,
    "mistDensity": 1.7,
    "rainCount": 550,
    "lightning": 1.3,
    "ssrWetMul": 1.45,
    "lampLevel": 0.5,
    "glowAmp": 3,
    "keyMul": 0.25,
    "exposureMul": 0.95
  },
  "zandvoort|night|wet": {
    "ambientMul": 0.5,
    "ssrWetMul": 1.5,
    "wetDark": 1.05,
    "lampLevel": 0.52,
    "glowAmp": 3.25,
    "floodEmitMul": 1.45,
    "mistDensity": 1.25,
    "keyMul": 0.3
  }
};
