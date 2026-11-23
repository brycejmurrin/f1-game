"use strict";
/* CarSfx — the player car's contact sounds, reduced to four 0..1 levels for
 * GameAudio.setCarSfx, plus the pit-stop wheel guns on the stop's edges.
 *
 *   scrub    fronts past their grip peak (frontUtil > 1 is understeer)
 *   lock     a locked front wheel (c.wheelLock, which the flat-spot model owns)
 *   surface  off the road, scaled by speed
 *   pitLim   rolling in the pit lane on the limiter
 *
 * Read-only on the car: every input is the car's own state, never the track's
 * curvature, so it sits in docs/PHYSICS.md's "surface" column.
 */
var CarSfx = (() => {
  const SFX = { scrub: 0, lock: 0, surface: 0, pitLim: 0, wet: false };
  // Born Double, values kept: the 0s are Smi fields, and the first fractional level split the map (PERF-HUNT-5).
  SFX.scrub = SFX.lock = SFX.surface = 0.5; SFX.scrub = SFX.lock = SFX.surface = 0;

  function create(G) {
    let lastPit = "none", lastCar = null, lastRaceT = NaN;
    // LEVELS ONCE PER FRAME (#5052). game.js calls update() on every physics
    // substep (up to 5 a frame) for the wheel-gun EDGES below; the levels only
    // need the frame's last one. Substeps of one frame run back to back in well
    // under a millisecond and frames are >= 8 ms apart, so a 4 ms wall-clock gap
    // separates frames; an on/off flip of any level is sent at once (onsets).
    const SEND_GAP_MS = 4;
    let lastSendMs = -Infinity, lastOnMask = -1;
    const wall = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

    /** Pure: the levels for car `c`, where v01 is |speed| / vTop. Exposed for tests. */
    function levels(c, v01, out) {
      const o = out || {};
      const moving = Math.max(0, Math.min(1, (v01 - 0.04) / 0.10));   // silent at a crawl
      const fu = +c.frontUtil || 0;
      o.scrub = c.offroad ? 0 : Math.max(0, Math.min(1, (fu - 0.98) / 0.20)) * moving;
      o.lock = Math.max(0, Math.min(1, +c.wheelLock || 0)) * moving;
      o.surface = c.offroad ? Math.min(1, 0.25 + 0.75 * v01) * moving : 0;
      // ON THE LIMITER is the lane's own predicate (PitLane.held): the entry,
      // and the exit road after the stop — not just pitState "lane".
      const held = G.pits && G.pits.held ? G.pits.held(c) : c.pitState === "lane";
      o.pitLim = held && v01 > 0.05 ? 1 : 0;
      return o;
    }

    function update(c) {
      if (!c) return;
      const v01 = Math.abs(+c.speed || 0) / Math.max(1, G.vTop());
      levels(c, v01, SFX);
      const mask = (SFX.scrub > 0) | (SFX.lock > 0) << 1 | (SFX.surface > 0) << 2 | (SFX.pitLim > 0) << 3;
      const ms = wall();
      if (mask !== lastOnMask || ms - lastSendMs >= SEND_GAP_MS || c !== lastCar) {
        lastOnMask = mask; lastSendMs = ms;
        SFX.wet = !!(G.isWetRoad && G.isWetRoad());
        GameAudio.setCarSfx(SFX);
      }
      // The wheel guns fire on the stop's edges: loosen as the car drops into
      // the box, tighten as it is released. A new car (a new race) resets the edge.
      const ps = c.pitState || "none";
      const rt = G.raceT;
      // A rewind / flashback restores an older raceT: re-seed the edge silently
      // so crossing a stop boundary in the jump does not replay the guns.
      if (Number.isFinite(rt) && Number.isFinite(lastRaceT) && rt + 0.02 < lastRaceT) {
        lastCar = c; lastPit = ps;
      }
      if (Number.isFinite(rt)) lastRaceT = rt;
      if (c !== lastCar) { lastCar = c; lastPit = ps; }
      if (ps !== lastPit) {
        if (ps === "box") GameAudio.pitGun(false);
        // Released to the exit only: a red flag clears a car in the box straight
        // to "none", and that is not a crew tightening wheels.
        else if (lastPit === "box" && ps === "out") GameAudio.pitGun(true);
        lastPit = ps;
      }
    }

    return { update, levels };
  }
  return { create };
})();
