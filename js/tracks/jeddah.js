/* Apex 26 — JEDDAH circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "jeddah",
    name: "JEDDAH",
    gp: "Saudi Arabian GP",
    country: "Saudi Arabia",
    night: true,
    theme: "street_night",
    lengthKm: 6.2,
    baseHW: 6,
    pal: { horizon: [0.12, 0.08, 0.05], concrete: [0.28, 0.27, 0.26], runoff: [0.25, 0.24, 0.22], grass: [0.2, 0.18, 0.14] },
    segs: [
      { t: 0, l: 700 }, { t: -80, l: 70 }, { t: 75, l: 60 }, { t: 0, l: 120 }, { t: -70, l: 65 }, { t: 70, l: 60 },
      { t: 0, l: 300 }, { t: 90, l: 80 }, { t: 0, l: 600 }, { t: 90, l: 80 }, { t: -65, l: 70 }, { t: 70, l: 70 },
    ],
    scenery: function (api) {
      const { out, n, pyMin, place, backdrop, groundPlane,
        addBox, addCyl, addCone, anchor, vadd, building, tower, billboard,
        fence, hash, every } = api;
      const K = (s) => Math.round(s * n) % n;

      // Night Corniche palette
      const SEA = [0.03, 0.05, 0.10];        // black mirror water
      const SPANGLE = [1.0, 0.78, 0.45];     // warm reflection / path lamps
      const LED = [0.90, 0.95, 1.0];         // cool-white LED tower glow
      const WINWARM = [1.0, 0.82, 0.50];     // lit windows warm
      const WINCOOL = [0.55, 0.80, 1.0];     // lit windows cool
      const GREEN = [0.10, 0.55, 0.25];      // Saudi-green accents
      const BARRIER = [0.30, 0.31, 0.34];    // grey concrete
      const DARKPOLE = [0.10, 0.10, 0.13];

      // --- Continuous grey barrier wall both sides (the walls ARE the circuit) ---
      // Custom coarse-stepped barrier: overlapping long boxes so the wall never opens a
      // gap, at a wider spacing than wall()'s fixed 6 m step to stay within the vert budget.
      for (const side of [-1, 1]) {
        every(13, (k) => {
          const a = anchor(k, side, 0.6), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 0.65), [0.5, 1.3, 15], BARRIER, b);
        });
      }
      // Short debris fence on the tight technical final sector (kept brief for vert budget)
      fence(0.88, 0.95, 1, 1.3, 3.0, [0.50, 0.52, 0.56]);
      // Saudi-green accent stripe on the wall through the T1-3 complex
      place(K(0.05), -1, 0.6, [60, 0.5, 4], GREEN);

      // --- LED light towers ringing the whole lap (dark pole + bright cap pool) ---
      const lightTower = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.5, 22, DARKPOLE, 5, b);
        addBox(out, vadd(a.c, a.u, 22), [3.2, 1.4, 3.2], LED);   // bright lamp head
        addBox(out, a.c, [2.4, 0.3, 2.4], LED);                  // light pool on tarmac base
      };
      for (let i = 0; i < 16; i++) {
        const s = i / 16;
        lightTower(K(s), (i % 2) ? 1 : -1, 9 + (i % 3) * 2);
      }

      // --- Red Sea: vast far flat black water plane on the outside (R) of early/mid lap ---
      for (const s of [0.18, 0.50]) {
        groundPlane(K(s), 1, 120, [1100, 4, 1100], SEA);
      }
      // warm reflection spangles on the water near the marina/lagoon
      for (let i = 0; i < 16; i++) {
        const s = 0.15 + (i / 16) * 0.5, side = 1;
        const a = anchor(K(s), side, 140 + hash(i * 5) * 260);
        addBox(out, [a.c[0], pyMin + 0.6, a.c[2]], [10, 0.4, 10], SPANGLE);
      }

      // --- s 0.20 R far: King Fahd's Fountain — thin tall cool-white jet far offshore ---
      {
        const a = anchor(K(0.20), 1, 360);
        const b = [a.r, a.u, a.t];
        addCyl(out, [a.c[0], pyMin, a.c[2]], 2.2, 240, LED, 8, b);        // tall water column
        addCone(out, [a.c[0], pyMin + 240, a.c[2]], 4.5, 60, LED, 8, b);  // plume crown
        addCyl(out, [a.c[0], pyMin, a.c[2]], 6, 6, [0.18, 0.20, 0.24], 8, b); // dark base pier
      }

      // --- s 0.00 both near: pit straight — long low pit building L, stepped grandstand R ---
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.012), -1, 16, [12, 8, 30], [0.26, 0.27, 0.30]);
        place(K(0.0 + i * 0.012), -1, 16, [12.4, 0.9, 31], WINWARM);   // lit window band
      }
      for (let i = 0; i < 5; i++) {
        place(K(0.0 + i * 0.012), 1, 14, [10, 6 + i * 0.6, 24], [0.16, 0.17, 0.20]);
        place(K(0.0 + i * 0.012), 1, 14, [10.4, 0.8, 25], LED);        // crowd-light fleck
      }

      // --- s 0.28 L mid: modern Jeddah skyline — lit-window high-rise cluster ---
      building(K(0.26), -1, 70, 34, 110, 34, { wall: [0.20, 0.21, 0.26], window: WINCOOL, floor: 9 });
      building(K(0.28), -1, 60, 40, 88, 36, { wall: [0.22, 0.22, 0.27], window: WINWARM, floor: 8 });
      building(K(0.30), -1, 92, 30, 134, 30, { wall: [0.18, 0.19, 0.24], window: WINCOOL, floor: 10 });
      tower(K(0.29), -1, 130, 26, 170, { col: [0.16, 0.17, 0.22], seg: 4, cap: true, capCol: LED, mast: true });

      // --- s 0.45 R mid: Marina / Jeddah Yacht Club — pontoons + yacht hulls + mast spikes ---
      for (let i = 0; i < 5; i++) {
        const k = K(0.43 + i * 0.01);
        place(k, 1, 18, [22, 1.0, 6], [0.30, 0.30, 0.32]);           // pontoon
        const a = anchor(k, 1, 22 + i * 3);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 1.4), [4, 2.6, 11], [0.92, 0.93, 0.95]); // white hull box
        addCyl(out, vadd(a.c, a.u, 2.6), 0.2, 14, [0.85, 0.86, 0.9], 4, b); // mast spike
      }
      place(K(0.45), 1, 16, [30, 3, 10], [0.24, 0.25, 0.28]);         // yacht club building
      place(K(0.45), 1, 16, [30.4, 0.7, 10.5], WINWARM);

      // --- s 0.50 L near: banked T13 — light towers + packed grandstand R ---
      lightTower(K(0.50), -1, 10);
      lightTower(K(0.50), -1, 16);
      for (let i = 0; i < 4; i++) {
        place(K(0.50 + i * 0.008), 1, 14, [20, 7 + i * 2, 14], [0.15, 0.15, 0.19]);
        place(K(0.50 + i * 0.008), 1, 14, [20.4, 0.8, 14.5], LED);    // crowd light band
      }

      // --- s 0.60 R mid: open Corniche lagoon — warm amber path-lamp dots along the edge ---
      for (let i = 0; i < 8; i++) {
        const a = anchor(K(0.58 + i * 0.006), 1, 8);
        addBox(out, vadd(a.c, a.u, 3.5), [0.8, 0.8, 0.8], SPANGLE);
      }

      // --- s 0.70 L mid: mid-rise hotel/apartment boxes + emissive billboards ---
      building(K(0.68), -1, 64, 30, 60, 28, { wall: [0.22, 0.22, 0.26], window: WINWARM, floor: 7 });
      building(K(0.72), -1, 70, 26, 72, 26, { wall: [0.20, 0.21, 0.25], window: WINCOOL, floor: 8 });
      billboard(K(0.70), -1, 30, 18, 11, GREEN);
      billboard(K(0.71), -1, 56, 16, 10, SPANGLE);

      // --- s 0.80 both near: tight technical sector — bright sawtooth kerb strips ---
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          place(K(0.78 + i * 0.006), side, 0.4, [6, 0.3, 3], (i % 2) ? [0.9, 0.1, 0.1] : [0.95, 0.95, 0.95]);
        }
      }

      // --- s 0.90 R near: grandstand bank + light towers funnel toward final run ---
      for (let i = 0; i < 4; i++) {
        place(K(0.89 + i * 0.008), 1, 14, [20, 8 + i * 2, 14], [0.15, 0.15, 0.19]);
        place(K(0.89 + i * 0.008), 1, 14, [20.4, 0.8, 14.5], LED);
      }
      lightTower(K(0.90), 1, 10);
      lightTower(K(0.93), -1, 10);

      // --- s 0.96 both near: walls + DRS straight back to start — extra fence + billboards ---
      billboard(K(0.96), 1, 26, 16, 10, GREEN);
      billboard(K(0.96), -1, 26, 14, 9, SPANGLE);

      // --- Background skyline depth band pushed well back on the city (L) side ---
      // Cheap backdrop slabs (36 verts each) to read as a far night skyline silhouette.
      for (let i = 0; i < 7; i++) {
        const s = 0.24 + i * 0.055;
        const w = 24 + hash(i * 11) * 18, h = 60 + hash(i * 7) * 90;
        backdrop(K(s), -1, 200 + i * 16, [w, h, w], [0.16, 0.17, 0.22]);
      }
    },
  }
  );
})();
