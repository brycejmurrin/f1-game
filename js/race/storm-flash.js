const StormFlash = (function () {
  "use strict";

  function create() {
    const s = {
      _ltBase: null,
      _ltFlash: 0,
      _ltNextT: 0,
      _thunderT: -1,
      _thunderDelay: 0,
    };

    s.step = function step(dt, env) {
      const { raining, state, raceT, skyT, seed, weather, reduced, frame, LT, audio, clamp } = env;
      if (raining && s._ltBase && LT.lightning > 0) {
        const ltNow = state === "race" ? raceT : skyT, strike = Storm.strikeIn(seed, s._ltNextT, ltNow, LT.lightning, weather);
        s._ltNextT = ltNow;
        if (strike) {
          if (Storm.flashOk(reduced)) s._ltFlash = 1.0;
          s._thunderT = s._thunderDelay = strike.delay;
        }
        if (s._thunderT >= 0) {
          s._thunderT -= dt;
          if (s._thunderT < 0 && audio && audio.thunder) {
            audio.thunder(clamp(1.0 - (s._thunderDelay - 1) / 5, 0.15, 1.0));
          }
        }
        if (s._ltFlash > 0.001) {
          s._ltFlash *= Math.exp(-(LT.lightningDecay != null ? LT.lightningDecay : 8) * dt);
          if (s._ltFlash < 0.001) s._ltFlash = 0;
        }
        if (s._ltFlash > 0) {
          const lf = LT.lightningFlash != null ? LT.lightningFlash : 1;
          const f = s._ltFlash, aS = frame.ambientSky, aG = frame.ambientGround;
          for (let i = 0; i < 3; i++) {
            aS[i] = Math.min(1, s._ltBase.ambientSky[i] + 0.55 * f * lf);
            aG[i] = Math.min(1, s._ltBase.ambientGround[i] + 0.40 * f * lf);
          }
          frame.exposure = s._ltBase.exposure + 0.22 * f * lf;
        } else {
          const aS = frame.ambientSky, aG = frame.ambientGround;
          for (let i = 0; i < 3; i++) { aS[i] = s._ltBase.ambientSky[i]; aG[i] = s._ltBase.ambientGround[i]; }
          frame.exposure = s._ltBase.exposure;
        }
      } else if (s._ltFlash > 0) {
        s._ltFlash *= Math.exp(-(LT.lightningDecay != null ? LT.lightningDecay : 8) * dt);
        if (s._ltFlash < 0.001) {
          s._ltFlash = 0;
          if (s._ltBase) {
            for (let i = 0; i < 3; i++) { frame.ambientSky[i] = s._ltBase.ambientSky[i]; frame.ambientGround[i] = s._ltBase.ambientGround[i]; }
            frame.exposure = s._ltBase.exposure;
          }
        }
      }
    };

    return s;
  }

  return { create };
})();
Object.freeze(StormFlash);
