/* Apex 26 — CIRCUIT DE BARCELONA-CATALUNYA definition (data only).
   Off-calendar (`classic: true`): the Spanish GP moved to the Madring for 2026,
   so Catalunya is playable everywhere but is not a championship round.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "catalunya",
    classic: true,
    // Upstream es-1991 already runs clockwise, matching the racing direction
    // (Elf at T1 is a right-hander).
    reverse: false,
    // The trace opens on the 700 m main straight; nudge the line along it so the
    // grid sits short of the Turn 1 braking zone. Not GPS-calibrated.
    startFrac: 0.03,
    name: "CATALUNYA",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    lengthKm: 4.7,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 115,
    dressingExclusions: [
      { kinds: ["foliage", "lamps"], s0: 0.92, s1: 0.12 },  // pits + main straight
      { kind: "foliage", s0: 0.42, s1: 0.52 },              // the open infield bowl
    ],
    // Dry Catalan light: hard sun, bleached scrub, dusty ochre runoff.
    pal: {
      zenith:        [0.20, 0.42, 0.76],
      horizon:       [0.80, 0.80, 0.72],
      sun:           [1.0,  0.96, 0.80],
      sunColor:      [1.0,  0.95, 0.78],
      ambientSky:    [0.50, 0.54, 0.60],
      ambientGround: [0.30, 0.27, 0.20],
      fogColor:      [0.76, 0.74, 0.66],
      grass:         [0.30, 0.40, 0.19],
      runoff:        [0.62, 0.48, 0.32],
      sunDir:        [0.40, 0.70, 0.28],
    },
    // Catalunya sits on a hillside: the lap climbs from Turn 1 to the high
    // ground at Campsa, then falls all the way down to the final corners.
    // Authored, not surveyed.
    elevations: [
      { s: 0.18, halfM: 380, rise: 7.0 },    // climb through Renault/Repsol
      { s: 0.44, halfM: 420, rise: 11.0 },   // high ground before Campsa
      { s: 0.62, halfM: 400, rise: -9.0 },   // Campsa drop toward La Caixa
      { s: 0.86, halfM: 360, rise: -6.0 },   // run down to the final chicane
    ],
    hwZones: [
      { s0: 0.290, s1: 0.335, hw: 6.4, ease: 0.012 },  // Seat / Wurth chicane
      { s0: 0.660, s1: 0.705, hw: 6.3, ease: 0.012 },  // La Caixa hairpin
      { s0: 0.905, s1: 0.955, hw: 6.5, ease: 0.012 },  // final chicane complex
    ],
    bankZones: [
      { frac: 0.060, angleDeg: 3.5, widthM: 120 },   // Elf (T1)
      { frac: 0.235, angleDeg: 4.0, widthM: 130 },   // Repsol
      { frac: 0.500, angleDeg: 4.5, widthM: 150 },   // Campsa
      { frac: 0.800, angleDeg: 3.0, widthM: 120 },   // Europcar
    ],
    scenery: function (api) {
      const { out, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz,
        pine, tree, bush, hedge, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, tower, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        addBox, addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      const PINE = [0.14, 0.31, 0.16], PINE_D = [0.11, 0.25, 0.14];
      const SCRUB = [0.33, 0.38, 0.20], SCRUB_D = [0.27, 0.32, 0.17];
      const GRAVEL = [0.70, 0.62, 0.46];

      // =====================================================================
      // 1. CATALAN SCRUB + UMBRELLA PINE — sparse, dry, nothing like a forest.
      //    The circuit sits in open hillside; keep the planting thin and low so
      //    the long sightlines that define this track survive.
      // =====================================================================
      const openInfield = (s) => (s >= 0.92 || s <= 0.12) || (s >= 0.42 && s <= 0.52);
      every(30, (k) => {
        const s = k / n;
        if (openInfield(s)) return;
        const h = hash(k * 31);
        if (h < 0.42) return;
        pine(k, h < 0.5 ? -1 : 1, 14 + h * 12, 11 + h * 7, h < 0.6 ? PINE : PINE_D);
      });
      every(22, (k) => {
        const s = k / n;
        if (openInfield(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.40) return;
        bush(k, h < 0.72 ? -1 : 1, 7 + h * 6, h < 0.6 ? SCRUB : SCRUB_D);
        if (h > 0.80) bush(k, h > 0.90 ? -1 : 1, 13 + h * 8, SCRUB_D);
      });
      every(48, (k) => {
        const s = k / n;
        if (openInfield(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.55) return;
        tree(k, h < 0.5 ? -1 : 1, 40 + h * 26, 9 + h * 6, [0.24, 0.36, 0.19]);
      });

      // =====================================================================
      // 2. PIT COMPLEX AND MAIN GRANDSTAND — the long covered stand down the
      //    whole main straight is Catalunya's most recognisable structure.
      // =====================================================================
      const pitWall = [0.88, 0.88, 0.86];
      for (let i = 0; i < 9; i++) {
        building(K(0.945 + i * 0.007), 1, 15, 16, 9, 11,
          { wall: pitWall, window: [0.28, 0.32, 0.40], floor: 4.5, roof: true });
      }
      tower(K(0.985), 1, 13, 6, 36, { col: [0.92, 0.92, 0.90], cap: true, capCol: [0.80, 0.14, 0.12], mast: 8 });
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.965, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 11, 180, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.055, -1, 12, 120, null, null, { livery: "steel", endWalls: true });
      {
        const winLit = [0.97, 0.88, 0.54];
        // On the stand's back shell rather than inside the seating bowl.
        const a = anchor(K(0.005), -1, 22);
        addBox(out, vadd(a.c, a.u, 10.4), [0.22, 1.5, 160], winLit, [a.r, a.u, a.t]);
      }
      // Long tensile roof over the pit lane.
      {
        const a = anchor(K(0.980), 1, 18);
        modelGroup("catalunya-pit-canopy", {
          center: vadd(a.c, a.u, 10.8), size: [5.6, 1.4, 78], basis: [a.r, a.u, a.t],
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 11), [5.4, 0.8, 78], [0.88, 0.87, 0.84], [a.r, a.u, a.t]);
          addBox(stage, vadd(a.c, a.u, 10.2), [4.9, 0.25, 76], [0.94, 0.90, 0.60], [a.r, a.u, a.t]);
        }, { required: true });
      }
      for (let i = 0; i < 4; i++) {
        building(K(0.920 + i * 0.014), 1, 40, 24, 12, 18,
          { wall: [0.82, 0.82, 0.82], window: [0.30, 0.34, 0.42], floor: 4.5, roof: true });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 58 + h * 10, 10, 4, 6, { wall: [0.64 + h * 0.26, 0.64, 0.66] });
      });
      broadcastCompound(K(0.912), 1, 76, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.90, 0.20, 0.16]);

      // =====================================================================
      // 3. THE CORNER STANDS — Catalunya's crowd sits in big freestanding
      //    grandstands at Elf, Repsol, Campsa and the stadium section.
      // =====================================================================
      grandstandEx(0.065, 1, 20, 96, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.240, -1, 20, 80, null, null, { livery: "concrete", endWalls: true });
      grandstandEx(0.505, 1, 22, 84, null, null, { livery: "steel", endWalls: true });
      grandstandEx(0.690, -1, 20, 90, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.930, 1, 18, 100, null, null, { livery: "steel", endWalls: true });
      spectatorHill(0.30, 0.36, 1, 15, { rows: 3, rise: 1.0, depth: 1.8, density: 0.40, step: 9 });

      // Gravel + tyre walls at the heavy-braking corners.
      groundPatch(K(0.065), 1, 6, [40, 0.18, 54], GRAVEL,
        { id: "catalunya-t1-gravel", samples: 8 });
      tyreWall(0.050, 0.085, 1, 5, [0.86, 0.20, 0.18]);
      marshalPost(K(0.070), -1, 10);

      groundPatch(K(0.312), -1, 5, [24, 0.18, 32], GRAVEL,
        { id: "catalunya-chicane-gravel", samples: 6 });
      tyreWall(0.298, 0.328, -1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.315), 1, 9);

      groundPatch(K(0.685), 1, 5, [28, 0.18, 36], GRAVEL,
        { id: "catalunya-lacaixa-gravel", samples: 6 });
      tyreWall(0.668, 0.700, 1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.678), -1, 9);

      groundPatch(K(0.930), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "catalunya-final-gravel", samples: 6 });
      marshalPost(K(0.925), 1, 9);

      // =====================================================================
      // 4. BOUNDARIES
      // =====================================================================
      for (const [s0, s1] of [[0.10, 0.28], [0.34, 0.48], [0.53, 0.65], [0.72, 0.89]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.08, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.05, 0.09, 1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.67, 0.71, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.16, 0.22, 0.40, 0.46, 0.56, 0.78, 0.86]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      // =====================================================================
      // 5. MONTMELÓ HILLS — the dry ridgelines beyond the circuit, with the
      //    Montseny massif hazy on the far horizon.
      // =====================================================================
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [130, 44, 120, 40, 14, 9, [0.28, 0.34, 0.19]],
        [230, 36, 160, 52, 24, 14, [0.24, 0.31, 0.19]],
        [360, 28, 210, 66, 40, 24, [0.30, 0.34, 0.30]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 34;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      // =====================================================================
      // 6. BESPOKE IDENTITY — the tall lighting/camera masts around the
      //    stadium section, and the low white paddock-club block behind T1.
      // =====================================================================
      for (const [s, side, gap] of [
        [0.030, -1, 26], [0.070, 1, 30], [0.505, 1, 32], [0.690, -1, 30], [0.935, 1, 28],
      ]) {
        const a = anchor(K(s), side, gap);
        addCyl(out, a.c, 0.20, 18, [0.22, 0.22, 0.25], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 18.4), [1.4, 0.6, 2.8], [0.94, 0.92, 0.82], [a.r, a.u, a.t]);
      }
      // Paddock-club terrace overlooking Turn 1 — a long white two-storey block
      // with a shaded roof deck, the view every Barcelona test photo uses.
      {
        const a = anchor(K(0.045), 1, 52);
        const b = [a.r, a.u, a.t];
        modelGroup("catalunya-paddock-club", {
          center: vadd(a.c, a.u, 6), size: [16, 12, 62], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 4.5), [13, 9, 58], [0.90, 0.90, 0.88], b);
          addBox(stage, vadd(a.c, a.u, 9.6), [15, 0.5, 60], [0.72, 0.72, 0.74], b);
          for (const hgt of [3.0, 7.0]) {
            addBox(stage, vadd(vadd(a.c, a.r, -6.4), a.u, hgt), [0.3, 1.8, 54], [0.40, 0.52, 0.62], b);
          }
        });
      }
      // Clipped hedging along the pit-straight verge — Catalunya's landscaping
      // is manicured in a way the rest of the site is not.
      hedge(0.955, 0.045, -1, 16, 3.0, [0.18, 0.36, 0.18]);
    },
  }
  );
})();
