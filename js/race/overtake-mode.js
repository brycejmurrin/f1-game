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
  // deployable window. That unit is a label, not a power model: BOOST drains
  // it at drainFor(c) = lerp(DRAIN_HI 0.26, DRAIN_LO 0.14, ersDeploy) per real
  // second (PhysicsConsts; no PACE term), so a full battery lasts 3.8–7.1 s of
  // deploy (5.0 s at the default ersDeploy 0.5) — not the ≈ 11.5 s that 4 MJ
  // would last at the MGU-K's real 350 kW. The allowance
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
  const CUT = "cut gate-closed";
  const DETECT_FRAC = 0.9;   // default Detection Line: 90 % of the lap from the timing line

  function consts() { return (typeof PhysicsConsts !== "undefined" && PhysicsConsts) || {}; }
  function energy() { const P = consts(); return (P.OT_MJ || 0.5) / (P.ES_MJ || 4); }
  function rate(pushS) { return energy() / Math.max(0.5, pushS || 4); }   // allowance per second of push
  function mj(c) { return c && c.otE > 0 ? c.otE * (consts().ES_MJ || 4) : 0; }

  // The Detection Line as a RACING-frame lap fraction (0 = the timing line).
  // A circuit may set `otDetectFrac`, authored in the same frame as its other
  // frac-keyed tables — so it goes through TrackSpace.sceneryFrac, which applies
  // def._sceneryShift and the reverse/mirror flip. Unset = DETECT_FRAC, already
  // measured from the line.
  function detectFrac(def) {
    const f = def && def.otDetectFrac;
    return Number.isFinite(f) && typeof TrackSpace !== "undefined" ? TrackSpace.sceneryFrac(def, f) : DETECT_FRAC;
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
    c.otE = c.otT = 0; c.otOn = c.otEarned = c.otArmed = false;
    // _otHold: a grant made while the gate was shut, kept until it reopens.
    // _otShut: the gate shut as arm() last saw it (null = not yet); _otAct: an
    // Activation this tick. _otS/_otLap are re-seeded from the car next tick.
    c._otHold = false; c._otS = c._otLap = c._otShut = c._otAct = null;
  }

  function detectionCrossed(c, track) {
    return !!track && c._otLap != null && crossed(c._otS, c.s, detectS(track), track.total);
  }

  // Once per car per tick, BEFORE arming: the two lines. `gapAhead` is seconds
  // to the car ahead on the road; `open` is RaceControl.otDetectOpen() — no
  // earning under the Safety Car or in low grip.
  function lines(c, track, gapAhead, open, detected = detectionCrossed(c, track)) {
    if (c._otLap == null) c._otLap = c.lap | 0;   // seed; _otS is set below (detection reads false while unseeded)
    if (detected) {
      // Number.isFinite: `null < 1` is true in JS (null → 0), so a missing gap
      // would earn Overtake with nobody ahead. game.js passes Infinity; keep the
      // pure rule honest for every caller.
      const gapOk = Number.isFinite(gapAhead) && gapAhead < (consts().OT_GAP || 1);
      c.otEarned = !!open && gapOk;
      if (c.otEarned) note(c, "earned gap=" + (+gapAhead).toFixed(2) + "s");
      else if (!open && gapOk) note(c, "denied detection-closed");
    }
    c._otS = c.s;
    // The Activation Line. Highest lap seen, so a car shoved back over the line
    // and re-crossing (RaceControl.lineTransition's recross) is not re-granted
    // — nor stripped of what it was given the first time.
    //
    // A grant made while the race-wide gate (RaceControl.otEnabled, as arm()
    // last saw it: _otShut) is shut — lap 1 before the leader starts lap 2, a Safety
    // Car or red flag and its one-lap hold after, low grip — would otherwise
    // lapse at the next Activation with no chance to use it (#6546 P9). HOLD
    // it: it survives every Activation while the gate stays shut, and its one
    // usable lap starts at the first Activation with the gate open (the
    // crossing that opens it, for the leader: arm() releases it there). Later
    // grants with the gate open still lapse after one unused lap (B7.2.3(c)).
    if (c._otAct = (c.lap | 0) > c._otLap) {
      c._otLap = c.lap | 0;
      const left = c.otE;
      if (c.otEarned) { c.otE = energy(); c._otHold = c._otLap === 1 || c._otShut; }
      else if (!c._otHold || !(left > 0)) { c.otE = 0; c._otHold = false; }
      else if (!c._otShut) c._otHold = false;   // held, gate open (or never armed): this lap is its lap
      if (c.otEarned) note(c, "granted mj=" + mj(c).toFixed(2));
      else if (left > 0 && !(c.otE > 0)) note(c, "lapsed unused=" + mj({ otE: left }).toFixed(2) + "MJ");
      c.otEarned = c.otOn = false;
    }
  }

  // `gate`: the race-wide switch (otEnabled) and the car's own (not finished,
  // not held by the pit limiter). `speedOK`: above OT_MIN_SPEED.
  // It also records the gate for lines()' hold: the crossing that opens it
  // (the leader's, this very tick) starts a held allowance's usable lap.
  function arm(c, gate, speedOK) {
    if (!(c._otShut = !gate) && c._otAct) c._otHold = false;
    if (!gate) { if (c.otOn) note(c, CUT); c.otOn = false; }
    return c.otArmed = !!gate && !!speedOK && c.otE > 0 && !c.otOn;
  }

  // After the fire decision. A HUMAN's press toggles (the button is an edge,
  // like BOOST); the AI's existing fire roll switches it on and it runs until
  // the allowance is gone. Returns true on the tick it starts deploying.
  // Decide this tick's toggle/gates before braking and aero are evaluated.
  function prepare(c, fire, gate, speedOK, pushS) {
    let started = false;
    const wasOn = c.otOn;
    if (!gate || !(c.otE > 0) || fire && c.otOn && c.human) c.otOn = false;
    else if (fire && c.otArmed) c.otOn = started = true;
    if (started) note(c, "on mj=" + mj(c).toFixed(2));
    else if (wasOn && !c.otOn) note(c, gate ? "off" : CUT);
    c.otT = c.otOn && speedOK ? c.otE / rate(pushS) : 0;
    return started;
  }
  // Only actual current-tick thrust pays the allowance. The returned fraction
  // caps a final partial tick's thrust to the energy it can fund.
  function consume(c, dt, thrust, pushS) {
    if (!(thrust && c.otOn && c.otT > 0 && dt > 0)) { c.otT = 0; return 0; }
    const cost = rate(pushS) * dt;
    const fraction = Math.min(1, c.otE / cost);
    c.otE = Math.max(0, c.otE - cost);
    if (c.otE <= 0) { c.otOn = false; note(c, "spent"); }
    c.otT = c.otOn ? c.otE / (cost / dt) : 0;
    return fraction;
  }
  // Legacy callers retain their pedal-based adapter; production physics uses
  // prepare + consume after resolving this tick's actual throttle/brake branch.
  function spend(c, dt, fire, gate, speedOK, pushS) {
    const started = prepare(c, fire, gate, speedOK, pushS);
    consume(c, dt, !(c.brakeDemand > 0), pushS);
    return started;
  }

  return { DETECT_FRAC, energy, mj, detectFrac, detectS, crossed, detectionCrossed, reset, lines, arm, prepare, consume, spend };
})();
Object.freeze(OvertakeMode);
