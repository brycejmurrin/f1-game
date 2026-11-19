const LightTune = (function () {
  "use strict";
  const { TUNE_DEFS, LT } = LightKnobs;
  const { buildTrackLights, lampStrideNodes } = TrackLights;
  const { setFrameLights, appendCarTailLights } = FrameLights;
  return { TUNE_DEFS, LT, buildTrackLights, lampStrideNodes,
           setFrameLights, appendCarTailLights };
})();
Object.freeze(LightTune);
