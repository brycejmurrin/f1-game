"use strict";
(window.TrackScenery = window.TrackScenery || {})["okayama"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        tree: rawTree, bush, hedge, forestEdge, building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower, billboard,
        sponsorHoarding, place, ridge, groundPatch,
        modelGroup, vadd, MAT, seat, indexSolid, overheadSpan, addBox, addCyl,
        bakedModel } = api;

      const { K } = api;

      const { drape } = api;

      const LEAF      = [0.19, 0.37, 0.17];
      const LEAF_D    = [0.13, 0.27, 0.14];
      const LEAF_L    = [0.26, 0.44, 0.20];
      const LEAF_M    = [0.22, 0.40, 0.18];
      const LEAF_Y    = [0.33, 0.49, 0.21];
      const LEAF_B    = [0.16, 0.33, 0.20];
      const BAMBOO    = [0.41, 0.53, 0.22];
      const BAMBOO_D  = [0.34, 0.46, 0.21];
      const CEDAR     = [0.12, 0.24, 0.18];
      const SCRUB     = [0.22, 0.34, 0.18];
      const SCRUB_L   = [0.28, 0.40, 0.20];
      const GRASS     = [0.30, 0.44, 0.22];
      const GRASS_D   = [0.25, 0.38, 0.20];
      const CLAY      = [0.69, 0.61, 0.48];
      const CLAY_D    = [0.57, 0.49, 0.38];
      const CLAY_L    = [0.77, 0.70, 0.56];
      const CLAY_R    = [0.64, 0.52, 0.39];
      const SOIL      = [0.45, 0.38, 0.30];
      const ARMCO     = [0.80, 0.80, 0.82];
      const CLUB_WALL = [0.86, 0.86, 0.84];
      const WALL_CREAM= [0.88, 0.85, 0.76];
      const WALL_BEIGE= [0.80, 0.77, 0.70];
      const WALL_GREY = [0.72, 0.73, 0.75];
      const CLUB_ROOF = [0.34, 0.40, 0.46];
      const ROOF_BLUE = [0.25, 0.34, 0.48];
      const ROOF_GRN  = [0.23, 0.36, 0.30];
      const ROOF_RED  = [0.50, 0.26, 0.22];
      const ROOF_TIN  = [0.55, 0.57, 0.58];
      const STEEL     = [0.62, 0.64, 0.66];
      const CONC      = [0.66, 0.65, 0.62];
      const APRON     = [0.40, 0.40, 0.42];
      const APRON_L   = [0.46, 0.46, 0.47];
      const SHUTTER   = [[0.74, 0.20, 0.18], [0.20, 0.36, 0.64], [0.86, 0.72, 0.18],
                         [0.22, 0.50, 0.32], [0.82, 0.82, 0.84], [0.56, 0.24, 0.52]];
      const CRATE     = [[0.68, 0.30, 0.22], [0.26, 0.42, 0.56], [0.72, 0.68, 0.30],
                         [0.40, 0.52, 0.40], [0.78, 0.78, 0.76]];
      const CAR       = [[0.78, 0.78, 0.80], [0.16, 0.18, 0.22], [0.58, 0.16, 0.16],
                         [0.20, 0.34, 0.56], [0.64, 0.64, 0.66], [0.30, 0.44, 0.34]];
      const CANOPY    = [LEAF, LEAF_D, LEAF_M, LEAF_L, LEAF_B, LEAF_Y, LEAF_M, LEAF_D];
      const tree = (k, side, dist, h, col) =>
        col === CEDAR ? rawTree(k, side, dist, h, col)
          : rawTree(k, side, dist, h, col,
              col === BAMBOO || col === BAMBOO_D ? { crown: "columnar" }
                : { crown: "lobed", maxDetailed: 40 });

      const headingAt = (k, side, dist) => {
        const a = anchor(k, side, dist), b = anchor((k + 4) % n, side, dist);
        return Math.atan2(b.c[0] - a.c[0], b.c[2] - a.c[2]);
      };
      const hill = (s, side, dist, len, w, h, col) => {
        const k = K(s), a = anchor(k, side, Math.max(dist, 62) + w * 0.5 + h);
        ridge(a.c[0], a.c[2], a.c[1], headingAt(k, side, dist), len, w, h,
          col || [0.28, 0.40, 0.23]);
      };
      const clayCut = (s0, s1, side, gap, h, col, col2) =>
        spectatorHill(s0, s1, side, gap,
          { grass: col || CLAY, riser: col2 || col || CLAY });

      const clear = (k, side, dist, pad) => {
        const a = anchor(k, side, dist);
        return Number.isFinite(a.c[0]) && Number.isFinite(a.c[2]) &&
          !onTrack(a.c[0], a.c[2], pad == null ? 6 : pad);
      };
      const pad = (s, side, dist, dims, col, res, h) => {
        const k = K(s);
        if (!clear(k, side, dist, 5)) return;
        drape(k, side, dist - dims[0] / 2, dims, col, { res, phase: 0, h });
      };
      const box = (s, side, dist, dims, col) => {
        const k = K(s);
        if (!clear(k, side, dist, 5)) return;
        place(k, side, dist, dims, col);
      };
      const bld = (s, side, dist, w, h, d, col, roof, floors) => {
        const k = K(s);
        if (!clear(k, side, dist, 7) || !clear(k, side, dist + w * 0.5, 7)) return;
        const a = anchor(k, side, dist);
        const gy = terrainYAt(a.c[0], a.c[2]);
        if (gy != null && a.c[1] < gy - 0.25) return;
        building(k, side, dist, w, h, d,
          { col: col, roof: roof, floors: floors == null ? 1 : floors });
      };
      const hut = (s, side, dist, roof) =>
        bld(s, side, dist, 4.5, 3.0, 3.2, WALL_BEIGE, roof || ROOF_TIN, 1);
      const safeBox = (s, side, dist, dims, col) => {
        const k = K(s);
        if (!clear(k, side, dist, 6)) return;
        place(k, side, dist, dims, col);
      };
      const inBuilt = (s) =>
        (s < 0.075 || s > 0.975) || (s > 0.185 && s < 0.265) || (s > 0.850 && s < 0.955);

      for (const side of [-1, 1]) {
        guardrail(0.0, 1.0, side, 4, ARMCO);
        fence(0.0, 1.0, side, 7.5, 2.0, [0.46, 0.48, 0.44]);
      }

      const HILLS = { "-1": [[0.996, 0.018], [0.051, 0.074], [0.094, 0.146],
                             [0.316, 0.362], [0.600, 0.658], [0.894, 0.934]],
                      "1":  [[0.290, 0.332]] };
      const onHill = (s, side) => HILLS[side].some(([a, b]) =>
        a <= b ? (s >= a && s <= b) : (s >= a || s <= b));
      every(16, (k) => {
        const s = k / n;
        for (const side of [-1, 1]) {
          if (side > 0 && inBuilt(s)) continue;
          if (onHill(s, side)) continue;
          const h = hash(k * 29 + (side < 0 ? 101 : 211));
          if (h < 0.22) continue;
          const ranks = h > 0.86 ? 3 : 2;
          for (let r = 0; r < ranks; r++) {
            const hr = hash(k * 7 + r * 53 + (side < 0 ? 13 : 71));
            const dist = 12 + r * 8.5 + hr * 4.5;
            const a = anchor(k, side, dist);
            if (!Number.isFinite(a.c[0]) || !Number.isFinite(a.c[2])) continue;
            if (onTrack(a.c[0], a.c[2], 6)) continue;
            const gy = terrainYAt(a.c[0], a.c[2]);
            if (gy == null || Math.abs(a.c[1] - gy) > 0.55) continue;
            const bam = hr > 0.82;
            const sugi = !bam && hr > 0.78;
            tree(k, side, dist,
              bam ? 9 + hr * 5 : (sugi ? 13 + hr * 6 : 7.5 + hr * 6.5),
              bam ? (hr > 0.92 ? BAMBOO_D : BAMBOO)
                  : (sugi ? CEDAR
                          : CANOPY[(((k * 3 + r * 5 + (side < 0 ? 0 : 4)) % 8) + 8) % 8]));
          }
        }
      });

      forestEdge(0.206, 0.262, -1, 29, { col: LEAF_B, col2: LEAF_B, hMin: 13, hMax: 18, pineFrac: 0.12 });
      forestEdge(0.372, 0.442, -1, 29, { col: LEAF_M, col2: LEAF_M, hMin: 13, hMax: 18, pineFrac: 0.12 });

      sponsorHoarding(0.982, 0.062, 1, 6, { h: 1.15 });
      marshalPost(K(0.060), 1, 7);
      indexSolid(0.985, 0.070, 1, 8, 28);
      {
        const BAYS = 14, PITCH = 4.4, LEN = BAYS * PITCH;
        const a = anchor(K(0.018), 1, 11);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.12);
        const b = [a.r, a.u, a.t];
        modelGroup("okayama-pit-garages", {
          center: vadd(foot, a.u, 4.2), size: [18, 14, LEN + 8], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, foot, [11, 7.2, LEN], CLUB_WALL, b);
          stage._mat = MAT.GLASS;
          seat.box(stage, vadd(vadd(foot, a.r, -5.6), a.u, 4.4),
            [0.3, 2.2, LEN - 4], [0.22, 0.30, 0.40], b);
          stage._mat = MAT.METAL;
          for (let i = 0; i < BAYS; i++) {
            const p = vadd(vadd(foot, a.t, (i - (BAYS - 1) / 2) * PITCH), a.r, -5.55);
            seat.box(stage, vadd(p, a.u, 0.25), [0.28, 3.8, 3.6],
              SHUTTER[i % SHUTTER.length], b);
          }
          seat.box(stage, vadd(foot, a.u, 7.2), [12.2, 0.4, LEN + 1.5], CLUB_ROOF, b);
          const annex = vadd(foot, a.t, LEN * 0.48);
          stage._mat = MAT.CONCRETE;
          seat.box(stage, annex, [8.0, 9.6, 6.0], WALL_GREY, b);
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(annex, a.u, 9.6), [8.6, 0.35, 6.5], ROOF_BLUE, b);
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.048), 1, 18);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.12);
        const b = [a.r, a.u, a.t];
        modelGroup("okayama-control-tower", {
          center: vadd(foot, a.u, 10), size: [16, 28, 16], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, foot, [10, 17, 10], CLUB_WALL, b);
          stage._mat = MAT.GLASS;
          seat.box(stage, vadd(vadd(foot, a.r, -5.15), a.u, 10.8),
            [0.35, 2.6, 8.4], [0.20, 0.28, 0.38], b);
          stage._mat = MAT.CONCRETE;
          for (let f = 1; f <= 3; f++)
            seat.box(stage, vadd(vadd(foot, a.r, -5.05), a.u, f * 4.0),
              [0.25, 0.35, 9.2], WALL_GREY, b);
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(foot, a.u, 17.0), [11.2, 0.45, 11.2], CLUB_ROOF, b);
          seat.box(stage, vadd(vadd(foot, a.r, -5.3), a.u, 17.45),
            [0.3, 0.95, 10.5], STEEL, b);
          addCyl(stage, vadd(vadd(foot, a.t, 3.5), a.u, 17.45), 0.12, 6.5,
            [0.78, 0.78, 0.80], 5, b);
          stage._mat = 0;
        }, { required: true });
      }
      overheadSpan({
        id: "okayama-dunlop-bridge", frac: 0.048,
        clearance: 5.8, thickness: 0.85, depth: 3.2, supportGap: 3.5,
        color: CONC, supportColor: WALL_GREY, soffitColor: [0.10, 0.10, 0.12],
        required: true,
      });
      for (let i = 0; i < 6; i++)
        pad(0.006 + i * 0.010, 1, 22, [26, 0.08, 22], i & 1 ? APRON_L : APRON, 0);
      cameraTower(K(0.0660), 1, 14);
      for (let i = 0; i < 5; i++)
        safeBox(0.020 + i * 0.0085, 1, 6.8, [1.6, 1.1, 0.9],
          i & 1 ? [0.82, 0.82, 0.84] : [0.30, 0.32, 0.36]);
      for (let i = 0; i < 4; i++)
        safeBox(0.0240 + i * 0.0095, 1, 19.5, [2.2, 1.3, 2.2], [0.12, 0.12, 0.13]);
      for (let i = 0; i < 6; i++)
        safeBox(0.0180 + i * 0.0090, 1, 34, [4.3, 1.4, 1.9], CAR[i % CAR.length]);
      billboard(K(0.0300), 1, 12, 7, 2.4, [0.86, 0.20, 0.18]);
      billboard(K(0.0550), 1, 13, 7, 2.4, [0.18, 0.34, 0.66]);
      hedge(0.012, 0.060, 1, 36, 1.4, SCRUB);

      grandstandEx(0.015, -1, 10, 80, null, null);
      forestEdge(0.985, 0.075, -1, 30, { col: LEAF, col2: LEAF, hMin: 7, hMax: 12, pineFrac: 0.12 });
      hill(0.030, -1, 62, 150, 34, 14, [0.27, 0.39, 0.22]);
      hill(0.010, -1, 62, 120, 26, 11, [0.29, 0.41, 0.23]);
      billboard(K(0.050), -1, 10, 9, 3.2, [0.78, 0.20, 0.18]);
      sponsorHoarding(0.996, 0.046, -1, 8, { h: 1.3 });
      bld(0.0330, -1, 26, 10.0, 9.0, 7.0, WALL_CREAM, ROOF_BLUE, 3);
      bld(0.0080, -1, 24, 7.0, 4.0, 5.0, WALL_BEIGE, ROOF_GRN, 1);
      box(0.0430, -1, 12.1, [0.6, 5.0, 9.0], [0.14, 0.15, 0.17]);
      billboard(K(0.0430), -1, 12, 8, 3.4, [0.95, 0.95, 0.92]);
      spectatorHill(0.000, 0.014, -1, 10, { h: 3.6, col: GRASS, steps: 2 });
      spectatorHill(0.055, 0.070, -1, 10, { h: 3.6, col: GRASS_D, steps: 2 });
      for (let i = 0; i < 4; i++)
        box(0.0180 + i * 0.0110, -1, 21, [6.5, 2.8, 6.0],
          i & 1 ? [0.90, 0.90, 0.88] : [0.84, 0.86, 0.88]);

      guardrail(0.068, 0.118, -1, 5, ARMCO);
      forestEdge(0.068, 0.120, -1, 9, { col: LEAF_D, col2: LEAF_D, hMin: 8, hMax: 13, pineFrac: 0.12 });
      forestEdge(0.066, 0.122, -1, 26, { col: LEAF_B, col2: LEAF_B, hMin: 12, hMax: 17, pineFrac: 0.12 });
      hill(0.090, -1, 62, 130, 30, 15, [0.26, 0.38, 0.22]);
      hill(0.076, -1, 62, 110, 24, 19, [0.24, 0.36, 0.21]);
      marshalPost(K(0.0800), -1, 8);
      hut(0.0800, -1, 12, ROOF_GRN);

      tyreWall(0.104, 0.136, -1, 5, [0.84, 0.78, 0.22]);
      clayCut(0.100, 0.140, -1, 9, 6.5, CLAY, CLAY_R);
      spectatorHill(0.098, 0.142, -1, 21, { h: 9.5, col: CLAY_L, steps: 2 });
      cameraTower(K(0.1172), -1, 15);
      cameraTower(K(0.1080), -1, 17);
      hill(0.1172, -1, 62, 120, 28, 16, [0.25, 0.37, 0.21]);
      forestEdge(0.096, 0.146, -1, 33, { col: LEAF_D, col2: LEAF_D, hMin: 13, hMax: 18, pineFrac: 0.12 });
      bld(0.1220, -1, 20, 5.5, 4.5, 4.0, WALL_GREY, ROOF_TIN, 1);
      pad(0.1220, -1, 18.5, [3.0, 0.3, 5.0], STEEL, 0, 0.3);
      for (let i = 0; i < 6; i++)
        box(0.1055 + i * 0.0055, -1, 11.5, [1.8, 1.2, 1.8],
          i % 3 === 0 ? [0.86, 0.30, 0.16] : (i & 1 ? [0.14, 0.14, 0.15] : [0.84, 0.78, 0.22]));
      for (let i = 0; i < 7; i++) {
        const s = 0.104 + (i / 6) * 0.032, hh = hash(i * 61 + 9);
        bush(K(s), -1, 16 + hh * 2.5, hh > 0.6 ? SCRUB_L : SCRUB);
        tree(K(s), -1, 19 + hh * 6, 8 + hh * 5, hh > 0.6 ? BAMBOO : LEAF);
      }

      marshalPost(K(0.1172), 1, 9);
      billboard(K(0.126), 1, 9, 8, 3.0, [0.16, 0.32, 0.62]);
      for (let i = 0; i < 5; i++)
        pad(0.110 + i * 0.004, 1, 12.5, [7, 0.07, 7], i & 1 ? CLAY : CLAY_D, 0.09);
      for (let i = 0; i < 3; i++)
        pad(0.1105 + i * 0.0060, 1, 15.5, [6.0, 0.06, 6.0], i & 1 ? CLAY_L : CLAY, 0.06);
      hut(0.1140, 1, 14, ROOF_BLUE);
      sponsorHoarding(0.112, 0.130, 1, 13, { h: 1.3 });
      hedge(0.100, 0.1125, 1, 21, 1.5, SCRUB);

      guardrail(0.145, 0.200, -1, 4, ARMCO);
      forestEdge(0.145, 0.200, -1, 7, { col: LEAF_D, col2: LEAF_D, hMin: 9, hMax: 14, pineFrac: 0.12 });
      forestEdge(0.145, 0.200, -1, 19, { col: LEAF, col2: LEAF, hMin: 11, hMax: 16, pineFrac: 0.12 });
      forestEdge(0.143, 0.202, -1, 31, { col: LEAF_B, col2: LEAF_B, hMin: 14, hMax: 19, pineFrac: 0.12 });
      hedge(0.148, 0.198, -1, 6.4, 1.5, SCRUB);
      bld(0.1760, -1, 27, 8.0, 4.2, 12.0, WALL_BEIGE, ROOF_TIN, 1);
      safeBox(0.1830, -1, 27, [5.0, 2.6, 2.6], CRATE[1]);
      marshalPost(K(0.1560), -1, 7);
      for (let i = 0; i < 10; i++) {
        const s = 0.145 + (i / 9) * 0.055, hh = hash(i * 37 + 5);
        tree(K(s), -1, 12 + hh * 3, 9 + hh * 6, hh > 0.7 ? BAMBOO : LEAF_D);
      }

      indexSolid(0.190, 0.255, 1, 10, 36);
      {
        const a = anchor(K(0.214), 1, 18);
        const foot = a.c.slice();
        const gy = terrainYAt(foot[0], foot[2]);
        if (gy != null) foot[1] = Math.max(foot[1], gy - 0.12);
        const b = [a.r, a.u, a.t];
        modelGroup("okayama-paddock-block", {
          center: vadd(foot, a.u, 4.5), size: [28, 14, 52], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, foot, [14, 7.0, 18], CLUB_WALL, b);
          seat.box(stage, vadd(vadd(foot, a.t, 20), a.r, 1.2),
            [12, 5.5, 14], WALL_CREAM, b);
          stage._mat = MAT.GLASS;
          seat.box(stage, vadd(vadd(foot, a.r, -7.1), a.u, 3.8),
            [0.3, 2.4, 14], [0.22, 0.30, 0.40], b);
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(foot, a.u, 7.0), [15.2, 0.4, 19], CLUB_ROOF, b);
          seat.box(stage, vadd(vadd(vadd(foot, a.t, 20), a.r, 1.2), a.u, 5.5),
            [13.0, 0.35, 15], ROOF_RED, b);
          stage._mat = MAT.CONCRETE;
          seat.box(stage, vadd(foot, a.t, -16), [8.0, 3.8, 8.0], WALL_GREY, b);
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(vadd(foot, a.t, -16), a.u, 3.8),
            [8.6, 0.3, 8.5], ROOF_GRN, b);
          stage._mat = 0;
        }, { required: true });
      }
      for (let i = 0; i < 4; i++)
        pad(0.2000 + i * 0.008, 1, 28, [22, 0.08, 20], APRON, 0);
      for (let i = 0; i < 5; i++) {
        safeBox(0.1955 + i * 0.0090, 1, 26, [3.4, 3.2, 11.5],
          i & 1 ? [0.78, 0.78, 0.80] : [0.70, 0.72, 0.76]);
        safeBox(0.1955 + i * 0.0090, 1, 31, [9.0, 2.6, 2.6], [0.74, 0.76, 0.80]);
      }
      bld(0.1900, 1, 20, 9.0, 4.6, 7.0, WALL_CREAM, ROOF_BLUE, 1);
      for (let i = 0; i < 5; i++)
        safeBox(0.2020 + i * 0.0085, 1, 42, [6.1, 2.6, 2.5], CRATE[i % CRATE.length]);
      for (let i = 0; i < 8; i++)
        safeBox(0.2230 + (i >> 1) * 0.0090, 1, (i & 1) ? 35 : 40.5,
          [4.3, 1.4, 1.9], CAR[(i * 3) % CAR.length]);
      pad(0.2260, 1, 38, [26, 0.07, 22], APRON_L, 0.03);
      sponsorHoarding(0.196, 0.222, 1, 14, { h: 1.5 });
      billboard(K(0.2330), 1, 14, 8, 3.0, [0.90, 0.56, 0.16]);
      hedge(0.190, 0.252, 1, 34, 1.7, SCRUB_L);
      fence(0.190, 0.252, 1, 22, 2.4, [0.50, 0.52, 0.48]);
      forestEdge(0.194, 0.248, 1, 50, { col: LEAF_M, col2: LEAF_M, hMin: 12, hMax: 17, pineFrac: 0.12 });
      marshalPost(K(0.2420), 1, 14);
      for (let i = 0; i < 9; i++) {
        const s = 0.192 + (i / 8) * 0.050, hh = hash(i * 23 + 77);
        tree(K(s), 1, 8 + hh * 2.0, 7 + hh * 3.5, hh > 0.7 ? LEAF_B : LEAF);
        if (hh > 0.5) bush(K(s), 1, 6.5, SCRUB);
      }

      guardrail(0.270, 0.300, -1, 4, ARMCO);
      forestEdge(0.270, 0.300, -1, 6, { col: LEAF_D, col2: LEAF_D, hMin: 10, hMax: 15, pineFrac: 0.12 });
      forestEdge(0.270, 0.300, -1, 18, { col: LEAF, col2: LEAF, hMin: 12, hMax: 17, pineFrac: 0.12 });
      forestEdge(0.266, 0.304, -1, 30, { col: LEAF_D, col2: LEAF_D, hMin: 15, hMax: 20, pineFrac: 0.12 });
      marshalPost(K(0.2928), -1, 7);
      hut(0.2870, -1, 11, ROOF_GRN);
      for (let i = 0; i < 8; i++) {
        const s = 0.270 + (i / 7) * 0.030, hh = hash(i * 43 + 19);
        if (Math.abs(s - 0.2928) > 0.004) bush(K(s), -1, 6.5 + hh, LEAF_D);
        tree(K(s), -1, 9 + hh * 3, 10 + hh * 6, hh > 0.85 ? CEDAR : LEAF_D);
      }

      spectatorHill(0.296, 0.326, 1, 9, { h: 4.5, col: GRASS });
      spectatorHill(0.294, 0.328, 1, 17, { h: 7.5, col: GRASS_D, steps: 3 });
      hedge(0.296, 0.326, 1, 7, 1.3, SCRUB);
      fence(0.294, 0.328, 1, 15, 1.2, [0.52, 0.54, 0.50]);
      for (let i = 0; i < 6; i++)
        bush(K(i < 3 ? 0.2880 + i * 0.0025 : 0.3335 + (i - 3) * 0.0025), 1,
          7.5 + hash(i * 11 + 3) * 1.5, SCRUB);
      billboard(K(0.3130), 1, 9, 9, 3.2, [0.90, 0.84, 0.20]);
      billboard(K(0.2990), 1, 9, 7, 2.6, [0.20, 0.52, 0.30]);
      for (let i = 0; i < 3; i++)
        bld(0.2995 + i * 0.0085, 1, 25, 5.0, 3.0, 4.0,
          i & 1 ? WALL_CREAM : [0.90, 0.90, 0.88], i & 1 ? ROOF_RED : ROOF_BLUE, 1);
      forestEdge(0.290, 0.332, 1, 34, { col: LEAF_M, col2: LEAF_M, hMin: 11, hMax: 16, pineFrac: 0.12 });
      marshalPost(K(0.3300), 1, 10);

      tyreWall(0.322, 0.356, -1, 6, [0.86, 0.30, 0.16]);
      clayCut(0.320, 0.358, -1, 10, 7.0, CLAY, CLAY_R);
      spectatorHill(0.324, 0.354, -1, 18, { h: 8.0, col: GRASS, steps: 3 });
      spectatorHill(0.322, 0.356, -1, 28, { h: 11.5, col: SOIL, steps: 2 });
      forestEdge(0.318, 0.360, -1, 38, { col: BAMBOO_D, col2: BAMBOO_D, hMin: 9, hMax: 14, pineFrac: 0.12 });
      forestEdge(0.316, 0.362, -1, 50, { col: LEAF_D, col2: LEAF_D, hMin: 14, hMax: 19, pineFrac: 0.12 });
      cameraTower(K(0.3372), -1, 14);
      for (let i = 0; i < 5; i++)
        box(0.3245 + i * 0.0060, -1, 12.5, [1.8, 1.2, 1.8],
          i & 1 ? [0.14, 0.14, 0.15] : [0.86, 0.30, 0.16]);
      hut(0.3480, -1, 12, ROOF_TIN);
      marshalPost(K(0.3480), -1, 8);

      marshalPost(K(0.3992), 1, 11);
      sponsorHoarding(0.386, 0.414, 1, 11, { h: 1.4 });
      forestEdge(0.380, 0.424, 1, 16, { col: LEAF, col2: LEAF, hMin: 9, hMax: 14, pineFrac: 0.12 });
      forestEdge(0.376, 0.428, 1, 28, { col: LEAF_B, col2: LEAF_B, hMin: 13, hMax: 18, pineFrac: 0.12 });
      bld(0.4080, 1, 21, 6.0, 3.6, 5.0, WALL_GREY, ROOF_GRN, 1);
      box(0.4130, 1, 22, [2.4, 3.2, 2.4], STEEL);
      billboard(K(0.3890), 1, 12, 8, 3.0, [0.84, 0.20, 0.30]);
      hut(0.3930, 1, 15, ROOF_RED);
      for (let i = 0; i < 10; i++) {
        const s = 0.378 + (i / 9) * 0.048, hh = hash(i * 13 + 41);
        tree(K(s), 1, 14 + hh * 6, 9 + hh * 6, hh > 0.75 ? BAMBOO : LEAF);
        if (hh > 0.6) bush(K(s), 1, 12 + hh * 2, hh > 0.8 ? SCRUB_L : SCRUB);
      }

      forestEdge(0.440, 0.620, -1, 9, { col: LEAF, col2: LEAF, hMin: 9, hMax: 14, pineFrac: 0.12 });
      forestEdge(0.440, 0.620, 1, 10, { col: LEAF_L, col2: LEAF_L, hMin: 8, hMax: 13, pineFrac: 0.12 });
      forestEdge(0.468, 0.600, -1, 25, { col: LEAF_B, col2: LEAF_B, hMin: 13, hMax: 18, pineFrac: 0.12 });
      hill(0.4552, -1, 62, 140, 30, 16, [0.27, 0.39, 0.22]);
      hill(0.5200, -1, 62, 150, 32, 20, [0.25, 0.37, 0.21]);
      hill(0.5900, -1, 62, 140, 30, 24, [0.24, 0.36, 0.21]);
      hill(0.5550, -1, 62, 120, 24, 14, [0.28, 0.40, 0.23]);
      hill(0.4850, -1, 62, 130, 28, 18, [0.26, 0.38, 0.22]);
      hill(0.6100, -1, 62, 130, 28, 26, [0.23, 0.35, 0.20]);
      marshalPost(K(0.5100), -1, 9);
      marshalPost(K(0.5700), 1, 9);
      hut(0.5100, -1, 13, ROOF_TIN);
      hut(0.5700, 1, 13, ROOF_GRN);
      bld(0.5400, -1, 22, 5.0, 3.2, 4.0, WALL_BEIGE, ROOF_TIN, 1);
      box(0.5430, -1, 23, [2.0, 2.4, 2.0], CONC);
      billboard(K(0.4900), -1, 10, 8, 3.0, [0.22, 0.44, 0.72]);
      billboard(K(0.5980), 1, 10, 8, 3.0, [0.88, 0.80, 0.22]);
      for (let i = 0; i < 14; i++) {
        const s = 0.440 + (i / 13) * 0.180, hh = hash(i * 19 + 7);
        if (s < 0.610) bush(K(s), -1, 6.5 + hh * 2, hh > 0.7 ? SCRUB_L : SCRUB);
        if (Math.abs(s - 0.6220) > 0.004) bush(K(s), 1, 7 + hh * 2, LEAF_D);
        tree(K(s), hh > 0.5 ? 1 : -1, 8 + hh * 4, 9 + hh * 7,
          hh > 0.88 ? CEDAR : (hh > 0.82 ? BAMBOO : LEAF_D));
      }

      tyreWall(0.618, 0.650, -1, 5, [0.84, 0.78, 0.22]);
      clayCut(0.614, 0.654, -1, 9, 6.0, CLAY, CLAY_R);
      grandstandEx(0.6322, -1, 20, 55, null, null);
      grandstandEx(0.6560, -1, 18, 34, null, null);
      spectatorHill(0.604, 0.616, -1, 18, { h: 6.5, col: GRASS_D, steps: 2 });
      cameraTower(K(0.6450), -1, 18);
      hill(0.6322, -1, 62, 120, 28, 20, [0.24, 0.36, 0.21]);
      hill(0.6480, -1, 62, 130, 30, 24, [0.23, 0.35, 0.20]);
      forestEdge(0.606, 0.664, -1, 34, { col: BAMBOO_D, col2: BAMBOO_D, hMin: 10, hMax: 15, pineFrac: 0.12 });
      forestEdge(0.614, 0.658, -1, 47, { col: LEAF_D, col2: LEAF_D, hMin: 15, hMax: 20, pineFrac: 0.12 });
      sponsorHoarding(0.626, 0.648, -1, 13, { h: 1.4 });
      bld(0.6380, -1, 30, 7.0, 4.0, 5.5, WALL_CREAM, ROOF_BLUE, 1);
      marshalPost(K(0.6220), 1, 8);
      hut(0.6280, 1, 14, ROOF_RED);
      billboard(K(0.6400), 1, 10, 8, 3.0, [0.94, 0.94, 0.90]);
      for (let i = 0; i < 5; i++)
        pad(0.6280 + i * 0.004, 1, 9, [7, 0.07, 7], i & 1 ? CLAY_D : CLAY, 0.09);
      for (let i = 0; i < 3; i++)
        pad(0.6300 + i * 0.0055, 1, 15.5, [6.0, 0.06, 6.0], i & 1 ? CLAY_L : CLAY, 0.06);
      for (let i = 0; i < 5; i++)
        box(0.6210 + i * 0.0060, -1, 11.5, [1.8, 1.2, 1.8],
          i & 1 ? [0.14, 0.14, 0.15] : [0.84, 0.78, 0.22]);
      for (let i = 0; i < 8; i++) {
        const s = 0.616 + (i / 7) * 0.038, hh = hash(i * 59 + 23);
        tree(K(s), -1, 32 + hh * 6, 10 + hh * 5, hh > 0.6 ? BAMBOO : LEAF);
        if (Math.abs(s - 0.6220) > 0.004) bush(K(s), 1, 6.5 + hh * 2, SCRUB);
      }

      marshalPost(K(0.6937), 1, 10);
      guardrail(0.665, 0.760, 1, 4, ARMCO);
      guardrail(0.665, 0.760, -1, 4, ARMCO);
      forestEdge(0.665, 0.775, 1, 8, { col: LEAF_D, col2: LEAF_D, hMin: 9, hMax: 14, pineFrac: 0.12 });
      forestEdge(0.665, 0.775, -1, 7, { col: LEAF_D, col2: LEAF_D, hMin: 10, hMax: 15, pineFrac: 0.12 });
      forestEdge(0.670, 0.762, -1, 22, { col: LEAF_B, col2: LEAF_B, hMin: 14, hMax: 19, pineFrac: 0.12 });
      hill(0.7400, -1, 62, 130, 28, 18, [0.26, 0.38, 0.22]);
      hut(0.6937, 1, 14, ROOF_TIN);
      billboard(K(0.7200), 1, 10, 8, 3.0, [0.84, 0.26, 0.20]);
      marshalPost(K(0.7500), -1, 9);
      for (let i = 0; i < 8; i++) {
        const s = 0.665 + (i / 7) * 0.110, hh = hash(i * 71 + 13);
        for (const side of [-1, 1]) {
          bush(K(s), side, 6.5 + hh * 1.5, LEAF_D);
          tree(K(s), side, 9 + hh * 3, 10 + hh * 6,
            hh > 0.78 ? BAMBOO : (side < 0 ? LEAF_D : LEAF));
        }
      }

      indexSolid(0.850, 0.950, 1, 6, 24);
      building(K(0.8678), 1, 10, 18, 5.5, 10,
        { col: CLUB_WALL, roof: CLUB_ROOF, floors: 1 });
      guardrail(0.850, 0.905, 1, 5, ARMCO);
      guardrail(0.850, 0.985, -1, 5, ARMCO);
      billboard(K(0.8820), 1, 11, 9, 3.2, [0.20, 0.56, 0.32]);
      marshalPost(K(0.9000), 1, 11);
      grandstandEx(0.930, -1, 12, 70, null, null);
      forestEdge(0.800, 0.930, -1, 8, { col: LEAF, col2: LEAF, hMin: 9, hMax: 14, pineFrac: 0.12 });
      forestEdge(0.800, 0.860, 1, 14, { col: LEAF_L, col2: LEAF_L, hMin: 8, hMax: 13, pineFrac: 0.12 });
      forestEdge(0.818, 0.922, -1, 25, { col: LEAF_B, col2: LEAF_B, hMin: 13, hMax: 18, pineFrac: 0.12 });
      hill(0.8678, -1, 62, 130, 30, 15, [0.27, 0.39, 0.22]);
      hill(0.8200, -1, 62, 140, 32, 19, [0.25, 0.37, 0.21]);
      hill(0.9200, -1, 62, 120, 26, 13, [0.28, 0.40, 0.23]);
      bld(0.8880, 1, 11, 10.0, 4.4, 8.0, WALL_BEIGE, ROOF_TIN, 1);
      bld(0.9080, 1, 12, 5.0, 3.2, 4.0, WALL_GREY, ROOF_GRN, 1);
      bld(0.9380, 1, 14, 8.0, 6.5, 6.0, WALL_CREAM, ROOF_BLUE, 2);
      fence(0.874, 0.948, 1, 20, 2.4, [0.50, 0.52, 0.48]);
      for (let i = 0; i < 4; i++)
        safeBox(0.8940 + i * 0.0090, 1, 24, [5.0, 2.5, 2.4], CRATE[(i + 2) % CRATE.length]);
      sponsorHoarding(0.908, 0.948, -1, 9, { h: 1.35 });
      spectatorHill(0.900, 0.928, -1, 11, { h: 5.0, col: GRASS, steps: 2 });
      spectatorHill(0.898, 0.930, -1, 20, { h: 8.0, col: GRASS_D, steps: 3 });
      billboard(K(0.9480), -1, 10, 9, 3.2, [0.92, 0.72, 0.18]);
      hut(0.8560, -1, 12, ROOF_RED);
      for (let i = 0; i < 7; i++) {
        const s = 0.790 + (i / 6) * 0.140, hh = hash(i * 47 + 29);
        if (s > 0.894 && s < 0.934) continue;
        bush(K(s), -1, 6.5 + hh * 2, hh > 0.7 ? SCRUB_L : SCRUB);
        tree(K(s), -1, 11 + hh * 4, 9 + hh * 6, hh > 0.8 ? BAMBOO : LEAF);
      }

      for (const s of [0.01, 0.025, 0.04]) bakedModel("k_tentlong", K(s), 1, 48, { scale: 2.4 });
      for (const [s, side, dist] of [
        [0.048, 1, 28], [0.1172, 1, 16], [0.2107, 1, 20], [0.6937, 1, 16], [0.8678, 1, 16],
      ]) bakedModel("k_camera_exclusive", K(s), side, dist, { scale: 3 });
  };
