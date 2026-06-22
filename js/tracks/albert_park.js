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
              addCyl, addCone, addFrustum, addPyramid, addPrism } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Palette (Melbourne lakeside parkland, bright day) ----
      const GRASS = [0.32, 0.62, 0.28];
      const TREE = [0.16, 0.40, 0.20];
      const WATER = [0.20, 0.45, 0.62];
      const WHITE = [0.92, 0.92, 0.92], RED = [0.80, 0.15, 0.15];
      const SHELL = [0.46, 0.47, 0.52], CROWD = [0.70, 0.60, 0.55];

      // ---- Track centre (for skyline / lake placement reference) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;

      // ====================================================================
      // ALBERT PARK LAKE — broad expanse of calm water dominating the circuit's
      // left side (s≈0.27–0.65 L). Multi-layered water planes create depth &
      // reflective shimmer. Near-shore shallows + mid-lake main body + far horizon.
      // ====================================================================
      // Main far-lake water body (primary vista)
      groundPlane(k(0.45), -1, 90, [1200, 4, 1200], [0.20, 0.42, 0.60]);
      groundPlane(k(0.40), -1, 110, [800, 4, 800], [0.22, 0.47, 0.64]);
      groundPlane(k(0.55), -1, 100, [800, 4, 800], [0.22, 0.47, 0.64]);
      groundPlane(k(0.35), -1, 85, [600, 4, 600], [0.21, 0.45, 0.62]);
      groundPlane(k(0.60), -1, 95, [700, 4, 700], [0.22, 0.47, 0.64]);
      // Foreground shoreline shimmer + ripple bands (water near the track)
      groundPlane(k(0.48), -1, 35, [450, 4, 55], [0.30, 0.55, 0.68]);
      groundPlane(k(0.52), -1, 33, [480, 4, 60], [0.28, 0.52, 0.66]);
      // ---- Infield water planes (Albert Park Lake wraps the track's interior) ----
      for (let i = 0; i < 6; i++) {
        const s = 0.28 + (i / 6) * 0.35;
        groundPlane(k(s), -1, 105 + i * 12, [220, 4, 160], [0.26, 0.42, 0.58]);
      }
      // ---- Moored rowboats + kayaks (s≈0.45–0.55 water edge) ----
      // Recreational watercraft add authenticity to this active lakeside precinct
      for (let j = 0; j < 6; j++) {
        const a = anchor((k(0.47 + j * 0.025) + j * 15) % n, -1, 52 + hash(j * 7) * 35);
        if (onTrack(a.c[0], a.c[2], 3)) continue;
        // Small rowing shell hull
        addBox(out, vadd(a.c, a.u, 0.8), [1.8, 1.0, 8.5], [0.88, 0.85, 0.80], [a.r, a.u, a.t]);
        // Oar / rigger detail
        if (hash(j * 11) > 0.5)
          addCyl(out, vadd(a.c, a.t, -0.5), 0.08, 5.2, [0.40, 0.35, 0.28], 4, [a.r, a.u, a.t]);
      }

      // ====================================================================
      // MELBOURNE CBD SKYLINE — dense clustered towers across the lake
      // (s≈0.19–0.52 R). Iconic landmarks (Eureka Tower, Rialto) rise above
      // a dense mid-rise base. Blue-grey tones, varied window glazing.
      // ====================================================================
      const CBD_WIN = [0.55, 0.65, 0.80];
      const CBD_N = 52, CBD_S0 = 0.18, CBD_S1 = 0.53;  // extended span
      for (let i = 0; i < CBD_N; i++) {
        const f = i / (CBD_N - 1);
        const s = CBD_S0 + f * (CBD_S1 - CBD_S0);
        const dist = 210 + hash(i * 7) * 110;          // far, layered depth
        const w = 14 + hash(i * 3) * 16;               // wide, dense packing
        const h = 60 + hash(i * 11) * 165;             // tall, dramatic skyline
        const wallCol = [0.30 + hash(i * 5) * 0.10, 0.36 + hash(i * 2) * 0.08, 0.48];
        building(k(s), 1, dist - w / 2, w, h, w, {
          wall: wallCol, window: CBD_WIN, floor: 6,
          setback: hash(i * 13) > 0.55, roof: hash(i * 17) > 0.65,
        });
      }
      // Iconic signature towers: Eureka Tower + Rialto prominent on the skyline
      for (const [s, dist, bw, th, mast] of [
        [0.26, 270, 28, 260, 40],   // Eureka-like iconic spire (tallest)
        [0.34, 250, 24, 220, 24],   // Rialto-like prominent tower
        [0.41, 275, 26, 240, 0],    // another major landmark
        [0.21, 260, 22, 190, 32],   // mid-range signature
        [0.47, 265, 25, 210, 20]    // eastern precinct
      ]) {
        tower(k(s), 1, dist, bw, th, { col: [0.32, 0.40, 0.52], seg: 7,
          cap: true, capCol: [0.22, 0.30, 0.42], mast });
      }
      // Far-horizon silhouette band (hazy, atmospheric depth)
      for (let i = 0; i < 32; i++) {
        const f = i / 31;
        backdrop(k(CBD_S0 - 0.04 + f * (CBD_S1 - CBD_S0 + 0.08)), 1,
                 350 + hash(i * 5) * 150,
                 [28 + hash(i * 9) * 30, 48 + hash(i * 13) * 100, 24],
                 [0.38, 0.44, 0.52]);
      }
      // Mid-rise foreground layer across the lake (10–15 storey mix)
      for (let i = 0; i < 24; i++) {
        const f = i / 23;
        const s = CBD_S0 + f * (CBD_S1 - CBD_S0);
        const w = 20 + hash(i * 31) * 18, h = 32 + hash(i * 37) * 50;
        building(k(s), 1, 185 + hash(i * 41) * 35, w, h, w, {
          wall: [0.42, 0.48, 0.58], window: [0.54, 0.64, 0.78], floor: 5 });
      }
      // ---- Additional landmark cluster (cultural precinct, riverside buildings) ----
      const CBD_LANDMARKS = [
        [0.20, 215, 20, 155, [0.34, 0.42, 0.54]],
        [0.25, 230, 18, 180, [0.37, 0.44, 0.56]],
        [0.30, 205, 22, 170, [0.32, 0.40, 0.52]],
        [0.35, 245, 16, 200, [0.35, 0.43, 0.55]],
        [0.38, 225, 19, 165, [0.30, 0.38, 0.50]],
        [0.43, 240, 21, 190, [0.36, 0.44, 0.56]],
        [0.48, 220, 18, 175, [0.33, 0.41, 0.53]],
        [0.51, 235, 20, 210, [0.38, 0.46, 0.58]],
      ];
      for (const [s, dist, bw, bh, wc] of CBD_LANDMARKS) {
        building(k(s), 1, dist, bw, bh, bw, { wall: wc, window: [0.56, 0.66, 0.82], floor: 8 });
      }

      // ====================================================================
      // LOW distant Melbourne treeline backdrop, both sides (flat parkland)
      // ====================================================================
      every(80, (kk) => {
        for (const side of [-1, 1]) {
          backdrop(kk, side, 180 + hash(kk * 6 + side) * 70, [120, 18, 100], [0.18, 0.34, 0.20]);
        }
      });

      // ====================================================================
      // PARKLAND — lush dense broadleaf canopy + understory bushes
      // Albert Park is renowned for its leafy green parkland character
      // ====================================================================
      every(24, (kk) => {  // tighter spacing for denser feel
        for (const side of [-1, 1]) {
          if (hash(kk * 21 + side) > 0.72) continue;     // higher fill density
          const dist = 22 + hash(kk * 22 + side) * 65;
          tree(kk, side, dist, 9 + hash(kk * 24 + side) * 7, TREE);  // taller trees
          if (hash(kk * 27 + side) > 0.45)               // more frequent second tree
            tree(kk, side, dist + 12 + hash(kk * 29 + side) * 20,
                 8 + hash(kk * 33 + side) * 6, TREE);
          if (hash(kk * 31 + side) > 0.50) bush(kk, side, dist - 4, [0.18, 0.42, 0.18]);  // darker underbrush
        }
      });
      // Dense multiplex tree clusters at signature parkland zones (both sides)
      for (const [sc, cnt] of [[0.15, 9], [0.33, 8], [0.42, 7], [0.68, 8], [0.83, 7]]) {
        for (const side of [-1, 1]) {
          for (let j = 0; j < cnt; j++) {
            const kk = (k(sc) + j) % n;
            tree(kk, side, 20 + hash(kk * 3 + j + sc * 50) * 28,
                 9 + hash(kk * 5 + j) * 7, [0.19, 0.43, 0.19]);  // warmer, deeper green
            if (hash(kk * 7 + j) > 0.55)
              bush(kk, side, 16 + hash(kk * 9 + j) * 12, [0.17, 0.40, 0.17]);  // denser understory
          }
        }
      }

      // ---- Palm avenue along the fast Lakeside Drive section (s≈0.50–0.60 L) ----
      // Palms frame the dramatic lakeside section; sparser placement for cleaner sightlines
      for (let j = 0; j < 12; j++) {
        const kk = (k(0.51) + j * 2) % n;
        palm(kk, -1, 18 + hash(kk * 9 + j) * 12, 11 + hash(kk * 12 + j) * 5, [0.20, 0.46, 0.24]);
      }
      // palm accent clusters by the pits/start and around key grandstands
      for (let j = 0; j < 4; j++) {
        palm((k(0.0) + j * 2) % n, 1, 18 + j * 8, 12 + hash(j * 3) * 4, [0.20, 0.46, 0.24]);
        palm((k(0.95) + j * 2) % n, 1, 18 + j * 8, 12 + hash(j * 5) * 4, [0.20, 0.46, 0.24]);
        palm((k(0.62) + j * 2) % n, 1, 42 + j * 8, 11 + hash(j * 7) * 4, [0.20, 0.46, 0.24]);
      }
      // ---- Lakeside tree line (Morton Bay figs + eucalyptus) — denser, fuller canopy ----
      for (let i = 0; i < 40; i++) {
        const s = 0.27 + (i / 40) * 0.34;  // extended s=0.27 to 0.61 — premium lake-side coverage
        const kk = k(s);
        const d = 24 + hash(kk * 41 + i) * 28;
        tree(kk, -1, d, 9 + hash(kk * 43 + i) * 7, [0.20, 0.44, 0.20]);
        if (hash(kk * 45 + i) > 0.55)  // increased density
          tree(kk, -1, d + 16 + hash(kk * 47 + i) * 12, 11 + hash(kk * 49 + i) * 5, [0.20, 0.44, 0.20]);
      }
      // ---- Rowing boathouses + aquatic centre structures (s≈0.40 L) ----
      // Low-rise sports facility cluster on the infield lakeside
      for (let j = 0; j < 3; j++) {
        building(k(0.40 + j * 0.03), -1, 50 + j * 15, 16 + j * 2, 7, 28 + j * 3, {
          wall: [0.88, 0.90, 0.88], window: [0.20, 0.50, 0.70], floor: 3 });
      }
      // Lakeside Stadium structures (s≈0.62–0.68 L) — modern mixed-use facility
      for (let j = 0; j < 2; j++) {
        building(k(0.63 + j * 0.04), -1, 55 + j * 10, 18 + j * 2, 8, 32, {
          wall: [0.84, 0.86, 0.88], window: [0.30, 0.55, 0.75], floor: 3 });
      }

      // ====================================================================
      // GRANDSTANDS — main straight + signature corners (crowd-tinted)
      // ====================================================================
      grandstand(0.00, -1, 12, 90, SHELL, CROWD);   // main grandstand, pit straight L
      grandstand(0.07, -1, 14, 60, SHELL, CROWD);   // extended pit-straight bank L
      grandstand(0.04, 1, 14, 55, SHELL, CROWD);    // Turn 1-2 sweep R
      grandstand(0.12, 1, 16, 48, SHELL, CROWD);    // Turn 3 exit bank R
      grandstand(0.30, -1, 16, 50, SHELL, CROWD);   // lakeside spectator bank L
      grandstand(0.55, -1, 16, 55, SHELL, CROWD);   // Lakeside Drive bank L
      grandstand(0.62, 1, 14, 60, SHELL, CROWD);    // spectator grandstand R
      grandstand(0.66, 1, 16, 45, SHELL, CROWD);    // adjoining spectator bank R
      grandstand(0.78, -1, 14, 45, SHELL, CROWD);   // chicane complex L
      grandstand(0.90, 1, 18, 50, SHELL, CROWD);    // fan-hill grandstand R
      grandstand(0.95, -1, 14, 48, SHELL, CROWD);   // pit-approach bank L
      grandstand(0.20, 1, 16, 46, SHELL, CROWD);    // fast section R
      grandstand(0.45, -1, 16, 44, SHELL, CROWD);   // lakeside bank L

      // ---- Pit building + garages: long low white box row, dark roof (s≈0.0 R)
      building(k(0.0), 1, 5, 14, 9, 180, { wall: [0.86, 0.87, 0.88], window: [0.18, 0.22, 0.28], floor: 4 });
      {
        const a = anchor(k(0.0), 1, 12);
        addBox(out, vadd(a.c, a.u, 9.6), [18, 0.8, 190], [0.30, 0.32, 0.34], [a.r, a.u, a.t]); // dark roof slab
      }
      // marquee tent caps beside the s≈0.62 grandstand
      for (let j = 0; j < 3; j++) {
        const a = anchor(k(0.62), 1, 30 + j * 10);
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
      // HEDGES + clipped treelines — continuous parkland borders framing the
      // racing surface (clearance-based, never on tarmac)
      // ====================================================================
      hedge(0.10, 0.18, 1, 9, 1.6, [0.18, 0.36, 0.16]);
      hedge(0.13, 0.20, -1, 10, 1.5, [0.18, 0.36, 0.16]);
      hedge(0.32, 0.40, 1, 11, 1.7, [0.17, 0.35, 0.16]);
      hedge(0.66, 0.74, -1, 9, 1.5, [0.18, 0.36, 0.16]);
      hedge(0.82, 0.90, 1, 10, 1.6, [0.17, 0.35, 0.16]);
      hedge(0.92, 0.99, -1, 9, 1.4, [0.18, 0.36, 0.16]);

      // ====================================================================
      // TRACKSIDE FURNITURE — catch fences, armco guardrails, tyre walls,
      // marshal posts. Spans use clearance gaps so faces never reach tarmac.
      // ====================================================================
      // catch fences behind the grandstand banks (spectator protection)
      fence(0.00, 0.09, -1, 9, 4.0, [0.74, 0.76, 0.80]);   // main straight L
      fence(0.04, 0.14, 1, 10, 3.6, [0.74, 0.76, 0.80]);   // T1-3 sweep R
      fence(0.60, 0.70, 1, 9, 3.6, [0.74, 0.76, 0.80]);    // spectator stand R
      fence(0.76, 0.82, -1, 9, 3.6, [0.74, 0.76, 0.80]);   // chicane L

      // armco guardrails on the fast lakeside / flowing edges
      guardrail(0.42, 0.58, -1, 3.0, [0.85, 0.18, 0.16]);  // Lakeside Drive L
      guardrail(0.20, 0.30, 1, 3.0, [0.90, 0.90, 0.92]);   // R sweep
      guardrail(0.85, 0.95, 1, 3.0, [0.90, 0.90, 0.92]);   // pit approach R

      // tyre-stack barriers at the tight chicane complex (street-section feel)
      tyreWall(0.77, 0.80, 1, 3.5, RED);                   // chicane outer R
      tyreWall(0.78, 0.81, -1, 3.5, WHITE);                // chicane outer L

      // marshal posts at signature corners
      for (const [s, side] of [[0.05, 1], [0.30, 1], [0.55, -1],
                                [0.62, 1], [0.78, -1], [0.90, 1]]) {
        marshalPost(k(s), side, 6);
      }

      // ====================================================================
      // PIT / PADDOCK precinct — control tower, garage roof detail, support
      // trucks and motorhomes behind the pit building (s≈0.0 → 0.05 R)
      // ====================================================================
      tower(k(0.02), 1, 26, 12, 26, { col: [0.80, 0.82, 0.85], seg: 4,
        cap: true, capCol: [0.20, 0.24, 0.30], mast: 8 });          // race control tower
      // paddock motorhome / hospitality row behind pits
      for (let j = 0; j < 6; j++) {
        const kk = (k(0.0) + j * 8) % n;
        building(kk, 1, 34, 12, 7 + hash(j * 3) * 3, 14, {
          wall: [[0.86, 0.87, 0.88], [0.30, 0.40, 0.60], [0.70, 0.30, 0.25],
                 [0.80, 0.78, 0.40], [0.55, 0.55, 0.58], [0.20, 0.55, 0.50]][j % 6],
          window: [0.18, 0.22, 0.28], floor: 4 });
      }
      // support trucks (cab + box trailer) parked in the paddock
      for (let j = 0; j < 5; j++) {
        const a = anchor((k(0.0) + j * 10) % n, 1, 56 + hash(j * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 6)) continue;
        addBox(out, vadd(a.c, a.u, 2.0), [4, 4, 13], [0.90, 0.90, 0.92], [a.r, a.u, a.t]); // box
        addBox(out, vadd(vadd(a.c, a.u, 1.6), a.t, 8), [3.6, 3.2, 4], [0.30, 0.32, 0.40], [a.r, a.u, a.t]); // cab
      }
      // ---- Paddock club + flagpole at main entrance (s=0.0–0.08) ----
      building(k(0.04), 1, 48, 20, 12, 30, { wall: [0.82, 0.84, 0.86], window: [0.30, 0.38, 0.50], floor: 3 });
      {
        const ap = anchor(k(0.01), -1, 22);
        addCyl(out, ap.c, 0.18, 18, [0.28, 0.32, 0.38], 4, [ap.r, ap.u, ap.t]);
        addBox(out, vadd(ap.c, ap.u, 18), [3.0, 1.5, 0.3], [0.80, 0.18, 0.18], [ap.r, ap.u, ap.t]); // red flag
      }

      // ====================================================================
      // PARKLAND AMENITIES — public park facilities, lighting, recreational
      // infrastructure, and multi-layered forest depth for visual richness
      // ====================================================================
      // Modern street lights along the main straight + pit approach + spectator routes
      for (let j = 0; j < 10; j++) {
        for (const side of [-1, 1]) {
          const a = anchor((k(0.0) + j * 12) % n, side, 9);
          if (onTrack(a.c[0], a.c[2], 1)) continue;
          addCyl(out, a.c, 0.13, 7.5, [0.32, 0.32, 0.34], 5, [a.r, a.u, a.t]);  // pole
          addBox(out, vadd(a.c, a.u, 7.5), [0.8, 0.5, 1.8], [0.96, 0.92, 0.65], [a.r, a.u, a.t]);  // lantern
        }
      }
      // Colourful event marquees + hospitality tents behind major grandstands
      for (const [s, side, cnt] of [[0.64, 1, 4], [0.32, -1, 4], [0.88, 1, 3], [0.12, -1, 3]]) {
        for (let j = 0; j < cnt; j++) {
          const a = anchor((k(s) + j * 6) % n, side, 40 + j * 10);
          if (onTrack(a.c[0], a.c[2], 6)) continue;
          // tent body
          addBox(out, vadd(a.c, a.u, 2.0), [10, 4.0, 10],
                 [0.94, 0.94, 0.95], [a.r, a.u, a.t]);
          // tent roof (ridge)
          addPrism(out, vadd(a.c, a.u, 4.8), [10, 1.8, 10],
                   [[0.88, 0.32, 0.22], [0.22, 0.48, 0.72], [0.92, 0.82, 0.28]][j % 3],
                   [a.r, a.u, a.t]);
        }
      }
      // ---- Far-background forest canopy layer (visual depth, atmospheric) ----
      every(36, (kk) => {
        for (const side of [-1, 1]) {
          if (hash(kk * 53 + side) > 0.50) continue;  // sparser but present
          const dist = 80 + hash(kk * 57 + side) * 80;
          tree(kk, side, dist, 10 + hash(kk * 61 + side) * 8, [0.18, 0.40, 0.18]);
        }
      });
      // ---- Botanical Garden + Parkland native trees (s=0.68–0.82) ----
      // This section features distinctive Australian native greenery
      const NATIVE_GREENS = [[0.20, 0.44, 0.19], [0.22, 0.48, 0.21], [0.16, 0.40, 0.17], [0.21, 0.46, 0.20]];
      for (let i = 0; i < 12; i++) {
        const s = 0.68 + (i / 12) * 0.14;
        const kk = k(s);
        const side = (i % 2) ? 1 : -1;
        tree(kk, side, 32 + hash(kk * 71 + i) * 32, 11 + hash(kk * 73 + i) * 9, NATIVE_GREENS[i % 4]);
        if (hash(kk * 75 + i) > 0.52)
          tree(kk, side, 54 + hash(kk * 77 + i) * 22, 13 + hash(kk * 79 + i) * 7, NATIVE_GREENS[(i + 1) % 4]);
      }

      // ====================================================================
      // BILLBOARDS + start gantry + sponsor hoardings
      // ====================================================================
      billboard(k(0.30), 1, 18, 14, 5, [0.20, 0.40, 0.70]);
      billboard(k(0.55), -1, 16, 14, 5, [0.86, 0.30, 0.20]);
      billboard(k(0.12), 1, 16, 12, 4.5, [0.90, 0.80, 0.20]);
      billboard(k(0.45), -1, 18, 12, 4.5, [0.20, 0.60, 0.45]);
      billboard(k(0.70), 1, 16, 12, 4.5, [0.80, 0.30, 0.50]);
      billboard(k(0.85), -1, 16, 12, 4.5, [0.30, 0.45, 0.70]);
      gantry(0.0, 7.5, [0.30, 0.32, 0.36]);
      gantry(0.50, 7.0, [0.25, 0.27, 0.32]);   // mid-lap timing gantry

      void prop; void cx; void cz;
    },
  }
  );
})();
