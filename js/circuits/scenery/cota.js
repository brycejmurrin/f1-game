"use strict";
(window.TrackScenery = window.TrackScenery || {})["cota"] =
  function (api) {
      const { K, out, MAT, n, ds, hw, place, addBox, addPrism, addCyl, addCone, addFrustum, along, onTrack, anchor, vadd, hash, modelGroup, overheadSpan, groundPatch, waterSurface, grandstand, grandstandEx, spectatorHill, bleacher, scaffoldStand, terrace, acacia, plane, cameraTower, building, motorhome, billboard, marshalPost, fence, guardrail, tyreWall, wall, forestEdge, cityFront, backdrop, terrainYAt, seat, bakedModel } = api;

      const crowdCols = [
        [0.86, 0.28, 0.24], [0.24, 0.42, 0.78], [0.94, 0.82, 0.28],
        [0.90, 0.90, 0.92], [0.26, 0.62, 0.38], [0.82, 0.46, 0.20],
        [0.52, 0.30, 0.66], [0.16, 0.30, 0.52],
      ];
      const mFrac = (m) => m / (ds * n);
      const span = (s, len) => [s - mFrac(len) / 2, s + mFrac(len) / 2];

      const amphiStage = (s, side, dist) => {
        const k = K(s), a = anchor(k, side, dist), bv = [a.r, a.u, a.t];
        const origin = vadd(a.c, a.r, 8);
        const center = vadd(origin, a.u, 13);
        modelGroup("cota-amphitheater", {
          center, size: [52, 30, 56], basis: bv,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(origin, a.u, 2.4), [28, 4.8, 22], [0.18, 0.18, 0.21], bv);
          stage._mat = 0;
          stage._mat = MAT.METAL;
          for (let i = 0; i < 3; i++) {
            addFrustum(stage, vadd(vadd(origin, a.u, 17 + i * 3), a.r, i * 5),
                       27 - i * 5, 23 - i * 5, 2.6, [0.82 - i * 0.06, 0.82 - i * 0.06, 0.86], 18, bv);
          }
          stage._mat = 0;
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(vadd(origin, a.u, 10.96), a.r, -8), [2.2, 22, 30], [0.14, 0.14, 0.16], bv);
          stage._mat = 0;
          addBox(stage, vadd(vadd(origin, a.u, 11), a.r, -6.8), [0.6, 13, 22], [0.32, 0.56, 0.88], bv);
          stage._mat = MAT.METAL;
          for (const so of [-1, 1]) {
            const base = vadd(origin, a.t, so * 17);
            addCyl(stage, base, 0.55, 20, [0.12, 0.12, 0.14], 4, bv);
            for (let j = 0; j < 5; j++)
              addBox(stage, vadd(base, a.u, 11 + j * 1.5), [1.7, 1.3, 2.6], [0.06, 0.06, 0.08], bv);
          }
          stage._mat = 0;
          for (let r = 0; r < 6; r++)
            for (let c = 0; c < 22; c++) {
              const p = vadd(vadd(vadd(origin, a.r, 8 + r * 3), a.u, 0.9),
                             a.t, (c - 11) * 2.1 + (hash(r * 31 + c) - 0.5));
              addBox(stage, p, [0.8, 1.0, 0.7], crowdCols[(r * 7 + c) % crowdCols.length], bv);
            }
        }, { required: true });
      };

      const dryGrass  = [0.55, 0.62, 0.30];
      const scrub     = [0.28, 0.38, 0.22];
      const oak       = [0.24, 0.36, 0.18];
      const cedar     = [0.20, 0.30, 0.18];
      const redSoil   = [0.62, 0.34, 0.24];
      const redSteel  = [0.86, 0.20, 0.16];
      const white     = [0.92, 0.92, 0.94];
      const darkSteel = [0.32, 0.34, 0.40];
      const glass     = [0.40, 0.56, 0.66];
      const cotaBlue  = [0.16, 0.30, 0.52];
      const litWin    = [0.68, 0.72, 0.50];
      const lampPost  = [0.36, 0.36, 0.40];
      const lampHead  = [0.98, 0.94, 0.78];

      grandstandEx(0.00, 1, 8, 150, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      {
        const kMain = K(0.00), segs_ = 10, roofY = 13 + 7.6;
        const aMain = anchor(kMain, 1, 8 + 5), mb = [aMain.r, aMain.u, aMain.t];
        for (let i = 0; i < segs_; i++) {
          const tt = (i + 0.5) / segs_ - 0.5;
          const crown = Math.cos(tt * Math.PI) * 2.6;
          addBox(out, vadd(vadd(aMain.c, aMain.t, tt * 150), aMain.u, roofY + 1.1 + crown),
                 [11.6, 0.5, 150 / segs_ + 0.8], [0.30, 0.32, 0.37], mb);
        }
      }
      {
        const a = anchor(K(0.00), 1, 10);
        if (!onTrack(a.c[0], a.c[2], 16)) {
          const b = [a.r, a.u, a.t];
          modelGroup("cota-main-grandstand", {
            center: vadd(a.c, a.u, 10), size: [14, 22, 140], basis: b,
          }, (stage) => {
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.r, -5.8), a.u, 14.5),
              [0.4, 1.2, 130], redSteel, b);
            addBox(stage, vadd(vadd(a.c, a.r, -5.8), a.u, 13.0),
              [0.35, 0.7, 128], white, b);
            stage._mat = MAT.CONCRETE;
            for (const tOff of [-45, -15, 15, 45]) {
              addBox(stage, vadd(vadd(a.c, a.t, tOff), a.u, 8),
                [10, 12, 8], darkSteel, b);
            }
            stage._mat = 0;
          }, { required: true });
        }
      }
      grandstandEx(0.985, -1, 16, 90, null, null, { livery: "darkSteel", endWalls: true });
      grandstandEx(0.95, 1, 9, 80, null, null, { livery: "darkSteel", endWalls: true });
      grandstandEx(0.07, -1, 14, 80, null, null, { livery: "alu", roof: "none" });
      grandstandEx(0.11, -1, 18, 60, null, null, { livery: "alu", roof: "none" });
      grandstandEx(0.13, -1, 26, 64, null, null, { livery: "alu", roof: "none" });
      grandstandEx(0.20, -1, 16, 56, null, null,
        { livery: "sandstone", roof: "flat", endWalls: true, h: 9 });
      grandstandEx(0.24, 1, 18, 54, null, null,
        { livery: "sandstone", roof: "truss", pylons: true, h: 11 });
      grandstandEx(0.4566, -1, 12, 34, null, null,
        { livery: "sandstone", tiers: 2, roof: "cantilever", suites: true, endWalls: true, h: 12 });
      grandstandEx(0.4634, -1, 12, 34, null, null,
        { livery: "sandstone", tiers: 2, roof: "cantilever", suites: true, endWalls: true, h: 12 });
      grandstandEx(0.625, 1, 14, 70, null, null,
        { livery: "sandstone", roof: "cantilever", pylons: true, endWalls: true, h: 12 });
      grandstandEx(0.685, 1, 14, 55, null, null,
        { livery: "sandstone", roof: "none", h: 8 });
      grandstandEx(0.83, 1, 16, 64, null, null,
        { livery: "sandstone", roof: "truss", suites: true, endWalls: true, h: 11 });
      for (const [off, gap] of [[-43.4, 22], [0, 16], [43.4, 22]])
        grandstandEx(0.02 + mFrac(off), 1, gap, 43, null, null, { livery: "darkSteel", roof: "flat" });

      {
        const pitWall = [0.84, 0.84, 0.86];
        const bayPitch = 20, bays = 6;
        const a0 = anchor(K(0.02 + mFrac(-50)), -1, 24);
        const b0 = [a0.r, a0.u, a0.t];
        modelGroup("cota-pit-garages", {
          center: vadd(a0.c, a0.u, 5), size: [30, 12, bays * bayPitch + 8], basis: b0,
        }, (stage) => {
          for (let i = 0; i < bays; i++) {
            const a = anchor(K(0.02 + mFrac(-50 + i * bayPitch)), -1, 24);
            const foot = a.c.slice();
            const bw = 24, bd = bayPitch - 1.5, hl = bd / 2, hw = bw / 2;
            const gySamples = [];
            for (const sx of [-hw, hw]) for (const sz of [-hl, hl]) {
              const ty = terrainYAt(
                foot[0] + a.t[0] * sx + a.r[0] * sz,
                foot[2] + a.t[2] * sx + a.r[2] * sz);
              if (ty != null) gySamples.push(ty);
            }
            if (gySamples.length) foot[1] = Math.max(foot[1], Math.max(...gySamples) - 0.12);
            const b = [a.r, a.u, a.t];
            stage._mat = MAT.CONCRETE;
            seat.box(stage, foot, [24, 8, bayPitch - 1.5], pitWall, b);
            stage._mat = MAT.GLASS;
            seat.box(stage, vadd(vadd(foot, a.r, 12), a.u, 4.2),
              [0.35, 2.8, bayPitch - 4], glass, b);
            stage._mat = 0;
          }
        });
      }
      motorhome(K(0.99), -1, 40, 30, 8, 60, { wall: [0.88, 0.88, 0.90], window: glass });
      motorhome(K(0.04), -1, 46, 26, 7, 44, { wall: [0.80, 0.80, 0.83], window: glass });
      building(K(0.05), -1, 16, 16, 18, 22, { kind: "notch", wall: cotaBlue, window: glass, floor: 5 });

      motorhome(K(0.012), -1, 72, 24, 7, 38, { wall: white, window: glass });
      building(K(0.035), -1, 70, 20, 6, 34, { kind: "hall",
        wall: [0.72, 0.74, 0.78], window: litWin, floor: 2, roof: cotaBlue,
      });

      {
        const k1 = K(0.10);
        const a1 = anchor(k1, 1, 16);
        addPrism(out, vadd(a1.c, a1.u, 4), [20, 12, 60], redSoil, [a1.r, a1.u, a1.t]);
        const a1L = anchor(k1, -1, 26);
        addPrism(out, vadd(a1L.c, a1L.u, 3), [28, 8, 72], [0.58, 0.36, 0.26], [a1L.r, a1L.u, a1L.t]);
        const a1R = anchor(K(0.085), 1, 22);
        addPrism(out, vadd(a1R.c, a1R.u, 0.5), [16, 11, 48], redSoil, [a1R.r, a1R.u, a1R.t]);
        const aM = anchor(k1, -1, 48);
        if (!onTrack(aM.c[0], aM.c[2], 12)) {
          const bm = [aM.r, aM.u, aM.t];
          modelGroup("cota-turn1-big-red", {
            center: vadd(aM.c, aM.u, 6), size: [12, 14, 44], basis: bm,
          }, (stage) => {
            stage._mat = MAT.METAL;
            for (const tOff of [-16, -5, 5, 16]) {
              const p = vadd(aM.c, aM.t, tOff);
              addCyl(stage, p, 0.4, 10, redSteel, 5, bm);
              addBox(stage, vadd(p, aM.u, 10.2), [2.8, 0.45, 0.45], white, bm);
              addBox(stage, vadd(p, aM.u, 5.0), [1.2, 0.3, 1.2], redSteel, bm);
            }
            stage._mat = MAT.CONCRETE;
            addPrism(stage, vadd(aM.c, aM.u, 1.2), [10, 4, 40], redSoil, bm);
            stage._mat = 0;
          }, { required: true });
        }
      }

      const ke = K(0.18);
      const me = anchor(ke, -1, 32);
      addPrism(out, vadd(me.c, me.u, 2), [34, 6, 64], scrub, [me.r, me.u, me.t]);
      const me2 = anchor(ke, 1, 32);
      addPrism(out, vadd(me2.c, me2.u, 2), [34, 6, 64], scrub, [me2.r, me2.u, me2.t]);

      const ALU_FRAME = [0.70, 0.71, 0.75], ALU_PLANK = [0.78, 0.79, 0.82];
      const t1Rake = { rows: 8, rise: 1.45, setback: 2.1, step: 10, rail: false,
                       frameCol: ALU_FRAME, plankCol: ALU_PLANK,
                       crowd: crowdCols, density: 0.62 };
      bleacher(...span(0.095, 110), -1, 40, t1Rake);
      bleacher(...span(0.135, 70), -1, 46,
        Object.assign({}, t1Rake, { rows: 7, density: 0.55 }));
      terrace(...span(0.975, 120), 1, 34,
        { rows: 6, rise: 1.5, depth: 2.5, step: 9, crowd: crowdCols, density: 0.58,
          conc: [0.74, 0.72, 0.68], concAlt: [0.66, 0.64, 0.60] });

      spectatorHill(0.088, 0.118, -1, 58, { rows: 5, rise: 2.95, depth: 2.2, density: 0.55, grass: dryGrass });

      amphiStage(0.76, 1, 68);

      {
        const kt = K(0.78);
        const at = anchor(kt, 1, 82), tb = [at.r, at.u, at.t];
        const towerCenter = vadd(vadd(at.c, at.r, 12), at.u, 43);
        modelGroup("cota-observation-tower", {
          center: towerCenter, size: [58, 90, 42], basis: tb,
        }, (stage) => {
          const tBase = at.c;
          const pale = [0.86, 0.87, 0.90];
          const pale2 = [0.80, 0.81, 0.85];
          const deckH = 70;
          stage._mat = MAT.METAL;
          addFrustum(stage, tBase,                 4.6, 3.8, 28, pale,  8, tb);
          addFrustum(stage, vadd(tBase, at.u, 28), 3.8, 3.2, 28, pale2, 8, tb);
          addFrustum(stage, vadd(tBase, at.u, 56), 3.2, 2.6, 14, pale,  8, tb);
          const deckCen = vadd(tBase, at.u, deckH);
          addCyl(stage, deckCen, 7.8, 2.2, pale2, 10, tb);
          addBox(stage, vadd(tBase, at.u, deckH + 1.1), [13, 1.4, 13], white, tb);
          addCyl(stage, vadd(tBase, at.u, deckH + 2.6), 6.4, 1.6, [0.74, 0.76, 0.82], 8, tb);
          addCone(stage, vadd(tBase, at.u, deckH + 4.2), 3.8, 2.0, [0.68, 0.69, 0.74], 8, tb);
          addCyl(stage, vadd(tBase, at.u, deckH + 6.0), 0.24, 0.5, pale2, 5, tb);
          addBox(stage, vadd(tBase, at.u, deckH + 6.4), [0.5, 0.5, 0.5], [1.0, 0.82, 0.25], tb);
          stage._mat = 0;
          stage._mat = MAT.METAL;
          for (let i = 0; i < 14; i++) {
            const tOff = (i - 6.5) * 0.85;
            const rOff = 3.2 + Math.abs(tOff) * 0.08;
            addCyl(stage, vadd(vadd(tBase, at.r, rOff), at.t, tOff),
                   0.20, deckH - 2, redSteel, 5, tb);
          }
          for (let i = 0; i < 9; i++) {
            const tOff = (i - 4) * 2.45;
            addBox(stage,
              vadd(vadd(vadd(tBase, at.r, 6.8 + Math.abs(i - 4) * 0.65),
                         at.u, deckH - 5.5), at.t, tOff),
              [9.5 + Math.abs(i - 4) * 1.3, 0.32, 0.34], redSteel, tb);
          }
          for (let i = 0; i < 11; i++) {
            const tOff = (i - 5) * 3.2;
            const flare = 10 + i * 0.35;
            const y = 18 - Math.abs(i - 5) * 0.8;
            addBox(stage,
              vadd(vadd(vadd(tBase, at.r, flare), at.u, y), at.t, tOff),
              [14 + Math.abs(i - 5) * 1.2, 0.32, 0.38], redSteel, tb);
          }
          for (let i = 0; i < 7; i++) {
            const tOff = (i - 3) * 4.0;
            addBox(stage,
              vadd(vadd(vadd(tBase, at.r, 18), at.u, 8), at.t, tOff),
              [22, 0.28, 0.32], redSteel, tb);
          }
          stage._mat = 0;
          const plant = anchor(kt, 1, 73);
          addBox(stage, vadd(plant.c, plant.u, 2.2), [14, 6, 16], [0.84, 0.84, 0.86], [plant.r, plant.u, plant.t]);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(tBase, at.u, deckH + 0.5), [14.2, 0.7, 14.2], litWin, tb);
          stage._mat = 0;
        }, { required: true });
      }

      groundPatch(K(0.775), 1, 14, [40, 0.14, 34], [0.72, 0.71, 0.68],
                  { id: "cota-plaza-apron", samples: 8 });
      waterSurface(K(0.775), 1, 32, [22, 0.3, 12], [0.06, 0.22, 0.24],
                   { id: "cota-plaza-pool" });

      for (const [sf, dist, width, rise, len] of [
        [0.735, 44, 24, 4.0, 54],
        [0.758, 50, 28, 5.0, 62],
        [0.798, 48, 26, 4.5, 56],
      ]) {
        const aa = anchor(K(sf), 1, dist);
        let lift = rise * 0.35;
        if (sf === 0.735 && terrainYAt) {
          const hx = width / 2, hl = len / 2;
          const samples = [];
          for (const sx of [-hx, hx]) for (const sz of [-hl, hl]) {
            const ty = terrainYAt(
              aa.c[0] + aa.t[0] * sx + aa.r[0] * sz,
              aa.c[2] + aa.t[2] * sx + aa.r[2] * sz);
            if (ty != null) samples.push(ty);
          }
          if (samples.length) {
            const lo = Math.min(...samples), hi = Math.max(...samples);
            const target = Math.max(lo + 0.15, hi - 0.4);
            const uy = aa.u[1] || 1;
            lift = (target - aa.c[1]) / uy;
          }
        }
        addPrism(out, vadd(aa.c, aa.u, lift),
                 [width, rise, len], dryGrass, [aa.t, aa.u, aa.r]);
      }

      bleacher(...span(0.112, 54), 1, 48,
        Object.assign({}, t1Rake, { rows: 5, step: 10, density: 0.55 }));
      scaffoldStand(...span(0.642, 72), 1, 40,
        { rows: 5, rise: 1.3, setback: 2.0, step: 9, legEvery: 2,
          crowd: crowdCols, density: 0.55, bench: [white, cotaBlue, redSteel] });

      billboard(K(0.615), 1, 32, 13, 4.2, redSteel);
      billboard(K(0.628), 1, 34, 13, 4.2, white);
      billboard(K(0.641), 1, 32, 13, 4.2, cotaBlue);

      const redFramework = (k, side, dist) => {
        const af = anchor(k, side, dist), fb = [af.r, af.u, af.t];
        if (onTrack(af.c[0], af.c[2], 24)) return;
        addBox(out, vadd(af.c, af.u, 16),              [4, 32, 30], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t,  14), af.u, 8.96), [4.2, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t, -14), af.u, 8.96), [4.2, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t,   7), af.u, 12), [6,  1, 18], white,    fb);
        addBox(out, vadd(vadd(af.c, af.t,  -7), af.u, 12.04), [6.2, 1, 18], white,    fb);
      };
      redFramework(K(0.65), 1, 46);
      redFramework(K(0.65), 1, 78);
      redFramework(K(0.84), 1, 52);
      redFramework(K(0.30), 1, 62);

      {
        const tentCols = [
          [0.78, 0.22, 0.20], [0.20, 0.42, 0.70], [0.86, 0.78, 0.24],
          [0.30, 0.62, 0.34], [0.70, 0.42, 0.16], [0.46, 0.28, 0.60],
          [0.20, 0.58, 0.58], [0.82, 0.50, 0.62],
        ];
        const rvCols = [[0.90, 0.90, 0.88], [0.94, 0.92, 0.84], [0.86, 0.88, 0.90]];
        let camp = 0;
        along(0.285, 0.395, 15, (k) => {
          for (let row = 0; row < 3; row++) {
            const rowDist = 24 + row * 12;
            const jit = (hash(k * 5 + row * 11) - 0.5) * 5;
            const a = anchor(k, -1, rowDist + jit);
            const bv = [a.r, a.u, a.t];
            const h1 = hash(k * 7 + row * 3);
            if (row === 2 && h1 > 0.4) {
              const col = rvCols[Math.floor(hash(k * 13 + row) * rvCols.length) % rvCols.length];
              addBox(out, vadd(a.c, a.u, 1.5), [2.5, 3.0, 8.0], col, bv);
            } else {
              const swap = hash(k * 17 + row * 9) > 0.5;
              const basis = swap ? [a.t, a.u, a.r] : bv;
              const w = 2.6 + hash(k * 19 + row) * 0.8;
              const len_ = 1.8 + hash(k * 23 + row) * 0.7;
              addPrism(out, a.c, [w, 1.7 + hash(k * 29 + row) * 0.5, len_],
                       tentCols[(k + row * 5 + camp) % tentCols.length], basis);
            }
            camp++;
          }
        });
      }


      const hillAnchors = [
        [0.10, -1, 165, 280, 42, 60, [0.36, 0.44, 0.26]],
        [0.25,  1, 155, 260, 38, 55, [0.38, 0.46, 0.28]],
        [0.40, -1, 170, 300, 44, 65, [0.34, 0.42, 0.24]],
        [0.55,  1, 160, 270, 40, 58, [0.36, 0.44, 0.26]],
        [0.70, -1, 175, 290, 46, 62, [0.38, 0.46, 0.28]],
        [0.85,  1, 150, 260, 38, 55, [0.34, 0.42, 0.24]],
        [0.05, -1, 300, 350, 56, 70, [0.40, 0.48, 0.30]],
        [0.20,  1, 320, 380, 62, 75, [0.42, 0.50, 0.32]],
        [0.35, -1, 310, 360, 58, 72, [0.40, 0.48, 0.30]],
        [0.50,  1, 340, 400, 66, 80, [0.44, 0.52, 0.34]],
        [0.65, -1, 295, 340, 54, 68, [0.40, 0.48, 0.30]],
        [0.80,  1, 315, 370, 60, 74, [0.42, 0.50, 0.32]],
        [0.15, -1, 500, 460, 76, 90, [0.44, 0.50, 0.36]],
        [0.45,  1, 520, 480, 80, 95, [0.46, 0.52, 0.38]],
        [0.75, -1, 510, 470, 78, 92, [0.44, 0.50, 0.36]],
      ];
      for (const [sf, side, dist, w, h, d, col] of hillAnchors) {
        backdrop(K(sf), side, dist, [w, h, d], col);
      }

      {
        const hillGrass = [0.40, 0.48, 0.26];
        for (const [sf, side, gapOff] of [
          [0.01, 1, 0], [0.02, -1, 4], [0.035, 1, 0], [0.045, -1, 6],
        ]) {
          const ah = anchor(K(sf), side, 34 + gapOff + hash(K(sf) * 3) * 14);
          addPrism(out, ah.c, [26, 9 + hash(K(sf) * 7) * 5, 44], hillGrass,
                   [ah.t, ah.u, ah.r]);
        }
      }

      cityFront(0.38, 0.55, -1, 320, {
        minH: 28,
        maxH: 55,
        depth: 16,
        step: 48,
        lit: false,
        palette: [
          [0.52, 0.54, 0.62],
          [0.56, 0.58, 0.64],
          [0.48, 0.50, 0.58],
          [0.60, 0.60, 0.66],
          [0.50, 0.52, 0.60],
        ],
      });

      forestEdge(0.88, 0.98,  1, 22, { density: 0.50, hMin: 7, hMax: 13, col: cedar, col2: oak,   pineFrac: 0.4 });

      forestEdge(0.06, 0.16, -1, 32, { density: 0.45, hMin: 8, hMax: 14, col: oak,   col2: cedar, pineFrac: 0.55 });

      forestEdge(0.16, 0.28, -1, 20, { density: 0.50, hMin: 7, hMax: 12, col: cedar, col2: oak,   pineFrac: 0.45 });
      forestEdge(0.16, 0.28,  1, 20, { density: 0.45, hMin: 6, hMax: 11, col: oak,   col2: cedar, pineFrac: 0.35 });

      forestEdge(0.28, 0.42,  1, 18, { density: 0.35, hMin: 6, hMax: 10, col: [0.22, 0.34, 0.18], col2: [0.26, 0.36, 0.20], pineFrac: 0.30 });

      forestEdge(0.40, 0.55, -1, 24, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.50 });
      forestEdge(0.40, 0.62,  1, 18, { density: 0.40, hMin: 6, hMax: 11, col: cedar, col2: oak,   pineFrac: 0.40 });

      forestEdge(0.62, 0.74, -1, 20, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.45 });
      forestEdge(0.72, 0.84, -1, 20, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.45 });

      forestEdge(0.84, 0.96, -1, 18, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.45 });
      forestEdge(0.84, 0.92,  1, 20, { density: 0.35, hMin: 6, hMax: 10, col: cedar, col2: oak,   pineFrac: 0.35 });

      const MESQUITE = [0.34, 0.40, 0.22], MESQ_D = [0.28, 0.34, 0.19];
      for (let i = 0; i < 16; i++) {
        const sf = 0.275 + i * 0.0095;
        const k = K(sf), h1 = hash(k * 37 + i * 5);
        const side = h1 < 0.45 ? 1 : -1;
        const dist = (side < 0 ? 15 : 28) + h1 * (side < 0 ? 6 : 24);
        const th = 5.5 + h1 * 3;
        acacia(k, side, dist, th, h1 < 0.5 ? MESQUITE : MESQ_D,
               { spread: th * (1.15 + h1 * 0.4), layers: h1 > 0.6 ? 2 : 1 });
      }

      const LIVE_OAK = [0.26, 0.35, 0.20];
      for (let i = 0; i < 7; i++) {
        const sf = 0.752 + i * 0.008;
        const k = K(sf), h1 = hash(k * 29 + i * 11);
        plane(k, 1, 20 + (i % 2) * 7, 8 + h1 * 3.5, LIVE_OAK,
              { stages: h1 > 0.55 ? 2 : 1, spread: 0.85 + h1 * 0.3 });
      }

      const cotaGantry = (s, id, clearance, supportGap = 4.5, startLights = false) => {
        const k = K(s), supportWidth = 0.8, thick = 0.9;
        const ok = overheadSpan({
          id, frac: s, clearance, thickness: thick, depth: 1.4,
          supportGap, supportWidth, startLights,
          span: hw[k] * 2 + supportGap * 2 + supportWidth * 2,
          color: darkSteel, required: true,
        });
        if (!ok) return;
        for (const side of [-1, 1]) {
          const a = anchor(k, side, supportGap + supportWidth / 2);
          const mastH = clearance + thick;
          modelGroup(`${id}-support-${side < 0 ? "left" : "right"}`, {
            center: vadd(a.c, a.u, mastH / 2),
            size: [supportWidth, mastH, 1.4],
            basis: [a.r, a.u, a.t],
          }, (stage) => {
            stage._mat = MAT.METAL;
            addCyl(stage, a.c, supportWidth / 2, mastH, darkSteel, 6, [a.r, a.u, a.t]);
          }, { required: true });
        }
      };
      cotaGantry(0.00, "cota-start-gantry", 7.5, 2, true);
      cotaGantry(0.50, "cota-drs-gantry", 7.0);

      groundPatch(K(0.075), 1, 1.2, [18, 0.16, 76], redSoil,
                  { id: "cota-t1-runoff", samples: 6 });
      groundPatch(K(0.63), 1, 1.2, [24, 0.16, 96], [0.48, 0.49, 0.51],
                  { id: "cota-t12-runoff", samples: 8 });

      fence(0.00, 0.06,  1, 5, 3.4, [0.62, 0.64, 0.68]);
      fence(0.94, 1.00,  1, 5, 3.4, [0.62, 0.64, 0.68]);
      fence(0.46, 0.62, -1, 6, 3.4, [0.62, 0.64, 0.68]);
      fence(0.08, 0.14, -1, 8, 3.4, [0.62, 0.64, 0.68]);
      wall(0.94, 0.06, -1, 2.2, 1.1, [0.72, 0.73, 0.76], 0.35, 0.08);

      guardrail(0.15, 0.28,  1, 4, [0.80, 0.80, 0.82]);
      guardrail(0.15, 0.28, -1, 4, [0.80, 0.80, 0.82]);
      guardrail(0.78, 0.90,  1, 4, [0.80, 0.80, 0.82]);
      guardrail(0.62, 0.70,  1, 5, [0.80, 0.80, 0.82]);

      tyreWall(0.058, 0.076,  1, 20, redSteel);
      tyreWall(0.61,  0.66,   1, 6, [0.95, 0.85, 0.1]);
      tyreWall(0.30,  0.34,  -1, 6, [0.1, 0.5, 0.9]);

      billboard(K(0.07), -1, 14, 16, 6, redSteel);
      billboard(K(0.22),  1, 16, 18, 6, cotaBlue);
      billboard(K(0.40), -1, 18, 16, 6, [0.92, 0.5, 0.1]);
      billboard(K(0.50),  1, 18, 18, 6, [0.1, 0.6, 0.35]);
      billboard(K(0.70), -1, 16, 16, 6, redSteel);
      billboard(K(0.885), 1, 22, 16, 6, cotaBlue);

      [0.04, 0.12, 0.20, 0.28, 0.43, 0.58, 0.64, 0.80, 0.90].forEach((s, i) => {
        marshalPost(K(s), (i % 2 ? 1 : -1), 7);
      });

      [50, 100, 150].forEach((m, i) => {
        const km = K(0.085 - m * 0.00018);
        place(km,  1, 9 + i, [1.0, 2.4, 0.4], white);
        const kh = K(0.60  - m * 0.00018);
        place(kh, -1, 9 + i, [1.0, 2.4, 0.4], white);
      });

      [[0.10, -1, 22], [0.50, 1, 24], [0.84, -1, 24]].forEach(([s, side, d]) => {
        cameraTower(K(s), side, d, { h: 15, col: darkSteel });
      });

      const kp = K(0.55), ap = anchor(kp, -1, 72), pb = [ap.r, ap.u, ap.t];
      if (!onTrack(ap.c[0], ap.c[2], 44)) {
        for (let row = -1; row <= 1; row++) {
          for (let col = -2; col <= 2; col++) {
            const c = vadd(vadd(ap.c, ap.t, col * 7), ap.r, row * 5);
            const tint = hash(row * 7 + col * 11);
            const carCol = [0.32 + tint * 0.46, 0.28 + hash(col * 13) * 0.36, 0.30 + hash(row * 17) * 0.40];
            addBox(out, vadd(c, ap.u, 0.7), [2.0, 1.3, 4.0], carCol, pb);
          }
        }
      }

      along(0.94, 0.06, 80, (k) => {
        for (const side of [-1, 1]) {
          const pa = anchor(k, side, 5);
          if (onTrack(pa.c[0], pa.c[2], 1)) continue;
          addCyl(out, pa.c, 0.18, 10, lampPost, 5, [pa.r, pa.u, pa.t]);
          addBox(out, vadd(pa.c, pa.u, 9.5), [0.14, 0.14, 2.8], lampPost, [pa.r, pa.u, pa.t]);
          addBox(out, vadd(vadd(pa.c, pa.t, -side * 1.2), pa.u, 9.32),
                 [0.6, 0.28, 1.2], lampHead, [pa.r, pa.u, pa.t]);
        }
      });
      for (const s of [0.97, 0.995, 0.02]) bakedModel("k_tentlong", K(s), -1, 90, { scale: 2.4 });
      for (const [s, side] of [[0.0655, 1], [0.4155, 1], [0.6335, 1], [0.7655, 1], [0.9175, 1]])
        bakedModel("k_camera_exclusive", K(s), side, 13, { scale: 3 });
    };
