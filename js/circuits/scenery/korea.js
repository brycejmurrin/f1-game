"use strict";
(window.TrackScenery = window.TrackScenery || {})["korea"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        bush, guardrail, tyreWall, marshalPost, cameraTower, broadcastCompound,
        grandstandEx, sponsorHoarding, billboard, building, motorhome, tower,
        groundPatch, runoffApron, waterBand, fence,
        place, prop, backdrop, modelGroup, overheadSpan, vadd, seat, MAT } = api;

      const { K } = api;

      const RAIL      = [0.80, 0.81, 0.83];
      const APRON     = [0.40, 0.41, 0.42];
      const FILL      = [0.52, 0.51, 0.45];
      const SALT      = [0.47, 0.49, 0.39];
      const SCRUB     = [0.37, 0.41, 0.31];
      const SHELL     = [0.61, 0.61, 0.59];
      const SHELL_D   = [0.53, 0.53, 0.52];
      const SHELL_F   = [0.58, 0.58, 0.58];
      const PALE      = [0.84, 0.85, 0.85];
      const STEEL     = [0.72, 0.74, 0.76];
      const SEAWALL   = [0.58, 0.57, 0.54];
      const RIPRAP    = [0.49, 0.48, 0.46];
      const ESTUARY   = [0.38, 0.44, 0.46];
      const MESH      = [0.63, 0.65, 0.65];
      const LOT       = [0.45, 0.45, 0.46];
      const TYRE_R    = [0.86, 0.24, 0.20];
      const TYRE_K    = [0.20, 0.22, 0.26];

      every(64, (k) => {
        const h = hash(k * 17 + 3);
        if (h < 0.42) return;
        const f = k / n;
        const side = h < 0.71 ? -1 : 1;
        if (side === 1 && f > 0.15 && f < 0.24) return;
        if (side === -1 && f > 0.03 && f < 0.04) return;
        if (side === -1 && f > 0.28 && f < 0.34) return;
        if (side === -1 && f > 0.38 && f < 0.49) return;
        if (side === 1 && f > 0.87 && f < 0.94) return;
        const bare = f > 0.60 && f < 0.95 ? h < 0.80 : h < 0.58;
        groundPatch(k, side, 16 + h * 26, [26 + h * 30, 0.28, 34 + h * 40],
          bare ? FILL : SALT, { samples: 4 });
      });

      guardrail(0.000, 0.061, -1, 13, RAIL);
      guardrail(0.067, 1.000, -1, 13, RAIL);
      guardrail(0.000, 0.291,  1, 15, RAIL);
      guardrail(0.308, 1.000,  1, 15, RAIL);

      guardrail(0.000, 0.040, -1, 5.5, RAIL);
      guardrail(0.962, 1.000, -1, 5.5, RAIL);
      {
        const a = anchor(K(0.005), -1, 12);
        const b = [a.r, a.u, a.t];
        const gy = typeof terrainYAt === "function" ? terrainYAt(a.c[0], a.c[2]) : null;
        const pad = [a.c[0], (gy == null ? a.c[1] : gy) + 0.12, a.c[2]];
        const emitPit = (stage) => {
          const BAYS = 8, PITCH = 22, LEN = BAYS * PITCH;
          stage._mat = MAT.CONCRETE;
          seat.box(stage, pad, [18, 0.45, LEN + 4], LOT, b);
          for (let i = 0; i < BAYS; i++) {
            const foot = vadd(pad, a.t, (i - (BAYS - 1) / 2) * PITCH);
            stage._mat = MAT.CONCRETE;
            seat.box(stage, vadd(foot, a.u, 0.45), [16, 6.4, PITCH - 1.2], PALE, b);
            stage._mat = MAT.METAL;
            seat.box(stage, vadd(foot, a.u, 6.95), [17.2, 0.35, PITCH - 0.4], STEEL, b);
            seat.box(stage, vadd(vadd(foot, a.r, 8.4), a.u, 1.0),
              [0.28, 5.0, PITCH - 3.0], [0.28, 0.30, 0.32], b);
          }
          stage._mat = 0;
        };
        modelGroup("korea-pit-complex", {
          center: vadd(pad, a.u, 5), size: [22, 14, 190], basis: b,
        }, emitPit, { required: true });
      }
      building(K(0.0524), -1, 12, 16, 7.0, 28, { wall: PALE });
      building(K(0.0577), -1, 14, 15, 6.4, 28, { wall: STEEL });
      groundPatch(K(0.010), -1, 44, [56, 0.28, 230], LOT, { samples: 4 });
      for (let i = 0; i < 6; i++) motorhome(K(0.968 + i * 0.011), -1, 40, 9, 4.2, 16);
      building(K(0.020), -1, 68, 18, 6.0, 74, { wall: STEEL });
      building(K(0.985), -1, 66, 16, 5.5, 52, { wall: STEEL });
      for (let i = 0; i < 7; i++) {
        const h = hash(i * 37 + 11);
        place(K(0.972 + i * 0.010), -1, 84 + h * 10, [12, 2.6 + (h < 0.4 ? 2.6 : 0), 6],
          h < 0.5 ? STEEL : SEAWALL);
      }
      fence(0.955, 1.000, -1, 98, 3.4, MESH);
      fence(0.000, 0.052, -1, 98, 3.4, MESH);
      cameraTower(K(0.0), -1, 15);
      marshalPost(K(0.012), -1, 16);

      {
        const a = anchor(K(0.020), 1, 22);
        const b = [a.r, a.u, a.t];
        const gy = typeof terrainYAt === "function" ? terrainYAt(a.c[0], a.c[2]) : null;
        const pad = [a.c[0], (gy == null ? a.c[1] : gy) + 0.12, a.c[2]];
        const LEN = 160, ROWS = 5;
        const emitStand = (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, pad, [14, 0.4, LEN + 4], LOT, b);
          for (let t = 0; t < ROWS; t++) {
            const lat = 1.2 + t * 1.55;
            const y = 0.55 + t * 1.15;
            stage._mat = MAT.CONCRETE;
            seat.box(stage, vadd(vadd(pad, a.r, lat), a.u, y),
              [1.4, 0.18, LEN - t * 1.2], STEEL, b);
            stage._mat = MAT.FABRIC;
            for (let j = 0; j < 14; j++) {
              const hj = hash(t * 41 + j * 13 + 7);
              if (hj < 0.55) continue;
              seat.box(stage, vadd(vadd(vadd(pad, a.r, lat), a.t,
                (j / 13 - 0.5) * (LEN - 10)), a.u, y + 0.2),
                [0.5, 0.9, 1.2],
                hj < 0.7 ? PALE : [0.22, 0.28, 0.40], b);
            }
          }
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(vadd(pad, a.r, 5.5), a.u, 8.2),
            [12, 0.45, LEN + 2], STEEL, b);
          for (let i = 0; i <= 8; i++) {
            const p = vadd(pad, a.t, (i / 8 - 0.5) * LEN);
            seat.cyl(stage, vadd(p, a.r, 10.5), 0.22, 8.2, STEEL, 6, b);
          }
          stage._mat = 0;
        };
        modelGroup("korea-main-grandstand", {
          center: vadd(pad, a.u, 5), size: [18, 14, LEN + 8], basis: b,
        }, emitStand, { required: true });
      }
      sponsorHoarding(0.002, 0.050, 1, 18);
      waterBand(0.0, 0.10, 1, 300, 640, 26, ESTUARY);
      place(K(0.020), 1, 70, [40, 6, 14], STEEL);
      for (let i = 0; i < 5; i++) {
        const h = hash(i * 29 + 5);
        place(K(0.002 + i * 0.012), 1, 82 + h * 8, [7, 3.2, 9], h < 0.5 ? PALE : STEEL);
      }
      fence(0.000, 0.058, 1, 96, 3.0, MESH);
      groundPatch(K(0.026), 1, 132, [150, 0.28, 190], LOT, { samples: 4 });
      groundPatch(K(0.026), 1, 210, [110, 0.28, 160], FILL, { samples: 4 });

      runoffApron(K(0.062), 1, 8, 78, APRON);
      runoffApron(K(0.075), 1, 8, 62, APRON);
      tyreWall(0.048, 0.086, 1, 36, TYRE_R);
      guardrail(0.046, 0.090, 1, 44, RAIL);
      fence(0.044, 0.092, 1, 50, 3.6, MESH);
      marshalPost(K(0.066), 1, 22);

      marshalPost(K(0.083), -1, 15);
      billboard(K(0.092), -1, 20, 14, 6, [0.86, 0.86, 0.84]);
      groundPatch(K(0.086), -1, 22, [70, 0.28, 90], SALT, { samples: 4 });
      groundPatch(K(0.104), -1, 40, [90, 0.28, 110], FILL, { samples: 4 });
      for (let i = 0; i < 5; i++) {
        const h = hash(i * 53 + 7);
        bush(K(0.070 + i * 0.009), -1, 17 + h * 16, SCRUB);
      }

      groundPatch(K(0.175), 1, 45, [130, 0.28, 150], SALT, { samples: 4 });
      groundPatch(K(0.205), 1, 48, [110, 0.28, 130], FILL, { samples: 4 });
      fence(0.130, 0.270, 1, 85, 2.4, MESH);
      tower(K(0.190), 1, 150, 3.2, 58);
      waterBand(0.13, 0.27, 1, 280, 640, 26, ESTUARY);

      cameraTower(K(0.282), 1, 24);
      runoffApron(K(0.296), 1, 9, 86, APRON);
      runoffApron(K(0.312), 1, 9, 64, APRON);
      grandstandEx(0.300, 1, 25, 96, null, null);
      tyreWall(0.262, 0.290, 1, 34, TYRE_R);
      tyreWall(0.310, 0.338, 1, 34, TYRE_R);
      guardrail(0.258, 0.288, 1, 44, RAIL);
      guardrail(0.309, 0.342, 1, 44, RAIL);
      fence(0.256, 0.286, 1, 46, 3.6, MESH);
      fence(0.314, 0.344, 1, 46, 3.6, MESH);
      marshalPost(K(0.292), 1, 28);

      broadcastCompound(K(0.306), -1, 18);
      marshalPost(K(0.316), -1, 16);
      groundPatch(K(0.306), -1, 26, [60, 0.28, 70], FILL, { samples: 4 });
      groundPatch(K(0.300), -1, 58, [64, 0.28, 80], LOT, { samples: 4 });
      for (let i = 0; i < 4; i++) {
        const h = hash(i * 41 + 13);
        place(K(0.288 + i * 0.012), -1, 50 + h * 12, [11, 3.4, 5], h < 0.5 ? PALE : STEEL);
      }

      for (const s of [0.395, 0.430, 0.468]) {
        marshalPost(K(s), -1, 18);
        groundPatch(K(s), -1, 24, [66, 0.28, 80], SALT, { samples: 4 });
      }
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 71 + 19);
        bush(K(0.386 + i * 0.0115), -1, 20 + h * 20, SCRUB);
      }
      backdrop(K(0.405), -1, 300, [120, 30, 24], SHELL_D);
      backdrop(K(0.440), -1, 300, [150, 34, 26], SHELL_D);
      backdrop(K(0.470), -1, 340, [120, 30, 24], SHELL_D);
      backdrop(K(0.452), -1, 430, [180, 26, 24], SHELL_F);

      guardrail(0.510, 0.600, 1, 33, RAIL);
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 23 + 5);
        prop(K(0.513 + i * 0.011), 1, 36, [10, 2.6 + h * 0.8, 58], SEAWALL);
      }
      fence(0.512, 0.598, 1, 41, 1.4, MESH);
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 23 + 31);
        prop(K(0.514 + i * 0.011), 1, 52 + h * 4, [9, 1.3 + (h < 0.5 ? 0.4 : 0), 56], RIPRAP);
      }
      tower(K(0.560), 1, 190, 1.8, 16);
      waterBand(0.49, 0.63, 1, 70, 460, 24, ESTUARY);

      grandstandEx(0.589, -1, 16, 58, null, null);
      sponsorHoarding(0.576, 0.604, -1, 13);
      marshalPost(K(0.600), -1, 17);
      groundPatch(K(0.589), -1, 40, [70, 0.28, 90], LOT, { samples: 4 });
      place(K(0.578), -1, 38, [6, 3.0, 8], STEEL);
      place(K(0.600), -1, 38, [6, 2.6, 7], PALE);
      fence(0.570, 0.612, -1, 48, 2.6, MESH);

      for (let i = 0; i < 9; i++) {
        const h = hash(i * 53 + 11);
        prop(K(0.632 + i * 0.0078), -1, 22 + h * 8,
          [13 + h * 5, 24 + h * 16, 28 + h * 8], i % 2 ? SHELL_D : SHELL);
      }
      {
        const a = anchor(K(0.663), -1, 52);
        const b = [a.r, a.u, a.t];
        const gy = typeof terrainYAt === "function" ? terrainYAt(a.c[0], a.c[2]) : null;
        const pad = [a.c[0], (gy == null ? a.c[1] : gy) + 0.1, a.c[2]];
        const emitShells = (stage) => {
          const grounded = (offR, offT) => {
            const p = vadd(vadd(pad, a.r, offR), a.t, offT);
            const y = typeof terrainYAt === "function" ? terrainYAt(p[0], p[2]) : null;
            return [p[0], (y == null ? pad[1] : y), p[2]];
          };
          stage._mat = MAT.CONCRETE;
          seat.box(stage, grounded(-20, 8), [12, 6.4, 28], SHELL, b);
          seat.box(stage, grounded(-18, 40), [11, 5.4, 24], SHELL_D, b);
          const slabs = [
            { t: -28, r: 6,  w: 16, h: 30, d: 14, col: SHELL },
            { t: 4,   r: 12, w: 15, h: 36, d: 13, col: SHELL_D },
            { t: 32,  r: 8,  w: 14, h: 32, d: 13, col: SHELL },
          ];
          for (const s of slabs) {
            const foot = grounded(s.r, s.t);
            seat.box(stage, foot, [s.w, s.h, s.d], s.col, b);
          }
          stage._mat = MAT.METAL;
          seat.cyl(stage, grounded(26, -12), 2.2, 44, SHELL_F, 6, b);
          seat.cyl(stage, grounded(30, 20), 2.0, 40, SHELL_D, 6, b);
          stage._mat = 0;
        };
        modelGroup("korea-marina-shells", {
          center: vadd(pad, a.u, 20), size: [56, 52, 100], basis: b,
        }, emitShells, { required: true });
      }
      for (let i = 0; i < 4; i++) {
        const h = hash(i * 61 + 23);
        place(K(0.632 + i * 0.022), -1, 96 + h * 28,
          [14 + h * 6, 28 + h * 14, 14 + h * 5], h < 0.5 ? SHELL_D : SHELL_F);
      }
      backdrop(K(0.665), -1, 260, [220, 38, 28], SHELL_F);
      groundPatch(K(0.663), -1, 64, [110, 0.28, 150], FILL, { samples: 4 });
      marshalPost(K(0.663), -1, 15);

      guardrail(0.700, 0.752, 1, 6, RAIL);
      tyreWall(0.700, 0.752, 1, 8.5, TYRE_K);
      fence(0.698, 0.754, 1, 11, 4.0, MESH);
      marshalPost(K(0.723), 1, 10);

      guardrail(0.735, 0.800, -1, 8, RAIL);
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 41 + 7);
        prop(K(0.738 + i * 0.0078), -1, 14 + h * 6,
          [12 + h * 5, 22 + h * 14, 26 + h * 8], i % 2 ? SHELL : SHELL_D);
      }
      prop(K(0.760), -1, 20, [13, 44, 13], SHELL);
      place(K(0.748), -1, 30, [16, 28, 16], SHELL);
      place(K(0.782), -1, 34, [14, 33, 15], SHELL_D);
      for (let i = 0; i < 4; i++) {
        const h = hash(i * 67 + 29);
        place(K(0.740 + i * 0.017), -1, 56 + h * 26,
          [15 + h * 7, 26 + h * 16, 15], h < 0.5 ? SHELL_D : SHELL_F);
      }
      prop(K(0.772), -1, 66, [8, 40, 8], SHELL_D);
      backdrop(K(0.768), -1, 250, [200, 34, 26], SHELL_F);

      tyreWall(0.778, 0.818, 1, 11, TYRE_K);
      sponsorHoarding(0.778, 0.818, 1, 12.5);
      guardrail(0.770, 0.826, 1, 9, RAIL);
      fence(0.768, 0.828, 1, 14, 4.0, MESH);
      waterBand(0.75, 0.85, 1, 90, 420, 24, ESTUARY);

      runoffApron(K(0.854), -1, 7, 26, APRON);
      runoffApron(K(0.874), -1, 8, 28, APRON);
      guardrail(0.846, 0.882, -1, 26, RAIL);
      fence(0.844, 0.884, -1, 31, 3.4, MESH);
      marshalPost(K(0.858), -1, 14);
      cameraTower(K(0.870), -1, 16);

      overheadSpan({
        id: "korea-final-span", frac: 0.885, clearance: 8.0,
        thickness: 1.1, depth: 4.2, supportGap: 2.6, supportWidth: 1.2,
        color: [0.78, 0.79, 0.80], required: true,
      });
      {
        const a = anchor(K(0.885), 1, 18);
        const b = [a.r, a.u, a.t];
        const gy = typeof terrainYAt === "function" ? terrainYAt(a.c[0], a.c[2]) : null;
        const pad = [a.c[0], (gy == null ? a.c[1] : gy) + 0.1, a.c[2]];
        const emitBridge = (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, pad, [10, 12, 14], PALE, b);
          stage._mat = MAT.METAL;
          seat.box(stage, vadd(pad, a.u, 12), [11, 0.4, 15], STEEL, b);
          seat.box(stage, vadd(vadd(pad, a.r, -5.2), a.u, 6),
            [0.3, 4.5, 8], [0.22, 0.24, 0.28], b);
          seat.box(stage, vadd(vadd(pad, a.r, -8), a.u, 8.2),
            [6, 0.35, 10], [0.78, 0.79, 0.80], b);
          stage._mat = 0;
        };
        modelGroup("korea-final-footbridge", {
          center: vadd(pad, a.u, 7), size: [18, 16, 20], basis: b,
        }, emitBridge, { required: true });
      }
      building(K(0.885), -1, 16, 11, 12, 14, { wall: PALE });
      billboard(K(0.890), 1, 20, 16, 6, PALE);
      groundPatch(K(0.900), 1, 38, [60, 0.28, 80], LOT, { samples: 4 });

      for (const s of [0.135, 0.225, 0.360, 0.500, 0.640, 0.940]) {
        const k = K(s);
        const a = anchor(k, 1, 17);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        marshalPost(k, 1, 17);
      }
  };
