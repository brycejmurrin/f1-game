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
      if (raining && s._ltBase && LT.lightning > 0) {
        // Strikes are a pure function of (sim seed, race clock) — js/race/storm.js: same sky on a replay or a peer. _ltNextT = the clock the last window ended at.
        const ltNow = state === "race" ? raceT : skyT, strike = Storm.strikeIn(seed, s._ltNextT, ltNow, LT.lightning, weather);
        s._ltNextT = ltNow;
        if (strike) {
          if (Storm.flashOk(reduced)) s._ltFlash = 1.0;
          s._thunderT = s._thunderDelay = strike.delay;
        }
        if (s._thunderT >= 0) {
          s._thunderT -= dt;
          if (s._thunderT < 0 && audio && audio.thunder) {
            // The DRAWN delay, not the countdown's remainder. `_thunderT + dt` is
            // whatever was left before this frame's decrement — between 0 and one
            // frame — so it would always give ~1.0 - 0.008 and clamp to full
            // volume: a 2 s distant rumble as loud as a 0.3 s overhead strike.
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
          // SET from the saved base (was `+=`: it accumulated every frame of the
          // ~0.9 s flash and was never restored — each strike permanently brightened
          // the scene by ~+1.65 exposure, washing a stormy race out to white).
          frame.exposure = s._ltBase.exposure + 0.22 * f * lf;
        } else {
          const aS = frame.ambientSky, aG = frame.ambientGround;
          for (let i = 0; i < 3; i++) { aS[i] = s._ltBase.ambientSky[i]; aG[i] = s._ltBase.ambientGround[i]; }
          frame.exposure = s._ltBase.exposure;
        }
      } else if (s._ltFlash > 0) {
        // Weather flipped dry mid-flash: the decay above is inside the raining gate,
        // so without this the flash froze >0 and frameSky.lightning (set uncondition-
        // ally each frame) kept the sky partially bleached until the next storm.
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
