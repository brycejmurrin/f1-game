/* Apex 26 — SINGAPORE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "singapore",
    name: "SINGAPORE",
    gp: "Singapore GP",
    country: "Singapore",
    night: true,
    theme: "street_night",
    lengthKm: 4.9,
    baseHW: 6,
    street: true,
    // Vivid night palette: brighter horizon glow from the city, stronger ambient
    // so buildings read as lit objects not silhouettes, warm fog mimicking humid
    // haze around the floodlights.
    pal: {
      horizon:      [0.38, 0.24, 0.12],
      zenith:       [0.04, 0.05, 0.12],
      sunColor:     [0.95, 0.85, 0.60],
      ambientSky:   [0.55, 0.44, 0.30],
      ambientGround:[0.55, 0.42, 0.22],
      fogColor:     [0.26, 0.18, 0.10],
      fogDensity:   0.0018,
    },
    segs: [
      { t: 0, l: 160 }, { t: -60, l: 70 }, { t: 70, l: 70 }, { t: -55, l: 70 }, { t: 0, l: 220 }, { t: -90, l: 70 },
      { t: 0, l: 200 }, { t: -95, l: 70 }, { t: 90, l: 80 }, { t: -80, l: 60 }, { t: 60, l: 70 }, { t: -90, l: 90 },
      { t: 0, l: 180 }, { t: -90, l: 70 }, { t: -90, l: 70 }, { t: 85, l: 60 }, { t: -95, l: 80 },
    ],
    // Marina Bay: Anderson Bridge descent into the Padang section, then the climb
    // back up through the Singapore Sling complex — real change ~10 m.
    elevations: [{ s: 0.40, halfM: 360, rise: -7 }, { s: 0.65, halfM: 300, rise: 8 }],
    scenery: function (api) {
      const { out, n, hw, px, pz, place, backdrop, groundPlane, groundYAt,
              building, billboard, anchor, along, every, onTrack, addBox, addCyl, addCone,
              addPrism, addPyramid, addFrustum, grandstand, gantry, marshalPost, palm, bush,
              fence, guardrail, tyreWall, vadd, hash, cityFront, tower } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Night colour palette ----
      // Windows: warm incandescent, cool fluorescent, bright cyan office
      const WIN_WARM = [1.00, 0.88, 0.68];   // warm incandescent
      const WIN_COOL = [0.72, 0.82, 1.00];   // cool fluorescent
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
      // Floodlight lamp colour — very bright warm white
      const FLOOD = [1.00, 0.98, 0.88];
      // Light pool on track — subtle warm patch below each mast
      const POOL  = [0.68, 0.62, 0.50];
      // Concrete barrier night grey
      const CONC  = [0.30, 0.31, 0.36];

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
      // Right side: Marina Bay waterfront (main-straight & bay sections)
      cityFront(0.90, 0.35, 1, 106, {
        minH: 55, maxH: 165, depth: 28, lit: true,
        palette: [WALL_CBD, WALL_LITE, WALL_CBD, [0.16, 0.18, 0.26]],
        windowCol: WIN_CYAN, floor: 18, step: 44,
      });
      // Left side: colonial district & back-straights
      cityFront(0.00, 0.20, -1, 94, {
        minH: 26, maxH: 90, depth: 22, lit: true,
        palette: [WALL_WARM, WALL_CBD, [0.20, 0.18, 0.24], WALL_LITE],
        windowCol: WIN_WARM, floor: 14, step: 44,
      });
      cityFront(0.48, 0.88, -1, 90, {
        minH: 26, maxH: 95, depth: 22, lit: true,
        palette: [WALL_WARM, [0.22, 0.20, 0.26], WALL_CBD, WALL_LITE],
        floor: 14, step: 48,
      });

      // ===================================================================
      // s 0.18 R — MARINA BAY SANDS: 3 towers + skypark slab
      // Towers are separated by a fixed `gap` so they never intersect.
      // Each tower has bright window bands + vertical light fins.
      // ===================================================================
      {
        const k    = K(0.18);
        const a    = anchor(k, 1, 150);
        const wall = [0.82, 0.84, 0.90];
        const winC = [0.62, 0.80, 1.00];    // strong blue-white façade glow
        const H      = 200;
        const gap    = 36;    // centre-to-centre distance between towers
        const TOWERW = 18;   // tower width — declared here so skypark can reference it
        const tops   = [];

        for (let t = -1; t <= 1; t++) {
          // Centres spaced `gap` apart — TOWERW < gap so faces never overlap
          const c = vadd(a.c, a.r, t * gap);
          // Main shaft
          addBox(out, vadd(c, a.u, H * 0.5),   [TOWERW, H, 28],             wall,               [a.r, a.u, a.t]);
          // Window glazing face — slightly proud of the wall, covers 70% of height
          addBox(out, vadd(c, a.u, H * 0.52),  [TOWERW + 0.6, H * 0.76, 28.6],  winC,          [a.r, a.u, a.t]);
          // Vertical lit fin, alternating blue & gold for night detail
          const finCol = t === 0 ? [0.90, 0.75, 0.30] : [0.40, 0.65, 1.00];
          addBox(out, vadd(c, a.u, H * 0.50),  [2.0, H * 0.60, 29.2],       finCol,             [a.r, a.u, a.t]);
          // Bright crown at top of each tower
          addBox(out, vadd(c, a.u, H * 0.92),  [TOWERW + 1, H * 0.10, 29],  [0.92, 0.95, 1.00], [a.r, a.u, a.t]);
          tops.push(vadd(c, a.u, H));
        }

        // Skypark slab bridging all three tops (boat hull profile)
        const mid = tops[1];
        // Main slab — lighter warm sand colour (the real MBS deck is sand-coloured)
        addBox(out, vadd(mid, a.u, 3.5), [gap * 2 + TOWERW, 3.5, 32],      [0.86, 0.82, 0.74], [a.r, a.u, a.t]);
        // Glowing neon rim — the iconic cyan strip seen from every angle
        addBox(out, vadd(mid, a.u, 6.0), [gap * 2 + TOWERW + 1, 1.2, 32],  NEON[1],             [a.r, a.u, a.t]);
        // Rooftop pool and garden strip — warm amber
        addBox(out, vadd(mid, a.u, 5.5), [gap * 2 + 4, 0.8, 10],           WIN_GOLD,             [a.r, a.u, a.t]);
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
          const a = anchor(k, -1, 18);
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
        const ta = anchor(k, -1, 20);
        addBox(out, vadd(ta.c, ta.u, 0.3), [40, 0.5, 55], [0.30, 0.28, 0.24], [ta.r, ta.u, ta.t]);
      }

      // s 0.70 L — The Padang: dark open field (lawn)
      place(K(0.70), -1, 46, [70, 1.5, 70], [0.06, 0.10, 0.06]);

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

      // ===================================================================
      // s 0.86 R — SINGAPORE FLYER: ferris wheel (hub + spokes + lit rim)
      // ===================================================================
      {
        const k = K(0.86);
        const a = anchor(k, 1, 58);
        const WHEEL_R = 44, WHEEL_H = 138;

        // Central support hub
        addCyl(out, vadd(a.c, a.u, WHEEL_H), 2.4, 2.5, [0.35, 0.35, 0.38], 8, [a.r, a.u, a.t]);

        // 8 spokes from rim to hub
        for (let i = 0; i < 8; i++) {
          const ang   = (i / 8) * Math.PI * 2;
          const dx    = Math.cos(ang) * WHEEL_R;
          const dz    = Math.sin(ang) * WHEEL_R;
          const rimPt = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                         a.c[1] + a.u[1] * WHEEL_H,
                         a.c[2] + a.r[2] * dx + a.t[2] * dz];
          addCyl(out, vadd(rimPt, a.u, -WHEEL_H * 0.5), 0.45, WHEEL_H, [0.55, 0.55, 0.60], 5, [a.r, a.u, a.t]);
          // Glass capsule / observation cabin (bright cyan)
          addBox(out, rimPt, [3.4, 4.0, 3.4], WIN_CYAN, [a.r, a.u, a.t]);
        }

        // Lit necklace rim — 36 bright segments (cyan/white alternating)
        const SEG = 36;
        for (let i = 0; i < SEG; i++) {
          const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
          const p0 = [a.c[0] + a.r[0] * Math.cos(a0) * WHEEL_R + a.t[0] * Math.sin(a0) * WHEEL_R,
                      a.c[1] + a.u[1] * WHEEL_H,
                      a.c[2] + a.r[2] * Math.cos(a0) * WHEEL_R + a.t[2] * Math.sin(a0) * WHEEL_R];
          const p1 = [a.c[0] + a.r[0] * Math.cos(a1) * WHEEL_R + a.t[0] * Math.sin(a1) * WHEEL_R,
                      a.c[1] + a.u[1] * WHEEL_H,
                      a.c[2] + a.r[2] * Math.cos(a1) * WHEEL_R + a.t[2] * Math.sin(a1) * WHEEL_R];
          const segCol = (i % 3 === 0) ? NEON[0] : NEON[1];
          addBox(out,
            [(p0[0] + p1[0]) * 0.5, a.c[1] + a.u[1] * WHEEL_H, (p0[2] + p1[2]) * 0.5],
            [1.1, 0.9, (WHEEL_R * 2 * Math.PI / SEG)],
            segCol, [a.r, a.u, a.t]
          );
        }

        // Support leg structure (A-frame)
        for (const side2 of [-1, 1]) {
          const legC = vadd(a.c, a.r, side2 * 30);
          addCyl(out, vadd(legC, a.u, WHEEL_H * 0.45), 1.2, WHEEL_H * 0.9, [0.38, 0.38, 0.42], 6, [a.r, a.u, a.t]);
        }
      }

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

      // Scattered billboard punctuation along the lap
      for (const [s, side, hue] of [
        [0.04,  1, 1], [0.14, -1, 0], [0.50, -1, 2],
        [0.58,  1, 3], [0.72,  1, 1], [0.84, -1, 0],
      ]) {
        billboard(K(s), side, 10, 16, 10, NEON[hue]);
      }

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
      // BAY WATER — dark mirror ground planes along open harbour stretches.
      // ===================================================================
      const BAY = [0.06, 0.08, 0.14];
      for (const s of [0.20, 0.30, 0.40, 0.45, 0.82, 0.86]) {
        groundPlane(K(s), 1, 38, [70, 60], BAY);
      }

      // ===================================================================
      // FLOODLIGHT MASTS — key night feature. Dense, bright, warm-white.
      // Every 75 m; all masts are kept, skip probability reduced to 0.15.
      // Each mast has: pole, head bar, 5 bright lamp boxes, halo glow ring,
      // and a LIGHT POOL patch on the ground below.
      // ===================================================================
      every(75, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 3 + side) < 0.15) continue;   // keep ~85% of masts
          const a = anchor(k, side, 11 + hash(k + side) * 5);
          const H = 20 + hash(k * 7 + side) * 8;

          // Pole (dark grey)
          addCyl(out, vadd(a.c, a.u, H * 0.5), 0.52, H, [0.12, 0.12, 0.15], 6, [a.r, a.u, a.t]);
          // Head cross-bar
          const head = vadd(a.c, a.u, H);
          addBox(out, head, [7.0, 0.90, 2.0], [0.14, 0.14, 0.18], [a.r, a.u, a.t]);

          // 5 very bright flood lamps along the bar
          for (let j = -2; j <= 2; j++) {
            const lampC = vadd(head, a.r, j * 1.35);
            // Lamp housing (extremely bright warm white)
            addBox(out, lampC, [1.5, 1.5, 0.9], FLOOD, [a.r, a.u, a.t]);
            // Wide halo glow ring around each lamp
            addBox(out, vadd(lampC, a.u, 0.8), [2.2, 0.25, 1.4], [0.95, 0.90, 0.75], [a.r, a.u, a.t]);
          }

          // Base mounting bracket
          addBox(out, vadd(a.c, a.u, 1.8), [4.0, 1.4, 2.2], [0.18, 0.18, 0.22], [a.r, a.u, a.t]);

          // Light pool — a warm glowing slab on the ground just inboard of the mast,
          // simulating the cone of illumination hitting the track surface.
          // Placed 4 m inboard (towards the track centreline) and kept thin.
          const poolOff = side * -4;  // towards track
          const poolC   = vadd(vadd(a.c, a.r, poolOff), a.u, 0.1);
          addBox(out, poolC, [14, 0.18, 18], POOL, [a.r, a.u, a.t]);
        }
      });

      // ===================================================================
      // LAMP POSTS along the promenade and grandstand straight — smaller
      // street-scale lights between the floodlight masts.
      // ===================================================================
      every(22, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 11 + side) < 0.40) continue;
          const a = anchor(k, side, 9 + hash(k * 2) * 3);
          addCyl(out, vadd(a.c, a.u, 4),    0.12, 8,  [0.25, 0.25, 0.28], 5, [a.r, a.u, a.t]);
          addBox(out, vadd(a.c, a.u, 8.5),  [0.7, 0.7, 0.7], WIN_WARM,         [a.r, a.u, a.t]);
          // Tiny glow halo around the lamp head
          addBox(out, vadd(a.c, a.u, 8.8),  [1.2, 0.2, 1.2], [0.90, 0.82, 0.60], [a.r, a.u, a.t]);
        }
      });

      // ===================================================================
      // MAIN STRAIGHT — pit building (L) + Float@Marina Bay grandstands (R),
      // start gantry, illuminated timing tower, marshal posts.
      // ===================================================================
      // Pit garage block — 5 linked garage bays
      for (let i = 0; i < 5; i++) {
        const k = K(0.965 + i * 0.012);
        building(k, -1, 9, 16, 10, 14, { wall: WALL_WARM, window: WIN_WARM, floor: 4 });
      }
      // Timing tower — bright landmark visible across the circuit
      {
        const a = anchor(K(0.99), -1, 28);
        // Main tower shaft
        addBox(out, vadd(a.c, a.u, 18), [11, 36, 11], [0.14, 0.15, 0.20], [a.r, a.u, a.t]);
        // Bright cyan-lit glazing on the tower face
        addBox(out, vadd(a.c, a.u, 18), [11.6, 28, 3.0], WIN_CYAN, [a.r, a.u, a.t]);
        // Vivid blue vertical accent fin
        addBox(out, vadd(a.c, a.u, 20), [1.4, 24, 11.8], [0.35, 0.65, 1.00], [a.r, a.u, a.t]);
        // Crown: glowing amber top
        addBox(out, vadd(a.c, a.u, 35), [12, 4, 12], WIN_GOLD, [a.r, a.u, a.t]);
      }

      // Grandstands on the right of the main straight
      grandstand(0.99,  1, 8,  62, [0.20, 0.22, 0.28], [0.48, 0.34, 0.44]);
      grandstand(0.02,  1, 8,  62, [0.20, 0.22, 0.28], [0.44, 0.30, 0.40]);
      grandstand(0.05,  1, 8,  50, [0.22, 0.24, 0.30], [0.50, 0.36, 0.46]);
      grandstand(0.93,  1, 8,  52, [0.20, 0.22, 0.28], [0.46, 0.32, 0.42]);
      grandstand(0.70, -1, 30, 48, [0.20, 0.22, 0.28], [0.42, 0.30, 0.40]);

      // Start/finish gantry + halfway scoring gantry
      gantry(0.0, 7.5, [0.12, 0.12, 0.16]);
      gantry(0.5, 7.0, [0.12, 0.12, 0.16]);
      // Lit start-light cluster on the gantry
      {
        const a = anchor(K(0.0), 0, 0);
        addBox(out, vadd(a.c, a.u, 7.6), [4.5, 1.4, 0.9], [0.95, 0.05, 0.05], null);
      }

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
        fence(s0, s1, side, 1.4, 3.4, [0.66, 0.70, 0.78]);
      }

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
      every(48, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 5 + side) < 0.50) continue;
          palm(k, side, 9 + hash(k + side) * 6, 9 + hash(k * 2 + side) * 5, [0.18, 0.42, 0.20]);
        }
      });
      every(62, (k) => {
        if (hash(k * 9) < 0.60) return;
        bush(k, hash(k) < 0.5 ? -1 : 1, 8 + hash(k) * 5, [0.14, 0.36, 0.18]);
      });

      // ===================================================================
      // CORNER NEON BILLBOARDS — additional signage at corners
      // ===================================================================
      for (const [s, side, hue] of [
        [0.08, 1, 2], [0.31, 1, 1], [0.53, -1, 1], [0.77, 1, 2], [0.90, 1, 1],
      ]) {
        billboard(K(s), side, 12, 14 + hash(K(s)) * 6, 9, NEON[hue]);
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
    },
  }
  );
})();
