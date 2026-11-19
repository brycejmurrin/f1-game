"use strict";
(window.TrackScenery = window.TrackScenery || {})["zolder"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        pine, tree, bush, forestEdge,
        building, grandstandEx, spectatorHill,
        guardrail, fence, tyreWall, marshalPost, cameraTower,
        broadcastCompound, billboard, sponsorHoarding,
        motorhome, groundPatch, ridge, mountain,
        modelGroup, vadd, addBox, addCyl,
        MAT, indexSolid } = api;

      const { K } = api;

      const PINE_A = [0.07, 0.17, 0.11];
      const PINE_B = [0.10, 0.22, 0.13];
      const PINE_C = [0.13, 0.26, 0.16];
      const PINES = [PINE_A, PINE_B, PINE_C];
      const PINE_FAR = [0.12, 0.21, 0.15];
      const PINE_FAR2 = [0.15, 0.24, 0.18];
      const BIRCH = [0.24, 0.36, 0.20];
      const SCRUB = [0.30, 0.31, 0.19];
      const SAND = [0.82, 0.76, 0.61];
      const SAND_PALE = [0.88, 0.83, 0.70];
      const SAND_DUSK = [0.72, 0.66, 0.52];
      const WHITE = [0.87, 0.88, 0.87];
      const GREY = [0.62, 0.64, 0.65];
      const CONCRETE = [0.72, 0.72, 0.70];
      const RAIL = [0.79, 0.80, 0.82];
      const TYRE_CAP = [0.90, 0.86, 0.28];
      const TYRE_CAP2 = [0.88, 0.88, 0.89];

      const pineCol = (h) => PINES[(h * 3) | 0] || PINE_B;
      const farCol = (h) => (h > 0.5 ? PINE_FAR2 : PINE_FAR);

      const seatMotorhome = (k, side, gap, w, h, d, opts) => {
        const a = anchor(k, side, gap + w / 2);
        if (!a || onTrack(a.c[0], a.c[2], 6)) return;
        const gy = terrainYAt(a.c[0], a.c[2]);
        if (gy != null && Math.abs(a.c[1] - gy) > 0.28) return;
        motorhome(k, side, gap, w, h, d, opts);
      };

      const clubBuilding = (kk, side, gap, w, h, d, wall) => {
        const dist = gap + w / 2;
        const p = anchor(kk, side, dist);
        if (!p || onTrack(p.c[0], p.c[2], 6)) return;
        const gy = terrainYAt(p.c[0], p.c[2]);
        const lift = gy != null ? Math.max(0.04, gy - p.c[1] + 0.06) : 0.06;
        const b = [p.r, p.u, p.t];
        modelGroup(`zolder-pit-office-${kk}-${gap}`, {
          center: vadd(p.c, p.u, lift + h / 2),
          size: [w + 1, h + 1.2, d + 1],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(p.c, p.u, lift + h / 2), [w, h, d], wall, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(p.c, p.u, lift + h + 0.22), [w + 0.4, 0.35, d + 0.4], GREY, b);
          stage._mat = 0;
        });
      };

      function emitOpenStand(stage, a, side, opts) {
        const depth = opts.depth || 12;
        const h = opts.h || 12;
        const len = opts.len || 80;
        const tiers = opts.tiers || 5;
        const shell = opts.shell || CONCRETE;
        const b = [a.r, a.u, a.t];
        const gy = terrainYAt(a.c[0], a.c[2]);
        const dy = gy != null ? (gy - a.c[1] + 0.21) : 0.21;
        stage._mat = MAT.CONCRETE;
        addBox(stage, vadd(vadd(a.c, a.r, side * (depth * 0.48)), a.u, dy + h * 0.40),
          [depth * 0.28, h * 0.80, len], shell, b);
        const SEAT = [[0.78, 0.16, 0.14], [0.88, 0.88, 0.86], [0.22, 0.24, 0.28]];
        for (let t = 0; t < tiers; t++) {
          const lat = -side * (depth * 0.34 - t * 1.55);
          const yh = 1.65 + t * 2.35;
          const yOff = t * 0.14;
          addBox(stage, vadd(vadd(a.c, a.r, lat), a.u, dy + yh * 0.5 - 0.12 + yOff),
            [1.45, yh + 0.2, len - t * 2.4],
            t & 1 ? GREY : shell, b);
          stage._mat = MAT.FABRIC;
          addBox(stage, vadd(vadd(a.c, a.r, lat + side * 0.18), a.u, dy + yh + 0.55 + yOff),
            [1.05, 0.65, len - t * 2.4 - 2.5], SEAT[t % 3], b);
          stage._mat = MAT.CONCRETE;
        }
        stage._mat = MAT.METAL;
        const top = dy + h * 0.82 + 0.35;
        addBox(stage, vadd(vadd(a.c, a.r, -side * 0.4), a.u, top),
          [depth + 1.2, 0.55, len * 0.92], [0.42, 0.44, 0.46], b);
        addBox(stage, vadd(vadd(a.c, a.r, -side * depth * 0.42), a.u, top - 1.1),
          [0.35, 2.0, len * 0.88], [0.50, 0.52, 0.54], b);
        stage._mat = 0;
      }

      const STEP = 4.03;
      const clear = (k, side, gap, w, d, pad) => {
        const dk = Math.max(1, Math.round(d * 0.5 / STEP));
        for (const ks of [k - dk, k, k + dk]) {
          const kk = ((Math.round(ks) % n) + n) % n;
          for (const off of [-w * 0.5, 0, w * 0.5]) {
            const g = gap + off;
            if (g < 5) return false;
            const a = anchor(kk, side, g);
            if (!a || onTrack(a.c[0], a.c[2], pad)) return false;
          }
        }
        return true;
      };
      const OWNED = [
        [0.900, 0.075],
        [0.160, 0.225],
        [0.250, 0.285],
        [0.325, 0.372],
        [0.395, 0.458],
        [0.472, 0.540],
        [0.542, 0.598],
        [0.686, 0.748],
        [0.838, 0.910],
      ];
      const owned = (f) => OWNED.some(([a, b]) =>
        a <= b ? (f >= a && f <= b) : (f >= a || f <= b));

      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (f) => (f + SL) % 1;
      if (typeof indexSolid === "function") {
        indexSolid(sl(0.955), sl(0.065), 1, 10, 28);
        indexSolid(sl(0.995), sl(0.050), 1, 24, 20);
        indexSolid(sl(0.010), sl(0.040), 1, 78, 28);
        indexSolid(sl(0.985), sl(0.040), -1, 14, 24);
        indexSolid(sl(0.008), sl(0.030), -1, 48, 22);
        indexSolid(0.172, 0.190, 1, 60, 22);
        indexSolid(0.482, 0.520, 1, 48, 22);
        indexSolid(0.900, 0.948, 1, 16, 20);
        indexSolid(0.696, 0.734, -1, 12, 10);
        indexSolid(0.696, 0.734, 1, 18, 12);
      }

      every(26, (k) => {
        const h = hash(k * 17 + 3);
        const f = k / n;
        if (owned(f)) return;
        for (const side of [-1, 1]) {
          const g = 12.0 + h * 7;
          const w = 11 + h * 11;
          const d = 22 + h * 20;
          if (!clear(k, side, g, w, d, 8)) continue;
          groundPatch(k, side, g, [w, 0.14, d], h < 0.5 ? SAND_PALE : SAND);
          const g2 = g + w * 0.5 + 9 + h * 5;
          const w2 = 13 + h * 9;
          if (h > 0.34 && clear(k, side, g2, w2, d * 0.8, 9)) {
            groundPatch(k, side, g2, [w2, 0.13, d * 0.8], SAND_DUSK);
          }
        }
      });

      every(13, (k) => {
        const h = hash(k * 29 + 7);
        const h2 = hash(k * 53 + 11);
        const f = k / n;
        if (owned(f)) return;
        for (const side of [-1, 1]) {
          const ranks = side < 0 ? 4 : 3;
          for (let r = 0; r < ranks; r++) {
            const jitter = hash(k * 7 + r * 131 + (side < 0 ? 0 : 401));
            if (jitter < 0.12) continue;
            const dist = (side < 0 ? 24 : 30) + r * 10 + jitter * 8;
            const a = anchor(k, side, dist);
            if (!a || onTrack(a.c[0], a.c[2], 8)) continue;
            pine(k, side, dist, 13 + r * 0.9 + jitter * 9, pineCol(jitter));
          }
        }
        if (h > 0.72) {
          const d = 17 + h * 6;
          const b = anchor(k, -1, d);
          if (b && !onTrack(b.c[0], b.c[2], 7)) bush(k, -1, d, SCRUB);
        }
        if (h2 > 0.86) {
          const a = anchor(k, -1, 21);
          if (a && !onTrack(a.c[0], a.c[2], 8)) tree(k, -1, 21, 8 + h2 * 4, BIRCH);
        }
      });

      every(36, (k) => {
        const h = hash(k * 97 + 5);
        if (h < 0.70) return;
        const f = k / n;
        if (owned(f)) return;
        if ((f > 0.52 && f < 0.62) || (f > 0.74 && f < 0.84)) return;
        for (const side of [-1, 1]) {
          const d = 22 + h * 10;
          const a = anchor(k, side, d);
          if (!a || onTrack(a.c[0], a.c[2], 9)) continue;
          bush(k, side, d, h > 0.88 ? PINE_C : SCRUB);
        }
      });

      forestEdge(0.300, 0.420, -1, 24, { spacing: 11 });
      forestEdge(0.440, 0.540, -1, 32, { spacing: 13 });
      forestEdge(0.600, 0.700, -1, 24, { spacing: 11 });
      forestEdge(0.730, 0.850, -1, 26, { spacing: 11 });
      forestEdge(0.905, 0.950, -1, 30, { spacing: 13 });
      forestEdge(0.206, 0.330, 1, 28, { spacing: 13 });
      forestEdge(0.580, 0.690, 1, 28, { spacing: 13 });
      forestEdge(0.760, 0.850, 1, 30, { spacing: 13 });

      forestEdge(0.302, 0.418, -1, 56, { spacing: 18 });
      forestEdge(0.442, 0.538, -1, 64, { spacing: 18 });
      forestEdge(0.602, 0.698, -1, 56, { spacing: 18 });
      forestEdge(0.732, 0.848, -1, 58, { spacing: 18 });
      forestEdge(0.906, 0.948, -1, 62, { spacing: 18 });
      forestEdge(0.208, 0.328, 1, 60, { spacing: 18 });
      forestEdge(0.582, 0.688, 1, 60, { spacing: 18 });
      forestEdge(0.762, 0.848, 1, 62, { spacing: 18 });

      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 10.5, RAIL);

      fence(0.08, 0.30, -1, 15, 3.2, [0.58, 0.60, 0.60]);
      fence(0.40, 0.62, -1, 15, 3.2, [0.58, 0.60, 0.60]);

      for (const s of [0.075, 0.145, 0.235, 0.300, 0.395, 0.470, 0.640, 0.820]) {
        marshalPost(K(s), s < 0.5 ? -1 : 1, 13);
      }

      every(8, (k) => {
        const f = k / n;
        if (owned(f)) return;
        const side = -1;
        const deep = 7;
        for (let r = 0; r < deep; r++) {
          const j = hash(k * 13 + r * 197);
          if (j < 0.20) continue;
          const dist = 96 + r * 17 + j * 12;
          const a = anchor(k, side, dist);
          if (!a || onTrack(a.c[0], a.c[2], 11)) continue;
          pine(k, side, dist, 16 + r * 0.7 + j * 9,
            r < 2 ? pineCol(j) : farCol(j));
        }
      });
      every(13, (k) => {
        const f = k / n;
        if (owned(f)) return;
        const side = -1;
        for (let r = 0; r < 4; r++) {
          const j = hash(k * 19 + r * 311 + 57);
          if (j < 0.42) continue;
          const dist = 228 + r * 26 + j * 18;
          const a = anchor(k, side, dist);
          if (!a || onTrack(a.c[0], a.c[2], 12)) continue;
          pine(k, side, dist, 19 + j * 10, farCol(j));
        }
      });

      for (const [f, side] of [[0.128, -1], [0.292, -1], [0.372, 1], [0.512, -1],
                               [0.652, -1], [0.668, 1], [0.808, -1], [0.958, -1]]) {
        const k = K(f);
        const gap = 78;
        if (!clear(k, side, gap, 96, 8, 12)) continue;
        groundPatch(k, side, gap, [96, 0.13, 8], SAND_DUSK);
        for (const off of [-30, 30]) {
          const b = anchor(k, side, gap + off);
          if (b && !onTrack(b.c[0], b.c[2], 10)) bush(k, side, gap + off, SCRUB);
        }
      }

      every(16, (k) => {
        const h = hash(k * 191 + 27);
        const f = k / n;
        if (owned(f) || h < 0.62) return;
        for (const side of [-1, 1]) {
          const d = 34 + h * 18;
          const a = anchor(k, side, d);
          if (!a || onTrack(a.c[0], a.c[2], 10)) continue;
          bush(k, side, d, h > 0.88 ? PINE_C : SCRUB);
        }
      });
      for (const [f, side] of [[0.088, -1], [0.152, 1], [0.238, -1], [0.318, 1],
                               [0.468, -1], [0.618, -1], [0.632, 1], [0.772, -1],
                               [0.796, 1], [0.884, -1]]) {
        const k = K(f);
        if (!clear(k, side, 62, 34, 40, 11)) continue;
        groundPatch(k, side, 62, [34, 0.13, 40], SAND_DUSK);
        for (let i = 0; i < 3; i++) {
          const j = hash(k * 7 + i * 59);
          const d = 50 + i * 12 + j * 6;
          const b = anchor(k, side, d);
          if (b && !onTrack(b.c[0], b.c[2], 10)) bush(k, side, d, SCRUB);
        }
        const t = anchor(k, side, 78);
        if (t && !onTrack(t.c[0], t.c[2], 10)) tree(k, side, 78, 9 + hash(k * 3) * 5, BIRCH);
      }


      for (let i = 0; i < 10; i++) {
        const s = sl(0.960 + i * 0.0085);
        const h = hash(i * 41 + 9);
        const kk = K(s);
        const a = anchor(kk, 1, 14 + 4);
        if (!a || onTrack(a.c[0], a.c[2], 6)) continue;
        const gy = terrainYAt(a.c[0], a.c[2]);
        if (gy != null && Math.abs(a.c[1] - gy) > 0.35) continue;
        building(kk, 1, 14, 8, 4.4 + (h > 0.7 ? 1.2 : 0), 8.5,
          { wall: h < 0.55 ? WHITE : GREY });
      }
      clubBuilding(K(sl(0.008)), 1, 32, 12, 7.5, 10, WHITE);
      clubBuilding(K(sl(0.038)), 1, 34, 11, 6.0, 10, GREY);
      if (typeof indexSolid === "function") {
        indexSolid(sl(0.995), sl(0.020), 1, 24, 16);
        indexSolid(sl(0.028), sl(0.050), 1, 26, 16);
      }
      sponsorHoarding(sl(0.955), sl(0.060), 1, 11.5);
      marshalPost(K(sl(0.058)), 1, 13);
      marshalPost(K(sl(0.985)), 1, 13);
      groundPatch(K(sl(0.005)), 1, 4.0, [17, 0.15, 34], CONCRETE);
      groundPatch(K(sl(0.010)), 1, 44, [34, 0.14, 108], CONCRETE);
      for (let i = 0; i < 6; i++) {
        const j = hash(i * 151 + 71);
        seatMotorhome(K(sl(0.968 + i * 0.0092)), 1, 48 + j * 6, 10, 6.2 + j * 1.3, 13,
          { wall: j < 0.5 ? [0.88, 0.88, 0.87] : [0.83, 0.84, 0.85] });
      }
      building(K(sl(0.024)), 1, 90, 14, 5.4, 18, { wall: GREY });
      if (typeof indexSolid === "function")
        indexSolid(sl(0.010), sl(0.040), 1, 78, 28);
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 157 + 13);
        pine(K(sl(0.952 + i * 0.0086)), 1, 100 + j * 14, 15 + j * 9, pineCol(j));
      }

      {
        const depth = 12, h = 12, len = 72;
        const a0 = anchor(K(sl(0.012)), -1, 20 + depth / 2);
        if (a0 && !onTrack(a0.c[0], a0.c[2], 10)) {
          modelGroup("zolder-main-grandstand", {
            center: vadd(a0.c, a0.u, (h + 1) / 2),
            size: [depth + 2, h + 2, len + 2],
            basis: [a0.r, a0.u, a0.t],
          }, (stage) => {
            emitOpenStand(stage, a0, -1, { depth, h, len, tiers: 5, shell: CONCRETE });
            if (typeof indexSolid === "function")
              indexSolid(sl(0.985), sl(0.040), -1, 14, 22);
          }, { required: true });
        }
      }
      cameraTower(K(sl(0.0)), -1, 22);
      for (let i = 0; i < 4; i++) {
        billboard(K(sl(0.965 + i * 0.014)), -1, 40, 10, 3.8,
          i % 2 ? [0.82, 0.24, 0.20] : [0.16, 0.28, 0.55]);
      }
      for (let i = 0; i < 14; i++) {
        const s = sl(0.950 + i * 0.0075);
        const j = hash(i * 61 + 13);
        pine(K(s), -1, 78 + j * 12, 17 + j * 7, pineCol(j));
      }

      {
        const a = anchor(K(sl(0.018)), -1, 58);
        if (a && !onTrack(a.c[0], a.c[2], 12)) {
          const b = [a.r, a.u, a.t];
          const gy = terrainYAt(a.c[0], a.c[2]);
          const dy = gy != null ? (gy - a.c[1]) : 0;
          modelGroup("zolder-sf-museum", {
            center: vadd(a.c, a.u, dy + 3.2),
            size: [16, 8, 22], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, dy + 2.4), [14, 4.8, 16], WHITE, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(vadd(a.c, a.r, 7.1), a.u, dy + 2.6),
              [0.12, 3.2, 12], [0.35, 0.42, 0.50], b);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(a.c, a.u, dy + 5.6), [15.2, 0.4, 17.2], GREY, b);
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(vadd(a.c, a.t, -11), a.u, dy + 1.5),
              [4.5, 3.0, 3.0], CONCRETE, b);
            stage._mat = 0;
          }, { required: true });
          if (typeof indexSolid === "function")
            indexSolid(sl(0.008), sl(0.030), -1, 48, 20);
        }
      }

      {
        const a = anchor(K(sl(0.028)), 1, 54);
        if (a && !onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          const gy = terrainYAt(a.c[0], a.c[2]);
          const dy = gy != null ? Math.max(0, gy - a.c[1]) + 0.10 : 0.10;
          const POLE = [0.92, 0.92, 0.90];
          const CAPS = [
            [0.78, 0.12, 0.14],
            [0.82, 0.10, 0.12],
            [0.88, 0.78, 0.12],
            [0.20, 0.22, 0.26],
            [0.55, 0.12, 0.14],
          ];
          modelGroup("zolder-villeneuve-poles", {
            center: vadd(a.c, a.u, dy + 4.8),
            size: [10, 11, 16], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, dy + 0.15), [8.5, 0.3, 14], CONCRETE, b);
            for (let i = 0; i < 5; i++) {
              const p = vadd(vadd(a.c, a.t, (i - 2) * 2.6), a.u, dy + 0.15);
              stage._mat = MAT.CONCRETE;
              addCyl(stage, p, 0.22, 7.2, POLE, 6, b);
              stage._mat = MAT.METAL;
              addCyl(stage, vadd(p, a.u, 7.2), 0.55, 0.9, CAPS[i], 6, b);
              if (i === 1) {
                addBox(stage, vadd(vadd(p, a.r, 0.55), a.u, 6.4),
                  [0.08, 0.7, 1.4], CAPS[i], b);
              }
            }
            stage._mat = 0;
          }, { required: true });
        }
      }


      groundPatch(K(0.0352), -1, 6.0, [24, 0.16, 46], SAND_PALE);
      groundPatch(K(0.0300), -1, 4.0, [18, 0.15, 38], SAND_PALE);
      groundPatch(K(0.0410), -1, 4.0, [18, 0.15, 38], SAND);
      groundPatch(K(0.0352), -1, 17.0, [12, 0.15, 44], SAND_DUSK);
      guardrail(0.026, 0.050, -1, 22, RAIL);
      tyreWall(0.028, 0.048, -1, 21.4, TYRE_CAP);
      guardrail(0.024, 0.052, -1, 26, RAIL);
      spectatorHill(0.026, 0.052, -1, 27);
      fence(0.022, 0.056, -1, 24, 3.6, [0.58, 0.60, 0.60]);
      marshalPost(K(0.0276), -1, 24);
      marshalPost(K(0.0470), -1, 24);
      for (let i = 0; i < 9; i++) {
        const s = 0.024 + i * 0.0034;
        const j = hash(i * 23 + 31);
        tree(K(s), -1, 46 + j * 9, 8 + j * 5, j > 0.6 ? BIRCH : PINE_C);
      }
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 127 + 91);
        pine(K(0.020 + i * 0.0024), -1, 64 + j * 18, 16 + j * 9, pineCol(j));
      }

      groundPatch(K(0.042), 1, 4.0, [14, 0.15, 28], SAND);
      if (clear(K(0.036), 1, 9.0, 12, 24, 7)) {
        groundPatch(K(0.036), 1, 9.0, [12, 0.15, 24], SAND_PALE);
      }
      groundPatch(K(0.044), 1, 15.0, [10, 0.14, 30], SAND_DUSK);
      marshalPost(K(0.044), 1, 15);
      guardrail(0.036, 0.052, 1, 16, RAIL);
      fence(0.034, 0.056, 1, 19, 3.2, [0.58, 0.60, 0.60]);
      for (let i = 0; i < 10; i++) {
        const j = hash(i * 71 + 17);
        pine(K(0.048 + i * 0.0028), 1, 72 + j * 8, 14 + j * 6, pineCol(j));
      }
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 137 + 59);
        const kk = K(0.045 + i * 0.0030), d = 88 + j * 18;
        const a = anchor(kk, 1, d);
        if (!a || onTrack(a.c[0], a.c[2], 9)) continue;
        pine(kk, 1, d, 15 + j * 9, pineCol(j));
      }

      forestEdge(0.062, 0.176, -1, 26, { spacing: 11 });
      forestEdge(0.066, 0.172, -1, 54, { spacing: 18 });
      for (let i = 0; i < 34; i++) {
        const s = 0.064 + i * 0.0033;
        const j = hash(i * 37 + 3);
        pine(K(s), -1, 19 + j * 5, 16 + j * 8, pineCol(j));
        if (j > 0.45) pine(K(s), -1, 33 + j * 9, 18 + j * 7, pineCol(1 - j));
        if (j > 0.80) bush(K(s), -1, 15, SCRUB);
        if (j > 0.30) pine(K(s), -1, 62 + j * 18, 18 + j * 8, farCol(j));
      }
      if (clear(K(0.121), -1, 72, 26, 26, 11)) {
        groundPatch(K(0.121), -1, 72, [26, 0.14, 26], SAND_DUSK);
        building(K(0.121), -1, 72, 7, 3.4, 6, { wall: [0.55, 0.50, 0.42] });
      }

      guardrail(0.170, 0.192, 1, 12, RAIL);
      marshalPost(K(0.1802), 1, 16);
      groundPatch(K(0.1802), 1, 19.0, [12, 0.15, 30], SAND_PALE);
      {
        const a = anchor(K(0.1802), 1, 72);
        if (a && !onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          const gy = terrainYAt(a.c[0], a.c[2]);
          const dy = gy != null ? (gy - a.c[1]) : 0;
          modelGroup("zolder-sterrenwacht", {
            center: vadd(a.c, a.u, dy + 4.0),
            size: [12, 10, 12], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, dy + 2.6), [9.0, 5.2, 9.0], WHITE, b);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(a.c, a.u, dy + 5.35), [9.6, 0.5, 9.6], GREY, b);
            addCyl(stage, vadd(a.c, a.u, dy + 5.5), 2.6, 2.2, GREY, 8, b);
            stage._mat = MAT.GLASS;
            addCyl(stage, vadd(a.c, a.u, dy + 6.9), 2.4, 1.0, [0.30, 0.38, 0.48], 8, b);
            stage._mat = MAT.METAL;
            addCyl(stage, vadd(a.c, a.u, dy + 7.95), 0.14, 1.6, [0.55, 0.56, 0.58], 5, b);
            stage._mat = 0;
          }, { required: true });
          if (typeof indexSolid === "function")
            indexSolid(0.172, 0.190, 1, 60, 22);
        }
      }
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 83 + 29);
        pine(K(0.166 + i * 0.0036), 1, 92 + j * 12, 15 + j * 8, pineCol(j));
      }

      {
        const a = anchor(K(0.1938), -1, 62);
        if (a) {
          const y = terrainYAt ? terrainYAt(a.c[0], a.c[2]) : a.c[1];
          ridge(a.c[0], a.c[2], y, Math.atan2(a.t[2], a.t[0]), 74, 18, 5.0, SAND_DUSK);
        }
      }
      guardrail(0.184, 0.206, -1, 20, RAIL);
      tyreWall(0.188, 0.202, -1, 19.4, TYRE_CAP2);
      groundPatch(K(0.1938), -1, 4.0, [16, 0.15, 32], SAND_PALE);
      groundPatch(K(0.1938), -1, 15.0, [12, 0.14, 34], SAND);
      forestEdge(0.180, 0.214, -1, 40, { spacing: 13 });
      for (let i = 0; i < 8; i++) {
        const j = hash(i * 167 + 23);
        bush(K(0.182 + i * 0.0042), -1, 44 + j * 14, j > 0.6 ? PINE_C : SCRUB);
      }

      groundPatch(K(0.265), -1, 30, [22, 0.16, 46], SAND_DUSK);
      for (let i = 0; i < 7; i++) {
        const j = hash(i * 59 + 43);
        seatMotorhome(K(0.244 + i * 0.0072), -1, 36 + j * 12, 10, 6.5 + j * 1.5, 13,
          { wall: [0.88, 0.88, 0.87] });
      }
      for (let i = 0; i < 18; i++) {
        const j = hash(i * 101 + 19);
        pine(K(0.236 + i * 0.0032), -1, 48 + j * 22, 15 + j * 9, pineCol(j));
      }
      forestEdge(0.222, 0.300, -1, 22, { spacing: 14 });
      if (clear(K(0.258), -1, 62, 46, 10, 11)) {
        groundPatch(K(0.258), -1, 62, [46, 0.13, 10], SAND_DUSK);
      }
      for (let i = 0; i < 5; i++) {
        const j = hash(i * 173 + 31);
        seatMotorhome(K(0.250 + i * 0.0080), -1, 74 + j * 8, 9, 5.8 + j * 1.2, 12,
          { wall: j < 0.5 ? [0.80, 0.81, 0.82] : [0.86, 0.86, 0.84] });
      }

      guardrail(0.334, 0.362, 1, 18, RAIL);
      tyreWall(0.338, 0.358, 1, 17.4, TYRE_CAP);
      marshalPost(K(0.356), 1, 20);
      billboard(K(0.330), 1, 24, 12, 4.5, [0.84, 0.78, 0.18]);
      billboard(K(0.338), 1, 24, 12, 4.5, [0.14, 0.30, 0.58]);
      groundPatch(K(0.347), 1, 4.0, [15, 0.15, 30], SAND);
      groundPatch(K(0.352), 1, 18.0, [11, 0.14, 28], SAND_DUSK);
      fence(0.330, 0.366, 1, 22, 3.2, [0.58, 0.60, 0.60]);

      groundPatch(K(0.4333), -1, 4.0, [22, 0.16, 46], SAND_PALE);
      groundPatch(K(0.4270), -1, 4.0, [16, 0.15, 30], SAND_PALE);
      groundPatch(K(0.4400), -1, 4.0, [16, 0.15, 30], SAND);
      groundPatch(K(0.4333), -1, 15.0, [10, 0.14, 44], SAND_DUSK);
      guardrail(0.424, 0.446, -1, 18, RAIL);
      guardrail(0.420, 0.450, -1, 22, RAIL);
      tyreWall(0.426, 0.444, -1, 17.4, TYRE_CAP);
      grandstandEx(0.4333, -1, 26, 62, null, null);
      fence(0.404, 0.424, -1, 22, 3.4, [0.58, 0.60, 0.60]);
      marshalPost(K(0.4270), -1, 21);
      for (let i = 0; i < 10; i++) {
        const j = hash(i * 67 + 5);
        pine(K(0.404 + i * 0.0052), -1, 44 + j * 12, 16 + j * 7, pineCol(j));
      }
      for (let i = 0; i < 16; i++) {
        const j = hash(i * 139 + 83);
        pine(K(0.400 + i * 0.0036), -1, 58 + j * 26, 17 + j * 9, pineCol(j));
      }
      groundPatch(K(0.4368), -1, 30, [8, 0.16, 10], CONCRETE);
      building(K(0.4368), -1, 31, 3.0, 2.2, 3.0, { wall: [0.80, 0.79, 0.76] });

      groundPatch(K(0.505), 1, 34, [24, 0.15, 46], SAND_PALE);
      broadcastCompound(K(0.505), 1, 38);
      motorhome(K(0.492), 1, 40, 11, 7.0, 15, { wall: [0.90, 0.90, 0.89] });
      motorhome(K(0.518), 1, 41, 11, 7.0, 15, { wall: [0.84, 0.85, 0.86] });
      building(K(0.505), 1, 56, 18, 5.0, 12, { wall: GREY });
      building(K(0.488), 1, 57, 12, 4.2, 9, { wall: WHITE });
      if (typeof indexSolid === "function")
        indexSolid(0.482, 0.520, 1, 48, 22);
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 79 + 23);
        pine(K(0.480 + i * 0.0040), 1, 78 + j * 14, 15 + j * 8, pineCol(j));
      }
      if (clear(K(0.505), 1, 74, 30, 12, 11)) {
        groundPatch(K(0.505), 1, 74, [30, 0.13, 12], SAND_DUSK);
      }

      guardrail(0.556, 0.580, -1, 14, RAIL);
      guardrail(0.554, 0.582, 1, 13, RAIL);
      marshalPost(K(0.5667), -1, 16);
      marshalPost(K(0.5600), 1, 15);
      groundPatch(K(0.5667), -1, 4.0, [13, 0.15, 26], SAND_PALE);
      groundPatch(K(0.5580), -1, 4.0, [11, 0.15, 22], SAND);
      groundPatch(K(0.5760), -1, 4.0, [11, 0.15, 22], SAND);
      groundPatch(K(0.5700), -1, 14.0, [9, 0.14, 22], SAND_DUSK);
      fence(0.552, 0.584, -1, 17, 3.2, [0.58, 0.60, 0.60]);
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 89 + 37);
        pine(K(0.548 + i * 0.0032), -1, 22 + j * 7, 16 + j * 8, pineCol(j));
        if (j > 0.55) pine(K(0.548 + i * 0.0032), -1, 36 + j * 8, 17 + j * 6, pineCol(1 - j));
      }
      forestEdge(0.540, 0.600, -1, 22, { spacing: 14 });
      for (let i = 0; i < 10; i++) {
        const j = hash(i * 149 + 67);
        pine(K(0.550 + i * 0.0032), 1, 20 + j * 10, 15 + j * 8, pineCol(j));
      }

      grandstandEx(0.7153, 1, 30, 48, null, null);
      guardrail(0.700, 0.734, 1, 22, RAIL);
      tyreWall(0.708, 0.722, 1, 21.2, TYRE_CAP);
      marshalPost(K(0.730), 1, 24);
      marshalPost(K(0.700), -1, 16);
      billboard(K(0.694), 1, 24, 12, 4.5, [0.80, 0.26, 0.18]);
      groundPatch(K(0.7153), -1, 12.0, [17, 0.15, 34], SAND_PALE);
      groundPatch(K(0.7080), -1, 12.0, [13, 0.14, 26], SAND);
      guardrail(0.698, 0.736, -1, 16, RAIL);
      for (let i = 0; i < 12; i++) {
        const j = hash(i * 43 + 47);
        pine(K(0.690 + i * 0.0042), -1, 34 + j * 14, 16 + j * 8, pineCol(j));
      }
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 181 + 29);
        pine(K(0.686 + i * 0.0040), -1, 46 + j * 24, 17 + j * 9, farCol(j));
      }

      grandstandEx(0.8628, 1, 20, 70, null, null);
      guardrail(0.852, 0.874, 1, 16, RAIL);
      sponsorHoarding(0.850, 0.876, 1, 13.5);
      marshalPost(K(0.8628), 1, 18);
      fence(0.848, 0.878, 1, 30, 3.4, [0.58, 0.60, 0.60]);
      if (clear(K(0.8628), 1, 44, 24, 40, 10)) {
        groundPatch(K(0.8628), 1, 44, [24, 0.14, 40], SAND_DUSK);
      }

      guardrail(0.870, 0.892, -1, 20, RAIL);
      tyreWall(0.872, 0.890, -1, 19.4, TYRE_CAP2);
      cameraTower(K(0.8792), -1, 24);
      for (let i = 0; i < 4; i++) {
        billboard(K(0.868 + i * 0.0075), -1, 30, 11, 4.2,
          i % 2 ? [0.15, 0.32, 0.56] : [0.86, 0.84, 0.22]);
      }
      groundPatch(K(0.8792), -1, 14.0, [10, 0.14, 34], SAND_PALE);
      forestEdge(0.850, 0.910, -1, 38, { spacing: 13 });
      for (let i = 0; i < 14; i++) {
        const j = hash(i * 73 + 53);
        pine(K(0.848 + i * 0.0044), -1, 48 + j * 14, 16 + j * 8, pineCol(j));
      }
      for (let i = 0; i < 16; i++) {
        const j = hash(i * 191 + 11);
        pine(K(0.846 + i * 0.0042), -1, 66 + j * 26, 17 + j * 9, farCol(j));
      }

      guardrail(0.912, 0.940, 1, 14, RAIL);
      marshalPost(K(0.938), 1, 16);
      sponsorHoarding(0.930, 0.958, 1, 12);
      for (let i = 0; i < 5; i++) {
        const j = hash(i * 107 + 61);
        building(K(0.906 + i * 0.0086), 1, 22 + j * 6, 12, 5.2, 11,
          { wall: j < 0.5 ? GREY : WHITE });
      }
      if (typeof indexSolid === "function")
        indexSolid(0.900, 0.948, 1, 16, 20);
      for (let i = 0; i < 6; i++) {
        const j = hash(i * 113 + 7);
        seatMotorhome(K(0.908 + i * 0.0072), 1, 48, 10, 6.4 + j * 1.4, 14,
          { wall: j < 0.5 ? [0.89, 0.89, 0.88] : [0.80, 0.81, 0.83] });
      }
      groundPatch(K(0.9237), 1, 30, [30, 0.14, 70], CONCRETE);
      tyreWall(0.914, 0.922, 1, 13.4, TYRE_CAP);

      for (const [s0, s1] of [[0.602, 0.688], [0.748, 0.836]]) {
        const steps = Math.round((s1 - s0) * 220);
        for (let i = 0; i < steps; i++) {
          const s = s0 + (i / steps) * (s1 - s0);
          const j = hash(i * 211 + 97);
          const j2 = hash(i * 223 + 41);
          for (const side of [-1, 1]) {
            if (j < 0.28) continue;
            const near = (side < 0 ? 22 : 48) + j * 8;
            const a = anchor(K(s), side, near);
            if (a && !onTrack(a.c[0], a.c[2], 8)) {
              pine(K(s), side, near, 15 + j2 * 9, pineCol(j2));
            }
            if (j2 > 0.62) {
              const mid = 40 + j2 * 16;
              const b = anchor(K(s), side, mid);
              if (b && !onTrack(b.c[0], b.c[2], 9)) {
                pine(K(s), side, mid, 17 + j * 8, pineCol(1 - j));
              }
            }
          }
          if (j > 0.93) bush(K(s), -1, 18 + j2 * 4, SCRUB);
        }
      }
      forestEdge(0.604, 0.686, 1, 46, { spacing: 15 });
      forestEdge(0.750, 0.834, -1, 48, { spacing: 15 });

      {
        const a = anchor(K(0.140), -1, 280);
        if (a) {
          const y = terrainYAt ? terrainYAt(a.c[0], a.c[2]) : a.c[1];
          mountain(a.c[0], a.c[2], y - 2, 120, 42, {
            rough: 0.28,
            forest: [0.18, 0.28, 0.16],
            rock: SAND_DUSK,
          });
        }
      }
  };
