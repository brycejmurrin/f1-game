/* Apex 26 — BUENOS_AIRES scenery (data only), split out of js/circuits/buenos_aires.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["buenos_aires"] =
  function (api) {
      const { out, MAT, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz,
        tree, bush, hedge, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        cameraTower, sponsorHoarding,
        fence, guardrail, tyreWall, groundPatch, modelGroup, waterSurface,
        addBox, addCyl, addCone, addPrism, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      const PLANE = [0.30, 0.50, 0.24], PLANE_D = [0.24, 0.42, 0.20];
      const EUC = [0.26, 0.40, 0.26];
      const GRAVEL = [0.68, 0.64, 0.50];
      const CELESTE = [0.44, 0.68, 0.86];   // Argentine light blue

      const openArea = (s) => (s >= 0.92 || s <= 0.10) || (s >= 0.38 && s <= 0.48);
      every(15, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 17 + ((k / 15) % 2) * 2);
          const b = [a.r, a.u, a.t];
          const h = 11 + hash(k * 7 + side) * 4;
          out._mat = MAT.WOOD;
          addCyl(out, a.c, 0.42, h * 0.48, [0.72, 0.70, 0.62], 6, b);
          out._mat = MAT.FOLIAGE;
          addCyl(out, vadd(a.c, a.u, h * 0.46), 4.2 + h * 0.12, h * 0.34, PLANE, 7, b);
          addCyl(out, vadd(a.c, a.u, h * 0.74), 3.0 + h * 0.08, h * 0.24, PLANE_D, 7, b);
          out._mat = 0;
        }
      });
      // Second, deeper avenue rank.
      every(24, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 53 + 9);
        if (h < 0.35) return;
        tree(k, h < 0.5 ? -1 : 1, 36 + (k % 3) * 5, 13 + h * 6, EUC);
      });
      every(28, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.58) return;
        bush(k, h < 0.75 ? -1 : 1, 7 + h * 5, [0.22, 0.42, 0.20]);
      });
      hedge(0.14, 0.34, -1, 26, 3.2, [0.19, 0.40, 0.19]);
      hedge(0.56, 0.78, 1, 26, 3.2, [0.19, 0.40, 0.19]);

      function concreteTerrace(id, s, side, gap, len, tiers) {
        const a = anchor(K(s), side, gap);
        const b = [a.r, a.u, a.t];
        modelGroup(id, {
          center: vadd(a.c, a.u, tiers * 1.4),
          size: [tiers * 3.4 + 4, tiers * 3.2, len + 4],
          basis: b,
        }, (stage) => {
          // STEP AWAY FROM THE TRACK, WHICHEVER SIDE THIS IS. The tiers rise
          // with t, so they must also walk outward with t — but the offset was
          // a bare `+a.r` for both sides, which only walks outward on side +1.
          // The two side=-1 terraces (main, back) therefore climbed back over
          // the road and were culled, so the main grandstand of this circuit
          // has never been on screen.
          for (let t = 0; t < tiers; t++) {
            const hgt = 1.6 + t * 2.2;
            addBox(stage, vadd(vadd(a.c, a.r, side * t * 3.2), a.u, hgt * 0.5),
              [3.1, hgt, len], t % 2 ? [0.72, 0.71, 0.67] : [0.66, 0.65, 0.61], b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(vadd(a.c, a.r, side * t * 3.2), a.u, hgt + 0.55),
              [2.6, 1.1, len - 2],
              [CELESTE, [0.94, 0.93, 0.90], [0.86, 0.30, 0.24]][t % 3], b);
            stage._mat = 0;
          }
          // Plain concrete back wall — no roof, no fascia. That is the look.
          addBox(stage, vadd(vadd(a.c, a.r, side * tiers * 3.2), a.u, tiers * 1.5),
            [0.6, tiers * 3.0, len + 2], [0.62, 0.61, 0.58], b);
        });
      }
      concreteTerrace("baires-terrace-main", 0.005, -1, 11, 150, 5);
      concreteTerrace("baires-terrace-back", 0.955, -1, 11, 96, 4);
      concreteTerrace("baires-terrace-curvon", 0.380, 1, 20, 120, 5);
      concreteTerrace("baires-terrace-t1", 0.075, 1, 18, 80, 4);

      {
        const a = anchor(K(0.975), 1, 15);
        const b = [a.r, a.u, a.t];
        modelGroup("baires-pit-block", {
          center: vadd(a.c, a.u, 4), size: [16, 12, 116], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 3.2), [11, 6.4, 112], [0.88, 0.87, 0.82], b);
          // Flat parapet roof — no curve, no tensile fabric.
          addBox(stage, vadd(a.c, a.u, 6.8), [12, 0.8, 113], [0.74, 0.73, 0.70], b);
          // Square-section awning columns onto the pit lane.
          for (let i = 0; i < 14; i++) {
            const p = vadd(vadd(a.c, a.r, -6.4), a.t, (i - 6.5) * 8);
            addBox(stage, vadd(p, a.u, 2.4), [0.5, 4.8, 0.5], [0.78, 0.77, 0.74], b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, -5.2), a.u, 5.0), [3.2, 0.4, 110],
            [0.84, 0.83, 0.79], b);
        }, { required: true });
      }
      // Simple square control tower — a plain concrete box on legs, not a spire.
      {
        const a = anchor(K(0.995), 1, 30);
        const b = [a.r, a.u, a.t];
        modelGroup("baires-control-tower", {
          center: vadd(a.c, a.u, 10), size: [12, 24, 12], basis: b,
        }, (stage) => {
          for (const [dx, dz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) {
            addCyl(stage, vadd(vadd(a.c, a.r, dx), a.t, dz), 0.42, 12, [0.76, 0.75, 0.72], 6, b);
          }
          addBox(stage, vadd(a.c, a.u, 14.5), [9, 5, 9], [0.86, 0.85, 0.81], b);
          addBox(stage, vadd(a.c, a.u, 14.5), [9.4, 2.2, 9.4], [0.34, 0.44, 0.54], b);
          addBox(stage, vadd(a.c, a.u, 17.4), [10, 0.6, 10], [0.70, 0.69, 0.66], b);
        });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.955, 8.0, [0.15, 0.15, 0.18]);
      for (let i = 0; i < 4; i++) {
        building(K(0.918 + i * 0.013), 1, 40, 22, 9, 22,
          { kind: "drum", wall: [0.86, 0.85, 0.80], window: [0.30, 0.34, 0.42], floor: 4.2 });
      }
      every(48, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.55) return;
        motorhome(k, 1, 56 + h * 10, 10, 4, 6, { wall: [0.70 + h * 0.2, 0.70, 0.72] });
      });
      broadcastCompound(K(0.908), 1, 72, { vans: 2, dishes: 2, mastH: 9 });
      // Argentine light-blue-and-white hoardings.
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, CELESTE);
      sponsorHoarding(0.945, 0.055, -1, 3.6, {
        h: 1.2, step: 12,
        palette: [CELESTE, [0.94, 0.93, 0.90], [0.10, 0.28, 0.52]],
      });

      groundPatch(K(0.075), -1, 5, [28, 0.18, 38], GRAVEL,
        { id: "baires-t1-gravel", samples: 7 });
      tyreWall(0.060, 0.092, -1, 4, [0.86, 0.20, 0.18]);
      marshalPost(K(0.070), 1, 9);

      groundPatch(K(0.380), -1, 6, [40, 0.18, 90], GRAVEL,
        { id: "baires-curvon-gravel", samples: 9 });
      tyreWall(0.352, 0.408, -1, 5, [0.20, 0.40, 0.85]);
      marshalPost(K(0.375), -1, 10);

      groundPatch(K(0.522), 1, 5, [24, 0.18, 32], GRAVEL,
        { id: "baires-esses-gravel", samples: 6 });
      marshalPost(K(0.518), -1, 9);

      groundPatch(K(0.850), 1, 5, [26, 0.18, 34], GRAVEL,
        { id: "baires-final-gravel", samples: 6 });
      tyreWall(0.836, 0.866, 1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.845), -1, 9);

      spectatorHill(0.20, 0.32, -1, 15, { rows: 3, rise: 1.0, depth: 1.8, density: 0.40, step: 9 });
      spectatorHill(0.62, 0.74, 1, 15, { rows: 3, rise: 1.0, depth: 1.8, density: 0.40, step: 9 });

      for (const [s0, s1] of [[0.11, 0.34], [0.42, 0.50], [0.55, 0.82], [0.87, 0.91]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.16, 0.26, 0.46, 0.58, 0.70, 0.88]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [115, 46, 150, 34, 12, 5, [0.22, 0.44, 0.20]],
        [210, 34, 200, 46, 15, 6, [0.19, 0.38, 0.19]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 30;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      // Porteño apartment blocks — mid-rise, pale, densely packed.
      {
        const k = K(0.62);
        for (let i = 0; i < 12; i++) {
          building(k, 1, 230 + i * 22, 15, 26 + (i % 5) * 8, 15,
            { kind: "slab", wall: [0.76 - (i % 3) * 0.04, 0.75, 0.72], window: [0.42, 0.46, 0.52], floor: 3.2 });
        }
      }

      for (let i = 0; i < 10; i++) {
        const a = anchor(K(0.960 + i * 0.005), -1, 7);
        const b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.11, 10, [0.90, 0.90, 0.92], 6, b);
        addBox(out, vadd(vadd(a.c, a.u, 8.4), a.t, 1.2), [0.14, 1.6, 2.6],
          i % 2 ? CELESTE : [0.95, 0.94, 0.92], b);
      }
      cameraTower(K(0.030), -1, 24, { h: 13 });
      cameraTower(K(0.380), 1, 40, { h: 16 });
      cameraTower(K(0.850), 1, 26, { h: 13 });
      for (const [s0, s1] of [[0.12, 0.36], [0.5, 0.9]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 30, { density: 0.62, hMin: 11, hMax: 18, pineFrac: 0.04, col: EUC, col2: PLANE_D });
      }

      {
        const a = anchor(K(0.928), -1, 48);
        const b = [a.r, a.u, a.t];
        const STONE = [0.84, 0.82, 0.76], STONE_D = [0.72, 0.70, 0.64];
        const BRONZE = [0.56, 0.46, 0.26];
        modelGroup("baires-portico", {
          center: vadd(a.c, a.u, 11), size: [14, 26, 40], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          for (const t of [-13, -9.5, 9.5, 13]) {
            const tall = Math.abs(t) < 11;
            addBox(stage, vadd(vadd(a.c, a.t, t), a.u, tall ? 8.5 : 7.0),
              [5.5, tall ? 17 : 14, 3.0], (t < 0) === (Math.abs(t) < 11) ? STONE : STONE_D, b);
          }
          // Deep entablature spanning the pylons, stepped twice.
          addBox(stage, vadd(a.c, a.u, 17.6), [6.2, 2.6, 30], STONE, b);
          addBox(stage, vadd(a.c, a.u, 19.4), [7.0, 1.1, 32], STONE_D, b);
          addBox(stage, vadd(a.c, a.u, 20.4), [5.0, 0.9, 28], STONE, b);
          // Name band in relief on the frieze.
          addBox(stage, vadd(vadd(a.c, a.r, -3.2), a.u, 17.6), [0.4, 1.4, 22], BRONZE, b);
          stage._mat = MAT.METAL;
          for (const t of [-16.5, 16.5]) {
            addCyl(stage, vadd(a.c, a.t, t), 0.13, 15, [0.90, 0.90, 0.92], 5, b);
            addBox(stage, vadd(vadd(vadd(a.c, a.t, t + 1.7), a.u, 12.6), a.r, 0),
              [0.15, 2.0, 3.2], CELESTE, b);
          }
          stage._mat = 0;
        });
      }

      groundPatch(K(0.655), 1, 74, [40, 0.16, 90], [0.30, 0.42, 0.26],
        { id: "baires-lake-shore", samples: 8 });
      waterSurface(K(0.655), 1, 96, [30, 0.18, 74], [0.24, 0.40, 0.44],
        { id: "baires-park-lake" });
    };
