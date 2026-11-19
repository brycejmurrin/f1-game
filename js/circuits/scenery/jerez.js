"use strict";
(window.TrackScenery = window.TrackScenery || {})["jerez"] =
  function (api) {
      const { n, hash, every, anchor, onTrack, terrainYAt,
        tree, palm, bush, building, tower, grandstandEx,
        spectatorHill, terrace, guardrail, fence, tyreWall, marshalPost,
        cameraTower, broadcastCompound, billboard, sponsorHoarding, gantry,
        motorhome, groundPatch, runoffApron, place, ridge,
        modelGroup, vadd, addBox, addCyl, addFrustum, MAT } = api;

      const { K } = api;

      const OCHRE      = [0.74, 0.64, 0.45];
      const OCHRE_PALE = [0.82, 0.73, 0.55];
      const DUST       = [0.67, 0.57, 0.40];
      const TARMAC     = [0.34, 0.33, 0.32];
      const CONC       = [0.82, 0.80, 0.74];
      const CONC_ALT   = [0.73, 0.71, 0.65];
      const WHITEWASH  = [0.92, 0.90, 0.84];
      const OLIVE      = [0.34, 0.37, 0.26];
      const OLIVE_D    = [0.28, 0.31, 0.22];
      const SCRUB      = [0.45, 0.45, 0.32];
      const ARMCO      = [0.80, 0.80, 0.82];
      const TYRE_CAP   = [0.86, 0.34, 0.18];

      const TERR  = { conc: CONC, concAlt: CONC_ALT, rows: 10, rise: 1.45, depth: 2.5 };
      const TERR_LO = { conc: CONC, concAlt: CONC_ALT, rows: 6, rise: 1.4, depth: 2.5 };
      const HILL  = { grass: OCHRE, riser: DUST, rows: 5, rise: 1.2, density: 0.45, step: 8 };
      const HILL_BARE = { grass: OCHRE, riser: DUST, rows: 4, rise: 1.1, density: 0.06, step: 8 };
      const scrubCrown = 2.74, bankPhase = 0.3, bankDepth = 2;
      const drySackInner = 36 - scrubCrown - bankPhase;
      const drySackOuter = 36 + HILL_BARE.rows * bankDepth + scrubCrown + bankPhase;
      const drySackEnd = (8 + scrubCrown + bankPhase) / 4430;
      const slab = (w, d) => [w, 0.16, d];

      const CAM_NEAR = 52;
      const ORBIT_HOT = 70;
      const camHot = (k) => {
        const f = ((k / n) % 1 + 1) % 1;
        return (f >= 0.05 && f <= 0.26) || (f >= 0.68 && f <= 0.92) ||
               f <= 0.04 || f >= 0.96;
      };
      const blocksOrbitView = (side, dist, k) => {
        if (camHot(k)) return dist < (side === 1 ? ORBIT_HOT : 62);
        return side === 1 && dist < 40;
      };
      const blocksPalmView = (side, dist, k) =>
        dist < (camHot(k) ? (side === 1 ? 78 : 64) : (side === 1 ? 56 : CAM_NEAR));

      const olive = (k, side, dist, h) => {
        if (blocksOrbitView(side, dist, k) || !clear(k, side, dist, 14)) return;
        tree(k, side, dist, h, hash(k * 7 + dist) < 0.5 ? OLIVE : OLIVE_D);
      };

      const scrub = (k, side, dist, col) => {
        for (let j = 0; j < 4; j++) {
          const d = dist + j * 12;
          if (blocksOrbitView(side, d, k)) continue;
          const s = ((k / n) % 1 + 1) % 1;
          if (side === -1 && s >= 0.286 - drySackEnd && s <= 0.326 + drySackEnd &&
              d >= drySackInner && d <= drySackOuter) continue;
          const a = anchor(k, side, d);
          if (onTrack(a.c[0], a.c[2], 10)) continue;
          bush(k, side, d, col || SCRUB);
          return;
        }
      };

      const M = 1 / 4430;

      const clear = (k, side, dist, m) => {
        const a = anchor(k, side, dist);
        return !onTrack(a.c[0], a.c[2], m === undefined ? 10 : m);
      };

      const CAR = [[0.85, 0.85, 0.86], [0.70, 0.69, 0.68], [0.52, 0.14, 0.12],
                   [0.22, 0.25, 0.31], [0.86, 0.82, 0.58], [0.33, 0.34, 0.36]];
      const parked = [];
      const carPark = (f0, side, d0, cols, ranks, seed) => {
        for (let i = 0; i < cols; i++) {
          const k = K(f0 + i * 6.5 * M);
          for (let r = 0; r < ranks; r++) {
            const d = d0 + r * 6;
            const h = hash(i * 17 + r * 83 + seed);
            if (h < 0.22) continue;
            if (!clear(k, side, d, 11)) continue;
            const c = anchor(k, side, d).c;
            if (parked.some((q) => Math.hypot(q[0] - c[0], q[2] - c[2]) < (q[3] || 5))) continue;
            parked.push(c);
            place(k, side, d, [4.6, 2.25, 2.2], CAR[(i + r * 2 + seed) % 6]);
          }
        }
      };

      const kiosks = (f0, side, dist, count, seed) => {
        for (let i = 0; i < count; i++) {
          const k = K(f0 + i * 17 * M);
          const h = hash(i * 29 + seed);
          if (h < 0.18) continue;
          const d = dist + h * 4;
          if (!clear(k, side, d, 11)) continue;
          place(k, side, d, [3.6, 2.9, 3.2],
            h < 0.55 ? WHITEWASH : [0.87, 0.83, 0.71]);
        }
      };

      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (f) => (f + SL) % 1;

      cameraTower(K(sl(0.9430)), -1, 17);
      cameraTower(K(sl(0.0560)), -1, 17);
      kiosks(sl(0.9560), -1, 52, 12, 5);
      tower(K(sl(0.9700)), -1, 50, 1.1, 15);
      tower(K(sl(0.0400)), -1, 50, 1.1, 15);
      building(K(sl(0.9880)), -1, 57, 14, 5.5, 26,
        { wall: WHITEWASH, roof: [0.55, 0.34, 0.24] });
      carPark(sl(0.9620), -1, 96, 16, 2, 3);

      guardrail(sl(0.9300), sl(0.0720), 1, 8, ARMCO);
      groundPatch(K(sl(0.0050)), 1, 15, slab(27, 200), TARMAC);
      const seatOk = (k, side, gap) => {
        const a = anchor(k, side, gap);
        if (!a || onTrack(a.c[0], a.c[2], 10)) return false;
        const gy = terrainYAt(a.c[0], a.c[2]);
        return !(gy != null && Math.abs(gy - (a.c[1] + 0.3)) > 0.1);
      };
      for (let i = 0; i < 8; i++) {
        const kk = K(sl(0.9866 + i * 0.0068));
        const gap = 31;
        if (!seatOk(kk, 1, gap)) continue;
        motorhome(kk, 1, gap, 11, 4.4, 17,
          { wall: [0.86 + hash(i * 13) * 0.08, 0.86, 0.88] });
      }
      fence(sl(0.9600), sl(0.0440), 1, 44, 3, CONC_ALT);
      for (let i = 0; i < 9; i++) {
        const k = K(sl(0.9660 + i * 0.0060));
        if (!clear(k, 1, 20, 10)) continue;
        parked.push(anchor(k, 1, 20).c.concat(6.5));
        place(k, 1, 20, [2.6, 2.6, 6.0],
          hash(i * 7) < 0.5 ? [0.72, 0.70, 0.66] : [0.64, 0.62, 0.58]);
      }
      if (!blocksPalmView(1, 54, K(sl(0.0060))))
        palm(K(sl(0.0060)), 1, 54, 12, OLIVE_D);
      if (!blocksPalmView(1, 56, K(sl(0.0180))))
        palm(K(sl(0.0180)), 1, 56, 11, OLIVE);

      terrace(0.0280, 0.0620, -1, 30, TERR_LO);
      spectatorHill(0.0240, 0.0680, -1, 52, HILL);
      cameraTower(K(0.0475), -1, 26);
      groundPatch(K(0.0400), -1, 12, slab(22, 120), OCHRE);
      groundPatch(K(0.0520), -1, 36, slab(40, 110), DUST);
      runoffApron(K(0.0520), -1, 11, 34, OCHRE_PALE);
      for (let i = 0; i < 5; i++)
        scrub(K(0.0230 + i * 0.0060), -1, 110 + hash(i * 19) * 24, SCRUB);
      kiosks(0.0300, -1, 60, 7, 11);
      carPark(0.0300, -1, 82, 10, 2, 7);
      groundPatch(K(0.0420), -1, 84, slab(52, 150), DUST);

      tyreWall(0.0580, 0.0790, -1, 12, TYRE_CAP);
      marshalPost(K(0.0663), 1, 16);
      billboard(K(0.0600), 1, 17, 12, 4.5, [0.88, 0.82, 0.32]);
      groundPatch(K(0.0663), 1, 20, slab(40, 90), OCHRE);

      for (let i = 0; i < 10; i++) {
        const s = 0.0840 + i * 0.0038;
        if (s > 0.118) continue;
        const h = hash(i * 17 + 3);
        if (h < 0.55) continue;
        const d = 72 + h * 40;
        const a = anchor(K(s), -1, d);
        if (onTrack(a.c[0], a.c[2], 12)) continue;
        olive(K(s), -1, d, 5.4 + h * 2.4);
        if (h > 0.82) scrub(K(s), -1, d + 8, SCRUB);
      }
      groundPatch(K(0.1040), -1, 40, slab(70, 200), OCHRE);
      groundPatch(K(0.1240), -1, 112, slab(60, 160), OCHRE_PALE);
      for (let i = 0; i < 6; i++)
        scrub(K(0.0880 + i * 0.0055), -1, 68 + hash(i * 41) * 20, SCRUB);

      grandstandEx(0.1500, -1, 28, 40, null, null,
        { roof: "cantilever", roofCol: CONC, fasciaCol: CONC_ALT, h: 12 });
      grandstandEx(0.1800, -1, 23, 130, null, null,
        { roof: "none", fasciaCol: CONC_ALT, h: 12 });
      grandstandEx(0.2160, -1, 24, 120, null, null,
        { roof: "flat", roofCol: CONC, fasciaCol: CONC_ALT, h: 12 });
      terrace(0.1580, 0.1740, -1, 22, TERR);
      terrace(0.1940, 0.2100, -1, 23, TERR);
      terrace(0.2280, 0.2720, -1, 24, TERR_LO);
      sponsorHoarding(0.1320, 0.2600, -1, 14);
      guardrail(0.1260, 0.2680, -1, 10, ARMCO);
      tyreWall(0.1340, 0.1600, -1, 11, TYRE_CAP);
      cameraTower(K(0.1690), -1, 21);
      marshalPost(K(0.2280), -1, 16);
      groundPatch(K(0.1900), -1, 50, slab(44, 220), DUST);
      kiosks(0.1400, -1, 54, 10, 13);
      for (let i = 0; i < 7; i++) {
        const k = K(0.1480 + i * 0.0090 - (i === 0 ? 0.0055 : 0));
        const gap = i === 0 ? 100 : 72;
        if (!clear(k, -1, gap, 14)) continue;
        if (!seatOk(k, -1, gap)) continue;
        motorhome(k, -1, gap, 10, 4.2, 15,
          { wall: [0.84 + hash(i * 19) * 0.08, 0.84, 0.86] });
      }
      building(K(0.1620), -1, 84, 16, 6, 28,
        { wall: WHITEWASH, roof: [0.55, 0.34, 0.24] });
      building(K(0.2180), -1, 82, 14, 5, 20,
        { wall: WHITEWASH, roof: [0.58, 0.37, 0.26] });
      tower(K(0.1500), -1, 52, 1.1, 15);
      tower(K(0.2500), -1, 52, 1.1, 15);
      carPark(0.1560, -1, 110, 18, 2, 17);
      groundPatch(K(0.2000), -1, 114, slab(70, 260), OCHRE_PALE);

      spectatorHill(0.2860, 0.3260, -1, 36, HILL_BARE);
      guardrail(0.2740, 0.3400, -1, 11, ARMCO);
      marshalPost(K(0.3043), -1, 15);
      groundPatch(K(0.3043), -1, 46, slab(54, 160), OCHRE);
      for (let i = 0; i < 14; i++)
        scrub(K(0.2820 + i * 0.0036), -1, 48 + hash(i * 23) * 26, SCRUB);
      for (let i = 0; i < 6; i++) {
        const s = 0.2880 + i * 0.0075;
        const d = 66 + hash(i * 41) * 30;
        const a = anchor(K(s), -1, d);
        if (!onTrack(a.c[0], a.c[2], 10)) olive(K(s), -1, d, 5.0 + hash(i * 5) * 2);
      }

      broadcastCompound(K(0.3563), 1, 20);
      cameraTower(K(0.3470), 1, 18);
      tyreWall(0.3460, 0.3700, 1, 12, TYRE_CAP);
      marshalPost(K(0.3620), 1, 17);
      groundPatch(K(0.3520), 1, 30, slab(26, 70), DUST);
      for (let i = 0; i < 4; i++)
        scrub(K(0.3480 + i * 0.0060), 1, 58 + hash(i * 31) * 18, SCRUB);

      terrace(0.3640, 0.3800, -1, 21, TERR);
      terrace(0.3880, 0.4020, -1, 21, TERR);
      grandstandEx(0.3842, -1, 30, 125, null, null,
        { roof: "cantilever", roofCol: CONC, fasciaCol: CONC_ALT, tiers: 2, h: 14 });
      spectatorHill(0.3620, 0.4060, -1, 54, HILL);
      tyreWall(0.3700, 0.4000, -1, 11, TYRE_CAP);
      guardrail(0.3580, 0.4140, -1, 9, ARMCO);
      marshalPost(K(0.3900), -1, 15);
      billboard(K(0.3720), -1, 18, 16, 5.5, [0.88, 0.86, 0.80]);
      cameraTower(K(0.3960), -1, 20);
      sponsorHoarding(0.3660, 0.4020, -1, 13);
      groundPatch(K(0.3842), -1, 76, slab(40, 170), OCHRE_PALE);
      if (!blocksPalmView(-1, 58, K(0.4000)))
        palm(K(0.4000), -1, 58, 11, OLIVE);
      if (!blocksPalmView(-1, 56, K(0.3660)))
        palm(K(0.3660), -1, 56, 10, OLIVE_D);
      kiosks(0.3680, -1, 68, 6, 23);
      carPark(0.3660, -1, 108, 14, 2, 29);
      groundPatch(K(0.3860), -1, 114, slab(64, 210), DUST);
      tower(K(0.3700), -1, 64, 1.1, 16);
      tower(K(0.4020), -1, 64, 1.1, 16);
      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.3600 + i * 0.0140), -1, 146);
        if (onTrack(a.c[0], a.c[2], 37)) continue;
        const ang = Math.atan2(a.t[2], a.t[0]);
        ridge(a.c[0], a.c[2], terrainYAt(a.c[0], a.c[2]) - 2.2, ang,
          62, 26, 4 + hash(i * 17) * 2.5, DUST);
      }

      for (let i = 0; i < 7; i++) {
        const s = 0.4240 + i * 0.0165;
        const a = anchor(K(s), 1, 62);
        if (onTrack(a.c[0], a.c[2], 37)) continue;
        const ang = Math.atan2(a.t[2], a.t[0]);
        ridge(a.c[0], a.c[2], terrainYAt(a.c[0], a.c[2]) - 2.0, ang,
          58, 24, 4.5 + hash(i * 13) * 3, DUST);
      }
      for (let i = 0; i < 10; i++)
        scrub(K(0.4180 + i * 0.0065), 1, 56 + hash(i * 29) * 28, SCRUB);
      groundPatch(K(0.4600), 1, 50, slab(46, 140), OCHRE);
      guardrail(0.4180, 0.5020, 1, 12, ARMCO);

      guardrail(0.5040, 0.5460, -1, 10, ARMCO);
      tyreWall(0.5100, 0.5360, -1, 11, TYRE_CAP);
      spectatorHill(0.5060, 0.5420, -1, 26,
        { grass: OCHRE, riser: DUST, rows: 3, rise: 1.05, density: 0.55 });
      marshalPost(K(0.5228), -1, 16);
      if (clear(K(0.5560), -1, 142, 20)) {
        building(K(0.5560), -1, 142, 12, 5.5, 18,
          { wall: WHITEWASH, roof: [0.55, 0.33, 0.23] });
        place(K(0.5600), -1, 138, [6, 3, 8], [0.80, 0.77, 0.70]);
        olive(K(0.5520), -1, 134, 5.6);
      }
      groundPatch(K(0.5228), -1, 40, slab(40, 130), DUST);
      for (let i = 0; i < 8; i++)
        scrub(K(0.5060 + i * 0.0048), -1, 44 + hash(i * 37) * 18, SCRUB);

      for (let row = 0; row < 3; row++) {
        const d = 78 + row * 22;
        for (let i = 0; i < 7; i++) {
          const s = 0.5980 + i * 0.0090;
          const h = hash(i * 11 + row * 97);
          if (h < 0.36) continue;
          const a = anchor(K(s), -1, d);
          if (onTrack(a.c[0], a.c[2], 12)) continue;
          const gy = terrainYAt(a.c[0], a.c[2]);
          if (gy != null && Math.abs(gy - a.c[1]) > 0.7) continue;
          olive(K(s), -1, d, 4.6 + h * 1.9);
        }
      }
      if (seatOk(K(0.6300), -1, 118)) {
        building(K(0.6300), -1, 118, 18, 6.5, 12,
          { wall: WHITEWASH, roof: [0.55, 0.34, 0.24] });
      }
      if (seatOk(K(0.6365), -1, 122))
        place(K(0.6365), -1, 122, [9, 4.5, 7], WHITEWASH);
      if (seatOk(K(0.6250), -1, 112))
        place(K(0.6250), -1, 112, [5, 3.2, 11], [0.78, 0.74, 0.66]);
      if (seatOk(K(0.6270), -1, 100))
        palm(K(0.6270), -1, 100, 12, OLIVE_D);
      building(K(0.6540), -1, 132, 16, 6.5, 52,
        { wall: WHITEWASH, roof: [0.56, 0.33, 0.23] });
      building(K(0.6660), -1, 128, 12, 5, 24,
        { wall: WHITEWASH, roof: [0.56, 0.33, 0.23] });
      tower(K(0.6600), -1, 150, 2.4, 13);
      for (let i = 0; i < 5; i++) {
        const k = K(0.6460 + i * 16 * M);
        if (clear(k, -1, 112, 12)) place(k, -1, 112, [1.0, 2.2, 7.0], WHITEWASH);
      }
      for (let i = 0; i < 6; i++) {
        const s = 0.6380 + i * 22 * M;
        if (s > 0.652 && s < 0.668) continue;
        const k = K(s);
        if (hash(i * 23) < 0.28) continue;
        if (!clear(k, -1, 168, 12)) continue;
        const a = anchor(k, -1, 168);
        const gy = terrainYAt(a.c[0], a.c[2]);
        if (gy != null && Math.abs(gy - a.c[1]) > 0.55) continue;
        olive(k, -1, 168, 4.4 + hash(i * 9) * 1.4);
      }
      for (let row = 0; row < 3; row++) {
        const d = 96 + row * 7;
        for (let i = 0; i < 6; i++) {
          const k = K(0.6700 + i * 14 * M);
          if (!clear(k, -1, d, 12)) continue;
          place(k, -1, d, [1.1, 1.1, 8.5], [0.33, 0.36, 0.26]);
        }
      }
      groundPatch(K(0.6700), -1, 104, slab(46, 120), [0.88, 0.86, 0.80]);
      groundPatch(K(0.6560), -1, 124, slab(76, 190), OCHRE_PALE);
      groundPatch(K(0.6300), -1, 56, slab(80, 230), OCHRE_PALE);
      for (let i = 0; i < 8; i++) {
        const s = 0.6020 + i * 0.0055;
        if (s >= 0.690 && s <= 0.745) continue;
        scrub(K(s), -1, 72 + hash(i * 31) * 24, SCRUB);
      }

      sponsorHoarding(0.6920, 0.7420, -1, 14);
      cameraTower(K(0.7060), -1, 23);
      guardrail(0.6860, 0.7500, -1, 10, ARMCO);
      tyreWall(0.7000, 0.7280, -1, 11, TYRE_CAP);
      marshalPost(K(0.7180), -1, 16);
      spectatorHill(0.6940, 0.7400, -1, 48,
        { grass: OCHRE, riser: DUST, rows: 5, rise: 1.2, density: 0.18 });
      groundPatch(K(0.7123), -1, 54, slab(36, 150), DUST);
      kiosks(0.6980, -1, 58, 6, 31);
      carPark(0.7000, -1, 84, 14, 2, 37);

      terrace(0.7520, 0.8080, -1, 26, TERR_LO);
      terrace(0.8120, 0.8280, -1, 26, TERR);
      terrace(0.8600, 0.8780, -1, 27, TERR);
      grandstandEx(0.8417, -1, 42, 70, null, null,
        { roof: "cantilever", roofCol: CONC, fasciaCol: CONC_ALT, h: 13 });
      sponsorHoarding(0.8140, 0.8780, -1, 13);
      billboard(K(0.8290), -1, 17, 18, 6, [0.86, 0.84, 0.78]);
      guardrail(0.8100, 0.8860, -1, 10, ARMCO);
      tyreWall(0.8260, 0.8420, -1, 11, TYRE_CAP);
      tyreWall(0.8470, 0.8580, -1, 11, TYRE_CAP);
      runoffApron(K(0.8417), -1, 11, 30, OCHRE_PALE);
      marshalPost(K(0.8480), -1, 16);
      cameraTower(K(0.8680), -1, 24);
      groundPatch(K(0.8000), -1, 56, slab(46, 300), DUST);
      kiosks(0.7700, -1, 54, 8, 41);
      tower(K(0.8000), -1, 54, 1.1, 15);
      building(K(0.7900), -1, 72, 14, 5, 22,
        { wall: WHITEWASH, roof: [0.57, 0.36, 0.25] });
      carPark(0.7660, -1, 90, 16, 2, 43);

      terrace(0.8740, 0.9260, -1, 20, TERR);
      grandstandEx(0.9177, -1, 34, 135, null, null,
        { roof: "none", fasciaCol: CONC_ALT, tiers: 2, h: 13 });
      sponsorHoarding(0.8760, 0.9300, -1, 13);
      tyreWall(0.9040, 0.9300, -1, 11, TYRE_CAP);
      marshalPost(K(0.9177), -1, 15);
      cameraTower(K(0.8880), -1, 24);
      groundPatch(K(0.9177), -1, 58, slab(34, 170), DUST);
      kiosks(0.8800, -1, 54, 9, 47);
      building(K(0.9000), -1, 70, 14, 5.5, 24,
        { wall: CONC, roof: [0.55, 0.53, 0.50] });
      carPark(0.8820, -1, 86, 12, 2, 53);
      tower(K(0.9280), -1, 56, 1.1, 15);

      guardrail(0.9420, 0.9740, 1, 12, ARMCO);
      marshalPost(K(0.9517), 1, 14);
      building(K(0.9450), 1, 32, 22, 9, 15,
        { wall: CONC, roof: [0.58, 0.56, 0.53] });
      groundPatch(K(0.9517), 1, 20, slab(20, 56), TARMAC);

      for (const side of [-1, 1]) guardrail(0.0, 1.0, side, 13, ARMCO);

      for (let i = 0; i < 12; i++) marshalPost(Math.round((i / 12) * n) % n, 1, 17);

      every(32, (k) => {
        const h = hash(k * 37 + 11);
        if (h < 0.58) return;
        const side = h < 0.82 ? -1 : 1;
        const dist = (camHot(k) ? ORBIT_HOT : CAM_NEAR) + h * 28;
        if (blocksOrbitView(side, dist, k)) return;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 9)) return;
        scrub(k, side, dist, h < 0.60 ? SCRUB : OLIVE_D);
        if (h > 0.92) scrub(k, side, dist + 12 + h * 6, SCRUB);
      });

      every(80, (k) => {
        const h = hash(k * 53 + 7);
        if (h < 0.74) return;
        const side = h < 0.90 ? -1 : 1;
        const dist = ORBIT_HOT + 8 + h * 36;
        if (blocksOrbitView(side, dist, k)) return;
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 12)) return;
        if (h > 0.988) {
          if (!blocksPalmView(side, dist, k))
            palm(k, side, dist, 10 + h * 3, OLIVE_D);
        } else olive(k, side, dist, 5.2 + h * 2.2);
      });

      gantry(sl(0.0), 8, CONC);
      gantry(sl(0.0345), 7.5, CONC_ALT);

      {
        const a = anchor(K(sl(0.002)), 1, 28);
        if (!onTrack(a.c[0], a.c[2], 12)) {
          const b = [a.r, a.u, a.t];
          const R = 10, STEM = 10;
          const OVNI_W = [0.93, 0.93, 0.91], OVNI_S = [0.80, 0.80, 0.78];
          const OVNI_G = [0.16, 0.22, 0.28];
          const base = vadd(a.c, a.r, -2);
          modelGroup("jerez-ovni", {
            center: vadd(base, a.u, STEM * 0.62),
            size: [R * 2 + 3, STEM + 8, R * 2 + 3], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            addCyl(stage, base, 2.8, STEM, OVNI_S, 8, b);
            addBox(stage, base, [7.5, 0.5, 7.5], OVNI_S, b);
            addFrustum(stage, vadd(base, a.u, STEM - 2.6), R * 0.40, R * 0.88, 2.6, OVNI_S, 8, b);
            stage._mat = MAT.GLASS;
            addCyl(stage, vadd(base, a.u, STEM), R * 0.88, 3.0, OVNI_G, 8, b);
            stage._mat = MAT.CONCRETE;
            addCyl(stage, vadd(base, a.u, STEM + 3.0), R, 0.9, OVNI_W, 8, b);
            addFrustum(stage, vadd(base, a.u, STEM + 3.9), R * 0.72, R * 0.26, 1.8, OVNI_W, 8, b);
            stage._mat = MAT.METAL;
            addCyl(stage, vadd(base, a.u, STEM + 5.7), 0.14, 3.6, [0.55, 0.56, 0.58], 5, b);
            stage._mat = 0;
          }, { required: true });
        }
      }

      {
        const a = anchor(K(sl(0.012)), 1, 24);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          const H = 28, R = 3.6;
          const TOWER = [0.88, 0.86, 0.80], GLASS = [0.18, 0.28, 0.36];
          const BOTTLE = [0.92, 0.90, 0.78], HAT = [0.12, 0.12, 0.14];
          modelGroup("jerez-control-tower", {
            center: vadd(a.c, a.u, (H + 7) * 0.48),
            size: [R * 2.6, H + 9, R * 2.6], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            addCyl(stage, a.c, R * 1.1, 2.8, TOWER, 8, b);
            addCyl(stage, vadd(a.c, a.u, 2.6), R, H - 2.6, TOWER, 8, b);
            stage._mat = MAT.GLASS;
            for (let i = 0; i < 5; i++) {
              addCyl(stage, vadd(a.c, a.u, 5 + i * 4.2), R + 0.06, 1.0, GLASS, 8, b);
            }
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, H + 0.35), [R * 2.0, 0.6, R * 2.0], TOWER, b);
            stage._mat = MAT.METAL;
            addCyl(stage, vadd(a.c, a.u, H + 0.6), 1.15, 4.8, BOTTLE, 6, b);
            addFrustum(stage, vadd(a.c, a.u, H + 5.4), 1.15, 0.48, 1.2, BOTTLE, 6, b);
            addCyl(stage, vadd(a.c, a.u, H + 6.5), 0.48, 1.0, BOTTLE, 5, b);
            addCyl(stage, vadd(a.c, a.u, H + 7.4), 1.3, 0.3, HAT, 6, b);
            addCyl(stage, vadd(a.c, a.u, H + 7.65), 0.75, 0.75, HAT, 5, b);
            stage._mat = 0;
          }, { required: true });
        }
      }

      {
        const a = anchor(K(sl(api.def.turns[12])), -1, 16);
        if (!onTrack(a.c[0], a.c[2], 6)) {
          const b = [a.r, a.u, a.t];
          modelGroup("jerez-lorenzo-corner", {
            center: vadd(a.c, a.u, 2.4), size: [0.8, 5.2, 4.2], basis: b,
          }, (stage) => {
            stage._mat = MAT.METAL;
            addBox(stage, vadd(a.c, a.u, 2.2), [0.35, 4.4, 0.35], [0.55, 0.56, 0.58], b);
            addBox(stage, vadd(a.c, a.u, 4.6), [0.55, 1.6, 3.6], [0.12, 0.12, 0.14], b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(vadd(a.c, a.r, 0.32), a.u, 4.6),
              [0.06, 1.35, 3.2], [0.85, 0.78, 0.22], b);
            stage._mat = 0;
          }, { required: true });
        }
      }

      {
        const a = anchor(K(sl(api.def.turns[5])), -1, 18);
        if (!onTrack(a.c[0], a.c[2], 6)) {
          const b = [a.r, a.u, a.t];
          modelGroup("jerez-dani-pedrosa", {
            center: vadd(a.c, a.u, 2.4), size: [0.8, 5.2, 4.2], basis: b,
          }, (stage) => {
            stage._mat = MAT.METAL;
            addBox(stage, vadd(a.c, a.u, 2.2), [0.35, 4.4, 0.35], [0.55, 0.56, 0.58], b);
            addBox(stage, vadd(a.c, a.u, 4.6), [0.55, 1.6, 3.6], [0.12, 0.12, 0.14], b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(vadd(a.c, a.r, 0.32), a.u, 4.6),
              [0.06, 1.35, 3.2], [0.22, 0.45, 0.78], b);
            stage._mat = 0;
          }, { required: true });
        }
      }
  };
