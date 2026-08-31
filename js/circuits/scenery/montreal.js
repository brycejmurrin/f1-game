/* Apex 26 — MONTREAL scenery (data only), split out of js/circuits/montreal.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["montreal"] =
  function (api) {
      const { out, n, py, pyMin, place, backdrop, wall, grandstandEx,
        building, anchor, addBox, addCyl, addCone, addPrism, addFrustum, vadd, hash,
        fence, tyreWall, hedge, billboard, gantry, marshalPost, bush,
        scaffoldStand, broadleafFall,
        ferrisWheel, tower, onTrack, forestEdge, cityFront,
        modelGroup, overheadSpan, waterSurface, waterBand, groundPatch, foundation,
        broadcastCompound, cameraTower, sponsorHoarding, circuitKit,
        cross, norm, MAT, COL, frameAt } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── strut(): thin cylinder between two world points (geodesic lattice) ────
      const strut = (a, c, rad, col, seg, target) => {
        const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1e-6;
        const up = [d[0] / L, d[1] / L, d[2] / L];
        const ref = Math.abs(up[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const right = norm(cross(ref, up));
        const fwd = norm(cross(up, right));
        addCyl(target || out, a, rad, L, col, seg || 3, [right, up, fwd]);
      };

      const BASE   = pyMin || 0;
      const BANK_T = BASE - 0.35;   // far-bank shore: above river (−0.45), below main island

      const WALL     = [0.78, 0.79, 0.80];   // pale concrete
      // Bright teal Olympic Basin + St. Lawrence — COL.basinTeal when available
      const TEAL     = (COL && COL.basinTeal) || [0.08, 0.55, 0.62];
      const RIVER    = TEAL;                 // St. Lawrence — bright basin teal
      const RIVER2   = [TEAL[0] + 0.06, TEAL[1] + 0.08, TEAL[2] + 0.06]; // lighter near-shore
      const BASIN    = TEAL;                 // Olympic rowing lake (bright teal)
      const GRASS    = [0.22, 0.43, 0.20];   // park green (muted, avoids neon under sun)
      const FOLIAGE  = [0.16, 0.34, 0.18];   // deep tree green (darker summer deciduous)
      const FOLIAGE2 = [0.20, 0.40, 0.20];   // lighter June foliage
      const HEDGE    = [0.16, 0.32, 0.17];   // clipped hedge green

      const KERB_R = [0.82, 0.20, 0.18], KERB_W = [0.90, 0.90, 0.90];

      // ── Flag mast helper: slender pole with a coloured pennant box at the top ──
      const flagMast = (k, side, dist, h, col) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 1.5)) return;
        addCyl(out, a.c, 0.07, h, [0.30, 0.30, 0.33], 5, b);
        addBox(out, vadd(a.c, a.u, h - 0.7), [0.04, 1.4, 2.4], col, b);
      };

      const rowingTower = (id, s, side, dist, h) => {
        const a = anchor(K(s), side, dist);
        const b = [a.r, a.u, a.t];
        modelGroup(id, {
          center: vadd(a.c, a.u, h * 0.5 + 1.5),
          size: [8, h + 3.5, 9],
          basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, h * 0.48),
            [4.6, h * 0.96, 6.2], [0.78, 0.80, 0.82], b);
          for (const y of [h * 0.34, h * 0.62, h * 0.82]) {
            addBox(stage, vadd(vadd(a.c, a.u, y), a.r, -2.36),
              [0.22, 1.55, 5.2], [0.30, 0.46, 0.56], b);
          }
          addBox(stage, vadd(a.c, a.u, h * 0.96 + 0.2),
            [7.2, 0.5, 8.0], [0.90, 0.91, 0.92], b);
          addCyl(stage, vadd(a.c, a.u, h * 0.96 + 0.45),
            0.10, 2.8, [0.36, 0.37, 0.39], 5, b);
        });
      };

      for (const [side, runs] of [[-1, [[0, 6], [8, 15]]], [1, [[0, 3], [5, 10], [12, 15]]]])
        for (const [a, b] of runs)
          waterBand(a / 16, (b + 1) / 16, side, 72, 180, 12, RIVER, {
            id: `montreal-river-${a}-${side < 0 ? "l" : "r"}`,
          });

      // ── Far-bank land strip: a flat shoreline slab across the water that the
      // downtown skyline / Biosphère / La Ronde stand ON (so they read as a city
      // and islands ACROSS the river, never floating on water). Raised just above
      // the water surface; track-aligned so its long face parallels the road.
      const FARBANK  = [0.34, 0.40, 0.30];   // muted river-bank green-grey
      const farBank = (k, side, near, far, lenM, col) => {
        const a = anchor(k, side, (near + far) / 2);
        const depth = far - near;
        const H = 5;
        // Lift so top face is at BANK_T (pyMin−0.35) — above river (−0.45) but
        // below the main island slab (−0.10), reading as a separate island bank.
        // anchor().c[1] reflects groundYAt for large dist (≈−2.46), NOT pyMin,
        // so we must compute the lift explicitly from BANK_T and that value.
        addBox(out, vadd(a.c, a.u, BANK_T - H / 2 - a.c[1]),
               [lenM, H, depth], col || FARBANK, [a.r, a.u, a.t]);
      };

      {
        const LAGOON = [0.13, 0.28, 0.38];   // park lagoon water (darker, muted)
        const SAND   = [0.88, 0.80, 0.58];   // Jean-Doré beach sand (pale tan)
        const lk = K(0.65);
        waterSurface(lk, -1, 54, [72, 0.25, 126], LAGOON, {
          id: "montreal-jean-dore-lagoon",
        });
        groundPatch(lk, -1, 40, [18, 0.35, 112], SAND, {
          id: "montreal-jean-dore-beach", samples: 6,
        });
      }

      for (const side of [-1, 1]) {
        for (const [s0, s1, gap] of [
          [0.0, 0.19, 2.5], [0.19, 0.23, 3.5], [0.23, 0.69, 2.5],
          [0.69, 0.73, 3.5], [0.73, 1.0, 2.5],
        ]) wall(s0, s1, side, gap, 1.5, WALL);
      }

      // Catch / debris fence behind the walls — the tight street-style corridor.
      fence(0.0, 1.0, -1, 3.4, 3.0, [0.72, 0.74, 0.78]);
      fence(0.0, 1.0,  1, 3.4, 3.0, [0.72, 0.74, 0.78]);

      for (let i = 0; i < 8; i++) {
        const s = (0.88 + i * 0.025) % 1;
        groundPatch(K(s),  1, 8, [48, 0.35, 42], GRASS,
          { id: `montreal-pit-lawn-r-${i}`, samples: 6 });
        groundPatch(K(s), -1, 8, [44, 0.35, 40], GRASS,
          { id: `montreal-pit-lawn-l-${i}`, samples: 6 });
      }
      // Right verge: park lawns from Senna S through the Casino complex
      for (let i = 0; i < 14; i++) {
        if ([4, 9, 11, 12].includes(i)) continue; // nearby foldbacks own this ground
        groundPatch(K(0.08 + i * 0.058), 1, 9, [42, 0.35, 40], GRASS,
          { id: `montreal-park-lawn-r-${i}`, samples: 6 });
      }
      // Left verge: island interior from basin entry to back straight
      for (let i = 0; i < 10; i++) {
        groundPatch(K(0.10 + i * 0.068), -1, 9, [40, 0.35, 38], GRASS,
          { id: `montreal-park-lawn-l-${i}`, samples: 6 });
      }

      // Continuous low clipped hedge / treeline ribbon framing the verges
      hedge(0.13, 0.19,  1, 9, 1.6, HEDGE);
      hedge(0.23, 0.24,  1, 9, 1.6, HEDGE);
      hedge(0.38, 0.50,  1, 9, 1.4, HEDGE);   // mid-island right verge
      hedge(0.62, 0.69, -1, 9, 1.6, HEDGE);
      hedge(0.73, 0.78, -1, 9, 1.6, HEDGE);
      hedge(0.78, 0.90,  1, 9, 1.6, HEDGE);

      // Marshal posts spaced around the lap (orange-roofed bunkers + flag pole)
      for (const s of [0.05, 0.18, 0.32, 0.47, 0.56, 0.68, 0.82, 0.94]) {
        marshalPost(K(s), (Math.round(s * 100) % 2) ? 1 : -1, 8.5);
      }

      grandstandEx(0.02,  1,  8, 120, null, null,
        { livery: "teal", tiers: 2, roof: "truss", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.0,  -1, 10,  90, null, null, { livery: "steel", roof: "cantilever", endWalls: true });
      grandstandEx(0.06,  1,  9,  90, null, null, { livery: "alu", roof: "flat" });
      grandstandEx(0.96, -1, 11,  80, null, null, { livery: "teal", roof: "cantilever" });

      // Start/finish gantry spanning the main straight + a second timing arch
      gantry(0.005, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.97,  6.5, [0.16, 0.16, 0.20]);

      // Flag masts flanking the start/finish line (Canadian red + maple leaf red)
      flagMast(K(0.005),  1, 10, 12, [0.88, 0.12, 0.16]);
      flagMast(K(0.005), -1, 10, 12, [0.88, 0.12, 0.16]);
      flagMast(K(0.999),  1,  9, 11, [0.88, 0.12, 0.16]);

      if (circuitKit) {
        circuitKit.pitBuilding({
          id: "kit:montreal:pit-building", frac: 0.995,
          side: -1, gap: 13, size: [18, 10, 260], garages: 16, required: true,
        });
        circuitKit.hospitality({
          id: "kit:montreal:espace-paddock", frac: 0.015,
          side: -1, gap: 30, size: [20, 15, 130], modules: 5,
        });
        // TV/service presence behind the paddock — none existed at all before.
        circuitKit.cameraCrane({
          id: "kit:montreal:camera-crane", frac: 0.945,
          side: -1, gap: 40, size: [6, 17, 6],
        });
        circuitKit.serviceCompound({
          id: "kit:montreal:service-compound", frac: 0.06,
          side: -1, gap: 45, size: [24, 5, 42], vehicles: 8,
        });
        circuitKit.trackSigns({
          id: "kit:montreal:pit-signage", frac: 0.05,
          side: 1, gap: 24, size: [2.2, 2.2, 60], count: 8,
        });
      }
      broadcastCompound(K(0.03), -1, 58, { vans: 3, dishes: 2, mastH: 10 });

      const STRAIGHT_HUES = [
        [0.90, 0.62, 0.14], [0.88, 0.82, 0.22], [0.86, 0.24, 0.20], [0.92, 0.50, 0.12],
      ];
      [0.01, 0.04, 0.97, 0.94].forEach((s, i) => {
        billboard(K(s), 1, 10, 14, 4, STRAIGHT_HUES[i]);
      });
      // Cooler basin zone starts here (Olympic Basin rowing lake) — teal/blue.
      billboard(K(0.07), -1, 11, 12, 4, [0.18, 0.52, 0.58]);

      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) {
          place(K(0.04 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_W : KERB_R);
        }
      }
      // Tyre barriers stacked against the apex walls of the Senna S
      tyreWall(0.038, 0.058,  1, 3.2, [0.85, 0.30, 0.20]);
      tyreWall(0.042, 0.06,  -1, 3.2, [0.90, 0.90, 0.30]);
      marshalPost(K(0.05), 1, 9);

      {
        waterBand(0.065, 0.20, -1, 26, 136, 12, BASIN,
          { id: "montreal-olympic-basin-north" });
      }
      forestEdge(0.07, 0.19, -1, 42, {
        density: 0.75, hMin: 9, hMax: 16,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.2
      });
      // Far bank low treeline backdrop across the water (green → engine renders as rounded mounds)
      for (let i = 0; i < 12; i++) {
        const k = K(0.08 + (i / 12) * 0.12);
        backdrop(k, -1, 140 + hash(i * 11) * 25, [20, 7 + hash(i * 5) * 5, 20], [0.16, 0.30, 0.17]);
      }

      rowingTower("montreal-rowing-tower-north", 0.135, -1, 49, 17);
      for (let i = 0; i < 4; i++) {
        const s = 0.088 + i * 0.023;
        for (let lane = 0; lane < 3; lane++) {
          const a = anchor(K(s), -1, 30 + lane * 8);
          addBox(out, vadd(a.c, a.u, 0.18), [0.8, 0.35, 1.8],
            ((i + lane) % 2) ? [0.92, 0.84, 0.22] : [0.88, 0.24, 0.20],
            [a.r, a.u, a.t]);
        }
      }

      scaffoldStand(0.1575, 0.1725, 1, 17, {
        rows: 6, rise: 1.10, setback: 1.85, legEvery: 1,
        tubeCol: [0.66, 0.67, 0.70], deckCol: [0.70, 0.66, 0.58],
        bench: [[0.30, 0.36, 0.52], [0.80, 0.78, 0.74], [0.72, 0.24, 0.22]],
        density: 0.6,
      });

      {
        const k = K(0.10);
        const a = anchor(k, -1, 28);
        const b = [a.r, a.u, a.t];
        // Platform deck: 30 m long, 6 m wide, 3 m above ground
        addBox(out, vadd(a.c, a.u, 3.0), [6, 0.4, 30], [0.76, 0.77, 0.80], b);
        // Low railing walls along the long edges (track-side and water-side)
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.r,  3.1), [0.18, 0.8, 30], [0.72, 0.72, 0.74], b);
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.r, -3.1), [0.18, 0.8, 30], [0.72, 0.72, 0.74], b);
        // Four support columns
        for (const ot of [-11, -4, 4, 11]) {
          addCyl(out, vadd(vadd(a.c, a.t, ot), a.u, 0), 0.28, 3.0, [0.68, 0.68, 0.70], 6, b);
        }
      }

      forestEdge(0.13, 0.19, 1, 12, {
        density: 0.72, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      forestEdge(0.23, 0.35, 1, 12, {
        density: 0.72, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      // Left verge: treeline on the inner infield side
      forestEdge(0.13, 0.19, -1, 12, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });
      forestEdge(0.23, 0.30, -1, 12, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      const MAPLE_G  = [0.20, 0.42, 0.19];   // sugar maple, high summer
      const MAPLE_G2 = [0.26, 0.48, 0.22];   // lighter, sunlit crown
      const MAPLE_R  = [0.36, 0.14, 0.20];   // 'Crimson King' — deep purple-red
      for (const [s, side, gap, h, tone] of [
        [0.142,  1, 17, 13, 0], [0.151,  1, 22, 15, 1], [0.168,  1, 18, 12, 2],
        [0.178,  1, 24, 14, 0], [0.243,  1, 19, 13, 1], [0.256,  1, 25, 15, 0],
        [0.271,  1, 17, 12, 2], [0.288,  1, 22, 14, 0], [0.305,  1, 18, 13, 1],
        [0.146, -1, 16, 12, 0], [0.164, -1, 21, 14, 1], [0.256, -1, 17, 13, 2],
        [0.276, -1, 22, 15, 0],
        [0.392,  1, 17, 13, 1], [0.412,  1, 22, 14, 0], [0.433,  1, 18, 12, 2],
        [0.596, -1, 16, 13, 0], [0.612, -1, 21, 15, 1], [0.631, -1, 17, 12, 2],
        [0.648, -1, 23, 14, 0],
        [0.802, -1, 18, 13, 1], [0.821, -1, 23, 15, 0], [0.845, -1, 17, 12, 2],
        [0.862,  1, 19, 14, 0], [0.881,  1, 24, 13, 1], [0.898,  1, 18, 12, 0],
      ]) {
        broadleafFall(K(s), side, gap, h,
                      tone === 2 ? MAPLE_R : (tone ? MAPLE_G2 : MAPLE_G),
                      { lobes: 4, spread: 1.2, barkCol: [0.34, 0.30, 0.26] });
      }

      // Shrub clumps for low-level ground greenery detail
      for (let i = 0; i < 18; i++) {
        const s = 0.16 + i * 0.0088;
        if (s >= 0.19 && s <= 0.23) continue;
        bush(K(s), (i % 2) ? 1 : -1, 9 + hash(i * 11) * 5,
          (i % 2) ? [0.22, 0.42, 0.20] : [0.18, 0.38, 0.18]);
      }

      forestEdge(0.35, 0.50, 1, 12, {
        density: 0.65, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.12
      });
      forestEdge(0.35, 0.48, -1, 12, {
        density: 0.55, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });
      forestEdge(0.495, 0.535, -1, 24, {
        density: 0.62, hMin: 8, hMax: 15,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.12
      });
      forestEdge(0.655, 0.688, 1, 42, {
        density: 0.58, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.16
      });
      // Scattered bushes in the mid-island infield near the Casino approach
      for (let i = 0; i < 10; i++) {
        bush(K(0.37 + i * 0.012), (i % 2) ? 1 : -1, 10 + hash(i * 7) * 4,
          (i % 2) ? [0.20, 0.40, 0.18] : [0.24, 0.44, 0.20]);
      }
      cameraTower(K(0.385), 1, 25, { h: 16 });
      sponsorHoarding(0.36, 0.44, 1, 11, {
        palette: [[0.14, 0.42, 0.68], [0.90, 0.90, 0.90], [0.10, 0.34, 0.72], [0.90, 0.62, 0.14]],
      });
      billboard(K(0.44), -1, 10, 12, 4, [0.20, 0.46, 0.42]);

      {
        const k = K(0.25);
        const a = anchor(k, 1, 175);
        const b = [a.r, a.u, a.t];
        const PALE   = [0.82, 0.84, 0.88];   // Expo concrete / aluminium
        const PALE2  = [0.88, 0.90, 0.93];   // brighter fin faces
        const WIN    = [0.55, 0.68, 0.78];   // recessed glazing between fins
        const TIERS = [
          { H: 24, W: 48, D: 36, nfin: 9 },   // grade-level hall (original footprint)
          { H: 17, W: 38, D: 28, nfin: 7 },   // first setback
          { H: 11, W: 28, D: 20, nfin: 5 },   // crown
        ];
        out._mat = MAT.CONCRETE;
        const PLINTH_TOP = 1.2 + 2.4 / 2;
        let yBase = PLINTH_TOP;
        for (const tier of TIERS) {
          const cy = yBase + tier.H / 2;
          addBox(out, vadd(a.c, a.u, cy), [tier.W, tier.H, tier.D], PALE, b);
          // Recessed glass ribbon mid-façade (Expo curtain wall between fins)
          addBox(out, vadd(vadd(a.c, a.u, yBase + tier.H * 0.42), a.r, -tier.W / 2 - 0.15),
                 [0.4, tier.H * 0.55, tier.D * 0.88], WIN, b);
          // Vertical aluminium fins wrapping the track-facing façade of this
          // tier. Measured (float-audit): fins keyed to THIS tier's own box
          // lose the support test on the +t half of the spread (only the
          // -t half of every tier above the ground floor ever grounds, no
          // matter how deep the fin is embedded in its tier box — isolated
          // by forcing every ot negative, which alone took montreal's casino
          // cluster to zero). Rather than chase that inside a tier that isn't
          // the reliable reference, run every fin the full height from the
          // PLINTH (proven grounded — direct terrain touch) up to its tier's
          // usual top: same visual band per tier, but anchored on the one
          // primitive the support chain never lost.
          const finTop = yBase + tier.H * 0.98;
          const finH = finTop - PLINTH_TOP;
          for (let i = 0; i < tier.nfin; i++) {
            const ot = tier.nfin > 1 ? ((i / (tier.nfin - 1)) - 0.5) * (tier.D - 4) : 0;
            addBox(out, vadd(vadd(vadd(a.c, a.u, PLINTH_TOP + finH / 2), a.r, -tier.W / 2 - 1.2), a.t, ot),
                   [2.4, finH, 1.1], PALE2, b);
          }
          yBase += tier.H;
        }
        // Low podium plinth under the hall
        addBox(out, vadd(a.c, a.u, 1.2), [TIERS[0].W + 8, 2.4, TIERS[0].D + 8], [0.76, 0.78, 0.82], b);
        // Shallow roof cap / parapet atop the crown tier
        addBox(out, vadd(a.c, a.u, yBase + 1.0), [TIERS[2].W + 2, 2.0, TIERS[2].D + 2], PALE2, b);
        out._mat = 0;
      }

      for (let i = 0; i < 13; i++) {
        farBank(K(0.27 + i * 0.015), -1, 185, 320, 220);
      }

      {
        const a = anchor(K(0.335), -1, 210);
        if (!onTrack(a.c[0], a.c[2], 30)) {
          const b = [a.r, a.u, a.t];
          const foot = vadd(a.c, a.u, BANK_T - a.c[1]);
          const STEEL  = [0.78, 0.80, 0.83];
          const STEEL_D = [0.66, 0.68, 0.72];
          modelGroup("montreal-calder-trois-disques", {
            center: vadd(foot, a.u, 11), size: [26, 26, 26], basis: b,
          }, (stage) => {
            stage._mat = MAT.METAL;
            const LEGS = [[-1, -1, 1.00], [1, -1, 1.07], [-1, 1, 1.14], [1, 1, 1.21]];
            for (const [dr, dt, sc] of LEGS) {
              for (let i = 0; i < 6; i++) {
                const f = i / 5, f2 = (i + 1) / 5;
                const s1 = (1.2 + f * 6.2) * sc, s2 = (1.2 + f2 * 6.2) * sc;
                const y1 = 10.5 - f * 10.0, y2 = 10.5 - f2 * 10.0;
                const p1 = vadd(vadd(vadd(foot, a.r, dr * s1), a.t, dt * s1), a.u, y1);
                const p2 = vadd(vadd(vadd(foot, a.r, dr * s2), a.t, dt * s2), a.u, y2);
                strut(p2, p1, 0.78 - f * 0.15, i % 2 ? STEEL : STEEL_D, 7, stage);
              }
            }
            // Waist and body as round members, and ONE disc rather than three.
            // Three overlapping 14-segment disc rims share facet normals, and
            // together with the flat body plates they kept montreal at +1 on
            // coplanar-audit through seven attempts (thickness offsets, depth
            // offsets, splay desync, relocating the whole sculpture). Rounding
            // the body and reducing to a single disc removes the last cluster
            // of parallel flat faces. It is a simplification of Calder's real
            // plate-steel form, and it is the honest trade: the ratchet exists
            // to stop exactly this kind of drift, and a decorative landmark is
            // not worth spending the budget it protects.
            // The four diagonal leg centres reach ~2.57 m from the waist axis
            // at their top segment. Their 0.85 m caps therefore stopped just
            // outside the old 1.5 m waist radius (2.35 m combined): visually
            // close, but a disconnected floating cluster to the support graph.
            // A 1.8 m lower waist overlaps those caps without moving the body
            // or changing its upper silhouette.
            addFrustum(stage, vadd(foot, a.u, 11.0), 1.8, 1.1, 2.4, STEEL, 9, b);
            addFrustum(stage, vadd(foot, a.u, 13.2), 1.1, 0.7, 7.0, STEEL, 9, b);
            const disc = [a.u, a.r, a.t];
            addCyl(stage, vadd(foot, a.u, 19.4), 3.4, 0.35, STEEL, 14, disc);
            stage._mat = 0;
          });
        }
      }

      // ── JARDINS DES FLORALIES ────────────────────────────────────────────
      // The infield of Île Notre-Dame is not service compound, it is a formal
      // ornamental garden — the Floralies, laid out for the 1980 Floralies
      // Internationales and still planted, with canals, footbridges and
      // massed bedding. Half a million flowers go into its displays. The one
      // thing that must read is that the planting is GEOMETRIC: rectangular
      // parterres in blocks of single strong colour, edged in clipped green.
      // Scattered bushes would say park; blocks say Floralies.
      {
        const BED = [
          [0.86, 0.24, 0.26], [0.94, 0.72, 0.16], [0.88, 0.42, 0.62],
          [0.62, 0.34, 0.72], [0.96, 0.90, 0.82], [0.90, 0.52, 0.14],
        ];
        const EDGE = [0.20, 0.40, 0.20];
        const GRAVEL = [0.74, 0.71, 0.64];
        for (const [sf, side, gap] of [
          // Block gaps must clear each other. Rows step out 11 m x3, so a block
          // at gap G occupies G..G+22 plus a 10.4 m parterre width — the first
          // cut paired 54/72 and 60/80, which overlapped (76 vs 72, 82 vs 80)
          // and put two identical gravel pads at the same height on one plane.
          // That was montreal's +1 coplanar spot in CI.
          [0.205, 1, 54], [0.245, 1, 92], [0.560, 1, 60], [0.600, 1, 98],
        ]) {
          const kk = K(sf), a0 = anchor(kk, side, gap);
          if (onTrack(a0.c[0], a0.c[2], 26)) continue;
          const b = [a0.r, a0.u, a0.t];
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 4; c++) {
              const hv = hash(kk * 31 + r * 13 + c * 7);
              const p = vadd(vadd(a0.c, a0.r, r * 11), a0.t, (c - 1.5) * 11);
              if (onTrack(p[0], p[2], 14)) continue;
              // Gravel walk under and around each parterre.
              addBox(out, vadd(p, a0.u, 0.05), [10.4, 0.10, 10.4], GRAVEL, b);
              // Clipped green edging, then the massed colour inside it.
              out._mat = MAT.FOLIAGE;
              addBox(out, vadd(p, a0.u, 0.35), [8.6, 0.60, 8.6], EDGE, b);
              addBox(out, vadd(p, a0.u, 0.52), [7.0, 0.62, 7.0],
                     BED[Math.floor(hv * 997) % BED.length], b);
              out._mat = 0;
            }
          }
        }
      }

      {
        const k = K(0.30);
        const a = anchor(k, -1, 205);
        const DOME   = [0.86, 0.88, 0.91];  // bright steel-grey lattice
        const DOME_D = [0.80, 0.82, 0.86];  // very lightly shaded lower rings

        const R = 40;            // sphere radius → 80 m diameter
        const Y0 = -6;           // bury just the very bottom so it sits like a sphere
        const STK = 10;          // ring count over the visible hemisphere+
        let yPrev = Y0;
        // radius of the sphere at height y (relative to centre at R)
        const rAt = (y) => {
          const t = (y - R) / R;            // -1 (bottom) … +1 (top)
          return R * Math.sqrt(Math.max(0, 1 - t * t));
        };
        out._mat = MAT.METAL;
        for (let i = 1; i <= STK; i++) {
          const yTop = Y0 + ((R * 2 - Y0) * i) / STK;   // climb to ~80 m apex
          const h = yTop - yPrev;
          const rb = rAt(yPrev), rt = rAt(yTop);
          // keep the whole dome bright (only the very base slightly shaded) so the
          // silhouette reads as a rounded pale sphere, never a dark cone.
          const col = yPrev < R * 0.45 ? DOME_D : DOME;
          addFrustum(out, vadd(a.c, a.u, (yPrev + yTop) / 2), Math.max(rb, 1.5),
                     Math.max(rt, 1.0), h, col, 18, [a.r, a.u, a.t]);
          yPrev = yTop;
        }
        // Faint equatorial belt to read the geodesic banding at the widest point
        addFrustum(out, vadd(a.c, a.u, R), R + 0.4, R + 0.4, 1.2, DOME_D, 18, [a.r, a.u, a.t]);
        out._mat = 0;

        const LAT = [0.60, 0.62, 0.66];               // steel lattice grey
        const surf = (y, phi) => vadd(vadd(vadd(a.c, a.u, y),
                     a.r, rAt(y) * Math.cos(phi)), a.t, rAt(y) * Math.sin(phi));
        const MER = 14, RN = 12;
        const yTopMax = R * 2 - 1.5;                  // stop just shy of the pole
        out._mat = MAT.METAL;
        // meridian ribs
        for (let m = 0; m < MER; m++) {
          const phi = m / MER * 6.2832;
          let prev = surf(0.5, phi);
          for (let j = 1; j <= RN; j++) {
            const y = 0.5 + (yTopMax - 0.5) * j / RN;
            const cur = surf(y, phi);
            strut(prev, cur, 0.28, LAT, 3);
            prev = cur;
          }
        }
        // latitude rings
        for (let j = 1; j < RN; j++) {
          const y = 0.5 + (yTopMax - 0.5) * j / RN;
          let prev = surf(y, 0);
          for (let m = 1; m <= MER; m++) {
            const cur = surf(y, m / MER * 6.2832);
            strut(prev, cur, 0.24, LAT, 3);
            prev = cur;
          }
        }
        // diagonal bracing on the mid bands → triangulated geodesic read
        for (let j = 3; j <= 8; j++) {
          const y0 = 0.5 + (yTopMax - 0.5) * j / RN;
          const y1 = 0.5 + (yTopMax - 0.5) * (j + 1) / RN;
          for (let m = 0; m < MER; m++) {
            const phi0 = m / MER * 6.2832, phi1 = (m + 1) / MER * 6.2832;
            strut(surf(y0, phi0), surf(y1, phi1), 0.16, LAT, 3);
          }
        }
        out._mat = 0;
      }

      for (let i = 0; i < 6; i++) {
        farBank(K(0.32 + i * 0.019), -1, 1500, 1760, 320, [0.36, 0.41, 0.40]);
      }

      cityFront(0.36, 0.41, -1, 1520, {
        minH: 55, maxH: 130, depth: 26, step: 30,
        palette: [
          [0.56, 0.60, 0.66], [0.60, 0.62, 0.68],
          [0.52, 0.56, 0.62], [0.58, 0.60, 0.66],
        ],
        lit: false,
        windowCol: [0.64, 0.78, 0.96],
        floor: 6,
      });
      // A couple of taller hero towers in the middle of the cluster (René-Lévesque)
      for (let i = 0; i < 5; i++) {
        const k = K(0.37 + (i / 5) * 0.03);
        backdrop(k, -1, 1560 + hash(i * 19) * 70,
                 [22, 100 + hash(i * 13) * 70, 22], [0.54, 0.58, 0.64]);
      }

      {
        const jk = K(0.37);
        const ja = anchor(jk, -1, 1400);
        const jb = [ja.r, ja.u, ja.t];
        const STEEL = [0.62, 0.64, 0.68];    // silver-grey painted steel truss
        const SPAN = 500, DECK_Y = 16, TOP_Y = 45, BAYS = 12;
        const half = SPAN / 2;
        // Deck (roadway) — continuous low chord along the span
        addBox(out, vadd(ja.c, ja.u, DECK_Y), [12, 2.4, SPAN], STEEL, jb);
        // Top chord of the through-truss
        addBox(out, vadd(ja.c, ja.u, TOP_Y), [8, 1.6, SPAN], STEEL, jb);
        let prevTop = vadd(vadd(ja.c, ja.t, -half), ja.u, TOP_Y);
        let prevBot = vadd(vadd(ja.c, ja.t, -half), ja.u, DECK_Y + 1.2);
        for (let i = 0; i <= BAYS; i++) {
          const off = -half + (SPAN / BAYS) * i;
          const top = vadd(vadd(ja.c, ja.t, off), ja.u, TOP_Y);
          const bot = vadd(vadd(ja.c, ja.t, off), ja.u, DECK_Y + 1.2);
          strut(bot, top, 0.5, STEEL, 4);        // vertical post
          if (i > 0) {
            strut(prevBot, top, 0.4, STEEL, 4);  // diagonal
            strut(prevTop, bot, 0.4, STEEL, 4);  // opposing diagonal (X-bracing)
          }
          prevTop = top; prevBot = bot;
        }
        // Two main piers descending toward the water below the deck
        for (const off of [-half * 0.55, half * 0.55]) {
          addBox(out, vadd(vadd(ja.c, ja.t, off), ja.u, DECK_Y * 0.4),
            [6, DECK_Y * 0.8, 6], [0.48, 0.49, 0.52], jb);
        }
      }

      {
        const hk = K(0.332);
        const ha = anchor(hk, -1, 790);
        const hb = [ha.r, ha.u, ha.t];
        const CUBE = 9;                        // module edge length (m)
        const TONE_A = [0.72, 0.70, 0.65];      // pale warm concrete
        const TONE_B = [0.80, 0.79, 0.75];      // lighter tone
        const LAYOUT = [
          [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0],
          [0.5, 1, 0.3], [1.5, 1, 0.3], [2.5, 1, 0.3], [3.5, 1, 0.3],
          [1, 2, 0.6], [2, 2, 0.6], [3, 2, 0.6],
          [1.5, 3, 0.9], [2.5, 3, 0.9],
          [2, 4, 1.2],
        ];
        modelGroup("montreal-habitat67", {
          center: vadd(vadd(vadd(ha.c, ha.t, CUBE * 2), ha.u, CUBE * 2.5), ha.r, -CUBE * 0.6),
          size: [CUBE * 5 + 6, CUBE * 5 + 6, CUBE * 6 + 6],
          basis: hb,
        }, (stage) => {
          for (let i = 0; i < LAYOUT.length; i++) {
            const [tOff, level, rJog] = LAYOUT[i];
            const c = vadd(vadd(vadd(ha.c,
              ha.t, tOff * CUBE),
              ha.u, CUBE / 2 + level * CUBE * 0.94),
              ha.r, -rJog * CUBE);
            addBox(stage, c, [CUBE * 0.92, CUBE * 0.92, CUBE * 0.92],
              (i % 2) ? TONE_A : TONE_B, hb);
          }
          return true;
        });
      }

      {
        const k = K(0.45);
        const frame = frameAt(0.45);
        const deckY = frame.c[1] + 8;
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 5);
          const h = deckY - a.c[1];
          const capY = deckY - 0.4;        // underside of the pier head plate
          const center = vadd(a.c, a.u, h / 2);
          const basis = [a.r, a.u, a.t];
          modelGroup(`montreal-casino-footbridge-support-${side < 0 ? "left" : "right"}`, {
            center,
            size: [1.1, h, 3.4],
            basis,
          }, (stage) => {
            // The legs used to be plain boxes standing on anchor().c, which is
            // deliberately sunk 0.3 m BELOW the sampled surface (see the embed
            // note in js/track/scenery-nature.js) so a flat-based prop cannot
            // float off the downhill edge of a slope. That embed is right for a
            // tree or a sign and wrong for a BRIDGE PIER: the feet ended up
            // buried, 0.3 m clear of the grass they are supposed to bear on.
            // foundation() is the engine's terrain-anchoring mechanism — it
            // samples the REAL terrain ribbon at the corners and centre of the
            // leg's own footprint and fills from `top` down to the lowest of
            // them, so each leg finds its own grade instead of inheriting one
            // point's offset. embed 0 because Île Notre-Dame is a dead-level
            // shelf (flatTerrain) — there is no slope seam here to hide, and a
            // pier that meets the ground is the whole point. `ground` is the
            // anchor's own surface reading, used only if the ribbon does not
            // cover the footprint, so a required model can never fail to build.
            let ok = false;
            for (const along of [-1.2, 1.2]) {
              ok = foundation(stage, {
                center: vadd(a.c, a.t, along),
                size: [0.65, 0.65],
                top: capY,
                basis,
                col: [0.60, 0.62, 0.64],
                embed: 0,
                ground: a.c[1] + 0.3,
              }) || ok;
            }
            addBox(stage, vadd(a.c, a.u, h - 0.2),
              [1.1, 0.4, 3.4], [0.66, 0.68, 0.70], basis);
            return ok;
          }, { required: true });
        }
        overheadSpan({
          id: "montreal-casino-footbridge",
          frac: 0.45,
          clearance: 8,
          thickness: 1,
          depth: 4,
          supportGap: 5,
          color: [0.68, 0.70, 0.72],
          required: true,
          supports: false,
        });
      }

      ferrisWheel(K(0.42), 1, 200, 34);
      // fairground tower beside ferris wheel
      tower(K(0.40), 1, 220, 14, 46,
        { col: [0.78, 0.62, 0.40], seg: 6, cap: true, capCol: [0.8, 0.3, 0.2], mast: 10 });

      grandstandEx(0.55,  1, 12, 70, null, null, { livery: "alu", roof: "cantilever" });
      grandstandEx(0.53, -1, 12, 60, null, null, { livery: "teal", roof: "flat" });
      grandstandEx(0.57,  1, 13, 60, null, null, { livery: "steel", roof: "cantilever" });
      for (const side of [-1, 1]) {
        for (let j = 0; j < 3; j++) place(K(0.55 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_R : KERB_W);
      }
      // Tyre walls + marshal post packed around the slow hairpin apex
      tyreWall(0.545, 0.565, -1, 3.0, [0.90, 0.85, 0.20]);
      tyreWall(0.548, 0.568,  1, 3.0, [0.85, 0.30, 0.20]);
      marshalPost(K(0.55), -1, 9);
      billboard(K(0.52),  1, 11, 12, 4, [0.24, 0.30, 0.62]);
      // Casino/back straight runs the length of the Olympic Basin — cool teal.
      billboard(K(0.58), -1, 11, 12, 4, [0.14, 0.46, 0.62]);

      {
        waterBand(0.565, 0.679, 1, 24, 144, 12, BASIN,
          { id: "montreal-olympic-basin-straight" });
      }
      // Small white regatta lane/start towers standing in the basin water
      for (const s of [0.60, 0.67]) {
        const a = anchor(K(s), 1, 22);
        if (onTrack(a.c[0], a.c[2], 2)) continue;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 3.0), [2.0, 6.0, 2.0], [0.86, 0.87, 0.90], b);
        addBox(out, vadd(a.c, a.u, 6.2), [2.6, 0.5, 2.6], [0.70, 0.72, 0.76], b);
      }
      // Finish/announcer tower anchors the long Olympic Basin straight.
      rowingTower("montreal-rowing-tower-finish", 0.625, 1, 48, 19);
      // Right verge: island parkland trees on the FAR bank beyond the basin
      forestEdge(0.575, 0.65, 1, 38, {
        density: 0.70, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.20
      });
      // Left verge: infield trees along the Casino straight
      forestEdge(0.58, 0.65, -1, 28, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });

      grandstandEx(0.65, -1, 18, 80, null, null,
        { livery: "teal", tiers: 2, roof: "cantilever", endWalls: true });

      scaffoldStand(0.7327, 0.7473, -1, 18, {
        rows: 5, rise: 1.22, setback: 2.0, legEvery: 2, awning: true,
        awningCols: [[0.90, 0.90, 0.88], [0.86, 0.20, 0.18]],
        tubeCol: [0.60, 0.62, 0.66], deckCol: [0.72, 0.68, 0.60],
        density: 0.55,
      });

      // Canal / water feature off the right verge — island park internal canal
      {
        for (let i = 0; i < 2; i++) {
          const ck = K(0.78 + i * 0.023);
          waterSurface(ck, 1, 70, [28, 0.3, 74], RIVER, {
            id: `montreal-park-canal-${i}`,
          });
        }
      }
      // Park canal frontage — cool green, matching the basin/canal identity.
      billboard(K(0.84), -1, 11, 12, 4, [0.18, 0.48, 0.30]);

      forestEdge(0.84, 0.92, 1, 14, {
        density: 0.68, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      // Left-side forestEdge resumes beyond the foldback around s=0.72.
      forestEdge(0.78, 0.90, -1, 25, {
        density: 0.60, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      {
        const k = K(0.80);
        building(k, 1, 28, 18, 12, 16,
          { kind: "cross", wall: [0.74, 0.76, 0.80], window: [0.52, 0.64, 0.76], floor: 3 });
      }

      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) place(K(0.92 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_W : KERB_R);
      }
      tyreWall(0.915, 0.935, -1, 3.0, [0.90, 0.85, 0.20]);
      marshalPost(K(0.93), -1, 9);
      grandstandEx(0.93, -1, 12, 70, null, null, { livery: "alu", roof: "flat" });

      wall(0.955, 0.99, 1, 0.8, 3.6, [0.84, 0.85, 0.87], 0.7);

      // Red "Bienvenue" signature stripe on the wall face.
      {
        const k = K(0.97);
        const a = anchor(k, 1, 0.78);
        addBox(out, vadd(a.c, a.u, 1.8), [0.10, 0.70, 22], [0.88, 0.20, 0.18], [a.r, a.u, a.t]);
      }
      {
        const k = K(0.972);
        const a = anchor(k, 1, 2.4);
        const b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 2)) {
          for (const ot of [-11, -4, 4, 11]) {
            addCyl(out, vadd(a.c, a.t, ot), 0.14, 5.8, [0.32, 0.32, 0.35], 5, b);
          }
          // Main panel: Québec blue field
          addBox(out, vadd(a.c, a.u, 5.4), [0.14, 2.4, 26], [0.14, 0.32, 0.64], b);
          // White horizontal cross band
          addBox(out, vadd(a.c, a.u, 5.4), [0.18, 0.55, 26], [0.94, 0.95, 0.98], b);
          // White vertical cross (centre fleur-de-lis stub)
          addBox(out, vadd(a.c, a.u, 5.4), [0.18, 2.4, 0.7], [0.94, 0.95, 0.98], b);
          // Thin red "Bienvenue" accent bar under the panel
          addBox(out, vadd(a.c, a.u, 4.0), [0.12, 0.35, 22], [0.88, 0.18, 0.16], b);
        }
      }
      // Grandstand viewing the Wall + final chicane
      grandstandEx(0.97, -1, 12, 90, null, null,
        { livery: "teal", roof: "truss", endWalls: true });
      billboard(K(0.96), -1, 12, 14, 4, [0.85, 0.30, 0.16]);
    };
