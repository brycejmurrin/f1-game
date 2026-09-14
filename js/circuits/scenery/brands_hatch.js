/* Apex 26 — BRANDS HATCH scenery (data only), split out of js/circuits/brands_hatch.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds.

   BASELINE DRESSING. This is the generic pass that makes the circuit build and
   read as a circuit; it carries none of BRANDS HATCH's own landmarks yet. The
   per-circuit brief is docs/tracks/brands_hatch.md and the workflow is the
   scenery-dress skill. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["brands_hatch"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, tree, bush,
        guardrail, marshalPost, grandstandEx } = api;

      const FOL = [0.20, 0.38, 0.18];
      const FOL_D = FOL.map((v) => v * 0.82);

      // 1. TREE LINE — ranks set back from the tarmac, thinned by a hash so the
      //    spacing does not read as a fence of identical trunks.
      every(26, (k) => {
        const h = hash(k * 31);
        if (h < 0.34) return;
        for (const side of [-1, 1]) {
          const dist = 20 + h * 16 + (side < 0 ? 4 : 0);
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 8)) continue;
          tree(k, side, dist, 7 + h * 5, h < 0.55 ? FOL : FOL_D);
          if (h > 0.78) bush(k, side, dist - 7, FOL_D);
        }
      });

      // 2. ARMCO — a continuous run on both sides, the minimum that keeps the
      //    track edge reading as a circuit rather than a road through a field.
      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 11, [0.78, 0.78, 0.80]);

      // 3. MARSHAL POSTS — roughly every eighth of a lap, outside the racing line.
      for (let i = 0; i < 8; i++) marshalPost(Math.round((i / 8) * n), 1, 13);

      // 4. START/FINISH STANDS — one pair at the line so the lap has a focal
      //    point. shell and crowd are COLOURS, not indices: pass null and the
      //    emitter picks a livery out of def.standSet. (Passing 0 and 1 here
      //    put the number 1 through as a fascia colour, which validateGeometry
      //    rejects as "invalid or non-finite color" and the whole prop mesh
      //    ships empty — and only on the circuits where the second stand was
      //    not geometry-suppressed, so it looked intermittent.)
      grandstandEx(0.005, -1, 15, 130, null, null);
      grandstandEx(0.955, 1, 16, 90, null, null);
  };
