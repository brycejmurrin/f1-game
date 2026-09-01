/* Apex 26 — BAKU scenery (data only), split out of js/circuits/baku.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["baku"] =
  function (api) {
      const {
        out, MAT, n, ds, backdrop, groundPatch, waterSurface, waterBand, modelGroup, building, tower, wall,
        fence, guardrail, tyreWall, grandstand, grandstandEx, sponsorHoarding, broadcastCompound,
        gantry, marshalPost, billboard,
        palm, anchor, along, every, onTrack, addBox, addCyl, addCone, addPrism,
        addFrustum, ferrisWheel, vadd, hash, cityFront,
        circuitKit, plane, cypress, terrace,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      const SAND        = [0.62, 0.50, 0.34];        // Old-City sandstone
      const SAND_LIT    = [0.85, 0.62, 0.30];        // uplit sandstone
      const SAND_DARK   = [0.42, 0.34, 0.22];        // shadowed sandstone
      const GLASS       = [0.20, 0.28, 0.40];        // cool modern glass
      const WIN_WARM    = [0.95, 0.88, 0.55];        // warm lit windows
      const WIN_COOL    = [0.60, 0.70, 0.95];        // cool lit windows
      const FLAME       = [0.95, 0.35, 0.10];        // Flame Towers fire glow
      const FLAME_PALE  = [0.98, 0.55, 0.18];        // softer flame accent
      const DARK        = [0.08, 0.09, 0.13];        // far silhouette
      const DARK2       = [0.11, 0.12, 0.18];        // nearer hazed silhouette
      const CONCRETE    = [0.30, 0.30, 0.34];
      const ARMCO       = [0.74, 0.76, 0.82];        // steel guardrail
      const FENCE_COL   = [0.55, 0.58, 0.66];        // catch-fence mesh
      const SEA         = [0.04, 0.06, 0.12];        // dark Caspian water
      const TARMAC_AD   = [0.85, 0.20, 0.18];        // red ad accent
      const AZ_BLUE     = [0.10, 0.45, 0.78];        // Azerbaijan flag blue
      const LAMP_WARM   = [1.00, 0.96, 0.70];        // sodium lamp glow
      const AZ_TEAL     = [0.06, 0.66, 0.62];
      const AZ_ORANGE   = [0.94, 0.42, 0.10];

      // Sandstone facade palette for Old City streets
      const SAND_PAL = [
        [0.62, 0.50, 0.34],
        [0.68, 0.56, 0.38],
        [0.58, 0.47, 0.30],
        [0.72, 0.60, 0.42],
      ];
      // Modern glass palette for the Caspian / main-straight canyon
      const GLASS_PAL = [
        [0.17, 0.19, 0.27],
        [0.20, 0.22, 0.30],
        [0.14, 0.18, 0.28],
        [0.24, 0.22, 0.32],
      ];
      // Neoclassical/civic mid-tone palette for government district
      const CIVIC_PAL = [
        [0.42, 0.40, 0.38],
        [0.48, 0.45, 0.40],
        [0.52, 0.48, 0.43],
        [0.38, 0.37, 0.35],
      ];

      if (circuitKit) {
        circuitKit.pitBuilding({
          id: "kit:baku:pit-building", frac: 0.975, side: 1, gap: 30,
          size: [18, 11, 76], garages: 14, required: true,
        });
        circuitKit.pedestrianBridge({
          id: "kit:baku:finish-bridge", frac: 0.91,
          clearance: 7.2, thickness: 0.9, depth: 3.2, required: true,
        });
      }

      wall(0.0, 0.65, 1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.82, 1.0, 1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.0, 0.62, -1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.97, 1.0, -1, 2.0, 1.3, CONCRETE, 0.4);

      fence(0.0, 0.35, 1, 2.6, 3.4, FENCE_COL);
      fence(0.86, 1.0, 1, 2.6, 3.4, FENCE_COL);
      fence(0.0, 0.32, -1, 2.6, 3.4, FENCE_COL);
      guardrail(0.63, 0.96, 1, 3.0, ARMCO);
      fence(0.63, 0.95, 1, 4.0, 3.0, FENCE_COL);

      for (let i = 0; i < 22; i++) {
        const k = K(i / 22), side = (i % 2) ? 1 : -1;
        const a = anchor(k, side, 5);
        const b = [a.r, a.u, a.t];
        // Slim steel pole
        addCyl(out, a.c, 0.18, 13, [0.22, 0.22, 0.25], 5, b);
        // Horizontal lamp arm (short bracket)
        addBox(out, vadd(vadd(a.c, a.u, 12.5), a.r, side * 1.2), [2.4, 0.25, 0.5], [0.28, 0.28, 0.32], b);
        // Lamp head housing
        addBox(out, vadd(vadd(a.c, a.u, 12.0), a.r, side * 2.0), [1.4, 0.5, 1.4], [0.26, 0.26, 0.30], b);
        // Warm sodium emissive bulb (bright underside)
        addBox(out, vadd(vadd(a.c, a.u, 11.8), a.r, side * 2.0), [1.2, 0.25, 1.2], LAMP_WARM, b);
        // Small ground-level light-pool: low flat slab simulating spill
        addBox(out, vadd(vadd(a.c, a.u, 0.05), a.r, side * 1.0), [3.0, 0.08, 5.0], [0.30, 0.28, 0.20], b);
      }

      // Extra waterfront lamp posts along the Caspian straight (denser)
      for (let i = 0; i < 12; i++) {
        const k = K(0.63 + i * 0.028), side = -1;
        const a = anchor(k, side, 6);
        const b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.16, 10, [0.22, 0.22, 0.25], 5, b);
        addBox(out, vadd(vadd(a.c, a.u, 9.7), a.r, side * 0.8), [1.6, 0.2, 0.4], [0.24, 0.24, 0.28], b);
        addBox(out, vadd(vadd(a.c, a.u, 9.6), a.r, side * 1.6), [1.2, 0.4, 1.2], [0.26, 0.26, 0.30], b);
        addBox(out, vadd(vadd(a.c, a.u, 9.4), a.r, side * 1.6), [1.0, 0.2, 1.0], LAMP_WARM, b);
      }

      // Marshal posts spaced around the lap
      for (let i = 0; i < 9; i++) marshalPost(K(0.05 + i * 0.105), (i % 2) ? 1 : -1, 3.0);

      for (let i = 0; i < 8; i++) {
        const kC = K(i / 8 * 0.22);
        backdrop(kC, 1,  140 + hash(i * 5)  * 60,  [28 + hash(i * 7)  * 18, 32 + hash(i * 11) * 44, 22], DARK2);
        backdrop(kC, -1, 140 + hash(i * 9)  * 60,  [24 + hash(i * 3)  * 16, 28 + hash(i * 13) * 40, 20], DARK2);
        backdrop(kC, 1,  280 + hash(i * 15) * 120, [32 + hash(i * 17) * 24, 46 + hash(i * 19) * 80, 22], DARK);
        backdrop(kC, -1, 260 + hash(i * 21) * 110, [30 + hash(i * 23) * 22, 42 + hash(i * 25) * 72, 22], DARK);
      }
      // s 0.22–0.58: main straight + old city — glass towers R, open air haze L
      for (let i = 0; i < 10; i++) {
        const kM = K(0.22 + i / 10 * 0.36);
        backdrop(kM, 1,  160 + hash(i * 5 + 22) * 80, [30 + hash(i * 7 + 22) * 22, 44 + hash(i * 11 + 22) * 76, 22], DARK2);
        backdrop(kM, -1, 200 + hash(i * 9 + 22) * 70, [22 + hash(i * 3 + 22) * 12, 26 + hash(i * 13 + 22) * 34, 20], [0.08, 0.09, 0.14]);
        backdrop(kM, 1,  340 + hash(i * 15 + 22) * 160, [34 + hash(i * 17 + 22) * 28, 52 + hash(i * 19 + 22) * 104, 24], DARK);
      }
      // s 0.58–0.97: Caspian seafront — city skyline R, dark sea haze L
      for (let i = 0; i < 12; i++) {
        const kS = K(0.58 + i / 12 * 0.39);
        backdrop(kS, 1,  150 + hash(i * 5 + 58) * 70, [28 + hash(i * 7 + 58) * 20, 38 + hash(i * 11 + 58) * 62, 22], DARK2);
        backdrop(kS, -1, 220 + hash(i * 9 + 58) * 90, [16 + hash(i * 3 + 58) * 8, 12, 16], SEA);
        backdrop(kS, 1,  320 + hash(i * 15 + 58) * 180, [32 + hash(i * 17 + 58) * 26, 48 + hash(i * 19 + 58) * 92, 24], DARK);
      }

      // Continuous civic facade — R side (gap=14 keeps it behind the concrete wall)
      cityFront(0.0, 0.12, 1, 14, {
        minH: 14, maxH: 28, depth: 18, step: 20,
        palette: CIVIC_PAL, lit: true, windowCol: WIN_WARM, floor: 4,
      });

      // Continuous civic facade — L side of start straight
      cityFront(0.0, 0.12, -1, 14, {
        minH: 12, maxH: 24, depth: 16, step: 20,
        palette: CIVIC_PAL, lit: true, windowCol: WIN_WARM, floor: 4,
      });

      // GOVERNMENT HOUSE: ornate neoclassical palace set well back from road.
      // Built from coordinated anchor offsets so sub-parts do NOT intersect.
      // Layout: central body + two independent corner towers set back.
      {
        const k = K(0.02);
        // Central palace body via building() — gap=42 keeps it well behind facade row
        building(k, 1, 42, 52, 22, 30, {
          kind: "dome", wall: SAND, window: WIN_WARM, floor: 4.5, lit: true, mat: MAT.STONE,
        });
        // Decorative base plinth (uplit, slightly wider than body, very low)
        const aBase = anchor(k, 1, 68);
        out._mat = MAT.STONE;
        addBox(out, vadd(aBase.c, aBase.u, 1.5), [58, 3, 32], SAND_LIT, [aBase.r, aBase.u, aBase.t]);

        for (const tOff of [-20, 20]) {
          const aTow = anchor(k, 1, 75);
          const tc = vadd(aTow.c, aTow.t, tOff);
          const b  = [aTow.r, aTow.u, aTow.t];
          out._mat = MAT.STONE;
          addBox(out, vadd(tc, aTow.u, 5),  [14, 10, 14], SAND,     b);
          addCyl(out, vadd(tc, aTow.u, 10), 6.0, 20, SAND,     8, b);
          addFrustum(out, vadd(tc, aTow.u, 30), 6.5, 5.0, 3, SAND_LIT, 8, b);
          addFrustum(out, vadd(tc, aTow.u, 33), 5.0, 1.5, 6, SAND_LIT, 8, b);
          addCone(out, vadd(tc, aTow.u, 39), 1.5, 8, SAND_LIT, 8, b);
          out._mat = 0;   // warm emissive band — keep untextured
          addFrustum(out, vadd(tc, aTow.u, 29), 7.0, 6.5, 1.2, WIN_WARM, 8, b);
        }

        // Ornate entrance gate portico in front of central body
        const aGate = anchor(k, 1, 40);
        out._mat = MAT.STONE;
        addBox(out, vadd(aGate.c, aGate.u, 3), [40, 6, 3], [0.78, 0.68, 0.50], [aGate.r, aGate.u, aGate.t]);
        out._mat = 0;
        addBox(out, vadd(aGate.c, aGate.u, 7), [42, 2, 3], WIN_WARM, [aGate.r, aGate.u, aGate.t]);

        // Uplit wash at Government House base (warm stone courtyard glow)
        const aGov = anchor(k, 1, 64);
        addBox(out, vadd(aGov.c, aGov.u, 0.1), [80, 0.5, 40], [0.22, 0.18, 0.10], [aGov.r, aGov.u, aGov.t]);
      }

      for (let i = 0; i < 5; i++)
        building(K(0.95 + i * 0.012), 1, 5, 16, 9, 14, { kind: "hall", wall: [0.20, 0.21, 0.26], window: WIN_COOL, floor: 3, lit: true });
      wall(0.94, 0.02, 1, 1.0, 1.0, [0.85, 0.85, 0.88], 0.4);
      grandstand(0.985, -1, 4, 70, [0.42, 0.36, 0.40], [0.50, 0.30, 0.34]);
      grandstand(0.05, -1, 4, 60, [0.42, 0.36, 0.40], [0.46, 0.30, 0.36]);
      gantry(0.0, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.96, 7.0, [0.14, 0.14, 0.18]);
      billboard(K(0.01), 1, 9, 14, 5, FLAME);   // K(): billboard takes a NODE, not a fraction

      if (broadcastCompound) {
        broadcastCompound(K(0.975), 1, 55, { vans: 4, dishes: 2, mastH: 10 });
      }

      {
        const flagOffs = [-12, 0, 12];
        const flagCols = [AZ_BLUE, [0.80, 0.16, 0.16], [0.14, 0.55, 0.28]];
        for (let fi = 0; fi < 3; fi++) {
          const aF = anchor(K(0.045), -1, 28);
          const b  = [aF.r, aF.u, aF.t];
          const fc = vadd(aF.c, aF.t, flagOffs[fi]);
          // Pole
          addCyl(out, fc, 0.18, 20, [0.72, 0.72, 0.76], 6, b);
          // Flag panel (3 colour stripes)
          addBox(out, vadd(fc, aF.u, 17), [0.15, 4, 7], flagCols[fi], b);
        }
      }

      // Civic plaza obelisk (L side, further back — gap well behind facade row)
      {
        const a = anchor(K(0.045), -1, 44);
        addFrustum(out, vadd(a.c, a.u, 0), 1.4, 0.3, 16, SAND_LIT, 4, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 14), [1.0, 1.0, 1.0], WIN_WARM, [a.r, a.u, a.t]);
      }

      cityFront(0.12, 0.22, 1, 14, {
        minH: 18, maxH: 40, depth: 18, step: 18,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });
      cityFront(0.12, 0.22, -1, 14, {
        minH: 14, maxH: 30, depth: 16, step: 18,
        palette: CIVIC_PAL, lit: true, windowCol: WIN_WARM, floor: 3.5,
      });

      {
        const k  = K(0.22);
        const aF = anchor(k, 1, 180);
        const b  = [aF.r, aF.u, aF.t];
        const heights   = [210, 240, 210];   // scaled to scene metres
        const towerOffs = [-50, 0, 50];      // along track-right axis (a.r)
        // Fire LED palette — orange / red / amber cycling full height
        const FIRE_BANDS = [
          FLAME, FLAME_PALE, [0.98, 0.42, 0.08], [0.88, 0.18, 0.06],
          [1.00, 0.62, 0.20], [0.95, 0.30, 0.08], [0.90, 0.50, 0.12],
        ];

        modelGroup("baku-flame-towers", {
          center: vadd(aF.c, aF.u, 133.5),
          size: [140, 267, 50],
          basis: b,
        }, (stage) => {
          for (let t = 0; t < 3; t++) {
            const H  = heights[t];
            const tc = vadd(aF.c, aF.r, towerOffs[t]);

            // Main tapered body (dark glass under the LED fire veil)
            stage._mat = MAT.GLASS;
            addFrustum(stage, tc, 16, 3.0, H, [0.10, 0.12, 0.22], 8, b);

            // Full-height fire veil stays inside the atomic landmark group.
            // Pure emissive — leave untextured so the LED wash stays hot.
            stage._mat = 0;
            const nBands = 16;
            for (let band = 0; band < nBands; band++) {
              const yFr  = (band + 0.5) / nBands;
              const rAtY = 16 * (1 - yFr) + 3.0 * yFr;
              const col  = FIRE_BANDS[band % FIRE_BANDS.length];
              addFrustum(stage, vadd(tc, aF.u, yFr * H - (H / nBands) * 0.45),
                rAtY * 1.08, rAtY * 0.96, (H / nBands) * 0.88, col, 8, b);
              if (band % 2 === 0) {
                const hot = vadd(vadd(tc, aF.u, yFr * H), aF.r, -rAtY * 1.10);
                addBox(stage, hot, [0.7, (H / nBands) * 0.62, 4.2],
                  band % 4 ? FLAME_PALE : [1.0, 0.72, 0.28], b);
              }
            }

            // Flame crown — stacked narrow cones above the LED shaft
            addCone(stage, vadd(tc, aF.u, H),        3.0, 12, FLAME,      8, b);
            addCone(stage, vadd(tc, aF.u, H + 12),   2.2,  9, FLAME_PALE, 8, b);
            addCone(stage, vadd(tc, aF.u, H + 21),   1.2,  6, [1.0, 0.72, 0.28], 8, b);
          }

          // Uplit ground wash at the Flame Towers base (warm fire spill)
          addBox(stage, vadd(aF.c, aF.u, 0.1), [160, 0.6, 60], [0.22, 0.08, 0.02], b);
          // Stepped dark hillside podium anchors the skyline above the city.
          stage._mat = MAT.STONE;
          addBox(stage, vadd(aF.c, aF.u, 1.0), [130, 2.0, 44], SAND_DARK, b);
          addBox(stage, vadd(aF.c, aF.u, 3.0), [110, 2.0, 38], [0.30, 0.25, 0.20], b);
          addBox(stage, vadd(aF.c, aF.u, 5.0), [88, 2.0, 32], [0.22, 0.20, 0.19], b);
          stage._mat = 0;
          for (let t = 0; t < 3; t++) {
            const tc = vadd(aF.c, aF.r, (t - 1) * 50);
            addBox(stage, vadd(tc, aF.u, 0.2), [30, 0.5, 30], [0.30, 0.12, 0.03], b);
          }
        }, { required: true });
      }

      // R side: tall glass high-rises (the financial district facing the corniche)
      cityFront(0.22, 0.36, 1, 14, {
        minH: 30, maxH: 80, depth: 20, step: 22,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });

      // L side: Baku Boulevard / Caspian corniche hotels and civic buildings
      cityFront(0.22, 0.36, -1, 14, {
        minH: 18, maxH: 48, depth: 18, step: 20,
        palette: CIVIC_PAL, lit: true, windowCol: WIN_WARM, floor: 4,
      });
      for (let i = 0; i < 6; i++) {
        const a = anchor(K(0.245 + i * 0.017), -1, 16.5);
        const b = [a.r, a.u, a.t];
        for (let floor = 0; floor < 3; floor++) {
          const deck = vadd(a.c, a.u, 5.0 + floor * 4.0);
          addBox(out, deck, [3.2, 0.28, 7.6], [0.66, 0.62, 0.54], b);
          const rail = vadd(vadd(deck, a.r, 1.48), a.u, 0.55);
          addBox(out, rail, [0.16, 1.0, 7.7], [0.78, 0.73, 0.64], b);
        }
      }
      const PLANE_LEAF = [0.24, 0.40, 0.20], CYPRESS_LEAF = [0.09, 0.20, 0.13];
      for (let i = 0; i < 14; i++) {
        const s = 0.23 + i * 0.009;
        const dist = 9 + (i % 2);
        if (i % 4 === 1) {
          cypress(K(s), -1, dist, 9.5 + hash(i * 5) * 3, CYPRESS_LEAF, { slim: 0.85 });
        } else if (i % 7 === 3) {
          palm(K(s), -1, dist, 8 + hash(i * 7) * 3, [0.18, 0.44, 0.24]);
        } else {
          plane(K(s), -1, dist, 9 + hash(i * 7) * 2.5, PLANE_LEAF,
                { stages: 2, spread: 0.62 });
        }
      }

      wall(0.36, 0.537, 1, 20, 9, SAND, 1.2);
      wall(0.553, 0.56, 1, 20, 9, SAND, 1.2);

      // Crenellations — placed at y = wall height (9m top), so they sit
      // ON TOP of the wall, never through it. Each segment has its own anchor.
      // The wall this rests on only covers [0.36, 0.537) — clamp merlon nodes
      // to that same span so a wide tangential spread near either end can't
      // overshoot into the grandstand gap / off the wall's start with nothing
      // underneath (float-audit found exactly that at both ends). Also skip
      // the 0.42-0.50 castle squeeze: the narrowed hwZone there can suppress
      // the outer rampart wall segment (wall() drops a node whose anchor
      // reads onTrack when hw shrinks), leaving an unsupported gap under the
      // merlon even though its own position is otherwise fine.
      const wallLoK = K(0.36), wallHiK = K(0.537);
      const squeezeLoK = K(0.42), squeezeHiK = K(0.50);
      for (let p = 0; p < 10; p++) {
        if (p === 9) continue;  // s=0.54 — inside the grandstand gap, no wall there to sit on
        const k = K(0.36 + p * 0.020);
        for (let j = 0; j < 14; j++) {
          if (j % 2 === 0) {
            const kj = k + Math.round(((j - 6.5) * 3.8) / ds);
            if (kj < wallLoK || kj > wallHiK) continue;
            if (kj >= squeezeLoK && kj <= squeezeHiK) continue;
            const aj = anchor(kj, 1, 20);
            addBox(out, vadd(aj.c, aj.u, 9.9), [2.4, 1.8, 2.2], SAND, [aj.r, aj.u, aj.t]);
          }
        }
      }

      for (let i = 0; i < 22; i++) {
        const s = 0.362 + i * 0.0082;
        if (s > 0.535 && s < 0.556) continue;   // the terracing gap carved above
        const a = anchor(K(s), 1, 19.3), b = [a.r, a.u, a.t];
        const col = (i % 2) ? AZ_TEAL : AZ_ORANGE;
        addBox(out, vadd(a.c, a.u, 5.4), [0.14, 6.4, 1.9], col, b);
        addBox(out, vadd(a.c, a.u, 8.2), [0.18, 0.7, 2.1], [0.86, 0.72, 0.26], b);
      }

      for (const s of [0.365, 0.385, 0.405, 0.515, 0.535, 0.555]) {
        const a = anchor(K(s), 1, 19.4);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 4.5), [2.6, 9.0, 3.2], SAND_DARK, b);
        addBox(out, vadd(a.c, a.u, 0.18), [3.4, 0.34, 3.8], SAND_LIT, b);
        addBox(out, vadd(vadd(a.c, a.u, 2.4), a.r, -0.75), [0.28, 3.2, 1.2],
          WIN_WARM, b);
      }

      cityFront(0.36, 0.537, 1, 24, {
        minH: 6, maxH: 18, depth: 12, step: 16,
        palette: SAND_PAL, lit: true, windowCol: WIN_WARM, floor: 3,
      });
      cityFront(0.553, 0.56, 1, 24, {
        minH: 6, maxH: 18, depth: 12, step: 16,
        palette: SAND_PAL, lit: true, windowCol: WIN_WARM, floor: 3,
      });

      for (let i = 0; i < 5; i++) {
        const dist = 34 + hash(i * 13) * 14;  // well behind the 10m wall gap
        const a    = anchor(K(0.38 + i * 0.032), 1, dist);
        const b    = [a.r, a.u, a.t];
        const shH  = 18 + hash(i * 7) * 8;    // shaft height
        addCyl(out, a.c, 1.6, shH, SAND, 8, b);              // minaret shaft
        addFrustum(out, vadd(a.c, a.u, shH),   2.2, 1.4, 3, SAND_LIT, 8, b);  // balcony ring
        addCone(out,   vadd(a.c, a.u, shH + 3), 1.4, 5,   SAND_LIT, 8, b);   // cone cap
        addBox(out, vadd(a.c, a.u, shH + 7.5), [0.8, 0.8, 0.8], WIN_WARM, b);
      }

      // Small dome silhouettes rising over the old town — addFrustum hemisphere
      for (let i = 0; i < 5; i++) {
        const dist = 44 + hash(i * 9) * 22;
        const a    = anchor(K(0.39 + i * 0.032), 1, dist);
        const b    = [a.r, a.u, a.t];
        const dH   = 6 + hash(i * 3) * 4;
        addFrustum(out, a.c, 5.0, 0.5, dH, SAND, 8, b);
        addCyl(out, vadd(a.c, a.u, dH), 0.4, 2.5, SAND_LIT, 6, b);
      }

      cityFront(0.36, 0.42, -1, 16, {
        minH: 6, maxH: 14, depth: 10, step: 14,
        palette: SAND_PAL, lit: true, windowCol: WIN_WARM, floor: 2.5,
      });

      wall(0.42, 0.50, -1, 2.0, 11, SAND, 1.4);
      wall(0.42, 0.50,  1, 2.0, 11, SAND, 1.4);
      along(0.42, 0.50, 7.2, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 2.0);
          // Measured (float-audit): this merlon cap sat flush on the wall
          // top (y=11, from wall()'s own h=11) with zero gap, but the wall
          // itself is emitted through instance()/along() on its OWN node
          // spacing (6 m) — different from this loop's (7.2 m) — and
          // extending the cap's own reach down by up to a full wall height
          // made no difference, so whatever is beneath it there isn't the
          // wall either. A slim buttress pier from grade up to the cap
          // gives it its own real support instead of chasing the wall.
          addBox(out, vadd(a.c, a.u, 5.5), [1.0, 11.4, 1.0], SAND, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 11.7), [1.8, 1.4, 2.2], SAND, [a.r, a.u, a.t]);
        }
      });
      // Gateway towers flank the narrowest point without entering the road mesh.
      {
        const aL = anchor(K(0.46), -1, 2.0);
        const aR = anchor(K(0.46),  1, 2.0);
        // Corner tower cylinder above wall height (y=11 upward)
        addCyl(out, vadd(aL.c, aL.u, 11), 1.4, 8, SAND, 8, [aL.r, aL.u, aL.t]);
        addCyl(out, vadd(aR.c, aR.u, 11), 1.4, 8, SAND, 8, [aR.r, aR.u, aR.t]);
        addCone(out, vadd(aL.c, aL.u, 19), 1.4, 4, SAND_LIT, 8, [aL.r, aL.u, aL.t]);
        addCone(out, vadd(aR.c, aR.u, 19), 1.4, 4, SAND_LIT, 8, [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aL.c, aL.u, 22.5), [1.0, 0.8, 1.0], WIN_WARM, [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aR.c, aR.u, 22.5), [1.0, 0.8, 1.0], WIN_WARM, [aR.r, aR.u, aR.t]);
      }

      // Old-town buildings set back behind castle walls (gap=20 to clear 11m walls)
      cityFront(0.42, 0.50, 1, 20, {
        minH: 5, maxH: 12, depth: 10, step: 12,
        palette: SAND_PAL, lit: true, windowCol: WIN_WARM, floor: 2.5,
      });
      cityFront(0.42, 0.50, -1, 18, {
        minH: 5, maxH: 12, depth: 10, step: 12,
        palette: SAND_PAL, lit: true, windowCol: WIN_WARM, floor: 2.5,
      });

      {
        const k = K(0.52);
        // The 24m-wide footprint needs a centre offset, not an edge clearance.
        const a = anchor(k, -1, 16);
        const b = [a.r, a.u, a.t];

        modelGroup("baku-maiden-tower", {
          center: vadd(a.c, a.u, 25.5),
          size: [24, 51, 24],
          basis: b,
        }, (stage) => {
          // Square stone base platform (buried 0.5m into ground for solid footing)
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 1.5), [22, 3, 22], SAND_DARK, b);

          // Octagonal base ring flare — wider than drum, creates distinct pediment
          addFrustum(stage, vadd(a.c, a.u, 3), 11.5, 9.2, 2, [0.55, 0.44, 0.30], 8, b);

          // Main cylindrical drum (the famous tower body)
          addCyl(stage, vadd(a.c, a.u, 5), 9.2, 28, SAND, 12, b);

          // Stone band window slits — narrow emissive strips along the drum face
          stage._mat = 0;
          for (let wl = 0; wl < 4; wl++) {
            const wy = 5 + 5 + wl * 6;
            addFrustum(stage, vadd(a.c, a.u, wy), 9.3, 9.3, 1.2, WIN_WARM, 12, b);
          }

          // Projecting cornice ring (slightly wider than drum — sits on top at y=33)
          stage._mat = MAT.STONE;
          addFrustum(stage, vadd(a.c, a.u, 33), 10.0, 9.5, 1.5, SAND_LIT, 12, b);
          // Inward step back (y=34.5..36)
          addFrustum(stage, vadd(a.c, a.u, 34.5), 9.5, 7.0, 1.5, SAND, 12, b);

          // Upper tapering section (y=36..42)
          addFrustum(stage, vadd(a.c, a.u, 36), 7.0, 4.5, 6, SAND_LIT, 12, b);

          // Cone cap — base radius matches upper frustum top (4.5, y=42..49)
          addCone(stage, vadd(a.c, a.u, 42), 4.5, 7, SAND_LIT, 12, b);

          // Finial: small lit stone block at the very tip (y=49..51)
          addBox(stage, vadd(a.c, a.u, 49), [2.0, 2.0, 2.0], [0.94, 0.84, 0.64], b);

          // Uplit glow ring at base (ground-level uplit stone look)
          addFrustum(stage, vadd(a.c, a.u, 3.2), 12.0, 11.5, 0.8, SAND_LIT, 8, b);
          stage._mat = 0;
        }, { required: true });

        groundPatch(k, -1, 1, [30, 0.5, 30], [0.20, 0.16, 0.08],
          { id: "baku-maiden-forecourt", samples: 6 });
      }

      {
        const PALACE      = [0.72, 0.66, 0.54];
        const PALACE_DARK = [0.62, 0.56, 0.44];
        const k = K(0.50);

        // Main palace structure (gap=20 to clear the castle wall at gap=1.5)
        building(k, 1, 20, 22, 10, 28, {
          kind: "arch", wall: PALACE, window: WIN_WARM, floor: 2, lit: true, mat: MAT.STONE,
        });

        // Crenellated parapet: merlons at y=10 (top of 10m building)
        const a = anchor(k, 1, 20);
        const b = [a.r, a.u, a.t];
        out._mat = MAT.STONE;
        for (let j = 0; j < 8; j++) {
          if (j % 2 === 0) {
            addBox(out, vadd(vadd(a.c, a.t, (j - 3.5) * 3.8), a.u, 10.9), [2.5, 1.8, 2.5], PALACE, b);
          }
        }

        // Ornamental turrets at corners — cylinders that begin AT the building top
        addCyl(out, vadd(vadd(a.c, a.t, -13), a.u, 10), 2.2, 6, PALACE_DARK, 8, b);
        addCyl(out, vadd(vadd(a.c, a.t,  13), a.u, 10), 2.2, 6, PALACE_DARK, 8, b);
        addCone(out, vadd(vadd(a.c, a.t, -13), a.u, 16), 2.2, 4, PALACE, 8, b);
        addCone(out, vadd(vadd(a.c, a.t,  13), a.u, 16), 2.2, 4, PALACE, 8, b);
        out._mat = 0;
        addBox(out, vadd(vadd(a.c, a.t, -13), a.u, 19.5), [1.0, 0.8, 1.0], WIN_WARM, b);
        addBox(out, vadd(vadd(a.c, a.t,  13), a.u, 19.5), [1.0, 0.8, 1.0], WIN_WARM, b);

        // Flanking wing building (east)
        building(K(0.505), 1, 14, 12, 7, 16, {
          kind: "chevron", wall: PALACE, window: WIN_WARM, floor: 2, lit: true, mat: MAT.STONE,
        });

        // Ornamental archway detail on main facade
        out._mat = MAT.STONE;
        addBox(out, vadd(a.c, a.u, 4), [20, 3, 1.5], [0.82, 0.76, 0.64], b);
        out._mat = 0;
      }

      {
        const STONE = [0.58, 0.52, 0.42];
        const oldCityData = [
          [0.51, 1, 24, 10, 10, 14],
          [0.54, 1, 36, 12, 12, 12],
          [0.56, 1, 22, 14,  8, 16],
        ];
        for (const [i, [s, side, dist, w, h, d]] of oldCityData.entries()) {
          building(K(s), side, dist, w, h, d, {
            kind: ["hall", "arch", "dome", "chevron", "drum"][i % 5],
            wall: STONE, window: WIN_WARM, floor: 3, lit: true, mat: MAT.STONE,
          });
        }
      }

      if (typeof terrace === "function") {
        terrace(0.538, 0.552, 1, 15, {
          rows: 6, rise: 1.45, depth: 2.4, step: 16, density: 0.5,
          conc: [0.66, 0.58, 0.44], concAlt: [0.57, 0.50, 0.38],
          backWall: false,   // the rampart IS the back wall
        });
      } else if (grandstandEx) {
        grandstandEx(0.545, 1, 16, 60, null, null, {
          livery: "sandstone", tiers: 2, roof: "cantilever",
          pylons: true, endWalls: true,
        });
      } else {
        grandstand(0.545, 1, 16, 60, [0.68, 0.60, 0.47], [0.70, 0.46, 0.28]);
      }

      wall(0.58, 0.96, -1, 5, 1.4, [0.76, 0.72, 0.64], 0.6);
      // Sparse decorative balusters (thinned — was 32)
      for (let i = 0; i < 12; i++) {
        const s = 0.58 + i * 0.031;
        const a = anchor(K(s), -1, 5.7);
        addCyl(out, vadd(a.c, a.u, 0.7), 0.16, 1.1, [0.80, 0.74, 0.62], 6, [a.r, a.u, a.t]);
      }

      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.66 + i * 0.06), -1, 160 + hash(i * 5) * 100);
        addBox(out, vadd(a.c, a.u, 3), [14 + hash(i) * 8, 5 + hash(i * 2) * 3, 3.5],
          [0.10, 0.12, 0.18], [a.r, a.u, a.t]);
      }

      // One far breakwater silhouette only (near piers culled for sea void)
      {
        const a = anchor(K(0.78), -1, 90);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.5), [2.4, 1.0, 36], [0.40, 0.40, 0.46], b);
      }

      {
        const aFt = anchor(K(0.75), -1, 72);
        const b   = [aFt.r, aFt.u, aFt.t];
        addFrustum(out, vadd(aFt.c, aFt.u, 0.3), 6, 5.2, 0.8, [0.38, 0.38, 0.42], 10, b);
        addCone(out, vadd(aFt.c, aFt.u, 0.6), 1.0, 6, [0.60, 0.80, 0.95], 8, b);
        addCone(out, vadd(aFt.c, aFt.u, 4.5), 0.5, 3, WIN_COOL, 6, b);
      }

      cityFront(0.63, 0.738, 1, 14, {
        minH: 40, maxH: 100, depth: 20, step: 20,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });
      cityFront(0.762, 0.95, 1, 14, {
        minH: 40, maxH: 100, depth: 20, step: 20,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });

      {
        const k  = K(0.70);
        const aH = anchor(k, 1, 62);
        const b  = [aH.r, aH.u, aH.t];
        // Podium base
        addBox(out, vadd(aH.c, aH.u, 1.8), [48, 3.6, 36], [0.28, 0.28, 0.32], b);
        // Lower bowl — wide frustum flaring out from podium
        addFrustum(out, vadd(aH.c, aH.u, 3.6), 10, 20, 14, [0.18, 0.22, 0.32], 10, b);
        // Upper dome — narrowing frustum
        addFrustum(out, vadd(aH.c, aH.u, 17.6), 20, 12, 10, [0.20, 0.24, 0.36], 10, b);
        // Roof canopy disc (wide flat cylinder sitting just above the dome)
        addFrustum(out, vadd(aH.c, aH.u, 27), 23, 22, 1.8, [0.24, 0.30, 0.44], 10, b);
        // Glass curtain wall window band (mid-level, emissive cool white)
        addFrustum(out, vadd(aH.c, aH.u, 9), 20.5, 20.5, 5, WIN_COOL, 10, b);
        // Crown light ring at apex
        addFrustum(out, vadd(aH.c, aH.u, 26.5), 13, 12, 1.2, AZ_TEAL, 10, b);
        // Uplit forecourt wash
        addBox(out, vadd(aH.c, aH.u, 0.1), [54, 0.4, 44], [0.10, 0.12, 0.20], b);
      }

      if (grandstandEx) {
        // Filarmoniya side — inside of the kink, the larger of the pair.
        grandstandEx(0.75, 1, 14, 70, null, null, {
          livery: "scaffold", tiers: 3, roof: "truss",
          pylons: true, endWalls: true, suites: true,
        });
        // Azneft side — outside of the kink, facing the Caspian.
        grandstandEx(0.755, -1, 14, 70, null, null, {
          livery: "scaffold", tiers: 2, roof: "truss",
          pylons: true, endWalls: true,
        });
      } else {
        grandstand(0.75, 1, 14, 70, [0.50, 0.52, 0.56], [0.60, 0.40, 0.36]);
        grandstand(0.755, -1, 14, 70, [0.50, 0.52, 0.56], [0.60, 0.40, 0.36]);
      }

      for (let i = 0; i < 9; i++) {
        const k   = K(0.77 + i * 0.011);
        const isPortBaku = i === 2 || i === 3;
        const bW  = 14 + (i % 2) * 4;
        const h   = isPortBaku ? 150 : 85 + (i % 3) * 45;
        tower(k, 1, 52 + (i % 4) * 24, bW, h,
          { col: GLASS, seg: 7, cap: true, capCol: i % 3 ? WIN_COOL : WIN_WARM });
        // Lit crown ring on each tower (emissive band near top)
        const a = anchor(k, 1, 52 + (i % 4) * 24);
        addFrustum(out, vadd(a.c, a.u, h - 6), bW * 0.32 * 1.1, bW * 0.32 * 0.9, 4,
          i % 3 ? WIN_COOL : WIN_WARM, 7, [a.r, a.u, a.t]);
        if (isPortBaku) {
          addFrustum(out, vadd(a.c, a.u, h), bW * 0.30, bW * 0.14, 10, WIN_COOL, 7, [a.r, a.u, a.t]);
          addCone(out, vadd(a.c, a.u, h + 10), bW * 0.10, 6, WIN_COOL, 7, [a.r, a.u, a.t]);
        }
      }

      // Illuminated billboards along the Caspian straight
      for (let i = 0; i < 5; i++) {
        billboard(K(0.65 + i * 0.065), 1, 9, 14, 6, i % 2 ? AZ_ORANGE : AZ_TEAL);
      }

      if (sponsorHoarding) {
        sponsorHoarding(0.655, 0.738, 1, 2.4, {
          h: 1.2, step: 14, postCol: [0.20, 0.21, 0.24],
          palette: [AZ_TEAL, AZ_ORANGE, [0.90, 0.90, 0.92], AZ_BLUE, TARMAC_AD],
        });
        sponsorHoarding(0.762, 0.94, 1, 2.4, {
          h: 1.2, step: 14, postCol: [0.20, 0.21, 0.24],
          palette: [AZ_TEAL, AZ_ORANGE, [0.90, 0.90, 0.92], AZ_BLUE, TARMAC_AD],
        });
      }

      tyreWall(0.955, 0.99, 1, 3.0, TARMAC_AD);
      tyreWall(0.955, 0.99, -1, 3.0, [0.9, 0.9, 0.92]);
      for (const side of [-1, 1]) {
        const a = anchor(K(0.97), side, 4);
        addBox(out, vadd(a.c, a.u, 1.0), [2, 0.3, 12], side > 0 ? TARMAC_AD : [0.9, 0.9, 0.92], [a.r, a.u, a.t]);
      }
      billboard(K(0.93), 1, 11, 18, 11, FLAME);
      billboard(K(0.99), -1, 8, 14, 8, WIN_COOL);

      // Cafe / palm mid-ground strip culled — Neftchilar L reads as open Caspian

      // Seafront billboard (s≈0.15)
      billboard(K(0.15), -1, 20, 14, 5, [0.85, 0.35, 0.10]);

      waterBand(0.63, 0.748, -1, 16, 236, 12, SEA, { id: "baku-caspian-a" });
      waterBand(0.748, 0.762, -1, 32, 236, 12, SEA, { id: "baku-caspian-b" });
      waterBand(0.762, 0.93, -1, 16, 236, 12, SEA, { id: "baku-caspian-c" });

      // ── BAKU EYE — Ferris wheel pushed to far silhouette (sea void mid culled)
      ferrisWheel(K(0.80), -1, 88, 28);
      {
        const a = anchor(K(0.80), -1, 88);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.2), [32, 0.4, 32], [0.14, 0.12, 0.18], b);
        addCyl(out, vadd(a.c, a.u, 28), 3.0, 2.8, AZ_TEAL, 14, b);
      }

      // ── CASPIAN MARINA — sparse far yachts only (near marina culled)
      const nightYacht = (a, sc, hullCol) => {
        const b = [a.r, a.u, a.t];
        const HULL = hullCol || [0.90, 0.91, 0.94];
        const L = 26 * sc, W = 7 * sc;
        out._mat = MAT.METAL;
        addBox(out, vadd(a.c, a.u, 1.8 * sc), [W, 3.0 * sc, L * 0.86], HULL, b);
        addPrism(out, vadd(vadd(a.c, a.t, L * 0.47), a.u, 1.8 * sc), [W, 3.0 * sc, L * 0.16], HULL, b);
        addBox(out, vadd(a.c, a.u, 0.5 * sc), [W * 1.02, 0.9 * sc, L * 0.88], [0.06, 0.08, 0.14], b);
        const sup = vadd(a.c, a.t, L * 0.02);
        addBox(out, vadd(sup, a.u, 4.2 * sc), [W * 0.82, 2.4 * sc, L * 0.5], [0.30, 0.34, 0.42], b);
        addBox(out, vadd(sup, a.u, 6.6 * sc), [W * 0.66, 2.0 * sc, L * 0.32], [0.28, 0.32, 0.40], b);
        out._mat = 0;
        addBox(out, vadd(sup, a.u, 4.6 * sc), [W * 0.84, 0.7 * sc, L * 0.5], WIN_WARM, b);
        addBox(out, vadd(sup, a.u, 6.9 * sc), [W * 0.68, 0.6 * sc, L * 0.32], WIN_COOL, b);
        out._mat = MAT.METAL;
        addCyl(out, vadd(sup, a.u, 8.2 * sc), 0.12 * sc, 4.5 * sc, [0.80, 0.82, 0.86], 4, b);
        out._mat = 0;
        addBox(out, vadd(sup, a.u, 12.4 * sc), [0.4 * sc, 0.4 * sc, 0.4 * sc], [0.95, 0.30, 0.25], b);
      };
      for (let i = 0; i < 3; i++) {
        const k = K(0.64 + i * 0.10);
        const a = anchor(k, -1, 95 + hash(k * 7) * 40);
        if (onTrack(a.c[0], a.c[2], 10)) continue;
        const hull = (i % 2 === 0) ? [0.12, 0.14, 0.22] : [0.85, 0.86, 0.90];
        nightYacht(a, 0.7 + hash(k * 9) * 0.5, hull);
      }
      // Slim mast cluster further out on the water (far silhouettes)
      for (let i = 0; i < 5; i++) {
        if (i === 1) continue;  // s=0.705 — National Flag Square (below) takes this spot instead
        const k = K(0.65 + i * 0.055), a = anchor(k, -1, 110 + hash(k) * 40);
        addCyl(out, a.c, 0.2, 14 + hash(k * 3) * 8, [0.70, 0.72, 0.80], 4, [a.r, a.u, a.t]);
      }

      {
        const kFlag = K(0.705);
        const aFlag = anchor(kFlag, -1, 110);
        if (!onTrack(aFlag.c[0], aFlag.c[2], 2)) {
          const bFlag = [aFlag.r, aFlag.u, aFlag.t];
          const poleH = 150;
          // Plaza plinth (addBox centres its arg — 0.3 is plinthH/2, correct)
          const plinthH = 0.6;
          addBox(out, vadd(aFlag.c, aFlag.u, plinthH / 2), [16, plinthH, 16], [0.30, 0.30, 0.32], bFlag);
          const stage1H = poleH * 0.84, stage2H = poleH * 0.16;
          const stage1Base = plinthH, stage2Base = stage1Base + stage1H;
          const poleTop = stage2Base + stage2H;
          addCyl(out, vadd(aFlag.c, aFlag.u, stage1Base), 1.1, stage1H, [0.72, 0.73, 0.76], 8, bFlag);
          addCyl(out, vadd(aFlag.c, aFlag.u, stage2Base), 0.65, stage2H, [0.76, 0.77, 0.80], 8, bFlag);
          const flagY = plinthH + poleH * 0.86;
          const flagW = 22, flagH = 14;
          addBox(out, vadd(vadd(aFlag.c, aFlag.u, flagY + flagH / 3), aFlag.r, flagW / 2), [flagW, flagH / 3, 0.2], AZ_BLUE, bFlag);
          addBox(out, vadd(vadd(aFlag.c, aFlag.u, flagY), aFlag.r, flagW / 2), [flagW, flagH / 3, 0.2], [0.80, 0.16, 0.16], bFlag);
          addBox(out, vadd(vadd(aFlag.c, aFlag.u, flagY - flagH / 3), aFlag.r, flagW / 2), [flagW, flagH / 3, 0.2], [0.14, 0.55, 0.28], bFlag);
          // Finial ball + aircraft-warning beacon at the very tip — ball base
          // sits on the pole top (addCyl, base-anchored); beacon (addBox,
          // centred) sits on the ball top.
          addCyl(out, vadd(aFlag.c, aFlag.u, poleTop), 0.9, 1.4, [0.85, 0.72, 0.30], 8, bFlag);
          addBox(out, vadd(aFlag.c, aFlag.u, poleTop + 1.4 + 0.25), [0.5, 0.5, 0.5], [1.6, 0.2, 0.15], bFlag);
        }
      }

      // ── CARPET MUSEUM — pushed to far L silhouette (mid-ground culled)
      {
        const a = anchor(K(0.72), -1, 78);
        const rollB = [a.r, a.t, a.u];
        const b = [a.r, a.u, a.t];
        out._mat = MAT.STONE;
        addBox(out, vadd(a.c, a.u, 3), [36, 5, 22], [0.34, 0.32, 0.30], b);
        out._mat = MAT.FABRIC;
        addCyl(out, vadd(vadd(a.c, a.t, -14), a.u, 12), 9, 28, [0.62, 0.24, 0.18], 14, rollB);
        addCyl(out, vadd(vadd(a.c, a.t, 14), a.u, 12), 9.2, 1.8, [0.78, 0.66, 0.40], 14, rollB);
        out._mat = 0;
        for (let s = -2; s <= 2; s++) {
          addBox(out, vadd(vadd(a.c, a.t, s * 4.5), a.u, 20), [3.5, 0.4, 2.6],
                 s % 2 ? [0.90, 0.55, 0.20] : WIN_WARM, b);
        }
      }
    };
