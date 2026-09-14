/* Apex 26 — MOSPORT scenery. Ontario drumlin farmland: mature mixed woodland
   hard against the outside of every corner, a club-scale paddock, and terrain
   that genuinely falls — the circuit's whole character is a 47 m drop-and-climb.
   Closer to Donington than to Fuji; nothing here is a Grand Prix facility.

   PLACEHOLDER. Generic dressing only — enough to build and to drive, not the
   circuit's own landmarks. Turn One, Clayton, Quebec, Moss (5a/5b), the Mario
   Andretti Straightaway, the Esses and Whites are all NAMED WAYS in OSM with
   measured lap fractions in docs/notes/MOSPORT-PLAN-2026-09-14.md §2, so the
   dressing pass has real anchors to work from rather than guesses. */
(function () {
  "use strict";
  (window.TrackScenery = window.TrackScenery || {})["mosport"] = function (api) {
    const { out, every, tree, forestEdge, guardrail, marshalPost } = api;
    if (!out) return;
    const LEAF = [0.22, 0.40, 0.20];
    const ARMCO = [0.72, 0.73, 0.75];

    // Continuous armco both sides. Mosport's reputation is built on having
    // almost no run-off — the barrier is the edge of the world here.
    guardrail(0.000, 0.499, 1, 5.0, ARMCO);
    guardrail(0.500, 0.999, 1, 5.0, ARMCO);
    guardrail(0.000, 0.499, -1, 5.0, ARMCO);
    guardrail(0.500, 0.999, -1, 5.0, ARMCO);

    // Ontario mixed woodland, set back off the barrier on both sides.
    forestEdge(0.000, 0.499, 1, 18);
    forestEdge(0.500, 0.999, 1, 18);
    forestEdge(0.000, 0.499, -1, 18);
    forestEdge(0.500, 0.999, -1, 18);
    every(21, (k) => { tree(k, 1, 30, 9.5, LEAF); tree(k, -1, 32, 8.8, LEAF); });
    every(37, (k) => { marshalPost(k, k % 2 ? 1 : -1, 8); });
  };
})();
