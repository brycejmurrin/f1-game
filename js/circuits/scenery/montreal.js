"use strict";
(window.TrackScenery = window.TrackScenery || {})["montreal"] =
  function (api) {
      const { K, out, pyMin, place, backdrop, wall, grandstandEx,
        building, anchor, addBox, addCyl, addCone, addPrism, addFrustum, vadd, hash,
        fence, tyreWall, hedge, billboard, gantry, marshalPost, bush,
        scaffoldStand, broadleafFall, tree, pine, seat, groundUnder, indexSolid,
        ferrisWheel, tower, onTrack, forestEdge, cityFront,
        modelGroup, overheadSpan, waterSurface, waterBand, groundPatch, foundation,
        broadcastCompound, cameraTower, sponsorHoarding, circuitKit,
        cross, norm, MAT, COL, frameAt, floodMast } = api;

      const strut = (a, c, rad, col, seg, target) => {
        const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1e-6;
        const up = [d[0] / L, d[1] / L, d[2] / L];
        const ref = Math.abs(up[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const right = norm(cross(ref, up));
        const fwd = norm(cross(up, right));
        addCyl(target || out, a, rad, L, col, seg || 3, [right, up, fwd]);
      };

      const BASE   = pyMin || 0;
      const BANK_T = BASE - 0.35;

      const WALL     = [0.78, 0.79, 0.80];
      const TEAL     = (COL && COL.basinTeal) || [0.08, 0.55, 0.62];
      const RIVER    = TEAL;
      const RIVER2   = [TEAL[0] + 0.06, TEAL[1] + 0.08, TEAL[2] + 0.06];
      const BASIN    = TEAL;
      const GRASS    = [0.24, 0.49, 0.20];
      const FOLIAGE  = [0.16, 0.34, 0.18];
      const FOLIAGE2 = [0.20, 0.40, 0.20];
      const HEDGE    = [0.16, 0.32, 0.17];

      const KERB_R = [0.82, 0.20, 0.18], KERB_W = [0.90, 0.90, 0.90];

      const flagMast = (k, side, dist, h, col) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 1.5)) return;
        addCyl(out, a.c, 0.07, h, [0.30, 0.30, 0.33], 5, b);
        addBox(out, vadd(a.c, a.u, h - 0.7), [0.04, 1.4, 2.4], col, b);
      };

      const rowingTower = (id, s, side, dist, h) => {
        const a = anchor(K(s), side, dist);
        const b = [a.r, a.u, a.t];
        modelGroup(id, {
          center: vadd(a.c, a.u, h * 0.5 + 1.5),
          size: [8, h + 3.5, 9],
          basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, h * 0.48),
            [4.6, h * 0.96, 6.2], [0.78, 0.80, 0.82], b);
          for (const y of [h * 0.34, h * 0.62, h * 0.82]) {
            addBox(stage, vadd(vadd(a.c, a.u, y), a.r, -2.36),
              [0.22, 1.55, 5.2], [0.30, 0.46, 0.56], b);
          }
          addBox(stage, vadd(a.c, a.u, h * 0.96 + 0.2),
            [7.2, 0.5, 8.0], [0.90, 0.91, 0.92], b);
          addCyl(stage, vadd(a.c, a.u, h * 0.96 + 0.45),
            0.10, 2.8, [0.36, 0.37, 0.39], 5, b);
        });
      };

      for (const [side, runs] of [[-1, [[0, 6], [8, 15]]], [1, [[0, 3], [5, 10], [12, 15]]]])
        for (const [a, b] of runs)
          waterBand(a / 16, (b + 1) / 16, side, 72, 180, 12, RIVER, {
            id: `montreal-river-${a}-${side < 0 ? "l" : "r"}`,
          });

      const FARBANK  = [0.34, 0.40, 0.30];
      const farBank = (k, side, near, far, lenM, col) => {
        const a = anchor(k, side, (near + far) / 2);
        const depth = far - near;
        const H = 5;
        addBox(out, vadd(a.c, a.u, BANK_T - H / 2 - a.c[1]),
               [lenM, H, depth], col || FARBANK, [a.r, a.u, a.t]);
      };

      {
        const LAGOON = [0.13, 0.28, 0.38];
        const SAND   = [0.88, 0.80, 0.58];
        const lk = K(0.65);
        waterSurface(lk, -1, 54, [72, 0.25, 126], LAGOON, {
          id: "montreal-jean-dore-lagoon",
        });
        groundPatch(lk, -1, 40, [18, 0.35, 112], SAND, {
          id: "montreal-jean-dore-beach", samples: 6,
        });
      }

      for (const side of [-1, 1]) {
        for (const [s0, s1, gap] of [
          [0.0, 0.05, 2.5], [0.05, 0.09, 3.5], [0.09, 0.60, 2.5],
          [0.60, 0.64, 3.5], [0.64, 1.0, 2.5],
        ]) wall(s0, s1, side, gap, 1.5, WALL);
      }

      fence(0.0, 1.0, -1, 3.4, 3.0, [0.72, 0.74, 0.78]);
      fence(0.0, 1.0,  1, 3.4, 3.0, [0.72, 0.74, 0.78]);

      for (let i = 0; i < 8; i++) {
        const s = (0.88 + i * 0.025) % 1;
        groundPatch(K(s),  1, 8, [48, 0.35, 42], GRASS,
          { id: `montreal-pit-lawn-r-${i}`, samples: 6 });
        groundPatch(K(s), -1, 8, [44, 0.35, 40], GRASS,
          { id: `montreal-pit-lawn-l-${i}`, samples: 6 });
      }
      for (let i = 0; i < 14; i++) {
        if ([4, 9, 11, 12].includes(i)) continue;
        groundPatch(K(0.08 + i * 0.058), 1, 9, [42, 0.35, 40], GRASS,
          { id: `montreal-park-lawn-r-${i}`, samples: 6 });
      }
      for (let i = 0; i < 10; i++) {
        groundPatch(K(0.10 + i * 0.068), -1, 9, [40, 0.35, 38], GRASS,
          { id: `montreal-park-lawn-l-${i}`, samples: 6 });
      }

      hedge(0.13, 0.19,  1, 9, 1.6, HEDGE);
      hedge(0.38, 0.50,  1, 9, 1.4, HEDGE);
      hedge(0.62, 0.69, -1, 9, 1.6, HEDGE);
      hedge(0.73, 0.78, -1, 9, 1.6, HEDGE);
      hedge(0.78, 0.885, 1, 9, 1.6, HEDGE);

      for (const s of [0.18, 0.32, 0.47, 0.56, 0.68, 0.82, 0.94]) {
        marshalPost(K(s), (Math.round(s * 100) % 2) ? 1 : -1, (s === 0.47 || s === 0.68) ? 13 : 8.5);
      }

      grandstandEx(0.02,  1,  8, 120, null, null,
        { livery: "teal", tiers: 2, roof: "truss", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.0,  -1, 10,  90, null, null, { livery: "steel", roof: "cantilever", endWalls: true });
      grandstandEx(0.06,  1,  9,  90, null, null, { livery: "alu", roof: "flat", endWalls: true });
      grandstandEx(0.96, -1, 11,  80, null, null, { livery: "teal", roof: "cantilever", endWalls: true });

      gantry(0.005, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.97,  6.5, [0.16, 0.16, 0.20]);

      flagMast(K(0.005),  1, 10, 12, [0.88, 0.12, 0.16]);
      flagMast(K(0.005), -1, 10, 12, [0.88, 0.12, 0.16]);
      flagMast(K(0.999),  1,  9, 11, [0.88, 0.12, 0.16]);

      if (circuitKit) {
        circuitKit.pitBuilding({
          id: "kit:montreal:pit-building", frac: 0.995,
          side: -1, gap: 13, size: [18, 10, 260], garages: 16, required: true,
        });
        circuitKit.hospitality({
          id: "kit:montreal:espace-paddock", frac: 0.015,
          side: -1, gap: 30, size: [20, 15, 130], modules: 5,
        });
        circuitKit.cameraCrane({
          id: "kit:montreal:camera-crane", frac: 0.945,
          side: -1, gap: 40, size: [6, 17, 6],
        });
        circuitKit.serviceCompound({
          id: "kit:montreal:service-compound", frac: 0.06,
          side: -1, gap: 45, size: [24, 5, 42], vehicles: 8,
        });
        circuitKit.trackSigns({
          id: "kit:montreal:pit-signage", frac: 0.05,
          side: 1, gap: 24, size: [2.2, 2.2, 60], count: 8,
        });
      }
      broadcastCompound(K(0.03), -1, 58, { vans: 3, dishes: 2, mastH: 10 });

      {
        const SHELL = [0.84, 0.86, 0.89];
        for (const sf of [0.9855, 0.0215]) {
          const a = anchor(K(sf), -1, 20.4);
          if (onTrack(a.c[0], a.c[2], 1.2)) continue;
          const b = [a.r, a.u, a.t];
          const foot = a.c.slice();
          const gy = groundUnder(foot[0], foot[2]);
          if (gy !== null) foot[1] = gy;
          out._mat = MAT.CONCRETE;
          seat.box(out, foot, [13.6, 12.4, 0.7], SHELL, b);
          out._mat = 0;
        }
      }


      const STRAIGHT_HUES = [
        [0.90, 0.62, 0.14], [0.88, 0.82, 0.22], [0.86, 0.24, 0.20], [0.92, 0.50, 0.12],
      ];
      [0.01, 0.04, 0.97, 0.94].forEach((s, i) => {
        billboard(K(s), 1, 10, 14, 4, STRAIGHT_HUES[i]);
      });
      billboard(K(0.07), -1, 11, 12, 4, [0.18, 0.52, 0.58]);

      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) {
          place(K(0.04 + j * 0.004), side, 3, [3, 0.84, 4], (j % 2) ? KERB_W : KERB_R);
        }
      }
      tyreWall(0.038, 0.058,  1, 3.2, [0.85, 0.30, 0.20]);
      tyreWall(0.042, 0.06,  -1, 3.2, [0.90, 0.90, 0.30]);
      marshalPost(K(0.05), 1, 9);

      {
        waterBand(0.065, 0.20, -1, 26, 136, 12, BASIN,
          { id: "montreal-olympic-basin-north" });
      }

      {
        const SHORE = [TEAL[0] + 0.10, TEAL[1] + 0.12, TEAL[2] + 0.08];
        const QUAY = [0.72, 0.74, 0.76];
        waterBand(0.072, 0.188, -1, 24, 34, 8, SHORE, {
          id: "montreal-basin-shore-north",
        });
        waterBand(0.575, 0.670, 1, 22, 32, 8, SHORE, {
          id: "montreal-basin-shore-straight",
        });
        for (const [s0, s1, side, gap] of [
          [0.08, 0.18, -1, 23],
          [0.58, 0.66, 1, 21],
        ]) {
          const steps = 6;
          for (let i = 0; i < steps; i++) {
            const sf = s0 + (i + 0.5) / steps * (s1 - s0);
            const a = anchor(K(sf), side, gap);
            if (onTrack(a.c[0], a.c[2], 3)) continue;
            const b = [a.r, a.u, a.t];
            const foot = a.c.slice();
            const gy = groundUnder(foot[0], foot[2]);
            if (gy !== null) foot[1] = gy;
            addBox(out, vadd(foot, a.u, 0.35), [1.6, 0.55, 14], QUAY, b);
            if (i % 2 === 0) {
              const r = vadd(vadd(foot, a.r, side * 2.2), a.u, 0.2);
              addCyl(out, r, 0.08, 1.6 + hash(i * 17) * 0.8, [0.30, 0.42, 0.22], 4, b);
              addCone(out, vadd(r, a.u, 1.5), 0.45, 0.9, [0.36, 0.48, 0.24], 5, b);
            }
          }
        }
      }

      for (const [s0, s1] of [[0.07, 0.128], [0.142, 0.19]]) forestEdge(s0, s1, -1, 42, {
        density: 0.75, hMin: 9, hMax: 16,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.2
      });
      for (let i = 0; i < 12; i++) {
        const k = K(0.08 + (i / 12) * 0.12);
        backdrop(k, -1, 140 + hash(i * 11) * 25, [20, 7 + hash(i * 5) * 5, 20], [0.16, 0.30, 0.17]);
      }

      rowingTower("montreal-rowing-tower-north", 0.135, -1, 49, 17);
      for (let i = 0; i < 4; i++) {
        const s = 0.088 + i * 0.023;
        for (let lane = 0; lane < 3; lane++) {
          const a = anchor(K(s), -1, 30 + lane * 8);
          addBox(out, vadd(a.c, a.u, 0.18), [0.8, 0.35, 1.8],
            ((i + lane) % 2) ? [0.92, 0.84, 0.22] : [0.88, 0.24, 0.20],
            [a.r, a.u, a.t]);
        }
      }

      scaffoldStand(0.1575, 0.1725, 1, 17, {
        rows: 6, rise: 1.10, setback: 1.85, legEvery: 1,
        tubeCol: [0.66, 0.67, 0.70], deckCol: [0.70, 0.66, 0.58],
        bench: [[0.30, 0.36, 0.52], [0.80, 0.78, 0.74], [0.72, 0.24, 0.22]],
        density: 0.6,
      });

      {
        const k = K(0.10);
        const a = anchor(k, -1, 28);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 3.0), [6, 0.4, 30], [0.76, 0.77, 0.80], b);
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.r,  3.1), [0.18, 0.8, 30], [0.72, 0.72, 0.74], b);
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.r, -3.1), [0.18, 0.8, 30], [0.72, 0.72, 0.74], b);
        for (const ot of [-11, -4, 4, 11]) {
          addCyl(out, vadd(vadd(a.c, a.t, ot), a.u, 0), 0.28, 3.0, [0.68, 0.68, 0.70], 6, b);
        }
      }

      forestEdge(0.13, 0.19, 1, 12, {
        density: 0.72, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      forestEdge(0.23, 0.35, 1, 12, {
        density: 0.72, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      forestEdge(0.13, 0.19, -1, 12, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });
      forestEdge(0.23, 0.30, -1, 12, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      const MAPLE_G  = [0.20, 0.42, 0.19];
      const MAPLE_G2 = [0.26, 0.48, 0.22];
      const MAPLE_R  = [0.36, 0.14, 0.20];
      for (const [s, side, gap, h, tone] of [
        [0.142,  1, 17, 13, 0], [0.151,  1, 22, 15, 1], [0.168,  1, 18, 12, 2],
        [0.178,  1, 24, 14, 0], [0.243,  1, 19, 13, 1], [0.256,  1, 25, 15, 0],
        [0.271,  1, 17, 12, 2], [0.288,  1, 22, 14, 0], [0.305,  1, 18, 13, 1],
        [0.146, -1, 16, 12, 0], [0.164, -1, 21, 14, 1], [0.256, -1, 17, 13, 2],
        [0.276, -1, 22, 15, 0],
        [0.392,  1, 17, 13, 1], [0.412,  1, 22, 14, 0], [0.433,  1, 18, 12, 2],
        [0.596, -1, 16, 13, 0], [0.612, -1, 21, 15, 1], [0.631, -1, 17, 12, 2],
        [0.648, -1, 23, 14, 0],
        [0.802, -1, 18, 13, 1], [0.821, -1, 23, 15, 0], [0.845, -1, 17, 12, 2],
        [0.862,  1, 19, 14, 0], [0.881,  1, 24, 13, 1], [0.898,  1, 18, 12, 0],
      ]) {
        broadleafFall(K(s), side, gap, h,
                      tone === 2 ? MAPLE_R : (tone ? MAPLE_G2 : MAPLE_G),
                      { lobes: 4, spread: 1.2, barkCol: [0.34, 0.30, 0.26] });
      }

      for (let i = 0; i < 18; i++) {
        const s = 0.16 + i * 0.0088;
        if (s >= 0.19 && s <= 0.23) continue;
        bush(K(s), (i % 2) ? 1 : -1, 9 + hash(i * 11) * 5,
          (i % 2) ? [0.22, 0.42, 0.20] : [0.18, 0.38, 0.18]);
      }

      forestEdge(0.35, 0.50, 1, 12, {
        density: 0.65, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.12
      });
      forestEdge(0.35, 0.48, -1, 12, {
        density: 0.55, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });
      forestEdge(0.495, 0.535, -1, 24, {
        density: 0.62, hMin: 8, hMax: 15,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.12
      });
      forestEdge(0.655, 0.688, 1, 42, {
        density: 0.58, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.16
      });
      for (let i = 0; i < 10; i++) {
        if ((i % 2) && 0.37 + i * 0.012 >= 0.38) continue;
        bush(K(0.37 + i * 0.012), (i % 2) ? 1 : -1, 10 + hash(i * 7) * 4,
          (i % 2) ? [0.20, 0.40, 0.18] : [0.24, 0.44, 0.20]);
      }
      cameraTower(K(0.385), 1, 25, { h: 16 });
      sponsorHoarding(0.36, 0.44, 1, 11, {
        palette: [[0.14, 0.42, 0.68], [0.90, 0.90, 0.90], [0.10, 0.34, 0.72], [0.90, 0.62, 0.14]],
      });
      billboard(K(0.44), -1, 10, 12, 4, [0.20, 0.46, 0.42]);


      for (let i = 0; i < 13; i++) {
        farBank(K(0.27 + i * 0.015), -1, 185, 320, 220);
      }

      {
        const a = anchor(K(0.335), -1, 210);
        if (!onTrack(a.c[0], a.c[2], 30)) {
          const b = [a.r, a.u, a.t];
          const foot = vadd(a.c, a.u, BANK_T - a.c[1]);
          const STEEL  = [0.78, 0.80, 0.83];
          const STEEL_D = [0.66, 0.68, 0.72];
          modelGroup("montreal-calder-trois-disques", {
            center: vadd(foot, a.u, 11), size: [26, 26, 26], basis: b,
          }, (stage) => {
            stage._mat = MAT.METAL;
            const LEGS = [[-1, -1, 1.00], [1, -1, 1.07], [-1, 1, 1.14], [1, 1, 1.21]];
            for (const [dr, dt, sc] of LEGS) {
              for (let i = 0; i < 6; i++) {
                const f = i / 5, f2 = (i + 1) / 5;
                const s1 = (1.2 + f * 6.2) * sc, s2 = (1.2 + f2 * 6.2) * sc;
                const y1 = 10.5 - f * 10.0, y2 = 10.5 - f2 * 10.0;
                const p1 = vadd(vadd(vadd(foot, a.r, dr * s1), a.t, dt * s1), a.u, y1);
                const p2 = vadd(vadd(vadd(foot, a.r, dr * s2), a.t, dt * s2), a.u, y2);
                strut(p2, p1, 0.78 - f * 0.15, i % 2 ? STEEL : STEEL_D, 7, stage);
              }
            }
            addFrustum(stage, vadd(foot, a.u, 11.0), 1.8, 1.1, 2.4, STEEL, 9, b);
            addFrustum(stage, vadd(foot, a.u, 13.2), 1.1, 0.7, 7.0, STEEL, 9, b);
            const disc = [a.u, a.r, a.t];
            addCyl(stage, vadd(foot, a.u, 19.4), 3.4, 0.35, STEEL, 14, disc);
            stage._mat = 0;
          });
        }
      }

      {
        const BED = [
          [0.86, 0.24, 0.26], [0.94, 0.72, 0.16], [0.88, 0.42, 0.62],
          [0.62, 0.34, 0.72], [0.96, 0.90, 0.82], [0.90, 0.52, 0.14],
        ];
        const EDGE = [0.20, 0.40, 0.20];
        const GRAVEL = [0.74, 0.71, 0.64];
        for (const [sf, side, gap] of [
          [0.205, 1, 54], [0.245, 1, 92], [0.560, 1, 60], [0.600, 1, 98],
        ]) {
          const kk = K(sf), a0 = anchor(kk, side, gap);
          if (onTrack(a0.c[0], a0.c[2], 26)) continue;
          const b = [a0.r, a0.u, a0.t];
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 4; c++) {
              const hv = hash(kk * 31 + r * 13 + c * 7);
              const p = vadd(vadd(a0.c, a0.r, r * 11), a0.t, (c - 1.5) * 11);
              if (onTrack(p[0], p[2], 14)) continue;
              addBox(out, vadd(p, a0.u, 0.22), [10.4, 0.44, 10.4], GRAVEL, b);
              out._mat = MAT.FOLIAGE;
              addBox(out, vadd(p, a0.u, 0.35), [8.6, 0.60, 8.6], EDGE, b);
              addBox(out, vadd(p, a0.u, 0.52), [7.0, 0.62, 7.0],
                     BED[Math.floor(hv * 997) % BED.length], b);
              out._mat = 0;
            }
          }
        }
      }


      (function islandMidfield() {
        const PATH = [0.62, 0.60, 0.54];
        const TECH = [0.74, 0.76, 0.78], TECH_D = [0.60, 0.62, 0.66];
        const WIN = [0.48, 0.60, 0.72];
        for (const [sf, side, gap, len, wid] of [
          [0.22, 1, 48, 90, 12],
          [0.30, 1, 62, 100, 13],
          [0.38, -1, 36, 80, 12],
          [0.48, 1, 52, 95, 13],
          [0.70, -1, 40, 85, 12],
          [0.78, 1, 55, 90, 12],
        ]) {
          groundPatch(K(sf), side, gap, [wid, 0.20, len], PATH, {
            id: `montreal-svc-${Math.round(sf * 1000)}-${side > 0 ? "r" : "l"}`,
            samples: 4,
          });
        }
        for (let i = 0; i < 8; i++) {
          const sf = 0.20 + i * 0.075;
          if (sf > 0.57 && sf < 0.64) continue;
          const side = (i % 2) ? 1 : -1;
          const gap = 55 + hash(i * 13) * 28;
          const a = anchor(K(sf), side, gap), b = [a.r, a.u, a.t];
          if (onTrack(a.c[0], a.c[2], 18)) continue;
          const foot = a.c.slice();
          const gy = groundUnder(foot[0], foot[2]);
          if (gy !== null) foot[1] = gy;
          const w = 14 + hash(i * 7) * 8;
          const h = 5.5 + hash(i * 11) * 3.5;
          const d = 16 + hash(i * 19) * 10;
          const hf = (d / 2 + 3) / Math.max(1, (api.track && api.track.total) || 4361);
          indexSolid(sf - hf, sf + hf, side, gap - w / 2 - 2, w + 5);
          out._mat = MAT.CONCRETE;
          seat.box(out, foot, [w, h, d], i % 2 ? TECH : TECH_D, b);
          out._mat = MAT.METAL;
          addBox(out, vadd(foot, a.u, h + 0.22), [w * 1.06, 0.4, d * 1.06],
            [0.86, 0.87, 0.89], b);
          out._mat = MAT.GLASS;
          addBox(out, vadd(vadd(foot, a.u, h * 0.52), a.r, side * (w * 0.5 + 0.08)),
            [0.18, h * 0.38, d * 0.5], WIN, b);
          out._mat = 0;
        }
        {
          const a = anchor(K(0.255), 1, 95), b = [a.r, a.u, a.t];
          if (!onTrack(a.c[0], a.c[2], 20)) {
            groundPatch(K(0.255), 1, 95, [28, 0.18, 36], [0.70, 0.71, 0.72], {
              id: "montreal-casino-plaza", samples: 4,
            });
            for (let i = 0; i < 5; i++) {
              const p = vadd(vadd(a.c, a.t, (i - 2) * 6), a.u, 0.05);
              addCyl(out, p, 0.18, 0.9, [0.55, 0.56, 0.58], 5, b);
            }
          }
        }
        {
          const ca = anchor(K(0.274), 1, 95);
          const cb = [ca.r, ca.u, ca.t];
          const foot = ca.c.slice();
          const gy = groundUnder(foot[0], foot[2]);
          if (gy !== null) foot[1] = gy;
          const FACE = [0.82, 0.84, 0.86];
          const FACE_D = [0.72, 0.74, 0.78];
          const GLINT = [0.58, 0.72, 0.88];
          const GOLD = [0.82, 0.68, 0.32];
          modelGroup("montreal-casino", {
            center: vadd(vadd(foot, ca.u, 28), ca.t, 9.5),
            size: [76, 58, 82],
            basis: cb,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(foot, ca.u, 1.2), [72, 2.4, 58], FACE_D, cb);
            const tiers = [
              { w: 68, d: 52, h: 12, y: 2.4 },
              { w: 58, d: 44, h: 11, y: 14.4 },
              { w: 48, d: 36, h: 10, y: 25.4 },
              { w: 36, d: 28, h: 9, y: 35.4 },
            ];
            for (let ti = 0; ti < tiers.length; ti++) {
              const tier = tiers[ti];
              const inset = ti * 0.35;
              addBox(stage, vadd(vadd(foot, ca.u, tier.y + tier.h / 2 + inset * 0.2), ca.t, -4 + inset),
                [tier.w - inset * 2, tier.h - 0.08, tier.d - inset * 2],
                ti % 2 ? FACE : FACE_D, cb);
              for (const sideOff of [-1, 1]) {
                addPrism(stage, vadd(vadd(vadd(foot, ca.u, tier.y + tier.h * 0.82 + inset * 0.2),
                  ca.r, sideOff * (tier.w * 0.38 + 0.6)), ca.t, -4 + inset),
                  [tier.w * 0.20, tier.h * 0.32, tier.d * 0.50], GLINT, cb);
              }
            }
            addBox(stage, vadd(vadd(vadd(foot, ca.u, 8.2), ca.t, 30), ca.r, 20),
              [21, 15.5, 36], GOLD, cb);
            addBox(stage, vadd(vadd(vadd(foot, ca.u, 18.4), ca.t, 30), ca.r, 20),
              [17, 9.5, 30], [0.88, 0.74, 0.38], cb);
            stage._mat = 0;
            return true;
          }, { required: true });
        }
        for (let i = 0; i < 14; i++) {
          const sf = 0.21 + i * 0.045;
          if (sf > 0.52 && sf < 0.58) continue;
          const side = (i % 3 === 0) ? -1 : 1;
          const gap = 28 + hash(i * 23) * 22;
          const ht = 7 + hash(i * 29) * 5;
          if (i % 4 === 0) pine(K(sf), side, gap, ht + 2, FOLIAGE);
          else if (i % 4 === 1) tree(K(sf), side, gap, ht, FOLIAGE2);
          else bush(K(sf), side, gap, (i % 2) ? [0.22, 0.42, 0.20] : [0.18, 0.38, 0.18]);
        }
      })();

      {
        const a = anchor(K(0.30), -1, 320);
        const b = [a.r, a.u, a.t];
        const R = 38, HEIGHT = 62, CY = HEIGHT - R;
        let foot = vadd(a.c, a.u, BANK_T - a.c[1]);
        const baseRadius = Math.sqrt(R * R - CY * CY);
        let baseLift = 0;
        const basePoint = (phi) => vadd(vadd(foot, a.r, baseRadius * Math.cos(phi)),
          a.t, baseRadius * Math.sin(phi));
        for (let m = 0; m < 12; m++) {
          const p0 = basePoint(m / 12 * Math.PI * 2);
          const p1 = basePoint((m + 1) / 12 * Math.PI * 2);
          for (let j = 0; j <= 4; j++) {
            const f = j / 4;
            for (const side of [-1, 0, 1]) {
              const phi = (m + f) / 12 * Math.PI * 2;
              const p = p0.map((v, k) => v + (p1[k] - v) * f +
                side * 0.55 * (a.r[k] * Math.cos(phi) + a.t[k] * Math.sin(phi)));
              const gy = groundUnder(p[0], p[2]);
              if (gy !== null) baseLift = Math.max(baseLift, gy - p[1]);
            }
          }
        }
        foot = vadd(foot, a.u, baseLift + 0.55 + 0.05);
        const emitBio = (stage) => {
          const FRAME = [0.80, 0.82, 0.85];
          const MUSEUM = [0.68, 0.70, 0.73];
          const MER = 12, levels = [0, 12, CY, 36, 48, 57];
          const surf = (y, phi) => {
            const radius = Math.sqrt(Math.max(0, R * R - (y - CY) * (y - CY)));
            return vadd(vadd(vadd(foot, a.u, y),
              a.r, radius * Math.cos(phi)), a.t, radius * Math.sin(phi));
          };
          stage._mat = MAT.CONCRETE;
          for (let j = 0; j < levels.length; j++) {
            for (let m = 0; m < MER; m++) {
              const phi = m / MER * Math.PI * 2;
              const next = (m + 1) / MER * Math.PI * 2;
              const p = surf(levels[j], phi);
              if (j === 0) {
                const gy = groundUnder(p[0], p[2]);
                if (gy !== null && p[1] - gy > 0.15) {
                  strut([p[0], gy - 0.1, p[2]], p, 0.65, MUSEUM, 3, stage);
                }
              }
              strut(p, surf(levels[j], next), 0.55, FRAME, 3, stage);
              if (j + 1 < levels.length) {
                strut(p, surf(levels[j + 1], phi), 0.55, FRAME, 3, stage);
                strut(p, surf(levels[j + 1], next), 0.45, FRAME, 3, stage);
              } else {
                strut(p, vadd(foot, a.u, HEIGHT), 0.55, FRAME, 3, stage);
              }
            }
          }
          for (const x of [-9, 9]) for (const z of [-9, 9]) {
            const p = vadd(vadd(foot, a.r, x), a.t, z);
            const gy = groundUnder(p[0], p[2]);
            const bottom = p.slice();
            if (gy !== null) bottom[1] = Math.min(p[1], gy - 0.1);
            const h = 24.3 + p[1] - bottom[1];
            addBox(stage, vadd(bottom, a.u, h / 2),
              [1.4, h, 1.4], MUSEUM, b);
          }
          for (const y of [12, 24]) {
            addBox(stage, vadd(foot, a.u, y), [24, 0.8, 24], MUSEUM, b);
          }
          stage._mat = 0;
        };
        modelGroup("montreal-biosphere", {
          center: vadd(foot, a.u, HEIGHT * 0.5 - 1),
          size: [R * 2 + 4, HEIGHT + 8, R * 2 + 4],
          basis: b,
        }, emitBio, { required: true });
      }

      for (let i = 0; i < 5; i++) {
        farBank(K(0.32 + i * 0.019), -1, 1500, 1760, 320, [0.36, 0.41, 0.40]);
      }

      cityFront(0.36, 0.41, -1, 1520, {
        minH: 55, maxH: 130, depth: 26, step: 30,
        palette: [
          [0.56, 0.60, 0.66], [0.60, 0.62, 0.68],
          [0.52, 0.56, 0.62], [0.58, 0.60, 0.66],
        ],
        lit: false,
        windowCol: [0.64, 0.78, 0.96],
        floor: 6,
      });
      for (let i = 0; i < 5; i++) {
        const k = K(0.37 + (i / 5) * 0.03);
        backdrop(k, -1, 1560 + hash(i * 19) * 70,
                 [22, 100 + hash(i * 13) * 70, 22], [0.54, 0.58, 0.64]);
      }

      {
        const jk = K(0.37);
        const ja = anchor(jk, -1, 1400);
        const jb = [ja.r, ja.u, ja.t];
        const STEEL = [0.62, 0.64, 0.68];
        const SPAN = 500, DECK_Y = 16, TOP_Y = 45, BAYS = 12;
        const half = SPAN / 2;
        addBox(out, vadd(ja.c, ja.u, DECK_Y), [12, 2.4, SPAN], STEEL, jb);
        addBox(out, vadd(ja.c, ja.u, TOP_Y), [8, 1.6, SPAN], STEEL, jb);
        let prevTop = vadd(vadd(ja.c, ja.t, -half), ja.u, TOP_Y);
        let prevBot = vadd(vadd(ja.c, ja.t, -half), ja.u, DECK_Y + 1.2);
        for (let i = 0; i <= BAYS; i++) {
          const off = -half + (SPAN / BAYS) * i;
          const top = vadd(vadd(ja.c, ja.t, off), ja.u, TOP_Y);
          const bot = vadd(vadd(ja.c, ja.t, off), ja.u, DECK_Y + 1.2);
          strut(bot, top, 0.5, STEEL, 4);
          if (i > 0) {
            strut(prevBot, top, 0.4, STEEL, 4);
            strut(prevTop, bot, 0.4, STEEL, 4);
          }
          prevTop = top; prevBot = bot;
        }
        for (const off of [-half * 0.55, half * 0.55]) {
          addBox(out, vadd(vadd(ja.c, ja.t, off), ja.u, DECK_Y * 0.4),
            [6, DECK_Y * 0.8, 6], [0.48, 0.49, 0.52], jb);
        }
      }

      {
        const hk = K(0.332);
        const ha = anchor(hk, -1, 790);
        const hb = [ha.r, ha.u, ha.t];
        const CUBE = 9;
        const TONE_A = [0.72, 0.70, 0.65];
        const TONE_B = [0.80, 0.79, 0.75];
        const LAYOUT = [
          [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0],
          [0.5, 1, 0.3], [1.5, 1, 0.3], [2.5, 1, 0.3], [3.5, 1, 0.3],
          [1, 2, 0.6], [2, 2, 0.6], [3, 2, 0.6],
          [1.5, 3, 0.9], [2.5, 3, 0.9],
          [2, 4, 1.2],
        ];
        modelGroup("montreal-habitat67", {
          center: vadd(vadd(vadd(ha.c, ha.t, CUBE * 2), ha.u, CUBE * 2.5), ha.r, -CUBE * 0.6),
          size: [CUBE * 5 + 6, CUBE * 5 + 6, CUBE * 6 + 6],
          basis: hb,
        }, (stage) => {
          for (let i = 0; i < LAYOUT.length; i++) {
            const [tOff, level, rJog] = LAYOUT[i];
            const c = vadd(vadd(vadd(ha.c,
              ha.t, tOff * CUBE),
              ha.u, CUBE / 2 + level * CUBE * 0.94),
              ha.r, -rJog * CUBE);
            addBox(stage, c, [CUBE * 0.92, CUBE * 0.92, CUBE * 0.92],
              (i % 2) ? TONE_A : TONE_B, hb);
          }
          return true;
        });
      }

      {
        const k = K(0.45);
        const frame = frameAt(0.45);
        const deckY = frame.c[1] + 8;
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 5);
          const h = deckY - a.c[1];
          const capY = deckY - 0.4;
          const center = vadd(a.c, a.u, h / 2);
          const basis = [a.r, a.u, a.t];
          modelGroup(`montreal-casino-footbridge-support-${side < 0 ? "left" : "right"}`, {
            center,
            size: [1.1, h, 3.4],
            basis,
          }, (stage) => {
            let ok = false;
            for (const along of [-1.2, 1.2]) {
              ok = foundation(stage, {
                center: vadd(a.c, a.t, along),
                size: [0.65, 0.65],
                top: capY,
                basis,
                col: [0.60, 0.62, 0.64],
                embed: 0,
                ground: a.c[1] + 0.3,
              }) || ok;
            }
            addBox(stage, vadd(a.c, a.u, h - 0.2),
              [1.1, 0.4, 3.4], [0.66, 0.68, 0.70], basis);
            return ok;
          }, { required: true });
        }
        overheadSpan({
          id: "montreal-casino-footbridge",
          frac: 0.45,
          clearance: 8,
          thickness: 1,
          depth: 4,
          supportGap: 5,
          color: [0.68, 0.70, 0.72],
          required: true,
          supports: false,
        });
      }

      ferrisWheel(K(0.42), 1, 200, 34);
      tower(K(0.40), 1, 220, 14, 46,
        { col: [0.78, 0.62, 0.40], seg: 6, cap: true, capCol: [0.8, 0.3, 0.2], mast: 10 });

      {
        const CONC = [0.70, 0.72, 0.74], CONC2 = [0.64, 0.66, 0.68];
        const TEAL_F = [0.18, 0.48, 0.52];
        const HP = 0.6178;
        const stand = (dst, s, gap, len, rows, fascia) => {
          const a = anchor(K(s), -1, gap);
          const b = [a.r, a.u, a.t];
          dst._mat = MAT.CONCRETE;
          for (let t = 0; t < rows; t++) {
            const outLat = -1 * (2.0 + t * 1.5);
            addBox(dst, vadd(vadd(a.c, a.r, outLat), a.u, 0.7 + t * 1.0),
              [2.8, 1.0, len - t * 1.5], t & 1 ? CONC : CONC2, b);
          }
          dst._mat = MAT.METAL;
          addBox(dst, vadd(vadd(a.c, a.r, -1.6), a.u, 1.3),
            [0.28, 0.85, len * 0.9], fascia || TEAL_F, b);
          dst._mat = 0;
        };
        const a0 = anchor(K(HP), -1, 29);
        const b0 = [a0.r, a0.u, a0.t];
        modelGroup("montreal-hairpin-grandstands", {
          center: vadd(a0.c, a0.u, 5),
          size: [14, 12, 40],
          basis: b0,
        }, (stage) => {
          stand(stage, HP, 24, 34, 5, TEAL_F);
        }, { required: true });
        stand(out, HP - 0.004, 24, 30, 4, [0.86, 0.24, 0.20]);
        stand(out, HP + 0.004, 24, 30, 4, [0.90, 0.82, 0.22]);
        {
          const a = anchor(K(HP), 1, 7);
          const b = [a.r, a.u, a.t];
          out._mat = MAT.CONCRETE;
          for (let t = 0; t < 5; t++) {
            const outLat = 1.6 + t * 1.65;
            addBox(out, vadd(vadd(a.c, a.r, outLat), a.u, 0.65 + t * 1.05),
              [3.0, 1.05, 10 - t * 0.6], t & 1 ? CONC : CONC2, b);
          }
          out._mat = MAT.METAL;
          addBox(out, vadd(vadd(a.c, a.r, 1.2), a.u, 1.4),
            [0.30, 0.9, 9], [0.22, 0.42, 0.62], b);
          out._mat = 0;
        }
      }
      for (let j = 0; j < 3; j++) place(K(0.614 + j * 0.004), 1, 3, [3, 0.84, 4], (j % 2) ? KERB_R : KERB_W);
      tyreWall(0.598, 0.607, -1, 4.5, [0.85, 0.30, 0.20]);
      tyreWall(0.608, 0.628, -1, 4.5, [0.90, 0.85, 0.20]);
      marshalPost(K(0.605), -1, 9);
      billboard(K(0.600), -1, 11, 12, 4, [0.24, 0.30, 0.62]);

      {
        const TEAL_S = [0.14, 0.46, 0.52], RED_S = [0.86, 0.22, 0.18];
        const YEL_S = [0.90, 0.82, 0.20];
        for (const [sf, side, gap, col] of [
          [0.6138, -1, 22, RED_S], [0.6178, -1, 22, TEAL_S], [0.6218, -1, 22, YEL_S],
        ]) {
          const a = anchor(K(sf), side, gap), b = [a.r, a.u, a.t];
          if (onTrack(a.c[0], a.c[2], 4)) continue;
          out._mat = MAT.METAL;
          for (const sgn of [-1, 1]) {
            addBox(out, vadd(vadd(a.c, a.t, sgn * 14), a.u, 3.2),
              [2.6, 5.8, 0.4], col, b);
          }
          out._mat = 0;
        }
        for (const [sf, side, gap, col] of [
          [0.604, 1, 4, [0.88, 0.18, 0.16]],
          [0.609, -1, 11, [0.14, 0.42, 0.68]],
          [0.628, 1, 4, [0.90, 0.78, 0.16]],
          [0.634, -1, 11, [0.10, 0.48, 0.42]],
        ]) {
          billboard(K(sf), side, gap, 11, 3.6, col);
        }
      }

      billboard(K(0.58), -1, 11, 12, 4, [0.14, 0.46, 0.62]);

      {
        waterBand(0.565, 0.679, 1, 24, 144, 12, BASIN,
          { id: "montreal-olympic-basin-straight" });
      }
      for (const s of [0.60, 0.67]) {
        const a = anchor(K(s), 1, 22);
        if (onTrack(a.c[0], a.c[2], 2)) continue;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 3.0), [2.0, 6.0, 2.0], [0.86, 0.87, 0.90], b);
        addBox(out, vadd(a.c, a.u, 6.2), [2.6, 0.5, 2.6], [0.70, 0.72, 0.76], b);
      }
      rowingTower("montreal-rowing-tower-finish", 0.625, 1, 48, 19);
      for (const [s0, s1] of [[0.575, 0.609], [0.641, 0.65]]) forestEdge(s0, s1, 1, 38, {
        density: 0.70, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.20
      });
      for (const [s0, s1] of [[0.58, 0.608], [0.628, 0.65]]) forestEdge(s0, s1, -1, 28, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });

      grandstandEx(0.65, -1, 18, 80, null, null,
        { livery: "teal", tiers: 2, roof: "cantilever", endWalls: true });

      {
        const a = anchor(K(0.74), -1, 16);
        if (!onTrack(a.c[0], a.c[2], 6)) {
          const b = [a.r, a.u, a.t];
          const DECK = [0.70, 0.66, 0.60], TUBE = [0.60, 0.62, 0.66];
          out._mat = MAT.WOOD;
          for (let t = 0; t < 4; t++) {
            const outLat = -1 * (1.5 + t * 1.7);
            addBox(out, vadd(vadd(a.c, a.r, outLat), a.u, 0.55 + t * 0.95),
              [3.0, 0.9, 42 - t * 2], DECK, b);
            out._mat = MAT.METAL;
            addCyl(out, vadd(vadd(a.c, a.r, outLat), a.u, -0.15),
              0.10, 0.55 + t * 0.95 + 0.15, TUBE, 4, b);
            out._mat = MAT.WOOD;
          }
          out._mat = 0;
        }
      }

      {
        for (let i = 0; i < 2; i++) {
          const ck = K(0.78 + i * 0.023);
          waterSurface(ck, 1, 70, [28, 0.3, 74], RIVER, {
            id: `montreal-park-canal-${i}`,
          });
        }
      }
      billboard(K(0.84), -1, 11, 12, 4, [0.18, 0.48, 0.30]);

      forestEdge(0.84, 0.92, 1, 14, {
        density: 0.68, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      forestEdge(0.78, 0.90, -1, 25, {
        density: 0.60, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      {
        const k = K(0.80);
        building(k, 1, 28, 18, 12, 16,
          { kind: "slab", wall: [0.74, 0.76, 0.80], window: [0.52, 0.64, 0.76], floor: 3 });
      }

      for (const side of [-1, 1]) {
        for (let j = side > 0 ? 1 : 0; j < 4; j++) place(K(0.896 + j * 0.004), side, 3, [3, 0.84, 4], (j % 2) ? KERB_W : KERB_R);
      }
      tyreWall(0.890, 0.902, -1, 3.0, [0.90, 0.85, 0.20]);
      marshalPost(K(0.890), 1, 9);
      grandstandEx(0.893, -1, 12, 70, null, null, { livery: "alu", roof: "flat" });

      wall(0.906, 0.926, 1, 0.8, 3.6, [0.84, 0.85, 0.87], 0.7);
      {
        const a = anchor(K(0.917), 1, 12);
        const b = [a.r, a.u, a.t];
        const CONC = [0.70, 0.72, 0.74], CONC2 = [0.64, 0.66, 0.68];
        modelGroup("montreal-wall-of-champions-stand", {
          center: vadd(vadd(a.c, a.r, 5), a.u, 6),
          size: [20, 16, 64],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (let t = 0; t < 6; t++) {
            const outLat = 1 * (1.8 + t * 1.7);
            addBox(stage, vadd(vadd(a.c, a.r, outLat), a.u, 0.7 + t * 1.1),
              [3.2, 1.1, 54 - t * 2], t & 1 ? CONC : CONC2, b);
          }
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.r, 1.4), a.u, 1.5),
            [0.32, 1.0, 50], [0.18, 0.48, 0.52], b);
          const ap = anchor(K(0.917), 1, 4.0);
          const bp = [ap.r, ap.u, ap.t];
          for (const ot of [-8, -2.5, 2.5, 8]) {
            addCyl(stage, vadd(ap.c, ap.t, ot), 0.14, 5.4, [0.32, 0.32, 0.35], 5, bp);
          }
          addBox(stage, vadd(ap.c, ap.u, 4.8), [0.14, 2.1, 20], [0.14, 0.32, 0.64], bp);
          addBox(stage, vadd(ap.c, ap.u, 4.8), [0.18, 0.45, 20], [0.94, 0.95, 0.98], bp);
          addBox(stage, vadd(ap.c, ap.u, 4.8), [0.18, 2.1, 0.55], [0.94, 0.95, 0.98], bp);
          addBox(stage, vadd(ap.c, ap.u, 3.6), [0.12, 0.28, 16], [0.88, 0.18, 0.16], bp);
          stage._mat = 0;
        }, { required: true });
      }
      {
        const aw = anchor(K(0.917), 1, 0.85);
        addBox(out, vadd(aw.c, aw.u, 1.8), [0.10, 0.60, 20], [0.88, 0.20, 0.18], [aw.r, aw.u, aw.t]);
      }
      billboard(K(0.96), -1, 12, 14, 4, [0.85, 0.30, 0.16]);
      if (typeof floodMast === "function") {
        for (const [s, side, gap] of [
          [0.012, 1, 30], [0.034, 1, 34], [0.958, -1, 30], [0.975, -1, 32],
          [0.058, 1, 18], [0.078, 1, 18], [0.070, -1, 20],
          [0.545, -1, 16], [0.575, -1, 16], [0.612, -1, 18], [0.630, -1, 18],
          [0.665, -1, 16], [0.700, -1, 16], [0.780, -1, 16], [0.820, -1, 16],
          [0.700, 1, 16], [0.800, 1, 16], [0.860, 1, 16], [0.895, 1, 16],
          [0.265, 1, 16], [0.350, 1, 16], [0.430, 1, 16],
        ]) floodMast(K(s), side, gap, { h: 30, cool: true, pool: false, arms: 2 });
      }

    };
