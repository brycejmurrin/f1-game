/* Apex 26 — BAKU circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "baku",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // TODO: startFrac not GPS-calibrated (defaults to 0)
    name: "BAKU",
    gp: "Azerbaijan GP",
    country: "Azerbaijan",
    night: true,
    theme: "street_night",
    street: true,
    lengthKm: 6,
    baseHW: 6,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      // Baku's bespoke frontage is the NEAR wall; the generic neon city is the
      // mid/far density behind it. Exclude it only from the curated zones: the
      // Old City / castle section and the open Caspian side of Neftchilar Ave.
      { kinds: ["city", "lamps", "foliage", "floodlights"], s0: 0.36, s1: 0.56 },
      // Preserve the Caspian void on the left of Neftchilar Avenue.
      { kinds: ["city", "lamps", "foliage", "floodlights"], s0: 0.58, s1: 0.97, side: -1 },
    ],
    pal: { horizon: [0.10, 0.12, 0.22], zenith: [0.04, 0.05, 0.14], sunColor: [0.72, 0.74, 0.88], ambientSky: [0.24, 0.26, 0.36], ambientGround: [0.20, 0.20, 0.28], fogColor: [0.08, 0.10, 0.18], fogDensity: 0.0016 },
    // Castle Section squeeze (~7.6 m full width). CircuitPaths ignores segs `w:`;
    // hwZones overlays half-width onto the real trace (see applyHwZones in tracks.js).
    // Neftchilar Ave is the widest thing on the calendar; the Old City approach
    // and the T15/T16 seafront kink are noticeably tighter than the base 12 m.
    hwZones: [
      { s0: 0.42, s1: 0.50, hw: 3.8, ease: 0.02 },      // Castle Section
      // NB s0/s1 are CONTROL-POINT index fractions (applyHwZones walks pts by
      // index, and the OSM trace is not evenly spaced) — these are the values
      // that land on racing-lap arc 0.075-0.098 / 0.32-0.345 / 0.735-0.775.
      { s0: 0.0874, s1: 0.1194, hw: 5.3, ease: 0.012 },  // T2 tight left
      { s0: 0.2577, s1: 0.3233, hw: 5.4, ease: 0.012 },  // T6/T7 into the Old City
      { s0: 0.8232, s1: 0.8825, hw: 5.4, ease: 0.012 },  // T15/T16 seafront kink
    ],
    // No bankZones on purpose: Baku is flat city tarmac with a drainage crown
    // and no measurable corner banking, and tilting the road edge here pushes the
    // armco liveries (placed hard against the road edge) over the lowered inner
    // verge — the props-over-road probe picks it up immediately.
    // Castle Section (s≈0.42–0.50): narrow to ~7.6 m full width (w = half-width).
    // segs `w:` still documents intent / applies if the CircuitPaths trace drops.
    segs: [
      { t: 0, l: 200 }, { t: -90, l: 80 }, { t: 80, l: 70 }, { t: 0, l: 725 },
      { t: 0, l: 75, w: 3.8 }, { t: -90, l: 80, w: 3.8 }, { t: 0, l: 50, w: 3.8 }, { t: 0, l: 350 },
      { t: 70, l: 70 }, { t: -60, l: 60 }, { t: 55, l: 60 }, { t: -60, l: 60 }, { t: 0, l: 600 }, { t: 80, l: 80 },
    ],
    // Baku's castle section climbs from the Old City approach to a ~14 m crest
    // at the gate, then returns smoothly to sea level before the long straight.
    elevations: [{ s: 0.46, halfM: 500, rise: 14 }],
    scenery: function (api) {
      const {
        out, MAT, n, backdrop, groundPatch, waterSurface, waterBand, modelGroup, building, tower, wall,
        fence, guardrail, tyreWall, grandstand, gantry, marshalPost, billboard,
        palm, anchor, along, every, onTrack, addBox, addCyl, addCone, addPrism,
        addFrustum, ferrisWheel, vadd, hash, cityFront,
        circuitKit,
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

      // Proper street-race infrastructure at the flat-out finish approach.
      // The pit building sits behind the existing pit-wall frontage; the bridge
      // supplies one deliberate event beat without cluttering the castle climb.
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

      // Distant haze silhouette — differentiated by circuit section so the
      // Caspian Sea (L side of seafront) reads dark/blue while the city (R)
      // always has tall lit building masses.
      // s 0.0–0.22: start / T1 — dense civic backdrop both sides
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

      // ===================================================================
      // s 0.0–0.12 R — GOVERNMENT HOUSE district: civic street canyon
      // A continuous neoclassical facade lines the R side of the start straight,
      // with the iconic Government House palace set back as the centrepiece.
      // ===================================================================

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

      // ===================================================================
      // National flag poles — three tall flagpoles at the civic plaza.
      // Azerbaijan flag (blue/red/green tricolour) represented as a lit
      // panel. Placed on the L side behind the facade row.
      // ===================================================================
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

      // ===================================================================
      // s 0.12–0.22 — T1/T2 STREET CANYON: both sides aligned city facades
      // Replaces the old scattered `place()` flat boxes at this turn complex.
      // ===================================================================
      cityFront(0.12, 0.22, 1, 14, {
        minH: 18, maxH: 40, depth: 18, step: 18,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });
      cityFront(0.12, 0.22, -1, 14, {
        minH: 14, maxH: 30, depth: 16, step: 18,
        palette: CIVIC_PAL, lit: true, windowCol: WIN_WARM, floor: 3.5,
      });

      // ===================================================================
      // s 0.22 R far — FLAME TOWERS: three iconic tapered towers with
      // full-height LED fire (stacked emissive orange/red/amber bands).
      // Spacing: 50m between tower centres.
      // ===================================================================
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
            addFrustum(stage, tc, 16, 3.0, H, [0.10, 0.12, 0.22], 8, b);

            // Full-height fire veil stays inside the atomic landmark group.
            const nBands = 16;
            for (let band = 0; band < nBands; band++) {
              const yFr  = (band + 0.5) / nBands;
              const rAtY = 16 * (1 - yFr) + 3.0 * yFr;
              const col  = FIRE_BANDS[band % FIRE_BANDS.length];
              addFrustum(stage, vadd(tc, aF.u, yFr * H - (H / nBands) * 0.45),
                rAtY * 1.08, rAtY * 0.96, (H / nBands) * 0.88, col, 8, b);
              // A brighter road-facing fire core breaks up the ring silhouette
              // and makes each tower read as an LED-clad flame rather than a cone.
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
          addBox(stage, vadd(aF.c, aF.u, 1.0), [130, 2.0, 44], SAND_DARK, b);
          addBox(stage, vadd(aF.c, aF.u, 3.0), [110, 2.0, 38], [0.30, 0.25, 0.20], b);
          addBox(stage, vadd(aF.c, aF.u, 5.0), [88, 2.0, 32], [0.22, 0.20, 0.19], b);
          for (let t = 0; t < 3; t++) {
            const tc = vadd(aF.c, aF.r, (t - 1) * 50);
            addBox(stage, vadd(tc, aF.u, 0.2), [30, 0.5, 30], [0.30, 0.12, 0.03], b);
          }
        }, { required: true });
      }

      // ===================================================================
      // s 0.22–0.36 — MAIN STRAIGHT city canyon (both sides)
      // Continuous aligned glass tower facades on both sides of the long
      // 800 m straight leading towards the Old City section.
      // ===================================================================

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
      // Repeating projecting balconies give the Boulevard frontage a specific
      // Baku residential/hotel rhythm. Kept on the Caspian side so the Flame
      // Towers remain unobstructed on the right-hand skyline.
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
      // Boulevard palm row along the Caspian-side of the main straight
      for (let i = 0; i < 14; i++) {
        const s = 0.23 + i * 0.009;
        palm(K(s), -1, 9 + (i % 2), 8 + hash(i * 7) * 3, [0.18, 0.44, 0.24]);
      }

      // ===================================================================
      // s 0.36 R near — OLD CITY WALL: continuous crenellated sandstone
      // rampart. The merlon boxes are placed AT wall height to avoid
      // clipping into the wall body below. Dense old-town behind it.
      // ===================================================================
      wall(0.36, 0.56, 1, 20, 9, SAND, 1.2);  // the main unbroken rampart

      // Crenellations — placed at y = wall height (9m top), so they sit
      // ON TOP of the wall, never through it. Each segment has its own anchor.
      for (let p = 0; p < 10; p++) {
        const k = K(0.36 + p * 0.020);
        const a = anchor(k, 1, 20);
        // Merlons ON TOP of the 9m wall: y offset = 9 (top face) + 0.9 (half of merlon h)
        for (let j = 0; j < 14; j++) {
          if (j % 2 === 0) {
            const mc = vadd(vadd(a.c, a.t, (j - 6.5) * 3.8), a.u, 9.9);
            addBox(out, mc, [2.4, 1.8, 2.2], SAND, [a.r, a.u, a.t]);
          }
        }
      }

      // Low buttresses and warm uplights articulate the long outer rampart.
      // Fractions stop before 0.42 and resume after 0.50: the castle squeeze,
      // gate sightline, and its close walls remain untouched.
      for (const s of [0.365, 0.385, 0.405, 0.515, 0.535, 0.555]) {
        const a = anchor(K(s), 1, 19.4);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 4.5), [2.6, 9.0, 3.2], SAND_DARK, b);
        addBox(out, vadd(a.c, a.u, 0.18), [3.4, 0.34, 3.8], SAND_LIT, b);
        addBox(out, vadd(vadd(a.c, a.u, 2.4), a.r, -0.75), [0.28, 3.2, 1.2],
          WIN_WARM, b);
      }

      // Dense sandstone old-town behind the rampart
      cityFront(0.36, 0.56, 1, 24, {
        minH: 6, maxH: 18, depth: 12, step: 16,
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
      cityFront(0.36, 0.42, -1, 16, {
        minH: 6, maxH: 14, depth: 10, step: 14,
        palette: SAND_PAL, lit: true, windowCol: WIN_WARM, floor: 2.5,
      });

      // ===================================================================
      // s 0.42–0.50 — CASTLE SECTION squeeze: ~2 m clearance both sides
      // (pairs with hwZones hw:3.8 ≈ 7.6 m full width on CircuitPaths)
      // ===================================================================
      wall(0.42, 0.50, -1, 2.0, 11, SAND, 1.4);
      wall(0.42, 0.50,  1, 2.0, 11, SAND, 1.4);
      // Follow the curved wall node-by-node. The former tangent-offset row was
      // straight in world space and cut back across the road before the crest.
      along(0.42, 0.50, 7.2, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 2.0);
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
        // The 24m-wide footprint needs a centre offset, not an edge clearance.
        const a = anchor(k, -1, 16);
        const b = [a.r, a.u, a.t];

        modelGroup("baku-maiden-tower", {
          center: vadd(a.c, a.u, 25.5),
          size: [24, 51, 24],
          basis: b,
        }, (stage) => {
          // Square stone base platform (buried 0.5m into ground for solid footing)
          addBox(stage, vadd(a.c, a.u, 1.5), [22, 3, 22], SAND_DARK, b);

          // Octagonal base ring flare — wider than drum, creates distinct pediment
          addFrustum(stage, vadd(a.c, a.u, 3), 11.5, 9.2, 2, [0.55, 0.44, 0.30], 8, b);

          // Main cylindrical drum (the famous tower body)
          addCyl(stage, vadd(a.c, a.u, 5), 9.2, 28, SAND, 12, b);

          // Stone band window slits — narrow emissive strips along the drum face
          for (let wl = 0; wl < 4; wl++) {
            const wy = 5 + 5 + wl * 6;
            addFrustum(stage, vadd(a.c, a.u, wy), 9.3, 9.3, 1.2, WIN_WARM, 12, b);
          }

          // Projecting cornice ring (slightly wider than drum — sits on top at y=33)
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
        }, { required: true });

        // Terrain-conforming forecourt; unlike a raw slab this cannot float on
        // the Old City descent or bridge a nearby foldback.
        groundPatch(k, -1, 1, [30, 0.5, 30], [0.20, 0.16, 0.08],
          { id: "baku-maiden-forecourt", samples: 6 });
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
          [0.51, 1, 24, 10, 10, 14],
          [0.54, 1, 26, 12, 12, 12],
          [0.56, 1, 22, 14,  8, 16],
        ];
        for (const [s, side, dist, w, h, d] of oldCityData) {
          building(K(s), side, dist, w, h, d, { wall: STONE, window: WIN_WARM, floor: 3, lit: true });
        }
      }

      // ===================================================================
      // s 0.58 L — Caspian void: keep near balustrade only; cull mid-ground
      // (palms / cafes / pavilions / near piers) so reflective sea + far
      // silhouettes read. Vert budget freed for Flame Towers LED bands.
      // ===================================================================
      // Ornate promenade balustrade wall (near-edge frame, not mid-ground)
      wall(0.58, 0.96, -1, 5, 1.4, [0.76, 0.72, 0.64], 0.6);
      // Sparse decorative balusters (thinned — was 32)
      for (let i = 0; i < 12; i++) {
        const s = 0.58 + i * 0.031;
        const a = anchor(K(s), -1, 5.7);
        addCyl(out, vadd(a.c, a.u, 0.7), 0.16, 1.1, [0.80, 0.74, 0.62], 6, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.65–0.95 — CASPIAN-FRONT straight: dark sea left, lit skyline R
      // ===================================================================
      // Distant cargo-vessel silhouettes on the water (far only)
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

      // ===================================================================
      // s 0.75 L — far fountain plume (pushed back; mid-ground plaza culled)
      // ===================================================================
      {
        const aFt = anchor(K(0.75), -1, 72);
        const b   = [aFt.r, aFt.u, aFt.t];
        addFrustum(out, vadd(aFt.c, aFt.u, 0.3), 6, 5.2, 0.8, [0.38, 0.38, 0.42], 10, b);
        addCone(out, vadd(aFt.c, aFt.u, 0.6), 1.0, 6, [0.60, 0.80, 0.95], 8, b);
        addCone(out, vadd(aFt.c, aFt.u, 4.5), 0.5, 3, WIN_COOL, 6, b);
      }

      // Continuous modern Caspian-front skyline R: aligned glass tower facades
      // (gap=14 keeps towers behind armco/fence combo at this section)
      cityFront(0.63, 0.95, 1, 14, {
        minH: 40, maxH: 100, depth: 20, step: 20,
        palette: GLASS_PAL, lit: true, windowCol: WIN_COOL, floor: 4,
      });

      // ===================================================================
      // s 0.70 R — CRYSTAL HALL: Baku's landmark elliptic concert venue.
      // An ovoid steel-and-glass shell sitting on a low podium, lit in
      // blue-white. Approximated with stacked frustums + a wide flat disc
      // roof ring to suggest the distinctive roof canopy.
      // ===================================================================
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
        addFrustum(out, vadd(aH.c, aH.u, 26.5), 13, 12, 1.2, WIN_COOL, 10, b);
        // Uplit forecourt wash
        addBox(out, vadd(aH.c, aH.u, 0.1), [54, 0.4, 44], [0.10, 0.12, 0.20], b);
      }

      // ===================================================================
      // s 0.78–0.86 R mid — prominent glass Caspian-front tower cluster
      // Three distinct tower heights (stepped, tapered, tower archetypes)
      // visible behind the continuous cityFront wall.
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

      // Cafe / palm mid-ground strip culled — Neftchilar L reads as open Caspian

      // Seafront billboard (s≈0.15)
      billboard(K(0.15), -1, 20, 14, 5, [0.85, 0.35, 0.10]);

      // ═══════════════════════════════════════════════════════════════════
      // BESPOKE CASPIAN WATERFRONT MODELS
      // ═══════════════════════════════════════════════════════════════════

      // ── Reflective Caspian Sea ──────────────────────────────────────────
      // A genuine reflective water buffer mirroring the night sky/skyline,
      // laid across the seafront left of the long straight. Narrow overlapping
      // panels avoid spanning the circuit's nearby foldbacks.
      waterBand(0.63, 0.93, -1, 16, 236, 12, SEA, { id: "baku-caspian" });

      // ── BAKU EYE — Ferris wheel pushed to far silhouette (sea void mid culled)
      ferrisWheel(K(0.80), -1, 88, 28);
      {
        const a = anchor(K(0.80), -1, 88);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 0.2), [32, 0.4, 32], [0.14, 0.12, 0.18], b);
        addCyl(out, vadd(a.c, a.u, 28), 3.0, 2.8, WIN_COOL, 14, b);
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
        const k = K(0.65 + i * 0.055), a = anchor(k, -1, 110 + hash(k) * 40);
        addCyl(out, vadd(a.c, a.u, 6), 0.2, 14 + hash(k * 3) * 8, [0.70, 0.72, 0.80], 4, [a.r, a.u, a.t]);
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
    },
  }
  );
})();
