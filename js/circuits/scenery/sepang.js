/* Apex 26 — SEPANG scenery (data only), split out of js/circuits/sepang.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["sepang"] =
  function (api) {
      const { K, lapBounds, out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, px, pz,
        palm, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, waterBand,
        sponsorHoarding, cameraTower, seat, terrainYAt, indexSolid,
        addBox, addCyl, addCone, addPrism, addFrustum } = api;

      const PALM_F = [0.16, 0.42, 0.18], PALM_FD = [0.12, 0.34, 0.15];
      const JUNGLE = [0.11, 0.34, 0.14], JUNGLE_L = [0.20, 0.46, 0.20];
      const GRAVEL = [0.68, 0.60, 0.44];

      const tilt2 = (a, ar, at) => {
        const cr = Math.cos(ar), sr = Math.sin(ar);
        const r1 = [a.r[0] * cr + a.u[0] * sr, a.r[1] * cr + a.u[1] * sr, a.r[2] * cr + a.u[2] * sr];
        const u1 = [a.u[0] * cr - a.r[0] * sr, a.u[1] * cr - a.r[1] * sr, a.u[2] * cr - a.r[2] * sr];
        const ct = Math.cos(at), st = Math.sin(at);
        const t2 = [a.t[0] * ct + u1[0] * st, a.t[1] * ct + u1[1] * st, a.t[2] * ct + u1[2] * st];
        const u2 = [u1[0] * ct - a.t[0] * st, u1[1] * ct - a.t[1] * st, u1[2] * ct - a.t[2] * st];
        return [r1, u2, t2];
      };

      const openArea = (s) => (s >= 0.88 || s <= 0.10) || (s >= 0.30 && s <= 0.40);
      // A plantation is a GRID: identical trees, identical spacing, identical
      // height, in ranks you can sight down. Every other circuit in the game
      // hash-scatters its trees precisely so they do NOT line up — here the
      // regularity is the point, so height and species are fixed per rank and
      // the only variation is a small deterministic wobble in the trunk lean
      // that palm() already applies. Rank distances are constant, not jittered.
      // A full-detail palm() costs ~400 verts, which at plantation density would
      // spend the entire circuit's budget on trees. Only the FRONT rank — the
      // one a driver actually resolves — gets them; the ranks behind use a
      // stripped two-primitive palm whose silhouette (bare trunk, one dense
      // crown) is all that survives at 40 m anyway.
      // The back straight runs 93-130 m from the pit straight, and the
      // stepped main stand and canopy fill the gap between them out to 40 m
      // from the pit straight's centreline: the back ranks stop short of it.
      const PIT_STRAIGHT = [];
      for (let s = 0.935; s < 1.035; s += 0.004) PIT_STRAIGHT.push(K(s % 1));
      const nearPitStraight = (x, z, r) =>
        PIT_STRAIGHT.some((k) => Math.hypot(px[k] - x, pz[k] - z) < r);
      function farPalm(k, side, dist, h, col) {
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 3.5)) return;
        if (nearPitStraight(a.c[0], a.c[2], 44)) return;
        const b = [a.r, a.u, a.t];
        out._mat = MAT.WOOD;
        addCyl(out, a.c, 0.30, h, [0.42, 0.35, 0.22], 4, b);
        out._mat = MAT.FOLIAGE;
        addCone(out, vadd(a.c, a.u, h - 1.2), 3.4, 3.0, col, 5, b);
        out._mat = 0;
      }
      let row = 0;
      along(0.10, 0.90, 26, (k) => {
        const stagger = (row & 1) ? 7 : 0;
        for (const side of [-1, 1]) {
          palm(k, side, 19 + stagger, 12.5, PALM_F);
          for (let r = 1; r < 4; r++)
            farPalm(k, side, 19 + stagger + r * 14, 12.5 - (r & 1 ? 0.8 : 0),
              (r & 1) ? PALM_FD : PALM_F);
        }
        row++;
      });
      // Wilder jungle scrub between the plantation and the verge.
      every(24, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.45) return;
        bush(k, h < 0.72 ? -1 : 1, 8 + h * 5, h < 0.6 ? JUNGLE : JUNGLE_L);
      });

      // Main Grandstand opposite the pit lane (ownPitStraight → pits on +1).
      // Operator + KKL call the tensile roof a Hibiscus Canopy (Malaysia's
      // national flower). Six connected petal bays — each a small warped
      // tensile patch (hypar panel grid + corner masts + edge beams) so the
      // ground-audit support BFS stays continuous. Not a single giant saddle.
      // Sources: sepangcircuit.com/architecture ; jpkkl.com/?p=2495.
      // T15 "umbrella" canopy left out: search-synthesis only, unverified.
      const FABRIC = [0.95, 0.95, 0.93], STEEL = [0.78, 0.78, 0.80];
      const SHELL_G = [0.82, 0.83, 0.82], SEAT_COLS = [
        [0.16, 0.44, 0.26], [0.90, 0.90, 0.86], [0.86, 0.72, 0.14],
      ];
      const emitPetalBay = (stage, s, side, gap, W, L, H, lift) => {
        const a = anchor(K(s), side, gap);
        const b = [a.r, a.u, a.t];
        const COLS = 4, ROWS = 5;
        const panelW = (W * 2) / COLS, panelL = (L * 2) / ROWS;
        for (let i = 0; i < COLS; i++) {
          for (let j = 0; j < ROWS; j++) {
            const u = -W + (i + 0.5) * panelW;
            const v = -L + (j + 0.5) * panelL;
            const y = lift + H * (u * v) / (W * L);
            const ar = Math.atan2(H * v, W * L);
            const at = Math.atan2(H * u, W * L);
            const p = vadd(vadd(vadd(a.c, a.r, u), a.t, v), a.u, y);
            const shade = ((i + j) & 1) ? 1 : 0.94;
            addBox(stage, p, [panelW * 1.08, 0.35, panelL * 1.08],
              [FABRIC[0] * shade, FABRIC[1] * shade, FABRIC[2] * shade], tilt2(a, ar, at));
          }
        }
        for (const [su, sv] of [[-1, -1], [1, 1]]) {
          const foot = vadd(vadd(a.c, a.r, su * W * 0.92), a.t, sv * L * 0.92);
          const top = lift + H * 0.92 * 0.92 + 2.5;
          addCyl(stage, foot, 0.55, top, STEEL, 8, b);
          addCyl(stage, vadd(foot, a.u, top), 0.28, 3.2, [0.62, 0.63, 0.66], 6, b);
        }
        for (const [su, sv] of [[-1, 1], [1, -1]]) {
          const foot = vadd(vadd(a.c, a.r, su * W * 0.92), a.t, sv * L * 0.92);
          const low = Math.max(3.0, lift - H * 0.85);
          addCyl(stage, foot, 0.45, low, STEEL, 8, b);
          addBox(stage, vadd(foot, a.u, low * 0.5), [0.16, low, 0.16], [0.55, 0.56, 0.60], b);
        }
        for (let j = 0; j <= ROWS; j++) {
          const v = -L + j * panelL;
          for (const su of [-1, 1]) {
            const u = su * W;
            const y = lift + H * (u * v) / (W * L);
            addBox(stage, vadd(vadd(vadd(a.c, a.r, u), a.t, v), a.u, y),
              [0.5, 0.65, panelL], [0.66, 0.67, 0.70], b);
          }
        }
      };
      const emitHibiscusCanopy = (stage) => {
        let si = 0;
        along(0.960, 0.015, 11, (k, spacing) => {
          const seg = spacing * 0.92;
          for (let t = 0; t < 5; t++) {
            const a = anchor(k, -1, 11 + t * 3.1);
            const b = [a.r, a.u, a.t];
            const h = 1.8 + t * 2.1;
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, h * 0.5 + 0.06), [2.9, h, seg],
              t & 1 ? [0.86, 0.86, 0.84] : SHELL_G, b);
            stage._mat = MAT.FABRIC;
            // Seat band overlaps the riser top so unsupported-BFS stays connected.
            addBox(stage, vadd(a.c, a.u, h + 0.35), [2.3, 0.85, seg * 0.94],
              SEAT_COLS[(si + t) % 3], b);
            stage._mat = 0;
          }
          const aB = anchor(k, -1, 27);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aB.c, aB.u, 7.5), [2.4, 15, seg], SHELL_G, [aB.r, aB.u, aB.t]);
          stage._mat = 0;
          si++;
        });
        for (let i = 0; i < 6; i++) {
          const s = (0.962 + (i + 0.5) / 6 * 0.048) % 1;
          emitPetalBay(stage, s, -1, 22, 10, 6.0, 7.0, 20);
        }
        if (typeof indexSolid === "function")
          indexSolid(0.958, 0.020, -1, 11, 20);
      };
      {
        const a0 = anchor(K(0.985), -1, 22);
        modelGroup("sepang-main-grandstand-canopy", {
          center: vadd(a0.c, a0.u, 16), size: [26, 34, 88], basis: [a0.r, a0.u, a0.t],
        }, emitHibiscusCanopy, { required: true });
      }

      {
        const WHITE = [0.94, 0.94, 0.92], TEAL = [0.10, 0.36, 0.34];
        const SHUTTER = [0.24, 0.26, 0.28], GLASS = [0.32, 0.46, 0.50];
        for (let i = 0; i < 5; i++) {
          const s = 0.955 + i * 0.011;
          const a = anchor(K(s), 1, 20);
          const b = [a.r, a.u, a.t];
          modelGroup(`sepang-pit-bay-${i + 1}`, {
            center: vadd(a.c, a.u, 8), size: [26, 20, 30], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            seat.box(stage, a.c, [17, 0.9, 28], [0.80, 0.80, 0.78], b);
            addBox(stage, vadd(vadd(a.c, a.r, 1.5), a.u, 3.6), [12, 6.0, 28], WHITE, b);
            stage._mat = MAT.METAL;
            for (let d = 0; d < 3; d++)
              addBox(stage, vadd(vadd(vadd(a.c, a.r, -4.7), a.u, 3.0), a.t, (d - 1) * 9),
                [0.35, 4.2, 6.4], SHUTTER, b);
            // Green accent band — Sepang's colour, on everything it owns.
            addBox(stage, vadd(vadd(a.c, a.r, -4.7), a.u, 6.0), [0.4, 0.7, 28], TEAL, b);
            stage._mat = MAT.GLASS;
            addBox(stage, vadd(a.c, a.u, 8.6), [12.4, 3.0, 28], GLASS, b);
            stage._mat = MAT.METAL;
            // Open gallery walkway over the lane on slim posts.
            addBox(stage, vadd(vadd(a.c, a.r, -7.5), a.u, 10.4), [6.5, 0.3, 28], WHITE, b);
            addBox(stage, vadd(vadd(a.c, a.r, -10.5), a.u, 11.0), [0.14, 1.0, 28], [0.72, 0.74, 0.76], b);
            for (let d = 0; d < 3; d++)
              addCyl(stage, vadd(vadd(a.c, a.r, -10.2), a.t, (d - 1) * 11), 0.16, 10.3,
                [0.78, 0.78, 0.80], 6, b);
            stage._mat = 0;
          }, { required: true });
        }
        const a = anchor(K(0.010), 1, 14);
        const b = [a.r, a.u, a.t];
        modelGroup("sepang-race-control", {
          center: vadd(a.c, a.u, 20), size: [12, 46, 14], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 15), [3.6, 30, 11], WHITE, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -2.0), a.u, 16), [0.6, 26, 9], [0.16, 0.28, 0.30], b);
          addBox(stage, vadd(vadd(a.c, a.r, -2.2), a.u, 27), [0.3, 5.0, 8.2], [0.90, 0.86, 0.60], b);
          stage._mat = MAT.METAL;
          for (let l = 0; l < 4; l++)
            addBox(stage, vadd(vadd(a.c, a.r, -3.4), a.u, 22 + l * 2.6), [3.4, 0.25, 10], WHITE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -1.5), a.u, 30.6), [9, 0.6, 13], WHITE, b);
          addBox(stage, vadd(a.c, a.u, 31.2), [4.0, 0.8, 11], TEAL, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 9, [0.15, 0.15, 0.18]);
      gantry(0.960, 8.5, [0.15, 0.15, 0.18]);
      for (let i = 0; i < 4; i++) {
        building(K(0.900 + i * 0.014), 1, 46, 21, 17, 16,
          { kind: "twin", wall: [0.88, 0.88, 0.86], window: [0.34, 0.42, 0.48], floor: 4.0 });
      }
      // Paddock motorhomes: discrete pads; skip any pad whose terrain disagrees
      // with the anchor (was burying up to 8 m on the verge slope).
      for (const [s, gap] of [
        [0.925, 32], [0.955, 34], [0.985, 32], [0.015, 34],
      ]) {
        const a = anchor(K(s), 1, gap);
        const gy = typeof terrainYAt === "function" ? terrainYAt(a.c[0], a.c[2]) : null;
        if (gy != null && Math.abs(gy - a.c[1]) > 0.8) continue;
        motorhome(K(s), 1, gap, 9, 3.6, 5.5,
          { wall: [0.66 + hash(K(s) * 71) * 0.24, 0.66, 0.68] });
      }
      broadcastCompound(K(0.892), 1, 58, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.97, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.20, 0.50, 0.30]);

      const TENT_ROOF = [0.94, 0.94, 0.92], TENT_FASCIA = [0.14, 0.42, 0.36];
      const shelter = (s, side, gap, len, opts) =>
        grandstandEx(s, side, gap, len, null, null, Object.assign(
          { roofCol: TENT_ROOF, fasciaCol: TENT_FASCIA }, opts));

      // K1 Grandstand at Turn 1 & 2 — positive rake (rows rise away from track).
      // https://www.sepangcircuit.com/k1-grandstand
      // Outside of the T1 right-hander (side -1); +1 clipped the infield fold.
      const emitT1Stand = (stage) => {
        const SHELL = [0.84, 0.85, 0.86];
        const depth = 12, h = 13, len = 40;
        const a = anchor(K(0.058), -1, 34 + depth / 2);
        const b = [a.r, a.u, a.t];
        stage._mat = MAT.CONCRETE;
        // Single back shell, sunk 0.4 m so the base is grounded.
        addBox(stage, vadd(vadd(a.c, a.r, -1.5), a.u, h * 0.45 - 0.2),
          [depth * 0.6, h * 0.9, len], SHELL, b);
        for (let t = 0; t < 4; t++) {
          const lat = depth * 0.36 - t * 1.5;
          // Stagger riser heights so consecutive tops are never coplanar.
          const yh = 1.55 + t * 2.25;
          addBox(stage, vadd(vadd(a.c, a.r, lat), a.u, yh * 0.5 - 0.15),
            [1.7, yh + 0.3, len - t * 2.4], t & 1 ? [0.78, 0.79, 0.80] : SHELL, b);
          stage._mat = MAT.FABRIC;
          addBox(stage, vadd(vadd(a.c, a.r, lat - 0.15), a.u, yh + 0.35 + t * 0.12),
            [1.15, 0.65, len - t * 2.4 - 2], SEAT_COLS[t % 3], b);
          stage._mat = MAT.CONCRETE;
        }
        // Cantilever roof embedded into the shell top (AABB-touch for BFS).
        stage._mat = MAT.METAL;
        const shellTop = h * 0.9 - 0.2;
        addBox(stage, vadd(vadd(a.c, a.r, 1.0), a.u, shellTop - 0.15),
          [depth + 1, 1.1, len + 1], TENT_ROOF, b);
        addBox(stage, vadd(vadd(a.c, a.r, depth * 0.38), a.u, shellTop - 0.55),
          [0.4, 1.2, len], TENT_FASCIA, b);
        addBox(stage, vadd(vadd(a.c, a.r, depth * 0.40), a.u, shellTop - 2.2),
          [0.25, 0.55, len * 0.9], [0.10, 0.42, 0.36], b);
        stage._mat = 0;
        if (typeof indexSolid === "function")
          indexSolid(0.048, 0.072, -1, 32, 14);
      };
      {
        const depth = 12, h = 14, len = 40;
        const a0 = anchor(K(0.058), -1, 34 + depth / 2);
        modelGroup("sepang-t1-grandstand", {
          center: vadd(a0.c, a0.u, (h + 1) / 2),
          size: [depth + 4, h + 1, len + 2],
          basis: [a0.r, a0.u, a0.t],
        }, emitT1Stand, { required: true });
      }

      // F Grandstand at Turns 7 & 8 — positive rake.
      // https://www.sepangcircuit.com/f-grandstand
      const emitT7Stand = (stage) => {
        const SHELL = [0.80, 0.81, 0.82];
        const depth = 11, h = 13, len = 36;
        const a = anchor(K(0.448), -1, 34 + depth / 2);
        const b = [a.r, a.u, a.t];
        stage._mat = MAT.CONCRETE;
        // Shell set back; rake steps get a 0.08 m y offset so tops are not coplanar.
        addBox(stage, vadd(a.c, a.u, h * 0.45 + 0.12), [depth * 0.7, h * 0.9, len], SHELL, b);
        for (let t = 0; t < 4; t++) {
          const lat = depth * 0.42 - t * 1.55;
          const yh = 1.8 + t * 2.1;
          addBox(stage, vadd(vadd(a.c, a.r, lat), a.u, yh * 0.5),
            [1.4, yh, len - t * 2], t & 1 ? [0.74, 0.75, 0.76] : [0.78, 0.79, 0.80], b);
          stage._mat = MAT.FABRIC;
          addBox(stage, vadd(vadd(a.c, a.r, lat), a.u, yh + 0.55 + t * 0.04),
            [1.1, 0.95, len - t * 2 - 2], SEAT_COLS[t % 3], b);
          stage._mat = MAT.CONCRETE;
        }
        stage._mat = MAT.METAL;
        addBox(stage, vadd(a.c, a.u, h + 0.2), [depth + 2, 0.45, len + 2], TENT_ROOF, b);
        addBox(stage, vadd(vadd(a.c, a.r, depth * 0.48), a.u, h - 0.4),
          [0.28, 0.7, len], TENT_FASCIA, b);
        addBox(stage, vadd(vadd(a.c, a.r, depth * 0.50), a.u, h * 0.68),
          [0.16, 0.45, len * 0.9], [0.10, 0.36, 0.34], b);
        stage._mat = 0;
        if (typeof indexSolid === "function")
          indexSolid(0.438, 0.460, -1, 32, 12);
      };
      {
        const depth = 11, h = 13, len = 36;
        const a0 = anchor(K(0.448), -1, 34 + depth / 2);
        modelGroup("sepang-t7-grandstand", {
          center: vadd(a0.c, a0.u, (h + 1) / 2),
          size: [depth + 4, h + 1, len + 2],
          basis: [a0.r, a0.u, a0.t],
        }, emitT7Stand, { required: true });
      }

      // Mid-lap and T15 covered stands (existing positions).
      shelter(0.340, -1, 34, 80, { livery: "teal", endWalls: true });
      shelter(0.580, 1, 30, 76, { livery: "navy", endWalls: true });
      shelter(0.885, -1, 26, 92, { livery: "concrete", tiers: 2, roof: "cantilever", endWalls: true });
      // Wider step to avoid coplanar risers on the grass bank.
      spectatorHill(0.62, 0.70, -1, 22, { rows: 3, rise: 1.15, depth: 2.0, density: 0.32, step: 14 });

      groundPatch(K(0.060), 1, 12, [40, 0.18, 56], GRAVEL,
        { id: "sepang-t1-gravel", samples: 8 });
      tyreWall(0.045, 0.080, 1, 10, [0.86, 0.20, 0.18]);
      marshalPost(K(0.065), -1, 12);

      groundPatch(K(0.580), 1, 10, [30, 0.18, 40], GRAVEL,
        { id: "sepang-t9-gravel", samples: 7 });
      tyreWall(0.565, 0.598, 1, 9, [0.20, 0.40, 0.85]);
      marshalPost(K(0.572), -1, 11);

      groundPatch(K(0.885), -1, 10, [34, 0.18, 44], GRAVEL,
        { id: "sepang-t15-gravel", samples: 7 });
      tyreWall(0.868, 0.902, -1, 9, [0.85, 0.78, 0.20]);
      marshalPost(K(0.880), 1, 11);

      waterBand(0.18, 0.28, -1, 30, 34, 3, [0.24, 0.32, 0.26], { id: "sepang-drain-north" });
      waterBand(0.62, 0.72, 1, 32, 36, 3, [0.24, 0.32, 0.26], { id: "sepang-drain-south" });

      for (const [s0, s1] of [[0.09, 0.30], [0.36, 0.55], [0.61, 0.75], [0.78, 0.86]]) {
        guardrail(s0, s1, -1, 9, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 9, [0.80, 0.81, 0.83]);
      }
      guardrail(0.92, 0.07, 1, 4.5, [0.85, 0.85, 0.88]);
      fence(0.93, 0.06, -1, 10, 4, [0.74, 0.76, 0.80]);
      fence(0.86, 0.91, -1, 10, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.13, 0.20, 0.26, 0.42, 0.50, 0.68, 0.78]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 10);
      }

      const { cx, cz, radius: rad } = lapBounds();
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [130, 50, 130, 34, 12, 4, [0.14, 0.36, 0.16]],   // plantation canopy wall
        [220, 40, 170, 44, 16, 6, [0.12, 0.31, 0.15]],
        [370, 26, 220, 70, 44, 26, [0.24, 0.34, 0.28]],  // limestone hills
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 32;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      {
        // Outside the lap (-1): on the infield side (+1) it stood on the 0.464
        // carriageway at every gap tried, 120-280 m, so it never emitted.
        const k = K(0.42);
        const a = anchor(k, -1, 180);
        const b = [a.r, a.u, a.t];
        modelGroup("sepang-klia-skyline", {
          center: vadd(a.c, a.u, 26), size: [40, 56, 120], basis: b,
        }, (stage) => {
          addCyl(stage, a.c, 5, 48, [0.72, 0.74, 0.78], 10, b);
          addBox(stage, vadd(a.c, a.u, 50), [12, 5, 12], [0.66, 0.70, 0.76], b);
          for (let i = 0; i < 3; i++) {
            const p = vadd(a.c, a.t, (i - 1) * 36);
            addPrism(stage, vadd(p, a.u, 7), [26, 8, 32], [0.74, 0.76, 0.80], b);
          }
        }, { required: true });
      }

      for (const [s, side, gap] of [
        [0.030, -1, 30], [0.065, 1, 36], [0.340, -1, 40], [0.580, 1, 36], [0.885, -1, 32],
      ]) {
        const a = anchor(K(s), side, gap);
        addCyl(out, a.c, 0.24, 22, [0.24, 0.24, 0.26], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 22.4), [1.8, 0.7, 3.4], [0.96, 0.94, 0.84], [a.r, a.u, a.t]);
      }
      // 0.024, not 0.020: at 0.020 the first walk stood coplanar with the end
      // of the stepped main stand (along 0.958-0.020, left, out to 31 m).
      for (const [i, s] of [[0, 0.024], [1, 0.035], [2, 0.050]]) {
        const a = anchor(K(s), -1, 30);
        const b = [a.r, a.u, a.t];
        modelGroup(`sepang-shade-walk-${i + 1}`, {
          center: vadd(a.c, a.u, 3), size: [9, 8, 30], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 4.6), [6.4, 0.35, 28], [0.90, 0.88, 0.82], b);
          for (let l = 0; l < 3; l++)
            addBox(stage, vadd(vadd(a.c, a.r, (l - 1) * 2.2), a.u, 5.0),
              [0.9, 0.5, 28], [0.72, 0.71, 0.66], b);
          for (let p = 0; p < 3; p++)
            addCyl(stage, vadd(a.c, a.t, (p - 1) * 11), 0.18, 4.6, [0.72, 0.72, 0.74], 6, b);
        });
      }
      for (const [id, s, side, gap] of [
        // 48 / 30 m: cleared of the new K1 shell at gap 44; T15 unchanged.
        ["t1", 0.080, 1, 52],
        ["t15", 0.900, -1, 30],
      ]) {
        const a = anchor(K(s), side, gap);
        const b = [a.r, a.u, a.t];
        modelGroup(`sepang-shade-walk-${id}`, {
          center: vadd(a.c, a.u, 3), size: [9, 8, 30], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 4.6), [6.4, 0.35, 28], [0.90, 0.88, 0.82], b);
          for (let l = 0; l < 3; l++)
            addBox(stage, vadd(vadd(a.c, a.r, (l - 1) * 2.2), a.u, 5.0),
              [0.9, 0.5, 28], [0.72, 0.71, 0.66], b);
          for (let p = 0; p < 3; p++)
            addCyl(stage, vadd(a.c, a.t, (p - 1) * 11), 0.18, 4.6, [0.72, 0.72, 0.74], 6, b);
        });
      }

      sponsorHoarding(0.955, 0.075, -1, 8, {
        h: 1.3, step: 11,
        palette: [[0.10, 0.52, 0.32], [0.94, 0.93, 0.90], [0.88, 0.16, 0.14], [0.96, 0.80, 0.10]],
      });
      cameraTower(K(0.055), -1, 12, { h: 16 });
      cameraTower(K(0.575), -1, 12, { h: 14 });
      cameraTower(K(0.878), 1, 12, { h: 15 });
    };
