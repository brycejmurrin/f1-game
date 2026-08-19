/* Apex 26 — HOCKENHEIMRING circuit definition (data only). Retired circuit (`classic: true`): last German GP 2019, not on the current calendar, so it is playable … */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hockenheim",
    classic: true,
    reverse: false,
    startFrac: 0.0,
    name: "HOCKENHEIM",
    gp: "German GP",
    country: "Germany",
    night: false,
    theme: "green",
    lengthKm: 4.6,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.78, s1: 0.06 },   // Motodrom + pits
      { kind: "foliage", s0: 0.40, s1: 0.50 },               // Spitzkehre runoff
    ],
    // Baden pine forest under a hazy continental summer sky.
    pal: {
      zenith:        [0.26, 0.44, 0.72],
      horizon:       [0.74, 0.76, 0.72],
      sun:           [1.0,  0.95, 0.78],
      sunColor:      [1.0,  0.94, 0.76],
      ambientSky:    [0.48, 0.52, 0.58],
      ambientGround: [0.24, 0.25, 0.20],
      fogColor:      [0.70, 0.72, 0.70],
      grass:         [0.19, 0.42, 0.19],
      sunDir:        [0.42, 0.62, 0.36],
    },
    elevations: [
      { s: 0.26, halfM: 380, rise: -3.5 },  // drift down through the forest loop
      { s: 0.46, halfM: 300, rise: -5.0 },  // Spitzkehre sits in the low corner
      { s: 0.70, halfM: 420, rise: 4.0 },   // climb back toward the Motodrom
    ],
    hwZones: [
      { s0: 0.435, s1: 0.480, hw: 6.2, ease: 0.012 },  // Spitzkehre hairpin
      { s0: 0.815, s1: 0.960, hw: 6.6, ease: 0.015 },  // Motodrom stadium loop
    ],
    bankZones: [
      { frac: 0.055, angleDeg: 3.0, widthM: 110 },   // Nordkurve
      { frac: 0.335, angleDeg: 2.5, widthM: 90 },    // Ostkurve entry
      { frac: 0.880, angleDeg: 4.0, widthM: 120 },   // Sachskurve
    ],
    scenery: function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack,
        px, pz, pine, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        sponsorHoarding, cameraTower, seat, forestEdge, terrace, bleacher,
        addBox, addCyl, addPrism, addCone } = api;
      const K = (s) => Math.round(s * n) % n;

      const tiltBasis = (a, ang) => {
        const c = Math.cos(ang), s = Math.sin(ang);
        return [
          [a.r[0] * c + a.u[0] * s, a.r[1] * c + a.u[1] * s, a.r[2] * c + a.u[2] * s],
          [a.u[0] * c - a.r[0] * s, a.u[1] * c - a.r[1] * s, a.u[2] * c - a.r[2] * s],
          a.t,
        ];
      };

      // Baden pine + mixed broadleaf greens.
      const PINE_D = [0.09, 0.25, 0.13], PINE = [0.11, 0.30, 0.15];
      const LEAF = [0.19, 0.44, 0.20], LEAF_D = [0.15, 0.36, 0.17];
      const GRAVEL = [0.66, 0.61, 0.48];
      const CONC = [0.68, 0.68, 0.66];

      const inStadium = (s) => s >= 0.78 || s <= 0.06;
      // THE HARDTWALD WALL. Hockenheim is the forest circuit and was one of the
      // only ones in the fleet never calling forestEdge() — its trees were four
      // scattered every() passes, which gives a wood you can see daylight
      // through in every direction. The real thing is a CORRIDOR: a continuous
      // unbroken wall of pine right up to the verge, both sides, for the whole
      // forest section. That wall is the reason this circuit felt fast, and it
      // is what the scattered ranks below then add depth and variation to.
      // Deferred like every treeline, so it sees the finished barrier set.
      for (const [s0, s1] of [[0.065, 0.315], [0.345, 0.430], [0.495, 0.775]]) {
        for (const side of [-1, 1]) {
          forestEdge(s0, s1, side, 7.5, {
            density: 0.86, hMin: 16, hMax: 30, pineFrac: 0.82,
            col: PINE, col2: LEAF_D,
          });
          forestEdge(s0, s1, side, 26, {
            density: 0.62, hMin: 22, hMax: 36, pineFrac: 0.9,
            col: PINE_D, col2: PINE_D,
          });
        }
      }
      for (const [s0, s1] of [[0.075, 0.305], [0.505, 0.765]]) {
        for (const side of [-1, 1]) {
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
        pine(k, side, 9 + h * 7, 17 + h * 13, h < 0.35 ? PINE_D : PINE);
        if (h > 0.28) pine(k, -side, 10 + h * 8, 15 + h * 12, PINE);
      });
      every(30, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 53 + 9);
        if (h < 0.22) return;
        tree(k, h < 0.5 ? -1 : 1, 14 + h * 10, 11 + h * 8, h < 0.45 ? LEAF_D : LEAF);
        if (h > 0.62) pine(k, h > 0.82 ? -1 : 1, 28 + h * 14, 20 + h * 12, PINE_D);
      });
      // Deep rank blending into the backdrop wall.
      every(48, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.30) return;
        pine(k, h < 0.5 ? -1 : 1, 44 + h * 26, 22 + h * 14, PINE_D);
        if (h > 0.70) tree(k, h > 0.85 ? -1 : 1, 58 + h * 20, 13 + h * 8, LEAF_D);
      });
      // Low scrub along the verge for ground texture.
      every(26, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.55) return;
        bush(k, h < 0.78 ? -1 : 1, 6.5 + h * 4, [0.16, 0.34, 0.16]);
      });

      const BOWL_CONC = [[0.63, 0.62, 0.59], [0.55, 0.545, 0.525]];
      const BOWL_CROWD = [[0.88, 0.86, 0.82], [0.22, 0.30, 0.52],
                          [0.78, 0.28, 0.22], [0.90, 0.78, 0.28]];
      function motodromTerrace(s0, s1, side, gap, rows, step) {
        let i = 0;
        along(s0, s1, step, (k, spacing) => {
          const seg = spacing * 0.96;
          for (let t = 0; t < rows; t++) {
            const a = anchor(k, side, gap + t * 4.3);
            const b = [a.r, a.u, a.t];
            const h = 2.4 + t * 2.7;
            addBox(out, vadd(a.c, a.u, h * 0.5), [4.1, h, seg], BOWL_CONC[t & 1], b);
            addBox(out, vadd(a.c, a.u, h + 0.75), [3.3, 1.5, seg], BOWL_CROWD[(i + t) & 3], b);
          }
          i++;
        });
      }
      motodromTerrace(0.790, 0.945, 1, 13, 5, 9);
      motodromTerrace(0.840, 0.965, -1, 12, 3, 10);

      {
        const roofCol = [0.30, 0.31, 0.34], fascia = [0.86, 0.86, 0.84];
        along(0.815, 0.940, 11, (k, spacing) => {
          const a = anchor(k, 1, 27);
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.28, 21, [0.42, 0.43, 0.46], 6, b);           // rear column
          addBox(out, vadd(a.c, a.u, 21.4), [15, 0.55, spacing * 0.97], roofCol, b);
          addBox(out, vadd(vadd(a.c, a.r, -7.2), a.u, 20.4), [1.1, 1.6, spacing * 0.97], fascia, b);
        });
      }
      // Mercedes-tribune style banked earth terraces closing the far end.
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
            [0.10, 0.16, 0.22], b);                                        // dark screen face
          addBox(stage, vadd(vadd(a.c, a.r, -1.2), a.u, 21), [0.2, 6.6, 12.6],
            [0.62, 0.72, 0.80], b);                                        // lit picture
        }, { required: true });
      }

      {
        const a = anchor(K(0.828), 1, 28);
        const b = [a.r, a.u, a.t];
        const roofB = tiltBasis(a, -0.10);   // roof falls forward over the rake
        modelGroup("hockenheim-mercedes-tribune", {
          center: vadd(vadd(a.c, a.r, -6), a.u, 13), size: [34, 30, 56], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          // Rear shell wall carrying the crown, standing behind the terrace.
          addBox(stage, vadd(vadd(a.c, a.r, 6), a.u, 12.5), [2.0, 25, 48],
            [0.60, 0.60, 0.58], b);
          stage._mat = MAT.GLASS;
          // Glazed press / hospitality band under the roof.
          addBox(stage, vadd(vadd(a.c, a.r, 1), a.u, 21.5), [10, 3.4, 46],
            [0.34, 0.45, 0.54], b);
          stage._mat = MAT.METAL;
          for (let d = 0; d < 4; d++)                          // rear columns
            addCyl(stage, vadd(vadd(a.c, a.r, 6), a.t, (d - 1.5) * 14),
              0.34, 25, [0.42, 0.43, 0.46], 6, b);
          // Deep cantilever roof reaching forward over the terrace, tilted.
          addBox(stage, vadd(vadd(a.c, a.r, -4), a.u, 25.5), [30, 0.7, 50],
            [0.30, 0.31, 0.34], roofB);
          addBox(stage, vadd(vadd(a.c, a.r, -18), a.u, 23.6), [1.2, 2.6, 48],
            [0.88, 0.88, 0.86], b);
          addBox(stage, vadd(vadd(a.c, a.r, -18.1), a.u, 23.6), [1.0, 1.6, 42],
            [0.10, 0.12, 0.16], b);
          stage._mat = 0;
        });
      }
      // Flag masts along the Motodrom rim — the pennant line above the crowd
      // that every stadium shot of the bowl catches. Thin, standing well in
      // front of the first terrace row so they never reach tarmac or terracing.
      {
        const FLAG = [[0.86, 0.16, 0.14], [0.94, 0.93, 0.90],
                      [0.10, 0.30, 0.62], [0.96, 0.78, 0.08]];
        let fi = 0;
        along(0.805, 0.935, 16, (k) => {
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
          const roofB = tiltBasis(a, -0.14);   // roof plane falls toward the lane
          modelGroup(`hockenheim-pit-bay-${i + 1}`, {
            center: vadd(a.c, a.u, 9), size: [22, 18, 32], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            seat.box(stage, a.c, [16, 1.1, 30], PLINTH, b);
            addBox(stage, vadd(a.c, a.u, 4.8), [14, 6.6, 30], PIT_WALL, b);
            stage._mat = MAT.METAL;
            // Three roller shutters per bay on the trackside face.
            for (let d = 0; d < 3; d++)
              addBox(stage, vadd(vadd(vadd(a.c, a.r, -7.1), a.u, 3.6), a.t, (d - 1) * 9),
                [0.35, 4.4, 6.2], SHUTTER, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(a.c, a.u, 10.0), [14.6, 3.4, 30], GLASS, b);
            stage._mat = MAT.METAL;
            // Team viewing balcony projecting over the lane.
            addBox(stage, vadd(vadd(a.c, a.r, -8.4), a.u, 8.3), [3.6, 0.35, 29], ROOF, b);
            addBox(stage, vadd(vadd(a.c, a.r, -10.0), a.u, 8.9), [0.16, 1.1, 29], [0.72, 0.74, 0.78], b);
            // The roof plane itself, tilted, reaching well past the balcony.
            addBox(stage, vadd(vadd(a.c, a.r, -3.0), a.u, 13.4), [24, 0.6, 30], ROOF, roofB);
            // Raking struts that carry it — the diagonal is the whole point.
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
      grandstandEx(0.010, -1, 11, 140, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      for (let i = 0; i < 4; i++) {
        building(K(0.955 + i * 0.016), 1, 40, 22, 14, 20,
          { kind: "notch", wall: [0.74, 0.76, 0.80], window: [0.36, 0.44, 0.52], floor: 4.0 });
      }
      every(44, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.93 || s < 0.05) || h < 0.5) return;
        motorhome(k, 1, 58 + h * 10, 10, 4, 6, { wall: [0.62 + h * 0.28, 0.62, 0.64] });
      });
      broadcastCompound(K(0.945), 1, 74, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.985, 0.005, 0.025]) billboard(K(s), -1, 8, 12, 4.5, [0.90, 0.86, 0.30]);

      groundPatch(K(0.455), -1, 6, [46, 0.18, 60], GRAVEL,
        { id: "hockenheim-spitzkehre-gravel", samples: 8 });
      tyreWall(0.440, 0.475, -1, 5, [0.86, 0.20, 0.18]);
      grandstandEx(0.457, 1, 16, 76, null, null, { livery: "steel", endWalls: true });
      marshalPost(K(0.450), 1, 10);
      for (const s of [0.435, 0.470]) billboard(K(s), -1, 14, 12, 4.5, [0.88, 0.84, 0.78]);

      // Ostkurve / forest-loop corner furniture.
      groundPatch(K(0.335), 1, 5, [26, 0.18, 34], GRAVEL,
        { id: "hockenheim-ostkurve-gravel", samples: 6 });
      tyreWall(0.325, 0.350, 1, 4, [0.20, 0.40, 0.85]);
      grandstandEx(0.340, -1, 18, 54, null, null, { livery: "concrete" });
      marshalPost(K(0.345), -1, 9);

      groundPatch(K(0.62), 1, 5, [24, 0.18, 30], GRAVEL,
        { id: "hockenheim-forest-exit-gravel", samples: 5 });
      marshalPost(K(0.60), 1, 9);

      for (const [s0, s1] of [[0.06, 0.32], [0.36, 0.43], [0.49, 0.60], [0.64, 0.78]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.78, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.80, 0.05, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.845, 0.965, 1, 10, 4, [0.74, 0.76, 0.80]);
      fence(0.43, 0.49, -1, 8, 4, [0.74, 0.76, 0.80]);

      for (const s of [0.14, 0.22, 0.29, 0.52, 0.68, 0.75]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
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
        const WALL_D = [0.075, 0.20, 0.105], WALL = [0.095, 0.245, 0.125];
        for (const [s0, s1] of [
          [0.065, 0.315], [0.360, 0.430], [0.490, 0.600], [0.640, 0.755],
        ]) {
          for (const side of [-1, 1]) {
            let i = 0;
            along(s0, s1, 12, (k, spacing) => {
              const seg = spacing * 1.02;   // overlap so the wall never gaps
              const h = hash(k * 29 + side);
              const a1 = anchor(k, side, 16 + h * 3);
              addPrism(out, a1.c, [11, 17 + h * 7, seg], (i & 1) ? WALL_D : WALL,
                [a1.r, a1.u, a1.t]);
              const a2 = anchor(k, side, 28 + h * 6);
              addPrism(out, a2.c, [15, 21 + h * 9, seg], WALL_D, [a2.r, a2.u, a2.t]);
              i++;
            });
          }
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
        });
      }

      sponsorHoarding(0.800, 0.945, 1, 6.5, {
        h: 1.3, step: 10,
        palette: [[0.86, 0.16, 0.14], [0.94, 0.93, 0.90], [0.10, 0.30, 0.62], [0.96, 0.78, 0.08]],
      });
      sponsorHoarding(0.845, 0.960, -1, 6.0, { h: 1.2, step: 11 });

      cameraTower(K(0.838), 1, 8, { h: 17 });
      cameraTower(K(0.918), -1, 8, { h: 15 });
      cameraTower(K(0.470), 1, 10, { h: 14 });   // Spitzkehre, the other TV vantage
    },
  }
  );
})();
