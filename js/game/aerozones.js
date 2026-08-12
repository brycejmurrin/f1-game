/* Apex 26 — AeroZones: the ACTIVE AERO activation zones for the loaded circuit.
   AeroZones.create(G) — G supplies live `track`. Consumes the Tracks global.

   Extracted verbatim from js/game.js. Pure circuit GEOMETRY: it reads the
   spline's curvature and produces a list of arc-metre spans, and it knows
   nothing about a car, a speed or a switch. That is what made it the first
   thing worth lifting out of game.js — no closure state crosses the seam except
   `track`, and the zones array now has exactly one owner.

   The physics side stays in game.js on purpose: xStraightAhead() (is THIS car in
   a zone) and aeroDfMult() (the downforce multiplier) both read car state and
   the aero-load constants, so they belong next to the rest of the driving model.

   Must load BEFORE js/game.js (see index.html / tools/manifest.cjs). */
const AeroZones = (function () {
  "use strict";

// The real system does NOT ask "is the road ahead straight enough right now".
// The FIA approves fixed ACTIVATION ZONES per circuit, and the standard ECU
// refuses to rotate the wings unless the car is inside one. A zone only exists
// if it is longer than three seconds at racing speed — the rule that leaves
// MONACO with no zones at all, and therefore no active aero.
//
// That distinction is the whole feel of the mechanic. A rolling look-ahead (what
// this used to be) has no start and no end: the window opens and closes under
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

// HOW MANY zones each circuit really has. Authored, because zone placement is
// an FIA decision and not a property of the geometry — measured, the curvature
// scan below disagrees almost everywhere: baku 8 against 2, qatar 4 against 1,
// imola 7 against 1, spa 7 against 5. Moving the threshold cannot fix it in
// either direction:
//
//   * 2026 zones are placed for ENERGY HARVESTING, not overtaking, so several
//     sit on short connectors far below any sensible straight-length bar. F1
//     calls the Hungaroring "notorious for its relative lack of straights"; it
//     carries four.
//   * Lusail has a ~1 km straight and is allowed exactly ONE.
//   * The FIA's real test is a THREE-SECOND duration at expected speed plus a
//     per-corner safety veto — a time rule with an override, not a distance one.
//
// COUNTS ONLY, deliberately. Zones were first authored as (fromTurn, toTurn)
// pairs so each row could be checked against its source quote, and that FAILED
// validation: 35 of 68 resolved spans came out short or curved (catalunya
// T3->T4 as 26 m, abudhabi T5->T6 as 45 m). The cause is that def.turns numbers
// corners as "the N strongest curvature peaks in lap order", which is not
// reliably FIA turn numbering — gentle corners fall below the cut and chicanes
// merge. Boundaries built on that numbering are not trustworthy, so only the
// well-sourced half of the research is encoded here: the count. Placement stays
// with the geometry, which keeps the N longest qualifying straights.
//
// A circuit with NO entry keeps the pure length filter — right for the retired
// classics, which have no FIA zone list under either ruleset.
const ZONE_COUNT = {
  // ── 2026 Straight Mode, as published by Formula 1 ────────────────────────
  // Monaco is 0 on purpose, and not a gap: for 2026 active aero is switched off
  // entirely there, cars "locked in Corner Mode for the entire Monte Carlo
  // weekend". The scan already returned 0; now it does so for the stated reason.
  monaco: 0, suzuka: 2, albert_park: 5, shanghai: 4, miami: 3, montreal: 4,
  catalunya: 4, redbull: 4, silverstone: 4, spa: 5, hungaroring: 4,
  // ── 2025 DRS, the stand-in where 2026 is unpublished ─────────────────────
  // A PROXY, not fact: every 2026 circuit published so far came in 1-3 zones
  // ABOVE its 2025 DRS count, so these are likely conservative.
  bahrain: 3, jeddah: 3, imola: 1, zandvoort: 2, monza: 2, baku: 2,
  singapore: 4, cota: 2, mexico: 3, interlagos: 2, vegas: 2, qatar: 1,
  abudhabi: 2,
};

function create(G) {
  let zones = [];                               // [{start, end, len}] in arc metres

  // Scan the whole lap for contiguous runs under X_ZONE_K and keep the ones long
  // enough to qualify. Runs are found on the OPEN lap then the wrap is stitched,
  // so a straight crossing the start line is one zone rather than two short ones
  // that each fail the length test.
  function build() {
    zones = [];
    const track = G.track;
    if (!track || !track.total) return zones;
    const total = track.total, n = Math.max(8, Math.round(total / X_ZONE_STEP));
    const straight = new Array(n);
    for (let i = 0; i < n; i++) {
      straight[i] = Math.abs(Tracks.curvature(track, (i + 0.5) * total / n)) <= X_ZONE_K;
    }
    if (straight.every((v) => v)) {   // a full-lap oval: one zone, the whole lap
      zones = [{ start: 0, end: total, len: total }];
      return zones;
    }
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
    // With a known real count, take the N LONGEST straights and ignore the
    // length rule: it is the count that is well sourced, and the FIA's own test
    // is a time-at-speed with a safety veto that no distance bar reproduces.
    // Melbourne's five and the Hungaroring's four include connectors well under
    // 210 m, so applying X_ZONE_MIN as well would silently under-deliver them.
    const want = ZONE_COUNT[(track.def && track.def.id)];
    if (want != null) {
      zones = runs.slice().sort((a, b) => b.len - a.len).slice(0, want)
                  .sort((a, b) => a.start - b.start);
      return zones;
    }
    for (const r of runs) if (r.len >= X_ZONE_MIN) zones.push(r);
    return zones;
  }

  // The zone containing arc position s, or null. Zones can run past `total` when
  // they wrap the start line, hence the second test.
  function at(s) {
    const track = G.track;
    if (!track || !track.total) return null;
    for (const z of zones) {
      if (s >= z.start && s <= z.end) return z;
      if (z.end > track.total && s + track.total <= z.end) return z;   // wrapped
    }
    return null;
  }

  // Metres from s to the start of the next zone (0 when already inside one), or
  // Infinity on a circuit with no zones at all.
  function ahead(s) {
    const track = G.track;
    if (!zones.length || !track) return Infinity;
    if (at(s)) return 0;
    let best = Infinity;
    for (const z of zones) {
      let d = z.start - s;
      if (d < 0) d += track.total;
      if (d < best) best = d;
    }
    return best;
  }

  return { build, at, ahead, get zones() { return zones; } };
}

  return { create, X_ZONE_K, X_ZONE_MIN, X_ZONE_VREF, X_STRAIGHT_T };
})();
