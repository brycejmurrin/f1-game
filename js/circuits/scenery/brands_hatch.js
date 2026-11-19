"use strict";
(window.TrackScenery = window.TrackScenery || {})["brands_hatch"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, out, terrainYAt, mountain,
        tree, pine, bush, hedge, forestEdge, conifer, broadleafFall,
        building, house, motorhome, tower, spectatorHill,
        terrace, bleacher, modelGroup, vadd, MAT, indexSolid,
        guardrail, fence, wall, tyreWall, marshalPost, cameraTower,
        broadcastCompound,
        billboard, signBoard, sponsorHoarding, gantry,
        place, groundPatch, ridge, addBox, bakedModel } = api;

      const { K } = api;
      const ID = (f) => f;

      const OAK   = [0.17, 0.34, 0.15];
      const OAK_D = [0.12, 0.25, 0.11];
      const OAK_L = [0.25, 0.43, 0.19];
      const CONIF = [0.11, 0.25, 0.16];
      const SCRUB = [0.20, 0.32, 0.16];
      const CHALK = [0.86, 0.85, 0.79];
      const RENDER= [0.78, 0.77, 0.73];
      const BRICK = [0.52, 0.40, 0.34];
      const STEEL = [0.72, 0.74, 0.77];
      const DKGREY= [0.30, 0.32, 0.35];
      const ARMCO = [0.78, 0.78, 0.80];
      const ROOF  = [0.33, 0.35, 0.38];
      const GRAVEL= [0.60, 0.56, 0.47];
      const CHALKY= [0.80, 0.79, 0.71];
      const TYRE  = [0.86, 0.22, 0.18];
      const ASPH  = [0.26, 0.26, 0.28];
      const WORN  = [0.44, 0.44, 0.33];
      const LITTER= [0.34, 0.28, 0.19];
      const TENT  = [0.90, 0.90, 0.87];
      const CAR_COLS = [
        [0.60, 0.62, 0.66], [0.22, 0.24, 0.28], [0.58, 0.16, 0.14],
        [0.84, 0.85, 0.87], [0.17, 0.27, 0.42], [0.40, 0.42, 0.38],
        [0.66, 0.62, 0.48], [0.14, 0.14, 0.15],
      ];

      const WOODS_A = 0.378, WOODS_B = 0.845;
      const inWoods = (s) => s >= WOODS_A && s <= WOODS_B;
      const WOOD_POSTS = [[0.430, 1], [0.458, -1], [0.523, -1], [0.630, -1], [0.756, 1]];


      function clear(k, side, d, r) {
        const a = anchor(k, side, d);
        return !onTrack(a.c[0], a.c[2], r || 10);
      }

      function carPark(key, s0, s1, side, d0, rows, step, seed) {
        for (let s = s0; s < s1; s += step / n) {
          const k = K(key(s));
          for (let r = 0; r < rows; r++) {
            const h = hash(k * (seed + r * 13) + r * 5);
            if (h < 0.26) continue;
            const d = d0 + r * 7.2;
            if (!clear(k, side, d, 11)) continue;
            const a = anchor(k, side, d);
            const gy = terrainYAt(a.c[0], a.c[2]);
            if (gy != null && Math.abs(a.c[1] - gy) > 0.28) continue;
            place(k, side, d, [1.85, 1.45, 4.3],
              CAR_COLS[(k + r * 3) % CAR_COLS.length]);
          }
        }
      }

      function treeBelt(key, s0, s1, side, d0, depth, step, seed, hMin) {
        for (let s = s0; s < s1; s += step / n) {
          const k = K(key(s));
          const h = hash(k * seed + 3);
          if (h < 0.28) continue;
          const d = d0 + h * depth;
          if (!clear(k, side, d, 11)) continue;
          const ht = hMin + h * 6;
          if (h < 0.40) conifer(k, side, d, ht + 3, CONIF);
          else if (h < 0.72) tree(k, side, d, ht, h < 0.55 ? OAK : OAK_L);
          else broadleafFall(k, side, d, ht, OAK_D);
          if (h > 0.70) {
            const d2 = d + 15 + h * 11;
            if (clear(k, side, d2, 11)) tree(k, side, d2, ht - 1, OAK_D);
          }
        }
      }


      spectatorHill(0.008, 0.026, -1, 10, { rows: 4, density: 0.45, step: 10 });
      spectatorHill(0.096, 0.108, -1, 14, { rows: 4, density: 0.4, step: 11 });
      spectatorHill(0.210, 0.222, -1, 16, { rows: 4, density: 0.4, step: 11 });
      spectatorHill(0.300, 0.395, -1, 20, {});
      spectatorHill(0.826, 0.888, -1, 20, {});
      spectatorHill(0.892, 0.948, -1, 16, { rows: 5, density: 0.42, step: 9 });

      terrace(0.054, 0.069, -1, 16, { rows: 7, rise: 0.9 });
      terrace(0.085, 0.095, -1, 16, { rows: 7, rise: 0.9 });
      bleacher(0.836, 0.868, -1, 21, { rows: 6, rise: 0.55, setback: 1.05, lift: 0.35 });

      for (const [s, d, w, l] of [
        [0.044, 17, 11, 13],
        [0.072, 15, 15, 17], [0.066, 24, 12, 14], [0.084, 20, 10, 12],
        [0.195, 15, 15, 17], [0.186, 23, 11, 13], [0.206, 19, 9, 11],
        [0.360, 15, 15, 17], [0.330, 22, 12, 16], [0.852, 15, 15, 17],
        [0.866, 22, 10, 13], [0.920, 15, 15, 17], [0.906, 24, 11, 14],
        [0.936, 20, 9, 12],
      ]) {
        groundPatch(K(s), -1, d, [w, 0.28, l], CHALKY);
      }
      for (const [s, d] of [[0.038, 30], [0.078, 32], [0.196, 32],
        [0.852, 33], [0.918, 31]]) {
        groundPatch(K(s), -1, d, [6, 0.22, 26], WORN);
      }

      for (const [s, d] of [
        [0.066, 34], [0.074, 34], [0.082, 35], [0.090, 36],
        [0.180, 33], [0.190, 33], [0.200, 34],
        [0.850, 35], [0.858, 35], [0.866, 44], [0.876, 35],
        [0.900, 34], [0.910, 34], [0.922, 35], [0.934, 36],
        [0.310, 44], [0.340, 37], [0.368, 36],
      ]) {
        const k = K(s);
        if (!clear(k, -1, d, 10)) continue;
        const h = hash(k * 101);
        house(k, -1, d, 7 + h * 3, 3.2 + h * 1.1, 5 + h * 3, {});
      }
      for (const [s, d, sz, col] of [
        [0.070, 41, [3.0, 3.2, 7.5], CHALK],
        [0.204, 41, [2.4, 2.8, 6.0], RENDER],
        [0.852, 42, [3.0, 3.2, 7.5], STEEL], [0.868, 41, [2.6, 3.0, 6.5], CHALK],
        [0.906, 40, [3.0, 3.2, 7.5], CHALK], [0.930, 42, [2.4, 2.8, 6.0], RENDER],
        [0.326, 43, [2.6, 3.0, 6.5], STEEL],
        [0.076, 46, [2.0, 2.6, 5.0], DKGREY], [0.192, 46, [2.0, 2.6, 5.0], DKGREY],
        [0.862, 47, [2.0, 2.6, 5.0], DKGREY], [0.916, 46, [2.0, 2.6, 5.0], DKGREY],
        [0.058, 44, [8.0, 3.4, 8.0], TENT], [0.198, 45, [8.0, 3.4, 8.0], TENT],
        [0.872, 46, [8.0, 3.4, 8.0], TENT], [0.926, 44, [8.0, 3.4, 8.0], TENT],
      ]) {
        const k = K(s);
        if (clear(k, -1, d, 10)) place(k, -1, d, sz, col);
      }
      for (const s of [0.024, 0.040, 0.056, 0.068, 0.080, 0.092,
        0.176, 0.192, 0.210, 0.318, 0.348, 0.372,
        0.850, 0.862, 0.874, 0.886, 0.904, 0.926, 0.944]) {
        const k = K(s);
        if (clear(k, -1, 28, 10)) place(k, -1, 28, [0.3, 9.0, 0.3], CHALK);
      }
      if (clear(K(0.080), -1, 38, 10)) signBoard(K(0.080), -1, 38, 9, 5, DKGREY);
      if (clear(K(0.928), -1, 38, 10)) signBoard(K(0.928), -1, 38, 9, 5, DKGREY);

      carPark(ID, 0.056, 0.140, -1, 78, 5, 2, 11);
      carPark(ID, 0.176, 0.268, -1, 76, 4, 2, 17);
      carPark(ID, 0.300, 0.372, -1, 82, 4, 3, 19);
      carPark(ID, 0.850, 0.944, -1, 82, 5, 2, 23);

      treeBelt(ID, 0.050, 0.150, -1, 128, 44, 4, 31, 9);
      treeBelt(ID, 0.170, 0.300, -1, 122, 48, 4, 37, 9);
      treeBelt(ID, 0.306, 0.376, -1, 130, 46, 4, 41, 10);
      treeBelt(ID, 0.830, 0.950, -1, 126, 46, 4, 43, 9);

      every(30, (k) => {
        const s = k / n;
        if (inWoods(s)) return;
        const h = hash(k * 37);
        if (h < 0.40) return;
        for (const side of [-1, 1]) {
          const dist = 46 + h * 26 + (side > 0 ? 10 : 0);
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 9)) continue;
          tree(k, side, dist, 8 + h * 5, h < 0.6 ? OAK : OAK_L);
          if (h > 0.80 && clear(k, side, dist + 12, 9)) {
            tree(k, side, dist + 12, 7 + h * 4, OAK_D);
          }
        }
      });

      hedge(0.104, 0.166, -1, 44, 2.2, OAK_D);
      hedge(0.222, 0.281, -1, 46, 2.2, OAK_D);
      hedge(0.894, 0.952, -1, 42, 2.0, OAK_D);
      wall(0.056, 0.146, -1, 70, 1.3, RENDER);
      wall(0.176, 0.272, -1, 68, 1.3, RENDER);
      wall(0.850, 0.948, -1, 74, 1.3, RENDER);


      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (f) => (f + SL) % 1;

      const SEAT_COLS = [
        [0.78, 0.16, 0.14], [0.88, 0.88, 0.86], [0.22, 0.24, 0.28],
      ];
      function emitOpenStand(stage, a, side, opts) {
        const depth = opts.depth || 11;
        const h = opts.h || 12;
        const len = opts.len || 40;
        const tiers = opts.tiers || 4;
        const shell = opts.shell || CHALK;
        const roof = opts.roof;
        const b = [a.r, a.u, a.t];
        const gy = terrainYAt(a.c[0], a.c[2]);
        const dy = gy != null ? (gy - a.c[1]) : 0;
        stage._mat = MAT.CONCRETE;
        addBox(stage, vadd(vadd(a.c, a.r, side * (depth * 0.48)), a.u, dy + h * 0.40),
          [depth * 0.28, h * 0.80, len], shell, b);
        for (let t = 0; t < tiers; t++) {
          const lat = -side * (depth * 0.34 - t * 1.55);
          const yh = 1.65 + t * 2.35;
          const yOff = t * 0.14;
          addBox(stage, vadd(vadd(a.c, a.r, lat), a.u, dy + yh * 0.5 - 0.12 + yOff),
            [1.45, yh + 0.2, len - t * 2.4],
            t & 1 ? RENDER : shell, b);
          stage._mat = MAT.FABRIC;
          addBox(stage, vadd(vadd(a.c, a.r, lat + side * 0.18), a.u, dy + yh + 0.55 + yOff),
            [1.05, 0.65, len - t * 2.4 - 2.5], SEAT_COLS[t % 3], b);
          stage._mat = MAT.CONCRETE;
        }
        if (roof) {
          stage._mat = MAT.METAL;
          const top = dy + h * 0.80 + 0.35;
          addBox(stage, vadd(vadd(a.c, a.r, -side * 0.6), a.u, top),
            [depth + 0.8, 0.85, len * 0.52], ROOF, b);
          addBox(stage, vadd(vadd(a.c, a.r, -side * depth * 0.46), a.u, top - 0.7),
            [0.32, 1.1, len * 0.48], DKGREY, b);
        }
        stage._mat = 0;
      }

      {
        const depth = 12, h = 13, len = 72;
        const a0 = anchor(K(sl(0.978)), -1, 18 + depth / 2);
        modelGroup("brands-pit-straight-stand", {
          center: vadd(a0.c, a0.u, (h + 1) / 2),
          size: [depth + 4, h + 2, len + 4],
          basis: [a0.r, a0.u, a0.t],
        }, (stage) => {
          emitOpenStand(stage, a0, -1, { depth, h, len, tiers: 5, shell: RENDER });
          if (typeof indexSolid === "function")
            indexSolid(sl(0.960), sl(0.995), -1, 16, 14);
        }, { required: true });
      }
      {
        const depth = 11, h = 11, len = 48;
        const a0 = anchor(K(sl(0.998)), -1, 16 + depth / 2);
        modelGroup("brands-desire-wilson-stand", {
          center: vadd(a0.c, a0.u, (h + 1) / 2),
          size: [depth + 4, h + 2, len + 4],
          basis: [a0.r, a0.u, a0.t],
        }, (stage) => {
          emitOpenStand(stage, a0, -1,
            { depth, h, len, tiers: 4, shell: CHALK, roof: true });
          if (typeof indexSolid === "function")
            indexSolid(sl(0.988), sl(0.012), -1, 14, 12);
        }, { required: true });
      }
      {
        const depth = 13, h = 14, len = 56;
        const a0 = anchor(K(sl(0.016)), -1, 12 + depth / 2);
        modelGroup("brands-paddock-hill-stand", {
          center: vadd(a0.c, a0.u, (h + 1) / 2),
          size: [depth + 4, h + 2, len + 4],
          basis: [a0.r, a0.u, a0.t],
        }, (stage) => {
          emitOpenStand(stage, a0, -1, { depth, h, len, tiers: 5, shell: STEEL });
          if (typeof indexSolid === "function")
            indexSolid(sl(0.004), sl(0.030), -1, 10, 14);
        }, { required: true });
      }
      {
        const depth = 10, h = 10, len = 44;
        const a0 = anchor(K(sl(0.038)), -1, 14 + depth / 2);
        modelGroup("brands-hailwoods-stand", {
          center: vadd(a0.c, a0.u, (h + 1) / 2),
          size: [depth + 4, h + 2, len + 4],
          basis: [a0.r, a0.u, a0.t],
        }, (stage) => {
          emitOpenStand(stage, a0, -1, { depth, h, len, tiers: 4, shell: RENDER });
          if (typeof indexSolid === "function")
            indexSolid(sl(0.028), sl(0.050), -1, 12, 12);
        }, { required: true });
      }

      for (let s = 0.960; s < 1.026; s += 0.0075) {
        const k = K(sl(s));
        const h = hash(k * 53);
        building(k, -1, 34, 11, 5.0 + h * 1.6, 13, {});
      }
      building(K(sl(0.972)), -1, 50, 22, 9, 18, {});
      building(K(sl(0.006)), -1, 49, 18, 8, 16, {});

      for (let s = 0.958; s < 1.024; s += 0.0090) {
        const k = K(sl(s));
        if (!clear(k, -1, 62, 11)) continue;
        const h = hash(k * 59);
        building(k, -1, 62, 9 + h * 4, 4.0 + h * 2.0, 11 + h * 4, {});
      }
      for (const [s, d, w, ht, dp] of [
        [0.978, 76, 8, 3.6, 6], [0.984, 76, 8, 3.6, 6], [0.990, 76, 8, 3.6, 6],
        [0.996, 76, 8, 3.6, 6], [1.002, 76, 8, 3.6, 6],
      ]) {
        const k = K(sl(s));
        if (clear(k, -1, d, 11)) house(k, -1, d, w, ht, dp, {});
      }
      building(K(sl(0.966)), -1, 78, 16, 6.5, 14, {});
      building(K(sl(1.014)), -1, 78, 14, 6.0, 13, {});
      for (let s = 0.962; s < 1.022; s += 0.0070) {
        const k = K(sl(s));
        if (!clear(k, -1, 92, 11)) continue;
        const h = hash(k * 67);
        if (h < 0.35) continue;
        const a = anchor(k, -1, 92);
        const gy = terrainYAt(a.c[0], a.c[2]);
        if (gy != null && a.c[1] < gy - 0.15) continue;
        motorhome(k, -1, 92, 4.5 + h * 1.5, 3.6, 12 + h * 4, {});
      }
      for (let s = 0.958; s < 1.028; s += 0.0100) {
        const k = K(sl(s));
        groundPatch(k, -1, 26, [11, 0.22, 22], ASPH);
      }
      for (let s = 0.960; s < 1.024; s += 0.0140) {
        const k = K(sl(s));
        if (clear(k, -1, 70, 11)) groundPatch(k, -1, 70, [7, 0.22, 30], ASPH);
      }

      carPark(sl, 0.952, 1.032, -1, 108, 4, 2, 71);
      for (let s = 0.964; s < 1.020; s += 0.0090) {
        const k = K(sl(s));
        if (!clear(k, -1, 152, 12)) continue;
        const h = hash(k * 73);
        if (h < 0.40) continue;
        place(k, -1, 152, [2.7, 3.4, 11.5], h > 0.66 ? CHALK : STEEL);
      }
      treeBelt(sl, 0.946, 1.038, -1, 168, 44, 4, 79, 10);

      building(K(sl(0.026)), -1, 26, 16, 5.5, 12, {});
      building(K(sl(0.036)), -1, 16, 12, 4.5, 10, {});
      groundPatch(K(sl(0.030)), -1, 22, [14, 0.24, 20], WORN);
      groundPatch(K(sl(0.042)), -1, 20, [10, 0.24, 16], ASPH);
      signBoard(K(sl(0.022)), -1, 30, 10, 6, DKGREY);
      signBoard(K(sl(0.052)), -1, 28, 8, 5, DKGREY);
      for (const [s, d] of [[0.020, 35], [0.032, 32], [0.046, 31], [0.058, 33]]) {
        const k = K(sl(s));
        if (clear(k, -1, d, 10)) house(k, -1, d, 7, 3.2, 6, {});
      }

      for (const s of [0.020, 0.034, 0.048, 0.190, 0.900, 0.930]) {
        place(K(sl(s)), -1, 24, [3.0, 3.0, 3.0], CHALK);
      }


      for (let s = 0.938; s < 1.032; s += 0.0068) {
        building(K(sl(s)), 1, 14, 9, 6.5, 15, {});
      }
      for (let s = 0.944; s < 1.026; s += 0.014) {
        building(K(sl(s)), 1, 27, 14, 8.5, 12, {});
      }

      building(K(sl(0.960)), 1, 25, 20, 12, 17, {});
      tower(K(sl(0.966)), 1, 25, 5.5, 17, {});
      gantry(sl(0.0), 7.2, STEEL);
      gantry(sl(0.972), 6.8, DKGREY);
      if (clear(K(sl(0.950)), 1, 40, 10)) {
        building(K(sl(0.950)), 1, 40, 15, 6.0, 13, {});
      }

      {
        const a = anchor(K(sl(0.018)), 1, 50);
        const b = [a.r, a.u, a.t];
        const gy = terrainYAt(a.c[0], a.c[2]);
        const dy = gy != null ? (gy - a.c[1]) : 0;
        modelGroup("brands-kentagon", {
          center: vadd(a.c, a.u, dy + 6.0),
          size: [22, 16, 22],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, dy + 4.0), [18, 8.0, 18], CHALK, b);
          stage._mat = MAT.BRICK;
          addBox(stage, vadd(vadd(a.c, a.r, 2.0), a.u, dy + 4.2),
            [14.2, 7.2, 14], BRICK, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, dy + 8.6), [19.5, 0.7, 19.5], ROOF, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, dy + 11.2), [5.5, 4.5, 5.5],
            [0.55, 0.62, 0.70], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, dy + 13.8), [6.2, 0.45, 6.2], DKGREY, b);
          stage._mat = 0;
        }, { required: true });
      }
      building(K(0.024), 1, 22, 13, 5.0, 12, {});
      groundPatch(K(sl(0.016)), 1, 33, [14, 0.24, 18], ASPH);
      if (clear(K(sl(0.008)), 1, 34, 10)) {
        const kKent = K(sl(0.008));
        const aKent = anchor(kKent, 1, 34);
        const gyKent = terrainYAt(aKent.c[0], aKent.c[2]);
        if (gyKent == null || aKent.c[1] >= gyKent - 0.15) {
          house(kKent, 1, 34, 8, 3.4, 7, {});
        }
      }

      for (let s = 0.030; s < 0.072; s += 0.0075) {
        const k = K(s);
        const h = hash(k * 61);
        place(k, 1, 30 + h * 2.5, [3.6, 4.1, 15], h > 0.5 ? CHALK : STEEL);
        place(k, 1, 33.4 + h * 2.5, [2.6, 3.0, 7], DKGREY);
        if (h > 0.45) building(k, 1, 48, 12, 5.5, 11, {});
        place(k, 1, 42, [9, 3.4, 7], h > 0.5 ? RENDER : CHALK);
      }
      for (let s = 0.028; s < 0.074; s += 0.0060) {
        const k = K(s);
        const h = hash(k * 89);
        if (h > 0.34 && clear(k, 1, 56, 10)) {
          const a = anchor(k, 1, 56);
          const gy = terrainYAt(a.c[0], a.c[2]);
          if (gy == null || a.c[1] >= gy - 0.2) {
            motorhome(k, 1, 56, 4.6 + h * 1.4, 3.8, 13 + h * 4, {});
          }
        }
        if (h < 0.42 && clear(k, 1, 66, 10)) {
          house(k, 1, 66, 9, 4.0, 8, {});
        }
      }
      for (let s = 0.030; s < 0.072; s += 0.0110) {
        const k = K(s);
        if (clear(k, 1, 46, 10)) groundPatch(k, 1, 46, [16, 0.22, 20], ASPH);
      }
      carPark(ID, 0.034, 0.068, 1, 74, 3, 2, 83);
      broadcastCompound(K(0.050), 1, 58, {});

      for (let s = 0.215; s < 0.312; s += 0.0090) {
        const k = K(s);
        const h = hash(k * 71);
        building(k, 1, 12 + h * 3, 10, 5.5 + h * 3.5, 13, {});
      }
      building(K(0.246), 1, 28, 18, 9, 16, {});
      building(K(0.284), 1, 29, 16, 8, 15, {});
      for (let s = 0.220; s < 0.308; s += 0.0110) {
        const k = K(s);
        if (!clear(k, 1, 44, 10)) continue;
        const h = hash(k * 79);
        if (!clear(k, 1, 44 + 10 + h * 4, 24)) continue;
        building(k, 1, 44, 10 + h * 4, 4.5 + h * 2.2, 12, {});
      }
      for (let s = 0.224; s < 0.304; s += 0.0090) {
        const k = K(s);
        const h = hash(k * 103);
        if (h < 0.45) continue;
        if (clear(k, 1, 58, 10)) tree(k, 1, 58, 8 + h * 5, h < 0.7 ? OAK : OAK_L);
      }
      if (clear(K(0.264), 1, 70, 12)) {
        groundPatch(K(0.264), 1, 70, [26, 0.24, 26], ASPH);
        place(K(0.264), 1, 84, [0.3, 7.0, 0.3], CHALK);
      }
      building(K(0.905), 1, 30, 15, 6.5, 14, {});
      building(K(0.930), 1, 34, 13, 6.0, 12, {});
      if (clear(K(0.918), 1, 46, 10)) {
        groundPatch(K(0.918), 1, 46, [14, 0.22, 22], ASPH);
      }


      function footbridge(s, deckCol) {
        const k = K(s);
        const L = anchor(k, -1, 7), R = anchor(k, 1, 7);
        const span = Math.hypot(R.c[0] - L.c[0], R.c[1] - L.c[1], R.c[2] - L.c[2]);
        const topY = Math.max(L.c[1], R.c[1]) + 6.6;
        const mid = [(L.c[0] + R.c[0]) / 2, topY, (L.c[2] + R.c[2]) / 2];
        addBox(out, mid, [span, 0.55, 2.8], deckCol, [L.r, L.u, L.t]);
        const t = L.t;
        for (const o of [-1.45, 1.45]) {
          addBox(out, [mid[0] + t[0] * o, mid[1] + 0.95, mid[2] + t[2] * o],
            [span, 1.3, 0.14], STEEL, [L.r, L.u, L.t]);
        }
        for (const e of [L, R]) {
          const h = Math.max(2, topY - e.c[1]);
          addBox(out, [e.c[0], e.c[1] + h / 2, e.c[2]], [1.7, h, 3.4], STEEL, [e.r, e.u, e.t]);
        }
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 15);
          const h = Math.max(2.5, topY - a.c[1]);
          addBox(out, [a.c[0], a.c[1] + h / 2, a.c[2]], [3.0, h, 3.2], deckCol, [a.r, a.u, a.t]);
          addBox(out, [a.c[0], a.c[1] + h + 0.3, a.c[2]], [3.4, 0.5, 3.6], ROOF, [a.r, a.u, a.t]);
        }
      }

      footbridge(0.070, RENDER);
      footbridge(0.430, DKGREY);


      for (const side of [-1, 1]) {
        forestEdge(0.382, 0.426, side, 13, {});
        forestEdge(0.434, WOODS_B, side, 13, {});
      }

      every(13, (k) => {
        const s = k / n;
        if (!inWoods(s)) return;
        const h = hash(k * 29);
        const deep = s > 0.58 && s < 0.72;
        const thin = s > 0.745 ? (s - 0.745) / 0.100 : 0;
        for (const side of [-1, 1]) {
          if (h > 0.90 - thin * 0.45) continue;
          const near = 16 + h * 8;
          const a = anchor(k, side, near);
          if (!onTrack(a.c[0], a.c[2], 8)) {
            const col = h < 0.24 ? CONIF : (h < 0.62 ? OAK : OAK_L);
            if (h < 0.24) pine(k, side, near, 12 + h * 9, col);
            else tree(k, side, near, 9 + h * 7, col);
          }
          const far = 34 + h * 22 + (deep ? 8 : 0);
          const b = anchor(k, side, far);
          if (!onTrack(b.c[0], b.c[2], 8)) {
            tree(k, side, far, 10 + hash(k * 17 + side) * 8,
              hash(k * 13) < 0.5 ? OAK_D : OAK);
          }
          if (deep && h > 0.55 && clear(k, side, far + 20, 8)) {
            tree(k, side, far + 20, 11 + h * 6, OAK_D);
          }
        }
      });

      every(14, (k) => {
        const s = k / n;
        if (!inWoods(s)) return;
        const h = hash(k * 107);
        if (h < 0.36) return;
        const thin = s > 0.760 ? (s - 0.760) / 0.085 : 0;
        for (const side of [-1, 1]) {
          const d = 56 + h * 48 + (s > 0.58 && s < 0.72 ? 14 : 0);
          if (h > 0.92 - thin * 0.50) continue;
          if (!clear(k, side, d, 24)) continue;
          if (h < 0.44) conifer(k, side, d, 13 + h * 8, CONIF);
          else if (h < 0.74) broadleafFall(k, side, d, 11 + h * 8, OAK_D);
          else tree(k, side, d, 12 + h * 7, OAK);
        }
      });

      every(9, (k) => {
        const s = k / n;
        if (!inWoods(s)) return;
        const h = hash(k * 43);
        if (h < 0.42) return;
        const side = h < 0.71 ? -1 : 1;
        if (WOOD_POSTS.some(([ps, pside]) => pside === side && Math.abs(s - ps) < 0.004)) return;
        bush(k, side, 12 + h * 5, h < 0.6 ? SCRUB : OAK_D);
      });
      every(8, (k) => {
        const s = k / n;
        if (!inWoods(s)) return;
        const h = hash(k * 127);
        if (h < 0.58) return;
        const side = h < 0.79 ? 1 : -1;
        if (clear(k, side, 26 + h * 14, 9)) bush(k, side, 26 + h * 14, SCRUB);
      });
      for (const [s, side, d, w, l] of [
        [0.396, -1, 19, 12, 26], [0.412, 1, 20, 11, 24], [0.446, -1, 21, 12, 28],
        [0.488, 1, 19, 10, 22], [0.512, -1, 20, 12, 26], [0.566, 1, 21, 11, 24],
        [0.596, -1, 19, 12, 28], [0.622, 1, 22, 12, 26], [0.664, -1, 20, 11, 24],
        [0.698, 1, 19, 12, 26], [0.732, -1, 21, 11, 24], [0.772, 1, 20, 12, 26],
        [0.802, -1, 19, 11, 22], [0.828, 1, 21, 12, 24],
      ]) {
        const k = K(s);
        if (clear(k, side, d, 9)) groundPatch(k, side, d, [w, 0.22, l], LITTER);
      }
      for (const [s, side, d] of [
        [0.404, 1, 24], [0.452, -1, 25], [0.506, 1, 24], [0.580, -1, 26],
        [0.618, 1, 25], [0.676, -1, 24], [0.716, 1, 26], [0.788, -1, 25],
        [0.818, 1, 24], [0.838, -1, 26],
      ]) {
        const k = K(s);
        if (clear(k, side, d, 9)) place(k, side, d, [1.1, 1.1, 6.5], OAK_D);
      }

      every(11, (k) => {
        const s = k / n;
        if (s < 0.446 || s > 0.492) return;
        const h = hash(k * 83);
        const a = anchor(k, 1, 14 + h * 4);
        if (onTrack(a.c[0], a.c[2], 7)) return;
        tree(k, 1, 14 + h * 4, 11 + h * 6, h < 0.5 ? OAK : OAK_D);
      });

      every(10, (k) => {
        const s = k / n;
        if (s < 0.608 || s > 0.668) return;
        const h = hash(k * 97);
        for (const side of [-1, 1]) {
          const d = 15 + h * 5;
          const a = anchor(k, side, d);
          if (onTrack(a.c[0], a.c[2], 7)) continue;
          tree(k, side, d, 13 + h * 7, h < 0.45 ? OAK_D : OAK);
        }
      });

      groundPatch(K(0.534), -1, 20, [22, 0.3, 30], GRAVEL);
      groundPatch(K(0.545), -1, 18, [18, 0.3, 22], GRAVEL);
      marshalPost(K(0.523), -1, 13);
      groundPatch(K(0.468), 1, 17, [20, 0.3, 26], GRAVEL);
      groundPatch(K(0.646), 1, 17, [18, 0.3, 22], GRAVEL);
      groundPatch(K(0.386), -1, 18, [18, 0.3, 24], GRAVEL);
      groundPatch(K(0.772), -1, 18, [16, 0.3, 22], GRAVEL);


      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 11, ARMCO);

      fence(WOODS_A, WOODS_B, -1, 12.4, 4.2, DKGREY);
      fence(WOODS_A, WOODS_B,  1, 12.4, 4.2, DKGREY);
      fence(0.950, 1.060, -1, 12.0, 3.6, DKGREY);
      fence(0.060, 0.230, -1, 12.0, 3.6, DKGREY);
      fence(0.300, 0.380, -1, 12.0, 3.6, DKGREY);
      fence(0.826, 0.950, -1, 12.0, 3.6, DKGREY);
      fence(0.950, 1.045, 1, 11.5, 2.6, STEEL);

      tyreWall(0.010, 0.040, -1, 12.5, TYRE);
      tyreWall(0.068, 0.090, -1, 12.5, TYRE);
      tyreWall(0.184, 0.206, -1, 12.5, TYRE);
      tyreWall(0.372, 0.392, -1, 12.5, TYRE);
      tyreWall(0.455, 0.478, 1, 12.5, TYRE);
      tyreWall(0.526, 0.548, -1, 12.5, TYRE);
      tyreWall(0.628, 0.650, 1, 12.5, TYRE);
      tyreWall(0.826, 0.856, -1, 12.5, TYRE);
      tyreWall(0.906, 0.930, -1, 12.5, TYRE);

      for (const [s, side] of [[0.010, 1], [0.072, 1], [0.186, 1], [0.260, -1],
        [0.374, 1], [0.430, 1], [0.458, -1], [0.630, -1], [0.756, 1],
        [0.828, 1], [0.910, 1], [0.962, -1]]) {
        marshalPost(K(s), side, 13);
      }

      for (const [s, side] of [[0.014, -1], [0.076, -1], [0.190, -1],
        [0.378, -1], [0.532, 1], [0.636, -1], [0.832, -1], [0.914, -1]]) {
        cameraTower(K(s), side, 17, {});
      }

      sponsorHoarding(0.955, 1.045, -1, 11.8, {});
      sponsorHoarding(0.955, 1.045,  1, 11.9, {});
      sponsorHoarding(0.062, 0.108, -1, 11.6, {});
      sponsorHoarding(0.176, 0.216, -1, 11.6, {});
      sponsorHoarding(0.224, 0.310,  1, 11.6, {});
      sponsorHoarding(0.828, 0.946, -1, 11.6, {});

      billboard(K(0.028), -1, 30, 12, 5, CHALK);
      billboard(K(0.086), -1, 30, 12, 5, BRICK);
      billboard(K(0.268),  1, 34, 12, 5, CHALK);
      billboard(K(0.922), -1, 32, 14, 6, CHALK);


      for (const [s, side, dist, len, wid, hgt] of [
        [0.130, -1, 620, 420, 130, 34],
        [0.300, -1, 640, 380, 120, 30],
        [0.560,  1, 600, 400, 130, 32],
        [0.700, -1, 620, 360, 120, 28],
        [0.900, -1, 660, 380, 130, 26],
        [0.040, -1, 700, 360, 120, 30],
        [0.480, -1, 780, 340, 110, 26],
        [0.760,  1, 680, 360, 120, 28],
      ]) {
        const a = anchor(K(s), side, dist);
        const ang = Math.atan2(a.t[0], a.t[2]);
        ridge(a.c[0], a.c[2], a.c[1] - 6, ang, len, wid, hgt, [0.22, 0.34, 0.19]);
      }

      for (const [s0, s1, side, d0] of [
        [0.060, 0.190, -1, 300], [0.240, 0.350, -1, 320],
        [0.860, 0.960, -1, 310],
      ]) {
        treeBelt(ID, s0, s1, side, d0, 90, 9, 151 + Math.round(s0 * 100), 12);
      }
      const farHill = (frac, side, dist, w, h, dy) => {
        const a = anchor(K(frac), side, dist).c;
        const y = terrainYAt(a[0], a[2]);
        mountain(a[0], a[2], (y === null ? a[1] : y) + dy, w, h,
          { rough: 0.22, snowline: 2, forest: [0.17, 0.31, 0.19] });
      };
      farHill(0.06, 1, 990, 1722, 86, -35);
      farHill(0.24, -1, 1080, 1599, 73, -31);
      farHill(0.46, 1, 1140, 1886, 96, -37);
      farHill(0.68, -1, 1020, 1517, 67, -30);
      farHill(0.88, 1, 1050, 1640, 80, -33);

      for (const s of [0.030, 0.045, 0.055]) {
        if (clear(K(sl(s)), 1, 52, 22)) bakedModel("k_tentlong", K(sl(s)), 1, 52, { scale: 2.4 });
      }
      bakedModel("k_camera_exclusive", K(sl(0.014)), -1, 13, { scale: 3 });
      for (const [s, side] of [[0.076, -1], [0.190, -1], [0.378, -1], [0.914, -1]])
        bakedModel("k_camera_exclusive", K(s), side, 13, { scale: 3 });
  };
