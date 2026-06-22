/* Apex 26 — ALBERT PARK circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "albert_park",
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
              addCyl, addCone, addFrustum, addPrism, addPyramid } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (Melbourne lakeside parkland, bright day) ----
      const GRASS  = [0.32, 0.62, 0.28];
      const TREE   = [0.16, 0.40, 0.20];
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
      // Planes placed well below road grade (side=-1, gap=95+) so they never
      // float up as a wall; the groundPlane helper sinks them a further 1 m.
      // ====================================================================
      // Primary far-lake basin — deep water colour, broad expanse
      groundPlane(k(0.45), -1, 100, [1300, 4, 1300], [0.16, 0.34, 0.52]);
      groundPlane(k(0.38), -1, 120, [860,  4,  860], [0.18, 0.38, 0.56]);
      groundPlane(k(0.58), -1, 110, [820,  4,  820], [0.18, 0.38, 0.56]);
      // Shoreline transition zones — lighter, shimmer-edge tones
      groundPlane(k(0.50), -1,  55, [340, 4,  48], [0.26, 0.48, 0.64]);
      groundPlane(k(0.48), -1,  42, [380, 4,  60], [0.28, 0.52, 0.66]);
      // Infield water wrap (interior of circuit perimeter) — muted mid-tone
      for (let i = 0; i < 4; i++) {
        const s = 0.30 + (i / 4) * 0.30;
        groundPlane(k(s), -1, 115 + i * 8, [220, 4, 170], [0.22, 0.38, 0.52]);
      }

      // ---- Moored rowboats + kayaks (s≈0.45–0.55 water edge) ----
      // Recreational watercraft add authenticity to this active lakeside precinct.
      // Each is anchored at dist≥52 so it sits well beyond the road + grandstands.
      for (let j = 0; j < 6; j++) {
        const a = anchor((k(0.47 + j * 0.025) + j * 15) % n, -1, 54 + hash(j * 7) * 32);
        if (onTrack(a.c[0], a.c[2], 3)) continue;
        // Small rowing shell hull
        addBox(out, vadd(a.c, a.u, 0.8), [1.8, 1.0, 8.5], [0.88, 0.85, 0.80], [a.r, a.u, a.t]);
        // Oar / rigger detail
        if (hash(j * 11) > 0.5)
          addCyl(out, vadd(a.c, a.t, -0.5), 0.08, 5.2, [0.40, 0.35, 0.28], 4, [a.r, a.u, a.t]);
      }

      // ====================================================================
      // MELBOURNE CBD SKYLINE — dense layered towers across the lake
      // (s≈0.19–0.52 R). Iconic landmarks (Eureka Tower, Rialto) dominate;
      // mid-rise base with varied window colour. Steel-blue + grey tones.
      // All towers placed at dist≥190 so they sit well clear of the road.
      // Night-ready: window bands use CBD_WIN_LIT (warm amber) for glow at night.
      // ====================================================================
      const CBD_N = 42, CBD_S0 = 0.19, CBD_S1 = 0.51;
      for (let i = 0; i < CBD_N; i++) {
        const f = i / (CBD_N - 1);
        const s = CBD_S0 + f * (CBD_S1 - CBD_S0);
        const dist = 230 + hash(i * 7) * 100;
        const w = 16 + hash(i * 3) * 14;
        const h = 70 + hash(i * 11) * 150;
        const wallCol = [0.28 + hash(i * 5) * 0.12, 0.34 + hash(i * 2) * 0.10, 0.50 + hash(i * 4) * 0.06];
        // Alternate warm-lit and cool-glass windows for visual variety
        const winCol = (hash(i * 19) > 0.45) ? CBD_WIN_LIT : CBD_WIN_DAY;
        building(k(s), 1, dist - w / 2, w, h, w, {
          wall: wallCol, window: winCol, floor: 6,
          setback: hash(i * 13) > 0.50, roof: hash(i * 17) > 0.60,
        });
      }
      // Iconic signature towers: Eureka Tower + Rialto dominate the skyline
      for (const [s, dist, bw, th, mast] of [
        [0.26, 290, 30, 270, 42],   // Eureka-like iconic spire — tallest, prominent
        [0.34, 270, 26, 230, 28],   // Rialto-like tower — second major landmark
        [0.41, 300, 28, 250,  0],   // further eastern major tower
        [0.21, 280, 24, 200, 35],   // mid-range signature
        [0.47, 285, 26, 220, 22],   // eastern precinct anchor
      ]) {
        tower(k(s), 1, dist, bw, th, { col: [0.30, 0.38, 0.50], seg: 8,
          cap: true, capCol: [0.20, 0.28, 0.40], mast });
      }
      // Far-horizon silhouette band — hazy, atmospheric depth
      for (let i = 0; i < 24; i++) {
        const f = i / 23;
        backdrop(k(CBD_S0 - 0.03 + f * (CBD_S1 - CBD_S0 + 0.06)), 1,
                 370 + hash(i * 5) * 140,
                 [32 + hash(i * 9) * 28, 52 + hash(i * 13) * 90, 28],
                 [0.38, 0.44, 0.52]);
      }
      // Mid-rise foreground layer — lighter, Yarra riverside buildings
      for (let i = 0; i < 18; i++) {
        const f = i / 17;
        const s = CBD_S0 + f * (CBD_S1 - CBD_S0);
        const w = 22 + hash(i * 31) * 16, h = 38 + hash(i * 37) * 45;
        // Night-ready: every third building uses warm lit windows
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
      // LOW distant Melbourne treeline backdrop, both sides (flat parkland)
      // ====================================================================
      every(80, (kk) => {
        for (const side of [-1, 1]) {
          backdrop(kk, side, 185 + hash(kk * 6 + side) * 65, [120, 18, 100], [0.16, 0.32, 0.18]);
        }
      });

      // ====================================================================
      // PARKLAND — lush dense broadleaf canopy + native understory
      // Albert Park is renowned for its leafy green parkland character.
      // Richer greens for day atmosphere; dist minimum 22 m (beyond road edge)
      // so trees stay clear of guardrails/fences placed at dist 3–9 m.
      // ====================================================================
      every(28, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 21 + side) > 0.68) continue;
          const dist = 24 + hash(kk * 22 + side) * 58;
          // Richer, more varied green palette for day depth
          const gc = [0.17 + hash(kk * 23 + side) * 0.06, 0.40 + hash(kk * 25 + side) * 0.08, 0.18 + hash(kk * 27 + side) * 0.04];
          tree(kk, side, dist, 10 + hash(kk * 24 + side) * 6, gc);
          if (hash(kk * 27 + side) > 0.52) {
            const gc2 = [0.18 + hash(kk * 29 + side) * 0.05, 0.38 + hash(kk * 31 + side) * 0.07, 0.18];
            tree(kk, side, dist + 14 + hash(kk * 29 + side) * 16,
                 9 + hash(kk * 33 + side) * 5, gc2);
          }
          if (hash(kk * 31 + side) > 0.55)
            bush(kk, side, dist - 5, [0.17, 0.40, 0.17]);
        }
      });

      // Dense tree clusters at signature parkland zones (both sides)
      for (const [sc, cnt] of [[0.15, 7], [0.33, 6], [0.42, 5], [0.68, 6], [0.83, 5]]) {
        for (const side of [-1, 1]) {
          for (let j = 0; j < cnt; j++) {
            const kk = (k(sc) + j) % n;
            tree(kk, side, 22 + hash(kk * 3 + j + sc * 50) * 26,
                 10 + hash(kk * 5 + j) * 6, [0.20, 0.44, 0.20]);
            if (hash(kk * 7 + j) > 0.60)
              bush(kk, side, 18 + hash(kk * 9 + j) * 10, [0.18, 0.41, 0.18]);
          }
        }
      }

      // ---- Palm avenue along lakeside Lakeside Drive section (s≈0.50–0.60 L) ----
      // Palms frame the dramatic lakeside stretch at dist≥20 — clear of guardrail.
      for (let j = 0; j < 10; j++) {
        const kk = (k(0.52) + j * 2) % n;
        palm(kk, -1, 21 + hash(kk * 9 + j) * 10, 12 + hash(kk * 12 + j) * 4, [0.21, 0.47, 0.25]);
      }
      // Palm accent clusters around key grandstands + pits
      for (let j = 0; j < 3; j++) {
        palm((k(0.0) + j * 3) % n, 1, 22 + j * 10, 13 + hash(j * 3) * 3, [0.21, 0.47, 0.25]);
        palm((k(0.94) + j * 3) % n, 1, 22 + j * 10, 12 + hash(j * 5) * 3, [0.21, 0.47, 0.25]);
      }

      // ---- Lakeside tree line (Morton Bay figs + eucalyptus) — premium LHS coverage ----
      // dist≥28 keeps these beyond the lakeside guardrail (dist=3.0).
      for (let i = 0; i < 35; i++) {
        const s = 0.27 + (i / 35) * 0.36;
        const kk = k(s);
        const d = 28 + hash(kk * 41 + i) * 24;
        tree(kk, -1, d, 11 + hash(kk * 43 + i) * 6, [0.21, 0.45, 0.21]);
        if (hash(kk * 45 + i) > 0.58)
          tree(kk, -1, d + 18 + hash(kk * 47 + i) * 10, 13 + hash(kk * 49 + i) * 4, [0.20, 0.43, 0.20]);
      }

      // ---- Rowing boathouses + aquatic structures (s≈0.40 L) ----
      // gap=60 keeps inner face (60 - 18/2 = 51 m) well clear of road.
      // depth d=28 so outer face at 60+9=69 m — clear of water planes starting at gap≥100.
      for (let j = 0; j < 2; j++) {
        building(k(0.40 + j * 0.04), -1, 60 + j * 12, 16, 8, 28, {
          wall: [0.86, 0.88, 0.86], window: [0.22, 0.52, 0.72], floor: 3 });
      }
      // Lakeside Recreation Reserve + stadium (s≈0.62–0.68 L)
      // gap=62 keeps buildings from overlapping grandstand at dist=16 (gap=16+7.5=23.5 outer).
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
      // gap=5 → inner face at road edge + 5 m, depth=180 runs parallel to straight.
      building(k(0.0), 1, 5, 14, 9, 180, { wall: [0.86, 0.87, 0.88], window: [0.18, 0.22, 0.28], floor: 4 });
      {
        const a = anchor(k(0.0), 1, 12);
        addBox(out, vadd(a.c, a.u, 9.6), [18, 0.8, 190], [0.30, 0.32, 0.34], [a.r, a.u, a.t]); // dark roof slab
      }
      // marquee tent caps beside the s≈0.62 grandstand — at dist≥42, clear of stand
      for (let j = 0; j < 3; j++) {
        const a = anchor(k(0.62), 1, 42 + j * 10);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        addBox(out, vadd(a.c, a.u, 5), [12, 0.6, 12], WHITE, [a.r, a.u, a.t]);
      }

      // ---- Paddock container-stack boxes near pit entry (s≈0.97 L) ----
      for (let j = 0; j < 4; j++) {
        place(k(0.97), -1, 16 + j * 5, [6, 3, 12],
              [[0.70, 0.30, 0.25], [0.30, 0.40, 0.60], [0.80, 0.78, 0.40], [0.55, 0.55, 0.58]][j]);
      }

      // ---- Lakeside grass fan banking / hill (s≈0.90 R) ----
      for (let j = 0; j < 4; j++) {
        place(k(0.90), 1, 25 + j * 8, [30, 2 + j * 1.5, 24], GRASS);
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
      // HEDGES + clipped treelines — continuous parkland borders
      // ====================================================================
      hedge(0.10, 0.18,  1,  9, 1.6, [0.18, 0.36, 0.16]);
      hedge(0.13, 0.20, -1, 10, 1.5, [0.18, 0.36, 0.16]);
      hedge(0.32, 0.40,  1, 11, 1.7, [0.17, 0.35, 0.16]);
      hedge(0.66, 0.74, -1,  9, 1.5, [0.18, 0.36, 0.16]);
      hedge(0.82, 0.90,  1, 10, 1.6, [0.17, 0.35, 0.16]);
      hedge(0.92, 0.99, -1,  9, 1.4, [0.18, 0.36, 0.16]);

      // ====================================================================
      // TRACKSIDE FURNITURE — catch fences, armco guardrails, tyre walls,
      // marshal posts.
      // ====================================================================
      // catch fences behind the grandstand banks (spectator protection)
      fence(0.00, 0.09, -1,  9, 4.0, [0.74, 0.76, 0.80]);  // main straight L
      fence(0.04, 0.14,  1, 10, 3.6, [0.74, 0.76, 0.80]);  // T1-3 sweep R
      fence(0.60, 0.70,  1,  9, 3.6, [0.74, 0.76, 0.80]);  // spectator stand R
      fence(0.76, 0.82, -1,  9, 3.6, [0.74, 0.76, 0.80]);  // chicane L

      // armco guardrails on the fast lakeside / flowing edges
      guardrail(0.42, 0.58, -1, 3.0, [0.85, 0.18, 0.16]);  // Lakeside Drive L (red)
      guardrail(0.20, 0.30,  1, 3.0, [0.90, 0.90, 0.92]);  // R sweep
      guardrail(0.85, 0.95,  1, 3.0, [0.90, 0.90, 0.92]);  // pit approach R

      // tyre-stack barriers at the tight chicane complex
      tyreWall(0.77, 0.80,  1, 3.5, RED);    // chicane outer R
      tyreWall(0.78, 0.81, -1, 3.5, WHITE);  // chicane outer L

      // marshal posts at signature corners
      for (const [s, side] of [[0.05, 1], [0.30, 1], [0.55, -1],
                                [0.62, 1], [0.78, -1], [0.90, 1]]) {
        marshalPost(k(s), side, 6);
      }

      // ====================================================================
      // PIT / PADDOCK precinct — control tower, motorhomes, support trucks
      // ====================================================================
      tower(k(0.02), 1, 26, 12, 26, { col: [0.80, 0.82, 0.85], seg: 4,
        cap: true, capCol: [0.20, 0.24, 0.30], mast: 8 });  // race control tower
      // paddock motorhome / hospitality row behind pits — dist≥34 keeps clear of pit building
      for (let j = 0; j < 6; j++) {
        const kk = (k(0.0) + j * 8) % n;
        building(kk, 1, 34, 12, 7 + hash(j * 3) * 3, 14, {
          wall: [[0.86, 0.87, 0.88], [0.30, 0.40, 0.60], [0.70, 0.30, 0.25],
                 [0.80, 0.78, 0.40], [0.55, 0.55, 0.58], [0.20, 0.55, 0.50]][j % 6],
          window: [0.18, 0.22, 0.28], floor: 4 });
      }
      // support trucks (cab + box trailer) parked in the paddock at dist≥56
      for (let j = 0; j < 5; j++) {
        const a = anchor((k(0.0) + j * 10) % n, 1, 56 + hash(j * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        addBox(out, vadd(a.c, a.u, 2.0), [4, 4, 13], [0.90, 0.90, 0.92], [a.r, a.u, a.t]); // box
        addBox(out, vadd(vadd(a.c, a.u, 1.6), a.t, 8), [3.6, 3.2, 4], [0.30, 0.32, 0.40], [a.r, a.u, a.t]); // cab
      }
      // ---- Paddock club + flagpole at main entrance (s=0.04) ----
      building(k(0.04), 1, 48, 20, 12, 30, { wall: [0.82, 0.84, 0.86], window: [0.30, 0.38, 0.50], floor: 3 });
      {
        const ap = anchor(k(0.01), -1, 22);
        addCyl(out, ap.c, 0.18, 18, [0.28, 0.32, 0.38], 4, [ap.r, ap.u, ap.t]);
        addBox(out, vadd(ap.c, ap.u, 18), [3.0, 1.5, 0.3], [0.80, 0.18, 0.18], [ap.r, ap.u, ap.t]); // flag
      }

      // ====================================================================
      // PARKLAND STREET LIGHTING
      // Three zones of lamp posts so the circuit reads well at any time-of-day:
      //   A. Main straight + pit zone (both sides, s=0.0–0.10)
      //   B. Parkland east corridor (both sides, s=0.12–0.28)  ← NEW
      //   C. Lakeside Drive (L side, s=0.42–0.60)              ← NEW
      //   D. Southern park + exit (both sides, s=0.70–0.90)    ← NEW
      // Each post: slim aluminium pole + a lantern head. Lantern colour is warm
      // white [0.96, 0.93, 0.70] — glows at night, plausible chrome by day.
      // dist=9 m puts posts just behind the guardrail / fence line (dist=3–10 m).
      // ====================================================================
      const LAMP_COL = [0.96, 0.93, 0.70];   // warm white lantern
      const POLE_COL = [0.35, 0.35, 0.37];   // aluminium pole

      // Zone A — main straight (s=0.0–0.10, both sides, every ~20 m)
      for (let j = 0; j < 10; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.0) + j * 12) % n, side, 9);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.13, 7.5, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }
      // Zone B — parkland east corridor (s=0.12–0.28, both sides)
      for (let j = 0; j < 14; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.12) + j * 11) % n, side, 10);
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
        // Slightly taller lakeside post — classic Melbourne streetscape
        addBox(out, vadd(a.c, a.u, 8.5), [0.9, 0.5, 2.0], LAMP_COL, [a.r, a.u, a.t]);
      }
      // Zone D — southern park + chicane exit (s=0.70–0.90, both sides)
      for (let j = 0; j < 18; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.70) + j * 10) % n, side, 10);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.12, 7.5, POLE_COL, 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], LAMP_COL, [a.r, a.u, a.t]);
        }
      }

      // ====================================================================
      // PARKLAND AMENITIES — event marquees, far forest canopy, native trees
      // ====================================================================
      // Colourful event marquees + hospitality tents behind major grandstands.
      // gap≥46 keeps tents clear of stand outer edge (stand inner gap + 15 m shell).
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
      // ---- Far-background forest canopy (atmospheric depth, horizon) ----
      every(40, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 53 + side) > 0.55) continue;
          const dist = 92 + hash(kk * 57 + side) * 72;
          tree(kk, side, dist, 12 + hash(kk * 61 + side) * 7, [0.17, 0.38, 0.17]);
        }
      });
      // ---- Botanical Garden + native trees (s=0.68–0.82) ----
      const NATIVE_GREENS = [[0.21, 0.45, 0.20], [0.23, 0.49, 0.22], [0.17, 0.41, 0.18], [0.22, 0.47, 0.21]];
      for (let i = 0; i < 10; i++) {
        const s = 0.68 + (i / 10) * 0.14;
        const kk = k(s);
        const side = (i % 2) ? 1 : -1;
        tree(kk, side, 34 + hash(kk * 71 + i) * 30, 13 + hash(kk * 73 + i) * 8, NATIVE_GREENS[i % 4]);
        if (hash(kk * 75 + i) > 0.55)
          tree(kk, side, 56 + hash(kk * 77 + i) * 20, 15 + hash(kk * 79 + i) * 6, NATIVE_GREENS[(i + 1) % 4]);
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
      gantry(0.50, 7.0, [0.25, 0.27, 0.32]);   // mid-lap timing gantry

      void prop; void cx; void cz; void TREE; void WATER;
    },
  }
  );
})();
