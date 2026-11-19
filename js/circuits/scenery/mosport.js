"use strict";
(window.TrackScenery = window.TrackScenery || {})["mosport"] =
  function (api) {
      const { mountain, n, hash, every, anchor, onTrack, terrainYAt,
        tree, bush, hedge, forestEdge, vadd, MAT, modelGroup, seat,
        grandstandEx, spectatorHill, indexSolid,
        guardrail, fence, tyreWall, marshalPost, cameraTower, broadcastCompound,
        billboard, sponsorHoarding, gantry, groundPatch,
        place, ridge, circuitKit } = api;

      const { K } = api;

      const LEAF      = [0.24, 0.42, 0.18];
      const LEAF_D    = [0.17, 0.31, 0.15];
      const LEAF_L    = [0.33, 0.50, 0.22];
      const CONIF     = [0.12, 0.25, 0.19];
      const CONIF_L   = [0.16, 0.31, 0.22];
      const HEDGE_C   = [0.19, 0.32, 0.16];
      const GRASS     = [0.33, 0.45, 0.21];
      const ROUGH     = [0.38, 0.43, 0.24];
      const SAND      = [0.66, 0.58, 0.42];
      const ARMCO     = [0.76, 0.77, 0.78];
      const FENCE_C   = [0.58, 0.60, 0.60];
      const TYRE_R    = [0.62, 0.16, 0.14];
      const TYRE_Y    = [0.58, 0.54, 0.16];
      const WALL      = [0.82, 0.81, 0.77];
      const WALL_2    = [0.72, 0.73, 0.71];
      const ROOF      = [0.40, 0.42, 0.44];
      const CONCRETE  = [0.64, 0.64, 0.62];
      const TARMACISH = [0.30, 0.30, 0.31];

      const headingAt = (k) => {
        const a = anchor(k, 1, 0).c;
        const b = anchor((k + 4) % n, 1, 0).c;
        return Math.atan2(b[0] - a[0], b[2] - a[2]);
      };
      const slopeRidge = (k, side, dist, len, w, h, col) => {
        const a = anchor(k, side, dist);
        const x = a.c[0], z = a.c[2];
        if (onTrack(x, z, 10)) return;
        ridge(x, z, terrainYAt(x, z) - h * 0.35, headingAt(k), len, w, h, col);
      };
      const specimen = (k, side, dist, seed) => {
        const h = hash(k * 17 + seed);
        const d = dist + h * 9;
        const a = anchor(k, side, d);
        if (onTrack(a.c[0], a.c[2], 9)) return;
        tree(k, side, d, 9.0 + h * 7.0, h < 0.4 ? LEAF_L : (h < 0.75 ? LEAF : LEAF_D));
      };
      const mixedTree = (k, side, dist, seed) => {
        const h = hash(k * 23 + seed);
        const d = dist + h * 7;
        const a = anchor(k, side, d);
        if (onTrack(a.c[0], a.c[2], 8)) return;
        if (h < 0.34) tree(k, side, d, 13.0 + h * 22.0, h < 0.17 ? CONIF : CONIF_L);
        else tree(k, side, d, 8.5 + h * 7.5, h < 0.62 ? LEAF : (h < 0.86 ? LEAF_L : LEAF_D));
      };
      const mixedWood = (s0, s1, side, gap, depth, sp) => {
        const q = (s1 - s0) * 0.25;
        forestEdge(s0, s1, side, gap, { col: LEAF, spacing: sp });
        forestEdge(s0 + q * 0.4, s1 - q * 0.4, side, gap + depth * 0.5, { col: CONIF, spacing: sp + 3 });
        forestEdge(s0 + q, s1 - q, side, gap + depth, { col: LEAF_D, spacing: sp + 5 });
      };
      const footbridge = (s, seed) => {
        const k = K(s);
        circuitKit.pedestrianBridge({ id: "kit:mosport:foot-" + seed, frac: s,
          clearance: 5.5, depth: 3, thickness: 0.9, required: true });
        place(k, 1, 12, [3.2, 6.5, 4.5], CONCRETE);
        place(k, -1, 12, [3.2, 6.5, 4.5], CONCRETE);
        place(K(s + 0.0015), 1, 16, [2.4, 3.0, 3.0], WALL_2);
        place(K(s - 0.0015), -1, 16, [2.4, 3.0, 3.0], WALL_2);
        specimen(K(s + 0.004), -1, 24, seed);
      };

      {
        const a = anchor(K(0.0000), 1, 18);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.12);
        const b = [a.r, a.u, a.t];
        modelGroup("mosport-pit-garages", {
          center: vadd(foot, a.u, 4.0), size: [18, 12, 140], basis: b,
        }, (stage) => {
          seat.box(stage, vadd(foot, a.u, 2.7), [12, 5.4, 128], WALL, b);
          seat.box(stage, vadd(foot, a.u, 5.55), [13.2, 0.35, 130], ROOF, b);
          for (let i = 0; i < 14; i++) {
            const p = vadd(vadd(foot, a.t, (i - 6.5) * 8.8), a.r, -6.1);
            seat.box(stage, vadd(p, a.u, 2.2), [0.25, 4.0, 6.4],
              i & 1 ? WALL_2 : [0.22, 0.23, 0.24], b);
          }
          const annex = vadd(foot, a.t, 72);
          seat.box(stage, vadd(annex, a.u, 2.1), [9, 4.2, 18], WALL_2, b);
          seat.box(stage, vadd(annex, a.u, 4.35), [9.8, 0.3, 19], ROOF, b);
        }, { required: true });
      }
      groundPatch(K(0.0000), 1, 32, [36, 0.18, 104], TARMACISH);
      broadcastCompound(K(0.0180), 1, 30, { col: WALL_2 });
      cameraTower(K(0.0040), 1, 22, { h: 10.5 });
      fence(0.9500, 0.0540, 1, 30, 2.4, FENCE_C);
      marshalPost(K(0.0050), 1, 16);

      grandstandEx(0.0040, -1, 18, 68, null, null);
      grandstandEx(0.0300, -1, 18, 46, null, null);
      sponsorHoarding(0.9930, 0.0520, -1, 12.5);
      fence(0.9880, 0.0600, -1, 11.5, 3.0, FENCE_C);
      gantry(0.0020, 7.0, [0.80, 0.80, 0.78]);
      spectatorHill(0.9850, 0.0450, -1, 30, { h: 5.0, col: GRASS });

      guardrail(0.0120, 0.0560, -1, 11, ARMCO);
      tyreWall(0.0150, 0.0260, -1, 11.5, TYRE_R);
      marshalPost(K(0.0183), -1, 14);
      mixedWood(0.0130, 0.0650, -1, 16, 20, 11);
      groundPatch(K(0.0210), -1, 13, [7, 0.16, 46], SAND);

      groundPatch(K(0.0467), 1, 22, [34, 0.16, 90], GRASS);
      slopeRidge(K(0.0480), 1, 74, 78, 22, 6.0, GRASS);
      slopeRidge(K(0.0900), 1, 96, 70, 18, 4.5, ROUGH);
      for (let i = 0; i < 7; i++) specimen(K(0.0300 + i * 0.0150), 1, 34 + (i % 3) * 13, 100 + i * 13);
      hedge(0.0650, 0.1150, 1, 52, 2.0, HEDGE_C);

      guardrail(0.1050, 0.1750, -1, 10.5, ARMCO);
      mixedWood(0.1050, 0.1800, -1, 14, 22, 10);
      footbridge(0.1483, 11);
      groundPatch(K(0.1400), -1, 12, [6, 0.16, 60], SAND);
      marshalPost(K(0.1300), -1, 13);

      guardrail(0.1700, 0.2300, -1, 11, ARMCO);
      tyreWall(0.1510, 0.1930, 1, 12.0, TYRE_R);
      spectatorHill(0.1700, 0.2050, -1, 42, { rows: 2, col: GRASS });
      marshalPost(K(0.1817), -1, 15);
      mixedWood(0.1780, 0.2450, -1, 28, 24, 11);
      fence(0.1680, 0.2150, -1, 20, 2.8, FENCE_C);

      guardrail(0.2300, 0.3250, 1, 12, ARMCO);
      guardrail(0.2300, 0.3050, -1, 11, ARMCO);
      spectatorHill(0.2720, 0.2920, 1, 28, { rows: 2, col: GRASS });
      mixedWood(0.2350, 0.3200, 1, 36, 22, 13);
      mixedWood(0.2250, 0.3050, -1, 15, 24, 11);
      marshalPost(K(0.2800), 1, 16);

      guardrail(0.2950, 0.3600, -1, 11, ARMCO);
      tyreWall(0.3050, 0.3220, -1, 12.0, TYRE_Y);
      marshalPost(K(0.3117), -1, 14);
      mixedWood(0.2980, 0.3700, -1, 14, 22, 10);
      fence(0.3000, 0.3500, -1, 15, 2.8, FENCE_C);
      billboard(K(0.3350), -1, 16, 9, 3.2, [0.74, 0.73, 0.70]);
      groundPatch(K(0.3150), -1, 13, [7, 0.16, 40], SAND);

      guardrail(0.3600, 0.4700, -1, 11.5, ARMCO);
      mixedWood(0.3600, 0.4700, -1, 18, 26, 11);
      groundPatch(K(0.4050), -1, 14, [8, 0.16, 70], SAND);
      groundPatch(K(0.4400), -1, 12, [10, 0.16, 56], SAND);
      marshalPost(K(0.4200), -1, 16);
      for (let i = 0; i < 4; i++) specimen(K(0.3750 + i * 0.0180), 1, 44 + (i % 2) * 16, 200 + i * 9);
      slopeRidge(K(0.4150), 1, 82, 72, 20, 5.0, ROUGH);

      tyreWall(0.4700, 0.4830, 1, 12.5, TYRE_R);
      tyreWall(0.4900, 0.5030, 1, 12.5, TYRE_R);
      indexSolid(0.465, 0.510, 1, 22, 28);
      indexSolid(0.465, 0.510, -1, 18, 24);
      {
        const sMoss = 0.4865;
        const gap0 = 30;
        const a0 = anchor(K(sMoss), 1, gap0);
        if (!onTrack(a0.c[0], a0.c[2], 10)) {
          const b0 = [a0.r, a0.u, a0.t];
          modelGroup("mosport-moss-corner-bank", {
            center: vadd(a0.c, a0.u, 4.5), size: [14, 12, 28], basis: b0,
          }, (stage) => {
            const SEAT_C = [[0.78, 0.28, 0.22], [0.86, 0.86, 0.84], [0.22, 0.34, 0.56]];
            const len = 22;
            for (let t = 0; t < 4; t++) {
              const ai = anchor(K(sMoss), 1, gap0 + t * 2.6);
              const bi = [ai.r, ai.u, ai.t];
              const h = 1.35 + t * 1.85 + (t % 2) * 0.12;
              const tierLen = len - t * 1.2;
              stage._mat = MAT.CONCRETE;
              seat.box(stage, vadd(ai.c, ai.u, h * 0.5),
                [2.6, h, tierLen], t % 2 ? CONCRETE : WALL_2, bi);
              stage._mat = MAT.FABRIC;
              seat.box(stage, vadd(ai.c, ai.u, h + 0.48 + t * 0.05),
                [2.0, 0.85, tierLen * 0.88], SEAT_C[t % 3], bi);
              stage._mat = 0;
            }
            const aB = anchor(K(sMoss), 1, gap0 + 14);
            stage._mat = MAT.CONCRETE;
            seat.box(stage, vadd(aB.c, aB.u, 2.4), [4.5, 4.4, len - 8], GRASS,
              [aB.r, aB.u, aB.t]);
            stage._mat = 0;
          }, { required: true });
        }
      }
      marshalPost(K(0.4865), 1, 15);
      fence(0.4620, 0.5150, 1, 20, 3.0, FENCE_C);
      sponsorHoarding(0.4700, 0.5050, 1, 18);
      guardrail(0.4640, 0.5200, -1, 11, ARMCO);
      tyreWall(0.4780, 0.4960, -1, 12.0, TYRE_Y);
      forestEdge(0.4600, 0.5250, -1, 50, { col: LEAF_D, spacing: 20 });
      forestEdge(0.4600, 0.5250, -1, 72, { col: LEAF_D, spacing: 22 });
      forestEdge(0.4700, 0.5150, -1, 92, { col: CONIF, spacing: 26 });

      guardrail(0.5150, 0.6000, -1, 12, ARMCO);
      slopeRidge(K(0.5400), -1, 62, 76, 20, 6.0, GRASS);
      slopeRidge(K(0.5800), -1, 76, 68, 18, 4.5, ROUGH);
      forestEdge(0.5200, 0.6100, -1, 40, { col: LEAF, spacing: 15 });
      forestEdge(0.5400, 0.5950, -1, 58, { col: CONIF, spacing: 18 });
      marshalPost(K(0.5400), -1, 15);
      groundPatch(K(0.5500), -1, 15, [10, 0.16, 70], GRASS);

      guardrail(0.6000, 0.7400, -1, 12.5, ARMCO);
      guardrail(0.6000, 0.7400, 1, 13.5, ARMCO);
      fence(0.6100, 0.7300, -1, 17, 3.0, FENCE_C);
      sponsorHoarding(0.6200, 0.7000, -1, 15);
      billboard(K(0.6400), -1, 20, 11, 3.6, [0.76, 0.75, 0.72]);
      billboard(K(0.6950), -1, 20, 11, 3.6, [0.70, 0.72, 0.74]);
      forestEdge(0.6000, 0.7400, -1, 46, { col: LEAF, spacing: 17 });
      forestEdge(0.6300, 0.7150, -1, 64, { col: CONIF, spacing: 20 });
      marshalPost(K(0.6600), -1, 18);

      groundPatch(K(0.7000), 1, 34, [46, 0.16, 120], GRASS);
      groundPatch(K(0.7800), 1, 40, [40, 0.16, 90], ROUGH);
      hedge(0.6500, 0.7900, 1, 30, 2.1, HEDGE_C);
      hedge(0.7100, 0.7700, 1, 62, 2.0, HEDGE_C);
      slopeRidge(K(0.7400), 1, 88, 88, 24, 5.0, ROUGH);
      slopeRidge(K(0.6800), 1, 108, 76, 20, 4.0, GRASS);
      for (let i = 0; i < 8; i++) specimen(K(0.6450 + i * 0.0190), 1, 44 + (i % 3) * 18, 300 + i * 11);
      marshalPost(K(0.7400), 1, 20);

      guardrail(0.7700, 0.8300, -1, 11, ARMCO);
      tyreWall(0.7940, 0.8110, -1, 12.0, TYRE_R);
      marshalPost(K(0.8017), -1, 14);
      mixedWood(0.7700, 0.8400, -1, 14, 22, 10);
      footbridge(0.7930, 27);
      groundPatch(K(0.8050), -1, 13, [7, 0.16, 44], SAND);

      guardrail(0.8350, 0.9100, -1, 10.5, ARMCO);
      guardrail(0.8350, 0.9100, 1, 11.5, ARMCO);
      tyreWall(0.8740, 0.8900, -1, 11.5, TYRE_Y);
      mixedWood(0.8350, 0.9150, -1, 13, 20, 9);
      mixedWood(0.8400, 0.9050, 1, 16, 18, 11);
      marshalPost(K(0.8817), -1, 13);

      tyreWall(0.9100, 0.9270, 1, 12.5, TYRE_R);
      grandstandEx(0.9480, 1, 32, 44, null, null);
      sponsorHoarding(0.9300, 0.9650, 1, 18);
      marshalPost(K(0.9183), 1, 14);
      fence(0.9000, 0.9600, 1, 20, 3.0, FENCE_C);
      indexSolid(0.908, 0.930, 1, 18, 16);
      indexSolid(0.908, 0.930, -1, 16, 14);
      {
        const a = anchor(K(0.9183), 1, 24);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          modelGroup("mosport-whites-tunnel", {
            center: vadd(a.c, a.u, 1.8), size: [10, 6, 12], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            seat.box(stage, vadd(a.c, a.u, 1.4), [3.6, 2.8, 5.2], CONCRETE, b);
            seat.box(stage, vadd(vadd(a.c, a.t, 2.9), a.u, 0.95),
              [3.2, 1.9, 0.4], WALL_2, b);
            seat.box(stage, vadd(vadd(a.c, a.t, -2.9), a.u, 0.95),
              [3.2, 1.9, 0.4], WALL_2, b);
            stage._mat = 0;
          }, { required: true });
        }
      }
      place(K(0.9183), -1, 22, [3.6, 2.8, 5.2], CONCRETE);
      groundPatch(K(0.9183), 1, 30, [12, 0.18, 20], TARMACISH);
      guardrail(0.8950, 0.9700, -1, 11, ARMCO);
      mixedWood(0.8950, 0.9100, -1, 36, 20, 12);
      mixedWood(0.9300, 0.9650, -1, 36, 20, 12);
      forestEdge(0.9050, 0.9350, -1, 70, { col: CONIF, spacing: 24 });

      {
        const a = anchor(K(0.9600), 1, 38);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.15);
        const b = [a.r, a.u, a.t];
        modelGroup("mosport-event-centre", {
          center: vadd(foot, a.u, 6.5), size: [28, 18, 64], basis: b,
        }, (stage) => {
          seat.box(stage, vadd(foot, a.u, 3.4), [20, 6.8, 52], WALL, b);
          stage._mat = MAT.GLASS;
          seat.box(stage, vadd(vadd(foot, a.r, -10.1), a.u, 3.6),
            [0.35, 5.2, 46], [0.28, 0.38, 0.48], b);
          stage._mat = MAT.CONCRETE;
          seat.box(stage, vadd(foot, a.u, 7.0), [21.2, 0.45, 54], ROOF, b);
          seat.box(stage, vadd(vadd(foot, a.r, -9.5), a.u, 7.55),
            [0.35, 0.9, 48], WALL_2, b);
          seat.box(stage, vadd(vadd(foot, a.r, 9.5), a.u, 7.55),
            [0.35, 0.9, 48], WALL_2, b);
          seat.box(stage, vadd(vadd(foot, a.r, 6.5), a.u, 3.2),
            [4.5, 6.0, 5.5], [0.48, 0.44, 0.40], b);
          const wing = vadd(foot, a.t, 32);
          seat.box(stage, vadd(wing, a.u, 2.1), [12, 4.2, 16], WALL_2, b);
          seat.box(stage, vadd(wing, a.u, 4.35), [12.8, 0.3, 17], ROOF, b);
          stage._mat = 0;
        }, { required: true });
      }
      groundPatch(K(0.9620), 1, 24, [22, 0.18, 52], TARMACISH);
      hedge(0.9440, 0.9860, 1, 20, 2.2, HEDGE_C);
      for (let i = 0; i < 4; i++) specimen(K(0.9500 + i * 0.0110), 1, 68, 400 + i * 7);

      every(23, (k) => {
        const s = k / n;
        const h = hash(k * 37 + 5);
        if (h < 0.46) return;
        for (const side of [-1, 1]) {
          if (side > 0 && s > 0.015 && s < 0.145) continue;
          if (side > 0 && s > 0.345 && s < 0.530) continue;
          if (side > 0 && s > 0.630 && s < 0.800) continue;
          if (side > 0 && s > 0.900 && s < 0.940) continue;
          if (side > 0 && (s > 0.930 || s < 0.070)) continue;
          if (side < 0 && s > 0.455 && s < 0.520) continue;
          if (side < 0 && s > 0.900 && s < 0.940) continue;
          const g = hash(k * 53 + (side > 0 ? 11 : 3));
          if (g < 0.26) continue;
          const dist = 22 + g * 24 + (side < 0 ? 4 : 12);
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 10)) continue;
          mixedTree(k, side, dist, 600 + (side > 0 ? 7 : 0));
          if (g > 0.84) bush(k, side, dist - 7, LEAF_D);
        }
      });

      forestEdge(0.0150, 0.1000, -1, 58, { col: CONIF, spacing: 24 });
      forestEdge(0.1700, 0.2800, -1, 58, { col: CONIF, spacing: 24 });
      forestEdge(0.5250, 0.6000, -1, 52, { col: LEAF_D, spacing: 23 });
      forestEdge(0.8300, 0.9000, -1, 56, { col: CONIF, spacing: 25 });
      forestEdge(0.9400, 0.9900, -1, 56, { col: CONIF, spacing: 25 });
      forestEdge(0.2300, 0.3300, 1, 54, { col: CONIF, spacing: 26 });
      forestEdge(0.8500, 0.9000, 1, 46, { col: LEAF_D, spacing: 24 });

      hedge(0.1500, 0.2200, 1, 44, 2.0, HEDGE_C);
      hedge(0.5400, 0.6200, 1, 36, 2.0, HEDGE_C);
      hedge(0.8000, 0.8300, 1, 34, 2.0, HEDGE_C);

      guardrail(0.0, 1.0, -1, 13.0, ARMCO);
      guardrail(0.055, 0.945, 1, 14.0, ARMCO);

      for (let i = 0; i < 9; i++) {
        const s = 0.02 + i * 0.105;
        if (i === 4) continue;
        groundPatch(K(s), -1, 12, [6, 0.14, 34], SAND);
      }

      for (let i = 0; i < 8; i++) {
        const s = i / 8;
        if (s > 0.43 && s < 0.56) continue;
        marshalPost(K(s), 1, 18);
      }
      const farHill = (frac, side, dist, w, h, dy) => {
        const a = anchor(K(frac), side, dist).c;
        const y = terrainYAt(a[0], a[2]);
        mountain(a[0], a[2], (y === null ? a[1] : y) + dy, w, h,
          { rough: 0.20, snowline: 2, forest: [0.16, 0.30, 0.18],
            rock: [0.19, 0.31, 0.19] });
      };
      farHill(0.1, 1, 1178, 1967, 68, -32);
      farHill(0.3, -1, 1302, 1640, 58, -30);
      farHill(0.55, 1, 1426, 2132, 77, -35);
      farHill(0.78, -1, 1116, 1558, 52, -27);
      farHill(0.92, 1, 1240, 1804, 62, -31);
  };
