/* Apex 26 — MEXICO CITY circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mexico",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.6 m off centreline; = trace vertex 0.
    // Was 0.6350. That already measured straight (mean |k| 0.00211 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.6350,
    name: "MEXICO CITY",
    gp: "Mexican GP",
    country: "Mexico",
    night: false,
    theme: "modern",
    lengthKm: 4.3,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kind: "city", s0: 0.02, s1: 0.14 },
      { kind: "city", s0: 0.60, s1: 0.94 },
      { kinds: ["foliage", "lighting"], s0: 0.70, s1: 0.89 },
    ],
    pal: { zenith: [0.56, 0.72, 0.92], horizon: [0.68, 0.72, 0.78], grass: [0.34, 0.52, 0.26], runoff: [0.52, 0.38, 0.24], fog: [0.70, 0.74, 0.80], fogDensity: 0.0022, sunDir: [0.24111167647565865, 0.8639835073711102, 0.44203807353870755], sun: [1, 0.98, 0.88], sunColor: [1, 0.96, 0.86] },
    segs: [
      { t: 0, l: 300 }, { t: -90, l: 100 }, { t: 80, l: 90 }, { t: 0, l: 250 }, { t: 90, l: 100 }, { t: 0, l: 500 },
      { t: -60, l: 80 }, { t: 60, l: 70 }, { t: 0, l: 200 }, { t: 90, l: 100 }, { t: -130, l: 120 },
    ],
    bankZones: [
      { frac: 0.1866, angleDeg: 3.5, widthM: 200 },   // the long right after the esses
      { frac: 0.7808, angleDeg: 3.0, widthM: 80 },
      { frac: 0.8834, angleDeg: 3.0, widthM: 90 },    // Foro Sol stadium section
      { frac: 0.9039, angleDeg: 3.0, widthM: 100 },
      { frac: 0.9692, angleDeg: 6.0, widthM: 120 },   // Peraltada
      { frac: 0.0075, angleDeg: 5.0, widthM: 140 },   // Peraltada exit onto the straight
    ],
    // Source-coordinate undulations. Hermanos Rodríguez sits on a drained lakebed
    // and is gentle, but not flat: it climbs through the esses, crests before the
    // stadium and drops through Foro Sol.
    // (The old ±7 m pair remapped across start/finish and invented a 12 m hill;
    // these are authored in SOURCE space so that cannot happen.)
    //
    // MEASURED off the built spline, 240 samples: 6.64 m end to end, peaking at
    // 2.83 % grade on the flank of the s = 0.245 rise, with 6 samples over 2 %.
    // This said "under 2 % anywhere" — a figure nobody computed, which
    // tests/specs/terrain-over-road.spec.js then pinned verbatim in `f9bbf479` and
    // sat red on. The geometry is unchanged and correct; only the claim was
    // wrong. Re-measure if these three rows change, rather than adjusting the
    // sentence to taste.
    elevations: [
      { s: 0.855, halfM: 420, rise: 5.0 },
      { s: 0.245, halfM: 380, rise: 3.0 },
      { s: 0.520, halfM: 280, rise: -1.6 },
    ],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, backdrop, groundPlane,
              addBox, addCyl, addFrustum, addCone, every, onTrack, hash, vadd, anchor, along,
              building, motorhome, grandstandEx, billboard, tree, hedge, fence,
              guardrail, tyreWall, marshalPost, tower, gantry, mountain, wall,
              modelGroup, groundPatch, groundedSegments,
              cityFront, forestEdge, bush,
              terrace, tieredBowl, broadleafFall, plane, acacia, cypress,
              cameraTower, sponsorHoarding, broadcastCompound, circuitKit } = api;
      const K = (s) => Math.round(s * n) % n;
      const cityBand = (s) => (s > 0.14 && s < 0.60) || s > 0.94 || s < 0.02;

      // Track centre + radius for far horizon rings
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // ── Festive Mexican palette ───────────────────────────────────────────────
      const PINK     = [0.92, 0.28, 0.55];
      const ORANGE   = [0.98, 0.55, 0.12];
      const GREEN    = [0.10, 0.55, 0.30];
      const SEATS    = [0.46, 0.47, 0.52];
      const CONCRETE = [0.72, 0.71, 0.68];
      const TREEGRN  = [0.22, 0.40, 0.20];
      const PARKGRN  = [0.34, 0.52, 0.26];
      const STONE    = [0.68, 0.60, 0.44];
      const fiesta   = [PINK, ORANGE, GREEN, [0.98, 0.82, 0.10]];
      const JACARANDA = [0.46, 0.36, 0.74];
      const JAC2      = [0.54, 0.44, 0.80];
      const HUIZACHE  = [0.36, 0.44, 0.26];

      // ── Papel-picado banner strip along a stand front ────────────────────────
      const banners = (s, side, gap) => {
        const k = K(s);
        for (let i = -2; i <= 2; i++) {
          const kk = (k + i + n) % n;
          place(kk, side, gap, [0.4, 1.1, 6], fiesta[(kk + (i & 1)) % 4]);
        }
      };

      // ── Floodlight mast: pole + lamp head + emissive glow bar ────────────────
      const lightMast = (k, side, dist, h) => {
        const p = anchor(k, side, dist);
        modelGroup(`mexico-flood-${k}-${side}`, {
          center: vadd(p.c, p.u, h / 2),
          size: [10, h + 1, 10],
          basis: [p.r, p.u, p.t],
        }, (stage) => {
          addCyl(stage, p.c, 0.45, h, [0.55, 0.56, 0.58], 6, [p.r, p.u, p.t]);
          addBox(stage, vadd(p.c, p.u, h - 0.8), [5.0, 1.6, 1.4], [0.28, 0.30, 0.34], [p.r, p.u, p.t]);
          for (let i = -1; i <= 1; i++) {
            addBox(stage, vadd(vadd(p.c, p.u, h - 0.3), p.r, side * i * 1.5),
                   [1.1, 0.9, 1.0], [1.00, 0.97, 0.78], [p.r, p.u, p.t]);
          }
          addBox(stage, vadd(p.c, p.u, 0.05),
                 [10, 0.08, 10], [0.82, 0.76, 0.52], [p.r, p.u, p.t]);
        });
      };

      // ── Lamp post: smaller roadside post ─────────────────────────────────────
      const lampPost = (k, side, dist) => {
        const p = anchor(k, side, dist);
        if (onTrack(p.c[0], p.c[2], 1.5)) return;
        addCyl(out, p.c, 0.14, 8.0, [0.50, 0.50, 0.52], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8.2), [1.0, 0.5, 0.6], [0.98, 0.94, 0.74], [p.r, p.u, p.t]);
      };

      // ── Jacaranda / plane avenue ─────────────────────────────────────────────
      // Magdalena Mixhuca's near planting, as Mexico City actually plants a
      // street: jacaranda in violet flower (broadleafFall's off-axis lobes are
      // the only crown in the library that keeps a shape at a non-green
      // colour), heavily pollarded plane — the crown is cut back to a disc
      // every winter, which is why it reads as a cylinder and not a cone — and
      // huizache on the dry unirrigated verges. One tree per ~26 m.
      // This is the layer the driver sees; forestEdge is only the mass behind it.
      // The stands, terraces and hoardings the avenue must not grow through.
      // forestEdge() walks its candidates outward through clearTreeDist() until
      // the crown clears every recorded solid; a direct species call has no
      // such guard — cypress()/plane()/broadleafFall() only test the ROAD — so
      // the occupied arcs are listed here instead. Each entry is [s0, s1, side]
      // and covers a stand's full along-track span plus a little margin.
      const SOLID = [
        [0.965, 1.000,  1], [0.000, 0.032,  1],   // main grandstand run
        [0.048, 0.063,  1], [0.048, 0.063, -1],   // named enclosures 1-2
        [0.108, 0.132,  1],                       // T1 two-deck + rear stand
        [0.158, 0.172,  1], [0.190, 0.210,  1], [0.190, 0.210, -1],
        [0.212, 0.268,  1],                       // Esses standing terrace
        [0.238, 0.252, -1], [0.278, 0.292,  1], [0.338, 0.352, -1],
        [0.412, 0.428,  1], [0.448, 0.462, -1], [0.513, 0.527,  1],
        [0.568, 0.582, -1], [0.648, 0.662,  1],
        [0.888, 0.958,  1], [0.898, 0.912, -1], [0.912, 0.968, -1],
      ];
      const blocked = (s, side) => SOLID.some(([a, b, sd]) =>
        sd === side && (a <= b ? (s >= a && s <= b) : (s >= a || s <= b)));
      const avenue = (s0, s1, side, dist, step) => {
        along(s0, s1, step, (k) => {
          if (blocked(k / n, side)) return;
          const r = hash(k * 5.7 + side * 3.1);
          const d = dist + hash(k * 8.3 + side) * 4;
          if (r < 0.50) {
            broadleafFall(k, side, d, 8 + r * 8, r < 0.25 ? JACARANDA : JAC2,
                          { lobes: 3, spread: 1.05 });
          } else if (r < 0.84) {
            plane(k, side, d, 9 + r * 5, PARKGRN, { stages: 2, spread: 0.9 });
          } else {
            acacia(k, side, d, 6 + r * 3, HUIZACHE, { layers: 2 });
          }
        });
      };

      // ── Kerb accent strips ────────────────────────────────────────────────────
      const kerb = (s, side, len) => {
        const k = K(s);
        place(k, side, 2, [0.5, 0.16, len], [0.82, 0.16, 0.16]);
        place(k, side, 3.4, [2.6, 0.16, len], [0.94, 0.94, 0.94]);
      };

      const BOWL_BLUE = [0.25, 0.35, 0.62];
      const BOWL_GREY = [0.55, 0.56, 0.60];
      const BOWL_POP  = [0.92, 0.55, 0.16];   // sparse marigold-orange pop only
      const crowdCols = [BOWL_BLUE, BOWL_GREY, BOWL_BLUE, BOWL_GREY,
                         BOWL_BLUE, BOWL_GREY, BOWL_POP];
      // The local crowd-terrace model that used to live here emitted ONE BOX PER
      // SEAT off a straight `len` chord. Both halves of that were wrong: the
      // chord cut across the winding stadium route, and a stand is not worth a
      // box per spectator. The shared terrace()/tieredBowl() range emitters walk
      // the arc and carry crowdBand's banded-run-plus-speckle budget, so the
      // Foro Sol rim below is both cheaper and actually follows the road.
      // Short, atomic upper-deck segments follow the winding stadium route.
      // Their roofs remain legitimate architecture but never chord across tarmac.
      const boundedStand = (s, side, gap, len, col, crowd, required) => {
        const k = K(s), depth = 12, a = anchor(k, side, gap + depth / 2);
        const bv = [a.r, a.u, a.t], h = 12;
        modelGroup(`mexico-stand-${k}-${side}-${gap}`, {
          center: vadd(a.c, a.u, h / 2),
          size: [depth, h + 1, len],
          basis: bv,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 5.5), [depth, 11, len], col, bv);
          addBox(stage, vadd(vadd(a.c, a.r, -side * 4.7), a.u, 6.2),
                 [1.0, 7.8, len - 1.2], crowd, bv);
          // High roof: underside > 11 m, and its bounded footprint stays off-road.
          addBox(stage, vadd(a.c, a.u, 11.8), [depth + 2, 0.8, len + 1], [0.84, 0.85, 0.87], bv);
        }, { required: !!required });
      };

      for (const s of [0.972, 0.990, 0.008, 0.026]) {
        boundedStand(s, 1, 16, 26, SEATS, s < 0.98 ? ORANGE : PINK, s === 0.008);
        boundedStand(s, 1, 34, 28, CONCRETE, GREEN, false);
      }

      // Banners along stand fronts
      banners(0.00, 1, 8);

      // Start/finish gantry + scoring board
      gantry(0.00, 8.5, [0.14, 0.14, 0.18]);
      billboard(K(0.005), 1, 7, 14, 5, fiesta[0]);
      {
        const a = anchor(K(0.00), 1, 50);  // pushed out 40→50 m to clear wide screen overhang
        if (!onTrack(a.c[0], a.c[2], 16)) {
          // Scoreboard mast
          addBox(out, vadd(a.c, a.u, 8),  [1.2, 16, 1.2], [0.28, 0.28, 0.32], [a.r, a.u, a.t]);
          // Big screen panel
          addBox(out, vadd(a.c, a.u, 19), [24, 11, 1.8], [0.06, 0.06, 0.08],  [a.r, a.u, a.t]);
          // Screen surround frame
          addBox(out, vadd(a.c, a.u, 19), [25, 11.8, 1.0], [0.26, 0.28, 0.32], [a.r, a.u, a.t]);
        }
      }

      // Lamp posts on the main straight
      for (const s of [0.01, 0.03, 0.06, 0.09]) {
        lampPost(K(s), -1, 12);
        lampPost(K(s),  1, 12);
      }

      building(K(0.02), -1, 2, 16, 12, 60, { wall: [0.90, 0.90, 0.92],
               window: [0.30, 0.38, 0.44], floor: 3 });
      place(K(0.02), -1, 10, [17, 0.8, 60], [0.82, 0.82, 0.84]);   // flat roof slab

      // Pit garage units
      for (const s of [0.005, 0.02, 0.035, 0.05]) {
        building(K(s), -1, 2.5, 7, 5, 14, { kind: "hall", wall: [0.93, 0.93, 0.95], window: [0.22, 0.26, 0.30], floor: 2 });
      }
      for (const s of [0.01, 0.03, 0.05]) {
        motorhome(K(s), -1, 22, 14, 9 + hash(K(s)) * 4, 16,
                 { wall: hash(K(s) * 5) > 0.5 ? [0.86, 0.40, 0.30] : [0.30, 0.42, 0.62],
                   window: [0.55, 0.58, 0.62] });
      }
      // Control tower at start of pit straight
      tower(K(0.04), -1, 6, 9, 26, { col: [0.82, 0.82, 0.86], cap: true, capCol: [0.20, 0.22, 0.26], mast: 7 });
      marshalPost(K(0.06), 1, 6);

      for (const s of [0.014, 0.034, 0.054]) {
        const k = K(s), warm = hash(k * 107) > 0.5;
        building(k, -1, 40, 12, 8 + hash(k * 109) * 3, 18, {
          kind: "hall",
          wall: warm ? [0.78, 0.30, 0.25] : [0.24, 0.42, 0.60],
          window: [0.56, 0.62, 0.68], floor: 2,
        });
      }
      broadcastCompound(K(0.03), -1, 58, { vans: 3, dishes: 2, mastH: 10 });

      hedge(0.04, 0.14, 1, 13, 3.2, TREEGRN);
      hedge(0.04, 0.12, -1, 16, 2.8, PARKGRN);
      forestEdge(0.04, 0.14,  1, 26, { density: 0.30, hMin: 9, hMax: 16, col: TREEGRN, col2: PARKGRN, pineFrac: 0.22 });
      forestEdge(0.04, 0.14, -1, 28, { density: 0.26, hMin: 8, hMax: 15, col: PARKGRN, col2: TREEGRN, pineFrac: 0.18 });
      avenue(0.04, 0.14,  1, 14, 26);
      avenue(0.04, 0.14, -1, 17, 30);

      // Mid-lap park (T1 → Horquilla approach) — Mixhuca before skyline
      forestEdge(0.14, 0.30,  1, 26, { density: 0.28, hMin: 7, hMax: 13, col: TREEGRN, col2: PARKGRN, pineFrac: 0.22 });
      forestEdge(0.14, 0.50, -1, 26, { density: 0.24, hMin: 8, hMax: 14, col: PARKGRN, col2: TREEGRN, pineFrac: 0.18 });
      forestEdge(0.30, 0.48,  1, 26, { density: 0.24, hMin: 7, hMax: 12, col: TREEGRN, col2: PARKGRN, pineFrac: 0.20 });
      avenue(0.14, 0.30,  1, 15, 32);
      avenue(0.16, 0.50, -1, 16, 36);
      avenue(0.30, 0.48,  1, 15, 34);

      grandstandEx(0.12, 1,  9, 80, null, GREEN,
                   { livery: "navy", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.12, 1, 30, 80, null, ORANGE,
                   { livery: "concrete", roof: "flat" });
      kerb(0.12, 1, 9); kerb(0.115, -1, 8);

      for (const side of [-1, 1]) {
        grandstandEx(0.20, side, 8, 48, null, side < 0 ? ORANGE : PINK,
                     { livery: side < 0 ? "steel" : "navy",
                       roof: side < 0 ? "truss" : "cantilever", pylons: side < 0 });
      }
      kerb(0.20, -1, 7); kerb(0.205, 1, 7);
      cameraTower(K(0.20), 1, 30, { h: 18 });

      cityFront(0.24, 0.48, -1, 72, {
        minH: 14, maxH: 36, depth: 18, lit: true,
        palette: [[0.64, 0.62, 0.58], [0.70, 0.68, 0.62], [0.58, 0.56, 0.54], [0.66, 0.60, 0.56]],
        windowCol: [0.96, 0.88, 0.58], step: 38
      });
      cityFront(0.58, 0.68, -1, 80, {
        minH: 12, maxH: 30, depth: 16, lit: true,
        palette: [[0.62, 0.60, 0.58], [0.68, 0.64, 0.60], [0.56, 0.54, 0.52], [0.60, 0.58, 0.56]],
        windowCol: [0.94, 0.84, 0.55], step: 40
      });
      cityFront(0.32, 0.46, 1, 78, {
        minH: 12, maxH: 32, depth: 16, lit: true,
        palette: [[0.60, 0.62, 0.66], [0.66, 0.64, 0.60], [0.56, 0.58, 0.62], [0.68, 0.62, 0.58]],
        windowCol: [0.90, 0.82, 0.52], step: 42
      });

      tower(K(0.31), -1, 142, 18, 74, {
        col: [0.52, 0.58, 0.64], seg: 6, cap: true,
        capCol: [0.74, 0.78, 0.82], mast: 8,
      });
      tower(K(0.37), -1, 166, 16, 92, {
        col: [0.46, 0.52, 0.60], seg: 6, cap: true,
        capCol: [0.84, 0.72, 0.42], mast: 11,
      });
      tower(K(0.62), -1, 154, 20, 68, {
        col: [0.58, 0.56, 0.54], seg: 6, cap: true,
        capCol: [0.70, 0.74, 0.78], mast: 6,
      });

      // Mid-distance backdrop skyline — further back, sparser (city second)
      every(42, (k) => {
        for (const side of [-1, 1]) {
          const d = 280 + hash(k * 82 + side) * 140 + (k & 1) * 24;
          const h = 26 + hash(k * 83 + side) * 40;
          const tone = 0.62 + hash(k * 84 + side) * 0.10;
          backdrop(k, side, d, [100, h, 45], [tone * 0.98, tone, tone * 1.02]);
        }
      });

      sponsorHoarding(0.31, 0.39, -1, 9, { palette: fiesta });

      groundPlane(K(0.42), 1, 5, [60, 1.0, 50], [0.40, 0.40, 0.43]);  // grey runoff
      kerb(0.42, 1, 10);
      grandstandEx(0.42, 1, 7, 40, null, ORANGE,
                   { livery: "steel", roof: "truss", endWalls: true });
      banners(0.42, 1, 6);
      cameraTower(K(0.42), -1, 20, { h: 16 });
      if (circuitKit) {
        circuitKit.trackSigns({
          id: "kit:mexico:horquilla-signs", frac: 0.405,
          side: -1, gap: 8, size: [2.4, 2.6, 24], count: 3,
        });
      }

      for (const s of [0.510, 0.530, 0.550, 0.570, 0.590]) {
        const k = K(s);
        building(k, -1, 28 + hash(k) * 32, 24, 9 + hash(k * 3) * 5, 20,
                 { kind: "podium", wall: [0.86, 0.86, 0.84], window: [0.40, 0.46, 0.50], floor: 2 });
      }
      // Park trees both sides of the sports facility section — denser toward stadium
      forestEdge(0.48, 0.68,  1, 26, { density: 0.32, hMin: 7, hMax: 13, col: TREEGRN, col2: PARKGRN, pineFrac: 0.22 });
      forestEdge(0.48, 0.68, -1, 26, { density: 0.28, hMin: 8, hMax: 14, col: PARKGRN, col2: TREEGRN, pineFrac: 0.18 });
      avenue(0.48, 0.68,  1, 13, 26);
      avenue(0.50, 0.68, -1, 14, 30);

      {
        const k = K(0.575), d = 96;
        const p = anchor(k, -1, d), bv = [p.r, p.u, p.t];
        modelGroup("mexico-palacio-deportes", {
          center: vadd(p.c, p.u, 15),
          size: [82, 31, 82],
          basis: bv,
        }, (stage) => {
          const COP = [0.66, 0.44, 0.30], COP2 = [0.57, 0.46, 0.35];   // copper sheen + patina
          const rings = [[40, 35, 5, COP2], [35, 27, 7, COP], [27, 17, 7, COP2], [17, 7, 6, COP]];
          let y = 0;
          for (const [rB, rT, h, c] of rings) { addFrustum(stage, vadd(p.c, p.u, y), rB, rT, h, c, 12, bv); y += h; }
          addCone(stage, vadd(p.c, p.u, y), 7, 4, COP, 12, bv);          // crown
          for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            // Single-anchor extrapolation (p.c) walked +/-37 m*sqrt(2) out to
            // each corner (~52 m) — one of the four landed 204 m clear of
            // ground (measured via float-audit); this model already sits
            // 96 m off-track, so a 52 m corner walk clears the ~120 m
            // terrain-ribbon reach and falls back to the far-scenery floor
            // slab (pyMin-3) while p.c itself is not near pyMin. terrainYAt/
            // groundYAt both return null that far out, so per-corner
            // re-sampling isn't available; pulled the corners in to 22 m
            // (~31 m walk) to stay inside the ribbon instead.
            const cp = vadd(vadd(p.c, p.r, ex * 22), p.t, ez * 22);
            addBox(stage, vadd(cp, p.u, 4.5), [3, 9, 3], [0.50, 0.40, 0.34], bv);   // saddle corner pylon
          }
        }, { required: true });
      }

      {
        const k = K(0.66), d = 38;
        const p = anchor(k, 1, d);
        if (!onTrack(p.c[0], p.c[2], 6)) {
          addBox(out, vadd(p.c, p.u, 1.8),  [4.2, 3.6, 4.2], [0.58, 0.56, 0.52], [p.r, p.u, p.t]);
          addBox(out, vadd(p.c, p.u, 6.7),  [2.4, 6.2, 1.8], [0.20, 0.38, 0.72], [p.r, p.u, p.t]);
          addBox(out, vadd(p.c, p.u, 10.7), [1.8, 1.8, 1.8], [0.98, 0.18, 0.28], [p.r, p.u, p.t]);
          place(k, 1, d - 3.5, [3.2, 0.3, 5.5], [0.95, 0.80, 0.15]);
        }
      }

      // Bowl floor — former baseball field / concert pad beside the corridor.
      // gap kept large enough that rejBox/onTrack never clips the racing line.
      const FIELD = [0.30, 0.44, 0.24];
      const DIRT  = [0.50, 0.40, 0.28];
      for (const s of [0.74, 0.77, 0.80, 0.83]) {
        groundPatch(K(s), -1, 11, [22, 0.55, 30], s < 0.79 ? FIELD : DIRT,
                    { id: `foro-floor-l-${K(s)}`, samples: 4 });
        groundPatch(K(s),  1, 11, [22, 0.55, 30], s < 0.79 ? DIRT : FIELD,
                    { id: `foro-floor-r-${K(s)}`, samples: 4 });
      }
      // Wider infield pad at mid-bowl (off tarmac)
      groundPatch(K(0.785), -1, 28, [36, 0.6, 36], FIELD,
                  { id: "foro-infield-left", samples: 6 });
      groundPatch(K(0.785),  1, 28, [36, 0.6, 36], DIRT,
                  { id: "foro-infield-right", samples: 6 });

      // ── THE BOWL ITSELF ─────────────────────────────────────────────────
      // Foro Sol is a BASEBALL STADIUM the circuit drives through, and what
      // that means on camera is a steep stepped rake of navy bucket seats
      // rising on BOTH sides of the car with no roof and no back shell to hide
      // behind — the one place in Formula 1 where the crowd is above you on
      // both hands at once. bowlSeatWall (a flat slab with a crowd stripe
      // painted down its face) could give the enclosure but not the STEP;
      // tieredBowl's tiers climb AND recede, which is the whole silhouette.
      // Seats are Estadio GNP Seguros navy, not a fiesta rainbow: the marigold
      // is one entry in seven so it reads as the occasional pop a broadcast
      // catches, never as a colour scheme.
      const SEAT_NAVY = [
        BOWL_BLUE, [0.21, 0.30, 0.56], BOWL_BLUE, [0.28, 0.39, 0.66],
        BOWL_BLUE, BOWL_GREY, BOWL_POP,
      ];
      const BOWL_SHELL = [[0.62, 0.61, 0.60], [0.54, 0.54, 0.55]];
      for (const side of [-1, 1]) {
        tieredBowl(0.728, 0.858, side, 9, {
          tiers: 4, tierDepth: 5.2, base: 3.6, rise: 3.1,
          shell: BOWL_SHELL, fascia: [0.90, 0.89, 0.84],
          crowd: SEAT_NAVY, density: 0.66, step: 9,
        });
      }
      for (const side of [-1, 1]) {
        terrace(0.734, 0.852, side, 32, {
          rows: 5, rise: 1.9, depth: 2.8,
          conc: [0.68, 0.67, 0.64], concAlt: [0.58, 0.57, 0.56],
          crowd: SEAT_NAVY, density: 0.5, step: 10,
        });
      }
      boundedStand(0.744, -1, 52, 26, [0.60, 0.59, 0.58], BOWL_BLUE, false);
      boundedStand(0.842, -1, 52, 26, [0.60, 0.59, 0.58], BOWL_GREY, false);
      // Entry/exit end caps stay behind the bright apertures.
      boundedStand(0.715, -1, 36, 20, [0.58, 0.56, 0.54], BOWL_GREY, false);
      boundedStand(0.875, -1, 36, 20, [0.58, 0.56, 0.54], BOWL_BLUE, false);
      boundedStand(0.875,  1, 36, 20, [0.58, 0.56, 0.54], BOWL_GREY, false);

      for (const s of [0.74, 0.77, 0.80, 0.83, 0.85]) {
        lightMast(K(s), -1, 50, 52);
        if (s >= 0.80) lightMast(K(s), 1, 50, 52);
      }

      // Foro Sol scoreboard / jumbotron at the far end of the stadium (s≈0.80)
      {
        const k = K(0.80), a = anchor(k, -1, 46);
        modelGroup("foro-scoreboard", {
          center: vadd(a.c, a.u, 28),
          size: [34, 15, 2],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 28), [32, 14, 2.0], [0.04, 0.04, 0.06], [a.r, a.u, a.t]);
          addBox(stage, vadd(a.c, a.u, 28), [34, 15, 1.0], [0.24, 0.26, 0.30], [a.r, a.u, a.t]);
        }, { required: true });
      }

      // Festive banners inside the bowl — papel picado at trackside level
      for (const s of [0.74, 0.77, 0.80, 0.83]) {
        banners(s, -1, 9); banners(s, 1, 9);
      }

      fence(0.735, 0.855, -1, 7.5, 3.8, [0.82, 0.84, 0.88]);
      fence(0.735, 0.855,  1, 7.5, 3.8, [0.82, 0.84, 0.88]);
      wall(0.735, 0.855, -1, 6.4, 1.0, CONCRETE, 0.45);
      wall(0.735, 0.855,  1, 6.4, 1.0, CONCRETE, 0.45);
      tyreWall(0.755, 0.775, -1, 5, ORANGE);
      tyreWall(0.795, 0.815,  1, 5, PINK);
      kerb(0.76, -1, 8); kerb(0.80, 1, 8);

      // Mexican flag colours on the stadium outer wall fascia (visible from outside)
      for (const side of [-1, 1]) {
        const points = [];
        along(0.73, 0.86, 18, (k) => points.push({ k, side, dist: 30.4 }));
        groundedSegments({
          id: `foro-outer-fascia-${side}`,
          points, width: 1.0, height: 20,
          color: side < 0 ? [0.10, 0.58, 0.26] : [0.86, 0.12, 0.16],
        });
      }

      billboard(K(0.88), 1, 8, 14, 6, fiesta[1]);
      // Low media/hospitality wing outside the entry throat, behind the stands.
      building(K(0.695), -1, 30, 22, 14, 28, {
        wall: [0.76, 0.74, 0.72], window: [0.30, 0.38, 0.46],
        floor: 3, roof: [0.88, 0.24, 0.44],
      });
      // Soft park trees just past the exit gap (not walling it shut)
      forestEdge(0.89, 0.94, -1, 22, { density: 0.24, hMin: 7, hMax: 12, col: PARKGRN, col2: TREEGRN, pineFrac: 0.2 });
      avenue(0.89, 0.94, -1, 15, 28);

      for (const s of [0.90, 0.92, 0.94]) {
        boundedStand(s, 1, 14, 24, SEATS, PINK, false);
        boundedStand(s, 1, 32, 26, CONCRETE, GREEN, false);
      }
      terrace(0.892, 0.952, 1, 46, {
        rows: 6, rise: 1.7, depth: 2.7, crowd: crowdCols,
        conc: [0.70, 0.69, 0.66], concAlt: [0.60, 0.59, 0.57],
        density: 0.58, step: 10,
      });
      // Taller floodlights flanking the Peraltada
      lightMast(K(0.90), 1, 32, 44);
      lightMast(K(0.94), 1, 32, 44);
      // Lamp posts along the Peraltada exit
      lampPost(K(0.91), -1, 14);
      lampPost(K(0.93), -1, 14);
      banners(0.92, 1, 9);
      cameraTower(K(0.92), -1, 18, { h: 20 });
      sponsorHoarding(0.895, 0.935, -1, 9, { palette: fiesta });

      // Banked kerb edges through the Peraltada/Estadio corners
      for (const s of [0.89, 0.92, 0.95]) {
        const k = K(s);
        place(k, 1, 2.2, [2.4, 0.6, 9], [0.80, 0.76, 0.72]);
        place(k, 1, 1.8, [0.6, 0.16, 9], [0.88, 0.12, 0.12]);
      }

      // Mexican flag strip accents at the Peraltada outer bank
      for (let i = 0; i < 6; i++) {
        const f = 0.88 + i * 0.018;
        const k = K(f);
        place(k, 1, 15, [0.5, 7, 16], [0.10, 0.58, 0.26]);
        place(k, 1, 18, [0.5, 7, 16], [0.94, 0.94, 0.92]);
        place(k, 1, 21, [0.5, 7, 16], [0.86, 0.12, 0.16]);
      }

      fence(0.10, 0.16, 1, 6, 3.2, [0.80, 0.82, 0.84]);
      guardrail(0.04, 0.11,  1, 4.5, [0.86, 0.86, 0.90]);
      guardrail(0.04, 0.11, -1, 4.5, [0.86, 0.86, 0.90]);
      guardrail(0.30, 0.40, -1, 5,   [0.86, 0.86, 0.90]);

      for (const s of [0.12, 0.20, 0.30, 0.42, 0.55, 0.66, 0.90])
        marshalPost(K(s), 1, 6);

      billboard(K(0.07), 1, 12, 12, 5, fiesta[2]);
      billboard(K(0.09), 1, 14, 12, 5, fiesta[3]);
      billboard(K(0.33), -1, 16, 14, 5, fiesta[1]);
      billboard(K(0.46),  1, 10, 10, 4, fiesta[0]);

      const FENCE_M = [0.80, 0.82, 0.84];
      for (const [s0, s1, side] of [
        [0.00, 0.10,  1], [0.00, 0.10, -1],
        [0.16, 0.30,  1], [0.10, 0.30, -1],
        [0.30, 0.48,  1], [0.30, 0.48, -1],
        [0.48, 0.60,  1], [0.48, 0.60, -1],
        [0.60, 0.72,  1], [0.60, 0.72, -1],
        [0.86, 1.00,  1], [0.86, 1.00, -1],
      ]) fence(s0, s1, side, 5.5, 3.4, FENCE_M);
      for (const [s0, s1, side] of [
        [0.00, 0.10,  1], [0.16, 0.30,  1], [0.30, 0.48, -1],
        [0.48, 0.60,  1], [0.60, 0.72, -1], [0.86, 1.00,  1],
        [0.10, 0.30, -1], [0.48, 0.60, -1], [0.86, 1.00, -1],
      ]) hedge(s0, s1, side, 2.4, 1.4, side < 0 ? PARKGRN : TREEGRN);
      for (let i = 0; i < 44; i++) {
        const sf = i / 44;
        if (sf > 0.72 && sf < 0.87) continue;      // Foro Sol bowl is dressed already
        const side = (i % 2) ? 1 : -1;
        billboard(K(sf), side, 9, 10 + hash(i * 3.7) * 4, 4.2, fiesta[i % 4]);
      }
      // Papel-picado runs between the hoardings.
      for (const s of [0.03, 0.17, 0.26, 0.35, 0.50, 0.58, 0.64, 0.95])
        banners(s, s > 0.5 ? -1 : 1, 7);
      // Marshal posts on the other side too.
      for (const s of [0.16, 0.26, 0.36, 0.50, 0.60, 0.70, 0.95])
        marshalPost(K(s), -1, 6);

      const MEX_STANDS = ["navy", "concrete", "steel"];
      const MEX_ROOFS  = ["cantilever", "flat", "truss"];
      const named = [
        [0.055,  1, 10, 56, ORANGE], [0.055, -1, 11, 48, PINK],
        [0.165,  1, 10, 50, PINK],   [0.245, -1, 10, 52, GREEN],
        [0.285,  1, 11, 46, ORANGE], [0.345, -1, 10, 48, PINK],
        [0.455, -1, 11, 44, GREEN],  [0.520,  1, 10, 50, ORANGE],
        [0.575, -1, 10, 46, PINK],   [0.655,  1, 11, 48, GREEN],
        [0.905, -1, 11, 52, ORANGE], [0.945,  1, 10, 54, PINK],
      ];
      for (let i = 0; i < named.length; i++) {
        const [s, side, gap, len, crowd] = named[i];
        grandstandEx(s, side, gap, len, null, crowd, {
          livery: MEX_STANDS[i % MEX_STANDS.length],
          roof: MEX_ROOFS[(i + 1) % MEX_ROOFS.length],
          tiers: i % 4 === 1 ? 2 : 1,
          pylons: i % 3 === 2,
          endWalls: i % 5 === 0,
        });
      }
      terrace(0.215, 0.265,  1, 20, { rows: 4, rise: 1.6, depth: 2.6,
        crowd: crowdCols, density: 0.6, step: 9 });
      terrace(0.915, 0.965, -1, 20, { rows: 4, rise: 1.6, depth: 2.6,
        crowd: crowdCols, density: 0.6, step: 9 });

      avenue(0.60, 0.70, -1, 15, 30);
      every(26, (k) => {
        const sf = k / n;
        if (sf > 0.72 && sf < 0.87) return;                 // stadium bowl
        for (const side of [-1, 1]) {
          if (hash(k * 71 + side) > 0.55) continue;
          bush(k, side, 8.5 + hash(k * 73 + side) * 1.5, PARKGRN);
        }
      });
      // Tyre stacks on the corner apexes that had none.
      tyreWall(0.055, 0.075, -1, 4.5, ORANGE);
      tyreWall(0.235, 0.255,  1, 4.5, PINK);
      tyreWall(0.285, 0.305, -1, 4.5, GREEN);
      tyreWall(0.415, 0.435, -1, 4.5, ORANGE);
      tyreWall(0.505, 0.525,  1, 4.5, PINK);
      tyreWall(0.645, 0.665, -1, 4.5, GREEN);
      tyreWall(0.925, 0.945,  1, 4.5, ORANGE);
      // Kerb accents at the remaining apexes.
      for (const [s, side] of [[0.06, -1], [0.24, 1], [0.29, -1], [0.34, 1],
                               [0.52, 1], [0.58, -1], [0.65, -1], [0.93, 1]]) {
        kerb(s, side, 8);
      }
      // Boulevard lamp posts down the park straights.
      for (let i = 0; i < 30; i++) {
        const sf = i / 30;
        if (sf > 0.70 && sf < 0.90) continue;
        lampPost(K(sf), (i % 2) ? 1 : -1, 11);
      }

      for (const s of [0.05, 0.08, 0.92, 0.97]) {
        cypress(K(s), 1, 12 + hash(K(s)) * 7, 12 + hash(K(s) * 3) * 5, [0.16, 0.31, 0.20],
                { slim: 0.9 });
      }
      // Sparse park trees on the open sections (avoiding stadium/park sections)
      every(22, (k) => {
        const s = k / n;
        if (s < 0.50) return;   // start-finish straight + park/city sections handled
        if (s > 0.70 && s < 0.90) return;   // stadium section
        for (const side of [-1, 1]) {
          const r = hash(k * 91 + side);
          if (r > 0.50) continue;
          const d = cityBand(s) ? 22 + hash(k * 92 + side) * 8
                                : 13 + hash(k * 92 + side) * 22;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 9)) continue;
          const h = 8 + hash(k * 94 + side) * 5;
          if (r < 0.18)      broadleafFall(k, side, d, h, r < 0.09 ? JACARANDA : JAC2, { lobes: 3 });
          else if (r < 0.36) plane(k, side, d, h, PARKGRN, { stages: 2, spread: 0.85 });
          else               acacia(k, side, d, h * 0.8, HUIZACHE, { layers: 2 });
        }
      });

      every(60, (k) => {
        const side = hash(k * 31) > 0.5 ? 1 : -1;
        const d = 14 + hash(k * 32) * 8;
        const p = anchor(k, side, d);
        if (onTrack(p.c[0], p.c[2], 8)) return;
        addCyl(out, p.c, 0.18, 9, [0.85, 0.85, 0.85], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8), [2.4, 1.4, 0.2], fiesta[k % 4], [p.r, p.u, p.t]);
      });

      every(24, (k) => {
        for (const side of [1, -1]) {
          const s = k / n;
          if (s < 0.50) continue;   // start-finish straight + park/city sections handled elsewhere
          if (s > 0.70 && s < 0.90) continue;   // stadium section
          if (hash(k * 57 + side) > 0.62) continue;
          const d = cityBand(s) ? 22 + hash(k * 63 + side) * 8
                                : 15 + hash(k * 63 + side) * 20;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 67 + side);
          if (r < 0.30) broadleafFall(k, side, d, 7 + r * 6, JACARANDA, { lobes: 3, spread: 0.95 });
          else          plane(k, side, d, 6.5 + r * 4.5, [0.15 + r * 0.07, 0.34 + r * 0.06, 0.17],
                              { stages: r > 0.7 ? 3 : 2, spread: 0.85 });
        }
      });

      {
        const pA = anchor(K(0.45), -1, 55);
        if (!onTrack(pA.c[0], pA.c[2], 14)) {
          const pb = [pA.r, pA.u, pA.t];
          // Three stacked boxes — stepped pyramid silhouette, bases on ground
          addBox(out, vadd(pA.c, pA.u, 2.0),  [20, 4,  20], STONE, pb);
          addBox(out, vadd(pA.c, pA.u, 6.0),  [14, 4,  14], STONE, pb);
          addBox(out, vadd(pA.c, pA.u, 10.0), [ 8, 4,   8], STONE, pb);
          addBox(out, vadd(pA.c, pA.u, 13.0), [ 4, 2.4, 4], [0.60, 0.52, 0.38], pb);
        }
      }

      for (const [extra, wMin, hMin, count, rock, snowL] of [
        [980,  360, 150, 16, [0.50, 0.55, 0.62], 0.74],
        [1260, 460, 210, 12, [0.56, 0.60, 0.66], 0.68],
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + (hash(i * 5 + extra) - 0.5) * 0.45) / count * 6.2832;
          const hv = hash(i * 7 + extra), j = hash(i * 11 + extra);
          const rr = ring - wMin * 0.12 + hash(i * 17 + extra) * wMin * 0.22;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                   wMin + hv * 150, hMin + j * 110,
                   { seg: 6, seed: i * 13 + extra, snowline: snowL, rock,
                     forest: [0.40, 0.46, 0.48], snow: [0.88, 0.90, 0.94] });
        }
      }

      {
        const popo = anchor(K(0.34), -1, 1180);
        mountain(popo.c[0], popo.c[2], pyMin, 560, 350, {
          seg: 8, seed: 2601, rough: 0.24, snowline: 0.66,
          rock: [0.42, 0.46, 0.52], forest: [0.34, 0.40, 0.40],
          snow: [0.92, 0.93, 0.96],
        });
        const izta = anchor(K(0.37), -1, 1320);
        mountain(izta.c[0], izta.c[2], pyMin, 720, 245, {
          seg: 8, seed: 2602, rough: 0.38, snowline: 0.72,
          rock: [0.48, 0.51, 0.57], forest: [0.37, 0.42, 0.42],
          snow: [0.89, 0.91, 0.94],
        });
      }

      // HERO (OPTIONAL): AIRLINER ON APPROACH TO BENITO JUÁREZ INTERNATIONAL
      // Hermanos Rodríguez sits directly under Mexico City's main landing
      // corridor — no other circuit on the calendar can use this. One low-poly
      // silhouette, gear down, set far beyond the Esses/back straight so it
      // reads as a distant hazed shape crossing the sky, never as a trackside
      // prop. Flat-shaded fuselage + wing + tail — cheap, placed once.
      {
        const a = anchor(K(0.20), 1, 820);           // ~700 m beyond the Esses
        const c = [a.c[0], a.c[1] + 210, a.c[2]];     // low final-approach altitude
        const bn = [a.r, a.u, a.t];                   // normal box basis
        const bf = [a.r, a.t, a.u];                   // cylinder axis along fuselage
        const FUSE = [0.60, 0.62, 0.66], DARK = [0.28, 0.29, 0.32];
        addCyl(out, vadd(c, a.t, -15), 1.6, 30, FUSE, 8, bf);        // fuselage
        addBox(out, c, [28, 0.6, 4.2], DARK, bn);                    // wings
        addBox(out, vadd(c, a.t, 13.5), [0.5, 4.4, 3.4], DARK, bn);  // tail fin
        addBox(out, vadd(c, a.t, 12.5), [9, 0.5, 2.4], DARK, bn);    // tailplane
        for (const off of [-4, 3]) {                                // gear down
          addCyl(out, vadd(vadd(c, a.t, off), a.u, -3.6), 0.16, 2.4, DARK, 4, bn);
        }
      }

      // Mid/far city tower ring — thinned + pushed so mountains win the horizon
      for (let i = 0; i < 10; i++) {
        const f = i / 10;
        const k = K(f);
        const side = i % 2 === 0 ? -1 : 1;
        const d = 380 + hash(i * 29) * 160 + (i % 3) * 30;
        const h = 32 + hash(i * 37) * 58;
        const w = 18 + hash(i * 53) * 16;
        const p = anchor(k, side, d);
        if (!onTrack(p.c[0], p.c[2], 20)) {
          const tone = 0.60 + hash(i * 41) * 0.10;
          building(k, side, d - w / 2, w, h, w,
            { wall: [tone * 0.98, tone, tone * 1.02],
              window: [tone * 0.68, tone * 0.72, tone * 0.82],
              lit: true, windowCol: [0.94, 0.84, 0.54], floor: 7 });
        }
      }
    },
  }
  );
})();
