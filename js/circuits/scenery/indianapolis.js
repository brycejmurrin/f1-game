"use strict";
(window.TrackScenery = window.TrackScenery || {})["indianapolis"] =
  function (api) {
      const { K, lapBounds, out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, hw, tree, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, waterSurface,
        floodMast, cameraTower, sponsorHoarding, signDigit, indexSolid,
        bleacher, scaffoldStand, seat,
        addBox, addCyl, addFrustum } = api;

      const LEAF = [0.22, 0.44, 0.20], LEAF_D = [0.16, 0.36, 0.17];
      const CONC = [0.74, 0.73, 0.70];
      const SEAT = [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]];
      const SHELL = [0.78, 0.78, 0.76], SHELL2 = [0.70, 0.71, 0.73];
      const ROOF = [0.86, 0.86, 0.84];
      const IMS_RED = [0.72, 0.14, 0.14], IMS_NAVY = [0.14, 0.22, 0.42];
      const IMS_GOLD = [0.86, 0.70, 0.18], ASPHALT = [0.28, 0.28, 0.30];
      const IMS_PAL = [IMS_RED, [0.94, 0.94, 0.92], IMS_NAVY, IMS_GOLD,
                       [0.10, 0.10, 0.12], [0.86, 0.86, 0.84]];

      const OUT = -1, IN = 1;
      const neg = (v) => [-v[0], -v[1], -v[2]];
      const rot = (a) => ({ c: a.c, u: a.u, r: neg(a.r), t: neg(a.t) });

      const BAY_F = 40 / 4073, BAY_LEN = 38;
      const OVAL_LIV = ["navy", "crimson", "concrete"];
      const inSF = (s01) => s01 > 0.986 || s01 < 0.014;
      for (let s = 0.770, i = 0; s < 1.150; s += BAY_F, i++) {
        const s01 = s % 1;
        if (inSF(s01)) continue;
        const g = i % 6;
        grandstandEx(s01, OUT, 18, BAY_LEN, null, SEAT[g % 3], {
          livery: OVAL_LIV[g % 3],
          tiers: s01 > 0.90 || s01 < 0.10 ? 3 : 2,
          roof: g % 3 === 0 ? "cantilever" : (g % 3 === 1 ? "flat" : "cantilever"),
          endWalls: s + BAY_F >= 1.150 || s - BAY_F < 0.770 || inSF((s + BAY_F) % 1) || inSF((s - BAY_F + 1) % 1),
          pylons: g % 2 === 0,
          fasciaCol: g % 3 === 0 ? IMS_NAVY : (g % 3 === 1 ? IMS_RED : SHELL2),
        });
      }

      const outAnchor = anchor;
      (function indyMainStands() {
        const side = 1;
        const FACE = 48;
        const DEPTH = 18;
        const gap0 = 18;
        const anchor = (k, _side, gap) => rot(outAnchor(k, OUT, gap));
        const a0 = anchor(K(0.0), side, gap0 + DEPTH * 0.4);
        if (onTrack(a0.c[0], a0.c[2], FACE * 0.3)) return;
        const b0 = [a0.r, a0.u, a0.t];
        const emitMain = (stage) => {
          for (let bay = -1; bay <= 1; bay++) {
            const along = bay * (FACE * 0.34);
            for (let t = 0; t < 4; t++) {
              const a = anchor(K(0.0), side, gap0 + t * 4.2);
              const b = [a.r, a.u, a.t];
              const h = 1.8 + t * 2.2;
              const len = FACE * 0.30 - t * 1.0;
              const c = vadd(a.c, a.t, along);
              stage._mat = MAT.CONCRETE;
              seat.box(stage, c, [3.6, h, len], t % 2 ? SHELL : SHELL2, b);
              stage._mat = MAT.FABRIC;
              seat.box(stage, vadd(c, a.u, h),
                [3.0, 0.95, len - 2.2], SEAT[(bay + t + 3) % 3], b);
              stage._mat = 0;
              seat.box(stage, vadd(c, a.u, h + 0.95),
                [3.3, 0.16, len - 0.8], ROOF, b);
            }
          }
          const aR = anchor(K(0.0), side, gap0 + DEPTH * 0.55);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aR.c, aR.u, 8.5), [2.4, 16, FACE * 0.9], SHELL2,
            [aR.r, aR.u, aR.t]);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(aR.c, aR.u, 14.8), [DEPTH * 0.5, 0.6, FACE + 1], ROOF,
            [aR.r, aR.u, aR.t]);
          addBox(stage, vadd(vadd(aR.c, aR.r, -side * 4.3), aR.u, 15.2),
            [0.3, 0.55, FACE * 0.85], IMS_NAVY, [aR.r, aR.u, aR.t]);
          addBox(stage, vadd(vadd(aR.c, aR.r, -side * 4.4), aR.u, 15.55),
            [0.28, 0.4, FACE * 0.35], IMS_RED, [aR.r, aR.u, aR.t]);
          for (let c = 0; c < 8; c++) {
            const alongC = (c - 3.5) * (FACE * 0.1);
            addBox(stage, vadd(vadd(vadd(aR.c, aR.r, -side * 4.5), aR.t, alongC), aR.u, 15.65),
              [0.22, 0.32, FACE * 0.05],
              c & 1 ? [0.08, 0.08, 0.09] : [0.94, 0.94, 0.92], [aR.r, aR.u, aR.t]);
          }
          stage._mat = 0;
        };
        modelGroup("indy-main-stands", {
          center: vadd(a0.c, a0.u, 9),
          size: [DEPTH * 0.8, 22, FACE + 6], basis: b0,
        }, emitMain, { required: true });
      })();

      {
        const a = rot(anchor(K(0.005), IN, 62));
        const b = [a.r, a.u, a.t];
        modelGroup("indy-pagoda", {
          center: vadd(a.c, a.u, 26), size: [26, 58, 30], basis: b,
        }, (stage) => {
          const CORE = [0.80, 0.80, 0.82], CLAD = [0.86, 0.86, 0.88];
          const GLASS = [0.28, 0.42, 0.56], EAVE = [0.92, 0.92, 0.94];
          addBox(stage, vadd(a.c, a.u, 5.5), [20, 11, 24], CLAD, b);
          addBox(stage, vadd(a.c, a.u, 27), [12.5, 34, 14], CORE, b);
          for (let t = 0; t < 5; t++) {
            const w = 16.5 - t * 1.5, d = 19 - t * 1.6;
            const y = 11.0 + t * 6.0;
            addBox(stage, vadd(a.c, a.u, y + 3.0), [w, 6.0, d], CLAD, b);
            addBox(stage, vadd(vadd(a.c, a.r, w * 0.5 + 0.28), a.u, y + 2.9),
              [0.4, 2.4, d - 3.5], GLASS, b);
            addBox(stage, vadd(a.c, a.u, y + 5.85), [w + 1.0, 0.35, d + 1.0], EAVE, b);
          }
          addBox(stage, vadd(a.c, a.u, 42.0), [11, 1.4, 13], EAVE, b);
          addCyl(stage, vadd(a.c, a.u, 42.7), 0.5, 10, [0.90, 0.90, 0.92], 8, b);
          addBox(stage, vadd(a.c, a.u, 41.2), [11.8, 0.4, 13.6], IMS_RED, b);
        }, { required: true });
      }

      {
        const a = rot(anchor(K(0.030), IN, 24));
        const b = [a.r, a.u, a.t];
        const AMBER = [1.0, 0.74, 0.12], PANEL = [0.07, 0.07, 0.08];
        const ORDER = [[1, 16], [4, 63], [55, 81], [44, 14], [23, 22],
                       [27, 31], [10, 77], [18, 24], [20, 3]];
        modelGroup("indy-scoring-pylon", {
          center: vadd(a.c, a.u, 17), size: [9, 40, 11], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 1.1), [7.6, 2.2, 9.0], [0.78, 0.78, 0.76], b);
          addBox(stage, vadd(a.c, a.u, 2.5), [8.4, 0.6, 9.8], [0.86, 0.86, 0.84], b);
          addFrustum(stage, vadd(a.c, a.u, 2.8), 4.3, 3.2, 29, PANEL, 4, b);
          const proud = 0.06;
          for (let r = 0; r < ORDER.length; r++) {
            const y = 27.5 - r * 2.55;
            addBox(stage, vadd(vadd(a.c, a.r, proud * 6), a.u, y),
              [0.25, 2.05, 7.6], [0.03, 0.03, 0.04], b);
            for (let cIdx = 0; cIdx < 3; cIdx++) {
              const num = ORDER[r][cIdx % 2] + (cIdx === 2 ? 40 : 0);
              const digs = String(num % 100).padStart(2, "0").split("").map(Number);
              const colC = vadd(vadd(vadd(a.c, a.r, proud * 6), a.u, y),
                a.t, (cIdx - 1) * 2.5);
              digs.forEach((d, i) => {
                const dc = vadd(colC, a.t, (i - 0.5) * 0.78);
                signDigit(dc, a.r, a.u, a.t, 0.62, 1.42, -proud, AMBER, d);
              });
            }
          }
          addBox(stage, vadd(a.c, a.u, 31.8), [5.6, 1.1, 6.4], [0.80, 0.80, 0.82], b);
          addBox(stage, vadd(a.c, a.u, 32.5), [5.8, 0.35, 6.6], AMBER, b);
          addCyl(stage, vadd(a.c, a.u, 32.65), 0.32, 4.0, [0.86, 0.86, 0.88], 6, b);
          addCyl(stage, vadd(a.c, a.u, 36.65), 0.55, 1.0, AMBER, 8, b);
        }, { required: true });
      }

      {
        const a = rot(anchor(K(0.955), IN, 15));
        const b = [a.r, a.u, a.t];
        modelGroup("indy-pit-stalls", {
          center: vadd(a.c, a.u, 4), size: [12, 10, 120], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 6.4), [10, 0.7, 118], [0.88, 0.88, 0.86], b);
          addBox(stage, vadd(vadd(a.c, a.r, -4.6), a.u, 3), [0.5, 6, 118], CONC, b);
          for (const end of [-1, 1]) {
            addBox(stage, vadd(vadd(a.c, a.t, end * 58.5), a.u, 3),
              [9.2, 6, 0.55], SHELL2, b);
          }
          for (let i = 0; i < 15; i++) {
            const p = vadd(a.c, a.t, (i - 7) * 8);
            addBox(stage, vadd(p, a.u, 3), [9, 6, 0.35], [0.82, 0.82, 0.80], b);
            addCyl(stage, vadd(p, a.r, 4.4), 0.16, 6.2, [0.70, 0.70, 0.72], 6, b);
            if (i % 3 === 0) {
              addBox(stage, vadd(vadd(p, a.r, 4.2), a.u, 5.6),
                [0.2, 0.45, 6.5], IMS_RED, b);
            }
          }
        }, { required: true });
      }
      gantry(0.0, 9.5, [0.15, 0.15, 0.18]);
      gantry(0.955, 9, [0.15, 0.15, 0.18]);

      {
        const lineK = K(0.0), a = anchor(lineK, 0, 0);
        const fullWidth = hw[lineK] * 2;
        const brickCount = Math.ceil(fullWidth * 1.2);
        const brickWidth = fullWidth / brickCount;
        for (let row = 0; row < 3; row++) {
          const alongT = (row - 1) * 0.7;
          for (let i = 0; i < brickCount; i++) {
            const off = -fullWidth * 0.5 + brickWidth * (i + 0.5);
            const warm = (i + row) & 1;
            addBox(out, vadd(vadd(vadd(a.c, a.r, off), a.t, alongT), a.u, 0.05),
              [brickWidth + 0.03, 0.12, 0.85],
              warm ? [0.62, 0.32, 0.20] : [0.42, 0.20, 0.14], [a.r, a.u, a.t]);
          }
        }
      }

      for (let row = 0; row < 3; row++) {
        const a = rot(anchor(K(0.906 + row * 0.020), IN, 40 + row * 20));
        const b = [a.r, a.u, a.t];
        modelGroup(`indy-gasoline-alley-${row + 1}`, {
          center: vadd(a.c, a.u, 5), size: [18, 12, 68], basis: b,
        }, (stage) => {
          const WALL = [0.88, 0.88, 0.86], TRIM = [0.66, 0.16, 0.15];
          addBox(stage, vadd(a.c, a.u, 3.4), [15, 6.8, 64], WALL, b);
          addBox(stage, vadd(a.c, a.u, 7.0), [15.8, 0.5, 65], [0.74, 0.74, 0.72], b);
          addBox(stage, vadd(a.c, a.u, 8.6), [5.6, 2.8, 60], WALL, b);
          addBox(stage, vadd(a.c, a.u, 10.2), [6.6, 0.45, 61], [0.70, 0.70, 0.68], b);
          for (const sgn of [-1, 1])
            addBox(stage, vadd(vadd(a.c, a.r, sgn * 2.7), a.u, 8.7),
              [0.25, 1.7, 57], [0.42, 0.48, 0.52], b);
          addBox(stage, vadd(vadd(a.c, a.r, -7.4), a.u, 6.2), [0.4, 0.9, 64], TRIM, b);
          for (let d = 0; d < 13; d++) {
            const p = vadd(a.c, a.t, (d - 6) * 4.8);
            addBox(stage, vadd(vadd(p, a.r, -7.5), a.u, 2.4),
              [0.35, 4.4, 3.5], d & 1 ? [0.72, 0.72, 0.74] : [0.64, 0.64, 0.66], b);
            signDigit(vadd(vadd(p, a.r, -7.8), a.u, 5.4), a.r, a.u, a.t,
              0.5, 0.9, 0.1, [0.20, 0.20, 0.22], (row * 13 + d) % 10);
          }
        });
      }
      for (const [id, s, gap] of [["a", 0.916, 52], ["b", 0.916, 72]]) {
        groundPatch(K(s), IN, gap, [12, 0.16, 66], [0.56, 0.56, 0.55],
          { id: `indy-alley-${id}`, samples: 8 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.88 || s < 0.04) || h < 0.55) return;
        motorhome(k, IN, 62 + h * 10, 10, 4, 6, { wall: [0.70 + h * 0.2, 0.70, 0.72] });
      });
      broadcastCompound(K(0.895), IN, 78, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.97, 0.01, 0.04]) billboard(K(s), IN, 10, 14, 5, IMS_NAVY);
      sponsorHoarding(0.970, 0.045, OUT, 7, { h: 1.35, step: 10, palette: IMS_PAL });
      sponsorHoarding(0.980, 0.030, IN, 8, { h: 1.2, step: 11, palette: IMS_PAL });
      billboard(K(0.995), OUT, 12, 16, 5.5, IMS_RED);
      billboard(K(0.018), OUT, 14, 14, 5, IMS_GOLD);
      billboard(K(0.110), OUT, 16, 12, 4.5, IMS_NAVY);
      billboard(K(0.500), -1, 12, 14, 4.5, IMS_RED);

      groundPatch(K(0.300), 1, 8, [22, 0.18, 28], [0.66, 0.62, 0.50],
        { id: "indy-infield-gravel-a", samples: 6 });
      tyreWall(0.286, 0.316, 1, 4, [0.86, 0.20, 0.18]);
      marshalPost(K(0.305), -1, 9);

      groundPatch(K(0.500), -1, 5, [24, 0.18, 32], [0.66, 0.62, 0.50],
        { id: "indy-infield-gravel-b", samples: 6 });
      tyreWall(0.486, 0.516, -1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.494), 1, 9);

      groundPatch(K(0.660), 1, 5, [24, 0.18, 32], [0.66, 0.62, 0.50],
        { id: "indy-infield-gravel-c", samples: 6 });
      marshalPost(K(0.655), -1, 9);

      bleacher(0.292, 0.309, -1, 28, {
        rows: 8, step: 8, density: 0.44,
        plankCol: [0.66, 0.67, 0.70], frameCol: [0.58, 0.59, 0.62],
        crowd: [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]],
      });
      scaffoldStand(0.512, 0.528, 1, 22, {
        rows: 6, step: 9, density: 0.40, legEvery: 1,
        bench: [[0.30, 0.42, 0.66], [0.82, 0.80, 0.76]],
        crowd: [[0.86, 0.86, 0.84], [0.30, 0.42, 0.66], [0.72, 0.20, 0.18]],
      });
      bleacher(0.673, 0.688, -1, 22, {
        rows: 6, step: 8, density: 0.36,
        plankCol: [0.72, 0.72, 0.74], frameCol: [0.62, 0.63, 0.66],
        crowd: [[0.72, 0.20, 0.18], [0.86, 0.86, 0.84], [0.30, 0.42, 0.66]],
      });

      for (const [id, s, side, gap] of [
        ["1", 0.345, 1, 44], ["2", 0.430, -1, 48],
        ["3", 0.570, 1, 46], ["4", 0.628, -1, 42],
      ]) {
        groundPatch(K(s), side, gap, [26, 0.16, 30], [0.30, 0.52, 0.22],
          { id: `indy-green-${id}`, samples: 8 });
        groundPatch(K(s), side, gap + 26.5, [11, 0.14, 14], [0.84, 0.79, 0.62],
          { id: `indy-bunker-${id}`, samples: 6 });
        const a = anchor(K(s), side, gap + 4);
        const b = [a.r, a.u, a.t];
        addCyl(out, vadd(a.c, a.u, -0.1), 0.05, 3.6, [0.94, 0.94, 0.92], 4, b);
        addBox(out, vadd(vadd(a.c, a.u, 2.0), a.t, 0.5), [0.06, 0.5, 0.9],
          [0.90, 0.16, 0.14], b);
      }

      every(40, (k) => {
        const s = k / n;
        if (s < 0.27 || s > 0.74) return;
        const h = hash(k * 31);
        if (h < 0.40) return;
        tree(k, h < 0.70 ? -1 : 1, 34 + h * 20, 10 + h * 6, h < 0.70 ? LEAF_D : LEAF);
      });

      for (const [s0, s1] of [[0.24, 0.70]]) {
        guardrail(s0, s1, -1, 6, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 6, [0.80, 0.81, 0.83]);
      }
      let slab = 0;
      along(0.765, 0.140, 9, (k, spacing) => {
        const a = anchor(k, OUT, 1.4 + (slab++ & 1) * 0.03);
        addBox(out, vadd(a.c, a.u, 1.05), [0.6, 2.1, spacing], [0.93, 0.93, 0.92], [a.r, a.u, a.t]);
      });
      fence(0.765, 0.140, OUT, 4, 5, [0.74, 0.76, 0.80]);
      for (const s of [0.28, 0.36, 0.44, 0.58, 0.66, 0.74]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const { cx, cz, radius: rad } = lapBounds();
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [110, 46, 110, 30, 5, 3, [0.22, 0.42, 0.20]],
        [200, 36, 160, 40, 8, 4, [0.19, 0.38, 0.18]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 30;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      cameraTower(K(0.115), 1, 30, { h: 18 });
      cameraTower(K(0.500), -1, 26, { h: 15 });

      for (let i = 0; i < 10; i++) {
        const s = (0.780 + i * 0.038) % 1;
        if (s > 0.985 || s < 0.015) continue;
        floodMast(K(s), OUT, 48, { h: 34, cool: true, arms: 3, light: true, pool: false });
      }
      spectatorHill(0.085, 0.145, IN, 28,
        { rows: 4, rise: 1.2, depth: 2.0, density: 0.66, step: 8 });

      for (const [id, s, gap, sz] of [
        ["a", 0.470, 62, [36, 0.3, 54]],
        ["b", 0.600, 56, [30, 0.3, 46]],
      ]) {
        waterSurface(K(s), -1, gap, sz, [0.10, 0.24, 0.26], { id: `indy-golf-pond-${id}` });
        for (const [dt, dg] of [[-1, 0.4], [1, 0.7], [-1, 1.1]]) {
          const kk = (K(s) + dt * Math.round(sz[2] / 2 / (4073 / n) + 3) + n) % n;
          tree(kk, -1, gap + sz[0] * dg, 9 + dg * 4, dg > 0.6 ? LEAF : LEAF_D);
        }
      }
      (function indyInfieldCampus() {
        {
          const a = rot(anchor(K(0.805), IN, 96));
          const b = [a.r, a.u, a.t];
          if (!onTrack(a.c[0], a.c[2], 40)) {
            indexSolid(0.790, 0.825, IN, 80, 55);
            modelGroup("indy-museum", {
              center: vadd(a.c, a.u, 7), size: [36, 16, 72], basis: b,
            }, (stage) => {
              const WALL = [0.88, 0.87, 0.84], TRIM = IMS_NAVY;
              addBox(stage, vadd(a.c, a.u, 5.5), [26, 11, 40], WALL, b);
              addBox(stage, vadd(vadd(a.c, a.t, 34), a.u, 3.8), [18, 7.6, 14], WALL, b);
              addBox(stage, vadd(vadd(a.c, a.r, 13.4), a.u, 5), [0.55, 8, 28],
                [0.24, 0.38, 0.52], b);
              addBox(stage, vadd(a.c, a.u, 11.2), [28, 0.55, 42], [0.72, 0.72, 0.70], b);
              addBox(stage, vadd(vadd(a.c, a.r, 13.7), a.u, 9.2),
                [0.4, 0.7, 16], IMS_RED, b);
              addBox(stage, vadd(vadd(a.c, a.r, 13.7), a.u, 3.2),
                [0.35, 0.5, 18], TRIM, b);
            }, { required: true });
          }
        }
        for (const [id, s, gap, sz] of [
          ["a", 0.780, 70, [34, 0.14, 44]],
          ["b", 0.835, 88, [28, 0.16, 36]],
          ["sf", 0.040, 55, [30, 0.14, 40]],
        ]) {
          groundPatch(K(s), IN, gap, sz, ASPHALT,
            { id: `indy-parking-${id}`, samples: 8 });
          const a = rot(anchor(K(s), IN, gap + 4));
          const b = [a.r, a.u, a.t];
          for (let i = 0; i < 14; i++) {
            const h = hash(i * 17 + s * 1000);
            if (h < 0.30) continue;
            const p = vadd(vadd(a.c, a.t, (i % 5 - 2) * 7), a.r, Math.floor(i / 5) * 8 - 2);
            if (onTrack(p[0], p[2], 10)) continue;
            addBox(out, vadd(p, a.u, 0.55), [2.0, 1.1, 4.2],
              h < 0.5 ? [0.15, 0.18, 0.35] : (h < 0.75 ? [0.72, 0.72, 0.74] : IMS_RED), b);
          }
        }
        for (const [s, gap, w, h, len] of [
          [0.055, 72, 14, 6, 22], [0.075, 80, 12, 5, 18], [0.095, 68, 16, 7, 20],
        ]) {
          const a = rot(anchor(K(s), IN, gap));
          const b = [a.r, a.u, a.t];
          if (onTrack(a.c[0], a.c[2], 18)) continue;
          addBox(out, vadd(a.c, a.u, h * 0.5), [w, h, len],
            [0.78, 0.78, 0.76], b);
          addBox(out, vadd(a.c, a.u, h + 0.2), [w + 0.8, 0.35, len + 0.8],
            IMS_NAVY, b);
        }
        for (const [id, s, gap, sz, lift] of [
          ["fair-a", 0.480, 88, [20, 0.12, 54], 0],
          ["fair-b", 0.545, 96, [18, 0.14, 48], 0.02],
          ["fair-c", 0.630, 90, [16, 0.12, 44], 0],
          ["tee-a", 0.355, 100, [14, 0.14, 24], 0.02],
        ]) {
          groundPatch(K(s), -1, gap + lift * 50, sz, [0.26, 0.48, 0.20],
            { id: `indy-golf-${id}`, samples: 6 });
        }
        for (const [s, gap] of [[0.475, 118], [0.605, 112]]) {
          const a = anchor(K(s), -1, gap);
          const b = [a.r, a.u, a.t];
          if (onTrack(a.c[0], a.c[2], 16)) continue;
          addBox(out, vadd(a.c, a.u, 3.2), [10, 6.4, 14], [0.82, 0.80, 0.76], b);
          addBox(out, vadd(a.c, a.u, 6.6), [11, 0.4, 15], [0.55, 0.28, 0.22], b);
        }
      })();

      every(46, (k) => {
        const s = k / n;
        if (!(s > 0.775 || s < 0.130)) return;
        const h = hash(k * 13 + 7);
        if (h < 0.20) return;
        building(k, OUT, 120 + h * 34, 14 + h * 8, 6 + h * 6, 18 + h * 10,
          { wall: h < 0.6 ? [0.62, 0.44, 0.36] : [0.80, 0.78, 0.74] });
      });

      bleacher(0.190, 0.210, 1, 18, {
        rows: 8, step: 9, density: 0.42,
        plankCol: [0.72, 0.72, 0.74], frameCol: [0.58, 0.59, 0.62],
        crowd: [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]],
      });
      bleacher(0.214, 0.232, 1, 20, {
        rows: 6, step: 9, density: 0.38,
        plankCol: [0.70, 0.71, 0.74], frameCol: [0.60, 0.61, 0.64],
        crowd: [[0.86, 0.86, 0.84], [0.30, 0.42, 0.66], [0.72, 0.20, 0.18]],
      });
      bleacher(0.392, 0.408, 1, 24, {
        rows: 7, step: 8, density: 0.40,
        plankCol: [0.70, 0.71, 0.74], frameCol: [0.60, 0.61, 0.64],
        crowd: [[0.30, 0.42, 0.66], [0.86, 0.86, 0.84], [0.72, 0.20, 0.18]],
      });
    };
