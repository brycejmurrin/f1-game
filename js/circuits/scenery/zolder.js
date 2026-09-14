/* Apex 26 — ZOLDER scenery (data only), split out of js/circuits/zolder.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Brief: docs/tracks/zolder.md. Identity = pale sand under dark Scots pine,
   Belgian Limburg heath on old coal ground. Flat to gently undulating.

   Block -> brief row (§4) map:
     0  global      §2 palette: pale sand verges, dark pine mass, §5 sand run-off
     1  s 0.005 +1  pit lane / garages / hoarding / pit-exit marshal
     2  s 0.015 -1  main-straight grandstand, camera tower, billboards, pine
     3  s 0.035 -1  Earste Chicane (T1) outside: sand run-off, tyres, hill
     4  s 0.042 +1  chicane exit infield: sand patch, marshal, rail, pine screen
     5  s 0.110 -1  long forestEdge — the wall of the outer loop
     6  s 0.180 +1  Sterrenwacht (T2): rail, marshal, small building in trees
     7  s 0.194 -1  Kanaalbocht (T3): sandy spoil ridge, rail + tyres, forest
     8  s 0.265 -1  forested motorhome park
     9  s 0.347 +1  Lucien Bianchi bocht (T4): rail+tyres, marshal, billboards
    10  s 0.433 -1  Villeneuve chicane (T5) + the memorial (restraint: one
                    small low building on a ground patch, nothing else)
    11  s 0.505 +1  infield service area: broadcast compound, motorhomes, shed
    12  s 0.567 -1  Kleine chicane (T6): tight, enclosed, pine right behind
    13  s 0.715 +1  Bolderberghaarspeldbocht (T7): hill, small stand, tyres
    14  s 0.863 +1  Terlamenbocht entry (T8): stand, rail, hoarding, marshal
    15  s 0.879 -1  Terlamenbocht exit (T9): tyres, camera tower, billboards
    16  s 0.924 +1  Jochen Rindt bocht (T10): paddock blocks, motorhomes
*/
"use strict";
(window.TrackScenery = window.TrackScenery || {})["zolder"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        pine, tree, bush, forestEdge,
        building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower,
        broadcastCompound, billboard, sponsorHoarding,
        motorhome, groundPatch, ridge } = api;

      const K = (s) => Math.round(s * n) % n;

      // --- palette -------------------------------------------------------
      // Scots pine: near-black green, barely any yellow in it.
      const PINE_A = [0.07, 0.17, 0.11];
      const PINE_B = [0.10, 0.22, 0.13];
      const PINE_C = [0.13, 0.26, 0.16];
      const PINES = [PINE_A, PINE_B, PINE_C];
      const BIRCH = [0.24, 0.36, 0.20];   // the odd self-seeded broadleaf
      const SCRUB = [0.30, 0.31, 0.19];   // heather / dry scrub
      // Sand: this is genuinely sand, not gravel. Bleached next to tarmac.
      const SAND = [0.82, 0.76, 0.61];
      const SAND_PALE = [0.88, 0.83, 0.70];
      const SAND_DUSK = [0.72, 0.66, 0.52];
      // Club-circuit buildings: plain, flat-roofed, unglamorous.
      const WHITE = [0.87, 0.88, 0.87];
      const GREY = [0.62, 0.64, 0.65];
      const CONCRETE = [0.72, 0.72, 0.70];
      const RAIL = [0.79, 0.80, 0.82];
      const TYRE_CAP = [0.90, 0.86, 0.28];
      const TYRE_CAP2 = [0.88, 0.88, 0.89];

      const pineCol = (h) => PINES[(h * 3) | 0] || PINE_B;

      // === 0. GLOBAL: the heath ==========================================
      // 0a. Pale sand verge patches scattered the whole way round. The run-off
      //     and verges reading pale IS the place; keep them wide and frequent.
      every(34, (k) => {
        const h = hash(k * 17 + 3);
        for (const side of [-1, 1]) {
          const g = 5.0 + h * 6;
          const a = anchor(k, side, g + 6);
          if (!a || onTrack(a.c[0], a.c[2], 7)) continue;
          groundPatch(k, side, g, [10 + h * 10, 0.14, 22 + h * 20], h < 0.5 ? SAND_PALE : SAND);
        }
      });

      // 0b. The pine mass. Dark and dense, set back past the sand, thicker on
      //     the outer ring (-1) than on the infield (+1) where the paddock is.
      every(7, (k) => {
        const h = hash(k * 29 + 7);
        const h2 = hash(k * 53 + 11);
        for (const side of [-1, 1]) {
          const ranks = side < 0 ? 7 : 4;
          for (let r = 0; r < ranks; r++) {
            const jitter = hash(k * 7 + r * 131 + (side < 0 ? 0 : 401));
            if (jitter < 0.12) continue;
            const dist = (side < 0 ? 24 : 30) + r * 10 + jitter * 8;
            const a = anchor(k, side, dist);
            if (!a || onTrack(a.c[0], a.c[2], 8)) continue;
            pine(k, side, dist, 13 + jitter * 9, pineCol(jitter));
          }
        }
        // A little scrub and the occasional birch at the wood's edge.
        if (h > 0.72) {
          const d = 17 + h * 6;
          const b = anchor(k, -1, d);
          if (b && !onTrack(b.c[0], b.c[2], 7)) bush(k, -1, d, SCRUB);
        }
        if (h2 > 0.86) {
          const a = anchor(k, -1, 21);
          if (a && !onTrack(a.c[0], a.c[2], 8)) tree(k, -1, 21, 8 + h2 * 4, BIRCH);
        }
      });

      // 0c. Heather / scrub clumps on the sand between the tarmac and the pine.
      every(19, (k) => {
        const h = hash(k * 97 + 5);
        if (h < 0.42) return;
        for (const side of [-1, 1]) {
          const d = 15 + h * 7;
          const a = anchor(k, side, d);
          if (!a || onTrack(a.c[0], a.c[2], 7)) continue;
          bush(k, side, d, h > 0.8 ? PINE_C : SCRUB);
        }
      });

      // 0d/0e. THE OUTER RING OF WOOD. Zolder sits inside a pine plantation: the
      //      -1 side is woodland almost the whole way round, broken only where
      //      the main-straight grandstand and the Villeneuve viewing bank are.
      //      forestEdge is what makes it read as a WALL rather than a scatter.
      //      (0d = outer ring, 0e = infield screen.)
      forestEdge(0.300, 0.420, -1, 24);
      forestEdge(0.440, 0.540, -1, 32);
      forestEdge(0.600, 0.700, -1, 24);
      forestEdge(0.730, 0.850, -1, 26);
      forestEdge(0.905, 0.950, -1, 30);
      // Infield pine: the paddock and service areas are cut out of the same
      // plantation, so the +1 side is screened too wherever nothing is built.
      forestEdge(0.100, 0.168, 1, 30);
      forestEdge(0.206, 0.330, 1, 28);
      forestEdge(0.580, 0.690, 1, 28);
      forestEdge(0.760, 0.850, 1, 30);

      // 0f. Armco all the way round — Zolder is hemmed in, barriers are close.
      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 10.5, RAIL);

      // 0g. Debris fence behind the armco on the spectator side of the loop.
      fence(0.08, 0.30, -1, 15, 3.2, [0.58, 0.60, 0.60]);
      fence(0.40, 0.62, -1, 15, 3.2, [0.58, 0.60, 0.60]);

      // 0h. Marshal posts on the half-lap gaps the named rows do not cover.
      for (const s of [0.075, 0.145, 0.235, 0.300, 0.395, 0.470, 0.640, 0.780, 0.820]) {
        marshalPost(K(s), s < 0.5 ? -1 : 1, 13);
      }

      // RE-KEYED THROUGH sl(). The start line moved onto a straight (def
      // startFrac) because the grid had been laid through a 176 m corner, and
      // sceneryStartFrac holds the rest of this file on its real corners — the
      // chicanes, the Villeneuve memorial and the pine sections must not travel
      // with the line. The pit block and main stand belong AT the line, so
      // these two blocks alone are shifted.
      const SL = 0.1562;                       // = 1 - def._sceneryShift
      const sl = (f) => (f + SL) % 1;

      // === 1. s 0.005 +1 14 — PIT LANE AND GARAGES =======================
      // A long low run of flat-roofed boxes. Plain white/grey. Functional.
      for (let i = 0; i < 13; i++) {
        const s = sl(0.958 + i * 0.0068);
        const h = hash(i * 41 + 9);
        building(K(s), 1, 14, 11, 4.6 + (h > 0.7 ? 1.6 : 0), 9.5,
          { wall: h < 0.55 ? WHITE : GREY });
      }
      // Team offices over the middle of the pit block.
      building(K(sl(0.012)), 1, 26, 34, 8.5, 14, { wall: WHITE });
      building(K(sl(0.034)), 1, 27, 22, 7.0, 13, { wall: GREY });
      // Continuous sponsor band along the pit wall.
      sponsorHoarding(sl(0.955), sl(0.060), 1, 11.5);
      // Pit exit marshal.
      marshalPost(K(sl(0.058)), 1, 13);
      marshalPost(K(sl(0.985)), 1, 13);
      // Pale apron in front of the garages.
      groundPatch(K(sl(0.005)), 1, 4.0, [17, 0.15, 34], CONCRETE);

      // === 2. s 0.015 -1 12 — MAIN STRAIGHT GRANDSTAND ===================
      grandstandEx(sl(0.012), -1, 12, 150, null, null);
      cameraTower(K(sl(0.0)), -1, 15);
      // A rank of billboards behind the stand.
      for (let i = 0; i < 5; i++) {
        billboard(K(0.968 + i * 0.011), -1, 34, 11, 4.2,
          i % 2 ? [0.82, 0.24, 0.20] : [0.16, 0.28, 0.55]);
      }
      // Dark pine closes the gap above the roofline.
      for (let i = 0; i < 16; i++) {
        const s = 0.950 + i * 0.0075;
        const j = hash(i * 61 + 13);
        pine(K(s), -1, 44 + j * 10, 17 + j * 7, pineCol(j));
      }

      // === 3. s 0.035 -1 22 — EARSTE CHICANE (T1) OUTSIDE ================
      // Wide bleached sand run-off, then tyres on armco, then the hill.
      groundPatch(K(0.0352), -1, 6.0, [24, 0.16, 46], SAND_PALE);
      groundPatch(K(0.0300), -1, 4.0, [18, 0.15, 38], SAND_PALE);
      groundPatch(K(0.0410), -1, 4.0, [18, 0.15, 38], SAND);
      guardrail(0.026, 0.050, -1, 22, RAIL);
      tyreWall(0.028, 0.048, -1, 21.4, TYRE_CAP);
      spectatorHill(0.026, 0.052, -1, 27);
      for (let i = 0; i < 9; i++) {
        const s = 0.024 + i * 0.0034;
        const j = hash(i * 23 + 31);
        tree(K(s), -1, 40 + j * 9, 8 + j * 5, j > 0.6 ? BIRCH : PINE_C);
      }

      // === 4. s 0.042 +1 16 — CHICANE EXIT, INFIELD ======================
      groundPatch(K(0.042), 1, 4.0, [14, 0.15, 28], SAND);
      marshalPost(K(0.044), 1, 15);
      guardrail(0.036, 0.052, 1, 16, RAIL);
      // First rank of pine screening the paddock beyond.
      for (let i = 0; i < 10; i++) {
        const j = hash(i * 71 + 17);
        pine(K(0.034 + i * 0.0028), 1, 24 + j * 6, 14 + j * 6, pineCol(j));
      }

      // === 5. s 0.110 -1 30 — THE LONG FOREST EDGE =======================
      // The dominant wall of the outer loop: trunks bare to head height,
      // canopy flat on top.
      forestEdge(0.062, 0.176, -1, 26);
      for (let i = 0; i < 34; i++) {
        const s = 0.064 + i * 0.0033;
        const j = hash(i * 37 + 3);
        pine(K(s), -1, 19 + j * 5, 16 + j * 8, pineCol(j));
        if (j > 0.45) pine(K(s), -1, 33 + j * 9, 18 + j * 7, pineCol(1 - j));
        if (j > 0.80) bush(K(s), -1, 15, SCRUB);
      }

      // === 6. s 0.180 +1 16 — STERRENWACHT (T2) ==========================
      guardrail(0.170, 0.192, 1, 12, RAIL);
      marshalPost(K(0.1802), 1, 16);
      building(K(0.1802), 1, 30, 10, 6.0, 10, { wall: WHITE });   // small square, set back
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 83 + 29);
        pine(K(0.166 + i * 0.0036), 1, 42 + j * 12, 15 + j * 8, pineCol(j));
      }

      // === 7. s 0.194 -1 20 — KANAALBOCHT (T3) ===========================
      // A low ridge of sandy spoil carries the boundary here.
      {
        const a = anchor(K(0.1938), -1, 62);
        if (a) {
          const y = terrainYAt ? terrainYAt(a.c[0], a.c[2]) : a.c[1];
          ridge(a.c[0], a.c[2], y, Math.atan2(a.t[2], a.t[0]), 74, 18, 5.0, SAND_DUSK);
        }
      }
      guardrail(0.184, 0.206, -1, 20, RAIL);
      tyreWall(0.188, 0.202, -1, 19.4, TYRE_CAP2);
      groundPatch(K(0.1938), -1, 4.0, [16, 0.15, 32], SAND_PALE);
      forestEdge(0.180, 0.214, -1, 40);

      // === 8. s 0.265 -1 34 — FORESTED MOTORHOME PARK ====================
      groundPatch(K(0.265), -1, 30, [22, 0.16, 46], SAND_DUSK);
      for (let i = 0; i < 7; i++) {
        const j = hash(i * 59 + 43);
        motorhome(K(0.244 + i * 0.0072), -1, 33 + j * 14, 10, 6.5 + j * 1.5, 13,
          { wall: [0.88, 0.88, 0.87] });
      }
      for (let i = 0; i < 22; i++) {
        const j = hash(i * 101 + 19);
        pine(K(0.236 + i * 0.0032), -1, 30 + j * 26, 15 + j * 9, pineCol(j));
      }
      forestEdge(0.222, 0.300, -1, 22);

      // === 9. s 0.347 +1 18 — LUCIEN BIANCHI BOCHT (T4) ==================
      guardrail(0.334, 0.362, 1, 18, RAIL);
      tyreWall(0.338, 0.358, 1, 17.4, TYRE_CAP);
      marshalPost(K(0.356), 1, 20);
      billboard(K(0.330), 1, 24, 12, 4.5, [0.84, 0.78, 0.18]);
      billboard(K(0.338), 1, 24, 12, 4.5, [0.14, 0.30, 0.58]);
      groundPatch(K(0.347), 1, 4.0, [15, 0.15, 30], SAND);

      // === 10. s 0.433 -1 24 — VILLENEUVE CHICANE (T5) ===================
      // Popular viewing on the outside; sand run-off; tyres on armco.
      groundPatch(K(0.4333), -1, 4.0, [22, 0.16, 46], SAND_PALE);
      guardrail(0.424, 0.446, -1, 18, RAIL);
      tyreWall(0.426, 0.444, -1, 17.4, TYRE_CAP);
      grandstandEx(0.4333, -1, 26, 62, null, null);
      spectatorHill(0.408, 0.424, -1, 26);
      for (let i = 0; i < 10; i++) {
        const j = hash(i * 67 + 5);
        pine(K(0.404 + i * 0.0052), -1, 44 + j * 12, 16 + j * 7, pineCol(j));
      }
      // --- the memorial. One small low building on a ground patch, set back
      //     from the barrier. Unlit, unsignposted, nothing else. Restraint is
      //     the point: do NOT add lights, flags, billboards or a crowd here.
      groundPatch(K(0.4368), -1, 30, [8, 0.16, 10], CONCRETE);
      building(K(0.4368), -1, 31, 3.0, 2.2, 3.0, { wall: [0.80, 0.79, 0.76] });

      // === 11. s 0.505 +1 40 — INFIELD SERVICE AREA ======================
      groundPatch(K(0.505), 1, 34, [24, 0.15, 46], SAND_PALE);
      broadcastCompound(K(0.505), 1, 38);
      motorhome(K(0.492), 1, 40, 11, 7.0, 15, { wall: [0.90, 0.90, 0.89] });
      motorhome(K(0.518), 1, 41, 11, 7.0, 15, { wall: [0.84, 0.85, 0.86] });
      building(K(0.505), 1, 56, 18, 5.0, 12, { wall: GREY });
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 79 + 23);
        pine(K(0.480 + i * 0.0040), 1, 66 + j * 14, 15 + j * 8, pineCol(j));
      }

      // === 12. s 0.567 -1 20 — KLEINE CHICANE (T6) =======================
      // Tight and enclosed: the pine starts immediately beyond the barrier.
      guardrail(0.556, 0.580, -1, 14, RAIL);
      tyreWall(0.558, 0.578, -1, 13.4, TYRE_CAP2);
      marshalPost(K(0.5667), -1, 16);
      groundPatch(K(0.5667), -1, 4.0, [13, 0.15, 26], SAND_PALE);
      for (let i = 0; i < 16; i++) {
        const j = hash(i * 89 + 37);
        pine(K(0.548 + i * 0.0026), -1, 19 + j * 7, 16 + j * 8, pineCol(j));
        if (j > 0.5) pine(K(0.548 + i * 0.0026), -1, 31 + j * 8, 17 + j * 6, pineCol(1 - j));
      }
      forestEdge(0.540, 0.600, -1, 18);

      // === 13. s 0.715 +1 22 — BOLDERBERGHAARSPELDBOCHT (T7) =============
      spectatorHill(0.702, 0.730, 1, 24);
      grandstandEx(0.7153, 1, 30, 48, null, null);
      guardrail(0.700, 0.734, 1, 22, RAIL);
      tyreWall(0.702, 0.732, 1, 21.2, TYRE_CAP);
      marshalPost(K(0.730), 1, 24);
      billboard(K(0.694), 1, 24, 12, 4.5, [0.80, 0.26, 0.18]);
      groundPatch(K(0.7153), -1, 4.0, [17, 0.15, 34], SAND_PALE);
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 43 + 47);
        pine(K(0.690 + i * 0.0042), -1, 24 + j * 14, 16 + j * 8, pineCol(j));
      }

      // === 14. s 0.863 +1 18 — TERLAMENBOCHT ENTRY (T8) ==================
      grandstandEx(0.8628, 1, 20, 70, null, null);
      guardrail(0.852, 0.874, 1, 16, RAIL);
      sponsorHoarding(0.850, 0.876, 1, 13.5);
      marshalPost(K(0.8628), 1, 18);

      // === 15. s 0.879 -1 22 — TERLAMENBOCHT EXIT (T9) ===================
      // The last of the pine before the paddock reopens.
      guardrail(0.870, 0.892, -1, 20, RAIL);
      tyreWall(0.872, 0.890, -1, 19.4, TYRE_CAP2);
      cameraTower(K(0.8792), -1, 24);
      for (let i = 0; i < 4; i++) {
        billboard(K(0.868 + i * 0.0075), -1, 30, 11, 4.2,
          i % 2 ? [0.15, 0.32, 0.56] : [0.86, 0.84, 0.22]);
      }
      forestEdge(0.850, 0.910, -1, 38);
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 73 + 53);
        pine(K(0.848 + i * 0.0044), -1, 40 + j * 14, 16 + j * 8, pineCol(j));
      }

      // === 16. s 0.924 +1 16 — JOCHEN RINDT BOCHT (T10) ==================
      guardrail(0.912, 0.940, 1, 14, RAIL);
      marshalPost(K(0.938), 1, 16);
      sponsorHoarding(0.930, 0.958, 1, 12);
      for (let i = 0; i < 5; i++) {
        const j = hash(i * 107 + 61);
        building(K(0.906 + i * 0.0086), 1, 22 + j * 6, 14, 5.2, 11,
          { wall: j < 0.5 ? GREY : WHITE });
      }
      for (let i = 0; i < 6; i++) {
        const j = hash(i * 113 + 7);
        motorhome(K(0.908 + i * 0.0072), 1, 40, 10, 6.4 + j * 1.4, 14,
          { wall: j < 0.5 ? [0.89, 0.89, 0.88] : [0.80, 0.81, 0.83] });
      }
  };
