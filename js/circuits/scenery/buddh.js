"use strict";
(window.TrackScenery = window.TrackScenery || {})["buddh"] =
  function (api) {
      const { hash, every, anchor, onTrack, out, MAT, vadd,
        tree, bush, place, ridge, addBox, addCyl, addCone, addFrustum, modelGroup,
        guardrail, tyreWall, marshalPost, cameraTower, broadcastCompound,
        billboard, sponsorHoarding, runoffApron, terrainYAt,
        grandstandEx, scaffoldStand, spectatorHill } = api;

      const { K } = api;
      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (r) => (((r + SL) % 1) + 1) % 1;
      const bank = (s, side, dist, len, w, h, col) => {
        const a = anchor(K(s), side, dist);
        ridge(a.c[0], a.c[2], a.c[1], Math.atan2(a.t[0], a.t[2]), len, w, h, col);
      };

      const clear = (k, dist, r) => {
        const a = anchor(k, -1, dist);
        return !onTrack(a.c[0], a.c[2], r || 30);
      };
      const bund = (s2, dist, len) => {
        const k = K(s2);
        if (!clear(k, dist, 34)) return;
        bank(s2, -1, dist, len, 3.1, 1.2, BUND);
      };

      const ARMCO     = [0.78, 0.78, 0.80];
      const PITWALL   = [0.86, 0.86, 0.84];
      const GLASS     = [0.34, 0.44, 0.50];
      const FASCIA    = [0.87, 0.87, 0.85];
      const COACH     = [0.88, 0.88, 0.86];
      const PALE      = [0.58, 0.575, 0.575];
      const CONCRETE  = [0.64, 0.63, 0.60];
      const TYRECAP   = [0.84, 0.80, 0.30];
      const BOARD     = [0.80, 0.24, 0.20];
      const DUST      = [0.48, 0.32, 0.21];
      const DIRTRD    = [0.54, 0.42, 0.30];
      const EARTH     = [0.44, 0.33, 0.23];
      const DRYGRASS  = [0.50, 0.48, 0.30];
      const FIELD_A   = [0.56, 0.50, 0.31];
      const FIELD_B   = [0.49, 0.45, 0.29];
      const STUBBLE   = [0.61, 0.55, 0.35];
      const CROP      = [0.41, 0.45, 0.26];
      const BUND      = [0.47, 0.38, 0.27];
      const BURNT     = [0.33, 0.29, 0.22];
      const DRYFOL    = [0.30, 0.36, 0.20];
      const SCRUB     = [0.34, 0.38, 0.22];
      const SCRUB_D   = [0.29, 0.32, 0.19];
      const KILN      = [0.45, 0.26, 0.19];
      const BRICK     = [0.52, 0.31, 0.23];
      const PYLON     = [0.56, 0.56, 0.55];
      const MUD       = [0.60, 0.52, 0.40];
      const MUD_D     = [0.52, 0.45, 0.34];
      const LIME      = [0.74, 0.72, 0.66];
      const CARS      = [[0.72, 0.72, 0.70], [0.46, 0.46, 0.48], [0.70, 0.66, 0.56]];
      const HAZE_R    = [0.63, 0.60, 0.55];
      const HAZE_A    = [0.68, 0.65, 0.60];
      const HAZE_B    = [0.71, 0.68, 0.64];
      const MID_A     = [0.58, 0.54, 0.46];
      const MID_B     = [0.62, 0.58, 0.51];

      const kiln = (s, dist, h) => {
        const k = K(s);
        if (!clear(k, dist, 56)) return;
        runoffApron(k, -1, dist, 74, DUST);
        place(k, -1, dist, [15, 4.6, 46], KILN);
        const kc = K(s + 0.004);
        const a = anchor(kc, -1, dist + 2);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 2.5), [7.5, 5.0, 7.5], KILN, b);
          addBox(out, vadd(a.c, a.u, 5.0 + h * 0.5), [3.3, h, 3.3], KILN, b);
        }
        place(K(s - 0.006), -1, dist - 13, [6.5, 2.4, 11], BRICK);
        place(K(s + 0.010), -1, dist - 10, [5.5, 2.0, 9], BRICK);
      };
      const pylon = (s, dist, h) => {
        const k = K(s);
        if (!clear(k, dist, 26)) return;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 8)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.45), [6.0, 0.9, 6.0], PYLON, b);
        addBox(out, vadd(a.c, a.u, 0.9 + h * 0.5), [2.2, h, 2.2], PYLON, b);
        addBox(out, vadd(vadd(a.c, a.u, 0.9 + h * 0.72), a.t, 0),
          [7.5, 0.35, 0.45], PYLON, b);
      };

      guardrail(0.0, 0.116, 1, 12, ARMCO);
      guardrail(0.116, 0.134, 1, 6.5, ARMCO);
      guardrail(0.134, 0.858, 1, 12, ARMCO);
      guardrail(0.858, 0.869, 1, 6, ARMCO);
      guardrail(0.872, 0.884, 1, 6, ARMCO);
      guardrail(0.884, 1.0, 1, 12, ARMCO);
      guardrail(0.0, 1.0, -1, 14, ARMCO);
      for (const s of [0.045, 0.165, 0.275, 0.34, 0.46, 0.63, 0.70, 0.75, 0.83, 0.93])
        marshalPost(K(s), 1, 15);

      {
        const a = anchor(K(sl(0.005)), 1, 52);
        if (!onTrack(a.c[0], a.c[2], 14)) {
          const b = [a.r, a.u, a.t];
          const foot = a.c.slice();
          const gy = terrainYAt(foot[0], foot[2]);
          if (gy != null) foot[1] = Math.max(foot[1], gy - 0.05);
          const SAFF = [0.86, 0.42, 0.12], GREEN = [0.18, 0.42, 0.28];
          const BODY = [0.78, 0.76, 0.72], BODY_D = [0.68, 0.66, 0.62];
          const BAY = [0.14, 0.15, 0.17], ROOF = [0.82, 0.82, 0.80];
          const LEN = 168, BAYS = 14, PITCH = LEN / BAYS;
          const emitPit = (stage) => {
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(foot, a.u, 4.2), [12.5, 8.4, LEN], BODY, b);
            addBox(stage, vadd(vadd(foot, a.r, 5.8), a.u, 4.7),
              [1.4, 9.2, LEN + 3], BODY_D, b);
            for (const tOff of [-LEN * 0.5 - 0.4, LEN * 0.5 + 0.4]) {
              addBox(stage, vadd(vadd(foot, a.t, tOff), a.u, 4.6),
                [13.2, 8.8, 1.2], BODY, b);
            }
            stage._mat = MAT.METAL;
            for (let i = 0; i < BAYS; i++) {
              const tOff = -LEN * 0.5 + (i + 0.5) * PITCH;
              addBox(stage, vadd(vadd(vadd(foot, a.t, tOff), a.r, -6.4), a.u, 2.6),
                [0.35, 5.0, PITCH * 0.72], BAY, b);
              addBox(stage, vadd(vadd(vadd(foot, a.t, tOff), a.r, -6.5), a.u, 5.5),
                [0.55, 0.45, PITCH * 0.78], FASCIA, b);
            }
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(vadd(foot, a.r, -6.7), a.u, 7.6),
              [0.4, 0.7, LEN * 0.96], SAFF, b);
            addBox(stage, vadd(vadd(foot, a.r, -6.7), a.u, 6.9),
              [0.4, 0.55, LEN * 0.96], GREEN, b);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(foot, a.u, 8.8), [14.2, 0.45, LEN + 3], ROOF, b);
            addBox(stage, vadd(vadd(foot, a.r, -6.9), a.u, 9.15),
              [0.5, 0.7, LEN + 2], FASCIA, b);
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(vadd(foot, a.t, LEN * 0.38), a.u, 11.2),
              [10, 6.0, 18], BODY, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(vadd(vadd(foot, a.t, LEN * 0.38), a.r, -5.2), a.u, 12.4),
              [0.3, 3.2, 14], GLASS, b);
            stage._mat = 0;
          };
          modelGroup("buddh-pit-complex", {
            center: vadd(foot, a.u, 6.2), size: [22, 16.4, LEN + 8], basis: b,
          }, emitPit, { required: true });
        }
      }
      runoffApron(K(sl(0.995)), 1, 9, 120, CONCRETE);
      runoffApron(K(sl(0.035)), 1, 9, 120, CONCRETE);
      guardrail(sl(0.0), sl(0.07), 1, 4.5, PITWALL);
      guardrail(sl(0.975), sl(1.0), 1, 4.5, PITWALL);
      marshalPost(K(sl(0.066)), 1, 12);
      billboard(K(sl(0.018)), 1, 22, 12, 4.2, BOARD);
      billboard(K(sl(0.055)), -1, 28, 11, 4.0, BOARD);

      {
        const a = anchor(K(sl(0.022)), -1, 34);
        if (!onTrack(a.c[0], a.c[2], 12)) {
          const b = [a.r, a.u, a.t];
          const ALU = [0.78, 0.79, 0.80], ALU_D = [0.68, 0.69, 0.70];
          const STEEL = [0.42, 0.44, 0.48], CONC = [0.72, 0.71, 0.68];
          const SEAT = [0.55, 0.22, 0.20], SEAT_D = [0.48, 0.20, 0.18];
          const emitMainGS = (stage) => {
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, 0.4), [16, 0.8, 138], CONC, b);
            for (let t = 0; t < 4; t++) {
              const lat = -(1.5 + t * 2.4), h = 1.8, y0 = 0.9 + t * 2.05;
              addBox(stage, vadd(vadd(a.c, a.r, lat), a.u, y0 + h * 0.5),
                [2.6, h, 132 - t * 4], t & 1 ? SEAT : SEAT_D, b);
            }
            addBox(stage, vadd(vadd(a.c, a.r, -11.5), a.u, 9.0),
              [6, 16, 136], CONC, b);
            stage._mat = MAT.METAL;
            const bays = 14, pitch = 9.4, half = (bays - 1) * pitch * 0.5;
            for (let i = 0; i < bays; i++) {
              const tOff = -half + i * pitch;
              const wave = Math.sin((i / (bays - 1)) * Math.PI * 2) * 3.2;
              const roofY = 17.5 + wave;
              const p = vadd(a.c, a.t, tOff);
              addCyl(stage, vadd(p, a.r, -12.5), 0.28, roofY + 0.4, STEEL, 5, b);
              addBox(stage, vadd(vadd(p, a.r, -2.0), a.u, roofY),
                [18.5, 0.35, 0.45], STEEL, b);
              addCyl(stage, vadd(vadd(p, a.r, 6.5), a.u, roofY - 4.5),
                0.16, 4.6, STEEL, 4, b);
            }
            stage._mat = MAT.METAL;
            for (let i = 0; i < bays - 1; i++) {
              const tOff = -half + i * pitch + pitch * 0.5;
              const wave = Math.sin(((i + 0.5) / (bays - 1)) * Math.PI * 2) * 3.2;
              const roofY = 17.8 + wave;
              const p = vadd(a.c, a.t, tOff);
              addBox(stage, vadd(vadd(p, a.r, -2.5), a.u, roofY),
                [17.5, 0.28, pitch * 0.92], i & 1 ? ALU : ALU_D, b);
            }
            addBox(stage, vadd(vadd(a.c, a.r, 6.8), a.u, 16.2),
              [0.4, 1.0, 130], [0.88, 0.88, 0.86], b);
            stage._mat = 0;
          };
          modelGroup("buddh-main-grandstand", {
            center: vadd(vadd(a.c, a.r, -1.75), a.u, 12), size: [26, 28, 148], basis: b,
          }, emitMainGS, { required: true });
        }
      }
      sponsorHoarding(sl(0.004), sl(0.042), -1, 21);
      cameraTower(K(sl(0.050)), -1, 27);
      runoffApron(K(sl(0.012)), -1, 62, 96, CONCRETE);
      runoffApron(K(sl(0.034)), -1, 62, 96, CONCRETE);
      for (let i = 0; i < 3; i++)
        runoffApron(K(sl(0.006 + i * 0.018)), -1, 118 + i * 28, 86, DUST);
      for (let i = 0; i < 22; i++) {
        const h = hash(i * 23);
        place(K(sl(0.000 + i * 0.0026)), -1, 210 + (i % 4) * 14 + h * 4,
          [1.9, 1.5, 4.4], CARS[i % 3]);
      }

      for (let i = 0; i < 4; i++) runoffApron(K(sl(0.012 + i * 0.016)), 1, 78, 64, CONCRETE);
      for (let i = 0; i < 6; i++) place(K(sl(0.016 + i * 0.0085)), 1, 72, [3.2, 3.8, 12], COACH);
      for (let i = 0; i < 4; i++) place(K(sl(0.020 + i * 0.0085)), 1, 85, [3.0, 3.6, 11], COACH);
      place(K(sl(0.046)), 1, 100, [18, 6.5, 34], COACH);
      place(K(sl(0.060)), 1, 100, [17, 6.0, 30], COACH);
      broadcastCompound(K(sl(0.068)), 1, 76);
      for (let i = 0; i < 5; i++)
        place(K(sl(0.026 + i * 0.009)), 1, 118, [2.6, 2.9, 7.5], COACH);

      runoffApron(K(0.100), -1, 8, 72, PALE);
      runoffApron(K(0.116), -1, 8, 72, PALE);
      runoffApron(K(0.108), -1, 22, 72, PALE);
      tyreWall(0.094, 0.136, -1, 30, TYRECAP);
      billboard(K(0.103), -1, 40, 13, 4.8, BOARD);
      billboard(K(0.119), -1, 40, 13, 4.8, BOARD);

      runoffApron(K(0.128), 1, 22, 34, DUST);
      runoffApron(K(0.140), 1, 22, 36, DUST);
      runoffApron(K(0.133), 1, 36, 52, DIRTRD);
      marshalPost(K(0.129), 1, 21);
      for (let i = 0; i < 5; i++) bush(K(0.114 + i * 0.006), 1, 24 + hash(i * 7) * 9, SCRUB);

      for (let i = 0; i < 6; i++)
        runoffApron(K(0.156 + i * 0.016), -1, 95 + i * 22, 80, i % 2 ? FIELD_A : FIELD_B);
      for (let i = 0; i < 5; i++)
        runoffApron(K(0.150 + i * 0.019), -1, 232 + i * 17, 86,
          i === 2 ? CROP : (i % 2 ? STUBBLE : FIELD_A));
      for (let i = 0; i < 6; i++) bund(0.149 + i * 0.016, 118 + i * 29, 48);
      for (let i = 0; i < 9; i++) {
        const h = hash(i * 13);
        tree(K(0.150 + i * 0.010), -1, 122 + h * 22, 6 + h * 4, DRYFOL);
      }
      place(K(0.178), -1, 150, [22, 4.5, 30], [0.62, 0.58, 0.52]);
      place(K(0.202), -1, 168, [18, 4.0, 26], [0.58, 0.54, 0.48]);
      place(K(0.188), -1, 228, [9, 3.4, 13], MUD);
      place(K(0.196), -1, 236, [7, 3.0, 10], LIME);
      place(K(0.199), -1, 224, [6, 2.6, 8], MUD_D);

      marshalPost(K(0.235), 1, 26);
      sponsorHoarding(0.218, 0.258, 1, 15);
      runoffApron(K(0.240), 1, 14, 32, DRYGRASS);
      runoffApron(K(0.226), 1, 16, 30, DUST);

      runoffApron(K(0.296), -1, 7, [14, 0.35, 44], PALE);
      runoffApron(K(0.310), -1, 10, [14, 0.35, 40], PALE);
      tyreWall(0.284, 0.320, -1, 24, TYRECAP);
      scaffoldStand(0.288, 0.316, -1, 38, { step: 7 });
      runoffApron(K(0.302), -1, 58, [28, 0.42, 52], DUST);
      for (let i = 0; i < 4; i++)
        runoffApron(K(0.286 + i * 0.016), -1, 96 + i * 26, 64, i % 2 ? FIELD_B : STUBBLE);

      marshalPost(K(0.372), 1, 18);
      billboard(K(0.381), 1, 40, 14, 5.0, BOARD);
      for (let i = 0; i < 4; i++) bank(0.356 + i * 0.011, 1, 48, 70, 20, 3.2 + i * 0.4, EARTH);
      for (let i = 0; i < 5; i++)
        bush(K(0.358 + i * 0.009), 1, 38 + hash(i * 31) * 8, i % 2 ? SCRUB : SCRUB_D);

      for (let i = 0; i < 5; i++) bank(0.400 + i * 0.016, -1, 58, 100, 26, 6.0 + i * 0.5, EARTH);
      runoffApron(K(0.424), -1, 28, 60, DRYGRASS);
      runoffApron(K(0.444), -1, 28, 60, DRYGRASS);
      for (let i = 0; i < 8; i++)
        bush(K(0.402 + i * 0.008), -1, 32 + hash(i * 17) * 15, SCRUB);
      for (let i = 0; i < 4; i++)
        runoffApron(K(0.404 + i * 0.018), -1, 106 + i * 26, 78, i % 2 ? FIELD_A : STUBBLE);

      spectatorHill(0.462, 0.534, -1, 40);
      runoffApron(K(0.480), -1, 78, 80, DUST);
      runoffApron(K(0.512), -1, 78, 80, DUST);
      runoffApron(K(0.496), -1, 102, 86, DIRTRD);
      for (let i = 0; i < 5; i++)
        runoffApron(K(0.466 + i * 0.018), -1, 140 + i * 28, 74, i % 2 ? FIELD_B : FIELD_A);
      for (let i = 0; i < 4; i++) bund(0.470 + i * 0.022, 160 + i * 30, 62);
      for (let i = 0; i < 5; i++) {
        const h = hash(i * 19);
        tree(K(0.470 + i * 0.016), -1, 155 + h * 20, 6 + h * 3.5, DRYFOL);
      }

      tyreWall(0.496, 0.536, 1, 13, TYRECAP);
      marshalPost(K(0.515), 1, 24);
      sponsorHoarding(0.498, 0.534, 1, 10);

      cameraTower(K(0.565), 1, 28);
      tree(K(0.572), 1, 36, 9, DRYFOL);
      tree(K(0.579), 1, 33, 8, DRYFOL);

      for (let i = 0; i < 5; i++) {
        if (!clear(K(0.652 + i * 0.038), 560, 90)) continue;
        bank(0.652 + i * 0.038, -1, 560, 170, 70, 9, MID_A);
      }
      for (let i = 0; i < 7; i++) {
        const h = hash(i * 11), d = 590 + h * 120, k = K(0.640 + i * 0.025);
        if (!clear(k, d, 46)) continue;
        place(k, -1, d, [22 + h * 30, 5 + h * 6, 16 + h * 20], i % 2 ? MID_A : MID_B);
      }
      for (let i = 0; i < 5; i++) bank(0.648 + i * 0.036, -1, 980, 560, 110, 22, HAZE_R);
      for (let i = 0; i < 4; i++) bank(0.660 + i * 0.048, -1, 1280, 600, 120, 15, HAZE_B);
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 29);
        place(K(0.648 + i * 0.021), -1, 830 + h * 250,
          [38 + h * 52, 8 + h * 13, 26 + h * 34], i % 2 ? HAZE_A : HAZE_B);
      }

      runoffApron(K(0.782), -1, 8, 84, PALE);
      runoffApron(K(0.798), -1, 8, 84, PALE);
      runoffApron(K(0.812), -1, 8, 84, PALE);
      tyreWall(0.766, 0.818, -1, 28, TYRECAP);
      grandstandEx(0.776, -1, 34, 92, null, null,
        { livery: "concrete", roof: "flat", endWalls: true });
      grandstandEx(0.806, -1, 34, 92, null, null,
        { livery: "concrete", roof: "flat", endWalls: true });
      runoffApron(K(0.780), -1, 66, 78, DUST);
      runoffApron(K(0.808), -1, 66, 78, DUST);
      runoffApron(K(0.794), -1, 104, 96, DIRTRD);
      for (let i = 0; i < 14; i++) {
        const h = hash(i * 41);
        place(K(0.766 + i * 0.0038), -1, 124 + (i % 3) * 12 + h * 4,
          [1.9, 1.5, 4.4], CARS[(i + 1) % 3]);
      }
      place(K(0.772), -1, 158, [20, 4.5, 28], [0.60, 0.56, 0.50]);
      place(K(0.816), -1, 164, [17, 4.0, 24], [0.58, 0.54, 0.48]);

      marshalPost(K(0.882), 1, 22);
      billboard(K(0.888), 1, 30, 14, 5.0, BOARD);
      place(K(sl(-0.060)), 1, 22, [13, 6.0, 38], [0.76, 0.74, 0.70]);
      place(K(sl(-0.060)), 1, 15.5, [0.5, 1.4, 34], FASCIA);

      every(36, (k) => {
        const h = hash(k * 37);
        if (h < 0.38) return;
        const dist = 32 + h * 58;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 14)) return;
        if (h > 0.86) tree(k, -1, dist, 6 + h * 3.5, DRYFOL);
        else bush(k, -1, dist, h > 0.62 ? SCRUB : SCRUB_D);
      });
      every(48, (k) => {
        const h = hash(k * 91);
        if (h < 0.55) return;
        const dist = 22 + h * 28;
        const a = anchor(k, 1, dist);
        if (onTrack(a.c[0], a.c[2], 12)) return;
        bush(k, 1, dist, h > 0.75 ? SCRUB : SCRUB_D);
      });
      for (const [s, d, len] of [
        [0.20, 48, 70], [0.34, 52, 64], [0.58, 44, 72], [0.68, 56, 80],
      ]) {
        if (!clear(K(s), d, 40)) continue;
        runoffApron(K(s), -1, d, [8, 0.28, len], DIRTRD);
      }
      for (let i = 0; i < 10; i++) {
        const h = hash(i * 101), d = 70 + h * 40;
        const k = K(0.38 + i * 0.028);
        if (!clear(k, d, 18)) continue;
        tree(k, -1, d, 6 + h * 3, DRYFOL);
      }

      {
        const a = anchor(K(0.62), -1, 380);
        if (!onTrack(a.c[0], a.c[2], 40) && clear(K(0.62), 380, 50)) {
          const b = [a.r, a.u, a.t];
          const foot = a.c.slice();
          const gy = terrainYAt(foot[0], foot[2]);
          if (gy != null) foot[1] = Math.max(foot[1], gy - 0.05);
          const STONE = [0.62, 0.34, 0.24], STONE_D = [0.50, 0.28, 0.20];
          const WHITE = [0.86, 0.82, 0.74];
          modelGroup("buddh-temple-hill", {
            center: vadd(foot, a.u, 14), size: [72, 36, 72], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            addFrustum(stage, foot, 36, 22, 4.5, EARTH, 8, b);
            addFrustum(stage, vadd(foot, a.u, 4.2), 22, 14, 3.2, EARTH, 8, b);
            addBox(stage, vadd(foot, a.u, 8.2), [14, 5.5, 14], STONE, b);
            addBox(stage, vadd(foot, a.u, 11.6), [11, 3.2, 11], STONE_D, b);
            stage._mat = MAT.METAL;
            addFrustum(stage, vadd(foot, a.u, 14.0), 7.5, 3.2, 8.5, STONE, 8, b);
            addCone(stage, vadd(foot, a.u, 22.4), 2.4, 5.5, WHITE, 8, b);
            addCyl(stage, vadd(foot, a.u, 27.6), 0.35, 2.8, [0.78, 0.62, 0.22], 5, b);
            for (const [dr, dt] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
              const p = vadd(vadd(foot, a.r, dr), a.t, dt);
              addFrustum(stage, vadd(p, a.u, 11.0), 2.8, 1.2, 3.6, STONE_D, 6, b);
              addCone(stage, vadd(p, a.u, 14.4), 1.1, 2.4, WHITE, 6, b);
            }
            stage._mat = MAT.CONCRETE;
            for (const [dr, dt, sx, sz] of [
              [0, -12, 18, 1.2], [0, 12, 18, 1.2], [-12, 0, 1.2, 18], [12, 0, 1.2, 18],
            ]) {
              addBox(stage, vadd(vadd(vadd(foot, a.r, dr), a.t, dt), a.u, 9.4),
                [sx, 2.2, sz], STONE_D, b);
            }
            stage._mat = 0;
          }, { required: true });
          for (let i = 0; i < 6; i++) {
            const h = hash(i * 113);
            bush(K(0.608 + i * 0.004), -1, 350 + h * 40, SCRUB);
          }
        }
      }

      kiln(0.215, 300, 26);
      kiln(0.335, 372, 23);
      kiln(0.560, 340, 25);
      kiln(0.700, 430, 27);
      for (let i = 0; i < 9; i++) pylon(0.245 + i * 0.047, 256 + i * 26, 25 + hash(i * 53) * 5);
      for (let i = 0; i < 6; i++) pylon(0.700 + i * 0.043, 300 - i * 14, 24 + hash(i * 59) * 5);
      for (let i = 0; i < 14; i++) {
        const h = hash(i * 43);
        runoffApron(K(0.24 + i * 0.043), -1, 270 + h * 230, 96,
          h < 0.18 ? CROP : (i % 2 ? FIELD_B : STUBBLE));
      }
      for (let i = 0; i < 12; i++) bund(0.252 + i * 0.051, 296 + hash(i * 61) * 210, 62);
      for (let i = 0; i < 13; i++) {
        const h = hash(i * 47), d = 452 + (i % 4) * 30 + h * 22;
        const k = K(0.598 + i * 0.0075);
        if (!clear(k, d, 22)) continue;
        place(k, -1, d, [6 + h * 5, 2.8 + h * 1.6, 7 + h * 6],
          h > 0.66 ? LIME : (i % 2 ? MUD : MUD_D));
      }
      runoffApron(K(0.634), -1, 500, 120, DUST);
      kiln(0.120, 356, 24);
      kiln(0.445, 318, 22);
      for (let i = 0; i < 3; i++) pylon(0.640 + i * 0.020, 262 + i * 20, 25 + hash(i * 71) * 4);
      for (let i = 0; i < 9; i++) {
        const h = hash(i * 73), d = 250 + h * 260, k = K(0.205 + i * 0.062);
        if (!clear(k, d, 52)) continue;
        runoffApron(k, -1, d, 82, h > 0.55 ? BURNT : STUBBLE);
      }
      for (let i = 0; i < 8; i++) {
        const h = hash(i * 79), d = 214 + i * 26 + h * 20, k = K(0.305 + i * 0.030);
        if (!clear(k, d, 52)) continue;
        runoffApron(k, -1, d, 88, h < 0.2 ? CROP : (i % 2 ? FIELD_A : FIELD_B));
      }
      for (let i = 0; i < 7; i++) bund(0.318 + i * 0.033, 232 + i * 28, 58);
      for (let i = 0; i < 11; i++) {
        const h = hash(i * 83), d = 236 + (i % 3) * 58 + h * 26;
        const k = K(0.262 + i * 0.058);
        if (!clear(k, d, 20)) continue;
        tree(k, -1, d, 6.5 + h * 4, DRYFOL);
      }
      for (let i = 0; i < 4; i++) {
        const h = hash(i * 67), d = 452 + h * 26, k = K(0.606 + i * 0.016 + (i === 3 ? 0.005 : 0));
        if (!clear(k, d, 18)) continue;
        tree(k, -1, d, 7 + h * 3, DRYFOL);
      }
  };
