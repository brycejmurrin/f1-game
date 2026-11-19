"use strict";
const CarMaterialShade = (function () {
  const CARBON = Object.freeze({
    freq: 190.0,
    fadeStartM: 10.0,
    fadeEndM: 20.0,
    normalAmp: 0.26,
    lacquer: 0.42,
    metalness: 0.08,
    specular: 0.48,
    roughFloor: 0.52,
    roughRipple: 0.12,
    partAlbedoMean: 0.88,
    partAlbedoAmp: 0.24,
    finishCrushDark: 0.16,
    finishResin: Object.freeze([0.030, 0.031, 0.035]),
    finishCrushLit: 0.28,
    finishMix: 0.25,
    finishAlbedoMean: 0.84,
    finishAlbedoAmp: 0.32,
  });

  const GLOSS = Object.freeze({
    peelAmp: 0.28,
    peelFadeStartM: 18.0,
    peelFadeSpanM: 50.0,
  });

  const MATTE = Object.freeze({
    clearcoat: 0.0,
    metalness: 0.0,
    specular: 0.11,
    roughFloor: 0.92,
  });

  const METAL = Object.freeze({
    metalnessFloor: 0.82,
    specular: 1.0,
    roughCeil: 0.18,
    darkLumScale: 4.0,
    darkEnvBoost: 0.32,
  });

  const TINTED = Object.freeze({
    envTint: 0.88,
    chromaFloor: 0.04,
    finalTint: true,
  });

  const CHAMELEON = Object.freeze({
    flipFresLo: 0.58,
    flipFresHi: 1.00,
    flipWeight: 0.90,
    flipHue: Object.freeze([0.25, 0.55, 1.0]),
    chromaFloor: 0.04,
  });

  const FLAKE = Object.freeze({
    cellsPerM: 140.0,
    fadeStartM: 10.0,
    fadeSpanM: 16.0,
    grainAmp: 0.30,
    sparkLo: 0.82,
    sparkMean: 0.09,
    sparkGain: 0.90,
    specGain: 0.40,
    metalness: 0.35,
  });

  const CANDY = Object.freeze({
    satBoost: 1.35,
    darken: 0.62,
    clearcoat: 0.90,
    envTint: 0.55,
    rimGain: 0.45,
    chromaFloor: 0.04,
  });

  const FORGED = Object.freeze({
    cellsPerM: 60.0,
    cellsPerM2: 95.0,
    fadeStartM: 10.0,
    fadeSpanM: 10.0,
    chipMean: 0.667,
    chipGain: 0.90,
    resin: Object.freeze([0.026, 0.027, 0.030]),
    resinKeep: 0.10,
    tintKeep: 0.22,
    tintMix: 0.20,
    roughLo: 0.28,
    roughHi: 0.42,
    roughGain: 0.20,
    clearcoatLo: 0.40,
    clearcoatHi: 0.60,
    metalness: 0.08,
    specular: 0.48,
  });

  const GUNMETAL = Object.freeze({
    base: Object.freeze([0.20, 0.205, 0.22]),
    hueGain: 0.24,
    hueMix: 0.40,
    chromaFloor: 0.04,
    metalness: 0.85,
    specular: 0.90,
    roughLo: 0.16,
    roughHi: 0.28,
    clearcoatMax: 0.30,
  });

  const GOLDPLATE = Object.freeze({
    gold: Object.freeze([0.83, 0.65, 0.23]),
    hue: Object.freeze([1.0, 0.78, 0.27]),
    envTint: 0.88,
  });

  const HOLOGRAPHIC = Object.freeze({ clearcoat: 0.80, metalness: 0.35, specular: 0.90, roughness: 0.18,
    cycles: 1.65, phase: Object.freeze([0.0, 0.33, 0.67]), hueFloor: 0.25, hueSpan: 0.75,
    fresLo: 0.05, fresHi: 0.60, minWeight: 0.28, tintWeight: 0.85 });

  const VELVET = Object.freeze({ clearcoat: 0.0, metalness: 0.0, specular: 0.08, roughFloor: 0.96,
    darken: 0.65, sheenGain: 1.50 });

  const HAMMERED = Object.freeze({ clearcoatMax: 0.15, metalness: 0.90, specular: 0.90,
    roughLo: 0.24, roughHi: 0.36, frequency: 90.0, projectY: Object.freeze([0.73, -0.61]),
    warpFrequency: 0.73, warpGain: 0.80, normalAmp: 0.42, fadeStartM: 8.0, fadeSpanM: 14.0 });

  const ANODIZED = Object.freeze({ clearcoatMax: 0.08, metalness: 0.90, specular: 0.90,
    roughLo: 0.30, roughHi: 0.42, hueWeight: 0.78, baseWeight: 0.22, tintWeight: 0.72, chromaFloor: 0.04 });

  return { CARBON, GLOSS, MATTE, METAL, TINTED, CHAMELEON, FLAKE, CANDY, FORGED, GUNMETAL, GOLDPLATE,
    HOLOGRAPHIC, VELVET, HAMMERED, ANODIZED };
})();
Object.freeze(CarMaterialShade);
