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
    sceneryTheme: "park",
    lengthKm: 5.3,
    baseHW: 7,
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage", "lamps", "floodlights"], s0: 0, s1: 1 },
    ],
    pal: { zenith: [0.22, 0.44, 0.82], horizon: [0.76, 0.79, 0.82], grass: [0.28, 0.50, 0.24], runoff: [0.48, 0.42, 0.32], fogDensity: 0.0012, sunDir: [0.6666666666666667, 0.6666666666666667, 0.33333333333333337], sun: [1, 0.95, 0.8], sunColor: [1, 0.93, 0.78] },
    segs: [
      { t: 0, l: 300 }, { t: 50, l: 100 }, { t: -50, l: 90 }, { t: 65, l: 80 }, { t: 0, l: 200 }, { t: 80, l: 90 },
      { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 260 }, { t: 80, l: 90 }, { t: 0, l: 200 }, { t: 70, l: 80 },
    ],
    // Source-trace fractions. Sub-metre relief preserves measurable grade for
    // physics without turning the essentially-flat lakeside park into hills.
    elevations: [{ s: 0.2125, halfM: 340, rise: 0.6 }, { s: 0.6425, halfM: 300, rise: -0.4 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, waterSurface, groundPatch, modelGroup, groundYAt,
              every, hash, onTrack,
              grandstand, building, motorhome, tower, tree, palm, bush, hedge, billboard, gantry,
              marshalPost, fence, guardrail, tyreWall, anchor, vadd, addBox,
              addCyl, addCone, addFrustum, addPrism, addPyramid,
              forestEdge, cityFront, MAT, circuitKit } = api;
      const k = (s) => Math.round(s * n) % n;

      if (circuitKit) {
        circuitKit.marshalShelter({
          id: "kit:albert_park:marshal-shelter", frac: 0.72,
          side: 1, gap: 35, size: [6, 3, 5], required: true,
        });
        circuitKit.recoveryBay({
          id: "kit:albert_park:recovery-bay", frac: 0.70,
          side: 1, gap: 55, size: [12, 5, 18], required: true,
        });
        circuitKit.trackSigns({
          id: "kit:albert_park:track-signs", frac: 0.88,
          side: 1, gap: 45, size: [3, 3, 42], count: 6, required: true,
        });
      }

      // ---- Palette (Melbourne lakeside parkland, bright day) ----
      const GRASS  = [0.32, 0.62, 0.28];
      const WATER  = [0.20, 0.45, 0.62];
      const WHITE  = [0.92, 0.92, 0.92], RED = [0.80, 0.15, 0.15];
      const SHELL  = [0.46, 0.47, 0.52], CROWD = [0.70, 0.60, 0.55];
      // ---- Track centre (for skyline / lake placement reference) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;

      // ====================================================================
      // ALBERT PARK LAKE — broad expanse of calm water dominating the circuit's
      // left side (s≈0.27–0.65 L). Multi-layered water planes with depth
      // and subtle shimmer. Far basin + near-shore ripple edge zones.
      // ====================================================================
      // Split the basin into typed surfaces that stay clear of the foldback road.
      waterSurface(k(0.38), -1, 120, [860, 0.2, 860], [0.18, 0.38, 0.56],
                   { id: "albert-lake-west" });
      waterSurface(k(0.58), -1, 110, [820, 0.2, 820], [0.18, 0.38, 0.56],
                   { id: "albert-lake-east" });
      // Shoreline transition zones — lighter, shimmer-edge tones
      waterSurface(k(0.50), -1, 55, [340, 0.12, 48], [0.26, 0.48, 0.64],
                   { id: "albert-shore-east" });
      waterSurface(k(0.48), -1, 42, [380, 0.12, 60], [0.28, 0.52, 0.66],
                   { id: "albert-shore-west" });
      // Infield water wrap (interior of circuit perimeter) — muted mid-tone
      for (let i = 0; i < 4; i++) {
        const s = 0.30 + (i / 4) * 0.30;
        waterSurface(k(s), -1, 115 + i * 8, [220, 0.16, 170], [0.22, 0.38, 0.52],
                     { id: `albert-lake-infield-${i}` });
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
      // BESPOKE ALBERT PARK LAKE FOUNTAIN — the signature central water jet.
      // A ringed basin with a tall white central plume, a ring of angled spray
      // jets, and concentric ripple bands spreading across the water. Placed out
      // on the lake off the lakeside stretch so it reads from the whole L side.
      // ====================================================================
      const lakeFountain = (kk, dist, scale) => {
        const p = anchor(kk, -1, dist), b = [p.r, p.u, p.t];
        if (onTrack(p.c[0], p.c[2], 6)) return;
        const c = [p.c[0], pyMin - 0.8, p.c[2]];
        const JET = [0.92, 0.95, 0.99];      // white spray
        modelGroup(`albert-lake-fountain-${kk}`, {
          center: vadd(c, p.u, 9 * scale),
          size: [34 * scale, 19 * scale, 34 * scale],
          basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addCyl(stage, c, 6 * scale, 0.7, [0.82, 0.84, 0.86], 18, b);
          stage._mat = 0;
          addCyl(stage, vadd(c, p.u, 0.7), 5.2 * scale, 0.35, [0.24, 0.50, 0.66], 18, b);
          addCone(stage, vadd(c, p.u, 1.0), 1.7 * scale, 11 * scale, JET, 10, b);
          addCone(stage, vadd(c, p.u, 8.5 * scale), 0.9 * scale, 7 * scale, JET, 8, b);
          addCone(stage, vadd(c, p.u, 13.5 * scale), 0.4 * scale, 4 * scale, JET, 6, b);
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * 6.2832, rr = 3.6 * scale;
            const off = vadd(vadd(c, p.r, Math.cos(a) * rr), p.t, Math.sin(a) * rr);
            addCone(stage, vadd(off, p.u, 0.9), 0.55 * scale,
                    (4.5 + (i % 2) * 1.5) * scale, JET, 6, b);
          }
          for (const rr of [9, 12.5, 16]) {
            addFrustum(stage, vadd(c, p.u, 0.35), rr * scale, (rr + 0.5) * scale, 0.14,
                       [0.32, 0.54, 0.68], 22, b);
          }
        }, { required: true });
      };
      lakeFountain(k(0.46), 96, 1.4);    // hero fountain, mid-lake
      lakeFountain(k(0.56), 78, 0.85);   // smaller companion jet nearer shore

      // ---- Lakeside jetty / boardwalk pier reaching into the water (s≈0.50 L) ----
      {
        const a = anchor(k(0.50), -1, 40), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 4)) {
          out._mat = MAT.WOOD;
          addBox(out, vadd(a.c, a.u, 0.9), [3.2, 0.4, 34], [0.72, 0.66, 0.54], b); // deck
          for (const to of [-15, -5, 5, 15]) {                                     // piles
            addCyl(out, vadd(a.c, a.t, to), 0.16, 1.4, [0.42, 0.36, 0.28], 4, b);
          }
          out._mat = 0;
          // a rowing scull moored at the pier end
          addBox(out, vadd(vadd(a.c, a.t, 18), a.u, 0.7), [0.9, 0.5, 9], [0.90, 0.88, 0.82], b);
        }
      }

      // ====================================================================
      // MELBOURNE CBD SKYLINE — coplanar with the lake (same side, beyond water).
      // Postcard read: water → fountain → 3–5 hero towers on the far shore.
      // Culled the old ~80-building R-side wall; heroes sit at dist ≥ 320 m so
      // they clear the lake planes (≈40–120 m) and read as one lakeside frame.
      // ====================================================================
      // Hero towers: Eureka-like spire + Australia 108 dark slab + mid cluster
      for (const [s, dist, bw, th, mast, col] of [
        [0.42, 340, 28, 280, 48, [0.28, 0.36, 0.48]],  // Eureka-like — tallest + mast
        [0.46, 355, 32, 250,  0, [0.18, 0.20, 0.24]],  // Australia 108-like dark slab
        [0.38, 360, 24, 210, 22, [0.32, 0.40, 0.52]],  // western mid hero
        [0.50, 350, 22, 190, 18, [0.30, 0.38, 0.50]],  // eastern mid hero
        [0.44, 375, 20, 170, 12, [0.34, 0.42, 0.54]],  // depth filler behind Eureka
      ]) {
        tower(k(s), -1, dist, bw, th, { col, seg: 8,
          cap: true, capCol: [0.20, 0.26, 0.36], mast });
      }
      // Thin haze silhouette band — distant mid-rise depth, not a wall
      for (let i = 0; i < 6; i++) {
        const f = i / 5;
        const bh = 50 + hash(i * 13) * 70;
        const bw = 22 + hash(i * 9) * 18;
        backdrop(k(0.36 + f * 0.16), -1, 400 + hash(i * 5) * 50,
                 [bw, bh, 20],
                 [0.38 + hash(i * 7) * 0.06, 0.42 + hash(i * 3) * 0.05, 0.54 + hash(i * 11) * 0.05]);
      }

      // ====================================================================
      // PARKLAND HORIZON — rounded green mound backdrop, both sides.
      // backdrop() auto-detects green-dominant colour → renders as organic
      // stacked-frustum mounds rather than flat slabs.  Placed at dist 160–240 m
      // so they sit behind forestEdge treelines. Skip lakeside L (s≈0.27–0.65)
      // so mounds don't fight the lake + CBD coplanar frame.
      // ====================================================================
      every(100, (kk) => {
        for (const side of [-1, 1]) {
          if (side === -1 && kk >= k(0.27) && kk <= k(0.65)) continue;
          const dist = 165 + hash(kk * 6 + side) * 60;
          const w    = 130 + hash(kk * 11 + side) * 60;  // 130–190 m footprint (wider, fewer)
          const h    =  24 + hash(kk * 17 + side) * 16;  // 24–40 m mound height
          // Green-dominant: col[1] > col[0] and col[1] > col[2]*1.05
          backdrop(kk, side, dist, [w, h, 90], [0.18, 0.38 + hash(kk * 23 + side) * 0.06, 0.20]);
        }
      });

      // ====================================================================
      // EUCALYPTUS PARKLAND — broadleaf only (pineFrac: 0), greyer-green canopy.
      // Melbourne parkland reads dusty olive/grey-green, not Alpine pine forest.
      // ALL foliage via forestEdge() (canopy-radius aware). Gap clears barriers.
      //
      // Circuit zones:
      //   s=0.00–0.10  main straight + pit lane → grandstands both sides
      //   s=0.10–0.27  fast sweeps T1–T4 → light parkland
      //   s=0.27–0.65  LAKESIDE — L water + CBD beyond; R parkland strip
      //   s=0.65–0.85  southern park loop — denser eucalyptus
      //   s=0.85–1.00  pit approach straight
      // ====================================================================
      const EUC  = [0.30, 0.42, 0.28];   // grey-green eucalyptus
      const EUC2 = [0.34, 0.46, 0.30];   // slightly lighter canopy twin

      // ---- Main straight LHS (pit wall side) — sparse, behind grandstand ----
      forestEdge(0.00, 0.10, -1, 20, {
        density: 0.45, hMin: 9, hMax: 16,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      // ---- Main straight RHS — grandstands + hospitality, tight parkland strip ----
      forestEdge(0.00, 0.10, 1, 22, {
        density: 0.40, hMin: 8, hMax: 14,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      // ---- Fast sweeps T1–T4 (s=0.10–0.27), both sides ----
      forestEdge(0.10, 0.27, -1, 16, {
        density: 0.60, hMin: 10, hMax: 17,
        col: EUC, col2: EUC2, pineFrac: 0,
      });
      forestEdge(0.10, 0.27, 1, 18, {
        density: 0.55, hMin: 9, hMax: 16,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      // ---- Lakeside RHS (s=0.27–0.65) — parkland strip (CBD is now beyond water L) ----
      forestEdge(0.27, 0.65, 1, 26, {
        density: 0.45, hMin: 10, hMax: 17,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      // ---- Lakeside LHS — sparse shore figs/eucalyptus so water + skyline read ----
      forestEdge(0.27, 0.65, -1, 36, {
        density: 0.40, hMin: 11, hMax: 18,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      // ---- Southern park loop (s=0.65–0.85) — denser native eucalyptus ----
      forestEdge(0.65, 0.85, -1, 16, {
        density: 0.70, hMin: 11, hMax: 19,
        col: EUC, col2: EUC2, pineFrac: 0,
      });
      forestEdge(0.65, 0.85, 1, 18, {
        density: 0.65, hMin: 10, hMax: 18,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      // ---- Pit approach (s=0.85–1.00) — both sides, lighter canopy ----
      forestEdge(0.85, 1.00, -1, 16, {
        density: 0.45, hMin: 9, hMax: 15,
        col: EUC, col2: EUC2, pineFrac: 0,
      });
      forestEdge(0.85, 1.00, 1, 22, {
        density: 0.40, hMin: 8, hMax: 14,
        col: EUC, col2: EUC2, pineFrac: 0,
      });

      // ---- Chicane complex (s=0.75–0.82) — taller eucalyptus specimens ----
      forestEdge(0.75, 0.82, -1, 20, {
        density: 0.70, hMin: 13, hMax: 20,
        col: EUC2, col2: [0.36, 0.48, 0.32], pineFrac: 0,
      });
      forestEdge(0.75, 0.82, 1, 22, {
        density: 0.65, hMin: 12, hMax: 19,
        col: EUC2, col2: [0.36, 0.48, 0.32], pineFrac: 0,
      });

      // ---- Far-background eucalyptus canopy (atmospheric depth) ----
      every(60, (kk) => {
        for (const side of [-1, 1]) {
          if (side === -1 && kk >= k(0.27) && kk <= k(0.65)) continue; // keep lake sightline open
          if (hash(kk * 53 + side) > 0.45) continue;
          const dist = 92 + hash(kk * 57 + side) * 72;
          tree(kk, side, dist, 13 + hash(kk * 61 + side) * 8, EUC);
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
      grandstand(0.00, -1, 14, 90, SHELL, CROWD);   // main grandstand, pit straight L
      grandstand(0.07, -1, 14, 60, SHELL, CROWD);   // extended pit-straight bank L
      grandstand(0.04,  1, 14, 55, SHELL, CROWD);   // Turn 1-2 sweep R
      grandstand(0.12,  1, 16, 48, SHELL, CROWD);   // Turn 3 exit bank R
      grandstand(0.30, -1, 16, 50, SHELL, CROWD);   // lakeside spectator bank L
      grandstand(0.55, -1, 16, 55, SHELL, CROWD);   // Lakeside Drive bank L
      grandstand(0.62,  1, 14, 60, SHELL, CROWD);   // spectator grandstand R
      grandstand(0.66,  1, 16, 45, SHELL, CROWD);   // adjoining spectator bank R
      grandstand(0.78, -1, 14, 45, SHELL, CROWD);   // chicane complex L
      grandstand(0.90,  1, 18, 50, SHELL, CROWD);   // fan-hill grandstand R
      grandstand(0.95, -1, 16, 48, SHELL, CROWD);   // pit-approach bank L
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
      // KERBS — bold red/white densification at T1 and chicane complexes.
      // Taller sausage strips (h≈0.28) so they punch at race speed; gap 1.8–2.2
      // keeps footprints clear of tarmac (rejBox). Mid-lap apexes stay lighter.
      // ====================================================================
      // T1–T2 sweep (s≈0.03–0.08) — alternating sausage kerbs both sides
      for (const [s, side, col] of [
        [0.030,  1, RED],   [0.035,  1, WHITE], [0.040,  1, RED],   [0.045,  1, WHITE],
        [0.050,  1, RED],   [0.055, -1, WHITE], [0.060, -1, RED],   [0.065, -1, WHITE],
        [0.070, -1, RED],   [0.075,  1, WHITE],
      ]) {
        place(k(s), side, 1.9, [0.55, 0.28, 7.5], col);
      }
      // Chicane complex (s≈0.76–0.82) — dense alternating kerbs
      for (const [s, side, col] of [
        [0.760, -1, RED],   [0.765, -1, WHITE], [0.770, -1, RED],   [0.775, -1, WHITE],
        [0.780,  1, RED],   [0.785,  1, WHITE], [0.790,  1, RED],   [0.795,  1, WHITE],
        [0.800, -1, RED],   [0.805, -1, WHITE], [0.810,  1, RED],   [0.815,  1, WHITE],
      ]) {
        place(k(s), side, 1.9, [0.55, 0.28, 7.0], col);
      }
      // Lighter mid-lap apex flashes + grass run-off framing
      for (const [s, side] of [[0.30, 1], [0.62, 1], [0.97, 1]]) {
        place(k(s), side, 2, [0.5, 0.25, 6], side > 0 ? RED : WHITE);
        groundPatch(k(s), side, 2, [10, 0.1, 12], GRASS,
                    { id: `albert-runoff-${s}-${side}`, samples: 5 });
      }
      // Grass run-off pads at T1 / chicane exits
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.78, -1], [0.78, 1], [0.80, -1]]) {
        groundPatch(k(s), side, 2, [10, 0.1, 12], GRASS,
                    { id: `albert-runoff-${s}-${side}`, samples: 5 });
      }

      // ====================================================================
      // Street-circuit temporary-style barriers — armco + catch fence densified
      // for park-road tension (permanent dressing in this build). Longer runs
      // at T1 and the chicane; lakeside armco kept.
      // ====================================================================
      const FENCE_COL = [0.74, 0.76, 0.80];
      const ARMCO    = [0.90, 0.90, 0.92];
      const ARMCO_R  = [0.85, 0.18, 0.16];

      // Main straight / T1 approach — catch fence both sides
      fence(0.00, 0.12, -1,  9, 4.0, FENCE_COL);
      fence(0.02, 0.14,  1, 10, 3.6, FENCE_COL);
      // T1–T4 armco (temporary street rails)
      guardrail(0.03, 0.12,  1, 2.8, ARMCO);
      guardrail(0.04, 0.10, -1, 2.8, ARMCO);
      // Lakeside Drive armco (red accent strip on L shore)
      guardrail(0.42, 0.58, -1, 3.0, ARMCO_R);
      // Mid parkland rail
      guardrail(0.20, 0.30,  1, 3.0, ARMCO);
      // Southern loop approach fence
      fence(0.60, 0.72,  1,  9, 3.6, FENCE_COL);
      // Chicane complex — dense temporary barriers both sides
      fence(0.74, 0.84, -1,  9, 3.6, FENCE_COL);
      fence(0.74, 0.84,  1,  9, 3.6, FENCE_COL);
      guardrail(0.75, 0.83, -1, 2.8, ARMCO);
      guardrail(0.75, 0.83,  1, 2.8, ARMCO);
      // Pit approach
      guardrail(0.85, 0.95,  1, 3.0, ARMCO);
      fence(0.90, 0.99, -1,  9, 3.6, FENCE_COL);

      tyreWall(0.04, 0.07,  1, 3.2, RED);
      tyreWall(0.05, 0.08, -1, 3.2, WHITE);
      tyreWall(0.77, 0.81,  1, 3.5, RED);
      tyreWall(0.78, 0.82, -1, 3.5, WHITE);

      for (const [s, side] of [[0.05, 1], [0.30, 1], [0.55, -1],
                                [0.62, 1], [0.78, -1], [0.90, 1]]) {
        marshalPost(k(s), side, 6);
      }

      // ====================================================================
      // PIT / PADDOCK precinct — control tower, motorhomes, support trucks
      // ====================================================================
      tower(k(0.02), 1, 26, 12, 26, { col: [0.80, 0.82, 0.85], seg: 4,
        cap: true, capCol: [0.20, 0.24, 0.30], mast: 8 });
      // Team motorhome row — the comment already called these "motorhomes" but
      // they were generic office-block building() calls; motorhome() gives the
      // real two-tier team-unit body + awning canopy.
      for (let j = 0; j < 6; j++) {
        const kk = (k(0.0) + j * 8) % n;
        const wall = [[0.86, 0.87, 0.88], [0.30, 0.40, 0.60], [0.70, 0.30, 0.25],
                      [0.80, 0.78, 0.40], [0.55, 0.55, 0.58], [0.20, 0.55, 0.50]][j % 6];
        const accent = [[0.70, 0.10, 0.10], [0.10, 0.20, 0.55], [0.85, 0.20, 0.15],
                        [0.75, 0.65, 0.10], [0.35, 0.35, 0.40], [0.10, 0.55, 0.45]][j % 6];
        motorhome(kk, 1, 34, 12, 7 + hash(j * 3) * 3, 14, { wall, window: [0.18, 0.22, 0.28], accent });
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
      // Zone C — lakeside Drive (s=0.42–0.60, L shore — water + CBD beyond)
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
