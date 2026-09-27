/* Apex 26 — OVERTAKE MODE (FIA 2026 Sporting Regs B7.2.3(c)): one Detection Line per circuit, the 1 s check there, and the 0.5 MJ allowance granted at the Activation Line and spent at will over the following lap. Pure per-car rules; game.js supplies the gap and the gates. */
const OvertakeMode = (function () {
  "use strict";

  // THE RULE (FIA 2026 F1 Sporting Regulations Section B, Iss. 07, B7.2.3(c);
  // explainers: formula1.com "All you need to know about F1's new power units",
  // the-race.com "Boost, overtake mode, active aero — key 2026 F1 terms"):
  // a car LESS THAN ONE SECOND behind the car ahead AT THE DETECTION LINE (one
  // per circuit, nominally out of the final corner) is given Overtake at the
  // Activation Line (the timing line), and may then deploy an extra 0.5 MJ at
  // will during that following lap. It replaced the old model here — arm
  // anywhere within 1 s, a fixed 3–5 s push, then a 9–14 s lockout.
  //
  // ENERGY UNITS. `c.energy` is the battery as 0..1 of the Energy Store's 4 MJ
  // deployable window (4 MJ ≈ 11.5 s at the MGU-K's 350 kW), so the allowance
  // is OT_MJ / ES_MJ = 0.125 of that same unit, held SEPARATELY in `c.otE`:
  // it is an extra allowance, not a draw on the battery (BOOST's job). It is
  // spent at the rate that empties it over `otTimeFor(c)` seconds of deploy
  // (3.2–5.2 s by the ERS part), because Overtake's push is the power profile
  // ABOVE the normal taper (deployTaper bypass), not a second full deploy —
  // so a full allowance is exactly the push length the game was tuned to.
  //
  // CAR STATE it owns: otE (allowance left, battery units), otOn (deploying),
  // otEarned (under 1 s at this lap's detection line), otArmed (may press now),
  // otT (seconds of push left while deploying, else 0 — what deployTaper, the
  // AI and the HUD already read), and the crossing trackers _otS/_otLap.
  const DETECT_FRAC = 0.9;   // default Detection Line: 90 % of the lap from the timing line

  function consts() { return (typeof PhysicsConsts !== "undefined" && PhysicsConsts) || {}; }
  function energy() { const P = consts(); return (P.OT_MJ || 0.5) / (P.ES_MJ || 4); }
  function mj(c) { return c && c.otE > 0 ? c.otE * (consts().ES_MJ || 4) : 0; }

  // The Detection Line as a RACING-frame lap fraction (0 = the timing line).
  // A circuit may set `otDetectFrac`, authored in the same frame as its other
  // frac-keyed tables — so it goes through TrackSpace.sceneryFrac, which applies
  // def._sceneryShift and the reverse/mirror flip. Unset = DETECT_FRAC, already
  // measured from the line.
  function detectFrac(def) {
    const f = def && def.otDetectFrac;
    if (Number.isFinite(f) && typeof TrackSpace !== "undefined") return TrackSpace.sceneryFrac(def, f);
    return DETECT_FRAC;
  }
  let _cacheTrack = null, _cacheS = 0;
  function detectS(track) {
    if (track !== _cacheTrack) { _cacheTrack = track; _cacheS = track ? detectFrac(track.def) * track.total : 0; }
    return _cacheS;
  }

  // Did a FORWARD step prevS -> s pass `at` (all arc metres on a lap of L)?
  // Wrap-safe; a backward step or a jump of half a lap or more never counts.
  function crossed(prevS, s, at, L) {
    if (!(L > 0) || !Number.isFinite(prevS) || !Number.isFinite(s)) return false;
    const step = ((s - prevS) % L + L) % L;
    if (!(step > 0) || step >= L / 2) return false;
    const to = ((at - prevS) % L + L) % L;
    return to > 0 && to <= step;
  }

  function reset(c) {
    c.otE = 0; c.otOn = false; c.otEarned = false; c.otArmed = false; c.otT = 0;
    c._otS = null; c._otLap = null;   // re-seeded from the car on its next tick
  }

  // Once per car per tick, BEFORE arming: the two lines. `gapAhead` is seconds
  // to the car ahead on the road; `open` is RaceControl.otDetectOpen() — no
  // earning under the Safety Car or in low grip.
  function lines(c, track, gapAhead, open) {
    if (c._otLap == null || c._otS == null) { c._otLap = c.lap | 0; c._otS = c.s; }
    if (track && crossed(c._otS, c.s, detectS(track), track.total)) c.otEarned = !!open && gapAhead < (consts().OT_GAP || 1);
    c._otS = c.s;
    // The Activation Line. Highest lap seen, so a car shoved back over the line
    // and re-crossing (RaceControl.lineTransition's recross) is not re-granted
    // — nor stripped of what it was given the first time.
    if ((c.lap | 0) > c._otLap) {
      c._otLap = c.lap | 0;
      c.otE = c.otEarned ? energy() : 0;   // unused allowance expires at the line
      c.otEarned = false; c.otOn = false;
    }
  }

  // `gate`: the race-wide switch (otEnabled) and the car's own (not finished,
  // not held by the pit limiter). `speedOK`: above OT_MIN_SPEED.
  function arm(c, gate, speedOK) {
    if (!gate) c.otOn = false;
    c.otArmed = !!gate && !!speedOK && c.otE > 0 && !c.otOn;
    return c.otArmed;
  }

  // After the fire decision. A HUMAN's press toggles (the button is an edge,
  // like BOOST); the AI's existing fire roll switches it on and it runs until
  // the allowance is gone. Returns true on the tick it starts deploying.
  function spend(c, dt, fire, gate, speedOK, pushS) {
    let started = false;
    if (!gate || !(c.otE > 0)) c.otOn = false;
    else if (fire && c.otOn && c.human) c.otOn = false;
    else if (fire && c.otArmed) { c.otOn = true; started = true; }
    const rate = energy() / Math.max(0.5, pushS || 4);
    const live = c.otOn && !!speedOK;   // paused below OT_MIN_SPEED, not cancelled
    if (live) {
      c.otE = Math.max(0, c.otE - rate * dt);
      if (c.otE <= 0) c.otOn = false;
    }
    c.otT = live && c.otOn ? c.otE / rate : 0;
    return started;
  }

  return { DETECT_FRAC, energy, mj, detectFrac, detectS, crossed, reset, lines, arm, spend };
})();
Object.freeze(OvertakeMode);
