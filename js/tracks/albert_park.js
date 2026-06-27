/* Apex 26 — ALBERT PARK circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "albert_park",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.0925, // GPS-derived (OpenF1 2025, conf=0.201)
    name: "ALBERT PARK",
    gp: "Australian GP",
    country: "Australia",
    night: false,
    theme: "green",
    lengthKm: 5.3,
    baseHW: 7,
    pal: { zenith: [0.22, 0.44, 0.82], horizon: [0.76, 0.79, 0.82], grass: [0.28, 0.50, 0.24], runoff: [0.48, 0.42, 0.32], fogDensity: 0.0012, sunDir: [0.6666666666666667, 0.6666666666666667, 0.33333333333333337], sun: [1, 0.95, 0.8], sunColor: [1, 0.93, 0.78] },
    segs: [
      { t: 0, l: 300 }, { t: 50, l: 100 }, { t: -50, l: 90 }, { t: 65, l: 80 }, { t: 0, l: 200 }, { t: 80, l: 90 },
      { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 260 }, { t: 80, l: 90 }, { t: 0, l: 200 }, { t: 70, l: 80 },
    ],
    // Gentle parkland undulation: slight rise through the T11-T15 lakeside section,
    // then a dip back through the T1-T4 approach — mirrors Melbourne's actual terrain.
    elevations: [{ s: 0.12, halfM: 340, rise: 7 }, { s: 0.55, halfM: 300, rise: -5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, groundYAt,
              every, hash, onTrack,
              grandstand, building, tower, tree, palm, bush, hedge, billboard, gantry,
              marshalPost, fence, guardrail, tyreWall, anchor, vadd, addBox,
              addCyl, addCone, addFrustum, addPrism, addPyramid,
              forestEdge, cityFront } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (Melbourne lakeside parkland, bright day) ----
      const GRASS  = [0.32, 0.62, 0.28];
      const WATER  = [0.20, 0.45, 0.62];
      const WHITE  = [0.92, 0.92, 0.92], RED = [0.80, 0.15, 0.15];
      const SHELL  = [0.46, 0.47, 0.52], CROWD = [0.70, 0.60, 0.55];
      // Night-ready: bright warm window colour for CBD towers (glows at night)
      const CBD_WIN_LIT = [0.82, 0.78, 0.52];   // warm amber — lit office windows
      const CBD_WIN_DAY = [0.55, 0.65, 0.80];   // cool glass reflection (day)

      // ---- Track centre (for skyline / lake placement reference) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;

      // ====================================================================
      // ALBERT PARK LAKE — broad expanse of calm water dominating the circuit's
      // left side (s≈0.27–0.65 L). Multi-layered water planes with depth
      // and subtle shimmer. Far basin + near-shore ripple edge zones.
      // ====================================================================
      // Primary far-lake basin — deep water colour, broad expanse (reflective)
      groundPlane(k(0.45), -1, 100, [1300, 4, 1300], [0.16, 0.34, 0.52], true);
      groundPlane(k(0.38), -1, 120, [860,  4,  860], [0.18, 0.38, 0.56], true);
      groundPlane(k(0.58), -1, 110, [820,  4,  820], [0.18, 0.38, 0.56], true);
      // Shoreline transition zones — lighter, shimmer-edge tones
      groundPlane(k(0.50), -1,  55, [340, 4,  48], [0.26, 0.48, 0.64], true);
      groundPlane(k(0.48), -1,  42, [380, 4,  60], [0.28, 0.52, 0.66], true);
      // Infield water wrap (interior of circuit perimeter) — muted mid-tone
      for (let i = 0; i < 4; i++) {
        const s = 0.30 + (i / 4) * 0.30;
        groundPlane(k(s), -1, 115 + i * 8, [220, 4, 170], [0.22, 0.38, 0.52], true);
      }

      // ---- Moored rowboats + kayaks (s≈0.45–0.55 water edge) ----
      for (let j = 0; j < 6; j++) {
        const a = anchor((k(0.47 + j * 0.025) + j * 15) % n, -1, 54 + hash(j * 7) * 32);
        if (onTrack(a.c[0], a.c[2], 3)) continue;
        addBox(out, vadd(a.c, a.u, 0.8), [1.8, 1.0, 8.5], [0.88, 0.85, 0.80], [a.r, a.u, a.t]);
        if (hash(j * 11) > 0.5)
          addCyl(out, vadd(a.c, a.t, -0.5), 0.08, 5.2, [0.40, 0.35, 0.28], 4, [a.r, a.u, a.t]);
      }

      // ====================================================================
      // MELBOURNE CBD SKYLINE — dense layered towers across the lake
      // (s≈0.19–0.52 R). Iconic landmarks dominate; mid-rise base with varied
      // window colour. All towers placed at dist≥190 so they stay well clear.
      // Night-ready: window bands use CBD_WIN_LIT (warm amber) for glow.
      // ====================================================================
      const CBD_N = 42, CBD_S0 = 0.19, CBD_S1 = 0.51;
      for (let i = 0; i < CBD_N; i++) {
        const f = i / (CBD_N - 1);
        const s = CBD_S0 + f * (CBD_S1 - CBD_S0);
        const dist = 230 + hash(i * 7) * 100;
        const w = 16 + hash(i * 3) * 14;
        const h = 70 + hash(i * 11) * 150;
        const wallCol = [0.28 + hash(i * 5) * 0.12, 0.34 + hash(i * 2) * 0.10, 0.50 + hash(i * 4) * 0.06];
        const winCol = (hash(i * 19) > 0.45) ? CBD_WIN_LIT : CBD_WIN_DAY;
        building(k(s), 1, dist - w / 2, w, h, w, {
          wall: wallCol, window: winCol, floor: 6,
          setback: hash(i * 13) > 0.50, roof: hash(i * 17) > 0.60,
        });
      }
      // Iconic signature towers: Eureka Tower + Rialto dominate the skyline
      for (const [s, dist, bw, th, mast] of [
        [0.26, 290, 30, 270, 42],   // Eureka-like iconic spire — tallest
        [0.34, 270, 26, 230, 28],   // Rialto-like tower — second major landmark
        [0.41, 300, 28, 250,  0],   // further eastern major tower
        [0.21, 280, 24, 200, 35],   // mid-range signature
        [0.47, 285, 26, 220, 22],   // eastern precinct anchor
      ]) {
        tower(k(s), 1, dist, bw, th, { col: [0.30, 0.38, 0.50], seg: 8,
          cap: true, capCol: [0.20, 0.28, 0.40], mast });
      }
      // Far-horizon silhouette band — distant CBD depth layer (grey-blue so
      // backdrop() renders them as city towers with window bands, not green mounds)
      for (let i = 0; i < 10; i++) {
        const f = i / 9;
        const bh = 55 + hash(i * 13) * 110;   // 55–165 m tower heights
        const bw = 28 + hash(i * 9) * 24;      // 28–52 m wide
        backdrop(k(CBD_S0 - 0.03 + f * (CBD_S1 - CBD_S0 + 0.06)), 1,
                 390 + hash(i * 5) * 120,
                 [bw, bh, 26],
                 [0.36 + hash(i * 7) * 0.08, 0.40 + hash(i * 3) * 0.06, 0.52 + hash(i * 11) * 0.06]);
      }
      // Mid-rise foreground layer — lighter, Yarra riverside buildings
      for (let i = 0; i < 18; i++) {
        const f = i / 17;
        const s = CBD_S0 + f * (CBD_S1 - CBD_S0);
        const w = 22 + hash(i * 31) * 16, h = 38 + hash(i * 37) * 45;
        const winFg = (i % 3 === 1) ? CBD_WIN_LIT : [0.56, 0.66, 0.80];
        building(k(s), 1, 200 + hash(i * 41) * 28, w, h, w, {
          wall: [0.44, 0.50, 0.60], window: winFg, floor: 6 });
      }
      // ---- Yarra precinct + cultural landmarks (Federation Sq area) ----
      const CBD_LANDMARKS = [
        [0.22, 230, 24, 160, [0.36, 0.44, 0.56]],
        [0.28, 248, 20, 190, [0.38, 0.46, 0.58]],
        [0.32, 222, 26, 180, [0.34, 0.42, 0.54]],
        [0.38, 262, 18, 210, [0.36, 0.44, 0.56]],
        [0.44, 238, 22, 195, [0.38, 0.46, 0.58]],
        [0.50, 252, 20, 220, [0.34, 0.42, 0.54]],
      ];
      for (const [s, dist, bw, bh, wc] of CBD_LANDMARKS) {
        building(k(s), 1, dist, bw, bh, bw, { wall: wc, window: CBD_WIN_LIT, floor: 8 });
      }

      // ====================================================================
      // PARKLAND HORIZON — rounded green mound backdrop, both sides.
      // backdrop() auto-detects green-dominant colour → renders as organic
      // stacked-frustum mounds rather than flat slabs.  Replaces old flat
      // [120,18,100] slab loop.  Placed at dist 160–240 m so they sit well
      // behind forestEdge treelines and don't clip them.
      // ====================================================================
      every(100, (kk) => {
        for (const side of [-1, 1]) {
          // Skip the CBD side (s≈0.19–0.55 R) so mounds don't fight skyline
          if (side === 1 && kk >= k(0.17) && kk <= k(0.57)) continue;
          const dist = 165 + hash(kk * 6 + side) * 60;
          const w    = 130 + hash(kk * 11 + side) * 60;  // 130–190 m footprint (wider, fewer)
          const h    =  24 + hash(kk * 17 + side) * 16;  // 24–40 m mound height
          // Green-dominant: col[1] > col[0] and col[1] > col[2]*1.05
          backdrop(kk, side, dist, [w, h, 90], [0.18, 0.38 + hash(kk * 23 + side) * 0.06, 0.20]);
        }
      });

      // ====================================================================
      // PARKLAND TREE LINES — lush dense broadleaf + native foliage
      // Albert Park is renowned for its leafy green parkland character.
      //
      // ALL foliage placed via forestEdge() which accounts for canopy radius
      // so no tree/pine canopy can clip through barriers or fences.
      // Gap values are set to stay clear of the outermost barrier/fence/stand.
      //
      // Circuit zones (approximate, from visual + real-layout reference):
      //   s=0.00–0.10  main straight + pit lane → grandstands both sides
      //   s=0.10–0.27  fast sweeps T1–T4 → light forest parkland
      //   s=0.27–0.65  LAKESIDE — LHS is lake shore; RHS parkland, CBD beyond
      //   s=0.65–0.85  southern park loop — dense eucalyptus / native trees
      //   s=0.85–1.00  pit approach straight
      // ====================================================================

      // ---- Main straight LHS (pit wall side) — sparse, behind grandstand ----
      // grandstand at gap=12, fence at gap=9 → forestEdge gap 20 keeps clear
      forestEdge(0.00, 0.10, -1, 20, {
        density: 0.45, hMin: 8, hMax: 14,
        col: [0.16, 0.36, 0.16], col2: [0.20, 0.42, 0.18], pineFrac: 0.30,
      });

      // ---- Main straight RHS — grandstands + hospitality, tight parkland strip ----
      // grandstand at gap=14, fence at gap=10 → forest at gap 22
      forestEdge(0.00, 0.10, 1, 22, {
        density: 0.40, hMin: 7, hMax: 12,
        col: [0.17, 0.38, 0.17], col2: [0.21, 0.43, 0.19], pineFrac: 0.25,
      });

      // ---- Fast sweeps T1–T4 (s=0.10–0.27), both sides — lush parkland ----
      // hedges removed; forestEdge with gap 16 (fence at 9–10 → 7m clearance for canopy)
      forestEdge(0.10, 0.27, -1, 16, {
        density: 0.65, hMin: 9, hMax: 15,
        col: [0.17, 0.40, 0.18], col2: [0.21, 0.45, 0.20], pineFrac: 0.35,
      });
      forestEdge(0.10, 0.27, 1, 18, {
        density: 0.60, hMin: 8, hMax: 14,
        col: [0.18, 0.41, 0.18], col2: [0.22, 0.46, 0.20], pineFrac: 0.30,
      });

      // ---- Lakeside RHS (s=0.27–0.65) — parkland strip between track and CBD ----
      // grandstand at gap=14–16; forest behind at gap 26 to stay clear
      forestEdge(0.27, 0.65, 1, 26, {
        density: 0.50, hMin: 9, hMax: 16,
        col: [0.18, 0.40, 0.18], col2: [0.22, 0.44, 0.20], pineFrac: 0.20,
      });

      // ---- Lakeside LHS (s=0.27–0.65) — shore-line Morton Bay figs + eucalyptus ----
      // guardrail at gap=3, grandstands at gap=16; forest well back at gap 32
      // so canopy inner edge stays beyond the stand shell (~gap+15m outer face)
      forestEdge(0.27, 0.65, -1, 32, {
        density: 0.70, hMin: 10, hMax: 18,
        col: [0.20, 0.44, 0.20], col2: [0.24, 0.48, 0.22], pineFrac: 0.20,
      });

      // ---- Southern park loop (s=0.65–0.85) — dense native/eucalyptus ----
      forestEdge(0.65, 0.85, -1, 16, {
        density: 0.75, hMin: 10, hMax: 18,
        col: [0.19, 0.43, 0.19], col2: [0.23, 0.47, 0.21], pineFrac: 0.25,
      });
      forestEdge(0.65, 0.85, 1, 18, {
        density: 0.70, hMin: 9, hMax: 16,
        col: [0.20, 0.44, 0.20], col2: [0.24, 0.48, 0.22], pineFrac: 0.28,
      });

      // ---- Pit approach (s=0.85–1.00) — both sides, lighter canopy ----
      forestEdge(0.85, 1.00, -1, 16, {
        density: 0.50, hMin: 8, hMax: 13,
        col: [0.17, 0.39, 0.17], col2: [0.21, 0.43, 0.19], pineFrac: 0.30,
      });
      forestEdge(0.85, 1.00, 1, 22, {
        density: 0.45, hMin: 7, hMax: 12,
        col: [0.18, 0.40, 0.18], col2: [0.22, 0.44, 0.20], pineFrac: 0.25,
      });

      // ---- Additional native tree clusters at chicane complex (s=0.75–0.82) ----
      // Botanical garden character — taller specimens, rich greens, both sides
      forestEdge(0.75, 0.82, -1, 20, {
        density: 0.80, hMin: 12, hMax: 20,
        col: [0.21, 0.45, 0.20], col2: [0.25, 0.49, 0.23], pineFrac: 0.15,
      });
      forestEdge(0.75, 0.82, 1, 22, {
        density: 0.75, hMin: 11, hMax: 18,
        col: [0.22, 0.46, 0.21], col2: [0.26, 0.50, 0.24], pineFrac: 0.18,
      });

      // ---- Far-background forest canopy (atmospheric depth, horizon) ----
      every(60, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 53 + side) > 0.45) continue;
          const dist = 92 + hash(kk * 57 + side) * 72;
          tree(kk, side, dist, 12 + hash(kk * 61 + side) * 7, [0.17, 0.38, 0.17]);
        }
      });

      // ---- Palm avenue along lakeside Lakeside Drive section (s≈0.50–0.60 L) ----
      // Palms frame the dramatic lakeside stretch.  gap 26 keeps canopy clear of
      // the guardrail at gap=3 and the grandstand shell that extends to ~gap+15m.
      for (let j = 0; j < 10; j++) {
        const kk = (k(0.52) + j * 2) % n;
        palm(kk, -1, 26 + hash(kk * 9 + j) * 10, 12 + hash(kk * 12 + j) * 4, [0.21, 0.47, 0.25]);
      }
      // Palm accent clusters around key grandstands + pits
      for (let j = 0; j < 3; j++) {
        palm((k(0.0) + j * 3) % n, 1, 26 + j * 10, 13 + hash(j * 3) * 3, [0.21, 0.47, 0.25]);
        palm((k(0.94) + j * 3) % n, 1, 26 + j * 10, 12 + hash(j * 5) * 3, [0.21, 0.47, 0.25]);
      }

      // ---- Rowing boathouses + aquatic structures (s≈0.40 L) ----
      // gap=60 keeps inner face well clear of road; boathouses add lakeside character
      for (let j = 0; j < 2; j++) {
        building(k(0.40 + j * 0.04), -1, 60 + j * 12, 16, 8, 28, {
          wall: [0.86, 0.88, 0.86], window: [0.22, 0.52, 0.72], floor: 3 });
      }
      // Lakeside Recreation Reserve + stadium (s≈0.62–0.68 L)
      for (let j = 0; j < 2; j++) {
        building(k(0.63 + j * 0.05), -1, 62 + j * 8, 18, 10, 32, {
          wall: [0.82, 0.84, 0.86], window: [0.28, 0.53, 0.73], floor: 3 });
      }

      // ====================================================================
      // GRANDSTANDS — main straight + signature corners (crowd-tinted)
      // ====================================================================
      grandstand(0.00, -1, 12, 90, SHELL, CROWD);   // main grandstand, pit straight L
      grandstand(0.07, -1, 14, 60, SHELL, CROWD);   // extended pit-straight bank L
      grandstand(0.04,  1, 14, 55, SHELL, CROWD);   // Turn 1-2 sweep R
      grandstand(0.12,  1, 16, 48, SHELL, CROWD);   // Turn 3 exit bank R
      grandstand(0.30, -1, 16, 50, SHELL, CROWD);   // lakeside spectator bank L
      grandstand(0.55, -1, 16, 55, SHELL, CROWD);   // Lakeside Drive bank L
      grandstand(0.62,  1, 14, 60, SHELL, CROWD);   // spectator grandstand R
      grandstand(0.66,  1, 16, 45, SHELL, CROWD);   // adjoining spectator bank R
      grandstand(0.78, -1, 14, 45, SHELL, CROWD);   // chicane complex L
      grandstand(0.90,  1, 18, 50, SHELL, CROWD);   // fan-hill grandstand R
      grandstand(0.95, -1, 14, 48, SHELL, CROWD);   // pit-approach bank L
      grandstand(0.20,  1, 16, 46, SHELL, CROWD);   // fast section R
      grandstand(0.45, -1, 16, 44, SHELL, CROWD);   // lakeside bank L

      // ---- Pit building + garages: long low white box row, dark roof (s≈0.0 R) ----
      building(k(0.0), 1, 5, 14, 9, 180, { wall: [0.86, 0.87, 0.88], window: [0.18, 0.22, 0.28], floor: 4 });
      {
        const a = anchor(k(0.0), 1, 12);
        addBox(out, vadd(a.c, a.u, 9.6), [18, 0.8, 190], [0.30, 0.32, 0.34], [a.r, a.u, a.t]);
      }
      // marquee tent caps beside the s≈0.62 grandstand — at dist≥42, clear of stand
      for (let j = 0; j < 3; j++) {
        const a = anchor(k(0.62), 1, 42 + j * 10);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        // White tent body + coloured prism ridge roof
        addBox(out, vadd(a.c, a.u, 2.2), [11.0, 4.0, 11.0], WHITE, [a.r, a.u, a.t]);
        addPrism(out, vadd(a.c, a.u, 4.8), [11.0, 2.0, 11.0],
                 [[0.20, 0.44, 0.72], [0.86, 0.28, 0.18], [0.90, 0.78, 0.24]][j % 3],
                 [a.r, a.u, a.t]);
      }

      // ---- Paddock freight containers near pit entry (s≈0.97 L) ----
      // Stacked containers: each is a solid box with a thin lid strip so they
      // read as real containers rather than anonymous blocks.
      for (let j = 0; j < 4; j++) {
        const gap = 18 + j * 7;
        const CCOL = [[0.70, 0.28, 0.22], [0.28, 0.38, 0.64], [0.78, 0.76, 0.36], [0.52, 0.53, 0.56]][j];
        const a = anchor(k(0.97), -1, gap);
        if (onTrack(a.c[0], a.c[2], 4)) continue;
        // Main container body
        addBox(out, vadd(a.c, a.u, 1.5), [6.2, 3.0, 12.2], CCOL, [a.r, a.u, a.t]);
        // Corrugation cap strip (slightly darker roof)
        addBox(out, vadd(a.c, a.u, 3.2), [6.4, 0.3, 12.6],
               [CCOL[0] * 0.8, CCOL[1] * 0.8, CCOL[2] * 0.8], [a.r, a.u, a.t]);
        // Door-end detail (narrow darker band)
        addBox(out, vadd(vadd(a.c, a.t, 6.3), a.u, 1.5), [6.2, 3.0, 0.4],
               [CCOL[0] * 0.7, CCOL[1] * 0.7, CCOL[2] * 0.7], [a.r, a.u, a.t]);
      }

      // ---- Lakeside grass fan banking / hill (s≈0.90 R) ----
      // Replaced flat stacked slabs with a frustrated mound that reads as a
      // grassy hill/embankment.  Outer backdrop mound behind a low foreground ridge.
      {
        const a = anchor(k(0.90), 1, 34);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          addFrustum(out, a.c, 18, 8, 6.5, GRASS, 7, [a.r, a.u, a.t]);
          addCone(out, vadd(a.c, a.u, 6.5), 8, 3.5, [0.26, 0.52, 0.24], 7, [a.r, a.u, a.t]);
        }
        // Second slightly-offset mound for depth
        const a2 = anchor(k(0.91), 1, 42);
        if (!onTrack(a2.c[0], a2.c[2], 8)) {
          addFrustum(out, a2.c, 14, 5, 5.0, [0.26, 0.50, 0.24], 7, [a2.r, a2.u, a2.t]);
          addCone(out, vadd(a2.c, a2.u, 5.0), 5, 2.5, [0.28, 0.54, 0.26], 7, [a2.r, a2.u, a2.t]);
        }
      }

      // ====================================================================
      // KERBS + run-off framing at corner apexes / chicanes
      // ====================================================================
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.30, 1], [0.62, 1],
                                [0.78, -1], [0.78, 1], [0.80, -1], [0.97, 1]]) {
        place(k(s), side, 2, [0.5, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 7, [10, 0.1, 12], GRASS); // grass run-off framing
      }

      // ====================================================================
      // TRACKSIDE FURNITURE — catch fences, armco guardrails, tyre walls,
      // marshal posts.
      // ====================================================================
      fence(0.00, 0.09, -1,  9, 4.0, [0.74, 0.76, 0.80]);
      fence(0.04, 0.14,  1, 10, 3.6, [0.74, 0.76, 0.80]);
      fence(0.60, 0.70,  1,  9, 3.6, [0.74, 0.76, 0.80]);
      fence(0.76, 0.82, -1,  9, 3.6, [0.74, 0.76, 0.80]);

      guardrail(0.42, 0.58, -1, 3.0, [0.85, 0.18, 0.16]);
      guardrail(0.20, 0.30,  1, 3.0, [0.90, 0.90, 0.92]);
      guardrail(0.85, 0.95,  1, 3.0, [0.90, 0.90, 0.92]);

      tyreWall(0.77, 0.80,  1, 3.5, RED);
      tyreWall(0.78, 0.81, -1, 3.5, WHITE);

      for (const [s, side] of [[0.05, 1], [0.30, 1], [0.55, -1],
                                [0.62, 1], [0.78, -1], [0.90, 1]]) {
        marshalPost(k(s), side, 6);
      }

      // ====================================================================
      // PIT / PADDOCK precinct — control tower, motorhomes, support trucks
      // ====================================================================
      tower(k(0.02), 1, 26, 12, 26, { col: [0.80, 0.82, 0.85], seg: 4,
        cap: true, capCol: [0.20, 0.24, 0.30], mast: 8 });
      for (let j = 0; j < 6; j++) {
        const kk = (k(0.0) + j * 8) % n;
        building(kk, 1, 34, 12, 7 + hash(j * 3) * 3, 14, {
          wall: [[0.86, 0.87, 0.88], [0.30, 0.40, 0.60], [0.70, 0.30, 0.25],
                 [0.80, 0.78, 0.40], [0.55, 0.55, 0.58], [0.20, 0.55, 0.50]][j % 6],
          window: [0.18, 0.22, 0.28], floor: 4 });
      }
      for (let j = 0; j < 5; j++) {
        const a = anchor((k(0.0) + j * 10) % n, 1, 56 + hash(j * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        addBox(out, vadd(a.c, a.u, 2.0), [4, 4, 13], [0.90, 0.90, 0.92], [a.r, a.u, a.t]);
        addBox(out, vadd(vadd(a.c, a.u, 1.6), a.t, 8), [3.6, 3.2, 4], [0.30, 0.32, 0.40], [a.r, a.u, a.t]);
      }
      building(k(0.04), 1, 48, 20, 12, 30, { wall: [0.82, 0.84, 0.86], window: [0.30, 0.38, 0.50], floor: 3 });
      {
        const ap = anchor(k(0.01), -1, 22);
        addCyl(out, ap.c, 0.18, 18, [0.28, 0.32, 0.38], 4, [ap.r, ap.u, ap.t]);
        addBox(out, vadd(ap.c, ap.u, 18), [3.0, 1.5, 0.3], [0.80, 0.18, 0.18], [ap.r, ap.u, ap.t]);
      }

      // ====================================================================
      // PARKLAND STREET LIGHTING — slim aluminium poles, warm lantern heads.
      // Lantern colour [0.96, 0.93, 0.70] glows at night / reads as chrome day.
      // All posts at dist ≥ 11 m from road edge (beyond fence/guardrail at 3–10 m).
      // ====================================================================
      const LAMP_COL = [0.96, 0.93, 0.70];
      const POLE_COL = [0.35, 0.35, 0.37];

      // Zone A — main straight (s=0.0–0.10, both sides)
      for (let j = 0; j < 10; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.0) + j * 12) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.13, 7.5, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }
      // Zone B — parkland east corridor (s=0.12–0.28, both sides)
      for (let j = 0; j < 14; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.12) + j * 11) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.12, 8.0, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 8.0), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }
      // Zone C — lakeside Drive (s=0.42–0.60, L side only — R is water)
      for (let j = 0; j < 16; j++) {
        const a = anchor((k(0.42) + j * 10) % n, -1, 11);
        if (onTrack(a.c[0], a.c[2], 1)) continue;
        addCyl(out, a.c, 0.12, 8.5, POLE_COL, 5, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.5), [0.9, 0.5, 2.0], LAMP_COL, [a.r, a.u, a.t]);
      }
      // Zone D — southern park + chicane exit (s=0.70–0.90, both sides)
      for (let j = 0; j < 18; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.70) + j * 10) % n, side, 11);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.12, 7.5, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }

      // ====================================================================
      // PARKLAND AMENITIES — event marquees, colourful hospitality tents
      // ====================================================================
      for (const [s, side, cnt] of [[0.65, 1, 3], [0.32, -1, 3], [0.88, 1, 2], [0.12, -1, 2]]) {
        for (let j = 0; j < cnt; j++) {
          const a = anchor((k(s) + j * 8) % n, side, 46 + j * 12);
          if (onTrack(a.c[0], a.c[2], 6)) continue;
          addBox(out, vadd(a.c, a.u, 2.0), [11, 4.0, 11],
                 [0.93, 0.93, 0.94], [a.r, a.u, a.t]);
          addPrism(out, vadd(a.c, a.u, 4.8), [11, 1.8, 11],
                   [[0.86, 0.30, 0.20], [0.20, 0.46, 0.70], [0.90, 0.80, 0.26]][j % 3],
                   [a.r, a.u, a.t]);
        }
      }

      // ====================================================================
      // BILLBOARDS + start gantry + sponsor hoardings
      // ====================================================================
      billboard(k(0.30),  1, 18, 14, 5, [0.20, 0.40, 0.70]);
      billboard(k(0.55), -1, 16, 14, 5, [0.86, 0.30, 0.20]);
      billboard(k(0.12),  1, 16, 12, 4.5, [0.90, 0.80, 0.20]);
      billboard(k(0.45), -1, 18, 12, 4.5, [0.20, 0.60, 0.45]);
      billboard(k(0.70),  1, 16, 12, 4.5, [0.80, 0.30, 0.50]);
      billboard(k(0.85), -1, 16, 12, 4.5, [0.30, 0.45, 0.70]);
      gantry(0.0,  7.5, [0.30, 0.32, 0.36]);
      gantry(0.50, 7.0, [0.25, 0.27, 0.32]);

      void prop; void cx; void cz; void WATER; void pyMin; void bush; void hedge; void cityFront; void addPyramid;
    },
  }
  );
})();
