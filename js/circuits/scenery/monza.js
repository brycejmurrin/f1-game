"use strict";
(window.TrackScenery = window.TrackScenery || {})["monza"] =
  function (api) {
      const { K, lapBounds, out, MAT, n, ds, pyMin, prop, every,
        onTrack, hash, pine, tree, bush, hedge, ridge, building, motorhome, tower,
        cypress, stonePine, tieredBowl,
        grandstandEx, spectatorHill, broadcastCompound, billboard, gantry, marshalPost,
        wall, fence, guardrail, tyreWall,
        addBox, addCyl, addPrism, anchor, along, vadd,
        modelGroup, overheadSpan, waterSurface, waterBand, groundPatch, groundedSegments,
        terrainYAt,
        bakedModel } = api;

      {
        const BRICK = [0.56, 0.40, 0.32];
        const CAP   = [0.70, 0.68, 0.62];
        for (const [s0, s1, side, gap] of [
          [0.100, 0.235, -1, 68],
          [0.415, 0.545,  1, 74],
          [0.640, 0.780, -1, 62],
        ]) {
          wall(s0, s1, side, gap, 2.6, BRICK, 0.55, 0.08);
          const span = (s1 - s0 + 1) % 1;
          const count = Math.max(3, Math.round(span * n * ds / 34));
          for (let i = 0; i <= count; i++) {
            const a = anchor(K((s0 + span * (i / count)) % 1), side, gap);
            if (onTrack(a.c[0], a.c[2], 20)) continue;
            const b = [a.r, a.u, a.t];
            out._mat = MAT.STONE;
            addBox(out, vadd(a.c, a.u, 1.55), [0.95, 3.1, 1.1], BRICK, b);
            addBox(out, vadd(a.c, a.u, 3.25), [1.15, 0.3, 1.3], CAP, b);
            out._mat = 0;
          }
        }
        {
          const a = anchor(K(0.172), -1, 68);
          if (!onTrack(a.c[0], a.c[2], 22)) {
            const b = [a.r, a.u, a.t];
            const STONE = [0.80, 0.77, 0.70];
            modelGroup("monza-park-gate", {
              center: vadd(a.c, a.u, 3.2), size: [3, 9, 16], basis: b,
            }, (stage) => {
              stage._mat = MAT.STONE;
              for (const t of [-5.2, 5.2]) {
                addBox(stage, vadd(vadd(a.c, a.t, t), a.u, 2.6), [1.3, 5.2, 1.5], STONE, b);
                addBox(stage, vadd(vadd(a.c, a.t, t), a.u, 5.45), [1.6, 0.5, 1.8], CAP, b);
                addBox(stage, vadd(vadd(a.c, a.t, t), a.u, 6.1), [0.7, 0.9, 0.8], STONE, b);
              }
              stage._mat = MAT.METAL;
              for (const [t, sgn] of [[-3.6, -1], [3.6, 1]]) {
                for (let r = 0; r < 7; r++) {
                  addCyl(stage, vadd(vadd(vadd(a.c, a.t, t + sgn * r * 0.42),
                                            a.r, -r * 0.16), a.u, 0),
                         0.045, 3.4, [0.18, 0.19, 0.20], 4, b);
                }
              }
              stage._mat = 0;
            });
          }
        }
      }

      const PINE_D = [0.08, 0.26, 0.12], PINE = [0.10, 0.30, 0.14], PINE_L = [0.13, 0.34, 0.17];
      const LEAF = [0.18, 0.45, 0.20], LEAF_L = [0.24, 0.50, 0.24], LEAF_D = [0.15, 0.38, 0.18];
      const GRAVEL = [0.68, 0.60, 0.42];

      const openParkland = (s) =>
        (s >= 0.19 && s <= 0.28) || (s >= 0.36 && s <= 0.42) || (s >= 0.58 && s <= 0.66);
      const flyoverClear = (s) => s >= 0.685 && s <= 0.775;
      const curvaGrandeHedge = (s) => s >= 0.06 && s <= 0.18;
      const parabolicaStandClear = (s) => s >= 0.74 && s <= 0.88;
      every(24, (k) => {
        const h = hash(k * 31);
        const s = k / n;
        if (flyoverClear(s) || curvaGrandeHedge(s)) return;
        const thin = openParkland(s);
        if (h < (thin ? 0.78 : 0.08)) return;
        const side = h < 0.5 ? -1 : 1;
        stonePine(k, side, 10 + h * 6, 15 + h * 6, h < 0.3 ? PINE_D : PINE,
                  { spread: 0.68 + h * 0.14, lean: 0.3 });
        if (!thin && h > 0.25)
          stonePine(k, -side, 11 + h * 7, 14 + h * 6, PINE, { spread: 0.70, lean: 0.25 });
      });
      every(28, (k) => {
        const h = hash(k * 53 + 9);
        const s = k / n;
        if (flyoverClear(s) || curvaGrandeHedge(s)) return;
        const thin = openParkland(s);
        if (h < (thin ? 0.80 : 0.15)) return;
        const side = h < 0.5 ? -1 : 1;
        tree(k, side, 12 + h * 8, 11 + h * 8, h < 0.4 ? LEAF_D : LEAF);
        if (!thin && h > 0.48) tree(k, -side, 13 + h * 9, 10 + h * 7, LEAF_L);
      });
      every(36, (k) => {
        const h = hash(k * 41 + 3);
        const s = k / n;
        if (flyoverClear(s) || parabolicaStandClear(s)) return;
        const thin = openParkland(s);
        if (h < (thin ? 0.82 : 0.20)) return;
        const side = h < 0.5 ? -1 : 1;
        const hVar = 22 + h * 16 + (hash(k * 137) > 0.6 ? 4 : 0);
        const parabolica = s >= 0.80 && s <= 0.96;
        if (parabolica) {
          stonePine(k, side, 24 + h * 18, 16 + h * 6, PINE_D, { spread: 0.74, lean: 0.22 });
          if (!thin && h > 0.55)
            stonePine(k, -side, 30 + h * 16, 15 + h * 6, PINE_D, { spread: 0.70, lean: 0.18 });
        } else {
          pine(k, side, 24 + h * 18, hVar, PINE_D);
          if (!thin && h > 0.55) pine(k, -side, 30 + h * 16, 24 + h * 14, PINE_D);
        }
      });
      every(55, (k) => {
        const h = hash(k * 67 + 17);
        const s = k / n;
        if (flyoverClear(s) || parabolicaStandClear(s)) return;
        const thin = openParkland(s);
        if (h < (thin ? 0.85 : 0.35)) return;
        tree(k, h < 0.5 ? -1 : 1, 42 + h * 30, 13 + h * 10, LEAF_D);
        if (!thin && h > 0.7) tree(k, h > 0.85 ? -1 : 1, 55 + h * 22, 11 + h * 8, LEAF);
      });
      every(24, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.50) return;
        const s = k / n;
        if (flyoverClear(s) || curvaGrandeHedge(s)) return;
        bush(k, h < 0.77 ? -1 : 1, 6.5 + h * 4,
             h < 0.66 ? [0.16, 0.36, 0.16] : [0.20, 0.42, 0.18]);
        if (h > 0.82) bush(k, h > 0.91 ? -1 : 1, 5 + h * 3, [0.18, 0.40, 0.17]);
      });
      every(20, (k) => {
        const s = k / n;
        if (s < 0.685 || s > 0.775) return;
        const h = hash(k * 211 + 3);
        if (h < 0.35) return;
        pine(k, -1, 100 + h * 28, 22 + h * 14, PINE_D);
        if (h > 0.55) pine(k, 1, 48 + h * 20, 18 + h * 12, PINE);
      });

      hedge(0.06, 0.18, -1, 20, 6, [0.12, 0.33, 0.16]);
      hedge(0.06, 0.18,  1, 21, 6, [0.12, 0.33, 0.16]);
      hedge(0.32, 0.46, -1, 22, 5, [0.13, 0.34, 0.17]);
      hedge(0.66, 0.78,  1, 22, 5, [0.13, 0.34, 0.17]);
      hedge(0.82, 0.94, -1, 24, 5, [0.12, 0.33, 0.16]);
      hedge(0.19, 0.215, -1, 18, 4.5, [0.13, 0.35, 0.17]);
      hedge(0.245, 0.27, -1, 18, 4.5, [0.13, 0.35, 0.17]);
      hedge(0.36, 0.42,  1, 22, 4.5, [0.13, 0.35, 0.17]);
      hedge(0.58, 0.66,  1, 24, 4.5, [0.13, 0.35, 0.17]);
      every(14, (k) => {
        const s = k / n;
        if (s < 0.43 || s > 0.54) return;
        const h = hash(k * 13 + 7);
        pine(k, -1, 12 + h * 2, 14 + h * 10, PINE_D);
        pine(k,  1, 11 + h * 2, 13 + h *  9, PINE);
        if (h > 0.55) tree(k, -1, 16 + h * 3, 13 + h * 9, LEAF_D);
        if (h > 0.70) tree(k,  1, 15 + h * 3, 12 + h * 8, LEAF);
      });

      {
        const a = anchor(K(0.005), -1, 22);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const b = [a.r, a.u, a.t];
          const GREY_A = [0.55, 0.58, 0.62], GREY_B = [0.50, 0.53, 0.58], GREY_C = [0.46, 0.49, 0.54];
          const RED_TRIM = [0.82, 0.14, 0.14];
          modelGroup("monza-tribuna-centrale", {
            center: vadd(a.c, a.u, 9), size: [18, 20, 140], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            const slabs = [
              [0.0,  16, 5.2, 132, GREY_A],
              [5.4,  14, 5.0, 120, GREY_B],
              [10.6, 12, 4.8, 108, GREY_C],
            ];
            for (const [y0, w, h, len, col] of slabs) {
              addBox(stage, vadd(vadd(a.c, a.r, -(16 - w) * 0.35), a.u, y0 + h * 0.5),
                [w, h, len], col, b);
            }
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.r, -7.2), a.u, 8.2),
              [0.55, 1.1, 118], RED_TRIM, b);
            addBox(stage, vadd(a.c, a.u, 16.0), [13.5, 0.7, 110], [0.72, 0.74, 0.78], b);
            addBox(stage, vadd(vadd(a.c, a.r, -6.5), a.u, 15.7),
              [0.4, 0.55, 108], RED_TRIM, b);
          }, { required: true });
        }
      }
      grandstandEx(0.005, -1, 18, 160, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.955, -1, 10, 110, null, null, { livery: "concrete", endWalls: true });
      grandstandEx(0.02, 1, 12, 120, null, null, { livery: "steel", endWalls: true });
      prop(K(0.01), -1, 8, [2, 1.6, 130], [0.80, 0.16, 0.14]);
      {
        const a = anchor(K(0.00), -1, 7.7);
        addBox(out, vadd(a.c, a.u, 0.25), [0.6, 0.9, 128], [0.30, 0.54, 0.28], [a.r, a.u, a.t]);
      }

      {
        const winLit = [0.98, 0.88, 0.52];
        const gsB = anchor(K(0.955), -1, 17.5);
        addBox(out, vadd(gsB.c, gsB.u, 10.0), [0.22, 1.4, 108], winLit, [gsB.r, gsB.u, gsB.t]);

        const gsC = anchor(K(0.02), 1, 19.5);
        addBox(out, vadd(gsC.c, gsC.u, 9.5), [0.22, 1.4, 118], winLit, [gsC.r, gsC.u, gsC.t]);
      }

      const pitWall = [0.86, 0.86, 0.84];
      for (let i = 0; i < 8; i++) {
        const s = 0.965 + i * 0.0085;
        building(K(s), 1, 14, 16, 9, 11,
          { kind: "chevron", wall: pitWall, window: [0.30, 0.34, 0.40], floor: 4.5, roof: true });
      }
      {
        const aPit = anchor(K(0.975), 1, 26);
        const b = [aPit.r, aPit.u, aPit.t];
        modelGroup("monza-pit-canopy", {
          center: vadd(aPit.c, aPit.u, 6.0),
          size: [5.4, 12, 40],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          for (const t of [-14, -5, 5, 14]) {
            const foot = vadd(aPit.c, aPit.t, t);
            addCyl(stage, foot, 0.35, 11.2, [0.72, 0.70, 0.68], 8, b);
          }
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aPit.c, aPit.u, 11), [5.2, 0.8, 40],
            [0.86, 0.84, 0.80], b);
          addBox(stage, vadd(aPit.c, aPit.u, 10.2), [4.8, 0.25, 38],
            [0.96, 0.88, 0.56], b);
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.0), 1, 36);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          const WHITE = [0.90, 0.90, 0.88], RED_CAP = [0.78, 0.14, 0.12];
          const GLASS = [0.55, 0.72, 0.88];
          const gy = terrainYAt(a.c[0], a.c[2]);
          const baseY = Number.isFinite(gy) ? gy : a.c[1];
          const base = [a.c[0], baseY, a.c[2]];
          modelGroup("monza-podium-tower", {
            center: vadd(base, a.u, 24), size: [8, 52, 8], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(base, a.u, 22), [5.6, 44, 5.6], WHITE, b);
            addBox(stage, vadd(base, a.u, 40), [4.8, 12, 4.8], WHITE, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(base, a.u, 36), [6.2, 3.2, 6.2], GLASS, b);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(base, a.u, 45.4), [6.4, 1.6, 6.4], RED_CAP, b);
            addCyl(stage, vadd(base, a.u, 45.0), 0.22, 9.5, [0.55, 0.56, 0.60], 5, b);
            addBox(stage, vadd(base, a.u, 54.2), [0.9, 0.6, 0.9], RED_CAP, b);
            stage._mat = 0;
          }, { required: true });
        }
      }
      {
        const aPod = anchor(K(0.0), 1, 32);
        if (!onTrack(aPod.c[0], aPod.c[2], 6)) {
          addBox(out, vadd(aPod.c, aPod.u, 1), [10, 0.8, 12], [0.88, 0.88, 0.90], [aPod.r, aPod.u, aPod.t]);
          addBox(out, vadd(aPod.c, aPod.u, 0.55), [1.2, 1.1, 20], [0.86, 0.86, 0.84],
            [aPod.r, aPod.u, aPod.t]);
        }
      }
      gantry(0.0, 9, [0.14, 0.14, 0.17]);
      gantry(0.98, 8.5, [0.14, 0.14, 0.17]);

      guardrail(0.93, 0.07, 1, 3.5, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 8, 4, [0.74, 0.76, 0.80]);
      for (const [s, side, gap] of [
        [0.94, -1, 12], [0.97, -1, 12], [0.015, -1, 14], [0.04, -1, 14],
        [0.95, 1, 26], [0.03, 1, 36],
      ]) {
        const a = anchor(K(s), side, gap);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        addBox(out, vadd(a.c, a.u, 0.4), [0.8, 0.8, 3.2], [0.55, 0.55, 0.52], [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 3.2), [0.35, 4.8, 10],
          side < 0 ? [0.92, 0.88, 0.30] : [0.88, 0.84, 0.80], [a.r, a.u, a.t]);
      }

      along(0.93, 0.07, 28, (k) => {
        for (const side of [-1, 1]) {
          const gap = side < 0 ? 6 : 5;
          const ap = anchor(k, side, gap);
          addCyl(out, ap.c, 0.12, 10, [0.18, 0.18, 0.20], 6, [ap.r, ap.u, ap.t]);
          if (addBox(out, vadd(vadd(ap.c, ap.u, 9.8), ap.r, side * 0.55), [1.1, 0.18, 0.18],
                 [0.18, 0.18, 0.20], [ap.r, ap.u, ap.t]) === false) continue;
          addBox(out, vadd(vadd(ap.c, ap.r, side * 0.9), ap.u, 9.65),
                 [1.0, 0.45, 0.55], [0.98, 0.94, 0.72], [ap.r, ap.u, ap.t]);
        }
      });

      groundPatch(K(0.099), 1, 5, [24, 0.18, 34], GRAVEL,
        { id: "monza-rettifilo-gravel", samples: 6 });
      const gravelMargin = (s0, s1, side, gap, id) => {
        along(s0, s1, ds, (k) => {
          const midGap = gap + 1.25;
          const a = anchor(k, side, midGap);
          const prev = anchor((k - 1 + n) % n, side, midGap);
          const next = anchor((k + 1) % n, side, midGap);
          const chord = (b) => Math.hypot(b.c[0] - a.c[0], b.c[2] - a.c[2]);
          const len = Math.max(0.5, (chord(prev) + chord(next)) * 0.5);
          groundPatch(k, side, gap, [2.5, 0.08, len], GRAVEL,
            { id: `${id}-${k}`, samples: 2 });
        });
      };
      gravelMargin(0.1022 - 10 / (n * ds), 0.1022 + 10 / (n * ds), -1, 2.25,
        "monza-rettifilo-2024-margin");
      tyreWall(0.089, 0.114, 1, 4, [0.88, 0.20, 0.18]);
      grandstandEx(0.109, -1, 12, 76, null, null,
        { livery: "crimson", roof: "truss", endWalls: true, pylons: true, h: 11 });
      marshalPost(K(0.104), 1, 10);

      groundPatch(K(0.30), -1, 6, [22, 0.18, 28], GRAVEL,
        { id: "monza-roggia-gravel-left", samples: 6 });
      groundPatch(K(0.305), 1, 5, [20, 0.18, 26], GRAVEL,
        { id: "monza-roggia-gravel-right", samples: 6 });
      gravelMargin(0.3057, 0.3102, 1, 1, "monza-roggia-2024-margin");
      tyreWall(0.29, 0.315, -1, 4, [0.20, 0.40, 0.85]);
      grandstandEx(0.30, 1, 20, 52, null, null,
        { livery: "concrete", roof: "flat", endWalls: true, h: 8 });
      out._mat = MAT.FLAT;
      for (const [sf, side, dist, size, col] of [
        [0.284, -1, 24, [8.0, 0.28, 24], [0.61, 0.68, 0.66]],
        [0.298,  1, 30, [6.5, 0.20, 18], [0.66, 0.72, 0.69]],
        [0.311, -1, 35, [5.0, 0.16, 14], [0.63, 0.70, 0.68]],
      ]) {
        const af = anchor(K(sf), side, dist);
        let top = af.c[1];
        for (const fr of [-0.5, 0, 0.5]) for (const ft of [-0.5, 0, 0.5]) {
          const q = vadd(vadd(af.c, af.r, fr * size[0]), af.t, ft * size[2]);
          const g = terrainYAt(q[0], q[2]);
          if (g != null && g > top) top = g;
        }
        addPrism(out, [af.c[0], top - 0.03, af.c[2]], size, col, [af.r, af.u, af.t]);
      }
      out._mat = 0;
      marshalPost(K(0.31), -1, 9);
      waterBand(0.283, 0.317, -1, 32, 36, 4, [0.30, 0.35, 0.23], { id: "monza-roggia-ditch", required: true });

      groundPatch(K(0.3705), -1, 5, [18, 0.18, 26], GRAVEL,
        { id: "monza-lesmo-one-gravel", samples: 5 });
      groundPatch(K(0.4321), -1, 5, [18, 0.18, 24], GRAVEL,
        { id: "monza-lesmo-two-gravel", samples: 5 });
      tyreWall(0.36, 0.38, -1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.40), 1, 9);

      groundPatch(K(0.633), -1, 6, [28, 0.18, 40], GRAVEL,
        { id: "monza-ascari-gravel-left", samples: 7 });
      groundPatch(K(0.648), 1, 6, [24, 0.18, 32], GRAVEL,
        { id: "monza-ascari-gravel-right", samples: 6 });
      tyreWall(0.623, 0.653, -1, 4, [0.88, 0.20, 0.18]);
      grandstandEx(0.633, -1, 14, 80, null, null,
        { livery: "steel", tiers: 2, roof: "truss", pylons: true, endWalls: true, h: 12 });
      marshalPost(K(0.638), 1, 9);

      groundPatch(K(0.819), -1, 8, [50, 0.18, 110], GRAVEL,
        { id: "monza-parabolica-gravel", samples: 10 });
      tyreWall(0.804, 0.839, -1, 6, [0.88, 0.20, 0.18]);
      marshalPost(K(0.829), 1, 11);
      for (const s of [0.789, 0.829]) billboard(K(s), -1, 18, 13, 5, [0.90, 0.86, 0.30]);

      fence(0.089, 0.119, 1, 7, 4, [0.74, 0.76, 0.80]);
      fence(0.295, 0.32, 1, 8, 4, [0.74, 0.76, 0.80]);
      fence(0.623, 0.653, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.809, 0.849, 1, 9, 4, [0.74, 0.76, 0.80]);

      for (const [s0, s1] of [
        [0.125, 0.28], [0.32, 0.355], [0.385, 0.42], [0.445, 0.61],
        [0.665, 0.795], [0.86, 0.93],
      ]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }

      for (const s of [0.12, 0.20, 0.38, 0.58, 0.66, 0.84, 0.96]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      (function buildBanking() {
        const conc = [0.66, 0.64, 0.60], concDk = [0.54, 0.52, 0.49], moss = [0.36, 0.48, 0.32];
        const tierPoints = (dist) => {
          const points = [];
          for (let s = 0.50; s <= 0.58 + 1e-9; s += 0.01) {
            const arc = Math.sin(((s - 0.50) / 0.08) * Math.PI);
            points.push({ k: K(s), side: -1, dist: dist + arc * 10 });
          }
          return points;
        };
        groundedSegments({
          id: "monza-banking-lower", points: tierPoints(68),
          width: 7, height: 4.5, color: concDk,
        });
        groundedSegments({
          id: "monza-banking-middle", points: tierPoints(75),
          width: 7, height: 8.5, color: conc,
        });
        groundedSegments({
          id: "monza-banking-upper", points: tierPoints(82),
          width: 7, height: 12.5, color: concDk,
        });
        groundedSegments({
          id: "monza-banking-moss", points: tierPoints(64.1),
          width: 0.8, height: 3.2, color: moss,
        });
        for (const p of tierPoints(80)) {
          const h = hash(p.k * 17 + 41);
          if (h < 0.55) continue;
          if (h < 0.80) bush(p.k, p.side, p.dist, [0.22, 0.40, 0.20]);
          else tree(p.k, p.side, p.dist, 4 + h * 3, LEAF_D);
        }
      })();

      building(K(0.62), 1, 70, 64, 24, 30, { kind: "podium", wall: [0.87, 0.81, 0.67], window: [0.70, 0.64, 0.50], floor: 6 });
      {
        const aVR = anchor(K(0.62), 1, 70 + 32);
        const winVR = [0.96, 0.86, 0.52];
        addBox(out, vadd(aVR.c, aVR.u, 9),  [0.28, 1.4, 62], winVR, [aVR.r, aVR.u, aVR.t]);
        addBox(out, vadd(aVR.c, aVR.u, 17), [0.28, 1.4, 62], winVR, [aVR.r, aVR.u, aVR.t]);
      }
      building(K(0.605), 1, 72, 30, 16, 22, { kind: "slab", wall: [0.85, 0.79, 0.65], window: [0.68, 0.62, 0.48] });
      building(K(0.635), 1, 72, 30, 16, 22, { kind: "slab", wall: [0.85, 0.79, 0.65], window: [0.68, 0.62, 0.48] });

      for (let i = 0; i < 4; i++) {
        const s = 0.93 + i * 0.022;
        building(K(s), -1, 40, 24, 12, 18,
          { kind: "hall", wall: [0.80, 0.80, 0.82], window: [0.32, 0.36, 0.44], floor: 4.5, roof: true });
      }
      every(40, (k) => {
        const h = hash(k * 71 + 31);
        if (h < 0.5) return;
        const s = k / n;
        if (s > 0.10 && s < 0.90) return;
        motorhome(k, -1, 55 + h * 10, 10, 4, 6, { wall: [0.6 + h * 0.3, 0.6, 0.62] });
      });

      broadcastCompound(K(0.98), -1, 75, { vans: 3, dishes: 2, mastH: 9 });

      {
        const yards = [
          [["k_pitsgarageclosed", "k_pitsgarage", "k_pitsgarageclosed", "k_pitsgarage"], 0.935, -1, 62, 1.8],
          [["k_pitsgarage", "k_pitsgarageclosed", "k_pitsgarage"], 0.958, -1, 64, 1.8],
          ["k_pitsoffice", 0.012, -1, 60, 2.6],
          ["k_tentlong", 0.988, -1, 68, 2.4],
        ];
        for (const [ids, s, side, dist, sc] of yards) {
          const row = [].concat(ids), step = Math.max(1, Math.round(5 * sc / ds));
          const scale = row.length > 1 ? step * ds / 5 : sc;
          let placed = 0;
          row.forEach((id, i) => {
            const km = K(s) + (i - (row.length - 1) / 2) * step;
            const a = anchor(km, side, dist), e = anchor(km, side, 0);
            const rotY = a && e ? Math.atan2(e.c[0] - a.c[0], e.c[2] - a.c[2]) : undefined;
            if (bakedModel(id, km, side, dist, { scale, mat: MAT.FLAT, rotY })) placed++;
          });
          if (!placed)
            building(K(s), side, dist, 18, 12, 14,
              { kind: "hall", wall: [0.72, 0.72, 0.74], window: [0.28, 0.32, 0.38], floor: 4 });
        }
        bakedModel("k_radarequipment", K(0.972), -1, 72, { scale: 2.5 });
        bakedModel("k_bannertowerred", K(0.942), -1, 70, { scale: 1.8 });
      }

      along(0.028, 0.052, 5.0, (k) => {
        bakedModel("k_barrierwhite", k, 1, 6.4, { scale: 1.5 });
      });
      along(0.030, 0.050, 7.0, (k) => {
        bakedModel("k_pylon", k, 1, 5.0, { scale: 1.3 });
      });

      waterSurface(K(0.40), 1, 95, [180, 0.18, 230], [0.30, 0.50, 0.70],
        { id: "monza-villa-lake", required: true });
      waterSurface(K(0.24), -1, 90, [140, 0.18, 170], [0.28, 0.48, 0.68],
        { id: "monza-west-park-lake", required: true });
      for (const [s, sd] of [[0.40, 1], [0.24, -1]]) {
        for (let i = 0; i < 4; i++) tree(K(s + (i - 2) * 0.01), sd, 70 + i * 8, 12 + i, LEAF_L);
      }

      const kmilan = K(0.96);
      for (let i = 0; i < 7; i++) {
        building(kmilan, 1, 210 + i * 28, 16, 36 + i * 10, 16,
          { kind: "spire", wall: [0.62 + i * 0.015, 0.66 + i * 0.015, 0.72 + i * 0.015], window: [0.52, 0.56, 0.62] });
      }

      const { cx, cz, radius: rad } = lapBounds();
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [120, 62, 90, 25, 10, 5.5, [0.16, 0.36, 0.20]],
        [185, 52, 108, 28, 12, 6.5, [0.13, 0.33, 0.17]],
        [260, 44, 128, 32, 14, 7.5, [0.11, 0.30, 0.15]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 28;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 30)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      {
        for (let i = 0; i < 12; i++) {
          const ang = i / 12 * 6.2832, h = hash(i * 3 + 99);
          const r = rad + 80 + h * 24;
          const tx = cx + Math.cos(ang) * r, tz = cz + Math.sin(ang) * r;
          if (onTrack(tx, tz, 28)) continue;
          ridge(tx, tz, pyMin, ang + 1.5708, 30 + h * 16, 20 + h * 8,
                14 + h * 8, [0.14, 0.34, 0.16]);
        }
        for (let i = 0; i < 10; i++) {
          const ang = (i + 0.5) / 10 * 6.2832, h = hash(i * 7 + 199);
          const r = rad + 145 + h * 30;
          const tx = cx + Math.cos(ang) * r, tz = cz + Math.sin(ang) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, ang + 1.5708, 36 + h * 18, 24 + h * 10,
                16 + h * 10, [0.11, 0.29, 0.13]);
        }
      }

      grandstandEx(0.794, 1, 14, 80, null, null,
        { livery: "concrete", roof: "truss", pylons: true, endWalls: true, h: 11 });
      grandstandEx(0.854, 1, 14, 80, null, null,
        { livery: "steel", roof: "flat", endWalls: true, h: 9 });
      for (const s of [0.794, 0.854]) {
        const kp = K(s);
        const ap = anchor(kp, 1, 20);
        addBox(out, vadd(ap.c, ap.u, 0.6), [8.4, 1.2, 80.4], [0.58, 0.56, 0.54], [ap.r, ap.u, ap.t]);
      }
      {
        const winPar = [0.98, 0.88, 0.52];
        for (const s of [0.794, 0.824, 0.854]) {
          const ap = anchor(K(s), 1, 21.5);
          addBox(out, vadd(ap.c, ap.u, 10.0), [0.22, 1.3, 94], winPar, [ap.r, ap.u, ap.t]);
        }
      }

      {
        const kerbR = [0.88, 0.16, 0.12], kerbW = [0.94, 0.94, 0.92];
        for (let i = 0; i < 18; i++) {
          const sFrac = i * (0.07 / 18);
          const k = K(sFrac);
          const a = anchor(k, -1, 4.5);
          const col = (i % 2 === 0) ? kerbR : kerbW;
          addBox(out, vadd(a.c, a.u, 0.25), [0.9, 0.5, 3.2], col, [a.r, a.u, a.t]);
        }
      }


      for (let i = 0; i < 26; i++) {
        const a = i / 26 * 6.2832, h = hash(i * 11 + 5);
        const r = rad + 100 + h * 55;
        const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
        if (onTrack(tx, tz, 30)) continue;
        ridge(tx, tz, pyMin, a, 20, 18, 14 + h * 10, PINE_D);
      }

      for (const [s, sd, colL] of [[0.40, 1, LEAF_L], [0.24, -1, LEAF_L]]) {
        for (let i = 0; i < 5; i++) {
          const si = i - 2;
          tree(K(s + (si + 0.5) * 0.01), sd, 72 + i * 8, 15 + i * 0.8, colL);
        }
      }

      for (const [s, side, gap] of [
        [0.099, 1, 9],
        [0.30, -1, 8],
        [0.40,  1, 9],
        [0.633, 1, 9],
        [0.829, 1, 12],
      ]) {
        const k = K(s);
        const ap = anchor(k, side, gap);
        addCyl(out, ap.c, 0.14, 11, [0.18, 0.18, 0.20], 6, [ap.r, ap.u, ap.t]);
        addBox(out, vadd(ap.c, ap.u, 10.7), [1.1, 0.5, 0.6], [0.98, 0.94, 0.72], [ap.r, ap.u, ap.t]);
      }

      const CYP = [0.12, 0.29, 0.16];
      for (let i = 0; i < 8; i++) {
        const s = 0.58 + i * 0.007;
        cypress(K(s), 1, 46 + (i % 2) * 3, 15 + hash(i * 9) * 5, CYP);
      }
      for (const [s0, side, gap] of [[0.955, -1, 30], [0.028, 1, 48], [0.90, 1, 34]]) {
        for (let i = 0; i < 5; i++)
          cypress(K(s0 + i * 0.006), side, gap + (i % 2) * 4,
                  14 + hash(i * 5 + s0 * 50) * 6, CYP);
      }

      const SHELL_SETS = {
        crimson:  [[0.60, 0.44, 0.42], [0.48, 0.34, 0.32]],
        concrete: [[0.57, 0.58, 0.60], [0.51, 0.52, 0.55]],
        steel:    [[0.50, 0.53, 0.58], [0.42, 0.45, 0.50]],
      };
      const TIFOSI = [[0.84, 0.26, 0.22], [0.88, 0.86, 0.82], [0.30, 0.40, 0.62], [0.72, 0.63, 0.30]];
      const TOTAL_M = ds * n;
      const tifosiBowl = (s, side, gap, len, tiers, livery) => {
        const half = (len / 2) / TOTAL_M;
        tieredBowl(s - half, s + half, side, gap, {
          tiers, tierDepth: 5.6, base: 3, rise: 3.3,
          shell: SHELL_SETS[livery] || SHELL_SETS.concrete,
          crowd: TIFOSI, density: 0.55, roof: false,
          step: 11,
        });
      };
      tifosiBowl(0.824, -1, 44, 96, 4, "crimson");
      tifosiBowl(0.11, 1, 25, 64, 3, "crimson");
      
      (function museum() {
        const a = anchor(K(0.0), 1, 40);
        const b = [a.r, a.u, a.t], base = a.c;
        const wall = [0.90, 0.87, 0.78], trim = [0.82, 0.78, 0.68];
        out._mat = MAT.STONE;
        addBox(out, vadd(base, a.u, 6), [26, 12, 16], wall, b);
        out._mat = MAT.CONCRETE;
        addPrism(out, vadd(base, a.u, 13.5), [26, 4, 16], trim, b);
        out._mat = MAT.STONE;
        for (let i = 0; i < 7; i++) {
          const off = (i - 3) * 3.4;
          const cp = vadd(vadd(base, a.t, off), a.r, -9);
          addCyl(out, cp, 0.5, 9.5, [0.94, 0.91, 0.83], 8, b);
        }
        addBox(out, vadd(vadd(base, a.r, -9), a.u, 10), [2.2, 1.4, 25], trim, b);
        out._mat = MAT.CONCRETE;
        addPrism(out, vadd(vadd(base, a.r, -9), a.u, 12), [2.2, 2.6, 25], wall, b);
        out._mat = MAT.GLASS;
        for (let i = 0; i < 5; i++)
          addBox(out, vadd(vadd(vadd(base, a.t, (i - 2) * 3.2), a.r, -13.05), a.u, 6), [0.2, 3, 2.2],
                 [0.96, 0.86, 0.52], [a.r, a.u, a.t]);
        out._mat = 0;
      })();

      (function sopraelevataFlyover() {
        const conc = [0.66, 0.64, 0.60], concDk = [0.54, 0.52, 0.49];
        const bridgeS = 0.73, clearance = 6.8;
        overheadSpan({
          id: "monza-sopraelevata-flyover",
          frac: bridgeS,
          clearance,
          thickness: 2.2,
          depth: 72,
          span: 28,
          supports: false,
          color: concDk,
          required: true,
        });

        for (const side of [-1, 1]) {
          const a = anchor(K(bridgeS), side, 4.2);
          modelGroup(`monza-sopraelevata-pier-${side < 0 ? "left" : "right"}`, {
            center: vadd(a.c, a.u, clearance / 2),
            size: [2.4, clearance, 4],
            basis: [a.r, a.u, a.t],
          }, (stage) => {
            addCyl(stage, a.c, 1.2, clearance, concDk, 8, [a.r, a.u, a.t]);
          }, { required: true });
        }

        const points = (side) => {
          const result = [];
          for (let s = 0.695; s <= 0.765 + 1e-9; s += 0.01)
            result.push({ k: K(s), side, dist: 10 });
          return result;
        };
        groundedSegments({
          id: "monza-sopraelevata-wing-left",
          points: points(-1), width: 7.5, height: 8.5, color: conc,
        });
        groundedSegments({
          id: "monza-sopraelevata-wing-right",
          points: points(1), width: 7.5, height: 8.5, color: conc,
        });
      })();

      {
        const kerbR = [0.88, 0.16, 0.12], kerbW = [0.94, 0.94, 0.92];
        const strips = [
          [0.084, 0.114,  1],
          [0.087, 0.111, -1],
          [0.285, 0.320, -1],
          [0.290, 0.315,  1],
          [0.618, 0.658, -1],
          [0.623, 0.653,  1],
        ];
        for (const [s0, s1, side] of strips) {
          let i = 0;
          along(s0, s1, 3.0, (k) => {
            const a = anchor(k, side, 4.2);
            addBox(out, vadd(a.c, a.u, 0.22), [0.95, 0.42, 2.6],
                   (i++ % 2 === 0) ? kerbR : kerbW, [a.r, a.u, a.t]);
          });
        }
      }

      every(14, (k) => {
        const s = k / n;
        if (s < 0.08 || s > 0.18) return;
        const h = hash(k * 19 + 11);
        const standL = s > 0.098 && s < 0.12;
        if (!standL) stonePine(k, -1, 24 + h * 3, 12 + h * 5, h < 0.4 ? PINE_D : PINE, { spread: 0.58 });
        if (!standL) stonePine(k,  1, 25 + h * 3, 11 + h * 5, h < 0.5 ? PINE : PINE_D, { spread: 0.56 });
        if (h > 0.40 && !standL) pine(k, -1, 32 + h * 5, 16 + h * 8, PINE_D);
        if (h > 0.50 && !standL) pine(k,  1, 33 + h * 5, 15 + h * 8, PINE);
      });

      spectatorHill(0.08, 0.18, -1, 13, { rows: 3, rise: 1.0, depth: 1.8, density: 0.40, step: 9 });
      spectatorHill(0.43, 0.54,  1, 13, { rows: 3, rise: 1.0, depth: 1.8, density: 0.40, step: 9 });
      every(24, (k) => {
        const s = k / n;
        if (s < 0.09 || s > 0.17) return;
        const h = hash(k * 19 + 11);
        if (h < 0.5) return;
        const gap = 28 + h * 6;
        const a = anchor(k, -1, gap);
        if (!a || onTrack(a.c[0], a.c[2], 8) || (s > 0.098 && s < 0.12)) return;
        pine(k, -1, gap, 14 + h * 6, PINE_D);
      });

      every(42, (k) => {
        const s = k / n;
        const grande = s >= 0.09 && s <= 0.155;
        const lesmo = s >= 0.445 && s <= 0.525;
        if (!grande && !lesmo) return;
        const h = hash(k * 23 + 41);
        if (!(s > 0.098 && s < 0.12)) pine(k, -1, 30 + h * 6, 16 + h * 8, h < 0.5 ? PINE_D : PINE);
        tree(k, 1, 32 + h * 6, 13 + h * 7, h < 0.45 ? LEAF_D : LEAF);
        if (lesmo && h > 0.58)
          pine(k, h > 0.78 ? -1 : 1, 38 + h * 5, 18 + h * 7, PINE_D);
      });

      building(K(0.545), -1, 94, 13, 9, 10, { kind: "hall",
        wall: [0.57, 0.55, 0.51], window: [0.28, 0.30, 0.29], floor: 4.5,
      });
      billboard(K(0.545), -1, 91, 12, 4.5, [0.72, 0.68, 0.58]);
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.515 + i * 0.018), -1, 87);
        addBox(out, vadd(a.c, a.u, 3.2), [1.1, 6.4, 5.5],
          i % 2 ? [0.53, 0.51, 0.48] : [0.61, 0.59, 0.55],
          [a.r, a.u, a.t]);
      }

      function tifosiCamp(id, s, side, gap) {
        const a = anchor(K(s), side, gap);
        if (!a || onTrack(a.c[0], a.c[2], 16)) return;
        const gy = terrainYAt(a.c[0], a.c[2]);
        const base = [a.c[0], Number.isFinite(gy) ? gy : a.c[1], a.c[2]];
        const b = [a.r, a.u, a.t];
        const onTerrain = (p) => {
          const y = terrainYAt(p[0], p[2]);
          return [p[0], Number.isFinite(y) ? y : p[1], p[2]];
        };
        modelGroup(id, {
          center: vadd(base, a.u, 2.2),
          size: [24, 8, 44],
          basis: b,
        }, (stage) => {
          const tentCols = [
            [0.84, 0.16, 0.13], [0.92, 0.90, 0.82], [0.20, 0.48, 0.24],
          ];
          for (let i = 0; i < 6; i++) {
            const row = i % 2, alongOff = (Math.floor(i / 2) - 1) * 12;
            const across = (row ? 1 : -1) * 5;
            const p = onTerrain(vadd(vadd(base, a.r, across), a.t, alongOff));
            addPrism(stage, vadd(p, a.u, -0.08), [5.5, 3, 6.5],
              tentCols[i % tentCols.length], b);
          }
          for (let i = 0; i < 2; i++) {
            const p = onTerrain(vadd(vadd(base, a.r, 7.5), a.t, (i - 0.5) * 18));
            addBox(stage, vadd(p, a.u, 1.2), [3.2, 2.4, 6.2],
              [0.42, 0.44, 0.46], b);
          }
          const flagBase = onTerrain(vadd(vadd(base, a.r, -8), a.t, 17));
          addCyl(stage, vadd(flagBase, a.u, -0.15), 0.10, 8.2, [0.30, 0.30, 0.31], 6, b);
          addBox(stage, vadd(vadd(flagBase, a.u, 6.8), a.t, 0.8),
            [0.16, 1.8, 3.2], [0.18, 0.58, 0.25], b);
        });
      }
      tifosiCamp("monza-tifosi-camp-curva-grande", 0.185, -1, 54);
      tifosiCamp("monza-tifosi-camp-ascari", 0.808, 1, 92);

      {
        const a = anchor(K(0.945), 1, 58);
        const b = [a.r, a.u, a.t], stone = [0.84, 0.80, 0.70];
        modelGroup("monza-vedano-gate", {
          center: vadd(a.c, a.u, 7),
          size: [7, 14, 24],
          basis: b,
        }, (stage) => {
          addBox(stage, vadd(vadd(a.c, a.t, -9), a.u, 5), [6, 10, 4.2], stone, b);
          addBox(stage, vadd(vadd(a.c, a.t, 9), a.u, 5), [6, 10, 4.2], stone, b);
          addBox(stage, vadd(a.c, a.u, 10.2), [6.2, 2.2, 22], [0.77, 0.72, 0.62], b);
          addPrism(stage, vadd(a.c, a.u, 11.1), [6.4, 2.5, 23],
            [0.88, 0.84, 0.74], b);
        });
      }

      grandstandEx(0.032, 1, 32, 54, null, null, { livery: "crimson", roof: "none", h: 7 });
      grandstandEx(0.295, -1, 28, 50, null, null, { livery: "concrete", roof: "none", h: 6.5 });
      grandstandEx(0.775, 1, 30, 58, null, null, { livery: "steel", roof: "none", h: 7 });
    };
