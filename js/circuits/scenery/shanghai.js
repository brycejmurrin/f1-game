"use strict";
(window.TrackScenery = window.TrackScenery || {})["shanghai"] =
  function (api) {
      const { K, out, track, n, hash, vadd,
        place, groundYAt, anchor, addBox, addCyl, addCone, seat,
        addFrustum, along,
        building, house, motorhome, cityFront, grandstandEx, billboard, gantry, marshalPost,
        wall, fence, guardrail, tyreWall, tree, bush, hedge, pine, palm, recordBarrier, MAT, runoffApron, modelGroup, overheadSpan, onTrack,
        waterSurface, groundPatch, terrainYAt, frameAt,
        cameraTower, broadcastCompound, sponsorHoarding,
        groundUnder, indexSolid } = api;
      const backdrop = (k, side, dist, sz, col) => {
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], sz[0] / 2 + 6)) return;
        api.backdrop(k, side, dist, sz, col);
      };


      {
        const BUND   = [0.44, 0.38, 0.28];
        const PADDY  = [0.36, 0.44, 0.34];
        const FALLOW = [0.42, 0.40, 0.31];
        const REED   = [0.52, 0.54, 0.36];
        const REED_D = [0.44, 0.47, 0.31];
        for (const [sf, side, gap] of [
          [0.145, -1, 108], [0.205, -1, 146], [0.330,  1, 122],
          [0.395,  1, 158], [0.545, -1, 118], [0.615, -1, 152],
          [0.760,  1, 112], [0.845,  1, 140],
        ]) {
          const kk = K(sf), a0 = anchor(kk, side, gap);
          if (onTrack(a0.c[0], a0.c[2], 34)) continue;
          const b = [a0.r, a0.u, a0.t];
          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 3; c++) {
              const hv = hash(kk * 29 + r * 17 + c * 11);
              const p = vadd(vadd(a0.c, a0.r, r * 26), a0.t, (c - 1) * 30);
              if (onTrack(p[0], p[2], 20)) continue;
              const gyP = groundUnder(p[0], p[2]);
              if (gyP !== null) p[1] = gyP;
              const jit = (hash(kk * 61 + r * 23 + c * 37) - 0.5) * 0.24;
              seat.box(out, p, [24 + jit * 4, 0.56, 28 - jit * 3], BUND, b);
              if (hv < 0.22) {
                seat.box(out, vadd(p, a0.u, 0.56), [21, 0.16, 25], FALLOW, b);
              } else {
                if (r === 0 && c === 1) {
                  waterSurface(kk, side, gap - 0.5, [21, 0.14, 25],
                               [0.30, 0.38, 0.40],
                               { id: `shanghai-paddy-${Math.round(sf * 1000)}` });
                } else {
                  seat.box(out, vadd(p, a0.u, 0.56), [21, 0.12, 25],
                         [0.28, 0.36, 0.38], b);
                }
                out._mat = MAT.FOLIAGE;
                seat.box(out, vadd(p, a0.u, 0.70), [20 + jit * 3, 0.42, 24 - jit * 4],
                       hv < 0.6 ? PADDY : [0.40, 0.48, 0.32], b);
                out._mat = 0;
              }
            }
          }
          out._mat = MAT.FOLIAGE;
          for (let i = 0; i < 14; i++) {
            const hv = hash(kk * 43 + i * 7);
            const p = vadd(vadd(a0.c, a0.r, 54 + hv * 9),
                           a0.t, (i - 7) * 6.5 + hv * 2);
            if (onTrack(p[0], p[2], 16)) continue;
            const gy = groundUnder(p[0], p[2]);
            if (gy !== null) p[1] = gy;
            addCone(out, vadd(p, a0.u, 0.1), 1.5 + hv * 0.9, 2.4 + hv * 1.5,
                    hv < 0.5 ? REED : REED_D, 5, b);
          }
          out._mat = 0;
        }
      }

      const groundedSail = (s, side, dist, opts) => {
        opts = opts || {};
        const rx = opts.rx || 15, rz = opts.rz || 9, h = opts.h || 15;
        const col = opts.col || [0.90, 0.91, 0.92];
        const a = anchor(K(s), side, dist), b = [a.r, a.u, a.t];
        const foot = a.c.slice();
        const gy = groundUnder(foot[0], foot[2]);
        if (gy !== null) foot[1] = gy - 0.35;
        if (onTrack(foot[0], foot[2], Math.max(rx, rz) + 2)) return;
        out._mat = MAT.METAL;
        seat.cyl(out, foot, 0.55, h + 0.35, [0.28, 0.28, 0.32], 6, b);
        out._mat = 0;
        const crown = vadd(foot, a.u, h + 0.35);
        addBox(out, vadd(crown, a.u, 0.32), [rx * 2, 0.65, rz * 2], col, b);
      };
      const sailRow = (s0, s1, side, dist, count, opts) => {
        for (let i = 0; i < count; i++) {
          const s = s0 + (i + 0.5) / count * (s1 - s0);
          groundedSail(s, side, dist, opts);
        }
      };

      const CONC  = [0.70, 0.72, 0.74];
      const WHITE = [0.90, 0.91, 0.92];
      const STEEL = [0.62, 0.64, 0.67];
      const SEAT  = [0.40, 0.42, 0.46];
      const DARK  = [0.30, 0.32, 0.36];
      const PALE  = [0.58, 0.58, 0.60];
      const MARSH = [0.34, 0.45, 0.28];
      const MARSH_N = [0.28, 0.38, 0.24];
      const RED   = [0.82, 0.16, 0.14];
      const YELLOW = [0.90, 0.78, 0.16];
      const SKY   = [0.66, 0.68, 0.72];
      const SKY_HAZE = [0.72, 0.74, 0.77];
      const GLASS = [0.52, 0.60, 0.70];
      const GLASS_HAZE = [0.66, 0.71, 0.77];
      const WATER = [0.34, 0.46, 0.54];
      const TREE_G = [0.24, 0.40, 0.22];
      const CROWD = [0.62, 0.30, 0.30];
      const TARMAC = [0.26, 0.27, 0.29];
      const PEARL = [0.78, 0.62, 0.58];
      const WIN_LIT   = [0.96, 0.92, 0.78];
      const WIN_TOWER = [0.88, 0.90, 0.96];
      const LAMP_GLOW = [0.98, 0.86, 0.52];

      const SL = Math.round((1 - api.def._sceneryShift) * 1e4) / 1e4;
      const sl = (f) => (((f + SL) % 1) + 1) % 1;

      (function pitBuilding() {
        const GAR = 9;
        for (let i = 0; i < GAR; i++) {
          const s = sl(-0.028 + (i + 0.5) / GAR * 0.056);
          const aB = anchor(K(s), 1, 14), bB = [aB.r, aB.u, aB.t];
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(aB.c, aB.u, 4.2), [16, 8.4, 15.4], WHITE, bB);
          const aD = anchor(K(s), 1, 3.2), bD = [aD.r, aD.u, aD.t];
          for (const off of [-5.2, 0, 5.2])
            addBox(out, vadd(vadd(aD.c, aD.u, 2.3), aD.t, off), [0.5, 4.4, 3.8], DARK, bD);
          out._mat = MAT.METAL;
          addBox(out, vadd(aD.c, aD.u, 7.0), [8, 0.5, 15.8], [0.84, 0.86, 0.89], bD);
          out._mat = 0;
          const aG = anchor(K(s), 1, 16), bG = [aG.r, aG.u, aG.t];
          addBox(out, vadd(aG.c, aG.u, 10.5), [11, 3.8, 14.8], GLASS_HAZE, bG);
          out._mat = MAT.METAL;
          for (const [d, y, w] of [[8, 12.8, 8]]) {
            const aW = anchor(K(s), 1, d);
            addBox(out, vadd(aW.c, aW.u, y), [w, 0.55, 15.6], WHITE, [aW.r, aW.u, aW.t]);
          }
          out._mat = 0;
        }


        const sp = anchor(K(sl(0.000)), 1, 28), bs = [sp.r, sp.u, sp.t];
        out._mat = MAT.CONCRETE;
        addBox(out, vadd(sp.c, sp.u, 12.0), [30, 5.6, 15], [0.88, 0.89, 0.91], bs);
        out._mat = 0;
        addBox(out, vadd(sp.c, sp.u, 9.6), [29, 1.8, 15.4], GLASS_HAZE, bs);
        out._mat = MAT.METAL;
        addBox(out, vadd(sp.c, sp.u, 15.1), [33, 0.7, 17], WHITE, bs);
        for (const d of [22, 30, 38, 46]) {
          const aC = anchor(K(sl(0.000)), 1, d), bC = [aC.r, aC.u, aC.t];
          for (const off of [-5.5, 5.5])
            seat.cyl(out, vadd(aC.c, aC.t, off), 0.5, 9.2, STEEL, 8, bC);
        }
        out._mat = 0;

        for (let i = 0; i < 3; i++) {
          const a = anchor(K(sl(-0.020 + i * 0.016)), 1, 48), b = [a.r, a.u, a.t];
          const foot = a.c.slice();
          const gy = groundUnder(foot[0], foot[2]);
          if (gy !== null) foot[1] = gy;
          out._mat = MAT.CONCRETE;
          seat.box(out, foot, [15, 11, 17], [0.84, 0.86, 0.88], b);
          out._mat = 0;
          addBox(out, vadd(foot, a.u, 7.4), [15.4, 2.4, 16], WIN_TOWER, b);
          out._mat = MAT.METAL;
          addBox(out, vadd(foot, a.u, 11.2), [18, 0.6, 18], WHITE, b);
          out._mat = 0;
        }
      })();
      building(K(sl(0.985)), 1, 16, 16, 11, 55,
        { kind: "slab", wall: [0.84, 0.85, 0.87], window: WIN_LIT, floor: 3 });

      (function mainGrandstand() {
        for (let i = 0; i < 7; i++) {
          const sBay = sl(-0.052 + i * 0.0098);
          grandstandEx(sBay, -1, 12, 52, null, null, {
            livery: i % 2 ? "alu" : "crimson", tiers: 2, roof: "cantilever",
            suites: true, endWalls: i === 0 || i === 6, pylons: true,
          });
          const aS = anchor(K(sBay), -1, 8.4), bS = [aS.r, aS.u, aS.t];
          out._mat = MAT.METAL;
          addBox(out, vadd(aS.c, aS.u, 12.05), [7.2, 0.42, 46],
            i % 2 ? WHITE : [0.88, 0.86, 0.84], bS);
          if (i !== 0 && i !== 6) {
            for (const sgn of [-1, 1]) {
              const aE = anchor(K(sBay), -1, 14);
              addBox(out, vadd(vadd(aE.c, aE.t, sgn * 23.2), aE.u, 6.2),
                [10.5, 11.5, 0.55], i % 2 ? [0.78, 0.80, 0.84] : [0.55, 0.24, 0.24],
                [aE.r, aE.u, aE.t]);
            }
          }
          out._mat = 0;
        }
      })();

      (function twinWings() {

        const wingDeck = (deckId, frac, hgt, deckD, col) => {
          const aL = anchor(K(frac), -1, 20), aR = anchor(K(frac), 1, 20);
          const span = Math.hypot(
            aR.c[0] - aL.c[0], aR.c[1] - aL.c[1], aR.c[2] - aL.c[2]
          );
          const bR = [aR.r, aR.u, aR.t];
          const deckTopY = frameAt(frac).c[1] + hgt + 0.5;
          for (const tOff of [-2.4, 2.4])
            seat.cyl(out, vadd(aR.c, aR.t, tOff), 0.45, deckTopY - aR.c[1], STEEL, 6, bR);
          overheadSpan({
            id: deckId,
            frac,
            clearance: hgt,
            thickness: 1.15,
            depth: deckD,
            span: span + 1,
            color: col,
            supportGap: 20,
            supportColor: STEEL,
            soffit: { color: GLASS, inset: 0.08, thickness: 0.4 },
            required: true,
          });
        };
        const wingPier = (frac, hgt, emit) => {
          const aL = anchor(K(frac), -1, 20), bL = [aL.r, aL.u, aL.t];
          const pierH = (frameAt(frac).c[1] + hgt + 0.5) - aL.c[1];
          emit({
            center: vadd(aL.c, aL.u, pierH / 2),
            size: [3.5, pierH + 0.6, 7],
            basis: bL,
          }, (stage) => {
            for (const tOff of [-2.4, 2.4])
              seat.cyl(stage, vadd(aL.c, aL.t, tOff), 0.45, pierH, STEEL, 6, bL);
          });
        };
        const W1 = sl(-0.064), W2 = sl(0.022);
        wingPier(W1, 38, (bounds, emit) => {
          modelGroup("shanghai-wing-east", bounds, emit, { required: true });
        });
        wingDeck("shanghai-wing-east-deck", W1, 38, 8.0, WHITE);
        wingPier(W2, 36, (bounds, emit) => {
          modelGroup("shanghai-wing-west", bounds, emit, { required: true });
        });
        wingDeck("shanghai-wing-west-deck", W2, 36, 7.0, [0.86, 0.88, 0.90]);
        for (const [frac, hgt, tipD] of [[W1, 38, 11], [W2, 36, 10]]) {
          const aL = anchor(K(frac), -1, 22), aR = anchor(K(frac), 1, 22);
          const mid = [
            (aL.c[0] + aR.c[0]) * 0.5,
            (aL.c[1] + aR.c[1]) * 0.5 + hgt + 1.1,
            (aL.c[2] + aR.c[2]) * 0.5,
          ];
          const bR = [aR.r, aR.u, aR.t];
          out._mat = MAT.METAL;
          addBox(out, mid, [tipD, 0.45, 3.2], WHITE, bR);
          addBox(out, vadd(mid, aR.u, 0.55), [tipD * 0.72, 0.35, 2.2], GLASS_HAZE, bR);
          out._mat = 0;
        }
      })();

      building(K(0.042), -1, 70, 20, 28, 34, {
        kind: "cylinder", wall: CONC, window: WIN_TOWER, floor: 5, lit: true,
      });
      building(K(0.072), -1, 76, 20, 20, 38, {
        kind: "notch", wall: [0.82, 0.84, 0.86], window: WIN_LIT, floor: 4, lit: true,
      });

      gantry(sl(0.004), 9, STEEL);

      wall(sl(0.965), sl(0.05), 1, 6, 1.1, WHITE);
      place(K(0.99), 1, 10, [5, 2.4, 12], CONC);
      place(K(0.99), 1, 10, [5.4, 1.4, 12.2], RED, 0.05);

      broadcastCompound(K(0.975), 1, 30, { vans: 3, dishes: 2, mastH: 10 });

      along(0.00, 0.04, 18, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 12), b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.1, 9.0, STEEL, 5, b);
          addBox(out, vadd(a.c, a.u, 9.1), [0.5, 0.25, 0.5], LAMP_GLOW, b);
        }
      });

      waterSurface(K(sl(0.975)), -1,  95, [180, 0.18, 130], WATER,
        { id: "shanghai-yu-lake-south", required: true });
      waterSurface(K(sl(0.020)), -1, 98, [28, 0.18, 110], WATER,
        { id: "shanghai-yu-lake-north", required: true });
      place(K(sl(0.990)), -1,  85, [10, 1.0, 5], CONC);
      place(K(sl(0.030)), -1, 115, [11, 0.9, 5], [0.65, 0.68, 0.72]);
      waterSurface(K(0.62), -1, 120, [70, 0.18, 80], [0.36, 0.48, 0.56],
        { id: "shanghai-marsh-pool", required: true });

      (function yuGarden() {
        const cluster = [
          [sl(0.970), -1, 100, 10, 5.0, 8],
          [sl(0.990), -1, 118,  8, 4.5, 7],
          [sl(0.010), -1,  98,  9, 5.5, 8],
          [sl(0.040), -1, 112,  8, 4.0, 7],
        ];
        const a0 = anchor(K(sl(0.005)), -1, 108), b0 = [a0.r, a0.u, a0.t];
        modelGroup("shanghai-yu-pavilions", {
          center: vadd(a0.c, a0.u, 5),
          size: [55, 14, 70],
          basis: b0,
        }, (stage) => {
          for (const [s, sd, d, w, h, len] of cluster) {
            const a = anchor(K(s), sd, d), b = [a.r, a.u, a.t];
            const foot = a.c.slice();
            const gy = groundUnder(foot[0], foot[2]);
            if (gy !== null) foot[1] = gy;
            seat.box(stage, foot, [w, h, len], WHITE, b);
            seat.prism(stage, vadd(foot, a.u, h), [w * 1.2, 2.2, len * 1.2], RED, b);
            addBox(stage, vadd(vadd(foot, a.u, h * 0.55), a.r, w * 0.5 + 0.1),
                   [0.35, h * 0.35, len * 0.55], WIN_LIT, b);
          }
        }, { required: true });
        for (const [s, sd, d, w, h, len] of [
          [sl(0.055), -1, 108, 11, 5.5, 9],
          [sl(0.075), -1, 122,  9, 5.0, 8],
          [sl(0.095), -1, 105,  8, 4.2, 7],
          [sl(0.115), -1, 128, 10, 5.5, 8],
        ]) {
          const a = anchor(K(s), sd, d), b = [a.r, a.u, a.t];
          const foot = a.c.slice();
          const gy = groundUnder(foot[0], foot[2]);
          if (gy !== null) foot[1] = gy;
          if (onTrack(foot[0], foot[2], Math.max(w, len) * 0.45)) continue;
          seat.box(out, foot, [w, h, len], WHITE, b);
          seat.prism(out, vadd(foot, a.u, h), [w * 1.2, 2.2, len * 1.2], RED, b);
          addBox(out, vadd(vadd(foot, a.u, h * 0.55), a.r, w * 0.5 + 0.1),
                 [0.35, h * 0.35, len * 0.55], WIN_LIT, b);
        }
        for (const [sf, gap] of [[0.048, 78], [0.068, 86], [0.088, 74], [0.112, 92]]) {
          house(K(sl(sf)), -1, gap, 9, 5.5, 8, {
            wall: WHITE, roof: RED, roofType: "gable", lit: true,
          });
        }
      })();

      grandstandEx(sl(0.032), -1, 20, 28, null, null,
        { livery: "darkSteel", roof: "cantilever", endWalls: true });
      grandstandEx(sl(0.052), -1, 24, 28, null, null,
        { livery: "alu", roof: "flat", pylons: true });
      billboard(K(sl(0.045)), -1, 14, 16, 4.5, YELLOW);

      (function snailRunoff() {
        const pads = [
          [sl(0.040),  1, 3.5, [22, 0.32, 38]],
          [sl(0.050),  1, 4.5, [28, 0.32, 44]],
          [sl(0.060),  1, 6.0, [34, 0.32, 50]],
          [sl(0.072),  1, 8.0, [30, 0.32, 42]],
          [sl(0.084),  1, 10,  [26, 0.32, 36]],
          [sl(0.096),  1, 12,  [22, 0.32, 30]],
          [sl(0.108),  1, 14,  [18, 0.32, 26]],
          [sl(0.068), -1, 4.0, [14, 0.30, 28]],
          [sl(0.090), -1, 5.5, [16, 0.30, 24]],
        ];
        for (const [s, sd, gap, sz] of pads) {
          runoffApron(K(s), sd, gap, sz, PALE);
        }
      })();
      grandstandEx(sl(0.05),  1, 95, 30, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      grandstandEx(sl(0.085), 1, 85, 28, null, null,
        { livery: "crimson", roof: "flat" });
      grandstandEx(sl(0.10),  -1, 45, 28, null, null,
        { livery: "alu", roof: "truss", pylons: true });
      grandstandEx(sl(0.13),  1, 72, 26, null, null,
        { livery: "crimson", roof: "cantilever", endWalls: true });
      grandstandEx(sl(0.064), 1, 112, 28, null, null,
        { livery: "alu", roof: "none" });
      grandstandEx(sl(0.098), 1, 104, 30, null, null,
        { livery: "darkSteel", roof: "none", endWalls: true });

      const circlesStand = (id, s, side, gap, bays, required) => {
        const pitch = 11, len = bays * pitch;
        const a = anchor(K(s), side, gap + 6), b = [a.r, a.u, a.t];
        const IN = -side;
        const half = (len / 2) / track.total;
        recordBarrier(s - half, s + half, side, gap);
        const emit = (stage) => {
          for (let t = 0; t < 5; t++) {
            const lat = IN * (5.0 - t * 2.0), y = t * 1.55;
            stage._mat = MAT.CONCRETE;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [2.0, 1.55, len],
              t % 2 ? CONC : [0.66, 0.68, 0.70], b);
            stage._mat = MAT.FABRIC;
            for (let j = 0; j * 1.1 < len - 2; j++) {
              const h2 = hash(K(s) * 7 + t * 53 + j * 17);
              if (h2 < 0.42) continue;
              seat.box(stage, vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1 + j * 1.1),
                a.u, y + 1.55), [0.6, 1.0, 0.5],
                h2 > 0.8 ? RED : (h2 > 0.6 ? YELLOW : CROWD), b);
            }
          }
          for (let i = 0; i < bays; i++) {
            const c = vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch);
            stage._mat = MAT.METAL;
            for (const lean of [-1, 1])
              seat.cyl(stage, vadd(vadd(c, a.r, IN * lean * 1.9), a.u, -0.5),
                0.28, 11.9, STEEL, 6, b);
            stage._mat = 0;
            const hub = vadd(c, a.u, 11.4);
            addCone(stage, hub, 5.6, 2.4, WHITE, 10, b);
            addFrustum(stage, vadd(hub, a.u, -0.35), 5.7, 5.7, 0.35, RED, 10, b);
          }
        };
        const bounds = {
          center: vadd(a.c, a.u, 8),
          size: [16, 18, len + 6],
          basis: b,
        };
        if (required) {
          modelGroup("shanghai-circles-stand", bounds, emit, { required: true });
        } else {
          modelGroup(id, bounds, emit);
        }
      };
      circlesStand("shanghai-circles-stand", sl(0.075), 1, 125, 5, true);
      billboard(K(sl(0.07)),  1, 56, 16, 5, YELLOW);
      billboard(K(sl(0.095)), 1, 44, 16, 5, RED);
      marshalPost(K(sl(0.08)), -1, 14);

      const fanTerraces = (spots) => {
        for (const [s, side, dist] of spots) {
          const a = anchor(K(s), side, dist), b = [a.r, a.u, a.t];
          for (let i = 0; i < 6; i++) {
            const c = vadd(vadd(a.c, a.t, (i - 2.5) * 7), a.u, 0);
            const gy = groundUnder(c[0], c[2]);
            if (gy !== null) c[1] = gy;
            seat.box(out, c, [7.5, 2.8, 4.8],
              i % 3 === 0 ? RED : (i % 3 === 1 ? YELLOW : CROWD), b);
          }
        }
      };
      fanTerraces([
        [sl(0.060), 1, 120],
        [sl(0.098), 1, 110],
        [0.470, 1,  58],
        [sl(0.700), 1,  74],
        [sl(0.8227), -1, 110],
      ]);

      (function pudongCluster() {
        const HORIZON = 2400;
        const a0 = anchor(K(0.30), -1, HORIZON);
        let hi = a0.c[1];
        for (const alongT of [-40, -20, 0, 20, 40]) {
          for (const sideOff of [-60, -30, 0, 30, 60]) {
            const q = vadd(vadd(a0.c, a0.t, alongT), a0.r, sideOff);
            const g = terrainYAt(q[0], q[2]);
            if (g != null) hi = Math.max(hi, g);
          }
        }
        if (!(hi > a0.c[1] + 0.02)) {
          const gyH = groundYAt(K(0.30), HORIZON);
          if (gyH != null) hi = Math.max(hi, gyH);
        }
        const lift = hi - a0.c[1] > 0.02 ? hi - a0.c[1] + 0.04 : 0.04;
        const a = Object.assign({}, a0, { c: vadd(a0.c, a0.u, lift) });
        const b = [a.r, a.u, a.t];
        const u = b[1];
        const haze = (c, t) => [
          c[0] + (0.80 - c[0]) * t,
          c[1] + (0.82 - c[1]) * t,
          c[2] + (0.83 - c[2]) * t,
        ];
        const PEARL_H = haze(PEARL, 0.55);
        const GLASS_H = haze(GLASS_HAZE, 0.5);
        const STEEL_H = haze(STEEL, 0.45);
        const CORE_H = haze([0.68, 0.66, 0.64], 0.4);

        for (let i = 0; i < 14; i++) {
          const k2 = K(0.26 + i / 14 * 0.10);
          const h = 70 + hash(i * 19 + 100) * 90;
          const w = 18 + hash(i * 23 + 100) * 14;
          const dist = HORIZON - 180 + hash(i * 11) * 360;
          backdrop(k2, -1, dist, [w, h, w * 0.55], haze(SKY_HAZE, 0.55 + hash(i) * 0.25));
        }

        const seatXZ = (p) => {
          const g = terrainYAt(p[0], p[2]);
          if (g != null) { p[1] = g; return p; }
          const g2 = groundUnder(p[0], p[2]);
          if (g2 != null) p[1] = g2;
          else p[1] = a.c[1];
          return p;
        };
        const pc = seatXZ(vadd(vadd(a.c, a.r, -2), a.t, 50));
        const stC = seatXZ(vadd(vadd(a.c, a.r, 55), a.t, 55));
        const jmC = seatXZ(vadd(vadd(a.c, a.r, -32), a.t, 50));
        const swC = seatXZ(vadd(vadd(a.c, a.r, 26), a.t, 63));
        const heroCenter = seatXZ(vadd(vadd(a.c, a.r, 12), a.t, 52));
        modelGroup("shanghai-pudong", {
          center: vadd(heroCenter, u, 98),
          size: [130, 205, 80],
          basis: b,
        }, (stage) => {
          const cyl = (c, rad, h, col, seg) =>
            TrackGeom.addCyl(stage, c, rad, h, col, seg, b);
          const cone = (c, rad, h, col, seg) =>
            TrackGeom.addCone(stage, c, rad, h, col, seg, b);
          const frustum = (c, r0, r1, h, col, seg) =>
            TrackGeom.addFrustum(stage, c, r0, r1, h, col, seg, b);
          const box = (c, size, col) => TrackGeom.addBox(stage, c, size, col, b);

          const legH = 48, legR = 2.2, legCol = haze([0.74, 0.72, 0.70], 0.4);
          for (const [ro, to] of [[-10, 0], [5, -9], [5, 9]])
            cyl(vadd(vadd(pc, a.r, ro), a.t, to), legR, legH, legCol, 8);
          frustum(pc, 14, 8, 8, CORE_H, 12);

          const lSphBase = 54, lSphR = 15;
          frustum(vadd(pc, u, lSphBase), lSphR * 0.7, lSphR, 4, PEARL_H, 12);
          frustum(vadd(pc, u, lSphBase + 2), lSphR, lSphR, lSphR * 1.6, PEARL_H, 12);
          frustum(vadd(pc, u, lSphBase + lSphR * 1.6 + 2), lSphR, lSphR * 0.7, 4, PEARL_H, 12);
          frustum(vadd(pc, u, lSphBase + lSphR * 0.8),
            lSphR * 1.02, lSphR * 1.02, lSphR * 0.5, haze(WIN_LIT, 0.6), 12);

          const connBase = 84, connTop = 108;
          cyl(vadd(pc, u, connBase), 3.2, connTop - connBase, haze([0.80, 0.70, 0.66], 0.5), 8);
          frustum(vadd(pc, u, connBase + (connTop - connBase) * 0.5 - 1),
            4.5, 4.5, 2.5, haze([0.74, 0.66, 0.62], 0.5), 12);

          const uSphBase = connTop, uSphR = 10;
          frustum(vadd(pc, u, uSphBase), uSphR * 0.7, uSphR, 4, haze([0.80, 0.66, 0.60], 0.55), 10);
          frustum(vadd(pc, u, uSphBase + 2), uSphR, uSphR, uSphR * 1.6, haze([0.82, 0.68, 0.62], 0.55), 10);
          frustum(vadd(pc, u, uSphBase + uSphR * 1.6 + 2),
            uSphR, uSphR * 0.7, 4, haze([0.80, 0.66, 0.60], 0.55), 10);
          frustum(vadd(pc, u, uSphBase + uSphR * 0.8),
            uSphR * 1.03, uSphR * 1.03, uSphR * 0.4, haze(WIN_LIT, 0.65), 10);
          const spireBase = uSphBase + uSphR * 1.6 + 6;
          cyl(vadd(pc, u, spireBase), 0.9, 32, haze([0.88, 0.78, 0.72], 0.55), 6);
          cone(vadd(pc, u, spireBase + 32), 0.9, 12, haze([0.90, 0.82, 0.76], 0.55), 6);

          box(vadd(stC, u, 40), [18, 80, 16], GLASS_H);
          box(vadd(stC, u, 110), [12, 60, 11], haze([0.62, 0.68, 0.74], 0.45));
          box(vadd(stC, u, 155), [6, 30, 5.5], haze([0.66, 0.72, 0.78], 0.45));
          box(vadd(stC, u, 172), [2.5, 22, 2.5], STEEL_H);
          box(vadd(jmC, u, 27.5), [16, 55, 14], haze([0.70, 0.69, 0.68], 0.4));
          box(vadd(jmC, u, 72.5), [12, 35, 11], haze([0.72, 0.71, 0.70], 0.4));
          box(vadd(jmC, u, 100), [8, 20, 7], haze([0.74, 0.73, 0.72], 0.4));
          cyl(vadd(jmC, u, 110), 0.7, 18, STEEL_H, 5);

          box(vadd(swC, u, 57), [16, 114, 14], haze([0.58, 0.66, 0.74], 0.45));
          box(vadd(vadd(swC, u, 132), a.r, -5), [4, 36, 11], haze(GLASS, 0.5));
          box(vadd(vadd(swC, u, 132), a.r,  5), [4, 36, 11], haze(GLASS, 0.5));
          box(vadd(swC, u, 149), [14.4, 3, 11.4], STEEL_H);
        }, { required: true });
      })();

      (function industrialSheds() {
        for (let i = 0; i < 6; i++) {
          const k = K(0.335 + i * 0.007);
          const w = 26 + hash(i * 9) * 12;
          const h = 7 + hash(i * 5) * 3;
          backdrop(k, -1, 150 + hash(i * 7) * 25, [w, h, 16], [0.60, 0.60, 0.58]);
        }
      })();

      (function midfieldCampus() {
        const GRASS_A = [0.32, 0.48, 0.28];
        const GRASS_B = [0.28, 0.42, 0.24];
        const GRASS_C = [0.38, 0.52, 0.30];
        const TECH = [0.72, 0.74, 0.76];
        const TECH_D = [0.58, 0.60, 0.64];
        for (const [sf, side, gap, len, wid] of [
          [0.22, -1, 55, 110, 12],
          [0.28, -1, 72, 95, 11],
          [0.34,  1, 48, 100, 12],
          [0.40, -1, 60, 120, 13],
          [0.52, -1, 70, 100, 11],
          [0.18,  1, 65, 80, 10],
          [0.30, -1, 95, 70, 10],
          [0.44,  1, 80, 85, 11],
        ]) {
          groundPatch(K(sf), side, gap, [wid, 0.22, len], TARMAC, {
            id: `shanghai-svc-${Math.round(sf * 1000)}-${side > 0 ? "r" : "l"}`, samples: 4,
          });
        }
        for (let i = 0; i < 8; i++) {
          const sf = 0.195 + i * 0.048;
          const side = (i % 2) ? -1 : 1;
          const gap = 105 + hash(i * 17) * 45;
          const col = i % 3 === 0 ? GRASS_A : (i % 3 === 1 ? GRASS_B : GRASS_C);
          groundPatch(K(sf), side, gap,
            [16 + hash(i * 5) * 18, 0.16, 18 + hash(i * 9) * 22], col, {
              id: `shanghai-mid-grass-${i}`, samples: 3,
            });
        }
        for (let i = 0; i < 10; i++) {
          const sf = 0.20 + i * 0.035;
          const side = (i % 3 === 0) ? 1 : -1;
          const gap = 78 + hash(i * 11) * 40;
          const a = anchor(K(sf), side, gap), b = [a.r, a.u, a.t];
          if (onTrack(a.c[0], a.c[2], 24)) continue;
          const foot = a.c.slice();
          const gy = groundUnder(foot[0], foot[2]);
          if (gy !== null) foot[1] = gy;
          const w = 14 + hash(i * 7) * 10;
          const h = 5.5 + hash(i * 13) * 4.5;
          const d = 16 + hash(i * 19) * 12;
          const hf = (d / 2 + 4) / track.total;
          indexSolid(sf - hf, sf + hf, side, gap - w / 2 - 2, w + 6);
          out._mat = MAT.CONCRETE;
          seat.box(out, foot, [w, h, d], i % 2 ? TECH : TECH_D, b);
          out._mat = MAT.METAL;
          addBox(out, vadd(foot, a.u, h + 0.25), [w * 1.08, 0.45, d * 1.08], WHITE, b);
          out._mat = MAT.GLASS;
          addBox(out, vadd(vadd(foot, a.u, h * 0.55), a.r, side * (w * 0.5 + 0.08)),
            [0.2, h * 0.4, d * 0.55], WIN_LIT, b);
          out._mat = 0;
        }
        for (let i = 0; i < 12; i++) {
          const sf = 0.19 + i * 0.035;
          const side = (i % 2) ? -1 : 1;
          const gap = 42 + hash(i * 23) * 28;
          const ht = 6 + hash(i * 29) * 5;
          if (i % 3 === 0) pine(K(sf), side, gap, ht + 2, TREE_G);
          else if (i % 3 === 1) tree(K(sf), side, gap, ht, MARSH_N);
          else bush(K(sf), side, gap, MARSH);
        }
      })();

      (function chinaGpSignage() {
        sponsorHoarding(sl(-0.040), sl(0.018), -1, 10, {
          step: 12, palette: [RED, YELLOW, WHITE, [0.82, 0.16, 0.14]], postCol: DARK,
        });
        sponsorHoarding(sl(-0.030), sl(0.010), 1, 8, {
          step: 11, palette: [YELLOW, RED, WHITE], postCol: STEEL,
        });
        for (const [sf, side, gap, w, h, col] of [
          [sl(-0.020), 1, 26, 18, 5.0, RED],
          [sl(0.005),  1, 24, 16, 4.5, YELLOW],
          [sl(0.018), -1, 26, 20, 5.5, RED],
          [sl(0.038),  1, 22, 14, 4.0, WHITE],
          [0.468, 1, 28, 16, 4.5, RED],
          [sl(0.670), 1, 22, 18, 5.0, YELLOW],
          [sl(0.735), -1, 20, 14, 4.0, RED],
        ]) {
          billboard(K(sf), side, gap, w, h, col);
        }
        for (let i = 0; i < 4; i++) {
          motorhome(K(sl(-0.024 + i * 0.014)), 1, 56, 7, 3.8, 14, {
            wall: WHITE, accent: RED, lit: true,
          });
        }
      })();

      grandstandEx(0.42, 1, 22, 30, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      grandstandEx(0.45, 1, 20, 34, null, null,
        { livery: "crimson", roof: "flat" });
      grandstandEx(0.48, 1, 22, 30, null, null,
        { livery: "alu", roof: "truss", pylons: true });
      grandstandEx(0.50, 1, 20, 28, null, null,
        { livery: "darkSteel", roof: "cantilever", endWalls: true });
      grandstandEx(0.435, 1, 46, 30, null, null,
        { livery: "crimson", roof: "flat", endWalls: true });
      grandstandEx(0.475, 1, 48, 30, null, null,
        { livery: "alu", roof: "none" });
      grandstandEx(0.515, 1, 46, 28, null, null,
        { livery: "darkSteel", roof: "flat" });
      billboard(K(0.46), 1, 12, 16, 4.5, RED);
      marshalPost(K(0.45), 1, 12);

      sailRow(0.415, 0.520, 1, 33, 4, { rx: 15, rz: 9, h: 15, col: WHITE });

      overheadSpan({
        id: "shanghai-mid-arena-bridge",
        frac: 0.472,
        clearance: 7.2,
        thickness: 1.0,
        depth: 4.5,
        supportGap: 13,
        color: WHITE,
        required: true,
      });

      for (let i = 0; i < 10; i++) {
        const k = K(0.56 + i * 0.012);
        const h = 6 + hash(i * 7) * 8;
        const w = 55 + hash(i * 11) * 55;
        backdrop(k, -1, 85 + hash(i * 5) * 45, [w, h, 24], MARSH_N);
      }
      groundPatch(K(0.62), -1, 18, [95, 0.24, 130], MARSH,
        { id: "shanghai-marsh-shelf", samples: 8 });
      hedge(0.58, 0.66, -1, 24, 3.5, MARSH_N);
      for (let i = 0; i < 6; i++) {
        backdrop(K(0.74 + i * 0.02), -1, 100 + hash(i * 9) * 30,
          [70 + hash(i * 3) * 40, 5 + hash(i * 5) * 6, 20], MARSH);
      }

      sponsorHoarding(0.58, 0.72, 1, 9, {
        step: 14, palette: [RED, WHITE, YELLOW, STEEL], postCol: DARK,
      });
      fence(0.58, 0.72, 1, 8, 3.0, [0.70, 0.72, 0.76]);
      cameraTower(K(0.615), 1, 22, { h: 16, col: STEEL });
      cameraTower(K(0.695), -1, 30, { h: 14, col: SEAT });
      marshalPost(K(0.605), -1, 22);
      marshalPost(K(0.705),  1, 17);
      billboard(K(0.65), 1, 14, 14, 4.5, RED);
      for (let i = 0; i < 6; i++) {
        const s = 0.585 + i * 0.026;
        const side = (i % 2) ? -1 : 1;
        const d = 26 + hash(i * 9) * 34;
        bush(K(s), side, d, MARSH);
        bush(K(s), side, d + 6, MARSH_N);
      }

      const BS = (r) => sl(r - 0.10);
      fence(sl(0.606), sl(0.67), 1, 8, 3.0, [0.70, 0.72, 0.76]);
      billboard(K(BS(0.76)), 1, 10, 18, 5, RED);
      billboard(K(BS(0.82)), 1, 10, 18, 5, YELLOW);
      billboard(K(BS(0.79)), 1, 10, 18, 5, RED);
      marshalPost(K(BS(0.80)), 1, 14);
      marshalPost(K(BS(0.74)), 1, 12);
      grandstandEx(BS(0.755), 1, 38, 34, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(BS(0.775), 1, 62, 30, null, null,
        { livery: "darkSteel", roof: "none" });
      grandstandEx(BS(0.808),  1, 38, 34, null, null,
        { livery: "alu", roof: "truss", pylons: true });
      grandstandEx(BS(0.823), 1, 62, 30, null, null,
        { livery: "crimson", roof: "flat", endWalls: true });
      grandstandEx(BS(0.845), 1, 38, 32, null, null,
        { livery: "darkSteel", roof: "flat", endWalls: true });
      grandstandEx(BS(0.865), 1, 58, 28, null, null,
        { livery: "alu", roof: "cantilever" });

      sailRow(BS(0.750), BS(0.870), 1, 50, 4, { rx: 15, rz: 9, h: 15, col: [0.88, 0.89, 0.91] });
      for (let i = 0; i < 4; i++) {
        bush((K(BS(0.74)) + i * Math.round(n * 0.014)) % n, 1, 36 + i * 8, MARSH);
      }

      along(BS(0.72), BS(0.88), 35, (k) => {
        const a = anchor(k, -1, 14), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.12, 9.5, STEEL, 5, b);
        addBox(out, vadd(a.c, a.u, 9.6), [0.55, 0.28, 0.55], LAMP_GLOW, b);
      });

      grandstandEx(sl(0.800), -1, 34, 30, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      grandstandEx(sl(0.8125), -1, 60, 28, null, null,
        { livery: "crimson", roof: "none" });
      grandstandEx(sl(0.8227), -1, 38, 32, null, null,
        { livery: "alu", roof: "truss", pylons: true });
      grandstandEx(sl(0.834), -1, 62, 28, null, null,
        { livery: "darkSteel", roof: "flat", pylons: true });
      grandstandEx(sl(0.848), -1, 36, 28, null, null,
        { livery: "crimson", roof: "flat", endWalls: true });
      for (const [s, dist, rx] of [
        [0.800, 80, 16],
        [0.8227, 84, 17],
        [0.848, 82, 15],
      ]) {
        groundedSail(sl(s), -1, dist, {
          rx, rz: 9, h: 15, col: [0.88, 0.89, 0.91],
        });
      }
      runoffApron(K(sl(0.8227)), -1, 3, [22, 0.35, 48], PALE);
      marshalPost(K(sl(0.8227)), -1, 28);

      (function lakeBoardwalk() {
        const a = anchor(K(sl(0.005)), -1, 112), b = [a.r, a.u, a.t];
        modelGroup("shanghai-lake-boardwalk", {
          center: vadd(a.c, a.u, 3.2),
          size: [12, 7, 82],
          basis: b,
        }, (stage) => {
          const box = (c, size, col) => TrackGeom.addBox(stage, c, size, col, b);
          const cyl = (c, rad, h, col, seg) =>
            TrackGeom.addCyl(stage, c, rad, h, col, seg, b);
          box(vadd(a.c, a.u, 3.0), [5.5, 0.7, 78], [0.76, 0.74, 0.68]);
          for (const tOff of [-34, -17, 0, 17, 34]) {
            cyl(vadd(a.c, a.t, tOff), 0.32, 2.8, STEEL, 6);
          }
          for (const rOff of [-2.5, 2.5]) {
            box(vadd(vadd(vadd(a.c, a.r, rOff), a.u, 4.0), a.t, 0),
              [0.18, 1.6, 78], WHITE);
          }
        }, { required: true });
      })();

      for (const [i, s, gap, size] of [
        [0, sl(0.970), 122, [18, 0.24, 24]],
        [1, sl(0.990), 142, [14, 0.24, 19]],
        [2, sl(0.030), 118, [16, 0.24, 21]],
      ]) {
        groundPatch(K(s), -1, gap, size, MARSH_N, {
          id: `shanghai-lake-islet-${i}`,
          samples: 4,
        });
        const a = anchor(K(s), -1, gap), b = [a.r, a.u, a.t];
        for (let j = 0; j < 5; j++) {
          const c = vadd(vadd(a.c, a.r, (hash(i * 17 + j) - 0.5) * 9),
            a.t, (hash(i * 31 + j + 9) - 0.5) * 12);
          addCyl(out, c, 0.09, 1.4 + hash(i * 13 + j) * 0.8,
            [0.48, 0.52, 0.24], 5, b);
        }
      }

      building(K(0.96), 1, 2, 12,  9, 50, { kind: "hall", wall: [0.86, 0.87, 0.88], window: WIN_LIT, floor: 3 });
      building(K(0.94), 1, 2, 10,  7, 34, { kind: "slab", wall: [0.84, 0.85, 0.87], window: WIN_LIT, floor: 2 });

      cityFront(0.92, 0.965, 1, 48, {
        minH: 10, maxH: 24, depth: 22,
        palette: [WHITE, CONC, [0.82, 0.83, 0.86]],
        step: 28,
      });
      cityFront(0.14, 0.28, -1, 58, {
        minH: 14, maxH: 38, depth: 22,
        palette: [[0.80, 0.82, 0.84], CONC, [0.72, 0.76, 0.82]],
        lit: true, windowCol: WIN_LIT,
        step: 42,
      });

      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 50))) {
        for (const side of [-1, 1]) {
          const r = hash(k * 13 + side * 3);
          if (r > 0.65) continue;
          const d = 42 + hash(k * 7 + side) * 50;
          tree(k, side, d, 7 + hash(k * 17 + side) * 4, MARSH_N);
          if (hash(k * 23 + side) > 0.6) bush(k, side, d + 6, MARSH);
        }
      }

      guardrail(0.10, 0.27,  1, 5, STEEL);
      guardrail(0.32, 0.42,  1, 5, STEEL);
      guardrail(0.50, 0.70, -1, 5, STEEL);
      guardrail(0.10, 0.42, -1, 6, STEEL);
      fence(0.12, 0.27, 1, 7, 3.2, [0.70, 0.72, 0.76]);
      fence(0.32, 0.40, 1, 7, 3.2, [0.70, 0.72, 0.76]);
      fence(0.50, 0.70, -1, 7, 3.2, [0.70, 0.72, 0.76]);

      tyreWall(sl(0.812), sl(0.836), -1, 26, RED);
      tyreWall(sl(0.06),  sl(0.09),  1, 4, YELLOW);
      tyreWall(0.305, 0.325, -1, 10, RED);


      marshalPost(K(0.20), -1, 18);
      marshalPost(K(0.34), -1, 20);
      marshalPost(K(0.55),  1, 19);
      marshalPost(K(0.66), -1, 19);
      billboard(K(0.18),  1, 12, 14, 4, YELLOW);
      billboard(K(0.34), -1, 35, 16, 4.5, RED);
      billboard(K(0.55),  1, 14, 14, 4, RED);
      billboard(K(0.66), -1, 16, 14, 4, YELLOW);

      (function crowds() {
        const spots = [
          [sl(0.045), -1, 18], [sl(0.06),  1, 70], [0.46, 1, 16],
          [sl(0.70),  1, 22], [sl(0.10), -1, 30],
        ];
        for (const [s, sd, d] of spots) {
          const a = anchor(K(s), sd, d), b = [a.r, a.u, a.t];
          for (let i = 0; i < 5; i++) {
            const off = (i - 2) * 12;
            addBox(out, vadd(vadd(vadd(a.c, a.t, off), a.u, 2.55), a.r, 2),
                   [9, 4.8, 5], [0.42, 0.43, 0.47], b);
            addBox(out, vadd(vadd(vadd(a.c, a.t, off), a.u, 6), a.r, 2),
                   [9, 2.2, 5.4], i % 2 ? CROWD : [0.50, 0.34, 0.40], b);
          }
        }
      })();

      hedge(sl(0.80), sl(0.855), -1, 100, 3.0, TREE_G);
      for (let i = 0; i < 4; i++) {
        tree(K(sl(0.805 + i * 0.014)), -1, 96 + (i % 2) * 6, 7 + hash(i) * 3, TREE_G);
      }
      for (let i = 0; i < 5; i++) {
        palm(K(sl(0.805 + i * 0.010)), -1, 112, 6 + hash(i * 3) * 2, [0.30, 0.46, 0.26]);
      }
      for (let i = 0; i < 8; i++) {
        pine(K(BS(0.72 + i * 0.018)), 1, 58 + (i % 2) * 5, 8 + hash(i * 5) * 4, TREE_G);
      }

      (function formalGardens() {
        const topiaryFracs = [sl(0.060), sl(0.090), sl(0.120)];
        const topiarySides = [-1, 1, -1];
        for (let i = 0; i < topiaryFracs.length; i++) {
          const tk = K(topiaryFracs[i]);
          bush(tk, topiarySides[i], 50, [0.22, 0.38, 0.19]);
          bush(tk, topiarySides[i], 54, [0.24, 0.40, 0.21]);
        }
      })();

      for (let j = 0; j < 4; j++) {
        const avS = 0.45 + j * 0.01;
        tree(K(avS), -1, 20 + j * 8, 7, [0.20, 0.40, 0.18]);
        tree(K(avS),  1, 20 + j * 8, 7, [0.20, 0.40, 0.18]);
      }

      for (let i = 0; i < 28; i++) {
        const k = K(i / 28);
        const side = (i % 2) ? 1 : -1;
        const h = 8 + hash(i * 7 + 180) * 8;
        const w = 90 + hash(i * 11 + 180) * 50;
        backdrop(k, side, 180 + hash(i * 5) * 40,
          [w, h, 24],
          [MARSH_N[0], MARSH_N[1], MARSH_N[2]]);
      }
      for (let i = 0; i < 18; i++) {
        const k = K(i / 18 + 0.028);
        const side = (i % 2) ? -1 : 1;
        const h = 10 + hash(i * 13 + 240) * 8;
        const w = 110 + hash(i * 17 + 240) * 50;
        backdrop(k, side, 240 + hash(i * 19) * 40,
          [w, h, 28],
          [0.26, 0.40, 0.22]);
      }
    };
