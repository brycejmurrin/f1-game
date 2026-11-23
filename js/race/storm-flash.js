/* Apex 26 — StormFlash: the in-frame lightning flash (strike, thunder, ambient spike).
   The schedule stays in Storm; this owns the flash state game.js used to keep
   as _lt* lets and applies one frame of it. Statement order matches the block
   this was lifted from. */
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
      const active = raining && s._ltBase && LT.lightning > 0;
      if (active) {
        // Only eligible rain owns the strike window; Storm resyncs long gaps.
        const ltNow = state === "race" ? raceT : skyT;
        const strike = Storm.strikeIn(seed, s._ltNextT, ltNow, LT.lightning, weather);
        s._ltNextT = ltNow;
        if (strike) {
          if (Storm.flashOk(reduced)) s._ltFlash = 1.0;
          s._thunderT = s._thunderDelay = strike.delay;
        }
      }
      // Existing thunder travels after the rain stops. OFF or a released race
      // atmosphere (quit to menu) cancels it;
      // a zero-dt paused frame neither advances nor replays the countdown.
      if (!s._ltBase || LT.lightning === 0) s._thunderT = -1;
      if (s._thunderT >= 0) {
        s._thunderT -= dt;
        if (s._thunderT < 0 && audio && audio.thunder)
          audio.thunder(clamp(1.0 - (s._thunderDelay - 1) / 5, 0.15, 1.0));
      }
      const hadFlash = s._ltFlash > 0;
      if (reduced) s._ltFlash = 0;
      else if (hadFlash) {
        s._ltFlash *= Math.exp(-(LT.lightningDecay != null ? LT.lightningDecay : 8) * dt);
        if (s._ltFlash < 0.001) s._ltFlash = 0;
      }
      // Use the latest atmosphere/blend base, never a saved pre-transition copy.
      // Only restore while we own a flash (or active rain): dry idle lighting
      // belongs to Atmosphere and must not be overwritten with an old base.
      if (s._ltBase && (active || hadFlash)) {
        const f = s._ltFlash * (LT.lightningFlash != null ? LT.lightningFlash : 1);
        const aS = frame.ambientSky, aG = frame.ambientGround;
        for (let i = 0; i < 3; i++) {
          aS[i] = f > 0 ? Math.min(1, s._ltBase.ambientSky[i] + 0.55 * f) : s._ltBase.ambientSky[i];
          aG[i] = f > 0 ? Math.min(1, s._ltBase.ambientGround[i] + 0.40 * f) : s._ltBase.ambientGround[i];
        }
        frame.exposure = s._ltBase.exposure + 0.22 * f;
      }
    };

    return s;
  }

  return { create };
})();
Object.freeze(StormFlash);
