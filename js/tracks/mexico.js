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
              guardrail, tyreWall, marshalPost, tower, gantry } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── Festive Mexican palette ───────────────────────────────────────────────
      const PINK     = [0.92, 0.28, 0.55];
      const ORANGE   = [0.98, 0.55, 0.12];
      const GREEN    = [0.10, 0.55, 0.30];
      const SEATS    = [0.46, 0.47, 0.52];
      const CONCRETE = [0.72, 0.71, 0.68];
      const TREEGRN  = [0.22, 0.40, 0.20];
      const PARKGRN  = [0.34, 0.52, 0.26];
      const fiesta   = [PINK, ORANGE, GREEN, [0.98, 0.82, 0.10]];

      // ── Papel-picado / banner trim along a stand front ───────────────────────
      const banners = (s, side, gap) => {
        const k = K(s);
        for (let i = -2; i <= 2; i++) {
          const kk = (k + i + n) % n;
          place(kk, side, gap, [0.4, 1.1, 6], fiesta[(kk + (i & 1)) % 4]);
        }
      };

      // ── Dense fan-colour crowd speckle on a raked stand face ─────────────────
      const crowdSpeckle = (s, side, gap, len, rows, baseH) => {
        const k = K(s), span = Math.max(1, Math.round(len / 5.5));
        for (let i = -span; i <= span; i++) {
          const kk = (k + i + n) % n;
          for (let r = 0; r < rows; r++) {
            const p = anchor(kk, side, gap + 1.4 + r * 2.2);
            if (onTrack(p.c[0], p.c[2], 0.5)) continue;
            const lift = baseH + r * 1.8;
            const col = hash(kk * 17 + r * 5) > 0.35 ? fiesta[(kk * 3 + r) % 4] : SEATS;
            addBox(out, vadd(p.c, p.u, lift), [6.0, 1.6, 6.2], col, [p.r, p.u, p.t]);
          }
        }
      };

      // ── Floodlight mast: pole + lamp head + warm emissive glow bar ───────────
      // The glow bar (bright warm yellow) reads as lit even in day scenes;
      // the light-pool patch on the ground beneath it anchors the mast visually.
      const lightMast = (k, side, dist, h) => {
        const p = anchor(k, side, dist);
        if (onTrack(p.c[0], p.c[2], 2)) return;
        // Steel pole
        addCyl(out, p.c, 0.45, h, [0.55, 0.56, 0.58], 6, [p.r, p.u, p.t]);
        // Lamp head housing (dark grey bracket)
        addBox(out, vadd(p.c, p.u, h - 0.8), [5.0, 1.6, 1.4], [0.28, 0.30, 0.34], [p.r, p.u, p.t]);
        // Emissive fixture panels — warm white glow (bright, slightly warm)
        for (let i = -1; i <= 1; i++) {
          addBox(out, vadd(vadd(p.c, p.u, h - 0.3), p.r, side * i * 1.5),
                 [1.1, 0.9, 1.0], [1.00, 0.97, 0.78], [p.r, p.u, p.t]);
        }
        // Light pool: a warm-tinted flat patch on the ground below the mast
        // (slightly raised above the terrain to avoid Z-fight)
        addBox(out, vadd(p.c, p.u, 0.05),
               [10, 0.08, 10], [0.82, 0.76, 0.52], [p.r, p.u, p.t]);
      };

      // ── Lamp post: smaller roadside post with a single warm head ─────────────
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
      grandstand(0.00, 1, 9,  120, SEATS,    PINK);
      grandstand(0.00, 1, 24, 120, CONCRETE, GREEN);
      crowdSpeckle(0.00, 1, 9, 120, 4, 2.5);
      banners(0.00, 1, 8);

      grandstand(0.99, 1, 9,  70, SEATS,    ORANGE);
      grandstand(0.97, 1, 24, 80, CONCRETE, PINK);
      crowdSpeckle(0.985, 1, 9, 70, 4, 2.5);

      // Start/finish gantry + scoring board
      gantry(0.00, 8.5, [0.14, 0.14, 0.18]);
      billboard(K(0.005), 1, 7, 14, 5, fiesta[0]);
      {
        const a = anchor(K(0.00), 1, 40);
        // Scoreboard mast
        addBox(out, vadd(a.c, a.u, 8),  [1.2, 16, 1.2], [0.28, 0.28, 0.32], [a.r, a.u, a.t]);
        // Big screen panel
        addBox(out, vadd(a.c, a.u, 19), [24, 11, 1.8], [0.06, 0.06, 0.08],  [a.r, a.u, a.t]);
        // Screen surround frame (bright accent)
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
      // s=0.06  PARK TREE-LINE (right side, denser leafy park)
      // ════════════════════════════════════════════════════════════════════════
      hedge(0.04, 0.12, 1, 28, 3.2, TREEGRN);
      for (const s of [0.04, 0.052, 0.064, 0.076, 0.088, 0.100, 0.112]) {
        const k = K(s);
        tree(k, 1, 28 + hash(k) * 20,        10 + hash(k * 3)  * 6, TREEGRN);
        tree(k, 1, 48 + hash(k * 5) * 22,     9 + hash(k * 7)  * 6, [0.26, 0.44, 0.22]);
        tree(k, 1, 70 + hash(k * 9) * 24,     8 + hash(k * 11) * 5, TREEGRN);
        tree(k, 1, 90 + hash(k * 25) * 20,    9 + hash(k * 27) * 5, PARKGRN);
      }

      // ════════════════════════════════════════════════════════════════════════
      // s=0.12  TURN 1 GRANDSTAND
      // ════════════════════════════════════════════════════════════════════════
      grandstand(0.12, 1,  9, 80, SEATS,    GREEN);
      grandstand(0.12, 1, 24, 80, CONCRETE, ORANGE);
      crowdSpeckle(0.12, 1, 9, 80, 3, 2.5);
      kerb(0.12, 1, 9); kerb(0.115, -1, 8);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.20  MOISES SOLANA ESSES (both sides)
      // ════════════════════════════════════════════════════════════════════════
      for (const side of [-1, 1]) {
        grandstand(0.20, side, 8, 48, [0.50, 0.50, 0.54], side < 0 ? ORANGE : PINK);
        crowdSpeckle(0.20, side, 8, 48, 2, 1.5);
      }
      kerb(0.20, -1, 7); kerb(0.205, 1, 7);

      // ════════════════════════════════════════════════════════════════════════
      // CONTINUOUS MEXICO CITY SKYLINE — two depth ranks, no gaps
      // ════════════════════════════════════════════════════════════════════════
      const cityBand = (s0, s1, side, step) => {
        along(s0, s1, step, (k) => {
          for (let c = 0; c < 2; c++) {
            const d = (c === 0 ? 140 : 220) + hash(k * 72 + c) * 70 + (k & 1) * 12;
            const p = anchor(k, side, d);
            if (onTrack(p.c[0], p.c[2], 12)) continue;
            const baseTone = 0.64 + hash(k * 73 + c) * 0.14;
            const coolShift = c === 0 ? 0 : 0.04;
            const tone = baseTone + coolShift;
            const h = 28 + hash(k * 74 + c) * 56, w = 14 + hash(k * 75 + c) * 10;
            building(k, side, d - w / 2, w, h, w, { wall: [tone, tone * 0.98, tone * 0.94],
                     window: [tone * 0.70, tone * 0.74, tone * 0.80], floor: 6 });
          }
        });
      };
      cityBand(0.22, 0.50, -1, 24);
      cityBand(0.58, 0.72, -1, 24);
      cityBand(0.30, 0.46,  1, 28);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.42  HORQUILLA HAIRPIN
      // ════════════════════════════════════════════════════════════════════════
      groundPlane(K(0.42), 1, 5, [60, 1.0, 50], [0.40, 0.40, 0.43]);  // grey runoff
      kerb(0.42, 1, 10);
      grandstand(0.42, 1, 7, 40, [0.50, 0.50, 0.54], ORANGE);
      banners(0.42, 1, 6);
      crowdSpeckle(0.42, 1, 7, 40, 2, 2.0);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.55  PARK / SPORTS FACILITY
      // ════════════════════════════════════════════════════════════════════════
      groundPlane(K(0.55), -1, 24, [200, 1.2, 160], PARKGRN);
      for (const s of [0.510, 0.530, 0.550, 0.570, 0.590]) {
        const k = K(s);
        building(k, -1, 28 + hash(k) * 32, 24, 9 + hash(k * 3) * 5, 20,
                 { wall: [0.86, 0.86, 0.84], window: [0.40, 0.46, 0.50], floor: 2 });
        tree(k,  1, 26 + hash(k * 5)  * 22,  9 + hash(k * 7)  * 5, TREEGRN);
        tree(k,  1, 46 + hash(k * 13) * 20,  8 + hash(k * 17) * 5, PARKGRN);
        tree(k,  1, 65 + hash(k * 19) * 18,  7 + hash(k * 21) * 4, TREEGRN);
      }

      // ════════════════════════════════════════════════════════════════════════
      // s=0.66  LUCHA-LIBRE TRIBUTE STATUE
      // ════════════════════════════════════════════════════════════════════════
      {
        const k = K(0.66), d = 38;
        const p = anchor(k, 1, d);
        if (!onTrack(p.c[0], p.c[2], 6)) {
          // Stone plinth — sits on the ground: center at half-height above anchor
          addBox(out, vadd(p.c, p.u, 1.8),  [4.2, 3.6, 4.2], [0.58, 0.56, 0.52], [p.r, p.u, p.t]);
          // Wrestler body — stacked on top of plinth (3.6m) + half body (3.1m)
          addBox(out, vadd(p.c, p.u, 6.7),  [2.4, 6.2, 1.8], [0.20, 0.38, 0.72], [p.r, p.u, p.t]);
          // Masked head on top of body
          addBox(out, vadd(p.c, p.u, 10.7), [1.8, 1.8, 1.8], [0.98, 0.18, 0.28], [p.r, p.u, p.t]);
          // Gold accent stripe at plinth base level
          place(k, 1, d - 3.5, [3.2, 0.3, 5.5], [0.95, 0.80, 0.15]);
        }
      }

      // ════════════════════════════════════════════════════════════════════════
      // HERO: FORO SOL BASEBALL STADIUM (s≈0.72–0.88)
      //
      // Structural approach — CLIPPING-FREE tier stacking:
      //   Each tier is a concrete slab whose BASE sits on the tier below (or ground).
      //   anchor() returns the terrain surface. We step tiers outward & upward so
      //   every tier's bottom edge = the one below's top edge. This avoids tiers
      //   floating above each other or plunging below ground.
      //
      //   Tier geometry (per node, per side):
      //     gap from road edge | slab width | slab height | base elev
      //     ─────────────────────────────────────────────────────────
      //     t=0  dist=11  w=6   h=8    base=0  (sits on terrain)
      //     t=1  dist=17  w=6   h=12   base=8  (stacked on t=0 top)
      //     t=2  dist=23  w=7   h=16   base=20 (stacked on t=1 top)
      //     t=3  dist=30  w=8   h=20   base=36 (stacked on t=2 top)
      //   Roof lip at base=56, overhanging the outermost tier.
      //
      //   Crowd speckle is placed on the FACE of each tier (inner side facing track).
      // ════════════════════════════════════════════════════════════════════════

      // Tier configuration: [distFromEdge, slabWidth, slabHeight, baseElev]
      const TIERS = [
        [11,  6,  8,  0],   // t=0 ground tier
        [17,  6, 12,  8],   // t=1
        [23,  7, 16, 20],   // t=2
        [30,  8, 20, 36],   // t=3 top
      ];
      // Roof: sits at top of t=3 (base=56), overhangs inward
      const ROOF_BASE = 56;

      const stadiumBowl = (s0, s1, side) => {
        along(s0, s1, 5, (k) => {
          // Ground anchor for this node
          const gnd = anchor(k, side, TIERS[0][0]);

          for (let t = 0; t < TIERS.length; t++) {
            const [dist, sw, sh, baseElev] = TIERS[t];
            const a = anchor(k, side, dist);
            if (onTrack(a.c[0], a.c[2], 0.5)) continue;

            // The anchor gives us terrain Y. We want the tier BASE to be at
            // (gnd terrain Y + baseElev), and the center at base + sh/2.
            const baseY = gnd.c[1] + baseElev;
            const centerY = baseY + sh / 2;

            // Box center in world space (replace the Y component from anchor)
            const bc = [a.c[0], centerY, a.c[2]];
            addBox(out, bc, [sw, sh, 14], CONCRETE, [a.r, a.u, a.t]);

            // Crowd seat-rows on the INNER face of each tier
            // Rows step up the face using r (right = outward) and u (up)
            const rowsPerTier = t + 2;   // 2, 3, 4, 5 rows per tier level
            for (let r = 0; r < rowsPerTier; r++) {
              // Inner-face crowd position: inward by sw/2, then step up
              const rowDist = dist - sw / 2 - 0.6;  // just inside inner face
              const ra = anchor(k, side, rowDist);
              if (onTrack(ra.c[0], ra.c[2], 0.5)) continue;
              const rowBaseY = baseY + r * (sh / rowsPerTier);
              const col = hash(k * 19 + t * 11 + r * 7) > 0.40
                ? fiesta[(k * 3 + t + r) % 4]
                : SEATS;
              addBox(out, [ra.c[0], rowBaseY + 1.0, ra.c[2]],
                     [0.5, 1.8, 14], col, [ra.r, ra.u, ra.t]);
            }
          }

          // Cantilever roof lip: flat slab overhanging the bowl
          const rfDist = TIERS[3][0] + 4;  // slightly past outermost tier
          const rf = anchor(k, side, rfDist);
          if (!onTrack(rf.c[0], rf.c[2], 0.5)) {
            const rfY = gnd.c[1] + ROOF_BASE;
            addBox(out, [rf.c[0], rfY, rf.c[2]],
                   [14, 1.4, 14], [0.88, 0.90, 0.94], [rf.r, rf.u, rf.t]);
            // Roof fascia (dark underside strip visible from inside)
            addBox(out, [rf.c[0], rfY - 1.8, rf.c[2]],
                   [14, 2.2, 1.0], [0.52, 0.54, 0.58], [rf.r, rf.u, rf.t]);
          }
        });
      };

      stadiumBowl(0.72, 0.88, -1);
      stadiumBowl(0.72, 0.88,  1);

      // ── Foro Sol floodlight masts (ring the rim, above roof level) ───────────
      // Height above ground: roof base is 56 m, masts extend another 10 m above
      for (const s of [0.73, 0.76, 0.79, 0.82, 0.85]) {
        lightMast(K(s), -1, 36, 60);
        lightMast(K(s),  1, 36, 60);
      }

      // ── Interior light pools: warm tinted ground patches inside the stadium ──
      // These make the corridor feel lit-from-above (visible even in day as warm
      // tinted tarmac / runoff panels that glow subtly differently to plain grey).
      along(0.72, 0.88, 12, (k) => {
        const p = anchor(k, 1, 0);   // on centreline side
        if (onTrack(p.c[0], p.c[2], 18)) {
          // A subtle warm overlay on the runoff/tarmac margins
          // Placed well off track; if still on track the guard drops it.
          return;
        }
        // pale warm tinted slabs flanking the track inside the bowl
        place(k, -1, 10, [4, 0.06, 8], [0.74, 0.70, 0.58]);
        place(k,  1, 10, [4, 0.06, 8], [0.74, 0.70, 0.58]);
      });

      // ── Additional festive banner rings inside the bowl ───────────────────────
      for (const s of [0.72, 0.75, 0.78, 0.81, 0.84, 0.87]) {
        banners(s, -1, 10); banners(s, 1, 10);
      }

      // ── Stadium boundary furniture ─────────────────────────────────────────────
      fence(0.72, 0.88, -1, 7, 3.8, [0.82, 0.84, 0.88]);
      fence(0.72, 0.88,  1, 7, 3.8, [0.82, 0.84, 0.88]);
      tyreWall(0.755, 0.775, -1, 5, ORANGE);
      tyreWall(0.795, 0.815,  1, 5, PINK);
      kerb(0.76, -1, 8); kerb(0.80, 1, 8);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.88  FORO SOL EXIT GAP (bright corridor opening)
      // ════════════════════════════════════════════════════════════════════════
      place(K(0.88), -1, 12, [12, 20, 8], [0.98, 0.94, 0.80]);
      billboard(K(0.88), 1, 8, 14, 6, fiesta[1]);

      // ════════════════════════════════════════════════════════════════════════
      // s=0.92  PERALTADA / ESTADIO STAND
      // ════════════════════════════════════════════════════════════════════════
      grandstand(0.92, 1,  9, 100, SEATS,    PINK);
      grandstand(0.92, 1, 24, 100, CONCRETE, GREEN);
      crowdSpeckle(0.92, 1, 9, 100, 4, 2.5);
      // Taller floodlights flanking the Peraltada
      lightMast(K(0.90), 1, 32, 44);
      lightMast(K(0.94), 1, 32, 44);
      // Extra lamp posts along the Peraltada exit
      lampPost(K(0.91), -1, 14);
      lampPost(K(0.93), -1, 14);
      banners(0.92, 1, 9);

      // Banked kerb edge through the Peraltada/Estadio corners — wider, more visible
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
      // VEGETATION: palms, broadleafs, scattered park trees
      // ════════════════════════════════════════════════════════════════════════
      for (const s of [0.05, 0.08, 0.55, 0.60, 0.92, 0.97]) {
        palm(K(s), 1, 18 + hash(K(s)) * 10, 9 + hash(K(s) * 3) * 4, GREEN);
      }
      every(22, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.55) continue;
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
      // DISTANT HAZED SKYLINE RING (high-altitude Mexico City, ~2285 m)
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
      // AZTEC STEPPED PYRAMID (infield monument, s≈0.45)
      // ════════════════════════════════════════════════════════════════════════
      {
        const pA = anchor(K(0.45), -1, 55);
        if (!onTrack(pA.c[0], pA.c[2], 14)) {
          const pb = [pA.r, pA.u, pA.t];
          const STONE = [0.68, 0.60, 0.44];
          // Three stacked boxes — stepped pyramid silhouette, bases on ground
          addBox(out, vadd(pA.c, pA.u, 2.0),  [20, 4,  20], STONE, pb);
          addBox(out, vadd(pA.c, pA.u, 6.0),  [14, 4,  14], STONE, pb);
          addBox(out, vadd(pA.c, pA.u, 10.0), [ 8, 4,   8], STONE, pb);
          // Cap detail on the summit platform
          addBox(out, vadd(pA.c, pA.u, 13.0), [ 4, 2.4, 4], [0.60, 0.52, 0.38], pb);
        }
      }

      // ════════════════════════════════════════════════════════════════════════
      // CACTUS / ARID VEGETATION (saguaro-style, sparse on open sections)
      // ════════════════════════════════════════════════════════════════════════
      every(18, (k) => {
        for (const side of [1, -1]) {
          const s = k / n;
          if (s > 0.12 && s < 0.50) continue;   // park trees section
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
      // MEXICO CITY SKYLINE — distributed mid-distance landmarks
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
              window: [tone * 0.68, tone * 0.72, tone * 0.82], floor: 8 });
        }
      }
    },
  }
  );
})();
