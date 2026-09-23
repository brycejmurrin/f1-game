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
    18  whole lap: parkland scatter, estate wood belts, hedgerows,
        continuous armco, marshal posts (§6)

   DEPTH RULE (this pass): every row gets a SECOND rank behind its front one —
   a back treeline, a car park, a service compound or a field boundary — so no
   feature reads as a single cardboard rank. Deep ranks go through rank() /
   safeBox() / carPark(), which pre-test onTrack() and simply skip: that is how
   this file keeps guard drops at ZERO. forestEdge()/hedge()/spectatorHill()
   have no such guard, so they stay at the shallow gaps that are known clean.

   Deviation from the brief's distance column: the Collection sits at gap 58,
   not 34 — the infield is narrow at s 0.048 and anything closer overlapped the
   tarmac and was guard-dropped. Everything else uses the brief's distance. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["donington"] =
  function (api) {
      const { mountain, n, hash, every, anchor, onTrack, out, terrainYAt,
        tree, bush, hedge, forestEdge,
        building, grandstandEx, spectatorHill, terrace,
        guardrail, fence, tyreWall, marshalPost, cameraTower, broadcastCompound,
        billboard, sponsorHoarding, gantry, motorhome, groundPatch,
        place, ridge, circuitKit } = api;

      // ---------------------------------------------------------------------
      // 1. PALETTE + LOCAL HELPERS
      //    Overcast English green: desaturated, cool, low contrast. Nothing
      //    here climbs above ~0.8 in any channel.
      // ---------------------------------------------------------------------
      const { K } = api;            // the contract's frac -> node index (normalised for negatives)

      const LEAF      = [0.20, 0.33, 0.17];   // mature broadleaf, damp
      const LEAF_D    = [0.15, 0.26, 0.14];   // shaded side of the wood
      const LEAF_L    = [0.26, 0.38, 0.21];   // sunlit-ish specimen
      const LEAF_Y    = [0.28, 0.35, 0.18];   // field maple / lime, olive cast
      const LEAF_B    = [0.17, 0.30, 0.20];   // wet blue-green, north faces
      const LEAF_C    = [0.22, 0.30, 0.24];   // copper beech gone grey-green
      const HEDGE_C   = [0.16, 0.28, 0.15];
      const HEDGE_L   = [0.19, 0.31, 0.17];   // cut face of a managed hedge
      const GRASS     = [0.29, 0.37, 0.22];
      const GRASS_D   = [0.25, 0.33, 0.20];   // unmown, shaded
      const ROUGH     = [0.32, 0.36, 0.24];
      const ARMCO     = [0.74, 0.75, 0.76];
      const FENCE_C   = [0.56, 0.58, 0.58];
      const TYRE      = [0.17, 0.17, 0.18];
      const WALL      = [0.78, 0.77, 0.74];   // pale rendered club buildings
      const WALL_2    = [0.70, 0.71, 0.70];
      const BRICK     = [0.44, 0.34, 0.30];   // estate red brick, muted
      const BRICK_D   = [0.38, 0.30, 0.27];
      const CREAM     = [0.80, 0.78, 0.72];
      const STEEL     = [0.55, 0.56, 0.57];   // portal-frame shed
      const ROOF      = [0.42, 0.44, 0.45];
      const ROOF_D    = [0.33, 0.35, 0.37];   // dark slate
      const ROOF_R    = [0.40, 0.33, 0.30];   // old clay tile
      const CONCRETE  = [0.62, 0.62, 0.60];
      const TARMACISH = [0.30, 0.30, 0.31];
      const GRAVEL    = [0.50, 0.49, 0.45];   // hardstanding / coach apron
      const TENT      = [0.79, 0.78, 0.75];   // marquee canvas
      const TW_R      = [0.62, 0.16, 0.14];
      const TW_Y      = [0.55, 0.52, 0.16];
      const TW_W      = [0.57, 0.58, 0.60];

      const LEAVES  = [LEAF, LEAF_L, LEAF_D, LEAF_Y, LEAF_B, LEAF_C];
      const TRUCKS  = [[0.72, 0.72, 0.71], [0.30, 0.33, 0.38], [0.45, 0.24, 0.22],
                       [0.60, 0.60, 0.58], [0.26, 0.34, 0.30]];
      const CARS    = [[0.55, 0.56, 0.58], [0.27, 0.29, 0.33], [0.44, 0.23, 0.21],
                       [0.63, 0.63, 0.61], [0.22, 0.28, 0.32], [0.36, 0.38, 0.36]];

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
        tree(k, side, d, 8.5 + h * 6.5, LEAVES[(Math.floor(h * 6) + seed) % 6]);
      };
      // A guarded box: everything deep enough to risk the far side of the loop
      // goes through here, so a bad candidate is SKIPPED, never guard-dropped.
      const safeBox = (k, side, dist, dims, col) => {
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 8)) return;
        place(k, side, dist, dims, col);
      };
      // Small white marshal / observation hut.
      const hut = (k, side, dist, col) => safeBox(k, side, dist, [2.6, 2.8, 3.4], col || CREAM);
      // A back rank of broadleaf: guarded, jittered in gap and height, and
      // colour-mixed so the rank never reads as one wall of green.
      const rank = (f0, f1, side, dist, count, seed, hMin, hMax) => {
        for (let i = 0; i < count; i++) {
          const t = count < 2 ? 0.5 : i / (count - 1);
          const h = hash(i * 31 + seed);
          const g = hash(i * 13 + seed + 7);
          const k = K(f0 + (f1 - f0) * t + (g - 0.5) * 0.004);
          const d = dist + h * 16;
          const a = anchor(k, side, d);
          if (onTrack(a.c[0], a.c[2], 9)) continue;
          tree(k, side, d, hMin + h * (hMax - hMin), LEAVES[Math.floor(g * 6) % 6]);
          if (g > 0.88) bush(k, side, d - 7, LEAF_D);
        }
      };
      // Nose-in parking: rows along the track, ranks receding away from it.
      const carPark = (f0, f1, side, dist, rows, cols, seed) => {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const h = hash(r * 29 + c * 7 + seed);
            if (h < 0.18) continue;                       // gaps in the rows
            const k = K(f0 + (f1 - f0) * ((r + 0.5) / rows));
            const d = dist + c * 6.5 + h * 1.4;
            const a = anchor(k, side, d);
            if (onTrack(a.c[0], a.c[2], 8)) continue;
            place(k, side, d, [4.3, 1.5, 1.9], CARS[Math.floor(h * 6) % 6]);
          }
        }
      };

      // ---------------------------------------------------------------------
      // 2. s 0.005 +1 14 — PITS, PADDOCK, BROADCAST, CAMERA TOWER
      //    Club-circuit pit block: one long, low, flat-roofed run. No towers.
      //
      //    RE-KEYED THROUGH sl(). The start line moved onto a straight
      //    (def startFrac) because the grid had been laid through a 28 m
      //    hairpin, and sceneryStartFrac holds the rest of this file on its
      //    real corners — Redgate, Craner and the Old Hairpin must not travel
      //    with the line. But the PIT COMPLEX belongs AT the line wherever the
      //    line is, so these rows alone are shifted: sl(f) is the authored
      //    frac that lands at the corrected line. Everything below block 3
      //    stays in the authoring frame on purpose.
      //    sl() wraps past 1 above f = 0.097, so keep every argument below it.
      // ---------------------------------------------------------------------
      // 1 - def._sceneryShift, baked by buildCenterline before scenery() runs, at
      // the 4 dp the props were placed against (a literal 0.9027 until 2026-09-22:
      // the unrounded value flips a few K() nodes at Brands Hatch, so the rounding
      // keeps today's geometry while a retuned startFrac still moves the props).
      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (f) => (f + SL) % 1;
      building(K(sl(0.968)), 1, 15, 14, 6.5, 108, { col: WALL, roof: ROOF });
      building(K(sl(0.032)), 1, 19, 12, 5.5, 34, { col: WALL_2, roof: ROOF });
      // Race control / timing over the end of the garage run — still club scale.
      building(K(sl(0.004)), 1, 25, 10, 7.0, 16, { col: CREAM, roof: ROOF_D });
      // Paddock apron behind the garages.
      groundPatch(K(sl(0.000)), 1, 34, [40, 0.18, 96], TARMACISH);
      for (let i = 0; i < 5; i++) motorhome(K(sl(0.975 + i * 0.012)), 1, 30, 3.0, 3.2, 11, { wall: WALL });
      broadcastCompound(K(sl(0.020)), 1, 30, { col: WALL_2 });
      cameraTower(K(sl(0.004)), 1, 20, { h: 11 });
      // --- paddock DEPTH: transporter row, workshops, tyre bay, team awnings.
      for (let i = 0; i < 7; i++) safeBox(K(sl(0.966 + i * 0.009)), 1, 47, [3.4, 3.9, 13], TRUCKS[i % 5]);
      building(K(sl(0.040)), 1, 46, 11, 5.0, 24, { col: BRICK, roof: ROOF_R });
      building(K(sl(0.984)), 1, 50, 14, 5.4, 26, { col: STEEL, roof: ROOF_D, flat: true });
      groundPatch(K(sl(0.994)), 1, 60, [34, 0.18, 88], TARMACISH);
      for (let i = 0; i < 3; i++) safeBox(K(sl(0.030 + i * 0.013)), 1, 62, [9, 4.0, 12], TENT);
      // Team/competitor parking behind the workshops, then the estate treeline.
      carPark(sl(0.950), sl(0.020), 1, 70, 7, 3, 61);
      hedge(sl(0.948), sl(0.062), 1, 80, 2.2, HEDGE_L);
      rank(sl(0.944), sl(0.070), 1, 92, 20, 610, 9.5, 15.5);
      // Paddock perimeter fencing, not spectator debris fence.
      fence(sl(0.955), sl(0.055), 1, 30, 2.4, FENCE_C);
      fence(sl(0.950), sl(0.062), 1, 66, 2.2, FENCE_C);

      // ---------------------------------------------------------------------
      // 3. s 0.022 -1 20 — START/FINISH STAND (modest, two shallow banks)
      //    shell/crowd are COLOUR ARRAYS; null lets the emitter pick a livery.
      //    Re-keyed with the pits — the stand and gantry face the line.
      // ---------------------------------------------------------------------
      grandstandEx(sl(0.014), -1, 21, 76, null, null);
      grandstandEx(sl(0.040), -1, 21, 58, null, null);
      sponsorHoarding(sl(0.995), sl(0.062), -1, 13);
      fence(sl(0.990), sl(0.070), -1, 12, 3.0, FENCE_C);
      gantry(sl(0.002), 7.2, [0.80, 0.80, 0.78]);
      // --- public side DEPTH: concourse units, trade stands, then the car park
      //     and a belt of estate trees closing the view out.
      for (let i = 0; i < 5; i++)
        safeBox(K(sl(0.996 + i * 0.013)), -1, 38, [6, 3.3, 9], i % 2 ? TENT : CREAM);
      building(K(sl(0.052)), -1, 44, 10, 4.6, 22, { col: BRICK_D, roof: ROOF_R });
      building(K(sl(0.972)), -1, 42, 9, 4.2, 16, { col: STEEL, roof: ROOF_D, flat: true });
      groundPatch(K(sl(0.020)), -1, 62, [30, 0.16, 96], GRAVEL);
      carPark(sl(0.960), sl(0.070), -1, 66, 9, 4, 143);
      rank(sl(0.938), sl(0.088), -1, 86, 22, 720, 9.0, 15.0);

      // ---------------------------------------------------------------------
      // 4. s 0.048 +1 34 — THE DONINGTON COLLECTION
      //    Long, low, flat-roofed exhibition hall set back behind the paddock,
      //    coach apron in front, hedge screening it from the track.
      // ---------------------------------------------------------------------
      // gap 58, not the brief's 34: closer than ~55 the hall overlaps tarmac.
      building(K(0.048), 1, 58, 24, 7.5, 64, { col: WALL, roof: ROOF, flat: true });
      building(K(0.072), 1, 28, 12, 4.8, 18, { col: WALL_2, roof: ROOF, flat: true });
      groundPatch(K(0.046), 1, 24, [26, 0.18, 54], TARMACISH);
      hedge(0.034, 0.078, 1, 17, 2.2, HEDGE_C);
      for (let i = 0; i < 4; i++) specimen(K(0.040 + i * 0.011), 1, 60, i * 7);
      // --- the museum reads as a SITE, not one shed: a second exhibition wing
      //     set back, an entrance block, the coach apron and visitor parking.
      building(K(0.062), 1, 62, 18, 6.2, 34, { col: CREAM, roof: ROOF_D, flat: true });
      building(K(0.030), 1, 54, 12, 5.0, 20, { col: BRICK, roof: ROOF_R });
      safeBox(K(0.050), 1, 40, [11, 3.8, 9], CONCRETE);          // entrance canopy
      groundPatch(K(0.052), 1, 38, [18, 0.16, 46], GRAVEL);      // coach apron
      for (let i = 0; i < 5; i++) safeBox(K(0.038 + i * 0.006), 1, 37, [3.0, 3.6, 12], TRUCKS[i % 5]);
      carPark(0.022, 0.040, 1, 44, 4, 3, 209);
      hedge(0.018, 0.052, 1, 76, 1.9, HEDGE_L);                  // estate boundary
      rank(0.014, 0.054, 1, 84, 14, 830, 9.0, 15.0);
      rank(0.056, 0.084, 1, 46, 8, 836, 9.5, 15.5);

      // ---------------------------------------------------------------------
      // 5. s 0.0663 -1 12 — REDGATE (first-corner right off the straight)
      // ---------------------------------------------------------------------
      guardrail(0.055, 0.098, -1, 12, ARMCO);
      tyreWall(0.060, 0.080, -1, 12.5, TW_R);
      spectatorHill(0.052, 0.105, -1, 22, { h: 7.5, col: GRASS });
      marshalPost(K(0.0663), -1, 15);
      billboard(K(0.090), -1, 16, 9, 3.2, [0.72, 0.72, 0.70]);
      forestEdge(0.050, 0.110, -1, 48, { col: LEAF_D });
      // --- behind the Hollywood-side bank: observation box, a service
      //     hardstanding with a marshal unit, then a deeper broadleaf rank.
      hut(K(0.0663), -1, 27, CREAM);
      safeBox(K(0.072), -1, 30, [4.2, 3.0, 6], WALL_2);          // commentary box
      billboard(K(0.056), -1, 17, 7, 2.6, [0.66, 0.68, 0.66]);
      groundPatch(K(0.084), -1, 32, [16, 0.16, 44], GRAVEL);
      carPark(0.078, 0.096, -1, 34, 3, 2, 311);
      hedge(0.044, 0.114, -1, 62, 2.0, HEDGE_C);
      rank(0.040, 0.120, -1, 70, 18, 940, 9.5, 16.0);

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
      // --- the crowd's own depth: catering row on the concourse behind the
      //     bank, a toilet/store block, the spectator car park, back treeline.
      for (let i = 0; i < 5; i++)
        safeBox(K(0.142 + i * 0.015), -1, 36, [5.4, 3.3, 8], i % 2 ? TENT : CREAM);
      building(K(0.208), -1, 40, 9, 4.2, 18, { col: STEEL, roof: ROOF_D, flat: true });
      building(K(0.134), -1, 42, 8, 4.0, 14, { col: BRICK_D, roof: ROOF_R });
      groundPatch(K(0.176), -1, 46, [20, 0.16, 70], GRAVEL);
      carPark(0.136, 0.226, -1, 62, 9, 4, 407);
      hut(K(0.190), -1, 30, CREAM);
      billboard(K(0.222), -1, 17, 8, 3.0, [0.68, 0.70, 0.68]);
      rank(0.112, 0.258, -1, 78, 26, 1050, 10.0, 16.5);

      // ---------------------------------------------------------------------
      // 7. s 0.2500 +1 26 — MID-CRANER INFIELD: KEEP IT EMPTY
      //    Individual specimens on mown grass and one low ridge running with
      //    the slope. Nothing tall — the Hollywood bank is paying for this view.
      //    The only additions here are GROUND: mown/unmown patchwork and a
      //    second low ridge. No structures, no rank, nothing that blocks the
      //    fall from the bank above it.
      // ---------------------------------------------------------------------
      for (let i = 0; i < 7; i++) specimen(K(0.200 + i * 0.020), 1, 30 + (i % 3) * 12, 100 + i * 13);
      slopeRidge(K(0.245), 1, 66, 110, 24, 5.5, GRASS);
      slopeRidge(K(0.290), 1, 84, 90, 20, 4.0, ROUGH);
      slopeRidge(K(0.205), 1, 74, 80, 22, 3.5, GRASS_D);
      groundPatch(K(0.255), 1, 26, [30, 0.16, 70], GRASS);
      groundPatch(K(0.215), 1, 40, [26, 0.14, 64], GRASS_D);
      groundPatch(K(0.288), 1, 34, [24, 0.14, 58], ROUGH);

      // ---------------------------------------------------------------------
      // 8. s 0.3212 -1 13 — CRANER CURVES: enclosed and dark
      // ---------------------------------------------------------------------
      guardrail(0.255, 0.345, -1, 10.5, ARMCO);
      tyreWall(0.278, 0.294, -1, 11.5, TW_Y);
      tyreWall(0.312, 0.330, -1, 11.5, TW_Y);
      forestEdge(0.250, 0.355, -1, 18, { col: LEAF_D, spacing: 11 });
      forestEdge(0.255, 0.350, -1, 36, { col: LEAF, spacing: 14 });
      marshalPost(K(0.3212), -1, 14);
      // --- a THIRD rank deeper into the wood plus understorey, so the outside
      //     of the fall is a body of trees rather than a painted edge.
      rank(0.246, 0.360, -1, 58, 24, 1160, 10.5, 17.5);
      for (let i = 0; i < 6; i++) bush(K(0.258 + i * 0.017), -1, 26 + (i % 2) * 7, LEAF_D);
      hut(K(0.300), -1, 24, WALL_2);

      // ---------------------------------------------------------------------
      // 9. s 0.3342 +1 15 — OLD HAIRPIN, the lowest point of the lap
      // ---------------------------------------------------------------------
      spectatorHill(0.318, 0.372, 1, 17, { h: 8.0, col: GRASS });
      hedge(0.314, 0.378, 1, 15, 1.9, HEDGE_C);
      guardrail(0.310, 0.380, 1, 12, ARMCO);
      marshalPost(K(0.3342), 1, 13);
      for (let i = 0; i < 4; i++) specimen(K(0.330 + i * 0.016), 1, 46, 200 + i * 9);
      // --- behind the viewing bank: a small terrace, the marshals' hut and a
      //     field boundary with a rank of hedgerow oaks beyond it.
      terrace(0.328, 0.356, 1, 30, { h: 3.5, col: CONCRETE });
      hut(K(0.3342), 1, 28, CREAM);
      safeBox(K(0.350), 1, 32, [4.0, 2.8, 5], WALL_2);
      groundPatch(K(0.340), 1, 36, [20, 0.16, 56], ROUGH);
      hedge(0.306, 0.386, 1, 54, 2.1, HEDGE_L);
      rank(0.302, 0.392, 1, 64, 16, 1270, 9.5, 16.0);

      // ---------------------------------------------------------------------
      // 10. s 0.4552 +1 10 — STARKEY'S BRIDGE, on the climb back out
      // ---------------------------------------------------------------------
      guardrail(0.415, 0.495, 1, 11, ARMCO);
      guardrail(0.415, 0.495, -1, 11, ARMCO);
      sponsorHoarding(0.440, 0.472, 1, 12);
      sponsorHoarding(0.440, 0.472, -1, 12);
      place(K(0.4552), 1, 15, [4.0, 6.0, 14], CONCRETE);
      place(K(0.4552), -1, 15, [4.0, 6.0, 14], CONCRETE);
      // THE DECK. Both abutments existed and nothing crossed between them —
      // a landmark named "Bridge" that was a gap in the sky. The belief that
      // blocked it (copied into mosport.js as "there is no `bridge` emitter in
      // the scenery(api) contract") was simply wrong: circuitKit.pedestrianBridge
      // is on the frozen 112-member contract.
      circuitKit.pedestrianBridge({ id: "kit:donington:starkeys", frac: 0.4552,
        clearance: 5.6, depth: 4, thickness: 0.9, required: true });
      slopeRidge(K(0.452), 1, 44, 60, 16, 6.5, GRASS);
      slopeRidge(K(0.452), -1, 44, 60, 16, 6.0, GRASS);
      marshalPost(K(0.470), 1, 13);
      // --- wing walls either side of the abutments, the access track over the
      //     embankment, and trees carrying the crossing into the parkland.
      safeBox(K(0.4482), 1, 22, [3.2, 4.2, 9], CONCRETE);
      safeBox(K(0.4482), -1, 22, [3.2, 4.2, 9], CONCRETE);
      safeBox(K(0.4622), 1, 22, [3.2, 4.2, 9], CONCRETE);
      safeBox(K(0.4622), -1, 22, [3.2, 4.2, 9], CONCRETE);
      hut(K(0.4680), 1, 20, CREAM);
      groundPatch(K(0.4552), 1, 40, [30, 0.16, 26], GRAVEL);
      rank(0.420, 0.492, 1, 58, 14, 1380, 9.0, 15.0);
      rank(0.418, 0.494, -1, 56, 14, 1420, 9.5, 15.5);

      // ---------------------------------------------------------------------
      // 11. s 0.5162 -1 22 — SCHWANTZ CURVE: trees, and nothing else
      // ---------------------------------------------------------------------
      forestEdge(0.490, 0.556, -1, 22, { col: LEAF, spacing: 14 });
      forestEdge(0.495, 0.552, -1, 44, { col: LEAF_D, spacing: 17 });
      guardrail(0.492, 0.556, -1, 12, ARMCO);
      marshalPost(K(0.5162), -1, 15);
      // --- deep wood: a third rank and scrub at the foot of it. No buildings,
      //     by the brief; the only man-made thing here is the marshals' hut.
      rank(0.486, 0.562, -1, 64, 20, 1490, 10.0, 17.0);
      for (let i = 0; i < 7; i++) bush(K(0.494 + i * 0.010), -1, 30 + (i % 3) * 6, i % 2 ? LEAF_D : LEAF_B);
      hut(K(0.5162), -1, 27, WALL_2);

      // ---------------------------------------------------------------------
      // 12. s 0.5713 +1 18 — McLEANS
      // ---------------------------------------------------------------------
      tyreWall(0.562, 0.584, 1, 12, TW_Y);
      spectatorHill(0.558, 0.594, 1, 19, { h: 5.5, col: GRASS });
      marshalPost(K(0.5713), 1, 14);
      for (let i = 0; i < 6; i++) specimen(K(0.556 + i * 0.013), 1, 40 + (i % 2) * 14, 300 + i * 11);
      guardrail(0.550, 0.600, 1, 12, ARMCO);
      // --- small standing bank with its own hut and a rough-grass apron, then
      //     hedgerow and parkland trees stepping back into the estate.
      hut(K(0.5713), 1, 26, CREAM);
      safeBox(K(0.588), 1, 30, [3.6, 2.6, 5], WALL_2);
      groundPatch(K(0.574), 1, 34, [22, 0.16, 62], ROUGH);
      hedge(0.548, 0.606, 1, 56, 2.0, HEDGE_L);
      rank(0.544, 0.610, 1, 66, 16, 1600, 9.0, 15.5);

      // ---------------------------------------------------------------------
      // 13. s 0.6803 -1 14 — COPPICE, the woodland the uphill right runs into
      // ---------------------------------------------------------------------
      forestEdge(0.650, 0.720, -1, 16, { col: LEAF_D, spacing: 10 });
      forestEdge(0.655, 0.715, -1, 34, { col: LEAF, spacing: 13 });
      tyreWall(0.674, 0.690, -1, 12.5, TW_Y);
      guardrail(0.650, 0.730, -1, 11, ARMCO);
      marshalPost(K(0.6803), -1, 14);
      // --- the coppice has BODY: a third rank, hazel scrub at its foot and a
      //     low ridge carrying the wood up the slope behind the corner.
      rank(0.644, 0.736, -1, 56, 22, 1710, 10.5, 17.5);
      for (let i = 0; i < 8; i++) bush(K(0.652 + i * 0.010), -1, 24 + (i % 3) * 5, i % 2 ? LEAF_D : LEAF_C);
      slopeRidge(K(0.700), -1, 62, 90, 22, 5.0, GRASS_D);
      hut(K(0.6803), -1, 24, CREAM);

      // ---------------------------------------------------------------------
      // 14. s 0.7592 -1 12 — THE ESSES (spectator tunnel crossing)
      // ---------------------------------------------------------------------
      guardrail(0.735, 0.782, -1, 11, ARMCO);
      tyreWall(0.750, 0.768, -1, 12, TW_R);
      grandstandEx(0.756, -1, 18, 44, null, null);
      billboard(K(0.744), -1, 15, 8, 3.0, [0.72, 0.72, 0.70]);
      sponsorHoarding(0.730, 0.752, -1, 12.5);
      sponsorHoarding(0.766, 0.790, -1, 12.5);
      fence(0.732, 0.790, -1, 13.5, 3.0, FENCE_C);
      marshalPost(K(0.7592), -1, 15);
      // --- tunnel mouth and its retaining walls, the concourse units behind
      //     the stand, a second small bank, parking and a closing treeline.
      safeBox(K(0.7592), -1, 26, [7, 3.0, 5], CONCRETE);
      safeBox(K(0.7548), -1, 26, [2.4, 3.4, 6], CONCRETE);
      safeBox(K(0.7636), -1, 26, [2.4, 3.4, 6], CONCRETE);
      for (let i = 0; i < 4; i++)
        safeBox(K(0.736 + i * 0.012), -1, 34, [5.2, 3.2, 8], i % 2 ? TENT : CREAM);
      spectatorHill(0.726, 0.746, -1, 24, { h: 4.5, col: GRASS });
      groundPatch(K(0.772), -1, 36, [20, 0.16, 58], GRAVEL);
      carPark(0.768, 0.792, -1, 40, 4, 3, 1823);
      hut(K(0.780), -1, 24, CREAM);
      rank(0.724, 0.798, -1, 62, 18, 1840, 9.5, 16.0);

      // ---------------------------------------------------------------------
      // 15. s 0.7887 +1 20 — MELBOURNE HAIRPIN: sparse and rural
      // ---------------------------------------------------------------------
      tyreWall(0.780, 0.800, 1, 13, TW_W);   // older grey stacks out at Melbourne
      hedge(0.770, 0.815, 1, 26, 2.1, HEDGE_C);
      marshalPost(K(0.7887), 1, 16);
      slopeRidge(K(0.795), 1, 56, 70, 18, 4.5, ROUGH);
      for (let i = 0; i < 3; i++) specimen(K(0.776 + i * 0.018), 1, 52, 400 + i * 15);
      // --- the rural tell: a brick farm building group well back behind the
      //     hedge, a field gate onto rough grazing, and hedgerow standards.
      hut(K(0.7887), 1, 22, CREAM);
      building(K(0.802), 1, 74, 12, 5.2, 22, { col: BRICK, roof: ROOF_R });
      building(K(0.812), 1, 70, 10, 4.4, 16, { col: STEEL, roof: ROOF_D, flat: true });
      for (let i = 0; i < 4; i++) safeBox(K(0.784 + i * 0.006), 1, 66, [3.4, 2.4, 4.5], i % 2 ? ROUGH : GRASS_D);
      groundPatch(K(0.792), 1, 44, [24, 0.14, 70], ROUGH);
      hedge(0.766, 0.822, 1, 60, 1.9, HEDGE_L);
      rank(0.762, 0.828, 1, 80, 14, 1950, 9.0, 15.0);

      // ---------------------------------------------------------------------
      // 16. s 0.8700 -1 30 — MELBOURNE RETURN LEG: the least developed stretch
      // ---------------------------------------------------------------------
      hedge(0.820, 0.920, -1, 32, 2.3, HEDGE_C);
      guardrail(0.815, 0.925, -1, 11, ARMCO);
      groundPatch(K(0.870), -1, 18, [22, 0.16, 80], ROUGH);
      groundPatch(K(0.905), -1, 18, [22, 0.16, 60], ROUGH);
      for (let i = 0; i < 5; i++) specimen(K(0.828 + i * 0.020), -1, 46, 500 + i * 19);
      // --- farmland beyond the boundary: a second hedge line making a field,
      //     a stock barn, bales on the stubble and hedgerow standards.
      hedge(0.836, 0.912, -1, 66, 2.0, HEDGE_L);
      building(K(0.884), -1, 78, 13, 5.0, 26, { col: BRICK_D, roof: ROOF_R });
      safeBox(K(0.896), -1, 74, [8, 3.6, 12], STEEL);
      for (let i = 0; i < 6; i++) safeBox(K(0.842 + i * 0.008), -1, 56, [2.8, 2.2, 3.2], i % 2 ? ROUGH : GRASS_D);
      groundPatch(K(0.860), -1, 50, [26, 0.14, 74], GRASS_D);
      slopeRidge(K(0.890), -1, 58, 90, 22, 4.0, ROUGH);
      rank(0.822, 0.926, -1, 86, 18, 2060, 9.5, 16.0);

      // ---------------------------------------------------------------------
      // 17. s 0.9437 +1 13 — GODDARDS, the last corner onto the pit straight
      // ---------------------------------------------------------------------
      tyreWall(0.936, 0.954, 1, 13, TW_R);
      grandstandEx(0.948, -1, 19, 58, null, null);
      sponsorHoarding(0.930, 0.972, -1, 13);
      marshalPost(K(0.9437), 1, 14);
      building(K(0.962), 1, 24, 9, 5.0, 14, { col: WALL_2, roof: ROOF });
      guardrail(0.925, 0.985, -1, 11.5, ARMCO);
      // --- pit-exit end wall and its service yard on the inside, concourse
      //     units and a back treeline behind the outside stand.
      safeBox(K(0.970), 1, 17, [3.0, 3.4, 12], CONCRETE);        // pit-exit wall
      // gap 26 (was 30): at 30 the roof cap frustum was refused and the plant
      // housing hung 5.6 m over the ground (the baselined float cluster).
      building(K(0.978), 1, 26, 10, 4.6, 18, { col: BRICK, roof: ROOF_R });
      groundPatch(K(0.968), 1, 38, [22, 0.16, 54], TARMACISH);
      hut(K(0.9437), 1, 20, CREAM);
      for (let i = 0; i < 4; i++)
        safeBox(K(0.932 + i * 0.013), -1, 36, [5.2, 3.2, 8], i % 2 ? TENT : CREAM);
      terrace(0.956, 0.980, -1, 28, { h: 3.5, col: CONCRETE });
      rank(0.924, 0.992, -1, 62, 16, 2170, 9.0, 15.5);

      // ---------------------------------------------------------------------
      // 18. WHOLE LAP — parkland scatter, base armco, marshal posts
      //     Well-spaced mature broadleaf with mown grass between: the hash gate
      //     drops ~60% of candidates and the distance jitter breaks any rank.
      //     Skipped through the Craner fall (0.17–0.33) on the infield so the
      //     drop stays visible from the Hollywood bank.
      // ---------------------------------------------------------------------
      every(22, (k) => {
        const s = k / n;
        const h = hash(k * 37 + 5);
        if (h < 0.50) return;
        for (const side of [-1, 1]) {
          if (side > 0 && s > 0.16 && s < 0.34) continue;      // keep Craner open
          if (side > 0 && (s > 0.94 || s < 0.09)) continue;    // paddock side
          const g = hash(k * 53 + (side > 0 ? 11 : 3));
          if (g < 0.30) continue;
          const dist = 26 + g * 26 + (side < 0 ? 6 : 10);
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 10)) continue;
          tree(k, side, dist, 9 + g * 7, LEAVES[Math.floor(g * 6) % 6]);
          if (g > 0.86) bush(k, side, dist - 8, LEAF_D);
        }
      });

      // Parkland woodland blocks: the estate's wood belts, set well back so the
      // near ground stays open grass. Kept off the Craner fall entirely.
      forestEdge(0.355, 0.430, 1, 54, { col: LEAF, spacing: 16 });
      forestEdge(0.480, 0.560, 1, 50, { col: LEAF_D, spacing: 17 });
      forestEdge(0.590, 0.660, -1, 40, { col: LEAF, spacing: 15 });
      forestEdge(0.600, 0.665, 1, 46, { col: LEAF_D, spacing: 18 });
      forestEdge(0.720, 0.760, -1, 38, { col: LEAF, spacing: 16 });
      forestEdge(0.800, 0.865, 1, 44, { col: LEAF, spacing: 18 });
      forestEdge(0.930, 1.000, -1, 46, { col: LEAF_D, spacing: 17 });

      // Far horizon belts BEHIND those: guarded, mixed and thinner, so the
      // parkland has a third distance instead of stopping at one wood edge.
      rank(0.356, 0.432, 1, 74, 14, 3010, 10.0, 16.5);
      rank(0.592, 0.662, -1, 64, 14, 3020, 10.0, 16.5);
      rank(0.598, 0.668, 1, 70, 14, 3030, 9.5, 16.0);
      rank(0.718, 0.762, -1, 60, 10, 3040, 10.0, 16.0);

      // Estate field boundaries: hedgerow with mown verge, the English tell.
      hedge(0.360, 0.440, 1, 24, 2.0, HEDGE_C);
      hedge(0.600, 0.668, 1, 26, 2.0, HEDGE_C);
      hedge(0.700, 0.745, -1, 26, 2.0, HEDGE_C);
      hedge(0.400, 0.448, 1, 46, 1.8, HEDGE_L);
      hedge(0.612, 0.664, -1, 30, 1.8, HEDGE_L);

      // Debris fence on the public side of the lap.
      fence(0.545, 0.700, 1, 15, 2.8, FENCE_C);
      fence(0.780, 0.930, -1, 15, 2.8, FENCE_C);

      // Modest standing banks where the crowd actually gathers.
      spectatorHill(0.660, 0.700, -1, 20, { h: 5.0, col: GRASS });
      spectatorHill(0.930, 0.985, -1, 24, { h: 6.5, col: GRASS });
      terrace(0.940, 0.972, -1, 22, { h: 4.5, col: CONCRETE });

      // Continuous armco so the whole edge reads as a circuit, not a lane.
      guardrail(0.0, 1.0, -1, 13.5, ARMCO);
      guardrail(0.10, 0.93, 1, 14.5, ARMCO);

      // Posts on the eighths, skipping the ones already placed above.
      for (let i = 0; i < 8; i++) {
        const s = i / 8;
        if (s > 0.30 && s < 0.40) continue;
        marshalPost(K(s), 1, 17);
      }
        // ---------------------------------------------------------------- FAR HORIZON
      // A 2026-09-15 visual pass found this circuit's road rising and falling
      // through a pancake-flat green plane that met the sky at a hard edge —
      // the lap had relief and the WORLD had none, which is part of why the
      // elevation read as exaggerated: the road moved and nothing behind it did.
      // These are gentle Leicestershire farmland. The park sits in the Trent valley's
      // shallow rise — the horizon is hedgerow and low ridge, deliberately the
      // softest of the four, because that is what is actually there.
      // Placed off the lap by anchor() so they follow the circuit's own frame,
      // and seated on terrainYAt so they rise out of the ground rather than
      // float on it.
      const farHill = (frac, side, dist, w, h, dy) => {
        const a = anchor(K(frac), side, dist).c;
        const y = terrainYAt(a[0], a[2]);
        // snowline ABOVE the summit: the default is 0.62, which put snow and
        // rock on the top 38% of hills this size — Leicestershire hedgerow and pasture
        // carries neither.
        mountain(a[0], a[2], (y === null ? a[1] : y) + dy, w, h,
          { rough: 0.18, snowline: 2, forest: [0.20, 0.34, 0.20] });
      };
      farHill(0.08, 1, 1178, 1886, 54, -25);
      farHill(0.28, -1, 1240, 1722, 47, -22);
      farHill(0.52, 1, 1364, 2050, 61, -27);
      farHill(0.72, -1, 1147, 1558, 44, -21);
      farHill(0.9, 1, 1271, 1804, 51, -23);
  };
