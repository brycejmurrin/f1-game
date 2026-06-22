/* Apex 26 — INTERLAGOS circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "interlagos",
    name: "INTERLAGOS",
    gp: "São Paulo GP",
    country: "Brazil",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    terrainOuter: 45,
    pal: { zenith: [0.32, 0.50, 0.72], horizon: [0.58, 0.68, 0.60], grass: [0.26, 0.48, 0.22], fog: [0.52, 0.58, 0.56], fogDensity: 0.0018, sunDir: [0.18032487743269374, 0.8214799971933825, 0.5409746322980812], sun: [1, 0.96, 0.84], sunColor: [1, 0.94, 0.82] },
    segs: [
      { t: 0, l: 240, h: 8 }, { t: -55, l: 100, h: -10 }, { t: 40, l: 90, h: -6 }, { t: -20, l: 400, h: -4 }, { t: -60, l: 110 }, { t: -50, l: 100, h: 6 },
      { t: 70, l: 100 }, { t: -80, l: 110 }, { t: 0, l: 160 }, { t: -90, l: 100 }, { t: 60, l: 90 }, { t: -70, l: 100 },
      { t: -110, l: 140, h: 6 }, { t: -20, l: 440, h: 18 },
    ],
    // Climb from the Senna S up to the start/finish (the lap's ~40 m of relief).
    elevations: [{ s: 0.86, halfM: 480, rise: 10 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, groundYAt,
              addBox, every, onTrack, hash, vadd, anchor, along, building, tower,
              grandstand, billboard, gantry, marshalPost, fence, guardrail, wall,
              tyreWall, pine, tree, palm, bush, hedge, peak, ridge, mountain,
              addCyl, addCone, addPrism, addPyramid, forestEdge, cityFront } = api;
      const K = (s) => Math.round(s * n) % n;

      // Tropical palette constants
      const GREEN  = [0.20, 0.44, 0.20];
      const GREEN2 = [0.24, 0.48, 0.22];
      // Lit-window yellow (simulates emissive glow; bright warm amber)
      const LIT_WIN = [0.98, 0.90, 0.38];
      // Dim lamp-head colour (warm white)
      const LAMP    = [0.96, 0.96, 0.82];

      // ===================================================================
      // PIT / PADDOCK COMPLEX (s≈0.00, R close) — the iconic hub
      // ===================================================================
      const kpit = K(0.0);
      tower(kpit, 1, 14, 18, 56, { col: [0.52, 0.50, 0.48], seg: 6, cap: true,
                                   capCol: [0.22, 0.24, 0.28], mast: 18 });
      building(kpit, 1, 8, 14, 16, 32, { wall: [0.62, 0.62, 0.64],
               window: [0.24, 0.32, 0.40], floor: 3.6 });

      // Long low pit garages running down the pit straight
      for (const s of [0.97, 0.99, 0.01, 0.03]) {
        building(K(s), 1, 6, 11, 8, 24, { wall: [0.68, 0.68, 0.70],
                 window: [0.30, 0.34, 0.42], floor: 3.2, roof: [0.52, 0.52, 0.56] });
      }

      // Paddock hospitality / motorhomes behind the pits
      for (const s of [0.95, 0.98, 0.02, 0.05]) {
        const k = K(s);
        const anc = anchor(k, 1, 42 + hash(k) * 16);
        addBox(out, vadd(anc.c, anc.u, 3), [11, 6, 18],
               [0.82, 0.84, 0.86], [anc.r, anc.u, anc.t]);
      }

      // Pit wall: solid low concrete barrier on the R of the pit straight
      wall(0.96, 0.06, 1, 2.4, 1.1, [0.82, 0.82, 0.84], 0.45);

      // Pit-straight grandstand (Brazil green crowd) — main start/finish stands
      grandstand(0.94, 1, 9, 80, [0.48, 0.49, 0.54], [0.32, 0.54, 0.36]);

      // Start/finish gantry + second timing gantry
      gantry(0.005, 8.2, [0.20, 0.22, 0.26]);
      gantry(0.88,  7.0, [0.22, 0.24, 0.28]);

      // ---- Helicopter pad in paddock (s≈0.025) ----
      {
        const ahp = anchor(K(0.025), 1, 40);
        addBox(out, vadd(ahp.c, ahp.u, 0.1), [20, 0.2, 20], [0.52, 0.54, 0.54], [ahp.r, ahp.u, ahp.t]);
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [18, 0.2, 2.0], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [2.0, 0.2, 18], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
      }

      // ---- Lamp posts along pit straight (night-ready warm fixtures) ----
      for (const s of [0.94, 0.96, 0.98, 0.00, 0.02, 0.04]) {
        const k = K(s);
        for (const side of [-1, 1]) {
          const anc = anchor(k, side, 14);
          if (onTrack(anc.c[0], anc.c[2], 3)) continue;
          // post
          addCyl(out, anc.c, 0.14, 10, [0.32, 0.32, 0.34], 5, [anc.r, anc.u, anc.t]);
          // lamp head (bright warm disc on top)
          addBox(out, vadd(anc.c, anc.u, 10.3), [2.2, 0.35, 0.7], LAMP, [anc.r, anc.u, anc.t]);
        }
      }

      // ===================================================================
      // MAIN GRANDSTAND TIER (s≈0.01–0.09, L) — big stands on the climb
      // The iconic Arquibancada Curva 1 (large bowl stand at Turn 1)
      // ===================================================================
      grandstand(0.01, -1, 10, 120, [0.42, 0.43, 0.48], [0.34, 0.54, 0.38]);
      grandstand(0.05, -1, 11,  85, [0.44, 0.45, 0.50], [0.36, 0.56, 0.40]);
      grandstand(0.09, -1, 12,  90, [0.40, 0.41, 0.46], [0.32, 0.52, 0.36]);
      for (const s of [0.00, 0.04, 0.08]) billboard(K(s), -1, 26, 16, 7, [0.94, 0.92, 0.88]);

      // ===================================================================
      // SENNA S (s≈0.05, both close): kerbs, tyre walls, lush tropical greenery
      // ===================================================================
      for (const [s, side] of [[0.045, -1], [0.065, 1], [0.085, -1]]) {
        const k = K(s);
        place(k, side, 2,   [0.5, 0.18, 7], [0.80, 0.18, 0.18]);
        place(k, side, 4.2, [3.0, 0.18, 7], [0.92, 0.92, 0.92]);
      }
      // Tyre barriers at the Senna S chicane — blue/white for Turn 1, yellow for T2
      tyreWall(0.04, 0.07,  1, 5, [0.92, 0.92, 0.92]);
      tyreWall(0.06, 0.09, -1, 5, [0.30, 0.55, 0.85]);
      marshalPost(K(0.05),   1, 8);
      marshalPost(K(0.085), -1, 8);

      // Hero downhill plunge: LUSH tropical greenery framing the Senna S
      // Use forestEdge to guarantee no clipping through barriers
      forestEdge(0.04, 0.10,  1, 16, { density: 0.6, hMin: 9, hMax: 15,
                                        col: [0.18, 0.42, 0.18], col2: [0.24, 0.48, 0.24], pineFrac: 0.4 });
      forestEdge(0.04, 0.10, -1, 22, { density: 0.4, hMin: 10, hMax: 16,
                                        col: [0.20, 0.44, 0.20], col2: [0.26, 0.50, 0.24], pineFrac: 0.35 });
      // Add scattered palms for tropical character
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.08, 1], [0.10, -1]]) {
        const k = K(s);
        palm(k, side, 26 + hash(k * 9) * 10, 11 + hash(k * 13) * 5, [0.26, 0.48, 0.22]);
        bush(k, side, 18 + hash(k * 11) * 8, [0.26, 0.50, 0.24]);
      }

      // ===================================================================
      // FAVELA HILLSIDE (s≈0.10–0.30, L far)
      // Colourful stacked houses on the hillside — São Paulo's favelas
      // anchored individually so each sits on its own terrain height.
      // Houses are pushed further back (120m+) so they clear the track/barriers.
      // A forestEdge screens the near ground so boxes don't float visibly.
      // ===================================================================
      const favCol = [
        [0.88, 0.32, 0.28], [0.96, 0.80, 0.22], [0.28, 0.58, 0.84],
        [0.92, 0.92, 0.88], [0.62, 0.74, 0.50], [0.88, 0.44, 0.32],
        [0.94, 0.64, 0.28], [0.38, 0.64, 0.64], [0.82, 0.28, 0.38],
        [0.86, 0.38, 0.60], [0.80, 0.72, 0.24], [0.44, 0.58, 0.78],
      ];

      // Dense treeline screens the favela base so boxes sitting on slope are masked
      forestEdge(0.10, 0.32, -1, 30, { density: 0.75, hMin: 8, hMax: 14,
                                        col: [0.18, 0.40, 0.18], col2: [0.22, 0.44, 0.20], pineFrac: 0.3 });

      // Favela houses: clustered in groups, each individually anchored to terrain
      every(28, (k) => {
        const side = -1;
        // Focus density around the middle of the hillside stretch
        const near = Math.min((k - K(0.18)) + n, (K(0.18) - k + n)) % n < n * 0.10;
        if (!near && hash(k * 61) > 0.60) return;

        const cols = (near ? 3 : 2) + Math.floor(hash(k * 62) * 2);
        for (let col = 0; col < cols; col++) {
          // Push all houses further back: 120m minimum so they clear barriers
          const baseDist = 120 + col * 24 + hash(k * 63 + col) * 20;
          const rows = 2 + Math.floor(hash(k * 71 + col) * 2);
          for (let row = 0; row < rows; row++) {
            const d = baseDist + row * 16 + hash(k * 72 + col + row * 7) * 10;
            const p = anchor(k, side, d);
            if (onTrack(p.c[0], p.c[2], 9)) continue;
            const hw = 7  + hash(k * 66 + col + row) * 4;
            const hh = 5  + hash(k * 64 + col + row) * 4;
            const hd = hw + hash(k * 67 + col + row) * 2;
            const colIdx = Math.floor(hash(k * 65 + col + row) * 12) % 12;
            // House body — centre is hh/2 above the terrain at this exact point
            const centre = vadd(p.c, p.u, hh / 2);
            addBox(out, centre, [hw, hh, hd], favCol[colIdx], [p.r, p.u, p.t]);
            // Lit window bands (warm amber — read as emissive at dusk/night)
            const winH = 0.9;
            const winW = hw * 0.82;
            const winD = hd * 1.01;
            if (hh > 6) {
              const winC = [0.98, 0.88 + hash(k * 68 + col + row) * 0.08, 0.28];
              addBox(out, vadd(centre, p.u, hh * 0.26), [winW, winH, winD], winC, [p.r, p.u, p.t]);
            }
            // Terracotta-orange A-frame roof prism
            addPrism(out,
              vadd(p.c, p.u, hh),
              [hw * 1.06, hh * 0.25, hd * 1.04],
              [0.76, 0.38, 0.22],
              [p.r, p.u, p.t]);
          }
        }
      });

      // ---- Favela hillside: taller landmark buildings (s=0.12–0.30) ----
      // These act as "anchor" accent buildings on the favela hill;
      // placed at 145–200m clearance so they don't clip the track
      const FAV_COLS = [
        [0.84, 0.42, 0.36], [0.36, 0.64, 0.82], [0.88, 0.76, 0.28],
        [0.82, 0.32, 0.40], [0.92, 0.56, 0.22], [0.32, 0.50, 0.80],
      ];
      for (let i = 0; i < 6; i++) {
        const s = 0.12 + (i / 6) * 0.18;
        const dist = 145 + i * 10;
        const bh = 12 + hash(K(s) * 11 + i) * 14;
        building(K(s), -1, dist, 14, bh, 14,
          { wall: FAV_COLS[i % 6], window: LIT_WIN, floor: 2.8, lit: true });
      }

      // ===================================================================
      // RETA OPOSTA straight (s=0.25, R mid): open green banks + advert boards
      // ===================================================================
      for (const s of [0.22, 0.25, 0.28]) billboard(K(s), 1, 10, 13, 5, [0.92, 0.92, 0.90]);
      hedge(0.20, 0.32, 1, 15, 2.4, GREEN);
      grandstand(0.27, -1, 12, 72, [0.43, 0.44, 0.49], [0.32, 0.52, 0.36]);
      marshalPost(K(0.24), 1, 8);

      // ===================================================================
      // REPRESA DO GUARAPIRANGA — the reservoir / lake (s=0.35, L far)
      // Water planes pushed well off-track; dense shoreline vegetation with
      // forestEdge so no foliage pokes through barriers.
      // ===================================================================
      groundPlane(K(0.33), -1, 220, [300, 2, 230], [0.21, 0.41, 0.50]);
      groundPlane(K(0.42), -1, 230, [260, 2, 200], [0.20, 0.40, 0.48]);

      // Dense shoreline forestEdge — guaranteed no barrier clipping
      forestEdge(0.28, 0.48, -1, 28, { density: 0.80, hMin: 10, hMax: 18,
                                        col: [0.18, 0.42, 0.18], col2: [0.22, 0.46, 0.18], pineFrac: 0.25 });
      // Palms near water's edge for tropical look
      for (const s of [0.30, 0.34, 0.38, 0.42, 0.46]) {
        const k = K(s);
        palm(k, -1, 52 + hash(k * 7) * 22, 12 + hash(k * 11) * 5, [0.24, 0.46, 0.20]);
        palm(k, -1, 70 + hash(k * 13) * 18, 10 + hash(k * 17) * 4, [0.26, 0.48, 0.22]);
      }

      // ===================================================================
      // DESCIDA DO LAGO (s=0.45, both mid): gravel trap + hedge + tyre wall
      // ===================================================================
      groundPlane(K(0.45), 1, 6, [40, 1.2, 30], [0.62, 0.56, 0.40]);
      hedge(0.42, 0.50, -1, 14, 2.0, GREEN);
      tyreWall(0.44, 0.48, 1, 5, [0.85, 0.30, 0.30]);
      marshalPost(K(0.46), -1, 8);

      // ===================================================================
      // SÃO PAULO HIGH-RISE SKYLINE (s=0.48–0.78, R far)
      // Use cityFront for a coherent, aligned street-wall of towers.
      // Mid-distance: gap=180 so they sit on the horizon without clipping.
      // São Paulo typical: mixed heights 40-80m, glass+concrete facades.
      // lit:true → windows bright amber; night legibility guaranteed.
      // ===================================================================
      const SP_PALETTE = [
        [0.50, 0.52, 0.58], [0.54, 0.56, 0.62], [0.46, 0.48, 0.54],
        [0.60, 0.58, 0.54], [0.52, 0.54, 0.60], [0.48, 0.50, 0.56],
      ];
      cityFront(0.48, 0.78, 1, 180, {
        minH: 40, maxH: 78,
        depth: 28,
        palette: SP_PALETTE,
        lit: true,
        windowCol: LIT_WIN,
        step: 20,
        floor: 8,
      });

      // Second row of shorter buildings behind the first (depth effect)
      cityFront(0.50, 0.76, 1, 230, {
        minH: 24, maxH: 52,
        depth: 22,
        palette: [
          [0.44, 0.46, 0.52], [0.58, 0.56, 0.52], [0.50, 0.48, 0.54],
        ],
        lit: true,
        windowCol: [0.95, 0.82, 0.48],
        step: 26,
        floor: 7,
      });

      // ---- Distant city envelope on the horizon (ring of far silhouette towers) ----
      // Compute track centroid for the ring anchor
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // Far-haze horizon ring — haze-toned silhouette towers, 30–60 m heights
      const ring = rad + 320;
      for (let i = 0; i < 36; i++) {
        const a = i / 36 * 6.2832, h = hash(i * 7 + 280);
        const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
        if (onTrack(x, z, 10)) continue;
        const u = [0, 1, 0];
        const r = [Math.cos(a + 1.5708), 0, Math.sin(a + 1.5708)];
        const f = [Math.cos(a), 0, Math.sin(a)];
        const ht = 28 + h * 44, w = 18 + hash(i * 11 + 280) * 14;
        // Warm grey + slight atmospheric blue-purple haze
        const base = 0.46 + hash(i * 13 + 280) * 0.08;
        addBox(out, [x, pyMin + ht / 2, z], [w, ht, w * 0.7],
               [base, base * 1.00, base * 1.05], [r, u, f]);
        // Lit window band on each distant building
        addBox(out, [x, pyMin + ht * 0.60, z], [w * 1.01, ht * 0.05, w * 0.71],
               LIT_WIN, [r, u, f]);
      }

      // ===================================================================
      // FERRADURA / INFIELD ESSES (s=0.70, L mid): tyre walls + grandstand + trees
      // ===================================================================
      tyreWall(0.67, 0.73, -1, 4, [0.92, 0.80, 0.22]);
      grandstand(0.71, 1, 12, 64, [0.40, 0.41, 0.46], [0.32, 0.52, 0.36]);
      marshalPost(K(0.70), -1, 9);
      // Use forestEdge for clean treeline (no poke-through)
      forestEdge(0.64, 0.76, -1, 18, { density: 0.55, hMin: 9, hMax: 14,
                                        col: [0.18, 0.40, 0.18], col2: [0.20, 0.44, 0.20], pineFrac: 0.5 });
      for (const s of [0.66, 0.70, 0.74]) {
        const k = K(s);
        tree(k, 1, 22 + hash(k * 5) * 16, 10 + hash(k * 7) * 6, [0.20, 0.44, 0.20]);
      }

      // ===================================================================
      // JUNÇÃO (s=0.82, L close): tight uphill left, kerbs + grandstand
      // ===================================================================
      const kj = K(0.82);
      place(kj, -1, 2,   [0.5, 0.18, 9], [0.80, 0.18, 0.18]);
      place(kj, -1, 4.2, [3.0, 0.18, 9], [0.92, 0.92, 0.92]);
      tyreWall(0.80, 0.84, -1, 5, [0.30, 0.55, 0.85]);
      grandstand(0.84, 1, 11, 58, [0.41, 0.42, 0.47], [0.30, 0.52, 0.34]);
      marshalPost(K(0.82), 1, 9);
      for (const s of [0.84, 0.86]) billboard(K(s), 1, 11, 13, 5, [0.92, 0.90, 0.86]);

      // ===================================================================
      // CLIMB TO S/F — Subida dos Boxes (s=0.88–0.96, both mid)
      // ===================================================================
      for (const s of [0.88, 0.92, 0.96]) {
        const k = K(s);
        place(k, 1, 2.5, [1.0, 1.1, 10], [0.78, 0.78, 0.80]);
      }
      grandstand(0.90, -1, 10, 70, [0.42, 0.43, 0.48], [0.30, 0.52, 0.34]);

      // ===================================================================
      // CONTINUOUS TRACK FURNITURE — fences, armco, guardrails
      // ===================================================================
      fence(0.90, 0.10, -1, 4.0, 3.4, [0.66, 0.68, 0.70]);
      fence(0.24, 0.30,  1, 4.0, 3.0, [0.64, 0.66, 0.68]);
      fence(0.68, 0.74,  1, 4.0, 3.0, [0.64, 0.66, 0.68]);
      guardrail(0.10, 0.22,  1, 3.0, [0.74, 0.74, 0.78]);
      guardrail(0.30, 0.42, -1, 3.0, [0.74, 0.74, 0.78]);
      guardrail(0.50, 0.66,  1, 3.0, [0.74, 0.74, 0.78]);

      // Marshal posts spaced around the lap (orange roofs)
      for (const s of [0.12, 0.20, 0.34, 0.56, 0.62, 0.76, 0.90]) {
        marshalPost(K(s), (hash(K(s)) > 0.5 ? 1 : -1), 7);
      }

      // ===================================================================
      // GREEN HILLS ringing the park (between track & city backdrop)
      // Wide low wooded ridges set behind favela/tower bands — green ridgeline
      // for depth layering.
      // ===================================================================
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * 6.2832, h = hash(i * 17 + 3);
        const rng = rad + 260 + h * 100;
        const x = cx + Math.cos(a) * rng, z = cz + Math.sin(a) * rng;
        if (onTrack(x, z, 12)) continue;
        ridge(x, z, pyMin, a + 1.5708, 240 + h * 140, 160 + h * 80, 34 + h * 28,
              [0.22, 0.43 + h * 0.07, 0.23]);
      }

      // ===================================================================
      // PERVASIVE TROPICAL-GREEN VEGETATION around the lap
      // Use forestEdge for the main track perimeter (no clipping guaranteed)
      // ===================================================================
      // Selective forest sections — avoid favela and skyline sections
      forestEdge(0.10, 0.20,  1, 20, { density: 0.50, hMin: 8, hMax: 14,
                                        col: GREEN, col2: GREEN2, pineFrac: 0.4 });
      forestEdge(0.48, 0.66, -1, 20, { density: 0.45, hMin: 9, hMax: 15,
                                        col: GREEN, col2: GREEN2, pineFrac: 0.35 });
      forestEdge(0.76, 0.88,  1, 16, { density: 0.50, hMin: 8, hMax: 13,
                                        col: GREEN, col2: GREEN2, pineFrac: 0.45 });

      // Supplemental scattered trees (not near favela/skyline strips)
      every(22, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.48) continue;
          const d = 30 + hash(k * 92 + side) * 60;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 93 + side);
          if      (r > 0.62) tree(k, side, d, 10 + hash(k * 94 + side) * 6, [0.22, 0.46, 0.22]);
          else if (r > 0.31) pine(k, side, d, 12 + hash(k * 95 + side) * 6, [0.20, 0.42, 0.20]);
          else               bush(k, side, d, [0.24, 0.48, 0.24]);
        }
      });

      // ---- Palms near the reservoir (sparser, selective) ----
      for (let i = 0; i < 20; i++) {
        const s = 0.30 + (i / 20) * 0.20;
        const kk = K(s);
        if (hash(kk * 97 + i) > 0.50) continue;
        const d = 40 + hash(kk * 98 + i) * 28;
        palm(kk, -1, d, 12 + hash(kk * 99 + i) * 6, [0.20, 0.46, 0.18]);
      }
    },
  }
  );
})();
