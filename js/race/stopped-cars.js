/* Apex 26 — STOPPED CARS (StoppedCars): race control's second hazard source
   (audit W34, 2026-11-10). Without it CAUTIONS ON did nothing by default: the
   only hazards were DebrisWorld's, which is off unless DEBRIS is on, so a car
   parked on the racing line never raised a flag. scan() lists every car that is
   unfinished, below STOP_V, inside the road's half-width and out of the pit lane
   — retired, crashed or stalled, human or AI alike — as plain { id, frac, sector }
   rows; RaceControl's machine owns the timers (yellow, then VSC, then marshalled).
   retireCar pushes a retirement past the verge where there is room, so most
   retirements are off the road and stay GREEN. Same "stopped" reading as
   AiDrive.stoppedHazard (PR #5336): the box and the pit lane are not the road.
   LAZY_RACE_SESSION: RaceControl's adapter typeof-guards it. */
var StoppedCars = (function () {
  "use strict";
  const STOP_V = 1.5;   // m/s — slower than any car still racing, the SC train included
  const smp = {};
  function scan(cars, track, out) {
    out.length = 0;
    if (!cars || !track || !(track.total > 0) || typeof Tracks === "undefined") return out;
    const sec = track.def && track.def.sectors;
    const s0 = sec && sec.length === 2 ? sec[0] : 1 / 3, s1 = sec && sec.length === 2 ? sec[1] : 2 / 3;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c || c.finished || !(Math.abs(c.speed || 0) < STOP_V) || !Number.isFinite(c.s)) continue;
      Tracks.sample(track, c.s, smp);
      if (Math.abs(c.x || 0) > (smp.hw || 6)) continue;   // off the racing surface
      if (c.inPit || c.inPitLane || (Tracks.inPitLane && Tracks.inPitLane(track, c.s, c.x || 0))) continue;
      const frac = (((c.s / track.total) % 1) + 1) % 1;
      out.push({ id: c.num != null ? c.num : i, frac: +frac.toFixed(4), sector: frac < s0 ? 0 : frac < s1 ? 1 : 2 });
    }
    return out;
  }
  // The timers: seconds each car id has stood on the road. picture() returns
  // null, or the flag it asks for — a local YELLOW in the sector of the car
  // stopped longest once one has stood STOP_DWELL s (a spin that drives off
  // flies nothing), a VSC once one has stood STOP_VSC s, and nothing for a car
  // past STOP_RECOVER s: the marshals have had it, and a retirement that cannot
  // be pushed clear (a street circuit's walls) must not neutralise the race forever.
  const STOP_DWELL = 3, STOP_VSC = 15, STOP_RECOVER = 60;
  function create() {
    const stopT = new Map(), rows = [];
    function picture(cars, track, step) {
      scan(cars, track, rows);
      const seen = new Set();
      let yellow = null, vsc = 0, n = 0;
      for (const r of rows) {
        seen.add(r.id);
        const t = (stopT.get(r.id) || 0) + step;
        stopT.set(r.id, t);
        if (t < STOP_DWELL || t >= STOP_RECOVER) continue;
        n++;
        if (t >= STOP_VSC) vsc++;
        if (!yellow || t > yellow.t) yellow = { t, sector: r.sector, frac: r.frac };
      }
      for (const id of [...stopT.keys()]) if (!seen.has(id)) stopT.delete(id);
      if (!n) return null;
      return vsc ? { level: 2, sector: -1, frac: 0, cause: "VSC", n }
        : { level: 1, sector: yellow.sector, frac: yellow.frac, cause: "YELLOW", n };
    }
    return { picture, reset: () => stopT.clear() };
  }
  return { scan, create, STOP_V, STOP_DWELL, STOP_VSC, STOP_RECOVER };
})();
