/* Apex 26 — INTERCITY ISTANBUL PARK circuit definition (data only).
   Retired circuit (`classic: true`): last Turkish GP 2021.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "istanbul",
    classic: true,
    reverse: false,
    // The trace's first vertex is the start line, on the pit straight ahead of
    // the Turn 1 plunge.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured LEFT, matches the real T1.
    // Was 0.98, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.98,
    name: "ISTANBUL",
    gp: "Turkish GP",
    country: "Turkey",
    night: false,
    theme: "green",
    lengthKm: 5.3,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },  // pits
      { kind: "foliage", s0: 0.34, s1: 0.46 },              // the Turn 8 amphitheatre
    ],
    // Dry Thracian hillside: hazy warm sun, parched grass, pale limestone dust.
    pal: {
      zenith:        [0.24, 0.44, 0.74],
      horizon:       [0.80, 0.78, 0.70],
      sun:           [1.0,  0.95, 0.78],
      sunColor:      [1.0,  0.94, 0.76],
      ambientSky:    [0.50, 0.53, 0.58],
      ambientGround: [0.30, 0.28, 0.21],
      fogColor:      [0.76, 0.74, 0.66],
      grass:         [0.31, 0.39, 0.20],
      runoff:        [0.64, 0.58, 0.44],
      sunDir:        [0.46, 0.66, 0.30],
    },
    elevations: [
      { s: 0.055, halfM: 300, rise: -12.0 },  // the Turn 1 downhill plunge
      { s: 0.28, halfM: 380, rise: -7.0 },    // valley floor before Turn 8
      { s: 0.48, halfM: 340, rise: 8.0 },     // climb out of Turn 8
      { s: 0.72, halfM: 400, rise: 9.0 },     // long rise back toward the pits
    ],
    hwZones: [
      { s0: 0.135, s1: 0.180, hw: 6.4, ease: 0.012 },  // Turn 3-4 complex
      { s0: 0.590, s1: 0.640, hw: 6.4, ease: 0.012 },  // Turn 9-10
      { s0: 0.880, s1: 0.930, hw: 6.3, ease: 0.012 },  // Turn 13-14
    ],
    // Turn 8 is the famous one: a long, banked, quadruple-apex left taken flat.
    bankZones: [
      { frac: 0.050, angleDeg: 4.0, widthM: 130 },   // Turn 1
      { frac: 0.400, angleDeg: 7.0, widthM: 300 },   // Turn 8 — the big one
      { frac: 0.760, angleDeg: 3.5, widthM: 130 },   // Turn 12
    ],
    scenery: function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, px, pz,
        pine, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        sponsorHoarding, cameraTower, seat, groundedSegments,
        addBox, addCyl, addPrism, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      const PINE = [0.13, 0.30, 0.15], PINE_D = [0.10, 0.24, 0.13];
      const SCRUB = [0.34, 0.38, 0.21], SCRUB_D = [0.28, 0.32, 0.18];
      const GRAVEL = [0.70, 0.63, 0.48];
      const STONE = [0.84, 0.80, 0.71], STONE_D = [0.72, 0.68, 0.59];
      const STONE_L = [0.90, 0.86, 0.77], SHADOW = [0.55, 0.51, 0.44];
      const TURK_RED = [0.85, 0.11, 0.13];

      const openArea = (s) => (s >= 0.93 || s <= 0.08) || (s >= 0.34 && s <= 0.46);
      every(28, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.38) return;
        pine(k, h < 0.5 ? -1 : 1, 13 + h * 12, 10 + h * 8, h < 0.6 ? PINE : PINE_D);
        if (h > 0.75) pine(k, h > 0.88 ? -1 : 1, 32 + h * 18, 12 + h * 7, PINE_D);
      });
      every(22, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.42) return;
        bush(k, h < 0.72 ? -1 : 1, 7 + h * 6, h < 0.6 ? SCRUB : SCRUB_D);
      });
      every(44, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 67 + 17);
        if (h < 0.55) return;
        tree(k, h < 0.5 ? -1 : 1, 42 + h * 26, 9 + h * 6, [0.24, 0.35, 0.19]);
      });

      {
        const EARTH = [0.52, 0.44, 0.30], EARTH_D = [0.44, 0.37, 0.25];
        const CROWD = [[0.88, 0.14, 0.14], [0.92, 0.90, 0.86], [0.34, 0.34, 0.38]];
        let i = 0;
        along(0.340, 0.462, 8, (k, spacing) => {
          const seg = spacing * 0.97;
          for (let t = 0; t < 8; t++) {
            const a = anchor(k, 1, 16 + t * 4.0);
            const b = [a.r, a.u, a.t];
            const h = 2.0 + t * 2.9;
            addBox(out, vadd(a.c, a.u, h * 0.5), [3.9, h, seg],
              t % 3 === 2 ? EARTH_D : (t & 1 ? STONE_D : EARTH), b);
            // Crowd band. The Turkish GP crowd was famously a sea of red.
            addBox(out, vadd(a.c, a.u, h + 0.7), [3.0, 1.4, seg],
              CROWD[(i + t) % 3 === 0 ? 0 : (i + t) % 3], b);
          }
          i++;
        });
        groundedSegments({
          id: "istanbul-turn8-revetment",
          points: [0, 1, 2, 3, 4, 5, 6].map((j) => ({
            k: K(0.340 + j * 0.020), side: 1, dist: 13.5,
          })),
          width: 2.4, height: 2.6, color: STONE_D,
        });
      }
      groundPatch(K(0.400), 1, 8, [56, 0.18, 140], GRAVEL,
        { id: "istanbul-turn8-gravel", samples: 10 });
      {
        let f = 0;
        along(0.345, 0.458, 16, (k) => {
          const a = anchor(k, 1, 50);
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.14, 13, [0.90, 0.90, 0.90], 5, b);
          addBox(out, vadd(vadd(a.c, a.u, 10.8), a.t, 2.0), [0.16, 2.6, 4.0],
            (f++ & 1) ? TURK_RED : [0.92, 0.90, 0.88], b);
        });
      }
      spectatorHill(0.352, 0.400, -1, 22, { rows: 3, rise: 1.1, depth: 1.9, density: 0.42, step: 9 });
      marshalPost(K(0.380), -1, 10);
      marshalPost(K(0.425), -1, 10);
      cameraTower(K(0.398), -1, 14, { h: 20 });   // the inside camera the corner is always shot from
      for (const [i, s] of [[0, 0.360], [1, 0.400], [2, 0.440]]) {
        grandstandEx(s, 1, 54, 46, null, null, {
          livery: i === 1 ? "crimson" : "sandstone",
          tiers: 2, roof: "cantilever", suites: i === 1, endWalls: true, pylons: true,
        });
      }

      {
        for (let i = 0; i < 6; i++) {
          const s = 0.948 + i * 0.012;
          const a = anchor(K(s), 1, 20);
          const b = [a.r, a.u, a.t];
          // Roofline steps DOWN along the row: three heights over six bays.
          const cap = 12.4 - Math.floor(i / 2) * 1.6;
          modelGroup(`istanbul-pit-bay-${i + 1}`, {
            center: vadd(a.c, a.u, 9), size: [22, 20, 24], basis: b,
          }, (stage) => {
            stage._mat = MAT.STONE;
            seat.box(stage, a.c, [16, 1.0, 22], STONE_D, b);
            addBox(stage, vadd(vadd(a.c, a.r, 1.8), a.u, 4.6), [11, 7.2, 22], SHADOW, b);
            for (let d = 0; d < 5; d++)
              addBox(stage, vadd(vadd(a.c, a.r, -5.6), a.t, (d - 2) * 5.0),
                [3.0, 8.4, 2.4], d & 1 ? STONE : STONE_L, b);
            addBox(stage, vadd(a.c, a.u, 10.4), [14.5, 3.6, 22], STONE, b);   // upper storey
            // Narrow slot windows, deeply shaded — not a continuous glass band.
            for (let d = 0; d < 6; d++)
              addBox(stage, vadd(vadd(vadd(a.c, a.r, -7.4), a.u, 10.6), a.t, (d - 2.5) * 4.0),
                [0.4, 2.2, 1.8], [0.20, 0.24, 0.26], b);
            // Stepped cornice: two offset caps, the upper one set back.
            addBox(stage, vadd(a.c, a.u, cap), [15.5, 1.1, 23], STONE_L, b);
            addBox(stage, vadd(vadd(a.c, a.r, 2.5), a.u, cap + 1.6), [9.5, 1.4, 21], STONE_D, b);
            stage._mat = MAT.METAL;
            // Shallow shade canopy over the lane on stone-clad brackets.
            addBox(stage, vadd(vadd(a.c, a.r, -9.5), a.u, 9.6), [5.5, 0.4, 22], STONE_L, b);
            for (let d = 0; d < 3; d++)
              addCyl(stage, vadd(vadd(a.c, a.r, -11.6), a.t, (d - 1) * 8.5), 0.18, 9.5,
                [0.72, 0.68, 0.60], 6, b);
            stage._mat = 0;
          }, { required: true });
        }
        const a = anchor(K(0.990), 1, 13);
        const b = [a.r, a.u, a.t];
        modelGroup("istanbul-race-control", {
          center: vadd(a.c, a.u, 17), size: [10, 40, 12], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 12), [6.0, 24, 8.5], STONE, b);
          addBox(stage, vadd(vadd(a.c, a.r, 3.4), a.u, 12), [1.2, 24, 9.5], STONE_D, b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -2.6), a.u, 22.5), [5.8, 4.4, 10.0],
            [0.16, 0.20, 0.24], b);
          addBox(stage, vadd(vadd(a.c, a.r, -2.8), a.u, 22.5), [5.4, 3.4, 9.0],
            [0.90, 0.84, 0.58], b);
          stage._mat = MAT.STONE;
          for (let l = 0; l < 3; l++)
            addBox(stage, vadd(vadd(a.c, a.r, -4.2), a.u, 25.2 + l * 0.9), [4.4, 0.35, 11], STONE_L, b);
          addBox(stage, vadd(vadd(a.c, a.r, -2.6), a.u, 28.0), [9.5, 0.8, 12], STONE_L, b);
          stage._mat = MAT.METAL;
          for (const t of [-3, 0, 3]) {
            addCyl(stage, vadd(vadd(a.c, a.u, 28.4), a.t, t), 0.11, 8, [0.90, 0.90, 0.90], 4, b);
            addBox(stage, vadd(vadd(vadd(a.c, a.u, 34.0), a.t, t + 1.6), a.r, 0),
              [0.14, 1.7, 3.0], TURK_RED, b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.965, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 11, 150, null, null,
        { livery: "sandstone", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.955, -1, 11, 90, null, null, { livery: "terracotta", endWalls: true });
      for (const [i, s] of [[0, 0.952], [1, 0.966], [2, 0.994]]) {
        const a = anchor(K(s), 1, 44);
        const b = [a.r, a.u, a.t];
        modelGroup(`istanbul-paddock-block-${i + 1}`, {
          center: vadd(a.c, a.u, 8), size: [22, 18, 32], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 5.5), [17, 11, 28], STONE, b);
          addBox(stage, vadd(a.c, a.u, 11.4), [18, 1.2, 29], STONE_L, b);
          addBox(stage, vadd(vadd(a.c, a.r, 2.0), a.u, 13.4 - i * 1.4),
            [11, 2.8, 22], STONE_D, b);                          // stepped cap
          stage._mat = MAT.GLASS;
          for (const hgt of [3.4, 8.0])
            addBox(stage, vadd(vadd(a.c, a.r, -8.6), a.u, hgt), [0.35, 2.0, 26],
              [0.30, 0.36, 0.40], b);
          stage._mat = 0;
        });
      }
      for (let i = 0; i < 4; i++) {
        building(K(0.925 + i * 0.013), 1, 66, 24, 12, 18,
          { kind: "chevron", wall: [0.84, 0.80, 0.74], window: [0.30, 0.34, 0.42], floor: 4.5, roof: true });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 56 + h * 10, 10, 4, 6, { wall: [0.64 + h * 0.26, 0.64, 0.66] });
      });
      broadcastCompound(K(0.915), 1, 72, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.86, 0.16, 0.14]);

      groundPatch(K(0.055), -1, 6, [34, 0.18, 48], GRAVEL,
        { id: "istanbul-t1-gravel", samples: 8 });
      tyreWall(0.040, 0.075, -1, 5, [0.86, 0.20, 0.18]);
      grandstandEx(0.060, 1, 20, 84, null, null, { livery: "sandstone", tiers: 2, endWalls: true });
      marshalPost(K(0.062), 1, 10);

      groundPatch(K(0.615), 1, 6, [28, 0.18, 38], GRAVEL,
        { id: "istanbul-t9-gravel", samples: 6 });
      tyreWall(0.600, 0.635, 1, 5, [0.20, 0.40, 0.85]);
      grandstandEx(0.615, -1, 20, 70, null, null, { livery: "terracotta" });
      marshalPost(K(0.610), -1, 9);

      groundPatch(K(0.905), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "istanbul-t13-gravel", samples: 6 });
      tyreWall(0.888, 0.922, -1, 4, [0.85, 0.78, 0.20]);
      grandstandEx(0.900, 1, 20, 76, null, null, { livery: "sandstone", endWalls: true });
      marshalPost(K(0.898), 1, 9);

      for (const [s0, s1] of [[0.09, 0.33], [0.47, 0.59], [0.65, 0.75], [0.79, 0.87]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.05, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.35, 0.45, 1, 12, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.14, 0.22, 0.30, 0.52, 0.68, 0.80]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [130, 46, 130, 40, 16, 10, [0.28, 0.34, 0.20]],
        [230, 36, 175, 54, 28, 16, [0.24, 0.30, 0.19]],
        [370, 28, 220, 70, 46, 26, [0.30, 0.33, 0.30]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 34;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      // Faint apartment blocks on one horizon — the city creeping toward the park.
      {
        const k = K(0.20);
        for (let i = 0; i < 8; i++) {
          building(k, -1, 260 + i * 26, 18, 30 + (i % 3) * 10, 18,
            { kind: "slab", wall: [0.66 + i * 0.012, 0.66 + i * 0.012, 0.70], window: [0.54, 0.56, 0.60] });
        }
      }

      for (let i = 0; i < 16; i++) {
        const a = anchor(K(0.940 + i * 0.005), -1, 9);
        const b = [a.r, a.u, a.t];
        const h = 12 + (i & 1) * 2;
        addCyl(out, a.c, 0.13, h, [0.92, 0.92, 0.92], 5, b);
        addBox(out, vadd(vadd(a.c, a.u, h - 2.4), a.t, 1.9), [0.15, 2.4, 3.6],
          (i & 1) ? TURK_RED : [0.94, 0.92, 0.90], b);
        if (i & 1)
          addBox(out, vadd(vadd(vadd(a.c, a.u, h - 2.4), a.t, 1.4), a.r, -0.1),
            [0.1, 1.0, 1.0], [0.95, 0.94, 0.92], b);
      }
      for (const [s, side, gap] of [[0.062, 1, 30], [0.615, -1, 28], [0.900, 1, 28]])
        cameraTower(K(s), side, gap, { h: 16, col: [0.62, 0.58, 0.52] });

      {
        const a = anchor(K(0.930), -1, 52);
        const b = [a.r, a.u, a.t];
        modelGroup("istanbul-stone-portal", {
          center: vadd(a.c, a.u, 9), size: [12, 22, 34], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          for (const t of [-11, 11]) {
            addBox(stage, vadd(vadd(a.c, a.t, t), a.u, 6.5), [7, 13, 6], STONE, b);
            addBox(stage, vadd(vadd(a.c, a.t, t), a.u, 13.4), [8, 1.2, 7], STONE_L, b);
            // Pointed cap — the arch profile, reduced to what a prism can say.
            addPrism(stage, vadd(vadd(a.c, a.t, t), a.u, 14.0), [8, 3.4, 7], STONE_D, b);
          }
          addBox(stage, vadd(a.c, a.u, 12.0), [6, 3.0, 17], STONE, b);       // lintel
          addBox(stage, vadd(a.c, a.u, 14.2), [7, 1.0, 19], STONE_L, b);     // cornice
          stage._mat = MAT.METAL;
          addBox(stage, vadd(vadd(a.c, a.r, -3.2), a.u, 12.0), [0.3, 1.6, 13], TURK_RED, b);
          stage._mat = 0;
        });
      }

      for (const [id, s, side, gap] of [
        ["t1", 0.070, 1, 54], ["t4", 0.170, -1, 56],
        ["t9", 0.640, 1, 56], ["t12", 0.790, -1, 54],
      ]) {
        for (let t = 0; t < 3; t++) {
          groundedSegments({
            id: `istanbul-hillside-${id}-${t + 1}`,
            points: [0, 1, 2, 3, 4].map((j) => ({
              k: K(s + (j - 2) * 0.010), side, dist: gap + t * 17,
            })),
            width: 12, height: 2.4 + t * 1.8,
            color: t & 1 ? [0.66, 0.60, 0.46] : [0.74, 0.68, 0.52],
          });
        }
      }
      sponsorHoarding(0.940, 0.070, -1, 6.5, {
        h: 1.3, step: 10,
        palette: [TURK_RED, [0.94, 0.92, 0.88], [0.14, 0.30, 0.58], [0.94, 0.76, 0.10]],
      });
      for (const [s0, s1] of [[0.1, 0.32], [0.48, 0.91]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 20, { density: 0.42, hMin: 9, hMax: 17, pineFrac: 0.72, col: PINE, col2: PINE_D });
      }
    },
  }
  );
})();
