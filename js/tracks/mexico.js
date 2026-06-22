/* Apex 26 — MEXICO CITY circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mexico",
    name: "MEXICO CITY",
    gp: "Mexican GP",
    country: "Mexico",
    night: false,
    theme: "modern",
    lengthKm: 4.3,
    baseHW: 8,
    pal: { zenith: [0.58, 0.74, 0.94], horizon: [0.72, 0.68, 0.60], grass: [0.34, 0.52, 0.26], runoff: [0.52, 0.38, 0.24], fogDensity: 0.0015, sunDir: [0.24111167647565865, 0.8639835073711102, 0.44203807353870755], sun: [1, 0.98, 0.88], sunColor: [1, 0.96, 0.86] },
    segs: [
      { t: 0, l: 300 }, { t: -90, l: 100 }, { t: 80, l: 90 }, { t: 0, l: 250 }, { t: 90, l: 100 }, { t: 0, l: 500 },
      { t: -60, l: 80 }, { t: 60, l: 70 }, { t: 0, l: 200 }, { t: 90, l: 100 }, { t: -130, l: 120 },
    ],
    // Stadium section: dips into the baseball/football stadium complex (Foro Sol)
    // then climbs back out through the banked Peraltada run — ~12 m real change.
    elevations: [{ s: 0.62, halfM: 260, rise: -7 }, { s: 0.74, halfM: 220, rise: 5 }],
    scenery: function (api) {
      const { out, n, place, backdrop, groundPlane,
              addBox, addCyl, addPrism, addFrustum, addCone, every, onTrack, hash, vadd, anchor, along,
              building, grandstand, billboard, tree, hedge, fence, palm, pine,
              guardrail, tyreWall, marshalPost, tower, gantry,
              cityFront, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

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
        if (onTrack(p.c[0], p.c[2], 2)) return;
        addCyl(out, p.c, 0.45, h, [0.55, 0.56, 0.58], 6, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, h - 0.8), [5.0, 1.6, 1.4], [0.28, 0.30, 0.34], [p.r, p.u, p.t]);
        for (let i = -1; i <= 1; i++) {
          addBox(out, vadd(vadd(p.c, p.u, h - 0.3), p.r, side * i * 1.5),
                 [1.1, 0.9, 1.0], [1.00, 0.97, 0.78], [p.r, p.u, p.t]);
        }
        addBox(out, vadd(p.c, p.u, 0.05),
               [10, 0.08, 10], [0.82, 0.76, 0.52], [p.r, p.u, p.t]);
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

      // ════════════════════════════════════════════════════════════════════════
      // s=0.00  MAIN GRANDSTAND + START/FINISH STRAIGHT
      // ════════════════════════════════════════════════════════════════════════
      // Two-tier main grandstand (right side, s/f straight)
      grandstand(0.00, 1,  9, 120, SEATS,    PINK);
      grandstand(0.00, 1, 22, 120, CONCRETE, GREEN);

      grandstand(0.99, 1,  9,  70, SEATS,    ORANGE);
      grandstand(0.97, 1, 22,  80, CONCRETE, PINK);

      // Banners along stand fronts
      banners(0.00, 1, 8);

      // Start/finish gantry + scoring board
      gantry(0.00, 8.5, [0.14, 0.14, 0.18]);
      billboard(K(0.005), 1, 7, 14, 5, fiesta[0]);
      {
        const a = anchor(K(0.00), 1, 40);
        // Scoreboard mast
        addBox(out, vadd(a.c, a.u, 8),  [1.2, 16, 1.2], [0.28, 0.28, 0.32], [a.r, a.u, a.t]);
        // Big screen panel
        addBox(out, vadd(a.c, a.u, 19), [24, 11, 1.8], [0.06, 0.06, 0.08],  [a.r, a.u, a.t]);
        // Screen surround frame
        addBox(out, vadd(a.c, a.u, 19), [25, 11.8, 1.0], [0.26, 0.28, 0.32], [a.r, a.u, a.t]);
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
      // Paddock motorhomes
      for (const s of [0.01, 0.03, 0.05]) {
        building(K(s), -1, 22, 14, 9 + hash(K(s)) * 4, 16,
                 { wall: hash(K(s) * 5) > 0.5 ? [0.86, 0.40, 0.30] : [0.30, 0.42, 0.62],
                   window: [0.55, 0.58, 0.62], floor: 2 });
      }
      // Control tower at start of pit straight
      tower(K(0.04), -1, 6, 9, 26, { col: [0.82, 0.82, 0.86], cap: true, capCol: [0.20, 0.22, 0.26], mast: 7 });
      marshalPost(K(0.06), 1, 6);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.06  PARK TREE-LINE (right side, leafy park — Bosque de Chapultepec feel)
      // ════════════════════════════════════════════════════════════════════════
      hedge(0.04, 0.12, 1, 28, 3.2, TREEGRN);
      forestEdge(0.04, 0.12, 1, 30, { density: 0.75, hMin: 8, hMax: 14, col: TREEGRN, col2: PARKGRN, pineFrac: 0.3 });

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
      // MEXICO CITY URBAN SKYLINE — continuous aligned cityfront, lit windows
      // Two depth bands: near facade + mid-distance backdrop buildings
      // ════════════════════════════════════════════════════════════════════════
      // Near facade: aligned street wall
      cityFront(0.22, 0.50, -1, 28, {
        minH: 18, maxH: 52, depth: 22, lit: true,
        palette: [[0.64, 0.62, 0.58], [0.70, 0.68, 0.62], [0.58, 0.56, 0.54], [0.66, 0.60, 0.56]],
        windowCol: [0.96, 0.88, 0.58], step: 22
      });
      cityFront(0.58, 0.72, -1, 28, {
        minH: 14, maxH: 40, depth: 20, lit: true,
        palette: [[0.62, 0.60, 0.58], [0.68, 0.64, 0.60], [0.56, 0.54, 0.52], [0.60, 0.58, 0.56]],
        windowCol: [0.94, 0.84, 0.55], step: 22
      });
      cityFront(0.30, 0.46, 1, 28, {
        minH: 16, maxH: 44, depth: 20, lit: true,
        palette: [[0.60, 0.62, 0.66], [0.66, 0.64, 0.60], [0.56, 0.58, 0.62], [0.68, 0.62, 0.58]],
        windowCol: [0.90, 0.82, 0.52], step: 24
      });

      // Mid-distance backdrop skyline — taller buildings further back
      every(32, (k) => {
        for (const side of [-1, 1]) {
          const d = 200 + hash(k * 82 + side) * 120 + (k & 1) * 20;
          const h = 30 + hash(k * 83 + side) * 50;
          const tone = 0.60 + hash(k * 84 + side) * 0.10;
          backdrop(k, side, d, [100, h, 45], [tone, tone * 0.99, tone * 0.97]);
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
      groundPlane(K(0.55), -1, 24, [200, 1.2, 160], PARKGRN);
      for (const s of [0.510, 0.530, 0.550, 0.570, 0.590]) {
        const k = K(s);
        building(k, -1, 28 + hash(k) * 32, 24, 9 + hash(k * 3) * 5, 20,
                 { wall: [0.86, 0.86, 0.84], window: [0.40, 0.46, 0.50], floor: 2 });
      }
      // Park trees both sides of the sports facility section
      forestEdge(0.50, 0.62, 1, 18, { density: 0.65, hMin: 7, hMax: 12, col: TREEGRN, col2: PARKGRN, pineFrac: 0.25 });
      forestEdge(0.50, 0.62, -1, 50, { density: 0.50, hMin: 8, hMax: 14, col: PARKGRN, col2: TREEGRN, pineFrac: 0.20 });

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
      // The Autódromo Hermann Rodríguez track passes THROUGH the Foro Sol
      // baseball/concert stadium. Grandstands rise on BOTH sides of the track
      // forming a complete enclosed bowl.
      //
      // Implementation: three nested grandstand() tiers per side, stacked
      // outward using increasing gap values. grandstand() uses groundYAt()
      // internally so tiers stay correctly grounded on the elevation dip.
      //
      //   Inner tier:  gap=10  → shell at gap+7.5=17.5 m from road edge
      //   Middle tier: gap=26  → shell at gap+7.5=33.5 m
      //   Outer tier:  gap=44  → shell at gap+7.5=51.5 m (stadium rim)
      //
      // Floodlight masts ring the rim at dist~56 m above the outer tier.
      // ════════════════════════════════════════════════════════════════════════

      // FORO SOL — inner tier (closest to track, most visible crowd)
      grandstand(0.72, -1, 10, 340, CONCRETE, fiesta[0]);   // pink crowd
      grandstand(0.72,  1, 10, 340, CONCRETE, fiesta[1]);   // orange crowd

      // Middle tier — wider shell, different crowd colour for visual variety
      grandstand(0.72, -1, 26, 340, [0.66, 0.64, 0.62], fiesta[2]);  // green
      grandstand(0.72,  1, 26, 340, [0.66, 0.64, 0.62], fiesta[3]);  // yellow

      // Outer tier — tallest, forms stadium rim silhouette
      grandstand(0.72, -1, 44, 340, [0.58, 0.56, 0.54], SEATS);
      grandstand(0.72,  1, 44, 340, [0.58, 0.56, 0.54], SEATS);

      // Foro Sol floodlight masts — ring the outer rim, tall enough to overtop
      for (const s of [0.73, 0.76, 0.79, 0.82, 0.85, 0.87]) {
        lightMast(K(s), -1, 58, 52);
        lightMast(K(s),  1, 58, 52);
      }

      // Foro Sol scoreboard / jumbotron at the far end of the stadium (s≈0.80)
      {
        const k = K(0.80);
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 62);
          if (!onTrack(a.c[0], a.c[2], 6)) {
            // Big jumbotron screen
            addBox(out, vadd(a.c, a.u, 28), [36, 14, 2.0], [0.04, 0.04, 0.06],  [a.r, a.u, a.t]);
            addBox(out, vadd(a.c, a.u, 28), [38, 15, 1.0], [0.24, 0.26, 0.30],  [a.r, a.u, a.t]);
          }
        }
      }

      // Festive banners inside the bowl — papel picado at trackside level
      for (const s of [0.72, 0.74, 0.77, 0.80, 0.83, 0.86]) {
        banners(s, -1, 9); banners(s, 1, 9);
      }

      // Interior fencing at trackside (safety fence inside stadium)
      fence(0.72, 0.88, -1, 7, 3.8, [0.82, 0.84, 0.88]);
      fence(0.72, 0.88,  1, 7, 3.8, [0.82, 0.84, 0.88]);
      tyreWall(0.755, 0.775, -1, 5, ORANGE);
      tyreWall(0.795, 0.815,  1, 5, PINK);
      kerb(0.76, -1, 8); kerb(0.80, 1, 8);

      // Mexican flag colours on the stadium outer wall fascia (visible from outside)
      along(0.72, 0.88, 18, (k) => {
        const s = k / n;
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 58);
          if (onTrack(a.c[0], a.c[2], 4)) continue;
          // Three vertical flag stripes on the outer stadium wall
          addBox(out, vadd(a.c, a.u, 12), [2.5, 22, 2.5], [0.10, 0.58, 0.26], [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 12), [2.5, 22, 2.5], [0.94, 0.94, 0.92], [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 12), [2.5, 22, 2.5], [0.86, 0.12, 0.16], [a.r, a.u, a.t]);
        }
      });

      // ════════════════════════════════════════════════════════════════════════
      // s=0.88  FORO SOL EXIT — transition gap back to open track
      // ════════════════════════════════════════════════════════════════════════
      billboard(K(0.88), 1, 8, 14, 6, fiesta[1]);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.92  PERALTADA / ESTADIO STAND
      // The banked Peraltada corner passes the old Estadio Azteca-style grandstand.
      // ════════════════════════════════════════════════════════════════════════
      grandstand(0.92, 1,  9, 100, SEATS,    PINK);
      grandstand(0.92, 1, 24, 100, CONCRETE, GREEN);
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
        if (s > 0.04 && s < 0.50) return;   // park tree / city sections handled
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
      // CACTUS / ARID VEGETATION (saguaro-style, sparse on open sections)
      // ════════════════════════════════════════════════════════════════════════
      every(18, (k) => {
        for (const side of [1, -1]) {
          const s = k / n;
          if (s > 0.04 && s < 0.50) continue;   // park/city section
          if (s > 0.70 && s < 0.90) continue;   // stadium section
          if (hash(k * 57 + side) > 0.62) continue;
          const d = 32 + hash(k * 63 + side) * 35;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const h = 4.8 + hash(k * 67 + side) * 3.2;
          // Saguaro trunk
          addCyl(out, p.c, 1.3, h, [0.28, 0.40, 0.20], 6, [p.r, p.u, p.t]);
          // Horizontal cross-arm
          addBox(out, vadd(p.c, p.u, h * 0.65), [4.8, 1.1, 1.4], [0.28, 0.40, 0.20], [p.r, p.u, p.t]);
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
      // DISTANT HAZED SKYLINE RING (high-altitude Mexico City, ~2285 m)
      // Hazy blue-grey tone to suggest thin air / urban smog
      // ════════════════════════════════════════════════════════════════════════
      every(32, (k) => {
        for (const side of [-1, 1]) {
          const d = 380 + hash(k * 82 + side) * 130 + (k & 1) * 25;
          const h = 32 + hash(k * 83 + side) * 40;
          const tone = 0.63 + hash(k * 84 + side) * 0.11;
          backdrop(k, side, d, [110, h, 50], [tone, tone * 0.99, tone * 0.98]);
        }
      });

      // ════════════════════════════════════════════════════════════════════════
      // MEXICO CITY SKYLINE — distributed mid-distance landmark towers
      // ════════════════════════════════════════════════════════════════════════
      for (let i = 0; i < 16; i++) {
        const f = i / 16;
        const k = K(f);
        const side = i % 2 === 0 ? -1 : 1;
        const d = 260 + hash(i * 29) * 140 + (i % 3) * 30;
        const h = 38 + hash(i * 37) * 72;
        const w = 20 + hash(i * 53) * 18;
        const p = anchor(k, side, d);
        if (!onTrack(p.c[0], p.c[2], 20)) {
          const tone = 0.58 + hash(i * 41) * 0.12;
          building(k, side, d - w / 2, w, h, w,
            { wall: [tone, tone * 0.99, tone * 0.98],
              window: [tone * 0.68, tone * 0.72, tone * 0.82],
              lit: true, windowCol: [0.94, 0.84, 0.54], floor: 8 });
        }
      }
    },
  }
  );
})();
