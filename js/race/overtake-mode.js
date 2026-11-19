const OvertakeMode = (function () {
  "use strict";

  const DETECT_FRAC = 0.9;

  function consts() { return (typeof PhysicsConsts !== "undefined" && PhysicsConsts) || {}; }
  function energy() { const P = consts(); return (P.OT_MJ || 0.5) / (P.ES_MJ || 4); }
  function mj(c) { return c && c.otE > 0 ? c.otE * (consts().ES_MJ || 4) : 0; }

  function detectFrac(def) {
    const f = def && def.otDetectFrac;
    if (Number.isFinite(f) && typeof TrackSpace !== "undefined") return TrackSpace.sceneryFrac(def, f);
    return DETECT_FRAC;
  }
  const _detectBy = new WeakMap();
  function detectS(track) {
    if (!track) return 0;
    let s = _detectBy.get(track);
    if (s === undefined) { s = detectFrac(track.def) * track.total; _detectBy.set(track, s); }
    return s;
  }

  function crossed(prevS, s, at, L) {
    if (!(L > 0) || !Number.isFinite(prevS) || !Number.isFinite(s)) return false;
    const step = ((s - prevS) % L + L) % L;
    if (!(step > 0) || step >= L / 2) return false;
    const to = ((at - prevS) % L + L) % L;
    return to > 0 && to <= step;
  }

  function note(c, what) {
    if (typeof Log !== "undefined") Log[c.human ? "info" : "debug"]("race", "Overtake " + what + " car=" + c.code + " lap=" + (c.lap | 0));
  }

  function reset(c) {
    c.otE = 0; c.otOn = false; c.otEarned = false; c.otArmed = false; c.otT = 0;
    c._otS = null; c._otLap = null;
    c._otHold = false;
  }

  function lines(c, track, gapAhead, open) {
    if (c._otLap == null || c._otS == null) { c._otLap = c.lap | 0; c._otS = c.s; }
    if (track && crossed(c._otS, c.s, detectS(track), track.total)) {
      c.otEarned = !!open && gapAhead < (consts().OT_GAP || 1);
      if (c.otEarned) note(c, "earned gap=" + (+gapAhead).toFixed(2) + "s");
      else if (!open && gapAhead < (consts().OT_GAP || 1)) note(c, "denied detection-closed");
    }
    c._otS = c.s;
    if ((c.lap | 0) > c._otLap) {
      c._otLap = c.lap | 0;
      const left = c.otE;
      if (c.otEarned) {
        c.otE = energy();
        c._otHold = (c.lap | 0) === 1;
      } else if (c._otHold && left > 0) {
        c._otHold = false;
      } else {
        c.otE = 0;
        c._otHold = false;
      }
      if (c.otE > 0 && c.otEarned) note(c, "granted mj=" + mj(c).toFixed(2));
      else if (left > 0 && !(c.otE > 0)) note(c, "lapsed unused=" + (left * (consts().ES_MJ || 4)).toFixed(2) + "MJ");
      c.otEarned = false; c.otOn = false;
    }
  }

  function arm(c, gate, speedOK) {
    if (!gate) { if (c.otOn) note(c, "cut gate-closed"); c.otOn = false; }
    c.otArmed = !!gate && !!speedOK && c.otE > 0 && !c.otOn;
    return c.otArmed;
  }

  function prepare(c, fire, gate, speedOK, pushS) {
    let started = false;
    const wasOn = c.otOn;
    if (!gate || !(c.otE > 0)) c.otOn = false;
    else if (fire && c.otOn && c.human) c.otOn = false;
    else if (fire && c.otArmed) { c.otOn = true; started = true; }
    if (started) note(c, "on mj=" + mj(c).toFixed(2));
    else if (wasOn && !c.otOn) note(c, gate ? "off" : "cut gate-closed");
    c.otT = c.otOn && speedOK ? c.otE / (energy() / Math.max(0.5, pushS || 4)) : 0;
    return started;
  }
  function consume(c, dt, thrust, pushS) {
    if (!(thrust && c.otOn && c.otT > 0 && dt > 0)) { c.otT = 0; return 0; }
    const cost = energy() / Math.max(0.5, pushS || 4) * dt;
    const fraction = Math.min(1, c.otE / cost);
    c.otE = Math.max(0, c.otE - cost);
    if (c.otE <= 0) { c.otOn = false; note(c, "spent"); }
    c.otT = c.otOn ? c.otE / (cost / dt) : 0;
    return fraction;
  }
  function spend(c, dt, fire, gate, speedOK, pushS) {
    const started = prepare(c, fire, gate, speedOK, pushS);
    consume(c, dt, !(c.brakeDemand > 0), pushS);
    return started;
  }

  return { DETECT_FRAC, energy, mj, detectFrac, detectS, crossed, reset, lines, arm, prepare, consume, spend };
})();
Object.freeze(OvertakeMode);
