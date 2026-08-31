/* Apex 26 — MIAMI scenery (data only), split out of js/circuits/miami.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["miami"] =
  function (api) {
      const {
        out, MAT, COL, n, px, pz, pyMin, place, prop, backdrop, grandstandEx,
        building, tower, billboard, palm, bush, fence, wall, guardrail, tyreWall,
        bankedKerbStrip, marshalPost, gantry, anchor, addBox, addCyl, addPrism, addPyramid,
        addCone, addFrustum, vadd, hash, onTrack, every, along, cityFront, forestEdge,
        runoffApron, modelGroup, overheadSpan, waterSurface, groundPatch, recordBarrier,
        scaffoldStand, bleacher, acacia, circuitKit,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      const TEAL       = [0.20, 0.80, 0.78];
      const CORAL      = [1.0,  0.55, 0.45];
      const PINK       = [1.0,  0.65, 0.80];
      const WHITE      = [0.94, 0.95, 0.96];
      const GREYWHITE  = [0.80, 0.82, 0.84];
      const PALM_GREEN = [0.20, 0.55, 0.25];
      const PALM_DARK  = [0.16, 0.45, 0.20];
      const GLASS      = [0.55, 0.72, 0.78];
      const CONCRETE   = [0.70, 0.70, 0.72];
      const WATER      = [0.13, 0.46, 0.62];
      const WATER_DEEP = [0.08, 0.32, 0.48];
      // Dolphins aqua runoff — COL.aquaRunoff when shared kit is present
      const AQUA       = (COL && COL.aquaRunoff) || [0.12, 0.72, 0.78];
      const PASTELS    = [TEAL, CORAL, PINK, [0.75, 0.90, 1.0], [1.0, 0.85, 0.55]];
      // Night/emissive colours
      const LAMP_WARM  = [1.0,  0.92, 0.70];
      const FLOOD_WH   = [0.98, 0.97, 0.92];
      const WIN_AMBER  = [1.0,  0.88, 0.55];
      const WIN_COOL   = [0.68, 0.85, 1.0];

      // Miami skyline building palette — pastel tropical glass towers
      const SKY_PAL = [
        [0.62, 0.82, 0.88],   // glass-teal
        [0.88, 0.76, 0.62],   // warm sandstone
        [0.76, 0.88, 0.82],   // mint
        [0.94, 0.82, 0.68],   // peach
        [0.58, 0.74, 0.90],   // ice-blue
        [0.82, 0.90, 0.76],   // sage
      ];
      const rotPal = (arr, k) => arr.slice(k % arr.length).concat(arr.slice(0, k % arr.length));
      const SKY_PAL_STADIUM = [   // stadium-lot corridor (T11 approach) — concrete-forward, cooler
        CONCRETE, GREYWHITE, [0.62, 0.82, 0.88], [0.80, 0.84, 0.88], [0.90, 0.84, 0.76],
      ];
      const SKY_PAL_DUSKGLASS = [   // back-straight DRS corridor — deeper, more saturated glass
        [0.30, 0.60, 0.64], [0.66, 0.40, 0.50], [0.44, 0.54, 0.78], [0.60, 0.68, 0.48], [0.78, 0.56, 0.32],
      ];

      // -- South-Beach club: sand deck, teal pool, DJ cabana, parasols, loungers --
      const beachClub = (s, side, dist) => {
        const k = K(s), a = anchor(k, side, dist), bv = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 26)) return;
        // Terrain-conforming sand and typed reflective pool water.
        groundPatch(k, side, dist - 20, [40, 0.3, 30], [0.92, 0.86, 0.66],
          { id: "beach-club-sand", samples: 5, required: true });
        waterSurface(k, side, dist, [12, 0.18, 6], [0.30, 0.86, 0.86],
          { id: "beach-club-pool", required: true });
        // The cabana is atomic: never leave a roof without its supporting shell.
        const cabana = vadd(vadd(a.c, a.t, -14), a.u, 2.0);
        modelGroup("beach-club-cabana", {
          center: cabana, size: [6.6, 4.2, 8.6], basis: bv,
        }, (stage) => {
          addBox(stage, vadd(vadd(a.c, a.t, -14), a.u, 1.7), [6, 3.4, 8], WHITE, bv);
          stage._mat = MAT.FABRIC;
          addBox(stage, vadd(vadd(a.c, a.t, -14), a.u, 3.6), [6.6, 0.6, 8.6], CORAL, bv);
          stage._mat = 0;
        }, { required: true });
        for (let i = 0; i < 8; i++) {
          const along = (hash(k + i) - 0.5) * 30, out2 = (hash(k * 3 + i) - 0.5) * 18 + 2;
          const base = vadd(vadd(a.c, a.t, along), a.r, out2);
          addCyl(out, base, 0.12, 3, WHITE, 4, bv);
          out._mat = MAT.FABRIC;
          addCone(out, vadd(base, a.u, 3), 2.2, 1.2,
                  [TEAL, CORAL, PINK, [1.0, 0.85, 0.4]][i % 4], 8, bv);
          out._mat = 0;
          addBox(out, vadd(base, a.u, 0.3), [0.8, 0.35, 2.0], WHITE, bv);
        }
        // palms framing the deck
        palm(k, side, dist - 6, 10, PALM_GREEN);
        palm(k, side, dist + 34, 11, PALM_DARK);
      };

      // -- Campus car-park lot: asphalt pad packed with rows of parked cars --
      const carPark = (s, side, dist, rows, cols) => {
        const k = K(s), a = anchor(k, side, dist), bv = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 20)) return;
        const size = [rows * 6 + 4, 1.6, cols * 2.6 + 4];
        modelGroup(`car-park-${k}`, { center: vadd(a.c, a.u, 0.8), size, basis: bv }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 0.1), [size[0], 0.2, size[2]], [0.30, 0.30, 0.33], bv);
          // white bay lines
          for (let c = 0; c <= cols; c++)
            addBox(stage, vadd(vadd(a.c, a.u, 0.2), a.t, (c - cols / 2) * 2.6), [rows * 6, 0.05, 0.12], WHITE, bv);
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
              if (hash(k + r * 13 + c * 7) > 0.82) continue;   // empty bays
              const p = vadd(vadd(vadd(a.c, a.r, (r - rows / 2) * 6), a.u, 0.75), a.t, (c - cols / 2) * 2.6);
              const t = hash(k * 5 + r * 11 + c);
              addBox(stage, p, [4.4, 1.4, 2.1],
                     [0.28 + t * 0.5, 0.30 + hash(c * 3) * 0.4, 0.34 + hash(r * 7) * 0.42], bv);
            }
        });
      };

      const parkingDeck = (s, side, dist, opts) => {
        opts = opts || {};
        const k = K(s), a = anchor(k, side, dist), bv = [a.r, a.u, a.t];
        const tiers = opts.tiers || 4, tierH = opts.tierH || 3.2;
        const w = opts.w || 34, len = opts.len || 56;
        const total = tierH * tiers;
        const rampSteps = 5, rampStep = 2.6, rampRun = 3 + (rampSteps - 1) * rampStep + 2.4;
        const bounds = {
          center: vadd(a.c, a.u, total / 2),
          size: [w, total, len + 2 * rampRun],
          basis: bv,
        };
        modelGroup(`miami-parking-deck-${k}`, bounds, (stage) => {
          for (let t = 0; t < tiers; t++) {
            const floorY = tierH * t;
            // precast floor slab
            addBox(stage, vadd(a.c, a.u, floorY + 0.15), [w, 0.3, len], CONCRETE, bv);
            // low perimeter beam — open-sided parapet, not a wall
            addBox(stage, vadd(a.c, a.u, floorY + 0.9), [w, 1.2, len],
              [CONCRETE[0] * 0.9, CONCRETE[1] * 0.9, CONCRETE[2] * 0.9], bv);
            // corner + mid-span support columns along both long edges
            for (const cs of [-1, 1])
              for (let ci = -1; ci <= 1; ci++) {
                const p = vadd(vadd(a.c, a.r, cs * (w / 2 - 1.2)), a.t, ci * (len / 3));
                addBox(stage, vadd(p, a.u, floorY + tierH / 2), [0.9, tierH, 0.9], CONCRETE, bv);
              }
            // sparse parked cars — skip most bays so the open deck still reads
            for (let ci = 0; ci < 8; ci++) {
              if (hash(k * 7 + t * 13 + ci) > 0.55) continue;
              const along2 = (ci - 3.5) * (len / 8);
              const lat = (hash(k * 3 + t + ci) - 0.5) * (w - 6);
              const p = vadd(vadd(a.c, a.t, along2), a.r, lat);
              const tone = hash(k + t * 5 + ci * 11);
              addBox(stage, vadd(p, a.u, floorY + 1.1), [1.8, 1.3, 3.8],
                [0.30 + tone * 0.5, 0.32 + hash(ci) * 0.4, 0.36 + hash(t) * 0.4], bv);
            }
          }
          for (const endSign of [-1, 1]) {
            for (let si = 0; si < rampSteps; si++) {
              const stepH = total * (si + 1) / rampSteps;
              const alongPos = endSign * (len / 2 + 3 + si * rampStep);
              const p = vadd(a.c, a.t, alongPos);
              addBox(stage, vadd(p, a.u, stepH / 2), [w * 0.30, stepH, rampStep * 0.92], CONCRETE, bv);
            }
          }
        }, { required: true });
      };

      // Shared overpass builder — used at s 0.635 and 0.685 (Turnpike zone).
      // FIXED: pushed both further into the Turnpike zone, away from the
      // start/finish gantry.  Pillars are now spaced only inside the
      // overpass deck footprint (pillar offset clamped to ±span*0.38 so they
      // never extend into the circuit's start sector).
      const buildOverpass = (s) => {
        const k = K(s);
        const supportGap = 4.0, supportWidth = 3.4, clearance = 10.4;
        overheadSpan({
          id: `turnpike-overpass-${k}`, frac: s, clearance,
          thickness: 4.4, depth: 16, supportGap, supportWidth,
          color: CONCRETE, required: true,
        });
        // One atomic pier per side, entirely beyond the runoff boundary.
        for (const side of [-1, 1]) {
          const a = anchor(k, side, supportGap + supportWidth / 2);
          const bv = [a.r, a.u, a.t];
          modelGroup(`turnpike-pier-${k}-${side}`, {
            center: vadd(a.c, a.u, clearance / 2),
            size: [4.0, clearance, 4.0], basis: bv,
          }, (stage) => {
            addBox(stage, vadd(a.c, a.u, 5.2), [supportWidth, 10.4, 3.4], CONCRETE, bv);
            addBox(stage, vadd(a.c, a.u, 10.2), [4.0, 0.4, 4.0], [0.45, 0.45, 0.47], bv);
          }, { required: true });
          recordBarrier(s - 0.002, s + 0.002, side, supportGap);
        }
      };

      {
        const SKY_COLS = [
          [0.72, 0.84, 0.90],   // hazed ice-blue
          [0.80, 0.84, 0.88],   // pale steel
          [0.88, 0.82, 0.74],   // warm sandstone
          [0.78, 0.82, 0.90],   // lavender-blue
          [0.90, 0.84, 0.76],   // peach haze
          [0.70, 0.80, 0.90],   // sky-blue glass
        ];
        // Haze toward horizon so towers read as soft downtown, not a wall.
        const haze = (c) => [c[0] * 0.45 + 0.48, c[1] * 0.45 + 0.50, c[2] * 0.45 + 0.52];
        // 12 tall skyscrapers — main-straight arc only (where downtown peeks)
        for (let i = 0; i < 12; i++) {
          const h0 = hash(i * 13.1 + 1), h1 = hash(i * 7.7 + 3), h2 = hash(i * 3.3 + 7);
          const kFrac = ((i / 12) * 0.28 + 0.90) % 1.0;   // s 0.90 → 0.18
          const k = K(kFrac);
          const side = (i % 3 === 2) ? -1 : 1;
          const dist = 700 + h0 * 280;           // 700–980 m — horizon haze
          const bW = 20 + h1 * 14;
          const bH = 55 + h0 * 80 + (i < 4 ? 40 : 0);
          const bD = 14 + h2 * 8;
          backdrop(k, side, dist, [bW, bH, bD], haze(SKY_COLS[i % SKY_COLS.length]));
        }
        // 6 mid-rise skirt blocks — also hazed and far
        for (let i = 0; i < 6; i++) {
          const h0 = hash(i * 9.9 + 11), h1 = hash(i * 4.4 + 13), h2 = hash(i * 6.1 + 17);
          const kFrac = (i / 6 + 0.88) % 1.0;
          const k = K(kFrac);
          const side = (i % 2) ? 1 : -1;
          const dist = 560 + h0 * 160;
          const bW = 28 + h1 * 16;
          const bH = 30 + h2 * 32;
          const bD = 16 + h0 * 8;
          backdrop(k, side, dist, [bW, bH, bD], haze(PASTELS[(i * 2) % PASTELS.length]));
        }
      }

      {
        const a = anchor(K(0.0), 1, 155);
        const r = a.r, u = a.u, t = a.t;
        const RA = 132, RB = 100;
        const segC = 48;
        const stadiumFloorY = pyMin;
        const stadiumBase = [a.c[0], stadiumFloorY, a.c[2]];
        for (let i = 0; i < segC; i++) {
          const ang = i / segC * 6.2832;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const ex = ca * RA, ez = sa * RB;
          const c = vadd(vadd([a.c[0], stadiumFloorY, a.c[2]], t, ex), r, ez);
          const nx = t[0] * (ca * RB) + r[0] * (sa * RA);
          const nz = t[2] * (ca * RB) + r[2] * (sa * RA);
          const nl = Math.hypot(nx, nz) || 1;
          const rad2 = [nx / nl, 0, nz / nl];
          const tan = [-rad2[2], 0, rad2[0]];
          const h = 48 + (i % 3) * 5;
          const segW = 19;
          // lower raked seating
          addBox(out, vadd(vadd(c, u, h * 0.5),  rad2,  6), [12, h + 2, segW], GREYWHITE, [rad2, u, tan]);
          // upper shell tier
          addBox(out, vadd(vadd(c, u, h + 10),   rad2,  9), [11, 18, segW + 1], WHITE,     [rad2, u, tan]);
          addBox(out, vadd(vadd(c, u, h + 20.9), rad2,  9), [12, 4.2, segW + 2],
            (i % 2) ? CORAL : TEAL, [rad2, u, tan]);
          // outer aqua accent stripe (Dolphins cue on the bowl shell)
          if (i % 2 === 0)
            addBox(out, vadd(vadd(c, u, h + 18), rad2, 10.5), [2.2, 2.4, segW],
              AQUA, [rad2, u, tan]);
          // crowd colour detail — lit so the stadium bowl reads at dusk
          if (i % 2 === 0)
            addBox(out, vadd(vadd(c, u, h * 0.6), rad2, 0), [1.5, h * 0.65, segW - 2],
              PASTELS[(i * 3) % PASTELS.length], [rad2, u, tan]);
          if (i % 3 === 1)
            addBox(out, vadd(vadd(c, u, h * 0.45), rad2, 2), [0.8, h * 0.5, segW - 3],
              PASTELS[(i * 5 + 2) % PASTELS.length], [rad2, u, tan]);
          // Interior concourse lighting strips
          if (i % 4 === 0)
            addBox(out, vadd(vadd(c, u, h * 0.25), rad2, -1), [1.0, h * 0.3, segW - 4],
              [WIN_AMBER[0] * 0.75, WIN_AMBER[1] * 0.6, WIN_AMBER[2] * 0.2], [rad2, u, tan]);
        }
        // 6 floodlight masts — taller shafts so the bowl reads from farther out
        for (let i = 0; i < 6; i++) {
          const ang = (i + 0.5) / 6 * 6.2832;
          const ex = Math.cos(ang) * RA, ez = Math.sin(ang) * RB;
          const c = vadd(vadd([a.c[0], stadiumFloorY, a.c[2]], t, ex), r, ez);
          addCyl(out, vadd(c, u, 0),  1.1, 72, GREYWHITE, 6, [r, u, t]);
          addBox(out, vadd(c, u, 72), [14, 4.0, 4.5], WHITE, [r, u, t]);
          addCyl(out, vadd(c, u, 70), 5.0, 1.4, FLOOD_WH, 8, [r, u, t]);
          addBox(out, vadd(c, u, 0.05), [20, 0.2, 20], [0.96, 0.96, 0.88], [r, u, t]);
        }
        // Massive curved roof cap
        addFrustum(out, vadd(stadiumBase, u, 56), 118, 74, 18,
          [0.82, 0.84, 0.86], 48, [r, u, t]);
        addFrustum(out, vadd(stadiumBase, u, 55), 120, 76, 0.8,
          [0.55, 0.55, 0.57], 48, [r, u, t]);
        // Concourse hospitality ring
        for (let i = 0; i < 8; i++) {
          const ang = i / 8 * 6.2832;
          const ex = Math.cos(ang) * (RA - 22), ez = Math.sin(ang) * (RB - 22);
          const hc = vadd(vadd(stadiumBase, t, ex), r, ez);
          addBox(out, [hc[0], stadiumFloorY + 5, hc[2]], [15, 11, 15],
            (i % 2) ? TEAL : CORAL, null);
          addBox(out, [hc[0], stadiumFloorY + 11.2, hc[2]], [15.2, 1.0, 15.2],
            [WIN_AMBER[0] * 0.65, WIN_AMBER[1] * 0.5, WIN_AMBER[2] * 0.15], null);
        }
      }

      {
        if (circuitKit) {
          circuitKit.pitBuilding({
            id: "kit:miami:pit-building", frac: 0.0, side: -1, gap: 13,
            size: [22, 9, 120], garages: 20, required: true,
          });
          circuitKit.raceControl({ style: "stepped",
            id: "kit:miami:race-control", frac: 0.006, side: -1, gap: 76,
            size: [12, 26, 14], required: true,
          });
        } else {
          // Fallback if the kit is unavailable — keep the pit lane building.
          building(K(0.0), -1, 13, 22, 9, 120, { kind: "hall", wall: WHITE, window: GLASS, lit: true, windowCol: WIN_AMBER });
        }
        building(K(0.0), -1, 42, 26, 22, 120,
          { kind: "slab", wall: WHITE, window: GLASS, floor: 6, lit: true, windowCol: WIN_AMBER });
        // pit wall
        wall(0.0, 0.05, -1, 2.2, 1.1, GREYWHITE);
      }

      gantry(0.0,   6.6, [0.18, 0.20, 0.24]);   // dark scoring arch (start line)
      gantry(0.014, 7.0, CORAL);                  // coral timing gantry

      // Lamp posts flanking the start line — both sides, every ~30 m along the pit straight
      for (let i = 0; i < 10; i++) {
        const k = K(0.0 + i * 0.006);
        // Right side lamp posts (stadium side)
        const aR = anchor(k, 1, 10);
        addCyl(out, aR.c, 0.18, 10, [0.68, 0.68, 0.70], 5, [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aR.c, aR.u, 10.2), [3.0, 0.4, 0.4], [0.68, 0.68, 0.70], [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aR.c, aR.u, 10.0), [1.6, 0.5, 1.2], LAMP_WARM, [aR.r, aR.u, aR.t]);
        // Left side lamp posts (pit side)
        const aL = anchor(k, -1, 10);
        addCyl(out, aL.c, 0.18, 10, [0.68, 0.68, 0.70], 5, [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aL.c, aL.u, 10.2), [3.0, 0.4, 0.4], [0.68, 0.68, 0.70], [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aL.c, aL.u, 10.0), [1.6, 0.5, 1.2], LAMP_WARM, [aL.r, aL.u, aL.t]);
      }

      // Palms lining the pit straight
      for (let i = 0; i < 14; i++) {
        palm(K(0.0 + i * 0.006), -1,  9 + (i % 2) * 4,  8 + hash(i)     * 4, PALM_GREEN);
        palm(K(0.0 + i * 0.006),  1, 46 + (i % 2) * 6,  9 + hash(i * 5) * 4, PALM_DARK);
      }
      // Sponsor billboards along the pit wall
      billboard(K(0.02),  -1, 11, 16, 7, TEAL);
      billboard(K(0.035), -1, 11, 16, 7, CORAL);
      billboard(K(0.05),  -1, 11, 16, 7, PINK);

      const T1_STANDS = ["pastel", "teal", "alu", "pastel"];
      for (let i = 0; i < 4; i++) {
        const s    = 0.05 + i * 0.015;
        const side = (i % 2) ? 1 : -1;
        const flick = PASTELS[Math.floor(hash(i * 7 + 3) * PASTELS.length) % PASTELS.length];
        grandstandEx(s, side, 18, 95 + i * 5, null, flick, {
          livery: T1_STANDS[i], tiers: i === 0 ? 2 : 1,
          roof: (i % 2) ? "truss" : "cantilever", endWalls: i === 0,
        });
      }
      cityFront(0.04, 0.12, 1, 30, {
        minH: 14, maxH: 38, depth: 25, step: 20,
        palette: SKY_PAL, lit: true, windowCol: WIN_AMBER,
      });
      for (let i = 0; i < 10; i++) palm(K(0.04 + i * 0.006), 1, 14 + (i % 2) * 5, 8 + hash(i) * 2, PALM_GREEN);

      wall(0.13, 0.19,  1, 3, 1.2, CONCRETE);
      wall(0.13, 0.19, -1, 3, 1.2, CONCRETE);
      fence(0.13, 0.19,  1, 3.5, 3.5, [0.78, 0.80, 0.82]);
      // Palm tree line behind the fence — gap >= fence dist + canopy radius to avoid clipping
      forestEdge(0.13, 0.19, 1, 8, {
        density: 0.5, hMin: 9, hMax: 14,
        col: PALM_GREEN, col2: PALM_DARK, pineFrac: 0.0,
      });

      for (let i = 0; i < 18; i++) {
        const k = K(0.18 + (i % 6) * 0.004);
        palm(k, -1, 28 + (i % 4) * 7 + hash(i) * 4,   8 + hash(i * 7) * 5,
          (i % 2) ? PALM_GREEN : PALM_DARK);
        palm(K(0.18 + (i % 6) * 0.005), 1, 28 + (i % 3) * 6, 8 + hash(i * 3) * 4,
          (i % 2) ? PALM_DARK : PALM_GREEN);
      }
      cityFront(0.18, 0.26, -1, 42, {
        minH: 10, maxH: 26, depth: 16, step: 18,
        palette: [CORAL, PINK, TEAL, [1.0, 0.85, 0.60], GREYWHITE],
        lit: true, windowCol: WIN_AMBER,
      });
      // Beach Club moved to T11–13 (s≈0.50) — see braking-zone section below.

      for (let m = 0; m < 3; m++) {
        const k = K(0.285 + m * 0.032);
        waterSurface(k, 1, 7.0, [72, 0.18, 110],
          m === 1 ? WATER : WATER_DEEP,
          { id: `mia-marina-water-${m}`, required: true });
        // Terrain-conforming pontoon edge; unlike the water it remains walkable.
        groundPatch(k, 1, 4.6, [7, 0.24, 96], [0.68, 0.68, 0.66],
          { id: `mia-marina-pontoon-${m}`, samples: 3 });
      }
      guardrail(0.26, 0.38, 1, 2.8, GREYWHITE);

      along(0.265, 0.375, 8, (k) => {
        place(k, 1, 6.3, [0.45, 0.06, 8], WHITE);        // painted vinyl boundary
        place(k, 1, 6.9, [0.7, 0.05, 8], [0.34, 0.34, 0.36]);  // asphalt showing through
      });
      // Moored rank — one hull repeated at a fixed berth pitch, bows all the
      // same way. A real harbour never looks this regular; a boat show does.
      along(0.272, 0.368, 22, (k) => {
        const a = anchor(k, 1, 26 + (k & 1) * 10), bv = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 9)) return;
        const L = 15, W = 4.4;
        modelGroup(`miami-berth-${k}`, {
          center: vadd(a.c, a.u, 4), size: [W + 1, 9, L + 1], basis: bv,
        }, (st) => {
          // Hull sits ON the sheet, not in it — the flat bottom is visible.
          addBox(st, vadd(a.c, a.u, 1.5), [W, 2.6, L], WHITE, bv);
          addBox(st, vadd(a.c, a.u, 2.9), [W + 0.2, 0.5, L],
                 (k % 3 === 0) ? TEAL : ((k % 3 === 1) ? CORAL : PINK), bv);
          addBox(st, vadd(vadd(a.c, a.t, -1.5), a.u, 4.2), [W * 0.7, 2.2, L * 0.42], GREYWHITE, bv);
          addBox(st, vadd(vadd(a.c, a.t, -1.5), a.u, 4.9), [W * 0.74, 0.9, L * 0.44], GLASS, bv);
          addCyl(st, vadd(a.c, a.u, 5.4), 0.14, 4.5, GREYWHITE, 4, bv);
        });
      });

      // Fewer larger yacht silhouettes (6 boats, not ~50)
      for (let i = 0; i < 6; i++) {
        const k = K(0.275 + i * 0.018);
        const a = anchor(k, 1, 18 + (i % 3) * 14);
        const c = vadd(a.c, a.t, (i % 2 ? 8 : -8));
        const len = 22 + hash(i * 4) * 16;          // 22–38 m hulls
        const trim = (i % 3 === 0) ? TEAL : ((i % 3 === 1) ? CORAL : PINK);
        const bv = [a.r, a.u, a.t];
        modelGroup(`marina-yacht-${i}`, {
          center: vadd(c, a.u, 12), size: [7, 26, len], basis: bv,
        }, (yacht) => {
          addBox(yacht, vadd(c, a.u, 1.4),      [6.5, 3.2, len],        WHITE,     bv);
          addBox(yacht, vadd(c, a.u, 3.0),      [6.8, 0.9, len],        trim,      bv);
          addBox(yacht, vadd(c, a.u, 4.4),      [5.0, 2.8, len * 0.55], GREYWHITE, bv);
          addBox(yacht, vadd(c, a.u, 6.6),      [3.2, 2.0, len * 0.34], GLASS,     bv);
          addCyl(yacht, vadd(c, a.u, 7.4), 0.22, 12 + hash(i) * 4, GREYWHITE, 5, bv);
          addBox(yacht, vadd(c, a.u, 5.2), [5.1, 0.5, len * 0.54],
            [WIN_AMBER[0] * 0.6, WIN_AMBER[1] * 0.5, WIN_AMBER[2] * 0.15], bv);
        });
      }

      {
        const k = K(0.32);
        const a = anchor(k, 1, 38);
        const bv = [a.r, a.u, a.t];
        modelGroup("msc-yacht-club", {
          center: vadd(a.c, a.u, 16), size: [16.4, 33, 78], basis: bv,
        }, (msc) => {
        // Hull / pontoon base
        addBox(msc, vadd(a.c, a.u,  2.0), [16,  4.0, 78], WHITE,      bv);
        // Deck 1 hospitality
        addBox(msc, vadd(a.c, a.u,  5.5), [15,  4.5, 72], GREYWHITE,  bv);
        addBox(msc, vadd(a.c, a.u,  5.5), [15.4, 1.2, 70], TEAL,      bv); // glass band
        // Deck 2
        addBox(msc, vadd(a.c, a.u,  9.5), [13,  4.0, 58], WHITE,      bv);
        addBox(msc, vadd(a.c, a.u,  9.5), [13.4, 1.0, 56], CORAL,     bv);
        // Deck 3 / bridge
        addBox(msc, vadd(a.c, a.u, 13.2), [10,  3.6, 40], GREYWHITE,  bv);
        addBox(msc, vadd(a.c, a.u, 13.2), [10.4, 0.9, 38], GLASS,     bv);
        // Top sundeck / helipad
        addBox(msc, vadd(a.c, a.u, 16.2), [8,   2.2, 26], WHITE,      bv);
        addCyl(msc, vadd(a.c, a.u, 17.6), 5.5, 0.5, [0.50, 0.52, 0.54], 12, bv);
        addCyl(msc, vadd(a.c, a.u, 18.2), 5.0, 0.3, [0.85, 0.10, 0.10], 12, bv);
        // Lit porthole strips
        addBox(msc, vadd(a.c, a.u,  4.0), [16.2, 0.9, 74],
          [WIN_AMBER[0] * 0.65, WIN_AMBER[1] * 0.5, WIN_AMBER[2] * 0.15], bv);
        addBox(msc, vadd(a.c, a.u,  7.8), [15.2, 0.7, 68],
          [WIN_AMBER[0] * 0.60, WIN_AMBER[1] * 0.45, WIN_AMBER[2] * 0.12], bv);
        // Radar / communication mast
        addCyl(msc, vadd(a.c, a.u, 18.0), 0.22, 14, GREYWHITE, 4, bv);
        // MSC blue/teal identity stripe along the hull
        addBox(msc, vadd(a.c, a.u,  2.8), [16.4, 1.0, 76], AQUA, bv);
        }, { required: true });
      }

      bleacher(0.284, 0.316, -1, 26, {
        rows: 8, rise: 0.7, setback: 0.95,
        frameCol: [0.74, 0.76, 0.80], plankCol: [0.72, 0.73, 0.76],
        crowd: PASTELS, density: 0.6,
      });

      // Marina promenade palms — placed via forestEdge so no barrier clipping
      forestEdge(0.26, 0.38, 1, 5, {
        density: 0.55, hMin: 9, hMax: 14,
        col: PALM_GREEN, col2: PALM_DARK, pineFrac: 0.0,
      });

      const STADIUM_STANDS = ["teal", "alu", "pastel"];
      for (let i = 0; i < 3; i++) {
        const flick = PASTELS[Math.floor(hash(i * 11 + 5) * PASTELS.length) % PASTELS.length];
        grandstandEx(0.43 + i * 0.035, -1, 22, 85 + i * 10, null, flick, {
          livery: STADIUM_STANDS[i], roof: (i === 1) ? "flat" : "cantilever",
        });
      }
      cityFront(0.42, 0.53, -1, 24, {
        minH: 14, maxH: 34, depth: 22, step: 20,
        palette: SKY_PAL_STADIUM, lit: true, windowCol: WIN_AMBER,
      });
      for (let i = 0; i < 10; i++) palm(K(0.43 + i * 0.005), -1, 12 + (i % 2) * 4, 8 + hash(i * 3) * 2, PALM_GREEN);
      carPark(0.47, -1, 60, 4, 18);
      parkingDeck(0.55, 1, 70, { tiers: 4, w: 34, len: 56 });

      {
        const a = anchor(K(0.025), 1, 82);
        const bv = [a.r, a.u, a.t];
        modelGroup("miami-campus-arrival-court", {
          center: vadd(a.c, a.u, 5.5), size: [31, 12, 58], basis: bv,
        }, (campus) => {
          addBox(campus, vadd(a.c, a.u, 0.15), [30, 0.3, 58], [0.76, 0.78, 0.76], bv);
          for (let i = -1; i <= 1; i++) {
            const p = vadd(vadd(a.c, a.t, i * 18), a.u, 3.2);
            addBox(campus, p, [22, 6.4, 12], (i === 0) ? WHITE : GREYWHITE, bv);
            addBox(campus, vadd(p, a.u, 3.5), [25, 0.7, 14],
              [CORAL, TEAL, PINK][i + 1], bv);
          }
          addBox(campus, vadd(vadd(a.c, a.r, -11), a.u, 8.2),
            [5, 0.7, 54], WHITE, bv);
        }, { required: true });
      }

      {
        const a = anchor(K(0.355), 1, 78);
        const bv = [a.r, a.u, a.t];
        modelGroup("miami-marina-hospitality-deck", {
          center: vadd(a.c, a.u, 7.5), size: [28, 16, 64], basis: bv,
        }, (deck) => {
          addBox(deck, vadd(a.c, a.u, 1.0), [28, 2.0, 64], GREYWHITE, bv);
          addBox(deck, vadd(a.c, a.u, 4.2), [25, 4.8, 59], WHITE, bv);
          addBox(deck, vadd(vadd(a.c, a.r, -12.7), a.u, 4.4), [0.8, 3.0, 57], GLASS, bv);
          addBox(deck, vadd(a.c, a.u, 8.0), [22, 2.8, 52], GREYWHITE, bv);
          addBox(deck, vadd(vadd(a.c, a.r, -11.2), a.u, 8.1), [0.7, 1.8, 50], GLASS, bv);
          addBox(deck, vadd(a.c, a.u, 10.0), [25, 0.8, 56], TEAL, bv);
          for (let i = -2; i <= 2; i++)
            addBox(deck, vadd(vadd(a.c, a.t, i * 10), a.u, 10.6),
              [24, 0.35, 4.8], (i % 2) ? CORAL : PINK, bv);
        }, { required: true });
      }

      overheadSpan({
        id: "miami-teal-pedestrian-bridge", frac: 0.235, clearance: 7.4,
        thickness: 1.0, depth: 3.2, supportGap: 5.5, supportWidth: 1.4,
        color: TEAL, required: true,
      });
      overheadSpan({
        id: "miami-coral-pedestrian-bridge", frac: 0.405, clearance: 7.4,
        thickness: 1.0, depth: 3.2, supportGap: 5.5, supportWidth: 1.4,
        color: CORAL, required: true,
      });

      if (circuitKit) {
        circuitKit.serviceCompound({
          id: "kit:miami:broadcast-compound", frac: 0.205, side: 1, gap: 70,
          size: [28, 6, 42], vehicles: 10, required: true,
        });
        circuitKit.serviceCompound({
          id: "kit:miami:operations-compound", frac: 0.735, side: -1, gap: 62,
          size: [26, 6, 38], vehicles: 8, required: true,
        });
      }

      for (let i = 0; i < 6; i++) {
        palm(K(0.012 + i * 0.006), 1, 64 + (i % 2) * 12,
          10 + hash(i * 71) * 3, (i % 2) ? PALM_DARK : PALM_GREEN);
        palm(K(0.365 + i * 0.006), 1, 66 + (i % 3) * 9,
          9 + hash(i * 73) * 3, (i % 2) ? PALM_GREEN : PALM_DARK);
      }

      if (typeof runoffApron === "function") {
        const apronSpots = [
          [0.06,  1, 4.5], [0.08, -1, 4.5],   // T1
          [0.16,  1, 4.0], [0.16, -1, 4.0],   // T2/3
          [0.36,  1, 4.5],                     // marina exit
          [0.50,  1, 4.5], [0.52, -1, 4.5],   // T11 braking
          [0.64,  1, 4.0], [0.67, -1, 4.0],   // Turnpike chicane
          [0.94,  1, 4.0], [0.96, -1, 4.0],   // final corner
        ];
        for (let i = 0; i < apronSpots.length; i++) {
          const [s, side, gap] = apronSpots[i];
          const depth = 16 + hash(i * 17) * 8;
          const len = 28 + hash(i * 23) * 16;
          runoffApron(K(s), side, gap, [depth, 0.32, len], AQUA);
        }
      }

      beachClub(0.52, 1, 48);
      for (let i = 0; i < 16; i++) palm(K(0.50 + i * 0.004),  1, 11 + (i % 3) * 6, 9 + hash(i)     * 2, PALM_GREEN);
      for (let i = 0; i < 6;  i++) palm(K(0.55 + i * 0.005), -1, 12 + (i % 2) * 5, 8 + hash(i * 2) * 1, PALM_DARK);
      billboard(K(0.50), 1, 11, 18, 9, CORAL);
      billboard(K(0.52), 1, 10, 16, 8, TEAL);
      billboard(K(0.54), 1, 10, 16, 8, PINK);
      const DECO = [
        [0.500, "ziggurat", WHITE,            22],
        [0.518, "fin",      [0.96, 0.86, 0.70], 18],
        [0.536, "chevron",  [0.86, 0.94, 0.94], 20],
        [0.554, "setback",  [0.98, 0.82, 0.78], 16],
        [0.572, "notch",    WHITE,            21],
        [0.590, "ziggurat", [0.80, 0.92, 0.96], 17],
      ];
      for (const [s, kind, wallCol, h] of DECO) {
        building(K(s), 1, 22, 20, h, 18, {
          kind, wall: wallCol, window: [0.30, 0.52, 0.60], floor: 4.2,
          lit: true, windowCol: WIN_AMBER,
          // The neon eyebrow — the one detail every Ocean Drive photograph has.
          roof: (K(s) % 2) ? TEAL : PINK,
        });
      }

      buildOverpass(0.635);
      buildOverpass(0.685);

      // Lamp posts lining the underpass approaches (both sides)
      for (let i = 0; i < 6; i++) {
        const sBase = 0.615 + i * 0.014;
        const aL = anchor(K(sBase), -1, 5);
        const aR = anchor(K(sBase),  1, 5);
        addCyl(out, aL.c, 0.16, 8.5, [0.65, 0.65, 0.67], 5, [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aL.c, aL.u, 8.6), [0.4, 0.4, 2.2], [0.65, 0.65, 0.67], [aL.r, aL.u, aL.t]);
        addBox(out, vadd(aL.c, aL.u, 8.4), [1.4, 0.5, 1.0], LAMP_WARM, [aL.r, aL.u, aL.t]);
        addCyl(out, aR.c, 0.16, 8.5, [0.65, 0.65, 0.67], 5, [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aR.c, aR.u, 8.6), [0.4, 0.4, 2.2], [0.65, 0.65, 0.67], [aR.r, aR.u, aR.t]);
        addBox(out, vadd(aR.c, aR.u, 8.4), [1.4, 0.5, 1.0], LAMP_WARM, [aR.r, aR.u, aR.t]);
      }

      for (let i = 1; i <= 2; i++) {
        const flick = PASTELS[Math.floor(hash(i * 13 + 9) * PASTELS.length) % PASTELS.length];
        grandstandEx(0.77 + i * 0.025, -1, 20, 80, null, flick, {
          livery: i === 1 ? "pastel" : "teal", tiers: 2, roof: "truss",
        });
      }
      scaffoldStand(0.7626, 0.7774, -1, 20, {
        rows: 6, tubeCol: [0.72, 0.74, 0.78], deckCol: [0.74, 0.72, 0.66],
        bench: [TEAL, WHITE, CORAL], crowd: PASTELS, density: 0.6, legEvery: 1,
      });
      scaffoldStand(0.8376, 0.8524, -1, 20, {
        rows: 5, tubeCol: [0.72, 0.74, 0.78], deckCol: [0.74, 0.72, 0.66],
        bench: [PINK, WHITE, TEAL], crowd: PASTELS, density: 0.55, legEvery: 1,
      });
      cityFront(0.76, 0.86, -1, 34, {
        minH: 16, maxH: 38, depth: 22, step: 20,
        palette: SKY_PAL_DUSKGLASS, lit: true, windowCol: WIN_AMBER,
      });
      for (let i = 0; i < 12; i++) {
        palm(K(0.76 + i * 0.006), (i % 2) ? 1 : -1, 12 + (i % 2) * 4, 8 + hash(i * 5) * 2, PALM_GREEN);
      }
      // Stadium-style floodlights on the back straight (4 masts)
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.77 + i * 0.025), (i % 2) ? 1 : -1, 22);
        addCyl(out, a.c,                0.55, 28, GREYWHITE, 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 28), [8,   2.4, 2.8], [0.78, 0.80, 0.82], [a.r, a.u, a.t]);
        addCyl(out, vadd(a.c, a.u, 26), 2.8,  0.9, FLOOD_WH, 7, [a.r, a.u, a.t]);
        // light-pool patch at base
        addBox(out, vadd(a.c, a.u, 0.06), [12, 0.2, 12], [0.96, 0.96, 0.88], [a.r, a.u, a.t]);
      }

      cityFront(0.87, 0.97, -1, 26, {
        minH: 10, maxH: 28, depth: 22, step: 18,
        palette: [WHITE, ...rotPal(SKY_PAL, 3)], lit: true, windowCol: WIN_AMBER,
      });
      const FINAL_STANDS = ["pastel", "teal"];
      for (let i = 0; i < 2; i++) {
        const flick = PASTELS[Math.floor(hash(i * 17 + 2) * PASTELS.length) % PASTELS.length];
        grandstandEx(0.88 + i * 0.035, -1, 18, 80, null, flick, { livery: FINAL_STANDS[i] });
      }
      for (let i = 0; i < 14; i++) {
        palm(K(0.88 + i * 0.006), (i % 2) ? 1 : -1, 16 + (i % 3) * 5, 8 + hash(i * 4) * 2,
          (i % 2) ? PALM_GREEN : PALM_DARK);
      }

      if (typeof bankedKerbStrip === "function") {
        bankedKerbStrip(0.897, 0.923, 1,  { step: 6, safer: false });
        bankedKerbStrip(0.899, 0.921, -1, { step: 6, safer: false });
      }
      tyreWall(0.900, 0.928, 1,  2.6, TEAL);
      tyreWall(0.904, 0.924, -1, 2.6, CORAL);

      wall(0.94, 0.99,  1, 3, 1.2, CONCRETE);
      wall(0.94, 0.99, -1, 3, 1.2, CONCRETE);
      fence(0.94, 0.99,  1, 3.5, 3.2, [0.78, 0.80, 0.82]);

      for (const [s0, s1] of [[0.32, 0.42], [0.55, 0.635], [0.635, 0.72], [0.83, 0.90]]) {
        wall(s0, s1,  1, 3, 1.0, CONCRETE);
        wall(s0, s1, -1, 3, 1.0, CONCRETE);
        fence(s0, s1,  1, 3.4, 3.0, [0.80, 0.82, 0.84]);
      }
      guardrail(0.005, 0.05,  1, 3, GREYWHITE);
      guardrail(0.72,  0.80, -1, 3, GREYWHITE);
      // Tyre walls at chicane apexes
      tyreWall(0.645, 0.66,  1, 2.4, CORAL);
      tyreWall(0.66,  0.69, -1, 2.4, TEAL);
      tyreWall(0.155, 0.175, -1, 2.4, PINK);
      every(180, (k) => marshalPost(k, 1, 5));
      // Low shrubs
      for (let i = 0; i < 10; i++) {
        bush(K(0.72 + i * 0.006), -1, 6 + (i % 2) * 3, PALM_GREEN);
        bush(K(0.05 + i * 0.005),  1, 6 + (i % 2) * 3, PALM_DARK);
      }
      // Scatter palms on infield-adjacent edges
      for (let i = 0; i < 24; i++) {
        const s = i / 24;
        const side = (i % 2) ? 1 : -1;
        palm(K(s + 0.002), side, 24 + hash(i * 31) * 14, 7 + hash(i * 13) * 4,
          (i % 2) ? PALM_GREEN : PALM_DARK);
      }

      const palmRow = (s0, s1, side, dist, stepM, hBase) => {
        along(s0, s1, stepM, (k) => {
          palm(k, side, dist + (k & 1) * 1.5, hBase + hash(k * 29 + side) * 2.5,
               (k & 1) ? PALM_GREEN : PALM_DARK);
        });
      };
      palmRow(0.26, 0.38,  1, 15, 26, 9.0);    // marina promenade
      palmRow(0.26, 0.38, -1, 16, 32, 8.5);
      palmRow(0.72, 0.88, -1, 14, 26, 9.0);    // back-straight campus road
      palmRow(0.72, 0.88,  1, 16, 34, 8.0);
      palmRow(0.60, 0.72, -1, 18, 34, 8.5);    // Turnpike service road
      palmRow(0.38, 0.55,  1, 16, 34, 8.5);    // stadium-lot perimeter
      const LIVE_OAK = [0.22, 0.38, 0.20];
      // Kept clear of the stadium-lot cityFront (side -1, 24-46 m): a species
      // call guards against the ROAD only, never against a building already
      // standing in the band, so the free bands have to be picked by hand.
      along(0.55, 0.62, 46, (k) => acacia(k, -1, 30 + hash(k * 53) * 10, 7.5, LIVE_OAK,
                                          { layers: 2, spread: 11 }));
      along(0.74, 0.86, 52, (k) => acacia(k, 1, 26 + hash(k * 57) * 8, 7.0, LIVE_OAK,
                                          { layers: 2, spread: 10 }));

      billboard(K(0.08),  -1, 14, 14, 16, [0.0,  0.70, 0.80]);
      billboard(K(0.18),   1, 15, 13, 15, [1.0,  0.40, 0.20]);
      billboard(K(0.35),  -1, 16, 14, 16, [0.95, 0.30, 0.60]);
      billboard(K(0.48),   1, 15, 13, 15, [0.0,  0.75, 0.85]);
      billboard(K(0.65),  -1, 14, 14, 16, [1.0,  0.55, 0.10]);
      billboard(K(0.85),   1, 15, 13, 15, [0.20, 0.80, 0.75]);
    };
