/* Apex 26 — QATAR circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "qatar",
    name: "QATAR",
    gp: "Qatar GP",
    country: "Qatar",
    night: true,
    theme: "desert",
    lengthKm: 5.4,
    baseHW: 8,
    pal: { horizon: [0.14, 0.1, 0.06], concrete: [0.28, 0.26, 0.24], runoff: [0.24, 0.22, 0.2], grass: [0.2, 0.18, 0.14] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 80, l: 100 }, { t: -70, l: 90 }, { t: 60, l: 90 }, { t: 0, l: 300 },
      { t: -80, l: 100 }, { t: 70, l: 90 }, { t: 0, l: 400 }, { t: -60, l: 90 }, { t: 70, l: 90 }, { t: 0, l: 300 },
    ],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, vadd,
        place, prop, backdrop, anchor, addBox, addCyl, addFrustum,
        palm, grandstand, building, fence, wall } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (NIGHT desert, from the brief) ----
      const DUNE = [0.76, 0.64, 0.46], DUNE_N = [0.50, 0.41, 0.29];
      const SEAT = [0.16, 0.16, 0.19], STEEL = [0.13, 0.13, 0.16], PALE = [0.92, 0.92, 0.88];
      const FLOOD = [0.97, 0.97, 0.93], GREY = [0.42, 0.43, 0.47];
      const SKYLINE = [0.55, 0.70, 0.80];

      // ---- Floodlight tower: tall dark pole topped by a bright white lamp box.
      // The defining "Qatar night" motif — repeated densely around the lap. ----
      const floodTower = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.45, h, STEEL, 6, b);
        addBox(out, vadd(a.c, a.u, h - 1), [5.0, 1.6, 1.8], FLOOD, b);   // lamp bank
        addBox(out, vadd(a.c, a.u, h + 1.2), [5.0, 0.5, 1.8], FLOOD, b); // upper lit edge
      };

      // ---- Low rounded sand dune: a smooth tan wedge (no snow). ----
      const dune = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addFrustum(out, a.c, w * 0.6, w * 0.26, h, DUNE, 7, b);
        addFrustum(out, vadd(a.c, a.u, h * 0.5), w * 0.34, w * 0.08, h * 0.55, DUNE_N, 7, b);
      };

      // ---- Distant low desert dune ridges, pushed well out as a soft skyline. ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 26))) {
        for (const side of [-1, 1]) {
          backdrop(k, side, 380 + hash(k * 7 + side) * 200, [280, 9 + hash(k * 3 + side) * 7, 280], DUNE_N);
        }
      }

      // ================= START / FINISH STRAIGHT =================
      // Pit building (L, close): very long low white slab + thin glass stripe.
      building(K(0.00), -1, 16, 150, 11, 14, { wall: PALE, window: [0.30, 0.34, 0.40], floor: 4 });
      wall(0.97, 0.05, -1, 3, 1.0, [0.85, 0.85, 0.85]);  // pit wall

      // Main Grandstand (R, close): the hero — long smooth pale crescent stepped
      // slab. Built as a chain of overlapping curved sections sweeping the straight.
      (function crescentStand() {
        for (let i = 0; i < 7; i++) {
          const s = 0.965 + i * 0.012;
          grandstand(s % 1, 1, 16, 46, [0.80, 0.80, 0.76], SEAT);  // pale curved shell
        }
        // pale curved roof fascia lifted above, reading as one smooth crescent
        for (let i = 0; i < 7; i++) {
          const a = anchor(K((0.965 + i * 0.012) % 1), 1, 21), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 22), [16, 2.4, 50], PALE, b);
        }
      })();

      // Start/finish floodlight towers, both sides.
      floodTower(K(0.00), -1, 40, 32);
      floodTower(K(0.00), 1, 40, 32);
      floodTower(K(0.02), -1, 40, 32);

      // ================= TURN 1 — NORTH GRANDSTAND (s 0.06, R) =================
      grandstand(0.06, 1, 22, 90, GREY, SEAT);
      floodTower(K(0.06), 1, 34, 30);

      // ================= PALM CLUSTER (s 0.10, L far) =================
      for (let i = 0; i < 6; i++) {
        const k = (K(0.10) + i * Math.round(n * 0.006)) % n;
        palm(k, -1, 40 + hash(k * 5) * 28, 7 + hash(k * 9) * 3, [0.14, 0.30, 0.14]);
      }

      // ================= T2/T3 PAIRED GRANDSTANDS (s 0.18, R) =================
      grandstand(0.175, 1, 24, 50, GREY, SEAT);
      grandstand(0.195, 1, 24, 50, GREY, SEAT);
      floodTower(K(0.18), -1, 34, 30);

      // ================= LOW SAND DUNES (s 0.28, L far) =================
      for (let i = 0; i < 6; i++) {
        const k = (K(0.28) + i * Math.round(n * 0.008)) % n;
        dune(k, -1, 56 + i * 16, 44 + hash(k) * 30, 3 + hash(k * 5) * 3);
      }

      // ================= TURNS 4-6 SWEEP — open desert flats (s 0.40, both) ===
      for (let i = 0; i < 5; i++) {
        const k = (K(0.38) + i * Math.round(n * 0.01)) % n;
        for (const side of [-1, 1]) dune(k, side, 90 + i * 22, 50, 3);
      }
      floodTower(K(0.42), 1, 36, 30);

      // ================= DISTANT LUSAIL / DOHA SKYLINE (s 0.52, L far) =========
      // Thin pale tower silhouettes low on the horizon, behind the dune ring.
      (function skyline() {
        for (let i = 0; i < 14; i++) {
          const off = (i - 7) * 26 + hash(i * 11) * 10;
          const a = anchor(K(0.52), -1, 540 + hash(i * 5) * 120);
          const c = vadd(a.c, a.r, off), b = [a.r, a.u, a.t];
          const h = 30 + hash(i * 7) * 90;
          addBox(out, c, [7 + hash(i * 3) * 6, h, 7], SKYLINE, b);
          addBox(out, vadd(c, a.u, h * 0.5), [2, 6, 2], FLOOD, b);  // beacon
        }
      })();

      // ================= MARSHAL / TIMING HUTS (s 0.62, R mid) =================
      for (let i = 0; i < 3; i++) {
        place((K(0.62) + i * 2) % n, 1, 26 + i * 5, [4, 4, 5], PALE);
      }
      floodTower(K(0.62), 1, 34, 30);

      // ================= REPEATING MASTS + CATCH FENCE (s 0.74, both) =========
      fence(0.70, 0.80, 1, 6, 3.2, [0.66, 0.68, 0.72]);
      fence(0.70, 0.80, -1, 6, 3.2, [0.66, 0.68, 0.72]);
      floodTower(K(0.72), -1, 34, 30);
      floodTower(K(0.76), 1, 34, 30);

      // ================= SPARSE PALM ROW + SAND FLATS (s 0.86, L far) =========
      for (let i = 0; i < 7; i++) {
        const k = (K(0.84) + i * Math.round(n * 0.007)) % n;
        palm(k, -1, 34 + i * 8, 6 + hash(k * 3) * 4, [0.14, 0.30, 0.14]);
      }

      // ================= TURN 16 GRANDSTAND + PIT ENTRY (s 0.95, R) ===========
      grandstand(0.95, 1, 18, 70, GREY, SEAT);
      floodTower(K(0.95), 1, 34, 30);

      // ---- Sparse scattered palms behind the runoff (desert planting). ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 30))) {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) > 0.5) continue;
          palm(k, side, 22 + hash(k * 19 + side) * 22, 6 + hash(k * 23 + side) * 4, [0.14, 0.30, 0.14]);
        }
      }

      // ---- Roaming floodlight towers ringing the circuit — night-race glow. ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 16))) {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        floodTower(k, side, 40 + hash(k * 11) * 16, 28 + hash(k * 13) * 5);
      }
    },
  }
  );
})();
