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
      // Hill green for backdrop mounds
      const HILL   = [0.22, 0.46, 0.20];
      const HILL2  = [0.26, 0.52, 0.22];
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
      //
      // Real Interlagos geography: the hillside favela (Paraisópolis / nearby
      // communities) climbs the green ridge on the L side. Two depth layers:
      //   1. backdrop() GREEN mounds → organic rounded hill silhouette (no boxy slabs)
      //   2. building() clusters at 50–120 m in vivid tropical colours, anchored
      //      per-building so each sits on the sloped terrain — no floating.
      //
      // The forestEdge near-screens the base so any slight floating is masked by
      // the treeline canopy. Houses are NOT floated via raw addBox/addPrism;
      // building() uses groundYAt() internally so each is properly grounded.
      // ===================================================================

      // ---- Layer 0: Green wooded hillside backdrop (rounded mounds, NOT flat slabs) ----
      // backdrop() auto-detects GREEN dominant → renders as rounded organic hill
      every(30, (k) => {
        // Only L side (side=-1) for the favela hillside
        const inFavela = (() => {
          // nodes that lie between s=0.08 and s=0.32
          const k0 = K(0.08), k1 = K(0.32);
          const span = ((k1 - k0) + n) % n;
          const off  = ((k  - k0) + n) % n;
          return off <= span;
        })();
        if (!inFavela) return;
        const hv = hash(k * 17 + 3);
        // Two distance bands: near ridge (~90 m) and far ridge (~160 m)
        backdrop(k, -1, 90 + hv * 30, [120, 28 + hv * 18, 80], HILL);
        if (hash(k * 23 + 5) > 0.4) {
          backdrop(k, -1, 150 + hash(k * 29) * 40, [140, 22 + hash(k * 31) * 16, 90], HILL2);
        }
      });

      // ---- Layer 1: Near treeline screens the favela base ----
      forestEdge(0.10, 0.32, -1, 30, { density: 0.75, hMin: 8, hMax: 14,
                                        col: [0.18, 0.40, 0.18], col2: [0.22, 0.44, 0.20], pineFrac: 0.3 });

      // ---- Layer 2: Favela buildings — building() is properly grounded ----
      // Vivid tropical palette: terracotta, warm yellow, faded teal, ochre, pink
      const FAV_WALL = [
        [0.88, 0.42, 0.30],   // terracotta-red
        [0.92, 0.78, 0.28],   // warm yellow
        [0.78, 0.62, 0.48],   // clay tan
        [0.86, 0.46, 0.34],   // warm orange
        [0.70, 0.74, 0.54],   // faded sage green
        [0.90, 0.62, 0.30],   // amber ochre
        [0.82, 0.46, 0.56],   // dusty rose
        [0.74, 0.68, 0.54],   // light khaki
        [0.84, 0.34, 0.30],   // coral red
        [0.96, 0.84, 0.34],   // sunflower yellow
        [0.78, 0.56, 0.38],   // warm sand
        [0.68, 0.78, 0.52],   // tropical light-green
      ];
      // Compact near-row: 50–90 m (visible above forestEdge canopy)
      every(26, (k) => {
        const inFavela = (() => {
          const k0 = K(0.10), k1 = K(0.30);
          const span = ((k1 - k0) + n) % n;
          const off  = ((k  - k0) + n) % n;
          return off <= span;
        })();
        if (!inFavela) return;
        if (hash(k * 61) > 0.75) return;   // ~75% coverage → natural gaps

        const colIdx = Math.floor(hash(k * 65) * FAV_WALL.length) % FAV_WALL.length;
        const col2   = Math.floor(hash(k * 67) * FAV_WALL.length) % FAV_WALL.length;
        const dist1  = 50 + hash(k * 63) * 28;
        const dist2  = dist1 + 22 + hash(k * 71) * 18;
        const h1     =  6 + hash(k * 64) * 5;
        const h2     =  5 + hash(k * 66) * 5;
        const w1     = 10 + hash(k * 68) * 6;
        const w2     =  9 + hash(k * 70) * 5;

        // Near house
        building(k, -1, dist1, w1, h1, w1 * 0.80,
          { wall: FAV_WALL[colIdx], window: LIT_WIN, floor: 2.6, lit: false });
        // Far house (slightly behind, different colour) — building() guards internally
        building(k, -1, dist2, w2, h2, w2 * 0.85,
          { wall: FAV_WALL[col2], window: LIT_WIN, floor: 2.4, lit: false });
      });

      // ---- Favela accent: a few taller landmark buildings on the hillcrest ----
      // Use building() with warm colours so they look like real Brazilian buildings,
      // not dark silhouette boxes. Spaced so they don't crowd.
      const LAND_COLS = [
        [0.84, 0.44, 0.36],   // warm terracotta
        [0.90, 0.76, 0.32],   // ochre yellow
        [0.78, 0.56, 0.40],   // tan/clay
        [0.88, 0.50, 0.28],   // orange
        [0.76, 0.68, 0.46],   // khaki
        [0.86, 0.38, 0.44],   // rose
      ];
      for (let i = 0; i < 6; i++) {
        const s    = 0.12 + (i / 6) * 0.18;
        const dist = 110 + i * 12;
        const bh   = 14 + hash(K(s) * 11 + i) * 12;
        building(K(s), -1, dist, 14, bh, 14,
          { wall: LAND_COLS[i % 6], window: LIT_WIN, floor: 3.0, lit: false });
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

      // ---- Distant SP city silhouette using backdrop() — auto-renders as building with window bands ----
      // Replaces the old raw addBox horizon ring that looked like floating grey cubes.
      // backdrop() checks isBld (sz[1]>26 && sz[1]>sz[2]) → adds window bands + parapet.
      every(36, (k) => {
        // Only around the R side skyline section (s≈0.40–0.85)
        const inSky = (() => {
          const k0 = K(0.40), k1 = K(0.85);
          const span = ((k1 - k0) + n) % n;
          const off  = ((k  - k0) + n) % n;
          return off <= span;
        })();
        if (!inSky) return;
        const hv  = hash(k * 7 + 280);
        const d   = 300 + hv * 120;
        const ht  = 32 + hv * 50;
        const w   = 22 + hash(k * 11 + 280) * 18;
        const base = 0.46 + hash(k * 13 + 280) * 0.08;
        // backdrop() with sz[1]>sz[2] triggers isBld → window bands + parapet
        backdrop(k, 1, d, [w, ht, w * 0.60], [base, base, base * 1.06]);
      });

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
      // GREEN HILLS — wooded ridges ringing the park
      // backdrop() with GREEN dominant auto-renders as rounded organic mounds.
      // Placed every ~30 m around the track perimeter (skipping favela / skyline
      // sections which have their own depth layers).
      // ===================================================================
      every(30, (k) => {
        // Skip the favela hillside (L, s=0.08–0.32) and the SP skyline (R, s=0.40–0.85)
        // — those sections have dedicated scenery; don't double-up.
        const inFavela = (() => {
          const k0 = K(0.08), k1 = K(0.32);
          const span = ((k1 - k0) + n) % n;
          return ((k - k0 + n) % n) <= span;
        })();
        const inSky = (() => {
          const k0 = K(0.40), k1 = K(0.85);
          const span = ((k1 - k0) + n) % n;
          return ((k - k0 + n) % n) <= span;
        })();
        if (inFavela || inSky) return;

        const hv = hash(k * 17 + 91);
        for (const side of [-1, 1]) {
          if (hash(k * 23 + side * 7) > 0.70) continue;   // ~70% fill → natural gaps
          const d = 80 + hv * 60;
          const sz1 = 100 + hash(k * 31 + side) * 80;
          const ht1 = 18 + hash(k * 37 + side) * 22;
          backdrop(k, side, d, [sz1, ht1, sz1 * 0.55], HILL);
        }
      });

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
