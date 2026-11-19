"use strict";
(window.TrackScenery = window.TrackScenery || {})["dijon"] =
  function (api) {
      const { mountain, n, hash, every, anchor, onTrack, terrainYAt,
        tree, bush, hedge, building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower,
        billboard, sponsorHoarding, groundPatch, ridge,
        modelGroup, seat, vadd, MAT, addPrism, floodMast } = api;

      const { K } = api;
      const LIME   = [0.82, 0.78, 0.66];
      const LIME2  = [0.86, 0.82, 0.70];
      const GRAVEL = [0.74, 0.71, 0.61];
      const ASPH   = [0.30, 0.30, 0.31];
      const HEDGE  = [0.17, 0.29, 0.13];
      const HEDGE2 = [0.20, 0.33, 0.16];
      const HEDGE3 = [0.14, 0.25, 0.11];
      const FOL    = [0.24, 0.37, 0.19];
      const FOL_D  = [0.19, 0.31, 0.15];
      const FOL_L  = [0.31, 0.43, 0.22];
      const FOL_Y  = [0.35, 0.41, 0.21];
      const FOLS   = [FOL, FOL_D, FOL_L, FOL_Y];
      const SLOPE  = [0.33, 0.38, 0.23];
      const MEADOW = [0.37, 0.44, 0.25];
      const WHEAT  = [0.75, 0.68, 0.40];
      const STUB   = [0.66, 0.60, 0.37];
      const PLOUGH = [0.38, 0.31, 0.24];
      const RAPE   = [0.78, 0.73, 0.31];
      const VINE   = [0.27, 0.35, 0.19];
      const VINE_E = [0.46, 0.40, 0.31];
      const ARMCO  = [0.78, 0.78, 0.80];
      const CAP    = [0.86, 0.32, 0.15];
      const WALL   = [0.87, 0.86, 0.82];
      const FARM1  = [0.80, 0.76, 0.65];
      const FARM2  = [0.72, 0.68, 0.57];
      const STONE  = [0.69, 0.66, 0.57];
      const STONE2 = [0.62, 0.59, 0.50];
      const STEEL  = [0.60, 0.62, 0.66];
      const WOOD   = [0.45, 0.37, 0.27];
      const GLASS  = [0.34, 0.42, 0.46];
      const FARMW  = [FARM1, FARM2, STONE, STONE2];

      const ridgeAt = (s, side, dist, ang, len, w, h, col) => {
        const a = anchor(K(s), side, dist);
        const x = a.c[0], z = a.c[2];
        ridge(x, z, terrainYAt(x, z) - 1.5, ang, len, w, h, col);
      };

      const { drape, drapeRun } = api;

      const spotClear = (s, side, dist, r) => {
        const a = anchor(K(s), side, dist);
        return !onTrack(a.c[0], a.c[2], r);
      };
      const runClear = (s0, s1, side, gap, r) => {
        for (let i = 0; i <= 4; i++)
          if (!spotClear(s0 + (s1 - s0) * (i / 4), side, gap, r)) return false;
        return true;
      };
      const hedgeRun = (s0, s1, side, gap, h, col) => {
        if (runClear(s0, s1, side, gap, 12)) hedge(s0, s1, side, gap, h, col);
      };
      const fenceRun = (s0, s1, side, gap, h, col) => {
        if (runClear(s0, s1, side, gap, 11)) fence(s0, s1, side, gap, h, col);
      };
      const treeAt = (s, side, dist, h, col) => {
        if (spotClear(s, side, dist, 11)) tree(K(s), side, dist, h, col);
      };
      const bushAt = (s, side, dist, col) => {
        if (spotClear(s, side, dist, 8)) bush(K(s), side, dist, col);
      };
      const buildAt = (s, side, dist, w, h, d, opts) => {
        if (spotClear(s, side, dist, Math.max(w, d) * 0.6 + 11))
          building(K(s), side, dist, w, h, d, opts);
      };
      let fieldSeq = 0;
      const field = (s, side, gap, w, d, col) => {
        if (spotClear(s, side, gap, Math.max(w, d) * 0.5 + 8))
          drapeRun(s, side, gap, [w, 0.13, d], col, 0.045 * (fieldSeq++ % 5), null, { widen: 0.16 });
      };
      const vineyard = (s, side, gap, rows, len, step) => {
        if (!spotClear(s, side, gap + (rows * step) / 2, len * 0.5 + 10)) return;
        drapeRun(s, side, gap - 3, [rows * step + 6, 0.12, len + 8], VINE_E, 0.11);
        for (let i = 0; i < rows; i++)
          drapeRun(s, side, gap + i * step, [2.6, 0.3, len], VINE, 0.06, len + 8, { h: 0.9 });
      };
      const poplarRow = (s, side, dist, count, step) => {
        for (let i = 0; i < count; i++)
          treeAt(s + i * step, side, dist, 12.0 + hash(i * 17 + 3) * 3.0, FOL_L);
      };
      const outcrop = (s, side, dist, ang, len, w, h, col) => {
        if (spotClear(s, side, dist, len * 0.45)) ridgeAt(s, side, dist, ang, len, w, h, col);
      };
      const farmstead = (s, side, dist, seed, opts) => {
        const h = hash(seed), h2 = hash(seed * 7 + 3);
        if (!spotClear(s, side, dist, 26)) return;
        const a = anchor(K(s), side, dist);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = gy + 0.05;
        const b = [a.r, a.u, a.t];
        const wall = FARMW[Math.floor(h * 4) & 3];
        const barnW = FARMW[(Math.floor(h2 * 4) + 2) & 3];
        const hw = 8 + h * 3, hh = 4.6 + h * 1.4, hd = 7 + h2 * 3;
        const bw = 6 + h2 * 2.5, bh = 3.8, bd = 12 + h * 4;
        const id = (opts && opts.id) || ("dijon-farm-" + seed);
        const req = !!(opts && opts.required);
        const barn = vadd(foot, a.t, (hd + bd) * 0.5 + 2.2);
        const barnGy = terrainYAt(barn[0], barn[2]);
        if (barnGy != null) barn[1] = barnGy + 0.05;
        modelGroup(id, {
          center: vadd(foot, a.u, Math.max(hh, bh) * 0.55),
          size: [Math.max(hw, bw) + 8, Math.max(hh, bh) + 6, hd + bd + 14],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          seat.box(stage, foot, [hw, hh, hd], wall, b);
          seat.box(stage, barn, [bw, bh, bd], barnW, b);
          stage._mat = MAT.ROOF;
          addPrism(stage, vadd(foot, a.u, hh), [hw + 0.3, 1.4, hd + 0.3],
            [0.42, 0.28, 0.22], b);
          addPrism(stage, vadd(barn, a.u, bh), [bw + 0.3, 1.2, bd + 0.3],
            [0.38, 0.26, 0.20], b);
          stage._mat = 0;
        }, req ? { required: true } : undefined);
        treeAt(s - 0.005, side, dist - 4, 8.4 + h * 3.0, FOLS[Math.floor(h * 4) & 3]);
        treeAt(s + 0.009, side, dist + 3, 7.2 + h2 * 3.4, FOLS[(Math.floor(h2 * 4) + 1) & 3]);
        bushAt(s + 0.002, side, dist - 8, FOL_D);
      };

      {
        const a = anchor(K(0.028), 1, 14);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.12);
        const b = [a.r, a.u, a.t];
        modelGroup("dijon-pit-garages", {
          center: vadd(foot, a.u, 3.0), size: [16, 10, 100], basis: b,
        }, (stage) => {
          seat.box(stage, foot, [13, 4.8, 92], WALL, b);
          seat.box(stage, vadd(foot, a.u, 4.95), [14.2, 0.32, 94],
            [0.55, 0.56, 0.58], b);
          for (let i = 0; i < 9; i++) {
            const p = vadd(vadd(foot, a.t, (i - 4) * 10), a.r, -6.15);
            seat.box(stage, vadd(p, a.u, 2.0), [0.28, 3.8, 7.2],
              i & 1 ? STONE : [0.22, 0.23, 0.24], b);
          }
        }, { required: true });
      }
      {
        const a = anchor(K(0.0475), 1, 16);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.12);
        const b = [a.r, a.u, a.t];
        modelGroup("dijon-race-control", {
          center: vadd(foot, a.u, 5.0), size: [14, 14, 16], basis: b,
        }, (stage) => {
          seat.box(stage, foot, [9, 7.6, 10], WALL, b);
          stage._mat = MAT.GLASS;
          seat.box(stage, vadd(vadd(foot, a.r, -4.35), a.u, 5.2),
            [0.3, 3.6, 7.2], GLASS, b);
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(foot, a.u, 7.75), [10.2, 0.35, 11],
            [0.52, 0.54, 0.56], b);
          seat.box(stage, vadd(vadd(foot, a.r, -5.15), a.u, 8.15),
            [0.28, 0.85, 9], STEEL, b);
          stage._mat = 0;
        }, { required: true });
      }
      sponsorHoarding(0.000, 0.046, 1, 12.2, { h: 1.6, step: 7 });
      guardrail(0.972, 1.000, 1, 8.5, ARMCO);
      guardrail(0.000, 0.064, 1, 8.5, ARMCO);
      marshalPost(K(0.060), 1, 12);
      groundPatch(K(0.028), 1, 22, [12, 0.14, 62], ASPH);
      for (let i = 0; i < 3; i++) {
        buildAt(0.010 + i * 0.012, 1, 25, 6, 3.4, 7,
          { kind: "hall", wall: STONE, window: GLASS, floor: 1 });
      }

      grandstandEx(0.020, -1, 12, 132, null, null,
        { livery: "steel", endWalls: false });
      sponsorHoarding(0.000, 0.056, -1, 10.4, { h: 1.5, step: 8 });
      cameraTower(K(0.004), -1, 18, { h: 13, col: STEEL });
      buildAt(0.012, -1, 34, 8, 4.4, 10,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      buildAt(0.030, -1, 34, 7, 5.6, 8,
        { kind: "hall", wall: STONE, window: GLASS, floor: 1 });
      field(0.038, -1, 40, 30, 54, GRAVEL);
      fenceRun(0.004, 0.058, -1, 52, 2.0, STEEL);
      hedgeRun(0.000, 0.052, -1, 60, 1.9, HEDGE2);
      if (typeof floodMast === "function") {
        for (const [s, side, gap] of [
          [0.012, 1, 30], [0.034, 1, 34], [0.018, -1, 26], [0.042, -1, 30],
          [0.958, -1, 28], [0.972, -1, 32],
        ]) floodMast(K(s), side, gap, { h: 36, cool: true, pool: false, arms: 2 });
      }

      groundPatch(K(0.050), 1, 26, [46, 0.16, 120], GRAVEL);
      building(K(0.070), 1, 34, 11, 4.4, 9,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      building(K(0.080), 1, 30, 8, 3.8, 8,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      cameraTower(K(0.054), 1, 22, { h: 14, col: STEEL });
      buildAt(0.064, 1, 44, 9, 4.0, 8,
        { kind: "hall", wall: STONE, window: GLASS, floor: 1 });
      buildAt(0.042, 1, 46, 7, 3.6, 7,
        { kind: "hall", wall: STONE2, window: GLASS, floor: 1 });
      fenceRun(0.024, 0.088, 1, 54, 2.1, STEEL);

      guardrail(0.068, 0.152, -1, 9, ARMCO);
      billboard(K(0.096), -1, 12, 10, 3.4, STEEL);
      billboard(K(0.112), -1, 12, 10, 3.4, WALL);
      fenceRun(0.066, 0.156, -1, 15, 1.5, WOOD);
      field(0.082, -1, 42, 40, 60, STUB);
      field(0.118, -1, 46, 44, 66, WHEAT);
      field(0.100, -1, 88, 48, 70, PLOUGH);
      hedgeRun(0.070, 0.132, -1, 68, 1.8, HEDGE);

      spectatorHill(0.126, 0.196, -1, 24,
        { rows: 6, rise: 1.2, depth: 2.4, density: 0.55, grass: SLOPE });
      hedge(0.120, 0.204, -1, 48, 2.2, HEDGE);
      tree(K(0.138), -1, 54, 9.5, FOL);
      tree(K(0.188), -1, 50, 8.2, FOL_D);
      spectatorHill(0.140, 0.184, -1, 36,
        { rows: 4, rise: 1.1, depth: 2.2, density: 0.30, grass: SLOPE });
      fenceRun(0.118, 0.208, -1, 44, 1.8, WOOD);
      treeAt(0.160, -1, 58, 10.4, FOL_L);
      treeAt(0.206, -1, 62, 7.6, FOL_Y);
      farmstead(0.172, -1, 92, 17);
      field(0.150, -1, 138, 40, 54, WHEAT);
      vineyard(0.196, -1, 96, 5, 46, 7);

      tyreWall(0.204, 0.216, 1, 10, CAP);
      marshalPost(K(0.192), 1, 13);
      billboard(K(0.218), 1, 16, 8, 2.8, STEEL);
      guardrail(0.182, 0.244, 1, 11, ARMCO);
      tyreWall(0.236, 0.244, 1, 11, CAP);
      groundPatch(K(0.212), 1, 17, [14, 0.14, 62], GRAVEL);
      fenceRun(0.180, 0.248, 1, 20, 1.4, WOOD);
      bushAt(0.204, 1, 24, FOL_D);
      bushAt(0.236, 1, 26, FOL_D);

      groundPatch(K(0.230), -1, 12, [30, 0.16, 110], GRAVEL);
      guardrail(0.194, 0.272, -1, 13, ARMCO);
      spectatorHill(0.214, 0.266, -1, 30,
        { rows: 5, rise: 1.3, depth: 2.4, density: 0.45, grass: SLOPE });
      ridgeAt(0.244, -1, 230, 0.55, 230, 50, 12, SLOPE);
      ridgeAt(0.168, -1, 340, 1.90, 250, 56, 13, [0.30, 0.35, 0.23]);
      fenceRun(0.208, 0.276, -1, 44, 1.8, WOOD);
      buildAt(0.252, -1, 74, 8, 4.6, 18,
        { kind: "hall", wall: STONE, window: GLASS, floor: 1 });
      treeAt(0.226, -1, 66, 9.8, FOL);
      treeAt(0.262, -1, 70, 8.0, FOL_L);
      field(0.238, -1, 110, 50, 70, STUB);
      field(0.274, -1, 96, 40, 56, MEADOW);
      hedgeRun(0.216, 0.286, -1, 88, 1.9, HEDGE);

      {
        const a = anchor(K(0.308), 1, 52);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.2);
        const b = [a.r, a.u, a.t];
        modelGroup("dijon-combe-cut", {
          center: vadd(foot, a.u, 4.0), size: [40, 16, 90], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          seat.box(stage, foot, [14, 4.6, 36], LIME, b);
          const b2 = vadd(vadd(foot, a.t, 32), a.r, 8);
          const g2 = terrainYAt(b2[0], b2[2]);
          if (g2 != null) b2[1] = g2 + 0.08;
          seat.box(stage, b2, [12, 3.8, 28], LIME2, b);
          const b3 = vadd(vadd(foot, a.t, -30), a.r, 5);
          const g3 = terrainYAt(b3[0], b3[2]);
          if (g3 != null) b3[1] = g3 + 0.08;
          seat.box(stage, b3, [11, 3.2, 24], LIME, b);
          seat.box(stage, vadd(vadd(foot, a.r, 2.5), a.u, 4.9),
            [10, 0.55, 28], LIME2, b);
          stage._mat = 0;
        }, { required: true });
      }
      groundPatch(K(0.306), 1, 30, [18, 0.14, 70], LIME);
      hedge(0.280, 0.320, 1, 58, 2.0, HEDGE);
      tree(K(0.286), 1, 62, 8.6, FOL);
      tree(K(0.332), 1, 66, 7.4, FOL_D);
      bush(K(0.312), 1, 46, FOL_D);
      groundPatch(K(0.280), 1, 26, [12, 0.14, 44], LIME2);
      groundPatch(K(0.334), 1, 28, [14, 0.14, 50], GRAVEL);
      treeAt(0.300, 1, 70, 9.2, FOL_Y);
      bushAt(0.296, 1, 40, FOL_D);
      bushAt(0.328, 1, 42, FOL);
      fenceRun(0.270, 0.344, 1, 44, 1.5, WOOD);

      for (const [s, d, h] of [[0.340, 54, 8.8], [0.352, 70, 6.9],
                               [0.370, 82, 9.4], [0.386, 98, 7.2],
                               [0.402, 68, 8.1], [0.418, 88, 6.4]]) {
        tree(K(s), -1, d, h, FOL);
      }
      bush(K(0.358), -1, 50, FOL_D);
      bush(K(0.398), -1, 66, FOL_D);
      ridgeAt(0.368, -1, 300, 0.15, 270, 60, 14, [0.31, 0.36, 0.23]);
      ridgeAt(0.336, -1, 360, 2.10, 250, 58, 12, [0.32, 0.37, 0.24]);
      field(0.348, -1, 58, 34, 48, WHEAT);
      field(0.372, -1, 62, 38, 54, PLOUGH);
      field(0.398, -1, 56, 32, 50, STUB);
      field(0.360, -1, 118, 54, 74, MEADOW);
      field(0.392, -1, 126, 50, 68, WHEAT);
      vineyard(0.338, -1, 86, 6, 52, 7);
      vineyard(0.412, -1, 72, 5, 44, 7);
      fenceRun(0.336, 0.382, -1, 120, 1.5, WOOD);
      fenceRun(0.386, 0.430, -1, 124, 1.5, WOOD);
      buildAt(0.362, -1, 176, 10, 5.2, 9, { wall: FARM1, window: GLASS });
      buildAt(0.368, -1, 188, 8, 4.6, 8, { wall: STONE, window: GLASS });
      buildAt(0.356, -1, 192, 9, 4.2, 16,
        { kind: "hall", wall: STONE2, window: GLASS, floor: 1 });
      buildAt(0.380, -1, 182, 7, 4.8, 7, { wall: FARM2, window: GLASS });
      treeAt(0.366, -1, 168, 9.6, FOL_D);
      treeAt(0.376, -1, 172, 8.2, FOL);
      {
        const s = 0.424, side = -1, dist = 92, seed = 29;
        const h = hash(seed), h2 = hash(seed * 7 + 3);
        if (spotClear(s, side, dist, 26)) {
          const a = anchor(K(s), side, dist);
          const foot = a.c.slice();
          const gy = terrainYAt(foot[0], foot[2]);
          if (gy != null) foot[1] = gy + 0.05;
          const b = [a.r, a.u, a.t];
          const hw = 8 + h * 3, hh = 4.6 + h * 1.4, hd = 7 + h2 * 3;
          const bw = 6 + h2 * 2.5, bh = 3.8, bd = 12 + h * 4;
          const barn = vadd(foot, a.t, (hd + bd) * 0.5 + 2.2);
          const barnGy = terrainYAt(barn[0], barn[2]);
          if (barnGy != null) barn[1] = barnGy + 0.05;
          modelGroup("dijon-prenois-ferme", {
            center: vadd(foot, a.u, Math.max(hh, bh) * 0.55),
            size: [Math.max(hw, bw) + 8, Math.max(hh, bh) + 6, hd + bd + 14],
            basis: b,
          }, (stage) => {
            stage._mat = MAT.STONE;
            seat.box(stage, foot, [hw, hh, hd], FARM1, b);
            seat.box(stage, barn, [bw, bh, bd], STONE, b);
            stage._mat = MAT.ROOF;
            addPrism(stage, vadd(foot, a.u, hh), [hw + 0.3, 1.4, hd + 0.3],
              [0.42, 0.28, 0.22], b);
            addPrism(stage, vadd(barn, a.u, bh), [bw + 0.3, 1.2, bd + 0.3],
              [0.38, 0.26, 0.20], b);
            stage._mat = 0;
          }, { required: true });
          treeAt(s - 0.005, side, dist - 4, 8.4 + h * 3.0, FOL_D);
          treeAt(s + 0.009, side, dist + 3, 7.2 + h2 * 3.4, FOL);
          bushAt(s + 0.002, side, dist - 8, FOL_D);
        }
      }
      treeAt(0.352, -1, 96, 10.2, FOL_L);
      treeAt(0.354, -1, 102, 7.8, FOL_D);
      treeAt(0.420, -1, 84, 9.0, FOL_Y);

      guardrail(0.392, 0.474, 1, 12, ARMCO);
      guardrail(0.392, 0.474, -1, 13, ARMCO);
      tyreWall(0.406, 0.420, 1, 11, CAP);
      tyreWall(0.442, 0.464, 1, 11, CAP);
      marshalPost(K(0.430), 1, 15);
      building(K(0.424), -1, 30, 9, 4.2, 8,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      buildAt(0.448, 1, 28, 7, 3.8, 7,
        { kind: "hall", wall: STONE, window: GLASS, floor: 1 });
      groundPatch(K(0.436), 1, 22, [12, 0.14, 56], GRAVEL);
      groundPatch(K(0.430), -1, 19, [16, 0.15, 72], GRAVEL);
      fenceRun(0.390, 0.478, 1, 34, 1.6, WOOD);
      fenceRun(0.390, 0.478, -1, 26, 1.6, WOOD);
      marshalPost(K(0.466), -1, 16);
      treeAt(0.410, 1, 48, 9.4, FOL);
      treeAt(0.462, 1, 52, 8.0, FOL_Y);
      bushAt(0.440, 1, 40, FOL_D);
      field(0.424, 1, 72, 34, 46, STUB);
      field(0.458, -1, 62, 36, 50, WHEAT);

      groundPatch(K(0.532), 1, 15, [22, 0.15, 40], LIME);
      groundPatch(K(0.564), 1, 15, [20, 0.15, 36], LIME);
      ridgeAt(0.552, 1, 40, 0.95, 70, 16, 6.0, LIME);
      marshalPost(K(0.556), 1, 16);
      guardrail(0.500, 0.600, 1, 14, ARMCO);
      guardrail(0.500, 0.600, -1, 14, ARMCO);
      ridgeAt(0.522, 1, 46, 0.70, 52, 12, 4.4, LIME2);
      groundPatch(K(0.576), 1, 18, [16, 0.14, 58], LIME2);
      groundPatch(K(0.532), -1, 18, [18, 0.15, 74], GRAVEL);
      marshalPost(K(0.520), -1, 15);
      fenceRun(0.498, 0.604, 1, 26, 1.6, WOOD);
      bushAt(0.508, 1, 30, FOL_D);
      bushAt(0.566, 1, 28, FOL);
      treeAt(0.540, 1, 58, 9.0, FOL_L);
      treeAt(0.588, 1, 54, 7.6, FOL_D);
      field(0.556, 1, 46, 26, 34, WHEAT);

      tyreWall(0.632, 0.660, 1, 10, CAP);
      guardrail(0.612, 0.686, 1, 11, ARMCO);
      cameraTower(K(0.650), 1, 20, { h: 15, col: STEEL });
      marshalPost(K(0.666), 1, 14);
      tyreWall(0.664, 0.678, 1, 11, CAP);
      buildAt(0.638, 1, 26, 5, 3.2, 5,
        { kind: "hall", wall: STONE, window: GLASS, floor: 1 });
      groundPatch(K(0.648), 1, 16, [14, 0.14, 60], GRAVEL);
      fenceRun(0.610, 0.690, 1, 30, 1.6, WOOD);
      treeAt(0.626, 1, 50, 8.8, FOL_Y);
      treeAt(0.682, 1, 46, 9.6, FOL);
      bushAt(0.658, 1, 36, FOL_D);
      field(0.644, 1, 72, 38, 50, STUB);

      guardrail(0.684, 0.796, -1, 12, ARMCO);
      guardrail(0.838, 0.852, -1, 12, ARMCO);
      tyreWall(0.830, 0.862, -1, 14, CAP);
      sponsorHoarding(0.806, 0.886, -1, 18, { h: 1.7, step: 8 });
      {
        const side = -1;
        const a = anchor(K(0.830), side, 27);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.15);
        const b = [a.r, a.u, a.t];
        modelGroup("dijon-parabolique-bank", {
          center: vadd(foot, a.u, 4.5), size: [18, 14, 90], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (let row = 0; row < 6; row++) {
            const rise = 0.55 + row * 1.15;
            const back = 1.2 + row * 2.2;
            seat.box(stage, vadd(vadd(foot, a.r, side * back), a.u, rise),
              [1.4, 0.22, 78 - row * 4], SLOPE, b);
          }
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(vadd(foot, a.r, side * 0.4), a.u, 0.7),
            [0.35, 1.4, 80], STEEL, b);
          stage._mat = 0;
        }, { required: true });
      }
      fenceRun(0.806, 0.890, -1, 40, 1.8, WOOD);
      buildAt(0.850, -1, 66, 8, 4.0, 15,
        { kind: "hall", wall: STONE2, window: GLASS, floor: 1 });
      treeAt(0.704, -1, 56, 9.2, FOL);
      treeAt(0.752, -1, 60, 10.0, FOL_L);
      treeAt(0.874, -1, 54, 7.8, FOL_D);
      field(0.722, -1, 92, 44, 62, WHEAT);
      field(0.768, -1, 86, 38, 54, MEADOW);
      hedgeRun(0.700, 0.760, -1, 74, 1.8, HEDGE);
      marshalPost(K(0.730), -1, 20);
      marshalPost(K(0.850), -1, 20);

      marshalPost(K(0.760), 1, 24);
      billboard(K(0.740), 1, 26, 9, 3.0, STEEL);
      billboard(K(0.786), 1, 26, 9, 3.0, WALL);

      groundPatch(K(0.880), 1, 20, [34, 0.16, 110], GRAVEL);
      building(K(0.898), 1, 21, 10, 4.6, 9,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      fence(0.842, 0.920, 1, 34, 2.0, STEEL);
      buildAt(0.916, 1, 24, 7, 4.0, 8,
        { kind: "hall", wall: STONE, window: GLASS, floor: 1 });
      buildAt(0.868, 1, 27, 6, 3.4, 7,
        { kind: "hall", wall: STONE2, window: GLASS, floor: 1 });
      groundPatch(K(0.928), 1, 26, [12, 0.14, 46], ASPH);
      field(0.890, 1, 60, 36, 50, STUB);
      treeAt(0.852, 1, 52, 9.4, FOL);
      treeAt(0.926, 1, 48, 8.2, FOL_Y);

      grandstandEx(0.950, -1, 14, 88, null, null,
        { livery: "steel", endWalls: false });
      sponsorHoarding(0.900, 0.986, -1, 11, { h: 1.5, step: 8 });
      cameraTower(K(0.964), -1, 20, { h: 13, col: STEEL });
      marshalPost(K(0.994), -1, 13);
      field(0.944, -1, 40, 30, 58, GRAVEL);
      buildAt(0.930, -1, 38, 8, 4.0, 9,
        { kind: "hall", wall: STONE, window: GLASS, floor: 1 });
      buildAt(0.958, -1, 40, 9, 4.4, 10,
        { kind: "hall", wall: WALL, window: GLASS, floor: 1 });
      fenceRun(0.902, 0.990, -1, 50, 2.0, STEEL);
      hedgeRun(0.906, 0.984, -1, 62, 1.9, HEDGE2);

      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 11, ARMCO);
      for (let i = 0; i < 10; i++) marshalPost(Math.round((i / 10) * n), -1, 12);

      every(30, (k) => {
        const h = hash(k * 37);
        if (h < 0.50) return;
        const side = hash(k * 71) < 0.5 ? -1 : 1;
        const dist = 34 + hash(k * 13) * 54;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 10)) return;
        tree(k, side, dist, 6.8 + h * 5.2, FOLS[Math.floor(hash(k * 91) * 4) & 3]);
        if (h > 0.88) tree(k, side, dist + 8, 5.4 + h * 3.2, FOL_D);
        if (h > 0.92) tree(k, side, dist - 6, 6.0 + h * 2.4, FOL);
        if (h > 0.80) bush(k, side, dist - 7, FOL_D);
      });

      for (const [s0, s1, side, gap] of [
        [0.062, 0.100,  1, 58], [0.116, 0.158,  1, 74],
        [0.228, 0.248,  1, 66],
        [0.480, 0.498, -1, 54],
        [0.590, 0.612, -1, 68],
        [0.666, 0.710,  1, 58],
        [0.794, 0.844, -1, 64],
        [0.328, 0.348, -1, 80],
        [0.140, 0.190,  1, 96], [0.520, 0.568, -1, 58],
        [0.736, 0.782,  1, 64], [0.036, 0.082, -1, 90],
        [0.196, 0.246, -1, 100],
        [0.590, 0.606,  1, 78],
        [0.402, 0.420,  1, 66],
        [0.652, 0.698,  1,  48],
        [0.934, 0.980,  1,  62],
      ]) hedgeRun(s0, s1, side, gap, 1.7 + hash(Math.round(s0 * 1000)) * 0.6,
                  HEDGE2);

      for (const [s0, s1, side, gap] of [
        [0.048, 0.092,  1, 76], [0.172, 0.216, -1, 118],
        [0.264, 0.312,  1, 104],
        [0.436, 0.480,  1, 112],
        [0.500, 0.546, -1, 86], [0.576, 0.622,  1, 104],
        [0.640, 0.686, -1, 122], [0.788, 0.832,  1, 92],
        [0.842, 0.886, -1, 98], [0.108, 0.150,  1, 124],
        [0.386, 0.428, -1, 134], [0.728, 0.772,  1, 116],
        [0.876, 0.918,  1, 108],
      ]) {
        const h = 1.6 + hash(Math.round(s1 * 1000)) * 0.5;
        fenceRun(s0, s1, side, gap, h * 0.9, WOOD);
      }

      for (const [s, side, gap, w, d, c] of [
        [0.058,  1,  86, 40, 56, WHEAT], [0.092,  1, 110, 44, 58, STUB],
        [0.130,  1,  92, 38, 52, PLOUGH], [0.188,  1,  78, 36, 50, MEADOW],
        [0.246,  1, 102, 42, 58, WHEAT], [0.292, -1, 108, 44, 60, STUB],
        [0.318,  1,  96, 40, 54, MEADOW],
        [0.586, -1,  92, 40, 56, PLOUGH], [0.620,  1,  88, 38, 52, WHEAT],
        [0.672, -1, 106, 44, 60, MEADOW], [0.714,  1,  94, 40, 54, STUB],
        [0.798, -1,  96, 42, 58, WHEAT], [0.824,  1, 100, 40, 54, PLOUGH],
        [0.866, -1,  88, 38, 52, MEADOW], [0.940,  1,  94, 42, 56, STUB],
        [0.014, -1,  96, 40, 54, PLOUGH], [0.416, -1,  90, 40, 54, MEADOW],
      ]) field(s, side, gap, w, d, c);

      for (const [s, side, gap, rows, len] of [
        [0.086,  1,  68, 5, 44], [0.268,  1,  76, 6, 50],
        [0.494,  1,  60, 5, 46], [0.606, -1,  72, 6, 48],
        [0.744,  1,  78, 5, 44], [0.836, -1,  70, 6, 50],
        [0.156,  1, 110, 5, 42], [0.680, -1,  90, 5, 46],
      ]) vineyard(s, side, gap, rows, len, 7);

      for (const [s, side, dist, seed] of [
        [0.122,  1,  96,  3], [0.284, -1, 128, 11], [0.478,  1,  92, 19],
        [0.694,  1, 112, 31], [0.816, -1, 108, 37], [0.038,  1, 118, 47],
      ]) farmstead(s, side, dist, seed);
 
 

      for (const [s, side, dist, w, h, d, c] of [
        [0.148,  1,  84,  8, 4.2, 16, STONE],
        [0.302, -1,  96,  7, 3.8, 14, STONE2],
        [0.452,  1,  76,  9, 4.4, 15, FARM2],
        [0.574, -1, 102,  7, 4.0, 13, STONE],
        [0.762, -1, 118,  8, 4.2, 17, STONE2],
        [0.848,  1,  96,  7, 3.6, 12, FARM2],
      ]) buildAt(s, side, dist, w, h, d, { kind: "hall", wall: c, window: GLASS });

      for (const [s, side, gap, w, d] of [
        [0.144, -1,  78, 42, 56], [0.330,  1,  86, 38, 50],
        [0.520, -1, 118, 44, 58], [0.658,  1,  92, 40, 54],
        [0.882, -1, 112, 42, 56],
      ]) field(s, side, gap, w, d, RAPE);

      poplarRow(0.212, -1, 132, 5, 0.004);
      poplarRow(0.606,  1, 118, 5, 0.004);
      poplarRow(0.918, -1, 108, 4, 0.004);
      for (const [s, side, dist, seed] of [
        [0.096,  1,  70,  5], [0.278, -1,  84, 13], [0.502,  1,  88, 21],
        [0.688, -1,  92, 27], [0.780,  1,  72, 33], [0.854, -1,  86, 39],
      ]) {
        const h = hash(seed);
        treeAt(s, side, dist, 8.6 + h * 3.4, FOLS[Math.floor(h * 4) & 3]);
        treeAt(s + 0.004, side, dist + 7, 6.8 + h * 2.6, FOL_D);
        bushAt(s + 0.002, side, dist - 6, FOL_D);
      }

      outcrop(0.264, -1,  86, 0.80, 56, 13, 4.6, LIME2);
      outcrop(0.472,  1,  70, 1.20, 48, 12, 4.0, LIME);
      outcrop(0.700,  1,  74, 0.40, 52, 12, 4.2, LIME2);
 
      const farHill = (frac, side, dist, w, h, dy) => {
        const a = anchor(K(frac), side, dist).c;
        const y = terrainYAt(a[0], a[2]);
        mountain(a[0], a[2], (y === null ? a[1] : y) + dy, w, h,
          { rough: 0.24, snowline: 2, forest: [0.24, 0.33, 0.19] });
      };
      farHill(0.12, 1, 1116, 1804, 84, -37);
      farHill(0.34, -1, 1209, 1640, 69, -32);
      farHill(0.58, 1, 1302, 1967, 92, -40);
      farHill(0.8, -1, 1085, 1517, 63, -30);
      farHill(0.95, 1, 1178, 1722, 75, -35);
  };
