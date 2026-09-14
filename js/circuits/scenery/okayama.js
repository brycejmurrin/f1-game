/* Apex 26 — OKAYAMA scenery (data only), split out of js/circuits/okayama.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   TI Circuit Aida / Okayama International — the narrowest, most enclosed lap in
   the roster. Everything is pulled hard against the tarmac: broadleaf and bamboo
   to the barrier line, pale clay earth banks instead of gravel, low-rise club
   buildings instead of a Grand Prix paddock. Clockwise; +1 is the INFIELD.

   Brief: docs/tracks/okayama.md §4. Block -> row map:
     1-3   palette / full-lap enclosure  (§5 narrow lap, §6 keep the outfield close)
     4     s=0.005  +1  6   pit wall hoarding, marshal post, club control building
     5     s=0.015  -1  10  main grandstand, forest closing behind its top row
     6     s=0.070  -1  8   stands end: guardrail, forestEdge, ridge behind
     7     s=0.1172 -1  5   Turn 1 outside: tyreWall on a clay bank, cameraTower
     8     s=0.1172 +1  9   Turn 1 inside: marshalPost, billboard, clay apron
     9     s=0.1658 -1  7   Attwood curve: guardrail then an unbroken tree wall
    10     s=0.2107 +1  14  Williams corner infield: club pair + motorhome row
    11     s=0.2928 -1  6   Moss S first flick: dark forest to the guardrail
    12     s=0.3048 +1  9   Moss S second flick: spectatorHill, bush, billboard
    13     s=0.3372 -1  6   Hairpin: tyreWall on a clay cut, stepped bank, bamboo
    14     s=0.3992 +1  11  Revolver: marshalPost, sponsorHoarding, wooded infield
    15     s=0.4552 -1  9   climbing back section: forest both shoulders + ridges
    16     s=0.6322 -1  5   Hobbs: tyreWall, small stand on the bank, cameraTower
    17     s=0.6937 +1  10  Mike Knight: marshalPost, guardrail, trees both sides
    18     s=0.8678 +1  8   Last Corner: pit entry building, billboard, stand left

   Emitter notes measured with tools/track/verify-track.cjs on this def:
     * ridge() is a BACKGROUND emitter here — the scenery guard drops any ridge
       whose footprint comes within ~47 m of the road, so the clay cuts that hug
       the barrier are built with spectatorHill() in a clay colour and the
       ridges sit behind the forest (hill() pads the anchor by w/2 + h on top of
       a 62 m floor), which is what "ridge rising behind" wants anyway. The lap
       folds tight enough that the hairpin at s=0.3372 has track on every side
       within ~100 m and takes NO ridge at any width — that row asks for a
       tyreWall and a stepped bank, not a ridge, so nothing is lost.
     * ridge()'s `ang` must be a finite heading; anchor().r is not one (it goes
       non-finite on straights and the prop validates out), so headingAt() takes
       it from two anchors.
     * motorhome() and groundPatch() emit invalid geometry on this def at every
       distance/side/opts combination tried, so the paddock row and the clay
       aprons are built from place() boxes instead. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["okayama"] =
  function (api) {
      const { n, hash, every, anchor, onTrack,
        tree, bush, hedge, forestEdge, building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower, billboard,
        sponsorHoarding, place, ridge } = api;

      const K = (s) => ((Math.round(s * n) % n) + n) % n;

      // 1. PALETTE — warm humid green. Broadleaf canopies are heavy and dark,
      //    bamboo clumps are the light yellow-green, earth is pale clay.
      const LEAF      = [0.19, 0.37, 0.17];
      const LEAF_D    = [0.13, 0.27, 0.14];
      const LEAF_L    = [0.26, 0.44, 0.20];
      const BAMBOO    = [0.41, 0.53, 0.22];
      const SCRUB     = [0.22, 0.34, 0.18];
      const GRASS     = [0.30, 0.44, 0.22];
      const CLAY      = [0.69, 0.61, 0.48];
      const CLAY_D    = [0.57, 0.49, 0.38];
      const ARMCO     = [0.80, 0.80, 0.82];
      const CLUB_WALL = [0.86, 0.86, 0.84];
      const CLUB_ROOF = [0.34, 0.40, 0.46];
      const APRON     = [0.40, 0.40, 0.42];

      // Wooded hillside behind the treeline. ridge() needs world x/z plus a
      // finite heading, and refuses to build within ~47 m of the road — so the
      // anchor is pushed out by half the ridge width plus its height.
      const headingAt = (k, side, dist) => {
        const a = anchor(k, side, dist), b = anchor((k + 4) % n, side, dist);
        return Math.atan2(b.c[0] - a.c[0], b.c[2] - a.c[2]);
      };
      const hill = (s, side, dist, len, w, h, col) => {
        const k = K(s), a = anchor(k, side, Math.max(dist, 62) + w * 0.5 + h);
        ridge(a.c[0], a.c[2], a.c[1], headingAt(k, side, dist), len, w, h,
          col || [0.28, 0.40, 0.23]);
      };
      // Pale clay cut hard against the barrier — spectatorHill is the only
      // near-track earth-bank emitter that survives the guard at these gaps.
      const clayCut = (s0, s1, side, gap, h) =>
        spectatorHill(s0, s1, side, gap, { h: h, col: CLAY, steps: 1 });

      // 2. FULL-LAP ENCLOSURE — armco right on the edge the whole way round
      //    (club course: barrier, not run-off) with a wire fence just behind it
      //    holding the trees back.
      for (const side of [-1, 1]) {
        guardrail(0.0, 1.0, side, 4, ARMCO);
        fence(0.0, 1.0, side, 7.5, 2.0, [0.46, 0.48, 0.44]);
      }

      // 3. THE TREE WALL — the identifying quality. Ranks start only ~9 m off
      //    the tarmac, hashed so trunks do not line up, with bamboo clumps and
      //    bush infill closing the sky gap at the foot.
      every(16, (k) => {
        const h0 = hash(k * 17 + 3);
        for (const side of [-1, 1]) {
          const h = hash(k * 29 + (side < 0 ? 101 : 211));
          if (h < 0.12) continue;                     // occasional gap
          const ranks = h > 0.72 ? 3 : 2;
          for (let r = 0; r < ranks; r++) {
            const hr = hash(k * 7 + r * 53 + (side < 0 ? 13 : 71));
            const dist = 9 + r * 7.5 + hr * 4.5;
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 5)) continue;
            const bam = hr > 0.82;
            tree(k, side, dist,
              bam ? 9 + hr * 5 : 7.5 + hr * 6.5,
              bam ? BAMBOO : (r === 0 ? LEAF_D : (r > 1 ? LEAF_L : LEAF)));
          }
          if (h0 > 0.52) bush(k, side, 7 + h0 * 3, SCRUB);
        }
      });

      // 4. START/FINISH, PIT WALL (+1, 6 m) — hoarding at wall height, marshal
      //    post at the exit end, low two-storey club control building behind.
      sponsorHoarding(0.982, 0.062, 1, 6, { h: 1.15 });
      marshalPost(K(0.060), 1, 7);
      building(K(0.012), 1, 13, 26, 8.5, 12,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 2 });
      building(K(0.040), 1, 14, 16, 6.0, 10,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 2 });
      for (let i = 0; i < 6; i++)                     // paddock apron slabs
        place(K(0.006 + i * 0.010), 1, 20, [26, 0.08, 22], APRON);

      // 5. MAIN GRANDSTAND (-1, 10 m) — one modest covered bank, short, forest
      //    closing immediately behind its top row.
      grandstandEx(0.015, -1, 10, 110, null, null);
      forestEdge(0.985, 0.075, -1, 30, { col: LEAF, h: 12, rows: 2 });
      hill(0.030, -1, 62, 150, 34, 14, [0.27, 0.39, 0.22]);
      billboard(K(0.050), -1, 10, 9, 3.2, [0.78, 0.20, 0.18]);

      // 6. STANDS END, s=0.070 (-1, 8 m) — trees take over at once: guardrail
      //    hard on the edge, forest one row back, ridge rising behind.
      guardrail(0.068, 0.118, -1, 5, ARMCO);
      forestEdge(0.068, 0.120, -1, 9, { col: LEAF_D, h: 13, rows: 3 });
      hill(0.090, -1, 62, 130, 30, 15, [0.26, 0.38, 0.22]);

      // 7. TURN 1 / FIRST CORNER, s=0.1172 (-1, 5 m) — downhill right into a
      //    pale clay cut with almost no run-off: tyres against the bank, green
      //    ridge above, camera tower on the bank shoulder.
      tyreWall(0.104, 0.136, -1, 5, [0.84, 0.78, 0.22]);
      clayCut(0.100, 0.140, -1, 9, 6.5);
      cameraTower(K(0.1172), -1, 15);
      hill(0.1172, -1, 62, 120, 28, 16, [0.25, 0.37, 0.21]);
      for (let i = 0; i < 7; i++) {
        const s = 0.104 + (i / 6) * 0.032, hh = hash(i * 61 + 9);
        bush(K(s), -1, 16 + hh * 2.5, SCRUB);
        tree(K(s), -1, 19 + hh * 6, 8 + hh * 5, hh > 0.6 ? BAMBOO : LEAF);
      }

      // 8. TURN 1 INSIDE, s=0.1172 (+1, 9 m) — marshal post, one billboard and
      //    pale clay spilling out from under the apex kerb.
      marshalPost(K(0.1172), 1, 9);
      billboard(K(0.126), 1, 9, 8, 3.0, [0.16, 0.32, 0.62]);
      for (let i = 0; i < 5; i++)
        place(K(0.110 + i * 0.004), 1, 9, [7, 0.07, 7], i & 1 ? CLAY : CLAY_D);

      // 9. ATTWOOD CURVE, s=0.1658 (-1, 7 m) — guardrail then an unbroken tree
      //    wall: ranks and bush infill to the barrier line, no sky gap.
      guardrail(0.145, 0.200, -1, 4, ARMCO);
      forestEdge(0.145, 0.200, -1, 7, { col: LEAF_D, h: 14, rows: 3 });
      forestEdge(0.145, 0.200, -1, 19, { col: LEAF, h: 16, rows: 2 });
      hedge(0.145, 0.200, -1, 6, 1.6, SCRUB);
      for (let i = 0; i < 10; i++) {
        const s = 0.145 + (i / 9) * 0.055, hh = hash(i * 37 + 5);
        tree(K(s), -1, 10 + hh * 3, 9 + hh * 6, hh > 0.7 ? BAMBOO : LEAF_D);
      }

      // 10. WILLIAMS CORNER, s=0.2107 (+1, 14 m) — the one building cluster on
      //     the lap: a low club facility pair and a motorhome row on the paddock
      //     apron (place() boxes — motorhome() validates out on this def), with
      //     a tree screen between them and the track.
      building(K(0.2107), 1, 14, 22, 7.0, 14,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 2 });
      building(K(0.2280), 1, 15, 17, 5.5, 11,
        { col: [0.80, 0.82, 0.80], roof: CLUB_ROOF, floors: 1 });
      for (let i = 0; i < 4; i++)
        place(K(0.2000 + i * 0.008), 1, 26, [22, 0.08, 20], APRON);
      for (let i = 0; i < 5; i++) {
        const k = K(0.1955 + i * 0.0090);
        place(k, 1, 24, [11.5, 3.4, 3.1], [0.90, 0.90, 0.92]);   // hauler body
        place(k, 1, 28.5, [9.0, 2.6, 2.6], [0.74, 0.76, 0.80]);  // awning/trailer
      }
      for (let i = 0; i < 9; i++) {
        const s = 0.192 + (i / 8) * 0.050, hh = hash(i * 23 + 77);
        tree(K(s), 1, 8 + hh * 2.5, 8 + hh * 4, LEAF);
        if (hh > 0.5) bush(K(s), 1, 6.5, SCRUB);
      }

      // 11. MOSS S, FIRST FLICK, s=0.2928 (-1, 6 m) — trees right up to the
      //     guardrail, forest dense and dark, marshal post in the only gap.
      guardrail(0.270, 0.300, -1, 4, ARMCO);
      forestEdge(0.270, 0.300, -1, 6, { col: LEAF_D, h: 15, rows: 3 });
      forestEdge(0.270, 0.300, -1, 18, { col: LEAF, h: 17, rows: 2 });
      marshalPost(K(0.2928), -1, 7);
      for (let i = 0; i < 8; i++) {
        const s = 0.270 + (i / 7) * 0.030, hh = hash(i * 43 + 19);
        bush(K(s), -1, 6.5 + hh, LEAF_D);
        tree(K(s), -1, 9 + hh * 3, 10 + hh * 6, LEAF_D);
      }

      // 12. MOSS S, SECOND FLICK, s=0.3048 (+1, 9 m) — low grass spectator
      //     bank, bush along its foot, billboard angled at the exit.
      spectatorHill(0.296, 0.326, 1, 9, { h: 4.5, col: GRASS });
      hedge(0.296, 0.326, 1, 7, 1.3, SCRUB);
      for (let i = 0; i < 6; i++)
        bush(K(0.296 + (i / 5) * 0.030), 1, 7.5 + hash(i * 11 + 3) * 1.5, SCRUB);
      billboard(K(0.3130), 1, 9, 9, 3.2, [0.90, 0.84, 0.20]);

      // 13. HAIRPIN, s=0.3372 (-1, 6 m) — tyres on a pale clay cut, a stepped
      //     spectator bank in the slope above, bamboo clumps on the crest.
      tyreWall(0.322, 0.356, -1, 6, [0.86, 0.30, 0.16]);
      clayCut(0.320, 0.358, -1, 10, 7.0);
      spectatorHill(0.324, 0.354, -1, 18, { h: 8.0, col: GRASS, steps: 3 });
      for (let i = 0; i < 10; i++) {
        const s = 0.320 + (i / 9) * 0.038, hh = hash(i * 67 + 31);
        tree(K(s), -1, 28 + hh * 5, 11 + hh * 6, BAMBOO);
        if (hh > 0.55) tree(K(s), -1, 35 + hh * 4, 10 + hh * 5, BAMBOO);
      }
      marshalPost(K(0.3480), -1, 8);

      // 14. REVOLVER, s=0.3992 (+1, 11 m) — marshal post and hoarding on the
      //     infield, tree stand behind: the infield here is wooded, not open.
      marshalPost(K(0.3992), 1, 11);
      sponsorHoarding(0.386, 0.414, 1, 11, { h: 1.4 });
      forestEdge(0.380, 0.424, 1, 16, { col: LEAF, h: 14, rows: 3 });
      for (let i = 0; i < 10; i++) {
        const s = 0.378 + (i / 9) * 0.048, hh = hash(i * 13 + 41);
        tree(K(s), 1, 14 + hh * 6, 9 + hh * 6, hh > 0.75 ? BAMBOO : LEAF);
        if (hh > 0.6) bush(K(s), 1, 12 + hh * 2, SCRUB);
      }

      // 15. CLIMBING BACK SECTION, s=0.4552 (-1, 9 m) — forest on both
      //     shoulders and ridges running with the track as it gains height.
      forestEdge(0.440, 0.620, -1, 9, { col: LEAF, h: 14, rows: 3 });
      forestEdge(0.440, 0.620, 1, 10, { col: LEAF_L, h: 13, rows: 2 });
      hill(0.4552, -1, 62, 140, 30, 16, [0.27, 0.39, 0.22]);
      hill(0.5200, -1, 62, 150, 32, 20, [0.25, 0.37, 0.21]);
      hill(0.5900, -1, 62, 140, 30, 24, [0.24, 0.36, 0.20]);
      hill(0.5550, -1, 62, 120, 24, 14, [0.28, 0.40, 0.23]);
      marshalPost(K(0.5100), -1, 9);
      for (let i = 0; i < 20; i++) {
        const s = 0.440 + (i / 19) * 0.180, hh = hash(i * 19 + 7);
        bush(K(s), -1, 6.5 + hh * 2, SCRUB);
        bush(K(s), 1, 7 + hh * 2, LEAF_D);
        tree(K(s), hh > 0.5 ? 1 : -1, 8 + hh * 4, 9 + hh * 7,
          hh > 0.82 ? BAMBOO : LEAF_D);
      }

      // 16. HOBBS CORNER, s=0.6322 (-1, 5 m) — the far hairpin at the top of
      //     the climb: tyres against an earth bank, a small stand on the bank
      //     above it, camera tower beside.
      tyreWall(0.618, 0.650, -1, 5, [0.84, 0.78, 0.22]);
      clayCut(0.614, 0.654, -1, 9, 6.0);
      grandstandEx(0.6322, -1, 20, 55, null, null);
      cameraTower(K(0.6450), -1, 18);
      hill(0.6322, -1, 62, 120, 28, 20, [0.24, 0.36, 0.21]);
      marshalPost(K(0.6220), 1, 8);
      for (let i = 0; i < 5; i++)
        place(K(0.6280 + i * 0.004), 1, 9, [7, 0.07, 7], i & 1 ? CLAY_D : CLAY);
      for (let i = 0; i < 8; i++) {
        const s = 0.616 + (i / 7) * 0.038, hh = hash(i * 59 + 23);
        tree(K(s), -1, 32 + hh * 6, 10 + hh * 5, hh > 0.6 ? BAMBOO : LEAF);
        bush(K(s), 1, 6.5 + hh * 2, SCRUB);
      }

      // 17. MIKE KNIGHT, s=0.6937 (+1, 10 m) — marshal post, guardrail and
      //     tree ranks close on both sides all the way down the descent.
      marshalPost(K(0.6937), 1, 10);
      guardrail(0.665, 0.760, 1, 4, ARMCO);
      guardrail(0.665, 0.760, -1, 4, ARMCO);
      forestEdge(0.665, 0.775, 1, 8, { col: LEAF_D, h: 14, rows: 3 });
      forestEdge(0.665, 0.775, -1, 7, { col: LEAF_D, h: 15, rows: 3 });
      for (let i = 0; i < 12; i++) {
        const s = 0.665 + (i / 11) * 0.110, hh = hash(i * 71 + 13);
        for (const side of [-1, 1]) {
          bush(K(s), side, 6.5 + hh * 1.5, LEAF_D);
          tree(K(s), side, 9 + hh * 3, 10 + hh * 6,
            hh > 0.78 ? BAMBOO : (side < 0 ? LEAF_D : LEAF));
        }
      }

      // 18. LAST CORNER (Michael Schumacher corner), s=0.8678 (+1, 8 m) — onto
      //     the straight: pit entry building and guardrail split on the infield,
      //     a billboard, and the stand reappearing ahead on the left.
      building(K(0.8678), 1, 8, 18, 5.5, 10,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 1 });
      guardrail(0.850, 0.905, 1, 5, ARMCO);
      guardrail(0.850, 0.985, -1, 5, ARMCO);
      billboard(K(0.8820), 1, 9, 9, 3.2, [0.20, 0.56, 0.32]);
      marshalPost(K(0.9000), 1, 9);
      grandstandEx(0.930, -1, 12, 70, null, null);
      forestEdge(0.800, 0.930, -1, 8, { col: LEAF, h: 14, rows: 3 });
      forestEdge(0.800, 0.860, 1, 12, { col: LEAF_L, h: 13, rows: 2 });
      hill(0.8678, -1, 62, 130, 30, 15, [0.27, 0.39, 0.22]);
      for (let i = 0; i < 10; i++) {
        const s = 0.790 + (i / 9) * 0.140, hh = hash(i * 47 + 29);
        bush(K(s), -1, 6.5 + hh * 2, SCRUB);
        tree(K(s), -1, 9 + hh * 4, 9 + hh * 6, hh > 0.8 ? BAMBOO : LEAF);
      }
  };
