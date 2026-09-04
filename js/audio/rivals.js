"use strict";
/* RivalAudio — the field around you, reduced to the player's TRACK frame.
 *
 * The game had no opponent audio at all and no panner anywhere in the graph, so
 * a car alongside was silent and the mirror was your only cue for it. This is
 * the half of that feature which knows about the track; js/audio/engine.js owns
 * the half that knows about sound, and deliberately does no track maths.
 *
 * The TRACK frame, not the world frame, on purpose. `c.x` is already lateral
 * metres (+right) and `c.s` already arc metres, so "alongside on your left"
 * falls straight out with no trigonometry and no heading convention to get
 * backwards — and on a circuit the track frame IS what alongside means.
 *
 * Fixed slots filled by bounded insertion: this runs beside setEngine in the
 * hot path, and the obvious map().sort().slice() would hand the GC 21 objects
 * every frame to keep the four that survive.
 */
const RivalAudio = (() => {
  const SLOTS = 4;
  const RANGE = 70;              // metres; past this a rival is inaudible anyway
  const slots = Array.from({ length: SLOTS },
    () => ({ lat: 0, arc: 0, rev: 0, approach: 0, dist: 0 }));
  const out = [];

  function create(G) {
    const { clamp } = M4;
    const { IDLE_RPM, MAX_RPM } = PhysicsConsts;
    const revSpan = Math.max(1, MAX_RPM - IDLE_RPM);

    /** The nearest rivals to `player`, nearest first. The returned array and the
     *  objects in it are REUSED between calls — read them before the next one. */
    function collect(player) {
      out.length = 0;
      const track = G.track, cars = G.cars;
      if (!player || !track || !cars || player.s == null) return out;
      const L = track.total, half = L * 0.5;
      let n = 0;
      for (const c of cars) {
        if (c === player || c.retired || c.s == null) continue;
        let arc = c.s - player.s;
        if (arc > half) arc -= L; else if (arc < -half) arc += L;
        if (arc > RANGE || arc < -RANGE) continue;
        const lat = (c.x || 0) - (player.x || 0);
        const dist = Math.hypot(lat, arc);
        if (dist > RANGE) continue;
        if (n === SLOTS && dist >= slots[n - 1].dist) continue;
        let at = n < SLOTS ? n++ : SLOTS - 1;
        while (at > 0 && slots[at - 1].dist > dist) {
          const prev = slots[at - 1], cur = slots[at];
          cur.lat = prev.lat; cur.arc = prev.arc; cur.rev = prev.rev;
          cur.approach = prev.approach; cur.dist = prev.dist;
          at--;
        }
        const slot = slots[at];
        slot.lat = lat; slot.arc = arc; slot.dist = dist;
        slot.rev = clamp(((c.rpm || IDLE_RPM) - IDLE_RPM) / revSpan, 0, 1);
        // Closing rate along the arc. d(gap)/dt is (their speed - yours);
        // whether that CLOSES the gap depends on which side of you they are,
        // which is what the sign carries.
        slot.approach = -Math.sign(arc) * ((c.speed || 0) - (player.speed || 0));
      }
      for (let i = 0; i < n; i++) out.push(slots[i]);
      return out;
    }

    return { collect };
  }
  return { create };
})();
