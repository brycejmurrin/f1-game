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
const CarSfx = (() => {
  const SFX = { scrub: 0, lock: 0, surface: 0, pitLim: 0, wet: false };

  function create(G) {
    let lastPit = "none", lastCar = null;

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
      SFX.wet = !!(G.isWetRoad && G.isWetRoad());
      GameAudio.setCarSfx(SFX);
      // The wheel guns fire on the stop's edges: loosen as the car drops into
      // the box, tighten as it is released. A new car (a new race) resets the edge.
      const ps = c.pitState || "none";
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
