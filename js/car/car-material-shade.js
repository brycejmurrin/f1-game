/* Apex 26 — car surface SHADE CONTRACT: the numbers the three lit backends
 * (GLX / TLX / WGX) must keep in lockstep for carbon, gloss paint, matte paint,
 * and metal/titanium. Surfaced here so unit tests pin the shaders against one
 * table, and so a finish pass does not re-discover which constant is which.
 *
 * Not interpolated into the shaders (those stay hand-ported); this module is
 * the documented source of the numbers. Changing a value here WITHOUT updating
 * all three shaders fails tests/unit/car-materials.test.mjs.
 *
 * Theme: material response only — no geometry, aero, tyres, rims, or livery
 * colours. Matte liveries (Racing Bulls factory `finish: "matte"` → id 28) stay
 * chalky: clearcoat 0, high roughness, low specular.
 */
"use strict";
const CarMaterialShade = (function () {
  // CARBON WEAVE — exposed parts (surface 21) and bare-weave finish (31).
  // Fade keeps the 3.3 cm cross-hatch from moire at range; near-garage and
  // near-track keep the twill readable.
  const CARBON = Object.freeze({
    freq: 190.0,            // object-space cycles (~3.3 cm at scale)
    fadeStartM: 10.0,       // full weave closer than this
    fadeEndM: 20.0,         // mean weave beyond this (was 8..16)
    normalAmp: 0.26,        // twill micro-normal tilt (was 0.18)
    lacquer: 0.42,          // clearcoat ceiling — F1 carbon is clearcoated (was 0.30)
    metalness: 0.08,
    specular: 0.48,
    roughFloor: 0.52,       // was 0.56; a touch glossier lacquer under the weave
    roughRipple: 0.12,      // * (weave - 0.5)
    // Exposed carbon PARTS keep vertex colour; amplify the weave on albedo.
    partAlbedoMean: 0.88,   // was 0.93
    partAlbedoAmp: 0.24,    // was 0.14
    // Bare-weave FINISH crushes livery toward resin, then lays the twill.
    finishCrushDark: 0.16,
    finishResin: Object.freeze([0.030, 0.031, 0.035]),
    finishCrushLit: 0.28,
    finishMix: 0.25,
    finishAlbedoMean: 0.84, // was 0.86
    finishAlbedoAmp: 0.32,  // was 0.28
  });

  // GLOSS paint (surface 20, the default — FINISH_SURFACE has no gloss row).
  // Clearcoat + env mirror carry the shine; orange-peel is a whisper under it.
  const GLOSS = Object.freeze({
    peelAmp: 0.28,          // micro-normal strength (was 0.22) — garage shimmer
    peelFadeStartM: 18.0,
    peelFadeSpanM: 50.0,
  });

  // MATTE paint (FINISH_SURFACE.matte → 28). Chalky: no clearcoat, high rough,
  // low specular. Must stay flatter than satin/panel (26, rough ≥ 0.72).
  const MATTE = Object.freeze({
    clearcoat: 0.0,
    metalness: 0.0,
    specular: 0.11,         // was 0.16
    roughFloor: 0.92,       // was 0.88
  });

  // METAL / titanium bits (surface 23): halo hoop, exhaust tips, hardware.
  // Dark albedos (HALO ~0.22) get a mild env boost so titanium reads at garage
  // distance without blowing bright chrome-ish hubs. Roughness stays a narrow
  // machined band — not mirror, not brushed satin (29).
  const METAL = Object.freeze({
    metalnessFloor: 0.82,   // was 0.78
    specular: 1.0,
    roughCeil: 0.18,        // was 0.16 — slightly less mirror, more titanium
    // Env boost for dark metals: metAdd *= 1 + (1 - saturate(lum * darkLumScale)) * darkEnvBoost
    darkLumScale: 4.0,
    darkEnvBoost: 0.32,
  });

  return { CARBON, GLOSS, MATTE, METAL };
})();
Object.freeze(CarMaterialShade);
