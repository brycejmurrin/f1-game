/* Apex 26 — LightTune, the lighting façade every consumer addresses. Composes
   js/lighting/knobs.js (TUNE_DEFS + the live LT object),
   js/lighting/track-lights.js (buildTrackLights / lampStrideNodes — baked once per
   track) and js/lighting/frame-lights.js (setFrameLights / appendCarTailLights —
   the state the renderer samples each frame) into the one surface game.js, the
   renderers, js/lighting/profiles.js and the tests read. No logic of its own;
   the three siblings load first (tools/manifest.cjs HARD_EDGES). */
const LightTune = (function () {
  "use strict";
  const { TUNE_DEFS, LT } = LightKnobs;
  const { buildTrackLights, lampStrideNodes } = TrackLights;
  const { setFrameLights, appendCarTailLights } = FrameLights;
  return { TUNE_DEFS, LT, buildTrackLights, lampStrideNodes,
           setFrameLights, appendCarTailLights };
})();
