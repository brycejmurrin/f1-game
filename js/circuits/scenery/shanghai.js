/* Apex 26 — SHANGHAI scenery (data only), split out of js/circuits/shanghai.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["shanghai"] =
  function (api) {
      const { out, track, n, px, pz, py, hw, pyMin, hash, vadd,
        place, prop, backdrop, groundYAt, anchor, addBox, addCyl, addCone, seat,
        addFrustum, addPrism, addPyramid, along, every,
        building, motorhome, tower, cityFront, grandstand, grandstandEx, billboard, gantry, marshalPost,
        wall, fence, guardrail, tyreWall, tree, bush, hedge, pine, palm, recordBarrier,
        forestEdge, cross, norm, MAT, runoffApron, modelGroup, overheadSpan, onTrack,
        waterSurface, groundPatch, sailCanopy, terrainYAt, frameAt,
        cameraTower, broadcastCompound, sponsorHoarding,
        groundUnder,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      {
        const BUND   = [0.44, 0.38, 0.28];
        const PADDY  = [0.36, 0.44, 0.34];   // green shoots standing in water
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
          // A block of 2x3 paddies, each one a flooded rectangle in its bund.
          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 3; c++) {
              const hv = hash(kk * 29 + r * 17 + c * 11);
              const p = vadd(vadd(a0.c, a0.r, r * 26), a0.t, (c - 1) * 30);
              if (onTrack(p[0], p[2], 20)) continue;
              const jit = (hash(kk * 61 + r * 23 + c * 37) - 0.5) * 0.24;
              // Raised bund frame — the paddy sits INSIDE it, slightly sunk.
              addBox(out, vadd(p, a0.u, 0.28 + jit), [24 + jit * 4, 0.56, 28 - jit * 3], BUND, b);
              if (hv < 0.22) {
                // Fallow / drained paddy: bare worked earth, no water.
                addBox(out, vadd(p, a0.u, 0.34 + jit), [21, 0.16, 25], FALLOW, b);
              } else {
                if (r === 0 && c === 1) {
                  waterSurface(kk, side, gap - 0.5, [21, 0.14, 25],
                               [0.30, 0.38, 0.40],
                               { id: `shanghai-paddy-${Math.round(sf * 1000)}` });
                } else {
                  addBox(out, vadd(p, a0.u, 0.30 + jit), [21, 0.12, 25],
                         [0.28, 0.36, 0.38], b);
                }
                out._mat = MAT.FOLIAGE;
                addBox(out, vadd(p, a0.u, 0.62 + jit), [20 + jit * 3, 0.42, 24 - jit * 4],
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

      const sailRow = (s0, s1, side, dist, count, opts) => {
        opts = opts || {};
        const rx = opts.rx || 15, rz = opts.rz || 9, h = opts.h || 15;
        const col = opts.col || [0.90, 0.91, 0.92];
        for (let i = 0; i < count; i++) {
          const s = s0 + (i + 0.5) / count * (s1 - s0);
          const a = anchor(K(s), side, dist);
          sailCanopy(a.c, [a.r, a.u, a.t], { rx, rz, h, col, ribs: 8, thick: 0.65 });
        }
      };

      const CONC  = [0.70, 0.72, 0.74];
      const WHITE = [0.90, 0.91, 0.92];
      const STEEL = [0.62, 0.64, 0.67];
      const SEAT  = [0.40, 0.42, 0.46];
      const DARK  = [0.30, 0.32, 0.36];
      const PALE  = [0.58, 0.58, 0.60];   // Tilke asphalt runoff — cockpit-readable
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
      const KERB_R = [0.80, 0.16, 0.14];
      const KERB_W = [0.90, 0.90, 0.90];
      // Pearl Tower salmon-pink terracotta
      const PEARL = [0.78, 0.62, 0.58];
      // Lit window colours (warm cream — simulate emissive fill from indoor daylight)
      const WIN_LIT   = [0.96, 0.92, 0.78];  // warm cream for prominent buildings
      const WIN_TOWER = [0.88, 0.90, 0.96];  // cooler blue-white for glass towers
      // Lamp post warm sodium glow (very bright amber for day-lit contrast)
      const LAMP_GLOW = [0.98, 0.86, 0.52];

      (function pitBuilding() {
        const GAR = 9;
        for (let i = 0; i < GAR; i++) {
          const s = 0.004 + (i + 0.5) / GAR * 0.052;
          const aB = anchor(K(s), -1, 11), bB = [aB.r, aB.u, aB.t];
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(aB.c, aB.u, 4.2), [16, 8.4, 15.4], WHITE, bB);
          const aD = anchor(K(s), -1, 2.4), bD = [aD.r, aD.u, aD.t];
          for (const off of [-5.2, 0, 5.2])
            addBox(out, vadd(vadd(aD.c, aD.u, 2.3), aD.t, off), [0.5, 4.4, 3.8], DARK, bD);
          out._mat = MAT.METAL;
          addBox(out, vadd(aD.c, aD.u, 7.0), [8, 0.5, 15.8], [0.84, 0.86, 0.89], bD);
          out._mat = 0;
          // Glazed hospitality storey set back above the garage roof.
          const aG = anchor(K(s), -1, 13), bG = [aG.r, aG.u, aG.t];
          addBox(out, vadd(aG.c, aG.u, 10.5), [11, 3.8, 14.8], GLASS_HAZE, bG);
          out._mat = MAT.METAL;
          for (const [d, y, w] of [[6, 12.8, 8], [13, 13.9, 8], [20, 15.2, 8], [27, 16.7, 8]]) {
            const aW = anchor(K(s), -1, d);
            addBox(out, vadd(aW.c, aW.u, y), [w, 0.55, 15.6], WHITE, [aW.r, aW.u, aW.t]);
          }
          out._mat = 0;
        }

        waterSurface(K(0.020), -1, 24, [26, 0.18, 40], WATER,
          { id: "shanghai-pit-lagoon-a" });
        waterSurface(K(0.040), -1, 24, [20, 0.18, 30], WATER,
          { id: "shanghai-pit-lagoon-b" });

        const sp = anchor(K(0.030), -1, 26), bs = [sp.r, sp.u, sp.t];
        out._mat = MAT.CONCRETE;
        addBox(out, vadd(sp.c, sp.u, 12.0), [30, 5.6, 15], [0.88, 0.89, 0.91], bs);
        out._mat = 0;
        addBox(out, vadd(sp.c, sp.u, 9.6), [29, 1.8, 15.4], GLASS_HAZE, bs);
        out._mat = MAT.METAL;
        addBox(out, vadd(sp.c, sp.u, 15.1), [33, 0.7, 17], WHITE, bs);
        // Colonnade standing in the lagoon — the spine is a bridge, not a berm.
        for (const d of [18, 26, 34, 40]) {
          const aC = anchor(K(0.030), -1, d), bC = [aC.r, aC.u, aC.t];
          for (const off of [-5.5, 5.5])
            seat.cyl(out, vadd(aC.c, aC.t, off), 0.5, 9.2, STEEL, 8, bC);
        }
        out._mat = 0;

        for (let i = 0; i < 3; i++) {
          const a = anchor(K(0.016 + i * 0.014), -1, 46), b = [a.r, a.u, a.t];
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(a.c, a.u, 5.5), [15, 11, 17], [0.84, 0.86, 0.88], b);
          out._mat = 0;
          addBox(out, vadd(a.c, a.u, 7.4), [15.4, 2.4, 16], WIN_TOWER, b);
          out._mat = MAT.METAL;
          addBox(out, vadd(a.c, a.u, 11.6), [18, 0.6, 18], WHITE, b);
          out._mat = 0;
        }
      })();
      building(K(0.98), -1, 14, 16, 11, 55,
        { kind: "slab", wall: [0.84, 0.85, 0.87], window: WIN_LIT, floor: 3 });

      (function twinWings() {
        // Long white main stand (L) — simple raked tiers, flat roof, no cantilever clutter
        for (let i = 0; i < 7; i++) {
          const s = 0.012 + i * 0.011;
          const a = anchor(K(s), -1, 20), b = [a.r, a.u, a.t];
          addBox(out, vadd(vadd(a.c, a.u, 5), a.r, 6), [14, 10, 15], SEAT, b);
          addBox(out, vadd(vadd(a.c, a.u, 7.5), a.r, 1), [14, 2.6, 5], CROWD, b);
          addBox(out, vadd(vadd(a.c, a.u, 8), a.r, 14), [14, 16, 2.5], CONC, b);
          addBox(out, vadd(vadd(a.c, a.u, 16.5), a.r, 4), [14.5, 1.1, 20], WHITE, b);
          for (const tOff of [-6, 0, 6])
            seat.cyl(out, vadd(vadd(a.c, a.t, tOff), a.r, -3), 0.35, 16.2, STEEL, 6, b);
        }

        for (const [id, sLap, hgt, deckD, col] of [
          ["shanghai-wing-east", 0.004, 38, 8.0, WHITE],
          ["shanghai-wing-west", 0.022, 36, 7.0, [0.86, 0.88, 0.90]],
        ]) {
          const aL = anchor(K(sLap), -1, 20), bL = [aL.r, aL.u, aL.t];
          const aR = anchor(K(sLap),  1, 20), bR = [aR.r, aR.u, aR.t];
          const span = Math.hypot(
            aR.c[0] - aL.c[0], aR.c[1] - aL.c[1], aR.c[2] - aL.c[2]
          );

          const deckTopY = frameAt(sLap).c[1] + hgt + 0.5;
          for (const tOff of [-2.4, 2.4]) {
            seat.cyl(out, vadd(aL.c, aL.t, tOff), 0.45, deckTopY - aL.c[1], STEEL, 6, bL);
            seat.cyl(out, vadd(aR.c, aR.t, tOff), 0.45, deckTopY - aR.c[1], STEEL, 6, bR);
          }

          overheadSpan({
            id, frac: sLap, clearance: hgt, thickness: 1.15, depth: deckD,
            span: span + 1, color: col, supportGap: 20, required: true,
          });
        }
      })();

      building(K(0.042), -1, 70, 20, 28, 34, {
        kind: "cylinder", wall: CONC, window: WIN_TOWER, floor: 5, lit: true,
      });
      building(K(0.072), -1, 76, 20, 20, 38, {
        kind: "notch", wall: [0.82, 0.84, 0.86], window: WIN_LIT, floor: 4, lit: true,
      });

      // Start gantry over the line.
      gantry(0.004, 9, STEEL);

      wall(0.965, 0.05, 1, 6, 1.1, WHITE);
      place(K(0.99), 1, 10, [5, 2.4, 12], CONC);
      place(K(0.99), 1, 10, [5, 0.6, 12], RED);

      broadcastCompound(K(0.975), 1, 30, { vans: 3, dishes: 2, mastH: 10 });

      along(0.00, 0.04, 18, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 12), b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.1, 9.0, STEEL, 5, b);
          addBox(out, vadd(a.c, a.u, 9.1), [0.5, 0.25, 0.5], LAMP_GLOW, b);
        }
      });

      waterSurface(K(0.88), -1,  95, [180, 0.18, 130], WATER,
        { id: "shanghai-yu-lake-south", required: true });
      waterSurface(K(0.01), -1, 98, [28, 0.18, 110], WATER,
        { id: "shanghai-yu-lake-north", required: true });
      place(K(0.90), -1,  85, [10, 1.0, 5], CONC);
      place(K(0.02), -1, 115, [11, 0.9, 5], [0.65, 0.68, 0.72]);
      waterSurface(K(0.62), -1, 120, [70, 0.18, 80], [0.36, 0.48, 0.56],
        { id: "shanghai-marsh-pool", required: true });

      (function yuGarden() {
        const pavilions = [
          [0.885, -1, 100, 10, 5.0, 8],
          [0.905, -1, 118,  8, 4.5, 7],
          [0.925, -1,  98,  9, 5.5, 8],
          [0.955, -1, 112,  8, 4.0, 7],
          [0.985, -1, 108, 11, 5.5, 9],
          [0.010, -1, 122,  9, 5.0, 8],
          [0.025, -1, 105,  8, 4.2, 7],
          [0.040, -1, 128, 10, 5.5, 8],
        ];
        for (const [s, sd, d, w, h, len] of pavilions) {
          const a = anchor(K(s), sd, d), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, h * 0.5), [w, h, len], WHITE, b);
          seat.prism(out, vadd(a.c, a.u, h), [w * 1.2, 2.2, len * 1.2], RED, b);
          // Tiny lit window band
          addBox(out, vadd(vadd(a.c, a.u, h * 0.55), a.r, w * 0.48),
                 [0.35, h * 0.35, len * 0.55], WIN_LIT, b);
        }
      })();

      grandstandEx(0.032, -1, 20, 28, null, null,
        { livery: "darkSteel", roof: "cantilever", endWalls: true });
      grandstandEx(0.052, -1, 24, 28, null, null,
        { livery: "alu", roof: "flat", pylons: true });
      billboard(K(0.045), -1, 14, 16, 4.5, YELLOW);

      (function snailRunoff() {
        // Stepped apron pads outside the decreasing-radius right — spiral read at speed
        const pads = [
          [0.050,  1, 3.5, [22, 0.32, 38]],
          [0.058,  1, 4.5, [28, 0.32, 44]],
          [0.068,  1, 6.0, [34, 0.32, 50]],
          [0.078,  1, 8.0, [30, 0.32, 42]],
          [0.088,  1, 10,  [26, 0.32, 36]],
          [0.098,  1, 12,  [22, 0.32, 30]],
          [0.108,  1, 14,  [18, 0.32, 26]],
          [0.072, -1, 4.0, [14, 0.30, 28]],
          [0.090, -1, 5.5, [16, 0.30, 24]],
        ];
        for (const [s, sd, gap, sz] of pads) {
          runoffApron(K(s), sd, gap, sz, PALE);
        }
        // Stronger red/white kerb + verge rhythm through the coil
        let j = 0;
        along(0.048, 0.112, 2.6, (k) => {
          place(k, 1, 2.4, [1.8, 0.26, 2.6], (j++) % 2 ? KERB_R : KERB_W);
        });
        along(0.055, 0.100, 5.5, (k) => {
          place(k, 1, 3.8, [1.2, 0.35, 2.2], CONC);
        });
      })();
      grandstandEx(0.05,  1, 95, 30, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      grandstandEx(0.085, 1, 85, 28, null, null,
        { livery: "crimson", roof: "flat" });
      grandstandEx(0.10,  -1, 45, 28, null, null,
        { livery: "alu", roof: "truss", pylons: true });
      grandstandEx(0.13,  1, 72, 26, null, null,
        { livery: "crimson", roof: "cantilever", endWalls: true });
      grandstandEx(0.064, 1, 112, 28, null, null,
        { livery: "alu", roof: "none" });
      grandstandEx(0.098, 1, 104, 30, null, null,
        { livery: "darkSteel", roof: "none", endWalls: true });

      const lotusTerrace = (id, s, side, gap, bays) => {
        const pitch = 11, len = bays * pitch;
        const a = anchor(K(s), side, gap + 6), b = [a.r, a.u, a.t];
        const IN = -side;                     // +1 along a.r points back at the track
        const half = (len / 2) / track.total;
        recordBarrier(s - half, s + half, side, gap);
        modelGroup(id, {
          center: vadd(a.c, a.u, 8),
          size: [16, 18, len + 6],
          basis: b,
        }, (stage) => {
          for (let t = 0; t < 5; t++) {
            const lat = IN * (5.0 - t * 2.0), y = t * 1.55;
            stage._mat = MAT.CONCRETE;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [2.0, 1.55, len],
              t % 2 ? CONC : [0.66, 0.68, 0.70], b);
            stage._mat = MAT.FABRIC;
            // Spectators, not an empty frame: an unpeopled bespoke stand next to
            // grandstandEx's packed rake is the one thing this form must avoid.
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
              seat.cyl(stage, vadd(c, a.r, IN * lean * 1.9), 0.28, 11.4, STEEL, 6, b);
            stage._mat = 0;
            const hub = vadd(c, a.u, 11.4);
            addCone(stage, hub, 7.1, 2.6, WHITE, 10, b);          // petal shell
            addFrustum(stage, vadd(hub, a.u, -0.4), 7.15, 7.15, 0.4, RED, 10, b);  // rim
          }
        });
      };
      lotusTerrace("shanghai-lotus-t2", 0.115, -1, 42, 3);
      lotusTerrace("shanghai-lotus-t3", 0.142, -1, 50, 3);
      billboard(K(0.07),  1, 56, 16, 5, YELLOW);
      billboard(K(0.095), 1, 44, 16, 5, RED);
      marshalPost(K(0.08), -1, 14);

      for (const [s, side, dist, rx, rz] of [
        [0.050,  1, 106, 18, 10],
        [0.085,  1,  96, 17, 10],
        [0.115, -1,  53, 16,  9],
      ]) {
        const a = anchor(K(s), side, dist);
        sailCanopy(a.c, [a.r, a.u, a.t], {
          rx, rz, h: 15, col: WHITE, ribs: 8, thick: 0.65,
        });
      }

      const fanTerraces = (spots) => {
        for (const [s, side, dist] of spots) {
          const a = anchor(K(s), side, dist), b = [a.r, a.u, a.t];
          for (let i = 0; i < 6; i++) {
            const c = vadd(vadd(a.c, a.t, (i - 2.5) * 7), a.u, 1.4);
            addBox(out, c, [7.5, 2.8, 4.8],
              i % 3 === 0 ? RED : (i % 3 === 1 ? YELLOW : CROWD), b);
          }
        }
      };
      fanTerraces([
        [0.060, 1, 120],   // snail (existing)
        [0.098, 1, 110],   // snail (existing)
        [0.470, 1,  58],   // mid-sector run
        [0.800, 1,  74],   // back-straight run
        [0.905, -1, 60],   // T14 hairpin
      ]);

      (function pudongCluster() {
        const a = anchor(K(0.30), -1, 300), b = [a.r, a.u, a.t];
        const u = b[1];

        for (let i = 0; i < 11; i++) {
          const off   = (i - 5) * 30 + (hash(i * 5) - 0.5) * 12;
          const depth = 40 + hash(i * 7) * 50;
          const h     = 55 + hash(i * 11) * 70;
          const w     = 14 + hash(i * 13) * 10;
          const base = vadd(vadd(a.c, a.r, off), a.t, depth);
          const gy = groundUnder(base[0], base[2]);
          if (gy !== null) base[1] = gy;
          addFrustum(out, vadd(base, u, 0),
                     w / 2, w / 3.8, h, GLASS_HAZE, 5, b);
        }

        // Soft local backdrop band, farther and sky-haze tinted.
        for (let i = 0; i < 12; i++) {
          const k2 = K(0.25 + i / 12 * 0.12);
          const h   = 50 + hash(i * 19 + 100) * 70;
          const w   = 22 + hash(i * 23 + 100) * 16;
          backdrop(k2, -1, 220 + hash(i * 11) * 50,
            [w, h, 26],
            [SKY_HAZE[0], SKY_HAZE[1], SKY_HAZE[2]]);
        }

        const pc = vadd(vadd(a.c, a.r, -2), a.t, 50);
        const stC = vadd(vadd(a.c, a.r, 55), a.t, 55);
        const jmC = vadd(vadd(a.c, a.r, -32), a.t, 50);
        const swC = vadd(vadd(a.c, a.r, 26), a.t, 63);
        const heroCenter = vadd(vadd(a.c, a.r, 12), a.t, 52);
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

          // Oriental Pearl tripod, observation spheres, connector, and spire.
          const legH = 48, legR = 2.2, legCol = [0.74, 0.72, 0.70];
          for (const [ro, to] of [[-10, 0], [5, -9], [5, 9]])
            cyl(vadd(vadd(pc, a.r, ro), a.t, to), legR, legH, legCol, 8);
          frustum(pc, 14, 8, 8, [0.68, 0.66, 0.64], 12);

          const lSphBase = 54, lSphR = 15;
          frustum(vadd(pc, u, lSphBase), lSphR * 0.7, lSphR, 4, PEARL, 12);
          frustum(vadd(pc, u, lSphBase + 2), lSphR, lSphR, lSphR * 1.6, PEARL, 12);
          frustum(vadd(pc, u, lSphBase + lSphR * 1.6 + 2), lSphR, lSphR * 0.7, 4, PEARL, 12);
          frustum(vadd(pc, u, lSphBase + lSphR * 0.8),
            lSphR * 1.02, lSphR * 1.02, lSphR * 0.5, WIN_LIT, 12);

          const connBase = 84, connTop = 108;
          cyl(vadd(pc, u, connBase), 3.2, connTop - connBase, [0.80, 0.70, 0.66], 8);
          frustum(vadd(pc, u, connBase + (connTop - connBase) * 0.5 - 1),
            4.5, 4.5, 2.5, [0.74, 0.66, 0.62], 12);

          const uSphBase = connTop, uSphR = 10;
          frustum(vadd(pc, u, uSphBase), uSphR * 0.7, uSphR, 4, [0.80, 0.66, 0.60], 10);
          frustum(vadd(pc, u, uSphBase + 2), uSphR, uSphR, uSphR * 1.6, [0.82, 0.68, 0.62], 10);
          frustum(vadd(pc, u, uSphBase + uSphR * 1.6 + 2),
            uSphR, uSphR * 0.7, 4, [0.80, 0.66, 0.60], 10);
          frustum(vadd(pc, u, uSphBase + uSphR * 0.8),
            uSphR * 1.03, uSphR * 1.03, uSphR * 0.4, WIN_LIT, 10);
          const spireBase = uSphBase + uSphR * 1.6 + 6;
          cyl(vadd(pc, u, spireBase), 0.9, 32, [0.88, 0.78, 0.72], 6);
          cone(vadd(pc, u, spireBase + 32), 0.9, 12, [0.90, 0.82, 0.76], 6);

          // Shanghai Tower and Jin Mao complete the compact three-tower cue.
          frustum(stC, 11, 6.5, 80, GLASS_HAZE, 6);
          frustum(vadd(stC, u, 80), 6.5, 3.2, 60, [0.62, 0.68, 0.74], 6);
          frustum(vadd(stC, u, 140), 3.2, 1.0, 30, [0.66, 0.72, 0.78], 6);
          box(vadd(stC, u, 172), [2.5, 22, 2.5], STEEL);
          frustum(jmC, 9.5, 7, 55, [0.70, 0.69, 0.68], 8);
          frustum(vadd(jmC, u, 55), 7, 4.5, 35, [0.72, 0.71, 0.70], 8);
          frustum(vadd(jmC, u, 90), 4.5, 1.8, 20, [0.74, 0.73, 0.72], 8);
          cyl(vadd(jmC, u, 110), 0.7, 18, STEEL, 5);

          frustum(swC, 10, 7, 114, [0.58, 0.66, 0.74], 6);
          box(vadd(vadd(swC, u, 132), a.r, -5), [4, 36, 11], GLASS);
          box(vadd(vadd(swC, u, 132), a.r,  5), [4, 36, 11], GLASS);
          box(vadd(swC, u, 149), [14, 3, 11], STEEL);
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

      // Primary backdrop identity: reclaimed marsh campus, not wraparound towers.
      for (let i = 0; i < 10; i++) {
        const k = K(0.56 + i * 0.012);
        const h = 6 + hash(i * 7) * 8;
        const w = 55 + hash(i * 11) * 55;
        backdrop(k, -1, 85 + hash(i * 5) * 45, [w, h, 24], MARSH_N);
      }
      groundPatch(K(0.62), -1, 18, [95, 0.24, 130], MARSH,
        { id: "shanghai-marsh-shelf", samples: 8 });
      hedge(0.58, 0.66, -1, 24, 3.5, MARSH_N);
      // Extra marsh strip along the long back-straight infield so open space reads
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

      fence(0.72, 0.88, 1, 8, 3.0, [0.70, 0.72, 0.76]);
      billboard(K(0.76), 1, 10, 18, 5, RED);
      billboard(K(0.82), 1, 10, 18, 5, YELLOW);
      billboard(K(0.79), 1, 10, 18, 5, RED);
      marshalPost(K(0.80), 1, 14);
      marshalPost(K(0.74), 1, 12);
      grandstandEx(0.755, 1, 38, 34, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.775, 1, 62, 30, null, null,
        { livery: "darkSteel", roof: "none" });
      grandstandEx(0.80,  1, 38, 34, null, null,
        { livery: "alu", roof: "truss", pylons: true });
      grandstandEx(0.823, 1, 62, 30, null, null,
        { livery: "crimson", roof: "flat", endWalls: true });
      grandstandEx(0.845, 1, 38, 32, null, null,
        { livery: "darkSteel", roof: "flat", endWalls: true });
      grandstandEx(0.865, 1, 58, 28, null, null,
        { livery: "alu", roof: "cantilever" });

      // Sail canopy motif carried onto the back straight's stand run.
      sailRow(0.750, 0.870, 1, 50, 4, { rx: 15, rz: 9, h: 15, col: [0.88, 0.89, 0.91] });
      // sparse low shrub clumps on the verge (were 0.9 m green box slabs)
      for (let i = 0; i < 4; i++) {
        bush((K(0.74) + i * Math.round(n * 0.014)) % n, 1, 36 + i * 8, MARSH);
      }

      // Lamp posts along the back straight (one side, at regular intervals)
      along(0.72, 0.88, 35, (k) => {
        const a = anchor(k, -1, 14), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.12, 9.5, STEEL, 5, b);
        addBox(out, vadd(a.c, a.u, 9.6), [0.55, 0.28, 0.55], LAMP_GLOW, b);
      });

      grandstandEx(0.88,  -1, 24, 30, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      grandstandEx(0.892, -1, 48, 28, null, null,
        { livery: "crimson", roof: "none" });
      grandstandEx(0.905, -1, 28, 32, null, null,
        { livery: "alu", roof: "truss", pylons: true });
      grandstandEx(0.918, -1, 52, 28, null, null,
        { livery: "darkSteel", roof: "flat", pylons: true });
      grandstandEx(0.93,  -1, 30, 28, null, null,
        { livery: "crimson", roof: "flat", endWalls: true });
      for (const [s, dist, rx] of [
        [0.880, 35, 16],
        [0.905, 39, 17],
        [0.930, 41, 15],
      ]) {
        const a = anchor(K(s), -1, dist);
        sailCanopy(a.c, [a.r, a.u, a.t], {
          rx, rz: 9, h: 15, col: [0.88, 0.89, 0.91], ribs: 8, thick: 0.65,
        });
      }
      // big pale runoff apron at the hairpin
      runoffApron(K(0.90), 1, 4, [40, 0.35, 55], PALE);
      marshalPost(K(0.90), 1, 14);

      (function lakeBoardwalk() {
        const a = anchor(K(0.915), -1, 112), b = [a.r, a.u, a.t];
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
        [0, 0.885, 122, [18, 0.24, 24]],
        [1, 0.905, 142, [14, 0.24, 19]],
        [2, 0.945, 118, [16, 0.24, 21]],
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

      // Low commercial strips — kept short so they don't fight the marsh/Pudong read
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
      cityFront(0.36, 0.56, 1, 82, {
        minH: 18, maxH: 46, depth: 24,
        palette: [[0.72, 0.75, 0.80], [0.66, 0.70, 0.76], CONC],
        lit: true, windowCol: WIN_TOWER,
        step: 54,
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

      // Tyre walls protecting the heavy corners.
      tyreWall(0.885, 0.915, 1, 4, RED);
      tyreWall(0.06,  0.09,  1, 4, YELLOW);
      tyreWall(0.305, 0.325, -1, 10, RED);

      // Low red/white kerb-edge markers — denser through the snail coil.
      (function kerbs() {
        const spots = [
          [0.048, 0.112,  1], [0.070, 0.095, -1], [0.30, 0.32, -1],
          [0.46,  0.48,   1], [0.595, 0.61, -1], [0.895, 0.915, 1],
        ];
        for (const [s0, s1, sd] of spots) {
          let j = 0;
          const step = (s0 < 0.15) ? 2.4 : 3.2;
          along(s0, s1, step, (k) => {
            place(k, sd, 2.8, [1.6, 0.24, 2.6], (j++) % 2 ? KERB_R : KERB_W);
          });
        }
      })();

      // Marshal posts + extra billboards spread around the lap.
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
          [0.045, -1, 18], [0.06,  1, 70], [0.46, 1, 16],
          [0.80,   1, 22], [0.905,-1, 20], [0.10,-1, 30],
        ];
        for (const [s, sd, d] of spots) {
          const a = anchor(K(s), sd, d), b = [a.r, a.u, a.t];
          for (let i = 0; i < 5; i++) {
            const off = (i - 2) * 12;
            addBox(out, vadd(vadd(vadd(a.c, a.t, off), a.u, 2.45), a.r, 2),
                   [9, 4.9, 5], [0.42, 0.43, 0.47], b);
            addBox(out, vadd(vadd(vadd(a.c, a.t, off), a.u, 6), a.r, 2),
                   [9, 2.2, 5], i % 2 ? CROWD : [0.50, 0.34, 0.40], b);
          }
        }
      })();

      hedge(0.90, 0.95, -1, 42, 3.0, TREE_G);
      for (let i = 0; i < 4; i++) {
        tree(K(0.90 + i * 0.012), -1, 42 + (i % 2) * 6, 7 + hash(i) * 3, TREE_G);
      }
      for (let i = 0; i < 5; i++) {
        palm(K(0.92 + i * 0.010), -1, 65, 6 + hash(i * 3) * 2, [0.30, 0.46, 0.26]);
      }
      // pines lining the back straight verge
      for (let i = 0; i < 8; i++) {
        pine(K(0.72 + i * 0.018), 1, 58 + (i % 2) * 5, 8 + hash(i * 5) * 4, TREE_G);
      }

      (function formalGardens() {
        const topiaryFracs = [0.060, 0.090, 0.120];
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
