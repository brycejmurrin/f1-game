/* Apex 26 — JEDDAH circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "jeddah",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.9625, // GPS-derived (OpenF1 2025, conf=0.696)
    name: "JEDDAH",
    gp: "Saudi Arabian GP",
    country: "Saudi Arabia",
    night: true,
    theme: "street_night",
    street: true,
    barrierGap: 0.6,
    lengthKm: 6.2,
    baseHW: 6,
    pal: { horizon: [0.10, 0.08, 0.16], zenith: [0.05, 0.05, 0.15], sunColor: [0.65, 0.68, 0.82], ambientSky: [0.22, 0.22, 0.32], ambientGround: [0.20, 0.18, 0.24], fogColor: [0.08, 0.08, 0.14], fogDensity: 0.0018, concrete: [0.28, 0.27, 0.26], runoff: [0.25, 0.24, 0.22], grass: [0.2, 0.18, 0.14] },
    segs: [
      { t: 0, l: 700 }, { t: 80, l: 70 }, { t: -75, l: 60 }, { t: 0, l: 120 }, { t: 70, l: 65 }, { t: -70, l: 60 },
      { t: 0, l: 300 }, { t: -90, l: 80 }, { t: 0, l: 600 }, { t: -90, l: 80 }, { t: 65, l: 70 }, { t: -70, l: 70 },
    ],
    // Jeddah Corniche: the circuit grades down from the sweeping first sector
    // then recovers along the seafront — real circuit has ~12 m total change.
    elevations: [{ s: 0.30, halfM: 480, rise: -8 }, { s: 0.62, halfM: 400, rise: 6 }],
    scenery: function (api) {
      const { out, n, pyMin, place, backdrop,
        addBox, addCyl, addCone, anchor, vadd, building, tower, billboard,
        grandstand, gantry, marshalPost, guardrail, tyreWall, palm,
        cityFront, onTrack, hash, every } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── Night Corniche palette ─────────────────────────────────────────────
      const SEA     = [0.02, 0.04, 0.08];   // deep black-mirror water
      const SPANGLE = [1.0,  0.80, 0.40];   // warm amber reflections
      const LED     = [0.92, 0.96, 1.0 ];   // cool-white LED
      const WINWARM = [1.0,  0.84, 0.48];   // warm interior windows
      const WINCOOL = [0.58, 0.82, 1.0 ];   // cool glass tower windows
      const WINGOLD = [1.0,  0.76, 0.28];   // deep sodium glow
      const WINTEAL = [0.42, 0.96, 0.94];   // teal accent glass
      const GREEN   = [0.10, 0.56, 0.24];   // Saudi-green livery stripe
      const MAGENTA = [0.96, 0.28, 0.64];   // neon magenta accent
      const DARKPOLE= [0.09, 0.09, 0.12];   // lamp-pole shaft
      const LAMPGLOW= [1.0,  0.88, 0.52];   // warm sodium lamp head
      const POOLAMB = [0.44, 0.38, 0.22];   // amber pool on tarmac

      const WALL_SEA = [[0.20, 0.22, 0.30], [0.18, 0.20, 0.28],
                        [0.22, 0.22, 0.32], [0.16, 0.18, 0.26]];
      const WALL_INL = [[0.17, 0.18, 0.23], [0.19, 0.20, 0.25],
                        [0.15, 0.16, 0.21], [0.21, 0.21, 0.26]];

      // ── Simple helpers ─────────────────────────────────────────────────────
      // Lamp post: shaft + glowing head only (no pool — saves 1 box each)
      const lampPost = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 2)) return;
        addCyl(out, a.c, 0.12, 8.0, DARKPOLE, 4, b);
        addBox(out, vadd(a.c, a.u, 8.0), [0.6, 0.6, 0.6], LAMPGLOW, b);
      };

      // Floodlight mast: pole + lamp bar + ambient pool
      const floodMast = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 5)) return;
        addCyl(out, a.c, 0.65, 38, DARKPOLE, 6, b);
        addBox(out, vadd(a.c, a.u, 35.5), [8.0, 1.6, 1.0], LED, b);
        addBox(out, vadd(a.c, a.u, 0.20), [5.0, 0.28, 5.0], POOLAMB, b);
      };

      // Light tower: slim column + cool LED head
      const lightTower = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 3)) return;
        addCyl(out, a.c, 0.40, 22, DARKPOLE, 5, b);
        addBox(out, vadd(a.c, a.u, 22.0), [3.0, 1.2, 3.0], LED, b);
      };

      // ── Floodlight masts — 8 positions ────────────────────────────────────
      for (let i = 0; i < 8; i++) {
        floodMast(K(i / 8 + 0.015), (i % 2) ? -1 : 1, 18 + (i % 3) * 5);
      }

      // ── LED light towers — 8 positions ───────────────────────────────────
      for (let i = 0; i < 8; i++) {
        lightTower(K(i / 8 + 0.06), (i % 2) ? 1 : -1, 10 + (i % 3) * 2);
      }

      // ── Lamp posts — sparse along both sides ──────────────────────────────
      for (let i = 0; i < 12; i++) {
        lampPost(K(i / 12), 1, 4.5 + (i % 2) * 1.2);
      }
      for (let i = 0; i < 8; i++) {
        lampPost(K(i / 8 + 0.01), -1, 5.2 + (i % 2) * 1.5);
      }

      // ── Palm trees: Corniche signature vegetation ──────────────────────────
      const PALMFROND = [0.12, 0.44, 0.19];
      for (let i = 0; i < 14; i++) {
        palm(K(i / 14), 1, 10 + hash(i * 5) * 3, 6 + hash(i * 3) * 3, PALMFROND);
      }
      for (let i = 0; i < 8; i++) {
        palm(K(i / 8 + 0.01), -1, 12 + hash(i * 7) * 4, 7 + hash(i * 11) * 3, [0.08, 0.36, 0.14]);
      }

      // ── Marshal posts ─────────────────────────────────────────────────────
      for (const [s, side] of [[0.06, -1], [0.13, 1], [0.34, -1], [0.49, 1],
        [0.62, -1], [0.74, 1], [0.81, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 1.8);
      }

      // ── Red Sea: two near-water planes (reduced from 3 layers × 92 boxes) ─
      for (let i = 0; i < 10; i++) {
        const k = K(i / 10);
        const a = anchor(k, 1, 140);
        addBox(out, [a.c[0], pyMin - 1.8, a.c[2]], [380, 1.2, 130], SEA, [a.r, a.u, a.t]);
      }
      for (let i = 0; i < 8; i++) {
        const k = K(i / 8);
        const a = anchor(k, 1, 380);
        addBox(out, [a.c[0], pyMin - 2.4, a.c[2]], [680, 1.6, 170], [0.018, 0.035, 0.080], [a.r, a.u, a.t]);
      }
      // Amber/cool reflection spangles — 8 spots
      for (let i = 0; i < 8; i++) {
        const a = anchor(K(i / 8), 1, 90 + hash(i * 5) * 150);
        const col = (i % 3 === 0) ? MAGENTA : (i % 3 === 1) ? LED : SPANGLE;
        addBox(out, [a.c[0], pyMin - 1.2, a.c[2]], [7, 0.22, 7], col);
      }

      // ── King Fahd's Fountain — offshore landmark ──────────────────────────
      {
        const a = anchor(K(0.20), 1, 380);
        addCyl(out, [a.c[0], pyMin - 0.8, a.c[2]], 0.9, 255, LED, 6, [a.r, a.u, a.t]);
        addCone(out, [a.c[0], pyMin + 255, a.c[2]], 7, 55, [0.94, 0.97, 1.0], 6, [a.r, a.u, a.t]);
        addCyl(out, [a.c[0], pyMin - 0.4, a.c[2]], 5, 2, [0.16, 0.18, 0.22], 6, [a.r, a.u, a.t]);
      }

      // ── START/FINISH gantries ─────────────────────────────────────────────
      gantry(0.0,   9, [0.12, 0.13, 0.17]);
      gantry(0.012, 7, [0.12, 0.13, 0.17]);

      // ── PIT BUILDING + MAIN GRANDSTAND — s 0.00 ──────────────────────────
      for (let i = 0; i < 5; i++) {
        place(K(0.0 + i * 0.012), -1, 16, [12, 8, 28], [0.26, 0.27, 0.30]);
        place(K(0.0 + i * 0.012), -1, 16, [12.4, 1.0, 29], WINWARM);
      }
      grandstand(0.0,  1, 12, 70, [0.14, 0.15, 0.19], [0.55, 0.45, 0.40]);
      grandstand(0.02, 1, 12, 60, [0.13, 0.14, 0.18], [0.50, 0.42, 0.46]);

      // ── CORNICHE STREET WALL — seaward (R), step=55m gives ~28 buildings total
      cityFront(0.05, 0.40, 1, 18, {
        minH: 12, maxH: 28, depth: 18,
        palette: WALL_SEA, lit: true, windowCol: WINWARM,
        step: 55, floor: 4,
      });
      cityFront(0.82, 0.98, 1, 18, {
        minH: 10, maxH: 22, depth: 16,
        palette: WALL_SEA, lit: true,
        step: 55, floor: 4,
      });

      // ── INLAND CITY WALL — left (L), step=55m gives ~22 buildings total ──
      cityFront(0.04, 0.24, -1, 16, {
        minH: 14, maxH: 34, depth: 20,
        palette: WALL_INL, lit: true,
        step: 55, floor: 5,
      });
      cityFront(0.35, 0.48, -1, 16, {
        minH: 18, maxH: 40, depth: 20,
        palette: WALL_INL, lit: true,
        step: 55, floor: 5,
      });
      cityFront(0.56, 0.74, -1, 16, {
        minH: 14, maxH: 36, depth: 20,
        palette: WALL_INL, lit: true, windowCol: WINGOLD,
        step: 55, floor: 5,
      });

      // ── JEDDAH SKYLINE — 3 landmark towers at s 0.27–0.31 L ──────────────
      building(K(0.27), -1, 55, 28, 115, 26, { wall: [0.22, 0.22, 0.27], window: WINWARM,  lit: true, floor: 8 });
      building(K(0.30), -1, 88, 24, 172, 22, { wall: [0.18, 0.19, 0.24], window: WINCOOL,  lit: true, floor: 8 });
      tower(K(0.285), -1, 140, 18, 160, { col: [0.16, 0.17, 0.22], seg: 4, cap: true, capCol: LED, mast: 12 });

      // ── MARINA — 6 yachts at s 0.42–0.48 R ───────────────────────────────
      for (let i = 0; i < 6; i++) {
        const k = K(0.42 + i * 0.011);
        const a = anchor(k, 1, 40 + (i % 3) * 12), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 9)) continue;
        const hl = 5.5 + (i % 3) * 1.5;
        addBox(out, vadd(a.c, a.u, 1.3), [2.8, 2.0, hl], [0.94, 0.94, 0.96], b);
        addBox(out, vadd(a.c, a.u, 2.3), [2.9, 0.3, hl], (i % 2) ? SPANGLE : WINCOOL, b);
        addCyl(out, vadd(a.c, a.u, 2.5), 0.18, 12, [0.88, 0.88, 0.92], 4, b);
      }
      // Yacht club building
      {
        const a = anchor(K(0.45), 1, 78), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 16)) {
          addBox(out, vadd(a.c, a.u, 3), [26, 6, 11], [0.25, 0.26, 0.29], b);
          addBox(out, vadd(a.c, a.u, 4.5), [26.3, 1.0, 11.3], WINWARM, b);
        }
      }

      // ── T13 BANKED SECTOR — s 0.50 ───────────────────────────────────────
      floodMast(K(0.49), -1, 22);
      floodMast(K(0.51),  1, 26);
      grandstand(0.50, 1, 14, 55, [0.14, 0.15, 0.19], [0.52, 0.44, 0.42]);
      tyreWall(0.485, 0.515, -1, 2.0, MAGENTA);

      // ── CORNICHE LAGOON — s 0.55–0.64 R (water + lamp posts) ─────────────
      for (let i = 0; i < 6; i++) {
        const a = anchor(K(0.55 + i * 0.015), 1, 65), b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 1.4, a.c[2]], [200, 1.0, 65], [0.05, 0.08, 0.14], b);
      }
      for (let i = 0; i < 7; i++) {
        lampPost(K(0.55 + i * 0.012), 1, 5.0 + (i % 2) * 0.8);
      }

      // ── HOTEL / COMMERCIAL CLUSTER — s 0.68–0.74 L ───────────────────────
      building(K(0.69), -1, 60, 26, 68, 22, { wall: [0.22, 0.22, 0.26], window: WINWARM, lit: true, floor: 8 });
      tower(K(0.71), -1, 100, 18, 105, { col: [0.18, 0.19, 0.24], seg: 4, cap: true, capCol: LED, mast: 10 });

      // Billboards — Corniche signage character
      billboard(K(0.70), -1, 26, 10, 11, GREEN);
      billboard(K(0.69), -1, 20, 9,  11, MAGENTA);
      billboard(K(0.73), -1, 24, 9,  10, WINTEAL);

      // ── TIGHT TECHNICAL SECTOR — s 0.78–0.84 ─────────────────────────────
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          place(K(0.78 + i * 0.010), side, 5, [5.5, 0.28, 2.8],
                (i % 2) ? [0.92, 0.08, 0.08] : [0.96, 0.96, 0.97]);
        }
      }

      // ── FINAL SECTOR GRANDSTAND — s 0.89 R ───────────────────────────────
      grandstand(0.89, 1, 14, 60, [0.15, 0.15, 0.19], [0.50, 0.43, 0.47]);
      lightTower(K(0.90),  1, 11);
      lightTower(K(0.93), -1, 11);
      floodMast(K(0.91), -1, 24);

      // ── CORNER PROTECTION ─────────────────────────────────────────────────
      tyreWall(0.07, 0.10, -1, 2.0, GREEN);
      tyreWall(0.79, 0.82,  1, 2.0, SPANGLE);
      guardrail(0.34, 0.38, -1, 1.8, [0.55, 0.56, 0.6]);
      guardrail(0.96, 0.99,  1, 1.8, [0.55, 0.56, 0.6]);

      // ── DRS STRAIGHT + CORNICHE SIGNAGE ──────────────────────────────────
      billboard(K(0.95),  1, 22, 10, 10, GREEN);
      billboard(K(0.96), -1, 22, 10,  9, SPANGLE);
      billboard(K(0.97), -1, 20, 10, 10, MAGENTA);
      billboard(K(0.10),  1, 15,  8,  8, [0.12, 0.68, 0.98]);
      billboard(K(0.55),  1, 13,  8,  7, [0.92, 0.12, 0.68]);

      // ── CORNICHE MONUMENT — s 0.50 R ─────────────────────────────────────
      {
        const sA = anchor(K(0.50), 1, 42), sBasis = [sA.r, sA.u, sA.t];
        if (!onTrack(sA.c[0], sA.c[2], 10)) {
          addCyl(out, sA.c, 3.2, 22, [0.82, 0.78, 0.68], 8, sBasis);
          addCone(out, vadd(sA.c, sA.u, 22), 5, 9, [0.94, 0.86, 0.64], 8, sBasis);
        }
      }

      // ── FAR SKYLINE BACKDROP — prevents sky gaps ──────────────────────────
      // Use backdrop() for all distant geometry — far cheaper than building()
      for (let i = 0; i < 12; i++) {
        const s = i / 12;
        const w = 40 + hash(i * 11) * 30, h = 80 + hash(i * 7) * 100;
        backdrop(K(s), -1, 260 + (i % 4) * 20, [w, h, w], [0.12, 0.13, 0.18]);
      }
      // A second ring on the seaward side for depth
      for (let i = 0; i < 8; i++) {
        const s = i / 8 + 0.04;
        const w = 35 + hash(i * 13) * 25, h = 60 + hash(i * 9) * 80;
        backdrop(K(s), 1, 220 + (i % 3) * 25, [w, h, w], [0.14, 0.14, 0.20]);
      }
    },
  }
  );
})();
