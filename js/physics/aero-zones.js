/* Apex 26 — AeroZones: the ACTIVE AERO activation zones for the loaded circuit. AeroZones.create(G) — G supplies live `track`. Consumes the Tracks global. Extract… */
const AeroZones = (function () {
  "use strict";

// The real system does NOT ask "is the road ahead straight enough right now".
// The FIA approves fixed ACTIVATION ZONES per circuit, and the standard ECU
// refuses to rotate the wings unless the car is inside one. A zone only exists
// if it is longer than three seconds at racing speed — the rule that leaves
// MONACO with no zones at all, and therefore no active aero.
//
// That distinction is the whole feel of the mechanic. A rolling look-ahead has
// no start and no end: the window opens and closes under
// you as the road bends, so there is nothing to learn and nothing to see coming.
// Fixed zones are a place on the track. You can be shown the boards, you can
// know the next one is 400 m away, and pressing the button becomes a thing you
// do SOMEWHERE rather than a thing you retry until it takes.
//
// Zones are measured against a fixed reference speed, not the car's own: they
// are a property of the CIRCUIT, and the OVERALL SPEED slider must not silently
// add or remove them (PACE scales real m/s — see vTop()/vStd() in game.js).
const X_STRAIGHT_T = 3.0;                       // s of clear road (the FIA's rule)
const X_ZONE_VREF = 70;                         // m/s — "racing speed" for the 3 s test
const X_ZONE_MIN = X_STRAIGHT_T * X_ZONE_VREF;  // 210 m — the FIA's three seconds
const X_ZONE_STEP = 8;                          // m between curvature samples

// Curvature that counts as straight FOR A ZONE. A kink of ~220 m radius must NOT
// qualify — approving zones at that threshold gave MONACO four of them, which is
// exactly the circuit the real rule exists to exclude. A zone is a proper
// straight (r >= ~700 m), and the length test then does the rest.
const X_ZONE_K = 0.0014;

// HOW MANY zones each circuit has, and WHICH straights they are, from the FIA
// Race Director's 2026 event documents ("Circuit Map, Pit Lane Drawing, ..."):
// each map's STRAIGHT MODE table lists zones as "Xm after Tn - ZONE An". The
// count, the pair and the document URL per circuit are the sourced fixture
// tests/data/aero-zones-fia-2026.json; tests/unit/aero-zone-tables.test.mjs
// holds this file to it. Re-checked 2026-11-10 (the old table here was
// "deliberately NOT independently re-researched": monza 2 against the FIA's 4,
// singapore 4 against 5, spa/shanghai/zandvoort with zones on the wrong
// straights). Rows marked PROVISIONAL have no 2026 FIA document yet (the
// event has not run): their count is the last FIA DRS list and stands until
// the 2026 map is published. A circuit with NO entry keeps the pure length
// filter — right ONLY for the retired classics. Every Tracks.SEASON and
// REAL_2026 circuit must have an entry (#3557).
//
// A zone exists where the FIA says, not only where it is longer than three
// seconds: 2026 zones are placed for ENERGY HARVESTING, so some sit on short
// connectors (the Hungaroring carries four). The 210 m filter therefore
// applies only to the classics.
const ZONE_COUNT = {
  monaco: 0, suzuka: 2, albert_park: 5, shanghai: 4, miami: 3, montreal: 4,
  catalunya: 4, redbull: 4, silverstone: 4, spa: 5, hungaroring: 4,
  bahrain: 3, jeddah: 3, imola: 1, zandvoort: 2, monza: 4, baku: 2,
  singapore: 5, cota: 2, mexico: 3, interlagos: 2,
  vegas: 2, qatar: 1, abudhabi: 2,          // PROVISIONAL: last FIA DRS count (2025), no 2026 map yet
  madrid: 2, sepang: 4, istanbul: 2, portimao: 2,
};

// WHICH straights: each zone as [fromTurn, toTurn] — the FIA corner it starts
// after and the corner it runs to (1-based into def.turns, T1 = turns[0]; a
// pair naming the last turn and T1 wraps across the line). Valid because, for
// every circuit marked FIA below, def.turns is the FIA 2026 event-map
// numbering, one apex per numbered corner (W12, 2026-11-10).
//
// A pair resolves to EVERY straight run between the two apexes, merged into
// one span: a real zone runs from the exit of Tn to the braking point of the
// next braking corner, through any flat kink between (Kemmel at Spa, the
// Raffles Boulevard kink at Singapore, Woodcote at Silverstone, the T5 kink at
// Shanghai). The first version picked the single longest run per pair and
// needed an occurrence index whenever a kink split a straight.
//
// miami, montreal and mexico were FIA-numbered on 2026-11-11 (#5316 leftovers,
// tools/track/official-corners.cjs: the F1 timing corner markers). Not curated
// (no 2026 source): imola, vegas, abudhabi — their rows are the old
// geometry-derived pairs.
const AERO_ZONE_TURNS = {
  suzuka: [[14, 15], [18, 1]],                                    // FIA 2026 JPN: after T14, T18
  albert_park: [[2, 3], [5, 6], [8, 9], [10, 11], [14, 1]],       // FIA 2026 AUS: after T14, T2, T5, T8, T10
  shanghai: [[4, 6], [10, 11], [13, 14], [16, 1]],                // FIA 2026 CHN: after T16, T4 (through the T5 kink), T10, T13
  miami: [[8, 11], [16, 17], [19, 1]],                            // FIA 2026 MIA: after T19, T8 (through the T9/T10 kinks), T16
  montreal: [[7, 8], [9, 10], [11, 13], [14, 1]],                // FIA 2026 CAN: after T14, T7, T9, T11 (through the T12 kink)
  catalunya: [[3, 4], [5, 7], [9, 10], [14, 1]],                  // FIA 2026 ESP-BCN: after T14, T3, T5 (through T6), T9
  redbull: [[1, 3], [3, 4], [8, 9], [10, 1]],                     // FIA 2026 AUT: after T10, T1 (through T2), T3, T8
  silverstone: [[5, 6], [7, 9], [14, 15], [18, 1]],               // FIA 2026 GBR: after T18, T5, T7 (through Woodcote), T14
  spa: [[1, 2], [4, 5], [15, 16], [17, 18], [19, 1]],             // FIA 2026 BEL: after T19, T1, T4, T15, T17
  hungaroring: [[1, 2], [3, 4], [11, 12], [14, 1]],               // FIA 2026 HUN: after T14, T1, T3, T11
  imola: [[13, 14]],
  zandvoort: [[10, 11], [14, 1]],                                 // FIA 2026 NED: after T14, T10
  monza: [[3, 4], [7, 8], [10, 11], [11, 1]],                     // FIA 2026 ITA: after T11, T3, T7, T10
  baku: [[2, 3], [20, 1]],                                        // FIA 2026 AZE: after T20, T2
  singapore: [[5, 7], [9, 10], [13, 14], [15, 16], [19, 1]],      // FIA 2026 SGP: after T19, T5 (through T6), T9, T13, T15
  cota: [[11, 12], [20, 1]],                                      // FIA 2026 USA: after T20, T11
  mexico: [[3, 4], [11, 12], [17, 1]],                            // FIA 2026 MEX: after T17, T3, T11
  interlagos: [[3, 4], [14, 1]],                                  // FIA 2026 BRA: after T14 (through the T15 kink), T3
  vegas: [[5, 6], [13, 14]],                                      // PROVISIONAL
  qatar: [[16, 1]],                                               // PROVISIONAL: FIA 2025 QAT DRS, after T16
  abudhabi: [[4, 5], [16, 1]],                                    // PROVISIONAL
};

// Every straight run lying between apex `fromT` and apex `toT`, merged.
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
    s = Math.max(s, a); e = Math.min(e, b);       // clip: an apex inside a run bounds it
    if (e - s > 1e-6) { if (s < s0) s0 = s; if (e > s1) s1 = e; }
  }
  if (!(s1 > s0)) return null;
  const start = s0 % total;
  return { start, end: start + (s1 - s0), len: s1 - s0 };
}

/** THE ZONES A RACE ACTUALLY USES, as a pure function of a BUILT track.
 *
 *  Hoisted out of create()'s build() so there is exactly one answer to "where
 *  are the activation zones". js/ui/track-maps.js ran its OWN curvature scan
 *  (detectDRS: a different threshold, a different minimum length, and no
 *  knowledge of ZONE_COUNT or AERO_ZONE_TURNS at all) and the minimap, the
 *  circuit picker and the track-detail modal all drew THAT. The two disagreed
 *  on nearly every circuit — most plainly at Monaco, where ZONE_COUNT says 0
 *  and no curvature scan can know it, so the map promised six zones the car
 *  would never open. A map that names a zone the race does not have is worse
 *  than a map with none. */
function zonesFor(track) {
  if (!track || !track.total) return [];
  const total = track.total, n = Math.max(8, Math.round(total / X_ZONE_STEP));
  const straight = new Array(n);
  for (let i = 0; i < n; i++) {
    straight[i] = Math.abs(Tracks.curvature(track, (i + 0.5) * total / n)) <= X_ZONE_K;
  }
  if (straight.every((v) => v)) return [{ start: 0, end: total, len: total }];   // a full-lap oval
  let i0 = 0;
  while (i0 < n && straight[i0]) i0++;          // begin at a corner, so no run is cut
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
    /* ALL-OR-NOTHING, AND IT USED TO BE SILENT. One unresolvable pair discards
       the whole hand-authored table and drops through to ZONE_COUNT's "N
       longest straights" — which is a reasonable fallback and a terrible way to
       discover that the table you wrote is not being read. Monza shipped
       [[9,10],[11,1]] for as long as the table has existed; [9,10] bounds no
       straight on the built centreline, so neither pair was ever used.
       tests/unit/aero-zones-vm.test.mjs now fails on an unresolved pair; this
       says it out loud at runtime too, for a circuit whose geometry moves under
       a table nobody re-checks. */
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
  let zones = [];                               // [{start, end, len}] in arc metres

  function build() {
    const track = G.track;
    Log.info("game", "AeroZones.build track=" + ((track && track.def && track.def.id) || "?"));
    zones = zonesFor(track);
    return zones;
  }

  // Per car per physics step (game.js inAeroZone). One façade read (G is a dictionary-mode
  // object, so every G.track is a hash probe + getter call) and an indexed loop, not for…of
  // with track.total re-read per zone (PERF-HUNT-2 S9). The live G.track read stays: a
  // dropped world (track null) must still answer null, as it always did.
  function at(s) {
    const track = G.track;
    if (!track || !track.total) return null;
    const L = track.total;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (s >= z.start && s <= z.end) return z;
      if (z.end > L && s + L <= z.end) return z;   // wrapped
    }
    return null;
  }

  function ahead(s) {
    const track = G.track;
    if (!zones.length || !track || !track.total) return Infinity;
    if (at(s)) return 0;
    const L = track.total;
    let best = Infinity;
    // Indexed: same order as for…of, no iterator alloc on the hot ahead() path.
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      let d = ((z.start - s) % L + L) % L;
      if (d < best) best = d;
    }
    return best;
  }

  return { build, at, ahead, get zones() { return zones; } };
}

  // X_ZONE_* / X_STRAIGHT_T / spanForTurnPair stay file-local: zonesFor + the
  // tables are the public surface (tests/ui hard-code the metre constants).
  return {
    create, zonesFor, ZONE_COUNT, AERO_ZONE_TURNS,
  };
})();
Object.freeze(AeroZones);
