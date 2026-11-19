"use strict";
(window.TrackScenery = window.TrackScenery || {})["singapore"] =
  function (api) {
      const { K, out, MAT, def, n, place, groundUnder, terrainYAt,
              building, billboard, anchor, every, onTrack, addBox, addCyl, addCone,
              addPrism, addFrustum, addPyramid, grandstand, grandstandEx, sponsorHoarding,
              gantry, marshalPost, palm, bush, ds, recordBarrier, seat,
              fence, tyreWall, vadd, hash, cityFront, tower, modelGroup,
              overheadSpan, waterSurface, waterBand, floodMastRing, circuitKit, pyMin,
              bakedModel } = api;
      const kitNode = (s) => (n - K(s)) % n;

      if (circuitKit) {
        circuitKit.raceControl({
          id: "kit:singapore:race-control", frac: 0.58, side: -1, gap: 72,
          size: [12, 24, 14], style: "drum", required: true,
        });
        circuitKit.pedestrianBridge({
          id: "kit:singapore:pedestrian-bridge", frac: 0.72,
          clearance: 7.2, thickness: 0.9, depth: 3, required: true,
        });
      }

      const makePortal = (id, s0, s1, opts) => {
        const h = opts.h;
        const gap = opts.gap;
        const col = opts.col || [0.08, 0.08, 0.10];
        const stations = [s0, (s0 + s1) * 0.5, s1];
        for (let i = 0; i < stations.length; i++) {
          const s = stations[i];
          overheadSpan({
            id: `${id}-deck-${i}`, frac: s, clearance: h, thickness: 0.9,
            depth: 6, supportGap: gap, color: col, required: true,
          });
        }
      };

      const WIN_WARM = [1.00, 0.88, 0.68];
      const WIN_COOL = [0.68, 0.78, 0.98];
      const WIN_CYAN = [0.55, 0.90, 1.00];
      const WIN_GOLD = [1.00, 0.80, 0.40];
      const NEON = [
        [1.00, 0.20, 0.85],
        [0.20, 0.92, 1.00],
        [1.00, 0.75, 0.10],
        [0.60, 0.30, 1.00],
      ];
      const WALL_CBD  = [0.18, 0.20, 0.30];
      const WALL_LITE = [0.22, 0.24, 0.34];
      const WALL_WARM = [0.26, 0.22, 0.18];
      makePortal("sheares", 0.085, 0.115, { h: 7.4, gap: 2.2 });
      makePortal("finish-underpass", 0.925, 0.985, { h: 6.8, gap: 2.4 });

      {
        const N = 48;
        const farCol = [0.08, 0.09, 0.18];
        const midCol = [0.07, 0.08, 0.17];
        for (let i = 0; i < N; i++) {
          const k  = K(i / N);
          const sd = (i % 2) ? 1 : -1;
          const w  = 34 + hash(i * 5) * 40;
          const h  = 70 + hash(i * 9) * 130;
          const dFar = 340 + hash(i * 13) * 200 + (i % 5) * 9;
          place(k, sd, dFar, [w, h, 28 + (i % 3) * 5], farCol);
          if (i % 4 === 0) {
            const dMid = 260 + hash(i * 17) * 100 + (i % 7) * 7;
            place(k, -sd, dMid, [w * 0.65, h * 1.15, 24 + (i % 2) * 4], midCol);
          }
        }
      }

      cityFront(0.90, 0.16, 1, 20, {
        minH: 55, maxH: 165, depth: 28, lit: true,
        palette: [WALL_CBD, WALL_LITE, WALL_CBD, [0.16, 0.18, 0.26]],
        windowCol: WIN_CYAN, floor: 18, step: 70,
      });
      cityFront(0.29, 0.35, 1, 104, {
        minH: 55, maxH: 165, depth: 28, lit: true,
        palette: [WALL_CBD, WALL_LITE, WALL_CBD, [0.16, 0.18, 0.26]],
        windowCol: WIN_CYAN, floor: 18, step: 95,
      });
      cityFront(0.00, 0.20, -1, 18, {
        minH: 26, maxH: 90, depth: 22, lit: true,
        palette: [WALL_WARM, WALL_CBD, [0.20, 0.18, 0.24], WALL_LITE],
        windowCol: WIN_WARM, floor: 14, step: 70,
      });
      cityFront(0.48, 0.88, -1, 18, {
        minH: 26, maxH: 95, depth: 22, lit: true,
        palette: [WALL_WARM, [0.22, 0.20, 0.26], WALL_CBD, WALL_LITE],
        floor: 14, step: 75,
      });

      {
        for (const [dist, baseW, h, capCol] of [
          [32, 22, 96, WIN_CYAN],
          [54, 18, 128, WIN_COOL],
          [78, 26, 112, WIN_CYAN],
          [102, 16, 148, WIN_COOL],
        ]) {
          tower(K(0.06), -1, dist, baseW, h, {
            col: WALL_CBD, cap: false, mast: false, seg: 8,
          });
          const a = anchor(K(0.06), -1, dist);
          const b = [a.r, a.u, a.t];
          seat.box(out, a.c, [baseW * 0.72, h, baseW * 0.72], WALL_CBD, b);
          seat.box(out, vadd(a.c, a.u, h - 0.3), [baseW * 0.62, 2.8, baseW * 0.62], capCol, b);
          addCyl(out, vadd(a.c, a.u, h + 2.5), 0.18, 16, [0.3, 0.3, 0.32], 4, b);
          seat.cone(out, vadd(a.c, a.u, h + 2.5 + 16 - 0.4), 2.8, 9, NEON[1], 6, b);
        }
      }

      {
        const k    = K(0.18);
        const a0   = anchor(k, 1, 150);
        const gy0  = terrainYAt(a0.c[0], a0.c[2]);
        const a    = {
          c: [a0.c[0], (gy0 == null ? a0.c[1] : gy0), a0.c[2]],
          r: a0.r, u: a0.u, t: a0.t,
        };
        const wall = [0.82, 0.84, 0.90];
        const winC = [0.62, 0.80, 1.00];
        const H      = 200;
        const gap    = 36;
        const TOWERW = 18;
        const LEAN   = 0.13;
        const tops   = [];

        modelGroup("marina-bay-sands", {
          center: vadd(a.c, a.u, H * 0.5 + 4),
          size: [100, H + 16, 40],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
        for (let t = -1; t <= 1; t++) {
          const base = vadd(a.c, a.r, t * gap);
          const tip = t === 0 ? 0 : -t * LEAN;
          let uT = a.u, rT = a.r, tT = a.t;
          if (tip !== 0) {
            const len = Math.hypot(a.u[0] + a.r[0] * tip, a.u[1], a.u[2] + a.r[2] * tip) || 1;
            uT = [(a.u[0] + a.r[0] * tip) / len, a.u[1] / len, (a.u[2] + a.r[2] * tip) / len];
            rT = a.r;
            tT = a.t;
          }
          const b = [rT, uT, tT];
          const dz = (t + 1) * 1.4 + t * 0.55;
          stage._mat = MAT.CONCRETE;
          seat.box(stage, base, [TOWERW, H, 28 + dz], wall, b);
          stage._mat = MAT.GLASS;
          seat.box(stage, vadd(base, uT, 0.4), [TOWERW * 0.78, H * 0.86, 20 + dz], winC, b);
          stage._mat = MAT.METAL;
          const finCol = t === 0 ? [0.90, 0.75, 0.30] : [0.40, 0.65, 1.00];
          seat.box(stage, vadd(base, uT, 0.55), [1.8, H * 0.68, 22 + dz], finCol, b);
          seat.box(stage, vadd(base, uT, H - 2.6), [TOWERW * 0.85, 2.5, 24 + dz], [0.92, 0.95, 1.00], b);
          tops.push(vadd(base, uT, H));
        }

        const deckY = Math.max(tops[0][1], tops[1][1], tops[2][1]);
        const bUp = [a.r, a.u, a.t];
        const spanR = Math.hypot(tops[2][0] - tops[0][0], tops[2][2] - tops[0][2]);
        const skyW  = Math.max(spanR + TOWERW, gap * 2 + TOWERW * 0.7);
        const midX = (tops[0][0] + tops[1][0] + tops[2][0]) / 3;
        const midZ = (tops[0][2] + tops[1][2] + tops[2][2]) / 3;
        stage._mat = MAT.CONCRETE;
        for (const top of tops) {
          const rise = deckY - top[1];
          if (rise > 0.05) {
            seat.box(stage, top, [TOWERW * 0.9, rise + 0.5, 26], wall, bUp);
          }
        }
        const mid = [midX, deckY - 0.3, midZ];
        stage._mat = MAT.WOOD;
        seat.box(stage, mid,                 [skyW * 0.92, 2.8, 28], [0.86, 0.82, 0.74], bUp);
        stage._mat = MAT.METAL;
        seat.box(stage, vadd(mid, a.u, 2.8), [skyW * 0.88, 1.0, 26], NEON[1],           bUp);
        stage._mat = MAT.GLASS;
        seat.box(stage, vadd(mid, a.u, 2.4), [skyW * 0.5, 0.7, 8],   WIN_GOLD,         bUp);
        stage._mat = 0;
        }, { required: true });
      }

      {
        const k       = K(0.22);
        const a       = anchor(k, 1, 90);
        const PETAL_H = 24;
        const BASE_R  = 22;
        for (let i = 0; i < 5; i++) {
          const ang   = (i / 5) * Math.PI * 2 + 0.3;
          const dx    = Math.cos(ang) * BASE_R * 0.65;
          const dz    = Math.sin(ang) * BASE_R * 0.65;
          const pc    = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                         a.c[1],
                         a.c[2] + a.r[2] * dx + a.t[2] * dz];
          addCone(out, pc, 6.5, PETAL_H,       [0.94, 0.95, 0.97], 9, [a.r, a.u, a.t]);
          addCone(out, pc, 4.8, PETAL_H * 0.6, [1.00, 0.92, 0.76], 8, [a.r, a.u, a.t]);
        }
        addCyl(out, vadd(a.c, a.u, 3), 5, 9, [0.82, 0.82, 0.86], 7, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 1.5), [BASE_R * 2 + 4, 0.6, BASE_R * 2 + 4], [0.70, 0.65, 0.50], [a.r, a.u, a.t]);
      }

      {
        const k = K(0.26);
        for (let i = 0; i < 11; i++) {
          const rowB  = i >= 6;
          const idx   = rowB ? i - 6 : i;
          const rowDist = rowB ? 90 : 70;
          const latOff = (idx - (rowB ? 2 : 2.5)) * 17;
          const depOff = rowB ? (idx % 2) * 10 : 0;
          const a    = anchor(k, 1, rowDist + depOff + latOff);
          const gy   = terrainYAt(a.c[0], a.c[2]);
          const c    = [a.c[0], (gy == null ? a.c[1] : gy), a.c[2]];
          const b    = [a.r, a.u, a.t];
          const h    = 28 + (idx % 4) * 9;
          const capR = 13 + (idx % 2) * 4;
          const trunkCol = [0.15, 0.36, 0.20];
          const glowA = NEON[(i % 2) ? 0 : 3];
          const glowB = NEON[(i + 1) % 4];
          seat.frustum(out, c, 1.6, 2.8, h, trunkCol, 7, b);
          seat.cone(out, vadd(c, a.u, h - 2), capR, 8, glowA, 9, b);
          seat.cone(out, vadd(c, a.u, h + 4), capR * 0.55, 5, glowB, 7, b);
        }
      }

      {
        const k = K(0.34);
        for (let i = 0; i < 5; i++) {
          const gap = 42 + i * 28;
          building(k, -1, gap, 24, 44 + i * 10, 24, {
            kind:   ["spire", "cylinder", "notch", "fin", "twin"][i % 5],
            wall:   WALL_WARM,
            window: i % 2 ? WIN_WARM : WIN_COOL,
            floor:  14,
          });
        }
        billboard(k,         -1, 12, 20, 12, NEON[0]);
        billboard(K(0.355),  -1, 11, 18, 11, NEON[1]);
        billboard(K(0.37),   -1, 10, 16, 10, NEON[2]);
        billboard(K(0.38),   -1, 10, 17, 11, NEON[3]);
      }


      for (const s of [0.20, 0.28, 0.38, 0.46, 0.80, 0.88]) {
        const a = anchor(K(s), 1, 74);
        for (let i = 0; i < 10; i++) {
          const c0  = vadd(a.c, a.t, (i - 4) * 11);
          const c   = [c0[0], pyMin - 0.82 - 0.14, c0[2]];
          const g   = terrainYAt(c[0], c[2]);
          if (g != null && g > c[1] + 0.2) continue;
          const hue = (i + Math.round(s * 17)) % 4;
          const inten = 0.45 + Math.sin(i * 0.8) * 0.20;
          const col   = [NEON[hue][0] * inten, NEON[hue][1] * inten, NEON[hue][2] * inten];
          addBox(out, c, [8, 0.4, 3], col, [a.r, a.u, a.t]);
        }
      }

      {
        const k = K(0.55);
        const a = anchor(k, -1, 42), b = [a.r, a.u, a.t];
        const STONE = [0.82, 0.74, 0.56];
        const TRIM = [1.00, 0.92, 0.68];
        modelGroup("singapore-fullerton-hotel", {
          center: vadd(a.c, a.u, 20), size: [52, 40, 38], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 13), [48, 26, 34], STONE, b);
          addBox(stage, vadd(a.c, a.u, 2.5), [50, 4.5, 36], [1.00, 0.82, 0.50], b);
          addBox(stage, vadd(a.c, a.u, 26.5), [49, 1.8, 35], TRIM, b);
          for (let floor = 0; floor < 4; floor++) {
            addBox(stage, vadd(vadd(a.c, a.r, 24.1), a.u, 7 + floor * 4.6),
              [0.5, 1.4, 29], WIN_GOLD, b);
          }
          for (let i = -4; i <= 4; i++) {
            const foot = vadd(vadd(a.c, a.r, 25.1), a.t, i * 3.5);
            addCyl(stage, foot, 0.55, 11.5, TRIM, 8, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, 25.1), a.u, 11.8),
            [2.2, 1.1, 32], TRIM, b);
          addBox(stage, vadd(a.c, a.u, 31), [17, 9, 15], STONE, b);
          addBox(stage, vadd(a.c, a.u, 35.8), [19, 0.9, 17], TRIM, b);
          addCyl(stage, vadd(a.c, a.u, 36.2), 5.2, 1.8, TRIM, 12, b);
          addCone(stage, vadd(a.c, a.u, 38), 4.8, 2.0, STONE, 12, b);
        }, { required: true });
      }

      {
        const k = K(0.62);
        const PALE = [0.88, 0.88, 0.92];
        const STEEL = [0.80, 0.80, 0.85];
        const emitTruss = (target, a) => {
          const b = [a.r, a.u, a.t];
          const points = [];
          const beam = (p0, p1, thick) => {
            const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
            const len = Math.hypot(dx, dy, dz);
            const f = [dx / len, dy / len, dz / len];
            const u = [
              f[1] * a.r[2] - f[2] * a.r[1],
              f[2] * a.r[0] - f[0] * a.r[2],
              f[0] * a.r[1] - f[1] * a.r[0],
            ];
            const ul = Math.hypot(u[0], u[1], u[2]) || 1;
            addBox(target,
              [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, (p0[2] + p1[2]) * 0.5],
              [thick, thick, len], PALE, [a.r, [u[0] / ul, u[1] / ul, u[2] / ul], f]);
          };
          for (let j = 0; j < 7; j++) {
            const t = j / 6;
            const deck = vadd(a.c, a.t, (t - 0.5) * 48);
            const h = 5.8 + Math.sin(t * Math.PI) * 5.5;
            const top = vadd(deck, a.u, h);
            points.push(top);
            addCyl(target, deck, 0.42, h, STEEL, 6, b);
            if (j > 0) {
              beam(points[j - 1], top, 0.75);
              const low = vadd(vadd(a.c, a.t, (t - 0.5) * 48 - 8), a.u, 1.0);
              beam(j % 2 ? low : vadd(deck, a.u, 1.0), j % 2 ? top : points[j - 1],
                j % 2 ? 0.51 : 0.45);
            }
          }
          addBox(target, vadd(a.c, a.u, 1.0), [1.1, 1.0, 52], STEEL, b);
          for (let j = -1; j <= 1; j++) {
            const c = vadd(a.c, a.t, j * 18);
            addCyl(target, c, 0.12, 4.5, [0.72, 0.72, 0.75], 5, b);
            addBox(target, vadd(c, a.u, 4.6), [0.6, 0.6, 0.6], WIN_WARM, b);
          }
        };
        const left = anchor(k, -1, 4);
        modelGroup("singapore-anderson-bridge", {
          center: vadd(left.c, left.u, 6.2), size: [3.2, 13, 54],
          basis: [left.r, left.u, left.t],
        }, (stage) => emitTruss(stage, left), { required: true });
        emitTruss(out, anchor(k, 1, 4));
      }

      {
        const a = anchor(K(0.635), -1, 82), b = [a.r, a.u, a.t];
        const CIVIC = [0.76, 0.75, 0.71];
        const FRAME = [0.88, 0.87, 0.82];
        const GLASS = [0.30, 0.42, 0.52];
        modelGroup("singapore-parliament-house", {
          center: vadd(a.c, a.u, 13), size: [42, 27, 58], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 9.5), [38, 19, 54], CIVIC, b);
          addBox(stage, vadd(vadd(a.c, a.r, 19.1), a.u, 11),
            [0.5, 12, 46], GLASS, b);
          for (let i = -5; i <= 5; i++) {
            addBox(stage, vadd(vadd(vadd(a.c, a.r, 19.5), a.t, i * 4.3), a.u, 11),
              [0.9, 14, 0.65], FRAME, b);
          }
          addBox(stage, vadd(a.c, a.u, 19.8), [41, 1.6, 57], FRAME, b);
          addBox(stage, vadd(vadd(a.c, a.t, -8), a.u, 23),
            [20, 6.5, 24], GLASS, b);
          addBox(stage, vadd(vadd(vadd(a.c, a.r, 10.1), a.t, -8), a.u, 23),
            [0.8, 6.8, 24], WIN_COOL, b);
        }, { required: true });
      }

      {
        const k = K(0.66);
        const DOME_SEP = 28;
        const SILVER = [0.72, 0.74, 0.78];
        const SILVER_HI = [0.86, 0.88, 0.92];
        const SPIKE = [0.78, 0.80, 0.84];
        for (let i = 0; i < 2; i++) {
          const a0 = anchor(k, -1, 44 + i * DOME_SEP);
          const gy = terrainYAt(a0.c[0], a0.c[2]);
          const a  = {
            c: [a0.c[0], (gy == null ? a0.c[1] : gy), a0.c[2]],
            r: a0.r, u: a0.u, t: a0.t,
          };
          const b = [a.r, a.u, a.t];
          modelGroup(`singapore-esplanade-${i}`, {
            center: vadd(a.c, a.u, 14), size: [34, 32, 34], basis: b,
          }, (stage) => {
            seat.frustum(stage, a.c, 15.5, 13.0, 6, SILVER, 10, b);
            seat.frustum(stage, vadd(a.c, a.u, 6), 13.0, 9.5, 6, SILVER_HI, 10, b);
            seat.frustum(stage, vadd(a.c, a.u, 12), 9.5, 5.0, 5, SILVER, 9, b);
            seat.cone(stage, vadd(a.c, a.u, 17), 5.0, 4.5, SILVER_HI, 8, b);
            for (let r = 0; r < 12; r++) {
              const ang = (r / 12) * Math.PI * 2;
              const dx  = Math.cos(ang) * 11;
              const dz  = Math.sin(ang) * 11;
              const rc  = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                           a.c[1],
                           a.c[2] + a.r[2] * dx + a.t[2] * dz];
              seat.box(stage, vadd(rc, a.u, 8), [1.1, 14, 1.1], SPIKE, b);
              const tip = [a.c[0] + a.r[0] * dx * 0.55 + a.t[0] * dz * 0.55,
                           a.c[1],
                           a.c[2] + a.r[2] * dx * 0.55 + a.t[2] * dz * 0.55];
              seat.cone(stage, vadd(tip, a.u, 16), 1.4, 4.2, SPIKE, 5, b);
            }
          }, { required: true });
        }
        const ta0 = anchor(k, -1, 26);
        const tgy = terrainYAt(ta0.c[0], ta0.c[2]);
        const ta  = {
          c: [ta0.c[0], (tgy == null ? ta0.c[1] : tgy), ta0.c[2]],
          r: ta0.r, u: ta0.u, t: ta0.t,
        };
        seat.box(out, ta.c, [40, 0.5, 55], [0.30, 0.28, 0.24], [ta.r, ta.u, ta.t]);
      }

      place(K(0.70), -1, 46, [70, 1.5, 70], [0.06, 0.10, 0.06]);

      {
        const k = K(0.714);
        const a = anchor(k, -1, 100);
        const CREAM    = [0.82, 0.76, 0.58];
        const CREAM_HI = [0.90, 0.85, 0.70];
        const W = 46, H = 20, D = 64;
        addBox(out, vadd(a.c, a.u, H * 0.5), [W, H, D], CREAM, [a.r, a.u, a.t]);
        const COLN = 10;
        const face = W * 0.5 + 0.85;
        for (let i = 0; i < COLN; i++) {
          const off = (i - (COLN - 1) / 2) * (D * 0.82 / (COLN - 1));
          const c = vadd(vadd(a.c, a.r, face), a.t, off);
          addCyl(out, vadd(c, a.u, H * 0.28), 1.0, H * 0.56, CREAM_HI, 8, [a.r, a.u, a.t]);
        }
        addPrism(out, vadd(vadd(a.c, a.r, face), a.u, H * 0.60),
          [W * 0.30, H * 0.20, D * 0.42], CREAM_HI, [a.r, a.u, a.t]);
        {
          const domeC = vadd(vadd(a.c, a.t, D * 0.30), a.u, H);
          addCyl(out, domeC, 8.5, 2.6, CREAM_HI, 12, [a.r, a.u, a.t]);
          addCone(out, vadd(domeC, a.u, 2.6), 7.6, 4.4, CREAM, 12, [a.r, a.u, a.t]);
          addCyl(out, vadd(domeC, a.u, 7.4), 0.5, 2.0, CREAM_HI, 6, [a.r, a.u, a.t]);
        }
        addBox(out, vadd(vadd(a.c, a.r, face + 0.4), a.u, 1.2), [1.4, 2.4, D * 0.9],
          [1.00, 0.90, 0.66], [a.r, a.u, a.t]);
      }

      {
        const a = anchor(K(0.722), -1, 168), b = [a.r, a.u, a.t];
        const STONE  = [0.80, 0.78, 0.73];
        const FIN    = [0.86, 0.84, 0.79];
        const GLASS  = [0.34, 0.40, 0.48];
        const LITWIN = [0.92, 0.86, 0.62];
        modelGroup("singapore-supreme-court", {
          center: vadd(a.c, a.u, 26), size: [52, 58, 86], basis: b,
        }, (stage) => {
          const W = 40, H = 34, D = 78;
          addBox(stage, vadd(a.c, a.u, H * 0.5), [W, H, D], GLASS, b);
          const FINS = 26;
          for (let i = 0; i < FINS; i++) {
            const off = (i - (FINS - 1) / 2) * (D * 0.94 / (FINS - 1));
            addBox(stage, vadd(vadd(vadd(a.c, a.r, W * 0.5), a.t, off), a.u, H * 0.5),
                   [0.9, H, 1.5], FIN, b);
          }
          for (let f = 1; f < 6; f++) {
            addBox(stage, vadd(vadd(a.c, a.r, W * 0.46), a.u, f * (H / 6)),
                   [0.5, 1.5, D * 0.9], LITWIN, b);
          }
          addBox(stage, vadd(a.c, a.u, H + 0.9), [W + 2, 1.8, D + 2], STONE, b);
          const dc = vadd(vadd(a.c, a.r, W * 0.30), a.u, H + 2.4);
          addCyl(stage, dc, 5.0, 4.5, STONE, 10, b);
          addFrustum(stage, vadd(dc, a.u, 4.0), 12.5, 17.5, 3.2, STONE, 20, b);
          addCyl(stage, vadd(dc, a.u, 7.0), 17.8, 1.5, LITWIN, 20, b);
          addFrustum(stage, vadd(dc, a.u, 8.4), 17.5, 13.0, 3.0, FIN, 20, b);
          addCyl(stage, vadd(dc, a.u, 11.3), 12.6, 0.8, STONE, 20, b);
        });
      }

      {
        const a = anchor(K(0.690), -1, 126), b = [a.r, a.u, a.t];
        const WHITE = [0.93, 0.92, 0.89];
        const SHADE = [0.84, 0.83, 0.80];
        const ROOF  = [0.42, 0.44, 0.46];
        modelGroup("singapore-st-andrews", {
          center: vadd(a.c, a.u, 18), size: [26, 46, 58], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 7.0), [18, 14, 46], WHITE, b);
          addPrism(stage, vadd(a.c, a.u, 15.6), [19, 3.6, 47], ROOF, b);
          for (let i = -3; i <= 3; i++) {
            addBox(stage, vadd(vadd(vadd(a.c, a.r, 9.4), a.t, i * 6.4), a.u, 5.6),
                   [1.6, 11.2, 1.5], SHADE, b);
          }
          for (let i = -3; i < 4; i++) {
            addBox(stage, vadd(vadd(vadd(a.c, a.r, 9.0), a.t, i * 6.4 + 3.2), a.u, 8.2),
                   [0.3, 6.0, 1.6], [0.88, 0.80, 0.55], b);
          }
          const tc = vadd(a.c, a.t, -29);
          addBox(stage, vadd(tc, a.u, 13), [11, 26, 11], WHITE, b);
          addBox(stage, vadd(tc, a.u, 26.6), [12.2, 1.2, 12.2], SHADE, b);
          for (const [dx, dz] of [[-5.2, -5.2], [5.2, -5.2], [-5.2, 5.2], [5.2, 5.2]]) {
            addPyramid(stage, vadd(vadd(vadd(tc, a.r, dx), a.t, dz), a.u, 28.4),
                       [1.8, 4.4, 1.8], WHITE, b);
          }
          addPyramid(stage, vadd(tc, a.u, 27.2), [10.4, 15.5, 10.4], WHITE, b);
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(tc, a.u, 42.6), 0.10, 2.4, [0.72, 0.70, 0.64], 4, b);
          stage._mat = 0;
        });
      }

      {
        const k = K(0.703);
        const a = anchor(k, 1, 34);
        const WHITE_COL = [0.88, 0.87, 0.84];
        addBox(out, vadd(a.c, a.u, 4.0), [16, 8, 24], WHITE_COL, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.4), [18, 0.6, 26], [0.30, 0.32, 0.34], [a.r, a.u, a.t]);
        for (const off of [-9, -3, 3, 9]) {
          const c = vadd(vadd(a.c, a.r, 7.6), a.t, off);
          addCyl(out, vadd(c, a.u, 3.4), 0.3, 6.8, WHITE_COL, 6, [a.r, a.u, a.t]);
        }
        const cupC = vadd(a.c, a.u, 8.9);
        addCyl(out, cupC, 1.8, 1.6, WHITE_COL, 8, [a.r, a.u, a.t]);
        addCone(out, vadd(cupC, a.u, 1.6), 1.6, 2.2, [0.30, 0.32, 0.34], 8, [a.r, a.u, a.t]);
        addCyl(out, vadd(cupC, a.u, 3.6), 0.1, 1.4, WHITE_COL, 4, [a.r, a.u, a.t]);
      }

      {
        const k = K(0.80);
        const a = anchor(k, 1, 32);
        for (let j = 0; j < 16; j++) {
          const t2  = j / 15;
          const ang = t2 * Math.PI;
          const up  = Math.sin(ang) * 13;
          const c   = vadd(vadd(a.c, a.t, (t2 - 0.5) * 66), a.u, up + 2);
          if (j % 5 === 0) {
            const gy = groundUnder(c[0], c[2]) - 0.5;
            const ph = c[1] - gy + 1.0;
            if (ph > 0) addCyl(out, [c[0], gy, c[2]], 1.1, ph, [0.62, 0.64, 0.68], 6);
          }
          addCyl(out, c, 2.4, 4.4, [0.88, 0.90, 0.95], 6, [a.r, a.u, a.t]);
          const barOff = Math.sin(t2 * 11) * 5.5;
          addBox(out, vadd(c, a.r, barOff), [0.9, 1.4, 1.6], [0.86, 0.88, 0.93], [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.r, barOff / 2), [Math.abs(barOff) + 0.6, 0.4, 0.4],
                 [0.86, 0.88, 0.93], [a.r, a.u, a.t]);
          if (j % 2 === 0)
            addBox(out, vadd(c, a.t, Math.cos(t2 * 7) * 3.5), [0.7, 1.1, 5.2], [0.83, 0.85, 0.90], [a.r, a.u, a.t]);
          if (j % 3 === 0) {
            addBox(out, vadd(vadd(c, a.r,  3.2), a.u, 0.8), [0.5, 0.5, 0.5], NEON[1], [a.r, a.u, a.t]);
            addBox(out, vadd(vadd(c, a.r, -3.2), a.u, 0.8), [0.5, 0.5, 0.5], NEON[1], [a.r, a.u, a.t]);
          }
        }
      }

      {
        const k = K(0.86);
        const a0 = anchor(k, 1, 58);
        const gy = terrainYAt(a0.c[0], a0.c[2]);
        const a  = {
          c: [a0.c[0], (gy == null ? a0.c[1] : gy), a0.c[2]],
          r: a0.r, u: a0.u, t: a0.t,
        };
        const radius = 44;
        const hub = vadd(a.c, a.u, radius + 5);
        const CYAN_RIM = [0.40, 0.80, 1.00];
        const STEEL = [0.30, 0.32, 0.38];
        modelGroup("singapore-flyer", {
          center: hub,
          size: [12, radius * 2 + 16, radius * 2 + 16],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
          const rim = [];
          const seg = 18;
          stage._mat = MAT.METAL;
          for (const along of [-4.5, 4.5]) {
            const foot = vadd(a.c, a.t, along);
            seat.box(stage, foot, [1.6, radius + 5, 1.6], STEEL, [a.r, a.u, a.t]);
          }
          const strut = (p0, p1, thick, col, ax) => {
            const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
            const len = Math.hypot(d[0], d[1], d[2]) || 1;
            const axis = [d[0] / len, d[1] / len, d[2] / len];
            const face = [
              a.r[1] * axis[2] - a.r[2] * axis[1],
              a.r[2] * axis[0] - a.r[0] * axis[2],
              a.r[0] * axis[1] - a.r[1] * axis[0],
            ];
            const o = ax || 0;
            addBox(stage,
              [(p0[0] + p1[0]) / 2 + a.r[0] * o,
               (p0[1] + p1[1]) / 2 + a.r[1] * o,
               (p0[2] + p1[2]) / 2 + a.r[2] * o],
              [thick, len, thick], col, [a.r, axis, face]);
          };
          for (let i = 0; i < seg; i++) {
            const ang = (i / seg) * Math.PI * 2;
            rim.push(vadd(vadd(hub, a.t, Math.cos(ang) * radius), a.u, Math.sin(ang) * radius));
          }
          const HUB_R = 2.0;
          for (let i = 0; i < seg; i++) {
            const d = [rim[i][0] - hub[0], rim[i][1] - hub[1], rim[i][2] - hub[2]];
            const L = Math.hypot(d[0], d[1], d[2]) || 1;
            const root = [hub[0] + d[0] / L * HUB_R, hub[1] + d[1] / L * HUB_R,
                          hub[2] + d[2] / L * HUB_R];
            strut(root, rim[i], 0.30, STEEL, i % 2 ? 0.06 : -0.06);
            strut(rim[i], rim[(i + 1) % seg], 0.42, CYAN_RIM, i % 2 ? -0.06 : 0.06);
            const cabCol = i % 2 ? CYAN_RIM : [0.85, 0.90, 1.00];
            addBox(stage, vadd(rim[i], a.u, -1.3), [2.6, 2.4, 2.6], cabCol, [a.r, a.u, a.t]);
          }
          addBox(stage, hub, [3.8, 3.8, 3.8], [0.55, 0.72, 0.90], [a.r, a.u, a.t]);
          for (let i = 0; i < seg; i += 2) {
            addBox(stage, rim[i], [0.7, 0.7, 0.7], CYAN_RIM, [a.r, a.u, a.t]);
          }
          stage._mat = 0;
        }, { required: true });
      }

      {
        billboard(K(0.92),  1,  11, 18, 11, NEON[3]);
        billboard(K(0.92), -1,  11, 18, 11, NEON[2]);
        billboard(K(0.94),  1,  10, 16, 10, NEON[1]);
        billboard(K(0.94), -1,  10, 16, 10, NEON[0]);
        billboard(K(0.96),  1,  10, 16, 10, NEON[0]);
        billboard(K(0.96), -1,  10, 17, 11, NEON[3]);
        billboard(K(0.98),  1,  10, 15, 10, NEON[2]);
      }
      cityFront(0.955, 0.04, -1, 14, {
        minH: 12, maxH: 24, depth: 16, lit: true,
        palette: [WALL_WARM, [0.24, 0.22, 0.18], WALL_WARM, [0.20, 0.19, 0.16]],
        windowCol: WIN_WARM, floor: 4, step: 28,
      });

      for (const s of [0.20, 0.30, 0.42, 0.82, 0.88]) {
        const a = anchor(K(s), 1, 24);
        const drop = s === 0.30 ? 0.6 : 0;
        addBox(out, vadd(a.c, a.u, 3.0 - drop), [3.5, 1.8, 28], WIN_WARM, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 0.8), [3.8, 1.2, 28], NEON[1],  [a.r, a.u, a.t]);
      }

      const BAY = [0.05, 0.07, 0.13];

      floodMastRing(38, { h: 24, dist: 11, cool: false, pool: false, arms: 3 });

      if (circuitKit) {
        circuitKit.raceControl({
          id: "kit:singapore:pit-race-control", frac: 0.999, side: -1, gap: 46,
          size: [14, 34, 16], required: true,
        });
        {
          const a = anchor(kitNode(0.999), 1, 53);
          addCone(out, vadd(a.c, a.u, 33.9), 2.2, 6, NEON[1], 6, [a.r, a.u, a.t]);
        }
      }

      {
        const SAGE = [0.42, 0.52, 0.44];
        const SAGE_D = [0.32, 0.40, 0.34];
        const GLASS = [0.55, 0.78, 0.88];
        const a0 = anchor(K(0.01), -1, 38);
        const gy = terrainYAt(a0.c[0], a0.c[2]);
        const a  = {
          c: [a0.c[0], (gy == null ? a0.c[1] : gy), a0.c[2]],
          r: a0.r, u: a0.u, t: a0.t,
        };
        if (!onTrack(a.c[0], a.c[2], 22)) {
          const b = [a.r, a.u, a.t];
          modelGroup("singapore-pit-wave-roof", {
            center: vadd(a.c, a.u, 10), size: [28, 22, 62], basis: b,
          }, (stage) => {
            seat.box(stage, a.c, [22, 12, 56], SAGE_D, b);
            seat.box(stage, vadd(vadd(a.c, a.r, 11.1), a.u, 2), [0.4, 8, 48], GLASS, b);
            for (let i = 0; i < 5; i++) {
              const rc = vadd(vadd(a.c, a.t, (i - 2) * 10), a.u, 12 + Math.sin(i * 1.1) * 1.8);
              seat.box(stage, rc, [24 + i * 0.2, 1.2, 12], i % 2 ? SAGE : SAGE_D, b);
            }
            seat.box(stage, vadd(a.c, a.u, 0.2), [24, 0.6, 58], [0.22, 0.28, 0.24], b);
          }, { required: true });
        }
      }

      grandstandEx(0.99,  1, 12, 62, null, null,
        { livery: "scaffold", tiers: 3, roof: "truss", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.02,  1, 12, 62, null, null,
        { livery: "teal", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.05,  1, 12, 50, null, null,
        { livery: "darkSteel", tiers: 1, roof: "flat" });
      grandstandEx(0.70, -1, 30, 48, null, null,
        { livery: "scaffold", tiers: 2, roof: "truss", endWalls: true });

      const SL = Math.round(api.def._sceneryShift * 1e4) / 1e4;
      gantry(SL, 7.5, [0.12, 0.12, 0.16]);
      gantry(0.5, 7.0, [0.12, 0.12, 0.16]);
      overheadSpan({
        id: "start-light-cluster", frac: SL, clearance: 6.9,
        thickness: 1.4, depth: 1.6, span: 4.5, startLights: true,
        color: [0.10, 0.10, 0.12], required: true, supports: false,
      });

      for (const s of [0.07, 0.16, 0.28, 0.36, 0.47, 0.60, 0.68, 0.76, 0.84, 0.94]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 7);
      }

      const SG_FENCE_GAP = 1.7, SG_FENCE_BACK = 2.6, SG_FENCE_COL = [0.56, 0.60, 0.66];
      const SG_FENCE = { style: "panelled", postCol: [0.30, 0.32, 0.36] };
      const SG_TYRES = [
        [0.085, 0.10, 1], [0.235, 0.25, -1], [0.475, 0.49, -1],
        [0.66, 0.675,  1], [0.82, 0.835,  -1],
      ];
      const sgFence = (s0, s1, side) => {
        let a = s0;
        for (const [t0, t1, ts] of SG_TYRES) {
          if (ts !== side || t1 <= s0 || t0 >= s1) continue;
          if (t0 > a) fence(a, t0, side, SG_FENCE_GAP, 3.4, SG_FENCE_COL, SG_FENCE);
          fence(Math.max(a, t0), Math.min(s1, t1), side, SG_FENCE_BACK, 3.4, SG_FENCE_COL, SG_FENCE);
          a = Math.min(s1, t1);
        }
        if (s1 > a) fence(a, s1, side, SG_FENCE_GAP, 3.4, SG_FENCE_COL, SG_FENCE);
      };
      for (const [s0, s1, side] of [
        [0.00, 0.998, -1], [0.00, 0.485, 1], [0.582, 0.998, 1],
      ]) sgFence(s0, s1, side);

      for (const [s0, s1, side] of SG_TYRES) {
        tyreWall(s0, s1, side, 1.6, NEON[K(s0) % 4]);
      }

      every(26, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 5 + side) < 0.30) continue;
          palm(k, side, 8 + hash(k + side) * 5, 9 + hash(k * 2 + side) * 5, [0.18, 0.42, 0.20]);
        }
      });
      every(62, (k) => {
        if (hash(k * 9) < 0.60) return;
        bush(k, hash(k) < 0.5 ? -1 : 1, 8 + hash(k) * 5, [0.14, 0.36, 0.18]);
      });

      for (const [s, side, hue, w, h] of [
        [0.04,  1, 1, 16, 10], [0.08,  1, 2, 15, 9],  [0.14, -1, 0, 17, 10],
        [0.24, -1, 3, 14, 9],  [0.31,  1, 1, 18, 10], [0.36,  1, 0, 15, 9],
        [0.50, -1, 2, 16, 10], [0.53, -1, 1, 14, 9],  [0.58,  1, 3, 17, 10],
        [0.72,  1, 1, 15, 9],  [0.77,  1, 2, 18, 10],  [0.84, -1, 0, 16, 9],
      ]) {
        billboard(K(s), side, 11, w, h, NEON[hue]);
      }
      {
        const RING_N = 14;
        for (let i = 0; i < RING_N; i++) {
          const sf = (i + 0.5 + (hash(i * 3.3) - 0.5) * 0.6) / RING_N;
          if (sf > 0.895 && sf < 0.995) continue;
          const side = hash(i * 1.7) < 0.5 ? -1 : 1;
          billboard(K(sf), side, 9.5, 10 + hash(i * 4.1) * 6, 4.5 + hash(i * 2.1) * 2, NEON[i % 4]);
        }
      }
      sponsorHoarding(0.895, 0.995, 1, 5, { h: 1.2, step: 11 });

      const SGP_LIV = ["scaffold", "teal", "darkSteel"];
      let standIdx = 0;
      for (const [s, side, gap, len] of [
        [0.115, -1, 14, 52], [0.150,  1, 16, 46], [0.245, -1, 14, 48],
        [0.330, -1, 15, 44], [0.415,  1, 16, 50], [0.500, -1, 14, 46],
        [0.585,  1, 15, 48], [0.640, -1, 14, 44], [0.700,  1, 16, 46],
        [0.865, -1, 15, 50], [0.905,  1, 14, 48],
      ]) {
        const tiers = hash(K(s) * 3.1) < 0.35 ? 2 : 1;
        grandstandEx(s, side, gap, len, null, null, {
          livery: SGP_LIV[standIdx++ % SGP_LIV.length], tiers,
          roof: tiers > 1 ? "cantilever" : "truss",
          endWalls: hash(K(s) * 1.7) < 0.4,
        });
      }
      const SCAF_TUBE = [0.58, 0.60, 0.64];
      const SCAF_DECK = [0.66, 0.68, 0.71];
      const SCAF_MESH = [0.13, 0.15, 0.18];
      const SCAF_FANS = [
        [0.86, 0.86, 0.88], [0.72, 0.24, 0.22], [0.30, 0.40, 0.58],
        [0.84, 0.72, 0.36], [0.50, 0.52, 0.56], [0.78, 0.80, 0.84],
      ];
      function scaffoldBay(s, side, gap, len, rows, banner) {
        const k = K(s);
        const probe = anchor(k, side, gap);
        if (onTrack(probe.c[0], probe.c[2], len * 0.4)) return;
        const half = (len / 2) / (n * ds);
        recordBarrier(s - half, s + half, side, gap);
        const a = anchor(k, side, gap + 5.2);
        const b = [a.r, a.u, a.t];
        const IN = -side;
        const bays = Math.max(3, Math.round(len / 6.4));
        const pitch = len / bays;
        const topH = 2.2 + rows * 1.34;
        const run = 9.0, dl = Math.hypot(run, topH);
        const dv = [(a.r[0] * run * IN + a.u[0] * topH) / dl,
                    (a.r[1] * run * IN + a.u[1] * topH) / dl,
                    (a.r[2] * run * IN + a.u[2] * topH) / dl];
        const pv = [(-a.r[0] * topH * IN + a.u[0] * run) / dl,
                    (-a.r[1] * topH * IN + a.u[1] * run) / dl,
                    (-a.r[2] * topH * IN + a.u[2] * run) / dl];
        for (let i = 0; i <= bays; i++) {
          const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(p, a.u, 0.2), [11.0, 0.4, 1.5], [0.42, 0.43, 0.46], b);
          out._mat = MAT.METAL;
          addCyl(out, vadd(p, a.r, IN * 4.5), 0.13, 2.6, SCAF_TUBE, 5, b);
          addCyl(out, vadd(p, a.r, -IN * 4.5), 0.13, topH + 1.9, SCAF_TUBE, 5, b);
          addBox(out, vadd(p, a.u, topH * 0.5), [0.13, dl, 0.13], SCAF_TUBE, [pv, dv, a.t]);
          addBox(out, vadd(p, a.u, topH * 0.36), [9.2, 0.11, 0.11], SCAF_TUBE, b);
          addBox(out, vadd(p, a.u, topH * 0.74), [9.2, 0.11, 0.11], SCAF_TUBE, b);
          out._mat = 0;
        }
        for (let t = 0; t < rows; t++) {
          const lat = IN * (4.0 - t * 1.22), y = 1.4 + t * 1.34;
          out._mat = MAT.METAL;
          addBox(out, vadd(vadd(a.c, a.r, lat), a.u, y), [1.22, 0.14, len], SCAF_DECK, b);
          out._mat = MAT.FABRIC;
          addBox(out, vadd(vadd(a.c, a.r, lat), a.u, y + 0.5), [0.86, 0.86, len - 2],
                 SCAF_FANS[t % SCAF_FANS.length], b);
          const cnt = Math.min(10, Math.floor(len / 8));
          for (let c = 0; c < cnt; c++) {
            if (hash(k * 11 + t * 41 + c * 17) < 0.5) continue;
            const off = (c / Math.max(1, cnt - 1) - 0.5) * (len - 6);
            addBox(out, vadd(vadd(vadd(a.c, a.r, lat), a.t, off), a.u, y + 1.05),
                   [0.9, 0.95, 1.5], SCAF_FANS[(c + t * 3) % SCAF_FANS.length], b);
          }
          out._mat = 0;
        }
        out._mat = MAT.METAL;
        addBox(out, vadd(vadd(a.c, a.r, -IN * 4.6), a.u, topH * 0.55 + 0.9),
               [0.1, topH * 1.1, len], SCAF_MESH, b);
        out._mat = 0;
        addBox(out, vadd(vadd(a.c, a.r, IN * 4.9), a.u, 1.5), [0.2, 1.9, len], banner, b);
        addBox(out, vadd(vadd(a.c, a.r, IN * 4.2), a.u, 0.55), [1.4, 0.3, len - 2],
               [1.10, 0.94, 0.62], b);
      }
      for (const [s, side, gap, len, rows, banner] of [
        [0.060, -1, 15, 44, 7, NEON[1]], [0.205,  1, 15, 42, 6, NEON[2]],
        [0.290,  1, 16, 44, 7, NEON[0]], [0.455, -1, 15, 42, 6, NEON[3]],
        [0.545,  1, 15, 44, 7, NEON[1]], [0.815, -1, 16, 46, 8, NEON[2]],
      ]) {
        scaffoldBay(s, side, gap, len, rows, banner);
      }
      for (const [s, side] of [[0.09, 1], [0.24, -1], [0.36, 1], [0.48, -1],
                               [0.56, 1], [0.67, 1], [0.72, -1], [0.83, -1]]) {
        place(K(s), side, 2.2, [0.5, 0.22, 8], [0.86, 0.16, 0.16]);
        place(K(s), side, 3.2, [1.6, 0.18, 8], [0.92, 0.92, 0.94]);
      }

      for (const [s, side, seedOff] of [
        [0.12, -1, 0], [0.50, -1, 3], [0.58, 1, 6], [0.74, -1, 9], [0.06, 1, 12],
      ]) {
        const dist = 210 + hash(K(s) * 3 + seedOff) * 70;
        const H    = 160 + hash(K(s) * 3 + seedOff + 1) * 100;
        const baseW = 28;
        const winCol = hash(K(s)) < 0.5 ? WIN_CYAN : WIN_COOL;
        tower(K(s), side, dist, baseW, H, {
          col: WALL_CBD, cap: false, mast: false, seg: 8,
        });
        {
          const a = anchor(K(s), side, dist);
          const b = [a.r, a.u, a.t];
          seat.box(out, a.c, [baseW * 0.72, H, baseW * 0.72], WALL_CBD, b);
          seat.box(out, vadd(a.c, a.u, H - 0.3), [baseW * 0.62, 2.8, baseW * 0.62], winCol, b);
          addCyl(out, vadd(a.c, a.u, H + 2.5), 0.18, 18, [0.3, 0.3, 0.32], 4, b);
          seat.cone(out, vadd(a.c, a.u, H + 2.5 + 18 - 0.4), 3.0, 10, NEON[1], 6, b);
        }
      }

      waterBand(0.26, 0.36, 1, 40, 104, 8, BAY, { id: "marina-water-30", required: true });
      waterBand(0.80, 0.90, 1, 40, 104, 8, BAY, { id: "marina-water-84", required: true });

      for (const [s, gap, w, h, d] of [
        [0.390, 34, 30, 48, 24],
        [0.410, 54, 34, 62, 26],
        [0.430, 76, 38, 76, 28],
      ]) {
        building(K(s), -1, gap, w, h, d, {
          wall: WALL_WARM, window: WIN_GOLD, floor: 6, lit: true, roof: true,
        });
        const a = anchor(K(s), -1, gap + w * 0.5);
        addBox(out, vadd(a.c, a.u, h + 0.9), [w + 1.2, 1.4, d + 1.2],
          [1.00, 0.88, 0.58], [a.r, a.u, a.t]);
      }

      for (const [s, dist, baseW, h, capCol] of [
        [0.460, 150, 30, 138, WIN_CYAN],
        [0.490, 188, 34, 176, WIN_COOL],
        [0.520, 226, 28, 154, WIN_GOLD],
      ]) {
        tower(K(s), 1, dist, baseW, h, {
          col: WALL_CBD, cap: false, mast: false, seg: 8,
        });
        {
          const a = anchor(K(s), 1, dist);
          const b = [a.r, a.u, a.t];
          seat.box(out, a.c, [baseW * 0.72, h, baseW * 0.72], WALL_CBD, b);
          seat.box(out, vadd(a.c, a.u, h - 0.3), [baseW * 0.62, 2.8, baseW * 0.62], capCol, b);
          addCyl(out, vadd(a.c, a.u, h + 2.5), 0.18, 14, [0.3, 0.3, 0.32], 4, b);
        }
      }

      for (const [s, gap, depth] of [[0.20, 52, 52], [0.44, 58, 58]]) {
        waterBand(s - 0.03, s + 0.03, 1, gap, gap + depth, 8, BAY, {
          id: `marina-water-depth-${Math.round(s * 100)}`,
        });
        const a = anchor(K(s), 1, 30);
        for (let i = -2; i <= 2; i++) {
          const c = vadd(vadd(a.c, a.t, i * 9), a.u, 1.2);
          addBox(out, c, [1.0, 2.0, 5.5], i % 2 ? WIN_GOLD : WIN_CYAN,
            [a.r, a.u, a.t]);
        }
      }

      grandstandEx(0.735, -1, 22, 54, null, null,
        { livery: "teal", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      grandstandEx(0.765,  1, 26, 48, null, null,
        { livery: "scaffold", tiers: 1, roof: "truss" });
      grandstandEx(0.785, -1, 24, 46, null, null,
        { livery: "darkSteel", tiers: 1, roof: "cantilever" });

      overheadSpan({
        id: "bayfront-pedestrian-link", frac: 0.445, clearance: 7.4,
        thickness: 0.8, depth: 2.6, supportGap: 4.2,
        color: [0.30, 0.48, 0.66],
      });

      for (const [s, side] of [
        [0.500, -1], [0.525, -1], [0.550, -1], [0.575, -1],
        [0.705,  1], [0.730,  1], [0.755,  1], [0.780,  1],
      ]) {
        const k = K(s);
        const h = 10 + hash(k * 11) * 3;
        palm(k, side, 14, h, [0.18, 0.46, 0.22]);
        palm(k, side, 22, h + 2, [0.14, 0.38, 0.18]);
        bush(k, side, 10, [0.16, 0.40, 0.18]);
      }

      waterBand(0.545, 0.615, 1, 42, 110, 8, BAY, {
        id: "marina-water-merlion", required: true,
      });
      {
        const a0 = anchor(K(0.58), 1, 38);
        const gy = terrainYAt(a0.c[0], a0.c[2]);
        const a  = {
          c: [a0.c[0], (gy == null ? a0.c[1] : gy), a0.c[2]],
          r: a0.r, u: a0.u, t: a0.t,
        };
        if (!onTrack(a.c[0], a.c[2], 12)) {
          const b    = [a.r, a.u, a.t];
          const jetB = [a.t, a.r, a.u];
          const WHITE = [0.94, 0.95, 0.97];
          const SHADE = [0.82, 0.84, 0.88];
          const MANE  = [0.88, 0.90, 0.94];
          const emitMerlion = (stage) => {
            stage._mat = MAT.CONCRETE;
            addCyl(stage, vadd(a.c, a.u, 0.6), 7.5, 1.2, [0.62, 0.64, 0.68], 12, b);
            addFrustum(stage, vadd(a.c, a.u, 1.2), 6.4, 5.1, 5.0, WHITE, 10, b);
            addFrustum(stage, vadd(a.c, a.u, 6.0), 5.1, 4.2, 5.0, SHADE, 10, b);
            addFrustum(stage, vadd(a.c, a.u, 10.8), 4.2, 3.4, 5.0, WHITE, 10, b);
            addBox(stage, vadd(a.c, a.u, 16.5), [5.6, 5, 4.6], WHITE, b);
            const head = vadd(a.c, a.u, 20.5);
            addBox(stage, head, [5.2, 4.4, 4.9], WHITE, b);
            addBox(stage, vadd(head, a.r, 3.0), [2.6, 2.4, 2.6], SHADE, b);
            for (let m = 0; m < 8; m++) {
              const ang = (m / 8) * Math.PI * 2;
              const dx = Math.cos(ang) * 3.2, dz = Math.sin(ang) * 3.2;
              const mc = [head[0] + a.r[0] * dx + a.t[0] * dz,
                          head[1] + 0.5,
                          head[2] + a.r[2] * dx + a.t[2] * dz];
              addCone(stage, mc, 1.1, 2.4, MANE, 5, b);
            }
            for (const o of [-1.6, 1.6]) {
              addCone(stage, vadd(vadd(head, a.t, o), a.u, 2.6), 0.7, 1.6, WHITE, 5, b);
            }
            stage._mat = 0;
            const mouth = vadd(vadd(head, a.r, 4.4), a.u, 0.6);
            addCone(stage, mouth, 0.9, 18, WIN_CYAN, 7, jetB);
            addCone(stage, vadd(mouth, a.r, 16), 1.4, 3, [0.85, 0.95, 1.00], 7, jetB);
            addCyl(stage, vadd(a.c, a.u, 0.2), 12, 0.3, [0.08, 0.16, 0.24], 14, b);
            addBox(stage, vadd(a.c, a.u, 0.55), [18, 0.12, 18], [0.40, 0.55, 0.65], b);
            for (let i = -3; i <= 3; i++) {
              if (i === 0) continue;
              const p = vadd(vadd(a.c, a.r, 12), a.t, i * 3.2);
              addCyl(stage, p, 0.18, 1.6, [0.70, 0.72, 0.76], 6, b);
            }
          };
          modelGroup("singapore-merlion", {
            center: vadd(a.c, a.u, 12), size: [28, 28, 28], basis: b,
          }, emitMerlion, { required: true });
        }
      }

      const bumboat = (a, sc, glow) => {
        const b = [a.r, a.u, a.t];
        out._mat = MAT.WOOD;
        addBox(out, vadd(a.c, a.u, 0.8 * sc), [3.4 * sc, 1.4 * sc, 9 * sc], [0.30, 0.22, 0.16], b);
        addPrism(out, vadd(vadd(a.c, a.t, 4.4 * sc), a.u, 0.8 * sc), [3.4 * sc, 1.4 * sc, 1.6 * sc], [0.34, 0.24, 0.18], b);
        addBox(out, vadd(a.c, a.u, 2.4 * sc), [2.6 * sc, 1.8 * sc, 4 * sc], [0.42, 0.30, 0.20], b);
        out._mat = 0;
        addBox(out, vadd(a.c, a.u, 2.6 * sc), [2.7 * sc, 0.7 * sc, 4.1 * sc], glow, b);
        for (let s = -2; s <= 2; s++) addBox(out, vadd(vadd(a.c, a.t, s * 0.9 * sc), a.u, 3.4 * sc), [0.3 * sc, 0.3 * sc, 0.3 * sc], s % 2 ? NEON[2] : NEON[1], b);
      };
      for (let i = 0; i < 6; i++) {
        const s = [0.24, 0.33, 0.42, 0.46, 0.83, 0.87][i];
        const a = anchor(K(s), 1, 30 + (i % 3) * 12 + hash(i * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 8)) continue;
        bumboat(a, 1.0 + hash(i * 5) * 0.6, i % 2 ? WIN_WARM : WIN_GOLD);
      }

      for (const s of [0.96, 0.985, 0.01]) bakedModel("k_tentlong", K(s), -1, 95, { scale: 2.4 });
      for (const [s, side] of [[0.10, 1], [0.18, 1], [0.34, -1], [0.62, 1], [0.86, 1]])
        bakedModel("k_camera_exclusive", K(s), side, 13, { scale: 3 });
    };
