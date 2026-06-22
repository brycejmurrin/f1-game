/* Apex 26 — BAKU circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "baku",
    name: "BAKU",
    gp: "Azerbaijan GP",
    country: "Azerbaijan",
    night: true,
    theme: "street_night",
    street: true,
    lengthKm: 6,
    baseHW: 6,
    pal: { horizon: [0.10, 0.12, 0.22], zenith: [0.04, 0.05, 0.14], sunColor: [0.72, 0.74, 0.88], ambientSky: [0.24, 0.26, 0.36], ambientGround: [0.20, 0.20, 0.28], fogColor: [0.08, 0.10, 0.18], fogDensity: 0.0016 },
    segs: [
      { t: 0, l: 200 }, { t: 90, l: 80 }, { t: -80, l: 70 }, { t: 0, l: 800 }, { t: 90, l: 80 }, { t: 0, l: 400 },
      { t: -70, l: 70 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 600 }, { t: -80, l: 80 },
    ],
    // Baku's castle section: the old-city hairpin climbs steeply through the
    // medieval walls (~14 m), then the circuit descends back to the corniche level.
    elevations: [{ s: 0.35, halfM: 560, rise: 14 }, { s: 0.58, halfM: 320, rise: -10 }],
    scenery: function (api) {
      const {
        out, n, place, prop, backdrop, groundPlane, building, tower, wall,
        fence, guardrail, tyreWall, grandstand, gantry, marshalPost, billboard,
        palm, anchor, along, every, onTrack, addBox, addCyl, addCone, addPrism,
        addFrustum, vadd, hash, cityFront,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Night street palette ----
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

      // ===================================================================
      // Continuous concrete walls + catch-fence lining the whole lap
      // ===================================================================
      wall(0.0, 0.65, 1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.82, 1.0, 1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.0, 0.62, -1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.97, 1.0, -1, 2.0, 1.3, CONCRETE, 0.4);

      fence(0.0, 0.35, 1, 2.6, 3.4, FENCE_COL);
      fence(0.86, 1.0, 1, 2.6, 3.4, FENCE_COL);
      fence(0.0, 0.32, -1, 2.6, 3.4, FENCE_COL);
      guardrail(0.63, 0.96, 1, 3.0, ARMCO);
      fence(0.63, 0.95, 1, 4.0, 3.0, FENCE_COL);

      // ===================================================================
      // FLOODLIGHT POLES — 22 poles around the lap, alternating sides.
      // Each: slim steel post + lamp arm + warm sodium glow patch on ground.
      // ===================================================================
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
        addBox(out, vadd(vadd(a.c, a.u, 9.6), a.r, side * 1.6), [1.2, 0.4, 1.2], [0.26, 0.26, 0.30], b);
        addBox(out, vadd(vadd(a.c, a.u, 9.4), a.r, side * 1.6), [1.0, 0.2, 1.0], LAMP_WARM, b);
      }

      // Marshal posts spaced around the lap
      for (let i = 0; i < 9; i++) marshalPost(K(0.05 + i * 0.105), (i % 2) ? 1 : -1, 3.0);

      // Distant dusk-haze silhouette band — two ranks forming a near-continuous
      // city silhouette wrap around the lap.
      for (let i = 0; i < 24; i++) {
        const k = K(i / 24), side = (i % 2) ? 1 : -1;
        backdrop(k, side, 150 + hash(i * 5) * 90, [26 + hash(i * 7) * 22, 28 + hash(i * 11) * 50, 20], DARK2);
        backdrop(k, side, 280 + hash(i * 13) * 170, [32 + hash(i * 17) * 30, 44 + hash(i * 19) * 90, 24], DARK);
      }

      // ===================================================================
      // s 0.0–0.12 R — GOVERNMENT HOUSE district: civic street canyon
      // A continuous neoclassical facade lines the R side of the start straight,
      // with the iconic Government House palace set back as the centrepiece.
      // ===================================================================

      // Continuous civic facade — R side (gap=8 keeps it behind the concrete wall)
      cityFront(0.0, 0.12, 1, 8, {
        minH: 14, maxH: 28, depth: 20, step: 20,
        palette: CIVIC_PAL, lit: true, windowCol: WIN_WARM, floor: 4,
      });

      // Continuous civic facade — L side of start straight
      cityFront(0.0, 0.12, -1, 8, {
        minH: 12, maxH: 24, depth: 18, step: 20,
        palette: CIVIC_PAL, lit: true, windowCol: WIN_WARM, floor: 4,
      });

      // GOVERNMENT HOUSE: ornate neoclassical palace set well back from road.
      // Built from coordinated anchor offsets so sub-parts do NOT intersect.
      // Layout: central body + two independent corner towers set back.
      {
        const k = K(0.02);
        // Central palace body via building() — gap=42 keeps it well behind facade row
        building(k, 1, 42, 52, 22, 30, { wall: SAND, window: WIN_WARM, floor: 4.5, lit: true });
        // Decorative base plinth (uplit, slightly wider than body, very low)
        const aBase = anchor(k, 1, 68);
        addBox(out, vadd(aBase.c, aBase.u, 1.5), [58, 3, 32], SAND_LIT, [aBase.r, aBase.u, aBase.t]);

        // Twin corner towers — set further back from road than the body so they
        // don't clip through it.
        for (const tOff of [-20, 20]) {
          const aTow = anchor(k, 1, 75);
          const tc = vadd(aTow.c, aTow.t, tOff);
          const b  = [aTow.r, aTow.u, aTow.t];
          addBox(out, vadd(tc, aTow.u, 5),  [14, 10, 14], SAND,     b);
          addCyl(out, vadd(tc, aTow.u, 10), 6.0, 20, SAND,     8, b);
          addFrustum(out, vadd(tc, aTow.u, 30), 6.5, 5.0, 3, SAND_LIT, 8, b);
          addFrustum(out, vadd(tc, aTow.u, 33), 5.0, 1.5, 6, SAND_LIT, 8, b);
          addCone(out, vadd(tc, aTow.u, 39), 1.5, 8, SAND_LIT, 8, b);
          addFrustum(out, vadd(tc, aTow.u, 29), 7.0, 6.5, 1.2, WIN_WARM, 8, b);
        }

        // Ornate entrance gate portico in front of central body
        const aGate = anchor(k, 1, 40);
        addBox(out, vadd(aGate.c, aGate.u, 3), [40, 6, 3], [0.78, 0.68, 0.50], [aGate.r, aGate.u, aGate.t]);
        addBox(out, vadd(aGate.c, aGate.u, 7), [42, 2, 3], WIN_WARM, [aGate.r, aGate.u, aGate.t]);

        // Uplit wash at Government House base (warm stone courtyard glow)
        const aGov = anchor(k, 1, 64);
        addBox(out, vadd(aGov.c, aGov.u, 0.1), [80, 0.5, 40], [0.22, 0.18, 0.10], [aGov.r, aGov.u, aGov.t]);
      }

      // ===================================================================
      // START/FINISH — pit complex (R), grandstands (L), gantries
      // ===================================================================
      for (let i = 0; i < 5; i++)
        building(K(0.95 + i * 0.012), 1, 5, 16, 9, 14, { wall: [0.20, 0.21, 0.26], window: WIN_COOL, floor: 3, lit: true });
      wall(0.94, 0.02, 1, 1.0, 1.0, [0.85, 0.85, 0.88], 0.4);
      grandstand(0.985, -1, 4, 70, [0.42, 0.36, 0.40], [0.50, 0.30, 0.34]);
      grandstand(0.05, -1, 4, 60, [0.42, 0.36, 0.40], [0.46, 0.30, 0.36]);
      gantry(0.0, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.96, 7.0, [0.14, 0.14, 0.18]);
      billboard(0.01, 1, 9, 14, 5, FLAME);

      // Civic plaza obelisk (L side, gap well behind facade row)
      {
        const a = anchor(K(0.045), -1, 28);
        addFrustum(out, vadd(a.c, a.u, 0), 1.4, 0.3, 16, SAND_LIT, 4, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 14), [1.0, 1.0, 1.0], WIN_WARM, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.12–0.22 — T1/T2 STREET CANYON: both sides aligned city facades
      // Replaces the old scattered `place()` flat boxes at this turn complex.
      // ===================================================================
      cityFront(0.12, 0.22, 1, 8, {
        minH: 18, maxH: 40, depth: 20, step: 18,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });
      cityFront(0.12, 0.22, -1, 8, {
        minH: 14, maxH: 30, depth: 18, step: 18,
        palette: CIVIC_PAL, lit: true, windowCol: WIN_WARM, floor: 3.5,
      });

      // ===================================================================
      // s 0.22 R far — FLAME TOWERS: three iconic tapered towers.
      // Each tower is self-contained. The "flame glow" cap is a NARROW
      // cone, not a wide box, so towers never intersect each other.
      // Spacing: 50m between tower centres (was 45 — slightly more spread).
      // ===================================================================
      {
        const k  = K(0.22);
        const aF = anchor(k, 1, 180);
        const b  = [aF.r, aF.u, aF.t];
        const heights   = [210, 240, 210];   // scaled to scene metres
        const towerOffs = [-50, 0, 50];      // along track-right axis (a.r)

        for (let t = 0; t < 3; t++) {
          const H  = heights[t];
          const tc = vadd(aF.c, aF.r, towerOffs[t]);

          // Main tapered body (glass-clad curtain wall — curved facade with blue tint)
          addFrustum(out, tc, 16, 3.0, H, [0.15, 0.22, 0.38], 8, b);

          // Window bands — narrow addFrustum rings stacked every ~H/7
          for (let band = 1; band <= 6; band++) {
            const yFr   = band / 7;
            const rAtY  = 16 * (1 - yFr) + 3.0 * yFr;
            const rOuter = rAtY * 1.04;
            const isFlame = band % 2 === 0;
            addFrustum(out, vadd(tc, aF.u, yFr * H - H * 0.035),
              rOuter, rOuter * 0.94, H * 0.055,
              isFlame ? FLAME_PALE : WIN_WARM, 8, b);
          }

          // Flame crown — stacked narrow cones (not a wide box).
          addCone(out, vadd(tc, aF.u, H),        3.0, 10, FLAME,      8, b);
          addCone(out, vadd(tc, aF.u, H + 10),   2.2,  8, FLAME_PALE, 8, b);
          addCone(out, vadd(tc, aF.u, H + 18),   1.2,  6, WIN_WARM,   8, b);

          // Emissive lit observation crown ring just below top
          addFrustum(out, vadd(tc, aF.u, H - 14), 3.5, 3.0, 3, WIN_WARM, 8, b);
        }

        // Uplit ground wash at the Flame Towers base
        addBox(out, vadd(aF.c, aF.u, 0.1), [160, 0.6, 60], [0.18, 0.10, 0.04], b);
        for (let t = 0; t < 3; t++) {
          const tc = vadd(aF.c, aF.r, (t - 1) * 50);
          addBox(out, vadd(tc, aF.u, 0.2), [30, 0.5, 30], [0.25, 0.14, 0.04], b);
        }
      }

      // ===================================================================
      // s 0.22–0.36 — MAIN STRAIGHT city canyon (both sides)
      // Continuous aligned glass tower facades on both sides of the long
      // 800 m straight leading towards the Old City section.
      // ===================================================================

      // R side: tall glass high-rises (the financial district facing the corniche)
      cityFront(0.22, 0.36, 1, 8, {
        minH: 30, maxH: 80, depth: 22, step: 22,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });

      // L side: mixed modern facades (slightly lower — the city middle band)
      cityFront(0.22, 0.36, -1, 8, {
        minH: 20, maxH: 55, depth: 20, step: 20,
        palette: GLASS_PAL, lit: true, windowCol: WIN_WARM, floor: 4,
      });

      // ===================================================================
      // s 0.36 R near — OLD CITY WALL: continuous crenellated sandstone
      // rampart. The merlon boxes are placed AT wall height to avoid
      // clipping into the wall body below. Dense old-town behind it.
      // ===================================================================
      wall(0.36, 0.56, 1, 10, 9, SAND, 1.2);  // the main unbroken rampart

      // Crenellations — placed at y = wall height (9m top), so they sit
      // ON TOP of the wall, never through it. Each segment has its own anchor.
      for (let p = 0; p < 10; p++) {
        const k = K(0.36 + p * 0.020);
        const a = anchor(k, 1, 10);
        // Uplit footing band at the base of the wall (y = 0 to 2.5)
        addBox(out, vadd(a.c, a.u, 1.2), [4.2, 2.5, 40], SAND_LIT, [a.r, a.u, a.t]);
        // Merlons ON TOP of the 9m wall: y offset = 9 (top face) + 0.9 (half of merlon h)
        for (let j = 0; j < 14; j++) {
          if (j % 2 === 0) {
            const mc = vadd(vadd(a.c, a.t, (j - 6.5) * 3.8), a.u, 9.9);
            addBox(out, mc, [2.4, 1.8, 2.2], SAND, [a.r, a.u, a.t]);
          }
        }
      }

      // Dense sandstone old-town behind the rampart — ALIGNED cityFront facade
      // (gap=18 keeps it well behind the 9m wall at gap=10, so depth 16 never clips)
      cityFront(0.36, 0.56, 1, 18, {
        minH: 6, maxH: 18, depth: 14, step: 16,
        palette: SAND_PAL, lit: true, windowCol: WIN_WARM, floor: 3,
      });

      // Old-town minaret shafts — slim cylinders + domed cap, spaced
      // with enough distance so they don't overlap the rampart.
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

      // ===================================================================
      // s 0.36–0.56 L side — Old-town street facade (inside of the circuit)
      // Continuous low sandstone buildings on the left of the old city section
      // ===================================================================
      cityFront(0.36, 0.42, -1, 8, {
        minH: 6, maxH: 14, depth: 12, step: 14,
        palette: SAND_PAL, lit: true, windowCol: WIN_WARM, floor: 2.5,
      });

      // ===================================================================
      // s 0.42–0.50 — CASTLE SECTION: tall walls both sides, crenellated
      // ===================================================================
      wall(0.42, 0.50, -1, 1.5, 11, SAND, 1.4);
      wall(0.42, 0.50,  1, 1.5, 11, SAND, 1.4);
      for (const side of [-1, 1]) {
        const a = anchor(K(0.44), side, 1.5);
        const b = [a.r, a.u, a.t];
        // Uplit base band (y=0 to 2.0, doesn't clip wall top at y=11)
        addBox(out, vadd(a.c, a.u, 1.0), [2.2, 2.0, 20], SAND_LIT, b);
        // Merlons on top of the 11m wall: y = 11 + 0.7 (half merlon)
        for (let j = 0; j < 8; j++) {
          if (j % 2 === 0) {
            addBox(out, vadd(vadd(a.c, a.t, (j - 3.5) * 3.6), a.u, 11.7), [1.8, 1.4, 2.2], SAND, b);
          }
        }
      }
      // Gateway towers flanking the narrowest point
      {
        const aL = anchor(K(0.46), -1, 1.5);
        const aR = anchor(K(0.46),  1, 1.5);
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

      // ===================================================================
      // s 0.52 L near — MAIDEN TOWER: rebuilt as a clean stack of non-
      // intersecting primitives. Each part begins exactly where the
      // previous part ends (no gaps, no overlaps).
      //
      // Heights (all from ground anchor a.c):
      //   y=0..3   : square stone base platform (addBox)
      //   y=3..5   : octagonal base ring flare (addFrustum, widens to 11)
      //   y=5..33  : main cylindrical drum (addCyl, radius 9, height 28)
      //   y=33..36 : cornice ring (addFrustum, slightly wider then back)
      //   y=36..42 : upper tapering drum (addFrustum, 9→7)
      //   y=42..48 : cone cap (addCone, r=7, h=6)
      //   y=48..50 : finial ball (addBox, 1.5m cube)
      // ===================================================================
      {
        const k = K(0.52);
        const a = anchor(k, -1, 8);
        const b = [a.r, a.u, a.t];

        // Square stone base platform (buried 0.5m into ground for solid footing)
        addBox(out, vadd(a.c, a.u, 1.5), [22, 3, 22], SAND_DARK, b);

        // Octagonal base ring flare — wider than drum, creates distinct pediment
        addFrustum(out, vadd(a.c, a.u, 3), 11.5, 9.2, 2, [0.55, 0.44, 0.30], 8, b);

        // Main cylindrical drum (the famous tower body)
        addCyl(out, vadd(a.c, a.u, 5), 9.2, 28, SAND, 12, b);

        // Stone band window slits — narrow emissive strips along the drum face
        for (let wl = 0; wl < 4; wl++) {
          const wy = 5 + 5 + wl * 6;
          addFrustum(out, vadd(a.c, a.u, wy), 9.3, 9.3, 1.2, WIN_WARM, 12, b);
        }

        // Projecting cornice ring (slightly wider than drum — sits on top at y=33)
        addFrustum(out, vadd(a.c, a.u, 33), 10.0, 9.5, 1.5, SAND_LIT, 12, b);
        // Inward step back (y=34.5..36)
        addFrustum(out, vadd(a.c, a.u, 34.5), 9.5, 7.0, 1.5, SAND, 12, b);

        // Upper tapering section (y=36..42)
        addFrustum(out, vadd(a.c, a.u, 36), 7.0, 4.5, 6, SAND_LIT, 12, b);

        // Cone cap — base radius matches upper frustum top (4.5, y=42..49)
        addCone(out, vadd(a.c, a.u, 42), 4.5, 7, SAND_LIT, 12, b);

        // Finial: small lit stone block at the very tip (y=49..51)
        addBox(out, vadd(a.c, a.u, 49), [2.0, 2.0, 2.0], [0.94, 0.84, 0.64], b);

        // Uplit glow ring at base (ground-level uplit stone look)
        addFrustum(out, vadd(a.c, a.u, 3.2), 12.0, 11.5, 0.8, SAND_LIT, 8, b);

        // Uplit forecourt at Maiden Tower
        addBox(out, vadd(a.c, a.u, 0.1), [30, 0.5, 30], [0.20, 0.16, 0.08], b);
      }

      // ===================================================================
      // s 0.50 R — PALACE OF THE SHIRVANSHAHS cluster.
      // Central mass + crenellations ON TOP (not clipping into the body).
      // ===================================================================
      {
        const PALACE      = [0.72, 0.66, 0.54];
        const PALACE_DARK = [0.62, 0.56, 0.44];
        const k = K(0.50);

        // Main palace structure (gap=20 to clear the castle wall at gap=1.5)
        building(k, 1, 20, 22, 10, 28, { wall: PALACE, window: WIN_WARM, floor: 2, lit: true });

        // Crenellated parapet: merlons at y=10 (top of 10m building)
        const a = anchor(k, 1, 20);
        const b = [a.r, a.u, a.t];
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
        addBox(out, vadd(vadd(a.c, a.t, -13), a.u, 19.5), [1.0, 0.8, 1.0], WIN_WARM, b);
        addBox(out, vadd(vadd(a.c, a.t,  13), a.u, 19.5), [1.0, 0.8, 1.0], WIN_WARM, b);

        // Flanking wing building (east)
        building(K(0.505), 1, 14, 12, 7, 16, { wall: PALACE, window: WIN_WARM, floor: 2, lit: true });

        // Ornamental archway detail on main facade
        addBox(out, vadd(a.c, a.u, 4), [20, 3, 1.5], [0.82, 0.76, 0.64], b);
      }

      // ===================================================================
      // s 0.50–0.58 EXTRA OLD CITY density — stone buildings at the exit
      // of castle/old-city section on BOTH sides before the descent
      // ===================================================================
      {
        const STONE = [0.58, 0.52, 0.42];
        const oldCityData = [
          [0.51, 1, 20, 10, 10, 14],
          [0.54, 1, 22, 12, 12, 12],
          [0.56, 1, 18, 14,  8, 16],
        ];
        for (const [s, side, dist, w, h, d] of oldCityData) {
          building(K(s), side, dist, w, h, d, { wall: STONE, window: WIN_WARM, floor: 3, lit: true });
        }
      }

      // ===================================================================
      // s 0.58 L — seafront: boulevard promenade + palm row
      // ===================================================================
      // Ornate promenade balustrade wall
      wall(0.58, 0.96, -1, 5, 1.4, [0.76, 0.72, 0.64], 0.6);
      // Decorative balusters
      for (let i = 0; i < 32; i++) {
        const s = 0.58 + i * 0.0118;
        const a = anchor(K(s), -1, 5.7);
        addCyl(out, vadd(a.c, a.u, 0.7), 0.16, 1.1, [0.80, 0.74, 0.62], 6, [a.r, a.u, a.t]);
      }
      // Palm-lined promenade (gap=8 keeps palms behind balustrade)
      for (let i = 0; i < 22; i++) {
        const s = 0.58 + i * 0.018;
        palm(K(s), -1, 8 + (i % 3) * 2, 9 + hash(i * 3) * 3.5, [0.18, 0.44, 0.24]);
      }
      // Seafront boulevard pavilion buildings (low, gap=12 behind palms)
      for (let i = 0; i < 6; i++) {
        const s = 0.58 + i * 0.025;
        building(K(s), -1, 14, 14, 5 + i, 12, { wall: [0.38, 0.36, 0.34], window: WIN_WARM, floor: 2.5, lit: true });
      }

      // ===================================================================
      // s 0.65–0.95 — CASPIAN-FRONT straight: dark sea left, lit skyline R
      // ===================================================================
      groundPlane(K(0.65), -1, 14, [300, 2.4, 340], SEA);
      groundPlane(K(0.75), -1, 14, [320, 2.4, 360], SEA);
      groundPlane(K(0.85), -1, 14, [300, 2.4, 340], SEA);
      groundPlane(K(0.92), -1, 14, [280, 2.4, 320], SEA);

      // Distant cargo-vessel silhouettes on the water
      for (let i = 0; i < 6; i++) {
        const a = anchor(K(0.65 + i * 0.055), -1, 110 + hash(i * 5) * 80);
        addBox(out, vadd(a.c, a.u, 3), [14 + hash(i) * 8, 5 + hash(i * 2) * 3, 3.5],
          [0.10, 0.12, 0.18], [a.r, a.u, a.t]);
      }

      // Supplemental Caspian harbour water panel
      groundPlane(K(0.68), -1, 18, [300, 2, 260], [0.12, 0.18, 0.28]);

      // Waterfront pavilion buildings (L side, modest gap past balustrade)
      for (let i = 0; i < 4; i++) {
        const s = 0.66 + i * 0.075;
        building(K(s), -1, 18, 14, 9, 14, { wall: [0.30, 0.34, 0.42], window: WIN_COOL, floor: 3, lit: true });
      }

      // Pier/breakwater structures
      for (let i = 0; i < 3; i++) {
        const s = 0.68 + i * 0.12;
        const a = anchor(K(s), -1, 12);
        addBox(out, vadd(a.c, a.u, 0.5), [2.5, 1.0, 40], [0.55, 0.54, 0.58], [a.r, a.u, a.t]);
      }

      // Continuous modern Caspian-front skyline R: aligned glass tower facades
      // (gap=8 keeps towers behind armco/fence combo at this section)
      cityFront(0.63, 0.95, 1, 8, {
        minH: 40, maxH: 100, depth: 22, step: 20,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });

      // ===================================================================
      // s 0.78–0.86 R mid — prominent glass Caspian-front tower cluster
      // These landmark towers are placed further back to read as
      // distinct silhouettes behind the continuous city wall.
      // ===================================================================
      for (let i = 0; i < 9; i++) {
        const k   = K(0.77 + i * 0.011);
        const bW  = 14 + (i % 2) * 4;
        const h   = 85 + (i % 3) * 45;
        tower(k, 1, 52 + (i % 4) * 24, bW, h,
          { col: GLASS, seg: 7, cap: true, capCol: i % 3 ? WIN_COOL : WIN_WARM });
        // Lit crown ring on each tower (emissive band near top)
        const a = anchor(k, 1, 52 + (i % 4) * 24);
        addFrustum(out, vadd(a.c, a.u, h - 6), bW * 0.32 * 1.1, bW * 0.32 * 0.9, 4,
          i % 3 ? WIN_COOL : WIN_WARM, 7, [a.r, a.u, a.t]);
      }

      // Illuminated billboards along the Caspian straight
      for (let i = 0; i < 5; i++) {
        billboard(K(0.65 + i * 0.065), 1, 9, 14, 6, i % 2 ? FLAME : AZ_BLUE);
      }

      // ===================================================================
      // s 0.97 — braking zone into T1: tyre walls + striped barriers
      // ===================================================================
      tyreWall(0.955, 0.99, 1, 3.0, TARMAC_AD);
      tyreWall(0.955, 0.99, -1, 3.0, [0.9, 0.9, 0.92]);
      for (const side of [-1, 1]) {
        const a = anchor(K(0.97), side, 4);
        addBox(out, vadd(a.c, a.u, 1.0), [2, 0.3, 12], side > 0 ? TARMAC_AD : [0.9, 0.9, 0.92], [a.r, a.u, a.t]);
      }
      billboard(K(0.93), 1, 11, 18, 11, FLAME);
      billboard(K(0.99), -1, 8, 14, 8, WIN_COOL);

      // ===================================================================
      // Waterfront night bar/cafe strip — small lit pavilion boxes with warm windows
      // ===================================================================
      for (let i = 0; i < 5; i++) {
        const s = 0.60 + i * 0.035;
        const a = anchor(K(s), -1, 9 + (i % 2) * 3);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 2), [6, 4, 8], [0.28, 0.30, 0.36], b);
        addBox(out, vadd(a.c, a.u, 2.5), [6.2, 1.2, 8.2], WIN_WARM, b);  // lit windows
      }

      // Seafront billboard (s≈0.15)
      billboard(K(0.15), -1, 20, 14, 5, [0.85, 0.35, 0.10]);
    },
  }
  );
})();
