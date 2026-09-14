/* Apex 26 — DONINGTON scenery (data only), split out of js/circuits/donington.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag.

   Brief: docs/tracks/donington.md. English parkland in Leicestershire, soft
   overcast light, club-circuit buildings, mature broadleaf WELL SPACED (never a
   forest wall) and the Craner fall left open so the drop reads.

   Block -> brief row (§4) map:
     1  palette + local helpers            (§2 atmosphere, §6 modelling notes)
     2  s 0.005  +1  pits / paddock / broadcast / camera tower
     3  s 0.022  -1  start-finish grandstand + hoarding + gantry
     4  s 0.048  +1  Donington Collection, apron, screening hedge
     5  s 0.0663 -1  Redgate
     6  s 0.1698 -1  Hollywood, top of the drop
     7  s 0.2500 +1  mid-Craner infield, deliberately empty
     8  s 0.3212 -1  Craner Curves, enclosed and dark
     9  s 0.3342 +1  Old Hairpin bank
    10  s 0.4552 +1  Starkey's Bridge
    11  s 0.5162 -1  Schwantz Curve, trees only
    12  s 0.5713 +1  McLeans
    13  s 0.6803 -1  Coppice
    14  s 0.7592 -1  The Esses
    15  s 0.7887 +1  Melbourne Hairpin
    16  s 0.8700 -1  Melbourne return leg
    17  s 0.9437 +1  Goddards
    18  parkland scatter + continuous armco + marshal posts (§6, whole lap) */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["donington"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, out, terrainYAt,
        tree, bush, hedge, forestEdge,
        building, grandstandEx, spectatorHill, terrace,
        guardrail, fence, tyreWall, marshalPost, cameraTower, broadcastCompound,
        billboard, sponsorHoarding, gantry, motorhome, groundPatch,
        place, ridge } = api;

      // ---------------------------------------------------------------------
      // 1. PALETTE + LOCAL HELPERS
      //    Overcast English green: desaturated, cool, low contrast. Nothing
      //    here climbs above ~0.8 in any channel.
      // ---------------------------------------------------------------------
      const K = (s) => Math.round(s * n) % n;

      const LEAF      = [0.20, 0.33, 0.17];   // mature broadleaf, damp
      const LEAF_D    = [0.15, 0.26, 0.14];   // shaded side of the wood
      const LEAF_L    = [0.26, 0.38, 0.21];   // sunlit-ish specimen
      const HEDGE_C   = [0.16, 0.28, 0.15];
      const GRASS     = [0.29, 0.37, 0.22];
      const ROUGH     = [0.32, 0.36, 0.24];
      const ARMCO     = [0.74, 0.75, 0.76];
      const FENCE_C   = [0.56, 0.58, 0.58];
      const TYRE      = [0.17, 0.17, 0.18];
      const WALL      = [0.78, 0.77, 0.74];   // pale rendered club buildings
      const WALL_2    = [0.70, 0.71, 0.70];
      const ROOF      = [0.42, 0.44, 0.45];
      const CONCRETE  = [0.62, 0.62, 0.60];
      const TARMACISH = [0.30, 0.30, 0.31];

      // Heading of the centreline at node k, for ridge() angles.
      const headingAt = (k) => {
        const a = anchor(k, 1, 0).c;
        const b = anchor((k + 4) % n, 1, 0).c;
        return Math.atan2(b[0] - a[0], b[2] - a[2]);
      };
      // Lay a ridge parallel to the track at (k, side, dist).
      const slopeRidge = (k, side, dist, len, w, h, col) => {
        const a = anchor(k, side, dist);
        const x = a.c[0], z = a.c[2];
        if (onTrack(x, z, 10)) return;
        ridge(x, z, terrainYAt(x, z) - h * 0.35, headingAt(k), len, w, h, col);
      };
      // A single well-spaced specimen: jittered so a row never lines up.
      const specimen = (k, side, dist, seed) => {
        const h = hash(k * 17 + seed);
        const d = dist + h * 9;
        const a = anchor(k, side, d);
        if (onTrack(a.c[0], a.c[2], 9)) return;
        tree(k, side, d, 8.5 + h * 6.5, h < 0.4 ? LEAF_L : (h < 0.75 ? LEAF : LEAF_D));
      };

      // ---------------------------------------------------------------------
      // 2. s 0.005 +1 14 — PITS, PADDOCK, BROADCAST, CAMERA TOWER
      //    Club-circuit pit block: one long, low, flat-roofed run. No towers.
      // ---------------------------------------------------------------------
      building(K(0.968), 1, 15, 14, 6.5, 108, { col: WALL, roof: ROOF });
      building(K(0.032), 1, 19, 12, 5.5, 34, { col: WALL_2, roof: ROOF });
      // Paddock apron behind the garages.
      groundPatch(K(0.000), 1, 34, 96, TARMACISH);
      for (let i = 0; i < 5; i++) motorhome(K(0.975 + i * 0.012), 1, 40, { col: WALL });
      broadcastCompound(K(0.020), 1, 30, { col: WALL_2 });
      cameraTower(K(0.004), 1, 20, { h: 11 });
      // Paddock perimeter fencing, not spectator debris fence.
      fence(0.955, 0.055, 1, 30, 2.4, FENCE_C);

      // ---------------------------------------------------------------------
      // 3. s 0.022 -1 20 — START/FINISH STAND (modest, two shallow banks)
      //    shell/crowd are COLOUR ARRAYS; null lets the emitter pick a livery.
      // ---------------------------------------------------------------------
      grandstandEx(0.014, -1, 21, 76, null, null);
      grandstandEx(0.040, -1, 21, 58, null, null);
      sponsorHoarding(0.995, 0.062, -1, 13);
      fence(0.990, 0.070, -1, 12, 3.0, FENCE_C);
      gantry(0.002, 7.2, [0.80, 0.80, 0.78]);

      // ---------------------------------------------------------------------
      // 4. s 0.048 +1 34 — THE DONINGTON COLLECTION
      //    Long, low, flat-roofed exhibition hall set back behind the paddock,
      //    coach apron in front, hedge screening it from the track.
      // ---------------------------------------------------------------------
      building(K(0.052), 1, 24, 18, 7.0, 34, { col: WALL, roof: ROOF, flat: true });
      building(K(0.072), 1, 28, 12, 4.8, 18, { col: WALL_2, roof: ROOF, flat: true });
      groundPatch(K(0.046), 1, 24, 54, TARMACISH);
      hedge(0.034, 0.078, 1, 17, 2.2, HEDGE_C);
      for (let i = 0; i < 4; i++) specimen(K(0.040 + i * 0.011), 1, 60, i * 7);

      // ---------------------------------------------------------------------
      // 5. s 0.0663 -1 12 — REDGATE (first-corner right off the straight)
      // ---------------------------------------------------------------------
      guardrail(0.055, 0.098, -1, 12, ARMCO);
      tyreWall(0.060, 0.080, -1, 12.5, [0.62, 0.16, 0.14]);
      spectatorHill(0.052, 0.105, -1, 22, { h: 7.5, col: GRASS });
      marshalPost(K(0.0663), -1, 15);
      billboard(K(0.090), -1, 16, 9, 3.2, [0.72, 0.72, 0.70]);
      forestEdge(0.050, 0.110, -1, 48, { col: LEAF_D });

      // ---------------------------------------------------------------------
      // 6. s 0.1698 -1 16 — HOLLYWOOD, the top of the Craner drop
      //    Wide bank looking down the whole fall; wood behind it, not in front.
      // ---------------------------------------------------------------------
      grandstandEx(0.163, -1, 17, 64, null, null);
      spectatorHill(0.130, 0.230, -1, 20, { h: 9.0, col: GRASS });
      terrace(0.178, 0.215, -1, 20, { h: 6.0, col: CONCRETE });
      forestEdge(0.120, 0.250, -1, 52, { col: LEAF, spacing: 15 });
      guardrail(0.120, 0.250, -1, 11, ARMCO);
      fence(0.130, 0.235, -1, 14, 3.2, FENCE_C);
      marshalPost(K(0.1698), -1, 14);
      sponsorHoarding(0.150, 0.200, -1, 13);

      // ---------------------------------------------------------------------
      // 7. s 0.2500 +1 26 — MID-CRANER INFIELD: KEEP IT EMPTY
      //    Individual specimens on mown grass and one low ridge running with
      //    the slope. Nothing tall — the Hollywood bank is paying for this view.
      // ---------------------------------------------------------------------
      for (let i = 0; i < 7; i++) specimen(K(0.200 + i * 0.020), 1, 30 + (i % 3) * 12, 100 + i * 13);
      slopeRidge(K(0.245), 1, 66, 110, 24, 5.5, GRASS);
      slopeRidge(K(0.290), 1, 84, 90, 20, 4.0, ROUGH);
      groundPatch(K(0.255), 1, 26, 70, GRASS);

      // ---------------------------------------------------------------------
      // 8. s 0.3212 -1 13 — CRANER CURVES: enclosed and dark
      // ---------------------------------------------------------------------
      guardrail(0.255, 0.345, -1, 10.5, ARMCO);
      tyreWall(0.278, 0.294, -1, 11.5, [0.55, 0.52, 0.16]);
      tyreWall(0.312, 0.330, -1, 11.5, [0.55, 0.52, 0.16]);
      forestEdge(0.250, 0.355, -1, 18, { col: LEAF_D, spacing: 11 });
      forestEdge(0.255, 0.350, -1, 36, { col: LEAF, spacing: 14 });
      marshalPost(K(0.3212), -1, 14);

      // ---------------------------------------------------------------------
      // 9. s 0.3342 +1 15 — OLD HAIRPIN, the lowest point of the lap
      // ---------------------------------------------------------------------
      spectatorHill(0.318, 0.372, 1, 17, { h: 8.0, col: GRASS });
      hedge(0.314, 0.378, 1, 15, 1.9, HEDGE_C);
      guardrail(0.310, 0.380, 1, 12, ARMCO);
      marshalPost(K(0.3342), 1, 13);
      for (let i = 0; i < 4; i++) specimen(K(0.330 + i * 0.016), 1, 46, 200 + i * 9);

      // ---------------------------------------------------------------------
      // 10. s 0.4552 +1 10 — STARKEY'S BRIDGE, on the climb back out
      // ---------------------------------------------------------------------
      guardrail(0.415, 0.495, 1, 11, ARMCO);
      guardrail(0.415, 0.495, -1, 11, ARMCO);
      sponsorHoarding(0.440, 0.472, 1, 12);
      sponsorHoarding(0.440, 0.472, -1, 12);
      place(K(0.4552), 1, 15, [4.0, 6.0, 14], CONCRETE);
      place(K(0.4552), -1, 15, [4.0, 6.0, 14], CONCRETE);
      slopeRidge(K(0.452), 1, 44, 60, 16, 6.5, GRASS);
      slopeRidge(K(0.452), -1, 44, 60, 16, 6.0, GRASS);
      marshalPost(K(0.470), 1, 13);

      // ---------------------------------------------------------------------
      // 11. s 0.5162 -1 22 — SCHWANTZ CURVE: trees, and nothing else
      // ---------------------------------------------------------------------
      forestEdge(0.490, 0.556, -1, 22, { col: LEAF, spacing: 14 });
      forestEdge(0.495, 0.552, -1, 44, { col: LEAF_D, spacing: 17 });
      guardrail(0.492, 0.556, -1, 12, ARMCO);
      marshalPost(K(0.5162), -1, 15);

      // ---------------------------------------------------------------------
      // 12. s 0.5713 +1 18 — McLEANS
      // ---------------------------------------------------------------------
      tyreWall(0.562, 0.584, 1, 12, [0.55, 0.52, 0.16]);
      spectatorHill(0.558, 0.594, 1, 19, { h: 5.5, col: GRASS });
      marshalPost(K(0.5713), 1, 14);
      for (let i = 0; i < 6; i++) specimen(K(0.556 + i * 0.013), 1, 40 + (i % 2) * 14, 300 + i * 11);
      guardrail(0.550, 0.600, 1, 12, ARMCO);

      // ---------------------------------------------------------------------
      // 13. s 0.6803 -1 14 — COPPICE, the woodland the uphill right runs into
      // ---------------------------------------------------------------------
      forestEdge(0.650, 0.720, -1, 16, { col: LEAF_D, spacing: 10 });
      forestEdge(0.655, 0.715, -1, 34, { col: LEAF, spacing: 13 });
      tyreWall(0.674, 0.690, -1, 12.5, [0.55, 0.52, 0.16]);
      guardrail(0.650, 0.730, -1, 11, ARMCO);
      marshalPost(K(0.6803), -1, 14);

      // ---------------------------------------------------------------------
      // 14. s 0.7592 -1 12 — THE ESSES (spectator tunnel crossing)
      // ---------------------------------------------------------------------
      guardrail(0.735, 0.782, -1, 11, ARMCO);
      tyreWall(0.750, 0.768, -1, 12, [0.62, 0.16, 0.14]);
      grandstandEx(0.756, -1, 18, 44, null, null);
      billboard(K(0.744), -1, 15, 8, 3.0, [0.72, 0.72, 0.70]);
      sponsorHoarding(0.730, 0.752, -1, 12.5);
      sponsorHoarding(0.766, 0.790, -1, 12.5);
      fence(0.732, 0.790, -1, 13.5, 3.0, FENCE_C);
      marshalPost(K(0.7592), -1, 15);

      // ---------------------------------------------------------------------
      // 15. s 0.7887 +1 20 — MELBOURNE HAIRPIN: sparse and rural
      // ---------------------------------------------------------------------
      tyreWall(0.780, 0.800, 1, 13, [0.55, 0.52, 0.16]);
      hedge(0.770, 0.815, 1, 26, 2.1, HEDGE_C);
      marshalPost(K(0.7887), 1, 16);
      slopeRidge(K(0.795), 1, 56, 70, 18, 4.5, ROUGH);
      for (let i = 0; i < 3; i++) specimen(K(0.776 + i * 0.018), 1, 52, 400 + i * 15);

      // ---------------------------------------------------------------------
      // 16. s 0.8700 -1 30 — MELBOURNE RETURN LEG: the least developed stretch
      // ---------------------------------------------------------------------
      hedge(0.820, 0.920, -1, 32, 2.3, HEDGE_C);
      guardrail(0.815, 0.925, -1, 11, ARMCO);
      groundPatch(K(0.870), -1, 18, 80, ROUGH);
      groundPatch(K(0.905), -1, 18, 60, ROUGH);
      for (let i = 0; i < 5; i++) specimen(K(0.828 + i * 0.020), -1, 46, 500 + i * 19);

      // ---------------------------------------------------------------------
      // 17. s 0.9437 +1 13 — GODDARDS, the last corner onto the pit straight
      // ---------------------------------------------------------------------
      tyreWall(0.936, 0.954, 1, 13, [0.62, 0.16, 0.14]);
      grandstandEx(0.948, -1, 19, 58, null, null);
      sponsorHoarding(0.930, 0.972, -1, 13);
      marshalPost(K(0.9437), 1, 14);
      building(K(0.962), 1, 24, 9, 5.0, 14, { col: WALL_2, roof: ROOF });
      guardrail(0.925, 0.985, -1, 11.5, ARMCO);

      // ---------------------------------------------------------------------
      // 18. WHOLE LAP — parkland scatter, base armco, marshal posts
      //     Well-spaced mature broadleaf with mown grass between: the hash gate
      //     drops ~60% of candidates and the distance jitter breaks any rank.
      //     Skipped through the Craner fall (0.17–0.33) on the infield so the
      //     drop stays visible from the Hollywood bank.
      // ---------------------------------------------------------------------
      every(26, (k) => {
        const s = k / n;
        const h = hash(k * 37 + 5);
        if (h < 0.60) return;
        for (const side of [-1, 1]) {
          if (side > 0 && s > 0.16 && s < 0.34) continue;      // keep Craner open
          if (side > 0 && (s > 0.94 || s < 0.09)) continue;    // paddock side
          const g = hash(k * 53 + (side > 0 ? 11 : 3));
          if (g < 0.35) continue;
          const dist = 26 + g * 26 + (side < 0 ? 6 : 10);
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 10)) continue;
          tree(k, side, dist, 9 + g * 7, g < 0.45 ? LEAF : (g < 0.8 ? LEAF_L : LEAF_D));
          if (g > 0.86) bush(k, side, dist - 8, LEAF_D);
        }
      });

      // Continuous armco so the whole edge reads as a circuit, not a lane.
      guardrail(0.0, 1.0, -1, 13.5, ARMCO);
      guardrail(0.10, 0.93, 1, 14.5, ARMCO);

      // Posts on the eighths, skipping the ones already placed above.
      for (let i = 0; i < 8; i++) {
        const s = i / 8;
        if (s > 0.30 && s < 0.40) continue;
        marshalPost(K(s), 1, 17);
      }
  };
