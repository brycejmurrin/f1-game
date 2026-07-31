/* Apex 26 — SINGAPORE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "singapore",
    name: "SINGAPORE",
    startFrac: 0.5075, // GPS-derived (OpenF1 2025, conf=0.566)
    gp: "Singapore GP",
    country: "Singapore",
    night: true,
    theme: "street_night",
    sceneryTheme: "street",
    // Cool teal-glass palette for the shared circuitKit facilities (pit
    // building + race-control tower) — distinct from the generic street
    // theme's flat grey shell, so the pit precinct reads as glazed
    // curtain-wall rather than concrete.
    sceneryThemeOverrides: {
      palette: { shell: [0.16, 0.30, 0.40], roof: [0.80, 0.88, 0.94] },
    },
    lengthKm: 4.9,
    baseHW: 6,
    street: true,
    barrierGap: 1.2,
    terrainOuter: 48,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      // The generic street-night city is the CBD density base under the bespoke
      // facades; keep it (and shared foliage/lamps) out of the bay/hero
      // sightlines only. Floodlights stay excluded lap-wide — the bespoke
      // floodMastRing IS the race-lighting rig (no duplicate poles/pools).
      { kinds: ["city", "foliage", "lamps"], s0: 0.15, s1: 0.48, side: 1 },
      { kinds: ["city", "foliage", "lamps"], s0: 0.78, s1: 0.90, side: 1 },
      { kind: "floodlights", s0: 0, s1: 1 },
    ],
    // Cool night: near-black zenith + cool fog/ambient so CBD glass & neon pop.
    // Warm flood pools on tarmac stay in scenery — not the sky.
    pal: {
      horizon:      [0.10, 0.12, 0.20],
      zenith:       [0.02, 0.02, 0.07],
      sunColor:     [0.55, 0.62, 0.78],
      ambientSky:   [0.22, 0.26, 0.36],
      ambientGround:[0.18, 0.20, 0.26],
      fogColor:     [0.06, 0.08, 0.14],
      fogDensity:   0.0020,
    },
    segs: [
      { t: 0, l: 160 }, { t: -60, l: 70 }, { t: 70, l: 70 }, { t: -55, l: 70 }, { t: 0, l: 220 }, { t: -90, l: 70 },
      { t: 0, l: 200 }, { t: -95, l: 70 }, { t: 90, l: 80 }, { t: -80, l: 60 }, { t: 60, l: 70 }, { t: -90, l: 90 },
      { t: 0, l: 180 }, { t: -90, l: 70 }, { t: -90, l: 70 }, { t: 85, l: 60 }, { t: -95, l: 80 },
    ],
    // Elevations are source-trace fractions. Keep reclaimed-land Singapore nearly
    // flat, with only the Sheares underpass dip (racing s≈0.10) and Anderson
    // Bridge rise (racing s≈0.62).
    elevations: [
      { s: 0.6075, halfM: 120, rise: -2.5 },
      { s: 0.1275, halfM: 120, rise: 2.5 },
    ],
    // Marina Bay runs on real city streets: the bay-front boulevards are wide,
    // the Turn 1-3 complex, the Anderson Bridge link and the Esplanade squeeze
    // are not. s0/s1 are CONTROL-POINT index fractions in SOURCE space; the
    // racing-lap arc each lands on is in the trailing comment.
    hwZones: [
      { s0: 0.5890, s1: 0.6642, hw: 5.2, ease: 0.012 },  // arc 0.098-0.152 T1-T3
      { s0: 0.1020, s1: 0.1774, hw: 5.1, ease: 0.012 },  // arc 0.650-0.685 bridge link
      { s0: 0.2341, s1: 0.2901, hw: 5.3, ease: 0.012 },  // arc 0.808-0.838 Esplanade
      { s0: 0.3236, s1: 0.4067, hw: 5.3, ease: 0.012 },  // arc 0.925-0.955 final corners
    ],
    // Flat city tarmac — crown only, 2.5-3°. Nothing here is banked.
    bankZones: [
      { frac: 0.1043, angleDeg: 3.0, widthM: 100 },
      { frac: 0.3562, angleDeg: 3.0, widthM: 130 },
      { frac: 0.4377, angleDeg: 3.0, widthM: 90 },
      { frac: 0.6585, angleDeg: 2.5, widthM: 80 },
      { frac: 0.7694, angleDeg: 3.0, widthM: 80 },
      { frac: 0.0114, angleDeg: 3.0, widthM: 130 },
    ],
    scenery: function (api) {
      const { out, MAT, n, place, backdrop,
              building, billboard, anchor, every, onTrack, addBox, addCyl, addCone,
              addPrism, addFrustum, grandstand, grandstandEx, sponsorHoarding,
              gantry, marshalPost, palm, bush,
              fence, tyreWall, vadd, hash, cityFront, tower, ferrisWheel, modelGroup,
              overheadSpan, waterSurface, waterBand, floodMastRing, circuitKit } = api;
      const K = (s) => Math.round(s * n) % n;

      // Shared-kit adoption: bounded race operations outside the bay hero zones.
      if (circuitKit) {
        circuitKit.raceControl({
          id: "kit:singapore:race-control", frac: 0.58, side: -1, gap: 72,
          size: [12, 24, 14], style: "tapered", required: true,
        });
        circuitKit.pedestrianBridge({
          id: "kit:singapore:pedestrian-bridge", frac: 0.72,
          clearance: 7.2, thickness: 0.9, depth: 3, required: true,
        });
      }

      // Grade-aware portal beats. Short decks keep the declared underside
      // clearance true across Singapore's ramps instead of allowing a long flat
      // slab to approach the rising road at either end.
      const makePortal = (id, s0, s1, opts) => {
        const h = opts.h;
        const gap = opts.gap;
        const col = opts.col || [0.08, 0.08, 0.10];
        const stations = [s0, (s0 + s1) * 0.5, s1];
        for (let i = 0; i < stations.length; i++) {
          const s = stations[i];
          const k = K(s);
          overheadSpan({
            id: `${id}-deck-${i}`, frac: s, clearance: h, thickness: 0.9,
            depth: 6, supportGap: gap, color: col, required: true,
          });
          for (const side of [-1, 1]) {
            const a = anchor(k, side, gap);
            const size = [1.2, h, 6];
            const center = vadd(a.c, a.u, h * 0.5);
            modelGroup(`${id}-support-${i}-${side < 0 ? "l" : "r"}`, {
              center, size, basis: [a.r, a.u, a.t],
            }, (stage) => {
              TrackGeom.addBox(stage, center, size, col, [a.r, a.u, a.t]);
            }, { required: true });
          }
        }
      };

      // ---- Night colour palette ----
      // Windows: cool fluorescent / cyan office dominant (warm floods stay on tarmac)
      const WIN_WARM = [1.00, 0.88, 0.68];   // warm incandescent (hotels only)
      const WIN_COOL = [0.68, 0.78, 0.98];   // cool fluorescent
      const WIN_CYAN = [0.55, 0.90, 1.00];   // bright cyan glass
      const WIN_GOLD = [1.00, 0.80, 0.40];   // golden hotel windows
      // Neon signage (vivid, high-saturation)
      const NEON = [
        [1.00, 0.20, 0.85],   // magenta
        [0.20, 0.92, 1.00],   // cyan
        [1.00, 0.75, 0.10],   // amber
        [0.60, 0.30, 1.00],   // violet
      ];
      // Building wall colours — dark but readable (not near-black)
      const WALL_CBD  = [0.18, 0.20, 0.30];  // dark blue-grey CBD glass
      const WALL_LITE = [0.22, 0.24, 0.34];  // slightly lighter near tower
      const WALL_WARM = [0.26, 0.22, 0.18];  // warm concrete hotel
      // ===================================================================
      // UNDERPASS PORTALS — Sheares Bridge (s≈0.10) + finish under-grandstand
      // (s≈0.93–0.98). Dark soffit beat unique to Marina Bay night racing.
      // ===================================================================
      makePortal("sheares", 0.085, 0.115, { h: 7.4, gap: 2.2 });
      makePortal("finish-underpass", 0.925, 0.985, { h: 6.8, gap: 2.4 });

      // ===================================================================
      // FAR SILHOUETTE BAND — fills sky behind near facades; anchored far
      // enough (340+ m) that it never clips near geometry. backdrop()
      // auto-adds window bands for night circuits so these aren't flat slabs.
      // Reduced to 48 instances (was 80) since window bands add geometry;
      // staggered distances give depth layering without redundancy.
      // ===================================================================
      {
        const N = 48;
        for (let i = 0; i < N; i++) {
          const k  = K(i / N);
          const sd = (i % 2) ? 1 : -1;
          const w  = 34 + hash(i * 5) * 40;
          const h  = 70 + hash(i * 9) * 130;
          backdrop(k, sd,  340 + hash(i * 13) * 200, [w, h, 28], [0.08, 0.09, 0.18]);
          // Mid-distance spire on opposite side — depth layering, 260–360 m band
          if (i % 4 === 0) {
            backdrop(k, -sd, 260 + hash(i * 17) * 100, [w * 0.65, h * 1.15, 24], [0.07, 0.08, 0.17]);
          }
        }
      }

      // ===================================================================
      // NEAR CBD FACADE WALLS — cityFront() produces aligned street-canyon
      // facades. PERFORMANCE NOTE: SwiftShader (software renderer) is ~200×
      // slower than GPU. step=44 m and limited coverage keeps building count
      // comparable to the original loop (~80 buildings vs. 112 in old band).
      // The far backdrop() layer handles the rest of the horizon.
      // ===================================================================
      // Right side: the Republic Boulevard canyon. These facades used to stand
      // 106 m off the barrier, which is not what Marina Bay looks like from the
      // car — the CBD towers rise straight off the pavement there, and at 106 m
      // the whole row read as horizon haze. gap 20 puts the street wall where
      // the driver actually sees it.
      cityFront(0.90, 0.16, 1, 20, {
        minH: 55, maxH: 165, depth: 28, lit: true,
        palette: [WALL_CBD, WALL_LITE, WALL_CBD, [0.16, 0.18, 0.26]],
        windowCol: WIN_CYAN, floor: 18, step: 44,
      });
      // s 0.16–0.35 R is open bay (waterBand + Marina Bay Sands beyond), so
      // that stretch keeps its across-the-water setback.
      cityFront(0.16, 0.35, 1, 104, {
        minH: 55, maxH: 165, depth: 28, lit: true,
        palette: [WALL_CBD, WALL_LITE, WALL_CBD, [0.16, 0.18, 0.26]],
        windowCol: WIN_CYAN, floor: 18, step: 62,
      });
      // Left side: colonial district & back-straights — inland, street-tight.
      cityFront(0.00, 0.20, -1, 18, {
        minH: 26, maxH: 90, depth: 22, lit: true,
        palette: [WALL_WARM, WALL_CBD, [0.20, 0.18, 0.24], WALL_LITE],
        windowCol: WIN_WARM, floor: 14, step: 44,
      });
      cityFront(0.48, 0.88, -1, 18, {
        minH: 26, maxH: 95, depth: 22, lit: true,
        palette: [WALL_WARM, [0.22, 0.20, 0.26], WALL_CBD, WALL_LITE],
        floor: 14, step: 48,
      });

      // ===================================================================
      // s 0.18 R — MARINA BAY SANDS: 3 towers + skypark slab
      // Outer towers tip toward centre under the boat deck (postcard lean).
      // Towers spaced so faces never intersect; skypark bridges the tops.
      // ===================================================================
      {
        const k    = K(0.18);
        const a    = anchor(k, 1, 150);
        const wall = [0.82, 0.84, 0.90];
        const winC = [0.62, 0.80, 1.00];    // strong blue-white façade glow
        const H      = 200;
        const gap    = 36;    // centre-to-centre distance between tower bases
        const TOWERW = 18;
        const LEAN   = 0.13;  // lateral tip per metre of height (~7.5°) toward centre
        const tops   = [];

        modelGroup("marina-bay-sands", {
          center: vadd(a.c, a.u, H * 0.5 + 4),
          size: [100, H + 16, 40],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
        for (let t = -1; t <= 1; t++) {
          const base = vadd(a.c, a.r, t * gap);
          // Outer towers lean inward (toward mid); centre stays vertical.
          const tip = t === 0 ? 0 : -t * LEAN;   // t=-1 → +r, t=+1 → −r
          let uT = a.u, rT = a.r, tT = a.t;
          if (tip !== 0) {
            // Tilted up-axis: blend track-up with lateral tip toward centre
            const len = Math.hypot(a.u[0] + a.r[0] * tip, a.u[1], a.u[2] + a.r[2] * tip) || 1;
            uT = [(a.u[0] + a.r[0] * tip) / len, a.u[1] / len, (a.u[2] + a.r[2] * tip) / len];
            // Keep right roughly horizontal / orthogonal to lean plane
            rT = a.r;
            tT = a.t;
          }
          const b = [rT, uT, tT];
          const mid = vadd(base, uT, H * 0.5);
          // Main shaft
          TrackGeom.addBox(stage, mid,                         [TOWERW, H, 28],               wall,               b);
          // Window glazing face — slightly proud of the wall, covers 70% of height
          TrackGeom.addBox(stage, vadd(base, uT, H * 0.52),    [TOWERW + 0.6, H * 0.76, 28.6], winC,               b);
          // Vertical lit fin, alternating blue & gold for night detail
          const finCol = t === 0 ? [0.90, 0.75, 0.30] : [0.40, 0.65, 1.00];
          TrackGeom.addBox(stage, vadd(base, uT, H * 0.50),    [2.0, H * 0.60, 29.2],         finCol,             b);
          // Bright crown at top of each tower
          TrackGeom.addBox(stage, vadd(base, uT, H * 0.92),    [TOWERW + 1, H * 0.10, 29],    [0.92, 0.95, 1.00], b);
          tops.push(vadd(base, uT, H));
        }

        // Skypark slab bridging all three tops (boat hull profile)
        const mid = tops[1];
        // Span follows leaned tops (outers closer together at the crown)
        const spanR = Math.hypot(tops[2][0] - tops[0][0], tops[2][2] - tops[0][2]);
        const skyW  = Math.max(spanR + TOWERW, gap * 2 + TOWERW * 0.7);
        // Main slab — lighter warm sand colour (the real MBS deck is sand-coloured)
        TrackGeom.addBox(stage, vadd(mid, a.u, 3.5), [skyW, 3.5, 32],      [0.86, 0.82, 0.74], [a.r, a.u, a.t]);
        // Glowing neon rim — the iconic cyan strip seen from every angle
        TrackGeom.addBox(stage, vadd(mid, a.u, 6.0), [skyW + 1, 1.2, 32],  NEON[1],             [a.r, a.u, a.t]);
        // Rooftop pool and garden strip — warm amber
        TrackGeom.addBox(stage, vadd(mid, a.u, 5.5), [skyW - TOWERW + 4, 0.8, 10], WIN_GOLD,   [a.r, a.u, a.t]);
        }, { required: true });
      }

      // ===================================================================
      // s 0.22 R — ARTSCIENCE MUSEUM: white lotus — 5 separated petal cones
      // Petals spaced 15 m apart (diameter 14 m each) so they don't overlap.
      // ===================================================================
      {
        const k       = K(0.22);
        const a       = anchor(k, 1, 90);
        const PETAL_H = 24;
        const BASE_R  = 22;   // ring radius for petal centres — petal rad=6 m so no overlap
        for (let i = 0; i < 5; i++) {
          const ang   = (i / 5) * Math.PI * 2 + 0.3;
          const dx    = Math.cos(ang) * BASE_R * 0.65;
          const dz    = Math.sin(ang) * BASE_R * 0.65;
          const pc    = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                         a.c[1],
                         a.c[2] + a.r[2] * dx + a.t[2] * dz];
          // Outer white shell
          addCone(out, vadd(pc, a.u, PETAL_H * 0.5), 6.5, PETAL_H,       [0.94, 0.95, 0.97], 9, [a.r, a.u, a.t]);
          // Inner warm-lit face (slightly smaller, glows like up-lit marble)
          addCone(out, vadd(pc, a.u, PETAL_H * 0.58), 4.8, PETAL_H * 0.6, [1.00, 0.92, 0.76], 8, [a.r, a.u, a.t]);
        }
        // Central podium stem
        addCyl(out, vadd(a.c, a.u, 3), 5, 9, [0.82, 0.82, 0.86], 7, [a.r, a.u, a.t]);
        // Rim accent glow at ground level
        addBox(out, vadd(a.c, a.u, 1.5), [BASE_R * 2 + 4, 0.6, BASE_R * 2 + 4], [0.70, 0.65, 0.50], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.26 R — GARDENS BY THE BAY SUPERTREES: 11 trees, offset laterally
      // so canopies (rad ~14-18 m) don't overlap; two staggered rows.
      // ===================================================================
      {
        const k = K(0.26);
        // Row A: 6 trees along track direction, spread 16 m apart laterally
        // Row B: 5 trees inset 20 m further back, staggered between row A
        for (let i = 0; i < 11; i++) {
          const rowB  = i >= 6;
          const idx   = rowB ? i - 6 : i;
          const rowDist = rowB ? 90 : 70;
          // Lateral stagger: each tree is 17 m apart along the row
          const latOff = (idx - (rowB ? 2 : 2.5)) * 17;
          const depOff = rowB ? (idx % 2) * 10 : 0;
          const a    = anchor(k, 1, rowDist + depOff);
          const c    = vadd(a.c, a.r, latOff);
          const h    = 28 + (idx % 4) * 9;
          const capR = 13 + (idx % 2) * 4;
          // Trunk (dark green)
          addCyl(out, vadd(c, a.u, h * 0.5), 2.2, h, [0.15, 0.36, 0.20], 7, [a.r, a.u, a.t]);
          // Main canopy cap — vivid NEON colour
          addCone(out, vadd(c, a.u, h + 3), capR, 8, NEON[(i % 2) ? 0 : 3], 9, [a.r, a.u, a.t]);
          // Upper secondary glow
          addCone(out, vadd(c, a.u, h + 9), capR * 0.55, 5, NEON[(i + 1) % 4], 7, [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.34 L — mid-rise hotels with vivid neon billboards
      // Buildings spaced 28 m apart (w=24 → clear gap 4 m) so no overlap.
      // ===================================================================
      {
        const k = K(0.34);
        // 5 buildings: inner face starts at 42 m + (i*28) to give clear spacing
        for (let i = 0; i < 5; i++) {
          const gap = 42 + i * 28;
          building(k, -1, gap, 24, 44 + i * 10, 24, {
            wall:   WALL_WARM,
            window: i % 2 ? WIN_WARM : WIN_COOL,
            floor:  14,
          });
        }
        // Neon billboards at the kerb
        billboard(k,         -1, 12, 20, 12, NEON[0]);
        billboard(K(0.355),  -1, 11, 18, 11, NEON[1]);
        billboard(K(0.37),   -1, 10, 16, 10, NEON[2]);
        billboard(K(0.38),   -1, 10, 17, 11, NEON[3]);
      }

      // ===================================================================
      // s 0.43–0.50 R — distant skyline across the bay (waterfront towers).
      // These are the far-distance buildings seen across Marina Bay itself —
      // backdrop() puts them at 200+ m so they sit well behind the near
      // cityFront() facades at 100 m. backdrop() auto-adds window bands
      // for night circuits so each slab reads as a lit tower face.
      // ===================================================================
      for (let i = 0; i < 6; i++) {
        const dist = 205 + i * 38;   // stepped 200–410 m — no overlap possible
        backdrop(K(0.45), 1, dist, [42, 60 + hash(i * 13) * 90, 30], [0.09, 0.10, 0.20]);
      }

      // Bay water reflection streaks — flat bright strips just above water level.
      // Placed at dist > 38 m so they sit beyond the barriers.
      for (const s of [0.20, 0.28, 0.38, 0.46, 0.80, 0.88]) {
        const a = anchor(K(s), 1, 44);
        for (let i = 0; i < 10; i++) {
          const c   = vadd(vadd(a.c, a.t, (i - 4) * 11), a.u, 0.5);
          const hue = (i + Math.round(s * 17)) % 4;
          // brighter reflection: 0.45-0.65 intensity range (was 0.35)
          const inten = 0.45 + Math.sin(i * 0.8) * 0.20;
          const col   = [NEON[hue][0] * inten, NEON[hue][1] * inten, NEON[hue][2] * inten];
          addBox(out, c, [8, 0.4, 3], col, [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.55 L — FULLERTON HOTEL: wide warm-uplit neoclassical block.
      // The real Fullerton is a grand Palladian building (former GPO) with a
      // wide colonnade base, warm cream-limestone walls and a flat roofline.
      // building() with arch:"flat" preserves that horizontal massing; warm
      // window tones reflect the hotel's warm interior lighting.
      // ===================================================================
      {
        const k = K(0.55);
        building(k, -1, 18, 48, 26, 34, {
          wall:   [0.82, 0.74, 0.56],   // warm limestone/cream façade
          window: WIN_GOLD,              // hotel interior — warm gold windows
          floor:  5,                     // tall neoclassical storeys
          lit:    true,
          arch:   "flat",               // keep the iconic horizontal roofline
        });
        // Ground-level colonnade warm uplighting strip (the Fullerton's signature
        // amber wash that makes the columns glow at night)
        {
          const a = anchor(k, -1, 42);
          addBox(out, vadd(a.c, a.u, 2.5), [50, 4.5, 36], [1.00, 0.82, 0.50], [a.r, a.u, a.t]);
          // Upper cornice band — bright cream highlight
          addBox(out, vadd(a.c, a.u, 26.5), [49, 1.8, 35], [1.00, 0.92, 0.68], [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.62 — ANDERSON BRIDGE: arched truss over the Singapore River
      // (two separate bridge sides, ribs spaced 10 m apart — no overlap)
      // ===================================================================
      {
        const k = K(0.62);
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 4);
          for (let j = 0; j < 5; j++) {
            const c = vadd(a.c, a.t, (j - 2) * 10);  // 10 m spacing — ribs are 2 m wide
            addPrism(out, vadd(c, a.u, 7),  [2.2, 4.5, 9], [0.88, 0.88, 0.92], [a.r, a.u, a.t]);
            addCyl(out,   vadd(c, a.u, 3.5), 0.55, 7, [0.80, 0.80, 0.85], 5, [a.r, a.u, a.t]);
          }
          // Decorative bridge-lamp posts on the railing
          for (let j = 0; j < 3; j++) {
            const c = vadd(a.c, a.t, (j - 1) * 18);
            addCyl(out, vadd(c, a.u, 3), 0.12, 4.5, [0.72, 0.72, 0.75], 5, [a.r, a.u, a.t]);
            addBox(out, vadd(c, a.u, 4.6), [0.6, 0.6, 0.6], WIN_WARM, [a.r, a.u, a.t]);
          }
        }
      }

      // ===================================================================
      // s 0.66 L — ESPLANADE "Durian": two spiky domed shells
      // Spaced 28 m apart (dome radius ~18 m → 10 m clear gap).
      // ===================================================================
      {
        const k = K(0.66);
        const DOME_SEP = 28;   // centre-to-centre; each dome rad ~14 m so no overlap
        for (let i = 0; i < 2; i++) {
          // The offset along track direction ensures clear spacing
          const a = anchor(k, -1, 44 + i * DOME_SEP);
          // Grey aluminium shell
          addCone(out, vadd(a.c, a.u, 10), 16, 15, [0.52, 0.48, 0.40], 7, [a.r, a.u, a.t]);
          // Glowing spiky crown (amber neon)
          addCone(out, vadd(a.c, a.u, 21), 8.5, 9,  NEON[2], 6, [a.r, a.u, a.t]);
        }
        // Esplanade ribs — 8 thin vertical fins around each dome
        for (let i = 0; i < 2; i++) {
          const a = anchor(k, -1, 44 + i * DOME_SEP);
          for (let r = 0; r < 8; r++) {
            const ang = (r / 8) * Math.PI * 2;
            const dx  = Math.cos(ang) * 14;
            const dz  = Math.sin(ang) * 14;
            const rc  = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                         a.c[1],
                         a.c[2] + a.r[2] * dx + a.t[2] * dz];
            addBox(out, vadd(rc, a.u, 7.5), [0.9, 15, 0.9], [0.56, 0.52, 0.44], [a.r, a.u, a.t]);
          }
        }
        // Waterfront promenade terrace in front of Esplanade
        const ta = anchor(k, -1, 26);
        addBox(out, vadd(ta.c, ta.u, 0.3), [40, 0.5, 55], [0.30, 0.28, 0.24], [ta.r, ta.u, ta.t]);
      }

      // s 0.70 L — The Padang: dark open field (lawn)
      place(K(0.70), -1, 46, [70, 1.5, 70], [0.06, 0.10, 0.06]);

      // ===================================================================
      // s 0.714 L — NATIONAL GALLERY / former SUPREME COURT–CITY HALL:
      // a large cream neoclassical colonnaded civic block with a low dome,
      // set back beyond the Padang lawn. Previously a total landmark gap on
      // a lap that already nails Fullerton, the Merlion and Marina Bay
      // Sands. Silhouette-only: colonnade row + pediment + a shallow dome
      // on one wing (the former Supreme Court rotunda).
      // ===================================================================
      {
        const k = K(0.714);
        const a = anchor(k, -1, 100);
        const CREAM    = [0.82, 0.76, 0.58];
        const CREAM_HI = [0.90, 0.85, 0.70];
        const W = 46, H = 20, D = 64;   // W: depth away from road, D: frontage length
        // Main civic block
        addBox(out, vadd(a.c, a.u, H * 0.5), [W, H, D], CREAM, [a.r, a.u, a.t]);
        // Colonnade — a row of columns along the road-facing front, raised on
        // a low base course.
        const COLN = 10;
        for (let i = 0; i < COLN; i++) {
          const off = (i - (COLN - 1) / 2) * (D * 0.82 / (COLN - 1));
          const c = vadd(vadd(a.c, a.r, W * 0.44), a.t, off);
          addCyl(out, vadd(c, a.u, H * 0.28), 1.0, H * 0.56, CREAM_HI, 8, [a.r, a.u, a.t]);
        }
        // Pediment over the central portico
        addPrism(out, vadd(vadd(a.c, a.r, W * 0.44), a.u, H * 0.60),
          [W * 0.30, H * 0.20, D * 0.42], CREAM_HI, [a.r, a.u, a.t]);
        // Low dome on one wing (the former Supreme Court rotunda)
        {
          const domeC = vadd(vadd(a.c, a.t, D * 0.30), a.u, H);
          addCyl(out, domeC, 8.5, 2.6, CREAM_HI, 12, [a.r, a.u, a.t]);
          addCone(out, vadd(domeC, a.u, 2.6), 7.6, 4.4, CREAM, 12, [a.r, a.u, a.t]);
          addCyl(out, vadd(domeC, a.u, 7.4), 0.5, 2.0, CREAM_HI, 6, [a.r, a.u, a.t]);
        }
        // Warm uplighting wash at the base — a civic building lit at night,
        // matching the amber treatment already used at Fullerton.
        addBox(out, vadd(vadd(a.c, a.r, W * 0.44), a.u, 1.2), [1.4, 2.4, D * 0.9],
          [1.00, 0.90, 0.66], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.703 R — SINGAPORE CRICKET CLUB pavilion, opposite the Padang
      // lawn: a small white colonial box with a cupola. The Padang used to
      // be just a flat dark slab on one side of the road with nothing
      // answering it on the other.
      // ===================================================================
      {
        const k = K(0.703);
        const a = anchor(k, 1, 34);
        const WHITE_COL = [0.88, 0.87, 0.84];
        // Low colonial box with a shaded veranda roof overhang
        addBox(out, vadd(a.c, a.u, 4.0), [16, 8, 24], WHITE_COL, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.4), [18, 0.6, 26], [0.30, 0.32, 0.34], [a.r, a.u, a.t]);
        // Veranda posts along the road-facing front
        for (const off of [-9, -3, 3, 9]) {
          const c = vadd(vadd(a.c, a.r, 7.6), a.t, off);
          addCyl(out, vadd(c, a.u, 3.4), 0.3, 6.8, WHITE_COL, 6, [a.r, a.u, a.t]);
        }
        // Small central cupola + spire
        const cupC = vadd(a.c, a.u, 8.9);
        addCyl(out, cupC, 1.8, 1.6, WHITE_COL, 8, [a.r, a.u, a.t]);
        addCone(out, vadd(cupC, a.u, 1.6), 1.6, 2.2, [0.30, 0.32, 0.34], 8, [a.r, a.u, a.t]);
        addCyl(out, vadd(cupC, a.u, 3.6), 0.1, 1.4, WHITE_COL, 4, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.80 R — HELIX BRIDGE: glowing double-helix lattice arc
      // 16 arc segments; each node uses track basis so no floating geometry.
      // ===================================================================
      {
        const k = K(0.80);
        const a = anchor(k, 1, 32);
        for (let j = 0; j < 16; j++) {
          const t2  = j / 15;
          const ang = t2 * Math.PI;
          const up  = Math.sin(ang) * 13;
          const c   = vadd(vadd(a.c, a.t, (t2 - 0.5) * 66), a.u, up + 2);
          // Main structural tube
          addCyl(out, c, 2.4, 4.4, [0.88, 0.90, 0.95], 6, [a.r, a.u, a.t]);
          // Side lattice bar
          addBox(out, vadd(c, a.r, Math.sin(t2 * 11) * 5.5), [0.9, 1.4, 1.6], [0.86, 0.88, 0.93], [a.r, a.u, a.t]);
          // Helix crossbar
          if (j % 2 === 0)
            addBox(out, vadd(c, a.t, Math.cos(t2 * 7) * 3.5), [0.7, 1.1, 5.2], [0.83, 0.85, 0.90], [a.r, a.u, a.t]);
          // Vivid night accent lights on the helix nodes (cyan)
          if (j % 3 === 0) {
            addBox(out, vadd(vadd(c, a.r,  3.2), a.u, 0.8), [0.5, 0.5, 0.5], NEON[1], [a.r, a.u, a.t]);
            addBox(out, vadd(vadd(c, a.r, -3.2), a.u, 0.8), [0.5, 0.5, 0.5], NEON[1], [a.r, a.u, a.t]);
          }
        }
      }

      // s 0.86 R — SINGAPORE FLYER. The shared wheel is a true vertical ring;
      // the old bespoke model accidentally laid its rim flat in the XZ plane.
      ferrisWheel(K(0.86), 1, 58, 44);

      // ===================================================================
      // s 0.92–0.05 — pit straight: neon billboard funnel back to start,
      // pit-lane building wall L (Paddock Club / pit hospitality suites),
      // and pit lane perimeter fencing. cityFront() for the L-side pit
      // complex gives proper aligned office / hospitality massing.
      // ===================================================================
      {
        billboard(K(0.92),  1,  11, 18, 11, NEON[3]);
        billboard(K(0.92), -1,  11, 18, 11, NEON[2]);
        billboard(K(0.94),  1,  10, 16, 10, NEON[1]);
        billboard(K(0.94), -1,  10, 16, 10, NEON[0]);
        billboard(K(0.96),  1,  10, 16, 10, NEON[0]);
        billboard(K(0.96), -1,  10, 17, 11, NEON[3]);
        billboard(K(0.98),  1,  10, 15, 10, NEON[2]);
      }
      // Pit straight L — Paddock Club / media centre (warm lit suites)
      // Gap=14m + step=28m keeps buildings clear of the pit lane wall.
      cityFront(0.955, 0.04, -1, 14, {
        minH: 12, maxH: 24, depth: 16, lit: true,
        palette: [WALL_WARM, [0.24, 0.22, 0.18], WALL_WARM, [0.20, 0.19, 0.16]],
        windowCol: WIN_WARM, floor: 4, step: 28,
      });

      // ===================================================================
      // WATERFRONT PROMENADE GLOW STRIPS — warm illuminated window bands
      // on the harbourfront walk (s 0.18–0.45 and 0.80–0.88).
      // Pushed out to 24 m so they sit beyond the kerb/barrier.
      // ===================================================================
      for (const s of [0.20, 0.30, 0.42, 0.82, 0.88]) {
        const a = anchor(K(s), 1, 24);
        addBox(out, vadd(a.c, a.u, 3.0), [3.5, 1.8, 28], WIN_WARM, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 0.8), [3.8, 1.2, 28], NEON[1],  [a.r, a.u, a.t]);
      }

      // ===================================================================
      // BAY WATER — dark mirror used by the typed reflective-water model below.
      // ===================================================================
      const BAY = [0.06, 0.08, 0.14];

      // ===================================================================
      // FLOODLIGHT MASTS — one intentional warm-white ring. Shared generic
      // floodlights are excluded above, avoiding duplicate poles and pools.
      // ===================================================================
      // ~1600 projectors on masts down both kerbs is the defining look of the
      // Singapore night race; a 75 m spacing left long unlit-looking gaps.
      floodMastRing(38, { h: 24, dist: 11, cool: false, pool: true, arms: 3 });

      // ===================================================================
      // MAIN STRAIGHT — continuous glass Pit Building (L) + race-control
      // tower, Float@Marina Bay grandstands (R), start gantry, marshal posts.
      // The real Pit Building is one continuous ~350 m three-storey glass
      // structure, not five detached garage sheds — circuitKit.pitBuilding
      // gives it real garage-bay rhythm under a single roofline. The
      // race-control tower is a proper circuitKit facility (replacing the old
      // hand-rolled timing-tower boxes), sharing the pit precinct's cool-glass
      // palette set via sceneryThemeOverrides at the top of this file.
      // ===================================================================
      if (circuitKit) {
        circuitKit.pitBuilding({
          id: "kit:singapore:pit-building", frac: 0.989, side: -1, gap: 11,
          size: [22, 16, 350], garages: 24, style: "flat", required: true,
        });
        // Thin cyan glazing bands — one per storey — read as a lit curtain
        // wall at night against the 350 m frontage they dress. Cheap: three
        // long thin boxes rather than per-bay glazing.
        {
          const a = anchor(K(0.989), -1, 11);
          for (const yy of [4.0, 8.6, 13.2]) {
            addBox(out, vadd(a.c, a.u, yy), [0.7, 2.6, 340], WIN_CYAN, [a.r, a.u, a.t]);
          }
        }
        // Race-control tower, set back behind the pit building roofline.
        circuitKit.raceControl({
          id: "kit:singapore:pit-race-control", frac: 0.989, side: -1, gap: 46,
          size: [14, 34, 16], required: true,
        });
        // Beacon light on the race-control roof — a landmark visible from
        // across the venue, echoing the old hand-rolled tower's night glow.
        {
          const a = anchor(K(0.989), -1, 53);
          addCone(out, vadd(a.c, a.u, 35), 2.2, 6, NEON[1], 6, [a.r, a.u, a.t]);
        }
      }

      // Grandstands on the right of the main straight — the hero stand faces
      // the new glass Pit Building, so it gets the full three-tier treatment
      // (scaffold livery, matching Singapore's temporary-structure look);
      // its neighbours step down in tier count and rotate liveries so the
      // straight doesn't read as one repeated box.
      grandstandEx(0.99,  1, 12, 62, null, null,
        { livery: "scaffold", tiers: 3, roof: "truss", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.02,  1, 12, 62, null, null,
        { livery: "teal", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.05,  1, 12, 50, null, null,
        { livery: "darkSteel", tiers: 1, roof: "flat" });
      grandstandEx(0.70, -1, 30, 48, null, null,
        { livery: "scaffold", tiers: 2, roof: "truss", endWalls: true });

      // Start/finish gantry + halfway scoring gantry
      gantry(0.0, 7.5, [0.12, 0.12, 0.16]);
      gantry(0.5, 7.0, [0.12, 0.12, 0.16]);
      // Lit start-light cluster is an explicit safe overhead model.
      overheadSpan({
        id: "start-light-cluster", frac: 0, clearance: 6.9,
        thickness: 1.4, depth: 0.9, span: 4.5,
        color: [0.95, 0.05, 0.05], required: true, supports: false,
      });

      // ===================================================================
      // MARSHAL POSTS at corner approaches
      // ===================================================================
      for (const s of [0.07, 0.16, 0.28, 0.36, 0.47, 0.60, 0.68, 0.76, 0.84, 0.94]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 7);
      }

      // ===================================================================
      // CATCH FENCES — street-circuit look, both sides, broken into spans.
      // ===================================================================
      for (const [s0, s1, side] of [
        [0.00, 0.18, -1], [0.20, 0.40, -1], [0.42, 0.62, -1], [0.64, 0.85, -1], [0.87, 0.99, -1],
        [0.00, 0.16,  1], [0.30, 0.44,  1], [0.55, 0.66,  1], [0.92, 0.99,  1],
      ]) {
        // Sit behind the 1.2 m concrete wall rather than sharing its edge.
        fence(s0, s1, side, 3.0, 3.4, [0.66, 0.70, 0.78]);
      }
      // Marina Bay is fenced end to end; the runs above left most of the
      // right-hand side bare. Close them.
      for (const [s0, s1, side] of [
        [0.17, 0.29,  1], [0.45, 0.54,  1], [0.67, 0.79,  1], [0.80, 0.91,  1],
        [0.185, 0.195, -1], [0.405, 0.415, -1], [0.625, 0.635, -1],
      ]) fence(s0, s1, side, 3.0, 3.4, [0.66, 0.70, 0.78]);

      // ===================================================================
      // TYRE WALLS at tight 90-degree apex/exit kerbs
      // ===================================================================
      for (const [s0, s1, side] of [
        [0.085, 0.10, 1], [0.235, 0.25, -1], [0.475, 0.49, -1],
        [0.66, 0.675,  1], [0.82, 0.835,  -1],
      ]) {
        tyreWall(s0, s1, side, 1.6, NEON[K(s0) % 4]);
      }

      // ===================================================================
      // TROPICAL PALMS & LANDSCAPING
      // ===================================================================
      every(26, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 5 + side) < 0.30) continue;
          palm(k, side, 8 + hash(k + side) * 5, 9 + hash(k * 2 + side) * 5, [0.18, 0.42, 0.20]);
        }
      });
      // Kept at the original spacing/offset: the generic street dressing puts a
      // 9 m-wide retail box centred 9 m out, so a denser shrub line here simply
      // grows through it.
      every(62, (k) => {
        if (hash(k * 9) < 0.60) return;
        bush(k, hash(k) < 0.5 ? -1 : 1, 8 + hash(k) * 5, [0.14, 0.36, 0.18]);
      });

      // ===================================================================
      // TRACKSIDE NEON SIGNAGE — collapsed from three overlapping billboard
      // passes (a 32-slot barrier ring, a scattered punctuation pass and a
      // corner-neon pass) that stacked near-identical geometry, worst around
      // s 0.90-0.98 where all three used to fire within a few metres of each
      // other. One varied pass now carries the same neon presence: hand-set
      // corner/straight positions (folded in from the old scattered + corner
      // passes) plus a sparse jittered ring filling the gaps between them —
      // never a mechanical 1-in-32 grid — and it explicitly skips s
      // 0.895-0.995, which the pit-straight funnel below already owns.
      // ===================================================================
      for (const [s, side, hue, w, h] of [
        [0.04,  1, 1, 16, 10], [0.08,  1, 2, 15, 9],  [0.14, -1, 0, 17, 10],
        [0.24, -1, 3, 14, 9],  [0.31,  1, 1, 18, 10], [0.36,  1, 0, 15, 9],
        [0.50, -1, 2, 16, 10], [0.53, -1, 1, 14, 9],  [0.58,  1, 3, 17, 10],
        [0.72,  1, 1, 15, 9],  [0.77,  1, 2, 18, 10],  [0.84, -1, 0, 16, 9],
      ]) {
        billboard(K(s), side, 11, w, h, NEON[hue]);
      }
      // Sparse ring filling the gaps between the hand-placed signs above —
      // under half the density of the old 32-slot grid, jittered so the
      // spacing reads as organic rather than a repeating pattern.
      {
        const RING_N = 14;
        for (let i = 0; i < RING_N; i++) {
          const sf = (i + 0.5 + (hash(i * 3.3) - 0.5) * 0.6) / RING_N;
          if (sf > 0.895 && sf < 0.995) continue;   // pit-straight funnel's stretch
          const side = hash(i * 1.7) < 0.5 ? -1 : 1;
          billboard(K(sf), side, 8, 10 + hash(i * 4.1) * 6, 4.5 + hash(i * 2.1) * 2, NEON[i % 4]);
        }
      }
      // Low continuous ad-hoarding run along the pit-straight barrier — a
      // different silhouette (waist-height boards on posts, not tall neon
      // panels) underneath the funnel billboards, instead of a third stack
      // of the same shape in the most crowded stretch of the lap.
      sponsorHoarding(0.895, 0.995, 1, 5, { h: 1.2, step: 11 });

      // Padang / Esplanade / Bay grandstand ring — Marina Bay seats ~40 000 and
      // the lap carries seventeen stands. These used to share two near-
      // identical hue formulas; now each rotates through Singapore's stand
      // set (STAND_SETS.singapore: scaffold/teal/darkSteel — temporary
      // scaffold decks, teal-accented permanent seating, dark steel bays)
      // with tier count varied by hash so the ring reads as a real venue
      // built up over years, not one template repeated seventeen times.
      const SGP_LIV = ["scaffold", "teal", "darkSteel"];
      let standIdx = 0;
      for (const [s, side, gap, len] of [
        [0.115, -1, 14, 52], [0.150,  1, 16, 46], [0.245, -1, 14, 48],
        [0.330, -1, 15, 44], [0.415,  1, 16, 50], [0.500, -1, 14, 46],
        [0.585,  1, 15, 48], [0.640, -1, 14, 44], [0.700,  1, 16, 46],
        [0.865, -1, 15, 50], [0.905,  1, 14, 48],
      ]) {
        const tiers = hash(K(s) * 3.1) < 0.35 ? 2 : 1;
        grandstandEx(s, side, gap, len, null, null, {
          livery: SGP_LIV[standIdx++ % SGP_LIV.length], tiers,
          roof: tiers > 1 ? "cantilever" : "truss",
          endWalls: hash(K(s) * 1.7) < 0.4,
        });
      }
      for (const [s, side, gap, len] of [
        [0.060, -1, 15, 44], [0.205,  1, 15, 42], [0.290,  1, 16, 44],
        [0.455, -1, 15, 42], [0.545,  1, 15, 44], [0.815, -1, 16, 46],
      ]) {
        const tiers = hash(K(s) * 2.3) < 0.3 ? 2 : 1;
        grandstandEx(s, side, gap, len, null, null, {
          livery: SGP_LIV[standIdx++ % SGP_LIV.length], tiers,
          roof: "cantilever",
          endWalls: hash(K(s) * 4.1) < 0.5,
        });
      }
      // Apex kerb flashes at the 90-degree corners.
      for (const [s, side] of [[0.09, 1], [0.24, -1], [0.36, 1], [0.48, -1],
                               [0.56, 1], [0.67, 1], [0.72, -1], [0.83, -1]]) {
        place(K(s), side, 2.2, [0.5, 0.22, 8], [0.86, 0.16, 0.16]);
        place(K(s), side, 3.2, [1.6, 0.18, 8], [0.92, 0.92, 0.94]);
      }

      // ===================================================================
      // CBD HERO TOWERS — tall tapered skyscrapers giving skyline depth.
      // Uses the tower() helper (frustum + cap + antenna mast) at 200–280 m
      // so they sit behind the cityFront() near facades. windowCol selects
      // alternating cyan / cool-blue to vary the night appearance.
      // ===================================================================
      for (const [s, side, seedOff] of [
        [0.12, -1, 0], [0.50, -1, 3], [0.58, 1, 6], [0.74, -1, 9], [0.06, 1, 12],
      ]) {
        const dist = 210 + hash(K(s) * 3 + seedOff) * 70;
        const H    = 160 + hash(K(s) * 3 + seedOff + 1) * 100;
        const winCol = hash(K(s)) < 0.5 ? WIN_CYAN : WIN_COOL;
        tower(K(s), side, dist, 28, H, {
          col:    WALL_CBD,
          cap:    true,
          capCol: winCol,
          mast:   18,
          seg:    8,
        });
        // Glowing antenna tip neon accent (cyan — distinctive Singapore night skyline)
        {
          const a = anchor(K(s), side, dist);
          addCone(out, vadd(a.c, a.u, H + 20), 3.0, 10, NEON[1], 6, [a.r, a.u, a.t]);
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // BESPOKE MARINA BAY WATERFRONT MODELS
      // ═══════════════════════════════════════════════════════════════════

      // ── Reflective Marina Bay water ──────────────────────────────────────
      // A true reflective buffer mirroring the lit skyline across the bay,
      // laid along the R (waterfront) side of the bay sections.
      // Bands, not two isolated 80 m panels on a bay that runs for hundreds of
      // metres — the water used to appear as a pair of rectangles adrift on
      // bare ground rather than as a waterfront.
      // Depth stays at the original 64 m — pushing the bay further out put the
      // waterfront towers in the water. Only the along-lap coverage changes.
      waterBand(0.26, 0.36, 1, 40, 104, 12, BAY, { id: "marina-water-30", required: true });
      waterBand(0.80, 0.90, 1, 40, 104, 12, BAY, { id: "marina-water-84", required: true });

      // ═══════════════════════════════════════════════════════════════════
      // 2026 SCENERY DRESS PASS — six bounded Marina Bay hero layers.
      // All structures use footprint-tested helpers and sit well beyond the
      // narrow street walls; fixed fractions keep the result deterministic.
      // ═══════════════════════════════════════════════════════════════════

      // 1) s 0.39–0.43 L — Raffles / City Hall illuminated hotel terrace.
      // Stepped setbacks preserve the braking-zone view while warm windows and
      // bright cornices distinguish the hotel district from the cool CBD glass.
      for (const [s, gap, w, h, d] of [
        [0.390, 34, 30, 48, 24],
        [0.410, 54, 34, 62, 26],
        [0.430, 76, 38, 76, 28],
      ]) {
        building(K(s), -1, gap, w, h, d, {
          wall: WALL_WARM, window: WIN_GOLD, floor: 6, lit: true, roof: true,
        });
        const a = anchor(K(s), -1, gap + w * 0.5);
        addBox(out, vadd(a.c, a.u, h + 0.9), [w + 1.2, 1.4, d + 1.2],
          [1.00, 0.88, 0.58], [a.r, a.u, a.t]);
      }

      // 2) s 0.46–0.52 R — layered financial-district crowns across the bay.
      // Three different depths create parallax behind the promenade rather
      // than another continuous facade wall.
      for (const [s, dist, baseW, h, capCol] of [
        [0.460, 150, 30, 138, WIN_CYAN],
        [0.490, 188, 34, 176, WIN_COOL],
        [0.520, 226, 28, 154, WIN_GOLD],
      ]) {
        tower(K(s), 1, dist, baseW, h, {
          col: WALL_CBD, cap: true, capCol, mast: 14, seg: 8,
        });
      }

      // 3) s 0.20 / 0.44 R — extra reflective water shelves and pier lights.
      // These overlap the bay visually, but remain separate bounded water
      // models so the waterfront has foreground, middle and far depth.
      for (const [s, gap, depth] of [[0.20, 52, 52], [0.44, 58, 58]]) {
        waterBand(s - 0.03, s + 0.03, 1, gap, gap + depth, 12, BAY, {
          id: `marina-water-depth-${Math.round(s * 100)}`,
        });
        const a = anchor(K(s), 1, 30);
        for (let i = -2; i <= 2; i++) {
          const c = vadd(vadd(a.c, a.t, i * 9), a.u, 1.2);
          addBox(out, c, [1.0, 2.0, 5.5], i % 2 ? WIN_GOLD : WIN_CYAN,
            [a.r, a.u, a.t]);
        }
      }

      // 4) s 0.735–0.785 — Padang / Esplanade spectator theatre.
      // Stands are staggered and kept 20+ m behind the walls, concentrating
      // crowd density at the civic hero sector without forming a blind canyon.
      // The Padang stand is the biggest of the three (two-tier, hospitality
      // suites) facing the National Gallery / Cricket Club precinct just up
      // the road; the Esplanade pair are smaller single-tier scaffold decks.
      grandstandEx(0.735, -1, 22, 54, null, null,
        { livery: "teal", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      grandstandEx(0.765,  1, 26, 48, null, null,
        { livery: "scaffold", tiers: 1, roof: "truss" });
      grandstandEx(0.785, -1, 24, 46, null, null,
        { livery: "darkSteel", tiers: 1, roof: "cantilever" });

      // 5) s 0.445 — Bayfront pedestrian link, high and shallow so it reads
      // as a bridge beat without blocking the skyline on corner approach.
      overheadSpan({
        id: "bayfront-pedestrian-link", frac: 0.445, clearance: 7.4,
        thickness: 0.8, depth: 2.6, supportGap: 4.2,
        color: [0.30, 0.48, 0.66],
      });

      // 6) s 0.50–0.57 and 0.70–0.78 — deliberate tropical boulevards.
      // Alternating palms and low shrubs form two sparse ranks; the inner rank
      // remains outside the barriers and no canopy is placed over sightlines.
      for (const [s, side] of [
        [0.500, -1], [0.525, -1], [0.550, -1], [0.575, -1],
        [0.705,  1], [0.730,  1], [0.755,  1], [0.780,  1],
      ]) {
        const k = K(s);
        const h = 10 + hash(k * 11) * 3;
        palm(k, side, 14, h, [0.18, 0.46, 0.22]);
        palm(k, side, 22, h + 2, [0.14, 0.38, 0.18]);
        bush(k, side, 10, [0.16, 0.40, 0.18]);
      }

      // ── THE MERLION — Singapore's icon: lion head + fish body + water jet ─
      // Placed on the bayfront (R) facing Marina Bay, spouting a cyan jet.
      {
        const a = anchor(K(0.58), 1, 34);
        if (!onTrack(a.c[0], a.c[2], 12)) {
          const b   = [a.r, a.u, a.t];
          const jetB = [a.t, a.r, a.u];    // 'up' slot = a.r → jet fires outward over water
          const WHITE = [0.92, 0.93, 0.95];
          const SHADE = [0.80, 0.82, 0.86];
          // Round plinth in the splash pool
          out._mat = MAT.CONCRETE;
          addCyl(out, vadd(a.c, a.u, 0.6), 7, 1.2, [0.60, 0.62, 0.66], 12, b);
          // Fish-body base: three stacked scale rings tapering up (curved body)
          addFrustum(out, vadd(a.c, a.u, 1.2), 6.2, 5.0, 5, WHITE, 10, b);
          addFrustum(out, vadd(a.c, a.u, 6.0), 5.0, 4.2, 5, SHADE, 10, b);
          addFrustum(out, vadd(a.c, a.u, 10.8), 4.2, 3.4, 5, WHITE, 10, b);
          // Upright chest/torso
          addBox(out, vadd(a.c, a.u, 16.5), [5.6, 5, 4.6], WHITE, b);
          // Lion head block + snout jutting toward the bay
          const head = vadd(a.c, a.u, 20.5);
          addBox(out, head, [5.2, 4.4, 4.6], WHITE, b);
          addBox(out, vadd(head, a.r, 3.0), [2.6, 2.4, 2.6], SHADE, b);   // snout
          // Mane — a ring of short cones around the head
          for (let m = 0; m < 8; m++) {
            const ang = (m / 8) * Math.PI * 2;
            const dx = Math.cos(ang) * 3.2, dz = Math.sin(ang) * 3.2;
            const mc = [head[0] + a.r[0] * dx + a.t[0] * dz, head[1] + 0.5, head[2] + a.r[2] * dx + a.t[2] * dz];
            addCone(out, mc, 1.1, 2.4, [0.86, 0.88, 0.92], 5, [a.r, a.u, a.t]);
          }
          // Ears
          for (const o of [-1.6, 1.6]) addCone(out, vadd(vadd(head, a.t, o), a.u, 2.6), 0.7, 1.6, WHITE, 5, b);
          out._mat = 0;
          // Water jet — a long tapering cyan cone arcing out over the bay
          const mouth = vadd(vadd(head, a.r, 2.4), a.u, 0.6);
          addCone(out, mouth, 0.9, 18, WIN_CYAN, 7, jetB);
          addCone(out, vadd(mouth, a.r, 16), 1.4, 3, [0.85, 0.95, 1.00], 7, jetB);   // splash burst
          // Splash pool + reflective disc at the base
          addCyl(out, vadd(a.c, a.u, 0.2), 12, 0.3, [0.08, 0.16, 0.24], 14, b);
          addBox(out, vadd(a.c, a.u, 0.4), [22, 0.15, 22], [0.40, 0.55, 0.65], b);
        }
      }

      // ── LIT HARBOUR BUMBOATS — small glowing boats on the bay water ──────
      const bumboat = (a, sc, glow) => {
        const b = [a.r, a.u, a.t];
        out._mat = MAT.WOOD;
        addBox(out, vadd(a.c, a.u, 0.8 * sc), [3.4 * sc, 1.4 * sc, 9 * sc], [0.30, 0.22, 0.16], b);
        addPrism(out, vadd(vadd(a.c, a.t, 4.4 * sc), a.u, 0.8 * sc), [3.4 * sc, 1.4 * sc, 1.6 * sc], [0.34, 0.24, 0.18], b);
        addBox(out, vadd(a.c, a.u, 2.4 * sc), [2.6 * sc, 1.8 * sc, 4 * sc], [0.42, 0.30, 0.20], b);  // cabin
        out._mat = 0;
        addBox(out, vadd(a.c, a.u, 2.6 * sc), [2.7 * sc, 0.7 * sc, 4.1 * sc], glow, b);              // lit windows
        // string of festive lights along the roofline
        for (let s = -2; s <= 2; s++) addBox(out, vadd(vadd(a.c, a.t, s * 1.4 * sc), a.u, 3.4 * sc), [0.3 * sc, 0.3 * sc, 0.3 * sc], s % 2 ? NEON[2] : NEON[1], b);
      };
      for (let i = 0; i < 6; i++) {
        const s = [0.24, 0.33, 0.42, 0.46, 0.83, 0.87][i];
        const a = anchor(K(s), 1, 30 + (i % 3) * 12 + hash(i * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 8)) continue;
        bumboat(a, 1.0 + hash(i * 5) * 0.6, i % 2 ? WIN_WARM : WIN_GOLD);
      }
    },
  }
  );
})();
