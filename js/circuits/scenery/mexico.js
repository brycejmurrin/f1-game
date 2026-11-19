"use strict";
(window.TrackScenery = window.TrackScenery || {})["mexico"] =
  function (api) {
      const { K, lapBounds, out, n, px, pz, pyMin, place, backdrop, groundPlane,
              addBox, addCyl, addFrustum, addCone, every, onTrack, hash, vadd, anchor, along,
              building, motorhome, grandstandEx, billboard, hedge, fence,
              guardrail, tyreWall, marshalPost, tower, gantry, mountain, wall,
              modelGroup, groundPatch,
              cityFront, forestEdge, bush,
              terrace, tieredBowl, broadleafFall, plane, acacia, cypress,
              cameraTower, sponsorHoarding, broadcastCompound, circuitKit, terrainYAt,
              indexSolid, seat, floodMast, lampPost: apiLampPost, bakedModel } = api;
      const cityBand = (s) => (s > 0.14 && s < 0.60) || s > 0.94 || s < 0.02;
      const PIT = 1, STAND = -PIT;

      const { cx, cz, radius: rad } = lapBounds();

      const PINK     = [0.92, 0.28, 0.55];
      const ORANGE   = [0.98, 0.55, 0.12];
      const GREEN    = [0.10, 0.55, 0.30];
      const SEATS    = [0.46, 0.47, 0.52];
      const CONCRETE = [0.72, 0.71, 0.68];
      const TREEGRN  = [0.22, 0.40, 0.20];
      const PARKGRN  = [0.34, 0.52, 0.26];
      const STONE    = [0.68, 0.60, 0.44];
      const fiesta   = [PINK, ORANGE, GREEN, [0.98, 0.82, 0.10]];
      const JACARANDA = [0.46, 0.36, 0.74];
      const JAC2      = [0.54, 0.44, 0.80];
      const HUIZACHE  = [0.36, 0.44, 0.26];

      const banners = (s, side, gap) => {
        const k = K(s);
        let prevY = null;
        for (let i = -2; i <= 2; i++) {
          const kk = (k + i + n) % n, a = (kk - 2 + n) % n, b = (kk + 2) % n;
          const ax = px[kk] - px[a], az = pz[kk] - pz[a], bx = px[b] - px[kk], bz = pz[b] - pz[kk];
          const turn = Math.acos(Math.max(-1, Math.min(1,
            (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1))));
          const c = anchor(kk, side, gap).c, y = terrainYAt(c[0], c[2]);
          const steep = prevY !== null && y !== null && Math.abs(y - prevY) > 0.5;
          if (y !== null) prevY = y;
          if (turn > 0.12 || steep) continue;
          place(kk, side, gap, [0.4, 1.1, 4], fiesta[(kk + (i & 1)) % 4]);
        }
      };

      const lightMast = (k, side, dist, h) => {
        const p = anchor(k, side, dist);
        modelGroup(`mexico-flood-${k}-${side}`, {
          center: vadd(p.c, p.u, h / 2),
          size: [10, h + 1, 10],
          basis: [p.r, p.u, p.t],
        }, (stage) => {
          addCyl(stage, p.c, 0.45, h, [0.55, 0.56, 0.58], 6, [p.r, p.u, p.t]);
          addBox(stage, vadd(p.c, p.u, h - 0.8), [5.0, 1.6, 1.4], [0.28, 0.30, 0.34], [p.r, p.u, p.t]);
          for (let i = -1; i <= 1; i++) {
            addBox(stage, vadd(vadd(p.c, p.u, h - 0.3), p.r, side * i * 1.5),
                   [1.1, 0.9, 1.0], [1.00, 0.97, 0.78], [p.r, p.u, p.t]);
          }
          let hi = p.c[1], lo = p.c[1];
          for (const fr of [-5, 0, 5]) for (const ft of [-5, 0, 5]) {
            const q = vadd(vadd(p.c, p.r, fr), p.t, ft), g = terrainYAt(q[0], q[2]);
            if (g != null) { hi = Math.max(hi, g); lo = Math.min(lo, g); }
          }
          const padH = hi + 0.02 - (lo - 0.05);
          addBox(stage, [p.c[0], hi + 0.02 - padH / 2, p.c[2]],
                 [10, padH, 10], [0.82, 0.76, 0.52], [p.r, p.u, p.t]);
        });
      };

      const lampPost = (k, side, dist) => {
        const p = anchor(k, side, dist);
        if (onTrack(p.c[0], p.c[2], 1.5)) return;
        addCyl(out, p.c, 0.14, 8.0, [0.50, 0.50, 0.52], 5, [p.r, p.u, p.t]);
        const head = vadd(p.c, p.u, 8.2);
        addBox(out, head, [1.0, 0.5, 0.6], [0.98, 0.94, 0.74], [p.r, p.u, p.t]);
        if (typeof apiLampPost === "function") {
          apiLampPost({ pos: head, k, side, kind: "sodium" });
        }
      };

      const SOLID = [
        [0.965, 1.000, STAND], [0.000, 0.032, STAND],
        [0.048, 0.063,  1], [0.048, 0.063, -1],
        [0.114, 0.126,  1],
        [0.158, 0.172,  1], [0.190, 0.210,  1], [0.190, 0.210, -1],
        [0.236, 0.260, -1],
        [0.574, 0.606,  1],
        [0.278, 0.292,  1], [0.338, 0.352, -1],
        [0.412, 0.428,  1], [0.448, 0.462, -1], [0.513, 0.527,  1],
        [0.568, 0.582, -1], [0.648, 0.662,  1],
        [0.888, 0.958,  1], [0.898, 0.912, -1], [0.912, 0.968, -1],
      ];
      const blocked = (s, side) => SOLID.some(([a, b, sd]) =>
        sd === side && (a <= b ? (s >= a && s <= b) : (s >= a || s <= b)));
      const avenue = (s0, s1, side, dist, step) => {
        along(s0, s1, step, (k) => {
          if (blocked(k / n, side)) return;
          const r = hash(k * 5.7 + side * 3.1);
          const d = dist + hash(k * 8.3 + side) * 4;
          if (r < 0.50) {
            broadleafFall(k, side, d, 8 + r * 8, r < 0.25 ? JACARANDA : JAC2,
                          { lobes: 3, spread: 1.05 });
          } else if (r < 0.84) {
            plane(k, side, d, 9 + r * 5, PARKGRN, { stages: 2, spread: 0.9 });
          } else {
            acacia(k, side, d, 6 + r * 3, HUIZACHE, { layers: 2 });
          }
        });
      };

      const kerb = (s, side, len) => {
        const k = K(s);
        place(k, side, 2, [0.5, 0.84, len], [0.82, 0.16, 0.16]);
        place(k, side, 3.6, [2.6, 0.84, len], [0.94, 0.94, 0.94]);
      };

      const BOWL_BLUE = [0.25, 0.35, 0.62];
      const BOWL_GREY = [0.55, 0.56, 0.60];
      const BOWL_POP  = [0.92, 0.55, 0.16];
      const crowdCols = [BOWL_BLUE, BOWL_GREY, BOWL_BLUE, BOWL_GREY,
                         BOWL_BLUE, BOWL_GREY, BOWL_POP];
      let lapLen = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        lapLen += Math.hypot(px[j] - px[i], pz[j] - pz[i]);
      }
      const boundedStand = (s, side, gap, len, col, crowd, required) => {
        const k = K(s), depth = 12, a = anchor(k, side, gap + depth / 2);
        const hf = (len / 2 + 2) / lapLen;
        indexSolid(s - hf, s + hf, side, gap, depth);
        const bv = [a.r, a.u, a.t], h = 12;
        modelGroup(`mexico-stand-${k}-${side}-${gap}`, {
          center: vadd(a.c, a.u, h / 2),
          size: [depth, h + 1, len],
          basis: bv,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 5.5), [depth, 11, len], col, bv);
          addBox(stage, vadd(vadd(a.c, a.r, -side * 4.7), a.u, 6.2),
                 [1.0, 7.8, len - 1.2], crowd, bv);
          addBox(stage, vadd(a.c, a.u, 11.42), [depth + 2, 0.8, len + 1], [0.84, 0.85, 0.87], bv);
        }, { required: !!required });
      };

      for (const s of [0.972, 0.990, 0.008, 0.026]) {
        boundedStand(s, STAND, 16, 26, SEATS, s < 0.98 ? ORANGE : PINK, s === 0.008);
        boundedStand(s, STAND, 34, 28, CONCRETE, GREEN, false);
      }

      banners(0.00, STAND, 8);

      gantry(0.00, 8.5, [0.14, 0.14, 0.18]);
      billboard(K(0.005), STAND, 7, 14, 5, fiesta[0]);
      {
        const a = anchor(K(0.00), STAND, 50);
        if (!onTrack(a.c[0], a.c[2], 16)) {
          addBox(out, vadd(a.c, a.u, 8),  [1.2, 16, 1.2], [0.28, 0.28, 0.32], [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 19), [24, 11, 1.8], [0.06, 0.06, 0.08],  [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 19), [25, 11.8, 1.0], [0.26, 0.28, 0.32], [a.r, a.u, a.t]);
        }
      }

      for (const s of [0.01, 0.03, 0.06, 0.09]) {
        lampPost(K(s), -1, 12);
        lampPost(K(s),  1, 12);
      }

      const FLAG_G = [0.10, 0.55, 0.30], FLAG_W = [0.94, 0.94, 0.92], FLAG_R = [0.86, 0.12, 0.16];
      const SUITE_W = [0.90, 0.90, 0.88], SUITE_GLASS = [0.28, 0.40, 0.48];
      for (let i = 0; i < 4; i++) {
        const s = 0.010 + i * 0.012;
        const a = anchor(K(s), PIT, 42);
        if (onTrack(a.c[0], a.c[2], 10)) continue;
        const b = [a.r, a.u, a.t];
        const gy = terrainYAt(a.c[0], a.c[2]);
        if (gy != null && Math.abs(gy - a.c[1]) > 1.2) continue;
        const emitSuite = (stage) => {
          seat.box(stage, a.c, [14, 0.5, 18], [0.62, 0.60, 0.58], b);
          addBox(stage, vadd(a.c, a.u, 4.4), [13, 7.6, 17], SUITE_W, b);
          addBox(stage, vadd(vadd(a.c, a.r, -PIT * 6.6), a.u, 5.6),
                 [0.4, 1.0, 16], FLAG_G, b);
          addBox(stage, vadd(vadd(a.c, a.r, -PIT * 6.6), a.u, 6.8),
                 [0.4, 1.0, 16], FLAG_W, b);
          addBox(stage, vadd(vadd(a.c, a.r, -PIT * 6.6), a.u, 8.0),
                 [0.4, 1.0, 16], FLAG_R, b);
          addBox(stage, vadd(a.c, a.u, 9.4), [13.4, 1.5, 17.2], SUITE_GLASS, b);
          addBox(stage, vadd(a.c, a.u, 10.5), [14.2, 0.45, 18], [0.78, 0.30, 0.22], b);
        };
        if (i === 0) {
          modelGroup("mexico-paddock-suite-0", {
            center: vadd(a.c, a.u, 6), size: [16, 14, 20], basis: b,
          }, emitSuite, { required: true });
        } else {
          modelGroup(`mexico-paddock-suite-${i}`, {
            center: vadd(a.c, a.u, 6), size: [16, 14, 20], basis: b,
          }, emitSuite);
        }
      }
      for (const s of [0.01, 0.03, 0.05]) {
        const a = anchor(K(s), PIT, 58);
        const gy = terrainYAt(a.c[0], a.c[2]);
        if (gy != null && Math.abs(gy - a.c[1]) > 0.8) continue;
        motorhome(K(s), PIT, 58, 12, 4.2, 14,
                 { wall: hash(K(s) * 5) > 0.5 ? [0.86, 0.40, 0.30] : [0.22, 0.48, 0.36],
                   window: [0.55, 0.58, 0.62] });
      }
      tower(K(0.04), PIT, 28, 10, 30, {
        col: [0.78, 0.80, 0.84], cap: true, capCol: [0.10, 0.42, 0.28], mast: 8,
      });
      marshalPost(K(0.06), 1, 6);
      for (const s of [0.018, 0.038, 0.056]) {
        const k = K(s);
        building(k, PIT, 68, 14, 5 + hash(k * 109) * 2, 16, {
          kind: "hall",
          wall: [0.92, 0.92, 0.90],
          window: [0.40, 0.50, 0.56], floor: 1,
          roof: hash(k * 111) > 0.5 ? FLAG_G : FLAG_R,
        });
      }
      broadcastCompound(K(0.03), PIT, 82, { vans: 3, dishes: 2, mastH: 10 });
      for (const s of [0.978, 0.992, 0.008, 0.022]) {
        place(K(s), STAND, 14.5, [0.45, 2.2, 12], FLAG_G);
        place(K(s), STAND, 15.2, [0.45, 2.2, 12], FLAG_W);
        place(K(s), STAND, 15.9, [0.45, 2.2, 12], FLAG_R);
      }
      billboard(K(0.02), STAND, 8, 16, 5, FLAG_G);
      billboard(K(0.045), STAND, 8, 14, 5, FLAG_R);

      hedge(0.04, 0.14, 1, 13, 3.2, TREEGRN);
      hedge(0.04, 0.12, -1, 16, 2.8, PARKGRN);
      forestEdge(0.065, 0.14, 1, 26, { density: 0.30, hMin: 9, hMax: 16, col: TREEGRN, col2: PARKGRN, pineFrac: 0.22 });
      forestEdge(0.04, 0.14, -1, 28, { density: 0.26, hMin: 8, hMax: 15, col: PARKGRN, col2: TREEGRN, pineFrac: 0.18 });
      avenue(0.04, 0.14,  1, 14, 26);
      avenue(0.04, 0.14, -1, 17, 30);

      forestEdge(0.14, 0.30,  1, 26, { density: 0.32, hMin: 7, hMax: 13, col: TREEGRN, col2: PARKGRN, pineFrac: 0.22 });
      forestEdge(0.14, 0.50, -1, 26, { density: 0.24, hMin: 8, hMax: 14, col: PARKGRN, col2: TREEGRN, pineFrac: 0.18 });
      forestEdge(0.14, 0.30, -1, 48, { density: 0.20, hMin: 9, hMax: 16, col: TREEGRN, col2: PARKGRN, pineFrac: 0.15 });
      forestEdge(0.30, 0.48,  1, 26, { density: 0.24, hMin: 7, hMax: 12, col: TREEGRN, col2: PARKGRN, pineFrac: 0.20 });
      avenue(0.14, 0.30,  1, 13, 26);
      avenue(0.16, 0.50, -1, 16, 36);
      avenue(0.30, 0.48,  1, 15, 34);
      const BRICK = [0.62, 0.34, 0.26], BRICK2 = [0.72, 0.42, 0.28];
      const TERRAC = [0.78, 0.48, 0.28], CREAM = [0.88, 0.84, 0.76];
      const PAV_WALL = [BRICK, BRICK2, TERRAC, CREAM, ORANGE, [0.70, 0.38, 0.30]];
      for (const s of [0.150, 0.180, 0.226, 0.268]) {
        const k = K(s), r = hash(k * 7);
        building(k, -1, 34 + r * 18, 18 + r * 8, 7 + hash(k * 3) * 6, 16 + r * 8,
                 { kind: r > 0.55 ? "podium" : "hall",
                   wall: PAV_WALL[Math.floor(r * PAV_WALL.length) % PAV_WALL.length],
                   window: [0.35, 0.42, 0.48], floor: 2 + (r > 0.6 ? 1 : 0),
                   roof: r > 0.5 ? [0.86, 0.30, 0.22] : [0.20, 0.48, 0.30] });
      }

      grandstandEx(0.248, -1,  9, 80, null, GREEN,
                   { livery: "navy", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.248, -1, 30, 80, null, ORANGE,
                   { livery: "concrete", roof: "flat" });
      kerb(0.257, 1, 9); kerb(0.266, -1, 8);

      for (const side of [-1, 1]) {
        grandstandEx(0.20, side, 8, 48, null, side < 0 ? ORANGE : PINK,
                     { livery: side < 0 ? "steel" : "navy",
                       roof: side < 0 ? "truss" : "cantilever", pylons: side < 0 });
      }
      kerb(0.20, -1, 7); kerb(0.205, 1, 7);
      cameraTower(K(0.20), 1, 30, { h: 18 });

      cityFront(0.305, 0.48, -1, 72, {
        minH: 14, maxH: 36, depth: 18, lit: true,
        palette: [[0.66, 0.60, 0.56], [0.64, 0.62, 0.58], [0.70, 0.68, 0.62], [0.58, 0.56, 0.54]],
        windowCol: [0.96, 0.88, 0.58], step: 38
      });
      cityFront(0.58, 0.68, -1, 80, {
        minH: 12, maxH: 30, depth: 16, lit: true,
        palette: [[0.62, 0.60, 0.58], [0.68, 0.64, 0.60], [0.56, 0.54, 0.52], [0.60, 0.58, 0.56]],
        windowCol: [0.94, 0.84, 0.55], step: 40
      });
      cityFront(0.32, 0.43, 1, 78, {
        minH: 12, maxH: 32, depth: 16, lit: true,
        palette: [[0.60, 0.62, 0.66], [0.66, 0.64, 0.60], [0.56, 0.58, 0.62], [0.68, 0.62, 0.58]],
        windowCol: [0.90, 0.82, 0.52], step: 42
      });

      tower(K(0.31), -1, 142, 18, 74, {
        col: [0.52, 0.58, 0.64], seg: 6, cap: true,
        capCol: [0.74, 0.78, 0.82], mast: 8,
      });
      tower(K(0.37), -1, 166, 16, 92, {
        col: [0.46, 0.52, 0.60], seg: 6, cap: true,
        capCol: [0.84, 0.72, 0.42], mast: 11,
      });
      tower(K(0.62), -1, 154, 20, 68, {
        col: [0.58, 0.56, 0.54], seg: 6, cap: true,
        capCol: [0.70, 0.74, 0.78], mast: 6,
      });

      every(96, (k) => {
        if (hash(k * 81) > 0.62) return;
        for (const side of [-1, 1]) {
          const d = 460 + hash(k * 82 + side) * 90 + (k & 1) * 12;
          const h = 8 + hash(k * 83 + side) * 14;
          const warm = hash(k * 84 + side);
          const col = [
            0.70 + warm * 0.08,
            0.50 + warm * 0.07,
            0.36 + warm * 0.05,
          ];
          const w = 28 + hash(k * 85 + side) * 14;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 55)) continue;
          backdrop(k, side, d, [w, h, 16], col);
        }
      });

      sponsorHoarding(0.31, 0.39, -1, 9, { palette: fiesta });

      groundPlane(K(0.42), 1, 5, [60, 1.0, 50], [0.40, 0.40, 0.43]);
      kerb(0.42, 1, 10);
      grandstandEx(0.42, 1, 7, 40, null, ORANGE,
                   { livery: "steel", roof: "truss", endWalls: true });
      banners(0.42, 1, 6);
      cameraTower(K(0.42), -1, 20, { h: 16 });
      if (circuitKit) {
        circuitKit.trackSigns({
          id: "kit:mexico:horquilla-signs", frac: 0.405,
          side: -1, gap: 8, size: [2.4, 2.6, 24], count: 3,
        });
      }

      for (const s of [0.510, 0.530, 0.550, 0.570, 0.590]) {
        const k = K(s), r = hash(k * 11);
        building(k, -1, 28 + hash(k) * 32, 18 + r * 10, 8 + hash(k * 3) * 6, 16 + r * 8,
                 { kind: r > 0.5 ? "hall" : "podium",
                   wall: PAV_WALL[Math.floor(hash(k * 13) * PAV_WALL.length) % PAV_WALL.length],
                   window: [0.38, 0.44, 0.50], floor: 2,
                   roof: hash(k * 17) > 0.5 ? ORANGE : GREEN });
      }
      forestEdge(0.48, 0.68,  1, 26, { density: 0.32, hMin: 7, hMax: 13, col: TREEGRN, col2: PARKGRN, pineFrac: 0.22 });
      forestEdge(0.48, 0.68, -1, 26, { density: 0.28, hMin: 8, hMax: 14, col: PARKGRN, col2: TREEGRN, pineFrac: 0.18 });
      avenue(0.48, 0.68,  1, 13, 26);
      avenue(0.50, 0.68, -1, 14, 30);

      {
        const k = K(0.575), d = 96;
        const p = anchor(k, -1, d), bv = [p.r, p.u, p.t];
        modelGroup("mexico-palacio-deportes", {
          center: vadd(p.c, p.u, 15),
          size: [82, 31, 82],
          basis: bv,
        }, (stage) => {
          const COP = [0.66, 0.44, 0.30], COP2 = [0.57, 0.46, 0.35];
          const rings = [[40, 35, 5, COP2], [35, 27, 7, COP], [27, 17, 7, COP2], [17, 7, 6, COP]];
          let y = 0;
          for (const [rB, rT, h, c] of rings) { addFrustum(stage, vadd(p.c, p.u, y), rB, rT, h, c, 12, bv); y += h; }
          addCone(stage, vadd(p.c, p.u, y), 7, 4, COP, 12, bv);
          for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const cp = vadd(vadd(p.c, p.r, ex * 22), p.t, ez * 22);
            addBox(stage, vadd(cp, p.u, 4.5), [3, 9, 3], [0.50, 0.40, 0.34], bv);
          }
        }, { required: true });
      }

      {
        const k = K(0.66), d = 38;
        const p = anchor(k, 1, d);
        if (!onTrack(p.c[0], p.c[2], 6)) {
          addBox(out, vadd(p.c, p.u, 1.8),  [4.2, 3.6, 4.2], [0.58, 0.56, 0.52], [p.r, p.u, p.t]);
          addBox(out, vadd(p.c, p.u, 6.7),  [2.4, 6.2, 1.8], [0.20, 0.38, 0.72], [p.r, p.u, p.t]);
          addBox(out, vadd(p.c, p.u, 10.7), [1.8, 1.8, 1.8], [0.98, 0.18, 0.28], [p.r, p.u, p.t]);
          place(k, 1, d - 3.5, [3.2, 0.84, 5.5], [0.95, 0.80, 0.15]);
        }
      }

      const FIELD = [0.38, 0.45, 0.25];
      const DIRT  = [0.50, 0.40, 0.28];
      const PLAZA = [0.70, 0.68, 0.64];
      const ASPH  = [0.30, 0.30, 0.32];
      const LAWN  = [0.40, 0.47, 0.26];
      for (const s of [0.74, 0.77, 0.80, 0.83]) {
        for (const side of [-1, 1]) {
          const a = anchor(K(s), side, 5.5);
          if (onTrack(a.c[0], a.c[2], 4)) continue;
          groundPatch(K(s), side, 5.0, [4.0, 0.40, 12], LAWN,
                      { id: `foro-verge-${side < 0 ? "l" : "r"}-${K(s)}`, samples: 3 });
        }
        const aL = anchor(K(s), -1, 16), aR = anchor(K(s), 1, 16);
        if (!onTrack(aL.c[0], aL.c[2], 8))
          groundPatch(K(s), -1, 14, [12, 0.55, 18], s < 0.79 ? FIELD : DIRT,
                      { id: `foro-floor-l-${K(s)}`, samples: 6 });
        if (!onTrack(aR.c[0], aR.c[2], 8))
          groundPatch(K(s),  1, 14, [12, 0.55, 18], s < 0.79 ? DIRT : FIELD,
                      { id: `foro-floor-r-${K(s)}`, samples: 6 });
      }
      {
        const aL = anchor(K(0.785), -1, 36), aR = anchor(K(0.785), 1, 36);
        if (!onTrack(aL.c[0], aL.c[2], 14))
          groundPatch(K(0.785), -1, 32, [28, 0.6, 28], FIELD,
                      { id: "foro-infield-left", samples: 9 });
        if (!onTrack(aR.c[0], aR.c[2], 14))
          groundPatch(K(0.785),  1, 32, [28, 0.6, 28], DIRT,
                      { id: "foro-infield-right", samples: 9 });
      }
      for (const [s, side, gap, sz, col, id] of [
        [0.22,  1, 42, [36, 0.4, 40], LAWN,  "mexico-park-lawn-t1"],
        [0.28, -1, 48, [40, 0.4, 44], LAWN,  "mexico-park-lawn-mid"],
        [0.36,  1, 55, [44, 0.4, 48], LAWN,  "mexico-park-lawn-city"],
        [0.42, -1, 42, [32, 0.4, 36], PLAZA, "mexico-plaza-horquilla"],
        [0.52,  1, 48, [36, 0.4, 40], LAWN,  "mexico-sports-lawn"],
        [0.58, -1, 52, [34, 0.4, 36], PLAZA, "mexico-plaza-deportes"],
        [0.64,  1, 42, [30, 0.4, 34], LAWN,  "mexico-park-lawn-late"],
      ]) {
        const a = anchor(K(s), side, gap + sz[0] / 2);
        if (onTrack(a.c[0], a.c[2], Math.max(sz[0], sz[2]) * 0.35)) continue;
        groundPatch(K(s), side, gap, sz, col, { id, samples: 8 });
      }
      for (const [s, side, gap, id] of [
        [0.24,  1, 24, "mexico-svc-t1"],
        [0.38, -1, 26, "mexico-svc-city"],
        [0.44,  1, 24, "mexico-svc-horquilla"],
        [0.56, -1, 28, "mexico-svc-deportes"],
        [0.62,  1, 24, "mexico-svc-late"],
      ]) {
        const a = anchor(K(s), side, gap + 3.5);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        groundPatch(K(s), side, gap, [6, 0.28, 24], ASPH, { id, samples: 3 });
      }

      {
        const a = anchor(K(0.72), -1, 22);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const b = [a.r, a.u, a.t];
          modelGroup("mexico-foro-sol-entry", {
            center: vadd(a.c, a.u, 10), size: [10, 24, 20], basis: b,
          }, (stage) => {
            for (const t of [-6, 6]) {
              const foot = vadd(a.c, a.t, t);
              seat.box(stage, foot, [4.2, 0.5, 3.2], [0.58, 0.56, 0.52], b);
              addBox(stage, vadd(foot, a.u, 8.2), [3.8, 15.4, 2.4], [0.78, 0.76, 0.72], b);
            }
            addBox(stage, vadd(a.c, a.u, 17), [4.2, 2.4, 16.5], [0.88, 0.86, 0.80], b);
            addBox(stage, vadd(a.c, a.u, 15.6), [3.8, 0.9, 14.5], BOWL_BLUE, b);
            for (const t of [-8.5, 8.5]) {
              addBox(stage, vadd(vadd(a.c, a.t, t), a.u, 6.2), [2.2, 11.4, 3.0], [0.60, 0.59, 0.58], b);
            }
          }, { required: true });
        }
      }
      {
        const a = anchor(K(0.875), -1, 22);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const b = [a.r, a.u, a.t];
          modelGroup("mexico-foro-sol-exit", {
            center: vadd(a.c, a.u, 10), size: [10, 24, 20], basis: b,
          }, (stage) => {
            for (const t of [-6, 6]) {
              const foot = vadd(a.c, a.t, t);
              seat.box(stage, foot, [4.2, 0.5, 3.2], [0.58, 0.56, 0.52], b);
              addBox(stage, vadd(foot, a.u, 8.2), [3.8, 15.4, 2.4], [0.78, 0.76, 0.72], b);
            }
            addBox(stage, vadd(a.c, a.u, 17), [4.2, 2.4, 16.5], [0.88, 0.86, 0.80], b);
            addBox(stage, vadd(a.c, a.u, 15.6), [3.8, 0.9, 14.5], BOWL_BLUE, b);
            for (const t of [-8.5, 8.5]) {
              addBox(stage, vadd(vadd(a.c, a.t, t), a.u, 6.2), [2.2, 11.4, 3.0], [0.60, 0.59, 0.58], b);
            }
          }, { required: true });
        }
      }

      const SEAT_NAVY = [
        BOWL_BLUE, [0.21, 0.30, 0.56], BOWL_BLUE, [0.28, 0.39, 0.66],
        BOWL_BLUE, BOWL_GREY, BOWL_POP,
      ];
      const BOWL_SHELL = [[0.62, 0.61, 0.60], [0.54, 0.54, 0.55]];
      const BOWL_OPTS = {
        tiers: 4, tierDepth: 5.2, base: 3.6, rise: 3.1,
        shell: BOWL_SHELL, fascia: [0.90, 0.89, 0.84],
        crowd: SEAT_NAVY, density: 0.78, step: 9,
      };
      tieredBowl(0.728, 0.858, -1, 9, BOWL_OPTS);
      tieredBowl(0.728, 0.814,  1, 9, BOWL_OPTS);
      tieredBowl(0.836, 0.858,  1, 9, BOWL_OPTS);
      const closeBowlBack = (s0, s1, side, gap, h) => {
        along(s0, s1, 12, (k, spacing) => {
          const a = anchor(k, side, gap);
          if (onTrack(a.c[0], a.c[2], 6)) return;
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, h * 0.5 + 0.15), [2.0, h, spacing * 0.95], BOWL_SHELL[0], b);
          addBox(out, vadd(vadd(a.c, a.r, side * 1.15), a.u, h * 0.55 + 0.15),
                 [0.4, h * 0.75, spacing * 0.9],
                 side < 0 ? FLAG_G : FLAG_R, b);
        });
      };
      closeBowlBack(0.728, 0.858, -1, 30.5, 15);
      closeBowlBack(0.728, 0.814,  1, 30.5, 15);
      closeBowlBack(0.836, 0.858,  1, 30.5, 15);
      const UPPER_OPTS = {
        rows: 5, rise: 1.9, depth: 2.8,
        conc: [0.68, 0.67, 0.64], concAlt: [0.58, 0.57, 0.56],
        crowd: SEAT_NAVY, density: 0.72, step: 10,
      };
      terrace(0.734, 0.852, -1, 32, UPPER_OPTS);
      terrace(0.734, 0.812,  1, 32, UPPER_OPTS);
      terrace(0.838, 0.852,  1, 32, UPPER_OPTS);
      const sealTerraceBack = (s0, s1, side, gap, rows, rise, depth) => {
        along(s0, s1, 12, (k, spacing) => {
          const a = anchor(k, side, gap);
          if (onTrack(a.c[0], a.c[2], 5)) return;
          const b = [a.r, a.u, a.t];
          const topH = 1.4 + rows * rise;
          const topBack = side * (1.0 + rows * depth + 1.65);
          addBox(out, vadd(vadd(a.c, a.r, topBack), a.u, topH * 0.52),
                 [2.6, topH * 1.1, spacing * 0.96], BOWL_SHELL[0], b);
          addBox(out, vadd(vadd(a.c, a.r, topBack + side * 1.4), a.u, topH * 0.55),
                 [0.5, topH * 0.85, spacing * 0.9],
                 side < 0 ? FLAG_G : FLAG_R, b);
          for (let r = 0; r < rows; r++) {
            const lat = side * (1.0 + r * depth - depth * 0.42);
            const up = 1.4 + r * rise;
            addBox(out, vadd(vadd(a.c, a.r, lat), a.u, up),
                   [0.4, rise * 0.9, spacing * 0.9],
                   SEAT_NAVY[r % SEAT_NAVY.length], b);
          }
        });
      };
      sealTerraceBack(0.734, 0.852, -1, 32, 5, 1.9, 2.8);
      sealTerraceBack(0.734, 0.812,  1, 32, 5, 1.9, 2.8);
      sealTerraceBack(0.838, 0.852,  1, 32, 5, 1.9, 2.8);
      boundedStand(0.744, -1, 52, 26, [0.60, 0.59, 0.58], BOWL_BLUE, false);
      boundedStand(0.842, -1, 52, 26, [0.60, 0.59, 0.58], BOWL_GREY, false);
      boundedStand(0.715, -1, 36, 20, [0.58, 0.56, 0.54], BOWL_GREY, false);
      boundedStand(0.855, -1, 36, 20, [0.58, 0.56, 0.54], BOWL_BLUE, false);
      boundedStand(0.875,  1, 36, 20, [0.58, 0.56, 0.54], BOWL_GREY, false);

      for (const s of [0.74, 0.77, 0.80, 0.83, 0.85]) {
        lightMast(K(s), -1, 50, 52);
        if (s >= 0.80) lightMast(K(s), 1, 50, 52);
      }
      if (typeof floodMast === "function") {
        for (const [s, side, gap] of [
          [0.728, -1, 38], [0.758, -1, 42], [0.788, -1, 40], [0.818, -1, 44],
          [0.738,  1, 36], [0.768,  1, 40], [0.798,  1, 38], [0.838,  1, 42],
          [0.848, -1, 46], [0.862,  1, 44],
        ]) floodMast(K(s), side, gap, { h: 46, cool: true, pool: false, arms: 3 });
      }

      {
        const k = K(0.80), a = anchor(k, -1, 46);
        modelGroup("foro-scoreboard", {
          center: vadd(a.c, a.u, 18),
          size: [34, 38, 4],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
          const b = [a.r, a.u, a.t];
          for (const t of [-10, 10]) {
            const foot = vadd(a.c, a.t, t);
            seat.box(stage, foot, [2.2, 0.5, 2.2], [0.40, 0.40, 0.42], b);
            addBox(stage, vadd(foot, a.u, 14.2), [1.2, 27.4, 1.2], [0.28, 0.28, 0.32], b);
          }
          addBox(stage, vadd(a.c, a.u, 28), [32, 14, 2.0], [0.04, 0.04, 0.06], b);
          addBox(stage, vadd(a.c, a.u, 28), [34, 15, 1.0], [0.24, 0.26, 0.30], b);
          addBox(stage, vadd(a.c, a.u, 20.2), [30, 0.6, 1.6], FLAG_G, b);
          addBox(stage, vadd(a.c, a.u, 20.9), [30, 0.6, 1.6], FLAG_W, b);
          addBox(stage, vadd(a.c, a.u, 21.6), [30, 0.6, 1.6], FLAG_R, b);
        }, { required: true });
      }

      for (const s of [0.74, 0.77, 0.80, 0.83]) {
        banners(s, -1, 9); banners(s, 1, 9);
      }
      for (const s of [0.745, 0.760, 0.775, 0.790, 0.805, 0.820, 0.840]) {
        for (const side of [-1, 1]) {
          if (side > 0 && s > 0.814 && s < 0.836) continue;
          place(K(s), side, 11.5, [1.6, 1.4, 4.5], SEAT_NAVY[Math.floor(s * 70) % SEAT_NAVY.length]);
          place(K(s), side, 16.5, [1.6, 1.4, 4.5], SEAT_NAVY[Math.floor(s * 90) % SEAT_NAVY.length]);
        }
      }
      billboard(K(0.715), -1, 10, 16, 5.5, FLAG_G);
      billboard(K(0.715),  1, 10, 14, 5.0, FLAG_R);
      billboard(K(0.870), -1, 10, 16, 5.5, FLAG_R);
      billboard(K(0.870),  1, 10, 14, 5.0, FLAG_G);
      sponsorHoarding(0.735, 0.800, -1, 8.2, { palette: [FLAG_G, FLAG_W, FLAG_R, ORANGE] });
      sponsorHoarding(0.735, 0.800,  1, 8.2, { palette: [FLAG_R, FLAG_W, FLAG_G, PINK] });

      fence(0.735, 0.855, -1, 7.5, 3.8, [0.82, 0.84, 0.88]);
      fence(0.735, 0.855,  1, 7.5, 3.8, [0.82, 0.84, 0.88]);
      wall(0.735, 0.855, -1, 6.4, 1.0, CONCRETE, 0.45);
      wall(0.735, 0.855,  1, 6.4, 1.0, CONCRETE, 0.45);
      tyreWall(0.755, 0.775, -1, 5, ORANGE);
      tyreWall(0.795, 0.815,  1, 5, PINK);
      kerb(0.76, -1, 8); kerb(0.80, 1, 8);


      billboard(K(0.88), 1, 8, 14, 6, fiesta[1]);
      building(K(0.695), -1, 30, 22, 14, 28, {
        wall: BRICK, window: [0.30, 0.38, 0.46],
        floor: 3, roof: [0.88, 0.24, 0.44],
      });
      forestEdge(0.89, 0.94, -1, 22, { density: 0.24, hMin: 7, hMax: 12, col: PARKGRN, col2: TREEGRN, pineFrac: 0.2 });
      avenue(0.89, 0.94, -1, 15, 28);

      for (const s of [0.90, 0.92, 0.94]) {
        boundedStand(s, 1, 14, 24, SEATS, PINK, false);
        boundedStand(s, 1, 32, 26, CONCRETE, GREEN, false);
      }
      {
        const a = anchor(K(0.935), 1, 62);
        if (!onTrack(a.c[0], a.c[2], 20)) {
          const b = [a.r, a.u, a.t];
          modelGroup("mexico-peraltada-stand", {
            center: vadd(a.c, a.u, 8), size: [12, 18, 48], basis: b,
          }, (stage) => {
            for (let t = 0; t < 5; t++) {
              const outLat = 1 * (1.2 + t * 1.5);
              addBox(stage, vadd(vadd(a.c, a.r, outLat), a.u, t * 1.3 + 0.65),
                [2.6, 1.3, 40 - t * 2], BOWL_BLUE, b);
            }
            addBox(stage, vadd(vadd(a.c, a.r, 1 * 2.0), a.u, 7.8),
              [0.35, 1.0, 38], GREEN, b);
            addBox(stage, vadd(vadd(a.c, a.r, 1 * 2.0), a.u, 9.0),
              [0.35, 1.0, 38], [0.94, 0.94, 0.92], b);
            addBox(stage, vadd(vadd(a.c, a.r, 1 * 2.0), a.u, 10.2),
              [0.35, 1.0, 38], [0.86, 0.12, 0.16], b);
            addBox(stage, vadd(vadd(a.c, a.r, 1 * 5.0), a.u, 11.8),
              [7, 0.5, 36], [0.70, 0.70, 0.72], b);
          }, { required: true });
        }
      }
      for (let s = 0.920; s <= 0.951; s += 0.0065) {
        terrace(s, s, 1, 46, {
          rows: 6, rise: 1.7, depth: 2.7, crowd: crowdCols,
          conc: [0.70, 0.69, 0.66], concAlt: [0.60, 0.59, 0.57],
          density: 0.58, step: 8,
        });
      }
      lightMast(K(0.90), 1, 32, 44);
      lightMast(K(0.94), 1, 32, 44);
      if (typeof floodMast === "function") {
        floodMast(K(0.905), 1, 36, { h: 42, cool: true, pool: false, arms: 3 });
        floodMast(K(0.945), 1, 36, { h: 42, cool: true, pool: false, arms: 3 });
      }
      lampPost(K(0.91), -1, 14);
      lampPost(K(0.93), -1, 14);
      banners(0.92, 1, 9);
      cameraTower(K(0.92), -1, 18, { h: 20 });
      sponsorHoarding(0.895, 0.935, -1, 9, { palette: fiesta });


      for (let i = 0; i < 6; i++) {
        const f = 0.88 + i * 0.018;
        const k = K(f);
        place(k, 1, 15, [0.5, 7, 16], [0.10, 0.58, 0.26]);
        place(k, 1, 18, [0.5, 7, 16], [0.94, 0.94, 0.92]);
        place(k, 1, 21, [0.5, 7, 16], [0.86, 0.12, 0.16]);
      }

      fence(0.10, 0.16, 1, 6, 3.2, [0.80, 0.82, 0.84]);
      guardrail(0.04, 0.11,  1, 4.5, [0.86, 0.86, 0.90]);
      guardrail(0.04, 0.11, -1, 4.5, [0.86, 0.86, 0.90]);
      guardrail(0.30, 0.40, -1, 5,   [0.86, 0.86, 0.90]);

      for (const s of [0.12, 0.20, 0.30, 0.42, 0.55, 0.66, 0.90])
        marshalPost(K(s), 1, 6);

      billboard(K(0.07), 1, 12, 12, 5, fiesta[2]);
      billboard(K(0.09), 1, 14, 12, 5, fiesta[3]);
      billboard(K(0.33), -1, 16, 14, 5, fiesta[1]);
      billboard(K(0.46),  1, 10, 10, 4, fiesta[0]);

      const FENCE_M = [0.80, 0.82, 0.84];
      for (const [s0, s1, side] of [
        [0.00, 0.10,  1], [0.00, 0.10, -1],
        [0.16, 0.30,  1], [0.10, 0.30, -1],
        [0.30, 0.48,  1], [0.30, 0.48, -1],
        [0.48, 0.60,  1], [0.48, 0.60, -1],
        [0.60, 0.72,  1], [0.60, 0.72, -1],
        [0.86, 1.00,  1], [0.86, 1.00, -1],
      ]) fence(s0, s1, side, 5.5, 3.4, FENCE_M);
      for (let i = 0; i < 44; i++) {
        const sf = i / 44;
        if (sf > 0.72 && sf < 0.87) continue;
        const side = (i % 2) ? 1 : -1;
        billboard(K(sf), side, 9, 10 + hash(i * 3.7) * 4, 4.2, fiesta[i % 4]);
      }
      for (const s of [0.03, 0.17, 0.26, 0.35, 0.50, 0.58, 0.64, 0.95])
        banners(s, s > 0.5 ? -1 : 1, 7.3);
      for (const s of [0.16, 0.26, 0.36, 0.50, 0.60, 0.70, 0.95])
        marshalPost(K(s), -1, 6);

      const MEX_STANDS = ["navy", "concrete", "steel"];
      const MEX_ROOFS  = ["cantilever", "flat", "truss"];
      const named = [
        [0.055,  1, 10, 56, ORANGE], [0.055, -1, 11, 48, PINK],
        [0.165,  1, 10, 50, PINK],   [0.120,  1, 10, 52, GREEN],
        [0.285,  1, 11, 46, ORANGE], [0.345, -1, 10, 48, PINK],
        [0.455, -1, 11, 44, GREEN],  [0.520,  1, 10, 50, ORANGE],
        [0.575, -1, 10, 46, PINK],   [0.655,  1, 11, 48, GREEN],
        [0.905, -1, 11, 52, ORANGE], [0.945,  1, 10, 54, PINK],
      ];
      for (let i = 0; i < named.length; i++) {
        const [s, side, gap, len, crowd] = named[i];
        grandstandEx(s, side, gap, len, null, crowd, {
          livery: MEX_STANDS[i % MEX_STANDS.length],
          roof: MEX_ROOFS[(i + 1) % MEX_ROOFS.length],
          tiers: i % 4 === 1 ? 2 : 1,
          pylons: i % 3 === 2,
          endWalls: i % 5 === 0,
        });
      }
      terrace(0.578, 0.602,  1, 20, { rows: 4, rise: 1.6, depth: 2.6,
        crowd: crowdCols, density: 0.6, step: 9 });
      terrace(0.915, 0.945, -1, 18, { rows: 4, rise: 1.6, depth: 2.6,
        crowd: crowdCols, density: 0.6, step: 9 });

      avenue(0.60, 0.70, -1, 15, 30);
      every(26, (k) => {
        const sf = k / n;
        if (sf > 0.72 && sf < 0.87) return;
        for (const side of [-1, 1]) {
          if (hash(k * 71 + side) > 0.55) continue;
          bush(k, side, 8.5 + hash(k * 73 + side) * 1.5, PARKGRN);
        }
      });
      tyreWall(0.250, 0.262, -1, 4.5, ORANGE);
      tyreWall(0.273, 0.283,  1, 4.5, PINK);
      tyreWall(0.287, 0.299, -1, 4.5, GREEN);
      tyreWall(0.450, 0.462,  1, 4.5, ORANGE);
      tyreWall(0.503, 0.515, -1, 4.5, PINK);
      tyreWall(0.669, 0.681, -1, 4.5, GREEN);
      tyreWall(0.932, 0.944, -1, 4.5, ORANGE);
      for (const [s, side] of [[0.2776, -1], [0.2891, 1], [0.4531, -1],
                               [0.5066, 1], [0.5836, -1], [0.6721, 1], [0.9346, 1]]) {
        kerb(s, side, 8);
      }
      for (let i = 0; i < 30; i++) {
        const sf = i / 30;
        if (sf > 0.70 && sf < 0.90) continue;
        lampPost(K(sf), (i % 2) ? 1 : -1, 11);
      }

      for (const s of [0.05, 0.08, 0.92, 0.97]) {
        cypress(K(s), 1, 12 + hash(K(s)) * 7, 12 + hash(K(s) * 3) * 5, [0.16, 0.31, 0.20],
                { slim: 0.9 });
      }
      every(22, (k) => {
        const s = k / n;
        if (s < 0.50) return;
        if (s > 0.70 && s < 0.90) return;
        for (const side of [-1, 1]) {
          if (blocked(s, side)) continue;
          const r = hash(k * 91 + side);
          if (r > 0.50) continue;
          const d = cityBand(s) ? 22 + hash(k * 92 + side) * 8
                                : 13 + hash(k * 92 + side) * 22;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 9)) continue;
          const h = 8 + hash(k * 94 + side) * 5;
          if (r < 0.18)      broadleafFall(k, side, d, h, r < 0.09 ? JACARANDA : JAC2, { lobes: 3 });
          else if (r < 0.36) plane(k, side, d, h, PARKGRN, { stages: 2, spread: 0.85 });
          else               acacia(k, side, d, h * 0.8, HUIZACHE, { layers: 2 });
        }
      });

      every(60, (k) => {
        const side = hash(k * 31) > 0.5 ? 1 : -1;
        const d = 14 + hash(k * 32) * 8;
        const p = anchor(k, side, d);
        if (onTrack(p.c[0], p.c[2], 8)) return;
        addCyl(out, p.c, 0.18, 9, [0.85, 0.85, 0.85], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8), [2.4, 1.4, 0.2], fiesta[k % 4], [p.r, p.u, p.t]);
      });

      every(24, (k) => {
        for (const side of [1, -1]) {
          const s = k / n;
          if (s < 0.50) continue;
          if (s > 0.70 && s < 0.90) continue;
          if (blocked(s, side)) continue;
          if (hash(k * 57 + side) > 0.62) continue;
          const d = cityBand(s) ? 22 + hash(k * 63 + side) * 8
                                : 15 + hash(k * 63 + side) * 20;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 67 + side);
          if (r < 0.30) broadleafFall(k, side, d, 7 + r * 6, JACARANDA, { lobes: 3, spread: 0.95 });
          else          plane(k, side, d, 6.5 + r * 4.5, [0.15 + r * 0.07, 0.34 + r * 0.06, 0.17],
                              { stages: r > 0.7 ? 3 : 2, spread: 0.85 });
        }
      });

      {
        const pA = anchor(K(0.45), -1, 55);
        if (!onTrack(pA.c[0], pA.c[2], 14)) {
          const pb = [pA.r, pA.u, pA.t];
          const hf = 12 / lapLen;
          indexSolid(0.45 - hf, 0.45 + hf, -1, 45, 20);
          addBox(out, vadd(pA.c, pA.u, 2.0),  [20, 4,  20], STONE, pb);
          addBox(out, vadd(pA.c, pA.u, 6.0),  [14, 4,  14], STONE, pb);
          addBox(out, vadd(pA.c, pA.u, 10.0), [ 8, 4,   8], STONE, pb);
          addBox(out, vadd(pA.c, pA.u, 13.0), [ 4, 2.4, 4], [0.60, 0.52, 0.38], pb);
        }
      }

      const vol = (deg, d) => [cx - Math.sin(deg * Math.PI / 180) * d, cz + Math.cos(deg * Math.PI / 180) * d];
      const popo = vol(131.1, 1746), izta = vol(117.9, 1876);
      const nearVolcano = (x, z) => Math.hypot(x - popo[0], z - popo[1]) < 280 || Math.hypot(x - izta[0], z - izta[1]) < 360;

      for (const [extra, wMin, hMin, count, rock, snowL] of [
        [980,  360, 150, 16, [0.50, 0.55, 0.62], 0.74],
        [1260, 460, 210, 12, [0.56, 0.60, 0.66], 0.68],
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + (hash(i * 5 + extra) - 0.5) * 0.45) / count * 6.2832;
          const hv = hash(i * 7 + extra), j = hash(i * 11 + extra);
          const rr = ring - wMin * 0.12 + hash(i * 17 + extra) * wMin * 0.22;
          if (nearVolcano(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr)) continue;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                   wMin + hv * 150, hMin + j * 110,
                   { seg: 6, seed: i * 13 + extra, snowline: snowL, rock,
                     forest: [0.40, 0.46, 0.48], snow: [0.88, 0.90, 0.94] });
        }
      }

      {
        mountain(popo[0], popo[1], pyMin, 560, 350, {
          seg: 8, seed: 2601, rough: 0.24, snowline: 0.66,
          rock: [0.42, 0.46, 0.52], forest: [0.34, 0.40, 0.40],
          snow: [0.92, 0.93, 0.96],
        });
        mountain(izta[0], izta[1], pyMin, 720, 245, {
          seg: 8, seed: 2602, rough: 0.38, snowline: 0.72,
          rock: [0.48, 0.51, 0.57], forest: [0.37, 0.42, 0.42],
          snow: [0.89, 0.91, 0.94],
        });
      }

      {
        const clearOfLap = (x, z) => {
          for (let k = 0; k < n; k++) {
            if (Math.hypot(px[k] - x, pz[k] - z) < 250) return false;
          }
          return true;
        };
        let a = anchor(K(0.20), -1, 700);
        for (let d = 700; d <= 860 && !clearOfLap(a.c[0], a.c[2]); d += 20) {
          a = anchor(K(0.20), -1, d);
        }
        const c = [a.c[0], a.c[1] + 210, a.c[2]];
        const bn = [a.r, a.u, a.t];
        const bf = [a.r, a.t, a.u];
        const FUSE = [0.60, 0.62, 0.66], DARK = [0.28, 0.29, 0.32];
        addCyl(out, vadd(c, a.t, -15), 1.6, 30, FUSE, 8, bf);
        addBox(out, c, [28, 0.6, 4.2], DARK, bn);
        addBox(out, vadd(c, a.t, 13.5), [0.5, 4.4, 3.4], DARK, bn);
        addBox(out, vadd(c, a.t, 12.5), [9, 0.5, 2.4], DARK, bn);
        for (const off of [-4, 3]) {
          addCyl(out, vadd(vadd(c, a.t, off), a.u, -3.6), 0.16, 2.4, DARK, 4, bn);
        }
      }

      const nearAnyLeg = (x, z) => {
        for (let k = 0; k < n; k++) {
          if (Math.hypot(px[k] - x, pz[k] - z) < 150) return true;
        }
        return false;
      };
      for (let i = 0; i < 10; i++) {
        const f = i / 10;
        const k = K(f);
        const side = i % 2 === 0 ? -1 : 1;
        const d = 380 + hash(i * 29) * 160 + (i % 3) * 30;
        const h = 32 + hash(i * 37) * 58;
        const w = 18 + hash(i * 53) * 16;
        const p = anchor(k, side, d);
        if (!onTrack(p.c[0], p.c[2], 20) && !nearAnyLeg(p.c[0], p.c[2])) {
          const tone = 0.60 + hash(i * 41) * 0.10;
          building(k, side, d - w / 2, w, h, w,
            { wall: [tone * 0.98, tone, tone * 1.02],
              window: [tone * 0.68, tone * 0.72, tone * 0.82],
              lit: true, windowCol: [0.94, 0.84, 0.54], floor: 7 });
        }
      }
      for (const s of [0.975, 0.0, 0.025]) bakedModel("k_tentlong", K(s), 1, 80, { scale: 2.4 });
      for (const [s, side] of [[0.2571, -1], [0.4531, -1], [0.6721, -1], [0.8261, -1], [0.9496, -1]])
        bakedModel("k_camera_exclusive", K(s), side, 13, { scale: 3 });
    };
