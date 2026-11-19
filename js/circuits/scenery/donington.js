"use strict";
(window.TrackScenery = window.TrackScenery || {})["donington"] =
  function (api) {
      const { mountain, n, hash, every, anchor, onTrack, out, terrainYAt,
        tree, bush, hedge, forestEdge,
        building, grandstandEx, spectatorHill, terrace,
        guardrail, fence, tyreWall, marshalPost, cameraTower, broadcastCompound,
        billboard, sponsorHoarding, gantry, groundPatch,
        place, ridge, circuitKit, modelGroup, vadd, addBox, addCyl, addFrustum, seat, MAT, lapBounds, pyMin } = api;

      const { K } = api;

      const LEAF      = [0.20, 0.33, 0.17];
      const LEAF_D    = [0.15, 0.26, 0.14];
      const LEAF_L    = [0.26, 0.38, 0.21];
      const LEAF_Y    = [0.28, 0.35, 0.18];
      const LEAF_B    = [0.17, 0.30, 0.20];
      const LEAF_C    = [0.22, 0.30, 0.24];
      const HEDGE_C   = [0.16, 0.28, 0.15];
      const HEDGE_L   = [0.19, 0.31, 0.17];
      const GRASS     = [0.29, 0.37, 0.22];
      const GRASS_D   = [0.25, 0.33, 0.20];
      const ROUGH     = [0.32, 0.36, 0.24];
      const ARMCO     = [0.74, 0.75, 0.76];
      const FENCE_C   = [0.56, 0.58, 0.58];
      const TYRE      = [0.17, 0.17, 0.18];
      const WALL      = [0.78, 0.77, 0.74];
      const WALL_2    = [0.70, 0.71, 0.70];
      const BRICK     = [0.44, 0.34, 0.30];
      const BRICK_D   = [0.38, 0.30, 0.27];
      const CREAM     = [0.80, 0.78, 0.72];
      const STEEL     = [0.55, 0.56, 0.57];
      const ROOF      = [0.42, 0.44, 0.45];
      const ROOF_D    = [0.33, 0.35, 0.37];
      const ROOF_R    = [0.40, 0.33, 0.30];
      const CONCRETE  = [0.62, 0.62, 0.60];
      const TARMACISH = [0.30, 0.30, 0.31];
      const GRAVEL    = [0.50, 0.49, 0.45];
      const TENT      = [0.79, 0.78, 0.75];
      const TW_R      = [0.62, 0.16, 0.14];
      const TW_Y      = [0.55, 0.52, 0.16];
      const TW_W      = [0.57, 0.58, 0.60];

      const LEAVES  = [LEAF, LEAF_L, LEAF_D, LEAF_Y, LEAF_B, LEAF_C];
      const TRUCKS  = [[0.72, 0.72, 0.71], [0.30, 0.33, 0.38], [0.45, 0.24, 0.22],
                       [0.60, 0.60, 0.58], [0.26, 0.34, 0.30]];
      const CARS    = [[0.55, 0.56, 0.58], [0.27, 0.29, 0.33], [0.44, 0.23, 0.21],
                       [0.63, 0.63, 0.61], [0.22, 0.28, 0.32], [0.36, 0.38, 0.36]];

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
        tree(k, side, d, 8.5 + h * 6.5, LEAVES[(Math.floor(h * 6) + seed) % 6]);
      };
      const safeBox = (k, side, dist, dims, col) => {
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 8)) return;
        place(k, side, dist, dims, col);
      };
      const hut = (k, side, dist, col) => safeBox(k, side, dist, [2.6, 2.8, 3.4], col || CREAM);
      const rank = (f0, f1, side, dist, count, seed, hMin, hMax, relief) => {
        for (let i = 0; i < count; i++) {
          const t = count < 2 ? 0.5 : i / (count - 1);
          const h = hash(i * 31 + seed);
          const g = hash(i * 13 + seed + 7);
          const k = K(f0 + (f1 - f0) * t + (g - 0.5) * 0.004);
          const d = dist + h * 16;
          const a = anchor(k, side, d);
          if (onTrack(a.c[0], a.c[2], 9)) continue;
          if (relief != null) {
            let lo = Infinity, hi = -Infinity;
            for (const [dx, dz] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) {
              const y = terrainYAt(a.c[0] + dx, a.c[2] + dz);
              lo = Math.min(lo, y); hi = Math.max(hi, y);
            }
            if (hi - lo > relief) continue;
          }
          tree(k, side, d, hMin + h * (hMax - hMin), LEAVES[Math.floor(g * 6) % 6]);
          if (g > 0.88) bush(k, side, d - 7, LEAF_D);
        }
      };
      const carPark = (f0, f1, side, dist, rows, cols, seed) => {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const h = hash(r * 29 + c * 7 + seed);
            if (h < 0.18) continue;
            const k = K(f0 + (f1 - f0) * ((r + 0.5) / rows));
            const d = dist + c * 6.5 + h * 1.4;
            const a = anchor(k, side, d);
            if (onTrack(a.c[0], a.c[2], 8)) continue;
            place(k, side, d, [4.3, 2.25, 1.9], CARS[Math.floor(h * 6) % 6]);
          }
        }
      };

      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (f) => (f + SL) % 1;
      building(K(sl(0.9748)), 1, 26, 14, 4.8, 52, { col: WALL, roof: ROOF });
      building(K(sl(0.032)), 1, 19, 12, 5.5, 34, { col: WALL_2, roof: ROOF });
      building(K(sl(0.004)), 1, 25, 10, 7.0, 16, { col: CREAM, roof: ROOF_D });
      groundPatch(K(sl(0.000)), 1, 34, [32, 0.16, 70], TARMACISH);
      for (let i = 0; i < 4; i++)
        safeBox(K(sl(0.978 + i * 0.012)), 1, 48 + (i % 2) * 4, [3.2, 3.0, 10], TRUCKS[i % 5]);
      broadcastCompound(K(sl(0.020)), 1, 32, { col: WALL_2 });
      cameraTower(K(sl(0.004)), 1, 20, { h: 11 });
      for (let i = 0; i < 7; i++) safeBox(K(sl(0.966 + i * 0.009)), 1, 52, [3.4, 3.9, 13], TRUCKS[i % 5]);
      building(K(sl(0.984)), 1, 58, 14, 5.4, 26, { col: STEEL, roof: ROOF_D, flat: true });
      groundPatch(K(sl(0.994)), 1, 76, [22, 0.22, 54], GRAVEL);
      for (let i = 0; i < 3; i++) safeBox(K(sl(0.030 + i * 0.013)), 1, 62, [9, 4.0, 12], TENT);
      carPark(sl(0.950), sl(0.020), 1, 70, 7, 3, 61);
      hedge(sl(0.948), sl(0.062), 1, 80, 2.2, HEDGE_L);
      rank(sl(0.944), sl(0.070), 1, 92, 20, 610, 9.5, 15.5);
      fence(sl(0.955), sl(0.055), 1, 30, 2.4, FENCE_C);
      fence(sl(0.950), sl(0.062), 1, 66, 2.2, FENCE_C);

      grandstandEx(sl(0.014), -1, 32, 64, null, null,
        { roof: "cantilever", tiers: 1 });
      grandstandEx(sl(0.040), -1, 32, 42, null, null,
        { roof: "cantilever", tiers: 1, endWalls: true });
      sponsorHoarding(sl(0.995), sl(0.062), -1, 13);
      fence(sl(0.990), sl(0.070), -1, 12, 3.0, FENCE_C);
      gantry(sl(0.002), 7.2, [0.80, 0.80, 0.78]);
      for (let i = 0; i < 5; i++)
        safeBox(K(sl(0.996 + i * 0.013)), -1, 38, [6, 3.3, 9], i % 2 ? TENT : CREAM);
      building(K(sl(0.052)), -1, 44, 10, 4.6, 22, { col: BRICK_D, roof: ROOF_R });
      building(K(sl(0.972)), -1, 42, 9, 4.2, 16, { col: STEEL, roof: ROOF_D, flat: true });
      groundPatch(K(sl(0.020)), -1, 62, [30, 0.16, 96], GRAVEL);
      carPark(sl(0.960), sl(0.070), -1, 66, 9, 4, 143);
      rank(sl(0.938), sl(0.088), -1, 86, 22, 720, 9.0, 15.0, 1.5);

      building(K(0.048), 1, 58, 24, 7.5, 64, { col: WALL, roof: ROOF, flat: true });
      {
        const a = anchor(K(0.048), 1, 70);
        addBox(out, vadd(a.c, a.u, 8.25), [7, 1.65, 20], CONCRETE,
          [a.r, a.u, a.t]);
      }
      building(K(0.072), 1, 28, 12, 4.8, 18, { col: WALL_2, roof: ROOF, flat: true });
      groundPatch(K(0.046), 1, 24, [26, 0.18, 54], TARMACISH);
      hedge(0.034, 0.060, 1, 17, 2.2, HEDGE_C);
      for (let i = 0; i < 4; i++) specimen(K(0.040 + i * 0.011), 1, 60, i * 7);
      building(K(0.062), 1, 62, 18, 6.2, 34, { col: CREAM, roof: ROOF_D, flat: true });
      building(K(0.030), 1, 54, 12, 5.0, 20, { col: BRICK, roof: ROOF_R });
      safeBox(K(0.050), 1, 40, [11, 3.8, 9], CONCRETE);
      groundPatch(K(0.052), 1, 38, [18, 0.16, 46], GRAVEL);
      for (let i = 0; i < 5; i++) safeBox(K(0.038 + i * 0.006), 1, 37, [3.0, 3.6, 12], TRUCKS[i % 5]);
      carPark(0.022, 0.040, 1, 44, 4, 3, 209);
      hedge(0.018, 0.052, 1, 76, 1.9, HEDGE_L);
      rank(0.014, 0.054, 1, 84, 14, 830, 9.0, 15.0);
      rank(0.056, 0.084, 1, 46, 8, 836, 9.5, 15.5);

      guardrail(0.055, 0.098, -1, 12, ARMCO);
      tyreWall(0.060, 0.080, -1, 12.5, TW_R);
      spectatorHill(0.052, 0.105, -1, 22, { h: 7.5, col: GRASS });
      marshalPost(K(0.0663), -1, 15);
      billboard(K(0.090), -1, 16, 9, 3.2, [0.72, 0.72, 0.70]);
      forestEdge(0.050, 0.110, -1, 48, { col: LEAF_D });
      safeBox(K(0.072), -1, 30, [4.2, 3.0, 6], WALL_2);
      billboard(K(0.056), -1, 17, 7, 2.6, [0.66, 0.68, 0.66]);
      groundPatch(K(0.084), -1, 32, [16, 0.16, 44], GRAVEL);
      carPark(0.078, 0.096, -1, 34, 3, 2, 311);
      hedge(0.044, 0.114, -1, 62, 2.0, HEDGE_C);
      rank(0.040, 0.120, -1, 70, 18, 940, 9.5, 16.0);

      {
        const side = -1;
        const sHollywood = 0.188;
        const a = anchor(K(sHollywood), side, 24);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const b = [a.r, a.u, a.t];
          const STEEL = [0.58, 0.59, 0.60], WHITE = [0.82, 0.81, 0.78];
          const SHELL = [0.74, 0.73, 0.70], FASCIA = [0.18, 0.42, 0.28];
          const CROWD = [[0.78, 0.22, 0.18], [0.22, 0.40, 0.62], [0.88, 0.86, 0.82],
                         [0.90, 0.78, 0.22], [0.30, 0.32, 0.34]];
          modelGroup("donington-hollywood-stand", {
            center: vadd(a.c, a.u, 7.0), size: [14, 14, 52], basis: b,
          }, (stage) => {
            const len = 46;
            const rows = 5;
            let padY = terrainYAt(a.c[0], a.c[2]);
            for (const [rr, tt] of [[-4, -24], [-4, 24], [4, -24], [4, 24]])
              padY = Math.max(padY, terrainYAt(...[0, 2].map((i) => a.c[i] + a.r[i] * rr + a.t[i] * tt)));
            const pad = [a.c[0], padY + 0.15, a.c[2]];
            stage._mat = MAT.CONCRETE;
            seat.box(stage, pad, [8, 0.4, len + 2], [0.52, 0.52, 0.50], b);
            for (let t = 0; t < rows; t++) {
              const back = 1.1 + t * 1.4;
              const y = 0.55 + t * 1.15;
              const foot = vadd(vadd(pad, a.r, side * back), a.u, y);
              stage._mat = MAT.CONCRETE;
              seat.box(stage, foot, [1.3, 0.18, len - t * 0.6],
                t & 1 ? [0.70, 0.69, 0.66] : [0.66, 0.65, 0.62], b);
              stage._mat = MAT.FABRIC;
              const cnt = Math.min(8, Math.floor(len / 7));
              for (let j = 0; j < cnt; j++) {
                const h2 = hash(K(sHollywood) * 17 + t * 41 + j * 13);
                if (h2 < 0.45) continue;
                seat.box(stage, vadd(vadd(foot, a.t, (j / Math.max(1, cnt - 1) - 0.5) * (len - 6)), a.u, 0.2),
                  [0.55, 0.95, 1.3], CROWD[Math.floor(h2 * 97) % CROWD.length], b);
              }
            }
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(vadd(pad, a.r, side * 8.8), a.u, 6.2),
              [2.8, 11.5, len - 2], SHELL, b);
            for (const dt of [-(len / 2 + 0.3), len / 2 + 0.3]) {
              addBox(stage, vadd(vadd(pad, a.t, dt), a.r, side * 4.5),
                [10, 11, 0.65], WHITE, b);
            }
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(pad, a.r, side * 4.5), a.u, 11.6),
              [11, 0.4, len + 2], STEEL, b);
            addBox(stage, vadd(vadd(pad, a.r, side * 0.35), a.u, 1.4),
              [0.18, 1.9, len - 4], FASCIA, b);
            stage._mat = 0;
          }, { required: true });
        }
        building(K(0.198), side, 58, 14, 5.5, 26, { col: CREAM, roof: ROOF_D, flat: true });
        building(K(0.208), side, 60, 8, 4.0, 14, { col: WALL_2, roof: ROOF, flat: true });
      }
      spectatorHill(0.118, 0.148, -1, 30, { h: 6.5, col: GRASS });
      spectatorHill(0.220, 0.240, -1, 30, { h: 7.0, col: GRASS });
      forestEdge(0.120, 0.250, -1, 52, { col: LEAF, spacing: 15 });
      guardrail(0.120, 0.250, -1, 11, ARMCO);
      fence(0.130, 0.235, -1, 14, 3.2, FENCE_C);
      marshalPost(K(0.1698), -1, 14);
      sponsorHoarding(0.150, 0.200, -1, 13);
      for (let i = 0; i < 5; i++)
        safeBox(K(0.142 + i * 0.015), -1, 44, [5.4, 3.3, 8], i % 2 ? TENT : CREAM);
      building(K(0.225), -1, 50, 9, 4.2, 18, { col: STEEL, roof: ROOF_D, flat: true });
      building(K(0.134), -1, 48, 8, 4.0, 14, { col: BRICK_D, roof: ROOF_R });
      groundPatch(K(0.190), -1, 54, [18, 0.16, 56], GRAVEL);
      carPark(0.150, 0.230, -1, 70, 8, 4, 407);
      hut(K(0.200), -1, 38, CREAM);
      billboard(K(0.230), -1, 18, 8, 3.0, [0.68, 0.70, 0.68]);
      rank(0.112, 0.258, -1, 82, 22, 1050, 10.0, 16.5);

      for (let i = 0; i < 7; i++) specimen(K(0.200 + i * 0.020), 1, 30 + (i % 3) * 12, 100 + i * 13);
      slopeRidge(K(0.245), 1, 66, 110, 24, 5.5, GRASS);
      slopeRidge(K(0.290), 1, 84, 90, 20, 4.0, ROUGH);
      slopeRidge(K(0.205), 1, 74, 80, 22, 3.5, GRASS_D);
      groundPatch(K(0.255), 1, 26, [30, 0.16, 70], GRASS);
      groundPatch(K(0.215), 1, 40, [26, 0.14, 64], GRASS_D);
      groundPatch(K(0.288), 1, 34, [24, 0.14, 58], ROUGH);

      guardrail(0.255, 0.345, -1, 10.5, ARMCO);
      tyreWall(0.278, 0.294, -1, 11.5, TW_Y);
      tyreWall(0.312, 0.330, -1, 11.5, TW_Y);
      forestEdge(0.250, 0.355, -1, 18, { col: LEAF_D, spacing: 11 });
      forestEdge(0.255, 0.350, -1, 36, { col: LEAF, spacing: 14 });
      marshalPost(K(0.3212), -1, 14);
      rank(0.246, 0.360, -1, 58, 24, 1160, 10.5, 17.5);
      for (let i = 0; i < 6; i++) bush(K(0.258 + i * 0.017), -1, 26 + (i % 2) * 7, LEAF_D);
      hut(K(0.300), -1, 24, WALL_2);

      spectatorHill(0.318, 0.372, 1, 18, { h: 8.0, col: GRASS });
      hedge(0.314, 0.378, 1, 15, 1.9, HEDGE_C);
      guardrail(0.310, 0.380, 1, 12, ARMCO);
      marshalPost(K(0.3342), 1, 13);
      for (let i = 0; i < 4; i++) specimen(K(0.330 + i * 0.016), 1, 46, 200 + i * 9);
      terrace(0.328, 0.356, 1, 32, { rows: 3, rise: 0.9, depth: 2.0, conc: CONCRETE });
      safeBox(K(0.350), 1, 32, [4.0, 2.8, 5], WALL_2);
      groundPatch(K(0.340), 1, 36, [20, 0.16, 56], ROUGH);
      hedge(0.306, 0.386, 1, 54, 2.1, HEDGE_L);
      rank(0.302, 0.392, 1, 64, 16, 1270, 9.5, 16.0);

      guardrail(0.415, 0.495, 1, 11, ARMCO);
      guardrail(0.415, 0.495, -1, 11, ARMCO);
      sponsorHoarding(0.440, 0.472, 1, 12);
      sponsorHoarding(0.440, 0.472, -1, 12);
      place(K(0.4552), 1, 15, [4.0, 6.0, 14], CONCRETE);
      place(K(0.4552), -1, 15, [4.0, 6.0, 14], CONCRETE);
      circuitKit.pedestrianBridge({ id: "kit:donington:starkeys", frac: 0.4552,
        clearance: 5.6, depth: 4, thickness: 0.9, required: true });
      slopeRidge(K(0.452), 1, 44, 60, 16, 6.5, GRASS);
      slopeRidge(K(0.452), -1, 44, 60, 16, 6.0, GRASS);
      marshalPost(K(0.470), 1, 13);
      safeBox(K(0.4482), 1, 22, [3.2, 4.2, 9], CONCRETE);
      safeBox(K(0.4482), -1, 22, [3.2, 4.2, 9], CONCRETE);
      safeBox(K(0.4622), 1, 22, [3.2, 4.2, 9], CONCRETE);
      safeBox(K(0.4622), -1, 22, [3.2, 4.2, 9], CONCRETE);
      hut(K(0.4680), 1, 20, CREAM);
      groundPatch(K(0.4552), 1, 40, [30, 0.16, 26], GRAVEL);
      rank(0.420, 0.492, 1, 58, 14, 1380, 9.0, 15.0);
      rank(0.418, 0.494, -1, 56, 14, 1420, 9.5, 15.5);

      forestEdge(0.490, 0.556, -1, 22, { col: LEAF, spacing: 14 });
      forestEdge(0.495, 0.552, -1, 44, { col: LEAF_D, spacing: 17 });
      guardrail(0.492, 0.556, -1, 12, ARMCO);
      marshalPost(K(0.5162), -1, 15);
      rank(0.486, 0.562, -1, 64, 20, 1490, 10.0, 17.0);
      for (let i = 0; i < 7; i++) bush(K(0.494 + i * 0.010), -1, 30 + (i % 3) * 6, i % 2 ? LEAF_D : LEAF_B);

      tyreWall(0.562, 0.584, 1, 12, TW_Y);
      spectatorHill(0.558, 0.594, 1, 19, { h: 5.5, col: GRASS });
      marshalPost(K(0.5713), 1, 14);
      for (let i = 0; i < 6; i++) specimen(K(0.556 + i * 0.013), 1, 40 + (i % 2) * 14, 300 + i * 11);
      guardrail(0.550, 0.600, 1, 12, ARMCO);
      safeBox(K(0.588), 1, 30, [3.6, 2.6, 5], WALL_2);
      groundPatch(K(0.574), 1, 34, [22, 0.16, 62], ROUGH);
      hedge(0.548, 0.606, 1, 56, 2.0, HEDGE_L);
      rank(0.544, 0.610, 1, 66, 16, 1600, 9.0, 15.5);

      {
        const sAir = 0.640;
        const a = anchor(K(sAir), -1, 480);
        const gy = terrainYAt(a.c[0], a.c[2]);
        const groundY = gy == null ? a.c[1] : gy;
        const c = [a.c[0], groundY + 2.1, a.c[2]];
        const bn = [a.r, a.u, a.t];
        const bf = [a.r, a.t, a.u];
        const FUSE = [0.58, 0.60, 0.64];
        const DARK = [0.28, 0.29, 0.32];
        const TAIL = [0.14, 0.34, 0.52];
        const APRON = [0.32, 0.32, 0.33];
        modelGroup("donington-ema-airliner", {
          center: [c[0], groundY + 4, c[2]], size: [48, 12, 48], basis: bn,
        }, (stage) => {
          const pad = [a.c[0], groundY + 0.12, a.c[2]];
          stage._mat = MAT.CONCRETE;
          seat.box(stage, pad, [40, 0.28, 52], APRON, bn);
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(c, a.t, -16), 1.85, 34, FUSE, 8, bf);
          addBox(stage, c, [32, 0.65, 4.4], DARK, bn);
          addBox(stage, vadd(c, a.t, 14.5), [0.55, 4.8, 3.8], TAIL, bn);
          addBox(stage, vadd(c, a.t, 13.6), [9.5, 0.5, 2.6], DARK, bn);
          for (const off of [-6, 4]) {
            addCyl(stage, vadd(vadd(c, a.t, off), a.u, -2.0), 0.18, 1.6, DARK, 4, bn);
          }
        }, { required: true });
      }

      forestEdge(0.650, 0.720, -1, 16, { col: LEAF_D, spacing: 10 });
      forestEdge(0.655, 0.715, -1, 34, { col: LEAF, spacing: 13 });
      tyreWall(0.674, 0.690, -1, 12.5, TW_Y);
      guardrail(0.650, 0.730, -1, 11, ARMCO);
      marshalPost(K(0.6803), -1, 14);
      rank(0.644, 0.736, -1, 56, 22, 1710, 10.5, 17.5);
      for (let i = 0; i < 8; i++) bush(K(0.652 + i * 0.010), -1, 24 + (i % 3) * 5, i % 2 ? LEAF_D : LEAF_C);
      slopeRidge(K(0.700), -1, 62, 90, 22, 5.0, GRASS_D);

      guardrail(0.735, 0.782, -1, 11, ARMCO);
      tyreWall(0.750, 0.768, -1, 12, TW_R);
      grandstandEx(0.756, -1, 24, 40, null, null,
        { roof: "cantilever", tiers: 1, endWalls: true });
      billboard(K(0.744), -1, 15, 8, 3.0, [0.72, 0.72, 0.70]);
      sponsorHoarding(0.730, 0.752, -1, 12.5);
      sponsorHoarding(0.766, 0.790, -1, 12.5);
      fence(0.732, 0.790, -1, 13.5, 3.0, FENCE_C);
      marshalPost(K(0.7592), -1, 15);
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

      tyreWall(0.780, 0.800, 1, 13, TW_W);
      hedge(0.770, 0.815, 1, 26, 2.1, HEDGE_C);
      marshalPost(K(0.7887), 1, 16);
      slopeRidge(K(0.795), 1, 56, 70, 18, 4.5, ROUGH);
      for (let i = 0; i < 3; i++) specimen(K(0.776 + i * 0.018), 1, 52, 400 + i * 15);
      building(K(0.802), 1, 74, 12, 5.2, 22, { col: BRICK, roof: ROOF_R });
      building(K(0.812), 1, 70, 10, 4.4, 16, { col: STEEL, roof: ROOF_D, flat: true });
      for (let i = 0; i < 4; i++) safeBox(K(0.784 + i * 0.006), 1, 66, [3.4, 2.4, 4.5], i % 2 ? ROUGH : GRASS_D);
      groundPatch(K(0.792), 1, 44, [24, 0.14, 70], ROUGH);
      hedge(0.766, 0.822, 1, 60, 1.9, HEDGE_L);
      rank(0.762, 0.828, 1, 80, 14, 1950, 9.0, 15.0);

      hedge(0.820, 0.920, -1, 32, 2.3, HEDGE_C);
      guardrail(0.815, 0.925, -1, 11, ARMCO);
      groundPatch(K(0.870), -1, 18, [22, 0.16, 80], ROUGH);
      groundPatch(K(0.905), -1, 18, [22, 0.16, 60], ROUGH);
      for (let i = 0; i < 5; i++) specimen(K(0.828 + i * 0.020), -1, 46, 500 + i * 19);
      hedge(0.836, 0.912, -1, 66, 2.0, HEDGE_L);
      building(K(0.884), -1, 78, 13, 5.0, 26, { col: BRICK_D, roof: ROOF_R });
      safeBox(K(0.896), -1, 74, [8, 3.6, 12], STEEL);
      for (let i = 0; i < 6; i++) safeBox(K(0.842 + i * 0.008), -1, 56, [2.8, 2.2, 3.2], i % 2 ? ROUGH : GRASS_D);
      groundPatch(K(0.860), -1, 50, [26, 0.14, 74], GRASS_D);
      slopeRidge(K(0.890), -1, 58, 90, 22, 4.0, ROUGH);
      rank(0.822, 0.926, -1, 86, 18, 2060, 9.5, 16.0);

      tyreWall(0.936, 0.954, 1, 13, TW_R);
      sponsorHoarding(0.930, 0.972, -1, 13);
      marshalPost(K(0.9437), 1, 14);
      building(K(0.962), 1, 24, 9, 5.0, 14, { col: WALL_2, roof: ROOF });
      guardrail(0.925, 0.985, -1, 11.5, ARMCO);
      safeBox(K(0.970), 1, 17, [3.0, 3.4, 12], CONCRETE);
      building(K(0.978), 1, 26, 10, 4.6, 18, { col: BRICK, roof: ROOF_R });
      groundPatch(K(0.968), 1, 38, [22, 0.16, 54], TARMACISH);
      for (let i = 0; i < 4; i++)
        safeBox(K(0.932 + i * 0.013), -1, 44, [5.2, 3.2, 8], i % 2 ? TENT : CREAM);
      rank(0.924, 0.992, -1, 66, 14, 2170, 9.0, 15.5);

      every(22, (k) => {
        const s = k / n;
        const h = hash(k * 37 + 5);
        if (h < 0.50) return;
        for (const side of [-1, 1]) {
          if (side > 0 && s > 0.16 && s < 0.34) continue;
          if (side > 0 && (s > 0.94 || s < 0.09)) continue;
          const g = hash(k * 53 + (side > 0 ? 11 : 3));
          if (g < 0.30) continue;
          const dist = 26 + g * 26 + (side < 0 ? 6 : 10);
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 10)) continue;
          tree(k, side, dist, 9 + g * 7, LEAVES[Math.floor(g * 6) % 6]);
          if (g > 0.86) bush(k, side, dist - 8, LEAF_D);
        }
      });

      forestEdge(0.355, 0.430, 1, 54, { col: LEAF, spacing: 16 });
      forestEdge(0.480, 0.560, 1, 50, { col: LEAF_D, spacing: 17 });
      forestEdge(0.590, 0.660, -1, 40, { col: LEAF, spacing: 15 });
      forestEdge(0.600, 0.665, 1, 46, { col: LEAF_D, spacing: 18 });
      forestEdge(0.720, 0.760, -1, 38, { col: LEAF, spacing: 16 });
      forestEdge(0.800, 0.865, 1, 44, { col: LEAF, spacing: 18 });
      forestEdge(0.930, 1.000, -1, 46, { col: LEAF_D, spacing: 17 });

      rank(0.356, 0.432, 1, 74, 14, 3010, 10.0, 16.5);
      rank(0.592, 0.662, -1, 64, 14, 3020, 10.0, 16.5);
      rank(0.598, 0.668, 1, 70, 14, 3030, 9.5, 16.0);
      rank(0.718, 0.762, -1, 60, 10, 3040, 10.0, 16.0);

      hedge(0.360, 0.440, 1, 24, 2.0, HEDGE_C);
      hedge(0.600, 0.668, 1, 26, 2.0, HEDGE_C);
      hedge(0.700, 0.745, -1, 26, 2.0, HEDGE_C);
      hedge(0.400, 0.448, 1, 46, 1.8, HEDGE_L);
      hedge(0.612, 0.664, -1, 30, 1.8, HEDGE_L);

      fence(0.545, 0.700, 1, 15, 2.8, FENCE_C);
      fence(0.780, 0.930, -1, 15, 2.8, FENCE_C);

      spectatorHill(0.660, 0.700, -1, 20, { h: 5.0, col: GRASS });
      spectatorHill(0.910, 0.935, -1, 28, { h: 5.5, col: GRASS });

      guardrail(0.10, 0.93, 1, 14.5, ARMCO);

      for (let i = 0; i < 8; i++) {
        const s = i / 8;
        if (s > 0.30 && s < 0.40) continue;
        marshalPost(K(s), 1, 17);
      }
      {
        const RAT_BEARING = 66.1 * Math.PI / 180, RAT_DIST = 3400;
        const rx = -Math.sin(RAT_BEARING), rz = Math.cos(RAT_BEARING);
        const sx = -rz, sz = rx;
        const { cx, cz } = lapBounds();
        const hx = cx + rx * RAT_DIST, hz = cz + rz * RAT_DIST;
        const hg = terrainYAt(hx, hz);
        const hubY = hg === null ? pyMin : hg;
        const COOL = [0.60, 0.62, 0.64];
        const CHIM = [0.54, 0.56, 0.58];
        const UP = [[sx, 0, sz], [0, 1, 0], [rx, 0, rz]];
        const at = (across, depth) => [hx + sx * across + rx * depth, hz + sz * across + rz * depth];
        const floor = (x, z) => { const g = terrainYAt(x, z); return (g === null ? hubY : g) - 1; };
        const TH = 114, TR0 = 43.5, TR_WAIST = 25, TR_TOP = 27.5;
        const CHIM_H = 199, CHIM_R0 = 11, CHIM_R1 = 6.5;
        const CHIM_AT = [320, -60];
        modelGroup("donington-ratcliffe-power", {
          center: [at(31, 0)[0], hubY + 105, at(31, 0)[1]],
          size: [604, 230, 244],
          basis: UP,
        }, (stage) => {
          for (const across of [-225, -75, 75, 225]) {
            for (const depth of [-75, 75]) {
              const [x, z] = at(across, depth);
              const y = floor(x, z);
              addFrustum(stage, [x, y, z], TR0, TR_WAIST, TH * 0.46 + 1, COOL, 10, null);
              addFrustum(stage, [x, y + TH * 0.46, z], TR_WAIST, TR_TOP, TH * 0.54 + 1, COOL, 10, null);
            }
          }
          const [cxp, czp] = at(CHIM_AT[0], CHIM_AT[1]);
          addFrustum(stage, [cxp, floor(cxp, czp), czp], CHIM_R0, CHIM_R1, CHIM_H + 1, CHIM, 10, null);
        }, { required: true });
      }

      const farHill = (frac, side, dist, w, h, dy) => {
        const a = anchor(K(frac), side, dist).c;
        const y = terrainYAt(a[0], a[2]);
        mountain(a[0], a[2], (y === null ? a[1] : y) + dy, w, h,
          { rough: 0.18, snowline: 2, forest: [0.20, 0.34, 0.20] });
      };
      farHill(0.08, 1, 1178, 1886, 54, -25);
      farHill(0.28, -1, 1240, 1722, 47, -22);
      farHill(0.52, 1, 1364, 2050, 61, -27);
      farHill(0.72, -1, 1147, 1558, 44, -21);
      farHill(0.9, 1, 1271, 1804, 51, -23);
  };
