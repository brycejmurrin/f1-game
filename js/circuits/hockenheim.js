/* Apex 26 — HOCKENHEIMRING circuit definition (data only).
   Retired circuit (`classic: true`): last German GP 2019, not on the current
   calendar, so it is playable everywhere but never a championship round.
   Registered on the global TrackDefs list; consumed by the js/track/tracks.js
   engine (palette resolved there from `night`, geometry from the OSM trace in
   js/track/geo-paths.js). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hockenheim",
    classic: true,
    // Upstream trace de-1932 already runs the racing direction (clockwise —
    // Nordkurve at T1 is a right-hander), so no flip is needed.
    reverse: false,
    // The trace's first vertex sits on the pit straight (within ~35 m of the
    // start/finish line), so almost no rotation is required. Not GPS-calibrated:
    // OpenF1 has no coverage for a circuit that left the calendar in 2019.
    startFrac: 0.0,
    name: "HOCKENHEIM",
    gp: "German GP",
    country: "Germany",
    night: false,
    theme: "green",
    lengthKm: 4.6,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    // The Motodrom bowl and the forest ranks own their own ground; keep the
    // rendered terrain wide enough to carry both without bridging the foldback
    // between the stadium section and the pit straight.
    terrainOuter: 110,
    // The stadium section is a continuous wall of grandstand — the generic
    // foliage/lamp pass has nowhere to stand there.
    dressingExclusions: [
      { kinds: ["foliage", "lamps"], s0: 0.78, s1: 0.06 },   // Motodrom + pits
      { kind: "foliage", s0: 0.40, s1: 0.50 },               // Spitzkehre runoff
    ],
    // Baden pine forest under a hazy continental summer sky.
    pal: {
      zenith:        [0.26, 0.44, 0.72],
      horizon:       [0.74, 0.76, 0.72],
      sun:           [1.0,  0.95, 0.78],
      sunColor:      [1.0,  0.94, 0.76],
      ambientSky:    [0.48, 0.52, 0.58],
      ambientGround: [0.24, 0.25, 0.20],
      fogColor:      [0.70, 0.72, 0.70],
      grass:         [0.19, 0.42, 0.19],
      sunDir:        [0.42, 0.62, 0.36],
    },
    // Unused: js/track/geo-paths.js carries the real OSM centreline for this id,
    // and the trace always wins (js/track/tracks.js `realPoints(...) || centerline(...)`).
    // Kept out deliberately rather than shipped as dead data.
    //
    // Hockenheim is flat by F1 standards — the Rhine plain — but not dead flat:
    // the forest loop falls away gently to the Spitzkehre and climbs back into
    // the stadium. Authored (not surveyed): tools/bake-elevation.mjs needs SRTM
    // over the network. Fractions are RACING-lap space (startFrac is 0 here).
    elevations: [
      { s: 0.26, halfM: 380, rise: -3.5 },  // drift down through the forest loop
      { s: 0.46, halfM: 300, rise: -5.0 },  // Spitzkehre sits in the low corner
      { s: 0.70, halfM: 420, rise: 4.0 },   // climb back toward the Motodrom
    ],
    // The stadium hairpins and the Spitzkehre are genuinely pinched; the
    // Parabolika and the pit straight keep the full width. hwZones can only
    // narrow, so the 7.5 m base stays everywhere else.
    hwZones: [
      { s0: 0.435, s1: 0.480, hw: 6.2, ease: 0.012 },  // Spitzkehre hairpin
      { s0: 0.815, s1: 0.960, hw: 6.6, ease: 0.015 },  // Motodrom stadium loop
    ],
    // Modest camber — Hockenheim's corners are mostly flat, but the Sachskurve
    // and the Nordkurve are dished enough to matter.
    bankZones: [
      { frac: 0.055, angleDeg: 3.0, widthM: 110 },   // Nordkurve
      { frac: 0.335, angleDeg: 2.5, widthM: 90 },    // Ostkurve entry
      { frac: 0.880, angleDeg: 4.0, widthM: 120 },   // Sachskurve
    ],
    scenery: function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack,
        px, pz, pine, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, tower, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, prop,
        addBox, addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      // Baden pine + mixed broadleaf greens.
      const PINE_D = [0.09, 0.25, 0.13], PINE = [0.11, 0.30, 0.15];
      const LEAF = [0.19, 0.44, 0.20], LEAF_D = [0.15, 0.36, 0.17];
      const GRAVEL = [0.66, 0.61, 0.48];
      const CONC = [0.68, 0.68, 0.66];

      // =====================================================================
      // 1. THE FOREST — Hockenheim's whole identity outside the stadium is a
      //    corridor cut through the Hardtwald. Dense both sides everywhere the
      //    stadium isn't.
      // =====================================================================
      const inStadium = (s) => s >= 0.78 || s <= 0.06;
      every(20, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 31);
        if (h < 0.10) return;
        const side = h < 0.5 ? -1 : 1;
        pine(k, side, 9 + h * 7, 17 + h * 13, h < 0.35 ? PINE_D : PINE);
        if (h > 0.28) pine(k, -side, 10 + h * 8, 15 + h * 12, PINE);
      });
      every(30, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 53 + 9);
        if (h < 0.22) return;
        tree(k, h < 0.5 ? -1 : 1, 14 + h * 10, 11 + h * 8, h < 0.45 ? LEAF_D : LEAF);
        if (h > 0.62) pine(k, h > 0.82 ? -1 : 1, 28 + h * 14, 20 + h * 12, PINE_D);
      });
      // Deep rank blending into the backdrop wall.
      every(48, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.30) return;
        pine(k, h < 0.5 ? -1 : 1, 44 + h * 26, 22 + h * 14, PINE_D);
        if (h > 0.70) tree(k, h > 0.85 ? -1 : 1, 58 + h * 20, 13 + h * 8, LEAF_D);
      });
      // Low scrub along the verge for ground texture.
      every(26, (k) => {
        const s = k / n;
        if (inStadium(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.55) return;
        bush(k, h < 0.78 ? -1 : 1, 6.5 + h * 4, [0.16, 0.34, 0.16]);
      });

      // =====================================================================
      // 2. THE MOTODROM — the signature. A near-continuous bowl of grandstand
      //    wrapping the stadium section, which is what made Hockenheim read as
      //    a stadium rather than a forest circuit.
      // =====================================================================
      // Outer bowl: the big covered stands around the Sachskurve arc.
      grandstandEx(0.855, 1, 16, 120, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.900, 1, 16, 120, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.940, 1, 15, 100, null, null,
        { livery: "concrete", tiers: 2, endWalls: true });
      // Inner bowl facing back across the stadium.
      grandstandEx(0.870, -1, 14, 100, null, null, { livery: "steel", endWalls: true });
      grandstandEx(0.915, -1, 14, 100, null, null, { livery: "concrete", endWalls: true });
      // Mercedes-tribune style banked terraces closing the far end.
      spectatorHill(0.800, 0.850, -1, 15, { rows: 4, rise: 1.2, depth: 1.9, density: 0.55, step: 8 });
      spectatorHill(0.955, 0.995, 1, 16, { rows: 3, rise: 1.1, depth: 1.8, density: 0.50, step: 8 });

      // Lit window bands on the stadium shells — reads as glazing by day, as
      // interior light at dusk.
      {
        const winLit = [0.97, 0.88, 0.54];
        for (const [s, side, dist] of [[0.855, 1, 24], [0.900, 1, 24], [0.870, -1, 21]]) {
          const a = anchor(K(s), side, dist);
          addBox(out, vadd(a.c, a.u, 10.5), [0.22, 1.5, 108], winLit, [a.r, a.u, a.t]);
        }
      }

      // =====================================================================
      // 3. PIT COMPLEX & START/FINISH
      // =====================================================================
      const pitWall = [0.87, 0.87, 0.85];
      for (let i = 0; i < 7; i++) {
        building(K(0.975 + i * 0.008), 1, 15, 16, 9, 11,
          { wall: pitWall, window: [0.28, 0.32, 0.38], floor: 4.5, roof: true });
      }
      // Race-control / timing tower over the line.
      tower(K(0.995), 1, 13, 6, 34, { col: [0.90, 0.90, 0.88], cap: true, capCol: [0.12, 0.12, 0.14], mast: 7 });
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.975, 8.0, [0.15, 0.15, 0.18]);
      // Main grandstand opposite the pits.
      grandstandEx(0.010, -1, 11, 140, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      // Paddock hospitality behind the garages.
      for (let i = 0; i < 4; i++) {
        building(K(0.955 + i * 0.016), 1, 40, 24, 12, 18,
          { wall: [0.80, 0.80, 0.82], window: [0.30, 0.34, 0.42], floor: 4.5, roof: true });
      }
      every(44, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.93 || s < 0.05) || h < 0.5) return;
        motorhome(k, 1, 58 + h * 10, 10, 4, 6, { wall: [0.62 + h * 0.28, 0.62, 0.64] });
      });
      broadcastCompound(K(0.945), 1, 74, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.985, 0.005, 0.025]) billboard(K(s), -1, 8, 12, 4.5, [0.90, 0.86, 0.30]);

      // =====================================================================
      // 4. THE SPITZKEHRE — the hairpin at the far end of the Parabolika, with
      //    its big gravel trap and the temporary stand that always sat outside it.
      // =====================================================================
      groundPatch(K(0.455), -1, 6, [46, 0.18, 60], GRAVEL,
        { id: "hockenheim-spitzkehre-gravel", samples: 8 });
      tyreWall(0.440, 0.475, -1, 5, [0.86, 0.20, 0.18]);
      grandstandEx(0.457, 1, 16, 76, null, null, { livery: "steel", endWalls: true });
      marshalPost(K(0.450), 1, 10);
      for (const s of [0.435, 0.470]) billboard(K(s), -1, 14, 12, 4.5, [0.88, 0.84, 0.78]);

      // Ostkurve / forest-loop corner furniture.
      groundPatch(K(0.335), 1, 5, [26, 0.18, 34], GRAVEL,
        { id: "hockenheim-ostkurve-gravel", samples: 6 });
      tyreWall(0.325, 0.350, 1, 4, [0.20, 0.40, 0.85]);
      grandstandEx(0.340, -1, 18, 54, null, null, { livery: "concrete" });
      marshalPost(K(0.345), -1, 9);

      groundPatch(K(0.62), 1, 5, [24, 0.18, 30], GRAVEL,
        { id: "hockenheim-forest-exit-gravel", samples: 5 });
      marshalPost(K(0.60), 1, 9);

      // =====================================================================
      // 5. BOUNDARIES — armco through the forest, debris fence at the stadium.
      // =====================================================================
      for (const [s0, s1] of [[0.06, 0.32], [0.36, 0.43], [0.49, 0.60], [0.64, 0.78]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.78, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.80, 0.05, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.845, 0.965, 1, 10, 4, [0.74, 0.76, 0.80]);
      fence(0.43, 0.49, -1, 8, 4, [0.74, 0.76, 0.80]);

      for (const s of [0.14, 0.22, 0.29, 0.52, 0.68, 0.75]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      // =====================================================================
      // 6. CONTINUOUS HARDTWALD BACKDROP — the forest wall ringing the circuit.
      // =====================================================================
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [110, 58, 96, 26, 13, 6, [0.13, 0.32, 0.16]],
        [180, 48, 118, 30, 16, 7, [0.11, 0.28, 0.14]],
        [255, 40, 140, 34, 19, 8, [0.10, 0.25, 0.13]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 30;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 30)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      // =====================================================================
      // 7. BESPOKE IDENTITY — the Mercedes-Benz-era pit roof, the forest
      //    marker boards, and the stadium's inner infield service compound.
      // =====================================================================
      // Long tensile canopy over the pit garages — one atomic hero group so a
      // preflight foldback can never leave half a roof behind.
      {
        const a = anchor(K(0.005), 1, 18);
        modelGroup("hockenheim-pit-canopy", {
          center: vadd(a.c, a.u, 10.8),
          size: [5.6, 1.4, 70],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 11), [5.4, 0.8, 70], [0.86, 0.85, 0.82], [a.r, a.u, a.t]);
          addBox(stage, vadd(a.c, a.u, 10.2), [4.9, 0.25, 68], [0.95, 0.90, 0.62], [a.r, a.u, a.t]);
        }, { required: true });
        for (let j = 0; j < 4; j++) {
          const a2 = anchor(K(0.975 + j * 0.014), 1, 16);
          addCyl(out, a2.c, 0.34, 9, [0.72, 0.70, 0.68], 8, null);
        }
      }

      // Braking-marker boards down the Parabolika — the long approach to the
      // Spitzkehre is the one place a driver reads distance boards at speed.
      {
        const board = [0.94, 0.94, 0.90];
        for (let i = 0; i < 4; i++) {
          const a = anchor(K(0.395 + i * 0.012), -1, 6.5);
          addBox(out, vadd(a.c, a.u, 1.5), [0.18, 1.4, 1.8], board, [a.r, a.u, a.t]);
          addCyl(out, a.c, 0.09, 1.0, [0.25, 0.25, 0.28], 5, [a.r, a.u, a.t]);
        }
      }

      // Infield service compound inside the stadium bowl: low sheds and a
      // medical/marshal block, set well behind the inner grandstand line.
      {
        const a = anchor(K(0.890), -1, 46);
        const b = [a.r, a.u, a.t];
        modelGroup("hockenheim-infield-compound", {
          center: vadd(a.c, a.u, 3.2),
          size: [18, 7, 40],
          basis: b,
        }, (stage) => {
          for (let i = 0; i < 3; i++) {
            const p = vadd(a.c, a.t, (i - 1) * 13);
            addBox(stage, vadd(p, a.u, 2.4), [9, 4.8, 10], i % 2 ? [0.78, 0.78, 0.76] : CONC, b);
            addPrism(stage, vadd(p, a.u, 5.4), [9.4, 1.6, 10.4], [0.58, 0.58, 0.60], b);
          }
        });
      }

      // Sachskurve crowd terracing already exists as spectatorHill; add the
      // sponsor hoarding band that fronted it.
      for (const s of [0.865, 0.895, 0.925]) billboard(K(s), 1, 13, 14, 5, [0.90, 0.20, 0.18]);

      // Stadium floodlight-style mast heads — Hockenheim ran evening support
      // races under lights; the poles read as circuit furniture by day.
      for (const [s, side] of [[0.845, 1], [0.905, 1], [0.880, -1]]) {
        const a = anchor(K(s), side, side > 0 ? 30 : 26);
        addCyl(out, a.c, 0.22, 20, [0.20, 0.20, 0.23], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 20.4), [1.6, 0.7, 3.2], [0.94, 0.92, 0.80], [a.r, a.u, a.t]);
      }
    },
  }
  );
})();
