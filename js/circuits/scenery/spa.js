/* Apex 26 — SPA scenery (data only), split out of js/circuits/spa.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["spa"] =
  function (api) {
      const { out, MAT, seat, n, px, pz, pyMin, hash, every, place, backdrop, pal,
              addBox, addCyl, addCone, addPrism, addFrustum, addPyramid, vadd, anchor,
              mountain, pine, tree, forestEdge, building, motorhome,
              marshalPost, gantry, billboard, fence, guardrail, tyreWall, wall,
              modelGroup, overheadSpan, groundPatch, circuitKit, ATM, onTrack,
              grandstandEx, spectatorHill, broadcastCompound, sponsorHoarding,
              waterSurface, terrainYAt, bakedModel, along } = api;
      const K = (s) => Math.round(s * n) % n;

      // 1. Cool Ardennes atmosphere — grey zenith/horizon/fog; kill alpine sun.
      if (ATM && ATM.dampArdennes) Object.assign(pal, ATM.dampArdennes);

      gantry(0.0, 7.5, [0.26, 0.28, 0.32]);

      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ranges = [
        // near forested wall — wMin/wVar sized so max(w)*0.62 < extra-8 (guard won't fire)
        { extra: 280, wMin: 160, hMin: 56, hVar: 54, wVar: 80, count: 32, phase: 0.0,
          opts: { seg: 7, rough: 0.30, forest: [0.10, 0.32, 0.14], rock: [0.28, 0.32, 0.28], snowline: 2 } },
        // mid forested wall — offset to fill the seams of the near ring
        { extra: 290, wMin: 340, hMin: 92, hVar: 70, wVar: 150, count: 26, phase: 0.5,
          opts: { seg: 7, rough: 0.32, forest: [0.13, 0.36, 0.17], rock: [0.34, 0.38, 0.36], snowline: 2 } },
        // far hazed range — paler damp grey-green (no snow)
        { extra: 450, wMin: 380, hMin: 132, hVar: 110, wVar: 150, count: 22, phase: 0.0,
          opts: { seg: 7, rough: 0.34, forest: [0.18, 0.42, 0.20], rock: [0.46, 0.50, 0.50], snowline: 2 } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.phase + rg.extra * 0.004) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          // jitter the radius inward/outward so the wall has depth but never opens a gap
          const rr = ring - rg.wMin * 0.18 + hash(i * 5 + rg.extra) * rg.wMin * 0.30;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                   rg.wMin + h * rg.wVar, rg.hMin + h * rg.hVar, Object.assign({ seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      every(64, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 13 + side) * 100, [110, 22, 90], [0.13, 0.30, 0.16]);
        }
      });

      every(44, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 41 + side);
          if (s < 0.26) continue;
          const dist = 8 + s * 20, h = 9 + s * 9;
          pine(k, side, dist, h, [0.09 + s * 0.05, 0.30, 0.14]);
          if (s > 0.70) pine(k, side, dist + 12 + s * 16, h + 3, [0.11 + s * 0.05, 0.28, 0.13]);
        }
      });
      // Fill the sparse stretches: a staggered front-line rank offset from the above.
      every(64, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 67 + side * 5 + 3);
          if (s < 0.58) continue;
          const dist = 6 + s * 10, h = 8 + s * 7;
          pine(k, side, dist, h, [0.10 + s * 0.04, 0.31, 0.15]);
        }
      });
      // Hero density at Eau Rouge / Raidillon (s≈0.05–0.10): crowd the climb with pines.
      every(12, (k) => {
        const s = k / n;
        if (s < 0.045 || s > 0.12) return;
        for (const side of [-1, 1]) {
          const r = hash(k * 53 + side);
          pine(k, side, 7 + r * 10, 10 + r * 10, [0.08 + r * 0.05, 0.31, 0.15]);
          if (r > 0.5) pine(k, side, 20 + r * 10, 13 + r * 9, [0.10 + r * 0.04, 0.28, 0.13]);
        }
      });

      if (circuitKit) {
        circuitKit.pitBuilding({
          id: "kit:spa:pit-building", frac: 0.006, side: -1, gap: 9,
          size: [14, 11, 64], garages: 16, required: true,
        });
        circuitKit.raceControl({ style: "lattice",
          id: "kit:spa:race-control", frac: 0.014, side: -1, gap: 45,
          size: [12, 24, 14], required: true,
        });
      }
      motorhome(Math.round(n * 0.001) % n, -1, 24, 16, 8, 20, { wall: [0.88, 0.89, 0.91], window: [0.30, 0.38, 0.46] });
      motorhome(Math.round(n * 0.006) % n, -1, 24, 15, 7, 18, { wall: [0.82, 0.84, 0.88], window: [0.32, 0.40, 0.48] });
      motorhome(Math.round(n * 0.994) % n, -1, 24, 15, 7, 18, { wall: [0.86, 0.87, 0.90], window: [0.30, 0.38, 0.46] });
      // Lone weathered old pit building on the original Kemmel straight (s≈0.10, far left).
      building(Math.round(n * 0.10) % n, -1, 40, 12, 9, 40, { kind: "chevron", wall: [0.74, 0.72, 0.66], window: [0.34, 0.34, 0.32], floor: 4 });
      broadcastCompound(K(0.755), -1, 45, { vans: 3, dishes: 2, mastH: 9 });

      {
        const pads = [
          ["kenney_com_building-e", 0.748, -1, 58],
          ["kenney_ind_building-h", 0.772, -1, 56],
          ["kenney_com_low-detail-building-wide-a", 0.105, -1, 52],
          ["kenney_twr_building-sample-tower-a", 0.018, -1, 52],
        ];
        for (const [id, s, side, dist] of pads) {
          if (!bakedModel(id, K(s), side, dist))
            building(K(s), side, dist, 16, 12, 14,
              { kind: "hall", wall: [0.70, 0.68, 0.64], window: [0.30, 0.32, 0.34], floor: 4 });
        }
      }
      // Jersey barriers on La Source runoff (pack-optional; tyreWall stays).
      along(0.015, 0.028, 4.5, (k) => {
        bakedModel("kenney_construction-barrier", k, 1, 6.2, { scale: 1.15 });
      });
      along(0.016, 0.027, 6.0, (k) => {
        bakedModel("kenney_construction-cone", k, 1, 5.0, { tint: [1.0, 0.42, 0.10] });
      });

      const ARD_TIMBER = [0.46, 0.36, 0.26];   // creosote-dark plank
      const ARD_STEEL  = [0.62, 0.64, 0.66];   // galvanised frame
      const ARD_ROOF   = [0.14, 0.24, 0.18];   // dark green painted sheet
      const ARD_FANS = [
        [0.96, 0.44, 0.06], [0.94, 0.50, 0.10], [0.98, 0.56, 0.14], [0.90, 0.40, 0.05],
        [0.84, 0.16, 0.14], [0.90, 0.82, 0.22], [0.16, 0.16, 0.18], [0.88, 0.88, 0.86],
      ];
      function ardennesTerrace(id, k, side, dist, bays, opts) {
        opts = opts || {};
        const rows = opts.rows || 7, pitch = 6.4, len = bays * pitch;
        const fans = opts.fans || ARD_FANS;
        const backH = 2.2 + rows * 1.3;
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        const IN = -side;                        // +1 along a.r faces the track
        modelGroup(id, {
          center: vadd(a.c, a.u, (backH + 5.4) / 2),
          size: [15, backH + 5.4, len + 3], basis: b,
        }, (stage) => {
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            stage._mat = MAT.METAL;
            seat.cyl(stage, vadd(p, a.r, IN * 5.0), 0.15, 2.2, ARD_STEEL, 5, b);
            seat.cyl(stage, vadd(p, a.r, -IN * 5.0), 0.17, backH + 4.2, ARD_STEEL, 5, b);
            addBox(stage, vadd(p, a.u, backH * 0.45), [10.2, 0.14, 0.14], ARD_STEEL, b);
            addBox(stage, vadd(p, a.u, backH + 2.6), [11.4, 0.16, 0.16], ARD_STEEL, b);
          }
          for (let t = 0; t < rows; t++) {
            const lat = IN * (4.5 - t * 1.26), y = 1.2 + t * 1.3;
            stage._mat = MAT.WOOD;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.26, 0.2, len], ARD_TIMBER, b);
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.2), [0.95, 0.75, len - 1.4],
              (t % 2) ? [0.52, 0.41, 0.30] : [0.44, 0.35, 0.26], b);
            stage._mat = MAT.FABRIC;
            for (let j = 0; j * 0.92 < len - 3; j++) {
              const h2 = hash(k * 29 + t * 71 + j * 37);
              if (h2 < 0.38) continue;
              seat.box(stage,
                vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1.5 + j * 0.92), a.u, y + 0.9),
                [0.52, 0.95, 0.44], fans[Math.floor(h2 * 71) % fans.length], b);
            }
          }
          stage._mat = MAT.METAL;
          for (let i = 0; i * 1.5 < len; i++) {
            const p = vadd(a.c, a.t, -len / 2 + i * 1.5 + 0.75);
            addBox(stage, vadd(vadd(p, a.r, -IN * 0.4), a.u, backH + 3.3),
              [11.8, 0.24, 0.8], (i % 2) ? ARD_ROOF : [0.18, 0.28, 0.21], b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, IN * 5.5), a.u, backH + 3.0),
            [0.34, 0.34, len], [0.50, 0.52, 0.54], b);
          stage._mat = 0;
        });
      }

      const GOLD4 = [0.46, 0.47, 0.50];   // darker concrete — Raidillon Gold 4 mass
      grandstandEx(0.00, 1, 8, 46, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.02, 1, 8, 26, null, null,
        { livery: "crimson", roof: "truss", endWalls: true, h: 9 });
      for (const [s, gp] of [[0.070, 8], [0.088, 9], [0.097, 9]]) {
        grandstandEx(s, 1, gp, 26, GOLD4, [0.96, 0.46, 0.08],
          { tiers: 2, roof: "cantilever", pylons: true, roofCol: [0.62, 0.63, 0.66], fasciaCol: GOLD4 });
      }
      ardennesTerrace("spa-terrace-raidillon", K(0.105), 1, 16, 7, { rows: 7 });
      billboard(Math.round(n * 0.085) % n, 1, 14, 18, 10, [0.05, 0.06, 0.09]);
      // Stepped banking slabs climbing the R hillside behind/beside the stands.
      place(K(0.072), 1, 22, [10, 2.4, 16], GOLD4);
      place(K(0.080), 1, 26, [11, 3.6, 18], [0.44, 0.45, 0.48]);
      place(K(0.090), 1, 30, [12, 4.8, 20], [0.42, 0.43, 0.46]);
      sponsorHoarding(0.10, 0.18, -1, 3, { h: 1.2 });
      ardennesTerrace("spa-terrace-kemmel", K(0.135), -1, 14, 6, { rows: 5 });
      grandstandEx(0.16, 1, 8, 30, null, null,
        { livery: "orange", roof: "flat", endWalls: true });
      ardennesTerrace("spa-terrace-fagnes", K(0.60), -1, 16, 6, { rows: 6 });
      ardennesTerrace("spa-terrace-busstop", K(0.905), 1, 15, 5, { rows: 6 });
      // Bus Stop chicane: braking-zone stand facing the final complex.
      grandstandEx(0.92, 1, 8, 28, null, null, { livery: "steel", roof: "cantilever", pylons: true, endWalls: true });
      grandstandEx(0.848, 1, 12, 36, null, null,
        { livery: "concrete", tiers: 2, roof: "truss" });

      every(120, (k) => {
        const side = hash(k * 33) < 0.5 ? -1 : 1;
        marshalPost(k, side, 4);
      });
      // Extra marshal posts flanking pit entry (s≈0.97).
      marshalPost(Math.round(n * 0.97) % n, -1, 4);
      marshalPost(Math.round(n * 0.97) % n, 1, 4);

      // 3a. Pouhon marshal cluster (s≈0.55 L) — orange-capped posts at the sweeper.
      for (const ds of [-0.010, -0.004, 0.002, 0.008]) {
        marshalPost(K(0.55 + ds), -1, 4.2);
      }

      wall(0.055, 0.075, -1, 3.6, 1.8, [0.55, 0.55, 0.52], 1.2);
      place(K(0.060), -1, 5.2, [1.6, 1.6, 28], [0.52, 0.52, 0.50]);
      place(K(0.068), -1, 4.8, [1.4, 1.5, 24], [0.54, 0.54, 0.51]);
      {
        const BROOK = [0.18, 0.28, 0.22];
        waterSurface(K(0.059), -1, 8, [2.6, 0.14, 22], BROOK, { id: "spa-eau-rouge-brook-a" });
        waterSurface(K(0.067), -1, 8, [2.3, 0.14, 20], BROOK, { id: "spa-eau-rouge-brook-b" });
        waterSurface(K(0.074), -1, 8, [2.0, 0.14, 18], BROOK, { id: "spa-eau-rouge-brook-c" });
      }

      // 3b. Stavelot runoff + barriers against the treeline (s≈0.75–0.80 R).
      groundPatch(K(0.775), 1, 3.2, [16, 0.35, 42], [0.42, 0.42, 0.40],
                  { id: "spa-stavelot-runoff-a", samples: 6 });
      groundPatch(K(0.790), 1, 3.5, [14, 0.35, 36], [0.40, 0.40, 0.38],
                  { id: "spa-stavelot-runoff-b", samples: 6 });
      tyreWall(0.762, 0.798, 1, 5.0, [0.55, 0.55, 0.52]);
      guardrail(0.748, 0.810, 1, 3.5, [0.84, 0.85, 0.88]);

      function chalet(k, side, dist, w, h, d, wallCol, roofCol) {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        const bounds = { center: vadd(a.c, a.u, h), size: [w * 1.2, h * 2, d * 1.1], basis: b };
        modelGroup(`spa-chalet-${k}-${side}`, bounds, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, h / 2), [w, h, d], wallCol, b);              // body
          stage._mat = MAT.ROOF;
          addPrism(stage, vadd(a.c, a.u, h), [w * 1.05, h * 0.7, d], roofCol, b);   // steep roof
          stage._mat = MAT.STONE;
          addBox(stage, vadd(vadd(vadd(a.c, a.u, h + h * 0.5), a.t, d * 0.28), a.r, w * 0.26),
                 [w * 0.16, h * 0.85, w * 0.16], [0.42, 0.40, 0.38], b);            // stone chimney
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.u, h * 0.5), a.r, -side * (w * 0.5 + 0.06)),
                 [0.12, h * 0.34, d * 0.42], [0.98, 0.85, 0.50], b);                // warm-lit window
        });
      }

      function rvCamp(k, side, dist, count) {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        const vanCols = [[0.86, 0.87, 0.88], [0.80, 0.44, 0.26], [0.72, 0.74, 0.78], [0.60, 0.66, 0.58]];
        const tentCols = [[0.78, 0.30, 0.24], [0.24, 0.44, 0.62], [0.86, 0.74, 0.30], [0.40, 0.56, 0.34]];
        const centre = vadd(a.c, a.r, -side * 4.5);
        modelGroup(`spa-rv-camp-${k}-${side}`, {
          center: vadd(centre, a.u, 2.5), size: [14, 5, Math.max(28, count * 4.5)], basis: b,
        }, (stage) => {
          for (let i = 0; i < count; i++) {
            const row = i % 2, col = (i / 2) | 0;
            const off = (col - count / 4) * 9;
            const base = vadd(vadd(a.c, a.t, off), a.r, -side * (row * 9));
            if (hash(k * 3 + i) < 0.55) {
              const vc = vanCols[(hash(k * 7 + i) * 4) | 0];
              stage._mat = MAT.METAL;
              addBox(stage, vadd(base, a.u, 1.9), [3.0, 2.6, 6.2], vc, b);          // caravan body
              addBox(stage, vadd(base, a.u, 3.3), [3.1, 0.5, 6.2],
                     [vc[0] * 0.8, vc[1] * 0.8, vc[2] * 0.8], b);                 // roof cap
              stage._mat = 0;
            } else {
              const tc = tentCols[(hash(k * 11 + i) * 4) | 0];
              stage._mat = MAT.FABRIC;
              addPrism(stage, vadd(base, a.u, 0.2), [3.4, 1.9, 4.2], tc, b);        // ridge tent
              stage._mat = 0;
            }
          }
          stage._mat = MAT.FABRIC;
          addBox(stage, vadd(a.c, a.u, 2.6), [7, 0.15, 5], [0.90, 0.90, 0.86], b); // shared awning
          stage._mat = 0;
          addCone(stage, a.c, 0.6, 1.0, [0.95, 0.55, 0.15], 5, b);                 // campfire glow
        });
      }

      function timingTower(k, side, dist) {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        modelGroup("spa-timing-tower", {
          center: vadd(a.c, a.u, 16), size: [10, 32, 10], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 6), [8, 12, 8], [0.80, 0.78, 0.72], b);      // base office
          stage._mat = MAT.METAL;
          addFrustum(stage, vadd(a.c, a.u, 12), 3.4, 2.6, 10, [0.84, 0.82, 0.76], 6, b);// shaft
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, 23), [5.5, 3.2, 5.5], [0.18, 0.22, 0.28], b);// glazed timing box
          stage._mat = 0;
          addBox(stage, vadd(a.c, a.u, 23), [5.6, 1.6, 5.6], [0.90, 0.92, 0.86], b);// lit interior band
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 24.7), [6, 0.6, 6], [0.30, 0.30, 0.34], b);  // roof slab
          addCyl(stage, vadd(a.c, a.u, 24.8), 0.12, 6, [0.42, 0.42, 0.46], 4, b);   // flag mast
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.u, 18), a.r, -side * 4.05), [0.2, 2.4, 2.4],
                 [0.94, 0.93, 0.88], b);                                           // trackside clock face
        }, { required: true });
      }

      function footbridge(s, deckCol) {
        const kb = K(s);
        const L = anchor(kb, -1, 3), R = anchor(kb, 1, 3);
        const span = Math.hypot(R.c[0] - L.c[0], R.c[2] - L.c[2]) + 3;
        const h = 6.5, id = `spa-footbridge-${Math.round(s * 1000)}`;
        for (const [suffix, a] of [["left", L], ["right", R]]) {
          const b = [a.r, a.u, a.t], c = vadd(a.c, a.u, h / 2);
          modelGroup(`${id}-${suffix}-support`, {
            center: c, size: [3, h, 3], basis: b,
          }, (stage) => {
            stage._mat = MAT.METAL;
            addBox(stage, c, [3, h, 3], [0.55, 0.56, 0.58], b);
          }, { required: true });
        }
        overheadSpan({
          id, frac: s, clearance: h, thickness: 0.5, depth: 3.4, span,
          supportGap: 1.5, supportWidth: 3, color: deckCol, required: true,
        });
      }

      // Ardennes chalets tucked on the wooded hillsides around the lap.
      chalet(K(0.13), -1, 55, 8, 5, 12, [0.80, 0.78, 0.72], [0.34, 0.20, 0.16]);
      chalet(K(0.30),  1, 62, 7, 5, 11, [0.78, 0.76, 0.70], [0.32, 0.22, 0.18]);
      chalet(K(0.55), -1, 58, 8, 5, 12, [0.82, 0.80, 0.74], [0.30, 0.20, 0.16]);
      chalet(K(0.72),  1, 66, 7, 5, 10, [0.80, 0.77, 0.71], [0.34, 0.22, 0.16]);

      // Forest campsites on the Eau Rouge/Raidillon banking and Kemmel hillside.
      rvCamp(K(0.075), 1, 40, 8);
      rvCamp(K(0.10), -1, 46, 7);
      rvCamp(K(0.135), 1, 52, 8);
      rvCamp(K(0.48), -1, 48, 6);
      rvCamp(K(0.82),  1, 44, 6);

      // Historic timing tower behind the pit straight; spectator footbridges.
      timingTower(K(0.985), -1, 30);
      footbridge(0.125, [0.62, 0.34, 0.20]);   // Kemmel crossing
      footbridge(0.50,  [0.40, 0.42, 0.46]);   // mid-forest crossing

      forestEdge(0.050, 0.112, -1, 30, { density: 0.64, hMin: 14, hMax: 25,
        col: [0.07, 0.24, 0.11], col2: [0.13, 0.34, 0.15], pineFrac: 0.94 });
      forestEdge(0.058, 0.070,  1, 38, { density: 0.58, hMin: 15, hMax: 26,
        col: [0.08, 0.25, 0.12], col2: [0.14, 0.35, 0.16], pineFrac: 0.92 });
      forestEdge(0.088, 0.108,  1, 38, { density: 0.58, hMin: 15, hMax: 26,
        col: [0.08, 0.25, 0.12], col2: [0.14, 0.35, 0.16], pineFrac: 0.92 });

      spectatorHill(0.525, 0.560, -1, 11, { rows: 4, density: 0.55, step: 6 });
      spectatorHill(0.658, 0.672, -1, 10, { rows: 3, density: 0.42, step: 6 });

      chalet(K(0.205),  1, 64, 7, 4.8, 10, [0.72, 0.69, 0.62], [0.28, 0.19, 0.15]);
      chalet(K(0.214),  1, 72, 6, 4.3, 9,  [0.76, 0.73, 0.66], [0.31, 0.21, 0.16]);
      chalet(K(0.706), -1, 62, 7, 4.7, 11, [0.75, 0.72, 0.65], [0.29, 0.19, 0.15]);

      if (circuitKit) {
        circuitKit.marshalShelter({ id: "kit:spa:les-combes-shelter", frac: 0.168,
          side: -1, gap: 7, size: [5, 3.2, 5] });
        circuitKit.recoveryBay({ id: "kit:spa:pouhon-recovery", frac: 0.565,
          side: -1, gap: 18, size: [12, 4.5, 18] });
        circuitKit.marshalShelter({ id: "kit:spa:blanchimont-shelter", frac: 0.858,
          side: 1, gap: 8, size: [5, 3.2, 5] });
      }

      for (const [s, side, seed] of [[0.50, -1, 811], [0.57, -1, 827],
                                    [0.70,  1, 843], [0.79,  1, 859]]) {
        const a = anchor(K(s), side, 230 + hash(seed) * 35);
        mountain(a.c[0], a.c[2], a.c[1] - 2, 142 + hash(seed + 1) * 34,
                 42 + hash(seed + 2) * 18, { seg: 7, seed,
                   rough: 0.28, forest: [0.12, 0.31, 0.14],
                   rock: [0.30, 0.35, 0.31], snowline: 2 });
      }

      forestEdge(0.18, 0.42, -1, 14, { density: 0.6, hMin: 12, hMax: 22, col: [0.09, 0.28, 0.13], col2: [0.14, 0.36, 0.17], pineFrac: 0.85 });
      forestEdge(0.42, 0.58, -1, 11, { density: 0.78, hMin: 13, hMax: 24, col: [0.08, 0.26, 0.12], col2: [0.12, 0.34, 0.15], pineFrac: 0.9 });
      forestEdge(0.55, 0.74,  1, 14, { density: 0.6, hMin: 12, hMax: 22, col: [0.09, 0.28, 0.13], col2: [0.14, 0.36, 0.17], pineFrac: 0.85 });
      forestEdge(0.74, 0.88,  1, 12, { density: 0.72, hMin: 12, hMax: 23, col: [0.08, 0.27, 0.12], col2: [0.13, 0.35, 0.16], pineFrac: 0.88 });
      // A few broadleaf oaks softening the pit-straight and Les Combes verges.
      for (const [s, side] of [[0.01, 1], [0.16, 1], [0.30, -1], [0.62, 1], [0.78, -1]]) {
        for (let j = 0; j < 3; j++) tree(K(s) + j, side, 18 + hash(K(s) * 5 + j) * 14, 10 + hash(K(s) * 9 + j) * 5, [0.13, 0.34, 0.16]);
      }

      fence(0.0, 0.03, 1, 6, 4.2, [0.74, 0.76, 0.80]);        // main straight stand
      fence(0.06, 0.11, 1, 7, 4.6, [0.74, 0.76, 0.80]);       // Raidillon Gold-4 amphitheatre
      fence(0.15, 0.18, 1, 7, 4.2, [0.74, 0.76, 0.80]);       // Les Combes
      fence(0.90, 0.94, 1, 6, 4.2, [0.74, 0.76, 0.80]);       // Bus Stop
      guardrail(0.42, 0.58, -1, 3.4, [0.84, 0.85, 0.88]);     // Pouhon sweep
      guardrail(0.80, 0.90,  1, 3.4, [0.84, 0.85, 0.88]);     // Blanchimont
      tyreWall(0.015, 0.03,  1, 4.4, [0.78, 0.12, 0.12]);     // La Source
      tyreWall(0.155, 0.175, 1, 4.6, [0.20, 0.36, 0.62]);     // Les Combes
      tyreWall(0.46, 0.49,  -1, 4.6, [0.55, 0.55, 0.52]);     // Pouhon
      tyreWall(0.905, 0.925, 1, 4.4, [0.78, 0.12, 0.12]);     // Bus Stop

      {
        const a0 = anchor(K(0.170), 1, 16);
        const dir = a0.t, rgt = a0.r, up = a0.u;
        const b = [rgt, up, dir];
        // TRAP B (docs/SCENERY-GROUNDING.md §2): everything below is placed by
        // walking `dir` from ONE anchor — up to 248 m out and 46 m lateral — and
        // this is Spa, which climbs. Reusing a0's height that far left the
        // treeline hanging up to 17 m in the air and the village huts 10-12 m.
        // Re-seat each piece on the ground actually under it; terrainYAt returns
        // null off the rendered ribbon, where a0's height is the best guess left.
        const seatY = (p) => { const y = terrainYAt(p[0], p[2]); if (y != null) p[1] = y; return p; };
        const OLD_TAR  = [0.29, 0.29, 0.30];
        const OLD_EDGE = [0.62, 0.61, 0.57];
        const ARMCO    = [0.74, 0.75, 0.76];
        let laid = 0;
        for (let i = 0; i < 16; i++) {
          const c = seatY(vadd(vadd(a0.c, dir, 14 + i * 15), rgt, i * i * 0.16));
          if (onTrack(c[0], c[2], 18)) continue;
          // Old road is NARROW: two lanes of a 1960s Ardennes highway.
          addBox(out, vadd(c, up, 0.09), [8.2, 0.16, 15.4], OLD_TAR, b);
          addBox(out, vadd(vadd(c, rgt, -4.6), up, 0.13), [1.2, 0.2, 15.4], OLD_EDGE, b);
          addBox(out, vadd(vadd(c, rgt,  4.6), up, 0.13), [1.2, 0.2, 15.4], OLD_EDGE, b);
          if (i % 2 === 0) {
            addBox(out, vadd(vadd(c, rgt, -5.6), up, 0.62), [0.14, 0.34, 15.0], ARMCO, b);
            addCyl(out, vadd(c, rgt, -5.6), 0.09, 0.62, [0.55, 0.55, 0.56], 4, b);
          }
          laid++;
        }
        if (laid > 4) {
          const m = seatY(vadd(vadd(a0.c, dir, 26), rgt, -9));
          if (!onTrack(m[0], m[2], 12)) {
            out._mat = MAT.STONE;
            addBox(out, vadd(m, up, 0.9), [1.1, 1.8, 2.4], [0.68, 0.66, 0.62], b);
            addBox(out, vadd(m, up, 1.95), [1.3, 0.24, 2.6], [0.58, 0.56, 0.52], b);
            out._mat = 0;
          }
          for (let i = 0; i < 9; i++) {
            const t = seatY(vadd(vadd(a0.c, dir, 40 + i * 26),
                           rgt, -16 - (i % 3) * 7 + i * i * 0.14));
            if (onTrack(t[0], t[2], 14)) continue;
            const hv = hash(i * 37 + 11), ht = 15 + hv * 9;
            out._mat = MAT.WOOD;
            addCyl(out, t, 0.4, ht * 0.4, [0.26, 0.21, 0.16], 5, b);
            out._mat = MAT.FOLIAGE;
            addCone(out, vadd(t, up, ht * 0.3), 3.0 + hv, ht * 0.75,
                    hv < 0.5 ? [0.10, 0.30, 0.14] : [0.14, 0.34, 0.17], 6, b);
            out._mat = 0;
          }
        }
      }

      {
        const STONE  = [0.68, 0.66, 0.62], STONE_W = [0.78, 0.76, 0.71];
        const SLATE  = [0.26, 0.27, 0.31], SLATE_D = [0.20, 0.21, 0.25];
        const TRIM   = [0.86, 0.85, 0.80];
        for (let i = 0; i < 14; i++) {
          const sf = 0.018 + i * 0.0075;
          const kk = K(sf), hv = hash(kk * 29 + i * 5);
          const gap = 88 + (i % 3) * 26 + hv * 14;
          const a = anchor(kk, -1, gap);
          if (onTrack(a.c[0], a.c[2], 22)) continue;
          const b = [a.r, a.u, a.t];
          const w = 8 + hv * 4, d = 9 + hv * 5, wallH = 5.5 + hv * 2.4;
          out._mat = MAT.STONE;
          addBox(out, vadd(a.c, a.u, wallH * 0.5), [w, wallH, d],
                 hv < 0.4 ? STONE_W : STONE, b);
          out._mat = 0;
          addPrism(out, vadd(a.c, a.u, wallH), [w * 1.12, w * 0.62, d * 1.06],
                   hv < 0.5 ? SLATE : SLATE_D, b);
          // Window band + a chimney on the ridge.
          addBox(out, vadd(vadd(a.c, a.r, -w * 0.5), a.u, wallH * 0.58),
                 [0.16, 1.1, d * 0.66], TRIM, b);
          addBox(out, vadd(vadd(a.c, a.t, d * 0.28), a.u, wallH + w * 0.55),
                 [0.9, 1.8, 0.9], STONE, b);
        }
        {
          const a = anchor(K(0.062), -1, 104);
          if (!onTrack(a.c[0], a.c[2], 26)) {
            const b = [a.r, a.u, a.t];
            modelGroup("spa-francorchamps-church", {
              center: vadd(a.c, a.u, 11), size: [14, 30, 24], basis: b,
            }, (stage) => {
              stage._mat = MAT.STONE;
              addBox(stage, vadd(a.c, a.u, 4.6), [10, 9.2, 20], STONE_W, b);
              addBox(stage, vadd(vadd(a.c, a.t, -11), a.u, 8.0), [7, 16, 7], STONE_W, b);
              stage._mat = 0;
              addPrism(stage, vadd(a.c, a.u, 12.4), [10.6, 5.4, 20.4], SLATE_D, b);
              addPyramid(stage, vadd(vadd(a.c, a.t, -11), a.u, 15.8), [7.4, 9.5, 7.4],
                         SLATE, b);
              // Clock face and the cross above the spire.
              addBox(stage, vadd(vadd(vadd(a.c, a.t, -11), a.r, -3.6), a.u, 13.5),
                     [0.3, 1.9, 1.9], TRIM, b);
              stage._mat = MAT.METAL;
              addCyl(stage, vadd(vadd(a.c, a.t, -11), a.u, 25.1), 0.09, 2.2,
                     [0.60, 0.58, 0.52], 4, b);
              stage._mat = 0;
            });
          }
        }
      }
    };
