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

// WHICH straights, expressed as the turns that bound them — the half of the
// research ZONE_COUNT's own comment calls "not encoded" and says why: def.turns
// used to number corners as "the N strongest curvature peaks in lap order",
// which was not reliable FIA-equivalent numbering, so a hard-coded (fromTurn,
// toTurn) pair could name the wrong straight outright (35 of 68 resolved spans
// came out short or curved — catalunya T3->T4 as 26 m, abudhabi T5->T6 as 45 m).
//
// `docs/tracks/START-LINES.md` fixed the root cause: every circuit below now has
// a verified start line (line on a straight, first apex hand-checked), so
// `def.turns[0]` really is Turn 1 and the array runs in physical order. That
// makes turn-pair authoring safe again — with one deliberate omission: BAHRAIN
// and JEDDAH stay on the length-only fallback below, because their start lines
// were never re-derived (no reliable coordinate was found for either) and
// jeddah's still measures IN A CORNER (`tools/startline-probe.cjs`). Turn
// numbers built on an unverified line are exactly the trap this table exists to
// avoid, so those two circuits are excluded rather than guessed.
//
// Each pair is the turn BEFORE the straight and the turn AFTER it (1-based, T1
// meaning `def.turns[0]`; a pair naming the last turn and T1 wraps across the
// line). A THIRD element picks the Nth-longest straight in that turn-bounded
// window when two separate straights share the same bounding pair (a mild kink
// between them too weak to register its own turn peak) — only albert_park needs
// it, for the two short straights both bounded by T10/T11.
//
// Deliberately NOT independently re-researched corner-by-corner: `ZONE_COUNT`
// above is the sourced fact (a published zone COUNT); this table names exactly
// the turns bounding the straights the existing N-longest-by-length selection
// already picks for that count, verified byte-identical in
// `tools/aero-zone-turns.cjs`'s derivation and by `tests/unit/aero-zones-turns.test.mjs`.
// So it does not change which straight is selected anywhere it applies — it
// only makes the selection ROBUST to a future geometry change (a new curvature
// scan parameter, an extra dense sample) that would otherwise silently move a
// zone by re-sorting `runs`, and it gives a future correction (a real published
// "DRS zone is between Turn 4 and Turn 5" claim) something to be checked
// against instead of a bare distance.
const AERO_ZONE_TURNS = {
  suzuka: [[15, 16], [18, 1]],
  albert_park: [[2, 3], [10, 11], [10, 11, 2], [11, 12], [14, 1]],
  shanghai: [[10, 11], [14, 15], [15, 16], [16, 1]],
  miami: [[11, 12], [17, 18], [19, 1]],
  montreal: [[8, 9], [11, 12], [13, 14], [14, 1]],
  catalunya: [[2, 3], [4, 5], [8, 9], [14, 1]],
  redbull: [[1, 2], [2, 3], [8, 9], [10, 1]],
  silverstone: [[5, 6], [10, 11], [15, 16], [18, 1]],
  spa: [[1, 2], [3, 4], [9, 10], [11, 12], [20, 1]],
  hungaroring: [[1, 2], [4, 5], [10, 11], [14, 1]],
  imola: [[14, 15]],
  zandvoort: [[11, 12], [14, 1]],
  monza: [[9, 10], [11, 1]],
  baku: [[2, 3], [20, 1]],
  singapore: [[8, 9], [14, 15], [15, 16], [19, 1]],
  cota: [[10, 11], [20, 1]],
  mexico: [[3, 4], [11, 12], [17, 1]],
  interlagos: [[2, 3], [15, 1]],
  vegas: [[5, 6], [13, 14]],
  qatar: [[16, 1]],
  abudhabi: [[4, 5], [16, 1]],
};

// Which turns bound a run [start,end) (arc metres, `end` may exceed `total` when
// the run wraps the line). 1-based, T1 meaning turns[0]; a run starting before
// the first apex is bounded by the LAST turn (it is the straight the line sits
// on). Mirrors tools/aero-zone-turns.cjs's derivation exactly — that tool is
// how AERO_ZONE_TURNS above was generated and re-checked.
function turnsBounding(turns, total, run) {
  const f0 = (run.start / total) % 1, f1 = (run.end / total) % 1;
  let before = -1;
  for (let i = 0; i < turns.length; i++) { if (turns[i] <= f0) before = i; else break; }
  const after = turns.findIndex((t) => t >= f1);
  return [before < 0 ? turns.length : before + 1, after < 0 ? 1 : after + 1];
}

// Resolve one authored [fromTurn, toTurn, occ?] entry to the actual run the
// geometry produced. `occ` (default 1) picks the Nth-LONGEST run among those
// sharing that exact turn pair — needed where a straight is split by a kink too
// weak to register its own turn apex, so two runs land on the same pair (only
// albert_park's T10->T11 does today). Returns null if the pair no longer
// matches anything (a stale entry after a def.turns change) rather than
// silently grabbing the wrong straight.
function runForTurnPair(runs, turns, total, entry) {
  const [fromT, toT, occ] = entry;
  const matches = runs.filter((r) => {
    const [f, t] = turnsBounding(turns, total, r);
    return f === fromT && t === toT;
  }).sort((a, b) => b.len - a.len);
  return matches[(occ || 1) - 1] || null;
}

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
    const id = track.def && track.def.id;
    // Turn-keyed, where the start line is trustworthy enough to number turns
    // by (see AERO_ZONE_TURNS above). Falls through to the length-only
    // selection below on any pair that no longer resolves, rather than
    // dropping a zone the circuit is supposed to have.
    const turnPairs = AERO_ZONE_TURNS[id];
    if (turnPairs && track.def.turns && track.def.turns.length) {
      const resolved = turnPairs
        .map((entry) => runForTurnPair(runs, track.def.turns, total, entry))
        .filter(Boolean);
      if (resolved.length === turnPairs.length) {
        zones = resolved.sort((a, b) => a.start - b.start);
        return zones;
      }
    }
    // With a known real count, take the N LONGEST straights and ignore the
    // length rule: it is the count that is well sourced, and the FIA's own test
    // is a time-at-speed with a safety veto that no distance bar reproduces.
    // Melbourne's five and the Hungaroring's four include connectors well under
    // 210 m, so applying X_ZONE_MIN as well would silently under-deliver them.
    const want = ZONE_COUNT[id];
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

  return {
    create, X_ZONE_K, X_ZONE_MIN, X_ZONE_VREF, X_STRAIGHT_T,
    // Exposed for tests/tools only (tests/unit/aero-zones-turns.test.mjs,
    // tools/aero-zone-turns.cjs) — build() is the one real call site.
    ZONE_COUNT, AERO_ZONE_TURNS, turnsBounding, runForTurnPair,
  };
})();
