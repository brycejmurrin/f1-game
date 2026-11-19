"use strict";
(window.TrackScenery = window.TrackScenery || {})["hockenheim"] =
  function (api) {
      const { K, lapBounds, out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, pine, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        sponsorHoarding, cameraTower, seat, forestEdge,
        addBox, addCyl, addPrism, bakedModel } = api;

      const tiltBasis = (a, ang) => {
        const c = Math.cos(ang), s = Math.sin(ang);
        return [
          [a.r[0] * c + a.u[0] * s, a.r[1] * c + a.u[1] * s, a.r[2] * c + a.u[2] * s],
          [a.u[0] * c - a.r[0] * s, a.u[1] * c - a.r[1] * s, a.u[2] * c - a.r[2] * s],
          a.t,
        ];
      };

      const PINE_D = [0.09, 0.25, 0.13], PINE = [0.11, 0.30, 0.15];
      const LEAF = [0.19, 0.44, 0.20], LEAF_D = [0.15, 0.36, 0.17];
      const GRAVEL = [0.66, 0.61, 0.48];
      const CONC = [0.68, 0.68, 0.66];

      const inStadium = (s) => s >= 0.78 || s <= 0.06;
      const T4 = [0.203, 0.237];
      const inT4 = (s) => s > T4[0] && s < T4[1];
      const runs = (s0, s1, side) => side === 1 && s0 < T4[0] && s1 > T4[1]
        ? [[s0, T4[0]], [T4[1], s1]] : [[s0, s1]];
      for (const [s0, s1] of [[0.065, 0.430], [0.495, 0.775]]) {
        for (const side of [-1, 1]) {
          for (const [r0, r1] of runs(s0, s1, side)) {
            forestEdge(r0, r1, side, 7.5, {
              density: 0.86, hMin: 16, hMax: 30, pineFrac: 0.82,
              col: PINE, col2: LEAF_D,
            });
            forestEdge(r0, r1, side, 26, {
              density: 0.62, hMin: 22, hMax: 36, pineFrac: 0.9,
              col: PINE_D, col2: PINE_D,
            });
          }
        }
      }
      for (const [s0, s1, side] of [[0.075, 0.203, 1], [0.237, 0.305, 1], [0.075, 0.305, -1],
                                    [0.505, 0.765, -1], [0.505, 0.615, 1], [0.620, 0.765, 1]]) {
        {
          forestEdge(s0, s1, side, 42, {
            density: 0.2, hMin: 26, hMax: 42, pineFrac: 0.96,
            col: PINE_D, col2: PINE_D,
          });
        }
      }
      every(20, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 31);
        if (h < 0.10) return;
        const side = h < 0.5 ? -1 : 1;
        if (inT4(s)) return;
        if (!(s > 0.465 && s < 0.48)) pine(k, side, 9 + h * 7, 17 + h * 13, h < 0.35 ? PINE_D : PINE);
        if (h > 0.28) pine(k, -side, 10 + h * 8, 15 + h * 12, PINE);
      });
      every(30, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 53 + 9);
        if (h < 0.22 || inT4(s)) return;
        tree(k, h < 0.5 ? -1 : 1, 14 + h * 10, 11 + h * 8, h < 0.45 ? LEAF_D : LEAF);
        if (h > 0.62) pine(k, h > 0.82 ? -1 : 1, 28 + h * 14, 20 + h * 12, PINE_D);
      });
      every(48, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.30 || inT4(s)) return;
        pine(k, h < 0.5 ? -1 : 1, 44 + h * 26, 22 + h * 14, PINE_D);
        if (h > 0.70) tree(k, h > 0.85 ? -1 : 1, 58 + h * 20, 13 + h * 8, LEAF_D);
      });
      every(26, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.55 || inT4(s)) return;
        bush(k, h < 0.78 ? -1 : 1, 6.5 + h * 4, [0.16, 0.34, 0.16]);
      });

      const BOWL_CONC = [[0.63, 0.62, 0.59], [0.55, 0.545, 0.525]];
      const BOWL_CROWD = [[0.88, 0.86, 0.82], [0.22, 0.30, 0.52],
                          [0.78, 0.28, 0.22], [0.90, 0.78, 0.28]];
      function motodromTerrace(s0, s1, side, gap, rows, step) {
        let i = 0;
        along(s0, s1, step, (k, spacing) => {
          const seg = Math.min(spacing * 0.93, spacing - 0.7);
          for (let t = 0; t < rows; t++) {
            const a = anchor(k, side, gap + t * 4.6);
            const b = [a.r, a.u, a.t];
            const h = 2.2 + t * 2.5;
            addBox(out, vadd(a.c, a.u, h * 0.5), [3.6, h, seg], BOWL_CONC[t & 1], b);
            addBox(out, vadd(a.c, a.u, h + 0.70), [3.0, 1.3, seg * 0.90],
              BOWL_CROWD[(i + t) & 3], b);
          }
          i++;
        });
      }
      motodromTerrace(0.790, 0.870, 1, 13, 5, 12);
      motodromTerrace(0.840, 0.880, -1, 12, 3, 13);

      {
        const roofCol = [0.30, 0.31, 0.34], fascia = [0.86, 0.86, 0.84];
        along(0.815, 0.895, 12, (k, spacing) => {
          const a = anchor(k, 1, 28);
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.28, 21, [0.42, 0.43, 0.46], 6, b);
          addBox(out, vadd(a.c, a.u, 21.4), [15, 0.55, spacing * 0.88], roofCol, b);
          addBox(out, vadd(vadd(a.c, a.r, -7.2), a.u, 20.4), [1.1, 1.6, spacing * 0.88], fascia, b);
        });
      }
      spectatorHill(0.760, 0.798, -1, 15, { rows: 4, rise: 1.2, depth: 1.9, density: 0.55, step: 8 });

      {
        const a = anchor(K(0.882), 1, 40);
        const b = [a.r, a.u, a.t];
        modelGroup("hockenheim-motodrom-screen", {
          center: vadd(a.c, a.u, 13), size: [14, 26, 18], basis: b,
        }, (stage) => {
          for (const st of [-1, 1])
            addCyl(stage, vadd(a.c, a.t, st * 6), 0.55, 16, [0.26, 0.27, 0.30], 6, b);
          addBox(stage, vadd(a.c, a.u, 21), [1.6, 9, 16], [0.14, 0.14, 0.16], b);
          addBox(stage, vadd(vadd(a.c, a.r, -1.0), a.u, 21), [0.35, 7.6, 14],
            [0.10, 0.16, 0.22], b);
          addBox(stage, vadd(vadd(a.c, a.r, -1.2), a.u, 21), [0.2, 6.6, 12.6],
            [0.62, 0.72, 0.80], b);
        }, { required: true });
      }

      {
        const a = anchor(K(0.828), 1, 28);
        const b = [a.r, a.u, a.t];
        const roofB = tiltBasis(a, -0.10);
        modelGroup("hockenheim-mercedes-tribune", {
          center: vadd(vadd(a.c, a.r, -6), a.u, 13), size: [34, 30, 56], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(vadd(a.c, a.r, 6), a.u, 12.5), [2.0, 25, 48],
            [0.60, 0.60, 0.58], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, 1), a.u, 21.5), [10, 3.4, 46],
            [0.34, 0.45, 0.54], b);
          stage._mat = MAT.METAL;
          for (let d = 0; d < 4; d++)
            addCyl(stage, vadd(vadd(a.c, a.r, 6), a.t, (d - 1.5) * 14),
              0.34, 25, [0.42, 0.43, 0.46], 6, b);
          addBox(stage, vadd(vadd(a.c, a.r, -4), a.u, 25.5), [30, 0.7, 50],
            [0.30, 0.31, 0.34], roofB);
          addBox(stage, vadd(vadd(a.c, a.r, -18), a.u, 23.6), [1.2, 2.6, 48],
            [0.88, 0.88, 0.86], b);
          addBox(stage, vadd(vadd(a.c, a.r, -18.3), a.u, 23.6), [1.0, 1.6, 42],
            [0.10, 0.12, 0.16], b);
          stage._mat = 0;
        }, { required: true });
      }

      (function suedTribune() {
        const sMid = 0.935;
        const len = 110;
        const side = -1;
        const a0 = anchor(K(sMid), side, 40);
        const b0 = [a0.r, a0.u, a0.t];
        modelGroup("hockenheim-sued-tribune", {
          center: vadd(a0.c, a0.u, 12), size: [36, 28, len + 8], basis: b0,
        }, (stage) => {
          for (let t = 0; t < 6; t++) {
            const a = anchor(K(sMid), side, 14 + t * 4.6);
            const b = [a.r, a.u, a.t];
            const h = 2.4 + t * 2.55;
            const seg = len - t * 3;
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, h * 0.5), [3.8, h, seg], BOWL_CONC[t & 1], b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(a.c, a.u, h + 0.70), [3.2, 1.3, seg - 2],
              BOWL_CROWD[t & 3], b);
            stage._mat = 0;
          }
          {
            const a = anchor(K(sMid), side, 42);
            const b = [a.r, a.u, a.t];
            const h = 18.5;
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, h * 0.5), [5.0, h, 48], [0.58, 0.57, 0.55], b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(a.c, a.u, h + 0.70), [4.2, 1.4, 44], BOWL_CROWD[1], b);
            stage._mat = 0;
          }
          const aR = anchor(K(sMid), side, 36);
          const roofB = tiltBasis(aR, -0.08);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(aR.c, aR.u, 22.5), [22, 0.75, len + 4],
            [0.30, 0.31, 0.34], roofB);
          addBox(stage, vadd(vadd(aR.c, aR.r, -side * 9), aR.u, 21.4),
            [1.2, 1.7, len], [0.86, 0.86, 0.84], [aR.r, aR.u, aR.t]);
          const aB = anchor(K(sMid), side, 48);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aB.c, aB.u, 11), [2.4, 22, len], [0.60, 0.60, 0.58],
            [aB.r, aB.u, aB.t]);
          stage._mat = 0;
        }, { required: true });
      })();

      (function nordTribune() {
        const sMid = 0.055;
        const len = 88;
        const side = -1;
        const a0 = anchor(K(sMid), side, 32);
        const b0 = [a0.r, a0.u, a0.t];
        modelGroup("hockenheim-nord-tribune", {
          center: vadd(a0.c, a0.u, 9), size: [28, 22, len + 6], basis: b0,
        }, (stage) => {
          for (let t = 0; t < 5; t++) {
            const a = anchor(K(sMid), side, 12 + t * 4.5);
            const b = [a.r, a.u, a.t];
            const h = 2.2 + t * 2.4;
            const seg = len - t * 2.5;
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, h * 0.5), [3.6, h, seg], BOWL_CONC[t & 1], b);
            stage._mat = MAT.FABRIC;
            const LEVEL = [[0.92, 0.55, 0.22], [0.78, 0.22, 0.20], [0.22, 0.34, 0.62],
                           [0.88, 0.86, 0.82], [0.22, 0.34, 0.62]];
            addBox(stage, vadd(a.c, a.u, h + 0.70), [3.0, 1.25, seg - 2], LEVEL[t], b);
            stage._mat = 0;
          }
          const aR = anchor(K(sMid), side, 28);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(aR.c, aR.u, 16.8), [18, 0.7, len + 2],
            [0.32, 0.33, 0.36], [aR.r, aR.u, aR.t]);
          const aB = anchor(K(sMid), side, 38);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aB.c, aB.u, 9), [2.2, 18, len], [0.58, 0.58, 0.56],
            [aB.r, aB.u, aB.t]);
          stage._mat = 0;
        }, { required: true });
      })();
      {
        const FLAG = [[0.86, 0.16, 0.14], [0.94, 0.93, 0.90],
                      [0.10, 0.30, 0.62], [0.96, 0.78, 0.08]];
        let fi = 0;
        along(0.805, 0.895, 16, (k) => {
          const a = anchor(k, 1, 10.5);
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.10, 11, [0.80, 0.81, 0.83], 5, b);
          addBox(out, vadd(vadd(a.c, a.u, 9.4), a.t, 1.2), [0.12, 1.5, 2.4],
            FLAG[fi & 3], b);
          fi++;
        });
      }

      {
        const PIT_WALL = [0.90, 0.90, 0.88], PLINTH = [0.34, 0.35, 0.38];
        const SHUTTER = [0.22, 0.23, 0.26], GLASS = [0.34, 0.45, 0.54];
        const ROOF = [0.80, 0.81, 0.83];
        for (let i = 0; i < 6; i++) {
          const s = 0.952 + i * 0.011;
          const a = anchor(K(s), 1, 20);
          const b = [a.r, a.u, a.t];
          const roofB = tiltBasis(a, -0.14);
          modelGroup(`hockenheim-pit-bay-${i + 1}`, {
            center: vadd(a.c, a.u, 9), size: [22, 18, 32], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            seat.box(stage, a.c, [16, 1.1, 30], PLINTH, b);
            addBox(stage, vadd(a.c, a.u, 4.8), [14, 6.6, 30], PIT_WALL, b);
            stage._mat = MAT.METAL;
            for (let d = 0; d < 3; d++)
              addBox(stage, vadd(vadd(vadd(a.c, a.r, -7.1), a.u, 3.6), a.t, (d - 1) * 9),
                [0.35, 4.4, 6.2], SHUTTER, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(a.c, a.u, 10.0), [14.6, 3.4, 30], GLASS, b);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.r, -8.4), a.u, 8.3), [3.6, 0.35, 29], ROOF, b);
            addBox(stage, vadd(vadd(a.c, a.r, -10.0), a.u, 8.9), [0.16, 1.1, 29], [0.72, 0.74, 0.78], b);
            addBox(stage, vadd(vadd(a.c, a.r, -3.0), a.u, 13.4), [24, 0.6, 30], ROOF, roofB);
            for (let d = 0; d < 2; d++) {
              const foot = vadd(vadd(a.c, a.r, 5.5), a.t, (d - 0.5) * 18);
              addCyl(stage, vadd(foot, a.u, 6.5), 0.22, 8.6,
                [0.52, 0.54, 0.58], 5, tiltBasis(a, 0.55));
            }
            stage._mat = 0;
          }, { required: true });
        }
        const a = anchor(K(0.995), 1, 14);
        const b = [a.r, a.u, a.t];
        modelGroup("hockenheim-race-control", {
          center: vadd(a.c, a.u, 18), size: [10, 42, 12], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 14), [5.5, 28, 8], [0.84, 0.85, 0.86], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -2.4), a.u, 26.5), [5.6, 5.0, 9.5],
            [0.16, 0.22, 0.30], b);
          addBox(stage, vadd(vadd(a.c, a.r, -2.6), a.u, 26.5), [5.2, 4.0, 8.6],
            [0.92, 0.86, 0.60], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.r, -2.4), a.u, 29.6), [7.0, 0.5, 11], ROOF, b);
          addCyl(stage, vadd(a.c, a.u, 28), 0.14, 11, [0.30, 0.31, 0.34], 4, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.975, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.995, -1, 12, 96, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      for (let i = 0; i < 4; i++) {
        building(K(0.955 + i * 0.016), 1, 40, 22, 14, 20,
          { kind: "notch", wall: [0.74, 0.76, 0.80], window: [0.36, 0.44, 0.52], floor: 4.0 });
      }
      every(44, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.980 || s < 0.015) || h < 0.60) return;
        motorhome(k, 1, 95 + h * 18, 10, 4, 6, { wall: [0.62 + h * 0.28, 0.62, 0.64] });
      });
      broadcastCompound(K(0.945), 1, 74, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.985, 0.005, 0.025]) billboard(K(s), -1, 8, 12, 4.5, [0.90, 0.86, 0.30]);

      groundPatch(K(0.455), -1, 6, [46, 0.18, 60], GRAVEL,
        { id: "hockenheim-spitzkehre-gravel", samples: 8 });
      tyreWall(0.440, 0.475, -1, 5, [0.86, 0.20, 0.18]);
      (function hairpinTempStand() {
        const sMid = 0.457;
        const side = 1;
        for (let t = 0; t < 3; t++) {
          const a = anchor(K(sMid), side, 24 + t * 4.5);
          if (onTrack(a.c[0], a.c[2], 4)) continue;
          const b = [a.r, a.u, a.t];
          const h = 2.0 + t * 2.2;
          addBox(out, vadd(a.c, a.u, h * 0.5), [3.4, h, 40 - t * 2], BOWL_CONC[t & 1], b);
          addBox(out, vadd(a.c, a.u, h + 0.70), [2.8, 1.2, 36 - t * 2], BOWL_CROWD[t & 3], b);
        }
      })();
      marshalPost(K(0.450), 1, 10);
      for (const s of [0.435, 0.470]) billboard(K(s), -1, 14, 12, 4.5, [0.88, 0.84, 0.78]);

      groundPatch(K(0.220), 1, 5, [18, 0.18, 24], GRAVEL,
        { id: "hockenheim-ostkurve-gravel", samples: 8 });
      tyreWall(0.208, 0.232, 1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.234), 1, 9);

      groundPatch(K(0.62), 1, 5, [24, 0.18, 30], GRAVEL,
        { id: "hockenheim-forest-exit-gravel", samples: 5 });
      marshalPost(K(0.60), 1, 9);

      for (const [s0, s1] of [[0.06, 0.43], [0.49, 0.60], [0.64, 0.78]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        for (const [r0, r1] of runs(s0, s1, 1)) guardrail(r0, r1, 1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.78, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.80, 0.05, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.845, 0.965, 1, 10, 4, [0.74, 0.76, 0.80]);
      fence(0.43, 0.49, -1, 8, 4, [0.74, 0.76, 0.80]);

      for (const s of [0.14, 0.22, 0.29, 0.52, 0.68, 0.75]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const { cx, cz, radius: rad } = lapBounds();
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [110, 58, 96, 26, 13, 6, [0.13, 0.32, 0.16]],
        [180, 48, 118, 30, 16, 7, [0.11, 0.28, 0.14]],
        [255, 40, 140, 34, 19, 8, [0.10, 0.25, 0.13]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 30;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 30)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }


      {
        const board = [0.94, 0.94, 0.90];
        for (let i = 0; i < 4; i++) {
          const a = anchor(K(0.395 + i * 0.012), -1, 6.5);
          addBox(out, vadd(a.c, a.u, 1.5), [0.18, 1.4, 1.8], board, [a.r, a.u, a.t]);
          addCyl(out, a.c, 0.09, 1.0, [0.25, 0.25, 0.28], 5, [a.r, a.u, a.t]);
        }
      }

      {
        const a = anchor(K(0.890), -1, 46);
        const b = [a.r, a.u, a.t];
        modelGroup("hockenheim-infield-compound", {
          center: vadd(a.c, a.u, 3.2),
          size: [18, 7, 40],
          basis: b,
        }, (stage) => {
          for (let i = 0; i < 3; i++) {
            const p = vadd(a.c, a.t, (i - 1) * 13);
            addBox(stage, vadd(p, a.u, 2.4), [9, 4.8, 10], i % 2 ? [0.78, 0.78, 0.76] : CONC, b);
            addPrism(stage, vadd(p, a.u, 5.4), [9.4, 1.6, 10.4], [0.58, 0.58, 0.60], b);
          }
        }, { required: true });
      }

      sponsorHoarding(0.800, 0.895, 1, 6.5, {
        h: 1.3, step: 10,
        palette: [[0.86, 0.16, 0.14], [0.94, 0.93, 0.90], [0.10, 0.30, 0.62], [0.96, 0.78, 0.08]],
      });
      sponsorHoarding(0.845, 0.895, -1, 6.0, { h: 1.2, step: 11 });
      sponsorHoarding(0.905, 0.985, -1, 6.5, {
        h: 1.25, step: 11,
        palette: [[0.86, 0.16, 0.14], [0.94, 0.93, 0.90], [0.10, 0.30, 0.62]],
      });

      cameraTower(K(0.838), 1, 8, { h: 17 });
      cameraTower(K(0.918), -1, 8, { h: 15 });
      cameraTower(K(0.470), 1, 10, { h: 14 });
      for (const s of [0.965, 0.985, 0.01]) bakedModel("k_tentlong", K(s), -1, 95, { scale: 2.4 });
      for (const s of [0.1875, 0.4635, 0.657, 0.883]) bakedModel("k_camera_exclusive", K(s), 1, 13, { scale: 3 });
    };
