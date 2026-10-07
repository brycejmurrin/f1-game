"use strict";
/* RivalAudio — the field around you, reduced to the player's TRACK frame for
 * js/audio/engine.js, which owns the sound and deliberately does no track maths.
 *
 * Track frame on purpose: `c.x` is already lateral metres (+right) and `c.s`
 * arc metres, so "alongside on your left" needs no heading convention to get
 * backwards. Fixed slots filled by bounded insertion: this runs beside
 * setEngine every frame, and map().sort().slice() would hand the GC 21 objects
 * a frame to keep the four that survive.
 *
 * VOICES STAY WITH THEIR CAR. Each row carries `slot`, the index of the
 * engine.js voice that plays it, and that index is bound to the CAR for as long
 * as the car stays in the voiced set. It was the distance rank: two rivals
 * swapping places behind you swapped voices, so their pans glided across each
 * other and each note jumped by the slot detune delta (up to 46 cents) exactly
 * when they were side by side. Now a voice is reassigned only when a car
 * leaves the nearest SLOTS and another takes its place.
 */
var RivalAudio = (() => {
  const SLOTS = 4;
  // Never TIGHTER than engine.js's RIVAL_RANGE, or a car winks off at the
  // collector's edge instead of fading out. Kept equal to it.
  const RANGE = 150;             // metres; past this a rival is inaudible anyway
  const slots = Array.from({ length: SLOTS },
    () => ({ lat: 0, arc: 0, rev: 0, approach: 0, dist: 0, voice: "", slot: 0, car: null }));
  const out = [];

  function create(G) {
    const { clamp } = M4;
    const { IDLE_RPM, MAX_RPM } = PhysicsConsts;
    const revSpan = Math.max(1, MAX_RPM - IDLE_RPM);
    // bound[v] = the car voice v is playing (null = free). Per instance, so a
    // second create() (a new race) starts with every voice free.
    const bound = new Array(SLOTS).fill(null);
    const taken = new Array(SLOTS).fill(false);

    /** The nearest rivals to `player`, nearest first. The returned array and the
     *  objects in it are REUSED between calls — read them before the next one.
     *  Each row's `slot` is a stable 0..SLOTS-1 index (see the header). */
    function collect(player) {
      out.length = 0;
      const track = G.track, cars = G.cars;
      if (!player || !track || !cars || player.s == null) return out;
      const lapLen = track.total, half = lapLen * 0.5;
      let n = 0;
      for (const c of cars) {
        if (c === player || c.retired || c.s == null) continue;
        let arc = c.s - player.s;
        if (arc > half) arc -= lapLen; else if (arc < -half) arc += lapLen;
        if (arc > RANGE || arc < -RANGE) continue;
        const lat = (c.x || 0) - (player.x || 0);
        const dist = Math.hypot(lat, arc);
        if (dist > RANGE) continue;
        if (n === SLOTS && dist >= slots[n - 1].dist) continue;
        let at = n < SLOTS ? n++ : SLOTS - 1;
        while (at > 0 && slots[at - 1].dist > dist) {
          const prev = slots[at - 1], cur = slots[at];
          cur.lat = prev.lat; cur.arc = prev.arc; cur.rev = prev.rev;
          cur.approach = prev.approach; cur.dist = prev.dist; cur.voice = prev.voice; cur.car = prev.car;
          cur.net = prev.net; cur.key = prev.key;
          at--;
        }
        const slot = slots[at];
        slot.lat = lat; slot.arc = arc; slot.dist = dist; slot.car = c;
        // Their power unit's voice (engine.js ENGINE_VOICES key): a Ferrari
        // passing you should not sound like your own Mercedes.
        slot.voice = (c.team && c.team.engine) || "";
        slot.rev = clamp(((c.rpm || IDLE_RPM) - IDLE_RPM) / revSpan, 0, 1);
        // DOPPLER wants the LINE-OF-SIGHT closing speed, not the along-track one.
        // d(gap)/dt along the track is (their speed - yours); projected on the
        // line between you that is (arc/dist) of it, so a car level with you
        // (arc 0) is neither closing nor opening. The full Δv with a sign flip at
        // arc 0 stepped the pitch by ~300 cents across 0.2 m of arc as a car
        // came past. Lateral speed is not tracked (track-frame x is a position).
        slot.approach = -(arc / Math.max(dist, 1e-3)) * ((c.speed || 0) - (player.speed || 0));
        // Net-owned rivals get heavier pitch smoothing in engine.js; solo AI stays snappy.
        const np = G.netPlay;
        slot.net = !!(np && np.active && np.active() && np.owns && np.owns(c));
        // Index in G.cars — read-only. Do not call G.wireId here: it caches c._wireId and
        // episode-transients.test.mjs expects that field absent after reset().
        slot.key = G.cars.indexOf(c);
      }
      // Bind voices. A car already bound keeps its voice; a voice whose car left
      // the set is freed; a newcomer takes the lowest free voice.
      for (let v = 0; v < SLOTS; v++) taken[v] = false;
      for (let i = 0; i < n; i++) {
        const v = bound.indexOf(slots[i].car);
        slots[i].slot = v;
        if (v >= 0) taken[v] = true;
      }
      for (let v = 0; v < SLOTS; v++) if (!taken[v]) bound[v] = null;
      for (let i = 0; i < n; i++) {
        const row = slots[i];
        if (row.slot < 0) {
          const v = bound.indexOf(null);
          bound[v] = row.car; row.slot = v;
        }
        row.car = null;   // the row is a frame-local view; the binding lives in `bound`
        out.push(row);
      }
      return out;
    }

    return { collect };
  }
  return { create };
})();
