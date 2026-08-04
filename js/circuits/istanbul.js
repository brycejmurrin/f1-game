/* Apex 26 — INTERCITY ISTANBUL PARK circuit definition (data only).
   Retired circuit (`classic: true`): last Turkish GP 2021.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "istanbul",
    classic: true,
    // Istanbul Park is one of the few anti-clockwise circuits, and upstream
    // tr-2005 is already drawn that way, so no flip.
    reverse: false,
    // The trace's first vertex closes the pit straight; back the line up along
    // it so the grid sits before the Turn 1 plunge. Not GPS-calibrated.
    startFrac: 0.98,
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
      { kinds: ["foliage", "lamps"], s0: 0.93, s1: 0.08 },  // pits
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
    // Istanbul Park is built across a valley and drops and climbs constantly —
    // the Turn 1 plunge and the long climb out of Turn 9 are its character.
    // Authored, not surveyed.
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
      const { out, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz,
        pine, tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, tower, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        addBox, addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      const PINE = [0.13, 0.30, 0.15], PINE_D = [0.10, 0.24, 0.13];
      const SCRUB = [0.34, 0.38, 0.21], SCRUB_D = [0.28, 0.32, 0.18];
      const GRAVEL = [0.70, 0.63, 0.48];

      // =====================================================================
      // 1. THRACIAN SCRUB HILLSIDE — sparse pine and dry brush, not forest.
      // =====================================================================
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

      // =====================================================================
      // 2. TURN 8 — the signature. A wide banked left with a natural
      //    amphitheatre of terracing on the outside; nothing else at Istanbul
      //    Park matters as much visually.
      // =====================================================================
      spectatorHill(0.355, 0.445, 1, 16, { rows: 5, rise: 1.3, depth: 2.0, density: 0.55, step: 7 });
      grandstandEx(0.400, 1, 34, 120, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", endWalls: true, pylons: true });
      groundPatch(K(0.400), 1, 8, [56, 0.18, 140], GRAVEL,
        { id: "istanbul-turn8-gravel", samples: 10 });
      for (const s of [0.365, 0.400, 0.435]) billboard(K(s), 1, 26, 14, 5, [0.86, 0.16, 0.14]);
      marshalPost(K(0.380), -1, 10);
      marshalPost(K(0.425), -1, 10);
      // The long sweep is where the crowd banks are, so keep the inside open —
      // that open infield is part of why the corner reads as enormous.

      // =====================================================================
      // 3. PIT COMPLEX — Istanbul's paddock is a long, low, pale-stone block
      //    with a distinctive stepped roofline.
      // =====================================================================
      const pitWall = [0.88, 0.86, 0.80];
      for (let i = 0; i < 8; i++) {
        building(K(0.950 + i * 0.007), 1, 15, 16, 9, 11,
          { wall: pitWall, window: [0.28, 0.32, 0.38], floor: 4.5, roof: true });
      }
      tower(K(0.982), 1, 13, 6, 32, { col: [0.92, 0.90, 0.86], cap: true, capCol: [0.80, 0.14, 0.12], mast: 7 });
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.965, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, -1, 11, 150, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.955, -1, 11, 90, null, null, { livery: "steel", endWalls: true });
      {
        const a = anchor(K(0.975), 1, 44);
        const b = [a.r, a.u, a.t];
        modelGroup("istanbul-paddock-block", {
          center: vadd(a.c, a.u, 7), size: [22, 16, 92], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 5.5), [18, 11, 88], [0.86, 0.83, 0.76], b);
          // Stepped roofline — three offset caps.
          for (let i = 0; i < 3; i++) {
            addBox(stage, vadd(vadd(a.c, a.t, (i - 1) * 28), a.u, 12), [14 - i * 2, 2.4, 24],
              [0.72, 0.70, 0.66], b);
          }
          for (const hgt of [3.4, 8.0]) {
            addBox(stage, vadd(vadd(a.c, a.r, -8.8), a.u, hgt), [0.3, 2.0, 82], [0.42, 0.50, 0.58], b);
          }
        });
      }
      for (let i = 0; i < 4; i++) {
        building(K(0.925 + i * 0.013), 1, 38, 24, 12, 18,
          { wall: [0.82, 0.80, 0.78], window: [0.30, 0.34, 0.42], floor: 4.5, roof: true });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 56 + h * 10, 10, 4, 6, { wall: [0.64 + h * 0.26, 0.64, 0.66] });
      });
      broadcastCompound(K(0.915), 1, 72, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.86, 0.16, 0.14]);

      // =====================================================================
      // 4. OTHER CORNERS
      // =====================================================================
      groundPatch(K(0.055), -1, 6, [34, 0.18, 48], GRAVEL,
        { id: "istanbul-t1-gravel", samples: 8 });
      tyreWall(0.040, 0.075, -1, 5, [0.86, 0.20, 0.18]);
      grandstandEx(0.060, 1, 20, 84, null, null, { livery: "steel", tiers: 2, endWalls: true });
      marshalPost(K(0.062), 1, 10);

      groundPatch(K(0.615), 1, 6, [28, 0.18, 38], GRAVEL,
        { id: "istanbul-t9-gravel", samples: 6 });
      tyreWall(0.600, 0.635, 1, 5, [0.20, 0.40, 0.85]);
      grandstandEx(0.615, -1, 20, 70, null, null, { livery: "concrete" });
      marshalPost(K(0.610), -1, 9);

      groundPatch(K(0.905), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "istanbul-t13-gravel", samples: 6 });
      tyreWall(0.888, 0.922, -1, 4, [0.85, 0.78, 0.20]);
      grandstandEx(0.900, 1, 20, 76, null, null, { livery: "steel", endWalls: true });
      marshalPost(K(0.898), 1, 9);

      // =====================================================================
      // 5. BOUNDARIES
      // =====================================================================
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

      // =====================================================================
      // 6. BACKDROP — the dry ridgelines of the Kocaeli hills, and a distant
      //    hint of the Istanbul sprawl on one horizon.
      // =====================================================================
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
            { wall: [0.66 + i * 0.012, 0.66 + i * 0.012, 0.70], window: [0.54, 0.56, 0.60] });
        }
      }

      // =====================================================================
      // 7. BESPOKE IDENTITY — the camera/lighting masts and the crescent-and-
      //    star flag poles that ring the main straight.
      // =====================================================================
      for (const [s, side, gap] of [
        [0.030, -1, 26], [0.062, 1, 30], [0.400, 1, 44], [0.615, -1, 28], [0.900, 1, 28],
      ]) {
        const a = anchor(K(s), side, gap);
        addCyl(out, a.c, 0.20, 18, [0.22, 0.22, 0.25], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 18.4), [1.4, 0.6, 2.8], [0.94, 0.92, 0.82], [a.r, a.u, a.t]);
      }
      // A rank of red flagpoles down the pit straight.
      for (let i = 0; i < 8; i++) {
        const a = anchor(K(0.965 + i * 0.006), -1, 7.5);
        addCyl(out, a.c, 0.10, 9, [0.86, 0.86, 0.88], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(vadd(a.c, a.u, 7.6), a.t, 1.1), [0.14, 1.5, 2.4], [0.86, 0.13, 0.12], [a.r, a.u, a.t]);
      }
    },
  }
  );
})();
