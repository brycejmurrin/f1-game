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
