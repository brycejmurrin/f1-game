/* Apex 26 — STOPPED CARS (StoppedCars): race control's second hazard source
   (audit W34, 2026-11-10). Without it CAUTIONS ON did nothing by default: the
   only hazards were DebrisWorld's, which is off unless DEBRIS is on, so a car
   parked on the racing line never raised a flag. scan() lists every car that is
   unfinished, below STOP_V, inside the road's half-width and out of the pit lane
   — retired, crashed or stalled, human or AI alike — as plain { id, frac, sector }
   rows; StoppedCars.create() owns the per-car stop timers and returns the flag
   picture, which RaceControl's machine turns into yellow, then VSC, then marshalled.
   retireCar pushes a retirement past the verge where there is room; such a car,
   RETIRED and parked in the runoff (past the half-width, inside the barrier), is
   an `off` row: a local YELLOW only, never a VSC (#5784 decision B, the FIA
   single waved yellow for a hazard beside the track). Same "stopped" reading as
   AiDrive.stoppedHazard (PR #5336): the box and the pit lane are not the road.
   LAZY_RACE_SESSION: RaceControl's adapter typeof-guards it. */
var StoppedCars = (function () {
  "use strict";
  const STOP_V = 1.5;   // m/s — slower than any car still racing, the SC train included
  const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 0 };   // Tracks.sample writes into these arrays
  function scan(cars, track, out) {
    out.length = 0;
    if (!cars || !track || !(track.total > 0) || typeof Tracks === "undefined") return out;
    const sec = track.def && track.def.sectors;
    const s0 = sec && sec.length === 2 ? sec[0] : 1 / 3, s1 = sec && sec.length === 2 ? sec[1] : 2 / 3;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c || c.finished || !(Math.abs(c.speed || 0) < STOP_V) || !Number.isFinite(c.s)) continue;
      Tracks.sample(track, c.s, smp);
      const x = c.x || 0, ax = Math.abs(x);
      if (c.inPit || c.inPitLane || (Tracks.inPitLane && Tracks.inPitLane(track, c.s, x))) continue;
      // Off the racing surface: only a retirement in the runoff (inside the barrier) counts.
      const off = ax > (smp.hw || 6) ? 1 : 0;
      if (off && (!c.retired || (Tracks.wallAt && ax > Tracks.wallAt(track, c.s, x >= 0 ? 1 : -1)))) continue;
      const frac = (((c.s / track.total) % 1) + 1) % 1;
      out.push({ id: c.num != null ? c.num : i, frac: +frac.toFixed(4), sector: frac < s0 ? 0 : frac < s1 ? 1 : 2, off });
    }
    return out;
  }
  // The timers: seconds each car id has stood on the road. picture() returns
  // null, or the flag it asks for — a local YELLOW in the sector of the car
  // stopped longest once one has stood STOP_DWELL s (a spin that drives off
  // flies nothing), a VSC once one ON the road has stood STOP_VSC s (a runoff
  // row never escalates: no marshal crosses the track for it), and nothing for a car
  // past STOP_RECOVER s: the marshals have had it, and a retirement that cannot
  // be pushed clear (a street circuit's walls) must not neutralise the race forever.
  // A car counts only once it has left where the last reset found it (MOVED_M of
  // arc) or retired: a standing grid, first start or red-flag restart, is not a hazard (#5557).
  const STOP_DWELL = 3, STOP_VSC = 15, STOP_RECOVER = 60, MOVED_M = 2;
  function create() {
    const stopT = new Map(), rows = [], from = new Map(), moved = new Set();
    function picture(cars, track, step) {
      scan(cars, track, rows);
      for (let i = 0; cars && i < cars.length; i++) {
        const c = cars[i];
        if (!c || !Number.isFinite(c.s)) continue;
        const id = c.num != null ? c.num : i;
        if (!from.has(id)) from.set(id, c.s);
        if (c.retired || Math.abs(c.s - from.get(id)) > MOVED_M) moved.add(id);
      }
      const seen = new Set();
      let yellow = null, vsc = 0, n = 0;
      for (const r of rows) {
        if (!moved.has(r.id)) continue;
        seen.add(r.id);
        const t = (stopT.get(r.id) || 0) + step;
        stopT.set(r.id, t);
        if (t < STOP_DWELL || t >= STOP_RECOVER) continue;
        n++;
        if (t >= STOP_VSC && !r.off) vsc++;
        if (!yellow || t > yellow.t) yellow = { t, sector: r.sector, frac: r.frac };
      }
      for (const id of [...stopT.keys()]) if (!seen.has(id)) stopT.delete(id);
      if (!n) return null;
      return vsc ? { level: 2, sector: -1, frac: 0, cause: "VSC", n }
        : { level: 1, sector: yellow.sector, frac: yellow.frac, cause: "YELLOW", n };
    }
    return { picture, reset: () => { stopT.clear(); from.clear(); moved.clear(); } };
  }
  return { create, STOP_RECOVER };
})();
Object.freeze(StoppedCars);
