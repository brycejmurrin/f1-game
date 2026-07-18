/* Apex 26 — MEXICO CITY circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mexico",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.6350, // GPS-derived (OpenF1 2025, conf=0.212)
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
      // The bespoke park and stadium dressing define these sectors. Generic
      // modern-city blocks would turn Mixhuca into a street canyon, while shared
      // furniture inside Foro Sol can close its deliberately bright apertures.
      { kind: "city", s0: 0.04, s1: 0.94 },
      { kinds: ["foliage", "lamps", "floodlights"], s0: 0.70, s1: 0.89 },
    ],
    // Cool thin-air haze: pale blue-grey horizon + slightly denser fog so far
    // Sierra Nevada peaks read as altitude, not flat desert glare.
    pal: { zenith: [0.56, 0.72, 0.92], horizon: [0.68, 0.72, 0.78], grass: [0.34, 0.52, 0.26], runoff: [0.52, 0.38, 0.24], fog: [0.70, 0.74, 0.80], fogDensity: 0.0022, sunDir: [0.24111167647565865, 0.8639835073711102, 0.44203807353870755], sun: [1, 0.98, 0.88], sunColor: [1, 0.96, 0.86] },
    segs: [
      { t: 0, l: 300 }, { t: -90, l: 100 }, { t: 80, l: 90 }, { t: 0, l: 250 }, { t: 90, l: 100 }, { t: 0, l: 500 },
      { t: -60, l: 80 }, { t: 60, l: 70 }, { t: 0, l: 200 }, { t: 90, l: 100 }, { t: -130, l: 120 },
    ],
    // The real circuit is effectively flat. These source-coordinate undulations
    // put less than a metre of relief under the final Estadio/Peraltada complex;
    // the previous ±7 m pair remapped across start/finish and invented a 12 m hill.
    elevations: [{ s: 0.535, halfM: 180, rise: 0.7 }, { s: 0.605, halfM: 150, rise: -0.25 }],
    scenery: function (api) {
      const { out, MAT, n, px, pz, pyMin, place, backdrop, groundPlane,
              addBox, addCyl, addPrism, addFrustum, addCone, every, onTrack, hash, vadd, anchor, along,
              building, motorhome, grandstand, billboard, tree, hedge, fence, palm, pine,
              guardrail, tyreWall, marshalPost, tower, gantry, mountain, wall,
              modelGroup, groundPatch, groundedSegments,
              cityFront, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

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

      // ── Kerb accent strips ────────────────────────────────────────────────────
      const kerb = (s, side, len) => {
        const k = K(s);
        place(k, side, 2, [0.5, 0.16, len], [0.82, 0.16, 0.16]);
        place(k, side, 3.4, [2.6, 0.16, len], [0.94, 0.94, 0.94]);
      };

      // ════════════ BESPOKE FORO SOL CROWD-BOWL MODELS ════════════
      const crowdCols = [PINK, ORANGE, GREEN, [0.98, 0.82, 0.10],
                         [0.94, 0.94, 0.92], [0.22, 0.42, 0.78], [0.90, 0.30, 0.24]];
      const bowlSeatWall = (s0, s1, side, gap, opts) =>
        api.bowlSeatWall(s0, s1, side, gap, Object.assign({ crowdCols }, opts || {}));
      // Bounded crowd terrace. The old single-point guard let the long tangent
      // chord sweep across a nearby bend; the complete group is now preflighted.
      const crowdBank = (s, side, gap, len, rows) => {
        const k = K(s), a = anchor(k, side, gap);
        const bv = [a.r, a.u, a.t], step = 2.4, rise = 1.9, seats = Math.max(6, Math.floor(len / 3.2));
        modelGroup(`mexico-crowd-bank-${k}-${side}`, {
          center: vadd(vadd(a.c, a.r, side * rows * step / 2), a.u, rows * rise / 2),
          size: [rows * step + 2, rows * rise + 3, len + 2],
          basis: bv,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addPrism(stage, vadd(vadd(a.c, a.r, side * rows * step / 2), a.u, rows * rise * 0.5),
                   [rows * step, rows * rise, len], [0.50, 0.49, 0.52], bv);
          stage._mat = MAT.FABRIC;
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < seats; c++) {
              const off = (c - (seats - 1) / 2) * 3.2;
              const p = vadd(vadd(vadd(a.c, a.r, side * r * step), a.u, r * rise + 1.2), a.t, off);
              addBox(stage, p, [0.9, 1.1, 0.8], crowdCols[(r * 5 + c * 3) % crowdCols.length], bv);
            }
          stage._mat = 0;
        });
      };
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

      // ════════════════════════════════════════════════════════════════════════
      // s=0.00  MAIN GRANDSTAND + START/FINISH STRAIGHT
      // ════════════════════════════════════════════════════════════════════════
      // Segment the long stand so its crowd and roof follow the final bend rather
      // than cutting a low tangent chord across the racing line.
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

      // ════════════════════════════════════════════════════════════════════════
      // s=0.02  PIT / PADDOCK BLOCK (left side)
      // ════════════════════════════════════════════════════════════════════════
      building(K(0.02), -1, 2, 16, 12, 60, { wall: [0.90, 0.90, 0.92],
               window: [0.30, 0.38, 0.44], floor: 3 });
      place(K(0.02), -1, 10, [17, 0.8, 60], [0.82, 0.82, 0.84]);   // flat roof slab

      // Pit garage units
      for (const s of [0.005, 0.02, 0.035, 0.05]) {
        building(K(s), -1, 2.5, 7, 5, 14, { wall: [0.93, 0.93, 0.95], window: [0.22, 0.26, 0.30], floor: 2 });
      }
      // Paddock motorhomes — was a generic office-block building() under a
      // "motorhomes" comment; motorhome() is the purpose-built swap.
      for (const s of [0.01, 0.03, 0.05]) {
        motorhome(K(s), -1, 22, 14, 9 + hash(K(s)) * 4, 16,
                 { wall: hash(K(s) * 5) > 0.5 ? [0.86, 0.40, 0.30] : [0.30, 0.42, 0.62],
                   window: [0.55, 0.58, 0.62] });
      }
      // Control tower at start of pit straight
      tower(K(0.04), -1, 6, 9, 26, { col: [0.82, 0.82, 0.86], cap: true, capCol: [0.20, 0.22, 0.26], mast: 7 });
      marshalPost(K(0.06), 1, 6);

      // Paddock depth: a restrained second row of team hospitality buildings.
      // These sit behind the garages/motorhomes so the pit straight remains open.
      for (const s of [0.014, 0.034, 0.054]) {
        const k = K(s), warm = hash(k * 107) > 0.5;
        building(k, -1, 40, 12, 8 + hash(k * 109) * 3, 18, {
          wall: warm ? [0.78, 0.30, 0.25] : [0.24, 0.42, 0.60],
          window: [0.56, 0.62, 0.68], floor: 2,
        });
      }

      // ════════════════════════════════════════════════════════════════════════
      // s=0.06  PARK TREE-LINE — DRS straight Mixhuca green (park-first)
      // Dense broadleaf corridor so the long straight reads as park before city.
      // ════════════════════════════════════════════════════════════════════════
      hedge(0.04, 0.14, 1, 22, 3.2, TREEGRN);
      hedge(0.04, 0.12, -1, 28, 2.8, PARKGRN);
      forestEdge(0.04, 0.14, 1, 26, { density: 0.92, hMin: 8, hMax: 15, col: TREEGRN, col2: PARKGRN, pineFrac: 0.25 });
      forestEdge(0.04, 0.14, -1, 34, { density: 0.72, hMin: 7, hMax: 13, col: PARKGRN, col2: TREEGRN, pineFrac: 0.20 });
      // Second rank behind the near treeline (depth without city walls)
      forestEdge(0.05, 0.13, 1, 48, { density: 0.55, hMin: 9, hMax: 16, col: TREEGRN, col2: PARKGRN, pineFrac: 0.35 });

      // Mid-lap park densify (T1 → Horquilla approach) — Mixhuca before skyline
      forestEdge(0.14, 0.30, 1, 20, { density: 0.78, hMin: 7, hMax: 13, col: TREEGRN, col2: PARKGRN, pineFrac: 0.22 });
      forestEdge(0.14, 0.28, -1, 44, { density: 0.50, hMin: 8, hMax: 14, col: PARKGRN, col2: TREEGRN, pineFrac: 0.18 });
      forestEdge(0.30, 0.48, 1, 24, { density: 0.62, hMin: 7, hMax: 12, col: TREEGRN, col2: PARKGRN, pineFrac: 0.20 });

      // ════════════════════════════════════════════════════════════════════════
      // s=0.12  TURN 1 GRANDSTAND
      // ════════════════════════════════════════════════════════════════════════
      grandstand(0.12, 1,  9, 80, SEATS,    GREEN);
      grandstand(0.12, 1, 24, 80, CONCRETE, ORANGE);
      kerb(0.12, 1, 9); kerb(0.115, -1, 8);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.20  MOISES SOLANA ESSES (both sides)
      // ════════════════════════════════════════════════════════════════════════
      for (const side of [-1, 1]) {
        grandstand(0.20, side, 8, 48, [0.50, 0.50, 0.54], side < 0 ? ORANGE : PINK);
      }
      kerb(0.20, -1, 7); kerb(0.205, 1, 7);

      // ════════════════════════════════════════════════════════════════════════
      // MEXICO CITY URBAN SKYLINE — PUSHED BACK (park-first composition)
      // Near cityFront thinned + set well beyond Mixhuca green so sprawl reads
      // as backdrop, not street canyon. Stadium approach left mostly open.
      // ════════════════════════════════════════════════════════════════════════
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

      // Reforma-inspired landmark cluster above the general Mexico City sprawl.
      // Three separated silhouettes give the skyline a readable focal rhythm.
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

      // ════════════════════════════════════════════════════════════════════════
      // s=0.42  HORQUILLA HAIRPIN
      // ════════════════════════════════════════════════════════════════════════
      groundPlane(K(0.42), 1, 5, [60, 1.0, 50], [0.40, 0.40, 0.43]);  // grey runoff
      kerb(0.42, 1, 10);
      grandstand(0.42, 1, 7, 40, [0.50, 0.50, 0.54], ORANGE);
      banners(0.42, 1, 6);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.55  PARK / SPORTS FACILITY (Parque Deportivo)
      // ════════════════════════════════════════════════════════════════════════
      for (const s of [0.510, 0.530, 0.550, 0.570, 0.590]) {
        const k = K(s);
        building(k, -1, 28 + hash(k) * 32, 24, 9 + hash(k * 3) * 5, 20,
                 { wall: [0.86, 0.86, 0.84], window: [0.40, 0.46, 0.50], floor: 2 });
      }
      // Park trees both sides of the sports facility section — denser toward stadium
      forestEdge(0.48, 0.68, 1, 16, { density: 0.82, hMin: 7, hMax: 13, col: TREEGRN, col2: PARKGRN, pineFrac: 0.22 });
      forestEdge(0.48, 0.68, -1, 48, { density: 0.68, hMin: 8, hMax: 14, col: PARKGRN, col2: TREEGRN, pineFrac: 0.18 });
      forestEdge(0.62, 0.70, 1, 22, { density: 0.70, hMin: 8, hMax: 14, col: TREEGRN, col2: PARKGRN, pineFrac: 0.25 });

      // Palacio de los Deportes — the landmark copper geodesic dome that sits in
      // this very sports park. A wide, low hyperbolic-paraboloid roof clad in
      // oxidised copper-orange sheet; modelled as stacked frustum rings + four
      // corner pylons hinting the saddle, set well back behind the park buildings.
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
            const cp = vadd(vadd(p.c, p.r, ex * 37), p.t, ez * 37);
            addBox(stage, vadd(cp, p.u, 4.5), [3, 9, 3], [0.50, 0.40, 0.34], bv);   // saddle corner pylon
          }
        }, { required: true });
      }

      // ════════════════════════════════════════════════════════════════════════
      // s=0.66  LUCHA-LIBRE TRIBUTE STATUE
      // ════════════════════════════════════════════════════════════════════════
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

      // ════════════════════════════════════════════════════════════════════════
      // HERO: FORO SOL BASEBALL STADIUM (s≈0.72–0.88)
      //
      // Enclosed baseball bowl: continuous eye-height seat walls along the
      // interior (s 0.73–0.86), bright ENTRY gap (~0.70–0.725) and EXIT gap
      // (~0.86–0.89), green/dirt bowl floor between track and stands (off
      // tarmac), nested grandstand tiers + rim caps behind the apertures.
      // ════════════════════════════════════════════════════════════════════════

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

      // Continuous eye-height seat wall — BOTH sides, spanning the bowl only
      // (entry/exit apertures left open so the corridor brightens in/out)
      bowlSeatWall(0.73, 0.86, -1, 10, { h: 6.2, thick: 3.6, shell: CONCRETE, step: 8 });
      bowlSeatWall(0.73, 0.86,  1, 10, { h: 6.2, thick: 3.6, shell: CONCRETE, step: 8 });
      // Upper continuous bank behind the eye wall (taller enclosure silhouette)
      bowlSeatWall(0.735, 0.855, -1, 22, { h: 9.5, thick: 4.2, shell: [0.66, 0.64, 0.62], step: 10 });
      bowlSeatWall(0.735, 0.855,  1, 22, { h: 9.5, thick: 4.2, shell: [0.66, 0.64, 0.62], step: 10 });

      // The route bends sharply inside Foro Sol. Short bounded tiers follow that
      // shape; the old 70 m tangent stands chorded across the road at 3.92 m.
      for (const s of [0.75, 0.78, 0.81, 0.84]) {
        boundedStand(s, -1, 30, 24, [0.66, 0.64, 0.62], fiesta[0], s === 0.78);
        boundedStand(s, -1, 50, 26, [0.58, 0.56, 0.54], fiesta[2], false);
        if (s !== 0.75) boundedStand(s, 1, 30, 24, [0.66, 0.64, 0.62], fiesta[1], s === 0.78);
        if (s === 0.78 || s === 0.84) boundedStand(s, 1, 50, 26, [0.58, 0.56, 0.54], fiesta[3], false);
      }

      // Packed upper terraces cresting the rim (both sides)
      for (const s of [0.755, 0.805, 0.845]) {
        crowdBank(s, -1, 68, 28, 6);
        if (s === 0.845) crowdBank(s, 1, 68, 28, 6);
      }
      // Entry/exit end caps stay behind the bright apertures.
      boundedStand(0.715, -1, 68, 20, [0.58, 0.56, 0.54], fiesta[2], false);
      boundedStand(0.875, -1, 68, 20, [0.58, 0.56, 0.54], fiesta[0], false);
      boundedStand(0.875,  1, 68, 20, [0.58, 0.56, 0.54], fiesta[1], false);

      // Sparse outer upper decks complete the bowl silhouette without filling
      // the bright entry/exit apertures or tightening the driver's sightline.
      boundedStand(0.835, -1, 74, 20, [0.56, 0.55, 0.54], fiesta[2], false);

      // Foro Sol floodlight masts — ring the outer rim
      for (const s of [0.74, 0.77, 0.80, 0.83, 0.85]) {
        lightMast(K(s), -1, 58, 52);
        if (s >= 0.80) lightMast(K(s), 1, 58, 52);
      }

      // Foro Sol scoreboard / jumbotron at the far end of the stadium (s≈0.80)
      {
        const k = K(0.80), a = anchor(k, -1, 90);
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

      // Large festive crowd mosaics on the outer tier fronts. Short panels keep
      // each footprint local to the winding stadium and safely behind the shell.
      for (const [s, side, ci] of [
        [0.748, -1, 0], [0.772, 1, 1], [0.798, -1, 2],
        [0.822, 1, 3], [0.846, -1, 1],
      ]) {
        place(K(s), side, 61, [0.8, 4.5, 12], fiesta[ci]);
      }

      // Interior fencing at trackside (safety fence inside stadium) — bowl only
      fence(0.735, 0.855, -1, 10, 3.8, [0.82, 0.84, 0.88]);
      fence(0.735, 0.855,  1, 10, 3.8, [0.82, 0.84, 0.88]);
      wall(0.735, 0.855, -1, 9, 1.0, CONCRETE, 0.45);
      wall(0.735, 0.855,  1, 9, 1.0, CONCRETE, 0.45);
      tyreWall(0.755, 0.775, -1, 5, ORANGE);
      tyreWall(0.795, 0.815,  1, 5, PINK);
      kerb(0.76, -1, 8); kerb(0.80, 1, 8);

      // Mexican flag colours on the stadium outer wall fascia (visible from outside)
      for (const side of [-1, 1]) {
        const points = [];
        along(0.73, 0.86, 18, (k) => points.push({ k, side, dist: 58 }));
        groundedSegments({
          id: `foro-outer-fascia-${side}`,
          points, width: 1.0, height: 20,
          color: side < 0 ? [0.10, 0.58, 0.26] : [0.86, 0.12, 0.16],
        });
      }

      // ════════════════════════════════════════════════════════════════════════
      // s=0.88  FORO SOL EXIT — bright aperture back to open track
      // ════════════════════════════════════════════════════════════════════════
      billboard(K(0.88), 1, 8, 14, 6, fiesta[1]);
      // Low media/hospitality wing outside the entry throat, behind the stands.
      building(K(0.695), -1, 46, 22, 14, 28, {
        wall: [0.76, 0.74, 0.72], window: [0.30, 0.38, 0.46],
        floor: 3, roof: [0.88, 0.24, 0.44],
      });
      // Soft park trees just past the exit gap (not walling it shut)
      forestEdge(0.89, 0.94, -1, 28, { density: 0.55, hMin: 7, hMax: 12, col: PARKGRN, col2: TREEGRN, pineFrac: 0.2 });

      // ════════════════════════════════════════════════════════════════════════
      // s=0.92  PERALTADA / ESTADIO STAND
      // The banked Peraltada corner passes the old Estadio Azteca-style grandstand.
      // ════════════════════════════════════════════════════════════════════════
      for (const s of [0.90, 0.92, 0.94]) {
        boundedStand(s, 1, 14, 24, SEATS, PINK, false);
        boundedStand(s, 1, 32, 26, CONCRETE, GREEN, false);
      }
      // Packed upper terrace behind the banked Peraltada/Estadio stand
      crowdBank(0.92, 1, 40, 110, 7);
      // Taller floodlights flanking the Peraltada
      lightMast(K(0.90), 1, 32, 44);
      lightMast(K(0.94), 1, 32, 44);
      // Lamp posts along the Peraltada exit
      lampPost(K(0.91), -1, 14);
      lampPost(K(0.93), -1, 14);
      banners(0.92, 1, 9);

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

      // ════════════════════════════════════════════════════════════════════════
      // TRACK FURNITURE: fences, guardrails, marshal posts, billboards
      // ════════════════════════════════════════════════════════════════════════
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

      // ════════════════════════════════════════════════════════════════════════
      // VEGETATION: palms along the straights, park trees
      // ════════════════════════════════════════════════════════════════════════
      for (const s of [0.05, 0.08, 0.92, 0.97]) {
        palm(K(s), 1, 18 + hash(K(s)) * 10, 9 + hash(K(s) * 3) * 4, GREEN);
      }
      // Sparse trees on open sections (avoiding stadium and park sections)
      every(22, (k) => {
        const s = k / n;
        if (s < 0.04 || (s > 0.04 && s < 0.50)) return;   // start-finish straight + park/city sections handled
        if (s > 0.70 && s < 0.90) return;   // stadium section
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.50) continue;
          const d = 26 + hash(k * 92 + side) * 50;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 9)) continue;
          tree(k, side, d, 8 + hash(k * 94 + side) * 5,
               hash(k * 96 + side) > 0.5 ? TREEGRN : PARKGRN);
        }
      });

      // ════════════════════════════════════════════════════════════════════════
      // FESTIVE FLAG POLES
      // ════════════════════════════════════════════════════════════════════════
      every(60, (k) => {
        const side = hash(k * 31) > 0.5 ? 1 : -1;
        const d = 14 + hash(k * 32) * 8;
        const p = anchor(k, side, d);
        if (onTrack(p.c[0], p.c[2], 8)) return;
        addCyl(out, p.c, 0.18, 9, [0.85, 0.85, 0.85], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8), [2.4, 1.4, 0.2], fiesta[k % 4], [p.r, p.u, p.t]);
      });

      // ════════════════════════════════════════════════════════════════════════
      // PARKLAND TREES — the Autódromo sits inside the leafy Magdalena Mixhuca
      // sports park, NOT a desert. Broadleaf park trees on the open sections
      // (the old code scattered green saguaro cacti — wrong biome, and the
      // horizontal addBox cross-arm floated as a box).
      // ════════════════════════════════════════════════════════════════════════
      every(16, (k) => {
        for (const side of [1, -1]) {
          const s = k / n;
          if (s < 0.04 || (s > 0.04 && s < 0.50)) continue;   // start-finish straight + park/city sections handled elsewhere
          if (s > 0.70 && s < 0.90) continue;   // stadium section
          if (hash(k * 57 + side) > 0.62) continue;
          const d = 30 + hash(k * 63 + side) * 34;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 67 + side);
          tree(k, side, d, 6.5 + r * 4.5, [0.15 + r * 0.07, 0.34 + r * 0.06, 0.17]);
          if (r > 0.62) tree(k, side, d + 5 + r * 6, 5 + r * 3, [0.17, 0.32, 0.16]);
        }
      });

      // ════════════════════════════════════════════════════════════════════════
      // AZTEC STEPPED PYRAMID (infield monument, s≈0.45)
      // ════════════════════════════════════════════════════════════════════════
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

      // ════════════════════════════════════════════════════════════════════════
      // SIERRA NEVADA — far volcano / mountain ring + cool thin-air haze
      // Popocatépetl / Iztaccíhuatl silhouette on the high-altitude horizon.
      // Sparse, far, cool blue-grey rock under denser fog (see pal.fogDensity).
      // ════════════════════════════════════════════════════════════════════════
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

      // Hero twin-volcano relief: Popocatépetl's steep snowy cone and the lower,
      // longer Iztaccíhuatl mass rise above the generic Sierra Nevada ring.
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
