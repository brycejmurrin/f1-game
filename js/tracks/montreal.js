/* Apex 26 — MONTREAL circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "montreal",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.9150, // GPS-derived (OpenF1 2025, conf=0.661)
    name: "MONTREAL",
    gp: "Canadian GP",
    country: "Canada",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    pal: { zenith: [0.28, 0.44, 0.7], horizon: [0.68, 0.74, 0.8], grass: [0.22, 0.48, 0.18], runoff: [0.42, 0.4, 0.38], fogDensity: 0.0014, sunDir: [0.5134360308102702, 0.6067880364121376, 0.6067880364121376], sun: [1, 0.92, 0.78], sunColor: [1, 0.9, 0.76] },
    segs: [
      { t: 0, l: 380 }, { t: 80, l: 90 }, { t: -90, l: 100 }, { t: 0, l: 300 }, { t: 90, l: 90 }, { t: 0, l: 420 },
      { t: -80, l: 90 }, { t: 60, l: 70 }, { t: -60, l: 70 }, { t: 0, l: 220 }, { t: 100, l: 110 }, { t: -100, l: 110 },
    ],
    // Île Notre-Dame: very slight rise through the casino hairpin complex.
    elevations: [{ s: 0.52, halfM: 340, rise: 4 }],
    scenery: function (api) {
      const { out, n, px, pz, place, prop, backdrop, groundPlane, wall, grandstand,
        tree, building, anchor, addBox, addCyl, addFrustum, addCone, vadd, hash,
        fence, guardrail, tyreWall, hedge, billboard, gantry, marshalPost, bush,
        ferrisWheel, tower, onTrack, groundYAt, forestEdge, cityFront } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Île Notre-Dame palette (bright June day) ----
      const WALL     = [0.78, 0.79, 0.80];   // pale concrete
      const RIVER    = [0.26, 0.46, 0.60];   // St. Lawrence — cool blue-grey
      const BASIN    = [0.24, 0.50, 0.62];   // Olympic rowing lake (cleaner, slightly deeper)
      const GRASS    = [0.28, 0.52, 0.26];   // park green
      const FOLIAGE  = [0.20, 0.44, 0.24];   // deep tree green
      const FOLIAGE2 = [0.26, 0.50, 0.26];   // lighter June foliage
      const HEDGE    = [0.20, 0.40, 0.20];   // clipped hedge green

      const KERB_R = [0.82, 0.20, 0.18], KERB_W = [0.90, 0.90, 0.90];

      // ── Lamp-post helper: upright mast + luminaire head (day silhouette, night emissive read) ──
      // Placed at dist metres beyond the edge; small enough to never conflict with barriers.
      const lampPost = (k, side, dist) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 2)) return;
        // mast
        addCyl(out, a.c, 0.09, 8.5, [0.32, 0.32, 0.34], 5, b);
        // arm bracket
        addBox(out, vadd(a.c, a.u, 8.5), [0.08, 0.08, 1.6], [0.30, 0.30, 0.32], b);
        // luminaire head (bright warm yellow-white — reads emissive at night)
        addBox(out, vadd(vadd(a.c, a.u, 8.5), a.t, 0.8), [0.5, 0.22, 0.7], [0.98, 0.97, 0.82], b);
      };

      // ── Flag mast helper: slender pole with a coloured pennant box at the top ──
      const flagMast = (k, side, dist, h, col) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 1.5)) return;
        addCyl(out, a.c, 0.07, h, [0.30, 0.30, 0.33], 5, b);
        addBox(out, vadd(a.c, a.u, h - 0.7), [0.04, 1.4, 2.4], col, b);
      };

      // ===================================================================
      // Continuous pale concrete walls lining both edges (FLAT island)
      // ===================================================================
      wall(0.0, 1.0, -1, 2.5, 1.5, WALL);
      wall(0.0, 1.0,  1, 2.5, 1.5, WALL);

      // Catch / debris fence behind the walls — the tight street-style corridor.
      fence(0.0, 1.0, -1, 3.4, 3.0, [0.72, 0.74, 0.78]);
      fence(0.0, 1.0,  1, 3.4, 3.0, [0.72, 0.74, 0.78]);

      // Wide parkland ground planes both sides — groundPlane() aligns to local track
      // height so patches don't clip through elevated sections.
      // Right verge: park lawns from Senna S through the Casino complex
      for (let i = 0; i < 14; i++) {
        groundPlane(K(0.08 + i * 0.058),  1, 9, [55, 0.6, 52], GRASS);
      }
      // Left verge: island interior from basin entry to back straight
      for (let i = 0; i < 10; i++) {
        groundPlane(K(0.10 + i * 0.068), -1, 9, [50, 0.6, 48], GRASS);
      }

      // Continuous low clipped hedge / treeline ribbon framing the verges
      hedge(0.13, 0.24,  1, 9, 1.6, HEDGE);
      hedge(0.38, 0.50,  1, 9, 1.4, HEDGE);   // mid-island right verge
      hedge(0.62, 0.78, -1, 9, 1.6, HEDGE);
      hedge(0.78, 0.90,  1, 9, 1.6, HEDGE);

      // Marshal posts spaced around the lap (orange-roofed bunkers + flag pole)
      for (const s of [0.05, 0.18, 0.32, 0.47, 0.56, 0.68, 0.82, 0.94]) {
        marshalPost(K(s), (Math.round(s * 100) % 2) ? 1 : -1, 8.5);
      }

      // Lamp posts: pit straight + back half of lap (both sides, 40 m spacing)
      for (let i = 0; i < 20; i++) {
        const s = 0.96 + i * 0.002;   // pit straight approach (short spacing)
        lampPost(K(s), (i % 2) ? 1 : -1, 6.5);
      }
      for (let i = 0; i < 28; i++) {
        const s = 0.60 + i * 0.013;   // back straight / Casino straight
        lampPost(K(s), (i % 2) ? 1 : -1, 6.5);
      }

      // ===================================================================
      // s 0.02 R — Pit wall & main grandstand on the start straight
      // ===================================================================
      grandstand(0.02,  1,  8, 120, [0.50, 0.51, 0.56], [0.62, 0.34, 0.30]);
      grandstand(0.0,  -1, 10,  90, [0.46, 0.47, 0.52], [0.55, 0.40, 0.38]);
      grandstand(0.06,  1,  9,  90, [0.48, 0.49, 0.55], [0.58, 0.36, 0.34]);
      grandstand(0.96, -1, 11,  80, [0.47, 0.48, 0.53], [0.56, 0.38, 0.36]);

      // Start/finish gantry spanning the main straight + a second timing arch
      gantry(0.005, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.97,  6.5, [0.16, 0.16, 0.20]);

      // Flag masts flanking the start/finish line (Canadian red + maple leaf red)
      flagMast(K(0.005),  1, 10, 12, [0.88, 0.12, 0.16]);
      flagMast(K(0.005), -1, 10, 12, [0.88, 0.12, 0.16]);
      flagMast(K(0.999),  1,  9, 11, [0.88, 0.12, 0.16]);

      // Pit lane garages / paddock buildings behind the left pit wall (long low row)
      for (let i = 0; i < 6; i++) {
        const s = 0.965 + i * 0.012;
        building(K(s), -1, 13, 16, 9, 14,
          { wall: [0.66, 0.67, 0.71], window: [0.44, 0.54, 0.64], floor: 4 });
      }
      // Paddock hospitality block + media centre, taller, set further back
      building(K(0.0), -1, 30, 26, 16, 22,
        { wall: [0.72, 0.74, 0.78], window: [0.52, 0.64, 0.76], floor: 4, setback: true, roof: true });
      building(K(0.03), -1, 32, 22, 13, 20,
        { wall: [0.68, 0.70, 0.74], window: [0.50, 0.60, 0.72], floor: 4, roof: true });

      // Pit-straight billboards / advertising hoardings (right verge, well clear)
      for (const s of [0.01, 0.04, 0.97, 0.94]) {
        billboard(K(s), 1, 10, 14, 4, [0.88, 0.82, 0.22]);
      }
      billboard(K(0.07), -1, 11, 12, 4, [0.86, 0.30, 0.26]);

      // ===================================================================
      // s 0.04 both — Senna S chicane: angled kerb slabs + tyre-wall funnel
      // ===================================================================
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) {
          place(K(0.04 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_W : KERB_R);
        }
      }
      // Tyre barriers stacked against the apex walls of the Senna S
      tyreWall(0.038, 0.058,  1, 3.2, [0.85, 0.30, 0.20]);
      tyreWall(0.042, 0.06,  -1, 3.2, [0.90, 0.90, 0.30]);
      marshalPost(K(0.05), 1, 9);

      // ===================================================================
      // s 0.07–0.20 L — Olympic Basin rowing lake (continuous water band)
      // ===================================================================
      for (let i = 0; i < 8; i++) {
        groundPlane(K(0.065 + i * 0.020), -1, 14, [220, 2, 280], BASIN);
      }
      // Far bank of the basin: dense broadleaf forestEdge (safe gap behind fence)
      forestEdge(0.07, 0.21, -1, 18, {
        density: 0.75, hMin: 9, hMax: 16,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.2
      });
      // Far bank low treeline backdrop across the water (green → engine renders as rounded mounds)
      for (let i = 0; i < 12; i++) {
        const k = K(0.08 + (i / 12) * 0.12);
        backdrop(k, -1, 140 + hash(i * 11) * 25, [20, 7 + hash(i * 5) * 5, 20], [0.22, 0.40, 0.22]);
      }

      // ── s 0.10 L — Rowing regatta spectator platform overlooking the basin ──
      // A simple concrete deck on stilts — like the permanent grandstand at the
      // 1976 Olympic rowing venue on the island.
      {
        const k = K(0.10);
        const a = anchor(k, -1, 28);
        const b = [a.r, a.u, a.t];
        // Platform deck: 30 m long, 6 m wide, 3 m above ground
        addBox(out, vadd(a.c, a.u, 3.0), [6, 0.4, 30], [0.76, 0.77, 0.80], b);
        // Low railing walls along the long edges (track-side and water-side)
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.r,  3.1), [0.18, 0.8, 30], [0.72, 0.72, 0.74], b);
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.r, -3.1), [0.18, 0.8, 30], [0.72, 0.72, 0.74], b);
        // Four support columns
        for (const ot of [-11, -4, 4, 11]) {
          addCyl(out, vadd(vadd(a.c, a.t, ot), a.u, 0), 0.28, 3.0, [0.68, 0.68, 0.70], 6, b);
        }
      }

      // ===================================================================
      // s 0.13–0.35 — Parc Jean-Drapeau: parkland forestEdge both sides
      // (replaces old manual tree() loops that clipped into fences)
      // ===================================================================
      // Right verge: park trees from Senna S through the back of the island
      forestEdge(0.13, 0.35, 1, 12, {
        density: 0.72, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      // Left verge: treeline on the inner infield side
      forestEdge(0.13, 0.30, -1, 12, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      // Shrub clumps for low-level ground greenery detail
      for (let i = 0; i < 18; i++) {
        bush(K(0.16 + i * 0.0088), (i % 2) ? 1 : -1, 9 + hash(i * 11) * 5,
          (i % 2) ? [0.22, 0.42, 0.20] : [0.18, 0.38, 0.18]);
      }

      // ===================================================================
      // s 0.35–0.50 — Mid-island gap: forestEdge (previously bare)
      // The infield and outer park between the Casino complex and L'Épingle.
      // ===================================================================
      forestEdge(0.35, 0.50, 1, 12, {
        density: 0.65, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.12
      });
      forestEdge(0.35, 0.48, -1, 12, {
        density: 0.55, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });
      // Scattered bushes in the mid-island infield near the Casino approach
      for (let i = 0; i < 10; i++) {
        bush(K(0.37 + i * 0.012), (i % 2) ? 1 : -1, 10 + hash(i * 7) * 4,
          (i % 2) ? [0.20, 0.40, 0.18] : [0.24, 0.44, 0.20]);
      }

      // ===================================================================
      // s 0.25 R far — Casino de Montréal (faceted pale Expo pavilion)
      // ===================================================================
      {
        // Main hall: inner face at gap 170 m, footprint 40 m wide × 40 m deep, 70 m tall
        const k = K(0.25);
        building(k, 1, 170, 40, 70, 40,
          { wall: [0.80, 0.82, 0.86], window: [0.60, 0.72, 0.84], floor: 6,
            lit: true, windowCol: [0.90, 0.95, 1.0] });

        // Stepped upper blocks placed via anchor, ABOVE the main hall roof.
        const a = anchor(k, 1, 190);
        // First step: 30×30 × 16 m, rising from height 72 (2 m above roof to avoid z-fight)
        addBox(out, vadd(a.c, a.u, 72 + 8),  [30, 16, 30], [0.84, 0.86, 0.90], [a.r, a.u, a.t]);
        // Second step: 18×18 × 12 m, on top of first step
        addBox(out, vadd(a.c, a.u, 72 + 16 + 2 + 6), [18, 12, 18], [0.87, 0.89, 0.93], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.30 L far — Biosphère geodesic dome (landmark across St. Lawrence)
      // ===================================================================
      {
        const k = K(0.30);
        const a = anchor(k, -1, 220);
        const DOME   = [0.76, 0.80, 0.84];  // light steel-grey lattice
        const DOME_D = [0.70, 0.74, 0.78];  // slightly darker lower rings

        let y = 0;
        const rings = [
          [45, 40, 14, DOME_D],   // base skirt
          [40, 30, 16, DOME_D],   // lower hemisphere
          [30, 14, 16, DOME],     // upper hemisphere
          [14,  5, 10, DOME],     // neck
          [ 5,  5,  6, DOME],     // cupola drum
        ];
        for (const [rb, rt, h, col] of rings) {
          addFrustum(out, vadd(a.c, a.u, y + h / 2), rb, rt, h, col, 14, [a.r, a.u, a.t]);
          y += h;
        }
        // Small cone cap on top of the cupola (y = 62 after all rings)
        addCone(out, vadd(a.c, a.u, y), 5, 6, DOME, 10, [a.r, a.u, a.t]);
      }

      // St. Lawrence water band between island and downtown
      for (let i = 0; i < 5; i++) {
        groundPlane(K(0.30 + i * 0.022), -1, 30, [260, 2, 240], RIVER);
      }

      // ===================================================================
      // s 0.30–0.46 L far — Montreal CBD skyline across St. Lawrence
      //
      // Three tiers via cityFront() so buildings align and windows are lit.
      // lit:true ensures glazing reads as bright glass in daylight and emissive
      // lit windows at dusk / night.
      // ===================================================================

      // Front rank: mid-rise towers (40–120 m), tight step for a dense skyline
      cityFront(0.30, 0.46, -1, 200, {
        minH: 40, maxH: 120, depth: 28, step: 18,
        palette: [
          [0.54, 0.58, 0.64], [0.58, 0.60, 0.66],
          [0.50, 0.54, 0.60], [0.62, 0.62, 0.68],
        ],
        lit: true,
        windowCol: [0.62, 0.78, 0.98],   // cool blue-white reflective glass
        floor: 6,
      });

      // Mid-rank infill behind the front row — slightly taller towers
      cityFront(0.305, 0.455, -1, 270, {
        minH: 60, maxH: 200, depth: 30, step: 26,
        palette: [
          [0.50, 0.54, 0.60], [0.46, 0.50, 0.56],
          [0.54, 0.52, 0.58], [0.48, 0.52, 0.58],
        ],
        lit: true,
        windowCol: [0.70, 0.82, 1.0],
        floor: 5,
      });

      // Far hazed backdrop rank — silhouetted against the sky
      for (let i = 0; i < 20; i++) {
        const k = K(0.30 + (i / 20) * 0.17);
        backdrop(k, -1, 370 + hash(i * 19) * 50,
                 [24, 50 + hash(i * 13) * 80, 24], [0.50, 0.55, 0.62]);
      }

      // ===================================================================
      // s 0.45 R close — Casino corner footbridge spanning the track
      // ===================================================================
      {
        const k = K(0.45);
        const a = anchor(k, 1, 5);
        // Deck: 28 m span, 1.0 m thick, 4 m wide — sits at 8 m height (clear of cars)
        addBox(out, vadd(a.c, a.u, 8.5), [28, 1.0, 4], [0.68, 0.70, 0.72], [a.r, a.u, a.t]);
        // Two support legs on the right side; left side anchors to the grandstand
        for (const ot of [-1.5, 1.5]) {
          addCyl(out, vadd(vadd(a.c, a.t, ot), a.u, 0), 0.35, 8.5,
                 [0.60, 0.62, 0.64], 6, [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.45 R far — La Ronde amusement park ferris wheel across the water
      // ===================================================================
      ferrisWheel(K(0.42), 1, 150, 34);
      // a couple of fairground towers beside it
      tower(K(0.40), 1, 175, 14, 46,
        { col: [0.78, 0.62, 0.40], seg: 6, cap: true, capCol: [0.8, 0.3, 0.2], mast: 10 });

      // ===================================================================
      // s 0.55 both — L'Épingle hairpin: tight U of walls + grandstand
      // ===================================================================
      grandstand(0.55,  1, 12, 70, [0.48, 0.49, 0.54], [0.60, 0.36, 0.32]);
      grandstand(0.53, -1, 12, 60, [0.46, 0.47, 0.52], [0.58, 0.38, 0.34]);
      grandstand(0.57,  1, 13, 60, [0.50, 0.51, 0.55], [0.62, 0.38, 0.34]);
      for (const side of [-1, 1]) {
        for (let j = 0; j < 3; j++) place(K(0.55 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_R : KERB_W);
      }
      // Tyre walls + marshal post packed around the slow hairpin apex
      tyreWall(0.545, 0.565, -1, 3.0, [0.90, 0.85, 0.20]);
      tyreWall(0.548, 0.568,  1, 3.0, [0.85, 0.30, 0.20]);
      marshalPost(K(0.55), -1, 9);
      billboard(K(0.52),  1, 11, 12, 4, [0.30, 0.50, 0.85]);
      billboard(K(0.58), -1, 11, 12, 4, [0.88, 0.82, 0.22]);

      // ===================================================================
      // s 0.58–0.75 R — Casino Straight: water slab + parkland forestEdge
      // (old tree() loop with dist 7-17 replaced with forestEdge — no clipping)
      // ===================================================================
      for (let i = 0; i < 6; i++) {
        groundPlane(K(0.565 + i * 0.019), 1, 14, [200, 2, 260], BASIN);
      }
      // Right verge: island parkland trees behind the rowing basin
      forestEdge(0.575, 0.75, 1, 14, {
        density: 0.80, hMin: 8, hMax: 15,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.20
      });
      // Left verge: infield trees along the Casino straight
      forestEdge(0.58, 0.72, -1, 12, {
        density: 0.65, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });

      // ── s 0.65 L — Concrete spectator grandstand on the Casino straight ──
      // Modelled after the permanent stands that overlook the run between
      // L'Épingle and the final chicane (the busiest spectator zone on the island).
      grandstand(0.65, -1, 11, 80, [0.48, 0.50, 0.55], [0.58, 0.36, 0.32]);

      // ===================================================================
      // s 0.66–0.90 — Back stretch through Parc Jean-Drapeau (parkland)
      // ===================================================================
      // Grandstand midway on the back straight
      grandstand(0.74, -1, 11, 64, [0.48, 0.49, 0.54], [0.56, 0.40, 0.36]);

      // Canal / water feature off the right verge — island park internal canal
      for (let i = 0; i < 3; i++) {
        groundPlane(K(0.78 + i * 0.020), 1, 16, [130, 2, 160], RIVER);
      }
      // Far treeline backdrop on the canal's far bank (green → organic mounds in engine)
      for (let i = 0; i < 8; i++) {
        backdrop(K(0.78 + (i / 8) * 0.08), 1, 135 + hash(i * 11) * 25, [22, 8, 22], [0.20, 0.40, 0.22]);
      }
      billboard(K(0.84), -1, 11, 12, 4, [0.86, 0.30, 0.26]);

      // Parkland forestEdge: back straight and final sector
      // (replaces scattered tree() calls with clipping-safe placement)
      forestEdge(0.75, 0.92, 1, 14, {
        density: 0.68, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      forestEdge(0.66, 0.90, -1, 12, {
        density: 0.60, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      // ── s 0.80 R — Small park pavilion / timing tower beside the back straight ──
      // Montreal's infield contains several permanent buildings from the 1976 Games
      // including the lightweight pavilions that now house race infrastructure.
      {
        const k = K(0.80);
        building(k, 1, 28, 18, 12, 16,
          { wall: [0.74, 0.76, 0.80], window: [0.52, 0.64, 0.76], floor: 3, roof: true });
      }

      // ===================================================================
      // s 0.92 both — Final chicane: tight kerb funnel + tyre walls
      // ===================================================================
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) place(K(0.92 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_W : KERB_R);
      }
      tyreWall(0.915, 0.935, -1, 3.0, [0.90, 0.85, 0.20]);
      marshalPost(K(0.93), -1, 9);
      grandstand(0.93, -1, 12, 70, [0.48, 0.49, 0.54], [0.58, 0.36, 0.32]);

      // ===================================================================
      // s 0.95–0.99 R — Wall of Champions: iconic concrete wall + red stripe
      // ===================================================================
      // The outer wall sits at gap=0.8 m from the road edge, 1.8 m tall.
      wall(0.955, 0.99, 1, 0.8, 1.8, [0.80, 0.81, 0.82], 0.6);

      // Red "Bienvenue" signature stripe on the wall face.
      {
        const k = K(0.97);
        const a = anchor(k, 1, 0.78);
        addBox(out, vadd(a.c, a.u, 1.0), [0.08, 0.50, 18], [0.88, 0.20, 0.18], [a.r, a.u, a.t]);
      }
      // Grandstand viewing the Wall + final chicane
      grandstand(0.97, -1, 12, 90, [0.50, 0.51, 0.56], [0.60, 0.36, 0.30]);
      billboard(K(0.96), -1, 12, 14, 4, [0.88, 0.82, 0.22]);
    },
  }
  );
})();
