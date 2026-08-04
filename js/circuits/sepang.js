/* Apex 26 — SEPANG INTERNATIONAL CIRCUIT definition (data only).
   Retired circuit (`classic: true`): last Malaysian GP 2017.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "sepang",
    classic: true,
    // Upstream my-1999 runs clockwise, matching the racing direction.
    reverse: false,
    // Sepang's two long straights are separated by the tight T15 hairpin; the
    // shorter of the pair is the pit straight, so the line goes there. Not
    // GPS-calibrated (no OpenF1 coverage for a circuit that left in 2017).
    startFrac: 0.95,
    name: "SEPANG",
    gp: "Malaysian GP",
    country: "Malaysia",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage", "lamps"], s0: 0.90, s1: 0.10 },  // pits + main straight
      { kind: "foliage", s0: 0.30, s1: 0.40 },              // wide open infield
    ],
    // Equatorial haze: white-hot high sun, heavy humidity, saturated jungle.
    pal: {
      zenith:        [0.30, 0.50, 0.76],
      horizon:       [0.86, 0.86, 0.82],
      sun:           [1.0,  0.98, 0.90],
      sunColor:      [1.0,  0.97, 0.88],
      ambientSky:    [0.56, 0.58, 0.60],
      ambientGround: [0.26, 0.28, 0.20],
      fogColor:      [0.82, 0.84, 0.82],
      fogDensity:    0.0034,
      grass:         [0.17, 0.42, 0.17],
      sunDir:        [0.20, 0.90, 0.14],
    },
    // Sepang is built on reclaimed palm plantation — gently rolling, with a
    // real drop through the T5-T6 sweep and a climb back to the hairpin.
    elevations: [
      { s: 0.22, halfM: 420, rise: -5.0 },
      { s: 0.46, halfM: 380, rise: 4.5 },
      { s: 0.74, halfM: 460, rise: -4.0 },
    ],
    hwZones: [
      // Sepang is famously wide — 22 m in places — so only the genuinely tight
      // corners narrow at all.
      { s0: 0.145, s1: 0.185, hw: 6.8, ease: 0.014 },  // T3-T4
      { s0: 0.560, s1: 0.600, hw: 6.9, ease: 0.014 },  // T9 hairpin
      { s0: 0.865, s1: 0.905, hw: 6.6, ease: 0.012 },  // T15 final hairpin
    ],
    bankZones: [
      { frac: 0.045, angleDeg: 3.5, widthM: 140 },   // T1-T2 loop
      { frac: 0.330, angleDeg: 4.0, widthM: 150 },   // T5-T6 sweep
      { frac: 0.660, angleDeg: 3.0, widthM: 130 },   // T12-T13
    ],
    scenery: function (api) {
      const { out, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz,
        tree, bush, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, tower, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, waterBand,
        addBox, addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      const PALM = [0.16, 0.40, 0.18], PALM_D = [0.12, 0.33, 0.15];
      const JUNGLE = [0.11, 0.34, 0.14], JUNGLE_L = [0.20, 0.46, 0.20];
      const GRAVEL = [0.68, 0.60, 0.44];

      // =====================================================================
      // 1. PALM PLANTATION — Sepang is carved out of oil palm, and the ordered
      //    rows of identical palms ringing the circuit are its signature.
      //    Regular spacing (not hash-scattered) is the point.
      // =====================================================================
      const openArea = (s) => (s >= 0.90 || s <= 0.10) || (s >= 0.30 && s <= 0.40);
      // Front rank — evenly spaced, both sides.
      every(16, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        for (const side of [-1, 1]) {
          tree(k, side, 20 + ((k / 16) % 3) * 2, 12 + hash(k * 7 + side) * 3,
            (k % 32 === 0) ? PALM_D : PALM);
        }
      });
      // Deeper plantation ranks, offset so the grid reads as rows in depth.
      every(20, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        for (const side of [-1, 1]) {
          const h = hash(k * 13 + side);
          tree(k, side, 38 + (k % 3) * 6, 11 + h * 4, PALM_D);
          if (h > 0.45) tree(k, side, 58 + (k % 4) * 5, 12 + h * 3, PALM);
        }
      });
      // Wilder jungle scrub between the plantation and the verge.
      every(24, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.45) return;
        bush(k, h < 0.72 ? -1 : 1, 8 + h * 5, h < 0.6 ? JUNGLE : JUNGLE_L);
      });

      // =====================================================================
      // 2. THE TWIN-CANOPY PIT COMPLEX — Sepang's defining structure: two
      //    enormous fabric hyperbolic-paraboloid roofs over the main grandstand
      //    and paddock, visible from every corner of the site.
      // =====================================================================
      const pitWall = [0.88, 0.88, 0.86];
      for (let i = 0; i < 9; i++) {
        building(K(0.945 + i * 0.007), 1, 15, 16, 9, 11,
          { wall: pitWall, window: [0.28, 0.32, 0.40], floor: 4.5, roof: true });
      }
      // The two great canopies. Each is one atomic hero group so a preflight
      // foldback can never leave half a roof standing.
      // Sepang's pit complex sits in the gap BETWEEN the main straight and the
      // back straight, and that gap is narrow — measured clearance on this side
      // is only ~46 m at the line. The canopies are sized and set back to fit
      // inside it; push them further out and the preflight rejects the
      // footprint for overlapping the other straight.
      for (const [id, s, len] of [
        ["sepang-canopy-main", 0.985, 84],
        ["sepang-canopy-paddock", 0.945, 70],
      ]) {
        const a = anchor(K(s), -1, 19);
        const b = [a.r, a.u, a.t];
        modelGroup(id, {
          center: vadd(a.c, a.u, 20), size: [14, 16, len + 4], basis: b,
        }, (stage) => {
          // Twin sweeping shells: a pair of tilted slabs meeting at a ridge.
          addBox(stage, vadd(vadd(a.c, a.r, -3.2), a.u, 22), [7, 0.8, len], [0.94, 0.94, 0.92], b);
          addBox(stage, vadd(vadd(a.c, a.r, 3.2), a.u, 18), [7, 0.8, len], [0.90, 0.90, 0.88], b);
          addPrism(stage, vadd(a.c, a.u, 23), [3.0, 2.4, len], [0.82, 0.82, 0.84], b);
          // Support pylons carrying the shells.
          for (let i = 0; i < 5; i++) {
            const p = vadd(a.c, a.t, (i - 2) * (len / 5));
            addCyl(stage, p, 0.6, 20, [0.70, 0.70, 0.72], 8, b);
          }
        }, { required: true });
      }
      grandstandEx(0.990, -1, 12, 130, null, null,
        { livery: "concrete", tiers: 2, suites: true, endWalls: true, pylons: true });
      grandstandEx(0.940, -1, 12, 92, null, null, { livery: "steel", endWalls: true });
      tower(K(0.980), 1, 13, 6, 34, { col: [0.92, 0.92, 0.90], cap: true, capCol: [0.10, 0.34, 0.20], mast: 8 });
      gantry(0.0, 9, [0.15, 0.15, 0.18]);
      gantry(0.960, 8.5, [0.15, 0.15, 0.18]);
      for (let i = 0; i < 4; i++) {
        building(K(0.900 + i * 0.014), 1, 42, 24, 12, 18,
          { wall: [0.84, 0.84, 0.84], window: [0.30, 0.34, 0.42], floor: 4.5, roof: true });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.88 || s < 0.05) || h < 0.52) return;
        motorhome(k, 1, 60 + h * 10, 10, 4, 6, { wall: [0.66 + h * 0.24, 0.66, 0.68] });
      });
      broadcastCompound(K(0.892), 1, 78, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.97, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.20, 0.50, 0.30]);

      // =====================================================================
      // 3. CORNER STANDS AND RUNOFF — Sepang's tarmac runoff is vast, so the
      //    gravel is limited and the stands sit a long way back.
      // =====================================================================
      grandstandEx(0.060, 1, 30, 90, null, null,
        { livery: "steel", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.340, -1, 34, 80, null, null, { livery: "concrete", endWalls: true });
      grandstandEx(0.580, 1, 30, 76, null, null, { livery: "steel", endWalls: true });
      grandstandEx(0.885, -1, 26, 92, null, null,
        { livery: "concrete", tiers: 2, roof: "cantilever", endWalls: true });
      spectatorHill(0.62, 0.70, -1, 20, { rows: 3, rise: 1.0, depth: 1.8, density: 0.36, step: 9 });

      groundPatch(K(0.060), 1, 12, [40, 0.18, 56], GRAVEL,
        { id: "sepang-t1-gravel", samples: 8 });
      tyreWall(0.045, 0.080, 1, 10, [0.86, 0.20, 0.18]);
      marshalPost(K(0.065), -1, 12);

      groundPatch(K(0.580), 1, 10, [30, 0.18, 40], GRAVEL,
        { id: "sepang-t9-gravel", samples: 7 });
      tyreWall(0.565, 0.598, 1, 9, [0.20, 0.40, 0.85]);
      marshalPost(K(0.572), -1, 11);

      groundPatch(K(0.885), -1, 10, [34, 0.18, 44], GRAVEL,
        { id: "sepang-t15-gravel", samples: 7 });
      tyreWall(0.868, 0.902, -1, 9, [0.85, 0.78, 0.20]);
      marshalPost(K(0.880), 1, 11);

      // Monsoon drainage channels — Sepang's races are defined by tropical
      // downpours, and the deep open drains beside the runoff are always visible.
      waterBand(0.18, 0.28, -1, 30, 34, 3, [0.24, 0.32, 0.26], { id: "sepang-drain-north" });
      waterBand(0.62, 0.72, 1, 32, 36, 3, [0.24, 0.32, 0.26], { id: "sepang-drain-south" });

      // =====================================================================
      // 4. BOUNDARIES
      // =====================================================================
      for (const [s0, s1] of [[0.09, 0.30], [0.36, 0.55], [0.61, 0.75], [0.78, 0.86]]) {
        guardrail(s0, s1, -1, 9, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 9, [0.80, 0.81, 0.83]);
      }
      guardrail(0.92, 0.07, 1, 4.5, [0.85, 0.85, 0.88]);
      fence(0.93, 0.06, -1, 10, 4, [0.74, 0.76, 0.80]);
      fence(0.86, 0.91, -1, 10, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.13, 0.20, 0.26, 0.42, 0.50, 0.68, 0.78]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 10);
      }

      // =====================================================================
      // 5. BACKDROP — the plantation horizon, with the limestone hills of
      //    Selangor faint behind it and the KLIA control tower on the skyline.
      // =====================================================================
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [130, 50, 130, 34, 12, 4, [0.14, 0.36, 0.16]],   // plantation canopy wall
        [220, 40, 170, 44, 16, 6, [0.12, 0.31, 0.15]],
        [370, 26, 220, 70, 44, 26, [0.24, 0.34, 0.28]],  // limestone hills
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 32;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      // KLIA's control tower and terminal roofline on the far horizon — the
      // airport is the circuit's immediate neighbour.
      {
        const k = K(0.42);
        const a = anchor(k, 1, 250);
        const b = [a.r, a.u, a.t];
        modelGroup("sepang-klia-skyline", {
          center: vadd(a.c, a.u, 26), size: [40, 56, 200], basis: b,
        }, (stage) => {
          addCyl(stage, a.c, 5, 48, [0.72, 0.74, 0.78], 10, b);
          addBox(stage, vadd(a.c, a.u, 50), [12, 5, 12], [0.66, 0.70, 0.76], b);
          for (let i = 0; i < 4; i++) {
            const p = vadd(a.c, a.t, (i - 1.5) * 44);
            addPrism(stage, vadd(p, a.u, 7), [26, 8, 40], [0.74, 0.76, 0.80], b);
          }
        });
      }

      // =====================================================================
      // 6. TROPICAL DETAIL — the tall slim floodlight masts and the covered
      //    walkways that shade every path on the site.
      // =====================================================================
      for (const [s, side, gap] of [
        [0.030, -1, 30], [0.065, 1, 36], [0.340, -1, 40], [0.580, 1, 36], [0.885, -1, 32],
      ]) {
        const a = anchor(K(s), side, gap);
        addCyl(out, a.c, 0.24, 22, [0.24, 0.24, 0.26], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 22.4), [1.8, 0.7, 3.4], [0.96, 0.94, 0.84], [a.r, a.u, a.t]);
      }
      // Shaded spectator walkway along the main straight — a long slatted roof
      // on slim posts, the thing everyone stands under between sessions.
      {
        const a = anchor(K(0.020), -1, 34);
        const b = [a.r, a.u, a.t];
        modelGroup("sepang-shade-walk", {
          center: vadd(a.c, a.u, 3), size: [8, 6, 90], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 4.6), [6.4, 0.4, 88], [0.86, 0.84, 0.76], b);
          for (let i = 0; i < 8; i++) {
            const p = vadd(a.c, a.t, (i - 3.5) * 12);
            addCyl(stage, p, 0.18, 4.6, [0.60, 0.60, 0.62], 6, b);
          }
        });
      }
    },
  }
  );
})();
