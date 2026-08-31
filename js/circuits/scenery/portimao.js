/* Apex 26 — PORTIMAO scenery (data only), split out of js/circuits/portimao.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["portimao"] =
  function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, px, pz,
        pine, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, runoffApron,
        cameraTower, sponsorHoarding, signBoard, groundedSegments, bankedKerbStrip,
        addBox, addCyl, addCone, addPrism, addFrustum, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      {
        const CORK_LEAF  = [0.24, 0.34, 0.19];
        const CORK_LEAF2 = [0.29, 0.39, 0.22];
        const STRIPPED   = [0.55, 0.24, 0.14];   // freshly harvested trunk
        const BARK       = [0.44, 0.40, 0.33];   // corky grey above the strip
        const OLIVE_LEAF = [0.44, 0.48, 0.36];
        const OLIVE_BARK = [0.48, 0.45, 0.39];
        const SOIL       = [0.56, 0.44, 0.30];

        // Cork oaks: scattered, never in rows. Montado is grazed woodland, so
        // the spacing is wide and irregular and the ground between stays open.
        for (const [sf, side, gap] of [
          [0.055,  1,  72], [0.105, -1,  88], [0.165,  1, 104],
          [0.235, -1,  76], [0.300,  1,  92], [0.375, -1, 110],
          [0.440,  1,  80], [0.510, -1,  96], [0.585,  1, 116],
          [0.660, -1,  84], [0.735,  1, 100], [0.815, -1,  90],
          [0.885,  1,  74], [0.945, -1, 106],
        ]) {
          const kk = K(sf);
          const count = 2 + Math.floor(hash(kk * 17 + gap) * 3);
          for (let j = 0; j < count; j++) {
            const hv = hash(kk * 29 + j * 41 + gap);
            const a = anchor(kk + Math.round((j - 1) * 5 + (hv - 0.5) * 4),
                             side, gap + (j % 2) * 13 + (hv - 0.5) * 8);
            if (onTrack(a.c[0], a.c[2], 14)) continue;
            const b = [a.r, a.u, a.t];
            const h = 7.5 + hv * 3;
            const strip = h * 0.26;              // how far up the cork was cut
            out._mat = MAT.WOOD;
            addCyl(out, a.c, 0.52 + hv * 0.14, strip, STRIPPED, 6, b);
            addCyl(out, vadd(a.c, a.u, strip), 0.46 + hv * 0.12, h * 0.22, BARK, 6, b);
            out._mat = MAT.FOLIAGE;
            const spread = h * 0.72;
            addFrustum(out, vadd(a.c, a.u, h * 0.46), spread * 0.55, spread, h * 0.20,
                       hv < 0.5 ? CORK_LEAF : CORK_LEAF2, 8, b);
            addFrustum(out, vadd(a.c, a.u, h * 0.66), spread, spread * 0.42, h * 0.26,
                       hv < 0.5 ? CORK_LEAF2 : CORK_LEAF, 8, b);
            out._mat = 0;
          }
        }

        for (const [sf, side, gap, rows] of [
          [0.140, -1, 118, 4], [0.410,  1, 126, 4],
          [0.630,  1, 108, 5], [0.860, -1, 122, 4],
        ]) {
          const kk = K(sf), a0 = anchor(kk, side, gap);
          if (onTrack(a0.c[0], a0.c[2], 26)) continue;
          for (let r = 0; r < rows; r++) {
            for (let c = -2; c <= 2; c++) {
              const hv = hash(kk * 23 + r * 13 + c * 7);
              const a = anchor(kk + c * 3, side, gap + r * 9);
              if (onTrack(a.c[0], a.c[2], 12)) continue;
              const b = [a.r, a.u, a.t];
              const h = 4.2 + hv * 1.4;
              // Tilled soil ring under each tree — olive groves are ploughed.
              addBox(out, vadd(a.c, a.u, 0.05), [5.2, 0.10, 5.2], SOIL, b);
              out._mat = MAT.WOOD;
              addCyl(out, a.c, 0.30, h * 0.34, OLIVE_BARK, 5, b);
              out._mat = MAT.FOLIAGE;
              // Silver-green, small, rounded — an olive is a shrub on a leg.
              addFrustum(out, vadd(a.c, a.u, h * 0.30), h * 0.26, h * 0.40, h * 0.30,
                         OLIVE_LEAF, 7, b);
              addFrustum(out, vadd(a.c, a.u, h * 0.58), h * 0.40, h * 0.14, h * 0.34,
                         OLIVE_LEAF, 7, b);
              out._mat = 0;
            }
          }
        }
      }

      const PINE = [0.14, 0.31, 0.16], PINE_D = [0.11, 0.25, 0.14];
      const SCRUB = [0.34, 0.38, 0.21], SCRUB_D = [0.28, 0.32, 0.18];
      const EARTH = [0.66, 0.44, 0.30], EARTH_D = [0.54, 0.34, 0.23];
      const LIME = [0.95, 0.94, 0.90];          // whitewashed Algarve lime render
      const TERRA = [0.68, 0.36, 0.26];         // terracotta pantile
      const CONC = [0.76, 0.74, 0.70];

      const openArea = (s) => (s >= 0.93 || s <= 0.08) || (s >= 0.30 && s <= 0.42);
      every(32, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.45) return;
        pine(k, h < 0.5 ? -1 : 1, 16 + h * 14, 9 + h * 6, h < 0.6 ? PINE : PINE_D);
      });
      every(22, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.44) return;
        bush(k, h < 0.72 ? -1 : 1, 8 + h * 7, h < 0.6 ? SCRUB : SCRUB_D);
      });
      every(46, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.58) return;
        tree(k, h < 0.5 ? -1 : 1, 44 + h * 26, 8 + h * 5, [0.26, 0.36, 0.20]);
      });

      const hillsideTerrace = (s0, s1, side, gap, opts) => {
        opts = opts || {};
        const rows = opts.rows || 7, rise = opts.rise || 1.5, depth = opts.depth || 2.9;
        const dens = opts.density != null ? opts.density : 0.55;
        along(s0, s1, opts.step || 7, (k, spacing) => {
          const a = anchor(k, side, gap);
          const b = [a.r, a.u, a.t], seg = spacing * 0.96;
          out._mat = MAT.CONCRETE;
          // Retaining wall holding the first terrace off the run-off.
          addBox(out, vadd(a.c, a.u, 1.1), [0.9, 2.2, seg], CONC, b);
          for (let r = 0; r < rows; r++) {
            const back = 1.2 + r * depth, up = 1.6 + r * rise;
            out._mat = MAT.CONCRETE;
            addBox(out, vadd(vadd(a.c, a.r, side * back), a.u, up),
              [depth, rise + 0.3, seg], r & 1 ? CONC : [0.70, 0.68, 0.65], b);
            const h = hash(k * 17 + r * 11);
            if (h > dens) continue;
            out._mat = MAT.FABRIC;
            addBox(out, vadd(vadd(vadd(a.c, a.r, side * back),
              a.t, (h - 0.3) * seg * 0.7), a.u, up + rise * 0.5 + 0.55),
              [0.55, 1.0, 0.6],
              h < 0.2 ? [0.86, 0.30, 0.24] : h < 0.38 ? [0.92, 0.90, 0.86] : [0.24, 0.36, 0.62], b);
          }
          out._mat = 0;
          const topBack = 1.2 + rows * depth, topUp = 1.6 + rows * rise;
          addPrism(out, vadd(vadd(a.c, a.r, side * (topBack + 2.4)), a.u, topUp),
            [6, 3.4, seg], EARTH_D, b);
        });
      };
      hillsideTerrace(0.035, 0.095, 1, 16, { rows: 8, density: 0.6 });   // Turn 1 amphitheatre
      hillsideTerrace(0.470, 0.530, -1, 18, { rows: 6 });
      hillsideTerrace(0.835, 0.890, 1, 16, { rows: 7 });
      hillsideTerrace(0.280, 0.360, 1, 15, { rows: 6, rise: 1.4, depth: 2.7, density: 0.5, step: 8 });
      hillsideTerrace(0.620, 0.700, -1, 15, { rows: 6, rise: 1.4, depth: 2.7, density: 0.5, step: 8 });

      for (const [i, s] of [0.942, 0.960, 0.978, 0.996].entries()) {
        const a = anchor(K(s), 1, 20);
        const b = [a.r, a.u, a.t];
        modelGroup(`portimao-pit-bay-${i + 1}`, {
          center: vadd(a.c, a.u, 8), size: [22, 18, 42], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 4.2), [16, 8.4, 40], LIME, b);
          // Upper hospitality storey, set back so the wave roof reads clear of it.
          addBox(stage, vadd(vadd(a.c, a.r, 2.4), a.u, 10.4), [11, 4.2, 38],
            [0.90, 0.89, 0.86], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -8.1), a.u, 4.0), [0.4, 4.4, 37],
            [0.15, 0.22, 0.30], b);
          addBox(stage, vadd(vadd(a.c, a.r, -3.0), a.u, 10.6), [0.4, 3.0, 36],
            [0.16, 0.26, 0.34], b);
          stage._mat = MAT.METAL;
          for (let p = 0; p < 6; p++) {
            const ph = (i * 6 + p) / 5.5;
            const lift = 13.4 + Math.sin(ph * 1.15) * 1.7;
            const off = (p - 2.5) * 6.6;
            addBox(stage, vadd(vadd(a.c, a.t, off), a.u, lift), [21, 0.5, 6.7],
              [0.94, 0.94, 0.92], b);
            addBox(stage, vadd(vadd(vadd(a.c, a.t, off), a.r, -10.2), a.u, lift - 0.45),
              [0.5, 0.6, 6.7], [0.20, 0.44, 0.28], b);   // green fascia lip
          }
          // Slim raking struts carrying the roof out over the pit lane.
          for (let c = 0; c < 4; c++) {
            const off = (c - 1.5) * 9.6;
            addCyl(stage, vadd(vadd(vadd(a.c, a.t, off), a.r, -9.2), a.u, 6.6),
              0.16, 13.2, [0.88, 0.88, 0.90], 6, b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.992), 1, 28);
        const b = [a.r, a.u, a.t];
        modelGroup("portimao-race-control", {
          center: vadd(a.c, a.u, 13), size: [14, 32, 14], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 10), [5.5, 20, 5.5], LIME, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -2.2), a.u, 21.5), [11, 4.6, 11],
            [0.16, 0.22, 0.30], b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.r, -2.2), a.u, 24.2), [12, 0.6, 12],
            [0.94, 0.94, 0.92], b);
          // Portuguese green/red band under the cab.
          addBox(stage, vadd(vadd(a.c, a.r, -2.2), a.u, 18.9), [11.4, 0.7, 5.4],
            [0.16, 0.44, 0.26], b);
          addBox(stage, vadd(vadd(vadd(a.c, a.r, -2.2), a.t, 3.0), a.u, 18.9),
            [11.4, 0.7, 5.4], [0.76, 0.16, 0.16], b);
          addCyl(stage, vadd(a.c, a.u, 24.4), 0.12, 8, [0.88, 0.88, 0.90], 5, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.968, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 11, 140, null, null,
        { livery: "terracotta", tiers: 2, roof: "flat", suites: true, endWalls: true, pylons: true });
      for (let i = 0; i < 4; i++) {
        building(K(0.925 + i * 0.013), 1, 40, 25, 13, 17,
          { kind: "ziggurat", wall: LIME, window: [0.32, 0.36, 0.42], floor: 4.5 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 56 + h * 10, 10, 4, 6, { wall: [0.66 + h * 0.24, 0.66, 0.68] });
      });
      broadcastCompound(K(0.916), 1, 74, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.16, 0.42, 0.24]);

      groundPatch(K(0.050), -1, 6, [34, 0.18, 46], EARTH,
        { id: "portimao-t1-gravel", samples: 8 });
      tyreWall(0.035, 0.070, -1, 5, [0.86, 0.20, 0.18]);
      marshalPost(K(0.055), 1, 10);

      groundPatch(K(0.300), 1, 5, [26, 0.18, 34], EARTH,
        { id: "portimao-t5-gravel", samples: 6 });
      tyreWall(0.288, 0.318, 1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.305), -1, 9);

      groundPatch(K(0.640), -1, 5, [28, 0.18, 36], EARTH,
        { id: "portimao-t11-gravel", samples: 6 });
      tyreWall(0.626, 0.656, -1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.645), 1, 9);

      groundPatch(K(0.900), 1, 5, [24, 0.18, 32], EARTH,
        { id: "portimao-final-gravel", samples: 6 });
      marshalPost(K(0.895), -1, 9);

      {
        const RK = [0.86, 0.13, 0.14], WK = [0.95, 0.95, 0.93];
        const BK = [0.14, 0.28, 0.62], YK = [0.90, 0.72, 0.12];
        for (const [s0, s1, side, red] of [
          [0.034, 0.078,  1, RK],   // Turn 1 apex (gravel + tyre wall sit on -1)
          [0.034, 0.076, -1, RK],   // Turn 1 exit kerb
          [0.135, 0.176, -1, BK],   // the downhill esses
          [0.190, 0.234,  1, YK],   // Turn 3 crest
          [0.284, 0.322, -1, RK],   // Turn 5 (tyre wall on +1)
          [0.360, 0.402,  1, BK],   // middle-sector chicane
          [0.468, 0.512,  1, RK],
          [0.560, 0.602, -1, YK],
          [0.624, 0.664,  1, RK],   // Turn 11 (tyre wall on -1)
          [0.758, 0.800, -1, BK],
          [0.884, 0.922, -1, RK],   // final corner apex (gravel on +1)
          [0.884, 0.920,  1, RK],   // final corner exit
        ]) bankedKerbStrip(s0, s1, side, { safer: false, step: 3.0, kerbRed: red, kerbWht: WK });
      }

      for (const side of [-1, 1]) {
        let i = 0;
        along(0.10, 0.93, 26, (k, spacing) => {
          runoffApron(k, side, 3.2, [11, 0.16, spacing * 1.04],
            (i++ & 1) ? EARTH : EARTH_D);
        });
      }
      for (const [id, s0, s1, side] of [
        ["portimao-cut-t3", 0.150, 0.235, 1],
        ["portimao-cut-t11", 0.560, 0.640, -1],
      ]) {
        const pts = [];
        for (let s = s0; s <= s1 + 1e-9; s += 0.012) pts.push({ k: K(s), side, dist: 20 });
        groundedSegments({ id, points: pts, width: 9, height: 5.5, color: EARTH_D });
      }

      for (const [s0, s1] of [[0.09, 0.28], [0.33, 0.48], [0.53, 0.62], [0.68, 0.85]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.07, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.15, 0.22, 0.44, 0.56, 0.74, 0.88]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [125, 44, 130, 44, 18, 12, [0.28, 0.34, 0.20]],
        [225, 34, 180, 60, 32, 20, [0.30, 0.33, 0.24]],
        [370, 26, 240, 78, 54, 30, [0.40, 0.38, 0.32]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 34;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      {
        const board = [0.94, 0.94, 0.90];
        for (const s of [0.19, 0.35, 0.55, 0.77, 0.92]) {
          for (let i = 0; i < 3; i++) {
            const a = anchor(K(s + i * 0.006), 1, 7.5);
            addBox(out, vadd(a.c, a.u, 1.6), [0.18, 1.5, 2.0], board, [a.r, a.u, a.t]);
            addCyl(out, a.c, 0.10, 1.1, [0.25, 0.25, 0.28], 5, [a.r, a.u, a.t]);
          }
        }
      }
      const quinta = (id, s, side, gap, count) => {
        const a = anchor(K(s), side, gap);
        const b = [a.r, a.u, a.t];
        modelGroup(id, {
          center: vadd(a.c, a.u, 5), size: [26, 14, 22 + count * 11], basis: b,
        }, (stage) => {
          for (let i = 0; i < count; i++) {
            const h = hash(i * 13 + gap);
            const p = vadd(vadd(a.c, a.t, (i - (count - 1) / 2) * 11),
              a.r, side * (h < 0.5 ? -2.5 : 2.5));
            const w = 8 + h * 3, d = 8 + hash(i * 7) * 3, bh = 4.4 + h * 1.6;
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(p, a.u, bh / 2), [w, bh, d], LIME, b);
            addPrism(stage, vadd(p, a.u, bh), [w + 0.5, 1.6, d + 0.5], TERRA, b);
            addBox(stage, vadd(vadd(p, a.t, d * 0.28), a.u, bh + 1.9),
              [1.1, 2.0, 1.1], LIME, b);
            stage._mat = 0;
            // Deep-shaded window and door openings.
            addBox(stage, vadd(vadd(p, a.r, -side * (w / 2 + 0.05)), a.u, bh * 0.55),
              [0.2, 1.3, d * 0.5], [0.22, 0.20, 0.20], b);
          }
          // Dry-stone yard wall closing the cluster off.
          stage._mat = MAT.STONE;
          addBox(stage, vadd(vadd(a.c, a.r, side * 8), a.u, 0.8),
            [0.6, 1.6, count * 10], [0.84, 0.80, 0.72], b);
          stage._mat = 0;
        });
      };
      quinta("portimao-quinta-north", 0.24, -1, 88, 4);
      quinta("portimao-quinta-south", 0.68, 1, 92, 3);

      {
        const a = anchor(K(0.415), 1, 104);
        const b = [a.r, a.u, a.t];
        modelGroup("portimao-moinho", {
          center: vadd(a.c, a.u, 6), size: [16, 16, 16], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addFrustum(stage, a.c, 3.4, 2.6, 7.5, LIME, 10, b);
          stage._mat = MAT.WOOD;
          addCone(stage, vadd(a.c, a.u, 7.5), 3.0, 2.4, [0.46, 0.34, 0.26], 10, b);
          const hub = vadd(vadd(a.c, a.u, 8.0), a.r, -3.0);
          addCyl(stage, hub, 0.28, 1.2, [0.40, 0.30, 0.22], 6, [a.r, a.t, a.u]);
          for (let i = 0; i < 4; i++) {
            const ang = i * Math.PI / 2 + 0.4;
            const cA = Math.cos(ang), sA = Math.sin(ang);
            const dir = [], perp = [];
            for (let axis = 0; axis < 3; axis++) {
              dir[axis] = a.u[axis] * cA + a.t[axis] * sA;
              perp[axis] = a.t[axis] * cA - a.u[axis] * sA;
            }
            addBox(stage, vadd(hub, dir, 3.0), [0.35, 6.0, 0.22], [0.42, 0.32, 0.24],
              [a.r, dir, perp]);
          }
          stage._mat = 0;
        });
      }

      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.905 + i * 0.012), 1, 54 + i * 9);
        const b = [a.r, a.u, a.t];
        modelGroup(`portimao-hillside-apartments-${i + 1}`, {
          center: vadd(a.c, a.u, 5), size: [18, 12, 30], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 3.6), [12, 7.2, 26], LIME, b);
          addPrism(stage, vadd(a.c, a.u, 7.2), [12.6, 1.5, 26.6], TERRA, b);
          stage._mat = 0;
          // Continuous balcony slab facing back down the hill toward the track.
          addBox(stage, vadd(vadd(a.c, a.r, -6.4), a.u, 4.4), [1.6, 0.25, 25],
            [0.88, 0.86, 0.82], b);
          addBox(stage, vadd(vadd(a.c, a.r, -7.1), a.u, 5.0), [0.15, 1.0, 25],
            [0.80, 0.78, 0.74], b);
        });
      }

      for (let i = 0; i < 3; i++) signBoard(K(0.012 + i * 0.009), -1, 7, "braking", 3 - i);
      signBoard(K(0.055), 1, 7.5, "corner", 1);
      signBoard(K(0.300), -1, 7.5, "corner", 5);
      signBoard(K(0.640), 1, 7.5, "corner", 11);
      sponsorHoarding(0.940, 0.060, -1, 3.4, { h: 1.15, step: 9 });
      // Camera towers on the high ground, where the whole valley is visible.
      cameraTower(K(0.055), 1, 26, { h: 16 });
      cameraTower(K(0.500), -1, 28, { h: 18 });
      cameraTower(K(0.860), 1, 26, { h: 16 });
      for (const [s0, s1] of [[0.1, 0.28], [0.44, 0.91]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 16, { density: 0.52, hMin: 9, hMax: 16, pineFrac: 0.78, col: PINE, col2: PINE_D });
      }
    };
