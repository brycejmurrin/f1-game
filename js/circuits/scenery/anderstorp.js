"use strict";
(window.TrackScenery = window.TrackScenery || {})["anderstorp"] =
  function (api) {
      const { out,
        n, hash, every, anchor, onTrack,
        pine: plantPine, tree: plantTree, bush: plantBush, forestEdge,
        building, grandstandEx, spectatorHill, terrace,
        guardrail, fence, tyreWall,
        marshalPost, cameraTower, billboard, sponsorHoarding, gantry,
        groundPatch, runoffApron, waterBand,
        place, addBox, addCyl, addFrustum, vadd,
        modelGroup, seat, MAT } = api;

      const { K } = api;
      const pick = (h, arr) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];

      const PINE      = [0.09, 0.20, 0.13];
      const PINE_D    = [0.07, 0.16, 0.11];
      const PINE_L    = [0.12, 0.25, 0.16];
      const PINE_O    = [0.13, 0.22, 0.12];
      const PINE_B    = [0.10, 0.17, 0.19];
      const PINE_F    = [0.12, 0.18, 0.22];
      const SPRUCE    = [0.07, 0.17, 0.15];
      const BIRCH     = [0.36, 0.46, 0.25];
      const SCRUB     = [0.24, 0.33, 0.18];
      const BUSH      = [0.16, 0.26, 0.14];
      const JUNIPER   = [0.20, 0.28, 0.20];
      const REED      = [0.35, 0.42, 0.26];
      const BOG_WATER = [0.26, 0.36, 0.32];
      const GRASS     = [0.31, 0.41, 0.22];
      const GRASS_M   = [0.35, 0.45, 0.24];
      const GRASS_S   = [0.40, 0.43, 0.27];
      const SAND      = [0.60, 0.61, 0.59];
      const SAND_D    = [0.53, 0.55, 0.54];
      const CONCRETE  = [0.63, 0.64, 0.62];
      const CONC_W    = [0.68, 0.69, 0.66];
      const CONC_D    = [0.55, 0.56, 0.55];
      const HARDSTAND = [0.52, 0.53, 0.52];
      const ARMCO     = [0.76, 0.78, 0.80];
      const PAINT     = [0.80, 0.80, 0.76];
      const PAINT_Y   = [0.72, 0.65, 0.31];
      const CORR_BLUE = [0.36, 0.45, 0.52];
      const CORR_CREAM= [0.76, 0.73, 0.63];
      const CORR_SILV = [0.58, 0.60, 0.61];
      const CORR_RUST = [0.47, 0.37, 0.30];
      const CORR_GRN  = [0.31, 0.38, 0.33];
      const FALU      = [0.42, 0.17, 0.13];
      const FALU_D    = [0.33, 0.14, 0.11];
      const TRIM      = [0.88, 0.87, 0.83];
      const TIMBER    = [0.45, 0.36, 0.26];
      const WHITEGREY = [0.80, 0.80, 0.79];
      const STEEL     = [0.55, 0.57, 0.58];
      const ALU       = [0.73, 0.75, 0.76];
      const AC_RED    = [0.62, 0.20, 0.18];
      const AC_BLUE   = [0.25, 0.35, 0.53];
      const DRUM      = [0.30, 0.38, 0.30];
      const ORANGE    = [0.70, 0.40, 0.14];
      const TYRE_K    = [0.18, 0.20, 0.22];
      const TYRE_R    = [0.70, 0.16, 0.14];

      const NEAR_PINE = [PINE, PINE_L, PINE_O];
      const MID_PINE  = [PINE_D, SPRUCE, PINE];
      const FAR_PINE  = [PINE_D, PINE_B, SPRUCE];

      const RW0 = 0.545, RW1 = 0.875;
      const onRunway = (s) => s > RW0 && s < RW1;

      const clear = (k, side, d, r) => {
        const a = anchor(k, side, d);
        return !onTrack(a.c[0], a.c[2], r === undefined ? 10 : r);
      };
      const FOOT_SPAN = [
        [0.955, 0.982, -1, 20, 38.4],
        [0.900, 0.925, -1, 26, 36.0],
        [0.172, 0.212,  1, 28, 38.0],
      ];
      const FOOT_BOX = [
        [0.636,  1, 105, 26, 46],
        [0.690,  1,  56,  8,  9],
        [0.144,  1,  35, 10, 18],
        [0.136,  1,  66, 4.6, 4.6],
        [0.136,  1,  74, 3.0, 3.0],
        [0.478, -1, 24.5, 5,  7],
        [0.222,  1,  34,  8, 12],
        [0.204,  1,65.5,  7, 10],
        [0.192,  1,  51,  6,  8],
      ];
      const spanPts = FOOT_SPAN.map(([s0, s1, side, g0, g1]) => {
        const pts = [], k0 = K(s0), k1 = K(s1);
        for (let k = k0; k <= k1; k++) pts.push(anchor(k, side, (g0 + g1) / 2).c);
        return { pts, half: (g1 - g0) / 2 };
      });
      const boxFr = FOOT_BOX.map(([s, side, g, w, l]) => {
        const a = anchor(K(s), side, g);
        return { c: a.c, r: a.r, t: a.t, hw: w / 2, hl: l / 2 };
      });
      const segDist = (x, z, p, q) => {
        const dx = q[0] - p[0], dz = q[2] - p[2], L2 = dx * dx + dz * dz;
        const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[2]) * dz) / L2)) : 0;
        return Math.hypot(x - p[0] - u * dx, z - p[2] - u * dz);
      };
      const inFootprint = (k, side, d, rad) => {
        const c = anchor(k, side, d).c;
        for (const f of boxFr) {
          const ox = c[0] - f.c[0], oz = c[2] - f.c[2];
          if (Math.abs(ox * f.r[0] + oz * f.r[2]) < f.hw + rad &&
              Math.abs(ox * f.t[0] + oz * f.t[2]) < f.hl + rad) return true;
        }
        for (const f of spanPts) {
          for (let i = 0; i + 1 < f.pts.length; i++)
            if (segDist(c[0], c[2], f.pts[i], f.pts[i + 1]) < f.half + rad) return true;
        }
        return false;
      };
      const pine = (k, side, d, h, col, o) => {
        if (!inFootprint(k, side, d, h * 0.225 + 0.5)) plantPine(k, side, d, h, col, o);
      };
      const tree = (k, side, d, h, col, o) => {
        if (!inFootprint(k, side, d, h * 0.35 + 0.5)) plantTree(k, side, d, h, col, o);
      };
      const bush = (k, side, d, col, o) => {
        if (!inFootprint(k, side, d, 2.0)) plantBush(k, side, d, col, o);
      };
      const farPine = (k, side, d, ht, col) => { if (clear(k, side, d)) pine(k, side, d, ht, col); };
      const farTree = (k, side, d, ht, col) => { if (clear(k, side, d, 12)) tree(k, side, d, ht, col); };

      const seatBox = (k, side, gap, sz, col, lift) => {
        const a = anchor(k, side, gap);
        if (onTrack(a.c[0], a.c[2], sz[0] / 2 + 1.5)) return;
        const L = lift == null ? 0.08 : lift;
        addBox(out, vadd(a.c, a.u, 0.3 + L + sz[1] / 2), sz, col, [a.r, a.u, a.t]);
      };

      const aircraft = (s, gap, skin) => {
        place(K(s), 1, gap, [1.5, 2.1, 6.0], skin);
        seatBox(K(s), 1, gap, [10.6, 0.55, 1.4], skin, 1.25);
        seatBox(K(s - 0.0016), 1, gap, [3.4, 0.45, 0.9], skin, 0.95);
        place(K(s - 0.0016), 1, gap, [0.35, 2.3, 1.6], AC_RED);
      };

      const windsock = (k, side, gap, mastH, len) =>
        seatBox(k, side, gap, [0.9, 0.9, len], ORANGE, mastH - 0.8 - 1.4);

      const boards = (s0, side, gap, step) => {
        for (let i = 0; i < 3; i++) {
          place(K(s0 - (i + 1) * step), side, gap, [0.25, 1.7, 1.3], TRIM);
          seatBox(K(s0 - (i + 1) * step), side, gap, [0.28, 0.35, 1.4], TYRE_K, 0.08);
        }
      };

      every(11, (k) => {
        const s = k / n;
        const h = hash(k * 37);
        const h2 = hash(k * 71 + 5);
        const h3 = hash(k * 101 + 13);
        for (const side of [-1, 1]) {
          if (onRunway(s)) continue;
          if (side === 1 && (s > 0.945 || s < 0.100)) continue;
          const near = 26 + h * 6;
          if (h > 0.18) {
            const a = anchor(k, side, near);
            if (!onTrack(a.c[0], a.c[2], 7)) {
              pine(k, side, near, 17 + h * 9, pick(h, NEAR_PINE));
            }
          }
          if (h2 > 0.24) pine(k, side, 36 + h2 * 9, 15 + h2 * 10, pick(h2, MID_PINE));
          if (h2 < 0.58) {
            const d = 29 + h2 * 5;
            if (clear(k, side, d, 8)) pine(k, side, d, 16 + h2 * 11, pick(h2, NEAR_PINE));
          }
          if (h2 > 0.62) farPine(k, side, 32 + h * 9, 14 + h * 9, pick(h, FAR_PINE));
          if (h3 > 0.28) farPine(k, side, 45 + h3 * 13, 15 + h3 * 9, pick(h3, FAR_PINE));
          if (h3 > 0.52) farPine(k, side, 62 + h * 17, 14 + h2 * 10, PINE_B);
          if (h3 > 0.74) farPine(k, side, 86 + h2 * 24, 16 + h3 * 8, PINE_B);
          if (h3 > 0.90) farPine(k, side, 118 + h * 34, 18 + h * 8, PINE_F);
          if (h < 0.12) bush(k, side, 11 + h * 3, BUSH);
          if (h < 0.07) bush(k, side, 17 + h2 * 5, JUNIPER);
          if (h > 0.93 && h2 < 0.34) farTree(k, side, 25 + h2 * 11, 9 + h2 * 4, BIRCH);
        }
      });

      forestEdge(0.875, 1.0, -1, 26, { col: PINE_D, spacing: 12 });
      forestEdge(0.0, 0.545, -1, 24, { col: PINE_D, spacing: 12 });
      forestEdge(0.100, 0.210, 1, 40, { col: PINE_D, spacing: 14 });
      forestEdge(0.210, 0.545, 1, 34, { col: PINE_D, spacing: 14 });
      forestEdge(0.875, 0.945, 1, 40, { col: PINE_D, spacing: 14 });

      guardrail(0.875, 1.0, -1, 9, ARMCO);
      guardrail(0.0, 0.545, -1, 9, ARMCO);
      guardrail(0.875, 1.0, 1, 11, ARMCO);
      guardrail(0.0, 0.545, 1, 12, ARMCO);
      guardrail(RW0, RW1, 1, 30, ARMCO);
      guardrail(RW0, RW1, -1, 34, ARMCO);

      grandstandEx(0.988, 1, 14, 105, null, null);
      grandstandEx(0.030, 1, 14, 85, null, null);
      grandstandEx(0.062, 1, 16, 46, null, null);
      {
        const a = anchor(K(0.008), 1, 36);
        const b = [a.r, a.u, a.t];
        modelGroup("anderstorp-press-stand", {
          center: vadd(a.c, a.u, 5), size: [12, 12, 40], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (let r = 0; r < 5; r++) {
            const hgt = 1.4 + r * 1.35;
            seat.box(stage, vadd(vadd(a.c, a.r, 1.2 + r * 1.8), a.u, hgt * 0.5),
              [1.7, hgt, 36 - r * 1.5], r & 1 ? CONC_D : CONCRETE, b);
            stage._mat = MAT.FABRIC;
            seat.box(stage, vadd(vadd(a.c, a.r, 1.2 + r * 1.8), a.u, hgt + 0.45),
              [1.4, 0.9, 34 - r * 1.5],
              [[0.88, 0.86, 0.82], [0.22, 0.28, 0.40], [0.78, 0.26, 0.20]][r % 3], b);
            stage._mat = MAT.CONCRETE;
          }
          seat.box(stage, vadd(vadd(a.c, a.r, 7.5), a.u, 1.6),
            [5, 3.2, 24], CORR_SILV, b);
        }, { required: true });
      }
      {
        const a = anchor(K(0.022), 1, 48);
        const b = [a.r, a.u, a.t];
        modelGroup("anderstorp-speaker-tower", {
          center: vadd(a.c, a.u, 9), size: [8, 20, 8], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(a.c, a.u, 6.5), [2.4, 13, 2.4], STEEL, b);
          for (const [dr, dt] of [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]])
            addCyl(stage, vadd(vadd(a.c, a.r, dr), a.t, dt), 0.18, 13, STEEL, 6, b);
          stage._mat = MAT.CONCRETE;
          seat.box(stage, vadd(a.c, a.u, 13.6), [5.4, 2.8, 5.4], WHITEGREY, b);
          seat.box(stage, vadd(vadd(a.c, a.u, 13.6), a.r, -2.8),
            [0.25, 1.6, 4.2], [0.18, 0.20, 0.22], b);
          stage._mat = MAT.ROOF;
          seat.box(stage, vadd(a.c, a.u, 15.4), [6.0, 0.35, 6.0], CORR_SILV, b);
        }, { required: true });
      }
      {
        const a = anchor(K(0.048), 1, 56);
        const b = [a.r, a.u, a.t];
        modelGroup("anderstorp-stations-1968", {
          center: vadd(a.c, a.u, 3.2), size: [14, 10, 28], basis: b,
        }, (stage) => {
          stage._mat = MAT.WOOD;
          seat.box(stage, vadd(a.c, a.u, 2.4), [10, 4.8, 22], TIMBER, b);
          for (let i = 0; i < 9; i++) {
            const p = vadd(vadd(a.c, a.t, (i - 4) * 2.4), a.r, -5.15);
            seat.box(stage, vadd(p, a.u, 2.4), [0.12, 4.4, 0.35], FALU_D, b);
          }
          stage._mat = MAT.ROOF;
          seat.box(stage, vadd(a.c, a.u, 5.2), [11.2, 0.45, 24], CORR_SILV, b);
          stage._mat = MAT.CONCRETE;
          seat.box(stage, vadd(vadd(a.c, a.r, -5.2), a.u, 3.2),
            [0.2, 1.4, 8], TRIM, b);
        }, { required: true });
      }
      building(K(0.012), 1, 64, 14, 9, 34, { col: WHITEGREY });
      building(K(0.012), 1, 79, 7, 5.5, 22, { col: CORR_CREAM });
      building(K(0.031), 1, 68, 8, 10.5, 9, { col: WHITEGREY });
      building(K(0.060), 1, 70, 7, 4.2, 12, { col: FALU });
      for (let i = 0; i < 6; i++) {
        building(K(0.970 + i * 0.0092), 1, 40, 9, 4.6, 15,
          { col: i % 2 ? CORR_CREAM : CORR_SILV });
      }
      groundPatch(K(0.005), 1, 3, [11, 0.18, 44], SAND);
      groundPatch(K(0.025), 1, 3, [11, 0.16, 44], SAND);
      groundPatch(K(0.984), 1, 28, [22, 0.20, 36], HARDSTAND);
      groundPatch(K(0.008), 1, 28, [22, 0.17, 36], HARDSTAND);
      groundPatch(K(0.032), 1, 28, [22, 0.20, 36], CONC_D);
      marshalPost(K(0.0), 1, 12);
      marshalPost(K(0.046), 1, 12);
      cameraTower(K(0.055), 1, 18);
      gantry(0.0, 8.5, [0.80, 0.80, 0.78]);
      fence(0.975, 0.050, 1, 36, 2.2, [0.62, 0.63, 0.62]);
      fence(0.958, 0.072, 1, 74, 1.8, [0.55, 0.57, 0.55]);
      for (let i = 0; i < 6; i++) place(K(0.994 + i * 0.0030), 1, 36, [0.30, 9.5, 0.30], TRIM);
      place(K(0.022), 1, 80, [3.2, 3.2, 3.2], TRIM);
      place(K(0.006), 1, 74, [2.0, 2.0, 5.0], STEEL);
      billboard(K(0.982), 1, 17, 9, 3.6, [0.24, 0.36, 0.60]);
      billboard(K(0.040), 1, 17, 9, 3.6, [0.84, 0.82, 0.76]);

      for (let i = 0; i < 22; i++) {
        const s = 0.965 + i * 0.0042;
        const k = K(s);
        pine(k, -1, 30 + hash(k * 13) * 4, 18 + hash(k * 17) * 8, PINE);
      }
      for (let i = 0; i < 18; i++) {
        const s = 0.962 + i * 0.0050;
        const k = K(s);
        const h = hash(k * 53 + 9);
        pine(k, -1, 36 + h * 7, 16 + h * 9, h < 0.4 ? SPRUCE : PINE_D);
        if (h > 0.78) tree(k, -1, 20 + h * 4, 10 + h * 3, BIRCH);
      }
      sponsorHoarding(0.028, 0.056, -1, 14, {});
      sponsorHoarding(0.978, 0.996, -1, 14, {});
      billboard(K(0.010), -1, 16, 8, 3.2, [0.86, 0.84, 0.78]);

      runoffApron(K(0.048), -1, 2, 30, SAND);
      runoffApron(K(0.062), -1, 2, 26, SAND);
      groundPatch(K(0.056), -1, 16, [16, 0.18, 26], SAND_D);
      tyreWall(0.038, 0.078, -1, 16, TYRE_R);
      tyreWall(0.028, 0.038, -1, 17, TYRE_K);
      marshalPost(K(0.050), -1, 20);
      marshalPost(K(0.068), -1, 20);
      cameraTower(K(0.070), -1, 24);
      building(K(0.058), -1, 26, 5, 3.6, 6, { col: FALU });
      place(K(0.043), -1, 23, [2.4, 3.0, 5.2], ORANGE);
      for (let i = 0; i < 3; i++) {
        place(K(0.076 + i * 0.0030), -1, 22, [1.8, 2.0, 1.8], TYRE_K);
      }
      boards(0.045, -1, 12, 0.0124);
      forestEdge(0.030, 0.095, -1, 22, { col: PINE, spacing: 12 });

      groundPatch(K(0.100), 1, 24, [46, 0.18, 60], HARDSTAND);
      groundPatch(K(0.125), 1, 24, [40, 0.16, 54], HARDSTAND);
      groundPatch(K(0.148), 1, 26, [30, 0.20, 40], CONC_D);
      building(K(0.090), 1, 28, 12, 6.5, 30, { col: CORR_BLUE });
      building(K(0.108), 1, 28, 12, 6.0, 26, { col: CORR_CREAM });
      building(K(0.126), 1, 30, 11, 6.5, 22, { col: CORR_BLUE });
      building(K(0.144), 1, 30, 10, 5.5, 18, { col: CORR_RUST });
      building(K(0.096), 1, 58, 14, 7.5, 34, { col: CORR_SILV });
      building(K(0.122), 1, 58, 13, 7.0, 28, { col: CORR_GRN });
      building(K(0.142), 1, 56, 9, 5.0, 16, { col: FALU });
      building(K(0.112), 1, 80, 12, 6.0, 24, { col: CORR_CREAM });
      place(K(0.104), 1, 40, [2.6, 2.6, 6.0], STEEL);
      place(K(0.118), 1, 42, [2.2, 1.9, 4.4], DRUM);
      for (let i = 0; i < 6; i++) {
        place(K(0.094 + i * 0.0080), 1, 37, [1.2, 1.7, 1.2], i % 2 ? DRUM : ORANGE);
      }
      place(K(0.136), 1, 66, [4.6, 11, 4.6], ALU);
      place(K(0.136), 1, 74, [3.0, 7.5, 3.0], STEEL);
      fence(0.078, 0.166, 1, 22, 2.2, [0.58, 0.60, 0.58]);
      marshalPost(K(0.115), 1, 13);
      for (let i = 0; i < 20; i++) {
        const k = K(0.072 + i * 0.0070);
        const h = hash(k * 131 + 27);
        farPine(k, 1, 96 + h * 30, 16 + h * 9, PINE_B);
        if (h > 0.45) farPine(k, 1, 134 + h * 40, 17 + h * 8, PINE_F);
      }
      {
        const hs = 0.108, side = 1, gap = 28;
        if (clear(K(hs), side, gap, 12)) {
          seatBox(K(hs), side, gap, [16, 0.12, 16], CONC_W, 0.11);
          const a = anchor(K(hs), side, gap), b = [a.r, a.u, a.t];
          addFrustum(out, vadd(a.c, a.u, 0.22), 7.2, 7.2, 0.08, PAINT, 14, b);
          seatBox(K(hs), side, gap - 2.4, [6, 0.06, 1.0], PAINT, 0.14);
          seatBox(K(hs), side, gap + 2.4, [6, 0.06, 1.0], PAINT, 0.14);
          seatBox(K(hs), side, gap, [1.0, 0.06, 5.2], PAINT, 0.14);
          seatBox(K(hs), side, gap + 8, [0.22, 0.55, 0.22], PAINT_Y, 0.12);
        }
      }

      for (let i = 0; i < 30; i++) {
        const s = 0.130 + i * 0.0028;
        const k = K(s);
        const h = hash(k * 29 + 3);
        pine(k, -1, 25 + h * 4, 19 + h * 9, h < 0.5 ? PINE : PINE_L);
        if (h > 0.45) pine(k, -1, 33 + h * 5, 16 + h * 8, PINE_D);
        if (h > 0.30) farPine(k, -1, 27 + h * 8, 15 + h * 9, SPRUCE);
        if (h > 0.70) farPine(k, -1, 42 + h * 12, 15 + h * 8, PINE_B);
      }
      marshalPost(K(0.160), -1, 13);
      bush(K(0.142), -1, 9, JUNIPER);
      bush(K(0.166), -1, 9, BUSH);

      groundPatch(K(0.185), 1, 14, [48, 0.18, 62], GRASS);
      groundPatch(K(0.205), 1, 18, [28, 0.16, 48], GRASS);
      groundPatch(K(0.226), 1, 22, [30, 0.20, 36], GRASS_M);
      spectatorHill(0.172, 0.212, 1, 28, {});
      marshalPost(K(0.178), 1, 14);
      marshalPost(K(0.208), 1, 14);
      billboard(K(0.186), 1, 17, 9, 3.6, [0.86, 0.84, 0.78]);
      billboard(K(0.200), 1, 17, 9, 3.6, [0.78, 0.30, 0.22]);
      billboard(K(0.214), 1, 17, 9, 3.6, [0.24, 0.36, 0.60]);
      billboard(K(0.228), 1, 18, 8, 3.2, [0.82, 0.76, 0.34]);
      building(K(0.192), 1, 48, 6, 4.4, 8, { col: FALU });
      building(K(0.222), 1, 30, 8, 3.8, 12, { col: TIMBER });
      building(K(0.204), 1, 62, 7, 4.0, 10, { col: FALU_D });
      fence(0.166, 0.234, 1, 40, 1.8, [0.58, 0.60, 0.58]);
      for (let i = 0; i < 14; i++) {
        const s = 0.168 + i * 0.0052;
        const k = K(s);
        const h = hash(k * 59 + 21);
        if (h < 0.25) continue;
        farPine(k, 1, 78 + h * 26, 15 + h * 9, pick(h, FAR_PINE));
        if (h > 0.70) farTree(k, 1, 56 + h * 14, 8 + h * 4, BIRCH);
      }

      forestEdge(0.225, 0.300, -1, 16, { col: PINE, spacing: 12 });
      building(K(0.245), -1, 16, 5, 4.0, 7, { col: TIMBER });
      building(K(0.268), -1, 18, 4, 3.2, 5, { col: FALU });
      place(K(0.256), -1, 17, [2.0, 2.2, 6.0], TIMBER);
      place(K(0.262), -1, 17, [2.0, 2.0, 5.0], TIMBER);
      groundPatch(K(0.252), -1, 13, [7, 0.18, 34], HARDSTAND);
      groundPatch(K(0.272), -1, 13, [7, 0.16, 34], HARDSTAND);
      marshalPost(K(0.252), -1, 12);
      marshalPost(K(0.282), -1, 12);
      for (let i = 0; i < 16; i++) {
        const s = 0.222 + i * 0.0050;
        const k = K(s);
        const h = hash(k * 67 + 31);
        pine(k, -1, 27 + h * 5, 18 + h * 9, h < 0.45 ? PINE : PINE_O);
        if (h > 0.55) farPine(k, -1, 24 + h * 9, 16 + h * 9, SPRUCE);
      }

      waterBand(0.108, 0.278, -1, 44, 50, 4, BOG_WATER, { id: "anderstorp-aan-bog" });
      for (let i = 0; i < 14; i++) {
        const s = 0.116 + i * 0.011;
        const k = K(s);
        const h = hash(k * 157 + 11);
        if (h < 0.20) continue;
        bush(k, -1, 38 + h * 7, h < 0.55 ? REED : JUNIPER);
        if (h > 0.68) bush(k, -1, 46 + h * 5, BUSH);
      }

      runoffApron(K(0.326), -1, 2, 28, SAND);
      runoffApron(K(0.344), -1, 2, 24, SAND);
      groundPatch(K(0.336), -1, 14, [14, 0.18, 26], SAND_D);
      tyreWall(0.318, 0.352, -1, 15, TYRE_R);
      sponsorHoarding(0.316, 0.356, -1, 19, {});
      sponsorHoarding(0.296, 0.312, -1, 17, {});
      cameraTower(K(0.336), -1, 36);
      marshalPost(K(0.324), -1, 11.5);
      marshalPost(K(0.358), -1, 14);
      building(K(0.356), -1, 38, 7, 5.5, 9, { col: CORR_BLUE });
      building(K(0.310), -1, 40, 5, 3.6, 7, { col: FALU });
      for (let i = 0; i < 3; i++) {
        place(K(0.352 + i * 0.0028), -1, 24, [1.8, 2.0, 1.8], TYRE_K);
      }
      billboard(K(0.366), -1, 18, 8, 3.2, [0.82, 0.76, 0.34]);
      boards(0.328, -1, 14, 0.0124);
      forestEdge(0.300, 0.380, -1, 36, { col: PINE_D, spacing: 14 });

      groundPatch(K(0.395), 1, 26, [48, 0.18, 60], [0.42, 0.44, 0.28]);
      groundPatch(K(0.430), 1, 30, [40, 0.16, 52], [0.42, 0.44, 0.28]);
      groundPatch(K(0.380), 1, 36, [26, 0.20, 36], GRASS_S);
      groundPatch(K(0.455), 1, 34, [24, 0.17, 34], GRASS_S);
      for (let i = 0; i < 16; i++) {
        const s = 0.370 + i * 0.0055;
        const k = K(s);
        const h = hash(k * 19 + 7);
        if (h < 0.30) continue;
        if (h < 0.62) farTree(k, 1, 30 + h * 22, 6 + h * 4, SCRUB);
        else farPine(k, 1, 30 + h * 26, 11 + h * 6, PINE_D);
        if (h > 0.85) bush(k, 1, 24 + h * 10, BUSH);
        if (h > 0.40) farPine(k, 1, 74 + h * 30, 14 + h * 9, PINE_B);
      }
      marshalPost(K(0.404), 1, 15);
      bush(K(0.416), 1, 20, JUNIPER);
      bush(K(0.434), 1, 22, BUSH);

      runoffApron(K(0.470), -1, 2, 16, SAND);
      runoffApron(K(0.492), -1, 2, 16, SAND);
      runoffApron(K(0.510), -1, 2, 16, SAND);
      billboard(K(0.466), -1, 13, 8, 3.2, [0.84, 0.82, 0.76]);
      billboard(K(0.500), -1, 13, 8, 3.2, [0.30, 0.42, 0.66]);
      tyreWall(0.506, 0.534, -1, 13, TYRE_K);
      marshalPost(K(0.488), -1, 14);
      marshalPost(K(0.516), -1, 14);
      building(K(0.478), -1, 22, 5, 3.8, 7, { col: FALU });
      building(K(0.520), -1, 24, 6, 4.2, 9, { col: TIMBER });
      groundPatch(K(0.484), -1, 12, [12, 0.18, 30], SAND_D);
      groundPatch(K(0.506), -1, 12, [12, 0.20, 30], SAND_D);
      fence(0.450, 0.538, -1, 18, 1.6, [0.58, 0.60, 0.58]);
      for (let i = 0; i < 3; i++) {
        place(K(0.522 + i * 0.0026), -1, 19, [1.8, 2.0, 1.8], TYRE_K);
      }
      sponsorHoarding(0.452, 0.472, -1, 16, {});
      for (let i = 0; i < 18; i++) {
        const s = 0.444 + i * 0.0056;
        const k = K(s);
        const h = hash(k * 83 + 17);
        if (h > 0.35) farPine(k, -1, 21 + h * 7, 16 + h * 9, SPRUCE);
        if (h > 0.66) farPine(k, -1, 36 + h * 12, 15 + h * 9, PINE_B);
      }
      forestEdge(0.440, 0.545, -1, 20, { col: PINE, spacing: 12 });

      const APR0 = 0.564, APR1 = 0.830;
      const APR_STEP = (APR1 - APR0) / 23 * api.ds * api.n;
      for (let i = 0; i < 24; i++) {
        const s = APR0 + (i / 23) * (APR1 - APR0);
        const k = K(s);
        const f = Math.min(1, 0.45 + i * 0.14);
        const ln = i < 4 ? 28 : Math.min(40, APR_STEP - 0.4);
        groundPatch(k, 1, 6, [Math.min(18.5, 16.5 * f), 0.18, ln],
          pick(hash(i * 31 + 7), [CONCRETE, CONC_W, CONC_D, CONCRETE]));
      }
      for (let i = 0; i < 22; i++) {
        const s = RW0 + 0.006 + (i / 21) * (RW1 - RW0 - 0.012);
        seatBox(K(s), 1, 34 + (i % 2), [10, 0.12, 13], CONC_W, 0.11 + (i % 3) * 0.008);
      }
      for (let i = 0; i < 26; i++) {
        const s = RW0 + 0.004 + (i / 25) * (RW1 - RW0 - 0.010);
        seatBox(K(s), 1, 14, [1.6, 0.10, 9], PAINT, 0.10);
      }
      for (let i = 0; i < 22; i++) {
        const s = RW0 + 0.008 + (i / 21) * (RW1 - RW0 - 0.020);
        seatBox(K(s), 1, 27, [1.1, 0.10, 11], PAINT, 0.11);
        seatBox(K(s + 0.0035), 1, 20, [0.8, 0.10, 14], PAINT, 0.12);
      }
      for (const t of [0.570, 0.845]) {
        for (let j = 0; j < 6; j++) {
          seatBox(K(t), 1, 7 + j * 4.2, [2.2, 0.10, 16], PAINT, 0.10 + j * 0.01);
        }
      }
      marshalPost(K(0.560), 1, 26);
      cameraTower(K(0.566), 1, 34);
      billboard(K(0.552), 1, 22, 9, 3.6, [0.82, 0.80, 0.74]);
      billboard(K(0.578), 1, 24, 9, 3.6, [0.24, 0.36, 0.60]);
      for (const t of [0.596, 0.820]) {
        seatBox(K(t), 1, 10, [4.4, 0.10, 26], PAINT, 0.11);
        seatBox(K(t), 1, 24, [4.4, 0.10, 26], PAINT, 0.12);
      }
      for (const t of [0.622, 0.664, 0.706, 0.748, 0.790]) {
        for (let j = 0; j < 2; j++) {
          seatBox(K(t), 1, 9.5 + j * 2.8, [1.4, 0.10, 13], PAINT, 0.10 + j * 0.015);
          seatBox(K(t), 1, 23.0 + j * 2.8, [1.4, 0.10, 13], PAINT, 0.11 + j * 0.015);
        }
      }
      for (let i = 0; i < 22; i++) {
        const t = RW0 + 0.006 + (i / 21) * (RW1 - RW0 - 0.012);
        place(K(t), 1, 29, [0.36, 0.9, 0.36], TRIM);
        place(K(t), -1, 36, [0.36, 0.9, 0.36], TRIM);
      }
      place(K(0.574), 1, 36, [0.30, 8.5, 0.30], TRIM);
      windsock(K(0.574), 1, 36, 8.5, 3.6);

      {
        const a = anchor(K(0.640), 1, 52);
        const b = [a.r, a.u, a.t];
        modelGroup("anderstorp-flight-hangars", {
          center: vadd(a.c, a.u, 8), size: [36, 18, 120], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          for (const dt of [-28, 28]) {
            const c = vadd(a.c, a.t, dt);
            seat.box(stage, vadd(c, a.u, 5.5), [28, 11, 48], CORR_SILV, b);
            stage._mat = MAT.ROOF;
            seat.box(stage, vadd(c, a.u, 11.4), [30, 0.5, 50], CORR_SILV, b);
            seat.box(stage, vadd(c, a.u, 12.2), [8, 1.6, 50], CORR_RUST, b);
            stage._mat = MAT.METAL;
            seat.box(stage, vadd(vadd(c, a.r, -14.2), a.u, 4.5),
              [0.3, 9.0, 36], [0.18, 0.19, 0.20], b);
          }
        }, { required: true });
      }
      building(K(0.636), 1, 92, 26, 12, 46, { col: CORR_RUST });
      building(K(0.690), 1, 52, 8, 14, 9, { col: TRIM });
      building(K(0.700), 1, 48, 10, 6, 16, { col: CORR_CREAM });
      building(K(0.712), 1, 48, 10, 5.5, 14, { col: FALU });
      building(K(0.676), 1, 90, 12, 6.5, 22, { col: CORR_GRN });
      building(K(0.606), 1, 88, 11, 6.0, 18, { col: CORR_CREAM });
      groundPatch(K(0.640), 1, 78, [40, 0.18, 70], CONCRETE);
      groundPatch(K(0.688), 1, 74, [28, 0.16, 54], CONCRETE);
      groundPatch(K(0.612), 1, 72, [12, 0.20, 36], CONC_D);
      groundPatch(K(0.656), 1, 72, [12, 0.17, 36], CONC_D);
      groundPatch(K(0.700), 1, 72, [12, 0.20, 36], CONC_W);
      fence(0.600, 0.730, 1, 46, 2.0, [0.60, 0.62, 0.60]);
      marshalPost(K(0.652), 1, 28);
      aircraft(0.612, 38, ALU);
      aircraft(0.630, 39, AC_BLUE);
      aircraft(0.648, 38, ALU);
      aircraft(0.668, 39, [0.80, 0.78, 0.72]);
      aircraft(0.706, 38, ALU);
      aircraft(0.596, 39, [0.78, 0.76, 0.70]);
      aircraft(0.722, 38, AC_BLUE);
      for (let i = 0; i < 4; i++) {
        place(K(0.734 + i * 0.0042), 1, 42, [2.2, 1.9, 7.4], ALU);
      }
      for (const s of [0.612, 0.630, 0.648, 0.668, 0.706]) {
        seatBox(K(s), 1, 36, [12, 0.08, 0.5], PAINT_Y, 0.05);
        seatBox(K(s - 0.0022), 1, 36, [12, 0.08, 0.5], PAINT_Y, 0.06);
      }
      for (let i = 0; i < 8; i++) {
        place(K(0.604 + i * 0.0130), 1, 48, [1.2, 1.7, 1.2], i % 3 ? DRUM : ORANGE);
      }
      place(K(0.622), 1, 48, [2.4, 2.2, 5.4], STEEL);
      place(K(0.682), 1, 48, [1.8, 2.4, 3.0], ORANGE);
      place(K(0.694), 1, 66, [4.2, 9.0, 4.2], ALU);
      for (let i = 0; i < 22; i++) {
        const s = 0.580 + i * 0.0130;
        const k = K(s);
        const h = hash(k * 97 + 43);
        farPine(k, 1, 128 + h * 40, 16 + h * 9, PINE_B);
        if (h > 0.45) farPine(k, 1, 160 + h * 50, 17 + h * 8, PINE_F);
      }

      for (let i = 0; i < 8; i++) {
        groundPatch(K(RW0 + 0.02 + (i / 7) * (RW1 - RW0 - 0.04)), -1, 14 + (i % 2) * 8,
          [56, 0.18, 90], pick(hash(i * 17 + 3), [GRASS, GRASS_M, GRASS_S, GRASS]));
      }
      for (let i = 0; i < 6; i++) {
        groundPatch(K(RW0 + 0.04 + (i / 5) * (RW1 - RW0 - 0.08)), -1, 100 + (i % 2) * 10,
          [36, 0.18, 90], GRASS_M);
      }
      for (let i = 0; i < 26; i++) {
        const s = RW0 + (i / 25) * (RW1 - RW0);
        const k = K(s);
        const h = hash(k * 23 + 11);
        if (h < 0.35) continue;
        farPine(k, -1, 72 + h * 14, 16 + h * 8, PINE_D);
      }
      for (let i = 0; i < 24; i++) {
        const s = RW0 + 0.006 + (i / 23) * (RW1 - RW0 - 0.012);
        const k = K(s);
        const h = hash(k * 149 + 19);
        farPine(k, -1, 128 + h * 40, 16 + h * 9, PINE_B);
        if (h > 0.40) farPine(k, -1, 176 + h * 60, 17 + h * 8, PINE_F);
      }
      forestEdge(RW0, RW1, -1, 92, { col: PINE_D, spacing: 20 });
      fence(RW0 + 0.010, RW1 - 0.010, -1, 60, 1.4, [0.56, 0.58, 0.55]);
      building(K(0.762), -1, 122, 16, 8, 26, { col: FALU });
      building(K(0.780), -1, 124, 8, 5, 12, { col: FALU_D });
      place(K(0.772), -1, 118, [4.0, 10, 4.0], ALU);
      place(K(0.700), -1, 44, [0.30, 8.0, 0.30], TRIM);
      windsock(K(0.700), -1, 44, 8.0, 3.4);
      for (let i = 0; i < 14; i++) {
        const s = RW0 + 0.014 + (i / 13) * (RW1 - RW0 - 0.028);
        seatBox(K(s), -1, 50, [0.7, 0.55, 0.7], PAINT, 0.08);
      }
      building(K(0.712), -1, 78, 8, 4.0, 12, { col: CORR_RUST });
      building(K(0.828), -1, 74, 7, 3.6, 10, { col: TIMBER });
      place(K(0.820), -1, 44, [0.30, 7.5, 0.30], TRIM);
      windsock(K(0.820), -1, 44, 7.5, 3.2);
      marshalPost(K(0.740), -1, 30);
      marshalPost(K(0.680), -1, 30);
      marshalPost(K(0.800), -1, 30);

      building(K(0.820), 1, 28, 12, 7.5, 24, { col: CORR_BLUE });
      building(K(0.802), 1, 28.5, 9, 5.0, 14, { col: CORR_RUST });
      building(K(0.842), 1, 40, 7, 4.2, 10, { col: TIMBER });
      sponsorHoarding(0.808, 0.836, 1, 26, {});
      groundPatch(K(0.838), 1, 36, [16, 0.20, 32], CONC_W);
      groundPatch(K(0.848), 1, 12, [28, 0.18, 36], GRASS);
      groundPatch(K(0.858), 1, 12, [16, 0.16, 26], GRASS);
      groundPatch(K(0.866), 1, 16, [14, 0.20, 22], GRASS_S);
      for (let i = 0; i < 4; i++) {
        place(K(0.806 + i * 0.0060), 1, 33, [1.2, 1.7, 1.2], i % 2 ? DRUM : STEEL);
      }
      billboard(K(0.856), 1, 20, 9, 3.6, [0.78, 0.30, 0.22]);
      marshalPost(K(0.830), 1, 20.5);

      runoffApron(K(0.874), -1, 2, 24, SAND);
      runoffApron(K(0.888), -1, 2, 22, SAND);
      groundPatch(K(0.882), -1, 14, [14, 0.18, 26], SAND_D);
      tyreWall(0.868, 0.900, -1, 14, TYRE_R);
      marshalPost(K(0.866), -1, 13);
      marshalPost(K(0.894), -1, 13);
      cameraTower(K(0.882), -1, 26);
      building(K(0.898), -1, 24, 5, 3.6, 6, { col: FALU });
      boards(0.862, -1, 37, 0.0124);
      for (let i = 0; i < 24; i++) {
        const s = 0.872 + i * 0.0022;
        const k = K(s);
        const h = hash(k * 41 + 2);
        pine(k, -1, 31 + h * 6, 18 + h * 9, h < 0.5 ? PINE : PINE_L);
        pine(k, 1, 30 + h * 8, 17 + h * 8, PINE_D);
        if (h > 0.35) farPine(k, -1, 33 + h * 10, 16 + h * 9, SPRUCE);
        if (h > 0.55) farPine(k, 1, 31 + h * 11, 16 + h * 9, SPRUCE);
        if (h > 0.70) farPine(k, -1, 50 + h * 16, 15 + h * 9, PINE_B);
      }
      for (let i = 0; i < 3; i++) {
        place(K(0.900 + i * 0.0026), -1, 20, [1.8, 2.0, 1.8], TYRE_K);
      }

      runoffApron(K(0.912), -1, 2, 26, SAND);
      runoffApron(K(0.932), -1, 2, 26, SAND);
      runoffApron(K(0.952), -1, 2, 22, SAND);
      groundPatch(K(0.922), -1, 13, [13, 0.18, 26], SAND_D);
      groundPatch(K(0.942), -1, 13, [13, 0.20, 26], SAND_D);
      tyreWall(0.906, 0.962, -1, 15, TYRE_K);
      grandstandEx(0.925, -1, 22, 110, null, null);
      grandstandEx(0.898, -1, 24, 52, null, null);
      terrace(0.955, 0.982, -1, 20, {});
      spectatorHill(0.900, 0.925, -1, 26, {});
      billboard(K(0.908), -1, 17, 9, 3.6, [0.84, 0.82, 0.76]);
      billboard(K(0.944), -1, 17, 9, 3.6, [0.30, 0.42, 0.66]);
      billboard(K(0.968), -1, 17, 9, 3.6, [0.84, 0.82, 0.76]);
      billboard(K(0.986), -1, 16, 8, 3.2, [0.78, 0.30, 0.22]);
      building(K(0.936), -1, 52, 9, 5.5, 16, { col: FALU });
      building(K(0.958), -1, 50, 7, 5.0, 10, { col: CORR_BLUE });
      building(K(0.916), -1, 54, 8, 4.5, 14, { col: TIMBER });
      for (let i = 0; i < 4; i++) {
        place(K(0.966 + i * 0.0035), -1, 36, [0.30, 8.5, 0.30], TRIM);
      }
      marshalPost(K(0.930), -1, 11.5);
      marshalPost(K(0.958), -1, 11.5);
      boards(0.908, -1, 12, 0.0110);
      for (let i = 0; i < 18; i++) {
        const s = 0.896 + i * 0.0056;
        const k = K(s);
        const h = hash(k * 113 + 7);
        farPine(k, -1, 56 + h * 20, 16 + h * 9, PINE_B);
        if (h > 0.50) farPine(k, -1, 84 + h * 28, 16 + h * 8, PINE_F);
      }
      forestEdge(0.895, 0.995, -1, 40, { col: PINE_D, spacing: 14 });
  };
