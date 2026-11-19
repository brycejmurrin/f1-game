var StoppedCars = (function () {
  "use strict";
  const STOP_V = 1.5;
  const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 0 };
  function scan(cars, track, out) {
    out.length = 0;
    if (!cars || !track || !(track.total > 0) || typeof Tracks === "undefined") return out;
    const sec = track.def && track.def.sectors;
    const s0 = sec && sec.length === 2 ? sec[0] : 1 / 3, s1 = sec && sec.length === 2 ? sec[1] : 2 / 3;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c || c.finished || !(Math.abs(c.speed || 0) < STOP_V) || !Number.isFinite(c.s)) continue;
      Tracks.sample(track, c.s, smp);
      if (Math.abs(c.x || 0) > (smp.hw || 6)) continue;
      if (c.inPit || c.inPitLane || (Tracks.inPitLane && Tracks.inPitLane(track, c.s, c.x || 0))) continue;
      const frac = (((c.s / track.total) % 1) + 1) % 1;
      out.push({ id: c.num != null ? c.num : i, frac: +frac.toFixed(4), sector: frac < s0 ? 0 : frac < s1 ? 1 : 2 });
    }
    return out;
  }
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
        if (t >= STOP_VSC) vsc++;
        if (!yellow || t > yellow.t) yellow = { t, sector: r.sector, frac: r.frac };
      }
      for (const id of [...stopT.keys()]) if (!seen.has(id)) stopT.delete(id);
      if (!n) return null;
      return vsc ? { level: 2, sector: -1, frac: 0, cause: "VSC", n }
        : { level: 1, sector: yellow.sector, frac: yellow.frac, cause: "YELLOW", n };
    }
    return { picture, reset: () => { stopT.clear(); from.clear(); moved.clear(); } };
  }
  return { scan, create, STOP_V, STOP_DWELL, STOP_VSC, STOP_RECOVER };
})();
Object.freeze(StoppedCars);
