/* Apex 26 — BAHRAIN circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "bahrain",
    name: "BAHRAIN",
    gp: "Bahrain GP",
    country: "Bahrain",
    night: true,
    theme: "desert",
    lengthKm: 5.4,
    baseHW: 7,
    pal: { horizon: [0.1, 0.07, 0.1], concrete: [0.27, 0.26, 0.25], runoff: [0.24, 0.23, 0.22], grass: [0.19, 0.17, 0.14] },
    segs: [
      { t: 0, l: 520 }, { t: 90, l: 100 }, { t: -40, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 240 }, { t: 80, l: 100 },
      { t: -30, l: 80 }, { t: 70, l: 100 }, { t: 0, l: 300 }, { t: 60, l: 90 }, { t: 0, l: 120 }, { t: 60, l: 110 },
    ],
    // Gentle mid-lap dip — the real circuit drops ~15 m below its high point.
    elevations: [{ s: 0.45, halfM: 340, rise: -7 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, vadd,
        place, prop, backdrop, anchor, addBox, addCyl, addFrustum,
        palm, grandstand, building, tower, billboard, gantry, marshalPost,
        fence, wall } = api;
      const K = (s) => Math.round(s * n) % n;

      // Palettes from the brief
      const SAND = [0.62, 0.50, 0.34], DUNE = [0.74, 0.62, 0.44], DUNE_N = [0.46, 0.39, 0.28];
      const CONC = [0.66, 0.66, 0.62], SEAT = [0.18, 0.18, 0.21], STEEL = [0.16, 0.16, 0.19];
      const FLOOD = [0.95, 0.95, 0.88], TOWER_PALE = [0.85, 0.85, 0.80];

      // ---- Distant desert horizon: low warm dune ridges, pushed well out so
      // they form a soft skyline rather than walling in the night track. ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 28))) {
        for (const side of [-1, 1]) {
          backdrop(k, side, 360 + hash(k * 7 + side) * 220, [260, 11 + hash(k * 3 + side) * 8, 260], DUNE_N);
        }
      }

      // ---- A floodlit mast: dark pole + a bright lamp cap box. ----
      const floodMast = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.4, h, STEEL, 6, b);
        addBox(out, vadd(a.c, a.u, h), [4.2, 1.4, 1.6], FLOOD, b);   // lamp bank cap
      };

      // ---- Sculpted artificial dunes: low rounded tan wedges near the track. ----
      const duneWedge = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addFrustum(out, a.c, w * 0.6, w * 0.28, h, DUNE, 7, b);
      };

      // ================= START / FINISH =================
      // Pit/control building: long low white box (L, close)
      building(K(0.00), -1, 16, 70, 12, 14, { wall: [0.90, 0.90, 0.88], window: [0.30, 0.34, 0.40], floor: 4 });
      // Pit wall + start gantry
      wall(0.97, 0.04, -1, 3, 1.1, [0.85, 0.85, 0.85]);
      gantry(0.005, 8.5, STEEL);
      // Main Grandstand: stepped grey slab (R, close)
      grandstand(0.00, 1, 16, 130, [0.42, 0.43, 0.47], SEAT);
      grandstand(0.985, 1, 18, 70, [0.42, 0.43, 0.47], SEAT);

      // Sakhir Tower: tall pale curved "sail" tower (L, far) — the hero silhouette.
      (function sakhirTower() {
        const a = anchor(K(0.005), -1, 46), b = [a.r, a.u, a.t];
        // tapered concrete shaft
        addFrustum(out, a.c, 6.5, 4.0, 58, TOWER_PALE, 10, b);
        // leaning "sail" fins flanking the shaft
        for (const o of [-7, 7]) {
          addBox(out, vadd(vadd(a.c, a.r, o), a.u, 28), [2.2, 52, 5.5], [0.80, 0.80, 0.74], b);
        }
        // lit crown
        addBox(out, vadd(a.c, a.u, 58), [9, 4, 9], FLOOD, b);
        addBox(out, vadd(a.c, a.u, 62), [3, 6, 3], [0.90, 0.40, 0.08], b);
      })();

      // ================= TURN 1 (s 0.05) =================
      grandstand(0.05, 1, 22, 80, [0.40, 0.41, 0.46], [0.16, 0.24, 0.42]);  // blue-trim seating
      floodMast(K(0.05), 1, 30, 26);
      billboard(K(0.07), -1, 8, 14, 4, [0.85, 0.12, 0.12]);

      // ================= UNIVERSITY GRANDSTAND (triple, s 0.18) =================
      for (const dz of [-44, 0, 44]) {
        const k = (K(0.18) + Math.round(dz)) % n;
        grandstand(k / n, 1, 24, 40, [0.43, 0.44, 0.49], SEAT);
      }

      // ================= FLOODLIGHT MASTS (s 0.20, both) =================
      floodMast(K(0.20), -1, 28, 25);
      floodMast(K(0.20), 1, 28, 25);

      // ================= SCULPTED DUNES (s 0.30, L far) =================
      for (let i = 0; i < 5; i++) {
        const k = (K(0.28) + i * Math.round(n * 0.01)) % n;
        duneWedge(k, -1, 60 + i * 14, 40 + hash(k) * 30, 4 + hash(k * 5) * 3);
      }

      // ================= TURN 8 HAIRPIN (s 0.42, R) =================
      grandstand(0.42, 1, 20, 60, [0.41, 0.42, 0.46], SEAT);   // low grey arc
      floodMast(K(0.42), 1, 32, 24);

      // ================= OPEN DESERT FLATS (s 0.50, both far) =================
      for (let i = 0; i < 4; i++) {
        const k = (K(0.48) + i * Math.round(n * 0.012)) % n;
        for (const side of [-1, 1]) duneWedge(k, side, 90 + i * 20, 50, 3.5);
      }

      // ================= MARSHAL / TIMING HUTS (s 0.62, L far) =================
      for (let i = 0; i < 3; i++) {
        const k = (K(0.60) + i * 3) % n;
        marshalPost(k, -1, 26 + i * 4);
      }
      place(K(0.62), -1, 34, [4, 4, 5], [0.92, 0.92, 0.88]);   // small white cube

      // ================= BACK STRAIGHT (s 0.80, R) =================
      fence(0.76, 0.86, 1, 6, 3.2, [0.70, 0.72, 0.76]);        // catch fence
      floodMast(K(0.78), 1, 30, 26);
      floodMast(K(0.83), 1, 30, 26);
      grandstand(0.80, 1, 22, 70, [0.40, 0.41, 0.46], SEAT);

      // ================= PIT ENTRY (s 0.95, L) =================
      building(K(0.95), -1, 18, 50, 8, 12, { wall: [0.78, 0.78, 0.76], window: [0.26, 0.30, 0.36], floor: 4 });
      wall(0.92, 0.99, -1, 4, 1.0, [0.85, 0.85, 0.85]);

      // ---- Sparse desert palms scattered behind the runoff (oasis planting). ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 36))) {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) > 0.55) continue;
          const d = 16 + hash(k * 19 + side) * 24;
          palm(k, side, d, 7 + hash(k * 23 + side) * 4, [0.16, 0.34, 0.14]);
        }
      }

      // ---- Roaming floodlight masts to sell the night-race lighting. ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 14))) {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        floodMast(k, side, 36 + hash(k * 11) * 18, 24 + hash(k * 13) * 4);
      }
    },
  }
  );
})();
