/* Apex 26 — OVERTAKE MODE (FIA 2026 Sporting Regs B7.2.3(c)): one Detection Line per circuit, the 1 s check there, and the 0.5 MJ allowance granted at the Activation Line and spent at will over the following lap. Pure per-car rules; game.js supplies the gap and the gates. */
const OvertakeMode = (function () {
  "use strict";

  // THE RULE (FIA 2026 F1 Sporting Regulations Section B, Iss. 07, B7.2.3(c);
  // explainers: formula1.com "All you need to know about F1's new power units",
  // the-race.com "Boost, overtake mode, active aero — key 2026 F1 terms"):
  // a car LESS THAN ONE SECOND behind the car ahead AT THE DETECTION LINE (one
  // per circuit, nominally out of the final corner) is given Overtake at the
  // Activation Line (the timing line), and may then deploy an extra 0.5 MJ at
  // will during that following lap — not "arm anywhere within 1 s, a fixed
  // 3–5 s push, then a 9–14 s lockout".
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
  const _detectBy = new WeakMap();   // per track object, weakly: never pins a dropped world
  function detectS(track) {
    if (!track) return 0;
    let s = _detectBy.get(track);
    if (s === undefined) { s = detectFrac(track.def) * track.total; _detectBy.set(track, s); }
    return s;
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

  // One line per EDGE, never per tick: the human at info, the AI at debug.
  // Guarded so a bare VM that loads this file without js/core/log.js still runs.
  function note(c, what) {
    if (typeof Log !== "undefined") Log[c.human ? "info" : "debug"]("race", "Overtake " + what + " car=" + c.code + " lap=" + (c.lap | 0));
  }

  function reset(c) {
    c.otE = 0; c.otOn = false; c.otEarned = false; c.otArmed = false; c.otT = 0;
    c._otS = null; c._otLap = null;   // re-seeded from the car on its next tick
    c._otHold = false;               // grace: keep a fresh grant across one Activation
  }

  // Once per car per tick, BEFORE arming: the two lines. `gapAhead` is seconds
  // to the car ahead on the road; `open` is RaceControl.otDetectOpen() — no
  // earning under the Safety Car or in low grip.
  function lines(c, track, gapAhead, open) {
    if (c._otLap == null || c._otS == null) { c._otLap = c.lap | 0; c._otS = c.s; }
    if (track && crossed(c._otS, c.s, detectS(track), track.total)) {
      c.otEarned = !!open && gapAhead < (consts().OT_GAP || 1);
      if (c.otEarned) note(c, "earned gap=" + (+gapAhead).toFixed(2) + "s");
      else if (!open && gapAhead < (consts().OT_GAP || 1)) note(c, "denied detection-closed");
    }
    c._otS = c.s;
    // The Activation Line. Highest lap seen, so a car shoved back over the line
    // and re-crossing (RaceControl.lineTransition's recross) is not re-granted
    // — nor stripped of what it was given the first time.
    //
    // RaceControl.otEnabled stays false until the LEADER starts lap 2, so a
    // detection on lap 0 that grants at the first S/F (lap → 1) would otherwise
    // expire unused at the next Activation — the moment the gate opens. Hold
    // ONLY that opening-lap grant across one Activation; later grants still
    // lapse after one unused lap (B7.2.3(c)).
    if ((c.lap | 0) > c._otLap) {
      c._otLap = c.lap | 0;
      const left = c.otE;
      if (c.otEarned) {
        c.otE = energy();
        c._otHold = (c.lap | 0) === 1;
      } else if (c._otHold && left > 0) {
        c._otHold = false;   // kept through the gate-closed Activation
      } else {
        c.otE = 0;
        c._otHold = false;
      }
      if (c.otE > 0 && c.otEarned) note(c, "granted mj=" + mj(c).toFixed(2));
      else if (left > 0 && !(c.otE > 0)) note(c, "lapsed unused=" + (left * (consts().ES_MJ || 4)).toFixed(2) + "MJ");
      c.otEarned = false; c.otOn = false;
    }
  }

  // `gate`: the race-wide switch (otEnabled) and the car's own (not finished,
  // not held by the pit limiter). `speedOK`: above OT_MIN_SPEED.
  function arm(c, gate, speedOK) {
    if (!gate) { if (c.otOn) note(c, "cut gate-closed"); c.otOn = false; }
    c.otArmed = !!gate && !!speedOK && c.otE > 0 && !c.otOn;
    return c.otArmed;
  }

  // After the fire decision. A HUMAN's press toggles (the button is an edge,
  // like BOOST); the AI's existing fire roll switches it on and it runs until
  // the allowance is gone. Returns true on the tick it starts deploying.
  function spend(c, dt, fire, gate, speedOK, pushS) {
    let started = false;
    const wasOn = c.otOn;
    if (!gate || !(c.otE > 0)) c.otOn = false;
    else if (fire && c.otOn && c.human) c.otOn = false;
    else if (fire && c.otArmed) { c.otOn = true; started = true; }
    if (started) note(c, "on mj=" + mj(c).toFixed(2));
    else if (wasOn && !c.otOn) note(c, gate ? "off" : "cut gate-closed");
    const rate = energy() / Math.max(0.5, pushS || 4);
    // Paused below OT_MIN_SPEED, and while the pedal is down, not cancelled: the
    // push only enters the acceleration in the throttle branch, and braking wins
    // there, so burning the allowance through a braking zone spent MJ for no
    // thrust. spend() runs before this tick's brake decision, so it reads the
    // LAST tick's pedal (c.brakeDemand, written at the end of updateCar) — one
    // tick of lag at 60 Hz, absent (undefined) on a fresh car = not braking.
    const live = c.otOn && !!speedOK && !(c.brakeDemand > 0);
    if (live) {
      c.otE = Math.max(0, c.otE - rate * dt);
      if (c.otE <= 0) { c.otOn = false; note(c, "spent"); }
    }
    c.otT = live && c.otOn ? c.otE / rate : 0;
    return started;
  }

  return { DETECT_FRAC, energy, mj, detectFrac, detectS, crossed, reset, lines, arm, spend };
})();
Object.freeze(OvertakeMode);
