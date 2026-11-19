const AeroZones = (function () {
  "use strict";

const X_STRAIGHT_T = 3.0;
const X_ZONE_VREF = 70;
const X_ZONE_MIN = X_STRAIGHT_T * X_ZONE_VREF;
const X_ZONE_STEP = 8;

const X_ZONE_K = 0.0014;

const ZONE_COUNT = {
  monaco: 0, suzuka: 2, albert_park: 5, shanghai: 4, miami: 3, montreal: 4,
  catalunya: 4, redbull: 4, silverstone: 4, spa: 5, hungaroring: 4,
  bahrain: 3, jeddah: 3, imola: 1, zandvoort: 2, monza: 4, baku: 2,
  singapore: 5, cota: 2, mexico: 3, interlagos: 2,
  vegas: 2, qatar: 1, abudhabi: 2,
  madrid: 2, sepang: 4, istanbul: 2, portimao: 2,
};

const AERO_ZONE_TURNS = {
  suzuka: [[14, 15], [18, 1]],
  albert_park: [[2, 3], [5, 6], [8, 9], [10, 11], [14, 1]],
  shanghai: [[4, 6], [10, 11], [13, 14], [16, 1]],
  miami: [[8, 11], [16, 17], [19, 1]],
  montreal: [[7, 8], [9, 10], [11, 13], [14, 1]],
  catalunya: [[3, 4], [5, 7], [9, 10], [14, 1]],
  redbull: [[1, 3], [3, 4], [8, 9], [10, 1]],
  silverstone: [[5, 6], [7, 9], [14, 15], [18, 1]],
  spa: [[1, 2], [4, 5], [15, 16], [17, 18], [19, 1]],
  hungaroring: [[1, 2], [3, 4], [11, 12], [14, 1]],
  imola: [[13, 14]],
  zandvoort: [[10, 11], [14, 1]],
  monza: [[3, 4], [7, 8], [10, 11], [11, 1]],
  baku: [[2, 3], [20, 1]],
  singapore: [[5, 7], [9, 10], [13, 14], [15, 16], [19, 1]],
  cota: [[11, 12], [20, 1]],
  mexico: [[3, 4], [11, 12], [17, 1]],
  interlagos: [[3, 4], [14, 1]],
  vegas: [[5, 6], [13, 14]],
  qatar: [[16, 1]],
  abudhabi: [[4, 5], [16, 1]],
};

function spanForTurnPair(runs, turns, total, entry) {
  const [fromT, toT] = entry;
  if (!(fromT >= 1 && fromT <= turns.length && toT >= 1 && toT <= turns.length) || fromT === toT) return null;
  const a = (((turns[fromT - 1] % 1) + 1) % 1) * total;
  let b = (((turns[toT - 1] % 1) + 1) % 1) * total;
  if (b <= a) b += total;
  let s0 = Infinity, s1 = -Infinity;
  for (const r of runs) {
    let s = r.start, e = r.end;
    while (e <= a) { s += total; e += total; }
    s = Math.max(s, a); e = Math.min(e, b);
    if (e - s > 1e-6) { if (s < s0) s0 = s; if (e > s1) s1 = e; }
  }
  if (!(s1 > s0)) return null;
  const start = s0 % total;
  return { start, end: start + (s1 - s0), len: s1 - s0 };
}

function zonesFor(track) {
  if (!track || !track.total) return [];
  const total = track.total, n = Math.max(8, Math.round(total / X_ZONE_STEP));
  const straight = new Array(n);
  for (let i = 0; i < n; i++) {
    straight[i] = Math.abs(Tracks.curvature(track, (i + 0.5) * total / n)) <= X_ZONE_K;
  }
  if (straight.every((v) => v)) return [{ start: 0, end: total, len: total }];
  let i0 = 0;
  while (i0 < n && straight[i0]) i0++;
  const runs = [];
  let cur = null;
  for (let k = 0; k < n; k++) {
    const i = (i0 + k) % n;
    if (straight[i]) {
      if (!cur) cur = { start: i * total / n, len: 0 };
      cur.len += total / n;
    } else if (cur) { cur.end = cur.start + cur.len; runs.push(cur); cur = null; }
  }
  if (cur) { cur.end = cur.start + cur.len; runs.push(cur); }
  const id = track.def && track.def.id;
  const turnPairs = AERO_ZONE_TURNS[id];
  if (turnPairs && track.def.turns && track.def.turns.length) {
    const resolved = turnPairs
      .map((entry) => spanForTurnPair(runs, track.def.turns, total, entry))
      .filter(Boolean);
    if (resolved.length === turnPairs.length) return resolved.sort((a, b) => a.start - b.start);
    Log.warn("game", `AeroZones: ${id} turn table unusable — ` +
      `${resolved.length}/${turnPairs.length} pairs bound a straight; falling back to ZONE_COUNT`);
  }
  const want = ZONE_COUNT[id];
  if (want != null) {
    return runs.slice().sort((a, b) => b.len - a.len).slice(0, want)
               .sort((a, b) => a.start - b.start);
  }
  return runs.filter((r) => r.len >= X_ZONE_MIN);
}


function create(G) {
  Log.info("game", "AeroZones.create");
  let zones = [];

  function build() {
    const track = G.track;
    Log.info("game", "AeroZones.build track=" + ((track && track.def && track.def.id) || "?"));
    zones = zonesFor(track);
    return zones;
  }

  function at(s) {
    const track = G.track;
    if (!track || !track.total) return null;
    const L = track.total;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (s >= z.start && s <= z.end) return z;
      if (z.end > L && s + L <= z.end) return z;
    }
    return null;
  }

  function ahead(s) {
    const track = G.track;
    if (!zones.length || !track || !track.total) return Infinity;
    if (at(s)) return 0;
    const L = track.total;
    let best = Infinity;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      let d = ((z.start - s) % L + L) % L;
      if (d < best) best = d;
    }
    return best;
  }

  return { build, at, ahead, get zones() { return zones; } };
}

  return {
    create, zonesFor, ZONE_COUNT, AERO_ZONE_TURNS,
  };
})();
Object.freeze(AeroZones);
