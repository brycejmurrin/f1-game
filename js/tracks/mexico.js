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
    pal: { zenith: [0.24, 0.48, 0.88], horizon: [0.74, 0.78, 0.82], grass: [0.28, 0.42, 0.18], runoff: [0.52, 0.38, 0.24], fogDensity: 0.001, sunDir: [0.24111167647565865, 0.8639835073711102, 0.44203807353870755], sun: [1, 0.98, 0.88], sunColor: [1, 0.96, 0.86] },
    segs: [
      { t: 0, l: 300 }, { t: -90, l: 100 }, { t: 80, l: 90 }, { t: 0, l: 250 }, { t: 90, l: 100 }, { t: 0, l: 500 },
      { t: -60, l: 80 }, { t: 60, l: 70 }, { t: 0, l: 200 }, { t: 90, l: 100 }, { t: -130, l: 120 },
    ],
    // Stadium section: dips into the baseball/football stadium complex (Foro Sol)
    // then climbs back out through the banked Peraltada run — ~12 m real change.
    elevations: [{ s: 0.62, halfM: 260, rise: -7 }, { s: 0.74, halfM: 220, rise: 5 }],
    scenery: function (api) {
      const { out, n, place, backdrop, groundPlane,
              addBox, addCyl, every, onTrack, hash, vadd, anchor, along,
              building, grandstand, billboard, tree, hedge, fence } = api;
      const K = (s) => Math.round(s * n) % n;

      // Festive Mexican palette
      const PINK = [0.92, 0.28, 0.55], ORANGE = [0.98, 0.55, 0.12], GREEN = [0.10, 0.55, 0.30];
      const SEATS = [0.46, 0.47, 0.52], CONCRETE = [0.72, 0.71, 0.68];
      const TREEGRN = [0.22, 0.40, 0.20], PARKGRN = [0.34, 0.52, 0.26];
      const fiesta = [PINK, ORANGE, GREEN, [0.98, 0.82, 0.10]];

      // Papel-picado / banner trim along a stand front (k,side, gap, length)
      const banners = (s, side, gap) => {
        const k = K(s);
        for (let i = -2; i <= 2; i++) {
          const kk = (k + i + n) % n;
          place(kk, side, gap, [0.4, 1.1, 6], fiesta[(kk + (i & 1)) % 4]);
        }
      };

      // --- s=0.00 R near: main grandstand, tall stepped, festive banner trim ---
      grandstand(0.00, 1, 9, 120, SEATS, PINK);
      grandstand(0.00, 1, 24, 120, CONCRETE, GREEN);   // packed second tier behind
      banners(0.00, 1, 8);
      grandstand(0.99, 1, 9, 70, SEATS, ORANGE);   // final-corner stand feeding main straight
      grandstand(0.97, 1, 24, 80, CONCRETE, PINK);

      // --- s=0.02 L near: pit/paddock block, low wide white flat-roof slab ---
      building(K(0.02), -1, 2, 16, 12, 60, { wall: [0.90, 0.90, 0.92],
               window: [0.30, 0.38, 0.44], floor: 3 });
      place(K(0.02), -1, 10, [17, 0.8, 60], [0.82, 0.82, 0.84]);   // flat roof slab

      // --- s=0.06 R far: park tree line along the long straight (denser) ---
      hedge(0.04, 0.11, 1, 26, 3.0, TREEGRN);
      for (const s of [0.04, 0.055, 0.07, 0.085, 0.10, 0.115]) {
        const k = K(s);
        tree(k, 1, 30 + hash(k) * 18, 9 + hash(k * 3) * 5, TREEGRN);
        tree(k, 1, 50 + hash(k * 5) * 18, 8 + hash(k * 7) * 5, [0.26, 0.44, 0.22]);
        tree(k, 1, 72 + hash(k * 9) * 20, 8 + hash(k * 11) * 4, TREEGRN);
      }

      // --- s=0.12 R near: Turn 1 grandstand + bold red/white kerb ---
      grandstand(0.12, 1, 9, 80, SEATS, GREEN);
      grandstand(0.12, 1, 24, 80, CONCRETE, ORANGE);   // packed back tier at Turn 1
      const kerb = (s, side, len) => {
        const k = K(s);
        place(k, side, 2, [0.5, 0.16, len], [0.82, 0.16, 0.16]);
        place(k, side, 3.4, [2.6, 0.16, len], [0.94, 0.94, 0.94]);
      };
      kerb(0.12, 1, 9); kerb(0.115, -1, 8);

      // --- s=0.20 both mid: Moises Solana esses, low thin seating boxes ---
      for (const side of [-1, 1]) {
        grandstand(0.20, side, 8, 48, [0.50, 0.50, 0.54], side < 0 ? ORANGE : PINK);
      }
      kerb(0.20, -1, 7); kerb(0.205, 1, 7);

      // --- CONTINUOUS Mexico City skyline: an unbroken band of building()s
      //     wrapping the far side of the lap. Two depth ranks (front + back) laid
      //     node-by-node so there are no gaps. ---
      const cityBand = (s0, s1, side, step) => {
        along(s0, s1, step, (k) => {
          for (let c = 0; c < 2; c++) {                 // two staggered depth ranks
            const d = (c === 0 ? 150 : 210) + hash(k * 72 + c) * 60 + (k & 1) * 10;
            const p = anchor(k, side, d);
            if (onTrack(p.c[0], p.c[2], 12)) continue;
            const tone = 0.60 + hash(k * 73 + c) * 0.16;
            const h = 26 + hash(k * 74 + c) * 60, w = 12 + hash(k * 75 + c) * 12;
            building(k, side, d - w / 2, w, h, w, { wall: [tone, tone * 0.97, tone * 0.92],
                     window: [tone * 0.66, tone * 0.70, tone * 0.74], floor: 6 });
          }
        });
      };
      // Far side (-1) wraps the long bend through Solana / city / park / lucha.
      cityBand(0.22, 0.50, -1, 26);
      cityBand(0.58, 0.72, -1, 26);
      // Right side fills the far rank opposite the stadium / final sector.
      cityBand(0.30, 0.46, 1, 30);

      // --- s=0.42 R near: Horquilla hairpin, grey runoff, kerb, small fan stand ---
      groundPlane(K(0.42), 1, 5, [60, 1.0, 50], [0.40, 0.40, 0.43]);   // grey runoff
      kerb(0.42, 1, 10);
      grandstand(0.42, 1, 7, 40, [0.50, 0.50, 0.54], ORANGE);
      banners(0.42, 1, 6);

      // --- s=0.55 both mid: park greenery + sports facility low boxes ---
      groundPlane(K(0.55), -1, 24, [180, 1.0, 140], PARKGRN);
      for (const s of [0.515, 0.535, 0.55, 0.565, 0.585]) {
        const k = K(s);
        building(k, -1, 29 + hash(k) * 30, 22, 8 + hash(k * 3) * 4, 18, { wall: [0.86, 0.86, 0.84],
                 window: [0.40, 0.46, 0.50], floor: 2 });
        tree(k, 1, 28 + hash(k * 5) * 20, 8 + hash(k * 7) * 4, TREEGRN);
        tree(k, 1, 48 + hash(k * 13) * 18, 7 + hash(k * 17) * 4, PARKGRN);
      }

      // --- s=0.66 R far: lucha-libre tribute statue (masked wrestler box on plinth) ---
      {
        const k = K(0.66), d = 36;
        const p = anchor(k, 1, d);
        addBox(out, vadd(p.c, p.u, 1.5), [4, 3, 4], [0.55, 0.55, 0.58], [p.r, p.u, p.t]);  // plinth
        addBox(out, vadd(p.c, p.u, 6), [2.2, 6, 1.6], [0.30, 0.42, 0.85], [p.r, p.u, p.t]); // body (blue suit)
        addBox(out, vadd(p.c, p.u, 9.6), [1.6, 1.6, 1.6], [0.95, 0.20, 0.30], [p.r, p.u, p.t]); // masked head (red)
        place(k, 1, d - 4, [3, 0.2, 6], ORANGE);   // accent base
      }

      // ====== HERO: FORO SOL BASEBALL STADIUM (s≈0.74–0.88) ======
      // Two tall curved concrete bowls hugging the slow section, packed with fans.
      const stadiumBowl = (s, side) => {
        const k = K(s);
        // outer concrete shell, tall and long, on both halves of the corridor
        for (let i = -3; i <= 3; i++) {
          const kk = (k + i + n) % n;
          // tiered shell: 2 raked layers of concrete
          for (let t = 0; t < 2; t++) {
            const pp = anchor(kk, side, 14 + t * 6);
            addBox(out, vadd(pp.c, pp.u, 7 + t * 8), [12, 14, 13], CONCRETE, [pp.r, pp.u, pp.t]);
          }
          // crowd speckle: fan-colour seat rows facing the track
          for (let t = 0; t < 2; t++) {
            const seatP = anchor(kk, side, 11 + t * 5);
            const col = fiesta[(kk * 3 + t + (i & 3)) % 4];
            addBox(out, vadd(seatP.c, seatP.u, 5 + t * 8), [11, 4, 11],
                   hash(kk * 13 + t) > 0.45 ? col : SEATS, [seatP.r, seatP.u, seatP.t]);
          }
        }
      };
      // densely wrap the slow section: overlapping bowls leave no gaps
      stadiumBowl(0.755, -1); stadiumBowl(0.755, 1);
      stadiumBowl(0.795, -1); stadiumBowl(0.795, 1);
      stadiumBowl(0.835, -1); stadiumBowl(0.835, 1);
      // festive banners ringing the stadium rim
      banners(0.74, -1, 10); banners(0.74, 1, 10);
      banners(0.79, -1, 10); banners(0.79, 1, 10);
      banners(0.84, -1, 10); banners(0.84, 1, 10);
      kerb(0.78, -1, 8); kerb(0.80, 1, 8);

      // --- s=0.88 L near: Foro Sol exit gap, bright opening between bowls ---
      place(K(0.88), -1, 12, [10, 14, 6], [0.98, 0.94, 0.80]);   // bright opening
      billboard(K(0.88), 1, 8, 12, 5, fiesta[1]);

      // --- s=0.92 R near: Peraltada / Estadio stand on faint banked edge ---
      grandstand(0.92, 1, 9, 100, SEATS, PINK);
      grandstand(0.92, 1, 24, 100, CONCRETE, GREEN);   // packed Peraltada back tier
      banners(0.92, 1, 8);
      // faint banked kerb edge through the Peraltada/Estadio corners
      for (const s of [0.90, 0.93, 0.96]) {
        const k = K(s);
        place(k, 1, 2.5, [2.0, 0.5, 8], [0.78, 0.74, 0.70]);   // low banked kerb edge
        place(k, 1, 2, [0.5, 0.14, 8], [0.82, 0.16, 0.16]);
      }

      // --- Catch fence + scattered park trees & festive flags around the lap ---
      fence(0.10, 0.16, 1, 6, 3.2, [0.80, 0.82, 0.84]);
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
      // flag poles with festive flags
      every(60, (k) => {
        const side = hash(k * 31) > 0.5 ? 1 : -1, d = 14 + hash(k * 32) * 8;
        const p = anchor(k, side, d);
        if (onTrack(p.c[0], p.c[2], 8)) return;
        addCyl(out, p.c, 0.18, 9, [0.85, 0.85, 0.85], 5, [p.r, p.u, p.t]);
        addBox(out, vadd(p.c, p.u, 8), [2.4, 1.4, 0.2], fiesta[k % 4], [p.r, p.u, p.t]);
      });

      // --- Distant hazed skyline ring: CONTINUOUS pale city band (no gaps) ---
      every(40, (k) => {
        for (const side of [-1, 1]) {
          const d = 340 + hash(k * 82 + side) * 90 + (k & 1) * 18;
          backdrop(k, side, d,
                   [92, 24 + hash(k * 83 + side) * 26, 40], [0.66, 0.68, 0.70]);
        }
      });
    },
  }
  );
})();
